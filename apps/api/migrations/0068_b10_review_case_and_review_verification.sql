-- 0068 — CP-6 B10: the review's carried findings and the intelligence gap (2026-09-13).
--   §1 G2: a claim APPROVED in review is graphed — graph.assert_edge consults the review case's decision (the claim's own
--      payload keeps 'queued' for ever; the person's decision is the case's): approved admitted, rejected/queued refused,
--      corrected refused in favour of the corrected version. The builder's rules (derive.ts) do the same.
--   §2 B9-F3: retention.verify_action verifies a REVIEW action against its preservation contract (no tombstone, bytes
--      present, the review recorded) instead of the deletion checks; deletion and floor checks unchanged.
--   §5 memory.record_access accepts briefing.compose: a composition (a person's or an agent's) that reads a memory item records the
--      access on the item's ledger in its own transaction — the agent's retrieval of AU-MEM-0065, audited like a person's.
--   §4 memory.withdraw_item accepts the action memory.item.withdraw (its own name on the envelope), the supersession's too.
--   §3 objects.outbox_declare_floor re-checks the served points with the scope resolution's rule (a subscription served from
--      below the floor, or checkpointed more than one row below it) — 0067's raw-cursor check refused moves the resolution admitted.
--   §6 B9-F3, the scope: retention.resolve_scope scopes a REVIEW by its preservation contract — current and held evidence reviewed
--      in place, no residuals — found on the demonstration rehearsal (a review of current evidence resolved to nothing and paused).

