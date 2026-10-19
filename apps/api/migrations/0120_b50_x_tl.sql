-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0120 §TL — CP-6 B50 part §TL: THE TIMELINE, THE AS-OF EXPLORER AND THE SOURCE-TO-PRODUCT TRACE (F-P3-04: PR-22-001/002/003/005/006,
-- CAP-UM-10, AT-22). Folded into 0120 LAST (§0, §HD, §LC, §CI, §PV, §CL, §TL). Applies ALONE on 0001–0119 + the 0120 §0 prelude + the wave-1
-- parts (§HD, §LC, §CI, §PV): it USES them and re-implements none — §HD's objects.time_qualifiers (the stated time values and their
-- precision), §LC's objects.lifecycle_transitions / objects.lifecycle_replay, §PV's graph.explain (the trace IS the explanation projected),
-- §PV's fitness marks and knowledge challenges. Nothing applied or committed is edited; NO existing function is re-declared (the attention
-- vocabulary is WIDENED by union, §TL.5, so it composes with §CL's widening whichever folds first).
--
--   §TL.1  the vocabulary (helpers, IMMUTABLE): the method version, the instant as UTC text, the clearance ranks, the audience-governed types
--          (the B10 header-only rule: objects.service.ts AUDIENCE_GOVERNED), the reference's uuid, the clock reading of one version
--   §TL.2  the citation state (graph.tl_cite_state, a guarded DEFINER read): does a header citation still resolve inside the tenant — so a
--          citation into a domain the caller cannot see is not misread as broken; the missing intervals (graph.tl_missing_intervals,
--          INVOKER): the declared incomplete acquisition ranges and the source-health gaps of the linked sources, as known at the instant
--   §TL.3  graph.timeline(subject | scope, from, to, axis, as_of, clearance, limit) — SECURITY INVOKER (the caller's RLS): the canonical
--          versions on the chosen axis (event | observation | valid | record) as known at as_of (bitemporal: recorded_at <= as_of), each
--          with its four times, its §HD qualifiers, its clock reading and the correction recorded LATER; the event ledgers of the subject
--          (lifecycle attempts, warning / package events, decision-time snapshots, custody, challenges, fitness marks, correction cases,
--          invalidations); the existing as-of reads (the known-at version, objects.lifecycle_replay, prediction.warning_as_of,
--          prediction.scenario_version_as_of, the recorded decision replays); and the DISCLOSURE — later corrections, missing intervals,
--          policy filtering (COUNTS withheld by classification / audience, never their content), clock skew, broken lineage, bounds
--   §TL.4  graph.trace(type, id, version, clearance) — SECURITY INVOKER: §PV's graph.explain projected source → evidence → claims → product
--          (→ decision), each object node with its clock, its later correction and its policy filtering; the unresolved edges PRESERVED;
--          the missing intervals of the sources it rests on; the chapter CONTINUITY read through B81's shell.degraded_state (a degraded
--          source with or without a declared contract); the decision-time snapshots; the reconciliation already routed
--   §TL.5  the reconciliation: graph.route_trace_reconciliation (graph.timeline.reconcile — human-gated): an INCOMPLETE trace (conflicting
--          time, diverging clocks, broken lineage, unavailable evidence, a degraded continuity) routed as ONE attention item to the
--          product's accountable owner (else the knowledge roles), idempotent per (product version, problem set); the attention class
--          `knowledge.trace_reconciliation` and subject kind `canonical_object` added to the vocabulary by union
--   §TL.6  grants
--
-- REFUSAL NOUNS (the CLASS form; reported to the integrator for observation-errors.ts): `timeline rejected (<class>)`, `trace rejected
-- (<class>)`, `trace reconciliation rejected (<class>)` — 403 actor|authority · 404 unknown_object|unknown_scope · 409 state|duplicate ·
-- 422 subject|axis|window|future|clearance|limit|reason.
--
-- WHAT A VIEW NEVER DOES (PR-22-003): it never rewrites, re-orders by authority or conceals — a later correction is SHOWN ('corrected on …'),
-- a missing interval is SHOWN, a policy filter is COUNTED (classification above the reader's clearance: the item is withheld and counted;
-- an audience-governed type: the header is shown, the content withheld and counted), a clock divergence is FLAGGED, a citation that no
-- longer resolves is LISTED. The 19 host-clock read sites of the API stay H1's (DESIGN D19); every instant here is the DATABASE clock.
-- THREE CLAIMS: construction (this file and phase6-timeline-b50, its fixtures SYNTHETIC); demonstrated operation (the act — SYNTHETIC);
-- real acceptance (PR-22-006 / AT-22: the shared recording path at B111, then R2) — never claimed here.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- §TL.1 THE VOCABULARY ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION graph.tl_method() RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT 'b50-tl-timeline-1' $$;
CREATE OR REPLACE FUNCTION graph.tl_axes() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY['event', 'observation', 'valid', 'record'] $$;
/* The attention class and subject kind of a routed reconciliation (§TL.5). */
CREATE OR REPLACE FUNCTION graph.tl_attention_class() RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT 'knowledge.trace_reconciliation' $$;

