-- 0101 — CP-6 B35 (2026-10-01): DECISION ANALYSIS, RECOMMENDATION, EXPLANATION AND APPEAL, REOPEN AND REPLAY — F-P6-01 (option analysis:
-- criteria with exposed weights and sensitivity, constraints and obligations evaluated per option, trade-offs and value of information as
-- computed products, option generation, the package assembled from its inputs), F-P6-02 (the recommendation as a distinct explained object,
-- its review comparing AI and human recommendations, accept-for-consideration, the human-led incomplete-package mode), F-P6-03 (the governed
-- explanation object, its faithfulness check, contest and appeal cases), F-P6-06 (reopen re-versioning the scenario, outcome assessment
-- separating observed result, inferred contribution, counterfactual and changed conditions, decision metrics, replay initiator and reason);
-- and the "B35:" pieces of F-P4-08, F-P4-09, F-P5-06 and F-P5-07.
--
-- One migration in five sections: the prelude (§0) written first by the integrator, the four parts built and proven on their own in parallel
-- worktrees (harnesses phase6-{analysis,recommendation,explanation,reopen}-b35), then combined here in the apply order (§0, then the part files
-- alphabetically: §A analysis, §E explanation, §P reopen, §R recommendation). Forward-only; 0001–0100 untouched. The decision ledger's exact
-- event lists (decision.package_events, pinned by phase6-decisions, -approvals, -briefings, -replay and interfaces-b18) are NOT widened:
-- each part keeps its own ledger. The interface register stays 50/0/0.

-- ═════════════════════════════════════════════════════════════════════
-- section `prelude`
-- ═════════════════════════════════════════════════════════════════════
-- §0.1 THE ATTENTION CLASSES AND SUBJECT KINDS (0099 §0.2's lists whole, plus B35's): decision.recommendation (a recommendation awaiting
-- review → the package owner and the reviewers), decision.appeal (a contest or appeal case opened, its deadline near or passed → the
-- adjudicator), decision.reversion (a reopened decision's scenario to re-version → its owner), decision.review_due (a scenario set's or a
-- decision's review cadence missed → its owner). Subject kinds: recommendation, appeal_case, outcome_assessment.
CREATE OR REPLACE FUNCTION executive.attention_signal_classes() RETURNS text[]
LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY['forecast.unfit', 'scenario.incoherent', 'warning.raised', 'source.coverage_loss', 'proposal.review', 'decision.material_change', 'review.convened',
  -- B34 (0090)
  'opportunity.raised', 'health.change', 'commitment.due', 'commitment.breach',
  -- B36 (0094)
  'plan.variance', 'publication.correction', 'strategy.detection', 'queue.governance',
  -- B90 (0095)
  'product.degradation', 'subscription.lag', 'metric.certification', 'catalog.coverage',
  -- B27 (0097)
  'scenario.suspension', 'scenario.set_gap', 'scenario.quality', 'scenario.signpost', 'scenario.proposal',
  -- B31 (0099)
  'simulation.budget', 'simulation.experiment', 'simulation.validity', 'simulation.value_of_information',
  -- B35 (0101)
  'decision.recommendation', 'decision.appeal', 'decision.reversion', 'decision.review_due'] $$;
ALTER TABLE executive.attention_items DROP CONSTRAINT IF EXISTS attention_items_signal_class_check;
ALTER TABLE executive.attention_items ADD CONSTRAINT attention_items_signal_class_check CHECK (signal_class IN (
  'forecast.unfit', 'scenario.incoherent', 'warning.raised', 'source.coverage_loss', 'proposal.review', 'decision.material_change', 'review.convened',
  'opportunity.raised', 'health.change', 'commitment.due', 'commitment.breach',
  'plan.variance', 'publication.correction', 'strategy.detection', 'queue.governance',
  'product.degradation', 'subscription.lag', 'metric.certification', 'catalog.coverage',
  'scenario.suspension', 'scenario.set_gap', 'scenario.quality', 'scenario.signpost', 'scenario.proposal',
  'simulation.budget', 'simulation.experiment', 'simulation.validity', 'simulation.value_of_information',
  'decision.recommendation', 'decision.appeal', 'decision.reversion', 'decision.review_due'));
ALTER TABLE executive.attention_items DROP CONSTRAINT IF EXISTS attention_items_subject_kind_check;
ALTER TABLE executive.attention_items ADD CONSTRAINT attention_items_subject_kind_check CHECK (subject_kind IN (
  'forecast', 'scenario', 'warning', 'source', 'claim', 'package', 'review',
  'exposure', 'health_change', 'commitment_item',
  'plan', 'publication', 'strategy_object', 'queue',
  'product', 'subscription', 'metric', 'asset',
  'branch', 'scenario_set',
  -- B31 (0099)
  'run', 'experiment',
  -- B35 (0101)
  'recommendation', 'appeal_case', 'outcome_assessment'));

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

-- ═════════════════════════════════════════════════════════════════════
-- section `explanation` (§E) — CP-6 B35 part `explanation` (2026-10-01): F-P6-03 COMPLETED (V00-T-027; V5 AI-04-001..004, AI-63-005,
-- AI-64-002..004, AI-ADR-014, AI-C046, AI-C047, AG-040, AR-019, V05-T-005, V05-T-022 (App. L); V10-T-007/-008).
--
--   §E.1 THE TABLES   decision.explanations (the GOVERNED EXPLANATION OBJECT, App. L: generated by the server from the subject's preserved
--                     state — a package version, an option, a forecast, a run, a recommendation (§R, via to_regclass) or an analysis (§A, via
--                     to_regprocedure); its items SEPARATED by category (source evidence, deterministic transformation, model inference, agent
--                     judgment, human assessment); counter-evidence, competing hypotheses, likelihood vs impact, confidence vs evidence quality;
--                     digest-bound to the state it explains — append-only, a newer state is a newer explanation version),
--                     decision.explanation_renderings (a natural-language rendering by a human or the Explainability Agent's stand-in — the
--                     decision agent, which RENDERS ONLY — admitted only through the FAITHFULNESS CHECK v1; withdrawn as unfaithful by an
--                     upheld appeal), decision.appeal_cases (CONTEST AND APPEAL: standing, scope, grounds, evidence, deadline, an adjudicator
--                     who is neither the appellant nor the subject's owner, adjudication upheld | dismissed | partly upheld with the correction
--                     and the impact, notification (decision.appeal items), closure; the appeal of a DECIDED package records reopen_required —
--                     §P's reopen consumes it), decision.appeal_events (the case's own ledger).
--   §E.2 RLS, GRANTS, APPEND-ONLY, THE GUARDS (the 0094 decision-schema loop idiom).
--   §E.3 THE PRIVATE HELPERS (the digest, the item, the subject, the builders per subject kind, the finalizer, the faithfulness check v1).
--   §E.4 THE PORTS (SECURITY DEFINER; the bound action asserted, the scope asserted, the acting principal recorded).
--   §E.5 THE READS (invoker reads under the caller's RLS): the explanation, the unified surface of a subject, the case, the cases.
--
-- decision.package_events is NOT touched (its exact lists are pinned); this part keeps its own ledger. No interface row, no role, no
-- outbox event. Refusals: `explanation rejected (<class>): …`, `appeal rejected (<class>): …`.
-- ═════════════════════════════════════════════════════════════════════

-- §E.1 THE TABLES ─────────────────────────────────────────────────────

/* The item vocabulary (v1): every item carries an id (I<n>), ONE category of the five, a role, a reference, a statement and whether it is
   material. The CHECK refuses a row whose items are not separated by category. */
CREATE OR REPLACE FUNCTION decision.dse_categories() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY['source_evidence', 'deterministic_transformation', 'model_inference', 'agent_judgment', 'human_assessment'] $$;
CREATE OR REPLACE FUNCTION decision.dse_roles() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY['conclusion', 'support', 'counter_evidence', 'competing_hypothesis', 'limitation', 'assumption', 'policy', 'dissent', 'effect', 'counterfactual', 'sensitivity', 'uncertainty'] $$;
GRANT EXECUTE ON FUNCTION decision.dse_categories() TO eye_app, eye_commit;
GRANT EXECUTE ON FUNCTION decision.dse_roles() TO eye_app, eye_commit;

CREATE OR REPLACE FUNCTION decision.dse_items_ok(p jsonb) RETURNS boolean
IMMUTABLE SET search_path = decision, pg_catalog, pg_temp AS $$
DECLARE i jsonb; n int := 0;
BEGIN
  IF p IS NULL OR jsonb_typeof(p) <> 'array' OR jsonb_array_length(p) < 1 THEN RETURN false; END IF;
  FOR i IN SELECT * FROM jsonb_array_elements(p) LOOP
    n := n + 1;
    IF jsonb_typeof(i) <> 'object' THEN RETURN false; END IF;
    IF (i ->> 'id') IS DISTINCT FROM ('I' || n) THEN RETURN false; END IF;
    IF NOT ((i ->> 'category') = ANY (decision.dse_categories())) THEN RETURN false; END IF;
    IF NOT ((i ->> 'role') = ANY (decision.dse_roles())) THEN RETURN false; END IF;
    IF jsonb_typeof(i -> 'material') <> 'boolean' OR length(coalesce(i ->> 'statement', '')) < 2 OR jsonb_typeof(i -> 'ref') <> 'object' THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
END $$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION decision.dse_items_ok(jsonb) TO eye_app, eye_commit;

CREATE TABLE decision.explanations (
  explanation_id        uuid PRIMARY KEY,
  scope                 text NOT NULL,
  tenant_id             uuid NOT NULL,
  domain_id             uuid NOT NULL,
  subject_kind          text NOT NULL CHECK (subject_kind IN ('package_version', 'recommendation', 'analysis', 'forecast', 'run', 'option')),
  subject_id            uuid NOT NULL,
  subject_version       int CHECK (subject_version IS NULL OR subject_version >= 1),
  explanation_version   int NOT NULL CHECK (explanation_version >= 1),
  supersedes            uuid REFERENCES decision.explanations (explanation_id),
  /* the digest of the subject's PRESERVED STATE the explanation was generated from (decision.dse_subject) — a later digest makes it stale */
  subject_digest        text NOT NULL CHECK (subject_digest ~ '^[0-9a-f]{64}$'),
  subject_title         text NOT NULL CHECK (length(btrim(subject_title)) BETWEEN 1 AND 512),
  generator             text NOT NULL CHECK (generator ~ '^[a-z][a-z0-9-]*@[0-9]+$'),
  conclusion            jsonb NOT NULL CHECK (jsonb_typeof(conclusion) = 'object'),
  items                 jsonb NOT NULL CHECK (decision.dse_items_ok(items)),
  counter_evidence      jsonb NOT NULL CHECK (jsonb_typeof(counter_evidence) = 'array'),
  competing_hypotheses  jsonb NOT NULL CHECK (jsonb_typeof(competing_hypotheses) = 'array'),
  limitations           jsonb NOT NULL CHECK (jsonb_typeof(limitations) = 'array'),
  /* likelihood vs impact, confidence vs evidence quality, disagreement — separate fields, never merged */
  uncertainty           jsonb NOT NULL CHECK (jsonb_typeof(uncertainty) = 'object' AND uncertainty ?& ARRAY['likelihood', 'impact', 'confidence', 'evidence_quality', 'disagreement']),
  /* the App. L contract: every field present, or contractually inapplicable with its reason, or missing with its reason */
  contract              jsonb NOT NULL CHECK (jsonb_typeof(contract) = 'object'),
  faithfulness_state    text NOT NULL CHECK (faithfulness_state IN ('complete', 'partial')),
  integrity_digest      text NOT NULL CHECK (integrity_digest ~ '^[0-9a-f]{64}$'),
  generated_by          uuid NOT NULL,
  generated_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id        uuid NOT NULL,
  CONSTRAINT dse_xpl_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE UNIQUE INDEX dse_xpl_version ON decision.explanations (tenant_id, domain_id, subject_kind, subject_id, coalesce(subject_version, 0), explanation_version);
CREATE INDEX dse_xpl_subject ON decision.explanations (subject_kind, subject_id, subject_version, generated_at);
CREATE TRIGGER dse_xpl_append_only BEFORE UPDATE OR DELETE ON decision.explanations FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE decision.explanations IS 'B35 (0101 §E; F-P6-03, App. L, AI-04-001..004, AI-63-005, AI-ADR-014): the GOVERNED EXPLANATION OBJECT, generated by the server (decision.generate_explanation, generator dse-explain@1) from the subject''s preserved state — never free text. Items separated by category; counter-evidence, competing hypotheses, likelihood vs impact, confidence vs evidence quality; the integrity digest binds it to the subject''s state (subject_digest). Append-only: a moved subject is explained again as a new version; the old one reads stale/superseded.';

CREATE TABLE decision.explanation_renderings (
  rendering_id           uuid PRIMARY KEY,
  scope                  text NOT NULL,
  tenant_id              uuid NOT NULL,
  domain_id              uuid NOT NULL,
  explanation_id         uuid NOT NULL REFERENCES decision.explanations (explanation_id),
  audience               jsonb NOT NULL CHECK (jsonb_typeof(audience) = 'object'),
  sentences              jsonb NOT NULL CHECK (jsonb_typeof(sentences) = 'array' AND jsonb_array_length(sentences) BETWEEN 1 AND 40),
  renderer_principal_id  uuid NOT NULL,
  renderer_kind          text NOT NULL CHECK (renderer_kind IN ('human', 'agent')),
  faithfulness           text NOT NULL CHECK (faithfulness IN ('faithful', 'unfaithful')),
  check_result           jsonb NOT NULL CHECK (jsonb_typeof(check_result) = 'object'),
  explanation_digest     text NOT NULL CHECK (explanation_digest ~ '^[0-9a-f]{64}$'),
  state                  text NOT NULL DEFAULT 'standing' CHECK (state IN ('standing', 'withdrawn')),
  withdrawn_at           timestamptz,
  withdrawn_by           uuid,
  withdrawal             jsonb,
  rendered_at            timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id         uuid NOT NULL,
  CONSTRAINT dse_rnd_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT dse_rnd_withdrawn_bound CHECK ((state = 'withdrawn') = (withdrawn_at IS NOT NULL) AND (withdrawn_at IS NULL) = (withdrawn_by IS NULL) AND (withdrawn_at IS NULL) = (withdrawal IS NULL)),
  CONSTRAINT dse_rnd_standing_faithful CHECK (state = 'withdrawn' OR faithfulness = 'faithful')
);
CREATE INDEX dse_rnd_explanation ON decision.explanation_renderings (explanation_id, rendered_at);
COMMENT ON TABLE decision.explanation_renderings IS 'B35 (0101 §E; AI-04-004, AI-64-004, AG-040, AR-019): a natural-language rendering of an explanation for an audience, by a named human or the decision agent (the Explainability Agent''s stand-in: it renders only). Admitted only when the FAITHFULNESS CHECK v1 passes (every sentence cites items, no figure outside the cited items, no hidden cognition, no false certainty, every material caveat cited); WITHDRAWN as unfaithful by an upheld appeal on it (the authoritative structured explanation stands). Changes once, by the withdrawal.';

CREATE TABLE decision.appeal_cases (
  case_id                  uuid PRIMARY KEY,
  scope                    text NOT NULL,
  tenant_id                uuid NOT NULL,
  domain_id                uuid NOT NULL,
  subject_kind             text NOT NULL CHECK (subject_kind IN ('package', 'forecast', 'source', 'claim', 'recommendation', 'explanation')),
  subject_id               uuid NOT NULL,
  subject_version          int CHECK (subject_version IS NULL OR subject_version >= 1),
  subject_title            text NOT NULL,
  /* the subject's owners at opening: the adjudicator is none of them */
  subject_owners           uuid[] NOT NULL DEFAULT '{}',
  subject_state_at_open    text NOT NULL,
  subject_digest_at_open   text NOT NULL CHECK (subject_digest_at_open ~ '^[0-9a-f]{64}$'),
  /* a DECIDED package (or a subject of one): an upheld appeal records reopen_required */
  decided                  boolean NOT NULL,
  package_id               uuid,
  explanation_id           uuid REFERENCES decision.explanations (explanation_id),
  appellant_principal_id   uuid NOT NULL,
  standing                 jsonb NOT NULL CHECK (jsonb_typeof(standing) = 'object' AND standing ? 'rule' AND standing ? 'basis'),
  contest_scope            jsonb NOT NULL CHECK (jsonb_typeof(contest_scope) = 'object' AND contest_scope ? 'statement'),
  grounds                  text NOT NULL CHECK (length(btrim(grounds)) BETWEEN 16 AND 4000),
  evidence                 jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(evidence) = 'array'),
  deadline_at              timestamptz NOT NULL,
  state                    text NOT NULL CHECK (state IN ('opened', 'under_review', 'adjudicated', 'closed')),
  adjudicator_principal_id uuid,
  assigned_by              uuid,
  assigned_at              timestamptz,
  outcome                  text CHECK (outcome IS NULL OR outcome IN ('upheld', 'dismissed', 'partly_upheld')),
  rationale                text,
  correction               text,
  impact                   jsonb,
  effect                   jsonb,
  adjudicated_at           timestamptz,
  closure                  text CHECK (closure IS NULL OR closure IN ('resolved', 'withdrawn')),
  closed_by                uuid,
  closed_at                timestamptz,
  closure_note             text,
  overdue_flagged_at       timestamptz,
  opened_at                timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id           uuid NOT NULL,
  CONSTRAINT dse_apl_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT dse_apl_assigned_bound CHECK ((adjudicator_principal_id IS NULL) = (assigned_at IS NULL) AND (assigned_at IS NULL) = (assigned_by IS NULL)),
  CONSTRAINT dse_apl_adjudicated_bound CHECK ((adjudicated_at IS NULL) = (outcome IS NULL) AND (outcome IS NULL) = (rationale IS NULL) AND (outcome IS NULL) = (impact IS NULL) AND (outcome IS NULL) = (effect IS NULL)
                                             AND (adjudicated_at IS NULL OR adjudicator_principal_id IS NOT NULL)
                                             AND (outcome IS NULL OR outcome = 'dismissed' OR correction IS NOT NULL)),
  CONSTRAINT dse_apl_closed_bound CHECK ((state = 'closed') = (closed_at IS NOT NULL) AND (closed_at IS NULL) = (closed_by IS NULL) AND (closed_at IS NULL) = (closure IS NULL)
                                         AND (closure IS DISTINCT FROM 'resolved' OR adjudicated_at IS NOT NULL)),
  CONSTRAINT dse_apl_state_bound CHECK ((state = 'opened' AND adjudicator_principal_id IS NULL AND outcome IS NULL)
                                        OR (state = 'under_review' AND adjudicator_principal_id IS NOT NULL AND outcome IS NULL)
                                        OR (state = 'adjudicated' AND outcome IS NOT NULL)
                                        OR state = 'closed'),
  CONSTRAINT dse_apl_separation CHECK (adjudicator_principal_id IS NULL OR (adjudicator_principal_id <> appellant_principal_id AND NOT (adjudicator_principal_id = ANY (subject_owners))))
);
CREATE INDEX dse_apl_subject ON decision.appeal_cases (subject_kind, subject_id, opened_at);
CREATE INDEX dse_apl_open ON decision.appeal_cases (tenant_id, domain_id, state, deadline_at);
COMMENT ON TABLE decision.appeal_cases IS 'B35 (0101 §E; AI-64-002/-003, AI-C047, V10-T-007): a CONTEST or APPEAL case — standing (rule v1), scope, grounds, evidence, a response deadline, an adjudicator who is neither the appellant nor the subject''s owner, adjudication (upheld | dismissed | partly_upheld) with the correction and the impact, notification (decision.appeal items and appeal.notified events), closure (resolved | withdrawn). The original record is never altered: an upheld appeal of a DECIDED package records effect reopen_required (§P''s reopen consumes it); of a forecast, a source or a claim correction_required through its owning layer; of an explanation''s rendering, the rendering withdrawn. Current-state row: its lifecycle columns change along the transitions only (dse_apl_guard); never deleted.';

CREATE TABLE decision.appeal_events (
  event_id            uuid PRIMARY KEY,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  case_id             uuid NOT NULL REFERENCES decision.appeal_cases (case_id),
  event               text NOT NULL CHECK (event IN ('appeal.opened', 'appeal.assigned', 'appeal.adjudicated', 'appeal.closed', 'appeal.overdue', 'appeal.notified')),
  actor_principal_id  uuid NOT NULL,
  details             jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id      uuid NOT NULL,
  CONSTRAINT dse_ape_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX dse_ape_case ON decision.appeal_events (case_id, occurred_at);
CREATE TRIGGER dse_ape_append_only BEFORE UPDATE OR DELETE ON decision.appeal_events FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE decision.appeal_events IS 'B35 (0101 §E): the appeal case''s own ledger (opened, assigned, adjudicated, closed, overdue, notified — one notified row per recipient, the cause of its attention item). decision.package_events is never written by this part.';

-- §E.2 RLS, GRANTS, APPEND-ONLY, THE GUARDS ───────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['explanations', 'explanation_renderings', 'appeal_cases', 'appeal_events'] LOOP
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

/* A rendering changes ONCE: standing → withdrawn (faithfulness → unfaithful), nothing else; never deleted. */
CREATE OR REPLACE FUNCTION decision.dse_rendering_guard() RETURNS trigger
SET search_path = decision, pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'explanation renderings are kept: DELETE prohibited' USING ERRCODE = '2F002'; END IF;
  IF OLD.state <> 'standing' OR NEW.state <> 'withdrawn' OR NEW.faithfulness <> 'unfaithful'
     OR (to_jsonb(NEW) - 'state' - 'faithfulness' - 'withdrawn_at' - 'withdrawn_by' - 'withdrawal') <> (to_jsonb(OLD) - 'state' - 'faithfulness' - 'withdrawn_at' - 'withdrawn_by' - 'withdrawal') THEN
    RAISE EXCEPTION 'rendering % changes only by its withdrawal, once', OLD.rendering_id USING ERRCODE = '2F002';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER dse_rnd_guard BEFORE UPDATE OR DELETE ON decision.explanation_renderings FOR EACH ROW EXECUTE FUNCTION decision.dse_rendering_guard();

/* A case's identity, subject, standing, scope, grounds, evidence and deadline never change; its lifecycle columns move along
   opened → under_review → adjudicated → closed (opened/under_review → closed: withdrawn by the appellant); the overdue mark once. */
CREATE OR REPLACE FUNCTION decision.dse_appeal_guard() RETURNS trigger
SET search_path = decision, pg_catalog, pg_temp AS $$
DECLARE lifecycle text[] := ARRAY['state', 'adjudicator_principal_id', 'assigned_by', 'assigned_at', 'outcome', 'rationale', 'correction', 'impact', 'effect', 'adjudicated_at',
                                  'closure', 'closed_by', 'closed_at', 'closure_note', 'overdue_flagged_at'];
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'appeal cases are kept: DELETE prohibited' USING ERRCODE = '2F002'; END IF;
  IF (to_jsonb(NEW) - lifecycle) <> (to_jsonb(OLD) - lifecycle) THEN
    RAISE EXCEPTION 'appeal case %: only its lifecycle changes (the subject, standing, scope, grounds, evidence and deadline are fixed at opening)', OLD.case_id USING ERRCODE = '2F002';
  END IF;
  IF OLD.state = 'closed' THEN RAISE EXCEPTION 'appeal case % is closed and immutable', OLD.case_id USING ERRCODE = '2F002'; END IF;
  IF OLD.overdue_flagged_at IS NOT NULL AND NEW.overdue_flagged_at IS DISTINCT FROM OLD.overdue_flagged_at THEN
    RAISE EXCEPTION 'appeal case %: the overdue mark is set once', OLD.case_id USING ERRCODE = '2F002';
  END IF;
  IF OLD.outcome IS NOT NULL AND (NEW.outcome IS DISTINCT FROM OLD.outcome OR NEW.rationale IS DISTINCT FROM OLD.rationale OR NEW.effect IS DISTINCT FROM OLD.effect
                                  OR NEW.impact IS DISTINCT FROM OLD.impact OR NEW.correction IS DISTINCT FROM OLD.correction OR NEW.adjudicated_at IS DISTINCT FROM OLD.adjudicated_at
                                  OR NEW.adjudicator_principal_id IS DISTINCT FROM OLD.adjudicator_principal_id) THEN
    RAISE EXCEPTION 'appeal case % was adjudicated: the adjudication is immutable', OLD.case_id USING ERRCODE = '2F002';
  END IF;
  IF NEW.state <> OLD.state AND NOT (
       (OLD.state = 'opened' AND NEW.state IN ('under_review', 'closed'))
    OR (OLD.state = 'under_review' AND NEW.state IN ('adjudicated', 'closed'))
    OR (OLD.state = 'adjudicated' AND NEW.state = 'closed')) THEN
    RAISE EXCEPTION 'appeal case %: % → % is not a case transition', OLD.case_id, OLD.state, NEW.state USING ERRCODE = '2F002';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER dse_apl_guard BEFORE UPDATE OR DELETE ON decision.appeal_cases FOR EACH ROW EXECUTE FUNCTION decision.dse_appeal_guard();

-- §E.3 THE PRIVATE HELPERS ────────────────────────────────────────────

/* The digest of a jsonb value (its canonical text: jsonb orders keys). */
CREATE OR REPLACE FUNCTION decision.dse_digest(p jsonb) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$ SELECT encode(sha256(convert_to(coalesce(p, 'null'::jsonb)::text, 'UTF8')), 'hex') $$;
GRANT EXECUTE ON FUNCTION decision.dse_digest(jsonb) TO eye_app, eye_commit;

/* The statement text of a list element: a string, or the first of the usual text keys of an object, or its compact form. */
CREATE OR REPLACE FUNCTION decision.dse_text(p jsonb) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT left(CASE jsonb_typeof(p) WHEN 'string' THEN p #>> '{}'
                                   WHEN 'object' THEN coalesce(p ->> 'statement', p ->> 'text', p ->> 'what', p ->> 'effect', p ->> 'note', p ->> 'title', p ->> 'description', p ->> 'kind', p::text)
                                   ELSE coalesce(p::text, '') END, 1000) $$;
GRANT EXECUTE ON FUNCTION decision.dse_text(jsonb) TO eye_app, eye_commit;

/* Whether a principal acts as an AGENT here: a principal of kind agent, or one holding the decision agent role (the Explainability Agent's
   stand-in — no explainability role exists and B35 adds none). */
CREATE OR REPLACE FUNCTION decision.dse_is_agent(p_principal uuid, p_tenant uuid, p_domain uuid) RETURNS boolean
STABLE SECURITY DEFINER SET search_path = identity, pg_catalog, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM identity.principals p WHERE p.id = p_principal AND p.kind = 'agent')
      OR EXISTS (SELECT 1 FROM identity.role_bindings b WHERE b.principal_id = p_principal AND b.role_code = 'decision_agent' AND b.tenant_id = p_tenant
                    AND b.revoked_at IS NULL AND (b.scope = 'TENANT' OR (b.scope = 'DOMAIN' AND b.domain_id = p_domain)));
$$ LANGUAGE sql;
REVOKE ALL ON FUNCTION decision.dse_is_agent(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.dse_is_agent(uuid, uuid, uuid) TO eye_app, eye_commit;

/* ONE ITEM (unnumbered: the finalizer numbers them). A protected classification withholds the statement (App. L withheld_scope). */
CREATE OR REPLACE FUNCTION decision.dse_item(p_category text, p_role text, p_ref jsonb, p_field text, p_statement text, p_material boolean, p_classification text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path = decision, pg_catalog, pg_temp AS $$
BEGIN
  IF NOT (p_category = ANY (decision.dse_categories())) THEN RAISE EXCEPTION 'explanation rejected (category): % is not an item category', p_category USING ERRCODE = '22023'; END IF;
  IF NOT (p_role = ANY (decision.dse_roles())) THEN RAISE EXCEPTION 'explanation rejected (role): % is not an item role', p_role USING ERRCODE = '22023'; END IF;
  IF p_classification IN ('confidential', 'restricted', 'secret') THEN
    RETURN jsonb_build_object('category', p_category, 'role', p_role, 'ref', coalesce(p_ref, '{}'::jsonb), 'field', p_field, 'material', coalesce(p_material, false),
                              'statement', format('[withheld: classification %s]', p_classification), 'withheld', true, 'classification', p_classification);
  END IF;
  RETURN jsonb_build_object('category', p_category, 'role', p_role, 'ref', coalesce(p_ref, '{}'::jsonb), 'field', p_field, 'material', coalesce(p_material, false),
                            'statement', left(coalesce(nullif(btrim(p_statement), ''), '(no statement)'), 1000), 'withheld', false);
END $$;
REVOKE ALL ON FUNCTION decision.dse_item(text, text, jsonb, text, text, boolean, text) FROM PUBLIC;

/* THE SUBJECT (any kind an explanation or an appeal names), in the given tenant and domain: its title, state, owners, the package it belongs
   to, whether it is DECIDED, and the DIGEST of its preserved state (an explanation whose subject digest differs is stale). NULL: no such
   subject here. A recommendation (§R) and an analysis (§A) are read only when their part is installed (to_regclass / to_regprocedure);
   otherwise the answer says unavailable. */
CREATE OR REPLACE FUNCTION decision.dse_subject(p_tenant uuid, p_domain uuid, p_kind text, p_id uuid, p_version int) RETURNS jsonb
STABLE SECURITY DEFINER SET search_path = decision, prediction, simulation, observation, objects, graph, public, pg_catalog, pg_temp AS $$
DECLARE p record; v record; o record; f record; r record; s record; cl record; x record; v_ver int; v_state jsonb; v_rec jsonb; v_an jsonb; v_sub jsonb;
BEGIN
  -- a definer read answers only inside the caller's established context (never another tenant's or domain's subject)
  IF p_tenant IS DISTINCT FROM public.eye_tenant() OR (public.eye_scope() IS DISTINCT FROM 'TENANT' AND p_domain IS DISTINCT FROM public.eye_domain()) THEN RETURN NULL; END IF;
  IF p_kind IN ('package', 'package_version', 'analysis') THEN
    SELECT * INTO p FROM decision.packages_current z WHERE z.package_id = p_id AND z.tenant_id = p_tenant AND z.domain_id = p_domain;
    IF NOT FOUND THEN RETURN NULL; END IF;
    v_ver := CASE WHEN p_kind = 'package' THEN coalesce(p_version, p.committed_version, p.current_version) ELSE p_version END;
    IF v_ver IS NULL THEN RETURN NULL; END IF;
    SELECT * INTO v FROM decision.package_versions z WHERE z.package_id = p_id AND z.version = v_ver;
    IF NOT FOUND THEN RETURN NULL; END IF;
    IF p_kind = 'analysis' THEN
      IF to_regprocedure('decision.package_analysis(uuid,integer)') IS NULL THEN
        RETURN jsonb_build_object('kind', p_kind, 'id', p_id, 'version', v_ver, 'unavailable', true, 'reason', 'the analysis part (§A, decision.package_analysis) is not installed');
      END IF;
      EXECUTE 'SELECT decision.package_analysis($1, $2)' INTO v_an USING p_id, v_ver;
      IF v_an IS NULL THEN RETURN NULL; END IF;
      RETURN jsonb_build_object('kind', p_kind, 'id', p_id, 'version', v_ver, 'title', format('Analysis of "%s" v%s', p.title, v_ver), 'state', v.state, 'package_id', p_id,
                                'owners', jsonb_build_array(p.owner_principal_id), 'decided', p.committed_version IS NOT NULL, 'digest', decision.dse_digest(v_an), 'analysis', v_an);
    END IF;
    v_state := jsonb_build_object(
      'package', jsonb_build_object('state', p.state, 'committed_version', p.committed_version, 'current_version', p.current_version, 'owner', p.owner_principal_id, 'decided_at', p.decided_at),
      'version', to_jsonb(v),
      'options', (SELECT coalesce(jsonb_agg(to_jsonb(z) ORDER BY z.key), '[]'::jsonb) FROM decision.options z WHERE z.package_id = p_id AND z.version = v_ver),
      'dissent', (SELECT coalesce(jsonb_agg(to_jsonb(z) ORDER BY z.recorded_at, z.dissent_id), '[]'::jsonb) FROM decision.dissent z WHERE z.package_id = p_id AND z.version = v_ver),
      'approvals', (SELECT coalesce(jsonb_agg(jsonb_build_object('approval_id', z.approval_id, 'decision', z.decision, 'revoked_at', z.revoked_at) ORDER BY z.recorded_at, z.approval_id), '[]'::jsonb)
                      FROM decision.approvals z WHERE z.package_id = p_id AND z.version = v_ver),
      'challenges', (SELECT coalesce(jsonb_agg(jsonb_build_object('challenge_id', z.challenge_id, 'resolution', z.resolution) ORDER BY z.raised_at, z.challenge_id), '[]'::jsonb)
                       FROM decision.challenges z WHERE z.package_id = p_id AND z.version = v_ver),
      'commitment', (SELECT z.commitment_id FROM decision.commitments z WHERE z.package_id = p_id AND z.version = v_ver));
    RETURN jsonb_build_object('kind', p_kind, 'id', p_id, 'version', v_ver, 'title', format('%s v%s', p.title, v_ver), 'state', v.state, 'package_state', p.state, 'package_id', p_id,
                              'owners', jsonb_build_array(p.owner_principal_id), 'decided', p.committed_version IS NOT NULL, 'digest', decision.dse_digest(v_state));
  ELSIF p_kind = 'option' THEN
    SELECT * INTO o FROM decision.options z WHERE z.option_id = p_id AND z.tenant_id = p_tenant AND z.domain_id = p_domain;
    IF NOT FOUND THEN RETURN NULL; END IF;
    SELECT * INTO p FROM decision.packages_current z WHERE z.package_id = o.package_id;
    SELECT * INTO v FROM decision.package_versions z WHERE z.package_id = o.package_id AND z.version = o.version;
    RETURN jsonb_build_object('kind', p_kind, 'id', p_id, 'version', o.version, 'title', format('Option "%s" of %s v%s', o.key, p.title, o.version), 'state', v.state, 'package_id', o.package_id,
                              'owners', jsonb_build_array(p.owner_principal_id), 'decided', p.committed_version IS NOT NULL,
                              'digest', decision.dse_digest(jsonb_build_object('option', to_jsonb(o), 'version_state', v.state, 'chosen', v.choice ->> 'option_key')));
  ELSIF p_kind = 'forecast' THEN
    SELECT * INTO f FROM prediction.forecasts_current z WHERE z.forecast_id = p_id AND z.tenant_id = p_tenant AND z.domain_id = p_domain;
    IF NOT FOUND THEN RETURN NULL; END IF;
    RETURN jsonb_build_object('kind', p_kind, 'id', p_id, 'version', NULL, 'title', format('Forecast %s at %s (%s)', f.series_key, f.horizon_code, f.target_at), 'state', f.state,
                              'owners', jsonb_build_array(f.issued_by), 'decided', false, 'digest', decision.dse_digest(to_jsonb(f) - 'updated_at'));
  ELSIF p_kind = 'run' THEN
    SELECT * INTO r FROM simulation.runs_current z WHERE z.run_id = p_id AND z.tenant_id = p_tenant AND z.domain_id = p_domain;
    IF NOT FOUND THEN RETURN NULL; END IF;
    RETURN jsonb_build_object('kind', p_kind, 'id', p_id, 'version', NULL, 'title', format('Run %s (%s, %s)', p_id, r.run_kind, r.component), 'state', r.state,
                              'owners', jsonb_build_array(r.operator_principal_id), 'decided', false, 'digest', decision.dse_digest(to_jsonb(r)));
  ELSIF p_kind = 'source' THEN
    SELECT * INTO s FROM observation.source_contracts_current z WHERE z.source_id = p_id AND z.tenant_id = p_tenant AND z.domain_id = p_domain ORDER BY z.contract_version DESC LIMIT 1;
    IF NOT FOUND THEN RETURN NULL; END IF;
    RETURN jsonb_build_object('kind', p_kind, 'id', p_id, 'version', s.contract_version, 'title', format('Source "%s" (%s)', s.name, s.source_key), 'state', s.lifecycle_state,
                              'owners', to_jsonb(array_remove(ARRAY[s.registrar_principal_id, s.approver_principal_id], NULL)), 'decided', false, 'source_key', s.source_key,
                              'digest', decision.dse_digest(to_jsonb(s) - 'updated_at'));
  ELSIF p_kind = 'claim' THEN
    SELECT * INTO cl FROM objects.canonical_objects z WHERE z.object_type = 'CLM' AND z.object_id = p_id AND z.tenant_id = p_tenant AND z.domain_id = p_domain ORDER BY z.object_version DESC LIMIT 1;
    IF NOT FOUND THEN RETURN NULL; END IF;
    RETURN jsonb_build_object('kind', p_kind, 'id', p_id, 'version', cl.object_version, 'title', format('Claim %s@%s', p_id, cl.object_version), 'state', cl.lifecycle_state,
                              'owners', '[]'::jsonb, 'decided', false,
                              'digest', decision.dse_digest(jsonb_build_object('object_version', cl.object_version, 'lifecycle_state', cl.lifecycle_state, 'content_digest', cl.content_digest)));
  ELSIF p_kind = 'recommendation' THEN
    IF to_regclass('decision.recommendations') IS NULL THEN
      RETURN jsonb_build_object('kind', p_kind, 'id', p_id, 'unavailable', true, 'reason', 'the recommendation part (§R, decision.recommendations) is not installed');
    END IF;
    EXECUTE 'SELECT to_jsonb(z) FROM decision.recommendations z WHERE (to_jsonb(z) ->> ''recommendation_id'') = $1::text AND z.tenant_id = $2 AND z.domain_id = $3' INTO v_rec USING p_id, p_tenant, p_domain;
    IF v_rec IS NULL THEN RETURN NULL; END IF;
    SELECT * INTO p FROM decision.packages_current z WHERE z.package_id = (v_rec ->> 'package_id')::uuid;
    RETURN jsonb_build_object('kind', p_kind, 'id', p_id, 'version', (v_rec ->> 'version')::int, 'title', format('Recommendation "%s"', coalesce(v_rec ->> 'what', v_rec ->> 'option_key', p_id::text)),
                              'state', coalesce(v_rec ->> 'state', 'recorded'), 'package_id', v_rec ->> 'package_id',
                              'owners', to_jsonb(array_remove(ARRAY[CASE WHEN coalesce(v_rec ->> 'author_kind', 'human') = 'human' THEN coalesce(v_rec ->> 'author_principal_id', v_rec ->> 'author')::uuid END, p.owner_principal_id], NULL)),
                              'decided', p.committed_version IS NOT NULL, 'digest', decision.dse_digest(v_rec), 'recommendation', v_rec);
  ELSIF p_kind = 'explanation' THEN
    SELECT * INTO x FROM decision.explanations z WHERE z.explanation_id = p_id AND z.tenant_id = p_tenant AND z.domain_id = p_domain;
    IF NOT FOUND THEN RETURN NULL; END IF;
    v_sub := decision.dse_subject(p_tenant, p_domain, x.subject_kind, x.subject_id, x.subject_version);
    RETURN jsonb_build_object('kind', p_kind, 'id', p_id, 'version', x.explanation_version, 'title', format('Explanation v%s of %s', x.explanation_version, x.subject_title), 'state', 'generated',
                              'owners', coalesce(v_sub -> 'owners', '[]'::jsonb), 'decided', coalesce((v_sub ->> 'decided')::boolean, false), 'package_id', v_sub ->> 'package_id',
                              'digest', x.integrity_digest);
  END IF;
  RETURN NULL;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.dse_subject(uuid, uuid, text, uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.dse_subject(uuid, uuid, text, uuid, int) TO eye_app, eye_commit;

/* The appeal cases touching a subject, as counter-evidence items (an open, upheld or partly upheld case is material; a dismissed one is not). */
CREATE OR REPLACE FUNCTION decision.dse_case_items(p_tenant uuid, p_domain uuid, p_kind text, p_id uuid, p_label text) RETURNS jsonb
STABLE SECURITY DEFINER SET search_path = decision, pg_catalog, pg_temp AS $$
  SELECT coalesce(jsonb_agg(decision.dse_item('human_assessment', 'counter_evidence', jsonb_build_object('kind', 'appeal_case', 'id', c.case_id, 'subject_kind', c.subject_kind, 'subject_id', c.subject_id),
           'appeals',
           format('Appeal on the %s (%s): "%s" — %s%s', p_label, c.subject_kind, left(c.grounds, 300),
                  CASE WHEN c.outcome IS NULL THEN format('open (%s), response due %s', c.state, decision.iso(c.deadline_at)) ELSE c.outcome || ': ' || left(c.rationale, 300) END,
                  CASE WHEN c.correction IS NOT NULL THEN ' — correction: ' || left(c.correction, 300) ELSE '' END),
           coalesce(c.outcome, 'open') <> 'dismissed') ORDER BY c.opened_at, c.case_id), '[]'::jsonb)
    FROM decision.appeal_cases c WHERE c.tenant_id = p_tenant AND c.domain_id = p_domain AND c.subject_kind = p_kind AND c.subject_id = p_id AND c.closure IS DISTINCT FROM 'withdrawn'
$$ LANGUAGE sql;
REVOKE ALL ON FUNCTION decision.dse_case_items(uuid, uuid, text, uuid, text) FROM PUBLIC;

/* THE ITEMS OF ONE OPTION (its card, each cited object by its kind's category, the decision use of each cited run, the derived uncertainty).
   The chosen option's items SUPPORT the conclusion and its limitations and risks are MATERIAL; another option's are a COMPETING HYPOTHESIS. */
CREATE OR REPLACE FUNCTION decision.dse_option_items(o decision.options, p_chosen boolean) RETURNS jsonb
STABLE SECURITY DEFINER SET search_path = decision, simulation, prediction, graph, objects, pg_catalog, pg_temp AS $$
DECLARE v_items jsonb := '[]'::jsonb; v_agent boolean; v_role text; b jsonb; u jsonb; f prediction.forecasts_current%ROWTYPE; a graph.strategy_current%ROWTYPE; e jsonb; v_ref jsonb;
BEGIN
  v_agent := decision.dse_is_agent(o.set_by, o.tenant_id, o.domain_id);
  v_role := CASE WHEN p_chosen THEN 'support' ELSE 'competing_hypothesis' END;
  v_items := v_items || decision.dse_item(CASE WHEN v_agent THEN 'agent_judgment' ELSE 'human_assessment' END, v_role,
    jsonb_build_object('kind', 'option', 'id', o.option_id, 'key', o.key, 'version', o.version), 'options',
    format('Option "%s" — %s (%s)%s; set by %s', o.key, o.title, o.kind,
           CASE WHEN o.simulated THEN ', simulated' ELSE ', unsimulated: ' || coalesce(o.unsimulated_reason, '') END,
           CASE WHEN v_agent THEN 'the decision agent (a drafted card)' ELSE 'a named human' END), false);
  FOR b IN SELECT * FROM jsonb_array_elements(coalesce(o.uncertainty -> 'basis', '[]'::jsonb)) LOOP
    v_ref := jsonb_build_object('kind', b ->> 'kind', 'id', b ->> 'id', 'version', (b ->> 'version')::int, 'digest', b ->> 'digest');
    IF (b ->> 'kind') = 'run' THEN
      u := simulation.run_decision_use((b ->> 'id')::uuid);
      v_items := v_items || decision.dse_item('model_inference', v_role, v_ref, 'consequences',
        format('Run %s (%s run on twin %s v%s) simulates the consequence of "%s"; validation %s; %s', b ->> 'id', b ->> 'run_kind', b ->> 'twin_id', b ->> 'twin_version', o.key,
               coalesce(b ->> 'validation_status', 'unstated'), coalesce(u ->> 'label', 'decision use unknown')), false, b ->> 'classification');
      IF u IS NOT NULL AND (u ->> 'use') <> 'decision' THEN
        v_items := v_items || decision.dse_item('deterministic_transformation', 'limitation', jsonb_build_object('kind', 'run', 'id', b ->> 'id'), 'decision_use',
          format('Run %s cited by "%s" is %s', b ->> 'id', o.key, u ->> 'label'), p_chosen);
      END IF;
      IF coalesce((b ->> 'outside_envelope')::boolean, false) THEN
        v_items := v_items || decision.dse_item('deterministic_transformation', 'limitation', jsonb_build_object('kind', 'run', 'id', b ->> 'id'), 'envelope',
          format('Run %s cited by "%s" ran outside the twin''s validated envelope', b ->> 'id', o.key), p_chosen);
      END IF;
    ELSIF (b ->> 'kind') = 'forecast' THEN
      SELECT * INTO f FROM prediction.forecasts_current z WHERE z.forecast_id = (b ->> 'id')::uuid;
      v_items := v_items || decision.dse_item('model_inference', v_role, v_ref, 'consequences',
        format('Forecast %s cited by "%s": %s', b ->> 'id', o.key, coalesce(left(f.statement, 600), 'not visible')), false, b ->> 'classification');
      IF f.forecast_id IS NOT NULL AND f.validation_state <> 'validated' THEN
        v_items := v_items || decision.dse_item('deterministic_transformation', 'limitation', jsonb_build_object('kind', 'forecast', 'id', b ->> 'id'), 'validation',
          format('Forecast %s is %s: %s', b ->> 'id', replace(f.validation_state, '_', ' '), f.validation_note), p_chosen);
      END IF;
    ELSIF (b ->> 'kind') IN ('evidence', 'claim') THEN
      v_items := v_items || decision.dse_item('source_evidence', v_role, v_ref, 'consequences',
        format('%s %s@%s cited by "%s" — truth state %s, %s%s', b ->> 'object_type', b ->> 'id', b ->> 'version', o.key, coalesce(b ->> 'truth_state', 'unstated'), coalesce(b ->> 'classification', 'unclassified'),
               CASE WHEN coalesce((b ->> 'synthetic_state')::boolean, false) THEN ' (SYNTHETIC)' ELSE '' END), false, b ->> 'classification');
    ELSIF (b ->> 'kind') = 'assumption' THEN
      SELECT * INTO a FROM graph.strategy_current z WHERE z.strategy_object_id = (b ->> 'id')::uuid;
      v_items := v_items || decision.dse_item('human_assessment', 'assumption', v_ref, 'consequences',
        format('Assumption "%s" behind "%s": %s', coalesce(a.title, b ->> 'id'), o.key, coalesce(left(a.statement, 400), 'not visible')), p_chosen, b ->> 'classification');
    ELSE
      v_items := v_items || decision.dse_item('deterministic_transformation', v_role, v_ref, 'consequences',
        format('%s %s@%s cited by "%s"', coalesce(b ->> 'object_type', b ->> 'kind'), b ->> 'id', b ->> 'version', o.key), false, b ->> 'classification');
    END IF;
  END LOOP;
  IF p_chosen THEN
    v_items := v_items || decision.dse_item('deterministic_transformation', 'uncertainty', jsonb_build_object('kind', 'option', 'id', o.option_id, 'key', o.key), 'uncertainty',
      format('Uncertainty derived at the port (%s): %s citation(s), %s synthetic input(s), %s unvalidated run(s), %s run(s) outside the envelope; truth states %s',
             coalesce(o.uncertainty ->> 'method', 'unstated'), coalesce(o.uncertainty ->> 'citations', '0'), coalesce(o.uncertainty ->> 'synthetic_inputs', '0'),
             coalesce(o.uncertainty ->> 'unvalidated_runs', '0'), coalesce(o.uncertainty ->> 'outside_envelope_runs', '0'), coalesce(o.uncertainty ->> 'truth_states', '[]')), false);
    FOR e IN SELECT * FROM jsonb_array_elements(o.risks) LOOP
      v_items := v_items || decision.dse_item(CASE WHEN v_agent THEN 'agent_judgment' ELSE 'human_assessment' END, 'effect', jsonb_build_object('kind', 'option', 'id', o.option_id, 'key', o.key), 'risks',
        format('Risk of "%s": %s', o.key, decision.dse_text(e)), true);
    END LOOP;
    FOR e IN SELECT * FROM jsonb_array_elements(o.opportunities) LOOP
      v_items := v_items || decision.dse_item(CASE WHEN v_agent THEN 'agent_judgment' ELSE 'human_assessment' END, 'effect', jsonb_build_object('kind', 'option', 'id', o.option_id, 'key', o.key), 'opportunities',
        format('Opportunity of "%s": %s', o.key, decision.dse_text(e)), false);
    END LOOP;
    IF o.reversibility IS NOT NULL THEN
      v_items := v_items || decision.dse_item(CASE WHEN v_agent THEN 'agent_judgment' ELSE 'human_assessment' END, 'effect', jsonb_build_object('kind', 'option', 'id', o.option_id, 'key', o.key), 'reversibility',
        format('Reversibility of "%s": %s', o.key, o.reversibility), false);
    END IF;
  END IF;
  RETURN v_items;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.dse_option_items(decision.options, boolean) FROM PUBLIC;

/* The uncertainty of an option, the four questions kept apart (AI-63-005): LIKELIHOOD (a governed probability only — a cited forecast's
   band; never derived from narrative), IMPACT (the stated consequence), CONFIDENCE (what the methods claim of themselves: the cited runs'
   decision use and validation) and EVIDENCE QUALITY (where the inputs come from: synthetic, unvalidated, outside the envelope). */
CREATE OR REPLACE FUNCTION decision.dse_option_uncertainty(o decision.options, p_impact jsonb, p_disagreement jsonb) RETURNS jsonb
STABLE SECURITY DEFINER SET search_path = decision, simulation, prediction, pg_catalog, pg_temp AS $$
DECLARE v_fc jsonb; v_runs int; v_decision int; v_diag int; v_conf text; v_grade text; u jsonb;
BEGIN
  u := coalesce(o.uncertainty, '{}'::jsonb);
  SELECT jsonb_agg(jsonb_build_object('forecast_id', f.forecast_id, 'q10', f.quantiles -> 'q10', 'q50', f.quantiles -> 'q50', 'q90', f.quantiles -> 'q90', 'target_at', f.target_at, 'series_key', f.series_key))
    INTO v_fc FROM jsonb_array_elements(coalesce(u -> 'basis', '[]'::jsonb)) b JOIN prediction.forecasts_current f ON f.forecast_id = (b ->> 'id')::uuid WHERE (b ->> 'kind') = 'forecast';
  SELECT count(*), count(*) FILTER (WHERE (simulation.run_decision_use((b ->> 'id')::uuid) ->> 'use') = 'decision'),
         count(*) FILTER (WHERE (simulation.run_decision_use((b ->> 'id')::uuid) ->> 'use') <> 'decision')
    INTO v_runs, v_decision, v_diag FROM jsonb_array_elements(coalesce(u -> 'basis', '[]'::jsonb)) b WHERE (b ->> 'kind') = 'run';
  v_conf := CASE WHEN v_runs = 0 THEN 'unsupported by simulation' WHEN v_diag = 0 THEN 'supported (decision-grade results)' ELSE 'limited (diagnostic or refused results)' END;
  v_grade := CASE WHEN coalesce((u ->> 'synthetic_inputs')::int, 0) > 0 THEN 'synthetic (demonstration grade)'
                  WHEN coalesce((u ->> 'unvalidated_runs')::int, 0) > 0 OR coalesce((u ->> 'outside_envelope_runs')::int, 0) > 0 THEN 'weak'
                  WHEN coalesce((u ->> 'citations')::int, 0) = 0 THEN 'none cited' ELSE 'adequate' END;
  RETURN jsonb_build_object(
    'likelihood', CASE WHEN v_fc IS NOT NULL THEN jsonb_build_object('kind', 'forecast_probability', 'statement', 'the 10-90 band of the cited forecast(s): a forecast probability, not a scenario plausibility', 'forecasts', v_fc)
                       ELSE jsonb_build_object('kind', 'not_stated', 'statement', 'no governed probability is cited; a likelihood is never derived from narrative') END,
    'impact', p_impact,
    'confidence', jsonb_build_object('level', v_conf, 'runs', v_runs, 'decision_grade_runs', v_decision, 'diagnostic_or_refused_runs', v_diag, 'method', u ->> 'method'),
    'evidence_quality', jsonb_build_object('grade', v_grade, 'citations', coalesce((u ->> 'citations')::int, 0), 'synthetic_inputs', coalesce((u ->> 'synthetic_inputs')::int, 0),
                                           'unvalidated_runs', coalesce((u ->> 'unvalidated_runs')::int, 0), 'outside_envelope_runs', coalesce((u ->> 'outside_envelope_runs')::int, 0), 'truth_states', coalesce(u -> 'truth_states', '[]'::jsonb)),
    'disagreement', p_disagreement);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.dse_option_uncertainty(decision.options, jsonb, jsonb) FROM PUBLIC;

/* THE PACKAGE VERSION's draft: every option, the choice, the trade-offs, the constraints and the authority, the dissent and the challenges,
   the conditions that would change it, the effects, the missing information, the bound scenario sets, the appeal cases. */
CREATE OR REPLACE FUNCTION decision.dse_build_package_version(p_tenant uuid, p_domain uuid, p_pkg uuid, p_version int) RETURNS jsonb
STABLE SECURITY DEFINER SET search_path = decision, prediction, simulation, pg_catalog, pg_temp AS $$
DECLARE p decision.packages_current%ROWTYPE; v decision.package_versions%ROWTYPE; o decision.options%ROWTYPE; oc decision.options%ROWTYPE; v_items jsonb := '[]'::jsonb; v_key text; e jsonb; r record;
        v_ref jsonb; v_dissent int; v_open_ch int; v_open_ap int; v_impact jsonb; v_disagree jsonb; v_unc jsonb;
BEGIN
  SELECT * INTO p FROM decision.packages_current z WHERE z.package_id = p_pkg AND z.tenant_id = p_tenant AND z.domain_id = p_domain;
  SELECT * INTO v FROM decision.package_versions z WHERE z.package_id = p_pkg AND z.version = p_version;
  v_ref := jsonb_build_object('kind', 'package_version', 'id', p_pkg, 'version', p_version);
  v_key := v.choice ->> 'option_key';
  IF v_key IS NOT NULL THEN
    v_items := v_items || decision.dse_item('human_assessment', 'conclusion', v_ref, 'choice', format('The owner chose option "%s" in "%s" v%s: %s', v_key, p.title, p_version, coalesce(v.choice ->> 'rationale', '')), false);
  ELSE
    v_items := v_items || decision.dse_item('human_assessment', 'conclusion', v_ref, 'choice', format('No option is chosen yet in "%s" v%s (%s)', p.title, p_version, v.state), false);
  END IF;
  FOR o IN SELECT * FROM decision.options z WHERE z.package_id = p_pkg AND z.version = p_version ORDER BY (z.key = v_key) DESC, z.key LOOP
    v_items := v_items || decision.dse_option_items(o, o.key IS NOT DISTINCT FROM v_key);
    IF o.key IS NOT DISTINCT FROM v_key THEN oc := o; END IF;
  END LOOP;
  FOR e IN SELECT * FROM jsonb_array_elements(coalesce(v.choice -> 'accepted_trade_offs', '[]'::jsonb)) LOOP
    v_items := v_items || decision.dse_item('human_assessment', 'effect', v_ref, 'choice.accepted_trade_offs', 'Accepted trade-off: ' || decision.dse_text(e), true);
  END LOOP;
  FOR e IN SELECT * FROM jsonb_array_elements(coalesce(v.choice -> 'outcome_criteria', '[]'::jsonb)) LOOP
    v_items := v_items || decision.dse_item('human_assessment', 'effect', v_ref, 'choice.outcome_criteria',
      format('Outcome criterion "%s": %s %s %s %s by %s', e ->> 'key', e ->> 'quantity', e ->> 'comparator', e ->> 'target', coalesce(e ->> 'unit', ''), e ->> 'by'), false);
  END LOOP;
  FOR e IN SELECT * FROM jsonb_array_elements(v.constraints) LOOP
    v_items := v_items || decision.dse_item('human_assessment', 'policy', v_ref, 'constraints', 'Constraint: ' || decision.dse_text(e), true);
  END LOOP;
  IF v.approver_policy <> '{}'::jsonb THEN
    v_items := v_items || decision.dse_item('deterministic_transformation', 'policy', v_ref, 'approver_policy',
      format('Required human gate: a quorum of %s named approver(s), approvals expiring after %s day(s); a named authority commits', coalesce(v.approver_policy ->> 'quorum', '?'), coalesce(v.approver_policy ->> 'expires_after_days', '?')), false);
  END IF;
  FOR r IN SELECT * FROM decision.approvals z WHERE z.package_id = p_pkg AND z.version = p_version ORDER BY z.recorded_at, z.approval_id LOOP
    v_items := v_items || decision.dse_item('human_assessment', 'policy', jsonb_build_object('kind', 'approval', 'id', r.approval_id), 'approvals',
      format('A named approver recorded %s: %s%s', r.decision, left(r.rationale, 400), CASE WHEN r.revoked_at IS NOT NULL THEN ' (revoked: ' || r.revoked_reason || ')' ELSE '' END), false);
  END LOOP;
  FOR r IN SELECT * FROM decision.dissent z WHERE z.package_id = p_pkg AND z.version = p_version ORDER BY z.recorded_at, z.dissent_id LOOP
    v_items := v_items || decision.dse_item('human_assessment', 'dissent', jsonb_build_object('kind', 'dissent', 'id', r.dissent_id), 'dissent',
      format('Dissent — %s: %s', r.position, left(r.rationale, 600)), true);
  END LOOP;
  FOR r IN SELECT * FROM decision.challenges z WHERE z.package_id = p_pkg AND z.version = p_version ORDER BY z.raised_at, z.challenge_id LOOP
    v_items := v_items || decision.dse_item('human_assessment', 'counter_evidence', jsonb_build_object('kind', 'challenge', 'id', r.challenge_id), 'challenges',
      format('Challenge by a %s: %s — %s', r.standing, left(r.reason, 400), coalesce(r.resolution || ': ' || left(r.resolution_note, 300), 'open')), r.resolution IS DISTINCT FROM 'dismissed');
  END LOOP;
  FOR e IN SELECT * FROM jsonb_array_elements(v.monitoring_conditions) LOOP
    v_items := v_items || decision.dse_item('human_assessment', 'counterfactual', v_ref, 'monitoring_conditions',
      format('The choice is revisited when: %s', coalesce(e ->> 'note', CASE WHEN e ->> 'kind' = 'review' THEN format('the %s-day review falls due', e ->> 'every_days') ELSE decision.dse_text(e) END)), false);
  END LOOP;
  FOR e IN SELECT * FROM jsonb_array_elements(v.risks) LOOP
    v_items := v_items || decision.dse_item('human_assessment', 'effect', v_ref, 'risks', 'Risk: ' || decision.dse_text(e), true);
  END LOOP;
  FOR e IN SELECT * FROM jsonb_array_elements(v.second_order) LOOP
    v_items := v_items || decision.dse_item('human_assessment', 'effect', v_ref, 'second_order', 'Second-order effect: ' || decision.dse_text(e), false);
  END LOOP;
  FOR e IN SELECT * FROM jsonb_array_elements(coalesce(v.expected_effects, '[]'::jsonb)) LOOP
    v_items := v_items || decision.dse_item('human_assessment', 'effect', v_ref, 'expected_effects',
      format('Expected effect: %s (%s %s over %s; basis: %s)', e ->> 'effect', e ->> 'measure', e ->> 'direction', e ->> 'horizon', e ->> 'basis'), false);
  END LOOP;
  FOR e IN SELECT * FROM jsonb_array_elements(coalesce(v.missing_information, '[]'::jsonb)) LOOP
    v_items := v_items || decision.dse_item('human_assessment', 'limitation', v_ref, 'missing_information',
      format('Missing information: %s (needed by %s)', coalesce(e ->> 'what', decision.dse_text(e)), coalesce(e ->> 'needed_by', 'unstated')), true);
  END LOOP;
  IF v.reversibility IS NOT NULL THEN v_items := v_items || decision.dse_item('human_assessment', 'effect', v_ref, 'reversibility', 'Reversibility: ' || v.reversibility, false); END IF;
  IF v.information_value IS NOT NULL THEN v_items := v_items || decision.dse_item('human_assessment', 'sensitivity', v_ref, 'information_value', 'Value of information: ' || v.information_value, false); END IF;
  FOR r IN SELECT s.set_id, s.title, s.version, s.state FROM decision.package_scenario_sets b JOIN prediction.scenario_sets s ON s.set_id = b.set_id WHERE b.package_id = p_pkg ORDER BY b.bound_at LOOP
    v_items := v_items || decision.dse_item('human_assessment', 'competing_hypothesis', jsonb_build_object('kind', 'scenario_set', 'id', r.set_id, 'version', r.version), 'scenario_sets',
      format('Weighed against the scenario set "%s" (v%s, %s)', r.title, r.version, r.state), false);
  END LOOP;
  v_items := v_items || decision.dse_case_items(p_tenant, p_domain, 'package', p_pkg, 'package');
  SELECT count(*) INTO v_dissent FROM decision.dissent z WHERE z.package_id = p_pkg AND z.version = p_version;
  SELECT count(*) INTO v_open_ch FROM decision.challenges z WHERE z.package_id = p_pkg AND z.version = p_version AND z.resolved_at IS NULL;
  SELECT count(*) INTO v_open_ap FROM decision.appeal_cases z WHERE z.subject_kind = 'package' AND z.subject_id = p_pkg AND z.state IN ('opened', 'under_review');
  v_impact := CASE WHEN v_key IS NULL THEN jsonb_build_object('kind', 'not_stated', 'statement', 'no option is chosen')
                   ELSE jsonb_build_object('kind', 'stated_consequence', 'decision_class', p.decision_class,
                                           'statement', format('the consequence of "%s" as simulated by its cited runs, with the accepted trade-offs', v_key),
                                           'accepted_trade_offs', coalesce(v.choice -> 'accepted_trade_offs', '[]'::jsonb)) END;
  v_disagree := jsonb_build_object('dissent', v_dissent, 'open_challenges', v_open_ch, 'open_appeals', v_open_ap, 'model', 'not measured: no model ensemble is cited (model disagreement is not real-world uncertainty)');
  IF oc.option_id IS NOT NULL THEN v_unc := decision.dse_option_uncertainty(oc, v_impact, v_disagree);
  ELSE v_unc := jsonb_build_object('likelihood', jsonb_build_object('kind', 'not_stated', 'statement', 'no option is chosen'), 'impact', v_impact,
                                   'confidence', jsonb_build_object('level', 'not assessed: no option is chosen'), 'evidence_quality', jsonb_build_object('grade', 'not assessed'), 'disagreement', v_disagree);
  END IF;
  RETURN jsonb_build_object('items', v_items, 'uncertainty', v_unc,
    'conclusion', jsonb_build_object('kind', 'decision_package', 'statement', CASE WHEN v_key IS NULL THEN 'no option is chosen yet' ELSE format('option "%s" is chosen', v_key) END,
                                     'option_key', v_key, 'version_state', v.state, 'package_state', p.state, 'decided', p.committed_version IS NOT NULL),
    'method', jsonb_build_object('generator', 'dse-explain@1', 'reads', jsonb_build_array('decision.package_versions', 'decision.options (derived uncertainty)', 'simulation.run_decision_use', 'decision.dissent', 'decision.approvals', 'decision.challenges', 'decision.appeal_cases')),
    'decision_use', jsonb_build_object('version_state', v.state, 'package_state', p.state, 'decision_class', p.decision_class,
                                       'boundary', 'this explanation informs; the gate (approvals by named humans, the commitment by a named authority) decides'),
    'information_boundary', jsonb_build_object('known_at', decision.iso(v.known_at), 'observed_through', v.observed_through),
    'provenance', jsonb_build_object('version_digest', v.version_digest, 'header_digest', v.header_digest, 'baseline_run_id', v.baseline_run_id),
    'calibration_basis', CASE WHEN oc.option_id IS NULL THEN NULL ELSE (SELECT jsonb_agg(jsonb_build_object('run_id', b ->> 'id', 'validation_status', b ->> 'validation_status', 'twin_validation', b -> 'twin_validation'))
                                                                        FROM jsonb_array_elements(coalesce(oc.uncertainty -> 'basis', '[]'::jsonb)) b WHERE (b ->> 'kind') = 'run') END,
    'sensitivity', CASE WHEN oc.option_id IS NULL THEN NULL ELSE (SELECT jsonb_agg(jsonb_build_object('run_id', b ->> 'id', 'sensitivity', b -> 'sensitivity'))
                                                                  FROM jsonb_array_elements(coalesce(oc.uncertainty -> 'basis', '[]'::jsonb)) b WHERE (b ->> 'kind') = 'run') END);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.dse_build_package_version(uuid, uuid, uuid, int) FROM PUBLIC;

/* ONE OPTION's draft (its own items, its package's choice as the conclusion's context). */
CREATE OR REPLACE FUNCTION decision.dse_build_option(p_tenant uuid, p_domain uuid, p_option uuid) RETURNS jsonb
STABLE SECURITY DEFINER SET search_path = decision, pg_catalog, pg_temp AS $$
DECLARE o decision.options%ROWTYPE; p decision.packages_current%ROWTYPE; v decision.package_versions%ROWTYPE; v_chosen boolean; v_items jsonb;
BEGIN
  SELECT * INTO o FROM decision.options z WHERE z.option_id = p_option AND z.tenant_id = p_tenant AND z.domain_id = p_domain;
  SELECT * INTO p FROM decision.packages_current z WHERE z.package_id = o.package_id;
  SELECT * INTO v FROM decision.package_versions z WHERE z.package_id = o.package_id AND z.version = o.version;
  v_chosen := (v.choice ->> 'option_key') IS NOT DISTINCT FROM o.key;
  v_items := jsonb_build_array(decision.dse_item('human_assessment', 'conclusion', jsonb_build_object('kind', 'option', 'id', o.option_id, 'key', o.key), 'option',
               format('Option "%s" of "%s" v%s %s', o.key, p.title, o.version, CASE WHEN v_chosen THEN 'is the chosen option' WHEN v.choice IS NULL THEN 'awaits the owner''s choice' ELSE format('is not chosen (the choice is "%s")', v.choice ->> 'option_key') END), false))
             || decision.dse_option_items(o, true);
  RETURN jsonb_build_object('items', v_items,
    'uncertainty', decision.dse_option_uncertainty(o, jsonb_build_object('kind', 'stated_consequence', 'statement', format('the consequence of "%s" as simulated by its cited runs', o.key)),
                                                   jsonb_build_object('dissent', (SELECT count(*) FROM decision.dissent z WHERE z.package_id = o.package_id AND z.version = o.version), 'model', 'not measured: no model ensemble is cited')),
    'conclusion', jsonb_build_object('kind', 'option', 'statement', format('option "%s"', o.key), 'chosen', v_chosen, 'version_state', v.state),
    'method', jsonb_build_object('generator', 'dse-explain@1', 'reads', jsonb_build_array('decision.options (derived uncertainty)', 'simulation.run_decision_use')),
    'decision_use', jsonb_build_object('version_state', v.state, 'boundary', 'an option card informs the owner''s choice'),
    'information_boundary', jsonb_build_object('known_at', decision.iso(v.known_at), 'observed_through', v.observed_through),
    'provenance', jsonb_build_object('citations', o.consequences),
    'calibration_basis', (SELECT jsonb_agg(jsonb_build_object('run_id', b ->> 'id', 'validation_status', b ->> 'validation_status')) FROM jsonb_array_elements(coalesce(o.uncertainty -> 'basis', '[]'::jsonb)) b WHERE (b ->> 'kind') = 'run'),
    'sensitivity', (SELECT jsonb_agg(jsonb_build_object('run_id', b ->> 'id', 'sensitivity', b -> 'sensitivity')) FROM jsonb_array_elements(coalesce(o.uncertainty -> 'basis', '[]'::jsonb)) b WHERE (b ->> 'kind') = 'run'));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.dse_build_option(uuid, uuid, uuid) FROM PUBLIC;

/* THE FORECAST's draft: its SOURCE (the series' source contract) and the evidence versions it used (source evidence), the series' parsing
   (a deterministic transformation), the method and its distribution (model inference), its assumptions (human assessments), the baseline
   method as the competing hypothesis, its validation, label, fitness and synthetic state as limitations, and every appeal on the forecast
   OR ON ITS SOURCE as counter-evidence — the contested source is shown with its outcome. */
CREATE OR REPLACE FUNCTION decision.dse_build_forecast(p_tenant uuid, p_domain uuid, p_forecast uuid) RETURNS jsonb
STABLE SECURITY DEFINER SET search_path = decision, prediction, observation, graph, pg_catalog, pg_temp AS $$
DECLARE f prediction.forecasts_current%ROWTYPE; sr prediction.series_registry%ROWTYPE; s observation.source_contracts_current%ROWTYPE; a graph.strategy_current%ROWTYPE; d jsonb; v_items jsonb := '[]'::jsonb; v_ref jsonb; v_aid uuid; v_cites int; v_open int; v_conf text; v_grade text;
BEGIN
  SELECT * INTO f FROM prediction.forecasts_current z WHERE z.forecast_id = p_forecast AND z.tenant_id = p_tenant AND z.domain_id = p_domain;
  SELECT * INTO sr FROM prediction.series_registry z WHERE z.tenant_id = p_tenant AND z.domain_id = p_domain AND z.series_key = f.series_key;
  IF sr.source_key IS NOT NULL THEN
    SELECT * INTO s FROM observation.source_contracts_current z WHERE z.tenant_id = p_tenant AND z.domain_id = p_domain AND z.source_key = sr.source_key ORDER BY z.contract_version DESC LIMIT 1;
  END IF;
  v_ref := jsonb_build_object('kind', 'forecast', 'id', p_forecast);
  v_items := v_items || decision.dse_item('model_inference', 'conclusion', v_ref, 'statement', f.statement, false);
  IF s.source_id IS NOT NULL THEN
    v_items := v_items || decision.dse_item('source_evidence', 'support', jsonb_build_object('kind', 'source', 'id', s.source_id, 'version', s.contract_version, 'source_key', s.source_key), 'source',
      format('Source "%s" (%s, publisher %s): %s authority, %s data, %s acquisition, rights %s, contract %s', s.name, s.source_key, s.publisher, s.authority_class, s.data_origin, s.acquisition_mode, s.rights_state, s.lifecycle_state), false);
  ELSE
    v_items := v_items || decision.dse_item('source_evidence', 'limitation', jsonb_build_object('kind', 'series', 'key', f.series_key), 'source',
      format('The source behind series %s is not visible in this domain', f.series_key), true);
  END IF;
  FOR d IN SELECT * FROM jsonb_array_elements(f.drivers) LOOP
    IF (d ->> 'evidence_object_id') IS NOT NULL THEN
      v_items := v_items || decision.dse_item('source_evidence', 'support', jsonb_build_object('kind', 'evidence', 'id', d ->> 'evidence_object_id', 'version', (d ->> 'evidence_version')::int, 'digest', d ->> 'evidence_digest'), 'drivers',
        format('Evidence EVD %s@%s — the last observation of %s the forecast used (%s)', d ->> 'evidence_object_id', d ->> 'evidence_version', coalesce(d ->> 'series_key', f.series_key), coalesce(d ->> 'role', 'driver')), false);
    END IF;
  END LOOP;
  IF sr.series_key IS NOT NULL THEN
    v_items := v_items || decision.dse_item('deterministic_transformation', 'support', jsonb_build_object('kind', 'series', 'key', sr.series_key), 'series',
      format('Series %s is parsed from the source by %s (field %s, unit %s, seasonality %s day(s))', sr.series_key, sr.parser_ref, sr.value_field, sr.unit, sr.seasonality_days), false);
  END IF;
  v_items := v_items || decision.dse_item('model_inference', 'support', v_ref, 'method',
    format('Method %s@%s, horizon %s to %s, origin %s, known at %s: q10 %s, q50 %s, q90 %s', f.method, f.method_version, f.horizon_code, f.target_at, f.origin_at, decision.iso(f.known_at),
           f.quantiles ->> 'q10', f.quantiles ->> 'q50', f.quantiles ->> 'q90'), false);
  v_items := v_items || decision.dse_item('model_inference', 'competing_hypothesis', v_ref, 'baseline_method',
    format('The baseline method %s is the competing forecaster the method must beat', f.baseline_method), false);
  FOREACH v_aid IN ARRAY f.assumptions LOOP
    SELECT * INTO a FROM graph.strategy_current z WHERE z.strategy_object_id = v_aid;
    v_items := v_items || decision.dse_item('human_assessment', 'assumption', jsonb_build_object('kind', 'assumption', 'id', v_aid), 'assumptions',
      format('Assumption "%s": %s', coalesce(a.title, v_aid::text), coalesce(left(a.statement, 400), 'not visible')), true);
  END LOOP;
  v_items := v_items || decision.dse_item('deterministic_transformation', 'limitation', v_ref, 'validation',
    format('Validation: %s — %s', replace(f.validation_state, '_', ' '), f.validation_note), f.validation_state <> 'validated');
  IF f.label = 'replay demonstration' THEN
    v_items := v_items || decision.dse_item('deterministic_transformation', 'limitation', v_ref, 'label', 'A REPLAY DEMONSTRATION — not a live forecast', true);
  END IF;
  IF coalesce((f.controls ->> 'synthetic_state')::boolean, false) THEN
    v_items := v_items || decision.dse_item('deterministic_transformation', 'limitation', v_ref, 'controls', 'SYNTHETIC: at least one evidence version it rests on is synthetic', true);
  END IF;
  IF f.fitness_state <> 'none' THEN
    v_items := v_items || decision.dse_item('deterministic_transformation', CASE WHEN f.fitness_state = 'fit' THEN 'support' ELSE 'limitation' END, v_ref, 'fitness',
      format('Fitness: %s%s', f.fitness_state, coalesce(' (' || f.fitness_class || ')', '')), f.fitness_state <> 'fit');
  END IF;
  IF f.state IN ('withdrawn', 'superseded') THEN
    v_items := v_items || decision.dse_item('human_assessment', 'limitation', v_ref, 'state', format('The forecast is %s%s', f.state, coalesce(': ' || (f.withdrawal ->> 'reason'), '')), true);
  END IF;
  v_items := v_items || decision.dse_case_items(p_tenant, p_domain, 'forecast', p_forecast, 'forecast');
  IF s.source_id IS NOT NULL THEN v_items := v_items || decision.dse_case_items(p_tenant, p_domain, 'source', s.source_id, 'forecast''s source'); END IF;
  SELECT count(*) INTO v_cites FROM decision.options o WHERE o.tenant_id = p_tenant AND o.domain_id = p_domain AND o.consequences @> jsonb_build_array(jsonb_build_object('kind', 'forecast', 'id', p_forecast::text));
  SELECT count(*) INTO v_open FROM decision.appeal_cases c WHERE c.state IN ('opened', 'under_review') AND ((c.subject_kind = 'forecast' AND c.subject_id = p_forecast) OR (c.subject_kind = 'source' AND c.subject_id = s.source_id));
  v_conf := CASE f.validation_state WHEN 'validated' THEN 'backtested: ' || coalesce(f.skill::text, 'skill recorded') ELSE replace(f.validation_state, '_', ' ') || ': no accuracy is claimed' END;
  v_grade := CASE WHEN s.source_id IS NULL THEN 'unknown source'
                  WHEN v_open > 0 THEN 'contested' WHEN coalesce((f.controls ->> 'synthetic_state')::boolean, false) OR s.data_origin = 'synthetic' THEN 'synthetic (demonstration grade)'
                  WHEN s.authority_class = 'observational' THEN 'observational' ELSE 'authoritative' END;
  RETURN jsonb_build_object('items', v_items,
    'uncertainty', jsonb_build_object(
      'likelihood', jsonb_build_object('kind', 'forecast_probability', 'statement', 'the forecast''s own 10-90 band — a forecast probability, not a scenario plausibility',
                                       'q10', f.quantiles -> 'q10', 'q50', f.quantiles -> 'q50', 'q90', f.quantiles -> 'q90', 'target_at', f.target_at),
      'impact', jsonb_build_object('kind', 'not_stated', 'statement', 'a forecast states no impact: the decisions citing it carry the consequence', 'options_citing', v_cites),
      'confidence', jsonb_build_object('level', v_conf, 'validation_state', f.validation_state, 'fitness_state', f.fitness_state),
      'evidence_quality', jsonb_build_object('grade', v_grade, 'authority_class', s.authority_class, 'data_origin', s.data_origin, 'rights_state', s.rights_state, 'open_appeals', v_open),
      'disagreement', jsonb_build_object('model', format('the method against its baseline %s (the backtest''s skill)', f.baseline_method), 'open_appeals', v_open)),
    'conclusion', jsonb_build_object('kind', 'forecast', 'statement', f.statement, 'state', f.state),
    'method', jsonb_build_object('generator', 'dse-explain@1', 'reads', jsonb_build_array('prediction.forecasts_current', 'prediction.series_registry', 'observation.source_contracts_current', 'decision.appeal_cases'),
                                 'model', f.method || '@' || f.method_version),
    'decision_use', jsonb_build_object('state', f.state, 'boundary', 'a forecast informs; an option citing it is refused once it is withdrawn as unfit'),
    'information_boundary', jsonb_build_object('known_at', decision.iso(f.known_at), 'origin_at', f.origin_at, 'target_at', f.target_at),
    'provenance', jsonb_build_object('evidence_refs', f.evidence_refs, 'backtest_id', f.backtest_id),
    'calibration_basis', jsonb_build_object('validation_state', f.validation_state, 'skill', f.skill, 'backtest_id', f.backtest_id),
    'sensitivity', NULL);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.dse_build_forecast(uuid, uuid, uuid) FROM PUBLIC;

/* THE RUN's draft: its resolved initial state and inputs (deterministic transformations), its outputs (model inference), its decision use,
   validation, envelope and twin limitations, the promotion (a human assessment), the control run as the comparison. */
CREATE OR REPLACE FUNCTION decision.dse_build_run(p_tenant uuid, p_domain uuid, p_run uuid) RETURNS jsonb
STABLE SECURITY DEFINER SET search_path = decision, simulation, twin, pg_catalog, pg_temp AS $$
DECLARE r simulation.runs_current%ROWTYPE; u jsonb; tw twin.twins_current%ROWTYPE; v_items jsonb := '[]'::jsonb; v_ref jsonb; v_cites int; v_ch int;
BEGIN
  SELECT * INTO r FROM simulation.runs_current z WHERE z.run_id = p_run AND z.tenant_id = p_tenant AND z.domain_id = p_domain;
  SELECT * INTO tw FROM twin.twins_current z WHERE z.twin_id = r.twin_id;
  u := simulation.run_decision_use(p_run);
  v_ref := jsonb_build_object('kind', 'run', 'id', p_run);
  v_items := v_items || decision.dse_item('model_inference', 'conclusion', v_ref, 'outputs',
    format('Run %s (%s, component %s, model %s) %s; outputs digest %s', p_run, r.run_kind, r.component, r.model_ref, r.state, coalesce(r.outputs_digest, 'none')), false);
  v_items := v_items || decision.dse_item('deterministic_transformation', 'support', jsonb_build_object('kind', 'twin_version', 'id', r.twin_id, 'version', r.twin_version), 'initial_state',
    format('The initial state was resolved from twin %s v%s under known_at %s and observed_through %s (state digest %s)', r.twin_id, r.twin_version, decision.iso(r.known_at), coalesce(r.observed_through::text, 'unbounded'), r.initial_state_digest), false);
  v_items := v_items || decision.dse_item('deterministic_transformation', 'support', v_ref, 'inputs',
    format('Interventions %s, %s mode; inputs digest %s', r.interventions::text, r.stochastic_mode, r.inputs_digest), false);
  IF r.control_run_id IS NOT NULL THEN
    v_items := v_items || decision.dse_item('model_inference', 'competing_hypothesis', jsonb_build_object('kind', 'run', 'id', r.control_run_id), 'control_run_id',
      format('The control run %s (no intervention) is the comparison', r.control_run_id), false);
  END IF;
  IF r.sensitivity IS NOT NULL THEN
    v_items := v_items || decision.dse_item('model_inference', 'sensitivity', v_ref, 'sensitivity', format('Sensitivity: %s', left((r.sensitivity - 'factors')::text, 600)), false);
  END IF;
  v_items := v_items || decision.dse_item('deterministic_transformation', CASE WHEN (u ->> 'use') = 'decision' THEN 'support' ELSE 'limitation' END, v_ref, 'decision_use',
    format('Decision use: %s', u ->> 'label'), (u ->> 'use') <> 'decision');
  IF r.promoted_for IS NOT NULL THEN
    v_items := v_items || decision.dse_item('human_assessment', 'support', jsonb_build_object('kind', 'promotion', 'id', r.promotion_id), 'promotion', format('A reviewer promoted the result as fit for "%s"', r.promoted_for), false);
  END IF;
  v_items := v_items || decision.dse_item('deterministic_transformation', 'limitation', v_ref, 'validation_status', format('Validation status: %s', r.validation_status), r.validation_status NOT IN ('validated', 'validated_retrospective'));
  IF coalesce(r.outside_envelope, false) OR r.envelope_state = 'outside' THEN
    v_items := v_items || decision.dse_item('deterministic_transformation', 'limitation', v_ref, 'envelope', 'The run ran outside the twin''s validated envelope', true);
  END IF;
  IF tw.validation IS NOT NULL AND jsonb_array_length(coalesce(tw.validation -> 'limitations', '[]'::jsonb)) > 0 THEN
    v_items := v_items || decision.dse_item('human_assessment', 'limitation', jsonb_build_object('kind', 'twin', 'id', r.twin_id), 'twin_validation',
      format('Twin limitations: %s (%s)', (SELECT string_agg(x #>> '{}', '; ') FROM jsonb_array_elements(tw.validation -> 'limitations') x), coalesce(tw.validation ->> 'status', 'unstated')), true);
  END IF;
  SELECT count(*) INTO v_ch FROM simulation.challenges c WHERE c.run_id = p_run AND c.state IN ('open', 'rerun_requested');
  SELECT count(*) INTO v_cites FROM decision.options o WHERE o.tenant_id = p_tenant AND o.domain_id = p_domain AND o.consequences @> jsonb_build_array(jsonb_build_object('kind', 'run', 'id', p_run::text));
  RETURN jsonb_build_object('items', v_items,
    'uncertainty', jsonb_build_object(
      'likelihood', jsonb_build_object('kind', CASE WHEN r.stochastic_mode = 'seeded' THEN 'sampled_distribution' ELSE 'not_stated' END,
                                       'statement', CASE WHEN r.stochastic_mode = 'seeded' THEN format('%s seeded sample path(s): a sampled spread, not a probability of the scenario', r.samples) ELSE 'a deterministic run states no likelihood' END),
      'impact', jsonb_build_object('kind', 'simulated_consequence', 'statement', 'the simulated outputs against the control run', 'outputs_digest', r.outputs_digest, 'options_citing', v_cites),
      'confidence', jsonb_build_object('level', u ->> 'use', 'label', u ->> 'label', 'validation_status', r.validation_status),
      'evidence_quality', jsonb_build_object('grade', CASE WHEN r.envelope_state = 'outside' OR coalesce(r.outside_envelope, false) THEN 'outside the envelope' ELSE coalesce(tw.validation ->> 'status', 'unstated') END,
                                             'twin_fitness', r.twin_fitness, 'envelope_state', r.envelope_state),
      'disagreement', jsonb_build_object('open_challenges', v_ch, 'model', 'one model; no ensemble')),
    'conclusion', jsonb_build_object('kind', 'run', 'statement', format('run %s %s', p_run, r.state), 'state', r.state, 'validity', r.validity),
    'method', jsonb_build_object('generator', 'dse-explain@1', 'reads', jsonb_build_array('simulation.runs_current', 'simulation.run_decision_use', 'twin.twins_current'), 'model', r.model_ref, 'implementation_digest', r.implementation_digest),
    'decision_use', u,
    'information_boundary', jsonb_build_object('known_at', decision.iso(r.known_at), 'observed_through', r.observed_through, 'twin_version', r.twin_version),
    'provenance', jsonb_build_object('initial_state_digest', r.initial_state_digest, 'inputs_digest', r.inputs_digest, 'outputs_digest', r.outputs_digest, 'environment_digest', r.environment_digest, 'header_digest', r.header_digest),
    'calibration_basis', jsonb_build_object('validation_status', r.validation_status, 'twin_validation', tw.validation),
    'sensitivity', r.sensitivity);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.dse_build_run(uuid, uuid, uuid) FROM PUBLIC;

/* THE RECOMMENDATION's draft (§R's row, read by to_regclass; its column names are the map's: what, for_whom, by_when, assumptions,
   what_could_make_it_wrong, missing_evidence, value_judgments, policy_constraints, analytical_assumptions, model_outputs, author_kind):
   the recommendation itself is the AUTHOR's (an agent's judgment or a human's assessment); value judgments are the author's; policy
   constraints are the package's policy; model outputs are model inference; what could make it wrong are the counterfactuals (material);
   the missing evidence is a limitation (material). */
CREATE OR REPLACE FUNCTION decision.dse_build_recommendation(p_tenant uuid, p_domain uuid, p_subject jsonb) RETURNS jsonb
STABLE SECURITY DEFINER SET search_path = decision, pg_catalog, pg_temp AS $$
DECLARE rec jsonb := p_subject -> 'recommendation'; v_items jsonb := '[]'::jsonb; v_cat text; v_ref jsonb; e jsonb; k text; m record;
BEGIN
  v_cat := CASE WHEN coalesce(rec ->> 'author_kind', 'human') = 'agent' THEN 'agent_judgment' ELSE 'human_assessment' END;
  v_ref := jsonb_build_object('kind', 'recommendation', 'id', p_subject ->> 'id');
  v_items := v_items || decision.dse_item(v_cat, 'conclusion', v_ref, 'what',
    format('Recommends %s for %s by %s (option "%s"; author: %s)', coalesce(rec ->> 'what', '(unstated)'), coalesce(rec ->> 'for_whom', '(unstated)'), coalesce(rec ->> 'by_when', '(unstated)'),
           coalesce(rec ->> 'option_key', '?'), CASE v_cat WHEN 'agent_judgment' THEN 'the decision agent' ELSE 'a named human' END), false);
  FOR m IN SELECT * FROM (VALUES ('value_judgments', v_cat, 'assumption', false), ('policy_constraints', 'human_assessment', 'policy', true), ('analytical_assumptions', v_cat, 'assumption', false),
                                 ('assumptions', v_cat, 'assumption', false), ('model_outputs', 'model_inference', 'support', false), ('what_could_make_it_wrong', v_cat, 'counterfactual', true),
                                 ('missing_evidence', v_cat, 'limitation', true)) AS t(key, category, role, material) LOOP
    FOR e IN SELECT * FROM jsonb_array_elements(CASE WHEN jsonb_typeof(rec -> m.key) = 'array' THEN rec -> m.key ELSE '[]'::jsonb END) LOOP
      v_items := v_items || decision.dse_item(m.category, m.role, v_ref || jsonb_build_object('source', e -> 'source'), m.key, replace(m.key, '_', ' ') || ': ' || decision.dse_text(e), m.material);
    END LOOP;
  END LOOP;
  v_items := v_items || decision.dse_case_items(p_tenant, p_domain, 'recommendation', (p_subject ->> 'id')::uuid, 'recommendation');
  RETURN jsonb_build_object('items', v_items,
    'uncertainty', jsonb_build_object('likelihood', jsonb_build_object('kind', 'not_stated', 'statement', 'a recommendation states no probability of its own'),
                                      'impact', jsonb_build_object('kind', 'stated_consequence', 'statement', coalesce(rec ->> 'what', '(unstated)')),
                                      'confidence', jsonb_build_object('level', 'the author''s; see what could make it wrong'),
                                      'evidence_quality', jsonb_build_object('grade', CASE WHEN jsonb_array_length(coalesce(rec -> 'missing_evidence', '[]'::jsonb)) > 0 THEN 'incomplete (missing evidence named)' ELSE 'as cited' END),
                                      'disagreement', jsonb_build_object('model', 'not measured')),
    'conclusion', jsonb_build_object('kind', 'recommendation', 'statement', coalesce(rec ->> 'what', '(unstated)'), 'state', rec ->> 'state', 'author_kind', coalesce(rec ->> 'author_kind', 'human')),
    'method', jsonb_build_object('generator', 'dse-explain@1', 'reads', jsonb_build_array('decision.recommendations (§R, via to_regclass)')),
    'decision_use', jsonb_build_object('state', rec ->> 'state', 'boundary', 'a recommendation is considered by named humans; it decides nothing'),
    'information_boundary', jsonb_build_object('package_id', rec ->> 'package_id', 'version', rec ->> 'version'),
    'provenance', jsonb_build_object('digest', p_subject ->> 'digest'), 'calibration_basis', NULL, 'sensitivity', NULL);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.dse_build_recommendation(uuid, uuid, jsonb) FROM PUBLIC;

/* THE ANALYSIS's draft (§A's decision.package_analysis read, via to_regprocedure): the server-computed ranking and scores are deterministic
   transformations; the criteria weights are the value-judgment owner's (human assessments); the sensitivity, the trade-offs, the value of
   information, the obligations and the adversarial responses each their own item. */
CREATE OR REPLACE FUNCTION decision.dse_build_analysis(p_subject jsonb) RETURNS jsonb
STABLE SECURITY DEFINER SET search_path = decision, pg_catalog, pg_temp AS $$
DECLARE an jsonb := p_subject -> 'analysis'; v_items jsonb := '[]'::jsonb; v_ref jsonb; k text; val jsonb; v_cat text; v_role text; v_mat boolean;
BEGIN
  v_ref := jsonb_build_object('kind', 'analysis', 'id', p_subject ->> 'id', 'version', (p_subject ->> 'version')::int);
  v_items := v_items || decision.dse_item('deterministic_transformation', 'conclusion', v_ref, 'ranking', format('The server-computed analysis of %s', p_subject ->> 'title'), false);
  FOR k, val IN SELECT * FROM jsonb_each(CASE WHEN jsonb_typeof(an) = 'object' THEN an ELSE '{}'::jsonb END) ORDER BY 1 LOOP
    v_cat := CASE WHEN k IN ('criteria', 'weights') THEN 'human_assessment' WHEN k IN ('voi', 'value_of_information', 'adversarial', 'second_order', 'second_order_effects') THEN 'model_inference' ELSE 'deterministic_transformation' END;
    v_role := CASE WHEN k IN ('criteria', 'weights') THEN 'assumption' WHEN k LIKE '%sensitivity%' OR k IN ('voi', 'value_of_information') THEN 'sensitivity' WHEN k LIKE '%trade%' THEN 'effect'
                   WHEN k LIKE '%obligation%' THEN 'policy' WHEN k LIKE '%adversarial%' THEN 'competing_hypothesis' ELSE 'support' END;
    v_mat := k LIKE '%obligation%' OR k LIKE '%adversarial%';
    v_items := v_items || decision.dse_item(v_cat, v_role, v_ref || jsonb_build_object('field', k), k, format('%s: %s', replace(k, '_', ' '), left(val::text, 600)), v_mat);
  END LOOP;
  RETURN jsonb_build_object('items', v_items,
    'uncertainty', jsonb_build_object('likelihood', jsonb_build_object('kind', 'not_stated', 'statement', 'the analysis scores options; it states no probability'),
                                      'impact', jsonb_build_object('kind', 'scored_criteria', 'statement', 'the options'' weighted scores on the criteria'),
                                      'confidence', jsonb_build_object('level', 'see the weight sensitivity'), 'evidence_quality', jsonb_build_object('grade', 'as assessed per option and criterion'),
                                      'disagreement', jsonb_build_object('model', 'not measured')),
    'conclusion', jsonb_build_object('kind', 'analysis', 'statement', p_subject ->> 'title'),
    'method', jsonb_build_object('generator', 'dse-explain@1', 'reads', jsonb_build_array('decision.package_analysis (§A, via to_regprocedure)')),
    'decision_use', jsonb_build_object('boundary', 'an analysis informs the owner; it decides nothing'),
    'information_boundary', jsonb_build_object('package_id', p_subject ->> 'id', 'version', p_subject ->> 'version'),
    'provenance', jsonb_build_object('digest', p_subject ->> 'digest'), 'calibration_basis', NULL, 'sensitivity', an -> 'sensitivity');
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.dse_build_analysis(jsonb) FROM PUBLIC;

/* THE FINALIZER: the items numbered I1..In, the role lists, the App. L contract (every field present — or `none` stated, or contractually
   `inapplicable` with its reason, or `missing` with its reason: a missing field makes the explanation PARTIAL), the integrity digest over
   the subject's digest, the items, the uncertainty and the contract (an explanation that would be built identically is not written twice). */
CREATE OR REPLACE FUNCTION decision.dse_finalize(p_kind text, p_subject jsonb, p_draft jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path = decision, pg_catalog, pg_temp AS $$
DECLARE v_items jsonb := '[]'::jsonb; i jsonb; n int := 0; c jsonb; v_partial boolean; v_body jsonb;
BEGIN
  FOR i IN SELECT * FROM jsonb_array_elements(p_draft -> 'items') LOOP
    n := n + 1;
    v_items := v_items || (jsonb_build_object('id', 'I' || n) || i);
  END LOOP;
  c := jsonb_build_object(
    'product_and_version', jsonb_build_object('kind', p_kind, 'id', p_subject ->> 'id', 'version', p_subject -> 'version', 'digest', p_subject ->> 'digest'),
    'decision_use', p_draft -> 'decision_use',
    'audience_profile', jsonb_build_object('inapplicable', 'the structured product is audience-neutral; each rendering states its audience (role, language, accessibility)'),
    'conclusion', jsonb_build_object('value', p_draft -> 'conclusion', 'items', decision.dse_ids(v_items, ARRAY['conclusion'], NULL)),
    'claim_map', decision.dse_present(decision.dse_ids(v_items, ARRAY['conclusion', 'support'], NULL), 'missing', 'no material claim is mapped'),
    'evidence_map', decision.dse_present(decision.dse_ids(v_items, NULL, ARRAY['source_evidence']), 'none', 'no source evidence is cited directly'),
    'counter_evidence', decision.dse_present(decision.dse_ids(v_items, ARRAY['counter_evidence', 'dissent'], NULL), 'none', 'no contradictory or weakening evidence is recorded'),
    'method', p_draft -> 'method',
    'model_and_agent_roles', decision.dse_present(decision.dse_ids(v_items, NULL, ARRAY['model_inference', 'agent_judgment']), 'none', 'no model or agent contributed'),
    'assumptions', decision.dse_present(decision.dse_ids(v_items, ARRAY['assumption'], NULL), 'none', 'no explicit assumption is recorded'),
    'alternatives', decision.dse_present(decision.dse_ids(v_items, ARRAY['competing_hypothesis'], NULL), 'missing', 'no competing hypothesis, option, scenario or method is recorded'),
    'uncertainty', p_draft -> 'uncertainty',
    'calibration_basis', CASE WHEN p_draft -> 'calibration_basis' IS NULL OR jsonb_typeof(p_draft -> 'calibration_basis') = 'null' THEN jsonb_build_object('inapplicable', 'the subject states no calibrated quantity of its own')
                              ELSE jsonb_build_object('value', p_draft -> 'calibration_basis') END,
    'sensitivity', CASE WHEN jsonb_array_length(decision.dse_ids(v_items, ARRAY['sensitivity'], NULL)) > 0 OR (p_draft -> 'sensitivity' IS NOT NULL AND jsonb_typeof(p_draft -> 'sensitivity') <> 'null')
                        THEN jsonb_build_object('items', decision.dse_ids(v_items, ARRAY['sensitivity'], NULL), 'value', p_draft -> 'sensitivity')
                        ELSE jsonb_build_object('missing', 'no sensitivity of the result to its inputs is recorded') END,
    'counterfactuals', CASE WHEN jsonb_array_length(decision.dse_ids(v_items, ARRAY['counterfactual'], NULL)) > 0 THEN jsonb_build_object('items', decision.dse_ids(v_items, ARRAY['counterfactual'], NULL))
                            WHEN jsonb_array_length(decision.dse_ids(v_items, ARRAY['assumption'], NULL)) > 0 THEN jsonb_build_object('items', decision.dse_ids(v_items, ARRAY['assumption'], NULL), 'note', 'the conclusion changes when an assumption fails')
                            ELSE jsonb_build_object('missing', 'no condition under which the conclusion would change is recorded') END,
    'limitations', decision.dse_present(decision.dse_ids(v_items, ARRAY['limitation'], NULL), 'none', 'no limitation is recorded'),
    'dissent', decision.dse_present(decision.dse_ids(v_items, ARRAY['dissent'], NULL), 'none', 'no dissent is recorded'),
    'policy_and_authority', decision.dse_present(decision.dse_ids(v_items, ARRAY['policy'], NULL), 'inapplicable', 'no policy gate applies to this product itself'),
    'expected_effects', decision.dse_present(decision.dse_ids(v_items, ARRAY['effect'], NULL), 'inapplicable', 'the product states no effect of its own'),
    'provenance_ref', p_draft -> 'provenance',
    'information_boundary', p_draft -> 'information_boundary',
    'contest_path', jsonb_build_object('appeal', '/decisions/appeals', 'standing_rule', 'standing v1', 'subject_kinds', jsonb_build_array('package', 'forecast', 'source', 'claim', 'recommendation', 'explanation'),
                                       'note', 'a contest never alters the original record; an upheld appeal of a decided package requires its reopening'),
    'withheld_scope', decision.dse_present(decision.dse_ids(v_items, NULL, NULL, true), 'none', 'no policy-protected evidence is withheld'));
  SELECT EXISTS (SELECT 1 FROM jsonb_each(c) e WHERE jsonb_typeof(e.value) = 'object' AND e.value ? 'missing') INTO v_partial;
  c := c || jsonb_build_object('faithfulness_state', CASE WHEN v_partial THEN 'partial' ELSE 'complete' END);
  v_body := jsonb_build_object('subject', c -> 'product_and_version', 'generator', 'dse-explain@1', 'conclusion', p_draft -> 'conclusion', 'items', v_items, 'uncertainty', p_draft -> 'uncertainty', 'contract', c);
  RETURN jsonb_build_object('items', v_items, 'contract', c, 'faithfulness_state', CASE WHEN v_partial THEN 'partial' ELSE 'complete' END, 'integrity_digest', decision.dse_digest(v_body),
    'counter_evidence', decision.dse_ids(v_items, ARRAY['counter_evidence', 'dissent'], NULL), 'competing_hypotheses', decision.dse_ids(v_items, ARRAY['competing_hypothesis'], NULL),
    'limitations', decision.dse_ids(v_items, ARRAY['limitation'], NULL));
END $$;

/* The ids of the items with one of the roles (NULL: any), one of the categories (NULL: any), withheld (when asked). */
CREATE OR REPLACE FUNCTION decision.dse_ids(p_items jsonb, p_roles text[], p_categories text[], p_withheld boolean DEFAULT NULL) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT coalesce(jsonb_agg(i -> 'id' ORDER BY ord), '[]'::jsonb) FROM jsonb_array_elements(p_items) WITH ORDINALITY AS t(i, ord)
   WHERE (p_roles IS NULL OR (i ->> 'role') = ANY (p_roles)) AND (p_categories IS NULL OR (i ->> 'category') = ANY (p_categories))
     AND (p_withheld IS NULL OR coalesce((i ->> 'withheld')::boolean, false) = p_withheld) $$;
/* A contract field: the items, or the stated absence (`none` / `inapplicable` / `missing`) with its reason. */
CREATE OR REPLACE FUNCTION decision.dse_present(p_ids jsonb, p_absence text, p_reason text) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT CASE WHEN jsonb_array_length(p_ids) > 0 THEN jsonb_build_object('items', p_ids) ELSE jsonb_build_object(p_absence, p_reason) END $$;
GRANT EXECUTE ON FUNCTION decision.dse_ids(jsonb, text[], text[], boolean) TO eye_app, eye_commit;
GRANT EXECUTE ON FUNCTION decision.dse_present(jsonb, text, text) TO eye_app, eye_commit;
GRANT EXECUTE ON FUNCTION decision.dse_finalize(text, jsonb, jsonb) TO eye_app, eye_commit;

/* THE FAITHFULNESS CHECK v1 (AI-04-004, AI-64-004, AG-040, AR-019) — a rendering against its explanation's items, sentence by sentence:
     unsupported        a sentence cites no item;
     unknown_item       a sentence cites an id the explanation does not hold;
     unsupported_figure a sentence states a figure that no cited item states (an item id like I3 is not a figure);
     hidden_cognition   a sentence implies access to a model's or an agent's inner cognition ("the model believes …");
     false_certainty    a sentence asserts certainty no explanation item carries ("certainly", "guaranteed", "no risk" …);
     omits_material     a MATERIAL item (a material limitation, counter-evidence, dissent, risk, constraint, assumption) is cited by no sentence.
   Faithful when no finding; the rule is declarative and the same in the web's preview (apps/web/lib/explanation-b35.ts). */
CREATE OR REPLACE FUNCTION decision.dse_faithfulness(p_items jsonb, p_sentences jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path = decision, pg_catalog, pg_temp AS $$
DECLARE s jsonb; k int := 0; v_text text; v_cites jsonb; c jsonb; v_known jsonb; v_findings jsonb := '[]'::jsonb; v_cited jsonb := '[]'::jsonb; v_basis text; m text; v_missing jsonb;
BEGIN
  SELECT coalesce(jsonb_agg(i -> 'id'), '[]'::jsonb) INTO v_known FROM jsonb_array_elements(p_items) i;
  FOR s IN SELECT * FROM jsonb_array_elements(p_sentences) LOOP
    k := k + 1;
    v_text := CASE WHEN jsonb_typeof(s) = 'object' THEN btrim(coalesce(s ->> 'text', '')) ELSE '' END;
    v_cites := CASE WHEN jsonb_typeof(s) = 'object' AND jsonb_typeof(s -> 'cites') = 'array' THEN s -> 'cites' ELSE '[]'::jsonb END;
    IF length(v_text) NOT BETWEEN 8 AND 1000 THEN
      v_findings := v_findings || jsonb_build_object('sentence', k, 'rule', 'shape', 'detail', 'a sentence is 8 to 1000 characters with its cited item ids');
      CONTINUE;
    END IF;
    IF jsonb_array_length(v_cites) = 0 THEN
      v_findings := v_findings || jsonb_build_object('sentence', k, 'rule', 'unsupported', 'detail', 'the sentence cites no explanation item');
    END IF;
    v_basis := '';
    FOR c IN SELECT * FROM jsonb_array_elements(v_cites) LOOP
      IF NOT (v_known @> jsonb_build_array(c)) THEN
        v_findings := v_findings || jsonb_build_object('sentence', k, 'rule', 'unknown_item', 'detail', format('%s is not an item of this explanation', c #>> '{}'));
      ELSE
        v_cited := v_cited || jsonb_build_array(c);
        v_basis := v_basis || ' ' || coalesce((SELECT i ->> 'statement' FROM jsonb_array_elements(p_items) i WHERE i -> 'id' = c LIMIT 1), '');
      END IF;
    END LOOP;
    FOR m IN SELECT (regexp_matches(regexp_replace(v_text, '\mI[0-9]+\M', '', 'g'), '[0-9]+(?:[.,][0-9]+)*', 'g'))[1] LOOP
      IF position(m IN v_basis) = 0 THEN
        v_findings := v_findings || jsonb_build_object('sentence', k, 'rule', 'unsupported_figure', 'detail', format('the figure %s is stated by no cited item', m));
      END IF;
    END LOOP;
    IF v_text ~* '\m(model|agent|ai|algorithm|system|machine)\s+(thinks|thought|believes|believed|feels|felt|knows|knew|wants|wanted|intends|intended|understands|understood|realises|realised|realizes|realized)\M' THEN
      v_findings := v_findings || jsonb_build_object('sentence', k, 'rule', 'hidden_cognition', 'detail', 'the sentence implies access to a model''s or an agent''s inner cognition');
    END IF;
    IF v_text ~* '\m(certainly|definitely|guaranteed|guarantees|undoubtedly|indisputabl[a-z]*|risk-free|no risk|cannot fail|beyond doubt|without (any )?doubt)\M' THEN
      v_findings := v_findings || jsonb_build_object('sentence', k, 'rule', 'false_certainty', 'detail', 'the sentence asserts a certainty no explanation item carries');
    END IF;
  END LOOP;
  SELECT coalesce(jsonb_agg(i -> 'id'), '[]'::jsonb) INTO v_missing FROM jsonb_array_elements(p_items) i
   WHERE coalesce((i ->> 'material')::boolean, false) AND NOT (v_cited @> jsonb_build_array(i -> 'id'));
  IF jsonb_array_length(v_missing) > 0 THEN
    v_findings := v_findings || jsonb_build_object('sentence', NULL, 'rule', 'omits_material', 'detail', format('material item(s) %s are cited by no sentence: a simplification may not omit a decision-relevant caveat', v_missing::text), 'items', v_missing);
  END IF;
  RETURN jsonb_build_object('rule', 'faithfulness v1', 'faithful', jsonb_array_length(v_findings) = 0, 'findings', v_findings, 'sentences', k,
                            'cited_items', (SELECT coalesce(jsonb_agg(DISTINCT x), '[]'::jsonb) FROM jsonb_array_elements(v_cited) x),
                            'material_items', (SELECT coalesce(jsonb_agg(i -> 'id'), '[]'::jsonb) FROM jsonb_array_elements(p_items) i WHERE coalesce((i ->> 'material')::boolean, false)));
END $$;
GRANT EXECUTE ON FUNCTION decision.dse_faithfulness(jsonb, jsonb) TO eye_app, eye_commit;

/* The explanation as a reader sees it, with its READ-TIME state (App. L faithfulness_state): superseded (a newer version of the subject's
   explanation exists), stale (the subject's state moved since generation — said so, with both digests), contested (an open case on the
   subject or on this explanation), corrected (a case upheld after its generation); else as generated (complete | partial). */
CREATE OR REPLACE FUNCTION decision.dse_explanation_json(x decision.explanations) RETURNS jsonb
STABLE SET search_path = decision, pg_catalog, pg_temp AS $$
DECLARE sub jsonb; v_newer decision.explanations%ROWTYPE; v_open jsonb; v_upheld jsonb; v_state text; v_fs text; v_stale boolean;
BEGIN
  sub := decision.dse_subject(x.tenant_id, x.domain_id, x.subject_kind, x.subject_id, x.subject_version);
  SELECT * INTO v_newer FROM decision.explanations z WHERE z.subject_kind = x.subject_kind AND z.subject_id = x.subject_id AND z.subject_version IS NOT DISTINCT FROM x.subject_version
     AND z.explanation_version > x.explanation_version ORDER BY z.explanation_version DESC LIMIT 1;
  SELECT coalesce(jsonb_agg(c.case_id ORDER BY c.opened_at), '[]'::jsonb) INTO v_open FROM decision.appeal_cases c
   WHERE c.state IN ('opened', 'under_review') AND ((c.subject_kind = 'explanation' AND c.subject_id = x.explanation_id)
     OR (c.subject_id = x.subject_id AND c.subject_kind = CASE x.subject_kind WHEN 'package_version' THEN 'package' WHEN 'option' THEN '-' WHEN 'run' THEN '-' WHEN 'analysis' THEN '-' ELSE x.subject_kind END));
  SELECT coalesce(jsonb_agg(c.case_id ORDER BY c.adjudicated_at), '[]'::jsonb) INTO v_upheld FROM decision.appeal_cases c
   WHERE c.outcome IN ('upheld', 'partly_upheld') AND c.adjudicated_at > x.generated_at AND ((c.subject_kind = 'explanation' AND c.subject_id = x.explanation_id)
     OR (c.subject_id = x.subject_id AND c.subject_kind = CASE x.subject_kind WHEN 'package_version' THEN 'package' WHEN 'option' THEN '-' WHEN 'run' THEN '-' WHEN 'analysis' THEN '-' ELSE x.subject_kind END));
  v_stale := sub IS NULL OR coalesce((sub ->> 'unavailable')::boolean, false) OR (sub ->> 'digest') IS DISTINCT FROM x.subject_digest;
  v_state := CASE WHEN v_newer.explanation_id IS NOT NULL THEN 'superseded' WHEN v_stale THEN 'stale' ELSE 'current' END;
  v_fs := CASE WHEN v_newer.explanation_id IS NOT NULL THEN 'superseded' WHEN jsonb_array_length(v_open) > 0 THEN 'contested' WHEN jsonb_array_length(v_upheld) > 0 THEN 'corrected' ELSE x.faithfulness_state END;
  RETURN (to_jsonb(x) - 'scope' - 'tenant_id' - 'domain_id' - 'correlation_id')
    || jsonb_build_object('status', jsonb_build_object('state', v_state, 'faithfulness_state', v_fs, 'superseded_by', v_newer.explanation_id,
         'stale', v_stale, 'stale_reason', CASE WHEN v_stale THEN CASE WHEN sub IS NULL THEN 'the subject is no longer visible' WHEN coalesce((sub ->> 'unavailable')::boolean, false) THEN sub ->> 'reason'
                                                     ELSE format('the subject''s state moved since generation: digest %s then, %s now — generate the explanation again', x.subject_digest, sub ->> 'digest') END END,
         'subject_digest_now', sub ->> 'digest', 'contested_by', v_open, 'corrected_by', v_upheld));
END $$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION decision.dse_explanation_json(decision.explanations) TO eye_app, eye_commit;

/* THE CASE's helpers: the JSON a reader sees, the event (the case's own ledger), the notification (one appeal.notified event per recipient —
   the cause of its decision.appeal item: the 0099 sio_notify idiom), the lock, the bench, the standing rule v1, the impact. */
CREATE OR REPLACE FUNCTION decision.dse_case_json(c decision.appeal_cases) RETURNS jsonb
STABLE SET search_path = decision, pg_catalog, pg_temp AS $$
  SELECT (to_jsonb(c) - 'scope' - 'tenant_id' - 'domain_id' - 'correlation_id')
         || jsonb_build_object('overdue', c.state IN ('opened', 'under_review') AND c.deadline_at < clock_timestamp(), 'as_of', decision.iso(clock_timestamp()))
$$ LANGUAGE sql;
GRANT EXECUTE ON FUNCTION decision.dse_case_json(decision.appeal_cases) TO eye_app, eye_commit;

CREATE OR REPLACE FUNCTION decision.dse_case_event(c decision.appeal_cases, p_event text, p_actor uuid, p_details jsonb, p_correlation uuid, p_event_id uuid DEFAULT NULL) RETURNS uuid
SET search_path = decision, pg_catalog, pg_temp AS $$
DECLARE v uuid := coalesce(p_event_id, gen_random_uuid());
BEGIN
  INSERT INTO decision.appeal_events (event_id, scope, tenant_id, domain_id, case_id, event, actor_principal_id, details, correlation_id)
  VALUES (v, 'DOMAIN', c.tenant_id, c.domain_id, c.case_id, p_event, p_actor, coalesce(p_details, '{}'::jsonb), p_correlation);
  RETURN v;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.dse_case_event(decision.appeal_cases, text, uuid, jsonb, uuid, uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION decision.dse_bench() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY['decision_authority', 'executive', 'domain_admin', 'auditor'] $$;
GRANT EXECUTE ON FUNCTION decision.dse_bench() TO eye_app, eye_commit;

CREATE OR REPLACE FUNCTION decision.dse_notify(c decision.appeal_cases, p_reason text, p_title text, p_owner uuid, p_roles text[], p_due timestamptz, p_actor uuid, p_correlation uuid) RETURNS uuid
SECURITY DEFINER SET search_path = executive, identity, decision, pg_catalog, pg_temp AS $$
DECLARE v_item uuid := gen_random_uuid(); v_state text; v_cause uuid;
BEGIN
  v_cause := decision.dse_case_event(c, 'appeal.notified', p_actor, jsonb_build_object('reason', p_reason, 'recipient', p_owner, 'route_roles', to_jsonb(coalesce(p_roles, '{}')), 'item_id', v_item), p_correlation);
  v_state := CASE WHEN p_owner IS NOT NULL THEN CASE WHEN decision.is_active_human(p_owner, c.tenant_id) THEN 'open' ELSE 'unrouted' END
                  ELSE CASE WHEN executive.role_holders(c.tenant_id, c.domain_id, p_roles) > 0 THEN 'open' ELSE 'unrouted' END END;
  INSERT INTO executive.attention_items (item_id, scope, tenant_id, domain_id, signal_class, subject_kind, subject_id, cause_event_id, cause_event_type, title, outcome, state, owner_principal_id, route_roles, evaluation, details, due_at, escalations, correlation_id)
  VALUES (v_item, 'DOMAIN', c.tenant_id, c.domain_id, 'decision.appeal', 'appeal_case', c.case_id, v_cause, 'appeal.notified', left(p_title, 512), 'material', v_state, p_owner, coalesce(p_roles, '{}'),
          jsonb_build_object('outcome', 'material', 'reasons', jsonb_build_array(p_reason), 'policy_version', NULL, 'dimensions', jsonb_build_object('consequence', 'C2', 'confidence', 1)),
          jsonb_build_object('case_id', c.case_id, 'reason', p_reason, 'subject_kind', c.subject_kind, 'subject_id', c.subject_id, 'subject_title', c.subject_title, 'deadline_at', c.deadline_at, 'state', c.state), p_due, 0, p_correlation);
  PERFORM executive.attention_event(v_item, c.tenant_id, c.domain_id, CASE v_state WHEN 'open' THEN 'item.routed' ELSE 'item.unrouted' END, p_actor,
            jsonb_build_object('outcome', 'material', 'reasons', jsonb_build_array(p_reason), 'policy_version', NULL, 'owner', p_owner, 'route_roles', to_jsonb(coalesce(p_roles, '{}')), 'due_at', p_due,
                               'cause_event_id', v_cause, 'cause_event_type', 'appeal.notified', 'unrouted', v_state = 'unrouted', 'case_id', c.case_id), p_correlation);
  RETURN v_item;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.dse_notify(decision.appeal_cases, text, text, uuid, text[], timestamptz, uuid, uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION decision.dse_lock_case(p_case_id uuid, p_tenant uuid, p_domain uuid) RETURNS decision.appeal_cases
SET search_path = decision, pg_catalog, pg_temp AS $$
DECLARE c decision.appeal_cases%ROWTYPE;
BEGIN
  SELECT * INTO c FROM decision.appeal_cases x WHERE x.case_id = p_case_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'appeal rejected (unknown_case): % is not an appeal case of this domain', p_case_id USING ERRCODE = '23503'; END IF;
  RETURN c;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.dse_lock_case(uuid, uuid, uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION decision.dse_assert_actor(p_actor uuid, p_noun text) RETURNS void
SET search_path = decision, public, pg_catalog, pg_temp AS $$
BEGIN
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION '% rejected (actor): recorded by the acting principal', p_noun USING ERRCODE = '42501'; END IF;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.dse_assert_actor(uuid, text) FROM PUBLIC;

/* STANDING v1 (who may contest what; AI-64-002): a package or a recommendation — a member of the package's room, or a holder of a decision,
   strategy, analyst or risk role; a forecast, a source or a claim — a holder of a strategy, forecast, twin, analyst, decision, executive or risk
   role; an explanation — any of them; the tenant's auditor contests anything. NULL: no standing. */
CREATE OR REPLACE FUNCTION decision.dse_standing(p_kind text, p_tenant uuid, p_domain uuid, p_actor uuid, p_package uuid) RETURNS jsonb
STABLE SECURITY DEFINER SET search_path = decision, executive, pg_catalog, pg_temp AS $$
DECLARE v_room uuid; v_role text; v_roles text[];
BEGIN
  IF p_package IS NOT NULL AND p_kind IN ('package', 'recommendation', 'explanation') THEN
    SELECT r.room_id INTO v_room FROM executive.rooms_current r WHERE r.package_id = p_package;
    IF v_room IS NOT NULL AND executive.is_member(v_room, p_actor) THEN RETURN jsonb_build_object('rule', 'standing v1', 'basis', 'room_member', 'room_id', v_room); END IF;
  END IF;
  v_roles := CASE p_kind WHEN 'package' THEN ARRAY['decision_owner', 'decision_approver', 'decision_authority', 'executive', 'strategy_owner', 'domain_analyst', 'risk_owner']
                         WHEN 'recommendation' THEN ARRAY['decision_owner', 'decision_approver', 'decision_authority', 'executive', 'strategy_owner', 'domain_analyst', 'risk_owner']
                         WHEN 'explanation' THEN ARRAY['decision_owner', 'decision_approver', 'decision_authority', 'executive', 'strategy_owner', 'forecast_owner', 'twin_owner', 'domain_analyst', 'risk_owner']
                         ELSE ARRAY['strategy_owner', 'forecast_owner', 'twin_owner', 'domain_analyst', 'decision_owner', 'executive', 'risk_owner'] END;
  FOREACH v_role IN ARRAY v_roles LOOP
    IF executive.holds_role(p_actor, p_tenant, p_domain, ARRAY[v_role]) THEN RETURN jsonb_build_object('rule', 'standing v1', 'basis', 'role:' || v_role); END IF;
  END LOOP;
  IF executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['auditor']) THEN RETURN jsonb_build_object('rule', 'standing v1', 'basis', 'auditor'); END IF;
  RETURN NULL;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.dse_standing(text, uuid, uuid, uuid, uuid) FROM PUBLIC;

/* THE IMPACT (AI-64-003): what rests on the contested subject now — the options citing it, the runs whose initial state cites it, the
   scenarios declared on it, the forecasts on a contested source, the commitments of a contested package, the standing renderings of an
   explanation. Read at adjudication; recorded on the case. */
CREATE OR REPLACE FUNCTION decision.dse_impact(c decision.appeal_cases) RETURNS jsonb
STABLE SECURITY DEFINER SET search_path = decision, prediction, simulation, observation, pg_catalog, pg_temp AS $$
DECLARE v_fc uuid[]; v_opts jsonb; v_runs int := 0; v_scn int := 0; v_out jsonb;
BEGIN
  IF c.subject_kind IN ('forecast', 'source') THEN
    v_fc := CASE WHEN c.subject_kind = 'forecast' THEN ARRAY[c.subject_id]
                 ELSE (SELECT coalesce(array_agg(f.forecast_id), '{}') FROM prediction.forecasts_current f JOIN prediction.series_registry s ON s.tenant_id = f.tenant_id AND s.domain_id = f.domain_id AND s.series_key = f.series_key
                         JOIN observation.source_contracts_current sc ON sc.tenant_id = s.tenant_id AND sc.domain_id = s.domain_id AND sc.source_key = s.source_key AND sc.source_id = c.subject_id
                        WHERE f.tenant_id = c.tenant_id AND f.domain_id = c.domain_id) END;
    SELECT coalesce(jsonb_agg(DISTINCT jsonb_build_object('package_id', o.package_id, 'version', o.version, 'option_key', o.key)), '[]'::jsonb) INTO v_opts
      FROM decision.options o, unnest(v_fc) fid WHERE o.tenant_id = c.tenant_id AND o.domain_id = c.domain_id AND o.consequences @> jsonb_build_array(jsonb_build_object('kind', 'forecast', 'id', fid::text));
    SELECT count(*) INTO v_runs FROM simulation.runs_current r, unnest(v_fc) fid WHERE r.tenant_id = c.tenant_id AND r.domain_id = c.domain_id
       AND jsonb_path_exists(r.initial_state, '$[*].citations[*] ? (@.kind == "forecast" && @.id == $id)', jsonb_build_object('id', fid::text));
    SELECT count(*) INTO v_scn FROM prediction.scenarios_current s WHERE s.tenant_id = c.tenant_id AND s.domain_id = c.domain_id AND s.forecast_id = ANY (v_fc);
    v_out := jsonb_build_object('forecasts', to_jsonb(v_fc), 'options_citing', v_opts, 'runs_resting_on', v_runs, 'scenarios_declared_on', v_scn);
  ELSIF c.subject_kind = 'claim' THEN
    SELECT coalesce(jsonb_agg(DISTINCT jsonb_build_object('package_id', o.package_id, 'version', o.version, 'option_key', o.key)), '[]'::jsonb) INTO v_opts
      FROM decision.options o WHERE o.tenant_id = c.tenant_id AND o.domain_id = c.domain_id AND o.consequences @> jsonb_build_array(jsonb_build_object('kind', 'claim', 'id', c.subject_id::text));
    v_out := jsonb_build_object('options_citing', v_opts);
  ELSIF c.subject_kind = 'package' THEN
    v_out := jsonb_build_object('package_state', (SELECT p.state FROM decision.packages_current p WHERE p.package_id = c.subject_id),
                                'commitments', (SELECT coalesce(jsonb_agg(jsonb_build_object('commitment_id', m.commitment_id, 'version', m.version)), '[]'::jsonb) FROM decision.commitments m WHERE m.package_id = c.subject_id));
  ELSIF c.subject_kind = 'explanation' THEN
    v_out := jsonb_build_object('standing_renderings', (SELECT coalesce(jsonb_agg(r.rendering_id), '[]'::jsonb) FROM decision.explanation_renderings r WHERE r.explanation_id = c.subject_id AND r.state = 'standing'));
  ELSE
    v_out := jsonb_build_object('package_id', c.package_id);
  END IF;
  RETURN v_out || jsonb_build_object('as_of', decision.iso(clock_timestamp()));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.dse_impact(decision.appeal_cases) FROM PUBLIC;

-- §E.4 THE PORTS ───────────────────────────────────────────────────────

/* GENERATE (decision.explanation.generate): the server builds the explanation from the subject's preserved state. The same state built again
   returns the standing explanation (unchanged: true); a moved state writes the next version, superseding the last. */
CREATE OR REPLACE FUNCTION decision.generate_explanation(
  p_explanation_id uuid, p_tenant uuid, p_domain uuid, p_subject_kind text, p_subject_id uuid, p_subject_version int, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE sub jsonb; draft jsonb; fin jsonb; prev decision.explanations%ROWTYPE; n decision.explanations%ROWTYPE; v_version int;
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.explanation.generate']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM decision.dse_assert_actor(p_actor, 'explanation');
  IF p_subject_kind IS NULL OR p_subject_kind NOT IN ('package_version', 'recommendation', 'analysis', 'forecast', 'run', 'option') THEN
    RAISE EXCEPTION 'explanation rejected (subject_kind): an explanation explains a package_version, recommendation, analysis, forecast, run or option' USING ERRCODE = '22023';
  END IF;
  IF p_subject_kind IN ('package_version', 'analysis') AND p_subject_version IS NULL THEN
    RAISE EXCEPTION 'explanation rejected (version): a % is explained at a named version', p_subject_kind USING ERRCODE = '22023';
  END IF;
  v_version := CASE WHEN p_subject_kind IN ('package_version', 'analysis') THEN p_subject_version ELSE NULL END;
  sub := decision.dse_subject(p_tenant, p_domain, p_subject_kind, p_subject_id, v_version);
  IF sub IS NULL THEN RAISE EXCEPTION 'explanation rejected (unknown_subject): % % is not visible in this domain', p_subject_kind, p_subject_id USING ERRCODE = '23503'; END IF;
  IF coalesce((sub ->> 'unavailable')::boolean, false) THEN RAISE EXCEPTION 'explanation rejected (unavailable): %', sub ->> 'reason' USING ERRCODE = '22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('dse:' || p_subject_kind || ':' || p_subject_id::text || ':' || coalesce(v_version, 0)::text, 0));
  draft := CASE p_subject_kind
             WHEN 'package_version' THEN decision.dse_build_package_version(p_tenant, p_domain, p_subject_id, v_version)
             WHEN 'option' THEN decision.dse_build_option(p_tenant, p_domain, p_subject_id)
             WHEN 'forecast' THEN decision.dse_build_forecast(p_tenant, p_domain, p_subject_id)
             WHEN 'run' THEN decision.dse_build_run(p_tenant, p_domain, p_subject_id)
             WHEN 'recommendation' THEN decision.dse_build_recommendation(p_tenant, p_domain, sub)
             WHEN 'analysis' THEN decision.dse_build_analysis(sub) END;
  fin := decision.dse_finalize(p_subject_kind, sub, draft);
  SELECT * INTO prev FROM decision.explanations z WHERE z.tenant_id = p_tenant AND z.domain_id = p_domain AND z.subject_kind = p_subject_kind AND z.subject_id = p_subject_id
     AND z.subject_version IS NOT DISTINCT FROM v_version ORDER BY z.explanation_version DESC LIMIT 1;
  IF prev.explanation_id IS NOT NULL AND prev.integrity_digest = (fin ->> 'integrity_digest') AND prev.subject_digest = (sub ->> 'digest') THEN
    RETURN decision.dse_explanation_json(prev) || jsonb_build_object('unchanged', true);
  END IF;
  INSERT INTO decision.explanations (explanation_id, scope, tenant_id, domain_id, subject_kind, subject_id, subject_version, explanation_version, supersedes, subject_digest, subject_title, generator,
                                     conclusion, items, counter_evidence, competing_hypotheses, limitations, uncertainty, contract, faithfulness_state, integrity_digest, generated_by, correlation_id)
  VALUES (p_explanation_id, 'DOMAIN', p_tenant, p_domain, p_subject_kind, p_subject_id, v_version, coalesce(prev.explanation_version, 0) + 1, prev.explanation_id, sub ->> 'digest',
          left(coalesce(sub ->> 'title', p_subject_kind), 512), 'dse-explain@1', draft -> 'conclusion', fin -> 'items', fin -> 'counter_evidence', fin -> 'competing_hypotheses', fin -> 'limitations',
          draft -> 'uncertainty', (fin -> 'contract') || jsonb_build_object('explanation_id', p_explanation_id, 'integrity_digest', fin ->> 'integrity_digest'),
          fin ->> 'faithfulness_state', fin ->> 'integrity_digest', p_actor, p_correlation)
  RETURNING * INTO n;
  RETURN decision.dse_explanation_json(n) || jsonb_build_object('unchanged', false);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.generate_explanation(uuid, uuid, uuid, text, uuid, int, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.generate_explanation(uuid, uuid, uuid, text, uuid, int, uuid, uuid) TO eye_commit;

/* RENDER (decision.explanation.render): a named human or the decision agent (renders only) renders the CURRENT explanation for an audience;
   the faithfulness check v1 refuses an unfaithful rendering (nothing is written) — the authoritative structured explanation stands. */
CREATE OR REPLACE FUNCTION decision.render_explanation(
  p_rendering_id uuid, p_tenant uuid, p_domain uuid, p_explanation_id uuid, p_audience jsonb, p_sentences jsonb, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE x decision.explanations%ROWTYPE; v_latest int; sub jsonb; chk jsonb; v_agent boolean; n decision.explanation_renderings%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.explanation.render']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM decision.dse_assert_actor(p_actor, 'explanation');
  v_agent := decision.dse_is_agent(p_actor, p_tenant, p_domain);
  IF NOT v_agent AND NOT decision.is_active_human(p_actor, p_tenant) THEN RAISE EXCEPTION 'explanation rejected (actor): a rendering is a named human''s or the decision agent''s' USING ERRCODE = '42501'; END IF;
  SELECT * INTO x FROM decision.explanations z WHERE z.explanation_id = p_explanation_id AND z.tenant_id = p_tenant AND z.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'explanation rejected (unknown_explanation): % is not an explanation of this domain', p_explanation_id USING ERRCODE = '23503'; END IF;
  SELECT max(z.explanation_version) INTO v_latest FROM decision.explanations z WHERE z.subject_kind = x.subject_kind AND z.subject_id = x.subject_id AND z.subject_version IS NOT DISTINCT FROM x.subject_version;
  IF v_latest > x.explanation_version THEN
    RAISE EXCEPTION 'explanation rejected (state): explanation % (v%) is superseded by v%; render the current explanation', p_explanation_id, x.explanation_version, v_latest USING ERRCODE = '22023';
  END IF;
  sub := decision.dse_subject(p_tenant, p_domain, x.subject_kind, x.subject_id, x.subject_version);
  IF sub IS NULL OR (sub ->> 'digest') IS DISTINCT FROM x.subject_digest THEN
    RAISE EXCEPTION 'explanation rejected (stale): the subject of explanation % moved since it was generated (digest % then, % now); generate it again, then render', p_explanation_id, x.subject_digest, coalesce(sub ->> 'digest', 'none') USING ERRCODE = '22023';
  END IF;
  IF p_audience IS NULL OR jsonb_typeof(p_audience) <> 'object' OR length(btrim(coalesce(p_audience ->> 'role', ''))) NOT BETWEEN 2 AND 64 OR length(btrim(coalesce(p_audience ->> 'language', ''))) NOT BETWEEN 2 AND 16 THEN
    RAISE EXCEPTION 'explanation rejected (audience): the audience names a role (2-64 characters) and a language (2-16), with an optional accessibility note' USING ERRCODE = '22023';
  END IF;
  IF p_sentences IS NULL OR jsonb_typeof(p_sentences) <> 'array' OR jsonb_array_length(p_sentences) NOT BETWEEN 1 AND 40 THEN
    RAISE EXCEPTION 'explanation rejected (sentences): a rendering is 1 to 40 sentences, each {text, cites: [item ids]}' USING ERRCODE = '22023';
  END IF;
  chk := decision.dse_faithfulness(x.items, p_sentences);
  IF NOT (chk ->> 'faithful')::boolean THEN
    RAISE EXCEPTION 'explanation rejected (unfaithful): the rendering fails the faithfulness check v1 — %',
      (SELECT string_agg(coalesce('sentence ' || (f ->> 'sentence') || ' ', '') || (f ->> 'rule') || ': ' || (f ->> 'detail'), '; ') FROM jsonb_array_elements(chk -> 'findings') f) USING ERRCODE = '22023';
  END IF;
  INSERT INTO decision.explanation_renderings (rendering_id, scope, tenant_id, domain_id, explanation_id, audience, sentences, renderer_principal_id, renderer_kind, faithfulness, check_result, explanation_digest, correlation_id)
  VALUES (p_rendering_id, 'DOMAIN', p_tenant, p_domain, p_explanation_id,
          jsonb_build_object('role', btrim(p_audience ->> 'role'), 'language', btrim(p_audience ->> 'language'), 'accessibility', p_audience ->> 'accessibility'),
          p_sentences, p_actor, CASE WHEN v_agent THEN 'agent' ELSE 'human' END, 'faithful', chk, x.integrity_digest, p_correlation)
  RETURNING * INTO n;
  RETURN to_jsonb(n) - 'scope' - 'tenant_id' - 'domain_id' - 'correlation_id';
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.render_explanation(uuid, uuid, uuid, uuid, jsonb, jsonb, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.render_explanation(uuid, uuid, uuid, uuid, jsonb, jsonb, uuid, uuid) TO eye_commit;

/* OPEN (decision.appeal.open): a named human with STANDING contests a subject — scope, grounds, evidence, a response deadline (default 14
   days; between one hour and 90 days); the adjudication bench and the subject's owners are notified (decision.appeal). One open case per
   appellant and subject. The subject is never altered. */
CREATE OR REPLACE FUNCTION decision.open_appeal(
  p_case_id uuid, p_tenant uuid, p_domain uuid, p_subject_kind text, p_subject_id uuid, p_subject_version int, p_explanation_id uuid, p_scope jsonb, p_grounds text, p_evidence jsonb,
  p_deadline_at timestamptz, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE sub jsonb; v_standing jsonb; v_deadline timestamptz; v_now timestamptz := clock_timestamp(); x decision.explanations%ROWTYPE; v_open uuid; c decision.appeal_cases%ROWTYPE; v_owner uuid; v_pkg uuid;
        v_scope jsonb; v_rendering uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.appeal.open']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM decision.dse_assert_actor(p_actor, 'appeal');
  IF NOT decision.is_active_human(p_actor, p_tenant) OR decision.dse_is_agent(p_actor, p_tenant, p_domain) THEN
    RAISE EXCEPTION 'appeal rejected (actor): a contest is a named, active human''s act — an agent never opens one' USING ERRCODE = '42501';
  END IF;
  IF p_subject_kind IS NULL OR p_subject_kind NOT IN ('package', 'forecast', 'source', 'claim', 'recommendation', 'explanation') THEN
    RAISE EXCEPTION 'appeal rejected (subject_kind): a case contests a package, forecast, source, claim, recommendation or explanation' USING ERRCODE = '22023';
  END IF;
  IF p_grounds IS NULL OR length(btrim(p_grounds)) NOT BETWEEN 16 AND 4000 THEN RAISE EXCEPTION 'appeal rejected (grounds): the grounds are stated (16 to 4000 characters)' USING ERRCODE = '22023'; END IF;
  IF p_scope IS NULL OR jsonb_typeof(p_scope) <> 'object' OR length(btrim(coalesce(p_scope ->> 'statement', ''))) NOT BETWEEN 8 AND 1000
     OR (p_scope ? 'fields' AND jsonb_typeof(p_scope -> 'fields') <> 'array') OR (p_scope ? 'items' AND jsonb_typeof(p_scope -> 'items') <> 'array') THEN
    RAISE EXCEPTION 'appeal rejected (scope): the scope states what is contested (statement, 8 to 1000 characters; optional fields[] and items[]; optional rendering_id)' USING ERRCODE = '22023';
  END IF;
  IF p_evidence IS NULL OR jsonb_typeof(p_evidence) <> 'array' OR jsonb_array_length(p_evidence) > 20
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_evidence) e WHERE jsonb_typeof(e) <> 'object' OR length(coalesce(e ->> 'kind', '')) < 2 OR length(coalesce(e ->> 'ref', e ->> 'id', e ->> 'statement', '')) < 2) THEN
    RAISE EXCEPTION 'appeal rejected (evidence): the evidence is a list of at most 20 {kind, ref | id | statement}' USING ERRCODE = '22023';
  END IF;
  sub := decision.dse_subject(p_tenant, p_domain, p_subject_kind, p_subject_id, p_subject_version);
  IF sub IS NULL THEN RAISE EXCEPTION 'appeal rejected (unknown_subject): % % is not visible in this domain', p_subject_kind, p_subject_id USING ERRCODE = '23503'; END IF;
  IF coalesce((sub ->> 'unavailable')::boolean, false) THEN RAISE EXCEPTION 'appeal rejected (unavailable): %', sub ->> 'reason' USING ERRCODE = '22023'; END IF;
  IF p_subject_kind = 'package' AND (sub ->> 'state') = 'draft' THEN
    RAISE EXCEPTION 'appeal rejected (state): version % of the package is a draft — a draft is not contested; its owner is still writing it (dissent, or a challenge at the gate)', sub ->> 'version' USING ERRCODE = '22023';
  END IF;
  v_scope := jsonb_build_object('statement', btrim(p_scope ->> 'statement'), 'fields', coalesce(p_scope -> 'fields', '[]'::jsonb), 'items', coalesce(p_scope -> 'items', '[]'::jsonb));
  IF p_explanation_id IS NOT NULL THEN
    SELECT * INTO x FROM decision.explanations z WHERE z.explanation_id = p_explanation_id AND z.tenant_id = p_tenant AND z.domain_id = p_domain;
    IF NOT FOUND OR NOT (
         (p_subject_kind = 'explanation' AND x.explanation_id = p_subject_id)
      OR (x.subject_id = p_subject_id AND x.subject_kind = CASE p_subject_kind WHEN 'package' THEN 'package_version' ELSE p_subject_kind END)
      OR (p_subject_kind = 'source' AND x.subject_kind = 'forecast' AND (x.items @> jsonb_build_array(jsonb_build_object('ref', jsonb_build_object('kind', 'source', 'id', p_subject_id)))))) THEN
      RAISE EXCEPTION 'appeal rejected (explanation): explanation % does not explain the contested subject', p_explanation_id USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_scope -> 'items') i WHERE NOT (x.items @> jsonb_build_array(jsonb_build_object('id', i #>> '{}')))) THEN
      RAISE EXCEPTION 'appeal rejected (scope): every contested item is an item of explanation %', p_explanation_id USING ERRCODE = '22023';
    END IF;
  ELSIF jsonb_array_length(v_scope -> 'items') > 0 THEN
    RAISE EXCEPTION 'appeal rejected (scope): contested items name the explanation they belong to' USING ERRCODE = '22023';
  END IF;
  IF p_scope ? 'rendering_id' THEN
    IF p_subject_kind <> 'explanation' THEN RAISE EXCEPTION 'appeal rejected (scope): a rendering is contested through its explanation (subject kind explanation)' USING ERRCODE = '22023'; END IF;
    BEGIN v_rendering := (p_scope ->> 'rendering_id')::uuid; EXCEPTION WHEN others THEN v_rendering := NULL; END;
    IF v_rendering IS NULL OR NOT EXISTS (SELECT 1 FROM decision.explanation_renderings r WHERE r.rendering_id = v_rendering AND r.explanation_id = p_subject_id) THEN
      RAISE EXCEPTION 'appeal rejected (scope): rendering % is not a rendering of explanation %', p_scope ->> 'rendering_id', p_subject_id USING ERRCODE = '22023';
    END IF;
    v_scope := v_scope || jsonb_build_object('rendering_id', v_rendering);
  END IF;
  v_deadline := coalesce(p_deadline_at, v_now + interval '14 days');
  IF v_deadline < v_now + interval '1 hour' OR v_deadline > v_now + interval '90 days' THEN
    RAISE EXCEPTION 'appeal rejected (deadline): the response deadline lies between one hour and 90 days ahead (%, now %)', decision.iso(v_deadline), decision.iso(v_now) USING ERRCODE = '22023';
  END IF;
  v_pkg := (sub ->> 'package_id')::uuid;
  v_standing := decision.dse_standing(p_subject_kind, p_tenant, p_domain, p_actor, v_pkg);
  IF v_standing IS NULL THEN
    RAISE EXCEPTION 'appeal rejected (standing): principal % has no standing to contest a % under standing v1 (a room member, a holder of a role the rule names, or the auditor)', p_actor, p_subject_kind USING ERRCODE = '42501';
  END IF;
  SELECT z.case_id INTO v_open FROM decision.appeal_cases z WHERE z.subject_kind = p_subject_kind AND z.subject_id = p_subject_id AND z.appellant_principal_id = p_actor AND z.state IN ('opened', 'under_review');
  IF v_open IS NOT NULL THEN RAISE EXCEPTION 'appeal rejected (duplicate): case % of yours on this % is still open', v_open, p_subject_kind USING ERRCODE = '22023'; END IF;
  INSERT INTO decision.appeal_cases (case_id, scope, tenant_id, domain_id, subject_kind, subject_id, subject_version, subject_title, subject_owners, subject_state_at_open, subject_digest_at_open, decided,
                                     package_id, explanation_id, appellant_principal_id, standing, contest_scope, grounds, evidence, deadline_at, state, correlation_id)
  VALUES (p_case_id, 'DOMAIN', p_tenant, p_domain, p_subject_kind, p_subject_id, (sub ->> 'version')::int, left(coalesce(sub ->> 'title', p_subject_kind), 512),
          coalesce((SELECT array_agg(DISTINCT (o #>> '{}')::uuid) FROM jsonb_array_elements(sub -> 'owners') o WHERE jsonb_typeof(o) = 'string'), '{}'), coalesce(sub ->> 'state', 'unknown'), sub ->> 'digest',
          coalesce((sub ->> 'decided')::boolean, false), v_pkg, p_explanation_id, p_actor, v_standing, v_scope, btrim(p_grounds), p_evidence, v_deadline, 'opened', p_correlation)
  RETURNING * INTO c;
  PERFORM decision.dse_case_event(c, 'appeal.opened', p_actor, jsonb_build_object('subject_kind', p_subject_kind, 'subject_id', p_subject_id, 'standing', v_standing, 'deadline_at', v_deadline, 'decided', c.decided), p_correlation, p_event_id);
  PERFORM decision.dse_notify(c, 'adjudicator_needed', format('An appeal awaits an adjudicator: %s', c.subject_title), NULL, decision.dse_bench(), v_deadline, p_actor, p_correlation);
  FOREACH v_owner IN ARRAY c.subject_owners LOOP
    IF v_owner <> p_actor THEN PERFORM decision.dse_notify(c, 'subject_contested', format('Contested: %s', c.subject_title), v_owner, '{}', v_deadline, p_actor, p_correlation); END IF;
  END LOOP;
  RETURN decision.dse_case_json(c);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.open_appeal(uuid, uuid, uuid, text, uuid, int, uuid, jsonb, text, jsonb, timestamptz, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.open_appeal(uuid, uuid, uuid, text, uuid, int, uuid, jsonb, text, jsonb, timestamptz, uuid, uuid, uuid) TO eye_commit;

/* ASSIGN (decision.appeal.adjudicate): a member of the bench (a decision authority, an executive, the domain administrator or the auditor)
   who is neither the appellant nor a subject owner names the adjudicator — a named human of the bench, never an agent, never the
   appellant, never a subject owner. Re-assignment before the adjudication is allowed (recorded). */
CREATE OR REPLACE FUNCTION decision.assign_appeal_adjudicator(p_tenant uuid, p_domain uuid, p_case_id uuid, p_adjudicator uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE c decision.appeal_cases%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.appeal.adjudicate']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM decision.dse_assert_actor(p_actor, 'appeal');
  c := decision.dse_lock_case(p_case_id, p_tenant, p_domain);
  IF c.state NOT IN ('opened', 'under_review') THEN RAISE EXCEPTION 'appeal rejected (state): case % is %; an adjudicator is assigned before the adjudication', p_case_id, c.state USING ERRCODE = '22023'; END IF;
  IF NOT decision.is_active_human(p_actor, p_tenant) OR NOT executive.holds_role(p_actor, p_tenant, p_domain, decision.dse_bench()) THEN
    RAISE EXCEPTION 'appeal rejected (authority): a member of the adjudication bench (decision authority, executive, domain administrator, auditor) assigns the adjudicator' USING ERRCODE = '42501';
  END IF;
  IF p_actor = c.appellant_principal_id OR p_actor = ANY (c.subject_owners) THEN
    RAISE EXCEPTION 'appeal rejected (separation): the appellant and the subject''s owners never choose the adjudicator' USING ERRCODE = '42501';
  END IF;
  IF p_adjudicator IS NULL OR NOT decision.is_active_human(p_adjudicator, p_tenant) OR decision.dse_is_agent(p_adjudicator, p_tenant, p_domain)
     OR NOT executive.holds_role(p_adjudicator, p_tenant, p_domain, decision.dse_bench()) THEN
    RAISE EXCEPTION 'appeal rejected (adjudicator): the adjudicator is a named, active human of the bench — never an agent' USING ERRCODE = '22023';
  END IF;
  IF p_adjudicator = c.appellant_principal_id OR p_adjudicator = ANY (c.subject_owners) THEN
    RAISE EXCEPTION 'appeal rejected (separation): the adjudicator is neither the appellant nor an owner of the contested subject' USING ERRCODE = '42501';
  END IF;
  UPDATE decision.appeal_cases SET adjudicator_principal_id = p_adjudicator, assigned_by = p_actor, assigned_at = clock_timestamp(), state = 'under_review' WHERE case_id = p_case_id RETURNING * INTO c;
  PERFORM decision.dse_case_event(c, 'appeal.assigned', p_actor, jsonb_build_object('adjudicator', p_adjudicator), p_correlation);
  PERFORM decision.dse_notify(c, 'adjudication_assigned', format('Adjudicate the appeal: %s (due %s)', c.subject_title, to_char(c.deadline_at, 'YYYY-MM-DD')), p_adjudicator, '{}', c.deadline_at, p_actor, p_correlation);
  RETURN decision.dse_case_json(c);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.assign_appeal_adjudicator(uuid, uuid, uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.assign_appeal_adjudicator(uuid, uuid, uuid, uuid, uuid, uuid) TO eye_commit;

/* ADJUDICATE (decision.appeal.adjudicate): the ASSIGNED adjudicator only (never an agent) — upheld | dismissed | partly_upheld, the
   rationale, the correction (upheld or partly), the impact read now; the EFFECT: a DECIDED package → reopen_required (the commitment stands;
   §P's reopen accepts the cause appeal_upheld); an undecided package or a recommendation → reconsideration_required; a forecast, a source, a
   claim → correction_required through its owning layer (the original is preserved); an explanation → its contested rendering withdrawn as
   unfaithful, or regeneration_required. The appellant and the subject's owners are notified. */
CREATE OR REPLACE FUNCTION decision.adjudicate_appeal(
  p_tenant uuid, p_domain uuid, p_case_id uuid, p_outcome text, p_rationale text, p_correction text, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE c decision.appeal_cases%ROWTYPE; v_effect jsonb; v_impact jsonb; v_owner uuid; v_rendering uuid; v_committed int; v_layer text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.appeal.adjudicate']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM decision.dse_assert_actor(p_actor, 'appeal');
  c := decision.dse_lock_case(p_case_id, p_tenant, p_domain);
  IF decision.dse_is_agent(p_actor, p_tenant, p_domain) THEN RAISE EXCEPTION 'appeal rejected (authority): an agent never adjudicates' USING ERRCODE = '42501'; END IF;
  IF c.state = 'opened' THEN RAISE EXCEPTION 'appeal rejected (state): case % has no adjudicator yet; one is assigned first', p_case_id USING ERRCODE = '22023'; END IF;
  IF c.state <> 'under_review' THEN RAISE EXCEPTION 'appeal rejected (state): case % is %', p_case_id, c.state USING ERRCODE = '22023'; END IF;
  IF p_actor IS DISTINCT FROM c.adjudicator_principal_id THEN RAISE EXCEPTION 'appeal rejected (authority): only the assigned adjudicator adjudicates case %', p_case_id USING ERRCODE = '42501'; END IF;
  IF p_outcome IS NULL OR p_outcome NOT IN ('upheld', 'dismissed', 'partly_upheld') THEN RAISE EXCEPTION 'appeal rejected (outcome): a case is upheld, dismissed or partly_upheld' USING ERRCODE = '22023'; END IF;
  IF p_rationale IS NULL OR length(btrim(p_rationale)) NOT BETWEEN 16 AND 4000 THEN RAISE EXCEPTION 'appeal rejected (rationale): the adjudication states its rationale (16 to 4000 characters)' USING ERRCODE = '22023'; END IF;
  IF p_outcome <> 'dismissed' AND (p_correction IS NULL OR length(btrim(p_correction)) NOT BETWEEN 8 AND 2000) THEN
    RAISE EXCEPTION 'appeal rejected (correction): an upheld or partly upheld case states the correction and the owning layer that makes it (8 to 2000 characters)' USING ERRCODE = '22023';
  END IF;
  v_impact := decision.dse_impact(c);
  IF p_outcome = 'dismissed' THEN
    v_effect := jsonb_build_object('kind', 'none', 'note', 'the subject stands as it was');
  ELSIF c.subject_kind = 'package' THEN
    SELECT p.committed_version INTO v_committed FROM decision.packages_current p WHERE p.package_id = c.subject_id;
    IF v_committed IS NOT NULL THEN
      v_effect := jsonb_build_object('kind', 'reopen_required', 'package_id', c.subject_id, 'committed_version', v_committed, 'case_id', c.case_id, 'cause', 'appeal_upheld',
                                     'note', 'the commitment stands; the package owner reopens the package on the recorded cause appeal_upheld (decision.package.reopen)');
    ELSE
      v_effect := jsonb_build_object('kind', 'reconsideration_required', 'package_id', c.subject_id, 'note', 'the owner reconsiders the package before the gate; no version is altered');
    END IF;
  ELSIF c.subject_kind = 'recommendation' THEN
    v_effect := jsonb_build_object('kind', 'reconsideration_required', 'package_id', c.package_id, 'note', 'the recommendation is reconsidered by its reviewers; it is not altered');
  ELSIF c.subject_kind IN ('forecast', 'source', 'claim') THEN
    v_layer := CASE c.subject_kind WHEN 'forecast' THEN 'prediction' WHEN 'source' THEN 'observation' ELSE 'intelligence' END;
    v_effect := jsonb_build_object('kind', 'correction_required', 'owning_layer', v_layer, 'owners', to_jsonb(c.subject_owners),
                                   'note', format('the %s owner corrects through the %s layer''s own routes; the original record is preserved', c.subject_kind, v_layer));
  ELSE
    IF c.contest_scope ? 'rendering_id' THEN
      v_rendering := (c.contest_scope ->> 'rendering_id')::uuid;
      UPDATE decision.explanation_renderings SET state = 'withdrawn', faithfulness = 'unfaithful', withdrawn_at = clock_timestamp(), withdrawn_by = p_actor,
             withdrawal = jsonb_build_object('case_id', c.case_id, 'outcome', p_outcome, 'rationale', btrim(p_rationale), 'note', 'the rendering changed the explanation''s meaning; the structured explanation stands')
       WHERE rendering_id = v_rendering AND state = 'standing';
      v_effect := jsonb_build_object('kind', 'rendering_withdrawn', 'rendering_id', v_rendering, 'note', 'the authoritative structured explanation stands; the rendering is withdrawn as unfaithful');
    ELSE
      v_effect := jsonb_build_object('kind', 'regeneration_required', 'explanation_id', c.subject_id, 'note', 'the explanation is generated again once its subject is corrected');
    END IF;
  END IF;
  UPDATE decision.appeal_cases SET outcome = p_outcome, rationale = btrim(p_rationale), correction = CASE WHEN p_outcome = 'dismissed' THEN NULL ELSE btrim(p_correction) END,
         impact = v_impact, effect = v_effect, adjudicated_at = clock_timestamp(), state = 'adjudicated' WHERE case_id = p_case_id RETURNING * INTO c;
  PERFORM decision.dse_case_event(c, 'appeal.adjudicated', p_actor, jsonb_build_object('outcome', p_outcome, 'effect', v_effect), p_correlation, p_event_id);
  PERFORM decision.dse_notify(c, 'adjudicated', format('Appeal %s: %s', replace(p_outcome, '_', ' '), c.subject_title), c.appellant_principal_id, '{}', NULL, p_actor, p_correlation);
  FOREACH v_owner IN ARRAY c.subject_owners LOOP
    IF v_owner <> c.appellant_principal_id THEN
      PERFORM decision.dse_notify(c, CASE (v_effect ->> 'kind') WHEN 'none' THEN 'adjudicated' ELSE (v_effect ->> 'kind') END, format('Appeal %s on your %s: %s', replace(p_outcome, '_', ' '), c.subject_kind, c.subject_title),
                                  v_owner, '{}', NULL, p_actor, p_correlation);
    END IF;
  END LOOP;
  RETURN decision.dse_case_json(c);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.adjudicate_appeal(uuid, uuid, uuid, text, text, text, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.adjudicate_appeal(uuid, uuid, uuid, text, text, text, uuid, uuid, uuid) TO eye_commit;

/* CLOSE (decision.appeal.close): an ADJUDICATED case is closed (resolved) by its adjudicator once the outcome is notified; an UNADJUDICATED
   case is closed (withdrawn) by its appellant only. The other party is notified. */
CREATE OR REPLACE FUNCTION decision.close_appeal(p_tenant uuid, p_domain uuid, p_case_id uuid, p_note text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE c decision.appeal_cases%ROWTYPE; v_closure text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.appeal.close']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM decision.dse_assert_actor(p_actor, 'appeal');
  c := decision.dse_lock_case(p_case_id, p_tenant, p_domain);
  IF c.state = 'closed' THEN RAISE EXCEPTION 'appeal rejected (state): case % was closed (%) at %', p_case_id, c.closure, decision.iso(c.closed_at) USING ERRCODE = '22023'; END IF;
  IF c.state = 'adjudicated' THEN
    IF p_actor IS DISTINCT FROM c.adjudicator_principal_id THEN RAISE EXCEPTION 'appeal rejected (authority): the adjudicator closes an adjudicated case' USING ERRCODE = '42501'; END IF;
    v_closure := 'resolved';
  ELSE
    IF p_actor IS DISTINCT FROM c.appellant_principal_id THEN RAISE EXCEPTION 'appeal rejected (authority): an unadjudicated case is closed only by its appellant withdrawing it' USING ERRCODE = '42501'; END IF;
    v_closure := 'withdrawn';
  END IF;
  IF p_note IS NULL OR length(btrim(p_note)) NOT BETWEEN 8 AND 2000 THEN RAISE EXCEPTION 'appeal rejected (note): the closure says why (8 to 2000 characters)' USING ERRCODE = '22023'; END IF;
  UPDATE decision.appeal_cases SET state = 'closed', closure = v_closure, closed_by = p_actor, closed_at = clock_timestamp(), closure_note = btrim(p_note) WHERE case_id = p_case_id RETURNING * INTO c;
  PERFORM decision.dse_case_event(c, 'appeal.closed', p_actor, jsonb_build_object('closure', v_closure), p_correlation);
  IF v_closure = 'resolved' THEN
    PERFORM decision.dse_notify(c, 'closed', format('Appeal closed: %s', c.subject_title), c.appellant_principal_id, '{}', NULL, p_actor, p_correlation);
  ELSIF c.adjudicator_principal_id IS NOT NULL THEN
    PERFORM decision.dse_notify(c, 'withdrawn', format('Appeal withdrawn: %s', c.subject_title), c.adjudicator_principal_id, '{}', NULL, p_actor, p_correlation);
  END IF;
  RETURN decision.dse_case_json(c);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.close_appeal(uuid, uuid, uuid, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.close_appeal(uuid, uuid, uuid, text, uuid, uuid) TO eye_commit;

/* THE DEADLINE SWEEP (the tick step `appeal-deadlines`, executive.attention.tick): every open case past its response deadline is marked
   overdue ONCE (appeal.overdue) and the adjudicator — or, unassigned, the bench — is notified (decision.appeal). */
CREATE OR REPLACE FUNCTION decision.flag_overdue_appeals(p_tenant uuid, p_domain uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE c decision.appeal_cases%ROWTYPE; v_out jsonb := '[]'::jsonb; v_now timestamptz := clock_timestamp();
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.attention.tick']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM decision.dse_assert_actor(p_actor, 'appeal');
  FOR c IN SELECT * FROM decision.appeal_cases x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.state IN ('opened', 'under_review') AND x.deadline_at < v_now AND x.overdue_flagged_at IS NULL
            ORDER BY x.deadline_at, x.case_id FOR UPDATE SKIP LOCKED LOOP
    UPDATE decision.appeal_cases SET overdue_flagged_at = v_now WHERE case_id = c.case_id RETURNING * INTO c;
    PERFORM decision.dse_case_event(c, 'appeal.overdue', p_actor, jsonb_build_object('deadline_at', c.deadline_at, 'state', c.state, 'adjudicator', c.adjudicator_principal_id), p_correlation);
    PERFORM decision.dse_notify(c, 'overdue', format('Appeal past its deadline: %s (due %s)', c.subject_title, to_char(c.deadline_at, 'YYYY-MM-DD')), c.adjudicator_principal_id,
                                CASE WHEN c.adjudicator_principal_id IS NULL THEN decision.dse_bench() ELSE '{}'::text[] END, v_now, p_actor, p_correlation);
    v_out := v_out || jsonb_build_object('case_id', c.case_id, 'deadline_at', c.deadline_at, 'state', c.state, 'adjudicator', c.adjudicator_principal_id);
  END LOOP;
  RETURN jsonb_build_object('flagged', jsonb_array_length(v_out), 'cases', v_out, 'as_of', decision.iso(v_now));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.flag_overdue_appeals(uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.flag_overdue_appeals(uuid, uuid, uuid, uuid) TO eye_commit;

-- §E.5 THE READS (invoker, under the caller's RLS) ─────────────────────

/* ONE EXPLANATION: the object with its read-time state, its renderings (with their faithfulness) and the cases on it and on its subject. */
CREATE OR REPLACE FUNCTION decision.explanation_read(p_explanation_id uuid) RETURNS jsonb
STABLE SET search_path = decision, pg_catalog, pg_temp AS $$
  SELECT decision.dse_explanation_json(x)
         || jsonb_build_object('renderings', (SELECT coalesce(jsonb_agg(to_jsonb(r) - 'scope' - 'tenant_id' - 'domain_id' - 'correlation_id' ORDER BY r.rendered_at, r.rendering_id), '[]'::jsonb)
                                                FROM decision.explanation_renderings r WHERE r.explanation_id = x.explanation_id),
                               'cases', (SELECT coalesce(jsonb_agg(decision.dse_case_json(c) ORDER BY c.opened_at, c.case_id), '[]'::jsonb) FROM decision.appeal_cases c
                                          WHERE (c.subject_kind = 'explanation' AND c.subject_id = x.explanation_id) OR c.explanation_id = x.explanation_id))
    FROM decision.explanations x WHERE x.explanation_id = p_explanation_id
$$ LANGUAGE sql;
GRANT EXECUTE ON FUNCTION decision.explanation_read(uuid) TO eye_app, eye_commit;

/* THE UNIFIED EXPLANATION SURFACE of a subject (V10-T-008, App. L): the subject now, its current explanation (with renderings and
   faithfulness), every version, and every case on the subject — for a forecast also the cases on its SOURCE (the contested source shown). */
CREATE OR REPLACE FUNCTION decision.explanation_surface(p_subject_kind text, p_subject_id uuid, p_subject_version int) RETURNS jsonb
STABLE SET search_path = decision, pg_catalog, pg_temp AS $$
DECLARE x decision.explanations%ROWTYPE; sub jsonb; v_case_kind text; v_source uuid;
BEGIN
  sub := decision.dse_subject(public.eye_tenant(), public.eye_domain(), p_subject_kind, p_subject_id, CASE WHEN p_subject_kind IN ('package_version', 'analysis') THEN p_subject_version END);
  SELECT * INTO x FROM decision.explanations z WHERE z.subject_kind = p_subject_kind AND z.subject_id = p_subject_id
     AND z.subject_version IS NOT DISTINCT FROM CASE WHEN p_subject_kind IN ('package_version', 'analysis') THEN p_subject_version END ORDER BY z.explanation_version DESC LIMIT 1;
  IF sub IS NULL AND x.explanation_id IS NULL THEN RETURN NULL; END IF;
  v_case_kind := CASE p_subject_kind WHEN 'package_version' THEN 'package' WHEN 'forecast' THEN 'forecast' WHEN 'recommendation' THEN 'recommendation' ELSE NULL END;
  IF p_subject_kind = 'forecast' AND x.explanation_id IS NOT NULL THEN
    SELECT (i -> 'ref' ->> 'id')::uuid INTO v_source FROM jsonb_array_elements(x.items) i WHERE (i -> 'ref' ->> 'kind') = 'source' LIMIT 1;
  END IF;
  RETURN jsonb_build_object(
    'subject', CASE WHEN sub IS NULL THEN NULL ELSE sub - 'analysis' - 'recommendation' END,
    'explanation', CASE WHEN x.explanation_id IS NULL THEN NULL ELSE decision.explanation_read(x.explanation_id) END,
    'versions', (SELECT coalesce(jsonb_agg(jsonb_build_object('explanation_id', z.explanation_id, 'explanation_version', z.explanation_version, 'generated_at', z.generated_at, 'generated_by', z.generated_by,
                                                              'integrity_digest', z.integrity_digest, 'subject_digest', z.subject_digest, 'faithfulness_state', z.faithfulness_state) ORDER BY z.explanation_version DESC), '[]'::jsonb)
                   FROM decision.explanations z WHERE z.subject_kind = p_subject_kind AND z.subject_id = p_subject_id
                    AND z.subject_version IS NOT DISTINCT FROM CASE WHEN p_subject_kind IN ('package_version', 'analysis') THEN p_subject_version END),
    'cases', (SELECT coalesce(jsonb_agg(decision.dse_case_json(c) ORDER BY c.opened_at, c.case_id), '[]'::jsonb) FROM decision.appeal_cases c
               WHERE (v_case_kind IS NOT NULL AND c.subject_kind = v_case_kind AND c.subject_id = p_subject_id)
                  OR (v_source IS NOT NULL AND c.subject_kind = 'source' AND c.subject_id = v_source)
                  OR (c.subject_kind = 'explanation' AND c.subject_id IN (SELECT z.explanation_id FROM decision.explanations z WHERE z.subject_kind = p_subject_kind AND z.subject_id = p_subject_id))),
    'as_of', decision.iso(clock_timestamp()));
END $$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION decision.explanation_surface(text, uuid, int) TO eye_app, eye_commit;

/* ONE CASE with its ledger, whether it is overdue, the subject now. */
CREATE OR REPLACE FUNCTION decision.appeal_case_read(p_case_id uuid) RETURNS jsonb
STABLE SET search_path = decision, pg_catalog, pg_temp AS $$
  SELECT decision.dse_case_json(c)
         || jsonb_build_object('events', (SELECT coalesce(jsonb_agg(jsonb_build_object('event_id', e.event_id, 'event', e.event, 'actor', e.actor_principal_id, 'details', e.details, 'occurred_at', e.occurred_at)
                                                           ORDER BY e.occurred_at, e.event_id), '[]'::jsonb) FROM decision.appeal_events e WHERE e.case_id = c.case_id),
                               'subject_now', (SELECT s - 'analysis' - 'recommendation' FROM decision.dse_subject(c.tenant_id, c.domain_id, c.subject_kind, c.subject_id, c.subject_version) s))
    FROM decision.appeal_cases c WHERE c.case_id = p_case_id
$$ LANGUAGE sql;
GRANT EXECUTE ON FUNCTION decision.appeal_case_read(uuid) TO eye_app, eye_commit;

/* THE CASES of the domain (optionally one state, one subject kind), newest first. */
CREATE OR REPLACE FUNCTION decision.appeals_list(p_state text, p_subject_kind text, p_limit int) RETURNS jsonb
STABLE SET search_path = decision, pg_catalog, pg_temp AS $$
  SELECT coalesce(jsonb_agg(decision.dse_case_json(c) ORDER BY c.opened_at DESC, c.case_id), '[]'::jsonb)
    FROM (SELECT * FROM decision.appeal_cases z WHERE (p_state IS NULL OR z.state = p_state) AND (p_subject_kind IS NULL OR z.subject_kind = p_subject_kind)
           ORDER BY z.opened_at DESC, z.case_id LIMIT greatest(1, least(coalesce(p_limit, 50), 200))) c
$$ LANGUAGE sql;
GRANT EXECUTE ON FUNCTION decision.appeals_list(text, text, int) TO eye_app, eye_commit;

-- ═════════════════════════════════════════════════════════════════════
-- section `reopen` (§P) — CP-6 B35 part `reopen`: F-P6-06 (a decision reopening its scenario, the outcome assessment, the review terms,
-- the decision metrics, the replay initiator and reason, hypotheses and lessons as governed memory objects); F-P4-08's B35 pieces (relevance
-- for scenarios OUTSIDE an active set, a review cadence on a scenario set, the risk and planning-cycle proposal sources' positive path — the
-- last proven by the harness through 0097's own ports, nothing declared for it here); F-P4-09's B35 piece (the review-cadence miss routed as
-- a task); §B36.12 row 11 (the reopen after an UPHELD post-commitment challenge).
--
-- Forward-only. 0001–0101 §0 untouched; the §0 prelude's attention classes (decision.reversion, decision.review_due) and subject kind
-- (outcome_assessment) are USED. decision.package_events is NOT widened: this part's lifecycle lives in its own ledger
-- (decision.review_events). The ONLY re-declaration of another stage's function: decision.reopen_package (0083:994, copied whole; the B35
-- changes marked `B35 (0101)`): three more causes — challenge_upheld (a 0094 challenge resolved upheld after the commitment, effect
-- reopen_required), appeal_upheld (§E's decision.appeal_cases through to_regclass — the seam the integrator asserts) and conditions_changed
-- (a named change with its evidence, recorded after the commitment by decision.record_condition_change); the existing events (version.opened,
-- package.reopened) and their details UNCHANGED, the DecisionReopened payload unchanged (built from the same answer keys). A reopen of a
-- package that rests on scenarios (a bound set, or options citing runs on scenario branches) TASKS each scenario's owner (decision.reversion)
-- with a scenario_reversion_requests row (V02-T-014); the re-versioning itself is the existing scenario routes' (BranchScenario).
--
--   §P1 the tables (condition_changes, scenario_reversion_requests, outcome_assessments, package_review_terms, replay_requests, lessons,
--       set_review_cadences, set_review_misses, review_events) — append-only (a reversion request and a miss are resolved once)
--   §P2 the private helpers (the ledger row, the notice)
--   §P3 decision.reopen_package re-declared
--   §P4 the ports: record_condition_change, resolve_reversion_request, assess_outcome, set_review_terms, record_replay_request, link_lesson,
--       set_review_cadence, sweep_review_cadences, score_cited_scenario_relevance
--   §P5 the reads: decision.decision_metrics, decision.review_read, decision.set_review_status
--   §P6 RLS (the 0081 loop idiom; the decision tables' policy text) and grants
-- Refusals: the family `review rejected (<class>)`; the reopen keeps `reopen rejected` (its new texts in the CLASS form
-- `reopen rejected (<class>): …`, mapped ahead of the unclassed 422 row). Every figure a harness or an act seeds is SYNTHETIC.

-- ─────────────────────────────────────────────────────────────────────
-- §P1 THE TABLES
-- ─────────────────────────────────────────────────────────────────────
/* A CHANGE OF CONDITIONS on a committed decision ("the corridor reopens"): named, stated, with the recorded objects that evidence it;
   recorded after the commitment it bears on — the cause decision.reopen_package admits as conditions_changed. */
CREATE TABLE decision.condition_changes (
  change_id           uuid PRIMARY KEY,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  package_id          uuid NOT NULL REFERENCES decision.packages_current (package_id),
  committed_version   int  NOT NULL,
  commitment_id       uuid NOT NULL,
  title               text NOT NULL CHECK (length(btrim(title)) BETWEEN 4 AND 256),
  statement           text NOT NULL CHECK (length(btrim(statement)) BETWEEN 16 AND 4000),
  evidence            jsonb NOT NULL CHECK (jsonb_typeof(evidence) = 'array' AND jsonb_array_length(evidence) BETWEEN 1 AND 20),
  recorded_by         uuid NOT NULL,
  recorded_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id      uuid NOT NULL,
  CONSTRAINT dsp_chg_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT dsp_chg_version FOREIGN KEY (package_id, committed_version) REFERENCES decision.package_versions (package_id, version)
);
CREATE INDEX dsp_chg_package ON decision.condition_changes (package_id, recorded_at);
CREATE TRIGGER dsp_chg_append_only BEFORE UPDATE OR DELETE ON decision.condition_changes FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE decision.condition_changes IS 'B35 (0101 §P; F-P6-06): a named change of conditions on a committed decision with the recorded objects that evidence it, recorded after the commitment — the cause conditions_changed of decision.reopen_package. Append-only.';

/* A REVERSION REQUEST (V02-T-014): a reopened decision rests on a scenario — its owner is tasked to re-version it (BranchScenario);
   resolved once: reversioned (the scenario's version moved past the one at the request) or declined with a reason. */
CREATE TABLE decision.scenario_reversion_requests (
  request_id                  uuid PRIMARY KEY,
  scope                       text NOT NULL,
  tenant_id                   uuid NOT NULL,
  domain_id                   uuid NOT NULL,
  package_id                  uuid NOT NULL REFERENCES decision.packages_current (package_id),
  reopen_event_id             uuid NOT NULL,
  committed_version           int  NOT NULL,
  new_version                 int  NOT NULL,
  cause                       jsonb NOT NULL CHECK (jsonb_typeof(cause) = 'object'),
  scenario_id                 uuid NOT NULL REFERENCES prediction.scenarios_current (scenario_id),
  scenario_version_at_request int  NOT NULL,
  via                         jsonb NOT NULL CHECK (jsonb_typeof(via) = 'array'),          -- [{kind set|run, id, option_key?}]
  owner_principal_id          uuid NOT NULL,
  item_id                     uuid,
  state                       text NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'reversioned', 'declined')),
  resolved_by                 uuid,
  resolved_at                 timestamptz,
  resolved_version            int,
  resolution_note             text,
  requested_at                timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id              uuid NOT NULL,
  CONSTRAINT dsp_rev_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT dsp_rev_resolved CHECK ((state = 'open') = (resolved_at IS NULL) AND (resolved_at IS NULL) = (resolved_by IS NULL) AND (resolved_at IS NULL) = (resolution_note IS NULL)
                                     AND ((state = 'reversioned') = (resolved_version IS NOT NULL)))
);
CREATE UNIQUE INDEX dsp_rev_once ON decision.scenario_reversion_requests (reopen_event_id, scenario_id);
CREATE INDEX dsp_rev_scenario ON decision.scenario_reversion_requests (scenario_id, state);
CREATE OR REPLACE FUNCTION decision.dsp_reversion_guard() RETURNS trigger
SET search_path = decision, pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'review rejected (append_only): a reversion request is never deleted' USING ERRCODE = '2F002'; END IF;
  IF OLD.state <> 'open' OR (to_jsonb(NEW) - ARRAY['state', 'resolved_by', 'resolved_at', 'resolved_version', 'resolution_note']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['state', 'resolved_by', 'resolved_at', 'resolved_version', 'resolution_note']) THEN
    RAISE EXCEPTION 'review rejected (append_only): reversion request % is written once and resolved once', OLD.request_id USING ERRCODE = '2F002';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER dsp_rev_guard BEFORE UPDATE OR DELETE ON decision.scenario_reversion_requests FOR EACH ROW EXECUTE FUNCTION decision.dsp_reversion_guard();
COMMENT ON TABLE decision.scenario_reversion_requests IS 'B35 (0101 §P; V02-T-014): a reopened decision''s scenario to re-version — the owner tasked (decision.reversion), resolved once (reversioned when the scenario''s version moved past the one at the request, or declined with a reason).';

/* THE OUTCOME ASSESSMENT (F-P6-06): four SEPARATE fields — the observed result (the 0045 outcomes it reads, snapshotted), the inferred
   contribution (statement, method, confidence), the counterfactual claim (its basis: a run or a stated model), the changed conditions —
   never merged; by a named human; versioned per committed version (a revision names the one it read). */
CREATE TABLE decision.outcome_assessments (
  assessment_id       uuid PRIMARY KEY,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  package_id          uuid NOT NULL REFERENCES decision.packages_current (package_id),
  version             int  NOT NULL,
  assessment_version  int  NOT NULL CHECK (assessment_version >= 1),
  supersedes          uuid REFERENCES decision.outcome_assessments (assessment_id),
  observed            jsonb NOT NULL CHECK (jsonb_typeof(observed) = 'object' AND observed ? 'outcomes' AND observed ? 'statement'),
  inferred            jsonb NOT NULL CHECK (jsonb_typeof(inferred) = 'object' AND inferred ? 'statement' AND inferred ? 'method' AND inferred ? 'confidence'),
  counterfactual      jsonb NOT NULL CHECK (jsonb_typeof(counterfactual) = 'object' AND counterfactual ? 'claim' AND counterfactual ? 'basis'),
  changed_conditions  jsonb NOT NULL CHECK (jsonb_typeof(changed_conditions) = 'array'),
  digest              text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  assessed_by         uuid NOT NULL,
  assessed_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  item_id             uuid,
  correlation_id      uuid NOT NULL,
  CONSTRAINT dsp_oa_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT dsp_oa_version FOREIGN KEY (package_id, version) REFERENCES decision.package_versions (package_id, version),
  CONSTRAINT dsp_oa_once UNIQUE (package_id, version, assessment_version)
);
CREATE TRIGGER dsp_oa_append_only BEFORE UPDATE OR DELETE ON decision.outcome_assessments FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE decision.outcome_assessments IS 'B35 (0101 §P; F-P6-06): the outcome assessment of a committed version — observed result (the recorded outcomes), inferred contribution (method, confidence), counterfactual claim (basis), changed conditions — four separate fields by a named human; versioned; append-only.';

/* THE REVIEW TERMS of a package version (R-24, V10-T-055): the baseline the outcome is judged against, the replay horizon, the evidence
   standard — set by the package owner; versioned (a revision names the terms version it read). */
CREATE TABLE decision.package_review_terms (
  terms_id            uuid PRIMARY KEY,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  package_id          uuid NOT NULL REFERENCES decision.packages_current (package_id),
  version             int  NOT NULL,
  terms_version       int  NOT NULL CHECK (terms_version >= 1),
  baseline            jsonb NOT NULL CHECK (jsonb_typeof(baseline) = 'object' AND baseline ? 'kind' AND baseline ? 'statement'),
  replay_horizon_days int  NOT NULL CHECK (replay_horizon_days BETWEEN 1 AND 3650),
  evidence_standard   text NOT NULL CHECK (evidence_standard IN ('decision_grade', 'reviewed', 'indicative')),
  evidence_note       text NOT NULL CHECK (length(btrim(evidence_note)) BETWEEN 8 AND 2000),
  set_by              uuid NOT NULL,
  set_at              timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id      uuid NOT NULL,
  CONSTRAINT dsp_terms_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT dsp_terms_version FOREIGN KEY (package_id, version) REFERENCES decision.package_versions (package_id, version),
  CONSTRAINT dsp_terms_once UNIQUE (package_id, version, terms_version)
);
CREATE TRIGGER dsp_terms_append_only BEFORE UPDATE OR DELETE ON decision.package_review_terms FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE decision.package_review_terms IS 'B35 (0101 §P; R-24, V10-T-055): a package version''s review terms — baseline {kind run|outcome_criterion|stated, ref, statement}, replay horizon (days after the commitment), evidence standard (decision_grade | reviewed | indicative) — set by the owner; versioned; append-only.';

/* THE REPLAY'S INITIATOR AND REASON beside decision.replays (0043; that row unchanged): who asked for the replay and why, and whether it
   falls within the replay horizon the version's review terms set. */
CREATE TABLE decision.replay_requests (
  replay_id           uuid PRIMARY KEY REFERENCES decision.replays (replay_id),
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  package_id          uuid NOT NULL,
  version             int  NOT NULL,
  initiator_principal_id uuid NOT NULL,
  reason              text NOT NULL CHECK (length(btrim(reason)) BETWEEN 8 AND 2000),
  terms_id            uuid REFERENCES decision.package_review_terms (terms_id),
  within_horizon      boolean,
  requested_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id      uuid NOT NULL,
  CONSTRAINT dsp_rpl_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX dsp_rpl_package ON decision.replay_requests (package_id, version, requested_at);
CREATE TRIGGER dsp_rpl_append_only BEFORE UPDATE OR DELETE ON decision.replay_requests FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE decision.replay_requests IS 'B35 (0101 §P; F-P6-06 "replay identity/initiator/reason"): the initiator and the reason of a decision replay (decision.replays unchanged), with the review terms read and whether the replay falls within their horizon. Append-only.';

/* A HYPOTHESIS OR LESSON from an outcome assessment, recorded as a GOVERNED MEMORY object (memory.items_current, a person's record through
   the existing memory route) and LINKED here (V00-T-040). */
CREATE TABLE decision.lessons (
  lesson_id           uuid PRIMARY KEY,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  package_id          uuid NOT NULL REFERENCES decision.packages_current (package_id),
  assessment_id       uuid NOT NULL REFERENCES decision.outcome_assessments (assessment_id),
  kind                text NOT NULL CHECK (kind IN ('hypothesis', 'lesson')),
  memory_item_id      uuid NOT NULL,
  memory_version      int  NOT NULL,
  title               text NOT NULL,
  linked_by           uuid NOT NULL,
  linked_at           timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id      uuid NOT NULL,
  CONSTRAINT dsp_lsn_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT dsp_lsn_once UNIQUE (assessment_id, memory_item_id)
);
CREATE TRIGGER dsp_lsn_append_only BEFORE UPDATE OR DELETE ON decision.lessons FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE decision.lessons IS 'B35 (0101 §P; V00-T-040): a hypothesis or lesson of an outcome assessment as a governed memory object (MEM, recorded through memory.item.record) linked to the assessment and the package. Append-only.';

/* THE REVIEW CADENCE of a scenario set (F-P4-08; F-P4-09's miss routed as a task): every N days from an anchor (the last review held, or
   the instant named); versioned; the newest version is in force. A SIDE TABLE in `decision` (no prediction table: phase4-acceptance D8's
   FORCE-RLS prediction count does not move). */
CREATE TABLE decision.set_review_cadences (
  cadence_id          uuid PRIMARY KEY,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  set_id              uuid NOT NULL REFERENCES prediction.scenario_sets (set_id),
  cadence_version     int  NOT NULL CHECK (cadence_version >= 1),
  every_days          int  NOT NULL CHECK (every_days BETWEEN 1 AND 366),
  anchor_at           timestamptz NOT NULL,
  rationale           text NOT NULL CHECK (length(btrim(rationale)) BETWEEN 8 AND 2000),
  set_by              uuid NOT NULL,
  set_at              timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id      uuid NOT NULL,
  CONSTRAINT dsp_cad_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT dsp_cad_once UNIQUE (set_id, cadence_version)
);
CREATE TRIGGER dsp_cad_append_only BEFORE UPDATE OR DELETE ON decision.set_review_cadences FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE decision.set_review_cadences IS 'B35 (0101 §P; F-P4-08/-09): a scenario set''s review cadence — every N days from the anchor or the last portfolio review, whichever is later; versioned; append-only.';

/* A MISSED REVIEW: once per (set, due instant) — the set owner tasked (decision.review_due); closed once when a review is recorded. */
CREATE TABLE decision.set_review_misses (
  miss_id             uuid PRIMARY KEY,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  set_id              uuid NOT NULL REFERENCES prediction.scenario_sets (set_id),
  cadence_id          uuid NOT NULL REFERENCES decision.set_review_cadences (cadence_id),
  due_at              timestamptz NOT NULL,
  owner_principal_id  uuid NOT NULL,
  item_id             uuid NOT NULL,
  detected_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  met_at              timestamptz,
  met_by_review_id    uuid,
  correlation_id      uuid NOT NULL,
  CONSTRAINT dsp_miss_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT dsp_miss_met CHECK ((met_at IS NULL) = (met_by_review_id IS NULL))
);
CREATE UNIQUE INDEX dsp_miss_once ON decision.set_review_misses (set_id, due_at);
CREATE OR REPLACE FUNCTION decision.dsp_miss_guard() RETURNS trigger
SET search_path = decision, pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'review rejected (append_only): a missed review is never deleted' USING ERRCODE = '2F002'; END IF;
  IF OLD.met_at IS NOT NULL OR (to_jsonb(NEW) - ARRAY['met_at', 'met_by_review_id']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['met_at', 'met_by_review_id']) THEN
    RAISE EXCEPTION 'review rejected (append_only): miss % is written once and met once', OLD.miss_id USING ERRCODE = '2F002';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER dsp_miss_guard BEFORE UPDATE OR DELETE ON decision.set_review_misses FOR EACH ROW EXECUTE FUNCTION decision.dsp_miss_guard();
COMMENT ON TABLE decision.set_review_misses IS 'B35 (0101 §P; F-P4-09): a scenario set''s review that fell due without a portfolio review — once per due instant, the owner tasked (decision.review_due); met once by the review that followed.';

/* THIS PART'S OWN LEDGER (decision.package_events is not widened). */
CREATE TABLE decision.review_events (
  event_id            uuid PRIMARY KEY,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  package_id          uuid,
  set_id              uuid,
  event               text NOT NULL CHECK (event IN ('condition_change.recorded', 'reversion.requested', 'reversion.resolved', 'outcome.assessed', 'terms.set',
                                                     'replay.requested', 'lesson.linked', 'cadence.set', 'cadence.missed', 'cadence.met')),
  actor_principal_id  uuid NOT NULL,
  details             jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id      uuid NOT NULL,
  CONSTRAINT dsp_evt_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT dsp_evt_subject CHECK (package_id IS NOT NULL OR set_id IS NOT NULL)
);
CREATE INDEX dsp_evt_package ON decision.review_events (package_id, occurred_at) WHERE package_id IS NOT NULL;
CREATE INDEX dsp_evt_set ON decision.review_events (set_id, occurred_at) WHERE set_id IS NOT NULL;
CREATE TRIGGER dsp_evt_append_only BEFORE UPDATE OR DELETE ON decision.review_events FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE decision.review_events IS 'B35 (0101 §P): the reopen part''s own ledger — condition changes, reversion requests and their resolution, outcome assessments, review terms, replay requests, lessons, set review cadences and their misses. Append-only.';

-- ─────────────────────────────────────────────────────────────────────
-- §P2 THE PRIVATE HELPERS (the definer's; not granted)
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION decision.dsp_event(p_tenant uuid, p_domain uuid, p_package uuid, p_set uuid, p_event text, p_actor uuid, p_details jsonb, p_correlation uuid) RETURNS uuid
SET search_path = decision, pg_catalog, pg_temp AS $$
DECLARE v uuid := gen_random_uuid();
BEGIN
  INSERT INTO decision.review_events (event_id, scope, tenant_id, domain_id, package_id, set_id, event, actor_principal_id, details, correlation_id)
  VALUES (v, 'DOMAIN', p_tenant, p_domain, p_package, p_set, p_event, p_actor, coalesce(p_details, '{}'::jsonb), p_correlation);
  RETURN v;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.dsp_event(uuid, uuid, uuid, uuid, text, uuid, jsonb, uuid) FROM PUBLIC;

/* The NOTICE (the 0095/0099 notify idiom): an attention item of the class, owned by a person (open when an active human, else unrouted);
   its cause the review_events row. */
CREATE OR REPLACE FUNCTION decision.dsp_notify(p_tenant uuid, p_domain uuid, p_class text, p_subject_kind text, p_subject uuid, p_title text, p_reasons jsonb, p_owner uuid,
                                               p_cause_event uuid, p_cause_type text, p_details jsonb, p_due interval, p_actor uuid, p_correlation uuid) RETURNS uuid
SECURITY DEFINER SET search_path = executive, identity, decision, pg_catalog, pg_temp AS $$
DECLARE v_item uuid := gen_random_uuid(); v_state text; v_due timestamptz := clock_timestamp() + p_due;
BEGIN
  v_state := CASE WHEN p_owner IS NOT NULL AND decision.is_active_human(p_owner, p_tenant) THEN 'open' ELSE 'unrouted' END;
  INSERT INTO executive.attention_items (item_id, scope, tenant_id, domain_id, signal_class, subject_kind, subject_id, cause_event_id, cause_event_type, title, outcome, state, owner_principal_id, route_roles, evaluation, details, due_at, escalations, correlation_id)
  VALUES (v_item, 'DOMAIN', p_tenant, p_domain, p_class, p_subject_kind, p_subject, p_cause_event, p_cause_type, left(p_title, 512), 'material', v_state, p_owner, '{}',
          jsonb_build_object('outcome', 'material', 'reasons', p_reasons, 'policy_version', NULL, 'dimensions', jsonb_build_object('consequence', 'C2', 'confidence', 1)),
          coalesce(p_details, '{}'::jsonb), v_due, 0, p_correlation);
  PERFORM executive.attention_event(v_item, p_tenant, p_domain, CASE v_state WHEN 'open' THEN 'item.routed' ELSE 'item.unrouted' END, p_actor,
            jsonb_build_object('outcome', 'material', 'reasons', p_reasons, 'policy_version', NULL, 'owner', p_owner, 'route_roles', '[]'::jsonb, 'due_at', v_due,
                               'cause_event_id', p_cause_event, 'cause_event_type', p_cause_type, 'unrouted', v_state = 'unrouted'), p_correlation);
  RETURN v_item;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.dsp_notify(uuid, uuid, text, text, uuid, text, jsonb, uuid, uuid, text, jsonb, interval, uuid, uuid) FROM PUBLIC;

/* Close an attention item this part raised (once; a closed item stays closed). */
CREATE OR REPLACE FUNCTION decision.dsp_close_item(p_item uuid, p_tenant uuid, p_domain uuid, p_reason text, p_details jsonb, p_actor uuid, p_correlation uuid) RETURNS boolean
SECURITY DEFINER SET search_path = executive, decision, pg_catalog, pg_temp AS $$
BEGIN
  IF p_item IS NULL OR NOT EXISTS (SELECT 1 FROM executive.attention_items x WHERE x.item_id = p_item AND x.state <> 'closed') THEN RETURN false; END IF;
  UPDATE executive.attention_items SET state = 'closed', closed_at = clock_timestamp(), closed_by = p_actor, suppressed_until = NULL, updated_at = clock_timestamp() WHERE item_id = p_item;
  PERFORM executive.attention_event(p_item, p_tenant, p_domain, 'item.closed', p_actor, jsonb_build_object('reason', p_reason) || coalesce(p_details, '{}'::jsonb), p_correlation);
  RETURN true;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.dsp_close_item(uuid, uuid, uuid, text, jsonb, uuid, uuid) FROM PUBLIC;

/* The scenarios a COMMITTED version rests on: the members of the sets bound to the package (not retired) and the scenarios of the runs its
   options cite — each with how it was reached. */
CREATE OR REPLACE FUNCTION decision.dsp_scenarios_of(p_package_id uuid, p_version int) RETURNS TABLE (scenario_id uuid, via jsonb)
LANGUAGE sql STABLE SET search_path = decision, prediction, simulation, pg_catalog, pg_temp AS $$
  WITH reached AS (
    SELECT m.scenario_id, jsonb_build_object('kind', 'set', 'id', ps.set_id, 'member_id', m.member_id, 'branch_id', m.branch_id) AS via
      FROM decision.package_scenario_sets ps JOIN prediction.scenario_sets s ON s.set_id = ps.set_id AND s.state <> 'retired'
      JOIN prediction.scenario_set_members m ON m.set_id = ps.set_id AND m.removed_at IS NULL
     WHERE ps.package_id = p_package_id
    UNION ALL
    SELECT r.scenario_id, jsonb_build_object('kind', 'run', 'id', r.run_id, 'option_key', o.key, 'branch_id', r.scenario_branch_id)
      FROM decision.options o CROSS JOIN LATERAL jsonb_array_elements(o.consequences) c
      JOIN simulation.runs_current r ON c ->> 'kind' = 'run' AND r.run_id = (c ->> 'id')::uuid
     WHERE o.package_id = p_package_id AND o.version = p_version AND r.scenario_id IS NOT NULL)
  SELECT x.scenario_id, jsonb_agg(x.via ORDER BY x.via ->> 'kind', x.via ->> 'id') FROM reached x GROUP BY x.scenario_id ORDER BY x.scenario_id $$;
REVOKE ALL ON FUNCTION decision.dsp_scenarios_of(uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.dsp_scenarios_of(uuid, int) TO eye_app, eye_commit;   -- a read (the caller's RLS); cited_scenarios_outside_sets and the metrics read call it

/* THE REVERSION ON A REOPEN (V02-T-014): each active scenario the committed version rests on — a request, its owner tasked (decision.reversion).
   Called by decision.reopen_package only (a private helper, not a port: it locks nothing the reopen locks). */
CREATE OR REPLACE FUNCTION decision.dsp_request_reversions(p_tenant uuid, p_domain uuid, p_package_id uuid, p_title text, p_committed int, p_new int, p_reopen_event uuid, p_cause jsonb, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, prediction, executive, identity, pg_catalog, pg_temp AS $$
DECLARE x record; sc prediction.scenarios_current%ROWTYPE; v_req uuid; v_ev uuid; v_item uuid; v_out jsonb := '[]'::jsonb;
BEGIN
  FOR x IN SELECT * FROM decision.dsp_scenarios_of(p_package_id, p_committed) LOOP
    SELECT * INTO sc FROM prediction.scenarios_current s WHERE s.scenario_id = x.scenario_id;
    CONTINUE WHEN NOT FOUND OR sc.state <> 'active';
    v_req := gen_random_uuid();
    v_ev := decision.dsp_event(p_tenant, p_domain, p_package_id, NULL, 'reversion.requested', p_actor,
              jsonb_build_object('request_id', v_req, 'scenario_id', sc.scenario_id, 'scenario_version', sc.current_version, 'owner', sc.owner_principal_id, 'via', x.via,
                                 'reopen_event_id', p_reopen_event, 'cause_kind', p_cause ->> 'kind', 'new_version', p_new), p_correlation);
    v_item := decision.dsp_notify(p_tenant, p_domain, 'decision.reversion', 'scenario', sc.scenario_id,
              format('Re-version the scenario: %s — the decision "%s" was reopened (%s)', sc.title, p_title, replace(p_cause ->> 'kind', '_', ' ')),
              jsonb_build_array(format('the committed decision "%s" (version %s) was reopened on a recorded cause (%s); version %s is open', p_title, p_committed, replace(p_cause ->> 'kind', '_', ' '), p_new),
                                format('it rests on this scenario (version %s) through %s', sc.current_version, (SELECT string_agg(v ->> 'kind', ', ') FROM jsonb_array_elements(x.via) v)),
                                'branch or revise the scenario through its route, then mark the request re-versioned (or decline it with a reason)'),
              sc.owner_principal_id, v_ev, 'DecisionReopened',
              jsonb_build_object('request_id', v_req, 'package_id', p_package_id, 'scenario_id', sc.scenario_id, 'scenario_version', sc.current_version, 'new_version', p_new), interval '72 hours', p_actor, p_correlation);
    INSERT INTO decision.scenario_reversion_requests (request_id, scope, tenant_id, domain_id, package_id, reopen_event_id, committed_version, new_version, cause, scenario_id, scenario_version_at_request,
                                                      via, owner_principal_id, item_id, correlation_id)
    VALUES (v_req, 'DOMAIN', p_tenant, p_domain, p_package_id, p_reopen_event, p_committed, p_new, p_cause, sc.scenario_id, sc.current_version, x.via, sc.owner_principal_id, v_item, p_correlation);
    v_out := v_out || jsonb_build_object('request_id', v_req, 'scenario_id', sc.scenario_id, 'scenario_version', sc.current_version, 'owner', sc.owner_principal_id, 'item_id', v_item, 'via', x.via);
  END LOOP;
  RETURN v_out;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.dsp_request_reversions(uuid, uuid, uuid, text, int, int, uuid, jsonb, uuid, uuid) FROM PUBLIC;

-- ─────────────────────────────────────────────────────────────────────
-- §P3 decision.reopen_package RE-DECLARED — 0083:994's body copied whole (0078's with the policy cause); the B35 changes marked
--     `B35 (0101)`: the causes challenge_upheld, appeal_upheld (to_regclass) and conditions_changed, each consumed by one reopen; the
--     scenarios the committed version rests on tasked (dsp_request_reversions); the answer gains `scenario_reversions` ONLY when a scenario
--     was tasked. The events version.opened and package.reopened and their details are unchanged (interfaces-b18 :753/:758 pins).
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION decision.reopen_package(p_package_id uuid, p_tenant uuid, p_domain uuid, p_cause jsonb, p_known_at timestamp with time zone, p_observed_through date, p_actor uuid, p_event_id uuid, p_correlation uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'decision', 'simulation', 'twin', 'prediction', 'objects', 'observation', 'ctx', 'public', 'pg_catalog', 'pg_temp'
AS $function$
DECLARE p decision.packages_current%ROWTYPE; cv decision.package_versions%ROWTYPE; c decision.commitments%ROWTYPE; n decision.package_events%ROWTYPE; b decision.condition_breaches%ROWTYPE;
        v_kind text; v_ref uuid; v_cause jsonb; v_exposed jsonb := '[]'::jsonb; v_next int; v_open int; opt record; d jsonb; v_carried jsonb := '[]'::jsonb; v_dropped jsonb := '[]'::jsonb;
        v_at timestamptz := clock_timestamp(); v_known timestamptz; v_obs date; v_err text;
        /* B35 (0101) */ ch decision.challenges%ROWTYPE; cc decision.condition_changes%ROWTYPE; v_case jsonb; v_reversions jsonb := '[]'::jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.package.reopen']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'reopen rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF p_cause IS NULL OR jsonb_typeof(p_cause) <> 'object' OR coalesce(p_cause ->> 'kind', '') NOT IN ('input_invalidated', 'condition_breach', 'policy_changed', /* B35 (0101) */ 'challenge_upheld', 'appeal_upheld', 'conditions_changed') OR coalesce(p_cause ->> 'ref', '') !~ '^[0-9a-f-]{36}$' THEN
    RAISE EXCEPTION 'reopen rejected: a cause is a recorded input_invalidated note, a condition_breach, a policy_changed note, an upheld challenge (challenge_upheld), an upheld appeal (appeal_upheld) or a recorded change of conditions (conditions_changed) of this package, named by its id ({kind, ref})' USING ERRCODE = '22023';
  END IF;
  v_kind := p_cause ->> 'kind'; v_ref := (p_cause ->> 'ref')::uuid;
  SELECT * INTO p FROM decision.packages_current x WHERE x.package_id = p_package_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'reopen rejected: no such package in this domain' USING ERRCODE = '23503'; END IF;
  IF p.owner_principal_id <> p_actor THEN RAISE EXCEPTION 'reopen rejected: the package owner reopens it' USING ERRCODE = '42501'; END IF;
  IF p.state = 'reopened' THEN RAISE EXCEPTION 'reopen rejected: package % is reopened with version % open; propose and commit it before reopening again', p_package_id, p.current_version USING ERRCODE = '22023'; END IF;
  IF p.state = 'closed' THEN RAISE EXCEPTION 'reopen rejected: package % is closed; a closed decision is not reopened — a new package is declared', p_package_id USING ERRCODE = '22023'; END IF;
  IF p.state NOT IN ('committed', 'monitoring') THEN RAISE EXCEPTION 'reopen rejected: package % is %, not committed — a decision is reopened from its commitment; a draft or a proposal is versioned', p_package_id, p.state USING ERRCODE = '22023'; END IF;
  SELECT * INTO cv FROM decision.package_versions x WHERE x.package_id = p_package_id AND x.version = p.committed_version;
  SELECT * INTO c FROM decision.commitments x WHERE x.package_id = p_package_id AND x.version = p.committed_version;
  IF v_kind = 'input_invalidated' THEN
    SELECT * INTO n FROM decision.package_events e WHERE e.event_id = v_ref AND e.package_id = p_package_id AND e.event = 'input.invalidated';
    IF NOT FOUND THEN RAISE EXCEPTION 'reopen rejected: no such note % on package %', v_ref, p_package_id USING ERRCODE = '23503'; END IF;
    IF n.occurred_at <= c.committed_at THEN RAISE EXCEPTION 'reopen rejected: no recorded cause — note % was recorded at %, before the commitment at %; what was known at the decision is not a cause to reopen it', v_ref, decision.iso(n.occurred_at), decision.iso(c.committed_at) USING ERRCODE = '22023'; END IF;
    v_cause := jsonb_build_object('kind', v_kind, 'ref', v_ref, 'recorded_at', n.occurred_at, 'change_kind', n.details ->> 'change_kind', 'via', n.details -> 'via', 'failure_class', n.details ->> 'failure_class', 'disposition', n.details ->> 'disposition', 'note', n.details ->> 'note', 'outbox_event_id', n.details ->> 'outbox_event_id');
    v_exposed := coalesce(n.details -> 'via', '[]'::jsonb);
  ELSIF v_kind = 'policy_changed' THEN
    -- 0083 (B22; L9-I05's clause): the ATTENTION POLICY changed after the commitment — the note the attention subscriber recorded from
    -- AttentionPolicyChanged, carrying the version in force at the commitment and the version now in force. The same rule as a note:
    -- what was known at the decision is not a cause to reopen it.
    SELECT * INTO n FROM decision.package_events e WHERE e.event_id = v_ref AND e.package_id = p_package_id AND e.event = 'policy.changed';
    IF NOT FOUND THEN RAISE EXCEPTION 'reopen rejected: no such policy note % on package %', v_ref, p_package_id USING ERRCODE = '23503'; END IF;
    IF n.occurred_at <= c.committed_at THEN RAISE EXCEPTION 'reopen rejected: no recorded cause — policy note % was recorded at %, before the commitment at %; the policy in force at the decision is not a cause to reopen it', v_ref, decision.iso(n.occurred_at), decision.iso(c.committed_at) USING ERRCODE = '22023'; END IF;
    v_cause := jsonb_build_object('kind', v_kind, 'ref', v_ref, 'recorded_at', n.occurred_at, 'policy_id', n.details ->> 'policy_id', 'from_version', n.details -> 'from_version', 'to_version', n.details -> 'to_version',
                                  'changed_sections', n.details -> 'changed_sections', 'changed_classes', n.details -> 'changed_classes', 'outbox_event_id', n.details ->> 'outbox_event_id');
    v_exposed := jsonb_build_array(jsonb_build_object('kind', 'attention_policy', 'id', n.details ->> 'policy_id', 'from_version', n.details -> 'from_version', 'to_version', n.details -> 'to_version'));
  /* B35 (0101): three more recorded causes — each recorded AFTER the standing commitment, each consumed by one reopen only. */
  ELSIF v_kind = 'challenge_upheld' THEN
    -- §B36.12 row 11: a 0094 challenge resolved UPHELD after the commitment records effect reopen_required; it is the cause here.
    SELECT * INTO ch FROM decision.challenges x WHERE x.challenge_id = v_ref AND x.package_id = p_package_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'reopen rejected (unknown_challenge): no such challenge % on package %', v_ref, p_package_id USING ERRCODE = '23503'; END IF;
    IF ch.resolution IS DISTINCT FROM 'upheld' OR coalesce(ch.effect ->> 'kind', '') <> 'reopen_required' THEN
      RAISE EXCEPTION 'reopen rejected (cause_state): challenge % is %, effect %; only a challenge upheld after the commitment (reopen_required) is a cause to reopen', v_ref, coalesce(ch.resolution, 'open'), coalesce(ch.effect ->> 'kind', 'none') USING ERRCODE = '22023';
    END IF;
    IF ch.resolved_at <= c.committed_at OR ch.version <> p.committed_version THEN
      RAISE EXCEPTION 'reopen rejected (cause_state): challenge % (version %) was resolved at %, not after the standing commitment (version %, %)', v_ref, ch.version, decision.iso(ch.resolved_at), p.committed_version, decision.iso(c.committed_at) USING ERRCODE = '22023';
    END IF;
    v_cause := jsonb_build_object('kind', v_kind, 'ref', v_ref, 'recorded_at', ch.resolved_at, 'version', ch.version, 'challenger', ch.challenger_principal_id, 'standing', ch.standing,
                                  'reason', ch.reason, 'resolution', ch.resolution, 'resolution_note', ch.resolution_note, 'resolved_by', ch.resolved_by);
    v_exposed := jsonb_build_array(jsonb_build_object('kind', 'challenge', 'id', v_ref, 'version', ch.version));
  ELSIF v_kind = 'appeal_upheld' THEN
    -- §E's appeal case (decision.appeal_cases, read through to_regclass so this part stands alone): adjudicated upheld or partly upheld on this
    -- DECIDED package after the commitment, its effect reopen_required. The seam the integrator asserts in the combined harness.
    IF to_regclass('decision.appeal_cases') IS NULL THEN
      RAISE EXCEPTION 'reopen rejected (unknown_appeal): no appeal cases are recorded in this database (appeal %)', v_ref USING ERRCODE = '23503';
    END IF;
    EXECUTE 'SELECT to_jsonb(a) FROM decision.appeal_cases a WHERE a.case_id = $1 AND a.package_id = $2' INTO v_case USING v_ref, p_package_id;
    IF v_case IS NULL THEN RAISE EXCEPTION 'reopen rejected (unknown_appeal): no such appeal % on package %', v_ref, p_package_id USING ERRCODE = '23503'; END IF;
    IF coalesce(v_case ->> 'outcome', '') NOT IN ('upheld', 'partly_upheld') OR coalesce(v_case -> 'effect' ->> 'kind', '') <> 'reopen_required' THEN
      RAISE EXCEPTION 'reopen rejected (cause_state): appeal % is % (outcome %, effect %); only an upheld appeal of the decided package (reopen_required) is a cause to reopen', v_ref,
        coalesce(v_case ->> 'state', '?'), coalesce(v_case ->> 'outcome', 'none'), coalesce(v_case -> 'effect' ->> 'kind', 'none') USING ERRCODE = '22023';
    END IF;
    IF (v_case ->> 'adjudicated_at')::timestamptz <= c.committed_at THEN
      RAISE EXCEPTION 'reopen rejected (cause_state): appeal % was adjudicated at %, before the standing commitment at %', v_ref, v_case ->> 'adjudicated_at', decision.iso(c.committed_at) USING ERRCODE = '22023';
    END IF;
    v_cause := jsonb_build_object('kind', v_kind, 'ref', v_ref, 'recorded_at', v_case -> 'adjudicated_at', 'outcome', v_case -> 'outcome', 'appellant', v_case -> 'appellant_principal_id',
                                  'adjudicator', v_case -> 'adjudicator_principal_id', 'grounds', v_case -> 'grounds', 'rationale', v_case -> 'rationale', 'subject_kind', v_case -> 'subject_kind');
    v_exposed := jsonb_build_array(jsonb_build_object('kind', 'appeal_case', 'id', v_ref, 'subject_kind', v_case -> 'subject_kind', 'subject_id', v_case -> 'subject_id'));
  ELSIF v_kind = 'conditions_changed' THEN
    -- a NAMED change with its evidence ("the corridor reopens"), recorded on this package after the commitment (decision.record_condition_change).
    SELECT * INTO cc FROM decision.condition_changes x WHERE x.change_id = v_ref AND x.package_id = p_package_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'reopen rejected (unknown_change): no such change of conditions % on package %', v_ref, p_package_id USING ERRCODE = '23503'; END IF;
    IF cc.recorded_at <= c.committed_at OR cc.committed_version <> p.committed_version THEN
      RAISE EXCEPTION 'reopen rejected (cause_state): change % was recorded against version % at %, not after the standing commitment (version %, %)', v_ref, cc.committed_version, decision.iso(cc.recorded_at), p.committed_version, decision.iso(c.committed_at) USING ERRCODE = '22023';
    END IF;
    v_cause := jsonb_build_object('kind', v_kind, 'ref', v_ref, 'recorded_at', cc.recorded_at, 'title', cc.title, 'statement', cc.statement, 'evidence', cc.evidence, 'recorded_by', cc.recorded_by);
    v_exposed := (SELECT coalesce(jsonb_agg(e ORDER BY ord), '[]'::jsonb) FROM jsonb_array_elements(cc.evidence) WITH ORDINALITY AS t(e, ord));
  /* end B35 (0101) */
  ELSE
    SELECT * INTO b FROM decision.condition_breaches x WHERE x.breach_id = v_ref AND x.package_id = p_package_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'reopen rejected: no such breach % on package %', v_ref, p_package_id USING ERRCODE = '23503'; END IF;
    IF b.version <> p.committed_version THEN RAISE EXCEPTION 'reopen rejected: no recorded cause — breach % is of version %, not the standing commitment (version %)', v_ref, b.version, p.committed_version USING ERRCODE = '22023'; END IF;
    v_cause := jsonb_build_object('kind', v_kind, 'ref', v_ref, 'recorded_at', b.detected_at, 'condition_index', b.condition_index, 'condition', b.condition, 'warning_id', b.warning_id, 'routed_to', b.routed_to);
    v_exposed := jsonb_build_array(jsonb_build_object('kind', 'warning', 'id', b.warning_id, 'condition_index', b.condition_index));
  END IF;
  /* B35 (0101): a challenge, an appeal or a change of conditions is consumed by ONE reopen (the earlier kinds keep their own rules). */
  IF v_kind IN ('challenge_upheld', 'appeal_upheld', 'conditions_changed') AND EXISTS (SELECT 1 FROM decision.package_events e WHERE e.package_id = p_package_id AND e.event = 'package.reopened'
       AND e.details -> 'cause' ->> 'kind' = v_kind AND e.details -> 'cause' ->> 'ref' = v_ref::text) THEN
    RAISE EXCEPTION 'reopen rejected (cause_state): % % already reopened package %; a recorded cause reopens a decision once', replace(v_kind, '_', ' '), v_ref, p_package_id USING ERRCODE = '22023';
  END IF;
  /* end B35 (0101) */
  SELECT count(*) INTO v_open FROM decision.package_versions v WHERE v.package_id = p_package_id AND v.state = 'draft';
  IF v_open > 0 THEN RAISE EXCEPTION 'reopen rejected: the package already has an open draft; propose it or withdraw it' USING ERRCODE = '22023'; END IF;
  v_known := coalesce(p_known_at, v_at); v_obs := coalesce(p_observed_through, cv.observed_through);
  SELECT coalesce(max(version), 0) + 1 INTO v_next FROM decision.package_versions WHERE package_id = p_package_id;
  INSERT INTO decision.package_versions (package_id, version, scope, tenant_id, domain_id, supersedes, state, known_at, observed_through, objectives, constraints, approver_policy, monitoring_conditions,
                                         reversibility, information_value, second_order, risks, opportunities, author_principal_id, correlation_id)
  VALUES (p_package_id, v_next, 'DOMAIN', p_tenant, p_domain, p.committed_version, 'draft', v_known, v_obs, cv.objectives, cv.constraints, cv.approver_policy, cv.monitoring_conditions,
          cv.reversibility, cv.information_value, cv.second_order, cv.risks, cv.opportunities, p_actor, p_correlation);
  -- the tolerant carry: each committed option re-derived under the new cut-offs in its own block — dropped and named when it does not enter them
  FOR opt IN SELECT * FROM decision.options x WHERE x.package_id = p_package_id AND x.version = p.committed_version ORDER BY x.key LOOP
    BEGIN
      d := decision.derive_option(p_tenant, p_domain, v_known, v_obs, opt.consequences, opt.unsimulated_reason, format('reopen: carried option %s', opt.key));
      INSERT INTO decision.options (option_id, scope, tenant_id, domain_id, package_id, version, key, title, kind, consequences, simulated, unsimulated_reason,
                                    uncertainty, second_order, risks, opportunities, reversibility, synthetic_state, controls, set_by, correlation_id)
      VALUES (gen_random_uuid(), opt.scope, opt.tenant_id, opt.domain_id, opt.package_id, v_next, opt.key, opt.title, opt.kind, opt.consequences, (d ->> 'simulated')::boolean,
              CASE WHEN (d ->> 'simulated')::boolean THEN NULL ELSE opt.unsimulated_reason END,
              d -> 'uncertainty', opt.second_order, opt.risks, opt.opportunities, opt.reversibility, (d ->> 'synthetic_state')::boolean, d -> 'controls', p_actor, p_correlation);
      v_carried := v_carried || to_jsonb(opt.key);
    EXCEPTION WHEN SQLSTATE '22023' OR SQLSTATE '23503' THEN
      GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
      v_dropped := v_dropped || jsonb_build_object('key', opt.key, 'reason', v_err);
    END;
  END LOOP;
  UPDATE decision.packages_current
     SET state = 'reopened', current_version = v_next, reopened_at = v_at, reopened_by = p_actor, reopened_from_version = p.committed_version, reopen_cause = v_cause, reopens = reopens + 1
   WHERE package_id = p_package_id;
  INSERT INTO decision.package_events (event_id, scope, tenant_id, domain_id, package_id, event, actor_principal_id, details, occurred_at, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_package_id, 'version.opened', p_actor,
          jsonb_build_object('version', v_next, 'supersedes', p.committed_version, 'known_at', v_known, 'observed_through', v_obs, 'carried_from', p.committed_version, 'carried_options_rederived', true, 'reopened', true), v_at, p_correlation);
  INSERT INTO decision.package_events (event_id, scope, tenant_id, domain_id, package_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_package_id, 'package.reopened', p_actor,
          jsonb_build_object('committed_version', p.committed_version, 'commitment_id', c.commitment_id, 'committed_at', c.committed_at, 'new_version', v_next, 'cause', v_cause, 'exposed_inputs', v_exposed,
                             'options_carried', v_carried, 'options_dropped', v_dropped, 'known_at', v_known, 'observed_through', v_obs, 'reopens', p.reopens + 1), p_correlation);
  /* B35 (0101) V02-T-014: the scenarios the committed version rests on — each owner TASKED to re-version (decision.reversion), a request recorded
     in this part's ledger; nothing is written to the decision ledger beyond the two events above. */
  v_reversions := decision.dsp_request_reversions(p_tenant, p_domain, p_package_id, p.title, p.committed_version, v_next, p_event_id, v_cause, p_actor, p_correlation);
  /* end B35 (0101) */
  RETURN CASE WHEN jsonb_array_length(v_reversions) = 0 THEN '{}'::jsonb ELSE jsonb_build_object('scenario_reversions', v_reversions) END /* B35 (0101): only when a scenario was tasked */ || jsonb_build_object('package_id', p_package_id, 'committed_version', p.committed_version, 'commitment_id', c.commitment_id, 'committed_at', c.committed_at, 'new_version', v_next, 'cause', v_cause,
                            'exposed_inputs', v_exposed, 'options_carried', v_carried, 'options_dropped', v_dropped, 'reopened_at', v_at, 'reopens', p.reopens + 1, 'known_at', v_known, 'observed_through', v_obs);
END $function$;
REVOKE ALL ON FUNCTION decision.reopen_package(uuid,uuid,uuid,jsonb,timestamptz,date,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.reopen_package(uuid,uuid,uuid,jsonb,timestamptz,date,uuid,uuid,uuid) TO eye_commit;

-- ─────────────────────────────────────────────────────────────────────
-- §P4 THE PORTS — SECURITY DEFINER, the bound action asserted, the scope asserted, the acting principal recorded; REVOKE PUBLIC / GRANT eye_commit
-- ─────────────────────────────────────────────────────────────────────
/* The shared checks of a person's act (the definer's; not granted). */
CREATE OR REPLACE FUNCTION decision.dsp_assert_person(p_actor uuid, p_tenant uuid, p_what text) RETURNS void
SET search_path = decision, public, pg_catalog, pg_temp AS $$
BEGIN
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'review rejected (actor): % is recorded by the acting principal', p_what USING ERRCODE = '42501'; END IF;
  IF NOT decision.is_active_human(p_actor, p_tenant) THEN RAISE EXCEPTION 'review rejected (actor): % is a named, active person''s act', p_what USING ERRCODE = '42501'; END IF;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.dsp_assert_person(uuid, uuid, text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION decision.dsp_text(p_value text, p_min int, p_max int, p_class text, p_what text) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF p_value IS NULL OR length(btrim(p_value)) < p_min OR length(btrim(p_value)) > p_max THEN
    RAISE EXCEPTION 'review rejected (%): % (% to % characters)', p_class, p_what, p_min, p_max USING ERRCODE = '22023';
  END IF;
  RETURN btrim(p_value);
END $$;
REVOKE ALL ON FUNCTION decision.dsp_text(text, int, int, text, text) FROM PUBLIC;

/* Whether a recorded object of a kind exists in the domain (the evidence a change of conditions names). */
CREATE OR REPLACE FUNCTION decision.dsp_object_exists(p_tenant uuid, p_domain uuid, p_kind text, p_id uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path = decision, prediction, simulation, objects, pg_catalog, pg_temp AS $$
  SELECT CASE p_kind
    WHEN 'warning'   THEN EXISTS (SELECT 1 FROM prediction.warnings_current x WHERE x.warning_id = p_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain)
    WHEN 'signal'    THEN EXISTS (SELECT 1 FROM prediction.signals_current x WHERE x.signal_id = p_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain)
    WHEN 'indicator' THEN EXISTS (SELECT 1 FROM prediction.indicators_current x WHERE x.indicator_id = p_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain)
    WHEN 'forecast'  THEN EXISTS (SELECT 1 FROM prediction.forecasts_current x WHERE x.forecast_id = p_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain)
    WHEN 'scenario'  THEN EXISTS (SELECT 1 FROM prediction.scenarios_current x WHERE x.scenario_id = p_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain)
    WHEN 'run'       THEN EXISTS (SELECT 1 FROM simulation.runs_current x WHERE x.run_id = p_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain)
    WHEN 'claim'     THEN EXISTS (SELECT 1 FROM objects.canonical_objects x WHERE x.object_id = p_id AND x.object_type = 'CLM' AND x.tenant_id = p_tenant AND x.domain_id = p_domain)
    WHEN 'evidence'  THEN EXISTS (SELECT 1 FROM objects.canonical_objects x WHERE x.object_id = p_id AND x.object_type = 'EVD' AND x.tenant_id = p_tenant AND x.domain_id = p_domain)
    ELSE false END $$;
REVOKE ALL ON FUNCTION decision.dsp_object_exists(uuid, uuid, text, uuid) FROM PUBLIC;

/* P1 RECORD A CHANGE OF CONDITIONS (decision.review.change): a named person states a change bearing on a COMMITTED decision, with 1–20
   recorded objects that evidence it ({kind warning|signal|indicator|forecast|scenario|run|claim|evidence, id, note?}); the owner may then
   reopen on it (conditions_changed). */
CREATE OR REPLACE FUNCTION decision.record_condition_change(
  p_change_id uuid, p_tenant uuid, p_domain uuid, p_package_id uuid, p_title text, p_statement text, p_evidence jsonb, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, prediction, simulation, objects, executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE p decision.packages_current%ROWTYPE; c decision.commitments%ROWTYPE; e jsonb; v_ev jsonb := '[]'::jsonb; v_title text; v_statement text; r decision.condition_changes%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.review.change']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM decision.dsp_assert_person(p_actor, p_tenant, 'a change of conditions');
  SELECT * INTO p FROM decision.packages_current x WHERE x.package_id = p_package_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'review rejected (unknown_package): % is not a decision package of this domain', p_package_id USING ERRCODE = '23503'; END IF;
  IF p.state NOT IN ('committed', 'monitoring') THEN
    RAISE EXCEPTION 'review rejected (state): package % is %; a change of conditions is recorded against a standing commitment', p_package_id, p.state USING ERRCODE = '22023';
  END IF;
  SELECT * INTO c FROM decision.commitments x WHERE x.package_id = p_package_id AND x.version = p.committed_version;
  v_title := decision.dsp_text(p_title, 4, 256, 'title', 'a change of conditions is named');
  v_statement := decision.dsp_text(p_statement, 16, 4000, 'statement', 'a change of conditions states what changed');
  IF p_evidence IS NULL OR jsonb_typeof(p_evidence) <> 'array' OR jsonb_array_length(p_evidence) NOT BETWEEN 1 AND 20 THEN
    RAISE EXCEPTION 'review rejected (evidence): a change of conditions names 1 to 20 recorded objects that evidence it [{kind, id, note?}]' USING ERRCODE = '22023';
  END IF;
  FOR e IN SELECT x FROM jsonb_array_elements(p_evidence) x LOOP
    IF jsonb_typeof(e) <> 'object' OR coalesce(e ->> 'kind', '') NOT IN ('warning', 'signal', 'indicator', 'forecast', 'scenario', 'run', 'claim', 'evidence')
       OR coalesce(e ->> 'id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' OR length(coalesce(e ->> 'note', '')) > 500 THEN
      RAISE EXCEPTION 'review rejected (evidence): each item is {kind warning|signal|indicator|forecast|scenario|run|claim|evidence, id, note? (≤ 500)}' USING ERRCODE = '22023';
    END IF;
    IF NOT decision.dsp_object_exists(p_tenant, p_domain, e ->> 'kind', (e ->> 'id')::uuid) THEN
      RAISE EXCEPTION 'review rejected (unknown_evidence): % % is not a recorded object of this domain', e ->> 'kind', e ->> 'id' USING ERRCODE = '23503';
    END IF;
    v_ev := v_ev || jsonb_build_object('kind', e ->> 'kind', 'id', lower(e ->> 'id'), 'note', nullif(btrim(coalesce(e ->> 'note', '')), ''));
  END LOOP;
  INSERT INTO decision.condition_changes (change_id, scope, tenant_id, domain_id, package_id, committed_version, commitment_id, title, statement, evidence, recorded_by, correlation_id)
  VALUES (p_change_id, 'DOMAIN', p_tenant, p_domain, p_package_id, p.committed_version, c.commitment_id, v_title, v_statement, v_ev, p_actor, p_correlation) RETURNING * INTO r;
  PERFORM decision.dsp_event(p_tenant, p_domain, p_package_id, NULL, 'condition_change.recorded', p_actor,
            jsonb_build_object('change_id', p_change_id, 'title', v_title, 'committed_version', p.committed_version, 'evidence', v_ev), p_correlation);
  RETURN to_jsonb(r) - 'scope' - 'tenant_id' - 'domain_id' - 'correlation_id';
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.record_condition_change(uuid, uuid, uuid, uuid, text, text, jsonb, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.record_condition_change(uuid, uuid, uuid, uuid, text, text, jsonb, uuid, uuid) TO eye_commit;

/* P1 RESOLVE A REVERSION REQUEST (decision.review.reversion): the scenario's owner (or a domain administrator) marks it REVERSIONED — only
   once the scenario's version moved past the one at the request (the re-versioning is the scenario route's) — or DECLINES it with a reason.
   The routed item closes. */
CREATE OR REPLACE FUNCTION decision.resolve_reversion_request(p_request_id uuid, p_tenant uuid, p_domain uuid, p_resolution text, p_note text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, prediction, executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r decision.scenario_reversion_requests%ROWTYPE; sc prediction.scenarios_current%ROWTYPE; v_note text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.review.reversion']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM decision.dsp_assert_person(p_actor, p_tenant, 'a reversion request''s resolution');
  SELECT * INTO r FROM decision.scenario_reversion_requests x WHERE x.request_id = p_request_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'review rejected (unknown_request): % is not a reversion request of this domain', p_request_id USING ERRCODE = '23503'; END IF;
  SELECT * INTO sc FROM prediction.scenarios_current s WHERE s.scenario_id = r.scenario_id;
  IF p_actor NOT IN (r.owner_principal_id, sc.owner_principal_id) AND NOT executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['domain_admin', 'platform_admin']) THEN
    RAISE EXCEPTION 'review rejected (ownership): the scenario''s owner resolves its reversion request' USING ERRCODE = '42501';
  END IF;
  IF r.state <> 'open' THEN RAISE EXCEPTION 'review rejected (state): reversion request % was % at %', p_request_id, r.state, decision.iso(r.resolved_at) USING ERRCODE = '22023'; END IF;
  IF p_resolution IS NULL OR p_resolution NOT IN ('reversioned', 'declined') THEN RAISE EXCEPTION 'review rejected (resolution): a reversion request is reversioned or declined' USING ERRCODE = '22023'; END IF;
  v_note := decision.dsp_text(p_note, CASE WHEN p_resolution = 'declined' THEN 16 ELSE 8 END, 2000, 'note', CASE WHEN p_resolution = 'declined' THEN 'a declined re-versioning says why' ELSE 'the resolution says what was re-versioned' END);
  IF p_resolution = 'reversioned' AND sc.current_version <= r.scenario_version_at_request THEN
    RAISE EXCEPTION 'review rejected (state): scenario % is still at version % (the version at the request); re-version it through the scenario route first', r.scenario_id, sc.current_version USING ERRCODE = '22023';
  END IF;
  UPDATE decision.scenario_reversion_requests SET state = p_resolution, resolved_by = p_actor, resolved_at = clock_timestamp(), resolution_note = v_note,
         resolved_version = CASE WHEN p_resolution = 'reversioned' THEN sc.current_version END
   WHERE request_id = p_request_id RETURNING * INTO r;
  PERFORM decision.dsp_close_item(r.item_id, p_tenant, p_domain, format('the reversion request was %s', p_resolution), jsonb_build_object('request_id', p_request_id), p_actor, p_correlation);
  PERFORM decision.dsp_event(p_tenant, p_domain, r.package_id, NULL, 'reversion.resolved', p_actor,
            jsonb_build_object('request_id', p_request_id, 'scenario_id', r.scenario_id, 'resolution', p_resolution, 'from_version', r.scenario_version_at_request, 'to_version', r.resolved_version), p_correlation);
  RETURN to_jsonb(r) - 'scope' - 'tenant_id' - 'domain_id' - 'correlation_id';
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.resolve_reversion_request(uuid, uuid, uuid, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.resolve_reversion_request(uuid, uuid, uuid, text, text, uuid, uuid) TO eye_commit;

/* P2 ASSESS THE OUTCOME (decision.review.outcome): a named person assesses a COMMITTED version's outcome in four separate fields —
     observed        {outcome_ids [1..20 of the version's recorded outcomes], statement}: the port snapshots each outcome (criterion, value, target, met);
     inferred        {statement, method attribution_rule|difference_in_differences|simulation_comparison|regression|expert_judgment, confidence 0..1,
                      magnitude?, unit?}: the contribution the decision is inferred to have made;
     counterfactual  {claim, basis {kind run, run_id} | {kind stated_model, model}}: what would have happened without it;
     changed_conditions [{condition, effect?, evidence? [{kind, id}]}] (0..20): what changed beside the decision.
   Never merged: the three statements are distinct and no changed condition repeats one (separation). A revision names the assessment it
   read (stale otherwise). Changed conditions route a decision.review_due to the package owner (the cause a reopen may name). */
CREATE OR REPLACE FUNCTION decision.assess_outcome(
  p_assessment_id uuid, p_tenant uuid, p_domain uuid, p_package_id uuid, p_version int, p_observed jsonb, p_inferred jsonb, p_counterfactual jsonb, p_changed jsonb,
  p_supersedes uuid, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, simulation, executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE p decision.packages_current%ROWTYPE; c decision.commitments%ROWTYPE; last decision.outcome_assessments%ROWTYPE; r decision.outcome_assessments%ROWTYPE;
        v_outcomes jsonb := '[]'::jsonb; oid text; o decision.outcomes%ROWTYPE; v_obs jsonb; v_inf jsonb; v_cf jsonb; v_changed jsonb := '[]'::jsonb; e jsonb; v_run record;
        v_conf numeric; v_n int; v_digest text; v_ev uuid; v_item uuid; v_texts text[];
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.review.outcome']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM decision.dsp_assert_person(p_actor, p_tenant, 'an outcome assessment');
  SELECT * INTO p FROM decision.packages_current x WHERE x.package_id = p_package_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'review rejected (unknown_package): % is not a decision package of this domain', p_package_id USING ERRCODE = '23503'; END IF;
  SELECT * INTO c FROM decision.commitments x WHERE x.package_id = p_package_id AND x.version = p_version;
  IF NOT FOUND THEN RAISE EXCEPTION 'review rejected (state): version % of package % was never committed; an outcome is assessed against a commitment', p_version, p_package_id USING ERRCODE = '22023'; END IF;
  -- the OBSERVED result: the recorded outcomes of this commitment (0045), snapshotted
  IF p_observed IS NULL OR jsonb_typeof(p_observed) <> 'object' OR jsonb_typeof(p_observed -> 'outcome_ids') IS DISTINCT FROM 'array' OR jsonb_array_length(p_observed -> 'outcome_ids') NOT BETWEEN 1 AND 20 THEN
    RAISE EXCEPTION 'review rejected (observed): the observed result names 1 to 20 recorded outcomes of the commitment {outcome_ids, statement}' USING ERRCODE = '22023';
  END IF;
  FOR oid IN SELECT DISTINCT x FROM jsonb_array_elements_text(p_observed -> 'outcome_ids') x LOOP
    IF oid !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RAISE EXCEPTION 'review rejected (observed): % is not an outcome id', oid USING ERRCODE = '22023'; END IF;
    SELECT * INTO o FROM decision.outcomes x WHERE x.outcome_id = oid::uuid AND x.package_id = p_package_id AND x.version = p_version;
    IF NOT FOUND THEN RAISE EXCEPTION 'review rejected (unknown_outcome): % is not a recorded outcome of version % of package %', oid, p_version, p_package_id USING ERRCODE = '23503'; END IF;
    v_outcomes := v_outcomes || jsonb_build_object('outcome_id', o.outcome_id, 'criterion_key', o.criterion_key, 'observed_value', o.observed_value, 'unit', o.unit, 'target', o.target,
                                                   'comparator', o.comparator, 'met', o.met, 'recorded_at', o.recorded_at);
  END LOOP;
  v_obs := jsonb_build_object('outcomes', v_outcomes, 'statement', decision.dsp_text(p_observed ->> 'statement', 16, 2000, 'observed', 'the observed result is stated'));
  -- the INFERRED contribution
  IF p_inferred IS NULL OR jsonb_typeof(p_inferred) <> 'object' OR coalesce(p_inferred ->> 'method', '') NOT IN ('attribution_rule', 'difference_in_differences', 'simulation_comparison', 'regression', 'expert_judgment')
     OR jsonb_typeof(p_inferred -> 'confidence') IS DISTINCT FROM 'number' OR (p_inferred ->> 'confidence')::numeric NOT BETWEEN 0 AND 1
     OR (p_inferred ? 'magnitude' AND jsonb_typeof(p_inferred -> 'magnitude') NOT IN ('number', 'null')) THEN
    RAISE EXCEPTION 'review rejected (inferred): the inferred contribution names its method (attribution_rule | difference_in_differences | simulation_comparison | regression | expert_judgment) and a confidence in [0, 1] {statement, method, confidence, magnitude?, unit?}' USING ERRCODE = '22023';
  END IF;
  v_conf := (p_inferred ->> 'confidence')::numeric;
  v_inf := jsonb_build_object('statement', decision.dsp_text(p_inferred ->> 'statement', 16, 2000, 'inferred', 'the inferred contribution is stated'), 'method', p_inferred ->> 'method', 'confidence', v_conf,
                              'magnitude', p_inferred -> 'magnitude', 'unit', nullif(btrim(coalesce(p_inferred ->> 'unit', '')), ''));
  -- the COUNTERFACTUAL claim and its basis
  IF p_counterfactual IS NULL OR jsonb_typeof(p_counterfactual) <> 'object' OR jsonb_typeof(p_counterfactual -> 'basis') IS DISTINCT FROM 'object'
     OR coalesce(p_counterfactual -> 'basis' ->> 'kind', '') NOT IN ('run', 'stated_model') THEN
    RAISE EXCEPTION 'review rejected (counterfactual): the counterfactual claim names its basis — {kind run, run_id} or {kind stated_model, model} {claim, basis}' USING ERRCODE = '22023';
  END IF;
  IF p_counterfactual -> 'basis' ->> 'kind' = 'run' THEN
    IF coalesce(p_counterfactual -> 'basis' ->> 'run_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'review rejected (counterfactual): a run basis names its run_id' USING ERRCODE = '22023';
    END IF;
    SELECT x.run_id, x.state, x.validity INTO v_run FROM simulation.runs_current x WHERE x.run_id = (p_counterfactual -> 'basis' ->> 'run_id')::uuid AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
    IF v_run.run_id IS NULL THEN RAISE EXCEPTION 'review rejected (unknown_run): % is not a run of this domain', p_counterfactual -> 'basis' ->> 'run_id' USING ERRCODE = '23503'; END IF;
    IF v_run.state <> 'completed' OR v_run.validity = 'invalidated' THEN
      RAISE EXCEPTION 'review rejected (counterfactual): run % is % (%); a counterfactual rests on a completed, valid run', v_run.run_id, v_run.state, coalesce(v_run.validity, 'valid') USING ERRCODE = '22023';
    END IF;
    v_cf := jsonb_build_object('claim', decision.dsp_text(p_counterfactual ->> 'claim', 16, 2000, 'counterfactual', 'the counterfactual claim is stated'),
                               'basis', jsonb_build_object('kind', 'run', 'run_id', v_run.run_id, 'state', v_run.state));
  ELSE
    v_cf := jsonb_build_object('claim', decision.dsp_text(p_counterfactual ->> 'claim', 16, 2000, 'counterfactual', 'the counterfactual claim is stated'),
                               'basis', jsonb_build_object('kind', 'stated_model', 'model', decision.dsp_text(p_counterfactual -> 'basis' ->> 'model', 16, 2000, 'counterfactual', 'a stated model says how the counterfactual was reasoned')));
  END IF;
  -- the CHANGED conditions
  IF p_changed IS NULL OR jsonb_typeof(p_changed) <> 'array' OR jsonb_array_length(p_changed) > 20 THEN
    RAISE EXCEPTION 'review rejected (changed_conditions): the changed conditions are a list (0 to 20) [{condition, effect?, evidence?}]' USING ERRCODE = '22023';
  END IF;
  FOR e IN SELECT x FROM jsonb_array_elements(p_changed) x LOOP
    IF jsonb_typeof(e) <> 'object' OR (e ? 'evidence' AND jsonb_typeof(e -> 'evidence') <> 'array') THEN
      RAISE EXCEPTION 'review rejected (changed_conditions): each changed condition is {condition, effect?, evidence? [{kind, id}]}' USING ERRCODE = '22023';
    END IF;
    v_changed := v_changed || jsonb_build_object('condition', decision.dsp_text(e ->> 'condition', 8, 500, 'changed_conditions', 'a changed condition is named'),
                                                 'effect', nullif(btrim(coalesce(e ->> 'effect', '')), ''), 'evidence', coalesce(e -> 'evidence', '[]'::jsonb));
  END LOOP;
  -- NEVER MERGED: the observed, inferred and counterfactual statements are three statements; no changed condition repeats one
  v_texts := ARRAY[lower(v_obs ->> 'statement'), lower(v_inf ->> 'statement'), lower(v_cf ->> 'claim')];
  IF v_texts[1] = v_texts[2] OR v_texts[1] = v_texts[3] OR v_texts[2] = v_texts[3]
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_changed) x WHERE lower(x ->> 'condition') = ANY (v_texts)) THEN
    RAISE EXCEPTION 'review rejected (separation): the observed result, the inferred contribution, the counterfactual claim and the changed conditions are separate statements; one repeats another' USING ERRCODE = '22023';
  END IF;
  -- the VERSION read
  SELECT * INTO last FROM decision.outcome_assessments x WHERE x.package_id = p_package_id AND x.version = p_version ORDER BY x.assessment_version DESC LIMIT 1 FOR UPDATE;
  IF (last.assessment_id IS NULL AND p_supersedes IS NOT NULL) OR (last.assessment_id IS NOT NULL AND p_supersedes IS DISTINCT FROM last.assessment_id) THEN
    RAISE EXCEPTION 'review rejected (stale): the newest assessment of version % is %; a revision names the assessment it read', p_version, coalesce(last.assessment_id::text, 'none') USING ERRCODE = '22023';
  END IF;
  v_n := coalesce(last.assessment_version, 0) + 1;
  v_digest := encode(sha256(convert_to(jsonb_build_object('package_id', p_package_id, 'version', p_version, 'assessment_version', v_n, 'observed', v_obs, 'inferred', v_inf,
                                                          'counterfactual', v_cf, 'changed_conditions', v_changed)::text, 'UTF8')), 'hex');
  v_ev := decision.dsp_event(p_tenant, p_domain, p_package_id, NULL, 'outcome.assessed', p_actor,
            jsonb_build_object('assessment_id', p_assessment_id, 'version', p_version, 'assessment_version', v_n, 'supersedes', p_supersedes, 'digest', v_digest,
                               'outcomes', jsonb_array_length(v_outcomes), 'method', v_inf ->> 'method', 'confidence', v_conf, 'changed_conditions', jsonb_array_length(v_changed)), p_correlation);
  IF jsonb_array_length(v_changed) > 0 THEN
    v_item := decision.dsp_notify(p_tenant, p_domain, 'decision.review_due', 'outcome_assessment', p_assessment_id,
                format('Changed conditions recorded on "%s": review whether the decision stands', p.title),
                jsonb_build_array(format('the outcome assessment (v%s) of version %s records %s changed condition(s): %s', v_n, p_version, jsonb_array_length(v_changed),
                                         (SELECT string_agg(x ->> 'condition', '; ') FROM jsonb_array_elements(v_changed) x)),
                                  'record the change of conditions on the package and reopen it when it no longer stands (conditions_changed)'),
                p.owner_principal_id, v_ev, 'OutcomeAssessed', jsonb_build_object('assessment_id', p_assessment_id, 'package_id', p_package_id, 'version', p_version), interval '7 days', p_actor, p_correlation);
  END IF;
  INSERT INTO decision.outcome_assessments (assessment_id, scope, tenant_id, domain_id, package_id, version, assessment_version, supersedes, observed, inferred, counterfactual, changed_conditions,
                                            digest, assessed_by, item_id, correlation_id)
  VALUES (p_assessment_id, 'DOMAIN', p_tenant, p_domain, p_package_id, p_version, v_n, p_supersedes, v_obs, v_inf, v_cf, v_changed, v_digest, p_actor, v_item, p_correlation) RETURNING * INTO r;
  RETURN to_jsonb(r) - 'scope' - 'tenant_id' - 'domain_id' - 'correlation_id';
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.assess_outcome(uuid, uuid, uuid, uuid, int, jsonb, jsonb, jsonb, jsonb, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.assess_outcome(uuid, uuid, uuid, uuid, int, jsonb, jsonb, jsonb, jsonb, uuid, uuid, uuid) TO eye_commit;

/* P3 SET THE REVIEW TERMS (decision.review.terms; R-24, V10-T-055): the package OWNER sets a version's baseline {kind run|outcome_criterion|stated,
   ref, statement}, replay horizon (days after the commitment) and evidence standard (decision_grade | reviewed | indicative, with a note);
   a revision names the terms version it read. A superseded or rejected version takes no terms. */
CREATE OR REPLACE FUNCTION decision.set_review_terms(
  p_terms_id uuid, p_tenant uuid, p_domain uuid, p_package_id uuid, p_version int, p_baseline jsonb, p_horizon_days int, p_standard text, p_note text, p_expected int, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, simulation, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE p decision.packages_current%ROWTYPE; v decision.package_versions%ROWTYPE; v_last int; v_base jsonb; v_run record; r decision.package_review_terms%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.review.terms']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM decision.dsp_assert_person(p_actor, p_tenant, 'a package''s review terms');
  SELECT * INTO p FROM decision.packages_current x WHERE x.package_id = p_package_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'review rejected (unknown_package): % is not a decision package of this domain', p_package_id USING ERRCODE = '23503'; END IF;
  IF p.owner_principal_id <> p_actor THEN RAISE EXCEPTION 'review rejected (ownership): the package owner sets its review terms' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v FROM decision.package_versions x WHERE x.package_id = p_package_id AND x.version = p_version;
  IF NOT FOUND THEN RAISE EXCEPTION 'review rejected (unknown_version): no version % of package %', p_version, p_package_id USING ERRCODE = '23503'; END IF;
  IF v.state IN ('superseded', 'rejected') THEN RAISE EXCEPTION 'review rejected (state): version % is %; review terms are set on a live version', p_version, v.state USING ERRCODE = '22023'; END IF;
  IF p_baseline IS NULL OR jsonb_typeof(p_baseline) <> 'object' OR coalesce(p_baseline ->> 'kind', '') NOT IN ('run', 'outcome_criterion', 'stated') THEN
    RAISE EXCEPTION 'review rejected (baseline): the baseline is {kind run | outcome_criterion | stated, ref, statement}' USING ERRCODE = '22023';
  END IF;
  IF p_baseline ->> 'kind' = 'run' THEN
    IF coalesce(p_baseline ->> 'ref', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RAISE EXCEPTION 'review rejected (baseline): a run baseline names the run (ref)' USING ERRCODE = '22023'; END IF;
    SELECT x.run_id, x.state INTO v_run FROM simulation.runs_current x WHERE x.run_id = (p_baseline ->> 'ref')::uuid AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
    IF v_run.run_id IS NULL THEN RAISE EXCEPTION 'review rejected (unknown_run): % is not a run of this domain', p_baseline ->> 'ref' USING ERRCODE = '23503'; END IF;
    IF v_run.state <> 'completed' THEN RAISE EXCEPTION 'review rejected (baseline): run % is %; a baseline run is completed', v_run.run_id, v_run.state USING ERRCODE = '22023'; END IF;
  ELSIF p_baseline ->> 'kind' = 'outcome_criterion' THEN
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(v.choice -> 'outcome_criteria', '[]'::jsonb)) k WHERE k ->> 'key' = p_baseline ->> 'ref') THEN
      RAISE EXCEPTION 'review rejected (baseline): % is not an outcome criterion of version %''s choice', coalesce(p_baseline ->> 'ref', 'nothing'), p_version USING ERRCODE = '22023';
    END IF;
  END IF;
  v_base := jsonb_build_object('kind', p_baseline ->> 'kind', 'ref', CASE WHEN p_baseline ->> 'kind' = 'stated' THEN NULL ELSE p_baseline ->> 'ref' END,
                               'statement', decision.dsp_text(p_baseline ->> 'statement', 8, 2000, 'baseline', 'the baseline is stated'));
  IF p_horizon_days IS NULL OR p_horizon_days NOT BETWEEN 1 AND 3650 THEN RAISE EXCEPTION 'review rejected (replay_horizon): the replay horizon is 1 to 3650 days after the commitment' USING ERRCODE = '22023'; END IF;
  IF p_standard IS NULL OR p_standard NOT IN ('decision_grade', 'reviewed', 'indicative') THEN
    RAISE EXCEPTION 'review rejected (evidence_standard): the evidence standard is decision_grade, reviewed or indicative' USING ERRCODE = '22023';
  END IF;
  PERFORM decision.dsp_text(p_note, 8, 2000, 'evidence_note', 'the evidence standard says what it requires');
  SELECT max(x.terms_version) INTO v_last FROM decision.package_review_terms x WHERE x.package_id = p_package_id AND x.version = p_version;
  IF v_last IS DISTINCT FROM p_expected THEN
    RAISE EXCEPTION 'review rejected (stale): the review terms of version % stand at %; a revision names the terms version it read', p_version, coalesce(v_last::text, 'none') USING ERRCODE = '22023';
  END IF;
  INSERT INTO decision.package_review_terms (terms_id, scope, tenant_id, domain_id, package_id, version, terms_version, baseline, replay_horizon_days, evidence_standard, evidence_note, set_by, correlation_id)
  VALUES (p_terms_id, 'DOMAIN', p_tenant, p_domain, p_package_id, p_version, coalesce(v_last, 0) + 1, v_base, p_horizon_days, p_standard, btrim(p_note), p_actor, p_correlation) RETURNING * INTO r;
  PERFORM decision.dsp_event(p_tenant, p_domain, p_package_id, NULL, 'terms.set', p_actor,
            jsonb_build_object('terms_id', p_terms_id, 'version', p_version, 'terms_version', r.terms_version, 'baseline_kind', v_base ->> 'kind', 'replay_horizon_days', p_horizon_days, 'evidence_standard', p_standard), p_correlation);
  RETURN to_jsonb(r) - 'scope' - 'tenant_id' - 'domain_id' - 'correlation_id';
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.set_review_terms(uuid, uuid, uuid, uuid, int, jsonb, int, text, text, int, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.set_review_terms(uuid, uuid, uuid, uuid, int, jsonb, int, text, text, int, uuid, uuid) TO eye_commit;

/* P4 THE REPLAY'S INITIATOR AND REASON (decision.replay — the replay route's own action, in the replay's transaction): the reader who ran
   the replay records why; the review terms read and whether the replay falls within their horizon (the commitment + N days). */
CREATE OR REPLACE FUNCTION decision.record_replay_request(p_replay_id uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE rp decision.replays%ROWTYPE; t decision.package_review_terms%ROWTYPE; c decision.commitments%ROWTYPE; v_reason text; v_within boolean; r decision.replay_requests%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.replay']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'review rejected (actor): a replay''s reason is recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO rp FROM decision.replays x WHERE x.replay_id = p_replay_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'review rejected (unknown_replay): % is not a replay of this domain', p_replay_id USING ERRCODE = '23503'; END IF;
  IF rp.reader_principal_id <> p_actor THEN RAISE EXCEPTION 'review rejected (actor): the replay''s initiator (its reader) states why it was run' USING ERRCODE = '42501'; END IF;
  IF EXISTS (SELECT 1 FROM decision.replay_requests x WHERE x.replay_id = p_replay_id) THEN
    RAISE EXCEPTION 'review rejected (duplicate): replay % already has its initiator and reason', p_replay_id USING ERRCODE = '22023';
  END IF;
  v_reason := decision.dsp_text(p_reason, 8, 2000, 'reason', 'a replay states why it is run');
  SELECT * INTO t FROM decision.package_review_terms x WHERE x.package_id = rp.package_id AND x.version = rp.version ORDER BY x.terms_version DESC LIMIT 1;
  SELECT * INTO c FROM decision.commitments x WHERE x.package_id = rp.package_id AND x.version = rp.version;
  v_within := CASE WHEN t.terms_id IS NULL OR c.commitment_id IS NULL THEN NULL ELSE rp.replayed_at <= c.committed_at + make_interval(days => t.replay_horizon_days) END;
  INSERT INTO decision.replay_requests (replay_id, scope, tenant_id, domain_id, package_id, version, initiator_principal_id, reason, terms_id, within_horizon, correlation_id)
  VALUES (p_replay_id, 'DOMAIN', p_tenant, p_domain, rp.package_id, rp.version, p_actor, v_reason, t.terms_id, v_within, p_correlation) RETURNING * INTO r;
  PERFORM decision.dsp_event(p_tenant, p_domain, rp.package_id, NULL, 'replay.requested', p_actor,
            jsonb_build_object('replay_id', p_replay_id, 'version', rp.version, 'terms_id', t.terms_id, 'within_horizon', v_within), p_correlation);
  RETURN to_jsonb(r) - 'scope' - 'tenant_id' - 'domain_id' - 'correlation_id';
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.record_replay_request(uuid, uuid, uuid, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.record_replay_request(uuid, uuid, uuid, text, uuid, uuid) TO eye_commit;

/* P5 LINK A HYPOTHESIS OR LESSON (decision.review.lesson; V00-T-040): a GOVERNED MEMORY object — recorded through the existing memory route
   (memory.item.record) after the assessment, ACTIVE, naming the package's decision (related_decision_id) — linked to the assessment by its
   recorder or the package owner. */
CREATE OR REPLACE FUNCTION decision.link_lesson(p_lesson_id uuid, p_tenant uuid, p_domain uuid, p_assessment_id uuid, p_kind text, p_memory_item_id uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, memory, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE a decision.outcome_assessments%ROWTYPE; p decision.packages_current%ROWTYPE; m memory.items_current%ROWTYPE; r decision.lessons%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.review.lesson']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM decision.dsp_assert_person(p_actor, p_tenant, 'a lesson''s link');
  SELECT * INTO a FROM decision.outcome_assessments x WHERE x.assessment_id = p_assessment_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'review rejected (unknown_assessment): % is not an outcome assessment of this domain', p_assessment_id USING ERRCODE = '23503'; END IF;
  SELECT * INTO p FROM decision.packages_current x WHERE x.package_id = a.package_id;
  IF p_kind IS NULL OR p_kind NOT IN ('hypothesis', 'lesson') THEN RAISE EXCEPTION 'review rejected (kind): a link is a hypothesis or a lesson' USING ERRCODE = '22023'; END IF;
  SELECT * INTO m FROM memory.items_current x WHERE x.item_id = p_memory_item_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'review rejected (unknown_memory_item): % is not a memory record of this domain', p_memory_item_id USING ERRCODE = '23503'; END IF;
  IF p_actor NOT IN (m.recorded_by, p.owner_principal_id) THEN RAISE EXCEPTION 'review rejected (ownership): a lesson is linked by its recorder or the package owner' USING ERRCODE = '42501'; END IF;
  IF m.state <> 'active' THEN RAISE EXCEPTION 'review rejected (state): memory record % is %; an active record is linked', p_memory_item_id, m.state USING ERRCODE = '22023'; END IF;
  IF m.related_decision_id IS DISTINCT FROM p.decision_object_id THEN
    RAISE EXCEPTION 'review rejected (memory_item): memory record % does not name the package''s decision (related.decisionId %)', p_memory_item_id, p.decision_object_id USING ERRCODE = '22023';
  END IF;
  IF m.recorded_at < a.assessed_at THEN
    RAISE EXCEPTION 'review rejected (memory_item): memory record % was recorded at %, before the assessment it would draw from (%)', p_memory_item_id, decision.iso(m.recorded_at), decision.iso(a.assessed_at) USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM decision.lessons x WHERE x.assessment_id = p_assessment_id AND x.memory_item_id = p_memory_item_id) THEN
    RAISE EXCEPTION 'review rejected (duplicate): memory record % is already linked to assessment %', p_memory_item_id, p_assessment_id USING ERRCODE = '22023';
  END IF;
  INSERT INTO decision.lessons (lesson_id, scope, tenant_id, domain_id, package_id, assessment_id, kind, memory_item_id, memory_version, title, linked_by, correlation_id)
  VALUES (p_lesson_id, 'DOMAIN', p_tenant, p_domain, a.package_id, p_assessment_id, p_kind, p_memory_item_id, m.object_version, m.title, p_actor, p_correlation) RETURNING * INTO r;
  PERFORM decision.dsp_event(p_tenant, p_domain, a.package_id, NULL, 'lesson.linked', p_actor,
            jsonb_build_object('lesson_id', p_lesson_id, 'assessment_id', p_assessment_id, 'kind', p_kind, 'memory_item_id', p_memory_item_id, 'memory_version', m.object_version), p_correlation);
  RETURN to_jsonb(r) - 'scope' - 'tenant_id' - 'domain_id' - 'correlation_id';
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.link_lesson(uuid, uuid, uuid, uuid, text, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.link_lesson(uuid, uuid, uuid, uuid, text, uuid, uuid, uuid) TO eye_commit;

/* P6 SET A SCENARIO SET'S REVIEW CADENCE (prediction.scenario.set.cadence; F-P4-08): the set's owner (or an administrator) — every N days
   from the anchor (the last review held, an instant not in the future; default now) or the last portfolio review, whichever is later;
   a revision names the cadence version it read. A retired set takes no cadence. */
CREATE OR REPLACE FUNCTION decision.set_review_cadence(p_cadence_id uuid, p_tenant uuid, p_domain uuid, p_set_id uuid, p_every_days int, p_anchor_at timestamptz, p_rationale text, p_expected int, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, prediction, executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE s prediction.scenario_sets%ROWTYPE; v_last int; v_anchor timestamptz; r decision.set_review_cadences%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.scenario.set.cadence']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM decision.dsp_assert_person(p_actor, p_tenant, 'a set''s review cadence');
  SELECT * INTO s FROM prediction.scenario_sets x WHERE x.set_id = p_set_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'review rejected (unknown_set): % is not a scenario set of this domain', p_set_id USING ERRCODE = '23503'; END IF;
  IF NOT prediction.pss_owner_or_admin(s.owner_principal_id, p_actor, p_tenant, p_domain) THEN
    RAISE EXCEPTION 'review rejected (ownership): a set''s review cadence is set by its owner or an administrator' USING ERRCODE = '42501';
  END IF;
  IF s.state = 'retired' THEN RAISE EXCEPTION 'review rejected (state): set % is retired; a retired set is not reviewed', p_set_id USING ERRCODE = '22023'; END IF;
  IF p_every_days IS NULL OR p_every_days NOT BETWEEN 1 AND 366 THEN RAISE EXCEPTION 'review rejected (every_days): a cadence is every 1 to 366 days' USING ERRCODE = '22023'; END IF;
  v_anchor := coalesce(p_anchor_at, clock_timestamp());
  IF v_anchor > clock_timestamp() OR v_anchor < clock_timestamp() - interval '3650 days' THEN
    RAISE EXCEPTION 'review rejected (anchor): the anchor is the last review held — an instant within the last ten years, never in the future' USING ERRCODE = '22023';
  END IF;
  PERFORM decision.dsp_text(p_rationale, 8, 2000, 'rationale', 'a cadence says why the set is reviewed this often');
  SELECT max(x.cadence_version) INTO v_last FROM decision.set_review_cadences x WHERE x.set_id = p_set_id;
  IF v_last IS DISTINCT FROM p_expected THEN
    RAISE EXCEPTION 'review rejected (stale): the cadence of set % stands at version %; a revision names the version it read', p_set_id, coalesce(v_last::text, 'none') USING ERRCODE = '22023';
  END IF;
  INSERT INTO decision.set_review_cadences (cadence_id, scope, tenant_id, domain_id, set_id, cadence_version, every_days, anchor_at, rationale, set_by, correlation_id)
  VALUES (p_cadence_id, 'DOMAIN', p_tenant, p_domain, p_set_id, coalesce(v_last, 0) + 1, p_every_days, v_anchor, btrim(p_rationale), p_actor, p_correlation) RETURNING * INTO r;
  PERFORM decision.dsp_event(p_tenant, p_domain, NULL, p_set_id, 'cadence.set', p_actor,
            jsonb_build_object('cadence_id', p_cadence_id, 'cadence_version', r.cadence_version, 'every_days', p_every_days, 'anchor_at', v_anchor), p_correlation);
  RETURN to_jsonb(r) - 'scope' - 'tenant_id' - 'domain_id' - 'correlation_id';
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.set_review_cadence(uuid, uuid, uuid, uuid, int, timestamptz, text, int, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.set_review_cadence(uuid, uuid, uuid, uuid, int, timestamptz, text, int, uuid, uuid) TO eye_commit;

/* The DUE instant of a set's review: the newest cadence, from the later of its anchor and the set's last portfolio review. */
CREATE OR REPLACE FUNCTION decision.set_review_due(p_set_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = decision, prediction, pg_catalog, pg_temp AS $$
  WITH cad AS (SELECT * FROM decision.set_review_cadences c WHERE c.set_id = p_set_id ORDER BY c.cadence_version DESC LIMIT 1),
       rev AS (SELECT r.review_id, r.reviewed_at FROM prediction.portfolio_reviews r WHERE r.set_id = p_set_id ORDER BY r.reviewed_at DESC, r.review_id DESC LIMIT 1)
  SELECT CASE WHEN cad.cadence_id IS NULL THEN NULL ELSE jsonb_build_object(
    'cadence_id', cad.cadence_id, 'cadence_version', cad.cadence_version, 'every_days', cad.every_days, 'anchor_at', cad.anchor_at,
    'last_review_id', (SELECT review_id FROM rev), 'last_review_at', (SELECT reviewed_at FROM rev),
    'due_at', greatest(cad.anchor_at, coalesce((SELECT reviewed_at FROM rev), cad.anchor_at)) + make_interval(days => cad.every_days),
    'overdue', greatest(cad.anchor_at, coalesce((SELECT reviewed_at FROM rev), cad.anchor_at)) + make_interval(days => cad.every_days) < clock_timestamp()) END
  FROM (SELECT 1) one LEFT JOIN cad ON true $$;
GRANT EXECUTE ON FUNCTION decision.set_review_due(uuid) TO eye_app, eye_commit;

/* P6 THE SWEEP (the tick step `review-cadence`, executive.attention.tick; or an operator's check under prediction.scenario.set.cadence):
   every ACTIVE set of the domain with a cadence — a miss recorded ONCE per due instant and routed to the set owner (decision.review_due,
   F-P4-09's task); every open miss MET by a portfolio review recorded after its due instant (the item closed). */
CREATE OR REPLACE FUNCTION decision.sweep_review_cadences(p_tenant uuid, p_domain uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, prediction, executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE s record; d jsonb; m record; rv record; v_miss uuid; v_ev uuid; v_item uuid; v_missed int := 0; v_met int := 0; v_checked int := 0;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.attention.tick', 'prediction.scenario.set.cadence']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  -- the open misses a later review met
  FOR m IN SELECT x.* FROM decision.set_review_misses x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.met_at IS NULL ORDER BY x.detected_at FOR UPDATE LOOP
    SELECT r.review_id, r.reviewed_at, r.reviewer INTO rv FROM prediction.portfolio_reviews r WHERE r.set_id = m.set_id AND r.reviewed_at >= m.due_at ORDER BY r.reviewed_at, r.review_id LIMIT 1;
    CONTINUE WHEN rv.review_id IS NULL;
    UPDATE decision.set_review_misses SET met_at = rv.reviewed_at, met_by_review_id = rv.review_id WHERE miss_id = m.miss_id;
    PERFORM decision.dsp_close_item(m.item_id, p_tenant, p_domain, 'the set was reviewed', jsonb_build_object('review_id', rv.review_id, 'miss_id', m.miss_id), p_actor, p_correlation);
    PERFORM decision.dsp_event(p_tenant, p_domain, NULL, m.set_id, 'cadence.met', p_actor, jsonb_build_object('miss_id', m.miss_id, 'due_at', m.due_at, 'review_id', rv.review_id, 'reviewed_at', rv.reviewed_at, 'reviewer', rv.reviewer), p_correlation);
    v_met := v_met + 1;
  END LOOP;
  -- the reviews now due and not held
  FOR s IN SELECT x.set_id, x.title, x.owner_principal_id FROM prediction.scenario_sets x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.state = 'active'
             AND EXISTS (SELECT 1 FROM decision.set_review_cadences c WHERE c.set_id = x.set_id) ORDER BY x.set_id LOOP
    v_checked := v_checked + 1;
    d := decision.set_review_due(s.set_id);
    CONTINUE WHEN NOT (d ->> 'overdue')::boolean;
    CONTINUE WHEN EXISTS (SELECT 1 FROM decision.set_review_misses x WHERE x.set_id = s.set_id AND x.due_at = (d ->> 'due_at')::timestamptz);
    v_miss := gen_random_uuid();
    v_ev := decision.dsp_event(p_tenant, p_domain, NULL, s.set_id, 'cadence.missed', p_actor,
              jsonb_build_object('miss_id', v_miss, 'due_at', d -> 'due_at', 'every_days', d -> 'every_days', 'last_review_at', d -> 'last_review_at', 'owner', s.owner_principal_id), p_correlation);
    v_item := decision.dsp_notify(p_tenant, p_domain, 'decision.review_due', 'scenario_set', s.set_id,
              format('Scenario set review due: %s', s.title),
              jsonb_build_array(format('the set is reviewed every %s day(s); its review fell due at %s', d ->> 'every_days', d ->> 'due_at'),
                                CASE WHEN d ->> 'last_review_at' IS NULL THEN 'no portfolio review is recorded since the cadence''s anchor' ELSE format('the last portfolio review was at %s', d ->> 'last_review_at') END,
                                'record a portfolio review of the set (its relevance, consequences and payoffs)'),
              s.owner_principal_id, v_ev, 'ScenarioSetReviewMissed', jsonb_build_object('set_id', s.set_id, 'miss_id', v_miss, 'due_at', d -> 'due_at'), interval '72 hours', p_actor, p_correlation);
    INSERT INTO decision.set_review_misses (miss_id, scope, tenant_id, domain_id, set_id, cadence_id, due_at, owner_principal_id, item_id, correlation_id)
    VALUES (v_miss, 'DOMAIN', p_tenant, p_domain, s.set_id, (d ->> 'cadence_id')::uuid, (d ->> 'due_at')::timestamptz, s.owner_principal_id, v_item, p_correlation);
    v_missed := v_missed + 1;
  END LOOP;
  RETURN jsonb_build_object('checked', v_checked, 'missed', v_missed, 'met', v_met);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.sweep_review_cadences(uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.sweep_review_cadences(uuid, uuid, uuid, uuid) TO eye_commit;

/* The scenarios a LIVE package cites (its current and its committed version) that are NOT members of an active set — B27's living portfolio
   scores the members; these are the decision-relevant scenarios outside it (F-P4-08). */
CREATE OR REPLACE FUNCTION decision.cited_scenarios_outside_sets(p_tenant uuid, p_domain uuid) RETURNS TABLE (scenario_id uuid, cited_by jsonb)
LANGUAGE sql STABLE SET search_path = decision, prediction, pg_catalog, pg_temp AS $$
  WITH cited AS (
    SELECT DISTINCT so.scenario_id, p.package_id
      FROM decision.packages_current p
      CROSS JOIN LATERAL (SELECT DISTINCT v FROM unnest(ARRAY[p.current_version, p.committed_version]) v WHERE v IS NOT NULL) vv
      CROSS JOIN LATERAL decision.dsp_scenarios_of(p.package_id, vv.v) so
     WHERE p.tenant_id = p_tenant AND p.domain_id = p_domain AND p.state NOT IN ('withdrawn', 'closed'))
  SELECT c.scenario_id, jsonb_agg(c.package_id ORDER BY c.package_id) FROM cited c
    JOIN prediction.scenarios_current sc ON sc.scenario_id = c.scenario_id AND sc.state = 'active'
   WHERE NOT EXISTS (SELECT 1 FROM prediction.scenario_set_members m JOIN prediction.scenario_sets s ON s.set_id = m.set_id AND s.state = 'active'
                      WHERE m.scenario_id = c.scenario_id AND m.removed_at IS NULL)
   GROUP BY c.scenario_id ORDER BY c.scenario_id $$;
REVOKE ALL ON FUNCTION decision.cited_scenarios_outside_sets(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.cited_scenarios_outside_sets(uuid, uuid) TO eye_app, eye_commit;

/* P6 SCORE THE CITED SCENARIOS OUTSIDE AN ACTIVE SET (the tick step `cited-scenario-relevance`, executive.attention.tick; or an operator's act
   under prediction.scenario.relevance.score): B27's rule v1 (prediction.scenario_relevance_of, not re-declared) with the basis marked
   outside_active_set and the packages citing it; a prediction.scenario_relevance row and the scenario's `scenario.relevance_scored` only when
   the score or its basis changed. B27's score_scenario_relevance (members of active sets) is untouched. */
CREATE OR REPLACE FUNCTION decision.score_cited_scenario_relevance(p_tenant uuid, p_domain uuid, p_trigger text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, prediction, executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE x record; v jsonb; v_basis jsonb; last prediction.scenario_relevance%ROWTYPE; v_scored int := 0; v_changed int := 0; v_out jsonb := '[]'::jsonb; v_ch boolean;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.attention.tick', 'prediction.scenario.relevance.score']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_trigger IS NULL OR p_trigger NOT IN ('tick', 'operator') THEN RAISE EXCEPTION 'review rejected (trigger): relevance is scored by the tick or an operator' USING ERRCODE = '22023'; END IF;
  FOR x IN SELECT * FROM decision.cited_scenarios_outside_sets(p_tenant, p_domain) LOOP
    v := prediction.scenario_relevance_of(x.scenario_id);
    v_basis := (v -> 'basis') || jsonb_build_object('outside_active_set', true, 'cited_by', x.cited_by, 'scope', 'B35: a decision-relevant scenario cited by a live package, outside every active set');
    v_scored := v_scored + 1;
    SELECT * INTO last FROM prediction.scenario_relevance r WHERE r.scenario_id = x.scenario_id ORDER BY r.scored_at DESC, r.relevance_id DESC LIMIT 1;
    v_ch := last.relevance_id IS NULL OR last.score <> (v ->> 'score')::numeric OR (last.basis - 'next_review_due_at') IS DISTINCT FROM (v_basis - 'next_review_due_at');
    IF v_ch THEN
      INSERT INTO prediction.scenario_relevance (relevance_id, scope, tenant_id, domain_id, scenario_id, score, basis, trigger, scored_by, correlation_id)
      VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, x.scenario_id, (v ->> 'score')::numeric, v_basis, p_trigger, p_actor, p_correlation);
      INSERT INTO prediction.scenario_events (event_id, scope, tenant_id, domain_id, scenario_id, event, actor_principal_id, details, correlation_id)
      VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, x.scenario_id, 'scenario.relevance_scored', p_actor,
              jsonb_build_object('score', (v ->> 'score')::numeric, 'prior', last.score, 'trigger', p_trigger, 'outside_active_set', true, 'cited_by', x.cited_by), p_correlation);
      v_changed := v_changed + 1;
    END IF;
    v_out := v_out || jsonb_build_object('scenario_id', x.scenario_id, 'score', (v ->> 'score')::numeric, 'changed', v_ch, 'cited_by', x.cited_by);
  END LOOP;
  RETURN jsonb_build_object('scored', v_scored, 'changed', v_changed, 'scenarios', v_out);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.score_cited_scenario_relevance(uuid, uuid, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.score_cited_scenario_relevance(uuid, uuid, text, uuid, uuid) TO eye_commit;

-- ─────────────────────────────────────────────────────────────────────
-- §P5 THE READS (invoker reads under the caller's RLS)
-- ─────────────────────────────────────────────────────────────────────
/* The standing of each citation of a version's options: a run invalidated / challenged / not completed, a canonical object whose newest
   version is disputed or withdrawn — the DISPUTED evidence the completeness read surfaces. */
CREATE OR REPLACE FUNCTION decision.dsp_citation_states(p_package_id uuid, p_version int) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = decision, simulation, objects, pg_catalog, pg_temp AS $$
  WITH cites AS (
    SELECT o.key AS option_key, c ->> 'kind' AS kind, (c ->> 'id')::uuid AS id, (c ->> 'version')::bigint AS version
      FROM decision.options o CROSS JOIN LATERAL jsonb_array_elements(o.consequences) c
     WHERE o.package_id = p_package_id AND o.version = p_version AND coalesce(c ->> 'id', '') ~* '^[0-9a-f-]{36}$'),
  judged AS (
    SELECT ci.option_key, ci.kind, ci.id, ci.version,
           CASE WHEN ci.kind = 'run' THEN
                  (SELECT CASE WHEN r.run_id IS NULL THEN 'missing' WHEN r.validity = 'invalidated' THEN 'withdrawn' WHEN r.challenge_id IS NOT NULL THEN 'disputed'
                               WHEN r.state <> 'completed' THEN 'disputed' ELSE 'standing' END
                     FROM (SELECT 1) one LEFT JOIN simulation.runs_current r ON r.run_id = ci.id)
                ELSE
                  (SELECT CASE WHEN co.object_id IS NULL THEN 'missing' WHEN co.lifecycle_state = 'disputed' THEN 'disputed'
                               WHEN co.lifecycle_state IN ('withdrawn', 'deleted') THEN 'withdrawn' ELSE 'standing' END
                     FROM (SELECT 1) one LEFT JOIN LATERAL (SELECT x.object_id, x.lifecycle_state FROM objects.canonical_objects x WHERE x.object_id = ci.id ORDER BY x.object_version DESC LIMIT 1) co ON true)
           END AS standing
      FROM cites ci)
  SELECT coalesce(jsonb_agg(jsonb_build_object('option_key', option_key, 'kind', kind, 'id', id, 'version', version, 'standing', standing) ORDER BY option_key, kind, id), '[]'::jsonb) FROM judged $$;
GRANT EXECUTE ON FUNCTION decision.dsp_citation_states(uuid, int) TO eye_app, eye_commit;

/* THE DECISION METRICS (ES-39-008): completeness (the propose gate's criteria and the review fields, the missing information named, the
   disputed or withdrawn evidence surfaced, the post-commitment notes, challenges and appeals open), evidence coverage (against the review
   terms' standard), time-to-decision, reversibility, outcome linkage. NULL: no such package visible. */
CREATE OR REPLACE FUNCTION decision.decision_metrics(p_package_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = decision, simulation, objects, pg_catalog, pg_temp AS $$
DECLARE p decision.packages_current%ROWTYPE; v decision.package_versions%ROWTYPE; cv decision.package_versions%ROWTYPE; t decision.package_review_terms%ROWTYPE;
        v_opts int; v_sq int; v_crit jsonb; v_cites jsonb; v_total int; v_standing int; v_disputed jsonb; v_missing jsonb; v_first_prop timestamptz; v_first_commit timestamptz; v_last_commit timestamptz;
        v_criteria int; v_outcomes int; v_assess int; v_lessons int; v_decision_grade int; v_runs int; v_appeals int := 0; v_notes jsonb; v_chall jsonb; v_met int; v_with_ev int; v_sim int;
BEGIN
  SELECT * INTO p FROM decision.packages_current x WHERE x.package_id = p_package_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO v FROM decision.package_versions x WHERE x.package_id = p_package_id AND x.version = p.current_version;
  SELECT * INTO cv FROM decision.package_versions x WHERE x.package_id = p_package_id AND x.version = p.committed_version;
  SELECT * INTO t FROM decision.package_review_terms x WHERE x.package_id = p_package_id AND x.version = v.version ORDER BY x.terms_version DESC LIMIT 1;
  SELECT count(*), count(*) FILTER (WHERE o.kind = 'status_quo'), count(*) FILTER (WHERE o.simulated),
         count(*) FILTER (WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(o.consequences) c WHERE c ->> 'kind' IN ('evidence', 'claim')))
    INTO v_opts, v_sq, v_sim, v_with_ev FROM decision.options o WHERE o.package_id = p_package_id AND o.version = v.version;
  v_crit := jsonb_build_array(
    jsonb_build_object('key', 'options', 'met', v_opts >= 2, 'detail', format('%s option(s); a decision compares at least two', v_opts)),
    jsonb_build_object('key', 'status_quo', 'met', v_sq = 1, 'detail', format('%s explicit status quo option(s); exactly one', v_sq)),
    jsonb_build_object('key', 'objectives', 'met', jsonb_array_length(coalesce(v.objectives, '[]'::jsonb)) > 0, 'detail', 'the objectives the decision serves'),
    jsonb_build_object('key', 'choice', 'met', v.choice IS NOT NULL, 'detail', 'the choice proposed'),
    jsonb_build_object('key', 'outcome_criteria', 'met', jsonb_array_length(coalesce(v.choice -> 'outcome_criteria', '[]'::jsonb)) > 0, 'detail', 'the outcome criteria of the choice'),
    jsonb_build_object('key', 'monitoring_conditions', 'met', jsonb_array_length(coalesce(v.monitoring_conditions, '[]'::jsonb)) > 0, 'detail', 'the conditions monitored after the commitment'),
    jsonb_build_object('key', 'approver_policy', 'met', v.approver_policy IS NOT NULL AND v.approver_policy <> '{}'::jsonb, 'detail', 'who approves'),
    jsonb_build_object('key', 'reversibility', 'met', coalesce(btrim(v.reversibility), '') <> '', 'detail', 'how reversible the decision is'),
    jsonb_build_object('key', 'information_value', 'met', coalesce(btrim(v.information_value), '') <> '', 'detail', 'the value of waiting for information'),
    jsonb_build_object('key', 'review_terms', 'met', t.terms_id IS NOT NULL, 'detail', 'the baseline, replay horizon and evidence standard (R-24)'),
    jsonb_build_object('key', 'missing_information', 'met', jsonb_array_length(coalesce(v.missing_information, '[]'::jsonb)) = 0, 'detail', format('%s item(s) of missing information named', jsonb_array_length(coalesce(v.missing_information, '[]'::jsonb)))));
  SELECT count(*) FILTER (WHERE (x ->> 'met')::boolean) INTO v_met FROM jsonb_array_elements(v_crit) x;
  v_cites := decision.dsp_citation_states(p_package_id, v.version);
  v_total := jsonb_array_length(v_cites);
  SELECT count(*) FILTER (WHERE x ->> 'standing' = 'standing'), coalesce(jsonb_agg(x) FILTER (WHERE x ->> 'standing' <> 'standing'), '[]'::jsonb) INTO v_standing, v_disputed FROM jsonb_array_elements(v_cites) x;
  v_missing := coalesce(v.missing_information, '[]'::jsonb) || coalesce((SELECT jsonb_agg(jsonb_build_object('what', x ->> 'key', 'detail', x ->> 'detail', 'kind', 'criterion')) FROM jsonb_array_elements(v_crit) x WHERE NOT (x ->> 'met')::boolean), '[]'::jsonb);
  SELECT coalesce(jsonb_agg(jsonb_build_object('note_id', e.event_id, 'event', e.event, 'at', e.occurred_at, 'change_kind', e.details ->> 'change_kind') ORDER BY e.occurred_at), '[]'::jsonb) INTO v_notes
    FROM decision.package_events e JOIN decision.commitments c ON c.package_id = e.package_id AND c.version = p.committed_version
   WHERE e.package_id = p_package_id AND e.event IN ('input.invalidated', 'condition.breached', 'policy.changed') AND e.occurred_at > c.committed_at;
  SELECT coalesce(jsonb_agg(jsonb_build_object('challenge_id', x.challenge_id, 'version', x.version, 'resolution', x.resolution, 'effect', x.effect ->> 'kind') ORDER BY x.raised_at), '[]'::jsonb) INTO v_chall
    FROM decision.challenges x WHERE x.package_id = p_package_id AND (x.resolved_at IS NULL OR x.effect ->> 'kind' = 'reopen_required');
  IF to_regclass('decision.appeal_cases') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM decision.appeal_cases a WHERE a.package_id = $1 AND a.state IN (''opened'', ''under_review'')' INTO v_appeals USING p_package_id;
  END IF;
  SELECT min(x.proposed_at) INTO v_first_prop FROM decision.package_versions x WHERE x.package_id = p_package_id;
  SELECT min(c.committed_at), max(c.committed_at) INTO v_first_commit, v_last_commit FROM decision.commitments c WHERE c.package_id = p_package_id;
  v_criteria := jsonb_array_length(coalesce(cv.choice -> 'outcome_criteria', '[]'::jsonb));
  SELECT count(*) INTO v_outcomes FROM decision.outcomes o WHERE o.package_id = p_package_id AND o.version = p.committed_version;
  SELECT count(*) INTO v_assess FROM decision.outcome_assessments a WHERE a.package_id = p_package_id;
  SELECT count(*) INTO v_lessons FROM decision.lessons l WHERE l.package_id = p_package_id;
  SELECT count(*), count(*) FILTER (WHERE (simulation.run_decision_use(x.id) ->> 'use') = 'decision') INTO v_runs, v_decision_grade
    FROM (SELECT DISTINCT (c ->> 'id')::uuid AS id FROM jsonb_array_elements(v_cites) c WHERE c ->> 'kind' = 'run' AND c ->> 'standing' <> 'missing') x;
  RETURN jsonb_build_object(
    'package_id', p.package_id, 'title', p.title, 'state', p.state, 'version', v.version, 'committed_version', p.committed_version, 'as_of', clock_timestamp(),
    'completeness', jsonb_build_object('score', round(v_met::numeric / jsonb_array_length(v_crit), 3), 'met', v_met, 'of', jsonb_array_length(v_crit), 'criteria', v_crit,
                                       'missing', v_missing, 'disputed', v_disputed, 'post_commitment_notes', v_notes, 'challenges', v_chall, 'appeals_open', v_appeals),
    'evidence_coverage', jsonb_build_object('options', v_opts, 'simulated', v_sim, 'with_evidence', v_with_ev, 'citations', v_total, 'standing', v_standing,
                                            'share', CASE WHEN v_total = 0 THEN NULL ELSE round(v_standing::numeric / v_total, 3) END,
                                            'runs', v_runs, 'decision_grade_runs', v_decision_grade, 'standard', t.evidence_standard,
                                            'meets_standard', CASE WHEN t.terms_id IS NULL THEN NULL WHEN t.evidence_standard = 'decision_grade' THEN v_runs > 0 AND v_decision_grade = v_runs AND jsonb_array_length(v_disputed) = 0
                                                                   WHEN t.evidence_standard = 'reviewed' THEN jsonb_array_length(v_disputed) = 0 ELSE v_total > 0 END),
    'time_to_decision', jsonb_build_object('declared_at', p.declared_at, 'first_proposed_at', v_first_prop, 'first_committed_at', v_first_commit, 'last_committed_at', v_last_commit,
                                           'hours', CASE WHEN v_first_commit IS NULL THEN NULL ELSE round(extract(epoch FROM v_first_commit - p.declared_at)::numeric / 3600, 2) END,
                                           'open_hours', CASE WHEN v_first_commit IS NULL THEN round(extract(epoch FROM clock_timestamp() - p.declared_at)::numeric / 3600, 2) END,
                                           'reopens', p.reopens),
    'reversibility', jsonb_build_object('stated', nullif(btrim(coalesce(cv.reversibility, v.reversibility, '')), ''),
                                        'options_stating', (SELECT count(*) FROM decision.options o WHERE o.package_id = p_package_id AND o.version = v.version AND coalesce(btrim(o.reversibility), '') <> ''),
                                        'reopens', p.reopens, 'reopened_from_version', p.reopened_from_version, 'last_cause', p.reopen_cause ->> 'kind'),
    'outcome_linkage', jsonb_build_object('criteria', v_criteria, 'outcomes_recorded', v_outcomes, 'share', CASE WHEN v_criteria = 0 THEN NULL ELSE round(least(v_outcomes, v_criteria)::numeric / v_criteria, 3) END,
                                          'assessments', v_assess, 'lessons', v_lessons, 'linked', v_outcomes > 0 AND v_assess > 0),
    'review_terms', CASE WHEN t.terms_id IS NULL THEN NULL ELSE to_jsonb(t) - 'scope' - 'tenant_id' - 'domain_id' - 'correlation_id' END);
END $$;
GRANT EXECUTE ON FUNCTION decision.decision_metrics(uuid) TO eye_app, eye_commit;

/* THE REVIEW of a package: the changes recorded, the reversion requests, the outcome assessments, the review terms, the replays with their
   initiator and reason, the lessons, this part's ledger. NULL: no such package visible. */
CREATE OR REPLACE FUNCTION decision.review_read(p_package_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = decision, pg_catalog, pg_temp AS $$
  SELECT CASE WHEN p.package_id IS NULL THEN NULL ELSE jsonb_build_object(
    'package_id', p.package_id, 'title', p.title, 'state', p.state, 'owner', p.owner_principal_id, 'current_version', p.current_version, 'committed_version', p.committed_version,
    'reopens', p.reopens, 'reopen_cause', p.reopen_cause,
    'condition_changes', (SELECT coalesce(jsonb_agg(to_jsonb(x) - 'scope' - 'tenant_id' - 'domain_id' - 'correlation_id' ORDER BY x.recorded_at), '[]'::jsonb) FROM decision.condition_changes x WHERE x.package_id = p.package_id),
    'reversion_requests', (SELECT coalesce(jsonb_agg((to_jsonb(x) - 'scope' - 'tenant_id' - 'domain_id' - 'correlation_id') || jsonb_build_object('scenario_title', s.title, 'scenario_version_now', s.current_version) ORDER BY x.requested_at), '[]'::jsonb)
                             FROM decision.scenario_reversion_requests x LEFT JOIN prediction.scenarios_current s ON s.scenario_id = x.scenario_id WHERE x.package_id = p.package_id),
    'outcome_assessments', (SELECT coalesce(jsonb_agg(to_jsonb(x) - 'scope' - 'tenant_id' - 'domain_id' - 'correlation_id' ORDER BY x.version, x.assessment_version), '[]'::jsonb) FROM decision.outcome_assessments x WHERE x.package_id = p.package_id),
    'review_terms', (SELECT coalesce(jsonb_agg(to_jsonb(x) - 'scope' - 'tenant_id' - 'domain_id' - 'correlation_id' ORDER BY x.version, x.terms_version), '[]'::jsonb) FROM decision.package_review_terms x WHERE x.package_id = p.package_id),
    'replays', (SELECT coalesce(jsonb_agg(jsonb_build_object('replay_id', r.replay_id, 'version', r.version, 'reader', r.reader_principal_id, 'replayed_at', r.replayed_at, 'content_digest', r.content_digest,
                                                             'initiator', q.initiator_principal_id, 'reason', q.reason, 'within_horizon', q.within_horizon, 'terms_id', q.terms_id) ORDER BY r.replayed_at), '[]'::jsonb)
                  FROM decision.replays r LEFT JOIN decision.replay_requests q ON q.replay_id = r.replay_id WHERE r.package_id = p.package_id),
    'lessons', (SELECT coalesce(jsonb_agg(to_jsonb(x) - 'scope' - 'tenant_id' - 'domain_id' - 'correlation_id' ORDER BY x.linked_at), '[]'::jsonb) FROM decision.lessons x WHERE x.package_id = p.package_id),
    'events', (SELECT coalesce(jsonb_agg(jsonb_build_object('event', e.event, 'at', e.occurred_at, 'actor', e.actor_principal_id, 'details', e.details) ORDER BY e.occurred_at, e.event_id), '[]'::jsonb)
                 FROM decision.review_events e WHERE e.package_id = p.package_id)) END
  FROM (SELECT 1) one LEFT JOIN decision.packages_current p ON p.package_id = p_package_id $$;
GRANT EXECUTE ON FUNCTION decision.review_read(uuid) TO eye_app, eye_commit;

/* A SCENARIO SET's review status: the cadence history, the due instant, the misses (met or open). NULL: no such set visible. */
CREATE OR REPLACE FUNCTION decision.set_review_status(p_set_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = decision, prediction, pg_catalog, pg_temp AS $$
  SELECT CASE WHEN s.set_id IS NULL THEN NULL ELSE jsonb_build_object(
    'set_id', s.set_id, 'title', s.title, 'state', s.state, 'owner', s.owner_principal_id, 'due', decision.set_review_due(s.set_id),
    'cadences', (SELECT coalesce(jsonb_agg(to_jsonb(x) - 'scope' - 'tenant_id' - 'domain_id' - 'correlation_id' ORDER BY x.cadence_version), '[]'::jsonb) FROM decision.set_review_cadences x WHERE x.set_id = s.set_id),
    'misses', (SELECT coalesce(jsonb_agg(to_jsonb(x) - 'scope' - 'tenant_id' - 'domain_id' - 'correlation_id' ORDER BY x.due_at), '[]'::jsonb) FROM decision.set_review_misses x WHERE x.set_id = s.set_id)) END
  FROM (SELECT 1) one LEFT JOIN prediction.scenario_sets s ON s.set_id = p_set_id $$;
GRANT EXECUTE ON FUNCTION decision.set_review_status(uuid) TO eye_app, eye_commit;

-- ─────────────────────────────────────────────────────────────────────
-- §P6 RLS AND GRANTS (the 0081 loop idiom; the decision tables' isolation policy text; the ports write)
-- ─────────────────────────────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['condition_changes', 'scenario_reversion_requests', 'outcome_assessments', 'package_review_terms', 'replay_requests', 'lessons',
                           'set_review_cadences', 'set_review_misses', 'review_events'] LOOP
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

-- ═════════════════════════════════════════════════════════════════════
-- section `recommendation` (§R) — CP-6 B35 part R (2026-10-01): F-P6-02 completed (the recommendation as a distinct explained object; its
-- review comparing AI and human recommendations; accept for consideration (OBJ-33); the human-led incomplete-package mode (FEX-15); the
-- rationale view (WS-15, HX-08)), F-P4-09's B35 piece (the scenario QUALITY failure consulted by the recommendation), F-P5-06's B35 piece
-- (the stability and constraint indicators read by simulation.run_decision_use and by the recommendation — ES-38-008) and the decision
-- COVERAGE measure (ES-37-008).
--
--   §R1  THE RECOMMENDATION (decision.recommendations): on a package version's option — what, for whom, by when; the assumptions, what could
--        make it wrong (required, non-empty), the missing evidence; FOUR SEPARATED COMPONENTS — value judgments, policy constraints,
--        analytical assumptions, model outputs — each item with its source; the author's kind (human | agent: the Decision Agent drafts);
--        proposed → accepted_for_consideration | declined | withdrawn | superseded; a digest of the content. Its own ledger
--        (decision.recommendation_events) — decision.package_events is NOT written (the pinned vocabularies stand).
--   §R2  THE REVIEW (decision.recommendation_reviews): a named human who is not the author — accept for consideration, decline, request
--        changes — with the COMPARISON read at review (every other recommendation on the package, AI and human, side by side, each with what
--        could make it wrong). The Decision Agent records; it never reviews (the PDP and the port).
--   §R3  THE HUMAN-LED INCOMPLETE-PACKAGE MODE (decision.incomplete_package_attestations; FEX-15): the version's completeness read
--        (decision.recommendation_completeness: declared missing information, the recommendations' missing evidence, interventions resting on
--        no run, fewer than two alternatives beside the status quo; §E's explanation of the version read through to_regclass as an
--        advisory, shown and not blocking); the owner
--        attests the named gaps with a reason, a second human acknowledges; the version's live recommendations are set aside (human-led
--        analysis WITHOUT recommendation) and the proposal goes ahead labelled human-led. The proposal gate is the service's (package.service
--        propose, its B35 block): a version CARRYING live recommendations that is incomplete is refused unless an acknowledged attestation
--        covers its gaps; a version without recommendations meets every existing refusal unchanged and nothing new.
--   §R4  F-P4-09: the option's runs on a scenario FAILING its quality evaluation → the recommendation FLAGGED; acceptance needs the
--        reviewer's stated override (recommendation rejected (quality_flagged) without it).
--   §R5  F-P5-06 / ES-38-008: simulation.run_decision_use RE-DECLARED (0099 §V1 whole; the change marked) — a run whose experiment's LAST
--        CHECKPOINT reads numerical stability UNSTABLE, or whose COMPLETION constraint check is VIOLATED or INDETERMINATE, is DIAGNOSTIC with
--        the reason; the recommendation reads the option's runs through it (an indicator flag, like the quality flag).
--   §R6  ES-37-008: the DECISION COVERAGE of a recommendation — the share of the bound sets' live branches (else the live branches of the
--        scenarios the version's runs rest on) the recommended option was assessed on (a cited run on the branch, or a payoff in the set's
--        latest portfolio review).
--   Read: decision.package_recommendations(pkg) — the side-by-side view (AI and human, each with what could make it wrong, flags, coverage,
--   reviews) with the current version's completeness and attestations.
-- Refusal families (CLASS form): `recommendation rejected (<class>)` — actor | authority | separation_of_duties → 403 (B27's anchored rows),
-- unknown_* → 404, state | duplicate | quality_flagged → 409, the rest → 422; `incomplete package rejected (<class>)` — the same classes,
-- stale and unattested → 409. Every figure a harness seeds is SYNTHETIC. Forward-only; nothing earlier edited; the §0 prelude's classes
-- (decision.recommendation) and subject kind (recommendation) USED.

-- ─────────────────────────────────────────────────────────────────────
-- §R1 THE TABLES
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE decision.recommendations (
  recommendation_id        uuid PRIMARY KEY,
  scope                    text NOT NULL,
  tenant_id                uuid NOT NULL,
  domain_id                uuid NOT NULL,
  package_id               uuid NOT NULL REFERENCES decision.packages_current (package_id),
  version                  int  NOT NULL,
  option_key               text NOT NULL,
  what                     text NOT NULL CHECK (length(btrim(what)) BETWEEN 8 AND 2000),
  for_whom                 text NOT NULL CHECK (length(btrim(for_whom)) BETWEEN 2 AND 512),
  /* a DATE: the day the recommendation is to be acted on by (it renders as the day it names) */
  by_when                  date NOT NULL,
  assumptions              jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(assumptions) = 'array'),
  what_could_make_it_wrong jsonb NOT NULL CHECK (jsonb_typeof(what_could_make_it_wrong) = 'array' AND jsonb_array_length(what_could_make_it_wrong) >= 1),
  missing_evidence         jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(missing_evidence) = 'array'),
  /* THE FOUR SEPARATED COMPONENTS, each item {statement, source: {kind, ref}} — never merged */
  value_judgments          jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(value_judgments) = 'array'),
  policy_constraints       jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(policy_constraints) = 'array'),
  analytical_assumptions   jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(analytical_assumptions) = 'array'),
  model_outputs            jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(model_outputs) = 'array'),
  author_kind              text NOT NULL CHECK (author_kind IN ('human', 'agent')),
  author_principal_id      uuid NOT NULL,
  /* what the option rested on when recorded: its runs' decision use, the quality and indicator flags (§R4, §R5), the coverage (§R6) */
  option_runs              jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(option_runs) = 'array'),
  flags                    jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(flags) = 'array'),
  coverage                 jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(coverage) = 'object'),
  digest                   text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  state                    text NOT NULL DEFAULT 'proposed' CHECK (state IN ('proposed', 'accepted_for_consideration', 'declined', 'withdrawn', 'superseded')),
  supersedes               uuid REFERENCES decision.recommendations (recommendation_id),
  decided_by               uuid,
  decided_at               timestamptz,
  withdrawn_by             uuid,
  withdrawn_at             timestamptz,
  withdrawal_reason        text,
  superseded_by            uuid,
  superseded_at            timestamptz,
  superseded_reason        text,
  recorded_at              timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id           uuid NOT NULL,
  CONSTRAINT dsr_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT dsr_version FOREIGN KEY (package_id, version) REFERENCES decision.package_versions (package_id, version),
  CONSTRAINT dsr_decided_bound CHECK ((state IN ('accepted_for_consideration', 'declined')) = (decided_at IS NOT NULL) AND (decided_at IS NULL) = (decided_by IS NULL)),
  CONSTRAINT dsr_withdrawn_bound CHECK ((state = 'withdrawn') = (withdrawn_at IS NOT NULL AND withdrawn_by IS NOT NULL AND withdrawal_reason IS NOT NULL)),
  CONSTRAINT dsr_superseded_bound CHECK ((state = 'superseded') = (superseded_at IS NOT NULL AND superseded_reason IS NOT NULL))
);
CREATE INDEX dsr_recommendations_package ON decision.recommendations (package_id, version, recorded_at);
CREATE INDEX dsr_recommendations_live ON decision.recommendations (package_id, version) WHERE state IN ('proposed', 'accepted_for_consideration');
COMMENT ON TABLE decision.recommendations IS 'B35 §R (0101; F-P6-02, CAP-DS-09/-10, OBJ-33, PR-38-001..006): a RECOMMENDATION as a distinct explained object on a package version''s option — what, for whom, by when, the assumptions, what could make it wrong (required), the missing evidence, and the four SEPARATED components (value judgments, policy constraints, analytical assumptions, model outputs, each sourced); authored by a named human or the Decision Agent; reviewed by a human who is not its author. Content immutable; only the state columns move (dsr_recommendation_guard).';

CREATE TABLE decision.recommendation_reviews (
  review_id                uuid PRIMARY KEY,
  scope                    text NOT NULL,
  tenant_id                uuid NOT NULL,
  domain_id                uuid NOT NULL,
  recommendation_id        uuid NOT NULL REFERENCES decision.recommendations (recommendation_id),
  package_id               uuid NOT NULL,
  version                  int  NOT NULL,
  reviewer_principal_id    uuid NOT NULL,
  verdict                  text NOT NULL CHECK (verdict IN ('accept_for_consideration', 'decline', 'request_changes')),
  rationale                text NOT NULL CHECK (length(btrim(rationale)) BETWEEN 8 AND 4000),
  /* the reviewer's stated override of the flags standing at review (§R4/§R5) — required to accept while any stands */
  override                 text,
  flags_at_review          jsonb NOT NULL CHECK (jsonb_typeof(flags_at_review) = 'array'),
  /* THE COMPARISON read at review: every other recommendation on the package (AI and human), side by side */
  comparison               jsonb NOT NULL CHECK (jsonb_typeof(comparison) = 'array'),
  recommendation_digest    text NOT NULL,
  reviewed_at              timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id           uuid NOT NULL,
  CONSTRAINT dsr_review_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT dsr_review_override CHECK (override IS NULL OR length(btrim(override)) BETWEEN 16 AND 2000)
);
CREATE INDEX dsr_reviews_recommendation ON decision.recommendation_reviews (recommendation_id, reviewed_at);
CREATE TRIGGER dsr_reviews_append_only BEFORE UPDATE OR DELETE ON decision.recommendation_reviews FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE decision.recommendation_reviews IS 'B35 §R (0101; CAP-DS-10, OBJ-33): a named human''s REVIEW of a recommendation (not its author; never an agent) — accept for consideration, decline or request changes — with the comparison read at review (the package''s other recommendations, AI and human, side by side) and the override of any flag standing. Append-only.';

CREATE TABLE decision.incomplete_package_attestations (
  attestation_id           uuid PRIMARY KEY,
  scope                    text NOT NULL,
  tenant_id                uuid NOT NULL,
  domain_id                uuid NOT NULL,
  package_id               uuid NOT NULL REFERENCES decision.packages_current (package_id),
  version                  int  NOT NULL,
  /* the NAMED missing items [{category, key, note}] — every gap the completeness read found, named */
  missing                  jsonb NOT NULL CHECK (jsonb_typeof(missing) = 'array' AND jsonb_array_length(missing) >= 1),
  gaps_at_attestation      jsonb NOT NULL CHECK (jsonb_typeof(gaps_at_attestation) = 'array'),
  reason                   text NOT NULL CHECK (length(btrim(reason)) BETWEEN 16 AND 2000),
  attested_by              uuid NOT NULL,
  attested_at              timestamptz NOT NULL DEFAULT clock_timestamp(),
  state                    text NOT NULL DEFAULT 'attested' CHECK (state IN ('attested', 'acknowledged', 'superseded')),
  acknowledged_by          uuid,
  acknowledged_at          timestamptz,
  acknowledgement_note     text,
  set_aside                jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(set_aside) = 'array'),
  superseded_by            uuid,
  superseded_at            timestamptz,
  correlation_id           uuid NOT NULL,
  CONSTRAINT dsr_attestation_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT dsr_attestation_version FOREIGN KEY (package_id, version) REFERENCES decision.package_versions (package_id, version),
  CONSTRAINT dsr_attestation_ack CHECK ((acknowledged_at IS NULL) = (acknowledged_by IS NULL) AND (acknowledged_at IS NULL) = (acknowledgement_note IS NULL)
                                       AND (acknowledged_by IS NULL OR acknowledged_by <> attested_by) AND (state <> 'acknowledged' OR acknowledged_at IS NOT NULL)),
  CONSTRAINT dsr_attestation_superseded CHECK ((state = 'superseded') = (superseded_at IS NOT NULL))
);
CREATE INDEX dsr_attestations_version ON decision.incomplete_package_attestations (package_id, version, attested_at DESC);
CREATE UNIQUE INDEX dsr_attestations_one_live ON decision.incomplete_package_attestations (package_id, version) WHERE state IN ('attested', 'acknowledged');
COMMENT ON TABLE decision.incomplete_package_attestations IS 'B35 §R (0101; FEX-15, PR-38-005): the owner''s HUMAN-LED INCOMPLETE-PACKAGE MODE for a draft version that fails the recommendation completeness — the named missing items, the reason, the acknowledgement by a second human; once acknowledged the version''s live recommendations are set aside (human-led analysis without recommendation) and the proposal goes ahead labelled human-led. Only the acknowledgement and supersession columns move.';

CREATE TABLE decision.recommendation_events (
  event_id                 uuid PRIMARY KEY,
  scope                    text NOT NULL,
  tenant_id                uuid NOT NULL,
  domain_id                uuid NOT NULL,
  package_id               uuid NOT NULL,
  version                  int  NOT NULL,
  recommendation_id        uuid,
  attestation_id           uuid,
  event                    text NOT NULL CHECK (event IN ('recommendation.recorded', 'recommendation.superseded', 'recommendation.accepted_for_consideration', 'recommendation.declined',
                                                          'recommendation.changes_requested', 'recommendation.withdrawn', 'recommendation.set_aside',
                                                          'incomplete.attested', 'incomplete.acknowledged', 'incomplete.superseded')),
  actor_principal_id       uuid NOT NULL,
  details                  jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at              timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id           uuid NOT NULL,
  CONSTRAINT dsr_event_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT dsr_event_subject CHECK ((recommendation_id IS NOT NULL) <> (attestation_id IS NOT NULL))
);
CREATE INDEX dsr_events_package ON decision.recommendation_events (package_id, occurred_at);
CREATE INDEX dsr_events_recommendation ON decision.recommendation_events (recommendation_id, occurred_at) WHERE recommendation_id IS NOT NULL;
CREATE TRIGGER dsr_events_append_only BEFORE UPDATE OR DELETE ON decision.recommendation_events FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE decision.recommendation_events IS 'B35 §R (0101): the recommendation lifecycle''s OWN ledger (recorded, superseded, accepted for consideration, declined, changes requested, withdrawn, set aside) and the human-led attestation''s (attested, acknowledged, superseded). decision.package_events is never written by §R. Append-only.';

/* A recommendation's CONTENT is immutable: only the state columns move, only forward from a live state; never deleted. */
CREATE OR REPLACE FUNCTION decision.dsr_recommendation_guard() RETURNS trigger
SET search_path = decision, pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'recommendations are append-only: DELETE prohibited' USING ERRCODE = '2F002'; END IF;
  IF OLD.state NOT IN ('proposed', 'accepted_for_consideration') THEN RAISE EXCEPTION 'recommendation % is % and immutable', OLD.recommendation_id, OLD.state USING ERRCODE = '2F002'; END IF;
  IF (to_jsonb(NEW) - ARRAY['state', 'decided_by', 'decided_at', 'withdrawn_by', 'withdrawn_at', 'withdrawal_reason', 'superseded_by', 'superseded_at', 'superseded_reason'])
     IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['state', 'decided_by', 'decided_at', 'withdrawn_by', 'withdrawn_at', 'withdrawal_reason', 'superseded_by', 'superseded_at', 'superseded_reason']) THEN
    RAISE EXCEPTION 'recommendation % content is immutable; record a new recommendation (it supersedes this one)', OLD.recommendation_id USING ERRCODE = '2F002';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER dsr_recommendation_guard BEFORE UPDATE OR DELETE ON decision.recommendations FOR EACH ROW EXECUTE FUNCTION decision.dsr_recommendation_guard();

/* An attestation's named items and reason are immutable: only the acknowledgement, the set-aside list and the supersession move. */
CREATE OR REPLACE FUNCTION decision.dsr_attestation_guard() RETURNS trigger
SET search_path = decision, pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'incomplete-package attestations are append-only: DELETE prohibited' USING ERRCODE = '2F002'; END IF;
  IF OLD.state = 'superseded' THEN RAISE EXCEPTION 'attestation % is superseded and immutable', OLD.attestation_id USING ERRCODE = '2F002'; END IF;
  IF (to_jsonb(NEW) - ARRAY['state', 'acknowledged_by', 'acknowledged_at', 'acknowledgement_note', 'set_aside', 'superseded_by', 'superseded_at'])
     IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['state', 'acknowledged_by', 'acknowledged_at', 'acknowledgement_note', 'set_aside', 'superseded_by', 'superseded_at']) THEN
    RAISE EXCEPTION 'attestation % names its items once; attest again (it supersedes this one)', OLD.attestation_id USING ERRCODE = '2F002';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER dsr_attestation_guard BEFORE UPDATE OR DELETE ON decision.incomplete_package_attestations FOR EACH ROW EXECUTE FUNCTION decision.dsr_attestation_guard();

-- RLS and grants: the 0081 loop idiom (policy decision_isolation; GRANT SELECT TO eye_app, eye_commit); every write through a port below.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['recommendations', 'recommendation_reviews', 'incomplete_package_attestations', 'recommendation_events'] LOOP
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

-- ─────────────────────────────────────────────────────────────────────
-- §R5 THE INDICATORS READ — simulation.run_decision_use RE-DECLARED (0099 §V1, copied whole; the change marked `B35 recommendation`)
-- ─────────────────────────────────────────────────────────────────────
/* A run's DECISION USE: `refused` (no result: opened, failed; invalidated; unfit), `diagnostic` (partial; not promoted; a live challenge;
   its branch suspended; its scenario failing coherence or quality; B35: its experiment's last checkpoint reading numerical stability
   UNSTABLE, its completion constraint check VIOLATED or INDETERMINATE), else `decision` (completed, valid, promoted, undisputed). The
   reasons name each cause {class, detail}; the label is what every read that serves the run shows. NULL when the run is not visible. */
CREATE OR REPLACE FUNCTION simulation.run_decision_use(p_run_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = simulation, prediction, pg_catalog, pg_temp AS $$
DECLARE r simulation.runs_current%ROWTYPE; v_refused jsonb := '[]'::jsonb; v_diag jsonb := '[]'::jsonb; v_live int; v_q record; v_b record; v_coh text; v_use text;
        /* B35 recommendation (0101 §R5) */ v_ck record; v_unstable text; v_cc record; /* end B35 recommendation */
BEGIN
  SELECT * INTO r FROM simulation.runs_current x WHERE x.run_id = p_run_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF r.state = 'opened' THEN v_refused := v_refused || jsonb_build_object('class', 'unfinished', 'detail', 'the run is still open; it has no result'); END IF;
  IF r.state = 'failed' THEN v_refused := v_refused || jsonb_build_object('class', 'failed', 'detail', 'the run failed; it has no result to rest a decision on'); END IF;
  IF r.validity = 'invalidated' THEN
    v_refused := v_refused || jsonb_build_object('class', 'invalidated', 'detail', format('invalidated at %s (%s: %s)', r.invalidated_at, r.invalidation ->> 'trigger', r.invalidation ->> 'reason'));
  ELSIF r.fitness_state = 'unfit' THEN
    v_refused := v_refused || jsonb_build_object('class', 'unfit', 'detail', 'the result was judged unfit');
  END IF;
  IF r.state = 'partial' THEN
    v_diag := v_diag || jsonb_build_object('class', 'partial', 'detail', format('a partial run (%s): %s of %s paths; missing %s', r.partial ->> 'reason', coalesce(r.partial ->> 'completed_paths', '?'),
                                                                     coalesce(r.partial ->> 'declared_paths', '?'), coalesce(r.partial -> 'missing_outputs', '[]'::jsonb)));
  END IF;
  IF r.state IN ('completed', 'partial') AND r.promotion_id IS NULL THEN
    v_diag := v_diag || jsonb_build_object('class', 'unpromoted', 'detail', 'no reviewer has promoted the result as fit for a stated use (OBJ-29)');
  END IF;
  SELECT count(*) INTO v_live FROM simulation.challenges c WHERE c.run_id = p_run_id AND c.state IN ('open', 'rerun_requested');
  IF v_live > 0 THEN v_diag := v_diag || jsonb_build_object('class', 'challenged', 'detail', format('%s live challenge(s): a disputed result', v_live)); END IF;
  IF r.scenario_branch_id IS NOT NULL THEN
    SELECT b.state, b.name, b.suspension_reason INTO v_b FROM prediction.branches_current b WHERE b.branch_id = r.scenario_branch_id;
    IF FOUND AND v_b.state = 'suspended' THEN
      v_diag := v_diag || jsonb_build_object('class', 'branch_suspended', 'detail', format('branch "%s" is suspended: %s', v_b.name, v_b.suspension_reason));
    END IF;
  END IF;
  IF r.scenario_id IS NOT NULL THEN
    SELECT s.coherence_state INTO v_coh FROM prediction.scenarios_current s WHERE s.scenario_id = r.scenario_id;
    IF v_coh = 'failed' THEN v_diag := v_diag || jsonb_build_object('class', 'scenario_incoherent', 'detail', 'the scenario fails its coherence check (v1)'); END IF;
    SELECT e.outcome, e.evaluated_at, e.evaluation_id INTO v_q FROM prediction.scenario_quality_evaluations e WHERE e.scenario_id = r.scenario_id ORDER BY e.evaluated_at DESC, e.evaluation_id DESC LIMIT 1;
    IF FOUND AND v_q.outcome = 'failed' THEN
      v_diag := v_diag || jsonb_build_object('class', 'scenario_quality', 'detail', format('the scenario''s quality evaluation %s of %s failed', v_q.evaluation_id, v_q.evaluated_at));
    END IF;
  END IF;
  /* B35 recommendation (0101 §R5; F-P5-06, ES-38-008): the experiment's LAST checkpoint's numerical stability and the COMPLETION constraint
     verdict — an UNSTABLE measure, a VIOLATED or INDETERMINATE completion check — make the run DIAGNOSTIC with the reason (an indeterminate
     STABILITY below 30 paths is the rule's own and is not a finding; an indeterminate CONSTRAINT verdict is never read as satisfied). */
  SELECT k.seq, k.indicators INTO v_ck FROM simulation.experiments e JOIN simulation.experiment_checkpoints k ON k.experiment_id = e.experiment_id
   WHERE e.run_id = p_run_id ORDER BY k.seq DESC LIMIT 1;
  IF FOUND THEN
    SELECT string_agg(format('%s (relative half-width %s, moved %s since the previous checkpoint)', s.key, coalesce(s.value ->> 'relative_half_width', '?'), coalesce(s.value ->> 'change_since_previous', '—')), '; ' ORDER BY s.key)
      INTO v_unstable FROM jsonb_each(coalesce(v_ck.indicators -> 'numerical_stability', '{}'::jsonb)) s WHERE s.value ->> 'state' = 'unstable';
    IF v_unstable IS NOT NULL THEN
      v_diag := v_diag || jsonb_build_object('class', 'unstable', 'detail', format('the experiment''s last checkpoint (seq %s) reads numerical stability UNSTABLE: %s', v_ck.seq, v_unstable));
    END IF;
  END IF;
  SELECT x.outcome, x.violations, x.indeterminate_reason, x.set_id, x.set_version INTO v_cc FROM simulation.run_constraint_checks x WHERE x.run_id = p_run_id AND x.stage = 'completion';
  IF FOUND AND v_cc.outcome = 'violated' THEN
    v_diag := v_diag || jsonb_build_object('class', 'constraint_violated', 'detail', format('the completion constraint check against %s@%s is VIOLATED: %s', coalesce(v_cc.set_id, '?'), coalesce(v_cc.set_version::text, '?'), v_cc.violations));
  ELSIF FOUND AND v_cc.outcome = 'indeterminate' THEN
    v_diag := v_diag || jsonb_build_object('class', 'constraint_indeterminate', 'detail', format('the completion constraint check against %s@%s is INDETERMINATE: %s', coalesce(v_cc.set_id, '?'), coalesce(v_cc.set_version::text, '?'), v_cc.indeterminate_reason));
  END IF;
  /* end B35 recommendation */
  v_use := CASE WHEN jsonb_array_length(v_refused) > 0 THEN 'refused' WHEN jsonb_array_length(v_diag) > 0 THEN 'diagnostic' ELSE 'decision' END;
  RETURN jsonb_build_object('run_id', r.run_id, 'use', v_use, 'state', r.state, 'validity', r.validity, 'fitness_state', r.fitness_state, 'promotion_id', r.promotion_id, 'promoted_for', r.promoted_for,
    'reasons', v_refused || v_diag,
    'label', CASE v_use WHEN 'decision' THEN format('DECISION-GRADE: promoted as fit for "%s"', r.promoted_for)
                        WHEN 'diagnostic' THEN 'DIAGNOSTIC ONLY — not decision-active: ' || (SELECT string_agg(x ->> 'class', ', ') FROM jsonb_array_elements(v_diag) x)
                        ELSE 'REFUSED for decision use: ' || (SELECT string_agg(x ->> 'class', ', ') FROM jsonb_array_elements(v_refused) x) END,
    'partial', r.partial, 'invalidated_at', r.invalidated_at, 'invalidation', r.invalidation - 'dependants');
END $$;
GRANT EXECUTE ON FUNCTION simulation.run_decision_use(uuid) TO eye_app, eye_commit;

-- ─────────────────────────────────────────────────────────────────────
-- §R0 HELPERS
-- ─────────────────────────────────────────────────────────────────────
/* The kind a principal acts as: `human` (an active member — never an external collaborator), `agent` (an active agent principal), else NULL. */
CREATE OR REPLACE FUNCTION decision.dsr_principal_kind(p_principal uuid, p_tenant uuid) RETURNS text
STABLE SECURITY DEFINER SET search_path = identity, pg_catalog, pg_temp AS $$
  SELECT CASE WHEN p.kind = 'agent' THEN 'agent'
              WHEN p.kind = 'human' AND NOT EXISTS (SELECT 1 FROM executive.external_principals x WHERE x.principal_id = p.id) THEN 'human' END
    FROM identity.principals p WHERE p.id = p_principal AND p.status = 'active' AND p.tenant_id = p_tenant;
$$ LANGUAGE sql;
REVOKE ALL ON FUNCTION decision.dsr_principal_kind(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.dsr_principal_kind(uuid, uuid) TO eye_app, eye_commit;

/* The ledger row. */
CREATE OR REPLACE FUNCTION decision.dsr_event(p_tenant uuid, p_domain uuid, p_package uuid, p_version int, p_recommendation uuid, p_attestation uuid, p_event text, p_actor uuid, p_details jsonb, p_correlation uuid) RETURNS uuid
SET search_path = decision, pg_catalog, pg_temp AS $$
DECLARE v_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO decision.recommendation_events (event_id, scope, tenant_id, domain_id, package_id, version, recommendation_id, attestation_id, event, actor_principal_id, details, correlation_id)
  VALUES (v_id, 'DOMAIN', p_tenant, p_domain, p_package, p_version, p_recommendation, p_attestation, p_event, p_actor, coalesce(p_details, '{}'::jsonb), p_correlation);
  RETURN v_id;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.dsr_event(uuid, uuid, uuid, int, uuid, uuid, text, uuid, jsonb, uuid) FROM PUBLIC;

/* §R4 + §R5: what an option rests on — every run it cites with its DECISION USE now, and the FLAGS: `scenario_quality` (the run's scenario's
   latest quality evaluation failed — F-P4-09) and `run_indicator` (the run's use names an unstable checkpoint or a violated / indeterminate
   completion constraint check — F-P5-06). An invoker read: under a port it reads as the port. {runs, flags}. */
CREATE OR REPLACE FUNCTION decision.dsr_option_basis(p_package_id uuid, p_version int, p_option_key text) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = decision, simulation, prediction, pg_catalog, pg_temp AS $$
DECLARE c record; u jsonb; v_runs jsonb := '[]'::jsonb; v_flags jsonb := '[]'::jsonb; v_q record; rs record; x jsonb;
BEGIN
  FOR c IN SELECT DISTINCT (e ->> 'id')::uuid AS run_id FROM decision.options o CROSS JOIN LATERAL jsonb_array_elements(o.consequences) e
            WHERE o.package_id = p_package_id AND o.version = p_version AND o.key = p_option_key AND e ->> 'kind' = 'run' ORDER BY 1 LOOP
    u := simulation.run_decision_use(c.run_id);
    SELECT r.scenario_id, r.scenario_branch_id INTO rs FROM simulation.runs_current r WHERE r.run_id = c.run_id;
    v_runs := v_runs || jsonb_build_object('run_id', c.run_id, 'use', coalesce(u ->> 'use', 'unreadable'), 'label', u ->> 'label', 'reasons', coalesce(u -> 'reasons', '[]'::jsonb),
                                           'scenario_id', rs.scenario_id, 'scenario_branch_id', rs.scenario_branch_id);
    IF rs.scenario_id IS NOT NULL THEN
      SELECT e.evaluation_id, e.evaluated_at, e.outcome, s.title INTO v_q FROM prediction.scenario_quality_evaluations e JOIN prediction.scenarios_current s ON s.scenario_id = e.scenario_id
       WHERE e.scenario_id = rs.scenario_id ORDER BY e.evaluated_at DESC, e.evaluation_id DESC LIMIT 1;
      IF FOUND AND v_q.outcome = 'failed' AND NOT (v_flags @> jsonb_build_array(jsonb_build_object('class', 'scenario_quality', 'scenario_id', rs.scenario_id))) THEN
        v_flags := v_flags || jsonb_build_object('class', 'scenario_quality', 'scenario_id', rs.scenario_id, 'evaluation_id', v_q.evaluation_id, 'run_id', c.run_id,
          'detail', format('option %s rests on run %s, whose scenario "%s" FAILS its quality evaluation %s of %s (F-P4-09)', p_option_key, c.run_id, v_q.title, v_q.evaluation_id, v_q.evaluated_at));
      END IF;
    END IF;
    FOR x IN SELECT y FROM jsonb_array_elements(coalesce(u -> 'reasons', '[]'::jsonb)) y WHERE y ->> 'class' IN ('unstable', 'constraint_violated', 'constraint_indeterminate') LOOP
      v_flags := v_flags || jsonb_build_object('class', 'run_indicator', 'indicator', x ->> 'class', 'run_id', c.run_id,
        'detail', format('option %s rests on run %s: %s (ES-38-008)', p_option_key, c.run_id, x ->> 'detail'));
    END LOOP;
  END LOOP;
  RETURN jsonb_build_object('runs', v_runs, 'flags', v_flags);
END $$;
GRANT EXECUTE ON FUNCTION decision.dsr_option_basis(uuid, int, text) TO eye_app, eye_commit;

/* §R6 THE DECISION COVERAGE (ES-37-008) of an option on a version: the denominator is the LIVE branches of the package's bound, unretired
   scenario sets (basis bound_set), else the live branches of the scenarios the version's options cite runs on (basis cited_scenarios), else
   none (not applicable). A branch is ASSESSED when the option cites a run on it, or the latest portfolio review of a set holding it carries
   the option's payoff for it. {basis, live_branches, assessed, unassessed, share, label}. An invoker read. */
CREATE OR REPLACE FUNCTION decision.dsr_coverage(p_package_id uuid, p_version int, p_option_key text) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = decision, simulation, prediction, pg_catalog, pg_temp AS $$
DECLARE v_basis text; v_live jsonb := '[]'::jsonb; v_assessed jsonb := '[]'::jsonb; v_unassessed jsonb := '[]'::jsonb; b record; v_how text; v_n int; v_a int; v_share numeric;
BEGIN
  IF EXISTS (SELECT 1 FROM decision.package_scenario_sets ps JOIN prediction.scenario_sets s ON s.set_id = ps.set_id WHERE ps.package_id = p_package_id AND s.state <> 'retired') THEN
    v_basis := 'bound_set';
    FOR b IN SELECT DISTINCT ON (sb.branch_id) sb.branch_id, sb.name, sb.kind, sb.scenario_id, sb.scenario_title, ps.set_id
               FROM decision.package_scenario_sets ps JOIN prediction.scenario_sets s ON s.set_id = ps.set_id AND s.state <> 'retired'
               CROSS JOIN LATERAL prediction.scenario_set_branches(ps.set_id) sb
              WHERE ps.package_id = p_package_id AND sb.counts ORDER BY sb.branch_id LOOP
      v_how := NULL;
      IF EXISTS (SELECT 1 FROM decision.options o CROSS JOIN LATERAL jsonb_array_elements(o.consequences) e JOIN simulation.runs_current r ON r.run_id = (e ->> 'id')::uuid
                  WHERE o.package_id = p_package_id AND o.version = p_version AND o.key = p_option_key AND e ->> 'kind' = 'run' AND r.scenario_branch_id = b.branch_id) THEN
        v_how := 'a cited run on the branch';
      ELSIF EXISTS (SELECT 1 FROM (SELECT pr.payoffs FROM prediction.portfolio_reviews pr WHERE pr.set_id = b.set_id ORDER BY pr.reviewed_at DESC, pr.review_id DESC LIMIT 1) lr
                     WHERE lr.payoffs -> p_option_key ? b.branch_id::text) THEN
        v_how := 'a payoff in the set''s latest portfolio review';
      END IF;
      v_live := v_live || jsonb_build_object('branch_id', b.branch_id, 'name', b.name, 'kind', b.kind, 'scenario_id', b.scenario_id, 'scenario_title', b.scenario_title);
      IF v_how IS NOT NULL THEN v_assessed := v_assessed || jsonb_build_object('branch_id', b.branch_id, 'name', b.name, 'kind', b.kind, 'how', v_how);
      ELSE v_unassessed := v_unassessed || jsonb_build_object('branch_id', b.branch_id, 'name', b.name, 'kind', b.kind); END IF;
    END LOOP;
  ELSE
    v_basis := 'cited_scenarios';
    FOR b IN SELECT br.branch_id, br.name, br.kind, br.scenario_id, s.title AS scenario_title
               FROM prediction.branches_current br JOIN prediction.scenarios_current s ON s.scenario_id = br.scenario_id
              WHERE prediction.branch_live(br.state) AND s.state = 'active'
                AND br.scenario_id IN (SELECT r.scenario_id FROM decision.options o CROSS JOIN LATERAL jsonb_array_elements(o.consequences) e JOIN simulation.runs_current r ON r.run_id = (e ->> 'id')::uuid
                                        WHERE o.package_id = p_package_id AND o.version = p_version AND e ->> 'kind' = 'run' AND r.scenario_id IS NOT NULL)
              ORDER BY br.branch_id LOOP
      v_live := v_live || jsonb_build_object('branch_id', b.branch_id, 'name', b.name, 'kind', b.kind, 'scenario_id', b.scenario_id, 'scenario_title', b.scenario_title);
      IF EXISTS (SELECT 1 FROM decision.options o CROSS JOIN LATERAL jsonb_array_elements(o.consequences) e JOIN simulation.runs_current r ON r.run_id = (e ->> 'id')::uuid
                  WHERE o.package_id = p_package_id AND o.version = p_version AND o.key = p_option_key AND e ->> 'kind' = 'run' AND r.scenario_branch_id = b.branch_id) THEN
        v_assessed := v_assessed || jsonb_build_object('branch_id', b.branch_id, 'name', b.name, 'kind', b.kind, 'how', 'a cited run on the branch');
      ELSE v_unassessed := v_unassessed || jsonb_build_object('branch_id', b.branch_id, 'name', b.name, 'kind', b.kind); END IF;
    END LOOP;
  END IF;
  v_n := jsonb_array_length(v_live); v_a := jsonb_array_length(v_assessed);
  IF v_n = 0 THEN
    RETURN jsonb_build_object('basis', 'none', 'option_key', p_option_key, 'live_branches', '[]'::jsonb, 'assessed', '[]'::jsonb, 'unassessed', '[]'::jsonb, 'share', NULL,
                              'label', 'DECISION COVERAGE not applicable: no bound scenario set and no cited run rests on a scenario');
  END IF;
  v_share := round(v_a::numeric / v_n, 4);
  RETURN jsonb_build_object('basis', v_basis, 'option_key', p_option_key, 'live_branches', v_live, 'assessed', v_assessed, 'unassessed', v_unassessed, 'share', v_share,
    'label', format('DECISION COVERAGE %s of %s live branch(es) (%s%%) of the %s', v_a, v_n, round(v_share * 100), CASE v_basis WHEN 'bound_set' THEN 'bound scenario set(s)' ELSE 'scenarios the runs rest on' END));
END $$;
GRANT EXECUTE ON FUNCTION decision.dsr_coverage(uuid, int, text) TO eye_app, eye_commit;

-- ─────────────────────────────────────────────────────────────────────
-- §R3 THE COMPLETENESS READ (FEX-15; PR-38-005)
-- ─────────────────────────────────────────────────────────────────────
/* A version's RECOMMENDATION COMPLETENESS (an invoker read under the caller's RLS; NULL when the version is not visible): the GAPS by
   FEX-15's categories — evidence (the version's declared missing information; the live recommendations' missing evidence), uncertainty (an
   intervention resting on no completed run: its uncertainty is not quantified), alternatives (fewer than two interventions beside the
   status quo) — each with a stable key; the EXPLANATION (§E's explanation of the version, read through to_regclass) an ADVISORY, shown and
   not blocking (`not_assessed` when §E is absent; the integrator may promote it to a gap at §I); the live recommendations; the live attestation; whether an ACKNOWLEDGED attestation names every gap (covered); the mode:
   complete | human_led | attested (awaiting the second human) | incomplete. */
CREATE OR REPLACE FUNCTION decision.recommendation_completeness(p_package_id uuid, p_version int) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = decision, simulation, prediction, pg_catalog, pg_temp AS $$
DECLARE v record; v_gaps jsonb := '[]'::jsonb; v_not jsonb := '[]'::jsonb; x jsonb; i int; rr record; o record; v_int int; v_live int; a record; v_att jsonb; v_named text[];
        v_uncovered jsonb := '[]'::jsonb; v_covered boolean := false; v_has boolean; v_mode text; v_adv jsonb := '[]'::jsonb;
BEGIN
  SELECT pv.*, p.title, p.owner_principal_id, p.state AS package_state INTO v FROM decision.package_versions pv JOIN decision.packages_current p ON p.package_id = pv.package_id
   WHERE pv.package_id = p_package_id AND pv.version = p_version;
  IF NOT FOUND THEN RETURN NULL; END IF;
  -- evidence: the version's declared missing information (B36 §G0)
  i := 0;
  FOR x IN SELECT y FROM jsonb_array_elements(coalesce(v.missing_information, '[]'::jsonb)) y LOOP
    v_gaps := v_gaps || jsonb_build_object('category', 'evidence', 'key', 'missing_information:' || i,
      'detail', format('declared missing: %s (owner %s, needed by %s)', x ->> 'what', coalesce(x ->> 'owner', '?'), coalesce(x ->> 'needed_by', '?')));
    i := i + 1;
  END LOOP;
  -- evidence: what the live recommendations say is missing
  v_live := 0;
  FOR rr IN SELECT r.recommendation_id, r.author_kind, r.missing_evidence FROM decision.recommendations r
             WHERE r.package_id = p_package_id AND r.version = p_version AND r.state IN ('proposed', 'accepted_for_consideration') ORDER BY r.recorded_at, r.recommendation_id LOOP
    v_live := v_live + 1;
    i := 0;
    FOR x IN SELECT y FROM jsonb_array_elements(rr.missing_evidence) y LOOP
      v_gaps := v_gaps || jsonb_build_object('category', 'evidence', 'key', format('recommendation:%s:missing_evidence:%s', rr.recommendation_id, i),
        'detail', format('the %s recommendation %s names missing evidence: %s', rr.author_kind, rr.recommendation_id, x ->> 'what'));
      i := i + 1;
    END LOOP;
  END LOOP;
  -- uncertainty: an intervention resting on no completed run
  FOR o IN SELECT op.key, op.unsimulated_reason FROM decision.options op WHERE op.package_id = p_package_id AND op.version = p_version AND op.kind = 'intervention' AND NOT op.simulated ORDER BY op.key LOOP
    v_gaps := v_gaps || jsonb_build_object('category', 'uncertainty', 'key', 'option:' || o.key,
      'detail', format('option %s rests on no completed run: its uncertainty is not quantified (%s)', o.key, coalesce(o.unsimulated_reason, 'no reason given')));
  END LOOP;
  -- alternatives: at least two interventions beside the status quo
  SELECT count(*) INTO v_int FROM decision.options op WHERE op.package_id = p_package_id AND op.version = p_version AND op.kind = 'intervention';
  IF v_int < 2 THEN
    v_gaps := v_gaps || jsonb_build_object('category', 'alternatives', 'key', 'alternatives',
      'detail', format('%s intervention(s) beside the status quo; a recommendation compares at least two courses of action', v_int));
  END IF;
  -- explanation: §E's explanation of this version (the to_regclass seam; the integrator asserts it in the combined harnesses)
  IF to_regclass('decision.explanations') IS NULL THEN
    v_not := v_not || jsonb_build_object('category', 'explanation', 'reason', 'the explanation part (§E) is not installed');
  ELSE
    BEGIN
      EXECUTE 'SELECT EXISTS (SELECT 1 FROM decision.explanations e WHERE e.subject_kind = ''package_version'' AND e.subject_id = $1 AND e.subject_version = $2)' INTO v_has USING p_package_id, p_version;
      IF NOT v_has THEN
        v_adv := v_adv || jsonb_build_object('category', 'explanation', 'key', 'explanation', 'detail', format('no explanation of version %s has been generated', p_version));
      END IF;
    EXCEPTION WHEN undefined_column OR undefined_table THEN
      v_not := v_not || jsonb_build_object('category', 'explanation', 'reason', 'the explanation part''s table does not carry (subject_kind, subject_id, subject_version)');
    END;
  END IF;
  -- the live attestation, and whether it names every gap
  SELECT * INTO a FROM decision.incomplete_package_attestations t WHERE t.package_id = p_package_id AND t.version = p_version AND t.state IN ('attested', 'acknowledged') ORDER BY t.attested_at DESC LIMIT 1;
  IF FOUND THEN
    v_named := ARRAY(SELECT m ->> 'key' FROM jsonb_array_elements(a.missing) m);
    SELECT coalesce(jsonb_agg(g), '[]'::jsonb) INTO v_uncovered FROM jsonb_array_elements(v_gaps) g WHERE NOT ((g ->> 'key') = ANY (v_named));
    v_covered := a.state = 'acknowledged' AND jsonb_array_length(v_uncovered) = 0;
    v_att := jsonb_build_object('attestation_id', a.attestation_id, 'state', a.state, 'missing', a.missing, 'reason', a.reason, 'attested_by', a.attested_by, 'attested_at', a.attested_at,
                                'acknowledged_by', a.acknowledged_by, 'acknowledged_at', a.acknowledged_at, 'acknowledgement_note', a.acknowledgement_note, 'set_aside', a.set_aside);
  END IF;
  v_mode := CASE WHEN jsonb_array_length(v_gaps) = 0 THEN 'complete'
                 WHEN v_covered THEN 'human_led'
                 WHEN v_att IS NOT NULL AND v_att ->> 'state' = 'attested' THEN 'attested'
                 ELSE 'incomplete' END;
  RETURN jsonb_build_object('package_id', p_package_id, 'version', p_version, 'version_state', v.state, 'package_state', v.package_state,
    'complete', jsonb_array_length(v_gaps) = 0, 'gaps', v_gaps, 'advisories', v_adv, 'not_assessed', v_not, 'live_recommendations', v_live,
    'attestation', v_att, 'covered', v_covered, 'uncovered', CASE WHEN v_att IS NULL THEN v_gaps ELSE v_uncovered END, 'mode', v_mode,
    'label', CASE v_mode WHEN 'complete' THEN 'COMPLETE: no gap stands against a recommendation'
                         WHEN 'human_led' THEN 'HUMAN-LED — incomplete package, analysis without recommendation (attested and acknowledged)'
                         WHEN 'attested' THEN 'INCOMPLETE — the human-led mode is attested and awaits a second human''s acknowledgement'
                         ELSE format('INCOMPLETE: %s gap(s) — %s', jsonb_array_length(v_gaps), (SELECT string_agg(DISTINCT g ->> 'category', ', ') FROM jsonb_array_elements(v_gaps) g)) END);
END $$;
GRANT EXECUTE ON FUNCTION decision.recommendation_completeness(uuid, int) TO eye_app, eye_commit;

-- ─────────────────────────────────────────────────────────────────────
-- §R1 THE VALIDATION OF A RECOMMENDATION'S CONTENT (pure, except the source referents read in-domain by the port)
-- ─────────────────────────────────────────────────────────────────────
/* A list of statements [{statement 4..1000, …}] of at most 20 items, or a refusal naming the field. */
CREATE OR REPLACE FUNCTION decision.dsr_statements(p jsonb, p_field text, p_key text, p_min int) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
DECLARE x jsonb; i int := 0; v_out jsonb := '[]'::jsonb;
BEGIN
  IF p IS NULL OR jsonb_typeof(p) <> 'array' OR jsonb_array_length(p) > 20 OR jsonb_array_length(p) < p_min THEN
    RAISE EXCEPTION 'recommendation rejected (%): a list of % to 20 items {%}', p_field, p_min, p_key USING ERRCODE = '22023';
  END IF;
  FOR x IN SELECT y FROM jsonb_array_elements(p) y LOOP
    IF jsonb_typeof(x) <> 'object' OR coalesce(length(btrim(x ->> p_key)), 0) NOT BETWEEN 4 AND 1000 THEN
      RAISE EXCEPTION 'recommendation rejected (%[%]): each item states its % (4 to 1000 characters)', p_field, i, p_key USING ERRCODE = '22023';
    END IF;
    v_out := v_out || (x || jsonb_build_object(p_key, btrim(x ->> p_key)));
    i := i + 1;
  END LOOP;
  RETURN v_out;
END $$;

/* One SEPARATED component: [{statement, source: {kind, ref}}], at most 20, each source's kind among the component's own; the referents a
   port checks in-domain (a principal, an objective, an assumption, a run, a forecast, a VOI assessment). A run cited as a model output
   carries its decision use as read at recording. */
CREATE OR REPLACE FUNCTION decision.dsr_component(p jsonb, p_field text, p_kinds text[], p_tenant uuid, p_domain uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = decision, graph, simulation, prediction, pg_catalog, pg_temp AS $$
DECLARE x jsonb; i int := 0; v_out jsonb := '[]'::jsonb; k text; ref text; v_ok boolean; u jsonb;
BEGIN
  IF p IS NULL OR jsonb_typeof(p) <> 'array' OR jsonb_array_length(p) > 20 THEN
    RAISE EXCEPTION 'recommendation rejected (%): a list of at most 20 items {statement, source: {kind, ref}}', p_field USING ERRCODE = '22023';
  END IF;
  FOR x IN SELECT y FROM jsonb_array_elements(p) y LOOP
    IF jsonb_typeof(x) <> 'object' OR coalesce(length(btrim(x ->> 'statement')), 0) NOT BETWEEN 4 AND 1000 THEN
      RAISE EXCEPTION 'recommendation rejected (%[%]): each item states its statement (4 to 1000 characters)', p_field, i USING ERRCODE = '22023';
    END IF;
    k := x -> 'source' ->> 'kind'; ref := btrim(coalesce(x -> 'source' ->> 'ref', ''));
    IF jsonb_typeof(x -> 'source') IS DISTINCT FROM 'object' OR k IS NULL OR NOT (k = ANY (p_kinds)) OR length(ref) NOT BETWEEN 1 AND 512 THEN
      RAISE EXCEPTION 'recommendation rejected (%[%].source): each item names its source {kind: %, ref}', p_field, i, array_to_string(p_kinds, '|') USING ERRCODE = '22023';
    END IF;
    u := NULL;
    IF k IN ('principal', 'objective', 'assumption', 'run', 'forecast', 'voi') THEN
      IF ref !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        RAISE EXCEPTION 'recommendation rejected (%[%].source): a % source names its id (a uuid)', p_field, i, k USING ERRCODE = '22023';
      END IF;
      v_ok := CASE k
        WHEN 'principal' THEN decision.dsr_principal_kind(ref::uuid, p_tenant) = 'human'
        WHEN 'objective' THEN EXISTS (SELECT 1 FROM graph.strategy_current s WHERE s.strategy_object_id = ref::uuid AND s.object_type = 'OBJ' AND s.tenant_id = p_tenant AND s.domain_id = p_domain)
        WHEN 'assumption' THEN EXISTS (SELECT 1 FROM graph.strategy_current s WHERE s.strategy_object_id = ref::uuid AND s.object_type = 'ASU' AND s.tenant_id = p_tenant AND s.domain_id = p_domain)
        WHEN 'run' THEN EXISTS (SELECT 1 FROM simulation.runs_current r WHERE r.run_id = ref::uuid AND r.tenant_id = p_tenant AND r.domain_id = p_domain)
        WHEN 'forecast' THEN EXISTS (SELECT 1 FROM prediction.forecasts_current f WHERE f.forecast_id = ref::uuid AND f.tenant_id = p_tenant AND f.domain_id = p_domain)
        WHEN 'voi' THEN EXISTS (SELECT 1 FROM simulation.voi_assessments va WHERE va.assessment_id = ref::uuid AND va.tenant_id = p_tenant AND va.domain_id = p_domain) END;
      IF NOT v_ok THEN
        RAISE EXCEPTION 'recommendation rejected (unknown_source): %[%] names % %, which is not %', p_field, i, k, ref,
          CASE k WHEN 'principal' THEN 'a named, active member of this tenant' ELSE format('a %s of this domain', k) END USING ERRCODE = '23503';
      END IF;
      IF k = 'run' THEN u := simulation.run_decision_use(ref::uuid); END IF;
    END IF;
    v_out := v_out || jsonb_strip_nulls(jsonb_build_object('statement', btrim(x ->> 'statement'), 'source', jsonb_build_object('kind', k, 'ref', ref),
                                                            'decision_use', CASE WHEN u IS NULL THEN NULL ELSE jsonb_build_object('use', u ->> 'use', 'label', u ->> 'label') END));
    i := i + 1;
  END LOOP;
  RETURN v_out;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- §R1 RECORD (decision.recommendation.record)
-- ─────────────────────────────────────────────────────────────────────
/* RECORD a recommendation on a version's option — a named human or the Decision Agent (author kind from the acting principal); the version
   live (not committed, rejected or superseded) and not in the human-led mode; the content validated; the option's basis read (runs, the
   quality and indicator FLAGS) and its coverage; a live recommendation of the same author on the same version SUPERSEDED; the package owner
   (or, when the owner is the author, the reviewers) notified (decision.recommendation). */
CREATE OR REPLACE FUNCTION decision.record_recommendation(
  p_recommendation_id uuid, p_tenant uuid, p_domain uuid, p_package_id uuid, p_version int, p_option_key text, p_what text, p_for_whom text, p_by_when date,
  p_assumptions jsonb, p_wrong jsonb, p_missing jsonb, p_value_judgments jsonb, p_policy_constraints jsonb, p_analytical_assumptions jsonb, p_model_outputs jsonb,
  p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, executive, simulation, prediction, graph, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE p decision.packages_current%ROWTYPE; v decision.package_versions%ROWTYPE; v_kind text; v_assume jsonb; v_wrong jsonb; v_missing jsonb; v_vj jsonb; v_pc jsonb; v_aa jsonb; v_mo jsonb;
        v_basis jsonb; v_cov jsonb; v_digest text; v_prev uuid; v_event uuid; v_item uuid; v_state text; v_owner uuid; v_roles text[]; v_title text; v_att uuid; v_opt record;
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.recommendation.record']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'recommendation rejected (actor): a recommendation is recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  v_kind := decision.dsr_principal_kind(p_actor, p_tenant);
  IF v_kind IS NULL THEN RAISE EXCEPTION 'recommendation rejected (actor): the author is a named, active member or a registered agent of this tenant' USING ERRCODE = '42501'; END IF;
  SELECT * INTO p FROM decision.packages_current x WHERE x.package_id = p_package_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'recommendation rejected (unknown_package): % is not a decision package of this domain', p_package_id USING ERRCODE = '23503'; END IF;
  SELECT * INTO v FROM decision.package_versions x WHERE x.package_id = p_package_id AND x.version = p_version;
  IF NOT FOUND THEN RAISE EXCEPTION 'recommendation rejected (unknown_version): package % has no version %', p_package_id, p_version USING ERRCODE = '23503'; END IF;
  IF p.state IN ('committed', 'monitoring', 'closed', 'rejected', 'withdrawn') OR v.state IN ('committed', 'rejected', 'superseded') THEN
    RAISE EXCEPTION 'recommendation rejected (state): version % is % (the package is %); a recommendation is recorded on a version still being decided', p_version, v.state, p.state USING ERRCODE = '22023';
  END IF;
  SELECT t.attestation_id INTO v_att FROM decision.incomplete_package_attestations t WHERE t.package_id = p_package_id AND t.version = p_version AND t.state = 'acknowledged';
  IF FOUND THEN
    RAISE EXCEPTION 'recommendation rejected (state): version % is in the human-led incomplete-package mode (attestation %): a human-led analysis without recommendation; open a new version once the package is complete', p_version, v_att USING ERRCODE = '22023';
  END IF;
  SELECT o.key, o.title, o.kind INTO v_opt FROM decision.options o WHERE o.package_id = p_package_id AND o.version = p_version AND o.key = p_option_key;
  IF NOT FOUND THEN RAISE EXCEPTION 'recommendation rejected (unknown_option): version % of package % has no option %', p_version, p_package_id, coalesce(p_option_key, '<none>') USING ERRCODE = '23503'; END IF;
  IF p_what IS NULL OR length(btrim(p_what)) NOT BETWEEN 8 AND 2000 THEN RAISE EXCEPTION 'recommendation rejected (what): says what is recommended (8 to 2000 characters)' USING ERRCODE = '22023'; END IF;
  IF p_for_whom IS NULL OR length(btrim(p_for_whom)) NOT BETWEEN 2 AND 512 THEN RAISE EXCEPTION 'recommendation rejected (for_whom): names for whom (2 to 512 characters)' USING ERRCODE = '22023'; END IF;
  IF p_by_when IS NULL THEN RAISE EXCEPTION 'recommendation rejected (by_when): names the day it is to be acted on by' USING ERRCODE = '22023'; END IF;
  v_assume := decision.dsr_statements(coalesce(p_assumptions, '[]'::jsonb), 'assumptions', 'statement', 0);
  v_wrong := decision.dsr_statements(p_wrong, 'what_could_make_it_wrong', 'statement', 1);
  v_missing := decision.dsr_statements(coalesce(p_missing, '[]'::jsonb), 'missing_evidence', 'what', 0);
  v_vj := decision.dsr_component(coalesce(p_value_judgments, '[]'::jsonb), 'value_judgments', ARRAY['principal', 'objective', 'stated'], p_tenant, p_domain);
  v_pc := decision.dsr_component(coalesce(p_policy_constraints, '[]'::jsonb), 'policy_constraints', ARRAY['policy', 'constraint', 'obligation', 'regulation', 'stated'], p_tenant, p_domain);
  v_aa := decision.dsr_component(coalesce(p_analytical_assumptions, '[]'::jsonb), 'analytical_assumptions', ARRAY['assumption', 'stated'], p_tenant, p_domain);
  v_mo := decision.dsr_component(coalesce(p_model_outputs, '[]'::jsonb), 'model_outputs', ARRAY['run', 'forecast', 'voi'], p_tenant, p_domain);
  IF jsonb_array_length(v_vj) + jsonb_array_length(v_pc) + jsonb_array_length(v_aa) + jsonb_array_length(v_mo) = 0 THEN
    RAISE EXCEPTION 'recommendation rejected (components): a recommendation separates what it rests on — at least one value judgment, policy constraint, analytical assumption or model output' USING ERRCODE = '22023';
  END IF;
  v_basis := decision.dsr_option_basis(p_package_id, p_version, p_option_key);
  v_cov := decision.dsr_coverage(p_package_id, p_version, p_option_key);
  v_digest := encode(sha256(convert_to(jsonb_build_object('package_id', p_package_id, 'version', p_version, 'option_key', p_option_key, 'what', btrim(p_what), 'for_whom', btrim(p_for_whom),
    'by_when', p_by_when, 'assumptions', v_assume, 'what_could_make_it_wrong', v_wrong, 'missing_evidence', v_missing, 'value_judgments', v_vj, 'policy_constraints', v_pc,
    'analytical_assumptions', v_aa, 'model_outputs', v_mo, 'author_kind', v_kind, 'author', p_actor)::text, 'UTF8')), 'hex');
  -- the author's live recommendation on this version is superseded by this one
  SELECT r.recommendation_id INTO v_prev FROM decision.recommendations r WHERE r.package_id = p_package_id AND r.version = p_version AND r.author_principal_id = p_actor
     AND r.state IN ('proposed', 'accepted_for_consideration') FOR UPDATE;
  IF v_prev IS NOT NULL THEN
    UPDATE decision.recommendations SET state = 'superseded', superseded_by = p_recommendation_id, superseded_at = clock_timestamp(),
           superseded_reason = format('superseded by the author''s recommendation %s', p_recommendation_id) WHERE recommendation_id = v_prev;
  END IF;
  INSERT INTO decision.recommendations (recommendation_id, scope, tenant_id, domain_id, package_id, version, option_key, what, for_whom, by_when, assumptions, what_could_make_it_wrong,
      missing_evidence, value_judgments, policy_constraints, analytical_assumptions, model_outputs, author_kind, author_principal_id, option_runs, flags, coverage, digest, supersedes, correlation_id)
  VALUES (p_recommendation_id, 'DOMAIN', p_tenant, p_domain, p_package_id, p_version, p_option_key, btrim(p_what), btrim(p_for_whom), p_by_when, v_assume, v_wrong,
      v_missing, v_vj, v_pc, v_aa, v_mo, v_kind, p_actor, v_basis -> 'runs', v_basis -> 'flags', v_cov, v_digest, v_prev, p_correlation);
  IF v_prev IS NOT NULL THEN
    PERFORM decision.dsr_event(p_tenant, p_domain, p_package_id, p_version, v_prev, NULL, 'recommendation.superseded', p_actor, jsonb_build_object('superseded_by', p_recommendation_id), p_correlation);
    PERFORM decision.dsr_close_items(p_tenant, p_domain, v_prev, p_actor, 'the recommendation was superseded by its author', p_correlation);
  END IF;
  v_event := decision.dsr_event(p_tenant, p_domain, p_package_id, p_version, p_recommendation_id, NULL, 'recommendation.recorded', p_actor,
    jsonb_build_object('option_key', p_option_key, 'author_kind', v_kind, 'digest', v_digest, 'flags', jsonb_array_length(v_basis -> 'flags'), 'coverage', v_cov -> 'share', 'supersedes', v_prev), p_correlation);
  -- the notice: the package owner reviews; when the owner is the author, the reviewers are routed (a role holder, else unrouted)
  v_owner := CASE WHEN p.owner_principal_id <> p_actor THEN p.owner_principal_id END;
  v_roles := CASE WHEN v_owner IS NULL THEN ARRAY['decision_approver', 'decision_authority', 'executive', 'domain_analyst'] ELSE '{}'::text[] END;
  v_state := CASE WHEN v_owner IS NOT NULL THEN CASE WHEN decision.is_active_human(v_owner, p_tenant) THEN 'open' ELSE 'unrouted' END
                  ELSE CASE WHEN executive.role_holders(p_tenant, p_domain, v_roles) > 0 THEN 'open' ELSE 'unrouted' END END;
  v_item := gen_random_uuid();
  v_title := left(format('Recommendation to review (%s): "%s" — option %s of "%s" v%s', CASE v_kind WHEN 'agent' THEN 'the Decision Agent''s' ELSE 'a named human''s' END, left(btrim(p_what), 120), p_option_key, p.title, p_version), 512);
  INSERT INTO executive.attention_items (item_id, scope, tenant_id, domain_id, signal_class, subject_kind, subject_id, cause_event_id, cause_event_type, title, outcome, state, owner_principal_id, route_roles, evaluation, details, due_at, escalations, correlation_id)
  VALUES (v_item, 'DOMAIN', p_tenant, p_domain, 'decision.recommendation', 'recommendation', p_recommendation_id, v_event, 'recommendation.recorded', v_title, 'material', v_state, v_owner, v_roles,
          jsonb_build_object('outcome', 'material', 'reasons', jsonb_build_array(format('a %s recommendation awaits review: accept it for consideration, decline it or request changes', v_kind))
                               || CASE WHEN jsonb_array_length(v_basis -> 'flags') > 0 THEN jsonb_build_array(format('%s flag(s) stand: acceptance needs the reviewer''s stated override', jsonb_array_length(v_basis -> 'flags'))) ELSE '[]'::jsonb END,
                             'policy_version', NULL, 'dimensions', jsonb_build_object('consequence', 'C2', 'confidence', 1)),
          jsonb_build_object('recommendation_id', p_recommendation_id, 'package_id', p_package_id, 'version', p_version, 'option_key', p_option_key, 'author_kind', v_kind, 'flags', v_basis -> 'flags'),
          greatest(clock_timestamp() + interval '1 day', least((p_by_when::timestamp AT TIME ZONE 'UTC'), clock_timestamp() + interval '7 days')), 0, p_correlation);
  PERFORM executive.attention_event(v_item, p_tenant, p_domain, CASE v_state WHEN 'open' THEN 'item.routed' ELSE 'item.unrouted' END, p_actor,
            jsonb_build_object('outcome', 'material', 'owner', v_owner, 'route_roles', to_jsonb(v_roles), 'cause_event_id', v_event, 'cause_event_type', 'recommendation.recorded',
                               'unrouted', v_state = 'unrouted', 'recommendation_id', p_recommendation_id), p_correlation);
  RETURN jsonb_build_object('recommendation_id', p_recommendation_id, 'package_id', p_package_id, 'version', p_version, 'option_key', p_option_key, 'option_title', v_opt.title,
    'author_kind', v_kind, 'state', 'proposed', 'digest', v_digest, 'flags', v_basis -> 'flags', 'option_runs', v_basis -> 'runs', 'coverage', v_cov, 'supersedes', v_prev,
    'item_id', v_item, 'item_state', v_state);
END $$ LANGUAGE plpgsql;

/* Close the open notices of a recommendation (reviewed, withdrawn, superseded, set aside). */
CREATE OR REPLACE FUNCTION decision.dsr_close_items(p_tenant uuid, p_domain uuid, p_recommendation uuid, p_actor uuid, p_note text, p_correlation uuid) RETURNS int
SET search_path = decision, executive, pg_catalog, pg_temp AS $$
DECLARE x record; n int := 0;
BEGIN
  FOR x IN UPDATE executive.attention_items i SET state = 'closed', closed_at = clock_timestamp(), closed_by = p_actor, updated_at = clock_timestamp()
            WHERE i.tenant_id = p_tenant AND i.domain_id = p_domain AND i.signal_class = 'decision.recommendation' AND i.subject_id = p_recommendation AND i.state <> 'closed'
            RETURNING i.item_id LOOP
    PERFORM executive.attention_event(x.item_id, p_tenant, p_domain, 'item.closed', p_actor, jsonb_build_object('note', p_note, 'recommendation_id', p_recommendation), p_correlation);
    n := n + 1;
  END LOOP;
  RETURN n;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.dsr_close_items(uuid, uuid, uuid, uuid, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION decision.record_recommendation(uuid,uuid,uuid,uuid,int,text,text,text,date,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.record_recommendation(uuid,uuid,uuid,uuid,int,text,text,text,date,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,uuid,uuid) TO eye_commit;

/* One recommendation as the side-by-side view shows it (invoker; the caller's RLS): the content, the four components, the basis NOW (the
   option's runs' decision use, the live flags), the coverage now, the reviews. */
CREATE OR REPLACE FUNCTION decision.dsr_recommendation_json(r decision.recommendations) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = decision, simulation, prediction, pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object('recommendation_id', r.recommendation_id, 'package_id', r.package_id, 'version', r.version, 'option_key', r.option_key,
    'option_title', (SELECT o.title FROM decision.options o WHERE o.package_id = r.package_id AND o.version = r.version AND o.key = r.option_key),
    'what', r.what, 'for_whom', r.for_whom, 'by_when', to_char(r.by_when, 'YYYY-MM-DD'), 'assumptions', r.assumptions, 'what_could_make_it_wrong', r.what_could_make_it_wrong,
    'missing_evidence', r.missing_evidence,
    'components', jsonb_build_object('value_judgments', r.value_judgments, 'policy_constraints', r.policy_constraints, 'analytical_assumptions', r.analytical_assumptions, 'model_outputs', r.model_outputs),
    'author_kind', r.author_kind, 'author_principal_id', r.author_principal_id, 'state', r.state, 'digest', r.digest, 'recorded_at', r.recorded_at,
    'flags_at_recording', r.flags, 'flags', b.basis -> 'flags', 'option_runs', b.basis -> 'runs', 'coverage_at_recording', r.coverage,
    'coverage', decision.dsr_coverage(r.package_id, r.version, r.option_key),
    'decided_by', r.decided_by, 'decided_at', r.decided_at, 'withdrawn_by', r.withdrawn_by, 'withdrawn_at', r.withdrawn_at, 'withdrawal_reason', r.withdrawal_reason,
    'superseded_by', r.superseded_by, 'superseded_at', r.superseded_at, 'superseded_reason', r.superseded_reason, 'supersedes', r.supersedes,
    'reviews', coalesce((SELECT jsonb_agg(jsonb_build_object('review_id', v.review_id, 'reviewer_principal_id', v.reviewer_principal_id, 'verdict', v.verdict, 'rationale', v.rationale,
                                                            'override', v.override, 'flags_at_review', v.flags_at_review, 'compared', jsonb_array_length(v.comparison), 'reviewed_at', v.reviewed_at)
                                   ORDER BY v.reviewed_at, v.review_id) FROM decision.recommendation_reviews v WHERE v.recommendation_id = r.recommendation_id), '[]'::jsonb))
    FROM (SELECT decision.dsr_option_basis(r.package_id, r.version, r.option_key) AS basis) b
$$;
GRANT EXECUTE ON FUNCTION decision.dsr_recommendation_json(decision.recommendations) TO eye_app, eye_commit;

-- ─────────────────────────────────────────────────────────────────────
-- §R2 REVIEW (decision.recommendation.review) — accept for consideration, decline, request changes
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION decision.review_recommendation(
  p_review_id uuid, p_tenant uuid, p_domain uuid, p_recommendation_id uuid, p_verdict text, p_rationale text, p_override text, p_expected_digest text, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, executive, simulation, prediction, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r decision.recommendations%ROWTYPE; p decision.packages_current%ROWTYPE; v decision.package_versions%ROWTYPE; v_basis jsonb; v_flags jsonb; v_cmp jsonb; v_event text; v_to text; v_ev uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.recommendation.review']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'recommendation rejected (actor): a review is the acting principal''s own' USING ERRCODE = '42501'; END IF;
  IF decision.dsr_principal_kind(p_actor, p_tenant) IS DISTINCT FROM 'human' THEN
    RAISE EXCEPTION 'recommendation rejected (actor): a recommendation is reviewed by a named, active human — an agent records, it never reviews' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO r FROM decision.recommendations x WHERE x.recommendation_id = p_recommendation_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'recommendation rejected (unknown_recommendation): % is not a recommendation of this domain', p_recommendation_id USING ERRCODE = '23503'; END IF;
  IF r.author_principal_id = p_actor THEN
    RAISE EXCEPTION 'recommendation rejected (separation_of_duties): the author of recommendation % does not review it', p_recommendation_id USING ERRCODE = '42501';
  END IF;
  IF r.state <> 'proposed' THEN RAISE EXCEPTION 'recommendation rejected (state): recommendation % is %; a proposed recommendation is reviewed', p_recommendation_id, r.state USING ERRCODE = '22023'; END IF;
  SELECT * INTO p FROM decision.packages_current x WHERE x.package_id = r.package_id;
  SELECT * INTO v FROM decision.package_versions x WHERE x.package_id = r.package_id AND x.version = r.version;
  IF p.state IN ('committed', 'monitoring', 'closed', 'rejected', 'withdrawn') OR v.state IN ('committed', 'rejected', 'superseded') THEN
    RAISE EXCEPTION 'recommendation rejected (state): version % is % (the package is %); the recommendation is no longer reviewed', r.version, v.state, p.state USING ERRCODE = '22023';
  END IF;
  IF p_expected_digest IS NOT NULL AND p_expected_digest IS DISTINCT FROM r.digest THEN
    RAISE EXCEPTION 'recommendation rejected (stale): the recommendation read (%) is not recommendation % now (%); read it again', p_expected_digest, p_recommendation_id, r.digest USING ERRCODE = '22023';
  END IF;
  IF p_verdict IS NULL OR p_verdict NOT IN ('accept_for_consideration', 'decline', 'request_changes') THEN
    RAISE EXCEPTION 'recommendation rejected (verdict): a review accepts for consideration, declines or requests changes (got %)', coalesce(p_verdict, '<none>') USING ERRCODE = '22023';
  END IF;
  IF p_rationale IS NULL OR length(btrim(p_rationale)) NOT BETWEEN 8 AND 4000 THEN RAISE EXCEPTION 'recommendation rejected (rationale): a review states its rationale (8 to 4000 characters)' USING ERRCODE = '22023'; END IF;
  IF p_override IS NOT NULL AND length(btrim(p_override)) NOT BETWEEN 16 AND 2000 THEN RAISE EXCEPTION 'recommendation rejected (override): an override states why the flags do not stand against consideration (16 to 2000 characters)' USING ERRCODE = '22023'; END IF;
  -- the FLAGS as they stand now (§R4 the scenario quality, §R5 the indicators): acceptance needs the reviewer's stated override
  v_basis := decision.dsr_option_basis(r.package_id, r.version, r.option_key);
  v_flags := v_basis -> 'flags';
  IF p_verdict = 'accept_for_consideration' AND jsonb_array_length(v_flags) > 0 AND p_override IS NULL THEN
    RAISE EXCEPTION 'recommendation rejected (quality_flagged): recommendation % stands flagged — %; it is accepted for consideration only with the reviewer''s stated override',
      p_recommendation_id, (SELECT string_agg(f ->> 'detail', '; ') FROM jsonb_array_elements(v_flags) f) USING ERRCODE = '22023';
  END IF;
  -- THE COMPARISON read at review: every other recommendation on the package, AI and human, side by side
  SELECT coalesce(jsonb_agg(jsonb_build_object('recommendation_id', o.recommendation_id, 'version', o.version, 'option_key', o.option_key, 'author_kind', o.author_kind,
                                               'author_principal_id', o.author_principal_id, 'state', o.state, 'what', o.what, 'what_could_make_it_wrong', o.what_could_make_it_wrong,
                                               'flags', jsonb_array_length(o.flags), 'digest', o.digest) ORDER BY o.recorded_at, o.recommendation_id), '[]'::jsonb)
    INTO v_cmp FROM decision.recommendations o WHERE o.package_id = r.package_id AND o.recommendation_id <> r.recommendation_id AND o.state <> 'superseded';
  INSERT INTO decision.recommendation_reviews (review_id, scope, tenant_id, domain_id, recommendation_id, package_id, version, reviewer_principal_id, verdict, rationale, override, flags_at_review,
                                               comparison, recommendation_digest, correlation_id)
  VALUES (p_review_id, 'DOMAIN', p_tenant, p_domain, r.recommendation_id, r.package_id, r.version, p_actor, p_verdict, btrim(p_rationale), nullif(btrim(coalesce(p_override, '')), ''), v_flags,
          v_cmp, r.digest, p_correlation);
  v_to := CASE p_verdict WHEN 'accept_for_consideration' THEN 'accepted_for_consideration' WHEN 'decline' THEN 'declined' ELSE 'proposed' END;
  v_event := CASE p_verdict WHEN 'accept_for_consideration' THEN 'recommendation.accepted_for_consideration' WHEN 'decline' THEN 'recommendation.declined' ELSE 'recommendation.changes_requested' END;
  IF v_to <> 'proposed' THEN
    UPDATE decision.recommendations SET state = v_to, decided_by = p_actor, decided_at = clock_timestamp() WHERE recommendation_id = r.recommendation_id;
    PERFORM decision.dsr_close_items(p_tenant, p_domain, r.recommendation_id, p_actor, format('reviewed: %s', replace(p_verdict, '_', ' ')), p_correlation);
  END IF;
  v_ev := decision.dsr_event(p_tenant, p_domain, r.package_id, r.version, r.recommendation_id, NULL, v_event, p_actor,
    jsonb_build_object('review_id', p_review_id, 'verdict', p_verdict, 'flags', jsonb_array_length(v_flags), 'override', p_override IS NOT NULL, 'compared', jsonb_array_length(v_cmp)), p_correlation);
  RETURN jsonb_build_object('review_id', p_review_id, 'recommendation_id', r.recommendation_id, 'verdict', p_verdict, 'state', v_to, 'flags_at_review', v_flags, 'override', nullif(btrim(coalesce(p_override, '')), ''),
                            'comparison', v_cmp, 'event_id', v_ev);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.review_recommendation(uuid,uuid,uuid,uuid,text,text,text,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.review_recommendation(uuid,uuid,uuid,uuid,text,text,text,text,uuid,uuid) TO eye_commit;

-- ─────────────────────────────────────────────────────────────────────
-- §R1 WITHDRAW (decision.recommendation.withdraw) — its human author, or the package owner (an agent's recommendation)
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION decision.withdraw_recommendation(p_tenant uuid, p_domain uuid, p_recommendation_id uuid, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r decision.recommendations%ROWTYPE; v_owner uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.recommendation.withdraw']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'recommendation rejected (actor): a withdrawal is the acting principal''s own' USING ERRCODE = '42501'; END IF;
  IF decision.dsr_principal_kind(p_actor, p_tenant) IS DISTINCT FROM 'human' THEN RAISE EXCEPTION 'recommendation rejected (actor): a named, active human withdraws a recommendation' USING ERRCODE = '42501'; END IF;
  SELECT * INTO r FROM decision.recommendations x WHERE x.recommendation_id = p_recommendation_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'recommendation rejected (unknown_recommendation): % is not a recommendation of this domain', p_recommendation_id USING ERRCODE = '23503'; END IF;
  SELECT owner_principal_id INTO v_owner FROM decision.packages_current WHERE package_id = r.package_id;
  IF p_actor <> r.author_principal_id AND p_actor <> v_owner THEN
    RAISE EXCEPTION 'recommendation rejected (authority): recommendation % is withdrawn by its author or by the package owner', p_recommendation_id USING ERRCODE = '42501';
  END IF;
  IF r.state NOT IN ('proposed', 'accepted_for_consideration') THEN RAISE EXCEPTION 'recommendation rejected (state): recommendation % is already %', p_recommendation_id, r.state USING ERRCODE = '22023'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 8 AND 2000 THEN RAISE EXCEPTION 'recommendation rejected (reason): a withdrawal states its reason (8 to 2000 characters)' USING ERRCODE = '22023'; END IF;
  UPDATE decision.recommendations SET state = 'withdrawn', withdrawn_by = p_actor, withdrawn_at = clock_timestamp(), withdrawal_reason = btrim(p_reason) WHERE recommendation_id = r.recommendation_id;
  PERFORM decision.dsr_close_items(p_tenant, p_domain, r.recommendation_id, p_actor, 'the recommendation was withdrawn', p_correlation);
  PERFORM decision.dsr_event(p_tenant, p_domain, r.package_id, r.version, r.recommendation_id, NULL, 'recommendation.withdrawn', p_actor, jsonb_build_object('reason', btrim(p_reason), 'from_state', r.state), p_correlation);
  RETURN jsonb_build_object('recommendation_id', r.recommendation_id, 'state', 'withdrawn', 'from_state', r.state);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.withdraw_recommendation(uuid,uuid,uuid,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.withdraw_recommendation(uuid,uuid,uuid,text,uuid,uuid) TO eye_commit;

-- ─────────────────────────────────────────────────────────────────────
-- §R3 ATTEST (decision.incomplete.attest) — the owner attests the named gaps; a second human acknowledges
-- ─────────────────────────────────────────────────────────────────────
/* p_act `attest`: the package owner, on a DRAFT version that fails the completeness, names EVERY gap the read finds (by its key) with a
   reason; a live attestation of the version is superseded. p_act `acknowledge` (p_attestation_id names it): a second named human — never
   the attester — acknowledges with a note while the attestation still names every gap (stale otherwise: attest again); the version's live
   recommendations are SET ASIDE (superseded: human-led analysis without recommendation). */
CREATE OR REPLACE FUNCTION decision.attest_incomplete_package(
  p_attestation_id uuid, p_tenant uuid, p_domain uuid, p_package_id uuid, p_version int, p_act text, p_missing jsonb, p_reason text, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, executive, simulation, prediction, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE p decision.packages_current%ROWTYPE; v decision.package_versions%ROWTYPE; a decision.incomplete_package_attestations%ROWTYPE; c jsonb; x jsonb; i int := 0; v_keys text[];
        v_named jsonb := '[]'::jsonb; v_unnamed jsonb; v_unknown jsonb; v_prev uuid; v_aside jsonb := '[]'::jsonb; rr record;
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.incomplete.attest']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'incomplete package rejected (actor): an attestation is the acting principal''s own' USING ERRCODE = '42501'; END IF;
  IF decision.dsr_principal_kind(p_actor, p_tenant) IS DISTINCT FROM 'human' THEN RAISE EXCEPTION 'incomplete package rejected (actor): the human-led mode is attested and acknowledged by named, active humans' USING ERRCODE = '42501'; END IF;
  IF p_act IS NULL OR p_act NOT IN ('attest', 'acknowledge') THEN RAISE EXCEPTION 'incomplete package rejected (act): attest or acknowledge (got %)', coalesce(p_act, '<none>') USING ERRCODE = '22023'; END IF;
  IF p_act = 'acknowledge' THEN
    SELECT * INTO a FROM decision.incomplete_package_attestations x WHERE x.attestation_id = p_attestation_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'incomplete package rejected (unknown_attestation): % is not an attestation of this domain', p_attestation_id USING ERRCODE = '23503'; END IF;
    p_package_id := a.package_id; p_version := a.version;
  END IF;
  SELECT * INTO p FROM decision.packages_current x WHERE x.package_id = p_package_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'incomplete package rejected (unknown_package): % is not a decision package of this domain', p_package_id USING ERRCODE = '23503'; END IF;
  SELECT * INTO v FROM decision.package_versions x WHERE x.package_id = p_package_id AND x.version = p_version;
  IF NOT FOUND THEN RAISE EXCEPTION 'incomplete package rejected (unknown_version): package % has no version %', p_package_id, p_version USING ERRCODE = '23503'; END IF;
  IF v.state <> 'draft' THEN RAISE EXCEPTION 'incomplete package rejected (state): version % is %; the human-led mode is declared on a draft, before it is proposed', p_version, v.state USING ERRCODE = '22023'; END IF;
  c := decision.recommendation_completeness(p_package_id, p_version);
  v_keys := ARRAY(SELECT g ->> 'key' FROM jsonb_array_elements(c -> 'gaps') g);
  IF p_act = 'attest' THEN
    IF p_actor <> p.owner_principal_id THEN RAISE EXCEPTION 'incomplete package rejected (authority): the package owner attests the human-led mode of its own package' USING ERRCODE = '42501'; END IF;
    IF (c ->> 'complete')::boolean THEN RAISE EXCEPTION 'incomplete package rejected (state): version % is complete — no gap stands; nothing to attest', p_version USING ERRCODE = '22023'; END IF;
    IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 16 AND 2000 THEN RAISE EXCEPTION 'incomplete package rejected (reason): the attestation states why the decision proceeds human-led (16 to 2000 characters)' USING ERRCODE = '22023'; END IF;
    IF p_missing IS NULL OR jsonb_typeof(p_missing) <> 'array' OR jsonb_array_length(p_missing) NOT BETWEEN 1 AND 100 THEN
      RAISE EXCEPTION 'incomplete package rejected (missing): the attestation names the missing items [{category, key, note}]' USING ERRCODE = '22023';
    END IF;
    FOR x IN SELECT y FROM jsonb_array_elements(p_missing) y LOOP
      IF jsonb_typeof(x) <> 'object' OR coalesce(length(x ->> 'key'), 0) = 0 THEN RAISE EXCEPTION 'incomplete package rejected (missing[%]): each item names a gap''s key', i USING ERRCODE = '22023'; END IF;
      v_named := v_named || jsonb_build_object('category', coalesce((SELECT g ->> 'category' FROM jsonb_array_elements(c -> 'gaps') g WHERE g ->> 'key' = x ->> 'key'), x ->> 'category'),
                                               'key', x ->> 'key', 'note', nullif(btrim(coalesce(x ->> 'note', '')), ''));
      i := i + 1;
    END LOOP;
    SELECT coalesce(jsonb_agg(m ->> 'key'), '[]'::jsonb) INTO v_unknown FROM jsonb_array_elements(v_named) m WHERE NOT ((m ->> 'key') = ANY (v_keys));
    IF jsonb_array_length(v_unknown) > 0 THEN RAISE EXCEPTION 'incomplete package rejected (missing): % is not a gap of version % (the gaps: %)', v_unknown, p_version, to_jsonb(v_keys) USING ERRCODE = '22023'; END IF;
    SELECT coalesce(jsonb_agg(g ->> 'key'), '[]'::jsonb) INTO v_unnamed FROM jsonb_array_elements(c -> 'gaps') g WHERE NOT (v_named @> jsonb_build_array(jsonb_build_object('key', g ->> 'key')));
    IF jsonb_array_length(v_unnamed) > 0 THEN RAISE EXCEPTION 'incomplete package rejected (coverage): the attestation names every gap — unnamed: %', v_unnamed USING ERRCODE = '22023'; END IF;
    SELECT t.attestation_id INTO v_prev FROM decision.incomplete_package_attestations t WHERE t.package_id = p_package_id AND t.version = p_version AND t.state IN ('attested', 'acknowledged') FOR UPDATE;
    IF v_prev IS NOT NULL THEN
      UPDATE decision.incomplete_package_attestations SET state = 'superseded', superseded_by = p_attestation_id, superseded_at = clock_timestamp() WHERE attestation_id = v_prev;
      PERFORM decision.dsr_event(p_tenant, p_domain, p_package_id, p_version, NULL, v_prev, 'incomplete.superseded', p_actor, jsonb_build_object('superseded_by', p_attestation_id), p_correlation);
    END IF;
    INSERT INTO decision.incomplete_package_attestations (attestation_id, scope, tenant_id, domain_id, package_id, version, missing, gaps_at_attestation, reason, attested_by, correlation_id)
    VALUES (p_attestation_id, 'DOMAIN', p_tenant, p_domain, p_package_id, p_version, v_named, c -> 'gaps', btrim(p_reason), p_actor, p_correlation);
    PERFORM decision.dsr_event(p_tenant, p_domain, p_package_id, p_version, NULL, p_attestation_id, 'incomplete.attested', p_actor,
      jsonb_build_object('gaps', jsonb_array_length(c -> 'gaps'), 'categories', (SELECT jsonb_agg(DISTINCT g ->> 'category') FROM jsonb_array_elements(c -> 'gaps') g), 'supersedes', v_prev), p_correlation);
    RETURN jsonb_build_object('attestation_id', p_attestation_id, 'package_id', p_package_id, 'version', p_version, 'state', 'attested', 'missing', v_named, 'supersedes', v_prev,
                              'awaits', 'a second named human''s acknowledgement');
  END IF;
  -- acknowledge
  IF a.state <> 'attested' THEN RAISE EXCEPTION 'incomplete package rejected (state): attestation % is %; an attested one is acknowledged', a.attestation_id, a.state USING ERRCODE = '22023'; END IF;
  IF p_actor = a.attested_by THEN RAISE EXCEPTION 'incomplete package rejected (separation_of_duties): the attester does not acknowledge its own attestation; a second human does' USING ERRCODE = '42501'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 8 AND 2000 THEN RAISE EXCEPTION 'incomplete package rejected (reason): the acknowledgement states its note (8 to 2000 characters)' USING ERRCODE = '22023'; END IF;
  SELECT coalesce(jsonb_agg(g ->> 'key'), '[]'::jsonb) INTO v_unnamed FROM jsonb_array_elements(c -> 'gaps') g
   WHERE NOT (a.missing @> jsonb_build_array(jsonb_build_object('key', g ->> 'key')));
  IF jsonb_array_length(v_unnamed) > 0 THEN
    RAISE EXCEPTION 'incomplete package rejected (stale): version % moved since attestation % — the gaps % are not named; the owner attests again', p_version, a.attestation_id, v_unnamed USING ERRCODE = '22023';
  END IF;
  -- the version's live recommendations are SET ASIDE: human-led analysis without recommendation
  FOR rr IN SELECT x.recommendation_id, x.state FROM decision.recommendations x WHERE x.package_id = p_package_id AND x.version = p_version AND x.state IN ('proposed', 'accepted_for_consideration')
             ORDER BY x.recorded_at FOR UPDATE LOOP
    UPDATE decision.recommendations SET state = 'superseded', superseded_at = clock_timestamp(),
           superseded_reason = format('set aside: version %s proceeds human-led without recommendation (attestation %s)', p_version, a.attestation_id) WHERE recommendation_id = rr.recommendation_id;
    PERFORM decision.dsr_close_items(p_tenant, p_domain, rr.recommendation_id, p_actor, 'set aside: the version proceeds human-led', p_correlation);
    PERFORM decision.dsr_event(p_tenant, p_domain, p_package_id, p_version, rr.recommendation_id, NULL, 'recommendation.set_aside', p_actor, jsonb_build_object('attestation_id', a.attestation_id, 'from_state', rr.state), p_correlation);
    v_aside := v_aside || jsonb_build_object('recommendation_id', rr.recommendation_id, 'from_state', rr.state);
  END LOOP;
  UPDATE decision.incomplete_package_attestations SET state = 'acknowledged', acknowledged_by = p_actor, acknowledged_at = clock_timestamp(), acknowledgement_note = btrim(p_reason), set_aside = v_aside
   WHERE attestation_id = a.attestation_id;
  PERFORM decision.dsr_event(p_tenant, p_domain, p_package_id, p_version, NULL, a.attestation_id, 'incomplete.acknowledged', p_actor, jsonb_build_object('set_aside', v_aside), p_correlation);
  RETURN jsonb_build_object('attestation_id', a.attestation_id, 'package_id', p_package_id, 'version', p_version, 'state', 'acknowledged', 'missing', a.missing, 'set_aside', v_aside,
                            'mode', 'human_led');
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.attest_incomplete_package(uuid,uuid,uuid,uuid,int,text,jsonb,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.attest_incomplete_package(uuid,uuid,uuid,uuid,int,text,jsonb,text,uuid,uuid) TO eye_commit;

-- ─────────────────────────────────────────────────────────────────────
-- THE READ: decision.package_recommendations(pkg) — the rationale view (HX-08, WS-15), side by side
-- ─────────────────────────────────────────────────────────────────────
/* The package's recommendations SIDE BY SIDE (an invoker read under the caller's RLS; NULL when the package is not visible): every
   recommendation (newest version first; AI and human together, each with what could make it wrong, its flags now, its coverage now, its
   reviews), the current version's live recommendations grouped by author kind, the current version's completeness, the attestations. */
CREATE OR REPLACE FUNCTION decision.package_recommendations(p_package_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = decision, simulation, prediction, pg_catalog, pg_temp AS $$
DECLARE p decision.packages_current%ROWTYPE; v_recs jsonb; v_ver int;
BEGIN
  SELECT * INTO p FROM decision.packages_current x WHERE x.package_id = p_package_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  v_ver := coalesce(p.current_version, (SELECT max(version) FROM decision.package_versions WHERE package_id = p_package_id));
  SELECT coalesce(jsonb_agg(decision.dsr_recommendation_json(r) ORDER BY r.version DESC, r.recorded_at, r.recommendation_id), '[]'::jsonb) INTO v_recs
    FROM decision.recommendations r WHERE r.package_id = p_package_id;
  RETURN jsonb_build_object('package_id', p.package_id, 'title', p.title, 'statement', p.statement, 'owner_principal_id', p.owner_principal_id, 'state', p.state,
    'current_version', v_ver, 'committed_version', p.committed_version,
    'versions', coalesce((SELECT jsonb_agg(jsonb_build_object('version', pv.version, 'state', pv.state, 'choice_option', pv.choice ->> 'option_key',
                                                              'options', coalesce((SELECT jsonb_agg(jsonb_build_object('key', o.key, 'title', o.title, 'kind', o.kind, 'simulated', o.simulated) ORDER BY o.key)
                                                                                   FROM decision.options o WHERE o.package_id = pv.package_id AND o.version = pv.version), '[]'::jsonb)) ORDER BY pv.version DESC)
                          FROM decision.package_versions pv WHERE pv.package_id = p_package_id), '[]'::jsonb),
    'recommendations', v_recs,
    'side_by_side', jsonb_build_object('version', v_ver,
       'agent', coalesce((SELECT jsonb_agg(x -> 'recommendation_id') FROM jsonb_array_elements(v_recs) x WHERE (x ->> 'version')::int = v_ver AND x ->> 'author_kind' = 'agent' AND x ->> 'state' IN ('proposed', 'accepted_for_consideration')), '[]'::jsonb),
       'human', coalesce((SELECT jsonb_agg(x -> 'recommendation_id') FROM jsonb_array_elements(v_recs) x WHERE (x ->> 'version')::int = v_ver AND x ->> 'author_kind' = 'human' AND x ->> 'state' IN ('proposed', 'accepted_for_consideration')), '[]'::jsonb)),
    'completeness', CASE WHEN v_ver IS NULL THEN NULL ELSE decision.recommendation_completeness(p_package_id, v_ver) END,
    'attestations', coalesce((SELECT jsonb_agg(jsonb_build_object('attestation_id', t.attestation_id, 'version', t.version, 'state', t.state, 'missing', t.missing, 'reason', t.reason,
                                                                   'attested_by', t.attested_by, 'attested_at', t.attested_at, 'acknowledged_by', t.acknowledged_by, 'acknowledged_at', t.acknowledged_at,
                                                                   'acknowledgement_note', t.acknowledgement_note, 'set_aside', t.set_aside, 'superseded_by', t.superseded_by) ORDER BY t.attested_at DESC)
                              FROM decision.incomplete_package_attestations t WHERE t.package_id = p_package_id), '[]'::jsonb),
    'events', coalesce((SELECT jsonb_agg(jsonb_build_object('event', e.event, 'version', e.version, 'recommendation_id', e.recommendation_id, 'attestation_id', e.attestation_id,
                                                            'actor_principal_id', e.actor_principal_id, 'occurred_at', e.occurred_at) ORDER BY e.occurred_at, e.event_id)
                        FROM decision.recommendation_events e WHERE e.package_id = p_package_id), '[]'::jsonb));
END $$;
GRANT EXECUTE ON FUNCTION decision.package_recommendations(uuid) TO eye_app, eye_commit;

/* The packages of the domain with recommendations or a live attestation (the page's list), newest first. */
CREATE OR REPLACE FUNCTION decision.recommendation_packages(p_limit int) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = decision, pg_catalog, pg_temp AS $$
  SELECT coalesce(jsonb_agg(x ORDER BY x ->> 'last_at' DESC), '[]'::jsonb) FROM (
    SELECT jsonb_build_object('package_id', p.package_id, 'title', p.title, 'state', p.state, 'current_version', p.current_version, 'owner_principal_id', p.owner_principal_id,
             'recommendations', (SELECT count(*) FROM decision.recommendations r WHERE r.package_id = p.package_id),
             'live', (SELECT count(*) FROM decision.recommendations r WHERE r.package_id = p.package_id AND r.state IN ('proposed', 'accepted_for_consideration')),
             'agent', (SELECT count(*) FROM decision.recommendations r WHERE r.package_id = p.package_id AND r.author_kind = 'agent' AND r.state IN ('proposed', 'accepted_for_consideration')),
             'last_at', greatest((SELECT max(e.occurred_at) FROM decision.recommendation_events e WHERE e.package_id = p.package_id), p.declared_at)) AS x
      FROM decision.packages_current p
     WHERE p.state NOT IN ('withdrawn')
     ORDER BY greatest((SELECT max(e.occurred_at) FROM decision.recommendation_events e WHERE e.package_id = p.package_id), p.declared_at) DESC
     LIMIT greatest(1, least(coalesce(p_limit, 50), 200))) q
$$;
GRANT EXECUTE ON FUNCTION decision.recommendation_packages(int) TO eye_app, eye_commit;