-- ============================================================
-- §1 G2 — the review case decides
-- ============================================================
CREATE OR REPLACE FUNCTION graph.assert_edge(
  p_edge_id uuid, p_tenant uuid, p_domain uuid, p_subject uuid, p_predicate text,
  p_object uuid, p_valid_from timestamptz, p_valid_to timestamptz,
  p_claim_object_id uuid, p_claim_version bigint, p_evidence_object_id uuid,
  p_evidence_digest text, p_method_id uuid, p_run_id uuid, p_mode text,
  p_confidence numeric, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS void
SECURITY DEFINER SET search_path = graph, objects, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_review text; v_case text; v_now timestamptz := clock_timestamp(); r record;
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.edge.assert', 'graph.relationship.subscription.apply']);
  -- 0066 §7 (L4-I05): a domain with an ACTIVE ontology version admits only the predicates it declares (a domain without one keeps
  -- the pre-B9 behaviour: nothing is refused until a version is proposed and approved).
  IF EXISTS (SELECT 1 FROM graph.ontology_versions v WHERE v.tenant_id = p_tenant AND v.domain_id = p_domain AND v.state = 'active')
     AND NOT EXISTS (SELECT 1 FROM graph.ontology_versions v, jsonb_array_elements(v.predicates) pr
                      WHERE v.tenant_id = p_tenant AND v.domain_id = p_domain AND v.state = 'active' AND pr ->> 'predicate' = p_predicate) THEN
    RAISE EXCEPTION 'edge rejected: predicate % is not in the domain''s active ontology version; propose it (graph.ontology.propose) before asserting it', p_predicate USING ERRCODE = '22023';
  END IF;
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF NOT EXISTS (SELECT 1 FROM graph.entities_current e WHERE e.entity_id = p_subject)
     OR NOT EXISTS (SELECT 1 FROM graph.entities_current e WHERE e.entity_id = p_object) THEN
    RAISE EXCEPTION 'edge rejected: both ends must be resolved entities in this domain'
      USING ERRCODE = '23503';
  END IF;

  SELECT c.payload -> 'review' ->> 'state' INTO v_review
    FROM objects.canonical_objects c
   WHERE c.object_id = p_claim_object_id AND c.object_version = p_claim_version;
  -- G2 (B10): the review CASE's decision governs — the extraction writes 'queued' at admission and never rewrites it; the
  -- person's approval, correction or rejection is the case's. Approved: admitted. Rejected or still queued: refused.
  -- Corrected: this version is superseded by the corrected one — refused (the corrected version carries its own edge).
  SELECT rc.state INTO v_case FROM intelligence.review_current rc
   WHERE rc.claim_object_id = p_claim_object_id AND rc.claim_version = p_claim_version ORDER BY rc.opened_at DESC LIMIT 1;
  -- A version whose CASE was corrected is superseded by the corrected version (the corrected version's own payload says
  -- 'corrected' — that one is the correction and is admitted).
  IF v_case = 'corrected' THEN
    RAISE EXCEPTION 'edge rejected: claim %@% was corrected in review to a later version; the corrected version carries the relationship', p_claim_object_id, p_claim_version USING ERRCODE = '22023';
  END IF;
  v_review := CASE WHEN v_case = 'approved' THEN 'approved' WHEN v_case IN ('queued', 'rejected') THEN v_case ELSE v_review END;
  IF v_review IN ('queued', 'rejected') THEN
    RAISE EXCEPTION 'edge rejected: the claim behind it is % for review; a claim a person has not decided is not promoted into the graph',
      v_review USING ERRCODE = '42501';
  END IF;

  INSERT INTO graph.edges_current (
    edge_id, scope, tenant_id, domain_id, subject_entity_id, predicate, object_entity_id,
    valid_from, valid_to, state, claim_object_id, claim_version, evidence_object_id,
    evidence_digest, method_id, run_id, mode, confidence, asserted_by, correlation_id
  ) VALUES (
    p_edge_id, 'DOMAIN', p_tenant, p_domain, p_subject, p_predicate, p_object,
    p_valid_from, p_valid_to, 'asserted', p_claim_object_id, p_claim_version,
    p_evidence_object_id, p_evidence_digest, p_method_id, p_run_id, p_mode,
    p_confidence, p_actor, p_correlation);
  INSERT INTO graph.edge_events (
    event_id, scope, tenant_id, domain_id, edge_id, event, actor_principal_id,
    details, correlation_id
  ) VALUES (
    p_event_id, 'DOMAIN', p_tenant, p_domain, p_edge_id, 'edge.asserted', p_actor,
    jsonb_build_object('predicate', p_predicate, 'subject', p_subject, 'object', p_object,
                       'valid_from', p_valid_from, 'valid_to', p_valid_to,
                       'mode', p_mode, 'claim_object_id', p_claim_object_id,
                       'claim_version', p_claim_version, 'review_state', v_review),
    p_correlation);

  -- Every still-asserted edge from an EARLIER version of the same claim is now
  -- obsolete. Each is superseded individually so each leaves its own event.
  FOR r IN SELECT e.edge_id FROM graph.edges_current e
            WHERE e.claim_object_id = p_claim_object_id
              AND e.claim_version < p_claim_version
              AND e.state = 'asserted'
            FOR UPDATE
  LOOP
    UPDATE graph.edges_current
       SET state = 'superseded', superseded_by = p_edge_id, superseded_at = v_now
     WHERE edge_id = r.edge_id;
    INSERT INTO graph.edge_events (
      event_id, scope, tenant_id, domain_id, edge_id, event, actor_principal_id,
      details, correlation_id
    ) VALUES (
      gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, r.edge_id, 'edge.superseded', p_actor,
      jsonb_build_object('superseded_by', p_edge_id, 'claim_object_id', p_claim_object_id,
                         'corrected_to_version', p_claim_version,
                         'reason', 'the claim this edge rests on was corrected'),
      p_correlation);
  END LOOP;
END $$ LANGUAGE plpgsql;

-- ============================================================
-- §2 B9-F3 — a review verifies as a review
-- ============================================================
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
    IF i.item_kind = 'manifest' AND i.disposition = 'execute' AND a.kind = 'review' THEN
      -- B9-F3: a REVIEW's contract is PRESERVATION — the manifest untouched (no tombstone), its bytes present, and the review recorded.
      ob := coalesce(p_observed -> i.ref, '{}'::jsonb);
      v_pass := NOT EXISTS (SELECT 1 FROM observation.blob_tombstones t WHERE t.manifest_id = i.ref::uuid) AND coalesce((ob ->> 'bytes_present')::boolean, false) = true
                AND EXISTS (SELECT 1 FROM retention.executions e WHERE e.action_id = p_action_id AND e.item_id = i.item_id AND e.outcome = 'done');
      INSERT INTO retention.verifications (verification_id, scope, tenant_id, domain_id, action_id, check_name, expected, observed, passed, verified_by)
      VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_action_id, 'manifest ' || i.ref || ': reviewed — untouched, its bytes present', jsonb_build_object('tombstone', false, 'bytes_present', true, 'reviewed', true),
              jsonb_build_object('tombstone', EXISTS (SELECT 1 FROM observation.blob_tombstones t WHERE t.manifest_id = i.ref::uuid), 'bytes_present', ob -> 'bytes_present', 'reviewed', EXISTS (SELECT 1 FROM retention.executions e WHERE e.action_id = p_action_id AND e.item_id = i.item_id AND e.outcome = 'done')), v_pass, p_actor);
    ELSIF i.item_kind = 'manifest' AND i.disposition = 'execute' THEN
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

