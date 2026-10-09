-- ═════════════════════════════════════════════════════════════════════
-- section `twin` (§TW) — CP-6 B33 part `twin`, the twin pieces (the part file 0111_b33_x_twin.sql; it applies alone after 0111 §0 and is folded
-- into 0111 in the apply order §0, §TW, §SC, §PK, §CI). F-P5-03 COMPLETES (merges between non-actual branches, the scenario citation, the
-- scenario-element web form); F-P5-02 and F-P5-04 ADVANCE (the estimate citation, the cross-twin dependency check before publish, the topology
-- harness, the routed items closed on decision, open_run's envelope refusal wording). Prefix `twx_`. Every figure a harness or an act seeds
-- here is SYNTHETIC (NORDWERK's data is the demonstration's).
--
--   §TW1  MERGES BETWEEN NON-ACTUAL BRANCHES: twin.branch_merges.target_branch a branch name ≠ the source (the source is never actual:
--         refreshing a branch FROM actual is a draft carrying from actual, not a merge); tbr_bm_one_live → (twin, source, target),
--         tbr_bm_one_completing → (twin, target); twin.twx_common_base (the nearest common version through forked_from_version) the base of a
--         merge between two non-actual branches (into actual the base stays the fork point — B30's rule, unchanged). RE-DECLARED, each copied
--         whole with the change marked `B33 twin`: twin.open_merge (a NEW overload naming the target; the nine-argument B30 signature kept as a
--         wrapper passing 'actual'), twin.resolve_merge_key (the scenario refusal only into actual), twin.complete_merge (heads, draft and plan
--         on the target), twin.tbr_merge_admitted (+ its trigger, on any branch: the merge INTO the admitted branch), twin.tbr_merge_bypass
--         (generalised to the target). The merge's twin.reconciliation item CLOSED when the merge is merged, refused or withdrawn (trigger
--         twx_merge_item_closes — recommended by MAP TW1, the same idiom as TW7).
--   §TW2  THE SCENARIO CITATION (0111 §0.4's kind): grounded by the scenario-element route (TS, BranchService.groundScenario) — the SCN object
--         exact in this domain, the branch a branch of that scenario and open; tbr_scenario_basis already counts it. No SQL here.
--   §TW3  THE SCENARIO-ELEMENT WEB FORM: web only (apps/web/app/twins/explorer, apps/web/lib/branches-b30.ts's `B33 twin` block).
--   §TW4  THE ESTIMATE CITATION (0111 §0.4's kind): twin.decide_estimate RE-DECLARED (LAST 0106:130, copied whole): the admitted element carries
--         exactly this estimate's citation {kind: estimate, id, version 1, digest: inputs_digest} — else `estimate rejected (citation)` (422).
--   §TW5  THE CROSS-TWIN DEPENDENCY CHECK BEFORE PUBLISH (V03-T-308): twin.propose_estimate RE-DECLARED (0103:2502, copied whole): the head's
--         dependency read (twin.version_freshness) — uncertain → an ambiguity reason per upstream (no_head / stale / unverified / behind),
--         recorded in constraint_check.dependency; the decision (§TW4's port) re-reads it at publication: no head / unverified →
--         `estimate rejected (dependency)` (409), stale / behind → the owner's note.
--   §TW6  THE TOPOLOGY RULE ON A ROUTE-BEARING HEAD: harness only (phase6-twin-b33 TW6) — no SQL.
--   §TW7  THE ITEMS CLOSED ON DECISION (triggers; no port re-declared — the siv_run_* precedent; each writes attention rows only, in the deciding
--         act's own transaction, through the prelude's executive.b33_close_items / b33_raise_routed — R4): the routed estimate item
--         (twin.reconciliation / twin_estimate) closed when the estimate is approved, declined or superseded; the exploratory admission's item
--         (twin.envelope / run) closed by the method steward's concurrence; a NEW twin.envelope item raised when a run FINISHES OUTSIDE its
--         envelope — "awaiting a twin owner's exploratory admission", named owner the twin's owner, routed under the domain's published
--         policy — closed by the exploratory admission or by the run's retirement.
--         INTERPRETATION (confirmed by the coordinator, B33): F-P5-04's "an item on the completion of an OUTSIDE run" is this NEW item — 0103
--         §0.1 names "an outside-envelope run awaiting exploratory admission" for twin.envelope, and nothing raised it before B33.
--   §TW8  simulation.open_run RE-DECLARED (LAST 0092:1888-2131, copied whole): the two envelope refusal texts name the holder B30 made it —
--         a twin owner (no longer "or the domain administrator").
--
-- Forward only; 0001–0110 and 0111 §0 untouched; the prelude's objects USED, never re-declared. No event is added to twin.twin_events,
-- simulation.run_events or simulation.experiment_events: the merge lifecycle stays in twin.branch_events, the estimate's in
-- twin.estimation_events; the items' in executive.attention_item_events (item.routed / item.deprioritized / item.closed). Default-off: a merge
-- into actual, an estimate on a twin with no upstream link and a run inside its envelope behave and answer exactly as before (one exception,
-- by design: an outside-envelope run's completion now raises its awaiting-admission item — MAP R6 names the pins it moves).
-- ═════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────
-- §TW1 MERGES BETWEEN NON-ACTUAL BRANCHES
-- ─────────────────────────────────────────────────────────────────────
/* The TARGET is actual (B30) or another branch of the twin, never the source (0103:189's CHECK (target_branch = 'actual') dropped). The source
   stays ≠ actual (0103:188, unchanged). Every row before B33 targets actual and stays valid. */
ALTER TABLE twin.branch_merges DROP CONSTRAINT branch_merges_target_branch_check;
ALTER TABLE twin.branch_merges ADD CONSTRAINT twx_bm_target CHECK (target_branch ~ '^[a-z][a-z0-9-]{0,40}$' AND target_branch <> source_branch);
/* One live merge per (source, target) — was per source; one completing merge per TARGET — was per twin (each target is held by its own). */
DROP INDEX twin.tbr_bm_one_live;
CREATE UNIQUE INDEX tbr_bm_one_live ON twin.branch_merges (twin_id, source_branch, target_branch) WHERE state IN ('open', 'reconciled', 'completing');
DROP INDEX twin.tbr_bm_one_completing;
CREATE UNIQUE INDEX tbr_bm_one_completing ON twin.branch_merges (twin_id, target_branch) WHERE state = 'completing';

/* A branch head's LINEAGE: the admitted versions the head descends from — the branch's own admitted versions up to the head, then, at its fork
   point (the forked_from_version of the branch's FIRST version, tbr_fork_base's rule), the lineage of the version it forked from, recursively
   (bounded at 64 forks). */
CREATE OR REPLACE FUNCTION twin.twx_lineage(p_twin uuid, p_branch text, p_upto int) RETURNS TABLE (version int)
LANGUAGE sql STABLE SET search_path = twin, pg_catalog, pg_temp AS $$
  WITH RECURSIVE l(branch_id, upto, depth) AS (
    SELECT p_branch, p_upto, 0 WHERE p_upto IS NOT NULL
    UNION ALL
    SELECT fv.branch_id, fv.version, l.depth + 1
      FROM l
      CROSS JOIN LATERAL (SELECT v.forked_from_version AS f FROM twin.twin_versions v WHERE v.twin_id = p_twin AND v.branch_id = l.branch_id ORDER BY v.version LIMIT 1) first
      JOIN twin.twin_versions fv ON fv.twin_id = p_twin AND fv.version = first.f
     WHERE l.depth < 64)
  SELECT DISTINCT v.version FROM l JOIN twin.twin_versions v ON v.twin_id = p_twin AND v.branch_id = l.branch_id AND v.version <= l.upto AND v.state = 'admitted'
$$;
/* THE COMMON BASE of two branches: the NEAREST common version of their heads' lineages (the highest version both descend from; NULL when they
   share none — then every differing key is the source's change, tbr_diverging's NULL-base rule). Into actual a merge keeps B30's base (the
   source's fork point); between two non-actual branches this is the base. */
CREATE OR REPLACE FUNCTION twin.twx_common_base(p_twin uuid, p_a text, p_b text) RETURNS int
LANGUAGE sql STABLE SET search_path = twin, pg_catalog, pg_temp AS $$
  SELECT max(a.version) FROM twin.twx_lineage(p_twin, p_a, twin.tbr_head(p_twin, p_a)) a JOIN twin.twx_lineage(p_twin, p_b, twin.tbr_head(p_twin, p_b)) b ON b.version = a.version
$$;
REVOKE ALL ON FUNCTION twin.twx_lineage(uuid, text, int), twin.twx_common_base(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION twin.twx_lineage(uuid, text, int), twin.twx_common_base(uuid, text, text) TO eye_app, eye_commit;


/* OPEN A MERGE (twin.branch.merge) — 0103:508 copied whole, the B33 twin changes marked: a NEW OVERLOAD naming the TARGET branch. A holder of
   the action asks to merge branch X into a target — `actual` (B30's merge, unchanged: the base is X's fork point) or ANOTHER non-actual branch
   (B33: the base is the two heads' nearest common version, twin.twx_common_base); the server computes the diverging keys from the two admitted
   heads and the base and routes twin.reconciliation to the twin's owner. The source is never actual: refreshing a branch FROM actual is a
   draft on the branch carrying from actual, not a merge. */
CREATE OR REPLACE FUNCTION twin.open_merge(
  p_merge_id uuid, p_twin uuid, p_tenant uuid, p_domain uuid, p_source_branch text, p_target_branch text, p_reason text, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = twin, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE t twin.twins_current%ROWTYPE; v_src int; v_tgt int; v_base int; v_div jsonb; m twin.branch_merges%ROWTYPE; v_ev uuid; v_item uuid; v_live uuid;
        v_target text := coalesce(p_target_branch, 'actual');   -- B33 twin
BEGIN
  PERFORM observation.assert_authority(ARRAY['twin.branch.merge']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'branch merge rejected (actor): recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  t := twin.tbr_twin(p_twin, p_tenant, p_domain, 'branch merge');
  PERFORM 1 FROM twin.twins_current x WHERE x.twin_id = p_twin FOR UPDATE;
  IF p_source_branch IS NULL OR p_source_branch !~ '^[a-z][a-z0-9-]{0,40}$' OR p_source_branch = 'actual' THEN
    IF v_target = 'actual' THEN   -- B33 twin: B30's text for a merge into actual, word for word
      RAISE EXCEPTION 'branch merge rejected (branch): a merge takes a branch other than actual back into actual' USING ERRCODE = '22023';
    END IF;
    RAISE EXCEPTION 'branch merge rejected (branch): a merge takes a branch other than actual into another branch; refreshing a branch FROM actual is not a merge (open a draft on the branch carrying from actual)' USING ERRCODE = '22023';   -- B33 twin
  END IF;
  -- B33 twin: the target is actual or another branch of the twin, never the source itself
  IF v_target !~ '^[a-z][a-z0-9-]{0,40}$' OR v_target = p_source_branch THEN
    RAISE EXCEPTION 'branch merge rejected (branch): the target is actual or another branch of the twin than the source (%)', p_source_branch USING ERRCODE = '22023';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 8 AND 2000 THEN
    RAISE EXCEPTION 'branch merge rejected (reason): a merge says why (8 to 2000 characters)' USING ERRCODE = '22023';
  END IF;
  v_src := twin.tbr_head(p_twin, p_source_branch);
  IF v_src IS NULL THEN RAISE EXCEPTION 'branch merge rejected (unknown_branch): branch % of this twin has no admitted version', p_source_branch USING ERRCODE = '23503'; END IF;
  v_tgt := twin.tbr_head(p_twin, v_target);   -- B33 twin: the target's head
  IF v_tgt IS NULL THEN
    IF v_target = 'actual' THEN RAISE EXCEPTION 'branch merge rejected (unknown_branch): actual has no admitted version to merge into' USING ERRCODE = '23503'; END IF;
    RAISE EXCEPTION 'branch merge rejected (unknown_branch): branch % of this twin has no admitted version to merge into', v_target USING ERRCODE = '23503';   -- B33 twin
  END IF;
  -- B33 twin: one live merge per (source, target)
  SELECT x.merge_id INTO v_live FROM twin.branch_merges x WHERE x.twin_id = p_twin AND x.source_branch = p_source_branch AND x.target_branch = v_target AND x.state IN ('open', 'reconciled', 'completing');
  IF FOUND THEN
    IF v_target = 'actual' THEN RAISE EXCEPTION 'branch merge rejected (duplicate): branch % already has merge % in progress', p_source_branch, v_live USING ERRCODE = '23505'; END IF;
    RAISE EXCEPTION 'branch merge rejected (duplicate): branch % already has merge % into % in progress', p_source_branch, v_live, v_target USING ERRCODE = '23505';   -- B33 twin
  END IF;
  -- B33 twin: into actual the base stays the branch's fork point (B30); between two non-actual branches it is their nearest common version
  v_base := CASE WHEN v_target = 'actual' THEN twin.tbr_fork_base(p_twin, p_source_branch) ELSE twin.twx_common_base(p_twin, p_source_branch, v_target) END;
  v_div := twin.tbr_diverging(p_twin, v_src, v_tgt, v_base);
  IF jsonb_array_length(v_div) = 0 THEN
    RAISE EXCEPTION 'branch merge rejected (state): branch % (v%) changes nothing that differs from % (v%); there is nothing to merge', p_source_branch, v_src, v_target, v_tgt USING ERRCODE = '22023';   -- B33 twin: the target named
  END IF;
  INSERT INTO twin.branch_merges (merge_id, scope, tenant_id, domain_id, twin_id, source_branch, target_branch, source_version, target_version, base_version, diverging, state, reason, opened_by, correlation_id)
  VALUES (p_merge_id, 'DOMAIN', p_tenant, p_domain, p_twin, p_source_branch, v_target /* B33 twin */, v_src, v_tgt, v_base, v_div, 'open', btrim(p_reason), p_actor, p_correlation)
  RETURNING * INTO m;
  v_ev := twin.tbr_event(p_tenant, p_domain, p_twin, p_merge_id, 'merge.opened', p_actor,
    jsonb_build_object('source_branch', p_source_branch, 'source_version', v_src, 'target_version', v_tgt, 'base_version', v_base,
                       'diverging_keys', (SELECT jsonb_agg(d -> 'key') FROM jsonb_array_elements(v_div) d), 'reason', btrim(p_reason))
    || CASE WHEN v_target = 'actual' THEN '{}'::jsonb ELSE jsonb_build_object('target_branch', v_target, 'base', 'common_version') END,   -- B33 twin: B30's details unchanged for actual
    p_correlation, p_event_id);
  v_item := twin.tbr_notify(p_tenant, p_domain, 'twin.reconciliation', 'twin_branch', p_merge_id,
    format('Merge of branch %s into %s awaits reconciliation of %s diverging key(s) — %s', p_source_branch, v_target /* B33 twin */, jsonb_array_length(v_div), t.title),
    jsonb_build_array('merge_requires_reconciliation'), t.owner_principal_id, v_ev, 'twin.branch_merge.opened',
    jsonb_build_object('twin_id', p_twin, 'merge_id', p_merge_id, 'source_branch', p_source_branch, 'diverging', jsonb_array_length(v_div))
    || CASE WHEN v_target = 'actual' THEN '{}'::jsonb ELSE jsonb_build_object('target_branch', v_target) END,   -- B33 twin
    interval '3 days', p_actor, p_correlation);
  RETURN (to_jsonb(m) - 'scope' - 'tenant_id' - 'domain_id') || jsonb_build_object('unresolved', to_jsonb(twin.tbr_unresolved(p_merge_id)), 'attention_item_id', v_item);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION twin.open_merge(uuid,uuid,uuid,uuid,text,text,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION twin.open_merge(uuid,uuid,uuid,uuid,text,text,text,uuid,uuid,uuid) TO eye_commit;

/* The B30 signature (0103:508) kept as a WRAPPER passing 'actual' — B30's TS, harness and any caller of the nine-argument port stand
   unchanged (same answers, same refusals). */
CREATE OR REPLACE FUNCTION twin.open_merge(
  p_merge_id uuid, p_twin uuid, p_tenant uuid, p_domain uuid, p_source_branch text, p_reason text, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY INVOKER SET search_path = twin, pg_catalog, pg_temp AS $$
  SELECT twin.open_merge(p_merge_id, p_twin, p_tenant, p_domain, p_source_branch, 'actual'::text, p_reason, p_actor, p_event_id, p_correlation)
$$ LANGUAGE sql;
REVOKE ALL ON FUNCTION twin.open_merge(uuid,uuid,uuid,uuid,text,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION twin.open_merge(uuid,uuid,uuid,uuid,text,text,uuid,uuid,uuid) TO eye_commit;

/* RESOLVE ONE DIVERGING KEY (twin.branch.reconcile) — 0103:552 copied whole, the B33 twin change marked: the scenario refusal applies only when
   the merge's target is actual (a scenario value moves between scenario branches). */
CREATE OR REPLACE FUNCTION twin.resolve_merge_key(
  p_merge uuid, p_tenant uuid, p_domain uuid, p_key text, p_resolution text, p_kind text, p_value jsonb, p_unit text, p_citations jsonb, p_note text,
  p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = twin, objects, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE m twin.branch_merges%ROWTYPE; t twin.twins_current%ROWTYPE; d jsonb; c jsonb; v_ord int; v_unres text[];
BEGIN
  PERFORM observation.assert_authority(ARRAY['twin.branch.reconcile']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT * INTO m FROM twin.branch_merges x WHERE x.merge_id = p_merge AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'branch merge rejected (unknown_merge): % is not a merge of this domain', p_merge USING ERRCODE = '23503'; END IF;
  t := twin.tbr_twin(m.twin_id, p_tenant, p_domain, 'branch merge');
  PERFORM twin.tbr_assert_owner(t, p_actor, 'branch merge', 'reconciling a merge');
  IF m.state NOT IN ('open', 'reconciled') THEN
    RAISE EXCEPTION 'branch merge rejected (state): merge % is %; a key is resolved while the merge is open or reconciled', p_merge, m.state USING ERRCODE = '2F002';
  END IF;
  SELECT x INTO d FROM jsonb_array_elements(m.diverging) x WHERE x ->> 'key' = p_key;
  IF d IS NULL THEN RAISE EXCEPTION 'branch merge rejected (unknown_key): % is not a diverging key of merge %', p_key, p_merge USING ERRCODE = '23503'; END IF;
  IF p_resolution IS NULL OR p_resolution NOT IN ('keep_target', 'take_branch', 'reconciled') THEN
    RAISE EXCEPTION 'branch merge rejected (resolution): a key is resolved keep_target, take_branch or reconciled' USING ERRCODE = '22023';
  END IF;
  IF p_note IS NULL OR length(btrim(p_note)) NOT BETWEEN 8 AND 2000 THEN
    RAISE EXCEPTION 'branch merge rejected (note): a resolution says why (8 to 2000 characters)' USING ERRCODE = '22023';
  END IF;
  -- B33 twin: a scenario value never becomes ACTUAL state; between two scenario branches it moves (take_branch into a non-actual target)
  IF p_resolution = 'take_branch' AND (d -> 'source' ->> 'kind') = 'scenario' AND m.target_branch = 'actual' THEN
    RAISE EXCEPTION 'branch merge rejected (scenario): % is a SCENARIO value on branch %; a scenario value does not become actual state — keep actual''s value or reconcile it with evidence', p_key, m.source_branch USING ERRCODE = '22023';
  END IF;
  IF p_resolution <> 'reconciled' THEN
    IF p_value IS NOT NULL OR p_kind IS NOT NULL OR coalesce(jsonb_array_length(p_citations), 0) > 0 THEN
      RAISE EXCEPTION 'branch merge rejected (resolution): only a reconciled key states a value, a kind and citations' USING ERRCODE = '22023';
    END IF;
  ELSE
    IF p_kind IS NULL OR p_kind NOT IN ('assumed', 'estimated') THEN
      RAISE EXCEPTION 'branch merge rejected (kind): a reconciled value is assumed or estimated — the owner''s judgement, never observed' USING ERRCODE = '22023';
    END IF;
    IF p_value IS NULL OR jsonb_typeof(p_value) = 'null' THEN RAISE EXCEPTION 'branch merge rejected (value): a reconciled key states its value' USING ERRCODE = '22023'; END IF;
    IF NOT twin.citations_ok(p_citations) OR jsonb_array_length(p_citations) = 0 OR twin.citation_count(p_citations, 'claim') > 0
       OR twin.citation_count(p_citations, 'evidence') + twin.citation_count(p_citations, 'assumption') = 0 THEN
      RAISE EXCEPTION 'branch merge rejected (citations): a reconciled value cites the evidence or the assumption it rests on — exact {kind, id, version, digest}' USING ERRCODE = '22023';
    END IF;
    FOR c IN SELECT * FROM jsonb_array_elements(p_citations) LOOP
      IF (c ->> 'kind') <> 'entity' AND NOT EXISTS (SELECT 1 FROM objects.canonical_objects o
           WHERE o.object_id = (c ->> 'id')::uuid AND o.object_version = (c ->> 'version')::int AND o.content_digest = (c ->> 'digest')
             AND o.tenant_id = p_tenant AND o.domain_id = p_domain) THEN
        RAISE EXCEPTION 'branch merge rejected (unknown_citation): % %@% is not an exact object of this domain', c ->> 'kind', c ->> 'id', c ->> 'version' USING ERRCODE = '23503';
      END IF;
    END LOOP;
  END IF;
  SELECT coalesce(max(r.ordinal), 0) + 1 INTO v_ord FROM twin.merge_resolutions r WHERE r.merge_id = p_merge AND r.key = p_key;
  INSERT INTO twin.merge_resolutions (merge_id, key, ordinal, scope, tenant_id, domain_id, resolution, kind, value, unit, citations, note, resolved_by, correlation_id)
  VALUES (p_merge, p_key, v_ord, 'DOMAIN', p_tenant, p_domain, p_resolution, CASE WHEN p_resolution = 'reconciled' THEN p_kind END,
          CASE WHEN p_resolution = 'reconciled' THEN p_value END, CASE WHEN p_resolution = 'reconciled' THEN p_unit END,
          CASE WHEN p_resolution = 'reconciled' THEN p_citations ELSE '[]'::jsonb END, btrim(p_note), p_actor, p_correlation);
  PERFORM twin.tbr_event(p_tenant, p_domain, m.twin_id, p_merge, 'merge.key_resolved', p_actor,
    jsonb_build_object('key', p_key, 'ordinal', v_ord, 'resolution', p_resolution, 'conflict', d -> 'conflict', 'change', d -> 'change'), p_correlation, p_event_id);
  v_unres := twin.tbr_unresolved(p_merge);
  IF cardinality(v_unres) = 0 AND m.state = 'open' THEN
    UPDATE twin.branch_merges SET state = 'reconciled' WHERE merge_id = p_merge;
    PERFORM twin.tbr_event(p_tenant, p_domain, m.twin_id, p_merge, 'merge.reconciled', p_actor,
      jsonb_build_object('keys', jsonb_array_length(m.diverging)), p_correlation);
  END IF;
  RETURN (SELECT (to_jsonb(x) - 'scope' - 'tenant_id' - 'domain_id') || jsonb_build_object('unresolved', to_jsonb(v_unres), 'key', p_key, 'ordinal', v_ord)
            FROM twin.branch_merges x WHERE x.merge_id = p_merge);
END $$ LANGUAGE plpgsql;

/* COMPLETE A MERGE (twin.branch.merge) — 0103:623 copied whole, the B33 twin changes marked: the heads compared, the open draft looked for and
   the plan's draft opened on the merge's TARGET branch (actual, or a non-actual branch); the words for actual unchanged. */
CREATE OR REPLACE FUNCTION twin.complete_merge(p_merge uuid, p_tenant uuid, p_domain uuid, p_actor uuid, p_event_id uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = twin, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE m twin.branch_merges%ROWTYPE; t twin.twins_current%ROWTYPE; v_unres text[]; v_draft int; v_expected jsonb; v_target jsonb; v_except text[]; v_ground jsonb;
        v_into text;   -- B33 twin: 'back into actual' or 'into <target>' (B30's words for actual)
BEGIN
  PERFORM observation.assert_authority(ARRAY['twin.branch.merge']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT * INTO m FROM twin.branch_merges x WHERE x.merge_id = p_merge AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'branch merge rejected (unknown_merge): % is not a merge of this domain', p_merge USING ERRCODE = '23503'; END IF;
  t := twin.tbr_twin(m.twin_id, p_tenant, p_domain, 'branch merge');
  PERFORM twin.tbr_assert_owner(t, p_actor, 'branch merge', 'completing a merge');
  IF m.state NOT IN ('open', 'reconciled', 'completing') THEN
    RAISE EXCEPTION 'branch merge rejected (state): merge % is %', p_merge, m.state USING ERRCODE = '2F002';
  END IF;
  v_into := CASE WHEN m.target_branch = 'actual' THEN 'back into actual' ELSE 'into ' || m.target_branch END;   -- B33 twin
  v_unres := twin.tbr_unresolved(p_merge);
  IF cardinality(v_unres) > 0 THEN
    RAISE EXCEPTION 'branch merge rejected (unreconciled): merging branch % % is refused until reconciliation — % of % diverging key(s) unresolved: %',   -- B33 twin: the target named
      m.source_branch, v_into, cardinality(v_unres), jsonb_array_length(m.diverging), array_to_string(v_unres, ', ') USING ERRCODE = '2F002';
  END IF;
  IF twin.tbr_head(m.twin_id, m.source_branch) IS DISTINCT FROM m.source_version OR twin.tbr_head(m.twin_id, m.target_branch) IS DISTINCT FROM m.target_version THEN   -- B33 twin: the target's head
    RAISE EXCEPTION 'branch merge rejected (stale): the heads moved since merge % was opened (branch % v% → v%, % v% → v%); withdraw it and open a new merge',
      p_merge, m.source_branch, m.source_version, twin.tbr_head(m.twin_id, m.source_branch), m.target_branch, m.target_version, twin.tbr_head(m.twin_id, m.target_branch) USING ERRCODE = '2F002';
  END IF;
  SELECT v.version INTO v_draft FROM twin.twin_versions v WHERE v.twin_id = m.twin_id AND v.branch_id = m.target_branch AND v.state = 'draft';   -- B33 twin: the draft on the target
  IF m.state <> 'completing' THEN
    IF v_draft IS NOT NULL THEN
      RAISE EXCEPTION 'branch merge rejected (state): % has an open draft v%; admit or withdraw it before the merge is completed', m.target_branch, v_draft USING ERRCODE = '2F002';   -- B33 twin
    END IF;
    UPDATE twin.branch_merges SET state = 'completing', completing_by = p_actor, completing_at = clock_timestamp() WHERE merge_id = p_merge;
    PERFORM twin.tbr_event(p_tenant, p_domain, m.twin_id, p_merge, 'merge.completing', p_actor,
      jsonb_build_object('target_version', m.target_version, 'source_version', m.source_version), p_correlation, p_event_id);
  ELSIF m.completing_by IS DISTINCT FROM p_actor THEN
    RAISE EXCEPTION 'branch merge rejected (state): merge % is being completed by %', p_merge, m.completing_by USING ERRCODE = '2F002';
  END IF;
  v_expected := twin.tbr_merge_expected(p_merge);
  v_target := twin.tbr_element_map(m.twin_id, m.target_version);
  SELECT coalesce(array_agg(k ORDER BY k), ARRAY[]::text[]) INTO v_except
    FROM (SELECT jsonb_object_keys(v_target) k) x WHERE (v_expected -> k) IS DISTINCT FROM (v_target -> k);
  SELECT coalesce(jsonb_agg(jsonb_build_object('key', r.key, 'resolution', r.resolution, 'kind', r.kind, 'value', r.value, 'unit', r.unit, 'citations', r.citations) ORDER BY r.key), '[]'::jsonb)
    INTO v_ground
    FROM twin.tbr_resolutions(p_merge) r
   WHERE (r.resolution = 'take_branch' AND v_expected ? r.key) OR r.resolution = 'reconciled';
  RETURN (SELECT (to_jsonb(x) - 'scope' - 'tenant_id' - 'domain_id') FROM twin.branch_merges x WHERE x.merge_id = p_merge)
         || jsonb_build_object('plan', jsonb_build_object('carry_from', m.target_version, 'except', to_jsonb(v_except), 'ground', v_ground, 'expected', v_expected,
                                                          'open_draft', v_draft, 'branch_id', m.target_branch /* B33 twin: the branch the draft opens on */));
END $$ LANGUAGE plpgsql;

/* THE MERGE'S ADMISSION — 0103:1009 copied whole, the B33 twin change marked: an admission on ANY branch while a merge INTO that branch is
   COMPLETING must carry its plan — then the merge is merged in the same transaction; otherwise the admission is refused (the target is held).
   The trigger is re-created WHEN any draft is admitted (was: on actual only). */
CREATE OR REPLACE FUNCTION twin.tbr_merge_admitted() RETURNS trigger
SECURITY DEFINER SET search_path = twin, pg_catalog, pg_temp AS $$
DECLARE m twin.branch_merges%ROWTYPE; v_expected jsonb; v_have jsonb; v_diff text[];
BEGIN
  SELECT * INTO m FROM twin.branch_merges x WHERE x.twin_id = NEW.twin_id AND x.state = 'completing' AND x.target_branch = NEW.branch_id FOR UPDATE;   -- B33 twin: the merge whose TARGET is this branch
  IF NOT FOUND THEN RETURN NEW; END IF;
  v_expected := twin.tbr_merge_expected(m.merge_id);
  v_have := twin.tbr_element_map(NEW.twin_id, NEW.version);
  SELECT coalesce(array_agg(k ORDER BY k), ARRAY[]::text[]) INTO v_diff
    FROM (SELECT jsonb_object_keys(v_expected) k UNION SELECT jsonb_object_keys(v_have)) x WHERE (v_expected -> k) IS DISTINCT FROM (v_have -> k);
  IF cardinality(v_diff) > 0 OR NEW.supersedes IS DISTINCT FROM m.target_version THEN
    RAISE EXCEPTION 'branch merge rejected (state): % is held by merge % (branch %) being completed; v% does not carry its reconciled plan (differs on: %)',   -- B33 twin: the target named
      NEW.branch_id, m.merge_id, m.source_branch, NEW.version, CASE WHEN cardinality(v_diff) = 0 THEN 'the version it supersedes' ELSE array_to_string(v_diff, ', ') END USING ERRCODE = '2F002';
  END IF;
  UPDATE twin.branch_merges SET state = 'merged', merged_version = NEW.version, merged_at = clock_timestamp() WHERE merge_id = m.merge_id;
  PERFORM twin.tbr_event(m.tenant_id, m.domain_id, m.twin_id, m.merge_id, 'merge.merged', public.eye_principal(),
    jsonb_build_object('merged_version', NEW.version, 'source_branch', m.source_branch, 'source_version', m.source_version, 'target_version', m.target_version,
                       'state_set_digest', NEW.state_set_digest), m.correlation_id);
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER tbr_merge_admitted ON twin.twin_versions;
CREATE TRIGGER tbr_merge_admitted AFTER UPDATE OF state ON twin.twin_versions
  FOR EACH ROW WHEN (OLD.state = 'draft' AND NEW.state = 'admitted' /* B33 twin: any branch (was: AND NEW.branch_id = 'actual') */) EXECUTE FUNCTION twin.tbr_merge_admitted();

/* NO MERGE AROUND THE MERGE — 0103:1034 copied whole, the B33 twin change marked (generalised to the target): a draft opened on branch T
   carrying from a version of branch S while a merge S → T is in progress is refused — merging S into T goes through its merge, refused until
   reconciliation. (Carry across branches stays open for every pair with no merge in progress.) */
CREATE OR REPLACE FUNCTION twin.tbr_merge_bypass() RETURNS trigger
SECURITY DEFINER SET search_path = twin, pg_catalog, pg_temp AS $$
DECLARE v_from text; m twin.branch_merges%ROWTYPE; v_to text := NEW.details ->> 'branch_id';   -- B33 twin
BEGIN
  IF v_to IS NULL OR NEW.details ->> 'carried_from' IS NULL THEN RETURN NEW; END IF;   -- B33 twin: a draft on ANY branch (was: on actual only)
  SELECT v.branch_id INTO v_from FROM twin.twin_versions v WHERE v.twin_id = NEW.twin_id AND v.version = (NEW.details ->> 'carried_from')::int;
  IF v_from IS NULL OR v_from = v_to THEN RETURN NEW; END IF;   -- B33 twin (was: v_from = 'actual'; a branch never merges from actual, so this is the same for a draft on actual)
  SELECT * INTO m FROM twin.branch_merges x WHERE x.twin_id = NEW.twin_id AND x.source_branch = v_from AND x.target_branch = v_to AND x.state IN ('open', 'reconciled', 'completing');   -- B33 twin: the merge from that branch INTO this one
  IF FOUND THEN
    RAISE EXCEPTION 'branch merge rejected (unreconciled): branch % has merge % in progress (%); merging it % goes through the merge, refused until reconciliation',
      v_from, m.merge_id, m.state, CASE WHEN v_to = 'actual' THEN 'back into actual' ELSE 'into ' || v_to END USING ERRCODE = '2F002';   -- B33 twin: the target named (B30's words for actual)
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

/* THE MERGE'S ITEM CLOSED (MAP TW1's recommendation, the TW7 idiom): when a merge is MERGED (tbr_merge_admitted's update, in the admission's
   transaction), REFUSED or WITHDRAWN (twin.close_merge's update), its twin.reconciliation item (subject twin_branch) is closed with the outcome
   as the reason — attention rows only, through the prelude's executive.b33_close_items. */
CREATE OR REPLACE FUNCTION twin.twx_merge_item_closes() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = twin, executive, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM executive.b33_close_items(NEW.tenant_id, NEW.domain_id, 'twin.reconciliation', 'twin_branch', NEW.merge_id,
    CASE NEW.state WHEN 'merged' THEN format('merge %s of branch %s into %s merged as v%s', NEW.merge_id, NEW.source_branch, NEW.target_branch, NEW.merged_version)
                   ELSE format('merge %s of branch %s into %s %s: %s', NEW.merge_id, NEW.source_branch, NEW.target_branch, NEW.state, NEW.close_reason) END,
    coalesce(NEW.closed_by, public.eye_principal(), NEW.completing_by, NEW.opened_by), NULL);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION twin.twx_merge_item_closes() FROM PUBLIC;
CREATE TRIGGER twx_merge_item_closes AFTER UPDATE OF state ON twin.branch_merges
  FOR EACH ROW WHEN (OLD.state IS DISTINCT FROM NEW.state AND NEW.state IN ('merged', 'refused', 'withdrawn')) EXECUTE FUNCTION twin.twx_merge_item_closes();

-- ─────────────────────────────────────────────────────────────────────
-- §TW2 / §TW3 THE SCENARIO CITATION AND THE SCENARIO-ELEMENT FORM — TS and web only (BranchService.groundScenario cites the SCN object beside
-- or instead of the branch's assumption; the prelude's twin.citations_ok accepts the kind, tbr_scenario_basis (0103) already counts it).
-- ─────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────
-- §TW4 / §TW5 THE ESTIMATE CITATION AND THE CROSS-TWIN DEPENDENCY CHECK BEFORE PUBLISH
-- ─────────────────────────────────────────────────────────────────────
/*
 * PROPOSE an estimate (twin.estimate.propose) — 0103:2502 copied whole, ONE B33 twin change marked (TW5): the CROSS-TWIN DEPENDENCY CHECK
 * before publish (the head's dependency read; uncertain → an ambiguity reason naming each upstream; recorded in constraint_check.dependency).
 */
CREATE OR REPLACE FUNCTION twin.propose_estimate(
  p_estimate_id uuid, p_tenant uuid, p_domain uuid, p_twin uuid, p_key text, p_facts jsonb, p_candidates jsonb, p_constraint jsonb, p_trigger jsonb,
  p_agent uuid, p_run uuid, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = twin, observation, executive, ctx, public, pg_catalog, pg_temp AS $$
DECLARE t twin.twins_current%ROWTYPE; h twin.twin_versions%ROWTYPE; v_kind text; e twin.estimators%ROWTYPE; pe twin.estimators%ROWTYPE; v_q jsonb; q jsonb; c jsonb;
        v_quals jsonb := '[]'::jsonb; v_cands jsonb := '[]'::jsonb; v_disq boolean; v_value numeric; v_primary jsonb; v_head_el twin.state_elements%ROWTYPE; v_head_value numeric;
        v_vals numeric[] := '{}'; v_min numeric; v_max numeric; v_spread jsonb; v_rel numeric; v_range jsonb; v_outcome text; v_mat jsonb; v_material boolean;
        v_amb_reasons jsonb := '[]'::jsonb; v_prior twin.estimates%ROWTYPE; v_evidence jsonb := '[]'::jsonb; v_digest text; v_as_of date; v_conf numeric;
        v_item uuid; v_event uuid; v_through timestamptz; v_consumed jsonb; v_n_q int := 0; v_n_d int := 0; ev jsonb; v_allowed jsonb;
        v_dep jsonb; v_up jsonb; v_constraint jsonb := p_constraint;   -- B33 twin (TW5)
BEGIN
  PERFORM observation.assert_authority(ARRAY['twin.estimate.propose']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM twin.tes_assert_actor('estimate', p_actor);
  v_kind := twin.tes_proposer_kind('estimate', p_tenant, p_domain, p_actor, p_agent, p_run);
  SELECT * INTO t FROM twin.twins_current x WHERE x.twin_id = p_twin AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'estimate rejected (unknown_twin): % is not a twin of this domain', p_twin USING ERRCODE = '23503'; END IF;
  IF NOT EXISTS (SELECT 1 FROM twin.estimators x WHERE x.twin_id = p_twin AND x.key = p_key AND x.state = 'active') THEN
    RAISE EXCEPTION 'estimate rejected (unknown_estimator): no active estimator is declared for % on twin %', p_key, p_twin USING ERRCODE = '23503';
  END IF;
  SELECT * INTO pe FROM twin.estimators x WHERE x.twin_id = p_twin AND x.key = p_key AND x.state = 'active' AND x.role = 'primary';
  IF NOT FOUND THEN RAISE EXCEPTION 'estimate rejected (state): % on twin % has challengers but no primary estimator; the owner declares one', p_key, p_twin USING ERRCODE = '22023'; END IF;
  IF p_candidates IS NULL OR jsonb_typeof(p_candidates) <> 'array' THEN RAISE EXCEPTION 'estimate rejected (candidates): candidates is an array' USING ERRCODE = '22023'; END IF;
  IF p_constraint IS NULL OR jsonb_typeof(p_constraint) <> 'object' OR coalesce(p_constraint ->> 'outcome', '') NOT IN ('satisfied', 'violated', 'indeterminate')
     OR jsonb_typeof(p_constraint -> 'pins') IS DISTINCT FROM 'array' OR jsonb_typeof(p_constraint -> 'violations') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'estimate rejected (constraint): the constraint check before publish is stated — { outcome, pins, violations } from the engine' USING ERRCODE = '22023';
  END IF;
  h := twin.tes_head(p_twin);
  -- 1 + 2: qualification and the candidates, estimator by estimator (the primary first)
  FOR e IN SELECT * FROM twin.estimators x WHERE x.twin_id = p_twin AND x.key = p_key AND x.state = 'active' ORDER BY (x.role = 'primary') DESC, x.name LOOP
    c := NULL;
    v_q := twin.tes_qualify(p_tenant, p_domain, e.estimator_id, e.version, coalesce(p_facts -> e.estimator_id::text, '[]'::jsonb));
    v_disq := EXISTS (SELECT 1 FROM jsonb_array_elements(v_q) z WHERE z ->> 'verdict' = 'disqualified');
    v_quals := v_quals || jsonb_build_array(jsonb_build_object('estimator_id', e.estimator_id, 'version', e.version, 'inputs', v_q));
    SELECT x INTO c FROM jsonb_array_elements(p_candidates) x WHERE x ->> 'estimator_id' = e.estimator_id::text LIMIT 1;
    IF c IS NULL OR coalesce((c ->> 'version')::int, -1) <> e.version THEN
      RAISE EXCEPTION 'estimate rejected (candidates): estimator % v% states no candidate — every active estimator''s candidate is kept (disagreement retained)', e.name, e.version USING ERRCODE = '22023';
    END IF;
    v_value := CASE WHEN jsonb_typeof(c -> 'value') = 'number' THEN (c ->> 'value')::numeric END;
    IF v_disq AND v_value IS NOT NULL THEN
      RAISE EXCEPTION 'estimate rejected (unqualified): estimator % offers a value on a disqualified input — %', e.name,
        (SELECT string_agg(r, '; ') FROM jsonb_array_elements(v_q) z, jsonb_array_elements_text(z -> 'reasons') r) USING ERRCODE = '22023';
    END IF;
    IF e.role = 'primary' AND (v_disq OR v_value IS NULL) THEN
      RAISE EXCEPTION 'estimate rejected (unqualified): the primary estimator % has no qualified candidate — %', e.name,
        coalesce((SELECT string_agg(r, '; ') FROM jsonb_array_elements(v_q) z, jsonb_array_elements_text(z -> 'reasons') r), c ->> 'excluded', 'no value') USING ERRCODE = '22023';
    END IF;
    IF v_value IS NULL AND coalesce(length(btrim(c ->> 'excluded')), 0) = 0 AND NOT v_disq THEN
      RAISE EXCEPTION 'estimate rejected (candidates): estimator % states neither a value nor why it has none', e.name USING ERRCODE = '22023';
    END IF;
    IF v_value IS NOT NULL THEN
      -- a candidate rests only on the evidence the qualified facts read
      v_allowed := (SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM jsonb_array_elements(coalesce(p_facts -> e.estimator_id::text, '[]'::jsonb)) f, jsonb_array_elements(coalesce(f -> 'evidence', '[]'::jsonb)) x);
      FOR ev IN SELECT * FROM jsonb_array_elements(coalesce(c -> 'evidence', '[]'::jsonb)) LOOP
        IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_allowed) a WHERE a ->> 'id' = ev ->> 'id' AND (a ->> 'version')::int = (ev ->> 'version')::int) THEN
          RAISE EXCEPTION 'estimate rejected (candidates): estimator % cites evidence %@% its qualified inputs did not read', e.name, ev ->> 'id', ev ->> 'version' USING ERRCODE = '22023';
        END IF;
      END LOOP;
      v_vals := v_vals || v_value;
    END IF;
    IF v_disq THEN v_n_d := v_n_d + 1; ELSE v_n_q := v_n_q + 1; END IF;
    v_cands := v_cands || jsonb_build_array(jsonb_build_object('estimator_id', e.estimator_id, 'version', e.version, 'name', e.name, 'role', e.role, 'method', e.method,
      'value', CASE WHEN v_disq THEN NULL ELSE c -> 'value' END, 'raw', c -> 'raw', 'confidence', c -> 'confidence', 'window', c -> 'window', 'last_point', c -> 'last_point',
      'evidence', coalesce(c -> 'evidence', '[]'::jsonb), 'qualified', NOT v_disq,
      'excluded', CASE WHEN v_disq THEN (SELECT string_agg(r, '; ') FROM jsonb_array_elements(v_q) z, jsonb_array_elements_text(z -> 'reasons') r) ELSE c ->> 'excluded' END));
    IF e.role = 'primary' THEN
      v_primary := c; v_evidence := coalesce(c -> 'evidence', '[]'::jsonb);
      v_conf := CASE WHEN jsonb_typeof(c -> 'confidence') = 'number' THEN (c ->> 'confidence')::numeric END;
      v_as_of := CASE WHEN coalesce(c -> 'last_point' ->> 'date', '') ~ '^\d{4}-\d{2}-\d{2}$' THEN (c -> 'last_point' ->> 'date')::date END;
    END IF;
  END LOOP;
  IF v_conf IS NULL OR v_conf < 0 OR v_conf > 1 THEN RAISE EXCEPTION 'estimate rejected (candidates): the primary candidate states its confidence in [0, 1] (from its data, never narrative)' USING ERRCODE = '22023'; END IF;
  IF v_as_of IS NULL THEN RAISE EXCEPTION 'estimate rejected (candidates): the primary candidate names its latest point (the estimate''s as-of day)' USING ERRCODE = '22023'; END IF;
  v_value := (v_primary ->> 'value')::numeric;
  -- the spread over every stated candidate (the disagreement, kept)
  SELECT min(x), max(x) INTO v_min, v_max FROM unnest(v_vals) x;
  v_rel := CASE WHEN v_value = 0 THEN NULL ELSE round((v_max - v_min) / abs(v_value), 6) END;
  v_spread := jsonb_build_object('n', cardinality(v_vals), 'min', v_min, 'max', v_max, 'abs', v_max - v_min, 'relative', v_rel, 'ambiguity_threshold', pe.ambiguity);
  -- 3: the range (the primary's declared bounds) and the constraint verdict recorded
  v_range := jsonb_build_object('min', pe.bounds -> 'min', 'max', pe.bounds -> 'max', 'value', v_value,
                                'verdict', CASE WHEN (pe.bounds ? 'min' AND v_value < (pe.bounds ->> 'min')::numeric) OR (pe.bounds ? 'max' AND v_value > (pe.bounds ->> 'max')::numeric) THEN 'outside' ELSE 'inside' END);
  v_outcome := p_constraint ->> 'outcome';
  -- the materiality: the change against the head's value of this key
  IF h.version IS NOT NULL THEN SELECT * INTO v_head_el FROM twin.state_elements x WHERE x.twin_id = p_twin AND x.version = h.version AND x.key = p_key; END IF;
  v_head_value := CASE WHEN jsonb_typeof(v_head_el.value) = 'number' THEN (v_head_el.value #>> '{}')::numeric END;
  v_material := v_head_value IS NULL OR (v_head_value = 0 AND v_value <> 0) OR (v_head_value <> 0 AND abs(v_value - v_head_value) / abs(v_head_value) >= pe.materiality)
                OR v_head_el.unit IS DISTINCT FROM pe.unit;
  v_mat := jsonb_build_object('head_version', h.version, 'head_value', v_head_el.value, 'head_unit', v_head_el.unit, 'delta_abs', CASE WHEN v_head_value IS NULL THEN NULL ELSE abs(v_value - v_head_value) END,
                              'delta_relative', CASE WHEN v_head_value IS NULL OR v_head_value = 0 THEN NULL ELSE round(abs(v_value - v_head_value) / abs(v_head_value), 6) END,
                              'threshold', pe.materiality, 'material', v_material,
                              'basis', CASE WHEN v_head_el.key IS NULL THEN 'the head holds no value of this key' WHEN v_head_value IS NULL THEN 'the head''s value is not a number' ELSE 'relative change against the head' END);
  IF v_rel IS NOT NULL AND v_rel > pe.ambiguity THEN v_amb_reasons := v_amb_reasons || to_jsonb(format('the estimators disagree: spread %s of the proposal, above %s', v_rel, pe.ambiguity)); END IF;
  IF v_range ->> 'verdict' = 'outside' THEN v_amb_reasons := v_amb_reasons || to_jsonb(format('the proposal %s is outside the declared bounds', v_value)); END IF;
  IF v_outcome <> 'satisfied' THEN v_amb_reasons := v_amb_reasons || to_jsonb(format('the constraint check is %s', v_outcome)); END IF;
  IF v_head_el.key IS NOT NULL AND v_head_el.unit IS DISTINCT FROM pe.unit THEN v_amb_reasons := v_amb_reasons || to_jsonb(format('the unit changes from %s to %s', v_head_el.unit, pe.unit)); END IF;
  -- B33 twin (TW5, V03-T-308 "cross-twin dependencies"): THE CROSS-TWIN DEPENDENCY CHECK BEFORE PUBLISH — the head's dependency read
  -- (twin.version_freshness, over the live twin links into this twin): UNCERTAIN → an ambiguity reason naming each upstream and why (no_head,
  -- stale, unverified, behind), so a material or not the estimate is routed and approved only with the owner's note; the read is recorded in
  -- constraint_check.dependency (a twin with no upstream records nothing: B30's rows unchanged). The decision re-reads it at publication.
  IF h.version IS NOT NULL THEN v_dep := twin.version_freshness(p_twin, h.version) -> 'dependency'; END IF;
  IF v_dep IS NOT NULL AND coalesce(v_dep ->> 'state', 'none') <> 'none' THEN
    v_constraint := p_constraint || jsonb_build_object('dependency', jsonb_build_object('state', v_dep -> 'state', 'head_version', h.version, 'upstream', v_dep -> 'upstream', 'rule', v_dep -> 'rule'));
    IF v_dep ->> 'state' = 'uncertain' THEN
      FOR v_up IN SELECT * FROM jsonb_array_elements(v_dep -> 'upstream') LOOP
        IF v_up ->> 'freshness' IN ('stale', 'no_head') OR v_up ->> 'verification_state' = 'unverified' OR coalesce((v_up ->> 'behind')::boolean, false) THEN
          v_amb_reasons := v_amb_reasons || to_jsonb(format('the cross-twin dependency on %s (%s) is uncertain: %s', v_up ->> 'title', v_up ->> 'twin_id',
            concat_ws(', ', CASE WHEN v_up ->> 'freshness' = 'no_head' THEN 'no_head (the upstream has no admitted head)' END,
                            CASE WHEN v_up ->> 'freshness' = 'stale' THEN format('stale (%s days, against its own policy)', v_up ->> 'age_days') END,
                            CASE WHEN v_up ->> 'verification_state' = 'unverified' THEN 'unverified (a cited input of its head was corrected)' END,
                            CASE WHEN coalesce((v_up ->> 'behind')::boolean, false) THEN format('behind (this head cites v%s, the upstream head is v%s)', v_up ->> 'cited_version', v_up ->> 'head_version') END)));
        END IF;
      END LOOP;
    END IF;
  END IF;
  v_digest := encode(sha256(convert_to(jsonb_build_object('facts', coalesce(p_facts, '{}'::jsonb), 'candidates', v_cands)::text, 'UTF8')), 'hex');
  -- 4: the open proposal of this twin × key is superseded
  SELECT * INTO v_prior FROM twin.estimates x WHERE x.twin_id = p_twin AND x.key = p_key AND x.state = 'proposed' FOR UPDATE;
  IF FOUND THEN
    UPDATE twin.estimates SET state = 'superseded', superseded_by = p_estimate_id WHERE estimate_id = v_prior.estimate_id;
    PERFORM twin.tes_event(p_tenant, p_domain, p_twin, p_key, NULL, v_prior.estimate_id, NULL, 'estimate.superseded', p_actor, jsonb_build_object('superseded_by', p_estimate_id), p_correlation);
  END IF;
  v_event := twin.tes_event(p_tenant, p_domain, p_twin, p_key, pe.estimator_id, p_estimate_id, NULL, 'estimate.proposed', p_actor,
    jsonb_build_object('value', v_value, 'unit', pe.unit, 'confidence', v_conf, 'head_version', h.version, 'material', v_material, 'ambiguous', jsonb_array_length(v_amb_reasons) > 0,
                       'constraint', v_outcome, 'range', v_range ->> 'verdict', 'candidates', jsonb_array_length(v_cands), 'spread', v_spread, 'proposer_kind', v_kind,
                       'agent_id', p_agent, 'run_id', p_run, 'supersedes', v_prior.estimate_id), p_correlation);
  -- 5: a material or ambiguous change is routed to the twin's owner (the item's cause: the proposal's ledger row)
  IF v_material OR jsonb_array_length(v_amb_reasons) > 0 THEN
    v_item := twin.tes_notify(p_tenant, p_domain, 'twin.reconciliation', 'twin_estimate', p_estimate_id,
      format('Estimate for review — %s on %s: %s %s (head %s)', p_key, t.title, v_value, pe.unit, coalesce(v_head_el.value::text, 'none')),
      jsonb_build_array(CASE WHEN v_material THEN 'a material change against the twin''s head' ELSE 'an ambiguous estimate' END) || v_amb_reasons,
      t.owner_principal_id, v_event,
      jsonb_build_object('estimate_id', p_estimate_id, 'twin_id', p_twin, 'key', p_key, 'value', v_value, 'unit', pe.unit, 'head_version', h.version, 'material', v_material,
                         'ambiguous', jsonb_array_length(v_amb_reasons) > 0, 'constraint', v_outcome, 'proposer_kind', v_kind), interval '3 days', p_actor, p_correlation);
    PERFORM twin.tes_event(p_tenant, p_domain, p_twin, p_key, NULL, p_estimate_id, NULL, 'estimate.routed', p_actor,
      jsonb_build_object('attention_item_id', v_item, 'owner', t.owner_principal_id, 'class', 'twin.reconciliation'), p_correlation);
  END IF;
  INSERT INTO twin.estimates (estimate_id, scope, tenant_id, domain_id, twin_id, key, head_version, head_value, head_unit, as_of, proposed_value, unit, confidence, primary_estimator,
                              candidates, spread, qualification, constraint_check, constraint_outcome, range_check, materiality, material, ambiguous, ambiguity_reasons, evidence, inputs_digest,
                              trigger, routed, attention_item_id, state, proposed_by, proposer_kind, agent_id, run_id, correlation_id)
  VALUES (p_estimate_id, 'DOMAIN', p_tenant, p_domain, p_twin, p_key, h.version, v_head_el.value, v_head_el.unit, v_as_of, v_value, pe.unit, v_conf,
          jsonb_build_object('estimator_id', pe.estimator_id, 'version', pe.version, 'name', pe.name, 'method', pe.method),
          v_cands, v_spread, jsonb_build_object('qualified_estimators', v_n_q, 'disqualified_estimators', v_n_d), v_constraint /* B33 twin (was: p_constraint) */, v_outcome, v_range, v_mat, v_material,
          jsonb_array_length(v_amb_reasons) > 0, v_amb_reasons, v_evidence, v_digest, coalesce(p_trigger, '{}'::jsonb), v_item IS NOT NULL, v_item, 'proposed', p_actor, v_kind, p_agent, p_run, p_correlation);
  FOR q IN SELECT * FROM jsonb_array_elements(v_quals) LOOP
    INSERT INTO twin.input_qualifications (qualification_id, scope, tenant_id, domain_id, estimate_id, estimator_id, estimator_version, input_index, input, source_id, source_health,
                                           cadence, unit_check, truth_state, verdict, reasons, correlation_id)
    SELECT gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_estimate_id, (q ->> 'estimator_id')::uuid, (q ->> 'version')::int, (z ->> 'index')::int, z -> 'input',
           (z ->> 'source_id')::uuid, z -> 'source_health', z -> 'cadence', z -> 'unit_check', z -> 'truth_state', z ->> 'verdict', z -> 'reasons', p_correlation
      FROM jsonb_array_elements(q -> 'inputs') z;
  END LOOP;
  -- the pending triggers of this twin × key are answered by this proposal
  SELECT max(x.occurred_at) INTO v_through FROM twin.estimation_events x
   WHERE x.twin_id = p_twin AND x.key = p_key AND x.event IN ('trigger.telemetry', 'trigger.internal_change', 'trigger.ontology_revision')
     AND x.occurred_at > coalesce((SELECT max((y.details ->> 'through')::timestamptz) FROM twin.estimation_events y WHERE y.twin_id = p_twin AND y.key = p_key AND y.event = 'trigger.consumed'), '-infinity'::timestamptz);
  IF v_through IS NOT NULL THEN
    SELECT coalesce(jsonb_agg(x.event_id ORDER BY x.occurred_at), '[]'::jsonb) INTO v_consumed FROM twin.estimation_events x
     WHERE x.twin_id = p_twin AND x.key = p_key AND x.event IN ('trigger.telemetry', 'trigger.internal_change', 'trigger.ontology_revision') AND x.occurred_at <= v_through
       AND x.occurred_at > coalesce((SELECT max((y.details ->> 'through')::timestamptz) FROM twin.estimation_events y WHERE y.twin_id = p_twin AND y.key = p_key AND y.event = 'trigger.consumed'), '-infinity'::timestamptz);
    PERFORM twin.tes_event(p_tenant, p_domain, p_twin, p_key, NULL, p_estimate_id, NULL, 'trigger.consumed', p_actor, jsonb_build_object('through', v_through, 'triggers', v_consumed), p_correlation);
  END IF;
  RETURN jsonb_build_object('estimate_id', p_estimate_id, 'twin_id', p_twin, 'key', p_key, 'state', 'proposed', 'value', v_value, 'unit', pe.unit, 'confidence', v_conf, 'as_of', v_as_of,
                            'head_version', h.version, 'candidates', v_cands, 'spread', v_spread, 'qualification', v_quals, 'constraint', v_outcome, 'range', v_range,
                            'materiality', v_mat, 'material', v_material, 'ambiguous', jsonb_array_length(v_amb_reasons) > 0, 'ambiguity_reasons', v_amb_reasons,
                            'routed', v_item IS NOT NULL, 'attention_item_id', v_item, 'owner', t.owner_principal_id, 'supersedes', v_prior.estimate_id, 'proposer_kind', v_kind);
END $$ LANGUAGE plpgsql;

/*
 * DECIDE an estimate (twin.estimate.decide) — LAST 0106:130 (0104's contract at publication, 0106's shared contract lock) copied whole, the
 * B33 twin changes marked: TW5 — the cross-twin dependency re-read at publication (no head / unverified upstream → dependency 409; stale /
 * behind → the owner's note); TW4 — the admitted element carries exactly this estimate's citation (else citation 422). The routed item is
 * closed by the trigger twx_estimate_item_closes (TW7), not here.
 */
CREATE OR REPLACE FUNCTION twin.decide_estimate(p_estimate_id uuid, p_tenant uuid, p_domain uuid, p_decision text, p_note text, p_new_version integer, p_actor uuid, p_correlation uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'twin', 'observation', 'simulation', 'ctx', 'public', 'pg_catalog', 'pg_temp'
AS $function$
DECLARE x twin.estimates%ROWTYPE; v_owner uuid; nv twin.twin_versions%ROWTYPE; el twin.state_elements%ROWTYPE; v_note text := nullif(btrim(coalesce(p_note, '')), '');
        v_pin jsonb; v_set simulation.constraint_sets%ROWTYPE; v_cur_digest text; v_pinned text[]; v_selected text[]; v_late record;   -- 0104
        v_dep jsonb; v_hard text; v_soft text; v_cite jsonb;   -- B33 twin (TW4, TW5)
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
    PERFORM simulation.lock_constraint_contract(x.tenant_id, x.domain_id, false);   -- 0106: the contract, SHARED, before any of the reads below
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
  -- B33 twin (TW5, V03-T-308): THE CROSS-TWIN DEPENDENCY RE-READ AT PUBLICATION (twin.version_freshness of the head the estimate was computed
  -- against, over the live links into this twin): an upstream with NO admitted head or UNVERIFIED refuses the publication (dependency, 409 —
  -- the whole approval rolls back); a STALE or BEHIND upstream is the ambiguous rule — approved only with the owner's note.
  IF p_decision = 'approved' AND x.head_version IS NOT NULL THEN
    v_dep := twin.version_freshness(x.twin_id, x.head_version) -> 'dependency';
    IF v_dep IS NOT NULL AND v_dep ->> 'state' = 'uncertain' THEN
      SELECT string_agg(format('%s (%s): %s', u ->> 'title', u ->> 'twin_id',
                               concat_ws(', ', CASE WHEN u ->> 'freshness' = 'no_head' THEN 'no admitted head' END,
                                               CASE WHEN u ->> 'verification_state' = 'unverified' THEN 'unverified' END)), '; ' ORDER BY u ->> 'title')
        INTO v_hard FROM jsonb_array_elements(v_dep -> 'upstream') u WHERE u ->> 'freshness' = 'no_head' OR u ->> 'verification_state' = 'unverified';
      IF v_hard IS NOT NULL THEN
        RAISE EXCEPTION 'estimate rejected (dependency): estimate % rests on twin % v%, whose upstream twin dependency is unavailable — %; publish once the upstream has a verified admitted head',
          p_estimate_id, x.twin_id, x.head_version, v_hard USING ERRCODE = '22023';
      END IF;
      SELECT string_agg(format('%s (%s): %s', u ->> 'title', u ->> 'twin_id',
                               concat_ws(', ', CASE WHEN u ->> 'freshness' = 'stale' THEN 'stale' END,
                                               CASE WHEN coalesce((u ->> 'behind')::boolean, false) THEN format('behind (cites v%s, head v%s)', u ->> 'cited_version', u ->> 'head_version') END)), '; ' ORDER BY u ->> 'title')
        INTO v_soft FROM jsonb_array_elements(v_dep -> 'upstream') u WHERE u ->> 'freshness' = 'stale' OR coalesce((u ->> 'behind')::boolean, false);
      IF v_soft IS NOT NULL AND coalesce(length(v_note), 0) < 8 THEN
        RAISE EXCEPTION 'estimate rejected (note): the cross-twin dependency is uncertain (%); an estimate on it is approved with the owner''s note (at least 8 characters)', v_soft USING ERRCODE = '22023';
      END IF;
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
  -- B33 twin (TW4): the ESTIMATE CITATION KIND — the admitted element carries exactly this estimate's citation {kind: estimate, id, version 1,
  -- digest: the estimate's inputs_digest} (beside the evidence its qualified inputs read); anything else refuses the approval (citation, 422).
  SELECT c INTO v_cite FROM jsonb_array_elements(el.citations) c WHERE c ->> 'kind' = 'estimate';
  IF (SELECT count(*) FROM jsonb_array_elements(el.citations) c WHERE c ->> 'kind' = 'estimate') <> 1
     OR v_cite ->> 'id' IS DISTINCT FROM p_estimate_id::text OR (v_cite ->> 'version') IS DISTINCT FROM '1' OR v_cite ->> 'digest' IS DISTINCT FROM x.inputs_digest THEN
    RAISE EXCEPTION 'estimate rejected (citation): version % carries % without exactly this estimate''s citation {kind: estimate, id: %, version: 1, digest: %}',
      p_new_version, x.key, p_estimate_id, x.inputs_digest USING ERRCODE = '22023';
  END IF;
  UPDATE twin.estimates SET state = 'approved', decided_by = p_actor, decided_at = clock_timestamp(), decision_note = v_note, applied_version = p_new_version WHERE estimate_id = p_estimate_id;
  PERFORM twin.tes_event(p_tenant, p_domain, x.twin_id, x.key, NULL, p_estimate_id, NULL, 'estimate.approved', p_actor,
    jsonb_build_object('applied_version', p_new_version, 'supersedes', nv.supersedes, 'element_id', el.element_id, 'value', x.proposed_value, 'unit', x.unit, 'note', v_note,
                       'state_set_digest', nv.state_set_digest, 'material', x.material, 'ambiguous', x.ambiguous), p_correlation);
  RETURN jsonb_build_object('estimate_id', p_estimate_id, 'state', 'approved', 'twin_id', x.twin_id, 'key', x.key, 'value', x.proposed_value, 'unit', x.unit,
                            'applied_version', p_new_version, 'supersedes', nv.supersedes, 'element_id', el.element_id, 'note', v_note);
END $function$;

-- §TW6 THE TOPOLOGY RULE ON A ROUTE-BEARING HEAD — harness only (phase6-twin-b33 TW6): no SQL.

-- ─────────────────────────────────────────────────────────────────────
-- §TW7 THE ITEMS CLOSED ON DECISION — triggers, no port re-declared (the siv_run_* precedent). Each writes ATTENTION ROWS ONLY, in the deciding
-- act's own transaction, through the prelude's executive.b33_close_items / b33_raise_routed (R4: no port calls another port that locks the
-- same rows; the attention sweep never calls these).
-- ─────────────────────────────────────────────────────────────────────

/* THE ROUTED ESTIMATE ITEM (F-P5-02; V03-T-309's note): the twin.reconciliation item of subject twin_estimate (propose_estimate's tes_notify)
   is CLOSED when the estimate leaves `proposed` — approved (the owner's decision, into its snapshot), declined (the owner's reason) or
   superseded (a later proposal of the same twin × key). */
CREATE OR REPLACE FUNCTION twin.twx_estimate_item_closes() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = twin, executive, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM executive.b33_close_items(NEW.tenant_id, NEW.domain_id, 'twin.reconciliation', 'twin_estimate', NEW.estimate_id,
    CASE NEW.state WHEN 'approved' THEN format('estimate %s approved by the twin''s owner into v%s', NEW.estimate_id, NEW.applied_version)
                   WHEN 'declined' THEN format('estimate %s declined by the twin''s owner: %s', NEW.estimate_id, NEW.decision_note)
                   ELSE format('estimate %s superseded by estimate %s', NEW.estimate_id, NEW.superseded_by) END,
    coalesce(NEW.decided_by, public.eye_principal(), NEW.proposed_by), NULL);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION twin.twx_estimate_item_closes() FROM PUBLIC;
CREATE TRIGGER twx_estimate_item_closes AFTER UPDATE OF state ON twin.estimates
  FOR EACH ROW WHEN (OLD.state = 'proposed' AND NEW.state IN ('approved', 'declined', 'superseded')) EXECUTE FUNCTION twin.twx_estimate_item_closes();

/* THE OUTSIDE RUN'S ITEM (F-P5-04). INTERPRETATION (confirmed by the coordinator, B33): "an item on the completion of an OUTSIDE run" is a NEW
   twin.envelope item — raised when a run FINISHES (completed or partial) outside its operating envelope: "awaiting a twin owner's exploratory
   admission" (subject `run`, named owner the twin's owner, evaluated and routed under the domain's PUBLISHED attention policy by
   executive.b33_raise_routed — deprioritized, never hidden, when the policy does not name twin.envelope). One per run (its cause is the run
   itself). Closed by the exploratory admission (below) or by the run's retirement. */
CREATE OR REPLACE FUNCTION simulation.twx_outside_run_item() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = simulation, twin, executive, public, pg_catalog, pg_temp AS $$
DECLARE v_owner uuid; v_title text; v_keys text;
BEGIN
  SELECT t.owner_principal_id, t.title INTO v_owner, v_title FROM twin.twins_current t WHERE t.twin_id = NEW.twin_id;
  SELECT string_agg(k || ' = ' || (x ->> 'value') || ' outside [' || coalesce(x -> 'range' ->> 0, '') || ', ' || coalesce(x -> 'range' ->> 1, '') || ']', '; ' ORDER BY k) INTO v_keys
    FROM jsonb_each(coalesce(NEW.envelope_check -> 'keys', '{}'::jsonb)) e(k, x) WHERE (x ->> 'verdict') = 'outside';
  PERFORM executive.b33_raise_routed(NEW.tenant_id, NEW.domain_id, 'twin.envelope', 'run', NEW.run_id,
    format('Outside-envelope run on %s (%s) — awaiting a twin owner''s exploratory admission', coalesce(v_title, NEW.twin_id::text), NEW.state),
    jsonb_build_array(jsonb_build_object('class', 'outside_envelope', 'detail',
      format('the run finished %s outside the operating envelope of %s (%s); it is disabled for decision use until a twin owner admits it as exploratory', NEW.state, NEW.model_ref, coalesce(v_keys, 'keys not stated')))),
    v_owner, NEW.run_id, 'simulation.run.finished_outside_envelope',
    jsonb_build_object('run_id', NEW.run_id, 'twin_id', NEW.twin_id, 'twin_version', NEW.twin_version, 'model_ref', NEW.model_ref, 'run_state', NEW.state, 'outside', v_keys,
                       'awaiting', 'exploratory_admission', 'synthetic_state', NEW.controls -> 'synthetic_state'),
    NULL, coalesce(public.eye_principal(), NEW.operator_principal_id), NEW.correlation_id);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION simulation.twx_outside_run_item() FROM PUBLIC;
CREATE TRIGGER twx_outside_run_item AFTER UPDATE OF state ON simulation.runs_current
  FOR EACH ROW WHEN (OLD.state NOT IN ('completed', 'partial') AND NEW.state IN ('completed', 'partial') AND NEW.envelope_state = 'outside')
  EXECUTE FUNCTION simulation.twx_outside_run_item();

/* …closed by the EXPLORATORY ADMISSION: the twin owner's admission (simulation.admit_exploratory inserts the row, then raises its own item for
   the method stewards — this AFTER INSERT fires before that, so it closes the awaiting-admission item only). */
CREATE OR REPLACE FUNCTION simulation.twx_admission_closes_run_item() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = simulation, executive, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM executive.b33_close_items(NEW.tenant_id, NEW.domain_id, 'twin.envelope', 'run', NEW.run_id,
    format('run %s admitted as exploratory by a twin owner (admission %s)', NEW.run_id, NEW.admission_id), NEW.admitted_by, NEW.correlation_id);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION simulation.twx_admission_closes_run_item() FROM PUBLIC;
CREATE TRIGGER twx_admission_closes_run_item AFTER INSERT ON simulation.exploratory_admissions
  FOR EACH ROW EXECUTE FUNCTION simulation.twx_admission_closes_run_item();

/* …or by the run's RETIREMENT (§EX's port writes runs_current.retired_*): a retired run is never admitted (admit_exploratory refuses it) — its
   awaiting-admission item closes. A run already admitted keeps the admission's own item for the concurrence. */
CREATE OR REPLACE FUNCTION simulation.twx_retired_run_item_closes() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = simulation, executive, public, pg_catalog, pg_temp AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM simulation.exploratory_admissions a WHERE a.run_id = NEW.run_id) THEN RETURN NEW; END IF;
  PERFORM executive.b33_close_items(NEW.tenant_id, NEW.domain_id, 'twin.envelope', 'run', NEW.run_id,
    format('run %s retired: %s', NEW.run_id, NEW.retire_reason), coalesce(NEW.retired_by, public.eye_principal()), NULL);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION simulation.twx_retired_run_item_closes() FROM PUBLIC;
CREATE TRIGGER twx_retired_run_item_closes AFTER UPDATE OF retired_at ON simulation.runs_current
  FOR EACH ROW WHEN (OLD.retired_at IS NULL AND NEW.retired_at IS NOT NULL AND NEW.envelope_state = 'outside') EXECUTE FUNCTION simulation.twx_retired_run_item_closes();

/* THE EXPLORATORY ADMISSION'S ITEM (F-P5-04): the twin.envelope item admit_exploratory raised for the method stewards (subject run) is CLOSED
   by the steward's concurrence (simulation.concur_exploratory's update of concurred_at). */
CREATE OR REPLACE FUNCTION simulation.twx_admission_item_closes() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = simulation, executive, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM executive.b33_close_items(NEW.tenant_id, NEW.domain_id, 'twin.envelope', 'run', NEW.run_id,
    format('exploratory admission %s of run %s concurred by a method steward: %s', NEW.admission_id, NEW.run_id, NEW.concurrence_note), NEW.concurred_by, NEW.correlation_id);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION simulation.twx_admission_item_closes() FROM PUBLIC;
CREATE TRIGGER twx_admission_item_closes AFTER UPDATE OF concurred_at ON simulation.exploratory_admissions
  FOR EACH ROW WHEN (OLD.concurred_at IS NULL AND NEW.concurred_at IS NOT NULL) EXECUTE FUNCTION simulation.twx_admission_item_closes();

-- ─────────────────────────────────────────────────────────────────────
-- §TW8 simulation.open_run's ENVELOPE REFUSAL WORDING
-- ─────────────────────────────────────────────────────────────────────
/* simulation.open_run — LAST 0092:1888-2131 copied WHOLE (signature unchanged, every other refusal word for word), the two B33 twin (TW8)
   changes marked: the envelope refusal TEXTS name the holder B30 made it (twin.envelope_ack_holder, 0103 §EN.2 — a twin owner of the
   domain only); they still said "or the domain administrator". Nothing else changes. */
CREATE OR REPLACE FUNCTION simulation.open_run(
  p_run_id uuid, p_tenant uuid, p_domain uuid, p_twin_id uuid, p_twin_version int, p_run_kind text, p_control_run_id uuid, p_corrects uuid,
  p_scenario_id uuid, p_scenario_branch_id uuid, p_scenario_version int, p_scenario_branch_state text, p_shock boolean, p_shock_basis text, p_component text,
  p_model_ref text, p_implementation_digest text, p_environment_digest text, p_environment jsonb,
  p_stochastic_mode text, p_rng text, p_seed bigint, p_samples int, p_jitter jsonb,
  p_interventions jsonb, p_constraints jsonb, p_assumptions jsonb, p_inputs_digest text, p_validation_status text, p_controls jsonb, p_envelope_ack jsonb, p_challenge_id uuid,
  p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = simulation, twin, prediction, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE
  v twin.twin_versions%ROWTYPE; v_state jsonb; v_digest text; c simulation.runs_current%ROWTYPE; v_pinned text; v_controls jsonb; v_synthetic boolean;
  v_unusable jsonb; v_unavailable jsonb; b prediction.branches_current%ROWTYPE; v_scn_version int; v_branch_state text; v_expected_basis text; v_flip uuid;
  v_flip_observed date; v_envelope jsonb; v_outside text; v_ack jsonb; ch simulation.challenges%ROWTYPE;
  v_si_forecast uuid; v_si_markers jsonb; v_si_blocked boolean; v_si jsonb; /* B24 (0086) markers */
  v_twin_model text; v_implicit boolean; v_family text; hq simulation.adapter_health%ROWTYPE; /* B29 (0092) §C the method binding */
BEGIN
  PERFORM observation.assert_authority(ARRAY['simulation.run']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT * INTO v FROM twin.twin_versions WHERE twin_id = p_twin_id AND version = p_twin_version AND tenant_id = p_tenant AND domain_id = p_domain;
  IF NOT FOUND OR v.state <> 'admitted' THEN
    RAISE EXCEPTION 'run rejected: version % of twin % is not an admitted version in this domain', p_twin_version, p_twin_id USING ERRCODE = '23503';
  END IF;
  IF v.completeness <> 'complete' THEN
    RAISE EXCEPTION 'run rejected: twin version % is incomplete (missing %); a run cannot use inputs the twin does not hold', p_twin_version, v.missing_keys::text USING ERRCODE = '22023';
  END IF;
  IF v.observed_through IS NULL THEN
    RAISE EXCEPTION 'run rejected: twin version % has no world-time cut-off (observed_through); a run reads the twin under two cut-offs', p_twin_version USING ERRCODE = '22023';
  END IF;
  -- B21 (0081, D3 a; AU-TWN-0014, V03-T-120): an UNFIT version opens no run — its behaviours are disabled until a later validation finds otherwise.
  IF v.fitness_state = 'unfit' THEN
    RAISE EXCEPTION 'run rejected (unfit_twin): twin version % of twin % is unfit (validation %); behaviours are disabled until a later validation finds it fit or indeterminate', p_twin_version, p_twin_id, v.fitness_validation_id USING ERRCODE = '22023';
  END IF;
  /* B29 (0092) §C — THE METHOD BINDING. The run names its method (p_model_ref); the twin's own behaviour model is its IMPLICIT binding
     (every run before B29 — supply-flow@1 keeps working, its checks unchanged below); any other method must be BOUND to the twin by its
     owner (twin.twin_method_bindings, active) and its family among the twin's approved uses (twin.use_approved — §A's contract rule). */
  SELECT t.behaviour_model_ref INTO v_twin_model FROM twin.twins_current t WHERE t.twin_id = p_twin_id;
  v_implicit := (p_model_ref = v_twin_model);
  IF NOT v_implicit THEN
    IF NOT EXISTS (SELECT 1 FROM twin.twin_method_bindings mb WHERE mb.twin_id = p_twin_id AND mb.model_ref = p_model_ref AND mb.state = 'active'
                     AND mb.tenant_id = p_tenant AND mb.domain_id = p_domain) THEN
      RAISE EXCEPTION 'run rejected (unbound_method): method % is not bound to twin %; the twin''s owner binds a method before a run uses it (simulation.method.bind)', p_model_ref, p_twin_id
        USING ERRCODE = '22023';
    END IF;
    SELECT bm.family INTO v_family FROM twin.behaviour_models bm WHERE bm.method_ref = p_model_ref;
    IF NOT coalesce(twin.use_approved(p_twin_id, v_family), false) THEN
      RAISE EXCEPTION 'run rejected (method_family): the % family (%) is not among the approved uses of twin %', v_family, p_model_ref, p_twin_id USING ERRCODE = '22023';
    END IF;
  END IF;
  /* B29 (0092) §C — CONTAINMENT: a QUARANTINED adapter opens no run in this domain until a method steward reinstates it after a passing probe. */
  SELECT * INTO hq FROM simulation.adapter_health h WHERE h.tenant_id = p_tenant AND h.domain_id = p_domain AND h.model_ref = p_model_ref;
  IF FOUND AND hq.state = 'quarantined' THEN
    RAISE EXCEPTION 'run rejected (quarantined): the adapter of % is quarantined in this domain since % after % consecutive faults (last: %); a method steward reinstates it after a probe passes',
      p_model_ref, hq.quarantined_at, hq.consecutive_faults, hq.last_fault ->> 'kind' USING ERRCODE = '22023';
  END IF;
  /* end B29 §C binding; the input checks below read the METHOD's required inputs for an explicit binding (the model-aware forms, 0092 §C) */
  v_unusable := CASE WHEN v_implicit THEN twin.unusable_inputs(p_twin_id, p_twin_version, p_component) ELSE twin.unusable_inputs(p_twin_id, p_twin_version, p_component, p_model_ref) END;
  IF jsonb_array_length(v_unusable) > 0 THEN
    RAISE EXCEPTION 'run rejected: inputs for component % are not usable: %', p_component, v_unusable::text USING ERRCODE = '22023';
  END IF;
  v_unavailable := CASE WHEN v_implicit THEN twin.unavailable_inputs(p_twin_id, p_twin_version, p_component) ELSE twin.unavailable_inputs(p_twin_id, p_twin_version, p_component, p_model_ref) END;
  IF jsonb_array_length(v_unavailable) > 0 THEN
    RAISE EXCEPTION 'run rejected: required inputs for component % are no longer available: %', p_component, v_unavailable::text USING ERRCODE = '22023';
  END IF;
  SELECT implementation_digest INTO v_pinned FROM twin.behaviour_models WHERE method_ref = p_model_ref;
  IF v_pinned IS NULL THEN
    RAISE EXCEPTION 'run rejected: behaviour model % has no pinned implementation', p_model_ref USING ERRCODE = '22023';
  END IF;
  IF v_pinned <> p_implementation_digest THEN
    RAISE EXCEPTION 'run rejected: the implementation offered (%) is not the pinned implementation of % (%)', p_implementation_digest, p_model_ref, v_pinned USING ERRCODE = '22023';
  END IF;
  IF p_run_kind = 'control' AND (p_control_run_id IS NOT NULL OR p_interventions <> '[{"type": "none"}]'::jsonb) THEN
    RAISE EXCEPTION 'run rejected: a control run applies `none` and references no control' USING ERRCODE = '22023';
  END IF;
  IF p_scenario_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM prediction.scenarios_current s WHERE s.scenario_id = p_scenario_id AND s.tenant_id = p_tenant AND s.domain_id = p_domain) THEN
      RAISE EXCEPTION 'run rejected: scenario % is not an authorized scenario in this domain', p_scenario_id USING ERRCODE = '23503';
    END IF;
    -- 0066 §8 (V04-T-032): a RETIRED scenario's branches do not enter simulation; its history stays for replay.
    IF EXISTS (SELECT 1 FROM prediction.scenarios_current s WHERE s.scenario_id = p_scenario_id AND s.state = 'retired') THEN
      RAISE EXCEPTION 'run rejected: scenario % was retired by review; a retired branch is not simulated (declare a successor scenario)', p_scenario_id USING ERRCODE = '22023';
    END IF;
    -- B21 (0081, D10; FEX-12, V03-T-143, AI-49-004): an incoherent scenario's branches do not enter simulation.
    IF EXISTS (SELECT 1 FROM prediction.scenarios_current s WHERE s.scenario_id = p_scenario_id AND s.coherence_state = 'failed') THEN
      RAISE EXCEPTION 'run rejected (incoherent_scenario): scenario % failed its coherence check % (%); a branch of an incoherent scenario is not simulated until a review resolves it', p_scenario_id,
        (SELECT s.coherence_check_id FROM prediction.scenarios_current s WHERE s.scenario_id = p_scenario_id),
        (SELECT string_agg(DISTINCT x ->> 'rule', ', ') FROM prediction.scenarios_current s JOIN prediction.scenario_coherence_checks k ON k.check_id = s.coherence_check_id, jsonb_array_elements(k.findings) x WHERE s.scenario_id = p_scenario_id AND (x ->> 'severity') = 'fail')
        USING ERRCODE = '22023';
    END IF;
    SELECT * INTO b FROM prediction.branches_current WHERE branch_id = p_scenario_branch_id AND scenario_id = p_scenario_id AND tenant_id = p_tenant AND domain_id = p_domain;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'run rejected: branch % is not a branch of scenario %', p_scenario_branch_id, p_scenario_id USING ERRCODE = '22023';
    END IF;
    v_scn_version := prediction.scenario_version_as_of(p_scenario_id, v.known_at);
    IF v_scn_version IS NULL THEN
      RAISE EXCEPTION 'run rejected: scenario % was recorded after this version''s known_at (%); it was not known at record time', p_scenario_id, v.known_at USING ERRCODE = '22023';
    END IF;
    IF v_scn_version IS DISTINCT FROM p_scenario_version THEN
      RAISE EXCEPTION 'run rejected: scenario % stood at version % at this version''s known_at (%), not %', p_scenario_id, v_scn_version, v.known_at, p_scenario_version USING ERRCODE = '22023';
    END IF;
    -- B23 (0084, L7-I02): a branch ADDED after the declaration (BranchScenario) belongs to the version that added it; a run whose record
    -- cut-off binds an earlier version of the tree did not know it (the membership above reads the current rows, which carry it).
    IF b.added_in_version > v_scn_version THEN
      RAISE EXCEPTION 'run rejected (branch_added_later): branch % was added in version % of scenario %, after version % that this twin version''s known_at (%) binds; it was not in the tree this run knew',
        p_scenario_branch_id, b.added_in_version, p_scenario_id, v_scn_version, v.known_at USING ERRCODE = '22023';
    END IF;
    /* BOTH CLOCKS: written by this run's record cut-off, and observed within its world. */
    v_branch_state := prediction.branch_state_as_of(p_scenario_branch_id, v.known_at, v.observed_through);
    v_flip_observed := prediction.branch_flip_observed_at(p_scenario_branch_id);
    IF v_branch_state IS DISTINCT FROM p_scenario_branch_state THEN
      RAISE EXCEPTION 'run rejected: branch % was % under this run''s cut-offs (known_at %, observations through %; the flip was recorded % and observed %), not %',
        p_scenario_branch_id, v_branch_state, v.known_at, v.observed_through, b.flipped_at, v_flip_observed, p_scenario_branch_state USING ERRCODE = '22023';
    END IF;
    IF p_shock <> (v_branch_state = 'flipped') THEN
      RAISE EXCEPTION 'run rejected: the shock contradicts the bound branch: branch % was % under this run''s cut-offs (a shock without a flipped branch is a hypothetical and names no scenario)', p_scenario_branch_id, v_branch_state USING ERRCODE = '22023';
    END IF;
    v_flip := CASE WHEN v_branch_state = 'flipped' THEN b.flip_event_id ELSE NULL END;
    v_expected_basis := CASE WHEN p_shock THEN 'scenario-branch-flipped' ELSE 'none' END;
  ELSE
    IF p_scenario_branch_id IS NOT NULL THEN
      RAISE EXCEPTION 'run rejected: a scenario branch was named without its scenario' USING ERRCODE = '22023';
    END IF;
    v_expected_basis := CASE WHEN p_shock THEN 'hypothetical' ELSE 'none' END;
  END IF;
  IF p_shock_basis IS DISTINCT FROM v_expected_basis THEN
    RAISE EXCEPTION 'run rejected: the shock basis offered (%) is not what the binding establishes (%)', p_shock_basis, v_expected_basis USING ERRCODE = '22023';
  END IF;
  v_controls := coalesce(p_controls, v.controls);
  IF simulation.classification_rank(v_controls ->> 'classification') < simulation.classification_rank(v.controls ->> 'classification')
     OR (coalesce((v.controls ->> 'synthetic_state')::boolean, false) AND NOT coalesce((v_controls ->> 'synthetic_state')::boolean, false)) THEN
    RAISE EXCEPTION 'run rejected: the controls offered are less restricted than the twin version''s' USING ERRCODE = '22023';
  END IF;
  /* B24 (0086) markers — F-P6-07 (V03-T-077): a run bound to a scenario rests on the scenario's forecast and on the sources of its series.
     An ACTIVE source-impact marker on that forecast (or on the scenario itself) that is FAILED or SUSPENDED refuses the run; DEGRADED or
     UNKNOWN admits it with controls.source_impact DECLARED on the run (the markers, the worst state) — the port declares it, never the
     caller — and marks the new run itself (one marker per source), so a package citing the run meets the commitment gate. */
  v_controls := v_controls - 'source_impact';
  IF p_scenario_id IS NOT NULL THEN
    SELECT s.forecast_id INTO v_si_forecast FROM prediction.scenarios_current s WHERE s.scenario_id = p_scenario_id;
    SELECT coalesce(jsonb_agg(jsonb_build_object('marker_id', m.marker_id, 'source_id', m.source_id, 'subject_kind', m.subject_kind, 'subject_id', m.subject_id,
                                                 'health_state', m.health_state, 'reason', m.reason, 'set_at', m.set_at) ORDER BY m.set_at, m.marker_id), '[]'::jsonb),
           coalesce(bool_or(m.health_state IN ('failed', 'suspended')), false)
      INTO v_si_markers, v_si_blocked
      FROM observation.source_impact_markers m
     WHERE m.tenant_id = p_tenant AND m.domain_id = p_domain AND m.state = 'active'
       AND ((m.subject_kind = 'forecast' AND m.subject_id = v_si_forecast) OR (m.subject_kind = 'scenario' AND m.subject_id = p_scenario_id));
    IF v_si_blocked THEN
      RAISE EXCEPTION 'run rejected (source_impact): scenario % rests on forecast % whose source is % (%); a branch resting on a failed or suspended source is not simulated until the source recovers',
        p_scenario_id, v_si_forecast,
        (SELECT string_agg(DISTINCT (x ->> 'health_state'), ', ') FROM jsonb_array_elements(v_si_markers) x WHERE (x ->> 'health_state') IN ('failed', 'suspended')),
        (SELECT string_agg(DISTINCT 'source ' || (x ->> 'source_id') || ' ' || (x ->> 'health_state'), '; ') FROM jsonb_array_elements(v_si_markers) x)
        USING ERRCODE = '22023';
    END IF;
    IF jsonb_array_length(v_si_markers) > 0 THEN
      v_si := jsonb_build_object('health_state', CASE WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(v_si_markers) x WHERE (x ->> 'health_state') = 'degraded') THEN 'degraded' ELSE 'unknown' END,
                                 'scenario_id', p_scenario_id, 'forecast_id', v_si_forecast, 'markers', v_si_markers, 'declared_at', clock_timestamp(),
                                 'note', 'admitted on a degraded or unknown source: the run''s result rests on it until the source recovers');
      v_controls := v_controls || jsonb_build_object('source_impact', v_si);
      INSERT INTO observation.source_impact_markers (marker_id, scope, tenant_id, domain_id, source_id, subject_kind, subject_id, health_state, reason, set_by_event, correlation_id)
      SELECT gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, x.source_id, 'run', p_run_id, x.health_state, 'the run was opened on a scenario resting on this source (run.opened)', p_event_id, p_correlation
        FROM (SELECT DISTINCT ON ((e ->> 'source_id')::uuid) (e ->> 'source_id')::uuid AS source_id, e ->> 'health_state' AS health_state
                FROM jsonb_array_elements(v_si_markers) e ORDER BY (e ->> 'source_id')::uuid, (e ->> 'health_state') = 'degraded' DESC) x
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;
  /* end B24 markers */
  -- B21 (0081, D3 b): THE RUN'S OWN CONTRACT against the envelope — one rule with the validation (twin.envelope_check); outside needs the acknowledgement.
  v_envelope := CASE WHEN v_implicit THEN twin.envelope_check(p_twin_id, p_twin_version, jsonb_build_object('horizon_days', (p_constraints ->> 'horizon_days')::numeric))
                     /* B29 (0092) §C: an explicitly bound method is checked against ITS operating envelope */
                     ELSE twin.envelope_check(p_twin_id, p_twin_version, jsonb_build_object('horizon_days', (p_constraints ->> 'horizon_days')::numeric), p_model_ref) END;
  v_ack := NULL;
  IF (v_envelope ->> 'state') = 'outside' THEN
    SELECT string_agg(k || ' = ' || (x ->> 'value') || ' outside [' || (x -> 'range' ->> 0) || ', ' || (x -> 'range' ->> 1) || ']', '; ' ORDER BY k) INTO v_outside FROM jsonb_each(v_envelope -> 'keys') e(k, x) WHERE (x ->> 'verdict') = 'outside';
    -- the acknowledgement is read as TEXT, never cast: a non-boolean, "yes", 1 or a missing key all read as "not acknowledged" (no 22P02)
    IF p_envelope_ack IS NULL OR (p_envelope_ack ->> 'acknowledge') IS DISTINCT FROM 'true' OR coalesce(length(btrim(p_envelope_ack ->> 'reason')), 0) < 8 THEN
      -- B33 twin (TW8): the holder named as it is since B30 (0103's envelope_ack_holder) — a twin owner; no longer "or the domain administrator"
      RAISE EXCEPTION 'run rejected (envelope): outside the operating envelope of % (%); a run outside the envelope needs a twin owner''s acknowledgement (envelope.acknowledge true with a reason of 8+ characters)', p_model_ref, v_outside USING ERRCODE = '22023';
    END IF;
    IF NOT twin.envelope_ack_holder(p_actor, p_tenant, p_domain) THEN
      -- B33 twin (TW8): the acknowledgement is a twin owner's of this domain (0103's envelope_ack_holder)
      RAISE EXCEPTION 'run rejected (envelope_ack): the acknowledgement of an envelope breach is a twin owner''s of this domain; the acting principal is not one (%)', v_outside USING ERRCODE = '42501';
    END IF;
    v_ack := jsonb_build_object('acknowledged_by', p_actor, 'acknowledged_at', clock_timestamp(), 'reason', p_envelope_ack ->> 'reason', 'keys', v_outside);
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('key', e.key, 'kind', e.kind, 'basis_truth_state', e.basis_truth_state, 'value', e.value, 'unit', e.unit,
                                               'material', e.material, 'citations', e.citations, 'health', e.health, 'valid_from', e.valid_from,
                                               'valid_to', e.valid_to, 'confidence', e.confidence, 'synthetic_state', e.synthetic_state, 'controls', e.controls,
                                               'inherited_validation', e.inherited_validation)
                            ORDER BY e.key), '[]'::jsonb)
    INTO v_state FROM twin.state_elements e WHERE e.twin_id = p_twin_id AND e.version = p_twin_version;
  v_digest := encode(sha256(convert_to(v_state::text, 'UTF8')), 'hex');
  IF p_run_kind = 'intervention' THEN
    SELECT * INTO c FROM simulation.runs_current WHERE run_id = p_control_run_id AND tenant_id = p_tenant AND domain_id = p_domain;
    IF NOT FOUND THEN RAISE EXCEPTION 'run rejected: control run % is not an authorized run in this domain', p_control_run_id USING ERRCODE = '23503'; END IF;
    IF c.run_kind <> 'control' THEN RAISE EXCEPTION 'run rejected: % is not a control run', p_control_run_id USING ERRCODE = '22023'; END IF;
    IF c.state <> 'completed' THEN RAISE EXCEPTION 'run rejected: control run % is not completed', p_control_run_id USING ERRCODE = '22023'; END IF;
    IF c.twin_id <> p_twin_id OR c.twin_version <> p_twin_version OR c.initial_state_digest <> v_digest OR c.implementation_digest <> p_implementation_digest
       OR c.assumptions <> p_assumptions OR c.constraints <> p_constraints OR c.shock <> p_shock OR c.component <> p_component
       OR c.scenario_id IS DISTINCT FROM p_scenario_id OR c.scenario_branch_id IS DISTINCT FROM p_scenario_branch_id
       OR c.scenario_version IS DISTINCT FROM p_scenario_version OR c.shock_basis <> p_shock_basis THEN
      RAISE EXCEPTION 'run rejected: control run % is not compatible (it must share the twin version, initial state, implementation, assumptions, constraints, scenario binding, shock and component)', p_control_run_id
        USING ERRCODE = '22023';
    END IF;
  END IF;
  -- B21 (0081, D11): a RE-RUN answering a challenge names it; the challenge must await a re-run of the run this run corrects; one re-run per challenge.
  -- (the aliases here and in the incoherent-scenario block avoid `c`: this body declares c simulation.runs_current%ROWTYPE, and §7 gave that row a challenge_id)
  IF p_challenge_id IS NOT NULL THEN
    SELECT * INTO ch FROM simulation.challenges x WHERE x.challenge_id = p_challenge_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'run rejected (challenge): no such challenge % in this domain', p_challenge_id USING ERRCODE = '23503'; END IF;
    IF p_corrects IS DISTINCT FROM ch.run_id THEN RAISE EXCEPTION 'run rejected (challenge): challenge % disputes run %; a re-run names it as the run it corrects (correctsRunId)', p_challenge_id, ch.run_id USING ERRCODE = '22023'; END IF;
    IF ch.state <> 'rerun_requested' THEN RAISE EXCEPTION 'run rejected (challenge): challenge % is not awaiting a re-run (state %)', p_challenge_id, ch.state USING ERRCODE = '22023'; END IF;
    IF ch.rerun_run_id IS NOT NULL THEN RAISE EXCEPTION 'run rejected (challenge): challenge % is not awaiting a re-run (run % is its re-run)', p_challenge_id, ch.rerun_run_id USING ERRCODE = '22023'; END IF;
  END IF;
  v_synthetic := coalesce((v_controls ->> 'synthetic_state')::boolean, v.synthetic_state);
  INSERT INTO simulation.runs_current (
    run_id, scope, tenant_id, domain_id, twin_id, twin_version, branch_id, run_kind, control_run_id, corrects_run_id,
    scenario_id, scenario_branch_id, scenario_version, scenario_branch_state, scenario_flip_event, shock, shock_basis, component,
    known_at, observed_through, initial_state, initial_state_digest, model_ref, implementation_digest, environment_digest, environment,
    stochastic_mode, rng, seed, samples, jitter, interventions, constraints, assumptions, inputs_digest, validation_status, state, controls,
    operator_principal_id, correlation_id, twin_fitness, envelope_state, envelope_check, envelope_ack, challenge_id
  ) VALUES (
    p_run_id, 'DOMAIN', p_tenant, p_domain, p_twin_id, p_twin_version, v.branch_id, p_run_kind, p_control_run_id, p_corrects,
    p_scenario_id, p_scenario_branch_id, p_scenario_version, p_scenario_branch_state, v_flip, p_shock, p_shock_basis, p_component,
    v.known_at, v.observed_through, v_state, v_digest, p_model_ref, p_implementation_digest, p_environment_digest, p_environment,
    p_stochastic_mode, p_rng, p_seed, p_samples, p_jitter, p_interventions, p_constraints, p_assumptions, p_inputs_digest,
    p_validation_status || CASE WHEN v.verification_state = 'unverified' THEN '; twin version UNVERIFIED (a cited input was corrected)' ELSE '' END,
    'opened', v_controls, p_actor, p_correlation, v.fitness_state, v_envelope ->> 'state', v_envelope, v_ack, p_challenge_id);
  INSERT INTO simulation.run_events (event_id, scope, tenant_id, domain_id, run_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_run_id, 'run.opened', p_actor,
          jsonb_build_object('twin_id', p_twin_id, 'twin_version', p_twin_version, 'run_kind', p_run_kind, 'control_run_id', p_control_run_id,
                             'initial_state_digest', v_digest, 'inputs_digest', p_inputs_digest, 'stochastic_mode', p_stochastic_mode,
                             'scenario_id', p_scenario_id, 'scenario_version', p_scenario_version, 'scenario_branch_id', p_scenario_branch_id,
                             'scenario_branch_state', p_scenario_branch_state, 'shock_basis', p_shock_basis,
                             'flip_recorded_at', b.flipped_at, 'flip_observed_at', v_flip_observed,
                             'twin_fitness', v.fitness_state, 'envelope_state', v_envelope ->> 'state', 'envelope_ack', v_ack, 'challenge_id', p_challenge_id), p_correlation);
  IF p_challenge_id IS NOT NULL THEN
    UPDATE simulation.challenges SET rerun_run_id = p_run_id WHERE challenge_id = p_challenge_id;
    INSERT INTO simulation.challenge_events (event_id, scope, tenant_id, domain_id, challenge_id, run_id, event, actor_principal_id, details, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_challenge_id, ch.run_id, 'challenge.rerun_opened', p_actor, jsonb_build_object('rerun_run_id', p_run_id, 'corrects_run_id', p_corrects), p_correlation);
  END IF;
  RETURN jsonb_build_object('initial_state', v_state, 'initial_state_digest', v_digest, 'known_at', v.known_at, 'observed_through', v.observed_through,
                            'branch_id', v.branch_id, 'synthetic_state', v_synthetic, 'controls', v_controls, 'verification_state', v.verification_state,
                            'scenario_flip_event', v_flip, 'flip_observed_at', v_flip_observed,
                            'twin_fitness', v.fitness_state, 'envelope', v_envelope, 'envelope_ack', v_ack, 'challenge_id', p_challenge_id);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION simulation.open_run(uuid,uuid,uuid,uuid,int,text,uuid,uuid,uuid,uuid,int,text,boolean,text,text,text,text,text,jsonb,text,text,bigint,int,jsonb,jsonb,jsonb,jsonb,text,text,jsonb,jsonb,uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION simulation.open_run(uuid,uuid,uuid,uuid,int,text,uuid,uuid,uuid,uuid,int,text,boolean,text,text,text,text,text,jsonb,text,text,bigint,int,jsonb,jsonb,jsonb,jsonb,text,text,jsonb,jsonb,uuid,uuid,uuid,uuid) TO eye_commit;
-- end section `twin` (§TW)
