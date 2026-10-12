-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0113 §CO — CP-6 B92 part `comparability` (2026-10-12): COMPARABILITY, UNCERTAINTY IN USE, THE STANDING EVALUATION, COST RECONCILIATION AND
-- THE ACCEPTANCE FIXTURES (F-P7-F-03: V8 ch.70 PR-70-005, PR-70-006, AT-70; the B90 residuals DP-44-001 cohorts / relationships / analytical
-- models as governed semantic objects and DP-44-006 the exposure-EUR fixture — the fixture itself is the harness's).
--
-- Applies ALONE on top of 0001–0112 and the prelude (0113 §0). Forward-only; the prelude and 0001–0112 untouched. Re-declared here (and ONLY
-- here — DESIGN/PARTS §CO): the prelude's two hooks analytics.evaluate_result and analytics.after_result, each copied whole from the prelude
-- (0113 §0.7) and replaced by the body marked `-- B92 co`.
--
--   §CO.1 THE TABLES      analytics.computation_costs (the meter of every computation: records read, compute ms — B91's dimension vocabulary is
--                         a closed CHECK on commercial.usage_records, so no B91 meter is registered here: the cost is this ledger's and the
--                         reconciliation compares it with B91's) · analytics.comparisons (append-only) · analytics.reconciliations
--                         (append-only) · products.semantic_objects / semantic_object_versions / semantic_object_certifications (DP-44-001)
--   §CO.2 THE HELPERS     the breach rule (the compute body's, as a function), the semantic projection of a definition, Newcombe's interval,
--                         a safe instant cast
--   §CO.3 HOOK 1          analytics.evaluate_result — THE STANDING EVALUATION (PR-70-005): stale, incomplete, biased, non-comparable, gamed,
--                         privacy, outcome-detached; each failing check is a REASON (→ indeterminate) and a listed check
--   §CO.4 HOOK 2          analytics.after_result — the meter; a determinate BREACH raised as a REVIEW (analytics.metric, never an automatic
--                         decision); an unsafe evaluation raised (analytics.privacy / analytics.metric) and closed when the metric recovers
--   §CO.5 COMPARISON      analytics.compare_results [analytics.comparison.run] + the reads
--   §CO.6 SEMANTIC OBJECTS products.semantic_declare [products.semantic.declare] · products.semantic_certify [products.semantic.certify] ·
--                         products.semantic_withdraw [products.semantic.withdraw] + the reads (DP-44-001)
--   §CO.7 RECONCILIATION  analytics.reconcile_costs [analytics.reconciliation.run] + the reads (PR-70-006, D15)
--
-- THE CLAIMS (three different things, never confused): SOFTWARE CAPABILITY — what these functions do, proven by the part harness on
-- SYNTHETIC rows; SYNTHETIC DEMONSTRATION — the act on NORDWERK's synthetic records; REAL-PROVIDER / SIGNED ACCEPTANCE — AT-70's and
-- PR-70-006's named-authority acceptance record is R2's, not built here.
-- Refusal nouns (apps/api/src/analytics/seams.ts): `cohort comparison`, `semantic object`, `cost reconciliation` — rows central (B92 §0).
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- §CO.1 THE TABLES ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* THE COMPUTATION METER (PR-70-006, D15): one row per written result (a computation, a replay, a preview) — the records it read (the records
   the result rests on: what the computation returned, not the rows the planner scanned — stated), the compute time (the database clock from
   the start of the statement that called the compute or replay port to the after-result step — stated), the definition's cost allocation.
   Written by HOOK 2 only (definer); append-only. */
CREATE TABLE analytics.computation_costs (
  result_id           uuid PRIMARY KEY REFERENCES analytics.metric_results (result_id),
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  metric_key          text NOT NULL,
  definition_version  int  NOT NULL,
  computation_key     text,
  computation_version int,
  rows_read           int  NOT NULL CHECK (rows_read >= 0),
  compute_ms          numeric NOT NULL CHECK (compute_ms >= 0),
  replay              boolean NOT NULL,
  preview             boolean NOT NULL,
  cost_allocation     jsonb NOT NULL DEFAULT '{}'::jsonb,
  measured_by         text NOT NULL,
  computed_by_kind    text NOT NULL,
  recorded_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT acc_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX acc_window ON analytics.computation_costs (tenant_id, domain_id, recorded_at);

/* THE COHORT COMPARISONS (PR-70-005 Interpretation control; DP-44-001's "cohort comparison"): two results of one metric — two cohorts or two
   periods — compared WITH uncertainty, or INDETERMINATE with the reasons it cannot be. Append-only. */
CREATE TABLE analytics.comparisons (
  comparison_id     uuid PRIMARY KEY,
  scope             text NOT NULL,
  tenant_id         uuid NOT NULL,
  domain_id         uuid NOT NULL,
  metric_key        text NOT NULL,
  result_a          uuid NOT NULL REFERENCES analytics.metric_results (result_id),
  result_b          uuid NOT NULL REFERENCES analytics.metric_results (result_id),
  cohort_object_a   jsonb,
  cohort_object_b   jsonb,
  kind              text NOT NULL,
  state             text NOT NULL CHECK (state IN ('determinate', 'indeterminate')),
  estimate          numeric,
  interval          jsonb,
  method            text,
  claim             text NOT NULL CHECK (length(btrim(claim)) >= 8),
  sides             jsonb NOT NULL CHECK (jsonb_typeof(sides) = 'object'),
  composition       jsonb NOT NULL DEFAULT '{}'::jsonb,
  comparability     jsonb NOT NULL DEFAULT '{}'::jsonb,
  reasons           jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(reasons) = 'array'),
  digest            text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  run_by            uuid NOT NULL,
  run_by_kind       text NOT NULL,
  run_at            timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id    uuid NOT NULL,
  CONSTRAINT acp_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT acp_two CHECK (result_a <> result_b),
  CONSTRAINT acp_state CHECK ((state = 'determinate') = (estimate IS NOT NULL) AND (state = 'determinate' OR jsonb_array_length(reasons) >= 1))
);
CREATE INDEX acp_metric ON analytics.comparisons (tenant_id, domain_id, metric_key, run_at DESC);

/* THE COST RECONCILIATIONS (PR-70-006, D15): this ledger's computations of a period against B91's metered usage and its priced cost entries —
   matched | unpriced | discrepant units named one by one; `empty` when the period holds no computation; NEVER a silent pass. Append-only. */
CREATE TABLE analytics.reconciliations (
  reconciliation_id uuid PRIMARY KEY,
  scope             text NOT NULL,
  tenant_id         uuid NOT NULL,
  domain_id         uuid NOT NULL,
  period_key        text NOT NULL,
  window_from       timestamptz NOT NULL,
  window_to         timestamptz NOT NULL,
  tolerance         numeric NOT NULL CHECK (tolerance >= 0 AND tolerance <= 1),
  outcome           text NOT NULL CHECK (outcome IN ('matched', 'unpriced', 'discrepant', 'empty')),
  units             jsonb NOT NULL CHECK (jsonb_typeof(units) = 'array'),
  counts            jsonb NOT NULL CHECK (jsonb_typeof(counts) = 'object'),
  totals            jsonb NOT NULL CHECK (jsonb_typeof(totals) = 'object'),
  reasons           jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(reasons) = 'array'),
  digest            text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  run_by            uuid NOT NULL,
  run_at            timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id    uuid NOT NULL,
  CONSTRAINT arc_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT arc_window CHECK (window_to > window_from),
  CONSTRAINT arc_not_silent CHECK (outcome = 'matched' OR jsonb_array_length(reasons) >= 1)
);
CREATE INDEX arc_period ON analytics.reconciliations (tenant_id, domain_id, period_key, run_at DESC);

/* DP-44-001 — COHORTS, RELATIONSHIPS AND ANALYTICAL MODELS AS GOVERNED SEMANTIC OBJECTS of B90's layer (beside products.semantic_models):
   one row per object (its standing, the B90 semantic_models idiom; never deleted), its versions (append-only, digested), its certifications
   (the B90 metric_certifications idiom: the OWNER's act, an expiry ≤ 366 days, forward-only active → withdrawn | expired). The owner is a
   named human holding product_analytics_owner (CAP-DL-11's accountable owner, stated mapping); the declarer is a data steward or a product
   analyst; the owner never certifies a version they declared themselves (humans approve, never the proposer). */
CREATE TABLE products.semantic_objects (
  object_id          uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  object_key         text NOT NULL CHECK (object_key ~ '^[a-z][a-z0-9_.-]{2,62}$'),
  kind               text NOT NULL CHECK (kind IN ('cohort', 'relationship', 'analytical_model')),
  title              text NOT NULL CHECK (length(btrim(title)) BETWEEN 4 AND 200),
  owner_principal_id uuid NOT NULL,
  current_version    int  NOT NULL CHECK (current_version >= 1),
  certified_version  int,
  last_valid_version int,
  state              text NOT NULL DEFAULT 'declared' CHECK (state IN ('declared', 'certified', 'withdrawn', 'expired')),
  declared_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT pso_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT pso_key_per_domain UNIQUE (tenant_id, domain_id, object_key),
  CONSTRAINT pso_certified_bound CHECK ((state = 'certified') = (certified_version IS NOT NULL)),
  CONSTRAINT pso_last_valid CHECK (state = 'declared' OR last_valid_version IS NOT NULL)
);
CREATE TRIGGER pso_no_delete BEFORE DELETE ON products.semantic_objects FOR EACH ROW EXECUTE FUNCTION products.no_delete();

CREATE TABLE products.semantic_object_versions (
  object_id        uuid NOT NULL REFERENCES products.semantic_objects (object_id),
  version          int  NOT NULL CHECK (version >= 1),
  tenant_id        uuid NOT NULL,
  domain_id        uuid NOT NULL,
  title            text NOT NULL,
  definition       jsonb NOT NULL CHECK (jsonb_typeof(definition) = 'object'),
  digest           text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  declared_by      uuid NOT NULL,
  declared_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id   uuid NOT NULL,
  PRIMARY KEY (object_id, version)
);
CREATE TRIGGER psov_append_only BEFORE UPDATE OR DELETE ON products.semantic_object_versions FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

CREATE TABLE products.semantic_object_certifications (
  certification_id  uuid PRIMARY KEY,
  object_id         uuid NOT NULL REFERENCES products.semantic_objects (object_id),
  tenant_id         uuid NOT NULL,
  domain_id         uuid NOT NULL,
  version           int  NOT NULL,
  digest            text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  certified_by      uuid NOT NULL,
  certified_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at        timestamptz NOT NULL,
  reason            text NOT NULL CHECK (length(btrim(reason)) >= 8),
  state             text NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'withdrawn', 'expired')),
  withdrawn_at      timestamptz,
  withdrawn_by      uuid,
  withdrawal_reason text,
  correlation_id    uuid NOT NULL,
  CONSTRAINT psoc_version FOREIGN KEY (object_id, version) REFERENCES products.semantic_object_versions (object_id, version),
  CONSTRAINT psoc_expiry CHECK (expires_at > certified_at AND expires_at <= certified_at + interval '366 days'),
  CONSTRAINT psoc_withdrawn_bound CHECK ((state = 'active') = (withdrawn_at IS NULL AND withdrawn_by IS NULL AND withdrawal_reason IS NULL))
);
CREATE INDEX psoc_object ON products.semantic_object_certifications (object_id, certified_at DESC);
/* A certification moves ONE way (active → withdrawn | expired, the triple set once; nothing else changes; never deleted) — 0095's idiom. */
CREATE OR REPLACE FUNCTION products.sob_certifications_forward() RETURNS trigger
SET search_path = products, pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'semantic object certifications are append-only: DELETE prohibited' USING ERRCODE = '2F002'; END IF;
  IF OLD.state <> 'active' OR NEW.state = 'active' OR NEW.withdrawn_at IS NULL OR NEW.withdrawn_by IS NULL OR NEW.withdrawal_reason IS NULL
     OR (to_jsonb(NEW) - 'state' - 'withdrawn_at' - 'withdrawn_by' - 'withdrawal_reason') <> (to_jsonb(OLD) - 'state' - 'withdrawn_at' - 'withdrawn_by' - 'withdrawal_reason') THEN
    RAISE EXCEPTION 'semantic object certification % is immutable; it moves once from active to withdrawn or expired', OLD.certification_id USING ERRCODE = '2F002';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER psoc_forward BEFORE UPDATE OR DELETE ON products.semantic_object_certifications FOR EACH ROW EXECUTE FUNCTION products.sob_certifications_forward();

CREATE TRIGGER acc_append_only BEFORE UPDATE OR DELETE ON analytics.computation_costs FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
CREATE TRIGGER acp_append_only BEFORE UPDATE OR DELETE ON analytics.comparisons FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
CREATE TRIGGER arc_append_only BEFORE UPDATE OR DELETE ON analytics.reconciliations FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

-- RLS and grants (the prelude's loop idiom): SELECT under domain isolation; no write grant — the definer ports and hook 2 write.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['computation_costs', 'comparisons', 'reconciliations'] LOOP
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
  FOREACH t IN ARRAY ARRAY['semantic_objects', 'semantic_object_versions', 'semantic_object_certifications'] LOOP
    EXECUTE format('REVOKE ALL ON products.%I FROM PUBLIC', t);
    EXECUTE format('ALTER TABLE products.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE products.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY products_isolation ON products.%I
        USING (
          tenant_id = public.eye_tenant()
          AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain())
        )$f$, t);
    EXECUTE format('GRANT SELECT ON products.%I TO eye_app, eye_commit', t);
  END LOOP;
END $$;

-- §CO.2 THE HELPERS (internal: REVOKE PUBLIC, granted to nobody unless said) ──────────────────────────────────────────────────────────────
/* The breach rule of the compute body (0113 §0.7, amc_compute) as a function: a band → outside it; a target → below it (higher) or above it
   (lower); anything else → NULL (no breach rule). */
CREATE OR REPLACE FUNCTION analytics.aco_breach(p_threshold jsonb, p_direction text, p_value numeric) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT CASE WHEN p_value IS NULL OR p_threshold IS NULL OR p_threshold = '{}'::jsonb THEN NULL
              WHEN p_threshold ? 'band' THEN p_value < (p_threshold -> 'band' ->> 0)::numeric OR p_value > (p_threshold -> 'band' ->> 1)::numeric
              WHEN p_threshold ? 'target' AND p_direction = 'higher' THEN p_value < (p_threshold ->> 'target')::numeric
              WHEN p_threshold ? 'target' AND p_direction = 'lower' THEN p_value > (p_threshold ->> 'target')::numeric
              ELSE NULL END