-- ============================================================
-- §3 the floor's re-check at the move applies the scope resolution's own rule (0067 §1 checked every subscription's raw cursors, refusing a move the resolution had admitted)
-- ============================================================
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
  -- The same rule the scope resolution applies (0066 §4): a subscription served from below the floor, or checkpointed more than one row below it, blocks.
  IF EXISTS (SELECT 1 FROM graph.subscriptions s WHERE s.tenant_id = public.eye_tenant() AND s.status <> 'revoked'
                AND (s.served_from_seq < p_to_seq OR (s.checkpoint_seq IS NOT NULL AND s.checkpoint_seq < p_to_seq - 1))) THEN
    RAISE EXCEPTION 'floor declaration rejected: a subscription''s served point lies below % (the scope must be resolved again)', p_to_seq USING ERRCODE = '22023';
  END IF;
  IF p_to_seq <= v_floor OR p_to_seq > v_next THEN RAISE EXCEPTION 'floor declaration rejected: % must lie above the floor % and at most the next sequence %', p_to_seq, v_floor, v_next USING ERRCODE = '22023'; END IF;
  UPDATE objects.outbox_partitions SET retained_from_seq = p_to_seq, retention_policy = 'declared', retention_note = 'retention action ' || p_action_id::text || ' moved the floor from ' || v_floor || ' to ' || p_to_seq || ' at ' || clock_timestamp()::text
   WHERE partition_key = p_partition_key;
  RETURN jsonb_build_object('partition_key', p_partition_key, 'floor_before', v_floor, 'floor_after', p_to_seq, 'next_seq', v_next);
END $$ LANGUAGE plpgsql;

-- ============================================================
-- §4 memory.item.withdraw — the withdrawal is its own named act (the same human-gated authority as the supersession); the route no longer borrows the supersession's action
-- ============================================================
CREATE OR REPLACE FUNCTION memory.withdraw_item(p_item_id uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_event_id uuid, p_correlation uuid)
RETURNS void
SECURITY DEFINER SET search_path = memory, graph, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE cur memory.items_current%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['memory.item.withdraw', 'memory.item.supersede']); -- B10: the withdrawal is its own named act of the record authority
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF coalesce(length(btrim(p_reason)), 0) < 8 THEN RAISE EXCEPTION 'memory item rejected: a withdrawal states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  SELECT * INTO cur FROM memory.items_current x WHERE x.item_id = p_item_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'memory item rejected: % is not recorded', p_item_id USING ERRCODE = '23503'; END IF;
  IF cur.state = 'withdrawn' THEN RETURN; END IF;
  UPDATE memory.items_current SET state = 'withdrawn' WHERE item_id = p_item_id;
  UPDATE graph.dependencies SET state = 'removed' WHERE dependent_type = 'MEM' AND dependent_object_id = p_item_id AND state = 'active';
  INSERT INTO memory.item_events (event_id, scope, tenant_id, domain_id, item_id, event, object_version, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_item_id, 'memory.withdrawn', cur.object_version, p_actor, jsonb_build_object('reason', p_reason), p_correlation);
END $$ LANGUAGE plpgsql;

-- ============================================================
-- §5 the agent's retrieval — a briefing composition reads the memory items its purpose admits, each read recorded on the item's access ledger under briefing.compose
-- ============================================================
CREATE OR REPLACE FUNCTION memory.record_access(p_item_id uuid, p_tenant uuid, p_domain uuid, p_version int, p_purpose text, p_reader uuid, p_as_of timestamptz, p_correlation uuid)
RETURNS uuid
SECURITY DEFINER SET search_path = memory, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_id uuid := gen_random_uuid();
BEGIN
  PERFORM observation.assert_authority(ARRAY['memory.item.retrieve', 'briefing.compose']); -- B10: a composition's read of an item is an access under the composer's purpose
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF coalesce(length(btrim(p_purpose)), 0) = 0 THEN RAISE EXCEPTION 'memory retrieval rejected: a purpose is declared' USING ERRCODE = '22023'; END IF;
  INSERT INTO memory.item_access (access_id, scope, tenant_id, domain_id, item_id, object_version, reader_principal_id, purpose_id, policy_decision_id, read_as_of, correlation_id)
  VALUES (v_id, 'DOMAIN', p_tenant, p_domain, p_item_id, p_version, p_reader, p_purpose, public.eye_policy_decision(), p_as_of, p_correlation);
  INSERT INTO memory.item_events (event_id, scope, tenant_id, domain_id, item_id, event, object_version, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_item_id, 'memory.retrieved', p_version, p_reader, jsonb_build_object('purpose', p_purpose, 'as_of', p_as_of, 'access_id', v_id), p_correlation);
  RETURN v_id;
