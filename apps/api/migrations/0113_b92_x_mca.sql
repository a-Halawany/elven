-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0113 §MCA — CP-6 B92 COMPUTATIONS A: the product metrics of decisions, strategy, foresight, warnings and forecasts (App M MET-001..005,
-- MET-019..030; V1 V01-T-046's measures with a source in the product; ES-40-008's two new indicators — residual R1 of §B36.12 row 9).
-- Part-local; applies ALONE on 0001–0112 + the 0113 prelude. Nothing of 0001–0112 or of the prelude is re-declared here.
--
-- Each computation keeps the prelude's §0.7 CONTRACT: analytics.mc_<key>(p_tenant, p_domain, p_from, p_to, p_as_of, p_scope, p_cohort, p_params)
-- RETURNS jsonb, SECURITY DEFINER, N-01 read-scope guard first; it reads ONLY rows recorded at or before p_as_of (replay), restricts to the
-- window on the definition's clock, applies the scope by its registered rule and the cohort over its registered dimensions — never a person;
-- it returns the RECORDS (the port derives n, the value and the uncertainty from them) with every exclusion's reason, and the reasons that
-- make the result indeterminate (an absent input, an unsupported clock). Records name RECORDS (packages, warnings, outcomes …) and ROLES —
-- never a principal id (D4: no employee-performance inference).
--
-- The computations WRAP the product's existing meanings and never re-derive a different one: decision.decision_metrics (outcome linkage,
-- the option criteria), decision.recommendation_completeness (alternatives, uncertainty), decision.dsp_citation_states (a citation's
-- standing), prediction.evaluate_warnings (feedback rates, the acknowledgement clock), executive.metrics (time to understanding, decision
-- latency), executive.evaluate_attention_queue (precision), ForecastingService.calibration (covered = q10 ≤ observed ≤ q90 on the outcome
-- ledger). Where the wrapped read is evaluated NOW (decision_metrics, dsp_citation_states), the same predicate is evaluated here AT p_as_of
-- (a replay must reproduce) — said on each contract.
--
-- CLAIMS: this is SOFTWARE CAPABILITY. The harness proves it on SYNTHETIC planted records; the act demonstrates it on NORDWERK's SYNTHETIC
-- demonstration records; neither is real-provider or signed acceptance (R2). A synthetic channel's receipts (demo-mailbox) are excluded from
-- latency unless a definition admits them, and then said.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- §MCA.0 HELPERS (internal; no runtime grant) ─────────────────────────────────────────────────────────────────────────────────────────────
/* lower-cased text[] of a scope key (objective_ids, entity_ids, series_keys, geographies); {} when absent. */
CREATE OR REPLACE FUNCTION analytics.mca_txt(p_scope jsonb, p_key text) RETURNS text[]
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT coalesce((SELECT array_agg(lower(x)) FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(p_scope -> p_key) = 'array' THEN p_scope -> p_key ELSE '[]'::jsonb END) x), '{}')
$$;
/* lower-cased text[] of any text[]. */
CREATE OR REPLACE FUNCTION analytics.mca_lower(p text[]) RETURNS text[]
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$ SELECT coalesce((SELECT array_agg(lower(x)) FROM unnest(p) x WHERE x IS NOT NULL), '{}') $$;
/* lower-cased text[] of a jsonb array of strings (or {} for anything else). */
CREATE OR REPLACE FUNCTION analytics.mca_jtxt(p jsonb) RETURNS text[]
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT coalesce((SELECT array_agg(lower(x #>> '{}')) FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p) = 'array' THEN p ELSE '[]'::jsonb END) x WHERE jsonb_typeof(x) = 'string'), '{}')
$$;
/* THE SCOPE RULE (PARTS.md vocabulary): what a record names (objectives, entities, series, geographies) against the scope → the matches
   ("objective", "entity", "series", "geography"); {domain} for a NULL scope (the whole domain); {} = outside the scope. */
CREATE OR REPLACE FUNCTION analytics.mca_scope_via(p_scope jsonb, p_objectives text[], p_entities text[], p_series text[], p_geographies text[]) RETURNS text[]
LANGUAGE sql IMMUTABLE SET search_path = analytics, pg_catalog, pg_temp AS $$
  SELECT CASE WHEN p_scope IS NULL THEN ARRAY['domain'] ELSE array_remove(ARRAY[
    CASE WHEN analytics.mca_txt(p_scope, 'objective_ids') && analytics.mca_lower(p_objectives) THEN 'objective' END,
    CASE WHEN analytics.mca_txt(p_scope, 'entity_ids') && analytics.mca_lower(p_entities) THEN 'entity' END,
    CASE WHEN analytics.mca_txt(p_scope, 'series_keys') && analytics.mca_lower(p_series) THEN 'series' END,
    CASE WHEN analytics.mca_txt(p_scope, 'geographies') && analytics.mca_lower(p_geographies) THEN 'geography' END], NULL) END
$$;
/* The clock check: a computation reading on `p_supported` clocks only; the definition's clock otherwise is a REASON (mixing clocks inside
   one population is never done silently — D7). */
CREATE OR REPLACE FUNCTION analytics.mca_clock_reasons(p_params jsonb, p_supported text[]) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT CASE WHEN coalesce(p_params ->> 'clock', 'record') = ANY (p_supported) THEN '[]'::jsonb
              ELSE jsonb_build_array(format('the definition''s clock is %s; this computation reads on the %s clock only — a different clock is not substituted', coalesce(p_params ->> 'clock', 'record'), array_to_string(p_supported, ' / '))) END
$$;
/* The §0.7 answer: the counts derived from the records themselves (the port cross-checks them). */
CREATE OR REPLACE FUNCTION analytics.mca_out(p_kind text, p_records jsonb, p_reasons jsonb, p_quality jsonb, p_distinct_actors int DEFAULT NULL, p_value numeric DEFAULT NULL) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object('kind', p_kind,
    'numerator', CASE WHEN p_kind = 'rate' THEN (SELECT count(*) FROM jsonb_array_elements(coalesce(p_records, '[]'::jsonb)) r WHERE r ->> 'role' = 'numerator') END,
    'denominator', CASE WHEN p_kind = 'rate' THEN (SELECT count(*) FROM jsonb_array_elements(coalesce(p_records, '[]'::jsonb)) r WHERE r ->> 'role' IN ('numerator', 'denominator')) END,
    'value', p_value, 'distinct_actors', p_distinct_actors,
    'records', coalesce(p_records, '[]'::jsonb), 'reasons', coalesce(p_reasons, '[]'::jsonb), 'quality', coalesce(p_quality, '{}'::jsonb))
$$;
/* A record of the §0.7 shape. */
CREATE OR REPLACE FUNCTION analytics.mca_rec(p_kind text, p_id text, p_role text, p_reason text, p_detail jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT jsonb_strip_nulls(jsonb_build_object('kind', p_kind, 'id', p_id, 'role', p_role, 'reason', p_reason)) || jsonb_build_object('detail', coalesce(p_detail, '{}'::jsonb))
$$;
/* Whether a principal is an active-or-past HUMAN (an agent's act is never a human's). */
CREATE OR REPLACE FUNCTION analytics.mca_is_human(p_principal uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path = identity, pg_catalog, pg_temp AS $$ SELECT coalesce((SELECT p.kind = 'human' FROM identity.principals p WHERE p.id = p_principal), false) $$;
/* The first of p_roles (in their order) the principal HELD at p_at at the domain (a DOMAIN or TENANT binding, or PLATFORM) — a ROLE, the
   only grain a cohort may carry; NULL when none. */
CREATE OR REPLACE FUNCTION analytics.mca_role_at(p_principal uuid, p_tenant uuid, p_domain uuid, p_roles text[], p_at timestamptz) RETURNS text
LANGUAGE sql STABLE SET search_path = identity, pg_catalog, pg_temp AS $$
  SELECT u.r FROM unnest(p_roles) WITH ORDINALITY AS u(r, o)
   WHERE EXISTS (SELECT 1 FROM identity.role_bindings b JOIN identity.principals p ON p.id = b.principal_id
                  WHERE b.principal_id = p_principal AND p.kind = 'human' AND b.role_code = u.r AND b.created_at <= p_at AND (b.revoked_at IS NULL OR b.revoked_at > p_at)
                    AND (b.scope = 'PLATFORM' OR (b.tenant_id = p_tenant AND (b.scope = 'TENANT' OR (b.scope = 'DOMAIN' AND b.domain_id = p_domain)))))
   ORDER BY u.o LIMIT 1
$$;
/* A CITATION'S STANDING AS OF an instant — decision.dsp_citation_states' rule evaluated at p_as_of (it reads now): a run is standing when
   completed by then and not invalidated by then; a forecast when issued by then and not withdrawn by then; a canonical object (evidence,
   claim …) when its newest version recorded by then is neither disputed nor withdrawn/deleted. 'missing' when nothing is recorded. */
CREATE OR REPLACE FUNCTION analytics.mca_standing(p_kind text, p_id uuid, p_tenant uuid, p_domain uuid, p_as_of timestamptz) RETURNS text
LANGUAGE plpgsql STABLE SET search_path = analytics, simulation, prediction, objects, pg_catalog, pg_temp AS $$
DECLARE s text;
BEGIN
  IF p_id IS NULL THEN RETURN 'missing'; END IF;
  IF p_kind = 'run' THEN
    SELECT CASE WHEN r.run_id IS NULL THEN 'missing' WHEN r.state <> 'completed' OR r.completed_at IS NULL OR r.completed_at > p_as_of THEN 'not_completed'
                WHEN r.validity = 'invalidated' AND r.invalidated_at <= p_as_of THEN 'withdrawn' ELSE 'standing' END INTO s
      FROM (SELECT 1) one LEFT JOIN simulation.runs_current r ON r.run_id = p_id AND r.tenant_id = p_tenant AND r.domain_id = p_domain AND r.opened_at <= p_as_of;
  ELSIF p_kind = 'forecast' THEN
    SELECT CASE WHEN f.forecast_id IS NULL THEN 'missing' WHEN f.withdrawn_at IS NOT NULL AND f.withdrawn_at <= p_as_of THEN 'withdrawn' ELSE 'standing' END INTO s
      FROM (SELECT 1) one LEFT JOIN prediction.forecasts_current f ON f.forecast_id = p_id AND f.tenant_id = p_tenant AND f.domain_id = p_domain AND f.issued_at <= p_as_of;
  ELSE
    SELECT CASE WHEN co.object_id IS NULL THEN 'missing' WHEN co.lifecycle_state = 'disputed' THEN 'disputed' WHEN co.lifecycle_state IN ('withdrawn', 'deleted') THEN 'withdrawn' ELSE 'standing' END INTO s
      FROM (SELECT 1) one LEFT JOIN LATERAL (SELECT x.object_id, x.lifecycle_state FROM objects.canonical_objects x
                                              WHERE x.object_id = p_id AND x.tenant_id = p_tenant AND (x.domain_id = p_domain OR x.domain_id IS NULL) AND x.recorded_at <= p_as_of
                                              ORDER BY x.object_version DESC LIMIT 1) co ON true;
  END IF;
  RETURN coalesce(s, 'missing');
END $$;
/* A decision package version's scope matches (the package rule): its objectives, or the ids its options cite (entities), against the scope. */
CREATE OR REPLACE FUNCTION analytics.mca_package_scope(p_scope jsonb, p_package uuid, p_version int, p_objectives jsonb) RETURNS text[]
LANGUAGE sql STABLE SET search_path = analytics, decision, pg_catalog, pg_temp AS $$
  SELECT CASE WHEN p_scope IS NULL THEN ARRAY['domain'] ELSE analytics.mca_scope_via(p_scope, analytics.mca_jtxt(p_objectives),
    coalesce((SELECT array_agg(c ->> 'id') FROM decision.options o CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(o.consequences) = 'array' THEN o.consequences ELSE '[]'::jsonb END) c
               WHERE o.package_id = p_package AND o.version = p_version AND c ->> 'id' IS NOT NULL), '{}'), '{}', '{}') END
$$;
/* A warning's scope matches (the warning rule): its `affected` objectives, assets (entities or series keys) and geographies; the series of
   the forecast it was raised on. */
CREATE OR REPLACE FUNCTION analytics.mca_warning_scope(p_scope jsonb, p_affected jsonb, p_forecast uuid) RETURNS text[]
LANGUAGE sql STABLE SET search_path = analytics, prediction, pg_catalog, pg_temp AS $$
  SELECT CASE WHEN p_scope IS NULL THEN ARRAY['domain'] ELSE analytics.mca_scope_via(p_scope,
    analytics.mca_jtxt(p_affected -> 'objectives'), analytics.mca_jtxt(p_affected -> 'assets'),
    analytics.mca_jtxt(p_affected -> 'assets') || coalesce((SELECT ARRAY[f.series_key] FROM prediction.forecasts_current f WHERE f.forecast_id = p_forecast), '{}'),
    analytics.mca_jtxt(p_affected -> 'geographies')) END
$$;
/* A forecast's (or an outcome's) scope matches (the forecast rule): its series key in series_keys, or its subject entity in entity_ids. */
CREATE OR REPLACE FUNCTION analytics.mca_forecast_scope(p_scope jsonb, p_series text, p_subject uuid) RETURNS text[]
LANGUAGE sql IMMUTABLE SET search_path = analytics, pg_catalog, pg_temp AS $$
  SELECT CASE WHEN p_scope IS NULL THEN ARRAY['domain'] ELSE analytics.mca_scope_via(p_scope, '{}', ARRAY[p_subject::text], ARRAY[p_series], '{}') END
$$;
/* The note a computation adds when it ignores the scope (domain-wide by nature). */
CREATE OR REPLACE FUNCTION analytics.mca_scope_ignored(p_scope jsonb, p_why text) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT CASE WHEN p_scope IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(format('this metric ignores the scope %s (domain-wide by nature: %s)', p_scope ->> 'scope_key', p_why)) END
$$;
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['analytics.mca_txt(jsonb,text)', 'analytics.mca_lower(text[])', 'analytics.mca_jtxt(jsonb)', 'analytics.mca_scope_via(jsonb,text[],text[],text[],text[])',
                           'analytics.mca_clock_reasons(jsonb,text[])', 'analytics.mca_out(text,jsonb,jsonb,jsonb,int,numeric)', 'analytics.mca_rec(text,text,text,text,jsonb)',
                           'analytics.mca_is_human(uuid)', 'analytics.mca_role_at(uuid,uuid,uuid,text[],timestamptz)', 'analytics.mca_standing(text,uuid,uuid,uuid,timestamptz)',
                           'analytics.mca_package_scope(jsonb,uuid,int,jsonb)', 'analytics.mca_warning_scope(jsonb,jsonb,uuid)', 'analytics.mca_forecast_scope(jsonb,text,uuid)',
                           'analytics.mca_scope_ignored(jsonb,text)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
  END LOOP;
END $$;

-- §MCA.1 DECISIONS ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/* MET-001 STRATEGIC LOOP CLOSURE (rate; the scene's metric #1; DESIGN D9). POPULATION: the decision packages COMMITTED in the window (their
   latest commitment in [from, to) on the record clock, recorded by as_of), in scope by the package rule. NUMERATOR: those with ALL SIX links,
   each judged AS OF p_as_of:
     objective  — the committed version names ≥ 1 objective that resolves to a strategy objective (graph.strategy_current OBJ) of the domain;
     evidence   — ≥ 1 cited evidence or claim object STANDING (decision_metrics' `with_evidence` kinds; dsp_citation_states' standing at as_of);
     foresight  — a cited run standing, a cited forecast standing, a scenario reached through a cited run (decision.dsp_scenarios_of), or an
                  active scenario set of the package (bound in decision.package_scenario_sets, or declared for it — scenario_sets.package_id);
     commitment — the commitment itself (met by construction for a committed package — shown, not hidden) with its tracked items counted;
     outcome    — ≥ 1 outcome recorded on the committed version AND ≥ 1 outcome assessment (decision_metrics' outcome_linkage.linked);
     learning   — a governed lesson (decision.lessons) or the closure's lessons record (package.closed / commitment.closed with lessons).
   Every record carries its LINK VECTOR (each link met or not, with what it rests on) and the missing links named. */
CREATE OR REPLACE FUNCTION analytics.mc_met001_loop_closure(p_tenant uuid, p_domain uuid, p_from timestamptz, p_to timestamptz, p_as_of timestamptz, p_scope jsonb, p_cohort jsonb, p_params jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = analytics, decision, graph, simulation, prediction, pg_catalog, pg_temp AS $$
DECLARE r record; v_recs jsonb := '[]'::jsonb; v_via text[]; v_obj text[]; v_ev int; v_runs int; v_fc int; v_scn int; v_sets int; v_items int; v_out int; v_ass int; v_les int; v_clo int;
        v_links jsonb; v_missing text[]; v_n int := 0; v_syn int := 0;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'MET-001 loop closure: committed decision packages and their six links');
  FOR r IN
    SELECT DISTINCT ON (c.package_id) c.package_id, c.commitment_id, c.version, c.committed_at, p.synthetic_state, v.objectives
      FROM decision.commitments c JOIN decision.packages_current p ON p.package_id = c.package_id
      JOIN decision.package_versions v ON v.package_id = c.package_id AND v.version = c.version
     WHERE c.tenant_id = p_tenant AND c.domain_id = p_domain AND c.committed_at >= p_from AND c.committed_at < p_to AND c.committed_at <= p_as_of
     ORDER BY c.package_id, c.committed_at DESC, c.commitment_id
  LOOP
    v_via := analytics.mca_package_scope(p_scope, r.package_id, r.version, r.objectives);
    CONTINUE WHEN cardinality(v_via) = 0;
    SELECT coalesce(array_agg(o ORDER BY o), '{}') INTO v_obj FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(r.objectives) = 'array' THEN r.objectives ELSE '[]'::jsonb END) o
     WHERE EXISTS (SELECT 1 FROM graph.strategy_current s WHERE s.strategy_object_id::text = lower(o) AND s.tenant_id = p_tenant AND s.domain_id = p_domain AND s.object_type = 'OBJ' AND s.declared_at <= p_as_of);
    SELECT count(*) FILTER (WHERE x.kind IN ('evidence', 'claim') AND x.standing = 'standing'), count(*) FILTER (WHERE x.kind = 'run' AND x.standing = 'standing'),
           count(*) FILTER (WHERE x.kind = 'forecast' AND x.standing = 'standing')
      INTO v_ev, v_runs, v_fc
      FROM (SELECT c ->> 'kind' AS kind, analytics.mca_standing(c ->> 'kind', (c ->> 'id')::uuid, p_tenant, p_domain, p_as_of) AS standing
              FROM decision.options o CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(o.consequences) = 'array' THEN o.consequences ELSE '[]'::jsonb END) c
             WHERE o.package_id = r.package_id AND o.version = r.version AND o.set_at <= p_as_of AND coalesce(c ->> 'id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') x;
    SELECT count(DISTINCT s.scenario_id) INTO v_scn FROM decision.dsp_scenarios_of(r.package_id, r.version) s;
    SELECT count(DISTINCT x.set_id) INTO v_sets FROM (SELECT b.set_id FROM decision.package_scenario_sets b WHERE b.package_id = r.package_id AND b.bound_at <= p_as_of
                                                     UNION SELECT s.set_id FROM prediction.scenario_sets s WHERE s.package_id = r.package_id AND s.tenant_id = p_tenant AND s.domain_id = p_domain
                                                                                                       AND s.activated_at IS NOT NULL AND s.activated_at <= p_as_of) x;
    SELECT count(*) INTO v_items FROM decision.commitment_items i WHERE i.commitment_id = r.commitment_id AND i.created_at <= p_as_of;
    SELECT count(*) INTO v_out FROM decision.outcomes o WHERE o.package_id = r.package_id AND o.version = r.version AND o.recorded_at <= p_as_of;
    SELECT count(*) INTO v_ass FROM decision.outcome_assessments a WHERE a.package_id = r.package_id AND a.assessed_at <= p_as_of;
    SELECT count(*) INTO v_les FROM decision.lessons l WHERE l.package_id = r.package_id AND l.linked_at <= p_as_of;
    SELECT count(*) INTO v_clo FROM decision.package_events e WHERE e.package_id = r.package_id AND e.event IN ('package.closed', 'commitment.closed') AND e.occurred_at <= p_as_of
       AND length(btrim(coalesce(e.details ->> 'lessons', ''))) > 0;
    v_links := jsonb_build_object(
      'objective', jsonb_build_object('met', cardinality(v_obj) > 0, 'objectives', to_jsonb(v_obj)),
      'evidence', jsonb_build_object('met', v_ev > 0, 'standing_evidence_citations', v_ev),
      'foresight', jsonb_build_object('met', v_runs + v_fc + v_scn + v_sets > 0, 'standing_runs', v_runs, 'standing_forecasts', v_fc, 'scenarios_via_runs', v_scn, 'bound_scenario_sets', v_sets),
      'commitment', jsonb_build_object('met', true, 'commitment_id', r.commitment_id, 'items', v_items, 'note', 'met by construction for a committed package'),
      'outcome', jsonb_build_object('met', v_out > 0 AND v_ass > 0, 'outcomes_recorded', v_out, 'assessments', v_ass),
      'learning', jsonb_build_object('met', v_les + v_clo > 0, 'governed_lessons', v_les, 'closure_lessons_records', v_clo));
    SELECT coalesce(array_agg(k ORDER BY k), '{}') INTO v_missing FROM jsonb_each(v_links) e(k, v) WHERE NOT (v ->> 'met')::boolean;
    v_n := v_n + 1; v_syn := v_syn + CASE WHEN r.synthetic_state THEN 1 ELSE 0 END;
    v_recs := v_recs || analytics.mca_rec('decision_package', r.package_id::text, CASE WHEN cardinality(v_missing) = 0 THEN 'numerator' ELSE 'denominator' END, NULL,
      jsonb_build_object('version', r.version, 'committed_at', r.committed_at, 'links', v_links, 'missing', to_jsonb(v_missing), 'scope_via', to_jsonb(v_via), 'synthetic', r.synthetic_state));
  END LOOP;
  RETURN analytics.mca_out('rate', v_recs, analytics.mca_clock_reasons(p_params, ARRAY['record']),
    jsonb_build_object('clock', 'record', 'window_field', 'decision.commitments.committed_at', 'synthetic_share', CASE WHEN v_n = 0 THEN NULL ELSE round(v_syn::numeric / v_n, 4) END,
                       'links', jsonb_build_array('objective', 'evidence', 'foresight', 'commitment', 'outcome', 'learning'),
                       'notes', jsonb_build_array('each link judged AS OF the result''s as-of (decision_metrics'' predicates, which read now, evaluated at as-of so a replay reproduces)')));
END $$;

/* MET-002 DECISION PACKAGE COMPLETENESS (rate). POPULATION: the package versions that REACHED THE GATE in the window — p_params.gate
   'ready' (default: the B34 decision-ready gate action, decision.gate_actions action ready, its first `at`) or 'proposed' (the version's
   proposal) — in scope by the package rule; cohort decision_class (packages_current.decision_class). NUMERATOR: all six of App M's elements
   present AT THE GATE INSTANT: evidence (≥ 1 standing evidence/claim/run citation — dsp_citation_states' kinds), alternatives (decision_metrics'
   `options` ≥ 2 AND exactly one `status_quo`), risks (the version's risks named), dissent (≥ 1 recorded position on the version — the product
   has no "no dissent" declaration, so an unasked dissent is absent, said), explanation (an explanation of the version, decision.explanations),
   authority (the version's approver policy). */
CREATE OR REPLACE FUNCTION analytics.mc_met002_package_completeness(p_tenant uuid, p_domain uuid, p_from timestamptz, p_to timestamptz, p_as_of timestamptz, p_scope jsonb, p_cohort jsonb, p_params jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = analytics, decision, pg_catalog, pg_temp AS $$
DECLARE r record; v_recs jsonb := '[]'::jsonb; v_reasons jsonb; v_gate text := coalesce(p_params ->> 'gate', 'ready'); v_via text[]; v_ev int; v_opts int; v_sq int; v_dis int; v_xpl int;
        v_el jsonb; v_missing text[]; v_n int := 0; v_syn int := 0;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'MET-002 package completeness: package versions at the decision gate');
  v_reasons := analytics.mca_clock_reasons(p_params, ARRAY['record']);
  IF v_gate NOT IN ('ready', 'proposed') THEN v_reasons := v_reasons || to_jsonb(format('the definition names the gate %s; the gates are ready | proposed', v_gate)); END IF;
  FOR r IN
    SELECT g.package_id, g.version, g.gate_at, p.decision_class, p.synthetic_state, v.objectives, v.risks, v.approver_policy
      FROM ((SELECT DISTINCT ON (a.package_id, a.version) a.package_id, a.version, a.at AS gate_at FROM decision.gate_actions a
             WHERE v_gate = 'ready' AND a.tenant_id = p_tenant AND a.domain_id = p_domain AND a.action = 'ready' AND a.at <= p_as_of
             ORDER BY a.package_id, a.version, a.at)
            UNION ALL
            SELECT x.package_id, x.version, x.proposed_at FROM decision.package_versions x
             WHERE v_gate = 'proposed' AND x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.proposed_at IS NOT NULL AND x.proposed_at <= p_as_of) g
      JOIN decision.packages_current p ON p.package_id = g.package_id
      JOIN decision.package_versions v ON v.package_id = g.package_id AND v.version = g.version
     WHERE g.gate_at >= p_from AND g.gate_at < p_to
       AND (p_cohort ->> 'decision_class' IS NULL OR p.decision_class = p_cohort ->> 'decision_class')
     ORDER BY g.gate_at, g.package_id
  LOOP
    v_via := analytics.mca_package_scope(p_scope, r.package_id, r.version, r.objectives);
    CONTINUE WHEN cardinality(v_via) = 0;
    SELECT count(*) FILTER (WHERE analytics.mca_standing(c ->> 'kind', (c ->> 'id')::uuid, p_tenant, p_domain, r.gate_at) = 'standing') INTO v_ev
      FROM decision.options o CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(o.consequences) = 'array' THEN o.consequences ELSE '[]'::jsonb END) c
     WHERE o.package_id = r.package_id AND o.version = r.version AND o.set_at <= r.gate_at AND c ->> 'kind' IN ('evidence', 'claim', 'run')
       AND coalesce(c ->> 'id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
    SELECT count(*), count(*) FILTER (WHERE o.kind = 'status_quo') INTO v_opts, v_sq FROM decision.options o WHERE o.package_id = r.package_id AND o.version = r.version AND o.set_at <= r.gate_at;
    SELECT count(*) INTO v_dis FROM decision.dissent d WHERE d.package_id = r.package_id AND d.version = r.version AND d.recorded_at <= r.gate_at;
    SELECT count(*) INTO v_xpl FROM decision.explanations e WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain AND e.subject_kind = 'package_version' AND e.subject_id = r.package_id
       AND e.subject_version = r.version AND e.generated_at <= r.gate_at;
    v_el := jsonb_build_object(
      'evidence', jsonb_build_object('met', v_ev > 0, 'standing_citations', v_ev),
      'alternatives', jsonb_build_object('met', v_opts >= 2 AND v_sq = 1, 'options', v_opts, 'status_quo', v_sq),
      'risks', jsonb_build_object('met', jsonb_array_length(coalesce(r.risks, '[]'::jsonb)) > 0, 'named', jsonb_array_length(coalesce(r.risks, '[]'::jsonb))),
      'dissent', jsonb_build_object('met', v_dis > 0, 'positions_recorded', v_dis),
      'explanation', jsonb_build_object('met', v_xpl > 0, 'explanations', v_xpl),
      'authority', jsonb_build_object('met', r.approver_policy IS NOT NULL AND r.approver_policy <> '{}'::jsonb));
    SELECT coalesce(array_agg(k ORDER BY k), '{}') INTO v_missing FROM jsonb_each(v_el) e(k, v) WHERE NOT (v ->> 'met')::boolean;
    v_n := v_n + 1; v_syn := v_syn + CASE WHEN r.synthetic_state THEN 1 ELSE 0 END;
    v_recs := v_recs || analytics.mca_rec('package_version', format('%s@%s', r.package_id, r.version), CASE WHEN cardinality(v_missing) = 0 THEN 'numerator' ELSE 'denominator' END, NULL,
      jsonb_build_object('package_id', r.package_id, 'version', r.version, 'gate', v_gate, 'gate_at', r.gate_at, 'decision_class', r.decision_class, 'elements', v_el,
                         'missing', to_jsonb(v_missing), 'scope_via', to_jsonb(v_via), 'synthetic', r.synthetic_state));
  END LOOP;
  RETURN analytics.mca_out('rate', v_recs, v_reasons, jsonb_build_object('clock', 'record', 'gate', v_gate,
    'window_field', CASE v_gate WHEN 'ready' THEN 'decision.gate_actions.at (action ready)' ELSE 'decision.package_versions.proposed_at' END,
    'synthetic_share', CASE WHEN v_n = 0 THEN NULL ELSE round(v_syn::numeric / v_n, 4) END));
END $$;

/* MET-003 DECISION REPLAY SUCCESS (rate). POPULATION: the packages COMMITTED in the window (their latest commitment in it), in scope. Each
   one's LATEST replay of the committed version recorded by as_of (decision.replays): no unavailable input → numerator; unavailable inputs →
   denominator (named). A package NEVER REPLAYED is EXCLUDED with the reason "not replayed" and counted; when more than half the cohort is
   unreplayed the result is indeterminate — measured over the replays someone chose to run, the rate is biased (MAP §2 caveat). */
CREATE OR REPLACE FUNCTION analytics.mc_met003_replay_success(p_tenant uuid, p_domain uuid, p_from timestamptz, p_to timestamptz, p_as_of timestamptz, p_scope jsonb, p_cohort jsonb, p_params jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = analytics, decision, pg_catalog, pg_temp AS $$
DECLARE r record; rp record; v_recs jsonb := '[]'::jsonb; v_reasons jsonb; v_via text[]; v_total int := 0; v_unrep int := 0;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'MET-003 replay success: committed packages and their replays');
  v_reasons := analytics.mca_clock_reasons(p_params, ARRAY['record']);
  FOR r IN
    SELECT DISTINCT ON (c.package_id) c.package_id, c.version, c.committed_at, v.objectives
      FROM decision.commitments c JOIN decision.package_versions v ON v.package_id = c.package_id AND v.version = c.version
     WHERE c.tenant_id = p_tenant AND c.domain_id = p_domain AND c.committed_at >= p_from AND c.committed_at < p_to AND c.committed_at <= p_as_of
     ORDER BY c.package_id, c.committed_at DESC, c.commitment_id
  LOOP
    v_via := analytics.mca_package_scope(p_scope, r.package_id, r.version, r.objectives);
    CONTINUE WHEN cardinality(v_via) = 0;
    v_total := v_total + 1;
    SELECT x.replay_id, x.replayed_at, x.unavailable INTO rp FROM decision.replays x
     WHERE x.package_id = r.package_id AND x.version = r.version AND x.replayed_at <= p_as_of ORDER BY x.replayed_at DESC, x.replay_id DESC LIMIT 1;
    IF rp.replay_id IS NULL THEN
      v_unrep := v_unrep + 1;
      v_recs := v_recs || analytics.mca_rec('decision_package', r.package_id::text, 'excluded', 'not replayed: no replay of the committed version is recorded by the as-of',
                                            jsonb_build_object('version', r.version, 'committed_at', r.committed_at, 'scope_via', to_jsonb(v_via)));
    ELSE
      v_recs := v_recs || analytics.mca_rec('decision_package', r.package_id::text,
                                            CASE WHEN jsonb_array_length(coalesce(rp.unavailable, '[]'::jsonb)) = 0 THEN 'numerator' ELSE 'denominator' END, NULL,
                                            jsonb_build_object('version', r.version, 'committed_at', r.committed_at, 'replay_id', rp.replay_id, 'replayed_at', rp.replayed_at,
                                                               'unavailable', coalesce(rp.unavailable, '[]'::jsonb), 'scope_via', to_jsonb(v_via)));
    END IF;
  END LOOP;
  IF v_total > 0 AND v_unrep * 2 > v_total THEN
    v_reasons := v_reasons || to_jsonb(format('%s of the %s committed package(s) were never replayed: more than half the cohort is unmeasured, so a rate over the replays performed would be biased (a cohort replay is run first)', v_unrep, v_total));
  END IF;
  RETURN analytics.mca_out('rate', v_recs, v_reasons, jsonb_build_object('clock', 'record', 'window_field', 'decision.commitments.committed_at', 'cohort_size', v_total, 'not_replayed', v_unrep));
END $$;

/* MET-004 HUMAN AUTHORITY INTEGRITY (rate; dimension consequence_class). THE UNIVERSE of consequential effects (stated, a definitional
   choice): (a) DECISION COMMITMENTS (consequence class = the commitment's op_class) and (b) SIGNED ACTS (executive.signatures — metric
   certifications, publications, plan baselines, gate signatures …; class = the policy decision of the same correlation and action, else
   `unclassified`), recorded in the window. NUMERATOR: bound to an ELIGIBLE HUMAN (every approval a commitment names is an `approve` by a
   human principal on the same version digest, recorded before the commitment and not revoked before it; a signature's signer is a human),
   to a DIGEST (version/header digest; the signature's subject digest) AND to an AUDIT EVENT (audit.audit_events of the same correlation,
   recorded by as_of). Records name the effect and which binding failed — never the person. */
CREATE OR REPLACE FUNCTION analytics.mc_met004_authority_integrity(p_tenant uuid, p_domain uuid, p_from timestamptz, p_to timestamptz, p_as_of timestamptz, p_scope jsonb, p_cohort jsonb, p_params jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = analytics, decision, executive, audit, policy, pg_catalog, pg_temp AS $$
DECLARE r record; v_recs jsonb := '[]'::jsonb; v_human boolean; v_digest boolean; v_audit boolean; v_apr int; v_good int; v_class text; v_fail text[];
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'MET-004 authority integrity: commitments and signed acts with their approvals and audit');
  FOR r IN
    SELECT c.commitment_id, c.version_digest, c.header_digest, c.approvals, c.op_class, c.committed_at, c.correlation_id, c.package_id, c.version, c.policy_decision_id
      FROM decision.commitments c
     WHERE c.tenant_id = p_tenant AND c.domain_id = p_domain AND c.committed_at >= p_from AND c.committed_at < p_to AND c.committed_at <= p_as_of
       AND (p_cohort ->> 'consequence_class' IS NULL OR c.op_class = p_cohort ->> 'consequence_class')
     ORDER BY c.committed_at, c.commitment_id
  LOOP
    v_apr := jsonb_array_length(CASE WHEN jsonb_typeof(r.approvals) = 'array' THEN r.approvals ELSE '[]'::jsonb END);
    SELECT count(*) INTO v_good FROM jsonb_array_elements(CASE WHEN jsonb_typeof(r.approvals) = 'array' THEN r.approvals ELSE '[]'::jsonb END) x
      JOIN decision.approvals a ON a.approval_id::text = x ->> 'approval_id'
     WHERE a.package_id = r.package_id AND a.version = r.version AND a.decision = 'approve' AND a.version_digest = r.version_digest AND analytics.mca_is_human(a.approver_principal_id)
       AND a.recorded_at <= r.committed_at AND (a.revoked_at IS NULL OR a.revoked_at > r.committed_at);
    v_human := v_apr > 0 AND v_good = v_apr;
    v_digest := r.version_digest IS NOT NULL AND r.header_digest IS NOT NULL;
    v_audit := r.policy_decision_id IS NOT NULL AND EXISTS (SELECT 1 FROM audit.audit_events e WHERE e.correlation_id = r.correlation_id AND e.created_at <= p_as_of
                                                                AND (e.tenant_id = p_tenant OR e.tenant_id IS NULL));
    v_fail := array_remove(ARRAY[CASE WHEN NOT v_human THEN 'eligible_human' END, CASE WHEN NOT v_digest THEN 'digest' END, CASE WHEN NOT v_audit THEN 'audit' END], NULL);
    v_recs := v_recs || analytics.mca_rec('decision_commitment', r.commitment_id::text, CASE WHEN cardinality(v_fail) = 0 THEN 'numerator' ELSE 'denominator' END, NULL,
      jsonb_build_object('effect', 'decision commitment', 'consequence_class', r.op_class, 'at', r.committed_at, 'approvals_named', v_apr, 'approvals_eligible', v_good,
                         'eligible_human', v_human, 'digest', v_digest, 'audit', v_audit, 'failed', to_jsonb(v_fail)));
  END LOOP;
  FOR r IN
    SELECT s.signature_id, s.subject_kind, s.subject_digest, s.signer, s.bound_action, s.signed_at, s.correlation_id,
           coalesce((SELECT d.consequence_class FROM policy.policy_decisions d WHERE d.correlation_id = s.correlation_id AND d.action = s.bound_action AND d.created_at <= p_as_of
                      ORDER BY d.created_at LIMIT 1), 'unclassified') AS cclass
      FROM executive.signatures s
     WHERE s.tenant_id = p_tenant AND s.domain_id = p_domain AND s.signed_at >= p_from AND s.signed_at < p_to AND s.signed_at <= p_as_of
     ORDER BY s.signed_at, s.signature_id
  LOOP
    CONTINUE WHEN p_cohort ->> 'consequence_class' IS NOT NULL AND r.cclass IS DISTINCT FROM p_cohort ->> 'consequence_class';
    v_human := analytics.mca_is_human(r.signer);
    v_digest := r.subject_digest IS NOT NULL AND length(r.subject_digest) > 0;
    v_audit := EXISTS (SELECT 1 FROM audit.audit_events e WHERE e.correlation_id = r.correlation_id AND e.created_at <= p_as_of AND (e.tenant_id = p_tenant OR e.tenant_id IS NULL));
    v_fail := array_remove(ARRAY[CASE WHEN NOT v_human THEN 'eligible_human' END, CASE WHEN NOT v_digest THEN 'digest' END, CASE WHEN NOT v_audit THEN 'audit' END], NULL);
    v_recs := v_recs || analytics.mca_rec('signed_act', r.signature_id::text, CASE WHEN cardinality(v_fail) = 0 THEN 'numerator' ELSE 'denominator' END, NULL,
      jsonb_build_object('effect', r.subject_kind, 'bound_action', r.bound_action, 'consequence_class', r.cclass, 'at', r.signed_at, 'eligible_human', v_human, 'digest', v_digest,
                         'audit', v_audit, 'failed', to_jsonb(v_fail)));
  END LOOP;
  RETURN analytics.mca_out('rate', v_recs, analytics.mca_clock_reasons(p_params, ARRAY['record']),
    jsonb_build_object('clock', 'record', 'universe', jsonb_build_array('decision commitments (decision.commitments)', 'signed acts (executive.signatures)'),
                       'notes', analytics.mca_scope_ignored(p_scope, 'authority integrity is a property of every consequential effect of the domain')));
END $$;

/* MET-005 RECOMMENDATION EXPLANATION CLOSURE (rate). POPULATION: the recommendations recorded in the window that are DECISION-ACTIVE at the
   as-of (proposed or accepted for consideration then — not withdrawn, superseded or declined by then: those are excluded with the reason),
   in scope by their package. NUMERATOR: the five resolutions, each named on the record: evidence (the recommended option cites ≥ 1
   evidence, claim or run), assumptions (assumptions or analytical assumptions stated), methods (model outputs or option runs named),
   alternatives (≥ 2 interventions beside the status quo on the version — recommendation_completeness' `alternatives`), uncertainty (the
   recommended option rests on a completed run — recommendation_completeness' `uncertainty` — or the recommendation has an explanation, whose
   uncertainty block is mandatory). */
CREATE OR REPLACE FUNCTION analytics.mc_met005_explanation_closure(p_tenant uuid, p_domain uuid, p_from timestamptz, p_to timestamptz, p_as_of timestamptz, p_scope jsonb, p_cohort jsonb, p_params jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = analytics, decision, pg_catalog, pg_temp AS $$
DECLARE r record; v_recs jsonb := '[]'::jsonb; v_via text[]; v_cites int; v_sim boolean; v_int int; v_xpl int; v_el jsonb; v_missing text[]; v_off text;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'MET-005 explanation closure: decision-active recommendations');
  FOR r IN
    SELECT x.*, v.objectives FROM decision.recommendations x JOIN decision.package_versions v ON v.package_id = x.package_id AND v.version = x.version
     WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.recorded_at >= p_from AND x.recorded_at < p_to AND x.recorded_at <= p_as_of
     ORDER BY x.recorded_at, x.recommendation_id
  LOOP
    v_via := analytics.mca_package_scope(p_scope, r.package_id, r.version, r.objectives);
    CONTINUE WHEN cardinality(v_via) = 0;
    v_off := CASE WHEN r.withdrawn_at IS NOT NULL AND r.withdrawn_at <= p_as_of THEN 'withdrawn by the as-of: no longer decision-active'
                  WHEN r.superseded_at IS NOT NULL AND r.superseded_at <= p_as_of THEN 'superseded by the as-of: no longer decision-active'
                  WHEN r.state = 'declined' AND r.decided_at <= p_as_of THEN 'declined by the as-of: no longer decision-active' END;
    IF v_off IS NOT NULL THEN
      v_recs := v_recs || analytics.mca_rec('recommendation', r.recommendation_id::text, 'excluded', v_off, jsonb_build_object('package_id', r.package_id, 'version', r.version, 'author_kind', r.author_kind));
      CONTINUE;
    END IF;
    SELECT count(*) INTO v_cites FROM decision.options o CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(o.consequences) = 'array' THEN o.consequences ELSE '[]'::jsonb END) c
     WHERE o.package_id = r.package_id AND o.version = r.version AND o.key = r.option_key AND c ->> 'kind' IN ('evidence', 'claim', 'run');
    SELECT coalesce(bool_or(o.simulated), false) INTO v_sim FROM decision.options o WHERE o.package_id = r.package_id AND o.version = r.version AND o.key = r.option_key;
    SELECT count(*) INTO v_int FROM decision.options o WHERE o.package_id = r.package_id AND o.version = r.version AND o.kind = 'intervention' AND o.set_at <= p_as_of;
    SELECT count(*) INTO v_xpl FROM decision.explanations e WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain AND e.subject_kind = 'recommendation' AND e.subject_id = r.recommendation_id
       AND e.generated_at <= p_as_of;
    v_el := jsonb_build_object(
      'evidence', jsonb_build_object('met', v_cites > 0, 'citations', v_cites),
      'assumptions', jsonb_build_object('met', jsonb_array_length(r.assumptions) + jsonb_array_length(r.analytical_assumptions) > 0,
                                        'stated', jsonb_array_length(r.assumptions) + jsonb_array_length(r.analytical_assumptions)),
      'methods', jsonb_build_object('met', jsonb_array_length(r.model_outputs) + jsonb_array_length(r.option_runs) > 0, 'model_outputs', jsonb_array_length(r.model_outputs),
                                    'option_runs', jsonb_array_length(r.option_runs)),
      'alternatives', jsonb_build_object('met', v_int >= 2, 'interventions', v_int),
      'uncertainty', jsonb_build_object('met', v_sim OR v_xpl > 0, 'option_simulated', v_sim, 'explanations', v_xpl));
    SELECT coalesce(array_agg(k ORDER BY k), '{}') INTO v_missing FROM jsonb_each(v_el) e(k, v) WHERE NOT (v ->> 'met')::boolean;
    v_recs := v_recs || analytics.mca_rec('recommendation', r.recommendation_id::text, CASE WHEN cardinality(v_missing) = 0 THEN 'numerator' ELSE 'denominator' END, NULL,
      jsonb_build_object('package_id', r.package_id, 'version', r.version, 'option_key', r.option_key, 'author_kind', r.author_kind, 'resolutions', v_el, 'missing', to_jsonb(v_missing),
                         'scope_via', to_jsonb(v_via)));
  END LOOP;
  RETURN analytics.mca_out('rate', v_recs, analytics.mca_clock_reasons(p_params, ARRAY['record']),
    jsonb_build_object('clock', 'record', 'window_field', 'decision.recommendations.recorded_at', 'decision_active', 'proposed or accepted for consideration at the as-of'));
END $$;

-- §MCA.2 FORESIGHT: SIGNALS, WARNINGS, FORECASTS, SCENARIOS, RUNS, TWINS ────────────────────────────────────────────────────────────────

/* MET-019 WEAK SIGNAL PRECISION (rate; dimension detector — the detector key, or `analyst` for an analyst's nomination; "monitored, not
   optimized alone"). POPULATION: the nominations whose latest HUMAN disposition (prediction.signal_events signal.disposition /
   signal.escalated by a human, recorded by as_of) falls in the window, in scope (the signal's subject entity, or the warning raised from it).
   NUMERATOR: confirmed — `confirm`, or `escalate` (an escalation is the analyst's confirmation that raises a warning; MET-020 measures what
   followed). DENOMINATOR: `monitor`, `dismiss`. A disposition by an agent is not a human review: not in the population. */
CREATE OR REPLACE FUNCTION analytics.mc_met019_signal_precision(p_tenant uuid, p_domain uuid, p_from timestamptz, p_to timestamptz, p_as_of timestamptz, p_scope jsonb, p_cohort jsonb, p_params jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = analytics, prediction, pg_catalog, pg_temp AS $$
DECLARE r record; v_recs jsonb := '[]'::jsonb; v_via text[]; v_det text;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'MET-019 signal precision: human-dispositioned weak-signal nominations');
  FOR r IN
    SELECT s.signal_id, s.subject_kind, s.subject_id, s.nominator_kind, s.detector_key, s.synthetic_state, d.event, d.occurred_at,
           CASE WHEN d.event = 'signal.escalated' THEN 'escalate' ELSE d.details ->> 'disposition' END AS disposition,
           (SELECT w.affected FROM prediction.warnings_current w WHERE w.tenant_id = p_tenant AND w.domain_id = p_domain AND w.origin_kind = 'weak_signal'
               AND w.origin_ref ->> 'signal_id' = s.signal_id::text AND w.raised_at <= p_as_of ORDER BY w.raised_at LIMIT 1) AS warned_affected
      FROM prediction.signals_current s
      CROSS JOIN LATERAL (SELECT e.event, e.occurred_at, e.details FROM prediction.signal_events e
                           WHERE e.signal_id = s.signal_id AND e.event IN ('signal.disposition', 'signal.escalated') AND e.occurred_at <= p_as_of
                             AND analytics.mca_is_human(e.actor_principal_id)
                           ORDER BY e.occurred_at DESC, e.event_id DESC LIMIT 1) d
     WHERE s.tenant_id = p_tenant AND s.domain_id = p_domain AND s.created_at <= p_as_of AND d.occurred_at >= p_from AND d.occurred_at < p_to
     ORDER BY d.occurred_at, s.signal_id
  LOOP
    v_det := coalesce(r.detector_key, CASE WHEN r.nominator_kind = 'analyst' THEN 'analyst' ELSE r.nominator_kind END);
    CONTINUE WHEN p_cohort ->> 'detector' IS NOT NULL AND v_det IS DISTINCT FROM p_cohort ->> 'detector';
    v_via := CASE WHEN p_scope IS NULL THEN ARRAY['domain'] ELSE
               analytics.mca_scope_via(p_scope, analytics.mca_jtxt(r.warned_affected -> 'objectives'),
                                       CASE WHEN r.subject_kind = 'entity' THEN ARRAY[r.subject_id::text] ELSE '{}'::text[] END || analytics.mca_jtxt(r.warned_affected -> 'assets'),
                                       analytics.mca_jtxt(r.warned_affected -> 'assets'), analytics.mca_jtxt(r.warned_affected -> 'geographies')) END;
    CONTINUE WHEN cardinality(v_via) = 0;
    IF r.disposition NOT IN ('confirm', 'escalate', 'monitor', 'dismiss') OR r.disposition IS NULL THEN
      v_recs := v_recs || analytics.mca_rec('weak_signal', r.signal_id::text, 'excluded', format('the disposition event carries no recognised disposition (%s)', coalesce(r.disposition, 'none')), '{}'::jsonb);
      CONTINUE;
    END IF;
    v_recs := v_recs || analytics.mca_rec('weak_signal', r.signal_id::text, CASE WHEN r.disposition IN ('confirm', 'escalate') THEN 'numerator' ELSE 'denominator' END, NULL,
      jsonb_build_object('disposition', r.disposition, 'disposed_at', r.occurred_at, 'detector', v_det, 'nominator_kind', r.nominator_kind, 'synthetic', r.synthetic_state, 'scope_via', to_jsonb(v_via)));
  END LOOP;
  RETURN analytics.mca_out('rate', v_recs, analytics.mca_clock_reasons(p_params, ARRAY['record']),
    jsonb_build_object('clock', 'record', 'window_field', 'prediction.signal_events.occurred_at (the latest human disposition)',
                       'notes', jsonb_build_array('monitored, not optimized alone (App M): a precision read beside the lead time (MET-020) and the warnings that followed')));
END $$;

/* MET-020 WEAK SIGNAL LEAD TIME (duration, seconds). POPULATION: the warnings RAISED FROM A SIGNAL (origin_kind weak_signal, origin_ref
   signal_id) in the window, in scope by the warning rule. VALUE per warning: the warning's raise − the signal's first governed record
   (signals_current.created_at). "Material event or assessment" is read as the warning raised from the signal — the only recorded link. */
CREATE OR REPLACE FUNCTION analytics.mc_met020_signal_lead_time(p_tenant uuid, p_domain uuid, p_from timestamptz, p_to timestamptz, p_as_of timestamptz, p_scope jsonb, p_cohort jsonb, p_params jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = analytics, prediction, pg_catalog, pg_temp AS $$
DECLARE r record; v_recs jsonb := '[]'::jsonb; v_via text[];
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'MET-020 signal lead time: warnings raised from weak signals');
  FOR r IN
    SELECT w.warning_id, w.raised_at, w.affected, w.forecast_id, s.signal_id, s.created_at AS signal_at
      FROM prediction.warnings_current w
      LEFT JOIN prediction.signals_current s ON s.signal_id::text = w.origin_ref ->> 'signal_id' AND s.tenant_id = p_tenant AND s.domain_id = p_domain AND s.created_at <= p_as_of
     WHERE w.tenant_id = p_tenant AND w.domain_id = p_domain AND w.origin_kind = 'weak_signal' AND w.raised_at >= p_from AND w.raised_at < p_to AND w.raised_at <= p_as_of
     ORDER BY w.raised_at, w.warning_id
  LOOP
    v_via := analytics.mca_warning_scope(p_scope, r.affected, r.forecast_id);
    CONTINUE WHEN cardinality(v_via) = 0;
    IF r.signal_id IS NULL THEN
      v_recs := v_recs || analytics.mca_rec('warning', r.warning_id::text, 'excluded', 'the originating signal is not readable in this domain by the as-of: the lead time has no start', '{}'::jsonb);
    ELSIF r.raised_at < r.signal_at THEN
      v_recs := v_recs || analytics.mca_rec('warning', r.warning_id::text, 'excluded', 'the warning precedes the signal''s record: the lead time is undefined', jsonb_build_object('signal_id', r.signal_id));
    ELSE
      v_recs := v_recs || analytics.mca_rec('warning', r.warning_id::text, 'included', NULL,
        jsonb_build_object('value', round(extract(epoch FROM r.raised_at - r.signal_at)::numeric, 3), 'signal_id', r.signal_id, 'signal_at', r.signal_at, 'raised_at', r.raised_at, 'scope_via', to_jsonb(v_via)));
    END IF;
  END LOOP;
  RETURN analytics.mca_out('duration', v_recs, analytics.mca_clock_reasons(p_params, ARRAY['record']),
    jsonb_build_object('clock', 'record', 'unit', 'seconds', 'start', 'prediction.signals_current.created_at', 'end', 'prediction.warnings_current.raised_at'));
END $$;

/* MET-021 WARNING DELIVERY LATENCY (duration, seconds; dimensions severity = the warning's level, channel). POPULATION: the DELIVERED
   deliveries (executive.attention_deliveries, state delivered, receipt instant receipt.at in the window, recorded by as_of) of the attention
   items whose subject is a warning in scope. VALUE: the receipt − the trigger (the warning's raise, raised_at). A SYNTHETIC channel's receipt
   (demo-mailbox …) is EXCLUDED unless the definition admits it (p_params.admit_synthetic = true) — then it is counted and quality says the
   synthetic share: a synthetic receipt demonstrates the software and never closes the real-delivery clause. */
CREATE OR REPLACE FUNCTION analytics.mc_met021_warning_delivery_latency(p_tenant uuid, p_domain uuid, p_from timestamptz, p_to timestamptz, p_as_of timestamptz, p_scope jsonb, p_cohort jsonb, p_params jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = analytics, executive, prediction, pg_catalog, pg_temp AS $$
DECLARE r record; v_recs jsonb := '[]'::jsonb; v_via text[]; v_admit boolean := coalesce((p_params ->> 'admit_synthetic')::boolean, false); v_inc int := 0; v_syn int := 0; v_notes jsonb := '[]'::jsonb;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'MET-021 warning delivery latency: delivery receipts of warnings');
  FOR r IN
    SELECT d.delivery_id, d.channel, d.synthetic_state, (d.receipt ->> 'at')::timestamptz AS receipt_at, w.warning_id, w.raised_at, w.affected, w.forecast_id, coalesce(w.level, 'unclassified') AS severity
      FROM executive.attention_deliveries d
      JOIN executive.attention_items i ON i.item_id = d.item_id AND i.subject_kind = 'warning'
      JOIN prediction.warnings_current w ON w.warning_id = i.subject_id AND w.tenant_id = p_tenant AND w.domain_id = p_domain
     WHERE d.tenant_id = p_tenant AND d.domain_id = p_domain AND d.state = 'delivered' AND jsonb_typeof(d.receipt -> 'at') = 'string'
       AND (d.receipt ->> 'at')::timestamptz >= p_from AND (d.receipt ->> 'at')::timestamptz < p_to AND (d.receipt ->> 'at')::timestamptz <= p_as_of AND d.created_at <= p_as_of
       AND (p_cohort ->> 'severity' IS NULL OR coalesce(w.level, 'unclassified') = p_cohort ->> 'severity')
       AND (p_cohort ->> 'channel' IS NULL OR d.channel = p_cohort ->> 'channel')
     ORDER BY (d.receipt ->> 'at')::timestamptz, d.delivery_id
  LOOP
    v_via := analytics.mca_warning_scope(p_scope, r.affected, r.forecast_id);
    CONTINUE WHEN cardinality(v_via) = 0;
    IF r.synthetic_state AND NOT v_admit THEN
      v_recs := v_recs || analytics.mca_rec('attention_delivery', r.delivery_id::text, 'excluded', format('a synthetic channel (%s): its receipt demonstrates the software, not a delivery; the definition does not admit synthetic receipts', r.channel),
                                            jsonb_build_object('warning_id', r.warning_id, 'channel', r.channel, 'severity', r.severity));
    ELSIF r.receipt_at < r.raised_at THEN
      v_recs := v_recs || analytics.mca_rec('attention_delivery', r.delivery_id::text, 'excluded', 'the receipt precedes the warning''s raise: the latency is undefined', jsonb_build_object('warning_id', r.warning_id));
    ELSE
      v_inc := v_inc + 1; v_syn := v_syn + CASE WHEN r.synthetic_state THEN 1 ELSE 0 END;
      v_recs := v_recs || analytics.mca_rec('attention_delivery', r.delivery_id::text, 'included', NULL,
        jsonb_build_object('value', round(extract(epoch FROM r.receipt_at - r.raised_at)::numeric, 3), 'warning_id', r.warning_id, 'trigger_at', r.raised_at, 'receipt_at', r.receipt_at,
                           'channel', r.channel, 'severity', r.severity, 'synthetic', r.synthetic_state, 'scope_via', to_jsonb(v_via)));
    END IF;
  END LOOP;
  IF v_syn > 0 THEN v_notes := v_notes || to_jsonb(format('%s of %s receipt(s) came through a synthetic channel the definition admits: the latency demonstrates the software, not a real delivery', v_syn, v_inc)); END IF;
  RETURN analytics.mca_out('duration', v_recs, analytics.mca_clock_reasons(p_params, ARRAY['record']),
    jsonb_build_object('clock', 'record', 'unit', 'seconds', 'start', 'prediction.warnings_current.raised_at (the trigger)', 'end', 'executive.attention_deliveries.receipt.at',
                       'admit_synthetic', v_admit, 'synthetic_share', CASE WHEN v_inc = 0 THEN NULL ELSE round(v_syn::numeric / v_inc, 4) END, 'notes', v_notes));
END $$;

/* MET-022 WARNING ACKNOWLEDGEMENT LATENCY (duration, seconds; the scene's metric #2; DESIGN D9; dimensions severity = the warning's level,
   role = the acknowledger's QUALIFYING ROLE — a role, never a person). POPULATION: the warnings in scope ACKNOWLEDGED in the window
   (acknowledged_at, the record clock, recorded by as_of) by a QUALIFIED role: the acknowledger held, at the acknowledgement instant, one of
   p_params.qualified_roles (default: the roles the acknowledge rule admits at the domain — domain_admin, strategy_owner, forecast_owner,
   risk_owner); an acknowledgement by anyone else is EXCLUDED (unqualified). START: the RECEIPT — the earliest delivered receipt (receipt.at)
   of the warning's attention item(s), recorded by as_of, from a non-synthetic channel (a synthetic one only when p_params.admit_synthetic).
   A warning with NO receipt is EXCLUDED ("no receipt instant") — unless the definition declares the PROXY (p_params.start = 'raised_proxy'):
   then its raise (raised_at) stands in, LABELLED on the record and counted in quality.proxy_share; likewise a warning acknowledged before any
   receipt (the person answered it before its delivery) — excluded as undefined when no proxy is declared. WORLD-CLOCK (timing_mode replay) warnings are EXCLUDED with the reason — their acknowledgement answers on the replay
   instant, not comparable with a live receipt (prediction.evaluate_warnings measures them on their own clock). For a role cohort the distinct
   acknowledgers are COUNTED (distinct_actors — the port applies k; no id leaves this function). */
CREATE OR REPLACE FUNCTION analytics.mc_met022_warning_ack_latency(p_tenant uuid, p_domain uuid, p_from timestamptz, p_to timestamptz, p_as_of timestamptz, p_scope jsonb, p_cohort jsonb, p_params jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = analytics, executive, prediction, identity, pg_catalog, pg_temp AS $$
DECLARE r record; v_recs jsonb := '[]'::jsonb; v_via text[]; v_roles text[]; v_role text; v_proxy boolean := coalesce(p_params ->> 'start', 'receipt') = 'raised_proxy';
        v_admit boolean := coalesce((p_params ->> 'admit_synthetic')::boolean, false); v_receipt timestamptz; v_channel text; v_syn boolean; v_start timestamptz; v_start_kind text;
        v_inc int := 0; v_prox int := 0; v_world int := 0; v_actors uuid[] := '{}'; v_reasons jsonb;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'MET-022 acknowledgement latency: acknowledged warnings, their receipts and the acknowledging roles');
  v_reasons := analytics.mca_clock_reasons(p_params, ARRAY['record']);
  IF coalesce(p_params ->> 'start', 'receipt') NOT IN ('receipt', 'raised_proxy') THEN v_reasons := v_reasons || to_jsonb(format('the definition names the start %s; the starts are receipt | raised_proxy', p_params ->> 'start')); END IF;
  v_roles := CASE WHEN jsonb_typeof(p_params -> 'qualified_roles') = 'array' THEN ARRAY(SELECT jsonb_array_elements_text(p_params -> 'qualified_roles'))
                  ELSE ARRAY['domain_admin', 'strategy_owner', 'forecast_owner', 'risk_owner'] END;
  FOR r IN
    SELECT w.warning_id, w.acknowledged_at, w.acknowledged_by, w.raised_at, w.timing_mode, w.affected, w.forecast_id, coalesce(w.level, 'unclassified') AS severity
      FROM prediction.warnings_current w
     WHERE w.tenant_id = p_tenant AND w.domain_id = p_domain AND w.acknowledged_at IS NOT NULL AND w.acknowledged_at >= p_from AND w.acknowledged_at < p_to AND w.acknowledged_at <= p_as_of
       AND (p_cohort ->> 'severity' IS NULL OR coalesce(w.level, 'unclassified') = p_cohort ->> 'severity')
     ORDER BY w.acknowledged_at, w.warning_id
  LOOP
    v_via := analytics.mca_warning_scope(p_scope, r.affected, r.forecast_id);
    CONTINUE WHEN cardinality(v_via) = 0;
    v_role := analytics.mca_role_at(r.acknowledged_by, p_tenant, p_domain, v_roles, r.acknowledged_at);
    CONTINUE WHEN p_cohort ->> 'role' IS NOT NULL AND v_role IS DISTINCT FROM p_cohort ->> 'role';
    IF r.timing_mode = 'replay' THEN
      v_world := v_world + 1;
      v_recs := v_recs || analytics.mca_rec('warning', r.warning_id::text, 'excluded', 'a replayed (world-clock) warning: its acknowledgement answers on the replay instant, not comparable with a live receipt',
                                            jsonb_build_object('severity', r.severity, 'timing_mode', r.timing_mode));
      CONTINUE;
    END IF;
    IF v_role IS NULL THEN
      v_recs := v_recs || analytics.mca_rec('warning', r.warning_id::text, 'excluded', format('acknowledged by a principal holding none of the qualified roles (%s) at the instant', array_to_string(v_roles, ', ')),
                                            jsonb_build_object('severity', r.severity));
      CONTINUE;
    END IF;
    SELECT (d.receipt ->> 'at')::timestamptz, d.channel, d.synthetic_state INTO v_receipt, v_channel, v_syn
      FROM executive.attention_deliveries d JOIN executive.attention_items i ON i.item_id = d.item_id
     WHERE i.tenant_id = p_tenant AND i.domain_id = p_domain AND i.subject_kind = 'warning' AND i.subject_id = r.warning_id AND d.state = 'delivered'
       AND jsonb_typeof(d.receipt -> 'at') = 'string' AND (d.receipt ->> 'at')::timestamptz <= p_as_of AND d.created_at <= p_as_of AND (v_admit OR NOT d.synthetic_state)
     ORDER BY (d.receipt ->> 'at')::timestamptz, d.delivery_id LIMIT 1;
    IF NOT FOUND THEN v_receipt := NULL; v_channel := NULL; v_syn := NULL; END IF;
    IF v_receipt IS NOT NULL AND r.acknowledged_at >= v_receipt THEN
      v_start := v_receipt; v_start_kind := 'receipt';
    ELSIF v_receipt IS NOT NULL AND v_proxy THEN
      v_start := r.raised_at; v_start_kind := 'raised_at (the definition''s declared proxy: acknowledged before any receipt)';
    ELSIF v_receipt IS NOT NULL THEN
      v_recs := v_recs || analytics.mca_rec('warning', r.warning_id::text, 'excluded', 'acknowledged before its receipt: the receipt-to-acknowledgement time is undefined and the definition declares no proxy',
                                            jsonb_build_object('severity', r.severity, 'role', v_role));
      CONTINUE;
    ELSIF v_proxy THEN
      v_start := r.raised_at; v_start_kind := 'raised_at (the definition''s declared proxy: no receipt recorded)';
    ELSE
      v_recs := v_recs || analytics.mca_rec('warning', r.warning_id::text, 'excluded', 'no receipt instant: the warning was never delivered through the delivery ledger by the as-of, and the definition declares no proxy',
                                            jsonb_build_object('severity', r.severity, 'role', v_role));
      CONTINUE;
    END IF;
    IF r.acknowledged_at < v_start THEN
      v_recs := v_recs || analytics.mca_rec('warning', r.warning_id::text, 'excluded', 'acknowledged before its start instant: the latency is undefined', jsonb_build_object('severity', r.severity, 'role', v_role));
      CONTINUE;
    END IF;
    v_inc := v_inc + 1; v_prox := v_prox + CASE WHEN v_start_kind = 'receipt' THEN 0 ELSE 1 END; v_actors := v_actors || r.acknowledged_by;
    v_recs := v_recs || analytics.mca_rec('warning', r.warning_id::text, 'included', NULL,
      jsonb_build_object('value', round(extract(epoch FROM r.acknowledged_at - v_start)::numeric, 3), 'start', v_start_kind, 'start_at', v_start, 'acknowledged_at', r.acknowledged_at,
                         'severity', r.severity, 'role', v_role, 'channel', v_channel, 'synthetic', v_syn, 'scope_via', to_jsonb(v_via)));
  END LOOP;
  RETURN analytics.mca_out('duration', v_recs, v_reasons,
    jsonb_build_object('clock', 'record', 'unit', 'seconds', 'start', CASE WHEN v_proxy THEN 'receipt (executive.attention_deliveries.receipt.at), else the declared proxy raised_at' ELSE 'receipt (executive.attention_deliveries.receipt.at)' END,
                       'end', 'prediction.warnings_current.acknowledged_at', 'qualified_roles', to_jsonb(v_roles), 'proxy_declared', v_proxy,
                       'proxy_share', CASE WHEN v_inc = 0 THEN NULL ELSE round(v_prox::numeric / v_inc, 4) END, 'world_clock_excluded', v_world, 'admit_synthetic', v_admit),
    CASE WHEN p_cohort ? 'role' THEN (SELECT count(DISTINCT a)::int FROM unnest(v_actors) a) END);
END $$;

/* MET-023 WARNING ACTION CLOSURE (rate; dimension severity). POPULATION: the MATERIAL warnings raised in the window (the attention engine
   judged the warning's item `material`; a warning with no item: level high or critical), in scope. NUMERATOR, all three by the as-of:
   an OWNED DISPOSITION (acknowledged or closed by a human), an ACTION (an attention act on the warning's item that acted, or an exposure
   response opened on the exposure the warning was raised from), an OUTCOME (feedback recorded on the warning, or its closure). */
CREATE OR REPLACE FUNCTION analytics.mc_met023_warning_action_closure(p_tenant uuid, p_domain uuid, p_from timestamptz, p_to timestamptz, p_as_of timestamptz, p_scope jsonb, p_cohort jsonb, p_params jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = analytics, executive, prediction, pg_catalog, pg_temp AS $$
DECLARE r record; v_recs jsonb := '[]'::jsonb; v_via text[]; v_disp boolean; v_act int; v_resp int; v_fb int; v_closed boolean; v_el jsonb; v_missing text[]; v_material boolean; v_basis text;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'MET-023 warning action closure: material warnings, their dispositions, actions and outcomes');
  FOR r IN
    SELECT w.*, coalesce(w.level, 'unclassified') AS severity,
           (SELECT i.outcome FROM executive.attention_items i WHERE i.tenant_id = p_tenant AND i.domain_id = p_domain AND i.subject_kind = 'warning' AND i.subject_id = w.warning_id
               AND i.created_at <= p_as_of ORDER BY i.created_at LIMIT 1) AS item_outcome
      FROM prediction.warnings_current w
     WHERE w.tenant_id = p_tenant AND w.domain_id = p_domain AND w.raised_at >= p_from AND w.raised_at < p_to AND w.raised_at <= p_as_of
       AND (p_cohort ->> 'severity' IS NULL OR coalesce(w.level, 'unclassified') = p_cohort ->> 'severity')
     ORDER BY w.raised_at, w.warning_id
  LOOP
    v_via := analytics.mca_warning_scope(p_scope, r.affected, r.forecast_id);
    CONTINUE WHEN cardinality(v_via) = 0;
    v_material := CASE WHEN r.item_outcome IS NOT NULL THEN r.item_outcome = 'material' ELSE r.level IN ('high', 'critical') END;
    v_basis := CASE WHEN r.item_outcome IS NOT NULL THEN 'the attention engine''s verdict on the warning''s item' ELSE 'the warning''s level (no attention item)' END;
    IF NOT v_material THEN
      v_recs := v_recs || analytics.mca_rec('warning', r.warning_id::text, 'excluded', format('not material (%s)', v_basis), jsonb_build_object('severity', r.severity, 'item_outcome', r.item_outcome));
      CONTINUE;
    END IF;
    v_disp := (r.acknowledged_at IS NOT NULL AND r.acknowledged_at <= p_as_of AND analytics.mca_is_human(r.acknowledged_by))
              OR (r.closed_at IS NOT NULL AND r.closed_at <= p_as_of AND analytics.mca_is_human(r.closed_by));
    SELECT count(*) INTO v_act FROM executive.attention_item_acts a JOIN executive.attention_items i ON i.item_id = a.item_id
     WHERE i.tenant_id = p_tenant AND i.domain_id = p_domain AND i.subject_kind = 'warning' AND i.subject_id = r.warning_id AND a.state = 'acted' AND a.settled_at <= p_as_of;
    SELECT count(*) INTO v_resp FROM prediction.exposure_responses x
     WHERE r.origin_kind = 'exposure' AND x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.exposure_id::text = r.origin_ref ->> 'exposure_id' AND x.opened_at <= p_as_of;
    SELECT count(*) INTO v_fb FROM prediction.warning_feedback f WHERE f.warning_id = r.warning_id AND f.given_at <= p_as_of;
    v_closed := r.closed_at IS NOT NULL AND r.closed_at <= p_as_of AND r.closure IS NOT NULL;
    v_el := jsonb_build_object('disposition', jsonb_build_object('met', v_disp, 'acknowledged', r.acknowledged_at IS NOT NULL AND r.acknowledged_at <= p_as_of, 'closed', v_closed),
                               'action', jsonb_build_object('met', v_act + v_resp > 0, 'attention_acts', v_act, 'exposure_responses', v_resp),
                               'outcome', jsonb_build_object('met', v_fb > 0 OR v_closed, 'feedback', v_fb, 'closure', v_closed));
    SELECT coalesce(array_agg(k ORDER BY k), '{}') INTO v_missing FROM jsonb_each(v_el) e(k, v) WHERE NOT (v ->> 'met')::boolean;
    v_recs := v_recs || analytics.mca_rec('warning', r.warning_id::text, CASE WHEN cardinality(v_missing) = 0 THEN 'numerator' ELSE 'denominator' END, NULL,
      jsonb_build_object('severity', r.severity, 'state_now', r.state, 'material_basis', v_basis, 'closure', v_el, 'missing', to_jsonb(v_missing), 'scope_via', to_jsonb(v_via)));
  END LOOP;
  RETURN analytics.mca_out('rate', v_recs, analytics.mca_clock_reasons(p_params, ARRAY['record']), jsonb_build_object('clock', 'record', 'window_field', 'prediction.warnings_current.raised_at'));
END $$;

/* MET-024 FORECAST CALIBRATION (rate against an approved BAND; the scene's metric #3; DESIGN D9; dimensions horizon, method). POPULATION:
   the SCORED LIVE OUTCOMES (prediction.outcome_ledger, recorded by as_of) whose known_at falls in the window (the record clock; the world
   clock reads target_at — the day the outcome is about), for forecasts in scope by the forecast rule. NUMERATOR: covered — q10 ≤ observed ≤
   q90, ForecastingService.calibration's rule as recorded on the ledger (`covered`). The value is the 10–90 COVERAGE; the definition's band
   (threshold.band, the T1 constant 80 % ± 5 pp made a governed band) judges it. BACKTESTS are a DIFFERENT definition (held-out history,
   labelled by mode retrospective/historical): those of the scope's series computed in the window are listed as CONTEXT records, never
   counted, never shown as live calibration. */
CREATE OR REPLACE FUNCTION analytics.mc_met024_forecast_calibration(p_tenant uuid, p_domain uuid, p_from timestamptz, p_to timestamptz, p_as_of timestamptz, p_scope jsonb, p_cohort jsonb, p_params jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = analytics, prediction, pg_catalog, pg_temp AS $$
DECLARE r record; v_recs jsonb := '[]'::jsonb; v_via text[]; v_world boolean := coalesce(p_params ->> 'clock', 'record') = 'world'; v_bt int := 0; v_long int := 0; v_notes jsonb := '[]'::jsonb;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'MET-024 forecast calibration: scored live outcomes');
  FOR r IN
    SELECT o.outcome_id, o.forecast_id, o.series_key, o.horizon_code, o.method, o.target_at, o.known_at, o.observed_value, o.q10, o.q50, o.q90, o.covered, o.label, f.subject_entity_id
      FROM prediction.outcome_ledger o LEFT JOIN prediction.forecasts_current f ON f.forecast_id = o.forecast_id
     WHERE o.tenant_id = p_tenant AND o.domain_id = p_domain AND o.recorded_at <= p_as_of
       AND ((NOT v_world AND o.known_at >= p_from AND o.known_at < p_to) OR (v_world AND o.target_at >= (p_from AT TIME ZONE 'UTC')::date AND o.target_at < (p_to AT TIME ZONE 'UTC')::date))
       AND (p_cohort ->> 'horizon' IS NULL OR o.horizon_code = p_cohort ->> 'horizon') AND (p_cohort ->> 'method' IS NULL OR o.method = p_cohort ->> 'method')
     ORDER BY o.known_at, o.outcome_id
  LOOP
    v_via := analytics.mca_forecast_scope(p_scope, r.series_key, r.subject_entity_id);
    CONTINUE WHEN cardinality(v_via) = 0;
    v_long := v_long + CASE WHEN r.horizon_code IN ('3y', '5y') THEN 1 ELSE 0 END;
    v_recs := v_recs || analytics.mca_rec('forecast_outcome', r.outcome_id::text, CASE WHEN r.covered THEN 'numerator' ELSE 'denominator' END, NULL,
      jsonb_build_object('forecast_id', r.forecast_id, 'series_key', r.series_key, 'horizon', r.horizon_code, 'method', r.method, 'target_at', r.target_at, 'known_at', r.known_at,
                         'observed', r.observed_value, 'q10', r.q10, 'q50', r.q50, 'q90', r.q90, 'covered', r.covered, 'label', r.label, 'scope_via', to_jsonb(v_via)));
  END LOOP;
  FOR r IN
    SELECT b.backtest_id, b.series_key, b.horizon_code, b.method, b.mode, b.coverage_80, b.origins, b.computed_at
      FROM prediction.backtests b
     WHERE b.tenant_id = p_tenant AND b.domain_id = p_domain AND b.computed_at >= p_from AND b.computed_at < p_to AND b.computed_at <= p_as_of
       AND (p_cohort ->> 'horizon' IS NULL OR b.horizon_code = p_cohort ->> 'horizon') AND (p_cohort ->> 'method' IS NULL OR b.method = p_cohort ->> 'method')
     ORDER BY b.computed_at, b.backtest_id
  LOOP
    CONTINUE WHEN cardinality(analytics.mca_forecast_scope(p_scope, r.series_key, NULL)) = 0;
    v_bt := v_bt + 1;
    v_recs := v_recs || analytics.mca_rec('backtest', r.backtest_id::text, 'context', format('a backtest (mode %s) is held-out history — a different definition, never counted as live calibration', r.mode),
      jsonb_build_object('mode', r.mode, 'series_key', r.series_key, 'horizon', r.horizon_code, 'method', r.method, 'coverage_80', r.coverage_80, 'origins', r.origins, 'computed_at', r.computed_at));
  END LOOP;
  IF v_bt > 0 THEN v_notes := v_notes || to_jsonb(format('%s backtest(s) of the scope''s series were computed in the window: listed as context, NOT counted — backtest coverage is a different definition labelled by its mode', v_bt)); END IF;
  IF v_long > 0 THEN v_notes := v_notes || to_jsonb(format('%s outcome(s) of a 3y/5y horizon are in the population: their coverage is observed, never a validation claim (no 3y/5y method validation has passed)', v_long)); END IF;
  RETURN analytics.mca_out('rate', v_recs, '[]'::jsonb,
    jsonb_build_object('clock', CASE WHEN v_world THEN 'world' ELSE 'record' END, 'window_field', CASE WHEN v_world THEN 'prediction.outcome_ledger.target_at' ELSE 'prediction.outcome_ledger.known_at' END,
                       'rule', 'covered = q10 ≤ observed ≤ q90 (the outcome ledger''s own flag; ForecastingService.calibration)', 'backtests_not_counted', v_bt, 'long_horizon_outcomes', v_long,
                       'notes', v_notes));
END $$;

/* MET-025 FORECAST SHARPNESS (score; dimension horizon; lower is sharper). POPULATION: the same scored live outcomes as MET-024 (known_at in
   the window, in scope). VALUE: the MEAN RELATIVE INTERVAL WIDTH (q90 − q10) / |q50| (an outcome with q50 = 0 is excluded: the relative width
   is undefined). INDETERMINATE when the same population is not CALIBRATED — its 10–90 coverage outside the band (p_params.band, default
   [0.75, 0.85]) or fewer than p_params.min_calibrated (default 8) outcomes: a sharp but uncalibrated distribution is not a virtue. */
CREATE OR REPLACE FUNCTION analytics.mc_met025_forecast_sharpness(p_tenant uuid, p_domain uuid, p_from timestamptz, p_to timestamptz, p_as_of timestamptz, p_scope jsonb, p_cohort jsonb, p_params jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = analytics, prediction, pg_catalog, pg_temp AS $$
DECLARE r record; v_recs jsonb := '[]'::jsonb; v_via text[]; v_n int := 0; v_cov int := 0; v_sum numeric := 0; v_w int := 0; v_reasons jsonb; v_lo numeric; v_hi numeric; v_min int; v_share numeric;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'MET-025 forecast sharpness: scored live outcomes');
  v_reasons := analytics.mca_clock_reasons(p_params, ARRAY['record']);
  v_lo := coalesce((p_params -> 'band' ->> 0)::numeric, 0.75); v_hi := coalesce((p_params -> 'band' ->> 1)::numeric, 0.85); v_min := coalesce((p_params ->> 'min_calibrated')::int, 8);
  FOR r IN
    SELECT o.outcome_id, o.series_key, o.horizon_code, o.method, o.q10, o.q50, o.q90, o.covered, o.known_at, f.subject_entity_id
      FROM prediction.outcome_ledger o LEFT JOIN prediction.forecasts_current f ON f.forecast_id = o.forecast_id
     WHERE o.tenant_id = p_tenant AND o.domain_id = p_domain AND o.recorded_at <= p_as_of AND o.known_at >= p_from AND o.known_at < p_to
       AND (p_cohort ->> 'horizon' IS NULL OR o.horizon_code = p_cohort ->> 'horizon')
     ORDER BY o.known_at, o.outcome_id
  LOOP
    v_via := analytics.mca_forecast_scope(p_scope, r.series_key, r.subject_entity_id);
    CONTINUE WHEN cardinality(v_via) = 0;
    v_n := v_n + 1; v_cov := v_cov + CASE WHEN r.covered THEN 1 ELSE 0 END;
    IF r.q50 IS NULL OR r.q50 = 0 OR r.q10 IS NULL OR r.q90 IS NULL THEN
      v_recs := v_recs || analytics.mca_rec('forecast_outcome', r.outcome_id::text, 'excluded', 'q50 = 0 (or a quantile missing): the relative interval width is undefined', jsonb_build_object('horizon', r.horizon_code));
    ELSE
      v_w := v_w + 1; v_sum := v_sum + (r.q90 - r.q10) / abs(r.q50);
      v_recs := v_recs || analytics.mca_rec('forecast_outcome', r.outcome_id::text, 'included', NULL,
        jsonb_build_object('value', round((r.q90 - r.q10) / abs(r.q50), 6), 'horizon', r.horizon_code, 'method', r.method, 'series_key', r.series_key, 'covered', r.covered, 'scope_via', to_jsonb(v_via)));
    END IF;
  END LOOP;
  v_share := CASE WHEN v_n = 0 THEN NULL ELSE round(v_cov::numeric / v_n, 6) END;
  IF v_n < v_min THEN
    v_reasons := v_reasons || to_jsonb(format('sharpness is read only for calibrated distributions: the population''s calibration rests on %s outcome(s), below %s (MET-024''s floor)', v_n, v_min));
  ELSIF v_share < v_lo OR v_share > v_hi THEN
    v_reasons := v_reasons || to_jsonb(format('sharpness is read only for calibrated distributions: the population''s 10–90 coverage is %s, outside the band [%s, %s] (MET-024)', trim_scale(v_share), trim_scale(v_lo), trim_scale(v_hi)));
  END IF;
  RETURN analytics.mca_out('score', v_recs, v_reasons,
    jsonb_build_object('clock', 'record', 'measure', 'mean (q90 − q10) / |q50| over the included outcomes', 'calibration', jsonb_build_object('n', v_n, 'covered', v_cov, 'coverage', v_share, 'band', jsonb_build_array(v_lo, v_hi))),
    NULL, CASE WHEN v_w = 0 THEN NULL ELSE round(v_sum / v_w, 6) END);
END $$;

/* MET-026 SCENARIO DISTINCTNESS (rate). POPULATION: the APPROVED (active) scenario sets live in the window (activated by its end, not
   retired before its start, by the as-of). THE DISTINCTNESS TEST (stated): each live member branch's STRUCTURE is the set of its active
   driver and impact elements (prediction.scenario_elements of kinds driver and impact, the branch's own and its scenario's shared ones, by
   the as-of), as "kind:name"; two branches are materially different when the Jaccard similarity of their structures is ≤ p_params.
   max_similarity (default 0.5). A set PASSES when it has ≥ 2 live branches, every branch declares a structure, and every pair is materially
   different. The failing pairs and the structureless branches are named on the record. Scope: the set's package objectives (the package
   rule), else ignored (said). */
CREATE OR REPLACE FUNCTION analytics.mc_met026_scenario_distinctness(p_tenant uuid, p_domain uuid, p_from timestamptz, p_to timestamptz, p_as_of timestamptz, p_scope jsonb, p_cohort jsonb, p_params jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = analytics, prediction, decision, pg_catalog, pg_temp AS $$
DECLARE s record; v_recs jsonb := '[]'::jsonb; v_max numeric := coalesce((p_params ->> 'max_similarity')::numeric, 0.5); v_br jsonb; v_pairs jsonb; v_empty jsonb; v_n int; v_pass boolean; v_via text[];
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'MET-026 scenario distinctness: approved scenario sets and their branch structures');
  FOR s IN
    SELECT x.set_id, x.title, x.package_id, x.activated_at, x.retired_at FROM prediction.scenario_sets x
     WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.activated_at IS NOT NULL AND x.activated_at < p_to AND x.activated_at <= p_as_of
       AND (x.retired_at IS NULL OR x.retired_at >= p_from OR x.retired_at > p_as_of)
     ORDER BY x.activated_at, x.set_id
  LOOP
    v_via := CASE WHEN p_scope IS NULL THEN ARRAY['domain']
                  WHEN s.package_id IS NULL THEN '{}'::text[]
                  ELSE (SELECT analytics.mca_package_scope(p_scope, v.package_id, v.version, v.objectives) FROM decision.package_versions v WHERE v.package_id = s.package_id ORDER BY v.version DESC LIMIT 1) END;
    CONTINUE WHEN coalesce(cardinality(v_via), 0) = 0;
    WITH m AS (SELECT DISTINCT ON (mm.branch_id) mm.branch_id, mm.scenario_id FROM prediction.scenario_set_members mm
                WHERE mm.set_id = s.set_id AND mm.branch_id IS NOT NULL AND mm.added_at <= p_as_of AND (mm.removed_at IS NULL OR mm.removed_at > p_as_of)
                ORDER BY mm.branch_id, mm.added_at DESC),
         st AS (SELECT m.branch_id, coalesce(array_agg(DISTINCT e.kind || ':' || lower(btrim(e.name))) FILTER (WHERE e.element_id IS NOT NULL), '{}') AS sig
                  FROM m LEFT JOIN prediction.scenario_elements e ON e.scenario_id = m.scenario_id AND (e.branch_id = m.branch_id OR e.branch_id IS NULL)
                       AND e.kind IN ('driver', 'impact') AND e.declared_at <= p_as_of AND (e.retired_at IS NULL OR e.retired_at > p_as_of)
                 GROUP BY m.branch_id)
    SELECT coalesce(jsonb_agg(jsonb_build_object('branch_id', st.branch_id, 'structure', to_jsonb(st.sig)) ORDER BY st.branch_id), '[]'::jsonb),
           coalesce(jsonb_agg(to_jsonb(st.branch_id) ORDER BY st.branch_id) FILTER (WHERE cardinality(st.sig) = 0), '[]'::jsonb), count(*)
      INTO v_br, v_empty, v_n FROM st;
    SELECT coalesce(jsonb_agg(jsonb_build_object('a', a.branch_id, 'b', b.branch_id, 'similarity', round(sim, 4)) ORDER BY a.branch_id, b.branch_id) FILTER (WHERE sim > v_max), '[]'::jsonb) INTO v_pairs
      FROM (SELECT (x ->> 'branch_id')::uuid AS branch_id, ARRAY(SELECT jsonb_array_elements_text(x -> 'structure')) AS sig FROM jsonb_array_elements(v_br) x) a
      JOIN (SELECT (x ->> 'branch_id')::uuid AS branch_id, ARRAY(SELECT jsonb_array_elements_text(x -> 'structure')) AS sig FROM jsonb_array_elements(v_br) x) b ON a.branch_id < b.branch_id
      CROSS JOIN LATERAL (SELECT CASE WHEN cardinality(a.sig) + cardinality(b.sig) = 0 THEN 1.0
                                      ELSE (SELECT count(*) FROM (SELECT unnest(a.sig) INTERSECT SELECT unnest(b.sig)) i)::numeric / (SELECT count(*) FROM (SELECT unnest(a.sig) UNION SELECT unnest(b.sig)) u) END AS sim) j;
    v_pass := v_n >= 2 AND jsonb_array_length(v_empty) = 0 AND jsonb_array_length(v_pairs) = 0;
    v_recs := v_recs || analytics.mca_rec('scenario_set', s.set_id::text, CASE WHEN v_pass THEN 'numerator' ELSE 'denominator' END, NULL,
      jsonb_build_object('title', s.title, 'live_branches', v_n, 'structureless_branches', v_empty, 'too_similar_pairs', v_pairs, 'max_similarity', v_max, 'branches', v_br,
                         'fails', to_jsonb(array_remove(ARRAY[CASE WHEN v_n < 2 THEN 'fewer than two live branches' END, CASE WHEN jsonb_array_length(v_empty) > 0 THEN 'a branch declares no driver/impact structure' END,
                                                               CASE WHEN jsonb_array_length(v_pairs) > 0 THEN 'branches not materially different' END], NULL)),
                         'scope_via', to_jsonb(v_via)));
  END LOOP;
  RETURN analytics.mca_out('rate', v_recs, analytics.mca_clock_reasons(p_params, ARRAY['record']),
    jsonb_build_object('clock', 'record', 'test', format('Jaccard similarity of the branches'' driver+impact element sets ≤ %s for every pair; ≥ 2 live branches; none structureless', v_max)));
END $$;

/* MET-027 SIMULATION REPRODUCIBILITY (rate). POPULATION: the ACCEPTED runs (completed, and valid at the as-of) completed in the window. Each
   run's LATEST reproduction by the as-of (simulation.reproductions): `reproduced` → numerator; `mismatch` / `unreproducible` → denominator.
   THE TOLERANCE is 0: the product reproduces by DIGEST EQUALITY of the outputs (stated — a numerical tolerance is not recorded). A run never
   reproduced is EXCLUDED and counted ("never reproduced"). Scope: a run on a twin whose boundary intersects the entities, or on a scenario
   of the scope's objectives? — the twin rule (boundary entities). */
CREATE OR REPLACE FUNCTION analytics.mc_met027_simulation_reproducibility(p_tenant uuid, p_domain uuid, p_from timestamptz, p_to timestamptz, p_as_of timestamptz, p_scope jsonb, p_cohort jsonb, p_params jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = analytics, simulation, twin, pg_catalog, pg_temp AS $$
DECLARE r record; rp record; v_recs jsonb := '[]'::jsonb; v_via text[]; v_never int := 0;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'MET-027 simulation reproducibility: accepted runs and their reproductions');
  FOR r IN
    SELECT x.run_id, x.model_ref, x.completed_at, x.twin_id, t.boundary
      FROM simulation.runs_current x LEFT JOIN twin.twins_current t ON t.twin_id = x.twin_id
     WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.state = 'completed' AND x.completed_at >= p_from AND x.completed_at < p_to AND x.completed_at <= p_as_of
       AND NOT (x.validity = 'invalidated' AND x.invalidated_at <= p_as_of)
     ORDER BY x.completed_at, x.run_id
  LOOP
    v_via := CASE WHEN p_scope IS NULL THEN ARRAY['domain'] ELSE analytics.mca_scope_via(p_scope, '{}', analytics.mca_jtxt(r.boundary), '{}', '{}') END;
    CONTINUE WHEN cardinality(v_via) = 0;
    SELECT y.reproduction_id, y.verdict, y.reason, y.reproduced_at INTO rp FROM simulation.reproductions y
     WHERE y.run_id = r.run_id AND y.reproduced_at <= p_as_of ORDER BY y.reproduced_at DESC, y.reproduction_id DESC LIMIT 1;
    IF rp.reproduction_id IS NULL THEN
      v_never := v_never + 1;
      v_recs := v_recs || analytics.mca_rec('simulation_run', r.run_id::text, 'excluded', 'never reproduced by the as-of: unmeasured, not a failure', jsonb_build_object('model_ref', r.model_ref));
    ELSE
      v_recs := v_recs || analytics.mca_rec('simulation_run', r.run_id::text, CASE WHEN rp.verdict = 'reproduced' THEN 'numerator' ELSE 'denominator' END, NULL,
        jsonb_build_object('model_ref', r.model_ref, 'verdict', rp.verdict, 'reproduction_id', rp.reproduction_id, 'reproduced_at', rp.reproduced_at, 'reason', rp.reason, 'scope_via', to_jsonb(v_via)));
    END IF;
  END LOOP;
  RETURN analytics.mca_out('rate', v_recs, analytics.mca_clock_reasons(p_params, ARRAY['record']),
    jsonb_build_object('clock', 'record', 'tolerance', 0, 'tolerance_basis', 'digest equality of the outputs (simulation.reproductions) — no numerical tolerance is recorded', 'never_reproduced', v_never));
END $$;

/* MET-028 TWIN SYNCHRONIZATION HEALTH (rate). POPULATION: the twins with an ADMITTED head on the `actual` branch at the as-of (declared, and
   admitted, by then), in scope by the twin rule (boundary entities). WITHIN CONTRACT when, at the as-of: FRESHNESS — the latest freshness
   policy by then holds (the head's age = the as-of's day − observed_through, else the day of known_at, ≤ max_age_days: twin.tbr_age's rule
   evaluated at the as-of); COVERAGE — every key the twin's published contract (current by then) exposes is present on the head and not
   expired (no published contract: the clause does not apply, said); VALIDATION — the latest validation of the head by then is `fit`. A twin
   with NO freshness policy has no sync contract: EXCLUDED, counted. */
CREATE OR REPLACE FUNCTION analytics.mc_met028_twin_sync_health(p_tenant uuid, p_domain uuid, p_from timestamptz, p_to timestamptz, p_as_of timestamptz, p_scope jsonb, p_cohort jsonb, p_params jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = analytics, twin, pg_catalog, pg_temp AS $$
DECLARE t record; hv record; fp record; ct record; v_recs jsonb := '[]'::jsonb; v_via text[]; v_day date := (p_as_of AT TIME ZONE 'UTC')::date; v_age int; v_fresh boolean; v_missing jsonb;
        v_cov boolean; v_val text; v_el jsonb; v_fail text[];
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'MET-028 twin sync health: twins, their heads, policies, contracts and validations');
  FOR t IN SELECT x.twin_id, x.title, x.boundary FROM twin.twins_current x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.declared_at <= p_as_of ORDER BY x.twin_id LOOP
    v_via := CASE WHEN p_scope IS NULL THEN ARRAY['domain'] ELSE analytics.mca_scope_via(p_scope, '{}', analytics.mca_jtxt(t.boundary), '{}', '{}') END;
    CONTINUE WHEN cardinality(v_via) = 0;
    SELECT v.version, v.known_at, v.observed_through INTO hv FROM twin.twin_versions v
     WHERE v.twin_id = t.twin_id AND v.branch_id = 'actual' AND v.state = 'admitted' AND v.admitted_at IS NOT NULL AND v.admitted_at <= p_as_of
       AND (v.withdrawn_at IS NULL OR v.withdrawn_at > p_as_of) ORDER BY v.version DESC LIMIT 1;
    IF hv.version IS NULL THEN
      v_recs := v_recs || analytics.mca_rec('twin', t.twin_id::text, 'excluded', 'no admitted state on the actual branch by the as-of: nothing to be in sync', '{}'::jsonb);
      CONTINUE;
    END IF;
    SELECT f.version, f.max_age_days INTO fp FROM twin.freshness_policies f WHERE f.twin_id = t.twin_id AND f.set_at <= p_as_of ORDER BY f.version DESC LIMIT 1;
    IF fp.version IS NULL THEN
      v_recs := v_recs || analytics.mca_rec('twin', t.twin_id::text, 'excluded', 'no freshness policy by the as-of: the twin has no synchronization contract to be within', jsonb_build_object('head_version', hv.version));
      CONTINUE;
    END IF;
    v_age := v_day - coalesce(hv.observed_through, (hv.known_at AT TIME ZONE 'UTC')::date);
    v_fresh := v_age <= fp.max_age_days;
    SELECT c.contract_version, c.exposed INTO ct FROM twin.twin_contracts c WHERE c.twin_id = t.twin_id AND c.published_at <= p_as_of ORDER BY c.contract_version DESC LIMIT 1;
    IF ct.contract_version IS NULL THEN
      v_cov := NULL; v_missing := '[]'::jsonb;
    ELSE
      SELECT coalesce(jsonb_agg(k ORDER BY k), '[]'::jsonb) INTO v_missing FROM jsonb_object_keys(ct.exposed) k
       WHERE NOT EXISTS (SELECT 1 FROM twin.state_elements e WHERE e.twin_id = t.twin_id AND e.version = hv.version AND e.key = k AND (e.valid_to IS NULL OR e.valid_to >= v_day));
      v_cov := jsonb_array_length(v_missing) = 0;
    END IF;
    SELECT x.verdict INTO v_val FROM twin.validations x WHERE x.twin_id = t.twin_id AND x.version = hv.version AND x.validated_at <= p_as_of ORDER BY x.validated_at DESC LIMIT 1;
    IF NOT FOUND THEN v_val := NULL; END IF;
    v_el := jsonb_build_object('freshness', jsonb_build_object('met', v_fresh, 'age_days', v_age, 'max_age_days', fp.max_age_days, 'policy_version', fp.version),
                               'coverage', jsonb_build_object('met', v_cov, 'contract_version', ct.contract_version, 'missing_keys', v_missing,
                                                              'note', CASE WHEN ct.contract_version IS NULL THEN 'no published contract: the clause does not apply' END),
                               'validation', jsonb_build_object('met', v_val = 'fit', 'verdict', coalesce(v_val, 'never validated')));
    v_fail := array_remove(ARRAY[CASE WHEN NOT v_fresh THEN 'freshness' END, CASE WHEN v_cov IS FALSE THEN 'coverage' END, CASE WHEN v_val IS DISTINCT FROM 'fit' THEN 'validation' END], NULL);
    v_recs := v_recs || analytics.mca_rec('twin', t.twin_id::text, CASE WHEN cardinality(v_fail) = 0 THEN 'numerator' ELSE 'denominator' END, NULL,
      jsonb_build_object('title', t.title, 'head_version', hv.version, 'contracts', v_el, 'failed', to_jsonb(v_fail), 'scope_via', to_jsonb(v_via)));
  END LOOP;
  RETURN analytics.mca_out('rate', v_recs, analytics.mca_clock_reasons(p_params, ARRAY['record']),
    jsonb_build_object('clock', 'record', 'state_at', 'the as-of (a state measure: the window bounds nothing but the period it is reported for)', 'as_of_day', v_day));
END $$;

-- §MCA.3 STRATEGY AND COMMITMENTS ──────────────────────────────────────────────────────────────────────────────────────────────────────

/* MET-029 STRATEGIC ALIGNMENT COVERAGE (rate). POPULATION ("material items", stated): the APPROVED initiatives (approved by the window's end,
   by the as-of) and the ROOT commitment obligations live in the period (created by the window's end, due on or after its start), in scope
   (their objectives). NUMERATOR: linked to all four, by the as-of — an OBJECTIVE (the initiative's objective / initiative_objectives; the
   obligation's objective_ids) that is a strategy objective; a CAPABILITY (an active alignment builds/supports to a CAP from the item or one of
   its objectives); an OWNER (a named human); a MEASURE (a plan measure of the initiative's plan, or an active `measures` alignment onto the
   item or one of its objectives). */
CREATE OR REPLACE FUNCTION analytics.mc_met029_alignment_coverage(p_tenant uuid, p_domain uuid, p_from timestamptz, p_to timestamptz, p_as_of timestamptz, p_scope jsonb, p_cohort jsonb, p_params jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = analytics, executive, decision, graph, pg_catalog, pg_temp AS $$
DECLARE r record; v_recs jsonb := '[]'::jsonb; v_via text[]; v_objs uuid[]; v_cap int; v_msr int; v_el jsonb; v_missing text[];
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'MET-029 alignment coverage: approved initiatives and live commitment obligations');
  FOR r IN
    SELECT 'initiative'::text AS kind, i.initiative_id AS id, i.owner_principal_id AS owner, i.plan_id,
           ARRAY(SELECT o FROM (SELECT i.objective_id AS o UNION SELECT io.objective_id FROM executive.initiative_objectives io WHERE io.initiative_id = i.initiative_id AND io.linked_at <= p_as_of) z WHERE o IS NOT NULL) AS objs
      FROM executive.initiatives i
     WHERE i.tenant_id = p_tenant AND i.domain_id = p_domain AND i.approved_at IS NOT NULL AND i.approved_at < p_to AND i.approved_at <= p_as_of
    UNION ALL
    SELECT 'commitment_obligation', ci.item_id, ci.owner_principal_id, NULL::uuid, coalesce(ci.objective_ids, '{}')
      FROM decision.commitment_items ci
     WHERE ci.tenant_id = p_tenant AND ci.domain_id = p_domain AND ci.parent_item_id IS NULL AND ci.created_at < p_to AND ci.created_at <= p_as_of AND ci.due_at >= p_from
     ORDER BY 1, 2
  LOOP
    v_via := analytics.mca_scope_via(p_scope, ARRAY(SELECT x::text FROM unnest(r.objs) x), '{}', '{}', '{}');
    CONTINUE WHEN cardinality(v_via) = 0;
    SELECT coalesce(array_agg(s.strategy_object_id), '{}') INTO v_objs FROM graph.strategy_current s
     WHERE s.strategy_object_id = ANY (r.objs) AND s.tenant_id = p_tenant AND s.domain_id = p_domain AND s.object_type = 'OBJ' AND s.declared_at <= p_as_of;
    SELECT count(*) INTO v_cap FROM graph.alignments a
     WHERE a.tenant_id = p_tenant AND a.domain_id = p_domain AND a.kind IN ('builds', 'supports') AND a.to_type = 'CAP' AND (a.from_id = r.id OR a.from_id = ANY (v_objs))
       AND a.declared_at <= p_as_of AND (a.retired_at IS NULL OR a.retired_at > p_as_of);
    SELECT (SELECT count(*) FROM executive.plan_measures pm WHERE r.plan_id IS NOT NULL AND pm.plan_id = r.plan_id AND pm.bound_at <= p_as_of)
         + (SELECT count(*) FROM graph.alignments a WHERE a.tenant_id = p_tenant AND a.domain_id = p_domain AND a.kind = 'measures' AND (a.to_id = r.id OR a.to_id = ANY (v_objs))
               AND a.declared_at <= p_as_of AND (a.retired_at IS NULL OR a.retired_at > p_as_of))
      INTO v_msr;
    v_el := jsonb_build_object('objective', jsonb_build_object('met', cardinality(v_objs) > 0, 'objectives', to_jsonb(v_objs)),
                               'capability', jsonb_build_object('met', v_cap > 0, 'alignments', v_cap),
                               'owner', jsonb_build_object('met', r.owner IS NOT NULL AND analytics.mca_is_human(r.owner)),
                               'measure', jsonb_build_object('met', v_msr > 0, 'measures', v_msr));
    SELECT coalesce(array_agg(k ORDER BY k), '{}') INTO v_missing FROM jsonb_each(v_el) e(k, v) WHERE NOT (v ->> 'met')::boolean;
    v_recs := v_recs || analytics.mca_rec(r.kind, r.id::text, CASE WHEN cardinality(v_missing) = 0 THEN 'numerator' ELSE 'denominator' END, NULL,
      jsonb_build_object('links', v_el, 'missing', to_jsonb(v_missing), 'scope_via', to_jsonb(v_via)));
  END LOOP;
  RETURN analytics.mca_out('rate', v_recs, analytics.mca_clock_reasons(p_params, ARRAY['record']),
    jsonb_build_object('clock', 'record', 'material', 'approved initiatives; root commitment obligations live in the period'));
END $$;

/* MET-030 COMMITMENT OUTCOME CLOSURE (rate; dimension portfolio = the package's initiative, or `none` — PORTFOLIO LEVEL ONLY: App M's
   "Owner" scope is never a grouping (D4); an item's owner routes accountability on the item itself and is never aggregated per person).
   POPULATION: the commitment items DUE in the window (due_at, created by the as-of). NUMERATOR: CLOSED by the as-of with — EVIDENCE (item.done
   with its evidence; for a root obligation, the commitment's co-signed closure), an EXCEPTION (item.waived, co-signed), an OUTCOME (a root
   obligation whose package has an outcome recorded on the committed version) or SUPERSESSION (item.cancelled, or the package committed again
   later — a newer commitment supersedes this one). Not closed by the as-of → denominator. */
CREATE OR REPLACE FUNCTION analytics.mc_met030_commitment_closure(p_tenant uuid, p_domain uuid, p_from timestamptz, p_to timestamptz, p_as_of timestamptz, p_scope jsonb, p_cohort jsonb, p_params jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = analytics, decision, pg_catalog, pg_temp AS $$
DECLARE r record; v_recs jsonb := '[]'::jsonb; v_via text[]; v_how text; v_at timestamptz;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'MET-030 commitment closure: commitment items due in the window');
  FOR r IN
    SELECT ci.item_id, ci.commitment_id, ci.package_id, ci.parent_item_id, ci.due_at, ci.objective_ids, c.version, c.committed_at, coalesce(p.initiative_id::text, 'none') AS portfolio
      FROM decision.commitment_items ci JOIN decision.commitments c ON c.commitment_id = ci.commitment_id JOIN decision.packages_current p ON p.package_id = ci.package_id
     WHERE ci.tenant_id = p_tenant AND ci.domain_id = p_domain AND ci.due_at >= p_from AND ci.due_at < p_to AND ci.created_at <= p_as_of
       AND (p_cohort ->> 'portfolio' IS NULL OR coalesce(p.initiative_id::text, 'none') = p_cohort ->> 'portfolio')
     ORDER BY ci.due_at, ci.item_id
  LOOP
    v_via := analytics.mca_scope_via(p_scope, ARRAY(SELECT x::text FROM unnest(r.objective_ids) x), '{}', '{}', '{}');
    CONTINUE WHEN cardinality(v_via) = 0;
    v_how := NULL; v_at := NULL;
    SELECT CASE e.event WHEN 'item.done' THEN 'evidence' WHEN 'item.waived' THEN 'exception' WHEN 'item.cancelled' THEN 'supersession' END, e.occurred_at INTO v_how, v_at
      FROM decision.commitment_events e WHERE e.item_id = r.item_id AND e.event IN ('item.done', 'item.waived', 'item.cancelled') AND e.occurred_at <= p_as_of
     ORDER BY e.occurred_at, e.event_id LIMIT 1;
    IF v_how IS NULL AND r.parent_item_id IS NULL THEN
      SELECT 'evidence', e.occurred_at INTO v_how, v_at FROM decision.commitment_events e
       WHERE e.commitment_id = r.commitment_id AND e.event = 'closure.cosigned' AND e.occurred_at <= p_as_of ORDER BY e.occurred_at LIMIT 1;
      IF v_how IS NULL THEN
        SELECT 'outcome', o.recorded_at INTO v_how, v_at FROM decision.outcomes o WHERE o.package_id = r.package_id AND o.version = r.version AND o.recorded_at <= p_as_of ORDER BY o.recorded_at LIMIT 1;
      END IF;
    END IF;
    IF v_how IS NULL THEN
      SELECT 'supersession', c2.committed_at INTO v_how, v_at FROM decision.commitments c2
       WHERE c2.package_id = r.package_id AND c2.committed_at > r.committed_at AND c2.committed_at <= p_as_of ORDER BY c2.committed_at LIMIT 1;
    END IF;
    v_recs := v_recs || analytics.mca_rec(CASE WHEN r.parent_item_id IS NULL THEN 'commitment_obligation' ELSE 'commitment_item' END, r.item_id::text,
      CASE WHEN v_how IS NOT NULL THEN 'numerator' ELSE 'denominator' END, NULL,
      jsonb_build_object('due_at', r.due_at, 'closed_by', coalesce(v_how, 'not closed by the as-of'), 'closed_at', v_at, 'portfolio', r.portfolio, 'scope_via', to_jsonb(v_via)));
  END LOOP;
  RETURN analytics.mca_out('rate', v_recs, analytics.mca_clock_reasons(p_params, ARRAY['record']),
    jsonb_build_object('clock', 'record', 'window_field', 'decision.commitment_items.due_at', 'grain', 'portfolio level only — never per owner (D4)'));
END $$;

-- §MCA.4 V01-T-046 VALUE MEASURES AND ES-40-008 INDICATORS ─────────────────────────────────────────────────────────────────────────────

/* V1 DECISION CYCLE TIME (duration, seconds): executive.metrics' decision_latency — per COMMITMENT recorded in the window whose version was
   proposed: the version's proposal → its commitment. A package recommitted after a reopening contributes each cycle. In scope by the package
   rule. */
CREATE OR REPLACE FUNCTION analytics.mc_v1_decision_cycle(p_tenant uuid, p_domain uuid, p_from timestamptz, p_to timestamptz, p_as_of timestamptz, p_scope jsonb, p_cohort jsonb, p_params jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = analytics, decision, pg_catalog, pg_temp AS $$
DECLARE r record; v_recs jsonb := '[]'::jsonb; v_via text[];
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'V1 decision cycle time: commitments and their proposals');
  FOR r IN
    SELECT c.commitment_id, c.package_id, c.version, c.committed_at, v.proposed_at, v.objectives FROM decision.commitments c
      JOIN decision.package_versions v ON v.package_id = c.package_id AND v.version = c.version
     WHERE c.tenant_id = p_tenant AND c.domain_id = p_domain AND c.committed_at >= p_from AND c.committed_at < p_to AND c.committed_at <= p_as_of
     ORDER BY c.committed_at, c.commitment_id
  LOOP
    v_via := analytics.mca_package_scope(p_scope, r.package_id, r.version, r.objectives);
    CONTINUE WHEN cardinality(v_via) = 0;
    IF r.proposed_at IS NULL OR r.proposed_at > p_as_of THEN
      v_recs := v_recs || analytics.mca_rec('decision_commitment', r.commitment_id::text, 'excluded', 'the committed version records no proposal instant: the cycle has no start', jsonb_build_object('package_id', r.package_id));
    ELSE
      v_recs := v_recs || analytics.mca_rec('decision_commitment', r.commitment_id::text, 'included', NULL,
        jsonb_build_object('value', round(extract(epoch FROM r.committed_at - r.proposed_at)::numeric, 3), 'package_id', r.package_id, 'version', r.version, 'proposed_at', r.proposed_at,
                           'committed_at', r.committed_at, 'scope_via', to_jsonb(v_via)));
    END IF;
  END LOOP;
  RETURN analytics.mca_out('duration', v_recs, analytics.mca_clock_reasons(p_params, ARRAY['record']),
    jsonb_build_object('clock', 'record', 'unit', 'seconds', 'basis', 'executive.metrics decision_latency: package_versions.proposed_at → commitments.committed_at'));
END $$;

/* V1 UNDERSTANDING LATENCY (duration, seconds): executive.metrics' time_to_understanding — the attention items FIRST ROUTED in the window
   (item.routed / item.escalated / item.unrouted): the routing → the first human act on the item (acknowledged, suppressed, delegated, closed, a
   suppression requested, an act launched), by the as-of. Items without an act by then are EXCLUDED and counted (not measured, never zero).
   Domain-wide by nature (the attention queue is the domain's). */
CREATE OR REPLACE FUNCTION analytics.mc_v1_understanding_latency(p_tenant uuid, p_domain uuid, p_from timestamptz, p_to timestamptz, p_as_of timestamptz, p_scope jsonb, p_cohort jsonb, p_params jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = analytics, executive, pg_catalog, pg_temp AS $$
DECLARE r record; v_recs jsonb := '[]'::jsonb; v_none int := 0;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'V1 understanding latency: routed attention items and their first human act');
  FOR r IN
    WITH routed AS (
      SELECT e.item_id, min(e.occurred_at) AS routed_at FROM executive.attention_item_events e
       WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain AND e.event IN ('item.routed', 'item.escalated', 'item.unrouted') AND e.occurred_at <= p_as_of GROUP BY e.item_id)
    SELECT r0.item_id, r0.routed_at, i.signal_class,
           least((SELECT min(x.occurred_at) FROM executive.attention_item_events x WHERE x.item_id = r0.item_id AND x.occurred_at > r0.routed_at AND x.occurred_at <= p_as_of
                    AND x.event IN ('item.acknowledged', 'item.suppressed', 'item.delegated', 'item.closed', 'item.suppression_requested')),
                 (SELECT min(a.launched_at) FROM executive.attention_item_acts a WHERE a.item_id = r0.item_id AND a.launched_at > r0.routed_at AND a.launched_at <= p_as_of)) AS acted_at
      FROM routed r0 JOIN executive.attention_items i ON i.item_id = r0.item_id
     WHERE r0.routed_at >= p_from AND r0.routed_at < p_to
     ORDER BY r0.routed_at, r0.item_id
  LOOP
    IF r.acted_at IS NULL THEN
      v_none := v_none + 1;
      v_recs := v_recs || analytics.mca_rec('attention_item', r.item_id::text, 'excluded', 'no human act on the item by the as-of: counted, not measured', jsonb_build_object('signal_class', r.signal_class));
    ELSE
      v_recs := v_recs || analytics.mca_rec('attention_item', r.item_id::text, 'included', NULL,
        jsonb_build_object('value', round(extract(epoch FROM r.acted_at - r.routed_at)::numeric, 3), 'signal_class', r.signal_class, 'routed_at', r.routed_at, 'acted_at', r.acted_at));
    END IF;
  END LOOP;
  RETURN analytics.mca_out('duration', v_recs, analytics.mca_clock_reasons(p_params, ARRAY['record']),
    jsonb_build_object('clock', 'record', 'unit', 'seconds', 'basis', 'executive.metrics time_to_understanding: the first routing → the first human act', 'without_act', v_none,
                       'notes', analytics.mca_scope_ignored(p_scope, 'the attention queue is the domain''s')));
END $$;

/* V1 WARNING PRECISION (rate): prediction.evaluate_warnings' feedback — of the warnings raised in the window (in scope) that carry USEFUL or
   FALSE feedback by the as-of, the share marked useful. A warning marked both is EXCLUDED (contradictory feedback, named); late / missed /
   duplicated feedback alone does not enter the precision (evaluate_warnings reports those rates apart). */
CREATE OR REPLACE FUNCTION analytics.mc_v1_warning_precision(p_tenant uuid, p_domain uuid, p_from timestamptz, p_to timestamptz, p_as_of timestamptz, p_scope jsonb, p_cohort jsonb, p_params jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = analytics, prediction, pg_catalog, pg_temp AS $$
DECLARE r record; v_recs jsonb := '[]'::jsonb; v_via text[];
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'V1 warning precision: warnings and their useful / false feedback');
  FOR r IN
    SELECT w.warning_id, w.affected, w.forecast_id, w.origin_kind,
           bool_or(f.kind = 'useful') AS useful, bool_or(f.kind = 'false') AS falsed
      FROM prediction.warnings_current w JOIN prediction.warning_feedback f ON f.warning_id = w.warning_id AND f.given_at <= p_as_of AND f.kind IN ('useful', 'false')
     WHERE w.tenant_id = p_tenant AND w.domain_id = p_domain AND w.raised_at >= p_from AND w.raised_at < p_to AND w.raised_at <= p_as_of
     GROUP BY w.warning_id, w.affected, w.forecast_id, w.origin_kind
     ORDER BY w.warning_id
  LOOP
    v_via := analytics.mca_warning_scope(p_scope, r.affected, r.forecast_id);
    CONTINUE WHEN cardinality(v_via) = 0;
    IF r.useful AND r.falsed THEN
      v_recs := v_recs || analytics.mca_rec('warning', r.warning_id::text, 'excluded', 'contradictory feedback: marked both useful and false', jsonb_build_object('origin_kind', r.origin_kind));
    ELSE
      v_recs := v_recs || analytics.mca_rec('warning', r.warning_id::text, CASE WHEN r.useful THEN 'numerator' ELSE 'denominator' END, NULL,
        jsonb_build_object('feedback', CASE WHEN r.useful THEN 'useful' ELSE 'false' END, 'origin_kind', r.origin_kind, 'scope_via', to_jsonb(v_via)));
    END IF;
  END LOOP;
  RETURN analytics.mca_out('rate', v_recs, analytics.mca_clock_reasons(p_params, ARRAY['record']),
    jsonb_build_object('clock', 'record', 'basis', 'prediction.evaluate_warnings'' feedback: useful ÷ (useful + false), a warning counted once'));
END $$;

/* V1 ATTENTION SAVED (rate; noise reduction): executive.evaluate_attention_queue's PRECISION — over the attention items created in the window:
   positive = material when it arrived, not elevated later, acknowledged, then disposed `actioned`; negative (a false alarm) = material, not
   elevated, then disposed not_material or duplicate, or closed without acknowledgement (and not actioned or late) — each by the as-of. Items
   neither (below threshold, elevated, late, undisposed) are EXCLUDED with their reason. Domain-wide by nature. */
CREATE OR REPLACE FUNCTION analytics.mc_v1_attention_saved(p_tenant uuid, p_domain uuid, p_from timestamptz, p_to timestamptz, p_as_of timestamptz, p_scope jsonb, p_cohort jsonb, p_params jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = analytics, executive, pg_catalog, pg_temp AS $$
DECLARE r record; v_recs jsonb := '[]'::jsonb; v_role text; v_reason text;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'V1 attention saved: the attention queue''s precision');
  FOR r IN
    SELECT i.item_id, i.signal_class, i.outcome,
           (CASE WHEN i.acknowledged_at IS NOT NULL AND i.acknowledged_at <= p_as_of THEN i.acknowledged_at END) AS ack_at,
           (i.state = 'closed' AND i.closed_at <= p_as_of) AS closed,
           (SELECT d.details ->> 'disposition' FROM executive.attention_item_events d WHERE d.item_id = i.item_id AND d.event = 'item.disposition' AND d.occurred_at <= p_as_of
             ORDER BY d.occurred_at DESC, d.event_id DESC LIMIT 1) AS disposition,
           EXISTS (SELECT 1 FROM executive.attention_item_events d WHERE d.item_id = i.item_id AND d.occurred_at <= p_as_of
                     AND (d.event = 'item.elevated' OR (d.event = 'item.reevaluated' AND d.details ->> 'to_outcome' = 'material' AND d.details ->> 'from_outcome' IS DISTINCT FROM 'material'))) AS elevated
      FROM executive.attention_items i
     WHERE i.tenant_id = p_tenant AND i.domain_id = p_domain AND i.created_at >= p_from AND i.created_at < p_to AND i.created_at <= p_as_of
     ORDER BY i.created_at, i.item_id
  LOOP
    v_role := NULL; v_reason := NULL;
    IF r.outcome = 'material' AND NOT r.elevated AND r.ack_at IS NOT NULL AND r.disposition = 'actioned' THEN v_role := 'numerator';
    ELSIF r.outcome = 'material' AND NOT r.elevated AND (r.disposition IN ('not_material', 'duplicate') OR (r.closed AND r.ack_at IS NULL AND coalesce(r.disposition, '') NOT IN ('actioned', 'late'))) THEN v_role := 'denominator';
    ELSE
      v_reason := CASE WHEN r.outcome <> 'material' THEN format('not judged material on arrival (%s)', r.outcome) WHEN r.elevated THEN 'elevated to material later: a recall miss, not a precision case'
                       WHEN r.disposition = 'late' THEN 'disposed late: counted apart' WHEN r.disposition IS NULL THEN 'not disposed by the as-of' ELSE format('disposed %s without the positive''s conditions', r.disposition) END;
    END IF;
    v_recs := v_recs || analytics.mca_rec('attention_item', r.item_id::text, coalesce(v_role, 'excluded'), v_reason,
      jsonb_build_object('signal_class', r.signal_class, 'outcome', r.outcome, 'disposition', r.disposition, 'elevated', r.elevated));
  END LOOP;
  RETURN analytics.mca_out('rate', v_recs, analytics.mca_clock_reasons(p_params, ARRAY['record']),
    jsonb_build_object('clock', 'record', 'basis', 'executive.evaluate_attention_queue precision (B24): true positives ÷ (true positives + false alarms)',
                       'notes', analytics.mca_scope_ignored(p_scope, 'the attention queue is the domain''s')));
END $$;

/* ES-40-008 COMMITMENT VISIBILITY (rate; residual R1 of §B36.12 row 9). POPULATION: the commitment items CREATED in the window (by the as-of),
   in scope by their objectives. NUMERATOR: VISIBLE to the item's owner within p_params.within_days (default 2) days of creation — a delivered
   receipt of an attention item on the commitment item to its owner (a non-synthetic channel), or the owner's own acceptance of the item
   (item.accepted by the owner: the owner saw it). Read events of the tracker page are not recorded by the product (no telemetry before §UX) —
   said. */
CREATE OR REPLACE FUNCTION analytics.mc_es40_commitment_visibility(p_tenant uuid, p_domain uuid, p_from timestamptz, p_to timestamptz, p_as_of timestamptz, p_scope jsonb, p_cohort jsonb, p_params jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = analytics, decision, executive, pg_catalog, pg_temp AS $$
DECLARE r record; v_recs jsonb := '[]'::jsonb; v_via text[]; v_days int := coalesce((p_params ->> 'within_days')::int, 2); v_rcpt timestamptz; v_acc timestamptz; v_seen timestamptz;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'ES-40-008 commitment visibility: commitment items and their owners'' receipts');
  FOR r IN
    SELECT ci.item_id, ci.owner_principal_id, ci.created_at, ci.objective_ids, ci.parent_item_id FROM decision.commitment_items ci
     WHERE ci.tenant_id = p_tenant AND ci.domain_id = p_domain AND ci.created_at >= p_from AND ci.created_at < p_to AND ci.created_at <= p_as_of
     ORDER BY ci.created_at, ci.item_id
  LOOP
    v_via := analytics.mca_scope_via(p_scope, ARRAY(SELECT x::text FROM unnest(r.objective_ids) x), '{}', '{}', '{}');
    CONTINUE WHEN cardinality(v_via) = 0;
    SELECT min((d.receipt ->> 'at')::timestamptz) INTO v_rcpt FROM executive.attention_deliveries d JOIN executive.attention_items i ON i.item_id = d.item_id
     WHERE i.tenant_id = p_tenant AND i.domain_id = p_domain AND i.subject_kind = 'commitment_item' AND i.subject_id = r.item_id AND d.recipient_principal_id = r.owner_principal_id
       AND d.state = 'delivered' AND NOT d.synthetic_state AND jsonb_typeof(d.receipt -> 'at') = 'string' AND (d.receipt ->> 'at')::timestamptz <= p_as_of;
    SELECT min(e.occurred_at) INTO v_acc FROM decision.commitment_events e WHERE e.item_id = r.item_id AND e.event = 'item.accepted' AND e.actor_principal_id = r.owner_principal_id AND e.occurred_at <= p_as_of;
    v_seen := least(v_rcpt, v_acc);
    v_recs := v_recs || analytics.mca_rec(CASE WHEN r.parent_item_id IS NULL THEN 'commitment_obligation' ELSE 'commitment_item' END, r.item_id::text,
      CASE WHEN v_seen IS NOT NULL AND v_seen <= r.created_at + make_interval(days => v_days) THEN 'numerator' ELSE 'denominator' END, NULL,
      jsonb_build_object('created_at', r.created_at, 'owner_receipt_at', v_rcpt, 'owner_accepted_at', v_acc, 'within_days', v_days,
                         'visible_after_seconds', CASE WHEN v_seen IS NULL THEN NULL ELSE round(extract(epoch FROM v_seen - r.created_at)::numeric, 3) END, 'scope_via', to_jsonb(v_via)));
  END LOOP;
  RETURN analytics.mca_out('rate', v_recs, analytics.mca_clock_reasons(p_params, ARRAY['record']),
    jsonb_build_object('clock', 'record', 'visibility', 'a delivered (non-synthetic) receipt to the owner, or the owner''s acceptance, within the declared days',
                       'notes', jsonb_build_array('page reads are not recorded by the product before §UX telemetry: visibility rests on receipts and acceptances only')));
END $$;

/* ES-40-008 EXPLANATION USE (rate; residual R1). POPULATION: the decisions COMMITTED in the window (each commitment), in scope by the package
   rule. NUMERATOR: the committed version's explanation was RENDERED (decision.explanation_renderings of an explanation of that package version,
   rendered at or before the commitment and standing then) before the commitment. Page reads are not recorded (no telemetry before §UX) —
   renderings only, said. */
CREATE OR REPLACE FUNCTION analytics.mc_es40_explanation_use(p_tenant uuid, p_domain uuid, p_from timestamptz, p_to timestamptz, p_as_of timestamptz, p_scope jsonb, p_cohort jsonb, p_params jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = analytics, decision, pg_catalog, pg_temp AS $$
DECLARE r record; v_recs jsonb := '[]'::jsonb; v_via text[]; v_rend int; v_xpl int;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'ES-40-008 explanation use: commitments and the renderings of their explanations');
  FOR r IN
    SELECT c.commitment_id, c.package_id, c.version, c.committed_at, v.objectives FROM decision.commitments c
      JOIN decision.package_versions v ON v.package_id = c.package_id AND v.version = c.version
     WHERE c.tenant_id = p_tenant AND c.domain_id = p_domain AND c.committed_at >= p_from AND c.committed_at < p_to AND c.committed_at <= p_as_of
     ORDER BY c.committed_at, c.commitment_id
  LOOP
    v_via := analytics.mca_package_scope(p_scope, r.package_id, r.version, r.objectives);
    CONTINUE WHEN cardinality(v_via) = 0;
    SELECT count(DISTINCT e.explanation_id), count(rd.rendering_id) INTO v_xpl, v_rend
      FROM decision.explanations e LEFT JOIN decision.explanation_renderings rd ON rd.explanation_id = e.explanation_id AND rd.rendered_at <= r.committed_at
           AND (rd.withdrawn_at IS NULL OR rd.withdrawn_at > r.committed_at)
     WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain AND e.subject_kind = 'package_version' AND e.subject_id = r.package_id AND e.subject_version = r.version
       AND e.generated_at <= r.committed_at;
    v_recs := v_recs || analytics.mca_rec('decision_commitment', r.commitment_id::text, CASE WHEN v_rend > 0 THEN 'numerator' ELSE 'denominator' END, NULL,
      jsonb_build_object('package_id', r.package_id, 'version', r.version, 'committed_at', r.committed_at, 'explanations', v_xpl, 'renderings_before_commitment', v_rend, 'scope_via', to_jsonb(v_via)));
  END LOOP;
  RETURN analytics.mca_out('rate', v_recs, analytics.mca_clock_reasons(p_params, ARRAY['record']),
    jsonb_build_object('clock', 'record', 'use', 'a standing rendering of the committed version''s explanation at or before the commitment',
                       'notes', jsonb_build_array('page reads are not recorded by the product before §UX telemetry: use rests on renderings only')));
END $$;

-- §MCA.5 GRANTS AND REGISTRATION ────────────────────────────────────────────────────────────────────────────────────────────────────────
/* The computations run only inside the definer compute port (analytics.amc_compute, owned by the migration role): no runtime grant. */
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['met001_loop_closure', 'met002_package_completeness', 'met003_replay_success', 'met004_authority_integrity', 'met005_explanation_closure',
                           'met019_signal_precision', 'met020_signal_lead_time', 'met021_warning_delivery_latency', 'met022_warning_ack_latency', 'met023_warning_action_closure',
                           'met024_forecast_calibration', 'met025_forecast_sharpness', 'met026_scenario_distinctness', 'met027_simulation_reproducibility', 'met028_twin_sync_health',
                           'met029_alignment_coverage', 'met030_commitment_closure', 'v1_decision_cycle', 'v1_understanding_latency', 'v1_warning_precision', 'v1_attention_saved',
                           'es40_commitment_visibility', 'es40_explanation_use'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION analytics.mc_%s(uuid,uuid,timestamptz,timestamptz,timestamptz,jsonb,jsonb,jsonb) FROM PUBLIC', f);
  END LOOP;
END $$;

SELECT analytics.register_computation('met001_loop_closure', 'analytics.mc_met001_loop_closure', 'rate', ARRAY[]::text[],
  ARRAY['decision.commitments', 'decision.packages_current', 'decision.package_versions', 'decision.options', 'graph.strategy_current', 'objects.canonical_objects', 'simulation.runs_current',
        'prediction.forecasts_current', 'decision.package_scenario_sets', 'prediction.scenario_sets', 'decision.commitment_items', 'decision.outcomes', 'decision.outcome_assessments', 'decision.lessons', 'decision.package_events'],
  'the package rule: the committed version''s objectives, or the ids its options cite, intersect the scope''s objective_ids / entity_ids; a NULL scope = the domain',
  'MET-001 strategic loop closure: committed packages with all six links (objective, evidence, foresight, commitment, outcome recorded and assessed, learning), each judged at the as-of', '0113 §MCA');
SELECT analytics.register_computation('met002_package_completeness', 'analytics.mc_met002_package_completeness', 'rate', ARRAY['decision_class'],
  ARRAY['decision.gate_actions', 'decision.package_versions', 'decision.packages_current', 'decision.options', 'decision.dissent', 'decision.explanations', 'objects.canonical_objects', 'simulation.runs_current'],
  'the package rule (objectives or cited ids against the scope); a NULL scope = the domain',
  'MET-002 package completeness: versions at the decision gate with evidence, alternatives, risks, dissent, explanation and authority present at the gate instant', '0113 §MCA');
SELECT analytics.register_computation('met003_replay_success', 'analytics.mc_met003_replay_success', 'rate', ARRAY[]::text[],
  ARRAY['decision.commitments', 'decision.package_versions', 'decision.replays', 'decision.options'],
  'the package rule (objectives or cited ids against the scope); a NULL scope = the domain',
  'MET-003 decision replay success: committed packages whose latest replay has no unavailable input; never-replayed packages excluded and counted', '0113 §MCA');
SELECT analytics.register_computation('met004_authority_integrity', 'analytics.mc_met004_authority_integrity', 'rate', ARRAY['consequence_class'],
  ARRAY['decision.commitments', 'decision.approvals', 'executive.signatures', 'policy.policy_decisions', 'audit.audit_events', 'identity.principals'],
  'this metric ignores the scope (domain-wide by nature: authority integrity is a property of every consequential effect)',
  'MET-004 human authority integrity: commitments and signed acts bound to an eligible human, a digest and an audit event', '0113 §MCA');
SELECT analytics.register_computation('met005_explanation_closure', 'analytics.mc_met005_explanation_closure', 'rate', ARRAY[]::text[],
  ARRAY['decision.recommendations', 'decision.package_versions', 'decision.options', 'decision.explanations'],
  'the package rule of the recommendation''s package version; a NULL scope = the domain',
  'MET-005 recommendation explanation closure: decision-active recommendations resolving to evidence, assumptions, methods, alternatives and uncertainty', '0113 §MCA');
SELECT analytics.register_computation('met019_signal_precision', 'analytics.mc_met019_signal_precision', 'rate', ARRAY['detector'],
  ARRAY['prediction.signals_current', 'prediction.signal_events', 'prediction.warnings_current', 'identity.principals'],
  'the signal''s subject entity in entity_ids, or the warning raised from it by the warning rule; a NULL scope = the domain',
  'MET-019 weak signal precision: human-dispositioned nominations confirmed (confirm or escalate) — monitored, not optimized alone', '0113 §MCA');
SELECT analytics.register_computation('met020_signal_lead_time', 'analytics.mc_met020_signal_lead_time', 'duration', ARRAY[]::text[],
  ARRAY['prediction.warnings_current', 'prediction.signals_current'],
  'the warning rule: affected objectives / assets / geographies, or the forecast''s series, against the scope; a NULL scope = the domain',
  'MET-020 weak signal lead time: the signal''s record → the warning raised from it', '0113 §MCA');
SELECT analytics.register_computation('met021_warning_delivery_latency', 'analytics.mc_met021_warning_delivery_latency', 'duration', ARRAY['severity', 'channel'],
  ARRAY['executive.attention_deliveries', 'executive.attention_items', 'prediction.warnings_current', 'prediction.forecasts_current'],
  'the warning rule: affected objectives / assets / geographies, or the forecast''s series, against the scope; a NULL scope = the domain',
  'MET-021 warning delivery latency: the warning''s raise → the delivery receipt; synthetic channels excluded unless admitted', '0113 §MCA');
SELECT analytics.register_computation('met022_warning_ack_latency', 'analytics.mc_met022_warning_ack_latency', 'duration', ARRAY['severity', 'role'],
  ARRAY['prediction.warnings_current', 'executive.attention_deliveries', 'executive.attention_items', 'identity.role_bindings', 'identity.principals', 'prediction.forecasts_current'],
  'the warning rule: affected objectives / assets / geographies, or the forecast''s series, against the scope; a NULL scope = the domain',
  'MET-022 warning acknowledgement latency: the receipt → a qualified role''s acknowledgement (the raised_at proxy only when declared); world-clock warnings excluded', '0113 §MCA');
SELECT analytics.register_computation('met023_warning_action_closure', 'analytics.mc_met023_warning_action_closure', 'rate', ARRAY['severity'],
  ARRAY['prediction.warnings_current', 'executive.attention_items', 'executive.attention_item_acts', 'prediction.exposure_responses', 'prediction.warning_feedback'],
  'the warning rule: affected objectives / assets / geographies, or the forecast''s series, against the scope; a NULL scope = the domain',
  'MET-023 warning action closure: material warnings with an owned disposition, an action and an outcome', '0113 §MCA');
SELECT analytics.register_computation('met024_forecast_calibration', 'analytics.mc_met024_forecast_calibration', 'rate', ARRAY['horizon', 'method'],
  ARRAY['prediction.outcome_ledger', 'prediction.forecasts_current', 'prediction.backtests'],
  'the forecast rule: the outcome''s series key in series_keys, or its forecast''s subject entity in entity_ids; a NULL scope = the domain',
  'MET-024 forecast calibration: the 10–90 coverage of scored live outcomes (covered = q10 ≤ observed ≤ q90); backtests listed as context, never counted', '0113 §MCA');
SELECT analytics.register_computation('met025_forecast_sharpness', 'analytics.mc_met025_forecast_sharpness', 'score', ARRAY['horizon'],
  ARRAY['prediction.outcome_ledger', 'prediction.forecasts_current'],
  'the forecast rule: the outcome''s series key in series_keys, or its forecast''s subject entity in entity_ids; a NULL scope = the domain',
  'MET-025 forecast sharpness: mean relative interval width (q90 − q10)/|q50|, indeterminate unless the same population is calibrated', '0113 §MCA');
SELECT analytics.register_computation('met026_scenario_distinctness', 'analytics.mc_met026_scenario_distinctness', 'rate', ARRAY[]::text[],
  ARRAY['prediction.scenario_sets', 'prediction.scenario_set_members', 'prediction.scenario_elements', 'decision.package_versions'],
  'the set''s package by the package rule (a set bound to no package is outside any named scope); a NULL scope = the domain',
  'MET-026 scenario distinctness: approved sets whose branches'' driver/impact structures are pairwise materially different (Jaccard ≤ max_similarity)', '0113 §MCA');
SELECT analytics.register_computation('met027_simulation_reproducibility', 'analytics.mc_met027_simulation_reproducibility', 'rate', ARRAY[]::text[],
  ARRAY['simulation.runs_current', 'simulation.reproductions', 'twin.twins_current'],
  'the twin rule: the run''s twin boundary entities intersect entity_ids; a NULL scope = the domain',
  'MET-027 simulation reproducibility: accepted runs reproduced by digest equality (tolerance 0); never-reproduced runs excluded and counted', '0113 §MCA');
SELECT analytics.register_computation('met028_twin_sync_health', 'analytics.mc_met028_twin_sync_health', 'rate', ARRAY[]::text[],
  ARRAY['twin.twins_current', 'twin.twin_versions', 'twin.freshness_policies', 'twin.twin_contracts', 'twin.state_elements', 'twin.validations'],
  'the twin rule: the twin''s boundary entities intersect entity_ids; a NULL scope = the domain',
  'MET-028 twin sync health: admitted twins within their freshness, coverage and validation contracts at the as-of', '0113 §MCA');
SELECT analytics.register_computation('met029_alignment_coverage', 'analytics.mc_met029_alignment_coverage', 'rate', ARRAY[]::text[],
  ARRAY['executive.initiatives', 'executive.initiative_objectives', 'executive.plan_measures', 'decision.commitment_items', 'graph.strategy_current', 'graph.alignments', 'identity.principals'],
  'the item''s objectives against objective_ids; a NULL scope = the domain',
  'MET-029 strategic alignment coverage: approved initiatives and live commitment obligations linked to an objective, a capability, an owner and a measure', '0113 §MCA');
SELECT analytics.register_computation('met030_commitment_closure', 'analytics.mc_met030_commitment_closure', 'rate', ARRAY['portfolio'],
  ARRAY['decision.commitment_items', 'decision.commitments', 'decision.packages_current', 'decision.commitment_events', 'decision.outcomes'],
  'the item''s objectives against objective_ids; a NULL scope = the domain',
  'MET-030 commitment outcome closure: items due in the window closed with evidence, an exception, an outcome or supersession — portfolio level only', '0113 §MCA');
SELECT analytics.register_computation('v1_decision_cycle', 'analytics.mc_v1_decision_cycle', 'duration', ARRAY[]::text[],
  ARRAY['decision.commitments', 'decision.package_versions', 'decision.options'],
  'the package rule (objectives or cited ids against the scope); a NULL scope = the domain',
  'V01-T-046 decision cycle time: executive.metrics'' decision latency per commitment (proposal → commitment)', '0113 §MCA');
SELECT analytics.register_computation('v1_understanding_latency', 'analytics.mc_v1_understanding_latency', 'duration', ARRAY[]::text[],
  ARRAY['executive.attention_item_events', 'executive.attention_items', 'executive.attention_item_acts'],
  'this metric ignores the scope (domain-wide by nature: the attention queue is the domain''s)',
  'V01-T-046 understanding latency: executive.metrics'' time to understanding (first routing → first human act)', '0113 §MCA');
SELECT analytics.register_computation('v1_warning_precision', 'analytics.mc_v1_warning_precision', 'rate', ARRAY[]::text[],
  ARRAY['prediction.warnings_current', 'prediction.warning_feedback', 'prediction.forecasts_current'],
  'the warning rule: affected objectives / assets / geographies, or the forecast''s series, against the scope; a NULL scope = the domain',
  'V01-T-046 warning precision: evaluate_warnings'' useful ÷ (useful + false) feedback', '0113 §MCA');
SELECT analytics.register_computation('v1_attention_saved', 'analytics.mc_v1_attention_saved', 'rate', ARRAY[]::text[],
  ARRAY['executive.attention_items', 'executive.attention_item_events'],
  'this metric ignores the scope (domain-wide by nature: the attention queue is the domain''s)',
  'V01-T-046 attention saved / noise reduction: evaluate_attention_queue''s precision', '0113 §MCA');
SELECT analytics.register_computation('es40_commitment_visibility', 'analytics.mc_es40_commitment_visibility', 'rate', ARRAY[]::text[],
  ARRAY['decision.commitment_items', 'decision.commitment_events', 'executive.attention_deliveries', 'executive.attention_items'],
  'the item''s objectives against objective_ids; a NULL scope = the domain',
  'ES-40-008 commitment visibility: items received or accepted by their owner within the declared days of creation', '0113 §MCA');
SELECT analytics.register_computation('es40_explanation_use', 'analytics.mc_es40_explanation_use', 'rate', ARRAY[]::text[],
  ARRAY['decision.commitments', 'decision.package_versions', 'decision.explanations', 'decision.explanation_renderings', 'decision.options'],
  'the package rule (objectives or cited ids against the scope); a NULL scope = the domain',
  'ES-40-008 explanation use: commitments whose version''s explanation was rendered before the commitment', '0113 §MCA');