$$;
/* The SEMANTIC projection of a definition (what decides the value): two versions whose projections are equal compute the same quantity —
   their contract digests may differ in non-semantic fields only (title, meaning's wording, cadence, owner, action, retirement, serves,
   threshold, quality, cost allocation, source rows): THE COMPARABILITY RULE of the comparison (stated on every comparison). */
CREATE OR REPLACE FUNCTION analytics.aco_semantic(d analytics.metric_definitions) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = analytics, pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object('kind', d.kind, 'unit', d.unit, 'direction', d.direction, 'population', d.population, 'numerator', d.numerator, 'denominator', d.denominator,
                            'exclusions', d.exclusions, 'window_spec', d.window_spec, 'dimensions', to_jsonb(d.dimensions), 'privacy_class', d.privacy_class, 'k_min', d.k_min,
                            'floor_n', d.floor_n, 'computation_key', d.computation_key, 'params', d.params, 'supported', d.supported)
$$;
/* NEWCOMBE's hybrid score interval (method 10) of a difference of two proportions k1/n1 − k2/n2, from the two Wilson intervals (D6). */
CREATE OR REPLACE FUNCTION analytics.aco_newcombe(p_k1 numeric, p_n1 numeric, p_k2 numeric, p_n2 numeric) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path = analytics, pg_catalog, pg_temp AS $$
DECLARE w1 jsonb := analytics.wilson(p_k1, p_n1); w2 jsonb := analytics.wilson(p_k2, p_n2); p1 numeric; p2 numeric; l1 numeric; u1 numeric; l2 numeric; u2 numeric; dd numeric;
BEGIN
  IF w1 IS NULL OR w2 IS NULL THEN RETURN NULL; END IF;
  p1 := p_k1 / p_n1; p2 := p_k2 / p_n2; l1 := (w1 ->> 'lo')::numeric; u1 := (w1 ->> 'hi')::numeric; l2 := (w2 ->> 'lo')::numeric; u2 := (w2 ->> 'hi')::numeric; dd := p1 - p2;
  RETURN jsonb_build_object('method', 'newcombe_hybrid_score', 'level', 0.95, 'estimate', round(dd, 6),
                            'lo', round(greatest(-1, dd - sqrt(power(p1 - l1, 2) + power(u2 - p2, 2))), 6),
                            'hi', round(least(1, dd + sqrt(power(u1 - p1, 2) + power(p2 - l2, 2))), 6),
                            'a', w1 || jsonb_build_object('p', round(p1, 6), 'k', p_k1, 'n', p_n1), 'b', w2 || jsonb_build_object('p', round(p2, 6), 'k', p_k2, 'n', p_n2));
END $$;
/* An instant from jsonb text, NULL when it is none (a computation's quality is data, never trusted to parse). */
CREATE OR REPLACE FUNCTION analytics.aco_instant(p text) RETURNS timestamptz
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF p IS NULL OR p !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' THEN RETURN NULL; END IF;
  RETURN p::timestamptz;
