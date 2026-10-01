-- 0101 §A — CP-6 B35 part `analysis` (2026-10-01): DECISION OPTION ANALYSIS — F-P6-01 completed (L9-C02 constraint and stakeholder-obligation
-- objects evaluated against each option; L9-C05 / V03-T-160 / V00-T-064 the criteria engine with exposed weights and sensitivity, inspectable
-- scoring; V03-T-360 trade-offs and the value of information as computed products with the validated second-order effects of the cited runs;
-- V00-T-064 / V03-T-358 option generation — defer, stage, pilot, hedge, acquire information, exit; V03-T-359 / L9-C04 the package's inputs
-- assembled — forecasts, scenarios and sets, risks, prior decisions, each with why it was found), F-P5-07's adversarial-response sensitivity
-- (V01-T-016: an option's result under a named actor's response) and F-P4-08's reversibility and option value across futures (the bound set's
-- portfolio review: robustness and regret per option; option value = the value-of-information assessment's net value of waiting).
--
-- PART-LOCAL FILE: the integrator combines it into 0101 after §0 (the prelude). It USES the prelude's objects and declares nothing of another
-- part's. Schema decision, prefix dsa_ on every trigger and index. Forward-only; nothing earlier edited or re-declared. The decision ledger's
-- exact event lists (decision.package_events) are NOT touched: an analysis writes no package event, no outbox row, no interface row. The ONE
-- addition on an existing write is an AFTER INSERT trigger on decision.options (dsa_candidate_adoption) that marks a generated candidate
-- ADOPTED when the package owner sets an option with its key through the EXISTING option route — it writes only decision.option_candidates.
--
-- THE REFUSAL FAMILY is `analysis rejected (<class>): …` — actor / ownership / authority → 403 (42501), unknown_* → 404 (23503), state / stale /
-- duplicate → 409 (22023), the rest → 422 (22023).
--
-- HUMAN AUTHORITY: a weight is a VALUE JUDGMENT — a named human's (the value-judgment owner), never an agent's; an entered assessment, an
-- obligation, a judgment of an obligation and an adversarial response model are a named human's. The Decision Agent GENERATES option candidates
-- and ASSEMBLES the inputs (drafts the owner reads); it never sets a weight and never writes decision.options.

-- ═════════════════════════════════════════════════════════════════════
-- section `analysis`
-- ═════════════════════════════════════════════════════════════════════

-- §A.1 THE TABLES ─────────────────────────────────────────────────────────
CREATE TABLE decision.analysis_criteria (
  criterion_row_id    uuid PRIMARY KEY,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  package_id          uuid NOT NULL,
  version             int  NOT NULL,
  /* the criteria SET's version: every set_criteria writes the whole set again as the next version (the history is every version) */
  criteria_version    int  NOT NULL CHECK (criteria_version >= 1),
  key                 text NOT NULL CHECK (key ~ '^[a-z][a-z0-9_-]{0,40}$'),
  title               text NOT NULL CHECK (length(btrim(title)) BETWEEN 2 AND 256),
  objective_id        uuid NOT NULL REFERENCES graph.strategy_current (strategy_object_id),
  direction           text NOT NULL CHECK (direction IN ('max', 'min')),
  weight              numeric NOT NULL CHECK (weight > 0 AND weight <= 1000),
  scale               text NOT NULL CHECK (scale IN ('ratio', 'interval', 'ordinal')),
  unit                text NOT NULL CHECK (length(btrim(unit)) BETWEEN 1 AND 64),
  /* THE VALUE JUDGMENT's owner: a named human who answers for the weights */
  value_owner         uuid NOT NULL,
  rationale           text NOT NULL CHECK (length(btrim(rationale)) >= 16),
  set_by              uuid NOT NULL,
  set_at              timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id      uuid NOT NULL,
  CONSTRAINT dsa_crit_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT dsa_crit_version FOREIGN KEY (package_id, version) REFERENCES decision.package_versions (package_id, version)
);
CREATE UNIQUE INDEX dsa_crit_key_once ON decision.analysis_criteria (package_id, version, criteria_version, key);
CREATE INDEX dsa_crit_current ON decision.analysis_criteria (package_id, version, criteria_version DESC);
CREATE TRIGGER dsa_crit_append_only BEFORE UPDATE OR DELETE ON decision.analysis_criteria FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE decision.analysis_criteria IS 'B35 §A (0101; L9-C05, V03-T-160, V00-T-064): the CRITERIA of a package version — key, title, the objective it measures (a graph OBJ), direction, an EXPOSED weight, scale, unit — and the named human who owns the value judgment; the whole set re-written as the next criteria_version on every change (the history); append-only.';

CREATE TABLE decision.option_assessments (
  assessment_id       uuid PRIMARY KEY,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  package_id          uuid NOT NULL,
  version             int  NOT NULL,
  option_key          text NOT NULL,
  criterion_key       text NOT NULL,
  value               numeric NOT NULL,
  /* computed: READ BY THE PORT from the cited object (a run, a forecast, a value-of-information assessment, a portfolio review);
     entered: a named human's value with its stated basis */
  basis_kind          text NOT NULL CHECK (basis_kind IN ('computed', 'entered')),
  cited               jsonb CHECK (cited IS NULL OR jsonb_typeof(cited) = 'object'),
  basis               text NOT NULL CHECK (length(btrim(basis)) >= 8),
  assessed_by         uuid NOT NULL,
  assessed_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id      uuid NOT NULL,
  CONSTRAINT dsa_oa_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT dsa_oa_cited CHECK ((basis_kind = 'computed') = (cited IS NOT NULL)),
  CONSTRAINT dsa_oa_version FOREIGN KEY (package_id, version) REFERENCES decision.package_versions (package_id, version)
);
CREATE INDEX dsa_oa_cell ON decision.option_assessments (package_id, version, option_key, criterion_key, assessed_at DESC);
CREATE TRIGGER dsa_oa_append_only BEFORE UPDATE OR DELETE ON decision.option_assessments FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE decision.option_assessments IS 'B35 §A (0101; V03-T-160 inspectable scoring): an option''s value on a criterion — COMPUTED by the port from a cited object (run totals, a forecast quantile, a value-of-information expected payoff, a portfolio review''s robustness/regret/payoff) or ENTERED by a named human with its basis; the newest per cell counts, every one kept; append-only.';

CREATE TABLE decision.obligations (
  obligation_id       uuid PRIMARY KEY,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  package_id          uuid NOT NULL REFERENCES decision.packages_current (package_id),
  key                 text NOT NULL CHECK (key ~ '^[a-z][a-z0-9_-]{0,40}$'),
  kind                text NOT NULL CHECK (kind IN ('constraint', 'obligation')),
  stakeholder         text CHECK (stakeholder IS NULL OR length(btrim(stakeholder)) BETWEEN 2 AND 256),
  /* an STK of the Strategy Graph (0089), when the stakeholder is one */
  stakeholder_ref     uuid REFERENCES graph.strategy_current (strategy_object_id),
  statement           text NOT NULL CHECK (length(btrim(statement)) BETWEEN 8 AND 2000),
  /* {kind: threshold, criterion, op, value} — a declarative rule over the option's assessed value — or {kind: judgment} — its owner's */
  test                jsonb NOT NULL CHECK (jsonb_typeof(test) = 'object'),
  owner_principal_id  uuid NOT NULL,
  declared_by         uuid NOT NULL,
  declared_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id      uuid NOT NULL,
  CONSTRAINT dsa_ob_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT dsa_ob_stakeholder CHECK (kind = 'constraint' OR stakeholder IS NOT NULL)
);
CREATE UNIQUE INDEX dsa_ob_key_once ON decision.obligations (package_id, key);
CREATE TRIGGER dsa_ob_append_only BEFORE UPDATE OR DELETE ON decision.obligations FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE decision.obligations IS 'B35 §A (0101; L9-C02, C-026, V01-T-017): a CONSTRAINT or a STAKEHOLDER OBLIGATION of a package as an object — the stakeholder (an STK when one exists), the statement, its TEST (a declarative threshold over an assessed criterion, or a named owner''s judgment) and its owner; append-only.';

CREATE TABLE decision.obligation_evaluations (
  evaluation_row_id   uuid PRIMARY KEY,
  evaluation_id       uuid NOT NULL,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  obligation_id       uuid NOT NULL REFERENCES decision.obligations (obligation_id),
  package_id          uuid NOT NULL,
  version             int  NOT NULL,
  option_key          text NOT NULL,
  result              text NOT NULL CHECK (result IN ('satisfied', 'violated', 'unknown')),
  /* {method: rule|judgment, criterion, op, threshold, value, criteria_version, assessment_id, reason} */
  basis               jsonb NOT NULL CHECK (jsonb_typeof(basis) = 'object'),
  evaluated_by        uuid NOT NULL,
  evaluated_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id      uuid NOT NULL,
  CONSTRAINT dsa_oe_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT dsa_oe_version FOREIGN KEY (package_id, version) REFERENCES decision.package_versions (package_id, version)
);
CREATE INDEX dsa_oe_cell ON decision.obligation_evaluations (package_id, version, obligation_id, option_key, evaluated_at DESC);
CREATE TRIGGER dsa_oe_append_only BEFORE UPDATE OR DELETE ON decision.obligation_evaluations FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE decision.obligation_evaluations IS 'B35 §A (0101; L9-C02): an obligation EVALUATED against an option — satisfied, violated or unknown — by its rule over the newest assessment (computed by the port) or by its owner''s judgment with the basis; the newest per cell counts; append-only.';

CREATE TABLE decision.option_candidates (
  candidate_id        uuid PRIMARY KEY,
  generation_id       uuid NOT NULL,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  package_id          uuid NOT NULL,
  version             int  NOT NULL,
  posture             text NOT NULL CHECK (posture IN ('defer', 'stage', 'pilot', 'hedge', 'acquire_information', 'exit')),
  key                 text NOT NULL CHECK (key ~ '^[a-z][a-z0-9_-]{0,40}$'),
  title               text NOT NULL CHECK (length(btrim(title)) BETWEEN 2 AND 256),
  rationale           text NOT NULL CHECK (length(btrim(rationale)) >= 16),
  /* the rule that generated it (defer@1, acquire_information@1, pilot@1, stage@1, hedge@1, exit@1) and the facts it read */
  rule                text NOT NULL CHECK (rule ~ '^[a-z_]+@[0-9]+$'),
  basis               jsonb NOT NULL CHECK (jsonb_typeof(basis) = 'object'),
  generated_by        uuid NOT NULL,
  generated_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  /* set ONCE, by the trigger on decision.options, when the package OWNER sets an option with this key through the existing route */
  adopted_as          text,
  adopted_option_id   uuid,
  adopted_version     int,
  adopted_by          uuid,
  adopted_at          timestamptz,
  correlation_id      uuid NOT NULL,
  CONSTRAINT dsa_oc_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT dsa_oc_version FOREIGN KEY (package_id, version) REFERENCES decision.package_versions (package_id, version),
  CONSTRAINT dsa_oc_adopted CHECK ((adopted_as IS NULL) = (adopted_at IS NULL) AND (adopted_as IS NULL) = (adopted_option_id IS NULL) AND (adopted_as IS NULL) = (adopted_by IS NULL) AND (adopted_as IS NULL) = (adopted_version IS NULL))
);
CREATE INDEX dsa_oc_package ON decision.option_candidates (package_id, version, generated_at DESC);
CREATE INDEX dsa_oc_key ON decision.option_candidates (package_id, key) WHERE adopted_as IS NULL;
COMMENT ON TABLE decision.option_candidates IS 'B35 §A (0101; V00-T-064, V03-T-358): GENERATED option cards — defer, stage, pilot, hedge, acquire information, exit — each with the rule that generated it and the facts it read; generation never writes decision.options: the owner ADOPTS one through the existing option route (marked once by dsa_candidate_adoption); never deleted.';

CREATE TABLE decision.package_assemblies (
  assembly_id         uuid PRIMARY KEY,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  package_id          uuid NOT NULL,
  version             int  NOT NULL,
  /* [{kind: forecast|scenario|scenario_set|risk|opportunity|prior_decision|run|value_of_information, id, version, title, state, why: [...]}] */
  items               jsonb NOT NULL CHECK (jsonb_typeof(items) = 'array'),
  counts              jsonb NOT NULL CHECK (jsonb_typeof(counts) = 'object'),
  assembled_by        uuid NOT NULL,
  assembled_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id      uuid NOT NULL,
  CONSTRAINT dsa_pa_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT dsa_pa_version FOREIGN KEY (package_id, version) REFERENCES decision.package_versions (package_id, version)
);
CREATE INDEX dsa_pa_package ON decision.package_assemblies (package_id, version, assembled_at DESC);
CREATE TRIGGER dsa_pa_append_only BEFORE UPDATE OR DELETE ON decision.package_assemblies FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE decision.package_assemblies IS 'B35 §A (0101; V03-T-359, L9-C04 the information boundary): the inputs FOUND for a package version — forecasts, scenarios and sets, risks and opportunities, prior decisions on the same decision object, the cited runs, the value-of-information assessments — each with WHY it was found; the owner accepts items into the package''s citations through the existing routes; append-only.';

CREATE TABLE decision.adversarial_assessments (
  assessment_id       uuid PRIMARY KEY,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  package_id          uuid NOT NULL,
  version             int  NOT NULL,
  option_key          text NOT NULL,
  actor_element_id    uuid NOT NULL REFERENCES prediction.scenario_elements (element_id),
  actor_element_version int NOT NULL,
  actor_name          text NOT NULL,
  actor_agency        text NOT NULL CHECK (actor_agency IN ('high', 'medium')),
  scenario_id         uuid NOT NULL,
  response            text NOT NULL CHECK (length(btrim(response)) BETWEEN 8 AND 2000),
  /* the declared response model: [{criterion, op: add|multiply|set, value}] — applied to the option's assessed values, nothing evaluated as code */
  effects             jsonb NOT NULL CHECK (jsonb_typeof(effects) = 'array' AND jsonb_array_length(effects) >= 1),
  basis               text NOT NULL CHECK (length(btrim(basis)) >= 16),
  criteria_version    int NOT NULL,
  base_values         jsonb NOT NULL,
  response_values     jsonb NOT NULL,
  base_score          numeric NOT NULL,
  base_rank           int NOT NULL,
  response_score      numeric NOT NULL,
  response_rank       int NOT NULL,
  rank_change         int NOT NULL,
  ranking_before      jsonb NOT NULL,
  ranking_under_response jsonb NOT NULL,
  assessed_by         uuid NOT NULL,
  assessed_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id      uuid NOT NULL,
  CONSTRAINT dsa_aa_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT dsa_aa_version FOREIGN KEY (package_id, version) REFERENCES decision.package_versions (package_id, version),
  CONSTRAINT dsa_aa_rank CHECK (rank_change = base_rank - response_rank)
);
CREATE INDEX dsa_aa_package ON decision.adversarial_assessments (package_id, version, assessed_at DESC);
CREATE TRIGGER dsa_aa_append_only BEFORE UPDATE OR DELETE ON decision.adversarial_assessments FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE decision.adversarial_assessments IS 'B35 §A (0101; V01-T-016, F-P5-07): ADVERSARIAL-RESPONSE SENSITIVITY — an option''s result under a named actor''s response (an actor with agency in the scenario anatomy of a scenario the package rests on), the declared response model applied to its assessed values, the score and the rank under it, the rank change; a named human''s; append-only.';

