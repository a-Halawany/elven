-- 0078 — CP-6 B18: the LIFECYCLE ANNOUNCED — ten transitions the product performs become published events, and the register's
-- ten partial rows are bound (36 bound / 14 partial / 0 unbound) — and the WITHDRAWAL → INVALIDATION → REOPEN chain: a forecast
-- withdrawn as unfit, a completed run's result invalidated (by a person, or by a reproduction that could not reproduce it), a
-- committed decision reopened on a recorded cause and re-committed as a second commitment (2026-09-17).
--
-- THE GAP. After 0077 the register held ten interfaces partial (L2-I04, L5-I04, L6-I02, L6-I05, L8-I02, L8-I03, L8-I05, L9-I02,
-- L9-I04, L9-I05): a review queued, a twin version admitted, a forecast issued, a run started, completed or failed, a package
-- proposed or committed — each a ledger row of its own module and nothing a subscriber could hear. Three of them could not even
-- happen: no port withdrew a forecast (forecasts_current admitted the state 'withdrawn' since 0029 as vocabulary — no writer set
-- it), no port marked a completed run's result unfit (runs_immutable refused any update of a completed run, and run.unverified
-- was a walk's mark, not an invalidation), and a committed package could not be reopened (open_version refused a committed
-- package outright; commit_package refused a second commitment; decision.commitments carried UNIQUE (package_id)). A run whose
-- reproduction proved it unreproducible stayed decision-active; a package resting on a withdrawn forecast was never told.
--
-- THE MECHANISM.
-- (D1) THE EVENTS are the code's — ReviewRequested, TwinStateChanged, ForecastIssued@v2, ForecastWithdrawn, SimulationStarted,
--   SimulationCompleted, SimulationInvalidated, DecisionPackageReady, DecisionCommitted, DecisionReopened — through the outbox of
--   the write that made the change (0064: the outbox takes schema_version from the payload). No objects.schema_registry row is
--   added: that table is the OBJECT-TYPE payload catalogue (0006); an event type is declared by its payload's schema and
--   schema_version and by the register row (§4), the 0066 idiom. The GraphChanged kinds forecast.withdrawn, simulation.invalidated
--   and twin.state_changed need no SQL: the subscriptions filter on their own change_kinds (0063, 0064).
-- (D2) THE WITHDRAWAL (§1) mirrors the supersession's ROW state and adds the OBJECT's: forecasts_current.state = 'withdrawn' with
--   withdrawn_at/by and the withdrawal {reason, unfit_class, dependants}; the ledger row forecast.withdrawn; and a withdrawn FCT
--   version admitted by the service in the same write under the canonical-write action prediction.forecast.withdraw (the
--   reproduction's availability check reads the canonical latest version — without the object's state the chain's automatic step
--   never fires). The dependants are NAMED (each list cut at 200): the active scenarios, the warnings (MARKED here — no consumer
--   exists for warnings), the admitted twin versions citing it, the runs whose snapshot cites it (named, never altered: a run is
--   immutable; its invalidation is the operator's or a reproduction's act), the open packages citing it. A scenario can no longer
--   be declared on a withdrawn forecast (declare_scenario).
-- (D3) THE INVALIDATION IS A COLUMN, not a state (§2): runs_current.validity valid | invalidated with invalidated_at/by and the
--   invalidation {reason, trigger, trigger_ref, dependants}; state stays completed (rebuild_projections derives it from
--   run.opened/completed/failed alone); runs_immutable admits exactly these four columns, once; run.invalidated joins the ledger.
--   The trigger is 'operator' (a person under simulation.run.invalidate, human-gated) or 'reproduction' (the reproduce write
--   under simulation.reproduce whose verdict was unreproducible, named by its reproduction id) and MUST match the context's bound
--   action; the "recorded by the acting principal" check applies to a person's act only — a reproduction's operator may act
--   through a session another principal holds. The withdrawn SIM version is admitted by the service under either action.
-- (D4) THE RESOURCE EVIDENCE (§2): complete_run gains p_resource — {elapsed_ms, samples_run, process, memory_rss_bytes} on the
--   row and in run.completed (a signature change: DROP FUNCTION + CREATE, the 0030 idiom); SimulationCompleted carries it.
-- (D5) THE REOPEN (§3): a committed or monitoring package re-enters the lifecycle on a RECORDED cause — an input.invalidated note
--   recorded on it after the commitment, or a condition breach of the committed version — named by its id: state 'reopened', the
--   cause on the row (reopened_at/by, reopened_from_version, reopen_cause, reopens), and a NEW DRAFT carried from the committed
--   version with a TOLERANT carry: each committed option is re-derived under the new cut-offs in its own block — carried when it
--   passes, DROPPED and NAMED with the port's reason when it does not (the invalidated run, the withdrawn forecast: stale or
--   withdrawn inputs exposed, never carried silently). The package row keeps its LAST commitment (committed_version, decided_at)
--   while the draft is proposed, approved and re-committed: dpk_committed_bound is relaxed to say so; ONE COMMITMENT PER
--   COMMITTED VERSION (commitments_package_version_key replaces UNIQUE (package_id); the rows stay append-only — dcm_append_only;
--   the approvals revocation-only — 0042; the committed version row stays committed — versions_immutable). commit_package admits
--   the second commitment when the package is not in a committed state and names the reopen; withdraw_package refuses a package
--   whose commitment stands (it is re-committed, not withdrawn); record_outcome reads the STANDING commitment; the replay's
--   "decided" instant becomes the COMMITMENT's (replay_layers, record_replay) — after a re-commit the package row's decided_at is
--   the second decision's, and a replay of the first committed version must close its decided layer at the first. Monitoring
--   and outcomes keep p.decided_at: they are of the standing decision.
-- (D6) THE CITATION GATE (§3): decision.derive_option — the one derivation behind set_option, the carry-forward of open_version,
--   propose_version and now the reopen's carry — refuses a run whose validity is invalidated, a forecast whose row state is
--   withdrawn (the citation names the exact issued version, which stays active in canonical_objects), and a run whose snapshot
--   cites a withdrawn forecast (a result resting on an unfit forecast is the same lie; its invalidation stays a reproduction's
--   or the operator's act).
-- (D7) The register (§4): the ten rows bound with the surface that publishes each; the counts asserted 36 / 14 / 0.
--
--   §1 prediction — the withdrawal (the columns, fct_withdrawn_bound, the canonical-write action, withdraw_forecast;
--      declare_scenario re-declared).
--   §2 simulation — the invalidation and the resource evidence (the columns, sim_invalidated_bound, run.invalidated,
--      runs_immutable re-declared, complete_run re-declared with p_resource, the two canonical-write actions, invalidate_run).
--   §3 decision — the reopen, the second commitment, the citation gate, the replay's instant (the columns, the constraints, the
--      events, commitments_package_version_key; derive_option, reopen_package, commit_package, withdraw_package, replay_layers,
--      record_replay, record_outcome re-declared).
--   §4 the interface register.
--
-- The refusals: three NEW prefixes — 'forecast withdrawal rejected: …', 'run invalidation rejected: …', 'reopen rejected: …' —
-- chosen so no earlier mapper rule catches them (42501 → 403 for "recorded by the acting principal", "the package owner reopens
-- it" and a trigger that does not match the context; 23503 → 404 for "no such …" and "is not an unreproducible reproduction";
-- 22023 → 409 for the record's state — "is withdrawn", "is superseded by", "is already invalidated", "is %, not …", "is closed",
-- "is reopened with version … open", "no recorded cause" — and 422 otherwise); 'commitment rejected: package is already committed
-- at version … and the commitment stands' keeps 0043's family; 'withdrawal rejected: package … was committed at version …' and
-- 'scenario rejected: forecast … was withdrawn as unfit' take the 409 family; the option texts ('…: run … was invalidated at …',
-- '…: forecast … was withdrawn as unfit …', '…: run … rests on a forecast withdrawn as unfit …') are 22023 → 422 through the
-- option label as 0049 left them. The mapper (observation-errors.ts) carries the new rows.

-- ============================================================
-- §1 prediction — the withdrawal (D2)
-- ============================================================
ALTER TABLE prediction.forecasts_current
  ADD COLUMN withdrawn_at timestamptz,
  ADD COLUMN withdrawn_by uuid,
  ADD COLUMN withdrawal jsonb CHECK (withdrawal IS NULL OR jsonb_typeof(withdrawal) = 'object');
-- No row is 'withdrawn' before 0078 (no port set the state — 0029:133 was vocabulary): the CHECK validates on the spot; never NOT VALID.
ALTER TABLE prediction.forecasts_current ADD CONSTRAINT fct_withdrawn_bound
  CHECK ((state = 'withdrawn') = (withdrawn_at IS NOT NULL) AND (withdrawn_at IS NULL) = (withdrawn_by IS NULL) AND (withdrawn_at IS NULL) = (withdrawal IS NULL));
COMMENT ON COLUMN prediction.forecasts_current.withdrawal IS 'B18 (0078): {reason, unfit_class, dependants {scenarios, warnings, twins, simulations, packages}} recorded by prediction.withdraw_forecast; the withdrawn FCT version is the object''s state.';

INSERT INTO observation.canonical_write_actions (action, object_types, rationale) VALUES
  ('prediction.forecast.withdraw', ARRAY['FCT'], 'Withdrawing a forecast admits the withdrawn FCT version and nothing else (B18, 0078)')
ON CONFLICT (action) DO NOTHING;