END $$ LANGUAGE plpgsql;

-- ============================================================
-- §6 B9-F3, the scope: a REVIEW action is scoped by its preservation contract, not by deletion criteria (found on the demonstration
-- rehearsal: a review of CURRENT evidence resolved to an excluded item — "a deletion retires corrected, superseded or withdrawn
-- evidence only" — and paused; a review of held evidence would have been 'held'). The function is 0066's re-declared with the
-- review branches: the source selector covers the source's evidence whatever its state; every manifest named is reviewed in place
-- (disposition execute), a hold recorded on the item and honoured by keeping it; no residual inventory (nothing is retired); the
-- paused reason names what a review looks for. Deletion, archive and customer_export scoping is unchanged.
-- ============================================================
CREATE OR REPLACE FUNCTION retention.resolve_scope(p_action_id uuid, p_tenant uuid, p_domain uuid, p_actor uuid, p_correlation uuid)
RETURNS jsonb
SECURITY DEFINER SET search_path = retention, observation, objects, graph, intelligence, executive, ctx, public, pg_catalog, pg_temp AS $$
DECLARE a retention.actions_current%ROWTYPE; m RECORD; v_hold uuid; v_items int := 0; v_held int := 0; v_blocking int := 0; v_execute int := 0; v_digest text; v_state text;
        v_partition text; v_to bigint; v_floor bigint; v_next bigint; v_ord int := 0; r RECORD; v_summary jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['retention.action.resolve']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT * INTO a FROM retention.actions_current x WHERE x.action_id = p_action_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'retention action rejected: % is not open in this domain', p_action_id USING ERRCODE = '23503'; END IF;
  IF a.state NOT IN ('opened', 'scope_resolved', 'held', 'paused') THEN RAISE EXCEPTION 'retention action rejected: % is %, its scope is not resolved again', p_action_id, a.state USING ERRCODE = '22023'; END IF;
  DELETE FROM retention.scope_items WHERE action_id = p_action_id;
  DELETE FROM retention.residual_inventory WHERE action_id = p_action_id;
  IF a.target_kind = 'evidence' THEN
    -- The manifests in scope: one named manifest, or every manifest of a source whose evidence is no longer current — the
    -- evidence object's LATEST version is corrected, superseded or withdrawn (a correction restates the object; the original
    -- bytes are then history). A manifest whose evidence is still current (latest version admitted/active) is EXCLUDED,
    -- never retired by a deletion; the evidence must be corrected or withdrawn first.
    FOR m IN
      SELECT DISTINCT bm.manifest_id, bm.locator, bm.source_id, bm.created_at, bm.legal_hold, bm.byte_length,
             lv.object_id AS evd_object_id, lv.object_version AS evd_version, lv.lifecycle_state AS evd_state
        FROM observation.blob_manifests bm
        LEFT JOIN LATERAL (SELECT o.object_id, o.object_version, o.lifecycle_state FROM objects.canonical_objects o
                            WHERE o.tenant_id = p_tenant AND o.domain_id = p_domain AND o.object_type = 'EVD' AND (o.payload ->> 'manifest_id')::uuid = bm.manifest_id
                            ORDER BY o.object_version DESC LIMIT 1) lv ON true
       WHERE bm.tenant_id = p_tenant AND bm.domain_id = p_domain AND bm.vault = 'evidence'
         AND NOT EXISTS (SELECT 1 FROM observation.blob_tombstones t WHERE t.manifest_id = bm.manifest_id)
         AND ((a.selector ->> 'manifest_id') IS NOT NULL AND bm.manifest_id = (a.selector ->> 'manifest_id')::uuid
              OR (a.selector ->> 'manifest_id') IS NULL AND (a.selector ->> 'source_id') IS NOT NULL AND bm.source_id = (a.selector ->> 'source_id')::uuid
                  AND (a.kind = 'review' OR lv.lifecycle_state IN ('corrected', 'superseded', 'withdrawn')))
       ORDER BY bm.created_at
    LOOP
      v_ord := v_ord + 1; v_items := v_items + 1;
      -- A hold placed on the manifest, or through the evidence object (every version of the object is held).
      SELECT h.hold_id INTO v_hold FROM observation.legal_holds h WHERE (h.manifest_id = m.manifest_id OR (m.evd_object_id IS NOT NULL AND h.evd_object_id = m.evd_object_id)) AND h.lifted_at IS NULL ORDER BY h.placed_at LIMIT 1;
      IF a.kind = 'review' THEN
        -- B9-F3 (0068 §6): a REVIEW is scoped by its PRESERVATION contract, not by deletion criteria — current evidence is what a
        -- periodic review looks at, and a legal hold is honoured by keeping the item, which is what the review does. Every manifest the
        -- selector names is reviewed in place; the hold, if any, is recorded on the item.
        v_execute := v_execute + 1;
        INSERT INTO retention.scope_items (item_id, scope, tenant_id, domain_id, action_id, item_kind, ref, dependency_order, disposition, hold_id, reason, details)
        VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_action_id, 'manifest', m.manifest_id::text, v_ord, 'execute', v_hold,
                'reviewed in place: the record and its bytes are kept (its evidence is ' || coalesce(m.evd_state, 'unknown') || ')' || CASE WHEN m.legal_hold OR v_hold IS NOT NULL THEN '; under a legal hold, which the review honours by keeping it' ELSE '' END,
                jsonb_build_object('locator', m.locator, 'evd_object_id', m.evd_object_id, 'evd_version', m.evd_version, 'byte_length', m.byte_length, 'evd_state', m.evd_state, 'legal_hold', m.legal_hold OR v_hold IS NOT NULL));
      ELSIF m.evd_state IS NULL OR m.evd_state NOT IN ('corrected', 'superseded', 'withdrawn') THEN
        -- The bytes of CURRENT evidence are never retired by a deletion action: correct or withdraw the evidence first.
        INSERT INTO retention.scope_items (item_id, scope, tenant_id, domain_id, action_id, item_kind, ref, dependency_order, disposition, reason, details)
        VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_action_id, 'manifest', m.manifest_id::text, v_ord, 'excluded', 'the evidence resting on these bytes is current (its latest version is ' || coalesce(m.evd_state, 'unknown') || '); a deletion retires corrected, superseded or withdrawn evidence only', jsonb_build_object('locator', m.locator, 'evd_object_id', m.evd_object_id, 'evd_version', m.evd_version, 'byte_length', m.byte_length));
      ELSIF m.legal_hold OR v_hold IS NOT NULL THEN
        v_held := v_held + 1;
        INSERT INTO retention.scope_items (item_id, scope, tenant_id, domain_id, action_id, item_kind, ref, dependency_order, disposition, hold_id, reason, details)
        VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_action_id, 'manifest', m.manifest_id::text, v_ord, 'held', v_hold, 'a legal hold takes precedence over deletion (AU-MEM-0060)', jsonb_build_object('locator', m.locator, 'evd_object_id', m.evd_object_id, 'evd_version', m.evd_version, 'byte_length', m.byte_length));
      ELSE
        v_execute := v_execute + 1;
        INSERT INTO retention.scope_items (item_id, scope, tenant_id, domain_id, action_id, item_kind, ref, dependency_order, disposition, reason, details)
        VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_action_id, 'manifest', m.manifest_id::text, v_ord, 'execute', 'superseded evidence bytes past their retention', jsonb_build_object('locator', m.locator, 'evd_object_id', m.evd_object_id, 'evd_version', m.evd_version, 'byte_length', m.byte_length));
      END IF;
      -- Residuals that policy retains whatever the deletion does: the lineage that names the evidence, what rests on it, the briefings that cite it.
      -- (A review retires nothing: it has no residuals — 0068 §6.)
      IF m.evd_object_id IS NOT NULL AND a.kind <> 'review' THEN
        INSERT INTO retention.residual_inventory (residual_id, scope, tenant_id, domain_id, action_id, kind, ref, count, status, note)
        SELECT gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_action_id, 'claim_lineage', m.evd_object_id::text, count(*)::int, 'retained_by_policy', 'the claims extracted from this evidence keep their lineage rows (accountability); the bytes are gone, the record of their reading stays'
          FROM intelligence.claim_lineage l WHERE l.evidence_object_id = m.evd_object_id HAVING count(*) > 0;
        INSERT INTO retention.residual_inventory (residual_id, scope, tenant_id, domain_id, action_id, kind, ref, count, status, note)
        SELECT gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_action_id, 'dependency', m.evd_object_id::text, count(*)::int, 'retained_by_policy', 'objects resting on this evidence keep their dependency rows (the impact set remains addressable)'
          FROM graph.dependencies d WHERE d.depends_on_kind = 'evidence' AND d.depends_on_id = m.evd_object_id AND d.state = 'active' HAVING count(*) > 0;
        INSERT INTO retention.residual_inventory (residual_id, scope, tenant_id, domain_id, action_id, kind, ref, count, status, note)
        SELECT gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_action_id, 'canonical_version', m.evd_object_id::text, count(*)::int, 'retained_by_policy', 'the evidence object''s canonical versions (header, digest, custody) stay: a tombstone, never an erasure of the record'
          FROM objects.canonical_objects o WHERE o.object_id = m.evd_object_id HAVING count(*) > 0;
      END IF;
    END LOOP;
    v_state := CASE WHEN v_items = 0 THEN 'paused' WHEN v_execute = 0 AND v_held > 0 THEN 'held' WHEN v_execute = 0 THEN 'paused' ELSE 'scope_resolved' END;
  ELSE
    v_partition := a.selector ->> 'partition_key'; v_to := (a.selector ->> 'to_seq')::bigint;
    SELECT p.retained_from_seq, p.next_seq INTO v_floor, v_next FROM objects.outbox_partitions p WHERE p.partition_key = v_partition;
    IF v_floor IS NULL THEN RAISE EXCEPTION 'retention action rejected: partition % has no row', v_partition USING ERRCODE = '23503'; END IF;
    IF v_to IS NULL OR v_to <= v_floor OR v_to > v_next THEN RAISE EXCEPTION 'retention action rejected: to_seq % must lie above the floor % and at most the next sequence %', v_to, v_floor, v_next USING ERRCODE = '22023'; END IF;
    v_ord := 1; v_items := 1;
    -- The range itself: published rows below the new floor by status.
    SELECT count(*) FILTER (WHERE status = 'published') AS published, count(*) FILTER (WHERE status IN ('pending', 'failed')) AS unpublished, count(*) FILTER (WHERE status = 'dead_letter') AS dead INTO r
      FROM objects.object_outbox o WHERE o.partition_key = v_partition AND o.partition_seq >= v_floor AND o.partition_seq < v_to;
    INSERT INTO retention.scope_items (item_id, scope, tenant_id, domain_id, action_id, item_kind, ref, dependency_order, disposition, reason, details)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_action_id, 'outbox_range', v_partition || ':' || v_floor || '-' || (v_to - 1), 1, 'execute', 'the retained floor moves to this sequence; replay below it is no longer guaranteed', jsonb_build_object('from_seq', v_floor, 'to_seq', v_to, 'published', r.published, 'unpublished', r.unpublished, 'dead_letter', r.dead));
    v_execute := 1;
    -- Blocks (DP-54-005, "pause unsafe deletion"): unpublished history below the floor; a subscription served from, or checkpointed, below it.
    IF r.unpublished + r.dead > 0 THEN
      v_ord := v_ord + 1; v_items := v_items + 1; v_blocking := v_blocking + 1;
      INSERT INTO retention.scope_items (item_id, scope, tenant_id, domain_id, action_id, item_kind, ref, dependency_order, disposition, reason, details)
      VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_action_id, 'unpublished_row', v_partition, v_ord, 'blocking', 'rows below the new floor are not yet published (or dead-lettered): history the log has not delivered is not retired', jsonb_build_object('unpublished', r.unpublished, 'dead_letter', r.dead));
    END IF;
    FOR m IN SELECT s.subscription_id, s.consumer_kind, s.served_from_seq, s.checkpoint_seq FROM graph.subscriptions s
              WHERE s.tenant_id = p_tenant AND s.status <> 'revoked' AND (s.served_from_seq < v_to OR (s.checkpoint_seq IS NOT NULL AND s.checkpoint_seq < v_to - 1))
              ORDER BY s.consumer_kind LOOP
      v_ord := v_ord + 1; v_items := v_items + 1; v_blocking := v_blocking + 1;
      INSERT INTO retention.scope_items (item_id, scope, tenant_id, domain_id, action_id, item_kind, ref, dependency_order, disposition, reason, details)
      VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_action_id, 'subscription_cursor', m.subscription_id::text, v_ord, 'blocking', 'a subscription is served from, or checkpointed, below the new floor: moving it would cut history the subscription is owed (replay it to the floor first, or let it catch up)', jsonb_build_object('consumer_kind', m.consumer_kind, 'served_from_seq', m.served_from_seq, 'checkpoint_seq', m.checkpoint_seq));
    END LOOP;
    -- Residuals by policy: the delivery and attempt ledgers keep the event ids they reference below the floor.
    INSERT INTO retention.residual_inventory (residual_id, scope, tenant_id, domain_id, action_id, kind, ref, count, status, note)
    SELECT gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_action_id, 'delivery_ledger', v_partition, count(*)::int, 'retained_by_policy', 'delivery ledger rows keep the ids of events below the floor (accountability; no foreign key to the log)'
      FROM graph.subscription_deliveries d JOIN objects.object_outbox o ON o.id = d.event_id WHERE o.partition_key = v_partition AND o.partition_seq < v_to HAVING count(*) > 0;
    INSERT INTO retention.residual_inventory (residual_id, scope, tenant_id, domain_id, action_id, kind, ref, count, status, note)
    SELECT gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_action_id, 'propagation_ledger', v_partition, count(*)::int, 'retained_by_policy', 'propagation attempt rows keep the ids of events below the floor'
      FROM graph.propagation_attempts d JOIN objects.object_outbox o ON o.id = d.event_id WHERE o.partition_key = v_partition AND o.partition_seq < v_to HAVING count(*) > 0;
    v_state := CASE WHEN v_blocking > 0 THEN 'paused' ELSE 'scope_resolved' END;
  END IF;
  -- The digest the approval signs: the ordered items with their dispositions.
  SELECT encode(sha256(convert_to(coalesce(string_agg(i.item_kind || '|' || i.ref || '|' || i.disposition || '|' || coalesce(i.hold_id::text, ''), E'\n' ORDER BY i.dependency_order, i.ref), ''), 'UTF8')), 'hex') INTO v_digest
    FROM retention.scope_items i WHERE i.action_id = p_action_id;
  v_summary := jsonb_build_object('items', v_items, 'execute', v_execute, 'held', v_held, 'blocking', v_blocking,
                                  'residuals', (SELECT coalesce(jsonb_agg(jsonb_build_object('kind', ri.kind, 'count', ri.count, 'status', ri.status)), '[]'::jsonb) FROM retention.residual_inventory ri WHERE ri.action_id = p_action_id));
  UPDATE retention.actions_current
     SET state = v_state, scope_digest = v_digest, scope_summary = v_summary, resolved_at = clock_timestamp(),
         failure_class = CASE v_state WHEN 'held' THEN 'legal_hold' WHEN 'paused' THEN 'unresolved_dependency' ELSE NULL END,
         disposition = CASE v_state WHEN 'held' THEN 'challenge' WHEN 'paused' THEN 'human_review' ELSE NULL END,
         failure_reason = CASE v_state WHEN 'held' THEN 'every item in scope is under a legal hold' WHEN 'paused' THEN CASE WHEN v_items = 0 THEN 'nothing in scope: the selector resolves to no ' || CASE WHEN a.kind = 'review' THEN 'evidence' ELSE 'superseded evidence' END ELSE 'the scope cannot be retired safely: ' || v_blocking || ' blocking item(s)' END ELSE NULL END
   WHERE action_id = p_action_id;
  PERFORM retention.event(p_action_id, p_tenant, p_domain, CASE v_state WHEN 'held' THEN 'action.held' WHEN 'paused' THEN 'action.paused' ELSE 'scope.resolved' END, p_actor, v_summary || jsonb_build_object('scope_digest', v_digest), p_correlation);
  RETURN v_summary || jsonb_build_object('state', v_state, 'scope_digest', v_digest);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION retention.resolve_scope(uuid,uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION retention.resolve_scope(uuid,uuid,uuid,uuid,uuid) TO eye_commit;
