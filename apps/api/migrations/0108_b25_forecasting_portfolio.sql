-- 0108 — CP-6 B25 (2026-10-06): FORECASTING PORTFOLIO I — grounded context, multi-method horizons, ensembles (F-P4-01, F-P4-02, F-P4-03;
-- the carried F-P5-03 forecast-provenance ENVIRONMENT, V03-T-196). This file is built as a PRELUDE (§0, the integrator) and three parts folded
-- in apply order: §CX context, information set, replay, environment (F-P4-03) · §MR the governed model registry, routing, horizon policy,
-- the method families, event/state/regime forecasts (F-P4-01) · §EN ensembles, disagreement, model-path availability, the judgement overlay
-- (F-P4-02). 0001–0107 are applied and frozen and untouched.

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §0 PRELUDE — the shared seams (the integrator, before the parts)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §0.1 The forecast row gains B25's columns (all additive; every earlier forecast reads as a single quantity forecast):
--   forecast_kind (quantity | event | state | regime), target_key (§MR's governed target), method_ref (§MR's registry key@version),
--   ensemble_id / ensemble_role (§EN: a member names its ensemble; an ensemble names itself), information_set_id (§CX's frozen manifest),
--   environment_digest / environment (§CX; V03-T-196), horizon_policy (§MR's policy version applied), outcome_spec (an event's definition,
--   a state/regime's categories).
ALTER TABLE prediction.forecasts_current
  ADD COLUMN forecast_kind text NOT NULL DEFAULT 'quantity' CHECK (forecast_kind IN ('quantity', 'event', 'state', 'regime')),
  ADD COLUMN target_key text,
  ADD COLUMN method_ref text,
  ADD COLUMN ensemble_id uuid,
  ADD COLUMN ensemble_role text CHECK (ensemble_role IS NULL OR ensemble_role IN ('member', 'ensemble')),
  ADD COLUMN information_set_id uuid,
  ADD COLUMN environment_digest text CHECK (environment_digest IS NULL OR environment_digest ~ '^[0-9a-f]{64}$'),
  ADD COLUMN environment jsonb CHECK (environment IS NULL OR jsonb_typeof(environment) = 'object'),
  ADD COLUMN horizon_policy jsonb CHECK (horizon_policy IS NULL OR jsonb_typeof(horizon_policy) = 'object'),
  ADD COLUMN outcome_spec jsonb CHECK (outcome_spec IS NULL OR jsonb_typeof(outcome_spec) = 'object'),
  ADD CONSTRAINT fct_ensemble_named CHECK ((ensemble_role IS NULL) = (ensemble_id IS NULL)),
  ADD CONSTRAINT fct_ensemble_self CHECK (ensemble_role IS DISTINCT FROM 'ensemble' OR ensemble_id = forecast_id),
  ADD CONSTRAINT fct_environment_pair CHECK ((environment IS NULL) = (environment_digest IS NULL));
CREATE INDEX fct_ensemble ON prediction.forecasts_current (ensemble_id) WHERE ensemble_id IS NOT NULL;
CREATE INDEX fct_information_set ON prediction.forecasts_current (information_set_id) WHERE information_set_id IS NOT NULL;

-- §0.2 The quantiles are ordered for a QUANTITY or an EVENT forecast (an event's are a probability's credible band); a STATE or REGIME
-- forecast carries category probabilities in its payload and an empty quantile object.
ALTER TABLE prediction.forecasts_current DROP CONSTRAINT fct_quantiles_ordered;
ALTER TABLE prediction.forecasts_current ADD CONSTRAINT fct_quantiles_ordered CHECK (
  forecast_kind IN ('state', 'regime')
  OR ((quantiles ->> 'q10')::numeric <= (quantiles ->> 'q50')::numeric AND (quantiles ->> 'q50')::numeric <= (quantiles ->> 'q90')::numeric));

-- §0.3 The validation vocabulary gains `scenario_language`: a forecast that speaks in regime / scenario language at a long horizon and
-- CLAIMS NO EMPIRICAL VALIDATION (V00-T-051's 5y treatment) — never presented as validated.
ALTER TABLE prediction.forecasts_current DROP CONSTRAINT forecasts_current_validation_state_check;
ALTER TABLE prediction.forecasts_current ADD CONSTRAINT forecasts_current_validation_state_check CHECK (validation_state IN (
  'unvalidated', 'validated', 'validated_retrospective', 'validation_impossible', 'scenario_language'));

-- §0.4 The forecast event vocabulary, widened ONCE for the three parts.
ALTER TABLE prediction.forecast_events DROP CONSTRAINT forecast_events_event_check;
ALTER TABLE prediction.forecast_events ADD CONSTRAINT forecast_events_event_check CHECK (event IN (
  'forecast.issued', 'forecast.superseded', 'forecast.resolved', 'forecast.withdrawn', 'forecast.attention', 'forecast.fitness_assessed',
  'forecast.information_set_frozen', 'forecast.replayed',                                  -- §CX
  'forecast.horizon_refused', 'forecast.routed',                                           -- §MR
  'forecast.ensembled', 'forecast.member_excluded', 'forecast.overlay_added', 'forecast.overlay_withdrawn'));   -- §EN

-- §0.4b THE ATTENTION CLASS `forecast.disagreement` (§EN's escalation of a material disagreement or a failed ensemble to the forecast owner,
-- routed under the published attention policy) and the subject kind `ensemble_run` (a failed run with no ensemble forecast). The lists of
-- 0105 §0.2, whole, plus B25's.
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
  'decision.recommendation', 'decision.appeal', 'decision.reversion', 'decision.review_due',
  -- B30 (0103)
  'twin.reconciliation', 'twin.freshness', 'twin.envelope', 'twin.observation_request', 'simulation.checkpoint',
  -- B91 (0105)
  'commercial.usage', 'commercial.entitlement',
  -- B25 (0108)
  'forecast.disagreement'] $$;
ALTER TABLE executive.attention_items DROP CONSTRAINT IF EXISTS attention_items_signal_class_check;
ALTER TABLE executive.attention_items ADD CONSTRAINT attention_items_signal_class_check CHECK (signal_class IN (
  'forecast.unfit', 'scenario.incoherent', 'warning.raised', 'source.coverage_loss', 'proposal.review', 'decision.material_change', 'review.convened',
  'opportunity.raised', 'health.change', 'commitment.due', 'commitment.breach',
  'plan.variance', 'publication.correction', 'strategy.detection', 'queue.governance',
  'product.degradation', 'subscription.lag', 'metric.certification', 'catalog.coverage',
  'scenario.suspension', 'scenario.set_gap', 'scenario.quality', 'scenario.signpost', 'scenario.proposal',
  'simulation.budget', 'simulation.experiment', 'simulation.validity', 'simulation.value_of_information',
  'decision.recommendation', 'decision.appeal', 'decision.reversion', 'decision.review_due',
  'twin.reconciliation', 'twin.freshness', 'twin.envelope', 'twin.observation_request', 'simulation.checkpoint',
  'commercial.usage', 'commercial.entitlement',
  'forecast.disagreement'));
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
  'recommendation', 'appeal_case', 'outcome_assessment',
  -- B30 (0103)
  'twin', 'twin_version', 'twin_estimate', 'twin_branch', 'behaviour_model',
  -- B91 (0105)
  'meter', 'budget', 'entitlement', 'contract',
  -- B25 (0108)
  'ensemble_run'));