CREATE OR REPLACE FUNCTION graph.tl_iso(p timestamptz) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT CASE WHEN p IS NULL THEN NULL ELSE to_char(p AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') END
$$;

/* The clearance ranks (apps/api/src/shared/clearance.ts CLEARANCE_RANK); an unknown classification ranks highest (withheld), an unknown
   clearance lowest — the read never widens by a word it does not know. */
CREATE OR REPLACE FUNCTION graph.tl_rank(p text, p_default int) RETURNS int
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT CASE p WHEN 'public' THEN 0 WHEN 'internal' THEN 1 WHEN 'confidential' THEN 2 WHEN 'restricted' THEN 3 ELSE p_default END
$$;

/* The B10 header-only rule (objects.service.ts AUDIENCE_GOVERNED): the content of these types is read through their own governed reads,
   within their audiences — a timeline shows their header and withholds their content (counted, reason audience). */
CREATE OR REPLACE FUNCTION graph.tl_audience_governed() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY['MEM', 'BRF'] $$;

/* The first uuid a reference carries ('CLM:<uuid>@3', 'SRC:<uuid>@1', '<uuid>@2', 'blob:<uuid>'), or NULL. */
CREATE OR REPLACE FUNCTION graph.tl_ref_uuid(p text) RETURNS uuid
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT lower(substring(p from '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'))::uuid
$$;

/* A text bound read as an instant when it is one ('2024-01-14', '2024-01-14T00:00:00Z'), else NULL (an acquisition range's bound may be a
   sequence or a cursor; such a range is never dropped — it is shown as not placed on the axis). STABLE: the cast reads the session zone. */
CREATE OR REPLACE FUNCTION graph.tl_try_ts(p text) RETURNS timestamptz
LANGUAGE plpgsql STABLE SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF p IS NULL OR p !~ '^\d{4}-\d{2}-\d{2}([T ][0-9:.]+)?(Z|[+-]\d{2}(:?\d{2})?)?$' THEN RETURN NULL; END IF;
  RETURN CASE WHEN p ~ '^\d{4}-\d{2}-\d{2}$' THEN (p || 'T00:00:00Z')::timestamptz ELSE p::timestamptz END;
EXCEPTION WHEN others THEN RETURN NULL;
END $$;

/* THE CLOCK READING of one version (PR-22-005, CAP-UM-10, DESIGN D19): every flag it carries and the one the seam shows (the worst first):
   conflict (a §HD qualifier states conflicting times — the sources disagree) · observation_after_record (observed after it was recorded:
   the source clock and the record clock diverge) · unknown / degraded (the header's source_clock_quality, or a qualifier's clock quality) ·
   trusted. p_q: the version's qualifiers as [{axis, kind, clock_quality, conflicts}] or NULL (recorded before B50). */
CREATE OR REPLACE FUNCTION graph.tl_clock(p_observed timestamptz, p_recorded timestamptz, p_quality text, p_q jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
DECLARE v_flags text[] := ARRAY[]::text[]; q jsonb; v_detail jsonb := '[]'::jsonb;
BEGIN
  FOR q IN SELECT * FROM jsonb_array_elements(coalesce(p_q, '[]'::jsonb)) LOOP
    IF q ->> 'kind' = 'conflicting' AND NOT ('conflict' = ANY (v_flags)) THEN
      v_flags := v_flags || 'conflict'::text;
      v_detail := v_detail || jsonb_build_object('flag', 'conflict', 'axis', q ->> 'axis', 'conflicts', q -> 'conflicts');
    END IF;
  END LOOP;
  IF p_observed IS NOT NULL AND p_recorded IS NOT NULL AND p_observed > p_recorded THEN
    v_flags := v_flags || 'observation_after_record'::text;
    v_detail := v_detail || jsonb_build_object('flag', 'observation_after_record', 'observed_at', to_char(p_observed AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
      'recorded_at', to_char(p_recorded AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'), 'ahead_by', (p_observed - p_recorded)::text);
  END IF;
  IF p_quality = 'unknown' OR EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(p_q, '[]'::jsonb)) x WHERE x ->> 'clock_quality' = 'unknown') THEN
    v_flags := v_flags || 'unknown'::text; v_detail := v_detail || jsonb_build_object('flag', 'unknown', 'source_clock_quality', p_quality);
  ELSIF p_quality = 'degraded' OR EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(p_q, '[]'::jsonb)) x WHERE x ->> 'clock_quality' = 'degraded') THEN
    v_flags := v_flags || 'degraded'::text; v_detail := v_detail || jsonb_build_object('flag', 'degraded', 'source_clock_quality', p_quality);
  END IF;
  RETURN jsonb_build_object('clock', CASE WHEN 'conflict' = ANY (v_flags) THEN 'conflict' WHEN 'observation_after_record' = ANY (v_flags) THEN 'observation_after_record'
                                          WHEN 'unknown' = ANY (v_flags) THEN 'unknown' WHEN 'degraded' = ANY (v_flags) THEN 'degraded' ELSE 'trusted' END,
                            'flags', to_jsonb(v_flags), 'detail', v_detail);
END $$;

-- §TL.2 THE CITATION STATE AND THE MISSING INTERVALS ────────────────────────────────────────────────────────────────────────────────────
/* Does one header citation still RESOLVE? (PR-22-005 "a cited version that no longer resolves"). Over what §PV's closure resolves (this
   domain, a tenant-level object, a platform object — graph.pv_resolve's rule, so the timeline and the trace agree): resolved | unresolved
   (no such object, or no such version) | deleted (the cited object's latest version is deleted) | artifact (a blob manifest recorded in
   this domain) | opaque (not a typed citation — a method name, a URL: never a break). A DEFINER read because a DOMAIN reader's RLS hides
   tenant-level and platform objects, which still resolve; it returns only the state, the type and the version — never content. Guarded by
   the caller's bound scope (0102 N-01). */
CREATE OR REPLACE FUNCTION graph.tl_cite_state(p_tenant uuid, p_domain uuid, p_ref text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = graph, objects, observation, pg_catalog, pg_temp AS $$
DECLARE v_id uuid; v_type text; v_version int; v_latest int; v_latest_state text;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the state of a citation');
  IF p_ref IS NULL OR btrim(p_ref) = '' THEN RETURN jsonb_build_object('ref', p_ref, 'state', 'opaque'); END IF;
  IF p_ref ~* '^blob:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_id := graph.tl_ref_uuid(p_ref);
    RETURN jsonb_build_object('ref', p_ref, 'form', 'manifest', 'state',
      CASE WHEN EXISTS (SELECT 1 FROM observation.blob_manifests b WHERE b.manifest_id = v_id AND b.tenant_id = p_tenant AND b.domain_id = p_domain) THEN 'artifact' ELSE 'unresolved' END);
  END IF;
  IF p_ref !~* '^([A-Z]{3}:)?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(@[1-9][0-9]{0,8})?$' THEN
    RETURN jsonb_build_object('ref', p_ref, 'form', 'opaque', 'state', 'opaque');
  END IF;
  v_id := graph.tl_ref_uuid(p_ref);
  v_type := CASE WHEN p_ref ~ '^[A-Z]{3}:' THEN substring(p_ref from 1 for 3) END;
  v_version := CASE WHEN position('@' in p_ref) > 0 THEN split_part(p_ref, '@', 2)::int END;
  SELECT max(o.object_version)::int INTO v_latest FROM objects.canonical_objects o
   WHERE o.object_id = v_id AND (v_type IS NULL OR o.object_type = v_type)
     AND ((o.tenant_id = p_tenant AND o.domain_id = p_domain) OR (o.tenant_id = p_tenant AND o.domain_id IS NULL) OR o.tenant_id IS NULL);
  IF v_latest IS NULL THEN
    RETURN jsonb_build_object('ref', p_ref, 'form', 'typed', 'type', v_type, 'id', v_id, 'version', v_version, 'state', 'unresolved', 'reason', 'no recorded object of this tenant carries this id');
  END IF;
  IF v_version IS NOT NULL AND v_version > v_latest THEN
    RETURN jsonb_build_object('ref', p_ref, 'form', 'typed', 'type', v_type, 'id', v_id, 'version', v_version, 'state', 'unresolved', 'latest', v_latest,
      'reason', format('version %s is not recorded; the latest is %s', v_version, v_latest));
  END IF;
  SELECT o.lifecycle_state INTO v_latest_state FROM objects.canonical_objects o
   WHERE o.object_id = v_id AND o.object_version = v_latest AND ((o.tenant_id = p_tenant AND o.domain_id = p_domain) OR (o.tenant_id = p_tenant AND o.domain_id IS NULL) OR o.tenant_id IS NULL);
  IF v_latest_state = 'deleted' THEN
    RETURN jsonb_build_object('ref', p_ref, 'form', 'typed', 'type', v_type, 'id', v_id, 'version', v_version, 'state', 'deleted', 'latest', v_latest,
      'reason', format('the cited object is deleted (version %s)', v_latest));
  END IF;
  RETURN jsonb_build_object('ref', p_ref, 'form', 'typed', 'type', v_type, 'id', v_id, 'version', v_version, 'state', 'resolved', 'latest', v_latest);
END $$;

/* THE MISSING INTERVALS of the linked sources (PR-22-003), as KNOWN at the instant: (a) the declared incomplete acquisition ranges
   (observation.acquisition_incomplete_ranges, 0084 §4) declared by then — resolved only if resolved by then (a later resolution is said);
   (b) the source-health gaps (observation.source_health_events: degraded | failed | suspended | unknown until the next healthy
   evaluation known by then). A range whose bounds are not instants is shown unplaced, never dropped. INVOKER (the caller's RLS). */
CREATE OR REPLACE FUNCTION graph.tl_missing_intervals(p_tenant uuid, p_domain uuid, p_sources uuid[], p_from timestamptz, p_to timestamptz, p_as_of timestamptz) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = graph, observation, pg_catalog, pg_temp AS $$
  WITH src AS (SELECT DISTINCT ON (c.source_id) c.source_id, c.source_key FROM observation.source_contracts_current c
                WHERE c.tenant_id = p_tenant AND c.domain_id = p_domain AND c.source_id = ANY (coalesce(p_sources, ARRAY[]::uuid[])) ORDER BY c.source_id, c.contract_version DESC),
  ranges AS (
    SELECT jsonb_build_object('basis', 'acquisition_incomplete_ranges', 'range_id', r.range_id, 'source_id', r.source_id, 'source_key', s.source_key,
             'from', r.range_from, 'to', r.range_to, 'placed', graph.tl_try_ts(r.range_from) IS NOT NULL AND graph.tl_try_ts(r.range_to) IS NOT NULL,
             'reason', r.reason_class, 'detail', r.detail, 'declared_at', graph.tl_iso(r.declared_at),
             'resolved_at', CASE WHEN r.resolved_at IS NOT NULL AND r.resolved_at <= p_as_of THEN graph.tl_iso(r.resolved_at) END,
             'resolved_later', r.resolved_at IS NOT NULL AND r.resolved_at > p_as_of) AS x,
           coalesce(graph.tl_try_ts(r.range_from), r.declared_at) AS k
      FROM observation.acquisition_incomplete_ranges r JOIN src s ON s.source_id = r.source_id
     WHERE r.tenant_id = p_tenant AND r.domain_id = p_domain AND r.declared_at <= p_as_of
       AND (graph.tl_try_ts(r.range_from) IS NULL OR graph.tl_try_ts(r.range_to) IS NULL
            OR (graph.tl_try_ts(r.range_from) < p_to AND graph.tl_try_ts(r.range_to) > p_from))),
  health AS (
    SELECT h.source_id, s.source_key, h.new_state, h.reason, h.lag_class, h.evaluated_at,
           (SELECT min(k.evaluated_at) FROM observation.source_health_events k WHERE k.tenant_id = p_tenant AND k.domain_id = p_domain AND k.source_id = h.source_id
             AND k.new_state = 'healthy' AND k.evaluated_at > h.evaluated_at AND k.evaluated_at <= p_as_of) AS healed_at
      FROM observation.source_health_events h JOIN src s ON s.source_id = h.source_id
     WHERE h.tenant_id = p_tenant AND h.domain_id = p_domain AND h.new_state IN ('degraded', 'failed', 'suspended', 'unknown') AND h.evaluated_at <= p_as_of),
  gaps AS (
    SELECT jsonb_build_object('basis', 'source_health_events', 'source_id', g.source_id, 'source_key', g.source_key, 'from', graph.tl_iso(min(g.evaluated_at)),
             'to', graph.tl_iso(g.healed_at), 'placed', true, 'reason', 'source_health:' || (array_agg(g.new_state ORDER BY g.evaluated_at DESC))[1],
             'detail', (array_agg(g.reason || ' (lag class ' || g.lag_class || ')' ORDER BY g.evaluated_at DESC))[1], 'open', g.healed_at IS NULL) AS x,
           min(g.evaluated_at) AS k
      FROM health g GROUP BY g.source_id, g.source_key, g.healed_at
     HAVING min(g.evaluated_at) < p_to AND coalesce(g.healed_at, 'infinity'::timestamptz) > p_from)
  SELECT coalesce(jsonb_agg(u.x ORDER BY u.k, u.x ->> 'source_key'), '[]'::jsonb) FROM (SELECT * FROM ranges UNION ALL SELECT * FROM gaps) u
$$;

/* The SOURCES a set of canonical versions rests on (one hop): their own provenance_ref ('SRC:<id>@n' — a source id or the SRC object's id),
   the SRC objects they cite, and the provenance of the evidence / observations they cite. INVOKER. */
CREATE OR REPLACE FUNCTION graph.tl_linked_sources(p_tenant uuid, p_domain uuid, p_versions jsonb) RETURNS uuid[]
LANGUAGE sql STABLE SET search_path = graph, objects, observation, pg_catalog, pg_temp AS $$
  WITH v AS (SELECT (e ->> 'id')::uuid AS id, (e ->> 'version')::int AS version FROM jsonb_array_elements(coalesce(p_versions, '[]'::jsonb)) e),
  rows AS (SELECT o.* FROM objects.canonical_objects o JOIN v ON v.id = o.object_id AND v.version = o.object_version),
  cited AS (SELECT DISTINCT graph.tl_ref_uuid(r.ref) AS id FROM rows o CROSS JOIN LATERAL jsonb_array_elements_text(o.evidence_refs || o.source_object_ids) r(ref)),
  hop AS (SELECT DISTINCT ON (c.object_id) c.provenance_ref, c.object_type, c.object_id FROM objects.canonical_objects c JOIN cited ON cited.id = c.object_id
           WHERE c.tenant_id = p_tenant ORDER BY c.object_id, c.object_version DESC),
  ids AS (SELECT graph.tl_ref_uuid(o.provenance_ref) AS id FROM rows o WHERE o.provenance_ref ~ '^SRC:'
          UNION SELECT o.object_id FROM rows o WHERE o.object_type = 'SRC'
          UNION SELECT h.object_id FROM hop h WHERE h.object_type = 'SRC'
          UNION SELECT graph.tl_ref_uuid(h.provenance_ref) FROM hop h WHERE h.provenance_ref ~ '^SRC:')
  SELECT coalesce(array_agg(DISTINCT c.source_id), ARRAY[]::uuid[]) FROM observation.source_contracts_current c
   WHERE c.tenant_id = p_tenant AND c.domain_id = p_domain AND (c.source_id IN (SELECT id FROM ids) OR c.src_object_id IN (SELECT id FROM ids))
$$;

-- §TL.3 graph.timeline ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* THE TIMELINE (PR-22-001/002/003, CAP-UM-10): what happened, what was known, what was believed and what changed — over a SUBJECT (one
   object: every version) or a governed SCOPE (an APPROVED analytics.scopes row of B92: the objects it names by entity / objective id, and
   the objects whose header cites one of them), on one AXIS, in the window [p_from, p_to), AS KNOWN AT p_as_of (NULL: now, the database
   clock). SECURITY INVOKER: the rows are the caller's under its own RLS; nothing outside them is read except the guarded citation state.
   The reader's CLEARANCE (the route's clearanceOf) filters by classification; the filter is COUNTED. STABLE: reading records nothing. */
CREATE OR REPLACE FUNCTION graph.timeline(p_tenant uuid, p_domain uuid, p_subject_type text, p_subject_id uuid, p_scope_key text,
                                          p_from timestamptz, p_to timestamptz, p_axis text, p_as_of timestamptz, p_clearance text, p_limit int) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = graph, objects, observation, prediction, decision, executive, analytics, pg_catalog, pg_temp AS $$
DECLARE
  v_now timestamptz := clock_timestamp(); v_as_of timestamptz; v_limit int := coalesce(p_limit, 200); v_rank int;
  v_members uuid[]; v_scope analytics.scopes%ROWTYPE; v_subject jsonb; v_ids uuid[];
  v_items jsonb; v_events jsonb; v_reads jsonb := '{}'::jsonb; v_missing jsonb; v_sources uuid[];
  v_total int; v_withheld_class int; v_audience int; v_untimed int; v_broken jsonb; v_corrections int; v_clock jsonb; v_clock_n int;
  v_selected jsonb; v_latest int; v_known int; v_unattributed int;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the timeline');
  -- THE ASK, refused in the class form
  IF (p_subject_id IS NULL) = (p_scope_key IS NULL) THEN
    RAISE EXCEPTION 'timeline rejected (subject): a timeline names ONE subject (an object type and id) or ONE governed scope (its key), not both and not neither' USING ERRCODE = '22023';
  END IF;
  IF p_subject_id IS NOT NULL AND (p_subject_type IS NULL OR p_subject_type !~ '^[A-Z]{3}$') THEN
    RAISE EXCEPTION 'timeline rejected (subject): the subject names its object type (three capitals) with its id' USING ERRCODE = '22023';
  END IF;
  IF p_axis IS NULL OR NOT (p_axis = ANY (graph.tl_axes())) THEN
    RAISE EXCEPTION 'timeline rejected (axis): the axis is one of % (given %)', array_to_string(graph.tl_axes(), ', '), coalesce(p_axis, 'none') USING ERRCODE = '22023';
  END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_to <= p_from THEN
    RAISE EXCEPTION 'timeline rejected (window): the window names its start and its end, the end after the start' USING ERRCODE = '22023';
  END IF;
  IF p_as_of IS NOT NULL AND p_as_of > v_now THEN
    RAISE EXCEPTION 'timeline rejected (future): the as-of instant % is after now (% on the database clock); a timeline reconstructs what was recorded, never a future', graph.tl_iso(p_as_of), graph.tl_iso(v_now) USING ERRCODE = '22023';
  END IF;
  IF p_clearance IS NULL OR graph.tl_rank(p_clearance, -1) < 0 THEN
    RAISE EXCEPTION 'timeline rejected (clearance): the reader''s clearance is public, internal, confidential or restricted' USING ERRCODE = '22023';
  END IF;
  IF v_limit < 1 OR v_limit > 1000 THEN
    RAISE EXCEPTION 'timeline rejected (limit): a timeline lists 1 to 1000 versions (given %)', v_limit USING ERRCODE = '22023';
  END IF;
  v_as_of := coalesce(p_as_of, v_now);
  v_rank := graph.tl_rank(p_clearance, 0);

  -- THE SELECTION: the subject's versions, or the scope's members
  IF p_subject_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM objects.canonical_objects o WHERE o.object_id = p_subject_id AND o.object_type = p_subject_type) THEN
      -- DENIAL PRIVACY: an object that does not exist and one outside the caller's rows answer the same words
      RAISE EXCEPTION 'timeline rejected (unknown_object): no authorized % object matches this subject', p_subject_type USING ERRCODE = '23503';
    END IF;
    v_members := ARRAY[p_subject_id];
    v_subject := jsonb_build_object('kind', 'subject', 'type', p_subject_type, 'id', p_subject_id);
  ELSE
    SELECT * INTO v_scope FROM analytics.scopes s WHERE s.tenant_id = p_tenant AND s.domain_id = p_domain AND s.scope_key = p_scope_key AND s.state = 'approved';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'timeline rejected (unknown_scope): no approved governed scope % in this domain (a proposed, rejected or retired scope is not a timeline''s scope)', p_scope_key USING ERRCODE = '23503';
    END IF;
    v_members := v_scope.entity_ids || v_scope.objective_ids;
    v_subject := jsonb_build_object('kind', 'scope', 'scope_key', v_scope.scope_key, 'version', v_scope.version, 'title', v_scope.title, 'digest', v_scope.digest,
      'members', jsonb_build_object('entities', cardinality(v_scope.entity_ids), 'objectives', cardinality(v_scope.objective_ids)),
      'unmatched', jsonb_build_object('series_keys', to_jsonb(v_scope.series_keys), 'geographies', to_jsonb(v_scope.geographies),
        'note', 'the scope''s series and geographies are named by the scope; this read places objects by the entity and objective ids they are or cite, and says so'));
  END IF;

  -- THE CANDIDATES: every version KNOWN at the instant (bitemporal: recorded at or before as_of) with its axis span and its §HD qualifiers;
  -- the window on the axis; the policy filter (above the reader's clearance: withheld, counted, nothing of it shown); the bound
  WITH cand AS (
    SELECT o, q.q,
           CASE p_axis WHEN 'event' THEN coalesce((q.q -> 'event' ->> 'instant')::timestamptz, (q.q -> 'event' ->> 'earliest')::timestamptz, o.event_time)
                       WHEN 'observation' THEN coalesce((q.q -> 'observation' ->> 'instant')::timestamptz, (q.q -> 'observation' ->> 'earliest')::timestamptz, o.observation_time)
                       WHEN 'valid' THEN o.valid_from ELSE o.recorded_at END AS a_start,
           CASE p_axis WHEN 'event' THEN coalesce((q.q -> 'event' ->> 'latest')::timestamptz, (q.q -> 'event' ->> 'instant')::timestamptz, o.event_time)
                       WHEN 'observation' THEN coalesce((q.q -> 'observation' ->> 'latest')::timestamptz, (q.q -> 'observation' ->> 'instant')::timestamptz, o.observation_time)
                       WHEN 'valid' THEN coalesce(o.valid_to, 'infinity'::timestamptz) ELSE o.recorded_at END AS a_end
      FROM objects.canonical_objects o
      LEFT JOIN LATERAL (SELECT jsonb_object_agg(t.axis, jsonb_build_object('axis', t.axis, 'kind', t.kind, 'instant', graph.tl_iso(t.instant), 'earliest', graph.tl_iso(t.earliest),
                           'latest', graph.tl_iso(t.latest), 'precision', t.time_precision, 'zone', t.zone, 'source', t.source, 'rule', t.rule, 'conflicts', t.conflicts,
                           'clock_quality', t.clock_quality, 'declared', t.declared)) AS q
                           FROM objects.time_qualifiers t WHERE t.object_id = o.object_id AND t.object_version = o.object_version) q ON true
     WHERE o.tenant_id = p_tenant AND o.domain_id = p_domain AND o.recorded_at <= v_as_of
       AND (CASE WHEN p_subject_id IS NOT NULL THEN o.object_id = p_subject_id AND o.object_type = p_subject_type
                 ELSE o.object_id = ANY (v_members)
                      OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(o.source_object_ids || o.evidence_refs) c(v) WHERE graph.tl_ref_uuid(c.v) = ANY (v_members))
                      OR graph.tl_ref_uuid(o.payload ->> 'entity_id') = ANY (v_members) OR graph.tl_ref_uuid(o.payload ->> 'objective_id') = ANY (v_members) END)),
  win AS (SELECT c.* FROM cand c WHERE c.a_start IS NOT NULL AND c.a_start < p_to AND coalesce(c.a_end, c.a_start) >= p_from),
  vis AS (SELECT w.* FROM win w WHERE graph.tl_rank((w.o).classification, 99) <= v_rank),
  sel AS (SELECT v.* FROM vis v ORDER BY v.a_start, (v.o).recorded_at, (v.o).object_id, (v.o).object_version LIMIT v_limit),
  enriched AS (
    SELECT s.*, (s.o).object_type = ANY (graph.tl_audience_governed()) AS header_only,
           graph.tl_clock((s.o).observation_time, (s.o).recorded_at, (s.o).source_clock_quality, (SELECT jsonb_agg(x) FROM jsonb_each(s.q) e(k, x))) AS clk,
           (SELECT jsonb_build_object('version', n.object_version, 'at', graph.tl_iso(n.recorded_at), 'by', coalesce(n.human_refs ->> 0, n.accountable_owner), 'lifecycle', n.lifecycle_state,
                     'correction_of', n.correction_of, 'supersedes', n.supersedes, 'withdrawal_reason', n.withdrawal_reason, 'known_at_as_of', n.recorded_at <= v_as_of)
              FROM objects.canonical_objects n WHERE n.object_id = (s.o).object_id AND n.object_version > (s.o).object_version
             ORDER BY n.object_version LIMIT 1) AS later,
           (SELECT coalesce(jsonb_agg(jsonb_build_object('case_id', cc.case_id, 'kind', cc.kind, 'state', cc.state, 'received_at', graph.tl_iso(cc.received_at),
                     'known_at_as_of', cc.received_at <= v_as_of) ORDER BY cc.received_at), '[]'::jsonb)
              FROM observation.correction_current cc
             WHERE cc.tenant_id = p_tenant AND cc.domain_id = p_domain AND cc.received_at > (s.o).recorded_at
               AND EXISTS (SELECT 1 FROM jsonb_array_elements(cc.affected_resolved) a WHERE a ->> 'object_id' = (s.o).object_id::text)) AS cases,
           (SELECT coalesce(jsonb_agg(st ORDER BY st ->> 'ref'), '[]'::jsonb)
              FROM (SELECT DISTINCT r.v FROM jsonb_array_elements_text((s.o).evidence_refs || (s.o).source_object_ids) r(v)
                    UNION SELECT (s.o).object_type || ':' || (s.o).correction_of WHERE (s.o).correction_of ~ '^[0-9a-fA-F-]{36}@[1-9][0-9]*$') rr
             CROSS JOIN LATERAL graph.tl_cite_state(p_tenant, p_domain, rr.v) st WHERE st ->> 'state' IN ('unresolved', 'deleted')) AS broken,
           (SELECT max(m.object_version) FROM objects.canonical_objects m WHERE m.object_id = (s.o).object_id AND m.recorded_at <= v_as_of) AS known_version
      FROM sel s),
  items AS (
    SELECT e.*, jsonb_build_object(
             'ref', (e.o).object_type || ':' || (e.o).object_id || '@' || (e.o).object_version, 'object_type', (e.o).object_type, 'object_id', (e.o).object_id, 'version', (e.o).object_version,
             'title', CASE WHEN e.header_only THEN format('%s %s — its content is read through its own governed read (header only here)', (e.o).object_type, left((e.o).object_id::text, 8))
                           ELSE left(coalesce((e.o).payload ->> 'title', (e.o).payload ->> 'statement', (e.o).payload ->> 'subject', (e.o).payload ->> 'label', (e.o).object_type || ' ' || (e.o).object_id::text), 300) END,
             'header_only', e.header_only,
             'event_time', graph.tl_iso((e.o).event_time), 'observed_at', graph.tl_iso((e.o).observation_time), 'valid_from', graph.tl_iso((e.o).valid_from), 'valid_to', graph.tl_iso((e.o).valid_to),
             'recorded_at', graph.tl_iso((e.o).recorded_at), 'axis_start', graph.tl_iso(e.a_start), 'axis_end', CASE WHEN e.a_end = 'infinity'::timestamptz THEN NULL ELSE graph.tl_iso(e.a_end) END,
             'time_precision', (e.o).time_precision, 'source_clock_quality', (e.o).source_clock_quality,
             'time', CASE WHEN e.q IS NULL THEN NULL ELSE (SELECT jsonb_agg(x ORDER BY x ->> 'axis') FROM jsonb_each(e.q) j(k, x)) END, 'time_stated', e.q IS NOT NULL,
             'clock', e.clk ->> 'clock', 'clock_flags', e.clk -> 'flags', 'clock_detail', e.clk -> 'detail',
             'lifecycle', (e.o).lifecycle_state, 'truth_state', (e.o).truth_state, 'synthetic', (e.o).synthetic_state, 'classification', (e.o).classification,
             'owner', (e.o).accountable_owner, 'digest', (e.o).content_digest, 'believed_at_as_of', (e.o).object_version = e.known_version,
             'corrected_later', e.later, 'correction_cases', e.cases, 'broken_lineage', e.broken) AS j
      FROM enriched e)
  SELECT (SELECT count(*) FROM cand c WHERE c.a_start IS NULL),
         (SELECT count(*) FROM win w WHERE graph.tl_rank((w.o).classification, 99) > v_rank),
         (SELECT count(*) FROM vis),
         (SELECT coalesce(jsonb_agg(i.j ORDER BY i.a_start, (i.o).recorded_at, (i.o).object_id, (i.o).object_version), '[]'::jsonb) FROM items i),
         (SELECT coalesce(jsonb_agg(jsonb_build_object('id', (i.o).object_id, 'version', (i.o).object_version)), '[]'::jsonb) FROM items i),
         (SELECT count(*) FROM items i WHERE i.header_only),
         (SELECT coalesce(jsonb_agg(jsonb_build_object('ref', i.j ->> 'ref', 'cites', b ->> 'ref', 'state', b ->> 'state', 'reason', b ->> 'reason') ORDER BY i.j ->> 'ref', b ->> 'ref'), '[]'::jsonb)
            FROM items i CROSS JOIN LATERAL jsonb_array_elements(i.broken) b),
         (SELECT count(*) FROM items i WHERE i.later IS NOT NULL OR jsonb_array_length(i.cases) > 0),
         (SELECT count(*) FROM items i WHERE i.clk ->> 'clock' <> 'trusted'),
         (SELECT jsonb_build_object('degraded', count(*) FILTER (WHERE i.clk -> 'flags' ? 'degraded'), 'unknown', count(*) FILTER (WHERE i.clk -> 'flags' ? 'unknown'),
                                    'observation_after_record', count(*) FILTER (WHERE i.clk -> 'flags' ? 'observation_after_record'), 'conflict', count(*) FILTER (WHERE i.clk -> 'flags' ? 'conflict')) FROM items i),
         (SELECT coalesce(array_agg(DISTINCT (i.o).object_id), ARRAY[]::uuid[]) FROM items i)
    INTO v_untimed, v_withheld_class, v_total, v_items, v_selected, v_audience, v_broken, v_corrections, v_clock_n, v_clock, v_ids;
  IF p_subject_id IS NOT NULL THEN v_ids := v_ids || p_subject_id; END IF;

  -- THE EVENT LEDGERS of the selected objects (record time: occurred in the window, known by the instant)
  WITH ev AS (
    SELECT 'lifecycle'::text AS ledger, 'lifecycle.' || t.outcome || ':' || t.action AS event, t.recorded_at AS at, t.actor_principal_id::text AS actor,
           t.object_type || ':' || t.object_id AS ref,
           jsonb_build_object('from', t.from_state, 'to', t.to_state, 'new_version', t.new_version, 'refusal_code', t.refusal_code, 'kind', t.kind) AS details
      FROM objects.lifecycle_transitions t WHERE t.object_id = ANY (v_ids)
    UNION ALL
    SELECT 'warning', e.event, e.occurred_at, e.actor_principal_id::text, 'WRN:' || e.warning_id, jsonb_build_object('level', e.details ->> 'level', 'context_version', e.details ->> 'context_version')
      FROM prediction.warning_events e WHERE e.warning_id = ANY (v_ids)
    UNION ALL
    SELECT 'package', e.event, e.occurred_at, e.actor_principal_id::text, 'DPK:' || e.package_id, jsonb_build_object('version', e.details ->> 'version')
      FROM decision.package_events e WHERE e.package_id = ANY (v_ids)
    UNION ALL
    SELECT 'decision_snapshot', 'replay.recorded', x.replayed_at, x.reader_principal_id::text, 'DPK:' || x.package_id || '@' || x.version,
           jsonb_build_object('replay_id', x.replay_id, 'version', x.version, 'known_at', graph.tl_iso(x.known_at), 'observed_through', x.observed_through, 'decided_at', graph.tl_iso(x.decided_at),
                              'as_of', graph.tl_iso(x.as_of), 'content_digest', x.content_digest, 'header_digest', x.header_digest, 'unavailable', jsonb_array_length(x.unavailable))
      FROM decision.replays x WHERE x.package_id = ANY (v_ids)
    UNION ALL
    SELECT 'custody', c.event, c.occurred_at, c.actor, 'EVD:' || c.evd_object_id, jsonb_build_object('manifest_id', c.manifest_id, 'digest_verified', c.digest_verified)
      FROM observation.custody_events c WHERE c.evd_object_id = ANY (v_ids)
    UNION ALL
    SELECT 'challenge', e.event, e.occurred_at, e.actor_principal_id::text, k.subject_type || ':' || k.subject_id || '@' || k.subject_version, jsonb_build_object('challenge_id', k.challenge_id, 'state', k.state)
      FROM graph.knowledge_challenge_events e JOIN graph.knowledge_challenges k ON k.challenge_id = e.challenge_id WHERE k.subject_id = ANY (v_ids)
    UNION ALL
    SELECT 'fitness', 'fitness.marked:' || m.verdict, m.marked_at, m.marked_by::text, m.object_type || ':' || m.object_id || '@' || m.object_version,
           jsonb_build_object('mark_id', m.mark_id, 'verdict', m.verdict, 'reasons', to_jsonb(m.reasons), 'route', m.route)
      FROM graph.product_fitness_marks m WHERE m.object_id = ANY (v_ids)
    UNION ALL
    SELECT 'correction', ce.event, ce.occurred_at, ce.actor, 'case:' || cc.case_id, jsonb_build_object('case_id', cc.case_id, 'kind', cc.kind)
      FROM observation.correction_events ce JOIN observation.correction_current cc ON cc.case_id = ce.case_id
     WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(cc.affected_resolved) a WHERE (a ->> 'object_id') = ANY (SELECT unnest(v_ids)::text))
    UNION ALL
    SELECT 'invalidation', 'invalidation.' || i.state, i.opened_at, i.opened_by::text, 'INV:' || i.invalidation_id,
           jsonb_build_object('invalidation_id', i.invalidation_id, 'trigger_kind', i.trigger_kind, 'trigger_object_id', i.trigger_object_id, 'correction_case_id', i.correction_case_id)
      FROM graph.invalidations_current i WHERE i.trigger_object_id = ANY (v_ids))
  SELECT coalesce(jsonb_agg(jsonb_build_object('ledger', ev.ledger, 'event', ev.event, 'at', graph.tl_iso(ev.at), 'actor', ev.actor, 'ref', ev.ref, 'details', ev.details)
                            ORDER BY ev.at, ev.ledger, ev.event), '[]'::jsonb)
    INTO v_events FROM (SELECT * FROM ev WHERE ev.at >= p_from AND ev.at < p_to AND ev.at <= v_as_of ORDER BY ev.at LIMIT v_limit) ev;

  -- THE EXISTING AS-OF READS (a subject only): the known-at version, the lifecycle replay, the warning / scenario / decision as-of reads
  IF p_subject_id IS NOT NULL THEN
    SELECT max(o.object_version) FILTER (WHERE o.recorded_at <= v_as_of), max(o.object_version) INTO v_known, v_latest
      FROM objects.canonical_objects o WHERE o.object_id = p_subject_id AND o.object_type = p_subject_type;
    v_reads := jsonb_build_object('known_at', jsonb_build_object('version', v_known, 'latest', v_latest, 'versions_after', coalesce(v_latest, 0) - coalesce(v_known, 0),
      'statement', CASE WHEN v_known IS NULL THEN format('no version of this object was recorded by %s', graph.tl_iso(v_as_of))
                        WHEN v_known = v_latest THEN format('version %s was believed at %s and is the latest recorded', v_known, graph.tl_iso(v_as_of))
                        ELSE format('version %s was believed at %s; %s later version(s) were recorded after it (the latest is %s)', v_known, graph.tl_iso(v_as_of), v_latest - v_known, v_latest) END));
    IF EXISTS (SELECT 1 FROM objects.lifecycle_profiles lp WHERE lp.object_type = p_subject_type) THEN
      BEGIN
        v_reads := v_reads || jsonb_build_object('lifecycle', objects.lifecycle_replay(p_tenant, p_domain, p_subject_id, v_as_of));
      EXCEPTION WHEN others THEN v_reads := v_reads || jsonb_build_object('lifecycle', jsonb_build_object('unavailable', SQLERRM));
      END;
    END IF;
    IF p_subject_type = 'WRN' THEN
      BEGIN
        v_reads := v_reads || jsonb_build_object('warning', prediction.warning_as_of(p_subject_id, v_as_of));
      EXCEPTION WHEN others THEN v_reads := v_reads || jsonb_build_object('warning', jsonb_build_object('unavailable', SQLERRM));
      END;
    ELSIF p_subject_type = 'SCN' THEN
      v_reads := v_reads || jsonb_build_object('scenario', jsonb_build_object('version', prediction.scenario_version_as_of(p_subject_id, v_as_of)));
    ELSIF p_subject_type = 'DPK' THEN
      v_reads := v_reads || jsonb_build_object('decision', (SELECT jsonb_build_object('replays', coalesce(jsonb_agg(jsonb_build_object('replay_id', x.replay_id, 'version', x.version, 'known_at', graph.tl_iso(x.known_at),
          'decided_at', graph.tl_iso(x.decided_at), 'as_of', graph.tl_iso(x.as_of), 'content_digest', x.content_digest, 'replayed_at', graph.tl_iso(x.replayed_at)) ORDER BY x.replayed_at), '[]'::jsonb),
          'statement', 'the decision-time snapshots recorded for this package (decision.replays, 0043): what the decision was taken with, reconstructed and digested at the replay') FROM decision.replays x
         WHERE x.package_id = p_subject_id AND x.replayed_at <= v_as_of));
    END IF;
  END IF;

  -- THE MISSING INTERVALS of the sources the selection rests on
  v_sources := graph.tl_linked_sources(p_tenant, p_domain, v_selected);
  v_missing := graph.tl_missing_intervals(p_tenant, p_domain, v_sources, p_from, p_to, v_as_of);
  SELECT count(*) INTO v_unattributed FROM observation.acquisition_incomplete_ranges r
   WHERE r.tenant_id = p_tenant AND r.domain_id = p_domain AND r.declared_at <= v_as_of AND (r.resolved_at IS NULL OR r.resolved_at > v_as_of) AND NOT (r.source_id = ANY (v_sources));

  RETURN jsonb_build_object(
    'method', graph.tl_method(), 'subject', v_subject,
    'window', jsonb_build_object('from', graph.tl_iso(p_from), 'to', graph.tl_iso(p_to), 'axis', p_axis),
    'as_of', graph.tl_iso(v_as_of), 'live', p_as_of IS NULL, 'read_at', graph.tl_iso(v_now), 'clearance', p_clearance,
    'items', v_items, 'events', v_events, 'as_of_reads', v_reads,
    'sources', to_jsonb(v_sources),
    'disclosure', jsonb_build_object(
      'missing_intervals', v_missing,
      'unattributed_open_ranges', v_unattributed,
      'withheld', jsonb_build_object('count', v_withheld_class + v_audience,
                                     'reason', CASE WHEN v_withheld_class >= v_audience AND v_withheld_class > 0 THEN 'classification' WHEN v_audience > 0 THEN 'audience' ELSE 'policy' END),
      'withheld_by_reason', jsonb_build_object('classification', v_withheld_class, 'audience', v_audience),
      'clock_flags', v_clock_n, 'clock', v_clock,
      'broken_lineage', v_broken,
      'corrections_later', v_corrections,
      'untimed', v_untimed,
      'bounds', jsonb_build_object('limit', v_limit, 'listed', jsonb_array_length(v_items), 'matched', v_total, 'truncated', v_total > v_limit),
      'incomplete', jsonb_array_length(v_missing) > 0 OR v_withheld_class + v_audience > 0 OR v_clock_n > 0 OR jsonb_array_length(v_broken) > 0 OR v_total > v_limit),
    'claim', 'a projection of what was recorded, as known at the instant — it rewrites, re-orders by authority and conceals nothing: a later correction is shown, a missing interval is shown, a policy filter is counted, a clock divergence is flagged, a citation that no longer resolves is listed');
