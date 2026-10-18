-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0119 §LY-G — CP-6 B81 part `lyg`: RESPONSIVE GRID, DENSITY AND REGIONS — THE PERSON'S OWN LAYOUT PREFERENCES (F-P7-E-04: UX-14-002 the
-- persisted viewport class / grid / region / panel / density / focus / overflow / saved layout; DEN-01…03 the density switched per person;
-- UX-14-004 adaptation never hides authority; UX-ADR-013). Part-local file (folded into the one 0119 at integration, in the order §0, §DG,
-- §CT, §SI, §LY); applies ALONE on 0001–0118 + the prelude (0119_b81_patterns_layout_content.sql §0).
--
-- §LY.1 shell.preferences — a principal's OWN presentation preferences, ONE SERIES PER PERSON AND COMPOSITION (`default` = the person's
--       general choice; a composition key such as `prediction.warnings` or `home.operations-room` = that composition's own layout):
--         density   DEN-01 strategic (44 px controls, 40–48 px rows) · DEN-02 operational (36 px; 32–36 px rows) · DEN-03 inspection
--                   (28–32 px) — or NULL: no choice, the shell applies the role / composition default (apps/web/lib/layout-b81.ts decides
--                   that default; the server stores only what the person chose);
--         layout    the composition's saved layout, validated KEY BY KEY (an unknown key is refused, never stored): the viewport class it
--                   was saved at, the 12-column grid, the spans and states of the regions, the one supporting panel, the rail, the region
--                   that held focus, the overflow policy. THE BOUNDARY (UX-14-004, UX-ADR-013, REG-01/03/06/07/08): a saved layout can
--                   NEVER hide the context, the primary task, the action, the status or the authority region, nor the evidence — only the
--                   inspector (secondary detail) may be saved collapsed; an overflow policy that clips is refused (no clipped control).
--       APPEND-ONLY versions (each names the version it supersedes; a save that read an older version is refused `(stale)` — nothing is
--       overwritten; the same content as the current version is answered `unchanged`, no new version). Every version carries the layout
--       CONTRACT it was validated under (shell.layout_contract_version()) so a later contract RECONCILES it (the web's reconcileLayout)
--       instead of guessing. RLS by principal (a principal id is global — another principal, even in the same domain, reads none of it).
--       PRESENTATION ONLY: density and layout change how things are shown, never what they mean, who may act, or what an act does — no
--       field can carry a command, an approval or a role.
-- §LY.2 shell.save_preferences — the write port (`shell.preferences.save`): the bound action asserted, the ESTABLISHED context's scope (a
--       PLATFORM context saves with no tenant or domain; otherwise the bound tenant and domain), the acting principal = eye_principal(), a
--       NAMED ACTIVE HUMAN re-checked in the port (an agent or a workload keeps no preference), the stale check, the ledger (shell.events).
-- §LY.3 shell.preferences_of — the principal's own read (current per composition + its version history), refused `(actor)` for any other
--       principal and `(access)` outside the caller's bound scope.
--
-- Refusals in the class form `layout preference rejected (<class>): …` — 403 actor|access · 409 stale · 422 the rest. NOTE (the
-- integrator): the noun `layout preference` is not mapped centrally yet (observation-errors.ts).
--
-- THREE CLAIMS: construction (this file, apps/api/src/shell/preferences, apps/web/components/layout.tsx, lib/layout-b81.ts and the harness
-- phase6-preferences-b81 — every persona and preference there SYNTHETIC); demonstrated operation (the act: L. Brandt's density switched to
-- strategic on eye_demo — SYNTHETIC persona); real acceptance (UX-14-006 / UX-19-006 → the shared non-demonstration recording path at B111,
-- then H3) — never claimed here.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- §LY.0 THE VOCABULARY ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* The layout contract the saved layouts are validated under (apps/web/lib/layout-b81.ts LAYOUT_CONTRACT — the same string). */
CREATE OR REPLACE FUNCTION shell.layout_contract_version() RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT 'b81-lyg-layout-1' $$;
/* BP-01…05 (compact 0–639 · narrow 640–959 · standard 960–1439 · wide 1440–1919 · command ≥ 1920), DEN-01…03, the seven regions. */
CREATE OR REPLACE FUNCTION shell.layout_classes() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY['BP-01', 'BP-02', 'BP-03', 'BP-04', 'BP-05'] $$;
CREATE OR REPLACE FUNCTION shell.densities() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY['DEN-01', 'DEN-02', 'DEN-03'] $$;
CREATE OR REPLACE FUNCTION shell.region_keys() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY['context', 'primary', 'evidence', 'inspector', 'action', 'status', 'authority'] $$;
/* The regions a saved layout may collapse: the inspector only (secondary detail). Context, primary, evidence, action, status and authority
   are never hidden by a preference (UX-14-004, UX-ADR-013). */
