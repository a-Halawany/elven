-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0112 — B33-F: THE DOMAIN-PACKAGE VALIDATION-TO-EFFECT BOUNDARY (the bounded review of 059a314). 0001–0111 are applied and frozen and untouched.
--
-- THE DEFECTS (reproduced through governed paths, phase6-packages-b33f with B33F_REPRO=1: 16/16 asserting the defects through 0111):
--   F1  contract compatibility omitted the requirements OTHER ACTIVE PACKAGES impose — with a consumer active on geopolitical ^1.0.0,
--       geopolitical 2.0.0 (a migration description given) passed the suite, was certified and activated. (TS: conformance.ts adds the
--       reverse requirement; the PORT re-validates it here.)
--   F2  domain.certify_package_version and domain.activate_package_version rested on the SAVED conformance run and section approvals: a
--       source's rights withdrawn or a model quarantined after the run passed did not stop the effect.
--   F3  the same for a REQUIRED package changed (a major version activated) or retired between the dependent's run and its activation.
--   F4  domain.enable_package_function rested on the SAVED passing health run: the cause recurring after it did not stop re-enablement.
--   F5  concurrency: two activations whose dependency checks read each other's state (write skew) both committed; a rights withdrawal in
--       flight was not seen by an activation validating at the same moment.
--
-- THE CORRECTION — at the authoritative boundary (the ports), each copied whole from its live definition (0111 §PK) with the change marked
-- `B33-F`:
--   §1  domain.dpk_satisfies (+ dpk_semver): the TS semver range semantics (semver.ts) in SQL, so the port judges requirements itself.
--   §2  domain.dpk_effect_findings(package, version, lock): the blocking checks whose facts belong to ANOTHER authority, evaluated NOW from
--       the core's own rows — each named source's latest contract (lifecycle, rights, purposes, classification), each forecast method in the
--       effective registry and each behaviour model, the namespace's active ontology, the core ontology (predicates, range), the risk
--       taxonomy in force, and every other active package's release (requires and conflicts, BOTH directions — F1). With lock = true the
--       rows read are locked FOR SHARE (in a fixed order) so a concurrent rights change, contract transition, method quarantine/retirement
--       or ontology supersession either commits before the read (and is seen) or waits for the effect's commit (and is ordered after it).
--       Each finding names its kind and the package functions it makes incompatible (the health evaluation's mapping), so re-enablement
--       judges exactly the functions it re-enables. domain.package_effect_check(package, version) is its READ (no locks; INVOKER).
--   §3  domain.dpk_lifecycle_lock(tenant, domain): ONE transaction-scoped advisory lock per (tenant, domain) package lifecycle, EXCLUSIVE,
--       taken by certify, activate, retire and enable before any read of package state: two effects whose dependency checks read each
--       other's packages serialize (F5 write skew) — the second sees the first committed.
--   §4  certify_package_version and activate_package_version: after the saved run and the section approvals are checked (preserved), the
--       facts are re-validated under the lock — any finding refuses `domain package rejected (stale)` naming the run and the findings. The
--       refusal raises, so the whole write rolls back: no DPG object admitted, no state change, the prior active version untouched.
--   §5  enable_package_function: after the saved passing health run is checked (preserved), each function to re-enable is judged against
--       the CURRENT findings mapped to it, and clearing the conflict against the current ontology / risk-meaning / package findings —
--       `domain package rejected (health): the current facts still find …`.
--   §6  retire_package takes the lifecycle lock (so a dependent's activation never interleaves with its provider's retirement).
--
-- WHAT IS NOT RE-VALIDATED AT THE EFFECT (stated): source COVERAGE (an observation-time measure the run records; the health re-check
-- watches it) and the manifest's own static form (digest-bound — the run measured exactly this manifest). Writers that INSERT a row (a new
-- draft contract version, a builtin method's first adoption row, a new taxonomy activation) cannot be blocked by a row lock; none of them
-- reads package state, so a commit after the effect's read orders after the effect, and the health re-check acts on it.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- §1 SEMANTIC VERSIONS (semver.ts in SQL: `x.y.z`; comparators =, >, >=, <, <=, ^, ~, *; space = AND; `||` = OR; NULL = not well-formed) ─────
CREATE OR REPLACE FUNCTION domain.dpk_semver(p text) RETURNS int[]
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT CASE WHEN btrim(coalesce(p, '')) ~ '^[0-9]+\.[0-9]+\.[0-9]+$' THEN string_to_array(btrim(p), '.')::int[] END
$$;
CREATE OR REPLACE FUNCTION domain.dpk_satisfies(p_version text, p_range text) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
DECLARE v int[] := domain.dpk_semver(p_version); alt text; tok text; m text[]; r int[]; ok boolean; all_ok boolean; any_ok boolean := false;
BEGIN
  IF v IS NULL OR p_range IS NULL THEN RETURN NULL; END IF;
  FOREACH alt IN ARRAY regexp_split_to_array(p_range, '\|\|') LOOP   -- '' is one empty alternative (any), as in semver.ts
    all_ok := true;
    FOR tok IN SELECT t FROM regexp_split_to_table(regexp_replace(alt, '^\s+|\s+$', '', 'g'), '\s+') t WHERE t <> '' LOOP
      IF tok = '*' THEN CONTINUE; END IF;
      m := regexp_match(tok, '^(\^|~|>=|<=|>|<|=)?([0-9]+\.[0-9]+\.[0-9]+)$');
      IF m IS NULL THEN RETURN NULL; END IF;
      r := domain.dpk_semver(m[2]);
      ok := CASE coalesce(m[1], '=')
              WHEN '=' THEN v = r WHEN '>' THEN v > r WHEN '>=' THEN v >= r WHEN '<' THEN v < r WHEN '<=' THEN v <= r
              WHEN '^' THEN v[1] = r[1] AND v >= r WHEN '~' THEN v[1] = r[1] AND v[2] = r[2] AND v >= r END;
      IF NOT ok THEN all_ok := false; END IF;
    END LOOP;
    IF all_ok THEN any_ok := true; END IF;
  END LOOP;
  RETURN any_ok;
END $$;
REVOKE ALL ON FUNCTION domain.dpk_semver(text), domain.dpk_satisfies(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION domain.dpk_semver(text), domain.dpk_satisfies(text, text) TO eye_app, eye_commit;

-- §3 THE LIFECYCLE LOCK ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION domain.dpk_lifecycle_lock(p_tenant uuid, p_domain uuid) RETURNS void
LANGUAGE sql SET search_path = pg_catalog, pg_temp AS $$
  SELECT pg_advisory_xact_lock(hashtextextended('domain.packages.lifecycle:' || p_tenant::text || ':' || p_domain::text, 0))
$$;
REVOKE ALL ON FUNCTION domain.dpk_lifecycle_lock(uuid, uuid) FROM PUBLIC;

-- §2 THE FACTS OF OTHER AUTHORITIES, RE-VALIDATED AT THE EFFECT ────────────────────────────────────────────────────────────────────────────
/* [{check, kind, finding, functions}] — kind ∈ source | purpose | classification | model | ontology | core | risk_meaning | package;
   functions = the package functions the finding makes incompatible (null: the whole package — a package conflict; [] for core and
   classification, which the health evaluation does not map). The texts are conformance.ts's. Empty = the facts hold. */
CREATE OR REPLACE FUNCTION domain.dpk_effect_findings(p_package uuid, p_version int, p_lock boolean) RETURNS jsonb
LANGUAGE plpgsql SET search_path = domain, observation, prediction, graph, twin, pg_catalog, pg_temp AS $$
DECLARE k domain.packages%ROWTYPE; v domain.package_versions%ROWTYPE; m jsonb; out jsonb := '[]'::jsonb; e jsonb; c record; meth record; b record;
        ns record; core record; v_core boolean; tax record; o record; r jsonb; fns jsonb; p text; v_keys text[]; v_refs text[]; v_types text[]; v_preds text[]; ok boolean;
        v_rank jsonb := '{"public": 0, "internal": 1, "confidential": 2, "restricted": 3}'::jsonb;
BEGIN
  SELECT * INTO k FROM domain.packages x WHERE x.package_id = p_package;
  SELECT * INTO v FROM domain.package_versions x WHERE x.package_id = p_package AND x.version = p_version;
  IF k.package_id IS NULL OR v.package_id IS NULL THEN RETURN NULL; END IF;
  m := v.manifest;
  SELECT coalesce(array_agg(DISTINCT s ->> 'source_key'), '{}') INTO v_keys FROM jsonb_array_elements(m -> 'source_set') s;
  SELECT coalesce(array_agg(DISTINCT x ->> 'ref'), '{}') INTO v_refs FROM jsonb_array_elements(m -> 'models') x;
  IF p_lock THEN
    -- the rows other authorities UPDATE when the facts change, locked FOR SHARE in a fixed order (sources, methods, models, ontologies)
    PERFORM 1 FROM observation.source_contracts_current x WHERE x.tenant_id = k.tenant_id AND x.domain_id = k.domain_id AND x.source_key = ANY (v_keys)
      ORDER BY x.source_id, x.contract_version FOR SHARE;
    PERFORM 1 FROM prediction.forecast_methods x WHERE x.tenant_id = k.tenant_id AND x.domain_id = k.domain_id AND x.method_ref = ANY (v_refs) ORDER BY x.method_id FOR SHARE;
    PERFORM 1 FROM twin.behaviour_models x WHERE x.method_ref = ANY (v_refs) ORDER BY x.method_ref FOR SHARE;
    PERFORM 1 FROM graph.ontology_versions x WHERE x.tenant_id = k.tenant_id AND x.domain_id = k.domain_id AND x.state = 'active'
      AND x.namespace IN ('domain', m #>> '{ontology_extension,namespace}') ORDER BY x.version_id FOR SHARE;
  END IF;

  -- SOURCES (source approval, purpose, classification): each named source's LATEST contract, as package_facts reads it
  FOR e IN SELECT * FROM jsonb_array_elements(m -> 'source_set') LOOP
    fns := CASE WHEN jsonb_typeof(e -> 'functions') = 'array' AND jsonb_array_length(e -> 'functions') > 0 THEN e -> 'functions' ELSE '["assess", "event"]'::jsonb END;
    SELECT * INTO c FROM observation.source_contracts_current x WHERE x.tenant_id = k.tenant_id AND x.domain_id = k.domain_id AND x.source_key = e ->> 'source_key'
     ORDER BY x.contract_version DESC LIMIT 1;
    IF NOT FOUND THEN
      out := out || jsonb_build_object('check', 'source_approval', 'kind', 'source', 'functions', fns, 'finding', format('source %s has no contract in this domain', e ->> 'source_key'));
      CONTINUE;
    END IF;
    IF c.lifecycle_state <> 'active' THEN
      out := out || jsonb_build_object('check', 'source_approval', 'kind', 'source', 'functions', fns, 'finding', format('source %s contract v%s is %s, not active', e ->> 'source_key', c.contract_version, c.lifecycle_state));
    END IF;
    IF c.rights_state <> 'confirmed' THEN
      out := out || jsonb_build_object('check', 'source_approval', 'kind', 'source', 'functions', fns, 'finding', format('source %s rights are %s, not confirmed', e ->> 'source_key', c.rights_state));
    END IF;
    FOR p IN SELECT jsonb_array_elements_text(coalesce(e -> 'purposes', '[]'::jsonb)) LOOP
      IF NOT (coalesce(c.purposes, '[]'::jsonb) ? p) THEN
        out := out || jsonb_build_object('check', 'purpose', 'kind', 'purpose', 'functions', fns,
          'finding', format('source %s is used for "%s", which its contract does not permit (%s)', e ->> 'source_key', p, (SELECT string_agg(x, ', ') FROM jsonb_array_elements_text(coalesce(c.purposes, '[]'::jsonb)) x)));
      END IF;
    END LOOP;
    IF coalesce((v_rank ->> c.classification_ceiling)::int, 3) > coalesce((v_rank ->> (m #>> '{controls,classification_ceiling}'))::int, 3) THEN
      out := out || jsonb_build_object('check', 'purpose', 'kind', 'classification', 'functions', '[]'::jsonb,
        'finding', format('source %s is classified %s, above the package''s ceiling %s', e ->> 'source_key', c.classification_ceiling, m #>> '{controls,classification_ceiling}'));
    END IF;
  END LOOP;

  -- MODELS (model approval): each forecast method in the domain's effective registry; each behaviour model registered and pinned
  FOR e IN SELECT * FROM jsonb_array_elements(m -> 'models') LOOP
    IF e ->> 'kind' = 'forecast' THEN
      fns := CASE WHEN jsonb_typeof(e -> 'functions') = 'array' AND jsonb_array_length(e -> 'functions') > 0 THEN e -> 'functions' ELSE '["forecast"]'::jsonb END;
      SELECT * INTO meth FROM prediction.effective_forecast_methods(k.tenant_id, k.domain_id) f WHERE f.method_ref = e ->> 'ref' LIMIT 1;
      IF NOT FOUND THEN
        out := out || jsonb_build_object('check', 'model_approval', 'kind', 'model', 'functions', fns, 'finding', format('forecast method %s is not in this domain''s registry', e ->> 'ref'));
      ELSIF meth.state <> 'approved' THEN
        out := out || jsonb_build_object('check', 'model_approval', 'kind', 'model', 'functions', fns,
          'finding', format('forecast method %s is %s%s', e ->> 'ref', meth.state, CASE WHEN meth.state_reason IS NOT NULL THEN format(' (%s)', meth.state_reason) ELSE '' END));
      END IF;
    ELSE
      fns := CASE WHEN jsonb_typeof(e -> 'functions') = 'array' AND jsonb_array_length(e -> 'functions') > 0 THEN e -> 'functions' ELSE '["scenario"]'::jsonb END;
      SELECT * INTO b FROM twin.behaviour_models x WHERE x.method_ref = e ->> 'ref';
      IF NOT FOUND THEN
        out := out || jsonb_build_object('check', 'model_approval', 'kind', 'model', 'functions', fns, 'finding', format('behaviour model %s is not registered', e ->> 'ref'));
      ELSIF b.implementation_digest IS NULL THEN
        out := out || jsonb_build_object('check', 'model_approval', 'kind', 'model', 'functions', fns, 'finding', format('behaviour model %s has no pinned implementation', e ->> 'ref'));
      END IF;
    END IF;
  END LOOP;

  -- THE NAMESPACE'S ONTOLOGY (the graph's own gate): its active version carries exactly the manifest's mapped core types and predicates
  SELECT * INTO ns FROM graph.ontology_versions x WHERE x.tenant_id = k.tenant_id AND x.domain_id = k.domain_id AND x.namespace = m #>> '{ontology_extension,namespace}' AND x.state = 'active';
  IF NOT FOUND THEN
    out := out || jsonb_build_object('check', 'namespace_ontology', 'kind', 'ontology', 'functions', '["assess", "event"]'::jsonb,
      'finding', format('namespace %s has no active ontology version — the ontology steward decides its proposal first', m #>> '{ontology_extension,namespace}'));
  ELSE
    SELECT coalesce(array_agg(DISTINCT x ->> 'maps_to' ORDER BY x ->> 'maps_to'), '{}') INTO v_types FROM jsonb_array_elements(m #> '{ontology_extension,mappings}') x;
    IF v_types IS DISTINCT FROM (SELECT coalesce(array_agg(DISTINCT t ORDER BY t), '{}') FROM unnest(ns.entity_types) t) THEN
      out := out || jsonb_build_object('check', 'namespace_ontology', 'kind', 'ontology', 'functions', '["assess", "event"]'::jsonb,
        'finding', format('namespace %s — the active ontology v%s admits types %s; the manifest maps onto %s', m #>> '{ontology_extension,namespace}', ns.version,
                          (SELECT string_agg(DISTINCT t, ', ' ORDER BY t) FROM unnest(ns.entity_types) t), array_to_string(v_types, ', ')));
    END IF;
    SELECT coalesce(array_agg(DISTINCT x ->> 'predicate' ORDER BY x ->> 'predicate'), '{}') INTO v_preds FROM jsonb_array_elements(coalesce(m #> '{ontology_extension,predicates}', '[]'::jsonb)) x;
    IF v_preds IS DISTINCT FROM (SELECT coalesce(array_agg(DISTINCT x ->> 'predicate' ORDER BY x ->> 'predicate'), '{}') FROM jsonb_array_elements(ns.predicates) x) THEN
      out := out || jsonb_build_object('check', 'namespace_ontology', 'kind', 'ontology', 'functions', '["assess", "event"]'::jsonb,
        'finding', format('namespace %s — the active ontology v%s holds predicates %s; the manifest declares %s', m #>> '{ontology_extension,namespace}', ns.version,
                          coalesce((SELECT string_agg(DISTINCT x ->> 'predicate', ', ' ORDER BY x ->> 'predicate') FROM jsonb_array_elements(ns.predicates) x), 'none'),
                          coalesce(nullif(array_to_string(v_preds, ', '), ''), 'none')));
    END IF;
  END IF;

  -- THE CORE ONTOLOGY (no core predicate redefined; release.core.ontology satisfied)
  SELECT * INTO core FROM graph.ontology_versions x WHERE x.tenant_id = k.tenant_id AND x.domain_id = k.domain_id AND x.namespace = 'domain' AND x.state = 'active';
  v_core := FOUND;
  IF v_core THEN
    FOR p IN SELECT DISTINCT x ->> 'predicate' FROM jsonb_array_elements(coalesce(m #> '{ontology_extension,predicates}', '[]'::jsonb)) x
              WHERE x ->> 'predicate' IN (SELECT y ->> 'predicate' FROM jsonb_array_elements(core.predicates) y) LOOP
      out := out || jsonb_build_object('check', 'canonical_mapping', 'kind', 'core', 'functions', '[]'::jsonb,
        'finding', format('predicate %s redefines the core''s predicate of that name (the core ontology v%s)', p, core.version));
    END LOOP;
  END IF;
  IF coalesce(m #>> '{release,core,ontology}', '') <> '' THEN
    IF NOT v_core THEN
      out := out || jsonb_build_object('check', 'contract_compatibility', 'kind', 'core', 'functions', '[]'::jsonb,
        'finding', format('release.core.ontology requires %s, but the domain has no active core ontology', m #>> '{release,core,ontology}'));
    ELSE
      ok := domain.dpk_satisfies(core.version || '.0.0', m #>> '{release,core,ontology}');
      IF ok IS NULL THEN
        out := out || jsonb_build_object('check', 'contract_compatibility', 'kind', 'core', 'functions', '[]'::jsonb, 'finding', format('release.core.ontology %s is not a well-formed range', m #>> '{release,core,ontology}'));
      ELSIF NOT ok THEN
        out := out || jsonb_build_object('check', 'contract_compatibility', 'kind', 'core', 'functions', '[]'::jsonb,
          'finding', format('the domain''s core ontology v%s does not satisfy release.core.ontology %s', core.version, m #>> '{release,core,ontology}'));
      END IF;
    END IF;
  END IF;

  -- THE RISK MEANING (each mapped category in the taxonomy in force)
  IF jsonb_array_length(coalesce(m -> 'risk_meaning', '[]'::jsonb)) > 0 THEN
    SELECT t.* INTO tax FROM prediction.risk_taxonomy_current(k.tenant_id, k.domain_id) t WHERE t.taxonomy_id IS NOT NULL;
    IF NOT FOUND THEN
      out := out || jsonb_build_object('check', 'risk_meaning', 'kind', 'risk_meaning', 'functions', '["exposure"]'::jsonb, 'finding', 'the package maps risk meanings, but the domain has no risk taxonomy in force');
    ELSE
      FOR p IN SELECT DISTINCT x ->> 'category_key' FROM jsonb_array_elements(m -> 'risk_meaning') x
                WHERE NOT ((x ->> 'category_key') IN (SELECT y ->> 'key' FROM jsonb_array_elements(tax.categories) y)) LOOP
        out := out || jsonb_build_object('check', 'risk_meaning', 'kind', 'risk_meaning', 'functions', '["exposure"]'::jsonb,
          'finding', format('risk meaning %s is not a category of the taxonomy v%s', p, tax.version));
      END LOOP;
    END IF;
  END IF;

  -- THE OTHER ACTIVE PACKAGES (contract compatibility, both directions — F1: the requirements OTHER packages impose on this one)
  FOR r IN SELECT * FROM jsonb_array_elements(coalesce(m #> '{release,requires}', '[]'::jsonb)) LOOP
    SELECT ov.semver INTO o FROM domain.packages ok2 JOIN domain.package_versions ov ON ov.package_id = ok2.package_id AND ov.state = 'active'
     WHERE ok2.tenant_id = k.tenant_id AND ok2.domain_id = k.domain_id AND ok2.package_id <> k.package_id AND ok2.state = 'declared' AND ok2.package_key = r ->> 'package_key';
    IF NOT FOUND THEN
      out := out || jsonb_build_object('check', 'contract_compatibility', 'kind', 'package', 'functions', NULL,
        'finding', format('requires %s %s, which is not active in this domain', r ->> 'package_key', r ->> 'range'));
    ELSE
      ok := domain.dpk_satisfies(o.semver, r ->> 'range');
      IF ok IS NULL THEN
        out := out || jsonb_build_object('check', 'contract_compatibility', 'kind', 'package', 'functions', NULL, 'finding', format('requires %s with a range that is not well-formed (%s)', r ->> 'package_key', r ->> 'range'));
      ELSIF NOT ok THEN
        out := out || jsonb_build_object('check', 'contract_compatibility', 'kind', 'package', 'functions', NULL,
          'finding', format('requires %s %s; the active version is %s', r ->> 'package_key', r ->> 'range', o.semver));
      END IF;
    END IF;
  END LOOP;
  FOR r IN SELECT * FROM jsonb_array_elements(coalesce(m #> '{release,conflicts}', '[]'::jsonb)) LOOP
    SELECT ov.semver INTO o FROM domain.packages ok2 JOIN domain.package_versions ov ON ov.package_id = ok2.package_id AND ov.state = 'active'
     WHERE ok2.tenant_id = k.tenant_id AND ok2.domain_id = k.domain_id AND ok2.package_id <> k.package_id AND ok2.state = 'declared' AND ok2.package_key = r ->> 'package_key';
    IF FOUND AND domain.dpk_satisfies(o.semver, r ->> 'range') IS TRUE THEN
      out := out || jsonb_build_object('check', 'contract_compatibility', 'kind', 'package', 'functions', NULL,
        'finding', format('conflicts with %s %s, and %s %s is active', r ->> 'package_key', r ->> 'range', r ->> 'package_key', o.semver));
    END IF;
  END LOOP;
  FOR o IN SELECT ok2.package_key, ov.semver, ov.manifest FROM domain.packages ok2 JOIN domain.package_versions ov ON ov.package_id = ok2.package_id AND ov.state = 'active'
            WHERE ok2.tenant_id = k.tenant_id AND ok2.domain_id = k.domain_id AND ok2.package_id <> k.package_id AND ok2.state = 'declared' ORDER BY ok2.package_key LOOP
    FOR r IN SELECT * FROM jsonb_array_elements(coalesce(o.manifest #> '{release,conflicts}', '[]'::jsonb)) x WHERE x ->> 'package_key' = k.package_key LOOP
      IF domain.dpk_satisfies(v.semver, r ->> 'range') IS TRUE THEN
        out := out || jsonb_build_object('check', 'contract_compatibility', 'kind', 'package', 'functions', NULL,
          'finding', format('the active %s %s declares a conflict with %s %s', o.package_key, o.semver, k.package_key, r ->> 'range'));
      END IF;
    END LOOP;
    -- B33-F (F1): the REVERSE requirement — an active package requiring this one with a range this version does not satisfy
    FOR r IN SELECT * FROM jsonb_array_elements(coalesce(o.manifest #> '{release,requires}', '[]'::jsonb)) x WHERE x ->> 'package_key' = k.package_key LOOP
      IF domain.dpk_satisfies(v.semver, r ->> 'range') IS NOT TRUE THEN
        out := out || jsonb_build_object('check', 'contract_compatibility', 'kind', 'package', 'functions', NULL,
          'finding', format('the active %s %s requires %s %s; %s does not satisfy it', o.package_key, o.semver, k.package_key, r ->> 'range', v.semver));
      END IF;
    END LOOP;
  END LOOP;
  RETURN out;
END $$;
REVOKE ALL ON FUNCTION domain.dpk_effect_findings(uuid, int, boolean) FROM PUBLIC;

/* The READ of the effect check (no locks; INVOKER, under the caller's RLS): what certification / activation would refuse on right now. */
CREATE OR REPLACE FUNCTION domain.package_effect_check(p_package uuid, p_version int) RETURNS jsonb
LANGUAGE sql SET search_path = domain, pg_catalog, pg_temp AS $$ SELECT domain.dpk_effect_findings(p_package, p_version, false) $$;
REVOKE ALL ON FUNCTION domain.package_effect_check(uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION domain.dpk_effect_findings(uuid, int, boolean) TO eye_app, eye_commit;   -- p_lock = true needs UPDATE rights the app roles do not hold: only the definer ports lock
GRANT EXECUTE ON FUNCTION domain.package_effect_check(uuid, int) TO eye_app, eye_commit;

-- §4 CERTIFY — copied whole from 0111 §PK.4, B33-F marked ─────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION domain.certify_package_version(p_package uuid, p_tenant uuid, p_domain uuid, p_version int, p_reason text, p_actor uuid, p_correlation uuid)
RETURNS jsonb SECURITY DEFINER SET search_path = domain, executive, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE k domain.packages%ROWTYPE; v domain.package_versions%ROWTYPE; s jsonb; r domain.package_conformance_runs%ROWTYPE; v_open text[]; v_closed jsonb; v_findings jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['domain.package.certify']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM domain.dpk_assert_actor('domain package', p_actor);
  IF domain.dpk_kind(p_actor) IS DISTINCT FROM 'human' OR NOT domain.dpk_human_with(p_actor, p_tenant, p_domain, ARRAY['domain_specialist']) THEN
    RAISE EXCEPTION 'domain package rejected (authority): a version is certified by a named human domain specialist of this domain' USING ERRCODE = '42501';
  END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'domain package rejected (reason): a certification states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  PERFORM domain.dpk_lifecycle_lock(p_tenant, p_domain);   -- B33-F §3: package lifecycle effects of a domain serialize
  k := domain.dpk_package(p_tenant, p_domain, p_package, 'domain package');
  SELECT * INTO v FROM domain.package_versions x WHERE x.package_id = p_package AND x.version = p_version FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'domain package rejected (unknown_version): % has no version %', k.package_key, p_version USING ERRCODE = '23503'; END IF;
  IF v.proposed_by = p_actor THEN RAISE EXCEPTION 'domain package rejected (separation_of_duties): the proposer of version % does not certify it', p_version USING ERRCODE = '42501'; END IF;
  IF v.state <> 'proposed' THEN RAISE EXCEPTION 'domain package rejected (state): version % is %; a proposed version is certified', p_version, v.state USING ERRCODE = '22023'; END IF;
  s := domain.dpk_section_state(p_package, p_version);
  SELECT coalesce(array_agg(key || '=' || (value ->> 'state') ORDER BY key), '{}') INTO v_open FROM jsonb_each(s) WHERE value ->> 'state' <> 'approved';
  IF cardinality(v_open) > 0 THEN
    RAISE EXCEPTION 'domain package rejected (sections): every section is approved at its digest and unexpired before certification (%)', array_to_string(v_open, ', ') USING ERRCODE = '22023';
  END IF;
  SELECT * INTO r FROM domain.package_conformance_runs x WHERE x.package_id = p_package AND x.version = p_version AND x.mode = 'certification' ORDER BY x.ran_at DESC, x.run_id DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'domain package rejected (conformance): version % has no certification run; the conformance suite runs first', p_version USING ERRCODE = '22023'; END IF;
  IF NOT r.passed OR r.manifest_digest <> v.manifest_digest THEN
    RAISE EXCEPTION 'domain package rejected (conformance): the last certification run of version % (%) did not pass (failed: %)', p_version, r.run_id,
      (SELECT string_agg(x ->> 'check', ', ') FROM jsonb_array_elements(r.checks) x WHERE x ->> 'severity' = 'blocking' AND NOT (x ->> 'passed')::boolean) USING ERRCODE = '22023';
  END IF;
  -- B33-F §4: the facts of other authorities re-validated NOW, the rows locked — the saved run is necessary, never sufficient
  v_findings := domain.dpk_effect_findings(p_package, p_version, true);
  IF jsonb_array_length(v_findings) > 0 THEN
    RAISE EXCEPTION 'domain package rejected (stale): the facts the certification run % measured no longer hold — %; the cause is repaired (or a new version proposed) before version % is certified',
      r.run_id, (SELECT string_agg(x ->> 'finding', '; ') FROM jsonb_array_elements(v_findings) x), p_version USING ERRCODE = '22023';
  END IF;
  UPDATE domain.package_versions SET state = 'certified', certified_by = p_actor, certified_at = clock_timestamp() WHERE package_id = p_package AND version = p_version;
  v_closed := executive.b33_close_items(p_tenant, p_domain, 'domain.package', 'domain_package', p_package, format('version %s (%s) certified: %s', p_version, v.semver, btrim(p_reason)), p_actor, p_correlation);
  PERFORM domain.dpk_event(p_tenant, p_domain, p_package, 'version', p_package, p_version, 'version.certified', p_actor,
                           jsonb_build_object('reason', btrim(p_reason), 'run_id', r.run_id, 'sections', s, 'closed_items', v_closed, 'effect_check', 'held'), p_correlation);
  RETURN (SELECT to_jsonb(x) || jsonb_build_object('closed_items', v_closed, 'run_id', r.run_id) FROM domain.package_versions x WHERE x.package_id = p_package AND x.version = p_version);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION domain.certify_package_version(uuid,uuid,uuid,int,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION domain.certify_package_version(uuid,uuid,uuid,int,text,uuid,uuid) TO eye_commit;

-- §4 ACTIVATE — copied whole from 0111 §PK.4, B33-F marked ────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION domain.activate_package_version(p_package uuid, p_tenant uuid, p_domain uuid, p_version int, p_object_version int, p_actor uuid, p_correlation uuid)
RETURNS jsonb SECURITY DEFINER SET search_path = domain, executive, objects, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE k domain.packages%ROWTYPE; v domain.package_versions%ROWTYPE; prior domain.package_versions%ROWTYPE; s jsonb; v_lapsed text[]; m record; v_closed jsonb := '[]'::jsonb;
        v_findings jsonb; v_run uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['domain.package.activate']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM domain.dpk_assert_actor('domain package', p_actor);
  PERFORM domain.dpk_lifecycle_lock(p_tenant, p_domain);   -- B33-F §3: package lifecycle effects of a domain serialize
  k := domain.dpk_package(p_tenant, p_domain, p_package, 'domain package');
  IF p_actor <> k.owner_principal_id OR domain.dpk_kind(p_actor) IS DISTINCT FROM 'human' THEN
    RAISE EXCEPTION 'domain package rejected (ownership): % is activated by its owner (a named human)', k.package_key USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v FROM domain.package_versions x WHERE x.package_id = p_package AND x.version = p_version FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'domain package rejected (unknown_version): % has no version %', k.package_key, p_version USING ERRCODE = '23503'; END IF;
  IF v.state <> 'certified' THEN RAISE EXCEPTION 'domain package rejected (state): version % is %; a certified version is activated', p_version, v.state USING ERRCODE = '22023'; END IF;
  s := domain.dpk_section_state(p_package, p_version);
  SELECT coalesce(array_agg(key ORDER BY key), '{}') INTO v_lapsed FROM jsonb_each(s) WHERE value ->> 'state' <> 'approved';
  IF cardinality(v_lapsed) > 0 THEN
    RAISE EXCEPTION 'domain package rejected (stale): the approval of section(s) % of version % no longer holds; a new version is proposed and certified', array_to_string(v_lapsed, ', '), p_version USING ERRCODE = '22023';
  END IF;
  -- B33-F §4: the facts of other authorities re-validated NOW, the rows locked — certification is necessary, never sufficient
  v_findings := domain.dpk_effect_findings(p_package, p_version, true);
  IF jsonb_array_length(v_findings) > 0 THEN
    SELECT x.run_id INTO v_run FROM domain.package_conformance_runs x WHERE x.package_id = p_package AND x.version = p_version AND x.mode = 'certification' ORDER BY x.ran_at DESC, x.run_id DESC LIMIT 1;
    RAISE EXCEPTION 'domain package rejected (stale): the facts the certification run % measured no longer hold — %; the cause is repaired (or a new version proposed) before version % is activated',
      v_run, (SELECT string_agg(x ->> 'finding', '; ') FROM jsonb_array_elements(v_findings) x), p_version USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM objects.canonical_objects c WHERE c.object_type = 'DPG' AND c.object_id = p_package AND c.object_version = p_object_version AND c.tenant_id = p_tenant
                    AND c.payload ->> 'state' = 'active' AND (c.payload ->> 'version')::int = p_version) THEN
    RAISE EXCEPTION 'domain package rejected (object): the DPG object version % (state active, version %) was not admitted in this write', p_object_version, p_version USING ERRCODE = '22023';
  END IF;
  SELECT * INTO prior FROM domain.package_versions x WHERE x.package_id = p_package AND x.state = 'active' FOR UPDATE;
  IF FOUND THEN
    UPDATE domain.package_versions SET state = 'superseded', superseded_at = clock_timestamp() WHERE package_id = p_package AND version = prior.version;
    PERFORM domain.dpk_event(p_tenant, p_domain, p_package, 'version', p_package, prior.version, 'version.superseded', p_actor, jsonb_build_object('by', p_version), p_correlation);
  END IF;
  UPDATE domain.package_versions SET state = 'active', activated_by = p_actor, activated_at = clock_timestamp(), object_version = p_object_version WHERE package_id = p_package AND version = p_version;
  FOR m IN SELECT * FROM domain.package_migrations x WHERE x.package_id = p_package AND x.state = 'open' FOR UPDATE LOOP
    UPDATE domain.package_migrations SET state = 'completed', to_version = p_version, closed_by = p_actor, closed_at = clock_timestamp(),
           close_reason = format('version %s (%s) activated in place of version %s', p_version, v.semver, m.from_version) WHERE migration_id = m.migration_id;
    v_closed := v_closed || executive.b33_close_items(p_tenant, p_domain, 'domain.package', 'domain_package', m.migration_id, format('migration completed by version %s (%s)', p_version, v.semver), p_actor, p_correlation);
    PERFORM domain.dpk_event(p_tenant, p_domain, p_package, 'migration', m.migration_id, p_version, 'migration.completed', p_actor, jsonb_build_object('to_version', p_version), p_correlation);
  END LOOP;
  PERFORM domain.dpk_event(p_tenant, p_domain, p_package, 'version', p_package, p_version, 'version.activated', p_actor,
                           jsonb_build_object('supersedes', prior.version, 'object_version', p_object_version, 'closed_items', v_closed, 'effect_check', 'held'), p_correlation);
  RETURN (SELECT to_jsonb(x) || jsonb_build_object('supersedes', prior.version, 'closed_items', v_closed) FROM domain.package_versions x WHERE x.package_id = p_package AND x.version = p_version);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION domain.activate_package_version(uuid,uuid,uuid,int,int,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION domain.activate_package_version(uuid,uuid,uuid,int,int,uuid,uuid) TO eye_commit;

-- §6 RETIRE — copied whole from 0111 §PK.4, B33-F marked ──────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION domain.retire_package(p_package uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_correlation uuid)
RETURNS jsonb SECURITY DEFINER SET search_path = domain, executive, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE k domain.packages%ROWTYPE; m record; v_closed jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['domain.package.retire']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM domain.dpk_assert_actor('domain package', p_actor);
  PERFORM domain.dpk_lifecycle_lock(p_tenant, p_domain);   -- B33-F §3: a dependent's activation never interleaves with its provider's retirement
  k := domain.dpk_package(p_tenant, p_domain, p_package, 'domain package');
  IF domain.dpk_kind(p_actor) IS DISTINCT FROM 'human' OR NOT (p_actor = k.owner_principal_id OR domain.dpk_human_with(p_actor, p_tenant, p_domain, ARRAY['domain_admin'])) THEN
    RAISE EXCEPTION 'domain package rejected (ownership): % is retired by its owner or the domain''s administrator', k.package_key USING ERRCODE = '42501';
  END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'domain package rejected (reason): a retirement states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  UPDATE domain.package_versions SET state = 'retired', retired_at = clock_timestamp() WHERE package_id = p_package AND state IN ('proposed', 'certified', 'active');
  v_closed := executive.b33_close_items(p_tenant, p_domain, NULL, 'domain_package', p_package, format('package %s retired: %s', k.package_key, btrim(p_reason)), p_actor, p_correlation);
  FOR m IN SELECT * FROM domain.package_migrations x WHERE x.package_id = p_package AND x.state = 'open' FOR UPDATE LOOP
    UPDATE domain.package_migrations SET state = 'abandoned', closed_by = p_actor, closed_at = clock_timestamp(), close_reason = format('package retired: %s', btrim(p_reason)) WHERE migration_id = m.migration_id;
    v_closed := v_closed || executive.b33_close_items(p_tenant, p_domain, NULL, 'domain_package', m.migration_id, format('package %s retired', k.package_key), p_actor, p_correlation);
  END LOOP;
  UPDATE domain.packages SET state = 'retired', retired_at = clock_timestamp(), retired_by = p_actor, retire_reason = btrim(p_reason) WHERE package_id = p_package;
  PERFORM domain.dpk_event(p_tenant, p_domain, p_package, 'package', p_package, NULL, 'package.retired', p_actor, jsonb_build_object('reason', btrim(p_reason), 'closed_items', v_closed), p_correlation);
  RETURN (SELECT to_jsonb(x) || jsonb_build_object('closed_items', v_closed) FROM domain.packages x WHERE x.package_id = p_package);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION domain.retire_package(uuid,uuid,uuid,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION domain.retire_package(uuid,uuid,uuid,text,uuid,uuid) TO eye_commit;

-- §5 RE-ENABLE — copied whole from 0111 §PK.5, B33-F marked ───────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION domain.enable_package_function(p_package uuid, p_tenant uuid, p_domain uuid, p_version int, p_functions text[], p_clear_conflict boolean, p_reason text, p_actor uuid, p_correlation uuid)
RETURNS jsonb SECURITY DEFINER SET search_path = domain, executive, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE k domain.packages%ROWTYPE; v domain.package_versions%ROWTYPE; last domain.package_conformance_runs%ROWTYPE; fn text; v_disabled jsonb; v_conflict jsonb; m record; v_closed jsonb := '[]'::jsonb;
        v_last_disable jsonb; v_last_conflict jsonb; v_findings jsonb; v_still text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['domain.package.enable']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM domain.dpk_assert_actor('domain package', p_actor);
  IF domain.dpk_kind(p_actor) IS DISTINCT FROM 'human' OR NOT domain.dpk_human_with(p_actor, p_tenant, p_domain, ARRAY['domain_specialist']) THEN
    RAISE EXCEPTION 'domain package rejected (authority): a disabled function is re-enabled by a named human domain specialist' USING ERRCODE = '42501';
  END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'domain package rejected (reason): a re-enablement states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  PERFORM domain.dpk_lifecycle_lock(p_tenant, p_domain);   -- B33-F §3: package lifecycle effects of a domain serialize
  k := domain.dpk_package(p_tenant, p_domain, p_package, 'domain package');
  SELECT * INTO v FROM domain.package_versions x WHERE x.package_id = p_package AND x.version = p_version FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'domain package rejected (unknown_version): % has no version %', k.package_key, p_version USING ERRCODE = '23503'; END IF;
  IF v.state <> 'active' THEN RAISE EXCEPTION 'domain package rejected (state): version % is %', p_version, v.state USING ERRCODE = '22023'; END IF;
  IF coalesce(cardinality(p_functions), 0) = 0 AND NOT coalesce(p_clear_conflict, false) THEN
    RAISE EXCEPTION 'domain package rejected (functions): name the function(s) to re-enable or clear the conflict' USING ERRCODE = '22023';
  END IF;
  FOREACH fn IN ARRAY coalesce(p_functions, '{}') LOOP
    IF NOT (v.disabled_functions ? fn) THEN RAISE EXCEPTION 'domain package rejected (state): function % of version % is not disabled', fn, p_version USING ERRCODE = '22023'; END IF;
  END LOOP;
  IF coalesce(p_clear_conflict, false) AND v.conflict IS NULL THEN RAISE EXCEPTION 'domain package rejected (state): version % carries no conflict', p_version USING ERRCODE = '22023'; END IF;
  SELECT * INTO last FROM domain.package_conformance_runs x WHERE x.package_id = p_package AND x.version = p_version AND x.mode = 'health' ORDER BY x.ran_at DESC, x.run_id DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'domain package rejected (health): no health run of version % is recorded; re-run the health check first', p_version USING ERRCODE = '22023'; END IF;
  SELECT f -> 'findings' -> 0 -> 'disable', f -> 'findings' -> 0 -> 'conflict' INTO v_last_disable, v_last_conflict FROM jsonb_array_elements(last.checks) f WHERE f ->> 'check' = 'faults';
  FOREACH fn IN ARRAY coalesce(p_functions, '{}') LOOP
    IF last.ran_at <= ((v.disabled_functions -> fn ->> 'disabled_at')::timestamptz) OR coalesce(v_last_disable, '{}'::jsonb) ? fn THEN
      RAISE EXCEPTION 'domain package rejected (health): the last health run (%) still finds function % incompatible, or ran before it was disabled — the cause is repaired and the re-run passes first', last.run_id, fn USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF coalesce(p_clear_conflict, false) AND (last.ran_at <= (v.conflict ->> 'exposed_at')::timestamptz OR (v_last_conflict IS NOT NULL AND v_last_conflict <> 'null'::jsonb)) THEN
    RAISE EXCEPTION 'domain package rejected (health): the last health run (%) still finds the conflict, or ran before it was exposed', last.run_id USING ERRCODE = '22023';
  END IF;
  -- B33-F §5: the passing run is necessary, never sufficient — each function judged against the CURRENT facts mapped to it (the rows locked)
  v_findings := domain.dpk_effect_findings(p_package, p_version, true);
  FOREACH fn IN ARRAY coalesce(p_functions, '{}') LOOP
    SELECT string_agg(x ->> 'finding', '; ') INTO v_still FROM jsonb_array_elements(v_findings) x
     WHERE x ->> 'kind' IN ('source', 'purpose', 'model') AND (x -> 'functions') ? fn;
    IF v_still IS NOT NULL THEN
      RAISE EXCEPTION 'domain package rejected (health): the current facts still find function % incompatible: % — the cause is repaired first (the last health run % passed before it recurred)', fn, v_still, last.run_id USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF coalesce(p_clear_conflict, false) THEN
    SELECT string_agg(x ->> 'finding', '; ') INTO v_still FROM jsonb_array_elements(v_findings) x WHERE x ->> 'kind' IN ('ontology', 'risk_meaning', 'package');
    IF v_still IS NOT NULL THEN
      RAISE EXCEPTION 'domain package rejected (health): the current facts still find the conflict: % — the cause is repaired first (the last health run % passed before it recurred)', v_still, last.run_id USING ERRCODE = '22023';
    END IF;
  END IF;
  v_disabled := v.disabled_functions;
  FOREACH fn IN ARRAY coalesce(p_functions, '{}') LOOP v_disabled := v_disabled - fn; END LOOP;
  v_conflict := CASE WHEN coalesce(p_clear_conflict, false) THEN NULL ELSE v.conflict END;
  UPDATE domain.package_versions SET disabled_functions = v_disabled, conflict = v_conflict WHERE package_id = p_package AND version = p_version;
  PERFORM domain.dpk_event(p_tenant, p_domain, p_package, 'version', p_package, p_version, 'function.enabled', p_actor,
                           jsonb_build_object('functions', to_jsonb(coalesce(p_functions, '{}')), 'conflict_cleared', coalesce(p_clear_conflict, false), 'run_id', last.run_id, 'reason', btrim(p_reason),
                                              'effect_check', 'held'), p_correlation);
  IF v_disabled = '{}'::jsonb AND v_conflict IS NULL THEN
    FOR m IN SELECT * FROM domain.package_migrations x WHERE x.package_id = p_package AND x.state = 'open' FOR UPDATE LOOP
      UPDATE domain.package_migrations SET state = 'completed', to_version = p_version, closed_by = p_actor, closed_at = clock_timestamp(),
             close_reason = format('re-enabled by a domain specialist after the passing health run %s: %s', last.run_id, btrim(p_reason)) WHERE migration_id = m.migration_id;
      v_closed := v_closed || executive.b33_close_items(p_tenant, p_domain, 'domain.package', 'domain_package', m.migration_id, format('re-enabled after the passing health run: %s', btrim(p_reason)), p_actor, p_correlation);
      PERFORM domain.dpk_event(p_tenant, p_domain, p_package, 'migration', m.migration_id, p_version, 'migration.completed', p_actor, jsonb_build_object('re_enabled', true), p_correlation);
    END LOOP;
  END IF;
  RETURN jsonb_build_object('disabled_functions', v_disabled, 'conflict', v_conflict, 'run_id', last.run_id, 'closed_items', v_closed);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION domain.enable_package_function(uuid,uuid,uuid,int,text[],boolean,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION domain.enable_package_function(uuid,uuid,uuid,int,text[],boolean,text,uuid,uuid) TO eye_commit;