EXCEPTION WHEN OTHERS THEN RETURN NULL;
END $$;
/* A number from jsonb, NULL when it is none. */
CREATE OR REPLACE FUNCTION analytics.aco_num(p jsonb) RETURNS numeric
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$ SELECT CASE WHEN jsonb_typeof(p) = 'number' THEN (p #>> '{}')::numeric END $$;
REVOKE ALL ON FUNCTION analytics.aco_semantic(analytics.metric_definitions), analytics.aco_instant(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION analytics.aco_breach(jsonb, text, numeric), analytics.aco_newcombe(numeric, numeric, numeric, numeric), analytics.aco_num(jsonb) TO eye_app, eye_commit;

-- §CO.3 HOOK 1 — THE STANDING EVALUATION ──────────────────────────────────────────────────────────────────────────────────────────────────
/* HOOK 1 — the standing evaluation of a draft result BEFORE it is written (§CO re-declares it, copied whole): stale, biased, gamed,
   privacy-invasive, non-comparable or outcome-detached → reasons that make the result indeterminate; checks for the record.
   -- B92 co: THE STANDING EVALUATION (PR-70-005). The draft is the compute body's (0113 §0.7: metric_key, definition_id, definition_version,
   period, window_from/to, as_of, scope, cohort, n, value, quality, records_count, tenant_id, domain_id; and — when the integrator widens it —
   records and distinct_actors). Every check reads only what was recorded at or before the draft's as-of, so a replay re-evaluates the same
   way. Each check is listed in `checks` as {check, status: pass | fail | not_evaluable | not_declared, detail}; each FAIL adds a reason
   prefixed with its class word (stale: · incomplete: · biased: · non-comparable: · gamed: · privacy: · outcome-detached:) and makes the
   result INDETERMINATE (never a zero). The checks, stated:
     STALE            the population's newest record (quality.newest_record_at | quality.source_newest_at | the records' detail.at) older than
                      quality.max_staleness_days (default 1.5 × the window's length) before the window's end (or the as-of when earlier).
     INCOMPLETE       the excluded share (excluded ÷ (excluded + n): the records' roles, else quality.excluded_count) above
                      quality.max_exclusion_share (default 0.5).
     BIASED           a DECLARED bias check quality.bias {dimension, min_share, values?}: a cohort of the population (by the records' detail
                      or quality.composition) under-represented below min_share — a declared check that cannot be evaluated is itself a
                      failure; and the synthetic / replayed share (quality.synthetic_share | replay_share) above quality.max_synthetic_share
                      | max_replay_share (default 0.5) — stated either way.
     NON-COMPARABLE   the definition changed inside the window (another version of the key effective strictly inside (from, to), at or
                      before the as-of, after an earlier effective version); or the computation's clock differs from the definition's, or it
                      reports mixed clocks.
     GAMED            (a) against the PREVIOUS period's determinate result (same metric, scope and cohort; written at or before the as-of):
                      the excluded share GREW while the value moved in the definition's favourable direction by more than quality.gaming_jump
                      (default 0.15 — absolute for a rate, relative otherwise); (b) the threshold changed with this version (version − 1's
                      differs) and that change ALONE moves this value from breach to pass.
     PRIVACY          a cohort key outside the definition's dimensions or naming a person; a pseudonymous_cohort definition without k_min ≥ 5
                      under a product_improvement purpose; a role cohort with no distinct-principal count (k cannot be established) or below
                      k; the definition's purpose present in the register but approved by no version at the as-of (a retired or rejected
                      purpose — collection beyond an approved purpose).
     OUTCOME-DETACHED a `serves` objective absent from the domain's strategy objects at the as-of, or closed / withdrawn by then.
   An empty `serves` is not a failure here: §MD's proposal port refuses it (a planted definition is said `not_declared`). */
CREATE OR REPLACE FUNCTION analytics.evaluate_result(p_draft jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = analytics, pg_catalog, pg_temp AS $$   -- B92 co (the prelude's body was the no-op `SELECT jsonb_build_object('reasons', '[]', 'checks', '[]', 'by', …)`)
DECLARE d analytics.metric_definitions%ROWTYPE; dq jsonb; q jsonb := coalesce(p_draft -> 'quality', '{}'::jsonb); v_recs jsonb; v_checks jsonb := '[]'::jsonb; v_reasons jsonb := '[]'::jsonb;
        v_from timestamptz := analytics.aco_instant(p_draft ->> 'window_from'); v_to timestamptz := analytics.aco_instant(p_draft ->> 'window_to');
        v_as_of timestamptz := analytics.aco_instant(p_draft ->> 'as_of'); v_n int := (p_draft ->> 'n')::int; v_value numeric := analytics.aco_num(p_draft -> 'value');
        v_cohort jsonb := coalesce(p_draft -> 'cohort', '{}'::jsonb); v_ref timestamptz; v_newest timestamptz; v_max numeric; v_days numeric; v_excl int; v_share numeric;
        v_bias jsonb; v_dim text; v_comp jsonb; v_pop numeric; v_min numeric; v_low jsonb; v_val text; v_syn numeric; v_rep numeric; v_ver record; v_prev record;
        v_prev_share numeric; v_jump numeric; v_move numeric; v_prior analytics.metric_definitions%ROWTYPE; v_k int; v_fail text; v_obj text; v_status text; v_bad jsonb;
        v_clock text; v_purpose_known boolean; v_purpose_ok boolean; v_kind text;
BEGIN
  SELECT * INTO d FROM analytics.metric_definitions x WHERE x.definition_id = (p_draft ->> 'definition_id')::uuid;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('reasons', '[]'::jsonb, 'checks', '[]'::jsonb, 'by', 'B92 co (the draft names no definition: nothing evaluated)');
  END IF;
  dq := coalesce(d.quality, '{}'::jsonb);
  v_recs := CASE WHEN jsonb_typeof(p_draft -> 'records') = 'array' THEN p_draft -> 'records' END;
  v_ref := least(v_to, coalesce(v_as_of, v_to));
  v_clock := coalesce(d.window_spec ->> 'clock', 'record');

  -- STALE
  v_days := extract(epoch FROM (v_to - v_from)) / 86400.0;
  v_max := coalesce(analytics.aco_num(dq -> 'max_staleness_days'), round(1.5 * v_days, 3));
  v_newest := coalesce(analytics.aco_instant(q ->> 'newest_record_at'), analytics.aco_instant(q ->> 'source_newest_at'));
  IF v_newest IS NULL AND v_recs IS NOT NULL THEN
    SELECT max(analytics.aco_instant(coalesce(r -> 'detail' ->> 'at', r -> 'detail' ->> 'recorded_at'))) INTO v_newest FROM jsonb_array_elements(v_recs) r WHERE r ->> 'role' IN ('numerator', 'denominator', 'included');
  END IF;
  IF v_newest IS NULL THEN
    v_checks := v_checks || jsonb_build_object('check', 'stale', 'status', 'not_evaluable', 'detail', CASE WHEN coalesce(v_n, 0) = 0 THEN 'no population to date' ELSE 'the computation reports no newest-record instant (quality.newest_record_at)' END);
  ELSIF extract(epoch FROM (v_ref - v_newest)) / 86400.0 > v_max THEN
    v_reasons := v_reasons || to_jsonb(format('stale: the population''s newest record (%s) is %s days before %s, beyond the %s days the definition allows (quality.max_staleness_days) — the source has gone quiet; not presented as current',
                                              v_newest, round(extract(epoch FROM (v_ref - v_newest)) / 86400.0, 1), v_ref, v_max));
    v_checks := v_checks || jsonb_build_object('check', 'stale', 'status', 'fail', 'detail', jsonb_build_object('newest', v_newest, 'reference', v_ref, 'max_days', v_max));
  ELSE
    v_checks := v_checks || jsonb_build_object('check', 'stale', 'status', 'pass', 'detail', jsonb_build_object('newest', v_newest, 'reference', v_ref, 'max_days', v_max));
  END IF;

  -- INCOMPLETE
  IF v_recs IS NOT NULL THEN
    SELECT count(*) FILTER (WHERE r ->> 'role' = 'excluded') INTO v_excl FROM jsonb_array_elements(v_recs) r;
  ELSE
    v_excl := analytics.aco_num(q -> 'excluded_count')::int;
  END IF;
  v_max := coalesce(analytics.aco_num(dq -> 'max_exclusion_share'), 0.5);
  IF v_excl IS NULL THEN
    v_checks := v_checks || jsonb_build_object('check', 'incomplete', 'status', 'not_evaluable', 'detail', 'the draft carries no records and the computation reports no quality.excluded_count');
  ELSIF v_excl + coalesce(v_n, 0) = 0 THEN
    v_checks := v_checks || jsonb_build_object('check', 'incomplete', 'status', 'not_evaluable', 'detail', 'no record at all');
  ELSE
    v_share := round(v_excl::numeric / (v_excl + coalesce(v_n, 0)), 6);
    IF v_share > v_max THEN
      v_reasons := v_reasons || to_jsonb(format('incomplete: %s of %s records are excluded (%s%%), above the %s%% the definition allows (quality.max_exclusion_share): what remains does not stand for the population',
                                                v_excl, v_excl + coalesce(v_n, 0), round(100 * v_share, 1), round(100 * v_max, 1)));
      v_checks := v_checks || jsonb_build_object('check', 'incomplete', 'status', 'fail', 'detail', jsonb_build_object('excluded', v_excl, 'n', v_n, 'share', v_share, 'max', v_max));
    ELSE
      v_checks := v_checks || jsonb_build_object('check', 'incomplete', 'status', 'pass', 'detail', jsonb_build_object('excluded', v_excl, 'n', v_n, 'share', v_share, 'max', v_max));
    END IF;
  END IF;

  -- BIASED (a declared cohort check; the synthetic / replay share)
  v_bias := dq -> 'bias';
  IF jsonb_typeof(v_bias) = 'object' AND v_bias ? 'dimension' THEN
    v_dim := v_bias ->> 'dimension'; v_min := coalesce(analytics.aco_num(v_bias -> 'min_share'), 0.1);
    IF v_recs IS NOT NULL THEN
      SELECT jsonb_object_agg(k, c) INTO v_comp FROM (SELECT coalesce(r -> 'detail' ->> v_dim, '(none)') k, count(*) c FROM jsonb_array_elements(v_recs) r
                                                        WHERE r ->> 'role' IN ('numerator', 'denominator', 'included') GROUP BY 1) z;
    ELSE
      v_comp := CASE WHEN jsonb_typeof(q -> 'composition' -> v_dim) = 'object' THEN q -> 'composition' -> v_dim END;
    END IF;
    IF v_comp IS NULL THEN
      v_reasons := v_reasons || to_jsonb(format('biased: the definition declares a bias check on %s, which cannot be evaluated — the computation reports no composition by %s; an unverifiable population is not presented as representative', v_dim, v_dim));
      v_checks := v_checks || jsonb_build_object('check', 'biased', 'status', 'fail', 'detail', jsonb_build_object('dimension', v_dim, 'composition', NULL));
    ELSE
      SELECT sum((value #>> '{}')::numeric) INTO v_pop FROM jsonb_each(v_comp);
      SELECT coalesce(jsonb_object_agg(v.x, round(coalesce((v_comp ->> v.x)::numeric, 0) / nullif(v_pop, 0), 6)), '{}'::jsonb) INTO v_low
        FROM (SELECT x FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(v_bias -> 'values') = 'array' THEN v_bias -> 'values' ELSE (SELECT jsonb_agg(k) FROM jsonb_object_keys(v_comp) k) END) x) v
       WHERE coalesce((v_comp ->> v.x)::numeric, 0) / nullif(v_pop, 0) < v_min OR v_pop IS NULL OR v_pop = 0;
      IF v_low <> '{}'::jsonb THEN
        v_reasons := v_reasons || to_jsonb(format('biased: on %s the cohort(s) %s are under-represented (share below %s%% of the %s records in the population): the declared bias check fails',
                                                  v_dim, (SELECT string_agg(k || ' ' || round(100 * (v_low ->> k)::numeric, 1) || '%', ', ' ORDER BY k) FROM jsonb_object_keys(v_low) k), round(100 * v_min, 1), coalesce(v_pop, 0)));
        v_checks := v_checks || jsonb_build_object('check', 'biased', 'status', 'fail', 'detail', jsonb_build_object('dimension', v_dim, 'composition', v_comp, 'under_represented', v_low, 'min_share', v_min));
      ELSE
        v_checks := v_checks || jsonb_build_object('check', 'biased', 'status', 'pass', 'detail', jsonb_build_object('dimension', v_dim, 'composition', v_comp, 'min_share', v_min));
      END IF;
    END IF;
  ELSE
    v_checks := v_checks || jsonb_build_object('check', 'biased', 'status', 'not_declared', 'detail', 'the definition declares no bias check (quality.bias)');
  END IF;
  v_syn := analytics.aco_num(q -> 'synthetic_share');
  IF v_syn IS NULL AND v_recs IS NOT NULL AND coalesce(v_n, 0) > 0 THEN
    SELECT round(count(*) FILTER (WHERE (r -> 'detail' ->> 'synthetic') = 'true')::numeric / v_n, 6) INTO v_syn FROM jsonb_array_elements(v_recs) r WHERE r ->> 'role' IN ('numerator', 'denominator', 'included');
  END IF;
  v_rep := analytics.aco_num(q -> 'replay_share');
  v_max := coalesce(analytics.aco_num(dq -> 'max_synthetic_share'), 0.5);
  IF v_syn IS NOT NULL AND v_syn > v_max THEN
    v_reasons := v_reasons || to_jsonb(format('biased: %s%% of the population is synthetic (a substitute channel or fixture), above the %s%% the definition admits (quality.max_synthetic_share): a demonstration is not presented as the measure',
                                              round(100 * v_syn, 1), round(100 * v_max, 1)));
    v_checks := v_checks || jsonb_build_object('check', 'synthetic_share', 'status', 'fail', 'detail', jsonb_build_object('share', v_syn, 'max', v_max));
  ELSE
    v_checks := v_checks || jsonb_build_object('check', 'synthetic_share', 'status', CASE WHEN v_syn IS NULL THEN 'not_evaluable' ELSE 'pass' END, 'detail', jsonb_build_object('share', v_syn, 'max', v_max));
  END IF;
  v_max := coalesce(analytics.aco_num(dq -> 'max_replay_share'), 0.5);
  IF v_rep IS NOT NULL AND v_rep > v_max THEN
    v_reasons := v_reasons || to_jsonb(format('biased: %s%% of the population is replayed (world-clock) records, above the %s%% the definition admits (quality.max_replay_share)', round(100 * v_rep, 1), round(100 * v_max, 1)));
    v_checks := v_checks || jsonb_build_object('check', 'replay_share', 'status', 'fail', 'detail', jsonb_build_object('share', v_rep, 'max', v_max));
  ELSE
    v_checks := v_checks || jsonb_build_object('check', 'replay_share', 'status', CASE WHEN v_rep IS NULL THEN 'not_evaluable' ELSE 'pass' END, 'detail', jsonb_build_object('share', v_rep, 'max', v_max));
  END IF;

  -- NON-COMPARABLE (the definition changed inside the window; the clock)
  SELECT x.version, x.effective_from INTO v_ver FROM analytics.metric_definitions x
   WHERE x.tenant_id = d.tenant_id AND x.domain_id = d.domain_id AND x.metric_key = d.metric_key AND x.effective_from IS NOT NULL
     AND x.effective_from > v_from AND x.effective_from < v_to AND x.effective_from <= coalesce(v_as_of, v_to)
     AND EXISTS (SELECT 1 FROM analytics.metric_definitions y WHERE y.tenant_id = d.tenant_id AND y.domain_id = d.domain_id AND y.metric_key = d.metric_key
                                                               AND y.effective_from IS NOT NULL AND y.effective_from < x.effective_from AND y.version < x.version)
   ORDER BY x.effective_from DESC LIMIT 1;
  IF FOUND THEN
    v_reasons := v_reasons || to_jsonb(format('non-comparable: the definition changed inside the window — version %s took effect at %s, inside [%s, %s): the window mixes two definitions; compute the periods on either side',
                                              v_ver.version, v_ver.effective_from, v_from, v_to));
    v_checks := v_checks || jsonb_build_object('check', 'non_comparable', 'status', 'fail', 'detail', jsonb_build_object('changed_version', v_ver.version, 'effective_from', v_ver.effective_from));
  ELSIF coalesce((q ->> 'mixed_clocks')::boolean, false) OR (q ? 'clock' AND q ->> 'clock' IS NOT NULL AND q ->> 'clock' <> v_clock) THEN
    v_reasons := v_reasons || to_jsonb(format('non-comparable: the population mixes clocks (the definition reads the %s clock; the computation reports %s): record-time and world-time instants are not one window',
                                              v_clock, coalesce(q ->> 'clock', 'mixed clocks')));
    v_checks := v_checks || jsonb_build_object('check', 'non_comparable', 'status', 'fail', 'detail', jsonb_build_object('definition_clock', v_clock, 'quality_clock', q ->> 'clock', 'mixed', q -> 'mixed_clocks'));
  ELSE
    v_checks := v_checks || jsonb_build_object('check', 'non_comparable', 'status', 'pass', 'detail', jsonb_build_object('version', d.version, 'clock', v_clock));
  END IF;

  -- GAMED (a) exclusions grew while the value jumped; (b) the threshold moved the value across it
  IF v_value IS NULL THEN
    v_checks := v_checks || jsonb_build_object('check', 'gamed', 'status', 'not_evaluable', 'detail', 'no value to test');
  ELSE
    v_fail := NULL;
    SELECT r.result_id, r.value, r.n, r.period_key,
           (SELECT count(*) FROM analytics.result_records rr WHERE rr.result_id = r.result_id AND rr.role = 'excluded') AS excluded
      INTO v_prev FROM analytics.metric_results r
     WHERE r.tenant_id = d.tenant_id AND r.domain_id = d.domain_id AND r.metric_key = d.metric_key AND r.window_to = v_from AND r.state = 'determinate'
       AND NOT r.preview AND r.replay_of IS NULL AND r.scope_key IS NOT DISTINCT FROM (p_draft -> 'scope' ->> 'scope_key') AND r.cohort = v_cohort
       AND r.computed_at <= coalesce(v_as_of, clock_timestamp())
     ORDER BY r.computed_at DESC LIMIT 1;
    v_jump := coalesce(analytics.aco_num(dq -> 'gaming_jump'), 0.15);
    IF FOUND AND v_share IS NOT NULL AND coalesce(v_prev.n, 0) + v_prev.excluded > 0 THEN
      v_prev_share := round(v_prev.excluded::numeric / (v_prev.excluded + coalesce(v_prev.n, 0)), 6);
      v_move := CASE d.direction WHEN 'higher' THEN v_value - v_prev.value WHEN 'lower' THEN v_prev.value - v_value ELSE abs(v_value - v_prev.value) END;
      IF d.kind <> 'rate' THEN v_move := CASE WHEN v_prev.value = 0 THEN NULL ELSE v_move / abs(v_prev.value) END; END IF;
      IF v_share > v_prev_share AND v_move IS NOT NULL AND v_move > v_jump THEN
        v_fail := format('gamed: the excluded share grew from %s%% (%s) to %s%% while the value improved by %s (beyond the %s the definition tolerates, quality.gaming_jump): an improvement bought by exclusion is not shown',
                         round(100 * v_prev_share, 1), v_prev.period_key, round(100 * v_share, 1), round(v_move, 6), v_jump);
        v_reasons := v_reasons || to_jsonb(v_fail);
        v_checks := v_checks || jsonb_build_object('check', 'gamed', 'status', 'fail', 'detail', jsonb_build_object('test', 'exclusion_jump', 'previous_result', v_prev.result_id, 'previous_period', v_prev.period_key,
                                                                                                   'previous_share', v_prev_share, 'share', v_share, 'move', v_move, 'jump', v_jump));
      END IF;
    END IF;
    IF v_fail IS NULL THEN
      SELECT * INTO v_prior FROM analytics.metric_definitions x WHERE x.tenant_id = d.tenant_id AND x.domain_id = d.domain_id AND x.metric_key = d.metric_key AND x.version = d.version - 1;
      IF FOUND AND v_prior.threshold IS DISTINCT FROM d.threshold AND analytics.aco_breach(v_prior.threshold, v_prior.direction, v_value) IS TRUE
         AND analytics.aco_breach(d.threshold, d.direction, v_value) IS NOT TRUE THEN
        v_fail := format('gamed: the threshold changed with version %s (%s → %s) and that change alone moves this value (%s) from breach to pass: the review the old threshold opens is not avoided by re-drawing the line — a version re-approved without the change, or a recorded review, clears it',
                         d.version, v_prior.threshold, d.threshold, v_value);
        v_reasons := v_reasons || to_jsonb(v_fail);
        v_checks := v_checks || jsonb_build_object('check', 'gamed', 'status', 'fail', 'detail', jsonb_build_object('test', 'threshold_moved', 'prior_version', v_prior.version, 'prior_threshold', v_prior.threshold,
                                                                                                   'threshold', d.threshold, 'value', v_value));
      END IF;
    END IF;
    IF v_fail IS NULL THEN
      v_checks := v_checks || jsonb_build_object('check', 'gamed', 'status', 'pass', 'detail', jsonb_build_object('previous_result', CASE WHEN v_prev.result_id IS NULL THEN NULL ELSE v_prev.result_id END, 'jump', v_jump,
                                                                                                 'tests', jsonb_build_array('exclusion_jump', 'threshold_moved')));
    END IF;
  END IF;

  -- PRIVACY
  v_bad := '[]'::jsonb;
  IF EXISTS (SELECT 1 FROM jsonb_object_keys(v_cohort) k WHERE k = ANY (analytics.person_dimensions()) OR NOT (k = ANY (d.dimensions))) THEN
    v_bad := v_bad || to_jsonb(format('the cohort %s uses a key outside the definition''s dimensions or naming a person', v_cohort));
  END IF;
  IF d.privacy_class = 'pseudonymous_cohort' AND (d.k_min < 5 OR NOT EXISTS (SELECT 1 FROM analytics.purposes p WHERE p.tenant_id = d.tenant_id AND p.domain_id = d.domain_id AND p.purpose_key = d.purpose_key
                                                                                                                  AND p.purpose_kind = 'product_improvement')) THEN
    v_bad := v_bad || to_jsonb('a pseudonymous cohort metric needs k_min >= 5 under a product_improvement purpose'::text);
  END IF;
  v_k := coalesce(analytics.aco_num(p_draft -> 'distinct_actors'), analytics.aco_num(q -> 'distinct_actors'))::int;
  IF v_cohort ? 'role' AND v_k IS NULL THEN
    v_bad := v_bad || to_jsonb('a role cohort reports no distinct-principal count: k cannot be established'::text);
  ELSIF v_k IS NOT NULL AND v_k < d.k_min THEN
    v_bad := v_bad || to_jsonb(format('the cohort rests on %s distinct principals, below k = %s', v_k, d.k_min));
  END IF;
  v_purpose_known := EXISTS (SELECT 1 FROM analytics.purposes p WHERE p.tenant_id = d.tenant_id AND p.domain_id = d.domain_id AND p.purpose_key = d.purpose_key);
  v_purpose_ok := EXISTS (SELECT 1 FROM analytics.purposes p WHERE p.tenant_id = d.tenant_id AND p.domain_id = d.domain_id AND p.purpose_key = d.purpose_key
                            AND p.decided_at IS NOT NULL AND p.decided_at <= coalesce(v_as_of, clock_timestamp()) AND p.state IN ('approved', 'superseded', 'retired')
                            AND (p.retired_at IS NULL OR p.retired_at > coalesce(v_as_of, clock_timestamp())));
  IF v_purpose_known AND NOT v_purpose_ok THEN
    v_bad := v_bad || to_jsonb(format('the purpose %s is approved by no version at %s (rejected, retired or never approved): a measure beyond an approved purpose is not used', d.purpose_key, coalesce(v_as_of, clock_timestamp())));
  END IF;
  IF jsonb_array_length(v_bad) > 0 THEN
    v_reasons := v_reasons || to_jsonb('privacy: ' || (SELECT string_agg(x, '; ') FROM jsonb_array_elements_text(v_bad) x) || ' — routed to privacy review');
    v_checks := v_checks || jsonb_build_object('check', 'privacy', 'status', 'fail', 'detail', jsonb_build_object('findings', v_bad, 'privacy_class', d.privacy_class, 'k_min', d.k_min, 'purpose', d.purpose_key));
  ELSE
    v_checks := v_checks || jsonb_build_object('check', 'privacy', 'status', 'pass', 'detail', jsonb_build_object('privacy_class', d.privacy_class, 'k_min', d.k_min, 'purpose', d.purpose_key,
                                                                                                  'purpose_register', CASE WHEN v_purpose_known THEN 'approved at the as-of' ELSE 'not in the register (a planted definition; §MD''s port requires it)' END));
  END IF;

  -- OUTCOME-DETACHED
  v_bad := '[]'::jsonb;
  FOR v_obj IN SELECT x FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(d.serves -> 'objective_ids') = 'array' THEN d.serves -> 'objective_ids' ELSE '[]'::jsonb END) x LOOP
    IF v_obj !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       OR NOT EXISTS (SELECT 1 FROM graph.strategy_events e WHERE e.strategy_object_id = v_obj::uuid AND e.tenant_id = d.tenant_id AND e.domain_id = d.domain_id
                                                             AND e.event = 'strategy.declared' AND e.occurred_at <= coalesce(v_as_of, clock_timestamp())) THEN
      v_bad := v_bad || jsonb_build_object('objective', v_obj, 'status', 'absent');
    ELSE
      v_status := decision.strategy_status_as_of(v_obj::uuid, coalesce(v_as_of, clock_timestamp()));
      IF v_status <> 'active' THEN v_bad := v_bad || jsonb_build_object('objective', v_obj, 'status', v_status); END IF;
    END IF;
  END LOOP;
  IF jsonb_array_length(v_bad) > 0 THEN
    v_reasons := v_reasons || to_jsonb(format('outcome-detached: the objective(s) this measure serves are no longer live (%s): a measure detached from the outcome it serves is not presented as evidence of it',
                                              (SELECT string_agg((x ->> 'objective') || ' ' || (x ->> 'status'), ', ') FROM jsonb_array_elements(v_bad) x)));
    v_checks := v_checks || jsonb_build_object('check', 'outcome_detached', 'status', 'fail', 'detail', jsonb_build_object('objectives', v_bad));
  ELSIF coalesce(jsonb_array_length(CASE WHEN jsonb_typeof(d.serves -> 'objective_ids') = 'array' THEN d.serves -> 'objective_ids' END), 0) = 0
        AND coalesce(jsonb_array_length(CASE WHEN jsonb_typeof(d.serves -> 'decision_classes') = 'array' THEN d.serves -> 'decision_classes' END), 0) = 0
        AND coalesce(d.serves ->> 'value_measure', '') = '' THEN
    v_checks := v_checks || jsonb_build_object('check', 'outcome_detached', 'status', 'not_declared', 'detail', 'the definition names nothing it serves (§MD''s proposal port refuses that; a planted definition)');
  ELSE
    v_checks := v_checks || jsonb_build_object('check', 'outcome_detached', 'status', 'pass', 'detail', jsonb_build_object('serves', d.serves));
  END IF;

  RETURN jsonb_build_object('reasons', v_reasons, 'checks', v_checks, 'by', 'B92 co standing evaluation (0113 §CO.3)', 'evaluated_as_of', v_as_of,
                            'failed', (SELECT coalesce(jsonb_agg(c ->> 'check'), '[]'::jsonb) FROM jsonb_array_elements(v_checks) c WHERE c ->> 'status' = 'fail'));
END $$;
REVOKE ALL ON FUNCTION analytics.evaluate_result(jsonb) FROM PUBLIC;

-- §CO.4 HOOK 2 — AFTER THE RESULT ─────────────────────────────────────────────────────────────────────────────────────────────────────────
/* HOOK 2 — after a result is written (§CO re-declares it, copied whole): route a breached threshold as a REVIEW (analytics.metric, never an
   automatic decision), stop unsafe use, meter the computation's cost. Returns what it did.
   -- B92 co: (1) THE METER — one analytics.computation_costs row (a meter never fails the act it meters: an error is a WARNING and the
   row is missing, which the reconciliation then names unpriced/discrepant); (2) for an ORIGINAL, non-preview result: every failing check of
   the standing evaluation raises ONE item per (metric, scope, cohort, class) — `analytics.privacy` for privacy, `analytics.metric` for the
   others — subject the result that found it, the definition's owner named, origin `standing_evaluation` (an open one is not raised twice);
   a DETERMINATE result with no failing check CLOSES the open standing-evaluation items of the same (metric, scope, cohort) — THE RECOVERY;
   a determinate BREACH raises `analytics.metric` as a REVIEW (origin `threshold_breach`, the definition's action quoted — never an automatic
   or punitive decision; one per metric, period, scope and cohort while open). Stopping the unsafe USE is the result's own state: an
   indeterminate result is never cited unqualified (§MD's use port). A replay only meters. */
CREATE OR REPLACE FUNCTION analytics.after_result(p_result uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SET search_path = analytics, pg_catalog, pg_temp AS $$   -- B92 co (the prelude's body was the no-op `SELECT jsonb_build_object('routed', NULL, 'by', …)`)
DECLARE r analytics.metric_results%ROWTYPE; d analytics.metric_definitions%ROWTYPE; v_ms numeric; v_meter jsonb; v_routed jsonb := '[]'::jsonb; v_closed jsonb := '[]'::jsonb;
        v_fails jsonb; v_class text; v_reasons jsonb; v_open uuid; v_item jsonb; i record; v_ids jsonb; v_title text;
BEGIN
  SELECT * INTO r FROM analytics.metric_results x WHERE x.result_id = p_result;
  IF NOT FOUND THEN RETURN jsonb_build_object('by', 'B92 co', 'note', 'no such result'); END IF;
  SELECT * INTO d FROM analytics.metric_definitions x WHERE x.definition_id = r.definition_id;
  -- (1) the meter
  BEGIN
    v_ms := round(greatest(0, extract(epoch FROM (clock_timestamp() - statement_timestamp())) * 1000)::numeric, 3);
    INSERT INTO analytics.computation_costs (result_id, scope, tenant_id, domain_id, metric_key, definition_version, computation_key, computation_version, rows_read, compute_ms, replay, preview,
                                             cost_allocation, measured_by, computed_by_kind)
    VALUES (r.result_id, 'DOMAIN', r.tenant_id, r.domain_id, r.metric_key, r.definition_version, r.computation_key, r.computation_version, r.records_count, v_ms, r.replay_of IS NOT NULL, r.preview,
            coalesce(d.cost_allocation, '{}'::jsonb), 'B92 co after_result: records returned; database clock from the calling statement''s start', r.computed_by_kind);
    v_meter := jsonb_build_object('rows_read', r.records_count, 'compute_ms', v_ms);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'B92 co meter: computation % not metered: %', r.result_id, SQLERRM;
    v_meter := jsonb_build_object('error', SQLERRM);
  END;
  IF r.replay_of IS NOT NULL OR r.preview THEN
    RETURN jsonb_build_object('by', 'B92 co', 'metered', v_meter, 'routed', v_routed, 'closed', v_closed, 'note', CASE WHEN r.preview THEN 'a preview routes nothing' ELSE 'a replay routes nothing' END);
  END IF;
  v_fails := (SELECT coalesce(jsonb_agg(c), '[]'::jsonb) FROM jsonb_array_elements(coalesce(r.evaluation -> 'checks', '[]'::jsonb)) c WHERE c ->> 'status' = 'fail');
  -- (2a) the unsafe evaluation: one item per class while open
  FOREACH v_class IN ARRAY ARRAY['analytics.privacy', 'analytics.metric'] LOOP
    v_reasons := (SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM jsonb_array_elements_text(r.reasons) x
                   WHERE (v_class = 'analytics.privacy' AND x LIKE 'privacy:%')
                      OR (v_class = 'analytics.metric' AND (x LIKE 'stale:%' OR x LIKE 'incomplete:%' OR x LIKE 'biased:%' OR x LIKE 'non-comparable:%' OR x LIKE 'gamed:%' OR x LIKE 'outcome-detached:%')));
    IF jsonb_array_length(v_reasons) = 0 THEN CONTINUE; END IF;
    SELECT it.item_id INTO v_open FROM executive.attention_items it
     WHERE it.tenant_id = r.tenant_id AND it.domain_id = r.domain_id AND it.signal_class = v_class AND it.subject_kind = 'metric_result' AND it.state <> 'closed'
       AND it.details ->> 'origin' = 'standing_evaluation' AND it.details ->> 'metric_key' = r.metric_key AND (it.details ->> 'scope_key') IS NOT DISTINCT FROM r.scope_key
       AND it.details -> 'cohort' = r.cohort
     LIMIT 1;
    IF FOUND THEN
      v_routed := v_routed || jsonb_build_object('class', v_class, 'item_id', v_open, 'existing', true);
      CONTINUE;
    END IF;
    v_title := left(format('%s %s (%s%s): %s — the result is indeterminate; its use is stopped until reviewed', CASE WHEN v_class = 'analytics.privacy' THEN 'Privacy review —' ELSE 'Metric review —' END,
                           r.metric_key, r.period_key, CASE WHEN r.scope_key IS NULL THEN '' ELSE ', ' || r.scope_key END,
                           (SELECT string_agg(split_part(x, ':', 1), ', ') FROM jsonb_array_elements_text(v_reasons) x)), 500);
    v_item := executive.b33_raise_routed(r.tenant_id, r.domain_id, v_class, 'metric_result', r.result_id, v_title, v_reasons, d.owner_principal_id, r.result_id, 'analytics.result.indeterminate',
                jsonb_build_object('origin', 'standing_evaluation', 'metric_key', r.metric_key, 'definition_id', r.definition_id, 'definition_version', r.definition_version, 'period', r.period_key,
                                   'scope_key', r.scope_key, 'cohort', r.cohort, 'failed_checks', v_fails, 'result_id', r.result_id,
                                   'note', 'a review workflow: the owner (or the privacy officer) reviews the metric''s standing; nothing is decided automatically'),
                jsonb_build_object('consequence', 'C2'), p_actor, p_correlation);
    v_routed := v_routed || (v_item || jsonb_build_object('class', v_class, 'origin', 'standing_evaluation'));
  END LOOP;
  -- (2b) THE RECOVERY: a determinate result with no failing check closes the open standing-evaluation items of the same metric, scope and cohort
  IF r.state = 'determinate' AND jsonb_array_length(v_fails) = 0 THEN
    FOR i IN SELECT it.item_id, it.signal_class, it.subject_id FROM executive.attention_items it
              WHERE it.tenant_id = r.tenant_id AND it.domain_id = r.domain_id AND it.signal_class IN ('analytics.metric', 'analytics.privacy') AND it.subject_kind = 'metric_result'
                AND it.state <> 'closed' AND it.details ->> 'origin' = 'standing_evaluation' AND it.details ->> 'metric_key' = r.metric_key
                AND (it.details ->> 'scope_key') IS NOT DISTINCT FROM r.scope_key AND it.details -> 'cohort' = r.cohort
              ORDER BY it.created_at LOOP
      v_ids := executive.b33_close_items(r.tenant_id, r.domain_id, i.signal_class, 'metric_result', i.subject_id,
                 format('recovered: result %s (%s) of %s is determinate and passes the standing evaluation', r.result_id, r.period_key, r.metric_key), p_actor, p_correlation);
      v_closed := v_closed || v_ids;
    END LOOP;
  END IF;
  -- (2c) a determinate BREACH: a review, never an automatic decision
  IF r.state = 'determinate' AND (r.threshold_eval ->> 'breach') = 'true'
     AND analytics.exemption_for(r.tenant_id, r.domain_id, r.metric_key, r.period_key, r.scope_key, r.cohort) IS NOT NULL THEN   -- B92 integration (§I): an approved, unexpired threshold exemption
    v_routed := v_routed || jsonb_build_object('class', 'analytics.metric', 'origin', 'threshold_breach', 'exempted_by',
                  analytics.exemption_for(r.tenant_id, r.domain_id, r.metric_key, r.period_key, r.scope_key, r.cohort), 'note', 'the breach is not raised: an approved threshold exemption is in force (said, never hidden)');
  ELSIF r.state = 'determinate' AND (r.threshold_eval ->> 'breach') = 'true' THEN
    SELECT it.item_id INTO v_open FROM executive.attention_items it
     WHERE it.tenant_id = r.tenant_id AND it.domain_id = r.domain_id AND it.signal_class = 'analytics.metric' AND it.subject_kind = 'metric_result' AND it.state <> 'closed'
       AND it.details ->> 'origin' = 'threshold_breach' AND it.details ->> 'metric_key' = r.metric_key AND it.details ->> 'period' = r.period_key
       AND (it.details ->> 'scope_key') IS NOT DISTINCT FROM r.scope_key AND it.details -> 'cohort' = r.cohort
     LIMIT 1;
    IF FOUND THEN
      v_routed := v_routed || jsonb_build_object('class', 'analytics.metric', 'item_id', v_open, 'existing', true, 'origin', 'threshold_breach');
    ELSE
      v_item := executive.b33_raise_routed(r.tenant_id, r.domain_id, 'analytics.metric', 'metric_result', r.result_id,
                  left(format('Metric breach for review — %s (%s%s): %s against %s', r.metric_key, r.period_key, CASE WHEN r.scope_key IS NULL THEN '' ELSE ', ' || r.scope_key END, r.value, d.threshold), 500),
                  jsonb_build_array(format('the determinate value %s breaches the approved threshold %s', r.value, d.threshold), format('the definition''s action: %s', d.action),
                                    'a review workflow for the named owner — never an automatic or punitive decision'),
                  d.owner_principal_id, r.result_id, 'analytics.result.breach',
                  jsonb_build_object('origin', 'threshold_breach', 'metric_key', r.metric_key, 'definition_id', r.definition_id, 'definition_version', r.definition_version, 'period', r.period_key,
                                     'scope_key', r.scope_key, 'cohort', r.cohort, 'value', r.value, 'threshold', d.threshold, 'action', d.action, 'result_id', r.result_id),
                  jsonb_build_object('consequence', 'C2'), p_actor, p_correlation);
      v_routed := v_routed || (v_item || jsonb_build_object('class', 'analytics.metric', 'origin', 'threshold_breach'));
    END IF;
  END IF;
  RETURN jsonb_build_object('by', 'B92 co', 'metered', v_meter, 'routed', v_routed, 'closed', v_closed);
END $$;
REVOKE ALL ON FUNCTION analytics.after_result(uuid, uuid, uuid) FROM PUBLIC;

-- §CO.5 THE COHORT COMPARISON ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* COMPARE (analytics.comparison.run — an analyst, the owner, or the attention agent: AI may compute). Two ORIGINAL, non-preview results of one
   metric (two cohorts, two periods, or two scopes); each side may name a CERTIFIED cohort object (DP-44-001) whose criteria must be the side's
   cohort — its version, digest and certification are recorded. COMPARABLE when: both determinate (n ≥ floor and k held by the compute port);
   the two definition versions' SEMANTIC projections are equal (analytics.aco_semantic — the rule stated); the computation digests are equal;
   the clocks and the period kinds are equal. A rate is compared by Newcombe's interval of the difference (a claim only when it excludes 0); a
   duration by the two medians with their order-statistic intervals (a claim only when they do not overlap; none when one is unbounded); a
   ratio, count or score has no interval method here → indeterminate, said. The composition of both sides by every declared dimension (from the
   records) is stated beside the difference. Long reads happen inside this one port (it locks nothing it reads). */
CREATE OR REPLACE FUNCTION analytics.compare_results(p_comparison uuid, p_tenant uuid, p_domain uuid, p_result_a uuid, p_result_b uuid, p_cohort_object_a uuid, p_cohort_object_b uuid,
                                                     p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = analytics, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE a analytics.metric_results%ROWTYPE; b analytics.metric_results%ROWTYPE; da analytics.metric_definitions%ROWTYPE; db analytics.metric_definitions%ROWTYPE;
        v_reasons jsonb := '[]'::jsonb; v_cmp jsonb := '{}'::jsonb; v_state text; v_est numeric := NULL; v_int jsonb := NULL; v_method text := NULL; v_claim text; v_co_a jsonb := NULL; v_co_b jsonb := NULL;
        v_comp jsonb := '{}'::jsonb; v_dim text; v_sides jsonb; v_row jsonb; ua jsonb; ub jsonb; v_kind_ok boolean := true; v_obj uuid; v_side text; v_res analytics.metric_results%ROWTYPE; v_co jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['analytics.comparison.run']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS NULL OR p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'cohort comparison rejected (actor): a comparison is recorded under the acting principal' USING ERRCODE = '42501'; END IF;
  IF p_result_a IS NULL OR p_result_b IS NULL OR p_result_a = p_result_b THEN RAISE EXCEPTION 'cohort comparison rejected (request): a comparison names two different results' USING ERRCODE = '22023'; END IF;
  SELECT * INTO a FROM analytics.metric_results x WHERE x.result_id = p_result_a AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'cohort comparison rejected (unknown_result): % is not a result of this domain', p_result_a USING ERRCODE = '23503'; END IF;
  SELECT * INTO b FROM analytics.metric_results x WHERE x.result_id = p_result_b AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'cohort comparison rejected (unknown_result): % is not a result of this domain', p_result_b USING ERRCODE = '23503'; END IF;
  IF a.metric_key <> b.metric_key THEN RAISE EXCEPTION 'cohort comparison rejected (metric): % and % are results of two metrics (% and %); a comparison is within one metric', p_result_a, p_result_b, a.metric_key, b.metric_key USING ERRCODE = '22023'; END IF;
  IF a.preview OR b.preview THEN RAISE EXCEPTION 'cohort comparison rejected (state): a PREVIEW result (computed on a proposed definition) is never compared as current' USING ERRCODE = '22023'; END IF;
  IF a.replay_of IS NOT NULL OR b.replay_of IS NOT NULL THEN RAISE EXCEPTION 'cohort comparison rejected (state): a replay is compared through its original result' USING ERRCODE = '22023'; END IF;
  SELECT * INTO da FROM analytics.metric_definitions x WHERE x.definition_id = a.definition_id;
  SELECT * INTO db FROM analytics.metric_definitions x WHERE x.definition_id = b.definition_id;
  -- the named cohort objects (DP-44-001): certified, unexpired, a cohort, its criteria the side's cohort
  FOREACH v_side IN ARRAY ARRAY['a', 'b'] LOOP
    v_obj := CASE v_side WHEN 'a' THEN p_cohort_object_a ELSE p_cohort_object_b END;
    v_res := CASE v_side WHEN 'a' THEN a ELSE b END;
    IF v_obj IS NULL THEN CONTINUE; END IF;
    SELECT jsonb_build_object('object_id', o.object_id, 'object_key', o.object_key, 'kind', o.kind, 'state', o.state, 'version', o.certified_version, 'digest', v.digest, 'criteria', v.definition -> 'criteria',
                              'metric_keys', v.definition -> 'metric_keys', 'certification_id', c.certification_id, 'expires_at', c.expires_at, 'cert_state', c.state)
      INTO v_co FROM products.semantic_objects o
      LEFT JOIN products.semantic_object_versions v ON v.object_id = o.object_id AND v.version = coalesce(o.certified_version, o.current_version)
      LEFT JOIN LATERAL (SELECT * FROM products.semantic_object_certifications c WHERE c.object_id = o.object_id AND c.state = 'active' ORDER BY c.certified_at DESC LIMIT 1) c ON true
     WHERE o.object_id = v_obj AND o.tenant_id = p_tenant AND o.domain_id = p_domain;
    IF v_co IS NULL THEN RAISE EXCEPTION 'cohort comparison rejected (unknown_semantic_object): % is not a semantic object of this domain', v_obj USING ERRCODE = '23503'; END IF;
    IF v_co ->> 'kind' <> 'cohort' THEN RAISE EXCEPTION 'cohort comparison rejected (cohort): % is a % object; a comparison names a COHORT object', v_co ->> 'object_key', v_co ->> 'kind' USING ERRCODE = '22023'; END IF;
    IF v_co ->> 'state' <> 'certified' OR v_co ->> 'certification_id' IS NULL THEN
      RAISE EXCEPTION 'cohort comparison rejected (state): cohort % is % — only a CERTIFIED cohort object is a governed cohort definition', v_co ->> 'object_key', v_co ->> 'state' USING ERRCODE = '22023';
    END IF;
    IF (v_co ->> 'expires_at')::timestamptz <= clock_timestamp() THEN
      RAISE EXCEPTION 'cohort comparison rejected (state): the certification of cohort % expired at % — re-certified by its owner before use', v_co ->> 'object_key', v_co ->> 'expires_at' USING ERRCODE = '22023';
    END IF;
    IF NOT ((v_co -> 'metric_keys') ? v_res.metric_key) THEN
      RAISE EXCEPTION 'cohort comparison rejected (cohort): cohort % is declared for % — not for %', v_co ->> 'object_key', v_co -> 'metric_keys', v_res.metric_key USING ERRCODE = '22023';
    END IF;
    IF (v_co -> 'criteria') IS DISTINCT FROM v_res.cohort THEN
      RAISE EXCEPTION 'cohort comparison rejected (cohort): side % was computed on the cohort %, which is not cohort % (%)', v_side, v_res.cohort, v_co ->> 'object_key', v_co -> 'criteria' USING ERRCODE = '22023';
    END IF;
    IF v_side = 'a' THEN v_co_a := v_co; ELSE v_co_b := v_co; END IF;
  END LOOP;

  -- COMPARABILITY
  IF a.state <> 'determinate' THEN v_reasons := v_reasons || to_jsonb(format('side a (%s, %s) is %s: %s', a.period_key, a.cohort, a.state, a.reasons)); END IF;
  IF b.state <> 'determinate' THEN v_reasons := v_reasons || to_jsonb(format('side b (%s, %s) is %s: %s', b.period_key, b.cohort, b.state, b.reasons)); END IF;
  IF a.n IS NOT NULL AND a.n < da.floor_n THEN v_reasons := v_reasons || to_jsonb(format('side a: n = %s is below the floor %s', a.n, da.floor_n)); END IF;
  IF b.n IS NOT NULL AND b.n < db.floor_n THEN v_reasons := v_reasons || to_jsonb(format('side b: n = %s is below the floor %s', b.n, db.floor_n)); END IF;
  IF a.definition_version <> b.definition_version AND analytics.aco_semantic(da) IS DISTINCT FROM analytics.aco_semantic(db) THEN
    v_reasons := v_reasons || to_jsonb(format('non-comparable: definition versions %s and %s differ in what decides the value (%s)', a.definition_version, b.definition_version,
      (SELECT string_agg(k, ', ' ORDER BY k) FROM jsonb_object_keys(analytics.aco_semantic(da)) k WHERE analytics.aco_semantic(da) -> k IS DISTINCT FROM analytics.aco_semantic(db) -> k)));
  END IF;
  IF a.computation_digest IS DISTINCT FROM b.computation_digest THEN
    v_reasons := v_reasons || to_jsonb(format('non-comparable: the two results ran different computation bodies (%s v%s, %s v%s)', a.computation_key, a.computation_version, b.computation_key, b.computation_version));
  END IF;
  IF a.clock <> b.clock THEN v_reasons := v_reasons || to_jsonb(format('non-comparable: the clocks differ (%s vs %s)', a.clock, b.clock)); END IF;
  IF a.period_kind <> b.period_kind THEN v_reasons := v_reasons || to_jsonb(format('non-comparable: the windows are of different kinds (%s vs %s)', a.period_kind, b.period_kind)); END IF;
  IF a.kind NOT IN ('rate', 'duration') THEN
    v_kind_ok := false;
    v_reasons := v_reasons || to_jsonb(format('no interval method for a %s metric: a difference without its uncertainty is not shown', a.kind));
  END IF;
  v_cmp := jsonb_build_object('rule', 'comparable when both results are determinate original non-preview results, their definitions'' semantic projections are equal (kind, unit, direction, population, numerator, denominator, exclusions, window, dimensions, privacy class, k, floor, computation and params; title, wording, owner, cadence, action, retirement, serves, threshold, quality and cost allocation are non-semantic), the computation bodies are equal and the clocks and window kinds agree',
                              'definition_versions', jsonb_build_array(a.definition_version, b.definition_version), 'same_semantics', analytics.aco_semantic(da) IS NOT DISTINCT FROM analytics.aco_semantic(db),
                              'computation_digests', jsonb_build_array(a.computation_digest, b.computation_digest));

  -- COMPOSITION (stated beside the difference): what differs between the sides, and both populations by every declared dimension
  v_comp := jsonb_build_object('differs', (SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM (VALUES ('period', a.period_key IS DISTINCT FROM b.period_key), ('cohort', a.cohort IS DISTINCT FROM b.cohort),
                                                                                                ('scope', a.scope_key IS DISTINCT FROM b.scope_key OR a.scope_version IS DISTINCT FROM b.scope_version)) z(x, f) WHERE f),
                               'n', jsonb_build_object('a', a.n, 'b', b.n), 'excluded', jsonb_build_object(
                                  'a', (SELECT count(*) FROM analytics.result_records rr WHERE rr.result_id = a.result_id AND rr.role = 'excluded'),
                                  'b', (SELECT count(*) FROM analytics.result_records rr WHERE rr.result_id = b.result_id AND rr.role = 'excluded')));
  FOREACH v_dim IN ARRAY da.dimensions LOOP
    v_comp := jsonb_set(v_comp, ARRAY['by_' || v_dim], jsonb_build_object(
      'a', (SELECT coalesce(jsonb_object_agg(k, c), '{}'::jsonb) FROM (SELECT coalesce(rr.detail ->> v_dim, '(none)') k, count(*) c FROM analytics.result_records rr
                                                                       WHERE rr.result_id = a.result_id AND rr.role IN ('numerator', 'denominator', 'included') GROUP BY 1) z),
      'b', (SELECT coalesce(jsonb_object_agg(k, c), '{}'::jsonb) FROM (SELECT coalesce(rr.detail ->> v_dim, '(none)') k, count(*) c FROM analytics.result_records rr
                                                                       WHERE rr.result_id = b.result_id AND rr.role IN ('numerator', 'denominator', 'included') GROUP BY 1) z)));
  END LOOP;

  v_sides := jsonb_build_object(
    'a', jsonb_build_object('result_id', a.result_id, 'period', a.period_key, 'scope_key', a.scope_key, 'scope_version', a.scope_version, 'cohort', a.cohort, 'state', a.state, 'value', a.value, 'n', a.n,
                            'numerator', a.numerator, 'denominator', a.denominator, 'uncertainty', a.uncertainty, 'definition_version', a.definition_version, 'source_revision', a.source_revision, 'cohort_object', v_co_a),
    'b', jsonb_build_object('result_id', b.result_id, 'period', b.period_key, 'scope_key', b.scope_key, 'scope_version', b.scope_version, 'cohort', b.cohort, 'state', b.state, 'value', b.value, 'n', b.n,
                            'numerator', b.numerator, 'denominator', b.denominator, 'uncertainty', b.uncertainty, 'definition_version', b.definition_version, 'source_revision', b.source_revision, 'cohort_object', v_co_b));

  IF jsonb_array_length(v_reasons) = 0 AND v_kind_ok THEN
    v_state := 'determinate';
    IF a.kind = 'rate' THEN
      ua := analytics.aco_newcombe(a.numerator, a.denominator, b.numerator, b.denominator);
      v_est := (ua ->> 'estimate')::numeric; v_int := ua; v_method := 'newcombe_hybrid_score';
      v_claim := CASE WHEN (ua ->> 'lo')::numeric > 0 THEN format('a is higher than b by %s (95%% interval %s to %s)', ua ->> 'estimate', ua ->> 'lo', ua ->> 'hi')
                      WHEN (ua ->> 'hi')::numeric < 0 THEN format('a is lower than b by %s (95%% interval %s to %s)', abs((ua ->> 'estimate')::numeric), ua ->> 'lo', ua ->> 'hi')
                      ELSE format('no difference shown: the 95%% interval of the difference (%s to %s) contains 0', ua ->> 'lo', ua ->> 'hi') END;
    ELSE
      ua := a.uncertainty; ub := b.uncertainty;
      v_est := round(a.value - b.value, 6); v_method := 'medians_with_order_statistic_intervals';
      v_int := jsonb_build_object('method', v_method, 'level', 0.95, 'a', jsonb_build_object('median', a.value, 'lo', ua -> 'lo', 'hi', ua -> 'hi', 'n', a.n),
                                  'b', jsonb_build_object('median', b.value, 'lo', ub -> 'lo', 'hi', ub -> 'hi', 'n', b.n));
      v_claim := CASE WHEN (ua ->> 'lo') IS NULL OR (ub ->> 'lo') IS NULL THEN 'no claim: the interval of a median is unbounded below n = 6 — the medians are shown, no difference is claimed'
                      WHEN (ua ->> 'lo')::numeric > (ub ->> 'hi')::numeric THEN format('a''s median (%s) is higher than b''s (%s): the intervals do not overlap', a.value, b.value)
                      WHEN (ua ->> 'hi')::numeric < (ub ->> 'lo')::numeric THEN format('a''s median (%s) is lower than b''s (%s): the intervals do not overlap', a.value, b.value)
                      ELSE format('no claim: the medians'' intervals overlap ([%s, %s] and [%s, %s])', ua ->> 'lo', ua ->> 'hi', ub ->> 'lo', ub ->> 'hi') END;
    END IF;
  ELSE
    v_state := 'indeterminate';
    v_claim := 'indeterminate: no difference is shown — ' || (SELECT string_agg(x, '; ') FROM jsonb_array_elements_text(v_reasons) x);
  END IF;

  v_row := jsonb_build_object('metric_key', a.metric_key, 'kind', a.kind, 'state', v_state, 'estimate', v_est, 'interval', v_int, 'method', v_method, 'claim', v_claim, 'sides', v_sides,
                              'composition', v_comp, 'comparability', v_cmp, 'reasons', v_reasons);
  INSERT INTO analytics.comparisons (comparison_id, scope, tenant_id, domain_id, metric_key, result_a, result_b, cohort_object_a, cohort_object_b, kind, state, estimate, interval, method, claim,
                                     sides, composition, comparability, reasons, digest, run_by, run_by_kind, correlation_id)
  VALUES (p_comparison, 'DOMAIN', p_tenant, p_domain, a.metric_key, a.result_id, b.result_id, v_co_a, v_co_b, a.kind, v_state, v_est, v_int, v_method, v_claim, v_sides, v_comp, v_cmp, v_reasons,
          analytics.digest(v_row), p_actor, coalesce((SELECT p.kind FROM identity.principals p WHERE p.id = p_actor), 'system'), p_correlation);
  INSERT INTO analytics.definition_events (event_id, scope, tenant_id, domain_id, subject_kind, subject_id, subject_key, version, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, 'comparison', p_comparison, a.metric_key, a.definition_version, 'comparison.run', p_actor,
          jsonb_build_object('state', v_state, 'result_a', a.result_id, 'result_b', b.result_id, 'cohort_objects', jsonb_build_array(v_co_a -> 'object_id', v_co_b -> 'object_id'), 'claim', v_claim), p_correlation);
  RETURN (SELECT to_jsonb(x) FROM analytics.comparisons x WHERE x.comparison_id = p_comparison);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION analytics.compare_results(uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION analytics.compare_results(uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid) TO eye_commit;

/* The comparisons of the domain (newest first; a metric key narrows) and one comparison — INVOKER, under the caller's RLS. */
CREATE OR REPLACE FUNCTION analytics.comparison_list(p_metric_key text, p_limit int) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = analytics, pg_catalog, pg_temp AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(c) - 'tenant_id' - 'domain_id' - 'scope' ORDER BY c.run_at DESC), '[]'::jsonb)
    FROM (SELECT * FROM analytics.comparisons x WHERE p_metric_key IS NULL OR x.metric_key = p_metric_key ORDER BY x.run_at DESC LIMIT greatest(1, least(coalesce(p_limit, 50), 500))) c
$$;
CREATE OR REPLACE FUNCTION analytics.comparison_read(p_comparison uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = analytics, pg_catalog, pg_temp AS $$
  SELECT to_jsonb(c) - 'tenant_id' - 'domain_id' - 'scope' FROM analytics.comparisons c WHERE c.comparison_id = p_comparison
$$;
GRANT EXECUTE ON FUNCTION analytics.comparison_list(text, int), analytics.comparison_read(uuid) TO eye_app, eye_commit;

-- §CO.6 DP-44-001 — THE GOVERNED SEMANTIC OBJECTS ──────────────────────────────────────────────────────────────────────────────────────────
/* An endpoint a relationship or a model names exists in the domain: a product metric (analytics.metric_definitions, any version not
   rejected), a B90 semantic model (products.semantic_models), another semantic object. */
CREATE OR REPLACE FUNCTION products.sob_endpoint_exists(p_tenant uuid, p_domain uuid, p_ref jsonb) RETURNS boolean
LANGUAGE sql STABLE SET search_path = products, analytics, pg_catalog, pg_temp AS $$
  SELECT CASE p_ref ->> 'kind'
    WHEN 'metric' THEN EXISTS (SELECT 1 FROM analytics.metric_definitions d WHERE d.tenant_id = p_tenant AND d.domain_id = p_domain AND d.metric_key = p_ref ->> 'key' AND d.state <> 'rejected')
    WHEN 'semantic_model' THEN EXISTS (SELECT 1 FROM products.semantic_models m WHERE m.tenant_id = p_tenant AND m.domain_id = p_domain AND m.metric_key = p_ref ->> 'key')
    WHEN 'semantic_object' THEN EXISTS (SELECT 1 FROM products.semantic_objects o WHERE o.tenant_id = p_tenant AND o.domain_id = p_domain AND o.object_key = p_ref ->> 'key')
    ELSE false END
$$;
/* THE DEFINITION RULES per kind (raises the refusal; answers the normalised definition):
     cohort            {criteria: {dimension: scalar} (≥ 1, never a person), metric_keys: [≥ 1 metric of the domain whose latest live version declares
                       every criteria dimension], rationale (8+)}
     relationship      {from: {kind, key}, to: {kind, key} (metric | semantic_model | semantic_object, existing, different), relation (leads | lags |
                       explains | decomposes_into | constrains | correlates_with | same_population), rationale (8+)}
     analytical_model  {method (decomposition | regression | index | ratio | composite | threshold_rule), inputs: [≥ 1 {kind, key}, existing],
                       output (8+), assumptions: [≥ 1 text], validity (8+)} */
CREATE OR REPLACE FUNCTION products.sob_validate(p_tenant uuid, p_domain uuid, p_kind text, p_def jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = products, analytics, pg_catalog, pg_temp AS $$
DECLARE k text; m text; v_dims text[]; r jsonb;
BEGIN
  IF p_def IS NULL OR jsonb_typeof(p_def) <> 'object' THEN RAISE EXCEPTION 'semantic object rejected (definition): a definition is an object' USING ERRCODE = '22023'; END IF;
  IF p_kind = 'cohort' THEN
    IF jsonb_typeof(p_def -> 'criteria') IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(p_def -> 'criteria')) = 0 THEN
      RAISE EXCEPTION 'semantic object rejected (definition): a cohort declares criteria {dimension: value} (one at least)' USING ERRCODE = '22023';
    END IF;
    FOR k IN SELECT x FROM jsonb_object_keys(p_def -> 'criteria') x LOOP
      IF k = ANY (analytics.person_dimensions()) THEN
        RAISE EXCEPTION 'semantic object rejected (person): a cohort is never a person-grained group (%): no employee-performance inference', k USING ERRCODE = '42501';
      END IF;
      IF jsonb_typeof(p_def -> 'criteria' -> k) NOT IN ('string', 'number', 'boolean') THEN RAISE EXCEPTION 'semantic object rejected (definition): criterion % is a scalar value', k USING ERRCODE = '22023'; END IF;
    END LOOP;
    IF jsonb_typeof(p_def -> 'metric_keys') IS DISTINCT FROM 'array' OR jsonb_array_length(p_def -> 'metric_keys') = 0 THEN
      RAISE EXCEPTION 'semantic object rejected (definition): a cohort names the metric(s) it groups (metric_keys)' USING ERRCODE = '22023';
    END IF;
    FOR m IN SELECT x FROM jsonb_array_elements_text(p_def -> 'metric_keys') x LOOP
      SELECT d.dimensions INTO v_dims FROM analytics.metric_definitions d WHERE d.tenant_id = p_tenant AND d.domain_id = p_domain AND d.metric_key = m AND d.state IN ('approved', 'proposed', 'superseded')
       ORDER BY (d.state = 'approved') DESC, d.version DESC LIMIT 1;
      IF NOT FOUND THEN RAISE EXCEPTION 'semantic object rejected (unknown_metric): % is no metric of this domain', m USING ERRCODE = '23503'; END IF;
      FOR k IN SELECT x FROM jsonb_object_keys(p_def -> 'criteria') x LOOP
        IF NOT (k = ANY (v_dims)) THEN RAISE EXCEPTION 'semantic object rejected (dimension): % does not declare the dimension % (its dimensions: %)', m, k, array_to_string(v_dims, ', ') USING ERRCODE = '22023'; END IF;
      END LOOP;
    END LOOP;
    IF length(btrim(coalesce(p_def ->> 'rationale', ''))) < 8 THEN RAISE EXCEPTION 'semantic object rejected (definition): a cohort states its rationale (8+ characters)' USING ERRCODE = '22023'; END IF;
    RETURN jsonb_build_object('criteria', p_def -> 'criteria', 'metric_keys', (SELECT jsonb_agg(DISTINCT x ORDER BY x) FROM jsonb_array_elements_text(p_def -> 'metric_keys') x), 'rationale', btrim(p_def ->> 'rationale'));
  ELSIF p_kind = 'relationship' THEN
    IF NOT (coalesce(p_def ->> 'relation', '') = ANY (ARRAY['leads', 'lags', 'explains', 'decomposes_into', 'constrains', 'correlates_with', 'same_population'])) THEN
      RAISE EXCEPTION 'semantic object rejected (definition): a relationship''s relation is leads, lags, explains, decomposes_into, constrains, correlates_with or same_population' USING ERRCODE = '22023';
    END IF;
    FOREACH k IN ARRAY ARRAY['from', 'to'] LOOP
      r := p_def -> k;
      IF jsonb_typeof(r) IS DISTINCT FROM 'object' OR NOT (coalesce(r ->> 'kind', '') = ANY (ARRAY['metric', 'semantic_model', 'semantic_object'])) OR coalesce(r ->> 'key', '') = '' THEN
        RAISE EXCEPTION 'semantic object rejected (definition): a relationship''s % is {kind: metric | semantic_model | semantic_object, key}', k USING ERRCODE = '22023';
      END IF;
      IF NOT products.sob_endpoint_exists(p_tenant, p_domain, r) THEN RAISE EXCEPTION 'semantic object rejected (unknown_reference): % % is not in this domain', r ->> 'kind', r ->> 'key' USING ERRCODE = '23503'; END IF;
    END LOOP;
    IF p_def -> 'from' = p_def -> 'to' THEN RAISE EXCEPTION 'semantic object rejected (definition): a relationship joins two different objects' USING ERRCODE = '22023'; END IF;
    IF length(btrim(coalesce(p_def ->> 'rationale', ''))) < 8 THEN RAISE EXCEPTION 'semantic object rejected (definition): a relationship states its rationale (8+ characters)' USING ERRCODE = '22023'; END IF;
    RETURN jsonb_build_object('from', jsonb_build_object('kind', p_def -> 'from' ->> 'kind', 'key', p_def -> 'from' ->> 'key'), 'to', jsonb_build_object('kind', p_def -> 'to' ->> 'kind', 'key', p_def -> 'to' ->> 'key'),
                              'relation', p_def ->> 'relation', 'rationale', btrim(p_def ->> 'rationale'));
  ELSIF p_kind = 'analytical_model' THEN
    IF NOT (coalesce(p_def ->> 'method', '') = ANY (ARRAY['decomposition', 'regression', 'index', 'ratio', 'composite', 'threshold_rule'])) THEN
      RAISE EXCEPTION 'semantic object rejected (definition): a model''s method is decomposition, regression, index, ratio, composite or threshold_rule' USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(p_def -> 'inputs') IS DISTINCT FROM 'array' OR jsonb_array_length(p_def -> 'inputs') = 0 THEN RAISE EXCEPTION 'semantic object rejected (definition): a model names its inputs' USING ERRCODE = '22023'; END IF;
    FOR r IN SELECT x FROM jsonb_array_elements(p_def -> 'inputs') x LOOP
      IF jsonb_typeof(r) IS DISTINCT FROM 'object' OR NOT (coalesce(r ->> 'kind', '') = ANY (ARRAY['metric', 'semantic_model', 'semantic_object'])) OR coalesce(r ->> 'key', '') = '' THEN
        RAISE EXCEPTION 'semantic object rejected (definition): an input is {kind: metric | semantic_model | semantic_object, key}' USING ERRCODE = '22023';
      END IF;
      IF NOT products.sob_endpoint_exists(p_tenant, p_domain, r) THEN RAISE EXCEPTION 'semantic object rejected (unknown_reference): % % is not in this domain', r ->> 'kind', r ->> 'key' USING ERRCODE = '23503'; END IF;
    END LOOP;
    IF length(btrim(coalesce(p_def ->> 'output', ''))) < 8 OR length(btrim(coalesce(p_def ->> 'validity', ''))) < 8 THEN
      RAISE EXCEPTION 'semantic object rejected (definition): a model states its output and its validity (8+ characters each)' USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(p_def -> 'assumptions') IS DISTINCT FROM 'array' OR jsonb_array_length(p_def -> 'assumptions') = 0 THEN
      RAISE EXCEPTION 'semantic object rejected (definition): a model states its assumptions (one at least)' USING ERRCODE = '22023';
    END IF;
    RETURN jsonb_build_object('method', p_def ->> 'method', 'inputs', (SELECT jsonb_agg(jsonb_build_object('kind', x ->> 'kind', 'key', x ->> 'key')) FROM jsonb_array_elements(p_def -> 'inputs') x),
                              'output', btrim(p_def ->> 'output'), 'assumptions', p_def -> 'assumptions', 'validity', btrim(p_def ->> 'validity'));
  END IF;
  RAISE EXCEPTION 'semantic object rejected (kind): % is not a kind (cohort, relationship, analytical_model)', coalesce(p_kind, 'null') USING ERRCODE = '22023';
END $$;
/* THE WITHDRAWAL STEP (private, the 0095 metric_withdraw idiom): the active certification → withdrawn | expired with the reason; the object's
   standing follows (its last valid version frozen readable); the COMPARISONS that named the object are LISTED in the answer and the event. */
CREATE OR REPLACE FUNCTION products.sob_withdraw(p_object_id uuid, p_state text, p_reason text, p_detail jsonb, p_actor uuid, p_correlation uuid) RETURNS jsonb
SET search_path = products, analytics, pg_catalog, pg_temp AS $$
DECLARE o products.semantic_objects%ROWTYPE; c products.semantic_object_certifications%ROWTYPE; v_uses jsonb;
BEGIN
  SELECT * INTO o FROM products.semantic_objects x WHERE x.object_id = p_object_id FOR UPDATE;
  SELECT * INTO c FROM products.semantic_object_certifications x WHERE x.object_id = p_object_id AND x.state = 'active' ORDER BY x.certified_at DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('comparison_id', x.comparison_id, 'metric_key', x.metric_key, 'state', x.state, 'run_at', x.run_at, 'claim', x.claim) ORDER BY x.run_at), '[]'::jsonb)
    INTO v_uses FROM analytics.comparisons x
   WHERE x.tenant_id = o.tenant_id AND x.domain_id = o.domain_id AND ((x.cohort_object_a ->> 'object_id')::uuid = p_object_id OR (x.cohort_object_b ->> 'object_id')::uuid = p_object_id);
  UPDATE products.semantic_object_certifications SET state = p_state, withdrawn_at = clock_timestamp(), withdrawn_by = p_actor, withdrawal_reason = btrim(p_reason) WHERE certification_id = c.certification_id;
  UPDATE products.semantic_objects SET state = p_state, certified_version = NULL, last_valid_version = c.version, updated_at = clock_timestamp() WHERE object_id = p_object_id;
  INSERT INTO analytics.definition_events (event_id, scope, tenant_id, domain_id, subject_kind, subject_id, subject_key, version, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', o.tenant_id, o.domain_id, 'semantic_object', p_object_id, o.object_key, c.version, 'semantic_object.certification_' || p_state, p_actor,
          jsonb_build_object('certification_id', c.certification_id, 'version', c.version, 'reason', btrim(p_reason), 'detail', coalesce(p_detail, '{}'::jsonb), 'uses_exposed', v_uses), p_correlation);
  RETURN jsonb_build_object('certification_id', c.certification_id, 'version', c.version, 'state', p_state, 'reason', btrim(p_reason), 'uses_exposed', v_uses,
                            'consequence', 'the last valid version ' || c.version || ' is frozen and stays readable; no comparison names the object as a governed cohort until its owner re-certifies');
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION products.sob_endpoint_exists(uuid, uuid, jsonb), products.sob_validate(uuid, uuid, text, jsonb), products.sob_withdraw(uuid, text, text, jsonb, uuid, uuid) FROM PUBLIC;

/* DECLARE (products.semantic.declare): a DATA STEWARD or a PRODUCT ANALYST (a named human) declares a cohort, a relationship or an analytical
   model — or re-declares it as the next VERSION — with its owner (a named human holding product_analytics_owner in the domain). A
   re-declaration that changes a CERTIFIED object withdraws its certification (reason definition_changed; the comparisons that named it
   exposed). An unchanged definition is refused (duplicate). */
CREATE OR REPLACE FUNCTION products.semantic_declare(p_object_id uuid, p_tenant uuid, p_domain uuid, p_key text, p_kind text, p_title text, p_definition jsonb, p_owner uuid,
                                                     p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = products, analytics, executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE o products.semantic_objects%ROWTYPE; pv products.semantic_object_versions%ROWTYPE; v_def jsonb; v_digest text; v_version int; v_withdrawal jsonb := NULL; v_changed jsonb := NULL;
BEGIN
  PERFORM observation.assert_authority(ARRAY['products.semantic.declare']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS NULL OR p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'semantic object rejected (actor): declared by the acting principal' USING ERRCODE = '42501'; END IF;
  IF NOT decision.is_active_human(p_actor, p_tenant) THEN RAISE EXCEPTION 'semantic object rejected (actor): a semantic object is declared by a named human (an agent proposes findings, never semantics)' USING ERRCODE = '42501'; END IF;
  IF NOT executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['data_steward', 'product_analyst']) THEN
    RAISE EXCEPTION 'semantic object rejected (authority): a semantic object is declared by a data steward or a product analyst' USING ERRCODE = '42501';
  END IF;
  IF p_key IS NULL OR p_key !~ '^[a-z][a-z0-9_.-]{2,62}$' THEN RAISE EXCEPTION 'semantic object rejected (request): a key is lower-case, 3–63 characters' USING ERRCODE = '22023'; END IF;
  IF p_title IS NULL OR length(btrim(p_title)) NOT BETWEEN 4 AND 200 THEN RAISE EXCEPTION 'semantic object rejected (title): a title is 4–200 characters' USING ERRCODE = '22023'; END IF;
  IF p_owner IS NULL OR NOT decision.is_active_human(p_owner, p_tenant) OR NOT executive.holds_role(p_owner, p_tenant, p_domain, ARRAY['product_analytics_owner']) THEN
    RAISE EXCEPTION 'semantic object rejected (owner): the owner is a named human holding product_analytics_owner in this domain (the certifier)' USING ERRCODE = '22023';
  END IF;
  v_def := products.sob_validate(p_tenant, p_domain, p_kind, p_definition);
  v_digest := analytics.digest(jsonb_build_object('key', p_key, 'kind', p_kind, 'title', btrim(p_title), 'owner', p_owner, 'definition', v_def));
  SELECT * INTO o FROM products.semantic_objects x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.object_key = p_key FOR UPDATE;
  IF FOUND AND o.object_id <> p_object_id THEN
    RAISE EXCEPTION 'semantic object rejected (duplicate): the key % names the object % of this domain; re-declare it by its id', p_key, o.object_id USING ERRCODE = '22023';
  END IF;
  IF NOT FOUND THEN
    SELECT * INTO o FROM products.semantic_objects x WHERE x.object_id = p_object_id FOR UPDATE;
    IF FOUND THEN RAISE EXCEPTION 'semantic object rejected (request): % is the object % — its key does not change', p_object_id, o.object_key USING ERRCODE = '22023'; END IF;
    v_version := 1;
    INSERT INTO products.semantic_objects (object_id, scope, tenant_id, domain_id, object_key, kind, title, owner_principal_id, current_version, correlation_id)
    VALUES (p_object_id, 'DOMAIN', p_tenant, p_domain, p_key, p_kind, btrim(p_title), p_owner, 1, p_correlation);
  ELSE
    IF o.kind <> p_kind THEN RAISE EXCEPTION 'semantic object rejected (kind): % is a %; its kind does not change', p_key, o.kind USING ERRCODE = '22023'; END IF;
    SELECT * INTO pv FROM products.semantic_object_versions x WHERE x.object_id = o.object_id AND x.version = o.current_version;
    IF pv.digest = v_digest THEN RAISE EXCEPTION 'semantic object rejected (duplicate): the definition of % is unchanged from version %', p_key, o.current_version USING ERRCODE = '22023'; END IF;
    v_version := o.current_version + 1;
    SELECT coalesce(jsonb_agg(jsonb_build_object('key', k, 'from', pv.definition -> k, 'to', v_def -> k) ORDER BY k), '[]'::jsonb) INTO v_changed
      FROM (SELECT DISTINCT kk AS k FROM (SELECT jsonb_object_keys(pv.definition) kk UNION SELECT jsonb_object_keys(v_def) kk) q) z WHERE pv.definition -> k IS DISTINCT FROM v_def -> k;
    IF o.state = 'certified' THEN
      v_withdrawal := products.sob_withdraw(o.object_id, 'withdrawn', format('definition_changed: the certified version %s was re-declared as version %s', o.certified_version, v_version),
                                            jsonb_build_object('from_version', o.certified_version, 'to_version', v_version, 'changed', v_changed), p_actor, p_correlation);
    END IF;
    UPDATE products.semantic_objects SET title = btrim(p_title), owner_principal_id = p_owner, current_version = v_version, updated_at = clock_timestamp() WHERE object_id = o.object_id;
  END IF;
  INSERT INTO products.semantic_object_versions (object_id, version, tenant_id, domain_id, title, definition, digest, declared_by, correlation_id)
  VALUES (p_object_id, v_version, p_tenant, p_domain, btrim(p_title), v_def, v_digest, p_actor, p_correlation);
  INSERT INTO analytics.definition_events (event_id, scope, tenant_id, domain_id, subject_kind, subject_id, subject_key, version, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, 'semantic_object', p_object_id, p_key, v_version, 'semantic_object.declared', p_actor,
          jsonb_build_object('kind', p_kind, 'digest', v_digest, 'owner', p_owner, 'changed', v_changed, 'withdrawal', v_withdrawal), p_correlation);
  RETURN products.semantic_object_read(p_object_id) || jsonb_build_object('version', v_version, 'digest', v_digest, 'changed', v_changed, 'withdrawal', v_withdrawal);
END $$ LANGUAGE plpgsql;

/* CERTIFY (products.semantic.certify; human-gated): the OBJECT'S OWNER only (a steward or analyst declares, never certifies — 0095's rule),
   never the human who declared the version (separation of duties), the CURRENT version at the digest the owner saw (a stale digest is
   refused), an expiry in the future and ≤ 366 days ahead, a reason; a CONFLICT refused — another certified object of the same kind with the
   same normalised title under a different digest (reconcile under semantic governance). */
CREATE OR REPLACE FUNCTION products.semantic_certify(p_certification_id uuid, p_object_id uuid, p_tenant uuid, p_domain uuid, p_version int, p_digest text, p_expires_at timestamptz, p_reason text,
                                                     p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = products, analytics, executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE o products.semantic_objects%ROWTYPE; pv products.semantic_object_versions%ROWTYPE; v_now timestamptz := clock_timestamp(); v_other text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['products.semantic.certify']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS NULL OR p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'semantic object rejected (actor): certified by the acting principal' USING ERRCODE = '42501'; END IF;
  IF NOT decision.is_active_human(p_actor, p_tenant) THEN RAISE EXCEPTION 'semantic object rejected (actor): a certification is a named human''s act; an agent never certifies' USING ERRCODE = '42501'; END IF;
  SELECT * INTO o FROM products.semantic_objects x WHERE x.object_id = p_object_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'semantic object rejected (unknown_semantic_object): % is not a semantic object of this domain', p_object_id USING ERRCODE = '23503'; END IF;
  IF o.owner_principal_id <> p_actor THEN RAISE EXCEPTION 'semantic object rejected (authority): % is certified by its owner (a steward or an analyst declares, never certifies)', o.object_key USING ERRCODE = '42501'; END IF;
  IF o.state = 'certified' THEN RAISE EXCEPTION 'semantic object rejected (state): % is already certified at version %', o.object_key, o.certified_version USING ERRCODE = '22023'; END IF;
  IF p_version IS DISTINCT FROM o.current_version THEN RAISE EXCEPTION 'semantic object rejected (stale): only the current version % of % is certified (asked: %)', o.current_version, o.object_key, coalesce(p_version::text, 'null') USING ERRCODE = '22023'; END IF;
  SELECT * INTO pv FROM products.semantic_object_versions x WHERE x.object_id = p_object_id AND x.version = p_version;
  IF p_digest IS DISTINCT FROM pv.digest THEN RAISE EXCEPTION 'semantic object rejected (stale): the digest % is not version %''s (%): the owner certifies what they read', coalesce(p_digest, 'null'), p_version, pv.digest USING ERRCODE = '22023'; END IF;
  IF pv.declared_by = p_actor THEN RAISE EXCEPTION 'semantic object rejected (separation_of_duties): version % of % was declared by its owner; another human declares, the owner certifies', p_version, o.object_key USING ERRCODE = '42501'; END IF;
  IF p_expires_at IS NULL OR p_expires_at <= v_now THEN RAISE EXCEPTION 'semantic object rejected (expiry): a certification expires at a future instant' USING ERRCODE = '22023'; END IF;
  IF p_expires_at > v_now + interval '366 days' THEN RAISE EXCEPTION 'semantic object rejected (expiry): a certification expires within 366 days (asked: %)', p_expires_at USING ERRCODE = '22023'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN RAISE EXCEPTION 'semantic object rejected (reason): a certification says why (8+ characters)' USING ERRCODE = '22023'; END IF;
  SELECT x.object_key INTO v_other FROM products.semantic_objects x JOIN products.semantic_object_versions xv ON xv.object_id = x.object_id AND xv.version = x.certified_version
   WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.object_id <> p_object_id AND x.state = 'certified' AND x.kind = o.kind
     AND lower(btrim(x.title)) = lower(btrim(pv.title)) AND xv.digest <> pv.digest LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'semantic object rejected (conflict): % conflicts with the certified % (the same title, a different definition) — reconcile under semantic governance: withdraw one or re-declare', o.object_key, v_other USING ERRCODE = '22023';
  END IF;
  INSERT INTO products.semantic_object_certifications (certification_id, object_id, tenant_id, domain_id, version, digest, certified_by, certified_at, expires_at, reason, correlation_id)
  VALUES (p_certification_id, p_object_id, p_tenant, p_domain, p_version, pv.digest, p_actor, v_now, p_expires_at, btrim(p_reason), p_correlation);
  UPDATE products.semantic_objects SET state = 'certified', certified_version = p_version, last_valid_version = p_version, updated_at = clock_timestamp() WHERE object_id = p_object_id;
  INSERT INTO analytics.definition_events (event_id, scope, tenant_id, domain_id, subject_kind, subject_id, subject_key, version, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, 'semantic_object', p_object_id, o.object_key, p_version, 'semantic_object.certified', p_actor,
          jsonb_build_object('certification_id', p_certification_id, 'digest', pv.digest, 'expires_at', p_expires_at, 'reason', btrim(p_reason)), p_correlation);
  RETURN products.semantic_object_read(p_object_id);
END $$ LANGUAGE plpgsql;

/* WITHDRAW (products.semantic.withdraw; human-gated): the owner or a data steward withdraws the active certification with a reason; the last
   valid version is frozen readable; the comparisons that named the object are exposed. */
CREATE OR REPLACE FUNCTION products.semantic_withdraw(p_object_id uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = products, analytics, executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE o products.semantic_objects%ROWTYPE; v_out jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['products.semantic.withdraw']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS NULL OR p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'semantic object rejected (actor): withdrawn by the acting principal' USING ERRCODE = '42501'; END IF;
  IF NOT decision.is_active_human(p_actor, p_tenant) THEN RAISE EXCEPTION 'semantic object rejected (actor): a withdrawal is a named human''s act' USING ERRCODE = '42501'; END IF;
  SELECT * INTO o FROM products.semantic_objects x WHERE x.object_id = p_object_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'semantic object rejected (unknown_semantic_object): % is not a semantic object of this domain', p_object_id USING ERRCODE = '23503'; END IF;
  IF o.owner_principal_id <> p_actor AND NOT executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['data_steward']) THEN
    RAISE EXCEPTION 'semantic object rejected (authority): a certification is withdrawn by the object''s owner or by a data steward' USING ERRCODE = '42501';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN RAISE EXCEPTION 'semantic object rejected (reason): a withdrawal says why (8+ characters)' USING ERRCODE = '22023'; END IF;
  IF o.state <> 'certified' THEN RAISE EXCEPTION 'semantic object rejected (state): % is %; there is no active certification to withdraw', o.object_key, o.state USING ERRCODE = '22023'; END IF;
  v_out := products.sob_withdraw(p_object_id, 'withdrawn', p_reason, jsonb_build_object('by', CASE WHEN o.owner_principal_id = p_actor THEN 'owner' ELSE 'data_steward' END), p_actor, p_correlation);
  RETURN products.semantic_object_read(p_object_id) || jsonb_build_object('withdrawal', v_out);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION products.semantic_declare(uuid,uuid,uuid,text,text,text,jsonb,uuid,uuid,uuid), products.semantic_certify(uuid,uuid,uuid,uuid,int,text,timestamptz,text,uuid,uuid),
                       products.semantic_withdraw(uuid,uuid,uuid,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION products.semantic_declare(uuid,uuid,uuid,text,text,text,jsonb,uuid,uuid,uuid), products.semantic_certify(uuid,uuid,uuid,uuid,int,text,timestamptz,text,uuid,uuid),
                          products.semantic_withdraw(uuid,uuid,uuid,text,uuid,uuid) TO eye_commit;

/* THE READS (INVOKER, under the caller's RLS): an object with its versions, certifications, its STANDING now (certified | certified but past
   its expiry — not usable | declared | withdrawn | expired) and the comparisons that named it; the list (a kind narrows). */
CREATE OR REPLACE FUNCTION products.semantic_object_read(p_object_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = products, analytics, pg_catalog, pg_temp AS $$
  SELECT (to_jsonb(o) - 'scope' - 'correlation_id') || jsonb_build_object(
    'standing', CASE WHEN o.state = 'certified' AND EXISTS (SELECT 1 FROM products.semantic_object_certifications c WHERE c.object_id = o.object_id AND c.state = 'active' AND c.expires_at <= clock_timestamp())
                     THEN 'certified, past its expiry — not usable until re-certified' ELSE o.state END,
    'versions', coalesce((SELECT jsonb_agg(jsonb_build_object('version', v.version, 'title', v.title, 'definition', v.definition, 'digest', v.digest, 'declared_by', v.declared_by, 'declared_at', v.declared_at) ORDER BY v.version)
                           FROM products.semantic_object_versions v WHERE v.object_id = o.object_id), '[]'::jsonb),
    'certifications', coalesce((SELECT jsonb_agg(to_jsonb(c) - 'tenant_id' - 'domain_id' - 'correlation_id' ORDER BY c.certified_at) FROM products.semantic_object_certifications c WHERE c.object_id = o.object_id), '[]'::jsonb),
    'uses', coalesce((SELECT jsonb_agg(jsonb_build_object('comparison_id', x.comparison_id, 'metric_key', x.metric_key, 'state', x.state, 'run_at', x.run_at) ORDER BY x.run_at)
                       FROM analytics.comparisons x WHERE (x.cohort_object_a ->> 'object_id')::uuid = o.object_id OR (x.cohort_object_b ->> 'object_id')::uuid = o.object_id), '[]'::jsonb))
    FROM products.semantic_objects o WHERE o.object_id = p_object_id
$$;
CREATE OR REPLACE FUNCTION products.semantic_object_list(p_kind text) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = products, pg_catalog, pg_temp AS $$
  SELECT coalesce(jsonb_agg((to_jsonb(o) - 'scope' - 'correlation_id') || jsonb_build_object('definition', v.definition, 'digest', v.digest) ORDER BY o.kind, o.object_key), '[]'::jsonb)
    FROM products.semantic_objects o JOIN products.semantic_object_versions v ON v.object_id = o.object_id AND v.version = o.current_version
   WHERE p_kind IS NULL OR o.kind = p_kind
$$;
GRANT EXECUTE ON FUNCTION products.semantic_object_read(uuid), products.semantic_object_list(text) TO eye_app, eye_commit;

-- §CO.7 THE COST RECONCILIATION ────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* RECONCILE (analytics.reconciliation.run — an analyst or the owner): the computations this ledger metered in a named period against B91's
   ledger. B91's dimensions are a closed vocabulary (model_inference, source_consumption, storage, simulation_compute, product_consumption) and
   none is analytics: B91 meters NO analytics computation today, and this part registers none (its CHECK and its meters are B91's). A B91
   usage record for a computation is one whose source_kind is `analytics_computation` (or whose capability is `product_analytics`) and whose
   source_ref is the result id — the seam a future meter writes. Per unit:
     MATCHED     a computation with its B91 usage record, the quantity agreeing (unit wall_ms: compute_ms within the tolerance, relative;
                 unit rows: rows_read exactly; any other unit: 1 per computation), PRICED by a B91 cost entry (amount, currency, rate card)
     UNPRICED    a computation B91 never metered (no usage record — today's honest state), or metered but with no cost entry (no rate card)
     DISCREPANT  a usage record whose quantity disagrees beyond the tolerance, or a B91 analytics usage record no computation of this ledger
                 explains (an orphan meter)
   outcome = discrepant if any unit is; else unpriced if any is; else matched; `empty` when the period holds neither — never a silent pass
   (every non-matched outcome carries its reasons). */
CREATE OR REPLACE FUNCTION analytics.reconcile_costs(p_reconciliation uuid, p_tenant uuid, p_domain uuid, p_period text, p_tolerance numeric, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = analytics, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE w record; v_tol numeric := coalesce(p_tolerance, 0.05); v_units jsonb := '[]'::jsonb; c record; u record; e record; v_class text; v_note text; v_expected numeric;
        v_counts jsonb; v_totals jsonb; v_outcome text; v_reasons jsonb := '[]'::jsonb; v_row jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['analytics.reconciliation.run']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS NULL OR p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'cost reconciliation rejected (actor): a reconciliation is recorded under the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO w FROM analytics.period_window(p_period);
  IF w.window_from IS NULL THEN RAISE EXCEPTION 'cost reconciliation rejected (period): % is not a period (2026-Q3, 2026-09 or R90@2026-10-12)', coalesce(p_period, 'null') USING ERRCODE = '22023'; END IF;
  IF v_tol < 0 OR v_tol > 1 THEN RAISE EXCEPTION 'cost reconciliation rejected (tolerance): the tolerance is a share between 0 and 1 (asked %)', v_tol USING ERRCODE = '22023'; END IF;
  IF w.window_to > clock_timestamp() THEN v_reasons := v_reasons || to_jsonb(format('the period %s is open until %s: a partial period is reconciled as far as it goes', p_period, w.window_to)); END IF;
  FOR c IN SELECT * FROM analytics.computation_costs x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.recorded_at >= w.window_from AND x.recorded_at < w.window_to ORDER BY x.recorded_at, x.result_id LOOP
    SELECT * INTO u FROM commercial.usage_records ur WHERE ur.tenant_id = p_tenant AND ur.source_ref = c.result_id::text AND (ur.source_kind = 'analytics_computation' OR ur.capability_key = 'product_analytics')
     ORDER BY ur.recorded_at LIMIT 1;
    IF NOT FOUND THEN
      v_class := 'unpriced'; v_note := 'no B91 usage record meters this computation (B91 meters no analytics dimension today)';
      v_units := v_units || jsonb_build_object('class', v_class, 'result_id', c.result_id, 'metric_key', c.metric_key, 'rows_read', c.rows_read, 'compute_ms', c.compute_ms, 'replay', c.replay, 'preview', c.preview, 'note', v_note);
      CONTINUE;
    END IF;
    v_expected := CASE u.unit WHEN 'wall_ms' THEN c.compute_ms WHEN 'rows' THEN c.rows_read ELSE 1 END;
    IF (u.unit = 'wall_ms' AND abs(u.quantity - v_expected) > v_tol * greatest(v_expected, 1)) OR (u.unit <> 'wall_ms' AND u.quantity <> v_expected) THEN
      v_class := 'discrepant'; v_note := format('B91 metered %s %s; this ledger measured %s', u.quantity, u.unit, v_expected);
      v_units := v_units || jsonb_build_object('class', v_class, 'result_id', c.result_id, 'metric_key', c.metric_key, 'usage_id', u.usage_id, 'unit', u.unit, 'metered', u.quantity, 'measured', v_expected, 'note', v_note);
      CONTINUE;
    END IF;
    SELECT ce.amount, ce.currency, ce.rate_key, ce.rate_version INTO e FROM commercial.cost_entries ce WHERE ce.usage_id = u.usage_id ORDER BY ce.line LIMIT 1;
    IF NOT FOUND THEN
      v_units := v_units || jsonb_build_object('class', 'unpriced', 'result_id', c.result_id, 'metric_key', c.metric_key, 'usage_id', u.usage_id, 'unit', u.unit, 'metered', u.quantity,
                                               'note', 'metered, but no B91 cost entry prices it (no rate card in force for its dimension and unit)');
    ELSE
      v_units := v_units || jsonb_build_object('class', 'matched', 'result_id', c.result_id, 'metric_key', c.metric_key, 'usage_id', u.usage_id, 'unit', u.unit, 'metered', u.quantity, 'measured', v_expected,
                                               'amount', e.amount, 'currency', e.currency, 'rate_key', e.rate_key, 'rate_version', e.rate_version);
    END IF;
  END LOOP;
  -- the orphan meters: B91 analytics usage in the window that no computation of this ledger explains
  FOR u IN SELECT ur.* FROM commercial.usage_records ur
            WHERE ur.tenant_id = p_tenant AND (ur.domain_id = p_domain OR ur.domain_id IS NULL) AND (ur.source_kind = 'analytics_computation' OR ur.capability_key = 'product_analytics')
              AND ur.occurred_at >= w.window_from AND ur.occurred_at < w.window_to
              AND NOT EXISTS (SELECT 1 FROM analytics.computation_costs x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.result_id::text = ur.source_ref)
            ORDER BY ur.occurred_at LOOP
    v_units := v_units || jsonb_build_object('class', 'discrepant', 'usage_id', u.usage_id, 'source_ref', u.source_ref, 'unit', u.unit, 'metered', u.quantity,
                                             'note', 'a B91 analytics usage record that no computation of this ledger explains (an orphan meter)');
  END LOOP;
  SELECT jsonb_build_object('matched', count(*) FILTER (WHERE x ->> 'class' = 'matched'), 'unpriced', count(*) FILTER (WHERE x ->> 'class' = 'unpriced'),
                            'discrepant', count(*) FILTER (WHERE x ->> 'class' = 'discrepant'), 'units', count(*)) INTO v_counts FROM jsonb_array_elements(v_units) x;
  SELECT jsonb_build_object('computations', count(*), 'rows_read', coalesce(sum(x.rows_read), 0), 'compute_ms', coalesce(sum(x.compute_ms), 0), 'replays', count(*) FILTER (WHERE x.replay),
                            'previews', count(*) FILTER (WHERE x.preview),
                            'priced', (SELECT coalesce(jsonb_object_agg(cur, amt), '{}'::jsonb) FROM (SELECT y ->> 'currency' cur, sum((y ->> 'amount')::numeric) amt FROM jsonb_array_elements(v_units) y
                                                                                                         WHERE y ->> 'class' = 'matched' GROUP BY 1) z))
    INTO v_totals FROM analytics.computation_costs x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.recorded_at >= w.window_from AND x.recorded_at < w.window_to;
  v_outcome := CASE WHEN (v_counts ->> 'units')::int = 0 THEN 'empty' WHEN (v_counts ->> 'discrepant')::int > 0 THEN 'discrepant' WHEN (v_counts ->> 'unpriced')::int > 0 THEN 'unpriced' ELSE 'matched' END;
  IF v_outcome = 'empty' THEN v_reasons := v_reasons || to_jsonb(format('nothing to reconcile: no computation was metered in %s and B91 holds no analytics usage for it — not a pass', p_period)); END IF;
  IF (v_counts ->> 'unpriced')::int > 0 THEN v_reasons := v_reasons || to_jsonb(format('%s unit(s) unpriced: the analytics cost is measured here but not priced by B91 (no meter or no rate card)', v_counts ->> 'unpriced')); END IF;
  IF (v_counts ->> 'discrepant')::int > 0 THEN v_reasons := v_reasons || to_jsonb(format('%s unit(s) discrepant: B91''s meter and this ledger disagree, or B91 holds analytics usage no computation explains', v_counts ->> 'discrepant')); END IF;
  v_row := jsonb_build_object('period', p_period, 'tolerance', v_tol, 'outcome', v_outcome, 'units', v_units, 'counts', v_counts, 'totals', v_totals, 'reasons', v_reasons);
  INSERT INTO analytics.reconciliations (reconciliation_id, scope, tenant_id, domain_id, period_key, window_from, window_to, tolerance, outcome, units, counts, totals, reasons, digest, run_by, correlation_id)
  VALUES (p_reconciliation, 'DOMAIN', p_tenant, p_domain, p_period, w.window_from, w.window_to, v_tol, v_outcome, v_units, v_counts, v_totals,
          v_reasons, analytics.digest(v_row), p_actor, p_correlation);
  INSERT INTO analytics.definition_events (event_id, scope, tenant_id, domain_id, subject_kind, subject_id, subject_key, version, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, 'reconciliation', p_reconciliation, p_period, NULL, 'reconciliation.run', p_actor, jsonb_build_object('outcome', v_outcome, 'counts', v_counts), p_correlation);
  RETURN (SELECT to_jsonb(x) - 'tenant_id' - 'domain_id' - 'scope' FROM analytics.reconciliations x WHERE x.reconciliation_id = p_reconciliation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION analytics.reconcile_costs(uuid, uuid, uuid, text, numeric, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION analytics.reconcile_costs(uuid, uuid, uuid, text, numeric, uuid, uuid) TO eye_commit;

/* The reconciliations (newest first) and the meter's rows of a period — INVOKER, under the caller's RLS. */
CREATE OR REPLACE FUNCTION analytics.reconciliation_list(p_limit int) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = analytics, pg_catalog, pg_temp AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(r) - 'tenant_id' - 'domain_id' - 'scope' ORDER BY r.run_at DESC), '[]'::jsonb)
    FROM (SELECT * FROM analytics.reconciliations x ORDER BY x.run_at DESC LIMIT greatest(1, least(coalesce(p_limit, 50), 500))) r
$$;
CREATE OR REPLACE FUNCTION analytics.computation_cost_list(p_period text, p_limit int) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = analytics, pg_catalog, pg_temp AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(c) - 'tenant_id' - 'domain_id' - 'scope' ORDER BY c.recorded_at DESC), '[]'::jsonb)
    FROM (SELECT x.* FROM analytics.computation_costs x LEFT JOIN LATERAL analytics.period_window(p_period) w ON true
           WHERE p_period IS NULL OR (x.recorded_at >= w.window_from AND x.recorded_at < w.window_to)
           ORDER BY x.recorded_at DESC LIMIT greatest(1, least(coalesce(p_limit, 100), 1000))) c
$$;
GRANT EXECUTE ON FUNCTION analytics.reconciliation_list(int), analytics.computation_cost_list(text, int) TO eye_app, eye_commit;
