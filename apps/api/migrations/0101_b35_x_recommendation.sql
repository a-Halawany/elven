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
--        no run, fewer than two alternatives beside the status quo, and — through to_regclass — §E's explanation of the version); the owner
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
   status quo), explanation (§E's explanation of the version — read through to_regclass; `not_assessed` when §E is absent) — each with a
   stable key; the live recommendations; the live attestation; whether an ACKNOWLEDGED attestation names every gap (covered); the mode:
   complete | human_led | attested (awaiting the second human) | incomplete. */
CREATE OR REPLACE FUNCTION decision.recommendation_completeness(p_package_id uuid, p_version int) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = decision, simulation, prediction, pg_catalog, pg_temp AS $$
DECLARE v record; v_gaps jsonb := '[]'::jsonb; v_not jsonb := '[]'::jsonb; x jsonb; i int; rr record; o record; v_int int; v_live int; a record; v_att jsonb; v_named text[];
        v_uncovered jsonb := '[]'::jsonb; v_covered boolean := false; v_has boolean; v_mode text;
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
        v_gaps := v_gaps || jsonb_build_object('category', 'explanation', 'key', 'explanation', 'detail', format('no explanation of version %s has been generated', p_version));
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
    'complete', jsonb_array_length(v_gaps) = 0, 'gaps', v_gaps, 'not_assessed', v_not, 'live_recommendations', v_live,
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
