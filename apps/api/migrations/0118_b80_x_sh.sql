-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0118 §SH — CP-6 B80: THE SHELL, NAVIGATION, DEEP LINKS (F-P7-E-01: PR-05-001/002/003/005, UX-09-002/003/005, UX-11-002/003/005,
-- UX-15-001…005, PAT-25, PAT-26). Applies ALONE on 0001–0117 + the prelude (0118_b80_shell_foundations.sql); folded into 0118 at integration.
--
-- §SH.1 shell.navigation_states — a principal's OWN navigation position per workspace (and per domain): the route, the section, the query,
--       the filters, the view, the object selection, the active work object (kind, id, version, as-of), the return path and its focus
--       target, the recent and favourite locations. APPEND-ONLY versions (each names the version it supersedes); a save that read an older
--       version is refused `(stale)` — nothing is overwritten; RLS by principal (a principal id is global — another principal, even in the
--       same domain, reads none of it). The port re-checks the bound action, the established scope, the acting principal (= eye_principal())
--       and that the principal is a named HUMAN (an agent keeps no navigation state). A state is PRESENTATION ONLY: it names locations, never
--       a command — there is no field that could carry one, so restoring it can never repeat a side effect (PAT-26).
-- §SH.2 shell.navigation_states_of — the principal's own read (current per workspace + its version history), refused `(actor)` for any
--       other principal and `(access)` outside the caller's bound scope.
-- §SH.3 prediction.warning_as_of(warning, at) — the deep-link scene's read (PAT-25, UX-15-003/005): the warning's state AS OF an instant,
--       reconstructed from its OWN append-only event history (prediction.warning_events, 0029 §7; the state events raised → acknowledged |
--       expired | closed, as decision.warning_state_as_of reads them), the exact events up to the instant, and the VARIANCE against the
--       current declared state (prediction.warnings_current). Refused before the warning's first recorded event `(not_replayable)` and for
--       a future instant `(future)`; a warning that does not exist and one outside the caller's scope answer the SAME words `(unknown_warning)`
--       — nothing about existence, tenant or domain leaks (denial privacy). It reads; it writes nothing (opening a link acknowledges nothing).
--
-- THREE CLAIMS: construction (this file, apps/api/src/shell/navigation, apps/web/components/shell.tsx, lib/shell-b80.ts and the harness
-- phase6-navigation-b80); demonstrated operation (the act's deep-link scene on SYNTHETIC NORDWERK records); real acceptance (H3) — never
-- claimed here (the non-demonstration recording path is construction at B111).
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- §SH.0 THE VOCABULARY ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* The shell's workspaces (apps/web/lib/b80-seams.ts WorkspaceKey) and the route prefix each one's own locations live under. */
CREATE OR REPLACE FUNCTION shell.workspace_prefix(p_workspace text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_workspace WHEN 'admin' THEN '/admin' WHEN 'home' THEN '/home' WHEN 'decisions' THEN '/decisions' WHEN 'graph' THEN '/graph'
    WHEN 'intelligence' THEN '/intelligence' WHEN 'observation' THEN '/observation' WHEN 'prediction' THEN '/prediction' WHEN 'twins' THEN '/twins' END $$;
CREATE OR REPLACE FUNCTION shell.workspace_keys() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY['admin', 'home', 'decisions', 'graph', 'intelligence', 'observation', 'prediction', 'twins'] $$;
/* A location the shell may name: an absolute in-app path (never a scheme, a host, `//` or `..`), optionally with a plain query. */
CREATE OR REPLACE FUNCTION shell.route_ok(p_route text, p_query boolean) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT p_route IS NOT NULL AND length(p_route) BETWEEN 1 AND 600 AND position('//' in p_route) = 0 AND position('..' in p_route) = 0
     AND (CASE WHEN p_query THEN p_route ~ '^/[A-Za-z0-9/_.~%-]*(\?[A-Za-z0-9=&_.~%+:,-]*)?$' ELSE p_route ~ '^/[A-Za-z0-9/_.~%-]*$' END) $$;
GRANT EXECUTE ON FUNCTION shell.workspace_prefix(text), shell.workspace_keys(), shell.route_ok(text, boolean) TO eye_app, eye_commit;

-- §SH.1 THE NAVIGATION STATES ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE shell.navigation_states (
  state_id        uuid PRIMARY KEY,
  principal_id    uuid NOT NULL,
  scope           text NOT NULL CHECK (scope IN ('PLATFORM', 'TENANT', 'DOMAIN')),
  tenant_id       uuid,
  domain_id       uuid,
  workspace       text NOT NULL CHECK (workspace = ANY (shell.workspace_keys())),
  version         int NOT NULL CHECK (version >= 1),
  supersedes      uuid REFERENCES shell.navigation_states (state_id),
  location        jsonb NOT NULL CHECK (jsonb_typeof(location) = 'object' AND length(location::text) <= 16384),
  return_path     text CHECK (return_path IS NULL OR shell.route_ok(return_path, true)),
  focus_target    text CHECK (focus_target IS NULL OR focus_target ~ '^[A-Za-z][A-Za-z0-9_:-]{0,80}$'),
  recent          jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(recent) = 'array' AND jsonb_array_length(recent) <= 20),
  favorites       jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(favorites) = 'array' AND jsonb_array_length(favorites) <= 50),
  digest          text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  saved_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id  uuid NOT NULL,
  CONSTRAINT nav_scope_shape CHECK ((scope = 'PLATFORM' AND tenant_id IS NULL AND domain_id IS NULL) OR (scope <> 'PLATFORM' AND tenant_id IS NOT NULL AND domain_id IS NOT NULL)),
  CONSTRAINT nav_workspace_scope CHECK ((workspace = 'admin') = (scope = 'PLATFORM')),
  CONSTRAINT nav_version_chain CHECK ((version = 1) = (supersedes IS NULL)),
  CONSTRAINT nav_route_in_workspace CHECK (shell.route_ok(location ->> 'route', false)
    AND ((location ->> 'route') = shell.workspace_prefix(workspace) OR (location ->> 'route') LIKE shell.workspace_prefix(workspace) || '/%'))
);
CREATE UNIQUE INDEX nav_one_version ON shell.navigation_states (principal_id, workspace, domain_id, version) NULLS NOT DISTINCT;
CREATE UNIQUE INDEX nav_one_successor ON shell.navigation_states (supersedes) WHERE supersedes IS NOT NULL;
CREATE INDEX nav_principal ON shell.navigation_states (principal_id, workspace, saved_at DESC);
CREATE TRIGGER nav_append_only BEFORE UPDATE OR DELETE ON shell.navigation_states FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
ALTER TABLE shell.navigation_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE shell.navigation_states FORCE ROW LEVEL SECURITY;
/* a principal reads its OWN navigation states only (a principal id is global: the same domain's colleague reads none of them) */
CREATE POLICY nav_own ON shell.navigation_states FOR SELECT TO eye_app, eye_commit USING (principal_id = public.eye_principal());
GRANT SELECT ON shell.navigation_states TO eye_app, eye_commit;
COMMENT ON TABLE shell.navigation_states IS 'B80 §SH (0118): a principal''s own navigation position per workspace and domain — append-only versions, presentation only (locations, never a command).';

