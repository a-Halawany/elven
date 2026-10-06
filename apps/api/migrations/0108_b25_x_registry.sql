-- 0108 §MR — CP-6 B25 part `registry` (F-P4-01): THE GOVERNED MODEL REGISTRY, THE TARGETS, THE VERSIONED HORIZON POLICY, ROUTING, THE
-- GOVERNED UNSUPPORTED-HORIZON REFUSAL, PER TARGET/HORIZON VALIDATION. Folded by the integrator after §CX and before §EN; uses the prelude's
-- columns (forecast_kind, target_key, method_ref, horizon_policy, outcome_spec) and its event vocabulary (forecast.horizon_refused,
-- forecast.routed); re-declares NOTHING of another stage's except §MR.0 below (a PRELUDE REQUEST, stated).
--
-- Rows: C-020, V00-T-004, V00-T-051, V02-T-059, V02-T-153, L6-C03, V03-T-125, V03-T-320, V03-T-324, PR-32-001, CAP-FW-12, MC-012, MC-013,
-- MC-015. Sections:
--   §MR.0  PRELUDE REQUEST — prediction.issue_forecast's authority list gains `prediction.portfolio.issue` (copied whole from §0.6; ONE line
--          changed, marked). The integrator folds it into §0.6 (and adds §EN's `prediction.ensemble.issue` there) and drops this section.
--   §MR.1  the canonical write action of the routed issue (FCT).
--   §MR.2  the tables: forecast_methods (the governed registry), forecast_targets, horizon_policies, method_validations, forecast_routes, and
--          the registry's own append-only ledger forecast_registry_events; RLS (the 0081 loop idiom).
--   §MR.3  the builtins (the two legacy methods, approved, read THROUGH the registry) and the effective registry read.
--   §MR.4  the ports: propose / decide / retire / quarantine / reinstate a method; declare / decide a target; publish / concur a horizon
--          policy; record a validation (and its prediction.backtests row — the record a validation claim names).
--   §MR.5  ROUTING: the plan (an invoker read) and the three ports of the routed issue (record the route — the governed refusal ledgered as
--          forecast.horizon_refused —, refuse it after planning — a failed or data-refused method —, bind the issued forecast — forecast.routed).
--   §MR.6  ENFORCEMENT on the forecast row: pmr_fct_routed (BEFORE INSERT) — a forecast that names a method_ref names an APPROVED method of
--          the domain's registry for its kind and horizon; one that names a horizon policy obeys it (family allowed, scenario language where
--          the policy says so, a passed validation where the policy requires one). DEFAULT-OFF: a legacy issue names no method_ref.
-- Every figure a harness or an act seeds is SYNTHETIC. No interface row is added (the register stays 50/0/0).

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §MR.0 PRELUDE REQUEST — prediction.issue_forecast, copied whole from 0108 §0.6, its authority list widened (marked `-- B25 registry`)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION prediction.issue_forecast(
  p_forecast_id uuid, p_tenant uuid, p_domain uuid, p_series_key text, p_subject uuid,
  p_horizon_code text, p_horizon_days int, p_origin_at date, p_known_at timestamptz, p_target_at date,
  p_method text, p_method_version text, p_baseline_method text, p_quantiles jsonb, p_path jsonb,
  p_drivers jsonb, p_assumptions uuid[], p_evidence_refs jsonb, p_refresh_cadence text,
  p_validation_state text, p_validation_note text, p_label text, p_skill jsonb, p_statement text,
  p_backtest_id uuid, p_controls jsonb,
  p_actor uuid, p_event_id uuid, p_correlation uuid,
  p_extras jsonb DEFAULT '{}'::jsonb   -- 0108 §0: B25's columns (forecast_kind, target_key, method_ref, ensemble_id, ensemble_role, information_set_id, environment, horizon_policy, outcome_spec)
) RETURNS void
SECURITY DEFINER SET search_path = prediction, graph, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r record; a uuid; e jsonb;
        v_kind text := coalesce(p_extras ->> 'forecast_kind', 'quantity'); v_role text := p_extras ->> 'ensemble_role'; v_ens uuid := (p_extras ->> 'ensemble_id')::uuid;   -- 0108 §0
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.forecast.issue', 'prediction.portfolio.issue']);   -- B25 registry: the routed issue (§MR) issues through this port under its own action
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF NOT EXISTS (SELECT 1 FROM prediction.series_registry s
                  WHERE s.tenant_id = p_tenant AND s.domain_id = p_domain AND s.series_key = p_series_key) THEN
    RAISE EXCEPTION 'forecast rejected: series % is not registered in this domain', p_series_key USING ERRCODE = '23503';
  END IF;
  FOREACH a IN ARRAY coalesce(p_assumptions, ARRAY[]::uuid[]) LOOP
    IF NOT EXISTS (SELECT 1 FROM graph.strategy_current s
                    WHERE s.strategy_object_id = a AND s.object_type = 'ASU'
                      AND s.tenant_id = p_tenant AND s.domain_id = p_domain) THEN
      RAISE EXCEPTION 'forecast rejected: % is not an assumption in this domain', a USING ERRCODE = '23503';
    END IF;
  END LOOP;
  -- A validation claim must name the backtest that earned it, and that backtest must be this
  -- series and horizon, computed on evidence known no later than this forecast's cut-off.
  IF p_validation_state IN ('validated', 'validated_retrospective') THEN
    IF p_backtest_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM prediction.backtests b WHERE b.backtest_id = p_backtest_id
           AND b.tenant_id = p_tenant AND b.domain_id = p_domain
           AND b.series_key = p_series_key AND b.horizon_code = p_horizon_code
           AND b.method_version = p_method_version
           AND coalesce(b.known_at, b.computed_at) <= p_known_at
           AND b.window_to <= p_origin_at
           AND ((p_validation_state = 'validated' AND b.mode = 'historical')
                OR (p_validation_state = 'validated_retrospective' AND b.mode = 'retrospective'))) THEN
      RAISE EXCEPTION 'forecast rejected: validation_state % names no applicable backtest (same series, horizon and method version; evidence known by %; history ending by %)',
        p_validation_state, p_known_at, p_origin_at USING ERRCODE = '23514';
    END IF;
  END IF;

  INSERT INTO prediction.forecasts_current (
    forecast_id, scope, tenant_id, domain_id, series_key, subject_entity_id, horizon_code, horizon_days,
    origin_at, known_at, target_at, method, method_version, baseline_method, quantiles, path, drivers,
    assumptions, evidence_refs, refresh_cadence, validation_state, validation_note, label, skill,
    statement, state, issued_by, correlation_id, backtest_id, controls,
    forecast_kind, target_key, method_ref, ensemble_id, ensemble_role, information_set_id, environment_digest, environment, horizon_policy, outcome_spec   -- 0108 §0
  ) VALUES (
    p_forecast_id, 'DOMAIN', p_tenant, p_domain, p_series_key, p_subject, p_horizon_code, p_horizon_days,
    p_origin_at, p_known_at, p_target_at, p_method, p_method_version, p_baseline_method, p_quantiles,
    coalesce(p_path, '[]'::jsonb), p_drivers, coalesce(p_assumptions, ARRAY[]::uuid[]), p_evidence_refs,
    p_refresh_cadence, p_validation_state, p_validation_note, p_label, p_skill, p_statement, 'issued',
    p_actor, p_correlation, p_backtest_id, coalesce(p_controls, '{}'::jsonb),
    v_kind, p_extras ->> 'target_key', p_extras ->> 'method_ref', v_ens, v_role, (p_extras ->> 'information_set_id')::uuid,   -- 0108 §0
    p_extras #>> '{environment,digest}', p_extras -> 'environment', p_extras -> 'horizon_policy', p_extras -> 'outcome_spec');

  INSERT INTO prediction.forecast_events (
    event_id, scope, tenant_id, domain_id, forecast_id, event, actor_principal_id, details, correlation_id
  ) VALUES (
    p_event_id, 'DOMAIN', p_tenant, p_domain, p_forecast_id, 'forecast.issued', p_actor,
    jsonb_build_object('series_key', p_series_key, 'horizon', p_horizon_code, 'method', p_method,
                       'origin_at', p_origin_at, 'known_at', p_known_at, 'target_at', p_target_at,
                       'quantiles', p_quantiles, 'validation_state', p_validation_state, 'label', p_label,
                       'backtest_id', p_backtest_id, 'controls', p_controls)
      || CASE WHEN p_extras = '{}'::jsonb THEN '{}'::jsonb ELSE jsonb_build_object('b25', p_extras - 'environment' || jsonb_build_object('environment_digest', p_extras #>> '{environment,digest}')) END,   -- 0108 §0
    p_correlation);

  /* 0108 §0 — SUPERSESSION BY LINEAGE (the cross-method problem): an ensemble MEMBER supersedes nothing and is superseded only with
     its ensemble; a new ENSEMBLE supersedes the prior ensemble of the same key (series, horizon, subject, kind, target) and that
     ensemble's members; a SINGLE forecast supersedes prior singles of the same key — the legacy rule, unchanged for singles. Two
     methods' members of one ensemble therefore stand side by side. */
  FOR r IN SELECT f.forecast_id FROM prediction.forecasts_current f
            WHERE f.tenant_id = p_tenant AND f.domain_id = p_domain AND f.series_key = p_series_key
              AND f.horizon_code = p_horizon_code AND f.subject_entity_id IS NOT DISTINCT FROM p_subject
              AND f.state = 'issued' AND f.forecast_id <> p_forecast_id
              AND f.forecast_kind = v_kind AND f.target_key IS NOT DISTINCT FROM (p_extras ->> 'target_key')   -- 0108 §0
              AND v_role IS DISTINCT FROM 'member'                                                               -- 0108 §0
              AND ((v_role IS NULL AND f.ensemble_role IS NULL)                                                  -- 0108 §0
                   OR (v_role = 'ensemble' AND (f.ensemble_role = 'ensemble'
                        OR (f.ensemble_role = 'member' AND f.ensemble_id <> v_ens AND EXISTS (SELECT 1 FROM prediction.forecasts_current g
                              WHERE g.forecast_id = f.ensemble_id AND g.state = 'issued')))))
            FOR UPDATE
  LOOP
    UPDATE prediction.forecasts_current SET state = 'superseded', superseded_by = p_forecast_id,
           updated_at = clock_timestamp() WHERE forecast_id = r.forecast_id;
    INSERT INTO prediction.forecast_events (
      event_id, scope, tenant_id, domain_id, forecast_id, event, actor_principal_id, details, correlation_id
    ) VALUES (
      gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, r.forecast_id, 'forecast.superseded', p_actor,
      jsonb_build_object('superseded_by', p_forecast_id), p_correlation);
  END LOOP;

  FOREACH a IN ARRAY coalesce(p_assumptions, ARRAY[]::uuid[]) LOOP
    INSERT INTO graph.dependencies (
      dependency_id, scope, tenant_id, domain_id, dependent_object_id, dependent_type,
      depends_on_kind, depends_on_id, rationale, state, created_by, correlation_id
    ) VALUES (
      gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_forecast_id, 'FCT', 'strategy', a,
      'the forecast is only as good as this assumption; if it stops being verified the forecast must be looked at again',
      'active', p_actor, p_correlation)
    ON CONFLICT DO NOTHING;
  END LOOP;
  FOR e IN SELECT * FROM jsonb_array_elements(p_evidence_refs) LOOP
    INSERT INTO graph.dependencies (
      dependency_id, scope, tenant_id, domain_id, dependent_object_id, dependent_type,
      depends_on_kind, depends_on_id, rationale, state, created_by, correlation_id
    ) VALUES (
      gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_forecast_id, 'FCT', 'evidence',
      (e ->> 'evidence_object_id')::uuid,
      'a value the forecast was fitted on was read from this evidence; a correction to it changes the fit',
      'active', p_actor, p_correlation)
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.issue_forecast(uuid,uuid,uuid,text,uuid,text,int,date,timestamptz,date,text,text,text,jsonb,jsonb,jsonb,uuid[],jsonb,text,text,text,text,jsonb,text,uuid,jsonb,uuid,uuid,uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.issue_forecast(uuid,uuid,uuid,text,uuid,text,int,date,timestamptz,date,text,text,text,jsonb,jsonb,jsonb,uuid[],jsonb,text,text,text,text,jsonb,text,uuid,jsonb,uuid,uuid,uuid,jsonb) TO eye_commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §MR.1 The routed issue admits a forecast object and nothing else.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
INSERT INTO observation.canonical_write_actions (action, object_types, rationale) VALUES
  ('prediction.portfolio.issue', ARRAY['FCT'], 'B25 §MR: the routed issue (registry, horizon policy, method plan) admits a forecast object and nothing else')
ON CONFLICT (action) DO NOTHING;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §MR.2 THE TABLES
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
/* THE GOVERNED REGISTRY (L6-C03): versioned method entries of a domain. Proposed by a forecast owner or an agent; APPROVED (or rejected) by
   the named human METHOD STEWARD the entry names — never its proposer; retired or quarantined by a steward (quarantined automatically when a
   routed run of it fails); a quarantined entry is reinstated by its steward. The family DECLARATIONS are part of what the steward approves:
   a bayesian entry's explicit priors and the alternatives its sensitivity runs; a causal entry's intervention and its identification
   assumptions (ASUs); an optimisation entry's objective and constraints; a structural-judgmental entry's judgement and the human who made
   it; an event entry's Beta prior. A row for a BUILTIN's reference (adopted_builtin) is the domain's own act on a legacy method (retired
   or quarantined here); the builtin itself is §MR.3's. */
CREATE TABLE prediction.forecast_methods (
  method_id              uuid PRIMARY KEY,
  scope                  text NOT NULL,
  tenant_id              uuid NOT NULL,
  domain_id              uuid NOT NULL,
  method_key             text NOT NULL CHECK (method_key ~ '^[a-z][a-z0-9_]{1,62}$'),
  version                int  NOT NULL CHECK (version >= 1),
  method_ref             text GENERATED ALWAYS AS (method_key || '@' || version::text) STORED,
  family                 text NOT NULL CHECK (family IN ('statistical', 'event', 'state', 'bayesian', 'causal', 'structural_judgmental', 'optimisation')),
  forecast_kinds         text[] NOT NULL CHECK (cardinality(forecast_kinds) >= 1 AND forecast_kinds <@ ARRAY['quantity', 'event', 'state', 'regime']),
  horizons               text[] NOT NULL CHECK (cardinality(horizons) >= 1 AND horizons <@ ARRAY['30d', '90d', '180d', '1y', '3y', '5y']),
  implementation_ref     text NOT NULL CHECK (implementation_ref ~ '^[a-z][a-z0-9-]{1,62}$'),
  implementation_digest  text NOT NULL CHECK (implementation_digest ~ '^[0-9a-f]{64}$'),
  parameters             jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(parameters) = 'object'),
  declarations           jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(declarations) = 'object'),
  validation_requirement jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(validation_requirement) = 'object'),
  description            text NOT NULL CHECK (length(btrim(description)) >= 8),
  state                  text NOT NULL CHECK (state IN ('proposed', 'approved', 'rejected', 'retired', 'quarantined')),
  steward_principal_id   uuid NOT NULL,
  adopted_builtin        boolean NOT NULL DEFAULT false,
  proposed_by            uuid NOT NULL,
  proposed_by_kind       text NOT NULL,
  proposed_at            timestamptz NOT NULL DEFAULT clock_timestamp(),
  decided_by             uuid,
  decided_at             timestamptz,
  decision_note          text,
  retired_by             uuid,
  retired_at             timestamptz,
  retirement_reason      text,
  quarantined_at         timestamptz,
  quarantine_reason      text,
  correlation_id         uuid NOT NULL,
  CONSTRAINT pmr_fm_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT pmr_fm_decided CHECK (state NOT IN ('approved', 'rejected') OR adopted_builtin OR (decided_by IS NOT NULL AND decided_at IS NOT NULL)),
  CONSTRAINT pmr_fm_retired CHECK ((state = 'retired') = (retired_at IS NOT NULL)),
  CONSTRAINT pmr_fm_quarantined CHECK (state <> 'quarantined' OR quarantine_reason IS NOT NULL)
);
CREATE UNIQUE INDEX pmr_fm_key ON prediction.forecast_methods (tenant_id, domain_id, method_key, version);

/* THE GOVERNED TARGETS: what a forecast is OF — kind, unit, definition (an event's condition; a regime's categories; a quantity's
   aggregation), the sources (the series it is read from; twin element keys DECLARED as features), the subject, the risk class (the horizon
   policy it falls under). A target may name a different kind per horizon (definition.horizon_kinds: an event at 30d, a regime at 5y — the
   same question asked in the language each horizon allows). Declared by a forecast owner or an agent; approved by a named human forecast
   owner or administrator who did not declare it. */
CREATE TABLE prediction.forecast_targets (
  target_id          uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  target_key         text NOT NULL CHECK (target_key ~ '^[a-z][a-z0-9_.:-]{1,126}$'),
  version            int  NOT NULL CHECK (version >= 1),
  kind               text NOT NULL CHECK (kind IN ('quantity', 'event', 'state', 'regime')),
  unit               text NOT NULL CHECK (length(btrim(unit)) >= 1),
  title              text NOT NULL CHECK (length(btrim(title)) >= 8),
  definition         jsonb NOT NULL CHECK (jsonb_typeof(definition) = 'object'),
  sources            jsonb NOT NULL CHECK (jsonb_typeof(sources) = 'object'),
  subject_entity_id  uuid,
  risk_class         text NOT NULL DEFAULT 'standard' CHECK (risk_class ~ '^[a-z][a-z0-9_]{1,40}$'),
  state              text NOT NULL CHECK (state IN ('proposed', 'approved', 'rejected', 'retired')),
  declared_by        uuid NOT NULL,
  declared_by_kind   text NOT NULL,
  declared_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  decided_by         uuid,
  decided_at         timestamptz,
  decision_note      text,
  correlation_id     uuid NOT NULL,
  CONSTRAINT pmr_ft_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT pmr_ft_decided CHECK (state NOT IN ('approved', 'rejected') OR (decided_by IS NOT NULL AND decided_at IS NOT NULL))
);
CREATE UNIQUE INDEX pmr_ft_key ON prediction.forecast_targets (tenant_id, domain_id, target_key, version);

/* THE VERSIONED HORIZON POLICY (V00-T-051, V02-T-153, V03-T-125): per domain and risk class, per horizon — the treatment (the words of the
   horizon table), the families allowed, and per forecast kind the CONFIDENCE LANGUAGE and the VALIDATION REQUIREMENT; a horizon may be
   declared UNSUPPORTED with its reason. PUBLISHED (proposed) by a named human forecast owner or administrator; ACTIVE only on the
   CONCURRENCE of the named human method steward it names, who did not publish it; the concurrence supersedes the prior active version. */
CREATE TABLE prediction.horizon_policies (
  policy_id             uuid PRIMARY KEY,
  scope                 text NOT NULL,
  tenant_id             uuid NOT NULL,
  domain_id             uuid NOT NULL,
  risk_class            text NOT NULL CHECK (risk_class ~ '^[a-z][a-z0-9_]{1,40}$'),
  version               int  NOT NULL CHECK (version >= 1),
  rules                 jsonb NOT NULL CHECK (jsonb_typeof(rules) = 'object'),
  statement             text NOT NULL CHECK (length(btrim(statement)) >= 8),
  state                 text NOT NULL CHECK (state IN ('proposed', 'active', 'superseded', 'rejected')),
  steward_principal_id  uuid NOT NULL,
  published_by          uuid NOT NULL,
  published_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  concurred_by          uuid,
  concurred_at          timestamptz,
  concurrence_note      text,
  superseded_at         timestamptz,
  superseded_by         uuid,
  correlation_id        uuid NOT NULL,
  CONSTRAINT pmr_hp_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT pmr_hp_concurred CHECK (state NOT IN ('active', 'superseded', 'rejected') OR (concurred_by IS NOT NULL AND concurred_at IS NOT NULL)),
  CONSTRAINT pmr_hp_not_own CHECK (concurred_by IS NULL OR concurred_by <> published_by)
);
CREATE UNIQUE INDEX pmr_hp_version ON prediction.horizon_policies (tenant_id, domain_id, risk_class, version);
CREATE UNIQUE INDEX pmr_hp_one_active ON prediction.horizon_policies (tenant_id, domain_id, risk_class) WHERE state = 'active';

/* PER TARGET / HORIZON VALIDATION: a method's measured record at one horizon on one series (and target) — the quantity rolling-origin
   backtest (coverage, pinball, the climatology reference) or the event backtest (Brier, log score, calibration) — with its mode
   (retrospective: one evidence vintage; historical: each origin's own recorded history), its origins and whether it PASSED. Each row names
   the prediction.backtests row written beside it (method_version = the method_ref, so no legacy leash ever reads it): the record a
   forecast's validation claim names (issue_forecast's own check). Append-only. */
CREATE TABLE prediction.method_validations (
  validation_id   uuid PRIMARY KEY,
  scope           text NOT NULL,
  tenant_id       uuid NOT NULL,
  domain_id       uuid NOT NULL,
  method_ref      text NOT NULL,
  target_key      text,
  series_key      text NOT NULL,
  horizon_code    text NOT NULL CHECK (horizon_code IN ('30d', '90d', '180d', '1y', '3y', '5y')),
  horizon_days    int  NOT NULL CHECK (horizon_days >= 1),
  kind            text NOT NULL CHECK (kind IN ('quantity_rolling_origin', 'event_backtest')),
  mode            text NOT NULL CHECK (mode IN ('retrospective', 'historical')),
  origins         int  NOT NULL CHECK (origins >= 0),
  min_origins     int  NOT NULL CHECK (min_origins >= 1),
  metrics         jsonb NOT NULL CHECK (jsonb_typeof(metrics) = 'object'),
  passed          boolean NOT NULL,
  verdict         text NOT NULL CHECK (length(btrim(verdict)) >= 8),
  window_from     date NOT NULL,
  window_to       date NOT NULL,
  known_at        timestamptz NOT NULL,
  observations    int  NOT NULL CHECK (observations >= 0),
  backtest_id     uuid NOT NULL,
  synthetic       boolean NOT NULL,
  details         jsonb NOT NULL DEFAULT '{}'::jsonb,
  computed_by     uuid NOT NULL,
  computed_at     timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id  uuid NOT NULL,
  CONSTRAINT pmr_mv_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT pmr_mv_window CHECK (window_to > window_from),
  CONSTRAINT pmr_mv_passed CHECK (NOT passed OR origins >= min_origins)
);
CREATE INDEX pmr_mv_lookup ON prediction.method_validations (tenant_id, domain_id, method_ref, series_key, horizon_code, computed_at DESC);
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON prediction.method_validations FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

/* THE ROUTES: every routed request's plan as the policy and the registry resolved it at the time — planned, then issued (bound to the
   forecast), or REFUSED with the governed refusal (at planning; or after it, when the planned method failed or the data refused it). The
   plan is recomputed by the port, never taken from the caller. Only the ports write; the one transition is planned → issued | refused. */
CREATE TABLE prediction.forecast_routes (
  route_id          uuid PRIMARY KEY,
  scope             text NOT NULL,
  tenant_id         uuid NOT NULL,
  domain_id         uuid NOT NULL,
  target_key        text,
  series_key        text,
  horizon_code      text NOT NULL,
  forecast_kind     text,
  policy_id         uuid,
  policy_version    int,
  outcome           text NOT NULL CHECK (outcome IN ('planned', 'refused', 'issued')),
  refusal           text,
  refusal_class     text,
  plan              jsonb NOT NULL CHECK (jsonb_typeof(plan) = 'object'),
  forecast_id       uuid NOT NULL,
  method_ref        text,
  requested_by      uuid NOT NULL,
  requested_action  text NOT NULL,
  requested_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  issued_at         timestamptz,
  correlation_id    uuid NOT NULL,
  CONSTRAINT pmr_fr_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT pmr_fr_refused CHECK ((outcome = 'refused') = (refusal IS NOT NULL)),
  CONSTRAINT pmr_fr_issued CHECK ((outcome = 'issued') = (issued_at IS NOT NULL AND method_ref IS NOT NULL))
);
CREATE INDEX pmr_fr_forecast ON prediction.forecast_routes (forecast_id);
CREATE INDEX pmr_fr_recent ON prediction.forecast_routes (tenant_id, domain_id, requested_at DESC);
CREATE OR REPLACE FUNCTION prediction.pmr_routes_guard() RETURNS trigger
SET search_path = prediction, public, pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'forecast route rejected (state): a route is never deleted' USING ERRCODE = '2F002'; END IF;
  IF OLD.outcome <> 'planned' OR NEW.outcome NOT IN ('issued', 'refused') OR NEW.route_id <> OLD.route_id OR NEW.plan <> OLD.plan OR NEW.forecast_id <> OLD.forecast_id
     OR NEW.tenant_id <> OLD.tenant_id OR NEW.domain_id <> OLD.domain_id OR NEW.horizon_code <> OLD.horizon_code THEN
    RAISE EXCEPTION 'forecast route rejected (state): a route moves once, planned → issued or refused, and nothing else of it changes' USING ERRCODE = '2F002';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER pmr_routes_guard BEFORE UPDATE OR DELETE ON prediction.forecast_routes FOR EACH ROW EXECUTE FUNCTION prediction.pmr_routes_guard();

/* THE REGISTRY'S OWN LEDGER (append-only): every act on a method, a target, a policy, a validation and a route — the lifecycle lives here,
   never in a pinned suite's event log. */
CREATE TABLE prediction.forecast_registry_events (
  event_id            uuid PRIMARY KEY,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  subject_kind        text NOT NULL CHECK (subject_kind IN ('method', 'target', 'policy', 'validation', 'route')),
  subject_id          uuid,
  subject_ref         text NOT NULL,
  event               text NOT NULL CHECK (event IN (
    'method.proposed', 'method.approved', 'method.rejected', 'method.retired', 'method.quarantined', 'method.reinstated',
    'target.declared', 'target.approved', 'target.rejected',
    'policy.published', 'policy.concurred', 'policy.rejected', 'policy.superseded',
    'validation.recorded', 'route.planned', 'route.refused', 'route.issued')),
  actor_principal_id  uuid NOT NULL,
  details             jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id      uuid NOT NULL,
  CONSTRAINT pmr_re_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX pmr_re_subject ON prediction.forecast_registry_events (subject_kind, subject_ref, occurred_at);
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON prediction.forecast_registry_events FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

-- RLS and grants: the 0081 loop idiom (policy prediction_isolation; SELECT to eye_app, eye_commit; writes only through the ports).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['forecast_methods', 'forecast_targets', 'horizon_policies', 'method_validations', 'forecast_routes', 'forecast_registry_events'] LOOP
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

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §MR.3 THE BUILTINS AND THE EFFECTIVE REGISTRY
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
/* The two legacy methods, APPROVED in every domain, so legacy behaviour reads through the registry: seasonal_naive@1 and holt_winters@1
   (src/prediction/models/models.ts; its sha256 pinned here and in registry/methods/digests.ts — a unit test recomputes both). A domain
   may retire or quarantine either for itself (an adopted_builtin row); the builtin itself is not editable. */
CREATE OR REPLACE FUNCTION prediction.pmr_builtin_methods()
RETURNS TABLE (method_ref text, method_key text, version int, family text, forecast_kinds text[], horizons text[], implementation_ref text,
               implementation_digest text, parameters jsonb, declarations jsonb, validation_requirement jsonb, description text)
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  VALUES
    ('seasonal_naive@1', 'seasonal_naive', 1, 'statistical', ARRAY['quantity'], ARRAY['30d', '90d', '180d', '1y', '3y', '5y'], 'legacy-models',
     '7da8dc6d086417600f198d4da9a14edcab9d498234532d09342bf59c1b29d051', '{"season": "the series'' declared seasonality"}'::jsonb, '{}'::jsonb,
     '{"kind": "legacy_backtest", "note": "validated by the legacy rolling-origin backtest (POST …/backtests/run) and its leash"}'::jsonb,
     'Seasonal naive (the legacy baseline): y(t+h) = y(t+h−m·⌈h/m⌉), quantiles from empirical h-step errors (Phase 4, unchanged).'),
    ('holt_winters@1', 'holt_winters', 1, 'statistical', ARRAY['quantity'], ARRAY['30d', '90d', '180d', '1y', '3y', '5y'], 'legacy-models',
     '7da8dc6d086417600f198d4da9a14edcab9d498234532d09342bf59c1b29d051', '{"grid": "alpha, beta, gamma by one-step SSE"}'::jsonb, '{}'::jsonb,
     '{"kind": "legacy_backtest", "note": "used only when the applicable legacy backtest says it beat seasonal naive by the T2 margin"}'::jsonb,
     'Additive Holt-Winters (the legacy learned model), on the leash of the applicable backtest (Phase 4, unchanged).')
$$;
REVOKE ALL ON FUNCTION prediction.pmr_builtin_methods() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.pmr_builtin_methods() TO eye_app, eye_commit;

/* THE EFFECTIVE REGISTRY of one domain: its own entries (under the caller's RLS) and every builtin the domain has not adopted. INVOKER. */
CREATE OR REPLACE FUNCTION prediction.effective_forecast_methods(p_tenant uuid, p_domain uuid)
RETURNS TABLE (method_id uuid, method_ref text, method_key text, version int, family text, forecast_kinds text[], horizons text[],
               implementation_ref text, implementation_digest text, parameters jsonb, declarations jsonb, validation_requirement jsonb,
               description text, state text, state_reason text, steward_principal_id uuid, builtin boolean, proposed_by uuid, decided_by uuid)
LANGUAGE sql STABLE SET search_path = prediction, pg_catalog, pg_temp AS $$
  SELECT m.method_id, m.method_ref, m.method_key, m.version, m.family, m.forecast_kinds, m.horizons, m.implementation_ref, m.implementation_digest,
         m.parameters, m.declarations, m.validation_requirement, m.description, m.state,
         CASE m.state WHEN 'quarantined' THEN m.quarantine_reason WHEN 'retired' THEN m.retirement_reason WHEN 'rejected' THEN m.decision_note ELSE NULL END,
         m.steward_principal_id, m.adopted_builtin, m.proposed_by, m.decided_by
    FROM prediction.forecast_methods m
   WHERE m.tenant_id = p_tenant AND m.domain_id = p_domain
  UNION ALL
  SELECT NULL::uuid, b.method_ref, b.method_key, b.version, b.family, b.forecast_kinds, b.horizons, b.implementation_ref, b.implementation_digest,
         b.parameters, b.declarations, b.validation_requirement, b.description, 'approved', NULL::text, NULL::uuid, true, NULL::uuid, NULL::uuid
    FROM prediction.pmr_builtin_methods() b
   WHERE NOT EXISTS (SELECT 1 FROM prediction.forecast_methods m WHERE m.tenant_id = p_tenant AND m.domain_id = p_domain AND m.method_ref = b.method_ref)
$$;
REVOKE ALL ON FUNCTION prediction.effective_forecast_methods(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.effective_forecast_methods(uuid, uuid) TO eye_app, eye_commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §MR.4 THE PORTS (SECURITY DEFINER; the bound action asserted; the scope asserted; the acting principal compared)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
/* Shared: the acting principal, a named active human or not; the kind of a principal. */
CREATE OR REPLACE FUNCTION prediction.pmr_principal_kind(p_principal uuid) RETURNS text
STABLE SECURITY DEFINER SET search_path = identity, pg_catalog, pg_temp AS $$
  SELECT p.kind FROM identity.principals p WHERE p.id = p_principal AND p.status = 'active'
$$ LANGUAGE sql;
REVOKE ALL ON FUNCTION prediction.pmr_principal_kind(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.pmr_principal_kind(uuid) TO eye_commit;

CREATE OR REPLACE FUNCTION prediction.pmr_event(p_tenant uuid, p_domain uuid, p_kind text, p_id uuid, p_ref text, p_event text, p_actor uuid, p_details jsonb, p_correlation uuid)
RETURNS void SET search_path = prediction, pg_catalog, pg_temp AS $$
  INSERT INTO prediction.forecast_registry_events (event_id, scope, tenant_id, domain_id, subject_kind, subject_id, subject_ref, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_kind, p_id, p_ref, p_event, p_actor, coalesce(p_details, '{}'::jsonb), p_correlation)
$$ LANGUAGE sql;
REVOKE ALL ON FUNCTION prediction.pmr_event(uuid,uuid,text,uuid,text,text,uuid,jsonb,uuid) FROM PUBLIC;

/* The family declarations a steward approves — the presence and shape the database insists on (the TS validator says the same in words). */
CREATE OR REPLACE FUNCTION prediction.pmr_check_declarations(p_tenant uuid, p_domain uuid, p_family text, p_kinds text[], p_decl jsonb) RETURNS void
SET search_path = prediction, graph, pg_catalog, pg_temp AS $$
DECLARE a text; v_allowed text[];
BEGIN
  v_allowed := CASE p_family WHEN 'statistical' THEN ARRAY['quantity'] WHEN 'event' THEN ARRAY['event'] WHEN 'state' THEN ARRAY['state']
                 WHEN 'structural_judgmental' THEN ARRAY['state', 'regime'] WHEN 'bayesian' THEN ARRAY['quantity']
                 WHEN 'causal' THEN ARRAY['quantity'] WHEN 'optimisation' THEN ARRAY['quantity'] END;
  IF NOT (p_kinds <@ v_allowed) THEN
    RAISE EXCEPTION 'forecast method rejected (kinds): a % method issues % forecasts, not %', p_family, array_to_string(v_allowed, ' / '), array_to_string(p_kinds, ', ') USING ERRCODE = '22023';
  END IF;
  IF p_family = 'event' AND (jsonb_typeof(p_decl #> '{prior,alpha}') IS DISTINCT FROM 'number' OR jsonb_typeof(p_decl #> '{prior,beta}') IS DISTINCT FROM 'number'
      OR (p_decl #>> '{prior,alpha}')::numeric <= 0 OR (p_decl #>> '{prior,beta}')::numeric <= 0) THEN
    RAISE EXCEPTION 'forecast method rejected (declarations): an event method declares its Beta prior explicitly (declarations.prior {alpha > 0, beta > 0})' USING ERRCODE = '22023';
  END IF;
  IF p_family = 'bayesian' THEN
    IF jsonb_typeof(p_decl -> 'prior') IS DISTINCT FROM 'object' OR (p_decl #>> '{prior,model}') NOT IN ('normal_linear', 'gamma_poisson') THEN
      RAISE EXCEPTION 'forecast method rejected (declarations): a bayesian method declares its prior EXPLICITLY (declarations.prior: normal_linear {window_days, intercept {mean, sd}, slope_per_year {mean, sd}} or gamma_poisson {shape, rate})' USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(p_decl -> 'alternatives') IS DISTINCT FROM 'array' OR jsonb_array_length(p_decl -> 'alternatives') = 0 THEN
      RAISE EXCEPTION 'forecast method rejected (declarations): a bayesian method declares the alternative priors its sensitivity runs under (declarations.alternatives, at least one)' USING ERRCODE = '22023';
    END IF;
  END IF;
  IF p_family = 'causal' THEN
    IF jsonb_typeof(p_decl #> '{intervention,date}') IS DISTINCT FROM 'string' OR (p_decl #>> '{intervention,date}') !~ '^\d{4}-\d{2}-\d{2}$'
       OR length(btrim(coalesce(p_decl #>> '{intervention,description}', ''))) < 8 THEN
      RAISE EXCEPTION 'forecast method rejected (declarations): a causal method declares its intervention (declarations.intervention {date YYYY-MM-DD, description})' USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(p_decl #> '{identification,assumptions}') IS DISTINCT FROM 'array' OR jsonb_array_length(p_decl #> '{identification,assumptions}') = 0
       OR length(btrim(coalesce(p_decl #>> '{identification,statement}', ''))) < 8 THEN
      RAISE EXCEPTION 'forecast method rejected (declarations): a causal method declares its identification assumptions (declarations.identification {assumptions: [ASU ids], statement})' USING ERRCODE = '22023';
    END IF;
    FOR a IN SELECT jsonb_array_elements_text(p_decl #> '{identification,assumptions}') LOOP
      IF a !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' OR NOT EXISTS (SELECT 1 FROM graph.strategy_current s
          WHERE s.strategy_object_id = a::uuid AND s.object_type = 'ASU' AND s.tenant_id = p_tenant AND s.domain_id = p_domain) THEN
        RAISE EXCEPTION 'forecast method rejected (unknown_assumption): % is not an assumption (ASU) of this domain; an identification assumption is declared in the Strategy Graph first', a USING ERRCODE = '23503';
      END IF;
    END LOOP;
    IF jsonb_typeof(p_decl -> 'pre_days') IS DISTINCT FROM 'number' OR jsonb_typeof(p_decl -> 'post_days') IS DISTINCT FROM 'number' THEN
      RAISE EXCEPTION 'forecast method rejected (declarations): a causal method declares its pre and post windows (declarations.pre_days, post_days)' USING ERRCODE = '22023';
    END IF;
  END IF;
  IF p_family = 'optimisation' THEN
    IF jsonb_typeof(p_decl -> 'objective') IS DISTINCT FROM 'object' OR (p_decl #>> '{objective,sense}') NOT IN ('minimise', 'maximise')
       OR jsonb_typeof(p_decl #> '{objective,coefficients}') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'forecast method rejected (declarations): an optimisation method declares its objective (declarations.objective {sense minimise|maximise, coefficients, constant, unit, statement})' USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(p_decl -> 'constraints') IS DISTINCT FROM 'array' OR jsonb_array_length(p_decl -> 'constraints') = 0 THEN
      RAISE EXCEPTION 'forecast method rejected (declarations): an optimisation method declares its constraints (declarations.constraints, at least one) — the steward approves them with the entry' USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(p_decl -> 'variables') IS DISTINCT FROM 'array' OR jsonb_array_length(p_decl -> 'variables') NOT BETWEEN 1 AND 4 THEN
      RAISE EXCEPTION 'forecast method rejected (declarations): an optimisation method declares one to four decision variables with bounds' USING ERRCODE = '22023';
    END IF;
  END IF;
  IF p_family = 'structural_judgmental' THEN
    IF jsonb_typeof(p_decl #> '{judgement,pseudo_counts}') IS DISTINCT FROM 'object' OR length(btrim(coalesce(p_decl #>> '{judgement,rationale}', ''))) < 8
       OR coalesce(p_decl #>> '{judgement,judged_by}', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'forecast method rejected (declarations): a structural-judgmental method declares its judgement (declarations.judgement {pseudo_counts, rationale, judged_by: the named human})' USING ERRCODE = '22023';
    END IF;
    IF coalesce(prediction.pmr_principal_kind((p_decl #>> '{judgement,judged_by}')::uuid), 'none') <> 'human' THEN
      RAISE EXCEPTION 'forecast method rejected (authority): a structural judgement is made by a named, active human (judged_by %)', p_decl #>> '{judgement,judged_by}' USING ERRCODE = '42501';
    END IF;
  END IF;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.pmr_check_declarations(uuid,uuid,text,text[],jsonb) FROM PUBLIC;

/* PROPOSE a method entry (a forecast owner, a steward, an administrator — or an AGENT: AI may draft and propose). The steward named must be a
   named active human holding method_steward in the domain; a key already registered takes the next version only. */
CREATE OR REPLACE FUNCTION prediction.propose_forecast_method(
  p_method_id uuid, p_tenant uuid, p_domain uuid, p_key text, p_version int, p_family text, p_kinds text[], p_horizons text[],
  p_impl_ref text, p_impl_digest text, p_parameters jsonb, p_declarations jsonb, p_validation jsonb, p_description text, p_steward uuid,
  p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_max int; m prediction.forecast_methods%ROWTYPE; v_kind text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.registry.method.propose']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'forecast method rejected (actor): an entry is proposed by the acting principal' USING ERRCODE = '42501'; END IF;
  v_kind := prediction.pmr_principal_kind(p_actor);
  IF v_kind IS NULL THEN RAISE EXCEPTION 'forecast method rejected (actor): the proposer is not an active principal' USING ERRCODE = '42501'; END IF;
  IF coalesce(prediction.pmr_principal_kind(p_steward), 'none') <> 'human' OR NOT decision.holds_role(p_steward, p_tenant, p_domain, 'method_steward') THEN
    RAISE EXCEPTION 'forecast method rejected (unknown_steward): % is not a named, active human holding method_steward in this domain', p_steward USING ERRCODE = '23503';
  END IF;
  IF p_steward = p_actor THEN
    RAISE EXCEPTION 'forecast method rejected (separation_of_duties): the steward who approves an entry is not its proposer' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM prediction.pmr_builtin_methods() b WHERE b.method_key = p_key) THEN
    RAISE EXCEPTION 'forecast method rejected (duplicate): % is a builtin method; a domain retires or quarantines it, it does not re-propose it', p_key USING ERRCODE = '23505';
  END IF;
  SELECT max(version) INTO v_max FROM prediction.forecast_methods WHERE tenant_id = p_tenant AND domain_id = p_domain AND method_key = p_key;
  IF p_version IS DISTINCT FROM coalesce(v_max, 0) + 1 THEN
    RAISE EXCEPTION 'forecast method rejected (duplicate): % is registered up to version %; the next proposal is version %', p_key, coalesce(v_max, 0), coalesce(v_max, 0) + 1 USING ERRCODE = '23505';
  END IF;
  IF p_description IS NULL OR length(btrim(p_description)) < 8 THEN RAISE EXCEPTION 'forecast method rejected (description): an entry says what it computes (at least 8 characters)' USING ERRCODE = '22023'; END IF;
  PERFORM prediction.pmr_check_declarations(p_tenant, p_domain, p_family, p_kinds, coalesce(p_declarations, '{}'::jsonb));
  INSERT INTO prediction.forecast_methods (method_id, scope, tenant_id, domain_id, method_key, version, family, forecast_kinds, horizons, implementation_ref,
    implementation_digest, parameters, declarations, validation_requirement, description, state, steward_principal_id, proposed_by, proposed_by_kind, correlation_id)
  VALUES (p_method_id, 'DOMAIN', p_tenant, p_domain, p_key, p_version, p_family, p_kinds, p_horizons, p_impl_ref, p_impl_digest,
    coalesce(p_parameters, '{}'::jsonb), coalesce(p_declarations, '{}'::jsonb), coalesce(p_validation, '{}'::jsonb), btrim(p_description), 'proposed', p_steward, p_actor, v_kind, p_correlation)
  RETURNING * INTO m;
  PERFORM prediction.pmr_event(p_tenant, p_domain, 'method', m.method_id, m.method_ref, 'method.proposed', p_actor,
    jsonb_build_object('family', p_family, 'proposed_by_kind', v_kind, 'steward', p_steward, 'implementation_digest', p_impl_digest), p_correlation);
  RETURN to_jsonb(m) - 'tenant_id' - 'domain_id' - 'scope' - 'correlation_id';
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.propose_forecast_method(uuid,uuid,uuid,text,int,text,text[],text[],text,text,jsonb,jsonb,jsonb,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.propose_forecast_method(uuid,uuid,uuid,text,int,text,text[],text[],text,text,jsonb,jsonb,jsonb,text,uuid,uuid,uuid) TO eye_commit;

/* DECIDE a proposed entry: approve or reject — the NAMED steward of the entry, a named active human (never an agent), never its proposer. */
CREATE OR REPLACE FUNCTION prediction.decide_forecast_method(p_method_id uuid, p_tenant uuid, p_domain uuid, p_decision text, p_note text, p_actor uuid, p_correlation uuid)
RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE m prediction.forecast_methods%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.registry.method.approve']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'forecast method rejected (actor): a decision is recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF p_decision NOT IN ('approve', 'reject') THEN RAISE EXCEPTION 'forecast method rejected (decision): the decision is approve or reject' USING ERRCODE = '22023'; END IF;
  IF p_note IS NULL OR length(btrim(p_note)) < 8 THEN RAISE EXCEPTION 'forecast method rejected (note): a steward''s decision states its reason (at least 8 characters)' USING ERRCODE = '22023'; END IF;
  SELECT * INTO m FROM prediction.forecast_methods x WHERE x.method_id = p_method_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'forecast method rejected (unknown_method): % is not an entry of this domain''s registry', p_method_id USING ERRCODE = '23503'; END IF;
  IF coalesce(prediction.pmr_principal_kind(p_actor), 'none') <> 'human' THEN
    RAISE EXCEPTION 'forecast method rejected (authority): an entry is approved by a named, active human — an agent never approves a registry entry' USING ERRCODE = '42501';
  END IF;
  IF p_actor = m.proposed_by THEN RAISE EXCEPTION 'forecast method rejected (separation_of_duties): the proposer of % does not decide it', m.method_ref USING ERRCODE = '42501'; END IF;
  IF p_actor <> m.steward_principal_id THEN
    RAISE EXCEPTION 'forecast method rejected (ownership): % names its steward; only that steward decides it', m.method_ref USING ERRCODE = '42501';
  END IF;
  IF NOT decision.holds_role(p_actor, p_tenant, p_domain, 'method_steward') THEN
    RAISE EXCEPTION 'forecast method rejected (authority): the named steward no longer holds method_steward in this domain' USING ERRCODE = '42501';
  END IF;
  IF m.state <> 'proposed' THEN RAISE EXCEPTION 'forecast method rejected (state): % is %, not proposed', m.method_ref, m.state USING ERRCODE = '23514'; END IF;
  UPDATE prediction.forecast_methods SET state = CASE p_decision WHEN 'approve' THEN 'approved' ELSE 'rejected' END, decided_by = p_actor, decided_at = clock_timestamp(),
         decision_note = btrim(p_note) WHERE method_id = m.method_id RETURNING * INTO m;
  PERFORM prediction.pmr_event(p_tenant, p_domain, 'method', m.method_id, m.method_ref, CASE p_decision WHEN 'approve' THEN 'method.approved' ELSE 'method.rejected' END, p_actor,
    jsonb_build_object('note', btrim(p_note), 'declarations_approved', m.declarations), p_correlation);
  RETURN to_jsonb(m) - 'tenant_id' - 'domain_id' - 'scope' - 'correlation_id';
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.decide_forecast_method(uuid,uuid,uuid,text,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.decide_forecast_method(uuid,uuid,uuid,text,text,uuid,uuid) TO eye_commit;

/* The entry of a reference to act on: the domain's own row (locked), or a builtin ADOPTED as a row of the domain (the act is the domain's). */
CREATE OR REPLACE FUNCTION prediction.pmr_entry_for_act(p_tenant uuid, p_domain uuid, p_ref text, p_actor uuid, p_correlation uuid) RETURNS prediction.forecast_methods
SET search_path = prediction, pg_catalog, pg_temp AS $$
DECLARE m prediction.forecast_methods%ROWTYPE; b record;
BEGIN
  SELECT * INTO m FROM prediction.forecast_methods x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.method_ref = p_ref FOR UPDATE;
  IF FOUND THEN RETURN m; END IF;
  SELECT * INTO b FROM prediction.pmr_builtin_methods() x WHERE x.method_ref = p_ref;
  IF NOT FOUND THEN RAISE EXCEPTION 'forecast method rejected (unknown_method): % is not a method of this domain''s registry', p_ref USING ERRCODE = '23503'; END IF;
  INSERT INTO prediction.forecast_methods (method_id, scope, tenant_id, domain_id, method_key, version, family, forecast_kinds, horizons, implementation_ref, implementation_digest,
    parameters, declarations, validation_requirement, description, state, steward_principal_id, adopted_builtin, proposed_by, proposed_by_kind, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, b.method_key, b.version, b.family, b.forecast_kinds, b.horizons, b.implementation_ref, b.implementation_digest,
    b.parameters, b.declarations, b.validation_requirement, b.description, 'approved', p_actor, true, p_actor, coalesce(prediction.pmr_principal_kind(p_actor), 'system'), p_correlation)
  RETURNING * INTO m;
  RETURN m;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.pmr_entry_for_act(uuid,uuid,text,uuid,uuid) FROM PUBLIC;

/* RETIRE an entry (a named human: the domain's method steward or administrator — PDP); the routed plan lists it unavailable from now on. */
CREATE OR REPLACE FUNCTION prediction.retire_forecast_method(p_tenant uuid, p_domain uuid, p_ref text, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE m prediction.forecast_methods%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.registry.method.retire']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'forecast method rejected (actor): a retirement is recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF coalesce(prediction.pmr_principal_kind(p_actor), 'none') <> 'human' THEN RAISE EXCEPTION 'forecast method rejected (authority): a method is retired by a named, active human' USING ERRCODE = '42501'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN RAISE EXCEPTION 'forecast method rejected (reason): a retirement states its reason (at least 8 characters)' USING ERRCODE = '22023'; END IF;
  m := prediction.pmr_entry_for_act(p_tenant, p_domain, p_ref, p_actor, p_correlation);
  IF m.state = 'retired' THEN RAISE EXCEPTION 'forecast method rejected (state): % is already retired', p_ref USING ERRCODE = '23514'; END IF;
  UPDATE prediction.forecast_methods SET state = 'retired', retired_by = p_actor, retired_at = clock_timestamp(), retirement_reason = btrim(p_reason) WHERE method_id = m.method_id RETURNING * INTO m;
  PERFORM prediction.pmr_event(p_tenant, p_domain, 'method', m.method_id, m.method_ref, 'method.retired', p_actor, jsonb_build_object('reason', btrim(p_reason), 'adopted_builtin', m.adopted_builtin), p_correlation);
  RETURN to_jsonb(m) - 'tenant_id' - 'domain_id' - 'scope' - 'correlation_id';
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.retire_forecast_method(uuid,uuid,text,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.retire_forecast_method(uuid,uuid,text,text,uuid,uuid) TO eye_commit;

/* QUARANTINE an entry: by a steward on demand (human, prediction.registry.method.quarantine), or AUTOMATICALLY by the routed issue when a run
   of the method fails (its own action; the caller records the failure in the reason). An already quarantined entry stays as it is under the
   automatic path (idempotent) and is refused under the manual one. */
CREATE OR REPLACE FUNCTION prediction.quarantine_forecast_method(p_tenant uuid, p_domain uuid, p_ref text, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE m prediction.forecast_methods%ROWTYPE; v_action text;
BEGIN
  v_action := observation.assert_authority(ARRAY['prediction.registry.method.quarantine', 'prediction.portfolio.issue', 'prediction.ensemble.issue']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'forecast method rejected (actor): a quarantine is recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF v_action = 'prediction.registry.method.quarantine' AND coalesce(prediction.pmr_principal_kind(p_actor), 'none') <> 'human' THEN
    RAISE EXCEPTION 'forecast method rejected (authority): a quarantine on demand is a named, active human''s act' USING ERRCODE = '42501';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN RAISE EXCEPTION 'forecast method rejected (reason): a quarantine states its reason (at least 8 characters)' USING ERRCODE = '22023'; END IF;
  m := prediction.pmr_entry_for_act(p_tenant, p_domain, p_ref, p_actor, p_correlation);
  IF m.state = 'quarantined' AND v_action <> 'prediction.registry.method.quarantine' THEN RETURN to_jsonb(m) - 'tenant_id' - 'domain_id' - 'scope' - 'correlation_id'; END IF;
  IF m.state <> 'approved' THEN RAISE EXCEPTION 'forecast method rejected (state): % is %; only an approved entry is quarantined', p_ref, m.state USING ERRCODE = '23514'; END IF;
  UPDATE prediction.forecast_methods SET state = 'quarantined', quarantined_at = clock_timestamp(), quarantine_reason = btrim(p_reason) WHERE method_id = m.method_id RETURNING * INTO m;
  PERFORM prediction.pmr_event(p_tenant, p_domain, 'method', m.method_id, m.method_ref, 'method.quarantined', p_actor,
    jsonb_build_object('reason', btrim(p_reason), 'automatic', v_action <> 'prediction.registry.method.quarantine', 'action', v_action), p_correlation);
  RETURN to_jsonb(m) - 'tenant_id' - 'domain_id' - 'scope' - 'correlation_id';
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.quarantine_forecast_method(uuid,uuid,text,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.quarantine_forecast_method(uuid,uuid,text,text,uuid,uuid) TO eye_commit;

/* REINSTATE a quarantined entry: its named steward (or, for an adopted builtin, a method steward of the domain), a named active human. */
CREATE OR REPLACE FUNCTION prediction.reinstate_forecast_method(p_tenant uuid, p_domain uuid, p_ref text, p_note text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE m prediction.forecast_methods%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.registry.method.reinstate']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'forecast method rejected (actor): a reinstatement is recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF coalesce(prediction.pmr_principal_kind(p_actor), 'none') <> 'human' OR NOT decision.holds_role(p_actor, p_tenant, p_domain, 'method_steward') THEN
    RAISE EXCEPTION 'forecast method rejected (authority): a quarantined method is reinstated by a named, active human method steward' USING ERRCODE = '42501';
  END IF;
  IF p_note IS NULL OR length(btrim(p_note)) < 8 THEN RAISE EXCEPTION 'forecast method rejected (note): a reinstatement states what was checked (at least 8 characters)' USING ERRCODE = '22023'; END IF;
  SELECT * INTO m FROM prediction.forecast_methods x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.method_ref = p_ref FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'forecast method rejected (unknown_method): % is not an entry of this domain''s registry', p_ref USING ERRCODE = '23503'; END IF;
  IF m.state <> 'quarantined' THEN RAISE EXCEPTION 'forecast method rejected (state): % is %, not quarantined', p_ref, m.state USING ERRCODE = '23514'; END IF;
  IF NOT m.adopted_builtin AND p_actor <> m.steward_principal_id THEN
    RAISE EXCEPTION 'forecast method rejected (ownership): % names its steward; only that steward reinstates it', p_ref USING ERRCODE = '42501';
  END IF;
  UPDATE prediction.forecast_methods SET state = 'approved', quarantined_at = NULL, quarantine_reason = NULL WHERE method_id = m.method_id RETURNING * INTO m;
  PERFORM prediction.pmr_event(p_tenant, p_domain, 'method', m.method_id, m.method_ref, 'method.reinstated', p_actor, jsonb_build_object('note', btrim(p_note)), p_correlation);
  RETURN to_jsonb(m) - 'tenant_id' - 'domain_id' - 'scope' - 'correlation_id';
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.reinstate_forecast_method(uuid,uuid,text,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.reinstate_forecast_method(uuid,uuid,text,text,uuid,uuid) TO eye_commit;

/* DECLARE a target (a forecast owner, an administrator, or an agent drafting): its kind-specific definition is checked here — an event's
   condition, a regime's categories (the last the `otherwise`), a quantity's aggregation — and every series it names is registered. */
CREATE OR REPLACE FUNCTION prediction.declare_forecast_target(
  p_target_id uuid, p_tenant uuid, p_domain uuid, p_key text, p_kind text, p_unit text, p_title text, p_definition jsonb, p_sources jsonb,
  p_subject uuid, p_risk_class text, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE t prediction.forecast_targets%ROWTYPE; v_kind text; v_version int; s text; k text; c jsonb; n int; v_kinds text[];
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.registry.target.declare']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'forecast target rejected (actor): a target is declared by the acting principal' USING ERRCODE = '42501'; END IF;
  v_kind := prediction.pmr_principal_kind(p_actor);
  IF v_kind IS NULL THEN RAISE EXCEPTION 'forecast target rejected (actor): the declarer is not an active principal' USING ERRCODE = '42501'; END IF;
  IF p_kind NOT IN ('quantity', 'event', 'state', 'regime') THEN RAISE EXCEPTION 'forecast target rejected (kind): the kind is quantity, event, state or regime' USING ERRCODE = '22023'; END IF;
  IF p_title IS NULL OR length(btrim(p_title)) < 8 THEN RAISE EXCEPTION 'forecast target rejected (title): a target is named in words (at least 8 characters)' USING ERRCODE = '22023'; END IF;
  IF p_definition IS NULL OR jsonb_typeof(p_definition) <> 'object' OR jsonb_typeof(p_definition -> 'series_key') IS DISTINCT FROM 'string' THEN
    RAISE EXCEPTION 'forecast target rejected (definition): a target names the series it is read from (definition.series_key)' USING ERRCODE = '22023';
  END IF;
  FOR s IN SELECT DISTINCT x FROM (SELECT p_definition ->> 'series_key' x UNION ALL SELECT jsonb_array_elements_text(coalesce(p_sources -> 'series', '[]'::jsonb))) y LOOP
    IF NOT EXISTS (SELECT 1 FROM prediction.series_registry r WHERE r.tenant_id = p_tenant AND r.domain_id = p_domain AND r.series_key = s) THEN
      RAISE EXCEPTION 'forecast target rejected (unknown_series): % is not a series registered in this domain', s USING ERRCODE = '23503';
    END IF;
  END LOOP;
  v_kinds := ARRAY[p_kind] || coalesce((SELECT array_agg(DISTINCT v) FROM jsonb_each_text(coalesce(p_definition -> 'horizon_kinds', '{}'::jsonb)) e(h, v)), ARRAY[]::text[]);
  IF EXISTS (SELECT 1 FROM jsonb_each_text(coalesce(p_definition -> 'horizon_kinds', '{}'::jsonb)) e(h, v) WHERE h NOT IN ('30d', '90d', '180d', '1y', '3y', '5y') OR v NOT IN ('quantity', 'event', 'state', 'regime')) THEN
    RAISE EXCEPTION 'forecast target rejected (definition): definition.horizon_kinds maps horizons (30d … 5y) to kinds (quantity, event, state, regime)' USING ERRCODE = '22023';
  END IF;
  FOREACH k IN ARRAY v_kinds LOOP
    IF k = 'event' AND (jsonb_typeof(p_definition #> '{event,comparator}') IS DISTINCT FROM 'string' OR (p_definition #>> '{event,comparator}') NOT IN ('<', '<=', '>', '>=')
        OR jsonb_typeof(p_definition #> '{event,threshold}') IS DISTINCT FROM 'number' OR jsonb_typeof(p_definition #> '{event,consecutive}') IS DISTINCT FROM 'number'
        OR (p_definition #>> '{event,consecutive}')::numeric < 1) THEN
      RAISE EXCEPTION 'forecast target rejected (definition): an event is defined by its condition (definition.event {comparator, threshold, consecutive ≥ 1}) — never by narrative' USING ERRCODE = '22023';
    END IF;
    IF k IN ('regime', 'state') THEN
      IF jsonb_typeof(p_definition #> ARRAY[k, 'categories']) IS DISTINCT FROM 'array' OR jsonb_array_length(p_definition #> ARRAY[k, 'categories']) < 2
         OR jsonb_typeof(p_definition #> ARRAY[k, 'classification_window_days']) IS DISTINCT FROM 'number' THEN
        RAISE EXCEPTION 'forecast target rejected (definition): a % is defined by at least two categories and a classification window (definition.%.categories, classification_window_days)', k, k USING ERRCODE = '22023';
      END IF;
      n := 0;
      FOR c IN SELECT x FROM jsonb_array_elements(p_definition #> ARRAY[k, 'categories']) x LOOP
        n := n + 1;
        IF jsonb_typeof(c -> 'key') IS DISTINCT FROM 'string' OR jsonb_typeof(c -> 'label') IS DISTINCT FROM 'string'
           OR (n < jsonb_array_length(p_definition #> ARRAY[k, 'categories']) AND (jsonb_typeof(c #> '{rule,threshold}') IS DISTINCT FROM 'number' OR (c #>> '{rule,comparator}') NOT IN ('<', '<=', '>', '>=')))
           OR (n = jsonb_array_length(p_definition #> ARRAY[k, 'categories']) AND coalesce(jsonb_typeof(c -> 'rule'), 'null') <> 'null') THEN
          RAISE EXCEPTION 'forecast target rejected (definition): category % names a key, a label and a rule {comparator, threshold} on the window mean — the last category is the otherwise (rule null)', n USING ERRCODE = '22023';
        END IF;
      END LOOP;
    END IF;
    IF k = 'quantity' AND (p_definition #>> '{quantity,aggregation}') IS DISTINCT FROM NULL AND (p_definition #>> '{quantity,aggregation}') NOT IN ('value', 'window_mean', 'effect', 'objective') THEN
      RAISE EXCEPTION 'forecast target rejected (definition): a quantity''s aggregation is value, window_mean, effect or objective' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF p_subject IS NOT NULL AND NOT EXISTS (SELECT 1 FROM graph.entities_current e WHERE e.entity_id = p_subject AND e.tenant_id = p_tenant AND e.domain_id = p_domain) THEN
    RAISE EXCEPTION 'forecast target rejected (unknown_subject): % is not an entity of this domain', p_subject USING ERRCODE = '23503';
  END IF;
  SELECT coalesce(max(version), 0) + 1 INTO v_version FROM prediction.forecast_targets WHERE tenant_id = p_tenant AND domain_id = p_domain AND target_key = p_key;
  INSERT INTO prediction.forecast_targets (target_id, scope, tenant_id, domain_id, target_key, version, kind, unit, title, definition, sources, subject_entity_id, risk_class,
    state, declared_by, declared_by_kind, correlation_id)
  VALUES (p_target_id, 'DOMAIN', p_tenant, p_domain, p_key, v_version, p_kind, btrim(p_unit), btrim(p_title), p_definition, coalesce(p_sources, '{}'::jsonb), p_subject,
    coalesce(p_risk_class, 'standard'), 'proposed', p_actor, v_kind, p_correlation)
  RETURNING * INTO t;
  PERFORM prediction.pmr_event(p_tenant, p_domain, 'target', t.target_id, t.target_key || '@' || t.version, 'target.declared', p_actor, jsonb_build_object('kind', p_kind, 'declared_by_kind', v_kind), p_correlation);
  RETURN to_jsonb(t) - 'tenant_id' - 'domain_id' - 'scope' - 'correlation_id';
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.declare_forecast_target(uuid,uuid,uuid,text,text,text,text,jsonb,jsonb,uuid,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.declare_forecast_target(uuid,uuid,uuid,text,text,text,text,jsonb,jsonb,uuid,text,uuid,uuid) TO eye_commit;

/* DECIDE a declared target: a named active human (forecast owner or administrator — PDP) who did not declare it. Approving a version
   retires nothing: the plan reads the highest APPROVED version. */
CREATE OR REPLACE FUNCTION prediction.decide_forecast_target(p_target_id uuid, p_tenant uuid, p_domain uuid, p_decision text, p_note text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE t prediction.forecast_targets%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.registry.target.approve']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'forecast target rejected (actor): a decision is recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF coalesce(prediction.pmr_principal_kind(p_actor), 'none') <> 'human' THEN RAISE EXCEPTION 'forecast target rejected (authority): a target is approved by a named, active human' USING ERRCODE = '42501'; END IF;
  IF p_decision NOT IN ('approve', 'reject') THEN RAISE EXCEPTION 'forecast target rejected (decision): the decision is approve or reject' USING ERRCODE = '22023'; END IF;
  IF p_note IS NULL OR length(btrim(p_note)) < 8 THEN RAISE EXCEPTION 'forecast target rejected (note): a decision states its reason (at least 8 characters)' USING ERRCODE = '22023'; END IF;
  SELECT * INTO t FROM prediction.forecast_targets x WHERE x.target_id = p_target_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'forecast target rejected (unknown_target): % is not a target of this domain', p_target_id USING ERRCODE = '23503'; END IF;
  IF p_actor = t.declared_by THEN RAISE EXCEPTION 'forecast target rejected (separation_of_duties): the declarer of % does not approve it', t.target_key USING ERRCODE = '42501'; END IF;
  IF t.state <> 'proposed' THEN RAISE EXCEPTION 'forecast target rejected (state): % version % is %, not proposed', t.target_key, t.version, t.state USING ERRCODE = '23514'; END IF;
  UPDATE prediction.forecast_targets SET state = CASE p_decision WHEN 'approve' THEN 'approved' ELSE 'rejected' END, decided_by = p_actor, decided_at = clock_timestamp(), decision_note = btrim(p_note)
   WHERE target_id = t.target_id RETURNING * INTO t;
  PERFORM prediction.pmr_event(p_tenant, p_domain, 'target', t.target_id, t.target_key || '@' || t.version, CASE p_decision WHEN 'approve' THEN 'target.approved' ELSE 'target.rejected' END, p_actor,
    jsonb_build_object('note', btrim(p_note)), p_correlation);
  RETURN to_jsonb(t) - 'tenant_id' - 'domain_id' - 'scope' - 'correlation_id';
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.decide_forecast_target(uuid,uuid,uuid,text,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.decide_forecast_target(uuid,uuid,uuid,text,text,uuid,uuid) TO eye_commit;

/* The shape of a horizon policy's rules (checked at publication). */
CREATE OR REPLACE FUNCTION prediction.pmr_check_policy_rules(p_rules jsonb) RETURNS void
SET search_path = prediction, pg_catalog, pg_temp AS $$
DECLARE h text; r jsonb; k text; kr jsonb; f text;
BEGIN
  IF p_rules IS NULL OR jsonb_typeof(p_rules) <> 'object' OR p_rules = '{}'::jsonb THEN
    RAISE EXCEPTION 'horizon policy rejected (rules): a policy has a rule per horizon (an object keyed 30d … 5y)' USING ERRCODE = '22023';
  END IF;
  FOR h, r IN SELECT key, value FROM jsonb_each(p_rules) LOOP
    IF h NOT IN ('30d', '90d', '180d', '1y', '3y', '5y') THEN RAISE EXCEPTION 'horizon policy rejected (horizon): % is not one of 30d, 90d, 180d, 1y, 3y, 5y', h USING ERRCODE = '22023'; END IF;
    IF jsonb_typeof(r) <> 'object' OR length(btrim(coalesce(r ->> 'treatment', ''))) < 8 THEN
      RAISE EXCEPTION 'horizon policy rejected (rules): the % rule states the horizon''s treatment in words (treatment, at least 8 characters)', h USING ERRCODE = '22023';
    END IF;
    IF r ? 'unsupported' THEN
      IF length(btrim(coalesce(r ->> 'unsupported', ''))) < 8 THEN RAISE EXCEPTION 'horizon policy rejected (rules): an unsupported horizon (%) states why', h USING ERRCODE = '22023'; END IF;
      CONTINUE;
    END IF;
    IF jsonb_typeof(r -> 'allowed_families') IS DISTINCT FROM 'array' OR jsonb_array_length(r -> 'allowed_families') = 0 THEN
      RAISE EXCEPTION 'horizon policy rejected (rules): the % rule names the families it allows (allowed_families)', h USING ERRCODE = '22023';
    END IF;
    FOR f IN SELECT jsonb_array_elements_text(r -> 'allowed_families') LOOP
      IF f NOT IN ('statistical', 'event', 'state', 'bayesian', 'causal', 'structural_judgmental', 'optimisation') THEN
        RAISE EXCEPTION 'horizon policy rejected (family): % is not a method family', f USING ERRCODE = '22023';
      END IF;
    END LOOP;
    IF jsonb_typeof(r -> 'kinds') IS DISTINCT FROM 'object' OR r -> 'kinds' = '{}'::jsonb THEN
      RAISE EXCEPTION 'horizon policy rejected (rules): the % rule states per forecast kind its confidence language and validation (kinds)', h USING ERRCODE = '22023';
    END IF;
    FOR k, kr IN SELECT key, value FROM jsonb_each(r -> 'kinds') LOOP
      IF k NOT IN ('quantity', 'event', 'state', 'regime') THEN RAISE EXCEPTION 'horizon policy rejected (kind): % is not a forecast kind', k USING ERRCODE = '22023'; END IF;
      IF (kr ->> 'confidence_language') NOT IN ('probability', 'distribution', 'distribution_with_scenarios', 'scenario_language') OR kr ->> 'confidence_language' IS NULL THEN
        RAISE EXCEPTION 'horizon policy rejected (language): the % rule for % names its confidence language (probability, distribution, distribution_with_scenarios, scenario_language)', h, k USING ERRCODE = '22023';
      END IF;
      IF kr ->> 'confidence_language' = 'scenario_language' AND k NOT IN ('state', 'regime') THEN
        RAISE EXCEPTION 'horizon policy rejected (language): scenario language is a state or regime forecast''s (% at %)', k, h USING ERRCODE = '22023';
      END IF;
      IF jsonb_typeof(kr -> 'validation') IS DISTINCT FROM 'object' OR jsonb_typeof(kr #> '{validation,required}') IS DISTINCT FROM 'boolean' THEN
        RAISE EXCEPTION 'horizon policy rejected (validation): the % rule for % states whether validation is required (validation.required)', h, k USING ERRCODE = '22023';
      END IF;
      IF (kr #>> '{validation,required}')::boolean THEN
        IF (kr #>> '{validation,kind}') NOT IN ('quantity_rolling_origin', 'event_backtest') OR (kr #>> '{validation,kind}') IS NULL
           OR jsonb_typeof(kr #> '{validation,min_origins}') IS DISTINCT FROM 'number' OR (kr #>> '{validation,min_origins}')::int < 1
           OR jsonb_typeof(kr #> '{validation,modes}') IS DISTINCT FROM 'array' OR jsonb_array_length(kr #> '{validation,modes}') = 0 THEN
          RAISE EXCEPTION 'horizon policy rejected (validation): a required validation names its kind (quantity_rolling_origin | event_backtest), min_origins ≥ 1 and the modes it accepts (% / %)', h, k USING ERRCODE = '22023';
        END IF;
        IF kr ->> 'confidence_language' = 'scenario_language' THEN
          RAISE EXCEPTION 'horizon policy rejected (validation): scenario language claims no validation, so none is required of it (% at %)', k, h USING ERRCODE = '22023';
        END IF;
      END IF;
    END LOOP;
  END LOOP;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.pmr_check_policy_rules(jsonb) FROM PUBLIC;

/* PUBLISH a horizon policy version (a named human forecast owner or administrator — PDP, human-gated): proposed until the named method
   steward concurs. */
CREATE OR REPLACE FUNCTION prediction.publish_horizon_policy(p_policy_id uuid, p_tenant uuid, p_domain uuid, p_risk_class text, p_rules jsonb, p_statement text, p_steward uuid,
  p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE p prediction.horizon_policies%ROWTYPE; v_version int;
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.registry.policy.publish']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'horizon policy rejected (actor): a policy is published by the acting principal' USING ERRCODE = '42501'; END IF;
  IF coalesce(prediction.pmr_principal_kind(p_actor), 'none') <> 'human' THEN RAISE EXCEPTION 'horizon policy rejected (authority): a horizon policy is published by a named, active human' USING ERRCODE = '42501'; END IF;
  IF coalesce(prediction.pmr_principal_kind(p_steward), 'none') <> 'human' OR NOT decision.holds_role(p_steward, p_tenant, p_domain, 'method_steward') THEN
    RAISE EXCEPTION 'horizon policy rejected (unknown_steward): % is not a named, active human holding method_steward in this domain', p_steward USING ERRCODE = '23503';
  END IF;
  IF p_steward = p_actor THEN RAISE EXCEPTION 'horizon policy rejected (separation_of_duties): the steward who concurs is not the publisher' USING ERRCODE = '42501'; END IF;
  IF p_risk_class IS NULL OR p_risk_class !~ '^[a-z][a-z0-9_]{1,40}$' THEN RAISE EXCEPTION 'horizon policy rejected (risk_class): a policy names its risk class (lower-case words)' USING ERRCODE = '22023'; END IF;
  IF p_statement IS NULL OR length(btrim(p_statement)) < 8 THEN RAISE EXCEPTION 'horizon policy rejected (statement): a policy says what it decides (at least 8 characters)' USING ERRCODE = '22023'; END IF;
  PERFORM prediction.pmr_check_policy_rules(p_rules);
  SELECT coalesce(max(version), 0) + 1 INTO v_version FROM prediction.horizon_policies WHERE tenant_id = p_tenant AND domain_id = p_domain AND risk_class = p_risk_class;
  INSERT INTO prediction.horizon_policies (policy_id, scope, tenant_id, domain_id, risk_class, version, rules, statement, state, steward_principal_id, published_by, correlation_id)
  VALUES (p_policy_id, 'DOMAIN', p_tenant, p_domain, p_risk_class, v_version, p_rules, btrim(p_statement), 'proposed', p_steward, p_actor, p_correlation) RETURNING * INTO p;
  PERFORM prediction.pmr_event(p_tenant, p_domain, 'policy', p.policy_id, p.risk_class || '@' || p.version, 'policy.published', p_actor, jsonb_build_object('steward', p_steward), p_correlation);
  RETURN to_jsonb(p) - 'tenant_id' - 'domain_id' - 'scope' - 'correlation_id';
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.publish_horizon_policy(uuid,uuid,uuid,text,jsonb,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.publish_horizon_policy(uuid,uuid,uuid,text,jsonb,text,uuid,uuid,uuid) TO eye_commit;

/* CONCUR (or reject) a published policy: the NAMED method steward, a named active human who did not publish it. The concurrence activates
   the version and supersedes the prior active one of the risk class. */
CREATE OR REPLACE FUNCTION prediction.concur_horizon_policy(p_policy_id uuid, p_tenant uuid, p_domain uuid, p_decision text, p_note text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE p prediction.horizon_policies%ROWTYPE; prior prediction.horizon_policies%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.registry.policy.concur']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'horizon policy rejected (actor): a concurrence is recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF p_decision NOT IN ('concur', 'reject') THEN RAISE EXCEPTION 'horizon policy rejected (decision): the decision is concur or reject' USING ERRCODE = '22023'; END IF;
  IF p_note IS NULL OR length(btrim(p_note)) < 8 THEN RAISE EXCEPTION 'horizon policy rejected (note): a concurrence states its reason (at least 8 characters)' USING ERRCODE = '22023'; END IF;
  SELECT * INTO p FROM prediction.horizon_policies x WHERE x.policy_id = p_policy_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'horizon policy rejected (unknown_policy): % is not a policy of this domain', p_policy_id USING ERRCODE = '23503'; END IF;
  IF coalesce(prediction.pmr_principal_kind(p_actor), 'none') <> 'human' THEN RAISE EXCEPTION 'horizon policy rejected (authority): a concurrence is a named, active human''s act' USING ERRCODE = '42501'; END IF;
  IF p_actor = p.published_by THEN RAISE EXCEPTION 'horizon policy rejected (separation_of_duties): the publisher of policy % version % does not concur with it', p.risk_class, p.version USING ERRCODE = '42501'; END IF;
  IF p_actor <> p.steward_principal_id THEN RAISE EXCEPTION 'horizon policy rejected (ownership): policy % version % names its steward; only that steward concurs', p.risk_class, p.version USING ERRCODE = '42501'; END IF;
  IF NOT decision.holds_role(p_actor, p_tenant, p_domain, 'method_steward') THEN RAISE EXCEPTION 'horizon policy rejected (authority): the named steward no longer holds method_steward' USING ERRCODE = '42501'; END IF;
  IF p.state <> 'proposed' THEN RAISE EXCEPTION 'horizon policy rejected (state): policy % version % is %, not proposed', p.risk_class, p.version, p.state USING ERRCODE = '23514'; END IF;
  IF p_decision = 'concur' THEN
    FOR prior IN SELECT * FROM prediction.horizon_policies x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.risk_class = p.risk_class AND x.state = 'active' FOR UPDATE LOOP
      UPDATE prediction.horizon_policies SET state = 'superseded', superseded_at = clock_timestamp(), superseded_by = p.policy_id WHERE policy_id = prior.policy_id;
      PERFORM prediction.pmr_event(p_tenant, p_domain, 'policy', prior.policy_id, prior.risk_class || '@' || prior.version, 'policy.superseded', p_actor, jsonb_build_object('superseded_by', p.policy_id), p_correlation);
    END LOOP;
  END IF;
  UPDATE prediction.horizon_policies SET state = CASE p_decision WHEN 'concur' THEN 'active' ELSE 'rejected' END, concurred_by = p_actor, concurred_at = clock_timestamp(), concurrence_note = btrim(p_note)
   WHERE policy_id = p.policy_id RETURNING * INTO p;
  PERFORM prediction.pmr_event(p_tenant, p_domain, 'policy', p.policy_id, p.risk_class || '@' || p.version, CASE p_decision WHEN 'concur' THEN 'policy.concurred' ELSE 'policy.rejected' END, p_actor,
    jsonb_build_object('note', btrim(p_note)), p_correlation);
  RETURN to_jsonb(p) - 'tenant_id' - 'domain_id' - 'scope' - 'correlation_id';
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.concur_horizon_policy(uuid,uuid,uuid,text,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.concur_horizon_policy(uuid,uuid,uuid,text,text,uuid,uuid) TO eye_commit;

/* RECORD a validation (computed by the service on the known-at history; recorded here with its prediction.backtests row — method = the
   method key, method_version = the method_ref, baseline = the reference — so a forecast's validation claim names a record issue_forecast
   itself checks, and no legacy leash ever reads it). Whoever runs it: a forecast owner, an agent, a steward, an administrator (PDP). */
CREATE OR REPLACE FUNCTION prediction.record_method_validation(
  p_validation_id uuid, p_backtest_id uuid, p_tenant uuid, p_domain uuid, p_method_ref text, p_target_key text, p_series_key text, p_horizon text, p_horizon_days int,
  p_kind text, p_mode text, p_origins int, p_min_origins int, p_metrics jsonb, p_passed boolean, p_verdict text, p_window_from date, p_window_to date,
  p_known_at timestamptz, p_observations int, p_synthetic boolean, p_discipline text, p_details jsonb, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v prediction.method_validations%ROWTYPE; m record; v_from date := p_window_from; v_to date := p_window_to;
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.registry.validation.record']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'forecast method rejected (actor): a validation is recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO m FROM prediction.effective_forecast_methods(p_tenant, p_domain) e WHERE e.method_ref = p_method_ref;
  IF NOT FOUND THEN RAISE EXCEPTION 'forecast method rejected (unknown_method): % is not a method of this domain''s registry', p_method_ref USING ERRCODE = '23503'; END IF;
  IF NOT EXISTS (SELECT 1 FROM prediction.series_registry r WHERE r.tenant_id = p_tenant AND r.domain_id = p_domain AND r.series_key = p_series_key) THEN
    RAISE EXCEPTION 'forecast method rejected (unknown_series): % is not a series registered in this domain', p_series_key USING ERRCODE = '23503';
  END IF;
  IF p_passed AND (p_origins < p_min_origins) THEN RAISE EXCEPTION 'forecast method rejected (validation): a validation with % origin(s) does not pass a minimum of %', p_origins, p_min_origins USING ERRCODE = '22023'; END IF;
  IF v_to IS NULL OR v_from IS NULL OR v_to <= v_from THEN RAISE EXCEPTION 'forecast method rejected (validation): a validation names the window of history it scored (from < to)' USING ERRCODE = '22023'; END IF;
  INSERT INTO prediction.backtests (backtest_id, scope, tenant_id, domain_id, series_key, horizon_code, horizon_days, method, method_version, baseline_method, window_from, window_to,
    origins, coverage_80, pinball_mean, baseline_coverage_80, baseline_pinball_mean, skill_vs_baseline, t1_met, t2_met, verdict, known_at_discipline, details, known_at, observations, mode,
    computed_by, correlation_id)
  VALUES (p_backtest_id, 'DOMAIN', p_tenant, p_domain, p_series_key, p_horizon, p_horizon_days, m.method_key, p_method_ref,
    CASE p_kind WHEN 'event_backtest' THEN 'prior-mean reference' ELSE 'climatology' END, v_from, v_to, p_origins,
    (p_metrics ->> 'coverage')::numeric, (p_metrics ->> 'pinball')::numeric, (p_metrics ->> 'reference_coverage')::numeric, (p_metrics ->> 'reference_pinball')::numeric,
    (p_metrics ->> 'skill')::numeric, CASE WHEN p_kind = 'quantity_rolling_origin' THEN (p_metrics ->> 't1')::boolean ELSE NULL END, NULL,
    p_verdict, coalesce(p_discipline, p_mode), jsonb_build_object('b25_validation_id', p_validation_id, 'kind', p_kind, 'passed', p_passed, 'metrics', p_metrics) || coalesce(p_details, '{}'::jsonb),
    p_known_at, p_observations, p_mode, p_actor, p_correlation);
  INSERT INTO prediction.method_validations (validation_id, scope, tenant_id, domain_id, method_ref, target_key, series_key, horizon_code, horizon_days, kind, mode, origins, min_origins,
    metrics, passed, verdict, window_from, window_to, known_at, observations, backtest_id, synthetic, details, computed_by, correlation_id)
  VALUES (p_validation_id, 'DOMAIN', p_tenant, p_domain, p_method_ref, p_target_key, p_series_key, p_horizon, p_horizon_days, p_kind, p_mode, p_origins, p_min_origins,
    coalesce(p_metrics, '{}'::jsonb), p_passed, p_verdict, v_from, v_to, p_known_at, p_observations, p_backtest_id, p_synthetic, coalesce(p_details, '{}'::jsonb), p_actor, p_correlation)
  RETURNING * INTO v;
  PERFORM prediction.pmr_event(p_tenant, p_domain, 'validation', v.validation_id, p_method_ref || ' ' || p_series_key || ' ' || p_horizon, 'validation.recorded', p_actor,
    jsonb_build_object('passed', p_passed, 'origins', p_origins, 'mode', p_mode, 'synthetic', p_synthetic, 'backtest_id', p_backtest_id), p_correlation);
  RETURN to_jsonb(v) - 'tenant_id' - 'domain_id' - 'scope' - 'correlation_id';
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.record_method_validation(uuid,uuid,uuid,uuid,text,text,text,text,int,text,text,int,int,jsonb,boolean,text,date,date,timestamptz,int,boolean,text,jsonb,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.record_method_validation(uuid,uuid,uuid,uuid,text,text,text,text,int,text,text,int,int,jsonb,boolean,text,date,date,timestamptz,int,boolean,text,jsonb,uuid,uuid) TO eye_commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §MR.5 ROUTING
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
/* THE PLAN (L6-C03, V03-T-320) — an INVOKER read (the caller's RLS): the target's latest APPROVED version (its kind at this horizon), the
   series, the active horizon policy of the target's risk class (else `standard`), the horizon's rule and the kind's rule, and every entry of
   the effective registry that serves the kind at the horizon in an allowed family — each AVAILABLE or not with its reason (proposed,
   rejected, retired, quarantined, superseded by a later approved version, the policy's required validation missing). The plan answers a
   REFUSAL (the text and its class) instead of methods when the horizon is unsupported, the kind is not allowed, no method serves it or none
   is available — `forecast rejected (horizon): <target> at <h> is unsupported — <the missing validation>` when the missing piece is the
   required validation. With no active policy the LEGACY RULE applies: the statistical methods at every horizon, quantity forecasts only. */
CREATE OR REPLACE FUNCTION prediction.forecast_route_plan(p_tenant uuid, p_domain uuid, p_target_key text, p_series_key text, p_horizon text, p_known_at timestamptz, p_cutoff date)
RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = prediction, pg_catalog, pg_temp AS $$
DECLARE t prediction.forecast_targets%ROWTYPE; pol prediction.horizon_policies%ROWTYPE; v_has_pol boolean := false; rule jsonb; krule jsonb;
        v_kind text := 'quantity'; v_series text := p_series_key; v_risk text := 'standard'; v_label text; m record; v_methods jsonb := '[]'::jsonb;
        v_avail boolean; v_reason text; v_val jsonb; v_req boolean := false; v_vkind text; v_min int; v_modes text[]; v_found prediction.method_validations%ROWTYPE;
        v_last prediction.method_validations%ROWTYPE; v_missing text[] := ARRAY[]::text[]; v_any_avail boolean := false; v_only_validation boolean := true; v_refusal text; v_class text;
        v_families text[]; v_lang text := 'distribution'; v_treatment text; v_target jsonb := NULL;
BEGIN
  IF p_horizon NOT IN ('30d', '90d', '180d', '1y', '3y', '5y') THEN
    RAISE EXCEPTION 'forecast rejected (horizon): % is not one of 30d, 90d, 180d, 1y, 3y, 5y', p_horizon USING ERRCODE = '22023';
  END IF;
  IF p_target_key IS NOT NULL THEN
    SELECT * INTO t FROM prediction.forecast_targets x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.target_key = p_target_key AND x.state = 'approved' ORDER BY x.version DESC LIMIT 1;
    IF NOT FOUND THEN
      IF EXISTS (SELECT 1 FROM prediction.forecast_targets x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.target_key = p_target_key) THEN
        RAISE EXCEPTION 'forecast rejected (state): target % has no approved version — a named human approves a target before anything is forecast on it', p_target_key USING ERRCODE = '23514';
      END IF;
      RAISE EXCEPTION 'forecast rejected (unknown_target): % is not a target of this domain', p_target_key USING ERRCODE = '23503';
    END IF;
    v_kind := coalesce(t.definition -> 'horizon_kinds' ->> p_horizon, t.kind);
    v_series := coalesce(p_series_key, t.definition ->> 'series_key');
    v_risk := t.risk_class;
    v_target := jsonb_build_object('target_id', t.target_id, 'target_key', t.target_key, 'version', t.version, 'kind', t.kind, 'unit', t.unit, 'title', t.title,
                                   'definition', t.definition, 'sources', t.sources, 'subject_entity_id', t.subject_entity_id, 'risk_class', t.risk_class);
  END IF;
  IF v_series IS NULL THEN RAISE EXCEPTION 'forecast rejected (series): a routed forecast names a target or a series' USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM prediction.series_registry r WHERE r.tenant_id = p_tenant AND r.domain_id = p_domain AND r.series_key = v_series) THEN
    RAISE EXCEPTION 'forecast rejected (unknown_series): % is not a series registered in this domain', v_series USING ERRCODE = '23503';
  END IF;
  v_label := coalesce(p_target_key, v_series);
  SELECT * INTO pol FROM prediction.horizon_policies x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.risk_class = v_risk AND x.state = 'active';
  v_has_pol := FOUND;
  IF NOT v_has_pol AND v_risk <> 'standard' THEN
    SELECT * INTO pol FROM prediction.horizon_policies x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.risk_class = 'standard' AND x.state = 'active';
    v_has_pol := FOUND;
  END IF;

  IF NOT v_has_pol THEN
    -- THE LEGACY RULE: no policy published — quantity forecasts by the approved statistical methods at every horizon, no validation required.
    IF v_kind <> 'quantity' THEN
      v_refusal := format('forecast rejected (horizon): %s at %s is unsupported — no horizon policy is published in this domain, and the legacy rule covers quantity forecasts only (a %s forecast needs a policy that names its confidence language)', v_label, p_horizon, v_kind);
      v_class := 'horizon';
    END IF;
    v_families := ARRAY['statistical']; v_lang := 'distribution'; v_treatment := 'the legacy rule (no horizon policy published): the statistical methods at every horizon';
    rule := NULL; krule := jsonb_build_object('confidence_language', 'distribution', 'validation', jsonb_build_object('required', false));
  ELSE
    rule := pol.rules -> p_horizon;
    v_treatment := rule ->> 'treatment';
    IF rule IS NULL THEN
      v_refusal := format('forecast rejected (horizon): %s at %s is unsupported — horizon policy %s version %s names no rule for %s', v_label, p_horizon, pol.risk_class, pol.version, p_horizon); v_class := 'horizon';
    ELSIF rule ? 'unsupported' THEN
      v_refusal := format('forecast rejected (horizon): %s at %s is unsupported — %s (horizon policy %s version %s)', v_label, p_horizon, rule ->> 'unsupported', pol.risk_class, pol.version); v_class := 'horizon';
    ELSE
      krule := rule -> 'kinds' -> v_kind;
      IF krule IS NULL THEN
        v_refusal := format('forecast rejected (horizon): a %s forecast of %s at %s is unsupported — horizon policy %s version %s allows %s at %s', v_kind, v_label, p_horizon, pol.risk_class, pol.version,
                            (SELECT string_agg(k, ', ' ORDER BY k) FROM jsonb_object_keys(rule -> 'kinds') k), p_horizon);
        v_class := 'horizon';
      ELSE
        v_families := ARRAY(SELECT jsonb_array_elements_text(rule -> 'allowed_families'));
        v_lang := krule ->> 'confidence_language';
        v_req := coalesce((krule #>> '{validation,required}')::boolean, false);
        IF v_req THEN
          v_vkind := krule #>> '{validation,kind}'; v_min := (krule #>> '{validation,min_origins}')::int;
          v_modes := ARRAY(SELECT jsonb_array_elements_text(krule #> '{validation,modes}'));
        END IF;
      END IF;
    END IF;
  END IF;

  IF v_refusal IS NULL THEN
    FOR m IN SELECT e.* FROM prediction.effective_forecast_methods(p_tenant, p_domain) e
              WHERE v_kind = ANY (e.forecast_kinds) AND p_horizon = ANY (e.horizons) AND e.family = ANY (v_families)
              ORDER BY array_position(v_families, e.family), e.method_key, e.version DESC LOOP
      v_avail := m.state = 'approved'; v_reason := NULL; v_val := NULL;
      IF m.state <> 'approved' THEN
        v_reason := m.state || coalesce(': ' || m.state_reason, ''); v_only_validation := false;
      ELSIF EXISTS (SELECT 1 FROM prediction.effective_forecast_methods(p_tenant, p_domain) h WHERE h.method_key = m.method_key AND h.version > m.version AND h.state = 'approved') THEN
        v_avail := false; v_reason := 'superseded by a later approved version of ' || m.method_key; v_only_validation := false;
      ELSE
        -- the latest PASSED validation that applies (this method, series, horizon and kind; known by the cut-off; history ending by it) — the
        -- policy's minimum and modes when it requires one, any otherwise (a validation earned is claimed even where none is required)
        SELECT * INTO v_found FROM prediction.method_validations x
         WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.method_ref = m.method_ref AND x.series_key = v_series AND x.horizon_code = p_horizon
           AND x.kind = coalesce(v_vkind, CASE v_kind WHEN 'event' THEN 'event_backtest' ELSE 'quantity_rolling_origin' END)
           AND (NOT v_req OR (x.mode = ANY (v_modes) AND x.origins >= v_min)) AND x.passed AND x.known_at <= p_known_at AND x.window_to <= coalesce(p_cutoff, p_known_at::date)
         ORDER BY x.computed_at DESC LIMIT 1;
        IF FOUND THEN
          v_val := jsonb_build_object('required', v_req, 'validation_id', v_found.validation_id, 'backtest_id', v_found.backtest_id, 'mode', v_found.mode, 'origins', v_found.origins,
                                      'passed', true, 'synthetic', v_found.synthetic, 'verdict', v_found.verdict, 'window_from', v_found.window_from, 'window_to', v_found.window_to);
        ELSIF v_req THEN
          SELECT * INTO v_last FROM prediction.method_validations x
           WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.method_ref = m.method_ref AND x.series_key = v_series AND x.horizon_code = p_horizon AND x.kind = v_vkind
           ORDER BY x.computed_at DESC LIMIT 1;
          v_avail := false;
          v_reason := format('no passed %s validation of %s at %s with at least %s origins (%s) on %s, known by %s on history ending by %s', replace(v_vkind, '_', '-'), m.method_ref, p_horizon, v_min,
                             array_to_string(v_modes, ' or '), v_series, to_char(p_known_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), coalesce(p_cutoff, p_known_at::date))
                      || CASE WHEN v_last.validation_id IS NULL THEN '' ELSE format(' (the latest, recorded %s on history to %s, did not apply or pass: %s)', to_char(v_last.computed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), v_last.window_to, v_last.verdict) END;
          v_missing := v_missing || v_reason;
        END IF;
      END IF;
      IF v_avail THEN v_any_avail := true; END IF;
      v_methods := v_methods || jsonb_build_object('method_ref', m.method_ref, 'method_key', m.method_key, 'version', m.version, 'family', m.family, 'forecast_kind', v_kind,
        'available', v_avail, 'unavailable_reason', v_reason, 'builtin', m.builtin, 'implementation_ref', m.implementation_ref, 'implementation_digest', m.implementation_digest,
        'parameters', m.parameters, 'declarations', m.declarations, 'validation', coalesce(v_val, jsonb_build_object('required', v_req)), 'confidence_language', v_lang);
    END LOOP;
    IF jsonb_array_length(v_methods) = 0 THEN
      v_refusal := format('forecast rejected (no_method): no method of an allowed family (%s) serves a %s forecast of %s at %s in this domain''s registry', array_to_string(v_families, ', '), v_kind, v_label, p_horizon);
      v_class := 'no_method';
    ELSIF NOT v_any_avail THEN
      IF v_req AND cardinality(v_missing) > 0 THEN
        v_refusal := format('forecast rejected (horizon): %s at %s is unsupported — %s', v_label, p_horizon, array_to_string(v_missing, '; ')); v_class := 'horizon';
      ELSE
        v_refusal := format('forecast rejected (unavailable): every method planned for %s at %s is unavailable — %s', v_label, p_horizon,
                            (SELECT string_agg((x ->> 'method_ref') || ' ' || (x ->> 'unavailable_reason'), '; ') FROM jsonb_array_elements(v_methods) x)); v_class := 'unavailable';
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object('target_key', p_target_key, 'target', v_target, 'series_key', v_series, 'forecast_kind', v_kind, 'horizon', p_horizon,
    'policy', CASE WHEN v_has_pol THEN jsonb_build_object('policy_id', pol.policy_id, 'version', pol.version, 'risk_class', pol.risk_class, 'rule', rule, 'kind_rule', krule) ELSE
                   jsonb_build_object('policy_id', NULL, 'version', NULL, 'risk_class', v_risk, 'rule', NULL, 'kind_rule', krule, 'legacy', true) END,
    'confidence_language', v_lang, 'treatment', v_treatment, 'validation_required', v_req, 'methods', v_methods, 'refusal', v_refusal, 'refusal_class', v_class,
    'known_at', p_known_at, 'cutoff', p_cutoff);
END $$;
REVOKE ALL ON FUNCTION prediction.forecast_route_plan(uuid,uuid,text,text,text,timestamptz,date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.forecast_route_plan(uuid,uuid,text,text,text,timestamptz,date) TO eye_app, eye_commit;

/* RECORD THE ROUTE (the routed issue, and §EN's planning through the seam): the plan RECOMPUTED here, the route row, and — on a refusal —
   the governed refusal ledgered: route.refused in the registry ledger and `forecast.horizon_refused` on the would-be forecast's id (the id the
   issue minted; no forecast row exists for it). Answers the plan with the route id. A refusal is ANSWERED, not raised: the caller commits
   the ledger and then refuses the request. */
CREATE OR REPLACE FUNCTION prediction.record_forecast_route(p_route_id uuid, p_tenant uuid, p_domain uuid, p_target_key text, p_series_key text, p_horizon text,
  p_known_at timestamptz, p_cutoff date, p_forecast_id uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_plan jsonb; v_action text;
BEGIN
  v_action := observation.assert_authority(ARRAY['prediction.portfolio.issue', 'prediction.ensemble.issue']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'forecast rejected (actor): a route is requested by the acting principal' USING ERRCODE = '42501'; END IF;
  IF p_forecast_id IS NULL THEN RAISE EXCEPTION 'forecast rejected (request): a route names the forecast id the issue minted' USING ERRCODE = '22023'; END IF;
  v_plan := prediction.forecast_route_plan(p_tenant, p_domain, p_target_key, p_series_key, p_horizon, p_known_at, p_cutoff);
  INSERT INTO prediction.forecast_routes (route_id, scope, tenant_id, domain_id, target_key, series_key, horizon_code, forecast_kind, policy_id, policy_version, outcome, refusal, refusal_class,
    plan, forecast_id, requested_by, requested_action, correlation_id)
  VALUES (p_route_id, 'DOMAIN', p_tenant, p_domain, p_target_key, v_plan ->> 'series_key', p_horizon, v_plan ->> 'forecast_kind', (v_plan #>> '{policy,policy_id}')::uuid,
    (v_plan #>> '{policy,version}')::int, CASE WHEN v_plan ->> 'refusal' IS NULL THEN 'planned' ELSE 'refused' END, v_plan ->> 'refusal', v_plan ->> 'refusal_class', v_plan, p_forecast_id,
    p_actor, v_action, p_correlation);
  IF v_plan ->> 'refusal' IS NULL THEN
    PERFORM prediction.pmr_event(p_tenant, p_domain, 'route', p_route_id, coalesce(p_target_key, v_plan ->> 'series_key') || ' ' || p_horizon, 'route.planned', p_actor,
      jsonb_build_object('methods', (SELECT jsonb_agg(jsonb_build_object('method_ref', x ->> 'method_ref', 'available', x -> 'available')) FROM jsonb_array_elements(v_plan -> 'methods') x),
                         'policy', (v_plan -> 'policy') - 'rule' - 'kind_rule'), p_correlation);
  ELSE
    PERFORM prediction.pmr_event(p_tenant, p_domain, 'route', p_route_id, coalesce(p_target_key, v_plan ->> 'series_key') || ' ' || p_horizon, 'route.refused', p_actor,
      jsonb_build_object('refusal', v_plan ->> 'refusal', 'class', v_plan ->> 'refusal_class'), p_correlation);
    INSERT INTO prediction.forecast_events (event_id, scope, tenant_id, domain_id, forecast_id, event, actor_principal_id, details, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_forecast_id, 'forecast.horizon_refused', p_actor,
      jsonb_build_object('route_id', p_route_id, 'refusal', v_plan ->> 'refusal', 'class', v_plan ->> 'refusal_class', 'target_key', p_target_key, 'series_key', v_plan ->> 'series_key',
                         'horizon', p_horizon, 'forecast_kind', v_plan ->> 'forecast_kind', 'policy', (v_plan -> 'policy') - 'rule' - 'kind_rule', 'issued', false), p_correlation);
  END IF;
  RETURN v_plan || jsonb_build_object('route_id', p_route_id);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.record_forecast_route(uuid,uuid,uuid,text,text,text,timestamptz,date,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.record_forecast_route(uuid,uuid,uuid,text,text,text,timestamptz,date,uuid,uuid,uuid) TO eye_commit;

/* REFUSE A PLANNED ROUTE after planning: the planned method FAILED (the issue quarantined it) or the history refused it (too short, an
   intervention outside it, infeasible constraints) — route.refused in the registry ledger; `forecast.horizon_refused` on the would-be
   forecast's id when the refusal is the horizon's. */
CREATE OR REPLACE FUNCTION prediction.refuse_forecast_route(p_route_id uuid, p_tenant uuid, p_domain uuid, p_refusal text, p_class text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r prediction.forecast_routes%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.portfolio.issue', 'prediction.ensemble.issue']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'forecast rejected (actor): a route is refused by the acting principal' USING ERRCODE = '42501'; END IF;
  IF p_refusal IS NULL OR p_refusal !~ '^forecast rejected \([a-z_]+\): ' OR p_class IS NULL THEN
    RAISE EXCEPTION 'forecast rejected (request): a route''s refusal is a governed refusal text (forecast rejected (<class>): …) with its class' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO r FROM prediction.forecast_routes x WHERE x.route_id = p_route_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'forecast rejected (unknown_route): % is not a route of this domain', p_route_id USING ERRCODE = '23503'; END IF;
  IF r.outcome <> 'planned' THEN RAISE EXCEPTION 'forecast rejected (state): route % is %, not planned', p_route_id, r.outcome USING ERRCODE = '23514'; END IF;
  UPDATE prediction.forecast_routes SET outcome = 'refused', refusal = p_refusal, refusal_class = p_class WHERE route_id = r.route_id RETURNING * INTO r;
  PERFORM prediction.pmr_event(p_tenant, p_domain, 'route', r.route_id, coalesce(r.target_key, r.series_key) || ' ' || r.horizon_code, 'route.refused', p_actor,
    jsonb_build_object('refusal', p_refusal, 'class', p_class, 'after_planning', true), p_correlation);
  IF p_class = 'horizon' THEN
    INSERT INTO prediction.forecast_events (event_id, scope, tenant_id, domain_id, forecast_id, event, actor_principal_id, details, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, r.forecast_id, 'forecast.horizon_refused', p_actor,
      jsonb_build_object('route_id', r.route_id, 'refusal', p_refusal, 'class', p_class, 'target_key', r.target_key, 'series_key', r.series_key, 'horizon', r.horizon_code, 'issued', false), p_correlation);
  END IF;
  RETURN to_jsonb(r) - 'tenant_id' - 'domain_id' - 'scope' - 'correlation_id';
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.refuse_forecast_route(uuid,uuid,uuid,text,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.refuse_forecast_route(uuid,uuid,uuid,text,text,uuid,uuid) TO eye_commit;

/* BIND THE ROUTE to the forecast it issued: the forecast exists, is the route's minted id and names an AVAILABLE method of the plan;
   route.issued in the registry ledger and `forecast.routed` on the forecast (the policy, the method chosen, the plan's other methods). */
CREATE OR REPLACE FUNCTION prediction.bind_forecast_route(p_route_id uuid, p_tenant uuid, p_domain uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r prediction.forecast_routes%ROWTYPE; f record;
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.portfolio.issue', 'prediction.ensemble.issue']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'forecast rejected (actor): a route is bound by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO r FROM prediction.forecast_routes x WHERE x.route_id = p_route_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'forecast rejected (unknown_route): % is not a route of this domain', p_route_id USING ERRCODE = '23503'; END IF;
  IF r.outcome <> 'planned' THEN RAISE EXCEPTION 'forecast rejected (state): route % is %, not planned', p_route_id, r.outcome USING ERRCODE = '23514'; END IF;
  SELECT x.forecast_id, x.method_ref, x.horizon_code, x.forecast_kind, x.validation_state INTO f FROM prediction.forecasts_current x WHERE x.forecast_id = r.forecast_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'forecast rejected (unknown_forecast): route % names forecast %, which was not issued', p_route_id, r.forecast_id USING ERRCODE = '23503'; END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(r.plan -> 'methods') x WHERE x ->> 'method_ref' = f.method_ref AND (x ->> 'available')::boolean) THEN
    RAISE EXCEPTION 'forecast rejected (method): forecast % names %, which the route''s plan did not make available', r.forecast_id, coalesce(f.method_ref, '<no method_ref>') USING ERRCODE = '23514';
  END IF;
  UPDATE prediction.forecast_routes SET outcome = 'issued', method_ref = f.method_ref, issued_at = clock_timestamp() WHERE route_id = r.route_id RETURNING * INTO r;
  PERFORM prediction.pmr_event(p_tenant, p_domain, 'route', r.route_id, coalesce(r.target_key, r.series_key) || ' ' || r.horizon_code, 'route.issued', p_actor,
    jsonb_build_object('forecast_id', r.forecast_id, 'method_ref', f.method_ref), p_correlation);
  INSERT INTO prediction.forecast_events (event_id, scope, tenant_id, domain_id, forecast_id, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, r.forecast_id, 'forecast.routed', p_actor,
    jsonb_build_object('route_id', r.route_id, 'method_ref', f.method_ref, 'forecast_kind', f.forecast_kind, 'validation_state', f.validation_state, 'confidence_language', r.plan ->> 'confidence_language',
                       'policy', (r.plan -> 'policy') - 'rule' - 'kind_rule',
                       'planned', (SELECT jsonb_agg(jsonb_build_object('method_ref', x ->> 'method_ref', 'family', x ->> 'family', 'available', x -> 'available', 'reason', x -> 'unavailable_reason')) FROM jsonb_array_elements(r.plan -> 'methods') x)),
    p_correlation);
  RETURN to_jsonb(r) - 'tenant_id' - 'domain_id' - 'scope' - 'correlation_id';
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.bind_forecast_route(uuid,uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.bind_forecast_route(uuid,uuid,uuid,uuid,uuid) TO eye_commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §MR.6 ENFORCEMENT ON THE FORECAST ROW (default-off: a forecast naming no method_ref is the legacy path, untouched)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION prediction.pmr_fct_routed() RETURNS trigger
SECURITY DEFINER SET search_path = prediction, public, pg_catalog, pg_temp AS $$
DECLARE m record; pol prediction.horizon_policies%ROWTYPE; rule jsonb; krule jsonb;
BEGIN
  IF NEW.validation_state = 'scenario_language' AND NEW.forecast_kind NOT IN ('state', 'regime') THEN
    RAISE EXCEPTION 'forecast rejected (validation): scenario language is a state or regime forecast''s; a % forecast states a distribution or a probability with its validation', NEW.forecast_kind USING ERRCODE = '23514';
  END IF;
  IF NEW.method_ref IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO m FROM prediction.effective_forecast_methods(NEW.tenant_id, NEW.domain_id) e WHERE e.method_ref = NEW.method_ref;
  IF NOT FOUND THEN RAISE EXCEPTION 'forecast rejected (method): % is not a method of this domain''s registry', NEW.method_ref USING ERRCODE = '23514'; END IF;
  IF m.state <> 'approved' THEN RAISE EXCEPTION 'forecast rejected (method): % is %, not approved', NEW.method_ref, m.state USING ERRCODE = '23514'; END IF;
  IF NOT (NEW.forecast_kind = ANY (m.forecast_kinds)) OR NOT (NEW.horizon_code = ANY (m.horizons)) THEN
    RAISE EXCEPTION 'forecast rejected (method): % does not issue a % forecast at %', NEW.method_ref, NEW.forecast_kind, NEW.horizon_code USING ERRCODE = '23514';
  END IF;
  IF NEW.horizon_policy IS NOT NULL AND (NEW.horizon_policy ->> 'policy_id') IS NOT NULL THEN
    SELECT * INTO pol FROM prediction.horizon_policies x WHERE x.policy_id = (NEW.horizon_policy ->> 'policy_id')::uuid AND x.tenant_id = NEW.tenant_id AND x.domain_id = NEW.domain_id;
    IF NOT FOUND OR pol.state <> 'active' THEN
      RAISE EXCEPTION 'forecast rejected (stale): horizon policy % is not the domain''s active policy', NEW.horizon_policy ->> 'policy_id' USING ERRCODE = '23514';
    END IF;
    rule := pol.rules -> NEW.horizon_code; krule := rule -> 'kinds' -> NEW.forecast_kind;
    IF rule IS NULL OR rule ? 'unsupported' OR krule IS NULL THEN
      RAISE EXCEPTION 'forecast rejected (horizon): a % forecast at % is unsupported under horizon policy % version %', NEW.forecast_kind, NEW.horizon_code, pol.risk_class, pol.version USING ERRCODE = '23514';
    END IF;
    IF NOT ((rule -> 'allowed_families') ? m.family) THEN
      RAISE EXCEPTION 'forecast rejected (horizon): the % family is not allowed at % by horizon policy % version %', m.family, NEW.horizon_code, pol.risk_class, pol.version USING ERRCODE = '23514';
    END IF;
    IF krule ->> 'confidence_language' = 'scenario_language' AND NEW.validation_state <> 'scenario_language' THEN
      RAISE EXCEPTION 'forecast rejected (validation): horizon policy % version % speaks scenario language for a % at %; the forecast claims %', pol.risk_class, pol.version, NEW.forecast_kind, NEW.horizon_code, NEW.validation_state USING ERRCODE = '23514';
    END IF;
    IF coalesce((krule #>> '{validation,required}')::boolean, false) AND (NEW.validation_state NOT IN ('validated', 'validated_retrospective') OR NEW.backtest_id IS NULL OR NOT EXISTS (
         SELECT 1 FROM prediction.method_validations v WHERE v.backtest_id = NEW.backtest_id AND v.tenant_id = NEW.tenant_id AND v.domain_id = NEW.domain_id AND v.passed
            AND v.method_ref = NEW.method_ref AND v.series_key = NEW.series_key AND v.horizon_code = NEW.horizon_code AND v.kind = krule #>> '{validation,kind}'
            AND v.origins >= (krule #>> '{validation,min_origins}')::int AND v.mode IN (SELECT jsonb_array_elements_text(krule #> '{validation,modes}')))) THEN
      RAISE EXCEPTION 'forecast rejected (horizon): a % forecast at % requires a passed % validation (horizon policy % version %); % names none', NEW.forecast_kind, NEW.horizon_code,
        replace(krule #>> '{validation,kind}', '_', '-'), pol.risk_class, pol.version, NEW.method_ref USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.pmr_fct_routed() FROM PUBLIC;
CREATE TRIGGER pmr_fct_routed BEFORE INSERT ON prediction.forecasts_current FOR EACH ROW EXECUTE FUNCTION prediction.pmr_fct_routed();
