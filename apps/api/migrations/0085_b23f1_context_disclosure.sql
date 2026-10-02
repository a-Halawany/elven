-- 0085 — CP-6 B23-F1: THE CONTEXT QUERY'S DIAGNOSTICS OBEY THE SAME DISCLOSURE POLICY AS ITS ITEMS (2026-09-25).
--
-- THE DEFECT (B23-F1, the bounded review of B23 dated 2026-09-25; reproduced on live PostgreSQL through the real route before this
-- migration — test/int/phase6-retrieve-context-b23.test.ts X12). L3-I02's query, memory.retrieve_context (0084 §2), filtered the ITEMS
-- it served by purpose (here) and by clearance and audience roles (in TypeScript, afterwards), but its DIAGNOSTICS did not:
--   content_absent_rows was counted over every linked item the metadata tier names — whatever its purpose, classification or audience;
--   unverified_rows was counted over every linked projection row the log does not know — rows whose policy metadata nothing vouches for;
--   bounded (the scan bound reached) was computed over the purpose-admitted set, before the clearance and audience filter.
-- The route passed the two counts into its omissions and `bounded` into bound.truncated, so an answer could carry a numeric omission and
-- an item-existence message ("1 memory item(s) linked to this subject are not served: …") about records the reader may not see, and its
-- product state could turn partial because of them — against the query's own contract (what the policy withholds is neither counted
-- nor mentioned). The review's reproduction: a reader with ZERO authorized items and one content-absent item above its clearance
-- → before: 200 partial, EYE-DEG-001, omitted [{content_tier, rows 1}]; after: complete, no omission.
--
-- THE CORRECTION (bounded; the query is not redesigned).
-- (§1) memory.retrieve_context re-declared WITH THE READER'S POLICY, so that every aggregate is computed over the AUTHORIZED set. The
--   0084 signature (uuid, uuid, text, jsonb, timestamptz, int, text[]) is DROPPED (nothing else calls it — the route is its one caller)
--   and the function CREATED with three more arguments: the reader's clearance in this domain (text — the route's clearanceOf,
--   shared/clearance.ts), the reader's role codes in this domain (text[]) and whether the reader is an administrator (boolean —
--   platform_admin, tenant_admin, domain_admin are admitted to every audience role, 0066 §3). Still STABLE (it cannot write) and
--   SECURITY INVOKER (the caller's RLS); the authority, scope and argument checks and their refusal texts are 0084's, verbatim; two
--   more refusals state the reader's policy arguments (22023, 'memory context rejected: …' — the route's own programming error, never
--   the caller's). The 0084 body is copied whole; what changes:
--   · admitted — the served version also has a classification whose rank (public 0 < internal 1 < confidential 2 < restricted 3,
--     exactly shared/clearance.ts CLEARANCE_RANK; an unknown classification ranks restricted, an unknown clearance public — `covers`)
--     is at most the reader's, and audience roles that are empty, or the reader an administrator, or a role the reader holds. `bounded`
--     (the scan bound reached) and every item's links are therefore over the AUTHORIZED set.
--   · content_absent_rows — ONLY rows whose TRUSTWORTHY policy metadata admits the reader: while memory_items_current SERVES, the
--     memory.items_current row's classification, audience_roles and audience_purposes (the purpose must be among audience_purposes:
--     purpose_scope lives on the absent canonical version and cannot be read — conservative); while it is WITHDRAWN there is no
--     trustworthy metadata for an absent version, so nothing is counted (0). An as-of read counts nothing, as in 0084.
--   · unverified_rows — REMOVED from the answer. The projection rows the log does not know (while memory_items_current is withdrawn)
--     carry untrusted policy metadata by definition: they are never served, never counted and never mentioned. The answer served from
--     the log still declares its source and its stale/withdrawn condition (the block's label — nothing in it depends on a withheld
--     record) and, on every log-sourced answer, the route adds ONE constant note (context.ts CONTEXT_LOG_NOTE).
-- (§2) the interface register: L3-I02's bound_to gains one closing clause (the row count, the binding and bound_in '0084' are
--   unchanged).
--
-- THE ROUTE (TypeScript, same change set): passes the clearance, the roles and the administrator flag; keeps its own clearance and
-- audience filter as defence in depth (the same result); truncated = the AUTHORIZED items exceed the route's limit, or the authorized
-- scan bound was reached; omissionsOf no longer has an unverified branch.
--
-- NOT HERE (stated): no new table, ledger, outbox event, PDP rule, refusal row or interface; no change to memory.context_references,
-- graph.projection_state, memory.record_access or the twelve B20 routes; no change to what a served item carries or to its links
-- (withheld links are counted, as before, over SERVED items only); no relevance ranking; 0084 is not edited (it is applied to the
-- demonstration); no register-count change (the register stays 50/0/0).
--
-- Read-only checks after migrating a fresh database:
--   select provolatile, prosecdef, pronargs from pg_proc where proname = 'retrieve_context' and pronamespace = 'memory'::regnamespace → s | f | 10
--   select prosrc like '%unverified_rows%' from pg_proc where proname = 'retrieve_context'                                        → f
--   select bound_to like '%B23-F1 (0085)%' from objects.interface_register where interface_id = 'L3-I02'                         → t