-- RLS and grants: the 0081 loop idiom with the decision schema's policy text (0041:701, 0094:2783); reads under the caller's RLS; every write
-- through a port below (no INSERT/UPDATE/DELETE grant).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['analysis_criteria', 'option_assessments', 'obligations', 'obligation_evaluations', 'option_candidates', 'package_assemblies', 'adversarial_assessments'] LOOP
    EXECUTE format('REVOKE ALL ON decision.%I FROM PUBLIC', t);
    EXECUTE format('ALTER TABLE decision.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE decision.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY decision_isolation ON decision.%I
        USING (
          tenant_id = public.eye_tenant()
          AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain())
        )$f$, t);
    EXECUTE format('GRANT SELECT ON decision.%I TO eye_app, eye_commit', t);
  END LOOP;
END $$;

-- §A.2 THE CANDIDATE'S ADOPTION (the one trigger on an existing write) ────────────
/* A candidate changes ONCE: its adoption columns, from NULL. Nothing else ever changes; nothing is deleted. */
CREATE OR REPLACE FUNCTION decision.dsa_candidate_guard() RETURNS trigger
SET search_path = decision, pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'option candidates are append-only: DELETE prohibited' USING ERRCODE = '2F002'; END IF;
  IF OLD.adopted_as IS NOT NULL
     OR (to_jsonb(NEW) - ARRAY['adopted_as', 'adopted_option_id', 'adopted_version', 'adopted_by', 'adopted_at']) <> (to_jsonb(OLD) - ARRAY['adopted_as', 'adopted_option_id', 'adopted_version', 'adopted_by', 'adopted_at']) THEN
    RAISE EXCEPTION 'option candidate % is generated and immutable; only its adoption is recorded, once', OLD.candidate_id USING ERRCODE = '2F002';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER dsa_candidate_guard BEFORE UPDATE OR DELETE ON decision.option_candidates FOR EACH ROW EXECUTE FUNCTION decision.dsa_candidate_guard();

/* AFTER INSERT on decision.options: an option the package OWNER sets (the existing route, decision.package.option) whose key is an unadopted
   candidate's of the same package (generated for this version or an earlier one) adopts it. An option the Decision Agent drafts adopts
   nothing. Writes only decision.option_candidates; the option row and the package ledger are untouched. */
CREATE OR REPLACE FUNCTION decision.dsa_candidate_adoption() RETURNS trigger
SECURITY DEFINER SET search_path = decision, pg_catalog, pg_temp AS $$
DECLARE v_owner uuid;
BEGIN
  SELECT p.owner_principal_id INTO v_owner FROM decision.packages_current p WHERE p.package_id = NEW.package_id;
  IF v_owner IS NULL OR NEW.set_by IS DISTINCT FROM v_owner THEN RETURN NULL; END IF;
  UPDATE decision.option_candidates c SET adopted_as = NEW.key, adopted_option_id = NEW.option_id, adopted_version = NEW.version, adopted_by = NEW.set_by, adopted_at = clock_timestamp()
   WHERE c.package_id = NEW.package_id AND c.key = NEW.key AND c.adopted_as IS NULL AND c.version <= NEW.version;
  RETURN NULL;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.dsa_candidate_adoption() FROM PUBLIC;
CREATE TRIGGER dsa_candidate_adoption AFTER INSERT ON decision.options FOR EACH ROW EXECUTE FUNCTION decision.dsa_candidate_adoption();

-- §A.3 THE PRIVATE HELPERS ───────────────────────────────────────────────
/* The acting principal and, where a person must act, a named active human of the tenant. */
CREATE OR REPLACE FUNCTION decision.dsa_assert_actor(p_actor uuid, p_tenant uuid, p_human_for text) RETURNS void
SET search_path = decision, identity, pg_catalog, pg_temp AS $$
BEGIN
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN
    RAISE EXCEPTION 'analysis rejected (actor): an analysis act is recorded by the acting principal' USING ERRCODE = '42501';
  END IF;
  IF p_human_for IS NOT NULL AND NOT EXISTS (SELECT 1 FROM identity.principals x WHERE x.id = p_actor AND x.kind = 'human' AND x.status = 'active' AND x.tenant_id = p_tenant) THEN
    RAISE EXCEPTION 'analysis rejected (authority): % is a named human''s act, never an agent''s', p_human_for USING ERRCODE = '42501';
  END IF;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.dsa_assert_actor(uuid, uuid, text) FROM PUBLIC;

/* The package (of this domain) and the version: unknown → 404; a write on a closed, rejected or withdrawn package, or on a committed,
   rejected or superseded version (its analysis is history: a new version is analysed) → 409. */
CREATE OR REPLACE FUNCTION decision.dsa_package(p_tenant uuid, p_domain uuid, p_package_id uuid, p_version int, p_live boolean) RETURNS decision.packages_current
SET search_path = decision, pg_catalog, pg_temp AS $$
DECLARE pk decision.packages_current%ROWTYPE; v_state text;
BEGIN
  SELECT * INTO pk FROM decision.packages_current x WHERE x.package_id = p_package_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'analysis rejected (unknown_package): % is not a decision package of this domain', p_package_id USING ERRCODE = '23503'; END IF;
  IF p_live AND pk.state IN ('closed', 'rejected', 'withdrawn') THEN
    RAISE EXCEPTION 'analysis rejected (state): package "%" is %; its analysis is history', pk.title, pk.state USING ERRCODE = '22023';
  END IF;
  IF p_version IS NOT NULL THEN
    SELECT v.state INTO v_state FROM decision.package_versions v WHERE v.package_id = p_package_id AND v.version = p_version;
    IF NOT FOUND THEN RAISE EXCEPTION 'analysis rejected (unknown_version): package "%" has no version %', pk.title, p_version USING ERRCODE = '23503'; END IF;
    IF p_live AND v_state IN ('committed', 'rejected', 'superseded') THEN
      RAISE EXCEPTION 'analysis rejected (state): version % of package "%" is %; its analysis is history — a new version is analysed', p_version, pk.title, v_state USING ERRCODE = '22023';
    END IF;
  END IF;
  RETURN pk;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.dsa_package(uuid, uuid, uuid, int, boolean) FROM PUBLIC;

/* THE SCORES (the server's): the current criteria set; every option of the version; the newest assessment per cell (or the override given —
   the adversarial response); each criterion's values min-max NORMALISED across the options (direction applied; all equal → 1); the weighted
   score Σ w·n / Σ w of an option assessed on EVERY criterion (an option with a missing cell is not ranked: its missing criteria named); the
   rank (ties share it). An invoker function: under the caller's RLS when read, under the port's when a port calls it. */
