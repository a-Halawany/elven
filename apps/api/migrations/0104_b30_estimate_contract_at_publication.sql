-- 0104 — B30 publication concern (2026-10-04): an estimate's approval requires the constraint CONTRACT it was checked against to be the live one.
--
-- THE FINDING (reproduced on a disposable database through the real governed paths, phase6-estimation-b30 ES8): twin.decide_estimate (0103 §ES)
-- checked only the STORED constraint_outcome. A proposal checked against constraint-set vN was still approvable after the steward published vN+1
-- (which the proposal violates) or retired the set, the twin head unchanged — the snapshot published under a contract no longer in force.
--
-- THE CORRECTION (forward; 0001–0103 untouched): twin.decide_estimate re-declared, copied whole from its live definition (0103 §ES), one marked
-- block added. On approval: every pinned set is live and still at the pinned version and digest, and no live set the primary estimator selects
-- (its named sets, or every set of the domain when it names none) was declared or versioned after the proposal without being pinned — else
-- 'estimate rejected (contract)', which rolls back the whole approval (the draft, the grounding, the admission, the approval event, the outbox).
-- The proposal's own check is its history and is not rewritten. A decline is not affected.

CREATE OR REPLACE FUNCTION twin.decide_estimate(p_estimate_id uuid, p_tenant uuid, p_domain uuid, p_decision text, p_note text, p_new_version integer, p_actor uuid, p_correlation uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'twin', 'observation', 'simulation', 'ctx', 'public', 'pg_catalog', 'pg_temp'
AS $function$
DECLARE x twin.estimates%ROWTYPE; v_owner uuid; nv twin.twin_versions%ROWTYPE; el twin.state_elements%ROWTYPE; v_note text := nullif(btrim(coalesce(p_note, '')), '');
        v_pin jsonb; v_set simulation.constraint_sets%ROWTYPE; v_cur_digest text; v_pinned text[]; v_selected text[]; v_late record;   -- 0104
BEGIN
  PERFORM observation.assert_authority(ARRAY['twin.estimate.decide']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM twin.tes_assert_actor('estimate', p_actor);
  SELECT * INTO x FROM twin.estimates e WHERE e.estimate_id = p_estimate_id AND e.tenant_id = p_tenant AND e.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'estimate rejected (unknown_estimate): % is not an estimate of this domain', p_estimate_id USING ERRCODE = '23503'; END IF;
  SELECT owner_principal_id INTO v_owner FROM twin.twins_current WHERE twin_id = x.twin_id;
  IF v_owner IS DISTINCT FROM p_actor THEN
    RAISE EXCEPTION 'estimate rejected (ownership): an estimate of twin % is decided by the twin''s owner', x.twin_id USING ERRCODE = '42501';
  END IF;
  IF x.proposed_by = p_actor THEN
    RAISE EXCEPTION 'estimate rejected (separation_of_duties): the proposer of estimate % does not decide it', p_estimate_id USING ERRCODE = '42501';
  END IF;
  IF x.state <> 'proposed' THEN RAISE EXCEPTION 'estimate rejected (state): estimate % is %, not proposed', p_estimate_id, x.state USING ERRCODE = '22023'; END IF;
  IF p_decision IS NULL OR p_decision NOT IN ('approved', 'declined') THEN RAISE EXCEPTION 'estimate rejected (decision): a decision is approved or declined' USING ERRCODE = '22023'; END IF;
  IF p_decision = 'declined' THEN
    IF coalesce(length(v_note), 0) < 8 THEN RAISE EXCEPTION 'estimate rejected (note): a declined estimate states its reason (at least 8 characters)' USING ERRCODE = '22023'; END IF;
    IF p_new_version IS NOT NULL THEN RAISE EXCEPTION 'estimate rejected (decision): a declined estimate opens no snapshot' USING ERRCODE = '22023'; END IF;
    UPDATE twin.estimates SET state = 'declined', decided_by = p_actor, decided_at = clock_timestamp(), decision_note = v_note WHERE estimate_id = p_estimate_id;
    PERFORM twin.tes_event(p_tenant, p_domain, x.twin_id, x.key, NULL, p_estimate_id, NULL, 'estimate.declined', p_actor, jsonb_build_object('note', v_note), p_correlation);
    RETURN jsonb_build_object('estimate_id', p_estimate_id, 'state', 'declined', 'twin_id', x.twin_id, 'key', x.key, 'note', v_note);
  END IF;
  -- APPROVAL: the validation before publish
  IF x.constraint_outcome <> 'satisfied' THEN
    RAISE EXCEPTION 'estimate rejected (constraint): the constraint check before publish is % (%); an estimate is published only on a satisfied check — propose again once it is',
      x.constraint_outcome, coalesce((SELECT string_agg(v ->> 'message', '; ') FROM jsonb_array_elements(x.constraint_check -> 'violations') v), x.constraint_check ->> 'reason', 'no applicable constraint') USING ERRCODE = '22023';
  END IF;
  -- 0104 (B30 publication concern, 2026-10-04): THE CONSTRAINT CONTRACT AT PUBLICATION. The stored check above is the proposal's HISTORY (kept
  -- as it was); the approval publishes only under the SAME live contract: every set version the proposal was checked against is still the live,
  -- current version of a live set (the digest compared), and no set the primary estimator selects came to apply after the proposal unpinned.
  -- A changed contract refuses the approval — and with it the whole transaction (the draft, the grounding and the admission roll back).
  IF p_decision = 'approved' THEN
    FOR v_pin IN SELECT * FROM jsonb_array_elements(coalesce(x.constraint_check -> 'pins', '[]'::jsonb)) LOOP
      SELECT * INTO v_set FROM simulation.constraint_sets s WHERE s.set_id = (v_pin ->> 'set_id')::uuid AND s.tenant_id = x.tenant_id AND s.domain_id = x.domain_id;
      IF NOT FOUND OR v_set.state <> 'live' THEN
        RAISE EXCEPTION 'estimate rejected (contract): constraint set % (v%) that estimate % was checked against is %; propose again under the live contract',
          v_pin ->> 'set_key', v_pin ->> 'version', p_estimate_id, coalesce(v_set.state, 'not found') USING ERRCODE = '22023';
      END IF;
      SELECT v.digest INTO v_cur_digest FROM simulation.constraint_set_versions v WHERE v.set_id = v_set.set_id AND v.version = v_set.current_version;
      IF v_set.current_version IS DISTINCT FROM (v_pin ->> 'version')::int OR v_cur_digest IS DISTINCT FROM v_pin ->> 'digest' THEN
        RAISE EXCEPTION 'estimate rejected (contract): constraint set % was v% when estimate % was checked and is v% now; propose again under the live contract',
          v_pin ->> 'set_key', v_pin ->> 'version', p_estimate_id, v_set.current_version USING ERRCODE = '22023';
      END IF;
    END LOOP;
    v_pinned := ARRAY(SELECT p ->> 'set_key' FROM jsonb_array_elements(coalesce(x.constraint_check -> 'pins', '[]'::jsonb)) p);
    SELECT e.constraint_sets INTO v_selected FROM twin.estimators e
     WHERE e.estimator_id = (x.primary_estimator ->> 'estimator_id')::uuid AND e.version = (x.primary_estimator ->> 'version')::int;
    SELECT s.set_key, s.current_version INTO v_late FROM simulation.constraint_sets s JOIN simulation.constraint_set_versions v ON v.set_id = s.set_id AND v.version = s.current_version
     WHERE s.tenant_id = x.tenant_id AND s.domain_id = x.domain_id AND s.state = 'live' AND NOT (s.set_key = ANY (v_pinned))
       AND (coalesce(cardinality(v_selected), 0) = 0 OR s.set_key = ANY (v_selected))
       AND v.declared_at > x.proposed_at
       AND EXISTS (SELECT 1 FROM jsonb_array_elements(v.constraints) c WHERE NOT (c ? 'applies_to') OR c -> 'applies_to' ? 'run_input')
     ORDER BY s.set_key LIMIT 1;
    IF FOUND THEN
      RAISE EXCEPTION 'estimate rejected (contract): constraint set % (v%) came to apply after estimate % was checked; propose again under the live contract',
        v_late.set_key, v_late.current_version, p_estimate_id USING ERRCODE = '22023';
    END IF;
  END IF;
  IF x.range_check ->> 'verdict' = 'outside' THEN
    RAISE EXCEPTION 'estimate rejected (range): % % is outside the declared bounds [%, %]', x.proposed_value, x.unit, coalesce(x.range_check ->> 'min', '−∞'), coalesce(x.range_check ->> 'max', '∞') USING ERRCODE = '22023';
  END IF;
  IF x.ambiguous AND coalesce(length(v_note), 0) < 8 THEN
    RAISE EXCEPTION 'estimate rejected (note): an ambiguous estimate (%) is approved with the owner''s note (at least 8 characters)',
      (SELECT string_agg(r, '; ') FROM jsonb_array_elements_text(x.ambiguity_reasons) r) USING ERRCODE = '22023';
  END IF;
  IF p_new_version IS NULL THEN RAISE EXCEPTION 'estimate rejected (decision): an approval names the snapshot it opened' USING ERRCODE = '22023'; END IF;
  SELECT * INTO nv FROM twin.twin_versions v WHERE v.twin_id = x.twin_id AND v.version = p_new_version;
  IF NOT FOUND OR nv.state <> 'admitted' OR nv.branch_id <> 'actual' THEN
    RAISE EXCEPTION 'estimate rejected (snapshot): version % of twin % is not an admitted version on actual', p_new_version, x.twin_id USING ERRCODE = '22023';
  END IF;
  IF nv.opened_by IS DISTINCT FROM p_actor OR NOT EXISTS (SELECT 1 FROM twin.twin_events te WHERE te.twin_id = x.twin_id AND te.event = 'version.admitted'
                                                           AND (te.details ->> 'version')::int = p_new_version AND te.correlation_id = p_correlation AND te.actor_principal_id = p_actor) THEN
    RAISE EXCEPTION 'estimate rejected (snapshot): version % was not opened and admitted by the approver in this approval', p_new_version USING ERRCODE = '22023';
  END IF;
  IF nv.supersedes IS DISTINCT FROM x.head_version THEN
    RAISE EXCEPTION 'estimate rejected (stale): estimate % was computed against v% of the twin; the head moved to v% — propose again on the current head', p_estimate_id,
      coalesce(x.head_version::text, 'none'), coalesce(nv.supersedes::text, 'none') USING ERRCODE = '22023';
  END IF;
  SELECT * INTO el FROM twin.state_elements s WHERE s.twin_id = x.twin_id AND s.version = p_new_version AND s.key = x.key;
  IF NOT FOUND OR el.kind <> 'estimated' OR jsonb_typeof(el.value) <> 'number' OR (el.value #>> '{}')::numeric <> x.proposed_value OR el.unit IS DISTINCT FROM x.unit THEN
    RAISE EXCEPTION 'estimate rejected (snapshot): version % does not carry % as the estimated value % %', p_new_version, x.key, x.proposed_value, x.unit USING ERRCODE = '22023';
  END IF;
  UPDATE twin.estimates SET state = 'approved', decided_by = p_actor, decided_at = clock_timestamp(), decision_note = v_note, applied_version = p_new_version WHERE estimate_id = p_estimate_id;
  PERFORM twin.tes_event(p_tenant, p_domain, x.twin_id, x.key, NULL, p_estimate_id, NULL, 'estimate.approved', p_actor,
    jsonb_build_object('applied_version', p_new_version, 'supersedes', nv.supersedes, 'element_id', el.element_id, 'value', x.proposed_value, 'unit', x.unit, 'note', v_note,
                       'state_set_digest', nv.state_set_digest, 'material', x.material, 'ambiguous', x.ambiguous), p_correlation);
  RETURN jsonb_build_object('estimate_id', p_estimate_id, 'state', 'approved', 'twin_id', x.twin_id, 'key', x.key, 'value', x.proposed_value, 'unit', x.unit,
                            'applied_version', p_new_version, 'supersedes', nv.supersedes, 'element_id', el.element_id, 'note', v_note);
END $function$;
