-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0113 §MCB — CP-6 B92 COMPUTATIONS B: provenance, knowledge, observation, search, memory, agents and operations (App M MET-006..018 and
-- MET-031..040). Part-local; applies alone on 0001–0112 + the prelude (0113 §0). Re-declares nothing of another part.
--
-- WHAT THIS PART BUILDS
--   §MCB.0  internal helpers (a reference's resolution to an exact source version, a record's lineage walk, the scope's sources, the cap);
--   §MCB.1  the TEMPORAL REQUIREMENTS register (MET-009 needs a per-object-type declaration of the required time fields: a named product
--           analytics owner declares it — human-gated, versioned, append-only) and its port analytics.declare_temporal_requirement;
--   §MCB.2  the SEARCH REVIEWS register (MET-014 needs a human review of a search's results: a named analyst or owner — never the searcher —
--           marks a search relevant or not and classes its query; ROLE-LEVEL only) and its port analytics.review_search;
--   §MCB.3  fifteen computations of the 0113 §0.7 contract, each registered (analytics.register_computation) with its kind, dimensions,
--           reads and scope rule. The eight App M rows with no honest source in the product (MET-015, -016, -032, -034, -035, -038, -039,
--           -040) have NO computation: their contracts (src/analytics/computations-b/definitions-b.ts) carry computationKey null and the
--           unsupported reason naming the carrier stage — served `unsupported`, visible, never a fake computation.
--
-- THE READINGS (App M gives meaning, scope, threshold, cadence and owner — never numerator, denominator, population or window): each
-- computation's header states this product's reading; each contract repeats it for the approving owner (PR-70-003). Every computation:
--   * reads ONLY rows recorded at or before p_as_of (replay) and inside [p_from, p_to) on the RECORD clock — a world clock is refused as an
--     explained reason where the source has no world time (never silently re-read on another clock);
--   * returns RECORDS (the drill-down) naming records — never a person: no principal id, no person dimension (D4);
--   * reports in its `quality` the newest record of its population (newest_record_at), how many records it excluded (excluded_count) and
--     the population's composition (counts by a meaningful category — analytics.mcb_finish); never `distinct_actors` (no §MCB cohort is
--     a role cohort);
--   * where the product cannot tell an input, says so as a REASON (→ indeterminate, never 0);
--   * where a population exceeds the traceable bound (p_params.max_records, default 50 000 records), returns NO value and says so (a result
--     is either traceable record by record or not computed — never a silent sample);
--   * where it reads a CURRENT-state table (a row updated in place), says so in quality.notes: a replay at the original as-of then reports
--     `mismatch` if that state moved since — honest, never hidden.
-- SOFTWARE CAPABILITY vs SYNTHETIC DEMONSTRATION vs ACCEPTANCE: these computations are software capability. The harness proves them on
-- SYNTHETIC planted records; nothing here is a real-provider or signed acceptance (R2 / B107 / H3 carry those).
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- §MCB.0 INTERNAL HELPERS (no runtime grant: called inside the definer computations and ports only) ───────────────────────────────────────

/* The traceable bound of a computation's population (records). */
CREATE OR REPLACE FUNCTION analytics.mcb_cap(p_params jsonb) RETURNS int
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT least(200000, greatest(1, coalesce(CASE WHEN coalesce(p_params ->> 'max_records', '') ~ '^[0-9]{1,6}$' THEN (p_params ->> 'max_records')::int END, 50000)))
$$;
REVOKE ALL ON FUNCTION analytics.mcb_cap(jsonb) FROM PUBLIC;

