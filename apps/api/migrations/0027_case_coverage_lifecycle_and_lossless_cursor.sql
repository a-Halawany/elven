-- ============================================================
-- 0027 — CASE-COVERAGE LIFECYCLE, COMPATIBILITY, AND A LOSSLESS CURSOR.
--
-- A third bounded forward migration, answering the F3/F4 residuals raised
-- against e5f188ba. Additive throughout: 0024–0026 stand, no applied migration
-- is rewritten, and C18/C19 are untouched.
--
--   §1  a case-linked walk must be able to cover something the case corrected
--   §2  coverage is decided per root by the LATEST walk of that root, so a later
--       untruncated reassessment completes what an earlier truncated walk left —
--       and the earlier walk stays on record
--   §3  record_impact uses that arithmetic and counts only appropriate work
--   §4  every case 0026 marked `pending` by default is RECONCILED from the
--       assessments it already carries, conservatively and with its history kept
--   §5  the outstanding-work index carries the composite cursor key
-- ============================================================

-- ============================================================
-- 1. A walk linked to a case must be compatible with that case.
-- ============================================================
/*
 * A Phase 1 correction supersedes EVIDENCE objects, and those are the roots a
 * case records in `affected_resolved`. The only walk that can cover such a root
 * is an `evidence_correction` walk OF that root: it is the trigger kind whose
 * closure runs evidence → derived claims → entities and edges. A `manual` or
 * `claim_correction` walk linked to the case reaches no evidence-derived claim
 * and covers nothing, and 0026 nevertheless counted it — so a case could be
 * completed by a walk that had not looked at what the case changed.
 *
 * A case that recorded NO roots has no corrected object to cover. Phase 1 never
 * applies such a case (an apply that resolves nothing is rejected), so these are
 * fixtures; a linked walk is accepted for them and, as in 0026, one untruncated
 * walk completes them — there is nothing else to wait for.
 */
CREATE OR REPLACE FUNCTION graph.open_invalidation(
  p_invalidation_id uuid, p_tenant uuid, p_domain uuid, p_trigger_kind text,
  p_trigger_object_id uuid, p_correction_case_id uuid, p_actor uuid,
  p_event_id uuid, p_correlation uuid
) RETURNS void
SECURITY DEFINER SET search_path = graph, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_state text; v_roots uuid[];
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.impact.propagate']);
  PERFORM observation.assert_scope(p_tenant, p_domain);

  IF p_correction_case_id IS NOT NULL THEN
    SELECT c.state,
           coalesce((SELECT array_agg(DISTINCT (x ->> 'object_id')::uuid)
                       FROM jsonb_array_elements(c.affected_resolved) x
                      WHERE x ? 'object_id'), ARRAY[]::uuid[])
      INTO v_state, v_roots
      FROM observation.correction_current c
     WHERE c.case_id = p_correction_case_id
       AND c.tenant_id = p_tenant AND c.domain_id = p_domain;
    IF v_state IS NULL THEN
      RAISE EXCEPTION 'impact rejected: no correction case % in this scope', p_correction_case_id
        USING ERRCODE = '23503';
    END IF;
    IF v_state <> 'applied' THEN
      RAISE EXCEPTION 'impact rejected: correction case % is % and has nothing applied to propagate',
        p_correction_case_id, v_state USING ERRCODE = '22023';
    END IF;
    IF array_length(v_roots, 1) IS NOT NULL THEN
      IF p_trigger_kind <> 'evidence_correction' THEN
        RAISE EXCEPTION 'impact rejected: a walk linked to correction case % must be an evidence_correction of an object the case superseded; a % walk reaches no evidence-derived claim and cannot cover a corrected root',
          p_correction_case_id, p_trigger_kind USING ERRCODE = '22023';
      END IF;
      IF NOT (p_trigger_object_id = ANY (v_roots)) THEN
        RAISE EXCEPTION 'impact rejected: % is not one of the % object(s) correction case % superseded, so a walk of it is not propagation work for that case',
          p_trigger_object_id, array_length(v_roots, 1), p_correction_case_id
          USING ERRCODE = '22023';
      END IF;
    END IF;
  END IF;

  INSERT INTO graph.invalidations_current (
    invalidation_id, scope, tenant_id, domain_id, trigger_kind, trigger_object_id,
    correction_case_id, opened_by, statement, state, correlation_id
  ) VALUES (
    p_invalidation_id, 'DOMAIN', p_tenant, p_domain, p_trigger_kind, p_trigger_object_id,
    p_correction_case_id, p_actor,
    'dependency walk opened; nothing has been assessed yet', 'open', p_correlation);
  INSERT INTO graph.invalidation_events (
    event_id, scope, tenant_id, domain_id, invalidation_id, event, actor_principal_id,
    details, correlation_id
  ) VALUES (
    p_event_id, 'DOMAIN', p_tenant, p_domain, p_invalidation_id, 'invalidation.opened',
    p_actor, jsonb_build_object('trigger_kind', p_trigger_kind,
                                'trigger_object_id', p_trigger_object_id,
                                'correction_case_id', p_correction_case_id),
    p_correlation);