-- THE WITHDRAWAL (prediction.forecast.withdraw; the forecast owner or the domain administrator; human-gated): an ISSUED forecast is marked
-- unfit — state withdrawn with the reason and the unfit class; the DEPENDANTS named (each list cut at 200): the active scenarios resting
-- on it, the warnings resting on it or on a branch of such a scenario (MARKED here: attention input_unverified + warning.attention — no
-- consumer exists for warnings), the admitted twin versions whose elements cite it, the runs whose snapshot cites it (named, never
-- altered: a run is immutable; its invalidation is the operator's or a reproduction's act), the open packages whose current options cite it.
-- The scenario/decision/twin marks are the consumers' (GraphChanged/forecast.withdrawn, written by the service beside ForecastWithdrawn).
-- The FCT withdrawn version is admitted by the SERVICE in the same write before this port runs.
-- Refusals: withdrawn already; superseded (the successor is the live one — withdraw that); resolved or otherwise not issued; unknown.
CREATE OR REPLACE FUNCTION prediction.withdraw_forecast(
  p_forecast_id uuid, p_tenant uuid, p_domain uuid, p_reason text, p_unfit_class text, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, graph, twin, simulation, decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE f prediction.forecasts_current%ROWTYPE; v_at timestamptz := clock_timestamp(); v_scenarios jsonb; v_warnings jsonb := '[]'::jsonb; v_twins jsonb; v_runs jsonb; v_packages jsonb; v_dependants jsonb; v_truncated boolean := false; w record;
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.forecast.withdraw']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'forecast withdrawal rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF coalesce(length(btrim(p_reason)), 0) < 8 THEN RAISE EXCEPTION 'forecast withdrawal rejected: a withdrawal states its reason (at least 8 characters)' USING ERRCODE = '22023'; END IF;
  IF p_unfit_class IS NULL OR p_unfit_class NOT IN ('calibration_failure', 'data_shift', 'drift', 'envelope_breach', 'input_withdrawn', 'method_unfit', 'owner_judgement') THEN
    RAISE EXCEPTION 'forecast withdrawal rejected: unfit_class is one of calibration_failure, data_shift, drift, envelope_breach, input_withdrawn, method_unfit, owner_judgement' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO f FROM prediction.forecasts_current x WHERE x.forecast_id = p_forecast_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'forecast withdrawal rejected: no such forecast % in this domain', p_forecast_id USING ERRCODE = '23503'; END IF;
  IF f.state = 'withdrawn' THEN RAISE EXCEPTION 'forecast withdrawal rejected: forecast % is withdrawn (at %, %)', p_forecast_id, f.withdrawn_at, f.withdrawal ->> 'unfit_class' USING ERRCODE = '22023'; END IF;
  IF f.state = 'superseded' THEN RAISE EXCEPTION 'forecast withdrawal rejected: forecast % is superseded by %; the successor is the live one — withdraw that', p_forecast_id, f.superseded_by USING ERRCODE = '22023'; END IF;
  IF f.state <> 'issued' THEN RAISE EXCEPTION 'forecast withdrawal rejected: forecast % is %, not issued', p_forecast_id, f.state USING ERRCODE = '22023'; END IF;
  -- the dependants (bounded)
  SELECT coalesce(jsonb_agg(jsonb_build_object('scenario_id', s.scenario_id, 'state', s.state, 'attention_state', s.attention_state) ORDER BY s.declared_at), '[]'::jsonb) INTO v_scenarios
    FROM (SELECT * FROM prediction.scenarios_current s WHERE s.tenant_id = p_tenant AND s.domain_id = p_domain AND s.forecast_id = p_forecast_id AND s.state = 'active' ORDER BY s.declared_at LIMIT 200) s;
  v_truncated := (SELECT count(*) FROM prediction.scenarios_current s WHERE s.tenant_id = p_tenant AND s.domain_id = p_domain AND s.forecast_id = p_forecast_id AND s.state = 'active') > 200;
  FOR w IN SELECT x.* FROM prediction.warnings_current x
            WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.state IN ('raised', 'acknowledged') AND x.attention_state = 'none'
              AND (x.forecast_id = p_forecast_id
                   OR x.branch_id IN (SELECT b.branch_id FROM prediction.branches_current b JOIN prediction.scenarios_current s ON s.scenario_id = b.scenario_id
                                       WHERE s.tenant_id = p_tenant AND s.domain_id = p_domain AND s.forecast_id = p_forecast_id))
            ORDER BY x.raised_at LIMIT 200 LOOP
    UPDATE prediction.warnings_current SET attention_state = 'input_unverified', attention_reason = format('forecast %s withdrawn (%s): %s', p_forecast_id, p_unfit_class, p_reason) WHERE warning_id = w.warning_id;
    INSERT INTO prediction.warning_events (event_id, scope, tenant_id, domain_id, warning_id, event, actor_principal_id, details, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, w.warning_id, 'warning.attention', p_actor,
            jsonb_build_object('forecast_id', p_forecast_id, 'withdrawal_event_id', p_event_id, 'unfit_class', p_unfit_class, 'reason', p_reason, 'via', CASE WHEN w.forecast_id = p_forecast_id THEN 'forecast' ELSE 'scenario branch' END), p_correlation);
    v_warnings := v_warnings || jsonb_build_object('warning_id', w.warning_id, 'branch_id', w.branch_id, 'state', w.state);
  END LOOP;
  SELECT coalesce(jsonb_agg(jsonb_build_object('twin_id', t.twin_id, 'version', t.version, 'verification_state', t.verification_state) ORDER BY t.twin_id, t.version), '[]'::jsonb) INTO v_twins
    FROM (SELECT DISTINCT v.twin_id, v.version, v.verification_state FROM twin.twin_versions v JOIN twin.state_elements e ON e.twin_id = v.twin_id AND e.version = v.version
           WHERE v.tenant_id = p_tenant AND v.domain_id = p_domain AND v.state = 'admitted'
             AND EXISTS (SELECT 1 FROM jsonb_array_elements(e.citations) c WHERE (c ->> 'kind') = 'forecast' AND (c ->> 'id') = p_forecast_id::text)
           LIMIT 200) t;
  SELECT coalesce(jsonb_agg(jsonb_build_object('run_id', r.run_id, 'state', r.state, 'validity', r.validity, 'twin_id', r.twin_id, 'twin_version', r.twin_version) ORDER BY r.opened_at), '[]'::jsonb) INTO v_runs
    FROM (SELECT * FROM simulation.runs_current r WHERE r.tenant_id = p_tenant AND r.domain_id = p_domain
           AND EXISTS (SELECT 1 FROM jsonb_array_elements(r.initial_state) el, jsonb_array_elements(coalesce(el -> 'citations', '[]'::jsonb)) c WHERE (c ->> 'kind') = 'forecast' AND (c ->> 'id') = p_forecast_id::text)
          ORDER BY r.opened_at LIMIT 200) r;
  SELECT coalesce(jsonb_agg(jsonb_build_object('package_id', p.package_id, 'version', p.current_version, 'state', p.state, 'committed', p.committed_version IS NOT NULL, 'option_keys', to_jsonb(p.keys)) ORDER BY p.declared_at), '[]'::jsonb) INTO v_packages
    FROM (SELECT pk.package_id, pk.current_version, pk.state, pk.committed_version, pk.declared_at, array_agg(DISTINCT o.key ORDER BY o.key) AS keys
            FROM decision.packages_current pk JOIN decision.options o ON o.package_id = pk.package_id AND o.version = pk.current_version
           WHERE pk.tenant_id = p_tenant AND pk.domain_id = p_domain AND pk.state NOT IN ('closed', 'rejected', 'withdrawn')
             AND EXISTS (SELECT 1 FROM jsonb_array_elements(o.consequences) c WHERE (c ->> 'kind') = 'forecast' AND (c ->> 'id') = p_forecast_id::text)
           GROUP BY pk.package_id, pk.current_version, pk.state, pk.committed_version, pk.declared_at ORDER BY pk.declared_at LIMIT 200) p;
  v_dependants := jsonb_build_object('scenarios', v_scenarios, 'warnings', v_warnings, 'twins', v_twins, 'simulations', v_runs, 'packages', v_packages, 'truncated', v_truncated);
  UPDATE prediction.forecasts_current
     SET state = 'withdrawn', withdrawn_at = v_at, withdrawn_by = p_actor, updated_at = v_at,
         withdrawal = jsonb_build_object('reason', p_reason, 'unfit_class', p_unfit_class, 'dependants', v_dependants)
   WHERE forecast_id = p_forecast_id;
  INSERT INTO prediction.forecast_events (event_id, scope, tenant_id, domain_id, forecast_id, event, occurred_at, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_forecast_id, 'forecast.withdrawn', v_at, p_actor,
          jsonb_build_object('reason', p_reason, 'unfit_class', p_unfit_class, 'series_key', f.series_key, 'horizon', f.horizon_code, 'dependants', v_dependants, 'warnings_marked', jsonb_array_length(v_warnings)), p_correlation);
  RETURN jsonb_build_object('forecast_id', p_forecast_id, 'series_key', f.series_key, 'horizon', f.horizon_code, 'subject_entity_id', f.subject_entity_id, 'withdrawn_at', v_at,
                            'dependants', v_dependants, 'prior', jsonb_build_object('issued_at', f.issued_at, 'known_at', f.known_at, 'origin_at', f.origin_at, 'target_at', f.target_at, 'validation_state', f.validation_state, 'quantiles', f.quantiles, 'label', f.label, 'method', f.method, 'method_version', f.method_version));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.withdraw_forecast(uuid,uuid,uuid,text,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.withdraw_forecast(uuid,uuid,uuid,text,text,uuid,uuid,uuid) TO eye_commit;

-- declare_scenario: 0030's body with ONE guard — a scenario is not declared on a forecast withdrawn as unfit (the loop the
-- withdrawal closes; a scenario already resting on it is the consumer's mark).
CREATE OR REPLACE FUNCTION prediction.declare_scenario(
  p_scenario_id uuid, p_tenant uuid, p_domain uuid, p_title text, p_statement text,
  p_forecast_id uuid, p_subject uuid, p_owner uuid, p_review_cadence text, p_controls jsonb,
  p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS void
SECURITY DEFINER SET search_path = prediction, graph, observation, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.scenario.declare']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_forecast_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM prediction.forecasts_current f WHERE f.forecast_id = p_forecast_id
         AND f.tenant_id = p_tenant AND f.domain_id = p_domain) THEN
    RAISE EXCEPTION 'scenario rejected: no such forecast in this domain' USING ERRCODE = '23503';
  END IF;
  IF p_forecast_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM prediction.forecasts_current f WHERE f.forecast_id = p_forecast_id
         AND f.tenant_id = p_tenant AND f.domain_id = p_domain AND f.state = 'withdrawn') THEN
    RAISE EXCEPTION 'scenario rejected: forecast % was withdrawn as unfit', p_forecast_id USING ERRCODE = '22023';
  END IF;
  INSERT INTO prediction.scenarios_current (
    scenario_id, scope, tenant_id, domain_id, title, statement, forecast_id, subject_entity_id,
    owner_principal_id, review_cadence, state, correlation_id, controls
  ) VALUES (
    p_scenario_id, 'DOMAIN', p_tenant, p_domain, p_title, p_statement, p_forecast_id, p_subject,
    p_owner, p_review_cadence, 'active', p_correlation, coalesce(p_controls, '{}'::jsonb));
  INSERT INTO prediction.scenario_events (
    event_id, scope, tenant_id, domain_id, scenario_id, branch_id, event, actor_principal_id, details, correlation_id
  ) VALUES (
    p_event_id, 'DOMAIN', p_tenant, p_domain, p_scenario_id, NULL, 'scenario.declared', p_actor,
    jsonb_build_object('title', p_title, 'forecast_id', p_forecast_id, 'owner', p_owner, 'controls', p_controls), p_correlation);
  IF p_forecast_id IS NOT NULL THEN
    INSERT INTO graph.dependencies (
      dependency_id, scope, tenant_id, domain_id, dependent_object_id, dependent_type,
      depends_on_kind, depends_on_id, rationale, state, created_by, correlation_id
    ) VALUES (
      gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_scenario_id, 'SCN', 'forecast', p_forecast_id,
      'the scenario tree is built on this forecast; if the forecast is questioned so is every branch',
      'active', p_actor, p_correlation)
    ON CONFLICT DO NOTHING;
  END IF;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.declare_scenario(uuid,uuid,uuid,text,text,uuid,uuid,uuid,text,jsonb,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.declare_scenario(uuid,uuid,uuid,text,text,uuid,uuid,uuid,text,jsonb,uuid,uuid,uuid) TO eye_commit;

-- ============================================================
-- §2 simulation — the invalidation and the resource evidence (D3, D4)
-- ============================================================
ALTER TABLE simulation.runs_current
  ADD COLUMN validity text NOT NULL DEFAULT 'valid' CHECK (validity IN ('valid', 'invalidated')),
  ADD COLUMN invalidated_at timestamptz,
  ADD COLUMN invalidated_by uuid,
  ADD COLUMN invalidation jsonb CHECK (invalidation IS NULL OR jsonb_typeof(invalidation) = 'object'),
  ADD COLUMN resource jsonb CHECK (resource IS NULL OR jsonb_typeof(resource) = 'object');
ALTER TABLE simulation.runs_current ADD CONSTRAINT sim_invalidated_bound
  CHECK ((validity = 'invalidated') = (invalidated_at IS NOT NULL) AND (invalidated_at IS NULL) = (invalidated_by IS NULL) AND (invalidated_at IS NULL) = (invalidation IS NULL) AND (validity = 'valid' OR state = 'completed'));
COMMENT ON COLUMN simulation.runs_current.validity IS 'B18 (0078): valid | invalidated — the result marked unfit (simulation.invalidate_run: by the operator, or by an unreproducible reproduction); state stays completed (a completed run is immutable; run.invalidated is the ledger''s event).';
COMMENT ON COLUMN simulation.runs_current.resource IS 'B18 (0078): the resource evidence of the completion {elapsed_ms, samples_run, process {node, platform, arch}, memory_rss_bytes} — SimulationCompleted carries it.';
CREATE INDEX sim_invalidated ON simulation.runs_current (tenant_id, domain_id) WHERE validity = 'invalidated';

ALTER TABLE simulation.run_events DROP CONSTRAINT run_events_event_check;
ALTER TABLE simulation.run_events ADD CONSTRAINT run_events_event_check CHECK (event IN ('run.opened', 'run.completed', 'run.failed', 'run.reproduced', 'run.unverified', 'run.invalidated'));

-- runs_immutable: 0035's body; a completed or failed run may change ONLY its validity, once (the four B18 columns), by the invalidation port.
CREATE OR REPLACE FUNCTION simulation.runs_immutable() RETURNS trigger
SET search_path = simulation, pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'simulation runs are append-only: DELETE prohibited' USING ERRCODE = '2F002'; END IF;
  IF OLD.state IN ('completed', 'failed') THEN
    IF NEW.state <> OLD.state OR (to_jsonb(NEW) - ARRAY['validity', 'invalidated_at', 'invalidated_by', 'invalidation']) <> (to_jsonb(OLD) - ARRAY['validity', 'invalidated_at', 'invalidated_by', 'invalidation']) THEN
      RAISE EXCEPTION 'simulation run % is % and immutable; a correction is a new run that names it — only its validity changes, once, by event (0078)', OLD.run_id, OLD.state USING ERRCODE = '2F002';
    END IF;
    IF OLD.validity = 'invalidated' AND (NEW.validity <> 'invalidated' OR NEW.invalidated_at IS DISTINCT FROM OLD.invalidated_at OR NEW.invalidated_by IS DISTINCT FROM OLD.invalidated_by OR NEW.invalidation IS DISTINCT FROM OLD.invalidation) THEN
      RAISE EXCEPTION 'simulation run % was invalidated at %; an invalidation is recorded once', OLD.run_id, OLD.invalidated_at USING ERRCODE = '2F002';
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
     OR NEW.shock <> OLD.shock OR NEW.shock_basis <> OLD.shock_basis OR NEW.controls <> OLD.controls THEN
    RAISE EXCEPTION 'the experiment contract of run % is bound at opening and cannot change', OLD.run_id USING ERRCODE = '2F002';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

-- complete_run: 0035's body with p_resource (a signature change — the 0030 idiom): the resource evidence on the row and in run.completed.
DROP FUNCTION IF EXISTS simulation.complete_run(uuid,uuid,uuid,jsonb,text,jsonb,boolean,text,uuid,uuid,uuid);
CREATE OR REPLACE FUNCTION simulation.complete_run(
  p_run_id uuid, p_tenant uuid, p_domain uuid, p_outputs jsonb, p_outputs_digest text, p_sensitivity jsonb, p_outside_envelope boolean, p_header_digest text, p_resource jsonb,
  p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS void
SECURITY DEFINER SET search_path = simulation, twin, graph, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r simulation.runs_current%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['simulation.run.complete']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT * INTO r FROM simulation.runs_current WHERE run_id = p_run_id AND tenant_id = p_tenant AND domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'completion rejected: no such run in this domain' USING ERRCODE = '23503'; END IF;
  IF r.state <> 'opened' THEN RAISE EXCEPTION 'completion rejected: run % is already %', p_run_id, r.state USING ERRCODE = '2F002'; END IF;
  UPDATE simulation.runs_current
     SET outputs = p_outputs, outputs_digest = p_outputs_digest, sensitivity = p_sensitivity, outside_envelope = coalesce(p_outside_envelope, false),
         header_digest = p_header_digest, state = 'completed', completed_at = clock_timestamp(), resource = p_resource
   WHERE run_id = p_run_id;
  INSERT INTO simulation.run_events (event_id, scope, tenant_id, domain_id, run_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_run_id, 'run.completed', p_actor,
          jsonb_build_object('outputs_digest', p_outputs_digest, 'inputs_digest', r.inputs_digest, 'header_digest', p_header_digest, 'outside_envelope', coalesce(p_outside_envelope, false), 'resource', p_resource), p_correlation);
  INSERT INTO graph.dependencies (dependency_id, scope, tenant_id, domain_id, dependent_object_id, dependent_type, depends_on_kind, depends_on_id, rationale, state, created_by, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_run_id, 'SIM', 'twin', r.twin_id,
          format('run on twin version %s (branch %s)', r.twin_version, r.branch_id), 'active', p_actor, p_correlation)
  ON CONFLICT DO NOTHING;
  IF r.control_run_id IS NOT NULL THEN
    INSERT INTO graph.dependencies (dependency_id, scope, tenant_id, domain_id, dependent_object_id, dependent_type, depends_on_kind, depends_on_id, rationale, state, created_by, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_run_id, 'SIM', 'run', r.control_run_id, 'intervention run compared against this control', 'active', p_actor, p_correlation)
    ON CONFLICT DO NOTHING;
  END IF;
  IF r.scenario_id IS NOT NULL THEN
    INSERT INTO graph.dependencies (dependency_id, scope, tenant_id, domain_id, dependent_object_id, dependent_type, depends_on_kind, depends_on_id, rationale, state, created_by, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_run_id, 'SIM', 'strategy', r.scenario_id,
            format('run applied scenario version %s, branch %s (%s)', r.scenario_version, r.scenario_branch_id, r.scenario_branch_state), 'active', p_actor, p_correlation)
    ON CONFLICT DO NOTHING;
  END IF;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION simulation.complete_run(uuid,uuid,uuid,jsonb,text,jsonb,boolean,text,jsonb,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION simulation.complete_run(uuid,uuid,uuid,jsonb,text,jsonb,boolean,text,jsonb,uuid,uuid,uuid) TO eye_commit;

INSERT INTO observation.canonical_write_actions (action, object_types, rationale) VALUES
  ('simulation.run.invalidate', ARRAY['SIM'], 'Invalidating a completed run admits the withdrawn SIM version and nothing else (B18, 0078)'),
  ('simulation.reproduce', ARRAY['SIM'], 'A reproduction whose verdict is unreproducible invalidates the run in its own write: it admits the withdrawn SIM version and nothing else (B18, 0078)')
ON CONFLICT (action) DO NOTHING;

-- THE INVALIDATION (simulation.run.invalidate by a person — the twin owner, the operator or the administrator, human-gated — or simulation.reproduce by
-- the reproduction whose verdict was unreproducible; the trigger must match the context's action): a COMPLETED run's result is marked unfit —
-- validity invalidated, the reason, the trigger and its reference; the DEPENDANTS identified (cut at 200): the packages whose CURRENT version's
-- options cite the run (decision-active or committed), the commitments and decisions resting on it (graph.dependencies run), the twin versions
-- and runs citing it; run.invalidated on the ledger. The citing packages are NOTED by the decisions consumer (GraphChanged/simulation.invalidated,
-- written by the service beside SimulationInvalidated); decision.derive_option refuses the run from now on. The "recorded by the acting principal"
-- check is a PERSON's (trigger operator): a reproduction's operator may act through a session another principal holds, and invalidated_by names
-- the operator the reproduction recorded. Refusals: an opened or failed run (no result to withdraw), already invalidated, unknown, a trigger that
-- does not match the context, a reproduction reference that is not an unreproducible reproduction of this run.
CREATE OR REPLACE FUNCTION simulation.invalidate_run(
  p_run_id uuid, p_tenant uuid, p_domain uuid, p_reason text, p_trigger text, p_trigger_ref uuid, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = simulation, decision, graph, twin, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r simulation.runs_current%ROWTYPE; v_action text; v_at timestamptz := clock_timestamp(); v_packages jsonb; v_commitments jsonb; v_decisions jsonb; v_twins jsonb; v_runs jsonb; v_dependants jsonb;
BEGIN
  v_action := observation.assert_authority(ARRAY['simulation.run.invalidate', 'simulation.reproduce']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_trigger IS NULL OR p_trigger NOT IN ('operator', 'reproduction') THEN RAISE EXCEPTION 'run invalidation rejected: the trigger is operator (a person''s act) or reproduction (an unreproducible verdict)' USING ERRCODE = '22023'; END IF;
  IF (v_action = 'simulation.reproduce') <> (p_trigger = 'reproduction') THEN
    RAISE EXCEPTION 'run invalidation rejected: a reproduction invalidates under simulation.reproduce with trigger reproduction; a person under simulation.run.invalidate with trigger operator (context %, trigger %)', v_action, p_trigger USING ERRCODE = '42501';
  END IF;
  IF p_trigger = 'operator' AND p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'run invalidation rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF coalesce(length(btrim(p_reason)), 0) < 8 THEN RAISE EXCEPTION 'run invalidation rejected: an invalidation states its reason (at least 8 characters)' USING ERRCODE = '22023'; END IF;
  SELECT * INTO r FROM simulation.runs_current x WHERE x.run_id = p_run_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'run invalidation rejected: no such run % in this domain', p_run_id USING ERRCODE = '23503'; END IF;
  IF r.validity = 'invalidated' THEN RAISE EXCEPTION 'run invalidation rejected: run % is already invalidated (at %, trigger %)', p_run_id, r.invalidated_at, r.invalidation ->> 'trigger' USING ERRCODE = '22023'; END IF;
  IF r.state <> 'completed' THEN RAISE EXCEPTION 'run invalidation rejected: run % is %, not completed — only a completed result is invalidated (an opened run has no result; a failed one none to withdraw)', p_run_id, r.state USING ERRCODE = '22023'; END IF;
  IF p_trigger = 'reproduction' AND NOT EXISTS (SELECT 1 FROM simulation.reproductions q WHERE q.reproduction_id = p_trigger_ref AND q.run_id = p_run_id AND q.verdict = 'unreproducible') THEN
    RAISE EXCEPTION 'run invalidation rejected: % is not an unreproducible reproduction of run %', p_trigger_ref, p_run_id USING ERRCODE = '23503';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('package_id', p.package_id, 'version', p.current_version, 'state', p.state, 'committed', p.committed_version IS NOT NULL, 'option_keys', to_jsonb(p.keys)) ORDER BY p.declared_at), '[]'::jsonb) INTO v_packages
    FROM (SELECT pk.package_id, pk.current_version, pk.state, pk.committed_version, pk.declared_at, array_agg(DISTINCT o.key ORDER BY o.key) AS keys
            FROM decision.packages_current pk JOIN decision.options o ON o.package_id = pk.package_id AND o.version = pk.current_version
           WHERE pk.tenant_id = p_tenant AND pk.domain_id = p_domain AND pk.state NOT IN ('closed', 'rejected', 'withdrawn')
             AND EXISTS (SELECT 1 FROM jsonb_array_elements(o.consequences) c WHERE (c ->> 'kind') = 'run' AND (c ->> 'id') = p_run_id::text)
           GROUP BY pk.package_id, pk.current_version, pk.state, pk.committed_version, pk.declared_at ORDER BY pk.declared_at LIMIT 200) p;
  SELECT coalesce(jsonb_agg(d.dependent_object_id ORDER BY d.created_at), '[]'::jsonb) INTO v_commitments
    FROM (SELECT * FROM graph.dependencies d WHERE d.tenant_id = p_tenant AND d.domain_id = p_domain AND d.state = 'active' AND d.depends_on_kind = 'run' AND d.depends_on_id = p_run_id AND d.dependent_type = 'CMT' ORDER BY d.created_at LIMIT 200) d;
  SELECT coalesce(jsonb_agg(d.dependent_object_id ORDER BY d.created_at), '[]'::jsonb) INTO v_decisions
    FROM (SELECT * FROM graph.dependencies d WHERE d.tenant_id = p_tenant AND d.domain_id = p_domain AND d.state = 'active' AND d.depends_on_kind = 'run' AND d.depends_on_id = p_run_id AND d.dependent_type = 'DEC' ORDER BY d.created_at LIMIT 200) d;
  SELECT coalesce(jsonb_agg(jsonb_build_object('twin_id', t.twin_id, 'version', t.version, 'verification_state', t.verification_state) ORDER BY t.twin_id, t.version), '[]'::jsonb) INTO v_twins
    FROM (SELECT DISTINCT v.twin_id, v.version, v.verification_state FROM twin.twin_versions v JOIN twin.state_elements e ON e.twin_id = v.twin_id AND e.version = v.version
           WHERE v.tenant_id = p_tenant AND v.domain_id = p_domain AND v.state = 'admitted'
             AND EXISTS (SELECT 1 FROM jsonb_array_elements(e.citations) c WHERE (c ->> 'kind') = 'run' AND (c ->> 'id') = p_run_id::text) LIMIT 200) t;
  SELECT coalesce(jsonb_agg(jsonb_build_object('run_id', x.run_id, 'via', x.via, 'state', x.state, 'validity', x.validity) ORDER BY x.opened_at), '[]'::jsonb) INTO v_runs
    FROM (SELECT q.run_id, q.state, q.validity, q.opened_at, CASE WHEN q.control_run_id = p_run_id THEN 'control' ELSE 'citation' END AS via FROM simulation.runs_current q
           WHERE q.tenant_id = p_tenant AND q.domain_id = p_domain AND q.run_id <> p_run_id
             AND (q.control_run_id = p_run_id OR EXISTS (SELECT 1 FROM jsonb_array_elements(q.initial_state) el, jsonb_array_elements(coalesce(el -> 'citations', '[]'::jsonb)) c WHERE (c ->> 'kind') = 'run' AND (c ->> 'id') = p_run_id::text))
           ORDER BY q.opened_at LIMIT 200) x;
  v_dependants := jsonb_build_object('packages', v_packages, 'commitments', v_commitments, 'decisions', v_decisions, 'twins', v_twins, 'simulations', v_runs);
  UPDATE simulation.runs_current SET validity = 'invalidated', invalidated_at = v_at, invalidated_by = p_actor,
         invalidation = jsonb_build_object('reason', p_reason, 'trigger', p_trigger, 'trigger_ref', p_trigger_ref, 'dependants', v_dependants) WHERE run_id = p_run_id;
  INSERT INTO simulation.run_events (event_id, scope, tenant_id, domain_id, run_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_run_id, 'run.invalidated', p_actor,
          jsonb_build_object('reason', p_reason, 'trigger', p_trigger, 'trigger_ref', p_trigger_ref, 'invalidated_at', v_at, 'dependants', v_dependants, 'outputs_digest', r.outputs_digest), p_correlation);
  RETURN jsonb_build_object('run_id', p_run_id, 'invalidated_at', v_at, 'trigger', p_trigger, 'trigger_ref', p_trigger_ref, 'dependants', v_dependants,
                            'run', jsonb_build_object('twin_id', r.twin_id, 'twin_version', r.twin_version, 'branch_id', r.branch_id, 'run_kind', r.run_kind, 'control_run_id', r.control_run_id, 'scenario_id', r.scenario_id, 'scenario_version', r.scenario_version,
                                                      'outputs_digest', r.outputs_digest, 'inputs_digest', r.inputs_digest, 'header_digest', r.header_digest, 'completed_at', r.completed_at, 'operator_principal_id', r.operator_principal_id, 'validation_status', r.validation_status));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION simulation.invalidate_run(uuid,uuid,uuid,text,text,uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION simulation.invalidate_run(uuid,uuid,uuid,text,text,uuid,uuid,uuid,uuid) TO eye_commit;

-- ============================================================
-- §3 decision — the reopen, the second commitment, the citation gate, the replay's instant (D5, D6)
-- ============================================================
ALTER TABLE decision.packages_current
  ADD COLUMN reopened_at timestamptz,
  ADD COLUMN reopened_by uuid,
  ADD COLUMN reopened_from_version int CHECK (reopened_from_version IS NULL OR reopened_from_version >= 1),
  ADD COLUMN reopen_cause jsonb CHECK (reopen_cause IS NULL OR jsonb_typeof(reopen_cause) = 'object'),
  ADD COLUMN reopens int NOT NULL DEFAULT 0 CHECK (reopens >= 0);
ALTER TABLE decision.packages_current DROP CONSTRAINT packages_current_state_check;
ALTER TABLE decision.packages_current ADD CONSTRAINT packages_current_state_check
  CHECK (state IN ('draft', 'proposed', 'under_review', 'approved', 'committed', 'monitoring', 'closed', 'rejected', 'withdrawn', 'reopened'));
ALTER TABLE decision.packages_current DROP CONSTRAINT dpk_committed_bound;
-- B18 (0078): a reopened package keeps its LAST commitment (committed_version, decided_at) while its new draft is proposed, approved and re-committed;
-- the commitment rows are append-only and the approvals revocation-only (0042) — the earlier decision is history, never rewritten.
ALTER TABLE decision.packages_current ADD CONSTRAINT dpk_committed_bound CHECK (
  ((committed_version IS NULL) = (decided_at IS NULL))
  AND (state NOT IN ('committed', 'monitoring', 'closed', 'reopened') OR committed_version IS NOT NULL)
  AND (committed_version IS NULL OR state IN ('committed', 'monitoring', 'closed') OR reopened_at IS NOT NULL));
ALTER TABLE decision.packages_current ADD CONSTRAINT dpk_reopened_bound CHECK (
  (reopened_at IS NULL) = (reopened_by IS NULL) AND (reopened_at IS NULL) = (reopened_from_version IS NULL) AND (reopened_at IS NULL) = (reopen_cause IS NULL) AND (reopened_at IS NULL OR reopens >= 1));
COMMENT ON COLUMN decision.packages_current.reopen_cause IS 'B18 (0078): the recorded cause of the LAST reopen — {kind input_invalidated | condition_breach, ref, recorded_at, …} as decision.reopen_package read it; reopened_from_version the commitment it reopened; reopens the count.';
ALTER TABLE decision.package_events DROP CONSTRAINT package_events_event_check;
ALTER TABLE decision.package_events ADD CONSTRAINT package_events_event_check CHECK (event IN (
  'package.declared', 'version.opened', 'option.set', 'terms.set', 'choice.set', 'dissent.recorded', 'version.proposed',
  'review.recorded', 'version.approved', 'approval.revoked', 'version.rejected', 'package.committed', 'package.withdrawn',
  'outcome.recorded', 'package.closed', 'commit.refused', 'replay.recorded', 'condition.breached', 'review.overdue', 'input.invalidated', 'package.reopened'));
-- B18 (0078): one commitment per COMMITTED VERSION — a reopened package re-commits its new version; the earlier row stands (dcm_append_only).
-- The dcm_version FK on (package_id, version) stays: a version is committed once, a package as many times as it is reopened. The concurrent
-- commit of one version is still serialised by commit_package's FOR UPDATE on the package row.
ALTER TABLE decision.commitments DROP CONSTRAINT commitments_package_id_key;
ALTER TABLE decision.commitments ADD CONSTRAINT commitments_package_version_key UNIQUE (package_id, version);

-- derive_option: 0049's body (same attributes) with the citation gate — a run whose validity is invalidated, a forecast whose row state is
-- withdrawn (the cited issued version stays active in canonical_objects: the row's state is the refusal), and a run whose snapshot cites a
-- withdrawn forecast are refused from now on: at set_option, at the carry-forward, at propose and at the reopen's carry. search_path gains prediction.
CREATE OR REPLACE FUNCTION decision.derive_option(
  p_tenant uuid, p_domain uuid, p_known_at timestamptz, p_observed_through date, p_consequences jsonb, p_unsimulated_reason text, p_label text
) RETURNS jsonb
STABLE SECURITY DEFINER SET search_path = decision, simulation, twin, prediction, objects, pg_catalog, pg_temp AS $$
DECLARE
  c jsonb; o record; r record; tv record; tw record;
  v_type text; v_basis jsonb := '[]'::jsonb; v_inputs jsonb := '[]'::jsonb; v_b jsonb; v_simulated boolean := false;
  v_uncertainty jsonb; v_controls jsonb; v_synthetic boolean;
BEGIN
  IF NOT decision.citations_ok(p_consequences) THEN RAISE EXCEPTION '%: consequences must be typed citations with id, version and digest', p_label USING ERRCODE = '22023'; END IF;
  FOR c IN SELECT * FROM jsonb_array_elements(p_consequences) LOOP
    v_type := CASE c ->> 'kind' WHEN 'run' THEN 'SIM' WHEN 'forecast' THEN 'FCT' WHEN 'claim' THEN 'CLM' WHEN 'evidence' THEN 'EVD' WHEN 'assumption' THEN 'ASU' WHEN 'warning' THEN 'WRN' END;
    IF v_type IS NULL THEN RAISE EXCEPTION '%: consequence kind % is not one an option cites', p_label, c ->> 'kind' USING ERRCODE = '22023'; END IF;
    SELECT * INTO o FROM objects.canonical_objects x
     WHERE x.object_type = v_type AND x.object_id = (c ->> 'id')::uuid AND x.object_version = (c ->> 'version')::int AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
    IF NOT FOUND THEN RAISE EXCEPTION '%: citation %@% is not a recorded % in this domain', p_label, c ->> 'id', c ->> 'version', v_type USING ERRCODE = '23503'; END IF;
    IF o.content_digest IS DISTINCT FROM (c ->> 'digest') THEN
      RAISE EXCEPTION '%: citation %@% carries digest %, not the recorded digest %', p_label, c ->> 'id', c ->> 'version', c ->> 'digest', o.content_digest USING ERRCODE = '22023';
    END IF;
    IF o.lifecycle_state IN ('withdrawn', 'deleted') THEN RAISE EXCEPTION '%: citation %@% is %; a consequence cannot rest on it', p_label, c ->> 'id', c ->> 'version', o.lifecycle_state USING ERRCODE = '22023'; END IF;
    IF v_type <> 'SIM' THEN
      -- B18 (0078): a withdrawn forecast's issued version is still active in canonical_objects (the withdrawn version is v2); the row's state refuses it.
      IF v_type = 'FCT' AND EXISTS (SELECT 1 FROM prediction.forecasts_current f WHERE f.forecast_id = (c ->> 'id')::uuid AND f.tenant_id = p_tenant AND f.domain_id = p_domain AND f.state = 'withdrawn') THEN
        RAISE EXCEPTION '%: forecast % was withdrawn as unfit (%: %); a consequence cannot rest on it', p_label, c ->> 'id',
          (SELECT f.withdrawal ->> 'unfit_class' FROM prediction.forecasts_current f WHERE f.forecast_id = (c ->> 'id')::uuid), (SELECT f.withdrawal ->> 'reason' FROM prediction.forecasts_current f WHERE f.forecast_id = (c ->> 'id')::uuid) USING ERRCODE = '22023';
      END IF;
      IF o.recorded_at > p_known_at THEN
        RAISE EXCEPTION '%: citation %@% was recorded at %, after the version''s known_at %', p_label, c ->> 'id', c ->> 'version', decision.iso(o.recorded_at), decision.iso(p_known_at) USING ERRCODE = '22023';
      END IF;
      IF p_observed_through IS NOT NULL AND o.event_time IS NOT NULL AND o.event_time::date > p_observed_through THEN
        RAISE EXCEPTION '%: citation %@% has event time %, after the version''s observed_through %', p_label, c ->> 'id', c ->> 'version', decision.iso(o.event_time), p_observed_through USING ERRCODE = '22023';
      END IF;
      v_b := jsonb_build_object('kind', c ->> 'kind', 'id', c ->> 'id', 'version', (c ->> 'version')::int, 'digest', o.content_digest, 'object_type', v_type,
                                'truth_state', o.truth_state, 'synthetic_state', o.synthetic_state, 'lifecycle_state', o.lifecycle_state, 'quality_state', o.quality_state,
                                'classification', o.classification, 'recorded_at', decision.iso(o.recorded_at), 'event_time', decision.iso(o.event_time));
    ELSE
      SELECT * INTO r FROM simulation.runs_current x WHERE x.run_id = (c ->> 'id')::uuid AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
      IF NOT FOUND OR r.state <> 'completed' THEN RAISE EXCEPTION '%: run % is not a completed run in this domain', p_label, c ->> 'id' USING ERRCODE = '23503'; END IF;
      -- B18 (0078): an invalidated result, and a result resting on a withdrawn forecast, are not decision-citable.
      IF r.validity = 'invalidated' THEN
        RAISE EXCEPTION '%: run % was invalidated at % (%: %); a consequence cannot rest on an invalidated result', p_label, c ->> 'id', decision.iso(r.invalidated_at), r.invalidation ->> 'trigger', r.invalidation ->> 'reason' USING ERRCODE = '22023';
      END IF;
      -- (alias fc, not c: c is the loop's variable and would be substituted)
      IF EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(r.initial_state, '[]'::jsonb)) el, jsonb_array_elements(coalesce(el -> 'citations', '[]'::jsonb)) fc
                   JOIN prediction.forecasts_current f ON f.forecast_id = (fc ->> 'id')::uuid AND f.tenant_id = p_tenant AND f.domain_id = p_domain
                  WHERE (fc ->> 'kind') = 'forecast' AND f.state = 'withdrawn') THEN
        RAISE EXCEPTION '%: run % rests on a forecast withdrawn as unfit; a consequence cannot rest on it until the run is re-issued on a live forecast', p_label, c ->> 'id' USING ERRCODE = '22023';
      END IF;
      IF r.known_at > p_known_at THEN
        RAISE EXCEPTION '%: run % rests on inputs known at %, after the version''s known_at %; a run may complete later, its inputs may not', p_label, c ->> 'id', decision.iso(r.known_at), decision.iso(p_known_at) USING ERRCODE = '22023';
      END IF;
      IF p_observed_through IS NOT NULL AND r.observed_through IS NOT NULL AND r.observed_through > p_observed_through THEN
        RAISE EXCEPTION '%: run % rests on observations through %, after the version''s observed_through %', p_label, c ->> 'id', r.observed_through, p_observed_through USING ERRCODE = '22023';
      END IF;
      SELECT * INTO tv FROM twin.twin_versions x WHERE x.twin_id = r.twin_id AND x.version = r.twin_version;
      SELECT * INTO tw FROM twin.twins_current x WHERE x.twin_id = r.twin_id;
      v_simulated := true;
      v_b := jsonb_build_object('kind', 'run', 'id', c ->> 'id', 'version', (c ->> 'version')::int, 'digest', o.content_digest, 'object_type', 'SIM',
                                'truth_state', o.truth_state, 'synthetic_state', o.synthetic_state, 'lifecycle_state', o.lifecycle_state, 'quality_state', o.quality_state,
                                'classification', o.classification, 'recorded_at', decision.iso(o.recorded_at),
                                'run_kind', r.run_kind, 'control_run_id', r.control_run_id, 'twin_id', r.twin_id, 'twin_version', r.twin_version,
                                'known_at', decision.iso(r.known_at), 'observed_through', r.observed_through, 'completed_at', decision.iso(r.completed_at),
                                'validation_status', r.validation_status,
                                'outside_envelope', coalesce(r.outside_envelope, false) OR coalesce((r.sensitivity ->> 'outside_envelope')::boolean, false),
                                'sensitivity', jsonb_build_object('relative', r.sensitivity -> 'relative', 'factors', coalesce(r.sensitivity -> 'factors', '[]'::jsonb), 'outside_envelope', r.sensitivity -> 'outside_envelope'),
                                'inherited_validation', coalesce((SELECT jsonb_agg(jsonb_build_object('key', e ->> 'key', 'state', e ->> 'inherited_validation', 'citations', e -> 'citations'))
                                                                    FROM jsonb_array_elements(coalesce(r.initial_state, '[]'::jsonb)) e
                                                                   WHERE (e ->> 'kind') = 'predicted' AND (e ->> 'inherited_validation') IS NOT NULL), '[]'::jsonb),
                                'twin_validation', jsonb_build_object('status', tw.validation ->> 'status', 'limitations', tw.validation -> 'limitations',
                                                                      'version_state', tv.state, 'version_completeness', tv.completeness, 'version_synthetic_state', tv.synthetic_state));
    END IF;
    v_basis := v_basis || v_b;
    v_inputs := v_inputs || jsonb_build_object('synthetic_state', o.synthetic_state, 'classification', o.classification, 'rights_profile', o.rights_profile,
                                               'residency_profile', o.residency_profile, 'retention_profile', o.retention_profile, 'access_policy_ref', o.access_policy_ref);
  END LOOP;
  IF NOT v_simulated AND length(btrim(coalesce(p_unsimulated_reason, ''))) < 8 THEN
    RAISE EXCEPTION '%: no consequence cites a completed run; say why the option is unsimulated', p_label USING ERRCODE = '22023';
  END IF;
  v_uncertainty := jsonb_build_object(
    'method', 'derived-at-port@2', 'citations', jsonb_array_length(v_basis),
    'synthetic_inputs', (SELECT count(*) FROM jsonb_array_elements(v_basis) b WHERE (b ->> 'synthetic_state')::boolean),
    'unvalidated_runs', (SELECT count(*) FROM jsonb_array_elements(v_basis) b WHERE (b ->> 'kind') = 'run' AND coalesce(b ->> 'validation_status', '') NOT IN ('validated', 'validated_retrospective')),
    'outside_envelope_runs', (SELECT count(*) FROM jsonb_array_elements(v_basis) b WHERE (b ->> 'kind') = 'run' AND (b ->> 'outside_envelope')::boolean),
    'truth_states', coalesce((SELECT jsonb_agg(t ORDER BY t) FROM (SELECT DISTINCT b ->> 'truth_state' t FROM jsonb_array_elements(v_basis) b) s), '[]'::jsonb),
    'basis', v_basis);
  v_controls := CASE WHEN jsonb_array_length(v_inputs) = 0 THEN decision.fold_controls('[{"synthetic_state": false, "classification": "internal"}]'::jsonb) ELSE decision.fold_controls(v_inputs) END;
  v_synthetic := jsonb_array_length(v_inputs) > 0 AND (v_controls ->> 'synthetic_state')::boolean;
  RETURN jsonb_build_object('uncertainty', v_uncertainty, 'controls', v_controls, 'synthetic_state', v_synthetic, 'simulated', v_simulated);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.derive_option(uuid,uuid,timestamptz,date,jsonb,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.derive_option(uuid,uuid,timestamptz,date,jsonb,text,text) TO eye_app, eye_commit;

-- THE REOPEN (decision.package.reopen; the package owner; human-gated): a COMMITTED (or monitoring) package re-enters the lifecycle on a RECORDED
-- cause — an input.invalidated note recorded on it after the commitment, or a condition breach of the committed version — named by its id:
-- state reopened, the cause on the row, a NEW DRAFT version carried from the committed version (its objectives, constraints, policy, conditions
-- and the options that still enter the new cut-offs and rest on nothing withdrawn or invalidated — the rest DROPPED and NAMED with the port's
-- reason: stale or withdrawn inputs exposed, never carried silently). The commitment row, the approvals and the committed version stand as
-- they are (0042/0043); the draft then goes propose → approve → commit, and the commit lands a SECOND commitment. The two ledger rows: version.opened
-- at the reopen's instant, package.reopened by the column default — the second after the first. Refusals: a draft, proposed, under-review,
-- approved, rejected or withdrawn package (not committed), a closed one (a new package is declared), a reopened one (its draft is proposed
-- first), an open draft, a cause that is not this package's or was recorded before the commitment (no recorded cause), a non-owner.
CREATE OR REPLACE FUNCTION decision.reopen_package(
  p_package_id uuid, p_tenant uuid, p_domain uuid, p_cause jsonb, p_known_at timestamptz, p_observed_through date, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, simulation, twin, prediction, objects, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE p decision.packages_current%ROWTYPE; cv decision.package_versions%ROWTYPE; c decision.commitments%ROWTYPE; n decision.package_events%ROWTYPE; b decision.condition_breaches%ROWTYPE;
        v_kind text; v_ref uuid; v_cause jsonb; v_exposed jsonb := '[]'::jsonb; v_next int; v_open int; opt record; d jsonb; v_carried jsonb := '[]'::jsonb; v_dropped jsonb := '[]'::jsonb;
        v_at timestamptz := clock_timestamp(); v_known timestamptz; v_obs date; v_err text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.package.reopen']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'reopen rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF p_cause IS NULL OR jsonb_typeof(p_cause) <> 'object' OR coalesce(p_cause ->> 'kind', '') NOT IN ('input_invalidated', 'condition_breach') OR coalesce(p_cause ->> 'ref', '') !~ '^[0-9a-f-]{36}$' THEN
    RAISE EXCEPTION 'reopen rejected: a cause is a recorded input_invalidated note or a condition_breach of this package, named by its id ({kind, ref})' USING ERRCODE = '22023';
  END IF;
  v_kind := p_cause ->> 'kind'; v_ref := (p_cause ->> 'ref')::uuid;
  SELECT * INTO p FROM decision.packages_current x WHERE x.package_id = p_package_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'reopen rejected: no such package in this domain' USING ERRCODE = '23503'; END IF;
  IF p.owner_principal_id <> p_actor THEN RAISE EXCEPTION 'reopen rejected: the package owner reopens it' USING ERRCODE = '42501'; END IF;
  IF p.state = 'reopened' THEN RAISE EXCEPTION 'reopen rejected: package % is reopened with version % open; propose and commit it before reopening again', p_package_id, p.current_version USING ERRCODE = '22023'; END IF;
  IF p.state = 'closed' THEN RAISE EXCEPTION 'reopen rejected: package % is closed; a closed decision is not reopened — a new package is declared', p_package_id USING ERRCODE = '22023'; END IF;
  IF p.state NOT IN ('committed', 'monitoring') THEN RAISE EXCEPTION 'reopen rejected: package % is %, not committed — a decision is reopened from its commitment; a draft or a proposal is versioned', p_package_id, p.state USING ERRCODE = '22023'; END IF;
  SELECT * INTO cv FROM decision.package_versions x WHERE x.package_id = p_package_id AND x.version = p.committed_version;
  SELECT * INTO c FROM decision.commitments x WHERE x.package_id = p_package_id AND x.version = p.committed_version;
  IF v_kind = 'input_invalidated' THEN
    SELECT * INTO n FROM decision.package_events e WHERE e.event_id = v_ref AND e.package_id = p_package_id AND e.event = 'input.invalidated';
    IF NOT FOUND THEN RAISE EXCEPTION 'reopen rejected: no such note % on package %', v_ref, p_package_id USING ERRCODE = '23503'; END IF;
    IF n.occurred_at <= c.committed_at THEN RAISE EXCEPTION 'reopen rejected: no recorded cause — note % was recorded at %, before the commitment at %; what was known at the decision is not a cause to reopen it', v_ref, decision.iso(n.occurred_at), decision.iso(c.committed_at) USING ERRCODE = '22023'; END IF;
    v_cause := jsonb_build_object('kind', v_kind, 'ref', v_ref, 'recorded_at', n.occurred_at, 'change_kind', n.details ->> 'change_kind', 'via', n.details -> 'via', 'failure_class', n.details ->> 'failure_class', 'disposition', n.details ->> 'disposition', 'note', n.details ->> 'note', 'outbox_event_id', n.details ->> 'outbox_event_id');
    v_exposed := coalesce(n.details -> 'via', '[]'::jsonb);
  ELSE
    SELECT * INTO b FROM decision.condition_breaches x WHERE x.breach_id = v_ref AND x.package_id = p_package_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'reopen rejected: no such breach % on package %', v_ref, p_package_id USING ERRCODE = '23503'; END IF;
    IF b.version <> p.committed_version THEN RAISE EXCEPTION 'reopen rejected: no recorded cause — breach % is of version %, not the standing commitment (version %)', v_ref, b.version, p.committed_version USING ERRCODE = '22023'; END IF;
    v_cause := jsonb_build_object('kind', v_kind, 'ref', v_ref, 'recorded_at', b.detected_at, 'condition_index', b.condition_index, 'condition', b.condition, 'warning_id', b.warning_id, 'routed_to', b.routed_to);
    v_exposed := jsonb_build_array(jsonb_build_object('kind', 'warning', 'id', b.warning_id, 'condition_index', b.condition_index));
  END IF;
  SELECT count(*) INTO v_open FROM decision.package_versions v WHERE v.package_id = p_package_id AND v.state = 'draft';
  IF v_open > 0 THEN RAISE EXCEPTION 'reopen rejected: the package already has an open draft; propose it or withdraw it' USING ERRCODE = '22023'; END IF;
  v_known := coalesce(p_known_at, v_at); v_obs := coalesce(p_observed_through, cv.observed_through);
  SELECT coalesce(max(version), 0) + 1 INTO v_next FROM decision.package_versions WHERE package_id = p_package_id;
  INSERT INTO decision.package_versions (package_id, version, scope, tenant_id, domain_id, supersedes, state, known_at, observed_through, objectives, constraints, approver_policy, monitoring_conditions,
                                         reversibility, information_value, second_order, risks, opportunities, author_principal_id, correlation_id)
  VALUES (p_package_id, v_next, 'DOMAIN', p_tenant, p_domain, p.committed_version, 'draft', v_known, v_obs, cv.objectives, cv.constraints, cv.approver_policy, cv.monitoring_conditions,
          cv.reversibility, cv.information_value, cv.second_order, cv.risks, cv.opportunities, p_actor, p_correlation);
  -- the tolerant carry: each committed option re-derived under the new cut-offs in its own block — dropped and named when it does not enter them
  FOR opt IN SELECT * FROM decision.options x WHERE x.package_id = p_package_id AND x.version = p.committed_version ORDER BY x.key LOOP
    BEGIN
      d := decision.derive_option(p_tenant, p_domain, v_known, v_obs, opt.consequences, opt.unsimulated_reason, format('reopen: carried option %s', opt.key));
      INSERT INTO decision.options (option_id, scope, tenant_id, domain_id, package_id, version, key, title, kind, consequences, simulated, unsimulated_reason,
                                    uncertainty, second_order, risks, opportunities, reversibility, synthetic_state, controls, set_by, correlation_id)
      VALUES (gen_random_uuid(), opt.scope, opt.tenant_id, opt.domain_id, opt.package_id, v_next, opt.key, opt.title, opt.kind, opt.consequences, (d ->> 'simulated')::boolean,
              CASE WHEN (d ->> 'simulated')::boolean THEN NULL ELSE opt.unsimulated_reason END,
              d -> 'uncertainty', opt.second_order, opt.risks, opt.opportunities, opt.reversibility, (d ->> 'synthetic_state')::boolean, d -> 'controls', p_actor, p_correlation);
      v_carried := v_carried || to_jsonb(opt.key);
    EXCEPTION WHEN SQLSTATE '22023' OR SQLSTATE '23503' THEN
      GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
      v_dropped := v_dropped || jsonb_build_object('key', opt.key, 'reason', v_err);
    END;
  END LOOP;
  UPDATE decision.packages_current
     SET state = 'reopened', current_version = v_next, reopened_at = v_at, reopened_by = p_actor, reopened_from_version = p.committed_version, reopen_cause = v_cause, reopens = reopens + 1
   WHERE package_id = p_package_id;
  INSERT INTO decision.package_events (event_id, scope, tenant_id, domain_id, package_id, event, actor_principal_id, details, occurred_at, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_package_id, 'version.opened', p_actor,
          jsonb_build_object('version', v_next, 'supersedes', p.committed_version, 'known_at', v_known, 'observed_through', v_obs, 'carried_from', p.committed_version, 'carried_options_rederived', true, 'reopened', true), v_at, p_correlation);
  INSERT INTO decision.package_events (event_id, scope, tenant_id, domain_id, package_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_package_id, 'package.reopened', p_actor,
          jsonb_build_object('committed_version', p.committed_version, 'commitment_id', c.commitment_id, 'committed_at', c.committed_at, 'new_version', v_next, 'cause', v_cause, 'exposed_inputs', v_exposed,
                             'options_carried', v_carried, 'options_dropped', v_dropped, 'known_at', v_known, 'observed_through', v_obs, 'reopens', p.reopens + 1), p_correlation);
  RETURN jsonb_build_object('package_id', p_package_id, 'committed_version', p.committed_version, 'commitment_id', c.commitment_id, 'committed_at', c.committed_at, 'new_version', v_next, 'cause', v_cause,
                            'exposed_inputs', v_exposed, 'options_carried', v_carried, 'options_dropped', v_dropped, 'reopened_at', v_at, 'reopens', p.reopens + 1, 'known_at', v_known, 'observed_through', v_obs);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.reopen_package(uuid,uuid,uuid,jsonb,timestamptz,date,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.reopen_package(uuid,uuid,uuid,jsonb,timestamptz,date,uuid,uuid,uuid) TO eye_commit;

-- commit_package: 0043's body with three edits — the guard admits a second commitment when the package is not in a committed state (a
-- reopened → proposed → approved package commits anew: a new commitments row, committed_version := the new version, decided_at := now);
-- the package.committed details and the answer name the reopen (reopened_from). Everything else — C3, the bound action, the human, the
-- quorum, the CMT strategy object, the dependency rows, the commitment row — as 0043 left it.
CREATE OR REPLACE FUNCTION decision.commit_package(
  p_commitment_id uuid, p_tenant uuid, p_domain uuid, p_package_id uuid, p_version int, p_committer uuid, p_version_digest text, p_header_digest text,
  p_title text, p_statement text, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, graph, simulation, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE p record; v record; v_quorum int; v_live int; v_approvals jsonb; v_dec uuid; c jsonb; v_now timestamptz := clock_timestamp();
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.commit']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF public.eye_op_class() IS DISTINCT FROM 'C3' THEN
    RAISE EXCEPTION 'commitment rejected: decision.commit requires a C3 authority context; this context is %', coalesce(public.eye_op_class(), 'unclassed') USING ERRCODE = '42501';
  END IF;
  IF public.eye_bound_action() IS DISTINCT FROM 'decision.commit' THEN
    RAISE EXCEPTION 'commitment rejected: the context is bound to %, not decision.commit', public.eye_bound_action() USING ERRCODE = '42501';
  END IF;
  IF p_committer IS DISTINCT FROM public.eye_principal() THEN
    RAISE EXCEPTION 'commitment rejected: a commitment is made by the acting principal, never on behalf of another' USING ERRCODE = '42501';
  END IF;
  IF NOT decision.is_active_human(p_committer, p_tenant) THEN RAISE EXCEPTION 'commitment rejected: only a named, active human principal commits' USING ERRCODE = '42501'; END IF;
  IF NOT decision.holds_role(p_committer, p_tenant, p_domain, 'decision_authority') THEN
    RAISE EXCEPTION 'commitment rejected: principal % does not hold decision_authority at this scope', p_committer USING ERRCODE = '42501';
  END IF;
  SELECT * INTO p FROM decision.packages_current x WHERE x.package_id = p_package_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'commitment rejected: no such package in this domain' USING ERRCODE = '23503'; END IF;
  IF p.committed_version IS NOT NULL AND p.state IN ('committed', 'monitoring', 'closed') THEN
    RAISE EXCEPTION 'commitment rejected: package is already committed at version % and the commitment stands; a committed decision is reopened (decision.package.reopen), never re-committed over', p.committed_version USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v FROM decision.package_versions x WHERE x.package_id = p_package_id AND x.version = p_version FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'commitment rejected: no such version' USING ERRCODE = '23503'; END IF;
  IF v.state <> 'approved' THEN RAISE EXCEPTION 'commitment rejected: version % is %, not approved', p_version, v.state USING ERRCODE = '22023'; END IF;
  IF p_version_digest IS DISTINCT FROM v.version_digest THEN
    RAISE EXCEPTION 'commitment rejected: the digest committed (%) is not the digest of version % (%)', p_version_digest, p_version, v.version_digest USING ERRCODE = '22023';
  END IF;
  v_quorum := (v.approver_policy ->> 'quorum')::int;
  SELECT count(*), coalesce(jsonb_agg(jsonb_build_object('approval_id', approval_id, 'approver', approver_principal_id)), '[]'::jsonb)
    INTO v_live, v_approvals FROM decision.live_approvals(p_package_id, p_version);
  IF v_live < v_quorum THEN
    RAISE EXCEPTION 'commitment rejected: quorum is % distinct eligible humans; % live approval(s) stand now (expired, revoked or re-digested approvals do not count)', v_quorum, v_live USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM decision.live_approvals(p_package_id, p_version) la WHERE la.approver_principal_id = p_committer) THEN
    RAISE EXCEPTION 'commitment rejected: the committing authority cannot be one of the approvers' USING ERRCODE = '42501';
  END IF;
  v_dec := p.decision_object_id;
  INSERT INTO graph.strategy_current (strategy_object_id, scope, tenant_id, domain_id, object_type, object_version, title, statement, status, verification_state, parent_objective_id, owner_principal_id, correlation_id)
  VALUES (p_commitment_id, 'DOMAIN', p_tenant, p_domain, 'CMT', 1, p_title, p_statement, 'active', 'not_applicable', NULL, p_committer, p_correlation);
  INSERT INTO graph.strategy_events (event_id, scope, tenant_id, domain_id, strategy_object_id, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_commitment_id, 'strategy.declared', p_committer,
          jsonb_build_object('object_type', 'CMT', 'title', p_title, 'version', 1, 'status', 'active', 'via', 'decision.commit', 'package_id', p_package_id, 'package_version', p_version), p_correlation);
  INSERT INTO graph.dependencies (dependency_id, scope, tenant_id, domain_id, dependent_object_id, dependent_type, depends_on_kind, depends_on_id, rationale, state, created_by, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_commitment_id, 'CMT', 'strategy', v_dec, format('the commitment executes decision %s (package %s v%s)', v_dec, p_package_id, p_version), 'active', p_committer, p_correlation);
  FOR c IN SELECT DISTINCT x FROM decision.options o, jsonb_array_elements(o.consequences) x WHERE o.package_id = p_package_id AND o.version = p_version AND o.key = (v.choice ->> 'option_key') AND (x ->> 'kind') = 'run' LOOP
    INSERT INTO graph.dependencies (dependency_id, scope, tenant_id, domain_id, dependent_object_id, dependent_type, depends_on_kind, depends_on_id, rationale, state, created_by, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_commitment_id, 'CMT', 'run', (c ->> 'id')::uuid, format('the chosen option %s rests on this run', v.choice ->> 'option_key'), 'active', p_committer, p_correlation)
    ON CONFLICT DO NOTHING;
  END LOOP;
  IF v.baseline_run_id IS NOT NULL THEN
    INSERT INTO graph.dependencies (dependency_id, scope, tenant_id, domain_id, dependent_object_id, dependent_type, depends_on_kind, depends_on_id, rationale, state, created_by, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_commitment_id, 'CMT', 'run', v.baseline_run_id, 'the common baseline the options were compared against', 'active', p_committer, p_correlation)
    ON CONFLICT DO NOTHING;
  END IF;
  -- ONE instant is the decision: the commitment, decided_at and the committed event carry it, so a replay's decided layer closes exactly there.
  INSERT INTO decision.commitments (commitment_id, scope, tenant_id, domain_id, package_id, version, committed_by, version_digest, approvals, op_class, bound_action, header_digest, policy_decision_id, committed_at, correlation_id)
  VALUES (p_commitment_id, 'DOMAIN', p_tenant, p_domain, p_package_id, p_version, p_committer, p_version_digest, v_approvals, public.eye_op_class(), public.eye_bound_action(), p_header_digest, public.eye_policy_decision(), v_now, p_correlation);
  UPDATE decision.package_versions SET state = 'committed' WHERE package_id = p_package_id AND version = p_version;
  UPDATE decision.packages_current SET state = 'committed', committed_version = p_version, decided_at = v_now WHERE package_id = p_package_id;
  INSERT INTO decision.package_events (event_id, scope, tenant_id, domain_id, package_id, event, actor_principal_id, details, occurred_at, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_package_id, 'package.committed', p_committer,
          jsonb_build_object('version', p_version, 'commitment_id', p_commitment_id, 'version_digest', p_version_digest, 'approvals', v_approvals, 'op_class', public.eye_op_class(), 'policy_decision_id', public.eye_policy_decision(), 'choice', v.choice,
                             'reopened_from', CASE WHEN p.reopens > 0 THEN jsonb_build_object('version', p.reopened_from_version, 'cause', p.reopen_cause, 'reopens', p.reopens) END), v_now, p_correlation);
  RETURN jsonb_build_object('commitment_id', p_commitment_id, 'approvals', v_approvals, 'op_class', public.eye_op_class(), 'decided_at', v_now, 'policy_decision_id', public.eye_policy_decision(),
                            'reopened_from', CASE WHEN p.reopens > 0 THEN jsonb_build_object('version', p.reopened_from_version, 'cause', p.reopen_cause, 'reopens', p.reopens) END);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.commit_package(uuid,uuid,uuid,uuid,int,uuid,text,text,text,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.commit_package(uuid,uuid,uuid,uuid,int,uuid,text,text,text,text,uuid,uuid) TO eye_commit;

-- withdraw_package: 0041's body with one refusal — a package whose commitment stands (reopened, or reopened and proposed, under review,
-- approved or rejected since) is re-committed, not withdrawn: a withdrawn package over a standing commitment would be the lie D5 forbids.
CREATE OR REPLACE FUNCTION decision.withdraw_package(
  p_package_id uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS void
SECURITY DEFINER SET search_path = decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_state text; v_committed int;
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.package.withdraw']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT state, committed_version INTO v_state, v_committed FROM decision.packages_current WHERE package_id = p_package_id AND tenant_id = p_tenant AND domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'withdrawal rejected: no such package in this domain' USING ERRCODE = '23503'; END IF;
  IF v_state IN ('committed', 'monitoring', 'closed') THEN RAISE EXCEPTION 'withdrawal rejected: a committed decision is not withdrawn; it is closed with its outcome' USING ERRCODE = '22023'; END IF;
  IF v_state = 'reopened' OR v_committed IS NOT NULL THEN
    RAISE EXCEPTION 'withdrawal rejected: package % was committed at version % and the commitment stands; a reopened decision is re-committed, not withdrawn', p_package_id, v_committed USING ERRCODE = '22023';
  END IF;
  UPDATE decision.package_versions SET state = 'superseded' WHERE package_id = p_package_id AND state IN ('proposed', 'under_review', 'approved');
  UPDATE decision.packages_current SET state = 'withdrawn' WHERE package_id = p_package_id;
  INSERT INTO decision.package_events (event_id, scope, tenant_id, domain_id, package_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_package_id, 'package.withdrawn', p_actor, jsonb_build_object('reason', p_reason), p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.withdraw_package(uuid,uuid,uuid,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.withdraw_package(uuid,uuid,uuid,text,uuid,uuid,uuid) TO eye_commit;

-- replay_layers: 0048's body verbatim, ONE line changed — the "decided" instant is the COMMITMENT's (c.committed_at), not the package
-- row's (p.decided_at): after a re-commit the row carries the second decision's instant, and a replay of the first committed version
-- must close its decided layer at the first. For a once-committed package the two instants are the same v_now (0043).
CREATE OR REPLACE FUNCTION decision.replay_layers(p_package_id uuid, p_version int, p_as_of timestamptz) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, graph, simulation, twin, prediction, observation, objects, policy, audit, identity, public, pg_catalog, pg_temp AS $$
DECLARE
  p record; v record; c record;
  v_tenant uuid := public.eye_tenant(); v_domain uuid := public.eye_domain();
  v_known timestamptz; v_obs date; v_dec timestamptz; v_asof timestamptz;
  v_known_l jsonb; v_believed jsonb; v_tested jsonb; v_decided jsonb; v_observed jsonb; v_excluded jsonb; v_unavailable jsonb;
  v_content jsonb; v_digest text;
  v_run_ids uuid[]; v_branches uuid[]; v_indicators uuid[];
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'replay rejected: no authority context' USING ERRCODE = '42501'; END IF;
  SELECT * INTO p FROM decision.packages_current x WHERE x.package_id = p_package_id AND x.tenant_id = v_tenant AND (public.eye_scope() = 'TENANT' OR x.domain_id = v_domain);
  IF NOT FOUND THEN RAISE EXCEPTION 'replay rejected: no authorized package matches' USING ERRCODE = '23503'; END IF;
  SELECT * INTO v FROM decision.package_versions x WHERE x.package_id = p_package_id AND x.version = p_version;
  IF NOT FOUND THEN RAISE EXCEPTION 'replay rejected: no such version' USING ERRCODE = '23503'; END IF;
  SELECT * INTO c FROM decision.commitments x WHERE x.package_id = p_package_id AND x.version = p_version;
  IF NOT FOUND OR p.decided_at IS NULL THEN
    RAISE EXCEPTION 'replay rejected: version % of package % is %, not committed; a replay reconstructs what a DECISION was taken with', p_version, p_package_id, v.state USING ERRCODE = '22023';
  END IF;
  v_known := v.known_at; v_obs := v.observed_through; v_dec := c.committed_at; v_asof := coalesce(p_as_of, clock_timestamp());
  IF v_asof < v_dec THEN RAISE EXCEPTION 'replay rejected: as_of (%) is before decided_at (%); the observed layer starts at the decision', decision.iso(v_asof), decision.iso(v_dec) USING ERRCODE = '22023'; END IF;

  CREATE TEMP TABLE IF NOT EXISTS rp_cites (kind text, object_type text, id uuid, version int, digest text, via text) ON COMMIT DROP;
  DELETE FROM rp_cites;
  INSERT INTO rp_cites
    SELECT DISTINCT x ->> 'kind',
           CASE x ->> 'kind' WHEN 'run' THEN 'SIM' WHEN 'forecast' THEN 'FCT' WHEN 'claim' THEN 'CLM' WHEN 'evidence' THEN 'EVD' WHEN 'assumption' THEN 'ASU' WHEN 'warning' THEN 'WRN' END,
           (x ->> 'id')::uuid, (x ->> 'version')::int, x ->> 'digest', 'option:' || o.key
      FROM decision.options o, jsonb_array_elements(o.consequences) x
     WHERE o.package_id = p_package_id AND o.version = p_version;
  SELECT coalesce(array_agg(DISTINCT id), ARRAY[]::uuid[]) INTO v_run_ids FROM rp_cites WHERE kind = 'run';
  INSERT INTO rp_cites
    SELECT DISTINCT ON ((x ->> 'id'), (x ->> 'version')) x ->> 'kind',
           CASE x ->> 'kind' WHEN 'run' THEN 'SIM' WHEN 'forecast' THEN 'FCT' WHEN 'claim' THEN 'CLM' WHEN 'evidence' THEN 'EVD' WHEN 'assumption' THEN 'ASU' END,
           (x ->> 'id')::uuid, (x ->> 'version')::int, NULL, 'twin:' || r.twin_id || '@' || r.twin_version || ':' || e.key
      FROM simulation.runs_current r
      JOIN twin.state_elements e ON e.twin_id = r.twin_id AND e.version = r.twin_version
      CROSS JOIN LATERAL jsonb_array_elements(e.citations) x
     WHERE r.run_id = ANY (v_run_ids) AND (x ->> 'kind') IN ('evidence', 'claim', 'forecast', 'assumption')
       AND NOT EXISTS (SELECT 1 FROM rp_cites q WHERE q.id = (x ->> 'id')::uuid AND q.version IS NOT DISTINCT FROM (x ->> 'version')::int)
     ORDER BY (x ->> 'id'), (x ->> 'version'), r.twin_id, r.twin_version, e.key;
  SELECT coalesce(array_agg(DISTINCT b), ARRAY[]::uuid[]) INTO v_branches FROM (
    SELECT (m ->> 'branch_id')::uuid b FROM jsonb_array_elements(v.monitoring_conditions) m WHERE (m ->> 'kind') = 'warning' AND (m ->> 'branch_id') IS NOT NULL
    UNION SELECT r.scenario_branch_id FROM simulation.runs_current r WHERE r.run_id = ANY (v_run_ids) AND r.scenario_branch_id IS NOT NULL) s;
  SELECT coalesce(array_agg(DISTINCT (m ->> 'indicator_id')::uuid), ARRAY[]::uuid[]) INTO v_indicators
    FROM jsonb_array_elements(v.monitoring_conditions) m WHERE (m ->> 'kind') = 'indicator' AND (m ->> 'indicator_id') IS NOT NULL;

  SELECT coalesce(jsonb_agg(x ORDER BY x ->> 'layer', x ->> 'id', (x ->> 'version')::int), '[]'::jsonb) INTO v_excluded FROM (
    SELECT jsonb_build_object('layer', CASE WHEN q.object_type = 'EVD' THEN 'known' ELSE 'believed' END, 'id', q.id, 'version', q.version, 'via', q.via,
                              'reason', CASE WHEN o.recorded_at > v_known THEN 'recorded after known_at' ELSE 'event after observed_through' END,
                              'recorded_at', decision.iso(o.recorded_at)) x
      FROM rp_cites q JOIN objects.canonical_objects o ON o.object_id = q.id AND o.object_version = q.version
     WHERE q.object_type IN ('EVD', 'CLM', 'FCT', 'ASU', 'WRN')
       AND (o.recorded_at > v_known OR (v_obs IS NOT NULL AND o.event_time IS NOT NULL AND o.event_time::date > v_obs))
    UNION ALL
    SELECT jsonb_build_object('layer', 'tested', 'id', r.run_id, 'version', 1, 'via', 'run',
                              'reason', CASE WHEN r.state <> 'completed' THEN 'not completed' ELSE 'completed after decided_at' END, 'recorded_at', decision.iso(r.completed_at)) x
      FROM simulation.runs_current r WHERE r.run_id = ANY (v_run_ids) AND (r.state <> 'completed' OR r.completed_at > v_dec)) s;

  SELECT coalesce(jsonb_agg(x ORDER BY x ->> 'layer', x ->> 'id', (x ->> 'version')::int), '[]'::jsonb) INTO v_unavailable FROM (
    SELECT jsonb_build_object('layer', CASE WHEN q.object_type = 'EVD' THEN 'known' WHEN q.object_type = 'SIM' THEN 'tested' ELSE 'believed' END, 'id', q.id, 'version', q.version, 'via', q.via,
                              'reason', 'not accessible to the reader or not recorded') x
      FROM rp_cites q WHERE q.object_type <> 'SIM' AND NOT EXISTS (SELECT 1 FROM objects.canonical_objects o WHERE o.object_id = q.id AND o.object_version = q.version
                                                                     AND o.tenant_id = v_tenant AND (public.eye_scope() = 'TENANT' OR o.domain_id = v_domain))
    UNION ALL
    SELECT jsonb_build_object('layer', CASE WHEN q.object_type = 'EVD' THEN 'known' ELSE 'believed' END, 'id', q.id, 'version', q.version, 'via', q.via,
                              'reason', 'withdrawn', 'at', decision.iso(w.recorded_at), 'by_version', w.object_version, 'withdrawal_reason', w.withdrawal_reason) x
      FROM rp_cites q JOIN LATERAL (SELECT * FROM objects.canonical_objects o2 WHERE o2.object_id = q.id AND o2.object_version > q.version AND o2.lifecycle_state = 'withdrawn' ORDER BY o2.object_version LIMIT 1) w ON true
     WHERE q.object_type <> 'SIM'
    UNION ALL
    SELECT jsonb_build_object('layer', CASE WHEN q.object_type = 'EVD' THEN 'known' ELSE 'believed' END, 'id', q.id, 'version', q.version, 'via', q.via,
                              'reason', 'withdrawn', 'at', NULL, 'by_version', q.version, 'withdrawal_reason', o.withdrawal_reason) x
      FROM rp_cites q JOIN objects.canonical_objects o ON o.object_id = q.id AND o.object_version = q.version
     WHERE q.object_type <> 'SIM' AND o.lifecycle_state IN ('withdrawn', 'deleted')
       AND NOT EXISTS (SELECT 1 FROM objects.canonical_objects o2 WHERE o2.object_id = q.id AND o2.object_version > q.version AND o2.lifecycle_state = 'withdrawn')
    UNION ALL
    SELECT jsonb_build_object('layer', 'known', 'id', q.id, 'version', q.version, 'via', q.via, 'reason', 'governed-deleted', 'at', decision.iso(t.tombstoned_at), 'tombstone_reason', t.reason) x
      FROM rp_cites q JOIN objects.canonical_objects o ON o.object_id = q.id AND o.object_version = q.version
      JOIN observation.blob_tombstones t ON t.manifest_id = (o.payload ->> 'manifest_id')::uuid
     WHERE q.object_type = 'EVD') s;

  SELECT coalesce(jsonb_agg(x ORDER BY x ->> 'id', (x ->> 'version')::int), '[]'::jsonb) INTO v_known_l FROM (
    SELECT jsonb_build_object('id', q.id, 'version', q.version, 'digest', o.content_digest, 'cited_digest', q.digest, 'via', q.via, 'object_type', o.object_type,
                              'recorded_at', decision.iso(o.recorded_at), 'observation_time', decision.iso(o.observation_time), 'event_time', decision.iso(o.event_time),
                              'truth_state', o.truth_state, 'synthetic_state', o.synthetic_state, 'classification', o.classification, 'rights_profile', o.rights_profile,
                              'provenance_ref', o.provenance_ref, 'correction_of', o.correction_of) x
      FROM rp_cites q JOIN objects.canonical_objects o ON o.object_id = q.id AND o.object_version = q.version
     WHERE q.object_type = 'EVD' AND o.recorded_at <= v_known
       AND (v_obs IS NULL OR o.event_time IS NULL OR o.event_time::date <= v_obs)) s;

  SELECT jsonb_build_object(
    'claims', coalesce((SELECT jsonb_agg(x ORDER BY x ->> 'id', (x ->> 'version')::int) FROM (
        SELECT jsonb_build_object('id', q.id, 'version', q.version, 'digest', o.content_digest, 'via', q.via, 'truth_state', o.truth_state, 'recorded_at', decision.iso(o.recorded_at), 'synthetic_state', o.synthetic_state) x
          FROM rp_cites q JOIN objects.canonical_objects o ON o.object_id = q.id AND o.object_version = q.version
         WHERE q.object_type = 'CLM' AND o.recorded_at <= v_known AND (v_obs IS NULL OR o.event_time IS NULL OR o.event_time::date <= v_obs)) s), '[]'::jsonb),
    'forecasts', coalesce((SELECT jsonb_agg(x ORDER BY x ->> 'id', (x ->> 'version')::int) FROM (
        SELECT jsonb_build_object('id', q.id, 'version', q.version, 'digest', o.content_digest, 'via', q.via, 'truth_state', o.truth_state, 'quality_state', o.quality_state,
                                  'validation_state', o.payload ->> 'validation_state', 'recorded_at', decision.iso(o.recorded_at), 'synthetic_state', o.synthetic_state) x
          FROM rp_cites q JOIN objects.canonical_objects o ON o.object_id = q.id AND o.object_version = q.version
         WHERE q.object_type = 'FCT' AND o.recorded_at <= v_known AND (v_obs IS NULL OR o.event_time IS NULL OR o.event_time::date <= v_obs)) s), '[]'::jsonb),
    'assumptions', coalesce((SELECT jsonb_agg(x ORDER BY x ->> 'id', (x ->> 'version')::int) FROM (
        SELECT jsonb_build_object('id', q.id, 'version', q.version, 'digest', o.content_digest, 'via', q.via, 'truth_state', o.truth_state, 'recorded_at', decision.iso(o.recorded_at),
                                  'verification_at_known_at', coalesce((SELECT e.details ->> 'state' FROM graph.strategy_events e WHERE e.strategy_object_id = q.id AND e.event LIKE 'assumption.%' AND e.occurred_at <= v_known ORDER BY e.occurred_at DESC LIMIT 1), 'unverified')) x
          FROM rp_cites q JOIN objects.canonical_objects o ON o.object_id = q.id AND o.object_version = q.version
         WHERE q.object_type = 'ASU' AND o.recorded_at <= v_known) s), '[]'::jsonb),
    'warnings', coalesce((SELECT jsonb_agg(x ORDER BY x ->> 'id', (x ->> 'version')::int) FROM (
        SELECT jsonb_build_object('id', q.id, 'version', q.version, 'digest', o.content_digest, 'via', q.via, 'truth_state', o.truth_state, 'recorded_at', decision.iso(o.recorded_at)) x
          FROM rp_cites q JOIN objects.canonical_objects o ON o.object_id = q.id AND o.object_version = q.version
         WHERE q.object_type = 'WRN' AND o.recorded_at <= v_known) s), '[]'::jsonb),
    'branches', coalesce((SELECT jsonb_agg(x ORDER BY x ->> 'branch_id') FROM (
        SELECT jsonb_build_object('branch_id', b.branch_id, 'scenario_id', b.scenario_id, 'name', b.name, 'kind', b.kind, 'state_as_of', prediction.branch_state_as_of(b.branch_id, v_known, v_obs),
                                  'known_at', decision.iso(v_known), 'observed_through', v_obs) x
          FROM prediction.branches_current b WHERE b.branch_id = ANY (v_branches) AND b.added_at <= v_known) s), '[]'::jsonb),
    'twins', coalesce((SELECT jsonb_agg(x ORDER BY x ->> 'twin_id') FROM (
        SELECT DISTINCT jsonb_build_object('twin_id', t.twin_id, 'title', t.title, 'validation_status', t.validation ->> 'status', 'limitations', t.validation -> 'limitations', 'behaviour_model_ref', t.behaviour_model_ref) x
          FROM simulation.runs_current r JOIN twin.twins_current t ON t.twin_id = r.twin_id WHERE r.run_id = ANY (v_run_ids) AND t.declared_at <= v_known) s), '[]'::jsonb)
  ) INTO v_believed;

  SELECT jsonb_build_object(
    'runs', coalesce((SELECT jsonb_agg(x ORDER BY x ->> 'run_id') FROM (
        SELECT jsonb_build_object('run_id', r.run_id, 'run_kind', r.run_kind, 'control_run_id', r.control_run_id, 'twin_id', r.twin_id, 'twin_version', r.twin_version, 'branch_id', r.branch_id,
                                  'known_at', decision.iso(r.known_at), 'observed_through', r.observed_through, 'inputs_digest', r.inputs_digest, 'initial_state_digest', r.initial_state_digest,
                                  'outputs_digest', r.outputs_digest, 'implementation_digest', r.implementation_digest, 'environment_digest', r.environment_digest, 'header_digest', r.header_digest,
                                  'outside_envelope', r.outside_envelope, 'completed_at', decision.iso(r.completed_at), 'interventions', r.interventions) x
          FROM simulation.runs_current r WHERE r.run_id = ANY (v_run_ids) AND r.state = 'completed' AND r.completed_at <= v_dec) s), '[]'::jsonb),
    'reproductions', coalesce((SELECT jsonb_agg(x ORDER BY x ->> 'reproduced_at', x ->> 'reproduction_id') FROM (
        SELECT jsonb_build_object('reproduction_id', rp.reproduction_id, 'run_id', rp.run_id, 'verdict', rp.verdict, 'expected_digest', rp.expected_digest, 'actual_digest', rp.actual_digest,
                                  'environment_matches', rp.environment_matches, 'cold_process', rp.cold_process, 'reproduced_at', decision.iso(rp.reproduced_at)) x
          FROM simulation.reproductions rp WHERE rp.run_id = ANY (v_run_ids) AND rp.reproduced_at <= v_dec) s), '[]'::jsonb),
    'twin_versions', coalesce((SELECT jsonb_agg(x ORDER BY x ->> 'twin_id', (x ->> 'version')::int) FROM (
        SELECT DISTINCT jsonb_build_object('twin_id', tv.twin_id, 'version', tv.version, 'branch_id', tv.branch_id, 'state_set_digest', tv.state_set_digest, 'header_digest', tv.header_digest,
                                  'known_at', decision.iso(tv.known_at), 'observed_through', tv.observed_through, 'admitted_at', decision.iso(tv.admitted_at), 'completeness', tv.completeness, 'synthetic_state', tv.synthetic_state,
                                  'verification_at_decided_at', coalesce((SELECT CASE WHEN e.event = 'version.unverified' THEN 'unverified' ELSE 'verified' END FROM twin.twin_events e
                                                                           WHERE e.twin_id = tv.twin_id AND (e.details ->> 'version')::int = tv.version AND e.event IN ('version.unverified', 'version.reverified') AND e.occurred_at <= v_dec
                                                                           ORDER BY e.occurred_at DESC LIMIT 1), 'verified')) x
          FROM simulation.runs_current r JOIN twin.twin_versions tv ON tv.twin_id = r.twin_id AND tv.version = r.twin_version
         WHERE r.run_id = ANY (v_run_ids) AND tv.state = 'admitted' AND tv.admitted_at <= v_dec) s), '[]'::jsonb)
  ) INTO v_tested;

  SELECT jsonb_build_object(
    'version', jsonb_build_object('package_id', v.package_id, 'version', v.version, 'version_digest', v.version_digest, 'header_digest', v.header_digest, 'known_at', decision.iso(v.known_at),
                                  'observed_through', v.observed_through, 'proposed_at', decision.iso(v.proposed_at), 'proposed_by', v.proposed_by, 'choice', v.choice, 'objectives', v.objectives,
                                  'approver_policy', v.approver_policy, 'monitoring_conditions', v.monitoring_conditions, 'baseline_run_id', v.baseline_run_id, 'synthetic_state', v.synthetic_state, 'supersedes', v.supersedes),
    'decision_object_id', p.decision_object_id,
    'options', coalesce((SELECT jsonb_agg(jsonb_build_object('key', o.key, 'title', o.title, 'kind', o.kind, 'simulated', o.simulated, 'unsimulated_reason', o.unsimulated_reason, 'consequences', o.consequences, 'uncertainty', o.uncertainty) ORDER BY o.key)
                         FROM decision.options o WHERE o.package_id = p_package_id AND o.version = p_version), '[]'::jsonb),
    'dissent', coalesce((SELECT jsonb_agg(jsonb_build_object('dissent_id', d.dissent_id, 'principal_id', d.principal_id, 'position', d.position, 'rationale', d.rationale, 'citation', d.citation, 'recorded_at', decision.iso(d.recorded_at)) ORDER BY d.recorded_at, d.dissent_id)
                         FROM decision.dissent d WHERE d.package_id = p_package_id AND d.version = p_version AND d.recorded_at <= v_dec), '[]'::jsonb),
    'prior_dissent', coalesce((SELECT jsonb_agg(jsonb_build_object('dissent_id', d.dissent_id, 'version', d.version, 'principal_id', d.principal_id, 'position', d.position, 'rationale', d.rationale, 'citation', d.citation, 'recorded_at', decision.iso(d.recorded_at)) ORDER BY d.recorded_at, d.dissent_id)
                               FROM decision.dissent d WHERE d.package_id = p_package_id AND d.version <> p_version AND d.recorded_at <= v_dec), '[]'::jsonb),
    'approvals', coalesce((SELECT jsonb_agg(jsonb_build_object('approval_id', a.approval_id, 'approver', a.approver_principal_id, 'decision', a.decision, 'version_digest', a.version_digest, 'eligible_by', a.eligible_by,
                                                               'expires_at', decision.iso(a.expires_at), 'recorded_at', decision.iso(a.recorded_at), 'header_digest', a.header_digest,
                                                               'revoked_before_decision', a.revoked_at IS NOT NULL AND a.revoked_at <= v_dec) ORDER BY a.recorded_at, a.approval_id)
                           FROM decision.approvals a WHERE a.package_id = p_package_id AND a.version = p_version AND a.recorded_at <= v_dec), '[]'::jsonb),
    'commitment', jsonb_build_object('commitment_id', c.commitment_id, 'committed_by', c.committed_by, 'version_digest', c.version_digest, 'approvals', c.approvals, 'op_class', c.op_class, 'bound_action', c.bound_action,
                                     'header_digest', c.header_digest, 'committed_at', decision.iso(c.committed_at), 'decided_at', decision.iso(v_dec), 'policy_decision_id', c.policy_decision_id),
    'policy', (SELECT jsonb_build_object('policy_decision_id', pd.id, 'decision', pd.decision, 'obligations', pd.obligations, 'consequence_class', pd.consequence_class, 'action', pd.action, 'recorded_at', decision.iso(pd.created_at))
                 FROM policy.policy_decisions pd WHERE pd.id = c.policy_decision_id),
    'audit', (SELECT jsonb_build_object('partition_id', ae.partition_id, 'audit_seq', ae.audit_seq, 'row_hash', ae.row_hash, 'occurred_at', ae.occurred_at, 'outcome', ae.outcome)
                FROM audit.audit_events ae WHERE ae.correlation_id = c.correlation_id AND ae.action = 'decision.commit' AND ae.outcome = 'success' ORDER BY ae.audit_seq LIMIT 1)
  ) INTO v_decided;

  -- ── observed: strictly (decided_at, as_of]; every mutable state read AS OF as_of from the record's own events ──
  SELECT jsonb_build_object(
    'later_versions', coalesce((SELECT jsonb_agg(x ORDER BY x ->> 'recorded_at', x ->> 'id', (x ->> 'version')::int) FROM (
        SELECT DISTINCT jsonb_build_object('id', o2.object_id, 'version', o2.object_version, 'object_type', o2.object_type, 'lifecycle_state', o2.lifecycle_state, 'truth_state', o2.truth_state, 'correction_of', o2.correction_of,
                                  'withdrawal_reason', o2.withdrawal_reason, 'digest', o2.content_digest, 'recorded_at', decision.iso(o2.recorded_at), 'cited_version', q.version) x
          FROM rp_cites q JOIN objects.canonical_objects o2 ON o2.object_id = q.id AND o2.object_version > q.version
         WHERE q.object_type <> 'SIM' AND o2.recorded_at > v_dec AND o2.recorded_at <= v_asof) s), '[]'::jsonb),
    'tombstones', coalesce((SELECT jsonb_agg(x ORDER BY x ->> 'at', x ->> 'id') FROM (
        SELECT DISTINCT jsonb_build_object('id', q.id, 'version', q.version, 'reason', t.reason, 'at', decision.iso(t.tombstoned_at)) x
          FROM rp_cites q JOIN objects.canonical_objects o ON o.object_id = q.id AND o.object_version = q.version
          JOIN observation.blob_tombstones t ON t.manifest_id = (o.payload ->> 'manifest_id')::uuid
         WHERE q.object_type = 'EVD' AND t.tombstoned_at > v_dec AND t.tombstoned_at <= v_asof) s), '[]'::jsonb),
    'reproductions', coalesce((SELECT jsonb_agg(x ORDER BY x ->> 'reproduced_at', x ->> 'reproduction_id') FROM (
        SELECT jsonb_build_object('reproduction_id', rp.reproduction_id, 'run_id', rp.run_id, 'verdict', rp.verdict, 'actual_digest', rp.actual_digest, 'reason', rp.reason, 'reproduced_at', decision.iso(rp.reproduced_at)) x
          FROM simulation.reproductions rp WHERE rp.run_id = ANY (v_run_ids) AND rp.reproduced_at > v_dec AND rp.reproduced_at <= v_asof) s), '[]'::jsonb),
    'reconciliations', coalesce((SELECT jsonb_agg(x ORDER BY x ->> 'recorded_at', x ->> 'reconciliation_id') FROM (
        SELECT jsonb_build_object('reconciliation_id', rc.reconciliation_id, 'twin_id', rc.twin_id, 'key', rc.key, 'from_version', rc.from_version, 'from_kind', rc.from_kind, 'from_value', rc.from_value,
                                  'against_version', rc.against_version, 'against_value', rc.against_value, 'difference', rc.difference, 'note', rc.note, 'recorded_at', decision.iso(rc.recorded_at)) x
          FROM twin.reconciliations rc
         WHERE rc.recorded_at > v_dec AND rc.recorded_at <= v_asof
           AND EXISTS (SELECT 1 FROM jsonb_array_elements(rc.from_citations) fc WHERE (fc ->> 'kind') = 'run' AND (fc ->> 'id')::uuid = ANY (v_run_ids))) s), '[]'::jsonb),
    -- the OUT as it was admitted (its canonical record is immutable) with its status as of as_of from its events
    'outcomes', coalesce((SELECT jsonb_agg(x ORDER BY x ->> 'recorded_at', x ->> 'id') FROM (
        SELECT DISTINCT jsonb_build_object('id', s.strategy_object_id, 'title', coalesce(co.payload ->> 'title', s.title), 'statement', coalesce(co.payload ->> 'statement', s.statement),
                                           'status', decision.strategy_status_as_of(s.strategy_object_id, v_asof), 'content_digest', co.content_digest, 'recorded_at', decision.iso(d.created_at), 'depends_on', d.depends_on_id) x
          FROM graph.dependencies d JOIN graph.strategy_current s ON s.strategy_object_id = d.dependent_object_id AND s.object_type = 'OUT'
          LEFT JOIN objects.canonical_objects co ON co.object_type = 'OUT' AND co.object_id = s.strategy_object_id AND co.object_version = 1
         WHERE d.dependent_type = 'OUT' AND d.depends_on_id IN (c.commitment_id, p.decision_object_id) AND d.created_at > v_dec AND d.created_at <= v_asof) s), '[]'::jsonb),
    -- warnings raised in the interval, with the state they had AS OF as_of
    'warnings', coalesce((SELECT jsonb_agg(x ORDER BY x ->> 'raised_at', x ->> 'warning_id') FROM (
        SELECT jsonb_build_object('warning_id', w.warning_id, 'title', w.title, 'state', decision.warning_state_as_of(w.warning_id, v_asof), 'branch_id', w.branch_id, 'indicator_id', w.indicator_id, 'routed_to', w.routed_to,
                                  'raised_at', decision.iso(w.raised_at), 'response_window_closes_at', decision.iso(w.response_window_closes_at),
                                  'acknowledged_at', CASE WHEN w.acknowledged_at IS NOT NULL AND w.acknowledged_at <= v_asof THEN decision.iso(w.acknowledged_at) END) x
          FROM prediction.warnings_current w
         WHERE (w.branch_id = ANY (v_branches) OR w.indicator_id = ANY (v_indicators)) AND w.raised_at > v_dec AND w.raised_at <= v_asof) s), '[]'::jsonb),
    'branch_flips', coalesce((SELECT jsonb_agg(x ORDER BY x ->> 'occurred_at', x ->> 'event_id') FROM (
        SELECT jsonb_build_object('event_id', e.event_id, 'branch_id', e.branch_id, 'event', e.event, 'occurred_at', decision.iso(e.occurred_at), 'details', e.details) x
          FROM prediction.scenario_events e WHERE e.branch_id = ANY (v_branches) AND e.event IN ('branch.flipped', 'branch.closed') AND e.occurred_at > v_dec AND e.occurred_at <= v_asof) s), '[]'::jsonb),
    'approval_revocations', coalesce((SELECT jsonb_agg(x ORDER BY x ->> 'revoked_at', x ->> 'approval_id') FROM (
        SELECT jsonb_build_object('approval_id', a.approval_id, 'approver', a.approver_principal_id, 'revoked_at', decision.iso(a.revoked_at), 'reason', a.revoked_reason) x
          FROM decision.approvals a WHERE a.package_id = p_package_id AND a.version = p_version AND a.revoked_at > v_dec AND a.revoked_at <= v_asof) s), '[]'::jsonb),
    'assumption_events', coalesce((SELECT jsonb_agg(x ORDER BY x ->> 'occurred_at', x ->> 'event_id') FROM (
        SELECT jsonb_build_object('event_id', e.event_id, 'assumption_id', e.strategy_object_id, 'event', e.event, 'state', e.details ->> 'state', 'reason', e.details ->> 'reason', 'occurred_at', decision.iso(e.occurred_at)) x
          FROM graph.strategy_events e WHERE e.strategy_object_id IN (SELECT id FROM rp_cites WHERE object_type = 'ASU') AND e.event LIKE 'assumption.%' AND e.occurred_at > v_dec AND e.occurred_at <= v_asof) s), '[]'::jsonb),
    'twin_events', coalesce((SELECT jsonb_agg(x ORDER BY x ->> 'occurred_at', x ->> 'event_id') FROM (
        SELECT DISTINCT jsonb_build_object('event_id', e.event_id, 'twin_id', e.twin_id, 'event', e.event, 'version', (e.details ->> 'version')::int, 'occurred_at', decision.iso(e.occurred_at)) x
          FROM twin.twin_events e JOIN simulation.runs_current r ON r.twin_id = e.twin_id AND (e.details ->> 'version')::int = r.twin_version
         WHERE r.run_id = ANY (v_run_ids) AND e.event IN ('version.unverified', 'version.reverified') AND e.occurred_at > v_dec AND e.occurred_at <= v_asof) s), '[]'::jsonb),
    'package_events', coalesce((SELECT jsonb_agg(x ORDER BY x ->> 'occurred_at', x ->> 'event_id') FROM (
        SELECT jsonb_build_object('event_id', e.event_id, 'event', e.event, 'actor', e.actor_principal_id, 'occurred_at', decision.iso(e.occurred_at), 'details', e.details) x
          FROM decision.package_events e WHERE e.package_id = p_package_id AND e.event NOT IN ('replay.recorded') AND e.occurred_at > v_dec AND e.occurred_at <= v_asof) s), '[]'::jsonb)
  ) INTO v_observed;

  v_content := jsonb_build_object(
    'package_id', p_package_id, 'version', p_version,
    'cutoffs', jsonb_build_object('known_at', decision.iso(v_known), 'observed_through', v_obs, 'decided_at', decision.iso(v_dec), 'as_of', decision.iso(v_asof)),
    'known', v_known_l, 'believed', v_believed, 'tested', v_tested, 'decided', v_decided, 'observed', v_observed, 'excluded', v_excluded);
  v_digest := encode(sha256(convert_to(v_content::text, 'UTF8')), 'hex');
  RETURN jsonb_build_object('content', v_content, 'content_digest', v_digest, 'unavailable', v_unavailable,
                            'summary', jsonb_build_object('known', jsonb_array_length(v_known_l), 'claims', jsonb_array_length(v_believed -> 'claims'), 'forecasts', jsonb_array_length(v_believed -> 'forecasts'),
                                                          'assumptions', jsonb_array_length(v_believed -> 'assumptions'), 'branches', jsonb_array_length(v_believed -> 'branches'),
                                                          'runs', jsonb_array_length(v_tested -> 'runs'), 'reproductions', jsonb_array_length(v_tested -> 'reproductions'),
                                                          'dissent', jsonb_array_length(v_decided -> 'dissent'), 'prior_dissent', jsonb_array_length(v_decided -> 'prior_dissent'), 'approvals', jsonb_array_length(v_decided -> 'approvals'),
                                                          'excluded', jsonb_array_length(v_excluded), 'unavailable', jsonb_array_length(v_unavailable)));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.replay_layers(uuid, int, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.replay_layers(uuid, int, timestamptz) TO eye_app, eye_commit;

-- record_replay: 0043's body with the commitment of the replayed VERSION selected and its committed_at recorded as decided_at.
CREATE OR REPLACE FUNCTION decision.record_replay(
  p_replay_id uuid, p_tenant uuid, p_domain uuid, p_package_id uuid, p_version int, p_as_of timestamptz, p_content_digest text, p_header_digest text,
  p_reader uuid, p_purpose text, p_unavailable jsonb, p_summary jsonb, p_event_id uuid, p_correlation uuid
) RETURNS void
SECURITY DEFINER SET search_path = decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v record; p record; c decision.commitments%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.replay']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_reader IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'replay rejected: a replay is recorded for the reading principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO p FROM decision.packages_current x WHERE x.package_id = p_package_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND OR p.decided_at IS NULL THEN RAISE EXCEPTION 'replay rejected: the package is not committed' USING ERRCODE = '22023'; END IF;
  SELECT * INTO v FROM decision.package_versions x WHERE x.package_id = p_package_id AND x.version = p_version;
  IF NOT FOUND THEN RAISE EXCEPTION 'replay rejected: no such version' USING ERRCODE = '23503'; END IF;
  SELECT * INTO c FROM decision.commitments x WHERE x.package_id = p_package_id AND x.version = p_version;
  IF NOT FOUND THEN RAISE EXCEPTION 'replay rejected: version % of package % is not committed', p_version, p_package_id USING ERRCODE = '22023'; END IF;
  INSERT INTO decision.replays (replay_id, scope, tenant_id, domain_id, package_id, version, known_at, observed_through, decided_at, as_of, content_digest, header_digest, reader_principal_id, purpose, unavailable, summary, correlation_id)
  VALUES (p_replay_id, 'DOMAIN', p_tenant, p_domain, p_package_id, p_version, v.known_at, v.observed_through, c.committed_at, p_as_of, p_content_digest, p_header_digest, p_reader, p_purpose, coalesce(p_unavailable, '[]'::jsonb), coalesce(p_summary, '{}'::jsonb), p_correlation);
  INSERT INTO decision.package_events (event_id, scope, tenant_id, domain_id, package_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_package_id, 'replay.recorded', p_reader,
          jsonb_build_object('version', p_version, 'replay_id', p_replay_id, 'as_of', p_as_of, 'content_digest', p_content_digest, 'unavailable', jsonb_array_length(coalesce(p_unavailable, '[]'::jsonb))), p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.record_replay(uuid,uuid,uuid,uuid,int,timestamptz,text,text,uuid,text,jsonb,jsonb,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.record_replay(uuid,uuid,uuid,uuid,int,timestamptz,text,text,uuid,text,jsonb,jsonb,uuid,uuid) TO eye_commit;

-- record_outcome: 0050's body verbatim with ONE line — the commitment read is the STANDING one, by (package_id, committed_version):
-- with one row per committed version an unqualified read would bind the outcome to whichever row came first. Monitoring and outcomes
-- keep p.decided_at: they are of the standing decision.
CREATE OR REPLACE FUNCTION decision.record_outcome(
  p_outcome_id uuid, p_tenant uuid, p_domain uuid, p_package_id uuid, p_criterion_key text, p_twin_id uuid, p_twin_version int, p_element_key text, p_reconciliation_id uuid,
  p_title text, p_statement text, p_header_digest text, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, graph, twin, simulation, objects, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE p record; v record; c record; crit jsonb; e twin.state_elements%ROWTYPE; tv record; rc record; fc jsonb; v_runs uuid[]; v_twins uuid[]; v_simulated boolean; v_value numeric; v_target numeric; v_met boolean; v_sim jsonb; v_cmt uuid; v_rec timestamptz; v_from date; v_to date;
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.outcome']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'outcome rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF NOT decision.is_active_human(p_actor, p_tenant) THEN RAISE EXCEPTION 'outcome rejected: an outcome is recorded by a named, active human' USING ERRCODE = '42501'; END IF;
  SELECT * INTO p FROM decision.packages_current x WHERE x.package_id = p_package_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'outcome rejected: no such package in this domain' USING ERRCODE = '23503'; END IF;
  IF p.state NOT IN ('committed', 'monitoring') THEN RAISE EXCEPTION 'outcome rejected: package is %; outcomes are recorded on a committed decision', p.state USING ERRCODE = '22023'; END IF;
  SELECT * INTO v FROM decision.package_versions x WHERE x.package_id = p_package_id AND x.version = p.committed_version;
  SELECT * INTO c FROM decision.commitments x WHERE x.package_id = p_package_id AND x.version = p.committed_version;
  v_cmt := c.commitment_id;
  IF p_actor <> p.owner_principal_id AND p_actor::text IS DISTINCT FROM (v.choice ->> 'action_owner') THEN
    RAISE EXCEPTION 'outcome rejected: an outcome is recorded by the package owner or the choice''s action owner' USING ERRCODE = '42501';
  END IF;
  SELECT k INTO crit FROM jsonb_array_elements(v.choice -> 'outcome_criteria') k WHERE (k ->> 'key') = p_criterion_key;
  IF crit IS NULL THEN RAISE EXCEPTION 'outcome rejected: % is not an outcome criterion of the approved choice', p_criterion_key USING ERRCODE = '23503'; END IF;
  IF EXISTS (SELECT 1 FROM decision.outcomes o WHERE o.package_id = p_package_id AND o.version = v.version AND o.criterion_key = p_criterion_key) THEN
    RAISE EXCEPTION 'outcome rejected: criterion % already has its outcome; nothing is overwritten', p_criterion_key USING ERRCODE = '22023';
  END IF;
  SELECT * INTO e FROM twin.state_elements x WHERE x.twin_id = p_twin_id AND x.version = p_twin_version AND x.key = p_element_key AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'outcome rejected: no element % in twin %@%', p_element_key, p_twin_id, p_twin_version USING ERRCODE = '23503'; END IF;
  IF e.kind <> 'observed' OR e.health <> 'complete' THEN RAISE EXCEPTION 'outcome rejected: % in twin %@% is % (%), not a complete OBSERVED element', p_element_key, p_twin_id, p_twin_version, e.kind, e.health USING ERRCODE = '22023'; END IF;
  SELECT * INTO tv FROM twin.twin_versions x WHERE x.twin_id = p_twin_id AND x.version = p_twin_version;
  IF NOT FOUND OR tv.state <> 'admitted' THEN RAISE EXCEPTION 'outcome rejected: twin version % is not admitted', p_twin_version USING ERRCODE = '22023'; END IF;
  IF e.unit IS DISTINCT FROM (crit ->> 'unit') THEN RAISE EXCEPTION 'outcome rejected: the observed element is in %, the criterion in %; same quantity, same unit', coalesce(e.unit, 'no unit'), crit ->> 'unit' USING ERRCODE = '22023'; END IF;
  IF jsonb_typeof(e.value) <> 'number' THEN RAISE EXCEPTION 'outcome rejected: the observed value is not a number' USING ERRCODE = '22023'; END IF;
  IF (crit ->> 'observed_on') IS DISTINCT FROM ('twin:' || p_element_key) THEN
    RAISE EXCEPTION 'outcome rejected: criterion % is observed on % (observed_on); element % was offered', p_criterion_key, coalesce(crit ->> 'observed_on', 'nothing'), p_element_key USING ERRCODE = '22023';
  END IF;
  -- THE TWIN: the one the signed choice binds; for choices made before that binding existed, the twins the version's options ran on
  IF (crit ->> 'twin_id') IS NOT NULL THEN
    IF (crit ->> 'twin_id')::uuid <> p_twin_id THEN
      RAISE EXCEPTION 'outcome rejected: criterion % is observed on twin % (bound in the approved choice); twin % was offered', p_criterion_key, crit ->> 'twin_id', p_twin_id USING ERRCODE = '22023';
    END IF;
  ELSE
    SELECT coalesce(array_agg(DISTINCT r.twin_id), ARRAY[]::uuid[]) INTO v_twins
      FROM decision.options o, jsonb_array_elements(o.consequences) x JOIN simulation.runs_current r ON r.run_id = (x ->> 'id')::uuid
     WHERE o.package_id = p_package_id AND o.version = v.version AND (x ->> 'kind') = 'run';
    IF array_length(v_twins, 1) IS NULL THEN
      RAISE EXCEPTION 'outcome rejected: criterion % binds no twin and no option of the decision was simulated; the observation target is unbound', p_criterion_key USING ERRCODE = '22023';
    END IF;
    IF NOT (p_twin_id = ANY (v_twins)) THEN RAISE EXCEPTION 'outcome rejected: twin % is not a twin the decision''s options rest on', p_twin_id USING ERRCODE = '22023'; END IF;
  END IF;
  -- THE PERIOD: the observation states its period; it covers the interval the choice binds, and ends by the criterion's date
  IF e.valid_to IS NULL THEN RAISE EXCEPTION 'outcome rejected: the observed element states no period (valid_to); the criterion is judged over a period ending by %', crit ->> 'by' USING ERRCODE = '22023'; END IF;
  IF e.valid_to > (crit ->> 'by')::date THEN
    RAISE EXCEPTION 'outcome rejected: the observed period ends %, after the criterion''s date % (by)', e.valid_to, crit ->> 'by' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(crit -> 'period') = 'object' THEN
    v_from := (crit -> 'period' ->> 'from')::date; v_to := (crit -> 'period' ->> 'to')::date;
    -- 0050: the observation states the criterion's OWN period. A shorter period is not the interval; a longer one that
    -- merely covers it is an aggregate over another period whose value does not represent this interval (a quarter's
    -- total is not March's). No derivation from a superset is attempted here: an interval aggregate is established by an
    -- observation over exactly that interval, or not at all.
    IF e.valid_from IS NULL OR e.valid_from <> v_from OR e.valid_to <> v_to THEN
      RAISE EXCEPTION 'outcome rejected: the observed period % to % is not the interval the criterion binds (% to %); an aggregate over another period — shorter, or longer and merely covering it — does not represent this interval; observe the criterion''s own period',
        coalesce(e.valid_from::text, 'unstated'), e.valid_to, v_from, v_to USING ERRCODE = '22023';
    END IF;
  END IF;
  -- THE CHRONOLOGY: the observation entered after the decision
  IF tv.known_at <= p.decided_at THEN
    RAISE EXCEPTION 'outcome rejected: the observation was known at %, before the decision at % (decided_at); an outcome is observed after the decision', decision.iso(tv.known_at), decision.iso(p.decided_at) USING ERRCODE = '22023';
  END IF;
  FOR fc IN SELECT * FROM jsonb_array_elements(e.citations) LOOP
    IF (fc ->> 'kind') = 'evidence' THEN
      SELECT recorded_at INTO v_rec FROM objects.canonical_objects x WHERE x.object_type = 'EVD' AND x.object_id = (fc ->> 'id')::uuid AND x.object_version = coalesce((fc ->> 'version')::int, 1);
      IF v_rec IS NOT NULL AND v_rec <= p.decided_at THEN
        RAISE EXCEPTION 'outcome rejected: the cited evidence %@% was recorded at %, before the decision at %; an already-known observation is not an outcome', fc ->> 'id', coalesce(fc ->> 'version', '1'), decision.iso(v_rec), decision.iso(p.decided_at) USING ERRCODE = '22023';
      END IF;
    END IF;
  END LOOP;
  v_value := (e.value #>> '{}')::numeric; v_target := (crit ->> 'target')::numeric;
  v_met := CASE crit ->> 'comparator' WHEN '<=' THEN v_value <= v_target WHEN '>=' THEN v_value >= v_target WHEN '=' THEN v_value = v_target WHEN '<' THEN v_value < v_target WHEN '>' THEN v_value > v_target END;
  SELECT coalesce(array_agg((x ->> 'id')::uuid), ARRAY[]::uuid[]) INTO v_runs
    FROM decision.options o, jsonb_array_elements(o.consequences) x
   WHERE o.package_id = p_package_id AND o.version = v.version AND o.key = (v.choice ->> 'option_key') AND (x ->> 'kind') = 'run';
  v_simulated := array_length(v_runs, 1) IS NOT NULL;
  IF v_simulated THEN
    IF p_reconciliation_id IS NULL THEN
      RAISE EXCEPTION 'outcome rejected: the chosen option was simulated; record the reconciliation of the chosen run''s simulated element against this observed element first, and cite it' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO rc FROM twin.reconciliations x WHERE x.reconciliation_id = p_reconciliation_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
    IF NOT FOUND THEN RAISE EXCEPTION 'outcome rejected: no such reconciliation in this domain' USING ERRCODE = '23503'; END IF;
    IF rc.twin_id <> p_twin_id OR rc.key <> p_element_key OR rc.against_version <> p_twin_version OR rc.from_kind <> 'simulated' THEN
      RAISE EXCEPTION 'outcome rejected: reconciliation % does not compare a simulated element against %@%/%', p_reconciliation_id, p_twin_id, p_twin_version, p_element_key USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(rc.from_citations) fc2 WHERE (fc2 ->> 'kind') = 'run' AND (fc2 ->> 'id')::uuid = ANY (v_runs)) THEN
      RAISE EXCEPTION 'outcome rejected: the reconciled simulated element does not cite a run of the chosen option %', v.choice ->> 'option_key' USING ERRCODE = '22023';
    END IF;
    v_sim := jsonb_build_object('twin_id', rc.twin_id, 'version', rc.from_version, 'key', rc.key, 'value', rc.from_value, 'citations', rc.from_citations, 'difference', rc.difference);
  ELSIF p_reconciliation_id IS NOT NULL THEN
    RAISE EXCEPTION 'outcome rejected: the chosen option was not simulated; no reconciliation applies' USING ERRCODE = '22023';
  END IF;
  INSERT INTO graph.strategy_current (strategy_object_id, scope, tenant_id, domain_id, object_type, object_version, title, statement, status, verification_state, parent_objective_id, owner_principal_id, correlation_id)
  VALUES (p_outcome_id, 'DOMAIN', p_tenant, p_domain, 'OUT', 1, p_title, p_statement, 'active', 'not_applicable', NULL, p_actor, p_correlation);
  INSERT INTO graph.strategy_events (event_id, scope, tenant_id, domain_id, strategy_object_id, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_outcome_id, 'strategy.declared', p_actor,
          jsonb_build_object('object_type', 'OUT', 'title', p_title, 'version', 1, 'status', 'active', 'via', 'decision.outcome', 'package_id', p_package_id, 'criterion_key', p_criterion_key, 'met', v_met), p_correlation);
  INSERT INTO graph.dependencies (dependency_id, scope, tenant_id, domain_id, dependent_object_id, dependent_type, depends_on_kind, depends_on_id, rationale, state, created_by, correlation_id) VALUES
    (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_outcome_id, 'OUT', 'strategy', v_cmt, format('the outcome of commitment %s on criterion %s', v_cmt, p_criterion_key), 'active', p_actor, p_correlation),
    (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_outcome_id, 'OUT', 'twin', p_twin_id, format('observed on twin %s version %s element %s', p_twin_id, p_twin_version, p_element_key), 'active', p_actor, p_correlation);
  IF v_simulated THEN
    INSERT INTO graph.dependencies (dependency_id, scope, tenant_id, domain_id, dependent_object_id, dependent_type, depends_on_kind, depends_on_id, rationale, state, created_by, correlation_id)
    SELECT gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_outcome_id, 'OUT', 'run', rid, 'the simulated consequence the outcome is reconciled against', 'active', p_actor, p_correlation FROM unnest(v_runs) rid;
  END IF;
  INSERT INTO decision.outcomes (outcome_id, scope, tenant_id, domain_id, package_id, version, criterion_key, criterion, observed_value, unit, target, comparator, met, observed_on, simulated, reconciliation_id, header_digest, recorded_by, correlation_id)
  VALUES (p_outcome_id, 'DOMAIN', p_tenant, p_domain, p_package_id, v.version, p_criterion_key, crit, e.value, e.unit, v_target, crit ->> 'comparator', v_met,
          jsonb_build_object('twin_id', p_twin_id, 'version', p_twin_version, 'key', p_element_key, 'element_id', e.element_id, 'citations', e.citations, 'valid_from', e.valid_from, 'valid_to', e.valid_to, 'known_at', decision.iso(tv.known_at)),
          v_sim, p_reconciliation_id, p_header_digest, p_actor, p_correlation);
  UPDATE decision.packages_current SET state = 'monitoring' WHERE package_id = p_package_id AND state = 'committed';
  INSERT INTO decision.package_events (event_id, scope, tenant_id, domain_id, package_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_package_id, 'outcome.recorded', p_actor,
          jsonb_build_object('version', v.version, 'outcome_id', p_outcome_id, 'criterion_key', p_criterion_key, 'observed_value', e.value, 'target', v_target, 'comparator', crit ->> 'comparator', 'met', v_met, 'reconciliation_id', p_reconciliation_id), p_correlation);
  RETURN jsonb_build_object('outcome_id', p_outcome_id, 'met', v_met, 'observed_value', e.value, 'target', v_target, 'comparator', crit ->> 'comparator', 'simulated', v_sim, 'reconciliation_id', p_reconciliation_id);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.record_outcome(uuid,uuid,uuid,uuid,text,uuid,int,text,uuid,text,text,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.record_outcome(uuid,uuid,uuid,uuid,text,uuid,int,text,uuid,text,text,text,uuid,uuid,uuid) TO eye_commit;

-- ============================================================
-- §4 the interface register (D1, D7)
-- ============================================================
-- The ten rows bound to the surface that publishes each (the 0066 idiom); an event type is declared by its payload's schema and
-- schema_version and by this row — objects.schema_registry is the object-type catalogue and gains nothing. The fourteen that stay
-- partial: L1-I02, L1-I03, L1-I04, L2-I02, L3-I02, L4-I02, L5-I05, L6-I03, L7-I02, L7-I04, L8-I04, L10-I02, L10-I03, L10-I05.
UPDATE objects.interface_register SET binding_state = 'bound', schema_version = 'v1', bound_at = clock_timestamp(), bound_in = '0078',
  bound_to = 'ReviewRequested@v1 per queued review case, in the queueing write: the extraction''s abstention and below-threshold/contradiction cases (intelligence.queue_review under intelligence.claim.admit) and the challenge (POST …/intelligence/review/request → intelligence.request_review); routed_to the reviewer roles the policy names (domain_admin, extraction_manager) with the producing agent excluded; answered by POST …/review/:caseId/decide (ClaimReviewed, MemoryCorrected); no consumer — the accountable human is the queue''s reader'
  WHERE interface_id = 'L2-I04';
UPDATE objects.interface_register SET binding_state = 'bound', schema_version = 'v1', bound_at = clock_timestamp(), bound_in = '0078',
  bound_to = 'TwinStateChanged@v1 (change version.admitted) from POST …/twins/:id/versions/:v/admit (twin.version.admit → twin.admit_version: the version, the changed variables against the superseded version with their confidence, the freshness cut-offs and completeness, the dependency impacts — the superseded version''s runs) beside GraphChanged/twin.state_changed (objects.twins, objects.simulations = those runs; no walk) to the seven consumers (the decisions consumer notes the packages citing them; the twins consumer leaves a twin''s own admission alone); (change version.unverified) from the twins consumer''s mark (twin.apply_subscription_mark, in the item''s transaction); the walk''s own unverification (graph.record_impact) is announced by its GraphChanged/invalidation.assessed; version.reverified is vocabulary — no port writes it'
  WHERE interface_id = 'L5-I04';
UPDATE objects.interface_register SET binding_state = 'bound', schema_version = 'v2', bound_at = clock_timestamp(), bound_in = '0078',
  bound_to = 'ForecastIssued@v2 from POST …/prediction/forecasts/issue (prediction.forecast.issue → prediction.issue_forecast; the v1 fields kept, plus schema, cause, temporal.known_at, the distribution summary, the validation state with its backtest, the calibration (skill), the drivers, the lineage (assumptions, evidence refs), the computed expiry from the refresh cadence); a recomputation still publishes GraphChanged/forecast.superseded (0065) to the scenario and decision consumers; no consumer of the issue itself — nothing rests on a forecast at issue'
  WHERE interface_id = 'L6-I02';
UPDATE objects.interface_register SET binding_state = 'bound', schema_version = 'v1', bound_at = clock_timestamp(), bound_in = '0078',
  bound_to = 'ForecastWithdrawn@v1 from POST …/prediction/forecasts/:id/withdraw (prediction.forecast.withdraw, human-gated → prediction.withdraw_forecast: state withdrawn with the reason and unfit class, the withdrawn FCT version, the dependants named — scenarios, warnings, twins, simulations, packages; the warnings marked by the port) beside GraphChanged/forecast.withdrawn (objects.forecasts) to the seven consumers: the scenario marked input_unverified, the package noted with material_change, the twin version citing it unverified, retrieval verified; the runs resting on it are named and refused as citations (decision.derive_option), and their invalidation is a reproduction''s or the operator''s act — a reproduction of such a run is unreproducible from then on (the automatic invalidation); decision.derive_option refuses a withdrawn forecast; declare_scenario refuses one'
  WHERE interface_id = 'L6-I05';
UPDATE objects.interface_register SET binding_state = 'bound', schema_version = 'v1', bound_at = clock_timestamp(), bound_in = '0078',
  bound_to = 'SimulationStarted@v1 from the opening write of POST …/twins/simulations/run (simulation.run → simulation.open_run: the resolved artefacts — twin version, branch, scenario version and branch state, model and implementation digest, environment (node, platform, arch) and its digest, the stochastic contract with its seed, the initial-state and inputs digests, the cut-offs, the execution identity (operator), state opened); no consumer'
  WHERE interface_id = 'L8-I02';
UPDATE objects.interface_register SET binding_state = 'bound', schema_version = 'v1', bound_at = clock_timestamp(), bound_in = '0078',
  bound_to = 'SimulationCompleted@v1 from the completing write of POST …/twins/simulations/run (simulation.run.complete → simulation.complete_run: state completed with the outputs digest, totals, the impacts against the control, uncertainty (the stochastic contract), sensitivity, validation, the reproducibility digests, the SIM object and the RESOURCE EVIDENCE — elapsed, samples, process, memory — on the row and in the event) and, state failed, from the failing write (the failure, outputs declared missing); no consumer'
  WHERE interface_id = 'L8-I03';
UPDATE objects.interface_register SET binding_state = 'bound', schema_version = 'v1', bound_at = clock_timestamp(), bound_in = '0078',
  bound_to = 'SimulationInvalidated@v1 from POST …/twins/simulations/:runId/invalidate (simulation.run.invalidate, human-gated) and from the reproduce write (simulation.reproduce) → simulation.invalidate_run — on an unreproducible verdict caused by a withdrawn or retired input, or by the operator''s act; never for an implementation, access or infrastructure cause: validity invalidated with the reason and the trigger (operator, or reproduction with its reproduction id), the withdrawn SIM version, run.invalidated, the dependent packages, commitments, decisions, twins and runs identified; beside GraphChanged/simulation.invalidated (objects.simulations) the decisions consumer notes every package citing the run with material_change; decision.derive_option refuses an invalidated run at set_option, propose and the reopen''s carry'
  WHERE interface_id = 'L8-I05';
UPDATE objects.interface_register SET binding_state = 'bound', schema_version = 'v1', bound_at = clock_timestamp(), bound_in = '0078',
  bound_to = 'DecisionPackageReady@v1 from POST …/decisions/:id/versions/:v/propose (decision.package.propose → decision.propose_version: the version and header digests, the objectives, the options with their uncertainty and cited runs, the choice, the dissent recorded, the provenance (every citation), the approver policy, the monitoring conditions, the baseline); no consumer — the reviewers are the room''s members'
  WHERE interface_id = 'L9-I02';
UPDATE objects.interface_register SET binding_state = 'bound', schema_version = 'v1', bound_at = clock_timestamp(), bound_in = '0078',
  bound_to = 'DecisionCommitted@v1 from POST …/decisions/:id/versions/:v/commit (decision.commit, C3, human-gated → decision.commit_package: the commitment id, the approvals it stood on, the op class and policy decision, the CMT strategy object and what it rests on, the monitoring conditions, the execution handoff (the CMT is the handoff record — no execution interface exists), the replay snapshot (decided_at, the version digest); one commitment per committed version — a re-commit after a reopen names the earlier commitment); no consumer'
  WHERE interface_id = 'L9-I04';
UPDATE objects.interface_register SET binding_state = 'bound', schema_version = 'v1', bound_at = clock_timestamp(), bound_in = '0078',
  bound_to = 'DecisionReopened@v1 from POST …/decisions/:id/reopen (decision.package.reopen, human-gated → decision.reopen_package: a committed package on a recorded cause — an input.invalidated note after the commitment or a condition breach of the committed version — state reopened, a new draft carried with the stale or withdrawn inputs exposed and the options resting on them dropped and named; the commitment, approvals and committed version immutable); the draft goes propose (DecisionPackageReady) → approve → commit (DecisionCommitted, a second commitment); a policy change has no recorded cause on a package (L10-I05, B20); no consumer'
  WHERE interface_id = 'L9-I05';
DO $$
DECLARE v_bound int; v_partial int; v_unbound int;
BEGIN
  SELECT count(*) FILTER (WHERE binding_state = 'bound'), count(*) FILTER (WHERE binding_state = 'partial'), count(*) FILTER (WHERE binding_state = 'unbound') INTO v_bound, v_partial, v_unbound FROM objects.interface_register;
  IF (v_bound, v_partial, v_unbound) <> (36, 14, 0) THEN
    RAISE EXCEPTION 'interface register after 0078: expected 36 bound, 14 partial, 0 unbound; found %, %, %', v_bound, v_partial, v_unbound;
  END IF;
END $$;