CREATE OR REPLACE FUNCTION decision.dsa_scores(p_package_id uuid, p_version int, p_overrides jsonb DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = decision, pg_catalog, pg_temp AS $$
DECLARE v_cv int; v_out jsonb;
BEGIN
  SELECT max(c.criteria_version) INTO v_cv FROM decision.analysis_criteria c WHERE c.package_id = p_package_id AND c.version = p_version;
  WITH crit AS (
    SELECT c.key, c.title, c.objective_id, c.direction, c.weight, c.scale, c.unit, c.value_owner FROM decision.analysis_criteria c
     WHERE c.package_id = p_package_id AND c.version = p_version AND c.criteria_version = v_cv),
  opts AS (SELECT o.key, o.title, o.kind FROM decision.options o WHERE o.package_id = p_package_id AND o.version = p_version),
  vals AS (
    SELECT op.key AS option_key, cr.key AS criterion_key, cr.weight, cr.direction,
           CASE WHEN jsonb_typeof(p_overrides -> op.key -> cr.key) = 'number' THEN (p_overrides -> op.key ->> cr.key)::numeric ELSE a.value END AS value,
           a.assessment_id, a.basis_kind
      FROM opts op CROSS JOIN crit cr
      LEFT JOIN LATERAL (SELECT x.assessment_id, x.value, x.basis_kind FROM decision.option_assessments x
                          WHERE x.package_id = p_package_id AND x.version = p_version AND x.option_key = op.key AND x.criterion_key = cr.key
                          ORDER BY x.assessed_at DESC, x.assessment_id DESC LIMIT 1) a ON true),
  bounds AS (SELECT criterion_key, min(value) AS lo, max(value) AS hi FROM vals WHERE value IS NOT NULL GROUP BY criterion_key),
  norm AS (
    SELECT v.*, CASE WHEN v.value IS NULL THEN NULL WHEN b.hi = b.lo THEN 1::numeric
                     WHEN v.direction = 'max' THEN (v.value - b.lo) / (b.hi - b.lo) ELSE (b.hi - v.value) / (b.hi - b.lo) END AS n
      FROM vals v LEFT JOIN bounds b ON b.criterion_key = v.criterion_key),
  per AS (
    SELECT op.key, op.title, op.kind,
           (SELECT CASE WHEN count(*) > 0 AND bool_and(n.n IS NOT NULL) THEN sum(n.weight * n.n) / sum(n.weight) END FROM norm n WHERE n.option_key = op.key) AS score,
           coalesce((SELECT jsonb_object_agg(n.criterion_key, n.value) FROM norm n WHERE n.option_key = op.key), '{}'::jsonb) AS vals,
           coalesce((SELECT jsonb_object_agg(n.criterion_key, round(n.n, 6)) FROM norm n WHERE n.option_key = op.key AND n.n IS NOT NULL), '{}'::jsonb) AS normalised,
           coalesce((SELECT jsonb_agg(n.criterion_key ORDER BY n.criterion_key) FROM norm n WHERE n.option_key = op.key AND n.n IS NULL), '[]'::jsonb) AS missing,
           coalesce((SELECT jsonb_object_agg(n.criterion_key, n.basis_kind) FROM norm n WHERE n.option_key = op.key AND n.basis_kind IS NOT NULL), '{}'::jsonb) AS bases
      FROM opts op),
  ranked AS (SELECT p.*, CASE WHEN p.score IS NULL THEN NULL ELSE rank() OVER (PARTITION BY p.score IS NULL ORDER BY round(p.score, 9) DESC) END AS rnk FROM per p)
  SELECT jsonb_build_object(
    'criteria_version', v_cv,
    'criteria', coalesce((SELECT jsonb_agg(jsonb_build_object('key', c.key, 'title', c.title, 'objective_id', c.objective_id, 'direction', c.direction, 'weight', c.weight,
                                                             'share', round(c.weight / (SELECT sum(x.weight) FROM crit x), 6), 'scale', c.scale, 'unit', c.unit, 'value_owner', c.value_owner) ORDER BY c.key) FROM crit c), '[]'::jsonb),
    'options', coalesce((SELECT jsonb_agg(jsonb_build_object('key', r.key, 'title', r.title, 'kind', r.kind, 'values', r.vals, 'normalised', r.normalised, 'bases', r.bases,
                                                            'missing', r.missing, 'score', round(r.score, 6), 'rank', r.rnk) ORDER BY r.rnk NULLS LAST, r.key) FROM ranked r), '[]'::jsonb),
    'ranking', coalesce((SELECT jsonb_agg(r.key ORDER BY r.rnk, r.key) FROM ranked r WHERE r.rnk IS NOT NULL), '[]'::jsonb),
    'method', 'min-max normalisation per criterion across the options (direction applied; equal values → 1); score = Σ weight × normalised / Σ weight; an option missing a criterion is not ranked')
  INTO v_out;
  RETURN v_out;
END $$;
GRANT EXECUTE ON FUNCTION decision.dsa_scores(uuid, int, jsonb) TO eye_app, eye_commit;

/* One criterion's lines: per ranked option, its normalised value s on criterion k (the slope) and R = Σ_{j≠k} w_j·n_j (the intercept). */
CREATE OR REPLACE FUNCTION decision.dsa_sens_rows(p_scores jsonb, p_key text) RETURNS TABLE (key text, s numeric, r numeric)
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT o ->> 'key', (o -> 'normalised' ->> p_key)::numeric,
         coalesce((SELECT sum((cc ->> 'weight')::numeric * (o -> 'normalised' ->> (cc ->> 'key'))::numeric) FROM jsonb_array_elements(p_scores -> 'criteria') cc WHERE cc ->> 'key' <> p_key), 0)
    FROM jsonb_array_elements(coalesce(p_scores -> 'options', '[]'::jsonb)) o WHERE jsonb_typeof(o -> 'rank') = 'number'
$$;
GRANT EXECUTE ON FUNCTION decision.dsa_sens_rows(jsonb, text) TO eye_app, eye_commit;

/* THE WEIGHT SENSITIVITY of a scored analysis: per criterion i, holding the other weights, every ranked option's numerator is LINEAR in w_i
   (N_X(w) = w·n_Xi + R_X, R_X = Σ_{j≠i} w_j·n_Xj; the common denominator never reorders). The LEADER changes where another option's line
   crosses the leader's: flip_up — the smallest crossing above the current weight (an option with a larger n_i overtakes), flip_down — the
   largest crossing in (0, w_i) (an option with a smaller n_i overtakes); the ORDER changes at the first crossing of ANY pair above and below.
   change_pct: the relative change of the weight to the flip. most_sensitive: the criterion whose leader flip is nearest. Pure. */
CREATE OR REPLACE FUNCTION decision.dsa_sensitivity(p_scores jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
DECLARE c jsonb; k text; w numeric; v_leader text; v_out jsonb := '[]'::jsonb; sA numeric; rA numeric; v_up record; v_down record; v_oup record; v_odown record;
        v_crit jsonb := coalesce(p_scores -> 'criteria', '[]'::jsonb); v_best text; v_best_pct numeric;
BEGIN
  IF jsonb_array_length(coalesce(p_scores -> 'ranking', '[]'::jsonb)) < 2 OR jsonb_array_length(v_crit) = 0 THEN
    RETURN jsonb_build_object('leader', p_scores -> 'ranking' ->> 0, 'criteria', '[]'::jsonb, 'most_sensitive', NULL, 'note', 'at least two ranked options are needed for a ranking to change');
  END IF;
  v_leader := p_scores -> 'ranking' ->> 0;
  FOR c IN SELECT x FROM jsonb_array_elements(v_crit) x LOOP
    k := c ->> 'key'; w := (c ->> 'weight')::numeric;
    SELECT t.s, t.r INTO sA, rA FROM decision.dsa_sens_rows(p_scores, k) t WHERE t.key = v_leader;
    SELECT t.key, (rA - t.r) / (t.s - sA) AS wx INTO v_up FROM decision.dsa_sens_rows(p_scores, k) t
     WHERE t.key <> v_leader AND t.s > sA AND (rA - t.r) / (t.s - sA) > w + 0.000000001 ORDER BY 2, 1 LIMIT 1;
    SELECT t.key, (rA - t.r) / (t.s - sA) AS wx INTO v_down FROM decision.dsa_sens_rows(p_scores, k) t
     WHERE t.key <> v_leader AND t.s < sA AND (rA - t.r) / (t.s - sA) < w - 0.000000001 AND (rA - t.r) / (t.s - sA) > 0 ORDER BY 2 DESC, 1 LIMIT 1;
    SELECT a.key AS x, b.key AS y, (b.r - a.r) / (a.s - b.s) AS wx INTO v_oup FROM decision.dsa_sens_rows(p_scores, k) a JOIN decision.dsa_sens_rows(p_scores, k) b ON a.key < b.key
     WHERE a.s <> b.s AND (b.r - a.r) / (a.s - b.s) > w + 0.000000001 ORDER BY 3, 1, 2 LIMIT 1;
    SELECT a.key AS x, b.key AS y, (b.r - a.r) / (a.s - b.s) AS wx INTO v_odown FROM decision.dsa_sens_rows(p_scores, k) a JOIN decision.dsa_sens_rows(p_scores, k) b ON a.key < b.key
     WHERE a.s <> b.s AND (b.r - a.r) / (a.s - b.s) < w - 0.000000001 AND (b.r - a.r) / (a.s - b.s) > 0 ORDER BY 3 DESC, 1, 2 LIMIT 1;
    v_out := v_out || jsonb_build_object('key', k, 'title', c ->> 'title', 'weight', w, 'leader', v_leader,
      'flip_up', CASE WHEN v_up.key IS NULL THEN NULL ELSE jsonb_build_object('weight', round(v_up.wx, 6), 'to', v_up.key, 'change_pct', round((v_up.wx - w) / w * 100, 2)) END,
      'flip_down', CASE WHEN v_down.key IS NULL THEN NULL ELSE jsonb_build_object('weight', round(v_down.wx, 6), 'to', v_down.key, 'change_pct', round((v_down.wx - w) / w * 100, 2)) END,
      'order_up', CASE WHEN v_oup.x IS NULL THEN NULL ELSE jsonb_build_object('weight', round(v_oup.wx, 6), 'between', jsonb_build_array(v_oup.x, v_oup.y)) END,
      'order_down', CASE WHEN v_odown.x IS NULL THEN NULL ELSE jsonb_build_object('weight', round(v_odown.wx, 6), 'between', jsonb_build_array(v_odown.x, v_odown.y)) END);
    IF v_up.key IS NOT NULL AND (v_best_pct IS NULL OR abs((v_up.wx - w) / w) < v_best_pct) THEN v_best := k; v_best_pct := abs((v_up.wx - w) / w); END IF;
    IF v_down.key IS NOT NULL AND (v_best_pct IS NULL OR abs((v_down.wx - w) / w) < v_best_pct) THEN v_best := k; v_best_pct := abs((v_down.wx - w) / w); END IF;
  END LOOP;
  RETURN jsonb_build_object('leader', v_leader, 'criteria', v_out, 'most_sensitive', v_best, 'most_sensitive_change_pct', CASE WHEN v_best_pct IS NULL THEN NULL ELSE round(v_best_pct * 100, 2) END,
    'method', 'per criterion, the other weights held: the weight at which another option''s weighted score crosses the leader''s (flip_up above, flip_down below the current weight) and at which any two options first swap (order_up, order_down)');
END $$;
GRANT EXECUTE ON FUNCTION decision.dsa_sensitivity(jsonb) TO eye_app, eye_commit;

/* THE TRADE-OFFS of a scored analysis: pairwise DOMINANCE on the normalised values (X dominates Y: at least as good on every criterion and
   better on one), the non-dominated options, and WHAT IS GIVEN UP by the leader — every criterion on which another ranked option is better,
   with both raw values. Pure. */
CREATE OR REPLACE FUNCTION decision.dsa_tradeoffs(p_scores jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  WITH o AS (SELECT x ->> 'key' AS key, x -> 'normalised' AS n, x -> 'values' AS v FROM jsonb_array_elements(coalesce(p_scores -> 'options', '[]'::jsonb)) x WHERE jsonb_typeof(x -> 'rank') = 'number'),
       c AS (SELECT x ->> 'key' AS key, x ->> 'title' AS title, x ->> 'unit' AS unit, x ->> 'direction' AS direction FROM jsonb_array_elements(coalesce(p_scores -> 'criteria', '[]'::jsonb)) x),
       dom AS (SELECT a.key AS dominant, b.key AS dominated FROM o a JOIN o b ON a.key <> b.key
                WHERE NOT EXISTS (SELECT 1 FROM c WHERE (a.n ->> c.key)::numeric < (b.n ->> c.key)::numeric)
                  AND EXISTS (SELECT 1 FROM c WHERE (a.n ->> c.key)::numeric > (b.n ->> c.key)::numeric)),
       leader AS (SELECT p_scores -> 'ranking' ->> 0 AS key)
  SELECT jsonb_build_object(
    'dominance', coalesce((SELECT jsonb_agg(jsonb_build_object('dominant', d.dominant, 'dominated', d.dominated) ORDER BY d.dominant, d.dominated) FROM dom d), '[]'::jsonb),
    'non_dominated', coalesce((SELECT jsonb_agg(o.key ORDER BY o.key) FROM o WHERE NOT EXISTS (SELECT 1 FROM dom d WHERE d.dominated = o.key)), '[]'::jsonb),
    'leader', (SELECT key FROM leader),
    'given_up', coalesce((SELECT jsonb_agg(jsonb_build_object('option', b.key, 'criteria', g.items) ORDER BY b.key)
                            FROM o a JOIN leader l ON a.key = l.key JOIN o b ON b.key <> a.key
                            CROSS JOIN LATERAL (SELECT jsonb_agg(jsonb_build_object('criterion', c.key, 'title', c.title, 'unit', c.unit, 'direction', c.direction,
                                                                                    'leader_value', a.v -> c.key, 'other_value', b.v -> c.key) ORDER BY c.key) AS items
                                                  FROM c WHERE (b.n ->> c.key)::numeric > (a.n ->> c.key)::numeric) g
                           WHERE g.items IS NOT NULL), '[]'::jsonb),
    'method', 'dominance on the normalised values; given_up: the criteria on which another ranked option is better than the leader');
$$;
GRANT EXECUTE ON FUNCTION decision.dsa_tradeoffs(jsonb) TO eye_app, eye_commit;

/* THE SCENARIOS A PACKAGE RESTS ON (with why): the members of the sets BOUND to it (0097 decision.package_scenario_sets) or naming it as the
   decision they serve, and the scenarios of the runs its options cite. */
CREATE OR REPLACE FUNCTION decision.dsa_package_scenarios(p_package_id uuid, p_version int) RETURNS TABLE (scenario_id uuid, why text)
LANGUAGE sql STABLE SET search_path = decision, prediction, simulation, pg_catalog, pg_temp AS $$
  SELECT DISTINCT m.scenario_id, format('a member of the set "%s" bound to the package', s.title)
    FROM decision.package_scenario_sets b JOIN prediction.scenario_sets s ON s.set_id = b.set_id
    JOIN prediction.scenario_set_members m ON m.set_id = s.set_id AND m.removed_at IS NULL
   WHERE b.package_id = p_package_id
  UNION
  SELECT DISTINCT m.scenario_id, format('a member of the set "%s", which serves the package', s.title)
    FROM prediction.scenario_sets s JOIN prediction.scenario_set_members m ON m.set_id = s.set_id AND m.removed_at IS NULL
   WHERE s.package_id = p_package_id
  UNION
  SELECT DISTINCT r.scenario_id, format('option %s cites run %s, run on its branch', o.key, r.run_id)
    FROM decision.options o CROSS JOIN LATERAL jsonb_array_elements(o.consequences) c
    JOIN simulation.runs_current r ON r.run_id = (c ->> 'id')::uuid
   WHERE o.package_id = p_package_id AND o.version = p_version AND c ->> 'kind' = 'run' AND r.scenario_id IS NOT NULL
$$;
GRANT EXECUTE ON FUNCTION decision.dsa_package_scenarios(uuid, int) TO eye_app, eye_commit;

/* The newest portfolio review over the futures the package rests on: a review naming the package, or of a set bound to it or serving it. */
CREATE OR REPLACE FUNCTION decision.dsa_review_of(p_package_id uuid) RETURNS prediction.portfolio_reviews
LANGUAGE sql STABLE SET search_path = decision, prediction, pg_catalog, pg_temp AS $$
  SELECT r.* FROM prediction.portfolio_reviews r
   WHERE r.package_id = p_package_id
      OR r.set_id IN (SELECT b.set_id FROM decision.package_scenario_sets b WHERE b.package_id = p_package_id)
      OR r.set_id IN (SELECT s.set_id FROM prediction.scenario_sets s WHERE s.package_id = p_package_id)
   ORDER BY r.reviewed_at DESC, r.review_id DESC LIMIT 1
$$;
GRANT EXECUTE ON FUNCTION decision.dsa_review_of(uuid) TO eye_app, eye_commit;

/* The newest evaluation per obligation × option of a version, with the judgment obligations never judged read as unknown. */
CREATE OR REPLACE FUNCTION decision.dsa_obligation_state(p_package_id uuid, p_version int) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = decision, pg_catalog, pg_temp AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('obligation_id', ob.obligation_id, 'key', ob.key, 'kind', ob.kind, 'stakeholder', ob.stakeholder, 'stakeholder_ref', ob.stakeholder_ref,
           'statement', ob.statement, 'test', ob.test, 'owner', ob.owner_principal_id,
           'evaluations', coalesce((SELECT jsonb_object_agg(o.key, jsonb_build_object('result', coalesce(e.result, 'unknown'), 'basis', coalesce(e.basis, jsonb_build_object('reason', 'not evaluated yet')),
                                                                                       'evaluated_by', e.evaluated_by, 'evaluated_at', e.evaluated_at))
                                     FROM decision.options o
                                     LEFT JOIN LATERAL (SELECT x.* FROM decision.obligation_evaluations x WHERE x.obligation_id = ob.obligation_id AND x.package_id = p_package_id AND x.version = p_version AND x.option_key = o.key
                                                         ORDER BY x.evaluated_at DESC, x.evaluation_row_id DESC LIMIT 1) e ON true
                                    WHERE o.package_id = p_package_id AND o.version = p_version), '{}'::jsonb)) ORDER BY ob.key), '[]'::jsonb)
    FROM decision.obligations ob WHERE ob.package_id = p_package_id
$$;
GRANT EXECUTE ON FUNCTION decision.dsa_obligation_state(uuid, int) TO eye_app, eye_commit;

-- §A.4 THE PORTS ───────────────────────────────────────────────────────────
/* SET THE CRITERIA (decision.analysis.criteria): the whole set written as the next criteria version — at the version the caller read
   (p_expected_version; a stale read → 409). A NAMED HUMAN's act (the weights are a value judgment): the package owner or the current
   value-judgment owner; the value owner named (an active human of the tenant). Each criterion measures a graph OBJ of the domain (an active
   objective). Returns the ranking before and after — the sensitivity the change shows. */
CREATE OR REPLACE FUNCTION decision.set_criteria(
  p_tenant uuid, p_domain uuid, p_package_id uuid, p_version int, p_criteria jsonb, p_value_owner uuid, p_rationale text, p_expected_version int, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, graph, identity, observation, public, pg_catalog, pg_temp AS $$
DECLARE pk decision.packages_current%ROWTYPE; v_cv int; v_owner uuid; v_c jsonb; v_keys text[] := ARRAY[]::text[]; v_obj uuid; v_before jsonb; v_after jsonb; v_objectives jsonb; v_in_pkg uuid[];
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.analysis.criteria']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM decision.dsa_assert_actor(p_actor, p_tenant, 'a weight — a value judgment —');
  pk := decision.dsa_package(p_tenant, p_domain, p_package_id, p_version, true);
  SELECT max(c.criteria_version) INTO v_cv FROM decision.analysis_criteria c WHERE c.package_id = p_package_id AND c.version = p_version;
  SELECT c.value_owner INTO v_owner FROM decision.analysis_criteria c WHERE c.package_id = p_package_id AND c.version = p_version AND c.criteria_version = v_cv LIMIT 1;
  IF p_actor IS DISTINCT FROM pk.owner_principal_id AND p_actor IS DISTINCT FROM v_owner THEN
    RAISE EXCEPTION 'analysis rejected (ownership): the criteria of package "%" are set by its owner or by the owner of the value judgment', pk.title USING ERRCODE = '42501';
  END IF;
  IF p_expected_version IS DISTINCT FROM v_cv THEN
    RAISE EXCEPTION 'analysis rejected (stale): the criteria were read at version % and stand at version % — read them again', coalesce(p_expected_version::text, 'none'), coalesce(v_cv::text, 'none') USING ERRCODE = '22023';
  END IF;
  IF p_value_owner IS NULL OR NOT EXISTS (SELECT 1 FROM identity.principals x WHERE x.id = p_value_owner AND x.kind = 'human' AND x.status = 'active' AND x.tenant_id = p_tenant) THEN
    RAISE EXCEPTION 'analysis rejected (value_owner): the weights are a value judgment owned by a named, active human of this tenant' USING ERRCODE = '22023';
  END IF;
  IF p_rationale IS NULL OR length(btrim(p_rationale)) < 16 THEN
    RAISE EXCEPTION 'analysis rejected (rationale): a weighting states why (at least 16 characters) — the value judgment is inspectable' USING ERRCODE = '22023';
  END IF;
  IF p_criteria IS NULL OR jsonb_typeof(p_criteria) <> 'array' OR jsonb_array_length(p_criteria) NOT BETWEEN 1 AND 12 THEN
    RAISE EXCEPTION 'analysis rejected (criteria): the criteria are a list of 1 to 12 {key, title, objectiveId, direction, weight, scale, unit}' USING ERRCODE = '22023';
  END IF;
  SELECT v.objectives INTO v_objectives FROM decision.package_versions v WHERE v.package_id = p_package_id AND v.version = p_version;
  v_in_pkg := ARRAY(SELECT (CASE WHEN jsonb_typeof(o) = 'string' THEN o #>> '{}' ELSE o ->> 'id' END)::uuid FROM jsonb_array_elements(coalesce(v_objectives, '[]'::jsonb)) o);
  FOR v_c IN SELECT e FROM jsonb_array_elements(p_criteria) e LOOP
    IF jsonb_typeof(v_c) <> 'object' OR coalesce(v_c ->> 'key', '') !~ '^[a-z][a-z0-9_-]{0,40}$' OR length(btrim(coalesce(v_c ->> 'title', ''))) NOT BETWEEN 2 AND 256 THEN
      RAISE EXCEPTION 'analysis rejected (criteria): each criterion has a key (lower-case, 1-41) and a title (2-256 characters)' USING ERRCODE = '22023';
    END IF;
    IF (v_c ->> 'key') = ANY (v_keys) THEN RAISE EXCEPTION 'analysis rejected (criteria): the criterion key % is named twice', v_c ->> 'key' USING ERRCODE = '22023'; END IF;
    v_keys := v_keys || (v_c ->> 'key');
    IF coalesce(v_c ->> 'direction', '') NOT IN ('max', 'min') THEN RAISE EXCEPTION 'analysis rejected (criteria): criterion % states its direction (max | min)', v_c ->> 'key' USING ERRCODE = '22023'; END IF;
    IF jsonb_typeof(v_c -> 'weight') IS DISTINCT FROM 'number' OR (v_c ->> 'weight')::numeric <= 0 OR (v_c ->> 'weight')::numeric > 1000 THEN
      RAISE EXCEPTION 'analysis rejected (weight): criterion % carries an exposed weight in (0, 1000] — a criterion that does not count is removed, not weighted zero', v_c ->> 'key' USING ERRCODE = '22023';
    END IF;
    IF coalesce(v_c ->> 'scale', '') NOT IN ('ratio', 'interval', 'ordinal') THEN RAISE EXCEPTION 'analysis rejected (criteria): criterion % states its scale (ratio | interval | ordinal)', v_c ->> 'key' USING ERRCODE = '22023'; END IF;
    IF length(btrim(coalesce(v_c ->> 'unit', ''))) NOT BETWEEN 1 AND 64 THEN RAISE EXCEPTION 'analysis rejected (criteria): criterion % names its unit', v_c ->> 'key' USING ERRCODE = '22023'; END IF;
    IF coalesce(v_c ->> 'objectiveId', v_c ->> 'objective_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'analysis rejected (criteria): criterion % names the objective it measures (objectiveId)', v_c ->> 'key' USING ERRCODE = '22023';
    END IF;
    v_obj := coalesce(v_c ->> 'objectiveId', v_c ->> 'objective_id')::uuid;
    IF NOT EXISTS (SELECT 1 FROM graph.strategy_current s WHERE s.strategy_object_id = v_obj AND s.tenant_id = p_tenant AND s.domain_id = p_domain AND s.object_type = 'OBJ' AND s.status = 'active') THEN
      RAISE EXCEPTION 'analysis rejected (unknown_objective): criterion % names %, which is not an active objective (OBJ) of this domain', v_c ->> 'key', v_obj USING ERRCODE = '23503';
    END IF;
  END LOOP;
  v_before := decision.dsa_scores(p_package_id, p_version, NULL);
  INSERT INTO decision.analysis_criteria (criterion_row_id, scope, tenant_id, domain_id, package_id, version, criteria_version, key, title, objective_id, direction, weight, scale, unit, value_owner, rationale, set_by, correlation_id)
  SELECT gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_package_id, p_version, coalesce(v_cv, 0) + 1, e ->> 'key', btrim(e ->> 'title'), coalesce(e ->> 'objectiveId', e ->> 'objective_id')::uuid,
         e ->> 'direction', (e ->> 'weight')::numeric, e ->> 'scale', btrim(e ->> 'unit'), p_value_owner, btrim(p_rationale), p_actor, p_correlation
    FROM jsonb_array_elements(p_criteria) e;
  v_after := decision.dsa_scores(p_package_id, p_version, NULL);
  RETURN jsonb_build_object('package_id', p_package_id, 'version', p_version, 'criteria_version', coalesce(v_cv, 0) + 1, 'previous_version', v_cv, 'value_owner', p_value_owner, 'set_by', p_actor,
    'criteria', (SELECT jsonb_agg(c || jsonb_build_object('in_package', (c ->> 'objective_id')::uuid = ANY (v_in_pkg))) FROM jsonb_array_elements(v_after -> 'criteria') c),
    'ranking_before', v_before -> 'ranking', 'ranking_after', v_after -> 'ranking', 'ranking_changed', (v_before -> 'ranking') IS DISTINCT FROM (v_after -> 'ranking'),
    'scores', (SELECT jsonb_object_agg(o ->> 'key', o -> 'score') FROM jsonb_array_elements(v_after -> 'options') o));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.set_criteria(uuid,uuid,uuid,int,jsonb,uuid,text,int,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.set_criteria(uuid,uuid,uuid,int,jsonb,uuid,text,int,uuid,uuid) TO eye_commit;

/* ASSESS AN OPTION on a criterion (decision.analysis.assess): COMPUTED — the port reads the value from the cited object: a run the option
   cites (completed, valid; its totals line_stop_days | days_below_safety_stock | total_cost, or a numeric of a method's summary), a forecast
   of the domain (a quantile), a value-of-information assessment of the package (expected_payoff: the governed weights × the option's
   payoffs), a portfolio review over the package's futures (robustness | regret | payoff:<branch_id>) — or ENTERED by a named human with
   its basis (at least 16 characters). An ordinal value is a whole number. */
CREATE OR REPLACE FUNCTION decision.assess_option(
  p_assessment_id uuid, p_tenant uuid, p_domain uuid, p_package_id uuid, p_version int, p_option_key text, p_criterion_key text, p_value numeric, p_cited jsonb, p_basis text, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, simulation, prediction, identity, observation, public, pg_catalog, pg_temp AS $$
DECLARE pk decision.packages_current%ROWTYPE; o decision.options%ROWTYPE; v_cv int; cr decision.analysis_criteria%ROWTYPE; v_kind text; v_id uuid; v_measure text; v_value numeric; v_basis text;
        r simulation.runs_current%ROWTYPE; f prediction.forecasts_current%ROWTYPE; va simulation.voi_assessments%ROWTYPE; rv prediction.portfolio_reviews%ROWTYPE; v_cited jsonb; v_raw text; v_out decision.option_assessments%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.analysis.assess']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM decision.dsa_assert_actor(p_actor, p_tenant, 'an assessment');
  pk := decision.dsa_package(p_tenant, p_domain, p_package_id, p_version, true);
  SELECT * INTO o FROM decision.options x WHERE x.package_id = p_package_id AND x.version = p_version AND x.key = p_option_key;
  IF NOT FOUND THEN RAISE EXCEPTION 'analysis rejected (unknown_option): % is not an option of package "%" version %', coalesce(p_option_key, '<none>'), pk.title, p_version USING ERRCODE = '23503'; END IF;
  SELECT max(c.criteria_version) INTO v_cv FROM decision.analysis_criteria c WHERE c.package_id = p_package_id AND c.version = p_version;
  SELECT * INTO cr FROM decision.analysis_criteria c WHERE c.package_id = p_package_id AND c.version = p_version AND c.criteria_version = v_cv AND c.key = p_criterion_key;
  IF NOT FOUND THEN RAISE EXCEPTION 'analysis rejected (unknown_criterion): % is not a criterion of the current set (version %) of package "%"', coalesce(p_criterion_key, '<none>'), coalesce(v_cv::text, 'none'), pk.title USING ERRCODE = '23503'; END IF;
  IF p_cited IS NOT NULL THEN
    IF p_value IS NOT NULL THEN RAISE EXCEPTION 'analysis rejected (basis): a computed value is read from the cited object by the server — it is not entered beside it' USING ERRCODE = '22023'; END IF;
    v_kind := p_cited ->> 'kind'; v_measure := btrim(coalesce(p_cited ->> 'measure', ''));
    IF jsonb_typeof(p_cited) <> 'object' OR coalesce(v_kind, '') NOT IN ('run', 'forecast', 'voi', 'portfolio_review')
       OR coalesce(p_cited ->> 'id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' OR v_measure = '' THEN
      RAISE EXCEPTION 'analysis rejected (cited): a computed value cites {kind: run | forecast | voi | portfolio_review, id, measure}' USING ERRCODE = '22023';
    END IF;
    v_id := (p_cited ->> 'id')::uuid;
    IF v_kind = 'run' THEN
      IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(o.consequences) c WHERE c ->> 'kind' = 'run' AND (c ->> 'id')::uuid = v_id) THEN
        RAISE EXCEPTION 'analysis rejected (cited): run % is not one option % cites — an option is assessed from its own consequences', v_id, p_option_key USING ERRCODE = '22023';
      END IF;
      SELECT * INTO r FROM simulation.runs_current x WHERE x.run_id = v_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
      IF NOT FOUND THEN RAISE EXCEPTION 'analysis rejected (unknown_run): % is not a simulation run of this domain', v_id USING ERRCODE = '23503'; END IF;
      IF r.state <> 'completed' OR r.validity = 'invalidated' THEN
        RAISE EXCEPTION 'analysis rejected (state): run % is % (validity %); only a completed, valid result is read into an assessment', v_id, r.state, r.validity USING ERRCODE = '22023';
      END IF;
      v_raw := CASE v_measure WHEN 'total_cost' THEN r.outputs #>> '{totals,cost,total}' ELSE r.outputs -> 'totals' ->> v_measure END;
      IF v_raw IS NULL AND jsonb_typeof(r.outputs -> 'summary' -> v_measure) = 'number' THEN v_raw := r.outputs -> 'summary' ->> v_measure; END IF;
      IF v_raw IS NULL OR v_raw !~ '^-?[0-9]+(\.[0-9]+)?$' THEN
        RAISE EXCEPTION 'analysis rejected (measure): run % carries no numeric % (supply-flow@1: line_stop_days, days_below_safety_stock, total_cost; a method run: a numeric of its summary)', v_id, v_measure USING ERRCODE = '22023';
      END IF;
      v_value := v_raw::numeric;
      v_cited := jsonb_build_object('kind', 'run', 'id', v_id, 'measure', v_measure, 'outputs_digest', r.outputs_digest, 'model_ref', r.model_ref);
      v_basis := format('computed: run %s (%s, outputs %s) %s = %s', v_id, r.model_ref, left(coalesce(r.outputs_digest, ''), 12), v_measure, v_value);
    ELSIF v_kind = 'forecast' THEN
      SELECT * INTO f FROM prediction.forecasts_current x WHERE x.forecast_id = v_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
      IF NOT FOUND THEN RAISE EXCEPTION 'analysis rejected (unknown_forecast): % is not a forecast of this domain', v_id USING ERRCODE = '23503'; END IF;
      IF f.state = 'withdrawn' THEN RAISE EXCEPTION 'analysis rejected (state): forecast % is withdrawn', v_id USING ERRCODE = '22023'; END IF;
      IF jsonb_typeof(f.quantiles -> v_measure) IS DISTINCT FROM 'number' THEN
        RAISE EXCEPTION 'analysis rejected (measure): forecast % carries no quantile % (it carries %)', v_id, v_measure, (SELECT string_agg(k, ', ' ORDER BY k) FROM jsonb_object_keys(f.quantiles) k) USING ERRCODE = '22023';
      END IF;
      v_value := (f.quantiles ->> v_measure)::numeric;
      v_cited := jsonb_build_object('kind', 'forecast', 'id', v_id, 'measure', v_measure, 'series_key', f.series_key, 'target_at', f.target_at);
      v_basis := format('computed: forecast %s of %s, quantile %s = %s (target %s)', v_id, f.series_key, v_measure, v_value, f.target_at);
    ELSIF v_kind = 'voi' THEN
      SELECT * INTO va FROM simulation.voi_assessments x WHERE x.assessment_id = v_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.package_id = p_package_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'analysis rejected (unknown_assessment): % is not a value-of-information assessment of package "%"', v_id, pk.title USING ERRCODE = '23503'; END IF;
      IF v_measure <> 'expected_payoff' THEN RAISE EXCEPTION 'analysis rejected (measure): a value-of-information assessment yields expected_payoff (the governed weights × the option''s payoffs)' USING ERRCODE = '22023'; END IF;
      IF jsonb_typeof(va.payoffs -> p_option_key) IS DISTINCT FROM 'object' THEN
        RAISE EXCEPTION 'analysis rejected (cited): assessment % weighs no payoffs for option %', v_id, p_option_key USING ERRCODE = '22023';
      END IF;
      SELECT round(sum((b ->> 'weight')::numeric * (va.payoffs -> p_option_key ->> (b ->> 'branch_id'))::numeric), 6) INTO v_value FROM jsonb_array_elements(va.branches) b;
      v_cited := jsonb_build_object('kind', 'voi', 'id', v_id, 'measure', v_measure, 'payoff_unit', va.payoff_unit);
      v_basis := format('computed: value-of-information assessment %s, expected payoff of %s over %s governed future(s) = %s %s', v_id, p_option_key, jsonb_array_length(va.branches), v_value, va.payoff_unit);
    ELSE
      SELECT * INTO rv FROM prediction.portfolio_reviews x WHERE x.review_id = v_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
      IF NOT FOUND THEN RAISE EXCEPTION 'analysis rejected (unknown_review): % is not a portfolio review of this domain', v_id USING ERRCODE = '23503'; END IF;
      IF NOT (rv.package_id IS NOT DISTINCT FROM p_package_id
              OR rv.set_id IN (SELECT b.set_id FROM decision.package_scenario_sets b WHERE b.package_id = p_package_id)
              OR rv.set_id IN (SELECT s.set_id FROM prediction.scenario_sets s WHERE s.package_id = p_package_id)) THEN
        RAISE EXCEPTION 'analysis rejected (cited): review % is not over the futures package "%" rests on (a set bound to it or serving it)', v_id, pk.title USING ERRCODE = '22023';
      END IF;
      IF v_measure IN ('robustness', 'regret') THEN
        v_raw := CASE v_measure WHEN 'robustness' THEN rv.robustness ->> p_option_key ELSE rv.regret ->> p_option_key END;
      ELSIF v_measure ~ '^payoff:[0-9a-f-]{36}$' THEN
        v_raw := rv.payoffs -> p_option_key ->> substr(v_measure, 8);
      ELSE
        RAISE EXCEPTION 'analysis rejected (measure): a portfolio review yields robustness, regret or payoff:<branch_id>' USING ERRCODE = '22023';
      END IF;
      IF v_raw IS NULL THEN RAISE EXCEPTION 'analysis rejected (cited): review % weighs no % for option %', v_id, v_measure, p_option_key USING ERRCODE = '22023'; END IF;
      v_value := v_raw::numeric;
      v_cited := jsonb_build_object('kind', 'portfolio_review', 'id', v_id, 'measure', v_measure, 'set_id', rv.set_id, 'set_version', rv.set_version, 'payoff_unit', rv.payoff_unit);
      v_basis := format('computed: portfolio review %s of set %s (v%s), %s of %s = %s %s', v_id, rv.set_id, rv.set_version, v_measure, p_option_key, v_value, rv.payoff_unit);
    END IF;
    IF NULLIF(btrim(coalesce(p_basis, '')), '') IS NOT NULL THEN v_basis := v_basis || ' — ' || btrim(p_basis); END IF;
  ELSE
    IF p_value IS NULL THEN RAISE EXCEPTION 'analysis rejected (value): an entered assessment states its value (or cites the object it is computed from)' USING ERRCODE = '22023'; END IF;
    IF p_basis IS NULL OR length(btrim(p_basis)) < 16 THEN
      RAISE EXCEPTION 'analysis rejected (basis): an entered value states its basis (at least 16 characters) — what it rests on' USING ERRCODE = '22023';
    END IF;
    v_value := p_value; v_basis := 'entered: ' || btrim(p_basis);
  END IF;
  IF cr.scale = 'ordinal' AND v_value <> trunc(v_value) THEN
    RAISE EXCEPTION 'analysis rejected (value): criterion % is ordinal; its value is a whole number (got %)', cr.key, v_value USING ERRCODE = '22023';
  END IF;
  INSERT INTO decision.option_assessments (assessment_id, scope, tenant_id, domain_id, package_id, version, option_key, criterion_key, value, basis_kind, cited, basis, assessed_by, correlation_id)
  VALUES (p_assessment_id, 'DOMAIN', p_tenant, p_domain, p_package_id, p_version, p_option_key, p_criterion_key, v_value, CASE WHEN p_cited IS NULL THEN 'entered' ELSE 'computed' END, v_cited, v_basis, p_actor, p_correlation)
  RETURNING * INTO v_out;
  RETURN (to_jsonb(v_out) - 'tenant_id' - 'domain_id' - 'scope' - 'correlation_id') || jsonb_build_object('criteria_version', v_cv, 'unit', cr.unit, 'direction', cr.direction);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.assess_option(uuid,uuid,uuid,uuid,int,text,text,numeric,jsonb,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.assess_option(uuid,uuid,uuid,uuid,int,text,text,numeric,jsonb,text,uuid,uuid) TO eye_commit;

/* DECLARE A CONSTRAINT OR A STAKEHOLDER OBLIGATION (decision.analysis.obligation): a named human's act — the package owner or the
   obligation's own owner. An obligation names its stakeholder (an STK of the graph when given); a constraint may. The test is DECLARATIVE:
   {kind: threshold, criterion, op: >= | <= | > | < | =, value} over the option's assessed value, or {kind: judgment} — its owner's. */
CREATE OR REPLACE FUNCTION decision.declare_obligation(
  p_obligation_id uuid, p_tenant uuid, p_domain uuid, p_package_id uuid, p_key text, p_kind text, p_stakeholder text, p_stakeholder_ref uuid, p_statement text, p_test jsonb, p_owner uuid,
  p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, graph, identity, observation, public, pg_catalog, pg_temp AS $$
DECLARE pk decision.packages_current%ROWTYPE; v_test jsonb; v_out decision.obligations%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.analysis.obligation']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM decision.dsa_assert_actor(p_actor, p_tenant, 'an obligation');
  pk := decision.dsa_package(p_tenant, p_domain, p_package_id, NULL, true);
  IF p_actor IS DISTINCT FROM pk.owner_principal_id AND p_actor IS DISTINCT FROM p_owner THEN
    RAISE EXCEPTION 'analysis rejected (ownership): an obligation of package "%" is declared by the package owner or by the obligation''s own owner', pk.title USING ERRCODE = '42501';
  END IF;
  IF coalesce(p_key, '') !~ '^[a-z][a-z0-9_-]{0,40}$' THEN RAISE EXCEPTION 'analysis rejected (key): an obligation has a key (lower-case, 1-41)' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM decision.obligations x WHERE x.package_id = p_package_id AND x.key = p_key) THEN
    RAISE EXCEPTION 'analysis rejected (duplicate): package "%" already declares the obligation %', pk.title, p_key USING ERRCODE = '22023';
  END IF;
  IF coalesce(p_kind, '') NOT IN ('constraint', 'obligation') THEN RAISE EXCEPTION 'analysis rejected (kind): a constraint or a stakeholder obligation (kind: constraint | obligation)' USING ERRCODE = '22023'; END IF;
  IF p_kind = 'obligation' AND length(btrim(coalesce(p_stakeholder, ''))) NOT BETWEEN 2 AND 256 THEN
    RAISE EXCEPTION 'analysis rejected (stakeholder): a stakeholder obligation names the stakeholder it is owed to' USING ERRCODE = '22023';
  END IF;
  IF p_stakeholder_ref IS NOT NULL AND NOT EXISTS (SELECT 1 FROM graph.strategy_current s WHERE s.strategy_object_id = p_stakeholder_ref AND s.tenant_id = p_tenant AND s.domain_id = p_domain AND s.object_type = 'STK' AND s.status = 'active') THEN
    RAISE EXCEPTION 'analysis rejected (unknown_stakeholder): % is not an active stakeholder (STK) of this domain', p_stakeholder_ref USING ERRCODE = '23503';
  END IF;
  IF length(btrim(coalesce(p_statement, ''))) NOT BETWEEN 8 AND 2000 THEN RAISE EXCEPTION 'analysis rejected (statement): the obligation states what is owed (8-2000 characters)' USING ERRCODE = '22023'; END IF;
  IF p_owner IS NULL OR NOT EXISTS (SELECT 1 FROM identity.principals x WHERE x.id = p_owner AND x.kind = 'human' AND x.status = 'active' AND x.tenant_id = p_tenant) THEN
    RAISE EXCEPTION 'analysis rejected (owner): an obligation is owned by a named, active human of this tenant' USING ERRCODE = '22023';
  END IF;
  IF p_test IS NULL OR jsonb_typeof(p_test) <> 'object' OR coalesce(p_test ->> 'kind', '') NOT IN ('threshold', 'judgment') THEN
    RAISE EXCEPTION 'analysis rejected (test): the test is {kind: threshold, criterion, op, value} or {kind: judgment}' USING ERRCODE = '22023';
  END IF;
  IF p_test ->> 'kind' = 'threshold' THEN
    IF coalesce(p_test ->> 'criterion', '') !~ '^[a-z][a-z0-9_-]{0,40}$' OR coalesce(p_test ->> 'op', '') NOT IN ('>=', '<=', '>', '<', '=') OR jsonb_typeof(p_test -> 'value') IS DISTINCT FROM 'number' THEN
      RAISE EXCEPTION 'analysis rejected (test): a threshold names the criterion, the comparison (>=, <=, >, <, =) and the value — a declarative rule, never an expression' USING ERRCODE = '22023';
    END IF;
    v_test := jsonb_build_object('kind', 'threshold', 'criterion', p_test ->> 'criterion', 'op', p_test ->> 'op', 'value', (p_test ->> 'value')::numeric);
  ELSE
    v_test := jsonb_build_object('kind', 'judgment');
  END IF;
  INSERT INTO decision.obligations (obligation_id, scope, tenant_id, domain_id, package_id, key, kind, stakeholder, stakeholder_ref, statement, test, owner_principal_id, declared_by, correlation_id)
  VALUES (p_obligation_id, 'DOMAIN', p_tenant, p_domain, p_package_id, p_key, p_kind, NULLIF(btrim(coalesce(p_stakeholder, '')), ''), p_stakeholder_ref, btrim(p_statement), v_test, p_owner, p_actor, p_correlation)
  RETURNING * INTO v_out;
  RETURN to_jsonb(v_out) - 'tenant_id' - 'domain_id' - 'scope' - 'correlation_id';
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.declare_obligation(uuid,uuid,uuid,uuid,text,text,text,uuid,text,jsonb,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.declare_obligation(uuid,uuid,uuid,uuid,text,text,text,uuid,text,jsonb,uuid,uuid,uuid) TO eye_commit;

/* EVALUATE THE OBLIGATIONS against every option of a version (decision.analysis.evaluate): each THRESHOLD obligation by its rule over the
   newest assessment of the option on the criterion of the CURRENT set (unknown — and why — when the criterion is not in the set or the
   option is not assessed on it); each JUDGMENT given [{obligation, option, result, basis}] recorded as its owner's (a named human; another's
   judgment → 403; a threshold obligation is not judged). The violated ones are named. */
CREATE OR REPLACE FUNCTION decision.evaluate_obligations(
  p_evaluation_id uuid, p_tenant uuid, p_domain uuid, p_package_id uuid, p_version int, p_judgments jsonb, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, identity, observation, public, pg_catalog, pg_temp AS $$
DECLARE pk decision.packages_current%ROWTYPE; v_cv int; ob decision.obligations%ROWTYPE; o record; j jsonb; a record; v_result text; v_basis jsonb; v_thr numeric; v_n int := 0;
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.analysis.evaluate']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM decision.dsa_assert_actor(p_actor, p_tenant, NULL);
  pk := decision.dsa_package(p_tenant, p_domain, p_package_id, p_version, true);
  IF NOT EXISTS (SELECT 1 FROM decision.obligations x WHERE x.package_id = p_package_id) THEN
    RAISE EXCEPTION 'analysis rejected (empty): package "%" declares no constraint or obligation to evaluate', pk.title USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM decision.options x WHERE x.package_id = p_package_id AND x.version = p_version) THEN
    RAISE EXCEPTION 'analysis rejected (empty): version % of package "%" has no option to evaluate', p_version, pk.title USING ERRCODE = '22023';
  END IF;
  IF p_judgments IS NOT NULL AND jsonb_typeof(p_judgments) <> 'array' THEN
    RAISE EXCEPTION 'analysis rejected (judgment): judgments are a list [{obligation, option, result, basis}]' USING ERRCODE = '22023';
  END IF;
  -- the judgments first (every one checked before anything is written)
  FOR j IN SELECT e FROM jsonb_array_elements(coalesce(p_judgments, '[]'::jsonb)) e LOOP
    SELECT * INTO ob FROM decision.obligations x WHERE x.package_id = p_package_id AND x.key = j ->> 'obligation';
    IF NOT FOUND THEN RAISE EXCEPTION 'analysis rejected (unknown_obligation): % is not an obligation of package "%"', coalesce(j ->> 'obligation', '<none>'), pk.title USING ERRCODE = '23503'; END IF;
    IF ob.test ->> 'kind' <> 'judgment' THEN
      RAISE EXCEPTION 'analysis rejected (judgment): obligation % is evaluated by its rule over the assessed values, not judged', ob.key USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM decision.options x WHERE x.package_id = p_package_id AND x.version = p_version AND x.key = j ->> 'option') THEN
      RAISE EXCEPTION 'analysis rejected (unknown_option): % is not an option of package "%" version %', coalesce(j ->> 'option', '<none>'), pk.title, p_version USING ERRCODE = '23503';
    END IF;
    IF p_actor IS DISTINCT FROM ob.owner_principal_id THEN
      RAISE EXCEPTION 'analysis rejected (ownership): obligation % is judged by its owner', ob.key USING ERRCODE = '42501';
    END IF;
    PERFORM decision.dsa_assert_actor(p_actor, p_tenant, 'a judgment of an obligation');
    IF coalesce(j ->> 'result', '') NOT IN ('satisfied', 'violated', 'unknown') OR length(btrim(coalesce(j ->> 'basis', ''))) < 16 THEN
      RAISE EXCEPTION 'analysis rejected (judgment): a judgment is satisfied, violated or unknown, with its basis (at least 16 characters)' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  SELECT max(c.criteria_version) INTO v_cv FROM decision.analysis_criteria c WHERE c.package_id = p_package_id AND c.version = p_version;
  FOR ob IN SELECT * FROM decision.obligations x WHERE x.package_id = p_package_id AND x.test ->> 'kind' = 'threshold' ORDER BY x.key LOOP
    v_thr := (ob.test ->> 'value')::numeric;
    FOR o IN SELECT x.key FROM decision.options x WHERE x.package_id = p_package_id AND x.version = p_version ORDER BY x.key LOOP
      IF NOT EXISTS (SELECT 1 FROM decision.analysis_criteria c WHERE c.package_id = p_package_id AND c.version = p_version AND c.criteria_version = v_cv AND c.key = ob.test ->> 'criterion') THEN
        v_result := 'unknown';
        v_basis := jsonb_build_object('method', 'rule', 'criterion', ob.test ->> 'criterion', 'op', ob.test ->> 'op', 'threshold', v_thr, 'criteria_version', v_cv,
                                      'reason', format('criterion %s is not in the current criteria set', ob.test ->> 'criterion'));
      ELSE
        SELECT x.assessment_id, x.value INTO a FROM decision.option_assessments x WHERE x.package_id = p_package_id AND x.version = p_version AND x.option_key = o.key AND x.criterion_key = ob.test ->> 'criterion'
         ORDER BY x.assessed_at DESC, x.assessment_id DESC LIMIT 1;
        IF a.assessment_id IS NULL THEN
          v_result := 'unknown';
          v_basis := jsonb_build_object('method', 'rule', 'criterion', ob.test ->> 'criterion', 'op', ob.test ->> 'op', 'threshold', v_thr, 'criteria_version', v_cv,
                                        'reason', format('option %s is not assessed on %s', o.key, ob.test ->> 'criterion'));
        ELSE
          v_result := CASE WHEN CASE ob.test ->> 'op' WHEN '>=' THEN a.value >= v_thr WHEN '<=' THEN a.value <= v_thr WHEN '>' THEN a.value > v_thr WHEN '<' THEN a.value < v_thr ELSE a.value = v_thr END
                           THEN 'satisfied' ELSE 'violated' END;
          v_basis := jsonb_build_object('method', 'rule', 'criterion', ob.test ->> 'criterion', 'op', ob.test ->> 'op', 'threshold', v_thr, 'value', a.value, 'assessment_id', a.assessment_id, 'criteria_version', v_cv);
        END IF;
      END IF;
      INSERT INTO decision.obligation_evaluations (evaluation_row_id, evaluation_id, scope, tenant_id, domain_id, obligation_id, package_id, version, option_key, result, basis, evaluated_by, correlation_id)
      VALUES (gen_random_uuid(), p_evaluation_id, 'DOMAIN', p_tenant, p_domain, ob.obligation_id, p_package_id, p_version, o.key, v_result, v_basis, p_actor, p_correlation);
      v_n := v_n + 1;
    END LOOP;
  END LOOP;
  FOR j IN SELECT e FROM jsonb_array_elements(coalesce(p_judgments, '[]'::jsonb)) e LOOP
    SELECT * INTO ob FROM decision.obligations x WHERE x.package_id = p_package_id AND x.key = j ->> 'obligation';
    INSERT INTO decision.obligation_evaluations (evaluation_row_id, evaluation_id, scope, tenant_id, domain_id, obligation_id, package_id, version, option_key, result, basis, evaluated_by, correlation_id)
    VALUES (gen_random_uuid(), p_evaluation_id, 'DOMAIN', p_tenant, p_domain, ob.obligation_id, p_package_id, p_version, j ->> 'option', j ->> 'result',
            jsonb_build_object('method', 'judgment', 'statement', btrim(j ->> 'basis'), 'judged_by', p_actor), p_actor, p_correlation);
    v_n := v_n + 1;
  END LOOP;
  RETURN jsonb_build_object('evaluation_id', p_evaluation_id, 'package_id', p_package_id, 'version', p_version, 'recorded', v_n, 'criteria_version', v_cv,
    'results', (SELECT coalesce(jsonb_agg(jsonb_build_object('obligation', ob2.key, 'kind', ob2.kind, 'stakeholder', ob2.stakeholder, 'option', e.option_key, 'result', e.result, 'basis', e.basis) ORDER BY ob2.key, e.option_key), '[]'::jsonb)
                  FROM decision.obligation_evaluations e JOIN decision.obligations ob2 ON ob2.obligation_id = e.obligation_id WHERE e.evaluation_id = p_evaluation_id),
    'violated', (SELECT coalesce(jsonb_agg(jsonb_build_object('obligation', ob2.key, 'option', e.option_key, 'statement', ob2.statement, 'stakeholder', ob2.stakeholder) ORDER BY ob2.key, e.option_key), '[]'::jsonb)
                   FROM decision.obligation_evaluations e JOIN decision.obligations ob2 ON ob2.obligation_id = e.obligation_id WHERE e.evaluation_id = p_evaluation_id AND e.result = 'violated'));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.evaluate_obligations(uuid,uuid,uuid,uuid,int,jsonb,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.evaluate_obligations(uuid,uuid,uuid,uuid,int,jsonb,uuid,uuid) TO eye_commit;

/* GENERATE OPTION CANDIDATES (decision.analysis.generate; the Decision Agent may — a draft the owner reads): six DECLARED rules over the
   package's own records, each candidate naming its rule and the facts it read; a candidate whose key is already an option of the version is
   not generated (named under skipped). decision.options is never written here.
     defer@1 — unless the newest value-of-information assessment says ACT, deferring to the decision deadline is a viable alternative;
     acquire_information@1 — the newest value-of-information assessment says WAIT: acquire the information first (EVSI, net, days);
     pilot@1 — an intervention neither simulated nor assessed (newest per criterion) from a computed record, and not itself a generated
               posture: pilot it at a limited scale first;
     stage@1 — the leading intervention's ranking is fragile (a weight within 25% flips it) or an obligation is unknown for it: commit a
               first tranche, decide the rest at a checkpoint;
     hedge@1 — the portfolio review over the package's futures names a most robust option that is not the leader: keep it beside the leader;
     exit@1 — a prior commitment on the same decision object stands (exit it), or every intervention violates an obligation. */
CREATE OR REPLACE FUNCTION decision.generate_options(p_generation_id uuid, p_tenant uuid, p_domain uuid, p_package_id uuid, p_version int, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, simulation, prediction, observation, public, pg_catalog, pg_temp AS $$
DECLARE pk decision.packages_current%ROWTYPE; v_choice jsonb; s jsonb; sens jsonb; v_leader text; v_leader_o decision.options%ROWTYPE; va simulation.voi_assessments%ROWTYPE; rv prediction.portfolio_reviews%ROWTYPE;
        prior decision.packages_current%ROWTYPE; v_cands jsonb := '[]'::jsonb; v_skipped jsonb := '[]'::jsonb; c jsonb; o record; v_fragile jsonb; v_unknown int; v_obl jsonb; v_all_violate boolean; v_key text; v_title text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.analysis.generate']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM decision.dsa_assert_actor(p_actor, p_tenant, NULL);
  pk := decision.dsa_package(p_tenant, p_domain, p_package_id, p_version, true);
  SELECT v.choice INTO v_choice FROM decision.package_versions v WHERE v.package_id = p_package_id AND v.version = p_version;
  s := decision.dsa_scores(p_package_id, p_version, NULL);
  sens := decision.dsa_sensitivity(s);
  v_leader := s -> 'ranking' ->> 0;
  IF v_leader IS NOT NULL THEN SELECT * INTO v_leader_o FROM decision.options x WHERE x.package_id = p_package_id AND x.version = p_version AND x.key = v_leader; END IF;
  SELECT * INTO va FROM simulation.voi_assessments x WHERE x.package_id = p_package_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain ORDER BY x.recorded_at DESC, x.assessment_id DESC LIMIT 1;
  rv := decision.dsa_review_of(p_package_id);
  SELECT * INTO prior FROM decision.packages_current x WHERE x.decision_object_id = pk.decision_object_id AND x.package_id <> p_package_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain
     AND x.state IN ('committed', 'monitoring') ORDER BY x.decided_at DESC LIMIT 1;
  v_obl := decision.dsa_obligation_state(p_package_id, p_version);
  -- defer@1
  IF va.assessment_id IS NULL OR va.recommendation = 'wait' THEN
    v_cands := v_cands || jsonb_build_object('posture', 'defer', 'key', 'defer', 'title', 'Defer the decision' || coalesce(' to ' || (v_choice ->> 'decision_deadline'), ''), 'rule', 'defer@1',
      'rationale', CASE WHEN va.assessment_id IS NULL THEN 'no value-of-information assessment shows that acting now beats waiting; deferring keeps every option open until the decision deadline'
                        ELSE format('the value-of-information assessment says waiting %s day(s) for "%s" is worth %s %s net', va.information ->> 'delay_days', va.information ->> 'label', va.net_value, va.payoff_unit) END,
      'basis', jsonb_build_object('voi_assessment', va.assessment_id, 'voi_recommendation', va.recommendation, 'decision_deadline', v_choice ->> 'decision_deadline'));
  END IF;
  -- acquire_information@1
  IF va.assessment_id IS NOT NULL AND va.recommendation = 'wait' THEN
    v_cands := v_cands || jsonb_build_object('posture', 'acquire_information', 'key', 'acquire-information', 'title', left(format('Acquire "%s" before deciding', va.information ->> 'label'), 256), 'rule', 'acquire_information@1',
      'rationale', format('the information is worth %s %s (EVSI; EVPI %s) against a delay cost of %s over %s day(s): net %s', va.evsi, va.payoff_unit, va.evpi, va.delay_cost, va.information ->> 'delay_days', va.net_value),
      'basis', jsonb_build_object('voi_assessment', va.assessment_id, 'evpi', va.evpi, 'evsi', va.evsi, 'delay_cost', va.delay_cost, 'net_value', va.net_value, 'delay_days', va.information -> 'delay_days', 'information', va.information ->> 'label'));
  END IF;
  -- pilot@1
  FOR o IN SELECT x.key, x.title FROM decision.options x WHERE x.package_id = p_package_id AND x.version = p_version AND x.kind = 'intervention' AND NOT x.simulated
             AND NOT EXISTS (SELECT 1 FROM (SELECT DISTINCT ON (a.criterion_key) a.basis_kind FROM decision.option_assessments a WHERE a.package_id = p_package_id AND a.version = p_version AND a.option_key = x.key
                                            ORDER BY a.criterion_key, a.assessed_at DESC, a.assessment_id DESC) z WHERE z.basis_kind = 'computed')
             AND NOT EXISTS (SELECT 1 FROM decision.option_candidates oc WHERE oc.package_id = p_package_id AND oc.key = x.key) ORDER BY x.key LOOP
    v_cands := v_cands || jsonb_build_object('posture', 'pilot', 'key', left('pilot-' || o.key, 41), 'title', left(format('Pilot "%s" at a limited scale', o.title), 256), 'rule', 'pilot@1',
      'rationale', format('option %s is neither simulated nor assessed from a computed record: a pilot measures it before the full commitment', o.key),
      'basis', jsonb_build_object('option', o.key, 'simulated', false, 'computed_assessments', 0));
  END LOOP;
  -- stage@1
  IF v_leader IS NOT NULL AND v_leader_o.kind = 'intervention' THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object('criterion', x ->> 'key', 'flip', coalesce(x -> 'flip_up', x -> 'flip_down'))), '[]'::jsonb) INTO v_fragile
      FROM jsonb_array_elements(sens -> 'criteria') x
     WHERE (x -> 'flip_up' IS NOT NULL AND jsonb_typeof(x -> 'flip_up') = 'object' AND abs((x -> 'flip_up' ->> 'change_pct')::numeric) <= 25)
        OR (x -> 'flip_down' IS NOT NULL AND jsonb_typeof(x -> 'flip_down') = 'object' AND abs((x -> 'flip_down' ->> 'change_pct')::numeric) <= 25);
    SELECT count(*) INTO v_unknown FROM jsonb_array_elements(v_obl) ob WHERE ob -> 'evaluations' -> v_leader ->> 'result' = 'unknown';
    IF jsonb_array_length(v_fragile) > 0 OR v_unknown > 0 THEN
      v_cands := v_cands || jsonb_build_object('posture', 'stage', 'key', left('stage-' || v_leader, 41), 'title', left(format('Stage "%s": commit a first tranche, decide the rest at a checkpoint', v_leader_o.title), 256), 'rule', 'stage@1',
        'rationale', CASE WHEN jsonb_array_length(v_fragile) > 0 THEN format('the lead of %s is fragile: a weight change of 25%% or less on %s flips it', v_leader, (SELECT string_agg(f ->> 'criterion', ', ') FROM jsonb_array_elements(v_fragile) f))
                          ELSE format('%s obligation(s) are unknown for %s: staging commits what is known to hold', v_unknown, v_leader) END,
        'basis', jsonb_build_object('leader', v_leader, 'fragile', v_fragile, 'unknown_obligations', v_unknown));
    END IF;
  END IF;
  -- hedge@1
  IF rv.review_id IS NOT NULL AND v_leader IS NOT NULL AND NOT (rv.most_robust @> ARRAY[v_leader]) AND cardinality(rv.most_robust) > 0 THEN
    v_cands := v_cands || jsonb_build_object('posture', 'hedge', 'key', 'hedge', 'title', left(format('Hedge: keep "%s" (the most robust across the futures) beside "%s"', rv.most_robust[1], v_leader), 256), 'rule', 'hedge@1',
      'rationale', format('the portfolio review of %s names %s most robust (worst payoff %s %s) while the criteria rank %s first', rv.reviewed_at::date, array_to_string(rv.most_robust, ', '), rv.robustness ->> rv.most_robust[1], rv.payoff_unit, v_leader),
      'basis', jsonb_build_object('review_id', rv.review_id, 'set_id', rv.set_id, 'most_robust', rv.most_robust, 'least_regret', rv.least_regret, 'leader', v_leader));
  END IF;
  -- exit@1
  SELECT count(*) > 0 AND bool_and(EXISTS (SELECT 1 FROM jsonb_array_elements(v_obl) ob WHERE ob -> 'evaluations' -> x.key ->> 'result' = 'violated')) INTO v_all_violate
    FROM decision.options x WHERE x.package_id = p_package_id AND x.version = p_version AND x.kind = 'intervention';
  IF prior.package_id IS NOT NULL OR coalesce(v_all_violate, false) THEN
    v_cands := v_cands || jsonb_build_object('posture', 'exit', 'key', 'exit',
      'title', left(CASE WHEN prior.package_id IS NOT NULL THEN format('Exit the prior commitment "%s"', prior.title) ELSE 'Exit: leave the course every intervention breaches' END, 256), 'rule', 'exit@1',
      'rationale', CASE WHEN prior.package_id IS NOT NULL THEN format('package "%s" committed on the same decision object (%s, version %s) stands; exiting it is an alternative', prior.title, prior.decided_at::date, prior.committed_version)
                        ELSE 'every intervention violates a declared constraint or obligation' END,
      'basis', jsonb_build_object('prior_package', prior.package_id, 'prior_state', prior.state, 'all_interventions_violate', coalesce(v_all_violate, false)));
  END IF;
  FOR c IN SELECT x FROM jsonb_array_elements(v_cands) x LOOP
    v_key := c ->> 'key';
    IF EXISTS (SELECT 1 FROM decision.options x WHERE x.package_id = p_package_id AND x.version = p_version AND x.key = v_key) THEN
      v_skipped := v_skipped || jsonb_build_object('key', v_key, 'posture', c ->> 'posture', 'reason', 'already an option of this version');
      CONTINUE;
    END IF;
    INSERT INTO decision.option_candidates (candidate_id, generation_id, scope, tenant_id, domain_id, package_id, version, posture, key, title, rationale, rule, basis, generated_by, correlation_id)
    VALUES (gen_random_uuid(), p_generation_id, 'DOMAIN', p_tenant, p_domain, p_package_id, p_version, c ->> 'posture', v_key, c ->> 'title', c ->> 'rationale', c ->> 'rule', c -> 'basis', p_actor, p_correlation);
  END LOOP;
  RETURN jsonb_build_object('generation_id', p_generation_id, 'package_id', p_package_id, 'version', p_version, 'generated_by', p_actor, 'leader', v_leader,
    'candidates', (SELECT coalesce(jsonb_agg(to_jsonb(x) - 'tenant_id' - 'domain_id' - 'scope' - 'correlation_id' ORDER BY x.posture, x.key), '[]'::jsonb) FROM decision.option_candidates x WHERE x.generation_id = p_generation_id),
    'skipped', v_skipped, 'note', 'candidates are drafts: the owner adopts one by setting an option with its key through the option route; generation writes no option');
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.generate_options(uuid,uuid,uuid,uuid,int,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.generate_options(uuid,uuid,uuid,uuid,int,uuid,uuid) TO eye_commit;

/* ASSEMBLE THE PACKAGE'S INPUTS (decision.analysis.assemble; the Decision Agent may): the forecasts (cited by an option; the forecast a
   scenario found is built on), the scenarios (members of the sets bound to or serving the package; the scenarios of the cited runs; a
   scenario whose impact falls on the package's objective), the sets, the risks and opportunities (the exposures the package responds to,
   those another package on the same decision responds to, an RSK resting on the package's objective or decision object), the PRIOR
   DECISIONS on the same decision object, the cited runs (with their validity), the value-of-information assessments — each with WHY. */
CREATE OR REPLACE FUNCTION decision.assemble_package(p_assembly_id uuid, p_tenant uuid, p_domain uuid, p_package_id uuid, p_version int, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, simulation, prediction, graph, observation, public, pg_catalog, pg_temp AS $$
DECLARE pk decision.packages_current%ROWTYPE; v_items jsonb; v_counts jsonb; v_out decision.package_assemblies%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.analysis.assemble']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM decision.dsa_assert_actor(p_actor, p_tenant, NULL);
  pk := decision.dsa_package(p_tenant, p_domain, p_package_id, p_version, true);
  WITH runs AS (SELECT DISTINCT o.key AS option_key, (c ->> 'id')::uuid AS run_id FROM decision.options o CROSS JOIN LATERAL jsonb_array_elements(o.consequences) c
                 WHERE o.package_id = p_package_id AND o.version = p_version AND c ->> 'kind' = 'run'),
       fcs AS (SELECT DISTINCT o.key AS option_key, (c ->> 'id')::uuid AS forecast_id FROM decision.options o CROSS JOIN LATERAL jsonb_array_elements(o.consequences) c
                 WHERE o.package_id = p_package_id AND o.version = p_version AND c ->> 'kind' = 'forecast'),
       objs AS (SELECT (CASE WHEN jsonb_typeof(x) = 'string' THEN x #>> '{}' ELSE x ->> 'id' END)::uuid AS objective_id
                  FROM decision.package_versions pv CROSS JOIN LATERAL jsonb_array_elements(pv.objectives) x WHERE pv.package_id = p_package_id AND pv.version = p_version),
       scn AS (SELECT * FROM decision.dsa_package_scenarios(p_package_id, p_version)),
       items AS (
         SELECT 'scenario'::text AS kind, sc.scenario_id AS id, NULL::bigint AS version, sc.title, sc.state, scn.why
           FROM scn JOIN prediction.scenarios_current sc ON sc.scenario_id = scn.scenario_id
         UNION ALL
         SELECT 'scenario', sc.scenario_id, NULL, sc.title, sc.state, format('its impact "%s" falls on the objective "%s"', e.name, g.title)
           FROM prediction.scenario_elements e JOIN objs ON objs.objective_id::text = e.attributes -> 'on' ->> 'id'
           JOIN prediction.scenarios_current sc ON sc.scenario_id = e.scenario_id JOIN graph.strategy_current g ON g.strategy_object_id = objs.objective_id
          WHERE e.kind = 'impact' AND e.state = 'active' AND e.tenant_id = p_tenant AND e.domain_id = p_domain
         UNION ALL
         SELECT 'scenario_set', s.set_id, s.version, s.title, s.state, 'bound to the package (its plurality gates the proposal)'
           FROM decision.package_scenario_sets b JOIN prediction.scenario_sets s ON s.set_id = b.set_id WHERE b.package_id = p_package_id
         UNION ALL
         SELECT 'scenario_set', s.set_id, s.version, s.title, s.state, 'the set names the package as the decision it serves'
           FROM prediction.scenario_sets s WHERE s.package_id = p_package_id
         UNION ALL
         SELECT 'forecast', f.forecast_id, NULL, f.series_key || ' → ' || f.target_at, f.state, format('option %s cites it', fcs.option_key)
           FROM fcs JOIN prediction.forecasts_current f ON f.forecast_id = fcs.forecast_id
         UNION ALL
         SELECT 'forecast', f.forecast_id, NULL, f.series_key || ' → ' || f.target_at, f.state, format('the forecast scenario "%s" is built on', sc.title)
           FROM scn JOIN prediction.scenarios_current sc ON sc.scenario_id = scn.scenario_id JOIN prediction.forecasts_current f ON f.forecast_id = sc.forecast_id
         UNION ALL
         SELECT CASE x.polarity WHEN 'risk' THEN 'risk' ELSE 'opportunity' END, x.exposure_id, x.current_version::bigint, g.title, x.state, format('the package responds to it (%s)', r.response_kind)
           FROM prediction.exposure_responses r JOIN prediction.exposure_current x ON x.exposure_id = r.exposure_id JOIN graph.strategy_current g ON g.strategy_object_id = x.exposure_id
          WHERE r.package_id = p_package_id
         UNION ALL
         SELECT CASE x.polarity WHEN 'risk' THEN 'risk' ELSE 'opportunity' END, x.exposure_id, x.current_version::bigint, g.title, x.state, format('another package on the same decision responds to it (%s)', r.response_kind)
           FROM prediction.exposure_responses r JOIN prediction.exposure_current x ON x.exposure_id = r.exposure_id JOIN graph.strategy_current g ON g.strategy_object_id = x.exposure_id
          WHERE r.decision_object_id = pk.decision_object_id AND r.package_id <> p_package_id
         UNION ALL
         SELECT 'risk', g.strategy_object_id, g.object_version, g.title, g.status, format('it rests on the %s "%s"', CASE WHEN d.depends_on_id = pk.decision_object_id THEN 'decision object' ELSE 'objective' END, t.title)
           FROM graph.dependencies d JOIN graph.strategy_current g ON g.strategy_object_id = d.dependent_object_id AND g.object_type = 'RSK'
           JOIN graph.strategy_current t ON t.strategy_object_id = d.depends_on_id
          WHERE d.state = 'active' AND d.depends_on_kind = 'strategy' AND d.tenant_id = p_tenant AND d.domain_id = p_domain
            AND (d.depends_on_id = pk.decision_object_id OR d.depends_on_id IN (SELECT objective_id FROM objs))
         UNION ALL
         SELECT 'prior_decision', x.package_id, x.committed_version::bigint, x.title, x.state, format('decided on the same decision object "%s" (%s)', g.title, x.state)
           FROM decision.packages_current x JOIN graph.strategy_current g ON g.strategy_object_id = x.decision_object_id
          WHERE x.decision_object_id = pk.decision_object_id AND x.package_id <> p_package_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain
         UNION ALL
         SELECT 'run', r.run_id, NULL, r.model_ref || ' ' || r.run_kind, r.state || '/' || r.validity, format('option %s cites it', runs.option_key)
           FROM runs JOIN simulation.runs_current r ON r.run_id = runs.run_id
         UNION ALL
         SELECT 'value_of_information', v.assessment_id, v.package_version::bigint, v.information ->> 'label', v.recommendation, format('a value-of-information assessment of the package (net %s %s)', v.net_value, v.payoff_unit)
           FROM simulation.voi_assessments v WHERE v.package_id = p_package_id)
  SELECT coalesce(jsonb_agg(jsonb_build_object('kind', g.kind, 'id', g.id, 'version', g.version, 'title', g.title, 'state', g.state, 'why', g.whys) ORDER BY g.kind, g.title, g.id), '[]'::jsonb),
         coalesce((SELECT jsonb_object_agg(k.kind, k.n) FROM (SELECT kind, count(DISTINCT id) AS n FROM items GROUP BY kind) k), '{}'::jsonb)
    INTO v_items, v_counts
    FROM (SELECT kind, id, max(version) AS version, max(title) AS title, max(state) AS state, jsonb_agg(DISTINCT why) AS whys FROM items GROUP BY kind, id) g;
  INSERT INTO decision.package_assemblies (assembly_id, scope, tenant_id, domain_id, package_id, version, items, counts, assembled_by, correlation_id)
  VALUES (p_assembly_id, 'DOMAIN', p_tenant, p_domain, p_package_id, p_version, v_items, coalesce(v_counts, '{}'::jsonb), p_actor, p_correlation)
  RETURNING * INTO v_out;
  RETURN (to_jsonb(v_out) - 'tenant_id' - 'domain_id' - 'scope' - 'correlation_id') || jsonb_build_object('note', 'found, not cited: the owner accepts an item into the package''s citations through the existing routes');
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.assemble_package(uuid,uuid,uuid,uuid,int,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.assemble_package(uuid,uuid,uuid,uuid,int,uuid,uuid) TO eye_commit;

/* ASSESS AN ADVERSARIAL RESPONSE (decision.analysis.adversarial; V01-T-016): a named human models how a named ACTOR of a scenario the
   package rests on (prediction.scenario_elements kind actor, active, agency high | medium — an actor of low agency cannot change the course
   and is refused, as is an element that is not an actor) would respond to an option: the declared response model [{criterion, op: add |
   multiply | set, value}] applied to the option's assessed values (the option assessed on every criterion), the analysis re-scored with
   only that option's values changed; the score, the rank under the response and the rank change recorded. Nothing is evaluated as code. */
CREATE OR REPLACE FUNCTION decision.assess_adversarial_response(
  p_assessment_id uuid, p_tenant uuid, p_domain uuid, p_package_id uuid, p_version int, p_option_key text, p_actor_element_id uuid, p_response text, p_effects jsonb, p_basis text, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, prediction, observation, public, pg_catalog, pg_temp AS $$
DECLARE pk decision.packages_current%ROWTYPE; e prediction.scenario_elements%ROWTYPE; v_base jsonb; v_under jsonb; v_opt jsonb; v_vals jsonb; v_new jsonb; x jsonb; v_cur numeric; v_val numeric; v_crit_keys text[];
        v_base_rank int; v_resp_rank int; v_resp jsonb; v_out decision.adversarial_assessments%ROWTYPE; v_why text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.analysis.adversarial']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM decision.dsa_assert_actor(p_actor, p_tenant, 'an adversarial response model');
  pk := decision.dsa_package(p_tenant, p_domain, p_package_id, p_version, true);
  IF NOT EXISTS (SELECT 1 FROM decision.options x2 WHERE x2.package_id = p_package_id AND x2.version = p_version AND x2.key = p_option_key) THEN
    RAISE EXCEPTION 'analysis rejected (unknown_option): % is not an option of package "%" version %', coalesce(p_option_key, '<none>'), pk.title, p_version USING ERRCODE = '23503';
  END IF;
  SELECT * INTO e FROM prediction.scenario_elements x2 WHERE x2.element_id = p_actor_element_id AND x2.tenant_id = p_tenant AND x2.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'analysis rejected (unknown_actor): % is not a scenario element of this domain', p_actor_element_id USING ERRCODE = '23503'; END IF;
  IF e.kind <> 'actor' THEN
    RAISE EXCEPTION 'analysis rejected (agency): "%" is a % of the scenario, not an actor — only an actor responds', e.name, e.kind USING ERRCODE = '22023';
  END IF;
  IF e.state <> 'active' THEN RAISE EXCEPTION 'analysis rejected (state): actor "%" is retired (%)', e.name, e.retirement_reason USING ERRCODE = '22023'; END IF;
  IF coalesce(e.attributes ->> 'agency', '') NOT IN ('high', 'medium') THEN
    RAISE EXCEPTION 'analysis rejected (agency): actor "%" has % agency — it cannot change the course; a response is modelled for an actor with agency (high | medium)', e.name, coalesce(e.attributes ->> 'agency', 'no') USING ERRCODE = '22023';
  END IF;
  SELECT s.why INTO v_why FROM decision.dsa_package_scenarios(p_package_id, p_version) s WHERE s.scenario_id = e.scenario_id LIMIT 1;
  IF v_why IS NULL THEN
    RAISE EXCEPTION 'analysis rejected (scenario): actor "%" belongs to a scenario package "%" does not rest on (bind its set to the package, or cite a run on its branch)', e.name, pk.title USING ERRCODE = '22023';
  END IF;
  IF length(btrim(coalesce(p_response, ''))) NOT BETWEEN 8 AND 2000 THEN RAISE EXCEPTION 'analysis rejected (response): the actor''s response is stated (8-2000 characters)' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_basis, ''))) < 16 THEN RAISE EXCEPTION 'analysis rejected (basis): the response model states its basis (at least 16 characters)' USING ERRCODE = '22023'; END IF;
  v_base := decision.dsa_scores(p_package_id, p_version, NULL);
  v_crit_keys := ARRAY(SELECT c ->> 'key' FROM jsonb_array_elements(v_base -> 'criteria') c);
  SELECT o INTO v_opt FROM jsonb_array_elements(v_base -> 'options') o WHERE o ->> 'key' = p_option_key;
  IF jsonb_typeof(v_opt -> 'rank') IS DISTINCT FROM 'number' THEN
    RAISE EXCEPTION 'analysis rejected (incomplete): option % is not assessed on every criterion (missing %) — a response changes an assessed result', p_option_key, coalesce(v_opt ->> 'missing', 'all') USING ERRCODE = '22023';
  END IF;
  IF p_effects IS NULL OR jsonb_typeof(p_effects) <> 'array' OR jsonb_array_length(p_effects) NOT BETWEEN 1 AND 12 THEN
    RAISE EXCEPTION 'analysis rejected (effects): the response model is a list of 1 to 12 {criterion, op: add | multiply | set, value}' USING ERRCODE = '22023';
  END IF;
  v_vals := v_opt -> 'values'; v_new := v_vals;
  FOR x IN SELECT y FROM jsonb_array_elements(p_effects) y LOOP
    IF jsonb_typeof(x) <> 'object' OR coalesce(x ->> 'op', '') NOT IN ('add', 'multiply', 'set') OR jsonb_typeof(x -> 'value') IS DISTINCT FROM 'number' THEN
      RAISE EXCEPTION 'analysis rejected (effects): each effect is {criterion, op: add | multiply | set, value} — a declared change, never an expression' USING ERRCODE = '22023';
    END IF;
    IF NOT ((x ->> 'criterion') = ANY (v_crit_keys)) THEN
      RAISE EXCEPTION 'analysis rejected (unknown_criterion): % is not a criterion of the current set', coalesce(x ->> 'criterion', '<none>') USING ERRCODE = '23503';
    END IF;
    v_cur := (v_new ->> (x ->> 'criterion'))::numeric; v_val := (x ->> 'value')::numeric;
    v_new := jsonb_set(v_new, ARRAY[x ->> 'criterion'], to_jsonb(round(CASE x ->> 'op' WHEN 'add' THEN v_cur + v_val WHEN 'multiply' THEN v_cur * v_val ELSE v_val END, 6)));
  END LOOP;
  v_under := decision.dsa_scores(p_package_id, p_version, jsonb_build_object(p_option_key, v_new));
  SELECT o INTO v_resp FROM jsonb_array_elements(v_under -> 'options') o WHERE o ->> 'key' = p_option_key;
  v_base_rank := (v_opt ->> 'rank')::int; v_resp_rank := (v_resp ->> 'rank')::int;
  INSERT INTO decision.adversarial_assessments (assessment_id, scope, tenant_id, domain_id, package_id, version, option_key, actor_element_id, actor_element_version, actor_name, actor_agency, scenario_id,
                                                response, effects, basis, criteria_version, base_values, response_values, base_score, base_rank, response_score, response_rank, rank_change,
                                                ranking_before, ranking_under_response, assessed_by, correlation_id)
  VALUES (p_assessment_id, 'DOMAIN', p_tenant, p_domain, p_package_id, p_version, p_option_key, e.element_id, e.version, e.name, e.attributes ->> 'agency', e.scenario_id,
          btrim(p_response), p_effects, btrim(p_basis), (v_base ->> 'criteria_version')::int, v_vals, v_new, (v_opt ->> 'score')::numeric, v_base_rank, (v_resp ->> 'score')::numeric, v_resp_rank, v_base_rank - v_resp_rank,
          v_base -> 'ranking', v_under -> 'ranking', p_actor, p_correlation)
  RETURNING * INTO v_out;
  RETURN (to_jsonb(v_out) - 'tenant_id' - 'domain_id' - 'scope' - 'correlation_id') || jsonb_build_object('scenario_why', v_why, 'leader_before', v_base -> 'ranking' ->> 0, 'leader_under_response', v_under -> 'ranking' ->> 0);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.assess_adversarial_response(uuid,uuid,uuid,uuid,int,text,uuid,text,jsonb,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.assess_adversarial_response(uuid,uuid,uuid,uuid,int,text,uuid,text,jsonb,text,uuid,uuid) TO eye_commit;

-- §A.5 THE READ (an invoker read under the caller's RLS) ───────────────────────────
/* THE PACKAGE ANALYSIS of a version (the current one when NULL): the criteria and their history (every set's weights, owner, rationale);
   the assessment matrix (the newest cell, its basis); the server's scores and ranking; the WEIGHT SENSITIVITY; the TRADE-OFFS (dominance,
   what the leader gives up); the obligations evaluated per option and the violated ones named; the VALUE OF INFORMATION of the package
   (simulation.voi_assessments); the VALIDATED second-order effects of the cited runs (the newest derivation of a completed, valid run whose
   outputs it was derived over); REVERSIBILITY AND OPTION VALUE across futures (the newest portfolio review's robustness and regret per
   option, the reversibility stated, the option value — the newest assessment's net value of waiting); the adversarial rank changes; the
   newest generation of candidates (with their adoption); the newest assembly. NULL when the package is not visible. */
CREATE OR REPLACE FUNCTION decision.package_analysis(p_package_id uuid, p_version int) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = decision, simulation, prediction, graph, pg_catalog, pg_temp AS $$
DECLARE pk decision.packages_current%ROWTYPE; v int; pv decision.package_versions%ROWTYPE; s jsonb; rv prediction.portfolio_reviews%ROWTYPE; v_voi jsonb; v_obl jsonb; v_newest_voi simulation.voi_assessments%ROWTYPE;
BEGIN
  SELECT * INTO pk FROM decision.packages_current x WHERE x.package_id = p_package_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  v := coalesce(p_version, pk.current_version);
  SELECT * INTO pv FROM decision.package_versions x WHERE x.package_id = p_package_id AND x.version = v;
  IF NOT FOUND THEN RETURN NULL; END IF;
  s := decision.dsa_scores(p_package_id, v, NULL);
  rv := decision.dsa_review_of(p_package_id);
  v_obl := decision.dsa_obligation_state(p_package_id, v);
  SELECT * INTO v_newest_voi FROM simulation.voi_assessments x WHERE x.package_id = p_package_id ORDER BY x.recorded_at DESC, x.assessment_id DESC LIMIT 1;
  SELECT coalesce(jsonb_agg(jsonb_build_object('assessment_id', x.assessment_id, 'package_version', x.package_version, 'scenario_id', x.scenario_id, 'source', x.source, 'review_id', x.review_id,
           'information', x.information ->> 'label', 'delay_days', x.information -> 'delay_days', 'evpi', x.evpi, 'evsi', x.evsi, 'delay_cost', x.delay_cost, 'net_value', x.net_value,
           'payoff_unit', x.payoff_unit, 'prior_best', x.prior_best, 'recommendation', x.recommendation, 'recorded_by', x.recorded_by, 'recorded_at', x.recorded_at) ORDER BY x.recorded_at DESC), '[]'::jsonb)
    INTO v_voi FROM simulation.voi_assessments x WHERE x.package_id = p_package_id;
  RETURN jsonb_build_object(
    'package', jsonb_build_object('package_id', pk.package_id, 'title', pk.title, 'state', pk.state, 'owner', pk.owner_principal_id, 'decision_object_id', pk.decision_object_id,
                                  'current_version', pk.current_version, 'synthetic_state', pk.synthetic_state),
    'version', jsonb_build_object('version', pv.version, 'state', pv.state, 'objectives', pv.objectives, 'reversibility', pv.reversibility, 'information_value', pv.information_value, 'choice', pv.choice),
    'criteria_version', s -> 'criteria_version',
    'criteria', s -> 'criteria',
    'criteria_history', coalesce((SELECT jsonb_agg(h ORDER BY (h ->> 'criteria_version')::int DESC) FROM (
        SELECT jsonb_build_object('criteria_version', c.criteria_version, 'set_by', min(c.set_by::text), 'set_at', min(c.set_at), 'value_owner', min(c.value_owner::text), 'rationale', min(c.rationale),
                                  'weights', jsonb_object_agg(c.key, c.weight)) AS h
          FROM decision.analysis_criteria c WHERE c.package_id = p_package_id AND c.version = v GROUP BY c.criteria_version) hh), '[]'::jsonb),
    'assessments', coalesce((SELECT jsonb_agg(jsonb_build_object('option', a.option_key, 'criterion', a.criterion_key, 'value', a.value, 'basis_kind', a.basis_kind, 'cited', a.cited, 'basis', a.basis,
                                                                 'assessed_by', a.assessed_by, 'assessed_at', a.assessed_at, 'assessment_id', a.assessment_id) ORDER BY a.option_key, a.criterion_key)
                               FROM (SELECT DISTINCT ON (x.option_key, x.criterion_key) x.* FROM decision.option_assessments x WHERE x.package_id = p_package_id AND x.version = v
                                      ORDER BY x.option_key, x.criterion_key, x.assessed_at DESC, x.assessment_id DESC) a), '[]'::jsonb),
    'options', s -> 'options',
    'ranking', s -> 'ranking',
    'method', s -> 'method',
    'sensitivity', decision.dsa_sensitivity(s),
    'tradeoffs', decision.dsa_tradeoffs(s),
    'obligations', v_obl,
    'violations', coalesce((SELECT jsonb_agg(jsonb_build_object('obligation', ob ->> 'key', 'kind', ob ->> 'kind', 'stakeholder', ob ->> 'stakeholder', 'statement', ob ->> 'statement', 'option', ev.key) ORDER BY ob ->> 'key', ev.key)
                              FROM jsonb_array_elements(v_obl) ob CROSS JOIN LATERAL jsonb_each(ob -> 'evaluations') ev WHERE ev.value ->> 'result' = 'violated'), '[]'::jsonb),
    'value_of_information', v_voi,
    'second_order', coalesce((SELECT jsonb_agg(jsonb_build_object('option', cr.option_key, 'run_id', cr.run_id, 'run_state', r.state, 'validity', r.validity,
          'validated', (r.state = 'completed' AND r.validity = 'valid' AND d.run_outputs_digest IS NOT DISTINCT FROM r.outputs_digest AND d.derivation_id IS NOT NULL),
          'derivation_id', d.derivation_id, 'derived_at', d.derived_at,
          'effects', CASE WHEN r.state = 'completed' AND r.validity = 'valid' AND d.run_outputs_digest IS NOT DISTINCT FROM r.outputs_digest THEN
                       (SELECT coalesce(jsonb_agg(jsonb_build_object('depth', se.depth, 'entity', se.entity_label, 'metric', se.metric, 'unit', se.unit, 'values', se."values", 'timing', se.timing) ORDER BY se.depth, se.entity_label), '[]'::jsonb)
                          FROM simulation.second_order_effects se WHERE se.derivation_id = d.derivation_id) ELSE '[]'::jsonb END,
          'reason', CASE WHEN d.derivation_id IS NULL THEN 'no second-order derivation of this run' WHEN r.validity <> 'valid' THEN 'the run is invalidated: its effects are not used'
                         WHEN d.run_outputs_digest IS DISTINCT FROM r.outputs_digest THEN 'derived over other outputs' ELSE NULL END) ORDER BY cr.option_key, cr.run_id)
        FROM (SELECT DISTINCT o.key AS option_key, (c ->> 'id')::uuid AS run_id FROM decision.options o CROSS JOIN LATERAL jsonb_array_elements(o.consequences) c
               WHERE o.package_id = p_package_id AND o.version = v AND c ->> 'kind' = 'run') cr
        JOIN simulation.runs_current r ON r.run_id = cr.run_id
        LEFT JOIN LATERAL (SELECT se.derivation_id, se.run_outputs_digest, se.derived_at FROM simulation.second_order_effects se WHERE se.run_id = cr.run_id ORDER BY se.derived_at DESC, se.derivation_id DESC LIMIT 1) d ON true), '[]'::jsonb),
    'futures', jsonb_build_object(
        'review', CASE WHEN rv.review_id IS NULL THEN NULL ELSE jsonb_build_object('review_id', rv.review_id, 'set_id', rv.set_id, 'set_version', rv.set_version, 'reviewer', rv.reviewer, 'reviewed_at', rv.reviewed_at,
                                                                                  'payoff_unit', rv.payoff_unit, 'most_robust', rv.most_robust, 'least_regret', rv.least_regret, 'branches', jsonb_array_length(rv.branches)) END,
        'options', coalesce((SELECT jsonb_agg(jsonb_build_object('key', o.key, 'title', o.title, 'kind', o.kind, 'reversibility', o.reversibility,
                                      'robustness', CASE WHEN rv.review_id IS NULL THEN NULL ELSE rv.robustness -> o.key END, 'regret', CASE WHEN rv.review_id IS NULL THEN NULL ELSE rv.regret -> o.key END,
                                      'most_robust', rv.review_id IS NOT NULL AND rv.most_robust @> ARRAY[o.key], 'least_regret', rv.review_id IS NOT NULL AND rv.least_regret @> ARRAY[o.key]) ORDER BY o.key)
                               FROM decision.options o WHERE o.package_id = p_package_id AND o.version = v), '[]'::jsonb),
        'reversibility', pv.reversibility,
        'option_value', CASE WHEN v_newest_voi.assessment_id IS NULL THEN NULL ELSE jsonb_build_object('assessment_id', v_newest_voi.assessment_id, 'net_value_of_waiting', v_newest_voi.net_value,
                                     'evsi', v_newest_voi.evsi, 'evpi', v_newest_voi.evpi, 'delay_cost', v_newest_voi.delay_cost, 'recommendation', v_newest_voi.recommendation, 'payoff_unit', v_newest_voi.payoff_unit,
                                     'information', v_newest_voi.information ->> 'label') END,
        'note', 'robustness = the worst payoff across the reviewed futures, regret = the largest shortfall against the best option per future; option value = the net value of waiting for the information'),
    'adversarial', coalesce((SELECT jsonb_agg(jsonb_build_object('assessment_id', a.assessment_id, 'option', a.option_key, 'actor', a.actor_name, 'actor_element_id', a.actor_element_id, 'agency', a.actor_agency,
          'scenario_id', a.scenario_id, 'response', a.response, 'effects', a.effects, 'basis', a.basis, 'base_score', a.base_score, 'base_rank', a.base_rank, 'response_score', a.response_score,
          'response_rank', a.response_rank, 'rank_change', a.rank_change, 'ranking_under_response', a.ranking_under_response, 'criteria_version', a.criteria_version, 'assessed_by', a.assessed_by, 'assessed_at', a.assessed_at) ORDER BY a.assessed_at DESC)
        FROM decision.adversarial_assessments a WHERE a.package_id = p_package_id AND a.version = v), '[]'::jsonb),
    'candidates', coalesce((SELECT jsonb_agg(to_jsonb(c) - 'tenant_id' - 'domain_id' - 'scope' - 'correlation_id' ORDER BY c.posture, c.key)
        FROM decision.option_candidates c WHERE c.package_id = p_package_id AND c.version = v
         AND c.generation_id = (SELECT x.generation_id FROM decision.option_candidates x WHERE x.package_id = p_package_id AND x.version = v ORDER BY x.generated_at DESC, x.candidate_id DESC LIMIT 1)), '[]'::jsonb),
    'assembly', (SELECT to_jsonb(a) - 'tenant_id' - 'domain_id' - 'scope' - 'correlation_id' FROM decision.package_assemblies a WHERE a.package_id = p_package_id AND a.version = v ORDER BY a.assembled_at DESC LIMIT 1),
    'computed_at', clock_timestamp());
END $$;
GRANT EXECUTE ON FUNCTION decision.package_analysis(uuid, int) TO eye_app, eye_commit;
