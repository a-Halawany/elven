-- ============================================================
-- 0025 — CORRECTION CLOSURE AND EDGE ADMISSION.
--
-- A bounded forward migration answering four findings from the review of
-- 6914af03. It adds no new subsystem and reopens nothing: 0024's tables, ports
-- and constraints stand, and every change here is additive.
--
--   §1  invalidations record TRUNCATION and the residual frontier
--   §2  an invalidation may be triggered by an EVIDENCE correction, which is what
--       a Phase 1 correction actually supersedes
--   §3  graph.record_impact carries the truncation through
--   §4  graph.assert_edge refuses a claim still awaiting review — the second,
--       independent boundary behind the service-level gate
-- ============================================================

-- ============================================================
-- 1. A bounded walk that stopped early says so, in the record.
-- ============================================================
/*
 * The walk has always been bounded, and until now a truncated walk and an
 * exhaustive one produced the same "assessed" row. That is the shape of a
 * correction that looks handled while dependencies sit unexamined, so the bound
 * and the frontier it cut off are now part of the assessment itself.
 */
ALTER TABLE graph.invalidations_current
  ADD COLUMN truncated  boolean NOT NULL DEFAULT false,
  ADD COLUMN unexplored jsonb   NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN graph.invalidations_current.truncated IS
  'true when the traversal bound was reached before the dependency graph was exhausted; '
  'the assessment is then PARTIAL and its statement says so';
COMMENT ON COLUMN graph.invalidations_current.unexplored IS
  'the frontier the bounded walk did not follow, so residual work is nameable rather than lost';

-- ============================================================
-- 2. Evidence corrections are a trigger in their own right.
-- ============================================================
/*
 * A Phase 1 correction supersedes EVIDENCE objects — that is what
 * `observation.correction.apply` writes. The walk only understood claim,
 * entity, edge and split triggers, so the object a correction actually changes
 * had no way in and the closure from evidence to the claims derived from it was
 * never traversed. Naming the trigger is half of closing that; the service walks
 * `intelligence.claim_lineage` for the other half.
 */
ALTER TABLE graph.invalidations_current
  DROP CONSTRAINT invalidations_current_trigger_kind_check;
ALTER TABLE graph.invalidations_current
  ADD CONSTRAINT invalidations_current_trigger_kind_check
  CHECK (trigger_kind IN (
    'claim_correction', 'claim_withdrawal', 'edge_retraction',
    'entity_split', 'evidence_correction', 'manual'));

-- ============================================================
-- 3. record_impact carries the truncation.
-- ============================================================
CREATE OR REPLACE FUNCTION graph.record_impact(
  p_invalidation_id uuid, p_tenant uuid, p_domain uuid,
  p_assumptions jsonb, p_objectives jsonb, p_decisions jsonb, p_commitments jsonb,
  p_statement text, p_truncated boolean, p_unexplored jsonb,
  p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS void
SECURITY DEFINER SET search_path = graph, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_case uuid;
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
  /*
   * A PARTIAL WALK DOES NOT RETIRE PHASE 1's SENTENCE.
   *
   * Replacing "downstream consumers not yet present" with a statement that says
   * "assessed" is a claim of completeness. A truncated walk has not earned it, so
   * the case keeps its unresolved sentence and gains the assessment id — a reader
   * sees BOTH that something was assessed and that it did not finish.
   */
  IF v_case IS NOT NULL THEN
    IF coalesce(p_truncated, false) THEN
      UPDATE observation.correction_current
         SET propagation_assessment_id = p_invalidation_id
       WHERE case_id = v_case AND tenant_id = p_tenant AND domain_id = p_domain;
    ELSE
      UPDATE observation.correction_current
         SET propagation_unresolved = p_statement,
             propagation_assessment_id = p_invalidation_id
       WHERE case_id = v_case AND tenant_id = p_tenant AND domain_id = p_domain;
    END IF;
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
      'correction_case_id', v_case, 'statement', p_statement),
    p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION graph.record_impact(uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb,text,boolean,jsonb,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.record_impact(uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb,text,boolean,jsonb,uuid,uuid,uuid) TO eye_commit;

-- The 0024 signature is withdrawn so no caller can reach the version that could
-- not express truncation. Dropping it is safe: only eye_commit could execute it.
DROP FUNCTION IF EXISTS graph.record_impact(uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb,text,uuid,uuid,uuid);

-- ============================================================
-- 4. An edge is not asserted from a claim a person has not decided.
-- ============================================================
/*
 * THE SECOND BOUNDARY.
 *
 * The orchestrator now checks the review state before it asks for an edge. That
 * is the right place for the product behaviour — it can report a named skip —
 * but a service check alone is one edit away from being bypassed, and everywhere
 * else in this system a rule that matters is enforced twice. The port therefore
 * refuses independently, reading the claim's own admitted payload rather than
 * anything the caller supplied.
 */
CREATE OR REPLACE FUNCTION graph.assert_edge(
  p_edge_id uuid, p_tenant uuid, p_domain uuid, p_subject uuid, p_predicate text,
  p_object uuid, p_valid_from timestamptz, p_valid_to timestamptz,
  p_claim_object_id uuid, p_claim_version bigint, p_evidence_object_id uuid,
  p_evidence_digest text, p_method_id uuid, p_run_id uuid, p_mode text,
  p_confidence numeric, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS void
SECURITY DEFINER SET search_path = graph, objects, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_review text;
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
END $$ LANGUAGE plpgsql;
