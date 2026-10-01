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
                  (SELECT CASE WHEN co.object_id IS NULL THEN 'missing' WHEN co.lifecycle_state IN ('disputed', 'contested') THEN 'disputed'
                               WHEN co.lifecycle_state IN ('withdrawn', 'revoked', 'retracted') THEN 'withdrawn' ELSE 'standing' END
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