END $$ LANGUAGE plpgsql;

-- ============================================================
-- 2. Coverage, decided per root by the latest walk of that root.
-- ============================================================
/*
 * 0026 asked two questions of a case: "is every root covered by SOME untruncated
 * walk?" and "was ANY walk against the case ever truncated?" — and the second
 * made an early truncated walk a permanent block on completion, however many
 * clean walks followed. The question that describes the work is per root: what
 * did the LATEST walk of this root find? A root is covered when its latest walk
 * completed; an earlier truncated walk of the same root stays on record, and a
 * later truncated walk (the graph grew) reopens it.
 *
 * Only `evidence_correction` walks of a root count, for the reason §1 gives.
 *
 * This is a pure computation over the case's own record, used by both
 * `record_impact` (each time a walk lands) and the reconciliation in §4 (once,
 * for rows that predate it). One definition, so the two cannot disagree.
 */
CREATE OR REPLACE FUNCTION graph.case_propagation_coverage(p_case uuid)
RETURNS TABLE (
  state text, sentence text, roots int, covered int, missing int, truncated_latest int,
  assessments int, latest_assessment uuid
)
SET search_path = graph, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE
  v_roots uuid[]; v_covered int := 0; v_trunc int := 0; v_n int; v_assessments int;
  v_latest uuid; v_latest_statement text; v_latest_trunc boolean; v_any_clean boolean;
  v_state text; v_sentence text;
BEGIN
  SELECT coalesce((SELECT array_agg(DISTINCT (x ->> 'object_id')::uuid)
                     FROM jsonb_array_elements(c.affected_resolved) x
                    WHERE x ? 'object_id'), ARRAY[]::uuid[])
    INTO v_roots
    FROM observation.correction_current c WHERE c.case_id = p_case;
  IF v_roots IS NULL THEN
    RETURN;  -- no such case: nothing to say
  END IF;
  v_n := coalesce(array_length(v_roots, 1), 0);

  SELECT count(*) INTO v_assessments
    FROM graph.invalidations_current i
   WHERE i.correction_case_id = p_case AND i.state = 'assessed';

  -- The latest assessed walk against the case, whatever its kind.
  SELECT i.invalidation_id, i.statement, i.truncated
    INTO v_latest, v_latest_statement, v_latest_trunc
    FROM graph.invalidations_current i
   WHERE i.correction_case_id = p_case AND i.state = 'assessed'
   ORDER BY i.assessed_at DESC NULLS LAST, i.invalidation_id DESC
   LIMIT 1;

  IF v_n = 0 THEN
    -- No corrected object was recorded, so there is nothing to cover: one
    -- untruncated walk completes it, exactly as before.
    SELECT EXISTS (SELECT 1 FROM graph.invalidations_current i
                    WHERE i.correction_case_id = p_case AND i.state = 'assessed'
                      AND i.truncated IS NOT TRUE) INTO v_any_clean;
    IF v_assessments = 0 THEN
      v_state := 'pending'; v_sentence := NULL;
    ELSIF v_any_clean THEN
      v_state := 'complete';
      SELECT i.invalidation_id, i.statement INTO v_latest, v_sentence
        FROM graph.invalidations_current i
       WHERE i.correction_case_id = p_case AND i.state = 'assessed'
         AND i.truncated IS NOT TRUE
       ORDER BY i.assessed_at DESC NULLS LAST, i.invalidation_id DESC LIMIT 1;
    ELSE
      v_state := 'partial';
      v_sentence := 'propagation incomplete: this case recorded no corrected object, and every '
        || 'walk linked to it reached its traversal bound and left dependency paths unexplored';
    END IF;
  ELSE
    -- Per root: the latest evidence_correction walk of THAT root.
    SELECT count(*) FILTER (WHERE l.truncated IS NOT TRUE),
           count(*) FILTER (WHERE l.truncated IS TRUE)
      INTO v_covered, v_trunc
      FROM unnest(v_roots) AS root
      CROSS JOIN LATERAL (
        SELECT i.truncated
          FROM graph.invalidations_current i
         WHERE i.correction_case_id = p_case AND i.state = 'assessed'
           AND i.trigger_kind = 'evidence_correction' AND i.trigger_object_id = root
         ORDER BY i.assessed_at DESC NULLS LAST, i.invalidation_id DESC
         LIMIT 1) l;
    IF v_assessments = 0 THEN
      v_state := 'pending'; v_sentence := NULL;
    ELSIF v_covered = v_n THEN
      v_state := 'complete';
      v_sentence := CASE WHEN v_n = 1 THEN v_latest_statement
        ELSE format('propagation complete: all %s corrected object(s) walked without truncation; '
                    || 'latest assessment %s — %s', v_n, v_latest, v_latest_statement) END;
    ELSE
      v_state := 'partial';
      v_sentence := CASE
        WHEN v_covered + v_trunc = 0 THEN
          format('propagation incomplete: %s assessment(s) are linked to this case but none walked '
                 || 'one of its %s corrected object(s) as an evidence correction; the corrected '
                 || 'objects remain unassessed', v_assessments, v_n)
        WHEN v_trunc > 0 AND v_covered + v_trunc < v_n THEN
          format('propagation incomplete: %s of %s corrected object(s) have been walked, the latest '
                 || 'walk of %s of them reached its traversal bound, and %s remain unassessed',
                 v_covered + v_trunc, v_n, v_trunc, v_n - v_covered - v_trunc)
        WHEN v_trunc > 0 THEN
          format('propagation incomplete: every one of the %s corrected object(s) has been walked, '
                 || 'but the latest walk of %s of them reached its traversal bound and left '
                 || 'dependency paths unexplored; walk them again once the chain is within the bound',
                 v_n, v_trunc)
        ELSE
          format('propagation incomplete: %s of %s corrected object(s) have been walked; %s '
                 || 'remain unassessed', v_covered, v_n, v_n - v_covered)
      END;
    END IF;
  END IF;

  RETURN QUERY SELECT v_state, v_sentence, v_n, v_covered, v_n - v_covered - v_trunc, v_trunc,
                      v_assessments, v_latest;
