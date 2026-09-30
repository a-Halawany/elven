-- ═════════════════════════════════════════════════════════════════════
-- section `quality` (§Q) — the part-local file 0097_b27_x_quality.sql (combined into 0097 at integration after §0 and §A)
-- ═════════════════════════════════════════════════════════════════════
-- 0097 §Q — CP-6 B27 PART Q (2026-09-30): SCENARIO QUALITY AND COHERENCE v2 (F-P4-09; L7-C06, L7-I04, V03-T-142/-143/-334/-341,
-- ES-37-007/-008/-009, V04-T-031/-032, AI-49-003/-004, PR-33-005, FEX-12). Built on the prelude (§0: prediction.branch_live, the widened
-- scenario event vocabulary, the attention class scenario.quality) and nothing else of B27: §A's elements and assumption register and §S's
-- set plurality policies are read by to_regclass (dynamic SQL inside an exception block), so the part stands alone.
--
--   Q.1 THE RULES: prediction.scenario_quality_rules (versioned; the v1 row inserted here) — SEPARATE from the coherence rule v1
--       (prediction.scenario_coherence_rule(), 0081), which is NOT changed, reordered or extended: its findings arrays stay as pinned.
--   Q.2 THE RECORD: prediction.scenario_quality_evaluations (append-only; trigger declare | branch | operator | tick; the measures, the
--       findings naming branches, the outcome, the prior outcome, whether the failure is NEW, the attention item raised),
--       prediction.frequency_probability_maps (the FREQUENCY-TO-PROBABILITY mapping object deferred since B21: named, versioned, owned; a
--       re-declaration of a name is its next version and supersedes the prior), prediction.branch_probabilities (append-only: a `set` row
--       or a `withdrawn` row; the view prediction.branch_probabilities_current names each branch's standing probability).
--   Q.3 THE MEASURES (pure reads; prediction.scenario_quality_compute): DISTINCTIVENESS (indistinct_branches: two live branches whose
--       assumptions, elements, indicator and divergence are the same and whose statements' normalised token sets overlap at or above the
--       rule's threshold — the wording is all that differs), COLLAPSE (collapse_to_one_forecast: every live non-baseline branch — at least two —
--       rests on one indicator threshold), PROHIBITED CONTRADICTION (a branch asserting X and not-X among its assumptions, or an antonym
--       pair the rule declares, or contradicting a scenario-level element), TEMPORAL ORDERING of elements with timing attributes
--       (element_temporal_order), COVERAGE (baseline / adverse / stress, and a set's plurality requirement when §S names one), BIAS
--       (all adverse / all benign), the QUALITY INDICATORS (assumption coverage, branch diversity, INDICATOR FRESHNESS — missing and stale
--       named —, signpost discrimination, review timeliness).
--   Q.4 THE PORTS: evaluate_scenario_quality (prediction.scenario.quality.evaluate — a person's act), sweep_scenario_quality
--       (executive.attention.tick — the step `scenario-quality`, order 68: re-evaluates an ACTIVE scenario already evaluated once whose
--       version changed or whose indicator freshness changed; a NEW failure raises `scenario.quality` to the owner once), declare_frequency_map
--       (prediction.scenario.probability.map), set_branch_probability (prediction.scenario.probability.set — a named human, a method and its
--       basis; never from narrative text), withdraw_branch_probability (prediction.scenario.probability.withdraw).
--   Q.5 THE READ: prediction.scenario_quality(scenario_id) (an invoker read under the caller's RLS): the latest evaluation, the measures AS OF
--       NOW, the decision-activity (FEX-12: a failed coherence check OR a failed quality evaluation reads NOT decision-active), the standing
--       probabilities with method and basis and the live lows' sum, the domain's maps.
--   THE FRESHNESS RULE (stated): an indicator's cadence is consecutive_days × its series' seasonality_days (1 when the series is not
--   registered); it is STALE when the database's today minus its last observation date exceeds cadence + the rule's freshness_grace_days
--   (v1: 7), or — never observed — when it was defined longer ago than that; AWAITING when never observed and defined within it; MISSING when
--   a live branch of a kind that needs a signpost (every kind but baseline and counterfactual) names no indicator, or names one that is
--   retired or expired. A missing or stale indicator FAILS the evaluation (the branch cannot be watched).
--   Refusal families: `scenario quality rejected (<class>)`, `branch probability rejected (<class>)`, `frequency map rejected (<class>)` —
--   actor | authority → 403, unknown_* → 404, state → 409, the rest → 422. Every figure a harness seeds is SYNTHETIC. Forward-only.

-- ═════════════════════════════════════════════════════════════════════
-- §Q.1 THE RULES
-- ═════════════════════════════════════════════════════════════════════
CREATE TABLE prediction.scenario_quality_rules (
  version      text PRIMARY KEY CHECK (version ~ '^[0-9]+$'),
  rules        jsonb NOT NULL CHECK (jsonb_typeof(rules) = 'object'),
  declared_at  timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TRIGGER psq_rules_append_only BEFORE UPDATE OR DELETE ON prediction.scenario_quality_rules FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE prediction.scenario_quality_rules IS 'B27 (0097 §Q): the versioned scenario QUALITY rules (F-P4-09) — separate from the coherence rule v1 (0081), which is not changed; append-only; the highest version is in force.';
INSERT INTO prediction.scenario_quality_rules (version, rules) VALUES ('1', $json${
  "version": "1",
  "fail": ["indistinct_branches", "collapse_to_one_forecast", "prohibited_contradiction", "element_temporal_order", "indicator_missing", "indicator_stale"],
  "note": ["coverage", "bias", "signpost_shared", "review_overdue"],
  "params": {
    "wording_overlap_threshold": 0.75,
    "stop_words": ["a", "an", "the", "of", "for", "to", "in", "on", "at", "by", "with", "and", "or", "is", "are", "be", "been", "will", "would", "shall", "it", "its", "this", "that", "as", "over", "from", "into", "than", "then", "there", "their", "they", "do", "does", "did", "has", "have", "had", "so"],
    "negations": ["not", "no", "never", "none", "without", "cannot"],
    "antonyms": [["open", "closed"], ["open", "close"], ["rise", "fall"], ["above", "below"], ["increase", "decrease"], ["halt", "resume"], ["expand", "contract"], ["gain", "lose"]],
    "freshness_grace_days": 7,
    "indicator_required_kinds": ["upside", "downside", "disruption", "stress", "adversarial", "user-defined"],
    "coverage": {"baseline": ["baseline"], "adverse": ["downside", "disruption", "stress", "adversarial"], "stress": ["stress"]},
    "bias": {"adverse": ["downside", "disruption", "stress", "adversarial"], "benign": ["upside"], "min_branches": 2}
  },
  "statement": "Wording is normalised (lower case, punctuation removed, stop words dropped, the endings -ing/-ed/-s stripped from words longer than 5/4/3 letters) and two statements overlap by the Jaccard index of their token sets. A contradiction is two statements whose tokens, negations removed, are equal and whose negation counts differ in parity, or whose tokens differ by exactly one declared antonym pair."
}$json$::jsonb);
-- A rule is not tenant data, but every prediction table is under FORCED row-level security (0058's idiom for the kind vocabulary): a shared read.
REVOKE ALL ON prediction.scenario_quality_rules FROM PUBLIC;
ALTER TABLE prediction.scenario_quality_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE prediction.scenario_quality_rules FORCE ROW LEVEL SECURITY;
CREATE POLICY scenario_quality_rules_shared ON prediction.scenario_quality_rules FOR SELECT USING (true);

/* The rule in force (the highest version). */
CREATE OR REPLACE FUNCTION prediction.scenario_quality_rule() RETURNS jsonb
LANGUAGE sql STABLE SET search_path = prediction, pg_catalog, pg_temp AS $$
  SELECT r.rules || jsonb_build_object('version', r.version) FROM prediction.scenario_quality_rules r ORDER BY r.version::int DESC LIMIT 1 $$;
GRANT SELECT ON prediction.scenario_quality_rules TO eye_app, eye_commit;
GRANT EXECUTE ON FUNCTION prediction.scenario_quality_rule() TO eye_app, eye_commit;

-- ═════════════════════════════════════════════════════════════════════
-- §Q.2 THE RECORD
-- ═════════════════════════════════════════════════════════════════════
CREATE TABLE prediction.scenario_quality_evaluations (
  evaluation_id     uuid PRIMARY KEY,
  scope             text NOT NULL,
  tenant_id         uuid NOT NULL,
  domain_id         uuid NOT NULL,
  scenario_id       uuid NOT NULL REFERENCES prediction.scenarios_current (scenario_id),
  scenario_version  int,
  rule_version      text NOT NULL,
  trigger           text NOT NULL CHECK (trigger IN ('declare', 'branch', 'operator', 'tick')),
  measures          jsonb NOT NULL CHECK (jsonb_typeof(measures) = 'object'),
  findings          jsonb NOT NULL CHECK (jsonb_typeof(findings) = 'array'),     -- [{rule, outcome fail|note, branch_ids, detail}]
  outcome           text NOT NULL CHECK (outcome IN ('passed', 'failed')),
  prior_outcome     text CHECK (prior_outcome IS NULL OR prior_outcome IN ('passed', 'failed')),
  fingerprint       text[] NOT NULL DEFAULT '{}',                                -- the failing (rule:branches) set, sorted
  freshness_key     text[] NOT NULL DEFAULT '{}',                                -- the branches' indicator states, sorted (the tick's change test)
  new_failure       boolean NOT NULL,
  attention_item_id uuid,
  evaluated_by      uuid NOT NULL,
  evaluated_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id    uuid NOT NULL,
  CONSTRAINT psq_eval_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT psq_eval_new_failure CHECK (NOT new_failure OR outcome = 'failed')
);
CREATE INDEX psq_eval_scenario ON prediction.scenario_quality_evaluations (scenario_id, evaluated_at DESC);
CREATE TRIGGER psq_eval_append_only BEFORE UPDATE OR DELETE ON prediction.scenario_quality_evaluations FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE prediction.scenario_quality_evaluations IS 'B27 (0097 §Q; F-P4-09): every QUALITY evaluation of a scenario under a quality rule version — the measures, the findings naming branches, the outcome; append-only; separate from scenario_coherence_checks (v1, pinned). A failed evaluation makes the scenario not decision-active (FEX-12).';

CREATE TABLE prediction.frequency_probability_maps (
  map_id             uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  name               text NOT NULL CHECK (length(btrim(name)) BETWEEN 3 AND 128),
  version            int NOT NULL CHECK (version >= 1),
  bands              jsonb NOT NULL CHECK (jsonb_typeof(bands) = 'array' AND jsonb_array_length(bands) >= 1),
  horizon            text NOT NULL CHECK (length(btrim(horizon)) BETWEEN 2 AND 64),   -- the window the probability speaks of ('the next 12 months')
  owner_principal_id uuid NOT NULL,
  state              text NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'superseded')),
  supersedes         uuid REFERENCES prediction.frequency_probability_maps (map_id),
  superseded_at      timestamptz,
  declared_by        uuid NOT NULL,
  declared_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT psq_fpm_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT psq_fpm_version UNIQUE (tenant_id, domain_id, name, version),
  CONSTRAINT psq_fpm_superseded_bound CHECK ((state = 'superseded') = (superseded_at IS NOT NULL))
);
/* A map version is IMMUTABLE: its bands, owner and name never change; only active → superseded (once) when the next version is declared. */
CREATE OR REPLACE FUNCTION prediction.psq_fpm_forward() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'frequency map rejected (state): a map version is never deleted' USING ERRCODE = '22023'; END IF;
  IF (to_jsonb(NEW) - 'state' - 'superseded_at') IS DISTINCT FROM (to_jsonb(OLD) - 'state' - 'superseded_at') OR OLD.state <> 'active' OR NEW.state <> 'superseded' THEN
    RAISE EXCEPTION 'frequency map rejected (state): a map version is immutable; only active → superseded by its next version' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER psq_fpm_forward BEFORE UPDATE OR DELETE ON prediction.frequency_probability_maps FOR EACH ROW EXECUTE FUNCTION prediction.psq_fpm_forward();
CREATE INDEX psq_fpm_name ON prediction.frequency_probability_maps (tenant_id, domain_id, name, version DESC);
COMMENT ON TABLE prediction.frequency_probability_maps IS 'B27 (0097 §Q; deferred since B21): the FREQUENCY-TO-PROBABILITY mapping object — named, versioned, owned by a named human; bands [{frequency_label, min_per_year, max_per_year (null = unbounded), probability_low, probability_high}], contiguous, ascending, the probabilities non-decreasing; the next version supersedes the prior.';

CREATE TABLE prediction.branch_probabilities (
  probability_id     uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  scenario_id        uuid NOT NULL REFERENCES prediction.scenarios_current (scenario_id),
  branch_id          uuid NOT NULL REFERENCES prediction.branches_current (branch_id),
  action             text NOT NULL CHECK (action IN ('set', 'withdrawn')),
  probability_low    numeric CHECK (probability_low IS NULL OR probability_low BETWEEN 0 AND 1),
  probability_high   numeric CHECK (probability_high IS NULL OR probability_high BETWEEN 0 AND 1),
  method             text CHECK (method IS NULL OR method IN ('frequency_map', 'expert_elicitation', 'model')),
  map_id             uuid REFERENCES prediction.frequency_probability_maps (map_id),
  basis              jsonb CHECK (basis IS NULL OR jsonb_typeof(basis) = 'object'),
  withdraws          uuid REFERENCES prediction.branch_probabilities (probability_id),
  withdrawal_reason  text,
  actor_principal_id uuid NOT NULL,          -- the named human who set (or withdrew) it
  recorded_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT psq_bp_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT psq_bp_set_bound CHECK (action <> 'set' OR (probability_low IS NOT NULL AND probability_high IS NOT NULL AND probability_low <= probability_high AND method IS NOT NULL AND basis IS NOT NULL
                                                         AND withdraws IS NULL AND withdrawal_reason IS NULL AND ((method = 'frequency_map') = (map_id IS NOT NULL)))),
  CONSTRAINT psq_bp_withdrawn_bound CHECK (action <> 'withdrawn' OR (withdraws IS NOT NULL AND withdrawal_reason IS NOT NULL AND length(btrim(withdrawal_reason)) >= 8
                                                                     AND probability_low IS NULL AND probability_high IS NULL AND method IS NULL AND basis IS NULL AND map_id IS NULL))
);
CREATE INDEX psq_bp_branch ON prediction.branch_probabilities (branch_id, recorded_at DESC);
CREATE INDEX psq_bp_scenario ON prediction.branch_probabilities (scenario_id, recorded_at DESC);
CREATE TRIGGER psq_bp_append_only BEFORE UPDATE OR DELETE ON prediction.branch_probabilities FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE prediction.branch_probabilities IS 'B27 (0097 §Q; F-P4-09): SEPARATELY GOVERNED branch probabilities — a band set by a named human with a method (frequency_map | expert_elicitation | model) and its basis, never derived from narrative text; append-only (a set row, or a withdrawn row naming the set row it withdraws, with a reason). The standing one: prediction.branch_probabilities_current.';

-- RLS and grants (the 0081 loop idiom; the 0089 prediction_isolation policy text; the ports write)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['scenario_quality_evaluations', 'frequency_probability_maps', 'branch_probabilities'] LOOP
    EXECUTE format('REVOKE ALL ON prediction.%I FROM PUBLIC', t);
    EXECUTE format('ALTER TABLE prediction.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE prediction.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY prediction_isolation ON prediction.%I USING (tenant_id = public.eye_tenant() AND (public.eye_scope() = ''TENANT'' OR domain_id = public.eye_domain()))', t);
    EXECUTE format('GRANT SELECT ON prediction.%I TO eye_app, eye_commit', t);
  END LOOP;
END $$;

/* The STANDING probability of each branch: its latest row, when that row is a `set` (a later `withdrawn` row ends it). Under the caller's RLS. */
CREATE VIEW prediction.branch_probabilities_current WITH (security_invoker = true) AS
  SELECT x.probability_id, x.scope, x.tenant_id, x.domain_id, x.scenario_id, x.branch_id, x.probability_low, x.probability_high, x.method, x.map_id, x.basis,
         x.actor_principal_id AS set_by, x.recorded_at AS set_at, x.correlation_id
    FROM (SELECT DISTINCT ON (p.branch_id) p.* FROM prediction.branch_probabilities p ORDER BY p.branch_id, p.recorded_at DESC, p.probability_id DESC) x
   WHERE x.action = 'set';
GRANT SELECT ON prediction.branch_probabilities_current TO eye_app, eye_commit;

-- ═════════════════════════════════════════════════════════════════════
-- §Q.3 THE MEASURES (pure reads; no port)
-- ═════════════════════════════════════════════════════════════════════
/* A statement's words, cleaned: lower case; won't / can't / n't opened into will not / cannot / not (the apostrophe straight or curved);
   anything but letters, digits and spaces becomes a space. */
CREATE OR REPLACE FUNCTION prediction.psq_clean(p_text text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT regexp_replace(replace(replace(replace(translate(lower(coalesce(p_text, '')), '’', ''''), 'won''t', 'will not'), 'can''t', 'cannot'), 'n''t', ' not'), '[^a-z0-9 ]+', ' ', 'g') $$;
GRANT EXECUTE ON FUNCTION prediction.psq_clean(text) TO eye_app, eye_commit;

/* A statement's normalised TOKENS under the rule (sorted, distinct): psq_clean (lower case, the negating contractions opened, punctuation removed); stop words dropped;
   -ing / -ed / -s stripped from words longer than 5 / 4 / 3 letters. With p_keep_negations false the negation words are dropped too. */
CREATE OR REPLACE FUNCTION prediction.psq_tokens(p_text text, p_rule jsonb, p_keep_negations boolean DEFAULT true) RETURNS text[]
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  WITH w AS (
    SELECT x AS word FROM regexp_split_to_table(prediction.psq_clean(p_text), '\s+') x WHERE x <> ''),
  s AS (
    SELECT CASE WHEN length(word) > 5 AND word ~ 'ing$' THEN left(word, -3)
                WHEN length(word) > 4 AND word ~ 'ed$' THEN left(word, -2)
                WHEN length(word) > 3 AND word ~ 's$' AND word !~ 'ss$' THEN left(word, -1)
                ELSE word END AS t
      FROM w
     WHERE NOT (word = ANY (ARRAY(SELECT jsonb_array_elements_text(p_rule -> 'params' -> 'stop_words'))))
       AND (p_keep_negations OR NOT (word = ANY (ARRAY(SELECT jsonb_array_elements_text(p_rule -> 'params' -> 'negations'))))))
  SELECT coalesce(array_agg(DISTINCT t ORDER BY t), '{}'::text[]) FROM s $$;

/* The count of negation words in a statement (its parity decides X vs not-X). */
CREATE OR REPLACE FUNCTION prediction.psq_negations(p_text text, p_rule jsonb) RETURNS int
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT count(*)::int FROM regexp_split_to_table(prediction.psq_clean(p_text), '\s+') x
   WHERE x = ANY (ARRAY(SELECT jsonb_array_elements_text(p_rule -> 'params' -> 'negations'))) $$;

/* The Jaccard overlap of two token sets (1 when both are empty). */
CREATE OR REPLACE FUNCTION prediction.psq_overlap(a text[], b text[]) RETURNS numeric
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT CASE WHEN cardinality(a) = 0 AND cardinality(b) = 0 THEN 1::numeric
              ELSE round((SELECT count(*) FROM (SELECT unnest(a) INTERSECT SELECT unnest(b)) i)::numeric
                         / NULLIF((SELECT count(*) FROM (SELECT unnest(a) UNION SELECT unnest(b)) u), 0), 4) END $$;

/* Whether two statements CONTRADICT under the rule: the same tokens without negations and a different negation parity; or tokens that
   differ by exactly one declared antonym pair (with the same parity). */
CREATE OR REPLACE FUNCTION prediction.psq_contradicts(p_a text, p_b text, p_rule jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path = prediction, pg_catalog, pg_temp AS $$
DECLARE a text[] := prediction.psq_tokens(p_a, p_rule, false); b text[] := prediction.psq_tokens(p_b, p_rule, false); da text[]; db text[]; pa int; pb int;
BEGIN
  IF cardinality(a) = 0 OR cardinality(b) = 0 THEN RETURN false; END IF;
  pa := prediction.psq_negations(p_a, p_rule) % 2; pb := prediction.psq_negations(p_b, p_rule) % 2;
  IF a = b THEN RETURN pa <> pb; END IF;
  IF pa <> pb THEN RETURN false; END IF;
  da := ARRAY(SELECT unnest(a) EXCEPT SELECT unnest(b)); db := ARRAY(SELECT unnest(b) EXCEPT SELECT unnest(a));
  IF cardinality(da) <> 1 OR cardinality(db) <> 1 THEN RETURN false; END IF;
  RETURN EXISTS (SELECT 1 FROM jsonb_array_elements(p_rule -> 'params' -> 'antonyms') p
                  WHERE (prediction.psq_tokens(p ->> 0, p_rule, false) = ARRAY[da[1]] AND prediction.psq_tokens(p ->> 1, p_rule, false) = ARRAY[db[1]])
                     OR (prediction.psq_tokens(p ->> 1, p_rule, false) = ARRAY[da[1]] AND prediction.psq_tokens(p ->> 0, p_rule, false) = ARRAY[db[1]]));
END $$;
GRANT EXECUTE ON FUNCTION prediction.psq_tokens(text, jsonb, boolean) TO eye_app, eye_commit;
GRANT EXECUTE ON FUNCTION prediction.psq_negations(text, jsonb) TO eye_app, eye_commit;
GRANT EXECUTE ON FUNCTION prediction.psq_overlap(text[], text[]) TO eye_app, eye_commit;
GRANT EXECUTE ON FUNCTION prediction.psq_contradicts(text, text, jsonb) TO eye_app, eye_commit;

/* §A's rows when §A is present (to_regclass; the part stands alone): the ACTIVE elements of a scenario
   [{element_id, branch_id, kind, name, description, attributes}] and the LINKED assumptions [{branch_id, assumption_id, critical}]. */
CREATE OR REPLACE FUNCTION prediction.psq_elements(p_scenario_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = prediction, pg_catalog, pg_temp AS $$
DECLARE v jsonb;
BEGIN
  IF to_regclass('prediction.scenario_elements') IS NULL THEN RETURN '[]'::jsonb; END IF;
  BEGIN
    EXECUTE $q$SELECT coalesce(jsonb_agg(jsonb_build_object('element_id', e.element_id, 'branch_id', e.branch_id, 'kind', e.kind, 'name', e.name, 'description', e.description,
                                                         'attributes', coalesce(e.attributes, '{}'::jsonb)) ORDER BY e.name, e.element_id), '[]'::jsonb)
                 FROM prediction.scenario_elements e WHERE e.scenario_id = $1 AND e.state = 'active'$q$ INTO v USING p_scenario_id;
  EXCEPTION WHEN undefined_column OR undefined_table OR invalid_text_representation THEN v := '[]'::jsonb;
  END;
  RETURN coalesce(v, '[]'::jsonb);
END $$;
CREATE OR REPLACE FUNCTION prediction.psq_linked_assumptions(p_scenario_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = prediction, pg_catalog, pg_temp AS $$
DECLARE v jsonb;
BEGIN
  IF to_regclass('prediction.scenario_assumptions') IS NULL THEN RETURN '[]'::jsonb; END IF;
  BEGIN
    EXECUTE $q$SELECT coalesce(jsonb_agg(jsonb_build_object('branch_id', a.branch_id, 'assumption_id', a.assumption_id, 'critical', a.critical) ORDER BY a.assumption_id), '[]'::jsonb)
                 FROM prediction.scenario_assumptions a WHERE a.scenario_id = $1 AND a.state = 'linked'$q$ INTO v USING p_scenario_id;
  EXCEPTION WHEN undefined_column OR undefined_table THEN v := '[]'::jsonb;
  END;
  RETURN coalesce(v, '[]'::jsonb);
END $$;
/* §S's plurality requirement when §S is present: the kinds every ACTIVE set holding the scenario requires (to_regclass). */
CREATE OR REPLACE FUNCTION prediction.psq_set_requirements(p_scenario_id uuid) RETURNS text[]
LANGUAGE plpgsql STABLE SET search_path = prediction, pg_catalog, pg_temp AS $$
DECLARE v text[];
BEGIN
  IF to_regclass('prediction.scenario_sets') IS NULL OR to_regclass('prediction.scenario_set_members') IS NULL THEN RETURN '{}'::text[]; END IF;
  BEGIN
    EXECUTE $q$SELECT coalesce(array_agg(DISTINCT k ORDER BY k), '{}'::text[])
                 FROM prediction.scenario_sets s JOIN prediction.scenario_set_members m ON m.set_id = s.set_id,
                      jsonb_array_elements_text(coalesce(s.plurality_policy -> 'require', '[]'::jsonb)) k
                WHERE m.scenario_id = $1 AND m.removed_at IS NULL AND s.state = 'active'$q$ INTO v USING p_scenario_id;
  EXCEPTION WHEN undefined_column OR undefined_table OR invalid_parameter_value THEN v := '{}'::text[];
  END;
  RETURN coalesce(v, '{}'::text[]);
END $$;
GRANT EXECUTE ON FUNCTION prediction.psq_elements(uuid) TO eye_app, eye_commit;
GRANT EXECUTE ON FUNCTION prediction.psq_linked_assumptions(uuid) TO eye_app, eye_commit;
GRANT EXECUTE ON FUNCTION prediction.psq_set_requirements(uuid) TO eye_app, eye_commit;

/* THE INDICATOR FRESHNESS of each branch of a scenario (the rule stated in the header), as of the database's instant:
   [{branch_id, name, kind, branch_state, live, indicator_id, series_key, state fresh|awaiting|stale|missing|not_required, last_observation_at,
     cadence_days, max_age_days, age_days, reason}]. */
CREATE OR REPLACE FUNCTION prediction.psq_freshness(p_scenario_id uuid, p_rule jsonb) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = prediction, pg_catalog, pg_temp AS $$
  WITH b AS (
    SELECT x.branch_id, x.name, x.kind, x.state, prediction.branch_live(x.state) AS live, x.indicator_id, i.series_key, i.state AS indicator_state, i.expires_at, i.last_observation_at,
           i.defined_at, i.consecutive_days, coalesce(sr.seasonality_days, 1) AS step,
           (x.kind = ANY (ARRAY(SELECT jsonb_array_elements_text(p_rule -> 'params' -> 'indicator_required_kinds')))) AS needs,
           (p_rule -> 'params' ->> 'freshness_grace_days')::int AS grace, (clock_timestamp())::date AS today
      FROM prediction.branches_current x
      LEFT JOIN prediction.indicators_current i ON i.indicator_id = x.indicator_id
      LEFT JOIN prediction.series_registry sr ON sr.tenant_id = i.tenant_id AND sr.domain_id = i.domain_id AND sr.series_key = i.series_key
     WHERE x.scenario_id = p_scenario_id AND x.state <> 'closed'),
  c AS (
    SELECT b.*, b.consecutive_days * b.step AS cadence_days, b.consecutive_days * b.step + b.grace AS max_age_days,
           CASE WHEN b.last_observation_at IS NOT NULL THEN b.today - b.last_observation_at WHEN b.defined_at IS NOT NULL THEN b.today - b.defined_at::date END AS age_days
      FROM b)
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'branch_id', c.branch_id, 'name', c.name, 'kind', c.kind, 'branch_state', c.state, 'live', c.live, 'indicator_id', c.indicator_id, 'series_key', c.series_key,
           'last_observation_at', c.last_observation_at, 'cadence_days', c.cadence_days, 'max_age_days', c.max_age_days, 'age_days', c.age_days,
           'state', CASE WHEN c.indicator_id IS NULL THEN CASE WHEN c.needs THEN 'missing' ELSE 'not_required' END
                         WHEN c.indicator_state = 'retired' OR (c.expires_at IS NOT NULL AND c.expires_at < clock_timestamp()) THEN 'missing'
                         WHEN c.age_days > c.max_age_days THEN 'stale'
                         WHEN c.last_observation_at IS NULL THEN 'awaiting'
                         ELSE 'fresh' END,
           'reason', CASE WHEN c.indicator_id IS NULL THEN CASE WHEN c.needs THEN format('branch "%s" (%s) names no indicator; a %s branch needs a signpost to be watched', c.name, c.kind, c.kind) ELSE format('a %s branch needs no signpost', c.kind) END
                          WHEN c.indicator_state = 'retired' THEN format('indicator %s (%s) of "%s" is retired', c.indicator_id, c.series_key, c.name)
                          WHEN c.expires_at IS NOT NULL AND c.expires_at < clock_timestamp() THEN format('indicator %s (%s) of "%s" expired at %s', c.indicator_id, c.series_key, c.name, c.expires_at)
                          WHEN c.age_days > c.max_age_days AND c.last_observation_at IS NULL THEN format('indicator %s (%s) of "%s" was defined %s days ago and has never been observed (cadence %s days + %s days grace)', c.indicator_id, c.series_key, c.name, c.age_days, c.cadence_days, c.grace)
                          WHEN c.age_days > c.max_age_days THEN format('indicator %s (%s) of "%s" was last observed %s, %s days ago (cadence %s days + %s days grace)', c.indicator_id, c.series_key, c.name, c.last_observation_at, c.age_days, c.cadence_days, c.grace)
                          WHEN c.last_observation_at IS NULL THEN format('indicator %s (%s) of "%s" is awaiting its first observation (defined %s days ago)', c.indicator_id, c.series_key, c.name, c.age_days)
                          ELSE format('indicator %s (%s) of "%s" was last observed %s (%s days; within %s)', c.indicator_id, c.series_key, c.name, c.last_observation_at, c.age_days, c.max_age_days) END)
         ORDER BY c.name, c.branch_id), '[]'::jsonb)
    FROM c $$;
GRANT EXECUTE ON FUNCTION prediction.psq_freshness(uuid, jsonb) TO eye_app, eye_commit;

/* THE COMPUTATION of the measures and findings of a scenario under a rule, as of the database's instant (a pure read; the evaluation
   port records it, the read shows it live). Returns {measures, findings, outcome, fingerprint, freshness_key}. */
CREATE OR REPLACE FUNCTION prediction.scenario_quality_compute(p_scenario_id uuid, p_rule jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = prediction, pg_catalog, pg_temp AS $$
DECLARE s record; v_findings jsonb := '[]'::jsonb; v_elements jsonb := prediction.psq_elements(p_scenario_id); v_links jsonb := prediction.psq_linked_assumptions(p_scenario_id);
        v_fresh jsonb := prediction.psq_freshness(p_scenario_id, p_rule); v_threshold numeric := (p_rule -> 'params' ->> 'wording_overlap_threshold')::numeric;
        x record; y record; f jsonb; a jsonb; a2 jsonb; e jsonb; d jsonb; v_live int; v_suspended int; v_with_assumption int; v_kinds int; v_indicators int; v_with_indicator int;
        v_present text[]; v_required text[]; v_missing text[]; v_cov jsonb; v_adverse text[]; v_benign text[]; v_n_adv int; v_n_ben int; v_bias text;
        v_groups jsonb; v_b jsonb; v_fp text[]; v_fkey text[]; v_outcome text; v_ov numeric; v_from timestamptz; v_until timestamptz; v_dep_from timestamptz; v_distinct_thresholds int; v_nonbase int;
BEGIN
  SELECT sc.scenario_id, sc.title, sc.state, sc.owner_principal_id, sc.next_review_due_at, sc.current_version INTO s FROM prediction.scenarios_current sc WHERE sc.scenario_id = p_scenario_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  -- the live branches (open | flipped), each with its normalised statement, divergence, assumptions, links, elements and indicator threshold
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'branch_id', bx.branch_id, 'name', bx.name, 'kind', bx.kind,
           'tokens', to_jsonb(prediction.psq_tokens(bx.statement, p_rule)),
           'divergence', to_jsonb(prediction.psq_tokens(bx.divergence, p_rule)),
           'assumptions', to_jsonb(ARRAY(SELECT array_to_string(prediction.psq_tokens(q ->> 'statement', p_rule), ' ') FROM jsonb_array_elements(coalesce(bx.assumptions, '[]'::jsonb)) q ORDER BY 1)),
           'raw_assumptions', coalesce(bx.assumptions, '[]'::jsonb),
           'linked', to_jsonb(ARRAY(SELECT l ->> 'assumption_id' FROM jsonb_array_elements(v_links) l WHERE (l ->> 'branch_id') = bx.branch_id::text ORDER BY 1)),
           'elements', to_jsonb(ARRAY(SELECT (el ->> 'kind') || ':' || lower(btrim(el ->> 'name')) FROM jsonb_array_elements(v_elements) el WHERE (el ->> 'branch_id') = bx.branch_id::text ORDER BY 1)),
           'indicator_id', bx.indicator_id,
           'signature', (SELECT i.series_key || ' ' || i.comparator || ' ' || i.threshold::text FROM prediction.indicators_current i WHERE i.indicator_id = bx.indicator_id))
         ORDER BY bx.name, bx.branch_id), '[]'::jsonb)
    INTO v_b FROM prediction.branches_current bx WHERE bx.scenario_id = p_scenario_id AND prediction.branch_live(bx.state);
  v_live := jsonb_array_length(v_b);
  SELECT count(*) INTO v_suspended FROM prediction.branches_current bx WHERE bx.scenario_id = p_scenario_id AND bx.state = 'suspended';

  -- (1) DISTINCTIVENESS: the same assumptions, elements, indicator and divergence; statements differing only in wording
  FOR x IN SELECT p ->> 'branch_id' AS a_id, p ->> 'name' AS a_name, q ->> 'branch_id' AS b_id, q ->> 'name' AS b_name,
                  prediction.psq_overlap(ARRAY(SELECT jsonb_array_elements_text(p -> 'tokens')), ARRAY(SELECT jsonb_array_elements_text(q -> 'tokens'))) AS ov
             FROM jsonb_array_elements(v_b) p JOIN jsonb_array_elements(v_b) q ON (q ->> 'branch_id') > (p ->> 'branch_id')
            WHERE p -> 'assumptions' = q -> 'assumptions' AND p -> 'linked' = q -> 'linked' AND p -> 'elements' = q -> 'elements'
              AND (p ->> 'indicator_id') IS NOT DISTINCT FROM (q ->> 'indicator_id') AND p -> 'divergence' = q -> 'divergence'
            ORDER BY p ->> 'name', q ->> 'name' LOOP
    IF x.ov >= v_threshold THEN
      v_findings := v_findings || jsonb_build_object('rule', 'indistinct_branches', 'outcome', 'fail', 'branch_ids', jsonb_build_array(x.a_id, x.b_id),
        'detail', format('branches "%s" and "%s" share their assumptions, elements, indicator and divergence, and their statements overlap %s (threshold %s): they differ only in wording', x.a_name, x.b_name, x.ov, v_threshold),
        'overlap', x.ov);
    END IF;
  END LOOP;

  -- (2) COLLAPSE: every live non-baseline branch (at least two) rests on one indicator threshold
  SELECT count(*), count(DISTINCT coalesce(l ->> 'signature', 'none:' || (l ->> 'branch_id'))) INTO v_nonbase, v_distinct_thresholds FROM jsonb_array_elements(v_b) l WHERE l ->> 'kind' <> 'baseline';
  IF v_nonbase >= 2 AND v_distinct_thresholds = 1 AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_b) l WHERE l ->> 'kind' <> 'baseline' AND l ->> 'signature' IS NULL) THEN
    v_findings := v_findings || jsonb_build_object('rule', 'collapse_to_one_forecast', 'outcome', 'fail',
      'branch_ids', (SELECT jsonb_agg(l -> 'branch_id') FROM jsonb_array_elements(v_b) l WHERE l ->> 'kind' <> 'baseline'),
      'detail', format('all %s live branches beside the baseline rest on one indicator threshold (%s): the tree collapses to one forecast', v_nonbase, (SELECT min(l ->> 'signature') FROM jsonb_array_elements(v_b) l WHERE l ->> 'kind' <> 'baseline')));
  END IF;

  -- (3) PROHIBITED CONTRADICTION: within a branch's assumptions; against a scenario-level element
  FOR x IN SELECT l ->> 'branch_id' AS branch_id, l ->> 'name' AS name, l -> 'raw_assumptions' AS raw_assumptions FROM jsonb_array_elements(v_b) l ORDER BY l ->> 'name' LOOP
    FOR a IN SELECT q FROM jsonb_array_elements(x.raw_assumptions) WITH ORDINALITY t(q, n) ORDER BY n LOOP
      FOR a2 IN SELECT q FROM jsonb_array_elements(x.raw_assumptions) WITH ORDINALITY t(q, n) ORDER BY n LOOP
        IF (a ->> 'statement') < (a2 ->> 'statement') AND prediction.psq_contradicts(a ->> 'statement', a2 ->> 'statement', p_rule) THEN
          v_findings := v_findings || jsonb_build_object('rule', 'prohibited_contradiction', 'outcome', 'fail', 'branch_ids', jsonb_build_array(x.branch_id),
            'detail', format('branch "%s" assumes both "%s" and "%s"', x.name, left(a ->> 'statement', 160), left(a2 ->> 'statement', 160)));
        END IF;
      END LOOP;
      FOR e IN SELECT el FROM jsonb_array_elements(v_elements) el WHERE (el ->> 'branch_id') IS NULL ORDER BY el ->> 'name' LOOP
        IF prediction.psq_contradicts(a ->> 'statement', coalesce(e ->> 'description', e ->> 'name'), p_rule) THEN
          v_findings := v_findings || jsonb_build_object('rule', 'prohibited_contradiction', 'outcome', 'fail', 'branch_ids', jsonb_build_array(x.branch_id), 'element_id', e ->> 'element_id',
            'detail', format('branch "%s" assumes "%s", contradicting the scenario-level %s "%s"', x.name, left(a ->> 'statement', 160), e ->> 'kind', e ->> 'name'));
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;

  -- (4) TEMPORAL ORDERING of elements with timing attributes (§A): from after until; a dependency starting after the element it causes
  FOR e IN SELECT el FROM jsonb_array_elements(v_elements) el ORDER BY el ->> 'name' LOOP
    BEGIN
      v_from := NULLIF(e -> 'attributes' -> 'timing' ->> 'from', '')::timestamptz; v_until := NULLIF(e -> 'attributes' -> 'timing' ->> 'until', '')::timestamptz;
    EXCEPTION WHEN OTHERS THEN v_from := NULL; v_until := NULL;
    END;
    IF v_from IS NOT NULL AND v_until IS NOT NULL AND v_from > v_until THEN
      v_findings := v_findings || jsonb_build_object('rule', 'element_temporal_order', 'outcome', 'fail', 'branch_ids', CASE WHEN e ->> 'branch_id' IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(e ->> 'branch_id') END,
        'element_id', e ->> 'element_id', 'detail', format('%s "%s" is timed from %s until %s: it ends before it begins', e ->> 'kind', e ->> 'name', v_from, v_until));
    END IF;
    IF v_from IS NOT NULL AND jsonb_typeof(e -> 'attributes' -> 'dependencies') = 'array' THEN
      FOR d IN SELECT el2 FROM jsonb_array_elements(v_elements) el2 WHERE (el2 ->> 'element_id') IN (SELECT jsonb_array_elements_text(e -> 'attributes' -> 'dependencies')) ORDER BY el2 ->> 'name' LOOP
        BEGIN v_dep_from := NULLIF(d -> 'attributes' -> 'timing' ->> 'from', '')::timestamptz; EXCEPTION WHEN OTHERS THEN v_dep_from := NULL; END;
        IF v_dep_from IS NOT NULL AND v_dep_from > v_from THEN
          v_findings := v_findings || jsonb_build_object('rule', 'element_temporal_order', 'outcome', 'fail', 'branch_ids', CASE WHEN e ->> 'branch_id' IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(e ->> 'branch_id') END,
            'element_id', e ->> 'element_id', 'detail', format('%s "%s" (from %s) depends on %s "%s", which begins later (%s): the effect precedes its cause', e ->> 'kind', e ->> 'name', v_from, d ->> 'kind', d ->> 'name', v_dep_from));
        END IF;
      END LOOP;
    END IF;
  END LOOP;

  -- (5) INDICATOR FRESHNESS: missing and stale named (live branches only; a suspended branch is shown, not judged)
  FOR f IN SELECT q FROM jsonb_array_elements(v_fresh) q WHERE (q ->> 'live')::boolean AND (q ->> 'state') IN ('missing', 'stale') ORDER BY q ->> 'name' LOOP
    v_findings := v_findings || jsonb_build_object('rule', 'indicator_' || (f ->> 'state'), 'outcome', 'fail', 'branch_ids', jsonb_build_array(f ->> 'branch_id'), 'indicator_id', f -> 'indicator_id', 'detail', f ->> 'reason');
  END LOOP;

  -- (6) COVERAGE (a note): baseline / adverse / stress, and the plurality a set holding the scenario requires (§S)
  SELECT coalesce(array_agg(DISTINCT l ->> 'kind' ORDER BY l ->> 'kind'), '{}'::text[]) INTO v_present FROM jsonb_array_elements(v_b) l;
  v_missing := '{}'::text[];
  FOR x IN SELECT k.key AS cat, ARRAY(SELECT jsonb_array_elements_text(k.value)) AS kinds FROM jsonb_each(p_rule -> 'params' -> 'coverage') k ORDER BY k.key LOOP
    IF NOT (x.kinds && v_present) THEN v_missing := v_missing || x.cat; END IF;
  END LOOP;
  v_required := prediction.psq_set_requirements(p_scenario_id);
  v_missing := v_missing || ARRAY(SELECT r FROM unnest(v_required) r WHERE NOT (r = ANY (v_present)) AND NOT (r = ANY (v_missing)) ORDER BY r);
  v_cov := jsonb_build_object('present', to_jsonb(v_present), 'missing', to_jsonb(v_missing), 'set_requires', to_jsonb(v_required));
  IF cardinality(v_missing) > 0 THEN
    v_findings := v_findings || jsonb_build_object('rule', 'coverage', 'outcome', 'note', 'branch_ids', '[]'::jsonb, 'missing', to_jsonb(v_missing),
      'detail', format('the live branches cover %s; missing: %s', CASE WHEN cardinality(v_present) = 0 THEN 'no kind' ELSE array_to_string(v_present, ', ') END, array_to_string(v_missing, ', ')));
  END IF;

  -- (7) BIAS (a note): all adverse, or all benign
  v_adverse := ARRAY(SELECT jsonb_array_elements_text(p_rule -> 'params' -> 'bias' -> 'adverse')); v_benign := ARRAY(SELECT jsonb_array_elements_text(p_rule -> 'params' -> 'bias' -> 'benign'));
  SELECT count(*) FILTER (WHERE (l ->> 'kind') = ANY (v_adverse)), count(*) FILTER (WHERE (l ->> 'kind') = ANY (v_benign)) INTO v_n_adv, v_n_ben FROM jsonb_array_elements(v_b) l;
  v_bias := CASE WHEN v_n_adv >= (p_rule -> 'params' -> 'bias' ->> 'min_branches')::int AND v_n_ben = 0 THEN 'all_adverse'
                 WHEN v_n_ben >= (p_rule -> 'params' -> 'bias' ->> 'min_branches')::int AND v_n_adv = 0 THEN 'all_benign' END;
  IF v_bias IS NOT NULL THEN
    v_findings := v_findings || jsonb_build_object('rule', 'bias', 'outcome', 'note', 'branch_ids', (SELECT jsonb_agg(l -> 'branch_id') FROM jsonb_array_elements(v_b) l WHERE (l ->> 'kind') = ANY (v_adverse || v_benign)), 'bias', v_bias,
      'detail', CASE v_bias WHEN 'all_adverse' THEN format('all %s classified branches are adverse; no benign branch is considered', v_n_adv) ELSE format('all %s classified branches are benign; no adverse branch is considered', v_n_ben) END);
  END IF;

  -- (8) SIGNPOST DISCRIMINATION (a note): live branches sharing one indicator cannot be told apart by it
  SELECT coalesce(jsonb_agg(jsonb_build_object('indicator_id', g.indicator_id, 'branch_ids', g.ids) ORDER BY g.indicator_id), '[]'::jsonb) INTO v_groups
    FROM (SELECT l ->> 'indicator_id' AS indicator_id, jsonb_agg(l -> 'branch_id') AS ids FROM jsonb_array_elements(v_b) l WHERE l ->> 'indicator_id' IS NOT NULL GROUP BY l ->> 'indicator_id' HAVING count(*) > 1) g;
  FOR d IN SELECT q FROM jsonb_array_elements(v_groups) q LOOP
    v_findings := v_findings || jsonb_build_object('rule', 'signpost_shared', 'outcome', 'note', 'branch_ids', d -> 'branch_ids', 'indicator_id', d -> 'indicator_id',
      'detail', format('%s live branches watch the same indicator %s: its movement does not discriminate between them', jsonb_array_length(d -> 'branch_ids'), d ->> 'indicator_id'));
  END LOOP;

  -- (9) REVIEW TIMELINESS (a note)
  IF s.next_review_due_at IS NOT NULL AND s.next_review_due_at < clock_timestamp() THEN
    v_findings := v_findings || jsonb_build_object('rule', 'review_overdue', 'outcome', 'note', 'branch_ids', '[]'::jsonb,
      'detail', format('the scenario''s review was due %s (%s days ago)', s.next_review_due_at, (clock_timestamp()::date - s.next_review_due_at::date)));
  END IF;

  -- THE MEASURES
  SELECT count(*) FILTER (WHERE jsonb_array_length(l -> 'assumptions') > 0 OR jsonb_array_length(l -> 'linked') > 0), count(DISTINCT l ->> 'kind'), count(DISTINCT l ->> 'indicator_id'),
         count(*) FILTER (WHERE l ->> 'indicator_id' IS NOT NULL)
    INTO v_with_assumption, v_kinds, v_indicators, v_with_indicator FROM jsonb_array_elements(v_b) l;
  SELECT coalesce(array_agg(DISTINCT (q ->> 'rule') || ':' || coalesce((SELECT string_agg(b, ',' ORDER BY b) FROM jsonb_array_elements_text(q -> 'branch_ids') b), '') ORDER BY (q ->> 'rule') || ':' || coalesce((SELECT string_agg(b, ',' ORDER BY b) FROM jsonb_array_elements_text(q -> 'branch_ids') b), '')), '{}'::text[])
    INTO v_fp FROM jsonb_array_elements(v_findings) q WHERE q ->> 'outcome' = 'fail';
  SELECT coalesce(array_agg((q ->> 'branch_id') || ':' || (q ->> 'state') ORDER BY q ->> 'branch_id'), '{}'::text[]) INTO v_fkey FROM jsonb_array_elements(v_fresh) q;
  v_outcome := CASE WHEN cardinality(v_fp) > 0 THEN 'failed' ELSE 'passed' END;
  RETURN jsonb_build_object(
    'scenario_id', s.scenario_id, 'scenario_version', s.current_version, 'rule_version', p_rule ->> 'version', 'outcome', v_outcome, 'findings', v_findings,
    'fingerprint', to_jsonb(v_fp), 'freshness_key', to_jsonb(v_fkey), 'at', clock_timestamp(),
    'measures', jsonb_build_object(
      'live_branches', v_live, 'suspended_branches', v_suspended,
      'assumption_coverage', jsonb_build_object('with_assumption', v_with_assumption, 'live', v_live, 'ratio', CASE WHEN v_live = 0 THEN NULL ELSE round(v_with_assumption::numeric / v_live, 4) END),
      'branch_diversity', jsonb_build_object('kinds', v_kinds, 'live', v_live, 'ratio', CASE WHEN v_live = 0 THEN NULL ELSE round(v_kinds::numeric / v_live, 4) END),
      'indicator_freshness', v_fresh,
      'indicators', jsonb_build_object('missing', (SELECT count(*) FROM jsonb_array_elements(v_fresh) q WHERE (q ->> 'live')::boolean AND q ->> 'state' = 'missing'),
                                       'stale', (SELECT count(*) FROM jsonb_array_elements(v_fresh) q WHERE (q ->> 'live')::boolean AND q ->> 'state' = 'stale')),
      'signpost_discrimination', jsonb_build_object('distinct_indicators', v_indicators, 'branches_with_indicator', v_with_indicator,
                                                    'ratio', CASE WHEN v_with_indicator = 0 THEN NULL ELSE round(v_indicators::numeric / v_with_indicator, 4) END, 'shared', v_groups),
      'coverage', v_cov, 'bias', v_bias,
      'review_timeliness', jsonb_build_object('next_review_due_at', s.next_review_due_at, 'overdue', s.next_review_due_at IS NOT NULL AND s.next_review_due_at < clock_timestamp()),
      'elements_read', to_regclass('prediction.scenario_elements') IS NOT NULL, 'elements', jsonb_array_length(v_elements)));
END $$;
GRANT EXECUTE ON FUNCTION prediction.scenario_quality_compute(uuid, jsonb) TO eye_app, eye_commit;

-- ═════════════════════════════════════════════════════════════════════
-- §Q.4 THE PORTS
-- ═════════════════════════════════════════════════════════════════════
/* THE RECORDING (private; called by the evaluation port and the tick's sweep, never a port itself — no authority is asserted here and no
   scenario row is locked): the evaluation row, scenario.quality_evaluated, and — on a NEW failure (failed, and a failing set other than the
   prior evaluation's) — the owner's attention item of class scenario.quality (the 0095 idiom), once. */
CREATE OR REPLACE FUNCTION prediction.psq_record_evaluation(p_evaluation_id uuid, p_tenant uuid, p_domain uuid, p_scenario_id uuid, p_trigger text, p_actor uuid, p_event_id uuid, p_correlation uuid)
RETURNS jsonb SET search_path = prediction, executive, identity, pg_catalog, pg_temp AS $$
DECLARE s prediction.scenarios_current%ROWTYPE; r jsonb := prediction.scenario_quality_rule(); c jsonb; prev prediction.scenario_quality_evaluations%ROWTYPE; v_fp text[]; v_fkey text[];
        v_new boolean; v_item uuid; v_state text; v_title text; v_reasons jsonb; v_fails jsonb;
BEGIN
  SELECT * INTO s FROM prediction.scenarios_current x WHERE x.scenario_id = p_scenario_id;
  c := prediction.scenario_quality_compute(p_scenario_id, r);
  SELECT * INTO prev FROM prediction.scenario_quality_evaluations x WHERE x.scenario_id = p_scenario_id ORDER BY x.evaluated_at DESC, x.evaluation_id DESC LIMIT 1;
  v_fp := ARRAY(SELECT jsonb_array_elements_text(c -> 'fingerprint')); v_fkey := ARRAY(SELECT jsonb_array_elements_text(c -> 'freshness_key'));
  v_new := (c ->> 'outcome') = 'failed' AND (prev.evaluation_id IS NULL OR prev.outcome <> 'failed' OR prev.fingerprint IS DISTINCT FROM v_fp);
  IF v_new THEN
    v_item := gen_random_uuid();
    SELECT coalesce(jsonb_agg(q ->> 'detail'), '[]'::jsonb), coalesce(jsonb_agg(q), '[]'::jsonb) INTO v_reasons, v_fails FROM jsonb_array_elements(c -> 'findings') q WHERE q ->> 'outcome' = 'fail';
    v_state := CASE WHEN EXISTS (SELECT 1 FROM identity.principals p WHERE p.id = s.owner_principal_id AND p.kind = 'human' AND p.status = 'active') THEN 'open' ELSE 'unrouted' END;
    v_title := left(format('Scenario quality failed: %s (%s)', s.title, (SELECT string_agg(DISTINCT q ->> 'rule', ', ') FROM jsonb_array_elements(v_fails) q)), 512);
  END IF;
  INSERT INTO prediction.scenario_quality_evaluations (evaluation_id, scope, tenant_id, domain_id, scenario_id, scenario_version, rule_version, trigger, measures, findings, outcome, prior_outcome,
                                                       fingerprint, freshness_key, new_failure, attention_item_id, evaluated_by, correlation_id)
  VALUES (p_evaluation_id, 'DOMAIN', p_tenant, p_domain, p_scenario_id, (c ->> 'scenario_version')::int, r ->> 'version', p_trigger, c -> 'measures', c -> 'findings', c ->> 'outcome', prev.outcome,
          v_fp, v_fkey, v_new, v_item, p_actor, p_correlation);
  INSERT INTO prediction.scenario_events (event_id, scope, tenant_id, domain_id, scenario_id, branch_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_scenario_id, NULL, 'scenario.quality_evaluated', p_actor,
          jsonb_build_object('evaluation_id', p_evaluation_id, 'outcome', c ->> 'outcome', 'prior_outcome', prev.outcome, 'new_failure', v_new, 'trigger', p_trigger, 'rule_version', r ->> 'version',
                             'fail', (SELECT count(*) FROM jsonb_array_elements(c -> 'findings') q WHERE q ->> 'outcome' = 'fail'), 'findings', jsonb_array_length(c -> 'findings'), 'attention_item_id', v_item), p_correlation);
  IF v_new THEN
    INSERT INTO executive.attention_items (item_id, scope, tenant_id, domain_id, signal_class, subject_kind, subject_id, cause_event_id, cause_event_type, title, outcome, state, owner_principal_id, route_roles, evaluation, details, due_at, escalations, correlation_id)
    VALUES (v_item, 'DOMAIN', p_tenant, p_domain, 'scenario.quality', 'scenario', p_scenario_id, p_event_id, 'scenario.quality_evaluated', v_title, 'material', v_state, s.owner_principal_id, '{}',
            jsonb_build_object('outcome', 'material', 'reasons', v_reasons, 'policy_version', NULL, 'dimensions', jsonb_build_object('consequence', 'C2', 'confidence', 1)),
            jsonb_build_object('evaluation_id', p_evaluation_id, 'scenario_id', p_scenario_id, 'scenario_version', (c ->> 'scenario_version')::int, 'rule_version', r ->> 'version', 'trigger', p_trigger,
                               'findings', v_fails, 'decision_active', false),
            clock_timestamp() + interval '72 hours', 0, p_correlation);
    PERFORM executive.attention_event(v_item, p_tenant, p_domain, CASE v_state WHEN 'open' THEN 'item.routed' ELSE 'item.unrouted' END, p_actor,
              jsonb_build_object('outcome', 'material', 'reasons', v_reasons, 'policy_version', NULL, 'owner', s.owner_principal_id, 'route_roles', '[]'::jsonb, 'due_at', clock_timestamp() + interval '72 hours',
                                 'cause_event_id', p_event_id, 'cause_event_type', 'scenario.quality_evaluated', 'unrouted', v_state = 'unrouted', 'scenario_id', p_scenario_id), p_correlation);
  END IF;
  RETURN jsonb_build_object('evaluation_id', p_evaluation_id, 'scenario_id', p_scenario_id, 'title', s.title, 'owner', s.owner_principal_id, 'trigger', p_trigger, 'prior_outcome', prev.outcome,
                            'new_failure', v_new, 'attention_item_id', v_item) || (c - 'fingerprint' - 'freshness_key');
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.psq_record_evaluation(uuid,uuid,uuid,uuid,text,uuid,uuid,uuid) FROM PUBLIC;

/* EVALUATE (prediction.scenario.quality.evaluate): a PERSON's evaluation of an active scenario — recorded whatever the outcome; the trigger
   names what prompted it (declare | branch | operator; the tick has its own sweep). The acting principal records it. */
CREATE OR REPLACE FUNCTION prediction.evaluate_scenario_quality(
  p_evaluation_id uuid, p_scenario_id uuid, p_tenant uuid, p_domain uuid, p_trigger text, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE s prediction.scenarios_current%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.scenario.quality.evaluate']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'scenario quality rejected (actor): an evaluation is recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF p_trigger IS NULL OR p_trigger NOT IN ('declare', 'branch', 'operator') THEN
    RAISE EXCEPTION 'scenario quality rejected (trigger): a person''s evaluation is prompted by declare, branch or operator (the tick evaluates under its own step)' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO s FROM prediction.scenarios_current x WHERE x.scenario_id = p_scenario_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'scenario quality rejected (unknown_scenario): % is not a scenario of this domain', p_scenario_id USING ERRCODE = '23503'; END IF;
  IF s.state <> 'active' THEN RAISE EXCEPTION 'scenario quality rejected (state): scenario % is %; only an active scenario is evaluated (declare a successor)', p_scenario_id, s.state USING ERRCODE = '22023'; END IF;
  RETURN prediction.psq_record_evaluation(p_evaluation_id, p_tenant, p_domain, p_scenario_id, p_trigger, p_actor, p_event_id, p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.evaluate_scenario_quality(uuid,uuid,uuid,uuid,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.evaluate_scenario_quality(uuid,uuid,uuid,uuid,text,uuid,uuid,uuid) TO eye_commit;

/* THE SWEEP (executive.attention.tick — the step `scenario-quality`, order 68): every ACTIVE scenario of the domain that has been evaluated
   at least once (a person opted it in; the tick never evaluates a scenario nobody evaluated — the older suites' event logs stay as pinned)
   and whose SCN version changed since, or whose branches' indicator states (fresh / awaiting / stale / missing) changed since, is evaluated
   again with trigger `tick` under the attention agent; a NEW failure raises scenario.quality to the owner once. */
CREATE OR REPLACE FUNCTION prediction.sweep_scenario_quality(p_tenant uuid, p_domain uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE x record; r jsonb := prediction.scenario_quality_rule(); v_key text[]; v_res jsonb; v_out jsonb := '[]'::jsonb; v_seen int := 0; v_eval int := 0; v_new int := 0; v_reason text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.attention.tick']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  FOR x IN SELECT sc.scenario_id, sc.current_version, e.scenario_version AS last_version, e.freshness_key AS last_key
             FROM prediction.scenarios_current sc
             JOIN LATERAL (SELECT q.scenario_version, q.freshness_key FROM prediction.scenario_quality_evaluations q WHERE q.scenario_id = sc.scenario_id ORDER BY q.evaluated_at DESC, q.evaluation_id DESC LIMIT 1) e ON true
            WHERE sc.tenant_id = p_tenant AND sc.domain_id = p_domain AND sc.state = 'active' ORDER BY sc.declared_at, sc.scenario_id LOOP
    v_seen := v_seen + 1;
    SELECT coalesce(array_agg((q ->> 'branch_id') || ':' || (q ->> 'state') ORDER BY q ->> 'branch_id'), '{}'::text[]) INTO v_key FROM jsonb_array_elements(prediction.psq_freshness(x.scenario_id, r)) q;
    v_reason := CASE WHEN x.current_version IS DISTINCT FROM x.last_version THEN 'version' WHEN v_key IS DISTINCT FROM x.last_key THEN 'freshness' END;
    IF v_reason IS NULL THEN CONTINUE; END IF;
    v_res := prediction.psq_record_evaluation(gen_random_uuid(), p_tenant, p_domain, x.scenario_id, 'tick', p_actor, gen_random_uuid(), p_correlation);
    v_eval := v_eval + 1;
    IF (v_res ->> 'new_failure')::boolean THEN v_new := v_new + 1; END IF;
    v_out := v_out || jsonb_build_object('scenario_id', x.scenario_id, 'reason', v_reason, 'outcome', v_res ->> 'outcome', 'new_failure', (v_res ->> 'new_failure')::boolean, 'attention_item_id', v_res -> 'attention_item_id');
  END LOOP;
  RETURN jsonb_build_object('considered', v_seen, 'evaluated', v_eval, 'new_failures', v_new, 'scenarios', v_out);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.sweep_scenario_quality(uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.sweep_scenario_quality(uuid,uuid,uuid,uuid) TO eye_commit;

/* DECLARE A FREQUENCY-TO-PROBABILITY MAP (prediction.scenario.probability.map): a named human's act; the owner a named, active human of
   the tenant (default: the declarer). Bands: [{frequency_label, min_per_year, max_per_year (null = unbounded, last band only),
   probability_low, probability_high}] — contiguous (each band's min is the previous band's max), ascending, starting at 0, lows and highs
   non-decreasing, low ≤ high, all in [0, 1]. A name already declared → its next version (the prior superseded). */
CREATE OR REPLACE FUNCTION prediction.declare_frequency_map(
  p_map_id uuid, p_tenant uuid, p_domain uuid, p_name text, p_horizon text, p_bands jsonb, p_owner uuid, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE b jsonb; n int := 0; v_prev_max numeric; v_prev_low numeric := 0; v_prev_high numeric := 0; v_min numeric; v_max numeric; v_low numeric; v_high numeric; v_prior prediction.frequency_probability_maps%ROWTYPE;
        v_version int := 1; v_owner uuid := coalesce(p_owner, p_actor); m prediction.frequency_probability_maps%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.scenario.probability.map']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'frequency map rejected (actor): a map is declared by the acting principal' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM identity.principals p WHERE p.id = p_actor AND p.kind = 'human' AND p.status = 'active') THEN
    RAISE EXCEPTION 'frequency map rejected (authority): a map is declared by a named, active human' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM identity.principals p WHERE p.id = v_owner AND p.kind = 'human' AND p.status = 'active' AND p.tenant_id = p_tenant) THEN
    RAISE EXCEPTION 'frequency map rejected (unknown_owner): the owner % is not a named, active human of this tenant', v_owner USING ERRCODE = '23503';
  END IF;
  IF p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 3 AND 128 THEN RAISE EXCEPTION 'frequency map rejected (name): a map is named (3 to 128 characters)' USING ERRCODE = '22023'; END IF;
  IF p_horizon IS NULL OR length(btrim(p_horizon)) NOT BETWEEN 2 AND 64 THEN RAISE EXCEPTION 'frequency map rejected (horizon): a map names the window its probabilities speak of (2 to 64 characters)' USING ERRCODE = '22023'; END IF;
  IF p_bands IS NULL OR coalesce(jsonb_typeof(p_bands), 'absent') <> 'array' OR jsonb_array_length(p_bands) = 0 THEN RAISE EXCEPTION 'frequency map rejected (bands): a map has at least one band' USING ERRCODE = '22023'; END IF;
  FOR b IN SELECT x FROM jsonb_array_elements(p_bands) x LOOP
    n := n + 1;
    IF coalesce(jsonb_typeof(b), 'absent') <> 'object' OR coalesce(jsonb_typeof(b -> 'frequency_label'), 'absent') <> 'string' OR length(btrim(b ->> 'frequency_label')) < 2 OR coalesce(jsonb_typeof(b -> 'min_per_year'), 'absent') <> 'number'
       OR (b ? 'max_per_year' AND coalesce(jsonb_typeof(b -> 'max_per_year'), 'absent') NOT IN ('number', 'null')) OR coalesce(jsonb_typeof(b -> 'probability_low'), 'absent') <> 'number' OR coalesce(jsonb_typeof(b -> 'probability_high'), 'absent') <> 'number' THEN
      RAISE EXCEPTION 'frequency map rejected (bands): band % names a frequency_label, min_per_year, max_per_year (a number, or null for the last band) and probability_low / probability_high', n USING ERRCODE = '22023';
    END IF;
    v_min := (b ->> 'min_per_year')::numeric; v_max := (b ->> 'max_per_year')::numeric; v_low := (b ->> 'probability_low')::numeric; v_high := (b ->> 'probability_high')::numeric;
    IF (n = 1 AND v_min <> 0) OR (n > 1 AND v_min IS DISTINCT FROM v_prev_max) THEN
      RAISE EXCEPTION 'frequency map rejected (bands): band % starts at % per year; the bands are contiguous from 0 (each starts where the previous ends)', n, v_min USING ERRCODE = '22023';
    END IF;
    IF v_max IS NULL AND n < jsonb_array_length(p_bands) THEN RAISE EXCEPTION 'frequency map rejected (bands): only the last band is unbounded' USING ERRCODE = '22023'; END IF;
    IF v_max IS NOT NULL AND v_max <= v_min THEN RAISE EXCEPTION 'frequency map rejected (bands): band % ends (%) at or before it starts (%)', n, v_max, v_min USING ERRCODE = '22023'; END IF;
    IF v_low < 0 OR v_high > 1 OR v_low > v_high THEN RAISE EXCEPTION 'frequency map rejected (bands): band % maps to [%, %]; a probability band lies in [0, 1] with low ≤ high', n, v_low, v_high USING ERRCODE = '22023'; END IF;
    IF v_low < v_prev_low OR v_high < v_prev_high THEN RAISE EXCEPTION 'frequency map rejected (bands): band % maps a higher frequency to a lower probability than band %', n, n - 1 USING ERRCODE = '22023'; END IF;
    v_prev_max := v_max; v_prev_low := v_low; v_prev_high := v_high;
  END LOOP;
  SELECT * INTO v_prior FROM prediction.frequency_probability_maps x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.name = btrim(p_name) AND x.state = 'active' FOR UPDATE;
  IF FOUND THEN
    v_version := v_prior.version + 1;
    UPDATE prediction.frequency_probability_maps SET state = 'superseded', superseded_at = clock_timestamp() WHERE map_id = v_prior.map_id;
  END IF;
  INSERT INTO prediction.frequency_probability_maps (map_id, scope, tenant_id, domain_id, name, version, bands, horizon, owner_principal_id, supersedes, declared_by, correlation_id)
  VALUES (p_map_id, 'DOMAIN', p_tenant, p_domain, btrim(p_name), v_version, p_bands, btrim(p_horizon), v_owner, v_prior.map_id, p_actor, p_correlation) RETURNING * INTO m;
  RETURN to_jsonb(m) - 'tenant_id' - 'domain_id' - 'correlation_id' - 'scope';
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.declare_frequency_map(uuid,uuid,uuid,text,text,jsonb,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.declare_frequency_map(uuid,uuid,uuid,text,text,jsonb,uuid,uuid,uuid) TO eye_commit;

/* SET A BRANCH PROBABILITY (prediction.scenario.probability.set): a NAMED HUMAN's act — the scenario's owner, the branch's owner, or a domain
   / platform administrator — with a METHOD and its BASIS, never from narrative text:
     frequency_map       — p_map_id (the ACTIVE version of a map of this domain) and basis {frequency_per_year ≥ 0, observation (where the
                           frequency was observed, ≥ 8 characters)}; the band is COMPUTED from the map (a caller's band is refused);
     expert_elicitation  — basis {elicitation: {experts [≥1 names], question, elicited_at (an instant), record (≥ 16 characters)}} and the band;
     model               — basis {run_id: a simulation run of this domain, completed and not invalidated} and the band.
   A basis carrying `narrative` is refused (a probability is never derived from narrative text). The branch: open, flipped or suspended
   (a closed one takes none); the scenario active. The sum of the LIVE branches' standing lows (this one's new low in place of its old)
   must not exceed 1; a suspended branch's probability is recorded and shown but not summed. */
CREATE OR REPLACE FUNCTION prediction.set_branch_probability(
  p_probability_id uuid, p_tenant uuid, p_domain uuid, p_branch_id uuid, p_method text, p_low numeric, p_high numeric, p_map_id uuid, p_basis jsonb,
  p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, simulation, executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE b prediction.branches_current%ROWTYPE; s prediction.scenarios_current%ROWTYPE; m prediction.frequency_probability_maps%ROWTYPE; band jsonb; v_freq numeric; v_low numeric := p_low; v_high numeric := p_high;
        v_sum numeric; e jsonb; v_prior uuid; v_basis jsonb := p_basis; v_run record; v_at timestamptz;
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.scenario.probability.set']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'branch probability rejected (actor): a probability is set by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO b FROM prediction.branches_current x WHERE x.branch_id = p_branch_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'branch probability rejected (unknown_branch): % is not a branch of this domain', p_branch_id USING ERRCODE = '23503'; END IF;
  SELECT * INTO s FROM prediction.scenarios_current x WHERE x.scenario_id = b.scenario_id;
  IF NOT EXISTS (SELECT 1 FROM identity.principals p WHERE p.id = p_actor AND p.kind = 'human' AND p.status = 'active')
     OR NOT (p_actor = s.owner_principal_id OR p_actor = b.owner_principal_id OR executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['domain_admin', 'platform_admin'])) THEN
    RAISE EXCEPTION 'branch probability rejected (authority): a probability is set by a named human — the scenario''s owner, the branch''s owner or an administrator' USING ERRCODE = '42501';
  END IF;
  IF s.state <> 'active' THEN RAISE EXCEPTION 'branch probability rejected (state): scenario % is %; only an active scenario''s branches take a probability', s.scenario_id, s.state USING ERRCODE = '22023'; END IF;
  IF b.state = 'closed' THEN RAISE EXCEPTION 'branch probability rejected (state): branch "%" is closed; a closed branch takes no probability', b.name USING ERRCODE = '22023'; END IF;
  IF p_method IS NULL OR p_method NOT IN ('frequency_map', 'expert_elicitation', 'model') THEN
    RAISE EXCEPTION 'branch probability rejected (method): the method is frequency_map, expert_elicitation or model' USING ERRCODE = '22023';
  END IF;
  IF v_basis IS NULL OR coalesce(jsonb_typeof(v_basis), 'absent') <> 'object' THEN RAISE EXCEPTION 'branch probability rejected (basis): a probability states its basis (an object)' USING ERRCODE = '22023'; END IF;
  IF v_basis ? 'narrative' THEN
    RAISE EXCEPTION 'branch probability rejected (narrative): a probability is never derived from narrative text — state the observed frequency, the elicitation record or the model run' USING ERRCODE = '22023';
  END IF;
  IF p_method = 'frequency_map' THEN
    IF p_low IS NOT NULL OR p_high IS NOT NULL THEN RAISE EXCEPTION 'branch probability rejected (band): the frequency_map method computes the band from the map; state the frequency, not the band' USING ERRCODE = '22023'; END IF;
    IF p_map_id IS NULL THEN RAISE EXCEPTION 'branch probability rejected (map): the frequency_map method names the map' USING ERRCODE = '22023'; END IF;
    SELECT * INTO m FROM prediction.frequency_probability_maps x WHERE x.map_id = p_map_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
    IF NOT FOUND THEN RAISE EXCEPTION 'branch probability rejected (unknown_map): % is not a frequency map of this domain', p_map_id USING ERRCODE = '23503'; END IF;
    IF m.state <> 'active' THEN RAISE EXCEPTION 'branch probability rejected (state): map "%" version % is superseded; use its current version', m.name, m.version USING ERRCODE = '22023'; END IF;
    IF coalesce(jsonb_typeof(v_basis -> 'frequency_per_year'), 'absent') <> 'number' OR (v_basis ->> 'frequency_per_year')::numeric < 0 THEN
      RAISE EXCEPTION 'branch probability rejected (basis): the frequency_map method states frequency_per_year (a number ≥ 0)' USING ERRCODE = '22023';
    END IF;
    IF coalesce(jsonb_typeof(v_basis -> 'observation'), 'absent') <> 'string' OR length(btrim(v_basis ->> 'observation')) < 8 THEN
      RAISE EXCEPTION 'branch probability rejected (basis): the frequency_map method states where the frequency was observed (observation, ≥ 8 characters)' USING ERRCODE = '22023';
    END IF;
    v_freq := (v_basis ->> 'frequency_per_year')::numeric;
    SELECT x INTO band FROM jsonb_array_elements(m.bands) x WHERE (x ->> 'min_per_year')::numeric <= v_freq AND ((x ->> 'max_per_year') IS NULL OR v_freq < (x ->> 'max_per_year')::numeric) LIMIT 1;
    IF band IS NULL THEN RAISE EXCEPTION 'branch probability rejected (basis): % per year falls in no band of map "%"', v_freq, m.name USING ERRCODE = '22023'; END IF;
    v_low := (band ->> 'probability_low')::numeric; v_high := (band ->> 'probability_high')::numeric;
    v_basis := v_basis || jsonb_build_object('map', jsonb_build_object('map_id', m.map_id, 'name', m.name, 'version', m.version, 'horizon', m.horizon), 'band', band);
  ELSE
    IF p_map_id IS NOT NULL THEN RAISE EXCEPTION 'branch probability rejected (map): only the frequency_map method names a map' USING ERRCODE = '22023'; END IF;
    IF p_low IS NULL OR p_high IS NULL OR p_low < 0 OR p_high > 1 OR p_low > p_high THEN
      RAISE EXCEPTION 'branch probability rejected (band): the % method states the band (low ≤ high, both in [0, 1])', p_method USING ERRCODE = '22023';
    END IF;
    IF p_method = 'expert_elicitation' THEN
      e := v_basis -> 'elicitation';
      IF e IS NULL OR coalesce(jsonb_typeof(e), 'absent') <> 'object' OR coalesce(jsonb_typeof(e -> 'experts'), 'absent') <> 'array' OR jsonb_array_length(e -> 'experts') = 0
         OR EXISTS (SELECT 1 FROM jsonb_array_elements(e -> 'experts') q WHERE coalesce(jsonb_typeof(q), 'absent') <> 'string' OR length(btrim(q #>> '{}')) < 2)
         OR coalesce(jsonb_typeof(e -> 'question'), 'absent') <> 'string' OR length(btrim(e ->> 'question')) < 8 OR coalesce(jsonb_typeof(e -> 'record'), 'absent') <> 'string' OR length(btrim(e ->> 'record')) < 16
         OR coalesce(jsonb_typeof(e -> 'elicited_at'), 'absent') <> 'string' THEN
        RAISE EXCEPTION 'branch probability rejected (basis): the expert_elicitation method carries the elicitation record {experts (named), question, elicited_at, record (≥ 16 characters)}' USING ERRCODE = '22023';
      END IF;
      BEGIN v_at := (e ->> 'elicited_at')::timestamptz; EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'branch probability rejected (basis): elicited_at is an instant' USING ERRCODE = '22023'; END;
      IF v_at > clock_timestamp() THEN RAISE EXCEPTION 'branch probability rejected (basis): the elicitation (%) lies in the future', v_at USING ERRCODE = '22023'; END IF;
    ELSE
      IF coalesce(jsonb_typeof(v_basis -> 'run_id'), 'absent') <> 'string' OR (v_basis ->> 'run_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        RAISE EXCEPTION 'branch probability rejected (basis): the model method names the simulation run (run_id)' USING ERRCODE = '22023';
      END IF;
      SELECT r.run_id, r.state, r.validity INTO v_run FROM simulation.runs_current r WHERE r.run_id = (v_basis ->> 'run_id')::uuid AND r.tenant_id = p_tenant AND r.domain_id = p_domain;
      IF v_run.run_id IS NULL THEN RAISE EXCEPTION 'branch probability rejected (unknown_run): % is not a simulation run of this domain', v_basis ->> 'run_id' USING ERRCODE = '23503'; END IF;
      IF v_run.state <> 'completed' OR v_run.validity = 'invalidated' THEN
        RAISE EXCEPTION 'branch probability rejected (basis): run % is % (%); a probability rests on a completed, valid run', v_run.run_id, v_run.state, v_run.validity USING ERRCODE = '22023';
      END IF;
    END IF;
  END IF;
  -- the sum of the LIVE branches' standing lows (this one's new low in place of its old; a suspended branch is not summed)
  SELECT coalesce(sum(c.probability_low), 0) INTO v_sum FROM prediction.branch_probabilities_current c JOIN prediction.branches_current x ON x.branch_id = c.branch_id
   WHERE c.scenario_id = b.scenario_id AND c.branch_id <> b.branch_id AND prediction.branch_live(x.state);
  IF prediction.branch_live(b.state) AND v_sum + v_low > 1 THEN
    RAISE EXCEPTION 'branch probability rejected (sum): the live branches'' lows would sum to % (the others % + this %); they must not exceed 1', v_sum + v_low, v_sum, v_low USING ERRCODE = '22023';
  END IF;
  SELECT c.probability_id INTO v_prior FROM prediction.branch_probabilities_current c WHERE c.branch_id = b.branch_id;
  INSERT INTO prediction.branch_probabilities (probability_id, scope, tenant_id, domain_id, scenario_id, branch_id, action, probability_low, probability_high, method, map_id, basis, actor_principal_id, correlation_id)
  VALUES (p_probability_id, 'DOMAIN', p_tenant, p_domain, b.scenario_id, b.branch_id, 'set', v_low, v_high, p_method, CASE WHEN p_method = 'frequency_map' THEN m.map_id END, v_basis, p_actor, p_correlation);
  INSERT INTO prediction.scenario_events (event_id, scope, tenant_id, domain_id, scenario_id, branch_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, b.scenario_id, b.branch_id, 'branch.probability_set', p_actor,
          jsonb_build_object('probability_id', p_probability_id, 'low', v_low, 'high', v_high, 'method', p_method, 'map_id', CASE WHEN p_method = 'frequency_map' THEN m.map_id END, 'replaces', v_prior,
                             'live', prediction.branch_live(b.state)), p_correlation);
  RETURN jsonb_build_object('probability_id', p_probability_id, 'scenario_id', b.scenario_id, 'branch_id', b.branch_id, 'branch', b.name, 'branch_state', b.state, 'probability_low', v_low, 'probability_high', v_high,
                            'method', p_method, 'map_id', CASE WHEN p_method = 'frequency_map' THEN m.map_id END, 'basis', v_basis, 'set_by', p_actor, 'replaces', v_prior,
                            'summed', prediction.branch_live(b.state), 'live_low_sum', CASE WHEN prediction.branch_live(b.state) THEN v_sum + v_low ELSE v_sum END);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.set_branch_probability(uuid,uuid,uuid,uuid,text,numeric,numeric,uuid,jsonb,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.set_branch_probability(uuid,uuid,uuid,uuid,text,numeric,numeric,uuid,jsonb,uuid,uuid,uuid) TO eye_commit;

/* WITHDRAW A BRANCH PROBABILITY (prediction.scenario.probability.withdraw): the same named humans, with a reason (≥ 8 characters); the
   standing probability ends (a `withdrawn` row naming it); a branch with none is refused. */
CREATE OR REPLACE FUNCTION prediction.withdraw_branch_probability(
  p_withdrawal_id uuid, p_tenant uuid, p_domain uuid, p_branch_id uuid, p_reason text, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE b prediction.branches_current%ROWTYPE; s prediction.scenarios_current%ROWTYPE; c record;
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.scenario.probability.withdraw']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'branch probability rejected (actor): a withdrawal is recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO b FROM prediction.branches_current x WHERE x.branch_id = p_branch_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'branch probability rejected (unknown_branch): % is not a branch of this domain', p_branch_id USING ERRCODE = '23503'; END IF;
  SELECT * INTO s FROM prediction.scenarios_current x WHERE x.scenario_id = b.scenario_id;
  IF NOT EXISTS (SELECT 1 FROM identity.principals p WHERE p.id = p_actor AND p.kind = 'human' AND p.status = 'active')
     OR NOT (p_actor = s.owner_principal_id OR p_actor = b.owner_principal_id OR executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['domain_admin', 'platform_admin'])) THEN
    RAISE EXCEPTION 'branch probability rejected (authority): a probability is withdrawn by a named human — the scenario''s owner, the branch''s owner or an administrator' USING ERRCODE = '42501';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN RAISE EXCEPTION 'branch probability rejected (reason): a withdrawal says why (at least 8 characters)' USING ERRCODE = '22023'; END IF;
  SELECT * INTO c FROM prediction.branch_probabilities_current x WHERE x.branch_id = b.branch_id;
  IF c.probability_id IS NULL THEN RAISE EXCEPTION 'branch probability rejected (state): branch "%" has no standing probability to withdraw', b.name USING ERRCODE = '22023'; END IF;
  INSERT INTO prediction.branch_probabilities (probability_id, scope, tenant_id, domain_id, scenario_id, branch_id, action, withdraws, withdrawal_reason, actor_principal_id, correlation_id)
  VALUES (p_withdrawal_id, 'DOMAIN', p_tenant, p_domain, b.scenario_id, b.branch_id, 'withdrawn', c.probability_id, btrim(p_reason), p_actor, p_correlation);
  INSERT INTO prediction.scenario_events (event_id, scope, tenant_id, domain_id, scenario_id, branch_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, b.scenario_id, b.branch_id, 'branch.probability_withdrawn', p_actor,
          jsonb_build_object('withdrawal_id', p_withdrawal_id, 'withdraws', c.probability_id, 'reason', btrim(p_reason), 'low', c.probability_low, 'high', c.probability_high, 'method', c.method), p_correlation);
  RETURN jsonb_build_object('withdrawal_id', p_withdrawal_id, 'withdraws', c.probability_id, 'scenario_id', b.scenario_id, 'branch_id', b.branch_id, 'branch', b.name, 'reason', btrim(p_reason), 'withdrawn_by', p_actor);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.withdraw_branch_probability(uuid,uuid,uuid,uuid,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.withdraw_branch_probability(uuid,uuid,uuid,uuid,text,uuid,uuid,uuid) TO eye_commit;

-- ═════════════════════════════════════════════════════════════════════
-- §Q.5 THE READ (an invoker read under the caller's RLS)
-- ═════════════════════════════════════════════════════════════════════
/* THE SCENARIO'S QUALITY: the scenario; the LATEST evaluation (null when none); the measures and findings AS OF NOW (live); the
   decision-activity (FEX-12: active, the coherence check not failed and the latest quality evaluation not failed — each reason named);
   each branch's standing probability with its method and basis (a suspended branch's shown, not summed) and the live lows' sum; the
   domain's active maps. Null when the scenario is not visible to the caller. */
CREATE OR REPLACE FUNCTION prediction.scenario_quality(p_scenario_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = prediction, pg_catalog, pg_temp AS $$
DECLARE s prediction.scenarios_current%ROWTYPE; l prediction.scenario_quality_evaluations%ROWTYPE; v_live jsonb; v_reasons jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO s FROM prediction.scenarios_current x WHERE x.scenario_id = p_scenario_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO l FROM prediction.scenario_quality_evaluations x WHERE x.scenario_id = p_scenario_id ORDER BY x.evaluated_at DESC, x.evaluation_id DESC LIMIT 1;
  v_live := prediction.scenario_quality_compute(p_scenario_id, prediction.scenario_quality_rule());
  IF s.state <> 'active' THEN v_reasons := v_reasons || to_jsonb(format('the scenario is %s', s.state)); END IF;
  IF s.coherence_state = 'failed' THEN v_reasons := v_reasons || to_jsonb('the coherence check (v1) failed'::text); END IF;
  IF l.outcome = 'failed' THEN v_reasons := v_reasons || to_jsonb(format('the quality evaluation of %s failed: %s', l.evaluated_at,
                                  (SELECT string_agg(DISTINCT q ->> 'rule', ', ') FROM jsonb_array_elements(l.findings) q WHERE q ->> 'outcome' = 'fail'))); END IF;
  RETURN jsonb_build_object(
    'at', clock_timestamp(),
    'scenario', jsonb_build_object('scenario_id', s.scenario_id, 'title', s.title, 'statement', s.statement, 'state', s.state, 'owner', s.owner_principal_id, 'current_version', s.current_version,
                                   'coherence_state', s.coherence_state, 'next_review_due_at', s.next_review_due_at),
    'rule', prediction.scenario_quality_rule(),
    'latest', CASE WHEN l.evaluation_id IS NULL THEN NULL ELSE to_jsonb(l) - 'tenant_id' - 'domain_id' - 'scope' - 'correlation_id' END,
    'evaluations', (SELECT count(*) FROM prediction.scenario_quality_evaluations x WHERE x.scenario_id = p_scenario_id),
    'live', v_live - 'fingerprint' - 'freshness_key',
    'quality_state', coalesce(l.outcome, 'unevaluated'),
    'decision_active', jsonb_build_object('value', jsonb_array_length(v_reasons) = 0, 'reasons', v_reasons),
    'branches', (SELECT coalesce(jsonb_agg(jsonb_build_object('branch_id', b.branch_id, 'name', b.name, 'kind', b.kind, 'kind_label', b.kind_label, 'state', b.state, 'live', prediction.branch_live(b.state),
                                                              'owner', b.owner_principal_id, 'indicator_id', b.indicator_id,
                                                              'probability', (SELECT to_jsonb(c) - 'tenant_id' - 'domain_id' - 'scope' - 'correlation_id' FROM prediction.branch_probabilities_current c WHERE c.branch_id = b.branch_id))
                                          ORDER BY b.added_at, b.name), '[]'::jsonb)
                   FROM prediction.branches_current b WHERE b.scenario_id = p_scenario_id AND b.state <> 'closed'),
    'probability_sum', jsonb_build_object('live_low', (SELECT coalesce(sum(c.probability_low), 0) FROM prediction.branch_probabilities_current c JOIN prediction.branches_current b ON b.branch_id = c.branch_id
                                                        WHERE c.scenario_id = p_scenario_id AND prediction.branch_live(b.state)),
                                          'live_high', (SELECT coalesce(sum(c.probability_high), 0) FROM prediction.branch_probabilities_current c JOIN prediction.branches_current b ON b.branch_id = c.branch_id
                                                        WHERE c.scenario_id = p_scenario_id AND prediction.branch_live(b.state)),
                                          'not_summed', (SELECT count(*) FROM prediction.branch_probabilities_current c JOIN prediction.branches_current b ON b.branch_id = c.branch_id
                                                          WHERE c.scenario_id = p_scenario_id AND NOT prediction.branch_live(b.state))),
    'history', (SELECT coalesce(jsonb_agg(to_jsonb(p) - 'tenant_id' - 'domain_id' - 'scope' - 'correlation_id' ORDER BY p.recorded_at DESC), '[]'::jsonb) FROM prediction.branch_probabilities p WHERE p.scenario_id = p_scenario_id),
    'maps', (SELECT coalesce(jsonb_agg(to_jsonb(m) - 'tenant_id' - 'domain_id' - 'scope' - 'correlation_id' ORDER BY m.name), '[]'::jsonb) FROM prediction.frequency_probability_maps m
              WHERE m.tenant_id = s.tenant_id AND m.domain_id = s.domain_id AND m.state = 'active'));
END $$;
GRANT EXECUTE ON FUNCTION prediction.scenario_quality(uuid) TO eye_app, eye_commit;
