-- ═════════════════════════════════════════════════════════════════════
-- section `experiments` (§EX) — CP-6 B30 part `experiments` (2026-10-02): the B30 carryovers of F-P5-06 and F-P5-07.
--
--   §EX.1  THE VOCABULARY: experiments.state gains `retired`; experiment_events gains `retired`, `stopped_unstable`, `paused_unstable`,
--          `adapter_quarantined`, `review_routed` and `policy_set`; the experiment's ON-UNSTABLE policy (stop | pause | none, DEFAULT none —
--          every B31 experiment and fixture keeps its ledger) and its retirement record.
--   §EX.2  CHUNKED METHOD-FABRIC EXPERIMENTS (L8-C06, PR-35-001): simulation.sio_chunkable_methods() re-declared (0099:971, copied whole) —
--          discrete-event@1, counterfactual@1 and war-gaming@1 join supply-flow@1. A chunk of a fabric method runs path s of the run's
--          stored contract through the method's adapter seeded with `seed ^ imul(s + 1, 0x9e3779b1)` (the per-path stream of supply-flow@1,
--          applied per adapter), out of process; each path's measures are the method's summary PROJECTED onto the experiment measures
--          (rule fabric-measures@1, stated in apps/api/src/twin/simulations/fabric/fabric-plan.ts). system-dynamics@1 and optimisation@1
--          draw nothing (no per-path stream: every path would be the same) and agent-based@1 reports none of the experiment measures —
--          they stay outside the list.
--   §EX.3  THE CHECKPOINT INDICATORS ACTED ON (V03-T-354, ES-38-007, ES-38-009, V04-T-034): simulation.record_experiment_chunk re-declared
--          (0099:1469, copied whole). An UNSTABLE numerical-stability indicator, or a VIOLATED / INDETERMINATE constraint indicator, at a
--          checkpoint is ACTED ON per the experiment's declared policy (rule sxp-unstable@1): `stop` → the experiment stops (partial,
--          reason unstable; stopped_unstable); `pause` → it pauses (paused_unstable; an operator resumes it); a FAULT-SHAPED instability
--          (the running mean diverging: moved more than half since a previous checkpoint of at least 30 paths) QUARANTINES a contained
--          adapter (adapter_quarantined) and then STOPS the experiment under either policy (supply-flow@1 runs in process and is never
--          quarantined); a review is ROUTED
--          (simulation.checkpoint → the declarer and the method stewards; review_routed). Policy `none`: B31's behaviour, unchanged.
--          simulation.set_unstable_policy (simulation.experiment.policy) sets the policy before approval; simulation.quarantine_adapter
--          (simulation.adapter.quarantine) is a method steward's quarantine on demand.
--   §EX.4  RETIREMENT (PR-35-001): simulation.retire_run (simulation.retirement.run) writes the prelude's runs_current.retired_* columns,
--          simulation.retire_experiment (simulation.retirement.experiment) retires a finished experiment and its run; each with its REASON
--          and its REACH (the packages whose options cite the run, the dependent analyses, sweeps and validations, the runs that name it
--          as their control or correct it, the experiment that produced it) recorded in simulation.retirements; the owners of the reached
--          packages told (simulation.validity). A retired run is no longer analysed (impact analyses, sweeps, validations) nor taken as an
--          intervention run's control (BEFORE INSERT gates). §EN's run_decision_use reads the columns.
--   §EX.5  NONLINEAR RESPONSE ACROSS THE ENVELOPE (V02-T-167): simulation.envelope_sweeps — per factor a grid across the behaviour model's
--          operating-envelope range on the deterministic trajectory, the response curve, its nonlinearity and curvature, the thresholds
--          (onset, saturation, kink), and the TWO-FACTOR interactions (hidden dependencies); simulation.sweep_envelope (simulation.sweep.run)
--          re-checks the grid against the envelope and recomputes every nonlinearity index and interaction (rule sxp-sweep@1).
--   §EX.6  RARE EVENTS, MODEL DISCREPANCY, BENCHMARK VALIDATION, CONVERGENCE OUTSIDE AN EXPERIMENT (AI-50-004):
--          simulation.benchmark_validations — a run's paths against an observed (evidence cited) or benchmark (basis stated) sample of the
--          same measure: the bias, the two-sample Kolmogorov–Smirnov distance and its critical value, the tail / rare-event coverage, and
--          the running-mean convergence over the path count; simulation.validate_benchmark (simulation.benchmark.validate) recomputes the
--          means, the bias, the KS distance and the tail frequencies from the stored paths (rule sxp-benchmark@1).
--
-- The exact run-event vocabulary (simulation.run_events) is NOT widened (an on-demand or unstable quarantine announces the existing
-- adapter.quarantined on the experiment's run); no outbox event type is added; the interface register stays 50/0/0. Every figure a
-- harness or the demonstration seeds is SYNTHETIC.
-- ═════════════════════════════════════════════════════════════════════

-- §EX.1 THE VOCABULARY ─────────────────────────────────────────────────
ALTER TABLE simulation.experiments DROP CONSTRAINT experiments_state_check;
ALTER TABLE simulation.experiments ADD CONSTRAINT experiments_state_check
  CHECK (state IN ('declared', 'approved', 'running', 'paused', 'completed', 'partial', 'failed', 'cancelled', /* B30 experiments */ 'retired'));
ALTER TABLE simulation.experiments DROP CONSTRAINT sio_finished_bound;
ALTER TABLE simulation.experiments ADD CONSTRAINT sio_finished_bound
  CHECK ((state IN ('completed', 'partial', 'failed', 'cancelled', /* B30 experiments */ 'retired')) = (finished_at IS NOT NULL));
/* THE ON-UNSTABLE POLICY (what a checkpoint whose indicator is unstable, violated or indeterminate does to the experiment): none (B31's —
   recorded, not acted on), stop or pause. Set before the budget's approval (simulation.set_unstable_policy). */
ALTER TABLE simulation.experiments ADD COLUMN on_unstable text NOT NULL DEFAULT 'none';
ALTER TABLE simulation.experiments ADD CONSTRAINT sxp_on_unstable CHECK (on_unstable IN ('stop', 'pause', 'none'));
/* THE RETIREMENT of a finished experiment: {prior_state, reason, retired_by, retired_at, run_retired, retirement_id}. */
ALTER TABLE simulation.experiments ADD COLUMN retirement jsonb;
ALTER TABLE simulation.experiments ADD CONSTRAINT sxp_retired_bound CHECK ((state = 'retired') = (retirement IS NOT NULL));
ALTER TABLE simulation.experiment_events DROP CONSTRAINT experiment_events_event_check;
ALTER TABLE simulation.experiment_events ADD CONSTRAINT experiment_events_event_check
  CHECK (event IN ('declared', 'approved', 'admission_refused', 'started', 'run_opened', 'checkpointed', 'chunk_failed', 'chunk_reclaimed',
                   'paused', 'resumed', 'budget_exceeded', 'converged', 'completed', 'partial', 'failed', 'cancelled',
                   /* B30 experiments */ 'retired', 'stopped_unstable', 'paused_unstable', 'adapter_quarantined', 'review_routed', 'policy_set'));

-- §EX.2 THE CHUNKABLE METHODS ───────────────────────────────────────────
/* 0099:971, copied whole — B30 experiments: the method fabric's seeded methods whose chunks are deterministic per seed offset (a seeded
   per-path stream per adapter). The TS mirror is experiment-plan.ts CHUNKABLE_METHODS (its B30 block). */
CREATE OR REPLACE FUNCTION simulation.sio_chunkable_methods() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY['supply-flow@1', /* B30 experiments */ 'discrete-event@1', 'counterfactual@1', 'war-gaming@1'] $$;

-- §EX.3 THE CHECKPOINT INDICATORS ACTED ON ──────────────────────────────
/* The aggregate of a FABRIC chunk, computed HERE from its paths: per declared measure over the paths that carry it ({n, sum, sumsq, min,
   max}; n counts the paths with a value). supply-flow@1's chunks keep simulation.sio_chunk_aggregate (B31's, unchanged). */
CREATE OR REPLACE FUNCTION simulation.sxp_chunk_aggregate(p_totals jsonb, p_measures text[]) RETURNS jsonb LANGUAGE sql IMMUTABLE
SET search_path = simulation, pg_catalog, pg_temp AS $$
  SELECT coalesce(jsonb_object_agg(m, (
           SELECT jsonb_build_object('n', count(q.v), 'sum', coalesce(sum(q.v), 0), 'sumsq', coalesce(sum(q.v * q.v), 0), 'min', min(q.v), 'max', max(q.v))
             FROM (SELECT CASE WHEN m = 'total_cost' THEN (t -> 'cost' ->> 'total')::numeric ELSE (t ->> m)::numeric END AS v FROM jsonb_array_elements(p_totals) t) q)), '{}'::jsonb)
    FROM unnest(p_measures) m
$$;

/* THE READING of a checkpoint (rule sxp-unstable@1): ACTED ON when a declared measure's numerical stability is `unstable` (sio-stability@1:
   the 95% half-width above 5% of the mean, or the mean moved more than 2% since the previous checkpoint, at 30 paths or more), or when the
   constraint indicator is `violated` or `indeterminate`. FAULT-SHAPED when an unstable measure DIVERGES — its mean moved more than half
   since a previous checkpoint that already held 30 paths: a solver behaving like a fault, not sampling noise. `indeterminate` stability
   (below 30 paths) is never acted on. The TS mirror is fabric-plan.ts unstableReading (the unit test pins both on the same cases). */
CREATE OR REPLACE FUNCTION simulation.sxp_unstable_reading(p_stability jsonb, p_constraint jsonb, p_previous jsonb) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE
SET search_path = simulation, pg_catalog, pg_temp AS $$
DECLARE m text; s jsonb; v_reasons jsonb := '[]'::jsonb; v_div jsonb := '[]'::jsonb; v_unstable jsonb := '[]'::jsonb; v_cc text := coalesce(p_constraint ->> 'outcome', 'not_applicable');
BEGIN
  FOR m, s IN SELECT key, value FROM jsonb_each(coalesce(p_stability, '{}'::jsonb)) ORDER BY key LOOP
    IF s ->> 'state' = 'unstable' THEN
      v_unstable := v_unstable || to_jsonb(m);
      v_reasons := v_reasons || to_jsonb(format('numerical_stability: %s is unstable (95%% half-width %s of the mean, the mean moved %s since the previous checkpoint, %s paths)',
                                                m, coalesce(s ->> 'relative_half_width', '?'), coalesce(s ->> 'change_since_previous', 'n/a'), coalesce(s ->> 'n', '0')));
      IF (s ->> 'change_since_previous') IS NOT NULL AND (s ->> 'change_since_previous')::numeric > 0.5
         AND coalesce((p_previous -> m ->> 'n')::numeric, 0) >= 30 THEN
        v_div := v_div || jsonb_build_object('measure', m, 'change_since_previous', (s ->> 'change_since_previous')::numeric, 'previous_paths', (p_previous -> m ->> 'n')::numeric);
      END IF;
    END IF;
  END LOOP;
  IF v_cc IN ('violated', 'indeterminate') THEN
    v_reasons := v_reasons || to_jsonb(format('constraint_satisfaction: the run''s latest constraint check is %s (%s stage, set %s)', v_cc, coalesce(p_constraint ->> 'stage', '?'), coalesce(p_constraint ->> 'set_id', 'none')));
  END IF;
  RETURN jsonb_build_object('acted', jsonb_array_length(v_reasons) > 0, 'reasons', v_reasons, 'unstable_measures', v_unstable, 'constraint', v_cc,
                            'fault_shaped', jsonb_array_length(v_div) > 0, 'divergence', v_div, 'rule', 'sxp-unstable@1');
END $$;

/* THE QUARANTINE of a contained adapter in this domain (private: the record port's on a fault-shaped instability, the steward's port on
   demand). A method that is not contained (supply-flow@1, isolated false) is never quarantined; an adapter already quarantined is left as
   it is. The adapter ledger's `quarantined` and, on a run, the existing run event adapter.quarantined; the reinstatement is B29's
   (a probe of the pinned implementation passing after this quarantine, a method steward — never the run's operator). */
CREATE OR REPLACE FUNCTION simulation.sxp_quarantine(p_tenant uuid, p_domain uuid, p_model_ref text, p_run_id uuid, p_kind text, p_message text, p_details jsonb, p_actor uuid, p_correlation uuid)
RETURNS jsonb SECURITY DEFINER SET search_path = simulation, twin, pg_catalog, pg_temp AS $$
DECLARE m twin.behaviour_models%ROWTYPE; h simulation.adapter_health%ROWTYPE; v_at timestamptz := clock_timestamp(); v_fault jsonb; v_operator uuid;
BEGIN
  SELECT * INTO m FROM twin.behaviour_models WHERE method_ref = p_model_ref;
  IF NOT FOUND THEN RETURN jsonb_build_object('quarantined', false, 'reason', 'unknown_model', 'model_ref', p_model_ref); END IF;
  IF coalesce((m.containment ->> 'isolated')::boolean, false) IS NOT TRUE THEN
    RETURN jsonb_build_object('quarantined', false, 'reason', 'not_contained', 'model_ref', p_model_ref, 'note', format('%s runs in process (containment.isolated false); it is never quarantined', p_model_ref));
  END IF;
  INSERT INTO simulation.adapter_health (scope, tenant_id, domain_id, model_ref) VALUES ('DOMAIN', p_tenant, p_domain, p_model_ref) ON CONFLICT DO NOTHING;
  SELECT * INTO h FROM simulation.adapter_health WHERE tenant_id = p_tenant AND domain_id = p_domain AND model_ref = p_model_ref FOR UPDATE;
  IF h.state = 'quarantined' THEN RETURN jsonb_build_object('quarantined', false, 'reason', 'already_quarantined', 'model_ref', p_model_ref, 'quarantined_at', h.quarantined_at); END IF;
  IF p_run_id IS NOT NULL THEN SELECT r.operator_principal_id INTO v_operator FROM simulation.runs_current r WHERE r.run_id = p_run_id; END IF;
  v_fault := jsonb_build_object('kind', p_kind, 'message', left(p_message, 500), 'run_id', p_run_id, 'probe_id', NULL, 'at', v_at) || coalesce(p_details, '{}'::jsonb);
  UPDATE simulation.adapter_health SET state = 'quarantined', last_fault = v_fault, last_fault_at = v_at, last_fault_operator = v_operator, quarantined_at = v_at,
         quarantined_by_run = p_run_id, updated_at = v_at
   WHERE tenant_id = p_tenant AND domain_id = p_domain AND model_ref = p_model_ref;
  INSERT INTO simulation.adapter_events (event_id, scope, tenant_id, domain_id, model_ref, event, run_id, probe_id, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_model_ref, 'quarantined', p_run_id, NULL, p_actor,
          jsonb_build_object('cause', p_kind, 'last_fault', v_fault, 'consecutive_faults', h.consecutive_faults), p_correlation);
  IF p_run_id IS NOT NULL THEN
    INSERT INTO simulation.run_events (event_id, scope, tenant_id, domain_id, run_id, event, actor_principal_id, details, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_run_id, 'adapter.quarantined', p_actor, jsonb_build_object('model_ref', p_model_ref, 'cause', p_kind, 'message', left(p_message, 500)), p_correlation);
  END IF;
  RETURN jsonb_build_object('quarantined', true, 'model_ref', p_model_ref, 'quarantined_at', v_at, 'cause', p_kind, 'run_id', p_run_id);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION simulation.sxp_quarantine(uuid, uuid, text, uuid, text, text, jsonb, uuid, uuid) FROM PUBLIC;

/* 0099:1469, copied whole — B30 experiments: (1) a FABRIC chunk's aggregate is sxp_chunk_aggregate's (per declared measure over the paths that
   carry it); supply-flow@1's stays sio_chunk_aggregate's; (2) after the stop rules, a done chunk's checkpoint is READ (sxp_unstable_reading) and,
   under the experiment's policy (stop | pause — never under none, the B31 default), ACTED ON: stopped (partial, reason unstable) or paused when
   chunks are left and no other stop is pending; a fault-shaped instability quarantines a contained adapter; the review routed
   (simulation.checkpoint → the declarer, the method stewards). Everything else is B31's, unchanged. */
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
        /* B30 experiments */ v_read jsonb; v_q jsonb; v_act_ev uuid; v_actions jsonb := '[]'::jsonb;
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
    v_agg := CASE WHEN e.method_ref = 'supply-flow@1' THEN simulation.sio_chunk_aggregate(p_sample_totals)
                  ELSE /* B30 experiments: a fabric chunk */ simulation.sxp_chunk_aggregate(p_sample_totals, e.measures) END;
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
  -- B30 experiments: THE CHECKPOINT READ AND ACTED ON (rule sxp-unstable@1) — only under a declared policy (stop | pause); none is B31's
  IF p_outcome = 'done' AND e.on_unstable IN ('stop', 'pause') THEN
    v_read := simulation.sxp_unstable_reading(v_stab, v_ind -> 'constraint_satisfaction', CASE WHEN v_prev = '{}'::jsonb THEN NULL ELSE v_prev END);
    IF (v_read ->> 'acted')::boolean THEN
      -- a FAULT-SHAPED instability quarantines a contained adapter first; its experiment then STOPS whatever the policy (no further chunk of a
      -- quarantined adapter is executed for it)
      IF (v_read ->> 'fault_shaped')::boolean THEN
        v_q := simulation.sxp_quarantine(p_tenant, p_domain, e.method_ref, e.run_id, 'unstable',
                 format('experiment %s checkpoint %s: the running mean diverged (%s)', e.experiment_id, v_seq, v_read -> 'divergence'),
                 jsonb_build_object('experiment_id', e.experiment_id, 'checkpoint_seq', v_seq, 'divergence', v_read -> 'divergence'), p_actor, p_correlation);
        IF (v_q ->> 'quarantined')::boolean THEN
          PERFORM simulation.sio_event(e, 'adapter_quarantined', p_actor, jsonb_build_object('seq', v_seq, 'model_ref', e.method_ref, 'divergence', v_read -> 'divergence', 'quarantine', v_q), p_correlation);
          v_actions := v_actions || to_jsonb('adapter_quarantined'::text);
        ELSE
          v_actions := v_actions || to_jsonb(format('adapter not quarantined (%s)', v_q ->> 'reason'));
        END IF;
      END IF;
      IF v_stop IS NULL AND v_left > 0 AND e.state = 'running' THEN
        IF e.on_unstable = 'stop' OR v_actions ? 'adapter_quarantined' THEN
          v_stop := jsonb_build_object('outcome', 'partial', 'reason', 'unstable');
          v_act_ev := simulation.sio_event(e, 'stopped_unstable', p_actor, jsonb_build_object('seq', v_seq, 'chunk_index', p_chunk_index, 'reading', v_read, 'policy', e.on_unstable,
                                                                                             'quarantined', v_actions ? 'adapter_quarantined',
                                                                                             'paths_done', (e.progress ->> 'paths_done')::int, 'chunks_left', v_left), p_correlation);
          v_actions := v_actions || to_jsonb('stopped'::text);
        ELSE
          UPDATE simulation.experiments SET state = 'paused' WHERE experiment_id = e.experiment_id RETURNING * INTO e;
          v_act_ev := simulation.sio_event(e, 'paused_unstable', p_actor, jsonb_build_object('seq', v_seq, 'chunk_index', p_chunk_index, 'reading', v_read, 'policy', 'pause',
                                                                                            'paths_done', (e.progress ->> 'paths_done')::int, 'chunks_left', v_left), p_correlation);
          v_actions := v_actions || to_jsonb('paused'::text);
        END IF;
      END IF;
      v_item := simulation.sio_notify(e, 'simulation.checkpoint', format('Simulation checkpoint %s of %s: %s', v_seq, e.title,
                                       CASE WHEN v_actions ? 'stopped' THEN 'stopped as unstable' WHEN v_actions ? 'paused' THEN 'paused as unstable' ELSE 'unstable indicator' END),
                  (v_read -> 'reasons') || jsonb_build_array(format('policy %s: %s', e.on_unstable, CASE WHEN jsonb_array_length(v_actions) = 0 THEN 'another stop was already pending (or no chunk is left); the review is routed' ELSE (SELECT string_agg(x, ', ') FROM jsonb_array_elements_text(v_actions) x) END)),
                  e.declared_by, ARRAY['method_steward'], coalesce(v_act_ev, p_event_id), 'experiment.checkpoint_unstable',
                  jsonb_build_object('kind', 'checkpoint_unstable', 'seq', v_seq, 'reading', v_read, 'actions', v_actions, 'policy', e.on_unstable), interval '24 hours', p_actor, p_correlation);
      PERFORM simulation.sio_event(e, 'review_routed', p_actor, jsonb_build_object('seq', v_seq, 'attention_item_id', v_item, 'routed_to', jsonb_build_object('owner', e.declared_by, 'roles', jsonb_build_array('method_steward')),
                                                                                   'actions', v_actions), p_correlation);
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

/* SET THE ON-UNSTABLE POLICY (simulation.experiment.policy — the declarer, the starter, a twin owner or the domain administrator, as an
   operator's act): stop | pause | none, with a reason, while the experiment is DECLARED — the approver approves the experiment as it will
   behave (a policy is never changed under a running experiment). policy_set records the previous and the new policy. */
CREATE OR REPLACE FUNCTION simulation.set_unstable_policy(p_experiment_id uuid, p_tenant uuid, p_domain uuid, p_policy text, p_reason text, p_actor uuid, p_event_id uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = simulation, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE e simulation.experiments%ROWTYPE; v_prev text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['simulation.experiment.policy']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM simulation.sio_assert_actor(p_actor);
  e := simulation.sio_lock(p_experiment_id, p_tenant, p_domain);
  PERFORM simulation.sio_assert_operator(e, p_actor, 'setting the unstable-checkpoint policy of');
  IF e.state <> 'declared' THEN
    RAISE EXCEPTION 'experiment rejected (state): experiment % is %; its unstable-checkpoint policy is set while it is declared, before its budget is approved', e.experiment_id, e.state USING ERRCODE = '2F002';
  END IF;
  IF p_policy IS NULL OR p_policy NOT IN ('stop', 'pause', 'none') THEN RAISE EXCEPTION 'experiment rejected (policy): the unstable-checkpoint policy is stop, pause or none (not %)', coalesce(p_policy, '<none>') USING ERRCODE = '22023'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN RAISE EXCEPTION 'experiment rejected (reason): a policy says why, in at least 8 characters' USING ERRCODE = '22023'; END IF;
  v_prev := e.on_unstable;
  UPDATE simulation.experiments SET on_unstable = p_policy WHERE experiment_id = e.experiment_id RETURNING * INTO e;
  PERFORM simulation.sio_event(e, 'policy_set', p_actor, jsonb_build_object('on_unstable', p_policy, 'previous', v_prev, 'reason', btrim(p_reason), 'rule', 'sxp-unstable@1'), p_correlation, p_event_id);
  RETURN simulation.sio_experiment_json(e);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION simulation.set_unstable_policy(uuid, uuid, uuid, text, text, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION simulation.set_unstable_policy(uuid, uuid, uuid, text, text, uuid, uuid, uuid) TO eye_commit;

/* QUARANTINE ON DEMAND (simulation.adapter.quarantine — a method steward, human-gated): a contained adapter quarantined in this domain with
   the steward's reason (an unstable solver seen in a review, a checkpoint the steward read), optionally naming the run that showed it.
   Refused: a principal other than the acting one (actor 403), a person not active (authority 403), an unknown model or run (404), an
   adapter already quarantined (state 409), a method that is not contained or a reason under 8 characters (422). The reinstatement is
   B29's (simulation.reinstate_adapter after a passing probe). */
CREATE OR REPLACE FUNCTION simulation.quarantine_adapter(p_tenant uuid, p_domain uuid, p_model_ref text, p_run_id uuid, p_reason text, p_actor uuid, p_event_id uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = simulation, twin, decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE m twin.behaviour_models%ROWTYPE; h simulation.adapter_health%ROWTYPE; v_q jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['simulation.adapter.quarantine']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'adapter quarantine rejected (actor): recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF NOT decision.is_active_human(p_actor, p_tenant) THEN RAISE EXCEPTION 'adapter quarantine rejected (authority): an adapter is quarantined on demand by a named, active human' USING ERRCODE = '42501'; END IF;
  SELECT * INTO m FROM twin.behaviour_models WHERE method_ref = p_model_ref;
  IF NOT FOUND THEN RAISE EXCEPTION 'adapter quarantine rejected (unknown_model): no behaviour model % is registered', p_model_ref USING ERRCODE = '23503'; END IF;
  IF coalesce((m.containment ->> 'isolated')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'adapter quarantine rejected (not_contained): % runs in process (containment.isolated false); only a contained adapter is quarantined', p_model_ref USING ERRCODE = '22023';
  END IF;
  IF p_run_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM simulation.runs_current r WHERE r.run_id = p_run_id AND r.tenant_id = p_tenant AND r.domain_id = p_domain AND r.model_ref = p_model_ref) THEN
    RAISE EXCEPTION 'adapter quarantine rejected (unknown_run): % is not a run of % in this domain', p_run_id, p_model_ref USING ERRCODE = '23503';
  END IF;
  SELECT * INTO h FROM simulation.adapter_health WHERE tenant_id = p_tenant AND domain_id = p_domain AND model_ref = p_model_ref;
  IF FOUND AND h.state = 'quarantined' THEN
    RAISE EXCEPTION 'adapter quarantine rejected (state): the adapter of % is already quarantined in this domain since %', p_model_ref, h.quarantined_at USING ERRCODE = '2F002';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN RAISE EXCEPTION 'adapter quarantine rejected (reason): a quarantine says why, in at least 8 characters' USING ERRCODE = '22023'; END IF;
  v_q := simulation.sxp_quarantine(p_tenant, p_domain, p_model_ref, p_run_id, 'steward', btrim(p_reason), jsonb_build_object('quarantined_by', p_actor), p_actor, p_correlation);
  RETURN v_q || jsonb_build_object('reason', btrim(p_reason), 'quarantined_by', p_actor, 'reinstatement', 'a method steward reinstates it after a probe of the pinned implementation passes (simulation.adapter.probe, simulation.adapter.reinstate)');
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION simulation.quarantine_adapter(uuid, uuid, text, uuid, text, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION simulation.quarantine_adapter(uuid, uuid, text, uuid, text, uuid, uuid, uuid) TO eye_commit;

-- §EX.4–6 THE TABLES ────────────────────────────────────────────────────
/* A RETIREMENT (PR-35-001): a finished run, or a finished experiment (and its run), retired by a named human with its REASON and its REACH
   as found at that instant — append-only; the run's own columns (runs_current.retired_*, the prelude's) are written once. */
CREATE TABLE simulation.retirements (
  retirement_id        uuid PRIMARY KEY,
  scope                text NOT NULL,
  tenant_id            uuid NOT NULL,
  domain_id            uuid NOT NULL,
  subject_kind         text NOT NULL CHECK (subject_kind IN ('run', 'experiment')),
  run_id               uuid REFERENCES simulation.runs_current (run_id),
  experiment_id        uuid REFERENCES simulation.experiments (experiment_id),
  reason               text NOT NULL CHECK (length(btrim(reason)) >= 8),
  /* the run that supersedes the retired one, when the retirer names it (a completed, unretired run of this domain) */
  superseded_by        uuid REFERENCES simulation.runs_current (run_id),
  /* {packages: [...], analyses: {...}, dependent_runs: [...], experiment, counts} — what the retired run reached when it was retired */
  reach                jsonb NOT NULL CHECK (jsonb_typeof(reach) = 'object'),
  /* the attention items that told the reached packages' owners */
  notified             jsonb NOT NULL DEFAULT '[]'::jsonb,
  retired_by           uuid NOT NULL,
  retired_at           timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id       uuid NOT NULL,
  CONSTRAINT sxp_ret_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT sxp_ret_subject CHECK ((subject_kind = 'run' AND run_id IS NOT NULL AND experiment_id IS NULL) OR (subject_kind = 'experiment' AND experiment_id IS NOT NULL)),
  CONSTRAINT sxp_ret_not_self CHECK (superseded_by IS NULL OR superseded_by IS DISTINCT FROM run_id)
);
CREATE INDEX sxp_ret_run ON simulation.retirements (run_id);
CREATE INDEX sxp_ret_domain ON simulation.retirements (tenant_id, domain_id, retired_at DESC);
COMMENT ON TABLE simulation.retirements IS 'B30 §EX (0103; F-P5-06 PR-35-001): the RETIREMENT of a finished run or experiment by a named human — the reason, the superseding run, the reach (citing packages, dependent analyses, sweeps, validations and runs) found at that instant, the owners told; append-only.';

/* AN ENVELOPE SWEEP (V02-T-167; rule sxp-sweep@1): per factor of the behaviour model's operating envelope, a grid of `grid_points` values
   from its low to its high bound, the metric on the run's stored contract's DETERMINISTIC trajectory at each (every other factor at its
   base) — the response curve; its nonlinearity (the largest gap to the chord through the end points, as a share of the response's
   span; nonlinear above 5%), its curvature (the largest change of slope between neighbouring segments, as a share of the steepest slope)
   and its THRESHOLDS (an interior grid point where the slope changes by more than half the steepest slope: onset — from flat —, saturation
   — to flat —, or kink); and every PAIR of factors at its four corners: the interaction hh − hl − lh + ll against the larger main effect
   — a HIDDEN DEPENDENCY above 10%. Executed by the pinned model (supply-flow@1); append-only. */
CREATE TABLE simulation.envelope_sweeps (
  sweep_id              uuid PRIMARY KEY,
  scope                 text NOT NULL,
  tenant_id             uuid NOT NULL,
  domain_id             uuid NOT NULL,
  run_id                uuid NOT NULL REFERENCES simulation.runs_current (run_id),
  run_outputs_digest    text NOT NULL CHECK (run_outputs_digest ~ '^[0-9a-f]{64}$'),
  model_ref             text NOT NULL,
  implementation_digest text NOT NULL CHECK (implementation_digest ~ '^[0-9a-f]{64}$'),
  metric                text NOT NULL CHECK (metric IN ('total_cost', 'line_stop_days', 'days_below_safety_stock')),
  grid_points           int  NOT NULL CHECK (grid_points BETWEEN 3 AND 25),
  /* the behaviour model's operating envelope as read at the sweep */
  envelope              jsonb NOT NULL CHECK (jsonb_typeof(envelope) = 'object'),
  base_value            numeric NOT NULL,
  /* [{key, field, range: [lo, hi], base_value, grid: [{value, metric}], slopes, nonlinearity, nonlinear, curvature, response (flat | linear | nonlinear),
       thresholds: [{kind (onset | saturation | kink), at, between: [lo, hi], slope_before, slope_after}]}] */
  factors               jsonb NOT NULL CHECK (jsonb_typeof(factors) = 'array' AND jsonb_array_length(factors) >= 1),
  /* [{factors: [a, b], corners: {ll, lh, hl, hh}, main_a, main_b, interaction, relative, hidden_dependency}] */
  interactions          jsonb NOT NULL CHECK (jsonb_typeof(interactions) = 'array'),
  nonlinear_factors     int  NOT NULL CHECK (nonlinear_factors >= 0),
  thresholds            int  NOT NULL CHECK (thresholds >= 0),
  hidden_dependencies   int  NOT NULL CHECK (hidden_dependencies >= 0),
  rule                  text NOT NULL CHECK (rule = 'sxp-sweep@1'),
  digest                text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  synthetic_state       boolean NOT NULL,
  requested_by          uuid NOT NULL,
  swept_at              timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id        uuid NOT NULL,
  CONSTRAINT sxp_sw_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX sxp_sw_run ON simulation.envelope_sweeps (run_id, swept_at DESC);
COMMENT ON TABLE simulation.envelope_sweeps IS 'B30 §EX (0103; F-P5-07 V02-T-167): NONLINEAR RESPONSE ACROSS THE OPERATING ENVELOPE of a completed valid run — per factor a grid across the model''s envelope range (the response curve, nonlinearity, curvature, thresholds) and the two-factor interactions (hidden dependencies); rule sxp-sweep@1; append-only.';

/* A BENCHMARK VALIDATION (AI-50-004; rule sxp-benchmark@1): a run's paths of one measure (its seeded sample totals, or its single
   deterministic total) against an OBSERVED sample (values entered with the evidence they were read from, cited) or a BENCHMARK sample (a
   reference model's or a published figure's values, the basis stated) — the MODEL DISCREPANCY (the means, the bias and the relative bias,
   the two-sample Kolmogorov–Smirnov distance and its 5% critical value 1.358·√((n+m)/(n·m)), the share of the benchmark inside the run's
   p05–p95 band); the RARE EVENTS (the tail threshold — declared, else the benchmark's p95 —, the run's and the benchmark's tail frequencies,
   their ratio, the tail paths the run holds; under-represented below half, over-represented above twice); CONVERGENCE outside an
   experiment (the running mean over the path count at every tenth of the paths, its change and 95% half-width; converged when the last
   three moved ≤ 1% and the half-width is ≤ 5% of the mean); the VERDICT (insufficient — fewer than 5 benchmark values, or fewer than 30
   paths of a seeded run —, discrepant — |relative bias| above the tolerance, KS above its critical value, or the tail under-represented —,
   else consistent). Append-only. */
CREATE TABLE simulation.benchmark_validations (
  validation_id         uuid PRIMARY KEY,
  scope                 text NOT NULL,
  tenant_id             uuid NOT NULL,
  domain_id             uuid NOT NULL,
  run_id                uuid NOT NULL REFERENCES simulation.runs_current (run_id),
  run_outputs_digest    text NOT NULL CHECK (run_outputs_digest ~ '^[0-9a-f]{64}$'),
  model_ref             text NOT NULL,
  measure               text NOT NULL CHECK (measure IN ('total_cost', 'line_stop_days', 'days_below_safety_stock')),
  benchmark_kind        text NOT NULL CHECK (benchmark_kind IN ('observed', 'benchmark')),
  /* {values: [...], basis, citations: [...]} — the values as entered, their basis, the evidence an observed sample was read from */
  benchmark             jsonb NOT NULL CHECK (jsonb_typeof(benchmark) = 'object'),
  benchmark_digest      text NOT NULL CHECK (benchmark_digest ~ '^[0-9a-f]{64}$'),
  run_paths             int  NOT NULL CHECK (run_paths >= 1),
  benchmark_n           int  NOT NULL CHECK (benchmark_n >= 1),
  tolerance             numeric NOT NULL CHECK (tolerance > 0 AND tolerance <= 1),
  discrepancy           jsonb NOT NULL CHECK (jsonb_typeof(discrepancy) = 'object'),
  tail                  jsonb NOT NULL CHECK (jsonb_typeof(tail) = 'object'),
  convergence           jsonb NOT NULL CHECK (jsonb_typeof(convergence) = 'object'),
  verdict               text NOT NULL CHECK (verdict IN ('consistent', 'discrepant', 'insufficient')),
  rule                  text NOT NULL CHECK (rule = 'sxp-benchmark@1'),
  digest                text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  synthetic_state       boolean NOT NULL,
  requested_by          uuid NOT NULL,
  validated_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id        uuid NOT NULL,
  CONSTRAINT sxp_bv_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX sxp_bv_run ON simulation.benchmark_validations (run_id, validated_at DESC);
COMMENT ON TABLE simulation.benchmark_validations IS 'B30 §EX (0103; F-P5-07 AI-50-004): a run''s paths validated against an observed or benchmark sample — the model discrepancy (bias, KS), the rare-event tail coverage, the convergence over the path count outside an experiment and the verdict; rule sxp-benchmark@1; append-only.';

-- RLS, GRANTS, APPEND-ONLY (the 0081 loop idiom; reads under the caller's RLS; every write through a port below)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['retirements', 'envelope_sweeps', 'benchmark_validations'] LOOP
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
CREATE TRIGGER sxp_ret_append_only BEFORE UPDATE OR DELETE ON simulation.retirements FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
CREATE TRIGGER sxp_sw_append_only BEFORE UPDATE OR DELETE ON simulation.envelope_sweeps FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
CREATE TRIGGER sxp_bv_append_only BEFORE UPDATE OR DELETE ON simulation.benchmark_validations FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

-- §EX.4 RETIREMENT ──────────────────────────────────────────────────────
/* THE REACH of a run (an invoker read; inside a port, under the port's context): the packages whose options cite it (an option's
   consequence of kind `run`) or whose version names it as the baseline — with the option, whether it is the recommended one, whether the
   version is the current or the committed one, and the package's owner —; the analyses resting on it (B31's sensitivity analyses,
   second-order derivations and probability statements; B30's envelope sweeps and benchmark validations); the runs that name it as their
   control or correct it; the experiment that produced it. */
CREATE OR REPLACE FUNCTION simulation.sxp_retirement_reach(p_run_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = simulation, decision, pg_catalog, pg_temp AS $$
  WITH r AS (SELECT x.run_id, x.tenant_id, x.domain_id FROM simulation.runs_current x WHERE x.run_id = p_run_id),
  cited AS (
    SELECT o.package_id, o.version, o.key AS option_key, o.title AS option_title, 'option_consequence'::text AS via
      FROM decision.options o JOIN r ON r.tenant_id = o.tenant_id AND r.domain_id = o.domain_id
     WHERE jsonb_typeof(o.consequences) = 'array'
       AND EXISTS (SELECT 1 FROM jsonb_array_elements(o.consequences) c WHERE c ->> 'kind' = 'run' AND c ->> 'id' = p_run_id::text)
    UNION ALL
    SELECT pv.package_id, pv.version, NULL, NULL, 'baseline_run' FROM decision.package_versions pv JOIN r ON r.tenant_id = pv.tenant_id AND r.domain_id = pv.domain_id
     WHERE pv.baseline_run_id = p_run_id),
  pk AS (
    SELECT c.*, p.title AS package_title, p.owner_principal_id, p.state AS package_state, (c.version = p.current_version) AS is_current, (c.version IS NOT DISTINCT FROM p.committed_version) AS is_committed,
           (c.option_key IS NOT NULL AND c.option_key = (pv.choice ->> 'option_key')) AS recommended
      FROM cited c JOIN decision.packages_current p ON p.package_id = c.package_id
      LEFT JOIN decision.package_versions pv ON pv.package_id = c.package_id AND pv.version = c.version)
  SELECT jsonb_build_object(
    'run_id', p_run_id,
    'packages', coalesce((SELECT jsonb_agg(jsonb_build_object('package_id', pk.package_id, 'title', pk.package_title, 'owner', pk.owner_principal_id, 'state', pk.package_state, 'version', pk.version,
                                                              'via', pk.via, 'option_key', pk.option_key, 'option_title', pk.option_title, 'recommended', pk.recommended,
                                                              'current', pk.is_current, 'committed', pk.is_committed) ORDER BY pk.package_id, pk.version, pk.option_key) FROM pk), '[]'::jsonb),
    'analyses', jsonb_build_object(
      'sensitivity', coalesce((SELECT jsonb_agg(jsonb_build_object('analysis_id', a.analysis_id, 'metric', a.metric, 'analysed_at', a.analysed_at) ORDER BY a.analysed_at, a.analysis_id)
                                 FROM simulation.sensitivity_analyses a WHERE a.run_id = p_run_id), '[]'::jsonb),
      'second_order', coalesce((SELECT jsonb_agg(DISTINCT x.derivation_id) FROM simulation.second_order_effects x WHERE x.run_id = p_run_id), '[]'::jsonb),
      'probability_statements', coalesce((SELECT jsonb_agg(s.statement_id ORDER BY s.stated_at) FROM simulation.probability_statements s WHERE s.run_id = p_run_id), '[]'::jsonb),
      'envelope_sweeps', coalesce((SELECT jsonb_agg(w.sweep_id ORDER BY w.swept_at) FROM simulation.envelope_sweeps w WHERE w.run_id = p_run_id), '[]'::jsonb),
      'benchmark_validations', coalesce((SELECT jsonb_agg(b.validation_id ORDER BY b.validated_at) FROM simulation.benchmark_validations b WHERE b.run_id = p_run_id), '[]'::jsonb)),
    'dependent_runs', coalesce((SELECT jsonb_agg(jsonb_build_object('run_id', d.run_id, 'state', d.state, 'relation', CASE WHEN d.control_run_id = p_run_id THEN 'control_of' ELSE 'corrected_by' END,
                                                                    'retired', d.retired_at IS NOT NULL) ORDER BY d.opened_at, d.run_id)
                                  FROM simulation.runs_current d JOIN r ON r.tenant_id = d.tenant_id AND r.domain_id = d.domain_id
                                 WHERE d.control_run_id = p_run_id OR d.corrects_run_id = p_run_id), '[]'::jsonb),
    'experiment', (SELECT jsonb_build_object('experiment_id', e.experiment_id, 'title', e.title, 'state', e.state) FROM simulation.experiments e WHERE e.run_id = p_run_id),
    'counts', jsonb_build_object(
      'packages', (SELECT count(DISTINCT pk.package_id) FROM pk),
      'analyses', (SELECT count(*) FROM simulation.sensitivity_analyses a WHERE a.run_id = p_run_id) + (SELECT count(DISTINCT x.derivation_id) FROM simulation.second_order_effects x WHERE x.run_id = p_run_id)
                  + (SELECT count(*) FROM simulation.probability_statements s WHERE s.run_id = p_run_id) + (SELECT count(*) FROM simulation.envelope_sweeps w WHERE w.run_id = p_run_id)
                  + (SELECT count(*) FROM simulation.benchmark_validations b WHERE b.run_id = p_run_id),
      'dependent_runs', (SELECT count(*) FROM simulation.runs_current d WHERE d.control_run_id = p_run_id OR d.corrects_run_id = p_run_id)))
  FROM r
$$;
GRANT EXECUTE ON FUNCTION simulation.sxp_retirement_reach(uuid) TO eye_app, eye_commit;

/* The NOTICE to the owner of a reached package (the sio_notify idiom: an attention item, open when the owner is an active human, else
   unrouted; its cause the retirement). Private. */
CREATE OR REPLACE FUNCTION simulation.sxp_notify(p_tenant uuid, p_domain uuid, p_class text, p_subject_kind text, p_subject_id uuid, p_title text, p_reasons jsonb, p_owner uuid,
                                                 p_cause uuid, p_cause_type text, p_details jsonb, p_due interval, p_actor uuid, p_correlation uuid) RETURNS uuid
SECURITY DEFINER SET search_path = executive, identity, decision, pg_catalog, pg_temp AS $$
DECLARE v_item uuid := gen_random_uuid(); v_state text; v_due timestamptz := clock_timestamp() + p_due;
BEGIN
  v_state := CASE WHEN p_owner IS NOT NULL AND decision.is_active_human(p_owner, p_tenant) THEN 'open' ELSE 'unrouted' END;
  INSERT INTO executive.attention_items (item_id, scope, tenant_id, domain_id, signal_class, subject_kind, subject_id, cause_event_id, cause_event_type, title, outcome, state, owner_principal_id, route_roles, evaluation, details, due_at, escalations, correlation_id)
  VALUES (v_item, 'DOMAIN', p_tenant, p_domain, p_class, p_subject_kind, p_subject_id, p_cause, p_cause_type, left(p_title, 512), 'material', v_state, p_owner, '{}',
          jsonb_build_object('outcome', 'material', 'reasons', p_reasons, 'policy_version', NULL, 'dimensions', jsonb_build_object('consequence', 'C2', 'confidence', 1)),
          coalesce(p_details, '{}'::jsonb) || jsonb_build_object('synthetic', true), v_due, 0, p_correlation);
  PERFORM executive.attention_event(v_item, p_tenant, p_domain, CASE v_state WHEN 'open' THEN 'item.routed' ELSE 'item.unrouted' END, p_actor,
            jsonb_build_object('outcome', 'material', 'reasons', p_reasons, 'policy_version', NULL, 'owner', p_owner, 'route_roles', '[]'::jsonb, 'due_at', v_due,
                               'cause_event_id', p_cause, 'cause_event_type', p_cause_type, 'unrouted', v_state = 'unrouted'), p_correlation);
  RETURN v_item;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION simulation.sxp_notify(uuid, uuid, text, text, uuid, text, jsonb, uuid, uuid, text, jsonb, interval, uuid, uuid) FROM PUBLIC;

/* The retirement written (private: both ports): the run's columns (written once — runs_immutable, the prelude's), the retirement row with
   the reach found now, each reached package's owner told (simulation.validity, subject the package). Answers the retirement. */
CREATE OR REPLACE FUNCTION simulation.sxp_retire(p_retirement_id uuid, p_kind text, r simulation.runs_current, p_experiment_id uuid, p_reason text, p_superseded_by uuid, p_actor uuid, p_correlation uuid)
RETURNS jsonb SECURITY DEFINER SET search_path = simulation, pg_catalog, pg_temp AS $$
DECLARE v_reach jsonb := '{}'::jsonb; v_notified jsonb := '[]'::jsonb; pkg record; v_item uuid; v_out simulation.retirements%ROWTYPE; v_at timestamptz := clock_timestamp();
BEGIN
  IF r.run_id IS NOT NULL THEN
    v_reach := coalesce(simulation.sxp_retirement_reach(r.run_id), '{}'::jsonb);
    IF r.retired_at IS NULL AND r.state IN ('completed', 'failed', 'partial') THEN
      UPDATE simulation.runs_current SET retired_at = v_at, retired_by = p_actor, retire_reason = btrim(p_reason) WHERE run_id = r.run_id;
    END IF;
  END IF;
  IF p_experiment_id IS NOT NULL THEN
    v_reach := v_reach || jsonb_build_object('experiment', (SELECT jsonb_build_object('experiment_id', e.experiment_id, 'title', e.title, 'state', e.state) FROM simulation.experiments e WHERE e.experiment_id = p_experiment_id));
  END IF;
  FOR pkg IN SELECT DISTINCT (x ->> 'package_id')::uuid AS package_id, x ->> 'title' AS title, nullif(x ->> 'owner', '')::uuid AS owner
               FROM jsonb_array_elements(coalesce(v_reach -> 'packages', '[]'::jsonb)) x LOOP
    v_item := simulation.sxp_notify(r.tenant_id, r.domain_id, 'simulation.validity', 'package', pkg.package_id,
                format('A simulation run your package cites was retired: %s', coalesce(pkg.title, pkg.package_id::text)),
                jsonb_build_array(format('run %s was retired: %s', r.run_id, btrim(p_reason)),
                                  CASE WHEN p_superseded_by IS NULL THEN 'no superseding run was named' ELSE format('it is superseded by run %s', p_superseded_by) END,
                                  'a retired run is no longer analysed nor taken as a control; cite the superseding run at the package''s next version'),
                pkg.owner, p_retirement_id, 'simulation.run_retired',
                jsonb_build_object('kind', 'run_retired', 'run_id', r.run_id, 'experiment_id', p_experiment_id, 'superseded_by', p_superseded_by, 'retirement_id', p_retirement_id),
                interval '7 days', p_actor, p_correlation);
    v_notified := v_notified || jsonb_build_object('package_id', pkg.package_id, 'owner', pkg.owner, 'attention_item_id', v_item);
  END LOOP;
  INSERT INTO simulation.retirements (retirement_id, scope, tenant_id, domain_id, subject_kind, run_id, experiment_id, reason, superseded_by, reach, notified, retired_by, retired_at, correlation_id)
  VALUES (p_retirement_id, 'DOMAIN', r.tenant_id, r.domain_id, p_kind, r.run_id, p_experiment_id, btrim(p_reason), p_superseded_by, v_reach, v_notified, p_actor, v_at, p_correlation)
  RETURNING * INTO v_out;
  RETURN to_jsonb(v_out) - 'scope' - 'correlation_id';
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION simulation.sxp_retire(uuid, text, simulation.runs_current, uuid, text, uuid, uuid, uuid) FROM PUBLIC;

/* RETIRE A RUN (simulation.retirement.run — human-gated): a FINISHED run (completed, partial or failed) of this domain, by a named, active
   human who is its operator, the twin's owner, a twin owner or the domain administrator, with a reason (≥ 8 characters) and, optionally,
   the run that supersedes it (a completed, unretired run of this domain). Refused: the acting principal (actor 403), a person not active
   or without that standing (authority 403), an unknown run or superseding run (404), an unfinished or an already retired run (state 409),
   the reason or a superseding run that is not usable (422). */
CREATE OR REPLACE FUNCTION simulation.retire_run(p_retirement_id uuid, p_tenant uuid, p_domain uuid, p_run_id uuid, p_reason text, p_superseded_by uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = simulation, twin, executive, decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r simulation.runs_current%ROWTYPE; s simulation.runs_current%ROWTYPE; v_twin_owner uuid; v_out jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['simulation.retirement.run']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'retirement rejected (actor): recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF NOT decision.is_active_human(p_actor, p_tenant) THEN RAISE EXCEPTION 'retirement rejected (authority): a run is retired by a named, active human' USING ERRCODE = '42501'; END IF;
  SELECT * INTO r FROM simulation.runs_current x WHERE x.run_id = p_run_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'retirement rejected (unknown_run): % is not a simulation run of this domain', p_run_id USING ERRCODE = '23503'; END IF;
  SELECT t.owner_principal_id INTO v_twin_owner FROM twin.twins_current t WHERE t.twin_id = r.twin_id;
  IF p_actor IS DISTINCT FROM r.operator_principal_id AND p_actor IS DISTINCT FROM v_twin_owner
     AND NOT executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['twin_owner', 'domain_admin', 'platform_admin']) THEN
    RAISE EXCEPTION 'retirement rejected (authority): a run is retired by its operator, its twin''s owner, a twin owner or the domain administrator' USING ERRCODE = '42501';
  END IF;
  IF r.state NOT IN ('completed', 'failed', 'partial') THEN
    RAISE EXCEPTION 'retirement rejected (state): run % is %; only a finished run (completed, partial or failed) is retired', p_run_id, r.state USING ERRCODE = '2F002';
  END IF;
  IF r.retired_at IS NOT NULL THEN RAISE EXCEPTION 'retirement rejected (state): run % was retired at % (%); a retirement is recorded once', p_run_id, r.retired_at, r.retire_reason USING ERRCODE = '2F002'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN RAISE EXCEPTION 'retirement rejected (reason): a retirement says why, in at least 8 characters' USING ERRCODE = '22023'; END IF;
  IF p_superseded_by IS NOT NULL THEN
    SELECT * INTO s FROM simulation.runs_current x WHERE x.run_id = p_superseded_by AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
    IF NOT FOUND THEN RAISE EXCEPTION 'retirement rejected (unknown_superseding_run): % is not a simulation run of this domain', p_superseded_by USING ERRCODE = '23503'; END IF;
    IF s.run_id = r.run_id OR s.state <> 'completed' OR s.retired_at IS NOT NULL OR s.validity = 'invalidated' THEN
      RAISE EXCEPTION 'retirement rejected (superseded_by): run % is not a completed, valid, unretired run other than the one retired (it is %)', p_superseded_by,
        s.state || CASE WHEN s.run_id = r.run_id THEN ', the same run' WHEN s.retired_at IS NOT NULL THEN ', retired' WHEN s.validity = 'invalidated' THEN ', invalidated' ELSE '' END USING ERRCODE = '22023';
    END IF;
  END IF;
  v_out := simulation.sxp_retire(p_retirement_id, 'run', r, NULL, p_reason, p_superseded_by, p_actor, p_correlation);
  RETURN v_out || jsonb_build_object('run', (SELECT jsonb_build_object('run_id', x.run_id, 'state', x.state, 'retired_at', x.retired_at, 'retired_by', x.retired_by, 'retire_reason', x.retire_reason)
                                               FROM simulation.runs_current x WHERE x.run_id = p_run_id));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION simulation.retire_run(uuid, uuid, uuid, uuid, text, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION simulation.retire_run(uuid, uuid, uuid, uuid, text, uuid, uuid, uuid) TO eye_commit;

/* RETIRE AN EXPERIMENT (simulation.retirement.experiment — human-gated): a FINISHED experiment (completed, partial, failed or cancelled), by
   a named, active human who is its declarer, its starter, a twin owner or the domain administrator, with a reason; its run — finished and
   not yet retired — is retired with it (the same reason, its reach recorded). The experiment's ledger: retired. Refused: the acting
   principal (actor 403), a person without that standing (authority 403), an unknown experiment (404), an experiment not finished or
   already retired (state 409), the reason (422). */
CREATE OR REPLACE FUNCTION simulation.retire_experiment(p_retirement_id uuid, p_tenant uuid, p_domain uuid, p_experiment_id uuid, p_reason text, p_actor uuid, p_event_id uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = simulation, executive, decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE e simulation.experiments%ROWTYPE; r simulation.runs_current%ROWTYPE; v_out jsonb; v_run_retired boolean := false; v_prior text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['simulation.retirement.experiment']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'retirement rejected (actor): recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF NOT decision.is_active_human(p_actor, p_tenant) THEN RAISE EXCEPTION 'retirement rejected (authority): an experiment is retired by a named, active human' USING ERRCODE = '42501'; END IF;
  SELECT * INTO e FROM simulation.experiments x WHERE x.experiment_id = p_experiment_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'retirement rejected (unknown_experiment): % is not an experiment of this domain', p_experiment_id USING ERRCODE = '23503'; END IF;
  IF p_actor IS DISTINCT FROM e.declared_by AND p_actor IS DISTINCT FROM e.started_by
     AND NOT executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['twin_owner', 'domain_admin', 'platform_admin']) THEN
    RAISE EXCEPTION 'retirement rejected (authority): an experiment is retired by its declarer, its starter, a twin owner or the domain administrator' USING ERRCODE = '42501';
  END IF;
  IF e.state = 'retired' THEN RAISE EXCEPTION 'retirement rejected (state): experiment % was retired at % (%); a retirement is recorded once', e.experiment_id, e.retirement ->> 'retired_at', e.retirement ->> 'reason' USING ERRCODE = '2F002'; END IF;
  IF e.state NOT IN ('completed', 'partial', 'failed', 'cancelled') THEN
    RAISE EXCEPTION 'retirement rejected (state): experiment % is %; only a finished experiment is retired (cancel a live one first)', e.experiment_id, e.state USING ERRCODE = '2F002';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN RAISE EXCEPTION 'retirement rejected (reason): a retirement says why, in at least 8 characters' USING ERRCODE = '22023'; END IF;
  v_prior := e.state;
  IF e.run_id IS NOT NULL THEN
    SELECT * INTO r FROM simulation.runs_current x WHERE x.run_id = e.run_id FOR UPDATE;
    v_run_retired := r.retired_at IS NULL AND r.state IN ('completed', 'failed', 'partial');
  ELSE
    r.tenant_id := p_tenant; r.domain_id := p_domain;   -- no run: the record carries the domain only
  END IF;
  v_out := simulation.sxp_retire(p_retirement_id, 'experiment', r, e.experiment_id, p_reason, NULL, p_actor, p_correlation);
  UPDATE simulation.experiments SET state = 'retired',
         retirement = jsonb_build_object('prior_state', v_prior, 'reason', btrim(p_reason), 'retired_by', p_actor, 'retired_at', v_out ->> 'retired_at', 'run_retired', v_run_retired, 'retirement_id', p_retirement_id)
   WHERE experiment_id = e.experiment_id RETURNING * INTO e;
  PERFORM simulation.sio_event(e, 'retired', p_actor, jsonb_build_object('reason', btrim(p_reason), 'prior_state', v_prior, 'run_id', e.run_id, 'run_retired', v_run_retired,
                                                                        'retirement_id', p_retirement_id, 'reach_counts', v_out -> 'reach' -> 'counts'), p_correlation, p_event_id);
  RETURN v_out || jsonb_build_object('experiment', simulation.sio_experiment_json(e));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION simulation.retire_experiment(uuid, uuid, uuid, uuid, text, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION simulation.retire_experiment(uuid, uuid, uuid, uuid, text, uuid, uuid, uuid) TO eye_commit;

/* THE GATES on a retired run (BEFORE INSERT; the siv_run_* precedent): it is no longer ANALYSED (B31's sensitivity analyses, second-order
   derivations, probability statements) — the analysis family's own refusal, class state — nor taken as an intervention run's CONTROL. */
CREATE OR REPLACE FUNCTION simulation.sxp_analysis_not_retired() RETURNS trigger
SECURITY DEFINER SET search_path = simulation, pg_catalog, pg_temp AS $$
DECLARE v_at timestamptz; v_reason text;
BEGIN
  SELECT r.retired_at, r.retire_reason INTO v_at, v_reason FROM simulation.runs_current r WHERE r.run_id = NEW.run_id;
  IF v_at IS NOT NULL THEN
    RAISE EXCEPTION 'impact analysis rejected (state): run % was retired at % (%); a retired result is not analysed — analyse the run that supersedes it', NEW.run_id, v_at, v_reason USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION simulation.sxp_analysis_not_retired() FROM PUBLIC;
CREATE TRIGGER sxp_sa_not_retired BEFORE INSERT ON simulation.sensitivity_analyses FOR EACH ROW EXECUTE FUNCTION simulation.sxp_analysis_not_retired();
CREATE TRIGGER sxp_soe_not_retired BEFORE INSERT ON simulation.second_order_effects FOR EACH ROW EXECUTE FUNCTION simulation.sxp_analysis_not_retired();
CREATE TRIGGER sxp_ps_not_retired BEFORE INSERT ON simulation.probability_statements FOR EACH ROW EXECUTE FUNCTION simulation.sxp_analysis_not_retired();

CREATE OR REPLACE FUNCTION simulation.sxp_run_control_not_retired() RETURNS trigger
SECURITY DEFINER SET search_path = simulation, pg_catalog, pg_temp AS $$
DECLARE v_at timestamptz; v_reason text;
BEGIN
  IF NEW.control_run_id IS NULL THEN RETURN NEW; END IF;
  SELECT r.retired_at, r.retire_reason INTO v_at, v_reason FROM simulation.runs_current r WHERE r.run_id = NEW.control_run_id;
  IF v_at IS NOT NULL THEN
    RAISE EXCEPTION 'run rejected (retired_control): control run % was retired at % (%); an intervention is compared against a control that is not retired', NEW.control_run_id, v_at, v_reason USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION simulation.sxp_run_control_not_retired() FROM PUBLIC;
CREATE TRIGGER sxp_run_control_not_retired BEFORE INSERT ON simulation.runs_current FOR EACH ROW EXECUTE FUNCTION simulation.sxp_run_control_not_retired();

-- §EX.5 NONLINEAR RESPONSE ACROSS THE ENVELOPE ─────────────────────────
/* Two numbers agree to the rule's rounding (six decimals, relative to the larger magnitude). */
CREATE OR REPLACE FUNCTION simulation.sxp_close(a numeric, b numeric) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT a IS NOT NULL AND b IS NOT NULL AND abs(a - b) <= 0.000002 * greatest(1, abs(a), abs(b))
$$;

/* SWEEP THE ENVELOPE (simulation.sweep.run — a twin owner, a simulation operator, the domain administrator): RECORD the sweep the service
   executed with the pinned model over a completed valid run's stored contract (rule sxp-sweep@1). The port checks what a port can: the
   run (completed, valid, the outputs digest analysed, not retired), the method (supply-flow@1: the deterministic trajectory is its —
   a fabric method's sweep is not this rule's), every factor an envelope key swept over EXACTLY its envelope range on the declared grid
   (ascending, end points the bounds), and it RECOMPUTES each factor's nonlinearity from its grid and each pair's interaction from its
   corners — a stated figure that is not the grid's is refused; every pair of swept factors is present once. */
CREATE OR REPLACE FUNCTION simulation.sweep_envelope(p_sweep_id uuid, p_tenant uuid, p_domain uuid, p_run_id uuid, p_outputs_digest text, p_metric text, p_grid_points int, p_base numeric,
                                                     p_factors jsonb, p_interactions jsonb, p_digest text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = simulation, twin, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r simulation.runs_current%ROWTYPE; v_env jsonb; f jsonb; g jsonb; i int; n int; v_keys text[] := ARRAY[]::text[]; lo numeric; hi numeric; xs numeric[]; ms numeric[];
        v_span numeric; v_nl numeric; v_chord numeric; v_nonlinear int := 0; v_thr int := 0; t jsonb; x jsonb; a text; b text; ll numeric; lh numeric; hl numeric; hh numeric;
        v_ma numeric; v_mb numeric; v_int numeric; v_rel numeric; v_hidden int := 0; v_pairs int := 0; v_out simulation.envelope_sweeps%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['simulation.sweep.run']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'envelope sweep rejected (actor): a sweep is requested by the acting principal' USING ERRCODE = '42501'; END IF;
  r := simulation.sii_run_for_analysis('envelope sweep', p_tenant, p_domain, p_run_id, p_outputs_digest);
  IF r.retired_at IS NOT NULL THEN RAISE EXCEPTION 'envelope sweep rejected (state): run % was retired at % (%); a retired result is not swept', p_run_id, r.retired_at, r.retire_reason USING ERRCODE = '22023'; END IF;
  IF r.model_ref <> 'supply-flow@1' THEN
    RAISE EXCEPTION 'envelope sweep rejected (method): rule sxp-sweep@1 sweeps supply-flow@1''s deterministic trajectory; run % is %', p_run_id, r.model_ref USING ERRCODE = '22023';
  END IF;
  IF p_metric IS NULL OR p_metric NOT IN ('total_cost', 'line_stop_days', 'days_below_safety_stock') THEN RAISE EXCEPTION 'envelope sweep rejected (metric): the metric is total_cost, line_stop_days or days_below_safety_stock' USING ERRCODE = '22023'; END IF;
  IF p_grid_points IS NULL OR p_grid_points < 3 OR p_grid_points > 25 THEN RAISE EXCEPTION 'envelope sweep rejected (grid): a grid has 3 to 25 points' USING ERRCODE = '22023'; END IF;
  IF p_base IS NULL THEN RAISE EXCEPTION 'envelope sweep rejected (factors): the base value of the metric is stated' USING ERRCODE = '22023'; END IF;
  IF p_digest IS NULL OR p_digest !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'envelope sweep rejected (digest): the sweep carries its digest' USING ERRCODE = '22023'; END IF;
  SELECT m.operating_envelope INTO v_env FROM twin.behaviour_models m WHERE m.method_ref = r.model_ref;
  IF p_factors IS NULL OR jsonb_typeof(p_factors) <> 'array' OR jsonb_array_length(p_factors) = 0 THEN
    RAISE EXCEPTION 'envelope sweep rejected (factors): the model''s envelope names no factor the run''s contract carries; nothing to sweep' USING ERRCODE = '22023';
  END IF;
  n := 0;
  FOR f IN SELECT y FROM jsonb_array_elements(p_factors) y LOOP
    n := n + 1;
    IF jsonb_typeof(f) <> 'object' OR jsonb_typeof(f -> 'key') IS DISTINCT FROM 'string' OR jsonb_typeof(f -> 'grid') IS DISTINCT FROM 'array' OR jsonb_typeof(f -> 'range') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'envelope sweep rejected (factors): factor % names its key, its range and its grid', n USING ERRCODE = '22023';
    END IF;
    IF (f ->> 'key') = ANY (v_keys) THEN RAISE EXCEPTION 'envelope sweep rejected (factors): factor % is swept twice', f ->> 'key' USING ERRCODE = '22023'; END IF;
    v_keys := v_keys || (f ->> 'key');
    IF jsonb_typeof(v_env -> (f ->> 'key')) IS DISTINCT FROM 'array' OR jsonb_array_length(v_env -> (f ->> 'key')) <> 2 THEN
      RAISE EXCEPTION 'envelope sweep rejected (factors): % is not a range of the operating envelope of %', f ->> 'key', r.model_ref USING ERRCODE = '22023';
    END IF;
    lo := (v_env -> (f ->> 'key') ->> 0)::numeric; hi := (v_env -> (f ->> 'key') ->> 1)::numeric;
    IF NOT (simulation.sxp_close((f -> 'range' ->> 0)::numeric, lo) AND simulation.sxp_close((f -> 'range' ->> 1)::numeric, hi)) THEN
      RAISE EXCEPTION 'envelope sweep rejected (grid): % is swept over %, its envelope is [%, %]', f ->> 'key', f -> 'range', lo, hi USING ERRCODE = '22023';
    END IF;
    IF jsonb_array_length(f -> 'grid') <> p_grid_points THEN RAISE EXCEPTION 'envelope sweep rejected (grid): % carries % points, the sweep declares %', f ->> 'key', jsonb_array_length(f -> 'grid'), p_grid_points USING ERRCODE = '22023'; END IF;
    xs := ARRAY[]::numeric[]; ms := ARRAY[]::numeric[];
    FOR g IN SELECT y FROM jsonb_array_elements(f -> 'grid') y LOOP
      IF jsonb_typeof(g -> 'value') IS DISTINCT FROM 'number' OR jsonb_typeof(g -> 'metric') IS DISTINCT FROM 'number' THEN
        RAISE EXCEPTION 'envelope sweep rejected (grid): every grid point of % is {value, metric} with numbers', f ->> 'key' USING ERRCODE = '22023';
      END IF;
      xs := xs || (g ->> 'value')::numeric; ms := ms || (g ->> 'metric')::numeric;
    END LOOP;
    IF NOT simulation.sxp_close(xs[1], lo) OR NOT simulation.sxp_close(xs[p_grid_points], hi) THEN
      RAISE EXCEPTION 'envelope sweep rejected (grid): the grid of % runs from % to %, its envelope from % to %', f ->> 'key', xs[1], xs[p_grid_points], lo, hi USING ERRCODE = '22023';
    END IF;
    FOR i IN 2 .. p_grid_points LOOP
      IF xs[i] <= xs[i - 1] THEN RAISE EXCEPTION 'envelope sweep rejected (grid): the grid of % is not strictly ascending at point %', f ->> 'key', i USING ERRCODE = '22023'; END IF;
    END LOOP;
    -- the NONLINEARITY recomputed: the largest gap to the chord through the end points, as a share of the response's span
    SELECT max(v) - min(v) INTO v_span FROM unnest(ms) v;
    v_nl := 0;
    IF v_span > 0 THEN
      FOR i IN 1 .. p_grid_points LOOP
        v_chord := ms[1] + (ms[p_grid_points] - ms[1]) * (xs[i] - xs[1]) / (xs[p_grid_points] - xs[1]);
        v_nl := greatest(v_nl, abs(ms[i] - v_chord) / v_span);
      END LOOP;
    END IF;
    IF NOT simulation.sxp_close((f ->> 'nonlinearity')::numeric, round(v_nl, 6)) THEN
      RAISE EXCEPTION 'envelope sweep rejected (factors): % states a nonlinearity of %, its grid makes %', f ->> 'key', f ->> 'nonlinearity', round(v_nl, 6) USING ERRCODE = '22023';
    END IF;
    IF coalesce((f ->> 'nonlinear')::boolean, false) IS DISTINCT FROM (v_nl > 0.05) THEN
      RAISE EXCEPTION 'envelope sweep rejected (factors): % is stated %, its nonlinearity % makes it %', f ->> 'key', CASE WHEN (f ->> 'nonlinear')::boolean THEN 'nonlinear' ELSE 'linear' END, round(v_nl, 6),
        CASE WHEN v_nl > 0.05 THEN 'nonlinear' ELSE 'linear' END USING ERRCODE = '22023';
    END IF;
    IF v_nl > 0.05 THEN v_nonlinear := v_nonlinear + 1; END IF;
    IF jsonb_typeof(coalesce(f -> 'thresholds', '[]'::jsonb)) <> 'array' THEN RAISE EXCEPTION 'envelope sweep rejected (factors): the thresholds of % are a list', f ->> 'key' USING ERRCODE = '22023'; END IF;
    FOR t IN SELECT y FROM jsonb_array_elements(coalesce(f -> 'thresholds', '[]'::jsonb)) y LOOP
      IF coalesce(t ->> 'kind', '') NOT IN ('onset', 'saturation', 'kink') OR jsonb_typeof(t -> 'at') IS DISTINCT FROM 'number'
         OR NOT EXISTS (SELECT 1 FROM generate_series(2, p_grid_points - 1) k WHERE simulation.sxp_close(xs[k], (t ->> 'at')::numeric)) THEN
        RAISE EXCEPTION 'envelope sweep rejected (factors): a threshold of % is {kind (onset | saturation | kink), at — an interior point of its grid}', f ->> 'key' USING ERRCODE = '22023';
      END IF;
      v_thr := v_thr + 1;
    END LOOP;
  END LOOP;
  -- THE INTERACTIONS recomputed from their corners; every pair of swept factors once
  IF p_interactions IS NULL OR jsonb_typeof(p_interactions) <> 'array' THEN RAISE EXCEPTION 'envelope sweep rejected (interactions): the interactions are a list' USING ERRCODE = '22023'; END IF;
  FOR x IN SELECT y FROM jsonb_array_elements(p_interactions) y LOOP
    a := x -> 'factors' ->> 0; b := x -> 'factors' ->> 1;
    IF a IS NULL OR b IS NULL OR a = b OR NOT (a = ANY (v_keys)) OR NOT (b = ANY (v_keys)) OR jsonb_array_length(x -> 'factors') <> 2 THEN
      RAISE EXCEPTION 'envelope sweep rejected (interactions): an interaction names two distinct swept factors' USING ERRCODE = '22023';
    END IF;
    ll := (x -> 'corners' ->> 'll')::numeric; lh := (x -> 'corners' ->> 'lh')::numeric; hl := (x -> 'corners' ->> 'hl')::numeric; hh := (x -> 'corners' ->> 'hh')::numeric;
    IF ll IS NULL OR lh IS NULL OR hl IS NULL OR hh IS NULL THEN RAISE EXCEPTION 'envelope sweep rejected (interactions): the interaction of % × % carries its four corners', a, b USING ERRCODE = '22023'; END IF;
    v_ma := ((hl + hh) - (ll + lh)) / 2; v_mb := ((lh + hh) - (ll + hl)) / 2; v_int := hh - hl - lh + ll;
    v_rel := CASE WHEN greatest(abs(v_ma), abs(v_mb)) = 0 THEN CASE WHEN v_int = 0 THEN 0 ELSE 1 END ELSE abs(v_int) / greatest(abs(v_ma), abs(v_mb)) END;
    IF NOT simulation.sxp_close((x ->> 'interaction')::numeric, v_int) OR NOT simulation.sxp_close((x ->> 'relative')::numeric, round(v_rel, 6))
       OR coalesce((x ->> 'hidden_dependency')::boolean, false) IS DISTINCT FROM (v_rel > 0.1 AND v_int <> 0) THEN
      RAISE EXCEPTION 'envelope sweep rejected (interactions): % × % states interaction % (relative %, hidden %), its corners make % (relative %)', a, b, x ->> 'interaction', x ->> 'relative', x ->> 'hidden_dependency', v_int, round(v_rel, 6) USING ERRCODE = '22023';
    END IF;
    IF v_rel > 0.1 AND v_int <> 0 THEN v_hidden := v_hidden + 1; END IF;
    v_pairs := v_pairs + 1;
  END LOOP;
  IF v_pairs <> (cardinality(v_keys) * (cardinality(v_keys) - 1)) / 2
     OR (SELECT count(DISTINCT least(y -> 'factors' ->> 0, y -> 'factors' ->> 1) || '×' || greatest(y -> 'factors' ->> 0, y -> 'factors' ->> 1)) FROM jsonb_array_elements(p_interactions) y) <> v_pairs THEN
    RAISE EXCEPTION 'envelope sweep rejected (interactions): every pair of the % swept factors is crossed once (% given)', cardinality(v_keys), v_pairs USING ERRCODE = '22023';
  END IF;
  INSERT INTO simulation.envelope_sweeps (sweep_id, scope, tenant_id, domain_id, run_id, run_outputs_digest, model_ref, implementation_digest, metric, grid_points, envelope, base_value, factors,
                                          interactions, nonlinear_factors, thresholds, hidden_dependencies, rule, digest, synthetic_state, requested_by, correlation_id)
  VALUES (p_sweep_id, 'DOMAIN', p_tenant, p_domain, p_run_id, p_outputs_digest, r.model_ref, r.implementation_digest, p_metric, p_grid_points, v_env, p_base, p_factors,
          p_interactions, v_nonlinear, v_thr, v_hidden, 'sxp-sweep@1', p_digest, true, p_actor, p_correlation)
  RETURNING * INTO v_out;
  RETURN to_jsonb(v_out) - 'tenant_id' - 'domain_id' - 'scope' - 'correlation_id';
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION simulation.sweep_envelope(uuid, uuid, uuid, uuid, text, text, int, numeric, jsonb, jsonb, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION simulation.sweep_envelope(uuid, uuid, uuid, uuid, text, text, int, numeric, jsonb, jsonb, text, uuid, uuid) TO eye_commit;

-- §EX.6 RARE EVENTS, MODEL DISCREPANCY, BENCHMARK VALIDATION, CONVERGENCE ─
/* The values of one measure in a run's outputs, in path order: its seeded sample totals (supply-flow@1's, or a chunked fabric experiment's
   projected paths), else its single deterministic total. Null when the outputs carry no value of the measure. */
CREATE OR REPLACE FUNCTION simulation.sxp_run_values(p_outputs jsonb, p_measure text) RETURNS numeric[] LANGUAGE sql IMMUTABLE
SET search_path = simulation, pg_catalog, pg_temp AS $$
  SELECT CASE WHEN jsonb_typeof(p_outputs -> 'stochastic' -> 'sample_totals') = 'array' AND jsonb_array_length(p_outputs -> 'stochastic' -> 'sample_totals') > 0 THEN
           (SELECT array_agg(CASE WHEN p_measure = 'total_cost' THEN (t -> 'cost' ->> 'total')::numeric ELSE (t ->> p_measure)::numeric END ORDER BY o)
              FROM jsonb_array_elements(p_outputs -> 'stochastic' -> 'sample_totals') WITH ORDINALITY q(t, o))
         WHEN jsonb_typeof(p_outputs -> 'totals') = 'object' THEN
           ARRAY[CASE WHEN p_measure = 'total_cost' THEN (p_outputs -> 'totals' -> 'cost' ->> 'total')::numeric ELSE (p_outputs -> 'totals' ->> p_measure)::numeric END]
         ELSE NULL END
$$;

/* VALIDATE AGAINST A BENCHMARK (simulation.benchmark.validate — a twin owner, a simulation operator, the domain administrator, a method
   steward): RECORD the validation (rule sxp-benchmark@1). The port RECOMPUTES from the run's stored paths and the entered sample: the
   counts, the means, the bias, the relative bias, the KS distance and its critical value, the run's p05–p95 band and the benchmark's share
   inside it, the tail threshold (declared, else the benchmark's p95) and both tail frequencies — every stated figure must be these; the
   VERDICT is the port's. The convergence (the running mean at every tenth of the paths) is checked at its end: the paths and the mean are
   the run's. An observed sample cites the evidence it was read from (each cited object of this tenant); a benchmark states its basis. */
CREATE OR REPLACE FUNCTION simulation.validate_benchmark(p_validation_id uuid, p_tenant uuid, p_domain uuid, p_run_id uuid, p_outputs_digest text, p_measure text, p_kind text, p_benchmark jsonb,
                                                         p_tolerance numeric, p_tail_threshold numeric, p_discrepancy jsonb, p_tail jsonb, p_convergence jsonb, p_digest text,
                                                         p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = simulation, objects, twin, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r simulation.runs_current%ROWTYPE; v_run numeric[]; v_b numeric[]; n int; m int; v_rm numeric; v_bm numeric; v_bias numeric; v_rel numeric; v_ks numeric; v_crit numeric;
        v_p05 numeric; v_p95 numeric; v_cov numeric; v_thr numeric; v_rf numeric; v_bf numeric; v_ratio numeric; v_tailv text; v_verdict text; c jsonb; v_last jsonb;
        v_disc jsonb; v_tail jsonb; v_out simulation.benchmark_validations%ROWTYPE; k text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['simulation.benchmark.validate']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'benchmark validation rejected (actor): a validation is requested by the acting principal' USING ERRCODE = '42501'; END IF;
  r := simulation.sii_run_for_analysis('benchmark validation', p_tenant, p_domain, p_run_id, p_outputs_digest);
  IF r.retired_at IS NOT NULL THEN RAISE EXCEPTION 'benchmark validation rejected (state): run % was retired at % (%); a retired result is not validated', p_run_id, r.retired_at, r.retire_reason USING ERRCODE = '22023'; END IF;
  IF p_measure IS NULL OR p_measure NOT IN ('total_cost', 'line_stop_days', 'days_below_safety_stock') THEN RAISE EXCEPTION 'benchmark validation rejected (measure): the measure is total_cost, line_stop_days or days_below_safety_stock' USING ERRCODE = '22023'; END IF;
  v_run := simulation.sxp_run_values(r.outputs, p_measure);
  IF v_run IS NULL OR cardinality(v_run) = 0 OR EXISTS (SELECT 1 FROM unnest(v_run) v WHERE v IS NULL) THEN
    RAISE EXCEPTION 'benchmark validation rejected (measure): the outputs of run % carry no % for every path', p_run_id, p_measure USING ERRCODE = '22023';
  END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('observed', 'benchmark') THEN RAISE EXCEPTION 'benchmark validation rejected (kind): the comparison is against an observed or a benchmark sample' USING ERRCODE = '22023'; END IF;
  IF p_benchmark IS NULL OR jsonb_typeof(p_benchmark -> 'values') IS DISTINCT FROM 'array' OR jsonb_array_length(p_benchmark -> 'values') = 0 OR jsonb_array_length(p_benchmark -> 'values') > 10000
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_benchmark -> 'values') x WHERE jsonb_typeof(x) <> 'number') THEN
    RAISE EXCEPTION 'benchmark validation rejected (benchmark): the sample is 1 to 10000 numbers' USING ERRCODE = '22023';
  END IF;
  IF length(btrim(coalesce(p_benchmark ->> 'basis', ''))) < 16 THEN RAISE EXCEPTION 'benchmark validation rejected (basis): the sample states its basis (at least 16 characters)' USING ERRCODE = '22023'; END IF;
  IF p_kind = 'observed' THEN
    IF jsonb_typeof(p_benchmark -> 'citations') IS DISTINCT FROM 'array' OR jsonb_array_length(p_benchmark -> 'citations') = 0 OR NOT twin.citations_ok(p_benchmark -> 'citations')
       OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_benchmark -> 'citations') x WHERE x ->> 'kind' NOT IN ('evidence', 'claim')) THEN
      RAISE EXCEPTION 'benchmark validation rejected (citations): an observed sample cites the evidence or claims it was read from ({kind, id, version, digest})' USING ERRCODE = '22023';
    END IF;
    FOR c IN SELECT x FROM jsonb_array_elements(p_benchmark -> 'citations') x LOOP
      IF NOT EXISTS (SELECT 1 FROM objects.canonical_objects o WHERE o.object_id = (c ->> 'id')::uuid AND o.object_version = (c ->> 'version')::bigint AND o.tenant_id = p_tenant) THEN
        RAISE EXCEPTION 'benchmark validation rejected (unknown_citation): % % version % is not an object of this tenant', c ->> 'kind', c ->> 'id', c ->> 'version' USING ERRCODE = '23503';
      END IF;
    END LOOP;
  END IF;
  IF p_tolerance IS NULL OR p_tolerance <= 0 OR p_tolerance > 1 THEN RAISE EXCEPTION 'benchmark validation rejected (tolerance): the tolerance is a fraction in (0, 1]' USING ERRCODE = '22023'; END IF;
  IF p_digest IS NULL OR p_digest !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'benchmark validation rejected (digest): the validation carries its digest' USING ERRCODE = '22023'; END IF;
  SELECT array_agg((x #>> '{}')::numeric ORDER BY o) INTO v_b FROM jsonb_array_elements(p_benchmark -> 'values') WITH ORDINALITY q(x, o);
  n := cardinality(v_run); m := cardinality(v_b);
  -- THE DISCREPANCY, recomputed
  SELECT avg(v) INTO v_rm FROM unnest(v_run) v;
  SELECT avg(v) INTO v_bm FROM unnest(v_b) v;
  v_bias := v_rm - v_bm;
  v_rel := CASE WHEN v_bm = 0 THEN NULL ELSE v_bias / abs(v_bm) END;
  WITH u AS (SELECT v, 1 AS a, 0 AS b FROM unnest(v_run) v UNION ALL SELECT v, 0, 1 FROM unnest(v_b) v),
       cdf AS (SELECT sum(a) OVER w AS ca, sum(b) OVER w AS cb FROM u WINDOW w AS (ORDER BY v RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW))
  SELECT max(abs(ca::numeric / n - cb::numeric / m)) INTO v_ks FROM cdf;
  v_crit := 1.358 * sqrt((n + m)::numeric / (n::numeric * m));
  SELECT percentile_cont(0.05) WITHIN GROUP (ORDER BY v), percentile_cont(0.95) WITHIN GROUP (ORDER BY v) INTO v_p05, v_p95 FROM unnest(v_run) v;
  SELECT count(*) FILTER (WHERE v >= v_p05 AND v <= v_p95)::numeric / m INTO v_cov FROM unnest(v_b) v;
  v_disc := jsonb_build_object('run_paths', n, 'benchmark_n', m, 'run_mean', round(v_rm, 6), 'benchmark_mean', round(v_bm, 6), 'bias', round(v_bias, 6),
                               'relative_bias', CASE WHEN v_rel IS NULL THEN NULL ELSE round(v_rel, 6) END, 'ks', round(v_ks, 6), 'ks_critical', round(v_crit, 6),
                               'band', jsonb_build_array(round(v_p05::numeric, 6), round(v_p95::numeric, 6)), 'coverage_in_band', round(v_cov, 6));
  -- THE TAIL (rare events), recomputed
  v_thr := coalesce(p_tail_threshold, (SELECT percentile_cont(0.95) WITHIN GROUP (ORDER BY v) FROM unnest(v_b) v));
  SELECT count(*) FILTER (WHERE v >= v_thr)::numeric / n INTO v_rf FROM unnest(v_run) v;
  SELECT count(*) FILTER (WHERE v >= v_thr)::numeric / m INTO v_bf FROM unnest(v_b) v;
  v_ratio := CASE WHEN v_bf = 0 THEN NULL ELSE v_rf / v_bf END;
  v_tailv := CASE WHEN v_bf = 0 AND v_rf = 0 THEN 'covered' WHEN v_bf = 0 THEN 'over_represented'
                  WHEN n * v_bf < 5 THEN 'insufficient_paths' WHEN v_ratio < 0.5 THEN 'under_represented' WHEN v_ratio > 2 THEN 'over_represented' ELSE 'covered' END;
  v_tail := jsonb_build_object('threshold', round(v_thr::numeric, 6), 'threshold_basis', CASE WHEN p_tail_threshold IS NULL THEN 'the benchmark''s p95' ELSE 'declared' END,
                               'run_frequency', round(v_rf, 6), 'benchmark_frequency', round(v_bf, 6), 'ratio', CASE WHEN v_ratio IS NULL THEN NULL ELSE round(v_ratio, 6) END,
                               'run_tail_paths', (SELECT count(*) FROM unnest(v_run) v WHERE v >= v_thr), 'expected_tail_paths', round(n * v_bf, 6), 'verdict', v_tailv);
  -- every stated figure must be the port's
  IF p_discrepancy IS NULL OR p_tail IS NULL THEN RAISE EXCEPTION 'benchmark validation rejected (discrepancy): the validation states its discrepancy and its tail' USING ERRCODE = '22023'; END IF;
  FOREACH k IN ARRAY ARRAY['run_mean', 'benchmark_mean', 'bias', 'ks', 'ks_critical', 'coverage_in_band'] LOOP
    IF NOT simulation.sxp_close((p_discrepancy ->> k)::numeric, (v_disc ->> k)::numeric) THEN
      RAISE EXCEPTION 'benchmark validation rejected (discrepancy): % is stated %, the run''s paths and the sample make %', k, coalesce(p_discrepancy ->> k, '<none>'), v_disc ->> k USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF (p_discrepancy -> 'relative_bias' IS NULL OR jsonb_typeof(p_discrepancy -> 'relative_bias') = 'null') IS DISTINCT FROM (v_rel IS NULL)
     OR (v_rel IS NOT NULL AND NOT simulation.sxp_close((p_discrepancy ->> 'relative_bias')::numeric, round(v_rel, 6))) THEN
    RAISE EXCEPTION 'benchmark validation rejected (discrepancy): relative_bias is stated %, the run''s paths and the sample make %', coalesce(p_discrepancy ->> 'relative_bias', 'null'), coalesce(round(v_rel, 6)::text, 'null') USING ERRCODE = '22023';
  END IF;
  FOREACH k IN ARRAY ARRAY['threshold', 'run_frequency', 'benchmark_frequency'] LOOP
    IF NOT simulation.sxp_close((p_tail ->> k)::numeric, (v_tail ->> k)::numeric) THEN
      RAISE EXCEPTION 'benchmark validation rejected (tail): % is stated %, the run''s paths and the sample make %', k, coalesce(p_tail ->> k, '<none>'), v_tail ->> k USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF coalesce(p_tail ->> 'verdict', '') <> v_tailv THEN RAISE EXCEPTION 'benchmark validation rejected (tail): the tail is stated %, its frequencies make it %', coalesce(p_tail ->> 'verdict', '<none>'), v_tailv USING ERRCODE = '22023'; END IF;
  -- THE CONVERGENCE: its last checkpoint is the run's whole path count and mean
  IF p_convergence IS NULL OR jsonb_typeof(p_convergence -> 'checkpoints') IS DISTINCT FROM 'array' OR coalesce(p_convergence ->> 'verdict', '') NOT IN ('converged', 'not_converged', 'not_applicable') THEN
    RAISE EXCEPTION 'benchmark validation rejected (convergence): the convergence states its checkpoints and its verdict (converged | not_converged | not_applicable)' USING ERRCODE = '22023';
  END IF;
  IF n = 1 THEN
    IF p_convergence ->> 'verdict' <> 'not_applicable' THEN RAISE EXCEPTION 'benchmark validation rejected (convergence): a single deterministic path has no convergence (not_applicable)' USING ERRCODE = '22023'; END IF;
  ELSE
    v_last := p_convergence -> 'checkpoints' -> (jsonb_array_length(p_convergence -> 'checkpoints') - 1);
    IF v_last IS NULL OR (v_last ->> 'paths')::int IS DISTINCT FROM n OR NOT simulation.sxp_close((v_last ->> 'mean')::numeric, round(v_rm, 6)) THEN
      RAISE EXCEPTION 'benchmark validation rejected (convergence): the last checkpoint is the run''s % paths and its mean %', n, round(v_rm, 6) USING ERRCODE = '22023';
    END IF;
  END IF;
  v_verdict := CASE WHEN m < 5 OR (r.stochastic_mode = 'seeded' AND n < 30) THEN 'insufficient'
                    WHEN (v_rel IS NOT NULL AND abs(v_rel) > p_tolerance) OR (v_rel IS NULL AND abs(v_bias) > p_tolerance) OR v_ks > v_crit OR v_tailv = 'under_represented' THEN 'discrepant'
                    ELSE 'consistent' END;
  INSERT INTO simulation.benchmark_validations (validation_id, scope, tenant_id, domain_id, run_id, run_outputs_digest, model_ref, measure, benchmark_kind, benchmark, benchmark_digest, run_paths,
                                                benchmark_n, tolerance, discrepancy, tail, convergence, verdict, rule, digest, synthetic_state, requested_by, correlation_id)
  VALUES (p_validation_id, 'DOMAIN', p_tenant, p_domain, p_run_id, p_outputs_digest, r.model_ref, p_measure, p_kind,
          jsonb_build_object('values', p_benchmark -> 'values', 'basis', btrim(p_benchmark ->> 'basis'), 'citations', coalesce(p_benchmark -> 'citations', '[]'::jsonb)),
          encode(sha256(convert_to((p_benchmark -> 'values')::text, 'UTF8')), 'hex'), n, m, p_tolerance, v_disc, v_tail,
          p_convergence, v_verdict, 'sxp-benchmark@1', p_digest, true, p_actor, p_correlation)
  RETURNING * INTO v_out;
  RETURN to_jsonb(v_out) - 'tenant_id' - 'domain_id' - 'scope' - 'correlation_id';
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION simulation.validate_benchmark(uuid, uuid, uuid, uuid, text, text, text, jsonb, numeric, numeric, jsonb, jsonb, jsonb, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION simulation.validate_benchmark(uuid, uuid, uuid, uuid, text, text, text, jsonb, numeric, numeric, jsonb, jsonb, jsonb, text, uuid, uuid) TO eye_commit;

-- §EX.7 THE READS (invoker, under the caller's RLS) ─────────────────────
/* The fabric overview of the domain: the chunkable methods with their adapter health, the experiments (their policy, checkpoint actions,
   retirement), the retirements, the sweeps and the validations — newest first, bounded. */
CREATE OR REPLACE FUNCTION simulation.fabric_overview(p_limit int) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = simulation, twin, pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object(
    'methods', (SELECT coalesce(jsonb_agg(jsonb_build_object('method_ref', m.method_ref, 'family', m.family, 'containment', m.containment, 'operating_envelope', m.operating_envelope,
                                                             'health', (SELECT jsonb_build_object('state', h.state, 'quarantined_at', h.quarantined_at, 'last_fault', h.last_fault, 'reinstated_at', h.reinstated_at)
                                                                          FROM simulation.adapter_health h WHERE h.model_ref = m.method_ref LIMIT 1)) ORDER BY m.method_ref), '[]'::jsonb)
                  FROM twin.behaviour_models m WHERE m.method_ref = ANY (simulation.sio_chunkable_methods())),
    'experiments', (SELECT coalesce(jsonb_agg(x.j ORDER BY x.declared_at DESC), '[]'::jsonb) FROM (
                      SELECT jsonb_build_object('experiment_id', e.experiment_id, 'title', e.title, 'method_ref', e.method_ref, 'state', e.state, 'on_unstable', e.on_unstable, 'paths', e.paths,
                                                'chunk_size', e.chunk_size, 'progress', e.progress, 'run_id', e.run_id, 'retirement', e.retirement, 'outcome', e.outcome,
                                                'actions', (SELECT coalesce(jsonb_agg(jsonb_build_object('event', v.event, 'details', v.details, 'occurred_at', v.occurred_at) ORDER BY v.occurred_at, v.event_id), '[]'::jsonb)
                                                              FROM simulation.experiment_events v WHERE v.experiment_id = e.experiment_id
                                                               AND v.event IN ('policy_set', 'stopped_unstable', 'paused_unstable', 'adapter_quarantined', 'review_routed', 'retired')),
                                                'last_indicators', e.indicators, 'synthetic', true) AS j, e.declared_at
                        FROM simulation.experiments e ORDER BY e.declared_at DESC LIMIT greatest(1, least(coalesce(p_limit, 50), 200))) x),
    'retirements', (SELECT coalesce(jsonb_agg(to_jsonb(t) - 'scope' - 'correlation_id' ORDER BY t.retired_at DESC), '[]'::jsonb)
                      FROM (SELECT * FROM simulation.retirements ORDER BY retired_at DESC LIMIT greatest(1, least(coalesce(p_limit, 50), 200))) t),
    'sweeps', (SELECT coalesce(jsonb_agg(to_jsonb(w) - 'scope' - 'correlation_id' ORDER BY w.swept_at DESC), '[]'::jsonb)
                 FROM (SELECT * FROM simulation.envelope_sweeps ORDER BY swept_at DESC LIMIT greatest(1, least(coalesce(p_limit, 50), 200))) w),
    'validations', (SELECT coalesce(jsonb_agg(to_jsonb(b) - 'scope' - 'correlation_id' ORDER BY b.validated_at DESC), '[]'::jsonb)
                      FROM (SELECT * FROM simulation.benchmark_validations ORDER BY validated_at DESC LIMIT greatest(1, least(coalesce(p_limit, 50), 200))) b),
    'synthetic', true)
$$;
/* One run's retirement standing: its columns, its retirement record (if any) and its reach as it stands now. */
CREATE OR REPLACE FUNCTION simulation.run_retirement(p_run_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = simulation, pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object('run_id', r.run_id, 'state', r.state, 'model_ref', r.model_ref, 'retired_at', r.retired_at, 'retired_by', r.retired_by, 'retire_reason', r.retire_reason,
                            'retirement', (SELECT to_jsonb(t) - 'scope' - 'correlation_id' FROM simulation.retirements t WHERE t.run_id = r.run_id ORDER BY t.retired_at DESC LIMIT 1),
                            'reach', simulation.sxp_retirement_reach(r.run_id),
                            'sweeps', (SELECT coalesce(jsonb_agg(to_jsonb(w) - 'scope' - 'correlation_id' ORDER BY w.swept_at DESC), '[]'::jsonb) FROM simulation.envelope_sweeps w WHERE w.run_id = r.run_id),
                            'validations', (SELECT coalesce(jsonb_agg(to_jsonb(b) - 'scope' - 'correlation_id' ORDER BY b.validated_at DESC), '[]'::jsonb) FROM simulation.benchmark_validations b WHERE b.run_id = r.run_id))
    FROM simulation.runs_current r WHERE r.run_id = p_run_id
$$;
GRANT EXECUTE ON FUNCTION simulation.fabric_overview(int), simulation.run_retirement(uuid), simulation.sxp_run_values(jsonb, text), simulation.sxp_chunk_aggregate(jsonb, text[]),
                          simulation.sxp_unstable_reading(jsonb, jsonb, jsonb), simulation.sxp_close(numeric, numeric) TO eye_app, eye_commit;