-- §0.5 FCT v2: v1's fields plus what forecasts already carry (controls; the validation states in use) and B25's optional sections.
INSERT INTO objects.schema_registry (object_type, schema_version, json_schema, compatibility) VALUES
('FCT', 'v2', $fct${"type": "object", "$schema": "https://json-schema.org/draft/2020-12/schema", "required": ["series_key", "horizon", "origin_at", "known_at", "target_at", "method", "baseline_method", "distribution", "drivers", "assumptions", "evidence", "validation", "label", "statement"], "properties": {"label": {"enum": ["replay demonstration", "live"]}, "method": {"type": "object", "required": ["name", "version"], "properties": {"name": {"type": "string"}, "version": {"type": "string"}, "parameters": {"type": "object"}}}, "drivers": {"type": "array", "items": {"type": "object", "required": ["series_key", "role", "evidence_object_id"], "properties": {"role": {"type": "string"}, "share": {"type": ["number", "null"]}, "series_key": {"type": "string"}, "attribution": {"type": ["string", "null"]}, "evidence_digest": {"type": "string"}, "evidence_version": {"type": "integer"}, "evidence_object_id": {"type": "string"}}}, "minItems": 1}, "horizon": {"type": "object", "required": ["code", "days"], "properties": {"code": {"enum": ["30d", "90d", "180d", "1y", "3y", "5y"]}, "days": {"type": "integer", "minimum": 1}}}, "evidence": {"type": "array", "items": {"type": "object", "required": ["evidence_object_id", "evidence_version", "evidence_digest"]}, "minItems": 1}, "known_at": {"type": "string"}, "narrative": {"type": ["object", "null"]}, "origin_at": {"type": "string"}, "statement": {"type": "string", "minLength": 8}, "target_at": {"type": "string"}, "series_key": {"type": "string", "minLength": 2}, "validation": {"type": "object", "required": ["state", "note"], "properties": {"note": {"type": "string"}, "skill": {"type": ["object", "null"]}, "state": {"enum": ["unvalidated", "validated", "validated_retrospective", "validation_impossible", "scenario_language"]}, "backtest_id": {"type": ["string", "null"]}}}, "assumptions": {"type": "array", "items": {"type": "string"}, "minItems": 1}, "distribution": {"type": "object", "required": [], "properties": {"q10": {"type": "number"}, "q50": {"type": "number"}, "q90": {"type": "number"}, "path": {"type": "array"}, "unit": {"type": "string"}, "categories": {"type": "array"}}}, "baseline_method": {"type": "string"}, "refresh_cadence": {"type": "string"}, "subject_entity_id": {"type": ["string", "null"]}, "controls": {"type": "object"}, "forecast_kind": {"enum": ["quantity", "event", "state", "regime"]}, "target_key": {"type": ["string", "null"]}, "method_ref": {"type": ["string", "null"]}, "horizon_policy": {"type": ["object", "null"]}, "outcome": {"type": ["object", "null"]}, "ensemble": {"type": ["object", "null"]}, "information_set": {"type": ["object", "null"]}, "environment": {"type": ["object", "null"]}, "disagreement": {"type": ["object", "null"]}, "excluded_models": {"type": ["array", "null"]}}, "additionalProperties": false}$fct$::jsonb, 'backward')
ON CONFLICT DO NOTHING;

