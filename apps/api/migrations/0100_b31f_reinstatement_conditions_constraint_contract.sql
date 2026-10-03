-- 0100 — CP-6 B31-F (2026-10-01): the owner's bounded correction pass on B31 — B31-F1 (reinstatement re-evaluates every linked critical
-- condition) and B31-F2 (a run honours the constraint contract recorded in its branch's binding). Forward-only; 0097 and 0099 are applied on
-- the demonstration and untouched: the two functions are RE-DECLARED here, each copied whole from its last declaration with the change
-- marked, and one trigger is added.
--
-- §F1 B31-F1 — 0099 suspends a branch when a CRITICAL claim condition is met (the claim disputed or withdrawn) or a critical indicator
--     condition is met (the indicator breached); 0097's prediction.reinstate_branch blocked only on the assumption's own verification state,
--     so a note reinstated a branch while its claim stayed disputed or its indicator stayed breached. Re-declared from 0097 §A6: the blocking
--     set is every linked critical link whose ASU is invalidated OR whose invalidation condition is met now (prediction.psa_condition_met,
--     0097 §A4); a note never clears it. Recovery: the condition resolved, or a governed change to the link (revised non-critical, unlinked).
-- §F2 B31-F2 — prediction.bind_branch_twin (0099 §V8) records constraint_set_id and its version; prediction.siv_run_branch_binding checked
--     neither, and the constraint gate (TS ConstraintService.currentSets) evaluates every LIVE set at its CURRENT version: a branch bound to
--     v1 was checked against v2, and its set omitted once retired. Re-declared from 0099 §V8: a run on a branch bound to a set is admitted only
--     while the set is live at the bound version (else `run rejected (branch_binding)` — rebind to adopt); and a new trigger refuses an
--     INDETERMINATE opening verdict on such a run (the gate failed or could not check: the bound contract unverified is never admitted). A
--     violated bound constraint is refused by the gate before the run exists (`run rejected (constraint)`, 422), on the experiment path too
--     (the experiment opens its run through the same path).

-- ─────────────────────────────────────────────────────────────────────
-- §F1 REINSTATEMENT RE-EVALUATES EVERY LINKED CRITICAL CONDITION (re-declared from 0097 §A6)
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION prediction.reinstate_branch(
  p_tenant uuid, p_domain uuid, p_branch_id uuid, p_note text, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, graph, executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE b prediction.branches_current%ROWTYPE; s prediction.scenarios_current%ROWTYPE; v_blocking text; v_items jsonb; i record;
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.scenario.anatomy.reinstate']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM prediction.psa_assert_actor('branch suspension', p_actor, p_tenant);
  SELECT * INTO b FROM prediction.branches_current x WHERE x.branch_id = p_branch_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'branch suspension rejected (unknown_branch): no branch % in this domain', p_branch_id USING ERRCODE = '23503'; END IF;
  SELECT * INTO s FROM prediction.scenarios_current c WHERE c.scenario_id = b.scenario_id;
  IF p_actor IS DISTINCT FROM b.owner_principal_id AND p_actor IS DISTINCT FROM s.owner_principal_id THEN
    RAISE EXCEPTION 'branch suspension rejected (ownership): branch "%" is reinstated by its owner or the scenario''s owner', b.name USING ERRCODE = '42501';
  END IF;
  IF b.state <> 'suspended' THEN RAISE EXCEPTION 'branch suspension rejected (state): branch "%" is %, not suspended', b.name, b.state USING ERRCODE = '22023'; END IF;
  IF s.state <> 'active' THEN RAISE EXCEPTION 'branch suspension rejected (state): scenario "%" is %', s.title, s.state USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_note, ''))) < 16 THEN RAISE EXCEPTION 'branch suspension rejected (note): a reinstatement states why the branch holds again (16+ characters)' USING ERRCODE = '22023'; END IF;
  -- 0097's check, kept exactly (its refusal text is pinned): a critical linked assumption still INVALIDATED.
  SELECT string_agg(format('"%s"', a.title), ', ' ORDER BY a.title) INTO v_blocking
    FROM prediction.scenario_assumptions l JOIN graph.strategy_current a ON a.strategy_object_id = l.assumption_id
   WHERE l.scenario_id = b.scenario_id AND (l.branch_id IS NULL OR l.branch_id = b.branch_id) AND l.state = 'linked' AND l.critical AND a.verification_state = 'invalidated';
  IF v_blocking IS NOT NULL THEN
    RAISE EXCEPTION 'branch suspension rejected (invalidated): the critical assumption % is still invalidated; verify it again or unlink it with a reason before the branch is reinstated', v_blocking USING ERRCODE = '22023';
  END IF;
  -- B31-F1: EVERY other linked critical condition re-evaluated — the link's invalidation condition met NOW (prediction.psa_condition_met:
  -- a CLAIM disputed or withdrawn, an INDICATOR breached). The note never clears an unresolved condition: recovery follows the condition's
  -- resolution or a governed change to the link (revised non-critical, or unlinked, through link_scenario_assumption / unlink_scenario_assumption).
  SELECT string_agg(format('"%s" (%s)', a.title,
           CASE WHEN l.invalidation_condition ->> 'kind' = 'claim' THEN format('its claim condition is met — claim %s is disputed or withdrawn', l.invalidation_condition ->> 'claim_id')
                WHEN l.invalidation_condition ->> 'kind' = 'indicator' THEN format('its indicator condition is met — indicator %s is breached', l.invalidation_condition ->> 'indicator_id')
                ELSE 'its condition is met' END), ', ' ORDER BY a.title) INTO v_blocking
    FROM prediction.scenario_assumptions l JOIN graph.strategy_current a ON a.strategy_object_id = l.assumption_id
   WHERE l.scenario_id = b.scenario_id AND (l.branch_id IS NULL OR l.branch_id = b.branch_id) AND l.state = 'linked' AND l.critical
     AND prediction.psa_condition_met(l.invalidation_condition, l.assumption_id);
  IF v_blocking IS NOT NULL THEN
    RAISE EXCEPTION 'branch suspension rejected (invalidated): the critical assumption % still holds against the branch; resolve the condition (the claim resolved, the indicator no longer breached) or change the link (revise it non-critical or unlink it, with a reason) before the branch is reinstated — a note does not clear it', v_blocking USING ERRCODE = '22023';
  END IF;
  UPDATE prediction.branches_current SET state = b.suspended_from, reinstated_at = clock_timestamp(), reinstated_by = p_actor, reinstatement_note = btrim(p_note)
   WHERE branch_id = b.branch_id RETURNING * INTO b;
  INSERT INTO prediction.scenario_events (event_id, scope, tenant_id, domain_id, scenario_id, branch_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, b.scenario_id, b.branch_id, 'branch.reinstated', p_actor,
          jsonb_build_object('name', b.name, 'state', b.state, 'note', b.reinstatement_note, 'suspended_at', b.suspended_at, 'cause', b.suspension_cause), p_correlation);
  v_items := '[]'::jsonb;
  FOR i IN SELECT it.item_id FROM executive.attention_items it
            WHERE it.tenant_id = p_tenant AND it.domain_id = p_domain AND it.signal_class = 'scenario.suspension' AND it.subject_kind = 'branch' AND it.subject_id = b.branch_id AND it.state <> 'closed'
            FOR UPDATE LOOP
    UPDATE executive.attention_items SET state = 'closed', closed_at = clock_timestamp(), closed_by = p_actor, suppressed_until = NULL, updated_at = clock_timestamp() WHERE item_id = i.item_id;
    PERFORM executive.attention_event(i.item_id, p_tenant, p_domain, 'item.closed', p_actor, jsonb_build_object('reason', 'the branch was reinstated', 'branch_id', b.branch_id, 'event_id', p_event_id), p_correlation);
    v_items := v_items || jsonb_build_array(i.item_id);
  END LOOP;
  RETURN jsonb_build_object('branch_id', b.branch_id, 'scenario_id', b.scenario_id, 'name', b.name, 'state', b.state, 'reinstated_at', b.reinstated_at, 'reinstated_by', b.reinstated_by,
                            'reinstatement_note', b.reinstatement_note, 'suspended_at', b.suspended_at, 'closed_items', v_items);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.reinstate_branch(uuid,uuid,uuid,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.reinstate_branch(uuid,uuid,uuid,text,uuid,uuid,uuid) TO eye_commit;

-- ─────────────────────────────────────────────────────────────────────
-- §F2 THE BOUND CONSTRAINT CONTRACT (re-declared from 0099 §V8; the trigger siv_run_branch_binding on simulation.runs_current stands)
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION prediction.siv_run_branch_binding() RETURNS trigger
SECURITY DEFINER SET search_path = prediction, simulation, pg_catalog, pg_temp AS $$
DECLARE k prediction.branch_twin_bindings%ROWTYPE; c jsonb; v jsonb; cs simulation.constraint_sets%ROWTYPE;
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
  -- B31-F2: THE BOUND CONSTRAINT CONTRACT. The constraint gate evaluates every LIVE set at its CURRENT version; a binding that names a set
  -- and its version admits a run only while that set is live AT the bound version — a newer version is never silently substituted and a
  -- retired set never silently omitted: the branch's owner REBINDS to adopt the change (or binds without the set).
  IF k.constraint_set_id IS NOT NULL THEN
    SELECT * INTO cs FROM simulation.constraint_sets x WHERE x.set_id = k.constraint_set_id;
    IF NOT FOUND OR cs.state <> 'live' THEN
      RAISE EXCEPTION 'run rejected (branch_binding): branch % is bound (binding v%) to constraint set "%" v%, which is %; the bound contract cannot be honoured — rebind the branch (without the set, or to another set) before a run',
        NEW.scenario_branch_id, k.version, coalesce(cs.set_key, k.constraint_set_id::text), k.constraint_set_version, coalesce(cs.state, 'gone') USING ERRCODE = '22023';
    END IF;
    IF cs.current_version <> k.constraint_set_version THEN
      RAISE EXCEPTION 'run rejected (branch_binding): branch % is bound (binding v%) to constraint set "%" v%, which now stands at v%; the run would be checked against v% — rebind the branch to adopt v% (or keep the bound contract) before a run',
        NEW.scenario_branch_id, k.version, cs.set_key, k.constraint_set_version, cs.current_version, cs.current_version, cs.current_version USING ERRCODE = '22023';
    END IF;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

REVOKE ALL ON FUNCTION prediction.siv_run_branch_binding() FROM PUBLIC;

/* The OPENING verdict on a run whose branch binding names a constraint set must be a verdict on it: INDETERMINATE (the gate failed, timed
   out, or could not check a set) refuses the opening write — the run is not admitted on an unverified contract. Satisfied and violated are
   the gate's (a violated verdict never reaches here: the run is refused before it exists). */
CREATE OR REPLACE FUNCTION prediction.siv_run_binding_constraint_check() RETURNS trigger
SECURITY DEFINER SET search_path = prediction, simulation, pg_catalog, pg_temp AS $$
DECLARE r simulation.runs_current%ROWTYPE; k prediction.branch_twin_bindings%ROWTYPE;
BEGIN
  IF NEW.stage <> 'opening' OR NEW.outcome <> 'indeterminate' THEN RETURN NEW; END IF;
  SELECT * INTO r FROM simulation.runs_current x WHERE x.run_id = NEW.run_id;
  IF NOT FOUND OR r.scenario_branch_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO k FROM prediction.branch_twin_bindings x WHERE x.branch_id = r.scenario_branch_id AND x.state = 'active';
  IF NOT FOUND OR k.constraint_set_id IS NULL THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'run rejected (branch_binding): branch % is bound (binding v%) to constraint set % v%, and the opening check could not verify it (%); the run is not admitted on an unverified contract',
    r.scenario_branch_id, k.version, k.constraint_set_id, k.constraint_set_version, coalesce(NEW.indeterminate_reason, 'no reason given') USING ERRCODE = '22023';
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.siv_run_binding_constraint_check() FROM PUBLIC;
CREATE TRIGGER siv_run_binding_constraint_check AFTER INSERT ON simulation.run_constraint_checks
  FOR EACH ROW EXECUTE FUNCTION prediction.siv_run_binding_constraint_check();