CREATE OR REPLACE FUNCTION shell.collapsible_regions() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY['inspector'] $$;
GRANT EXECUTE ON FUNCTION shell.layout_contract_version(), shell.layout_classes(), shell.densities(), shell.region_keys(), shell.collapsible_regions() TO eye_app, eye_commit;

/* A saved layout's shape, validated key by key (null = admissible): what UX-14-002 names and nothing else. */
CREATE OR REPLACE FUNCTION shell.layout_problem(p jsonb) RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = shell, pg_catalog, pg_temp AS $$
DECLARE k text; v jsonb; rk text; rv jsonb;
BEGIN
  IF p IS NULL OR jsonb_typeof(p) <> 'object' THEN RETURN 'the layout is an object'; END IF;
  IF length(p::text) > 8192 THEN RETURN 'the layout is at most 8 KiB'; END IF;
  FOR k, v IN SELECT * FROM jsonb_each(p) LOOP
    IF k NOT IN ('viewport_class', 'grid', 'regions', 'panel', 'rail', 'focus_region', 'overflow') THEN
      RETURN format('the layout carries no key %s (viewport_class, grid, regions, panel, rail, focus_region, overflow)', k);
    END IF;
  END LOOP;
  IF p ? 'viewport_class' AND NOT (jsonb_typeof(p -> 'viewport_class') = 'string' AND (p ->> 'viewport_class') = ANY (shell.layout_classes())) THEN
    RETURN 'the viewport class is one of BP-01…BP-05';
  END IF;
  IF p ? 'grid' THEN
    IF jsonb_typeof(p -> 'grid') <> 'object' OR (SELECT count(*) FROM jsonb_object_keys(p -> 'grid') g WHERE g <> 'columns') > 0
       OR jsonb_typeof(p -> 'grid' -> 'columns') IS DISTINCT FROM 'number' OR (p -> 'grid' ->> 'columns') IS DISTINCT FROM '12' THEN
      RETURN 'the grid is the approved 12-column grid ({"columns": 12})';
    END IF;
  END IF;
  IF p ? 'regions' THEN
    IF jsonb_typeof(p -> 'regions') <> 'object' THEN RETURN 'the regions are an object keyed by region'; END IF;
    FOR rk, rv IN SELECT * FROM jsonb_each(p -> 'regions') LOOP
      IF NOT (rk = ANY (shell.region_keys())) THEN RETURN format('%s is not a region (%s)', rk, array_to_string(shell.region_keys(), ', ')); END IF;
      IF jsonb_typeof(rv) <> 'object' THEN RETURN format('the %s region is {span?, state?}', rk); END IF;
      FOR k IN SELECT jsonb_object_keys(rv) LOOP
        IF k NOT IN ('span', 'state') THEN RETURN format('the %s region carries no key %s (span, state)', rk, k); END IF;
      END LOOP;
      IF rv ? 'span' AND NOT (jsonb_typeof(rv -> 'span') = 'number' AND (rv ->> 'span') ~ '^([1-9]|1[0-2])$') THEN
        RETURN format('the %s region spans 1–12 columns', rk);
      END IF;
      IF rv ? 'state' AND NOT (jsonb_typeof(rv -> 'state') = 'string' AND (rv ->> 'state') IN ('open', 'collapsed')) THEN
        RETURN format('the %s region is open or collapsed', rk);
      END IF;
    END LOOP;
  END IF;
  IF p ? 'panel' AND jsonb_typeof(p -> 'panel') <> 'null' AND NOT (jsonb_typeof(p -> 'panel') = 'string' AND (p ->> 'panel') IN ('evidence', 'inspector')) THEN
    RETURN 'the supporting panel is evidence or inspector (or null)';
  END IF;
  IF p ? 'rail' AND NOT (jsonb_typeof(p -> 'rail') = 'string' AND (p ->> 'rail') IN ('expanded', 'collapsed')) THEN
    RETURN 'the rail is expanded or collapsed';
  END IF;
  IF p ? 'focus_region' AND jsonb_typeof(p -> 'focus_region') <> 'null' AND NOT (jsonb_typeof(p -> 'focus_region') = 'string' AND (p ->> 'focus_region') = ANY (shell.region_keys())) THEN
    RETURN 'the focus region is a region key';
  END IF;
  IF p ? 'overflow' AND NOT (jsonb_typeof(p -> 'overflow') = 'string' AND (p ->> 'overflow') IN ('reflow', 'scroll_region')) THEN
    RETURN 'the overflow policy is reflow or scroll_region (content is never clipped)';
  END IF;
  RETURN NULL;
