-- 0067 — CP-6 B9, the corrections of the adversarial review before the candidate's independent review (2026-09-13).
-- Every function here re-declares its 0066 body with the one correction named; nothing else moves.
--
--   §1 retention: an execution whose scope changed since approval (a hold placed) ROLLS BACK whole and the action is
--      PAUSED for re-resolution (retention.pause_action) — no bytes leave under an action that cannot be verified; the
--      executor records a bytes residual when the vault refused the removal after the commit (retention.record_bytes_residual)
--      and may retry it; verification closes the residual when the bytes are observed gone; the log floor is re-checked
--      against every subscription's served point AT THE MOVE; the verification of a moved floor admits a later, further move;
--      only deletion, log_floor and review actions execute (an archive or customer export is refused at execution, never run
--      as a deletion); the executor is the acting principal.
--   §2 executive: a delegation stands only while its lender still owns or is a member of the room; a request is fulfilled
--      only by an act of its kind in this domain (an agent run that names it, a scenario, a simulation run, a package);
--      executive.refuse_request records a request whose routed act was refused (state refused, the reason kept).
--   §3 ontology: the decision is recorded by the acting principal.
--   §4 scenario review: the retirement's loop no longer overwrites the branch the review named.
--   §5 relationships: graph.open_edge_reassessment is idempotent per cause (a re-drive appends no duplicate cause or event).

-- ============================================================
-- §1 retention
-- ============================================================
CREATE OR REPLACE FUNCTION retention.begin_execution(p_action_id uuid, p_tenant uuid, p_domain uuid, p_actor uuid, p_correlation uuid)
RETURNS jsonb
SECURITY DEFINER SET search_path = retention, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE a retention.actions_current%ROWTYPE; v_live int;
BEGIN
  PERFORM observation.assert_authority(ARRAY['retention.action.execute']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT * INTO a FROM retention.actions_current x WHERE x.action_id = p_action_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'retention execution rejected: % is not an action of this domain', p_action_id USING ERRCODE = '23503'; END IF;
  IF a.state <> 'approved' THEN RAISE EXCEPTION 'retention execution rejected: % is % — only an approved action executes', p_action_id, a.state USING ERRCODE = '22023'; END IF;
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'retention execution rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  -- The kinds that EXECUTE in this release: a deletion (the tombstone port), the log floor (the outbox port), a review (the record of
  -- the review, nothing removed). An archive or a customer export has no executor yet and is refused here, never executed as a deletion (B9 review).
  IF a.kind NOT IN ('deletion', 'log_floor', 'review') THEN RAISE EXCEPTION 'retention execution rejected: a % action has no executor in this release (deletion, log_floor and review execute)', a.kind USING ERRCODE = '22023'; END IF;
  SELECT count(*) INTO v_live FROM retention.approvals ap WHERE ap.action_id = p_action_id AND ap.scope_digest = a.scope_digest AND ap.revoked_at IS NULL AND ap.expires_at > clock_timestamp();
  IF v_live < 1 THEN RAISE EXCEPTION 'retention execution rejected: no live approval on the resolved scope' USING ERRCODE = '42501'; END IF;
  IF EXISTS (SELECT 1 FROM retention.approvals ap WHERE ap.action_id = p_action_id AND ap.approver_principal_id = p_actor AND ap.revoked_at IS NULL) THEN
    RAISE EXCEPTION 'retention execution rejected: an approver of the action does not execute it' USING ERRCODE = '42501';
  END IF;
  UPDATE retention.actions_current SET state = 'executing' WHERE action_id = p_action_id;
  PERFORM retention.event(p_action_id, p_tenant, p_domain, 'execution.started', p_actor, jsonb_build_object('scope_digest', a.scope_digest), p_correlation);
  RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('item_id', i.item_id, 'item_kind', i.item_kind, 'ref', i.ref, 'disposition', i.disposition, 'hold_id', i.hold_id, 'details', i.details) ORDER BY i.dependency_order), '[]'::jsonb)
            FROM retention.scope_items i WHERE i.action_id = p_action_id);
