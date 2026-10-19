-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0121 §GM — CP-6 B82, part `gm`: THE GRAPH AND MAP CANVASES (F-P7-E-21: CMP-063, CMP-064, VIZ-13…21, VIZ-31, UX-ADR-016) and the sticky
-- region boundaries (F-P7-E-04: UX-19-003, web only) — THE GOVERNED GEOGRAPHIC-REFERENCE REGISTER the map canvas draws (DESIGN D4, Q4).
--
-- NO GEOGRAPHY EXISTS on any database before this file (no latitude / longitude, no GeoJSON, no geometry column; places are names and keys
-- only — the PortWatch chokepoint keys, the B33 route `via` lists). A map therefore draws ONLY what a NAMED DATA STEWARD has typed here:
--   graph.geo_references        one row per VERSION of a reference (append-only): a point (a chokepoint, a port, a site), a line (a route)
--                               or a polygon (an area) as GeoJSON VALIDATED IN SQL (graph.geo_geometry_problem), the CRS fixed EPSG:4326
--                               (longitude, latitude in degrees — WGS 84), the declared positional uncertainty in metres, the SOURCE and
--                               LICENCE statements the steward typed, the linked graph entity (an object of the domain) and the PortWatch
--                               chokepoint key; a revision is the next version, a RETIREMENT is the next version in state `retired` —
--                               nothing is erased, every version keeps who typed it and why.
--   graph.geo_reference_events  the ledger (declared | revised | retired), append-only.
--   graph.declare_geo_reference / graph.retire_geo_reference   the two human-gated PORTS (graph.geo.declare / graph.geo.retire):
--                               the bound action, the domain scope, the acting principal = public.eye_principal(), a NAMED ACTIVE HUMAN
--                               holding data_steward (governance.assert_approver — an agent never declares or retires a reference), the
--                               request id a retry reuses (the recorded answer, `replayed`), the version read (stale refused).
--   graph.geo_layer(p_tenant, p_domain, p_scope jsonb)   the READ the canvases draw (STABLE, SECURITY DEFINER, read scope asserted):
--                               the current version of each reference, its history on request, the bounds, the counts and the statement
--                               of what the map is NOT (no basemap, no tiles, no coastline, no boundary dataset, no network).
--
-- NO TILES, NO NETWORK, NO BASEMAP (D4): nothing here fetches, imports or vendors a coastline or a boundary dataset — that is the owner's
-- decision through the supply-chain controls' own amendment. Until then the CHOROPLETH is a SYNTHETIC catalogue specimen (D13); a polygon
-- typed here is a declared area, never an administrative boundary.
--
-- Refusal noun `geographic reference` in the CLASS form `geographic reference rejected (<class>): …` — 403 actor|authority ·
-- 404 unknown_reference|unknown_linked · 409 stale|state|duplicate · 422 the rest (crs, geometry, key, label, kind, statements, uncertainty,
-- reason, request, layer_scope). The integrator maps the noun centrally (observation-errors.ts); until then the route maps it locally
-- (apps/api/src/graph/geo/geo.service.ts asGeoRefusal).
--
-- Applies ALONE on 0001–0120 + the prelude (0121 §0). Re-declares nothing of an earlier migration. No permission is added to any role
-- (D9): the PDP rows graph.geo.read / .declare / .retire are this part's own actions (the `/* B82 gm */` block of pdp.service.ts).
--
-- THREE CLAIMS, never mixed: CONSTRUCTION (this file and phase6-geography-b82 — every reference there SYNTHETIC); DEMONSTRATED OPERATION
-- (the act: F. Aydın types the corridor's references — SYNTHETIC persona, the coordinates hers); REAL ACCEPTANCE — never claimed.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- §GM.1 THE CONSTANTS AND THE GEOMETRY CHECK (IMMUTABLE; mirrored by apps/web/lib/canvas-b82.ts geometryProblem) ───────────────────────────
CREATE OR REPLACE FUNCTION graph.geo_rule_version() RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT 'b82-gm-geo-1' $$;
CREATE OR REPLACE FUNCTION graph.geo_kinds() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY['chokepoint', 'port', 'site', 'route', 'area'] $$;
/* Which geometry each kind carries: a place is a point, a route a line, an area a polygon. */
CREATE OR REPLACE FUNCTION graph.geo_kind_geometry(p_kind text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_kind WHEN 'chokepoint' THEN 'Point' WHEN 'port' THEN 'Point' WHEN 'site' THEN 'Point' WHEN 'route' THEN 'LineString' WHEN 'area' THEN 'Polygon' END
$$;
GRANT EXECUTE ON FUNCTION graph.geo_rule_version(), graph.geo_kinds(), graph.geo_kind_geometry(text) TO eye_app, eye_commit;

/* One GeoJSON position: [longitude, latitude], two finite numbers, longitude in [-180, 180], latitude in [-90, 90] (EPSG:4326 axis order as
   GeoJSON writes it). NULL = valid; otherwise the problem in words. */
CREATE OR REPLACE FUNCTION graph.geo_position_problem(p jsonb, p_where text) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
DECLARE v_lon numeric; v_lat numeric;
BEGIN
  IF p IS NULL OR jsonb_typeof(p) <> 'array' OR jsonb_array_length(p) <> 2 OR jsonb_typeof(p -> 0) <> 'number' OR jsonb_typeof(p -> 1) <> 'number' THEN
    RETURN p_where || ' is not a position [longitude, latitude] of two numbers';
  END IF;
  v_lon := (p ->> 0)::numeric; v_lat := (p ->> 1)::numeric;
  IF v_lon < -180 OR v_lon > 180 THEN RETURN p_where || ' has longitude ' || v_lon::text || ', outside -180 to 180 degrees'; END IF;
  IF v_lat < -90 OR v_lat > 90 THEN RETURN p_where || ' has latitude ' || v_lat::text || ', outside -90 to 90 degrees (positions are [longitude, latitude])'; END IF;
  RETURN NULL;
END $$;

/* A GeoJSON geometry of the three admitted types, validated whole: Point (one position); LineString (2–1000 positions, not all the same);
   Polygon (1–20 linear rings, each 4–1000 positions, closed — the last position equals the first). Nothing else (no Multi*, no
   GeometryCollection, no `crs` member — the CRS is the register's, fixed). NULL = valid. */
CREATE OR REPLACE FUNCTION graph.geo_geometry_problem(p jsonb) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path = graph, pg_catalog, pg_temp AS $$
DECLARE v_type text; c jsonb; v_problem text; i int; j int; ring jsonb; v_keys text[];
BEGIN
  IF p IS NULL OR jsonb_typeof(p) <> 'object' THEN RETURN 'the geometry is a GeoJSON object {type, coordinates}'; END IF;
  SELECT array_agg(k ORDER BY k) INTO v_keys FROM jsonb_object_keys(p) k;
  IF v_keys IS DISTINCT FROM ARRAY['coordinates', 'type'] THEN
    RETURN 'the geometry carries exactly type and coordinates (the CRS is the register''s, EPSG:4326 — never a member of the geometry)';
  END IF;
  v_type := p ->> 'type'; c := p -> 'coordinates';
  IF v_type = 'Point' THEN
    RETURN graph.geo_position_problem(c, 'the point');
  ELSIF v_type = 'LineString' THEN
    IF jsonb_typeof(c) <> 'array' OR jsonb_array_length(c) < 2 OR jsonb_array_length(c) > 1000 THEN RETURN 'a line has 2 to 1000 positions'; END IF;
    FOR i IN 0 .. jsonb_array_length(c) - 1 LOOP
      v_problem := graph.geo_position_problem(c -> i, 'position ' || (i + 1)::text || ' of the line');
      IF v_problem IS NOT NULL THEN RETURN v_problem; END IF;
    END LOOP;
    IF (SELECT count(DISTINCT e) FROM jsonb_array_elements(c) e) < 2 THEN RETURN 'a line joins at least two different positions'; END IF;
    RETURN NULL;
  ELSIF v_type = 'Polygon' THEN
    IF jsonb_typeof(c) <> 'array' OR jsonb_array_length(c) < 1 OR jsonb_array_length(c) > 20 THEN RETURN 'a polygon has 1 to 20 rings'; END IF;
    FOR i IN 0 .. jsonb_array_length(c) - 1 LOOP
      ring := c -> i;
      IF jsonb_typeof(ring) <> 'array' OR jsonb_array_length(ring) < 4 OR jsonb_array_length(ring) > 1000 THEN RETURN 'ring ' || (i + 1)::text || ' of the polygon has 4 to 1000 positions'; END IF;
      FOR j IN 0 .. jsonb_array_length(ring) - 1 LOOP
        v_problem := graph.geo_position_problem(ring -> j, 'position ' || (j + 1)::text || ' of ring ' || (i + 1)::text);
        IF v_problem IS NOT NULL THEN RETURN v_problem; END IF;
      END LOOP;
      IF (ring -> 0) <> (ring -> (jsonb_array_length(ring) - 1)) THEN RETURN 'ring ' || (i + 1)::text || ' of the polygon is not closed (its last position repeats its first)'; END IF;
      IF (SELECT count(DISTINCT e) FROM jsonb_array_elements(ring) e) < 3 THEN RETURN 'ring ' || (i + 1)::text || ' of the polygon encloses no area (fewer than three different positions)'; END IF;
    END LOOP;
    RETURN NULL;
  END IF;
  RETURN 'the geometry type ' || coalesce(v_type, '<none>') || ' is not admitted (Point, LineString or Polygon)';
END $$;
GRANT EXECUTE ON FUNCTION graph.geo_position_problem(jsonb, text), graph.geo_geometry_problem(jsonb) TO eye_app, eye_commit;

/* Every position of a geometry, flattened (for the bounds). */
CREATE OR REPLACE FUNCTION graph.geo_positions(p jsonb) RETURNS TABLE (lon numeric, lat numeric)
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  -- the casts are guarded (an inlined call over a constant may evaluate the list before the filter)
  SELECT CASE WHEN p ->> 'type' = 'Point' THEN (p #>> '{coordinates,0}')::numeric END, CASE WHEN p ->> 'type' = 'Point' THEN (p #>> '{coordinates,1}')::numeric END
   WHERE p ->> 'type' = 'Point'
  UNION ALL
  SELECT (e ->> 0)::numeric, (e ->> 1)::numeric FROM jsonb_array_elements(CASE WHEN p ->> 'type' = 'LineString' THEN p -> 'coordinates' ELSE '[]'::jsonb END) e
  UNION ALL
  SELECT (e ->> 0)::numeric, (e ->> 1)::numeric FROM jsonb_array_elements(CASE WHEN p ->> 'type' = 'Polygon' THEN p -> 'coordinates' ELSE '[]'::jsonb END) r, jsonb_array_elements(r) e
$$;
GRANT EXECUTE ON FUNCTION graph.geo_positions(jsonb) TO eye_app, eye_commit;

-- §GM.2 THE TABLES ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE graph.geo_references (
  reference_id        uuid NOT NULL,
  version             int  NOT NULL CHECK (version >= 1),
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  reference_key       text NOT NULL CHECK (reference_key ~ '^[a-z0-9][a-z0-9._:-]{1,79}$'),
  label               text NOT NULL CHECK (length(btrim(label)) BETWEEN 2 AND 200),
  feature_kind        text NOT NULL CHECK (feature_kind = ANY (graph.geo_kinds())),
  geometry            jsonb NOT NULL CHECK (graph.geo_geometry_problem(geometry) IS NULL),
  crs                 text NOT NULL CHECK (crs = 'EPSG:4326'),
  uncertainty_m       numeric NOT NULL CHECK (uncertainty_m >= 0 AND uncertainty_m <= 2000000),
  source_statement    text NOT NULL CHECK (length(btrim(source_statement)) BETWEEN 8 AND 1000),
  licence_statement   text NOT NULL CHECK (length(btrim(licence_statement)) BETWEEN 8 AND 1000),
  linked_type         text CHECK (linked_type IS NULL OR linked_type ~ '^[A-Z]{3}$'),
  linked_id           uuid,
  chokepoint_key      text CHECK (chokepoint_key IS NULL OR chokepoint_key ~ '^[a-z0-9][a-z0-9._:-]{1,79}$'),
  state               text NOT NULL CHECK (state IN ('active', 'retired')),
  reason              text NOT NULL CHECK (length(btrim(reason)) BETWEEN 8 AND 2000),
  supersedes          int,
  declared_by         uuid NOT NULL,
  declared_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  request_id          uuid NOT NULL UNIQUE,
  correlation_id      uuid NOT NULL,
  PRIMARY KEY (reference_id, version),
  CONSTRAINT ggr_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT ggr_kind_geometry CHECK (geometry ->> 'type' = graph.geo_kind_geometry(feature_kind)),
  CONSTRAINT ggr_linked CHECK ((linked_type IS NULL) = (linked_id IS NULL)),
  CONSTRAINT ggr_supersedes CHECK ((version = 1 AND supersedes IS NULL) OR (version > 1 AND supersedes = version - 1)),
  CONSTRAINT ggr_retired_last CHECK (state = 'active' OR version > 1)
);
COMMENT ON TABLE graph.geo_references IS 'B82 §GM (CMP-064, VIZ-16/18; DESIGN D4): the governed geographic references a map draws — a point, line or polygon in EPSG:4326 typed by a named data steward with its positional uncertainty and its source and licence statements, linked to a graph object and a chokepoint key; one row per version (a revision the next version, a retirement the next version in state retired); append-only. No basemap, no tiles, no imported dataset.';
CREATE INDEX ggr_domain ON graph.geo_references (tenant_id, domain_id, reference_key, version DESC);
CREATE INDEX ggr_reference ON graph.geo_references (reference_id, version DESC);
CREATE TRIGGER ggr_append_only BEFORE UPDATE OR DELETE ON graph.geo_references FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

CREATE TABLE graph.geo_reference_events (
  event_id            uuid PRIMARY KEY,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  reference_id        uuid NOT NULL,
  version             int  NOT NULL,
  event               text NOT NULL CHECK (event IN ('geo.declared', 'geo.revised', 'geo.retired')),
  actor_principal_id  uuid NOT NULL,
  details             jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
  occurred_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id      uuid NOT NULL,
  FOREIGN KEY (reference_id, version) REFERENCES graph.geo_references (reference_id, version),
  CONSTRAINT ggre_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX ggre_reference ON graph.geo_reference_events (reference_id, occurred_at);
CREATE TRIGGER ggre_append_only BEFORE UPDATE OR DELETE ON graph.geo_reference_events FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

/* RLS (the 0120 graph idiom): within the bound tenant, and the bound domain for a DOMAIN context. SELECT only; the ports write. */
REVOKE ALL ON graph.geo_references, graph.geo_reference_events FROM PUBLIC;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['geo_references', 'geo_reference_events'] LOOP
    EXECUTE format('ALTER TABLE graph.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE graph.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY graph_isolation ON graph.%I
        USING (
          tenant_id = public.eye_tenant()
          AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain())
        )$f$, t);
    EXECUTE format('GRANT SELECT ON graph.%I TO eye_app, eye_commit', t);
  END LOOP;
END $$;

-- §GM.3 THE ROW AS THE SEAM STATES IT (GeoReferenceRow, apps/api/src/graph/b82-seams.ts) ──────────────────────────────────────────────────
/* `retired_by` / `retired_at` are the retiring version's declarer and instant (a retirement is a version). */
CREATE OR REPLACE FUNCTION graph.geo_row(r graph.geo_references) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = graph, pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object(
    'reference_id', r.reference_id, 'version', r.version, 'key', r.reference_key, 'label', r.label, 'kind', r.feature_kind,
    'geometry', r.geometry, 'crs', r.crs, 'uncertainty_m', r.uncertainty_m,
    'source_statement', r.source_statement, 'licence_statement', r.licence_statement,
    'linked', CASE WHEN r.linked_id IS NULL THEN NULL ELSE jsonb_build_object('type', r.linked_type, 'id', r.linked_id) END,
    'chokepoint_key', r.chokepoint_key,
    'declared_by', r.declared_by, 'declared_at', graph.pv_iso(r.declared_at), 'state', r.state, 'reason', r.reason, 'supersedes', r.supersedes,
    'retired_by', CASE WHEN r.state = 'retired' THEN r.declared_by END, 'retired_at', CASE WHEN r.state = 'retired' THEN graph.pv_iso(r.declared_at) END)
$$;
REVOKE ALL ON FUNCTION graph.geo_row(graph.geo_references) FROM PUBLIC;

-- §GM.4 THE PORTS (human-gated; graph.geo.declare / graph.geo.retire) ──────────────────────────────────────────────────────────────────────
/* The acting person: the bound principal, named by the route, a NAMED ACTIVE HUMAN holding data_steward in this domain (re-checked here —
   the PDP's human gate is not trusted alone). */
CREATE OR REPLACE FUNCTION graph.geo_actor(p_actor uuid, p_tenant uuid, p_domain uuid, p_what text) RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = graph, governance, onboarding, pg_catalog, pg_temp AS $$
DECLARE v uuid := public.eye_principal();
BEGIN
  IF v IS NULL OR p_actor IS DISTINCT FROM v THEN
    RAISE EXCEPTION 'geographic reference rejected (actor): the act is recorded under the acting principal, never on behalf of another' USING ERRCODE = '42501';
  END IF;
  PERFORM governance.assert_approver('geographic reference', v, p_tenant, p_domain, ARRAY['data_steward'], NULL, NULL, p_what);
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION graph.geo_actor(uuid, uuid, uuid, text) FROM PUBLIC;

/* The current (latest) version of a reference of this domain, or NULL. */
CREATE OR REPLACE FUNCTION graph.geo_current(p_tenant uuid, p_domain uuid, p_reference uuid) RETURNS graph.geo_references
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = graph, pg_catalog, pg_temp AS $$
  SELECT r.* FROM graph.geo_references r WHERE r.reference_id = p_reference AND r.tenant_id = p_tenant AND r.domain_id = p_domain ORDER BY r.version DESC LIMIT 1
$$;
REVOKE ALL ON FUNCTION graph.geo_current(uuid, uuid, uuid) FROM PUBLIC;

/* DECLARE a reference (p_reference NULL, p_expected_version 0) or REVISE one (its id and the version read): the key, the label, the kind and
   its geometry, the CRS (EPSG:4326 only — another is refused, never converted), the positional uncertainty, the source and licence
   statements, the linked graph object (recorded in this domain) and the chokepoint key, the reason. The key is unique among the domain's
   ACTIVE references. A request id replayed by the same steward answers the recorded version (`replayed`); by another person or for another
   reference it is refused (duplicate). A retired reference is not revised (state) — a new reference is declared. */
CREATE OR REPLACE FUNCTION graph.declare_geo_reference(p_request_id uuid, p_tenant uuid, p_domain uuid, p_reference uuid, p_expected_version int,
    p_key text, p_label text, p_kind text, p_geometry jsonb, p_crs text, p_uncertainty_m numeric, p_source_statement text, p_licence_statement text,
    p_linked_type text, p_linked_id uuid, p_chokepoint_key text, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = graph, objects, observation, governance, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid; r graph.geo_references%ROWTYPE; prev graph.geo_references%ROWTYPE; v_problem text; v_id uuid; v_version int;
        v_key text := lower(btrim(coalesce(p_key, ''))); v_cp text := NULLIF(lower(btrim(coalesce(p_chokepoint_key, ''))), '');
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.geo.declare']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  v_actor := graph.geo_actor(p_actor, p_tenant, p_domain, 'declaring or revising a geographic reference');
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'geographic reference rejected (request): a declaration carries its request id (the command identity a retry reuses)' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO r FROM graph.geo_references g WHERE g.request_id = p_request_id;
  IF FOUND THEN
    IF r.declared_by IS DISTINCT FROM v_actor OR r.tenant_id IS DISTINCT FROM p_tenant OR r.domain_id IS DISTINCT FROM p_domain OR r.reference_key IS DISTINCT FROM v_key
       OR (p_reference IS NOT NULL AND r.reference_id IS DISTINCT FROM p_reference) OR r.state <> 'active' THEN
      RAISE EXCEPTION 'geographic reference rejected (duplicate): request % already recorded another act; a new declaration takes a new request id', p_request_id USING ERRCODE = '23505';
    END IF;
    RETURN graph.geo_row(r) || jsonb_build_object('replayed', true);
  END IF;
  IF v_key !~ '^[a-z0-9][a-z0-9._:-]{1,79}$' THEN
    RAISE EXCEPTION 'geographic reference rejected (key): the key is 2–80 lower-case letters, digits, dots, colons, underscores or hyphens (e.g. chokepoint.bab-el-mandeb)' USING ERRCODE = '22023';
  END IF;
  IF p_label IS NULL OR length(btrim(p_label)) < 2 OR length(btrim(p_label)) > 200 THEN
    RAISE EXCEPTION 'geographic reference rejected (label): the label a reader sees is 2 to 200 characters' USING ERRCODE = '22023';
  END IF;
  IF p_kind IS NULL OR NOT (p_kind = ANY (graph.geo_kinds())) THEN
    RAISE EXCEPTION 'geographic reference rejected (kind): the kind is one of %', array_to_string(graph.geo_kinds(), ', ') USING ERRCODE = '22023';
  END IF;
  IF p_crs IS DISTINCT FROM 'EPSG:4326' THEN
    RAISE EXCEPTION 'geographic reference rejected (crs): the register holds EPSG:4326 (WGS 84, [longitude, latitude] in degrees) only; % is not converted here — type the position in EPSG:4326', coalesce(p_crs, '<none>') USING ERRCODE = '22023';
  END IF;
  v_problem := graph.geo_geometry_problem(p_geometry);
  IF v_problem IS NOT NULL THEN RAISE EXCEPTION 'geographic reference rejected (geometry): %', v_problem USING ERRCODE = '22023'; END IF;
  IF p_geometry ->> 'type' IS DISTINCT FROM graph.geo_kind_geometry(p_kind) THEN
    RAISE EXCEPTION 'geographic reference rejected (geometry): a % is drawn as a %, not a %', p_kind, graph.geo_kind_geometry(p_kind), p_geometry ->> 'type' USING ERRCODE = '22023';
  END IF;
  IF p_uncertainty_m IS NULL OR p_uncertainty_m < 0 OR p_uncertainty_m > 2000000 THEN
    RAISE EXCEPTION 'geographic reference rejected (uncertainty): the positional uncertainty is stated in metres (0 to 2,000,000) — how far the true place may be from the typed one' USING ERRCODE = '22023';
  END IF;
  IF p_source_statement IS NULL OR length(btrim(p_source_statement)) < 8 OR length(btrim(p_source_statement)) > 1000 THEN
    RAISE EXCEPTION 'geographic reference rejected (source): the source statement says where the position comes from, in 8 to 1000 characters' USING ERRCODE = '22023';
  END IF;
  IF p_licence_statement IS NULL OR length(btrim(p_licence_statement)) < 8 OR length(btrim(p_licence_statement)) > 1000 THEN
    RAISE EXCEPTION 'geographic reference rejected (licence): the licence statement says under what terms the position may be used, in 8 to 1000 characters' USING ERRCODE = '22023';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 OR length(btrim(p_reason)) > 2000 THEN
    RAISE EXCEPTION 'geographic reference rejected (reason): a reason of 8 to 2000 characters says why the reference is declared or revised' USING ERRCODE = '22023';
  END IF;
  IF v_cp IS NOT NULL AND v_cp !~ '^[a-z0-9][a-z0-9._:-]{1,79}$' THEN
    RAISE EXCEPTION 'geographic reference rejected (chokepoint): the chokepoint key is 2–80 lower-case letters, digits, dots, colons, underscores or hyphens (e.g. portwatch:chokepoint4)' USING ERRCODE = '22023';
  END IF;
  IF (p_linked_type IS NULL) <> (p_linked_id IS NULL) OR (p_linked_type IS NOT NULL AND p_linked_type !~ '^[A-Z]{3}$') THEN
    RAISE EXCEPTION 'geographic reference rejected (linked): a linked object is named by its type (three capitals) and its id together' USING ERRCODE = '22023';
  END IF;
  IF p_linked_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM objects.canonical_objects o WHERE o.object_id = p_linked_id AND o.object_type = p_linked_type
                                                AND o.tenant_id = p_tenant AND (o.domain_id = p_domain OR o.domain_id IS NULL)) THEN
    RAISE EXCEPTION 'geographic reference rejected (unknown_linked): no % % is recorded in this domain', p_linked_type, p_linked_id USING ERRCODE = '23503';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('graph.geo:' || p_tenant::text || ':' || p_domain::text || ':' || coalesce(p_reference::text, v_key), 0));
  IF p_reference IS NULL THEN
    IF coalesce(p_expected_version, -1) <> 0 THEN
      RAISE EXCEPTION 'geographic reference rejected (stale): a new reference is declared from version 0; this declaration read %', coalesce(p_expected_version::text, 'no version') USING ERRCODE = '23514';
    END IF;
    v_id := gen_random_uuid(); v_version := 1;
  ELSE
    prev := graph.geo_current(p_tenant, p_domain, p_reference);
    IF prev.reference_id IS NULL THEN
      RAISE EXCEPTION 'geographic reference rejected (unknown_reference): no reference % in this domain', p_reference USING ERRCODE = '23503';
    END IF;
    IF prev.state = 'retired' THEN
      RAISE EXCEPTION 'geographic reference rejected (state): % was retired at version %; a retired reference is not revised — declare a new one', prev.reference_key, prev.version USING ERRCODE = '23514';
    END IF;
    IF coalesce(p_expected_version, -1) <> prev.version THEN
      RAISE EXCEPTION 'geographic reference rejected (stale): % is at version %; this revision read %', prev.reference_key, prev.version, coalesce(p_expected_version::text, 'no version') USING ERRCODE = '23514';
    END IF;
    v_id := prev.reference_id; v_version := prev.version + 1;
  END IF;
  -- one ACTIVE reference per key in the domain (another reference holding it refuses; the same reference keeps or changes its own)
  PERFORM pg_advisory_xact_lock(hashtextextended('graph.geo.key:' || p_tenant::text || ':' || p_domain::text || ':' || v_key, 0));
  IF EXISTS (SELECT 1 FROM graph.geo_references g
              WHERE g.tenant_id = p_tenant AND g.domain_id = p_domain AND g.reference_key = v_key AND g.reference_id <> v_id
                AND g.state = 'active' AND g.version = (SELECT max(x.version) FROM graph.geo_references x WHERE x.reference_id = g.reference_id)) THEN
    RAISE EXCEPTION 'geographic reference rejected (duplicate): the key % is held by another active reference of this domain; revise that one or retire it first', v_key USING ERRCODE = '23505';
  END IF;
  INSERT INTO graph.geo_references (reference_id, version, scope, tenant_id, domain_id, reference_key, label, feature_kind, geometry, crs, uncertainty_m,
                                    source_statement, licence_statement, linked_type, linked_id, chokepoint_key, state, reason, supersedes, declared_by, request_id, correlation_id)
  VALUES (v_id, v_version, 'DOMAIN', p_tenant, p_domain, v_key, btrim(p_label), p_kind, p_geometry, 'EPSG:4326', p_uncertainty_m,
          btrim(p_source_statement), btrim(p_licence_statement), p_linked_type, p_linked_id, v_cp, 'active', btrim(p_reason),
          CASE WHEN v_version > 1 THEN v_version - 1 END, v_actor, p_request_id, p_correlation)
  RETURNING * INTO r;
  INSERT INTO graph.geo_reference_events (event_id, scope, tenant_id, domain_id, reference_id, version, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, v_id, v_version, CASE WHEN v_version = 1 THEN 'geo.declared' ELSE 'geo.revised' END, v_actor,
          jsonb_build_object('key', v_key, 'kind', p_kind, 'geometry_type', p_geometry ->> 'type', 'chokepoint_key', v_cp, 'supersedes', r.supersedes), p_correlation);
  RETURN graph.geo_row(r) || jsonb_build_object('replayed', false);
END $$;
REVOKE ALL ON FUNCTION graph.declare_geo_reference(uuid, uuid, uuid, uuid, int, text, text, text, jsonb, text, numeric, text, text, text, uuid, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.declare_geo_reference(uuid, uuid, uuid, uuid, int, text, text, text, jsonb, text, numeric, text, text, text, uuid, text, text, uuid, uuid) TO eye_commit;

/* RETIRE a reference at the version read: the next version, in state `retired`, keeping the geometry and statements it retires (the history
   reads what was drawn until then); the reason says why (a mistyped point, a closed site). A retired reference is drawn no more and its key
   is free for a new reference. A replayed request id answers the recorded retirement. Not undone — a new reference is declared instead. */
CREATE OR REPLACE FUNCTION graph.retire_geo_reference(p_request_id uuid, p_tenant uuid, p_domain uuid, p_reference uuid, p_expected_version int, p_reason text,
    p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = graph, observation, governance, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid; r graph.geo_references%ROWTYPE; prev graph.geo_references%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.geo.retire']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  v_actor := graph.geo_actor(p_actor, p_tenant, p_domain, 'retiring a geographic reference');
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'geographic reference rejected (request): a retirement carries its request id (the command identity a retry reuses)' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO r FROM graph.geo_references g WHERE g.request_id = p_request_id;
  IF FOUND THEN
    IF r.declared_by IS DISTINCT FROM v_actor OR r.reference_id IS DISTINCT FROM p_reference OR r.state <> 'retired' THEN
      RAISE EXCEPTION 'geographic reference rejected (duplicate): request % already recorded another act; a new retirement takes a new request id', p_request_id USING ERRCODE = '23505';
    END IF;
    RETURN graph.geo_row(r) || jsonb_build_object('replayed', true);
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 OR length(btrim(p_reason)) > 2000 THEN
    RAISE EXCEPTION 'geographic reference rejected (reason): a retirement states its reason in 8 to 2000 characters (what was wrong, what replaces it)' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('graph.geo:' || p_tenant::text || ':' || p_domain::text || ':' || coalesce(p_reference::text, '-'), 0));
  prev := graph.geo_current(p_tenant, p_domain, p_reference);
  IF prev.reference_id IS NULL THEN
    RAISE EXCEPTION 'geographic reference rejected (unknown_reference): no reference % in this domain', coalesce(p_reference::text, '<none>') USING ERRCODE = '23503';
  END IF;
  IF prev.state = 'retired' THEN
    RAISE EXCEPTION 'geographic reference rejected (state): % is already retired (version %)', prev.reference_key, prev.version USING ERRCODE = '23514';
  END IF;
  IF coalesce(p_expected_version, -1) <> prev.version THEN
    RAISE EXCEPTION 'geographic reference rejected (stale): % is at version %; this retirement read %', prev.reference_key, prev.version, coalesce(p_expected_version::text, 'no version') USING ERRCODE = '23514';
  END IF;
  INSERT INTO graph.geo_references (reference_id, version, scope, tenant_id, domain_id, reference_key, label, feature_kind, geometry, crs, uncertainty_m,
                                    source_statement, licence_statement, linked_type, linked_id, chokepoint_key, state, reason, supersedes, declared_by, request_id, correlation_id)
  VALUES (prev.reference_id, prev.version + 1, 'DOMAIN', p_tenant, p_domain, prev.reference_key, prev.label, prev.feature_kind, prev.geometry, prev.crs, prev.uncertainty_m,
          prev.source_statement, prev.licence_statement, prev.linked_type, prev.linked_id, prev.chokepoint_key, 'retired', btrim(p_reason), prev.version, v_actor, p_request_id, p_correlation)
  RETURNING * INTO r;
  INSERT INTO graph.geo_reference_events (event_id, scope, tenant_id, domain_id, reference_id, version, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, r.reference_id, r.version, 'geo.retired', v_actor,
          jsonb_build_object('key', r.reference_key, 'retired_version', prev.version), p_correlation);
  RETURN graph.geo_row(r) || jsonb_build_object('replayed', false);
END $$;
REVOKE ALL ON FUNCTION graph.retire_geo_reference(uuid, uuid, uuid, uuid, int, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.retire_geo_reference(uuid, uuid, uuid, uuid, int, text, uuid, uuid) TO eye_commit;

-- §GM.5 THE READ (graph.geo.read at the route) ────────────────────────────────────────────────────────────────────────────────────────────
/* THE LAYER the canvases draw. p_scope (an object; every member optional): `keys` (reference keys), `kinds` (feature kinds),
   `reference_id` (one reference — its HISTORY is returned too), `include_retired` (a retired reference's last version is listed, marked).
   The answer: the CRS, the current version of each matching reference (ordered by kind then key), the history on request, the bounds
   [west, south, east, north] of what is returned (null when nothing is), the counts, the rule version, the as-of instant, and the
   statement of what the map is NOT. STABLE, SECURITY DEFINER, the caller's scope asserted first. */
CREATE OR REPLACE FUNCTION graph.geo_layer(p_tenant uuid, p_domain uuid, p_scope jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = graph, observation, pg_catalog, pg_temp AS $$
DECLARE v_scope jsonb := coalesce(p_scope, '{}'::jsonb); v_keys text[]; v_kinds text[]; v_ref uuid; v_retired boolean; v_refs jsonb; v_hist jsonb; v_bounds jsonb; v_counts jsonb;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the geographic reference layer');
  IF jsonb_typeof(v_scope) <> 'object' OR EXISTS (SELECT 1 FROM jsonb_object_keys(v_scope) k WHERE k NOT IN ('keys', 'kinds', 'reference_id', 'include_retired')) THEN
    RAISE EXCEPTION 'geographic reference rejected (layer_scope): a layer is asked by keys, kinds, reference_id and include_retired only' USING ERRCODE = '22023';
  END IF;
  IF v_scope ? 'keys' THEN
    IF jsonb_typeof(v_scope -> 'keys') <> 'array' OR jsonb_array_length(v_scope -> 'keys') > 200 OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_scope -> 'keys') e WHERE jsonb_typeof(e) <> 'string') THEN
      RAISE EXCEPTION 'geographic reference rejected (layer_scope): keys is a list of at most 200 reference keys' USING ERRCODE = '22023';
    END IF;
    SELECT array_agg(lower(e #>> '{}')) INTO v_keys FROM jsonb_array_elements(v_scope -> 'keys') e;
  END IF;
  IF v_scope ? 'kinds' THEN
    IF jsonb_typeof(v_scope -> 'kinds') <> 'array' OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_scope -> 'kinds') e WHERE jsonb_typeof(e) <> 'string' OR NOT ((e #>> '{}') = ANY (graph.geo_kinds()))) THEN
      RAISE EXCEPTION 'geographic reference rejected (layer_scope): kinds is a list of %', array_to_string(graph.geo_kinds(), ', ') USING ERRCODE = '22023';
    END IF;
    SELECT array_agg(e #>> '{}') INTO v_kinds FROM jsonb_array_elements(v_scope -> 'kinds') e;
  END IF;
  IF v_scope ? 'reference_id' THEN
    IF jsonb_typeof(v_scope -> 'reference_id') <> 'string' OR (v_scope ->> 'reference_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'geographic reference rejected (layer_scope): reference_id is the id of one reference' USING ERRCODE = '22023';
    END IF;
    v_ref := (v_scope ->> 'reference_id')::uuid;
    IF NOT EXISTS (SELECT 1 FROM graph.geo_references g WHERE g.reference_id = v_ref AND g.tenant_id = p_tenant AND g.domain_id = p_domain) THEN
      RAISE EXCEPTION 'geographic reference rejected (unknown_reference): no reference % in this domain', v_ref USING ERRCODE = '23503';
    END IF;
  END IF;
  IF v_scope ? 'include_retired' AND jsonb_typeof(v_scope -> 'include_retired') <> 'boolean' THEN
    RAISE EXCEPTION 'geographic reference rejected (layer_scope): include_retired is true or false' USING ERRCODE = '22023';
  END IF;
  v_retired := coalesce((v_scope ->> 'include_retired')::boolean, false) OR v_ref IS NOT NULL;
  WITH cur AS (
    SELECT DISTINCT ON (g.reference_id) g.* FROM graph.geo_references g
     WHERE g.tenant_id = p_tenant AND g.domain_id = p_domain
     ORDER BY g.reference_id, g.version DESC
  ), sel AS (
    SELECT c.* FROM cur c
     WHERE (v_retired OR c.state = 'active')
       AND (v_keys IS NULL OR c.reference_key = ANY (v_keys))
       AND (v_kinds IS NULL OR c.feature_kind = ANY (v_kinds))
       AND (v_ref IS NULL OR c.reference_id = v_ref)
  )
  SELECT coalesce(jsonb_agg(graph.geo_row(s) ORDER BY array_position(graph.geo_kinds(), s.feature_kind), s.reference_key), '[]'::jsonb),
         (SELECT CASE WHEN count(*) = 0 THEN NULL ELSE jsonb_build_array(min(p.lon), min(p.lat), max(p.lon), max(p.lat)) END
            FROM sel s2, LATERAL graph.geo_positions(s2.geometry) p),
         jsonb_build_object('returned', count(*), 'active', count(*) FILTER (WHERE s.state = 'active'), 'retired', count(*) FILTER (WHERE s.state = 'retired'))
    INTO v_refs, v_bounds, v_counts
    FROM sel s;
  IF v_ref IS NOT NULL THEN
    SELECT coalesce(jsonb_agg(graph.geo_row(g) ORDER BY g.version), '[]'::jsonb) INTO v_hist FROM graph.geo_references g
     WHERE g.reference_id = v_ref AND g.tenant_id = p_tenant AND g.domain_id = p_domain;
  END IF;
  RETURN jsonb_build_object(
    'crs', 'EPSG:4326', 'references', v_refs, 'history', v_hist, 'bounds', v_bounds, 'counts', v_counts,
    'rule_version', graph.geo_rule_version(), 'as_of', graph.pv_iso(clock_timestamp()),
    'statement', 'Declared references only: each position typed by a named data steward in EPSG:4326 with its source, licence and positional uncertainty. No basemap, no tiles, no coastline or boundary dataset, no network.');
END $$;
REVOKE ALL ON FUNCTION graph.geo_layer(uuid, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.geo_layer(uuid, uuid, jsonb) TO eye_app, eye_commit;