END $$;
/* THE BOUNDARY (null = admissible): a saved layout never hides a protected region (UX-14-004). Separate from the shape so its class is its own. */
CREATE OR REPLACE FUNCTION shell.layout_hides(p jsonb) RETURNS text LANGUAGE sql IMMUTABLE SET search_path = shell, pg_catalog, pg_temp AS $$
  SELECT string_agg(r.key, ', ' ORDER BY r.key) FROM jsonb_each(coalesce(p -> 'regions', '{}'::jsonb)) r
   WHERE jsonb_typeof(r.value) = 'object' AND (r.value ->> 'state') = 'collapsed' AND NOT (r.key = ANY (shell.collapsible_regions())) $$;
GRANT EXECUTE ON FUNCTION shell.layout_problem(jsonb), shell.layout_hides(jsonb) TO eye_app, eye_commit;

-- §LY.1 THE PREFERENCES ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE shell.preferences (
  preference_id   uuid PRIMARY KEY,
  principal_id    uuid NOT NULL,
  scope           text NOT NULL CHECK (scope IN ('PLATFORM', 'TENANT', 'DOMAIN')),   -- the context the version was SAVED in (recorded, not a key)
  tenant_id       uuid,
  domain_id       uuid,
  composition     text NOT NULL CHECK (composition ~ '^[a-z][a-z0-9_.-]{1,80}$'),
  version         int NOT NULL CHECK (version >= 1),
  supersedes      uuid REFERENCES shell.preferences (preference_id),
  density         text CHECK (density IS NULL OR density = ANY (shell.densities())),
  layout          jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (shell.layout_problem(layout) IS NULL AND shell.layout_hides(layout) IS NULL),
  contract        text NOT NULL,
  digest          text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  saved_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id  uuid NOT NULL,
  CONSTRAINT pref_scope_shape CHECK ((scope = 'PLATFORM' AND tenant_id IS NULL AND domain_id IS NULL) OR (scope <> 'PLATFORM' AND tenant_id IS NOT NULL AND domain_id IS NOT NULL)),
  CONSTRAINT pref_version_chain CHECK ((version = 1) = (supersedes IS NULL))
);
/* ONE series per person and composition (a person's density is theirs in every domain they work in — presentation, never authority) */
CREATE UNIQUE INDEX pref_one_version ON shell.preferences (principal_id, composition, version);
CREATE UNIQUE INDEX pref_one_successor ON shell.preferences (supersedes) WHERE supersedes IS NOT NULL;
CREATE INDEX pref_principal ON shell.preferences (principal_id, composition, saved_at DESC);
CREATE TRIGGER pref_append_only BEFORE UPDATE OR DELETE ON shell.preferences FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
ALTER TABLE shell.preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE shell.preferences FORCE ROW LEVEL SECURITY;
/* a principal reads its OWN preferences only (a principal id is global: the same domain's colleague reads none of them) */
CREATE POLICY pref_own ON shell.preferences FOR SELECT TO eye_app, eye_commit USING (principal_id = public.eye_principal());
GRANT SELECT ON shell.preferences TO eye_app, eye_commit;
COMMENT ON TABLE shell.preferences IS 'B81 §LY-G (0119): a principal''s own density and saved layout per composition — append-only versions, presentation only (never a command, an approval or a role).';

-- §LY.2 THE WRITE PORT (`shell.preferences.save`) ──────────────────────────────────────────────────────────────────────────────────────────
/* p_expected_version is the version the client READ (0 when there was none). A NULL density is "no choice" (the role / composition default
   applies); an empty layout is "no saved layout" (the composition's approved default applies) — a reset is a new version, never a delete. */