END $$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION objects.outbox_declare_floor(p_partition_key text, p_to_seq bigint, p_action_id uuid)
RETURNS jsonb
SECURITY DEFINER SET search_path = objects, retention, graph, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_floor bigint; v_next bigint;
BEGIN
  PERFORM observation.assert_authority(ARRAY['retention.action.execute']);
  IF p_partition_key IS NULL OR p_to_seq IS NULL OR p_action_id IS NULL THEN RAISE EXCEPTION 'floor declaration rejected: partition, sequence and action are named' USING ERRCODE = '22023'; END IF;
  IF p_partition_key IS DISTINCT FROM ('tenant:' || public.eye_tenant()::text) THEN RAISE EXCEPTION 'floor declaration rejected: % is not this tenant''s partition', p_partition_key USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM retention.actions_current a WHERE a.action_id = p_action_id AND a.tenant_id = public.eye_tenant() AND a.state = 'executing' AND a.kind = 'log_floor'
                    AND a.selector ->> 'partition_key' = p_partition_key AND (a.selector ->> 'to_seq')::bigint = p_to_seq) THEN
    RAISE EXCEPTION 'floor declaration rejected: no executing log_floor action names this move' USING ERRCODE = '42501';
  END IF;
  SELECT p.retained_from_seq, p.next_seq INTO v_floor, v_next FROM objects.outbox_partitions p WHERE p.partition_key = p_partition_key FOR UPDATE;
  IF v_floor IS NULL THEN RAISE EXCEPTION 'floor declaration rejected: partition % has no row', p_partition_key USING ERRCODE = '23503'; END IF;
  -- The served points are re-checked HERE, at the move (the scope resolution checked them earlier; a subscription may have been registered or replayed since — B9 review).
  IF EXISTS (SELECT 1 FROM graph.subscriptions s WHERE s.tenant_id = public.eye_tenant() AND s.status = 'active'
                AND (coalesce(s.served_from_seq, 0) < p_to_seq OR coalesce(s.checkpoint_seq, 0) < p_to_seq)) THEN
    RAISE EXCEPTION 'floor declaration rejected: a subscription''s served point lies below % (the scope must be resolved again)', p_to_seq USING ERRCODE = '22023';
  END IF;
  IF p_to_seq <= v_floor OR p_to_seq > v_next THEN RAISE EXCEPTION 'floor declaration rejected: % must lie above the floor % and at most the next sequence %', p_to_seq, v_floor, v_next USING ERRCODE = '22023'; END IF;
  UPDATE objects.outbox_partitions SET retained_from_seq = p_to_seq, retention_policy = 'declared', retention_note = 'retention action ' || p_action_id::text || ' moved the floor from ' || v_floor || ' to ' || p_to_seq || ' at ' || clock_timestamp()::text
   WHERE partition_key = p_partition_key;
  RETURN jsonb_build_object('partition_key', p_partition_key, 'floor_before', v_floor, 'floor_after', p_to_seq, 'next_seq', v_next);
