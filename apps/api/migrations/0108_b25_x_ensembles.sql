-- 0108 §EN — CP-6 B25 part `ensembles` (F-P4-02): THE ENSEMBLE AND DISAGREEMENT MANAGER, the ensemble forecast with inspectable member
-- distributions and a declared, versioned combination rule, the disagreement analysis naming the assumptions that split the members,
-- MODEL-PATH AVAILABILITY (an unavailable path EXCLUDED and DISCLOSED), and the HUMAN JUDGEMENT OVERLAY versioned separately from model
-- output (human-only; agents refused; labelled JUDGEMENT; withdrawable). Rows V00-T-053, L6-C04, V03-T-129, V03-T-132, V03-T-327,
-- V03-T-326, ES-36-007, V04-T-029, PER-07.
--
-- It USES the prelude (§0): the forecast row's ensemble_id / ensemble_role / method_ref columns, SUPERSESSION BY LINEAGE in
-- prediction.issue_forecast (members coexist), the widened forecast event vocabulary (forecast.ensembled, forecast.member_excluded,
-- forecast.overlay_added, forecast.overlay_withdrawn) and FCT@v2. Nothing earlier is edited or re-declared.
--
-- THE LIFECYCLE ACROSS THREE GOVERNED WRITES. prediction.issue_forecast asserts `prediction.forecast.issue` (the prelude's port, not
-- re-declared), so an ensemble is issued as: (1) the ADMISSION under `prediction.ensemble.issue` — the run, its plan, budget, rules,
-- owner and its planned members (state admitted); (2) the ISSUANCE under `prediction.forecast.issue` — the members (ensemble_role
-- 'member') and the ensemble ('ensemble') admitted and issued in ONE transaction, each insert checked by `pen_fct_ensemble` against the
-- run (the first moves it to running); (3) the COMPLETION under `prediction.ensemble.issue` — the attempts, the exclusions disclosed,
-- the weights, the port's own divergence measure, the escalation; or the FAILURE (fewer than two members available). A run left
-- admitted or running (a crash between the writes) is RESUMED by its owner's route; a failed run is final (a new run is admitted).
--
-- Prefix `pen_`. Refusals: `ensemble rejected (<class>): …`, `judgement overlay rejected (<class>): …` (CLASS form, anchored rows in
-- observation-errors.ts' B25 ensembles block).

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §EN.1 THE RULES — declared, versioned constants (the B21 prediction.forecast_fitness_rule precedent). The TypeScript implements the
-- same versions (apps/api/src/prediction/ensembles/ensemble-math.ts); the harness compares the two.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION prediction.ensemble_rules() RETURNS jsonb LANGUAGE sql IMMUTABLE AS $r$ SELECT $j${
  "manager@1": {"kind": "manager", "version": 1, "min_members": 2, "max_members": 12, "max_attempts": 5, "max_compute_ms": 120000,
                "defaults": {"members": 6, "attempts": 2, "compute_ms": 30000},
                "statement": "an ensemble needs at least two included members; members are run in the plan's order; a member that fails is retried up to the budget's attempts and then EXCLUDED and disclosed; members beyond the member budget, or reached after the compute budget is spent, are EXCLUDED and disclosed; a run with fewer than two members FAILS and is escalated to its forecast owner"},
  "linear_pool@1": {"kind": "combination", "version": 1, "tail_ratio": 0.25,
                    "statement": "the members' distributions MIXED with the declared weights (a linear opinion pool); each member read as the piecewise-linear CDF through its 10/50/90 quantiles, with linear tails carrying 10% each over a quarter of the adjacent inner span; the pool's 10/50/90 quantiles solved by bisection"},
  "quantile_average@1": {"kind": "combination", "version": 1,
                         "statement": "the weighted average of the members' 10/50/90 quantiles (Vincentisation); refused when it is more precise than the members agree"},
  "disagreement@1": {"kind": "disagreement", "version": 1, "notable_gap": 0.25, "material_gap": 0.5, "material_overlap": 0.25, "gap_cap": 999,
                     "statement": "for every pair of included members: the median gap over the mean of their 10-90 widths (gap ratio) and the overlap of their 10-90 bands over the narrower width; MATERIAL when the gap ratio is at least 0.5 or the overlap at most 0.25, NOTABLE when the gap ratio is at least 0.25, else the members AGREE; the run's level is its worst pair"},
  "weighting": {"equal": "every included member weighs the same",
                "skill": "each member weighs the inverse of its mean pinball loss on the applicable backtest (same series, horizon and method version, evidence known by the cut-off, history ending by the origin); when any included member has none, equal weights are used and the answer says so"},
  "precision": {"statement": "PER-07: the combined 10-90 band must contain every included member's median; a combination more precise than the members agree is refused"}
}$j$::jsonb $r$;
GRANT EXECUTE ON FUNCTION prediction.ensemble_rules() TO eye_app, eye_commit;

/* THE DIVERGENCE MEASURE (disagreement@1), pure: p_members = [{ordinal, q10, q50, q90}] — the issued members' quantiles as stored. The
   completion port computes it itself and refuses a caller whose analysis claims another level; the TypeScript mirrors it (unit-tested). */
CREATE OR REPLACE FUNCTION prediction.ensemble_divergence(p_members jsonb, p_rule jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path = prediction, pg_catalog, pg_temp AS $$
DECLARE a jsonb; b jsonb; i int; j int; n int := jsonb_array_length(coalesce(p_members, '[]'::jsonb));
        wa numeric; wb numeric; ma numeric; mb numeric; gap numeric; spread numeric; ratio numeric; inter numeric; narrow numeric; overlap numeric;
        lvl text; worst text := 'agree'; max_ratio numeric := 0; min_overlap numeric := 1; pairs jsonb := '[]'::jsonb; drive jsonb := NULL;
        cap numeric := coalesce((p_rule ->> 'gap_cap')::numeric, 999);
BEGIN
  FOR i IN 0 .. n - 2 LOOP
    FOR j IN i + 1 .. n - 1 LOOP
      a := p_members -> i; b := p_members -> j;
      ma := (a ->> 'q50')::numeric; mb := (b ->> 'q50')::numeric;
      wa := (a ->> 'q90')::numeric - (a ->> 'q10')::numeric; wb := (b ->> 'q90')::numeric - (b ->> 'q10')::numeric;
      gap := abs(ma - mb); spread := (wa + wb) / 2;
      ratio := CASE WHEN spread > 0 THEN least(gap / spread, cap) WHEN gap > 0 THEN cap ELSE 0 END;
      inter := greatest(0, least((a ->> 'q90')::numeric, (b ->> 'q90')::numeric) - greatest((a ->> 'q10')::numeric, (b ->> 'q10')::numeric));
      narrow := least(wa, wb);
      overlap := CASE WHEN narrow > 0 THEN least(inter / narrow, 1)
                      WHEN wa <= wb THEN CASE WHEN ma BETWEEN (b ->> 'q10')::numeric AND (b ->> 'q90')::numeric THEN 1 ELSE 0 END
                      ELSE CASE WHEN mb BETWEEN (a ->> 'q10')::numeric AND (a ->> 'q90')::numeric THEN 1 ELSE 0 END END;
      lvl := CASE WHEN ratio >= (p_rule ->> 'material_gap')::numeric OR overlap <= (p_rule ->> 'material_overlap')::numeric THEN 'material'
                  WHEN ratio >= (p_rule ->> 'notable_gap')::numeric THEN 'notable' ELSE 'agree' END;
      pairs := pairs || jsonb_build_array(jsonb_build_object('a', a -> 'ordinal', 'b', b -> 'ordinal', 'gap', round(gap, 4), 'gap_ratio', round(ratio, 4),
                                                              'overlap', round(overlap, 4), 'level', lvl));
      IF drive IS NULL OR ratio > max_ratio THEN drive := jsonb_build_object('a', a -> 'ordinal', 'b', b -> 'ordinal'); END IF;
      max_ratio := greatest(max_ratio, ratio); min_overlap := least(min_overlap, overlap);
      worst := CASE WHEN worst = 'material' OR lvl = 'material' THEN 'material' WHEN worst = 'notable' OR lvl = 'notable' THEN 'notable' ELSE 'agree' END;
    END LOOP;
  END LOOP;
  RETURN jsonb_build_object('level', worst, 'max_gap_ratio', round(max_ratio, 4), 'min_overlap', round(min_overlap, 4), 'pairs', pairs, 'driving_pair', drive);
END $$;
GRANT EXECUTE ON FUNCTION prediction.ensemble_divergence(jsonb, jsonb) TO eye_app, eye_commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §EN.2 THE TABLES — the manager's run, its members, the attempts and the lifecycle ledger; the judgement overlays.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
CREATE TABLE prediction.ensemble_runs (
  run_id               uuid PRIMARY KEY,
  scope                text NOT NULL,
  tenant_id            uuid NOT NULL,
  domain_id            uuid NOT NULL,
  /* the ensemble forecast this run issues (minted at admission; the forecast row's forecast_id = ensemble_id = this) */
  ensemble_forecast_id uuid NOT NULL UNIQUE,
  series_key           text NOT NULL,
  target_key           text,
  subject_entity_id    uuid,
  horizon_code         text NOT NULL CHECK (horizon_code IN ('30d', '90d', '180d', '1y', '3y', '5y')),
  forecast_kind        text NOT NULL DEFAULT 'quantity' CHECK (forecast_kind = 'quantity'),
  known_at             timestamptz NOT NULL,
  observed_through     date,
  label                text NOT NULL CHECK (label IN ('replay demonstration', 'live')),
  refresh_cadence      text NOT NULL,
  /* the assumptions every member and the ensemble rest on (each member adds its own TIED set) */
  assumptions          uuid[] NOT NULL CHECK (cardinality(assumptions) >= 1),
  /* the METHOD_ROUTER's plan as received: {policy, methods[]} */
  plan                 jsonb NOT NULL CHECK (jsonb_typeof(plan) = 'object'),
  combination_rule     text NOT NULL,
  weighting            text NOT NULL CHECK (weighting IN ('equal', 'skill')),
  disagreement_rule    text NOT NULL,
  budget               jsonb NOT NULL CHECK (jsonb_typeof(budget) = 'object'),
  /* the forecast owner every escalation goes to: a named, active human holding forecast_owner in the domain */
  owner_principal_id   uuid NOT NULL,
  information_set_id   uuid,
  state                text NOT NULL CHECK (state IN ('admitted', 'running', 'completed', 'failed')),
  state_reason         text,
  outcome              jsonb,
  disagreement         jsonb,
  escalation           jsonb,
  attention_item_id    uuid,
  admitted_by          uuid NOT NULL,
  admitted_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  started_at           timestamptz,
  finished_at          timestamptz,
  correlation_id       uuid NOT NULL,
  CONSTRAINT pen_runs_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT pen_runs_finished CHECK ((state IN ('completed', 'failed')) = (finished_at IS NOT NULL)),
  CONSTRAINT pen_runs_failed_reason CHECK (state <> 'failed' OR state_reason IS NOT NULL),
  CONSTRAINT pen_runs_completed_outcome CHECK (state <> 'completed' OR (outcome IS NOT NULL AND disagreement IS NOT NULL))
);
/* ADMISSION: one live run per question (series, horizon, target, subject) at a time — a second is refused as a duplicate. */
CREATE UNIQUE INDEX pen_runs_one_live ON prediction.ensemble_runs
  (tenant_id, domain_id, series_key, horizon_code, coalesce(target_key, ''), coalesce(subject_entity_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE state IN ('admitted', 'running');
CREATE INDEX pen_runs_admitted ON prediction.ensemble_runs (tenant_id, domain_id, admitted_at DESC);
COMMENT ON TABLE prediction.ensemble_runs IS 'B25 §EN (0108; L6-C04): the Ensemble and Disagreement Manager''s runs — admitted → running → completed | failed, the plan, the budget, the rules, the owner, the outcome, the port''s divergence measure and the escalation; written by the ports and the pen_fct_ensemble trigger only.';

CREATE TABLE prediction.ensemble_members (
  run_id              uuid NOT NULL REFERENCES prediction.ensemble_runs (run_id),
  ordinal             int  NOT NULL CHECK (ordinal >= 1),
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  method_ref          text NOT NULL,
  family              text NOT NULL,
  forecast_kind       text NOT NULL,
  confidence_language text,
  available           boolean NOT NULL,
  unavailable_reason  text,
  /* the member's full assumption set (the run's ∪ its tied ones) and the tied ones alone — the disagreement names the latter */
  assumptions         uuid[] NOT NULL,
  tied_assumptions    uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  state               text NOT NULL CHECK (state IN ('planned', 'issued', 'excluded')),
  forecast_id         uuid UNIQUE,
  exclusion_class     text CHECK (exclusion_class IS NULL OR exclusion_class IN ('unavailable', 'unimplemented', 'kind', 'failed', 'budget', 'not_combined', 'not_run')),
  exclusion_reason    text,
  attempts            int NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  weight              numeric CHECK (weight IS NULL OR (weight >= 0 AND weight <= 1)),
  correlation_id      uuid NOT NULL,
  PRIMARY KEY (run_id, ordinal),
  CONSTRAINT pen_members_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT pen_members_issued CHECK ((state = 'issued') = (forecast_id IS NOT NULL)),
  CONSTRAINT pen_members_excluded CHECK ((state = 'excluded') = (exclusion_class IS NOT NULL AND exclusion_reason IS NOT NULL)),
  CONSTRAINT pen_members_unavailable CHECK (available OR unavailable_reason IS NOT NULL)
);
CREATE UNIQUE INDEX pen_members_method ON prediction.ensemble_members (run_id, method_ref);
COMMENT ON TABLE prediction.ensemble_members IS 'B25 §EN (0108; V03-T-129, V03-T-132): a run''s planned members in order, each tied to its assumption set — issued (its forecast) or EXCLUDED with the class and the reason disclosed.';

CREATE TABLE prediction.ensemble_attempts (
  attempt_id     uuid PRIMARY KEY,
  scope          text NOT NULL,
  tenant_id      uuid NOT NULL,
  domain_id      uuid NOT NULL,
  run_id         uuid NOT NULL REFERENCES prediction.ensemble_runs (run_id),
  ordinal        int  NOT NULL,
  method_ref     text NOT NULL,
  attempt        int  NOT NULL CHECK (attempt >= 1),
  outcome        text NOT NULL CHECK (outcome IN ('succeeded', 'failed')),
  error          text,
  duration_ms    int  NOT NULL CHECK (duration_ms >= 0),
  recorded_at    timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id uuid NOT NULL,
  CONSTRAINT pen_attempts_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT pen_attempts_error CHECK ((outcome = 'failed') = (error IS NOT NULL))
);
CREATE UNIQUE INDEX pen_attempts_one ON prediction.ensemble_attempts (run_id, ordinal, attempt);
CREATE TRIGGER pen_attempts_append_only BEFORE UPDATE OR DELETE ON prediction.ensemble_attempts FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE prediction.ensemble_attempts IS 'B25 §EN (0108; L6-C04): every member attempt (retries included) with its outcome and duration; append-only.';

CREATE TABLE prediction.ensemble_events (
  event_id           uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  run_id             uuid NOT NULL REFERENCES prediction.ensemble_runs (run_id),
  event              text NOT NULL CHECK (event IN ('ensemble.admitted', 'ensemble.started', 'ensemble.member_issued', 'ensemble.member_excluded',
                                                    'ensemble.completed', 'ensemble.failed', 'ensemble.escalated', 'ensemble.resumed')),
  actor_principal_id uuid NOT NULL,
  details            jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT pen_events_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX pen_events_run ON prediction.ensemble_events (run_id, occurred_at);
CREATE TRIGGER pen_events_append_only BEFORE UPDATE OR DELETE ON prediction.ensemble_events FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE prediction.ensemble_events IS 'B25 §EN (0108; L6-C04): the manager''s observable lifecycle ledger; append-only.';

CREATE TABLE prediction.judgement_overlays (
  overlay_id          uuid NOT NULL,
  version             int  NOT NULL CHECK (version >= 1),
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  forecast_id         uuid NOT NULL REFERENCES prediction.forecasts_current (forecast_id),
  forecast_kind       text NOT NULL,
  /* a named HUMAN forecast owner (an agent is refused) */
  author_principal_id uuid NOT NULL,
  /* {kind: quantiles, q10, q50, q90} | {kind: probability, p, low, high} | {kind: categories, categories: [{name, p}]} */
  adjustment          jsonb NOT NULL CHECK (jsonb_typeof(adjustment) = 'object'),
  /* the MODEL's own distribution when the overlay was made — restated, so the model output stays readable beside the judgement */
  model_distribution  jsonb NOT NULL CHECK (jsonb_typeof(model_distribution) = 'object'),
  rationale           text NOT NULL CHECK (length(btrim(rationale)) >= 16),
  /* what the judgement rests on: [{kind: evidence | strategy | forecast, id, version?}] — at least one */
  evidence            jsonb NOT NULL CHECK (jsonb_typeof(evidence) = 'array' AND jsonb_array_length(evidence) >= 1),
  label               text NOT NULL DEFAULT 'JUDGEMENT' CHECK (label = 'JUDGEMENT'),
  state               text NOT NULL CHECK (state IN ('active', 'superseded', 'withdrawn')),
  revises_version     int,
  created_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  superseded_at       timestamptz,
  withdrawn_by        uuid,
  withdrawn_at        timestamptz,
  withdrawal_reason   text,
  correlation_id      uuid NOT NULL,
  PRIMARY KEY (overlay_id, version),
  CONSTRAINT pen_overlays_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT pen_overlays_withdrawn CHECK ((state = 'withdrawn') = (withdrawn_at IS NOT NULL AND withdrawn_by IS NOT NULL AND withdrawal_reason IS NOT NULL)),
  CONSTRAINT pen_overlays_superseded CHECK ((state = 'superseded') = (superseded_at IS NOT NULL)),
  CONSTRAINT pen_overlays_revises CHECK ((version = 1) = (revises_version IS NULL) AND (revises_version IS NULL OR revises_version = version - 1))
);
/* ONE standing judgement per forecast: a second is a revision of the first (a new version), never a rival overlay. */
CREATE UNIQUE INDEX pen_overlays_one_active ON prediction.judgement_overlays (forecast_id) WHERE state = 'active';
CREATE INDEX pen_overlays_forecast ON prediction.judgement_overlays (forecast_id, created_at);
COMMENT ON TABLE prediction.judgement_overlays IS 'B25 §EN (0108; V03-T-327): the HUMAN judgement overlay on a forecast — versioned separately from the model output (which stays readable beside it), always labelled JUDGEMENT, authored by a named human forecast owner, revisable and withdrawable; content immutable.';

-- The guards: the ports write; content is fixed once written; only the lifecycle moves (and only forward).
CREATE OR REPLACE FUNCTION prediction.pen_runs_guard() RETURNS trigger SET search_path = prediction, pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'ensemble rejected (state): ensemble runs are append-only: DELETE prohibited' USING ERRCODE = '2F002'; END IF;
  IF OLD.state IN ('completed', 'failed') THEN
    RAISE EXCEPTION 'ensemble rejected (state): run % is % and immutable', OLD.run_id, OLD.state USING ERRCODE = '2F002';
  END IF;
  IF NOT ((OLD.state = NEW.state) OR (OLD.state = 'admitted' AND NEW.state IN ('running', 'failed')) OR (OLD.state = 'running' AND NEW.state IN ('completed', 'failed'))) THEN
    RAISE EXCEPTION 'ensemble rejected (state): run % cannot move from % to %', OLD.run_id, OLD.state, NEW.state USING ERRCODE = '2F002';
  END IF;
  IF (to_jsonb(NEW) - ARRAY['state', 'state_reason', 'outcome', 'disagreement', 'escalation', 'attention_item_id', 'started_at', 'finished_at'])
     <> (to_jsonb(OLD) - ARRAY['state', 'state_reason', 'outcome', 'disagreement', 'escalation', 'attention_item_id', 'started_at', 'finished_at']) THEN
    RAISE EXCEPTION 'ensemble rejected (state): run % — the question, plan, rules, budget and owner are fixed at admission', OLD.run_id USING ERRCODE = '2F002';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER pen_runs_guard BEFORE UPDATE OR DELETE ON prediction.ensemble_runs FOR EACH ROW EXECUTE FUNCTION prediction.pen_runs_guard();

CREATE OR REPLACE FUNCTION prediction.pen_members_guard() RETURNS trigger SET search_path = prediction, pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'ensemble rejected (state): ensemble members are append-only: DELETE prohibited' USING ERRCODE = '2F002'; END IF;
  IF OLD.state = 'excluded' OR (OLD.state = 'issued' AND NEW.state <> 'issued') OR (OLD.state = 'planned' AND NEW.state NOT IN ('planned', 'issued', 'excluded')) THEN
    RAISE EXCEPTION 'ensemble rejected (state): member % of run % cannot move from % to %', OLD.ordinal, OLD.run_id, OLD.state, NEW.state USING ERRCODE = '2F002';
  END IF;
  IF OLD.state = 'issued' AND (OLD.weight IS NOT NULL AND NEW.weight IS DISTINCT FROM OLD.weight) THEN
    RAISE EXCEPTION 'ensemble rejected (state): member % of run % is weighted once', OLD.ordinal, OLD.run_id USING ERRCODE = '2F002';
  END IF;
  IF (to_jsonb(NEW) - ARRAY['state', 'forecast_id', 'exclusion_class', 'exclusion_reason', 'attempts', 'weight'])
     <> (to_jsonb(OLD) - ARRAY['state', 'forecast_id', 'exclusion_class', 'exclusion_reason', 'attempts', 'weight']) THEN
    RAISE EXCEPTION 'ensemble rejected (state): member % of run % — its method, order and assumptions are fixed at admission', OLD.ordinal, OLD.run_id USING ERRCODE = '2F002';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER pen_members_guard BEFORE UPDATE OR DELETE ON prediction.ensemble_members FOR EACH ROW EXECUTE FUNCTION prediction.pen_members_guard();

CREATE OR REPLACE FUNCTION prediction.pen_overlays_guard() RETURNS trigger SET search_path = prediction, pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'judgement overlay rejected (state): overlays are append-only: DELETE prohibited' USING ERRCODE = '2F002'; END IF;
  IF OLD.state <> 'active' OR NEW.state NOT IN ('active', 'superseded', 'withdrawn') THEN
    RAISE EXCEPTION 'judgement overlay rejected (state): overlay % version % is %; only an active version is superseded or withdrawn', OLD.overlay_id, OLD.version, OLD.state USING ERRCODE = '2F002';
  END IF;
  IF (to_jsonb(NEW) - ARRAY['state', 'superseded_at', 'withdrawn_by', 'withdrawn_at', 'withdrawal_reason'])
     <> (to_jsonb(OLD) - ARRAY['state', 'superseded_at', 'withdrawn_by', 'withdrawn_at', 'withdrawal_reason']) THEN
    RAISE EXCEPTION 'judgement overlay rejected (state): overlay % version % — a judgement is revised as a new version, never edited', OLD.overlay_id, OLD.version USING ERRCODE = '2F002';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER pen_overlays_guard BEFORE UPDATE OR DELETE ON prediction.judgement_overlays FOR EACH ROW EXECUTE FUNCTION prediction.pen_overlays_guard();

-- RLS and grants: the 0081 loop idiom with the prediction_isolation policy text (0029:420-425 verbatim); the ports write, the app reads.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ensemble_runs', 'ensemble_members', 'ensemble_attempts', 'ensemble_events', 'judgement_overlays'] LOOP
    EXECUTE format('REVOKE ALL ON prediction.%I FROM PUBLIC', t);
    EXECUTE format('ALTER TABLE prediction.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE prediction.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY prediction_isolation ON prediction.%I
        USING (
          tenant_id = public.eye_tenant()
          AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain())
        )$f$, t);
    EXECUTE format('GRANT SELECT ON prediction.%I TO eye_app, eye_commit', t);
  END LOOP;
END $$;

-- The ensemble admission's canonical write row (MAP §EN): `prediction.ensemble.issue` may admit FCT objects. Today the members and the
-- ensemble are admitted under `prediction.forecast.issue` (the prelude's issue_forecast asserts that action alone — see the header), so
-- the row is unused by this part's routes; it is declared so a single-transaction issue is possible the day the issue port serves this
-- action too.
INSERT INTO observation.canonical_write_actions (action, object_types, rationale) VALUES
  ('prediction.ensemble.issue', ARRAY['FCT'], 'B25 §EN (0108): an ensemble issue admits its member and ensemble FCT versions')
ON CONFLICT (action) DO NOTHING;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §EN.3 THE CHECKS (private: no grant to the runtime roles)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
/* The acting principal is the one recorded. */
CREATE OR REPLACE FUNCTION prediction.pen_assert_actor(p_noun text, p_actor uuid) RETURNS void
SET search_path = prediction, pg_catalog, pg_temp AS $$
BEGIN
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN
    RAISE EXCEPTION '% rejected (actor): recorded by the acting principal', p_noun USING ERRCODE = '42501';
  END IF;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.pen_assert_actor(text, uuid) FROM PUBLIC;

/* A named, active HUMAN holding one of the roles in the domain (or its tenant). */
CREATE OR REPLACE FUNCTION prediction.pen_is_human_with(p_principal uuid, p_tenant uuid, p_domain uuid, p_roles text[]) RETURNS boolean
LANGUAGE sql STABLE SET search_path = prediction, identity, pg_catalog, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM identity.role_bindings b JOIN identity.principals p ON p.id = b.principal_id
                  WHERE b.principal_id = p_principal AND p.kind = 'human' AND p.status = 'active' AND b.revoked_at IS NULL
                    AND b.role_code = ANY (p_roles) AND b.tenant_id = p_tenant
                    AND ((b.scope = 'DOMAIN' AND b.domain_id = p_domain) OR b.scope = 'TENANT'))
$$;
REVOKE ALL ON FUNCTION prediction.pen_is_human_with(uuid, uuid, uuid, text[]) FROM PUBLIC;

/* Every id an ASU of the domain. */
CREATE OR REPLACE FUNCTION prediction.pen_assert_assumptions(p_noun text, p_ids uuid[], p_tenant uuid, p_domain uuid) RETURNS void
SET search_path = prediction, graph, pg_catalog, pg_temp AS $$
DECLARE a uuid;
BEGIN
  FOREACH a IN ARRAY coalesce(p_ids, ARRAY[]::uuid[]) LOOP
    IF NOT EXISTS (SELECT 1 FROM graph.strategy_current s WHERE s.strategy_object_id = a AND s.object_type = 'ASU' AND s.tenant_id = p_tenant AND s.domain_id = p_domain) THEN
      RAISE EXCEPTION '% rejected (unknown_assumption): % is not an assumption in this domain', p_noun, a USING ERRCODE = '23503';
    END IF;
  END LOOP;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.pen_assert_assumptions(text, uuid[], uuid, uuid) FROM PUBLIC;

/* THE ESCALATION to the run's forecast owner (L6-C04): always the ledger's ensemble.escalated; and — when the attention vocabulary
   carries the class `forecast.disagreement` (it does not today: the integrator widens it; this part never does) — the owner's attention
   item on the ensemble forecast (the 0097 psq_record_evaluation idiom). Returns the escalation record. */
CREATE OR REPLACE FUNCTION prediction.pen_escalate(p_run prediction.ensemble_runs, p_reason text, p_details jsonb, p_actor uuid, p_correlation uuid) RETURNS jsonb
SET search_path = prediction, executive, identity, pg_catalog, pg_temp AS $$
DECLARE v_item uuid; v_state text; v_channel text := 'event'; v_title text; v_event uuid := gen_random_uuid(); v_due timestamptz := clock_timestamp() + interval '72 hours';
BEGIN
  IF 'forecast.disagreement' = ANY (executive.attention_signal_classes()) THEN
    v_item := gen_random_uuid(); v_channel := 'attention_item';
    v_state := CASE WHEN EXISTS (SELECT 1 FROM identity.principals p WHERE p.id = p_run.owner_principal_id AND p.kind = 'human' AND p.status = 'active') THEN 'open' ELSE 'unrouted' END;
    v_title := left(format('Ensemble %s: %s at %s — %s', CASE WHEN p_run.state = 'failed' OR p_reason LIKE 'failed%%' THEN 'failed' ELSE 'disagreement' END, p_run.series_key, p_run.horizon_code, p_reason), 512);
    INSERT INTO executive.attention_items (item_id, scope, tenant_id, domain_id, signal_class, subject_kind, subject_id, cause_event_id, cause_event_type, title, outcome, state, owner_principal_id, route_roles, evaluation, details, due_at, escalations, correlation_id)
    VALUES (v_item, 'DOMAIN', p_run.tenant_id, p_run.domain_id, 'forecast.disagreement', 'forecast', p_run.ensemble_forecast_id, v_event, 'ensemble.escalated', v_title, 'material', v_state, p_run.owner_principal_id, '{}',
            jsonb_build_object('outcome', 'material', 'reasons', jsonb_build_array(p_reason), 'policy_version', NULL, 'dimensions', jsonb_build_object('consequence', 'C2', 'confidence', 1)),
            jsonb_build_object('run_id', p_run.run_id, 'ensemble_forecast_id', p_run.ensemble_forecast_id) || coalesce(p_details, '{}'::jsonb), v_due, 0, p_correlation);
    PERFORM executive.attention_event(v_item, p_run.tenant_id, p_run.domain_id, CASE v_state WHEN 'open' THEN 'item.routed' ELSE 'item.unrouted' END, p_actor,
              jsonb_build_object('outcome', 'material', 'reasons', jsonb_build_array(p_reason), 'policy_version', NULL, 'owner', p_run.owner_principal_id, 'route_roles', '[]'::jsonb,
                                 'due_at', v_due, 'cause_event_id', v_event, 'cause_event_type', 'ensemble.escalated', 'unrouted', v_state = 'unrouted', 'run_id', p_run.run_id), p_correlation);
  END IF;
  INSERT INTO prediction.ensemble_events (event_id, scope, tenant_id, domain_id, run_id, event, actor_principal_id, details, correlation_id)
  VALUES (v_event, 'DOMAIN', p_run.tenant_id, p_run.domain_id, p_run.run_id, 'ensemble.escalated', p_actor,
          jsonb_build_object('to', p_run.owner_principal_id, 'reason', p_reason, 'channel', v_channel, 'attention_item_id', v_item) || coalesce(p_details, '{}'::jsonb), p_correlation);
  RETURN jsonb_build_object('to', p_run.owner_principal_id, 'reason', p_reason, 'channel', v_channel, 'attention_item_id', v_item, 'event_id', v_event,
                            'class_available', v_channel = 'attention_item');
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.pen_escalate(prediction.ensemble_runs, text, jsonb, uuid, uuid) FROM PUBLIC;

/* The attempts and the exclusions a completion or a failure records (private): attempts = [{ordinal, attempt, outcome, error, duration_ms}],
   excluded = [{ordinal, class, reason}]. Each excluded member is disclosed on the ledger, and — when the ensemble forecast exists — on the
   forecast's own events (forecast.member_excluded). A completion (p_on_forecast) excludes paths that were lost; a FAILED run also excludes
   what it computed but could not combine (not_combined: a succeeded attempt on record) and what it never reached (not_run: no attempt). */
CREATE OR REPLACE FUNCTION prediction.pen_record_attempts_and_exclusions(p_run prediction.ensemble_runs, p_attempts jsonb, p_excluded jsonb, p_on_forecast boolean, p_actor uuid, p_correlation uuid)
RETURNS jsonb SET search_path = prediction, pg_catalog, pg_temp AS $$
DECLARE x jsonb; m prediction.ensemble_members%ROWTYPE; v_out jsonb := '[]'::jsonb; v_cls text; v_n int; p_run_failing boolean := NOT p_on_forecast;
BEGIN
  IF jsonb_typeof(coalesce(p_attempts, '[]'::jsonb)) <> 'array' OR jsonb_typeof(coalesce(p_excluded, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'ensemble rejected (outcome): attempts and excluded are lists' USING ERRCODE = '22023';
  END IF;
  FOR x IN SELECT * FROM jsonb_array_elements(coalesce(p_attempts, '[]'::jsonb)) LOOP
    SELECT * INTO m FROM prediction.ensemble_members WHERE run_id = p_run.run_id AND ordinal = (x ->> 'ordinal')::int;
    IF NOT FOUND THEN RAISE EXCEPTION 'ensemble rejected (outcome): attempt names member % — not a member of run %', x ->> 'ordinal', p_run.run_id USING ERRCODE = '22023'; END IF;
    IF (x ->> 'attempt')::int > (p_run.budget ->> 'attempts')::int THEN
      RAISE EXCEPTION 'ensemble rejected (budget): member % was attempted % time(s); the run''s budget allows %', m.ordinal, x ->> 'attempt', p_run.budget ->> 'attempts' USING ERRCODE = '22023';
    END IF;
    INSERT INTO prediction.ensemble_attempts (attempt_id, scope, tenant_id, domain_id, run_id, ordinal, method_ref, attempt, outcome, error, duration_ms, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_run.tenant_id, p_run.domain_id, p_run.run_id, m.ordinal, m.method_ref, (x ->> 'attempt')::int, x ->> 'outcome',
            CASE WHEN x ->> 'outcome' = 'failed' THEN left(coalesce(x ->> 'error', 'failed'), 1000) END, greatest(0, coalesce((x ->> 'duration_ms')::int, 0)), p_correlation);
  END LOOP;
  FOR x IN SELECT * FROM jsonb_array_elements(coalesce(p_excluded, '[]'::jsonb)) LOOP
    SELECT * INTO m FROM prediction.ensemble_members WHERE run_id = p_run.run_id AND ordinal = (x ->> 'ordinal')::int FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'ensemble rejected (outcome): exclusion names member % — not a member of run %', x ->> 'ordinal', p_run.run_id USING ERRCODE = '22023'; END IF;
    IF m.state <> 'planned' THEN RAISE EXCEPTION 'ensemble rejected (outcome): member % of run % is %, not excludable', m.ordinal, p_run.run_id, m.state USING ERRCODE = '22023'; END IF;
    v_cls := x ->> 'class';
    IF v_cls IS NULL OR v_cls NOT IN ('unavailable', 'unimplemented', 'kind', 'failed', 'budget', 'not_combined', 'not_run') OR coalesce(length(btrim(x ->> 'reason')), 0) < 8 THEN
      RAISE EXCEPTION 'ensemble rejected (outcome): an exclusion names its class (unavailable | unimplemented | kind | failed | budget | not_combined | not_run) and its reason' USING ERRCODE = '22023';
    END IF;
    IF v_cls = 'unavailable' AND m.available THEN RAISE EXCEPTION 'ensemble rejected (outcome): member % was planned available; it is not excluded as unavailable', m.ordinal USING ERRCODE = '22023'; END IF;
    IF NOT m.available AND v_cls <> 'unavailable' THEN RAISE EXCEPTION 'ensemble rejected (outcome): member % was planned unavailable (%); it is excluded as unavailable', m.ordinal, m.unavailable_reason USING ERRCODE = '22023'; END IF;
    SELECT count(*) INTO v_n FROM prediction.ensemble_attempts a WHERE a.run_id = p_run.run_id AND a.ordinal = m.ordinal;
    IF v_cls IN ('not_combined', 'not_run') AND NOT p_run_failing THEN
      RAISE EXCEPTION 'ensemble rejected (outcome): member % — not_combined and not_run are a FAILED run''s classes', m.ordinal USING ERRCODE = '22023';
    END IF;
    IF v_cls = 'not_combined' AND NOT EXISTS (SELECT 1 FROM prediction.ensemble_attempts a WHERE a.run_id = p_run.run_id AND a.ordinal = m.ordinal AND a.outcome = 'succeeded') THEN
      RAISE EXCEPTION 'ensemble rejected (outcome): member % is excluded as computed-but-not-combined with no succeeded attempt recorded', m.ordinal USING ERRCODE = '22023';
    END IF;
    IF v_cls = 'not_run' AND v_n > 0 THEN
      RAISE EXCEPTION 'ensemble rejected (outcome): member % was attempted; it is not excluded as not run', m.ordinal USING ERRCODE = '22023';
    END IF;
    IF v_cls = 'failed' AND NOT EXISTS (SELECT 1 FROM prediction.ensemble_attempts a WHERE a.run_id = p_run.run_id AND a.ordinal = m.ordinal AND a.outcome = 'failed') THEN
      RAISE EXCEPTION 'ensemble rejected (outcome): member % is excluded as failed with no failed attempt recorded', m.ordinal USING ERRCODE = '22023';
    END IF;
    UPDATE prediction.ensemble_members SET state = 'excluded', exclusion_class = v_cls, exclusion_reason = x ->> 'reason', attempts = v_n
     WHERE run_id = p_run.run_id AND ordinal = m.ordinal;
    INSERT INTO prediction.ensemble_events (event_id, scope, tenant_id, domain_id, run_id, event, actor_principal_id, details, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_run.tenant_id, p_run.domain_id, p_run.run_id, 'ensemble.member_excluded', p_actor,
            jsonb_build_object('ordinal', m.ordinal, 'method_ref', m.method_ref, 'class', v_cls, 'reason', x ->> 'reason', 'attempts', v_n), p_correlation);
    IF p_on_forecast THEN
      INSERT INTO prediction.forecast_events (event_id, scope, tenant_id, domain_id, forecast_id, event, actor_principal_id, details, correlation_id)
      VALUES (gen_random_uuid(), 'DOMAIN', p_run.tenant_id, p_run.domain_id, p_run.ensemble_forecast_id, 'forecast.member_excluded', p_actor,
              jsonb_build_object('run_id', p_run.run_id, 'ordinal', m.ordinal, 'method_ref', m.method_ref, 'class', v_cls, 'reason', x ->> 'reason', 'attempts', v_n), p_correlation);
    END IF;
    v_out := v_out || jsonb_build_array(jsonb_build_object('ordinal', m.ordinal, 'method_ref', m.method_ref, 'class', v_cls, 'reason', x ->> 'reason', 'attempts', v_n));
  END LOOP;
  -- the issued members' attempt counts
  UPDATE prediction.ensemble_members mm SET attempts = (SELECT count(*) FROM prediction.ensemble_attempts a WHERE a.run_id = mm.run_id AND a.ordinal = mm.ordinal)
   WHERE mm.run_id = p_run.run_id AND mm.state = 'issued';
  RETURN v_out;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.pen_record_attempts_and_exclusions(prediction.ensemble_runs, jsonb, jsonb, boolean, uuid, uuid) FROM PUBLIC;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §EN.4 THE ISSUE CHECK on the forecast row (the issuance write, under prediction.forecast.issue): a forecast that names an ensemble
-- must answer a live run's question — a member a planned member resting on its tied assumptions, the ensemble the run's own forecast
-- with at least two members issued before it. The first such insert moves the run to running. A forecast's lineage never changes.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION prediction.pen_fct_ensemble() RETURNS trigger
SECURITY DEFINER SET search_path = prediction, pg_catalog, pg_temp AS $$
DECLARE r prediction.ensemble_runs%ROWTYPE; m prediction.ensemble_members%ROWTYPE; v_issued int;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.ensemble_id IS DISTINCT FROM OLD.ensemble_id OR NEW.ensemble_role IS DISTINCT FROM OLD.ensemble_role THEN
      RAISE EXCEPTION 'ensemble rejected (state): forecast % — its ensemble lineage is fixed at issue', OLD.forecast_id USING ERRCODE = '2F002';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.ensemble_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO r FROM prediction.ensemble_runs x WHERE x.ensemble_forecast_id = NEW.ensemble_id AND x.tenant_id = NEW.tenant_id AND x.domain_id = NEW.domain_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ensemble rejected (unknown_run): forecast % names ensemble % — no ensemble run of this domain issues it', NEW.forecast_id, NEW.ensemble_id USING ERRCODE = '23503';
  END IF;
  IF r.state NOT IN ('admitted', 'running') THEN
    RAISE EXCEPTION 'ensemble rejected (state): run % is %; nothing more is issued under it', r.run_id, r.state USING ERRCODE = '22023';
  END IF;
  IF NEW.series_key <> r.series_key OR NEW.horizon_code <> r.horizon_code OR NEW.target_key IS DISTINCT FROM r.target_key
     OR NEW.subject_entity_id IS DISTINCT FROM r.subject_entity_id OR NEW.known_at <> r.known_at OR NEW.forecast_kind <> r.forecast_kind OR NEW.label <> r.label THEN
    RAISE EXCEPTION 'ensemble rejected (mismatch): forecast % does not answer run %''s question (series, horizon, target, subject, cut-off, kind, label)', NEW.forecast_id, r.run_id USING ERRCODE = '22023';
  END IF;
  IF NOT (r.assumptions <@ NEW.assumptions) THEN
    RAISE EXCEPTION 'ensemble rejected (mismatch): forecast % does not rest on run %''s assumptions', NEW.forecast_id, r.run_id USING ERRCODE = '22023';
  END IF;
  IF r.state = 'admitted' AND NEW.ensemble_role = 'member' THEN
    UPDATE prediction.ensemble_runs SET state = 'running', started_at = clock_timestamp() WHERE run_id = r.run_id;
    INSERT INTO prediction.ensemble_events (event_id, scope, tenant_id, domain_id, run_id, event, actor_principal_id, details, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', r.tenant_id, r.domain_id, r.run_id, 'ensemble.started', NEW.issued_by, jsonb_build_object('first_forecast_id', NEW.forecast_id), NEW.correlation_id);
  END IF;
  IF NEW.ensemble_role = 'member' THEN
    SELECT * INTO m FROM prediction.ensemble_members x WHERE x.run_id = r.run_id AND x.method_ref = NEW.method_ref FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'ensemble rejected (member): % is not a planned member of run %', coalesce(NEW.method_ref, '<no method_ref>'), r.run_id USING ERRCODE = '22023';
    END IF;
    IF m.state <> 'planned' OR NOT m.available THEN
      RAISE EXCEPTION 'ensemble rejected (state): member % (%) of run % is %', m.ordinal, m.method_ref, r.run_id, CASE WHEN m.available THEN m.state ELSE 'unavailable' END USING ERRCODE = '22023';
    END IF;
    IF NOT (m.assumptions <@ NEW.assumptions) THEN
      RAISE EXCEPTION 'ensemble rejected (member): member % is tied to assumptions %; its forecast must rest on them', m.method_ref, m.assumptions USING ERRCODE = '22023';
    END IF;
    UPDATE prediction.ensemble_members SET state = 'issued', forecast_id = NEW.forecast_id WHERE run_id = r.run_id AND ordinal = m.ordinal;
    INSERT INTO prediction.ensemble_events (event_id, scope, tenant_id, domain_id, run_id, event, actor_principal_id, details, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', r.tenant_id, r.domain_id, r.run_id, 'ensemble.member_issued', NEW.issued_by,
            jsonb_build_object('ordinal', m.ordinal, 'method_ref', m.method_ref, 'forecast_id', NEW.forecast_id, 'quantiles', NEW.quantiles), NEW.correlation_id);
  ELSE
    SELECT count(*) INTO v_issued FROM prediction.ensemble_members x WHERE x.run_id = r.run_id AND x.state = 'issued';
    IF v_issued < 2 THEN
      RAISE EXCEPTION 'ensemble rejected (insufficient): run % has % member(s) issued; an ensemble combines at least two', r.run_id, v_issued USING ERRCODE = '22023';
    END IF;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.pen_fct_ensemble() FROM PUBLIC;
CREATE TRIGGER pen_fct_ensemble BEFORE INSERT OR UPDATE OF ensemble_id, ensemble_role ON prediction.forecasts_current
  FOR EACH ROW EXECUTE FUNCTION prediction.pen_fct_ensemble();

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §EN.5 THE MANAGER'S PORTS (action prediction.ensemble.issue)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
/* ADMIT a run: the question, the router's plan, the members in order (each tied to its assumption set), the rules, the budget and the
   forecast owner. p_request = {series_key, target_key, horizon_code, known_at, observed_through, label, refresh_cadence, assumptions[],
   combination_rule, weighting, disagreement_rule, budget {members, attempts, compute_ms}, owner, information_set_id};
   p_members = [{ordinal, method_ref, family, forecast_kind, available, unavailable_reason, confidence_language, tied_assumptions[]}]. */
CREATE OR REPLACE FUNCTION prediction.admit_ensemble_run(
  p_run_id uuid, p_tenant uuid, p_domain uuid, p_ensemble_forecast_id uuid, p_request jsonb, p_plan jsonb, p_members jsonb,
  p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, graph, observation, executive, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE rules jsonb := prediction.ensemble_rules(); mgr jsonb; s prediction.series_registry%ROWTYPE; x jsonb; v_shared uuid[]; v_tied uuid[];
        v_budget jsonb; v_members int; v_attempts int; v_compute int; v_owner uuid; v_n int; v_refs text[] := ARRAY[]::text[]; v_ords int[] := ARRAY[]::int[];
        v_live prediction.ensemble_runs%ROWTYPE; v_known timestamptz; v_kind text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.ensemble.issue']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM prediction.pen_assert_actor('ensemble', p_actor);
  mgr := rules -> 'manager@1';
  IF p_request IS NULL OR jsonb_typeof(p_request) <> 'object' THEN RAISE EXCEPTION 'ensemble rejected (request): the request is an object' USING ERRCODE = '22023'; END IF;
  IF (p_request ->> 'horizon_code') IS NULL OR (p_request ->> 'horizon_code') NOT IN ('30d', '90d', '180d', '1y', '3y', '5y') THEN
    RAISE EXCEPTION 'ensemble rejected (horizon): the horizon is one of 30d, 90d, 180d, 1y, 3y, 5y' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO s FROM prediction.series_registry r WHERE r.tenant_id = p_tenant AND r.domain_id = p_domain AND r.series_key = p_request ->> 'series_key';
  IF NOT FOUND THEN RAISE EXCEPTION 'ensemble rejected (unknown_series): series % is not registered in this domain', coalesce(p_request ->> 'series_key', '<none>') USING ERRCODE = '23503'; END IF;
  v_known := (p_request ->> 'known_at')::timestamptz;
  IF v_known IS NULL OR v_known > clock_timestamp() + interval '5 minutes' THEN
    RAISE EXCEPTION 'ensemble rejected (cutoff): the cut-off (known_at) is an instant no later than now' USING ERRCODE = '22023';
  END IF;
  IF (p_request ->> 'label') NOT IN ('replay demonstration', 'live') THEN RAISE EXCEPTION 'ensemble rejected (request): the label is replay demonstration or live' USING ERRCODE = '22023'; END IF;
  v_shared := ARRAY(SELECT jsonb_array_elements_text(coalesce(p_request -> 'assumptions', '[]'::jsonb))::uuid);
  IF cardinality(v_shared) = 0 THEN
    RAISE EXCEPTION 'ensemble rejected (assumptions): an ensemble names at least one assumption every member rests on' USING ERRCODE = '22023';
  END IF;
  PERFORM prediction.pen_assert_assumptions('ensemble', v_shared, p_tenant, p_domain);
  IF rules -> (p_request ->> 'combination_rule') IS NULL OR rules #>> ARRAY[p_request ->> 'combination_rule', 'kind'] <> 'combination' THEN
    RAISE EXCEPTION 'ensemble rejected (rule): % is not a declared combination rule (linear_pool@1, quantile_average@1)', coalesce(p_request ->> 'combination_rule', '<none>') USING ERRCODE = '22023';
  END IF;
  IF rules -> (p_request ->> 'disagreement_rule') IS NULL OR rules #>> ARRAY[p_request ->> 'disagreement_rule', 'kind'] <> 'disagreement' THEN
    RAISE EXCEPTION 'ensemble rejected (rule): % is not a declared disagreement rule (disagreement@1)', coalesce(p_request ->> 'disagreement_rule', '<none>') USING ERRCODE = '22023';
  END IF;
  IF coalesce(p_request ->> 'weighting', '') NOT IN ('equal', 'skill') THEN RAISE EXCEPTION 'ensemble rejected (rule): the weighting is equal or skill' USING ERRCODE = '22023'; END IF;
  v_members := coalesce((p_request #>> '{budget,members}')::int, (mgr #>> '{defaults,members}')::int);
  v_attempts := coalesce((p_request #>> '{budget,attempts}')::int, (mgr #>> '{defaults,attempts}')::int);
  v_compute := coalesce((p_request #>> '{budget,compute_ms}')::int, (mgr #>> '{defaults,compute_ms}')::int);
  IF v_members < (mgr ->> 'min_members')::int OR v_members > (mgr ->> 'max_members')::int OR v_attempts < 1 OR v_attempts > (mgr ->> 'max_attempts')::int
     OR v_compute < 100 OR v_compute > (mgr ->> 'max_compute_ms')::int THEN
    RAISE EXCEPTION 'ensemble rejected (budget): members %–%, attempts 1–%, compute 100–% ms (asked %, %, %)', mgr ->> 'min_members', mgr ->> 'max_members', mgr ->> 'max_attempts', mgr ->> 'max_compute_ms',
      v_members, v_attempts, v_compute USING ERRCODE = '22023';
  END IF;
  v_budget := jsonb_build_object('members', v_members, 'attempts', v_attempts, 'compute_ms', v_compute);
  v_owner := (p_request ->> 'owner')::uuid;
  IF v_owner IS NULL OR NOT prediction.pen_is_human_with(v_owner, p_tenant, p_domain, ARRAY['forecast_owner']) THEN
    RAISE EXCEPTION 'ensemble rejected (owner): the run''s owner (who every escalation reaches) is a named, active human holding forecast_owner in this domain' USING ERRCODE = '22023';
  END IF;
  IF p_plan IS NULL OR jsonb_typeof(p_plan) <> 'object' OR jsonb_typeof(p_plan -> 'methods') <> 'array' THEN
    RAISE EXCEPTION 'ensemble rejected (plan): the plan is the router''s {policy, methods[]}' USING ERRCODE = '22023';
  END IF;
  IF p_members IS NULL OR jsonb_typeof(p_members) <> 'array' OR jsonb_array_length(p_members) < 1 THEN
    RAISE EXCEPTION 'ensemble rejected (plan): the router planned no method for % at %', s.series_key, p_request ->> 'horizon_code' USING ERRCODE = '22023';
  END IF;
  FOR x IN SELECT * FROM jsonb_array_elements(p_members) LOOP
    IF coalesce(length(x ->> 'method_ref'), 0) < 2 OR (x ->> 'ordinal') IS NULL THEN RAISE EXCEPTION 'ensemble rejected (plan): every member names its ordinal and method_ref' USING ERRCODE = '22023'; END IF;
    IF (x ->> 'method_ref') = ANY (v_refs) OR (x ->> 'ordinal')::int = ANY (v_ords) THEN
      RAISE EXCEPTION 'ensemble rejected (plan): member % (%) is named twice', x ->> 'ordinal', x ->> 'method_ref' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_plan -> 'methods') pm WHERE pm ->> 'methodRef' = x ->> 'method_ref') THEN
      RAISE EXCEPTION 'ensemble rejected (plan): % is not in the router''s plan for % at %', x ->> 'method_ref', s.series_key, p_request ->> 'horizon_code' USING ERRCODE = '22023';
    END IF;
    v_refs := v_refs || (x ->> 'method_ref'); v_ords := v_ords || (x ->> 'ordinal')::int;
    v_tied := ARRAY(SELECT jsonb_array_elements_text(coalesce(x -> 'tied_assumptions', '[]'::jsonb))::uuid);
    PERFORM prediction.pen_assert_assumptions('ensemble', v_tied, p_tenant, p_domain);
  END LOOP;
  IF (SELECT max(o) FROM unnest(v_ords) o) <> cardinality(v_ords) OR (SELECT min(o) FROM unnest(v_ords) o) <> 1 THEN
    RAISE EXCEPTION 'ensemble rejected (plan): the members are ordered 1..%', cardinality(v_ords) USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_live FROM prediction.ensemble_runs x
   WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.series_key = s.series_key AND x.horizon_code = p_request ->> 'horizon_code'
     AND x.target_key IS NOT DISTINCT FROM (p_request ->> 'target_key') AND x.subject_entity_id IS NOT DISTINCT FROM s.subject_entity_id AND x.state IN ('admitted', 'running');
  IF FOUND THEN
    RAISE EXCEPTION 'ensemble rejected (duplicate): run % is % for this question (%, %); it is resumed or finished before another is admitted', v_live.run_id, v_live.state, s.series_key, p_request ->> 'horizon_code' USING ERRCODE = '23505';
  END IF;
  INSERT INTO prediction.ensemble_runs (run_id, scope, tenant_id, domain_id, ensemble_forecast_id, series_key, target_key, subject_entity_id, horizon_code, forecast_kind,
                                        known_at, observed_through, label, refresh_cadence, assumptions, plan, combination_rule, weighting, disagreement_rule, budget,
                                        owner_principal_id, information_set_id, state, admitted_by, correlation_id)
  VALUES (p_run_id, 'DOMAIN', p_tenant, p_domain, p_ensemble_forecast_id, s.series_key, p_request ->> 'target_key', s.subject_entity_id, p_request ->> 'horizon_code', 'quantity',
          v_known, (p_request ->> 'observed_through')::date, p_request ->> 'label', coalesce(p_request ->> 'refresh_cadence', 'daily'), v_shared, p_plan,
          p_request ->> 'combination_rule', p_request ->> 'weighting', p_request ->> 'disagreement_rule', v_budget, v_owner, (p_request ->> 'information_set_id')::uuid, 'admitted', p_actor, p_correlation);
  FOR x IN SELECT * FROM jsonb_array_elements(p_members) LOOP
    v_tied := ARRAY(SELECT jsonb_array_elements_text(coalesce(x -> 'tied_assumptions', '[]'::jsonb))::uuid);
    v_kind := coalesce(x ->> 'forecast_kind', 'quantity');
    INSERT INTO prediction.ensemble_members (run_id, ordinal, scope, tenant_id, domain_id, method_ref, family, forecast_kind, confidence_language, available, unavailable_reason,
                                             assumptions, tied_assumptions, state, correlation_id)
    VALUES (p_run_id, (x ->> 'ordinal')::int, 'DOMAIN', p_tenant, p_domain, x ->> 'method_ref', coalesce(x ->> 'family', 'statistical'), v_kind, x ->> 'confidence_language',
            coalesce((x ->> 'available')::boolean, true), CASE WHEN coalesce((x ->> 'available')::boolean, true) THEN NULL ELSE coalesce(x ->> 'unavailable_reason', 'the registry lists the method path unavailable') END,
            ARRAY(SELECT DISTINCT u FROM unnest(v_shared || v_tied) u), v_tied, 'planned', p_correlation);
  END LOOP;
  SELECT count(*) INTO v_n FROM prediction.ensemble_members WHERE run_id = p_run_id;
  INSERT INTO prediction.ensemble_events (event_id, scope, tenant_id, domain_id, run_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_run_id, 'ensemble.admitted', p_actor,
          jsonb_build_object('ensemble_forecast_id', p_ensemble_forecast_id, 'series_key', s.series_key, 'horizon', p_request ->> 'horizon_code', 'members', v_n,
                             'combination_rule', p_request ->> 'combination_rule', 'weighting', p_request ->> 'weighting', 'budget', v_budget, 'owner', v_owner,
                             'policy', p_plan -> 'policy'), p_correlation);
  RETURN prediction.pen_run_answer(p_run_id);
END $$ LANGUAGE plpgsql;

/* The run as a port answers it (private): the row, its members in order and its ledger. */
CREATE OR REPLACE FUNCTION prediction.pen_run_answer(p_run_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = prediction, pg_catalog, pg_temp AS $$
  SELECT to_jsonb(r) || jsonb_build_object(
    'members', coalesce((SELECT jsonb_agg(to_jsonb(m) ORDER BY m.ordinal) FROM prediction.ensemble_members m WHERE m.run_id = r.run_id), '[]'::jsonb))
    FROM prediction.ensemble_runs r WHERE r.run_id = p_run_id
$$;
REVOKE ALL ON FUNCTION prediction.pen_run_answer(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION prediction.admit_ensemble_run(uuid,uuid,uuid,uuid,jsonb,jsonb,jsonb,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.admit_ensemble_run(uuid,uuid,uuid,uuid,jsonb,jsonb,jsonb,uuid,uuid,uuid) TO eye_commit;

/* COMPLETE a running run whose ensemble forecast is issued: p_outcome = {attempts[], excluded[], weights [{ordinal, weight}], compute_ms,
   weighting_used, analysis {level, splitting_assumptions, structural, statement}}. Every planned member is issued (weighted) or excluded
   (disclosed); the PORT computes the divergence from the issued members' stored quantiles under the run's rule and refuses an analysis
   that claims another level; forecast.ensembled on the ensemble forecast; material disagreement is escalated to the owner. */
CREATE OR REPLACE FUNCTION prediction.complete_ensemble_run(
  p_run_id uuid, p_tenant uuid, p_domain uuid, p_outcome jsonb, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, graph, observation, executive, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r prediction.ensemble_runs%ROWTYPE; f prediction.forecasts_current%ROWTYPE; x jsonb; v_excluded jsonb; v_div jsonb; v_members jsonb; v_sum numeric := 0;
        v_esc jsonb := NULL; v_dis jsonb; v_left int; v_w numeric;
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.ensemble.issue']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM prediction.pen_assert_actor('ensemble', p_actor);
  SELECT * INTO r FROM prediction.ensemble_runs x WHERE x.run_id = p_run_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ensemble rejected (unknown_run): no ensemble run % in this domain', p_run_id USING ERRCODE = '23503'; END IF;
  IF r.state <> 'running' THEN RAISE EXCEPTION 'ensemble rejected (state): run % is %; only a running run completes', p_run_id, r.state USING ERRCODE = '22023'; END IF;
  SELECT * INTO f FROM prediction.forecasts_current x WHERE x.forecast_id = r.ensemble_forecast_id;
  IF NOT FOUND OR f.ensemble_role IS DISTINCT FROM 'ensemble' THEN
    RAISE EXCEPTION 'ensemble rejected (state): run %''s ensemble forecast % is not issued; a run completes after its ensemble', p_run_id, r.ensemble_forecast_id USING ERRCODE = '22023';
  END IF;
  IF p_outcome IS NULL OR jsonb_typeof(p_outcome) <> 'object' THEN RAISE EXCEPTION 'ensemble rejected (outcome): the outcome is an object' USING ERRCODE = '22023'; END IF;
  v_excluded := prediction.pen_record_attempts_and_exclusions(r, p_outcome -> 'attempts', p_outcome -> 'excluded', true, p_actor, p_correlation);
  SELECT count(*) INTO v_left FROM prediction.ensemble_members m WHERE m.run_id = p_run_id AND m.state = 'planned';
  IF v_left > 0 THEN
    RAISE EXCEPTION 'ensemble rejected (outcome): % planned member(s) of run % are neither issued nor excluded — every lost path is disclosed', v_left, p_run_id USING ERRCODE = '22023';
  END IF;
  FOR x IN SELECT * FROM jsonb_array_elements(coalesce(p_outcome -> 'weights', '[]'::jsonb)) LOOP
    v_w := (x ->> 'weight')::numeric;
    IF v_w IS NULL OR v_w < 0 OR v_w > 1 THEN RAISE EXCEPTION 'ensemble rejected (outcome): weight % of member % is not in [0, 1]', x ->> 'weight', x ->> 'ordinal' USING ERRCODE = '22023'; END IF;
    UPDATE prediction.ensemble_members SET weight = round(v_w, 6) WHERE run_id = p_run_id AND ordinal = (x ->> 'ordinal')::int AND state = 'issued';
    IF NOT FOUND THEN RAISE EXCEPTION 'ensemble rejected (outcome): weight names member % — not an issued member of run %', x ->> 'ordinal', p_run_id USING ERRCODE = '22023'; END IF;
    v_sum := v_sum + v_w;
  END LOOP;
  IF EXISTS (SELECT 1 FROM prediction.ensemble_members m WHERE m.run_id = p_run_id AND m.state = 'issued' AND m.weight IS NULL) OR abs(v_sum - 1) > 0.000001 THEN
    RAISE EXCEPTION 'ensemble rejected (outcome): every issued member carries a weight and the weights sum to 1 (sum %)', round(v_sum, 6) USING ERRCODE = '22023';
  END IF;
  SELECT jsonb_agg(jsonb_build_object('ordinal', m.ordinal, 'q10', (g.quantiles ->> 'q10')::numeric, 'q50', (g.quantiles ->> 'q50')::numeric, 'q90', (g.quantiles ->> 'q90')::numeric) ORDER BY m.ordinal)
    INTO v_members FROM prediction.ensemble_members m JOIN prediction.forecasts_current g ON g.forecast_id = m.forecast_id WHERE m.run_id = p_run_id AND m.state = 'issued';
  v_div := prediction.ensemble_divergence(v_members, prediction.ensemble_rules() -> r.disagreement_rule);
  IF (p_outcome #>> '{analysis,level}') IS DISTINCT FROM (v_div ->> 'level') THEN
    RAISE EXCEPTION 'ensemble rejected (disagreement): the analysis claims %; the members as issued disagree at % under % (max gap ratio %)',
      coalesce(p_outcome #>> '{analysis,level}', '<none>'), v_div ->> 'level', r.disagreement_rule, v_div ->> 'max_gap_ratio' USING ERRCODE = '22023';
  END IF;
  v_dis := v_div || jsonb_build_object('rule', r.disagreement_rule, 'measured_by', 'port', 'analysis', p_outcome -> 'analysis');
  IF v_div ->> 'level' = 'material' THEN
    v_esc := prediction.pen_escalate(r, 'material disagreement between the members (max gap ratio ' || (v_div ->> 'max_gap_ratio') || ')',
                                     jsonb_build_object('level', 'material', 'driving_pair', v_div -> 'driving_pair', 'splitting_assumptions', p_outcome #> '{analysis,splitting_assumptions}'),
                                     p_actor, p_correlation);
  END IF;
  UPDATE prediction.ensemble_runs SET state = 'completed', finished_at = clock_timestamp(), disagreement = v_dis, escalation = v_esc,
         attention_item_id = (v_esc ->> 'attention_item_id')::uuid,
         outcome = jsonb_build_object('included', (SELECT count(*) FROM prediction.ensemble_members m WHERE m.run_id = p_run_id AND m.state = 'issued'),
                                      'excluded', v_excluded, 'weights', p_outcome -> 'weights', 'weighting_used', p_outcome -> 'weighting_used',
                                      'compute_ms', p_outcome -> 'compute_ms', 'quantiles', f.quantiles)
   WHERE run_id = p_run_id;
  INSERT INTO prediction.forecast_events (event_id, scope, tenant_id, domain_id, forecast_id, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, r.ensemble_forecast_id, 'forecast.ensembled', p_actor,
          jsonb_build_object('run_id', p_run_id, 'combination_rule', r.combination_rule, 'weighting_used', p_outcome -> 'weighting_used',
                             'members', (SELECT jsonb_agg(jsonb_build_object('ordinal', m.ordinal, 'method_ref', m.method_ref, 'forecast_id', m.forecast_id, 'weight', m.weight) ORDER BY m.ordinal)
                                           FROM prediction.ensemble_members m WHERE m.run_id = p_run_id AND m.state = 'issued'),
                             'excluded', jsonb_array_length(v_excluded), 'disagreement', v_div ->> 'level', 'max_gap_ratio', v_div -> 'max_gap_ratio'), p_correlation);
  INSERT INTO prediction.ensemble_events (event_id, scope, tenant_id, domain_id, run_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_run_id, 'ensemble.completed', p_actor,
          jsonb_build_object('ensemble_forecast_id', r.ensemble_forecast_id, 'excluded', jsonb_array_length(v_excluded), 'disagreement', v_div ->> 'level', 'escalated', v_esc IS NOT NULL), p_correlation);
  RETURN prediction.pen_run_answer(p_run_id);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.complete_ensemble_run(uuid,uuid,uuid,jsonb,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.complete_ensemble_run(uuid,uuid,uuid,jsonb,uuid,uuid,uuid) TO eye_commit;

/* FAIL a run that cannot issue an ensemble (fewer than two members available after exclusions and retries): the attempts and every
   exclusion recorded, the reason, and the escalation to the owner — always. A run whose ensemble is issued is completed, never failed. */
CREATE OR REPLACE FUNCTION prediction.fail_ensemble_run(
  p_run_id uuid, p_tenant uuid, p_domain uuid, p_reason text, p_outcome jsonb, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, graph, observation, executive, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r prediction.ensemble_runs%ROWTYPE; v_excluded jsonb; v_esc jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.ensemble.issue']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM prediction.pen_assert_actor('ensemble', p_actor);
  SELECT * INTO r FROM prediction.ensemble_runs x WHERE x.run_id = p_run_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ensemble rejected (unknown_run): no ensemble run % in this domain', p_run_id USING ERRCODE = '23503'; END IF;
  IF r.state NOT IN ('admitted', 'running') THEN RAISE EXCEPTION 'ensemble rejected (state): run % is %', p_run_id, r.state USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM prediction.forecasts_current x WHERE x.forecast_id = r.ensemble_forecast_id) THEN
    RAISE EXCEPTION 'ensemble rejected (state): run %''s ensemble forecast is issued; the run is completed (resume), never failed', p_run_id USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM prediction.ensemble_members m WHERE m.run_id = p_run_id AND m.state = 'issued') THEN
    RAISE EXCEPTION 'ensemble rejected (state): run % has issued members; it is resumed to its ensemble', p_run_id USING ERRCODE = '22023';
  END IF;
  IF coalesce(length(btrim(p_reason)), 0) < 8 THEN RAISE EXCEPTION 'ensemble rejected (outcome): a failure states its reason' USING ERRCODE = '22023'; END IF;
  v_excluded := prediction.pen_record_attempts_and_exclusions(r, p_outcome -> 'attempts', p_outcome -> 'excluded', false, p_actor, p_correlation);
  r.state := 'failed';
  v_esc := prediction.pen_escalate(r, 'failed: ' || p_reason, jsonb_build_object('excluded', v_excluded), p_actor, p_correlation);
  UPDATE prediction.ensemble_runs SET state = 'failed', state_reason = p_reason, finished_at = clock_timestamp(), escalation = v_esc, attention_item_id = (v_esc ->> 'attention_item_id')::uuid,
         outcome = jsonb_build_object('included', 0, 'excluded', v_excluded, 'compute_ms', p_outcome -> 'compute_ms')
   WHERE run_id = p_run_id;
  INSERT INTO prediction.ensemble_events (event_id, scope, tenant_id, domain_id, run_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_run_id, 'ensemble.failed', p_actor, jsonb_build_object('reason', p_reason, 'excluded', jsonb_array_length(v_excluded)), p_correlation);
  RETURN prediction.pen_run_answer(p_run_id);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.fail_ensemble_run(uuid,uuid,uuid,text,jsonb,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.fail_ensemble_run(uuid,uuid,uuid,text,jsonb,uuid,uuid,uuid) TO eye_commit;

/* RESUME a run left admitted or running (the process stopped between the governed writes): recorded, answered whole, so the manager
   continues from the members as they stand. Its owner, its admitter or a domain administrator resumes it. */
CREATE OR REPLACE FUNCTION prediction.resume_ensemble_run(p_run_id uuid, p_tenant uuid, p_domain uuid, p_actor uuid, p_event_id uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, graph, observation, executive, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r prediction.ensemble_runs%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.ensemble.issue']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM prediction.pen_assert_actor('ensemble', p_actor);
  SELECT * INTO r FROM prediction.ensemble_runs x WHERE x.run_id = p_run_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ensemble rejected (unknown_run): no ensemble run % in this domain', p_run_id USING ERRCODE = '23503'; END IF;
  IF r.state NOT IN ('admitted', 'running') THEN
    RAISE EXCEPTION 'ensemble rejected (state): run % is %; a finished run is not resumed (a failed question is admitted again as a new run)', p_run_id, r.state USING ERRCODE = '22023';
  END IF;
  IF p_actor <> r.owner_principal_id AND p_actor <> r.admitted_by AND NOT prediction.pen_is_human_with(p_actor, p_tenant, p_domain, ARRAY['domain_admin']) THEN
    RAISE EXCEPTION 'ensemble rejected (ownership): run % is resumed by its owner, its admitter or the domain''s administrator', p_run_id USING ERRCODE = '42501';
  END IF;
  INSERT INTO prediction.ensemble_events (event_id, scope, tenant_id, domain_id, run_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_run_id, 'ensemble.resumed', p_actor,
          jsonb_build_object('from_state', r.state, 'ensemble_issued', EXISTS (SELECT 1 FROM prediction.forecasts_current x WHERE x.forecast_id = r.ensemble_forecast_id),
                             'issued_members', (SELECT count(*) FROM prediction.ensemble_members m WHERE m.run_id = p_run_id AND m.state = 'issued')), p_correlation);
  RETURN prediction.pen_run_answer(p_run_id);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.resume_ensemble_run(uuid,uuid,uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.resume_ensemble_run(uuid,uuid,uuid,uuid,uuid,uuid) TO eye_commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §EN.6 THE JUDGEMENT OVERLAY (V03-T-327): a named human forecast owner's adjustment, labelled JUDGEMENT, versioned separately from the
-- model's output (which stays on the forecast row, untouched, and is restated beside every version); revised as a new version; withdrawn.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
/* The adjustment's shape for the forecast's kind, and the evidence it rests on (private). */
CREATE OR REPLACE FUNCTION prediction.pen_assert_overlay_content(f prediction.forecasts_current, p_adjustment jsonb, p_rationale text, p_evidence jsonb) RETURNS void
SET search_path = prediction, graph, objects, pg_catalog, pg_temp AS $$
DECLARE k text := p_adjustment ->> 'kind'; e jsonb; v_sum numeric; v_id uuid;
BEGIN
  IF p_adjustment IS NULL OR jsonb_typeof(p_adjustment) <> 'object' THEN RAISE EXCEPTION 'judgement overlay rejected (adjustment): the adjustment is an object' USING ERRCODE = '22023'; END IF;
  IF f.forecast_kind = 'quantity' AND k IS DISTINCT FROM 'quantiles' THEN
    RAISE EXCEPTION 'judgement overlay rejected (adjustment): a quantity forecast is adjusted by its quantiles {kind: quantiles, q10, q50, q90}' USING ERRCODE = '22023';
  END IF;
  IF f.forecast_kind = 'event' AND k NOT IN ('quantiles', 'probability') THEN
    RAISE EXCEPTION 'judgement overlay rejected (adjustment): an event forecast is adjusted by its probability {kind: probability, p, low, high}' USING ERRCODE = '22023';
  END IF;
  IF f.forecast_kind IN ('state', 'regime') AND k IS DISTINCT FROM 'categories' THEN
    RAISE EXCEPTION 'judgement overlay rejected (adjustment): a % forecast is adjusted by its category probabilities {kind: categories, categories: [{name, p}]}', f.forecast_kind USING ERRCODE = '22023';
  END IF;
  IF k = 'quantiles' THEN
    IF jsonb_typeof(p_adjustment -> 'q10') <> 'number' OR jsonb_typeof(p_adjustment -> 'q50') <> 'number' OR jsonb_typeof(p_adjustment -> 'q90') <> 'number'
       OR NOT ((p_adjustment ->> 'q10')::numeric <= (p_adjustment ->> 'q50')::numeric AND (p_adjustment ->> 'q50')::numeric <= (p_adjustment ->> 'q90')::numeric) THEN
      RAISE EXCEPTION 'judgement overlay rejected (adjustment): the quantiles are numbers with q10 ≤ q50 ≤ q90' USING ERRCODE = '22023';
    END IF;
    IF f.forecast_kind = 'event' AND ((p_adjustment ->> 'q10')::numeric < 0 OR (p_adjustment ->> 'q90')::numeric > 1) THEN
      RAISE EXCEPTION 'judgement overlay rejected (adjustment): an event''s band lies in [0, 1]' USING ERRCODE = '22023';
    END IF;
  ELSIF k = 'probability' THEN
    IF jsonb_typeof(p_adjustment -> 'p') <> 'number' OR (p_adjustment ->> 'p')::numeric < 0 OR (p_adjustment ->> 'p')::numeric > 1
       OR coalesce((p_adjustment ->> 'low')::numeric, (p_adjustment ->> 'p')::numeric) > (p_adjustment ->> 'p')::numeric
       OR coalesce((p_adjustment ->> 'high')::numeric, (p_adjustment ->> 'p')::numeric) < (p_adjustment ->> 'p')::numeric
       OR coalesce((p_adjustment ->> 'low')::numeric, 0) < 0 OR coalesce((p_adjustment ->> 'high')::numeric, 1) > 1 THEN
      RAISE EXCEPTION 'judgement overlay rejected (adjustment): the probability lies in [0, 1] within its band (low ≤ p ≤ high)' USING ERRCODE = '22023';
    END IF;
  ELSIF k = 'categories' THEN
    IF jsonb_typeof(p_adjustment -> 'categories') <> 'array' OR jsonb_array_length(p_adjustment -> 'categories') < 2
       OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_adjustment -> 'categories') c WHERE coalesce(length(c ->> 'name'), 0) < 1 OR jsonb_typeof(c -> 'p') <> 'number' OR (c ->> 'p')::numeric < 0 OR (c ->> 'p')::numeric > 1) THEN
      RAISE EXCEPTION 'judgement overlay rejected (adjustment): the categories are at least two {name, p} with p in [0, 1]' USING ERRCODE = '22023';
    END IF;
    SELECT sum((c ->> 'p')::numeric) INTO v_sum FROM jsonb_array_elements(p_adjustment -> 'categories') c;
    IF abs(v_sum - 1) > 0.001 THEN RAISE EXCEPTION 'judgement overlay rejected (adjustment): the category probabilities sum to 1 (they sum to %)', v_sum USING ERRCODE = '22023'; END IF;
  ELSE
    RAISE EXCEPTION 'judgement overlay rejected (adjustment): the adjustment''s kind is quantiles, probability or categories' USING ERRCODE = '22023';
  END IF;
  IF coalesce(length(btrim(p_rationale)), 0) < 16 THEN
    RAISE EXCEPTION 'judgement overlay rejected (rationale): a judgement states its rationale (at least 16 characters)' USING ERRCODE = '22023';
  END IF;
  IF p_evidence IS NULL OR jsonb_typeof(p_evidence) <> 'array' OR jsonb_array_length(p_evidence) < 1 THEN
    RAISE EXCEPTION 'judgement overlay rejected (evidence): a judgement names the evidence it rests on (at least one {kind, id})' USING ERRCODE = '22023';
  END IF;
  FOR e IN SELECT * FROM jsonb_array_elements(p_evidence) LOOP
    BEGIN v_id := (e ->> 'id')::uuid; EXCEPTION WHEN others THEN v_id := NULL; END;
    IF v_id IS NULL OR coalesce(e ->> 'kind', '') NOT IN ('evidence', 'strategy', 'forecast') THEN
      RAISE EXCEPTION 'judgement overlay rejected (evidence): each item is {kind: evidence | strategy | forecast, id}' USING ERRCODE = '22023';
    END IF;
    IF (e ->> 'kind' = 'evidence' AND NOT EXISTS (SELECT 1 FROM objects.canonical_objects o WHERE o.object_type = 'EVD' AND o.object_id = v_id AND o.tenant_id = f.tenant_id AND o.domain_id = f.domain_id))
       OR (e ->> 'kind' = 'strategy' AND NOT EXISTS (SELECT 1 FROM graph.strategy_current s WHERE s.strategy_object_id = v_id AND s.tenant_id = f.tenant_id AND s.domain_id = f.domain_id))
       OR (e ->> 'kind' = 'forecast' AND NOT EXISTS (SELECT 1 FROM prediction.forecasts_current g WHERE g.forecast_id = v_id AND g.tenant_id = f.tenant_id AND g.domain_id = f.domain_id)) THEN
      RAISE EXCEPTION 'judgement overlay rejected (unknown_evidence): % % is not in this domain', e ->> 'kind', v_id USING ERRCODE = '23503';
    END IF;
  END LOOP;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.pen_assert_overlay_content(prediction.forecasts_current, jsonb, text, jsonb) FROM PUBLIC;

/* The model's own distribution, restated beside the judgement (private). */
CREATE OR REPLACE FUNCTION prediction.pen_model_distribution(f prediction.forecasts_current) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = prediction, pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object('forecast_id', f.forecast_id, 'forecast_kind', f.forecast_kind, 'method', f.method, 'method_version', f.method_version, 'method_ref', f.method_ref,
                            'ensemble_role', f.ensemble_role, 'quantiles', f.quantiles, 'validation_state', f.validation_state, 'label', 'MODEL OUTPUT')
$$;
REVOKE ALL ON FUNCTION prediction.pen_model_distribution(prediction.forecasts_current) FROM PUBLIC;

/* The author: the acting principal, a named active HUMAN holding forecast_owner here (an agent is refused whatever its roles). */
CREATE OR REPLACE FUNCTION prediction.pen_assert_overlay_author(p_actor uuid, p_tenant uuid, p_domain uuid, p_roles text[]) RETURNS void
SET search_path = prediction, identity, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM prediction.pen_assert_actor('judgement overlay', p_actor);
  IF NOT EXISTS (SELECT 1 FROM identity.principals p WHERE p.id = p_actor AND p.kind = 'human' AND p.status = 'active') THEN
    RAISE EXCEPTION 'judgement overlay rejected (actor): a judgement overlay is a named human''s act; an agent or a system principal never authors or withdraws one' USING ERRCODE = '42501';
  END IF;
  IF NOT prediction.pen_is_human_with(p_actor, p_tenant, p_domain, p_roles) THEN
    RAISE EXCEPTION 'judgement overlay rejected (authority): the acting human holds none of % in this domain', array_to_string(p_roles, ', ') USING ERRCODE = '42501';
  END IF;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.pen_assert_overlay_author(uuid, uuid, uuid, text[]) FROM PUBLIC;

/* ADD the first version of a forecast's judgement overlay (action prediction.overlay.add). */
CREATE OR REPLACE FUNCTION prediction.add_judgement_overlay(
  p_overlay_id uuid, p_tenant uuid, p_domain uuid, p_forecast_id uuid, p_adjustment jsonb, p_rationale text, p_evidence jsonb, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, graph, objects, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE f prediction.forecasts_current%ROWTYPE; o prediction.judgement_overlays%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.overlay.add']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM prediction.pen_assert_overlay_author(p_actor, p_tenant, p_domain, ARRAY['forecast_owner']);
  SELECT * INTO f FROM prediction.forecasts_current x WHERE x.forecast_id = p_forecast_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'judgement overlay rejected (unknown_forecast): no forecast % in this domain', p_forecast_id USING ERRCODE = '23503'; END IF;
  IF f.state <> 'issued' THEN
    RAISE EXCEPTION 'judgement overlay rejected (state): forecast % is %; a judgement is laid over an issued forecast', p_forecast_id, f.state USING ERRCODE = '22023';
  END IF;
  IF f.ensemble_role = 'member' THEN
    RAISE EXCEPTION 'judgement overlay rejected (target): forecast % is an ensemble member; the judgement is laid over the ensemble % (or a single forecast)', p_forecast_id, f.ensemble_id USING ERRCODE = '22023';
  END IF;
  SELECT * INTO o FROM prediction.judgement_overlays x WHERE x.forecast_id = p_forecast_id AND x.state = 'active';
  IF FOUND THEN
    RAISE EXCEPTION 'judgement overlay rejected (duplicate): overlay % (version %) stands on forecast %; it is revised, not doubled', o.overlay_id, o.version, p_forecast_id USING ERRCODE = '23505';
  END IF;
  PERFORM prediction.pen_assert_overlay_content(f, p_adjustment, p_rationale, p_evidence);
  INSERT INTO prediction.judgement_overlays (overlay_id, version, scope, tenant_id, domain_id, forecast_id, forecast_kind, author_principal_id, adjustment, model_distribution,
                                             rationale, evidence, label, state, revises_version, correlation_id)
  VALUES (p_overlay_id, 1, 'DOMAIN', p_tenant, p_domain, p_forecast_id, f.forecast_kind, p_actor, p_adjustment, prediction.pen_model_distribution(f),
          btrim(p_rationale), p_evidence, 'JUDGEMENT', 'active', NULL, p_correlation);
  INSERT INTO prediction.forecast_events (event_id, scope, tenant_id, domain_id, forecast_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_forecast_id, 'forecast.overlay_added', p_actor,
          jsonb_build_object('overlay_id', p_overlay_id, 'version', 1, 'label', 'JUDGEMENT', 'adjustment', p_adjustment, 'evidence', p_evidence), p_correlation);
  RETURN (SELECT to_jsonb(x) FROM prediction.judgement_overlays x WHERE x.overlay_id = p_overlay_id AND x.version = 1);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.add_judgement_overlay(uuid,uuid,uuid,uuid,jsonb,text,jsonb,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.add_judgement_overlay(uuid,uuid,uuid,uuid,jsonb,text,jsonb,uuid,uuid,uuid) TO eye_commit;

/* REVISE: the next version of a standing overlay (action prediction.overlay.add — a revision adds a version); the prior version is
   superseded, never edited; p_expected_version guards a stale revision. */
CREATE OR REPLACE FUNCTION prediction.revise_judgement_overlay(
  p_overlay_id uuid, p_tenant uuid, p_domain uuid, p_forecast_id uuid, p_expected_version int, p_adjustment jsonb, p_rationale text, p_evidence jsonb, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, graph, objects, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE f prediction.forecasts_current%ROWTYPE; o prediction.judgement_overlays%ROWTYPE; v_next int;
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.overlay.add']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM prediction.pen_assert_overlay_author(p_actor, p_tenant, p_domain, ARRAY['forecast_owner']);
  SELECT * INTO f FROM prediction.forecasts_current x WHERE x.forecast_id = p_forecast_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'judgement overlay rejected (unknown_forecast): no forecast % in this domain', p_forecast_id USING ERRCODE = '23503'; END IF;
  SELECT * INTO o FROM prediction.judgement_overlays x WHERE x.overlay_id = p_overlay_id AND x.forecast_id = p_forecast_id ORDER BY x.version DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'judgement overlay rejected (unknown_overlay): no overlay % on forecast %', p_overlay_id, p_forecast_id USING ERRCODE = '23503'; END IF;
  IF o.state <> 'active' THEN RAISE EXCEPTION 'judgement overlay rejected (state): overlay % is % (version %); a withdrawn judgement is added afresh', p_overlay_id, o.state, o.version USING ERRCODE = '22023'; END IF;
  IF p_expected_version IS DISTINCT FROM o.version THEN
    RAISE EXCEPTION 'judgement overlay rejected (stale): overlay % stands at version %, not %', p_overlay_id, o.version, coalesce(p_expected_version::text, '<none>') USING ERRCODE = '22023';
  END IF;
  IF f.state <> 'issued' THEN RAISE EXCEPTION 'judgement overlay rejected (state): forecast % is %; a judgement is revised on an issued forecast', p_forecast_id, f.state USING ERRCODE = '22023'; END IF;
  PERFORM prediction.pen_assert_overlay_content(f, p_adjustment, p_rationale, p_evidence);
  v_next := o.version + 1;
  UPDATE prediction.judgement_overlays SET state = 'superseded', superseded_at = clock_timestamp() WHERE overlay_id = p_overlay_id AND version = o.version;
  INSERT INTO prediction.judgement_overlays (overlay_id, version, scope, tenant_id, domain_id, forecast_id, forecast_kind, author_principal_id, adjustment, model_distribution,
                                             rationale, evidence, label, state, revises_version, correlation_id)
  VALUES (p_overlay_id, v_next, 'DOMAIN', p_tenant, p_domain, p_forecast_id, f.forecast_kind, p_actor, p_adjustment, prediction.pen_model_distribution(f),
          btrim(p_rationale), p_evidence, 'JUDGEMENT', 'active', o.version, p_correlation);
  INSERT INTO prediction.forecast_events (event_id, scope, tenant_id, domain_id, forecast_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_forecast_id, 'forecast.overlay_added', p_actor,
          jsonb_build_object('overlay_id', p_overlay_id, 'version', v_next, 'revises', o.version, 'label', 'JUDGEMENT', 'adjustment', p_adjustment, 'evidence', p_evidence), p_correlation);
  RETURN (SELECT to_jsonb(x) FROM prediction.judgement_overlays x WHERE x.overlay_id = p_overlay_id AND x.version = v_next);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.revise_judgement_overlay(uuid,uuid,uuid,uuid,int,jsonb,text,jsonb,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.revise_judgement_overlay(uuid,uuid,uuid,uuid,int,jsonb,text,jsonb,uuid,uuid,uuid) TO eye_commit;

/* WITHDRAW the standing version (action prediction.overlay.withdraw): a human forecast owner or the domain's administrator, with a reason.
   The forecast's model output is untouched — it was never changed by the judgement. */
CREATE OR REPLACE FUNCTION prediction.withdraw_judgement_overlay(
  p_overlay_id uuid, p_tenant uuid, p_domain uuid, p_forecast_id uuid, p_reason text, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, graph, objects, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE o prediction.judgement_overlays%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.overlay.withdraw']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM prediction.pen_assert_overlay_author(p_actor, p_tenant, p_domain, ARRAY['forecast_owner', 'domain_admin']);
  IF coalesce(length(btrim(p_reason)), 0) < 8 THEN RAISE EXCEPTION 'judgement overlay rejected (reason): a withdrawal states its reason (at least 8 characters)' USING ERRCODE = '22023'; END IF;
  SELECT * INTO o FROM prediction.judgement_overlays x WHERE x.overlay_id = p_overlay_id AND x.forecast_id = p_forecast_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain
   ORDER BY x.version DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'judgement overlay rejected (unknown_overlay): no overlay % on forecast %', p_overlay_id, p_forecast_id USING ERRCODE = '23503'; END IF;
  IF o.state <> 'active' THEN RAISE EXCEPTION 'judgement overlay rejected (state): overlay % is % (version %)', p_overlay_id, o.state, o.version USING ERRCODE = '22023'; END IF;
  UPDATE prediction.judgement_overlays SET state = 'withdrawn', withdrawn_by = p_actor, withdrawn_at = clock_timestamp(), withdrawal_reason = btrim(p_reason)
   WHERE overlay_id = p_overlay_id AND version = o.version;
  INSERT INTO prediction.forecast_events (event_id, scope, tenant_id, domain_id, forecast_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_forecast_id, 'forecast.overlay_withdrawn', p_actor,
          jsonb_build_object('overlay_id', p_overlay_id, 'version', o.version, 'reason', btrim(p_reason)), p_correlation);
  RETURN (SELECT to_jsonb(x) FROM prediction.judgement_overlays x WHERE x.overlay_id = p_overlay_id AND x.version = o.version);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.withdraw_judgement_overlay(uuid,uuid,uuid,uuid,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.withdraw_judgement_overlay(uuid,uuid,uuid,uuid,text,uuid,uuid,uuid) TO eye_commit;