END $$ LANGUAGE plpgsql STABLE;
REVOKE ALL ON FUNCTION graph.case_propagation_coverage(uuid) FROM PUBLIC;

-- ============================================================
-- 3. record_impact counts only appropriate work, through §2.
-- ============================================================
CREATE OR REPLACE FUNCTION graph.record_impact(
  p_invalidation_id uuid, p_tenant uuid, p_domain uuid,
  p_assumptions jsonb, p_objectives jsonb, p_decisions jsonb, p_commitments jsonb,
  p_statement text, p_truncated boolean, p_unexplored jsonb,
  p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS void
SECURITY DEFINER SET search_path = graph, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE
  v_case uuid; cov record;
  v_cov_state text; v_cov_roots int := 0; v_cov_covered int := 0; v_cov_outstanding int := 0;
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
    SELECT * INTO cov FROM graph.case_propagation_coverage(v_case);
    -- The walk just recorded is an assessment, so the case is never still pending.
    v_cov_state := coalesce(cov.state, 'partial');
    v_cov_roots := coalesce(cov.roots, 0);
    v_cov_covered := coalesce(cov.covered, 0);
    v_cov_outstanding := coalesce(cov.missing, 0) + coalesce(cov.truncated_latest, 0);
    UPDATE observation.correction_current
       SET propagation_unresolved = coalesce(cov.sentence, p_statement),
           propagation_assessment_id = p_invalidation_id,
           propagation_state = v_cov_state
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
      'correction_case_id', v_case, 'case_propagation_state', v_cov_state,
      'roots', v_cov_roots, 'roots_covered', v_cov_covered,
      'roots_outstanding', v_cov_outstanding, 'statement', p_statement),
    p_correlation);
END $$ LANGUAGE plpgsql;

-- ============================================================
-- 4. Reconcile the rows 0026 left at their default.
-- ============================================================
/*
 * 0026 added `propagation_state` with DEFAULT 'pending' and reconciled nothing,
 * so a case assessed under 0024 or 0025 — an assessment already linked, a
 * statement already written — read as "no dependency walk has run". That is
 * false, and the outstanding-work surface repeated it.
 *
 * Reconciliation is CONSERVATIVE: it never invents coverage. A case reaches
 * `complete` only by the §2 arithmetic over the assessments it actually carries;
 * an assessment of the wrong kind leaves the case `partial` and says why; a case
 * with no assessment stays `pending` and keeps Phase 1's own sentence untouched.
 *
 * And it is RECORDED: every change of state or sentence is written to an
 * append-only ledger with what stood before, so the reconciliation is itself
 * history rather than a silent rewrite.
 */
