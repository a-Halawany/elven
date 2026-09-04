-- ============================================================
-- 0026 — EDGE SUPERSESSION AND CORRECTION-CASE COVERAGE.
--
-- A second bounded forward migration answering the concerns raised against
-- 762de2be. Additive throughout: 0024 and 0025 stand, no released migration is
-- rewritten, and C18/C19 are untouched.
--
--   §1  an edge records WHEN it stopped being believed, not only that it did
--   §2  a correction case carries its own propagation state
--   §3  graph.assert_edge retires the edge a corrected claim replaces
--   §4  graph.record_impact completes a CASE only when every recorded root is
--       covered, and states the truth in the case's own words
-- ============================================================

-- ============================================================
-- 1. Supersession is a record-time fact and needs a record-time instant.
-- ============================================================
/*
 * `state = 'superseded'` said an edge was replaced but not WHEN, so a historical
 * query had nothing to filter on and a superseded edge either stayed visible for
 * ever or vanished from the past as well. `retracted_at` is the wrong column for
 * it: retraction says we should not have claimed the edge, supersession says a
 * corrected claim replaced it. They are different statements and they get
 * different fields.
 */
ALTER TABLE graph.edges_current
  ADD COLUMN superseded_at timestamptz;

ALTER TABLE graph.edges_current
  DROP CONSTRAINT edg_superseded_names_successor;
ALTER TABLE graph.edges_current
  ADD CONSTRAINT edg_superseded_names_successor
  CHECK (state <> 'superseded' OR (superseded_by IS NOT NULL AND superseded_at IS NOT NULL));

COMMENT ON COLUMN graph.edges_current.superseded_at IS
  'when a corrected claim replaced this edge; a known-at query before this instant still sees it';

CREATE INDEX edg_supersession ON graph.edges_current (claim_object_id, claim_version, state);

-- ============================================================
-- 2. A correction case carries its own propagation state.
-- ============================================================
/*
 * Outstanding work was previously inferred from `propagation_assessment_id IS
 * NULL`, which made a PARTIALLY assessed correction indistinguishable from a
 * finished one — the id is set either way. A case now says what state its
 * propagation is actually in, so outstanding work can be filtered in the query
 * rather than after a page of results has already been taken.
 */
ALTER TABLE observation.correction_current
  ADD COLUMN propagation_state text NOT NULL DEFAULT 'pending';
ALTER TABLE observation.correction_current
  ADD CONSTRAINT corr_propagation_state_check
  CHECK (propagation_state IN ('pending', 'partial', 'complete'));

COMMENT ON COLUMN observation.correction_current.propagation_state IS
  'pending = no walk has run; partial = walked but truncated or with roots still uncovered; '
  'complete = every recorded root walked without unresolved truncation';

CREATE INDEX corr_propagation_outstanding
  ON observation.correction_current (tenant_id, domain_id, received_at DESC)
  WHERE state = 'applied' AND propagation_state <> 'complete';

-- ============================================================
-- 3. A corrected claim retires the edge it replaces.
-- ============================================================
/*
 * `assert_edge` only ever INSERTed, and nothing else retired the prior edge — no
 * trigger, no constraint. So correcting a relationship from A→B to A→C left BOTH
 * visible in the current graph, and a traversal could not tell which one the
 * publisher's correction had actually left standing.
 *
 * The prior edge is SUPERSEDED, never deleted: it keeps its bytes, its provenance
 * and its instants, and a known-at query positioned before `superseded_at`
 * reproduces exactly the graph we believed then.
 *
 * Only STRICTLY LOWER claim versions are superseded, which is what makes a repeat
 * run a no-op rather than a chain of supersessions.
 */