/* The location's shape, validated key by key (an unknown key is refused, never stored): what PR-05-002 / UX-11-002 name and nothing else. */
CREATE OR REPLACE FUNCTION shell.location_problem(p jsonb) RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = shell, pg_catalog, pg_temp AS $$
DECLARE k text; v jsonb; e jsonb;
BEGIN
  IF p IS NULL OR jsonb_typeof(p) <> 'object' THEN RETURN 'the location is an object'; END IF;
  FOR k, v IN SELECT * FROM jsonb_each(p) LOOP
    IF k NOT IN ('route', 'section', 'query', 'filters', 'view', 'selection', 'object', 'task', 'title') THEN
      RETURN format('the location carries no key %s (route, section, query, filters, view, selection, object, task, title)', k);
    END IF;
  END LOOP;
  IF NOT shell.route_ok(p ->> 'route', false) THEN RETURN 'the route is an absolute in-app path (no scheme, host, query, // or ..)'; END IF;
  IF p ? 'section' AND NOT (jsonb_typeof(p -> 'section') = 'string' AND (p ->> 'section') ~ '^[A-Za-z0-9 _.:-]{1,80}$') THEN RETURN 'the section is a short name'; END IF;
  IF p ? 'title' AND NOT (jsonb_typeof(p -> 'title') = 'string' AND length(p ->> 'title') BETWEEN 1 AND 160) THEN RETURN 'the title is a short text'; END IF;
  IF p ? 'view' AND NOT (jsonb_typeof(p -> 'view') = 'string' AND (p ->> 'view') ~ '^[A-Za-z0-9 _.:-]{1,80}$') THEN RETURN 'the view is a short name'; END IF;
  IF p ? 'query' AND NOT (jsonb_typeof(p -> 'query') = 'string' AND length(p ->> 'query') <= 1024 AND (p ->> 'query') ~ '^[A-Za-z0-9=&_.~%+:,-]*$') THEN RETURN 'the query is a plain query string'; END IF;
  IF p ? 'filters' THEN
    IF jsonb_typeof(p -> 'filters') <> 'object' OR (SELECT count(*) FROM jsonb_object_keys(p -> 'filters')) > 20 THEN RETURN 'the filters are at most 20 named values'; END IF;
    FOR k, v IN SELECT * FROM jsonb_each(p -> 'filters') LOOP
      IF k !~ '^[A-Za-z][A-Za-z0-9_.-]{0,60}$' OR jsonb_typeof(v) <> 'string' OR length(v #>> '{}') > 200 THEN RETURN format('the filter %s is a named short text', k); END IF;
    END LOOP;
  END IF;
  IF p ? 'selection' THEN
    IF jsonb_typeof(p -> 'selection') <> 'array' OR jsonb_array_length(p -> 'selection') > 50 THEN RETURN 'the selection is at most 50 objects'; END IF;
    FOR e IN SELECT * FROM jsonb_array_elements(p -> 'selection') LOOP
      IF shell.object_problem(e) IS NOT NULL THEN RETURN 'a selected object ' || shell.object_problem(e); END IF;
    END LOOP;
  END IF;
  IF p ? 'object' AND jsonb_typeof(p -> 'object') <> 'null' AND shell.object_problem(p -> 'object') IS NOT NULL THEN RETURN 'the work object ' || shell.object_problem(p -> 'object'); END IF;
  IF p ? 'task' AND jsonb_typeof(p -> 'task') <> 'null' AND shell.object_problem(p -> 'task') IS NOT NULL THEN RETURN 'the task ' || shell.object_problem(p -> 'task'); END IF;
  RETURN NULL;
END $$;
/* An object reference: its kind, its id, and (optionally) the exact version and the as-of instant it was seen at. */
CREATE OR REPLACE FUNCTION shell.object_problem(o jsonb) RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = shell, pg_catalog, pg_temp AS $$
DECLARE k text;
BEGIN
  IF o IS NULL OR jsonb_typeof(o) <> 'object' THEN RETURN 'is {kind, id, version?, as_of?}'; END IF;
  FOR k IN SELECT jsonb_object_keys(o) LOOP
    IF k NOT IN ('kind', 'id', 'version', 'as_of') THEN RETURN format('carries no key %s', k); END IF;
  END LOOP;
  IF NOT ((o ->> 'kind') ~ '^[a-z][a-z_]{1,40}$') THEN RETURN 'names its kind'; END IF;
  IF NOT ((o ->> 'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') THEN RETURN 'names its id'; END IF;
  IF o ? 'version' AND NOT (jsonb_typeof(o -> 'version') = 'number' AND (o ->> 'version') ~ '^[0-9]{1,9}$') THEN RETURN 'names a whole version'; END IF;
  IF o ? 'as_of' AND NOT (jsonb_typeof(o -> 'as_of') = 'string' AND (o ->> 'as_of') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+(Z|[+-][0-9]{2}:[0-9]{2})$') THEN RETURN 'names an ISO instant as its as-of'; END IF;
  RETURN NULL;
END $$;
/* A recent / favourite entry: an in-app location and its short title. */
CREATE OR REPLACE FUNCTION shell.places_problem(p jsonb, p_max int) RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = shell, pg_catalog, pg_temp AS $$
DECLARE e jsonb; k text;
BEGIN
  IF p IS NULL OR jsonb_typeof(p) <> 'array' OR jsonb_array_length(p) > p_max THEN RETURN format('is a list of at most %s places', p_max); END IF;
  FOR e IN SELECT * FROM jsonb_array_elements(p) LOOP
    IF jsonb_typeof(e) <> 'object' THEN RETURN 'is a list of {route, title}'; END IF;
    FOR k IN SELECT jsonb_object_keys(e) LOOP IF k NOT IN ('route', 'title', 'at') THEN RETURN format('carries no key %s', k); END IF; END LOOP;
    IF NOT shell.route_ok(e ->> 'route', true) THEN RETURN 'names in-app locations only'; END IF;
    IF e ? 'title' AND NOT (jsonb_typeof(e -> 'title') = 'string' AND length(e ->> 'title') BETWEEN 1 AND 160) THEN RETURN 'titles each place in a short text'; END IF;
  END LOOP;
  RETURN NULL;
END $$;
GRANT EXECUTE ON FUNCTION shell.location_problem(jsonb), shell.object_problem(jsonb), shell.places_problem(jsonb, int) TO eye_app, eye_commit;

/* THE WRITE PORT (`shell.navigation.save`). */
CREATE OR REPLACE FUNCTION shell.save_navigation_state(
  p_state_id uuid, p_tenant uuid, p_domain uuid, p_workspace text, p_expected_version int, p_location jsonb, p_return_path text, p_focus text,
  p_recent jsonb, p_favorites jsonb, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = shell, observation, identity, public, pg_catalog, pg_temp AS $$
DECLARE
  v_scope text := public.eye_scope();
  v_kind text; v_status text;
  v_cur shell.navigation_states%ROWTYPE;
  v_problem text; v_version int; v_digest text; v_row shell.navigation_states%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['shell.navigation.save']);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN
    RAISE EXCEPTION 'navigation state rejected (actor): a navigation state is saved by its own principal, never on another''s behalf' USING ERRCODE = '42501';
  END IF;
  SELECT p.kind, p.status INTO v_kind, v_status FROM identity.principals p WHERE p.id = p_actor;
  IF v_kind IS DISTINCT FROM 'human' OR v_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'navigation state rejected (actor): a navigation state is a named, active human''s own — an agent or a workload keeps none' USING ERRCODE = '42501';
  END IF;
  -- the scope is the ESTABLISHED context's, never an argument's: PLATFORM keeps no tenant or domain; otherwise both must be the bound ones
  IF v_scope = 'PLATFORM' THEN
    IF p_tenant IS NOT NULL OR p_domain IS NOT NULL THEN
      RAISE EXCEPTION 'navigation state rejected (access): a PLATFORM context saves a PLATFORM state (no tenant, no domain)' USING ERRCODE = '42501';
    END IF;
  ELSIF p_tenant IS NULL OR p_domain IS NULL OR p_tenant IS DISTINCT FROM public.eye_tenant()
        OR (v_scope = 'DOMAIN' AND p_domain IS DISTINCT FROM public.eye_domain()) THEN
    RAISE EXCEPTION 'navigation state rejected (access): the state is saved in the established context''s own tenant and domain' USING ERRCODE = '42501';
  END IF;
  IF p_workspace IS NULL OR NOT (p_workspace = ANY (shell.workspace_keys())) THEN
    RAISE EXCEPTION 'navigation state rejected (workspace): % is not a workspace of the shell (%)', coalesce(p_workspace, '<none>'), array_to_string(shell.workspace_keys(), ', ') USING ERRCODE = '22023';
  END IF;
  IF (p_workspace = 'admin') <> (v_scope = 'PLATFORM') THEN
    RAISE EXCEPTION 'navigation state rejected (workspace): the admin workspace is the PLATFORM''s; every other workspace is a domain''s' USING ERRCODE = '22023';
  END IF;
  v_problem := shell.location_problem(p_location);
  IF v_problem IS NOT NULL THEN RAISE EXCEPTION 'navigation state rejected (location): %', v_problem USING ERRCODE = '22023'; END IF;
  IF NOT ((p_location ->> 'route') = shell.workspace_prefix(p_workspace) OR (p_location ->> 'route') LIKE shell.workspace_prefix(p_workspace) || '/%') THEN
    RAISE EXCEPTION 'navigation state rejected (location): % is not a location of the % workspace (%…)', p_location ->> 'route', p_workspace, shell.workspace_prefix(p_workspace) USING ERRCODE = '22023';
  END IF;
  IF length(p_location::text) > 16384 THEN RAISE EXCEPTION 'navigation state rejected (location): the location is at most 16 KiB' USING ERRCODE = '22023'; END IF;
  IF p_return_path IS NOT NULL AND NOT shell.route_ok(p_return_path, true) THEN
    RAISE EXCEPTION 'navigation state rejected (return_path): the return path is an in-app location (no scheme, host, // or ..)' USING ERRCODE = '22023';
  END IF;
  IF p_focus IS NOT NULL AND p_focus !~ '^[A-Za-z][A-Za-z0-9_:-]{0,80}$' THEN
    RAISE EXCEPTION 'navigation state rejected (focus): the focus target is an element id' USING ERRCODE = '22023';
  END IF;
  v_problem := shell.places_problem(coalesce(p_recent, '[]'::jsonb), 20);
  IF v_problem IS NOT NULL THEN RAISE EXCEPTION 'navigation state rejected (recent): the recent list %', v_problem USING ERRCODE = '22023'; END IF;
  v_problem := shell.places_problem(coalesce(p_favorites, '[]'::jsonb), 50);
  IF v_problem IS NOT NULL THEN RAISE EXCEPTION 'navigation state rejected (favorites): the favourites %', v_problem USING ERRCODE = '22023'; END IF;
  IF p_expected_version IS NULL OR p_expected_version < 0 THEN
    RAISE EXCEPTION 'navigation state rejected (version): the save names the version it read (0 when there was none)' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_cur FROM shell.navigation_states s
   WHERE s.principal_id = p_actor AND s.workspace = p_workspace AND s.domain_id IS NOT DISTINCT FROM p_domain
   ORDER BY s.version DESC LIMIT 1 FOR UPDATE;
  v_version := coalesce(v_cur.version, 0);
  IF v_version <> p_expected_version THEN
    RAISE EXCEPTION 'navigation state rejected (stale): the saved % state is at version %; this save read version % — read it again (nothing was overwritten)', p_workspace, v_version, p_expected_version USING ERRCODE = '22023';
  END IF;
  v_digest := encode(sha256(convert_to(jsonb_build_object('workspace', p_workspace, 'location', p_location, 'return_path', p_return_path, 'focus', p_focus,
                                                           'recent', coalesce(p_recent, '[]'::jsonb), 'favorites', coalesce(p_favorites, '[]'::jsonb))::text, 'UTF8')), 'hex');
  INSERT INTO shell.navigation_states (state_id, principal_id, scope, tenant_id, domain_id, workspace, version, supersedes, location, return_path, focus_target, recent, favorites, digest, correlation_id)
  VALUES (p_state_id, p_actor, v_scope, p_tenant, p_domain, p_workspace, v_version + 1, v_cur.state_id, p_location, p_return_path, p_focus,
          coalesce(p_recent, '[]'::jsonb), coalesce(p_favorites, '[]'::jsonb), v_digest, p_correlation)
  RETURNING * INTO v_row;
  PERFORM shell.ledger(p_tenant, p_domain, p_actor, 'navigation_state', p_state_id, v_row.version, 'shell.navigation.saved',
                       jsonb_build_object('workspace', p_workspace, 'route', p_location ->> 'route', 'supersedes', v_cur.state_id, 'digest', v_digest), p_correlation);
  RETURN jsonb_build_object('state_id', v_row.state_id, 'workspace', v_row.workspace, 'version', v_row.version, 'supersedes', v_row.supersedes,
    'scope', v_row.scope, 'tenant_id', v_row.tenant_id, 'domain_id', v_row.domain_id, 'location', v_row.location, 'return_path', v_row.return_path,
    'focus_target', v_row.focus_target, 'recent', v_row.recent, 'favorites', v_row.favorites, 'digest', v_row.digest, 'saved_at', v_row.saved_at);
END $$;
REVOKE ALL ON FUNCTION shell.save_navigation_state(uuid, uuid, uuid, text, int, jsonb, text, text, jsonb, jsonb, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION shell.save_navigation_state(uuid, uuid, uuid, text, int, jsonb, text, text, jsonb, jsonb, uuid, uuid) TO eye_commit;

-- §SH.2 THE OWN READ ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION shell.navigation_states_of(p_principal uuid, p_tenant uuid, p_domain uuid, p_workspace text, p_history int) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = shell, observation, public, pg_catalog, pg_temp AS $$
DECLARE v_scope text := public.eye_scope(); v_out jsonb;
BEGIN
  IF p_principal IS NULL OR p_principal IS DISTINCT FROM public.eye_principal() THEN
    RAISE EXCEPTION 'navigation state rejected (actor): a principal reads only its own navigation state' USING ERRCODE = '42501';
  END IF;
  IF v_scope = 'PLATFORM' THEN
    IF p_tenant IS NOT NULL OR p_domain IS NOT NULL THEN
      RAISE EXCEPTION 'navigation state rejected (access): a PLATFORM context reads the PLATFORM states' USING ERRCODE = '42501';
    END IF;
  ELSIF NOT observation.read_scope_ok(p_tenant, p_domain) OR p_domain IS NULL THEN
    RAISE EXCEPTION 'navigation state rejected (access): a navigation state is read only within the caller''s bound tenant and domain' USING ERRCODE = '42501';
  END IF;
  IF p_workspace IS NOT NULL AND NOT (p_workspace = ANY (shell.workspace_keys())) THEN
    RAISE EXCEPTION 'navigation state rejected (workspace): % is not a workspace of the shell', p_workspace USING ERRCODE = '22023';
  END IF;
  WITH mine AS (
    SELECT s.* FROM shell.navigation_states s
     WHERE s.principal_id = p_principal AND s.domain_id IS NOT DISTINCT FROM p_domain AND (p_workspace IS NULL OR s.workspace = p_workspace)
  ), cur AS (
    SELECT DISTINCT ON (workspace) * FROM mine ORDER BY workspace, version DESC
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'workspace', c.workspace,
      'current', jsonb_build_object('state_id', c.state_id, 'version', c.version, 'supersedes', c.supersedes, 'location', c.location, 'return_path', c.return_path,
                                    'focus_target', c.focus_target, 'recent', c.recent, 'favorites', c.favorites, 'digest', c.digest, 'saved_at', c.saved_at),
      'versions', (SELECT count(*) FROM mine m WHERE m.workspace = c.workspace),
      'history', (SELECT coalesce(jsonb_agg(jsonb_build_object('state_id', h.state_id, 'version', h.version, 'route', h.location ->> 'route', 'digest', h.digest, 'saved_at', h.saved_at) ORDER BY h.version DESC), '[]'::jsonb)
                    FROM (SELECT * FROM mine m WHERE m.workspace = c.workspace ORDER BY m.version DESC LIMIT greatest(0, least(coalesce(p_history, 5), 50))) h)
    ) ORDER BY c.workspace), '[]'::jsonb) INTO v_out FROM cur c;
  RETURN jsonb_build_object('principal_id', p_principal, 'scope', v_scope, 'tenant_id', p_tenant, 'domain_id', p_domain, 'read_at', clock_timestamp(), 'workspaces', v_out,
    'claim', 'the principal''s own navigation states — presentation only: locations and a return path, never a command; restoring one repeats nothing');
END $$;
REVOKE ALL ON FUNCTION shell.navigation_states_of(uuid, uuid, uuid, text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION shell.navigation_states_of(uuid, uuid, uuid, text, int) TO eye_app, eye_commit;

-- §SH.3 THE WARNING AS OF AN INSTANT (the deep-link scene) ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION prediction.warning_as_of(p_warning uuid, p_at timestamptz) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = prediction, observation, public, pg_catalog, pg_temp AS $$
DECLARE
  w prediction.warnings_current%ROWTYPE;
  v_first timestamptz; v_raised jsonb; v_state_ev text; v_state text; v_ctx int; v_events jsonb; v_n int; v_total int; v_after int;
  v_last jsonb; v_last_current jsonb; v_changed jsonb := '[]'::jsonb; v_now timestamptz := clock_timestamp();
BEGIN
  SELECT * INTO w FROM prediction.warnings_current x WHERE x.warning_id = p_warning;
  -- DENIAL PRIVACY: a warning that does not exist and one outside the caller's scope answer the same words (no tenant, domain or existence)
  IF NOT FOUND OR NOT observation.read_scope_ok(w.tenant_id, w.domain_id) THEN
    RAISE EXCEPTION 'warning as-of rejected (unknown_warning): no authorized warning matches this link' USING ERRCODE = '23503';
  END IF;
  IF p_at IS NULL THEN RAISE EXCEPTION 'warning as-of rejected (instant): the link names the instant it opens the warning at' USING ERRCODE = '22023'; END IF;
  IF p_at > v_now THEN
    RAISE EXCEPTION 'warning as-of rejected (future): % is after now (%); a link opens a recorded state, never a future one', p_at, v_now USING ERRCODE = '22023';
  END IF;
  SELECT min(e.occurred_at) INTO v_first FROM prediction.warning_events e WHERE e.warning_id = p_warning;
  IF v_first IS NULL OR p_at < v_first THEN
    RAISE EXCEPTION 'warning as-of rejected (not_replayable): the warning has no recorded state at %; its history begins at % — open it at or after that instant, or open the current state', p_at, v_first USING ERRCODE = '22023';
  END IF;
  SELECT e.details INTO v_raised FROM prediction.warning_events e WHERE e.warning_id = p_warning AND e.event = 'warning.raised' AND e.occurred_at <= p_at ORDER BY e.occurred_at, e.event_id LIMIT 1;
  -- the STATE as of the instant: the last state event (raised → acknowledged | expired | closed), as decision.warning_state_as_of reads it
  SELECT e.event INTO v_state_ev FROM prediction.warning_events e
   WHERE e.warning_id = p_warning AND e.occurred_at <= p_at AND e.event IN ('warning.raised', 'warning.acknowledged', 'warning.expired', 'warning.closed')
   ORDER BY e.occurred_at DESC, e.event_id DESC LIMIT 1;
  v_state := CASE v_state_ev WHEN 'warning.raised' THEN 'raised' WHEN 'warning.acknowledged' THEN 'acknowledged' WHEN 'warning.expired' THEN 'expired' WHEN 'warning.closed' THEN 'closed' ELSE 'raised' END;
  SELECT coalesce((SELECT (e.details ->> 'context_version')::int FROM prediction.warning_events e WHERE e.warning_id = p_warning AND e.event = 'warning.context_set' AND e.occurred_at <= p_at
                    ORDER BY e.occurred_at DESC, e.event_id DESC LIMIT 1), 0) INTO v_ctx;
  SELECT coalesce(jsonb_agg(jsonb_build_object('event_id', e.event_id, 'event', e.event, 'occurred_at', e.occurred_at) ORDER BY e.occurred_at, e.event_id), '[]'::jsonb), count(*)
    INTO v_events, v_n FROM prediction.warning_events e WHERE e.warning_id = p_warning AND e.occurred_at <= p_at;
  SELECT count(*) INTO v_total FROM prediction.warning_events e WHERE e.warning_id = p_warning;
  v_after := v_total - v_n;
  v_last := v_events -> (v_n - 1);
  SELECT jsonb_build_object('event_id', e.event_id, 'event', e.event, 'occurred_at', e.occurred_at) INTO v_last_current
    FROM prediction.warning_events e WHERE e.warning_id = p_warning ORDER BY e.occurred_at DESC, e.event_id DESC LIMIT 1;
  IF v_state IS DISTINCT FROM w.state THEN v_changed := v_changed || jsonb_build_object('field', 'state', 'as_of', v_state, 'current', w.state); END IF;
  IF (v_raised ->> 'level') IS DISTINCT FROM w.level THEN v_changed := v_changed || jsonb_build_object('field', 'level', 'as_of', v_raised ->> 'level', 'current', w.level); END IF;
  IF v_ctx IS DISTINCT FROM w.context_version THEN v_changed := v_changed || jsonb_build_object('field', 'context_version', 'as_of', v_ctx, 'current', w.context_version); END IF;
  IF (v_raised ->> 'title') IS DISTINCT FROM w.title THEN v_changed := v_changed || jsonb_build_object('field', 'title', 'as_of', v_raised ->> 'title', 'current', w.title); END IF;
  RETURN jsonb_build_object(
    'warning_id', p_warning, 'at', p_at, 'read_at', v_now,
    'as_of', jsonb_build_object('state', v_state, 'title', v_raised ->> 'title', 'level', v_raised ->> 'level', 'urgency', v_raised ->> 'urgency',
                                'confidence', v_raised -> 'confidence', 'closes_at', v_raised ->> 'closes_at', 'routed_to', v_raised ->> 'routed_to',
                                'context_version', v_ctx, 'event_count', v_n, 'last_event', v_last, 'events', v_events),
    'current', jsonb_build_object('state', w.state, 'title', w.title, 'level', w.level, 'context_version', w.context_version, 'event_count', v_total,
                                  'last_event', v_last_current, 'attention_state', w.attention_state),
    'variance', jsonb_build_object('exact', v_after = 0, 'events_since', v_after, 'changed', v_changed,
      'statement', CASE WHEN v_after = 0 THEN 'no event was recorded after this instant: the as-of state is the current declared state'
                        ELSE format('%s event(s) were recorded after this instant; %s field(s) differ from the current declared state', v_after, jsonb_array_length(v_changed)) END),
    'first_event_at', v_first,
    'claim', 'the state recorded AS OF the instant, from the warning''s own append-only event history; opening it reads only — it acknowledges, approves and changes nothing');
END $$;
REVOKE ALL ON FUNCTION prediction.warning_as_of(uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.warning_as_of(uuid, timestamptz) TO eye_app, eye_commit;
