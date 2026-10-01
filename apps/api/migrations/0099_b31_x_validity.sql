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
DECLARE r simulation.runs_current%ROWTYPE; v_factors jsonb := '[]'::jsonb; v_source text := 'run'; v_map jsonb := '[]'::jsonb; v_out jsonb := '[]'::jsonb; a record; m jsonb; f jsonb; v_rank int;
BEGIN
  SELECT * INTO r FROM simulation.runs_current x WHERE x.run_id = p_run_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF to_regclass('simulation.sensitivity_analyses') IS NOT NULL THEN
    EXECUTE 'SELECT coalesce((SELECT a.factors FROM simulation.sensitivity_analyses a WHERE a.run_id = $1 ORDER BY a.requested_at DESC NULLS LAST LIMIT 1), ''[]''::jsonb)' INTO v_factors USING p_run_id;
    IF jsonb_array_length(v_factors) > 0 THEN v_source := 'analysis'; END IF;
  END IF;
  IF jsonb_array_length(v_factors) = 0 THEN
    -- the run's own one-at-a-time factors, ranked by the cost spread (the service's sensitivityOf; supply-flow)
    SELECT coalesce(jsonb_agg(jsonb_build_object('key', x.f ->> 'key', 'spread', (x.f ->> 'cost_spread')::numeric, 'rank', x.rk) ORDER BY x.rk), '[]'::jsonb) INTO v_factors
      FROM (SELECT f, row_number() OVER (ORDER BY coalesce((f ->> 'cost_spread')::numeric, 0) DESC, f ->> 'key') AS rk FROM jsonb_array_elements(coalesce(r.sensitivity -> 'factors', '[]'::jsonb)) f) x;
  END IF;
  SELECT coalesce(k.assumption_factors, '[]'::jsonb) INTO v_map FROM prediction.branch_twin_bindings k WHERE k.branch_id = r.scenario_branch_id AND k.state = 'active';
  v_map := coalesce(v_map, '[]'::jsonb);
  FOR a IN SELECT l.assumption_id, l.critical, l.invalidation_condition, s.title, s.verification_state, prediction.psa_condition_met(l.invalidation_condition, l.assumption_id) AS met
             FROM prediction.scenario_assumptions l JOIN graph.strategy_current s ON s.strategy_object_id = l.assumption_id
            WHERE r.scenario_id IS NOT NULL AND l.scenario_id = r.scenario_id AND (l.branch_id IS NULL OR l.branch_id = r.scenario_branch_id) AND l.state = 'linked' AND l.critical
            ORDER BY s.title LOOP
    SELECT x INTO m FROM jsonb_array_elements(v_map) x WHERE x ->> 'assumption_id' = a.assumption_id::text LIMIT 1;
    f := NULL; v_rank := NULL;
    IF m IS NOT NULL THEN
      SELECT x INTO f FROM jsonb_array_elements(v_factors) x WHERE x ->> 'key' = m ->> 'factor_key' LIMIT 1;
      v_rank := (f ->> 'rank')::int;
    END IF;
    v_out := v_out || jsonb_build_object('assumption_id', a.assumption_id, 'title', a.title, 'verification_state', a.verification_state, 'condition', a.invalidation_condition, 'condition_met', a.met,
      'factor_key', m ->> 'factor_key', 'factor', f, 'rank', v_rank,
      'material', CASE WHEN m IS NULL OR f IS NULL THEN NULL ELSE v_rank <= 3 END,
      'measured', m IS NOT NULL AND f IS NOT NULL,
      'note', CASE WHEN m IS NULL THEN 'no factor is mapped to this critical assumption on the branch''s binding: its sensitivity is not measured'
                   WHEN f IS NULL THEN format('factor %s is not among the run''s sensitivity factors', m ->> 'factor_key')
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