CREATE OR REPLACE FUNCTION graph.assert_edge(
  p_edge_id uuid, p_tenant uuid, p_domain uuid, p_subject uuid, p_predicate text,
  p_object uuid, p_valid_from timestamptz, p_valid_to timestamptz,
  p_claim_object_id uuid, p_claim_version bigint, p_evidence_object_id uuid,
  p_evidence_digest text, p_method_id uuid, p_run_id uuid, p_mode text,
  p_confidence numeric, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS void
SECURITY DEFINER SET search_path = graph, objects, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_review text; v_now timestamptz := clock_timestamp(); r record;
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.edge.assert']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF NOT EXISTS (SELECT 1 FROM graph.entities_current e WHERE e.entity_id = p_subject)
     OR NOT EXISTS (SELECT 1 FROM graph.entities_current e WHERE e.entity_id = p_object) THEN
    RAISE EXCEPTION 'edge rejected: both ends must be resolved entities in this domain'
      USING ERRCODE = '23503';
  END IF;

  SELECT c.payload -> 'review' ->> 'state' INTO v_review
    FROM objects.canonical_objects c
   WHERE c.object_id = p_claim_object_id AND c.object_version = p_claim_version;
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
-- 4. A case completes only when every recorded root is covered.
-- ============================================================
/*
 * One walked root previously presented a whole correction as propagated. A case
 * that superseded three evidence objects and had one of them walked said
 * "assessed", and the other two were never looked at.
 *
 * Coverage is computed HERE, from the case's own `affected_resolved` roots and
 * the invalidations recorded against it, because the database is the only place
 * that can see every walk. A caller cannot assert completion; it can only walk a
 * root and let this decide what that means for the case.
 *
 * THE HISTORICAL SENTENCE IS RETIRED. "downstream consumers not yet present"
 * described a world in which no dependency graph existed. One does. Whatever the
 * case's state now is, it is stated in the present tense.
 */
CREATE OR REPLACE FUNCTION graph.record_impact(
  p_invalidation_id uuid, p_tenant uuid, p_domain uuid,
  p_assumptions jsonb, p_objectives jsonb, p_decisions jsonb, p_commitments jsonb,
  p_statement text, p_truncated boolean, p_unexplored jsonb,
  p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS void
SECURITY DEFINER SET search_path = graph, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE
  v_case uuid; v_roots uuid[]; v_covered uuid[]; v_missing int; v_partial boolean;
  v_state text; v_sentence text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.impact.propagate']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  UPDATE graph.invalidations_current
     SET affected_assumptions = coalesce(p_assumptions, '[]'::jsonb),
         affected_objectives  = coalesce(p_objectives,  '[]'::jsonb),
         affected_decisions   = coalesce(p_decisions,   '[]'::jsonb),
         affected_commitments = coalesce(p_commitments, '[]'::jsonb),
         statement = p_statement,
         truncated = coalesce(p_truncated, false),
         unexplored = coalesce(p_unexplored, '[]'::jsonb),
         state = 'assessed', assessed_at = clock_timestamp()
   WHERE invalidation_id = p_invalidation_id
   RETURNING correction_case_id INTO v_case;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'impact rejected: no such invalidation' USING ERRCODE = '23503';
  END IF;

  IF v_case IS NOT NULL THEN
    -- The roots the CASE recorded as affected, and the roots actually walked to
    -- completion against it.
    SELECT coalesce(array_agg(DISTINCT (x ->> 'object_id')::uuid), ARRAY[]::uuid[])
      INTO v_roots
      FROM observation.correction_current c,
           LATERAL jsonb_array_elements(c.affected_resolved) x
     WHERE c.case_id = v_case AND x ? 'object_id';

    SELECT coalesce(array_agg(DISTINCT i.trigger_object_id), ARRAY[]::uuid[])
      INTO v_covered
      FROM graph.invalidations_current i
     WHERE i.correction_case_id = v_case
       AND i.state = 'assessed' AND i.truncated IS NOT TRUE;

    SELECT count(*) INTO v_missing
      FROM unnest(v_roots) AS root
     WHERE NOT (root = ANY (v_covered));

    -- Any assessment against this case that stopped early keeps the case partial,
    -- however many roots are covered.
    SELECT EXISTS (SELECT 1 FROM graph.invalidations_current i
                    WHERE i.correction_case_id = v_case AND i.truncated) INTO v_partial;

    IF array_length(v_roots, 1) IS NULL THEN
      -- A case that recorded no roots is completed by one untruncated walk.
      v_state := CASE WHEN v_partial THEN 'partial' ELSE 'complete' END;
      v_missing := 0;
    ELSE
      v_state := CASE WHEN v_missing = 0 AND NOT v_partial THEN 'complete' ELSE 'partial' END;
    END IF;

    v_sentence := CASE
      WHEN v_state = 'complete' THEN p_statement
      WHEN v_missing > 0 AND v_partial THEN
        format('propagation incomplete: %s of %s corrected object(s) have been walked, and at '
               || 'least one walk reached its traversal bound; the remaining work is recorded on '
               || 'this case''s invalidations',
               array_length(v_roots, 1) - v_missing, array_length(v_roots, 1))
      WHEN v_missing > 0 THEN
        format('propagation incomplete: %s of %s corrected object(s) have been walked; %s '
               || 'remain unassessed',
               array_length(v_roots, 1) - v_missing, array_length(v_roots, 1), v_missing)
      ELSE
        'propagation incomplete: every corrected object has been walked, but at least one walk '
        || 'reached its traversal bound and left dependency paths unexplored'
    END;

    UPDATE observation.correction_current
       SET propagation_unresolved = v_sentence,
           propagation_assessment_id = p_invalidation_id,
           propagation_state = v_state
     WHERE case_id = v_case AND tenant_id = p_tenant AND domain_id = p_domain;
  END IF;

  INSERT INTO graph.invalidation_events (
    event_id, scope, tenant_id, domain_id, invalidation_id, event, actor_principal_id,
    details, correlation_id
  ) VALUES (
    p_event_id, 'DOMAIN', p_tenant, p_domain, p_invalidation_id, 'invalidation.assessed',
    p_actor, jsonb_build_object(
      'assumptions', jsonb_array_length(coalesce(p_assumptions, '[]'::jsonb)),
      'objectives',  jsonb_array_length(coalesce(p_objectives,  '[]'::jsonb)),
      'decisions',   jsonb_array_length(coalesce(p_decisions,   '[]'::jsonb)),
      'commitments', jsonb_array_length(coalesce(p_commitments, '[]'::jsonb)),
      'truncated', coalesce(p_truncated, false),
      'unexplored', jsonb_array_length(coalesce(p_unexplored, '[]'::jsonb)),
      'correction_case_id', v_case, 'case_propagation_state', v_state,
      'roots_outstanding', coalesce(v_missing, 0), 'statement', p_statement),
    p_correlation);
END $$ LANGUAGE plpgsql;
