-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0122 B82-F cc — CORRECTION CLOSURE FOR THE AFFECTED PRODUCT'S OWNER (B50 §CL, "Observed, not fixed"). Part-local file of the B80–B82
-- integration pass (the coordinator folds the parts into the one forward 0122); applies ALONE on 0001–0121.
--
-- THE GAP. 0120 §CL records a per-consumer obligation that the AFFECTED PRODUCT'S OWNER acknowledges or excepts (graph.closure.acknowledge /
-- .except — exact rules whose roles include the executive, the executive operator, the decision owner and the decision approver), but every
-- read of the case (graph.correction_closure_read, the list, the contract) is reached only under `graph.read`, whose roles exclude them: on
-- the demonstration the owner, authorized for the act, could not find what to act on.
--
-- THE CORRECTION (one new port; nothing of 0001–0121 re-declared; no table, role, binding or registry row added):
--   graph._cl_closer_basis — the SAME rule as graph._cl_assert_closer (0120 §CL.6), answering instead of raising: who closes one consumer
--     (its accountable owner when an active human owns it — or a holder of the act's extra roles; else a knowledge owner or the domain
--     administrator); a human review never by the correction authority who applied the case. Internal (no runtime grant).
--   graph.correction_obligations — THE OBLIGATION READ under its own exact action `graph.closure.obligation.read` (the PDP rule's roles are
--     the acknowledge / except rule's, unchanged — B82-F cc block of pdp.service.ts). It answers ONLY the material consumers of the domain's
--     OPEN (or stalled) cases that the ACTING PRINCIPAL answers for as the existing acknowledge / except ports decide, and per consumer ONLY
--     what the act needs: the case (id, kind, closure state, reason, received / applied instants), the corrected objects and their versions,
--     the consumer reference and its class / state / deadline / freeze marker, the latest act on it (whether it was the caller's), its stall
--     escalations (state, due, count), and the allowed acts with their constraints. NEVER the walk's path, the notice, the other consumers,
--     the freezes ledger, the events or any evidence content; it grants no graph.read, observation.read or evidence action. The acts stay
--     the EXISTING ports' (graph.acknowledge_consumer / graph.except_consumer — unchanged), which re-check everything.
--   The port re-checks the bound action (observation.assert_authority), the scope (observation.assert_scope) and the acting principal
--   (graph._cl_person: the session's own, an active human); SECURITY DEFINER, its search_path closed with pg_catalog, pg_temp; EXECUTE from
--   PUBLIC revoked; granted to eye_commit only (the consequential read's writer). The refusal noun stays §CL's `correction closure rejected`.
-- SYNTHETIC demonstration records only; CONSTRUCTION; real acceptance never claimed here.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- B82-F cc: the closer rule of graph._cl_assert_closer (0120 §CL.6), as an answer: {can, basis, reason}.
CREATE OR REPLACE FUNCTION graph._cl_closer_basis(p_tenant uuid, p_domain uuid, p_class text, p_owner uuid, p_applier uuid, p_actor uuid, p_extra_roles text[]) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = graph, pg_catalog, pg_temp AS $$
BEGIN
  IF p_class = 'human_review' AND p_actor IS NOT DISTINCT FROM p_applier THEN
    RETURN jsonb_build_object('can', false, 'basis', NULL, 'reason',
      'separation of duties: a human review is decided by its owner — the correction authority who applied the case never acknowledges or excepts it');
  END IF;
  IF p_owner IS NOT NULL AND decision.is_active_human(p_owner, p_tenant) THEN
    IF p_actor = p_owner THEN RETURN jsonb_build_object('can', true, 'basis', 'the accountable owner', 'reason', NULL); END IF;
    IF p_extra_roles IS NOT NULL AND executive.holds_role(p_actor, p_tenant, p_domain, p_extra_roles) THEN
      RETURN jsonb_build_object('can', true, 'basis', 'a holder of ' || array_to_string(p_extra_roles, ' / '), 'reason', NULL);
    END IF;
    RETURN jsonb_build_object('can', false, 'basis', NULL, 'reason', 'authority: the consumer has an owner; its owner closes it');
  END IF;
  IF executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['knowledge_owner', 'domain_admin'] || coalesce(p_extra_roles, '{}'::text[])) THEN
    RETURN jsonb_build_object('can', true, 'basis', 'no active human owns it: a knowledge owner or the domain administrator', 'reason', NULL);
  END IF;
  RETURN jsonb_build_object('can', false, 'basis', NULL, 'reason', 'authority: no active human owns it; a knowledge owner or the domain administrator closes it');
END $$;
REVOKE ALL ON FUNCTION graph._cl_closer_basis(uuid, uuid, text, uuid, uuid, uuid, text[]) FROM PUBLIC;

/*
 * B82-F cc — THE OBLIGATION READ: the acting principal's own correction obligations (optionally of one case). An unknown case, a closed
 * case or a case with nothing of theirs answers an empty list (no existence oracle beyond the caller's own obligations).
 */
CREATE OR REPLACE FUNCTION graph.correction_obligations(p_tenant uuid, p_domain uuid, p_actor uuid, p_case uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = graph, executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid; v_now timestamptz := clock_timestamp(); k graph.closure_contracts; v_max int; cl record; x record; v_applier uuid; v_held boolean;
        v_ack jsonb; v_exc jsonb; v_owner boolean; v_out jsonb := '[]'::jsonb;
        v_ack_ok boolean; v_ack_why text; v_rc_ok boolean; v_rc_why text; v_ex_ok boolean; v_ex_why text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.closure.obligation.read']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  v_actor := graph._cl_person(p_actor, p_tenant);
  k := graph._cl_contract(p_tenant, p_domain);
  v_max := coalesce(k.exception_max_days, 30);
  FOR cl IN
    SELECT c.case_id, c.state AS closure_state, c.opened_at, cs.kind, cs.reason, cs.received_at, cs.closed_at AS applied_at, cs.affected_resolved
      FROM graph.correction_closures c
      JOIN observation.correction_current cs ON cs.case_id = c.case_id AND cs.tenant_id = c.tenant_id AND cs.domain_id = c.domain_id
     WHERE c.tenant_id = p_tenant AND c.domain_id = p_domain AND c.state <> 'closed' AND (p_case IS NULL OR c.case_id = p_case)
     ORDER BY c.opened_at DESC, c.case_id
  LOOP
    v_applier := graph._cl_applier(cl.case_id);
    v_held := jsonb_array_length(coalesce(graph._cl_scope(p_tenant, p_domain, cl.case_id) -> 'held_roots', '[]'::jsonb)) > 0;
    FOR x IN SELECT * FROM graph._cl_consumers(p_tenant, p_domain, cl.case_id, v_now, k.windows, cl.opened_at) y WHERE y.material ORDER BY y.consumer_kind, y.consumer_ref LOOP
      -- WHO, as the existing ports decide: acknowledge (a subscription also by the domain administrator) and except (also a record authority or the administrator)
      v_owner := x.owner_principal_id IS NOT DISTINCT FROM v_actor;
      v_ack := graph._cl_closer_basis(p_tenant, p_domain, x.class, x.owner_principal_id, v_applier, v_actor, CASE WHEN x.consumer_kind = 'subscription' THEN ARRAY['domain_admin'] END);
      v_exc := graph._cl_closer_basis(p_tenant, p_domain, x.class, x.owner_principal_id, v_applier, v_actor, ARRAY['record_authority', 'domain_admin']);
      CONTINUE WHEN NOT (v_owner OR (v_ack ->> 'can')::boolean OR (v_exc ->> 'can')::boolean);
      -- WHAT the existing ports would admit now (their preconditions in their order; the ports re-check every one at the act)
      v_ack_ok := true; v_ack_why := NULL;
      IF x.state IN ('acknowledged', 'recomputed') THEN v_ack_ok := false; v_ack_why := format('state: the consumer is already %s', x.state);
      ELSIF x.consumer_kind = 'subscription' AND x.state <> 'failed' THEN v_ack_ok := false; v_ack_why := format('state: the subscription is %s; its own ledger acknowledges an applied delivery, a person acknowledges a failed one', x.state);
      ELSIF NOT (v_ack ->> 'can')::boolean THEN v_ack_ok := false; v_ack_why := v_ack ->> 'reason'; END IF;
      v_rc_ok := v_ack_ok; v_rc_why := v_ack_why;
      IF v_rc_ok AND x.consumer_kind = 'subscription' THEN v_rc_ok := false; v_rc_why := 'a subscription consumer is acknowledged (after its failure) or excepted, never recomputed';
      ELSIF v_rc_ok AND x.class = 'human_review' THEN v_rc_ok := false; v_rc_why := 'a person''s decision or commitment is reviewed and acknowledged by its owner, never recomputed (no automatic rewrite)'; END IF;
      v_ex_ok := true; v_ex_why := NULL;
      IF x.state IN ('acknowledged', 'recomputed', 'delivered') THEN v_ex_ok := false; v_ex_why := format('state: the consumer is already %s', x.state);
      ELSIF NOT (v_exc ->> 'can')::boolean THEN v_ex_ok := false; v_ex_why := v_exc ->> 'reason'; END IF;
      v_out := v_out || jsonb_build_array(jsonb_build_object(
        'case', jsonb_build_object('case_id', cl.case_id, 'kind', cl.kind, 'closure_state', cl.closure_state, 'reason', cl.reason, 'received_at', cl.received_at, 'applied_at', cl.applied_at),
        'corrected', (SELECT coalesce(jsonb_agg(jsonb_build_object('object_id', r ->> 'object_id', 'from_version', r -> 'from', 'to_version', r -> 'to')), '[]'::jsonb)
                        FROM jsonb_array_elements(coalesce(cl.affected_resolved, '[]'::jsonb)) r WHERE r ? 'object_id'),
        'consumer_ref', x.consumer_ref, 'consumer_kind', x.consumer_kind, 'product_kind', x.product_kind, 'object_type', x.object_type, 'product_id', x.product_id,
        'product_version', x.product_version, 'title', x.title, 'class', x.class, 'state', x.state, 'closing', x.closing, 'deadline', x.deadline, 'overdue', x.overdue,
        'frozen', EXISTS (SELECT 1 FROM graph.publication_freezes f WHERE f.case_id = cl.case_id AND f.lifted_at IS NULL AND f.object_id = x.product_id),
        'as_owner', v_owner,
        'basis', coalesce(v_ack ->> 'basis', v_exc ->> 'basis', CASE WHEN v_owner THEN 'the accountable owner' END),
        'latest_act', CASE WHEN x.ack_id IS NULL THEN NULL ELSE jsonb_build_object('state', x.ack_state, 'at', x.ack_at, 'by_you', x.ack_by IS NOT DISTINCT FROM v_actor,
                        'recompute_ref', x.recompute_ref, 'exception_expires_at', x.exception_expires_at) END,
        'escalations', (SELECT coalesce(jsonb_agg(jsonb_build_object('item_id', i.item_id, 'state', i.state, 'due_at', i.due_at, 'escalations', i.escalations, 'created_at', i.created_at)
                                                  ORDER BY i.created_at), '[]'::jsonb)
                          FROM executive.attention_items i
                         WHERE i.tenant_id = p_tenant AND i.domain_id = p_domain AND i.signal_class = 'correction_propagation_stall' AND i.subject_id = cl.case_id
                           AND i.details ->> 'consumer_ref' = x.consumer_ref),
        'acts', jsonb_build_object(
          'acknowledge', jsonb_build_object('allowed', v_ack_ok, 'reason', v_ack_why, 'action', 'graph.closure.acknowledge', 'note_chars', jsonb_build_array(8, 2000)),
          'recompute', jsonb_build_object('allowed', v_rc_ok, 'reason', v_rc_why, 'action', 'graph.closure.acknowledge', 'note_chars', jsonb_build_array(8, 2000),
                                          'recompute_ref', 'TYPE:<id>@<version> (a canonical version recorded after the apply) or export_package | backtest | method_validation | information_set:<id>'),
          'except', jsonb_build_object('allowed', v_ex_ok, 'reason', v_ex_why, 'action', 'graph.closure.except', 'reason_chars', jsonb_build_array(16, 2000),
                                       'expires_after', v_now, 'expires_by', v_now + make_interval(days => v_max), 'exception_max_days', v_max,
                                       'owner', 'an active human of this tenant answers for the exception', 'record_authority_owner_required', v_held))
      ));
    END LOOP;
  END LOOP;
  RETURN jsonb_build_object('schema', 'eye.correction-obligations/1', 'principal', v_actor, 'as_of', v_now, 'contract_version', k.version, 'case_filter', p_case,
    'count', jsonb_array_length(v_out), 'obligations', v_out,
    'statement', 'the correction obligations you answer for, as the acknowledge and except acts decide — never the case''s graph, its other consumers or any evidence');
END $$;
REVOKE ALL ON FUNCTION graph.correction_obligations(uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.correction_obligations(uuid, uuid, uuid, uuid) TO eye_commit;
COMMENT ON FUNCTION graph.correction_obligations(uuid, uuid, uuid, uuid) IS 'B82-F cc (0122): the acting principal''s own correction-closure obligations (graph.closure.obligation.read) — only the material consumers of open cases they answer for as graph.acknowledge_consumer / graph.except_consumer decide, with only what the act needs; never the case graph, other consumers or evidence.';