END $$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION retention.verify_action(p_action_id uuid, p_tenant uuid, p_domain uuid, p_observed jsonb, p_actor uuid, p_correlation uuid)
RETURNS jsonb
SECURITY DEFINER SET search_path = retention, observation, objects, ctx, public, pg_catalog, pg_temp AS $$
DECLARE a retention.actions_current%ROWTYPE; i RECORD; v_pass boolean; v_all boolean := true; v_checks jsonb := '[]'::jsonb; v_floor bigint; v_pending int; v_state text; ob jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['retention.action.verify']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT * INTO a FROM retention.actions_current x WHERE x.action_id = p_action_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'retention verification rejected: % is not an action of this domain', p_action_id USING ERRCODE = '23503'; END IF;
  IF a.state <> 'executed' THEN RAISE EXCEPTION 'retention verification rejected: % is % — only an executed action is verified', p_action_id, a.state USING ERRCODE = '22023'; END IF;
  FOR i IN SELECT * FROM retention.scope_items x WHERE x.action_id = p_action_id ORDER BY x.dependency_order LOOP
    IF i.item_kind = 'manifest' AND i.disposition = 'execute' THEN
      ob := coalesce(p_observed -> i.ref, '{}'::jsonb);
      v_pass := EXISTS (SELECT 1 FROM observation.blob_tombstones t WHERE t.manifest_id = i.ref::uuid) AND coalesce((ob ->> 'bytes_present')::boolean, true) = false;
      INSERT INTO retention.verifications (verification_id, scope, tenant_id, domain_id, action_id, check_name, expected, observed, passed, verified_by)
      VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_action_id, 'manifest ' || i.ref || ': tombstoned and its bytes gone', jsonb_build_object('tombstone', true, 'bytes_present', false),
              jsonb_build_object('tombstone', EXISTS (SELECT 1 FROM observation.blob_tombstones t WHERE t.manifest_id = i.ref::uuid), 'bytes_present', ob -> 'bytes_present'), v_pass, p_actor);
    ELSIF i.item_kind = 'manifest' AND i.disposition = 'held' THEN
      ob := coalesce(p_observed -> i.ref, '{}'::jsonb);
      v_pass := NOT EXISTS (SELECT 1 FROM observation.blob_tombstones t WHERE t.manifest_id = i.ref::uuid) AND coalesce((ob ->> 'bytes_present')::boolean, false) = true;
      INSERT INTO retention.verifications (verification_id, scope, tenant_id, domain_id, action_id, check_name, expected, observed, passed, verified_by)
      VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_action_id, 'manifest ' || i.ref || ': held — untouched, its bytes present', jsonb_build_object('tombstone', false, 'bytes_present', true),
              jsonb_build_object('tombstone', EXISTS (SELECT 1 FROM observation.blob_tombstones t WHERE t.manifest_id = i.ref::uuid), 'bytes_present', ob -> 'bytes_present', 'hold_id', i.hold_id), v_pass, p_actor);
    ELSIF i.item_kind = 'outbox_range' THEN
      SELECT p.retained_from_seq INTO v_floor FROM objects.outbox_partitions p WHERE p.partition_key = a.selector ->> 'partition_key';
      v_pass := v_floor >= (a.selector ->> 'to_seq')::bigint; -- a later action may have moved the floor further (B9 review)
      INSERT INTO retention.verifications (verification_id, scope, tenant_id, domain_id, action_id, check_name, expected, observed, passed, verified_by)
      VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_action_id, 'the retained floor of ' || (a.selector ->> 'partition_key') || ' stands at to_seq or beyond', jsonb_build_object('retained_from_seq', (a.selector ->> 'to_seq')::bigint), jsonb_build_object('retained_from_seq', v_floor), v_pass, p_actor);
    ELSE
      CONTINUE;
    END IF;
    v_all := v_all AND v_pass;
    v_checks := v_checks || jsonb_build_object('item', i.ref, 'kind', i.item_kind, 'disposition', i.disposition, 'passed', v_pass);
  END LOOP;
  IF NOT v_all THEN
    UPDATE retention.actions_current SET failure_class = 'infrastructure', disposition = 'retry', failure_reason = 'a verification check failed; the action stays executed until it passes' WHERE action_id = p_action_id;
    PERFORM retention.event(p_action_id, p_tenant, p_domain, 'action.failed', p_actor, jsonb_build_object('checks', v_checks, 'verification', 'failed'), p_correlation);
    RETURN jsonb_build_object('state', 'executed', 'verified', false, 'checks', v_checks);
  END IF;
  -- A bytes residual the executor recorded (the vault refused the removal after the record committed) closes when the bytes are observed gone (B9 review).
  UPDATE retention.residual_inventory ri SET status = 'retained_by_policy', note = coalesce(ri.note, '') || '; bytes observed gone at verification ' || clock_timestamp()::text
   WHERE ri.action_id = p_action_id AND ri.kind = 'bytes_present' AND ri.status = 'pending'
     AND coalesce(((p_observed -> ri.ref) ->> 'bytes_present')::boolean, true) = false;
  SELECT count(*) INTO v_pending FROM retention.residual_inventory ri WHERE ri.action_id = p_action_id AND ri.status = 'pending';
  v_state := CASE WHEN v_pending > 0 THEN 'verified_with_residuals' ELSE 'verified' END;
  UPDATE retention.actions_current
     SET state = v_state, verified_at = clock_timestamp(), closed_at = clock_timestamp(), failure_class = NULL, disposition = NULL, failure_reason = NULL,
         residual_summary = (SELECT coalesce(jsonb_agg(jsonb_build_object('kind', ri.kind, 'ref', ri.ref, 'count', ri.count, 'status', ri.status, 'note', ri.note)), '[]'::jsonb) FROM retention.residual_inventory ri WHERE ri.action_id = p_action_id)
   WHERE action_id = p_action_id;
  PERFORM retention.event(p_action_id, p_tenant, p_domain, CASE WHEN v_pending > 0 THEN 'verification.residuals' ELSE 'verification.passed' END, p_actor, jsonb_build_object('checks', v_checks, 'residuals_pending', v_pending), p_correlation);
  RETURN jsonb_build_object('state', v_state, 'verified', true, 'checks', v_checks,
    'scope_digest', a.scope_digest, 'kind', a.kind, 'target_kind', a.target_kind, 'selector', a.selector,
    'authorized_by', (SELECT coalesce(jsonb_agg(ap.approval_id), '[]'::jsonb) FROM retention.approvals ap WHERE ap.action_id = p_action_id AND ap.revoked_at IS NULL),
    'executed', (SELECT count(*) FROM retention.executions e WHERE e.action_id = p_action_id AND e.outcome = 'done'),
    'held', (SELECT count(*) FROM retention.scope_items si WHERE si.action_id = p_action_id AND si.disposition = 'held'),
    'excluded', (SELECT count(*) FROM retention.scope_items si WHERE si.action_id = p_action_id AND si.disposition = 'excluded'),
    'residual', (SELECT coalesce(jsonb_agg(jsonb_build_object('kind', ri.kind, 'count', ri.count, 'status', ri.status)), '[]'::jsonb) FROM retention.residual_inventory ri WHERE ri.action_id = p_action_id));
END $$ LANGUAGE plpgsql;

