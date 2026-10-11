-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0113 §MD — CP-6 B92: METRIC DEFINITIONS, PURPOSES, SCOPES, USES, THE CATALOG (rows PR-70-002, PR-70-003, CAP-DL-11, V01-T-040; the residual
-- DP-44-005; ES-40-008's governance — residual R1, §B36.12 row 9). Part-local: applies ALONE on top of 0001–0112 and the 0113 prelude. Prefix amd_.
-- Re-declares exactly ONE function: products.metric_withdraw (copied WHOLE from its last definition, 0095:2731 — no later migration re-declares
-- it; the change marked `-- B92 md`).
--
-- WHAT IS BUILT (SOFTWARE CAPABILITY; every harness row is SYNTHETIC, a synthetic demonstration never closes a clause that needs the real
-- integration, and the signed acceptance of the catalog is R2's):
--   §MD.1 helpers — the acting principal, the human/role tests, the ledger write, the performance-purpose word test, the App M owner-role map,
--         the canonical CONTRACT of a definition (the digest the approver sees and the field-level diff are both computed over it).
--   §MD.2 THE PURPOSE REGISTER's ports — propose (analyst | owner, a named human), decide (a named privacy officer, never the proposer, digest-bound,
--         reason 8+), retire (the privacy officer). A performance / employee-scoring purpose is refused `analytics purpose rejected (person)`.
--   §MD.3 THE SCOPE REGISTER's ports — propose, decide (a named product analytics owner ≠ proposer), retire; every entity a graph entity of the
--         domain, every objective an OBJ strategy object, every series registered — re-validated at the decision (the B33-F boundary lesson).
--   §MD.4 THE DEFINITIONS' ports — propose (a HUMAN analyst or owner; an agent is refused at the port: AI computes and proposes findings, a definition
--         is a human's proposal), decide (approve | reject at the digest seen; the owner ≠ proposer; the whole contract RE-VALIDATED; approval
--         supersedes the prior approved version), retire (lists the uses of every version's results in the retirement event; refuses nothing).
--   §MD.5 THE USES LEDGER's port (analytics.use.record) and ES-40-008's constraint: an indeterminate or unsupported result is cited in a briefing
--         or a publication ONLY with an explicit qualification that says so.
--   §MD.6 DP-44-005 — products.metric_serving_uses + products.record_metric_serving_use (products.metric.use), and the withdrawal step lists them.
--   §MD.7 the reads (INVOKER): the definition diff.
-- THE CATALOG (CAP-DL-11): products.catalogue_asset (0095:927) admits the kinds schema | field | source | product | staging | external — none is a
-- governed analytics definition, its registry kinds are walked by B90's reconciliation, and it asserts its OWN bound action (a data steward's
-- act), so it is NOT called from a definition's approval (that would force it). The catalog VIEW is analytics' own read (the approved
-- definitions with their latest results per period); a data steward MAY catalogue a definition through B90's own route as kind `external`, ref
-- `analytics:<metric_key>` — the read shows that entry when present. The integrator decides whether a `metric_definition` catalog kind is added.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- §MD.1 HELPERS (internal; no runtime grant) ─────────────────────────────────────────────────────────────────────────────────────────────────
/* The acting principal is the one recorded. */
CREATE OR REPLACE FUNCTION analytics.amd_assert_actor(p_noun text, p_actor uuid) RETURNS void
LANGUAGE plpgsql SET search_path = analytics, pg_catalog, pg_temp AS $$
BEGIN
  IF p_actor IS NULL OR p_actor IS DISTINCT FROM public.eye_principal() THEN
    RAISE EXCEPTION '% rejected (actor): the act is recorded under the acting principal', p_noun USING ERRCODE = '42501';
  END IF;
END $$;
REVOKE ALL ON FUNCTION analytics.amd_assert_actor(text, uuid) FROM PUBLIC;

/* The kind of an ACTIVE principal (human | agent | workload | system), NULL otherwise. */
CREATE OR REPLACE FUNCTION analytics.amd_kind(p_principal uuid) RETURNS text
STABLE SECURITY DEFINER SET search_path = identity, pg_catalog, pg_temp AS $$
  SELECT p.kind FROM identity.principals p WHERE p.id = p_principal AND p.status = 'active'
$$ LANGUAGE sql;
REVOKE ALL ON FUNCTION analytics.amd_kind(uuid) FROM PUBLIC;

/* A named, active HUMAN of the tenant holding one of the roles in the domain (or at the tenant). */
CREATE OR REPLACE FUNCTION analytics.amd_human_with(p_principal uuid, p_tenant uuid, p_domain uuid, p_roles text[]) RETURNS boolean
STABLE SECURITY DEFINER SET search_path = identity, pg_catalog, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM identity.role_bindings b JOIN identity.principals p ON p.id = b.principal_id
                  WHERE b.principal_id = p_principal AND p.kind = 'human' AND p.status = 'active' AND b.revoked_at IS NULL
                    AND b.role_code = ANY (p_roles) AND b.tenant_id = p_tenant
                    AND ((b.scope = 'DOMAIN' AND b.domain_id = p_domain) OR b.scope = 'TENANT'))
$$ LANGUAGE sql;
REVOKE ALL ON FUNCTION analytics.amd_human_with(uuid, uuid, uuid, text[]) FROM PUBLIC;

/* The act's HUMAN test in one place: an agent (or any non-human) is refused `(actor)`; a human without one of the roles `(authority)`. */
CREATE OR REPLACE FUNCTION analytics.amd_assert_human(p_noun text, p_actor uuid, p_tenant uuid, p_domain uuid, p_roles text[], p_what text) RETURNS void
LANGUAGE plpgsql SET search_path = analytics, pg_catalog, pg_temp AS $$
BEGIN
  IF analytics.amd_kind(p_actor) IS DISTINCT FROM 'human' THEN
    RAISE EXCEPTION '% rejected (actor): % is a named human''s act; an agent or a system never performs it (AI may compute and propose findings, never this)', p_noun, p_what USING ERRCODE = '42501';
  END IF;
  IF NOT analytics.amd_human_with(p_actor, p_tenant, p_domain, p_roles) THEN
    RAISE EXCEPTION '% rejected (authority): % is the act of a %', p_noun, p_what, array_to_string(p_roles, ' or ') USING ERRCODE = '42501';
  END IF;
END $$;
REVOKE ALL ON FUNCTION analytics.amd_assert_human(text, uuid, uuid, uuid, text[], text) FROM PUBLIC;

/* A reason of 8+ characters. */
CREATE OR REPLACE FUNCTION analytics.amd_assert_reason(p_noun text, p_reason text, p_what text) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION '% rejected (reason): % states its reason (8+ characters)', p_noun, p_what USING ERRCODE = '22023'; END IF;
  RETURN btrim(p_reason);
END $$;
REVOKE ALL ON FUNCTION analytics.amd_assert_reason(text, text, text) FROM PUBLIC;

/* The definitions' ledger (analytics.definition_events, the prelude's). */
CREATE OR REPLACE FUNCTION analytics.amd_event(p_tenant uuid, p_domain uuid, p_kind text, p_subject uuid, p_key text, p_version int, p_event text, p_actor uuid, p_details jsonb, p_correlation uuid) RETURNS void
LANGUAGE sql SET search_path = analytics, pg_catalog, pg_temp AS $$
  INSERT INTO analytics.definition_events (event_id, scope, tenant_id, domain_id, subject_kind, subject_id, subject_key, version, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_kind, p_subject, p_key, p_version, p_event, p_actor, coalesce(p_details, '{}'::jsonb), p_correlation)
$$;
REVOKE ALL ON FUNCTION analytics.amd_event(uuid, uuid, text, uuid, text, int, text, uuid, jsonb, uuid) FROM PUBLIC;

/* THE PERFORMANCE-PURPOSE TEST (PR-70-003, App M header "none authorizes surveillance, employee scoring…"): the phrases that STATE a purpose of
   evaluating, scoring, ranking or watching people. A phrase NEGATED earlier in its own clause ("never for employee performance, ranking or
   surveillance", "no ranking of staff") is a disclaimer, not a purpose, and passes; a clause ends at . ; : ! ? or a dash between words. The text
   is lower-cased and its hyphens / underscores / slashes read as spaces. */
CREATE OR REPLACE FUNCTION analytics.performance_purpose_terms() RETURNS text[]
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT ARRAY['performance review', 'performance evaluation', 'performance appraisal', 'performance management', 'employee performance', 'staff performance',
               'individual performance', 'worker performance', 'personal performance', 'employee scoring', 'employee score', 'scoring employees', 'score employees',
               'scoring staff', 'score staff', 'productivity scoring', 'productivity score', 'ranking staff', 'rank staff', 'ranking employees', 'rank employees',
               'employee ranking', 'staff ranking', 'monitor employees', 'monitoring employees', 'track employees', 'tracking employees', 'employee surveillance',
               'surveillance of staff', 'surveil', 'disciplinary', 'appraisal of staff', 'appraise employees'] $$;
GRANT EXECUTE ON FUNCTION analytics.performance_purpose_terms() TO eye_app, eye_commit;
CREATE OR REPLACE FUNCTION analytics.states_performance_purpose(p_text text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  WITH t AS (SELECT regexp_replace(lower(coalesce(p_text, '')), '[.;:!?—–]|\s-+\s', '|', 'g') AS s),
       c AS (SELECT regexp_replace(regexp_replace(x, '[-_/]+', ' ', 'g'), '\s+', ' ', 'g') AS clause FROM t, regexp_split_to_table(t.s, '\|') x)
  SELECT (SELECT term FROM unnest(analytics.performance_purpose_terms()) term, c
           WHERE position(term IN c.clause) > 0
             AND NOT (substr(c.clause, 1, position(term IN c.clause) - 1) ~ '\m(no|not|never|without|nor|excluding|excludes)\M')
           ORDER BY length(term) DESC LIMIT 1)
$$;
GRANT EXECUTE ON FUNCTION analytics.states_performance_purpose(text) TO eye_app, eye_commit;

/* APP M's OWNER COLUMN → the role of this product that holds it (CAP-DL-11's "Chief Product Officer" → product_analytics_owner, stated). A
   definition's named owner is a human holding product_analytics_owner, or the role its App M owner maps to (a role code itself is accepted).
   Every mapped role is a HUMAN role (no agent, no subscriber). */
CREATE OR REPLACE FUNCTION analytics.owner_role_map() RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$ SELECT '{
  "chief product officer": "product_analytics_owner", "product analytics owner": "product_analytics_owner", "research product owner": "product_analytics_owner",
  "accessibility owner": "product_analytics_owner", "product authority": "product_analytics_owner",
  "executive product owner": "executive", "customer sponsor": "executive", "executive operator": "executive_operator",
  "decision product owner": "decision_owner", "strategy authority": "strategy_owner",
  "governance": "auditor", "trust authority": "auditor", "ai governance": "auditor", "agent governance": "auditor",
  "data product owner": "data_steward", "data authority": "data_steward", "correction owner": "data_steward",
  "knowledge authority": "knowledge_owner", "retrieval owner": "knowledge_owner", "memory owner": "knowledge_owner", "graph owner": "ontology_steward",
  "collection owner": "collection_manager", "observation operations": "collection_manager",
  "foresight owner": "forecast_owner", "forecast owner": "forecast_owner", "scenario owner": "forecast_owner", "simulation owner": "method_steward",
  "warning owner": "risk_owner", "risk owner": "risk_owner", "twin owner": "twin_owner",
  "agent owner": "domain_admin", "service owner": "domain_admin", "recovery authority": "domain_admin", "implementation owner": "tenant_admin"
}'::jsonb $$;
GRANT EXECUTE ON FUNCTION analytics.owner_role_map() TO eye_app, eye_commit;
/* The role an owner-role text names: the map's, or the text itself when it is a human role code of this product; NULL otherwise. */
CREATE OR REPLACE FUNCTION analytics.amd_owner_role(p_owner_role text) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = identity, analytics, pg_catalog, pg_temp AS $$
  SELECT coalesce(analytics.owner_role_map() ->> lower(btrim(coalesce(p_owner_role, ''))),
                  (SELECT r.code FROM identity.roles r WHERE r.code = btrim(coalesce(p_owner_role, '')) AND r.code !~ '(_agent|_subscriber)$'))
