-- 0107 — B91-F (2026-10-06): commercial.usage notices are ROUTED UNDER THE DOMAIN'S PUBLISHED ATTENTION POLICY.
--
-- 0105 raised the meters' cap notices (commercial.cme_notify, §ME) and the ledger's budget notices (commercial.cle_notify, §LE) in the
-- 0099 §O sio_notify idiom: outcome `material`, policy_version NULL, open to a named owner or to tenant_admin WHATEVER THE POLICY SAID —
-- while §GR's commercial.entitlement notices were evaluated against the published policy. The governing contract routes a change to
-- accountable roles "based on consequence, confidence, urgency, and attention policy" (L10-I02), surfaces it "respecting relevance,
-- authority, attention, and notification policy" (C-032), and enforces "materiality and notification policy" (V04-T-037). No requirement
-- makes a budget, cap or usage notice a mandatory bypass (ADR-022's mandatory controls are the warnings and their acknowledgement, not
-- commercial notices), so the bypass is CORRECTED here rather than recorded:
--   · the item is evaluated by executive.evaluate_attention against the domain's ACTIVE policy (consequence C2, confidence 1, the 24-hour
--     window the notices always declared) and routed by executive.attention_route — the B22 contract (0083) every routed class uses;
--   · the owner stays the named person (the cap's setter, the budget's owner) when an active human of the tenant; the route roles are
--     the POLICY'S, not a hard-coded tenant_admin;
--   · a class the policy does not name ABSTAINS and the item is DEPRIORITIZED (listed, never hidden); a material item with no owner and no
--     role holder is UNROUTED (or ESCALATED where the policy escalates) — ES-47's failure semantics, unchanged;
--   · the evaluation, the policy id and version, and the raising part's own reasons are recorded on the item and its routing event.
-- Re-declared, each copied from its live definition (0105) with the routing lines replaced and marked `-- 0107`: commercial.cme_notify,
-- commercial.cle_notify. Signatures, owners, subjects, causes and details are unchanged. 0105 is applied and frozen and is not edited.
-- Items raised before 0107 keep their recorded routing (history is never rewritten).

