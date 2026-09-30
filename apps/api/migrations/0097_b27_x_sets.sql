-- ═════════════════════════════════════════════════════════════════════
-- section `sets` (§S) — the part-local file 0097_b27_x_sets.sql (combined into 0097 at integration after §A and §Q)
-- ═════════════════════════════════════════════════════════════════════
-- 0097 §S — CP-6 B27 PART S (2026-09-30): SCENARIO SETS, THE COMPARATOR AND THE PORTFOLIO REVIEW (F-P4-08; C-022, V00-T-056/-057,
-- V01-T-015, V02-T-067/-073, L7-C01/-C03/-C08, L7-I02/-I05, SCN, ADR-0013, V03-T-144/-333/-336/-340/-343, AG-020, PR-33-001/-003/-006,
-- CAP-DS-01/-02, AT-33, WS-12, JRN-13, ADR-012). Built on the prelude (§0: prediction.branch_live, the widened scenario event vocabulary,
-- the attention classes scenario.set_gap / scenario.signpost / scenario.proposal and the subject kinds branch / scenario_set) and nothing
-- else of B27: §A's elements and §Q's governed probabilities are READ by to_regclass so this part stands alone.
--
--   S.1 THE SET: prediction.scenario_sets (a title, a purpose, a named OWNER, the decision package it serves, the PLURALITY POLICY
--       {require: [kinds], min_branches, min_adverse}, draft → active → retired, versioned by membership), prediction.scenario_set_members
--       (a scenario — every live branch of it — or one branch; who added / removed it and when, in which set version),
--       prediction.scenario_set_events (the set's own append-only ledger).
--   S.2 THE PLURALITY CHECK (ADR-012): prediction.scenario_set_plurality(set) — the pure evaluation (only LIVE branches count:
--       prediction.branch_live; a suspended or closed branch and a retired scenario's are named, never counted); the recorded check
--       prediction.check_scenario_set_plurality (prediction.scenario_set_checks, append-only); a NEW gap raises `scenario.set_gap` to the set
--       owner, a passing check closes the open gap items. THE GATE: decision.package_scenario_sets binds a set to a package
--       (prediction.bind_scenario_set); a BEFORE INSERT trigger on decision.package_events for `version.proposed` refuses the proposal of a
--       package bound to a set whose check fails — `recommendation rejected (plurality): …` — without re-declaring decision.propose_version
--       (0090:4577). A refused proposal rolls back whole, so the gap ITEM is raised by the check (the owner's, the binding's, the
--       activation's, a member change on an active set), never by the refusal.
--   S.3 THE COMPARATOR (CAP-DS-02): prediction.scenario_set_compare(set) — an INVOKER read: the set's live and not-live branches side by
--       side (kind, kind label, state — suspended shown with its reason —, statement, divergence, assumptions, §A's elements when present,
--       the indicator with its freshness, the consequence and its class, §Q's governed probability when present).
--   S.4 THE PORTFOLIO REVIEW: prediction.review_scenario_portfolio — a named human's review: relevance and consequence per member, the option
--       × branch PAYOFF matrix (the bound package's options by key, or named options), per option ROBUSTNESS (the worst payoff) and
--       maximum REGRET (max over branches of best-in-branch − this option's payoff) computed HERE, the missing kinds named from the policy,
--       retirements PROPOSED (a retirement stays the scenario owner's review — the existing retire outcome).
--   S.5 LIVING SCENARIOS: prediction.score_scenario_relevance — the tick step `scenario-relevance` (order 67) and an operator's act: each
--       active scenario that is a MEMBER OF AN ACTIVE SET (the living portfolio — scenarios outside every set are not scored, so no older
--       suite's tick writes a row or an item) scored from indicator movement toward the thresholds, signposts breached and review
--       timeliness; a row only when the score or its basis changed; the scenario owner notified ONCE per signpost breach (`scenario.signpost`).
--   S.6 CREATION TRIGGERS (V03-T-343): prediction.propose_scenario — a forecast shift (a forecast whose predecessor's median moved beyond a
--       stated band), a weak signal (0088's escalated signal), a risk (0089's accepted exposure whose residual breaches its appetite), a
--       planning cycle (0094's cadence reset) — each source VALIDATED; routed as `scenario.proposal` to the domain's strategy owners;
--       prediction.resolve_scenario_proposal (accepted | dismissed with a note, by a strategy owner who did not propose it) — accepting never
--       declares a scenario (the owner declares through the existing route).
--   Refusal families: `scenario set rejected (<class>)`, `portfolio review rejected (<class>)`, `scenario proposal rejected (<class>)`,
--   `recommendation rejected (<class>)` — actor | authority | separation_of_duties → 403, unknown_* → 404, state | duplicate | plurality |
--   bound → 409, the rest → 422. Every figure a harness seeds is SYNTHETIC. Forward-only; nothing earlier edited.

-- ═════════════════════════════════════════════════════════════════════
-- §S.1 THE SET
-- ═════════════════════════════════════════════════════════════════════
/* The ADVERSE kinds of vocabulary v1 (the plurality policy's min_adverse counts live branches of these kinds). */
CREATE OR REPLACE FUNCTION prediction.scenario_set_adverse_kinds() RETURNS text[]
LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY['downside', 'disruption', 'stress', 'adversarial'] $$;
GRANT EXECUTE ON FUNCTION prediction.scenario_set_adverse_kinds() TO eye_app, eye_commit;

CREATE TABLE prediction.scenario_sets (
  set_id              uuid PRIMARY KEY,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  title               text NOT NULL CHECK (length(btrim(title)) BETWEEN 2 AND 256),
  purpose             text NOT NULL CHECK (length(btrim(purpose)) BETWEEN 8 AND 2000),
  owner_principal_id  uuid NOT NULL,
  package_id          uuid,                                   -- the decision package the set serves (named; the GATE is the binding)
  plurality_policy    jsonb NOT NULL CHECK (jsonb_typeof(plurality_policy) = 'object'),   -- {require: [kinds], min_branches, min_adverse}
  state               text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft', 'active', 'retired')),
  version             int  NOT NULL DEFAULT 1 CHECK (version >= 1),
  last_check_id       uuid,
  last_check_outcome  text CHECK (last_check_outcome IS NULL OR last_check_outcome IN ('passed', 'failed')),
  declared_by         uuid NOT NULL,
  declared_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  activated_by        uuid,
  activated_at        timestamptz,
  retired_by          uuid,
  retired_at          timestamptz,
  retirement_reason   text,
  updated_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id      uuid NOT NULL,
  CONSTRAINT pss_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT pss_activated CHECK ((activated_at IS NULL) = (activated_by IS NULL) AND (state = 'draft') = (activated_at IS NULL)),
  CONSTRAINT pss_retired CHECK ((state = 'retired') = (retired_at IS NOT NULL AND retired_by IS NOT NULL AND retirement_reason IS NOT NULL)),
  CONSTRAINT pss_checked CHECK ((last_check_id IS NULL) = (last_check_outcome IS NULL))
);
CREATE INDEX pss_domain ON prediction.scenario_sets (tenant_id, domain_id, state, declared_at DESC);
CREATE TRIGGER pss_no_delete BEFORE DELETE ON prediction.scenario_sets FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE prediction.scenario_sets IS 'B27 (0097 §S; F-P4-08, ADR-012, CAP-DS-01): a SET of scenarios and branches with a named owner, a purpose, the decision package it serves and a PLURALITY policy {require, min_branches, min_adverse}; draft → active → retired; the version moves with every membership change. Never deleted.';

CREATE TABLE prediction.scenario_set_members (
  member_id           uuid PRIMARY KEY,
  set_id              uuid NOT NULL REFERENCES prediction.scenario_sets (set_id),
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  scenario_id         uuid NOT NULL REFERENCES prediction.scenarios_current (scenario_id),
  branch_id           uuid REFERENCES prediction.branches_current (branch_id),   -- NULL: every live branch of the scenario
  added_by            uuid NOT NULL,
  added_at            timestamptz NOT NULL DEFAULT clock_timestamp(),
  added_in_version    int NOT NULL CHECK (added_in_version >= 1),
  removed_by          uuid,
  removed_at          timestamptz,
  removal_reason      text,
  removed_in_version  int,
  correlation_id      uuid NOT NULL,
  CONSTRAINT pss_member_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT pss_member_removed CHECK ((removed_at IS NULL) = (removed_by IS NULL) AND (removed_at IS NULL) = (removal_reason IS NULL) AND (removed_at IS NULL) = (removed_in_version IS NULL))
);
CREATE UNIQUE INDEX pss_member_once ON prediction.scenario_set_members (set_id, scenario_id, coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid)) WHERE removed_at IS NULL;
CREATE INDEX pss_member_scenario ON prediction.scenario_set_members (scenario_id) WHERE removed_at IS NULL;
/* A membership is written once and removed once: only the removal columns change, and only from NULL. */
CREATE OR REPLACE FUNCTION prediction.pss_member_guard() RETURNS trigger
SET search_path = prediction, pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'scenario set rejected (append_only): a membership is never deleted; it is removed with a reason' USING ERRCODE = '23514'; END IF;
  IF OLD.removed_at IS NOT NULL
     OR (to_jsonb(NEW) - ARRAY['removed_by', 'removed_at', 'removal_reason', 'removed_in_version']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['removed_by', 'removed_at', 'removal_reason', 'removed_in_version']) THEN
    RAISE EXCEPTION 'scenario set rejected (append_only): membership % is written once and removed once', OLD.member_id USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER pss_member_guard BEFORE UPDATE OR DELETE ON prediction.scenario_set_members FOR EACH ROW EXECUTE FUNCTION prediction.pss_member_guard();
COMMENT ON TABLE prediction.scenario_set_members IS 'B27 (0097 §S): the members of a scenario set — a scenario (every live branch of it) or one branch — with who added and removed them, when, and in which set version.';

CREATE TABLE prediction.scenario_set_events (
  event_id            uuid PRIMARY KEY,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  set_id              uuid NOT NULL REFERENCES prediction.scenario_sets (set_id),
  event               text NOT NULL CHECK (event IN ('set.declared', 'set.activated', 'set.retired', 'set.member_added', 'set.member_removed', 'set.checked', 'set.bound', 'set.reviewed')),
  set_version         int NOT NULL CHECK (set_version >= 1),
  actor_principal_id  uuid NOT NULL,
  details             jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id      uuid NOT NULL,
  CONSTRAINT pss_event_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX pss_event_set ON prediction.scenario_set_events (set_id, occurred_at);
CREATE TRIGGER pss_event_append_only BEFORE UPDATE OR DELETE ON prediction.scenario_set_events FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE prediction.scenario_set_events IS 'B27 (0097 §S): the scenario set''s own ledger — declared, activated, retired, members added and removed, checked, bound to a package, reviewed — append-only.';

-- ═════════════════════════════════════════════════════════════════════
-- §S.2 THE PLURALITY CHECK AND THE GATE
-- ═════════════════════════════════════════════════════════════════════
CREATE TABLE prediction.scenario_set_checks (
  check_id            uuid PRIMARY KEY,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  set_id              uuid NOT NULL REFERENCES prediction.scenario_sets (set_id),
  set_version         int NOT NULL CHECK (set_version >= 1),
  trigger             text NOT NULL CHECK (trigger IN ('operator', 'activate', 'bind', 'member')),
  outcome             text NOT NULL CHECK (outcome IN ('passed', 'failed')),
  missing_kinds       text[] NOT NULL DEFAULT ARRAY[]::text[],
  live_branches       int NOT NULL CHECK (live_branches >= 0),
  adverse_branches    int NOT NULL CHECK (adverse_branches >= 0),
  kinds_present       text[] NOT NULL DEFAULT ARRAY[]::text[],
  findings            jsonb NOT NULL CHECK (jsonb_typeof(findings) = 'array'),
  policy              jsonb NOT NULL CHECK (jsonb_typeof(policy) = 'object'),
  as_of               timestamptz NOT NULL,
  checked_by          uuid NOT NULL,
  item_id             uuid,                                   -- the scenario.set_gap item a NEW gap raised
  correlation_id      uuid NOT NULL,
  CONSTRAINT pss_check_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT pss_check_outcome CHECK (outcome = 'failed' OR cardinality(missing_kinds) = 0)
);
CREATE INDEX pss_check_set ON prediction.scenario_set_checks (set_id, as_of DESC);
CREATE TRIGGER pss_check_append_only BEFORE UPDATE OR DELETE ON prediction.scenario_set_checks FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE prediction.scenario_set_checks IS 'B27 (0097 §S; ADR-012): the recorded PLURALITY checks of a set — the outcome, the missing kinds, the live and adverse branch counts, the findings (the not-live branches named), the policy as judged, the instant — append-only.';

/* THE BINDING (a new table in the decision schema — never a column on a Phase-6 table another suite pins): a package names the scenario
   set its recommendation must be plural over; the plurality gate reads it when a version is proposed. */
CREATE TABLE decision.package_scenario_sets (
  binding_id          uuid PRIMARY KEY,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  package_id          uuid NOT NULL REFERENCES decision.packages_current (package_id),
  set_id              uuid NOT NULL REFERENCES prediction.scenario_sets (set_id),
  bound_by            uuid NOT NULL,
  bound_at            timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id      uuid NOT NULL,
  CONSTRAINT pss_binding_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE UNIQUE INDEX pss_binding_once ON decision.package_scenario_sets (package_id, set_id);
CREATE INDEX pss_binding_set ON decision.package_scenario_sets (set_id);
CREATE TRIGGER pss_binding_append_only BEFORE UPDATE OR DELETE ON decision.package_scenario_sets FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE decision.package_scenario_sets IS 'B27 (0097 §S; ADR-012): a decision package BOUND to a scenario set — a version of the package is not proposed while the set''s plurality check fails (the trigger pss_plurality_gate on decision.package_events). Append-only.';

-- ═════════════════════════════════════════════════════════════════════
-- §S.4 / §S.5 / §S.6 THE RECORDS (the portfolio reviews, the relevance scores, the proposals)
-- ═════════════════════════════════════════════════════════════════════
CREATE TABLE prediction.portfolio_reviews (
  review_id           uuid PRIMARY KEY,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  set_id              uuid NOT NULL REFERENCES prediction.scenario_sets (set_id),
  set_version         int NOT NULL CHECK (set_version >= 1),
  package_id          uuid,
  package_version     int,
  reviewer            uuid NOT NULL,
  members             jsonb NOT NULL CHECK (jsonb_typeof(members) = 'array'),        -- [{member_id, scenario_id, branch_id, relevance, consequence, note}]
  branches            jsonb NOT NULL CHECK (jsonb_typeof(branches) = 'array'),       -- the live branches the matrix is over [{branch_id, scenario_id, name, kind, kind_label}]
  options             jsonb NOT NULL CHECK (jsonb_typeof(options) = 'array'),        -- [{key, title, source}]
  payoffs             jsonb NOT NULL CHECK (jsonb_typeof(payoffs) = 'object'),       -- {option_key: {branch_id: number}}
  robustness          jsonb NOT NULL CHECK (jsonb_typeof(robustness) = 'object'),    -- {option_key: the worst payoff}
  regret              jsonb NOT NULL CHECK (jsonb_typeof(regret) = 'object'),        -- {option_key: the maximum regret}
  most_robust         text[] NOT NULL,
  least_regret        text[] NOT NULL,
  missing_kinds       text[] NOT NULL DEFAULT ARRAY[]::text[],
  plurality           jsonb NOT NULL CHECK (jsonb_typeof(plurality) = 'object'),
  retirements_proposed jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(retirements_proposed) = 'array'),
  payoff_unit         text NOT NULL CHECK (length(btrim(payoff_unit)) BETWEEN 1 AND 64),
  note                text NOT NULL CHECK (length(btrim(note)) BETWEEN 8 AND 4000),
  reviewed_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id      uuid NOT NULL,
  CONSTRAINT pss_review_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT pss_review_package CHECK ((package_id IS NULL) = (package_version IS NULL))
);
CREATE INDEX pss_review_set ON prediction.portfolio_reviews (set_id, reviewed_at DESC);
CREATE TRIGGER pss_review_append_only BEFORE UPDATE OR DELETE ON prediction.portfolio_reviews FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE prediction.portfolio_reviews IS 'B27 (0097 §S; PR-33-003/-006): a named human''s PORTFOLIO REVIEW of a set — relevance and consequence per member, the option × branch payoff matrix, robustness (worst payoff) and maximum regret per option computed by the port, the missing kinds, the retirements proposed (still the scenario owner''s review) — append-only.';

CREATE TABLE prediction.scenario_relevance (
  relevance_id        uuid PRIMARY KEY,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  scenario_id         uuid NOT NULL REFERENCES prediction.scenarios_current (scenario_id),
  score               numeric NOT NULL CHECK (score >= 0 AND score <= 1),
  basis               jsonb NOT NULL CHECK (jsonb_typeof(basis) = 'object'),
  trigger             text NOT NULL CHECK (trigger IN ('tick', 'operator')),
  scored_by           uuid NOT NULL,
  scored_at           timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id      uuid NOT NULL,
  CONSTRAINT pss_relevance_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX pss_relevance_scenario ON prediction.scenario_relevance (scenario_id, scored_at DESC);
CREATE TRIGGER pss_relevance_append_only BEFORE UPDATE OR DELETE ON prediction.scenario_relevance FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE prediction.scenario_relevance IS 'B27 (0097 §S; living scenarios): the relevance of a scenario of the living portfolio (a member of an active set) — indicator movement toward the thresholds, signposts breached, review timeliness — a row only when the score or its basis changed; append-only.';

CREATE TABLE prediction.scenario_proposals (
  proposal_id         uuid PRIMARY KEY,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  kind                text NOT NULL CHECK (kind IN ('forecast_shift', 'weak_signal', 'risk', 'planning_cycle')),
  source_ref          jsonb NOT NULL CHECK (jsonb_typeof(source_ref) = 'object'),
  source_key          text NOT NULL,                        -- the source object's id (the dedupe key with the kind)
  source_facts        jsonb NOT NULL CHECK (jsonb_typeof(source_facts) = 'object'),   -- what the port VALIDATED about the source
  related_scenario_id uuid REFERENCES prediction.scenarios_current (scenario_id),
  title               text NOT NULL CHECK (length(btrim(title)) BETWEEN 4 AND 256),
  rationale           text NOT NULL CHECK (length(btrim(rationale)) BETWEEN 8 AND 4000),
  proposed_by         uuid NOT NULL,
  proposed_kind       text NOT NULL CHECK (proposed_kind IN ('human', 'agent')),
  proposed_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  state               text NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'accepted', 'dismissed')),
  resolved_by         uuid,
  resolved_at         timestamptz,
  resolution_note     text,
  item_id             uuid,
  correlation_id      uuid NOT NULL,
  CONSTRAINT pss_proposal_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT pss_proposal_resolved CHECK ((state = 'open') = (resolved_at IS NULL) AND (resolved_at IS NULL) = (resolved_by IS NULL) AND (resolved_at IS NULL) = (resolution_note IS NULL))
);
CREATE UNIQUE INDEX pss_proposal_open_once ON prediction.scenario_proposals (tenant_id, domain_id, kind, source_key) WHERE state = 'open';
CREATE INDEX pss_proposal_domain ON prediction.scenario_proposals (tenant_id, domain_id, state, proposed_at DESC);
/* A proposal is resolved once: only the state and the resolution columns change, and only from open. */
CREATE OR REPLACE FUNCTION prediction.pss_proposal_guard() RETURNS trigger
SET search_path = prediction, pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'scenario proposal rejected (append_only): a proposal is never deleted; it is dismissed with a note' USING ERRCODE = '23514'; END IF;
  IF (to_jsonb(NEW) - ARRAY['state', 'resolved_by', 'resolved_at', 'resolution_note', 'item_id']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['state', 'resolved_by', 'resolved_at', 'resolution_note', 'item_id'])
     OR (OLD.state <> 'open' AND NEW.state IS DISTINCT FROM OLD.state) OR (OLD.item_id IS NOT NULL AND NEW.item_id IS DISTINCT FROM OLD.item_id) THEN
    RAISE EXCEPTION 'scenario proposal rejected (append_only): proposal % is written once and resolved once', OLD.proposal_id USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER pss_proposal_guard BEFORE UPDATE OR DELETE ON prediction.scenario_proposals FOR EACH ROW EXECUTE FUNCTION prediction.pss_proposal_guard();
COMMENT ON TABLE prediction.scenario_proposals IS 'B27 (0097 §S; V03-T-343): scenario CREATION TRIGGERS — a proposal from a forecast shift, a weak signal, a risk or a planning cycle, its source validated and recorded, routed to the strategy owners (scenario.proposal), resolved accepted or dismissed with a note; accepting never declares a scenario.';

-- RLS and grants (the 0081 loop idiom; the prediction tables' policy text of 0089; the ports write)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['scenario_sets', 'scenario_set_members', 'scenario_set_events', 'scenario_set_checks', 'portfolio_reviews', 'scenario_relevance', 'scenario_proposals'] LOOP
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
REVOKE ALL ON decision.package_scenario_sets FROM PUBLIC;
ALTER TABLE decision.package_scenario_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE decision.package_scenario_sets FORCE ROW LEVEL SECURITY;
CREATE POLICY decision_isolation ON decision.package_scenario_sets USING (tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain()));
GRANT SELECT ON decision.package_scenario_sets TO eye_app, eye_commit;

-- ═════════════════════════════════════════════════════════════════════
-- §S.2 (cont.) THE EVALUATION, THE HELPERS AND THE GATE
-- ═════════════════════════════════════════════════════════════════════
/* The set's BRANCHES as its members name them (a scenario member names every branch of the scenario; a branch member its one branch),
   each once, with whether it COUNTS (live — prediction.branch_live — in an active scenario) and, when not, why. Read under the caller's
   rights (the gate and the ports run as the definer; a reader under its RLS). */
CREATE OR REPLACE FUNCTION prediction.scenario_set_branches(p_set_id uuid)
RETURNS TABLE (branch_id uuid, scenario_id uuid, scenario_title text, scenario_state text, name text, kind text, kind_label text, state text, counts boolean, reason text)
LANGUAGE sql STABLE SET search_path = prediction, pg_catalog, pg_temp AS $$
  SELECT DISTINCT ON (b.branch_id) b.branch_id, s.scenario_id, s.title, s.state, b.name, b.kind, b.kind_label, b.state,
         (s.state = 'active' AND prediction.branch_live(b.state)) AS counts,
         CASE WHEN s.state <> 'active' THEN format('the scenario is %s', s.state)
              WHEN b.state = 'suspended' THEN format('suspended%s', coalesce(' — ' || b.suspension_reason, ''))
              WHEN NOT prediction.branch_live(b.state) THEN format('the branch is %s', b.state) END AS reason
    FROM prediction.scenario_set_members m
    JOIN prediction.scenarios_current s ON s.scenario_id = m.scenario_id
    JOIN prediction.branches_current b ON b.scenario_id = m.scenario_id AND (m.branch_id IS NULL OR b.branch_id = m.branch_id)
   WHERE m.set_id = p_set_id AND m.removed_at IS NULL
   ORDER BY b.branch_id $$;
GRANT EXECUTE ON FUNCTION prediction.scenario_set_branches(uuid) TO eye_app, eye_commit;

/* THE PLURALITY EVALUATION (pure; ADR-012): the policy's required kinds against the kinds of the LIVE branches, the live count against
   min_branches, the adverse count against min_adverse; the not-counted branches named as a note. {passed, missing_kinds, live_branches,
   adverse_branches, kinds_present, findings, policy}. */
CREATE OR REPLACE FUNCTION prediction.scenario_set_plurality(p_set_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = prediction, pg_catalog, pg_temp AS $$
DECLARE s prediction.scenario_sets%ROWTYPE; v_policy jsonb; v_required text[]; v_min_b int; v_min_a int; v_kinds text[]; v_live int; v_adverse int; v_missing text[]; v_findings jsonb := '[]'::jsonb; v_not jsonb; k text;
BEGIN
  SELECT * INTO s FROM prediction.scenario_sets x WHERE x.set_id = p_set_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  v_policy := s.plurality_policy;
  v_required := ARRAY(SELECT jsonb_array_elements_text(coalesce(v_policy -> 'require', '[]'::jsonb)));
  v_min_b := coalesce((v_policy ->> 'min_branches')::int, 2);
  v_min_a := coalesce((v_policy ->> 'min_adverse')::int, 0);
  SELECT coalesce(array_agg(DISTINCT x.kind ORDER BY x.kind) FILTER (WHERE x.counts), ARRAY[]::text[]), count(*) FILTER (WHERE x.counts)::int,
         count(*) FILTER (WHERE x.counts AND x.kind = ANY (prediction.scenario_set_adverse_kinds()))::int,
         coalesce(jsonb_agg(jsonb_build_object('branch_id', x.branch_id, 'scenario_id', x.scenario_id, 'name', x.name, 'kind', x.kind, 'state', x.state, 'reason', x.reason) ORDER BY x.name) FILTER (WHERE NOT x.counts), '[]'::jsonb)
    INTO v_kinds, v_live, v_adverse, v_not FROM prediction.scenario_set_branches(p_set_id) x;
  v_missing := ARRAY(SELECT r FROM unnest(v_required) r WHERE r <> ALL (v_kinds) ORDER BY array_position(v_required, r));
  IF v_live = 0 THEN v_findings := v_findings || jsonb_build_object('rule', 'no_live_branch', 'outcome', 'fail', 'detail', 'the set counts no live branch'); END IF;
  FOREACH k IN ARRAY v_missing LOOP
    v_findings := v_findings || jsonb_build_object('rule', 'required_kind', 'outcome', 'fail', 'kind', k, 'detail', format('no live %s branch in the set (the policy requires one)', k));
  END LOOP;
  IF v_live < v_min_b THEN v_findings := v_findings || jsonb_build_object('rule', 'min_branches', 'outcome', 'fail', 'detail', format('%s live branch(es); the policy requires at least %s', v_live, v_min_b)); END IF;
  IF v_adverse < v_min_a THEN v_findings := v_findings || jsonb_build_object('rule', 'min_adverse', 'outcome', 'fail', 'detail', format('%s live adverse branch(es) (%s); the policy requires at least %s', v_adverse, array_to_string(prediction.scenario_set_adverse_kinds(), ', '), v_min_a)); END IF;
  IF jsonb_array_length(v_not) > 0 THEN v_findings := v_findings || jsonb_build_object('rule', 'not_counted', 'outcome', 'note', 'branches', v_not, 'detail', format('%s branch(es) of the members are not live and not counted', jsonb_array_length(v_not))); END IF;
  RETURN jsonb_build_object('passed', NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_findings) f WHERE f ->> 'outcome' = 'fail'),
                            'missing_kinds', to_jsonb(v_missing), 'live_branches', v_live, 'adverse_branches', v_adverse, 'kinds_present', to_jsonb(v_kinds),
                            'findings', v_findings, 'policy', jsonb_build_object('require', to_jsonb(v_required), 'min_branches', v_min_b, 'min_adverse', v_min_a), 'set_version', s.version);
END $$;
GRANT EXECUTE ON FUNCTION prediction.scenario_set_plurality(uuid) TO eye_app, eye_commit;

/* The policy's SHAPE (the declaration's rule): require ⊆ vocabulary v1's kinds (no repeats), min_branches ≥ 2 (a plural set), min_adverse ≥ 0. NULL = valid. */
CREATE OR REPLACE FUNCTION prediction.scenario_set_policy_problem(p jsonb) RETURNS text
LANGUAGE plpgsql STABLE SET search_path = prediction, pg_catalog, pg_temp AS $$
DECLARE v_kinds text[]; k text; x text;
BEGIN
  IF p IS NULL OR jsonb_typeof(p) <> 'object' THEN RETURN 'the plurality policy is an object {require: [kinds], min_branches, min_adverse}'; END IF;
  FOR x IN SELECT jsonb_object_keys(p) LOOP
    IF x NOT IN ('require', 'min_branches', 'min_adverse') THEN RETURN format('%s is not a term of the plurality policy (require, min_branches, min_adverse)', x); END IF;
  END LOOP;
  SELECT kinds INTO v_kinds FROM prediction.scenario_kind_versions WHERE version = 1;
  IF jsonb_typeof(coalesce(p -> 'require', '[]'::jsonb)) <> 'array' THEN RETURN 'require is a list of scenario kinds'; END IF;
  FOR k IN SELECT jsonb_array_elements_text(coalesce(p -> 'require', '[]'::jsonb)) LOOP
    IF k <> ALL (v_kinds) THEN RETURN format('%s is not a kind of scenario kind vocabulary v1 (%s)', k, array_to_string(v_kinds, ', ')); END IF;
  END LOOP;
  IF (SELECT count(*) FROM jsonb_array_elements_text(coalesce(p -> 'require', '[]'::jsonb))) <> (SELECT count(DISTINCT e) FROM jsonb_array_elements_text(coalesce(p -> 'require', '[]'::jsonb)) e) THEN RETURN 'require names each kind once'; END IF;
  IF p ? 'min_branches' AND (jsonb_typeof(p -> 'min_branches') <> 'number' OR (p ->> 'min_branches') !~ '^[0-9]+$' OR (p ->> 'min_branches')::int < 2 OR (p ->> 'min_branches')::int > 64) THEN
    RETURN 'min_branches is a whole number in 2..64 (a set is plural)';
  END IF;
  IF p ? 'min_adverse' AND (jsonb_typeof(p -> 'min_adverse') <> 'number' OR (p ->> 'min_adverse') !~ '^[0-9]+$' OR (p ->> 'min_adverse')::int > 64) THEN
    RETURN 'min_adverse is a whole number in 0..64';
  END IF;
  RETURN NULL;
END $$;
GRANT EXECUTE ON FUNCTION prediction.scenario_set_policy_problem(jsonb) TO eye_app, eye_commit;

CREATE OR REPLACE FUNCTION prediction.scenario_set_json(r prediction.scenario_sets) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$ SELECT to_jsonb(r) - 'tenant_id' - 'domain_id' - 'correlation_id' - 'scope' $$;
GRANT EXECUTE ON FUNCTION prediction.scenario_set_json(prediction.scenario_sets) TO eye_app, eye_commit;

/* The set's ledger (a helper; never a port). */
CREATE OR REPLACE FUNCTION prediction.pss_event(p_set uuid, p_tenant uuid, p_domain uuid, p_event text, p_version int, p_actor uuid, p_details jsonb, p_correlation uuid) RETURNS uuid
SET search_path = prediction, pg_catalog, pg_temp AS $$
DECLARE v uuid := gen_random_uuid();
BEGIN
  INSERT INTO prediction.scenario_set_events (event_id, scope, tenant_id, domain_id, set_id, event, set_version, actor_principal_id, details, correlation_id)
  VALUES (v, 'DOMAIN', p_tenant, p_domain, p_set, p_event, p_version, p_actor, coalesce(p_details, '{}'::jsonb), p_correlation);
  RETURN v;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.pss_event(uuid,uuid,uuid,text,int,uuid,jsonb,uuid) FROM PUBLIC;

/* The owner-or-administrator test of the set's acts (the owner, or a domain / platform administrator). */
CREATE OR REPLACE FUNCTION prediction.pss_owner_or_admin(p_owner uuid, p_actor uuid, p_tenant uuid, p_domain uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path = executive, identity, pg_catalog, pg_temp AS $$
  SELECT p_owner = p_actor OR executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['domain_admin', 'platform_admin']) $$;
REVOKE ALL ON FUNCTION prediction.pss_owner_or_admin(uuid,uuid,uuid,uuid) FROM PUBLIC;

/* RECORD A CHECK (a helper the ports call; never a port): the evaluation written to the check ledger and the set's row; a NEW gap (the
   first failure, a failure after a pass, or a failure whose missing kinds or failing rules changed) raises `scenario.set_gap` to the set
   owner; a PASS closes the open gap items of the set. The caller holds the set row. */
CREATE OR REPLACE FUNCTION prediction.pss_record_check(p_check_id uuid, p_set_id uuid, p_tenant uuid, p_domain uuid, p_trigger text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SET search_path = prediction, executive, identity, pg_catalog, pg_temp AS $$
DECLARE s prediction.scenario_sets%ROWTYPE; v jsonb; prior prediction.scenario_set_checks%ROWTYPE; v_new_gap boolean := false; v_item uuid; v_state text; v_reasons jsonb; v_due timestamptz; v_closed int := 0; it record;
        v_fail_rules text[]; v_prior_rules text[];
BEGIN
  SELECT * INTO s FROM prediction.scenario_sets x WHERE x.set_id = p_set_id;
  v := prediction.scenario_set_plurality(p_set_id);
  SELECT * INTO prior FROM prediction.scenario_set_checks x WHERE x.set_id = p_set_id ORDER BY x.as_of DESC, x.check_id DESC LIMIT 1;
  v_fail_rules := ARRAY(SELECT (f ->> 'rule') || coalesce(':' || (f ->> 'kind'), '') FROM jsonb_array_elements(v -> 'findings') f WHERE f ->> 'outcome' = 'fail' ORDER BY 1);
  IF prior.check_id IS NOT NULL THEN v_prior_rules := ARRAY(SELECT (f ->> 'rule') || coalesce(':' || (f ->> 'kind'), '') FROM jsonb_array_elements(prior.findings) f WHERE f ->> 'outcome' = 'fail' ORDER BY 1); END IF;
  IF NOT (v ->> 'passed')::boolean THEN
    v_new_gap := prior.check_id IS NULL OR prior.outcome = 'passed' OR v_prior_rules IS DISTINCT FROM v_fail_rules;
  END IF;
  IF v_new_gap THEN
    v_item := gen_random_uuid();
    v_state := CASE WHEN EXISTS (SELECT 1 FROM identity.principals p WHERE p.id = s.owner_principal_id AND p.kind = 'human' AND p.status = 'active') THEN 'open' ELSE 'unrouted' END;
    v_due := clock_timestamp() + interval '24 hours';
    v_reasons := jsonb_build_array(
      CASE WHEN jsonb_array_length(v -> 'missing_kinds') > 0 THEN format('the set counts no live branch of the kind(s) %s its plurality policy requires', (SELECT string_agg(x, ', ') FROM jsonb_array_elements_text(v -> 'missing_kinds') x))
           ELSE format('the set''s plurality check fails: %s', (SELECT string_agg(f ->> 'detail', '; ') FROM jsonb_array_elements(v -> 'findings') f WHERE f ->> 'outcome' = 'fail')) END,
      'a package bound to this set is not proposed until the check passes (ADR-012): add the missing branch (a scenario declared with it, or a member that holds it), then check again');
    INSERT INTO executive.attention_items (item_id, scope, tenant_id, domain_id, signal_class, subject_kind, subject_id, cause_event_id, cause_event_type, title, outcome, state, owner_principal_id, route_roles, evaluation, details, due_at, escalations, correlation_id)
    VALUES (v_item, 'DOMAIN', p_tenant, p_domain, 'scenario.set_gap', 'scenario_set', p_set_id, p_check_id, 'ScenarioSetPluralityFailed',
            left(format('Scenario set not plural: %s — missing %s', s.title, coalesce(nullif((SELECT string_agg(x, ', ') FROM jsonb_array_elements_text(v -> 'missing_kinds') x), ''), array_to_string(v_fail_rules, ', '))), 512),
            'material', v_state, s.owner_principal_id, '{}',
            jsonb_build_object('outcome', 'material', 'reasons', v_reasons, 'policy_version', NULL, 'dimensions', jsonb_build_object('consequence', 'C2', 'confidence', 1)),
            jsonb_build_object('set_id', p_set_id, 'check_id', p_check_id, 'missing_kinds', v -> 'missing_kinds', 'live_branches', v -> 'live_branches', 'package_id', s.package_id),
            v_due, 0, p_correlation);
    PERFORM executive.attention_event(v_item, p_tenant, p_domain, CASE v_state WHEN 'open' THEN 'item.routed' ELSE 'item.unrouted' END, p_actor,
              jsonb_build_object('outcome', 'material', 'reasons', v_reasons, 'policy_version', NULL, 'owner', s.owner_principal_id, 'route_roles', '[]'::jsonb, 'due_at', v_due,
                                 'cause_event_id', p_check_id, 'cause_event_type', 'ScenarioSetPluralityFailed', 'unrouted', v_state = 'unrouted', 'set_id', p_set_id), p_correlation);
  END IF;
  INSERT INTO prediction.scenario_set_checks (check_id, scope, tenant_id, domain_id, set_id, set_version, trigger, outcome, missing_kinds, live_branches, adverse_branches, kinds_present, findings, policy, as_of, checked_by, item_id, correlation_id)
  VALUES (p_check_id, 'DOMAIN', p_tenant, p_domain, p_set_id, s.version, p_trigger, CASE WHEN (v ->> 'passed')::boolean THEN 'passed' ELSE 'failed' END,
          ARRAY(SELECT jsonb_array_elements_text(v -> 'missing_kinds')), (v ->> 'live_branches')::int, (v ->> 'adverse_branches')::int, ARRAY(SELECT jsonb_array_elements_text(v -> 'kinds_present')),
          v -> 'findings', v -> 'policy', clock_timestamp(), p_actor, v_item, p_correlation);
  IF (v ->> 'passed')::boolean THEN
    FOR it IN SELECT item_id FROM executive.attention_items x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.signal_class = 'scenario.set_gap' AND x.subject_id = p_set_id AND x.state NOT IN ('closed') LOOP
      UPDATE executive.attention_items SET state = 'closed', closed_at = clock_timestamp(), closed_by = p_actor, suppressed_until = NULL, updated_at = clock_timestamp() WHERE item_id = it.item_id;
      PERFORM executive.attention_event(it.item_id, p_tenant, p_domain, 'item.closed', p_actor, jsonb_build_object('reason', 'the set''s plurality check passed', 'check_id', p_check_id), p_correlation);
      v_closed := v_closed + 1;
    END LOOP;
  END IF;
  UPDATE prediction.scenario_sets SET last_check_id = p_check_id, last_check_outcome = CASE WHEN (v ->> 'passed')::boolean THEN 'passed' ELSE 'failed' END, updated_at = clock_timestamp() WHERE set_id = p_set_id;
  PERFORM prediction.pss_event(p_set_id, p_tenant, p_domain, 'set.checked', s.version, p_actor,
            jsonb_build_object('check_id', p_check_id, 'trigger', p_trigger, 'outcome', CASE WHEN (v ->> 'passed')::boolean THEN 'passed' ELSE 'failed' END, 'missing_kinds', v -> 'missing_kinds', 'item_id', v_item, 'gap_items_closed', v_closed), p_correlation);
  RETURN jsonb_build_object('check_id', p_check_id, 'set_id', p_set_id, 'set_version', s.version, 'trigger', p_trigger, 'outcome', CASE WHEN (v ->> 'passed')::boolean THEN 'passed' ELSE 'failed' END,
                            'new_gap', v_new_gap, 'item_id', v_item, 'gap_items_closed', v_closed) || (v - 'passed' - 'set_version');
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.pss_record_check(uuid,uuid,uuid,uuid,text,uuid,uuid) FROM PUBLIC;

/* THE PLURALITY GATE (ADR-012; decision.propose_version is NOT re-declared): a BEFORE INSERT trigger on decision.package_events for
   `version.proposed` — the proposal's last write — runs the evaluation of every set the package is bound to (a retired set gates nothing:
   a set is not retired while bound to a package in flight) and refuses the proposal while one fails. The refusal rolls back the whole
   proposal (the version stays a draft). */
CREATE OR REPLACE FUNCTION prediction.pss_plurality_gate() RETURNS trigger
SECURITY DEFINER SET search_path = prediction, decision, pg_catalog, pg_temp AS $$
DECLARE b record; v jsonb;
BEGIN
  FOR b IN SELECT ps.set_id, s.title, s.state FROM decision.package_scenario_sets ps JOIN prediction.scenario_sets s ON s.set_id = ps.set_id
            WHERE ps.package_id = NEW.package_id ORDER BY ps.bound_at, ps.set_id LOOP
    IF b.state = 'retired' THEN CONTINUE; END IF;
    v := prediction.scenario_set_plurality(b.set_id);
    IF NOT (v ->> 'passed')::boolean THEN
      RAISE EXCEPTION 'recommendation rejected (plurality): package % version % is bound to the scenario set "%" (%), whose plurality check fails — %; add the missing branch and check the set again (ADR-012)',
        NEW.package_id, NEW.details ->> 'version', b.title, b.set_id,
        coalesce(nullif((SELECT string_agg(f ->> 'detail', '; ') FROM jsonb_array_elements(v -> 'findings') f WHERE f ->> 'outcome' = 'fail'), ''), 'the set is not plural')
        USING ERRCODE = '22023';
    END IF;
  END LOOP;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.pss_plurality_gate() FROM PUBLIC;
CREATE TRIGGER pss_plurality_gate BEFORE INSERT ON decision.package_events FOR EACH ROW WHEN (NEW.event = 'version.proposed') EXECUTE FUNCTION prediction.pss_plurality_gate();

-- ═════════════════════════════════════════════════════════════════════
-- §S.1 (cont.) THE SET'S PORTS
-- ═════════════════════════════════════════════════════════════════════
/* DECLARE (prediction.scenario.set.declare): a named human declares a set — the title, the purpose, the OWNER (a named, active human of
   the domain holding strategy_owner, forecast_owner, decision_owner or an administrator's role), the package it serves (optional; a
   package of this domain), the plurality policy. Draft, version 1. */
CREATE OR REPLACE FUNCTION prediction.declare_scenario_set(
  p_set_id uuid, p_tenant uuid, p_domain uuid, p_title text, p_purpose text, p_owner uuid, p_policy jsonb, p_package_id uuid, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, decision, executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE s prediction.scenario_sets%ROWTYPE; v_problem text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.scenario.set.declare']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'scenario set rejected (actor): declared by the acting principal' USING ERRCODE = '42501'; END IF;
  IF p_title IS NULL OR length(btrim(p_title)) NOT BETWEEN 2 AND 256 THEN RAISE EXCEPTION 'scenario set rejected (title): a set has a title of 2 to 256 characters' USING ERRCODE = '22023'; END IF;
  IF p_purpose IS NULL OR length(btrim(p_purpose)) NOT BETWEEN 8 AND 2000 THEN RAISE EXCEPTION 'scenario set rejected (purpose): a set states its purpose (8 to 2000 characters)' USING ERRCODE = '22023'; END IF;
  IF NOT executive.holds_role(p_owner, p_tenant, p_domain, ARRAY['strategy_owner', 'forecast_owner', 'decision_owner', 'domain_admin', 'platform_admin']) THEN
    RAISE EXCEPTION 'scenario set rejected (owner): the owner % is not a named, active human holding strategy_owner, forecast_owner or decision_owner in this domain', p_owner USING ERRCODE = '22023';
  END IF;
  v_problem := prediction.scenario_set_policy_problem(p_policy);
  IF v_problem IS NOT NULL THEN RAISE EXCEPTION 'scenario set rejected (policy): %', v_problem USING ERRCODE = '22023'; END IF;
  IF p_package_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM decision.packages_current x WHERE x.package_id = p_package_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain) THEN
    RAISE EXCEPTION 'scenario set rejected (unknown_package): % is not a decision package of this domain', p_package_id USING ERRCODE = '23503';
  END IF;
  IF EXISTS (SELECT 1 FROM prediction.scenario_sets x WHERE x.set_id = p_set_id) THEN RAISE EXCEPTION 'scenario set rejected (duplicate): set % is already declared', p_set_id USING ERRCODE = '22023'; END IF;
  INSERT INTO prediction.scenario_sets (set_id, scope, tenant_id, domain_id, title, purpose, owner_principal_id, package_id, plurality_policy, declared_by, correlation_id)
  VALUES (p_set_id, 'DOMAIN', p_tenant, p_domain, btrim(p_title), btrim(p_purpose), p_owner, p_package_id,
          jsonb_build_object('require', coalesce(p_policy -> 'require', '[]'::jsonb), 'min_branches', coalesce((p_policy ->> 'min_branches')::int, 2), 'min_adverse', coalesce((p_policy ->> 'min_adverse')::int, 0)),
          p_actor, p_correlation) RETURNING * INTO s;
  PERFORM prediction.pss_event(p_set_id, p_tenant, p_domain, 'set.declared', 1, p_actor, jsonb_build_object('title', s.title, 'owner', p_owner, 'package_id', p_package_id, 'policy', s.plurality_policy), p_correlation);
  RETURN prediction.scenario_set_json(s);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.declare_scenario_set(uuid,uuid,uuid,text,text,uuid,jsonb,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.declare_scenario_set(uuid,uuid,uuid,text,text,uuid,jsonb,uuid,uuid,uuid) TO eye_commit;

/* ADD or REMOVE a member (prediction.scenario.set.member): the set's owner (or an administrator) on a draft or active set; a member is an
   ACTIVE scenario of this domain, or one of its branches; the set version moves; the scenario's own ledger records it; on an ACTIVE set
   the plurality check runs (trigger member). p_remove names the membership to remove (with a reason). */
CREATE OR REPLACE FUNCTION prediction.change_scenario_set_member(
  p_set_id uuid, p_tenant uuid, p_domain uuid, p_member_id uuid, p_scenario_id uuid, p_branch_id uuid, p_remove boolean, p_reason text, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE s prediction.scenario_sets%ROWTYPE; m prediction.scenario_set_members%ROWTYPE; sc prediction.scenarios_current%ROWTYPE; v_branch_scenario uuid; v_check jsonb := NULL;
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.scenario.set.member']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'scenario set rejected (actor): changed by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO s FROM prediction.scenario_sets x WHERE x.set_id = p_set_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'scenario set rejected (unknown_set): % is not a scenario set of this domain', p_set_id USING ERRCODE = '23503'; END IF;
  IF NOT prediction.pss_owner_or_admin(s.owner_principal_id, p_actor, p_tenant, p_domain) THEN
    RAISE EXCEPTION 'scenario set rejected (authority): the members of a set are changed by its owner or an administrator' USING ERRCODE = '42501';
  END IF;
  IF s.state = 'retired' THEN RAISE EXCEPTION 'scenario set rejected (state): set % is retired; its members are not changed', p_set_id USING ERRCODE = '22023'; END IF;
  IF coalesce(p_remove, false) THEN
    SELECT * INTO m FROM prediction.scenario_set_members x WHERE x.member_id = p_member_id AND x.set_id = p_set_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'scenario set rejected (unknown_member): % is not a member of set %', p_member_id, p_set_id USING ERRCODE = '23503'; END IF;
    IF m.removed_at IS NOT NULL THEN RAISE EXCEPTION 'scenario set rejected (state): member % was removed at %', p_member_id, m.removed_at USING ERRCODE = '22023'; END IF;
    IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN RAISE EXCEPTION 'scenario set rejected (reason): a removal says why (8+ characters)' USING ERRCODE = '22023'; END IF;
    UPDATE prediction.scenario_sets SET version = version + 1, updated_at = clock_timestamp() WHERE set_id = p_set_id RETURNING * INTO s;
    UPDATE prediction.scenario_set_members SET removed_by = p_actor, removed_at = clock_timestamp(), removal_reason = btrim(p_reason), removed_in_version = s.version WHERE member_id = p_member_id RETURNING * INTO m;
    PERFORM prediction.pss_event(p_set_id, p_tenant, p_domain, 'set.member_removed', s.version, p_actor, jsonb_build_object('member_id', m.member_id, 'scenario_id', m.scenario_id, 'branch_id', m.branch_id, 'reason', btrim(p_reason)), p_correlation);
    INSERT INTO prediction.scenario_events (event_id, scope, tenant_id, domain_id, scenario_id, branch_id, event, actor_principal_id, details, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, m.scenario_id, m.branch_id, 'scenario.set_member_removed', p_actor, jsonb_build_object('set_id', p_set_id, 'set_version', s.version, 'member_id', m.member_id, 'reason', btrim(p_reason)), p_correlation);
  ELSE
    SELECT * INTO sc FROM prediction.scenarios_current x WHERE x.scenario_id = p_scenario_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
    IF NOT FOUND THEN RAISE EXCEPTION 'scenario set rejected (unknown_scenario): % is not a scenario of this domain', p_scenario_id USING ERRCODE = '23503'; END IF;
    IF sc.state <> 'active' THEN RAISE EXCEPTION 'scenario set rejected (state): scenario % is %; only an active scenario joins a set', p_scenario_id, sc.state USING ERRCODE = '22023'; END IF;
    IF p_branch_id IS NOT NULL THEN
      SELECT b.scenario_id INTO v_branch_scenario FROM prediction.branches_current b WHERE b.branch_id = p_branch_id;
      IF v_branch_scenario IS DISTINCT FROM p_scenario_id THEN RAISE EXCEPTION 'scenario set rejected (unknown_branch): % is not a branch of scenario %', p_branch_id, p_scenario_id USING ERRCODE = '23503'; END IF;
    END IF;
    IF EXISTS (SELECT 1 FROM prediction.scenario_set_members x WHERE x.set_id = p_set_id AND x.scenario_id = p_scenario_id AND x.branch_id IS NOT DISTINCT FROM p_branch_id AND x.removed_at IS NULL) THEN
      RAISE EXCEPTION 'scenario set rejected (duplicate): % is already a member of set %', coalesce(p_branch_id, p_scenario_id), p_set_id USING ERRCODE = '22023';
    END IF;
    UPDATE prediction.scenario_sets SET version = version + 1, updated_at = clock_timestamp() WHERE set_id = p_set_id RETURNING * INTO s;
    INSERT INTO prediction.scenario_set_members (member_id, set_id, scope, tenant_id, domain_id, scenario_id, branch_id, added_by, added_in_version, correlation_id)
    VALUES (p_member_id, p_set_id, 'DOMAIN', p_tenant, p_domain, p_scenario_id, p_branch_id, p_actor, s.version, p_correlation) RETURNING * INTO m;
    PERFORM prediction.pss_event(p_set_id, p_tenant, p_domain, 'set.member_added', s.version, p_actor, jsonb_build_object('member_id', m.member_id, 'scenario_id', p_scenario_id, 'branch_id', p_branch_id, 'scenario_title', sc.title), p_correlation);
    INSERT INTO prediction.scenario_events (event_id, scope, tenant_id, domain_id, scenario_id, branch_id, event, actor_principal_id, details, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_scenario_id, p_branch_id, 'scenario.set_member_added', p_actor, jsonb_build_object('set_id', p_set_id, 'set_version', s.version, 'member_id', m.member_id), p_correlation);
  END IF;
  IF s.state = 'active' THEN v_check := prediction.pss_record_check(gen_random_uuid(), p_set_id, p_tenant, p_domain, 'member', p_actor, p_correlation); END IF;
  SELECT * INTO s FROM prediction.scenario_sets x WHERE x.set_id = p_set_id;
  RETURN jsonb_build_object('set', prediction.scenario_set_json(s), 'member', to_jsonb(m) - 'tenant_id' - 'domain_id' - 'correlation_id' - 'scope', 'check', v_check);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.change_scenario_set_member(uuid,uuid,uuid,uuid,uuid,uuid,boolean,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.change_scenario_set_member(uuid,uuid,uuid,uuid,uuid,uuid,boolean,text,uuid,uuid) TO eye_commit;

/* ACTIVATE (prediction.scenario.set.activate) / RETIRE (prediction.scenario.set.retire): the owner (or an administrator). Activation
   needs a member and runs the check (trigger activate — a failing set is activated and its gap flagged); a retirement says why and is
   refused while the set is bound to a package still in flight (draft, proposed, under review, approved — a retirement never opens the
   gate). p_state names the target: active | retired. */
CREATE OR REPLACE FUNCTION prediction.transition_scenario_set(p_set_id uuid, p_tenant uuid, p_domain uuid, p_state text, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, decision, executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE s prediction.scenario_sets%ROWTYPE; v_check jsonb := NULL; v_live_pkg text;
BEGIN
  PERFORM observation.assert_authority(ARRAY[CASE WHEN p_state = 'retired' THEN 'prediction.scenario.set.retire' ELSE 'prediction.scenario.set.activate' END]);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'scenario set rejected (actor): transitioned by the acting principal' USING ERRCODE = '42501'; END IF;
  IF p_state IS NULL OR p_state NOT IN ('active', 'retired') THEN RAISE EXCEPTION 'scenario set rejected (transition): a set is activated or retired' USING ERRCODE = '22023'; END IF;
  SELECT * INTO s FROM prediction.scenario_sets x WHERE x.set_id = p_set_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'scenario set rejected (unknown_set): % is not a scenario set of this domain', p_set_id USING ERRCODE = '23503'; END IF;
  IF NOT prediction.pss_owner_or_admin(s.owner_principal_id, p_actor, p_tenant, p_domain) THEN
    RAISE EXCEPTION 'scenario set rejected (authority): a set is activated and retired by its owner or an administrator' USING ERRCODE = '42501';
  END IF;
  IF p_state = 'active' THEN
    IF s.state <> 'draft' THEN RAISE EXCEPTION 'scenario set rejected (state): set % is %; only a draft set is activated', p_set_id, s.state USING ERRCODE = '22023'; END IF;
    IF NOT EXISTS (SELECT 1 FROM prediction.scenario_set_members x WHERE x.set_id = p_set_id AND x.removed_at IS NULL) THEN
      RAISE EXCEPTION 'scenario set rejected (empty): set % has no member; a set is activated over scenarios', p_set_id USING ERRCODE = '22023';
    END IF;
    UPDATE prediction.scenario_sets SET state = 'active', activated_by = p_actor, activated_at = clock_timestamp(), updated_at = clock_timestamp() WHERE set_id = p_set_id RETURNING * INTO s;
    PERFORM prediction.pss_event(p_set_id, p_tenant, p_domain, 'set.activated', s.version, p_actor, '{}'::jsonb, p_correlation);
    v_check := prediction.pss_record_check(gen_random_uuid(), p_set_id, p_tenant, p_domain, 'activate', p_actor, p_correlation);
  ELSE
    IF s.state = 'retired' THEN RAISE EXCEPTION 'scenario set rejected (state): set % was retired at %', p_set_id, s.retired_at USING ERRCODE = '22023'; END IF;
    IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN RAISE EXCEPTION 'scenario set rejected (reason): a retirement says why (8+ characters)' USING ERRCODE = '22023'; END IF;
    SELECT string_agg(format('%s (%s)', p.title, p.state), ', ') INTO v_live_pkg FROM decision.package_scenario_sets ps JOIN decision.packages_current p ON p.package_id = ps.package_id
     WHERE ps.set_id = p_set_id AND p.state IN ('draft', 'proposed', 'under_review', 'approved', 'reopened');
    IF v_live_pkg IS NOT NULL THEN
      RAISE EXCEPTION 'scenario set rejected (bound): set % is bound to package(s) still in flight — %; it is not retired while it gates a recommendation', p_set_id, v_live_pkg USING ERRCODE = '22023';
    END IF;
    UPDATE prediction.scenario_sets SET state = 'retired', retired_by = p_actor, retired_at = clock_timestamp(), retirement_reason = btrim(p_reason), updated_at = clock_timestamp() WHERE set_id = p_set_id RETURNING * INTO s;
    PERFORM prediction.pss_event(p_set_id, p_tenant, p_domain, 'set.retired', s.version, p_actor, jsonb_build_object('reason', btrim(p_reason)), p_correlation);
  END IF;
  RETURN jsonb_build_object('set', prediction.scenario_set_json(s), 'check', v_check);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.transition_scenario_set(uuid,uuid,uuid,text,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.transition_scenario_set(uuid,uuid,uuid,text,text,uuid,uuid) TO eye_commit;

/* CHECK (prediction.scenario.set.check): a person's plurality check of an active set, recorded whatever the outcome (a new gap raises the
   owner's item; a pass closes the open ones). */
CREATE OR REPLACE FUNCTION prediction.check_scenario_set_plurality(p_check_id uuid, p_set_id uuid, p_tenant uuid, p_domain uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE s prediction.scenario_sets%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.scenario.set.check']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'scenario set rejected (actor): checked by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO s FROM prediction.scenario_sets x WHERE x.set_id = p_set_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'scenario set rejected (unknown_set): % is not a scenario set of this domain', p_set_id USING ERRCODE = '23503'; END IF;
  IF s.state <> 'active' THEN RAISE EXCEPTION 'scenario set rejected (state): set % is %; an active set is checked', p_set_id, s.state USING ERRCODE = '22023'; END IF;
  RETURN prediction.pss_record_check(p_check_id, p_set_id, p_tenant, p_domain, 'operator', p_actor, p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.check_scenario_set_plurality(uuid,uuid,uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.check_scenario_set_plurality(uuid,uuid,uuid,uuid,uuid,uuid) TO eye_commit;

/* BIND (prediction.scenario.set.bind): the package's owner (or an administrator) binds an ACTIVE set to a package of this domain that is
   still open to a proposal (draft, proposed, under review, reopened); once per package and set; the check runs (trigger bind) so a gap is
   flagged to the set owner before anyone proposes. */
CREATE OR REPLACE FUNCTION prediction.bind_scenario_set(p_binding_id uuid, p_set_id uuid, p_package_id uuid, p_tenant uuid, p_domain uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, decision, executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE s prediction.scenario_sets%ROWTYPE; p decision.packages_current%ROWTYPE; v_check jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.scenario.set.bind']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'scenario set rejected (actor): bound by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO s FROM prediction.scenario_sets x WHERE x.set_id = p_set_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'scenario set rejected (unknown_set): % is not a scenario set of this domain', p_set_id USING ERRCODE = '23503'; END IF;
  SELECT * INTO p FROM decision.packages_current x WHERE x.package_id = p_package_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'scenario set rejected (unknown_package): % is not a decision package of this domain', p_package_id USING ERRCODE = '23503'; END IF;
  IF NOT prediction.pss_owner_or_admin(p.owner_principal_id, p_actor, p_tenant, p_domain) THEN
    RAISE EXCEPTION 'scenario set rejected (authority): a set is bound to a package by the package''s owner or an administrator' USING ERRCODE = '42501';
  END IF;
  IF s.state <> 'active' THEN RAISE EXCEPTION 'scenario set rejected (state): set % is %; an active set is bound', p_set_id, s.state USING ERRCODE = '22023'; END IF;
  IF p.state NOT IN ('draft', 'proposed', 'under_review', 'reopened') THEN
    RAISE EXCEPTION 'scenario set rejected (state): package % is %; a set is bound to a package still open to a proposal', p_package_id, p.state USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM decision.package_scenario_sets x WHERE x.package_id = p_package_id AND x.set_id = p_set_id) THEN
    RAISE EXCEPTION 'scenario set rejected (duplicate): set % is already bound to package %', p_set_id, p_package_id USING ERRCODE = '22023';
  END IF;
  INSERT INTO decision.package_scenario_sets (binding_id, scope, tenant_id, domain_id, package_id, set_id, bound_by, correlation_id)
  VALUES (p_binding_id, 'DOMAIN', p_tenant, p_domain, p_package_id, p_set_id, p_actor, p_correlation);
  PERFORM prediction.pss_event(p_set_id, p_tenant, p_domain, 'set.bound', s.version, p_actor, jsonb_build_object('binding_id', p_binding_id, 'package_id', p_package_id, 'package_title', p.title), p_correlation);
  v_check := prediction.pss_record_check(gen_random_uuid(), p_set_id, p_tenant, p_domain, 'bind', p_actor, p_correlation);
  RETURN jsonb_build_object('binding_id', p_binding_id, 'set_id', p_set_id, 'package_id', p_package_id, 'bound_by', p_actor, 'check', v_check);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.bind_scenario_set(uuid,uuid,uuid,uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.bind_scenario_set(uuid,uuid,uuid,uuid,uuid,uuid,uuid) TO eye_commit;

-- ═════════════════════════════════════════════════════════════════════
-- §S.3 THE COMPARATOR AND THE READS (invoker reads under the caller's RLS)
-- ═════════════════════════════════════════════════════════════════════
/* The comparator's freshness threshold: an indicator whose last observation is older than this many days is shown STALE (a display rule
   of the comparator; §Q judges freshness against each indicator's cadence). */
CREATE OR REPLACE FUNCTION prediction.scenario_set_stale_days() RETURNS int LANGUAGE sql IMMUTABLE AS $$ SELECT 14 $$;
GRANT EXECUTE ON FUNCTION prediction.scenario_set_stale_days() TO eye_app, eye_commit;

/* §A's elements of a branch (and its scenario's scenario-level elements), when §A's table exists (to_regclass — this part stands alone);
   NULL when it does not. */
CREATE OR REPLACE FUNCTION prediction.pss_elements_of(p_scenario_id uuid, p_branch_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = prediction, pg_catalog, pg_temp AS $$
DECLARE v jsonb;
BEGIN
  IF to_regclass('prediction.scenario_elements') IS NULL THEN RETURN NULL; END IF;
  BEGIN
    EXECUTE 'SELECT coalesce(jsonb_agg(to_jsonb(e) - ''tenant_id'' - ''domain_id'' - ''correlation_id'' - ''scope'' ORDER BY e.kind, e.name), ''[]''::jsonb)
               FROM prediction.scenario_elements e WHERE e.scenario_id = $1 AND (e.branch_id IS NULL OR e.branch_id = $2) AND e.state = ''active'''
      INTO v USING p_scenario_id, p_branch_id;
  EXCEPTION WHEN undefined_column OR undefined_table THEN RETURN jsonb_build_object('unavailable', 'the anatomy table does not carry the columns this read expects');
  END;
  RETURN v;
END $$;
GRANT EXECUTE ON FUNCTION prediction.pss_elements_of(uuid, uuid) TO eye_app, eye_commit;

/* §Q's governed probability of a branch (its newest row: the band, the method, the basis, whether withdrawn), when §Q's table exists;
   NULL when it does not or no probability was set. Never derived here. */
CREATE OR REPLACE FUNCTION prediction.pss_probability_of(p_branch_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = prediction, pg_catalog, pg_temp AS $$
DECLARE v jsonb;
BEGIN
  IF to_regclass('prediction.branch_probabilities') IS NULL THEN RETURN NULL; END IF;
  BEGIN
    EXECUTE 'SELECT to_jsonb(p) - ''tenant_id'' - ''domain_id'' - ''correlation_id'' - ''scope'' FROM prediction.branch_probabilities p WHERE p.branch_id = $1 ORDER BY p.set_at DESC LIMIT 1'
      INTO v USING p_branch_id;
  EXCEPTION WHEN undefined_column OR undefined_table THEN RETURN jsonb_build_object('unavailable', 'the probability table does not carry the columns this read expects');
  END;
  RETURN v;
END $$;
GRANT EXECUTE ON FUNCTION prediction.pss_probability_of(uuid) TO eye_app, eye_commit;

/* THE COMPARATOR (CAP-DS-02): the set's branches SIDE BY SIDE — live first by kind, then the not-live ones with the reason — each with
   its scenario, kind, kind label, state (suspended with its reason and instant), statement, divergence, assumptions, §A's elements, the
   indicator with its freshness, the signpost, the consequence and its class, §Q's governed probability; the plurality verdict beside. */
CREATE OR REPLACE FUNCTION prediction.scenario_set_compare(p_set_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = prediction, pg_catalog, pg_temp AS $$
  SELECT CASE WHEN s.set_id IS NULL THEN NULL ELSE jsonb_build_object(
    'set', prediction.scenario_set_json(s),
    'as_of', clock_timestamp(),
    'plurality', prediction.scenario_set_plurality(s.set_id),
    'anatomy_available', to_regclass('prediction.scenario_elements') IS NOT NULL,
    'probability_available', to_regclass('prediction.branch_probabilities') IS NOT NULL,
    'stale_after_days', prediction.scenario_set_stale_days(),
    'branches', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'branch_id', b.branch_id, 'scenario_id', b.scenario_id, 'scenario_title', sc.title, 'scenario_state', sc.state, 'scenario_version', sc.current_version,
               'coherence_state', sc.coherence_state, 'name', b.name, 'kind', b.kind, 'kind_label', b.kind_label, 'state', b.state, 'live', x.counts, 'not_counted_reason', x.reason,
               'suspended_at', b.suspended_at, 'suspension_reason', b.suspension_reason,
               'statement', b.statement, 'divergence', b.divergence, 'assumptions', b.assumptions, 'signpost', b.signpost,
               'consequence', b.consequence, 'consequence_class', b.consequence_class, 'owner_principal_id', b.owner_principal_id, 'added_in_version', b.added_in_version,
               'indicator', CASE WHEN i.indicator_id IS NULL THEN NULL ELSE jsonb_build_object(
                  'indicator_id', i.indicator_id, 'series_key', i.series_key, 'comparator', i.comparator, 'threshold', i.threshold, 'consecutive_days', i.consecutive_days,
                  'last_value', i.last_value, 'last_observation_at', i.last_observation_at, 'last_evaluated_at', i.last_evaluated_at, 'streak', i.streak, 'breached', i.breached,
                  'breached_at', i.breached_at, 'state', i.state, 'next_review_at', i.next_review_at,
                  'age_days', CASE WHEN i.last_observation_at IS NULL THEN NULL ELSE (clock_timestamp()::date - i.last_observation_at) END,
                  'freshness', CASE WHEN i.last_observation_at IS NULL THEN 'missing'
                                    WHEN (clock_timestamp()::date - i.last_observation_at) > prediction.scenario_set_stale_days() THEN 'stale' ELSE 'fresh' END) END,
               'elements', prediction.pss_elements_of(b.scenario_id, b.branch_id),
               'probability', prediction.pss_probability_of(b.branch_id))
             ORDER BY x.counts DESC, array_position(ARRAY['baseline', 'upside', 'downside', 'disruption', 'stress', 'adversarial', 'counterfactual', 'user-defined'], b.kind), sc.title, b.name)
        FROM prediction.scenario_set_branches(s.set_id) x
        JOIN prediction.branches_current b ON b.branch_id = x.branch_id
        JOIN prediction.scenarios_current sc ON sc.scenario_id = b.scenario_id
        LEFT JOIN prediction.indicators_current i ON i.indicator_id = b.indicator_id), '[]'::jsonb)) END
    FROM (SELECT 1) one LEFT JOIN prediction.scenario_sets s ON s.set_id = p_set_id $$;
GRANT EXECUTE ON FUNCTION prediction.scenario_set_compare(uuid) TO eye_app, eye_commit;

/* THE SET (a read): the row, its members (current and removed), the latest checks, the bindings, the latest portfolio reviews, the ledger's tail. */
CREATE OR REPLACE FUNCTION prediction.scenario_set_read(p_set_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = prediction, decision, pg_catalog, pg_temp AS $$
  SELECT CASE WHEN s.set_id IS NULL THEN NULL ELSE prediction.scenario_set_json(s) || jsonb_build_object(
    'members', coalesce((SELECT jsonb_agg((to_jsonb(m) - 'tenant_id' - 'domain_id' - 'correlation_id' - 'scope') || jsonb_build_object('scenario_title', sc.title, 'scenario_state', sc.state, 'branch_name', b.name, 'branch_kind', b.kind)
                                          ORDER BY m.removed_at NULLS FIRST, m.added_at)
                         FROM prediction.scenario_set_members m JOIN prediction.scenarios_current sc ON sc.scenario_id = m.scenario_id LEFT JOIN prediction.branches_current b ON b.branch_id = m.branch_id
                        WHERE m.set_id = s.set_id), '[]'::jsonb),
    'checks', coalesce((SELECT jsonb_agg(to_jsonb(c) - 'tenant_id' - 'domain_id' - 'correlation_id' - 'scope' ORDER BY c.as_of DESC)
                        FROM (SELECT * FROM prediction.scenario_set_checks c0 WHERE c0.set_id = s.set_id ORDER BY c0.as_of DESC LIMIT 10) c), '[]'::jsonb),
    'bindings', coalesce((SELECT jsonb_agg(jsonb_build_object('binding_id', ps.binding_id, 'package_id', ps.package_id, 'package_title', p.title, 'package_state', p.state, 'current_version', p.current_version, 'bound_by', ps.bound_by, 'bound_at', ps.bound_at) ORDER BY ps.bound_at)
                          FROM decision.package_scenario_sets ps LEFT JOIN decision.packages_current p ON p.package_id = ps.package_id WHERE ps.set_id = s.set_id), '[]'::jsonb),
    'reviews', coalesce((SELECT jsonb_agg(to_jsonb(r) - 'tenant_id' - 'domain_id' - 'correlation_id' - 'scope' ORDER BY r.reviewed_at DESC)
                         FROM (SELECT * FROM prediction.portfolio_reviews r0 WHERE r0.set_id = s.set_id ORDER BY r0.reviewed_at DESC LIMIT 5) r), '[]'::jsonb),
    'events', coalesce((SELECT jsonb_agg(jsonb_build_object('event', e.event, 'set_version', e.set_version, 'actor', e.actor_principal_id, 'details', e.details, 'occurred_at', e.occurred_at) ORDER BY e.occurred_at DESC, e.event_id)
                        FROM (SELECT * FROM prediction.scenario_set_events e0 WHERE e0.set_id = s.set_id ORDER BY e0.occurred_at DESC, e0.event_id LIMIT 30) e), '[]'::jsonb)) END
    FROM (SELECT 1) one LEFT JOIN prediction.scenario_sets s ON s.set_id = p_set_id $$;
GRANT EXECUTE ON FUNCTION prediction.scenario_set_read(uuid) TO eye_app, eye_commit;

-- ═════════════════════════════════════════════════════════════════════
-- §S.4 THE PORTFOLIO REVIEW
-- ═════════════════════════════════════════════════════════════════════
/* REVIEW (prediction.scenario.set.review): a named human's review of an ACTIVE set. p_members rates EVERY current member
   [{member_id, relevance: low|medium|high, consequence: C0..C4, note?}]; p_options names the options [{key, title}] — or NULL/[] to take the
   options of the bound package's current version (by key); p_payoffs is the option × branch matrix {option_key: {branch_id: number}} over
   EVERY live branch of the set (p_unit names the payoff's unit); p_retirements PROPOSES retirements [{scenario_id, note}] of member
   scenarios (the scenario owner's review retires). The port computes ROBUSTNESS (the worst payoff of an option over the live branches) and
   the maximum REGRET (max over branches of best-in-branch − the option's payoff), the most robust and least-regret options, and names the
   kinds the plurality policy misses. */
CREATE OR REPLACE FUNCTION prediction.review_scenario_portfolio(
  p_review_id uuid, p_set_id uuid, p_tenant uuid, p_domain uuid, p_members jsonb, p_options jsonb, p_payoffs jsonb, p_unit text, p_retirements jsonb, p_note text, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, decision, executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE s prediction.scenario_sets%ROWTYPE; v_plural jsonb; v_branches jsonb; v_options jsonb; v_members jsonb := '[]'::jsonb; v_pkg uuid; v_pkg_version int; e jsonb; m prediction.scenario_set_members%ROWTYPE;
        o record; b record; v_val numeric; v_rob jsonb := '{}'::jsonb; v_reg jsonb := '{}'::jsonb; v_best numeric; v_worst numeric; v_max_reg numeric; v_top numeric; v_low numeric;
        v_most text[]; v_least text[]; v_ret jsonb := '[]'::jsonb; v_keys text[]; v_live uuid[]; v_out prediction.portfolio_reviews%ROWTYPE; v_payoffs jsonb := '{}'::jsonb; row_obj jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.scenario.set.review']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'portfolio review rejected (actor): reviewed by the acting principal' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM identity.principals x WHERE x.id = p_actor AND x.kind = 'human' AND x.status = 'active') THEN
    RAISE EXCEPTION 'portfolio review rejected (actor): a portfolio review is a named human''s act' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO s FROM prediction.scenario_sets x WHERE x.set_id = p_set_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'portfolio review rejected (unknown_set): % is not a scenario set of this domain', p_set_id USING ERRCODE = '23503'; END IF;
  IF s.state <> 'active' THEN RAISE EXCEPTION 'portfolio review rejected (state): set % is %; an active set is reviewed', p_set_id, s.state USING ERRCODE = '22023'; END IF;
  IF p_note IS NULL OR length(btrim(p_note)) NOT BETWEEN 8 AND 4000 THEN RAISE EXCEPTION 'portfolio review rejected (note): a review states its conclusion (8 to 4000 characters)' USING ERRCODE = '22023'; END IF;
  IF p_unit IS NULL OR length(btrim(p_unit)) NOT BETWEEN 1 AND 64 THEN RAISE EXCEPTION 'portfolio review rejected (unit): the payoffs name their unit (1 to 64 characters)' USING ERRCODE = '22023'; END IF;
  -- the MEMBERS: every current member rated once — relevance and consequence
  IF p_members IS NULL OR jsonb_typeof(p_members) <> 'array' THEN RAISE EXCEPTION 'portfolio review rejected (members): the review rates every member [{member_id, relevance, consequence}]' USING ERRCODE = '22023'; END IF;
  FOR e IN SELECT x FROM jsonb_array_elements(p_members) x LOOP
    IF jsonb_typeof(e) <> 'object' OR jsonb_typeof(e -> 'member_id') <> 'string' OR (e ->> 'member_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'portfolio review rejected (members): each rating names a member_id' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO m FROM prediction.scenario_set_members x WHERE x.member_id = (e ->> 'member_id')::uuid AND x.set_id = p_set_id AND x.removed_at IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'portfolio review rejected (unknown_member): % is not a current member of set %', e ->> 'member_id', p_set_id USING ERRCODE = '23503'; END IF;
    IF coalesce(e ->> 'relevance', '') NOT IN ('low', 'medium', 'high') THEN RAISE EXCEPTION 'portfolio review rejected (relevance): member % is rated low, medium or high', m.member_id USING ERRCODE = '22023'; END IF;
    IF coalesce(e ->> 'consequence', '') NOT IN ('C0', 'C1', 'C2', 'C3', 'C4') THEN RAISE EXCEPTION 'portfolio review rejected (consequence): member % carries a consequence class C0..C4', m.member_id USING ERRCODE = '22023'; END IF;
    v_members := v_members || jsonb_build_object('member_id', m.member_id, 'scenario_id', m.scenario_id, 'branch_id', m.branch_id, 'relevance', e ->> 'relevance', 'consequence', e ->> 'consequence', 'note', nullif(btrim(coalesce(e ->> 'note', '')), ''));
  END LOOP;
  IF (SELECT count(DISTINCT x ->> 'member_id') FROM jsonb_array_elements(v_members) x) <> jsonb_array_length(v_members)
     OR jsonb_array_length(v_members) <> (SELECT count(*) FROM prediction.scenario_set_members x WHERE x.set_id = p_set_id AND x.removed_at IS NULL) THEN
    RAISE EXCEPTION 'portfolio review rejected (members): every current member of the set is rated exactly once (% rating(s) for % member(s))', jsonb_array_length(v_members),
      (SELECT count(*) FROM prediction.scenario_set_members x WHERE x.set_id = p_set_id AND x.removed_at IS NULL) USING ERRCODE = '22023';
  END IF;
  -- the OPTIONS: named, or the bound package's current version's
  IF p_options IS NULL OR (jsonb_typeof(p_options) = 'array' AND jsonb_array_length(p_options) = 0) THEN
    SELECT ps.package_id, p.current_version INTO v_pkg, v_pkg_version FROM decision.package_scenario_sets ps JOIN decision.packages_current p ON p.package_id = ps.package_id
     WHERE ps.set_id = p_set_id ORDER BY ps.bound_at DESC LIMIT 1;
    IF v_pkg IS NULL OR v_pkg_version IS NULL THEN RAISE EXCEPTION 'portfolio review rejected (options): the set is bound to no package with a version; name the options [{key, title}]' USING ERRCODE = '22023'; END IF;
    SELECT coalesce(jsonb_agg(jsonb_build_object('key', o2.key, 'title', o2.title, 'source', 'package') ORDER BY o2.key), '[]'::jsonb) INTO v_options FROM decision.options o2 WHERE o2.package_id = v_pkg AND o2.version = v_pkg_version;
  ELSE
    IF jsonb_typeof(p_options) <> 'array' THEN RAISE EXCEPTION 'portfolio review rejected (options): the options are a list [{key, title}]' USING ERRCODE = '22023'; END IF;
    v_options := '[]'::jsonb;
    FOR e IN SELECT x FROM jsonb_array_elements(p_options) x LOOP
      IF jsonb_typeof(e) <> 'object' OR coalesce(e ->> 'key', '') !~ '^[a-z0-9][a-z0-9_-]{0,63}$' OR length(btrim(coalesce(e ->> 'title', ''))) NOT BETWEEN 2 AND 256 THEN
        RAISE EXCEPTION 'portfolio review rejected (options): each option has a key (lower-case, 1-64) and a title (2-256 characters)' USING ERRCODE = '22023';
      END IF;
      v_options := v_options || jsonb_build_object('key', e ->> 'key', 'title', btrim(e ->> 'title'), 'source', 'named');
    END LOOP;
  END IF;
  v_keys := ARRAY(SELECT x ->> 'key' FROM jsonb_array_elements(v_options) x);
  IF cardinality(v_keys) < 2 OR cardinality(v_keys) > 12 OR cardinality(v_keys) <> (SELECT count(DISTINCT k) FROM unnest(v_keys) k) THEN
    RAISE EXCEPTION 'portfolio review rejected (options): a review compares 2 to 12 options, each key once (% given)', cardinality(v_keys) USING ERRCODE = '22023';
  END IF;
  -- the LIVE branches the matrix is over
  SELECT coalesce(array_agg(x.branch_id ORDER BY x.branch_id), ARRAY[]::uuid[]), coalesce(jsonb_agg(jsonb_build_object('branch_id', x.branch_id, 'scenario_id', x.scenario_id, 'name', x.name, 'kind', x.kind, 'kind_label', x.kind_label) ORDER BY x.branch_id), '[]'::jsonb)
    INTO v_live, v_branches FROM prediction.scenario_set_branches(p_set_id) x WHERE x.counts;
  IF cardinality(v_live) = 0 THEN RAISE EXCEPTION 'portfolio review rejected (state): set % counts no live branch; nothing to weigh the options against', p_set_id USING ERRCODE = '22023'; END IF;
  -- the PAYOFF matrix: every option × every live branch a number; nothing else
  IF p_payoffs IS NULL OR jsonb_typeof(p_payoffs) <> 'object' THEN RAISE EXCEPTION 'portfolio review rejected (payoffs): the payoffs are an object {option_key: {branch_id: number}}' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_object_keys(p_payoffs) k WHERE k <> ALL (v_keys)) THEN
    RAISE EXCEPTION 'portfolio review rejected (payoffs): % is not an option of this review (%)', (SELECT k FROM jsonb_object_keys(p_payoffs) k WHERE k <> ALL (v_keys) LIMIT 1), array_to_string(v_keys, ', ') USING ERRCODE = '22023';
  END IF;
  FOREACH row_obj IN ARRAY ARRAY(SELECT jsonb_build_object('k', k) FROM unnest(v_keys) k) LOOP
    IF jsonb_typeof(p_payoffs -> (row_obj ->> 'k')) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'portfolio review rejected (payoffs): option % has no payoff row {branch_id: number}', row_obj ->> 'k' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_object_keys(p_payoffs -> (row_obj ->> 'k')) bk WHERE bk !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' OR bk::uuid <> ALL (v_live)) THEN
      RAISE EXCEPTION 'portfolio review rejected (payoffs): option % names a branch that is not a live branch of the set', row_obj ->> 'k' USING ERRCODE = '22023';
    END IF;
    FOR b IN SELECT unnest(v_live) AS branch_id LOOP
      IF jsonb_typeof(p_payoffs -> (row_obj ->> 'k') -> b.branch_id::text) IS DISTINCT FROM 'number' THEN
        RAISE EXCEPTION 'portfolio review rejected (payoffs): option % has no payoff for the live branch % (every option is weighed against every live branch)', row_obj ->> 'k', b.branch_id USING ERRCODE = '22023';
      END IF;
    END LOOP;
    v_payoffs := v_payoffs || jsonb_build_object(row_obj ->> 'k', p_payoffs -> (row_obj ->> 'k'));
  END LOOP;
  -- ROBUSTNESS (the worst payoff) and the maximum REGRET (max over branches of best-in-branch − the option's payoff)
  FOR o IN SELECT unnest(v_keys) AS k LOOP
    v_worst := NULL; v_max_reg := 0;
    FOR b IN SELECT unnest(v_live) AS branch_id LOOP
      v_val := (v_payoffs -> o.k ->> b.branch_id::text)::numeric;
      SELECT max((v_payoffs -> k2 ->> b.branch_id::text)::numeric) INTO v_best FROM unnest(v_keys) k2;
      v_worst := CASE WHEN v_worst IS NULL THEN v_val ELSE least(v_worst, v_val) END;
      v_max_reg := greatest(v_max_reg, v_best - v_val);
    END LOOP;
    v_rob := v_rob || jsonb_build_object(o.k, v_worst);
    v_reg := v_reg || jsonb_build_object(o.k, v_max_reg);
  END LOOP;
  SELECT max((v_rob ->> k)::numeric), min((v_reg ->> k)::numeric) INTO v_top, v_low FROM unnest(v_keys) k;
  v_most := ARRAY(SELECT k FROM unnest(v_keys) k WHERE (v_rob ->> k)::numeric = v_top ORDER BY k);
  v_least := ARRAY(SELECT k FROM unnest(v_keys) k WHERE (v_reg ->> k)::numeric = v_low ORDER BY k);
  -- the RETIREMENTS proposed (member scenarios only)
  IF p_retirements IS NOT NULL AND jsonb_typeof(p_retirements) <> 'array' THEN RAISE EXCEPTION 'portfolio review rejected (retirements): retirements are a list [{scenario_id, note}]' USING ERRCODE = '22023'; END IF;
  FOR e IN SELECT x FROM jsonb_array_elements(coalesce(p_retirements, '[]'::jsonb)) x LOOP
    IF jsonb_typeof(e) <> 'object' OR coalesce(e ->> 'scenario_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' OR length(btrim(coalesce(e ->> 'note', ''))) < 8 THEN
      RAISE EXCEPTION 'portfolio review rejected (retirements): each proposed retirement names a scenario_id and a note (8+ characters)' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM prediction.scenario_set_members x WHERE x.set_id = p_set_id AND x.scenario_id = (e ->> 'scenario_id')::uuid AND x.removed_at IS NULL) THEN
      RAISE EXCEPTION 'portfolio review rejected (unknown_member): scenario % is not a member of set %', e ->> 'scenario_id', p_set_id USING ERRCODE = '23503';
    END IF;
    v_ret := v_ret || jsonb_build_object('scenario_id', (e ->> 'scenario_id')::uuid, 'note', btrim(e ->> 'note'), 'owner', (SELECT owner_principal_id FROM prediction.scenarios_current WHERE scenario_id = (e ->> 'scenario_id')::uuid),
                                         'act', 'the scenario owner retires it through the review (outcome retire)');
  END LOOP;
  v_plural := prediction.scenario_set_plurality(p_set_id);
  IF v_pkg IS NULL THEN
    SELECT ps.package_id, p.current_version INTO v_pkg, v_pkg_version FROM decision.package_scenario_sets ps JOIN decision.packages_current p ON p.package_id = ps.package_id
     WHERE ps.set_id = p_set_id AND p.current_version IS NOT NULL ORDER BY ps.bound_at DESC LIMIT 1;
  END IF;
  INSERT INTO prediction.portfolio_reviews (review_id, scope, tenant_id, domain_id, set_id, set_version, package_id, package_version, reviewer, members, branches, options, payoffs, robustness, regret,
                                            most_robust, least_regret, missing_kinds, plurality, retirements_proposed, payoff_unit, note, correlation_id)
  VALUES (p_review_id, 'DOMAIN', p_tenant, p_domain, p_set_id, s.version, v_pkg, v_pkg_version, p_actor, v_members, v_branches, v_options, v_payoffs, v_rob, v_reg,
          v_most, v_least, ARRAY(SELECT jsonb_array_elements_text(v_plural -> 'missing_kinds')), v_plural, v_ret, btrim(p_unit), btrim(p_note), p_correlation) RETURNING * INTO v_out;
  PERFORM prediction.pss_event(p_set_id, p_tenant, p_domain, 'set.reviewed', s.version, p_actor,
            jsonb_build_object('review_id', p_review_id, 'most_robust', to_jsonb(v_most), 'least_regret', to_jsonb(v_least), 'missing_kinds', v_plural -> 'missing_kinds', 'retirements_proposed', jsonb_array_length(v_ret)), p_correlation);
  RETURN to_jsonb(v_out) - 'tenant_id' - 'domain_id' - 'correlation_id' - 'scope';
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.review_scenario_portfolio(uuid,uuid,uuid,uuid,jsonb,jsonb,jsonb,text,jsonb,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.review_scenario_portfolio(uuid,uuid,uuid,uuid,jsonb,jsonb,jsonb,text,jsonb,text,uuid,uuid) TO eye_commit;

-- ═════════════════════════════════════════════════════════════════════
-- §S.5 LIVING SCENARIOS
-- ═════════════════════════════════════════════════════════════════════
/* THE RELEVANCE of one scenario (pure; the rule v1): movement = the largest, over the scenario's live non-baseline branches, of 1 for a
   breached indicator and streak / consecutive_days otherwise (how far the run toward the threshold has gone); signposts = the live
   branches whose indicator is breached; review_due = next_review_due_at has passed. score = min(1, 0.6·movement + 0.2·[signposts > 0] +
   0.2·[review_due]), rounded to 3 places. */
CREATE OR REPLACE FUNCTION prediction.scenario_relevance_of(p_scenario_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = prediction, pg_catalog, pg_temp AS $$
  WITH br AS (
    SELECT b.branch_id, b.name, b.kind, i.indicator_id, i.breached, i.breached_at, i.streak, i.consecutive_days, i.last_value, i.threshold, i.comparator,
           CASE WHEN i.indicator_id IS NULL THEN 0::numeric WHEN i.breached THEN 1::numeric ELSE least(1::numeric, greatest(0, i.streak)::numeric / greatest(1, i.consecutive_days)) END AS movement
      FROM prediction.branches_current b LEFT JOIN prediction.indicators_current i ON i.indicator_id = b.indicator_id
     WHERE b.scenario_id = p_scenario_id AND prediction.branch_live(b.state) AND b.kind <> 'baseline'),
  agg AS (SELECT coalesce(max(movement), 0) AS movement, count(*) FILTER (WHERE breached) AS signposts,
                 coalesce(jsonb_agg(jsonb_build_object('branch_id', branch_id, 'name', name, 'kind', kind, 'indicator_id', indicator_id, 'movement', round(movement, 3), 'breached', coalesce(breached, false),
                                                       'breached_at', breached_at, 'streak', streak, 'consecutive_days', consecutive_days, 'last_value', last_value, 'comparator', comparator, 'threshold', threshold) ORDER BY name), '[]'::jsonb) AS branches
            FROM br),
  sc AS (SELECT s.next_review_due_at, s.next_review_due_at IS NOT NULL AND s.next_review_due_at < clock_timestamp() AS review_due FROM prediction.scenarios_current s WHERE s.scenario_id = p_scenario_id)
  SELECT jsonb_build_object(
    'score', round(least(1::numeric, 0.6 * agg.movement + CASE WHEN agg.signposts > 0 THEN 0.2 ELSE 0 END + CASE WHEN sc.review_due THEN 0.2 ELSE 0 END), 3),
    'basis', jsonb_build_object('rule', 'relevance v1: min(1, 0.6·movement + 0.2·signpost breached + 0.2·review due)', 'movement', round(agg.movement, 3), 'signposts_breached', agg.signposts,
                                'review_due', sc.review_due, 'next_review_due_at', sc.next_review_due_at, 'branches', agg.branches))
    FROM agg, sc $$;
GRANT EXECUTE ON FUNCTION prediction.scenario_relevance_of(uuid) TO eye_app, eye_commit;

/* SCORE (the tick step `scenario-relevance`, executive.attention.tick; or a person's act, prediction.scenario.relevance.score): every
   ACTIVE scenario that is a member of an ACTIVE set of this domain (the living portfolio) is scored; a row and the scenario's
   `scenario.relevance_scored` only when the score or its basis changed since the last row; each live branch whose signpost (indicator) is
   breached notifies the scenario OWNER ONCE per breach (`scenario.signpost_notified` on the scenario's ledger, the attention item of class
   scenario.signpost on the branch). */
CREATE OR REPLACE FUNCTION prediction.score_scenario_relevance(p_tenant uuid, p_domain uuid, p_trigger text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE x record; br record; v jsonb; last prediction.scenario_relevance%ROWTYPE; v_scored int := 0; v_changed int := 0; v_notified int := 0; v_ev uuid; v_item uuid; v_state text; v_due timestamptz;
        v_out jsonb := '[]'::jsonb; v_reasons jsonb; v_basis_cmp jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.attention.tick', 'prediction.scenario.relevance.score']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_trigger IS NULL OR p_trigger NOT IN ('tick', 'operator') THEN RAISE EXCEPTION 'scenario set rejected (trigger): relevance is scored by the tick or an operator' USING ERRCODE = '22023'; END IF;
  FOR x IN SELECT DISTINCT sc.scenario_id, sc.title, sc.owner_principal_id FROM prediction.scenarios_current sc
             JOIN prediction.scenario_set_members m ON m.scenario_id = sc.scenario_id AND m.removed_at IS NULL
             JOIN prediction.scenario_sets s ON s.set_id = m.set_id AND s.state = 'active'
            WHERE sc.tenant_id = p_tenant AND sc.domain_id = p_domain AND sc.state = 'active' ORDER BY sc.scenario_id LOOP
    v := prediction.scenario_relevance_of(x.scenario_id);
    v_scored := v_scored + 1;
    SELECT * INTO last FROM prediction.scenario_relevance r WHERE r.scenario_id = x.scenario_id ORDER BY r.scored_at DESC, r.relevance_id DESC LIMIT 1;
    -- the basis compared without the instants that move by themselves
    v_basis_cmp := (v -> 'basis') - 'next_review_due_at';
    IF last.relevance_id IS NULL OR last.score <> (v ->> 'score')::numeric OR (last.basis - 'next_review_due_at') IS DISTINCT FROM v_basis_cmp THEN
      INSERT INTO prediction.scenario_relevance (relevance_id, scope, tenant_id, domain_id, scenario_id, score, basis, trigger, scored_by, correlation_id)
      VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, x.scenario_id, (v ->> 'score')::numeric, v -> 'basis', p_trigger, p_actor, p_correlation);
      INSERT INTO prediction.scenario_events (event_id, scope, tenant_id, domain_id, scenario_id, event, actor_principal_id, details, correlation_id)
      VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, x.scenario_id, 'scenario.relevance_scored', p_actor, jsonb_build_object('score', (v ->> 'score')::numeric, 'prior', last.score, 'trigger', p_trigger), p_correlation);
      v_changed := v_changed + 1;
    END IF;
    -- the SIGNPOSTS: once per breach (the branch, the indicator's breached_at)
    FOR br IN SELECT b.branch_id, b.name, i.indicator_id, i.breached_at, i.series_key, i.comparator, i.threshold, i.last_value
                FROM prediction.branches_current b JOIN prediction.indicators_current i ON i.indicator_id = b.indicator_id
               WHERE b.scenario_id = x.scenario_id AND prediction.branch_live(b.state) AND i.breached AND i.breached_at IS NOT NULL ORDER BY b.branch_id LOOP
      CONTINUE WHEN EXISTS (SELECT 1 FROM prediction.scenario_events e WHERE e.scenario_id = x.scenario_id AND e.event = 'scenario.signpost_notified'
                              AND e.branch_id = br.branch_id AND (e.details ->> 'breached_at')::timestamptz = br.breached_at);
      v_ev := gen_random_uuid(); v_item := gen_random_uuid(); v_due := clock_timestamp() + interval '24 hours';
      v_state := CASE WHEN EXISTS (SELECT 1 FROM identity.principals p WHERE p.id = x.owner_principal_id AND p.kind = 'human' AND p.status = 'active') THEN 'open' ELSE 'unrouted' END;
      INSERT INTO prediction.scenario_events (event_id, scope, tenant_id, domain_id, scenario_id, branch_id, event, actor_principal_id, details, correlation_id)
      VALUES (v_ev, 'DOMAIN', p_tenant, p_domain, x.scenario_id, br.branch_id, 'scenario.signpost_notified', p_actor,
              jsonb_build_object('indicator_id', br.indicator_id, 'breached_at', br.breached_at, 'item_id', v_item, 'owner', x.owner_principal_id), p_correlation);
      v_reasons := jsonb_build_array(format('the signpost of branch "%s" is breached: %s %s %s (last %s) since %s', br.name, br.series_key, br.comparator, br.threshold, coalesce(br.last_value::text, '—'), br.breached_at),
                                     'the scenario is a member of an active set: review its relevance and the set''s portfolio');
      INSERT INTO executive.attention_items (item_id, scope, tenant_id, domain_id, signal_class, subject_kind, subject_id, cause_event_id, cause_event_type, title, outcome, state, owner_principal_id, route_roles, evaluation, details, due_at, escalations, correlation_id)
      VALUES (v_item, 'DOMAIN', p_tenant, p_domain, 'scenario.signpost', 'branch', br.branch_id, v_ev, 'ScenarioSignpostBreached',
              left(format('Signpost breached: %s — %s', x.title, br.name), 512), 'material', v_state, x.owner_principal_id, '{}',
              jsonb_build_object('outcome', 'material', 'reasons', v_reasons, 'policy_version', NULL, 'dimensions', jsonb_build_object('consequence', 'C2', 'confidence', 1)),
              jsonb_build_object('scenario_id', x.scenario_id, 'branch_id', br.branch_id, 'indicator_id', br.indicator_id, 'breached_at', br.breached_at), v_due, 0, p_correlation);
      PERFORM executive.attention_event(v_item, p_tenant, p_domain, CASE v_state WHEN 'open' THEN 'item.routed' ELSE 'item.unrouted' END, p_actor,
                jsonb_build_object('outcome', 'material', 'reasons', v_reasons, 'policy_version', NULL, 'owner', x.owner_principal_id, 'route_roles', '[]'::jsonb, 'due_at', v_due,
                                   'cause_event_id', v_ev, 'cause_event_type', 'ScenarioSignpostBreached', 'unrouted', v_state = 'unrouted', 'scenario_id', x.scenario_id), p_correlation);
      v_notified := v_notified + 1;
    END LOOP;
    v_out := v_out || jsonb_build_object('scenario_id', x.scenario_id, 'score', (v ->> 'score')::numeric, 'changed', last.relevance_id IS NULL OR last.score <> (v ->> 'score')::numeric OR (last.basis - 'next_review_due_at') IS DISTINCT FROM v_basis_cmp);
  END LOOP;
  RETURN jsonb_build_object('scored', v_scored, 'changed', v_changed, 'signposts_notified', v_notified, 'scenarios', v_out);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.score_scenario_relevance(uuid,uuid,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.score_scenario_relevance(uuid,uuid,text,uuid,uuid) TO eye_commit;

-- ═════════════════════════════════════════════════════════════════════
-- §S.6 CREATION TRIGGERS
-- ═════════════════════════════════════════════════════════════════════
/* PROPOSE (prediction.scenario.proposal.propose): a person (or an agent holding the action) proposes that a scenario be declared, naming
   the SOURCE the port validates:
     forecast_shift  {forecast_id, band_pct}: the forecast superseded an earlier one of its series and horizon and its median moved beyond
                     band_pct (0 < band_pct ≤ 10, a fraction of the earlier median) — the scenarios built on the earlier forecast are named;
     weak_signal     {signal_id}: a weak signal of this domain a named human ESCALATED (0088);
     risk            {exposure_id}: an ACCEPTED exposure whose newest residual breaches its appetite (0089);
     planning_cycle  {cadence_id}: a cadence of this domain that was RESET (0094) — the reset event is the source.
   One OPEN proposal per source; routed to the domain's strategy owners (scenario.proposal); the related scenario's ledger records it. */
CREATE OR REPLACE FUNCTION prediction.propose_scenario(
  p_proposal_id uuid, p_tenant uuid, p_domain uuid, p_kind text, p_source jsonb, p_title text, p_rationale text, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_key text; v_facts jsonb; v_related uuid; f prediction.forecasts_current%ROWTYPE; prev prediction.forecasts_current%ROWTYPE; v_band numeric; v_shift numeric;
        sig prediction.signals_current%ROWTYPE; ex record; res record; cad record; v_kind text; v_item uuid; v_state text; v_reasons jsonb; v_due timestamptz; r prediction.scenario_proposals%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.scenario.proposal.propose']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'scenario proposal rejected (actor): proposed by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT kind INTO v_kind FROM identity.principals WHERE id = p_actor;
  IF p_kind IS NULL OR p_kind NOT IN ('forecast_shift', 'weak_signal', 'risk', 'planning_cycle') THEN
    RAISE EXCEPTION 'scenario proposal rejected (kind): a proposal comes from a forecast_shift, a weak_signal, a risk or a planning_cycle' USING ERRCODE = '22023';
  END IF;
  IF p_title IS NULL OR length(btrim(p_title)) NOT BETWEEN 4 AND 256 THEN RAISE EXCEPTION 'scenario proposal rejected (title): a proposal names the scenario it proposes (4 to 256 characters)' USING ERRCODE = '22023'; END IF;
  IF p_rationale IS NULL OR length(btrim(p_rationale)) NOT BETWEEN 8 AND 4000 THEN RAISE EXCEPTION 'scenario proposal rejected (rationale): a proposal says why (8 to 4000 characters)' USING ERRCODE = '22023'; END IF;
  IF p_source IS NULL OR jsonb_typeof(p_source) <> 'object' THEN RAISE EXCEPTION 'scenario proposal rejected (source): the source is an object naming the object it rests on' USING ERRCODE = '22023'; END IF;
  IF p_kind = 'forecast_shift' THEN
    IF coalesce(p_source ->> 'forecast_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' OR jsonb_typeof(p_source -> 'band_pct') <> 'number' THEN
      RAISE EXCEPTION 'scenario proposal rejected (source): a forecast shift names {forecast_id, band_pct}' USING ERRCODE = '22023';
    END IF;
    v_band := (p_source ->> 'band_pct')::numeric;
    IF v_band <= 0 OR v_band > 10 THEN RAISE EXCEPTION 'scenario proposal rejected (source): band_pct is a fraction of the earlier median in (0, 10]' USING ERRCODE = '22023'; END IF;
    SELECT * INTO f FROM prediction.forecasts_current x WHERE x.forecast_id = (p_source ->> 'forecast_id')::uuid AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
    IF NOT FOUND THEN RAISE EXCEPTION 'scenario proposal rejected (unknown_forecast): % is not a forecast of this domain', p_source ->> 'forecast_id' USING ERRCODE = '23503'; END IF;
    SELECT * INTO prev FROM prediction.forecasts_current x WHERE x.superseded_by = f.forecast_id ORDER BY x.issued_at DESC LIMIT 1;
    IF NOT FOUND THEN RAISE EXCEPTION 'scenario proposal rejected (source): forecast % superseded no earlier forecast of its series and horizon; a shift is measured against the one it replaced', f.forecast_id USING ERRCODE = '22023'; END IF;
    v_shift := abs((f.quantiles ->> 'q50')::numeric - (prev.quantiles ->> 'q50')::numeric) / nullif(abs((prev.quantiles ->> 'q50')::numeric), 0);
    IF v_shift IS NOT NULL AND v_shift <= v_band THEN
      RAISE EXCEPTION 'scenario proposal rejected (within_band): the median moved % → % (a shift of %), within the stated band %', prev.quantiles ->> 'q50', f.quantiles ->> 'q50', round(v_shift, 4), v_band USING ERRCODE = '22023';
    END IF;
    v_key := f.forecast_id::text;
    SELECT s.scenario_id INTO v_related FROM prediction.scenarios_current s WHERE s.tenant_id = p_tenant AND s.domain_id = p_domain AND s.state = 'active' AND s.forecast_id IN (prev.forecast_id, f.forecast_id) ORDER BY s.declared_at LIMIT 1;
    v_facts := jsonb_build_object('forecast_id', f.forecast_id, 'series_key', f.series_key, 'horizon', f.horizon_code, 'q50', (f.quantiles ->> 'q50')::numeric, 'superseded_forecast_id', prev.forecast_id,
                                  'prior_q50', (prev.quantiles ->> 'q50')::numeric, 'shift', CASE WHEN v_shift IS NULL THEN NULL ELSE round(v_shift, 4) END, 'band_pct', v_band,
                                  'scenarios_on_earlier_forecast', (SELECT coalesce(jsonb_agg(s.scenario_id), '[]'::jsonb) FROM prediction.scenarios_current s WHERE s.forecast_id = prev.forecast_id AND s.state = 'active'));
  ELSIF p_kind = 'weak_signal' THEN
    IF coalesce(p_source ->> 'signal_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RAISE EXCEPTION 'scenario proposal rejected (source): a weak signal names {signal_id}' USING ERRCODE = '22023'; END IF;
    SELECT * INTO sig FROM prediction.signals_current x WHERE x.signal_id = (p_source ->> 'signal_id')::uuid AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
    IF NOT FOUND THEN RAISE EXCEPTION 'scenario proposal rejected (unknown_signal): % is not a weak signal of this domain', p_source ->> 'signal_id' USING ERRCODE = '23503'; END IF;
    IF sig.disposition IS DISTINCT FROM 'escalate' THEN
      RAISE EXCEPTION 'scenario proposal rejected (source): signal % is % (disposition %); a proposal rests on an ESCALATED weak signal', sig.signal_id, sig.maturity, coalesce(sig.disposition, 'none') USING ERRCODE = '22023';
    END IF;
    v_key := sig.signal_id::text;
    v_facts := jsonb_build_object('signal_id', sig.signal_id, 'title', sig.title, 'maturity', sig.maturity, 'disposition', sig.disposition, 'disposition_by', sig.disposition_by, 'disposition_at', sig.disposition_at, 'candidate_id', sig.candidate_id);
  ELSIF p_kind = 'risk' THEN
    IF coalesce(p_source ->> 'exposure_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RAISE EXCEPTION 'scenario proposal rejected (source): a risk names {exposure_id}' USING ERRCODE = '22023'; END IF;
    SELECT x.exposure_id, x.title, x.state, x.accepted_version INTO ex FROM prediction.exposure_current x WHERE x.exposure_id = (p_source ->> 'exposure_id')::uuid AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
    IF ex.exposure_id IS NULL THEN RAISE EXCEPTION 'scenario proposal rejected (unknown_exposure): % is not an exposure of this domain', p_source ->> 'exposure_id' USING ERRCODE = '23503'; END IF;
    SELECT r2.residual_high, r2.threshold, r2.breach, r2.unit, r2.computed_at INTO res FROM prediction.exposure_residuals r2 WHERE r2.exposure_id = ex.exposure_id ORDER BY r2.computed_at DESC LIMIT 1;
    IF ex.state <> 'accepted' OR res.breach IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'scenario proposal rejected (source): exposure % is % and its newest residual is %; a proposal rests on an accepted exposure above its appetite', ex.exposure_id, ex.state,
        CASE WHEN res.breach IS TRUE THEN 'outside appetite' WHEN res.breach IS FALSE THEN 'within appetite' ELSE 'not judged against an appetite' END USING ERRCODE = '22023';
    END IF;
    v_key := ex.exposure_id::text;
    v_facts := jsonb_build_object('exposure_id', ex.exposure_id, 'title', ex.title, 'state', ex.state, 'accepted_version', ex.accepted_version, 'residual_high', res.residual_high, 'threshold', res.threshold, 'unit', res.unit, 'computed_at', res.computed_at);
  ELSE
    IF coalesce(p_source ->> 'cadence_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RAISE EXCEPTION 'scenario proposal rejected (source): a planning cycle names {cadence_id}' USING ERRCODE = '22023'; END IF;
    SELECT e.event_id, e.event, e.occurred_at, e.cadence_id INTO cad FROM executive.cadence_events e WHERE e.cadence_id = (p_source ->> 'cadence_id')::uuid AND e.tenant_id = p_tenant AND e.domain_id = p_domain
       AND e.event IN ('cadence.reset', 'cadence.reset_confirmed') ORDER BY e.occurred_at DESC LIMIT 1;
    IF cad.event_id IS NULL THEN RAISE EXCEPTION 'scenario proposal rejected (source): cadence % of this domain has not been reset; a planning-cycle proposal rests on a reset', p_source ->> 'cadence_id' USING ERRCODE = '22023'; END IF;
    v_key := cad.event_id::text;
    v_facts := jsonb_build_object('cadence_id', cad.cadence_id, 'reset_event_id', cad.event_id, 'reset', cad.event, 'reset_at', cad.occurred_at);
  END IF;
  IF EXISTS (SELECT 1 FROM prediction.scenario_proposals x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.kind = p_kind AND x.source_key = v_key AND x.state = 'open') THEN
    RAISE EXCEPTION 'scenario proposal rejected (duplicate): a proposal from this % (%) is already open; resolve it first', p_kind, v_key USING ERRCODE = '22023';
  END IF;
  v_item := gen_random_uuid(); v_due := clock_timestamp() + interval '72 hours';
  v_state := CASE WHEN executive.role_holders(p_tenant, p_domain, ARRAY['strategy_owner']) > 0 THEN 'open' ELSE 'unrouted' END;
  INSERT INTO prediction.scenario_proposals (proposal_id, scope, tenant_id, domain_id, kind, source_ref, source_key, source_facts, related_scenario_id, title, rationale, proposed_by, proposed_kind, item_id, correlation_id)
  VALUES (p_proposal_id, 'DOMAIN', p_tenant, p_domain, p_kind, p_source, v_key, v_facts, v_related, btrim(p_title), btrim(p_rationale), p_actor, CASE WHEN v_kind = 'agent' THEN 'agent' ELSE 'human' END, v_item, p_correlation)
  RETURNING * INTO r;
  v_reasons := jsonb_build_array(format('a %s proposes the scenario "%s"', replace(p_kind, '_', ' '), btrim(p_title)), btrim(p_rationale),
                                 'accepting records the decision to declare it; the scenario is declared by its owner through the scenario route');
  -- the subject: the proposal (subject kind scenario — the would-be scenario; the details name the proposal)
  INSERT INTO executive.attention_items (item_id, scope, tenant_id, domain_id, signal_class, subject_kind, subject_id, cause_event_id, cause_event_type, title, outcome, state, owner_principal_id, route_roles, evaluation, details, due_at, escalations, correlation_id)
  VALUES (v_item, 'DOMAIN', p_tenant, p_domain, 'scenario.proposal', 'scenario', p_proposal_id, p_proposal_id, 'ScenarioProposed',
          left(format('Scenario proposed (%s): %s', replace(p_kind, '_', ' '), btrim(p_title)), 512), 'material', v_state, NULL, ARRAY['strategy_owner'],
          jsonb_build_object('outcome', 'material', 'reasons', v_reasons, 'policy_version', NULL, 'dimensions', jsonb_build_object('consequence', 'C2', 'confidence', 1)),
          jsonb_build_object('proposal_id', p_proposal_id, 'kind', p_kind, 'source', v_facts, 'related_scenario_id', v_related), v_due, 0, p_correlation);
  PERFORM executive.attention_event(v_item, p_tenant, p_domain, CASE v_state WHEN 'open' THEN 'item.routed' ELSE 'item.unrouted' END, p_actor,
            jsonb_build_object('outcome', 'material', 'reasons', v_reasons, 'policy_version', NULL, 'owner', NULL, 'route_roles', to_jsonb(ARRAY['strategy_owner']), 'due_at', v_due,
                               'cause_event_id', p_proposal_id, 'cause_event_type', 'ScenarioProposed', 'unrouted', v_state = 'unrouted', 'proposal_id', p_proposal_id), p_correlation);
  IF v_related IS NOT NULL THEN
    INSERT INTO prediction.scenario_events (event_id, scope, tenant_id, domain_id, scenario_id, event, actor_principal_id, details, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, v_related, 'scenario.proposed', p_actor, jsonb_build_object('proposal_id', p_proposal_id, 'kind', p_kind, 'title', btrim(p_title)), p_correlation);
  END IF;
  RETURN to_jsonb(r) - 'tenant_id' - 'domain_id' - 'correlation_id' - 'scope';
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.propose_scenario(uuid,uuid,uuid,text,jsonb,text,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.propose_scenario(uuid,uuid,uuid,text,jsonb,text,text,uuid,uuid) TO eye_commit;

/* RESOLVE (prediction.scenario.proposal.resolve): a named STRATEGY OWNER (or an administrator) who did not propose it accepts or dismisses
   an OPEN proposal with a note; the routed item closes; accepting never declares a scenario. */
CREATE OR REPLACE FUNCTION prediction.resolve_scenario_proposal(p_proposal_id uuid, p_tenant uuid, p_domain uuid, p_resolution text, p_note text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r prediction.scenario_proposals%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.scenario.proposal.resolve']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'scenario proposal rejected (actor): resolved by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO r FROM prediction.scenario_proposals x WHERE x.proposal_id = p_proposal_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'scenario proposal rejected (unknown_proposal): % is not a proposal of this domain', p_proposal_id USING ERRCODE = '23503'; END IF;
  IF NOT executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['strategy_owner', 'domain_admin', 'platform_admin']) THEN
    RAISE EXCEPTION 'scenario proposal rejected (authority): a proposal is resolved by a named strategy owner of the domain' USING ERRCODE = '42501';
  END IF;
  IF r.proposed_by = p_actor THEN RAISE EXCEPTION 'scenario proposal rejected (separation_of_duties): the proposer of a scenario does not resolve the proposal' USING ERRCODE = '42501'; END IF;
  IF r.state <> 'open' THEN RAISE EXCEPTION 'scenario proposal rejected (state): proposal % was % at %', p_proposal_id, r.state, r.resolved_at USING ERRCODE = '22023'; END IF;
  IF p_resolution IS NULL OR p_resolution NOT IN ('accepted', 'dismissed') THEN RAISE EXCEPTION 'scenario proposal rejected (resolution): a proposal is accepted or dismissed' USING ERRCODE = '22023'; END IF;
  IF p_note IS NULL OR length(btrim(p_note)) NOT BETWEEN 8 AND 4000 THEN RAISE EXCEPTION 'scenario proposal rejected (note): a resolution says why (8 to 4000 characters)' USING ERRCODE = '22023'; END IF;
  UPDATE prediction.scenario_proposals SET state = p_resolution, resolved_by = p_actor, resolved_at = clock_timestamp(), resolution_note = btrim(p_note) WHERE proposal_id = p_proposal_id RETURNING * INTO r;
  IF r.item_id IS NOT NULL AND EXISTS (SELECT 1 FROM executive.attention_items x WHERE x.item_id = r.item_id AND x.state <> 'closed') THEN
    UPDATE executive.attention_items SET state = 'closed', closed_at = clock_timestamp(), closed_by = p_actor, suppressed_until = NULL, updated_at = clock_timestamp() WHERE item_id = r.item_id;
    PERFORM executive.attention_event(r.item_id, p_tenant, p_domain, 'item.closed', p_actor, jsonb_build_object('reason', format('the proposal was %s', p_resolution), 'proposal_id', p_proposal_id), p_correlation);
  END IF;
  IF r.related_scenario_id IS NOT NULL THEN
    INSERT INTO prediction.scenario_events (event_id, scope, tenant_id, domain_id, scenario_id, event, actor_principal_id, details, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, r.related_scenario_id, 'scenario.proposal_resolved', p_actor, jsonb_build_object('proposal_id', p_proposal_id, 'resolution', p_resolution, 'note', btrim(p_note)), p_correlation);
  END IF;
  RETURN (to_jsonb(r) - 'tenant_id' - 'domain_id' - 'correlation_id' - 'scope') || jsonb_build_object('declares', 'nothing — the owner declares the scenario through the scenario route');
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.resolve_scenario_proposal(uuid,uuid,uuid,text,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.resolve_scenario_proposal(uuid,uuid,uuid,text,text,uuid,uuid) TO eye_commit;