-- An execution whose scope changed (a hold placed since the approval) is rolled back whole by the executor; this records the pause.
CREATE OR REPLACE FUNCTION retention.pause_action(p_action_id uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_correlation uuid)
RETURNS void
SECURITY DEFINER SET search_path = retention, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE a retention.actions_current%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['retention.action.execute']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'retention execution rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO a FROM retention.actions_current x WHERE x.action_id = p_action_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'retention execution rejected: % is not an action of this domain', p_action_id USING ERRCODE = '23503'; END IF;
  IF a.state <> 'approved' THEN RAISE EXCEPTION 'retention execution rejected: % is % — only an approved action pauses at execution', p_action_id, a.state USING ERRCODE = '22023'; END IF;
  UPDATE retention.actions_current SET state = 'paused', failure_class = 'legal_hold', disposition = 'human_review', failure_reason = p_reason WHERE action_id = p_action_id;
  UPDATE retention.approvals SET revoked_at = clock_timestamp() WHERE action_id = p_action_id AND revoked_at IS NULL;
  PERFORM retention.event(p_action_id, p_tenant, p_domain, 'action.paused', p_actor, jsonb_build_object('reason', p_reason, 'approvals_revoked', true), p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION retention.pause_action(uuid,uuid,uuid,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION retention.pause_action(uuid,uuid,uuid,text,uuid,uuid) TO eye_commit;

-- The vault refused to remove the bytes after the record committed: a PENDING residual on the action, retried by the executor, closed by verification.
CREATE OR REPLACE FUNCTION retention.record_bytes_residual(p_action_id uuid, p_tenant uuid, p_domain uuid, p_manifest_ref text, p_locator text, p_error text, p_actor uuid, p_correlation uuid)
RETURNS void
SECURITY DEFINER SET search_path = retention, observation, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_authority(ARRAY['retention.action.execute']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF NOT EXISTS (SELECT 1 FROM retention.actions_current x WHERE x.action_id = p_action_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.state = 'executed') THEN
    RAISE EXCEPTION 'retention execution rejected: % is not an executed action of this domain', p_action_id USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM retention.residual_inventory ri WHERE ri.action_id = p_action_id AND ri.kind = 'bytes_present' AND ri.ref = p_manifest_ref) THEN
    INSERT INTO retention.residual_inventory (residual_id, scope, tenant_id, domain_id, action_id, kind, ref, count, status, note)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_action_id, 'bytes_present', p_manifest_ref, 1, 'pending', 'the vault refused the removal after the record committed: ' || left(coalesce(p_error, ''), 200) || '; locator ' || coalesce(p_locator, ''));
  ELSE
    UPDATE retention.residual_inventory SET status = 'pending', note = 'the vault refused the removal again: ' || left(coalesce(p_error, ''), 200) WHERE action_id = p_action_id AND kind = 'bytes_present' AND ref = p_manifest_ref;
  END IF;
  PERFORM retention.event(p_action_id, p_tenant, p_domain, 'execution.item', p_actor, jsonb_build_object('item', p_manifest_ref, 'port', 'vault.remove', 'outcome', 'pending', 'error', left(coalesce(p_error, ''), 200)), p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION retention.record_bytes_residual(uuid,uuid,uuid,text,text,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION retention.record_bytes_residual(uuid,uuid,uuid,text,text,text,uuid,uuid) TO eye_commit;

-- ============================================================
-- §2 executive
-- ============================================================
CREATE OR REPLACE FUNCTION executive.is_member(p_room uuid, p_principal uuid) RETURNS boolean
STABLE SECURITY DEFINER SET search_path = executive, pg_catalog, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM executive.rooms_current r WHERE r.room_id = p_room AND r.owner_principal_id = p_principal)
      OR EXISTS (SELECT 1 FROM executive.room_members m WHERE m.room_id = p_room AND m.principal_id = p_principal AND m.removed_at IS NULL)
      OR EXISTS (SELECT 1 FROM executive.delegations d WHERE d.room_id = p_room AND d.to_principal_id = p_principal AND d.state = 'active' AND d.from_at <= now() AND d.until_at > now()
                    -- the standing lent is the lender's: it holds only while the lender still owns or is a member of the room (B9 review)
                    AND (EXISTS (SELECT 1 FROM executive.rooms_current r WHERE r.room_id = p_room AND r.owner_principal_id = d.from_principal_id)
                         OR EXISTS (SELECT 1 FROM executive.room_members m WHERE m.room_id = p_room AND m.principal_id = d.from_principal_id AND m.removed_at IS NULL)));
$$ LANGUAGE sql;
CREATE OR REPLACE FUNCTION executive.fulfil_request(p_request_id uuid, p_tenant uuid, p_domain uuid, p_routed_ref uuid, p_note text, p_actor uuid, p_correlation uuid)
RETURNS jsonb
SECURITY DEFINER SET search_path = executive, prediction, simulation, decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r executive.requests%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.request.fulfil', 'executive.request', 'prediction.scenario.declare', 'simulation.run', 'decision.package.declare', 'decision.package.review']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'fulfilment rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO r FROM executive.requests x WHERE x.request_id = p_request_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'fulfilment rejected: no request % in this domain', p_request_id USING ERRCODE = '23503'; END IF;
  IF r.state <> 'routed' THEN RAISE EXCEPTION 'fulfilment rejected: request % is %, not routed', p_request_id, r.state USING ERRCODE = '22023'; END IF;
  IF p_routed_ref IS NULL THEN RAISE EXCEPTION 'fulfilment rejected: the act that answered the request is named' USING ERRCODE = '22023'; END IF;
  -- The answering act is of the request's kind and of this domain (B9 review): an agent run that names the request, a scenario, a simulation run, a package.
  IF r.kind = 'analysis' AND NOT EXISTS (SELECT 1 FROM executive.agent_runs x WHERE x.run_id = p_routed_ref AND x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.trigger_kind = 'request' AND x.trigger_ref = p_request_id::text) THEN
    RAISE EXCEPTION 'fulfilment rejected: % is not an agent run of this domain triggered by request %', p_routed_ref, p_request_id USING ERRCODE = '22023';
  ELSIF r.kind = 'scenario' AND NOT EXISTS (SELECT 1 FROM prediction.scenarios_current x WHERE x.scenario_id = p_routed_ref AND x.tenant_id = p_tenant AND x.domain_id = p_domain) THEN
    RAISE EXCEPTION 'fulfilment rejected: % is not a scenario of this domain', p_routed_ref USING ERRCODE = '22023';
  ELSIF r.kind = 'simulation' AND NOT EXISTS (SELECT 1 FROM simulation.runs_current x WHERE x.run_id = p_routed_ref AND x.tenant_id = p_tenant AND x.domain_id = p_domain) THEN
    RAISE EXCEPTION 'fulfilment rejected: % is not a simulation run of this domain', p_routed_ref USING ERRCODE = '22023';
  ELSIF r.kind = 'decision' AND NOT EXISTS (SELECT 1 FROM decision.packages_current x WHERE x.package_id = p_routed_ref AND x.tenant_id = p_tenant AND x.domain_id = p_domain) THEN
    RAISE EXCEPTION 'fulfilment rejected: % is not a decision package of this domain', p_routed_ref USING ERRCODE = '22023';
  ELSIF r.kind NOT IN ('analysis', 'scenario', 'simulation', 'decision') THEN
    RAISE EXCEPTION 'fulfilment rejected: a % request takes its effect in its own write', r.kind USING ERRCODE = '22023';
  END IF;
  UPDATE executive.requests SET state = 'fulfilled', routed_ref = p_routed_ref, fulfilled_at = clock_timestamp(), fulfilled_by = p_actor WHERE request_id = p_request_id;
  PERFORM executive.request_event(p_request_id, p_tenant, p_domain, 'request.fulfilled', p_actor, jsonb_build_object('routed_ref', p_routed_ref, 'note', p_note), p_correlation);
  RETURN jsonb_build_object('request_id', p_request_id, 'kind', r.kind, 'state', 'fulfilled', 'routed_to', r.routed_to, 'routed_ref', p_routed_ref);
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION executive.refuse_request(p_request_id uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_correlation uuid)
RETURNS jsonb
SECURITY DEFINER SET search_path = executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r executive.requests%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.request', 'executive.request.fulfil']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'request rejected: recorded by the requesting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO r FROM executive.requests x WHERE x.request_id = p_request_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'fulfilment rejected: no request % in this domain', p_request_id USING ERRCODE = '23503'; END IF;
  IF r.state <> 'routed' THEN RAISE EXCEPTION 'fulfilment rejected: request % is %, not routed', p_request_id, r.state USING ERRCODE = '22023'; END IF;
  UPDATE executive.requests SET state = 'refused', refusal = left(coalesce(p_reason, ''), 1000) WHERE request_id = p_request_id;
  PERFORM executive.request_event(p_request_id, p_tenant, p_domain, 'request.refused', p_actor, jsonb_build_object('reason', left(coalesce(p_reason, ''), 1000)), p_correlation);
  RETURN jsonb_build_object('request_id', p_request_id, 'kind', r.kind, 'state', 'refused', 'routed_to', r.routed_to, 'refusal', left(coalesce(p_reason, ''), 1000));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.refuse_request(uuid,uuid,uuid,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.refuse_request(uuid,uuid,uuid,text,uuid,uuid) TO eye_commit;

-- ============================================================
-- §3 ontology
-- ============================================================
CREATE OR REPLACE FUNCTION graph.decide_ontology_proposal(p_version_id uuid, p_tenant uuid, p_domain uuid, p_decision text, p_reason text, p_reviews jsonb, p_actor uuid, p_correlation uuid)
RETURNS jsonb
SECURITY DEFINER SET search_path = graph, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v graph.ontology_versions%ROWTYPE; v_prior uuid; v_impacted int; v_reviews jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.ontology.decide']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'the decision is recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF p_decision NOT IN ('approve', 'reject') THEN RAISE EXCEPTION 'a decision is approve or reject' USING ERRCODE = '22023'; END IF;
  IF coalesce(length(btrim(p_reason)), 0) < 8 THEN RAISE EXCEPTION 'a decision states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  SELECT * INTO v FROM graph.ontology_versions x WHERE x.version_id = p_version_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'no ontology proposal % in this domain', p_version_id USING ERRCODE = '23503'; END IF;
  IF v.state <> 'proposed' THEN RAISE EXCEPTION 'proposal % is %, not open', p_version_id, v.state USING ERRCODE = '22023'; END IF;
  IF v.proposed_by = p_actor THEN RAISE EXCEPTION 'the proposer of an ontology change does not decide it' USING ERRCODE = '42501'; END IF;
  v_reviews := v.reviews || coalesce(p_reviews, '{}'::jsonb);
  IF p_decision = 'reject' THEN
    UPDATE graph.ontology_versions SET state = 'rejected', decided_by = p_actor, decided_at = clock_timestamp(), decision_reason = p_reason, reviews = v_reviews WHERE version_id = p_version_id;
    INSERT INTO graph.ontology_events (event_id, scope, tenant_id, domain_id, version_id, event, actor_principal_id, details, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_version_id, 'ontology.rejected', p_actor, jsonb_build_object('reason', p_reason, 'reviews', v_reviews), p_correlation);
    RETURN jsonb_build_object('version_id', p_version_id, 'state', 'rejected');
  END IF;
  -- A breaking change is not approved while what it would strand is still asserted (the migration comes first).
  IF v.compatibility = 'breaking' THEN
    SELECT count(*) INTO v_impacted FROM graph.edges_current e WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain AND e.state = 'asserted'
      AND (e.predicate IN (SELECT rp ->> 'predicate' FROM jsonb_array_elements(v.change -> 'removed' -> 'predicates') rp) OR e.predicate IN (SELECT nn ->> 'predicate' FROM jsonb_array_elements(v.change -> 'narrowed') nn));
    IF v_impacted > 0 THEN
      RAISE EXCEPTION 'proposal refused: a breaking change with % asserted edge(s) still on the predicates it removes or narrows; retract or re-derive them (the migration) before approval', v_impacted USING ERRCODE = '22023';
    END IF;
    IF (v_reviews ->> 'compatibility') IS DISTINCT FROM 'passed' OR (v_reviews ->> 'migration') NOT IN ('passed', 'not_required') THEN
      RAISE EXCEPTION 'proposal refused: a breaking change is approved only after its compatibility and migration reviews passed (reviews: %)', v_reviews USING ERRCODE = '22023';
    END IF;
  END IF;
  SELECT x.version_id INTO v_prior FROM graph.ontology_versions x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.namespace = v.namespace AND x.state = 'active';
  IF v_prior IS NOT NULL THEN
    UPDATE graph.ontology_versions SET state = 'superseded', superseded_at = clock_timestamp() WHERE version_id = v_prior;
    INSERT INTO graph.ontology_events (event_id, scope, tenant_id, domain_id, version_id, event, actor_principal_id, details, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, v_prior, 'ontology.superseded', p_actor, jsonb_build_object('by', p_version_id), p_correlation);
  END IF;
  UPDATE graph.ontology_versions SET state = 'active', decided_by = p_actor, decided_at = clock_timestamp(), decision_reason = p_reason, activated_at = clock_timestamp(), reviews = v_reviews || jsonb_build_object('domain', coalesce(v_reviews ->> 'domain', 'passed'), 'governance', 'passed') WHERE version_id = p_version_id;
  INSERT INTO graph.ontology_events (event_id, scope, tenant_id, domain_id, version_id, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_version_id, 'ontology.approved', p_actor, jsonb_build_object('reason', p_reason, 'reviews', v_reviews), p_correlation),
         (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_version_id, 'ontology.activated', p_actor, jsonb_build_object('supersedes', v_prior), p_correlation);
  RETURN jsonb_build_object('version_id', p_version_id, 'state', 'active', 'supersedes', v_prior, 'version', v.version);
END $$ LANGUAGE plpgsql;

-- ============================================================
-- §4 scenario review
-- ============================================================
CREATE OR REPLACE FUNCTION prediction.review_scenario(p_scenario_id uuid, p_tenant uuid, p_domain uuid, p_branch_id uuid, p_outcome text, p_note text, p_dissent jsonb, p_next_review_by timestamptz, p_actor uuid, p_event_id uuid, p_correlation uuid)
RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, graph, simulation, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE s prediction.scenarios_current%ROWTYPE; b prediction.branches_current%ROWTYPE; ob prediction.branches_current%ROWTYPE; v_next timestamptz; v_closed int := 0; v_ordinal int; v_cadence interval; v_links jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.scenario.review']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_outcome NOT IN ('continue', 'dissent', 'retire', 'promote_to_simulation') THEN RAISE EXCEPTION 'a review outcome is continue, dissent, retire or promote_to_simulation' USING ERRCODE = '22023'; END IF;
  IF coalesce(length(btrim(p_note)), 0) < 8 THEN RAISE EXCEPTION 'a review states its note (8+ characters)' USING ERRCODE = '22023'; END IF;
  SELECT * INTO s FROM prediction.scenarios_current x WHERE x.scenario_id = p_scenario_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'no scenario % in this domain', p_scenario_id USING ERRCODE = '23503'; END IF;
  IF s.state = 'retired' THEN RAISE EXCEPTION 'scenario % is retired; a retired scenario is not reviewed again (declare a successor)', p_scenario_id USING ERRCODE = '22023'; END IF;
  IF p_outcome = 'dissent' AND (p_dissent IS NULL OR coalesce(length(btrim(p_dissent ->> 'position')), 0) < 4 OR coalesce(length(btrim(p_dissent ->> 'rationale')), 0) < 8) THEN
    RAISE EXCEPTION 'a dissent states its position and rationale' USING ERRCODE = '22023';
  END IF;
  IF p_branch_id IS NOT NULL THEN
    SELECT * INTO b FROM prediction.branches_current x WHERE x.branch_id = p_branch_id AND x.scenario_id = p_scenario_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'branch % is not a branch of scenario %', p_branch_id, p_scenario_id USING ERRCODE = '22023'; END IF;
  END IF;
  IF p_outcome = 'promote_to_simulation' THEN
    IF p_branch_id IS NULL THEN RAISE EXCEPTION 'promotion to simulation names the branch' USING ERRCODE = '22023'; END IF;
    IF b.state = 'closed' THEN RAISE EXCEPTION 'branch % is closed; a closed branch is not promoted to simulation', p_branch_id USING ERRCODE = '22023'; END IF;
    UPDATE prediction.branches_current SET simulation_candidate_at = clock_timestamp() WHERE branch_id = p_branch_id;
  END IF;
  -- The cadence names the next review: a named instant wins; otherwise the cadence's interval from now (weekly/monthly/quarterly/daily; other cadences leave it open).
  v_cadence := CASE lower(coalesce(s.review_cadence, '')) WHEN 'daily' THEN interval '1 day' WHEN 'weekly' THEN interval '7 days' WHEN 'monthly' THEN interval '1 month' WHEN 'quarterly' THEN interval '3 months' ELSE NULL END;
  v_next := coalesce(p_next_review_by, CASE WHEN v_cadence IS NULL THEN NULL ELSE clock_timestamp() + v_cadence END);
  v_ordinal := s.reviews + 1;
  IF p_outcome = 'retire' THEN
    -- Open branches close (a flipped branch keeps its state: the flip is history); the scenario leaves the portfolio.
    FOR ob IN SELECT * FROM prediction.branches_current x WHERE x.scenario_id = p_scenario_id AND x.state = 'open' LOOP
      UPDATE prediction.branches_current SET state = 'closed' WHERE branch_id = ob.branch_id;
      INSERT INTO prediction.scenario_events (event_id, scope, tenant_id, domain_id, scenario_id, branch_id, event, actor_principal_id, details, correlation_id)
      VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_scenario_id, ob.branch_id, 'branch.closed', p_actor, jsonb_build_object('reason', 'the scenario was retired by review', 'review_ordinal', v_ordinal), p_correlation);
      v_closed := v_closed + 1;
    END LOOP;
    UPDATE prediction.scenarios_current SET state = 'retired', retired_at = clock_timestamp(), retirement_reason = p_note, last_reviewed_at = clock_timestamp(), next_review_due_at = NULL, reviews = v_ordinal WHERE scenario_id = p_scenario_id;
    INSERT INTO prediction.scenario_events (event_id, scope, tenant_id, domain_id, scenario_id, branch_id, event, actor_principal_id, details, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_scenario_id, NULL, 'scenario.retired', p_actor, jsonb_build_object('reason', p_note, 'branches_closed', v_closed, 'review_ordinal', v_ordinal), p_correlation);
  ELSE
    UPDATE prediction.scenarios_current SET last_reviewed_at = clock_timestamp(), next_review_due_at = v_next, reviews = v_ordinal WHERE scenario_id = p_scenario_id;
  END IF;
  INSERT INTO prediction.scenario_events (event_id, scope, tenant_id, domain_id, scenario_id, branch_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_scenario_id, p_branch_id, 'scenario.reviewed', p_actor,
          jsonb_build_object('outcome', p_outcome, 'note', p_note, 'dissent', p_dissent, 'review_ordinal', v_ordinal, 'next_review_due_at', v_next, 'overdue_before', s.next_review_due_at IS NOT NULL AND s.next_review_due_at < clock_timestamp()), p_correlation);
  v_links := jsonb_build_object(
    'forecast_id', s.forecast_id,
    'decision_objects', (SELECT coalesce(jsonb_agg(DISTINCT d.dependent_object_id), '[]'::jsonb) FROM graph.dependencies d WHERE d.depends_on_kind = 'strategy' AND d.depends_on_id = p_scenario_id AND d.state = 'active'),
    'dependents', (SELECT coalesce(jsonb_agg(jsonb_build_object('type', d.dependent_type, 'id', d.dependent_object_id)), '[]'::jsonb) FROM graph.dependencies d WHERE d.dependent_type = 'SCN' AND d.dependent_object_id = p_scenario_id AND d.state = 'active'),
    'simulation_runs', (SELECT coalesce(jsonb_agg(r.run_id), '[]'::jsonb) FROM simulation.runs_current r WHERE r.scenario_id = p_scenario_id));
  RETURN jsonb_build_object('scenario_id', p_scenario_id, 'outcome', p_outcome, 'review_ordinal', v_ordinal, 'state_after', CASE WHEN p_outcome = 'retire' THEN 'retired' ELSE s.state END,
                            'branch', CASE WHEN p_branch_id IS NULL THEN NULL ELSE jsonb_build_object('branch_id', p_branch_id, 'kind', b.kind, 'state_after', CASE WHEN p_outcome = 'retire' AND b.state = 'open' THEN 'closed' ELSE b.state END) END,
                            'next_review_due_at', CASE WHEN p_outcome = 'retire' THEN NULL ELSE v_next END, 'branches_closed', v_closed, 'cadence', s.review_cadence, 'links', v_links);
END $$ LANGUAGE plpgsql;

-- ============================================================
-- §5 relationships — the reassessment port idempotent per cause
-- ============================================================
CREATE OR REPLACE FUNCTION graph.open_edge_reassessment(
  p_edge_id uuid, p_tenant uuid, p_domain uuid, p_trigger text, p_reason text, p_cause_id uuid, p_actor uuid, p_correlation uuid
) RETURNS boolean
SECURITY DEFINER SET search_path = graph, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_state text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.mapping.subscription.apply', 'intelligence.method.activate', 'graph.relationship.subscription.apply']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_trigger NOT IN ('evidence', 'claim', 'model') THEN RAISE EXCEPTION 'a reassessment names its trigger: evidence, claim or model' USING ERRCODE = '22023'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN RAISE EXCEPTION 'a reassessment states its reason (at least 8 characters)' USING ERRCODE = '22023'; END IF;
  SELECT reassessment_state INTO v_state FROM graph.edges_current WHERE edge_id = p_edge_id AND tenant_id = p_tenant AND domain_id = p_domain AND state = 'asserted' FOR UPDATE;
  IF v_state IS NULL THEN RETURN false; END IF;
  -- The same cause a second time (a re-driven delivery): nothing to add, nothing to publish (B9 review).
  IF EXISTS (SELECT 1 FROM graph.edges_current e, jsonb_array_elements(e.reassessment_causes) c WHERE e.edge_id = p_edge_id AND e.reassessment_state = 'pending' AND (c ->> 'cause_id')::uuid = p_cause_id) THEN RETURN true; END IF;
  IF v_state = 'pending' THEN
    -- A SECOND CAUSE while one is pending is recorded on the relationship (the causes accumulate) and published like the first.
    UPDATE graph.edges_current
       SET reassessment_reason = reassessment_reason || '; ' || p_reason,
           reassessment_causes = reassessment_causes || jsonb_build_object('trigger', p_trigger, 'cause_id', p_cause_id, 'reason', p_reason, 'at', clock_timestamp())
     WHERE edge_id = p_edge_id;
  ELSE
    UPDATE graph.edges_current
       SET reassessment_state = 'pending', reassessment_trigger = p_trigger, reassessment_reason = p_reason, reassessment_cause_id = p_cause_id,
           reassessment_causes = jsonb_build_array(jsonb_build_object('trigger', p_trigger, 'cause_id', p_cause_id, 'reason', p_reason, 'at', clock_timestamp())),
           reassessment_opened_at = clock_timestamp(), reassessed_at = NULL, reassessment_outcome = NULL
     WHERE edge_id = p_edge_id;
  END IF;
  INSERT INTO graph.edge_events (event_id, scope, tenant_id, domain_id, edge_id, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_edge_id, 'edge.reassessment_opened', p_actor,
          jsonb_build_object('trigger', p_trigger, 'reason', p_reason, 'cause_id', p_cause_id, 'already_pending', v_state = 'pending'), p_correlation);
  RETURN true;
END $$ LANGUAGE plpgsql;

-- ============================================================
-- §6 the register's comment names the seven bound by 0066 (six unbound and L3-I05), as the rows do
-- ============================================================
COMMENT ON COLUMN objects.interface_register.bound_in IS 'The migration that bound the interface (0066 for the seven of CP-6 B9: the six that were unbound and L3-I05, which was partial); NULL for the bindings recorded with the register itself (0065).';