CREATE TABLE graph.propagation_reconciliations (
  reconciliation_id  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope              text NOT NULL DEFAULT 'DOMAIN',
  case_id            uuid NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  previous_state     text NOT NULL,
  new_state          text NOT NULL,
  previous_sentence  text NOT NULL,
  new_sentence       text NOT NULL,
  roots              int  NOT NULL,
  roots_covered      int  NOT NULL,
  assessments        int  NOT NULL,
  reconciled_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  reason             text NOT NULL,
  CONSTRAINT prop_recon_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX prop_recon_case ON graph.propagation_reconciliations (case_id, reconciled_at);
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON graph.propagation_reconciliations
  FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
-- Under the same isolation as every other graph table (0024 §9).
ALTER TABLE graph.propagation_reconciliations ENABLE ROW LEVEL SECURITY;
ALTER TABLE graph.propagation_reconciliations FORCE ROW LEVEL SECURITY;
CREATE POLICY graph_isolation ON graph.propagation_reconciliations
  USING (tenant_id = public.eye_tenant()
         AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain()));
GRANT SELECT ON graph.propagation_reconciliations TO eye_app, eye_commit;
COMMENT ON TABLE graph.propagation_reconciliations IS
  'what reconciliation changed on a correction case and from what — append-only';

CREATE OR REPLACE FUNCTION graph.reconcile_case_propagation(p_case uuid)
RETURNS text
SET search_path = graph, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE c record; cov record; v_new_state text; v_new_sentence text;
BEGIN
  SELECT case_id, tenant_id, domain_id, state, propagation_state, propagation_unresolved,
         propagation_assessment_id
    INTO c FROM observation.correction_current WHERE case_id = p_case;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'reconcile rejected: no such correction case %', p_case USING ERRCODE = '23503';
  END IF;
  IF c.state <> 'applied' THEN
    RETURN c.propagation_state;  -- nothing applied, nothing to propagate, nothing to reconcile
  END IF;
  SELECT * INTO cov FROM graph.case_propagation_coverage(p_case);
  v_new_state := coalesce(cov.state, 'pending');
  -- A pending case keeps whatever sentence it has: Phase 1's own record.
  v_new_sentence := CASE WHEN v_new_state = 'pending' THEN c.propagation_unresolved
                         ELSE coalesce(cov.sentence, c.propagation_unresolved) END;
  IF v_new_state IS DISTINCT FROM c.propagation_state
     OR v_new_sentence IS DISTINCT FROM c.propagation_unresolved
     OR (v_new_state <> 'pending' AND cov.latest_assessment IS DISTINCT FROM c.propagation_assessment_id) THEN
    INSERT INTO graph.propagation_reconciliations (
      case_id, tenant_id, domain_id, previous_state, new_state, previous_sentence,
      new_sentence, roots, roots_covered, assessments, reason)
    VALUES (c.case_id, c.tenant_id, c.domain_id, c.propagation_state, v_new_state,
            c.propagation_unresolved, v_new_sentence, coalesce(cov.roots, 0),
            coalesce(cov.covered, 0), coalesce(cov.assessments, 0),
            'reconciled from the assessments recorded against the case (0027)');
    UPDATE observation.correction_current
       SET propagation_state = v_new_state,
           propagation_unresolved = v_new_sentence,
           propagation_assessment_id = CASE WHEN v_new_state = 'pending'
                                            THEN propagation_assessment_id
                                            ELSE coalesce(cov.latest_assessment, propagation_assessment_id) END
     WHERE case_id = p_case;
  END IF;
  RETURN v_new_state;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION graph.reconcile_case_propagation(uuid) FROM PUBLIC;

-- Every applied case, once, now.
DO $$
DECLARE r record; n int := 0;
BEGIN
  FOR r IN SELECT case_id FROM observation.correction_current WHERE state = 'applied'
  LOOP
    PERFORM graph.reconcile_case_propagation(r.case_id);
    n := n + 1;
  END LOOP;
  RAISE NOTICE '0027: reconciled propagation state on % applied correction case(s)', n;
END $$;

COMMENT ON COLUMN observation.correction_current.propagation_state IS
  'pending = no walk has run; partial = walked but with roots uncovered or whose latest walk was '
  'truncated; complete = the latest walk of every recorded root finished without truncation';

-- ============================================================
-- 5. The outstanding-work index carries the composite cursor key.
-- ============================================================
/*
 * A cursor of `received_at` alone with a strict `<` skips every other case that
 * shares the instant. The key is (received_at, case_id), both descending, and
 * the index matches it so the page and the continuation are the same order.
 */
DROP INDEX IF EXISTS observation.corr_propagation_outstanding;
CREATE INDEX corr_propagation_outstanding
  ON observation.correction_current (tenant_id, domain_id, received_at DESC, case_id DESC)
  WHERE state = 'applied' AND propagation_state <> 'complete';