$$;
REVOKE ALL ON FUNCTION analytics.amd_owner_role(text) FROM PUBLIC;

/* THE CANONICAL CONTRACT of a definition (D2): exactly the fields App M's Contract control names plus the computation binding — never the
   version, state or decision. Built from a row (to_jsonb(d)) or from the propose port's validated values; the digest the approver sees is
   analytics.digest(contract); the diff compares two contracts key by key. Arrays of names are sorted (order carries no meaning). */
CREATE OR REPLACE FUNCTION analytics.definition_contract(p jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = analytics, pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object(
    'metric_key', p -> 'metric_key', 'title', p -> 'title', 'meaning', p -> 'meaning', 'kind', p -> 'kind', 'unit', p -> 'unit', 'direction', p -> 'direction',
    'population', coalesce(p -> 'population', '{}'::jsonb), 'numerator', p -> 'numerator', 'denominator', p -> 'denominator',
    'exclusions', coalesce(p -> 'exclusions', '[]'::jsonb), 'window', coalesce(p -> 'window_spec', '{}'::jsonb),
    'dimensions', coalesce((SELECT jsonb_agg(x ORDER BY x) FROM jsonb_array_elements_text(coalesce(p -> 'dimensions', '[]'::jsonb)) x), '[]'::jsonb),
    'privacy_class', p -> 'privacy_class', 'k_min', p -> 'k_min', 'floor_n', p -> 'floor_n', 'threshold', coalesce(p -> 'threshold', '{}'::jsonb),
    'purpose_key', p -> 'purpose_key', 'serves', coalesce(p -> 'serves', '{}'::jsonb), 'cadence', p -> 'cadence', 'owner_principal_id', p -> 'owner_principal_id',
    'action', p -> 'action', 'retirement', p -> 'retirement', 'quality', coalesce(p -> 'quality', '{}'::jsonb), 'cost_allocation', coalesce(p -> 'cost_allocation', '{}'::jsonb),
    'computation_key', p -> 'computation_key', 'params', coalesce(p -> 'params', '{}'::jsonb), 'supported', p -> 'supported', 'unsupported_reason', p -> 'unsupported_reason',
    'source_refs', coalesce((SELECT jsonb_agg(x ORDER BY x) FROM jsonb_array_elements_text(coalesce(p -> 'source_refs', '[]'::jsonb)) x), '[]'::jsonb))
$$;
GRANT EXECUTE ON FUNCTION analytics.definition_contract(jsonb) TO eye_app, eye_commit;
/* THE FIELD-LEVEL DIFF of two contracts (rows or contracts): [{field, from, to}] for every contract field that differs, in field order. */
CREATE OR REPLACE FUNCTION analytics.definition_diff_of(p_from jsonb, p_to jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = analytics, pg_catalog, pg_temp AS $$
  WITH a AS (SELECT analytics.definition_contract(p_from) c), b AS (SELECT analytics.definition_contract(p_to) c)
  SELECT coalesce(jsonb_agg(jsonb_build_object('field', k, 'from', a.c -> k, 'to', b.c -> k) ORDER BY k), '[]'::jsonb)
    FROM a, b, jsonb_object_keys(b.c) k WHERE (a.c -> k) IS DISTINCT FROM (b.c -> k)
$$;
GRANT EXECUTE ON FUNCTION analytics.definition_diff_of(jsonb, jsonb) TO eye_app, eye_commit;

/* An APPROVED purpose of the domain by key (the register's current approved version), or NULL. */
CREATE OR REPLACE FUNCTION analytics.amd_purpose(p_tenant uuid, p_domain uuid, p_key text) RETURNS analytics.purposes
LANGUAGE sql STABLE SET search_path = analytics, pg_catalog, pg_temp AS $$
  SELECT * FROM analytics.purposes x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.purpose_key = p_key AND x.state = 'approved'
$$;
REVOKE ALL ON FUNCTION analytics.amd_purpose(uuid, uuid, text) FROM PUBLIC;

/* THE CONTRACT'S VALIDATION (PR-70-002/-003, V01-T-040, D2/D4): the whole contract, refused in the class form `metric definition rejected (…)`.
   Called by the propose port and AGAIN by the decide port (what was valid when proposed — an approved purpose, a registered computation of the
   same kind and dimensions, an owner holding the role, a live objective — is re-validated at the approval). Returns the normalised row values. */
CREATE OR REPLACE FUNCTION analytics.amd_validate_contract(p_tenant uuid, p_domain uuid, c jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = analytics, graph, decision, executive, pg_catalog, pg_temp AS $$
DECLARE bad text; reg analytics.computation_registry%ROWTYPE; pu analytics.purposes%ROWTYPE; v_dims text[]; v_person text[]; v_obj text; v_role text;
        v_supported boolean; v_owner uuid; e jsonb; v_term text;
BEGIN
  IF c IS NULL OR jsonb_typeof(c) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'metric definition rejected (contract): the contract is an object' USING ERRCODE = '22023'; END IF;
  bad := CASE
    WHEN coalesce(c ->> 'metric_key', '') !~ '^[A-Z][A-Z0-9]{1,9}-[A-Za-z0-9.-]{1,40}$' THEN 'metric_key is of the form MET-001 / V1-decision-cycle / ES40-commitment-visibility'
    WHEN length(btrim(coalesce(c ->> 'title', ''))) NOT BETWEEN 4 AND 200 THEN 'title has 4–200 characters'
    WHEN length(btrim(coalesce(c ->> 'meaning', ''))) NOT BETWEEN 8 AND 2000 THEN 'meaning states the measured meaning (8–2000 characters)'
    WHEN coalesce(c ->> 'kind', '') NOT IN ('rate', 'duration', 'ratio', 'count', 'score') THEN 'kind is rate, duration, ratio, count or score'
    WHEN length(btrim(coalesce(c ->> 'unit', ''))) NOT BETWEEN 1 AND 40 THEN 'unit is named (1–40 characters)'
    WHEN coalesce(c ->> 'direction', '') NOT IN ('higher', 'lower', 'band', 'track') THEN 'direction is higher, lower, band or track'
    WHEN jsonb_typeof(c -> 'population') IS DISTINCT FROM 'object' OR length(btrim(coalesce(c #>> '{population,subject}', ''))) < 3 THEN 'population is an object naming its subject (and its inclusion)'
    WHEN c ->> 'kind' = 'rate' AND (length(btrim(coalesce(c ->> 'numerator', ''))) < 3 OR length(btrim(coalesce(c ->> 'denominator', ''))) < 3) THEN 'a rate states its numerator and its denominator'
    WHEN jsonb_typeof(c -> 'exclusions') IS DISTINCT FROM 'array' THEN 'exclusions is a list of {rule, reason}'
    WHEN jsonb_typeof(c -> 'window_spec') IS DISTINCT FROM 'object' OR coalesce(c #>> '{window_spec,kind}', '') NOT IN ('calendar_quarter', 'calendar_month', 'rolling_days') THEN 'window.kind is calendar_quarter, calendar_month or rolling_days'
    WHEN coalesce(c #>> '{window_spec,clock}', '') NOT IN ('record', 'world') THEN 'window.clock is record (when the product recorded it) or world (the subject''s own time) — stated, never assumed'
    WHEN c #>> '{window_spec,kind}' = 'rolling_days' AND (jsonb_typeof(c #> '{window_spec,days}') IS DISTINCT FROM 'number' OR (c #>> '{window_spec,days}')::numeric NOT BETWEEN 1 AND 3660) THEN 'a rolling window states its days (1–3660)'
    WHEN jsonb_typeof(c -> 'dimensions') IS DISTINCT FROM 'array' THEN 'dimensions is a list of names'
    WHEN coalesce(c ->> 'privacy_class', '') NOT IN ('aggregate', 'pseudonymous_cohort') THEN 'privacy_class is aggregate or pseudonymous_cohort'
    WHEN jsonb_typeof(c -> 'k_min') IS DISTINCT FROM 'number' OR (c ->> 'k_min')::numeric < 5 OR (c ->> 'k_min')::numeric <> floor((c ->> 'k_min')::numeric) THEN 'k_min is a whole number of at least 5'
    WHEN jsonb_typeof(c -> 'floor_n') IS DISTINCT FROM 'number' OR (c ->> 'floor_n')::numeric < 1 OR (c ->> 'floor_n')::numeric <> floor((c ->> 'floor_n')::numeric) THEN 'floor_n (the minimum n for a determinate value) is a whole number of at least 1'
    WHEN length(btrim(coalesce(c ->> 'cadence', ''))) NOT BETWEEN 3 AND 60 THEN 'cadence is named (3–60 characters)'
    WHEN length(btrim(coalesce(c ->> 'retirement', ''))) < 8 THEN 'retirement states the condition the metric is retired on (8+ characters)'
    WHEN jsonb_typeof(c -> 'quality') IS DISTINCT FROM 'object' OR jsonb_typeof(c -> 'cost_allocation') IS DISTINCT FROM 'object' OR jsonb_typeof(c -> 'params') IS DISTINCT FROM 'object' THEN 'quality, cost_allocation and params are objects'
    WHEN jsonb_typeof(c -> 'source_refs') IS DISTINCT FROM 'array' THEN 'source_refs lists the App M / V1 / ES rows the contract answers'
  END;
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'metric definition rejected (contract): %', bad USING ERRCODE = '22023'; END IF;
  FOR e IN SELECT * FROM jsonb_array_elements(c -> 'exclusions') LOOP
    IF jsonb_typeof(e) IS DISTINCT FROM 'object' OR length(btrim(coalesce(e ->> 'rule', ''))) < 3 OR length(btrim(coalesce(e ->> 'reason', ''))) < 4 THEN
      RAISE EXCEPTION 'metric definition rejected (contract): every exclusion is {rule, reason} (got %)', left(e::text, 200) USING ERRCODE = '22023';
    END IF;
  END LOOP;
  -- THE ACTION: a breach opens a REVIEW or an investigation — never an automatic or punitive decision (App M Action control)
  IF length(btrim(coalesce(c ->> 'action', ''))) < 8 OR (c ->> 'action') !~* '(review|investigat)' THEN
    RAISE EXCEPTION 'metric definition rejected (action): the breach action names the review or investigation workflow it opens (a threshold creates a review, never an automatic or punitive decision)' USING ERRCODE = '22023';
  END IF;
  -- THE DIMENSIONS: never a person (403), each one the computation's (422)
  SELECT coalesce(array_agg(DISTINCT x ORDER BY x), '{}') INTO v_dims FROM jsonb_array_elements_text(c -> 'dimensions') x;
  v_person := ARRAY(SELECT x FROM unnest(v_dims) x WHERE x = ANY (analytics.person_dimensions()) OR x ~* '(^|_)(employee|person|people|principal|user|actor|owner|assignee|reviewer|approver|staff|worker)s?(_|$)');
  IF cardinality(v_person) > 0 THEN
    RAISE EXCEPTION 'metric definition rejected (person): the dimension(s) % name a person — a product metric is never grouped by a person (no employee-performance inference; role cohorts only, above k)', array_to_string(v_person, ', ') USING ERRCODE = '42501';
  END IF;
  -- THE PURPOSE: an APPROVED purpose of the register
  pu := analytics.amd_purpose(p_tenant, p_domain, c ->> 'purpose_key');
  IF pu.purpose_id IS NULL THEN
    RAISE EXCEPTION 'metric definition rejected (purpose): % is not an approved purpose of this domain — a privacy officer approves the purpose first', coalesce(c ->> 'purpose_key', '<none>') USING ERRCODE = '22023';
  END IF;
  v_term := analytics.states_performance_purpose((c ->> 'title') || ' ' || (c ->> 'meaning'));
  IF v_term IS NOT NULL THEN
    RAISE EXCEPTION 'metric definition rejected (person): the definition states a purpose of evaluating people ("%") — no employee-performance inference', v_term USING ERRCODE = '42501';
  END IF;
  -- THE PRIVACY CLASS: pseudonymous cohorts only with k ≥ 5 and a product-improvement purpose
  IF c ->> 'privacy_class' = 'pseudonymous_cohort' AND pu.purpose_kind <> 'product_improvement' THEN
    RAISE EXCEPTION 'metric definition rejected (privacy): a pseudonymous cohort metric serves a product-improvement purpose only (% is %)', pu.purpose_key, pu.purpose_kind USING ERRCODE = '22023';
  END IF;
  -- THE COMPUTATION: supported ⇔ a registered computation of the same kind; its dimensions ⊇ the definition's
  v_supported := coalesce(c ->> 'computation_key', '') <> '';
  IF v_supported THEN
    SELECT * INTO reg FROM analytics.computation_registry r WHERE r.computation_key = c ->> 'computation_key';
    IF NOT FOUND THEN RAISE EXCEPTION 'metric definition rejected (unknown_computation): % is not a registered computation', c ->> 'computation_key' USING ERRCODE = '23503'; END IF;
    IF reg.kind <> c ->> 'kind' THEN
      RAISE EXCEPTION 'metric definition rejected (kind): the definition is a %, the computation % computes a %', c ->> 'kind', reg.computation_key, reg.kind USING ERRCODE = '22023';
    END IF;
    IF NOT (v_dims <@ reg.dimensions) THEN
      RAISE EXCEPTION 'metric definition rejected (dimension): the dimension(s) % are outside the computation''s (%)', array_to_string(ARRAY(SELECT x FROM unnest(v_dims) x WHERE NOT (x = ANY (reg.dimensions))), ', '),
        coalesce(nullif(array_to_string(reg.dimensions, ', '), ''), 'none') USING ERRCODE = '22023';
    END IF;
    IF c ? 'unsupported_reason' AND jsonb_typeof(c -> 'unsupported_reason') = 'string' AND btrim(c ->> 'unsupported_reason') <> '' THEN
      RAISE EXCEPTION 'metric definition rejected (unsupported): a definition with a computation is supported; it states no unsupported reason' USING ERRCODE = '22023';
    END IF;
  ELSE
    IF length(btrim(coalesce(c ->> 'unsupported_reason', ''))) < 8 THEN
      RAISE EXCEPTION 'metric definition rejected (unsupported): a definition with no computation states why the product cannot compute it and its carrier (8+ characters) — it is served unsupported, never silently missing' USING ERRCODE = '22023';
    END IF;
    IF cardinality(v_dims) > 0 THEN
      RAISE EXCEPTION 'metric definition rejected (dimension): an unsupported definition has no computation, so no cohort dimension (got %)', array_to_string(v_dims, ', ') USING ERRCODE = '22023';
    END IF;
  END IF;
  -- THE THRESHOLD: {} | {target} | {band: [lo, hi]} — and nothing else; a rate's values lie in [0, 1]
  IF jsonb_typeof(c -> 'threshold') IS DISTINCT FROM 'object'
     OR EXISTS (SELECT 1 FROM jsonb_object_keys(c -> 'threshold') k WHERE k NOT IN ('target', 'band'))
     OR (c -> 'threshold' ? 'target' AND c -> 'threshold' ? 'band')
     OR (c -> 'threshold' ? 'target' AND jsonb_typeof(c #> '{threshold,target}') IS DISTINCT FROM 'number')
     OR (c -> 'threshold' ? 'band' AND (jsonb_typeof(c #> '{threshold,band}') IS DISTINCT FROM 'array' OR jsonb_array_length(c #> '{threshold,band}') <> 2
                                        OR jsonb_typeof(c #> '{threshold,band,0}') IS DISTINCT FROM 'number' OR jsonb_typeof(c #> '{threshold,band,1}') IS DISTINCT FROM 'number'
                                        OR (c #>> '{threshold,band,0}')::numeric > (c #>> '{threshold,band,1}')::numeric)) THEN
    RAISE EXCEPTION 'metric definition rejected (threshold): the threshold is {} (none), {target: <number>} or {band: [lo, hi]} with lo ≤ hi' USING ERRCODE = '22023';
  END IF;
  IF c ->> 'kind' = 'rate' AND ((c -> 'threshold' ? 'target' AND (c #>> '{threshold,target}')::numeric NOT BETWEEN 0 AND 1)
                                OR (c -> 'threshold' ? 'band' AND ((c #>> '{threshold,band,0}')::numeric < 0 OR (c #>> '{threshold,band,1}')::numeric > 1))) THEN
    RAISE EXCEPTION 'metric definition rejected (threshold): a rate''s threshold lies between 0 and 1' USING ERRCODE = '22023';
  END IF;
  IF c -> 'threshold' ? 'band' AND c ->> 'direction' NOT IN ('band', 'track') THEN
    RAISE EXCEPTION 'metric definition rejected (threshold): a band threshold belongs to a definition whose direction is band' USING ERRCODE = '22023';
  END IF;
  IF c -> 'threshold' ? 'target' AND c ->> 'direction' NOT IN ('higher', 'lower') THEN
    RAISE EXCEPTION 'metric definition rejected (threshold): a target belongs to a definition whose direction is higher or lower' USING ERRCODE = '22023';
  END IF;
  -- SERVES (V01-T-040 "every measure links to the decision and objective it serves"): at least one objective, decision class or value measure
  IF jsonb_typeof(c -> 'serves') IS DISTINCT FROM 'object'
     OR (coalesce(jsonb_array_length(CASE WHEN jsonb_typeof(c #> '{serves,objective_ids}') = 'array' THEN c #> '{serves,objective_ids}' END), 0) = 0
         AND coalesce(jsonb_array_length(CASE WHEN jsonb_typeof(c #> '{serves,decision_classes}') = 'array' THEN c #> '{serves,decision_classes}' END), 0) = 0
         AND length(btrim(coalesce(c #>> '{serves,value_measure}', ''))) < 3) THEN
    RAISE EXCEPTION 'metric definition rejected (serves): the definition names the objective(s), decision class(es) or value measure it serves (V01-T-040: every measure links to the decision and objective it serves)' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(c #> '{serves,objective_ids}') = 'array' THEN
    FOR v_obj IN SELECT x FROM jsonb_array_elements_text(c #> '{serves,objective_ids}') x LOOP
      IF v_obj !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' OR NOT EXISTS (
           SELECT 1 FROM graph.strategy_current s WHERE s.strategy_object_id = v_obj::uuid AND s.tenant_id = p_tenant AND s.domain_id = p_domain AND s.object_type = 'OBJ' AND s.status = 'active') THEN
        RAISE EXCEPTION 'metric definition rejected (unknown_objective): % is not an active objective of this domain', v_obj USING ERRCODE = '23503';
      END IF;
    END LOOP;
  END IF;
  IF jsonb_typeof(c #> '{serves,decision_classes}') = 'array' AND EXISTS (SELECT 1 FROM jsonb_array_elements(c #> '{serves,decision_classes}') x WHERE jsonb_typeof(x) <> 'string' OR length(btrim(x #>> '{}')) < 3) THEN
    RAISE EXCEPTION 'metric definition rejected (serves): every decision class is named (3+ characters)' USING ERRCODE = '22023';
  END IF;
  -- THE OWNER: a named, active human of the domain holding product_analytics_owner, or the role App M's owner column maps to
  IF coalesce(c ->> 'owner_principal_id', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'metric definition rejected (owner): the owner is a named human (owner_principal_id)' USING ERRCODE = '22023';
  END IF;
  v_owner := (c ->> 'owner_principal_id')::uuid;
  v_role := CASE WHEN length(btrim(coalesce(c #>> '{quality,owner_role}', ''))) > 0 THEN analytics.amd_owner_role(c #>> '{quality,owner_role}') END;
  IF length(btrim(coalesce(c #>> '{quality,owner_role}', ''))) > 0 AND v_role IS NULL THEN
    RAISE EXCEPTION 'metric definition rejected (owner): App M''s owner "%" maps to no role of this product (analytics.owner_role_map)', c #>> '{quality,owner_role}' USING ERRCODE = '22023';
  END IF;
  IF NOT analytics.amd_human_with(v_owner, p_tenant, p_domain, ARRAY['product_analytics_owner'] || CASE WHEN v_role IS NULL THEN '{}'::text[] ELSE ARRAY[v_role] END) THEN
    RAISE EXCEPTION 'metric definition rejected (owner): the owner is a named, active human of this domain holding product_analytics_owner%', CASE WHEN v_role IS NULL THEN '' ELSE ' or ' || v_role || ' (App M''s ' || (c #>> '{quality,owner_role}') || ')' END USING ERRCODE = '22023';
  END IF;
  RETURN jsonb_build_object(
    'metric_key', c ->> 'metric_key', 'title', btrim(c ->> 'title'), 'meaning', btrim(c ->> 'meaning'), 'kind', c ->> 'kind', 'unit', btrim(c ->> 'unit'), 'direction', c ->> 'direction',
    'population', c -> 'population', 'numerator', nullif(btrim(coalesce(c ->> 'numerator', '')), ''), 'denominator', nullif(btrim(coalesce(c ->> 'denominator', '')), ''),
    'exclusions', c -> 'exclusions', 'window_spec', c -> 'window_spec', 'dimensions', to_jsonb(v_dims), 'privacy_class', c ->> 'privacy_class',
    'k_min', (c ->> 'k_min')::int, 'floor_n', (c ->> 'floor_n')::int, 'threshold', c -> 'threshold', 'purpose_key', c ->> 'purpose_key', 'serves', c -> 'serves',
    'cadence', btrim(c ->> 'cadence'), 'owner_principal_id', v_owner, 'action', btrim(c ->> 'action'), 'retirement', btrim(c ->> 'retirement'), 'quality', c -> 'quality',
    'cost_allocation', c -> 'cost_allocation', 'computation_key', CASE WHEN v_supported THEN c ->> 'computation_key' END, 'params', c -> 'params', 'supported', v_supported,
    'unsupported_reason', CASE WHEN v_supported THEN NULL ELSE btrim(c ->> 'unsupported_reason') END,
    'source_refs', coalesce((SELECT jsonb_agg(DISTINCT x) FROM jsonb_array_elements_text(c -> 'source_refs') x), '[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION analytics.amd_validate_contract(uuid, uuid, jsonb) FROM PUBLIC;

-- §MD.2 THE PURPOSE REGISTER ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION analytics.amd_purpose_digest(p_key text, p_title text, p_kind text, p_description text, p_retention int) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = analytics, pg_catalog, pg_temp AS $$
  SELECT analytics.digest(jsonb_build_object('purpose_key', p_key, 'title', p_title, 'purpose_kind', p_kind, 'description', p_description, 'retention_days', p_retention))
$$;
GRANT EXECUTE ON FUNCTION analytics.amd_purpose_digest(text, text, text, text, int) TO eye_app, eye_commit;

/* PROPOSE a purpose (analytics.purpose.propose): a named human product analyst or product analytics owner proposes the next VERSION of a purpose
   key — title, kind (analytics.purpose_kinds(); a performance / employee kind refused `(person)`), description (a performance or employee-scoring
   purpose refused `(person)`), the raw-telemetry retention in days. One open proposal per key. */
CREATE OR REPLACE FUNCTION analytics.propose_purpose(p_purpose uuid, p_tenant uuid, p_domain uuid, p_key text, p_title text, p_kind text, p_description text, p_retention_days int,
                                                     p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = analytics, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_next int; v_term text; o analytics.purposes%ROWTYPE; v_digest text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['analytics.purpose.propose']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM analytics.amd_assert_actor('analytics purpose', p_actor);
  PERFORM analytics.amd_assert_human('analytics purpose', p_actor, p_tenant, p_domain, ARRAY['product_analyst', 'product_analytics_owner'], 'a purpose proposal');
  IF coalesce(p_key, '') !~ '^[a-z][a-z0-9_.-]{2,62}$' THEN RAISE EXCEPTION 'analytics purpose rejected (key): a purpose key is lower-case letters, digits, dot, dash or underscore (3–63 characters)' USING ERRCODE = '22023'; END IF;
  IF coalesce(p_kind, '') ~* '(perform|employ|staff|worker|productiv|scor|rank|apprais|surveil|disciplin)' THEN
    RAISE EXCEPTION 'analytics purpose rejected (person): % is a purpose of evaluating people — product analytics serves %, never performance evaluation or employee scoring', p_kind, array_to_string(analytics.purpose_kinds(), ', ') USING ERRCODE = '42501';
  END IF;
  IF NOT (coalesce(p_kind, '') = ANY (analytics.purpose_kinds())) THEN
    RAISE EXCEPTION 'analytics purpose rejected (kind): the kind is one of %', array_to_string(analytics.purpose_kinds(), ', ') USING ERRCODE = '22023';
  END IF;
  IF length(btrim(coalesce(p_title, ''))) NOT BETWEEN 4 AND 200 THEN RAISE EXCEPTION 'analytics purpose rejected (title): a title has 4–200 characters' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_description, ''))) NOT BETWEEN 16 AND 4000 THEN RAISE EXCEPTION 'analytics purpose rejected (description): the description states what the purpose serves (16–4000 characters)' USING ERRCODE = '22023'; END IF;
  v_term := analytics.states_performance_purpose(p_title || ' ' || p_description);
  IF v_term IS NOT NULL THEN
    RAISE EXCEPTION 'analytics purpose rejected (person): the purpose states "%" — product analytics never serves performance evaluation, employee scoring, ranking or surveillance of people (PR-70-003)', v_term USING ERRCODE = '42501';
  END IF;
  IF p_retention_days IS NULL OR p_retention_days NOT BETWEEN 1 AND 3660 THEN RAISE EXCEPTION 'analytics purpose rejected (retention): the raw-telemetry retention is 1–3660 days' USING ERRCODE = '22023'; END IF;
  SELECT * INTO o FROM analytics.purposes x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.purpose_key = p_key AND x.state = 'proposed' ORDER BY x.version DESC LIMIT 1 FOR UPDATE;
  IF FOUND THEN RAISE EXCEPTION 'analytics purpose rejected (state): version % of % is proposed; it is decided before the next', o.version, p_key USING ERRCODE = '22023'; END IF;
  SELECT coalesce(max(x.version), 0) + 1 INTO v_next FROM analytics.purposes x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.purpose_key = p_key;
  v_digest := analytics.amd_purpose_digest(p_key, btrim(p_title), p_kind, btrim(p_description), p_retention_days);
  INSERT INTO analytics.purposes (purpose_id, scope, tenant_id, domain_id, purpose_key, version, title, purpose_kind, description, retention_days, state, digest, proposed_by, correlation_id)
  VALUES (p_purpose, 'DOMAIN', p_tenant, p_domain, p_key, v_next, btrim(p_title), p_kind, btrim(p_description), p_retention_days, 'proposed', v_digest, p_actor, p_correlation);
  PERFORM analytics.amd_event(p_tenant, p_domain, 'purpose', p_purpose, p_key, v_next, 'purpose.proposed', p_actor,
                              jsonb_build_object('purpose_kind', p_kind, 'retention_days', p_retention_days, 'digest', v_digest, 'pending', 'a privacy officer''s decision'), p_correlation);
  RETURN (SELECT to_jsonb(x) FROM analytics.purposes x WHERE x.purpose_id = p_purpose);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION analytics.propose_purpose(uuid,uuid,uuid,text,text,text,text,int,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION analytics.propose_purpose(uuid,uuid,uuid,text,text,text,text,int,uuid,uuid) TO eye_commit;

/* DECIDE a purpose (analytics.purpose.decide, human-gated): a named privacy officer — never the proposer, never an agent — approves or rejects the
   proposed version AT THE DIGEST it read (a stale digest refused 409), with a reason; approval supersedes the prior approved version. */
CREATE OR REPLACE FUNCTION analytics.decide_purpose(p_purpose uuid, p_tenant uuid, p_domain uuid, p_decision text, p_digest text, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = analytics, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE pu analytics.purposes%ROWTYPE; v_reason text; v_prev uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['analytics.purpose.decide']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM analytics.amd_assert_actor('analytics purpose', p_actor);
  PERFORM analytics.amd_assert_human('analytics purpose', p_actor, p_tenant, p_domain, ARRAY['privacy_officer'], 'a purpose decision (the privacy and minimisation review)');
  SELECT * INTO pu FROM analytics.purposes x WHERE x.purpose_id = p_purpose AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'analytics purpose rejected (unknown_purpose): % is not a purpose of this domain', p_purpose USING ERRCODE = '23503'; END IF;
  IF pu.proposed_by = p_actor THEN RAISE EXCEPTION 'analytics purpose rejected (separation_of_duties): the proposer of % v% does not decide it', pu.purpose_key, pu.version USING ERRCODE = '42501'; END IF;
  IF pu.state <> 'proposed' THEN RAISE EXCEPTION 'analytics purpose rejected (state): % v% is %; only a proposed version is decided', pu.purpose_key, pu.version, pu.state USING ERRCODE = '22023'; END IF;
  IF p_decision NOT IN ('approve', 'reject') THEN RAISE EXCEPTION 'analytics purpose rejected (decision): the decision is approve or reject' USING ERRCODE = '22023'; END IF;
  v_reason := analytics.amd_assert_reason('analytics purpose', p_reason, 'a purpose decision');
  IF p_digest IS DISTINCT FROM pu.digest THEN
    RAISE EXCEPTION 'analytics purpose rejected (stale): % v% is at digest %…, not the one decided (%…)', pu.purpose_key, pu.version, left(pu.digest, 12), left(coalesce(p_digest, '<none>'), 12) USING ERRCODE = '22023';
  END IF;
  IF p_decision = 'approve' THEN
    UPDATE analytics.purposes SET state = 'superseded' WHERE tenant_id = p_tenant AND domain_id = p_domain AND purpose_key = pu.purpose_key AND state = 'approved' RETURNING purpose_id INTO v_prev;
    UPDATE analytics.purposes SET state = 'approved', decided_by = p_actor, decided_at = clock_timestamp(), decision_reason = v_reason WHERE purpose_id = p_purpose;
  ELSE
    UPDATE analytics.purposes SET state = 'rejected', decided_by = p_actor, decided_at = clock_timestamp(), decision_reason = v_reason WHERE purpose_id = p_purpose;
  END IF;
  PERFORM analytics.amd_event(p_tenant, p_domain, 'purpose', p_purpose, pu.purpose_key, pu.version, CASE WHEN p_decision = 'approve' THEN 'purpose.approved' ELSE 'purpose.rejected' END, p_actor,
                              jsonb_build_object('digest', pu.digest, 'reason', v_reason, 'superseded', v_prev), p_correlation);
  IF v_prev IS NOT NULL THEN
    PERFORM analytics.amd_event(p_tenant, p_domain, 'purpose', v_prev, pu.purpose_key, pu.version - 1, 'purpose.superseded', p_actor, jsonb_build_object('by_version', pu.version), p_correlation);
  END IF;
  RETURN (SELECT to_jsonb(x) FROM analytics.purposes x WHERE x.purpose_id = p_purpose);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION analytics.decide_purpose(uuid,uuid,uuid,text,text,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION analytics.decide_purpose(uuid,uuid,uuid,text,text,text,uuid,uuid) TO eye_commit;

/* RETIRE a purpose (analytics.purpose.retire, human-gated): the privacy officer retires the approved (or a still-proposed) version with a reason. The
   definitions that name the purpose are LISTED in the event (they keep their history; a new definition or approval under it is refused — the
   purpose is no longer approved; §UX's collection under it stops). */
CREATE OR REPLACE FUNCTION analytics.retire_purpose(p_purpose uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = analytics, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE pu analytics.purposes%ROWTYPE; v_reason text; v_defs jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['analytics.purpose.retire']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM analytics.amd_assert_actor('analytics purpose', p_actor);
  PERFORM analytics.amd_assert_human('analytics purpose', p_actor, p_tenant, p_domain, ARRAY['privacy_officer'], 'a purpose retirement');
  SELECT * INTO pu FROM analytics.purposes x WHERE x.purpose_id = p_purpose AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'analytics purpose rejected (unknown_purpose): % is not a purpose of this domain', p_purpose USING ERRCODE = '23503'; END IF;
  IF pu.state NOT IN ('approved', 'proposed') THEN RAISE EXCEPTION 'analytics purpose rejected (state): % v% is %; an approved or proposed version is retired', pu.purpose_key, pu.version, pu.state USING ERRCODE = '22023'; END IF;
  v_reason := analytics.amd_assert_reason('analytics purpose', p_reason, 'a retirement');
  UPDATE analytics.purposes SET state = 'retired', retired_by = p_actor, retired_at = clock_timestamp(), retire_reason = v_reason WHERE purpose_id = p_purpose;
  SELECT coalesce(jsonb_agg(jsonb_build_object('metric_key', d.metric_key, 'version', d.version, 'state', d.state) ORDER BY d.metric_key, d.version), '[]'::jsonb) INTO v_defs
    FROM analytics.metric_definitions d WHERE d.tenant_id = p_tenant AND d.domain_id = p_domain AND d.purpose_key = pu.purpose_key AND d.state IN ('proposed', 'approved');
  PERFORM analytics.amd_event(p_tenant, p_domain, 'purpose', p_purpose, pu.purpose_key, pu.version, 'purpose.retired', p_actor,
                              jsonb_build_object('reason', v_reason, 'definitions_naming_it', v_defs, 'consequence', 'no new definition, approval or collection under this purpose; history stays readable'), p_correlation);
  RETURN (SELECT to_jsonb(x) FROM analytics.purposes x WHERE x.purpose_id = p_purpose) || jsonb_build_object('definitions_naming_it', v_defs);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION analytics.retire_purpose(uuid,uuid,uuid,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION analytics.retire_purpose(uuid,uuid,uuid,text,uuid,uuid) TO eye_commit;

-- §MD.3 THE SCOPE REGISTER ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION analytics.amd_scope_digest(p_key text, p_title text, p_entities uuid[], p_objectives uuid[], p_series text[], p_geographies text[], p_description text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = analytics, pg_catalog, pg_temp AS $$
  SELECT analytics.digest(jsonb_build_object('scope_key', p_key, 'title', p_title, 'description', p_description,
    'entity_ids', coalesce((SELECT jsonb_agg(x ORDER BY x) FROM unnest(p_entities) x), '[]'::jsonb), 'objective_ids', coalesce((SELECT jsonb_agg(x ORDER BY x) FROM unnest(p_objectives) x), '[]'::jsonb),
    'series_keys', coalesce((SELECT jsonb_agg(x ORDER BY x) FROM unnest(p_series) x), '[]'::jsonb), 'geographies', coalesce((SELECT jsonb_agg(x ORDER BY x) FROM unnest(p_geographies) x), '[]'::jsonb)))
$$;
GRANT EXECUTE ON FUNCTION analytics.amd_scope_digest(text, text, uuid[], uuid[], text[], text[], text) TO eye_app, eye_commit;

/* A scope's members, each a fact of the domain: an ACTIVE graph entity, an ACTIVE objective (OBJ), a REGISTERED series; geographies are named
   tokens. Unknown → `(unknown_entity | unknown_objective | unknown_series)` 404. Called at the proposal and again at the decision. */
CREATE OR REPLACE FUNCTION analytics.amd_assert_scope_members(p_tenant uuid, p_domain uuid, p_entities uuid[], p_objectives uuid[], p_series text[], p_geographies text[]) RETURNS void
LANGUAGE plpgsql STABLE SET search_path = analytics, graph, prediction, pg_catalog, pg_temp AS $$
DECLARE e uuid; s text;
BEGIN
  IF coalesce(cardinality(p_entities), 0) + coalesce(cardinality(p_objectives), 0) + coalesce(cardinality(p_series), 0) + coalesce(cardinality(p_geographies), 0) = 0 THEN
    RAISE EXCEPTION 'analytics scope rejected (empty): a scope names at least one entity, objective, series or geography' USING ERRCODE = '22023';
  END IF;
  FOREACH e IN ARRAY coalesce(p_entities, '{}'::uuid[]) LOOP
    IF NOT EXISTS (SELECT 1 FROM graph.entities_current x WHERE x.entity_id = e AND x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.lifecycle_state = 'active') THEN
      RAISE EXCEPTION 'analytics scope rejected (unknown_entity): % is not an active graph entity of this domain', e USING ERRCODE = '23503';
    END IF;
  END LOOP;
  FOREACH e IN ARRAY coalesce(p_objectives, '{}'::uuid[]) LOOP
    IF NOT EXISTS (SELECT 1 FROM graph.strategy_current x WHERE x.strategy_object_id = e AND x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.object_type = 'OBJ' AND x.status = 'active') THEN
      RAISE EXCEPTION 'analytics scope rejected (unknown_objective): % is not an active objective of this domain', e USING ERRCODE = '23503';
    END IF;
  END LOOP;
  FOREACH s IN ARRAY coalesce(p_series, '{}'::text[]) LOOP
    IF NOT EXISTS (SELECT 1 FROM prediction.series_registry x WHERE x.series_key = s AND x.tenant_id = p_tenant AND x.domain_id = p_domain) THEN
      RAISE EXCEPTION 'analytics scope rejected (unknown_series): % is not a registered series of this domain', s USING ERRCODE = '23503';
    END IF;
  END LOOP;
  FOREACH s IN ARRAY coalesce(p_geographies, '{}'::text[]) LOOP
    IF s IS NULL OR s !~ '^[A-Za-z0-9][A-Za-z0-9 ._:-]{1,79}$' THEN
      RAISE EXCEPTION 'analytics scope rejected (geography): a geography is a named token (2–80 characters; letters, digits, space, dot, colon, dash)' USING ERRCODE = '22023';
    END IF;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION analytics.amd_assert_scope_members(uuid, uuid, uuid[], uuid[], text[], text[]) FROM PUBLIC;

/* PROPOSE a scope (analytics.scope.propose): a named human analyst or owner proposes the next version of a scope key — "the corridor": its
   entities, objectives, series and geographies, each a fact of the domain. One open proposal per key. */
CREATE OR REPLACE FUNCTION analytics.propose_scope(p_scope_id uuid, p_tenant uuid, p_domain uuid, p_key text, p_title text, p_entities uuid[], p_objectives uuid[], p_series text[], p_geographies text[],
                                                   p_description text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = analytics, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_next int; o analytics.scopes%ROWTYPE; v_digest text; v_e uuid[]; v_o uuid[]; v_s text[]; v_g text[];
BEGIN
  PERFORM observation.assert_authority(ARRAY['analytics.scope.propose']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM analytics.amd_assert_actor('analytics scope', p_actor);
  PERFORM analytics.amd_assert_human('analytics scope', p_actor, p_tenant, p_domain, ARRAY['product_analyst', 'product_analytics_owner'], 'a scope proposal');
  IF coalesce(p_key, '') !~ '^[a-z][a-z0-9_.-]{2,62}$' THEN RAISE EXCEPTION 'analytics scope rejected (key): a scope key is lower-case letters, digits, dot, dash or underscore (3–63 characters)' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_title, ''))) NOT BETWEEN 4 AND 200 THEN RAISE EXCEPTION 'analytics scope rejected (title): a title has 4–200 characters' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_description, ''))) NOT BETWEEN 8 AND 2000 THEN RAISE EXCEPTION 'analytics scope rejected (description): the description says how the scope applies (8–2000 characters)' USING ERRCODE = '22023'; END IF;
  v_e := ARRAY(SELECT DISTINCT x FROM unnest(coalesce(p_entities, '{}'::uuid[])) x ORDER BY x); v_o := ARRAY(SELECT DISTINCT x FROM unnest(coalesce(p_objectives, '{}'::uuid[])) x ORDER BY x);
  v_s := ARRAY(SELECT DISTINCT x FROM unnest(coalesce(p_series, '{}'::text[])) x ORDER BY x); v_g := ARRAY(SELECT DISTINCT btrim(x) FROM unnest(coalesce(p_geographies, '{}'::text[])) x ORDER BY 1);
  PERFORM analytics.amd_assert_scope_members(p_tenant, p_domain, v_e, v_o, v_s, v_g);
  SELECT * INTO o FROM analytics.scopes x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.scope_key = p_key AND x.state = 'proposed' ORDER BY x.version DESC LIMIT 1 FOR UPDATE;
  IF FOUND THEN RAISE EXCEPTION 'analytics scope rejected (state): version % of % is proposed; it is decided before the next', o.version, p_key USING ERRCODE = '22023'; END IF;
  SELECT coalesce(max(x.version), 0) + 1 INTO v_next FROM analytics.scopes x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.scope_key = p_key;
  v_digest := analytics.amd_scope_digest(p_key, btrim(p_title), v_e, v_o, v_s, v_g, btrim(p_description));
  INSERT INTO analytics.scopes (scope_id, scope, tenant_id, domain_id, scope_key, version, title, entity_ids, objective_ids, series_keys, geographies, description, state, digest, proposed_by, correlation_id)
  VALUES (p_scope_id, 'DOMAIN', p_tenant, p_domain, p_key, v_next, btrim(p_title), v_e, v_o, v_s, v_g, btrim(p_description), 'proposed', v_digest, p_actor, p_correlation);
  PERFORM analytics.amd_event(p_tenant, p_domain, 'scope', p_scope_id, p_key, v_next, 'scope.proposed', p_actor,
                              jsonb_build_object('digest', v_digest, 'entities', cardinality(v_e), 'objectives', cardinality(v_o), 'series', to_jsonb(v_s), 'geographies', to_jsonb(v_g)), p_correlation);
  RETURN (SELECT to_jsonb(x) FROM analytics.scopes x WHERE x.scope_id = p_scope_id);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION analytics.propose_scope(uuid,uuid,uuid,text,text,uuid[],uuid[],text[],text[],text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION analytics.propose_scope(uuid,uuid,uuid,text,text,uuid[],uuid[],text[],text[],text,uuid,uuid) TO eye_commit;

/* DECIDE a scope (analytics.scope.decide, human-gated): a named product analytics owner ≠ the proposer, at the digest read, with a reason; the
   members RE-VALIDATED (an entity retired since the proposal is refused); approval supersedes the prior approved version (results computed under
   it keep naming it). */
CREATE OR REPLACE FUNCTION analytics.decide_scope(p_scope_id uuid, p_tenant uuid, p_domain uuid, p_decision text, p_digest text, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = analytics, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE s analytics.scopes%ROWTYPE; v_reason text; v_prev uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['analytics.scope.decide']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM analytics.amd_assert_actor('analytics scope', p_actor);
  PERFORM analytics.amd_assert_human('analytics scope', p_actor, p_tenant, p_domain, ARRAY['product_analytics_owner'], 'a scope decision');
  SELECT * INTO s FROM analytics.scopes x WHERE x.scope_id = p_scope_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'analytics scope rejected (unknown_scope): % is not a scope of this domain', p_scope_id USING ERRCODE = '23503'; END IF;
  IF s.proposed_by = p_actor THEN RAISE EXCEPTION 'analytics scope rejected (separation_of_duties): the proposer of % v% does not decide it', s.scope_key, s.version USING ERRCODE = '42501'; END IF;
  IF s.state <> 'proposed' THEN RAISE EXCEPTION 'analytics scope rejected (state): % v% is %; only a proposed version is decided', s.scope_key, s.version, s.state USING ERRCODE = '22023'; END IF;
  IF p_decision NOT IN ('approve', 'reject') THEN RAISE EXCEPTION 'analytics scope rejected (decision): the decision is approve or reject' USING ERRCODE = '22023'; END IF;
  v_reason := analytics.amd_assert_reason('analytics scope', p_reason, 'a scope decision');
  IF p_digest IS DISTINCT FROM s.digest THEN
    RAISE EXCEPTION 'analytics scope rejected (stale): % v% is at digest %…, not the one decided (%…)', s.scope_key, s.version, left(s.digest, 12), left(coalesce(p_digest, '<none>'), 12) USING ERRCODE = '22023';
  END IF;
  IF p_decision = 'approve' THEN
    PERFORM analytics.amd_assert_scope_members(p_tenant, p_domain, s.entity_ids, s.objective_ids, s.series_keys, s.geographies);
    UPDATE analytics.scopes SET state = 'superseded' WHERE tenant_id = p_tenant AND domain_id = p_domain AND scope_key = s.scope_key AND state = 'approved' RETURNING scope_id INTO v_prev;
    UPDATE analytics.scopes SET state = 'approved', decided_by = p_actor, decided_at = clock_timestamp(), decision_reason = v_reason WHERE scope_id = p_scope_id;
  ELSE
    UPDATE analytics.scopes SET state = 'rejected', decided_by = p_actor, decided_at = clock_timestamp(), decision_reason = v_reason WHERE scope_id = p_scope_id;
  END IF;
  PERFORM analytics.amd_event(p_tenant, p_domain, 'scope', p_scope_id, s.scope_key, s.version, CASE WHEN p_decision = 'approve' THEN 'scope.approved' ELSE 'scope.rejected' END, p_actor,
                              jsonb_build_object('digest', s.digest, 'reason', v_reason, 'superseded', v_prev), p_correlation);
  IF v_prev IS NOT NULL THEN
    PERFORM analytics.amd_event(p_tenant, p_domain, 'scope', v_prev, s.scope_key, NULL, 'scope.superseded', p_actor, jsonb_build_object('by_version', s.version), p_correlation);
  END IF;
  RETURN (SELECT to_jsonb(x) FROM analytics.scopes x WHERE x.scope_id = p_scope_id);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION analytics.decide_scope(uuid,uuid,uuid,text,text,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION analytics.decide_scope(uuid,uuid,uuid,text,text,text,uuid,uuid) TO eye_commit;

/* RETIRE a scope (analytics.scope.retire, human-gated): the product analytics owner retires the approved version (a computation naming the key is
   then refused unknown_scope; results computed under it keep naming it). The reason goes to the ledger. */
CREATE OR REPLACE FUNCTION analytics.retire_scope(p_scope_id uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = analytics, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE s analytics.scopes%ROWTYPE; v_reason text; v_results int;
BEGIN
  PERFORM observation.assert_authority(ARRAY['analytics.scope.retire']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM analytics.amd_assert_actor('analytics scope', p_actor);
  PERFORM analytics.amd_assert_human('analytics scope', p_actor, p_tenant, p_domain, ARRAY['product_analytics_owner'], 'a scope retirement');
  SELECT * INTO s FROM analytics.scopes x WHERE x.scope_id = p_scope_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'analytics scope rejected (unknown_scope): % is not a scope of this domain', p_scope_id USING ERRCODE = '23503'; END IF;
  IF s.state <> 'approved' THEN RAISE EXCEPTION 'analytics scope rejected (state): % v% is %; the approved version is retired', s.scope_key, s.version, s.state USING ERRCODE = '22023'; END IF;
  v_reason := analytics.amd_assert_reason('analytics scope', p_reason, 'a retirement');
  UPDATE analytics.scopes SET state = 'retired', retired_at = clock_timestamp() WHERE scope_id = p_scope_id;
  SELECT count(*)::int INTO v_results FROM analytics.metric_results r WHERE r.scope_id = p_scope_id;
  PERFORM analytics.amd_event(p_tenant, p_domain, 'scope', p_scope_id, s.scope_key, s.version, 'scope.retired', p_actor,
                              jsonb_build_object('reason', v_reason, 'results_under_it', v_results, 'consequence', 'no new computation under this scope key; the results computed under it stay readable'), p_correlation);
  RETURN (SELECT to_jsonb(x) FROM analytics.scopes x WHERE x.scope_id = p_scope_id) || jsonb_build_object('results_under_it', v_results, 'reason', v_reason);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION analytics.retire_scope(uuid,uuid,uuid,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION analytics.retire_scope(uuid,uuid,uuid,text,uuid,uuid) TO eye_commit;

-- §MD.4 THE DEFINITIONS ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* PROPOSE a definition version (analytics.definition.propose): a named HUMAN product analyst or product analytics owner proposes the next version
   of a metric key with its whole CONTRACT (D2) — validated whole here (analytics.amd_validate_contract) and digested; one open proposal per key.
   An agent is refused AT THE PORT (AI computes and proposes findings; a definition is a human's proposal). The approval pending is routed as an
   `analytics.metric` item (subject the definition) under the published policy, the named owner kept. */
CREATE OR REPLACE FUNCTION analytics.propose_definition(p_definition uuid, p_tenant uuid, p_domain uuid, p_contract jsonb, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = analytics, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v jsonb; v_next int; o analytics.metric_definitions%ROWTYPE; v_digest text; v_item jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['analytics.definition.propose']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM analytics.amd_assert_actor('metric definition', p_actor);
  PERFORM analytics.amd_assert_human('metric definition', p_actor, p_tenant, p_domain, ARRAY['product_analyst', 'product_analytics_owner'], 'a definition proposal');
  v := analytics.amd_validate_contract(p_tenant, p_domain, p_contract);
  SELECT * INTO o FROM analytics.metric_definitions x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.metric_key = v ->> 'metric_key' AND x.state IN ('draft', 'proposed')
   ORDER BY x.version DESC LIMIT 1 FOR UPDATE;
  IF FOUND THEN RAISE EXCEPTION 'metric definition rejected (state): version % of % is %; it is decided before the next', o.version, o.metric_key, o.state USING ERRCODE = '22023'; END IF;
  SELECT coalesce(max(x.version), 0) + 1 INTO v_next FROM analytics.metric_definitions x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.metric_key = v ->> 'metric_key';
  v_digest := analytics.digest(analytics.definition_contract(v));
  IF EXISTS (SELECT 1 FROM analytics.metric_definitions x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.metric_key = v ->> 'metric_key' AND x.state = 'approved' AND x.digest = v_digest) THEN
    RAISE EXCEPTION 'metric definition rejected (duplicate): the contract of % is unchanged from its approved version (digest %…)', v ->> 'metric_key', left(v_digest, 12) USING ERRCODE = '23505';
  END IF;
  INSERT INTO analytics.metric_definitions (definition_id, scope, tenant_id, domain_id, metric_key, version, title, meaning, kind, unit, direction, population, numerator, denominator, exclusions,
                                            window_spec, dimensions, privacy_class, k_min, floor_n, threshold, purpose_key, serves, cadence, owner_principal_id, action, retirement, quality,
                                            cost_allocation, computation_key, params, supported, unsupported_reason, source_refs, state, digest, proposed_by, proposed_by_kind, correlation_id)
  VALUES (p_definition, 'DOMAIN', p_tenant, p_domain, v ->> 'metric_key', v_next, v ->> 'title', v ->> 'meaning', v ->> 'kind', v ->> 'unit', v ->> 'direction', v -> 'population',
          v ->> 'numerator', v ->> 'denominator', v -> 'exclusions', v -> 'window_spec', ARRAY(SELECT jsonb_array_elements_text(v -> 'dimensions')), v ->> 'privacy_class',
          (v ->> 'k_min')::int, (v ->> 'floor_n')::int, v -> 'threshold', v ->> 'purpose_key', v -> 'serves', v ->> 'cadence', (v ->> 'owner_principal_id')::uuid, v ->> 'action',
          v ->> 'retirement', v -> 'quality', v -> 'cost_allocation', v ->> 'computation_key', v -> 'params', (v ->> 'supported')::boolean, v ->> 'unsupported_reason',
          ARRAY(SELECT jsonb_array_elements_text(v -> 'source_refs')), 'proposed', v_digest, p_actor, 'human', p_correlation);
  PERFORM analytics.amd_event(p_tenant, p_domain, 'definition', p_definition, v ->> 'metric_key', v_next, 'definition.proposed', p_actor,
                              jsonb_build_object('digest', v_digest, 'supported', (v ->> 'supported')::boolean, 'computation_key', v ->> 'computation_key', 'purpose_key', v ->> 'purpose_key',
                                                 'pending', 'a named product analytics owner''s approval (never the proposer)'), p_correlation);
  v_item := executive.b33_raise_routed(p_tenant, p_domain, 'analytics.metric', 'metric_definition', p_definition,
              format('Metric definition %s v%s awaits approval', v ->> 'metric_key', v_next),
              jsonb_build_array(format('proposed by a named human; a product analytics owner approves or rejects it at digest %s…, never the proposer', left(v_digest, 12))),
              (v ->> 'owner_principal_id')::uuid, p_definition, 'analytics.definition.proposed',
              jsonb_build_object('metric_key', v ->> 'metric_key', 'version', v_next, 'digest', v_digest, 'pending', 'approval'), NULL, p_actor, p_correlation);
  RETURN (SELECT to_jsonb(x) FROM analytics.metric_definitions x WHERE x.definition_id = p_definition) || jsonb_build_object('contract', analytics.definition_contract(v), 'item', v_item);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION analytics.propose_definition(uuid,uuid,uuid,jsonb,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION analytics.propose_definition(uuid,uuid,uuid,jsonb,uuid,uuid) TO eye_commit;

/* DECIDE a definition (analytics.definition.decide, human-gated): a named product analytics owner — never the proposer (403), never an agent (403) —
   approves or rejects the proposed version AT THE DIGEST it saw (stale → 409), with a reason (8+). The whole contract is RE-VALIDATED first (the
   validation-to-effect boundary: the purpose still approved, the computation still registered with the same kind and dimensions, the owner still
   holding the role, the objectives still live). Approval: the prior approved version is SUPERSEDED (superseded_at now), this one is approved
   effective now. The routed item is closed. */
CREATE OR REPLACE FUNCTION analytics.decide_definition(p_definition uuid, p_tenant uuid, p_domain uuid, p_decision text, p_digest text, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = analytics, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE d analytics.metric_definitions%ROWTYPE; v_reason text; v_prev analytics.metric_definitions%ROWTYPE; v_now timestamptz := clock_timestamp(); v_closed jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['analytics.definition.decide']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM analytics.amd_assert_actor('metric definition', p_actor);
  PERFORM analytics.amd_assert_human('metric definition', p_actor, p_tenant, p_domain, ARRAY['product_analytics_owner'], 'a definition decision');
  SELECT * INTO d FROM analytics.metric_definitions x WHERE x.definition_id = p_definition AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'metric definition rejected (unknown_definition): % is not a metric definition of this domain', p_definition USING ERRCODE = '23503'; END IF;
  IF d.proposed_by = p_actor THEN RAISE EXCEPTION 'metric definition rejected (separation_of_duties): the proposer of % v% does not decide it — a named product analytics owner who did not propose it does', d.metric_key, d.version USING ERRCODE = '42501'; END IF;
  IF d.state <> 'proposed' THEN RAISE EXCEPTION 'metric definition rejected (state): % v% is %; only a proposed version is decided', d.metric_key, d.version, d.state USING ERRCODE = '22023'; END IF;
  IF p_decision NOT IN ('approve', 'reject') THEN RAISE EXCEPTION 'metric definition rejected (decision): the decision is approve or reject' USING ERRCODE = '22023'; END IF;
  v_reason := analytics.amd_assert_reason('metric definition', p_reason, 'a definition decision');
  IF p_digest IS DISTINCT FROM d.digest THEN
    RAISE EXCEPTION 'metric definition rejected (stale): % v% is at digest %…, not the one decided (%…) — read the contract again', d.metric_key, d.version, left(d.digest, 12), left(coalesce(p_digest, '<none>'), 12) USING ERRCODE = '22023';
  END IF;
  IF p_decision = 'approve' THEN
    PERFORM analytics.amd_validate_contract(p_tenant, p_domain, to_jsonb(d));
    SELECT * INTO v_prev FROM analytics.metric_definitions x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.metric_key = d.metric_key AND x.state = 'approved' FOR UPDATE;
    IF FOUND THEN
      UPDATE analytics.metric_definitions SET state = 'superseded', superseded_at = v_now WHERE definition_id = v_prev.definition_id;
      PERFORM analytics.amd_event(p_tenant, p_domain, 'definition', v_prev.definition_id, d.metric_key, v_prev.version, 'definition.superseded', p_actor,
                                  jsonb_build_object('by_version', d.version, 'diff', analytics.definition_diff_of(to_jsonb(v_prev), to_jsonb(d))), p_correlation);
    END IF;
    UPDATE analytics.metric_definitions SET state = 'approved', decided_by = p_actor, decided_at = v_now, decision_reason = v_reason, effective_from = v_now WHERE definition_id = p_definition;
  ELSE
    UPDATE analytics.metric_definitions SET state = 'rejected', decided_by = p_actor, decided_at = v_now, decision_reason = v_reason WHERE definition_id = p_definition;
  END IF;
  PERFORM analytics.amd_event(p_tenant, p_domain, 'definition', p_definition, d.metric_key, d.version, CASE WHEN p_decision = 'approve' THEN 'definition.approved' ELSE 'definition.rejected' END, p_actor,
                              jsonb_build_object('digest', d.digest, 'reason', v_reason, 'superseded_version', v_prev.version, 'effective_from', CASE WHEN p_decision = 'approve' THEN v_now END), p_correlation);
  v_closed := executive.b33_close_items(p_tenant, p_domain, 'analytics.metric', 'metric_definition', p_definition,
                format('definition %s v%s %s by a named product analytics owner', d.metric_key, d.version, CASE WHEN p_decision = 'approve' THEN 'approved' ELSE 'rejected' END), p_actor, p_correlation);
  RETURN (SELECT to_jsonb(x) FROM analytics.metric_definitions x WHERE x.definition_id = p_definition) || jsonb_build_object('superseded', v_prev.definition_id, 'items_closed', v_closed);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION analytics.decide_definition(uuid,uuid,uuid,text,text,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION analytics.decide_definition(uuid,uuid,uuid,text,text,text,uuid,uuid) TO eye_commit;

/* RETIRE a definition (analytics.definition.retire, human-gated): a named product analytics owner retires the APPROVED version with a reason; the
   computation stops (the compute port finds no approved version), the history stays readable, and the USES of the key's results — every
   version's — are LISTED in the retirement event and the answer. Nothing is refused because of a use: the citing records keep their citation. */
CREATE OR REPLACE FUNCTION analytics.retire_definition(p_definition uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = analytics, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE d analytics.metric_definitions%ROWTYPE; v_reason text; v_uses jsonb; v_closed jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['analytics.definition.retire']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM analytics.amd_assert_actor('metric definition', p_actor);
  PERFORM analytics.amd_assert_human('metric definition', p_actor, p_tenant, p_domain, ARRAY['product_analytics_owner'], 'a definition retirement');
  SELECT * INTO d FROM analytics.metric_definitions x WHERE x.definition_id = p_definition AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'metric definition rejected (unknown_definition): % is not a metric definition of this domain', p_definition USING ERRCODE = '23503'; END IF;
  IF d.state <> 'approved' THEN RAISE EXCEPTION 'metric definition rejected (state): % v% is %; the approved version is retired (a proposal is rejected instead)', d.metric_key, d.version, d.state USING ERRCODE = '22023'; END IF;
  v_reason := analytics.amd_assert_reason('metric definition', p_reason, 'a retirement');
  SELECT coalesce(jsonb_agg(jsonb_build_object('use_id', u.use_id, 'used_in_kind', u.used_in_kind, 'used_in_id', u.used_in_id, 'result_id', u.result_id, 'definition_version', r.definition_version,
                                               'period_key', r.period_key, 'result_state', r.state, 'used_at', u.used_at) ORDER BY u.used_at), '[]'::jsonb)
    INTO v_uses FROM analytics.metric_uses u JOIN analytics.metric_results r ON r.result_id = u.result_id
   WHERE r.tenant_id = p_tenant AND r.domain_id = p_domain AND r.metric_key = d.metric_key;
  UPDATE analytics.metric_definitions SET state = 'retired', retired_by = p_actor, retired_at = clock_timestamp(), retire_reason = v_reason WHERE definition_id = p_definition;
  PERFORM analytics.amd_event(p_tenant, p_domain, 'definition', p_definition, d.metric_key, d.version, 'definition.retired', p_actor,
                              jsonb_build_object('reason', v_reason, 'retirement_condition', d.retirement, 'uses', v_uses,
                                                 'consequence', 'computation stops (no approved version); results, records and uses stay readable; citing records keep their citations'), p_correlation);
  v_closed := executive.b33_close_items(p_tenant, p_domain, NULL, 'metric_definition', p_definition, format('definition %s v%s retired', d.metric_key, d.version), p_actor, p_correlation);
  RETURN (SELECT to_jsonb(x) FROM analytics.metric_definitions x WHERE x.definition_id = p_definition) || jsonb_build_object('uses', v_uses, 'items_closed', v_closed);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION analytics.retire_definition(uuid,uuid,uuid,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION analytics.retire_definition(uuid,uuid,uuid,text,uuid,uuid) TO eye_commit;

-- §MD.5 THE USES LEDGER (PR-70-002 `decision`; ES-40-008's governance) ────────────────────────────────────────────────────────────────────────
/* Whether a citing object exists in the domain: a decision package, a briefing, a publication — and analytics' own reviews, findings and exports
   by uuid lookup WHEN their table is present (§OR / §UX; an absent table means no such object yet → unknown). */
CREATE OR REPLACE FUNCTION analytics.amd_citing_exists(p_tenant uuid, p_domain uuid, p_kind text, p_id uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SET search_path = analytics, decision, executive, pg_catalog, pg_temp AS $$
DECLARE v_table text; v_col text; v_ok boolean := false;
BEGIN
  CASE p_kind
    WHEN 'decision_package' THEN RETURN EXISTS (SELECT 1 FROM decision.packages_current x WHERE x.package_id = p_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain);
    WHEN 'briefing' THEN RETURN EXISTS (SELECT 1 FROM executive.briefings x WHERE x.briefing_id = p_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain);
    WHEN 'publication' THEN RETURN EXISTS (SELECT 1 FROM executive.publications x WHERE x.publication_id = p_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain);
    WHEN 'operating_review' THEN v_table := 'analytics.operating_reviews'; v_col := 'review_id';
    WHEN 'finding' THEN v_table := coalesce(CASE WHEN to_regclass('analytics.experience_findings') IS NOT NULL THEN 'analytics.experience_findings' END,
                                            CASE WHEN to_regclass('analytics.findings') IS NOT NULL THEN 'analytics.findings' END); v_col := 'finding_id';
    WHEN 'export' THEN v_table := 'analytics.exports'; v_col := 'export_id';
    ELSE RETURN false;
  END CASE;
  IF v_table IS NULL OR to_regclass(v_table) IS NULL THEN RETURN false; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = to_regclass(v_table) AND a.attname = v_col AND NOT a.attisdropped) THEN RETURN false; END IF;
  EXECUTE format('SELECT EXISTS (SELECT 1 FROM %s x WHERE x.%I = $1 AND x.tenant_id = $2 AND x.domain_id = $3)', v_table, v_col) INTO v_ok USING p_id, p_tenant, p_domain;
  RETURN coalesce(v_ok, false);
END $$;
REVOKE ALL ON FUNCTION analytics.amd_citing_exists(uuid, uuid, text, uuid) FROM PUBLIC;

/* RECORD A USE (analytics.use.record): a result cited in an operating review, a decision package, a briefing, a publication, an export or a
   finding. The citing object exists in the domain (else 404). A PREVIEW (computed on a proposed definition), a REPLAY, or a result of a definition
   that is no longer current (superseded or retired) is refused `(state)` 409 — never served as current. ES-40-008: an INDETERMINATE or
   UNSUPPORTED result cited in a BRIEFING or a PUBLICATION is refused `(state)` 409 unless the citation is explicitly QUALIFIED (qualified = true and
   a note that says the result is indeterminate / unsupported) — a failed or indeterminate indicator constrains downstream use; it is never
   presented as current and complete. The use row references the (immutable) result, so it records the state cited; the ledger event says it. */
CREATE OR REPLACE FUNCTION analytics.record_use(p_use uuid, p_tenant uuid, p_domain uuid, p_result uuid, p_kind text, p_used_in uuid, p_note text, p_qualified boolean, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = analytics, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r analytics.metric_results%ROWTYPE; d analytics.metric_definitions%ROWTYPE; v_note text := nullif(btrim(coalesce(p_note, '')), ''); v_qualified boolean := coalesce(p_qualified, false);
BEGIN
  PERFORM observation.assert_authority(ARRAY['analytics.use.record']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM analytics.amd_assert_actor('metric use', p_actor);
  IF NOT executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['product_analyst', 'product_analytics_owner', 'executive', 'executive_operator', 'strategy_owner', 'decision_owner', 'risk_owner', 'forecast_owner']) THEN
    RAISE EXCEPTION 'metric use rejected (authority): a use is recorded by a product analyst or owner, an executive, or the strategy, decision, risk or forecast owner who cites it' USING ERRCODE = '42501';
  END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('operating_review', 'decision_package', 'briefing', 'publication', 'export', 'finding') THEN
    RAISE EXCEPTION 'metric use rejected (kind): a result is cited in an operating_review, decision_package, briefing, publication, export or finding' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO r FROM analytics.metric_results x WHERE x.result_id = p_result AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'metric use rejected (unknown_result): % is not a result of this domain', p_result USING ERRCODE = '23503'; END IF;
  IF NOT analytics.amd_citing_exists(p_tenant, p_domain, p_kind, p_used_in) THEN
    RAISE EXCEPTION 'metric use rejected (unknown_%): % is not a % of this domain', p_kind, p_used_in, replace(p_kind, '_', ' ') USING ERRCODE = '23503';
  END IF;
  IF r.preview THEN RAISE EXCEPTION 'metric use rejected (state): result % is a PREVIEW computed on a proposed definition for its review — never cited as current', p_result USING ERRCODE = '22023'; END IF;
  IF r.replay_of IS NOT NULL THEN RAISE EXCEPTION 'metric use rejected (state): result % is a replay of %; the original is cited', p_result, r.replay_of USING ERRCODE = '22023'; END IF;
  SELECT * INTO d FROM analytics.metric_definitions x WHERE x.definition_id = r.definition_id;
  IF d.state <> 'approved' THEN
    RAISE EXCEPTION 'metric use rejected (state): result % was computed on % v%, which is now % — a non-current definition''s result is not cited as current (compute it again under the approved version)', p_result, d.metric_key, d.version, d.state USING ERRCODE = '22023';
  END IF;
  IF r.state <> 'determinate' AND p_kind IN ('briefing', 'publication') THEN
    IF NOT v_qualified THEN
      RAISE EXCEPTION 'metric use rejected (state): result % of % is % (%) — a briefing or publication cites it only QUALIFIED (qualified: true and a note saying it is %), never as current and complete',
        p_result, r.metric_key, r.state, left(coalesce(r.reasons ->> 0, ''), 200), r.state USING ERRCODE = '22023';
    END IF;
    IF v_note IS NULL OR length(v_note) < 16 OR v_note !~* r.state THEN
      RAISE EXCEPTION 'metric use rejected (qualification): the qualification note states that the result is % (16+ characters naming the state)', r.state USING ERRCODE = '22023';
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM analytics.metric_uses x WHERE x.result_id = p_result AND x.used_in_kind = p_kind AND x.used_in_id = p_used_in) THEN
    RAISE EXCEPTION 'metric use rejected (duplicate): result % is already cited in that %', p_result, replace(p_kind, '_', ' ') USING ERRCODE = '23505';
  END IF;
  INSERT INTO analytics.metric_uses (use_id, scope, tenant_id, domain_id, result_id, used_in_kind, used_in_id, note, used_by, correlation_id)
  VALUES (p_use, 'DOMAIN', p_tenant, p_domain, p_result, p_kind, p_used_in, v_note, p_actor, p_correlation);
  PERFORM analytics.amd_event(p_tenant, p_domain, 'use', p_use, r.metric_key, r.definition_version, 'use.recorded', p_actor,
                              jsonb_build_object('result_id', p_result, 'used_in_kind', p_kind, 'used_in_id', p_used_in, 'result_state', r.state, 'qualified', v_qualified AND r.state <> 'determinate',
                                                 'period_key', r.period_key, 'scope_key', r.scope_key, 'source_revision', r.source_revision), p_correlation);
  RETURN (SELECT to_jsonb(x) FROM analytics.metric_uses x WHERE x.use_id = p_use)
         || jsonb_build_object('result_state', r.state, 'qualified', v_qualified AND r.state <> 'determinate', 'metric_key', r.metric_key, 'definition_version', r.definition_version, 'period_key', r.period_key);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION analytics.record_use(uuid,uuid,uuid,uuid,text,uuid,text,boolean,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION analytics.record_use(uuid,uuid,uuid,uuid,text,uuid,text,boolean,uuid,uuid) TO eye_commit;

-- §MD.6 DP-44-005 — THE USES OF A B90 METRIC SERVING ──────────────────────────────────────────────────────────────────────────────────────────
/* A decision package, a briefing or a publication citing a B90 metric SERVING (products.metric_servings): the reports and decisions a withdrawn
   metric affected are LINKED (the servings ledger exposed only the readers). Append-only. */
CREATE TABLE products.metric_serving_uses (
  use_id          uuid PRIMARY KEY,
  scope           text NOT NULL,
  tenant_id       uuid NOT NULL,
  domain_id       uuid NOT NULL,
  serving_id      uuid NOT NULL REFERENCES products.metric_servings (serving_id),
  model_id        uuid NOT NULL REFERENCES products.semantic_models (model_id),
  version         int  NOT NULL,
  view            text NOT NULL,
  certified       boolean NOT NULL,                       -- the serving's standing when served (copied)
  used_in_kind    text NOT NULL CHECK (used_in_kind IN ('decision_package', 'briefing', 'publication')),
  used_in_id      uuid NOT NULL,
  note            text,
  used_by         uuid NOT NULL,
  used_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id  uuid NOT NULL,
  CONSTRAINT pmsu_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT pmsu_once UNIQUE (serving_id, used_in_kind, used_in_id)
);
CREATE INDEX pmsu_model ON products.metric_serving_uses (model_id, used_at);
CREATE TRIGGER pmsu_append_only BEFORE UPDATE OR DELETE ON products.metric_serving_uses FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE products.metric_serving_uses IS 'B92 §MD (0113; DP-44-005): the decision packages, briefings and publications that CITE a metric serving — the withdrawal of the metric lists them beside the servings. Append-only.';
REVOKE ALL ON products.metric_serving_uses FROM PUBLIC;
ALTER TABLE products.metric_serving_uses ENABLE ROW LEVEL SECURITY;
ALTER TABLE products.metric_serving_uses FORCE ROW LEVEL SECURITY;
CREATE POLICY products_isolation ON products.metric_serving_uses
  USING (tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain()));
GRANT SELECT ON products.metric_serving_uses TO eye_app, eye_commit;

/* RECORD A SERVING USE (products.metric.use): the citing object exists in the domain (else 404); a RECALCULATION serving is not a reading and is
   not cited `(state)`; an UNCERTIFIED serving (the analyst view's marked one) is cited in a briefing or publication only qualified — never as an
   executive basis (`(state)` 409, the B90 note's own rule). */
CREATE OR REPLACE FUNCTION products.record_metric_serving_use(p_use uuid, p_tenant uuid, p_domain uuid, p_serving uuid, p_kind text, p_used_in uuid, p_note text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = products, analytics, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE s products.metric_servings%ROWTYPE; m products.semantic_models%ROWTYPE; v_note text := nullif(btrim(coalesce(p_note, '')), '');
BEGIN
  PERFORM observation.assert_authority(ARRAY['products.metric.use']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM analytics.amd_assert_actor('metric use', p_actor);
  IF NOT executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['executive', 'executive_operator', 'strategy_owner', 'decision_owner', 'decision_authority', 'risk_owner', 'forecast_owner',
                                                               'data_steward', 'domain_analyst', 'product_analyst', 'product_analytics_owner']) THEN
    RAISE EXCEPTION 'metric use rejected (authority): a serving''s use is recorded by the executive, strategy, decision, risk or forecast owner, the steward or an analyst who cites it' USING ERRCODE = '42501';
  END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('decision_package', 'briefing', 'publication') THEN
    RAISE EXCEPTION 'metric use rejected (kind): a serving is cited in a decision_package, briefing or publication' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO s FROM products.metric_servings x WHERE x.serving_id = p_serving AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'metric use rejected (unknown_serving): % is not a metric serving of this domain', p_serving USING ERRCODE = '23503'; END IF;
  IF NOT analytics.amd_citing_exists(p_tenant, p_domain, p_kind, p_used_in) THEN
    RAISE EXCEPTION 'metric use rejected (unknown_%): % is not a % of this domain', p_kind, p_used_in, replace(p_kind, '_', ' ') USING ERRCODE = '23503';
  END IF;
  IF s.view = 'recalculation' THEN RAISE EXCEPTION 'metric use rejected (state): serving % is a recalculation (a reproducibility check), not a reading to cite', p_serving USING ERRCODE = '22023'; END IF;
  IF NOT s.certified AND p_kind IN ('briefing', 'publication') AND (v_note IS NULL OR v_note !~* 'uncertified') THEN
    RAISE EXCEPTION 'metric use rejected (state): serving % was UNCERTIFIED (the analyst view''s marked serving) — a briefing or publication cites it only with a note saying it is uncertified', p_serving USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM products.metric_serving_uses x WHERE x.serving_id = p_serving AND x.used_in_kind = p_kind AND x.used_in_id = p_used_in) THEN
    RAISE EXCEPTION 'metric use rejected (duplicate): serving % is already cited in that %', p_serving, replace(p_kind, '_', ' ') USING ERRCODE = '23505';
  END IF;
  SELECT * INTO m FROM products.semantic_models x WHERE x.model_id = s.model_id;
  INSERT INTO products.metric_serving_uses (use_id, scope, tenant_id, domain_id, serving_id, model_id, version, view, certified, used_in_kind, used_in_id, note, used_by, correlation_id)
  VALUES (p_use, 'DOMAIN', p_tenant, p_domain, p_serving, s.model_id, s.version, s.view, s.certified, p_kind, p_used_in, v_note, p_actor, p_correlation);
  -- the ledger: analytics' own (products.product_events' vocabulary is B90's and is not re-declared here)
  PERFORM analytics.amd_event(p_tenant, p_domain, 'use', p_use, m.metric_key, s.version, 'serving_use.recorded', p_actor,
                              jsonb_build_object('serving_id', p_serving, 'model_id', s.model_id, 'used_in_kind', p_kind, 'used_in_id', p_used_in, 'view', s.view, 'certified', s.certified,
                                                 'source_revision', s.source_revision), p_correlation);
  RETURN (SELECT to_jsonb(x) FROM products.metric_serving_uses x WHERE x.use_id = p_use) || jsonb_build_object('metric_key', m.metric_key);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION products.record_metric_serving_use(uuid,uuid,uuid,uuid,text,uuid,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION products.record_metric_serving_use(uuid,uuid,uuid,uuid,text,uuid,text,uuid,uuid) TO eye_commit;

/* THE WITHDRAWAL STEP (private — the ports below call it inside their own transaction; it is no port: it asserts nothing itself, the
   caller did): the active certification moves to `withdrawn` or `expired` with the reason, the model's state follows and its last valid
   version is frozen readable; the servings since the certification are LISTED ("expose affected reports and decisions") in the answer and
   in the event's details. */
-- B92 md (DP-44-005): copied WHOLE from its last definition (0095:2731; no later re-declaration) — the USES of those servings (the decision
-- packages, briefings and publications that cited them, products.metric_serving_uses) are listed beside the servings, in the answer and the event.
CREATE OR REPLACE FUNCTION products.metric_withdraw(p_model_id uuid, p_state text, p_reason text, p_detail jsonb, p_actor uuid, p_event_id uuid, p_correlation uuid) RETURNS jsonb
SET search_path = products, pg_catalog, pg_temp AS $$
DECLARE m products.semantic_models%ROWTYPE; c products.metric_certifications%ROWTYPE; v_servings jsonb;
        v_uses jsonb;   -- B92 md
BEGIN
  SELECT * INTO m FROM products.semantic_models x WHERE x.model_id = p_model_id FOR UPDATE;
  SELECT * INTO c FROM products.metric_certifications x WHERE x.model_id = p_model_id AND x.state = 'active' ORDER BY x.certified_at DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('serving_id', s.serving_id, 'view', s.view, 'grain', s.grain, 'as_of', s.as_of, 'served_to', s.served_to, 'served_at', s.served_at, 'value_digest', s.value_digest) ORDER BY s.served_at), '[]'::jsonb)
    INTO v_servings FROM products.metric_servings s WHERE s.model_id = p_model_id AND s.served_at >= c.certified_at AND s.view IN ('executive', 'analyst');
  -- B92 md: the uses of the exposed servings — the reports and decisions the withdrawal affects
  SELECT coalesce(jsonb_agg(jsonb_build_object('use_id', u.use_id, 'serving_id', u.serving_id, 'used_in_kind', u.used_in_kind, 'used_in_id', u.used_in_id, 'used_by', u.used_by, 'used_at', u.used_at,
                                               'certified', u.certified) ORDER BY u.used_at), '[]'::jsonb)
    INTO v_uses FROM products.metric_serving_uses u JOIN products.metric_servings s ON s.serving_id = u.serving_id
   WHERE u.model_id = p_model_id AND s.served_at >= c.certified_at AND s.view IN ('executive', 'analyst');
  UPDATE products.metric_certifications SET state = p_state, withdrawn_at = clock_timestamp(), withdrawn_by = p_actor, withdrawal_reason = btrim(p_reason) WHERE certification_id = c.certification_id;
  UPDATE products.semantic_models SET state = p_state, certified_version = NULL, last_valid_version = c.version, updated_at = clock_timestamp() WHERE model_id = p_model_id;
  INSERT INTO products.product_events (event_id, scope, tenant_id, domain_id, product_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', m.tenant_id, m.domain_id, p_model_id, 'metric.certification_withdrawn', p_actor,
          jsonb_build_object('certification_id', c.certification_id, 'version', c.version, 'state', p_state, 'reason', btrim(p_reason), 'detail', coalesce(p_detail, '{}'::jsonb),
                             'last_valid_version', c.version, 'servings_exposed', v_servings,
                             'uses_exposed', v_uses), p_correlation);   -- B92 md
  RETURN jsonb_build_object('certification_id', c.certification_id, 'version', c.version, 'state', p_state, 'reason', btrim(p_reason), 'event_id', p_event_id, 'servings_exposed', v_servings,
                            'uses_exposed', v_uses,   -- B92 md
                            'consequence', 'the last valid version ' || c.version || ' is frozen and stays readable; the executive view serves nothing until the owner re-certifies');
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION products.metric_withdraw(uuid,text,text,jsonb,uuid,uuid,uuid) FROM PUBLIC;

-- §MD.7 THE READS (INVOKER, under the caller's RLS — N-01) ─────────────────────────────────────────────────────────────────────────────────────
/* The field-level diff between two versions of a definition (both readable to the caller), with their digests. */
CREATE OR REPLACE FUNCTION analytics.definition_diff(p_from uuid, p_to uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = analytics, pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object('from', jsonb_build_object('definition_id', a.definition_id, 'metric_key', a.metric_key, 'version', a.version, 'state', a.state, 'digest', a.digest),
                            'to', jsonb_build_object('definition_id', b.definition_id, 'metric_key', b.metric_key, 'version', b.version, 'state', b.state, 'digest', b.digest),
                            'changed', analytics.definition_diff_of(to_jsonb(a), to_jsonb(b)))
    FROM analytics.metric_definitions a, analytics.metric_definitions b WHERE a.definition_id = p_from AND b.definition_id = p_to
$$;
GRANT EXECUTE ON FUNCTION analytics.definition_diff(uuid, uuid) TO eye_app, eye_commit;
