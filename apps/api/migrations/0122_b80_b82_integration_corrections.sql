-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0122 — CP-6 THE B80–B82 INTEGRATION PASS (2026-10-20): two narrowly scoped corrections reported by the B50 and B82 demonstrations, as ONE
-- forward migration after 0121. Applied migrations 0115–0121 stay byte-identical; nothing of 0001–0121 is re-declared.
--
--   §RT  the rights terms for their declarers (B82 §EV): observation.rights_terms_register — rights METADATA only, under the new exact
--        action observation.rights.terms.read (data_steward | collection_manager at DOMAIN — the declare rule's roles); no evidence content.
--   §CC  correction closure for the affected product's owner (B50 §CL): graph._cl_closer_basis (internal) and graph.correction_obligations —
--        only the caller's own obligations, under the new exact action graph.closure.obligation.read (the acknowledge / except roles);
--        graph.read is NOT widened.
--
-- The trust overview's expired read (B82 §PX → the existing 503 EYE-DEP-001) and MET-010's definition and computation versions shown together
-- are TypeScript only. No table, role, binding, object type or registry row is added. Folded in order §RT, §CC (each applied alone on
-- 0001–0121 while it was built).
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0122 §RT — CP-6 B82-F (the B80–B82 integration pass): THE RIGHTS TERMS FOR THEIR DECLARERS (B82 §EV's follow-up). The part's own file
-- while it is built; the coordinator folds it into ONE forward 0122. Applies ALONE on 0001–0121. 0001–0121 are untouched.
--
-- THE GAP: a data steward (or a collection manager) at DOMAIN may DECLARE and WITHDRAW a source's rights terms (observation.rights.declare /
-- .withdraw — exact rules naming exactly those two roles), but could not READ them: the per-source read (`observation.read.rights`,
-- observation.rights_terms_read) rides the `observation.read` prefix rule, whose roles exclude the steward, and the form sat on the evidence
-- page, which needs evidence read.
--
-- WHAT THIS ADDS — ONE port, no table, no role, no binding, no registry row:
--   observation.rights_terms_register(p_tenant, p_domain) → jsonb   the bound domain's sources with their RIGHTS METADATA only: per source
--        contract version — the source's name, the contract version and its state, the contract's own rights statement (authority_and_rights:
--        rights state, licence, permitted use, purposes, attribution, retention, legal basis — read as recorded), the current rights terms
--        (state derived at read time; "no rights terms declared — no expiry declared" when none), every version (history) and the ledger.
--        NEVER evidence content, bytes, digests, locators, manifests, segments or observation payloads; nothing else of the contract.
--        Served under the NEW exact PDP action `observation.rights.terms.read` (data_steward | collection_manager at DOMAIN — exactly the
--        declare rule's roles). THE PORT re-checks: the bound action (and the live authority context), the scope (the bound tenant and
--        domain — never another domain's terms), and the acting principal (an active principal holding data_steward or collection_manager
--        bound at DOMAIN in this domain). It grants nothing else: observation.read, observation.evidence.* and every other observation read
--        stay as they were.
--
-- REFUSALS (class form, the §EV noun `rights terms` — already mapped centrally: authority|access → 403):
--   `rights terms rejected (authority)`   the context is not bound to observation.rights.terms.read · the acting principal holds no declarer
--                                         role at DOMAIN here                                                                   42501 → 403
--   `rights terms rejected (access)`      a tenant or domain other than the bound context's                                    42501 → 403
--
-- THREE CLAIMS: CONSTRUCTION (this file, the route, the page, phase6-b82f-rt); demonstrated operation and real acceptance — never claimed.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION observation.rights_terms_register(p_tenant uuid, p_domain uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = observation, graph, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_at timestamptz := clock_timestamp(); v_actor uuid := public.eye_principal(); v_series jsonb := '[]'::jsonb; v_n int := 0;
        v_truncated boolean := false; s record; cur observation.rights_terms;
BEGIN
  -- B82-F rt: THE AUTHORITY — the context is bound to this read, in authority mode, with a live issued nonce
  IF public.eye_bound_action() IS DISTINCT FROM 'observation.rights.terms.read' THEN
    RAISE EXCEPTION 'rights terms rejected (authority): the rights terms of a domain''s sources are read under observation.rights.terms.read; this context is bound to %',
      coalesce(public.eye_bound_action(), '<none>') USING ERRCODE = '42501';
  END IF;
  PERFORM ctx.assert_business_authority('observation.rights.terms.read');
  -- B82-F rt: THE SCOPE — the bound tenant and domain only (another domain's terms are never read here)
  IF public.eye_scope() IS DISTINCT FROM 'DOMAIN' OR p_tenant IS NULL OR p_domain IS NULL
     OR p_tenant IS DISTINCT FROM public.eye_tenant() OR p_domain IS DISTINCT FROM public.eye_domain() THEN
    RAISE EXCEPTION 'rights terms rejected (access): the rights terms are read only within the caller''s bound domain (bound: %/%/%; asked: %/%)',
      coalesce(public.eye_scope(), 'NONE'), coalesce(public.eye_tenant()::text, '-'), coalesce(public.eye_domain()::text, '-'),
      coalesce(p_tenant::text, '-'), coalesce(p_domain::text, '-') USING ERRCODE = '42501';
  END IF;
  -- B82-F rt: THE ACTING PRINCIPAL — exactly the declare rule's roles, bound at DOMAIN in this domain, active and unrevoked
  IF v_actor IS NULL OR NOT EXISTS (
       SELECT 1 FROM identity.role_bindings b JOIN identity.principals p ON p.id = b.principal_id
        WHERE b.principal_id = v_actor AND p.status = 'active' AND b.revoked_at IS NULL AND b.role_code IN ('data_steward', 'collection_manager')
          AND b.scope = 'DOMAIN' AND b.tenant_id = p_tenant AND b.domain_id = p_domain) THEN
    RAISE EXCEPTION 'rights terms rejected (authority): reading the rights terms of this domain''s sources is the act of a data_steward or collection_manager here'
      USING ERRCODE = '42501';
  END IF;
  -- THE REGISTER: per source contract version (at most 200 series, the rest said truncated) — rights metadata only
  FOR s IN SELECT x.source_id, x.contract_version, x.rights_state, x.lifecycle_state, x.name, x.contract -> 'authority_and_rights' AS ar
             FROM observation.source_contracts_current x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain
            ORDER BY x.name, x.source_id, x.contract_version DESC LIMIT 201 LOOP
    v_n := v_n + 1;
    IF v_n > 200 THEN v_truncated := true; EXIT; END IF;
    cur := observation.rt_current(p_tenant, p_domain, s.source_id, s.contract_version);
    v_series := v_series || jsonb_build_array(jsonb_build_object(
      'source_id', s.source_id, 'source_name', s.name, 'contract_version', s.contract_version, 'contract_state', s.lifecycle_state,
      'contract_rights', jsonb_build_object('rights_state', s.rights_state, 'licence', s.ar ->> 'licence', 'permitted_use', coalesce(s.ar -> 'permitted_use', '[]'::jsonb),
                                            'purposes', coalesce(s.ar -> 'purposes', '[]'::jsonb), 'attribution', s.ar ->> 'attribution', 'retention', s.ar ->> 'retention',
                                            'legal_basis', s.ar ->> 'legal_basis'),
      'current', observation.rt_json(cur, v_at),
      'statement', CASE WHEN cur.terms_id IS NULL THEN 'no rights terms declared for this contract version — no expiry declared'
                        ELSE coalesce(observation.rt_state(cur, v_at), '') || ' · ' || (observation.rt_json(cur, v_at) ->> 'expiry_statement') END,
      'history', (SELECT coalesce(jsonb_agg(observation.rt_json(t, v_at) ORDER BY t.version), '[]'::jsonb) FROM observation.rights_terms t
                   WHERE t.tenant_id = p_tenant AND t.domain_id = p_domain AND t.source_id = s.source_id AND t.contract_version = s.contract_version),
      'events', (SELECT coalesce(jsonb_agg(jsonb_build_object('event', e.event, 'terms_version', e.terms_version, 'actor', e.actor, 'at', graph.pv_iso(e.occurred_at), 'details', e.details)
                   ORDER BY e.occurred_at, e.event_id), '[]'::jsonb) FROM observation.rights_terms_events e
                   WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain AND e.source_id = s.source_id AND e.contract_version = s.contract_version)));
  END LOOP;
  RETURN jsonb_build_object('series', v_series, 'truncated', v_truncated, 'as_of', graph.pv_iso(v_at));
END $$;
COMMENT ON FUNCTION observation.rights_terms_register(uuid, uuid) IS 'B82-F rt (0122): the bound domain''s sources with their rights METADATA only (source name, contract version and state, the contract''s own rights statement, the current terms, history and ledger) for the declarers — observation.rights.terms.read (data_steward | collection_manager at DOMAIN); the bound action, the scope and the acting principal re-checked here. Never evidence content, bytes, segments or observation payloads.';
REVOKE ALL ON FUNCTION observation.rights_terms_register(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.rights_terms_register(uuid, uuid) TO eye_commit;


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
--     escalations (state, due, count), the allowed acts with their constraints and the state digest the page's Command Review binds.
--     NEVER the walk's path, the notice, the other consumers, the freezes ledger, the events or any evidence content; it grants no
--     graph.read, observation.read or evidence action. The acts stay the EXISTING ports' (graph.acknowledge_consumer /
--     graph.except_consumer — unchanged), which re-check everything.
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
        -- the state the page's Command Review binds (a changed state, freeze, act or contract is a new state: the review is void, never updated)
        'state_digest', encode(sha256(convert_to(jsonb_build_object('case_id', cl.case_id, 'closure', cl.closure_state, 'ref', x.consumer_ref, 'state', x.state, 'ack_id', x.ack_id,
                          'frozen', EXISTS (SELECT 1 FROM graph.publication_freezes f WHERE f.case_id = cl.case_id AND f.lifted_at IS NULL AND f.object_id = x.product_id),
                          'contract', k.version)::text, 'UTF8')), 'hex'),
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