-- §0.6 prediction.issue_forecast re-declared (copied whole from its last declaration, 0030; the changes marked `-- 0108 §0`): the trailing
-- p_extras writes §0.1's columns, the issued event carries them, and SUPERSESSION follows the lineage (an ensemble's members coexist).
-- The parts never re-declare it; each validates its own references in its own section (a trigger or a port).
DROP FUNCTION IF EXISTS prediction.issue_forecast(uuid,uuid,uuid,text,uuid,text,int,date,timestamptz,date,text,text,text,jsonb,jsonb,jsonb,uuid[],jsonb,text,text,text,text,jsonb,text,uuid,jsonb,uuid,uuid,uuid);
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
  PERFORM observation.assert_authority(ARRAY['prediction.forecast.issue', 'prediction.portfolio.issue', 'prediction.ensemble.issue']);   -- 0108 §0: §MR's routed issue and §EN's ensemble issue through this one port
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
-- §CX — CONTEXT: the feature and context assembler, the frozen information set, replay, the forecast environment (F-P4-03; V03-T-196)
-- (built as the part `context` on its own worktree; folded here in apply order §CX, §MR, §EN)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0108 §CX — CP-6 B25 part `context` (2026-10-06): GROUNDED CONTEXT, THE FROZEN INFORMATION SET, REPLAY, THE ENVIRONMENT
-- (F-P4-03: V00-T-009, L6-C02, V03-T-319, AI-48-002, V03-T-127's lineage; the carried F-P5-03 environment, V03-T-196).
-- A part file: folded by the integrator into 0108 after §0 (apply order §CX, §MR, §EN). Forward only; the prelude's objects are used,
-- never re-declared (prediction.issue_forecast stays §0's). Every object here carries the part's prefix (`pcx_`) or is named in MAP §CX.
--
--   §CX.1 the tables: prediction.information_sets (the frozen manifest; append-only — frozen once, never edited),
--         prediction.information_set_events (the set's ledger), prediction.forecast_replays (the replay ledger; REPRODUCED | DIVERGED)
--   §CX.2 prediction.pcx_ts (the canonical instant text a manifest digests) and prediction.pcx_grounding_context — the ASSEMBLER's
--         read (INVOKER, STABLE: the caller's row security does the scoping): the series' evidence versions known at the cut-off, the
--         subject's graph context AS OF the cut-off (both time axes), the twin snapshot served at the cut-off (or EXACTLY the pinned
--         version on a replay), the assumptions as of the cut-off, the policy versions in force, and the DB-level coverage gaps
--   §CX.3 the port prediction.freeze_information_set (prediction.information_set.freeze, and the issuing actions that freeze through
--         the CONTEXT_FREEZER seam inside their own transaction)
--   §CX.4 the pin: trigger pcx_fct_information_set on forecasts_current (BEFORE INSERT / UPDATE OF information_set_id) — a non-null
--         information_set_id names a frozen set of the same tenant/domain whose request matches the forecast (series, subject, known_at)
--         and whose evidence contains every evidence version the forecast cites; a pin never changes. pcx_fct_information_set_pinned
--         (AFTER INSERT, only when a set is named) ledgers forecast.information_set_frozen. DEFAULT-OFF: a forecast naming no set (every
--         existing caller) passes untouched and writes nothing more.
--   §CX.5 the port prediction.record_forecast_replay (prediction.forecast.replay): the outcome is DERIVED here from the digests the
--         replay recomputed (REPRODUCED only when the manifest and the output digests both equal the original's and nothing diverged)
--   §CX.6 row security and grants (the 0081 loop idiom: prediction_isolation; SELECT to eye_app, eye_commit; no UPDATE/DELETE grant)
--
-- Refusal family (CLASS form, anchored in observation-errors.ts' /* B25 context */ block): `information set rejected (<class>)` and
-- `forecast replay rejected (<class>)` — actor → 403; unknown_* → 404; state, stale, duplicate → 409; contract, mismatch, incomplete,
-- ungrounded → 422.

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §CX.1 the tables
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
/* THE FROZEN INFORMATION SET (V03-T-319, AI-48-002): what a forecast could know at its cut-off, pinned. The request (series, subject,
   target, known_at, observed_through, assumptions), the evidence versions known then, the graph context as of then and the revision head
   at the freeze, the twin snapshot served then, the features assembled from them (each with its source and digest), the assumptions with
   their versions, the policy versions in force, the named coverage gaps, and the digest of the canonical manifest (sha-256 of its JCS
   form, computed by assembler@N). Frozen once: the row is append-only (no draft state exists). */
CREATE TABLE prediction.information_sets (
  information_set_id uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  series_key         text NOT NULL,
  subject_entity_id  uuid,
  target_key         text,
  known_at           timestamptz NOT NULL,
  observed_through   date,
  request            jsonb NOT NULL CHECK (jsonb_typeof(request) = 'object'),
  evidence           jsonb NOT NULL CHECK (jsonb_typeof(evidence) = 'array' AND jsonb_array_length(evidence) >= 1),
  graph              jsonb NOT NULL CHECK (jsonb_typeof(graph) = 'object'),
  twin               jsonb CHECK (twin IS NULL OR jsonb_typeof(twin) = 'object'),
  features           jsonb NOT NULL CHECK (jsonb_typeof(features) = 'array'),
  assumptions        jsonb NOT NULL CHECK (jsonb_typeof(assumptions) = 'array'),
  policy             jsonb NOT NULL CHECK (jsonb_typeof(policy) = 'object'),
  coverage_gaps      jsonb NOT NULL CHECK (jsonb_typeof(coverage_gaps) = 'array'),
  manifest           jsonb NOT NULL CHECK (jsonb_typeof(manifest) = 'object'),
  manifest_digest    text NOT NULL CHECK (manifest_digest ~ '^[0-9a-f]{64}$'),
  assembler_version  text NOT NULL CHECK (assembler_version ~ '^assembler@[0-9]+$'),
  revision_head      bigint NOT NULL CHECK (revision_head >= 0),
  twin_id            uuid,
  twin_version       int,
  state              text NOT NULL DEFAULT 'frozen' CHECK (state = 'frozen'),
  frozen_via         text NOT NULL CHECK (frozen_via LIKE 'prediction.%'),
  frozen_by          uuid NOT NULL,
  frozen_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT pcx_is_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT pcx_is_twin_pair CHECK ((twin_id IS NULL) = (twin_version IS NULL) AND (twin_id IS NULL) = (twin IS NULL)),
  CONSTRAINT pcx_is_cutoffs CHECK (observed_through IS NULL OR observed_through <= (known_at AT TIME ZONE 'UTC')::date),
  CONSTRAINT pcx_is_frozen_after_cutoff CHECK (frozen_at >= known_at)
);
CREATE INDEX pcx_is_series ON prediction.information_sets (tenant_id, domain_id, series_key, frozen_at DESC);
CREATE INDEX pcx_is_digest ON prediction.information_sets (manifest_digest);
CREATE TRIGGER pcx_is_append_only BEFORE UPDATE OR DELETE ON prediction.information_sets FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE prediction.information_sets IS 'B25 §CX (0108; V03-T-319, AI-48-002, L6-C02): the FROZEN information set of a forecast — the request, the evidence versions known at the cut-off, the graph context as of the cut-off and the domain''s revision head at the freeze, the twin snapshot served at the cut-off, the assembled features (key, source, digest, scalar value), the assumptions with their versions, the policy versions in force, the named coverage gaps and the sha-256 of the canonical (JCS) manifest under assembler@N. Append-only: frozen once, never edited. A forecast pins one through information_set_id (trigger pcx_fct_information_set).';

CREATE TABLE prediction.information_set_events (
  event_id           uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  information_set_id uuid NOT NULL REFERENCES prediction.information_sets (information_set_id),
  event              text NOT NULL CHECK (event IN ('information_set.frozen', 'information_set.pinned', 'information_set.replayed')),
  forecast_id        uuid,
  occurred_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  actor_principal_id uuid NOT NULL,
  details            jsonb NOT NULL DEFAULT '{}'::jsonb,
  correlation_id     uuid NOT NULL,
  CONSTRAINT pcx_ise_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT pcx_ise_forecast_named CHECK (event = 'information_set.frozen' OR forecast_id IS NOT NULL)
);
CREATE INDEX pcx_ise_set ON prediction.information_set_events (information_set_id, occurred_at);
CREATE TRIGGER pcx_ise_append_only BEFORE UPDATE OR DELETE ON prediction.information_set_events FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

/* THE REPLAY LEDGER (F-P4-03 "replay of the frozen set"): one row per replay — the original and the replayed manifest digests, output
   digests and environment digests, what diverged (named), the FRESH grounding beside it (what a grounding at the replay's instant would
   pin — reported, never substituted), and the outcome the port derived. */
CREATE TABLE prediction.forecast_replays (
  replay_id                    uuid PRIMARY KEY,
  scope                        text NOT NULL,
  tenant_id                    uuid NOT NULL,
  domain_id                    uuid NOT NULL,
  forecast_id                  uuid NOT NULL,
  information_set_id           uuid NOT NULL REFERENCES prediction.information_sets (information_set_id),
  outcome                      text NOT NULL CHECK (outcome IN ('REPRODUCED', 'DIVERGED')),
  original_manifest_digest     text NOT NULL CHECK (original_manifest_digest ~ '^[0-9a-f]{64}$'),
  replayed_manifest_digest     text NOT NULL CHECK (replayed_manifest_digest ~ '^[0-9a-f]{64}$'),
  original_output_digest       text NOT NULL CHECK (original_output_digest ~ '^[0-9a-f]{64}$'),
  replayed_output_digest       text CHECK (replayed_output_digest IS NULL OR replayed_output_digest ~ '^[0-9a-f]{64}$'),
  original_environment_digest  text CHECK (original_environment_digest IS NULL OR original_environment_digest ~ '^[0-9a-f]{64}$'),
  replayed_environment_digest  text CHECK (replayed_environment_digest IS NULL OR replayed_environment_digest ~ '^[0-9a-f]{64}$'),
  environment_match            boolean NOT NULL,
  diverged                     jsonb NOT NULL CHECK (jsonb_typeof(diverged) = 'array'),
  fresh                        jsonb CHECK (fresh IS NULL OR jsonb_typeof(fresh) = 'object'),
  detail                       jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(detail) = 'object'),
  replayed_by                  uuid NOT NULL,
  replayed_at                  timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id               uuid NOT NULL,
  CONSTRAINT pcx_rpl_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT pcx_rpl_outcome_bound CHECK ((outcome = 'REPRODUCED') = (replayed_manifest_digest = original_manifest_digest
                                          AND replayed_output_digest IS NOT DISTINCT FROM original_output_digest AND jsonb_array_length(diverged) = 0))
);
CREATE INDEX pcx_rpl_forecast ON prediction.forecast_replays (forecast_id, replayed_at DESC);
CREATE TRIGGER pcx_rpl_append_only BEFORE UPDATE OR DELETE ON prediction.forecast_replays FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE prediction.forecast_replays IS 'B25 §CX (0108; F-P4-03): the replay of a grounded forecast from its frozen information set — the pinned evidence versions re-read, the graph re-read as of the pinned cut-off, the pinned twin version re-read, the features re-assembled, the method re-run; REPRODUCED only when the manifest and output digests equal the original''s; DIVERGED names what diverged. The environments are compared and reported (environment_match), never hidden; the fresh grounding at the replay''s instant is reported beside it.';

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §CX.2 the assembler's read
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
/* The canonical text of an instant inside a manifest: UTC, microseconds, `Z` — one spelling, whatever the session's time zone. */
CREATE OR REPLACE FUNCTION prediction.pcx_ts(p timestamptz) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT CASE WHEN p IS NULL THEN NULL ELSE to_char(p AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') END
$$;
REVOKE ALL ON FUNCTION prediction.pcx_ts(timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.pcx_ts(timestamptz) TO eye_app, eye_commit;

/* THE GROUNDING CONTEXT of a series at a cut-off — the database half of assembler@1 (the TypeScript half shapes the features and digests
   the manifest). INVOKER and STABLE: every table is read under the caller's own row security (no tenant or domain argument to guard — the
   N-01 rule's better form). Both time axes are the cut-off: what was BELIEVED at known_at about what HELD at known_at.
     p_twin   null: resolve the twin of the series' subject (a twin whose boundary names the subject entity) and pin the version it SERVED at
              the cut-off (twin.served_state — the frozen snapshot when one stood, else actual's admitted head); {twin_id, version}: read
              EXACTLY that version (the replay's pin), wherever the twin stands now.
   A graph partition withdrawn under B20 is not read (its rows may be poisoned): the context says so as a coverage gap and carries no edges.
   Policy tables this caller cannot read are coverage gaps, never errors. */
CREATE OR REPLACE FUNCTION prediction.pcx_grounding_context(p_series_key text, p_known_at timestamptz, p_assumptions uuid[], p_twin jsonb)
RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = prediction, graph, twin, objects, observation, simulation, executive, public, pg_catalog, pg_temp AS $$
DECLARE
  s prediction.series_registry%ROWTYPE;
  v_subject jsonb := NULL; v_edges jsonb := '[]'::jsonb; v_events jsonb := '[]'::jsonb; v_neigh uuid[] := ARRAY[]::uuid[];
  v_edge_ids uuid[] := ARRAY[]::uuid[]; v_edge_total int := 0; v_evidence jsonb; v_twin jsonb := NULL; v_gaps jsonb := '[]'::jsonb;
  v_assumptions jsonb := '[]'::jsonb; v_unknown jsonb := '[]'::jsonb; v_policy jsonb := '{}'::jsonb; v_head bigint := 0; v_head_at timestamptz;
  v_withdrawn text[] := ARRAY[]::text[]; v_twin_id uuid; v_twin_ver int; v_mode text := 'pinned'; v_served jsonb; t record; a uuid;
  v_ver bigint; v_state text; v_part jsonb; v_hp regclass;
BEGIN
  SELECT * INTO s FROM prediction.series_registry r WHERE r.series_key = p_series_key;
  IF NOT FOUND THEN RETURN jsonb_build_object('series', NULL); END IF;

  SELECT h.head, h.updated_at INTO v_head, v_head_at FROM graph.revision_heads h WHERE h.tenant_id = s.tenant_id AND h.domain_id = s.domain_id;
  v_head := coalesce(v_head, 0);

  -- THE EVIDENCE known at the cut-off: per evidence object the latest version recorded by then (the series assembly's own rule,
  -- prediction.capabilities evidenceVersionsKnownAt), a withdrawn one excluded; the digest is the BYTES digest the forecast cites.
  SELECT coalesce(jsonb_agg(jsonb_build_object('evidence_object_id', x.object_id, 'evidence_version', x.object_version,
                                               'evidence_digest', x.content_digest, 'recorded_at', prediction.pcx_ts(x.recorded_at))
                            ORDER BY x.object_id, x.object_version), '[]'::jsonb)
    INTO v_evidence
    FROM (SELECT DISTINCT ON (e.object_id) e.object_id::text AS object_id, e.object_version::int AS object_version,
                 e.payload ->> 'content_digest' AS content_digest, e.recorded_at, e.lifecycle_state
            FROM objects.canonical_objects e
           WHERE e.object_type = 'EVD'
             AND EXISTS (SELECT 1 FROM observation.source_contracts_current c
                          WHERE c.source_key = s.source_key AND e.provenance_ref LIKE 'SRC:' || c.source_id::text || '@%')
             AND e.recorded_at <= p_known_at
           ORDER BY e.object_id, e.object_version DESC) x
   WHERE x.lifecycle_state <> 'withdrawn';

  -- B20: a withdrawn partition is not read.
  BEGIN
    SELECT coalesce(array_agg(p.projection ORDER BY p.projection), ARRAY[]::text[]) INTO v_withdrawn
      FROM graph.projection_partitions p
     WHERE p.tenant_id = s.tenant_id AND p.domain_id = s.domain_id AND p.state = 'withdrawn' AND p.projection IN ('entities_current', 'edges_current');
  EXCEPTION WHEN insufficient_privilege THEN
    v_gaps := v_gaps || jsonb_build_array(jsonb_build_object('key', 'graph.partitions', 'required', false, 'reason', 'the graph''s partition state is not readable by this caller; the graph context was read without it'));
  END;

  IF s.subject_entity_id IS NULL THEN
    v_gaps := v_gaps || jsonb_build_array(jsonb_build_object('key', 'graph.subject', 'required', false,
      'reason', 'the series names no subject entity: no graph context and no twin snapshot can be grounded on it'));
  ELSIF 'entities_current' = ANY (v_withdrawn) OR 'edges_current' = ANY (v_withdrawn) THEN
    v_gaps := v_gaps || jsonb_build_array(jsonb_build_object('key', 'graph.context', 'required', false,
      'reason', format('the graph partition(s) %s are WITHDRAWN (B20) at the freeze: the subject''s graph context is not read from a withdrawn projection', array_to_string(v_withdrawn, ', '))));
  ELSE
    SELECT jsonb_build_object('entity_id', e.entity_id, 'entity_type', e.entity_type, 'created_at', prediction.pcx_ts(e.created_at),
             'lifecycle', coalesce((SELECT CASE ev.event WHEN 'entity.superseded' THEN 'superseded' WHEN 'entity.retired' THEN 'retired' ELSE 'active' END
                                      FROM graph.entity_events ev WHERE ev.entity_id = e.entity_id AND ev.occurred_at <= p_known_at
                                       AND ev.event IN ('entity.created', 'entity.superseded', 'entity.retired')
                                     ORDER BY ev.occurred_at DESC, ev.event_id DESC LIMIT 1), 'active'))
      INTO v_subject
      FROM graph.entities_current e WHERE e.entity_id = s.subject_entity_id AND e.created_at <= p_known_at;
    IF v_subject IS NULL THEN
      v_gaps := v_gaps || jsonb_build_array(jsonb_build_object('key', 'graph.subject', 'required', true,
        'reason', format('the series'' subject entity %s is not readable as it stood at %s', s.subject_entity_id, prediction.pcx_ts(p_known_at))));
    ELSE
      -- THE EDGES touching the subject, visible at the cut-off on BOTH axes (the edges service's visibleAt, in SQL); bounded at 2,000.
      WITH vis AS (
        SELECT g.* FROM graph.edges_current g
         WHERE (g.subject_entity_id = s.subject_entity_id OR g.object_entity_id = s.subject_entity_id)
           AND g.asserted_at <= p_known_at AND (g.retracted_at IS NULL OR g.retracted_at > p_known_at)
           AND (g.superseded_at IS NULL OR g.superseded_at > p_known_at)
           AND g.valid_from <= p_known_at AND (g.valid_to IS NULL OR g.valid_to > p_known_at)
         ORDER BY g.edge_id LIMIT 2001)
      SELECT coalesce(jsonb_agg(jsonb_build_object('edge_id', v.edge_id, 'subject_entity_id', v.subject_entity_id, 'predicate', v.predicate,
                                  'object_entity_id', v.object_entity_id, 'valid_from', prediction.pcx_ts(v.valid_from), 'valid_to', prediction.pcx_ts(v.valid_to),
                                  'asserted_at', prediction.pcx_ts(v.asserted_at), 'claim_object_id', v.claim_object_id, 'claim_version', v.claim_version,
                                  'evidence_object_id', v.evidence_object_id, 'evidence_digest', v.evidence_digest, 'confidence', v.confidence)
                                ORDER BY v.edge_id) FILTER (WHERE v.rn <= 2000), '[]'::jsonb),
             coalesce(array_agg(v.edge_id ORDER BY v.edge_id) FILTER (WHERE v.rn <= 2000), ARRAY[]::uuid[]),
             coalesce(array_agg(DISTINCT CASE WHEN v.subject_entity_id = s.subject_entity_id THEN v.object_entity_id ELSE v.subject_entity_id END)
                        FILTER (WHERE v.rn <= 2000), ARRAY[]::uuid[]),
             count(*)
        INTO v_edges, v_edge_ids, v_neigh, v_edge_total
        FROM (SELECT vis.*, row_number() OVER (ORDER BY vis.edge_id) AS rn FROM vis) v;
      IF v_edge_total > 2000 THEN
        v_gaps := v_gaps || jsonb_build_array(jsonb_build_object('key', 'graph.edges', 'required', false,
          'reason', 'more than 2,000 edges touch the subject at the cut-off: the context carries the first 2,000 by id'));
      END IF;
      -- THE EVENTS recorded by the cut-off: the subject's and its neighbours' entity events, and the visible edges' events.
      SELECT coalesce(jsonb_agg(jsonb_build_object('event_id', q.event_id, 'of', q.of, 'id', q.id, 'event', q.event, 'occurred_at', prediction.pcx_ts(q.occurred_at))
                                ORDER BY q.occurred_at, q.event_id), '[]'::jsonb)
        INTO v_events
        FROM (SELECT ev.event_id, 'entity'::text AS of, ev.entity_id AS id, ev.event, ev.occurred_at FROM graph.entity_events ev
               WHERE ev.entity_id = ANY (v_neigh || s.subject_entity_id) AND ev.occurred_at <= p_known_at
              UNION ALL
              SELECT ee.event_id, 'edge', ee.edge_id, ee.event, ee.occurred_at FROM graph.edge_events ee
               WHERE ee.edge_id = ANY (v_edge_ids) AND ee.occurred_at <= p_known_at) q;
    END IF;
  END IF;

  -- THE TWIN SNAPSHOT: the pin (a replay), or the subject's twin as served at the cut-off.
  IF p_twin IS NOT NULL AND jsonb_typeof(p_twin) = 'object' THEN
    v_twin_id := (p_twin ->> 'twin_id')::uuid; v_twin_ver := (p_twin ->> 'version')::int; v_mode := 'pinned';
  ELSIF s.subject_entity_id IS NOT NULL THEN
    FOR t IN SELECT x.twin_id FROM twin.twins_current x WHERE x.boundary @> jsonb_build_array(s.subject_entity_id::text) ORDER BY x.declared_at, x.twin_id LOOP
      v_served := twin.served_state(t.twin_id, p_known_at);
      IF v_served IS NOT NULL AND (v_served ->> 'version') IS NOT NULL THEN
        v_twin_id := t.twin_id; v_twin_ver := (v_served ->> 'version')::int; v_mode := v_served ->> 'mode';
        IF v_mode = 'frozen' AND coalesce((v_served ->> 'expired')::boolean, false) THEN
          v_gaps := v_gaps || jsonb_build_array(jsonb_build_object('key', 'twin.snapshot', 'required', false,
            'reason', format('the twin''s served state at the cut-off is a frozen snapshot (v%s) whose expiry had passed', v_twin_ver)));
        END IF;
        EXIT;
      END IF;
    END LOOP;
    IF v_twin_id IS NULL THEN
      v_gaps := v_gaps || jsonb_build_array(jsonb_build_object('key', 'twin.snapshot', 'required', false,
        'reason', 'no twin of the subject served an admitted version at the cut-off: the forecast is grounded without a twin snapshot'));
    END IF;
  END IF;
  IF v_twin_id IS NOT NULL THEN
    SELECT jsonb_build_object('twin_id', tv.twin_id, 'version', tv.version, 'branch_id', tv.branch_id, 'mode', v_mode,
             'state_set_digest', tv.state_set_digest, 'header_digest', tv.header_digest, 'known_at', prediction.pcx_ts(tv.known_at),
             'observed_through', tv.observed_through::text, 'admitted_at', prediction.pcx_ts(tv.admitted_at), 'synthetic', tv.synthetic_state,
             'elements', coalesce((SELECT jsonb_agg(jsonb_build_object('key', se.key, 'kind', se.kind, 'value', se.value, 'unit', se.unit,
                                                                      'health', se.health, 'confidence', se.confidence) ORDER BY se.key)
                                     FROM twin.state_elements se WHERE se.twin_id = tv.twin_id AND se.version = tv.version), '[]'::jsonb))
      INTO v_twin
      FROM twin.twin_versions tv WHERE tv.twin_id = v_twin_id AND tv.version = v_twin_ver AND tv.state = 'admitted';
    IF v_twin IS NULL THEN
      v_gaps := v_gaps || jsonb_build_array(jsonb_build_object('key', 'twin.snapshot', 'required', p_twin IS NOT NULL,
        'reason', format('twin %s v%s is not readable as an admitted version by this caller', v_twin_id, v_twin_ver)));
    END IF;
  END IF;

  -- THE ASSUMPTIONS as of the cut-off: the version recorded by then and the verification state its events say it had then.
  FOREACH a IN ARRAY coalesce(p_assumptions, ARRAY[]::uuid[]) LOOP
    IF NOT EXISTS (SELECT 1 FROM graph.strategy_current sc WHERE sc.strategy_object_id = a AND sc.object_type = 'ASU') THEN
      v_unknown := v_unknown || to_jsonb(a::text); CONTINUE;
    END IF;
    SELECT max(o.object_version) INTO v_ver FROM objects.canonical_objects o WHERE o.object_id = a AND o.object_type = 'ASU' AND o.recorded_at <= p_known_at;
    SELECT CASE ev.event WHEN 'assumption.verified' THEN 'verified' WHEN 'assumption.invalidated' THEN 'invalidated' ELSE 'unverified' END INTO v_state
      FROM graph.strategy_events ev WHERE ev.strategy_object_id = a AND ev.event IN ('assumption.verified', 'assumption.unverified', 'assumption.invalidated')
       AND ev.occurred_at <= p_known_at ORDER BY ev.occurred_at DESC, ev.event_id DESC LIMIT 1;
    v_assumptions := v_assumptions || jsonb_build_array(jsonb_build_object('id', a, 'version', v_ver, 'verification_state', coalesce(v_state, 'unverified')));
    IF v_ver IS NULL THEN
      v_gaps := v_gaps || jsonb_build_array(jsonb_build_object('key', 'assumption.' || a::text, 'required', false,
        'reason', 'the assumption had no recorded version at the cut-off (declared later): it is cited, not grounded'));
    END IF;
    v_state := NULL;
  END LOOP;

  -- THE POLICY VERSIONS in force (ontology active at the freeze; attention and decision-use policy as of the cut-off; §MR's horizon
  -- policy when its table exists — read generically, the latest row of the domain).
  BEGIN
    SELECT jsonb_build_object('version_id', o.version_id, 'namespace', o.namespace, 'version', o.version) INTO v_part
      FROM graph.ontology_versions o WHERE o.tenant_id = s.tenant_id AND o.domain_id = s.domain_id AND o.state = 'active' ORDER BY o.namespace, o.version DESC LIMIT 1;
    v_policy := v_policy || jsonb_build_object('ontology', v_part);
  EXCEPTION WHEN insufficient_privilege OR undefined_table OR undefined_column THEN
    v_gaps := v_gaps || jsonb_build_array(jsonb_build_object('key', 'policy.ontology', 'required', false, 'reason', 'the ontology version is not readable by this caller'));
  END;
  BEGIN
    SELECT jsonb_build_object('policy_id', p.policy_id, 'version', p.version, 'rules_digest', p.rules_digest) INTO v_part
      FROM executive.attention_policies p WHERE p.tenant_id = s.tenant_id AND p.domain_id = s.domain_id AND p.effective_at <= p_known_at
       AND (p.superseded_at IS NULL OR p.superseded_at > p_known_at) ORDER BY p.version DESC LIMIT 1;
    v_policy := v_policy || jsonb_build_object('attention_policy', v_part);
  EXCEPTION WHEN insufficient_privilege OR undefined_table OR undefined_column THEN
    v_gaps := v_gaps || jsonb_build_array(jsonb_build_object('key', 'policy.attention', 'required', false, 'reason', 'the attention policy is not readable by this caller'));
  END;
  BEGIN
    SELECT jsonb_build_object('policy_id', p.policy_id, 'version', p.version, 'require_decision_use', p.require_decision_use) INTO v_part
      FROM simulation.decision_use_policies p WHERE p.tenant_id = s.tenant_id AND p.domain_id = s.domain_id AND p.set_at <= p_known_at ORDER BY p.version DESC LIMIT 1;
    v_policy := v_policy || jsonb_build_object('decision_use_policy', v_part);
  EXCEPTION WHEN insufficient_privilege OR undefined_table OR undefined_column THEN
    v_gaps := v_gaps || jsonb_build_array(jsonb_build_object('key', 'policy.decision_use', 'required', false, 'reason', 'the decision-use policy is not readable by this caller'));
  END;
  v_hp := to_regclass('prediction.horizon_policies');
  IF v_hp IS NOT NULL THEN
    BEGIN
      EXECUTE 'SELECT to_jsonb(p) FROM prediction.horizon_policies p WHERE p.tenant_id = $1 AND p.domain_id = $2 ORDER BY (to_jsonb(p) ->> ''version'')::int DESC NULLS LAST LIMIT 1'
        INTO v_part USING s.tenant_id, s.domain_id;
      v_policy := v_policy || jsonb_build_object('horizon_policy', CASE WHEN v_part IS NULL THEN NULL ELSE
        jsonb_strip_nulls(jsonb_build_object('policy_id', v_part -> 'policy_id', 'version', v_part -> 'version', 'state', v_part -> 'state')) END);
    EXCEPTION WHEN insufficient_privilege OR undefined_column OR invalid_text_representation THEN
      v_gaps := v_gaps || jsonb_build_array(jsonb_build_object('key', 'policy.horizon', 'required', false, 'reason', 'the horizon policy is not readable by this caller'));
    END;
  END IF;

  RETURN jsonb_build_object(
    'series', jsonb_build_object('series_key', s.series_key, 'source_key', s.source_key, 'subject_entity_id', s.subject_entity_id, 'unit', s.unit,
                                 'seasonality_days', s.seasonality_days, 'parser_ref', s.parser_ref),
    'known_at', prediction.pcx_ts(p_known_at), 'revision_head', v_head, 'revision_updated_at', prediction.pcx_ts(v_head_at),
    'evidence', v_evidence, 'subject', v_subject, 'edges', v_edges, 'edge_total', v_edge_total, 'neighbours', to_jsonb(v_neigh), 'events', v_events,
    'twin', v_twin, 'assumptions', v_assumptions, 'unknown_assumptions', v_unknown, 'policy', v_policy, 'gaps', v_gaps,
    'withdrawn_partitions', to_jsonb(v_withdrawn));
END $$;
REVOKE ALL ON FUNCTION prediction.pcx_grounding_context(text, timestamptz, uuid[], jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.pcx_grounding_context(text, timestamptz, uuid[], jsonb) TO eye_app, eye_commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §CX.3 the freeze port
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
/* FREEZE an information set (prediction.information_set.freeze — and the issuing actions that freeze inside their own transaction through
   the CONTEXT_FREEZER seam: prediction.forecast.issue (the grounded issue), prediction.portfolio.issue (§MR), prediction.ensemble.issue
   (§EN)). The manifest is assembled and digested by assembler@N in the same transaction; the port VERIFIES what it can bind: the acting
   principal, the cut-offs against the database's instant, the series, the request the manifest carries, every assumption an ASU of the
   domain, every pinned evidence version (id, version, bytes digest, recorded by the cut-off), the revision head (the domain's head now —
   a graph commit between the read and the freeze is a stale manifest), the twin pin (an admitted version with those digests), and no
   REQUIRED coverage gap. Then the row and its ledger event. */
CREATE OR REPLACE FUNCTION prediction.freeze_information_set(
  p_set_id uuid, p_tenant uuid, p_domain uuid, p_request jsonb, p_manifest jsonb, p_manifest_digest text, p_assembler_version text,
  p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, graph, twin, objects, observation, public, pg_catalog, pg_temp AS $$
DECLARE v_action text; v_known timestamptz; v_through date; v_series text; v_subject uuid; v_head bigint; e jsonb; a text;
        v_twin jsonb; v_now timestamptz := clock_timestamp(); v_reg prediction.series_registry%ROWTYPE; g jsonb;
BEGIN
  v_action := observation.assert_authority(ARRAY['prediction.information_set.freeze', 'prediction.forecast.issue', 'prediction.portfolio.issue', 'prediction.ensemble.issue']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN
    RAISE EXCEPTION 'information set rejected (actor): the acting principal % is not the bound principal; a set is frozen by whoever acts', p_actor USING ERRCODE = '42501';
  END IF;
  IF p_set_id IS NULL OR p_request IS NULL OR jsonb_typeof(p_request) <> 'object' OR p_manifest IS NULL OR jsonb_typeof(p_manifest) <> 'object'
     OR coalesce(p_manifest_digest, '') !~ '^[0-9a-f]{64}$' OR coalesce(p_assembler_version, '') !~ '^assembler@[0-9]+$' THEN
    RAISE EXCEPTION 'information set rejected (contract): a set names its id, an object request, an object manifest, a sha-256 manifest digest and the assembler version (assembler@N)' USING ERRCODE = '22023';
  END IF;
  v_series := p_request ->> 'series_key';
  BEGIN
    v_known := (p_request ->> 'known_at')::timestamptz; v_through := (p_request ->> 'observed_through')::date;
  EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow OR invalid_text_representation THEN
    RAISE EXCEPTION 'information set rejected (contract): known_at is an instant and observed_through a day (or null)' USING ERRCODE = '22023';
  END;
  IF v_series IS NULL OR v_known IS NULL THEN
    RAISE EXCEPTION 'information set rejected (contract): the request names the series and the cut-off (known_at)' USING ERRCODE = '22023';
  END IF;
  IF v_known > v_now THEN
    RAISE EXCEPTION 'information set rejected (contract): the cut-off % is later than the database''s instant %; a set freezes what was known, never what will be', v_known, v_now USING ERRCODE = '22023';
  END IF;
  IF v_through IS NOT NULL AND v_through > (v_known AT TIME ZONE 'UTC')::date THEN
    RAISE EXCEPTION 'information set rejected (contract): observed_through % is after the cut-off''s day; nothing observed after what was known can be in the set', v_through USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_reg FROM prediction.series_registry r WHERE r.tenant_id = p_tenant AND r.domain_id = p_domain AND r.series_key = v_series;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'information set rejected (unknown_series): series % is not registered in this domain', v_series USING ERRCODE = '23503';
  END IF;
  v_subject := (p_request ->> 'subject_entity_id')::uuid;
  IF v_subject IS DISTINCT FROM v_reg.subject_entity_id THEN
    RAISE EXCEPTION 'information set rejected (mismatch): the request''s subject % is not series %''s subject %', v_subject, v_series, v_reg.subject_entity_id USING ERRCODE = '22023';
  END IF;
  IF p_manifest -> 'request' IS DISTINCT FROM p_request THEN
    RAISE EXCEPTION 'information set rejected (mismatch): the manifest''s request is not the request frozen' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM prediction.information_sets x WHERE x.information_set_id = p_set_id) THEN
    RAISE EXCEPTION 'information set rejected (duplicate): information set % is already frozen; a set is frozen once', p_set_id USING ERRCODE = '23505';
  END IF;
  FOR a IN SELECT jsonb_array_elements_text(coalesce(p_request -> 'assumptions', '[]'::jsonb)) LOOP
    IF NOT EXISTS (SELECT 1 FROM graph.strategy_current sc WHERE sc.strategy_object_id = a::uuid AND sc.object_type = 'ASU'
                    AND sc.tenant_id = p_tenant AND sc.domain_id = p_domain) THEN
      RAISE EXCEPTION 'information set rejected (unknown_assumption): % is not an assumption (ASU) of this domain', a USING ERRCODE = '23503';
    END IF;
  END LOOP;
  -- the REQUIRED inputs: the evidence (at least one version, each bound exactly) and no required coverage gap
  IF jsonb_typeof(p_manifest -> 'evidence') IS DISTINCT FROM 'array' OR jsonb_array_length(p_manifest -> 'evidence') = 0 THEN
    RAISE EXCEPTION 'information set rejected (incomplete): no evidence version of series % was known at %; the required input is unreadable', v_series, v_known USING ERRCODE = '22023';
  END IF;
  FOR g IN SELECT * FROM jsonb_array_elements(coalesce(p_manifest -> 'coverage_gaps', '[]'::jsonb)) LOOP
    IF (g ->> 'required') = 'true' THEN
      RAISE EXCEPTION 'information set rejected (incomplete): the required input % is unreadable — %', g ->> 'key', g ->> 'reason' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  FOR e IN SELECT * FROM jsonb_array_elements(p_manifest -> 'evidence') LOOP
    IF NOT EXISTS (SELECT 1 FROM objects.canonical_objects o
                    WHERE o.object_id = (e ->> 'evidence_object_id')::uuid AND o.object_version = (e ->> 'evidence_version')::bigint
                      AND o.object_type = 'EVD' AND o.tenant_id = p_tenant AND o.domain_id = p_domain AND o.recorded_at <= v_known
                      AND o.payload ->> 'content_digest' = e ->> 'evidence_digest') THEN
      RAISE EXCEPTION 'information set rejected (mismatch): evidence %@% (digest %) is not an evidence version of this domain recorded by the cut-off',
        e ->> 'evidence_object_id', e ->> 'evidence_version', left(coalesce(e ->> 'evidence_digest', '-'), 12) USING ERRCODE = '22023';
    END IF;
  END LOOP;
  SELECT h.head INTO v_head FROM graph.revision_heads h WHERE h.tenant_id = p_tenant AND h.domain_id = p_domain;
  v_head := coalesce(v_head, 0);
  IF (p_manifest #>> '{graph,revision_head}') IS NULL OR (p_manifest #>> '{graph,revision_head}')::bigint <> v_head THEN
    RAISE EXCEPTION 'information set rejected (stale): the manifest pins graph revision % but the domain''s head is %; a graph commit landed between the read and the freeze — assemble again',
      coalesce(p_manifest #>> '{graph,revision_head}', '-'), v_head USING ERRCODE = '23514';
  END IF;
  v_twin := CASE WHEN jsonb_typeof(p_manifest -> 'twin') = 'object' THEN p_manifest -> 'twin' ELSE NULL END;
  IF v_twin IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM twin.twin_versions tv WHERE tv.twin_id = (v_twin ->> 'twin_id')::uuid AND tv.version = (v_twin ->> 'version')::int
         AND tv.tenant_id = p_tenant AND tv.domain_id = p_domain AND tv.state = 'admitted'
         AND tv.state_set_digest = v_twin ->> 'state_set_digest' AND tv.header_digest = v_twin ->> 'header_digest') THEN
    RAISE EXCEPTION 'information set rejected (mismatch): the twin pin %@v% is not an admitted version of this domain with those digests', v_twin ->> 'twin_id', v_twin ->> 'version' USING ERRCODE = '22023';
  END IF;

  INSERT INTO prediction.information_sets (
    information_set_id, scope, tenant_id, domain_id, series_key, subject_entity_id, target_key, known_at, observed_through, request,
    evidence, graph, twin, features, assumptions, policy, coverage_gaps, manifest, manifest_digest, assembler_version, revision_head,
    twin_id, twin_version, frozen_via, frozen_by, frozen_at, correlation_id
  ) VALUES (
    p_set_id, 'DOMAIN', p_tenant, p_domain, v_series, v_subject, p_request ->> 'target_key', v_known, v_through, p_request,
    p_manifest -> 'evidence', coalesce(p_manifest -> 'graph', '{}'::jsonb), v_twin, coalesce(p_manifest -> 'features', '[]'::jsonb),
    coalesce(p_manifest -> 'assumptions', '[]'::jsonb), coalesce(p_manifest -> 'policy', '{}'::jsonb), coalesce(p_manifest -> 'coverage_gaps', '[]'::jsonb),
    p_manifest, p_manifest_digest, p_assembler_version, v_head, (v_twin ->> 'twin_id')::uuid, (v_twin ->> 'version')::int,
    v_action, p_actor, v_now, p_correlation);
  INSERT INTO prediction.information_set_events (event_id, scope, tenant_id, domain_id, information_set_id, event, forecast_id, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_set_id, 'information_set.frozen', NULL, p_actor,
          jsonb_build_object('manifest_digest', p_manifest_digest, 'revision_head', v_head, 'via', v_action, 'assembler_version', p_assembler_version,
                             'twin', CASE WHEN v_twin IS NULL THEN NULL ELSE jsonb_build_object('twin_id', v_twin -> 'twin_id', 'version', v_twin -> 'version') END,
                             'evidence', jsonb_array_length(p_manifest -> 'evidence'), 'coverage_gaps', jsonb_array_length(coalesce(p_manifest -> 'coverage_gaps', '[]'::jsonb))),
          p_correlation);
  RETURN jsonb_build_object('information_set_id', p_set_id, 'manifest_digest', p_manifest_digest, 'revision_head', v_head, 'known_at', v_known,
                            'frozen_at', v_now, 'frozen_via', v_action, 'twin', v_twin IS NOT NULL);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.freeze_information_set(uuid, uuid, uuid, jsonb, jsonb, text, text, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.freeze_information_set(uuid, uuid, uuid, jsonb, jsonb, text, text, uuid, uuid, uuid) TO eye_commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §CX.4 the pin on the forecast row (default-off)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION prediction.pcx_fct_information_set() RETURNS trigger
SECURITY DEFINER SET search_path = prediction, pg_catalog, pg_temp AS $$
DECLARE s prediction.information_sets%ROWTYPE; v_missing jsonb;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.information_set_id IS DISTINCT FROM OLD.information_set_id THEN
      RAISE EXCEPTION 'information set rejected (state): forecast % pinned information set % at issue; a pin is never changed — issue a new forecast', OLD.forecast_id, coalesce(OLD.information_set_id::text, 'none')
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.information_set_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO s FROM prediction.information_sets x WHERE x.information_set_id = NEW.information_set_id AND x.tenant_id = NEW.tenant_id AND x.domain_id = NEW.domain_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'information set rejected (unknown_information_set): % is no frozen information set of this domain', NEW.information_set_id USING ERRCODE = '23503';
  END IF;
  IF s.series_key <> NEW.series_key OR s.subject_entity_id IS DISTINCT FROM NEW.subject_entity_id OR s.known_at <> NEW.known_at THEN
    RAISE EXCEPTION 'information set rejected (mismatch): set % was frozen for series % (subject %, known at %), not for this forecast''s series % (subject %, known at %)',
      s.information_set_id, s.series_key, coalesce(s.subject_entity_id::text, 'none'), s.known_at, NEW.series_key, coalesce(NEW.subject_entity_id::text, 'none'), NEW.known_at
      USING ERRCODE = '22023';
  END IF;
  SELECT r INTO v_missing FROM jsonb_array_elements(NEW.evidence_refs) r
   WHERE NOT s.evidence @> jsonb_build_array(jsonb_build_object('evidence_object_id', r ->> 'evidence_object_id',
                                                               'evidence_version', (r ->> 'evidence_version')::int, 'evidence_digest', r ->> 'evidence_digest'))
   LIMIT 1;
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'information set rejected (mismatch): the forecast cites evidence %@% which set % did not pin; a grounded forecast reads only its frozen evidence',
      v_missing ->> 'evidence_object_id', v_missing ->> 'evidence_version', s.information_set_id USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.pcx_fct_information_set() FROM PUBLIC;
CREATE TRIGGER pcx_fct_information_set BEFORE INSERT OR UPDATE OF information_set_id ON prediction.forecasts_current
  FOR EACH ROW EXECUTE FUNCTION prediction.pcx_fct_information_set();

/* The pin's ledger: only a forecast that names a set writes it (the forecast's own forecast.information_set_frozen and the set's
   information_set.pinned) — a legacy issue writes nothing more. */
CREATE OR REPLACE FUNCTION prediction.pcx_fct_information_set_pinned() RETURNS trigger
SECURITY DEFINER SET search_path = prediction, pg_catalog, pg_temp AS $$
DECLARE s prediction.information_sets%ROWTYPE;
BEGIN
  SELECT * INTO s FROM prediction.information_sets x WHERE x.information_set_id = NEW.information_set_id;
  INSERT INTO prediction.forecast_events (event_id, scope, tenant_id, domain_id, forecast_id, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', NEW.tenant_id, NEW.domain_id, NEW.forecast_id, 'forecast.information_set_frozen', NEW.issued_by,
          jsonb_build_object('information_set_id', s.information_set_id, 'manifest_digest', s.manifest_digest, 'revision_head', s.revision_head,
                             'twin', CASE WHEN s.twin_id IS NULL THEN NULL ELSE jsonb_build_object('twin_id', s.twin_id, 'version', s.twin_version) END,
                             'environment_digest', NEW.environment_digest),
          NEW.correlation_id);
  INSERT INTO prediction.information_set_events (event_id, scope, tenant_id, domain_id, information_set_id, event, forecast_id, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', NEW.tenant_id, NEW.domain_id, s.information_set_id, 'information_set.pinned', NEW.forecast_id, NEW.issued_by,
          jsonb_build_object('horizon', NEW.horizon_code, 'method', NEW.method, 'environment_digest', NEW.environment_digest), NEW.correlation_id);
  RETURN NULL;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.pcx_fct_information_set_pinned() FROM PUBLIC;
CREATE TRIGGER pcx_fct_information_set_pinned AFTER INSERT ON prediction.forecasts_current
  FOR EACH ROW WHEN (NEW.information_set_id IS NOT NULL) EXECUTE FUNCTION prediction.pcx_fct_information_set_pinned();

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §CX.5 the replay port
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
/* RECORD a replay (prediction.forecast.replay). The service re-read the pinned inputs, re-assembled the manifest and re-ran the method;
   the port binds what it was handed to what is stored (the forecast, its pin, the frozen manifest digest, the recorded environment) and
   DERIVES the outcome: REPRODUCED only when the replayed manifest and output digests equal the original's and nothing diverged. */
CREATE OR REPLACE FUNCTION prediction.record_forecast_replay(
  p_replay_id uuid, p_tenant uuid, p_domain uuid, p_forecast_id uuid, p_information_set_id uuid,
  p_original_manifest_digest text, p_replayed_manifest_digest text, p_original_output_digest text, p_replayed_output_digest text,
  p_original_environment_digest text, p_replayed_environment_digest text, p_diverged jsonb, p_fresh jsonb, p_detail jsonb,
  p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, observation, public, pg_catalog, pg_temp AS $$
DECLARE f prediction.forecasts_current%ROWTYPE; s prediction.information_sets%ROWTYPE; v_outcome text; v_match boolean; v_now timestamptz := clock_timestamp();
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.forecast.replay']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN
    RAISE EXCEPTION 'forecast replay rejected (actor): the acting principal % is not the bound principal', p_actor USING ERRCODE = '42501';
  END IF;
  SELECT * INTO f FROM prediction.forecasts_current x WHERE x.forecast_id = p_forecast_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'forecast replay rejected (unknown_forecast): no forecast % in this domain', p_forecast_id USING ERRCODE = '23503';
  END IF;
  IF f.information_set_id IS NULL THEN
    RAISE EXCEPTION 'forecast replay rejected (ungrounded): forecast % was issued without a frozen information set, so nothing pins what it knew — replay needs a grounded forecast (POST …/prediction/forecasts/issue-grounded)', p_forecast_id
      USING ERRCODE = '22023';
  END IF;
  IF p_information_set_id IS DISTINCT FROM f.information_set_id THEN
    RAISE EXCEPTION 'forecast replay rejected (mismatch): forecast % pins information set %, not %', p_forecast_id, f.information_set_id, coalesce(p_information_set_id::text, 'none') USING ERRCODE = '22023';
  END IF;
  SELECT * INTO s FROM prediction.information_sets x WHERE x.information_set_id = f.information_set_id;
  IF coalesce(p_original_manifest_digest, '') <> s.manifest_digest THEN
    RAISE EXCEPTION 'forecast replay rejected (stale): the original manifest digest handed (%) is not the frozen set''s (%)', left(coalesce(p_original_manifest_digest, '-'), 12), left(s.manifest_digest, 12) USING ERRCODE = '23514';
  END IF;
  IF p_original_environment_digest IS DISTINCT FROM f.environment_digest THEN
    RAISE EXCEPTION 'forecast replay rejected (stale): the original environment digest handed is not the one forecast % recorded', p_forecast_id USING ERRCODE = '23514';
  END IF;
  IF coalesce(p_replayed_manifest_digest, '') !~ '^[0-9a-f]{64}$' OR coalesce(p_original_output_digest, '') !~ '^[0-9a-f]{64}$'
     OR (p_replayed_output_digest IS NOT NULL AND p_replayed_output_digest !~ '^[0-9a-f]{64}$')
     OR (p_replayed_environment_digest IS NOT NULL AND p_replayed_environment_digest !~ '^[0-9a-f]{64}$')
     OR p_diverged IS NULL OR jsonb_typeof(p_diverged) <> 'array' OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_diverged) d WHERE jsonb_typeof(d) <> 'object' OR NOT (d ? 'what'))
     OR (p_fresh IS NOT NULL AND jsonb_typeof(p_fresh) <> 'object') THEN
    RAISE EXCEPTION 'forecast replay rejected (contract): a replay hands sha-256 digests, the divergences as [{what, …}] and the fresh grounding as an object' USING ERRCODE = '22023';
  END IF;
  IF (p_replayed_manifest_digest <> p_original_manifest_digest OR p_replayed_output_digest IS DISTINCT FROM p_original_output_digest)
     AND jsonb_array_length(p_diverged) = 0 THEN
    RAISE EXCEPTION 'forecast replay rejected (contract): the digests differ but no divergence is named; a replay that diverged says what diverged' USING ERRCODE = '22023';
  END IF;
  v_outcome := CASE WHEN p_replayed_manifest_digest = p_original_manifest_digest AND p_replayed_output_digest IS NOT DISTINCT FROM p_original_output_digest
                         AND jsonb_array_length(p_diverged) = 0 THEN 'REPRODUCED' ELSE 'DIVERGED' END;
  v_match := p_replayed_environment_digest IS NOT DISTINCT FROM p_original_environment_digest;
  INSERT INTO prediction.forecast_replays (
    replay_id, scope, tenant_id, domain_id, forecast_id, information_set_id, outcome, original_manifest_digest, replayed_manifest_digest,
    original_output_digest, replayed_output_digest, original_environment_digest, replayed_environment_digest, environment_match, diverged,
    fresh, detail, replayed_by, replayed_at, correlation_id
  ) VALUES (
    p_replay_id, 'DOMAIN', p_tenant, p_domain, p_forecast_id, s.information_set_id, v_outcome, p_original_manifest_digest, p_replayed_manifest_digest,
    p_original_output_digest, p_replayed_output_digest, p_original_environment_digest, p_replayed_environment_digest, v_match, p_diverged,
    p_fresh, coalesce(p_detail, '{}'::jsonb), p_actor, v_now, p_correlation);
  INSERT INTO prediction.forecast_events (event_id, scope, tenant_id, domain_id, forecast_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_forecast_id, 'forecast.replayed', p_actor,
          jsonb_build_object('replay_id', p_replay_id, 'outcome', v_outcome, 'information_set_id', s.information_set_id, 'environment_match', v_match,
                             'diverged', (SELECT coalesce(jsonb_agg(d -> 'what'), '[]'::jsonb) FROM jsonb_array_elements(p_diverged) d)),
          p_correlation);
  INSERT INTO prediction.information_set_events (event_id, scope, tenant_id, domain_id, information_set_id, event, forecast_id, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, s.information_set_id, 'information_set.replayed', p_forecast_id, p_actor,
          jsonb_build_object('replay_id', p_replay_id, 'outcome', v_outcome), p_correlation);
  RETURN jsonb_build_object('replay_id', p_replay_id, 'forecast_id', p_forecast_id, 'information_set_id', s.information_set_id, 'outcome', v_outcome,
                            'environment_match', v_match, 'replayed_at', v_now);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.record_forecast_replay(uuid, uuid, uuid, uuid, uuid, text, text, text, text, text, text, jsonb, jsonb, jsonb, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.record_forecast_replay(uuid, uuid, uuid, uuid, uuid, text, text, text, text, text, text, jsonb, jsonb, jsonb, uuid, uuid, uuid) TO eye_commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §CX.6 row security and grants (the 0081 loop idiom; the prediction schema's isolation policy text, 0029:420-425)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['information_sets', 'information_set_events', 'forecast_replays'] LOOP
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
-- §MR — THE REGISTRY: governed methods and targets, the horizon policy, routing, the method families (F-P4-01)
-- (built as the part `registry` on its own worktree; folded here in apply order §CX, §MR, §EN)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
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

-- (§MR.0, the prelude request, was folded into §0.6 at integration: issue_forecast's authority list carries prediction.portfolio.issue.)

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

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §EN — ENSEMBLES: the manager, the combination, disagreement, model-path availability, the judgement overlay (F-P4-02)
-- (built as the part `ensembles` on its own worktree; folded here in apply order §CX, §MR, §EN)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
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
   carries the class `forecast.disagreement` (the prelude §0.4b widens it at integration) — the owner's attention item on the ensemble
   forecast (or the run, failed with none), ROUTED UNDER THE PUBLISHED POLICY (the integration's correction, 0107's rule). Returns the escalation record. */
CREATE OR REPLACE FUNCTION prediction.pen_escalate(p_run prediction.ensemble_runs, p_reason text, p_details jsonb, p_actor uuid, p_correlation uuid) RETURNS jsonb
SET search_path = prediction, executive, identity, pg_catalog, pg_temp AS $$
DECLARE v_item uuid; v_state text; v_channel text := 'event'; v_title text; v_event uuid := gen_random_uuid();
        pol executive.attention_policies%ROWTYPE; v_eval jsonb; v_route jsonb; v_owner uuid;
BEGIN
  IF 'forecast.disagreement' = ANY (executive.attention_signal_classes()) THEN
    -- integration (0108): routed UNDER THE DOMAIN'S PUBLISHED ATTENTION POLICY (L10-I02, C-032, V04-T-037 — the 0107 correction's rule),
    -- the run's forecast owner kept as the named owner; a class the policy does not name abstains (deprioritized, listed, never hidden)
    v_item := gen_random_uuid(); v_channel := 'attention_item';
    v_owner := CASE WHEN EXISTS (SELECT 1 FROM identity.principals p WHERE p.id = p_run.owner_principal_id AND p.kind = 'human' AND p.status = 'active') THEN p_run.owner_principal_id END;
    SELECT * INTO pol FROM executive.attention_policies a WHERE a.tenant_id = p_run.tenant_id AND a.domain_id = p_run.domain_id AND a.state = 'active';
    v_eval := executive.evaluate_attention(CASE WHEN pol.policy_id IS NULL THEN NULL ELSE pol.rules END, 'forecast.disagreement',
                                           jsonb_build_object('consequence', 'C2', 'confidence', 1, 'hours_to_window', 72))
              || jsonb_build_object('policy_version', pol.version, 'raised_reasons', jsonb_build_array(p_reason));
    v_route := executive.attention_route(pol.rules, 'forecast.disagreement', v_eval ->> 'outcome', v_owner, p_run.tenant_id, p_run.domain_id);
    v_state := v_route ->> 'state';
    v_title := left(format('Ensemble %s: %s at %s — %s', CASE WHEN p_run.state = 'failed' OR p_reason LIKE 'failed%%' THEN 'failed' ELSE 'disagreement' END, p_run.series_key, p_run.horizon_code, p_reason), 512);
    INSERT INTO executive.attention_items (item_id, scope, tenant_id, domain_id, signal_class, subject_kind, subject_id, cause_event_id, cause_event_type, title, outcome, state, owner_principal_id, route_roles,
                                           policy_id, policy_version, evaluation, details, due_at, escalations, correlation_id)
    VALUES (v_item, 'DOMAIN', p_run.tenant_id, p_run.domain_id, 'forecast.disagreement',
            CASE WHEN p_run.ensemble_forecast_id IS NULL THEN 'ensemble_run' ELSE 'forecast' END, coalesce(p_run.ensemble_forecast_id, p_run.run_id),
            v_event, 'ensemble.escalated', v_title, v_eval ->> 'outcome', v_state, v_owner, ARRAY(SELECT jsonb_array_elements_text(v_route -> 'route_roles')),
            pol.policy_id, pol.version, v_eval,
            jsonb_build_object('run_id', p_run.run_id, 'ensemble_forecast_id', p_run.ensemble_forecast_id) || coalesce(p_details, '{}'::jsonb),
            (v_route ->> 'due_at')::timestamptz, coalesce((v_route ->> 'escalations')::int, 0), p_correlation);
    PERFORM executive.attention_event(v_item, p_run.tenant_id, p_run.domain_id,
              CASE v_state WHEN 'open' THEN 'item.routed' WHEN 'escalated' THEN 'item.escalated' WHEN 'unrouted' THEN 'item.unrouted' ELSE 'item.deprioritized' END, p_actor,
              jsonb_build_object('outcome', v_eval ->> 'outcome', 'reasons', v_eval -> 'reasons', 'raised_reasons', jsonb_build_array(p_reason), 'policy_version', pol.version,
                                 'owner', v_owner, 'route_roles', v_route -> 'route_roles', 'due_at', v_route -> 'due_at', 'cause_event_id', v_event, 'cause_event_type', 'ensemble.escalated',
                                 'unrouted', coalesce((v_route ->> 'unrouted')::boolean, v_state = 'unrouted'), 'run_id', p_run.run_id), p_correlation);
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