-- ============================================================
-- §1 memory.retrieve_context — the reader's policy inside the query (0084 §2 copied whole; the changes marked B23-F1)
-- ============================================================
DROP FUNCTION memory.retrieve_context(uuid, uuid, text, jsonb, timestamptz, int, text[]);
CREATE FUNCTION memory.retrieve_context(
  p_tenant uuid, p_domain uuid, p_purpose text, p_subject jsonb,
  p_as_of timestamptz, p_limit int, p_withdrawn text[],
  p_clearance text, p_roles text[], p_admin boolean
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = memory, graph, objects, observation, public, pg_catalog, pg_temp AS $$
DECLARE
  v_kind text; v_id uuid;
  v_mem_w boolean; v_edges_w boolean; v_entities_w boolean;
  v_rank int;
  v_out jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['memory.context.retrieve']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF coalesce(length(btrim(p_purpose)), 0) = 0 THEN
    RAISE EXCEPTION 'memory context rejected: a purpose is declared (the context is retrieved for an explicit purpose; the envelope''s purpose_id is empty)' USING ERRCODE = '22023';
  END IF;
  IF p_subject IS NULL OR jsonb_typeof(p_subject) <> 'object'
     OR coalesce(p_subject ->> 'kind', '') NOT IN ('entity', 'claim', 'edge', 'strategy', 'evidence', 'warning', 'forecast')
     OR coalesce(p_subject ->> 'id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'memory context rejected: the subject names {kind, id} — kind one of entity, claim, edge, strategy, evidence, warning, forecast; id an object id' USING ERRCODE = '22023';
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 500 THEN
    RAISE EXCEPTION 'memory context rejected: the scan bound is 1..500 (not %)', coalesce(p_limit::text, '<none>') USING ERRCODE = '22023';
  END IF;
  IF p_withdrawn IS NULL OR NOT (p_withdrawn <@ ARRAY['entities_current', 'resolutions_current', 'edges_current', 'strategy_current', 'invalidations_current', 'memory_items_current']::text[]) THEN
    RAISE EXCEPTION 'memory context rejected: the withdrawn partitions are named among the six projections (not %)', coalesce(array_to_string(p_withdrawn, ', '), '<none>') USING ERRCODE = '22023';
  END IF;
  -- B23-F1 (0085): the reader's policy — its clearance in this domain, its role codes in this domain, whether it administers
  IF coalesce(p_clearance, '') NOT IN ('public', 'internal', 'confidential', 'restricted') THEN
    RAISE EXCEPTION 'memory context rejected: the reader''s clearance is one of public, internal, confidential, restricted (not %)', coalesce(p_clearance, '<none>') USING ERRCODE = '22023';
  END IF;
  IF p_roles IS NULL OR p_admin IS NULL THEN
    RAISE EXCEPTION 'memory context rejected: the reader''s roles in this domain and whether it administers are stated' USING ERRCODE = '22023';
  END IF;
  v_rank := CASE p_clearance WHEN 'public' THEN 0 WHEN 'internal' THEN 1 WHEN 'confidential' THEN 2 WHEN 'restricted' THEN 3 END;
  v_kind := p_subject ->> 'kind'; v_id := lower(p_subject ->> 'id')::uuid;
  v_mem_w := 'memory_items_current' = ANY (p_withdrawn);
  v_edges_w := 'edges_current' = ANY (p_withdrawn);
  v_entities_w := 'entities_current' = ANY (p_withdrawn);

  WITH cand AS (
    -- the candidates: the dependency rows on the subject (every state — an as-of read may serve a version whose row was retired since)
    -- and every MEM version whose payload names it; the served version is checked again below
    SELECT d.dependent_object_id AS item_id FROM graph.dependencies d
     WHERE d.tenant_id = p_tenant AND d.domain_id = p_domain AND d.dependent_type = 'MEM' AND d.depends_on_id = v_id
    UNION
    SELECT o.object_id FROM objects.canonical_objects o
     WHERE o.tenant_id = p_tenant AND o.domain_id = p_domain AND o.object_type = 'MEM' AND memory.context_references(o.payload, v_kind, v_id)
  ), exp AS MATERIALIZED (
    SELECT e.item_id, e.state, e.object_version, e.attention_state FROM memory.expected_items(p_tenant, p_domain) e
     WHERE v_mem_w AND e.item_id IN (SELECT item_id FROM cand)
  ), cur AS (
    -- the metadata tier, from the source the route decided: the projection while it serves, the LOG while it is withdrawn
    SELECT i.item_id, i.state, i.object_version, i.attention_state, true AS projected, NULL::jsonb AS drift
      FROM memory.items_current i
     WHERE NOT v_mem_w AND i.tenant_id = p_tenant AND i.domain_id = p_domain AND i.item_id IN (SELECT item_id FROM cand)
    UNION ALL
    SELECT e.item_id, e.state, e.object_version, e.attention_state, (i.item_id IS NOT NULL),
           CASE WHEN i.item_id IS NOT NULL AND (i.state || '@' || i.object_version) <> (e.state || '@' || e.object_version)
                THEN jsonb_build_object('projected', i.state || '@' || i.object_version, 'log', e.state || '@' || e.object_version) END
      FROM exp e LEFT JOIN memory.items_current i ON i.item_id = e.item_id AND i.tenant_id = p_tenant AND i.domain_id = p_domain
  ), served AS (
    -- the version current AT as_of (the current one when as_of is null); an item withdrawn by as_of is out of circulation then
    SELECT DISTINCT ON (o.object_id) o.object_id, o.object_version, o.recorded_at, o.classification, o.purpose_scope, o.truth_state, o.synthetic_state,
           o.valid_from, o.valid_to, o.content_digest, o.supersedes, o.payload,
           c.state AS cur_state, c.object_version AS cur_version, c.attention_state, c.projected, c.drift
      FROM cur c
      JOIN objects.canonical_objects o ON o.object_id = c.item_id AND o.object_type = 'MEM' AND o.tenant_id = p_tenant AND o.domain_id = p_domain
     WHERE (p_as_of IS NULL AND c.state = 'active' AND o.object_version = c.object_version)
        OR (p_as_of IS NOT NULL AND o.recorded_at <= p_as_of
            AND NOT EXISTS (SELECT 1 FROM memory.item_events w WHERE w.item_id = c.item_id AND w.tenant_id = p_tenant AND w.domain_id = p_domain
                                                             AND w.event = 'memory.withdrawn' AND w.occurred_at <= p_as_of))
     ORDER BY o.object_id, o.object_version DESC
  ), admitted AS (
    -- the served version names the subject itself, and admits the purpose (memory.item.retrieve's rule: the purpose it was admitted
    -- for, or one its audience declares)
    -- B23-F1 (0085): AND the reader may read it — the classification within the reader's clearance (shared/clearance.ts `covers`:
    -- an unknown classification ranks restricted), and the audience roles empty, or the reader an administrator, or a role it holds.
    -- Everything below (the bound, the links, the answer) is over this AUTHORIZED set.
    SELECT s.* FROM served s
     WHERE memory.context_references(s.payload, v_kind, v_id)
       AND (s.purpose_scope = p_purpose
            OR (jsonb_typeof(s.payload #> '{audience,purposes}') = 'array' AND (s.payload #> '{audience,purposes}') ? p_purpose))
       AND (CASE s.classification WHEN 'public' THEN 0 WHEN 'internal' THEN 1 WHEN 'confidential' THEN 2 ELSE 3 END) <= v_rank
       AND (p_admin
            OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(s.payload #> '{audience,roles}') = 'array' THEN s.payload #> '{audience,roles}' ELSE '[]'::jsonb END) r)
            OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(s.payload #> '{audience,roles}') = 'array' THEN s.payload #> '{audience,roles}' ELSE '[]'::jsonb END) r(role)
                        WHERE r.role = ANY (p_roles)))
  ), bounded AS (
    SELECT a.*, count(*) OVER () AS admitted_n FROM admitted a ORDER BY a.recorded_at DESC, a.object_id LIMIT p_limit
  ), raw_links AS (
    SELECT b.object_id AS item_id, l.*
      FROM bounded b
     CROSS JOIN LATERAL (
       SELECT c ->> 'kind' AS kind, lower(c ->> 'id') AS id, CASE WHEN (c ->> 'version') ~ '^[0-9]+$' THEN (c ->> 'version')::bigint END AS version,
              NULL::text AS digest, c ->> 'rationale' AS rationale, 'dependency'::text AS via, 1 AS grp, x.ord
         FROM jsonb_array_elements(CASE WHEN jsonb_typeof(b.payload -> 'cites') = 'array' THEN b.payload -> 'cites' ELSE '[]'::jsonb END) WITH ORDINALITY AS x(c, ord)
       UNION ALL
       SELECT b.payload #>> '{derivation,basis,kind}', lower(b.payload #>> '{derivation,basis,id}'),
              CASE WHEN (b.payload #>> '{derivation,basis,version}') ~ '^[0-9]+$' THEN (b.payload #>> '{derivation,basis,version}')::bigint END,
              b.payload #>> '{derivation,basis,content_digest}',
              format('derived from %s %s@%s by %s', b.payload #>> '{derivation,basis,object_type}', b.payload #>> '{derivation,basis,id}', b.payload #>> '{derivation,basis,version}', b.payload #>> '{derivation,method_ref}'),
              'derivation', 2, 0
        WHERE jsonb_typeof(b.payload #> '{derivation,basis}') = 'object'
       UNION ALL
       SELECT 'evidence', lower(e ->> 'object_id'), CASE WHEN (e ->> 'version') ~ '^[0-9]+$' THEN (e ->> 'version')::bigint END, e ->> 'digest',
              'the evidence the basis rests on', 'derivation', 3, y.ord
         FROM jsonb_array_elements(CASE WHEN jsonb_typeof(b.payload #> '{derivation,evidence}') = 'array' THEN b.payload #> '{derivation,evidence}' ELSE '[]'::jsonb END) WITH ORDINALITY AS y(e, ord)
       UNION ALL
       SELECT 'memory', lower(substring(b.supersedes FROM '^MEM:([0-9a-fA-F-]{36})@')), substring(b.supersedes FROM '@([0-9]+)$')::bigint, NULL,
              coalesce(b.payload #>> '{supersession,reason}', 'the version this version supersedes'), 'supersedes', 4, 0
        WHERE b.supersedes ~ '^MEM:[0-9a-fA-F-]{36}@[0-9]+$'
       UNION ALL
       SELECT 'strategy', lower(b.payload #>> '{related,decision_id}'), NULL, NULL, 'the related decision the owner named', 'related', 5, 0
        WHERE coalesce(b.payload #>> '{related,decision_id}', '') ~* '^[0-9a-f-]{36}$'
       UNION ALL
       SELECT 'strategy', lower(b.payload #>> '{related,objective_id}'), NULL, NULL, 'the related objective the owner named', 'related', 6, 0
        WHERE coalesce(b.payload #>> '{related,objective_id}', '') ~* '^[0-9a-f-]{36}$'
     ) l
  ), links AS (
    SELECT r.item_id, r.grp, r.ord,
           (r.kind = 'edge' AND v_edges_w) AS withheld_edge, (r.kind = 'entity' AND v_entities_w) AS withheld_entity,
           jsonb_strip_nulls(jsonb_build_object(
             'kind', r.kind, 'id', r.id, 'via', r.via, 'rationale', r.rationale,
             'version', coalesce(r.version, co.object_version, ed.claim_version),
             'digest', coalesce(r.digest, co.content_digest, ed.evidence_digest),
             'object_type', co.object_type,
             'state', coalesce(en.lifecycle_state, ed.state),
             'label', coalesce(en.canonical_name, ed.predicate, co.title),
             'subject_entity_id', ed.subject_entity_id, 'object_entity_id', ed.object_entity_id,
             'names_subject', r.id = v_id::text)) AS link
      FROM raw_links r
      LEFT JOIN LATERAL (
        SELECT o.object_version, o.content_digest, o.object_type, o.payload ->> 'title' AS title FROM objects.canonical_objects o
         WHERE r.kind NOT IN ('entity', 'edge') AND r.id ~ '^[0-9a-f-]{36}$' AND o.object_id = r.id::uuid AND o.tenant_id = p_tenant
           AND (r.version IS NULL OR o.object_version = r.version)
         ORDER BY o.object_version DESC LIMIT 1) co ON true
      LEFT JOIN graph.entities_current en ON r.kind = 'entity' AND NOT v_entities_w AND r.id ~ '^[0-9a-f-]{36}$' AND en.entity_id = r.id::uuid
      LEFT JOIN graph.edges_current ed ON r.kind = 'edge' AND NOT v_edges_w AND r.id ~ '^[0-9a-f-]{36}$' AND ed.edge_id = r.id::uuid
  ), item_links AS (
    SELECT l.item_id,
           coalesce(jsonb_agg(l.link ORDER BY l.grp, l.ord) FILTER (WHERE NOT l.withheld_edge AND NOT l.withheld_entity), '[]'::jsonb) AS explanation_links,
           count(*) FILTER (WHERE l.withheld_edge) AS withheld_edges, count(*) FILTER (WHERE l.withheld_entity) AS withheld_entities
      FROM links l GROUP BY l.item_id
  )
  SELECT jsonb_build_object(
    'purpose', p_purpose, 'subject', jsonb_build_object('kind', v_kind, 'id', v_id), 'as_of', p_as_of,
    'source', CASE WHEN v_mem_w THEN 'log' ELSE 'projection' END,
    'scan_bound', p_limit,
    -- B23-F1 (0085): over the AUTHORIZED set (admitted carries the reader's policy)
    'bounded', coalesce((SELECT max(b.admitted_n) FROM bounded b), 0) > p_limit,
    'items', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'item_id', b.object_id, 'version', b.object_version, 'recorded_at', b.recorded_at,
        'title', b.payload ->> 'title', 'statement', b.payload ->> 'statement', 'record_class', b.payload ->> 'record_class',
        'source_kind', b.payload #>> '{source,kind}', 'source_ref', b.payload #>> '{source,ref}',
        'classification', b.classification, 'purpose_scope', b.purpose_scope, 'truth_state', b.truth_state, 'synthetic_state', b.synthetic_state,
        'valid_from', b.valid_from, 'valid_to', b.valid_to, 'content_digest', b.content_digest,
        'audience', jsonb_build_object('roles', CASE WHEN jsonb_typeof(b.payload #> '{audience,roles}') = 'array' THEN b.payload #> '{audience,roles}' ELSE '[]'::jsonb END,
                                       'purposes', CASE WHEN jsonb_typeof(b.payload #> '{audience,purposes}') = 'array' THEN b.payload #> '{audience,purposes}' ELSE '[]'::jsonb END),
        'state', b.cur_state, 'current_version', b.cur_version, 'served_is_current', b.object_version = b.cur_version,
        'attention_state', b.attention_state,
        'basis_state', CASE WHEN jsonb_typeof(b.payload -> 'derivation') = 'object'
                            THEN CASE b.attention_state WHEN 'none' THEN 'current' WHEN 'basis_corrected' THEN 'corrected' WHEN 'basis_withdrawn' THEN 'withdrawn' ELSE b.attention_state END END,
        'index_state', CASE WHEN v_mem_w THEN 'stale' ELSE 'projected' END, 'projected', b.projected, 'drift', b.drift,
        'explanation_links', coalesce(il.explanation_links, '[]'::jsonb),
        'withheld_links', jsonb_build_object('edges_current', coalesce(il.withheld_edges, 0), 'entities_current', coalesce(il.withheld_entities, 0)))
        ORDER BY b.recorded_at DESC, b.object_id)
      FROM bounded b LEFT JOIN item_links il ON il.item_id = b.object_id), '[]'::jsonb),
    -- B23-F1 (0085): the projection rows the log does not know (memory_items_current withdrawn) are no longer counted — their policy
    -- metadata is untrusted by definition; they are never served, never counted and never mentioned (the key is gone).
    -- The linked items whose current version (as memory.items_current names it) the content tier does not hold — counted ONLY while
    -- the projection SERVES, and only where the row's own policy metadata admits the reader: the classification within its clearance,
    -- the audience roles (empty, an administrator, or a role it holds), and the purpose among audience_purposes (purpose_scope is the
    -- absent version's and cannot be read — conservative). While it is withdrawn nothing trustworthy remains to authorize an absent
    -- version: nothing is counted. A current read only.
    'content_absent_rows', CASE WHEN p_as_of IS NULL AND NOT v_mem_w THEN (
        SELECT count(*) FROM memory.items_current i
         WHERE i.tenant_id = p_tenant AND i.domain_id = p_domain AND i.item_id IN (SELECT item_id FROM cand) AND i.state = 'active'
           AND NOT EXISTS (SELECT 1 FROM objects.canonical_objects o
                            WHERE o.object_id = i.item_id AND o.object_type = 'MEM' AND o.object_version = i.object_version)
           AND (CASE i.classification WHEN 'public' THEN 0 WHEN 'internal' THEN 1 WHEN 'confidential' THEN 2 ELSE 3 END) <= v_rank
           AND (p_admin OR cardinality(i.audience_roles) = 0 OR i.audience_roles && p_roles)
           AND p_purpose = ANY (i.audience_purposes)) ELSE 0 END
  ) INTO v_out;
  RETURN v_out;
END $$;
REVOKE ALL ON FUNCTION memory.retrieve_context(uuid, uuid, text, jsonb, timestamptz, int, text[], text, text[], boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION memory.retrieve_context(uuid, uuid, text, jsonb, timestamptz, int, text[], text, text[], boolean) TO eye_commit;
COMMENT ON FUNCTION memory.retrieve_context(uuid, uuid, text, jsonb, timestamptz, int, text[], text, text[], boolean) IS 'B23 (0084), L3-I02 RetrieveContext; B23-F1 (0085): the memory items whose served version names the subject and that the READER may read — the purpose (purpose_scope or a declared audience purpose), the classification within the reader''s clearance (p_clearance; shared/clearance.ts ranks), the audience roles (empty, an administrator, or a role in p_roles) — each with its explanation links, from the source the route decided from the projection state it read first (p_withdrawn). Every diagnostic is over the same authorized set: bounded; content_absent_rows only where the served projection row''s own policy metadata admits the reader (nothing while memory_items_current is withdrawn); projection rows the log does not know are neither counted nor mentioned. STABLE (it cannot write) and SECURITY INVOKER (the caller''s RLS). The route keeps its own clearance/audience filter as defence in depth and writes the access rows after this query, in the same transaction.';

-- ============================================================
-- §2 THE INTERFACE REGISTER: L3-I02's bound_to gains the correction (the binding and the row count unchanged)
-- ============================================================
UPDATE objects.interface_register
   SET bound_to = bound_to || '; B23-F1 (0085): diagnostics filtered by the same purpose, clearance and audience policy; unverified rows neither counted nor mentioned'
 WHERE interface_id = 'L3-I02';
