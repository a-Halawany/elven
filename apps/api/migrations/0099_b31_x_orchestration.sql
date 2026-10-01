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