CREATE OR REPLACE FUNCTION commercial.cme_notify(c commercial.caps, p_domain uuid, p_breach uuid, p_cause_type text, p_title text, p_reasons jsonb, p_details jsonb, p_actor uuid, p_correlation uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = executive, identity, decision, pg_catalog, pg_temp AS $$
DECLARE v_item uuid := gen_random_uuid(); v_state text; v_corr uuid := coalesce(p_correlation, gen_random_uuid());
        pol executive.attention_policies%ROWTYPE; v_eval jsonb; v_route jsonb; v_owner uuid;   -- 0107
BEGIN
  v_owner := CASE WHEN decision.is_active_human(c.set_by, c.tenant_id) THEN c.set_by END;   -- 0107: the named owner (unchanged rule)
  SELECT * INTO pol FROM executive.attention_policies a WHERE a.tenant_id = c.tenant_id AND a.domain_id = p_domain AND a.state = 'active';   -- 0107
  v_eval := executive.evaluate_attention(CASE WHEN pol.policy_id IS NULL THEN NULL ELSE pol.rules END, 'commercial.usage',   -- 0107
                                         jsonb_build_object('consequence', 'C2', 'confidence', 1, 'hours_to_window', 24))
            || jsonb_build_object('policy_version', pol.version, 'raised_reasons', p_reasons);   -- 0107
  v_route := executive.attention_route(pol.rules, 'commercial.usage', v_eval ->> 'outcome', v_owner, c.tenant_id, p_domain);   -- 0107
  v_state := v_route ->> 'state';   -- 0107
  INSERT INTO executive.attention_items (item_id, scope, tenant_id, domain_id, signal_class, subject_kind, subject_id, cause_event_id, cause_event_type, title, outcome, state, owner_principal_id, route_roles,
                                         policy_id, policy_version, evaluation, details, due_at, escalations, correlation_id)
  VALUES (v_item, 'DOMAIN', c.tenant_id, p_domain, 'commercial.usage', 'meter', c.cap_id, p_breach, p_cause_type, left(p_title, 512), v_eval ->> 'outcome', v_state,   -- 0107
          v_owner, ARRAY(SELECT jsonb_array_elements_text(v_route -> 'route_roles')), pol.policy_id, pol.version, v_eval,   -- 0107
          jsonb_build_object('cap_id', c.cap_id, 'cap_version', c.version, 'dimension', c.dimension, 'unit', c.unit, 'period', c.period, 'limit', c.cap_limit, 'action', c.action, 'breach_id', p_breach) || coalesce(p_details, '{}'::jsonb),
          (v_route ->> 'due_at')::timestamptz, coalesce((v_route ->> 'escalations')::int, 0), v_corr);   -- 0107
  PERFORM executive.attention_event(v_item, c.tenant_id, p_domain,
            CASE v_state WHEN 'open' THEN 'item.routed' WHEN 'escalated' THEN 'item.escalated' WHEN 'unrouted' THEN 'item.unrouted' ELSE 'item.deprioritized' END, p_actor,   -- 0107
            jsonb_build_object('outcome', v_eval ->> 'outcome', 'reasons', v_eval -> 'reasons', 'raised_reasons', p_reasons, 'policy_version', pol.version, 'owner', v_owner,   -- 0107
                               'route_roles', v_route -> 'route_roles', 'due_at', v_route -> 'due_at', 'cause_event_id', p_breach, 'cause_event_type', p_cause_type,
                               'unrouted', coalesce((v_route ->> 'unrouted')::boolean, v_state = 'unrouted'), 'cap_id', c.cap_id), v_corr);
  RETURN v_item;
END $$;
REVOKE ALL ON FUNCTION commercial.cme_notify(commercial.caps, uuid, uuid, text, text, jsonb, jsonb, uuid, uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION commercial.cle_notify(p_item uuid, b commercial.budgets, p_domain uuid, p_title text, p_reasons jsonb, p_cause_event uuid, p_cause_type text,
                                                 p_details jsonb, p_actor uuid, p_correlation uuid) RETURNS void
SECURITY DEFINER SET search_path = executive, identity, decision, pg_catalog, pg_temp AS $$
DECLARE v_state text; pol executive.attention_policies%ROWTYPE; v_eval jsonb; v_route jsonb; v_owner uuid;   -- 0107
BEGIN
  v_owner := CASE WHEN decision.is_active_human(b.owner_principal_id, b.tenant_id) THEN b.owner_principal_id END;   -- 0107: the named owner (unchanged rule)
  SELECT * INTO pol FROM executive.attention_policies a WHERE a.tenant_id = b.tenant_id AND a.domain_id = p_domain AND a.state = 'active';   -- 0107
  v_eval := executive.evaluate_attention(CASE WHEN pol.policy_id IS NULL THEN NULL ELSE pol.rules END, 'commercial.usage',   -- 0107
                                         jsonb_build_object('consequence', 'C2', 'confidence', 1, 'hours_to_window', 24))
            || jsonb_build_object('policy_version', pol.version, 'raised_reasons', p_reasons);   -- 0107
  v_route := executive.attention_route(pol.rules, 'commercial.usage', v_eval ->> 'outcome', v_owner, b.tenant_id, p_domain);   -- 0107
  v_state := v_route ->> 'state';   -- 0107
  INSERT INTO executive.attention_items (item_id, scope, tenant_id, domain_id, signal_class, subject_kind, subject_id, cause_event_id, cause_event_type, title, outcome, state, owner_principal_id, route_roles,
                                         policy_id, policy_version, evaluation, details, due_at, escalations, correlation_id)
  VALUES (p_item, 'DOMAIN', b.tenant_id, p_domain, 'commercial.usage', 'budget', b.budget_id, p_cause_event, p_cause_type, left(p_title, 512), v_eval ->> 'outcome', v_state,   -- 0107
          v_owner, ARRAY(SELECT jsonb_array_elements_text(v_route -> 'route_roles')), pol.policy_id, pol.version, v_eval,   -- 0107
          jsonb_build_object('budget_id', b.budget_id, 'budget_version', b.version, 'label', b.label, 'synthetic_figures_possible', true) || coalesce(p_details, '{}'::jsonb),
          (v_route ->> 'due_at')::timestamptz, coalesce((v_route ->> 'escalations')::int, 0), p_correlation);   -- 0107
  PERFORM executive.attention_event(p_item, b.tenant_id, p_domain,
            CASE v_state WHEN 'open' THEN 'item.routed' WHEN 'escalated' THEN 'item.escalated' WHEN 'unrouted' THEN 'item.unrouted' ELSE 'item.deprioritized' END, p_actor,   -- 0107
            jsonb_build_object('outcome', v_eval ->> 'outcome', 'reasons', v_eval -> 'reasons', 'raised_reasons', p_reasons, 'policy_version', pol.version, 'owner', v_owner,   -- 0107
                               'route_roles', v_route -> 'route_roles', 'due_at', v_route -> 'due_at', 'cause_event_id', p_cause_event, 'cause_event_type', p_cause_type,
                               'unrouted', coalesce((v_route ->> 'unrouted')::boolean, v_state = 'unrouted'), 'budget_id', b.budget_id), p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION commercial.cle_notify(uuid, commercial.budgets, uuid, text, jsonb, uuid, text, jsonb, uuid, uuid) FROM PUBLIC;