END $$;

-- §TL.4 graph.trace ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* THE SOURCE-TO-PRODUCT TRACE (PR-22-001/005, AT-22): §PV's graph.explain PROJECTED — the object nodes staged source → evidence → claim →
   product (→ decision: a package version, and the decision-time snapshots recorded for it), the production and contest nodes as STEPS of
   the object they attach to, the gaps and unresolved edges PRESERVED. Each object node read again under the CALLER's rows: its clock, its
   later correction, its policy filtering (another domain's object the caller cannot read, a classification above the clearance, an
   audience-governed type — the label withheld and counted, the node kept). The missing intervals of the sources it rests on; the CHAPTER
   CONTINUITY through B81's shell.degraded_state (each such source's contract in force, or its undeclared degradation); the reconciliation
   items already routed. INCOMPLETE — with every reason — when any of these is found. SECURITY INVOKER. */
CREATE OR REPLACE FUNCTION graph.trace(p_tenant uuid, p_domain uuid, p_type text, p_id uuid, p_version int, p_clearance text) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = graph, objects, observation, decision, executive, shell, pg_catalog, pg_temp AS $$
DECLARE
  x jsonb; v_nd jsonb; o objects.canonical_objects; v_rank int; v_nodes jsonb := '[]'::jsonb; v_steps jsonb := '[]'::jsonb; v_ref jsonb; v_stage text; v_q jsonb;
  v_clk jsonb; v_later jsonb; v_withheld jsonb := jsonb_build_object('classification', 0, 'audience', 0, 'not_visible', 0); v_label text; v_versions jsonb := '[]'::jsonb;
  v_sources uuid[]; v_missing jsonb; v_cont jsonb := '[]'::jsonb; s record; v_dg jsonb; v_snap jsonb := '[]'::jsonb; v_reasons jsonb := '[]'::jsonb;
  v_unresolved jsonb; v_routed jsonb; v_clock_n int := 0; v_corr int := 0; v_now timestamptz := clock_timestamp(); v_obj_ids text[];
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the trace of a product');
  IF p_type IS NULL OR p_type !~ '^[A-Z]{3}$' OR p_id IS NULL OR p_version IS NULL OR p_version < 1 THEN
    RAISE EXCEPTION 'trace rejected (subject): a trace names a recorded product as type (three capitals), id and version' USING ERRCODE = '22023';
  END IF;
  IF p_clearance IS NULL OR graph.tl_rank(p_clearance, -1) < 0 THEN
    RAISE EXCEPTION 'trace rejected (clearance): the reader''s clearance is public, internal, confidential or restricted' USING ERRCODE = '22023';
  END IF;
  v_rank := graph.tl_rank(p_clearance, 0);
  SELECT * INTO o FROM objects.canonical_objects c WHERE c.object_id = p_id AND c.object_type = p_type AND c.object_version = p_version AND c.tenant_id = p_tenant AND c.domain_id = p_domain;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'trace rejected (unknown_object): no authorized % version % matches this link', p_type, p_version USING ERRCODE = '23503';
  END IF;
  IF graph.tl_rank(o.classification, 99) > v_rank THEN
    RAISE EXCEPTION 'trace rejected (clearance): the product is classified %, above the reader''s clearance %; its trace is not shown', o.classification, p_clearance USING ERRCODE = '42501';
  END IF;
  x := graph.explain(p_tenant, p_domain, p_type, p_id, p_version);

  -- the object nodes, staged and read again under the caller's rows
  FOR v_nd IN SELECT * FROM jsonb_array_elements(x -> 'nodes') e WHERE e ->> 'node_id' LIKE 'obj:%' LOOP
    v_ref := graph.pv_ref(v_nd ->> 'ref');
    o := NULL;
    SELECT * INTO o FROM objects.canonical_objects c WHERE c.object_id = (v_ref ->> 'id')::uuid AND c.object_version = (v_ref ->> 'version')::int AND c.object_type = v_ref ->> 'type';
    v_stage := CASE WHEN v_ref ->> 'type' IN ('DPK', 'DEC') THEN 'decision' WHEN v_nd ->> 'kind' IN ('source', 'evidence', 'claim', 'product') THEN v_nd ->> 'kind' ELSE 'product' END;
    v_label := v_nd ->> 'label'; v_clk := NULL; v_later := NULL; v_q := NULL;
    IF o.object_id IS NULL THEN
      v_label := 'not visible to you — recorded in another domain of the tenant, or outside your rows (the node is kept; its content is not shown)';
      v_withheld := jsonb_set(v_withheld, '{not_visible}', to_jsonb((v_withheld ->> 'not_visible')::int + 1));
    ELSE
      v_versions := v_versions || jsonb_build_object('id', o.object_id, 'version', o.object_version);
      IF graph.tl_rank(o.classification, 99) > v_rank THEN
        v_label := format('withheld — classified %s, above your clearance %s (the node is kept)', o.classification, p_clearance);
        v_withheld := jsonb_set(v_withheld, '{classification}', to_jsonb((v_withheld ->> 'classification')::int + 1));
      ELSIF o.object_type = ANY (graph.tl_audience_governed()) THEN
        v_label := format('%s %s — its content is read through its own governed read (header only here)', o.object_type, left(o.object_id::text, 8));
        v_withheld := jsonb_set(v_withheld, '{audience}', to_jsonb((v_withheld ->> 'audience')::int + 1));
      END IF;
      SELECT jsonb_agg(jsonb_build_object('axis', t.axis, 'kind', t.kind, 'clock_quality', t.clock_quality, 'conflicts', t.conflicts, 'instant', graph.tl_iso(t.instant),
                                          'earliest', graph.tl_iso(t.earliest), 'latest', graph.tl_iso(t.latest), 'precision', t.time_precision, 'zone', t.zone, 'source', t.source, 'declared', t.declared))
        INTO v_q FROM objects.time_qualifiers t WHERE t.object_id = o.object_id AND t.object_version = o.object_version;
      v_clk := graph.tl_clock(o.observation_time, o.recorded_at, o.source_clock_quality, v_q);
      IF v_clk ->> 'clock' <> 'trusted' THEN v_clock_n := v_clock_n + 1; END IF;
      SELECT jsonb_build_object('version', l.object_version, 'at', graph.tl_iso(l.recorded_at), 'by', coalesce(l.human_refs ->> 0, l.accountable_owner), 'lifecycle', l.lifecycle_state)
        INTO v_later FROM objects.canonical_objects l WHERE l.object_id = o.object_id AND l.object_version > o.object_version ORDER BY l.object_version LIMIT 1;
      IF v_later IS NOT NULL THEN v_corr := v_corr + 1; END IF;
    END IF;
    v_nodes := v_nodes || (v_nd || jsonb_build_object('stage', v_stage, 'label', v_label, 'visible', o.object_id IS NOT NULL,
      'event_time', graph.tl_iso(o.event_time), 'observed_at', graph.tl_iso(o.observation_time), 'valid_from', graph.tl_iso(o.valid_from), 'valid_to', graph.tl_iso(o.valid_to),
      'recorded_at', graph.tl_iso(o.recorded_at), 'time', v_q, 'clock', coalesce(v_clk ->> 'clock', 'unknown'), 'clock_flags', coalesce(v_clk -> 'flags', '[]'::jsonb),
      'clock_detail', coalesce(v_clk -> 'detail', '[]'::jsonb), 'corrected_later', v_later));
  END LOOP;
  -- the gap nodes (unresolved) are kept as nodes of their stage; the production / contest nodes are STEPS of the objects resting on them
  FOR v_nd IN SELECT * FROM jsonb_array_elements(x -> 'nodes') e WHERE e ->> 'node_id' LIKE 'gap:%' LOOP
    v_nodes := v_nodes || (v_nd || jsonb_build_object('stage', CASE WHEN v_nd ->> 'kind' = 'evidence' THEN 'evidence' ELSE 'source' END, 'visible', true, 'clock', 'unknown', 'clock_flags', '[]'::jsonb,
      'clock_detail', '[]'::jsonb, 'corrected_later', NULL));
  END LOOP;
  SELECT coalesce(jsonb_agg(e || jsonb_build_object('of', (SELECT coalesce(jsonb_agg(p ->> 'node_id'), '[]'::jsonb) FROM jsonb_array_elements(x -> 'nodes') p
                                                           WHERE p ->> 'node_id' LIKE 'obj:%' AND p -> 'parents' ? (e ->> 'node_id')))), '[]'::jsonb)
    INTO v_steps FROM jsonb_array_elements(x -> 'nodes') e WHERE e ->> 'node_id' NOT LIKE 'obj:%' AND e ->> 'node_id' NOT LIKE 'gap:%';
  SELECT coalesce(jsonb_agg(n ORDER BY CASE n ->> 'stage' WHEN 'source' THEN 0 WHEN 'evidence' THEN 1 WHEN 'claim' THEN 2 WHEN 'product' THEN 3 ELSE 4 END,
                               coalesce((n ->> 'depth')::int, 0) DESC, n ->> 'node_id'), '[]'::jsonb) INTO v_nodes FROM jsonb_array_elements(v_nodes) n;

  -- the unresolved edges, preserved (PR-22-005: "the unresolved edge preserved")
  SELECT coalesce(jsonb_agg(e), '[]'::jsonb) INTO v_unresolved FROM jsonb_array_elements(x -> 'edges') e WHERE e ->> 'to' IS NULL AND e ->> 'resolution' IN ('unresolved');

  -- the decision-time snapshots of the packages in the trace
  SELECT array_agg(n ->> 'ref') INTO v_obj_ids FROM jsonb_array_elements(v_nodes) n WHERE n ->> 'stage' = 'decision';
  SELECT coalesce(jsonb_agg(jsonb_build_object('node_id', 'replay:' || r.replay_id, 'kind', 'decision_snapshot', 'stage', 'decision', 'ref', 'DPK:' || r.package_id || '@' || r.version,
           'label', format('the decision-time snapshot of version %s: known at %s, decided at %s, digest %s', r.version, graph.tl_iso(r.known_at), graph.tl_iso(r.decided_at), left(r.content_digest, 12)),
           'known_at', graph.tl_iso(r.known_at), 'decided_at', graph.tl_iso(r.decided_at), 'as_of', graph.tl_iso(r.as_of), 'content_digest', r.content_digest, 'replayed_at', graph.tl_iso(r.replayed_at),
           'unavailable', r.unavailable) ORDER BY r.replayed_at), '[]'::jsonb)
    INTO v_snap FROM decision.replays r WHERE ('DPK:' || r.package_id || '@' || r.version) = ANY (coalesce(v_obj_ids, ARRAY[]::text[]));

  -- the sources it rests on: their missing intervals and the chapter continuity (B81's degraded contracts)
  v_sources := graph.tl_linked_sources(p_tenant, p_domain, v_versions);
  v_missing := graph.tl_missing_intervals(p_tenant, p_domain, v_sources, '-infinity'::timestamptz, 'infinity'::timestamptz, v_now);
  SELECT coalesce(jsonb_agg(m), '[]'::jsonb) INTO v_missing FROM jsonb_array_elements(v_missing) m WHERE m ->> 'resolved_at' IS NULL;
  FOR s IN SELECT DISTINCT ON (c.source_id) c.source_id, c.source_key FROM observation.source_contracts_current c
            WHERE c.tenant_id = p_tenant AND c.domain_id = p_domain AND c.source_id = ANY (v_sources) ORDER BY c.source_id, c.contract_version DESC LOOP
    v_dg := shell.degraded_state(p_tenant, p_domain, NULL, 'source', s.source_key);
    IF (v_dg ->> 'degraded')::boolean THEN
      v_cont := v_cont || jsonb_build_object('dependency', jsonb_build_object('kind', 'source', 'key', s.source_key), 'source_id', s.source_id,
        'contracts', (SELECT coalesce(jsonb_agg(c), '[]'::jsonb) FROM jsonb_array_elements(v_dg -> 'contracts') c WHERE (c ->> 'in_force')::boolean),
        'undeclared', v_dg -> 'undeclared', 'unavailable_functions', v_dg -> 'unavailable_functions');
    END IF;
  END LOOP;
  SELECT coalesce(jsonb_agg(jsonb_build_object('item_id', i.item_id, 'state', i.state, 'outcome', i.outcome, 'owner', i.owner_principal_id, 'route_roles', to_jsonb(i.route_roles),
           'created_at', graph.tl_iso(i.created_at), 'version', (i.details ->> 'version')::int, 'problems', i.details -> 'problems') ORDER BY i.created_at), '[]'::jsonb)
    INTO v_routed FROM executive.attention_items i
   WHERE i.tenant_id = p_tenant AND i.domain_id = p_domain AND i.signal_class = graph.tl_attention_class() AND i.subject_id = p_id;

  -- THE REASONS a trace is incomplete (each said; the reconciliation routes exactly these)
  IF jsonb_array_length(x -> 'gaps') > 0 OR jsonb_array_length(v_unresolved) > 0 THEN
    v_reasons := v_reasons || jsonb_build_object('reason', 'broken_lineage', 'count', jsonb_array_length(x -> 'gaps'),
      'detail', (SELECT coalesce(jsonb_agg(DISTINCT g ->> 'kind'), '[]'::jsonb) FROM jsonb_array_elements(x -> 'gaps') g));
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(x -> 'gaps') g WHERE g ->> 'kind' IN ('broken_custody', 'unverifiable_artifact')) THEN
    v_reasons := v_reasons || jsonb_build_object('reason', 'evidence_unavailable', 'count', (SELECT count(*) FROM jsonb_array_elements(x -> 'gaps') g WHERE g ->> 'kind' IN ('broken_custody', 'unverifiable_artifact')));
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_nodes) n WHERE n -> 'clock_flags' ? 'conflict') THEN
    v_reasons := v_reasons || jsonb_build_object('reason', 'time_conflict', 'count', (SELECT count(*) FROM jsonb_array_elements(v_nodes) n WHERE n -> 'clock_flags' ? 'conflict'));
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_nodes) n WHERE n -> 'clock_flags' ?| ARRAY['observation_after_record', 'degraded']) THEN
    v_reasons := v_reasons || jsonb_build_object('reason', 'clock_divergence', 'count', (SELECT count(*) FROM jsonb_array_elements(v_nodes) n WHERE n -> 'clock_flags' ?| ARRAY['observation_after_record', 'degraded']));
  END IF;
  -- an UNKNOWN source clock is the source's own stated limitation (an uploaded document's clock is unknown): its own reason, so a reader
  -- tells it from a divergence an owner can reconcile — and still incomplete (the map: source_clock_quality degraded / unknown)
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_nodes) n WHERE n -> 'clock_flags' ? 'unknown') THEN
    v_reasons := v_reasons || jsonb_build_object('reason', 'clock_unknown', 'count', (SELECT count(*) FROM jsonb_array_elements(v_nodes) n WHERE n -> 'clock_flags' ? 'unknown'));
  END IF;
  IF jsonb_array_length(v_missing) > 0 THEN v_reasons := v_reasons || jsonb_build_object('reason', 'missing_interval', 'count', jsonb_array_length(v_missing)); END IF;
  IF jsonb_array_length(v_cont) > 0 THEN v_reasons := v_reasons || jsonb_build_object('reason', 'continuity_degraded', 'count', jsonb_array_length(v_cont)); END IF;
  IF (v_withheld ->> 'not_visible')::int + (v_withheld ->> 'classification')::int > 0 THEN
    v_reasons := v_reasons || jsonb_build_object('reason', 'policy_filtered', 'count', (v_withheld ->> 'not_visible')::int + (v_withheld ->> 'classification')::int);
  END IF;
  IF (x ->> 'truncated')::boolean THEN v_reasons := v_reasons || jsonb_build_object('reason', 'bounded', 'count', (x ->> 'examined')::int); END IF;

  RETURN jsonb_build_object(
    'method', graph.tl_method(), 'explain_method', x ->> 'method', 'ref', x ->> 'ref', 'root', x ->> 'root', 'read_at', graph.tl_iso(v_now), 'clearance', p_clearance,
    'product', x -> 'product', 'nodes', v_nodes, 'steps', v_steps, 'edges', x -> 'edges', 'unresolved_edges', v_unresolved, 'gaps', x -> 'gaps',
    'decision_snapshots', v_snap, 'sources', to_jsonb(v_sources), 'missing_intervals', v_missing, 'continuity',
    jsonb_build_object('state', CASE WHEN jsonb_array_length(v_cont) > 0 THEN 'degraded' ELSE 'normal' END, 'dependencies', v_cont,
                       'basis', 'shell.degraded_state of each source the trace rests on (B81 §DG): a contract in force, or a degradation no contract declares'),
    'disclosure', jsonb_build_object('withheld', jsonb_build_object('count', (v_withheld ->> 'classification')::int + (v_withheld ->> 'audience')::int + (v_withheld ->> 'not_visible')::int,
                                       'reason', CASE WHEN (v_withheld ->> 'classification')::int > 0 THEN 'classification' WHEN (v_withheld ->> 'audience')::int > 0 THEN 'audience' ELSE 'policy' END),
                                     'withheld_by_reason', v_withheld, 'clock_flags', v_clock_n, 'corrections_later', v_corr, 'truncated', (x ->> 'truncated')::boolean, 'examined', x -> 'examined'),
    'reasons', v_reasons, 'incomplete', jsonb_array_length(v_reasons) > 0, 'reconciliation', v_routed, 'carried', x -> 'carried',
    'claim', 'the explanation projected source → evidence → claims → product: every unresolved edge kept, every filter counted, every clock divergence flagged; reading it records and changes nothing');
