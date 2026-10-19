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