CREATE OR REPLACE FUNCTION shell.save_preferences(
  p_preference_id uuid, p_tenant uuid, p_domain uuid, p_composition text, p_expected_version int, p_density text, p_layout jsonb,
  p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = shell, observation, identity, public, pg_catalog, pg_temp AS $$
DECLARE
  v_scope text := public.eye_scope();
  v_kind text; v_status text;
  v_cur shell.preferences%ROWTYPE;
  v_layout jsonb := coalesce(p_layout, '{}'::jsonb);
  v_problem text; v_version int; v_digest text; v_row shell.preferences%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['shell.preferences.save']);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN
    RAISE EXCEPTION 'layout preference rejected (actor): a preference is saved by its own principal, never on another''s behalf' USING ERRCODE = '42501';
  END IF;
  SELECT p.kind, p.status INTO v_kind, v_status FROM identity.principals p WHERE p.id = p_actor;
  IF v_kind IS DISTINCT FROM 'human' OR v_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'layout preference rejected (actor): a layout preference is a named, active human''s own — an agent or a workload keeps none' USING ERRCODE = '42501';
  END IF;
  -- the scope is the ESTABLISHED context's, never an argument's: PLATFORM keeps no tenant or domain; otherwise both must be the bound ones
  IF v_scope = 'PLATFORM' THEN
    IF p_tenant IS NOT NULL OR p_domain IS NOT NULL THEN
      RAISE EXCEPTION 'layout preference rejected (access): a PLATFORM context saves with no tenant and no domain' USING ERRCODE = '42501';
    END IF;
  ELSIF p_tenant IS NULL OR p_domain IS NULL OR p_tenant IS DISTINCT FROM public.eye_tenant()
        OR (v_scope = 'DOMAIN' AND p_domain IS DISTINCT FROM public.eye_domain()) THEN
    RAISE EXCEPTION 'layout preference rejected (access): a preference is saved in the established context''s own tenant and domain' USING ERRCODE = '42501';
  END IF;
  IF p_composition IS NULL OR p_composition !~ '^[a-z][a-z0-9_.-]{1,80}$' THEN
    RAISE EXCEPTION 'layout preference rejected (composition): a composition is named in lower case (default, prediction.warnings, home.operations-room)' USING ERRCODE = '22023';
  END IF;
  IF p_density IS NOT NULL AND NOT (p_density = ANY (shell.densities())) THEN
    RAISE EXCEPTION 'layout preference rejected (density): % is not a density (DEN-01 strategic, DEN-02 operational, DEN-03 inspection — or none, for the default)', p_density USING ERRCODE = '22023';
  END IF;
  v_problem := shell.layout_problem(v_layout);
  IF v_problem IS NOT NULL THEN RAISE EXCEPTION 'layout preference rejected (layout): %', v_problem USING ERRCODE = '22023'; END IF;
  v_problem := shell.layout_hides(v_layout);
  IF v_problem IS NOT NULL THEN
    RAISE EXCEPTION 'layout preference rejected (region): a saved layout never hides the % region — only the inspector may be collapsed; context, primary task, evidence, action, status and authority stay shown at every size (UX-14-004)', v_problem USING ERRCODE = '22023';
  END IF;
  IF p_expected_version IS NULL OR p_expected_version < 0 THEN
    RAISE EXCEPTION 'layout preference rejected (version): the save names the version it read (0 when there was none)' USING ERRCODE = '22023';
  END IF;

  -- one save at a time per series (the person's preference for this composition)
  PERFORM pg_advisory_xact_lock(hashtextextended('shell.preferences:' || p_actor || ':' || p_composition, 0));
  SELECT * INTO v_cur FROM shell.preferences s WHERE s.principal_id = p_actor AND s.composition = p_composition ORDER BY s.version DESC LIMIT 1;
  v_version := coalesce(v_cur.version, 0);
  IF v_version <> p_expected_version THEN
    RAISE EXCEPTION 'layout preference rejected (stale): your % preference is at version %; this save read version % — read it again (nothing was overwritten)', p_composition, v_version, p_expected_version USING ERRCODE = '23514';
  END IF;
  v_digest := encode(sha256(convert_to(jsonb_build_object('composition', p_composition, 'density', p_density, 'layout', v_layout, 'contract', shell.layout_contract_version())::text, 'UTF8')), 'hex');
  IF v_cur.preference_id IS NOT NULL AND v_cur.digest = v_digest THEN
    RETURN jsonb_build_object('preference_id', v_cur.preference_id, 'composition', v_cur.composition, 'version', v_cur.version, 'supersedes', v_cur.supersedes,
      'density', v_cur.density, 'layout', v_cur.layout, 'contract', v_cur.contract, 'digest', v_cur.digest, 'saved_at', v_cur.saved_at, 'unchanged', true);
  END IF;
  INSERT INTO shell.preferences (preference_id, principal_id, scope, tenant_id, domain_id, composition, version, supersedes, density, layout, contract, digest, correlation_id)
  VALUES (p_preference_id, p_actor, v_scope, p_tenant, p_domain, p_composition, v_version + 1, v_cur.preference_id, p_density, v_layout, shell.layout_contract_version(), v_digest, p_correlation)
  RETURNING * INTO v_row;
  PERFORM shell.ledger(p_tenant, p_domain, p_actor, 'layout_preference', p_preference_id, v_row.version, 'shell.preferences.saved',
                       jsonb_build_object('composition', p_composition, 'density', p_density, 'supersedes', v_cur.preference_id, 'digest', v_digest, 'contract', v_row.contract), p_correlation);
  RETURN jsonb_build_object('preference_id', v_row.preference_id, 'composition', v_row.composition, 'version', v_row.version, 'supersedes', v_row.supersedes,
    'scope', v_row.scope, 'tenant_id', v_row.tenant_id, 'domain_id', v_row.domain_id, 'density', v_row.density, 'layout', v_row.layout,
    'contract', v_row.contract, 'digest', v_row.digest, 'saved_at', v_row.saved_at, 'unchanged', false);
END $$;
REVOKE ALL ON FUNCTION shell.save_preferences(uuid, uuid, uuid, text, int, text, jsonb, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION shell.save_preferences(uuid, uuid, uuid, text, int, text, jsonb, uuid, uuid) TO eye_commit;

-- §LY.3 THE OWN READ ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION shell.preferences_of(p_principal uuid, p_tenant uuid, p_domain uuid, p_composition text, p_history int) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = shell, observation, public, pg_catalog, pg_temp AS $$
DECLARE v_scope text := public.eye_scope(); v_out jsonb;
BEGIN
  IF p_principal IS NULL OR p_principal IS DISTINCT FROM public.eye_principal() THEN
    RAISE EXCEPTION 'layout preference rejected (actor): a principal reads only its own layout preferences' USING ERRCODE = '42501';
  END IF;
  IF v_scope = 'PLATFORM' THEN
    IF p_tenant IS NOT NULL OR p_domain IS NOT NULL THEN
      RAISE EXCEPTION 'layout preference rejected (access): a PLATFORM context reads with no tenant and no domain' USING ERRCODE = '42501';
    END IF;
  ELSIF p_domain IS NULL OR NOT observation.read_scope_ok(p_tenant, p_domain) THEN
    RAISE EXCEPTION 'layout preference rejected (access): a layout preference is read only within the caller''s bound tenant and domain' USING ERRCODE = '42501';
  END IF;
  IF p_composition IS NOT NULL AND p_composition !~ '^[a-z][a-z0-9_.-]{1,80}$' THEN
    RAISE EXCEPTION 'layout preference rejected (composition): a composition is named in lower case' USING ERRCODE = '22023';
  END IF;
  WITH mine AS (
    SELECT s.* FROM shell.preferences s WHERE s.principal_id = p_principal AND (p_composition IS NULL OR s.composition = p_composition)
  ), cur AS (
    SELECT DISTINCT ON (composition) * FROM mine ORDER BY composition, version DESC
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'composition', c.composition,
      'current', jsonb_build_object('preference_id', c.preference_id, 'version', c.version, 'supersedes', c.supersedes, 'density', c.density, 'layout', c.layout,
                                    'contract', c.contract, 'current_contract', c.contract = shell.layout_contract_version(), 'digest', c.digest, 'saved_at', c.saved_at),
      'versions', (SELECT count(*) FROM mine m WHERE m.composition = c.composition),
      'history', (SELECT coalesce(jsonb_agg(jsonb_build_object('preference_id', h.preference_id, 'version', h.version, 'density', h.density, 'digest', h.digest, 'saved_at', h.saved_at) ORDER BY h.version DESC), '[]'::jsonb)
                    FROM (SELECT * FROM mine m WHERE m.composition = c.composition ORDER BY m.version DESC LIMIT greatest(0, least(coalesce(p_history, 5), 50))) h)
    ) ORDER BY c.composition), '[]'::jsonb) INTO v_out FROM cur c;
  RETURN jsonb_build_object('principal_id', p_principal, 'scope', v_scope, 'tenant_id', p_tenant, 'domain_id', p_domain, 'read_at', clock_timestamp(),
    'contract', shell.layout_contract_version(), 'compositions', v_out,
    'claim', 'the principal''s own presentation preferences — density and layout change how things are shown, never what they mean, who may act or what an act does');
END $$;
REVOKE ALL ON FUNCTION shell.preferences_of(uuid, uuid, uuid, text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION shell.preferences_of(uuid, uuid, uuid, text, int) TO eye_app, eye_commit;
