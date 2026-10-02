-- ═════════════════════════════════════════════════════════════════════
-- section `envelope` (§EN) — CP-6 B30 part `envelope`: F-P5-04 COMPLETE (V00-T-061; V02-T-054/-125; L5-C03/-C08, L5-I05, V03-T-116/-117/-120;
-- ES-35-007/-008/-009, V04-T-027/-028; AI-28-004, AI-C028; PR-36-005; R-08)
-- ═════════════════════════════════════════════════════════════════════
-- Part-local file: it applies after the prelude (0103 §0) on its own; the integrator combines it into 0103 in the apply order (§BR, §EN,
-- §ES, §EX). Forward-only; nothing earlier is edited; the prelude's objects are USED, never re-declared. Prefix `ten_`.
--
--   §EN.1  THE TABLES — simulation.exploratory_admissions (the twin owner's admission of an outside-envelope run as EXPLORATORY, the method
--          steward's concurrence: the RAISED threshold), twin.calibrations (model × twin × key: predicted against LATER observed — MAE, MAPE,
--          bias, n, the drift state against a declared tolerance; the model-fitness indicators), twin.model_lifecycle (per behaviour model
--          per domain: proposed → approved → deprecated → retired, the steward, the compatibility declarations per twin kind),
--          twin.envelope_events (the ledger). RLS by the 0081 loop idiom; the ledgers append-only.
--   §EN.2  THE RE-DECLARATIONS (each COPIED WHOLE, the change marked `B30 envelope`): twin.envelope_ack_holder (0081:319 — a twin owner
--          only; no longer the domain administrator nor the platform administrator) and simulation.run_decision_use (0101:3991 — the REFUSED
--          classes outside_envelope and retired, the DIAGNOSTIC classes model_lifecycle and calibration_drifting appended after the existing
--          ones, whose order is unchanged; `exploratory` stated on an outside-envelope run only, `retired_at` on a retired run only, so the
--          answer of every other run is byte-identical).
--   §EN.3  THE GATES — BEFORE INSERT on simulation.promotions `ten_exploratory_promotion` (an outside-envelope run is promoted only after
--          the exploratory admission AND the concurrence); BEFORE INSERT on simulation.runs_current `ten_model_lifecycle` (a run on a model
--          RETIRED in the domain, or declared INCOMPATIBLE with the twin's kind, is refused; a run on a deprecated or merely proposed model
--          is MARKED in the ledger). Default-off: with no lifecycle row and no outside-envelope promotion nothing changes on any existing path.
--   §EN.4  THE PORTS — simulation.admit_exploratory (twin.envelope.admit), simulation.concur_exploratory (twin.envelope.concur), twin.calibrate
--          (twin.calibration.run), twin.set_model_state and twin.declare_compatibility (twin.model.lifecycle).
--   §EN.5  THE READS — twin.ai_context (AI-28-004: the envelope, the stale variables, the sensitivity, the fitness — guarded definer, N-01) and
--          twin.calibration_read (invoker, RLS).
--   Seams: the freeze (§BR's twin.snapshot_freezes / twin.served_state / twin.version_freshness) is read through to_regclass /
--          to_regprocedure so this part runs alone; run retirement (§EX writes the prelude's runs_current.retired_*) is read directly.
--   Nothing here publishes an event on an existing path; twin.twin_events, simulation.run_events and simulation.experiment_events are not
--   touched. Every figure a harness seeds is SYNTHETIC.

-- ─────────────────────────────────────────────────────────────────────
-- §EN.1 THE TABLES
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE simulation.exploratory_admissions (
  admission_id        uuid PRIMARY KEY,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  run_id              uuid NOT NULL REFERENCES simulation.runs_current (run_id),
  twin_id             uuid NOT NULL,
  twin_version        int  NOT NULL,
  model_ref           text NOT NULL,
  /* the outside keys RESTATED from the run's recorded envelope check (never re-computed): [{key, value, range, source}] */
  keys                jsonb NOT NULL CHECK (jsonb_typeof(keys) = 'array'),
  reason              text NOT NULL CHECK (length(btrim(reason)) >= 8),
  admitted_by         uuid NOT NULL,
  admitted_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  /* the SECOND named human: a method steward other than the admitter and the run's operator */
  concurred_by        uuid,
  concurred_at        timestamptz,
  concurrence_note    text,
  correlation_id      uuid NOT NULL,
  CONSTRAINT ten_xa_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT ten_xa_concurred_bound CHECK ((concurred_by IS NULL) = (concurred_at IS NULL) AND (concurred_by IS NULL) = (concurrence_note IS NULL)),
  CONSTRAINT ten_xa_second_human CHECK (concurred_by IS NULL OR concurred_by <> admitted_by)
);
CREATE UNIQUE INDEX ten_xa_one_per_run ON simulation.exploratory_admissions (run_id);
CREATE INDEX ten_xa_twin ON simulation.exploratory_admissions (twin_id, admitted_at);
COMMENT ON TABLE simulation.exploratory_admissions IS 'B30 §EN (0103; F-P5-04, V03-T-120): a run outside the operating envelope is DISABLED for decision use (simulation.run_decision_use: refused, outside_envelope); a twin owner — never the domain administrator — may ADMIT it as EXPLORATORY (still refused for decision, exploratory stated), and it is promoted only after a method steward''s CONCURRENCE (the raised threshold). One per run; the concurrence written once.';

/* An admission changes once, by its concurrence; never deleted. */
CREATE OR REPLACE FUNCTION simulation.ten_admission_once() RETURNS trigger
SET search_path = simulation, pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'exploratory admissions are append-only: DELETE prohibited' USING ERRCODE = '2F002'; END IF;
  IF OLD.concurred_at IS NOT NULL OR NEW.concurred_at IS NULL
     OR (to_jsonb(NEW) - ARRAY['concurred_by', 'concurred_at', 'concurrence_note']) <> (to_jsonb(OLD) - ARRAY['concurred_by', 'concurred_at', 'concurrence_note']) THEN
    RAISE EXCEPTION 'exploratory admission % is written once and concurred once', OLD.admission_id USING ERRCODE = '2F002';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER ten_xa_once BEFORE UPDATE OR DELETE ON simulation.exploratory_admissions FOR EACH ROW EXECUTE FUNCTION simulation.ten_admission_once();

CREATE TABLE twin.calibrations (
  calibration_id      uuid PRIMARY KEY,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  method_ref          text NOT NULL REFERENCES twin.behaviour_models (method_ref),
  twin_id             uuid NOT NULL REFERENCES twin.twins_current (twin_id),
  key                 text NOT NULL CHECK (key ~ '^[a-z][a-z0-9_.-]*(:[A-Za-z0-9_.-]+)?$'),
  seq                 int  NOT NULL CHECK (seq >= 1),
  /* every pair the estimate rests on: [{source (reconciliation | element | run), predicted, observed, error, from, against}] */
  pairs               jsonb NOT NULL CHECK (jsonb_typeof(pairs) = 'array'),
  n                   int  NOT NULL CHECK (n >= 0),
  mae                 numeric,
  mape                numeric,
  bias                numeric,
  /* the declared tolerance {mape | mae, min_n} */
  tolerance           jsonb NOT NULL CHECK (jsonb_typeof(tolerance) = 'object'),
  drift_state         text NOT NULL CHECK (drift_state IN ('stable', 'drifting', 'insufficient')),
  prior_state         text CHECK (prior_state IS NULL OR prior_state IN ('stable', 'drifting', 'insufficient')),
  rule_version        text NOT NULL,
  synthetic_state     boolean NOT NULL,
  calibrated_by       uuid NOT NULL,
  calibrated_at       timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id      uuid NOT NULL,
  CONSTRAINT ten_cal_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT ten_cal_metrics CHECK ((n = 0) = (mae IS NULL) AND (n = 0) = (bias IS NULL))
);
CREATE UNIQUE INDEX ten_cal_seq ON twin.calibrations (twin_id, method_ref, key, seq);
CREATE INDEX ten_cal_latest ON twin.calibrations (twin_id, method_ref, key, seq DESC);
CREATE TRIGGER ten_cal_append_only BEFORE UPDATE OR DELETE ON twin.calibrations FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE twin.calibrations IS 'B30 §EN (0103; F-P5-04, L5-I05, ES-35-008): a CALIBRATION of a behaviour model on a twin for one key — the predicted values (simulated/predicted elements; control runs'' outputs) against LATER observed values (twin.reconciliations; observed elements of later admitted versions): the estimation error (MAE, MAPE, bias) over n pairs and the DRIFT state against a declared tolerance (insufficient below min_n). Append-only; seq per model × twin × key. These are the model-fitness indicators.';

CREATE TABLE twin.model_lifecycle (
  lifecycle_id        uuid PRIMARY KEY,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  method_ref          text NOT NULL REFERENCES twin.behaviour_models (method_ref),
  state               text NOT NULL CHECK (state IN ('proposed', 'approved', 'deprecated', 'retired')),
  /* the steward of record: the method steward who set the current state */
  steward_principal_id uuid NOT NULL,
  proposed_by         uuid,
  approved_by         uuid,
  reason              text NOT NULL CHECK (length(btrim(reason)) >= 8),
  /* {twin_kind: {compatible, note, declared_by, declared_at}} */
  compatibility       jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(compatibility) = 'object'),
  version             int  NOT NULL CHECK (version >= 1),
  updated_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id      uuid NOT NULL,
  CONSTRAINT ten_ml_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE UNIQUE INDEX ten_ml_one ON twin.model_lifecycle (tenant_id, domain_id, method_ref);
COMMENT ON TABLE twin.model_lifecycle IS 'B30 §EN (0103; F-P5-04, V03-T-116/-117, PR-36-005): the STEWARDSHIP of a behaviour model in a domain — proposed → approved → deprecated → retired (a retired model is re-proposed, never revived), set by a method steward (an approval of a proposal by a steward other than its proposer), with compatibility declarations per twin kind. No row = approved (the models in use before B30). A run on a retired or incompatible model is refused (ten_model_lifecycle); one on a deprecated or proposed model is marked.';

CREATE TABLE twin.envelope_events (
  event_id            uuid PRIMARY KEY,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  event               text NOT NULL CHECK (event IN ('exploratory.admitted', 'exploratory.concurred', 'calibration.recorded', 'model.state_set', 'model.compatibility_declared', 'run.model_marked')),
  twin_id             uuid,
  run_id              uuid,
  method_ref          text,
  actor_principal_id  uuid NOT NULL,
  details             jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id      uuid NOT NULL,
  CONSTRAINT ten_ev_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX ten_ev_twin ON twin.envelope_events (twin_id, occurred_at);
CREATE INDEX ten_ev_run ON twin.envelope_events (run_id, occurred_at);
CREATE INDEX ten_ev_model ON twin.envelope_events (method_ref, occurred_at);
CREATE TRIGGER ten_ev_append_only BEFORE UPDATE OR DELETE ON twin.envelope_events FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

-- RLS and grants: the 0081 loop idiom (the schema's own isolation policy; SELECT to eye_app and eye_commit; no write grant — the ports write).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['calibrations', 'model_lifecycle', 'envelope_events'] LOOP
    EXECUTE format('REVOKE ALL ON twin.%I FROM PUBLIC', t);
    EXECUTE format('ALTER TABLE twin.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE twin.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY twin_isolation ON twin.%I
        USING (
          tenant_id = public.eye_tenant()
          AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain())
        )$f$, t);
    EXECUTE format('GRANT SELECT ON twin.%I TO eye_app, eye_commit', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['exploratory_admissions'] LOOP
    EXECUTE format('REVOKE ALL ON simulation.%I FROM PUBLIC', t);
    EXECUTE format('ALTER TABLE simulation.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE simulation.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY simulation_isolation ON simulation.%I
        USING (
          tenant_id = public.eye_tenant()
          AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain())
        )$f$, t);
    EXECUTE format('GRANT SELECT ON simulation.%I TO eye_app, eye_commit', t);
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- §EN.0 HELPERS (this part's own)
-- ─────────────────────────────────────────────────────────────────────
/* The ledger row. */
CREATE OR REPLACE FUNCTION twin.ten_event(p_tenant uuid, p_domain uuid, p_event text, p_twin uuid, p_run uuid, p_model text, p_actor uuid, p_details jsonb, p_correlation uuid) RETURNS uuid
SECURITY DEFINER SET search_path = twin, pg_catalog, pg_temp AS $$
DECLARE v uuid := gen_random_uuid();
BEGIN
  INSERT INTO twin.envelope_events (event_id, scope, tenant_id, domain_id, event, twin_id, run_id, method_ref, actor_principal_id, details, correlation_id)
  VALUES (v, 'DOMAIN', p_tenant, p_domain, p_event, p_twin, p_run, p_model, p_actor, coalesce(p_details, '{}'::jsonb), p_correlation);
  RETURN v;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION twin.ten_event(uuid, uuid, text, uuid, uuid, text, uuid, jsonb, uuid) FROM PUBLIC;

/* The holder of a DOMAIN role (an unrevoked binding in this tenant and domain). */
CREATE OR REPLACE FUNCTION twin.ten_holds(p_actor uuid, p_tenant uuid, p_domain uuid, p_role text) RETURNS boolean
SECURITY DEFINER SET search_path = identity, pg_catalog, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM identity.role_bindings rb WHERE rb.principal_id = p_actor AND rb.revoked_at IS NULL AND rb.role_code = p_role
                   AND rb.scope = 'DOMAIN' AND rb.tenant_id = p_tenant AND rb.domain_id = p_domain)
$$ LANGUAGE sql STABLE;
REVOKE ALL ON FUNCTION twin.ten_holds(uuid, uuid, uuid, text) FROM PUBLIC;

/* The NOTICE (the 0099 sio_notify idiom): an attention item of the class twin.envelope, owned by a person (open when an active human, else
   unrouted) and routed to roles (open when a holder exists, else unrouted); its cause the envelope_events row. */
CREATE OR REPLACE FUNCTION twin.ten_notify(p_tenant uuid, p_domain uuid, p_subject_kind text, p_subject uuid, p_title text, p_reasons jsonb, p_owner uuid, p_roles text[],
                                           p_cause_event uuid, p_details jsonb, p_due interval, p_actor uuid, p_correlation uuid) RETURNS uuid
SECURITY DEFINER SET search_path = executive, identity, decision, pg_catalog, pg_temp AS $$
DECLARE v_item uuid := gen_random_uuid(); v_state text; v_due timestamptz := clock_timestamp() + p_due;
BEGIN
  v_state := CASE WHEN p_owner IS NOT NULL AND decision.is_active_human(p_owner, p_tenant) THEN 'open'
                  WHEN executive.role_holders(p_tenant, p_domain, p_roles) > 0 THEN 'open' ELSE 'unrouted' END;
  INSERT INTO executive.attention_items (item_id, scope, tenant_id, domain_id, signal_class, subject_kind, subject_id, cause_event_id, cause_event_type, title, outcome, state, owner_principal_id, route_roles, evaluation, details, due_at, escalations, correlation_id)
  VALUES (v_item, 'DOMAIN', p_tenant, p_domain, 'twin.envelope', p_subject_kind, p_subject, p_cause_event, 'twin.envelope_event', left(p_title, 512), 'material', v_state, p_owner, coalesce(p_roles, '{}'),
          jsonb_build_object('outcome', 'material', 'reasons', p_reasons, 'policy_version', NULL, 'dimensions', jsonb_build_object('consequence', 'C2', 'confidence', 1)),
          coalesce(p_details, '{}'::jsonb), v_due, 0, p_correlation);
  PERFORM executive.attention_event(v_item, p_tenant, p_domain, CASE v_state WHEN 'open' THEN 'item.routed' ELSE 'item.unrouted' END, p_actor,
            jsonb_build_object('outcome', 'material', 'reasons', p_reasons, 'policy_version', NULL, 'owner', p_owner, 'route_roles', to_jsonb(coalesce(p_roles, '{}')), 'due_at', v_due,
                               'cause_event_id', p_cause_event, 'cause_event_type', 'twin.envelope_event', 'unrouted', v_state = 'unrouted'), p_correlation);
  RETURN v_item;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION twin.ten_notify(uuid, uuid, text, uuid, text, jsonb, uuid, text[], uuid, jsonb, interval, uuid, uuid) FROM PUBLIC;

/* The model's state in a domain: the lifecycle row's, else 'approved' (every model in use before B30 — default-off). */
CREATE OR REPLACE FUNCTION twin.ten_model_state(p_tenant uuid, p_domain uuid, p_model text) RETURNS text
SECURITY DEFINER SET search_path = twin, pg_catalog, pg_temp AS $$
  SELECT coalesce((SELECT m.state FROM twin.model_lifecycle m WHERE m.tenant_id = p_tenant AND m.domain_id = p_domain AND m.method_ref = p_model), 'approved')
$$ LANGUAGE sql STABLE;
REVOKE ALL ON FUNCTION twin.ten_model_state(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION twin.ten_model_state(uuid, uuid, text) TO eye_app, eye_commit;

-- ─────────────────────────────────────────────────────────────────────
-- §EN.2 THE RE-DECLARATIONS (copied whole; the change marked `B30 envelope`)
-- ─────────────────────────────────────────────────────────────────────
-- twin.envelope_ack_holder — 0081:319, copied whole. B30 envelope (F-P5-04, "only a twin owner can admit it"): the acknowledgement of an
-- envelope breach (open_run's raised threshold) is a TWIN OWNER's of the domain — no longer the domain administrator's nor the platform
-- administrator's. open_run's refusal TEXT (0092:2062-2066, not re-declared here) still names "the domain administrator" — recorded.
-- The "raised threshold" (AU-TWN-0014, V03-T-120): a run outside the envelope is admitted only under the acknowledgement of a twin owner or the domain administrator.
CREATE OR REPLACE FUNCTION twin.envelope_ack_holder(p_actor uuid, p_tenant uuid, p_domain uuid) RETURNS boolean
SET search_path = identity, pg_catalog, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM identity.role_bindings rb WHERE rb.principal_id = p_actor AND rb.revoked_at IS NULL
                   AND (/* B30 envelope: a twin owner of the domain only (was: platform_admin at PLATFORM, or domain_admin | twin_owner in the domain) */
                        rb.role_code = 'twin_owner' AND rb.scope = 'DOMAIN' AND rb.tenant_id = p_tenant AND rb.domain_id = p_domain))
$$ LANGUAGE sql STABLE;
REVOKE ALL ON FUNCTION twin.envelope_ack_holder(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION twin.envelope_ack_holder(uuid,uuid,uuid) TO eye_commit;

-- simulation.run_decision_use — 0101:3991 (§R5), copied whole. B30 envelope: the REFUSED classes `outside_envelope` (the run's own
-- contract lies outside the model's operating envelope: the behaviour is DISABLED for decision use — an exploratory admission says
-- `exploratory: true` and stays refused) and `retired` (the prelude's runs_current.retired_at, written by §EX); the DIAGNOSTIC classes
-- `model_lifecycle` (the run's model is deprecated, proposed or retired in its domain now) and `calibration_drifting` (the model's latest
-- calibration on the twin drifts for a key). Appended after the existing classes, whose order is unchanged.
/* A run's DECISION USE: `refused` (no result: opened, failed; invalidated; unfit), `diagnostic` (partial; not promoted; a live challenge;
   its branch suspended; its scenario failing coherence or quality; B35: its experiment's last checkpoint reading numerical stability
   UNSTABLE, its completion constraint check VIOLATED or INDETERMINATE), else `decision` (completed, valid, promoted, undisputed). The
   reasons name each cause {class, detail}; the label is what every read that serves the run shows. NULL when the run is not visible. */
CREATE OR REPLACE FUNCTION simulation.run_decision_use(p_run_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = simulation, prediction, pg_catalog, pg_temp AS $$
DECLARE r simulation.runs_current%ROWTYPE; v_refused jsonb := '[]'::jsonb; v_diag jsonb := '[]'::jsonb; v_live int; v_q record; v_b record; v_coh text; v_use text;
        /* B35 recommendation (0101 §R5) */ v_ck record; v_unstable text; v_cc record; /* end B35 recommendation */
        /* B30 envelope */ v_xa record; v_mstate text; v_drift text; v_extra jsonb := '{}'::jsonb; /* end B30 envelope */
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
  /* B30 envelope (F-P5-04): an outside-envelope behaviour is DISABLED for decision use — refused, never diagnostic; an exploratory admission
     by a twin owner (and a steward's concurrence) states `exploratory` and keeps it refused. A retired run (§EX) is refused. */
  IF r.envelope_state = 'outside' THEN
    SELECT a.admission_id, a.admitted_by, a.admitted_at, a.reason, a.concurred_by, a.concurred_at INTO v_xa FROM simulation.exploratory_admissions a WHERE a.run_id = p_run_id;
    v_refused := v_refused || jsonb_build_object('class', 'outside_envelope', 'detail', CASE WHEN v_xa.admission_id IS NULL
      THEN format('the run lies outside the operating envelope of %s (%s): the behaviour is DISABLED for decision use; only a twin owner may admit it as exploratory', r.model_ref, coalesce(r.envelope_ack ->> 'keys', 'keys unrecorded'))
      ELSE format('the run lies outside the operating envelope of %s (%s): admitted as EXPLORATORY by %s at %s (%s)%s — exploratory only, never decision-grade', r.model_ref, coalesce(r.envelope_ack ->> 'keys', 'keys unrecorded'),
                  v_xa.admitted_by, v_xa.admitted_at, v_xa.reason, CASE WHEN v_xa.concurred_at IS NULL THEN '; awaiting a method steward''s concurrence' ELSE format('; concurred by %s at %s', v_xa.concurred_by, v_xa.concurred_at) END) END);
    v_extra := v_extra || jsonb_build_object('exploratory', v_xa.admission_id IS NOT NULL,
                                             'exploratory_admission', CASE WHEN v_xa.admission_id IS NULL THEN NULL ELSE jsonb_build_object('admission_id', v_xa.admission_id, 'admitted_by', v_xa.admitted_by, 'admitted_at', v_xa.admitted_at,
                                                                                                                                         'reason', v_xa.reason, 'concurred_by', v_xa.concurred_by, 'concurred_at', v_xa.concurred_at) END);
  END IF;
  IF r.retired_at IS NOT NULL THEN
    v_refused := v_refused || jsonb_build_object('class', 'retired', 'detail', format('retired at %s: %s', r.retired_at, r.retire_reason));
    v_extra := v_extra || jsonb_build_object('retired_at', r.retired_at, 'retire_reason', r.retire_reason);
  END IF;
  /* end B30 envelope */
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
  /* B30 envelope (F-P5-04, V03-T-116): the model's stewardship state in the run's domain NOW (no lifecycle row = approved) and its latest
     calibration on the twin drifting for any key — both diagnostic, read at the time of asking. */
  SELECT m.state INTO v_mstate FROM twin.model_lifecycle m WHERE m.tenant_id = r.tenant_id AND m.domain_id = r.domain_id AND m.method_ref = r.model_ref;
  IF v_mstate IS NOT NULL AND v_mstate <> 'approved' THEN
    v_diag := v_diag || jsonb_build_object('class', 'model_lifecycle', 'detail', format('the behaviour model %s is %s in this domain', r.model_ref, upper(v_mstate)));
  END IF;
  SELECT string_agg(format('%s (MAPE %s, MAE %s, bias %s over %s pairs)', c.key, coalesce(c.mape::text, '—'), coalesce(c.mae::text, '—'), coalesce(c.bias::text, '—'), c.n), '; ' ORDER BY c.key) INTO v_drift
    FROM (SELECT DISTINCT ON (k.key) k.key, k.mape, k.mae, k.bias, k.n, k.drift_state FROM twin.calibrations k WHERE k.twin_id = r.twin_id AND k.method_ref = r.model_ref ORDER BY k.key, k.seq DESC) c
   WHERE c.drift_state = 'drifting';
  IF v_drift IS NOT NULL THEN
    v_diag := v_diag || jsonb_build_object('class', 'calibration_drifting', 'detail', format('the latest calibration of %s on this twin DRIFTS: %s', r.model_ref, v_drift));
  END IF;
  /* end B30 envelope */
  v_use := CASE WHEN jsonb_array_length(v_refused) > 0 THEN 'refused' WHEN jsonb_array_length(v_diag) > 0 THEN 'diagnostic' ELSE 'decision' END;
  RETURN jsonb_build_object('run_id', r.run_id, 'use', v_use, 'state', r.state, 'validity', r.validity, 'fitness_state', r.fitness_state, 'promotion_id', r.promotion_id, 'promoted_for', r.promoted_for,
    'reasons', v_refused || v_diag,
    'label', CASE v_use WHEN 'decision' THEN format('DECISION-GRADE: promoted as fit for "%s"', r.promoted_for)
                        WHEN 'diagnostic' THEN 'DIAGNOSTIC ONLY — not decision-active: ' || (SELECT string_agg(x ->> 'class', ', ') FROM jsonb_array_elements(v_diag) x)
                        ELSE /* B30 envelope */ CASE WHEN coalesce((v_extra ->> 'exploratory')::boolean, false) THEN 'EXPLORATORY ONLY — ' ELSE '' END /* end B30 envelope */
                             || 'REFUSED for decision use: ' || (SELECT string_agg(x ->> 'class', ', ') FROM jsonb_array_elements(v_refused) x) END,
    'partial', r.partial, 'invalidated_at', r.invalidated_at, 'invalidation', r.invalidation - 'dependants') /* B30 envelope */ || v_extra /* end B30 envelope */;
END $$;
GRANT EXECUTE ON FUNCTION simulation.run_decision_use(uuid) TO eye_app, eye_commit;

-- ─────────────────────────────────────────────────────────────────────
-- §EN.3 THE GATES (BEFORE INSERT triggers — the siv_run_* precedent; no existing port re-declared)
-- ─────────────────────────────────────────────────────────────────────
/* THE RAISED THRESHOLD at promotion: an outside-envelope run is promoted only after a twin owner's exploratory admission AND a method
   steward's concurrence. Inside, unchecked and unrecorded runs pass untouched (default-off). */
CREATE OR REPLACE FUNCTION simulation.ten_exploratory_promotion() RETURNS trigger
SECURITY DEFINER SET search_path = simulation, pg_catalog, pg_temp AS $$
DECLARE v_env text; v_xa record;
BEGIN
  SELECT r.envelope_state INTO v_env FROM simulation.runs_current r WHERE r.run_id = NEW.run_id;
  IF v_env IS DISTINCT FROM 'outside' THEN RETURN NEW; END IF;
  SELECT a.admission_id, a.concurred_at INTO v_xa FROM simulation.exploratory_admissions a WHERE a.run_id = NEW.run_id;
  IF v_xa.admission_id IS NULL THEN
    RAISE EXCEPTION 'exploratory admission rejected (unconcurred): run % lies outside its operating envelope and is disabled for decision use; it is promoted only after a twin owner admits it as exploratory and a method steward concurs', NEW.run_id USING ERRCODE = '22023';
  END IF;
  IF v_xa.concurred_at IS NULL THEN
    RAISE EXCEPTION 'exploratory admission rejected (unconcurred): run % was admitted as exploratory (admission %) but no method steward has concurred; the promotion waits for the second named human', NEW.run_id, v_xa.admission_id USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER ten_exploratory_promotion BEFORE INSERT ON simulation.promotions FOR EACH ROW EXECUTE FUNCTION simulation.ten_exploratory_promotion();

/* THE MODEL'S LIFECYCLE at opening: a RETIRED model (in the run's domain) or one declared INCOMPATIBLE with the twin's kind refuses the run;
   a DEPRECATED or merely PROPOSED one is MARKED in the ledger (the decision use reads the state at the time of asking). No row → nothing. */
CREATE OR REPLACE FUNCTION simulation.ten_model_lifecycle() RETURNS trigger
SECURITY DEFINER SET search_path = simulation, twin, pg_catalog, pg_temp AS $$
DECLARE m twin.model_lifecycle%ROWTYPE; v_kind text; v_compat jsonb;
BEGIN
  SELECT * INTO m FROM twin.model_lifecycle x WHERE x.tenant_id = NEW.tenant_id AND x.domain_id = NEW.domain_id AND x.method_ref = NEW.model_ref;
  IF NOT FOUND THEN RETURN NEW; END IF;
  IF m.state = 'retired' THEN
    RAISE EXCEPTION 'behaviour model rejected (state): % is RETIRED in this domain (by %, at %: %); a run on a retired model is refused — a method steward re-proposes it, or the twin binds another model', NEW.model_ref, m.steward_principal_id, m.updated_at, m.reason USING ERRCODE = '22023';
  END IF;
  SELECT t.kind INTO v_kind FROM twin.twins_current t WHERE t.twin_id = NEW.twin_id;
  v_compat := m.compatibility -> v_kind;
  IF v_compat IS NOT NULL AND (v_compat ->> 'compatible') = 'false' THEN
    RAISE EXCEPTION 'behaviour model rejected (incompatible): % is declared INCOMPATIBLE with the twin kind % (by %: %); the run is refused', NEW.model_ref, v_kind, v_compat ->> 'declared_by', v_compat ->> 'note' USING ERRCODE = '22023';
  END IF;
  IF m.state IN ('deprecated', 'proposed') THEN
    PERFORM twin.ten_event(NEW.tenant_id, NEW.domain_id, 'run.model_marked', NEW.twin_id, NEW.run_id, NEW.model_ref, NEW.operator_principal_id,
                           jsonb_build_object('model_state', m.state, 'reason', m.reason, 'steward', m.steward_principal_id, 'lifecycle_version', m.version), NEW.correlation_id);
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER ten_model_lifecycle BEFORE INSERT ON simulation.runs_current FOR EACH ROW EXECUTE FUNCTION simulation.ten_model_lifecycle();

-- ─────────────────────────────────────────────────────────────────────
-- §EN.4 THE PORTS
-- ─────────────────────────────────────────────────────────────────────
/* ADMIT AS EXPLORATORY (twin.envelope.admit): a twin owner — the twin's own owner or a twin owner of the domain; never the domain
   administrator — admits a FINISHED outside-envelope run as exploratory, with a reason; the run stays refused for decision use. The method
   stewards are asked to concur (twin.envelope). */
CREATE OR REPLACE FUNCTION simulation.admit_exploratory(
  p_admission_id uuid, p_run_id uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = simulation, twin, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r simulation.runs_current%ROWTYPE; v_owner uuid; v_title text; v_keys jsonb; v_event uuid; v_item uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['twin.envelope.admit']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'exploratory admission rejected (actor): recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO r FROM simulation.runs_current x WHERE x.run_id = p_run_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'exploratory admission rejected (unknown_run): % is not a run of this domain', p_run_id USING ERRCODE = '23503'; END IF;
  SELECT t.owner_principal_id, t.title INTO v_owner, v_title FROM twin.twins_current t WHERE t.twin_id = r.twin_id;
  IF NOT (p_actor = v_owner OR twin.envelope_ack_holder(p_actor, p_tenant, p_domain)) THEN
    RAISE EXCEPTION 'exploratory admission rejected (ownership): only a twin owner admits an outside-envelope run as exploratory — the twin''s own owner or a twin owner of this domain; a domain administrator, an operator or a steward does not (the raised threshold)' USING ERRCODE = '42501';
  END IF;
  IF r.state NOT IN ('completed', 'partial') THEN
    RAISE EXCEPTION 'exploratory admission rejected (state): run % is %; only a finished run is admitted as exploratory', p_run_id, r.state USING ERRCODE = '22023';
  END IF;
  IF r.envelope_state <> 'outside' THEN
    RAISE EXCEPTION 'exploratory admission rejected (state): run % reads % against the operating envelope of %; only an outside-envelope run is disabled for decision use and admitted as exploratory', p_run_id,
      upper(r.envelope_state), r.model_ref USING ERRCODE = '22023';
  END IF;
  IF r.validity = 'invalidated' THEN RAISE EXCEPTION 'exploratory admission rejected (state): run % is invalidated; an invalidated result is not admitted', p_run_id USING ERRCODE = '22023'; END IF;
  IF r.retired_at IS NOT NULL THEN RAISE EXCEPTION 'exploratory admission rejected (state): run % was retired at %', p_run_id, r.retired_at USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM simulation.exploratory_admissions a WHERE a.run_id = p_run_id) THEN
    RAISE EXCEPTION 'exploratory admission rejected (duplicate): run % was admitted as exploratory already; an admission is recorded once', p_run_id USING ERRCODE = '22023';
  END IF;
  IF coalesce(length(btrim(p_reason)), 0) < 8 THEN RAISE EXCEPTION 'exploratory admission rejected (reason): an admission states its reason (at least 8 characters)' USING ERRCODE = '22023'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('key', k, 'value', x -> 'value', 'range', x -> 'range', 'source', x -> 'source') ORDER BY k), '[]'::jsonb) INTO v_keys
    FROM jsonb_each(coalesce(r.envelope_check -> 'keys', '{}'::jsonb)) e(k, x) WHERE (x ->> 'verdict') = 'outside';
  INSERT INTO simulation.exploratory_admissions (admission_id, scope, tenant_id, domain_id, run_id, twin_id, twin_version, model_ref, keys, reason, admitted_by, correlation_id)
  VALUES (p_admission_id, 'DOMAIN', p_tenant, p_domain, p_run_id, r.twin_id, r.twin_version, r.model_ref, v_keys, btrim(p_reason), p_actor, p_correlation);
  v_event := twin.ten_event(p_tenant, p_domain, 'exploratory.admitted', r.twin_id, p_run_id, r.model_ref, p_actor,
                            jsonb_build_object('admission_id', p_admission_id, 'keys', v_keys, 'reason', btrim(p_reason), 'operator', r.operator_principal_id), p_correlation);
  v_item := twin.ten_notify(p_tenant, p_domain, 'run', p_run_id, format('Outside-envelope run on %s admitted as exploratory — awaiting a method steward''s concurrence', v_title),
                            jsonb_build_array(jsonb_build_object('class', 'outside_envelope', 'detail', 'admitted as exploratory by a twin owner; promotion waits for a method steward''s concurrence')),
                            NULL, ARRAY['method_steward'], v_event, jsonb_build_object('run_id', p_run_id, 'twin_id', r.twin_id, 'admission_id', p_admission_id, 'model_ref', r.model_ref, 'synthetic', true),
                            interval '3 days', p_actor, p_correlation);
  RETURN jsonb_build_object('admission_id', p_admission_id, 'run_id', p_run_id, 'twin_id', r.twin_id, 'twin_version', r.twin_version, 'model_ref', r.model_ref, 'keys', v_keys,
                            'reason', btrim(p_reason), 'admitted_by', p_actor, 'attention_item_id', v_item, 'decision_use', simulation.run_decision_use(p_run_id));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION simulation.admit_exploratory(uuid, uuid, uuid, uuid, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION simulation.admit_exploratory(uuid, uuid, uuid, uuid, text, uuid, uuid) TO eye_commit;

/* CONCUR (twin.envelope.concur): the SECOND named human — a method steward of the domain, neither the admitter nor the run's operator —
   concurs with the exploratory admission; only then may the run be promoted (ten_exploratory_promotion). It stays refused for decision. */
CREATE OR REPLACE FUNCTION simulation.concur_exploratory(
  p_run_id uuid, p_tenant uuid, p_domain uuid, p_note text, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = simulation, twin, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE a simulation.exploratory_admissions%ROWTYPE; v_operator uuid; v_at timestamptz := clock_timestamp();
BEGIN
  PERFORM observation.assert_authority(ARRAY['twin.envelope.concur']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'exploratory admission rejected (actor): recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO a FROM simulation.exploratory_admissions x WHERE x.run_id = p_run_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'exploratory admission rejected (unknown_admission): run % has no exploratory admission in this domain; a twin owner admits it first', p_run_id USING ERRCODE = '23503'; END IF;
  IF NOT twin.ten_holds(p_actor, p_tenant, p_domain, 'method_steward') THEN
    RAISE EXCEPTION 'exploratory admission rejected (authority): a concurrence is a method steward''s of this domain' USING ERRCODE = '42501';
  END IF;
  SELECT r.operator_principal_id INTO v_operator FROM simulation.runs_current r WHERE r.run_id = p_run_id;
  IF p_actor = a.admitted_by OR p_actor = v_operator THEN
    RAISE EXCEPTION 'exploratory admission rejected (separation_of_duties): the concurrence is a second named human''s — neither the twin owner who admitted run % nor its operator', p_run_id USING ERRCODE = '42501';
  END IF;
  IF a.concurred_at IS NOT NULL THEN
    RAISE EXCEPTION 'exploratory admission rejected (duplicate): the admission of run % was concurred already (by %, at %)', p_run_id, a.concurred_by, a.concurred_at USING ERRCODE = '22023';
  END IF;
  IF coalesce(length(btrim(p_note)), 0) < 8 THEN RAISE EXCEPTION 'exploratory admission rejected (note): a concurrence states its note (at least 8 characters)' USING ERRCODE = '22023'; END IF;
  UPDATE simulation.exploratory_admissions SET concurred_by = p_actor, concurred_at = v_at, concurrence_note = btrim(p_note) WHERE admission_id = a.admission_id;
  PERFORM twin.ten_event(p_tenant, p_domain, 'exploratory.concurred', a.twin_id, p_run_id, a.model_ref, p_actor,
                         jsonb_build_object('admission_id', a.admission_id, 'admitted_by', a.admitted_by, 'note', btrim(p_note)), p_correlation);
  RETURN jsonb_build_object('admission_id', a.admission_id, 'run_id', p_run_id, 'admitted_by', a.admitted_by, 'concurred_by', p_actor, 'concurred_at', v_at, 'note', btrim(p_note),
                            'decision_use', simulation.run_decision_use(p_run_id));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION simulation.concur_exploratory(uuid, uuid, uuid, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION simulation.concur_exploratory(uuid, uuid, uuid, text, uuid, uuid) TO eye_commit;

/* The calibration rule's version (a change is a new version in a later migration; every calibration records it). */
CREATE OR REPLACE FUNCTION twin.calibration_rule() RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT '{"version": "1", "default_min_n": 3,
           "sources": {"reconciliation": "twin.reconciliations of the key (a simulated or predicted element against a later observation)",
                       "element": "a simulated or predicted element of an admitted version against the earliest OBSERVED complete element of the same key, unit and valid_from in a version admitted later",
                       "run": "a completed valid unretired CONTROL run of the model (outputs.totals.<q>, or the seeded summary median) against the earliest OBSERVED element outcome.<q>[:suffix] of an admitted actual version admitted after the run completed and observed through its horizon"},
           "metrics": {"mae": "mean |predicted - observed|", "mape": "mean |predicted - observed| / |observed| over observed <> 0", "bias": "mean (predicted - observed)"},
           "drift": "insufficient below min_n pairs (or no MAPE when the tolerance is a MAPE); drifting when the declared metric exceeds its tolerance; else stable"}'::jsonb $$;
GRANT EXECUTE ON FUNCTION twin.calibration_rule() TO eye_app, eye_commit;

/* CALIBRATE (twin.calibration.run): a named human (a twin owner, a method steward, the domain administrator) or the attention tick records
   the model's estimation error on the twin for one key against a declared tolerance; a transition INTO drifting asks the twin's owner and
   the method stewards to look (twin.envelope). Predicted values are never derived from narrative: only numeric recorded values pair. */
CREATE OR REPLACE FUNCTION twin.calibrate(
  p_calibration_id uuid, p_tenant uuid, p_domain uuid, p_twin_id uuid, p_model text, p_key text, p_tolerance jsonb, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = twin, simulation, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE t twin.twins_current%ROWTYPE; v_tol jsonb; v_min int; v_pairs jsonb; v_n int; v_mae numeric; v_mape numeric; v_bias numeric; v_n_mape int;
        v_state text; v_prior text; v_seq int; v_metric text; v_event uuid; v_item uuid; v_q text; v_synth boolean;
BEGIN
  PERFORM observation.assert_authority(ARRAY['twin.calibration.run']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'calibration rejected (actor): recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO t FROM twin.twins_current x WHERE x.twin_id = p_twin_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'calibration rejected (unknown_twin): % is not a twin of this domain', p_twin_id USING ERRCODE = '23503'; END IF;
  IF NOT EXISTS (SELECT 1 FROM twin.behaviour_models b WHERE b.method_ref = p_model) THEN
    RAISE EXCEPTION 'calibration rejected (unknown_model): % is not a registered behaviour model', p_model USING ERRCODE = '23503';
  END IF;
  IF p_model <> t.behaviour_model_ref AND NOT EXISTS (SELECT 1 FROM twin.twin_method_bindings mb WHERE mb.twin_id = p_twin_id AND mb.model_ref = p_model AND mb.state = 'active') THEN
    RAISE EXCEPTION 'calibration rejected (model): % is neither the behaviour model of twin % (%) nor bound to it', p_model, p_twin_id, t.behaviour_model_ref USING ERRCODE = '22023';
  END IF;
  IF p_key IS NULL OR p_key !~ '^[a-z][a-z0-9_.-]*(:[A-Za-z0-9_.-]+)?$' THEN RAISE EXCEPTION 'calibration rejected (key): % is not an element key', coalesce(p_key, 'null') USING ERRCODE = '22023'; END IF;
  -- the tolerance: exactly one of mape (0 < x <= 10) or mae (> 0); min_n an integer 2..1000 (default the rule's)
  IF p_tolerance IS NULL OR jsonb_typeof(p_tolerance) <> 'object' OR ((p_tolerance ? 'mape') = (p_tolerance ? 'mae'))
     OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_tolerance) k WHERE k NOT IN ('mape', 'mae', 'min_n')) THEN
    RAISE EXCEPTION 'calibration rejected (tolerance): a tolerance declares exactly one of mape or mae, and optionally min_n' USING ERRCODE = '22023';
  END IF;
  v_metric := CASE WHEN p_tolerance ? 'mape' THEN 'mape' ELSE 'mae' END;
  IF jsonb_typeof(p_tolerance -> v_metric) <> 'number' OR (p_tolerance ->> v_metric)::numeric <= 0 OR (v_metric = 'mape' AND (p_tolerance ->> 'mape')::numeric > 10) THEN
    RAISE EXCEPTION 'calibration rejected (tolerance): the % tolerance is a positive number%', v_metric, CASE WHEN v_metric = 'mape' THEN ' no greater than 10 (a fraction: 0.2 is 20 %)' ELSE '' END USING ERRCODE = '22023';
  END IF;
  IF p_tolerance ? 'min_n' AND (jsonb_typeof(p_tolerance -> 'min_n') <> 'number' OR (p_tolerance ->> 'min_n')::numeric <> trunc((p_tolerance ->> 'min_n')::numeric) OR (p_tolerance ->> 'min_n')::numeric NOT BETWEEN 2 AND 1000) THEN
    RAISE EXCEPTION 'calibration rejected (tolerance): min_n is an integer from 2 to 1000' USING ERRCODE = '22023';
  END IF;
  v_min := coalesce((p_tolerance ->> 'min_n')::int, (twin.calibration_rule() ->> 'default_min_n')::int);
  v_tol := jsonb_build_object(v_metric, (p_tolerance ->> v_metric)::numeric, 'min_n', v_min);
  v_q := CASE WHEN left(p_key, 8) = 'outcome.' THEN substring(split_part(p_key, ':', 1) FROM 9) END;
  WITH
  rec AS (   -- (a) the recorded reconciliations of the key (the twin's own model only)
    SELECT 'reconciliation'::text AS source, (rc.from_value::text)::numeric AS p, (rc.against_value::text)::numeric AS o,
           format('v%s (%s)', rc.from_version, rc.from_kind) AS f, format('v%s', rc.against_version) AS g, rc.from_version AS fv, rc.against_version AS av, rc.recorded_at AS at
      FROM twin.reconciliations rc
     WHERE rc.twin_id = p_twin_id AND rc.key = p_key AND p_model = t.behaviour_model_ref
       AND jsonb_typeof(rc.from_value) = 'number' AND jsonb_typeof(rc.against_value) = 'number'),
  el AS (    -- (b) a simulated/predicted element against the earliest later observed one (same key, unit, target day), not already reconciled
    SELECT DISTINCT ON (pe.version) 'element'::text AS source, (pe.value::text)::numeric AS p, (oe.value::text)::numeric AS o,
           format('v%s (%s)', pe.version, pe.kind) AS f, format('v%s', oe.version) AS g, pe.version AS fv, oe.version AS av, ov.admitted_at AS at
      FROM twin.state_elements pe
      JOIN twin.twin_versions pv ON pv.twin_id = pe.twin_id AND pv.version = pe.version AND pv.state = 'admitted'
      JOIN twin.state_elements oe ON oe.twin_id = pe.twin_id AND oe.key = pe.key AND oe.kind = 'observed' AND oe.health = 'complete'
                                  AND oe.unit IS NOT DISTINCT FROM pe.unit AND oe.valid_from IS NOT DISTINCT FROM pe.valid_from AND jsonb_typeof(oe.value) = 'number'
      JOIN twin.twin_versions ov ON ov.twin_id = oe.twin_id AND ov.version = oe.version AND ov.state = 'admitted' AND ov.admitted_at > pv.admitted_at
     WHERE pe.twin_id = p_twin_id AND pe.key = p_key AND pe.kind IN ('simulated', 'predicted') AND jsonb_typeof(pe.value) = 'number' AND p_model = t.behaviour_model_ref
       AND NOT EXISTS (SELECT 1 FROM rec WHERE rec.fv = pe.version AND rec.av = oe.version)
     ORDER BY pe.version, ov.admitted_at, oe.version),
  rn AS (    -- (c) a control run's own quantity against the earliest later observed outcome of it
    SELECT DISTINCT ON (r.run_id) 'run'::text AS source,
           coalesce(CASE WHEN r.outputs -> 'stochastic' ->> 'mode' = 'seeded' THEN (r.outputs -> 'stochastic' -> 'summary' -> v_q ->> 'median') END, r.outputs -> 'totals' ->> v_q)::numeric AS p,
           (oe.value::text)::numeric AS o, format('run %s', r.run_id) AS f, format('v%s', oe.version) AS g, NULL::int AS fv, oe.version AS av, ov.admitted_at AS at
      FROM simulation.runs_current r
      JOIN twin.twin_versions ov ON ov.twin_id = r.twin_id AND ov.branch_id = 'actual' AND ov.state = 'admitted' AND ov.admitted_at > r.completed_at
                                AND ov.observed_through >= CASE WHEN (r.outputs -> 'horizon' ->> 'to') ~ '^\d{4}-\d{2}-\d{2}$' THEN (r.outputs -> 'horizon' ->> 'to')::date END
      JOIN twin.state_elements oe ON oe.twin_id = ov.twin_id AND oe.version = ov.version AND oe.kind = 'observed' AND oe.health = 'complete' AND jsonb_typeof(oe.value) = 'number'
                                  AND (oe.key = p_key OR (position(':' IN p_key) = 0 AND left(oe.key, length(p_key) + 1) = p_key || ':'))
     WHERE v_q IS NOT NULL AND r.twin_id = p_twin_id AND r.model_ref = p_model AND r.run_kind = 'control' AND r.state = 'completed' AND r.validity = 'valid' AND r.retired_at IS NULL
       AND (r.outputs -> 'horizon' ->> 'to') ~ '^\d{4}-\d{2}-\d{2}$'
       AND coalesce(CASE WHEN r.outputs -> 'stochastic' ->> 'mode' = 'seeded' THEN (r.outputs -> 'stochastic' -> 'summary' -> v_q ->> 'median') END, r.outputs -> 'totals' ->> v_q) ~ '^-?[0-9]+(\.[0-9]+)?$'
     ORDER BY r.run_id, ov.admitted_at, oe.version),
  allp AS (SELECT * FROM rec UNION ALL SELECT * FROM el UNION ALL SELECT * FROM rn)
  SELECT coalesce(jsonb_agg(jsonb_build_object('source', source, 'predicted', round(p, 6), 'observed', round(o, 6), 'error', round(p - o, 6), 'from', f, 'against', g) ORDER BY at, source, f), '[]'::jsonb),
         count(*)::int, round(avg(abs(p - o)), 6), round(avg(abs(p - o) / abs(o)) FILTER (WHERE o <> 0), 6), round(avg(p - o), 6), (count(*) FILTER (WHERE o <> 0))::int
    INTO v_pairs, v_n, v_mae, v_mape, v_bias, v_n_mape
    FROM allp;
  v_state := CASE WHEN v_n < v_min THEN 'insufficient'
                  WHEN v_metric = 'mape' AND (v_mape IS NULL OR v_n_mape < v_min) THEN 'insufficient'
                  WHEN v_metric = 'mape' AND v_mape > (v_tol ->> 'mape')::numeric THEN 'drifting'
                  WHEN v_metric = 'mae' AND v_mae > (v_tol ->> 'mae')::numeric THEN 'drifting'
                  ELSE 'stable' END;
  SELECT c.drift_state, c.seq INTO v_prior, v_seq FROM twin.calibrations c WHERE c.twin_id = p_twin_id AND c.method_ref = p_model AND c.key = p_key ORDER BY c.seq DESC LIMIT 1;
  v_seq := coalesce(v_seq, 0) + 1;
  v_synth := t.synthetic_state;
  INSERT INTO twin.calibrations (calibration_id, scope, tenant_id, domain_id, method_ref, twin_id, key, seq, pairs, n, mae, mape, bias, tolerance, drift_state, prior_state, rule_version, synthetic_state, calibrated_by, correlation_id)
  VALUES (p_calibration_id, 'DOMAIN', p_tenant, p_domain, p_model, p_twin_id, p_key, v_seq, v_pairs, v_n, v_mae, v_mape, v_bias, v_tol, v_state, v_prior, twin.calibration_rule() ->> 'version', v_synth, p_actor, p_correlation);
  v_event := twin.ten_event(p_tenant, p_domain, 'calibration.recorded', p_twin_id, NULL, p_model, p_actor,
                            jsonb_build_object('calibration_id', p_calibration_id, 'key', p_key, 'seq', v_seq, 'n', v_n, 'mae', v_mae, 'mape', v_mape, 'bias', v_bias, 'tolerance', v_tol, 'drift_state', v_state, 'prior_state', v_prior), p_correlation);
  IF v_state = 'drifting' AND v_prior IS DISTINCT FROM 'drifting' THEN
    v_item := twin.ten_notify(p_tenant, p_domain, 'twin', p_twin_id, format('%s drifts on %s for %s (%s %s over tolerance %s)', p_model, t.title, p_key, upper(v_metric),
                                                                            CASE v_metric WHEN 'mape' THEN v_mape ELSE v_mae END, v_tol ->> v_metric),
                              jsonb_build_array(jsonb_build_object('class', 'calibration_drifting', 'detail', format('%s pairs; MAE %s, MAPE %s, bias %s', v_n, v_mae, coalesce(v_mape::text, '—'), v_bias))),
                              t.owner_principal_id, ARRAY['method_steward'], v_event,
                              jsonb_build_object('twin_id', p_twin_id, 'model_ref', p_model, 'key', p_key, 'calibration_id', p_calibration_id, 'synthetic', v_synth), interval '7 days', p_actor, p_correlation);
  END IF;
  RETURN jsonb_build_object('calibration_id', p_calibration_id, 'twin_id', p_twin_id, 'model_ref', p_model, 'key', p_key, 'seq', v_seq, 'pairs', v_pairs, 'n', v_n, 'mae', v_mae, 'mape', v_mape, 'bias', v_bias,
                            'tolerance', v_tol, 'drift_state', v_state, 'prior_state', v_prior, 'rule_version', twin.calibration_rule() ->> 'version', 'synthetic_state', v_synth,
                            'calibrated_by', p_actor, 'attention_item_id', v_item);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION twin.calibrate(uuid, uuid, uuid, uuid, text, text, jsonb, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION twin.calibrate(uuid, uuid, uuid, uuid, text, text, jsonb, uuid, uuid) TO eye_commit;

/* SET THE MODEL'S STATE (twin.model.lifecycle): a method steward of the domain moves the model along proposed → approved → deprecated →
   retired (deprecated → approved restores; a retired model is re-proposed, never revived; an approval of a proposal is by another steward). */
CREATE OR REPLACE FUNCTION twin.set_model_state(
  p_lifecycle_id uuid, p_tenant uuid, p_domain uuid, p_model text, p_state text, p_reason text, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = twin, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE m twin.model_lifecycle%ROWTYPE; v_from text; v_found boolean;
BEGIN
  PERFORM observation.assert_authority(ARRAY['twin.model.lifecycle']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'behaviour model rejected (actor): recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM twin.behaviour_models b WHERE b.method_ref = p_model) THEN
    RAISE EXCEPTION 'behaviour model rejected (unknown_model): % is not a registered behaviour model', coalesce(p_model, 'null') USING ERRCODE = '23503';
  END IF;
  IF NOT twin.ten_holds(p_actor, p_tenant, p_domain, 'method_steward') THEN
    RAISE EXCEPTION 'behaviour model rejected (authority): a behaviour model''s lifecycle is set by a method steward of this domain' USING ERRCODE = '42501';
  END IF;
  IF p_state IS NULL OR p_state NOT IN ('proposed', 'approved', 'deprecated', 'retired') THEN
    RAISE EXCEPTION 'behaviour model rejected (lifecycle_state): a state is proposed, approved, deprecated or retired' USING ERRCODE = '22023';
  END IF;
  IF coalesce(length(btrim(p_reason)), 0) < 8 THEN RAISE EXCEPTION 'behaviour model rejected (reason): a lifecycle change states its reason (at least 8 characters)' USING ERRCODE = '22023'; END IF;
  SELECT * INTO m FROM twin.model_lifecycle x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.method_ref = p_model FOR UPDATE;
  v_found := FOUND;
  v_from := CASE WHEN v_found THEN m.state ELSE 'approved' END;
  IF NOT ((v_from = 'proposed' AND p_state IN ('approved', 'retired')) OR (v_from = 'approved' AND p_state = 'deprecated')
          OR (v_from = 'deprecated' AND p_state IN ('approved', 'retired')) OR (v_from = 'retired' AND p_state = 'proposed')) THEN
    RAISE EXCEPTION 'behaviour model rejected (state): % is % in this domain; % → % is not a lifecycle step (proposed → approved | retired; approved → deprecated; deprecated → approved | retired; retired → proposed)',
      p_model, upper(v_from), v_from, p_state USING ERRCODE = '22023';
  END IF;
  IF v_from = 'proposed' AND p_state = 'approved' AND m.proposed_by = p_actor THEN
    RAISE EXCEPTION 'behaviour model rejected (separation_of_duties): the steward who proposed % does not approve it; another method steward approves', p_model USING ERRCODE = '42501';
  END IF;
  IF v_found THEN
    UPDATE twin.model_lifecycle SET state = p_state, steward_principal_id = p_actor, reason = btrim(p_reason), version = m.version + 1, updated_at = clock_timestamp(), correlation_id = p_correlation,
           proposed_by = CASE WHEN p_state = 'proposed' THEN p_actor ELSE m.proposed_by END, approved_by = CASE WHEN p_state = 'approved' THEN p_actor ELSE m.approved_by END
     WHERE lifecycle_id = m.lifecycle_id;
  ELSE
    INSERT INTO twin.model_lifecycle (lifecycle_id, scope, tenant_id, domain_id, method_ref, state, steward_principal_id, proposed_by, approved_by, reason, version, correlation_id)
    VALUES (p_lifecycle_id, 'DOMAIN', p_tenant, p_domain, p_model, p_state, p_actor, CASE WHEN p_state = 'proposed' THEN p_actor END, CASE WHEN p_state = 'approved' THEN p_actor END, btrim(p_reason), 1, p_correlation);
  END IF;
  SELECT * INTO m FROM twin.model_lifecycle x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.method_ref = p_model;
  PERFORM twin.ten_event(p_tenant, p_domain, 'model.state_set', NULL, NULL, p_model, p_actor, jsonb_build_object('from', v_from, 'to', p_state, 'reason', btrim(p_reason), 'version', m.version), p_correlation);
  RETURN to_jsonb(m) || jsonb_build_object('from', v_from);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION twin.set_model_state(uuid, uuid, uuid, text, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION twin.set_model_state(uuid, uuid, uuid, text, text, text, uuid, uuid) TO eye_commit;

/* DECLARE COMPATIBILITY (twin.model.lifecycle): a method steward declares the model compatible or INCOMPATIBLE with a twin kind, with a note;
   an incompatible declaration refuses runs of that model on twins of that kind (ten_model_lifecycle). No lifecycle row yet → one is opened
   as approved (the model's state before B30). */
CREATE OR REPLACE FUNCTION twin.declare_compatibility(
  p_lifecycle_id uuid, p_tenant uuid, p_domain uuid, p_model text, p_kind text, p_compatible boolean, p_note text, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = twin, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE m twin.model_lifecycle%ROWTYPE; v_decl jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['twin.model.lifecycle']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'behaviour model rejected (actor): recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM twin.behaviour_models b WHERE b.method_ref = p_model) THEN
    RAISE EXCEPTION 'behaviour model rejected (unknown_model): % is not a registered behaviour model', coalesce(p_model, 'null') USING ERRCODE = '23503';
  END IF;
  IF NOT twin.ten_holds(p_actor, p_tenant, p_domain, 'method_steward') THEN
    RAISE EXCEPTION 'behaviour model rejected (authority): a compatibility declaration is a method steward''s of this domain' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM twin.twin_kind_schemas k WHERE k.kind = p_kind AND (k.tenant_id IS NULL OR (k.tenant_id = p_tenant AND (k.domain_id IS NULL OR k.domain_id = p_domain)))) THEN
    RAISE EXCEPTION 'behaviour model rejected (unknown_kind): % is not a twin kind of this domain', coalesce(p_kind, 'null') USING ERRCODE = '23503';
  END IF;
  IF p_compatible IS NULL THEN RAISE EXCEPTION 'behaviour model rejected (compatible): a declaration says compatible true or false' USING ERRCODE = '22023'; END IF;
  IF coalesce(length(btrim(p_note)), 0) < 8 THEN RAISE EXCEPTION 'behaviour model rejected (note): a compatibility declaration states its note (at least 8 characters)' USING ERRCODE = '22023'; END IF;
  v_decl := jsonb_build_object('compatible', p_compatible, 'note', btrim(p_note), 'declared_by', p_actor, 'declared_at', clock_timestamp());
  SELECT * INTO m FROM twin.model_lifecycle x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.method_ref = p_model FOR UPDATE;
  IF FOUND THEN
    UPDATE twin.model_lifecycle SET compatibility = m.compatibility || jsonb_build_object(p_kind, v_decl), version = m.version + 1, updated_at = clock_timestamp(), correlation_id = p_correlation
     WHERE lifecycle_id = m.lifecycle_id;
  ELSE
    INSERT INTO twin.model_lifecycle (lifecycle_id, scope, tenant_id, domain_id, method_ref, state, steward_principal_id, reason, compatibility, version, correlation_id)
    VALUES (p_lifecycle_id, 'DOMAIN', p_tenant, p_domain, p_model, 'approved', p_actor, 'in use before its stewardship was recorded (B30): approved', jsonb_build_object(p_kind, v_decl), 1, p_correlation);
  END IF;
  SELECT * INTO m FROM twin.model_lifecycle x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.method_ref = p_model;
  PERFORM twin.ten_event(p_tenant, p_domain, 'model.compatibility_declared', NULL, NULL, p_model, p_actor, jsonb_build_object('kind', p_kind) || v_decl || jsonb_build_object('version', m.version), p_correlation);
  RETURN to_jsonb(m);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION twin.declare_compatibility(uuid, uuid, uuid, text, text, boolean, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION twin.declare_compatibility(uuid, uuid, uuid, text, text, boolean, text, uuid, uuid) TO eye_commit;

-- ─────────────────────────────────────────────────────────────────────
-- §EN.5 THE READS
-- ─────────────────────────────────────────────────────────────────────
/* THE CALIBRATION READ (invoker; RLS): per model × key the latest calibration and its history length; the model-fitness roll-up (the worst
   drift state, the pairs). NULL-free: an empty object when nothing was calibrated. */
CREATE OR REPLACE FUNCTION twin.calibration_read(p_twin_id uuid, p_model text DEFAULT NULL) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = twin, pg_catalog, pg_temp AS $$
  WITH latest AS (
    SELECT DISTINCT ON (c.method_ref, c.key) c.* FROM twin.calibrations c
     WHERE c.twin_id = p_twin_id AND (p_model IS NULL OR c.method_ref = p_model) ORDER BY c.method_ref, c.key, c.seq DESC)
  SELECT jsonb_build_object(
    'twin_id', p_twin_id, 'rule', twin.calibration_rule(),
    'latest', coalesce((SELECT jsonb_agg(jsonb_build_object('calibration_id', l.calibration_id, 'model_ref', l.method_ref, 'key', l.key, 'seq', l.seq, 'n', l.n, 'mae', l.mae, 'mape', l.mape, 'bias', l.bias,
                                                            'tolerance', l.tolerance, 'drift_state', l.drift_state, 'prior_state', l.prior_state, 'pairs', l.pairs, 'synthetic_state', l.synthetic_state,
                                                            'calibrated_by', l.calibrated_by, 'calibrated_at', l.calibrated_at) ORDER BY l.method_ref, l.key) FROM latest l), '[]'::jsonb),
    'models', coalesce((SELECT jsonb_agg(jsonb_build_object('model_ref', g.method_ref, 'keys', g.keys, 'pairs', g.pairs,
                                                            'fitness', CASE WHEN g.drifting > 0 THEN 'drifting' WHEN g.stable > 0 THEN 'stable' ELSE 'insufficient' END) ORDER BY g.method_ref)
                          FROM (SELECT l.method_ref, count(*)::int keys, sum(l.n)::int pairs, count(*) FILTER (WHERE l.drift_state = 'drifting')::int drifting,
                                       count(*) FILTER (WHERE l.drift_state = 'stable')::int stable FROM latest l GROUP BY l.method_ref) g), '[]'::jsonb),
    'history', coalesce((SELECT jsonb_agg(jsonb_build_object('model_ref', c.method_ref, 'key', c.key, 'seq', c.seq, 'n', c.n, 'mae', c.mae, 'mape', c.mape, 'bias', c.bias, 'drift_state', c.drift_state,
                                                             'calibrated_at', c.calibrated_at) ORDER BY c.calibrated_at DESC, c.seq DESC)
                           FROM twin.calibrations c WHERE c.twin_id = p_twin_id AND (p_model IS NULL OR c.method_ref = p_model)), '[]'::jsonb))
$$;
REVOKE ALL ON FUNCTION twin.calibration_read(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION twin.calibration_read(uuid, text) TO eye_app, eye_commit;

/* THE AI CONTEXT (AI-28-004, AI-C028): what an AI consumer of the twin's state must be told beside the state itself — the ENVELOPE (the
   model's declared ranges and the version's own check), the STALE variables (element health stale/incomplete/unreadable, or a validity that
   ended before the database's day), the SENSITIVITY (the latest one-at-a-time analysis of a run on this version), the FITNESS (the
   version's validation, the model's calibrations and stewardship state), the runs on the version by decision use, and the served state
   when a freeze exists (the §BR seam). A guarded definer (N-01): the caller's bound tenant and domain only. NULL when no such version. */
CREATE OR REPLACE FUNCTION twin.ai_context(p_tenant uuid, p_domain uuid, p_twin_id uuid, p_version int DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = twin, simulation, observation, public, pg_catalog, pg_temp AS $$
DECLARE t twin.twins_current%ROWTYPE; v twin.twin_versions%ROWTYPE; v_now timestamptz := clock_timestamp(); v_env jsonb; v_model jsonb; v_stale jsonb; v_sens jsonb; v_val jsonb;
        v_runs jsonb; v_served jsonb := NULL; v_fresh jsonb := NULL; v_cal jsonb;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the AI context of a twin');   -- N-01
  SELECT * INTO t FROM twin.twins_current x WHERE x.twin_id = p_twin_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF p_version IS NULL THEN
    SELECT * INTO v FROM twin.twin_versions x WHERE x.twin_id = p_twin_id AND x.branch_id = 'actual' AND x.state = 'admitted' ORDER BY x.version DESC LIMIT 1;
  ELSE
    SELECT * INTO v FROM twin.twin_versions x WHERE x.twin_id = p_twin_id AND x.version = p_version;
  END IF;
  IF v.twin_id IS NULL THEN RETURN NULL; END IF;
  -- THE ENVELOPE: the model's declared ranges and the version's own check (the one rule open_run and the validation share)
  v_env := jsonb_build_object('declared', (SELECT b.operating_envelope FROM twin.behaviour_models b WHERE b.method_ref = t.behaviour_model_ref),
                              'check', twin.envelope_check(p_twin_id, v.version, '{}'::jsonb),
                              'rule', 'a behaviour outside the envelope is DISABLED for decision use (simulation.run_decision_use: refused, outside_envelope); only a twin owner admits such a run as exploratory');
  v_model := jsonb_build_object('model_ref', t.behaviour_model_ref, 'family', (SELECT b.family FROM twin.behaviour_models b WHERE b.method_ref = t.behaviour_model_ref),
                                'lifecycle_state', twin.ten_model_state(p_tenant, p_domain, t.behaviour_model_ref),
                                'compatibility', (SELECT m.compatibility -> t.kind FROM twin.model_lifecycle m WHERE m.tenant_id = p_tenant AND m.domain_id = p_domain AND m.method_ref = t.behaviour_model_ref));
  -- THE STALE VARIABLES (by the database's day)
  SELECT coalesce(jsonb_agg(jsonb_build_object('key', e.key, 'kind', e.kind, 'health', e.health, 'valid_from', e.valid_from, 'valid_to', e.valid_to, 'confidence', e.confidence,
                                               'age_days', CASE WHEN e.valid_from IS NULL THEN NULL ELSE (v_now::date - e.valid_from) END,
                                               'reason', CASE WHEN e.health <> 'complete' THEN 'health ' || e.health ELSE format('its validity ended on %s', e.valid_to) END) ORDER BY e.key), '[]'::jsonb)
    INTO v_stale FROM twin.state_elements e
   WHERE e.twin_id = p_twin_id AND e.version = v.version AND (e.health IN ('stale', 'incomplete', 'unreadable') OR (e.valid_to IS NOT NULL AND e.valid_to < v_now::date));
  -- THE SENSITIVITY: the latest analysis of a run on this version
  SELECT jsonb_build_object('analysis_id', a.analysis_id, 'run_id', a.run_id, 'metric', a.metric, 'method', a.method, 'relative', a.relative, 'base_value', a.base_value,
                            'factors', (SELECT coalesce(jsonb_agg(f ORDER BY (f ->> 'rank')::int), '[]'::jsonb) FROM jsonb_array_elements(a.factors) f WHERE (f ->> 'rank')::int <= 5),
                            'robustness_verdict', a.robustness_verdict, 'analysed_at', a.analysed_at)
    INTO v_sens FROM simulation.sensitivity_analyses a JOIN simulation.runs_current r ON r.run_id = a.run_id
   WHERE r.twin_id = p_twin_id AND r.twin_version = v.version ORDER BY a.analysed_at DESC, a.analysis_id DESC LIMIT 1;
  -- THE FITNESS: the version's latest validation, the model's calibrations on the twin
  SELECT jsonb_build_object('validation_id', x.validation_id, 'verdict', x.verdict, 'envelope_state', x.envelope_state, 'validated_at', x.validated_at)
    INTO v_val FROM twin.validations x WHERE x.twin_id = p_twin_id AND x.version = v.version ORDER BY x.validated_at DESC LIMIT 1;
  SELECT coalesce(jsonb_agg(jsonb_build_object('model_ref', c.method_ref, 'key', c.key, 'n', c.n, 'mae', c.mae, 'mape', c.mape, 'bias', c.bias, 'drift_state', c.drift_state, 'calibrated_at', c.calibrated_at) ORDER BY c.method_ref, c.key), '[]'::jsonb)
    INTO v_cal FROM (SELECT DISTINCT ON (k.method_ref, k.key) k.* FROM twin.calibrations k WHERE k.twin_id = p_twin_id ORDER BY k.method_ref, k.key, k.seq DESC) c;
  -- THE RUNS on the version by decision use
  SELECT coalesce(jsonb_agg(jsonb_build_object('run_id', r.run_id, 'run_kind', r.run_kind, 'envelope_state', r.envelope_state, 'use', u ->> 'use', 'label', u ->> 'label',
                                               'exploratory', coalesce((u ->> 'exploratory')::boolean, false)) ORDER BY r.opened_at DESC), '[]'::jsonb)
    INTO v_runs FROM (SELECT r0.*, simulation.run_decision_use(r0.run_id) AS u FROM simulation.runs_current r0 WHERE r0.twin_id = p_twin_id AND r0.twin_version = v.version ORDER BY r0.opened_at DESC LIMIT 25) r;
  -- THE SERVED STATE / FRESHNESS (§BR's seams: read only when the combined migration declares them; the integrator asserts the seam)
  IF to_regprocedure('twin.served_state(uuid,timestamp with time zone)') IS NOT NULL THEN
    BEGIN EXECUTE 'SELECT to_jsonb(twin.served_state($1, $2))' INTO v_served USING p_twin_id, v_now;
    EXCEPTION WHEN OTHERS THEN v_served := jsonb_build_object('state', 'unavailable', 'error', SQLERRM); END;
  ELSIF to_regclass('twin.snapshot_freezes') IS NULL THEN
    v_served := jsonb_build_object('state', 'seam_absent', 'note', 'no snapshot freeze is declared in this database (§BR)');
  END IF;
  IF to_regprocedure('twin.version_freshness(uuid,integer)') IS NOT NULL THEN
    BEGIN EXECUTE 'SELECT to_jsonb(twin.version_freshness($1, $2))' INTO v_fresh USING p_twin_id, v.version;
    EXCEPTION WHEN OTHERS THEN v_fresh := jsonb_build_object('state', 'unavailable', 'error', SQLERRM); END;
  END IF;
  RETURN jsonb_build_object(
    'twin_id', p_twin_id, 'title', t.title, 'kind', t.kind, 'owner_principal_id', t.owner_principal_id, 'version', v.version, 'branch_id', v.branch_id, 'state', v.state,
    'verification_state', v.verification_state, 'fitness_state', v.fitness_state, 'synthetic_state', v.synthetic_state, 'as_of', v_now,
    'cutoffs', jsonb_build_object('known_at', v.known_at, 'observed_through', v.observed_through, 'record_age_days', round(extract(epoch FROM (v_now - v.known_at)) / 86400.0, 2),
                                  'observation_age_days', CASE WHEN v.observed_through IS NULL THEN NULL ELSE (v_now::date - v.observed_through) END),
    'model', v_model, 'envelope', v_env, 'stale_variables', v_stale, 'sensitivity', v_sens,
    'fitness', jsonb_build_object('version_fitness', v.fitness_state, 'validation', v_val, 'calibrations', v_cal),
    'runs', v_runs, 'served_state', v_served, 'freshness', v_fresh,
    'instructions', jsonb_build_array(
      'Treat any behaviour outside the operating envelope as disabled for decision use; quote it as exploratory at most.',
      'Name the stale variables before relying on them; do not present a stale value as current.',
      'State the sensitivity: the top factors move the result most.',
      'Report the fitness and calibration state; a drifting or insufficient calibration is not evidence of accuracy.',
      'Every figure of a synthetic twin is SYNTHETIC.'));
END $$;
REVOKE ALL ON FUNCTION twin.ai_context(uuid, uuid, uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION twin.ai_context(uuid, uuid, uuid, int) TO eye_app, eye_commit;