/* The answer of a computation that cannot run on the definition's clock: no records, the reason. */
CREATE OR REPLACE FUNCTION analytics.mcb_clock_refused(p_kind text, p_metric text, p_why text, p_params jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object('kind', p_kind, 'records', '[]'::jsonb,
    'reasons', jsonb_build_array(format('%s is measured on the record clock only: %s; the definition names the %s clock — not computed on another clock', p_metric, p_why, coalesce(p_params ->> 'clock', 'record'))),
    'quality', jsonb_build_object('clock', coalesce(p_params ->> 'clock', 'record'), 'newest_record_at', NULL, 'excluded_count', 0, 'composition', jsonb_build_object('by', NULL, 'counts', '{}'::jsonb)))
$$;
REVOKE ALL ON FUNCTION analytics.mcb_clock_refused(text, text, text, jsonb) FROM PUBLIC;

/* The answer of a computation whose population exceeds the traceable bound: no records, the reason (never a silent sample). */
CREATE OR REPLACE FUNCTION analytics.mcb_over_cap(p_kind text, p_metric text, p_count bigint, p_cap int, p_clock text) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object('kind', p_kind, 'records', '[]'::jsonb,
    'reasons', jsonb_build_array(format('%s: the population holds %s records, above the traceable bound %s (params.max_records): a result is traceable record by record or not computed — narrow the cohort or the window', p_metric, p_count, p_cap)),
    'quality', jsonb_build_object('clock', p_clock, 'population_upper_bound', p_count, 'max_records', p_cap, 'newest_record_at', NULL, 'excluded_count', 0,
                                  'composition', jsonb_build_object('by', NULL, 'counts', '{}'::jsonb)))
$$;
REVOKE ALL ON FUNCTION analytics.mcb_over_cap(text, text, bigint, int, text) FROM PUBLIC;

/* THE QUALITY EVERY COMPUTATION REPORTS (the integrator's contract, beside its own notes): the newest record of its population, how many
   records it excluded, and the population's COMPOSITION — counts by a meaningful category of the metric (an object type, a source, a
   class …; `role` for a metric whose records carry no finer category). Applied to every answer, including the explained refusals. */
CREATE OR REPLACE FUNCTION analytics.mcb_finish(p_out jsonb, p_category text, p_newest timestamptz) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT p_out || jsonb_build_object('quality', coalesce(p_out -> 'quality', '{}'::jsonb) || jsonb_build_object(
    'newest_record_at', p_newest,
    'excluded_count', (SELECT count(*) FROM jsonb_array_elements(coalesce(p_out -> 'records', '[]'::jsonb)) x WHERE x ->> 'role' = 'excluded'),
    'composition', jsonb_build_object('by', p_category, 'counts', coalesce((SELECT jsonb_object_agg(z.k, z.n) FROM (
        SELECT coalesce(x -> 'detail' ->> p_category, x ->> p_category, '(none)') AS k, count(*) AS n
          FROM jsonb_array_elements(coalesce(p_out -> 'records', '[]'::jsonb)) x GROUP BY 1) z), '{}'::jsonb))))
$$;
REVOKE ALL ON FUNCTION analytics.mcb_finish(jsonb, text, timestamptz) FROM PUBLIC;

/* The SOURCES a scope reaches (D8's rule for source-based metrics): a source concerns the scope when it feeds a series named in
   series_keys, or a series whose subject entity is in entity_ids (prediction.series_registry.source_key → the source's contracts). NULL
   for a NULL scope (the whole domain). An empty array when the scope reaches no source (the population is then empty — said by the port). */
CREATE OR REPLACE FUNCTION analytics.mcb_scope_sources(p_tenant uuid, p_domain uuid, p_scope jsonb) RETURNS uuid[]
LANGUAGE sql STABLE SET search_path = analytics, observation, prediction, pg_catalog, pg_temp AS $$
  SELECT CASE WHEN p_scope IS NULL THEN NULL ELSE coalesce((
    SELECT array_agg(DISTINCT c.source_id ORDER BY c.source_id)
      FROM prediction.series_registry s JOIN observation.source_contracts_current c ON c.source_key = s.source_key AND c.tenant_id = s.tenant_id AND c.domain_id = s.domain_id
     WHERE s.tenant_id = p_tenant AND s.domain_id = p_domain
       AND (s.series_key IN (SELECT jsonb_array_elements_text(coalesce(p_scope -> 'series_keys', '[]'::jsonb)))
            OR s.subject_entity_id::text IN (SELECT jsonb_array_elements_text(coalesce(p_scope -> 'entity_ids', '[]'::jsonb))))), '{}'::uuid[]) END
$$;
REVOKE ALL ON FUNCTION analytics.mcb_scope_sources(uuid, uuid, jsonb) FROM PUBLIC;

/* THE RESOLUTION OF ONE REFERENCE to an exact, accessible source version (MET-006's and MET-007's judgement), at p_as_of:
     `TYP:<uuid>@<n>`  an exact canonical version (pinned explicitly);
     `TYP:<uuid>`, `evidence:<uuid>` (EVD), `forecast:<uuid>` (FCT), `claim:<uuid>` / `strategy:<uuid>` (a canonical record of any
                       type), a bare `<uuid>` — resolved to the version CURRENT AT p_at (the citing record's own record time: pinned as-of);
     `blob:<uuid>`     the stored bytes (a vault manifest);
     anything else     a REGISTER reference (a gateway call, a review case, a graph entity or edge row, a candidate, a flip …) — not an
                       evidence citation of a source version; classed `register`, judged nothing. (Read off the product's records: an
                       `entity:` / `edge:` id names a graph register row, not a canonical record; `claim:`, `strategy:`, `forecast:` and
                       `evidence:` ids name canonical records.)
   p_digest / p_byte_end (a claim's lineage): the EVD version whose content digest is the lineage's digest, and the segment inside its bytes.
   Resolved = the version exists (recorded ≤ p_as_of) in this tenant (a DOMAIN record of THIS domain, or a tenant/platform record), is of the
   named type, its object is not withdrawn or deleted as of p_as_of, and — evidence — its bytes are stored and not tombstoned as of p_as_of
   (an archived manifest still resolves: its tier is named). The reader's own clearance is NOT judged here (a definer judges the record;
   the drill-down reads under the reader's RLS). */
CREATE OR REPLACE FUNCTION analytics.mcb_resolve(p_tenant uuid, p_domain uuid, p_ref text, p_at timestamptz, p_as_of timestamptz, p_digest text DEFAULT NULL, p_byte_end int DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = analytics, objects, observation, pg_catalog, pg_temp AS $$
DECLARE m text[]; v_prefix text; v_type text; v_id uuid; v_ver bigint; o objects.canonical_objects%ROWTYPE; v_latest text; v_pin text; v_man uuid; v_out jsonb;
        bm observation.blob_manifests%ROWTYPE; v_tomb timestamptz; v_tier text;
BEGIN
  m := regexp_match(btrim(coalesce(p_ref, '')), '^([A-Za-z][A-Za-z-]*):([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})(@([0-9]{1,9}))?$');
  IF m IS NULL THEN
    IF btrim(coalesce(p_ref, '')) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN m := ARRAY['', btrim(p_ref), NULL, NULL];
    ELSE RETURN jsonb_build_object('class', 'register', 'prefix', CASE WHEN position(':' IN coalesce(p_ref, '')) > 0 THEN split_part(p_ref, ':', 1) ELSE 'unparsed' END);
    END IF;
  END IF;
  v_prefix := m[1]; v_id := m[2]::uuid; v_ver := CASE WHEN m[4] IS NOT NULL THEN m[4]::bigint END;
  IF v_prefix = 'blob' THEN
    SELECT * INTO bm FROM observation.blob_manifests b WHERE b.manifest_id = v_id AND b.tenant_id = p_tenant AND b.domain_id = p_domain AND b.created_at <= p_as_of;
    IF NOT FOUND THEN RETURN jsonb_build_object('class', 'blob', 'resolved', false, 'reason', 'the cited bytes have no stored manifest in this domain as of the as-of'); END IF;
    SELECT t.tombstoned_at INTO v_tomb FROM observation.blob_tombstones t WHERE t.manifest_id = v_id AND t.tombstoned_at <= p_as_of;
    IF v_tomb IS NOT NULL THEN RETURN jsonb_build_object('class', 'blob', 'resolved', false, 'reason', format('the cited bytes were tombstoned at %s', v_tomb)); END IF;
    SELECT coalesce((SELECT r.tier FROM observation.blob_tier_records r WHERE r.manifest_id = v_id AND r.moved_at <= p_as_of ORDER BY r.moved_at DESC, r.record_id DESC LIMIT 1), 'hot') INTO v_tier;
    RETURN jsonb_build_object('class', 'blob', 'resolved', true, 'tier', v_tier);
  END IF;
  v_type := CASE WHEN v_prefix ~ '^[A-Z]{3}$' THEN v_prefix WHEN v_prefix = 'evidence' THEN 'EVD' WHEN v_prefix = 'forecast' THEN 'FCT' WHEN v_prefix IN ('claim', 'strategy', '') THEN NULL ELSE '?' END;
  IF v_type = '?' THEN RETURN jsonb_build_object('class', 'register', 'prefix', v_prefix); END IF;
  IF p_digest IS NOT NULL THEN
    SELECT * INTO o FROM objects.canonical_objects x WHERE x.object_id = v_id AND x.recorded_at <= p_as_of AND x.payload ->> 'content_digest' = p_digest ORDER BY x.object_version DESC LIMIT 1;
    v_pin := 'lineage_digest';
  ELSIF v_ver IS NOT NULL THEN
    SELECT * INTO o FROM objects.canonical_objects x WHERE x.object_id = v_id AND x.object_version = v_ver AND x.recorded_at <= p_as_of;
    v_pin := 'explicit';
  ELSE
    SELECT * INTO o FROM objects.canonical_objects x WHERE x.object_id = v_id AND x.recorded_at <= least(coalesce(p_at, p_as_of), p_as_of) ORDER BY x.object_version DESC LIMIT 1;
    v_pin := 'as_of';
  END IF;
  IF o.object_id IS NULL THEN
    RETURN jsonb_build_object('class', 'canonical', 'resolved', false, 'pin', v_pin, 'reason', CASE v_pin
      WHEN 'lineage_digest' THEN 'no version of the cited evidence carries the digest the lineage names'
      WHEN 'explicit' THEN format('version %s of the cited record does not exist (as of the as-of)', v_ver)
      ELSE 'no version of the cited record existed when it was cited' END);
  END IF;
  v_out := jsonb_build_object('class', 'canonical', 'pin', v_pin, 'type', o.object_type, 'id', o.object_id, 'version', o.object_version);
  IF o.tenant_id IS NOT NULL AND o.tenant_id <> p_tenant THEN RETURN v_out || jsonb_build_object('resolved', false, 'reason', 'the cited record belongs to another tenant'); END IF;
  IF o.scope = 'DOMAIN' AND o.domain_id <> p_domain THEN RETURN v_out || jsonb_build_object('resolved', false, 'reason', 'the cited record belongs to another domain (not accessible here)'); END IF;
  IF v_type IS NOT NULL AND o.object_type <> v_type THEN RETURN v_out || jsonb_build_object('resolved', false, 'reason', format('the citation names a %s; the record is a %s', v_type, o.object_type)); END IF;
  SELECT x.lifecycle_state INTO v_latest FROM objects.canonical_objects x WHERE x.object_id = o.object_id AND x.recorded_at <= p_as_of ORDER BY x.object_version DESC LIMIT 1;
  IF v_latest IN ('withdrawn', 'deleted') THEN RETURN v_out || jsonb_build_object('resolved', false, 'reason', format('the cited record is %s as of the as-of (no longer an accessible source)', v_latest)); END IF;
  IF p_byte_end IS NOT NULL AND (o.payload ->> 'byte_length') ~ '^[0-9]+$' AND p_byte_end > (o.payload ->> 'byte_length')::bigint THEN
    RETURN v_out || jsonb_build_object('resolved', false, 'reason', format('the cited segment ends at byte %s, beyond the evidence''s %s bytes', p_byte_end, o.payload ->> 'byte_length'));
  END IF;
  IF o.object_type = 'EVD' THEN
    v_man := CASE WHEN coalesce(o.payload ->> 'manifest_id', '') ~* '^[0-9a-f-]{36}$' THEN (o.payload ->> 'manifest_id')::uuid END;
    IF v_man IS NULL OR NOT EXISTS (SELECT 1 FROM observation.blob_manifests b WHERE b.manifest_id = v_man AND b.created_at <= p_as_of) THEN
      RETURN v_out || jsonb_build_object('resolved', false, 'reason', 'the evidence names no stored bytes (no manifest)');
    END IF;
    SELECT t.tombstoned_at INTO v_tomb FROM observation.blob_tombstones t WHERE t.manifest_id = v_man AND t.tombstoned_at <= p_as_of;
    IF v_tomb IS NOT NULL THEN RETURN v_out || jsonb_build_object('resolved', false, 'reason', format('the evidence''s bytes were tombstoned at %s', v_tomb)); END IF;
    SELECT coalesce((SELECT r.tier FROM observation.blob_tier_records r WHERE r.manifest_id = v_man AND r.moved_at <= p_as_of ORDER BY r.moved_at DESC, r.record_id DESC LIMIT 1), 'hot') INTO v_tier;
    v_out := v_out || jsonb_build_object('tier', v_tier);
  END IF;
  RETURN v_out || jsonb_build_object('resolved', true);
END $$;
REVOKE ALL ON FUNCTION analytics.mcb_resolve(uuid, uuid, text, timestamptz, timestamptz, text, int) FROM PUBLIC;

/* THE LINEAGE WALK of one record (MET-007): from the record, upstream through every evidence reference, source object and claim lineage,
   to its ORIGINS — stored bytes (an EVD whose bytes resolve, a blob), a registered source (SRC), or a named human's declaration (a record
   whose only provenance is its human_refs: the declaration is its own origin, stated). COMPLETE when no path breaks: every canonical
   reference resolves (mcb_resolve) and every record reaches an origin. Bounded: 200 records, depth 8 — beyond the bound it is NOT complete
   (said). Register references are context, not walked. */
CREATE OR REPLACE FUNCTION analytics.mcb_lineage(p_tenant uuid, p_domain uuid, p_root text, p_as_of timestamptz) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = analytics, objects, intelligence, pg_catalog, pg_temp AS $$
DECLARE v_queue text[] := ARRAY[p_root]; v_depths int[] := ARRAY[0]; v_seen text[] := '{}'; v_i int := 1; v_ref text; v_depth int; r jsonb; o objects.canonical_objects%ROWTYPE;
        v_up text[]; v_u text; v_broken jsonb := '[]'::jsonb; v_origins jsonb := '[]'::jsonb; v_nodes int := 0; v_maxdepth int := 0; v_key text; v_walkable int;
BEGIN
  WHILE v_i <= coalesce(array_length(v_queue, 1), 0) LOOP
    v_ref := v_queue[v_i]; v_depth := v_depths[v_i]; v_i := v_i + 1;
    r := analytics.mcb_resolve(p_tenant, p_domain, v_ref, p_as_of, p_as_of);
    IF r ->> 'class' = 'register' THEN CONTINUE; END IF;
    v_key := coalesce((r ->> 'type') || ':' || (r ->> 'id') || '@' || (r ->> 'version'), v_ref);
    IF v_key = ANY (v_seen) THEN CONTINUE; END IF;
    v_seen := v_seen || v_key; v_nodes := v_nodes + 1; v_maxdepth := greatest(v_maxdepth, v_depth);
    IF v_nodes > 200 OR v_depth > 8 THEN
      v_broken := v_broken || jsonb_build_object('ref', v_ref, 'reason', 'beyond the walk bound (200 records, depth 8): the lineage is not shown complete');
      EXIT;
    END IF;
    IF NOT (r ->> 'resolved')::boolean THEN v_broken := v_broken || jsonb_build_object('ref', v_ref, 'reason', r ->> 'reason'); CONTINUE; END IF;
    IF r ->> 'class' = 'blob' THEN v_origins := v_origins || jsonb_build_object('origin', 'bytes', 'ref', v_ref); CONTINUE; END IF;
    IF r ->> 'type' IN ('EVD', 'SRC') THEN v_origins := v_origins || jsonb_build_object('origin', CASE r ->> 'type' WHEN 'EVD' THEN 'evidence' ELSE 'source' END, 'ref', v_key); CONTINUE; END IF;
    SELECT * INTO o FROM objects.canonical_objects x WHERE x.object_id = (r ->> 'id')::uuid AND x.object_version = (r ->> 'version')::bigint;
    v_up := ARRAY(SELECT e FROM jsonb_array_elements_text(o.evidence_refs) e
                  UNION SELECT s FROM jsonb_array_elements_text(o.source_object_ids) s
                  UNION SELECT 'EVD:' || l.evidence_object_id FROM intelligence.claim_lineage l WHERE l.claim_object_id = o.object_id AND l.claim_version = o.object_version AND l.recorded_at <= p_as_of);
    v_walkable := 0;
    FOREACH v_u IN ARRAY v_up LOOP
      -- an unversioned upstream reference resolves as of the citing record's OWN record time: judged and pinned here
      r := analytics.mcb_resolve(p_tenant, p_domain, v_u, o.recorded_at, p_as_of);
      CONTINUE WHEN r ->> 'class' = 'register';
      v_walkable := v_walkable + 1;
      IF NOT (r ->> 'resolved')::boolean THEN
        v_broken := v_broken || jsonb_build_object('ref', v_u, 'cited_by', v_key, 'reason', r ->> 'reason');
      ELSE
        v_queue := v_queue || CASE WHEN r ->> 'class' = 'canonical' THEN (r ->> 'type') || ':' || (r ->> 'id') || '@' || (r ->> 'version') ELSE v_u END;
        v_depths := v_depths || (v_depth + 1);
      END IF;
    END LOOP;
    IF v_walkable = 0 THEN
      IF jsonb_array_length(o.human_refs) > 0 THEN v_origins := v_origins || jsonb_build_object('origin', 'human_declaration', 'ref', v_key);
      ELSE v_broken := v_broken || jsonb_build_object('ref', v_key, 'reason', 'no upstream reference reaches a source, stored bytes or a named human'); END IF;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('complete', jsonb_array_length(v_broken) = 0 AND jsonb_array_length(v_origins) > 0, 'records_walked', v_nodes, 'depth', v_maxdepth,
                            'origins', (SELECT coalesce(jsonb_agg(DISTINCT x ->> 'origin'), '[]'::jsonb) FROM jsonb_array_elements(v_origins) x), 'broken', v_broken);
END $$;
REVOKE ALL ON FUNCTION analytics.mcb_lineage(uuid, uuid, text, timestamptz) FROM PUBLIC;

/* The query classes a search review may assign (MET-014's dimension; a class of the QUERY, never of the searcher). */
CREATE OR REPLACE FUNCTION analytics.mcb_query_classes() RETURNS text[]
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$ SELECT ARRAY['entity', 'event', 'evidence', 'decision', 'strategy', 'forecast', 'warning', 'memory', 'other'] $$;
GRANT EXECUTE ON FUNCTION analytics.mcb_query_classes() TO eye_app, eye_commit;

/* The time fields a temporal requirement may name (recorded_at is NOT NULL on every canonical record by construction — never listed). */
CREATE OR REPLACE FUNCTION analytics.mcb_time_fields() RETURNS text[]
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$ SELECT ARRAY['event_time', 'observation_time', 'valid_from', 'valid_to'] $$;
GRANT EXECUTE ON FUNCTION analytics.mcb_time_fields() TO eye_app, eye_commit;

-- §MCB.1 THE TEMPORAL REQUIREMENTS (MET-009) ────────────────────────────────────────────────────────────────────────────────────────────────
/* Which time fields a record of an object type MUST carry (App M MET-009 "objects with required event, observation, validity, and record
   times"): declared per object type by a NAMED PRODUCT ANALYTICS OWNER (human-gated; the declaration IS the owner's approval — the owner is
   the approving authority of product metric inputs, D3), versioned, append-only (a new version supersedes; a retirement is a version
   with state `retired`). The CURRENT requirement of a type at an instant = its latest version declared at or before it. */
CREATE TABLE analytics.temporal_requirements (
  requirement_id  uuid PRIMARY KEY,
  scope           text NOT NULL,
  tenant_id       uuid NOT NULL,
  domain_id       uuid NOT NULL,
  object_type     text NOT NULL CHECK (object_type ~ '^[A-Z]{3}$'),
  version         int  NOT NULL CHECK (version >= 1),
  required_fields text[] NOT NULL,
  state           text NOT NULL CHECK (state IN ('approved', 'retired')),
  reason          text NOT NULL CHECK (length(btrim(reason)) >= 8),
  digest          text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  declared_by     uuid NOT NULL,
  declared_at     timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id  uuid NOT NULL,
  CONSTRAINT atr_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT atr_version_once UNIQUE (tenant_id, domain_id, object_type, version),
  CONSTRAINT atr_fields CHECK (required_fields <@ ARRAY['event_time', 'observation_time', 'valid_from', 'valid_to']::text[]
                               AND (state = 'retired' OR cardinality(required_fields) >= 1))
);
CREATE INDEX atr_lookup ON analytics.temporal_requirements (tenant_id, domain_id, object_type, version DESC);

/* THE SEARCH REVIEWS (MET-014): a named human (product analyst or owner — NEVER the searcher) reviews a recorded search: were its results
   relevant decision-support evidence? — and classes its QUERY. One review per search. ROLE-LEVEL: the reviewer's role is recorded for the
   record; reviewed_by is the accountable human of the act (separation of duties), never a metric dimension, grouping or listing. The
   searcher is never named here. */
CREATE TABLE analytics.search_reviews (
  review_id      uuid PRIMARY KEY,
  scope          text NOT NULL,
  tenant_id      uuid NOT NULL,
  domain_id      uuid NOT NULL,
  search_id      uuid NOT NULL,
  query_class    text NOT NULL,
  verdict        text NOT NULL CHECK (verdict IN ('relevant', 'not_relevant')),
  reason         text NOT NULL CHECK (length(btrim(reason)) >= 8),
  reviewer_role  text NOT NULL CHECK (reviewer_role IN ('product_analyst', 'product_analytics_owner')),
  reviewed_by    uuid NOT NULL,
  reviewed_at    timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id uuid NOT NULL,
  CONSTRAINT asr_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT asr_class CHECK (query_class = ANY (analytics.mcb_query_classes())),
  CONSTRAINT asr_once UNIQUE (search_id)
);
CREATE INDEX asr_lookup ON analytics.search_reviews (tenant_id, domain_id, reviewed_at);

CREATE TRIGGER atr_append_only BEFORE UPDATE OR DELETE ON analytics.temporal_requirements FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
CREATE TRIGGER asr_append_only BEFORE UPDATE OR DELETE ON analytics.search_reviews FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['temporal_requirements', 'search_reviews'] LOOP
    EXECUTE format('REVOKE ALL ON analytics.%I FROM PUBLIC', t);
    EXECUTE format('ALTER TABLE analytics.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE analytics.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY domain_isolation ON analytics.%I
        USING (
          tenant_id = public.eye_tenant()
          AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain())
        )$f$, t);
    EXECUTE format('GRANT SELECT ON analytics.%I TO eye_app, eye_commit', t);
  END LOOP;
END $$;

/* DECLARE a temporal requirement (analytics.temporal.declare — human-gated): the named product analytics owner, the object type (one the
   schema registry knows), the required fields (⊆ event_time, observation_time, valid_from, valid_to) or a retirement, a reason, and the
   version the owner saw (p_expected_version: the current version, 0 for none — a moved requirement is refused stale). */
CREATE OR REPLACE FUNCTION analytics.declare_temporal_requirement(p_requirement uuid, p_tenant uuid, p_domain uuid, p_object_type text, p_required text[], p_retire boolean,
                                                                  p_reason text, p_expected_version int, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = analytics, observation, executive, identity, objects, ctx, public, pg_catalog, pg_temp AS $$
DECLARE cur analytics.temporal_requirements%ROWTYPE; v_fields text[]; v_state text; v_digest text; v_kind text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['analytics.temporal.declare']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS NULL OR p_actor IS DISTINCT FROM public.eye_principal() THEN
    RAISE EXCEPTION 'metric definition rejected (actor): a temporal requirement is declared by the acting principal' USING ERRCODE = '42501';
  END IF;
  SELECT p.kind INTO v_kind FROM identity.principals p WHERE p.id = p_actor AND p.status = 'active';
  IF v_kind IS DISTINCT FROM 'human' THEN
    RAISE EXCEPTION 'metric definition rejected (actor): a temporal requirement is a named human''s declaration; an agent or a system principal never declares one' USING ERRCODE = '42501';
  END IF;
  IF NOT executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['product_analytics_owner']) THEN
    RAISE EXCEPTION 'metric definition rejected (authority): a temporal requirement is declared by the domain''s product analytics owner; the acting human is not one' USING ERRCODE = '42501';
  END IF;
  IF coalesce(length(btrim(p_reason)), 0) < 8 THEN RAISE EXCEPTION 'metric definition rejected (reason): a temporal requirement states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  IF p_object_type IS NULL OR p_object_type !~ '^[A-Z]{3}$' THEN RAISE EXCEPTION 'metric definition rejected (object_type): % is not an object type (three capitals)', p_object_type USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM objects.schema_registry s WHERE s.object_type = p_object_type) THEN
    RAISE EXCEPTION 'metric definition rejected (unknown_object_type): % is not a registered object type', p_object_type USING ERRCODE = '23503';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('analytics.temporal_requirements:' || p_tenant || ':' || p_domain || ':' || p_object_type, 92));
  SELECT * INTO cur FROM analytics.temporal_requirements x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.object_type = p_object_type ORDER BY x.version DESC LIMIT 1;
  IF p_expected_version IS NULL OR p_expected_version IS DISTINCT FROM coalesce(cur.version, 0) THEN
    RAISE EXCEPTION 'metric definition rejected (stale): the temporal requirement of % is at version %, not % — re-read it', p_object_type, coalesce(cur.version, 0), coalesce(p_expected_version::text, 'unstated') USING ERRCODE = '22023';
  END IF;
  IF coalesce(p_retire, false) THEN
    IF cur.requirement_id IS NULL OR cur.state <> 'approved' THEN
      RAISE EXCEPTION 'metric definition rejected (state): % has no requirement in force to retire', p_object_type USING ERRCODE = '22023';
    END IF;
    v_fields := '{}'; v_state := 'retired';
  ELSE
    SELECT coalesce(array_agg(DISTINCT f ORDER BY f), '{}') INTO v_fields FROM unnest(coalesce(p_required, '{}')) f;
    IF cardinality(v_fields) = 0 OR NOT (v_fields <@ analytics.mcb_time_fields()) THEN
      RAISE EXCEPTION 'metric definition rejected (fields): the required fields are a non-empty subset of % (recorded_at is required of every record by construction)', array_to_string(analytics.mcb_time_fields(), ', ') USING ERRCODE = '22023';
    END IF;
    IF cur.state = 'approved' AND cur.required_fields = v_fields THEN
      RAISE EXCEPTION 'metric definition rejected (duplicate): % already requires exactly %', p_object_type, array_to_string(v_fields, ', ') USING ERRCODE = '22023';
    END IF;
    v_state := 'approved';
  END IF;
  v_digest := analytics.digest(jsonb_build_object('object_type', p_object_type, 'version', coalesce(cur.version, 0) + 1, 'required_fields', to_jsonb(v_fields), 'state', v_state));
  INSERT INTO analytics.temporal_requirements (requirement_id, scope, tenant_id, domain_id, object_type, version, required_fields, state, reason, digest, declared_by, correlation_id)
  VALUES (p_requirement, 'DOMAIN', p_tenant, p_domain, p_object_type, coalesce(cur.version, 0) + 1, v_fields, v_state, btrim(p_reason), v_digest, p_actor, p_correlation);
  RETURN (SELECT to_jsonb(x) FROM analytics.temporal_requirements x WHERE x.requirement_id = p_requirement) || jsonb_build_object('supersedes', cur.requirement_id);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION analytics.declare_temporal_requirement(uuid,uuid,uuid,text,text[],boolean,text,int,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION analytics.declare_temporal_requirement(uuid,uuid,uuid,text,text[],boolean,text,int,uuid,uuid) TO eye_commit;

/* REVIEW a search (analytics.search.review — human-gated): a named human holding product_analyst or product_analytics_owner, NEVER the
   searcher (separation of duties: nobody grades their own search), the verdict, the query's class, a reason. One review per search. */
CREATE OR REPLACE FUNCTION analytics.review_search(p_review uuid, p_tenant uuid, p_domain uuid, p_search uuid, p_verdict text, p_query_class text, p_reason text,
                                                   p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = analytics, observation, executive, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE s executive.search_events%ROWTYPE; v_kind text; v_role text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['analytics.search.review']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS NULL OR p_actor IS DISTINCT FROM public.eye_principal() THEN
    RAISE EXCEPTION 'metric computation rejected (actor): a search review is recorded by the acting principal' USING ERRCODE = '42501';
  END IF;
  SELECT p.kind INTO v_kind FROM identity.principals p WHERE p.id = p_actor AND p.status = 'active';
  IF v_kind IS DISTINCT FROM 'human' THEN
    RAISE EXCEPTION 'metric computation rejected (actor): a search review is a named human''s judgement; an agent never reviews a search' USING ERRCODE = '42501';
  END IF;
  v_role := CASE WHEN executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['product_analytics_owner']) THEN 'product_analytics_owner'
                 WHEN executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['product_analyst']) THEN 'product_analyst' END;
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'metric computation rejected (authority): a search review needs a product analyst or the product analytics owner of the domain' USING ERRCODE = '42501';
  END IF;
  IF p_verdict IS NULL OR p_verdict NOT IN ('relevant', 'not_relevant') THEN
    RAISE EXCEPTION 'metric computation rejected (verdict): a search review''s verdict is relevant or not_relevant' USING ERRCODE = '22023';
  END IF;
  IF p_query_class IS NULL OR NOT (p_query_class = ANY (analytics.mcb_query_classes())) THEN
    RAISE EXCEPTION 'metric computation rejected (query_class): the query class is one of %', array_to_string(analytics.mcb_query_classes(), ', ') USING ERRCODE = '22023';
  END IF;
  IF coalesce(length(btrim(p_reason)), 0) < 8 THEN RAISE EXCEPTION 'metric computation rejected (reason): a search review states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  SELECT * INTO s FROM executive.search_events x WHERE x.search_id = p_search AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'metric computation rejected (unknown_search): % is not a search recorded in this domain', p_search USING ERRCODE = '23503'; END IF;
  IF s.principal_id = p_actor THEN
    RAISE EXCEPTION 'metric computation rejected (separation_of_duties): a search is reviewed by someone other than the person who searched' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM analytics.search_reviews r WHERE r.search_id = p_search) THEN
    RAISE EXCEPTION 'metric computation rejected (duplicate): the search % is already reviewed', p_search USING ERRCODE = '22023';
  END IF;
  INSERT INTO analytics.search_reviews (review_id, scope, tenant_id, domain_id, search_id, query_class, verdict, reason, reviewer_role, reviewed_by, correlation_id)
  VALUES (p_review, 'DOMAIN', p_tenant, p_domain, p_search, p_query_class, p_verdict, btrim(p_reason), v_role, p_actor, p_correlation);
  RETURN (SELECT to_jsonb(r) - 'reviewed_by' FROM analytics.search_reviews r WHERE r.review_id = p_review);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION analytics.review_search(uuid,uuid,uuid,uuid,text,text,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION analytics.review_search(uuid,uuid,uuid,uuid,text,text,text,uuid,uuid) TO eye_commit;

/* THE READS (INVOKER, under the caller's RLS): the temporal requirements (current per type + history); the searches awaiting or holding a
   review — the query, its hits and kinds, never who searched (the searcher's id is not selected). */
CREATE OR REPLACE FUNCTION analytics.temporal_requirements_read() RETURNS jsonb
LANGUAGE sql STABLE SET search_path = analytics, pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object(
    'current', coalesce((SELECT jsonb_agg(to_jsonb(c) - 'declared_by' ORDER BY c.object_type) FROM (SELECT DISTINCT ON (x.tenant_id, x.domain_id, x.object_type) x.* FROM analytics.temporal_requirements x
                          ORDER BY x.tenant_id, x.domain_id, x.object_type, x.version DESC) c), '[]'::jsonb),
    'history', coalesce((SELECT jsonb_agg(to_jsonb(x) - 'declared_by' ORDER BY x.object_type, x.version) FROM analytics.temporal_requirements x), '[]'::jsonb),
    'time_fields', to_jsonb(analytics.mcb_time_fields()))
$$;
GRANT EXECUTE ON FUNCTION analytics.temporal_requirements_read() TO eye_app, eye_commit;

CREATE OR REPLACE FUNCTION analytics.search_reviews_read(p_limit int DEFAULT 100) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = analytics, executive, pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object(
    'searches', coalesce((SELECT jsonb_agg(z ORDER BY z ->> 'searched_at' DESC) FROM (
      SELECT jsonb_build_object('search_id', s.search_id, 'query', s.query, 'hits', s.hits, 'kinds', s.kinds, 'searched_at', s.searched_at,
               'review', (SELECT to_jsonb(r) - 'reviewed_by' - 'tenant_id' - 'domain_id' FROM analytics.search_reviews r WHERE r.search_id = s.search_id)) z
        FROM executive.search_events s ORDER BY s.searched_at DESC LIMIT greatest(1, least(coalesce(p_limit, 100), 500))) q), '[]'::jsonb),
    'query_classes', to_jsonb(analytics.mcb_query_classes()))
$$;
GRANT EXECUTE ON FUNCTION analytics.search_reviews_read(int) TO eye_app, eye_commit;

-- §MCB.3 THE COMPUTATIONS (0113 §0.7) ─────────────────────────────────────────────────────────────────────────────────────────────────────

/* MET-006 EVIDENCE CITATION RESOLUTION (rate; dimension object_type; App M: "citations resolving to exact accessible source version and
   segment"). READING — population: every evidence CITATION recorded in the window: (a) each claim's lineage row (the evidence, its digest,
   its byte span), (b) each canonical-form reference in the evidence_refs of a record version recorded in the window (`TYP:<id>@<n>`,
   `TYP:<id>`, `evidence:`, `entity:`, `claim:`, a bare id, `blob:<manifest>`) — a lineage-covered `EVD:<id>` reference of a claim is
   counted once (its lineage row). Numerator: the citation resolves (analytics.mcb_resolve) to an exact version — the lineage's digest,
   the explicit version, or the version current at the citing record's own record time (`as_of` pinning, stated per record) — that
   exists, is not withdrawn, whose bytes are stored and not tombstoned, and (lineage) whose segment lies inside the bytes. REGISTER
   references (a gateway call, a review case, a strategy node, a candidate …) are not evidence citations of a source version: counted in
   quality.register_references, outside the population. Accessibility is judged as the record's standing, not the reader's clearance
   (the drill-down reads under the reader's RLS). SCOPE: ignored — citation integrity is domain-wide by nature (stated). */
CREATE OR REPLACE FUNCTION analytics.mc_met006_citation_resolution(p_tenant uuid, p_domain uuid, p_from timestamptz, p_to timestamptz, p_as_of timestamptz, p_scope jsonb, p_cohort jsonb, p_params jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = analytics, objects, intelligence, observation, public, pg_catalog, pg_temp AS $$
DECLARE v_newest timestamptz; v_type text := p_cohort ->> 'object_type'; v_cap int := analytics.mcb_cap(p_params); v_bound bigint; v_recs jsonb; v_register jsonb; v_pins jsonb;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the evidence citations of the domain''s records (MET-006)');
  IF coalesce(p_params ->> 'clock', 'record') <> 'record' THEN RETURN analytics.mcb_clock_refused('rate', 'MET-006', 'a citation is recorded with its citing record and has no world time', p_params); END IF;
  SELECT coalesce((SELECT count(*) FROM intelligence.claim_lineage l WHERE l.tenant_id = p_tenant AND l.domain_id = p_domain AND l.recorded_at >= p_from AND l.recorded_at < p_to AND l.recorded_at <= p_as_of
                    AND (v_type IS NULL OR l.claim_type = v_type)), 0)
       + coalesce((SELECT sum(jsonb_array_length(o.evidence_refs)) FROM objects.canonical_objects o WHERE o.tenant_id = p_tenant AND o.domain_id = p_domain AND o.recorded_at >= p_from
                    AND o.recorded_at < p_to AND o.recorded_at <= p_as_of AND (v_type IS NULL OR o.object_type = v_type)), 0) INTO v_bound;
  IF v_bound > v_cap THEN RETURN analytics.mcb_over_cap('rate', 'MET-006', v_bound, v_cap, 'record'); END IF;
  WITH cit AS (
    SELECT l.claim_type AS otype, l.claim_object_id AS oid, l.claim_version AS over, l.recorded_at AS at, 'EVD:' || l.evidence_object_id AS ref, l.evidence_digest AS dg,
           l.byte_end AS be, jsonb_build_object('start', l.byte_start, 'end', l.byte_end) AS seg, 'lineage' AS via
      FROM intelligence.claim_lineage l
     WHERE l.tenant_id = p_tenant AND l.domain_id = p_domain AND l.recorded_at >= p_from AND l.recorded_at < p_to AND l.recorded_at <= p_as_of AND (v_type IS NULL OR l.claim_type = v_type)
    UNION ALL
    SELECT o.object_type, o.object_id, o.object_version, o.recorded_at, e.ref, NULL, NULL, NULL, 'evidence_refs'
      FROM objects.canonical_objects o CROSS JOIN LATERAL jsonb_array_elements_text(o.evidence_refs) e(ref)
     WHERE o.tenant_id = p_tenant AND o.domain_id = p_domain AND o.recorded_at >= p_from AND o.recorded_at < p_to AND o.recorded_at <= p_as_of AND (v_type IS NULL OR o.object_type = v_type)
       AND NOT EXISTS (SELECT 1 FROM intelligence.claim_lineage l WHERE l.claim_object_id = o.object_id AND l.claim_version = o.object_version AND e.ref IN ('EVD:' || l.evidence_object_id, 'evidence:' || l.evidence_object_id))),
  judged AS (SELECT c.*, analytics.mcb_resolve(p_tenant, p_domain, c.ref, c.at, p_as_of, c.dg, c.be) AS r FROM cit c)
  SELECT (SELECT coalesce(jsonb_agg(jsonb_build_object('kind', 'citation', 'id', format('%s:%s@%s->%s', j.otype, j.oid, j.over, j.ref),
                                               'role', CASE WHEN (j.r ->> 'resolved')::boolean THEN 'numerator' ELSE 'denominator' END,
                                               'reason', CASE WHEN NOT (j.r ->> 'resolved')::boolean THEN j.r ->> 'reason' END,
                                               'detail', jsonb_strip_nulls(jsonb_build_object('object_type', j.otype, 'via', j.via, 'pin', j.r ->> 'pin', 'cited_version', j.r ->> 'version',
                                                                                              'segment', j.seg, 'tier', j.r ->> 'tier')))
                                    ORDER BY j.at, j.oid, j.over, j.ref), '[]'::jsonb) FROM judged j WHERE j.r ->> 'class' <> 'register'),
         (SELECT coalesce(jsonb_object_agg(z.prefix, z.n), '{}'::jsonb) FROM (SELECT j.r ->> 'prefix' AS prefix, count(*) AS n FROM judged j WHERE j.r ->> 'class' = 'register' GROUP BY 1) z)
,
         (SELECT max(j.at) FROM judged j WHERE j.r ->> 'class' <> 'register')
    INTO v_recs, v_register, v_newest;
  SELECT coalesce(jsonb_object_agg(p, n), '{}'::jsonb) INTO v_pins FROM (SELECT x -> 'detail' ->> 'pin' p, count(*) n FROM jsonb_array_elements(v_recs) x WHERE x -> 'detail' ? 'pin' GROUP BY 1) z;
  RETURN analytics.mcb_finish(jsonb_build_object('kind', 'rate', 'records', v_recs, 'reasons', '[]'::jsonb,
    'quality', jsonb_build_object('clock', 'record', 'register_references', v_register, 'pinning', v_pins, 'scope_rule', 'ignored: citation integrity is domain-wide by nature',
      'notes', jsonb_build_array('an unversioned reference resolves to the version current at the citing record''s own record time (pin = as_of)',
                                 'accessibility is the record''s standing (exists, not withdrawn, bytes stored and not tombstoned) — the reader''s clearance is applied at the drill-down'))), 'object_type', v_newest);
END $$;
REVOKE ALL ON FUNCTION analytics.mc_met006_citation_resolution(uuid,uuid,timestamptz,timestamptz,timestamptz,jsonb,jsonb,jsonb) FROM PUBLIC;
SELECT analytics.register_computation('met006_citation_resolution', 'analytics.mc_met006_citation_resolution', 'rate', ARRAY['object_type'],
  ARRAY['intelligence.claim_lineage', 'objects.canonical_objects', 'observation.blob_manifests', 'observation.blob_tombstones', 'observation.blob_tier_records'],
  'ignored: citation integrity is a property of every record of the domain (domain-wide by nature)',
  'MET-006: evidence citations recorded in the window (claim lineage rows and canonical-form evidence references) resolving to an exact, stored, untombstoned, unwithdrawn source version and segment', '0113 §MCB');

/* MET-007 PROVENANCE CLOSURE (rate; dimension object_type; App M: "material outputs with complete source-to-product lineage", threshold
   100 % decision-active). READING — population: the DECISION-ACTIVE outputs: each distinct record cited (an option's consequence with an
   id: a run, a forecast, an assumption …) by an option set in the window on a decision package that is live now (proposed, under review,
   approved, committed, monitoring or reopened — packages_current is a CURRENT-state table, stated). A cited run is its SIM record, or — a
   run with no SIM record — its twin version. Numerator: the output's lineage is complete (analytics.mcb_lineage: every upstream reference
   resolves and every path reaches stored bytes, a registered source or a named human's declaration). SCOPE: a package concerns the scope
   when its cited version's objectives intersect the scope's objective_ids (a NULL scope = the domain). */
CREATE OR REPLACE FUNCTION analytics.mc_met007_provenance_closure(p_tenant uuid, p_domain uuid, p_from timestamptz, p_to timestamptz, p_as_of timestamptz, p_scope jsonb, p_cohort jsonb, p_params jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = analytics, decision, simulation, objects, observation, public, pg_catalog, pg_temp AS $$
DECLARE v_newest timestamptz; v_type text := p_cohort ->> 'object_type'; v_cap int := analytics.mcb_cap(p_params); v_recs jsonb := '[]'::jsonb; c record; v_root text; v_lin jsonb; v_rtype text; v_n int := 0;
        v_obj text[] := CASE WHEN p_scope IS NULL THEN NULL ELSE ARRAY(SELECT jsonb_array_elements_text(coalesce(p_scope -> 'objective_ids', '[]'::jsonb))) END;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the lineage of the domain''s decision-active outputs (MET-007)');
  IF coalesce(p_params ->> 'clock', 'record') <> 'record' THEN RETURN analytics.mcb_clock_refused('rate', 'MET-007', 'a citation by a decision option is recorded when the option is set', p_params); END IF;
  FOR c IN
    SELECT x.kind, x.id, x.version, array_agg(DISTINCT x.package_id::text ORDER BY x.package_id::text) AS packages, min(x.set_at) AS first_cited, max(x.set_at) AS last_cited
      FROM (SELECT cc ->> 'kind' AS kind, (cc ->> 'id')::uuid AS id, CASE WHEN coalesce(cc ->> 'version', '') ~ '^[0-9]+$' THEN (cc ->> 'version')::bigint END AS version, o.package_id, o.set_at
              FROM decision.options o JOIN decision.packages_current p ON p.package_id = o.package_id
              JOIN decision.package_versions pv ON pv.package_id = o.package_id AND pv.version = o.version
              CROSS JOIN LATERAL jsonb_array_elements(o.consequences) cc
             WHERE o.tenant_id = p_tenant AND o.domain_id = p_domain AND o.set_at >= p_from AND o.set_at < p_to AND o.set_at <= p_as_of
               AND p.state IN ('proposed', 'under_review', 'approved', 'committed', 'monitoring', 'reopened')
               AND coalesce(cc ->> 'id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
               AND (v_obj IS NULL OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(coalesce(pv.objectives, '[]'::jsonb)) ob WHERE ob = ANY (v_obj)))) x
     GROUP BY x.kind, x.id, x.version ORDER BY min(x.set_at), x.id
  LOOP
    v_n := v_n + 1; v_newest := greatest(v_newest, c.last_cited);
    IF v_n > v_cap THEN RETURN analytics.mcb_over_cap('rate', 'MET-007', v_n, v_cap, 'record'); END IF;
    -- the record the citation names: its canonical record (the cited version, or the version current at the as-of); a cited run with no
    -- SIM record walks from the twin version it ran on; an id that names nothing walks from the bare id (and breaks, said)
    v_root := NULL; v_rtype := NULL;
    SELECT o.object_type INTO v_rtype FROM objects.canonical_objects o WHERE o.object_id = c.id AND o.recorded_at <= p_as_of ORDER BY o.object_version DESC LIMIT 1;
    IF v_rtype IS NOT NULL THEN
      v_root := v_rtype || ':' || c.id || coalesce('@' || c.version, '');
    ELSIF c.kind = 'run' THEN
      SELECT 'TWN:' || r.twin_id || '@' || r.twin_version INTO v_root FROM simulation.runs_current r WHERE r.run_id = c.id;
      IF v_root IS NOT NULL THEN v_rtype := 'SIM'; END IF;
    END IF;
    IF v_root IS NULL THEN v_root := c.id::text; v_rtype := upper(left(c.kind, 3)); END IF;
    IF v_type IS NOT NULL AND v_rtype IS DISTINCT FROM v_type THEN CONTINUE; END IF;
    v_lin := analytics.mcb_lineage(p_tenant, p_domain, v_root, p_as_of);
    v_recs := v_recs || jsonb_build_object('kind', 'output', 'id', format('%s:%s', c.kind, c.id) || coalesce('@' || c.version, ''),
      'role', CASE WHEN (v_lin ->> 'complete')::boolean THEN 'numerator' ELSE 'denominator' END,
      'reason', CASE WHEN NOT (v_lin ->> 'complete')::boolean THEN coalesce((v_lin -> 'broken' -> 0 ->> 'reason'), 'the lineage reaches no origin') END,
      'detail', jsonb_build_object('object_type', v_rtype, 'cited_by_packages', to_jsonb(c.packages), 'walked_from', v_root, 'lineage', v_lin));
  END LOOP;
  RETURN analytics.mcb_finish(jsonb_build_object('kind', 'rate', 'records', v_recs, 'reasons', '[]'::jsonb,
    'quality', jsonb_build_object('clock', 'record', 'scope_rule', CASE WHEN p_scope IS NULL THEN 'the domain' ELSE 'packages whose cited version names an objective of the scope' END,
      'notes', jsonb_build_array('decision-active = cited by an option of a package live NOW (decision.packages_current is a current-state table: a replay reports mismatch if a package''s state moved since)',
                                 'a lineage origin is stored bytes, a registered source, or a named human''s declaration (a record whose only provenance is its human_refs)'))), 'object_type', v_newest);
END $$;
REVOKE ALL ON FUNCTION analytics.mc_met007_provenance_closure(uuid,uuid,timestamptz,timestamptz,timestamptz,jsonb,jsonb,jsonb) FROM PUBLIC;
SELECT analytics.register_computation('met007_provenance_closure', 'analytics.mc_met007_provenance_closure', 'rate', ARRAY['object_type'],
  ARRAY['decision.options', 'decision.packages_current', 'decision.package_versions', 'simulation.runs_current', 'objects.canonical_objects', 'intelligence.claim_lineage', 'observation.blob_manifests', 'observation.blob_tombstones'],
  'a decision package concerns the scope when its cited version''s objectives intersect the scope''s objective_ids; a NULL scope is the domain',
  'MET-007: decision-active outputs (cited by an option of a live package, set in the window) whose source-to-product lineage is complete', '0113 §MCB');

/* MET-008 TRUTH-STATE COMPLETENESS (rate; dimension object_type; App M: "objects with valid explicit epistemic state and transitions").
   READING — population: the record VERSIONS recorded in the window. The explicit state is COMPLETE BY CONSTRUCTION (truth_state NOT NULL,
   its vocabulary and synthetic consistency are CHECKs of objects.canonical_objects) — so the measured part is the TRANSITIONS and the
   state's agreement with the lifecycle: a version is valid when (1) its truth state and its lifecycle agree on withdrawal, (2) a synthetic
   record never becomes a real one (prior synthetic, this not), (3) a withdrawn record is terminal unless this version is a correction or a
   supersession of it, (4) its version follows its prior without a gap (an unrecorded transition). Where NO version in the population has
   a prior (no transition exercised), the result is INDETERMINATE (said): a 100 % over constructed states alone would be a vanity number.
   SCOPE: ignored — the epistemic state is domain-wide by nature (stated). */
CREATE OR REPLACE FUNCTION analytics.mc_met008_truth_state_completeness(p_tenant uuid, p_domain uuid, p_from timestamptz, p_to timestamptz, p_as_of timestamptz, p_scope jsonb, p_cohort jsonb, p_params jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = analytics, objects, observation, public, pg_catalog, pg_temp AS $$
DECLARE v_newest timestamptz; v_type text := p_cohort ->> 'object_type'; v_cap int := analytics.mcb_cap(p_params); v_bound bigint; v_recs jsonb; v_trans int; v_reasons jsonb := '[]'::jsonb;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the truth states of the domain''s records (MET-008)');
  IF coalesce(p_params ->> 'clock', 'record') <> 'record' THEN RETURN analytics.mcb_clock_refused('rate', 'MET-008', 'a truth state is recorded with its version', p_params); END IF;
  SELECT count(*) INTO v_bound FROM objects.canonical_objects o WHERE o.tenant_id = p_tenant AND o.domain_id = p_domain AND o.recorded_at >= p_from AND o.recorded_at < p_to AND o.recorded_at <= p_as_of
     AND (v_type IS NULL OR o.object_type = v_type);
  IF v_bound > v_cap THEN RETURN analytics.mcb_over_cap('rate', 'MET-008', v_bound, v_cap, 'record'); END IF;
  WITH v AS (
    SELECT o.object_id, o.object_type, o.object_version, o.truth_state, o.lifecycle_state, o.synthetic_state, o.correction_of, o.supersedes, o.recorded_at,
           pr.object_version AS pv, pr.truth_state AS pts, pr.lifecycle_state AS pls, pr.synthetic_state AS pss
      FROM objects.canonical_objects o
      LEFT JOIN LATERAL (SELECT x.object_version, x.truth_state, x.lifecycle_state, x.synthetic_state FROM objects.canonical_objects x
                          WHERE x.object_id = o.object_id AND x.object_version < o.object_version AND x.recorded_at <= p_as_of ORDER BY x.object_version DESC LIMIT 1) pr ON true
     WHERE o.tenant_id = p_tenant AND o.domain_id = p_domain AND o.recorded_at >= p_from AND o.recorded_at < p_to AND o.recorded_at <= p_as_of AND (v_type IS NULL OR o.object_type = v_type)),
  judged AS (
    SELECT v.*, array_remove(ARRAY[
             CASE WHEN (v.truth_state = 'withdrawn') <> (v.lifecycle_state = 'withdrawn') THEN 'the truth state and the lifecycle disagree on withdrawal' END,
             CASE WHEN v.pss AND NOT v.synthetic_state THEN 'a synthetic record became a real one' END,
             CASE WHEN v.pls = 'withdrawn' AND v.correction_of IS NULL AND v.supersedes IS NULL THEN 'a withdrawn record changed without a correction or a supersession' END,
             CASE WHEN v.pv IS NOT NULL AND v.object_version <> v.pv + 1 THEN format('version %s follows version %s: an unrecorded transition', v.object_version, v.pv)
                  WHEN v.pv IS NULL AND v.object_version > 1 THEN format('version %s has no recorded prior version', v.object_version) END], NULL) AS violations
      FROM v)
  SELECT coalesce(jsonb_agg(jsonb_build_object('kind', 'record_version', 'id', format('%s:%s@%s', j.object_type, j.object_id, j.object_version),
                                               'role', CASE WHEN cardinality(j.violations) = 0 THEN 'numerator' ELSE 'denominator' END,
                                               'reason', CASE WHEN cardinality(j.violations) > 0 THEN array_to_string(j.violations, '; ') END,
                                               'detail', jsonb_strip_nulls(jsonb_build_object('object_type', j.object_type, 'truth_state', j.truth_state, 'lifecycle', j.lifecycle_state,
                                                                                              'transition', CASE WHEN j.pv IS NOT NULL THEN format('%s/%s → %s/%s', j.pts, j.pls, j.truth_state, j.lifecycle_state) END)))
                            ORDER BY j.recorded_at, j.object_id, j.object_version), '[]'::jsonb),
         count(*) FILTER (WHERE j.pv IS NOT NULL OR j.object_version > 1),
         max(j.recorded_at)
    INTO v_recs, v_trans, v_newest FROM judged j;
  IF jsonb_array_length(v_recs) > 0 AND v_trans = 0 THEN
    v_reasons := v_reasons || to_jsonb('no record in the population changed state (every version is a first version): the explicit state is complete by construction and the transitions are unexercised — a 100 % here would be a vanity number'::text);
  END IF;
  RETURN analytics.mcb_finish(jsonb_build_object('kind', 'rate', 'records', v_recs, 'reasons', v_reasons,
    'quality', jsonb_build_object('clock', 'record', 'transitions_measured', v_trans, 'by_construction', jsonb_build_array('truth_state NOT NULL', 'truth_state vocabulary', 'synthetic consistency'),
      'scope_rule', 'ignored: the epistemic state is domain-wide by nature')), 'object_type', v_newest);
END $$;
REVOKE ALL ON FUNCTION analytics.mc_met008_truth_state_completeness(uuid,uuid,timestamptz,timestamptz,timestamptz,jsonb,jsonb,jsonb) FROM PUBLIC;
SELECT analytics.register_computation('met008_truth_state_completeness', 'analytics.mc_met008_truth_state_completeness', 'rate', ARRAY['object_type'],
  ARRAY['objects.canonical_objects'], 'ignored: the epistemic state of records is domain-wide by nature',
  'MET-008: record versions recorded in the window whose truth state agrees with the lifecycle and whose transitions are admissible (the state itself complete by construction — said, never a vanity 100 %)', '0113 §MCB');

/* MET-009 TEMPORAL COMPLETENESS (rate; dimension object_type; App M: "objects with required event, observation, validity, and record
   times"). READING — population: the record versions recorded in the window whose object type has a temporal requirement IN FORCE at the
   as-of (analytics.temporal_requirements, the owner's declaration; recorded_at is required of all and NOT NULL by construction).
   Numerator: every required field is set. A type with no requirement is outside the population (counted in quality); NO requirement for
   any type → INDETERMINATE (what "required" means is undeclared). SCOPE: ignored (domain-wide by nature, stated). */
CREATE OR REPLACE FUNCTION analytics.mc_met009_temporal_completeness(p_tenant uuid, p_domain uuid, p_from timestamptz, p_to timestamptz, p_as_of timestamptz, p_scope jsonb, p_cohort jsonb, p_params jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = analytics, objects, observation, public, pg_catalog, pg_temp AS $$
DECLARE v_newest timestamptz; v_type text := p_cohort ->> 'object_type'; v_cap int := analytics.mcb_cap(p_params); v_bound bigint; v_recs jsonb; v_req jsonb; v_without jsonb; v_reasons jsonb := '[]'::jsonb;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the time fields of the domain''s records (MET-009)');
  IF coalesce(p_params ->> 'clock', 'record') <> 'record' THEN RETURN analytics.mcb_clock_refused('rate', 'MET-009', 'a record''s time fields are judged when it is recorded', p_params); END IF;
  SELECT coalesce(jsonb_object_agg(r.object_type, jsonb_build_object('version', r.version, 'fields', to_jsonb(r.required_fields))), '{}'::jsonb) INTO v_req
    FROM (SELECT DISTINCT ON (x.object_type) x.* FROM analytics.temporal_requirements x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.declared_at <= p_as_of
           ORDER BY x.object_type, x.version DESC) r WHERE r.state = 'approved';
  IF v_req = '{}'::jsonb THEN
    RETURN analytics.mcb_finish(jsonb_build_object('kind', 'rate', 'records', '[]'::jsonb, 'quality', jsonb_build_object('clock', 'record'),
      'reasons', jsonb_build_array('no temporal requirement is in force for any object type as of the as-of: what "required" means is undeclared (analytics.temporal.declare, the product analytics owner)')), 'object_type', NULL);
  END IF;
  IF v_type IS NOT NULL AND NOT v_req ? v_type THEN
    RETURN analytics.mcb_finish(jsonb_build_object('kind', 'rate', 'records', '[]'::jsonb, 'quality', jsonb_build_object('clock', 'record', 'requirements', v_req),
      'reasons', jsonb_build_array(format('no temporal requirement is in force for %s as of the as-of: its completeness is undeclared', v_type))), 'object_type', NULL);
  END IF;
  SELECT count(*) INTO v_bound FROM objects.canonical_objects o WHERE o.tenant_id = p_tenant AND o.domain_id = p_domain AND o.recorded_at >= p_from AND o.recorded_at < p_to AND o.recorded_at <= p_as_of
     AND v_req ? o.object_type AND (v_type IS NULL OR o.object_type = v_type);
  IF v_bound > v_cap THEN RETURN analytics.mcb_over_cap('rate', 'MET-009', v_bound, v_cap, 'record'); END IF;
  WITH v AS (
    SELECT o.object_type, o.object_id, o.object_version, o.recorded_at,
           ARRAY(SELECT f FROM jsonb_array_elements_text(v_req -> o.object_type -> 'fields') f
                  WHERE (f = 'event_time' AND o.event_time IS NULL) OR (f = 'observation_time' AND o.observation_time IS NULL)
                     OR (f = 'valid_from' AND o.valid_from IS NULL) OR (f = 'valid_to' AND o.valid_to IS NULL) ORDER BY f) AS missing
      FROM objects.canonical_objects o
     WHERE o.tenant_id = p_tenant AND o.domain_id = p_domain AND o.recorded_at >= p_from AND o.recorded_at < p_to AND o.recorded_at <= p_as_of AND v_req ? o.object_type
       AND (v_type IS NULL OR o.object_type = v_type))
  SELECT coalesce(jsonb_agg(jsonb_build_object('kind', 'record_version', 'id', format('%s:%s@%s', v.object_type, v.object_id, v.object_version),
                                               'role', CASE WHEN cardinality(v.missing) = 0 THEN 'numerator' ELSE 'denominator' END,
                                               'reason', CASE WHEN cardinality(v.missing) > 0 THEN 'missing ' || array_to_string(v.missing, ', ') END,
                                               'detail', jsonb_build_object('object_type', v.object_type, 'requirement_version', v_req -> v.object_type -> 'version', 'required', v_req -> v.object_type -> 'fields'))
                            ORDER BY v.recorded_at, v.object_id, v.object_version), '[]'::jsonb), max(v.recorded_at) INTO v_recs, v_newest FROM v;
  SELECT coalesce(jsonb_object_agg(t, n), '{}'::jsonb) INTO v_without FROM (
    SELECT o.object_type t, count(*) n FROM objects.canonical_objects o WHERE o.tenant_id = p_tenant AND o.domain_id = p_domain AND o.recorded_at >= p_from AND o.recorded_at < p_to
       AND o.recorded_at <= p_as_of AND NOT v_req ? o.object_type AND v_type IS NULL GROUP BY 1) z;
  RETURN analytics.mcb_finish(jsonb_build_object('kind', 'rate', 'records', v_recs, 'reasons', v_reasons,
    'quality', jsonb_build_object('clock', 'record', 'requirements', v_req, 'types_without_requirement', v_without, 'scope_rule', 'ignored: temporal completeness is domain-wide by nature')), 'object_type', v_newest);
END $$;
REVOKE ALL ON FUNCTION analytics.mc_met009_temporal_completeness(uuid,uuid,timestamptz,timestamptz,timestamptz,jsonb,jsonb,jsonb) FROM PUBLIC;
SELECT analytics.register_computation('met009_temporal_completeness', 'analytics.mc_met009_temporal_completeness', 'rate', ARRAY['object_type'],
  ARRAY['objects.canonical_objects', 'analytics.temporal_requirements'], 'ignored: temporal completeness of records is domain-wide by nature',
  'MET-009: record versions recorded in the window, of an object type with a declared temporal requirement, carrying every required time field', '0113 §MCB');

/* MET-010 CORRECTION PROPAGATION TIME (duration, seconds; App M: "time from accepted correction to all affected products reconciled or
   constrained"). READING — population: corrections ACCEPTED in the window (observation.correction_events `case.applied`). Start: the
   acceptance instant. End — THE CLOSURE INSTANT (defined here): the latest of (a) every dependency-propagation assessment of the case
   (graph.invalidations_current.assessed_at — what each affected product was marked or reported) and (b) the automatic propagation's
   completion (graph.propagation_attempts.finished_at, state complete) — the moment all known propagation work had finished; only when the
   case's propagation is complete and that instant is at or before the as-of. A case still propagating is EXCLUDED as censored and, when
   censored cases are more than half the accepted ones, the median is INDETERMINATE (a survivor-biased distribution). No propagation
   contract is declared in the product (App M "within contract"): the duration is measured; its breach is the definition's threshold.
   correction_current and propagation_attempts are CURRENT-state tables (stated). SCOPE: a correction concerns the scope when its source
   reaches the scope (analytics.mcb_scope_sources). */
CREATE OR REPLACE FUNCTION analytics.mc_met010_correction_propagation(p_tenant uuid, p_domain uuid, p_from timestamptz, p_to timestamptz, p_as_of timestamptz, p_scope jsonb, p_cohort jsonb, p_params jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = analytics, observation, graph, public, pg_catalog, pg_temp AS $$
DECLARE v_newest timestamptz; v_src uuid[] := analytics.mcb_scope_sources(p_tenant, p_domain, p_scope); v_recs jsonb; v_cens int; v_total int; v_reasons jsonb := '[]'::jsonb;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the propagation of the domain''s corrections (MET-010)');
  IF coalesce(p_params ->> 'clock', 'record') <> 'record' THEN RETURN analytics.mcb_clock_refused('duration', 'MET-010', 'a correction is accepted and propagated in record time', p_params); END IF;
  WITH acc AS (
    SELECT DISTINCT ON (e.case_id) e.case_id, e.occurred_at AS accepted_at, c.source_id, c.kind, c.propagation_state
      FROM observation.correction_events e JOIN observation.correction_current c ON c.case_id = e.case_id
     WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain AND e.event = 'case.applied' AND e.occurred_at >= p_from AND e.occurred_at < p_to AND e.occurred_at <= p_as_of
       AND (v_src IS NULL OR c.source_id = ANY (v_src))
     ORDER BY e.case_id, e.occurred_at),
  closed AS (
    SELECT a.*, (SELECT max(i.assessed_at) FROM graph.invalidations_current i WHERE i.correction_case_id = a.case_id AND i.assessed_at IS NOT NULL AND i.assessed_at <= p_as_of) AS assessed_at,
           (SELECT max(t.finished_at) FROM graph.propagation_attempts t WHERE t.case_id = a.case_id AND t.state = 'complete' AND t.finished_at <= p_as_of) AS walked_at,
           EXISTS (SELECT 1 FROM graph.propagation_attempts t WHERE t.case_id = a.case_id AND (t.state <> 'complete' OR t.finished_at IS NULL OR t.finished_at > p_as_of)) AS open_attempt
      FROM acc a),
  judged AS (SELECT c.*, CASE WHEN c.propagation_state = 'complete' AND NOT c.open_attempt AND coalesce(c.assessed_at, c.walked_at) IS NOT NULL
                              THEN greatest(c.assessed_at, c.walked_at) END AS closed_at FROM closed c)
  SELECT coalesce(jsonb_agg(CASE WHEN j.closed_at IS NOT NULL THEN
                              jsonb_build_object('kind', 'correction', 'id', j.case_id, 'role', 'included',
                                'detail', jsonb_strip_nulls(jsonb_build_object('value', round(greatest(0, extract(epoch FROM (j.closed_at - j.accepted_at)))::numeric, 3), 'accepted_at', j.accepted_at,
                                                           'closed_at', j.closed_at, 'closure', CASE WHEN j.walked_at IS NOT NULL AND (j.assessed_at IS NULL OR j.walked_at >= j.assessed_at) THEN 'propagation walk complete' ELSE 'dependency assessment' END,
                                                           'correction_kind', j.kind)))
                            ELSE jsonb_build_object('kind', 'correction', 'id', j.case_id, 'role', 'excluded',
                                'reason', 'censored: the propagation is not complete as of the as-of (no closure instant yet)', 'detail', jsonb_build_object('accepted_at', j.accepted_at, 'propagation_state', j.propagation_state, 'closure', 'censored')) END
                            ORDER BY j.accepted_at, j.case_id), '[]'::jsonb),
         count(*) FILTER (WHERE j.closed_at IS NULL), count(*),
         max(j.accepted_at)
    INTO v_recs, v_cens, v_total, v_newest FROM judged j;
  IF v_total > 0 AND v_cens * 2 > v_total THEN
    v_reasons := v_reasons || to_jsonb(format('%s of %s accepted corrections are still propagating (censored): a median over the closed ones alone would be survivor-biased', v_cens, v_total));
  END IF;
  RETURN analytics.mcb_finish(jsonb_build_object('kind', 'duration', 'records', v_recs, 'reasons', v_reasons,
    'quality', jsonb_build_object('clock', 'record', 'censored', v_cens, 'accepted', v_total, 'unit', 'seconds',
      'scope_rule', CASE WHEN p_scope IS NULL THEN 'the domain' ELSE 'corrections of sources feeding the scope''s series or entities' END,
      'notes', jsonb_build_array('the closure instant = the latest dependency assessment or the completed propagation walk of the case',
                                 'no correction-propagation contract is declared in the product: the duration is measured, its breach is the definition''s threshold',
                                 'correction_current and propagation_attempts are current-state tables: a replay reports mismatch if a propagation moved since'))), 'closure', v_newest);
END $$;
REVOKE ALL ON FUNCTION analytics.mc_met010_correction_propagation(uuid,uuid,timestamptz,timestamptz,timestamptz,jsonb,jsonb,jsonb) FROM PUBLIC;
SELECT analytics.register_computation('met010_correction_propagation', 'analytics.mc_met010_correction_propagation', 'duration', ARRAY[]::text[],
  ARRAY['observation.correction_events', 'observation.correction_current', 'graph.invalidations_current', 'graph.propagation_attempts', 'prediction.series_registry', 'observation.source_contracts_current'],
  'a correction concerns the scope when its source feeds a series of the scope''s series_keys or of an entity in its entity_ids; a NULL scope is the domain',
  'MET-010: seconds from an accepted correction to its closure instant (the latest dependency assessment or completed propagation walk); censored cases excluded and said', '0113 §MCB');

/* MET-011 SOURCE COVERAGE ATTAINMENT (rate; dimension source; App M: "observed coverage against approved dimension and priority
   targets"). READING — population: each MEASURED actual-coverage measurement evaluated in the window, paired with its source's
   expected-coverage measurement for the same measurement window. Numerator: actual ≥ the target. THE TARGET: the product holds NO approved
   coverage target (no plan or contract declares a dimension or priority target) — the expected coverage is the coverage universe's count,
   not an approved target: the result is INDETERMINATE with that reason UNLESS the definition declares (params.expected_is_target = true,
   approved with the definition by its owner and labelled in quality) that the universe's expected coverage IS the approved target.
   Unmeasured measurements (unknown, insufficient evidence, indeterminate, not applicable) are excluded with their state. SCOPE: the
   scope's sources (analytics.mcb_scope_sources). */
CREATE OR REPLACE FUNCTION analytics.mc_met011_coverage_attainment(p_tenant uuid, p_domain uuid, p_from timestamptz, p_to timestamptz, p_as_of timestamptz, p_scope jsonb, p_cohort jsonb, p_params jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = analytics, observation, public, pg_catalog, pg_temp AS $$
DECLARE v_newest timestamptz; v_src uuid[] := analytics.mcb_scope_sources(p_tenant, p_domain, p_scope); v_key text := p_cohort ->> 'source'; v_recs jsonb; v_reasons jsonb := '[]'::jsonb;
        v_declared boolean := coalesce(p_params ->> 'expected_is_target', 'false') = 'true';
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the coverage measurements of the domain''s sources (MET-011)');
  IF coalesce(p_params ->> 'clock', 'record') <> 'record' THEN RETURN analytics.mcb_clock_refused('rate', 'MET-011', 'a coverage measurement is evaluated and stored in record time', p_params); END IF;
  WITH a AS (
    SELECT m.*, (SELECT c.source_key FROM observation.source_contracts_current c WHERE c.source_id = m.source_id ORDER BY c.contract_version DESC LIMIT 1) AS source_key
      FROM observation.coverage_measurements m
     WHERE m.tenant_id = p_tenant AND m.domain_id = p_domain AND m.dimension = 'actual_coverage' AND m.evaluated_at >= p_from AND m.evaluated_at < p_to AND m.recorded_at <= p_as_of
       AND (v_src IS NULL OR m.source_id = ANY (v_src))),
  paired AS (
    SELECT a.*, e.state AS e_state, e.value_numeric AS e_value, e.measurement_id AS e_id
      FROM a LEFT JOIN LATERAL (SELECT x.* FROM observation.coverage_measurements x WHERE x.source_id = a.source_id AND x.dimension = 'expected_coverage'
                                  AND x.window_start = a.window_start AND x.window_end = a.window_end AND x.recorded_at <= p_as_of ORDER BY x.evaluated_at DESC LIMIT 1) e ON true
     WHERE v_key IS NULL OR a.source_key = v_key)
  SELECT coalesce(jsonb_agg(CASE
           WHEN p.state <> 'measured' OR p.value_numeric IS NULL THEN jsonb_build_object('kind', 'coverage_measurement', 'id', p.measurement_id, 'role', 'excluded',
                'reason', format('the actual coverage is %s, not measured', p.state), 'detail', jsonb_build_object('source', p.source_key))
           WHEN p.e_id IS NULL OR p.e_state <> 'measured' OR p.e_value IS NULL THEN jsonb_build_object('kind', 'coverage_measurement', 'id', p.measurement_id, 'role', 'excluded',
                'reason', 'no measured expected coverage for the same window: no target to compare with', 'detail', jsonb_build_object('source', p.source_key))
           ELSE jsonb_build_object('kind', 'coverage_measurement', 'id', p.measurement_id, 'role', CASE WHEN p.value_numeric >= p.e_value THEN 'numerator' ELSE 'denominator' END,
                'detail', jsonb_build_object('source', p.source_key, 'actual', p.value_numeric, 'target', p.e_value, 'target_kind', 'coverage universe expected coverage',
                                             'window_start', p.window_start, 'window_end', p.window_end, 'expected_measurement', p.e_id)) END
         ORDER BY p.evaluated_at, p.measurement_id), '[]'::jsonb), max(p.evaluated_at) INTO v_recs, v_newest FROM paired p;
  IF NOT v_declared THEN
    v_reasons := v_reasons || to_jsonb('no approved coverage target exists in the product (no plan or contract declares a dimension or priority target): the coverage universe''s expected coverage is not an approved target unless the definition declares it so (params.expected_is_target)'::text);
  END IF;
  RETURN analytics.mcb_finish(jsonb_build_object('kind', 'rate', 'records', v_recs, 'reasons', v_reasons,
    'quality', jsonb_build_object('clock', 'record', 'target', CASE WHEN v_declared THEN 'declared by the definition: the coverage universe''s expected coverage is the approved target' ELSE 'none approved' END,
      'scope_rule', CASE WHEN p_scope IS NULL THEN 'the domain' ELSE 'the sources feeding the scope''s series or entities' END)), 'source', v_newest);
END $$;
REVOKE ALL ON FUNCTION analytics.mc_met011_coverage_attainment(uuid,uuid,timestamptz,timestamptz,timestamptz,jsonb,jsonb,jsonb) FROM PUBLIC;
SELECT analytics.register_computation('met011_coverage_attainment', 'analytics.mc_met011_coverage_attainment', 'rate', ARRAY['source'],
  ARRAY['observation.coverage_measurements', 'observation.source_contracts_current', 'prediction.series_registry'],
  'a source concerns the scope when it feeds a series of the scope''s series_keys or of an entity in its entity_ids; a NULL scope is the domain',
  'MET-011: measured actual coverage against its target; the product holds no approved coverage target — indeterminate unless the definition declares the coverage universe''s expected coverage the target', '0113 §MCB');

/* MET-012 SOURCE FRESHNESS ATTAINMENT (rate; dimension source; App M: "expected arrivals within freshness contract"). READING —
   population: the EXPECTED ARRIVALS of scheduled sources in the window: each scheduled attempt (observation.scheduled_attempts — the
   scheduler firing on the approved contract's cadence) started in the window and finished at or before the as-of. Numerator: the attempt
   finished AND the source's previous successful arrival (if any) lies within the contract's freshness threshold of it
   (freshness_threshold_seconds of the attempt's contract version) — freshness kept. Denominator: a failed or refused attempt (no arrival)
   or an arrival after a gap beyond the threshold (freshness lost before it). An attempt whose contract declares no freshness threshold is
   excluded (no contract to attain). SCOPE: the scope's sources. */
CREATE OR REPLACE FUNCTION analytics.mc_met012_freshness_attainment(p_tenant uuid, p_domain uuid, p_from timestamptz, p_to timestamptz, p_as_of timestamptz, p_scope jsonb, p_cohort jsonb, p_params jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = analytics, observation, public, pg_catalog, pg_temp AS $$
DECLARE v_newest timestamptz; v_src uuid[] := analytics.mcb_scope_sources(p_tenant, p_domain, p_scope); v_key text := p_cohort ->> 'source'; v_cap int := analytics.mcb_cap(p_params); v_bound bigint; v_recs jsonb;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the scheduled arrivals of the domain''s sources (MET-012)');
  IF coalesce(p_params ->> 'clock', 'record') <> 'record' THEN RETURN analytics.mcb_clock_refused('rate', 'MET-012', 'an expected arrival is a scheduler''s attempt in record time', p_params); END IF;
  SELECT count(*) INTO v_bound FROM observation.scheduled_attempts a WHERE a.tenant_id = p_tenant AND a.domain_id = p_domain AND a.started_at >= p_from AND a.started_at < p_to AND a.finished_at <= p_as_of;
  IF v_bound > v_cap THEN RETURN analytics.mcb_over_cap('rate', 'MET-012', v_bound, v_cap, 'record'); END IF;
  WITH att AS (
    SELECT a.*, c.source_key, c.freshness_threshold_seconds AS thr,
           (SELECT max(p.finished_at) FROM observation.scheduled_attempts p WHERE p.source_id = a.source_id AND p.outcome = 'finished' AND p.finished_at < a.finished_at AND p.finished_at <= p_as_of) AS prev_ok
      FROM observation.scheduled_attempts a
      LEFT JOIN observation.source_contracts_current c ON c.source_id = a.source_id AND c.contract_version = a.contract_version
     WHERE a.tenant_id = p_tenant AND a.domain_id = p_domain AND a.started_at >= p_from AND a.started_at < p_to AND a.finished_at <= p_as_of
       AND (v_src IS NULL OR a.source_id = ANY (v_src)) AND (v_key IS NULL OR c.source_key = v_key))
  SELECT coalesce(jsonb_agg(CASE
           WHEN a.thr IS NULL THEN jsonb_build_object('kind', 'scheduled_attempt', 'id', a.attempt_id, 'role', 'excluded', 'reason', 'the source''s contract declares no freshness threshold: no contract to attain',
                                                     'detail', jsonb_build_object('source', a.source_key))
           WHEN a.outcome <> 'finished' THEN jsonb_build_object('kind', 'scheduled_attempt', 'id', a.attempt_id, 'role', 'denominator', 'reason', format('the expected arrival did not happen (%s)', a.outcome),
                                                     'detail', jsonb_build_object('source', a.source_key, 'threshold_seconds', a.thr))
           WHEN a.prev_ok IS NOT NULL AND extract(epoch FROM (a.finished_at - a.prev_ok)) > a.thr THEN
                jsonb_build_object('kind', 'scheduled_attempt', 'id', a.attempt_id, 'role', 'denominator', 'reason', 'arrived after a gap beyond the freshness threshold (freshness was lost before it)',
                                   'detail', jsonb_build_object('source', a.source_key, 'threshold_seconds', a.thr, 'gap_seconds', round(extract(epoch FROM (a.finished_at - a.prev_ok))::numeric, 3)))
           ELSE jsonb_build_object('kind', 'scheduled_attempt', 'id', a.attempt_id, 'role', 'numerator',
                                   'detail', jsonb_strip_nulls(jsonb_build_object('source', a.source_key, 'threshold_seconds', a.thr, 'gap_seconds', CASE WHEN a.prev_ok IS NOT NULL THEN round(extract(epoch FROM (a.finished_at - a.prev_ok))::numeric, 3) END))) END
         ORDER BY a.started_at, a.attempt_id), '[]'::jsonb), max(a.finished_at) INTO v_recs, v_newest FROM att a;
  RETURN analytics.mcb_finish(jsonb_build_object('kind', 'rate', 'records', v_recs, 'reasons', '[]'::jsonb,
    'quality', jsonb_build_object('clock', 'record', 'scope_rule', CASE WHEN p_scope IS NULL THEN 'the domain' ELSE 'the sources feeding the scope''s series or entities' END,
      'notes', jsonb_build_array('an expected arrival = a scheduler attempt on the approved contract''s cadence; an unscheduled (manual) collection is not an expected arrival'))), 'source', v_newest);
END $$;
REVOKE ALL ON FUNCTION analytics.mc_met012_freshness_attainment(uuid,uuid,timestamptz,timestamptz,timestamptz,jsonb,jsonb,jsonb) FROM PUBLIC;
SELECT analytics.register_computation('met012_freshness_attainment', 'analytics.mc_met012_freshness_attainment', 'rate', ARRAY['source'],
  ARRAY['observation.scheduled_attempts', 'observation.source_contracts_current', 'prediction.series_registry'],
  'a source concerns the scope when it feeds a series of the scope''s series_keys or of an entity in its entity_ids; a NULL scope is the domain',
  'MET-012: scheduled (expected) arrivals in the window that arrived within the approved contract''s freshness threshold', '0113 §MCB');

/* The coverage losses of a window (MET-013, MET-037): a source health event moving the source INTO degraded, failed or suspended from
   healthy, unknown or a first evaluation, evaluated in the window and recorded at or before the as-of. */
CREATE OR REPLACE FUNCTION analytics.mcb_losses(p_tenant uuid, p_domain uuid, p_from timestamptz, p_to timestamptz, p_as_of timestamptz, p_sources uuid[])
RETURNS TABLE (event_id uuid, source_id uuid, prior_state text, new_state text, evaluated_at timestamptz, recorded_at timestamptz, lag_class text)
LANGUAGE sql STABLE SET search_path = observation, pg_catalog, pg_temp AS $$
  SELECT h.event_id, h.source_id, h.prior_state, h.new_state, h.evaluated_at, h.recorded_at, h.lag_class
    FROM observation.source_health_events h
   WHERE h.tenant_id = p_tenant AND h.domain_id = p_domain AND h.evaluated_at >= p_from AND h.evaluated_at < p_to AND h.recorded_at <= p_as_of
     AND h.new_state IN ('degraded', 'failed', 'suspended') AND (h.prior_state IS NULL OR h.prior_state IN ('healthy', 'unknown'))
     AND (p_sources IS NULL OR h.source_id = ANY (p_sources))
$$;
REVOKE ALL ON FUNCTION analytics.mcb_losses(uuid, uuid, timestamptz, timestamptz, timestamptz, uuid[]) FROM PUBLIC;

/* MET-013 BLIND-SPOT DETECTION LATENCY (duration, seconds; App M: "time from coverage loss to visible declared blind spot"). READING —
   population: the COVERAGE LOSSES evaluated in the window (analytics.mcb_losses). Start: the loss's stored evaluation instant. End: the
   blind spot DECLARED — the earliest of the source's coverage-loss attention item (executive.attention_items, class source.coverage_loss,
   subject the source, created at or after the loss) and the first impact marker the loss set on a dependent record
   (observation.source_impact_markers.set_by_event) — at or before the as-of. A loss never declared by the as-of is EXCLUDED as censored and
   the median is INDETERMINATE when any loss is censored (an undeclared blind spot is the worst case, never dropped silently). SCOPE: the
   scope's sources. */
CREATE OR REPLACE FUNCTION analytics.mc_met013_blind_spot_latency(p_tenant uuid, p_domain uuid, p_from timestamptz, p_to timestamptz, p_as_of timestamptz, p_scope jsonb, p_cohort jsonb, p_params jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = analytics, observation, executive, public, pg_catalog, pg_temp AS $$
DECLARE v_newest timestamptz; v_src uuid[] := analytics.mcb_scope_sources(p_tenant, p_domain, p_scope); v_recs jsonb; v_cens int; v_reasons jsonb := '[]'::jsonb;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the coverage losses of the domain''s sources (MET-013)');
  IF coalesce(p_params ->> 'clock', 'record') <> 'record' THEN RETURN analytics.mcb_clock_refused('duration', 'MET-013', 'a coverage loss and its declaration happen in record time', p_params); END IF;
  WITH l AS (
    SELECT x.*, (SELECT min(i.created_at) FROM executive.attention_items i WHERE i.tenant_id = p_tenant AND i.domain_id = p_domain AND i.signal_class = 'source.coverage_loss'
                    AND i.subject_kind = 'source' AND i.subject_id = x.source_id AND i.created_at >= x.evaluated_at AND i.created_at <= p_as_of) AS item_at,
           (SELECT min(m.set_at) FROM observation.source_impact_markers m WHERE m.set_by_event = x.event_id AND m.set_at <= p_as_of) AS marker_at
      FROM analytics.mcb_losses(p_tenant, p_domain, p_from, p_to, p_as_of, v_src) x)
  SELECT coalesce(jsonb_agg(CASE WHEN coalesce(l.item_at, l.marker_at) IS NOT NULL THEN
             jsonb_build_object('kind', 'coverage_loss', 'id', l.event_id, 'role', 'included',
               'detail', jsonb_build_object('value', round(greatest(0, extract(epoch FROM (least(l.item_at, l.marker_at) - l.evaluated_at)))::numeric, 3), 'lost_at', l.evaluated_at,
                                            'declared_at', least(l.item_at, l.marker_at), 'declared_by', CASE WHEN l.marker_at IS NULL OR (l.item_at IS NOT NULL AND l.item_at <= l.marker_at) THEN 'attention item' ELSE 'impact marker' END,
                                            'transition', format('%s → %s', coalesce(l.prior_state, 'first evaluation'), l.new_state), 'lag_class', l.lag_class))
           ELSE jsonb_build_object('kind', 'coverage_loss', 'id', l.event_id, 'role', 'excluded', 'reason', 'censored: no declared blind spot (no coverage-loss item, no impact marker) as of the as-of',
                                   'detail', jsonb_build_object('lost_at', l.evaluated_at, 'transition', format('%s → %s', coalesce(l.prior_state, 'first evaluation'), l.new_state))) END
           ORDER BY l.evaluated_at, l.event_id), '[]'::jsonb),
         count(*) FILTER (WHERE coalesce(l.item_at, l.marker_at) IS NULL),
         max(l.evaluated_at)
    INTO v_recs, v_cens, v_newest FROM l;
  IF v_cens > 0 THEN v_reasons := v_reasons || to_jsonb(format('%s coverage loss(es) were never declared as of the as-of: the latency distribution is censored (an undeclared blind spot is the worst case)', v_cens)); END IF;
  RETURN analytics.mcb_finish(jsonb_build_object('kind', 'duration', 'records', v_recs, 'reasons', v_reasons,
    'quality', jsonb_build_object('clock', 'record', 'unit', 'seconds', 'censored', v_cens, 'scope_rule', CASE WHEN p_scope IS NULL THEN 'the domain' ELSE 'the sources feeding the scope''s series or entities' END)), 'declared_by', v_newest);
END $$;
REVOKE ALL ON FUNCTION analytics.mc_met013_blind_spot_latency(uuid,uuid,timestamptz,timestamptz,timestamptz,jsonb,jsonb,jsonb) FROM PUBLIC;
SELECT analytics.register_computation('met013_blind_spot_latency', 'analytics.mc_met013_blind_spot_latency', 'duration', ARRAY[]::text[],
  ARRAY['observation.source_health_events', 'executive.attention_items', 'observation.source_impact_markers', 'prediction.series_registry', 'observation.source_contracts_current'],
  'a source concerns the scope when it feeds a series of the scope''s series_keys or of an entity in its entity_ids; a NULL scope is the domain',
  'MET-013: seconds from a coverage loss to its declared blind spot (coverage-loss attention item or first impact marker); censored losses said', '0113 §MCB');

/* MET-014 SEARCH EVIDENCE USEFULNESS (rate; dimension query_class; App M: "reviewed searches yielding relevant decision-support
   evidence"). READING — population: the REVIEWED searches recorded in the window (analytics.search_reviews, a named human never the
   searcher), reviewed at or before the as-of. Numerator: verdict relevant. Unreviewed searches are not in the population (counted in
   quality). Never by person: the searcher is not read, the reviewer is not returned (D4). SCOPE: ignored — a search's subject is free text
   (stated). */
CREATE OR REPLACE FUNCTION analytics.mc_met014_search_usefulness(p_tenant uuid, p_domain uuid, p_from timestamptz, p_to timestamptz, p_as_of timestamptz, p_scope jsonb, p_cohort jsonb, p_params jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = analytics, executive, observation, public, pg_catalog, pg_temp AS $$
DECLARE v_newest timestamptz; v_class text := p_cohort ->> 'query_class'; v_recs jsonb; v_unrev int;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the reviewed searches of the domain (MET-014)');
  IF coalesce(p_params ->> 'clock', 'record') <> 'record' THEN RETURN analytics.mcb_clock_refused('rate', 'MET-014', 'a search and its review are recorded in record time', p_params); END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('kind', 'search_review', 'id', r.review_id, 'role', CASE WHEN r.verdict = 'relevant' THEN 'numerator' ELSE 'denominator' END,
                                               'detail', jsonb_build_object('search_id', s.search_id, 'query_class', r.query_class, 'hits', s.hits, 'reviewer_role', r.reviewer_role))
                            ORDER BY s.searched_at, r.review_id), '[]'::jsonb), max(s.searched_at) INTO v_recs, v_newest
    FROM analytics.search_reviews r JOIN executive.search_events s ON s.search_id = r.search_id
   WHERE r.tenant_id = p_tenant AND r.domain_id = p_domain AND s.searched_at >= p_from AND s.searched_at < p_to AND r.reviewed_at <= p_as_of
     AND (v_class IS NULL OR r.query_class = v_class);
  SELECT count(*) INTO v_unrev FROM executive.search_events s WHERE s.tenant_id = p_tenant AND s.domain_id = p_domain AND s.searched_at >= p_from AND s.searched_at < p_to AND s.searched_at <= p_as_of
     AND NOT EXISTS (SELECT 1 FROM analytics.search_reviews r WHERE r.search_id = s.search_id AND r.reviewed_at <= p_as_of);
  RETURN analytics.mcb_finish(jsonb_build_object('kind', 'rate', 'records', v_recs, 'reasons', '[]'::jsonb,
    'quality', jsonb_build_object('clock', 'record', 'unreviewed_searches', v_unrev, 'scope_rule', 'ignored: a search''s subject is free text',
      'notes', jsonb_build_array('role-level: no searcher and no reviewer is named or grouped; the reviewer is never the searcher (separation of duties at the review port)'))), 'query_class', v_newest);
END $$;
REVOKE ALL ON FUNCTION analytics.mc_met014_search_usefulness(uuid,uuid,timestamptz,timestamptz,timestamptz,jsonb,jsonb,jsonb) FROM PUBLIC;
SELECT analytics.register_computation('met014_search_usefulness', 'analytics.mc_met014_search_usefulness', 'rate', ARRAY['query_class'],
  ARRAY['analytics.search_reviews', 'executive.search_events'], 'ignored: a search''s subject is free text (no scope relation)',
  'MET-014: reviewed searches of the window whose results a named reviewer (never the searcher) judged relevant decision-support evidence', '0113 §MCB');

/* MET-017 GRAPH PROVENANCE VALIDITY (rate; dimension relationship_class; App M: "graph relationships resolving to admissible evidence and
   revision"). READING — population: the graph edges ASSERTED in the window, still canonical at the as-of (an edge retracted at or before
   the as-of is excluded: not canonical). Numerator: the edge's claim resolves to its exact version (the REVISION the edge rests on; the
   graph revision that committed it is named when there is one) and is not withdrawn, AND its evidence resolves by the edge's digest to
   stored, untombstoned bytes (admissible). The predicate is the relationship class. SCOPE: an edge concerns the scope when its subject or
   object entity is in the scope's entity_ids. edges_current is a CURRENT-state table: retraction instants are kept, so a replay is stable
   unless an edge row is re-asserted in place (stated). */
CREATE OR REPLACE FUNCTION analytics.mc_met017_edge_provenance_validity(p_tenant uuid, p_domain uuid, p_from timestamptz, p_to timestamptz, p_as_of timestamptz, p_scope jsonb, p_cohort jsonb, p_params jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = analytics, graph, objects, observation, public, pg_catalog, pg_temp AS $$
DECLARE v_newest timestamptz; v_class text := p_cohort ->> 'relationship_class'; v_cap int := analytics.mcb_cap(p_params); v_bound bigint; v_recs jsonb;
        v_ent text[] := CASE WHEN p_scope IS NULL THEN NULL ELSE ARRAY(SELECT jsonb_array_elements_text(coalesce(p_scope -> 'entity_ids', '[]'::jsonb))) END;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the provenance of the domain''s graph relationships (MET-017)');
  IF coalesce(p_params ->> 'clock', 'record') <> 'record' THEN RETURN analytics.mcb_clock_refused('rate', 'MET-017', 'an edge is asserted in record time', p_params); END IF;
  SELECT count(*) INTO v_bound FROM graph.edges_current e WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain AND e.asserted_at >= p_from AND e.asserted_at < p_to AND e.asserted_at <= p_as_of;
  IF v_bound > v_cap THEN RETURN analytics.mcb_over_cap('rate', 'MET-017', v_bound, v_cap, 'record'); END IF;
  WITH e AS (
    SELECT x.*, analytics.mcb_resolve(p_tenant, p_domain, 'claim:' || x.claim_object_id || '@' || x.claim_version, x.asserted_at, p_as_of) AS rc,
           analytics.mcb_resolve(p_tenant, p_domain, 'EVD:' || x.evidence_object_id, x.asserted_at, p_as_of, x.evidence_digest) AS re,
           (SELECT r.revision FROM graph.revision_items i JOIN graph.revisions r ON r.revision_id = i.revision_id WHERE i.kind = 'edge' AND i.ref_id = x.edge_id AND r.committed_at <= p_as_of
             ORDER BY r.revision LIMIT 1) AS graph_revision
      FROM graph.edges_current x
     WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.asserted_at >= p_from AND x.asserted_at < p_to AND x.asserted_at <= p_as_of
       AND (v_class IS NULL OR x.predicate = v_class)
       AND (v_ent IS NULL OR x.subject_entity_id::text = ANY (v_ent) OR x.object_entity_id::text = ANY (v_ent)))
  SELECT coalesce(jsonb_agg(CASE
           WHEN e.retracted_at IS NOT NULL AND e.retracted_at <= p_as_of THEN jsonb_build_object('kind', 'edge', 'id', e.edge_id, 'role', 'excluded', 'reason', 'retracted at or before the as-of: not canonical',
                                                     'detail', jsonb_build_object('relationship_class', e.predicate))
           ELSE jsonb_build_object('kind', 'edge', 'id', e.edge_id,
             'role', CASE WHEN (e.rc ->> 'resolved')::boolean AND (e.re ->> 'resolved')::boolean THEN 'numerator' ELSE 'denominator' END,
             'reason', CASE WHEN NOT (e.rc ->> 'resolved')::boolean THEN 'claim: ' || (e.rc ->> 'reason') WHEN NOT (e.re ->> 'resolved')::boolean THEN 'evidence: ' || (e.re ->> 'reason') END,
             'detail', jsonb_strip_nulls(jsonb_build_object('relationship_class', e.predicate, 'claim', format('%s@%s', e.claim_object_id, e.claim_version), 'evidence_version', e.re ->> 'version',
                                                            'mode', e.mode, 'graph_revision', e.graph_revision, 'tier', e.re ->> 'tier'))) END
         ORDER BY e.asserted_at, e.edge_id), '[]'::jsonb), max(e.asserted_at) INTO v_recs, v_newest FROM e;
  RETURN analytics.mcb_finish(jsonb_build_object('kind', 'rate', 'records', v_recs, 'reasons', '[]'::jsonb,
    'quality', jsonb_build_object('clock', 'record', 'scope_rule', CASE WHEN p_scope IS NULL THEN 'the domain' ELSE 'edges whose subject or object entity is in the scope' END,
      'replay_share', (SELECT round(count(*) FILTER (WHERE x -> 'detail' ->> 'mode' = 'replay')::numeric / nullif(count(*), 0), 6) FROM jsonb_array_elements(v_recs) x),
      'notes', jsonb_build_array('the revision an edge rests on = its claim''s exact version; the committing graph revision is named when the edge was committed through one'))), 'relationship_class', v_newest);
END $$;
REVOKE ALL ON FUNCTION analytics.mc_met017_edge_provenance_validity(uuid,uuid,timestamptz,timestamptz,timestamptz,jsonb,jsonb,jsonb) FROM PUBLIC;
SELECT analytics.register_computation('met017_edge_provenance_validity', 'analytics.mc_met017_edge_provenance_validity', 'rate', ARRAY['relationship_class'],
  ARRAY['graph.edges_current', 'graph.revision_items', 'graph.revisions', 'objects.canonical_objects', 'observation.blob_manifests', 'observation.blob_tombstones'],
  'an edge concerns the scope when its subject or object entity is in the scope''s entity_ids; a NULL scope is the domain',
  'MET-017: canonical edges asserted in the window whose claim version and evidence (by digest) resolve to admissible, stored records', '0113 §MCB');

/* MET-018 MEMORY RETRIEVAL VALIDITY (rate; dimension memory_class; App M: "retrieved memories current for as-of, permission, correction,
   and retention context"). READING — population: each memory ACCESS in the window (memory.item_access — one row per served version).
   Each is RE-JUDGED: (as-of) the served version is the version current at the read's as-of in RECORD time (the latest MEM version recorded
   at or before it; no as-of = the access instant) — the retrieval's own rule; (correction) the item was not withdrawn at or before that
   instant; (retention) its retain_until had not passed at that instant; (permission) the access names a purpose the item's audience
   admits (when it declares purposes) and an authorising policy decision. The memory class is the item's record_class. items_current is a
   CURRENT-state table (audience, retention) — stated. SCOPE: an item concerns the scope when its related objective is in objective_ids. */
CREATE OR REPLACE FUNCTION analytics.mc_met018_memory_retrieval_validity(p_tenant uuid, p_domain uuid, p_from timestamptz, p_to timestamptz, p_as_of timestamptz, p_scope jsonb, p_cohort jsonb, p_params jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = analytics, memory, objects, observation, public, pg_catalog, pg_temp AS $$
DECLARE v_newest timestamptz; v_class text := p_cohort ->> 'memory_class'; v_cap int := analytics.mcb_cap(p_params); v_bound bigint; v_recs jsonb;
        v_obj text[] := CASE WHEN p_scope IS NULL THEN NULL ELSE ARRAY(SELECT jsonb_array_elements_text(coalesce(p_scope -> 'objective_ids', '[]'::jsonb))) END;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the memory accesses of the domain (MET-018)');
  IF coalesce(p_params ->> 'clock', 'record') <> 'record' THEN RETURN analytics.mcb_clock_refused('rate', 'MET-018', 'a memory access is re-judged at its own record-time as-of', p_params); END IF;
  SELECT count(*) INTO v_bound FROM memory.item_access a WHERE a.tenant_id = p_tenant AND a.domain_id = p_domain AND a.accessed_at >= p_from AND a.accessed_at < p_to AND a.accessed_at <= p_as_of;
  IF v_bound > v_cap THEN RETURN analytics.mcb_over_cap('rate', 'MET-018', v_bound, v_cap, 'record'); END IF;
  WITH a AS (
    SELECT x.access_id, x.item_id, x.object_version, x.purpose_id, x.policy_decision_id, x.accessed_at, coalesce(x.read_as_of, x.accessed_at) AS at, x.read_as_of,
           i.record_class, i.audience_purposes, i.retain_until, i.related_objective_id
      FROM memory.item_access x JOIN memory.items_current i ON i.item_id = x.item_id
     WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.accessed_at >= p_from AND x.accessed_at < p_to AND x.accessed_at <= p_as_of
       AND (v_class IS NULL OR i.record_class = v_class) AND (v_obj IS NULL OR i.related_objective_id::text = ANY (v_obj))),
  j AS (
    SELECT a.*, (SELECT max(o.object_version) FROM objects.canonical_objects o WHERE o.object_id = a.item_id AND o.object_type = 'MEM' AND o.recorded_at <= a.at) AS current_version,
           (SELECT min(e.occurred_at) FROM memory.item_events e WHERE e.item_id = a.item_id AND e.event = 'memory.withdrawn' AND e.occurred_at <= a.at) AS withdrawn_at
      FROM a),
  judged AS (
    SELECT j.*, array_remove(ARRAY[
             CASE WHEN j.current_version IS NULL THEN format('version %s was served but no version was recorded at the read''s as-of', j.object_version)
                  WHEN j.current_version <> j.object_version THEN format('version %s was served; version %s was current at the read''s as-of', j.object_version, j.current_version) END,
             CASE WHEN j.withdrawn_at IS NOT NULL THEN format('the item was withdrawn at %s, before the read''s as-of', j.withdrawn_at) END,
             CASE WHEN j.retain_until IS NOT NULL AND j.retain_until <= j.at THEN 'served past its retention' END,
             CASE WHEN j.policy_decision_id IS NULL THEN 'no authorising policy decision is recorded for the access' END,
             CASE WHEN cardinality(coalesce(j.audience_purposes, '{}')) > 0 AND NOT (j.purpose_id = ANY (j.audience_purposes)) THEN format('the purpose %s is outside the item''s audience', j.purpose_id) END], NULL) AS v
      FROM j)
  SELECT coalesce(jsonb_agg(jsonb_build_object('kind', 'memory_access', 'id', x.access_id, 'role', CASE WHEN cardinality(x.v) = 0 THEN 'numerator' ELSE 'denominator' END,
                                               'reason', CASE WHEN cardinality(x.v) > 0 THEN array_to_string(x.v, '; ') END,
                                               'detail', jsonb_strip_nulls(jsonb_build_object('memory_class', x.record_class, 'item_id', x.item_id, 'version_served', x.object_version,
                                                                                              'version_current', x.current_version, 'read_as_of', x.read_as_of, 'purpose', x.purpose_id)))
                            ORDER BY x.accessed_at, x.access_id), '[]'::jsonb), max(x.accessed_at) INTO v_recs, v_newest FROM judged x;
  RETURN analytics.mcb_finish(jsonb_build_object('kind', 'rate', 'records', v_recs, 'reasons', '[]'::jsonb,
    'quality', jsonb_build_object('clock', 'record', 'scope_rule', CASE WHEN p_scope IS NULL THEN 'the domain' ELSE 'items whose related objective is in the scope' END,
      'notes', jsonb_build_array('the as-of is record time (the retrieval''s own rule: the version recorded at or before it)',
                                 'memory.items_current is a current-state table (audience, retention): a replay reports mismatch if they moved since'))), 'memory_class', v_newest);
END $$;
REVOKE ALL ON FUNCTION analytics.mc_met018_memory_retrieval_validity(uuid,uuid,timestamptz,timestamptz,timestamptz,jsonb,jsonb,jsonb) FROM PUBLIC;
SELECT analytics.register_computation('met018_memory_retrieval_validity', 'analytics.mc_met018_memory_retrieval_validity', 'rate', ARRAY['memory_class'],
  ARRAY['memory.item_access', 'memory.items_current', 'memory.item_events', 'objects.canonical_objects'],
  'a memory item concerns the scope when its related objective is in the scope''s objective_ids; a NULL scope is the domain',
  'MET-018: memory accesses of the window re-judged against the version current at their as-of, withdrawal, retention and purpose', '0113 §MCB');

/* MET-031 AGENT TASK SUCCESS (rate; dimensions agent_kind, task; App M: "bounded runs completing accepted outcome without authority, tool,
   or evidence violation"). READING — population: the agent runs FINISHED in the window (closed at or before the as-of). Denominator: a run
   that did not complete (faulted, refused, stopped) or that recorded a refusal (the product refused one of its acts — an authority, tool or
   evidence violation attempted) or escalated. Numerator: a clean, finished run whose outcome was ACCEPTED. ACCEPTANCE IS NOT RECORDED
   UNIFORMLY: the product records no acceptance of an agent's outcome as such. A clean run's acceptance is told only where the definition
   declares a task SELF-ACCEPTING (params.self_accepting_tasks — a bounded autonomous task whose completion is its accepted outcome,
   approved with the definition and labelled per record); every other clean run is EXCLUDED ("acceptance not recorded") and, when any is,
   the result is INDETERMINATE (a rate over failures and declared tasks alone would mislead). SCOPE: ignored — agent runs are domain
   operations (stated). */
CREATE OR REPLACE FUNCTION analytics.mc_met031_agent_task_success(p_tenant uuid, p_domain uuid, p_from timestamptz, p_to timestamptz, p_as_of timestamptz, p_scope jsonb, p_cohort jsonb, p_params jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = analytics, executive, observation, public, pg_catalog, pg_temp AS $$
DECLARE v_newest timestamptz; v_kind text := p_cohort ->> 'agent_kind'; v_task text := p_cohort ->> 'task'; v_cap int := analytics.mcb_cap(p_params); v_bound bigint; v_recs jsonb; v_untold int; v_tasks text;
        v_self text[] := ARRAY(SELECT jsonb_array_elements_text(CASE WHEN jsonb_typeof(p_params -> 'self_accepting_tasks') = 'array' THEN p_params -> 'self_accepting_tasks' ELSE '[]'::jsonb END));
        v_reasons jsonb := '[]'::jsonb;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the agent runs of the domain (MET-031)');
  IF coalesce(p_params ->> 'clock', 'record') <> 'record' THEN RETURN analytics.mcb_clock_refused('rate', 'MET-031', 'an agent run is closed in record time', p_params); END IF;
  SELECT count(*) INTO v_bound FROM executive.agent_runs r WHERE r.tenant_id = p_tenant AND r.domain_id = p_domain AND r.finished_at >= p_from AND r.finished_at < p_to AND r.finished_at <= p_as_of
     AND (v_kind IS NULL OR r.agent_kind = v_kind) AND (v_task IS NULL OR r.task = v_task);
  IF v_bound > v_cap THEN RETURN analytics.mcb_over_cap('rate', 'MET-031', v_bound, v_cap, 'record'); END IF;
  WITH r AS (
    SELECT x.run_id, x.agent_kind, x.task, x.outcome, x.stop_reason, x.escalated_to, jsonb_array_length(coalesce(x.refusals, '[]'::jsonb)) AS refusals, x.finished_at,
           CASE WHEN coalesce(x.outcome, '') <> 'finished' THEN format('the run did not complete (%s)', coalesce(x.outcome, 'no outcome'))
                WHEN jsonb_array_length(coalesce(x.refusals, '[]'::jsonb)) > 0 THEN format('%s of its acts were refused (an authority, tool or evidence violation attempted)', jsonb_array_length(x.refusals))
                WHEN x.escalated_to IS NOT NULL THEN 'it escalated instead of completing' END AS failure
      FROM executive.agent_runs x
     WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.finished_at >= p_from AND x.finished_at < p_to AND x.finished_at <= p_as_of
       AND (v_kind IS NULL OR x.agent_kind = v_kind) AND (v_task IS NULL OR x.task = v_task))
  SELECT coalesce(jsonb_agg(CASE
           WHEN r.failure IS NOT NULL THEN jsonb_build_object('kind', 'agent_run', 'id', r.run_id, 'role', 'denominator', 'reason', r.failure, 'detail', jsonb_build_object('agent_kind', r.agent_kind, 'task', r.task, 'outcome', r.outcome))
           WHEN r.task = ANY (v_self) THEN jsonb_build_object('kind', 'agent_run', 'id', r.run_id, 'role', 'numerator',
                                                             'detail', jsonb_build_object('agent_kind', r.agent_kind, 'task', r.task, 'outcome', r.outcome, 'acceptance', 'declared by the definition: completion is this task''s accepted outcome'))
           ELSE jsonb_build_object('kind', 'agent_run', 'id', r.run_id, 'role', 'excluded', 'reason', format('acceptance not recorded: the product records no acceptance of a %s run''s outcome', r.task),
                                   'detail', jsonb_build_object('agent_kind', r.agent_kind, 'task', r.task, 'outcome', r.outcome)) END
         ORDER BY r.finished_at, r.run_id), '[]'::jsonb),
         count(*) FILTER (WHERE r.failure IS NULL AND NOT (r.task = ANY (v_self))),
         string_agg(DISTINCT r.task, ', ' ORDER BY r.task) FILTER (WHERE r.failure IS NULL AND NOT (r.task = ANY (v_self))),
         max(r.finished_at)
    INTO v_recs, v_untold, v_tasks, v_newest FROM r;
  IF v_untold > 0 THEN
    v_reasons := v_reasons || to_jsonb(format('acceptance cannot be told for %s clean run(s) (tasks: %s): the product records no uniform acceptance of an agent''s outcome — a rate over failures and declared tasks alone would mislead', v_untold, v_tasks));
  END IF;
  RETURN analytics.mcb_finish(jsonb_build_object('kind', 'rate', 'records', v_recs, 'reasons', v_reasons,
    'quality', jsonb_build_object('clock', 'record', 'acceptance_untold', v_untold, 'self_accepting_tasks', to_jsonb(v_self), 'scope_rule', 'ignored: agent runs are domain operations')), 'task', v_newest);
END $$;
REVOKE ALL ON FUNCTION analytics.mc_met031_agent_task_success(uuid,uuid,timestamptz,timestamptz,timestamptz,jsonb,jsonb,jsonb) FROM PUBLIC;
SELECT analytics.register_computation('met031_agent_task_success', 'analytics.mc_met031_agent_task_success', 'rate', ARRAY['agent_kind', 'task'],
  ARRAY['executive.agent_runs'], 'ignored: agent runs are operations of the domain (no scope relation)',
  'MET-031: agent runs finished in the window completing without refusal, escalation or fault with an accepted outcome — acceptance told only for tasks the definition declares self-accepting; otherwise indeterminate, said', '0113 §MCB');

/* MET-033 AGENT TRACE CLOSURE (rate; dimension agent_kind; App M: "runs with complete identity, context, model, tool, action, checkpoint,
   and outcome trace"). READING — population: the agent runs finished in the window. Per run, the trace vector the product CAN tell:
   identity (agent, principal, version, code digest), context (the trigger and its reference, room or package), action (outputs recorded),
   outcome (the outcome and its closing instant). The product records NO model, tool-call or checkpoint trace of an agent run (no gateway
   call is linked to an agent run; the tool gateway and checkpoints arrive with B70 / B71): those three fields cannot be told, so the
   result is INDETERMINATE (said, never 0). Each record still shows which recorded fields are present (numerator: all recorded fields
   present). SCOPE: ignored (domain operations, stated). */
CREATE OR REPLACE FUNCTION analytics.mc_met033_agent_trace_closure(p_tenant uuid, p_domain uuid, p_from timestamptz, p_to timestamptz, p_as_of timestamptz, p_scope jsonb, p_cohort jsonb, p_params jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = analytics, executive, observation, public, pg_catalog, pg_temp AS $$
DECLARE v_newest timestamptz; v_kind text := p_cohort ->> 'agent_kind'; v_cap int := analytics.mcb_cap(p_params); v_bound bigint; v_recs jsonb;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the agent run traces of the domain (MET-033)');
  IF coalesce(p_params ->> 'clock', 'record') <> 'record' THEN RETURN analytics.mcb_clock_refused('rate', 'MET-033', 'an agent run is closed in record time', p_params); END IF;
  SELECT count(*) INTO v_bound FROM executive.agent_runs r WHERE r.tenant_id = p_tenant AND r.domain_id = p_domain AND r.finished_at >= p_from AND r.finished_at < p_to AND r.finished_at <= p_as_of
     AND (v_kind IS NULL OR r.agent_kind = v_kind);
  IF v_bound > v_cap THEN RETURN analytics.mcb_over_cap('rate', 'MET-033', v_bound, v_cap, 'record'); END IF;
  WITH r AS (
    SELECT x.run_id, x.agent_kind, x.finished_at,
           (x.agent_id IS NOT NULL AND x.principal_id IS NOT NULL AND btrim(x.agent_version) <> '' AND btrim(x.code_digest) <> '') AS identity,
           (btrim(x.trigger_kind) <> '' AND (x.trigger_ref IS NOT NULL OR x.room_id IS NOT NULL OR x.package_id IS NOT NULL)) AS context,
           (x.outputs IS NOT NULL AND x.outputs <> '{}'::jsonb) AS action,
           (x.outcome IS NOT NULL AND x.finished_at IS NOT NULL) AS outcome
      FROM executive.agent_runs x
     WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.finished_at >= p_from AND x.finished_at < p_to AND x.finished_at <= p_as_of AND (v_kind IS NULL OR x.agent_kind = v_kind))
  SELECT coalesce(jsonb_agg(jsonb_build_object('kind', 'agent_run', 'id', r.run_id, 'role', CASE WHEN r.identity AND r.context AND r.action AND r.outcome THEN 'numerator' ELSE 'denominator' END,
             'reason', CASE WHEN NOT (r.identity AND r.context AND r.action AND r.outcome) THEN 'missing ' || array_to_string(array_remove(ARRAY[CASE WHEN NOT r.identity THEN 'identity' END,
                        CASE WHEN NOT r.context THEN 'context' END, CASE WHEN NOT r.action THEN 'action' END, CASE WHEN NOT r.outcome THEN 'outcome' END], NULL), ', ') END,
             'detail', jsonb_build_object('agent_kind', r.agent_kind, 'trace', jsonb_build_object('identity', r.identity, 'context', r.context, 'action', r.action, 'outcome', r.outcome,
                                          'model', 'not recorded', 'tool', 'not recorded', 'checkpoint', 'not recorded')))
           ORDER BY r.finished_at, r.run_id), '[]'::jsonb), max(r.finished_at) INTO v_recs, v_newest FROM r;
  RETURN analytics.mcb_finish(jsonb_build_object('kind', 'rate', 'records', v_recs,
    'reasons', CASE WHEN jsonb_array_length(v_recs) > 0 THEN jsonb_build_array('the product records no model, tool-call or checkpoint trace of an agent run (the tool gateway and checkpoints arrive with B70/B71): trace closure cannot be told — the recorded fields are shown per run') ELSE '[]'::jsonb END,
    'quality', jsonb_build_object('clock', 'record', 'fields_recorded', jsonb_build_array('identity', 'context', 'action', 'outcome'), 'fields_unrecorded', jsonb_build_array('model', 'tool', 'checkpoint'),
      'scope_rule', 'ignored: agent runs are domain operations')), 'agent_kind', v_newest);
END $$;
REVOKE ALL ON FUNCTION analytics.mc_met033_agent_trace_closure(uuid,uuid,timestamptz,timestamptz,timestamptz,jsonb,jsonb,jsonb) FROM PUBLIC;
SELECT analytics.register_computation('met033_agent_trace_closure', 'analytics.mc_met033_agent_trace_closure', 'rate', ARRAY['agent_kind'],
  ARRAY['executive.agent_runs'], 'ignored: agent runs are operations of the domain (no scope relation)',
  'MET-033: agent runs of the window with a complete trace — indeterminate while the product records no model, tool or checkpoint trace (said; the recorded fields shown per run)', '0113 §MCB');

/* MET-036 PRODUCT AVAILABILITY (rate; dimension capability; App M: "successful safe product outcomes over eligible demand"). READING
   (defined here from the audit chain): ELIGIBLE DEMAND = the API requests of the window (audit.audit_events `api.request`) that the policy
   decision point ADMITTED (an outcome other than `denied`: a request refused for authority, scope or entitlement is not eligible demand —
   counted in quality). A SAFE PRODUCT OUTCOME = the request succeeded (`success`; a degraded but declared answer — EYE-DEG-001 — counts,
   flagged). UNAVAILABLE = a failure of the product's own (integrity EYE-INT, dependency EYE-DEP, model EYE-MDL, capacity EYE-CAP, audit
   EYE-AUD, external effect EYE-EXT, reconciliation EYE-RCV, deadline EYE-WFL-003, degraded refusal EYE-DEG, or an unclassified code).
   A GOVERNED REFUSAL of the request (request, state, temporal, provenance, quality, workflow, authority-in-port, agent, governance,
   entitlement, tenancy codes) is the product answering safely an unsatisfiable request: EXCLUDED from eligible demand, said per record.
   The capability is the action's first segment (`decision`, `prediction` …). Records name the request (partition#sequence) and its action
   and code — never the actor. SCOPE: ignored — availability is the service's (stated). */
CREATE OR REPLACE FUNCTION analytics.mc_met036_product_availability(p_tenant uuid, p_domain uuid, p_from timestamptz, p_to timestamptz, p_as_of timestamptz, p_scope jsonb, p_cohort jsonb, p_params jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = analytics, audit, observation, public, pg_catalog, pg_temp AS $$
DECLARE v_newest timestamptz; v_cap_key text := p_cohort ->> 'capability'; v_cap int := analytics.mcb_cap(p_params); v_bound bigint; v_denied bigint; v_recs jsonb;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the request outcomes of the domain (MET-036)');
  IF coalesce(p_params ->> 'clock', 'record') <> 'record' THEN RETURN analytics.mcb_clock_refused('rate', 'MET-036', 'a request is served in record time', p_params); END IF;
  SELECT count(*) FILTER (WHERE a.outcome <> 'denied'), count(*) FILTER (WHERE a.outcome = 'denied') INTO v_bound, v_denied
    FROM audit.audit_events a WHERE a.tenant_id = p_tenant AND a.domain_id = p_domain AND a.event_type = 'api.request' AND a.created_at >= p_from AND a.created_at < p_to AND a.created_at <= p_as_of
     AND (v_cap_key IS NULL OR split_part(a.action, '.', 1) = v_cap_key);
  IF v_bound > v_cap THEN RETURN analytics.mcb_over_cap('rate', 'MET-036', v_bound, v_cap, 'record'); END IF;
  WITH q AS (
    SELECT a.partition_id, a.audit_seq, a.action, a.outcome, a.result_code, a.created_at, split_part(a.action, '.', 1) AS capability,
           CASE WHEN a.outcome = 'success' THEN 'safe'
                WHEN coalesce(a.result_code, '') ~ '^EYE[-_](INT|DEP|MDL|CAP|AUD|EXT|RCV|DEG)[-_]' OR coalesce(a.result_code, '') ~ '^EYE[-_]WFL[-_]003$' THEN 'unavailable'
                WHEN coalesce(a.result_code, '') ~ '^EYE[-_](REQ|STA|TMP|PRV|QUA|WFL|AUT|AGT|GOV|ENT|TEN|IDN)[-_]' THEN 'governed_refusal'
                ELSE 'unavailable' END AS class
      FROM audit.audit_events a
     WHERE a.tenant_id = p_tenant AND a.domain_id = p_domain AND a.event_type = 'api.request' AND a.outcome <> 'denied' AND a.created_at >= p_from AND a.created_at < p_to AND a.created_at <= p_as_of
       AND (v_cap_key IS NULL OR split_part(a.action, '.', 1) = v_cap_key))
  SELECT coalesce(jsonb_agg(jsonb_build_object('kind', 'request', 'id', q.partition_id || '#' || q.audit_seq,
             'role', CASE q.class WHEN 'safe' THEN 'numerator' WHEN 'unavailable' THEN 'denominator' ELSE 'excluded' END,
             'reason', CASE q.class WHEN 'unavailable' THEN format('the product failed the request (%s)', coalesce(q.result_code, 'no code'))
                                    WHEN 'governed_refusal' THEN format('a governed refusal (%s): the product answered an unsatisfiable request safely — not eligible demand for a successful outcome', q.result_code) END,
             'detail', jsonb_strip_nulls(jsonb_build_object('capability', q.capability, 'action', q.action, 'result_code', q.result_code,
                                                            'degraded', CASE WHEN q.class = 'safe' AND coalesce(q.result_code, '') ~ '^EYE[-_]DEG' THEN true END)))
           ORDER BY q.created_at, q.partition_id, q.audit_seq), '[]'::jsonb), max(q.created_at) INTO v_recs, v_newest FROM q;
  RETURN analytics.mcb_finish(jsonb_build_object('kind', 'rate', 'records', v_recs, 'reasons', '[]'::jsonb,
    'quality', jsonb_build_object('clock', 'record', 'denied_not_eligible', v_denied, 'scope_rule', 'ignored: availability is the service''s',
      'degraded_share', (SELECT round(count(*) FILTER (WHERE (x -> 'detail' ->> 'degraded')::boolean)::numeric / nullif(count(*) FILTER (WHERE x ->> 'role' = 'numerator'), 0), 6) FROM jsonb_array_elements(v_recs) x),
      'notes', jsonb_build_array('eligible demand = requests the policy decision point admitted; a governed refusal is excluded (the product answered safely)',
                                 'the capability is the action''s first segment'))), 'capability', v_newest);
END $$;
REVOKE ALL ON FUNCTION analytics.mc_met036_product_availability(uuid,uuid,timestamptz,timestamptz,timestamptz,jsonb,jsonb,jsonb) FROM PUBLIC;
SELECT analytics.register_computation('met036_product_availability', 'analytics.mc_met036_product_availability', 'rate', ARRAY['capability'],
  ARRAY['audit.audit_events'], 'ignored: availability is a property of the service (no scope relation)',
  'MET-036: requests the policy decision point admitted in the window that the product served successfully (degraded answers flagged); governed refusals excluded, failures counted', '0113 §MCB');

/* MET-037 DEGRADED-MODE DECLARATION LATENCY (duration, seconds; App M: "time from qualifying condition to accurate user-visible product
   state"). READING — population: the QUALIFYING CONDITIONS of the window that reached products: each coverage loss (analytics.mcb_losses)
   that set impact markers on dependent records (forecasts, warnings, packages, scenarios, runs, assumptions). Start: the loss's stored
   evaluation instant. End: THE USER-VISIBLE INSTANT = the marker's set_at (the marker is what a product's reader sees); "accurate" = every
   dependent the loss marked shows it — the LATEST set_at of the markers that loss set. A loss that marked no dependent is excluded (no
   product state to declare); a product degraded by a person's act (products.product_events product.degraded) has no recorded qualifying
   condition and is counted in quality, not measured. (MET-013 measures the declaration to humans; MET-037 the product's own state.)
   SCOPE: the scope's sources. */
CREATE OR REPLACE FUNCTION analytics.mc_met037_degraded_declaration_latency(p_tenant uuid, p_domain uuid, p_from timestamptz, p_to timestamptz, p_as_of timestamptz, p_scope jsonb, p_cohort jsonb, p_params jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = analytics, observation, products, public, pg_catalog, pg_temp AS $$
DECLARE v_newest timestamptz; v_src uuid[] := analytics.mcb_scope_sources(p_tenant, p_domain, p_scope); v_recs jsonb; v_human bigint;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the degraded declarations of the domain''s products (MET-037)');
  IF coalesce(p_params ->> 'clock', 'record') <> 'record' THEN RETURN analytics.mcb_clock_refused('duration', 'MET-037', 'a condition and its user-visible state happen in record time', p_params); END IF;
  WITH l AS (
    SELECT x.*, (SELECT max(m.set_at) FROM observation.source_impact_markers m WHERE m.set_by_event = x.event_id AND m.set_at <= p_as_of) AS visible_at,
           (SELECT count(*) FROM observation.source_impact_markers m WHERE m.set_by_event = x.event_id AND m.set_at <= p_as_of) AS marked,
           (SELECT jsonb_agg(DISTINCT m.subject_kind) FROM observation.source_impact_markers m WHERE m.set_by_event = x.event_id AND m.set_at <= p_as_of) AS kinds
      FROM analytics.mcb_losses(p_tenant, p_domain, p_from, p_to, p_as_of, v_src) x)
  SELECT coalesce(jsonb_agg(CASE WHEN l.visible_at IS NOT NULL THEN
             jsonb_build_object('kind', 'coverage_loss', 'id', l.event_id, 'role', 'included',
               'detail', jsonb_build_object('value', round(greatest(0, extract(epoch FROM (l.visible_at - l.evaluated_at)))::numeric, 3), 'condition_at', l.evaluated_at, 'visible_at', l.visible_at,
                                            'products_marked', l.marked, 'product_kinds', l.kinds))
           ELSE jsonb_build_object('kind', 'coverage_loss', 'id', l.event_id, 'role', 'excluded', 'reason', 'the condition marked no dependent product (no product state to declare)',
                                   'detail', jsonb_build_object('condition_at', l.evaluated_at)) END
           ORDER BY l.evaluated_at, l.event_id), '[]'::jsonb), max(l.evaluated_at) INTO v_recs, v_newest FROM l;
  SELECT count(*) INTO v_human FROM products.product_events e WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain AND e.event = 'product.degraded' AND e.occurred_at >= p_from AND e.occurred_at < p_to AND e.occurred_at <= p_as_of;
  RETURN analytics.mcb_finish(jsonb_build_object('kind', 'duration', 'records', v_recs, 'reasons', '[]'::jsonb,
    'quality', jsonb_build_object('clock', 'record', 'unit', 'seconds', 'products_degraded_by_a_person', v_human,
      'scope_rule', CASE WHEN p_scope IS NULL THEN 'the domain' ELSE 'the sources feeding the scope''s series or entities' END,
      'notes', jsonb_build_array('the user-visible instant is the impact marker''s set_at; accurate = every dependent the condition marked shows it (the latest marker)',
                                 'a product degraded by a person''s act has no recorded qualifying condition: counted, not measured'))), 'role', v_newest);
END $$;
REVOKE ALL ON FUNCTION analytics.mc_met037_degraded_declaration_latency(uuid,uuid,timestamptz,timestamptz,timestamptz,jsonb,jsonb,jsonb) FROM PUBLIC;
SELECT analytics.register_computation('met037_degraded_declaration_latency', 'analytics.mc_met037_degraded_declaration_latency', 'duration', ARRAY[]::text[],
  ARRAY['observation.source_health_events', 'observation.source_impact_markers', 'products.product_events', 'prediction.series_registry', 'observation.source_contracts_current'],
  'a source concerns the scope when it feeds a series of the scope''s series_keys or of an entity in its entity_ids; a NULL scope is the domain',
  'MET-037: seconds from a qualifying condition (a coverage loss) to the last impact marker it set on dependent products (the user-visible state)', '0113 §MCB');