END $$;

-- §TL.5 THE RECONCILIATION ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
-- THE VOCABULARY, WIDENED BY UNION: the attention class `knowledge.trace_reconciliation` and the subject kind `canonical_object`. The list
-- function and the two CHECKs are read as they stand at this point of the fold and re-stated with §TL's entries appended — so §CL's
-- widening (correction_propagation_stall), folded before or after, is kept either way (copying 0115's literal here would drop it).
DO $$
DECLARE v_classes text[]; v_def text; v_vals text[];
BEGIN
  v_classes := executive.attention_signal_classes();
  IF NOT ('knowledge.trace_reconciliation' = ANY (v_classes)) THEN
    v_classes := v_classes || ARRAY['knowledge.trace_reconciliation'];   -- B50 tl: the trace reconciliation (PR-22-005)
    EXECUTE format('CREATE OR REPLACE FUNCTION executive.attention_signal_classes() RETURNS text[] LANGUAGE sql IMMUTABLE AS $f$ SELECT ARRAY[%s] $f$',
                   (SELECT string_agg(quote_literal(c), ', ' ORDER BY n) FROM unnest(v_classes) WITH ORDINALITY u(c, n)));
  END IF;
  -- the two CHECKs, re-stated as IN-lists (pg_get_constraintdef renders them ARRAY['…'::text, …] again, so a later union reads them the same way)
  SELECT pg_get_constraintdef(c.oid) INTO v_def FROM pg_constraint c WHERE c.conrelid = 'executive.attention_items'::regclass AND c.conname = 'attention_items_signal_class_check';
  SELECT array_agg(r.m[1] ORDER BY r.n) INTO v_vals FROM regexp_matches(v_def, '''([^'']+)''', 'g') WITH ORDINALITY r(m, n);
  IF NOT ('knowledge.trace_reconciliation' = ANY (v_vals)) THEN
    v_vals := v_vals || ARRAY['knowledge.trace_reconciliation'];
    ALTER TABLE executive.attention_items DROP CONSTRAINT attention_items_signal_class_check;
    EXECUTE format('ALTER TABLE executive.attention_items ADD CONSTRAINT attention_items_signal_class_check CHECK (signal_class IN (%s))',
                   (SELECT string_agg(quote_literal(c), ', ' ORDER BY n) FROM unnest(v_vals) WITH ORDINALITY u(c, n)));
  END IF;
  SELECT pg_get_constraintdef(c.oid) INTO v_def FROM pg_constraint c WHERE c.conrelid = 'executive.attention_items'::regclass AND c.conname = 'attention_items_subject_kind_check';
  SELECT array_agg(r.m[1] ORDER BY r.n) INTO v_vals FROM regexp_matches(v_def, '''([^'']+)''', 'g') WITH ORDINALITY r(m, n);
  IF NOT ('canonical_object' = ANY (v_vals)) THEN
    v_vals := v_vals || ARRAY['canonical_object'];
    ALTER TABLE executive.attention_items DROP CONSTRAINT attention_items_subject_kind_check;
    EXECUTE format('ALTER TABLE executive.attention_items ADD CONSTRAINT attention_items_subject_kind_check CHECK (subject_kind IN (%s))',
                   (SELECT string_agg(quote_literal(c), ', ' ORDER BY n) FROM unnest(v_vals) WITH ORDINALITY u(c, n)));
  END IF;
END $$;

/* ROUTE THE RECONCILIATION of an incomplete trace (PR-22-005 "reconciliation routed"): the PORT reads the trace itself (never the caller's
   claim of a problem) and refuses a complete one; it raises ONE attention item per (product version, problem set) — a repeat answers the
   item it made — owned by the product's accountable owner when that owner is an active person of the tenant (else the knowledge roles are
   accountable), evaluated under the domain's ACTIVE attention policy (no rule for the class: abstained → deprioritized, still visible and
   owned). The requester: a person — the product's owner, a knowledge owner, a data steward, a record authority, an analyst or a domain
   administrator; re-checked here. Nothing in the product changes: the reconciliation is the owner's to do. */
CREATE OR REPLACE FUNCTION graph.route_trace_reconciliation(p_item_id uuid, p_tenant uuid, p_domain uuid, p_type text, p_id uuid, p_version int, p_note text,
                                                            p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = graph, executive, identity, governance, observation, objects, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid := public.eye_principal(); o objects.canonical_objects; t jsonb; v_problems jsonb; v_cause uuid; v_owner uuid; x executive.attention_items%ROWTYPE;
        pol executive.attention_policies%ROWTYPE; v_eval jsonb; v_route jsonb; v_state text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.timeline.reconcile']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'trace reconciliation rejected (actor): the reconciliation is routed by the acting principal' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM identity.principals p WHERE p.id = v_actor AND p.kind = 'human' AND p.status = 'active') THEN
    RAISE EXCEPTION 'trace reconciliation rejected (actor): a reconciliation is routed by a person, never an agent' USING ERRCODE = '42501';
  END IF;
  IF p_item_id IS NULL OR p_correlation IS NULL THEN
    RAISE EXCEPTION 'trace reconciliation rejected (request): the request names its item id and its correlation' USING ERRCODE = '22023';
  END IF;
  IF p_note IS NULL OR length(btrim(p_note)) < 8 OR length(p_note) > 2000 THEN
    RAISE EXCEPTION 'trace reconciliation rejected (reason): the request says what the owner should reconcile (8 to 2000 characters)' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO o FROM objects.canonical_objects c WHERE c.object_id = p_id AND c.object_type = p_type AND c.object_version = p_version AND c.tenant_id = p_tenant AND c.domain_id = p_domain;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'trace reconciliation rejected (unknown_object): no % version % of this domain matches', p_type, p_version USING ERRCODE = '23503';
  END IF;
  v_owner := graph.pv_owner(o.accountable_owner);
  IF NOT (v_actor IS NOT DISTINCT FROM v_owner
          OR governance.holds_role(v_actor, p_tenant, p_domain, ARRAY['knowledge_owner', 'data_steward', 'record_authority', 'domain_analyst', 'domain_admin'])) THEN
    RAISE EXCEPTION 'trace reconciliation rejected (authority): a reconciliation is routed by the product''s owner, a knowledge owner, a data steward, a record authority, an analyst or a domain administrator' USING ERRCODE = '42501';
  END IF;
  t := graph.trace(p_tenant, p_domain, p_type, p_id, p_version, 'restricted');
  IF NOT (t ->> 'incomplete')::boolean THEN
    RAISE EXCEPTION 'trace reconciliation rejected (state): the trace of % v% is complete — nothing is routed for reconciliation', p_type, p_version USING ERRCODE = '22023';
  END IF;
  v_problems := t -> 'reasons';
  v_cause := md5(p_type || ':' || p_id || '@' || p_version || '|' || v_problems::text)::uuid;
  SELECT * INTO x FROM executive.attention_items i WHERE i.tenant_id = p_tenant AND i.domain_id = p_domain AND i.signal_class = graph.tl_attention_class() AND i.subject_id = p_id AND i.cause_event_id = v_cause;
  IF FOUND THEN
    RETURN jsonb_build_object('item_id', x.item_id, 'repeated', true, 'state', x.state, 'outcome', x.outcome, 'owner', x.owner_principal_id, 'route_roles', to_jsonb(x.route_roles),
                              'problems', x.details -> 'problems', 'ref', p_type || ':' || p_id || '@' || p_version);
  END IF;
  v_owner := CASE WHEN v_owner IS NOT NULL AND EXISTS (SELECT 1 FROM identity.principals p WHERE p.id = v_owner AND p.kind = 'human' AND p.status = 'active' AND (p.tenant_id = p_tenant OR p.scope = 'PLATFORM')) THEN v_owner END;
  SELECT * INTO pol FROM executive.attention_policies a WHERE a.tenant_id = p_tenant AND a.domain_id = p_domain AND a.state = 'active';
  v_eval := executive.evaluate_attention(CASE WHEN pol.policy_id IS NULL THEN NULL ELSE pol.rules END, graph.tl_attention_class(),
                                         jsonb_build_object('consequence', 'C2', 'confidence', 1)) || jsonb_build_object('policy_version', pol.version);
  v_route := executive.attention_route(pol.rules, graph.tl_attention_class(), v_eval ->> 'outcome', v_owner, p_tenant, p_domain);
  v_state := v_route ->> 'state';
  INSERT INTO executive.attention_items (item_id, scope, tenant_id, domain_id, signal_class, subject_kind, subject_id, cause_event_id, cause_event_type, title, outcome, state,
                                         owner_principal_id, route_roles, policy_id, policy_version, evaluation, details, due_at, escalations, correlation_id)
  VALUES (p_item_id, 'DOMAIN', p_tenant, p_domain, graph.tl_attention_class(), 'canonical_object', p_id, v_cause, 'TraceIncomplete',
          left(format('Reconcile the trace of %s v%s: %s', p_type, p_version, (SELECT string_agg(r ->> 'reason', ', ') FROM jsonb_array_elements(v_problems) r)), 512),
          v_eval ->> 'outcome', v_state, v_owner,
          CASE WHEN v_owner IS NULL AND jsonb_array_length(coalesce(v_route -> 'route_roles', '[]'::jsonb)) = 0 THEN ARRAY['knowledge_owner', 'data_steward']
               ELSE ARRAY(SELECT jsonb_array_elements_text(v_route -> 'route_roles')) END,
          pol.policy_id, pol.version, v_eval,
          jsonb_build_object('ref', p_type || ':' || p_id || '@' || p_version, 'type', p_type, 'id', p_id, 'version', p_version, 'problems', v_problems, 'note', btrim(p_note),
                             'unresolved_edges', t -> 'unresolved_edges', 'missing_intervals', t -> 'missing_intervals', 'continuity', t -> 'continuity', 'requested_by', v_actor,
                             'accountable_owner', o.accountable_owner, 'method', graph.tl_method()),
          (v_route ->> 'due_at')::timestamptz, (v_route ->> 'escalations')::int, p_correlation);
  PERFORM executive.attention_event(p_item_id, p_tenant, p_domain,
            CASE v_state WHEN 'open' THEN 'item.routed' WHEN 'escalated' THEN 'item.escalated' WHEN 'unrouted' THEN 'item.unrouted' ELSE 'item.deprioritized' END,
            v_actor, jsonb_build_object('outcome', v_eval ->> 'outcome', 'reasons', v_eval -> 'reasons', 'policy_version', pol.version, 'owner', v_owner, 'route_roles', v_route -> 'route_roles',
                                        'due_at', v_route -> 'due_at', 'cause_event_id', v_cause, 'cause_event_type', 'TraceIncomplete', 'problems', v_problems), p_correlation);
  SELECT * INTO x FROM executive.attention_items i WHERE i.item_id = p_item_id;
  RETURN jsonb_build_object('item_id', x.item_id, 'repeated', false, 'state', x.state, 'outcome', x.outcome, 'owner', x.owner_principal_id, 'route_roles', to_jsonb(x.route_roles),
                            'problems', v_problems, 'ref', p_type || ':' || p_id || '@' || p_version, 'evaluation', v_eval);
END $$;

-- §TL.6 GRANTS ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION graph.tl_method(), graph.tl_axes(), graph.tl_attention_class(), graph.tl_iso(timestamptz), graph.tl_rank(text, int), graph.tl_audience_governed(),
                       graph.tl_ref_uuid(text), graph.tl_try_ts(text), graph.tl_clock(timestamptz, timestamptz, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.tl_method(), graph.tl_axes(), graph.tl_attention_class(), graph.tl_iso(timestamptz), graph.tl_rank(text, int), graph.tl_audience_governed(),
                          graph.tl_ref_uuid(text), graph.tl_try_ts(text), graph.tl_clock(timestamptz, timestamptz, text, jsonb) TO eye_app, eye_commit;
REVOKE ALL ON FUNCTION graph.tl_cite_state(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.tl_cite_state(uuid, uuid, text) TO eye_app, eye_commit;
REVOKE ALL ON FUNCTION graph.tl_missing_intervals(uuid, uuid, uuid[], timestamptz, timestamptz, timestamptz), graph.tl_linked_sources(uuid, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.tl_missing_intervals(uuid, uuid, uuid[], timestamptz, timestamptz, timestamptz), graph.tl_linked_sources(uuid, uuid, jsonb) TO eye_app, eye_commit;
REVOKE ALL ON FUNCTION graph.timeline(uuid, uuid, text, uuid, text, timestamptz, timestamptz, text, timestamptz, text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.timeline(uuid, uuid, text, uuid, text, timestamptz, timestamptz, text, timestamptz, text, int) TO eye_app, eye_commit;
REVOKE ALL ON FUNCTION graph.trace(uuid, uuid, text, uuid, int, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.trace(uuid, uuid, text, uuid, int, text) TO eye_app, eye_commit;
REVOKE ALL ON FUNCTION graph.route_trace_reconciliation(uuid, uuid, uuid, text, uuid, int, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.route_trace_reconciliation(uuid, uuid, uuid, text, uuid, int, text, uuid, uuid) TO eye_commit;
