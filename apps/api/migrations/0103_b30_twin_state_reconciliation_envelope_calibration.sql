-- 0103 — CP-6 B30 (2026-10-02): TWIN STATE, RECONCILIATION, ENVELOPE AND CALIBRATION — F-P5-02 (state estimation and continuous
-- reconciliation: input qualification, declared estimators producing candidate state with disagreement retained, constraint validation
-- before publish, the owner's review of material changes, the Reconciliation Agent proposing only, triggers beyond graph corrections, requests
-- for new observations), F-P5-03 (the branch-aware state store: checkpoint restore, branch merge requiring reconciliation, component
-- confidence, staleness by age and dependency, the frozen validated snapshot with its freshness warning and expiry, the scenario element
-- kind, the ontology/policy revision on commits, the explorer with time travel), F-P5-04 (behaviours outside the calibrated envelope disabled
-- for decision use, raised approval thresholds, calibration against observed outcomes, the behaviour model's stewardship lifecycle, the
-- envelope exposed to AI consumers, degraded modes with fault tests); and the B30 carryovers of F-P5-06 (chunked method-fabric experiments,
-- checkpoint indicators acted on, retirement) and F-P5-07 (nonlinear response across the envelope; rare events, model discrepancy and
-- benchmark validation).
--
-- One migration in five sections: the prelude (§0) written first by the integrator, the four parts built and proven on their own in parallel
-- worktrees (harnesses phase6-{branches,envelope,estimation,experiments}-b30), then combined here in the apply order (§0, §BR branches, §EN
-- envelope, §ES estimation, §EX experiments). Forward-only; 0001–0102 untouched. Each part keeps its own ledger: the pinned event lists
-- (twin.twin_events on existing paths, simulation.run_events, simulation.experiment_events on the B31 fixtures) are not touched on any existing
-- path. The interface register stays 50/0/0.

-- ═════════════════════════════════════════════════════════════════════
-- section `prelude`
-- ═════════════════════════════════════════════════════════════════════
-- §0.1 THE ATTENTION CLASSES AND SUBJECT KINDS (0101 §0.1's lists whole, plus B30's): twin.reconciliation (an estimate, a merge or a
-- reconciliation awaiting the twin owner), twin.freshness (a snapshot past its freshness SLO, a frozen snapshot near or past expiry),
-- twin.envelope (an outside-envelope run awaiting exploratory admission, a model's calibration drifting), twin.observation_request (missing or
-- stale elements: a new observation requested), simulation.checkpoint (an unstable or violated checkpoint acted on). Subject kinds: twin,
-- twin_version, twin_estimate, twin_branch, behaviour_model.
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
  'twin.reconciliation', 'twin.freshness', 'twin.envelope', 'twin.observation_request', 'simulation.checkpoint'] $$;
ALTER TABLE executive.attention_items DROP CONSTRAINT IF EXISTS attention_items_signal_class_check;
ALTER TABLE executive.attention_items ADD CONSTRAINT attention_items_signal_class_check CHECK (signal_class IN (
  'forecast.unfit', 'scenario.incoherent', 'warning.raised', 'source.coverage_loss', 'proposal.review', 'decision.material_change', 'review.convened',
  'opportunity.raised', 'health.change', 'commitment.due', 'commitment.breach',
  'plan.variance', 'publication.correction', 'strategy.detection', 'queue.governance',
  'product.degradation', 'subscription.lag', 'metric.certification', 'catalog.coverage',
  'scenario.suspension', 'scenario.set_gap', 'scenario.quality', 'scenario.signpost', 'scenario.proposal',
  'simulation.budget', 'simulation.experiment', 'simulation.validity', 'simulation.value_of_information',
  'decision.recommendation', 'decision.appeal', 'decision.reversion', 'decision.review_due',
  'twin.reconciliation', 'twin.freshness', 'twin.envelope', 'twin.observation_request', 'simulation.checkpoint'));
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
  'twin', 'twin_version', 'twin_estimate', 'twin_branch', 'behaviour_model'));

-- §0.2 THE RECONCILIATION AGENT: a role, an agent kind and its task (the Supply Chain Agent's precedent, 0092 §0.1/§0.6). It PROPOSES
-- estimates; it never approves, never opens, grounds or admits a twin version (twin.agent_write_boundary stands).
INSERT INTO identity.roles (code, scope, description) VALUES
  ('reconciliation_agent', 'DOMAIN', 'The Reconciliation Agent (B30): reads qualified inputs and PROPOSES candidate twin state (estimates) to the twin''s owner — never approves, never writes a twin version')
ON CONFLICT (code) DO NOTHING;
ALTER TABLE executive.agents DROP CONSTRAINT IF EXISTS agents_agent_kind_check;
ALTER TABLE executive.agents ADD CONSTRAINT agents_agent_kind_check CHECK (agent_kind IN ('decision', 'briefing', 'reporting', 'attention', 'weak_signal', 'risk', 'opportunity',
                                                                                            /* B29 (0092) */ 'supply_chain',
                                                                                            /* B30 (0103) */ 'reconciliation'));
ALTER TABLE executive.agent_runs DROP CONSTRAINT IF EXISTS agent_runs_task_check;
ALTER TABLE executive.agent_runs ADD CONSTRAINT agent_runs_task_check CHECK (task IN ('draft', 'briefing', 'report', 'monitor', 'attention_tick', 'signal_scan', 'risk_assess', 'opportunity_assess',
                                                                                      /* B29 (0092) */ 'supply_scan',
                                                                                      /* B30 (0103) */ 'reconcile_scan'));

-- §0.3 THE SCENARIO ELEMENT KIND (ADR-0011 V4): a twin element may be a SCENARIO value — kept apart from observed, estimated, assumed,
-- predicted and simulated state. Its basis rule is §BR's.
ALTER TABLE twin.state_elements DROP CONSTRAINT state_elements_kind_check;
ALTER TABLE twin.state_elements ADD CONSTRAINT state_elements_kind_check
  CHECK (kind IN ('observed', 'estimated', 'assumed', 'predicted', 'simulated', /* B30 (0103) */ 'scenario'));

-- §0.4 RUN RETIREMENT (PR-35-001): the columns §EX's retirement writes and §EN's decision-use read reads. NULL on every existing run.
-- simulation.runs_immutable (0099:56) is re-declared, copied whole, so a FINISHED run's retirement is written once (the three columns join
-- the exclusions of the frozen row; the second write is refused; an unfinished run is never retired) — marked B30.
ALTER TABLE simulation.runs_current ADD COLUMN retired_at timestamptz;
ALTER TABLE simulation.runs_current ADD COLUMN retired_by uuid;
ALTER TABLE simulation.runs_current ADD COLUMN retire_reason text;
ALTER TABLE simulation.runs_current ADD CONSTRAINT sim_retired_bound CHECK ((retired_at IS NULL) = (retired_by IS NULL) AND (retired_at IS NULL) = (retire_reason IS NULL)
                                                                           AND (retire_reason IS NULL OR length(btrim(retire_reason)) >= 8));

CREATE OR REPLACE FUNCTION simulation.runs_immutable()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'simulation', 'pg_catalog', 'pg_temp'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'simulation runs are append-only: DELETE prohibited' USING ERRCODE = '2F002'; END IF;
  IF OLD.state IN ('completed', 'failed', 'partial') THEN   -- B31 (0099 §0): a partial run is frozen as a failed one is
    IF NEW.state <> OLD.state OR (to_jsonb(NEW) - ARRAY['validity', 'invalidated_at', 'invalidated_by', 'invalidation', 'fitness_state', 'promoted_for', 'promotion_id', /* B30 (0103) */ 'retired_at', 'retired_by', 'retire_reason']) <> (to_jsonb(OLD) - ARRAY['validity', 'invalidated_at', 'invalidated_by', 'invalidation', 'fitness_state', 'promoted_for', 'promotion_id', /* B30 (0103) */ 'retired_at', 'retired_by', 'retire_reason']) THEN
      RAISE EXCEPTION 'simulation run % is % and immutable; a correction is a new run that names it — only its validity (once) and its fitness change, by event (0078, 0081)', OLD.run_id, OLD.state USING ERRCODE = '2F002';
    END IF;
    IF OLD.validity = 'invalidated' AND (NEW.validity <> 'invalidated' OR NEW.invalidated_at IS DISTINCT FROM OLD.invalidated_at OR NEW.invalidated_by IS DISTINCT FROM OLD.invalidated_by OR NEW.invalidation IS DISTINCT FROM OLD.invalidation) THEN
      RAISE EXCEPTION 'simulation run % was invalidated at %; an invalidation is recorded once', OLD.run_id, OLD.invalidated_at USING ERRCODE = '2F002';
    END IF;
    IF OLD.promotion_id IS NOT NULL AND (NEW.promotion_id IS DISTINCT FROM OLD.promotion_id OR NEW.promoted_for IS DISTINCT FROM OLD.promoted_for) THEN
      RAISE EXCEPTION 'simulation run % was promoted at %; a promotion is recorded once (an upheld challenge changes the fitness, never the promotion)', OLD.run_id, OLD.promotion_id USING ERRCODE = '2F002';
    END IF;
    -- B30 (0103 §0.4): a retirement is recorded once, on a finished run only (the B31 partial and the failed included)
    IF OLD.retired_at IS NOT NULL AND (NEW.retired_at IS DISTINCT FROM OLD.retired_at OR NEW.retired_by IS DISTINCT FROM OLD.retired_by OR NEW.retire_reason IS DISTINCT FROM OLD.retire_reason) THEN
      RAISE EXCEPTION 'simulation run % was retired at %; a retirement is recorded once', OLD.run_id, OLD.retired_at USING ERRCODE = '2F002';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.retired_at IS NOT NULL THEN RAISE EXCEPTION 'simulation run % is %, not finished; only a finished run is retired', OLD.run_id, OLD.state USING ERRCODE = '2F002'; END IF;   -- B30 (0103 §0.4)
  IF NEW.validity <> 'valid' THEN RAISE EXCEPTION 'simulation run % is %, not completed; only a completed result is invalidated', OLD.run_id, OLD.state USING ERRCODE = '2F002'; END IF;
  IF NEW.run_id <> OLD.run_id OR NEW.twin_id <> OLD.twin_id OR NEW.twin_version <> OLD.twin_version OR NEW.initial_state <> OLD.initial_state
     OR NEW.initial_state_digest <> OLD.initial_state_digest OR NEW.inputs_digest <> OLD.inputs_digest OR NEW.interventions <> OLD.interventions
     OR NEW.constraints <> OLD.constraints OR NEW.assumptions <> OLD.assumptions OR NEW.implementation_digest <> OLD.implementation_digest
     OR NEW.environment_digest <> OLD.environment_digest OR NEW.stochastic_mode <> OLD.stochastic_mode OR NEW.seed IS DISTINCT FROM OLD.seed
     OR NEW.samples IS DISTINCT FROM OLD.samples OR NEW.control_run_id IS DISTINCT FROM OLD.control_run_id OR NEW.run_kind <> OLD.run_kind
     OR NEW.scenario_id IS DISTINCT FROM OLD.scenario_id OR NEW.scenario_branch_id IS DISTINCT FROM OLD.scenario_branch_id
     OR NEW.scenario_version IS DISTINCT FROM OLD.scenario_version OR NEW.scenario_branch_state IS DISTINCT FROM OLD.scenario_branch_state
     OR NEW.shock <> OLD.shock OR NEW.shock_basis <> OLD.shock_basis OR NEW.controls <> OLD.controls
     OR NEW.twin_fitness <> OLD.twin_fitness OR NEW.envelope_state <> OLD.envelope_state OR NEW.envelope_check IS DISTINCT FROM OLD.envelope_check OR NEW.envelope_ack IS DISTINCT FROM OLD.envelope_ack OR NEW.challenge_id IS DISTINCT FROM OLD.challenge_id THEN
    RAISE EXCEPTION 'the experiment contract of run % is bound at opening and cannot change', OLD.run_id USING ERRCODE = '2F002';
  END IF;
  RETURN NEW;
END $function$;

-- ═════════════════════════════════════════════════════════════════════
-- section `branches` (the part file 0103_b30_x_branches.sql, built and proven alone on b30/branches, combined here in the apply order)
-- ═════════════════════════════════════════════════════════════════════
-- ═════════════════════════════════════════════════════════════════════
-- section `branches` (§BR) — CP-6 B30 part `branches` (F-P5-03 complete): the branch-aware state store (checkpoint restore; a branch
-- merged back into `actual` only through a merge whose DIVERGING keys — computed here from the two admitted heads and the branch's fork
-- point — are each reconciled by the twin's owner); component-level confidence aggregation; staleness by age and by dependency uncertainty;
-- the last VALIDATED snapshot frozen as the served state with its freshness warning and an EXPIRY (a historical snapshot past its expiry is
-- refused for runs — FEX-14); the `scenario` element kind's basis rule (ADR-0011 V4); the ontology/policy revision a commit records
-- (V03-T-196; read by the admit in TS). Every figure a harness or an act seeds here is SYNTHETIC.
--
-- Forward only. The prelude's objects (§0: the attention classes twin.reconciliation / twin.freshness, the subject kinds twin / twin_branch,
-- the element kind `scenario`) are USED, never re-declared. No existing function is re-declared: the merge's draft, its grounding and its
-- admission go through the EXISTING ports (twin.open_version / twin.ground_element / twin.admit_version), each under its own bound action in
-- its own governed write from TS; the merge's own record moves to `merged` in the SAME transaction as the admission, by the AFTER UPDATE
-- trigger tbr_merge_admitted (which also refuses an admission on `actual` that does not carry the reconciled plan while a merge completes).
-- No event is added to twin.twin_events, simulation.run_events or simulation.experiment_events: the lifecycle lives in twin.branch_events.
-- Default-off: every gate below acts only on a twin that has a merge, a freeze or a scenario element — none of which exists before B30.
-- ═════════════════════════════════════════════════════════════════════

-- §BR.1 THE TABLES ────────────────────────────────────────────────────

/* The freshness SLO of a twin, versioned and append-only (the highest version stands), set by the twin's owner: the maximum age of the
   head in days (age = the database's day minus the version's world cut-off observed_through, else its record cut-off known_at), the
   per-key maximum age ({key prefix: days}), and how many hours before a freeze's expiry it is announced as nearing. */
CREATE TABLE twin.freshness_policies (
  twin_id            uuid NOT NULL REFERENCES twin.twins_current (twin_id),
  version            int  NOT NULL CHECK (version >= 1),
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  max_age_days       int  NOT NULL CHECK (max_age_days BETWEEN 0 AND 3650),
  key_max_age        jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(key_max_age) = 'object'),
  near_expiry_hours  int  NOT NULL DEFAULT 24 CHECK (near_expiry_hours BETWEEN 1 AND 720),
  note               text NOT NULL CHECK (length(btrim(note)) BETWEEN 8 AND 2000),
  set_by             uuid NOT NULL,
  set_at             timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  PRIMARY KEY (twin_id, version),
  CONSTRAINT tbr_fp_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE TRIGGER tbr_fp_append_only BEFORE UPDATE OR DELETE ON twin.freshness_policies FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

/* A request to merge branch X of a twin back into `actual`. The DIVERGING keys are the server's, computed at opening from the two admitted
   heads and the branch's fork point (a key the branch changed — against its fork point — that differs from actual's head; `conflict` when
   actual changed it too). State: open → reconciled (every diverging key resolved) → completing (the owner's completion: the plan is fixed,
   actual is held) → merged (the admission of the plan on actual, same transaction); or refused (the owner) / withdrawn (the opener or the
   owner). */
CREATE TABLE twin.branch_merges (
  merge_id           uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  twin_id            uuid NOT NULL REFERENCES twin.twins_current (twin_id),
  source_branch      text NOT NULL CHECK (source_branch ~ '^[a-z][a-z0-9-]{0,40}$' AND source_branch <> 'actual'),
  target_branch      text NOT NULL DEFAULT 'actual' CHECK (target_branch = 'actual'),
  source_version     int  NOT NULL,
  target_version     int  NOT NULL,
  base_version       int,
  diverging          jsonb NOT NULL CHECK (jsonb_typeof(diverging) = 'array' AND jsonb_array_length(diverging) >= 1),
  state              text NOT NULL CHECK (state IN ('open', 'reconciled', 'completing', 'merged', 'refused', 'withdrawn')),
  reason             text NOT NULL CHECK (length(btrim(reason)) BETWEEN 8 AND 2000),
  opened_by          uuid NOT NULL,
  opened_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  completing_by      uuid,
  completing_at      timestamptz,
  merged_version     int,
  merged_at          timestamptz,
  closed_by          uuid,
  closed_at          timestamptz,
  close_reason       text,
  correlation_id     uuid NOT NULL,
  CONSTRAINT tbr_bm_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT tbr_bm_completing_bound CHECK ((completing_at IS NULL) = (completing_by IS NULL)),
  CONSTRAINT tbr_bm_merged_bound CHECK ((state = 'merged') = (merged_version IS NOT NULL AND merged_at IS NOT NULL)),
  CONSTRAINT tbr_bm_closed_bound CHECK ((state IN ('refused', 'withdrawn')) = (closed_at IS NOT NULL AND closed_by IS NOT NULL AND close_reason IS NOT NULL)),
  FOREIGN KEY (twin_id, source_version) REFERENCES twin.twin_versions (twin_id, version),
  FOREIGN KEY (twin_id, target_version) REFERENCES twin.twin_versions (twin_id, version)
);
CREATE UNIQUE INDEX tbr_bm_one_live ON twin.branch_merges (twin_id, source_branch) WHERE state IN ('open', 'reconciled', 'completing');
CREATE UNIQUE INDEX tbr_bm_one_completing ON twin.branch_merges (twin_id) WHERE state = 'completing';
CREATE INDEX tbr_bm_twin ON twin.branch_merges (twin_id, opened_at);

/* The owner's resolution of one diverging key, append-only (a later ordinal supersedes an earlier one until completion): keep_target
   (actual's value stands), take_branch (the branch's element is taken — never a SCENARIO element: a scenario value does not become actual
   state), reconciled (a value the owner states, of kind assumed or estimated, with its typed citations — evidence or an assumption). */
CREATE TABLE twin.merge_resolutions (
  merge_id           uuid NOT NULL REFERENCES twin.branch_merges (merge_id),
  key                text NOT NULL CHECK (key ~ '^[a-z][a-z0-9_.-]*(:[A-Za-z0-9_.-]+)?$'),
  ordinal            int  NOT NULL CHECK (ordinal >= 1),
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  resolution         text NOT NULL CHECK (resolution IN ('keep_target', 'take_branch', 'reconciled')),
  kind               text CHECK (kind IS NULL OR kind IN ('assumed', 'estimated')),
  value              jsonb,
  unit               text,
  citations          jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (twin.citations_ok(citations)),
  note               text NOT NULL CHECK (length(btrim(note)) BETWEEN 8 AND 2000),
  resolved_by        uuid NOT NULL,
  resolved_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  PRIMARY KEY (merge_id, key, ordinal),
  CONSTRAINT tbr_mr_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT tbr_mr_reconciled CHECK ((resolution = 'reconciled') = (kind IS NOT NULL AND value IS NOT NULL AND jsonb_array_length(citations) >= 1)),
  CONSTRAINT tbr_mr_reconciled_basis CHECK (resolution <> 'reconciled'
    OR (twin.citation_count(citations, 'evidence') + twin.citation_count(citations, 'assumption') >= 1 AND twin.citation_count(citations, 'claim') = 0))
);
CREATE TRIGGER tbr_mr_append_only BEFORE UPDATE OR DELETE ON twin.merge_resolutions FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

/* The last VALIDATED (fit) snapshot of a branch frozen as the twin's SERVED state (a degraded mode: the head is not served while the freeze
   stands), with its freshness WARNING and an EXPIRY instant; lifted by the owner with a reason. One standing freeze per twin. */
CREATE TABLE twin.snapshot_freezes (
  freeze_id          uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  twin_id            uuid NOT NULL REFERENCES twin.twins_current (twin_id),
  branch_id          text NOT NULL CHECK (branch_id ~ '^[a-z][a-z0-9-]{0,40}$'),
  version            int  NOT NULL,
  validation_id      uuid NOT NULL,
  warning            text NOT NULL CHECK (length(btrim(warning)) BETWEEN 8 AND 1000),
  expires_at         timestamptz NOT NULL,
  frozen_by          uuid NOT NULL,
  frozen_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  lifted_by          uuid,
  lifted_at          timestamptz,
  lift_reason        text,
  correlation_id     uuid NOT NULL,
  CONSTRAINT tbr_sf_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT tbr_sf_expiry_after CHECK (expires_at > frozen_at),
  CONSTRAINT tbr_sf_lifted_bound CHECK ((lifted_at IS NULL) = (lifted_by IS NULL) AND (lifted_at IS NULL) = (lift_reason IS NULL)),
  FOREIGN KEY (twin_id, version) REFERENCES twin.twin_versions (twin_id, version)
);
CREATE UNIQUE INDEX tbr_sf_one_standing ON twin.snapshot_freezes (twin_id) WHERE lifted_at IS NULL;
CREATE INDEX tbr_sf_version ON twin.snapshot_freezes (twin_id, version);

/* The part's ledger (append-only). subject_id: the merge, the freeze, or the twin (a policy, a checkpoint restore, a freshness breach). */
CREATE TABLE twin.branch_events (
  event_id           uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  twin_id            uuid NOT NULL,
  subject_id         uuid NOT NULL,
  event              text NOT NULL CHECK (event IN ('merge.opened', 'merge.key_resolved', 'merge.reconciled', 'merge.completing', 'merge.merged', 'merge.refused',
                                                    'merge.withdrawn', 'checkpoint.restored', 'snapshot.frozen', 'snapshot.lifted', 'freshness.policy_set',
                                                    'freshness.breached', 'freeze.expiring', 'freeze.expired')),
  actor_principal_id uuid,
  details            jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT tbr_be_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX tbr_be_twin ON twin.branch_events (twin_id, occurred_at);
CREATE INDEX tbr_be_subject ON twin.branch_events (subject_id, occurred_at);
CREATE TRIGGER tbr_be_append_only BEFORE UPDATE OR DELETE ON twin.branch_events FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

-- RLS and grants: the 0032:634-639 idiom (policy twin_isolation; GRANT SELECT TO eye_app, eye_commit). The definer ports write.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['freshness_policies', 'branch_merges', 'merge_resolutions', 'snapshot_freezes', 'branch_events'] LOOP
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
END $$;

-- §BR.2 THE SCENARIO ELEMENT KIND'S BASIS RULE (ADR-0011 V4) ──────────
/* A scenario element is a value of a SCENARIO, kept apart from observed, estimated, assumed, predicted and simulated state: it cites the
   scenario branch it belongs to — today through the branch's ASSUMPTION (an ASU linked to the scenario branch in prediction.scenario_assumptions;
   the route verifies the link), or a `scenario` citation should the citation kinds ever admit one. NOT VALID is unnecessary: no row has the
   kind before B30. */
ALTER TABLE twin.state_elements ADD CONSTRAINT tbr_scenario_basis
  CHECK (kind <> 'scenario' OR twin.citation_count(citations, 'assumption') + twin.citation_count(citations, 'scenario') >= 1);

-- §BR.3 HELPERS (internal; no grant) ───────────────────────────────────

/* The latest admitted version on a branch (NULL: none). */
CREATE OR REPLACE FUNCTION twin.tbr_head(p_twin uuid, p_branch text) RETURNS int
LANGUAGE sql STABLE SET search_path = twin, pg_catalog, pg_temp AS $$
  SELECT max(v.version) FROM twin.twin_versions v WHERE v.twin_id = p_twin AND v.branch_id = p_branch AND v.state = 'admitted'
$$;
/* A version's elements as {key: {kind, value, unit}} — what a merge compares. */
CREATE OR REPLACE FUNCTION twin.tbr_element_map(p_twin uuid, p_version int) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = twin, pg_catalog, pg_temp AS $$
  SELECT coalesce(jsonb_object_agg(e.key, jsonb_build_object('kind', e.kind, 'value', e.value, 'unit', e.unit)), '{}'::jsonb)
    FROM twin.state_elements e WHERE e.twin_id = p_twin AND e.version = p_version
$$;
/* The branch's fork point: the version its first version forked from (NULL: the branch was not forked). */
CREATE OR REPLACE FUNCTION twin.tbr_fork_base(p_twin uuid, p_branch text) RETURNS int
LANGUAGE sql STABLE SET search_path = twin, pg_catalog, pg_temp AS $$
  SELECT v.forked_from_version FROM twin.twin_versions v WHERE v.twin_id = p_twin AND v.branch_id = p_branch ORDER BY v.version LIMIT 1
$$;
/* THE DIVERGING KEYS between a branch head (source) and actual's head (target), against the branch's fork point (base): a key DIVERGES when
   the branch changed it (source ≠ base) and it differs from actual (source ≠ target); a key only actual changed is not the branch's and
   keeps actual's value. change: changed | added (only in the branch) | removed (the branch dropped it); conflict: actual changed it too. */
CREATE OR REPLACE FUNCTION twin.tbr_diverging(p_twin uuid, p_source int, p_target int, p_base int) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = twin, pg_catalog, pg_temp AS $$
  WITH s AS (SELECT twin.tbr_element_map(p_twin, p_source) m), t AS (SELECT twin.tbr_element_map(p_twin, p_target) m),
       b AS (SELECT CASE WHEN p_base IS NULL THEN NULL ELSE twin.tbr_element_map(p_twin, p_base) END m),
       k AS (SELECT DISTINCT x AS key FROM s, t, LATERAL (SELECT jsonb_object_keys(s.m) UNION SELECT jsonb_object_keys(t.m)) y(x))
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'key', k.key,
           'change', CASE WHEN t.m -> k.key IS NULL THEN 'added' WHEN s.m -> k.key IS NULL THEN 'removed' ELSE 'changed' END,
           'conflict', b.m IS NOT NULL AND (t.m -> k.key) IS DISTINCT FROM (b.m -> k.key),
           'source', s.m -> k.key, 'target', t.m -> k.key, 'base', b.m -> k.key) ORDER BY k.key), '[]'::jsonb)
    FROM k, s, t, b
   WHERE (s.m -> k.key) IS DISTINCT FROM (t.m -> k.key)
     AND (b.m IS NULL OR (s.m -> k.key) IS DISTINCT FROM (b.m -> k.key))
$$;
/* The current resolution of each key of a merge (the highest ordinal). */
CREATE OR REPLACE FUNCTION twin.tbr_resolutions(p_merge uuid) RETURNS SETOF twin.merge_resolutions
LANGUAGE sql STABLE SET search_path = twin, pg_catalog, pg_temp AS $$
  SELECT DISTINCT ON (r.key) r.* FROM twin.merge_resolutions r WHERE r.merge_id = p_merge ORDER BY r.key, r.ordinal DESC
$$;
/* THE PLAN of a merge: the state actual must hold after it, {key: {kind, value, unit}} — actual's head, except each diverging key as
   resolved (keep_target: actual's; take_branch: the branch's, or absent when the branch removed it; reconciled: the owner's value). */
CREATE OR REPLACE FUNCTION twin.tbr_merge_expected(p_merge uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = twin, pg_catalog, pg_temp AS $$
DECLARE m twin.branch_merges%ROWTYPE; v_out jsonb; v_src jsonb; r twin.merge_resolutions%ROWTYPE;
BEGIN
  SELECT * INTO m FROM twin.branch_merges x WHERE x.merge_id = p_merge;
  IF NOT FOUND THEN RETURN NULL; END IF;
  v_out := twin.tbr_element_map(m.twin_id, m.target_version);
  v_src := twin.tbr_element_map(m.twin_id, m.source_version);
  FOR r IN SELECT * FROM twin.tbr_resolutions(p_merge) LOOP
    IF r.resolution = 'take_branch' THEN
      v_out := CASE WHEN v_src -> r.key IS NULL THEN v_out - r.key ELSE jsonb_set(v_out, ARRAY[r.key], v_src -> r.key) END;
    ELSIF r.resolution = 'reconciled' THEN
      v_out := jsonb_set(v_out, ARRAY[r.key], jsonb_build_object('kind', r.kind, 'value', r.value, 'unit', r.unit));
    END IF;
  END LOOP;
  RETURN v_out;
END $$;
/* The keys of a merge not yet resolved. */
CREATE OR REPLACE FUNCTION twin.tbr_unresolved(p_merge uuid) RETURNS text[]
LANGUAGE sql STABLE SET search_path = twin, pg_catalog, pg_temp AS $$
  SELECT coalesce(array_agg(d ->> 'key' ORDER BY d ->> 'key'), ARRAY[]::text[])
    FROM twin.branch_merges m, jsonb_array_elements(m.diverging) d
   WHERE m.merge_id = p_merge AND NOT EXISTS (SELECT 1 FROM twin.merge_resolutions r WHERE r.merge_id = m.merge_id AND r.key = d ->> 'key')
$$;
/* The ledger row. */
CREATE OR REPLACE FUNCTION twin.tbr_event(p_tenant uuid, p_domain uuid, p_twin uuid, p_subject uuid, p_event text, p_actor uuid, p_details jsonb, p_correlation uuid,
                                          p_event_id uuid DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SET search_path = twin, pg_catalog, pg_temp AS $$
DECLARE v uuid := coalesce(p_event_id, gen_random_uuid());
BEGIN
  INSERT INTO twin.branch_events (event_id, scope, tenant_id, domain_id, twin_id, subject_id, event, actor_principal_id, details, correlation_id)
  VALUES (v, 'DOMAIN', p_tenant, p_domain, p_twin, p_subject, p_event, p_actor, coalesce(p_details, '{}'::jsonb), p_correlation);
  RETURN v;
END $$;
/* THE NOTICE (the 0099 sio_notify idiom): an attention item of the class owned by a named person (open when an active human, else unrouted),
   its cause the branch_events row. */
CREATE OR REPLACE FUNCTION twin.tbr_notify(p_tenant uuid, p_domain uuid, p_class text, p_subject_kind text, p_subject uuid, p_title text, p_reasons jsonb, p_owner uuid,
                                           p_cause_event uuid, p_cause_type text, p_details jsonb, p_due interval, p_actor uuid, p_correlation uuid) RETURNS uuid
SECURITY DEFINER SET search_path = executive, identity, decision, pg_catalog, pg_temp AS $$
DECLARE v_item uuid := gen_random_uuid(); v_state text; v_due timestamptz := clock_timestamp() + p_due;
BEGIN
  v_state := CASE WHEN p_owner IS NOT NULL AND decision.is_active_human(p_owner, p_tenant) THEN 'open' ELSE 'unrouted' END;
  INSERT INTO executive.attention_items (item_id, scope, tenant_id, domain_id, signal_class, subject_kind, subject_id, cause_event_id, cause_event_type, title, outcome, state, owner_principal_id, route_roles, evaluation, details, due_at, escalations, correlation_id)
  VALUES (v_item, 'DOMAIN', p_tenant, p_domain, p_class, p_subject_kind, p_subject, p_cause_event, p_cause_type, left(p_title, 512), 'material', v_state, p_owner, '{}'::text[],
          jsonb_build_object('outcome', 'material', 'reasons', p_reasons, 'policy_version', NULL, 'dimensions', jsonb_build_object('consequence', 'C2', 'confidence', 1)),
          coalesce(p_details, '{}'::jsonb) || jsonb_build_object('synthetic', true), v_due, 0, p_correlation);
  PERFORM executive.attention_event(v_item, p_tenant, p_domain, CASE v_state WHEN 'open' THEN 'item.routed' ELSE 'item.unrouted' END, p_actor,
            jsonb_build_object('outcome', 'material', 'reasons', p_reasons, 'policy_version', NULL, 'owner', p_owner, 'route_roles', '[]'::jsonb, 'due_at', v_due,
                               'cause_event_id', p_cause_event, 'cause_event_type', p_cause_type, 'unrouted', v_state = 'unrouted'), p_correlation);
  RETURN v_item;
END $$ LANGUAGE plpgsql;
/* The twin of this domain, locked for the act (or the refusal in the caller's family). */
CREATE OR REPLACE FUNCTION twin.tbr_twin(p_twin uuid, p_tenant uuid, p_domain uuid, p_noun text) RETURNS twin.twins_current
LANGUAGE plpgsql SET search_path = twin, pg_catalog, pg_temp AS $$
DECLARE t twin.twins_current%ROWTYPE;
BEGIN
  SELECT * INTO t FROM twin.twins_current x WHERE x.twin_id = p_twin AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION '% rejected (unknown_twin): % is not a twin of this domain', p_noun, p_twin USING ERRCODE = '23503'; END IF;
  RETURN t;
END $$;
/* The acting principal is the context's, and is the twin's OWN owner. */
CREATE OR REPLACE FUNCTION twin.tbr_assert_owner(t twin.twins_current, p_actor uuid, p_noun text, p_what text) RETURNS void
LANGUAGE plpgsql SET search_path = twin, public, pg_catalog, pg_temp AS $$
BEGIN
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN
    RAISE EXCEPTION '% rejected (actor): recorded by the acting principal', p_noun USING ERRCODE = '42501';
  END IF;
  IF t.owner_principal_id IS DISTINCT FROM p_actor THEN
    RAISE EXCEPTION '% rejected (ownership): % is the act of the twin''s own owner (%), not of another holder of the role', p_noun, p_what, t.owner_principal_id USING ERRCODE = '42501';
  END IF;
END $$;
/* The head's age (days, by the database's day) against the twin's current policy: the shape version_freshness and the sweep share. */
CREATE OR REPLACE FUNCTION twin.tbr_age(p_twin uuid, p_version int) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = twin, pg_catalog, pg_temp AS $$
  WITH v AS (SELECT * FROM twin.twin_versions x WHERE x.twin_id = p_twin AND x.version = p_version),
       p AS (SELECT * FROM twin.freshness_policies f WHERE f.twin_id = p_twin ORDER BY f.version DESC LIMIT 1),
       d AS (SELECT (clock_timestamp() AT TIME ZONE 'UTC')::date AS today)
  SELECT jsonb_build_object(
           'version', v.version, 'branch_id', v.branch_id, 'verification_state', v.verification_state,
           'basis', CASE WHEN v.observed_through IS NULL THEN 'known_at' ELSE 'observed_through' END,
           'reference_day', coalesce(v.observed_through, (v.known_at AT TIME ZONE 'UTC')::date),
           'today', d.today,
           'age_days', d.today - coalesce(v.observed_through, (v.known_at AT TIME ZONE 'UTC')::date),
           'policy', CASE WHEN p.twin_id IS NULL THEN NULL ELSE jsonb_build_object('version', p.version, 'max_age_days', p.max_age_days, 'key_max_age', p.key_max_age,
                                                                                    'near_expiry_hours', p.near_expiry_hours) END,
           'state', CASE WHEN p.twin_id IS NULL THEN 'unknown'
                         WHEN d.today - coalesce(v.observed_through, (v.known_at AT TIME ZONE 'UTC')::date) > p.max_age_days THEN 'stale' ELSE 'fresh' END,
           'stale_by_days', CASE WHEN p.twin_id IS NULL THEN NULL
                                 ELSE greatest(0, d.today - coalesce(v.observed_through, (v.known_at AT TIME ZONE 'UTC')::date) - p.max_age_days) END)
    FROM v CROSS JOIN d LEFT JOIN p ON true
$$;
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['twin.tbr_head(uuid,text)', 'twin.tbr_element_map(uuid,int)', 'twin.tbr_fork_base(uuid,text)', 'twin.tbr_diverging(uuid,int,int,int)',
                           'twin.tbr_resolutions(uuid)', 'twin.tbr_merge_expected(uuid)', 'twin.tbr_unresolved(uuid)',
                           'twin.tbr_event(uuid,uuid,uuid,uuid,text,uuid,jsonb,uuid,uuid)',
                           'twin.tbr_notify(uuid,uuid,text,text,uuid,text,jsonb,uuid,uuid,text,jsonb,interval,uuid,uuid)',
                           'twin.tbr_twin(uuid,uuid,uuid,text)', 'twin.tbr_assert_owner(twin.twins_current,uuid,text,text)', 'twin.tbr_age(uuid,int)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
  END LOOP;
END $$;
-- the reads below are INVOKER (eye_app / eye_commit): they call the pure helpers under the caller's own row security
GRANT EXECUTE ON FUNCTION twin.tbr_head(uuid,text), twin.tbr_element_map(uuid,int), twin.tbr_fork_base(uuid,text), twin.tbr_diverging(uuid,int,int,int),
                          twin.tbr_resolutions(uuid), twin.tbr_merge_expected(uuid), twin.tbr_unresolved(uuid), twin.tbr_age(uuid,int) TO eye_app, eye_commit;

-- §BR.4 THE PORTS ─────────────────────────────────────────────────────

/* THE FRESHNESS POLICY (twin.freshness.policy): the twin's own owner sets the next version. key_max_age: {key prefix: days}. */
CREATE OR REPLACE FUNCTION twin.set_freshness_policy(
  p_twin uuid, p_tenant uuid, p_domain uuid, p_max_age_days int, p_key_max_age jsonb, p_near_expiry_hours int, p_note text,
  p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = twin, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE t twin.twins_current%ROWTYPE; v_version int; k text; v jsonb; p twin.freshness_policies%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['twin.freshness.policy']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  t := twin.tbr_twin(p_twin, p_tenant, p_domain, 'freshness policy');
  PERFORM twin.tbr_assert_owner(t, p_actor, 'freshness policy', 'a freshness policy');
  IF p_max_age_days IS NULL OR p_max_age_days < 0 OR p_max_age_days > 3650 THEN
    RAISE EXCEPTION 'freshness policy rejected (max_age): the head''s maximum age is a whole number of days in [0, 3650]' USING ERRCODE = '22023';
  END IF;
  IF p_key_max_age IS NULL OR jsonb_typeof(p_key_max_age) <> 'object' THEN
    RAISE EXCEPTION 'freshness policy rejected (key_max_age): the per-key maximum ages are an object {key prefix: days}' USING ERRCODE = '22023';
  END IF;
  FOR k, v IN SELECT * FROM jsonb_each(p_key_max_age) LOOP
    IF k !~ '^[a-z][a-z0-9_.-]*(:[A-Za-z0-9_.-]+)?$' OR jsonb_typeof(v) <> 'number' OR (v #>> '{}') !~ '^[0-9]+$' OR (v #>> '{}')::int > 3650 THEN
      RAISE EXCEPTION 'freshness policy rejected (key_max_age): % must name a key prefix and a whole number of days in [0, 3650]', k USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF coalesce(p_near_expiry_hours, 24) NOT BETWEEN 1 AND 720 THEN
    RAISE EXCEPTION 'freshness policy rejected (near_expiry): a freeze is announced 1 to 720 hours before it expires' USING ERRCODE = '22023';
  END IF;
  IF p_note IS NULL OR length(btrim(p_note)) NOT BETWEEN 8 AND 2000 THEN
    RAISE EXCEPTION 'freshness policy rejected (note): a policy says why (8 to 2000 characters)' USING ERRCODE = '22023';
  END IF;
  SELECT coalesce(max(f.version), 0) + 1 INTO v_version FROM twin.freshness_policies f WHERE f.twin_id = p_twin;
  INSERT INTO twin.freshness_policies (twin_id, version, scope, tenant_id, domain_id, max_age_days, key_max_age, near_expiry_hours, note, set_by, correlation_id)
  VALUES (p_twin, v_version, 'DOMAIN', p_tenant, p_domain, p_max_age_days, p_key_max_age, coalesce(p_near_expiry_hours, 24), btrim(p_note), p_actor, p_correlation)
  RETURNING * INTO p;
  PERFORM twin.tbr_event(p_tenant, p_domain, p_twin, p_twin, 'freshness.policy_set', p_actor,
    jsonb_build_object('version', v_version, 'max_age_days', p_max_age_days, 'key_max_age', p_key_max_age, 'near_expiry_hours', p.near_expiry_hours), p_correlation, p_event_id);
  RETURN to_jsonb(p) - 'scope' - 'tenant_id' - 'domain_id';
END $$ LANGUAGE plpgsql;

/* OPEN A MERGE (twin.branch.merge): a holder of the action asks to merge branch X back into actual; the server computes the diverging keys from
   the two admitted heads and the branch's fork point and routes twin.reconciliation to the twin's owner. */
CREATE OR REPLACE FUNCTION twin.open_merge(
  p_merge_id uuid, p_twin uuid, p_tenant uuid, p_domain uuid, p_source_branch text, p_reason text, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = twin, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE t twin.twins_current%ROWTYPE; v_src int; v_tgt int; v_base int; v_div jsonb; m twin.branch_merges%ROWTYPE; v_ev uuid; v_item uuid; v_live uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['twin.branch.merge']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'branch merge rejected (actor): recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  t := twin.tbr_twin(p_twin, p_tenant, p_domain, 'branch merge');
  PERFORM 1 FROM twin.twins_current x WHERE x.twin_id = p_twin FOR UPDATE;
  IF p_source_branch IS NULL OR p_source_branch !~ '^[a-z][a-z0-9-]{0,40}$' OR p_source_branch = 'actual' THEN
    RAISE EXCEPTION 'branch merge rejected (branch): a merge takes a branch other than actual back into actual' USING ERRCODE = '22023';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 8 AND 2000 THEN
    RAISE EXCEPTION 'branch merge rejected (reason): a merge says why (8 to 2000 characters)' USING ERRCODE = '22023';
  END IF;
  v_src := twin.tbr_head(p_twin, p_source_branch);
  IF v_src IS NULL THEN RAISE EXCEPTION 'branch merge rejected (unknown_branch): branch % of this twin has no admitted version', p_source_branch USING ERRCODE = '23503'; END IF;
  v_tgt := twin.tbr_head(p_twin, 'actual');
  IF v_tgt IS NULL THEN RAISE EXCEPTION 'branch merge rejected (unknown_branch): actual has no admitted version to merge into' USING ERRCODE = '23503'; END IF;
  SELECT x.merge_id INTO v_live FROM twin.branch_merges x WHERE x.twin_id = p_twin AND x.source_branch = p_source_branch AND x.state IN ('open', 'reconciled', 'completing');
  IF FOUND THEN RAISE EXCEPTION 'branch merge rejected (duplicate): branch % already has merge % in progress', p_source_branch, v_live USING ERRCODE = '23505'; END IF;
  v_base := twin.tbr_fork_base(p_twin, p_source_branch);
  v_div := twin.tbr_diverging(p_twin, v_src, v_tgt, v_base);
  IF jsonb_array_length(v_div) = 0 THEN
    RAISE EXCEPTION 'branch merge rejected (state): branch % (v%) changes nothing that differs from actual (v%); there is nothing to merge', p_source_branch, v_src, v_tgt USING ERRCODE = '22023';
  END IF;
  INSERT INTO twin.branch_merges (merge_id, scope, tenant_id, domain_id, twin_id, source_branch, source_version, target_version, base_version, diverging, state, reason, opened_by, correlation_id)
  VALUES (p_merge_id, 'DOMAIN', p_tenant, p_domain, p_twin, p_source_branch, v_src, v_tgt, v_base, v_div, 'open', btrim(p_reason), p_actor, p_correlation)
  RETURNING * INTO m;
  v_ev := twin.tbr_event(p_tenant, p_domain, p_twin, p_merge_id, 'merge.opened', p_actor,
    jsonb_build_object('source_branch', p_source_branch, 'source_version', v_src, 'target_version', v_tgt, 'base_version', v_base,
                       'diverging_keys', (SELECT jsonb_agg(d -> 'key') FROM jsonb_array_elements(v_div) d), 'reason', btrim(p_reason)), p_correlation, p_event_id);
  v_item := twin.tbr_notify(p_tenant, p_domain, 'twin.reconciliation', 'twin_branch', p_merge_id,
    format('Merge of branch %s into actual awaits reconciliation of %s diverging key(s) — %s', p_source_branch, jsonb_array_length(v_div), t.title),
    jsonb_build_array('merge_requires_reconciliation'), t.owner_principal_id, v_ev, 'twin.branch_merge.opened',
    jsonb_build_object('twin_id', p_twin, 'merge_id', p_merge_id, 'source_branch', p_source_branch, 'diverging', jsonb_array_length(v_div)), interval '3 days', p_actor, p_correlation);
  RETURN (to_jsonb(m) - 'scope' - 'tenant_id' - 'domain_id') || jsonb_build_object('unresolved', to_jsonb(twin.tbr_unresolved(p_merge_id)), 'attention_item_id', v_item);
END $$ LANGUAGE plpgsql;

/* RESOLVE ONE DIVERGING KEY (twin.branch.reconcile): the twin's own owner — keep_target | take_branch | reconciled (value, kind assumed or
   estimated, the typed citations of exact objects of this domain, evidence or an assumption). The last key resolved moves the merge to
   reconciled. A resolution may be re-stated (a later ordinal) until the merge completes. */
CREATE OR REPLACE FUNCTION twin.resolve_merge_key(
  p_merge uuid, p_tenant uuid, p_domain uuid, p_key text, p_resolution text, p_kind text, p_value jsonb, p_unit text, p_citations jsonb, p_note text,
  p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = twin, objects, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE m twin.branch_merges%ROWTYPE; t twin.twins_current%ROWTYPE; d jsonb; c jsonb; v_ord int; v_unres text[];
BEGIN
  PERFORM observation.assert_authority(ARRAY['twin.branch.reconcile']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT * INTO m FROM twin.branch_merges x WHERE x.merge_id = p_merge AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'branch merge rejected (unknown_merge): % is not a merge of this domain', p_merge USING ERRCODE = '23503'; END IF;
  t := twin.tbr_twin(m.twin_id, p_tenant, p_domain, 'branch merge');
  PERFORM twin.tbr_assert_owner(t, p_actor, 'branch merge', 'reconciling a merge');
  IF m.state NOT IN ('open', 'reconciled') THEN
    RAISE EXCEPTION 'branch merge rejected (state): merge % is %; a key is resolved while the merge is open or reconciled', p_merge, m.state USING ERRCODE = '2F002';
  END IF;
  SELECT x INTO d FROM jsonb_array_elements(m.diverging) x WHERE x ->> 'key' = p_key;
  IF d IS NULL THEN RAISE EXCEPTION 'branch merge rejected (unknown_key): % is not a diverging key of merge %', p_key, p_merge USING ERRCODE = '23503'; END IF;
  IF p_resolution IS NULL OR p_resolution NOT IN ('keep_target', 'take_branch', 'reconciled') THEN
    RAISE EXCEPTION 'branch merge rejected (resolution): a key is resolved keep_target, take_branch or reconciled' USING ERRCODE = '22023';
  END IF;
  IF p_note IS NULL OR length(btrim(p_note)) NOT BETWEEN 8 AND 2000 THEN
    RAISE EXCEPTION 'branch merge rejected (note): a resolution says why (8 to 2000 characters)' USING ERRCODE = '22023';
  END IF;
  IF p_resolution = 'take_branch' AND (d -> 'source' ->> 'kind') = 'scenario' THEN
    RAISE EXCEPTION 'branch merge rejected (scenario): % is a SCENARIO value on branch %; a scenario value does not become actual state — keep actual''s value or reconcile it with evidence', p_key, m.source_branch USING ERRCODE = '22023';
  END IF;
  IF p_resolution <> 'reconciled' THEN
    IF p_value IS NOT NULL OR p_kind IS NOT NULL OR coalesce(jsonb_array_length(p_citations), 0) > 0 THEN
      RAISE EXCEPTION 'branch merge rejected (resolution): only a reconciled key states a value, a kind and citations' USING ERRCODE = '22023';
    END IF;
  ELSE
    IF p_kind IS NULL OR p_kind NOT IN ('assumed', 'estimated') THEN
      RAISE EXCEPTION 'branch merge rejected (kind): a reconciled value is assumed or estimated — the owner''s judgement, never observed' USING ERRCODE = '22023';
    END IF;
    IF p_value IS NULL OR jsonb_typeof(p_value) = 'null' THEN RAISE EXCEPTION 'branch merge rejected (value): a reconciled key states its value' USING ERRCODE = '22023'; END IF;
    IF NOT twin.citations_ok(p_citations) OR jsonb_array_length(p_citations) = 0 OR twin.citation_count(p_citations, 'claim') > 0
       OR twin.citation_count(p_citations, 'evidence') + twin.citation_count(p_citations, 'assumption') = 0 THEN
      RAISE EXCEPTION 'branch merge rejected (citations): a reconciled value cites the evidence or the assumption it rests on — exact {kind, id, version, digest}' USING ERRCODE = '22023';
    END IF;
    FOR c IN SELECT * FROM jsonb_array_elements(p_citations) LOOP
      IF (c ->> 'kind') <> 'entity' AND NOT EXISTS (SELECT 1 FROM objects.canonical_objects o
           WHERE o.object_id = (c ->> 'id')::uuid AND o.object_version = (c ->> 'version')::int AND o.content_digest = (c ->> 'digest')
             AND o.tenant_id = p_tenant AND o.domain_id = p_domain) THEN
        RAISE EXCEPTION 'branch merge rejected (unknown_citation): % %@% is not an exact object of this domain', c ->> 'kind', c ->> 'id', c ->> 'version' USING ERRCODE = '23503';
      END IF;
    END LOOP;
  END IF;
  SELECT coalesce(max(r.ordinal), 0) + 1 INTO v_ord FROM twin.merge_resolutions r WHERE r.merge_id = p_merge AND r.key = p_key;
  INSERT INTO twin.merge_resolutions (merge_id, key, ordinal, scope, tenant_id, domain_id, resolution, kind, value, unit, citations, note, resolved_by, correlation_id)
  VALUES (p_merge, p_key, v_ord, 'DOMAIN', p_tenant, p_domain, p_resolution, CASE WHEN p_resolution = 'reconciled' THEN p_kind END,
          CASE WHEN p_resolution = 'reconciled' THEN p_value END, CASE WHEN p_resolution = 'reconciled' THEN p_unit END,
          CASE WHEN p_resolution = 'reconciled' THEN p_citations ELSE '[]'::jsonb END, btrim(p_note), p_actor, p_correlation);
  PERFORM twin.tbr_event(p_tenant, p_domain, m.twin_id, p_merge, 'merge.key_resolved', p_actor,
    jsonb_build_object('key', p_key, 'ordinal', v_ord, 'resolution', p_resolution, 'conflict', d -> 'conflict', 'change', d -> 'change'), p_correlation, p_event_id);
  v_unres := twin.tbr_unresolved(p_merge);
  IF cardinality(v_unres) = 0 AND m.state = 'open' THEN
    UPDATE twin.branch_merges SET state = 'reconciled' WHERE merge_id = p_merge;
    PERFORM twin.tbr_event(p_tenant, p_domain, m.twin_id, p_merge, 'merge.reconciled', p_actor,
      jsonb_build_object('keys', jsonb_array_length(m.diverging)), p_correlation);
  END IF;
  RETURN (SELECT (to_jsonb(x) - 'scope' - 'tenant_id' - 'domain_id') || jsonb_build_object('unresolved', to_jsonb(v_unres), 'key', p_key, 'ordinal', v_ord)
            FROM twin.branch_merges x WHERE x.merge_id = p_merge);
END $$ LANGUAGE plpgsql;

/* COMPLETE A MERGE (twin.branch.merge): the twin's own owner. REFUSED while any diverging key is unresolved — merging the branch back is
   refused until reconciliation — and when either head moved since the merge was opened (stale: open a new merge), or actual has an open draft.
   It FIXES the plan (completing) and answers it: the draft to open on actual (carrying actual's head except the keys the plan changes), the
   elements to ground (the branch's, or the owner's reconciled values), the state actual must then hold. The draft, its grounding and its
   admission are the EXISTING ports' acts (TS, each its own governed write); the admission of the plan moves the merge to merged
   (tbr_merge_admitted). A second call by the same owner while completing answers the same plan (a resumed completion). */
CREATE OR REPLACE FUNCTION twin.complete_merge(p_merge uuid, p_tenant uuid, p_domain uuid, p_actor uuid, p_event_id uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = twin, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE m twin.branch_merges%ROWTYPE; t twin.twins_current%ROWTYPE; v_unres text[]; v_draft int; v_expected jsonb; v_target jsonb; v_except text[]; v_ground jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['twin.branch.merge']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT * INTO m FROM twin.branch_merges x WHERE x.merge_id = p_merge AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'branch merge rejected (unknown_merge): % is not a merge of this domain', p_merge USING ERRCODE = '23503'; END IF;
  t := twin.tbr_twin(m.twin_id, p_tenant, p_domain, 'branch merge');
  PERFORM twin.tbr_assert_owner(t, p_actor, 'branch merge', 'completing a merge');
  IF m.state NOT IN ('open', 'reconciled', 'completing') THEN
    RAISE EXCEPTION 'branch merge rejected (state): merge % is %', p_merge, m.state USING ERRCODE = '2F002';
  END IF;
  v_unres := twin.tbr_unresolved(p_merge);
  IF cardinality(v_unres) > 0 THEN
    RAISE EXCEPTION 'branch merge rejected (unreconciled): merging branch % back into actual is refused until reconciliation — % of % diverging key(s) unresolved: %',
      m.source_branch, cardinality(v_unres), jsonb_array_length(m.diverging), array_to_string(v_unres, ', ') USING ERRCODE = '2F002';
  END IF;
  IF twin.tbr_head(m.twin_id, m.source_branch) IS DISTINCT FROM m.source_version OR twin.tbr_head(m.twin_id, 'actual') IS DISTINCT FROM m.target_version THEN
    RAISE EXCEPTION 'branch merge rejected (stale): the heads moved since merge % was opened (branch % v% → v%, actual v% → v%); withdraw it and open a new merge',
      p_merge, m.source_branch, m.source_version, twin.tbr_head(m.twin_id, m.source_branch), m.target_version, twin.tbr_head(m.twin_id, 'actual') USING ERRCODE = '2F002';
  END IF;
  SELECT v.version INTO v_draft FROM twin.twin_versions v WHERE v.twin_id = m.twin_id AND v.branch_id = 'actual' AND v.state = 'draft';
  IF m.state <> 'completing' THEN
    IF v_draft IS NOT NULL THEN
      RAISE EXCEPTION 'branch merge rejected (state): actual has an open draft v%; admit or withdraw it before the merge is completed', v_draft USING ERRCODE = '2F002';
    END IF;
    UPDATE twin.branch_merges SET state = 'completing', completing_by = p_actor, completing_at = clock_timestamp() WHERE merge_id = p_merge;
    PERFORM twin.tbr_event(p_tenant, p_domain, m.twin_id, p_merge, 'merge.completing', p_actor,
      jsonb_build_object('target_version', m.target_version, 'source_version', m.source_version), p_correlation, p_event_id);
  ELSIF m.completing_by IS DISTINCT FROM p_actor THEN
    RAISE EXCEPTION 'branch merge rejected (state): merge % is being completed by %', p_merge, m.completing_by USING ERRCODE = '2F002';
  END IF;
  v_expected := twin.tbr_merge_expected(p_merge);
  v_target := twin.tbr_element_map(m.twin_id, m.target_version);
  SELECT coalesce(array_agg(k ORDER BY k), ARRAY[]::text[]) INTO v_except
    FROM (SELECT jsonb_object_keys(v_target) k) x WHERE (v_expected -> k) IS DISTINCT FROM (v_target -> k);
  SELECT coalesce(jsonb_agg(jsonb_build_object('key', r.key, 'resolution', r.resolution, 'kind', r.kind, 'value', r.value, 'unit', r.unit, 'citations', r.citations) ORDER BY r.key), '[]'::jsonb)
    INTO v_ground
    FROM twin.tbr_resolutions(p_merge) r
   WHERE (r.resolution = 'take_branch' AND v_expected ? r.key) OR r.resolution = 'reconciled';
  RETURN (SELECT (to_jsonb(x) - 'scope' - 'tenant_id' - 'domain_id') FROM twin.branch_merges x WHERE x.merge_id = p_merge)
         || jsonb_build_object('plan', jsonb_build_object('carry_from', m.target_version, 'except', to_jsonb(v_except), 'ground', v_ground, 'expected', v_expected,
                                                          'open_draft', v_draft));
END $$ LANGUAGE plpgsql;

/* CLOSE A MERGE (twin.branch.merge): refused — the twin's own owner declines it; withdrawn — its opener or the owner. A completing merge is
   released this way too (actual is no longer held). */
CREATE OR REPLACE FUNCTION twin.close_merge(p_merge uuid, p_tenant uuid, p_domain uuid, p_outcome text, p_reason text, p_actor uuid, p_event_id uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = twin, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE m twin.branch_merges%ROWTYPE; t twin.twins_current%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['twin.branch.merge']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'branch merge rejected (actor): recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO m FROM twin.branch_merges x WHERE x.merge_id = p_merge AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'branch merge rejected (unknown_merge): % is not a merge of this domain', p_merge USING ERRCODE = '23503'; END IF;
  t := twin.tbr_twin(m.twin_id, p_tenant, p_domain, 'branch merge');
  IF p_outcome IS NULL OR p_outcome NOT IN ('refused', 'withdrawn') THEN
    RAISE EXCEPTION 'branch merge rejected (outcome): a merge is closed refused or withdrawn' USING ERRCODE = '22023';
  END IF;
  IF p_outcome = 'refused' AND t.owner_principal_id IS DISTINCT FROM p_actor THEN
    RAISE EXCEPTION 'branch merge rejected (ownership): only the twin''s own owner (%) refuses a merge', t.owner_principal_id USING ERRCODE = '42501';
  END IF;
  IF p_outcome = 'withdrawn' AND p_actor IS DISTINCT FROM m.opened_by AND p_actor IS DISTINCT FROM t.owner_principal_id THEN
    RAISE EXCEPTION 'branch merge rejected (ownership): a merge is withdrawn by its opener or the twin''s own owner' USING ERRCODE = '42501';
  END IF;
  IF m.state NOT IN ('open', 'reconciled', 'completing') THEN
    RAISE EXCEPTION 'branch merge rejected (state): merge % is already %', p_merge, m.state USING ERRCODE = '2F002';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 8 AND 2000 THEN
    RAISE EXCEPTION 'branch merge rejected (reason): closing a merge says why (8 to 2000 characters)' USING ERRCODE = '22023';
  END IF;
  UPDATE twin.branch_merges SET state = p_outcome, closed_by = p_actor, closed_at = clock_timestamp(), close_reason = btrim(p_reason) WHERE merge_id = p_merge;
  PERFORM twin.tbr_event(p_tenant, p_domain, m.twin_id, p_merge, CASE p_outcome WHEN 'refused' THEN 'merge.refused' ELSE 'merge.withdrawn' END, p_actor,
    jsonb_build_object('prior_state', m.state, 'reason', btrim(p_reason)), p_correlation, p_event_id);
  RETURN (SELECT to_jsonb(x) - 'scope' - 'tenant_id' - 'domain_id' FROM twin.branch_merges x WHERE x.merge_id = p_merge);
END $$ LANGUAGE plpgsql;

/* RESTORE A CHECKPOINT (twin.branch.restore): records — with its reason — that the draft the twin's own owner just opened on a branch (through
   the existing open port, carrying from a named EARLIER admitted version) restores that checkpoint. The port verifies the facts: the draft is
   an open draft of this branch opened by the actor, its opening carried from the named version, and that version is admitted and older than
   the branch's head (or the branch has no head). */
CREATE OR REPLACE FUNCTION twin.restore_checkpoint(
  p_twin uuid, p_tenant uuid, p_domain uuid, p_branch text, p_from_version int, p_draft_version int, p_reason text, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = twin, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE t twin.twins_current%ROWTYPE; d twin.twin_versions%ROWTYPE; f twin.twin_versions%ROWTYPE; v_head int; v_carried text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['twin.branch.restore']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  t := twin.tbr_twin(p_twin, p_tenant, p_domain, 'checkpoint restore');
  PERFORM twin.tbr_assert_owner(t, p_actor, 'checkpoint restore', 'restoring a checkpoint');
  IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 8 AND 2000 THEN
    RAISE EXCEPTION 'checkpoint restore rejected (reason): a restore says why (8 to 2000 characters)' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO f FROM twin.twin_versions v WHERE v.twin_id = p_twin AND v.version = p_from_version;
  IF NOT FOUND OR f.state <> 'admitted' THEN
    RAISE EXCEPTION 'checkpoint restore rejected (unknown_checkpoint): version % is not an admitted version of this twin', p_from_version USING ERRCODE = '23503';
  END IF;
  SELECT * INTO d FROM twin.twin_versions v WHERE v.twin_id = p_twin AND v.version = p_draft_version;
  IF NOT FOUND OR d.state <> 'draft' OR d.branch_id <> p_branch OR d.opened_by <> p_actor THEN
    RAISE EXCEPTION 'checkpoint restore rejected (state): version % is not an open draft of branch % opened by the acting principal', p_draft_version, p_branch USING ERRCODE = '2F002';
  END IF;
  SELECT e.details ->> 'carried_from' INTO v_carried FROM twin.twin_events e
   WHERE e.twin_id = p_twin AND e.event = 'version.opened' AND (e.details ->> 'version')::int = p_draft_version ORDER BY e.occurred_at DESC LIMIT 1;
  IF v_carried IS NULL OR v_carried::int <> p_from_version THEN
    RAISE EXCEPTION 'checkpoint restore rejected (state): draft v% did not carry from v% (it carried from %)', p_draft_version, p_from_version, coalesce(v_carried, 'nothing') USING ERRCODE = '2F002';
  END IF;
  v_head := twin.tbr_head(p_twin, p_branch);
  IF v_head IS NOT NULL AND p_from_version >= v_head THEN
    RAISE EXCEPTION 'checkpoint restore rejected (checkpoint): v% is not earlier than the head v% of branch %; a restore returns to an earlier checkpoint', p_from_version, v_head, p_branch USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM twin.branch_events b WHERE b.twin_id = p_twin AND b.event = 'checkpoint.restored' AND (b.details ->> 'draft_version')::int = p_draft_version) THEN
    RAISE EXCEPTION 'checkpoint restore rejected (duplicate): draft v% is already recorded as a restore', p_draft_version USING ERRCODE = '23505';
  END IF;
  PERFORM twin.tbr_event(p_tenant, p_domain, p_twin, p_twin, 'checkpoint.restored', p_actor,
    jsonb_build_object('branch_id', p_branch, 'from_version', p_from_version, 'from_branch', f.branch_id, 'draft_version', p_draft_version, 'head_version', v_head,
                       'reason', btrim(p_reason)), p_correlation, p_event_id);
  RETURN jsonb_build_object('twin_id', p_twin, 'branch_id', p_branch, 'from_version', p_from_version, 'from_branch', f.branch_id, 'draft_version', p_draft_version,
                            'head_version', v_head, 'reason', btrim(p_reason));
END $$ LANGUAGE plpgsql;

/* FREEZE THE LAST VALIDATED SNAPSHOT (twin.snapshot.freeze): the twin's own owner; the version is the branch's LAST admitted version found FIT
   (twin.validate_version — a person other than the owner); a warning and an expiry instant (after now, within a year) are required. */
CREATE OR REPLACE FUNCTION twin.freeze_snapshot(
  p_freeze_id uuid, p_twin uuid, p_tenant uuid, p_domain uuid, p_branch text, p_version int, p_warning text, p_expires_at timestamptz,
  p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = twin, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE t twin.twins_current%ROWTYPE; v twin.twin_versions%ROWTYPE; v_branch text := coalesce(p_branch, 'actual'); f twin.snapshot_freezes%ROWTYPE; v_standing uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['twin.snapshot.freeze']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  t := twin.tbr_twin(p_twin, p_tenant, p_domain, 'snapshot');
  PERFORM twin.tbr_assert_owner(t, p_actor, 'snapshot', 'freezing the served snapshot');
  PERFORM 1 FROM twin.twins_current x WHERE x.twin_id = p_twin FOR UPDATE;
  SELECT x.freeze_id INTO v_standing FROM twin.snapshot_freezes x WHERE x.twin_id = p_twin AND x.lifted_at IS NULL;
  IF FOUND THEN RAISE EXCEPTION 'snapshot rejected (duplicate): freeze % already stands on this twin; lift it first', v_standing USING ERRCODE = '23505'; END IF;
  SELECT * INTO v FROM twin.twin_versions x WHERE x.twin_id = p_twin AND x.branch_id = v_branch AND x.state = 'admitted' AND x.fitness_state = 'fit'
   ORDER BY x.version DESC LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'snapshot rejected (state): branch % has no admitted version validated fit; only a validated snapshot is frozen', v_branch USING ERRCODE = '2F002';
  END IF;
  IF p_version IS NOT NULL AND p_version <> v.version THEN
    RAISE EXCEPTION 'snapshot rejected (state): v% is not the last validated snapshot of branch % (v% is)', p_version, v_branch, v.version USING ERRCODE = '2F002';
  END IF;
  IF p_warning IS NULL OR length(btrim(p_warning)) NOT BETWEEN 8 AND 1000 THEN
    RAISE EXCEPTION 'snapshot rejected (warning): a frozen snapshot carries its freshness warning (8 to 1000 characters)' USING ERRCODE = '22023';
  END IF;
  IF p_expires_at IS NULL OR p_expires_at <= clock_timestamp() OR p_expires_at > clock_timestamp() + interval '365 days' THEN
    RAISE EXCEPTION 'snapshot rejected (expiry): a frozen snapshot expires after now and within a year' USING ERRCODE = '22023';
  END IF;
  INSERT INTO twin.snapshot_freezes (freeze_id, scope, tenant_id, domain_id, twin_id, branch_id, version, validation_id, warning, expires_at, frozen_by, correlation_id)
  VALUES (p_freeze_id, 'DOMAIN', p_tenant, p_domain, p_twin, v_branch, v.version, v.fitness_validation_id, btrim(p_warning), p_expires_at, p_actor, p_correlation)
  RETURNING * INTO f;
  PERFORM twin.tbr_event(p_tenant, p_domain, p_twin, p_freeze_id, 'snapshot.frozen', p_actor,
    jsonb_build_object('branch_id', v_branch, 'version', v.version, 'validation_id', v.fitness_validation_id, 'expires_at', p_expires_at,
                       'head_version', twin.tbr_head(p_twin, v_branch)), p_correlation, p_event_id);
  RETURN to_jsonb(f) - 'scope' - 'tenant_id' - 'domain_id';
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION twin.lift_freeze(p_freeze_id uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_event_id uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = twin, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE f twin.snapshot_freezes%ROWTYPE; t twin.twins_current%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['twin.snapshot.freeze']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT * INTO f FROM twin.snapshot_freezes x WHERE x.freeze_id = p_freeze_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'snapshot rejected (unknown_freeze): % is not a freeze of this domain', p_freeze_id USING ERRCODE = '23503'; END IF;
  t := twin.tbr_twin(f.twin_id, p_tenant, p_domain, 'snapshot');
  PERFORM twin.tbr_assert_owner(t, p_actor, 'snapshot', 'lifting a freeze');
  IF f.lifted_at IS NOT NULL THEN RAISE EXCEPTION 'snapshot rejected (state): freeze % was lifted at %', p_freeze_id, f.lifted_at USING ERRCODE = '2F002'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 8 AND 2000 THEN
    RAISE EXCEPTION 'snapshot rejected (reason): lifting a freeze says why (8 to 2000 characters)' USING ERRCODE = '22023';
  END IF;
  UPDATE twin.snapshot_freezes SET lifted_by = p_actor, lifted_at = clock_timestamp(), lift_reason = btrim(p_reason) WHERE freeze_id = p_freeze_id RETURNING * INTO f;
  PERFORM twin.tbr_event(p_tenant, p_domain, f.twin_id, p_freeze_id, 'snapshot.lifted', p_actor,
    jsonb_build_object('version', f.version, 'expired', f.expires_at <= f.lifted_at, 'reason', btrim(p_reason)), p_correlation, p_event_id);
  RETURN to_jsonb(f) - 'scope' - 'tenant_id' - 'domain_id';
END $$ LANGUAGE plpgsql;

/* THE TICK STEP `twin-freshness` (executive.attention.tick): for each twin of the domain with a freshness policy, its actual head past the SLO
   → freshness.breached + twin.freshness to the owner, once per (head version, policy version); each standing freeze past its expiry →
   freeze.expired, or within the policy's near-expiry hours (24 without a policy) → freeze.expiring — each once. */
CREATE OR REPLACE FUNCTION twin.freshness_sweep(p_tenant uuid, p_domain uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = twin, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE x record; a jsonb; v_head int; v_ev uuid; v_item uuid; v_out jsonb := '[]'::jsonb; v_seen int := 0; v_breach int := 0; v_freeze int := 0; v_hours int; v_kind text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.attention.tick']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  FOR x IN SELECT t.twin_id, t.title, t.owner_principal_id FROM twin.twins_current t
            WHERE t.tenant_id = p_tenant AND t.domain_id = p_domain AND EXISTS (SELECT 1 FROM twin.freshness_policies f WHERE f.twin_id = t.twin_id)
            ORDER BY t.declared_at, t.twin_id LOOP
    v_seen := v_seen + 1;
    v_head := twin.tbr_head(x.twin_id, 'actual');
    IF v_head IS NULL THEN CONTINUE; END IF;
    a := twin.tbr_age(x.twin_id, v_head);
    IF a ->> 'state' <> 'stale' THEN CONTINUE; END IF;
    IF EXISTS (SELECT 1 FROM twin.branch_events b WHERE b.twin_id = x.twin_id AND b.event = 'freshness.breached'
                AND (b.details ->> 'version')::int = v_head AND (b.details ->> 'policy_version')::int = (a -> 'policy' ->> 'version')::int) THEN CONTINUE; END IF;
    v_ev := twin.tbr_event(p_tenant, p_domain, x.twin_id, x.twin_id, 'freshness.breached', p_actor,
      jsonb_build_object('version', v_head, 'policy_version', (a -> 'policy' ->> 'version')::int, 'age_days', a -> 'age_days', 'max_age_days', a -> 'policy' -> 'max_age_days',
                         'basis', a -> 'basis', 'reference_day', a -> 'reference_day'), p_correlation);
    v_item := twin.tbr_notify(p_tenant, p_domain, 'twin.freshness', 'twin', x.twin_id,
      format('%s: the served snapshot v%s is %s days stale (freshness SLO %s days)', x.title, v_head, a ->> 'age_days', a -> 'policy' ->> 'max_age_days'),
      jsonb_build_array('freshness_slo_breached'), x.owner_principal_id, v_ev, 'twin.freshness.breached',
      jsonb_build_object('twin_id', x.twin_id, 'version', v_head, 'age_days', a -> 'age_days', 'max_age_days', a -> 'policy' -> 'max_age_days'), interval '1 day', p_actor, p_correlation);
    v_breach := v_breach + 1;
    v_out := v_out || jsonb_build_object('twin_id', x.twin_id, 'kind', 'freshness.breached', 'version', v_head, 'attention_item_id', v_item);
  END LOOP;
  FOR x IN SELECT f.*, t.title, t.owner_principal_id FROM twin.snapshot_freezes f JOIN twin.twins_current t ON t.twin_id = f.twin_id
            WHERE f.tenant_id = p_tenant AND f.domain_id = p_domain AND f.lifted_at IS NULL ORDER BY f.frozen_at, f.freeze_id LOOP
    SELECT p.near_expiry_hours INTO v_hours FROM twin.freshness_policies p WHERE p.twin_id = x.twin_id ORDER BY p.version DESC LIMIT 1;
    v_kind := CASE WHEN x.expires_at <= clock_timestamp() THEN 'freeze.expired'
                   WHEN x.expires_at <= clock_timestamp() + make_interval(hours => coalesce(v_hours, 24)) THEN 'freeze.expiring' END;
    IF v_kind IS NULL OR EXISTS (SELECT 1 FROM twin.branch_events b WHERE b.subject_id = x.freeze_id AND b.event = v_kind) THEN CONTINUE; END IF;
    v_ev := twin.tbr_event(p_tenant, p_domain, x.twin_id, x.freeze_id, v_kind, p_actor,
      jsonb_build_object('version', x.version, 'expires_at', x.expires_at), p_correlation);
    v_item := twin.tbr_notify(p_tenant, p_domain, 'twin.freshness', 'twin', x.twin_id,
      format('%s: the frozen snapshot v%s %s at %s', x.title, x.version, CASE v_kind WHEN 'freeze.expired' THEN 'expired' ELSE 'expires' END, to_char(x.expires_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI "UTC"')),
      jsonb_build_array(CASE v_kind WHEN 'freeze.expired' THEN 'frozen_snapshot_expired' ELSE 'frozen_snapshot_nearing_expiry' END), x.owner_principal_id, v_ev, 'twin.' || v_kind,
      jsonb_build_object('twin_id', x.twin_id, 'freeze_id', x.freeze_id, 'version', x.version, 'expires_at', x.expires_at), interval '1 day', p_actor, p_correlation);
    v_freeze := v_freeze + 1;
    v_out := v_out || jsonb_build_object('twin_id', x.twin_id, 'kind', v_kind, 'freeze_id', x.freeze_id, 'attention_item_id', v_item);
  END LOOP;
  RETURN jsonb_build_object('considered', v_seen, 'breaches', v_breach, 'freezes', v_freeze, 'raised', v_out);
END $$ LANGUAGE plpgsql;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['twin.set_freshness_policy(uuid,uuid,uuid,int,jsonb,int,text,uuid,uuid,uuid)',
                           'twin.open_merge(uuid,uuid,uuid,uuid,text,text,uuid,uuid,uuid)',
                           'twin.resolve_merge_key(uuid,uuid,uuid,text,text,text,jsonb,text,jsonb,text,uuid,uuid,uuid)',
                           'twin.complete_merge(uuid,uuid,uuid,uuid,uuid,uuid)',
                           'twin.close_merge(uuid,uuid,uuid,text,text,uuid,uuid,uuid)',
                           'twin.restore_checkpoint(uuid,uuid,uuid,text,int,int,text,uuid,uuid,uuid)',
                           'twin.freeze_snapshot(uuid,uuid,uuid,uuid,text,int,text,timestamptz,uuid,uuid,uuid)',
                           'twin.lift_freeze(uuid,uuid,uuid,text,uuid,uuid,uuid)',
                           'twin.freshness_sweep(uuid,uuid,uuid,uuid)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO eye_commit', f);
  END LOOP;
END $$;

-- §BR.5 THE READS (INVOKER: the caller's own row security decides what is seen) ─────────

/* FRESHNESS of a version: the age by the database's day against the twin's policy; per element, staleness by age (expired — valid_to before
   today; stale — judged stale at carry, or older than its key's maximum age); and the DEPENDENCY uncertainty — each live upstream twin (through
   twin.twin_links) with its head, its verification state, its own freshness, and whether this version cites an older upstream version. */
CREATE OR REPLACE FUNCTION twin.version_freshness(p_twin uuid, p_version int) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = twin, pg_catalog, pg_temp AS $$
DECLARE a jsonb; v twin.twin_versions%ROWTYPE; v_today date := (clock_timestamp() AT TIME ZONE 'UTC')::date; v_ref date; v_keys jsonb; v_elements jsonb; v_up jsonb; v_dep text;
BEGIN
  SELECT * INTO v FROM twin.twin_versions x WHERE x.twin_id = p_twin AND x.version = p_version;
  IF NOT FOUND THEN RETURN NULL; END IF;
  a := twin.tbr_age(p_twin, p_version);
  v_ref := (a ->> 'reference_day')::date;
  v_keys := coalesce(a -> 'policy' -> 'key_max_age', '{}'::jsonb);
  SELECT coalesce(jsonb_agg(z ORDER BY z ->> 'key'), '[]'::jsonb) INTO v_elements FROM (
    SELECT jsonb_build_object('key', e.key, 'kind', e.kind, 'health', e.health, 'valid_from', e.valid_from, 'valid_to', e.valid_to,
             'age_days', v_today - coalesce(e.valid_from, v_ref),
             'max_age_days', mk.days,
             'state', CASE WHEN e.valid_to IS NOT NULL AND e.valid_to < v_today THEN 'expired'
                           WHEN e.health = 'stale' THEN 'stale'
                           WHEN mk.days IS NOT NULL AND v_today - coalesce(e.valid_from, v_ref) > mk.days THEN 'stale'
                           WHEN mk.days IS NULL AND e.valid_to IS NULL THEN 'unbounded'
                           ELSE 'fresh' END) z
      FROM twin.state_elements e
      LEFT JOIN LATERAL (SELECT (k.value #>> '{}')::int AS days FROM jsonb_each(v_keys) k
                          WHERE e.key = k.key OR split_part(e.key, ':', 1) = k.key OR split_part(e.key, ':', 1) LIKE k.key || '.%'
                          ORDER BY length(k.key) DESC LIMIT 1) mk ON true
     WHERE e.twin_id = p_twin AND e.version = p_version) q;
  SELECT coalesce(jsonb_agg(u ORDER BY u ->> 'title'), '[]'::jsonb) INTO v_up FROM (
    SELECT jsonb_build_object('twin_id', l.upstream_twin_id, 'title', ut.title, 'link_id', l.link_id, 'head_version', h.head,
             'cited_version', cv.cited,
             'behind', cv.cited IS NOT NULL AND h.head IS NOT NULL AND cv.cited < h.head,
             'verification_state', CASE WHEN h.head IS NULL THEN NULL ELSE (twin.tbr_age(l.upstream_twin_id, h.head) ->> 'verification_state') END,
             'freshness', CASE WHEN h.head IS NULL THEN 'no_head' ELSE (twin.tbr_age(l.upstream_twin_id, h.head) ->> 'state') END,
             'age_days', CASE WHEN h.head IS NULL THEN NULL ELSE (twin.tbr_age(l.upstream_twin_id, h.head) -> 'age_days') END) u
      FROM twin.twin_links l
      JOIN twin.twins_current ut ON ut.twin_id = l.upstream_twin_id
      CROSS JOIN LATERAL (SELECT twin.tbr_head(l.upstream_twin_id, 'actual') AS head) h
      CROSS JOIN LATERAL (SELECT max((c ->> 'version')::int) AS cited FROM twin.state_elements e, jsonb_array_elements(e.citations) c
                           WHERE e.twin_id = p_twin AND e.version = p_version AND c ->> 'kind' = 'twin' AND (c ->> 'id')::uuid = l.upstream_twin_id) cv
     WHERE l.downstream_twin_id = p_twin AND l.state = 'live') q;
  v_dep := CASE WHEN jsonb_array_length(v_up) = 0 THEN 'none'
                WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(v_up) u WHERE u ->> 'freshness' IN ('stale', 'no_head') OR u ->> 'verification_state' = 'unverified'
                                                                      OR (u ->> 'behind')::boolean) THEN 'uncertain'
                ELSE 'certain' END;
  RETURN a || jsonb_build_object(
    'twin_id', p_twin, 'state_of_version', v.state, 'known_at', v.known_at, 'observed_through', v.observed_through, 'fitness_state', v.fitness_state,
    'elements', v_elements,
    'stale_elements', (SELECT count(*) FROM jsonb_array_elements(v_elements) z WHERE z ->> 'state' IN ('stale', 'expired')),
    'dependency', jsonb_build_object('state', v_dep, 'upstream', v_up,
                                     'rule', 'uncertain when an upstream twin has no admitted head, is stale against its own policy, is unverified, or this version cites an older upstream version than its head'),
    'method', 'freshness@1 — age = the database''s day − observed_through (else the day of known_at); stale when age > the policy''s max_age_days; an element is expired when valid_to is before today, stale when judged stale at carry or older than its key''s max age (from valid_from, else the version''s reference day), unbounded with no validity end and no key policy');
END $$;

/* COMPONENT-LEVEL CONFIDENCE: the elements grouped by component (the key's first segment: inventory, shipment, terms, …) and by kind; per group
   the weakest link (minimum) and the mean of the STATED confidences, the coverage (stated / elements) and the unhealthy count. Nothing imputed. */
CREATE OR REPLACE FUNCTION twin.confidence_rollup(p_twin uuid, p_version int) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = twin, pg_catalog, pg_temp AS $$
  WITH e AS (SELECT e.key, e.kind, e.health, e.confidence, split_part(split_part(e.key, ':', 1), '.', 1) AS component
               FROM twin.state_elements e WHERE e.twin_id = p_twin AND e.version = p_version),
       agg AS (SELECT 'component' AS grp_by, component AS grp, count(*) n, count(confidence) stated, min(confidence) weakest, avg(confidence) mean,
                      count(*) FILTER (WHERE health <> 'complete') unhealthy, jsonb_agg(DISTINCT kind) kinds
                 FROM e GROUP BY component
               UNION ALL
               SELECT 'kind', kind, count(*), count(confidence), min(confidence), avg(confidence), count(*) FILTER (WHERE health <> 'complete'), jsonb_build_array(kind)
                 FROM e GROUP BY kind)
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM twin.twin_versions v WHERE v.twin_id = p_twin AND v.version = p_version) THEN NULL ELSE jsonb_build_object(
    'twin_id', p_twin, 'version', p_version,
    'overall', (SELECT jsonb_build_object('elements', count(*), 'stated', count(confidence), 'weakest', min(confidence), 'mean', round(avg(confidence), 4),
                                          'coverage', CASE WHEN count(*) = 0 THEN NULL ELSE round(count(confidence)::numeric / count(*), 4) END,
                                          'unhealthy', count(*) FILTER (WHERE health <> 'complete')) FROM e),
    'components', coalesce((SELECT jsonb_agg(jsonb_build_object('component', grp, 'elements', n, 'stated', stated, 'weakest', weakest, 'mean', round(mean, 4),
                                                             'coverage', round(stated::numeric / n, 4), 'unhealthy', unhealthy, 'kinds', kinds) ORDER BY grp)
                              FROM agg WHERE grp_by = 'component'), '[]'::jsonb),
    'kinds', coalesce((SELECT jsonb_agg(jsonb_build_object('kind', grp, 'elements', n, 'stated', stated, 'weakest', weakest, 'mean', round(mean, 4),
                                                        'coverage', round(stated::numeric / n, 4), 'unhealthy', unhealthy) ORDER BY grp)
                         FROM agg WHERE grp_by = 'kind'), '[]'::jsonb),
    'method', 'confidence-rollup@1 — per group (component = the key''s first segment; and per kind): weakest = the minimum and mean = the mean of the STATED element confidences; coverage = stated / elements; an element without a stated confidence is counted, never imputed; unhealthy = elements whose health is not complete') END
$$;

/* THE SERVED STATE at an instant (default: the database's now): the frozen snapshot when a freeze stood then — with its warning, its expiry,
   whether it had expired (a run on it is then refused: tbr_frozen_expiry) and the head it stands in for — else actual's head as admitted by
   then, with its freshness. */
CREATE OR REPLACE FUNCTION twin.served_state(p_twin uuid, p_as_of timestamptz) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = twin, pg_catalog, pg_temp AS $$
DECLARE v_at timestamptz := coalesce(p_as_of, clock_timestamp()); f twin.snapshot_freezes%ROWTYPE; v_head int; v_hours int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM twin.twins_current t WHERE t.twin_id = p_twin) THEN RETURN NULL; END IF;
  SELECT max(v.version) INTO v_head FROM twin.twin_versions v
   WHERE v.twin_id = p_twin AND v.branch_id = 'actual' AND v.state = 'admitted' AND v.admitted_at <= v_at;
  SELECT * INTO f FROM twin.snapshot_freezes x WHERE x.twin_id = p_twin AND x.frozen_at <= v_at AND (x.lifted_at IS NULL OR x.lifted_at > v_at)
   ORDER BY x.frozen_at DESC LIMIT 1;
  IF FOUND THEN
    SELECT p.near_expiry_hours INTO v_hours FROM twin.freshness_policies p WHERE p.twin_id = p_twin ORDER BY p.version DESC LIMIT 1;
    RETURN jsonb_build_object('twin_id', p_twin, 'as_of', v_at, 'mode', 'frozen', 'version', f.version, 'branch_id', f.branch_id, 'freeze_id', f.freeze_id,
      'validation_id', f.validation_id, 'warning', f.warning, 'expires_at', f.expires_at, 'expired', f.expires_at <= v_at,
      'nearing_expiry', f.expires_at > v_at AND f.expires_at <= v_at + make_interval(hours => coalesce(v_hours, 24)),
      'runs_allowed', f.expires_at > v_at, 'frozen_by', f.frozen_by, 'frozen_at', f.frozen_at, 'head_version', v_head,
      'freshness', twin.tbr_age(p_twin, f.version));
  END IF;
  RETURN jsonb_build_object('twin_id', p_twin, 'as_of', v_at, 'mode', CASE WHEN v_head IS NULL THEN 'none' ELSE 'head' END, 'version', v_head, 'branch_id', 'actual',
    'head_version', v_head, 'runs_allowed', v_head IS NOT NULL, 'freshness', CASE WHEN v_head IS NULL THEN NULL ELSE twin.tbr_age(p_twin, v_head) END);
END $$;

/* THE REVISIONS A COMMIT RECORDS (V03-T-196): the domain's active ontology version, the twin's freshness policy version and the domain's
   decision-use policy version, as they stand when the admit reads them — written into the TWN header (ontology_ref, freshness_state). */
CREATE OR REPLACE FUNCTION twin.commit_revisions(p_twin uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = twin, graph, simulation, pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object(
    'ontology', (SELECT jsonb_build_object('version_id', o.version_id, 'namespace', o.namespace, 'version', o.version)
                   FROM graph.ontology_versions o WHERE o.tenant_id = t.tenant_id AND o.domain_id = t.domain_id AND o.state = 'active' ORDER BY o.namespace LIMIT 1),
    'freshness_policy', (SELECT jsonb_build_object('version', f.version, 'max_age_days', f.max_age_days) FROM twin.freshness_policies f WHERE f.twin_id = t.twin_id ORDER BY f.version DESC LIMIT 1),
    'decision_use_policy', (SELECT jsonb_build_object('version', p.version, 'require_decision_use', p.require_decision_use)
                              FROM simulation.decision_use_policies p WHERE p.tenant_id = t.tenant_id AND p.domain_id = t.domain_id ORDER BY p.version DESC LIMIT 1))
    FROM twin.twins_current t WHERE t.twin_id = p_twin
$$;

REVOKE ALL ON FUNCTION twin.version_freshness(uuid,int), twin.confidence_rollup(uuid,int), twin.served_state(uuid,timestamptz), twin.commit_revisions(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION twin.version_freshness(uuid,int), twin.confidence_rollup(uuid,int), twin.served_state(uuid,timestamptz), twin.commit_revisions(uuid) TO eye_app, eye_commit;

-- §BR.6 THE GATES (triggers; default-off) ─────────────────────────────

/* A historical (frozen) snapshot used past its EXPIRY is refused for runs (FEX-14): a run opened on a version frozen by a standing freeze
   whose expiry has passed. */
CREATE OR REPLACE FUNCTION twin.tbr_frozen_expiry() RETURNS trigger
SECURITY DEFINER SET search_path = twin, pg_catalog, pg_temp AS $$
DECLARE f twin.snapshot_freezes%ROWTYPE;
BEGIN
  SELECT * INTO f FROM twin.snapshot_freezes x WHERE x.twin_id = NEW.twin_id AND x.version = NEW.twin_version AND x.lifted_at IS NULL AND x.expires_at <= clock_timestamp()
   ORDER BY x.frozen_at DESC LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'snapshot rejected (stale): v% is the frozen snapshot of freeze %, which expired at %; a historical snapshot past its expiry is not used for runs — lift the freeze or run on a current version',
      NEW.twin_version, f.freeze_id, f.expires_at USING ERRCODE = '2F002';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER tbr_frozen_expiry BEFORE INSERT ON simulation.runs_current FOR EACH ROW EXECUTE FUNCTION twin.tbr_frozen_expiry();

/* THE MERGE'S ADMISSION: an admission on actual while a merge of this twin is COMPLETING must carry its plan (every key's kind, value and
   unit as tbr_merge_expected) — then the merge is merged in the same transaction; otherwise the admission is refused (actual is held). */
CREATE OR REPLACE FUNCTION twin.tbr_merge_admitted() RETURNS trigger
SECURITY DEFINER SET search_path = twin, pg_catalog, pg_temp AS $$
DECLARE m twin.branch_merges%ROWTYPE; v_expected jsonb; v_have jsonb; v_diff text[];
BEGIN
  SELECT * INTO m FROM twin.branch_merges x WHERE x.twin_id = NEW.twin_id AND x.state = 'completing' FOR UPDATE;
  IF NOT FOUND THEN RETURN NEW; END IF;
  v_expected := twin.tbr_merge_expected(m.merge_id);
  v_have := twin.tbr_element_map(NEW.twin_id, NEW.version);
  SELECT coalesce(array_agg(k ORDER BY k), ARRAY[]::text[]) INTO v_diff
    FROM (SELECT jsonb_object_keys(v_expected) k UNION SELECT jsonb_object_keys(v_have)) x WHERE (v_expected -> k) IS DISTINCT FROM (v_have -> k);
  IF cardinality(v_diff) > 0 OR NEW.supersedes IS DISTINCT FROM m.target_version THEN
    RAISE EXCEPTION 'branch merge rejected (state): actual is held by merge % (branch %) being completed; v% does not carry its reconciled plan (differs on: %)',
      m.merge_id, m.source_branch, NEW.version, CASE WHEN cardinality(v_diff) = 0 THEN 'the version it supersedes' ELSE array_to_string(v_diff, ', ') END USING ERRCODE = '2F002';
  END IF;
  UPDATE twin.branch_merges SET state = 'merged', merged_version = NEW.version, merged_at = clock_timestamp() WHERE merge_id = m.merge_id;
  PERFORM twin.tbr_event(m.tenant_id, m.domain_id, m.twin_id, m.merge_id, 'merge.merged', public.eye_principal(),
    jsonb_build_object('merged_version', NEW.version, 'source_branch', m.source_branch, 'source_version', m.source_version, 'target_version', m.target_version,
                       'state_set_digest', NEW.state_set_digest), m.correlation_id);
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER tbr_merge_admitted AFTER UPDATE OF state ON twin.twin_versions
  FOR EACH ROW WHEN (OLD.state = 'draft' AND NEW.state = 'admitted' AND NEW.branch_id = 'actual') EXECUTE FUNCTION twin.tbr_merge_admitted();

/* NO MERGE AROUND THE MERGE: a draft opened on actual carrying from a version of a branch whose merge is in progress is refused — merging that
   branch back goes through its merge, refused until reconciliation. (Carry across branches stays open for every branch with no merge.) */
CREATE OR REPLACE FUNCTION twin.tbr_merge_bypass() RETURNS trigger
SECURITY DEFINER SET search_path = twin, pg_catalog, pg_temp AS $$
DECLARE v_from text; m twin.branch_merges%ROWTYPE;
BEGIN
  IF NEW.details ->> 'branch_id' IS DISTINCT FROM 'actual' OR NEW.details ->> 'carried_from' IS NULL THEN RETURN NEW; END IF;
  SELECT v.branch_id INTO v_from FROM twin.twin_versions v WHERE v.twin_id = NEW.twin_id AND v.version = (NEW.details ->> 'carried_from')::int;
  IF v_from IS NULL OR v_from = 'actual' THEN RETURN NEW; END IF;
  SELECT * INTO m FROM twin.branch_merges x WHERE x.twin_id = NEW.twin_id AND x.source_branch = v_from AND x.state IN ('open', 'reconciled', 'completing');
  IF FOUND THEN
    RAISE EXCEPTION 'branch merge rejected (unreconciled): branch % has merge % in progress (%); merging it back into actual goes through the merge, refused until reconciliation',
      v_from, m.merge_id, m.state USING ERRCODE = '2F002';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER tbr_merge_bypass BEFORE INSERT ON twin.twin_events
  FOR EACH ROW WHEN (NEW.event = 'version.opened') EXECUTE FUNCTION twin.tbr_merge_bypass();

REVOKE ALL ON FUNCTION twin.tbr_frozen_expiry(), twin.tbr_merge_admitted(), twin.tbr_merge_bypass() FROM PUBLIC;

-- ═════════════════════════════════════════════════════════════════════
-- section `envelope` (the part file 0103_b30_x_envelope.sql, built and proven alone on b30/envelope, combined here in the apply order)
-- ═════════════════════════════════════════════════════════════════════
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
REVOKE ALL ON FUNCTION simulation.ten_admission_once() FROM PUBLIC;
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

/* The model's state in a domain: the lifecycle row's, else 'approved' (every model in use before B30 — default-off). INVOKER: RLS answers
   only the caller's own domain (N-01's rule for a read that takes tenant/domain arguments). */
CREATE OR REPLACE FUNCTION twin.ten_model_state(p_tenant uuid, p_domain uuid, p_model text) RETURNS text
SET search_path = twin, pg_catalog, pg_temp AS $$
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
REVOKE ALL ON FUNCTION simulation.ten_exploratory_promotion() FROM PUBLIC;
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
REVOKE ALL ON FUNCTION simulation.ten_model_lifecycle() FROM PUBLIC;
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
                       "run": "a completed valid unretired CONTROL run of the model INSIDE its envelope (outputs.totals.<q>, or the seeded summary median) against the earliest OBSERVED element outcome.<q>[:suffix] of an admitted actual version admitted after the run completed and observed through its horizon"},
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
     WHERE v_q IS NOT NULL AND r.twin_id = p_twin_id AND r.model_ref = p_model AND r.run_kind = 'control' AND r.state = 'completed' AND r.validity = 'valid' AND r.retired_at IS NULL AND r.envelope_state <> 'outside'
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

-- ═════════════════════════════════════════════════════════════════════
-- section `estimation` (the part file 0103_b30_x_estimation.sql, built and proven alone on b30/estimation, combined here in the apply order)
-- ═════════════════════════════════════════════════════════════════════
-- 0103 §ES — CP-6 B30, part `estimation` (F-P5-02 complete): twin state ESTIMATION and continuous RECONCILIATION. Applied after the prelude
-- (§0) and, once combined by the integrator, after §BR and §EN. Forward-only; nothing earlier is edited. Every figure a harness or an act
-- seeds through this part is SYNTHETIC.
--
--   §ES.0 THE RECONCILIATION AGENT's registration and runs: executive.register_agent and executive.open_agent_run RE-DECLARED, copied whole
--         from their latest bodies (0092 §B.2), ONE change each (marked `B30 estimation`): the kind reconciliation (the prelude's; max_items
--         enforced by its scan) and its task reconcile_scan, run by a reconciliation agent and by no other kind.
--   §ES.1 THE TABLES (schema twin, prefix tes_): estimators (declared, versioned), estimates (CANDIDATE state, every estimator's candidate
--         kept), input_qualifications, observation_requests, estimation_events (the ledger).
--   §ES.2 HELPERS: the ledger row, the notice (the 0099 sio_notify idiom), the actor and proposer checks, the head, INPUT QUALIFICATION.
--   §ES.3 THE PORTS: declare_estimator / retire_estimator (twin.estimator.declare), propose_estimate (twin.estimate.propose), decide_estimate
--         (twin.estimate.decide), request_observations / cancel_observation_request (twin.observation.request), queue_estimation_triggers
--         (twin.estimation.trigger), and the invoker read estimation_pending.
--   §ES.4 PUBLICATION THROUGH THE EXISTING PORTS: the owner's approval opens, grounds and admits the new snapshot in ONE transaction under
--         twin.estimate.decide — twin.open_version and twin.ground_element (0092:628/696) and twin.admit_version (0032:458) RE-DECLARED,
--         copied whole, ONE change each (they also serve the bound action twin.estimate.decide; the B29 twin.coupling.apply precedent), and
--         the canonical write action twin.estimate.decide → TWN. (§BR's merge needs the same three ports for its own action: the integrator
--         folds both additions into one re-declaration each.)

-- ═════════════════════════════════════════════════════════════════════
-- section `estimation`
-- ═════════════════════════════════════════════════════════════════════

-- ============================================================
-- §ES.0 THE RECONCILIATION AGENT: its kind and its task (0092 §B.2 copied whole — B30 estimation: reconciliation / reconcile_scan)
-- ============================================================
CREATE OR REPLACE FUNCTION executive.register_agent(
  p_agent_id uuid, p_tenant uuid, p_domain uuid, p_principal uuid, p_kind text, p_version text, p_code_digest text, p_owner uuid, p_escalation uuid,
  p_budgets jsonb, p_stop_conditions jsonb, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, decision, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_kind text; v_status text; sc jsonb; k text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['agent.register']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  /* B32 (0089) exposures: the Risk and Opportunity Agents; B29 (0092) §B: the Supply Chain Agent */
  IF p_kind NOT IN ('decision', 'briefing', 'reporting', 'attention', 'weak_signal', 'risk', 'opportunity', /* B29 (0092) */ 'supply_chain', /* B30 estimation */ 'reconciliation') THEN RAISE EXCEPTION 'agent rejected: kind is decision, briefing, reporting, attention, weak_signal, risk, opportunity, supply_chain or reconciliation' USING ERRCODE = '22023'; END IF;
  /* end B32 exposures */
  SELECT kind, status INTO v_kind, v_status FROM identity.principals WHERE id = p_principal AND tenant_id = p_tenant;
  IF NOT FOUND OR v_kind <> 'agent' OR v_status <> 'active' THEN RAISE EXCEPTION 'agent rejected: the principal must be an active principal of kind agent in this tenant' USING ERRCODE = '42501'; END IF;
  IF NOT decision.is_active_human(p_owner, p_tenant) THEN RAISE EXCEPTION 'agent rejected: the owner is the accountable human, never another agent' USING ERRCODE = '42501'; END IF;
  IF NOT decision.is_active_human(p_escalation, p_tenant) THEN RAISE EXCEPTION 'agent rejected: the escalation target is a named human' USING ERRCODE = '42501'; END IF;
  IF p_budgets IS NULL OR jsonb_typeof(p_budgets) <> 'object' OR NOT (p_budgets ? 'max_reads' AND p_budgets ? 'max_gateway_calls' AND p_budgets ? 'max_elapsed_ms') THEN
    RAISE EXCEPTION 'agent rejected: budgets name max_reads, max_gateway_calls and max_elapsed_ms' USING ERRCODE = '22023';
  END IF;
  FOREACH k IN ARRAY ARRAY['max_reads', 'max_gateway_calls', 'max_elapsed_ms'] LOOP
    IF jsonb_typeof(p_budgets -> k) <> 'number' OR (p_budgets ->> k)::numeric < 0 OR (p_budgets ->> k)::numeric <> floor((p_budgets ->> k)::numeric) THEN
      RAISE EXCEPTION 'agent rejected: budget % is a non-negative integer', k USING ERRCODE = '22023';
    END IF;
  END LOOP;
  -- B24 (0086 §T): the attention timer's cadence — a whole number of seconds in [60, 86400]; no other kind carries it
  IF p_budgets ? 'tick_every_seconds' THEN
    IF p_kind <> 'attention' THEN RAISE EXCEPTION 'agent rejected: budget tick_every_seconds is the attention timer''s cadence; a % agent has none', p_kind USING ERRCODE = '22023'; END IF;
    IF jsonb_typeof(p_budgets -> 'tick_every_seconds') <> 'number' OR (p_budgets ->> 'tick_every_seconds')::numeric <> floor((p_budgets ->> 'tick_every_seconds')::numeric)
       OR (p_budgets ->> 'tick_every_seconds')::numeric < 60 OR (p_budgets ->> 'tick_every_seconds')::numeric > 86400 THEN
      RAISE EXCEPTION 'agent rejected: budget tick_every_seconds is a whole number of seconds in [60, 86400]' USING ERRCODE = '22023';
    END IF;
  END IF;
  IF p_stop_conditions IS NOT NULL AND jsonb_typeof(p_stop_conditions) <> 'array' THEN RAISE EXCEPTION 'agent rejected: stop_conditions is an array' USING ERRCODE = '22023'; END IF;
  FOR sc IN SELECT * FROM jsonb_array_elements(coalesce(p_stop_conditions, '[]'::jsonb)) LOOP
    IF jsonb_typeof(sc) <> 'object' OR (sc ->> 'kind') NOT IN ('max_items', 'on_degraded') THEN
      RAISE EXCEPTION 'agent rejected: stop condition % is not one this runtime supports (max_items, on_degraded)', coalesce(sc ->> 'kind', sc::text) USING ERRCODE = '22023';
    END IF;
    -- every accepted condition is one this agent kind's task enforces: max_items on the decision draft and the briefing; on_degraded on the briefing
    -- B28 (0088 §S6): max_items on the weak-signal scan too (the nominations one run makes; the rest wait for the next scan)
    -- B32 (0089): max_items on the risk and opportunity estimates too (the exposures one run re-estimates; the rest wait for the next run)
    -- B29 (0092) §B: max_items on the supply scan too (the findings one run drafts; the rest wait for the next run)
    -- B30 estimation: max_items on the reconcile scan too (the estimates one run proposes; the rest wait for the next run)
    IF (sc ->> 'kind') = 'max_items' AND p_kind NOT IN ('decision', 'briefing', 'weak_signal', /* B32 (0089) */ 'risk', 'opportunity', /* B29 (0092) */ 'supply_chain', /* B30 estimation */ 'reconciliation') THEN
      RAISE EXCEPTION 'agent rejected: stop condition max_items is not enforced by a % agent''s task; an unenforced control is not accepted', p_kind USING ERRCODE = '22023';
    END IF;
    IF (sc ->> 'kind') = 'on_degraded' AND p_kind <> 'briefing' THEN
      RAISE EXCEPTION 'agent rejected: stop condition on_degraded is not enforced by a % agent''s task; an unenforced control is not accepted', p_kind USING ERRCODE = '22023';
    END IF;
    IF (sc ->> 'kind') = 'max_items' AND (jsonb_typeof(sc -> 'value') <> 'number' OR (sc ->> 'value')::numeric < 0) THEN
      RAISE EXCEPTION 'agent rejected: stop condition max_items names a non-negative value' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  INSERT INTO executive.agents (agent_id, scope, tenant_id, domain_id, principal_id, agent_kind, agent_version, code_digest, owner_principal_id, escalation_principal_id, budgets, stop_conditions, created_by, correlation_id)
  VALUES (p_agent_id, 'DOMAIN', p_tenant, p_domain, p_principal, p_kind, p_version, p_code_digest, p_owner, p_escalation, p_budgets, coalesce(p_stop_conditions, '[]'::jsonb), p_actor, p_correlation);
  RETURN jsonb_build_object('agent_id', p_agent_id, 'principal_id', p_principal, 'kind', p_kind);
END $$ LANGUAGE plpgsql;

-- 0089 §R2 copied whole (0088 §S6 + 0086 §T + B32); B29 §B: the task supply_scan, run by a supply_chain agent and by no other kind (the
-- refusal texts keep the 0046 phrases the refusal row reads — `task is draft, briefing, report or monitor`, `a % agent does not run the task`).
CREATE OR REPLACE FUNCTION executive.open_agent_run(
  p_run_id uuid, p_tenant uuid, p_domain uuid, p_agent_id uuid, p_task text, p_trigger_kind text, p_trigger_principal uuid, p_trigger_ref text, p_room_id uuid, p_package_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE a executive.agents%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['agent.run']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT * INTO a FROM executive.agents WHERE agent_id = p_agent_id AND tenant_id = p_tenant AND domain_id = p_domain;
  IF NOT FOUND OR a.status <> 'active' THEN RAISE EXCEPTION 'run rejected: no active agent % in this domain', p_agent_id USING ERRCODE = '42501'; END IF;
  IF a.principal_id IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'run rejected: a run is opened by the agent itself, under its own session' USING ERRCODE = '42501'; END IF;
  IF p_task NOT IN ('draft', 'briefing', 'report', 'monitor', 'attention_tick', 'signal_scan', /* B32 (0089) */ 'risk_assess', 'opportunity_assess', /* B29 (0092) */ 'supply_scan', /* B30 estimation */ 'reconcile_scan') THEN RAISE EXCEPTION 'run rejected: task is draft, briefing, report or monitor (or attention_tick for an attention agent, signal_scan for a weak_signal agent, risk_assess for a risk agent, opportunity_assess for an opportunity agent, supply_scan for a supply_chain agent, reconcile_scan for a reconciliation agent)' USING ERRCODE = '22023'; END IF;
  IF (a.agent_kind = 'decision' AND p_task <> 'draft') OR (a.agent_kind = 'briefing' AND p_task NOT IN ('briefing', 'monitor')) OR (a.agent_kind = 'reporting' AND p_task <> 'report')
     OR (a.agent_kind = 'attention' AND p_task <> 'attention_tick') OR (a.agent_kind <> 'attention' AND p_task = 'attention_tick')
     -- B28 (0088 §S6): the weak-signal scan, run by a weak_signal agent and by no other kind
     OR (a.agent_kind = 'weak_signal' AND p_task <> 'signal_scan') OR (a.agent_kind <> 'weak_signal' AND p_task = 'signal_scan')
     -- B32 (0089): the risk estimate by a risk agent, the opportunity estimate by an opportunity agent, and by no other kind
     OR (a.agent_kind = 'risk' AND p_task <> 'risk_assess') OR (a.agent_kind <> 'risk' AND p_task = 'risk_assess')
     OR (a.agent_kind = 'opportunity' AND p_task <> 'opportunity_assess') OR (a.agent_kind <> 'opportunity' AND p_task = 'opportunity_assess')
     -- B29 (0092) §B: the supply scan by a supply_chain agent, and by no other kind
     OR (a.agent_kind = 'supply_chain' AND p_task <> 'supply_scan') OR (a.agent_kind <> 'supply_chain' AND p_task = 'supply_scan')
     -- B30 estimation: the reconcile scan by a reconciliation agent, and by no other kind
     OR (a.agent_kind = 'reconciliation' AND p_task <> 'reconcile_scan') OR (a.agent_kind <> 'reconciliation' AND p_task = 'reconcile_scan') THEN
    RAISE EXCEPTION 'run rejected: a % agent does not run the task %', a.agent_kind, p_task USING ERRCODE = '42501';
  END IF;
  INSERT INTO executive.agent_runs (run_id, scope, tenant_id, domain_id, agent_id, principal_id, agent_kind, agent_version, code_digest, task, trigger_kind, trigger_principal_id, trigger_ref, room_id, package_id, budget, correlation_id)
  VALUES (p_run_id, 'DOMAIN', p_tenant, p_domain, p_agent_id, a.principal_id, a.agent_kind, a.agent_version, a.code_digest, p_task, p_trigger_kind, p_trigger_principal, p_trigger_ref, p_room_id, p_package_id, a.budgets, p_correlation);
  RETURN jsonb_build_object('run_id', p_run_id, 'budget', a.budgets, 'stop_conditions', a.stop_conditions, 'escalation_principal_id', a.escalation_principal_id);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.open_agent_run(uuid,uuid,uuid,uuid,text,text,uuid,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.open_agent_run(uuid,uuid,uuid,uuid,text,text,uuid,text,uuid,uuid,uuid) TO eye_commit;

-- ============================================================
-- §ES.1 THE TABLES (schema twin, prefix tes_)
-- ============================================================
/* ESTIMATORS — declared per twin × key by the twin's owner; versioned (a re-declaration of the same name is version n+1, the prior
   superseded); one PRIMARY per twin × key (its candidate is the proposal), any number of CHALLENGERS (their candidates are kept beside it:
   the disagreement retained). The method and its parameters, the inputs (series of the domain or elements of the twin's head), the unit of
   the estimated element, the declared bounds (the RANGE rule), the materiality and ambiguity thresholds (relative), the constraint sets that
   validate it before publish (empty: every live set of the domain). */
CREATE TABLE twin.estimators (
  estimator_id         uuid NOT NULL,
  version              int  NOT NULL CHECK (version >= 1),
  scope                text NOT NULL,
  tenant_id            uuid NOT NULL,
  domain_id            uuid NOT NULL,
  twin_id              uuid NOT NULL,
  key                  text NOT NULL CHECK (key ~ '^[a-z][a-z0-9_.-]*(:[A-Za-z0-9_.-]+)?$'),
  name                 text NOT NULL CHECK (name ~ '^[a-z][a-z0-9-]{1,60}$'),
  role                 text NOT NULL CHECK (role IN ('primary', 'challenger')),
  method               text NOT NULL CHECK (method IN ('last_observation', 'moving_average', 'ratio_to_baseline', 'kalman_1d')),
  parameters           jsonb NOT NULL CHECK (jsonb_typeof(parameters) = 'object'),
  inputs               jsonb NOT NULL CHECK (jsonb_typeof(inputs) = 'array' AND jsonb_array_length(inputs) BETWEEN 1 AND 5),
  unit                 text NOT NULL CHECK (length(btrim(unit)) BETWEEN 1 AND 40),
  bounds               jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(bounds) = 'object'),
  materiality          numeric NOT NULL CHECK (materiality > 0 AND materiality <= 10),
  ambiguity            numeric NOT NULL CHECK (ambiguity > 0 AND ambiguity <= 10),
  constraint_sets      text[] NOT NULL DEFAULT '{}',
  owner_principal_id   uuid NOT NULL,
  digest               text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  note                 text NOT NULL CHECK (length(btrim(note)) BETWEEN 8 AND 2000),
  state                text NOT NULL CHECK (state IN ('active', 'superseded', 'retired')),
  declared_by          uuid NOT NULL,
  declared_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  ended_by             uuid,
  ended_at             timestamptz,
  end_reason           text,
  correlation_id       uuid NOT NULL,
  PRIMARY KEY (estimator_id, version),
  CONSTRAINT tes_estimator_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT tes_estimator_ended CHECK ((state = 'active') = (ended_at IS NULL) AND (ended_at IS NULL) = (ended_by IS NULL))
);
CREATE UNIQUE INDEX tes_estimator_one_active ON twin.estimators (twin_id, key, name) WHERE state = 'active';
CREATE UNIQUE INDEX tes_estimator_one_primary ON twin.estimators (twin_id, key) WHERE state = 'active' AND role = 'primary';
CREATE INDEX tes_estimator_twin ON twin.estimators (twin_id, key, state);

/* ESTIMATES — CANDIDATE state: never a twin version, never an element of the active snapshot. Every active estimator's candidate kept
   (DISAGREEMENT RETAINED: the excluded ones with the reason, the spread stated); the qualification summary (the rows in
   input_qualifications); the constraint check before publish (the engine's verdict on the estimate's quantities as a run_input subject,
   the set versions pinned) and the range check (the primary's declared bounds); the materiality against the head's value. proposed →
   approved (the twin owner: a NEW SNAPSHOT, applied_version) | declined | superseded (a later proposal for the same twin × key). */
CREATE TABLE twin.estimates (
  estimate_id          uuid PRIMARY KEY,
  scope                text NOT NULL,
  tenant_id            uuid NOT NULL,
  domain_id            uuid NOT NULL,
  twin_id              uuid NOT NULL,
  key                  text NOT NULL,
  head_version         int,
  head_value           jsonb,
  head_unit            text,
  as_of                date NOT NULL,
  proposed_value       numeric NOT NULL,
  unit                 text NOT NULL,
  confidence           numeric NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  primary_estimator    jsonb NOT NULL CHECK (jsonb_typeof(primary_estimator) = 'object'),
  candidates           jsonb NOT NULL CHECK (jsonb_typeof(candidates) = 'array' AND jsonb_array_length(candidates) >= 1),
  spread               jsonb NOT NULL CHECK (jsonb_typeof(spread) = 'object'),
  qualification        jsonb NOT NULL CHECK (jsonb_typeof(qualification) = 'object'),
  constraint_check     jsonb NOT NULL CHECK (jsonb_typeof(constraint_check) = 'object'),
  constraint_outcome   text NOT NULL CHECK (constraint_outcome IN ('satisfied', 'violated', 'indeterminate')),
  range_check          jsonb NOT NULL CHECK (jsonb_typeof(range_check) = 'object'),
  materiality          jsonb NOT NULL CHECK (jsonb_typeof(materiality) = 'object'),
  material             boolean NOT NULL,
  ambiguous            boolean NOT NULL,
  ambiguity_reasons    jsonb NOT NULL DEFAULT '[]'::jsonb,
  routed               boolean NOT NULL DEFAULT false,
  attention_item_id    uuid,
  evidence             jsonb NOT NULL CHECK (jsonb_typeof(evidence) = 'array'),
  inputs_digest        text NOT NULL CHECK (inputs_digest ~ '^[0-9a-f]{64}$'),
  trigger              jsonb NOT NULL DEFAULT '{}'::jsonb,
  state                text NOT NULL CHECK (state IN ('proposed', 'approved', 'declined', 'superseded')),
  proposed_by          uuid NOT NULL,
  proposer_kind        text NOT NULL CHECK (proposer_kind IN ('human', 'agent')),
  agent_id             uuid,
  run_id               uuid,
  proposed_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  decided_by           uuid,
  decided_at           timestamptz,
  decision_note        text,
  applied_version      int,
  superseded_by        uuid,
  correlation_id       uuid NOT NULL,
  CONSTRAINT tes_estimate_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT tes_estimate_agent CHECK ((proposer_kind = 'agent') = (agent_id IS NOT NULL AND run_id IS NOT NULL)),
  CONSTRAINT tes_estimate_decided CHECK (state NOT IN ('approved', 'declined') OR (decided_by IS NOT NULL AND decided_at IS NOT NULL)),
  CONSTRAINT tes_estimate_applied CHECK ((state = 'approved') = (applied_version IS NOT NULL)),
  CONSTRAINT tes_estimate_declined CHECK (state <> 'declined' OR decision_note IS NOT NULL),
  CONSTRAINT tes_estimate_superseded CHECK ((state = 'superseded') = (superseded_by IS NOT NULL))
);
CREATE UNIQUE INDEX tes_estimate_one_open ON twin.estimates (twin_id, key) WHERE state = 'proposed';
CREATE INDEX tes_estimate_twin ON twin.estimates (twin_id, key, proposed_at);

/* INPUT QUALIFICATIONS — per estimate, per estimator, per input: the source's health now, the cadence (the input's latest point against the
   reference date — the head's world cut-off — and the declared cadence), the unit (the series' registered unit, or the element's, against
   the declared one), the truth state (the cited evidence's, or the element's kind), and the verdict. Estimation runs ONLY on qualified
   inputs: an estimator with a disqualified input contributes no candidate (it is kept, excluded, with the reason). Append-only. */
CREATE TABLE twin.input_qualifications (
  qualification_id     uuid PRIMARY KEY,
  scope                text NOT NULL,
  tenant_id            uuid NOT NULL,
  domain_id            uuid NOT NULL,
  estimate_id          uuid NOT NULL,
  estimator_id         uuid NOT NULL,
  estimator_version    int  NOT NULL,
  input_index          int  NOT NULL CHECK (input_index >= 0),
  input                jsonb NOT NULL,
  source_id            uuid,
  source_health        jsonb NOT NULL,
  cadence              jsonb NOT NULL,
  unit_check           jsonb NOT NULL,
  truth_state          jsonb NOT NULL,
  verdict              text NOT NULL CHECK (verdict IN ('qualified', 'disqualified')),
  reasons              jsonb NOT NULL DEFAULT '[]'::jsonb,
  recorded_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id       uuid NOT NULL,
  CONSTRAINT tes_qual_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX tes_qual_estimate ON twin.input_qualifications (estimate_id, estimator_id, input_index);
CREATE TRIGGER tes_qual_append_only BEFORE UPDATE OR DELETE ON twin.input_qualifications FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

/* OBSERVATION REQUESTS (V02-T-013) — a request for new observations of a missing or stale input of a twin: through the COLLECTION SCHEDULER
   where the source is scheduled (the entry recorded with the request: its scheduler id and cadence — the next collection answers it), else
   an attention item (twin.observation_request) to the source's steward (its approver), else the twin's owner. open → fulfilled (a new
   evidence version of the source recorded after the request — found by the after-tick check) | cancelled. One open request per twin × input. */
CREATE TABLE twin.observation_requests (
  request_id           uuid PRIMARY KEY,
  scope                text NOT NULL,
  tenant_id            uuid NOT NULL,
  domain_id            uuid NOT NULL,
  twin_id              uuid NOT NULL,
  key                  text,
  estimator_id         uuid,
  input                jsonb NOT NULL CHECK (jsonb_typeof(input) = 'object'),
  input_ref            text NOT NULL CHECK (input_ref ~ '^(series|element):.{1,200}$'),
  source_id            uuid,
  reason_class         text NOT NULL CHECK (reason_class IN ('missing', 'stale', 'disqualified')),
  note                 text NOT NULL CHECK (length(btrim(note)) BETWEEN 8 AND 2000),
  via                  text NOT NULL CHECK (via IN ('scheduler', 'attention')),
  scheduler            jsonb,
  attention_item_id    uuid,
  routed_to            uuid,
  state                text NOT NULL CHECK (state IN ('open', 'fulfilled', 'cancelled')),
  requested_by         uuid NOT NULL,
  requester_kind       text NOT NULL CHECK (requester_kind IN ('human', 'agent')),
  agent_id             uuid,
  run_id               uuid,
  requested_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  closed_at            timestamptz,
  closed_by            uuid,
  closure              jsonb,
  correlation_id       uuid NOT NULL,
  CONSTRAINT tes_req_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT tes_req_via CHECK ((via = 'scheduler') = (scheduler IS NOT NULL)),
  CONSTRAINT tes_req_closed CHECK ((state = 'open') = (closed_at IS NULL))
);
CREATE UNIQUE INDEX tes_req_one_open ON twin.observation_requests (twin_id, input_ref) WHERE state = 'open';

/* THE LEDGER — every act of the estimation lifecycle, its own table (the pinned twin_events lists are not touched): an estimator declared,
   superseded or retired; an estimate proposed, routed, superseded, approved (with the snapshot it opened) or declined; a trigger queued
   (telemetry: a new evidence version of an input's source; internal_change: an upstream twin's admitted version; ontology_revision: the
   domain's ontology activated anew) and consumed (by a proposal for the twin × key); an observation requested, fulfilled or cancelled. */
CREATE TABLE twin.estimation_events (
  event_id             uuid PRIMARY KEY,
  scope                text NOT NULL,
  tenant_id            uuid NOT NULL,
  domain_id            uuid NOT NULL,
  twin_id              uuid NOT NULL,
  key                  text,
  estimator_id         uuid,
  estimate_id          uuid,
  request_id           uuid,
  event                text NOT NULL CHECK (event IN ('estimator.declared', 'estimator.superseded', 'estimator.retired',
                                                      'estimate.proposed', 'estimate.routed', 'estimate.superseded', 'estimate.approved', 'estimate.declined',
                                                      'trigger.telemetry', 'trigger.internal_change', 'trigger.ontology_revision', 'trigger.consumed',
                                                      'observation.requested', 'observation.fulfilled', 'observation.cancelled')),
  actor_principal_id   uuid,
  details              jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id       uuid NOT NULL,
  CONSTRAINT tes_evt_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX tes_evt_twin ON twin.estimation_events (twin_id, key, event, occurred_at);
CREATE INDEX tes_evt_estimator ON twin.estimation_events (estimator_id, event, occurred_at);
CREATE TRIGGER tes_evt_append_only BEFORE UPDATE OR DELETE ON twin.estimation_events FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

/* Forward-only rows: an estimator moves active → superseded | retired once (its ended_* written); an estimate proposed → approved | declined
   | superseded once (the decision columns, the routing written at proposal); a request open → fulfilled | cancelled once. Nothing else of a
   row changes; nothing is deleted. */
CREATE OR REPLACE FUNCTION twin.tes_forward() RETURNS trigger
SECURITY DEFINER SET search_path = twin, pg_catalog, pg_temp AS $$
DECLARE v_free text[];
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION '% rows are append-only: DELETE prohibited', TG_TABLE_NAME USING ERRCODE = '2F002'; END IF;
  IF TG_TABLE_NAME = 'estimators' THEN
    IF OLD.state <> 'active' OR NEW.state = 'active' THEN RAISE EXCEPTION 'estimator % v% is %; an estimator is ended once and never rewritten', OLD.estimator_id, OLD.version, OLD.state USING ERRCODE = '2F002'; END IF;
    v_free := ARRAY['state', 'ended_by', 'ended_at', 'end_reason'];
  ELSIF TG_TABLE_NAME = 'estimates' THEN
    IF OLD.state <> 'proposed' OR NEW.state = 'proposed' THEN RAISE EXCEPTION 'estimate % is %; an estimate is decided once and never rewritten', OLD.estimate_id, OLD.state USING ERRCODE = '2F002'; END IF;
    v_free := ARRAY['state', 'decided_by', 'decided_at', 'decision_note', 'applied_version', 'superseded_by'];
  ELSE
    IF OLD.state <> 'open' OR NEW.state = 'open' THEN RAISE EXCEPTION 'observation request % is %; a request is closed once and never rewritten', OLD.request_id, OLD.state USING ERRCODE = '2F002'; END IF;
    v_free := ARRAY['state', 'closed_at', 'closed_by', 'closure'];
  END IF;
  IF (to_jsonb(NEW) - v_free) <> (to_jsonb(OLD) - v_free) THEN
    RAISE EXCEPTION '% row is closed by its state columns only; nothing else of it changes', TG_TABLE_NAME USING ERRCODE = '2F002';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION twin.tes_forward() FROM PUBLIC;
CREATE TRIGGER tes_estimator_forward BEFORE UPDATE OR DELETE ON twin.estimators FOR EACH ROW EXECUTE FUNCTION twin.tes_forward();
CREATE TRIGGER tes_estimate_forward BEFORE UPDATE OR DELETE ON twin.estimates FOR EACH ROW EXECUTE FUNCTION twin.tes_forward();
CREATE TRIGGER tes_req_forward BEFORE UPDATE OR DELETE ON twin.observation_requests FOR EACH ROW EXECUTE FUNCTION twin.tes_forward();

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['estimators', 'estimates', 'input_qualifications', 'observation_requests', 'estimation_events'] LOOP
    EXECUTE format('ALTER TABLE twin.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE twin.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$CREATE POLICY twin_isolation ON twin.%I USING (tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain()))$f$, t);  -- the 0032:634-639 idiom
    EXECUTE format('REVOKE ALL ON twin.%I FROM PUBLIC', t);
    EXECUTE format('GRANT SELECT ON twin.%I TO eye_app, eye_commit', t);
  END LOOP;
END $$;

-- ============================================================
-- §ES.2 HELPERS
-- ============================================================
/* The ledger row. */
CREATE OR REPLACE FUNCTION twin.tes_event(p_tenant uuid, p_domain uuid, p_twin uuid, p_key text, p_estimator uuid, p_estimate uuid, p_request uuid, p_event text,
                                          p_actor uuid, p_details jsonb, p_correlation uuid) RETURNS uuid
SET search_path = twin, pg_catalog, pg_temp AS $$
DECLARE v uuid := gen_random_uuid();
BEGIN
  INSERT INTO twin.estimation_events (event_id, scope, tenant_id, domain_id, twin_id, key, estimator_id, estimate_id, request_id, event, actor_principal_id, details, correlation_id)
  VALUES (v, 'DOMAIN', p_tenant, p_domain, p_twin, p_key, p_estimator, p_estimate, p_request, p_event, p_actor, coalesce(p_details, '{}'::jsonb), p_correlation);
  RETURN v;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION twin.tes_event(uuid, uuid, uuid, text, uuid, uuid, uuid, text, uuid, jsonb, uuid) FROM PUBLIC;

/* The NOTICE (the 0099 sio_notify idiom): an attention item of the class, owned by a person (open when an active human, else unrouted);
   its cause the estimation_events row. */
CREATE OR REPLACE FUNCTION twin.tes_notify(p_tenant uuid, p_domain uuid, p_class text, p_subject_kind text, p_subject uuid, p_title text, p_reasons jsonb, p_owner uuid,
                                           p_cause_event uuid, p_details jsonb, p_due interval, p_actor uuid, p_correlation uuid) RETURNS uuid
SECURITY DEFINER SET search_path = executive, identity, decision, pg_catalog, pg_temp AS $$
DECLARE v_item uuid := gen_random_uuid(); v_state text; v_due timestamptz := clock_timestamp() + p_due;
BEGIN
  v_state := CASE WHEN p_owner IS NOT NULL AND decision.is_active_human(p_owner, p_tenant) THEN 'open' ELSE 'unrouted' END;
  INSERT INTO executive.attention_items (item_id, scope, tenant_id, domain_id, signal_class, subject_kind, subject_id, cause_event_id, cause_event_type, title, outcome, state, owner_principal_id, route_roles, evaluation, details, due_at, escalations, correlation_id)
  VALUES (v_item, 'DOMAIN', p_tenant, p_domain, p_class, p_subject_kind, p_subject, p_cause_event, 'twin.estimation_events', left(p_title, 512), 'material', v_state, p_owner, '{}',
          jsonb_build_object('outcome', 'material', 'reasons', p_reasons, 'policy_version', NULL, 'dimensions', jsonb_build_object('consequence', 'C2', 'confidence', 1)),
          coalesce(p_details, '{}'::jsonb), v_due, 0, p_correlation);
  PERFORM executive.attention_event(v_item, p_tenant, p_domain, CASE v_state WHEN 'open' THEN 'item.routed' ELSE 'item.unrouted' END, p_actor,
            jsonb_build_object('outcome', 'material', 'reasons', p_reasons, 'policy_version', NULL, 'owner', p_owner, 'route_roles', '[]'::jsonb, 'due_at', v_due,
                               'cause_event_id', p_cause_event, 'cause_event_type', 'twin.estimation_events', 'unrouted', v_state = 'unrouted'), p_correlation);
  RETURN v_item;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION twin.tes_notify(uuid, uuid, text, text, uuid, text, jsonb, uuid, uuid, jsonb, interval, uuid, uuid) FROM PUBLIC;

/* The acting principal is the context's (every port). */
CREATE OR REPLACE FUNCTION twin.tes_assert_actor(p_noun text, p_actor uuid) RETURNS void
SET search_path = twin, public, pg_catalog, pg_temp AS $$
BEGIN
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION '% rejected (actor): recorded by the acting principal', p_noun USING ERRCODE = '42501'; END IF;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION twin.tes_assert_actor(text, uuid) FROM PUBLIC;

/* Whether the acting principal is an agent; when it is, it must be the domain's active Reconciliation Agent inside its own running
   reconcile_scan (the Supply Chain Agent's rule, 0092 §B.3) — a person names no agent and no run. Answers the proposer kind. */
CREATE OR REPLACE FUNCTION twin.tes_proposer_kind(p_noun text, p_tenant uuid, p_domain uuid, p_actor uuid, p_agent uuid, p_run uuid) RETURNS text
SECURITY DEFINER SET search_path = twin, executive, identity, pg_catalog, pg_temp AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM identity.principals p WHERE p.id = p_actor AND p.kind = 'agent') THEN
    IF NOT EXISTS (SELECT 1 FROM executive.agents a WHERE a.agent_id = p_agent AND a.principal_id = p_actor AND a.tenant_id = p_tenant AND a.domain_id = p_domain
                     AND a.agent_kind = 'reconciliation' AND a.status = 'active') THEN
      RAISE EXCEPTION '% rejected (actor): an agent acts here only as the domain''s active Reconciliation Agent, under its own session', p_noun USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM executive.agent_runs r WHERE r.run_id = p_run AND r.agent_id = p_agent AND r.task = 'reconcile_scan' AND r.outcome = 'running') THEN
      RAISE EXCEPTION '% rejected (actor): run % is not this agent''s running reconcile scan', p_noun, p_run USING ERRCODE = '42501';
    END IF;
    RETURN 'agent';
  END IF;
  IF p_agent IS NOT NULL OR p_run IS NOT NULL THEN RAISE EXCEPTION '% rejected (actor): a person names no agent and no agent run', p_noun USING ERRCODE = '42501'; END IF;
  RETURN 'human';
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION twin.tes_proposer_kind(text, uuid, uuid, uuid, uuid, uuid) FROM PUBLIC;

/* The twin's head on `actual`: the latest admitted version (NULL when none). */
CREATE OR REPLACE FUNCTION twin.tes_head(p_twin uuid) RETURNS twin.twin_versions
LANGUAGE sql STABLE SET search_path = twin, pg_catalog, pg_temp AS $$
  SELECT v.* FROM twin.twin_versions v WHERE v.twin_id = p_twin AND v.branch_id = 'actual' AND v.state = 'admitted' ORDER BY v.version DESC LIMIT 1
$$;
REVOKE ALL ON FUNCTION twin.tes_head(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION twin.tes_head(uuid) TO eye_app, eye_commit;

/*
 * INPUT QUALIFICATION (an INVOKER read — the tables' row security decides what it sees; the propose port calls the same function, so the
 * verdict the page shows and the verdict the port records are one rule). Per input of one estimator version, against the REFERENCE DATE (the
 * head's world cut-off, else the database's day):
 *   series   the series registered in the domain; its source (the contract carrying the series' source key); the SOURCE HEALTH now
 *            (observation.source_health_now: healthy — degraded only when the input accepts it; failed, suspended, unknown disqualify);
 *            the UNIT (the registered unit = the declared one — never converted); the TRUTH STATE (every cited evidence version is an
 *            EVD of that source, readable, its truth state among the input's allowed ones, default observed); the CADENCE (the latest
 *            point no older than cadence_days × tolerance before the reference date; no unreadable evidence; at least one point).
 *            The facts the database cannot know (the parsed points' latest date and count, the evidence versions read, the unreadable
 *            count) come from the caller's series assembly: { index, points, last_date, evidence: [{id, version}], unreadable }.
 *   element  the head's element of that key: complete health, the declared unit, an observed or estimated kind (or the input's allowed
 *            kinds), and its valid_to (else valid_from) no older than max_age_days before the reference date.
 * Answers [{ index, input, source_id, source_health, cadence, unit_check, truth_state, verdict, reasons }].
 */
CREATE OR REPLACE FUNCTION twin.tes_qualify(p_tenant uuid, p_domain uuid, p_estimator_id uuid, p_version int, p_facts jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = twin, prediction, observation, objects, public, pg_catalog, pg_temp AS $$
DECLARE e twin.estimators%ROWTYPE; h twin.twin_versions%ROWTYPE; v_ref date; i int; inp jsonb; f jsonb; v_out jsonb := '[]'::jsonb;
        v_reasons jsonb; v_series prediction.series_registry%ROWTYPE; v_source uuid; v_health jsonb; v_cadence jsonb; v_unit jsonb; v_truth jsonb;
        v_last date; v_lag int; v_cad numeric; v_tol numeric; v_allowed text[]; v_bad int; v_n int; v_el twin.state_elements%ROWTYPE; v_age_ref date;
BEGIN
  SELECT * INTO e FROM twin.estimators x WHERE x.estimator_id = p_estimator_id AND x.version = p_version AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RETURN NULL; END IF;
  h := twin.tes_head(e.twin_id);
  v_ref := coalesce(h.observed_through, (clock_timestamp() AT TIME ZONE 'UTC')::date);
  FOR i IN 0 .. jsonb_array_length(e.inputs) - 1 LOOP
    inp := e.inputs -> i; v_reasons := '[]'::jsonb; v_source := NULL; f := NULL;
    v_health := jsonb_build_object('state', 'not_applicable'); v_cadence := '{}'::jsonb; v_unit := '{}'::jsonb; v_truth := '{}'::jsonb;
    SELECT x INTO f FROM jsonb_array_elements(coalesce(p_facts, '[]'::jsonb)) x WHERE (x ->> 'index')::int = i LIMIT 1;
    IF inp ->> 'kind' = 'series' THEN
      SELECT * INTO v_series FROM prediction.series_registry s WHERE s.tenant_id = p_tenant AND s.domain_id = p_domain AND s.series_key = inp ->> 'series_key';
      IF NOT FOUND THEN
        v_reasons := v_reasons || to_jsonb(format('series %s is not registered in this domain', inp ->> 'series_key'));
      ELSE
        SELECT c.source_id INTO v_source FROM observation.source_contracts_current c
         WHERE c.tenant_id = p_tenant AND c.domain_id = p_domain AND c.source_key = v_series.source_key
         ORDER BY (c.lifecycle_state = 'active') DESC, c.contract_version DESC LIMIT 1;
        IF v_source IS NULL THEN
          v_reasons := v_reasons || to_jsonb(format('no source contract carries the series'' source key %s', v_series.source_key));
        ELSE
          v_health := observation.source_health_now(p_tenant, p_domain, v_source);
          IF NOT (v_health ->> 'state' = 'healthy' OR (v_health ->> 'state' = 'degraded' AND coalesce((inp ->> 'accept_degraded')::boolean, false))) THEN
            v_reasons := v_reasons || to_jsonb(format('source health is %s (%s)', v_health ->> 'state', coalesce(v_health ->> 'basis', 'none')));
          END IF;
        END IF;
        v_unit := jsonb_build_object('declared', inp ->> 'unit', 'actual', v_series.unit, 'verdict', CASE WHEN v_series.unit = inp ->> 'unit' THEN 'match' ELSE 'mismatch' END);
        IF v_series.unit IS DISTINCT FROM inp ->> 'unit' THEN
          v_reasons := v_reasons || to_jsonb(format('unit mismatch: the series is in %s, the input declares %s (never converted)', v_series.unit, inp ->> 'unit'));
        END IF;
      END IF;
      v_allowed := coalesce(ARRAY(SELECT jsonb_array_elements_text(inp -> 'truth_states')), ARRAY['observed']);
      IF cardinality(v_allowed) = 0 THEN v_allowed := ARRAY['observed']; END IF;
      v_n := coalesce(jsonb_array_length(CASE WHEN jsonb_typeof(f -> 'evidence') = 'array' THEN f -> 'evidence' ELSE '[]'::jsonb END), 0);
      SELECT count(*) INTO v_bad FROM jsonb_array_elements(CASE WHEN jsonb_typeof(f -> 'evidence') = 'array' THEN f -> 'evidence' ELSE '[]'::jsonb END) c
       WHERE NOT EXISTS (SELECT 1 FROM objects.canonical_objects o
                          WHERE o.object_type = 'EVD' AND o.object_id = (c ->> 'id')::uuid AND o.object_version = (c ->> 'version')::int
                            AND o.tenant_id = p_tenant AND o.domain_id = p_domain AND v_source IS NOT NULL AND o.provenance_ref LIKE 'SRC:' || v_source::text || '@%'
                            AND o.lifecycle_state NOT IN ('withdrawn', 'retired') AND o.truth_state = ANY (v_allowed));
      v_truth := jsonb_build_object('allowed', to_jsonb(v_allowed), 'evidence', v_n, 'not_admissible', v_bad, 'verdict', CASE WHEN v_n > 0 AND v_bad = 0 THEN 'admissible' ELSE 'inadmissible' END);
      IF v_n = 0 THEN v_reasons := v_reasons || to_jsonb('no evidence version of the series was read'::text);
      ELSIF v_bad > 0 THEN v_reasons := v_reasons || to_jsonb(format('%s cited evidence version(s) are not readable %s evidence of the series'' source', v_bad, array_to_string(v_allowed, '/'))); END IF;
      v_last := CASE WHEN coalesce(f ->> 'last_date', '') ~ '^\d{4}-\d{2}-\d{2}$' THEN (f ->> 'last_date')::date END;
      v_cad := coalesce((inp ->> 'cadence_days')::numeric, 1); v_tol := coalesce((inp ->> 'cadence_tolerance')::numeric, 2);
      v_lag := CASE WHEN v_last IS NULL THEN NULL ELSE v_ref - v_last END;
      v_cadence := jsonb_build_object('reference_date', v_ref, 'last_point', v_last, 'points', coalesce((f ->> 'points')::int, 0), 'lag_days', v_lag,
                                      'cadence_days', v_cad, 'tolerance', v_tol, 'unreadable', coalesce((f ->> 'unreadable')::int, 0),
                                      'verdict', CASE WHEN v_last IS NULL THEN 'missing' WHEN v_lag > v_cad * v_tol THEN 'stale' ELSE 'on_cadence' END);
      IF v_last IS NULL OR coalesce((f ->> 'points')::int, 0) < 1 THEN v_reasons := v_reasons || to_jsonb('the series has no point under its cut-offs (missing)'::text);
      ELSIF v_lag > v_cad * v_tol THEN v_reasons := v_reasons || to_jsonb(format('stale: the latest point %s is %s day(s) before the reference date %s; the cadence allows %s', v_last, v_lag, v_ref, v_cad * v_tol)); END IF;
      IF coalesce((f ->> 'unreadable')::int, 0) > 0 THEN v_reasons := v_reasons || to_jsonb(format('%s evidence version(s) of the series could not be read', (f ->> 'unreadable')::int)); END IF;
    ELSE
      v_allowed := coalesce(ARRAY(SELECT jsonb_array_elements_text(inp -> 'kinds')), ARRAY['observed', 'estimated']);
      IF cardinality(v_allowed) = 0 THEN v_allowed := ARRAY['observed', 'estimated']; END IF;
      IF h.version IS NULL THEN
        v_reasons := v_reasons || to_jsonb('the twin has no admitted version on actual (missing)'::text);
      ELSE
        SELECT * INTO v_el FROM twin.state_elements x WHERE x.twin_id = e.twin_id AND x.version = h.version AND x.key = inp ->> 'key';
        IF NOT FOUND THEN
          v_reasons := v_reasons || to_jsonb(format('the head (v%s) has no element %s (missing)', h.version, inp ->> 'key'));
        ELSE
          IF v_el.health <> 'complete' THEN v_reasons := v_reasons || to_jsonb(format('element %s is %s', v_el.key, v_el.health)); END IF;
          v_unit := jsonb_build_object('declared', inp ->> 'unit', 'actual', v_el.unit, 'verdict', CASE WHEN inp ->> 'unit' IS NULL OR v_el.unit = inp ->> 'unit' THEN 'match' ELSE 'mismatch' END);
          IF inp ->> 'unit' IS NOT NULL AND v_el.unit IS DISTINCT FROM inp ->> 'unit' THEN v_reasons := v_reasons || to_jsonb(format('unit mismatch: element %s is in %s, the input declares %s', v_el.key, v_el.unit, inp ->> 'unit')); END IF;
          v_truth := jsonb_build_object('allowed', to_jsonb(v_allowed), 'kind', v_el.kind, 'basis_truth_state', v_el.basis_truth_state, 'verdict', CASE WHEN v_el.kind = ANY (v_allowed) THEN 'admissible' ELSE 'inadmissible' END);
          IF NOT (v_el.kind = ANY (v_allowed)) THEN v_reasons := v_reasons || to_jsonb(format('element %s is %s, not %s', v_el.key, v_el.kind, array_to_string(v_allowed, ' or '))); END IF;
          v_age_ref := coalesce(v_el.valid_to, v_el.valid_from);
          v_lag := CASE WHEN v_age_ref IS NULL THEN NULL ELSE v_ref - v_age_ref END;
          v_cad := coalesce((inp ->> 'max_age_days')::numeric, 30);
          v_cadence := jsonb_build_object('reference_date', v_ref, 'valid_through', v_age_ref, 'lag_days', v_lag, 'max_age_days', v_cad,
                                          'verdict', CASE WHEN v_lag IS NOT NULL AND v_lag > v_cad THEN 'stale' ELSE 'on_cadence' END);
          IF v_lag IS NOT NULL AND v_lag > v_cad THEN v_reasons := v_reasons || to_jsonb(format('stale: element %s holds through %s, %s day(s) before %s; at most %s allowed', v_el.key, v_age_ref, v_lag, v_ref, v_cad)); END IF;
        END IF;
      END IF;
    END IF;
    v_out := v_out || jsonb_build_array(jsonb_build_object('index', i, 'input', inp, 'source_id', v_source, 'source_health', v_health, 'cadence', v_cadence, 'unit_check', v_unit,
                                                           'truth_state', v_truth, 'verdict', CASE WHEN jsonb_array_length(v_reasons) = 0 THEN 'qualified' ELSE 'disqualified' END, 'reasons', v_reasons));
  END LOOP;
  RETURN v_out;
END $$;
REVOKE ALL ON FUNCTION twin.tes_qualify(uuid, uuid, uuid, int, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION twin.tes_qualify(uuid, uuid, uuid, int, jsonb) TO eye_app, eye_commit;

-- ============================================================
-- §ES.3 THE PORTS
-- ============================================================
/*
 * DECLARE an estimator (twin.estimator.declare): the twin's OWNER declares — or re-declares, as version n+1 superseding the active one of
 * the same name — a method over inputs for one key of the twin. The declaration is validated here (the method's parameters, the inputs,
 * the bounds, the thresholds) and digested; one PRIMARY per twin × key (a second primary is refused while the first is active: declare it a
 * challenger, or retire the primary). Nothing of the twin is written.
 */
CREATE OR REPLACE FUNCTION twin.declare_estimator(
  p_estimator_id uuid, p_tenant uuid, p_domain uuid, p_twin uuid, p_key text, p_name text, p_role text, p_method text, p_parameters jsonb, p_inputs jsonb,
  p_unit text, p_bounds jsonb, p_materiality numeric, p_ambiguity numeric, p_constraint_sets text[], p_note text, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = twin, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE t twin.twins_current%ROWTYPE; prior twin.estimators%ROWTYPE; v_id uuid := p_estimator_id; v_version int := 1; v_digest text; inp jsonb; i int;
        v_primary twin.estimators%ROWTYPE; p jsonb := coalesce(p_parameters, '{}'::jsonb); b jsonb := coalesce(p_bounds, '{}'::jsonb); v_event uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['twin.estimator.declare']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM twin.tes_assert_actor('estimator', p_actor);
  SELECT * INTO t FROM twin.twins_current x WHERE x.twin_id = p_twin AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'estimator rejected (unknown_twin): % is not a twin of this domain', p_twin USING ERRCODE = '23503'; END IF;
  IF t.owner_principal_id IS DISTINCT FROM p_actor THEN
    RAISE EXCEPTION 'estimator rejected (ownership): an estimator of twin % is declared by the twin''s owner', p_twin USING ERRCODE = '42501';
  END IF;
  IF p_key IS NULL OR p_key !~ '^[a-z][a-z0-9_.-]*(:[A-Za-z0-9_.-]+)?$' THEN RAISE EXCEPTION 'estimator rejected (key): the key names a twin element (like corridor.capacity_share)' USING ERRCODE = '22023'; END IF;
  IF p_name IS NULL OR p_name !~ '^[a-z][a-z0-9-]{1,60}$' THEN RAISE EXCEPTION 'estimator rejected (name): the name is 2–61 lower-case letters, digits and dashes' USING ERRCODE = '22023'; END IF;
  IF p_role IS NULL OR p_role NOT IN ('primary', 'challenger') THEN RAISE EXCEPTION 'estimator rejected (role): an estimator is the primary or a challenger' USING ERRCODE = '22023'; END IF;
  IF p_method IS NULL OR p_method NOT IN ('last_observation', 'moving_average', 'ratio_to_baseline', 'kalman_1d') THEN
    RAISE EXCEPTION 'estimator rejected (method): the method is last_observation, moving_average, ratio_to_baseline or kalman_1d' USING ERRCODE = '22023';
  END IF;
  -- the method's parameters (the TypeScript methods read exactly these): window (points), baseline (> 0, in the input's unit), scale (> 0), the Kalman variances
  IF jsonb_typeof(p) <> 'object' THEN RAISE EXCEPTION 'estimator rejected (parameters): parameters is an object' USING ERRCODE = '22023'; END IF;
  IF p ? 'window' AND (jsonb_typeof(p -> 'window') <> 'number' OR (p ->> 'window')::numeric <> floor((p ->> 'window')::numeric) OR (p ->> 'window')::int NOT BETWEEN 1 AND 365) THEN
    RAISE EXCEPTION 'estimator rejected (parameters): window is a whole number of points in [1, 365]' USING ERRCODE = '22023';
  END IF;
  IF p_method = 'moving_average' AND NOT (p ? 'window' AND (p ->> 'window')::int >= 2) THEN RAISE EXCEPTION 'estimator rejected (parameters): a moving average names its window (at least 2 points)' USING ERRCODE = '22023'; END IF;
  IF p ? 'baseline' AND (jsonb_typeof(p -> 'baseline') <> 'number' OR (p ->> 'baseline')::numeric <= 0) THEN RAISE EXCEPTION 'estimator rejected (parameters): baseline is a positive number in the input''s unit' USING ERRCODE = '22023'; END IF;
  IF p_method = 'ratio_to_baseline' AND NOT p ? 'baseline' THEN RAISE EXCEPTION 'estimator rejected (parameters): a ratio to baseline names its baseline' USING ERRCODE = '22023'; END IF;
  IF p ? 'scale' AND (jsonb_typeof(p -> 'scale') <> 'number' OR (p ->> 'scale')::numeric <= 0) THEN RAISE EXCEPTION 'estimator rejected (parameters): scale is a positive number (100 states a ratio in per cent)' USING ERRCODE = '22023'; END IF;
  IF p_method = 'kalman_1d' AND NOT (jsonb_typeof(p -> 'process_variance') = 'number' AND (p ->> 'process_variance')::numeric > 0
                                     AND jsonb_typeof(p -> 'measurement_variance') = 'number' AND (p ->> 'measurement_variance')::numeric > 0) THEN
    RAISE EXCEPTION 'estimator rejected (parameters): a Kalman filter names its process_variance and measurement_variance (both > 0)' USING ERRCODE = '22023';
  END IF;
  IF p ? 'balance_stock' AND (jsonb_typeof(p -> 'balance_stock') <> 'string' OR (p ->> 'balance_stock') !~ '^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,120}$') THEN
    RAISE EXCEPTION 'estimator rejected (parameters): balance_stock names the stock the estimate''s balance is checked under' USING ERRCODE = '22023';
  END IF;
  IF p_inputs IS NULL OR jsonb_typeof(p_inputs) <> 'array' OR jsonb_array_length(p_inputs) NOT BETWEEN 1 AND 5 THEN
    RAISE EXCEPTION 'estimator rejected (inputs): inputs lists 1 to 5 series or elements (the first is the measured one)' USING ERRCODE = '22023';
  END IF;
  FOR i IN 0 .. jsonb_array_length(p_inputs) - 1 LOOP
    inp := p_inputs -> i;
    IF jsonb_typeof(inp) <> 'object' OR coalesce(inp ->> 'kind', '') NOT IN ('series', 'element') THEN RAISE EXCEPTION 'estimator rejected (inputs): input % is a series or an element', i USING ERRCODE = '22023'; END IF;
    IF inp ->> 'kind' = 'series' AND (coalesce(inp ->> 'series_key', '') = '' OR length(inp ->> 'series_key') > 200 OR coalesce(length(btrim(inp ->> 'unit')), 0) = 0
                                      OR jsonb_typeof(inp -> 'cadence_days') IS DISTINCT FROM 'number' OR (inp ->> 'cadence_days')::numeric <= 0) THEN
      RAISE EXCEPTION 'estimator rejected (inputs): series input % names its series_key, its unit and its cadence_days (> 0)', i USING ERRCODE = '22023';
    END IF;
    IF inp ->> 'kind' = 'element' AND coalesce(inp ->> 'key', '') !~ '^[a-z][a-z0-9_.-]*(:[A-Za-z0-9_.-]+)?$' THEN
      RAISE EXCEPTION 'estimator rejected (inputs): element input % names the key of the twin''s element', i USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF p_inputs -> 0 ->> 'kind' <> 'series' AND p_method <> 'last_observation' THEN
    RAISE EXCEPTION 'estimator rejected (inputs): the first input of a % estimator is a series (its points are what the method reads)', p_method USING ERRCODE = '22023';
  END IF;
  IF p_unit IS NULL OR length(btrim(p_unit)) NOT BETWEEN 1 AND 40 THEN RAISE EXCEPTION 'estimator rejected (unit): the estimated element''s unit is stated' USING ERRCODE = '22023'; END IF;
  IF jsonb_typeof(b) <> 'object' OR (b ? 'min' AND jsonb_typeof(b -> 'min') <> 'number') OR (b ? 'max' AND jsonb_typeof(b -> 'max') <> 'number')
     OR (b ? 'min' AND b ? 'max' AND (b ->> 'min')::numeric > (b ->> 'max')::numeric) THEN
    RAISE EXCEPTION 'estimator rejected (bounds): bounds is { min?, max? } with min ≤ max' USING ERRCODE = '22023';
  END IF;
  IF p_materiality IS NULL OR p_materiality <= 0 OR p_materiality > 10 OR p_ambiguity IS NULL OR p_ambiguity <= 0 OR p_ambiguity > 10 THEN
    RAISE EXCEPTION 'estimator rejected (thresholds): materiality and ambiguity are relative thresholds in (0, 10]' USING ERRCODE = '22023';
  END IF;
  IF coalesce(length(btrim(p_note)), 0) NOT BETWEEN 8 AND 2000 THEN RAISE EXCEPTION 'estimator rejected (note): the declaration says why (8–2000 characters)' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM unnest(coalesce(p_constraint_sets, '{}')) k WHERE k !~ '^[a-z][a-z0-9-]{2,60}$') THEN
    RAISE EXCEPTION 'estimator rejected (constraint_sets): constraint_sets lists set keys' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO prior FROM twin.estimators x WHERE x.twin_id = p_twin AND x.key = p_key AND x.name = p_name AND x.state = 'active' FOR UPDATE;
  IF FOUND THEN v_id := prior.estimator_id; v_version := prior.version + 1; END IF;
  IF p_role = 'primary' THEN
    SELECT * INTO v_primary FROM twin.estimators x WHERE x.twin_id = p_twin AND x.key = p_key AND x.role = 'primary' AND x.state = 'active' AND x.name <> p_name;
    IF FOUND THEN
      RAISE EXCEPTION 'estimator rejected (duplicate): % is the primary estimator of % on this twin; declare this one a challenger, or retire it first', v_primary.name, p_key USING ERRCODE = '23505';
    END IF;
  END IF;
  v_digest := encode(sha256(convert_to(jsonb_build_object('twin', p_twin, 'key', p_key, 'name', p_name, 'role', p_role, 'method', p_method, 'parameters', p,
                                                          'inputs', p_inputs, 'unit', p_unit, 'bounds', b, 'materiality', p_materiality, 'ambiguity', p_ambiguity,
                                                          'constraint_sets', to_jsonb(coalesce(p_constraint_sets, '{}')))::text, 'UTF8')), 'hex');
  IF prior.estimator_id IS NOT NULL THEN
    IF prior.digest = v_digest THEN
      RAISE EXCEPTION 'estimator rejected (duplicate): % v% already declares exactly this', p_name, prior.version USING ERRCODE = '23505';
    END IF;
    UPDATE twin.estimators SET state = 'superseded', ended_by = p_actor, ended_at = clock_timestamp(), end_reason = format('superseded by version %s', v_version)
     WHERE estimator_id = prior.estimator_id AND version = prior.version;
    PERFORM twin.tes_event(p_tenant, p_domain, p_twin, p_key, prior.estimator_id, NULL, NULL, 'estimator.superseded', p_actor, jsonb_build_object('version', prior.version, 'by_version', v_version), p_correlation);
  END IF;
  INSERT INTO twin.estimators (estimator_id, version, scope, tenant_id, domain_id, twin_id, key, name, role, method, parameters, inputs, unit, bounds, materiality, ambiguity,
                               constraint_sets, owner_principal_id, digest, note, state, declared_by, correlation_id)
  VALUES (v_id, v_version, 'DOMAIN', p_tenant, p_domain, p_twin, p_key, p_name, p_role, p_method, p, p_inputs, btrim(p_unit), b, p_materiality, p_ambiguity,
          coalesce(p_constraint_sets, '{}'), t.owner_principal_id, v_digest, btrim(p_note), 'active', p_actor, p_correlation);
  v_event := twin.tes_event(p_tenant, p_domain, p_twin, p_key, v_id, NULL, NULL, 'estimator.declared', p_actor,
                            jsonb_build_object('version', v_version, 'name', p_name, 'role', p_role, 'method', p_method, 'digest', v_digest, 'supersedes', prior.version), p_correlation);
  RETURN jsonb_build_object('estimator_id', v_id, 'version', v_version, 'twin_id', p_twin, 'key', p_key, 'name', p_name, 'role', p_role, 'method', p_method, 'digest', v_digest,
                            'supersedes', prior.version, 'event_id', v_event);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION twin.declare_estimator(uuid,uuid,uuid,uuid,text,text,text,text,jsonb,jsonb,text,jsonb,numeric,numeric,text[],text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION twin.declare_estimator(uuid,uuid,uuid,uuid,text,text,text,text,jsonb,jsonb,text,jsonb,numeric,numeric,text[],text,uuid,uuid) TO eye_commit;

/* RETIRE an estimator (twin.estimator.declare): the twin's owner ends its active version with a reason. */
CREATE OR REPLACE FUNCTION twin.retire_estimator(p_estimator_id uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = twin, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE e twin.estimators%ROWTYPE; v_owner uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['twin.estimator.declare']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM twin.tes_assert_actor('estimator', p_actor);
  SELECT * INTO e FROM twin.estimators x WHERE x.estimator_id = p_estimator_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain ORDER BY x.version DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'estimator rejected (unknown_estimator): % is not an estimator of this domain', p_estimator_id USING ERRCODE = '23503'; END IF;
  SELECT owner_principal_id INTO v_owner FROM twin.twins_current WHERE twin_id = e.twin_id;
  IF v_owner IS DISTINCT FROM p_actor THEN RAISE EXCEPTION 'estimator rejected (ownership): an estimator is retired by the twin''s owner' USING ERRCODE = '42501'; END IF;
  IF e.state <> 'active' THEN RAISE EXCEPTION 'estimator rejected (state): estimator % v% is %', e.name, e.version, e.state USING ERRCODE = '22023'; END IF;
  IF coalesce(length(btrim(p_reason)), 0) NOT BETWEEN 8 AND 2000 THEN RAISE EXCEPTION 'estimator rejected (reason): a retirement says why (8–2000 characters)' USING ERRCODE = '22023'; END IF;
  UPDATE twin.estimators SET state = 'retired', ended_by = p_actor, ended_at = clock_timestamp(), end_reason = btrim(p_reason) WHERE estimator_id = e.estimator_id AND version = e.version;
  PERFORM twin.tes_event(p_tenant, p_domain, e.twin_id, e.key, e.estimator_id, NULL, NULL, 'estimator.retired', p_actor, jsonb_build_object('version', e.version, 'reason', btrim(p_reason)), p_correlation);
  RETURN jsonb_build_object('estimator_id', e.estimator_id, 'version', e.version, 'state', 'retired');
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION twin.retire_estimator(uuid,uuid,uuid,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION twin.retire_estimator(uuid,uuid,uuid,text,uuid,uuid) TO eye_commit;

/*
 * PROPOSE an estimate (twin.estimate.propose): a person, or the domain's Reconciliation Agent in its running reconcile_scan, states every
 * active estimator's candidate for one twin × key, computed (twin/estimation/estimators.ts) from the inputs' facts; the port:
 *   1. QUALIFIES every input of every estimator (twin.tes_qualify — the source health, the cadence, the unit, the truth state): an estimator
 *      with a disqualified input contributes no candidate (a value offered for it is refused), the primary's must qualify;
 *   2. keeps EVERY candidate (disagreement retained — the excluded with their reason) and states the spread;
 *   3. records the CONSTRAINT CHECK the caller ran BEFORE publishing (the engine's verdict on the estimate's quantities, a run_input subject,
 *      its set versions pinned) and judges the RANGE (the primary's bounds) and the MATERIALITY against the head's value;
 *   4. supersedes the open proposal of the same twin × key; records the qualification rows and the ledger; consumes the pending triggers;
 *   5. ROUTES a material or ambiguous change to the twin's owner (twin.reconciliation, subject twin_estimate).
 * Nothing of the twin is written: the estimate is candidate state; only the owner's approval opens a snapshot.
 */
CREATE OR REPLACE FUNCTION twin.propose_estimate(
  p_estimate_id uuid, p_tenant uuid, p_domain uuid, p_twin uuid, p_key text, p_facts jsonb, p_candidates jsonb, p_constraint jsonb, p_trigger jsonb,
  p_agent uuid, p_run uuid, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = twin, observation, executive, ctx, public, pg_catalog, pg_temp AS $$
DECLARE t twin.twins_current%ROWTYPE; h twin.twin_versions%ROWTYPE; v_kind text; e twin.estimators%ROWTYPE; pe twin.estimators%ROWTYPE; v_q jsonb; q jsonb; c jsonb;
        v_quals jsonb := '[]'::jsonb; v_cands jsonb := '[]'::jsonb; v_disq boolean; v_value numeric; v_primary jsonb; v_head_el twin.state_elements%ROWTYPE; v_head_value numeric;
        v_vals numeric[] := '{}'; v_min numeric; v_max numeric; v_spread jsonb; v_rel numeric; v_range jsonb; v_outcome text; v_mat jsonb; v_material boolean;
        v_amb_reasons jsonb := '[]'::jsonb; v_prior twin.estimates%ROWTYPE; v_evidence jsonb := '[]'::jsonb; v_digest text; v_as_of date; v_conf numeric;
        v_item uuid; v_event uuid; v_through timestamptz; v_consumed jsonb; v_n_q int := 0; v_n_d int := 0; ev jsonb; v_allowed jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['twin.estimate.propose']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM twin.tes_assert_actor('estimate', p_actor);
  v_kind := twin.tes_proposer_kind('estimate', p_tenant, p_domain, p_actor, p_agent, p_run);
  SELECT * INTO t FROM twin.twins_current x WHERE x.twin_id = p_twin AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'estimate rejected (unknown_twin): % is not a twin of this domain', p_twin USING ERRCODE = '23503'; END IF;
  IF NOT EXISTS (SELECT 1 FROM twin.estimators x WHERE x.twin_id = p_twin AND x.key = p_key AND x.state = 'active') THEN
    RAISE EXCEPTION 'estimate rejected (unknown_estimator): no active estimator is declared for % on twin %', p_key, p_twin USING ERRCODE = '23503';
  END IF;
  SELECT * INTO pe FROM twin.estimators x WHERE x.twin_id = p_twin AND x.key = p_key AND x.state = 'active' AND x.role = 'primary';
  IF NOT FOUND THEN RAISE EXCEPTION 'estimate rejected (state): % on twin % has challengers but no primary estimator; the owner declares one', p_key, p_twin USING ERRCODE = '22023'; END IF;
  IF p_candidates IS NULL OR jsonb_typeof(p_candidates) <> 'array' THEN RAISE EXCEPTION 'estimate rejected (candidates): candidates is an array' USING ERRCODE = '22023'; END IF;
  IF p_constraint IS NULL OR jsonb_typeof(p_constraint) <> 'object' OR coalesce(p_constraint ->> 'outcome', '') NOT IN ('satisfied', 'violated', 'indeterminate')
     OR jsonb_typeof(p_constraint -> 'pins') IS DISTINCT FROM 'array' OR jsonb_typeof(p_constraint -> 'violations') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'estimate rejected (constraint): the constraint check before publish is stated — { outcome, pins, violations } from the engine' USING ERRCODE = '22023';
  END IF;
  h := twin.tes_head(p_twin);
  -- 1 + 2: qualification and the candidates, estimator by estimator (the primary first)
  FOR e IN SELECT * FROM twin.estimators x WHERE x.twin_id = p_twin AND x.key = p_key AND x.state = 'active' ORDER BY (x.role = 'primary') DESC, x.name LOOP
    c := NULL;
    v_q := twin.tes_qualify(p_tenant, p_domain, e.estimator_id, e.version, coalesce(p_facts -> e.estimator_id::text, '[]'::jsonb));
    v_disq := EXISTS (SELECT 1 FROM jsonb_array_elements(v_q) z WHERE z ->> 'verdict' = 'disqualified');
    v_quals := v_quals || jsonb_build_array(jsonb_build_object('estimator_id', e.estimator_id, 'version', e.version, 'inputs', v_q));
    SELECT x INTO c FROM jsonb_array_elements(p_candidates) x WHERE x ->> 'estimator_id' = e.estimator_id::text LIMIT 1;
    IF c IS NULL OR coalesce((c ->> 'version')::int, -1) <> e.version THEN
      RAISE EXCEPTION 'estimate rejected (candidates): estimator % v% states no candidate — every active estimator''s candidate is kept (disagreement retained)', e.name, e.version USING ERRCODE = '22023';
    END IF;
    v_value := CASE WHEN jsonb_typeof(c -> 'value') = 'number' THEN (c ->> 'value')::numeric END;
    IF v_disq AND v_value IS NOT NULL THEN
      RAISE EXCEPTION 'estimate rejected (unqualified): estimator % offers a value on a disqualified input — %', e.name,
        (SELECT string_agg(r, '; ') FROM jsonb_array_elements(v_q) z, jsonb_array_elements_text(z -> 'reasons') r) USING ERRCODE = '22023';
    END IF;
    IF e.role = 'primary' AND (v_disq OR v_value IS NULL) THEN
      RAISE EXCEPTION 'estimate rejected (unqualified): the primary estimator % has no qualified candidate — %', e.name,
        coalesce((SELECT string_agg(r, '; ') FROM jsonb_array_elements(v_q) z, jsonb_array_elements_text(z -> 'reasons') r), c ->> 'excluded', 'no value') USING ERRCODE = '22023';
    END IF;
    IF v_value IS NULL AND coalesce(length(btrim(c ->> 'excluded')), 0) = 0 AND NOT v_disq THEN
      RAISE EXCEPTION 'estimate rejected (candidates): estimator % states neither a value nor why it has none', e.name USING ERRCODE = '22023';
    END IF;
    IF v_value IS NOT NULL THEN
      -- a candidate rests only on the evidence the qualified facts read
      v_allowed := (SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM jsonb_array_elements(coalesce(p_facts -> e.estimator_id::text, '[]'::jsonb)) f, jsonb_array_elements(coalesce(f -> 'evidence', '[]'::jsonb)) x);
      FOR ev IN SELECT * FROM jsonb_array_elements(coalesce(c -> 'evidence', '[]'::jsonb)) LOOP
        IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_allowed) a WHERE a ->> 'id' = ev ->> 'id' AND (a ->> 'version')::int = (ev ->> 'version')::int) THEN
          RAISE EXCEPTION 'estimate rejected (candidates): estimator % cites evidence %@% its qualified inputs did not read', e.name, ev ->> 'id', ev ->> 'version' USING ERRCODE = '22023';
        END IF;
      END LOOP;
      v_vals := v_vals || v_value;
    END IF;
    IF v_disq THEN v_n_d := v_n_d + 1; ELSE v_n_q := v_n_q + 1; END IF;
    v_cands := v_cands || jsonb_build_array(jsonb_build_object('estimator_id', e.estimator_id, 'version', e.version, 'name', e.name, 'role', e.role, 'method', e.method,
      'value', CASE WHEN v_disq THEN NULL ELSE c -> 'value' END, 'raw', c -> 'raw', 'confidence', c -> 'confidence', 'window', c -> 'window', 'last_point', c -> 'last_point',
      'evidence', coalesce(c -> 'evidence', '[]'::jsonb), 'qualified', NOT v_disq,
      'excluded', CASE WHEN v_disq THEN (SELECT string_agg(r, '; ') FROM jsonb_array_elements(v_q) z, jsonb_array_elements_text(z -> 'reasons') r) ELSE c ->> 'excluded' END));
    IF e.role = 'primary' THEN
      v_primary := c; v_evidence := coalesce(c -> 'evidence', '[]'::jsonb);
      v_conf := CASE WHEN jsonb_typeof(c -> 'confidence') = 'number' THEN (c ->> 'confidence')::numeric END;
      v_as_of := CASE WHEN coalesce(c -> 'last_point' ->> 'date', '') ~ '^\d{4}-\d{2}-\d{2}$' THEN (c -> 'last_point' ->> 'date')::date END;
    END IF;
  END LOOP;
  IF v_conf IS NULL OR v_conf < 0 OR v_conf > 1 THEN RAISE EXCEPTION 'estimate rejected (candidates): the primary candidate states its confidence in [0, 1] (from its data, never narrative)' USING ERRCODE = '22023'; END IF;
  IF v_as_of IS NULL THEN RAISE EXCEPTION 'estimate rejected (candidates): the primary candidate names its latest point (the estimate''s as-of day)' USING ERRCODE = '22023'; END IF;
  v_value := (v_primary ->> 'value')::numeric;
  -- the spread over every stated candidate (the disagreement, kept)
  SELECT min(x), max(x) INTO v_min, v_max FROM unnest(v_vals) x;
  v_rel := CASE WHEN v_value = 0 THEN NULL ELSE round((v_max - v_min) / abs(v_value), 6) END;
  v_spread := jsonb_build_object('n', cardinality(v_vals), 'min', v_min, 'max', v_max, 'abs', v_max - v_min, 'relative', v_rel, 'ambiguity_threshold', pe.ambiguity);
  -- 3: the range (the primary's declared bounds) and the constraint verdict recorded
  v_range := jsonb_build_object('min', pe.bounds -> 'min', 'max', pe.bounds -> 'max', 'value', v_value,
                                'verdict', CASE WHEN (pe.bounds ? 'min' AND v_value < (pe.bounds ->> 'min')::numeric) OR (pe.bounds ? 'max' AND v_value > (pe.bounds ->> 'max')::numeric) THEN 'outside' ELSE 'inside' END);
  v_outcome := p_constraint ->> 'outcome';
  -- the materiality: the change against the head's value of this key
  IF h.version IS NOT NULL THEN SELECT * INTO v_head_el FROM twin.state_elements x WHERE x.twin_id = p_twin AND x.version = h.version AND x.key = p_key; END IF;
  v_head_value := CASE WHEN jsonb_typeof(v_head_el.value) = 'number' THEN (v_head_el.value #>> '{}')::numeric END;
  v_material := v_head_value IS NULL OR (v_head_value = 0 AND v_value <> 0) OR (v_head_value <> 0 AND abs(v_value - v_head_value) / abs(v_head_value) >= pe.materiality)
                OR v_head_el.unit IS DISTINCT FROM pe.unit;
  v_mat := jsonb_build_object('head_version', h.version, 'head_value', v_head_el.value, 'head_unit', v_head_el.unit, 'delta_abs', CASE WHEN v_head_value IS NULL THEN NULL ELSE abs(v_value - v_head_value) END,
                              'delta_relative', CASE WHEN v_head_value IS NULL OR v_head_value = 0 THEN NULL ELSE round(abs(v_value - v_head_value) / abs(v_head_value), 6) END,
                              'threshold', pe.materiality, 'material', v_material,
                              'basis', CASE WHEN v_head_el.key IS NULL THEN 'the head holds no value of this key' WHEN v_head_value IS NULL THEN 'the head''s value is not a number' ELSE 'relative change against the head' END);
  IF v_rel IS NOT NULL AND v_rel > pe.ambiguity THEN v_amb_reasons := v_amb_reasons || to_jsonb(format('the estimators disagree: spread %s of the proposal, above %s', v_rel, pe.ambiguity)); END IF;
  IF v_range ->> 'verdict' = 'outside' THEN v_amb_reasons := v_amb_reasons || to_jsonb(format('the proposal %s is outside the declared bounds', v_value)); END IF;
  IF v_outcome <> 'satisfied' THEN v_amb_reasons := v_amb_reasons || to_jsonb(format('the constraint check is %s', v_outcome)); END IF;
  IF v_head_el.key IS NOT NULL AND v_head_el.unit IS DISTINCT FROM pe.unit THEN v_amb_reasons := v_amb_reasons || to_jsonb(format('the unit changes from %s to %s', v_head_el.unit, pe.unit)); END IF;
  v_digest := encode(sha256(convert_to(jsonb_build_object('facts', coalesce(p_facts, '{}'::jsonb), 'candidates', v_cands)::text, 'UTF8')), 'hex');
  -- 4: the open proposal of this twin × key is superseded
  SELECT * INTO v_prior FROM twin.estimates x WHERE x.twin_id = p_twin AND x.key = p_key AND x.state = 'proposed' FOR UPDATE;
  IF FOUND THEN
    UPDATE twin.estimates SET state = 'superseded', superseded_by = p_estimate_id WHERE estimate_id = v_prior.estimate_id;
    PERFORM twin.tes_event(p_tenant, p_domain, p_twin, p_key, NULL, v_prior.estimate_id, NULL, 'estimate.superseded', p_actor, jsonb_build_object('superseded_by', p_estimate_id), p_correlation);
  END IF;
  v_event := twin.tes_event(p_tenant, p_domain, p_twin, p_key, pe.estimator_id, p_estimate_id, NULL, 'estimate.proposed', p_actor,
    jsonb_build_object('value', v_value, 'unit', pe.unit, 'confidence', v_conf, 'head_version', h.version, 'material', v_material, 'ambiguous', jsonb_array_length(v_amb_reasons) > 0,
                       'constraint', v_outcome, 'range', v_range ->> 'verdict', 'candidates', jsonb_array_length(v_cands), 'spread', v_spread, 'proposer_kind', v_kind,
                       'agent_id', p_agent, 'run_id', p_run, 'supersedes', v_prior.estimate_id), p_correlation);
  -- 5: a material or ambiguous change is routed to the twin's owner (the item's cause: the proposal's ledger row)
  IF v_material OR jsonb_array_length(v_amb_reasons) > 0 THEN
    v_item := twin.tes_notify(p_tenant, p_domain, 'twin.reconciliation', 'twin_estimate', p_estimate_id,
      format('Estimate for review — %s on %s: %s %s (head %s)', p_key, t.title, v_value, pe.unit, coalesce(v_head_el.value::text, 'none')),
      jsonb_build_array(CASE WHEN v_material THEN 'a material change against the twin''s head' ELSE 'an ambiguous estimate' END) || v_amb_reasons,
      t.owner_principal_id, v_event,
      jsonb_build_object('estimate_id', p_estimate_id, 'twin_id', p_twin, 'key', p_key, 'value', v_value, 'unit', pe.unit, 'head_version', h.version, 'material', v_material,
                         'ambiguous', jsonb_array_length(v_amb_reasons) > 0, 'constraint', v_outcome, 'proposer_kind', v_kind), interval '3 days', p_actor, p_correlation);
    PERFORM twin.tes_event(p_tenant, p_domain, p_twin, p_key, NULL, p_estimate_id, NULL, 'estimate.routed', p_actor,
      jsonb_build_object('attention_item_id', v_item, 'owner', t.owner_principal_id, 'class', 'twin.reconciliation'), p_correlation);
  END IF;
  INSERT INTO twin.estimates (estimate_id, scope, tenant_id, domain_id, twin_id, key, head_version, head_value, head_unit, as_of, proposed_value, unit, confidence, primary_estimator,
                              candidates, spread, qualification, constraint_check, constraint_outcome, range_check, materiality, material, ambiguous, ambiguity_reasons, evidence, inputs_digest,
                              trigger, routed, attention_item_id, state, proposed_by, proposer_kind, agent_id, run_id, correlation_id)
  VALUES (p_estimate_id, 'DOMAIN', p_tenant, p_domain, p_twin, p_key, h.version, v_head_el.value, v_head_el.unit, v_as_of, v_value, pe.unit, v_conf,
          jsonb_build_object('estimator_id', pe.estimator_id, 'version', pe.version, 'name', pe.name, 'method', pe.method),
          v_cands, v_spread, jsonb_build_object('qualified_estimators', v_n_q, 'disqualified_estimators', v_n_d), p_constraint, v_outcome, v_range, v_mat, v_material,
          jsonb_array_length(v_amb_reasons) > 0, v_amb_reasons, v_evidence, v_digest, coalesce(p_trigger, '{}'::jsonb), v_item IS NOT NULL, v_item, 'proposed', p_actor, v_kind, p_agent, p_run, p_correlation);
  FOR q IN SELECT * FROM jsonb_array_elements(v_quals) LOOP
    INSERT INTO twin.input_qualifications (qualification_id, scope, tenant_id, domain_id, estimate_id, estimator_id, estimator_version, input_index, input, source_id, source_health,
                                           cadence, unit_check, truth_state, verdict, reasons, correlation_id)
    SELECT gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_estimate_id, (q ->> 'estimator_id')::uuid, (q ->> 'version')::int, (z ->> 'index')::int, z -> 'input',
           (z ->> 'source_id')::uuid, z -> 'source_health', z -> 'cadence', z -> 'unit_check', z -> 'truth_state', z ->> 'verdict', z -> 'reasons', p_correlation
      FROM jsonb_array_elements(q -> 'inputs') z;
  END LOOP;
  -- the pending triggers of this twin × key are answered by this proposal
  SELECT max(x.occurred_at) INTO v_through FROM twin.estimation_events x
   WHERE x.twin_id = p_twin AND x.key = p_key AND x.event IN ('trigger.telemetry', 'trigger.internal_change', 'trigger.ontology_revision')
     AND x.occurred_at > coalesce((SELECT max((y.details ->> 'through')::timestamptz) FROM twin.estimation_events y WHERE y.twin_id = p_twin AND y.key = p_key AND y.event = 'trigger.consumed'), '-infinity'::timestamptz);
  IF v_through IS NOT NULL THEN
    SELECT coalesce(jsonb_agg(x.event_id ORDER BY x.occurred_at), '[]'::jsonb) INTO v_consumed FROM twin.estimation_events x
     WHERE x.twin_id = p_twin AND x.key = p_key AND x.event IN ('trigger.telemetry', 'trigger.internal_change', 'trigger.ontology_revision') AND x.occurred_at <= v_through
       AND x.occurred_at > coalesce((SELECT max((y.details ->> 'through')::timestamptz) FROM twin.estimation_events y WHERE y.twin_id = p_twin AND y.key = p_key AND y.event = 'trigger.consumed'), '-infinity'::timestamptz);
    PERFORM twin.tes_event(p_tenant, p_domain, p_twin, p_key, NULL, p_estimate_id, NULL, 'trigger.consumed', p_actor, jsonb_build_object('through', v_through, 'triggers', v_consumed), p_correlation);
  END IF;
  RETURN jsonb_build_object('estimate_id', p_estimate_id, 'twin_id', p_twin, 'key', p_key, 'state', 'proposed', 'value', v_value, 'unit', pe.unit, 'confidence', v_conf, 'as_of', v_as_of,
                            'head_version', h.version, 'candidates', v_cands, 'spread', v_spread, 'qualification', v_quals, 'constraint', v_outcome, 'range', v_range,
                            'materiality', v_mat, 'material', v_material, 'ambiguous', jsonb_array_length(v_amb_reasons) > 0, 'ambiguity_reasons', v_amb_reasons,
                            'routed', v_item IS NOT NULL, 'attention_item_id', v_item, 'owner', t.owner_principal_id, 'supersedes', v_prior.estimate_id, 'proposer_kind', v_kind);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION twin.propose_estimate(uuid,uuid,uuid,uuid,text,jsonb,jsonb,jsonb,jsonb,uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION twin.propose_estimate(uuid,uuid,uuid,uuid,text,jsonb,jsonb,jsonb,jsonb,uuid,uuid,uuid,uuid) TO eye_commit;

/*
 * DECIDE an estimate (twin.estimate.decide): the twin's OWNER — never the proposer, never an agent — approves or declines an open estimate.
 * A DECLINE states its reason. An APPROVAL publishes the candidate as a NEW SNAPSHOT: the route, in ONE transaction under this bound action,
 * opens a draft on `actual` carrying from the head (the key excepted), grounds the estimate as an ESTIMATED element citing the evidence its
 * qualified inputs read, and admits it — through the existing version, ground and admit ports (each serves twin.estimate.decide beside its
 * own action, §ES.4) — and then calls this port with the admitted version, which verifies it: the version is admitted on `actual`, opened by
 * the approver in this transaction, it supersedes exactly the head the estimate was computed against (else STALE), and it carries the key
 * as an estimated element of the proposed value and unit. Publication is refused unless the constraint check before publish was SATISFIED
 * and the value inside the declared bounds; an ambiguous estimate is approved only with the owner's note.
 */
CREATE OR REPLACE FUNCTION twin.decide_estimate(
  p_estimate_id uuid, p_tenant uuid, p_domain uuid, p_decision text, p_note text, p_new_version int, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = twin, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE x twin.estimates%ROWTYPE; v_owner uuid; nv twin.twin_versions%ROWTYPE; el twin.state_elements%ROWTYPE; v_note text := nullif(btrim(coalesce(p_note, '')), '');
BEGIN
  PERFORM observation.assert_authority(ARRAY['twin.estimate.decide']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM twin.tes_assert_actor('estimate', p_actor);
  SELECT * INTO x FROM twin.estimates e WHERE e.estimate_id = p_estimate_id AND e.tenant_id = p_tenant AND e.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'estimate rejected (unknown_estimate): % is not an estimate of this domain', p_estimate_id USING ERRCODE = '23503'; END IF;
  SELECT owner_principal_id INTO v_owner FROM twin.twins_current WHERE twin_id = x.twin_id;
  IF v_owner IS DISTINCT FROM p_actor THEN
    RAISE EXCEPTION 'estimate rejected (ownership): an estimate of twin % is decided by the twin''s owner', x.twin_id USING ERRCODE = '42501';
  END IF;
  IF x.proposed_by = p_actor THEN
    RAISE EXCEPTION 'estimate rejected (separation_of_duties): the proposer of estimate % does not decide it', p_estimate_id USING ERRCODE = '42501';
  END IF;
  IF x.state <> 'proposed' THEN RAISE EXCEPTION 'estimate rejected (state): estimate % is %, not proposed', p_estimate_id, x.state USING ERRCODE = '22023'; END IF;
  IF p_decision IS NULL OR p_decision NOT IN ('approved', 'declined') THEN RAISE EXCEPTION 'estimate rejected (decision): a decision is approved or declined' USING ERRCODE = '22023'; END IF;
  IF p_decision = 'declined' THEN
    IF coalesce(length(v_note), 0) < 8 THEN RAISE EXCEPTION 'estimate rejected (note): a declined estimate states its reason (at least 8 characters)' USING ERRCODE = '22023'; END IF;
    IF p_new_version IS NOT NULL THEN RAISE EXCEPTION 'estimate rejected (decision): a declined estimate opens no snapshot' USING ERRCODE = '22023'; END IF;
    UPDATE twin.estimates SET state = 'declined', decided_by = p_actor, decided_at = clock_timestamp(), decision_note = v_note WHERE estimate_id = p_estimate_id;
    PERFORM twin.tes_event(p_tenant, p_domain, x.twin_id, x.key, NULL, p_estimate_id, NULL, 'estimate.declined', p_actor, jsonb_build_object('note', v_note), p_correlation);
    RETURN jsonb_build_object('estimate_id', p_estimate_id, 'state', 'declined', 'twin_id', x.twin_id, 'key', x.key, 'note', v_note);
  END IF;
  -- APPROVAL: the validation before publish
  IF x.constraint_outcome <> 'satisfied' THEN
    RAISE EXCEPTION 'estimate rejected (constraint): the constraint check before publish is % (%); an estimate is published only on a satisfied check — propose again once it is',
      x.constraint_outcome, coalesce((SELECT string_agg(v ->> 'message', '; ') FROM jsonb_array_elements(x.constraint_check -> 'violations') v), x.constraint_check ->> 'reason', 'no applicable constraint') USING ERRCODE = '22023';
  END IF;
  IF x.range_check ->> 'verdict' = 'outside' THEN
    RAISE EXCEPTION 'estimate rejected (range): % % is outside the declared bounds [%, %]', x.proposed_value, x.unit, coalesce(x.range_check ->> 'min', '−∞'), coalesce(x.range_check ->> 'max', '∞') USING ERRCODE = '22023';
  END IF;
  IF x.ambiguous AND coalesce(length(v_note), 0) < 8 THEN
    RAISE EXCEPTION 'estimate rejected (note): an ambiguous estimate (%) is approved with the owner''s note (at least 8 characters)',
      (SELECT string_agg(r, '; ') FROM jsonb_array_elements_text(x.ambiguity_reasons) r) USING ERRCODE = '22023';
  END IF;
  IF p_new_version IS NULL THEN RAISE EXCEPTION 'estimate rejected (decision): an approval names the snapshot it opened' USING ERRCODE = '22023'; END IF;
  SELECT * INTO nv FROM twin.twin_versions v WHERE v.twin_id = x.twin_id AND v.version = p_new_version;
  IF NOT FOUND OR nv.state <> 'admitted' OR nv.branch_id <> 'actual' THEN
    RAISE EXCEPTION 'estimate rejected (snapshot): version % of twin % is not an admitted version on actual', p_new_version, x.twin_id USING ERRCODE = '22023';
  END IF;
  IF nv.opened_by IS DISTINCT FROM p_actor OR NOT EXISTS (SELECT 1 FROM twin.twin_events te WHERE te.twin_id = x.twin_id AND te.event = 'version.admitted'
                                                           AND (te.details ->> 'version')::int = p_new_version AND te.correlation_id = p_correlation AND te.actor_principal_id = p_actor) THEN
    RAISE EXCEPTION 'estimate rejected (snapshot): version % was not opened and admitted by the approver in this approval', p_new_version USING ERRCODE = '22023';
  END IF;
  IF nv.supersedes IS DISTINCT FROM x.head_version THEN
    RAISE EXCEPTION 'estimate rejected (stale): estimate % was computed against v% of the twin; the head moved to v% — propose again on the current head', p_estimate_id,
      coalesce(x.head_version::text, 'none'), coalesce(nv.supersedes::text, 'none') USING ERRCODE = '22023';
  END IF;
  SELECT * INTO el FROM twin.state_elements s WHERE s.twin_id = x.twin_id AND s.version = p_new_version AND s.key = x.key;
  IF NOT FOUND OR el.kind <> 'estimated' OR jsonb_typeof(el.value) <> 'number' OR (el.value #>> '{}')::numeric <> x.proposed_value OR el.unit IS DISTINCT FROM x.unit THEN
    RAISE EXCEPTION 'estimate rejected (snapshot): version % does not carry % as the estimated value % %', p_new_version, x.key, x.proposed_value, x.unit USING ERRCODE = '22023';
  END IF;
  UPDATE twin.estimates SET state = 'approved', decided_by = p_actor, decided_at = clock_timestamp(), decision_note = v_note, applied_version = p_new_version WHERE estimate_id = p_estimate_id;
  PERFORM twin.tes_event(p_tenant, p_domain, x.twin_id, x.key, NULL, p_estimate_id, NULL, 'estimate.approved', p_actor,
    jsonb_build_object('applied_version', p_new_version, 'supersedes', nv.supersedes, 'element_id', el.element_id, 'value', x.proposed_value, 'unit', x.unit, 'note', v_note,
                       'state_set_digest', nv.state_set_digest, 'material', x.material, 'ambiguous', x.ambiguous), p_correlation);
  RETURN jsonb_build_object('estimate_id', p_estimate_id, 'state', 'approved', 'twin_id', x.twin_id, 'key', x.key, 'value', x.proposed_value, 'unit', x.unit,
                            'applied_version', p_new_version, 'supersedes', nv.supersedes, 'element_id', el.element_id, 'note', v_note);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION twin.decide_estimate(uuid,uuid,uuid,text,text,int,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION twin.decide_estimate(uuid,uuid,uuid,text,text,int,uuid,uuid) TO eye_commit;

/*
 * REQUEST NEW OBSERVATIONS (twin.observation.request; V02-T-013): a person, or the Reconciliation Agent in its running scan, asks for new
 * observations of a MISSING or STALE input of a twin (a series of the domain, or an element of the twin). Where the series' source is
 * SCHEDULED (observation.scheduler_entries, status scheduled) the request rides the collection scheduler: the entry is recorded with the
 * request (its scheduler id, queue, cadence) and the next collection answers it — no new schedule is written (that is the collection
 * manager's observation.schedule.set). Otherwise an attention item (twin.observation_request) goes to the source's steward (the contract's
 * approver, an active human), else to the twin's owner. One open request per twin × input: asking again answers the standing request.
 */
CREATE OR REPLACE FUNCTION twin.request_observations(
  p_request_id uuid, p_tenant uuid, p_domain uuid, p_twin uuid, p_key text, p_estimator uuid, p_input jsonb, p_reason_class text, p_note text,
  p_agent uuid, p_run uuid, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = twin, observation, prediction, executive, decision, ctx, public, pg_catalog, pg_temp AS $$
DECLARE t twin.twins_current%ROWTYPE; v_kind text; v_ref text; v_source uuid; v_series prediction.series_registry%ROWTYPE; s observation.scheduler_entries%ROWTYPE;
        v_via text; v_sched jsonb; v_route uuid; v_item uuid; v_event uuid; prior twin.observation_requests%ROWTYPE; v_steward uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['twin.observation.request']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM twin.tes_assert_actor('observation request', p_actor);
  v_kind := twin.tes_proposer_kind('observation request', p_tenant, p_domain, p_actor, p_agent, p_run);
  SELECT * INTO t FROM twin.twins_current x WHERE x.twin_id = p_twin AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'observation request rejected (unknown_twin): % is not a twin of this domain', p_twin USING ERRCODE = '23503'; END IF;
  IF p_input IS NULL OR jsonb_typeof(p_input) <> 'object' OR coalesce(p_input ->> 'kind', '') NOT IN ('series', 'element') THEN
    RAISE EXCEPTION 'observation request rejected (input): the input is { kind: series, series_key } or { kind: element, key }' USING ERRCODE = '22023';
  END IF;
  IF p_reason_class IS NULL OR p_reason_class NOT IN ('missing', 'stale', 'disqualified') THEN
    RAISE EXCEPTION 'observation request rejected (reason): the request is for a missing, stale or disqualified input' USING ERRCODE = '22023';
  END IF;
  IF coalesce(length(btrim(p_note)), 0) NOT BETWEEN 8 AND 2000 THEN RAISE EXCEPTION 'observation request rejected (note): the request says what is missing or stale (8–2000 characters)' USING ERRCODE = '22023'; END IF;
  IF p_input ->> 'kind' = 'series' THEN
    SELECT * INTO v_series FROM prediction.series_registry x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.series_key = p_input ->> 'series_key';
    IF NOT FOUND THEN RAISE EXCEPTION 'observation request rejected (unknown_series): series % is not registered in this domain', p_input ->> 'series_key' USING ERRCODE = '23503'; END IF;
    v_ref := 'series:' || v_series.series_key;
    SELECT c.source_id, c.approver_principal_id INTO v_source, v_steward FROM observation.source_contracts_current c
     WHERE c.tenant_id = p_tenant AND c.domain_id = p_domain AND c.source_key = v_series.source_key ORDER BY (c.lifecycle_state = 'active') DESC, c.contract_version DESC LIMIT 1;
  ELSE
    IF coalesce(p_input ->> 'key', '') !~ '^[a-z][a-z0-9_.-]*(:[A-Za-z0-9_.-]+)?$' THEN RAISE EXCEPTION 'observation request rejected (input): an element input names its key' USING ERRCODE = '22023'; END IF;
    v_ref := 'element:' || (p_input ->> 'key');
  END IF;
  SELECT * INTO prior FROM twin.observation_requests r WHERE r.twin_id = p_twin AND r.input_ref = v_ref AND r.state = 'open';
  IF FOUND THEN
    RETURN jsonb_build_object('request_id', prior.request_id, 'state', 'open', 'standing', true, 'via', prior.via, 'input_ref', v_ref, 'requested_at', prior.requested_at,
                              'attention_item_id', prior.attention_item_id, 'scheduler', prior.scheduler);
  END IF;
  IF v_source IS NOT NULL THEN SELECT * INTO s FROM observation.scheduler_entries x WHERE x.source_id = v_source AND x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.status = 'scheduled'; END IF;
  v_event := twin.tes_event(p_tenant, p_domain, p_twin, p_key, p_estimator, NULL, p_request_id, 'observation.requested', p_actor,
                            jsonb_build_object('input', p_input, 'input_ref', v_ref, 'reason_class', p_reason_class, 'source_id', v_source, 'requester_kind', v_kind), p_correlation);
  IF s.source_id IS NOT NULL THEN
    v_via := 'scheduler';
    v_sched := jsonb_build_object('scheduler_id', s.scheduler_id, 'queue', s.queue_name, 'cadence_seconds', s.cadence_seconds, 'contract_version', s.contract_version,
                                  'next_collection_within_seconds', s.cadence_seconds + s.jitter_seconds);
  ELSE
    v_via := 'attention';
    v_route := CASE WHEN v_steward IS NOT NULL AND decision.is_active_human(v_steward, p_tenant) THEN v_steward ELSE t.owner_principal_id END;
    v_item := twin.tes_notify(p_tenant, p_domain, 'twin.observation_request', 'twin', p_twin,
      format('New observations requested — %s of %s is %s', v_ref, t.title, p_reason_class),
      jsonb_build_array(format('the input %s is %s', v_ref, p_reason_class), btrim(p_note)), v_route, v_event,
      jsonb_build_object('request_id', p_request_id, 'twin_id', p_twin, 'key', p_key, 'input', p_input, 'source_id', v_source, 'reason_class', p_reason_class,
                         'routed_to', CASE WHEN v_route = t.owner_principal_id THEN 'twin owner' ELSE 'source steward' END), interval '2 days', p_actor, p_correlation);
  END IF;
  INSERT INTO twin.observation_requests (request_id, scope, tenant_id, domain_id, twin_id, key, estimator_id, input, input_ref, source_id, reason_class, note, via, scheduler,
                                         attention_item_id, routed_to, state, requested_by, requester_kind, agent_id, run_id, correlation_id)
  VALUES (p_request_id, 'DOMAIN', p_tenant, p_domain, p_twin, p_key, p_estimator, p_input, v_ref, v_source, p_reason_class, btrim(p_note), v_via, v_sched,
          v_item, v_route, 'open', p_actor, v_kind, p_agent, p_run, p_correlation);
  RETURN jsonb_build_object('request_id', p_request_id, 'state', 'open', 'standing', false, 'via', v_via, 'input_ref', v_ref, 'source_id', v_source, 'scheduler', v_sched,
                            'attention_item_id', v_item, 'routed_to', v_route, 'requester_kind', v_kind);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION twin.request_observations(uuid,uuid,uuid,uuid,text,uuid,jsonb,text,text,uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION twin.request_observations(uuid,uuid,uuid,uuid,text,uuid,jsonb,text,text,uuid,uuid,uuid,uuid) TO eye_commit;

/* CANCEL an open request (twin.observation.request): its requester or the twin's owner, with a reason. */
CREATE OR REPLACE FUNCTION twin.cancel_observation_request(p_request_id uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = twin, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r twin.observation_requests%ROWTYPE; v_owner uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['twin.observation.request']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM twin.tes_assert_actor('observation request', p_actor);
  SELECT * INTO r FROM twin.observation_requests x WHERE x.request_id = p_request_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'observation request rejected (unknown_request): % is not a request of this domain', p_request_id USING ERRCODE = '23503'; END IF;
  SELECT owner_principal_id INTO v_owner FROM twin.twins_current WHERE twin_id = r.twin_id;
  IF p_actor IS DISTINCT FROM r.requested_by AND p_actor IS DISTINCT FROM v_owner THEN
    RAISE EXCEPTION 'observation request rejected (ownership): a request is cancelled by its requester or the twin''s owner' USING ERRCODE = '42501';
  END IF;
  IF r.state <> 'open' THEN RAISE EXCEPTION 'observation request rejected (state): request % is %', p_request_id, r.state USING ERRCODE = '22023'; END IF;
  IF coalesce(length(btrim(p_reason)), 0) NOT BETWEEN 8 AND 2000 THEN RAISE EXCEPTION 'observation request rejected (note): a cancellation says why (8–2000 characters)' USING ERRCODE = '22023'; END IF;
  UPDATE twin.observation_requests SET state = 'cancelled', closed_at = clock_timestamp(), closed_by = p_actor, closure = jsonb_build_object('reason', btrim(p_reason)) WHERE request_id = p_request_id;
  PERFORM twin.tes_event(p_tenant, p_domain, r.twin_id, r.key, r.estimator_id, NULL, p_request_id, 'observation.cancelled', p_actor, jsonb_build_object('reason', btrim(p_reason)), p_correlation);
  RETURN jsonb_build_object('request_id', p_request_id, 'state', 'cancelled');
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION twin.cancel_observation_request(uuid,uuid,uuid,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION twin.cancel_observation_request(uuid,uuid,uuid,text,uuid,uuid) TO eye_commit;

/*
 * THE TRIGGERS (twin.estimation.trigger — the attention agent, after its tick; the after-tick hook `twin-estimation`). Per twin × key with an
 * active estimator, a proposal check is QUEUED (a trigger row in the ledger) on:
 *   telemetry          a new evidence version of a series input's source, recorded after the last trigger of that kind for the twin × key
 *                      (else after the earliest active estimator's declaration) — a new PortWatch transit count, for instance;
 *   internal_change    an admitted version on `actual` of an UPSTREAM twin (twin.twin_links: this twin downstream) — the internal-system
 *                      change GraphChanged/twin.state_changed announces —, after the same watermark;
 *   ontology_revision  the domain's ontology ACTIVATED anew (graph.ontology_events ontology.activated), after the same watermark.
 * And an open observation request is FULFILLED when its source recorded a new evidence version after the request. Nothing else is written:
 * the proposal itself is the Reconciliation Agent's (or a person's). Answers what was queued and fulfilled, the pending twin × keys, and the
 * domain's active Reconciliation Agents (the hook runs their scan when anything is pending).
 */
CREATE OR REPLACE FUNCTION twin.queue_estimation_triggers(p_tenant uuid, p_domain uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = twin, observation, objects, graph, executive, ctx, public, pg_catalog, pg_temp AS $$
DECLARE k record; v_mark timestamptz; v_ev record; v_queued jsonb := '[]'::jsonb; v_fulfilled jsonb := '[]'::jsonb; r twin.observation_requests%ROWTYPE; v_new record;
        v_pending jsonb; v_agents jsonb; v_id uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['twin.estimation.trigger']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM twin.tes_assert_actor('estimation trigger', p_actor);
  IF NOT EXISTS (SELECT 1 FROM executive.agents a WHERE a.principal_id = p_actor AND a.tenant_id = p_tenant AND a.domain_id = p_domain AND a.agent_kind = 'attention' AND a.status = 'active') THEN
    RAISE EXCEPTION 'estimation trigger rejected (authority): the triggers are queued by the domain''s active attention agent, after its tick' USING ERRCODE = '42501';
  END IF;
  FOR k IN SELECT x.twin_id, x.key, min(x.declared_at) AS since FROM twin.estimators x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.state = 'active'
            GROUP BY x.twin_id, x.key ORDER BY x.twin_id, x.key LOOP
    -- telemetry: the newest evidence of each series input's source
    SELECT coalesce(max(y.occurred_at), k.since) INTO v_mark FROM twin.estimation_events y WHERE y.twin_id = k.twin_id AND y.key = k.key AND y.event = 'trigger.telemetry';
    FOR v_ev IN
      SELECT DISTINCT ON (c.source_id) c.source_id, o.object_id, o.object_version, o.recorded_at, s.series_key
        FROM twin.estimators x
        CROSS JOIN LATERAL jsonb_array_elements(x.inputs) i
        JOIN prediction.series_registry s ON s.tenant_id = p_tenant AND s.domain_id = p_domain AND s.series_key = i ->> 'series_key'
        JOIN observation.source_contracts_current c ON c.tenant_id = p_tenant AND c.domain_id = p_domain AND c.source_key = s.source_key
        JOIN objects.canonical_objects o ON o.object_type = 'EVD' AND o.tenant_id = p_tenant AND o.domain_id = p_domain AND o.provenance_ref LIKE 'SRC:' || c.source_id::text || '@%'
       WHERE x.twin_id = k.twin_id AND x.key = k.key AND x.state = 'active' AND i ->> 'kind' = 'series' AND o.recorded_at > v_mark
       ORDER BY c.source_id, o.recorded_at DESC
    LOOP
      v_id := twin.tes_event(p_tenant, p_domain, k.twin_id, k.key, NULL, NULL, NULL, 'trigger.telemetry', p_actor,
                             jsonb_build_object('source_id', v_ev.source_id, 'series_key', v_ev.series_key, 'evidence', jsonb_build_object('id', v_ev.object_id, 'version', v_ev.object_version),
                                                'recorded_at', v_ev.recorded_at, 'watermark', v_mark), p_correlation);
      v_queued := v_queued || jsonb_build_array(jsonb_build_object('event_id', v_id, 'kind', 'telemetry', 'twin_id', k.twin_id, 'key', k.key, 'series_key', v_ev.series_key));
    END LOOP;
    -- internal-system change: an upstream twin's admitted version
    SELECT coalesce(max(y.occurred_at), k.since) INTO v_mark FROM twin.estimation_events y WHERE y.twin_id = k.twin_id AND y.key = k.key AND y.event = 'trigger.internal_change';
    FOR v_ev IN
      SELECT DISTINCT ON (l.upstream_twin_id) l.upstream_twin_id, (te.details ->> 'version')::int AS version, te.occurred_at, te.event_id
        FROM twin.twin_links l JOIN twin.twin_events te ON te.twin_id = l.upstream_twin_id AND te.event = 'version.admitted' AND te.details ->> 'branch_id' = 'actual'
       WHERE l.downstream_twin_id = k.twin_id AND l.tenant_id = p_tenant AND l.domain_id = p_domain AND l.state = 'live' AND te.occurred_at > v_mark
       ORDER BY l.upstream_twin_id, te.occurred_at DESC
    LOOP
      v_id := twin.tes_event(p_tenant, p_domain, k.twin_id, k.key, NULL, NULL, NULL, 'trigger.internal_change', p_actor,
                             jsonb_build_object('upstream_twin_id', v_ev.upstream_twin_id, 'version', v_ev.version, 'twin_event_id', v_ev.event_id, 'admitted_at', v_ev.occurred_at,
                                                'announced_as', 'GraphChanged/twin.state_changed', 'watermark', v_mark), p_correlation);
      v_queued := v_queued || jsonb_build_array(jsonb_build_object('event_id', v_id, 'kind', 'internal_change', 'twin_id', k.twin_id, 'key', k.key, 'upstream_twin_id', v_ev.upstream_twin_id));
    END LOOP;
    -- ontology revision: the domain's ontology activated anew
    SELECT coalesce(max(y.occurred_at), k.since) INTO v_mark FROM twin.estimation_events y WHERE y.twin_id = k.twin_id AND y.key = k.key AND y.event = 'trigger.ontology_revision';
    FOR v_ev IN
      SELECT oe.event_id, oe.version_id, oe.occurred_at, ov.version FROM graph.ontology_events oe JOIN graph.ontology_versions ov ON ov.version_id = oe.version_id
       WHERE oe.tenant_id = p_tenant AND oe.domain_id = p_domain AND oe.event = 'ontology.activated' AND oe.occurred_at > v_mark ORDER BY oe.occurred_at DESC LIMIT 1
    LOOP
      v_id := twin.tes_event(p_tenant, p_domain, k.twin_id, k.key, NULL, NULL, NULL, 'trigger.ontology_revision', p_actor,
                             jsonb_build_object('ontology_version_id', v_ev.version_id, 'ontology_version', v_ev.version, 'ontology_event_id', v_ev.event_id, 'activated_at', v_ev.occurred_at,
                                                'watermark', v_mark), p_correlation);
      v_queued := v_queued || jsonb_build_array(jsonb_build_object('event_id', v_id, 'kind', 'ontology_revision', 'twin_id', k.twin_id, 'key', k.key, 'ontology_version', v_ev.version));
    END LOOP;
  END LOOP;
  -- an open request is fulfilled by a new evidence version of its source recorded after the request
  FOR r IN SELECT * FROM twin.observation_requests x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.state = 'open' AND x.source_id IS NOT NULL FOR UPDATE LOOP
    SELECT o.object_id, o.object_version, o.recorded_at INTO v_new FROM objects.canonical_objects o
     WHERE o.object_type = 'EVD' AND o.tenant_id = p_tenant AND o.domain_id = p_domain AND o.provenance_ref LIKE 'SRC:' || r.source_id::text || '@%' AND o.recorded_at > r.requested_at
     ORDER BY o.recorded_at DESC LIMIT 1;
    IF v_new.object_id IS NOT NULL THEN
      UPDATE twin.observation_requests SET state = 'fulfilled', closed_at = clock_timestamp(), closed_by = p_actor,
             closure = jsonb_build_object('evidence', jsonb_build_object('id', v_new.object_id, 'version', v_new.object_version), 'recorded_at', v_new.recorded_at)
       WHERE request_id = r.request_id;
      PERFORM twin.tes_event(p_tenant, p_domain, r.twin_id, r.key, r.estimator_id, NULL, r.request_id, 'observation.fulfilled', p_actor,
                             jsonb_build_object('evidence', jsonb_build_object('id', v_new.object_id, 'version', v_new.object_version), 'recorded_at', v_new.recorded_at), p_correlation);
      v_fulfilled := v_fulfilled || jsonb_build_array(jsonb_build_object('request_id', r.request_id, 'twin_id', r.twin_id, 'input_ref', r.input_ref));
    END IF;
    v_new := NULL;
  END LOOP;
  SELECT coalesce(jsonb_agg(jsonb_build_object('twin_id', p.twin_id, 'key', p.key, 'triggers', p.n) ORDER BY p.twin_id, p.key), '[]'::jsonb) INTO v_pending
    FROM (SELECT x.twin_id, x.key, count(*) AS n FROM twin.estimation_events x
           WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.event IN ('trigger.telemetry', 'trigger.internal_change', 'trigger.ontology_revision')
             AND x.occurred_at > coalesce((SELECT max((y.details ->> 'through')::timestamptz) FROM twin.estimation_events y WHERE y.twin_id = x.twin_id AND y.key = x.key AND y.event = 'trigger.consumed'), '-infinity'::timestamptz)
           GROUP BY x.twin_id, x.key) p;
  SELECT coalesce(jsonb_agg(a.agent_id ORDER BY a.created_at), '[]'::jsonb) INTO v_agents FROM executive.agents a
   WHERE a.tenant_id = p_tenant AND a.domain_id = p_domain AND a.agent_kind = 'reconciliation' AND a.status = 'active';
  RETURN jsonb_build_object('queued', v_queued, 'fulfilled', v_fulfilled, 'pending', v_pending, 'reconciliation_agents', v_agents);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION twin.queue_estimation_triggers(uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION twin.queue_estimation_triggers(uuid,uuid,uuid,uuid) TO eye_commit;

/* The PENDING proposal checks of the domain (an INVOKER read: the ledger's row security): per twin × key, the triggers not yet answered by a
   proposal — what the Reconciliation Agent's scan reads as its backlog. */
CREATE OR REPLACE FUNCTION twin.estimation_pending() RETURNS TABLE (twin_id uuid, key text, triggers bigint, kinds text[], oldest timestamptz)
LANGUAGE sql STABLE SET search_path = twin, pg_catalog, pg_temp AS $$
  SELECT x.twin_id, x.key, count(*), array_agg(DISTINCT replace(x.event, 'trigger.', '') ORDER BY replace(x.event, 'trigger.', '')), min(x.occurred_at)
    FROM twin.estimation_events x
   WHERE x.event IN ('trigger.telemetry', 'trigger.internal_change', 'trigger.ontology_revision')
     AND x.occurred_at > coalesce((SELECT max((y.details ->> 'through')::timestamptz) FROM twin.estimation_events y WHERE y.twin_id = x.twin_id AND y.key = x.key AND y.event = 'trigger.consumed'), '-infinity'::timestamptz)
   GROUP BY x.twin_id, x.key ORDER BY min(x.occurred_at), x.twin_id, x.key
$$;
REVOKE ALL ON FUNCTION twin.estimation_pending() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION twin.estimation_pending() TO eye_app, eye_commit;

-- ============================================================
-- §ES.4 PUBLICATION THROUGH THE EXISTING PORTS
-- ============================================================
INSERT INTO observation.canonical_write_actions (action, object_types, rationale) VALUES
  ('twin.estimate.decide', ARRAY['TWN'], 'B30 estimation: the twin owner''s approval of an estimate admits the new twin version (a TWN object) and nothing else')
ON CONFLICT (action) DO NOTHING;

/*
 * The existing VERSION and GROUND ports (0092:628/696, copied whole), each with ONE change: the bound action twin.estimate.decide is served
 * beside the port's own (twin.version / twin.ground) and B29's twin.coupling.apply — so an approved estimate is published THROUGH them (the
 * same draft rules, carry-forward re-judgement, materiality and citation checks), never around them.
 */
CREATE OR REPLACE FUNCTION twin.open_version(
  p_twin_id uuid, p_tenant uuid, p_domain uuid, p_branch text, p_forked_from int, p_known_at timestamptz, p_observed_through date,
  p_carry_from int, p_except text[], p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS int
SECURITY DEFINER SET search_path = twin, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_next int; v_supersedes int; v_open int; v_health jsonb := '{}'::jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['twin.version', /* B29 (0092) */ 'twin.coupling.apply', /* B30 estimation */ 'twin.estimate.decide']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF NOT EXISTS (SELECT 1 FROM twin.twins_current t WHERE t.twin_id = p_twin_id AND t.tenant_id = p_tenant AND t.domain_id = p_domain) THEN
    RAISE EXCEPTION 'version rejected: no such twin in this domain' USING ERRCODE = '23503';
  END IF;
  SELECT count(*) INTO v_open FROM twin.twin_versions v WHERE v.twin_id = p_twin_id AND v.branch_id = p_branch AND v.state = 'draft';
  IF v_open > 0 THEN
    RAISE EXCEPTION 'version rejected: branch % already has an open draft; admit it or ground into it', p_branch USING ERRCODE = '22023';
  END IF;
  IF p_forked_from IS NOT NULL AND NOT EXISTS (SELECT 1 FROM twin.twin_versions v
      WHERE v.twin_id = p_twin_id AND v.version = p_forked_from AND v.state = 'admitted') THEN
    RAISE EXCEPTION 'version rejected: fork source % is not an admitted version of this twin', p_forked_from USING ERRCODE = '23503';
  END IF;
  SELECT coalesce(max(version), 0) + 1 INTO v_next FROM twin.twin_versions WHERE twin_id = p_twin_id;
  SELECT max(version) INTO v_supersedes FROM twin.twin_versions WHERE twin_id = p_twin_id AND branch_id = p_branch AND state = 'admitted';
  INSERT INTO twin.twin_versions (
    twin_id, version, scope, tenant_id, domain_id, branch_id, forked_from_version, supersedes, state, known_at, observed_through,
    opened_by, correlation_id
  ) VALUES (p_twin_id, v_next, 'DOMAIN', p_tenant, p_domain, p_branch, p_forked_from, v_supersedes, 'draft', p_known_at, p_observed_through,
            p_actor, p_correlation);
  IF p_carry_from IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM twin.twin_versions v WHERE v.twin_id = p_twin_id AND v.version = p_carry_from AND v.state = 'admitted') THEN
      RAISE EXCEPTION 'version rejected: carry-from source % is not an admitted version of this twin', p_carry_from USING ERRCODE = '23503';
    END IF;
    INSERT INTO twin.state_elements (
      element_id, scope, tenant_id, domain_id, twin_id, version, key, kind, basis_truth_state, value, unit, material, citations,
      health, valid_from, valid_to, confidence, synthetic_state, controls, inherited_validation, grounded_by, correlation_id)
    SELECT gen_random_uuid(), e.scope, e.tenant_id, e.domain_id, e.twin_id, v_next, e.key, e.kind, e.basis_truth_state, e.value, e.unit,
           e.material, e.citations,
           CASE
             WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(e.citations) c
                            JOIN objects.canonical_objects o ON o.object_id = (c ->> 'id')::uuid AND o.object_version = (c ->> 'version')::int
                                                             AND o.tenant_id = p_tenant AND o.domain_id = p_domain
                           WHERE (c ->> 'kind') <> 'entity' AND o.lifecycle_state IN ('withdrawn', 'retired')) THEN 'unreadable'
             WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(e.citations) c
                            JOIN objects.canonical_objects o ON o.object_id = (c ->> 'id')::uuid AND o.object_version = (c ->> 'version')::int
                                                             AND o.tenant_id = p_tenant AND o.domain_id = p_domain
                           WHERE (c ->> 'kind') <> 'entity' AND o.recorded_at > p_known_at) THEN 'incomplete'
             WHEN e.kind IN ('observed', 'estimated') AND p_observed_through IS NOT NULL AND e.valid_from IS NOT NULL AND e.valid_from > p_observed_through THEN 'incomplete'
             WHEN e.kind IN ('observed', 'estimated') AND p_observed_through IS NOT NULL AND EXISTS (SELECT 1 FROM jsonb_array_elements(e.citations) c
                            JOIN objects.canonical_objects o ON o.object_id = (c ->> 'id')::uuid AND o.object_version = (c ->> 'version')::int
                                                             AND o.tenant_id = p_tenant AND o.domain_id = p_domain
                           WHERE (c ->> 'kind') = 'evidence' AND o.event_time IS NOT NULL AND (o.event_time AT TIME ZONE 'UTC')::date > p_observed_through) THEN 'incomplete'
             WHEN p_observed_through IS NOT NULL AND e.valid_to IS NOT NULL AND e.valid_to < p_observed_through THEN 'stale'
             ELSE e.health END,
           e.valid_from, e.valid_to, e.confidence, e.synthetic_state, e.controls, e.inherited_validation, p_actor, p_correlation
      FROM twin.state_elements e
     WHERE e.twin_id = p_twin_id AND e.version = p_carry_from AND NOT (e.key = ANY (coalesce(p_except, ARRAY[]::text[])));
    UPDATE twin.twin_versions SET element_count = (SELECT count(*) FROM twin.state_elements e WHERE e.twin_id = p_twin_id AND e.version = v_next)
     WHERE twin_id = p_twin_id AND version = v_next;
    SELECT coalesce(jsonb_object_agg(h, n), '{}'::jsonb) INTO v_health
      FROM (SELECT e.health h, count(*) n FROM twin.state_elements e WHERE e.twin_id = p_twin_id AND e.version = v_next GROUP BY e.health) x;
  END IF;
  INSERT INTO twin.twin_events (event_id, scope, tenant_id, domain_id, twin_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_twin_id, 'version.opened', p_actor,
          jsonb_build_object('version', v_next, 'branch_id', p_branch, 'forked_from_version', p_forked_from, 'supersedes', v_supersedes,
                             'known_at', p_known_at, 'observed_through', p_observed_through, 'carried_from', p_carry_from, 'except', to_jsonb(p_except),
                             'carried_health', v_health), p_correlation);
  RETURN v_next;
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION twin.ground_element(
  p_element_id uuid, p_tenant uuid, p_domain uuid, p_twin_id uuid, p_version int, p_key text, p_kind text, p_basis text,
  p_value jsonb, p_unit text, p_citations jsonb, p_health text, p_valid_from date, p_valid_to date, p_confidence numeric,
  p_synthetic boolean, p_controls jsonb, p_inherited_validation text, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS boolean
SECURITY DEFINER SET search_path = twin, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_material boolean;
BEGIN
  PERFORM observation.assert_authority(ARRAY['twin.ground', /* B29 (0092) */ 'twin.coupling.apply', /* B30 estimation */ 'twin.estimate.decide']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF NOT EXISTS (SELECT 1 FROM twin.twin_versions v WHERE v.twin_id = p_twin_id AND v.version = p_version
                   AND v.tenant_id = p_tenant AND v.domain_id = p_domain AND v.state = 'draft') THEN
    RAISE EXCEPTION 'grounding rejected: version % of twin % is not an open draft in this domain', p_version, p_twin_id USING ERRCODE = '2F002';
  END IF;
  IF NOT twin.citations_ok(p_citations) THEN
    RAISE EXCEPTION 'grounding rejected: citations must be an array of {kind, id, version, digest} binding exact objects' USING ERRCODE = '22023';
  END IF;
  IF twin.citation_count(p_citations, 'claim') > 0 AND p_basis IS NULL THEN
    RAISE EXCEPTION 'grounding rejected: % cites a claim and names no truth state for it — a derived claim keeps its truth state', p_key USING ERRCODE = '22023';
  END IF;
  IF p_kind = 'predicted' AND p_inherited_validation IS NULL THEN
    RAISE EXCEPTION 'grounding rejected: % is predicted and carries no validation state from its forecast', p_key USING ERRCODE = '22023';
  END IF;
  v_material := twin.key_is_material(p_twin_id, p_key);
  IF v_material AND (twin.citation_count(p_citations, 'evidence') + twin.citation_count(p_citations, 'claim') + twin.citation_count(p_citations, 'forecast')
                     + twin.citation_count(p_citations, 'assumption') + twin.citation_count(p_citations, 'run')) = 0 THEN
    RAISE EXCEPTION 'grounding rejected: % is material for this twin and is substantiated by nothing but an entity — an entity names a subject, it substantiates no value', p_key
      USING ERRCODE = '22023';
  END IF;
  INSERT INTO twin.state_elements (
    element_id, scope, tenant_id, domain_id, twin_id, version, key, kind, basis_truth_state, value, unit, material, citations,
    health, valid_from, valid_to, confidence, synthetic_state, controls, inherited_validation, grounded_by, correlation_id
  ) VALUES (
    p_element_id, 'DOMAIN', p_tenant, p_domain, p_twin_id, p_version, p_key, p_kind, p_basis, p_value, p_unit, v_material, p_citations,
    p_health, p_valid_from, p_valid_to, p_confidence, coalesce(p_synthetic, false), coalesce(p_controls, '{}'::jsonb), p_inherited_validation, p_actor, p_correlation);
  UPDATE twin.twin_versions SET element_count = element_count + 1 WHERE twin_id = p_twin_id AND version = p_version;
  INSERT INTO twin.twin_events (event_id, scope, tenant_id, domain_id, twin_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_twin_id, 'element.grounded', p_actor,
          jsonb_build_object('version', p_version, 'key', p_key, 'kind', p_kind, 'material', v_material, 'health', p_health,
                             'citations', p_citations, 'synthetic_state', coalesce(p_synthetic, false), 'inherited_validation', p_inherited_validation), p_correlation);
  RETURN v_material;
END $$ LANGUAGE plpgsql;

/* The existing ADMIT port (0032:458, copied whole) with ONE change: it also serves twin.estimate.decide (the approval's own transaction). */
CREATE OR REPLACE FUNCTION twin.admit_version(
  p_twin_id uuid, p_tenant uuid, p_domain uuid, p_version int, p_expected_digest text, p_header_digest text,
  p_allow_incomplete boolean, p_synthetic boolean, p_controls jsonb, p_dependencies jsonb,
  p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = twin, graph, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_digest text; v_missing jsonb; v_bad int; v_completeness text; d jsonb; v_branch text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['twin.version.admit', /* B30 estimation */ 'twin.estimate.decide']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT branch_id INTO v_branch FROM twin.twin_versions v
   WHERE v.twin_id = p_twin_id AND v.version = p_version AND v.tenant_id = p_tenant AND v.domain_id = p_domain AND v.state = 'draft' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'admission rejected: version % of twin % is not an open draft in this domain', p_version, p_twin_id USING ERRCODE = '2F002';
  END IF;
  SELECT count(*) INTO v_bad FROM twin.state_elements e
   WHERE e.twin_id = p_twin_id AND e.version = p_version AND e.material AND e.health = 'complete'
     AND (twin.citation_count(e.citations, 'evidence') + twin.citation_count(e.citations, 'claim') + twin.citation_count(e.citations, 'forecast')
          + twin.citation_count(e.citations, 'assumption') + twin.citation_count(e.citations, 'run')) = 0;
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'admission rejected: % material element(s) are substantiated by nothing but an entity', v_bad USING ERRCODE = '22023';
  END IF;
  v_digest := twin.state_set_digest(p_twin_id, p_version);
  IF p_expected_digest IS NULL OR v_digest <> p_expected_digest THEN
    RAISE EXCEPTION 'admission rejected: the state set changed between digesting and admitting (% vs %)', p_expected_digest, v_digest USING ERRCODE = '22023';
  END IF;
  v_missing := twin.missing_required_keys(p_twin_id, p_version);
  v_completeness := CASE WHEN jsonb_array_length(v_missing) = 0 THEN 'complete' ELSE 'incomplete' END;
  IF v_completeness = 'incomplete' AND NOT coalesce(p_allow_incomplete, false) THEN
    RAISE EXCEPTION 'admission rejected: required inputs are missing, unreadable or stale: %; admit explicitly as incomplete or ground them', v_missing::text USING ERRCODE = '22023';
  END IF;
  UPDATE twin.twin_versions
     SET state = 'admitted', state_set_digest = v_digest, header_digest = p_header_digest, completeness = v_completeness,
         missing_keys = v_missing, synthetic_state = coalesce(p_synthetic, false), controls = coalesce(p_controls, '{}'::jsonb),
         admitted_at = clock_timestamp()
   WHERE twin_id = p_twin_id AND version = p_version;
  UPDATE twin.twins_current
     SET synthetic_state = synthetic_state OR coalesce(p_synthetic, false), controls = coalesce(p_controls, controls)
   WHERE twin_id = p_twin_id;
  -- What the version rests on, in the SAME dependency table Phase 3 walks.
  FOR d IN SELECT * FROM jsonb_array_elements(coalesce(p_dependencies, '[]'::jsonb)) LOOP
    INSERT INTO graph.dependencies (
      dependency_id, scope, tenant_id, domain_id, dependent_object_id, dependent_type, depends_on_kind, depends_on_id,
      rationale, state, created_by, correlation_id
    ) VALUES (
      gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_twin_id, 'TWN', d ->> 'kind', (d ->> 'id')::uuid,
      format('twin version %s on branch %s grounds %s on it', p_version, v_branch, d ->> 'key'), 'active', p_actor, p_correlation)
    ON CONFLICT DO NOTHING;
  END LOOP;
  INSERT INTO twin.twin_events (event_id, scope, tenant_id, domain_id, twin_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_twin_id, 'version.admitted', p_actor,
          jsonb_build_object('version', p_version, 'branch_id', v_branch, 'state_set_digest', v_digest, 'header_digest', p_header_digest,
                             'completeness', v_completeness, 'missing_keys', v_missing, 'synthetic_state', coalesce(p_synthetic, false)), p_correlation);
  RETURN jsonb_build_object('state_set_digest', v_digest, 'completeness', v_completeness, 'missing_keys', v_missing);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION twin.admit_version(uuid,uuid,uuid,int,text,text,boolean,boolean,jsonb,jsonb,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION twin.admit_version(uuid,uuid,uuid,int,text,text,boolean,boolean,jsonb,jsonb,uuid,uuid,uuid) TO eye_commit;

-- ═════════════════════════════════════════════════════════════════════
-- section `experiments` (the part file 0103_b30_x_experiments.sql, built and proven alone on b30/experiments, combined here in the apply order)
-- ═════════════════════════════════════════════════════════════════════
-- ═════════════════════════════════════════════════════════════════════
-- section `experiments` (§EX) — CP-6 B30 part `experiments` (2026-10-02): the B30 carryovers of F-P5-06 and F-P5-07.
--
--   §EX.1  THE VOCABULARY: experiments.state gains `retired`; experiment_events gains `retired`, `stopped_unstable`, `paused_unstable`,
--          `adapter_quarantined`, `review_routed`, `policy_set` and `stopped_quarantined`; the experiment's ON-UNSTABLE policy (stop | pause | none, DEFAULT none —
--          every B31 experiment and fixture keeps its ledger) and its retirement record.
--   §EX.2  CHUNKED METHOD-FABRIC EXPERIMENTS (L8-C06, PR-35-001): simulation.sio_chunkable_methods() re-declared (0099:971, copied whole) —
--          discrete-event@1, counterfactual@1 and war-gaming@1 join supply-flow@1. A chunk of a fabric method runs path s of the run's
--          stored contract through the method's adapter seeded with `seed ^ imul(s + 1, 0x9e3779b1)` (the per-path stream of supply-flow@1,
--          applied per adapter), out of process; each path's measures are the method's summary PROJECTED onto the experiment measures
--          (rule fabric-measures@1, stated in apps/api/src/twin/simulations/fabric/fabric-plan.ts). system-dynamics@1 and optimisation@1
--          draw nothing (no per-path stream: every path would be the same) and agent-based@1 reports none of the experiment measures —
--          they stay outside the list.
--   §EX.3  THE CHECKPOINT INDICATORS ACTED ON (V03-T-354, ES-38-007, ES-38-009, V04-T-034): simulation.record_experiment_chunk re-declared
--          (0099:1469, copied whole). An UNSTABLE numerical-stability indicator, or a VIOLATED / INDETERMINATE constraint indicator, at a
--          checkpoint is ACTED ON per the experiment's declared policy (rule sxp-unstable@1): `stop` → the experiment stops (partial,
--          reason unstable; stopped_unstable); `pause` → it pauses (paused_unstable; an operator resumes it); a FAULT-SHAPED instability
--          (the running mean diverging: moved more than half since a previous checkpoint of at least 30 paths) QUARANTINES a contained
--          adapter (adapter_quarantined) and then STOPS the experiment under either policy (supply-flow@1 runs in process and is never
--          quarantined); a review is ROUTED
--          (simulation.checkpoint → the declarer and the method stewards; review_routed). Policy `none`: B31's behaviour, unchanged.
--          simulation.set_unstable_policy (simulation.experiment.policy) sets the policy before approval; simulation.quarantine_adapter
--          (simulation.adapter.quarantine) is a method steward's quarantine on demand. A fabric experiment whose adapter stands quarantined
--          (on demand, by another experiment's divergence, by B29's fault streak) stops between chunks (stopped_quarantined).
--   §EX.4  RETIREMENT (PR-35-001): simulation.retire_run (simulation.retirement.run) writes the prelude's runs_current.retired_* columns,
--          simulation.retire_experiment (simulation.retirement.experiment) retires a finished experiment and its run; each with its REASON
--          and its REACH (the packages whose options cite the run, the dependent analyses, sweeps and validations, the runs that name it
--          as their control or correct it, the experiment that produced it) recorded in simulation.retirements; the owners of the reached
--          packages told (simulation.validity). A retired run is no longer analysed (impact analyses, sweeps, validations) nor taken as an
--          intervention run's control (BEFORE INSERT gates). §EN's run_decision_use reads the columns.
--   §EX.5  NONLINEAR RESPONSE ACROSS THE ENVELOPE (V02-T-167): simulation.envelope_sweeps — per factor a grid across the behaviour model's
--          operating-envelope range on the deterministic trajectory, the response curve, its nonlinearity and curvature, the thresholds
--          (onset, saturation, kink), and the TWO-FACTOR interactions (hidden dependencies); simulation.sweep_envelope (simulation.sweep.run)
--          re-checks the grid against the envelope and recomputes every nonlinearity index and interaction (rule sxp-sweep@1).
--   §EX.6  RARE EVENTS, MODEL DISCREPANCY, BENCHMARK VALIDATION, CONVERGENCE OUTSIDE AN EXPERIMENT (AI-50-004):
--          simulation.benchmark_validations — a run's paths against an observed (evidence cited) or benchmark (basis stated) sample of the
--          same measure: the bias, the two-sample Kolmogorov–Smirnov distance and its critical value, the tail / rare-event coverage, and
--          the running-mean convergence over the path count; simulation.validate_benchmark (simulation.benchmark.validate) recomputes the
--          means, the bias, the KS distance and the tail frequencies from the stored paths (rule sxp-benchmark@1).
--
-- The exact run-event vocabulary (simulation.run_events) is NOT widened (an on-demand or unstable quarantine announces the existing
-- adapter.quarantined on the experiment's run); no outbox event type is added; the interface register stays 50/0/0. Every figure a
-- harness or the demonstration seeds is SYNTHETIC.
-- ═════════════════════════════════════════════════════════════════════

-- §EX.1 THE VOCABULARY ─────────────────────────────────────────────────
ALTER TABLE simulation.experiments DROP CONSTRAINT experiments_state_check;
ALTER TABLE simulation.experiments ADD CONSTRAINT experiments_state_check
  CHECK (state IN ('declared', 'approved', 'running', 'paused', 'completed', 'partial', 'failed', 'cancelled', /* B30 experiments */ 'retired'));
ALTER TABLE simulation.experiments DROP CONSTRAINT sio_finished_bound;
ALTER TABLE simulation.experiments ADD CONSTRAINT sio_finished_bound
  CHECK ((state IN ('completed', 'partial', 'failed', 'cancelled', /* B30 experiments */ 'retired')) = (finished_at IS NOT NULL));
/* THE ON-UNSTABLE POLICY (what a checkpoint whose indicator is unstable, violated or indeterminate does to the experiment): none (B31's —
   recorded, not acted on), stop or pause. Set before the budget's approval (simulation.set_unstable_policy). */
ALTER TABLE simulation.experiments ADD COLUMN on_unstable text NOT NULL DEFAULT 'none';
ALTER TABLE simulation.experiments ADD CONSTRAINT sxp_on_unstable CHECK (on_unstable IN ('stop', 'pause', 'none'));
/* THE RETIREMENT of a finished experiment: {prior_state, reason, retired_by, retired_at, run_retired, retirement_id}. */
ALTER TABLE simulation.experiments ADD COLUMN retirement jsonb;
ALTER TABLE simulation.experiments ADD CONSTRAINT sxp_retired_bound CHECK ((state = 'retired') = (retirement IS NOT NULL));
ALTER TABLE simulation.experiment_events DROP CONSTRAINT experiment_events_event_check;
ALTER TABLE simulation.experiment_events ADD CONSTRAINT experiment_events_event_check
  CHECK (event IN ('declared', 'approved', 'admission_refused', 'started', 'run_opened', 'checkpointed', 'chunk_failed', 'chunk_reclaimed',
                   'paused', 'resumed', 'budget_exceeded', 'converged', 'completed', 'partial', 'failed', 'cancelled',
                   /* B30 experiments */ 'retired', 'stopped_unstable', 'paused_unstable', 'adapter_quarantined', 'review_routed', 'policy_set', 'stopped_quarantined'));

-- §EX.2 THE CHUNKABLE METHODS ───────────────────────────────────────────
/* 0099:971, copied whole — B30 experiments: the method fabric's seeded methods whose chunks are deterministic per seed offset (a seeded
   per-path stream per adapter). The TS mirror is experiment-plan.ts CHUNKABLE_METHODS (its B30 block). */
CREATE OR REPLACE FUNCTION simulation.sio_chunkable_methods() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY['supply-flow@1', /* B30 experiments */ 'discrete-event@1', 'counterfactual@1', 'war-gaming@1'] $$;

-- §EX.3 THE CHECKPOINT INDICATORS ACTED ON ──────────────────────────────
/* The aggregate of a FABRIC chunk, computed HERE from its paths: per declared measure over the paths that carry it ({n, sum, sumsq, min,
   max}; n counts the paths with a value). supply-flow@1's chunks keep simulation.sio_chunk_aggregate (B31's, unchanged). */
CREATE OR REPLACE FUNCTION simulation.sxp_chunk_aggregate(p_totals jsonb, p_measures text[]) RETURNS jsonb LANGUAGE sql IMMUTABLE
SET search_path = simulation, pg_catalog, pg_temp AS $$
  SELECT coalesce(jsonb_object_agg(m, (
           SELECT jsonb_build_object('n', count(q.v), 'sum', coalesce(sum(q.v), 0), 'sumsq', coalesce(sum(q.v * q.v), 0), 'min', min(q.v), 'max', max(q.v))
             FROM (SELECT CASE WHEN m = 'total_cost' THEN (t -> 'cost' ->> 'total')::numeric ELSE (t ->> m)::numeric END AS v FROM jsonb_array_elements(p_totals) t) q)), '{}'::jsonb)
    FROM unnest(p_measures) m
$$;

/* THE READING of a checkpoint (rule sxp-unstable@1): ACTED ON when a declared measure's numerical stability is `unstable` (sio-stability@1:
   the 95% half-width above 5% of the mean, or the mean moved more than 2% since the previous checkpoint, at 30 paths or more), or when the
   constraint indicator is `violated` or `indeterminate`. FAULT-SHAPED when an unstable measure DIVERGES — its mean moved more than half
   since a previous checkpoint that already held 30 paths: a solver behaving like a fault, not sampling noise. `indeterminate` stability
   (below 30 paths) is never acted on. The TS mirror is fabric-plan.ts unstableReading (the unit test pins both on the same cases). */
CREATE OR REPLACE FUNCTION simulation.sxp_unstable_reading(p_stability jsonb, p_constraint jsonb, p_previous jsonb) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE
SET search_path = simulation, pg_catalog, pg_temp AS $$
DECLARE m text; s jsonb; v_reasons jsonb := '[]'::jsonb; v_div jsonb := '[]'::jsonb; v_unstable jsonb := '[]'::jsonb; v_cc text := coalesce(p_constraint ->> 'outcome', 'not_applicable');
BEGIN
  FOR m, s IN SELECT key, value FROM jsonb_each(coalesce(p_stability, '{}'::jsonb)) ORDER BY key LOOP
    IF s ->> 'state' = 'unstable' THEN
      v_unstable := v_unstable || to_jsonb(m);
      v_reasons := v_reasons || to_jsonb(format('numerical_stability: %s is unstable (95%% half-width %s of the mean, the mean moved %s since the previous checkpoint, %s paths)',
                                                m, coalesce(s ->> 'relative_half_width', '?'), coalesce(s ->> 'change_since_previous', 'n/a'), coalesce(s ->> 'n', '0')));
      IF (s ->> 'change_since_previous') IS NOT NULL AND (s ->> 'change_since_previous')::numeric > 0.5
         AND coalesce((p_previous -> m ->> 'n')::numeric, 0) >= 30 THEN
        v_div := v_div || jsonb_build_object('measure', m, 'change_since_previous', (s ->> 'change_since_previous')::numeric, 'previous_paths', (p_previous -> m ->> 'n')::numeric);
      END IF;
    END IF;
  END LOOP;
  IF v_cc IN ('violated', 'indeterminate') THEN
    v_reasons := v_reasons || to_jsonb(format('constraint_satisfaction: the run''s latest constraint check is %s (%s stage, set %s)', v_cc, coalesce(p_constraint ->> 'stage', '?'), coalesce(p_constraint ->> 'set_id', 'none')));
  END IF;
  RETURN jsonb_build_object('acted', jsonb_array_length(v_reasons) > 0, 'reasons', v_reasons, 'unstable_measures', v_unstable, 'constraint', v_cc,
                            'fault_shaped', jsonb_array_length(v_div) > 0, 'divergence', v_div, 'rule', 'sxp-unstable@1');
END $$;

/* THE QUARANTINE of a contained adapter in this domain (private: the record port's on a fault-shaped instability, the steward's port on
   demand). A method that is not contained (supply-flow@1, isolated false) is never quarantined; an adapter already quarantined is left as
   it is. The adapter ledger's `quarantined` and, on a run, the existing run event adapter.quarantined; the reinstatement is B29's
   (a probe of the pinned implementation passing after this quarantine, a method steward — never the run's operator). */
CREATE OR REPLACE FUNCTION simulation.sxp_quarantine(p_tenant uuid, p_domain uuid, p_model_ref text, p_run_id uuid, p_kind text, p_message text, p_details jsonb, p_actor uuid, p_correlation uuid)
RETURNS jsonb SECURITY DEFINER SET search_path = simulation, twin, pg_catalog, pg_temp AS $$
DECLARE m twin.behaviour_models%ROWTYPE; h simulation.adapter_health%ROWTYPE; v_at timestamptz := clock_timestamp(); v_fault jsonb; v_operator uuid;
BEGIN
  SELECT * INTO m FROM twin.behaviour_models WHERE method_ref = p_model_ref;
  IF NOT FOUND THEN RETURN jsonb_build_object('quarantined', false, 'reason', 'unknown_model', 'model_ref', p_model_ref); END IF;
  IF coalesce((m.containment ->> 'isolated')::boolean, false) IS NOT TRUE THEN
    RETURN jsonb_build_object('quarantined', false, 'reason', 'not_contained', 'model_ref', p_model_ref, 'note', format('%s runs in process (containment.isolated false); it is never quarantined', p_model_ref));
  END IF;
  INSERT INTO simulation.adapter_health (scope, tenant_id, domain_id, model_ref) VALUES ('DOMAIN', p_tenant, p_domain, p_model_ref) ON CONFLICT DO NOTHING;
  SELECT * INTO h FROM simulation.adapter_health WHERE tenant_id = p_tenant AND domain_id = p_domain AND model_ref = p_model_ref FOR UPDATE;
  IF h.state = 'quarantined' THEN RETURN jsonb_build_object('quarantined', false, 'reason', 'already_quarantined', 'model_ref', p_model_ref, 'quarantined_at', h.quarantined_at); END IF;
  IF p_run_id IS NOT NULL THEN SELECT r.operator_principal_id INTO v_operator FROM simulation.runs_current r WHERE r.run_id = p_run_id; END IF;
  v_fault := jsonb_build_object('kind', p_kind, 'message', left(p_message, 500), 'run_id', p_run_id, 'probe_id', NULL, 'at', v_at) || coalesce(p_details, '{}'::jsonb);
  UPDATE simulation.adapter_health SET state = 'quarantined', last_fault = v_fault, last_fault_at = v_at, last_fault_operator = v_operator, quarantined_at = v_at,
         quarantined_by_run = p_run_id, updated_at = v_at
   WHERE tenant_id = p_tenant AND domain_id = p_domain AND model_ref = p_model_ref;
  INSERT INTO simulation.adapter_events (event_id, scope, tenant_id, domain_id, model_ref, event, run_id, probe_id, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_model_ref, 'quarantined', p_run_id, NULL, p_actor,
          jsonb_build_object('cause', p_kind, 'last_fault', v_fault, 'consecutive_faults', h.consecutive_faults), p_correlation);
  IF p_run_id IS NOT NULL THEN
    INSERT INTO simulation.run_events (event_id, scope, tenant_id, domain_id, run_id, event, actor_principal_id, details, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_run_id, 'adapter.quarantined', p_actor, jsonb_build_object('model_ref', p_model_ref, 'cause', p_kind, 'message', left(p_message, 500)), p_correlation);
  END IF;
  RETURN jsonb_build_object('quarantined', true, 'model_ref', p_model_ref, 'quarantined_at', v_at, 'cause', p_kind, 'run_id', p_run_id);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION simulation.sxp_quarantine(uuid, uuid, text, uuid, text, text, jsonb, uuid, uuid) FROM PUBLIC;

/* 0099:1469, copied whole — B30 experiments: (1) a FABRIC chunk's aggregate is sxp_chunk_aggregate's (per declared measure over the paths that
   carry it); supply-flow@1's stays sio_chunk_aggregate's; (2) after the stop rules, a done chunk's checkpoint is READ (sxp_unstable_reading) and,
   under the experiment's policy (stop | pause — never under none, the B31 default), ACTED ON: stopped (partial, reason unstable) or paused when
   chunks are left and no other stop is pending; a fault-shaped instability quarantines a contained adapter; the review routed
   (simulation.checkpoint → the declarer, the method stewards). Everything else is B31's, unchanged. */
/* RECORD (the WORKER's): the chunk's attempt is FENCED (a reclaimed chunk's late worker is refused — stale); done → the port computes
   the chunk's aggregate from its paths, merges the running aggregate, writes the CHECKPOINT (the digest chained to the previous one, the
   indicators: numerical stability per measure, latency, cost, failures, constraint satisfaction) and checkpointed (the progress event);
   failed → a retry (queued again) until sio_max_attempts(), then the chunk fails for good. Then the STOP RULES, in order: every chunk done
   → finish completed; a chunk failed for good → partial (chunk_failed; failed when nothing completed); the budget's wall seconds or chunk
   executions exhausted with chunks left → budget_exceeded, the declarer told → partial (failed when nothing completed); the declared
   convergence reached before the declared paths → converged → partial. Answers {next: continue | paused | finish, outcome, reason}. */
CREATE OR REPLACE FUNCTION simulation.record_experiment_chunk(p_experiment_id uuid, p_chunk_index int, p_tenant uuid, p_domain uuid, p_attempt int, p_outcome text, p_sample_totals jsonb,
                                                              p_digest text, p_wall_ms int, p_error text, p_actor uuid, p_event_id uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = simulation, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE e simulation.experiments%ROWTYPE; c simulation.experiment_chunks%ROWTYPE; v_agg jsonb; v_prev jsonb; v_prev_digest text; v_seq int; v_digest text; v_ind jsonb; v_stab jsonb := '{}'::jsonb;
        m text; v_left int; v_stop jsonb; v_cc jsonb; v_conv jsonb; v_failed_final boolean := false; v_item uuid; v_ev uuid;
        /* B30 experiments */ v_read jsonb; v_q jsonb; v_act_ev uuid; v_actions jsonb := '[]'::jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['simulation.experiment.execute']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM simulation.sio_assert_actor(p_actor);
  PERFORM simulation.sio_assert_worker(p_tenant, p_domain, p_actor);
  e := simulation.sio_lock(p_experiment_id, p_tenant, p_domain);
  SELECT * INTO c FROM simulation.experiment_chunks k WHERE k.experiment_id = e.experiment_id AND k.chunk_index = p_chunk_index FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'experiment rejected (unknown_chunk): experiment % has no chunk %', e.experiment_id, p_chunk_index USING ERRCODE = '23503'; END IF;
  IF c.state <> 'running' OR c.attempts <> p_attempt OR e.state NOT IN ('running', 'paused') THEN
    RAISE EXCEPTION 'experiment rejected (stale): chunk % of experiment % is % at attempt % (this record is attempt %; the experiment is %)', p_chunk_index, e.experiment_id, c.state, c.attempts, p_attempt, e.state USING ERRCODE = '2F002';
  END IF;
  IF p_outcome NOT IN ('done', 'failed') THEN RAISE EXCEPTION 'experiment rejected (outcome): a chunk is done or failed' USING ERRCODE = '22023'; END IF;
  UPDATE simulation.experiments SET progress = jsonb_set(progress, '{wall_ms}', to_jsonb((progress ->> 'wall_ms')::bigint + greatest(coalesce(p_wall_ms, 0), 0))) WHERE experiment_id = e.experiment_id RETURNING * INTO e;
  IF p_outcome = 'done' THEN
    IF jsonb_typeof(p_sample_totals) IS DISTINCT FROM 'array' OR jsonb_array_length(p_sample_totals) <> c.paths OR p_digest IS NULL OR p_digest !~ '^[0-9a-f]{64}$' THEN
      RAISE EXCEPTION 'experiment rejected (chunk): chunk % of experiment % carries % paths with its digest (got %)', p_chunk_index, e.experiment_id, c.paths, coalesce(jsonb_array_length(p_sample_totals), 0) USING ERRCODE = '22023';
    END IF;
    v_agg := CASE WHEN e.method_ref = 'supply-flow@1' THEN simulation.sio_chunk_aggregate(p_sample_totals)
                  ELSE /* B30 experiments: a fabric chunk */ simulation.sxp_chunk_aggregate(p_sample_totals, e.measures) END;
    UPDATE simulation.experiment_chunks SET state = 'done', finished_at = clock_timestamp(), wall_ms = p_wall_ms, sample_totals = p_sample_totals, aggregate = v_agg, digest = p_digest, error = NULL
     WHERE experiment_id = c.experiment_id AND chunk_index = c.chunk_index;
    v_prev := e.aggregate;
    SELECT k.seq, k.digest INTO v_seq, v_prev_digest FROM simulation.experiment_checkpoints k WHERE k.experiment_id = e.experiment_id ORDER BY k.seq DESC LIMIT 1;
    v_seq := coalesce(v_seq, 0) + 1;
    v_digest := encode(sha256(convert_to(coalesce(v_prev_digest, 'genesis:' || e.experiment_id::text) || '|' || p_chunk_index::text || '|' || p_digest, 'UTF8')), 'hex');
    e.aggregate := simulation.sio_merge(e.aggregate, v_agg);
    FOREACH m IN ARRAY e.measures LOOP v_stab := v_stab || jsonb_build_object(m, simulation.sio_stability(e.aggregate, CASE WHEN v_prev = '{}'::jsonb THEN NULL ELSE v_prev END, m)); END LOOP;
    SELECT jsonb_build_object('stage', x.stage, 'outcome', x.outcome, 'set_id', x.set_id, 'set_version', x.set_version) INTO v_cc
      FROM simulation.run_constraint_checks x WHERE x.run_id = e.run_id ORDER BY x.checked_at DESC LIMIT 1;
    v_ind := jsonb_build_object(
      'numerical_stability', v_stab,
      'constraint_satisfaction', coalesce(v_cc, jsonb_build_object('outcome', 'not_applicable', 'note', 'no constraint set applied to the run''s inputs')),
      'latency', jsonb_build_object('chunk_wall_ms', p_wall_ms, 'ms_per_path', round(coalesce(p_wall_ms, 0)::numeric / c.paths, 3)),
      'cost', jsonb_build_object('wall_seconds_used', round(((e.progress ->> 'wall_ms')::numeric) / 1000, 3), 'wall_seconds_approved', (e.budget ->> 'max_wall_seconds')::numeric,
                                 'chunk_executions_used', (e.progress ->> 'executions')::int, 'chunk_executions_approved', (e.budget ->> 'max_chunks')::int),
      'failure_containment', jsonb_build_object('chunk_failures', (e.progress ->> 'failures')::int, 'contained', true, 'executor', 'a separate process per chunk, bounded in time and heap'),
      'reproducibility', jsonb_build_object('seeded', true, 'chunk_digest', p_digest, 'checkpoint_digest', v_digest),
      'rule', 'sio-indicators@1');
    UPDATE simulation.experiments
       SET aggregate = e.aggregate, indicators = v_ind,
           progress = progress || jsonb_build_object('paths_done', (progress ->> 'paths_done')::int + c.paths, 'chunks_done', (progress ->> 'chunks_done')::int + 1, 'last_checkpoint', v_seq)
     WHERE experiment_id = e.experiment_id RETURNING * INTO e;
    INSERT INTO simulation.experiment_checkpoints (checkpoint_id, scope, tenant_id, domain_id, experiment_id, seq, chunk_index, paths_done, chunks_done, aggregate, digest, indicators, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, e.experiment_id, v_seq, p_chunk_index, (e.progress ->> 'paths_done')::int, (e.progress ->> 'chunks_done')::int, e.aggregate, v_digest, v_ind, p_correlation);
    PERFORM simulation.sio_event(e, 'checkpointed', p_actor, jsonb_build_object('seq', v_seq, 'chunk_index', p_chunk_index, 'paths_done', (e.progress ->> 'paths_done')::int, 'declared_paths', e.paths,
              'progress', round(((e.progress ->> 'paths_done')::numeric) / e.paths, 4), 'digest', v_digest, 'wall_ms', p_wall_ms, 'stability', v_stab), p_correlation, p_event_id);
  ELSE
    UPDATE simulation.experiments SET progress = jsonb_set(progress, '{failures}', to_jsonb((progress ->> 'failures')::int + 1)) WHERE experiment_id = e.experiment_id RETURNING * INTO e;
    v_failed_final := c.attempts >= simulation.sio_max_attempts();
    UPDATE simulation.experiment_chunks SET state = CASE WHEN v_failed_final THEN 'failed' ELSE 'queued' END, finished_at = clock_timestamp(), wall_ms = p_wall_ms, error = left(coalesce(p_error, 'the chunk failed'), 500)
     WHERE experiment_id = c.experiment_id AND chunk_index = c.chunk_index;
    PERFORM simulation.sio_event(e, 'chunk_failed', p_actor, jsonb_build_object('chunk_index', p_chunk_index, 'attempt', c.attempts, 'final', v_failed_final, 'error', left(coalesce(p_error, ''), 500)), p_correlation, p_event_id);
  END IF;
  -- THE STOP RULES
  SELECT count(*) INTO v_left FROM simulation.experiment_chunks k WHERE k.experiment_id = e.experiment_id AND k.state <> 'done';
  IF v_left = 0 THEN
    v_stop := jsonb_build_object('outcome', 'completed', 'reason', 'paths');
  ELSIF v_failed_final THEN
    v_stop := jsonb_build_object('outcome', CASE WHEN (e.progress ->> 'chunks_done')::int > 0 THEN 'partial' ELSE 'failed' END, 'reason', 'chunk_failed');
  ELSIF (e.progress ->> 'wall_ms')::numeric > (e.budget ->> 'max_wall_seconds')::numeric * 1000 OR (e.progress ->> 'executions')::int >= (e.budget ->> 'max_chunks')::int THEN
    v_stop := jsonb_build_object('outcome', CASE WHEN (e.progress ->> 'chunks_done')::int > 0 THEN 'partial' ELSE 'failed' END, 'reason', 'budget_exceeded');
    v_ev := simulation.sio_event(e, 'budget_exceeded', p_actor, jsonb_build_object('used', e.progress, 'approved', e.budget, 'chunks_left', v_left), p_correlation);
    v_item := simulation.sio_notify(e, 'simulation.budget', format('Simulation budget exceeded: %s (%s of %s paths done)', e.title, e.progress ->> 'paths_done', e.paths),
                jsonb_build_array(format('used %s s of %s s and %s of %s chunk executions with %s chunk(s) left', round(((e.progress ->> 'wall_ms')::numeric) / 1000, 3), e.budget ->> 'max_wall_seconds',
                                         e.progress ->> 'executions', e.budget ->> 'max_chunks', v_left),
                                  'the experiment stops; its run is PARTIAL with the missing outputs declared (never decision-active), or failed when no path completed'),
                e.declared_by, NULL, v_ev, 'experiment.budget_exceeded', jsonb_build_object('kind', 'budget_exceeded', 'used', e.progress, 'approved', e.budget), interval '24 hours', p_actor, p_correlation);
  ELSIF p_outcome = 'done' AND e.stop_conditions -> 'converged' IS NOT NULL AND jsonb_typeof(e.stop_conditions -> 'converged') = 'object' THEN
    v_conv := e.stop_conditions -> 'converged';
    IF (e.progress ->> 'paths_done')::int >= (v_conv ->> 'min_paths')::int
       AND (v_stab -> (v_conv ->> 'measure') ->> 'ci_half_width')::numeric <= (v_conv ->> 'ci_half_width')::numeric THEN
      v_stop := jsonb_build_object('outcome', 'partial', 'reason', 'converged');
      PERFORM simulation.sio_event(e, 'converged', p_actor, jsonb_build_object('measure', v_conv ->> 'measure', 'stability', v_stab -> (v_conv ->> 'measure'), 'condition', v_conv,
                                                                               'paths_done', (e.progress ->> 'paths_done')::int), p_correlation);
    END IF;
  END IF;
  -- B30 experiments: a FABRIC experiment whose adapter stands QUARANTINED in this domain (a steward's quarantine on demand, another
  -- experiment's divergence, B29's fault streak) executes no further chunk of it: it stops between chunks (supply-flow@1 is never quarantined)
  IF v_stop IS NULL AND v_left > 0 AND e.state = 'running' AND e.method_ref <> 'supply-flow@1'
     AND EXISTS (SELECT 1 FROM simulation.adapter_health hq WHERE hq.tenant_id = p_tenant AND hq.domain_id = p_domain AND hq.model_ref = e.method_ref AND hq.state = 'quarantined') THEN
    v_stop := jsonb_build_object('outcome', CASE WHEN (e.progress ->> 'chunks_done')::int > 0 THEN 'partial' ELSE 'failed' END, 'reason', 'adapter_quarantined');
    PERFORM simulation.sio_event(e, 'stopped_quarantined', p_actor, jsonb_build_object('model_ref', e.method_ref, 'chunks_left', v_left, 'paths_done', (e.progress ->> 'paths_done')::int,
              'quarantined_at', (SELECT hq.quarantined_at FROM simulation.adapter_health hq WHERE hq.tenant_id = p_tenant AND hq.domain_id = p_domain AND hq.model_ref = e.method_ref)), p_correlation);
  END IF;
  -- B30 experiments: THE CHECKPOINT READ AND ACTED ON (rule sxp-unstable@1) — only under a declared policy (stop | pause); none is B31's
  IF p_outcome = 'done' AND e.on_unstable IN ('stop', 'pause') THEN
    v_read := simulation.sxp_unstable_reading(v_stab, v_ind -> 'constraint_satisfaction', CASE WHEN v_prev = '{}'::jsonb THEN NULL ELSE v_prev END);
    IF (v_read ->> 'acted')::boolean THEN
      -- a FAULT-SHAPED instability quarantines a contained adapter first; its experiment then STOPS whatever the policy (no further chunk of a
      -- quarantined adapter is executed for it)
      IF (v_read ->> 'fault_shaped')::boolean THEN
        v_q := simulation.sxp_quarantine(p_tenant, p_domain, e.method_ref, e.run_id, 'unstable',
                 format('experiment %s checkpoint %s: the running mean diverged (%s)', e.experiment_id, v_seq, v_read -> 'divergence'),
                 jsonb_build_object('experiment_id', e.experiment_id, 'checkpoint_seq', v_seq, 'divergence', v_read -> 'divergence'), p_actor, p_correlation);
        IF (v_q ->> 'quarantined')::boolean THEN
          PERFORM simulation.sio_event(e, 'adapter_quarantined', p_actor, jsonb_build_object('seq', v_seq, 'model_ref', e.method_ref, 'divergence', v_read -> 'divergence', 'quarantine', v_q), p_correlation);
          v_actions := v_actions || to_jsonb('adapter_quarantined'::text);
        ELSE
          v_actions := v_actions || to_jsonb(format('adapter not quarantined (%s)', v_q ->> 'reason'));
        END IF;
      END IF;
      IF v_stop IS NULL AND v_left > 0 AND e.state = 'running' THEN
        IF e.on_unstable = 'stop' OR v_actions ? 'adapter_quarantined' THEN
          v_stop := jsonb_build_object('outcome', 'partial', 'reason', 'unstable');
          v_act_ev := simulation.sio_event(e, 'stopped_unstable', p_actor, jsonb_build_object('seq', v_seq, 'chunk_index', p_chunk_index, 'reading', v_read, 'policy', e.on_unstable,
                                                                                             'quarantined', v_actions ? 'adapter_quarantined',
                                                                                             'paths_done', (e.progress ->> 'paths_done')::int, 'chunks_left', v_left), p_correlation);
          v_actions := v_actions || to_jsonb('stopped'::text);
        ELSE
          UPDATE simulation.experiments SET state = 'paused' WHERE experiment_id = e.experiment_id RETURNING * INTO e;
          v_act_ev := simulation.sio_event(e, 'paused_unstable', p_actor, jsonb_build_object('seq', v_seq, 'chunk_index', p_chunk_index, 'reading', v_read, 'policy', 'pause',
                                                                                            'paths_done', (e.progress ->> 'paths_done')::int, 'chunks_left', v_left), p_correlation);
          v_actions := v_actions || to_jsonb('paused'::text);
        END IF;
      END IF;
      v_item := simulation.sio_notify(e, 'simulation.checkpoint', format('Simulation checkpoint %s of %s: %s', v_seq, e.title,
                                       CASE WHEN v_actions ? 'stopped' THEN 'stopped as unstable' WHEN v_actions ? 'paused' THEN 'paused as unstable' ELSE 'unstable indicator' END),
                  (v_read -> 'reasons') || jsonb_build_array(format('policy %s: %s', e.on_unstable, CASE WHEN jsonb_array_length(v_actions) = 0 THEN 'another stop was already pending (or no chunk is left); the review is routed' ELSE (SELECT string_agg(x, ', ') FROM jsonb_array_elements_text(v_actions) x) END)),
                  e.declared_by, ARRAY['method_steward'], coalesce(v_act_ev, p_event_id), 'experiment.checkpoint_unstable',
                  jsonb_build_object('kind', 'checkpoint_unstable', 'seq', v_seq, 'reading', v_read, 'actions', v_actions, 'policy', e.on_unstable), interval '24 hours', p_actor, p_correlation);
      PERFORM simulation.sio_event(e, 'review_routed', p_actor, jsonb_build_object('seq', v_seq, 'attention_item_id', v_item, 'routed_to', jsonb_build_object('owner', e.declared_by, 'roles', jsonb_build_array('method_steward')),
                                                                                   'actions', v_actions), p_correlation);
    END IF;
  END IF;
  IF v_stop IS NOT NULL THEN
    UPDATE simulation.experiments SET stop_pending = v_stop WHERE experiment_id = e.experiment_id RETURNING * INTO e;
    RETURN jsonb_build_object('next', 'finish', 'outcome', v_stop ->> 'outcome', 'reason', v_stop ->> 'reason', 'experiment', simulation.sio_experiment_json(e));
  END IF;
  RETURN jsonb_build_object('next', CASE WHEN e.state = 'paused' THEN 'paused' ELSE 'continue' END, 'experiment', simulation.sio_experiment_json(e));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION simulation.record_experiment_chunk(uuid, int, uuid, uuid, int, text, jsonb, text, int, text, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION simulation.record_experiment_chunk(uuid, int, uuid, uuid, int, text, jsonb, text, int, text, uuid, uuid, uuid) TO eye_commit;

/* SET THE ON-UNSTABLE POLICY (simulation.experiment.policy — the declarer, the starter, a twin owner or the domain administrator, as an
   operator's act): stop | pause | none, with a reason, while the experiment is DECLARED — the approver approves the experiment as it will
   behave (a policy is never changed under a running experiment). policy_set records the previous and the new policy. */
CREATE OR REPLACE FUNCTION simulation.set_unstable_policy(p_experiment_id uuid, p_tenant uuid, p_domain uuid, p_policy text, p_reason text, p_actor uuid, p_event_id uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = simulation, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE e simulation.experiments%ROWTYPE; v_prev text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['simulation.experiment.policy']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM simulation.sio_assert_actor(p_actor);
  e := simulation.sio_lock(p_experiment_id, p_tenant, p_domain);
  PERFORM simulation.sio_assert_operator(e, p_actor, 'setting the unstable-checkpoint policy of');
  IF e.state <> 'declared' THEN
    RAISE EXCEPTION 'experiment rejected (state): experiment % is %; its unstable-checkpoint policy is set while it is declared, before its budget is approved', e.experiment_id, e.state USING ERRCODE = '2F002';
  END IF;
  IF p_policy IS NULL OR p_policy NOT IN ('stop', 'pause', 'none') THEN RAISE EXCEPTION 'experiment rejected (policy): the unstable-checkpoint policy is stop, pause or none (not %)', coalesce(p_policy, '<none>') USING ERRCODE = '22023'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN RAISE EXCEPTION 'experiment rejected (reason): a policy says why, in at least 8 characters' USING ERRCODE = '22023'; END IF;
  v_prev := e.on_unstable;
  UPDATE simulation.experiments SET on_unstable = p_policy WHERE experiment_id = e.experiment_id RETURNING * INTO e;
  PERFORM simulation.sio_event(e, 'policy_set', p_actor, jsonb_build_object('on_unstable', p_policy, 'previous', v_prev, 'reason', btrim(p_reason), 'rule', 'sxp-unstable@1'), p_correlation, p_event_id);
  RETURN simulation.sio_experiment_json(e);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION simulation.set_unstable_policy(uuid, uuid, uuid, text, text, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION simulation.set_unstable_policy(uuid, uuid, uuid, text, text, uuid, uuid, uuid) TO eye_commit;

/* QUARANTINE ON DEMAND (simulation.adapter.quarantine — a method steward, human-gated): a contained adapter quarantined in this domain with
   the steward's reason (an unstable solver seen in a review, a checkpoint the steward read), optionally naming the run that showed it.
   Refused: a principal other than the acting one (actor 403), a person not active (authority 403), an unknown model or run (404), an
   adapter already quarantined (state 409), a method that is not contained or a reason under 8 characters (422). The reinstatement is
   B29's (simulation.reinstate_adapter after a passing probe). */
CREATE OR REPLACE FUNCTION simulation.quarantine_adapter(p_tenant uuid, p_domain uuid, p_model_ref text, p_run_id uuid, p_reason text, p_actor uuid, p_event_id uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = simulation, twin, decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE m twin.behaviour_models%ROWTYPE; h simulation.adapter_health%ROWTYPE; v_q jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['simulation.adapter.quarantine']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'adapter quarantine rejected (actor): recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF NOT decision.is_active_human(p_actor, p_tenant) THEN RAISE EXCEPTION 'adapter quarantine rejected (authority): an adapter is quarantined on demand by a named, active human' USING ERRCODE = '42501'; END IF;
  SELECT * INTO m FROM twin.behaviour_models WHERE method_ref = p_model_ref;
  IF NOT FOUND THEN RAISE EXCEPTION 'adapter quarantine rejected (unknown_model): no behaviour model % is registered', p_model_ref USING ERRCODE = '23503'; END IF;
  IF coalesce((m.containment ->> 'isolated')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'adapter quarantine rejected (not_contained): % runs in process (containment.isolated false); only a contained adapter is quarantined', p_model_ref USING ERRCODE = '22023';
  END IF;
  IF p_run_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM simulation.runs_current r WHERE r.run_id = p_run_id AND r.tenant_id = p_tenant AND r.domain_id = p_domain AND r.model_ref = p_model_ref) THEN
    RAISE EXCEPTION 'adapter quarantine rejected (unknown_run): % is not a run of % in this domain', p_run_id, p_model_ref USING ERRCODE = '23503';
  END IF;
  SELECT * INTO h FROM simulation.adapter_health WHERE tenant_id = p_tenant AND domain_id = p_domain AND model_ref = p_model_ref;
  IF FOUND AND h.state = 'quarantined' THEN
    RAISE EXCEPTION 'adapter quarantine rejected (state): the adapter of % is already quarantined in this domain since %', p_model_ref, h.quarantined_at USING ERRCODE = '2F002';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN RAISE EXCEPTION 'adapter quarantine rejected (reason): a quarantine says why, in at least 8 characters' USING ERRCODE = '22023'; END IF;
  v_q := simulation.sxp_quarantine(p_tenant, p_domain, p_model_ref, p_run_id, 'steward', btrim(p_reason), jsonb_build_object('quarantined_by', p_actor), p_actor, p_correlation);
  RETURN v_q || jsonb_build_object('reason', btrim(p_reason), 'quarantined_by', p_actor, 'reinstatement', 'a method steward reinstates it after a probe of the pinned implementation passes (simulation.adapter.probe, simulation.adapter.reinstate)');
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION simulation.quarantine_adapter(uuid, uuid, text, uuid, text, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION simulation.quarantine_adapter(uuid, uuid, text, uuid, text, uuid, uuid, uuid) TO eye_commit;

-- §EX.4–6 THE TABLES ────────────────────────────────────────────────────
/* A RETIREMENT (PR-35-001): a finished run, or a finished experiment (and its run), retired by a named human with its REASON and its REACH
   as found at that instant — append-only; the run's own columns (runs_current.retired_*, the prelude's) are written once. */
CREATE TABLE simulation.retirements (
  retirement_id        uuid PRIMARY KEY,
  scope                text NOT NULL,
  tenant_id            uuid NOT NULL,
  domain_id            uuid NOT NULL,
  subject_kind         text NOT NULL CHECK (subject_kind IN ('run', 'experiment')),
  run_id               uuid REFERENCES simulation.runs_current (run_id),
  experiment_id        uuid REFERENCES simulation.experiments (experiment_id),
  reason               text NOT NULL CHECK (length(btrim(reason)) >= 8),
  /* the run that supersedes the retired one, when the retirer names it (a completed, unretired run of this domain) */
  superseded_by        uuid REFERENCES simulation.runs_current (run_id),
  /* {packages: [...], analyses: {...}, dependent_runs: [...], experiment, counts} — what the retired run reached when it was retired */
  reach                jsonb NOT NULL CHECK (jsonb_typeof(reach) = 'object'),
  /* the attention items that told the reached packages' owners */
  notified             jsonb NOT NULL DEFAULT '[]'::jsonb,
  retired_by           uuid NOT NULL,
  retired_at           timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id       uuid NOT NULL,
  CONSTRAINT sxp_ret_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT sxp_ret_subject CHECK ((subject_kind = 'run' AND run_id IS NOT NULL AND experiment_id IS NULL) OR (subject_kind = 'experiment' AND experiment_id IS NOT NULL)),
  CONSTRAINT sxp_ret_not_self CHECK (superseded_by IS NULL OR superseded_by IS DISTINCT FROM run_id)
);
CREATE INDEX sxp_ret_run ON simulation.retirements (run_id);
CREATE INDEX sxp_ret_domain ON simulation.retirements (tenant_id, domain_id, retired_at DESC);
COMMENT ON TABLE simulation.retirements IS 'B30 §EX (0103; F-P5-06 PR-35-001): the RETIREMENT of a finished run or experiment by a named human — the reason, the superseding run, the reach (citing packages, dependent analyses, sweeps, validations and runs) found at that instant, the owners told; append-only.';

/* AN ENVELOPE SWEEP (V02-T-167; rule sxp-sweep@1): per factor of the behaviour model's operating envelope, a grid of `grid_points` values
   from its low to its high bound, the metric on the run's stored contract's DETERMINISTIC trajectory at each (every other factor at its
   base) — the response curve; its nonlinearity (the largest gap to the chord through the end points, as a share of the response's
   span; nonlinear above 5%), its curvature (the largest change of slope between neighbouring segments, as a share of the steepest slope)
   and its THRESHOLDS (an interior grid point where the slope changes by more than half the steepest slope: onset — from flat —, saturation
   — to flat —, or kink); and every PAIR of factors at its four corners: the interaction hh − hl − lh + ll against the larger main effect
   — a HIDDEN DEPENDENCY above 10%. Executed by the pinned model (supply-flow@1); append-only. */
CREATE TABLE simulation.envelope_sweeps (
  sweep_id              uuid PRIMARY KEY,
  scope                 text NOT NULL,
  tenant_id             uuid NOT NULL,
  domain_id             uuid NOT NULL,
  run_id                uuid NOT NULL REFERENCES simulation.runs_current (run_id),
  run_outputs_digest    text NOT NULL CHECK (run_outputs_digest ~ '^[0-9a-f]{64}$'),
  model_ref             text NOT NULL,
  implementation_digest text NOT NULL CHECK (implementation_digest ~ '^[0-9a-f]{64}$'),
  metric                text NOT NULL CHECK (metric IN ('total_cost', 'line_stop_days', 'days_below_safety_stock')),
  grid_points           int  NOT NULL CHECK (grid_points BETWEEN 3 AND 25),
  /* the behaviour model's operating envelope as read at the sweep */
  envelope              jsonb NOT NULL CHECK (jsonb_typeof(envelope) = 'object'),
  base_value            numeric NOT NULL,
  /* [{key, field, range: [lo, hi], base_value, grid: [{value, metric}], slopes, nonlinearity, nonlinear, curvature, response (flat | linear | nonlinear),
       thresholds: [{kind (onset | saturation | kink), at, between: [lo, hi], slope_before, slope_after}]}] */
  factors               jsonb NOT NULL CHECK (jsonb_typeof(factors) = 'array' AND jsonb_array_length(factors) >= 1),
  /* [{factors: [a, b], corners: {ll, lh, hl, hh}, main_a, main_b, interaction, relative, hidden_dependency}] */
  interactions          jsonb NOT NULL CHECK (jsonb_typeof(interactions) = 'array'),
  nonlinear_factors     int  NOT NULL CHECK (nonlinear_factors >= 0),
  thresholds            int  NOT NULL CHECK (thresholds >= 0),
  hidden_dependencies   int  NOT NULL CHECK (hidden_dependencies >= 0),
  rule                  text NOT NULL CHECK (rule = 'sxp-sweep@1'),
  digest                text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  synthetic_state       boolean NOT NULL,
  requested_by          uuid NOT NULL,
  swept_at              timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id        uuid NOT NULL,
  CONSTRAINT sxp_sw_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX sxp_sw_run ON simulation.envelope_sweeps (run_id, swept_at DESC);
COMMENT ON TABLE simulation.envelope_sweeps IS 'B30 §EX (0103; F-P5-07 V02-T-167): NONLINEAR RESPONSE ACROSS THE OPERATING ENVELOPE of a completed valid run — per factor a grid across the model''s envelope range (the response curve, nonlinearity, curvature, thresholds) and the two-factor interactions (hidden dependencies); rule sxp-sweep@1; append-only.';

/* A BENCHMARK VALIDATION (AI-50-004; rule sxp-benchmark@1): a run's paths of one measure (its seeded sample totals, or its single
   deterministic total) against an OBSERVED sample (values entered with the evidence they were read from, cited) or a BENCHMARK sample (a
   reference model's or a published figure's values, the basis stated) — the MODEL DISCREPANCY (the means, the bias and the relative bias,
   the two-sample Kolmogorov–Smirnov distance and its 5% critical value 1.358·√((n+m)/(n·m)), the share of the benchmark inside the run's
   p05–p95 band); the RARE EVENTS (the tail threshold — declared, else the benchmark's p95 —, the run's and the benchmark's tail frequencies,
   their ratio, the tail paths the run holds; under-represented below half, over-represented above twice); CONVERGENCE outside an
   experiment (the running mean over the path count at every tenth of the paths, its change and 95% half-width; converged when the last
   three moved ≤ 1% and the half-width is ≤ 5% of the mean); the VERDICT (insufficient — fewer than 5 benchmark values, or fewer than 30
   paths of a seeded run —, discrepant — |relative bias| above the tolerance, KS above its critical value, or the tail under-represented —,
   else consistent). Append-only. */
CREATE TABLE simulation.benchmark_validations (
  validation_id         uuid PRIMARY KEY,
  scope                 text NOT NULL,
  tenant_id             uuid NOT NULL,
  domain_id             uuid NOT NULL,
  run_id                uuid NOT NULL REFERENCES simulation.runs_current (run_id),
  run_outputs_digest    text NOT NULL CHECK (run_outputs_digest ~ '^[0-9a-f]{64}$'),
  model_ref             text NOT NULL,
  measure               text NOT NULL CHECK (measure IN ('total_cost', 'line_stop_days', 'days_below_safety_stock')),
  benchmark_kind        text NOT NULL CHECK (benchmark_kind IN ('observed', 'benchmark')),
  /* {values: [...], basis, citations: [...]} — the values as entered, their basis, the evidence an observed sample was read from */
  benchmark             jsonb NOT NULL CHECK (jsonb_typeof(benchmark) = 'object'),
  benchmark_digest      text NOT NULL CHECK (benchmark_digest ~ '^[0-9a-f]{64}$'),
  run_paths             int  NOT NULL CHECK (run_paths >= 1),
  benchmark_n           int  NOT NULL CHECK (benchmark_n >= 1),
  tolerance             numeric NOT NULL CHECK (tolerance > 0 AND tolerance <= 1),
  discrepancy           jsonb NOT NULL CHECK (jsonb_typeof(discrepancy) = 'object'),
  tail                  jsonb NOT NULL CHECK (jsonb_typeof(tail) = 'object'),
  convergence           jsonb NOT NULL CHECK (jsonb_typeof(convergence) = 'object'),
  verdict               text NOT NULL CHECK (verdict IN ('consistent', 'discrepant', 'insufficient')),
  rule                  text NOT NULL CHECK (rule = 'sxp-benchmark@1'),
  digest                text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  synthetic_state       boolean NOT NULL,
  requested_by          uuid NOT NULL,
  validated_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id        uuid NOT NULL,
  CONSTRAINT sxp_bv_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX sxp_bv_run ON simulation.benchmark_validations (run_id, validated_at DESC);
COMMENT ON TABLE simulation.benchmark_validations IS 'B30 §EX (0103; F-P5-07 AI-50-004): a run''s paths validated against an observed or benchmark sample — the model discrepancy (bias, KS), the rare-event tail coverage, the convergence over the path count outside an experiment and the verdict; rule sxp-benchmark@1; append-only.';

-- RLS, GRANTS, APPEND-ONLY (the 0081 loop idiom; reads under the caller's RLS; every write through a port below)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['retirements', 'envelope_sweeps', 'benchmark_validations'] LOOP
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
CREATE TRIGGER sxp_ret_append_only BEFORE UPDATE OR DELETE ON simulation.retirements FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
CREATE TRIGGER sxp_sw_append_only BEFORE UPDATE OR DELETE ON simulation.envelope_sweeps FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
CREATE TRIGGER sxp_bv_append_only BEFORE UPDATE OR DELETE ON simulation.benchmark_validations FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

-- §EX.4 RETIREMENT ──────────────────────────────────────────────────────
/* THE REACH of a run (an invoker read; inside a port, under the port's context): the packages whose options cite it (an option's
   consequence of kind `run`) or whose version names it as the baseline — with the option, whether it is the recommended one, whether the
   version is the current or the committed one, and the package's owner —; the analyses resting on it (B31's sensitivity analyses,
   second-order derivations and probability statements; B30's envelope sweeps and benchmark validations); the runs that name it as their
   control or correct it; the experiment that produced it. */
CREATE OR REPLACE FUNCTION simulation.sxp_retirement_reach(p_run_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = simulation, decision, pg_catalog, pg_temp AS $$
  WITH r AS (SELECT x.run_id, x.tenant_id, x.domain_id FROM simulation.runs_current x WHERE x.run_id = p_run_id),
  cited AS (
    SELECT o.package_id, o.version, o.key AS option_key, o.title AS option_title, 'option_consequence'::text AS via
      FROM decision.options o JOIN r ON r.tenant_id = o.tenant_id AND r.domain_id = o.domain_id
     WHERE jsonb_typeof(o.consequences) = 'array'
       AND EXISTS (SELECT 1 FROM jsonb_array_elements(o.consequences) c WHERE c ->> 'kind' = 'run' AND c ->> 'id' = p_run_id::text)
    UNION ALL
    SELECT pv.package_id, pv.version, NULL, NULL, 'baseline_run' FROM decision.package_versions pv JOIN r ON r.tenant_id = pv.tenant_id AND r.domain_id = pv.domain_id
     WHERE pv.baseline_run_id = p_run_id),
  pk AS (
    SELECT c.*, p.title AS package_title, p.owner_principal_id, p.state AS package_state, (c.version = p.current_version) AS is_current, (c.version IS NOT DISTINCT FROM p.committed_version) AS is_committed,
           (c.option_key IS NOT NULL AND c.option_key = (pv.choice ->> 'option_key')) AS recommended
      FROM cited c JOIN decision.packages_current p ON p.package_id = c.package_id
      LEFT JOIN decision.package_versions pv ON pv.package_id = c.package_id AND pv.version = c.version)
  SELECT jsonb_build_object(
    'run_id', p_run_id,
    'packages', coalesce((SELECT jsonb_agg(jsonb_build_object('package_id', pk.package_id, 'title', pk.package_title, 'owner', pk.owner_principal_id, 'state', pk.package_state, 'version', pk.version,
                                                              'via', pk.via, 'option_key', pk.option_key, 'option_title', pk.option_title, 'recommended', pk.recommended,
                                                              'current', pk.is_current, 'committed', pk.is_committed) ORDER BY pk.package_id, pk.version, pk.option_key) FROM pk), '[]'::jsonb),
    'analyses', jsonb_build_object(
      'sensitivity', coalesce((SELECT jsonb_agg(jsonb_build_object('analysis_id', a.analysis_id, 'metric', a.metric, 'analysed_at', a.analysed_at) ORDER BY a.analysed_at, a.analysis_id)
                                 FROM simulation.sensitivity_analyses a WHERE a.run_id = p_run_id), '[]'::jsonb),
      'second_order', coalesce((SELECT jsonb_agg(DISTINCT x.derivation_id) FROM simulation.second_order_effects x WHERE x.run_id = p_run_id), '[]'::jsonb),
      'probability_statements', coalesce((SELECT jsonb_agg(s.statement_id ORDER BY s.stated_at) FROM simulation.probability_statements s WHERE s.run_id = p_run_id), '[]'::jsonb),
      'envelope_sweeps', coalesce((SELECT jsonb_agg(w.sweep_id ORDER BY w.swept_at) FROM simulation.envelope_sweeps w WHERE w.run_id = p_run_id), '[]'::jsonb),
      'benchmark_validations', coalesce((SELECT jsonb_agg(b.validation_id ORDER BY b.validated_at) FROM simulation.benchmark_validations b WHERE b.run_id = p_run_id), '[]'::jsonb)),
    'dependent_runs', coalesce((SELECT jsonb_agg(jsonb_build_object('run_id', d.run_id, 'state', d.state, 'relation', CASE WHEN d.control_run_id = p_run_id THEN 'control_of' ELSE 'corrected_by' END,
                                                                    'retired', d.retired_at IS NOT NULL) ORDER BY d.opened_at, d.run_id)
                                  FROM simulation.runs_current d JOIN r ON r.tenant_id = d.tenant_id AND r.domain_id = d.domain_id
                                 WHERE d.control_run_id = p_run_id OR d.corrects_run_id = p_run_id), '[]'::jsonb),
    'experiment', (SELECT jsonb_build_object('experiment_id', e.experiment_id, 'title', e.title, 'state', e.state) FROM simulation.experiments e WHERE e.run_id = p_run_id),
    'counts', jsonb_build_object(
      'packages', (SELECT count(DISTINCT pk.package_id) FROM pk),
      'analyses', (SELECT count(*) FROM simulation.sensitivity_analyses a WHERE a.run_id = p_run_id) + (SELECT count(DISTINCT x.derivation_id) FROM simulation.second_order_effects x WHERE x.run_id = p_run_id)
                  + (SELECT count(*) FROM simulation.probability_statements s WHERE s.run_id = p_run_id) + (SELECT count(*) FROM simulation.envelope_sweeps w WHERE w.run_id = p_run_id)
                  + (SELECT count(*) FROM simulation.benchmark_validations b WHERE b.run_id = p_run_id),
      'dependent_runs', (SELECT count(*) FROM simulation.runs_current d WHERE d.control_run_id = p_run_id OR d.corrects_run_id = p_run_id)))
  FROM r
$$;
GRANT EXECUTE ON FUNCTION simulation.sxp_retirement_reach(uuid) TO eye_app, eye_commit;

/* The NOTICE to the owner of a reached package (the sio_notify idiom: an attention item, open when the owner is an active human, else
   unrouted; its cause the retirement). Private. */
CREATE OR REPLACE FUNCTION simulation.sxp_notify(p_tenant uuid, p_domain uuid, p_class text, p_subject_kind text, p_subject_id uuid, p_title text, p_reasons jsonb, p_owner uuid,
                                                 p_cause uuid, p_cause_type text, p_details jsonb, p_due interval, p_actor uuid, p_correlation uuid) RETURNS uuid
SECURITY DEFINER SET search_path = executive, identity, decision, pg_catalog, pg_temp AS $$
DECLARE v_item uuid := gen_random_uuid(); v_state text; v_due timestamptz := clock_timestamp() + p_due;
BEGIN
  v_state := CASE WHEN p_owner IS NOT NULL AND decision.is_active_human(p_owner, p_tenant) THEN 'open' ELSE 'unrouted' END;
  INSERT INTO executive.attention_items (item_id, scope, tenant_id, domain_id, signal_class, subject_kind, subject_id, cause_event_id, cause_event_type, title, outcome, state, owner_principal_id, route_roles, evaluation, details, due_at, escalations, correlation_id)
  VALUES (v_item, 'DOMAIN', p_tenant, p_domain, p_class, p_subject_kind, p_subject_id, p_cause, p_cause_type, left(p_title, 512), 'material', v_state, p_owner, '{}',
          jsonb_build_object('outcome', 'material', 'reasons', p_reasons, 'policy_version', NULL, 'dimensions', jsonb_build_object('consequence', 'C2', 'confidence', 1)),
          coalesce(p_details, '{}'::jsonb) || jsonb_build_object('synthetic', true), v_due, 0, p_correlation);
  PERFORM executive.attention_event(v_item, p_tenant, p_domain, CASE v_state WHEN 'open' THEN 'item.routed' ELSE 'item.unrouted' END, p_actor,
            jsonb_build_object('outcome', 'material', 'reasons', p_reasons, 'policy_version', NULL, 'owner', p_owner, 'route_roles', '[]'::jsonb, 'due_at', v_due,
                               'cause_event_id', p_cause, 'cause_event_type', p_cause_type, 'unrouted', v_state = 'unrouted'), p_correlation);
  RETURN v_item;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION simulation.sxp_notify(uuid, uuid, text, text, uuid, text, jsonb, uuid, uuid, text, jsonb, interval, uuid, uuid) FROM PUBLIC;

/* The retirement written (private: both ports): the run's columns (written once — runs_immutable, the prelude's), the retirement row with
   the reach found now, each reached package's owner told (simulation.validity, subject the package). Answers the retirement. */
CREATE OR REPLACE FUNCTION simulation.sxp_retire(p_retirement_id uuid, p_kind text, r simulation.runs_current, p_experiment_id uuid, p_reason text, p_superseded_by uuid, p_actor uuid, p_correlation uuid)
RETURNS jsonb SECURITY DEFINER SET search_path = simulation, pg_catalog, pg_temp AS $$
DECLARE v_reach jsonb := '{}'::jsonb; v_notified jsonb := '[]'::jsonb; pkg record; v_item uuid; v_out simulation.retirements%ROWTYPE; v_at timestamptz := clock_timestamp();
BEGIN
  IF r.run_id IS NOT NULL THEN
    v_reach := coalesce(simulation.sxp_retirement_reach(r.run_id), '{}'::jsonb);
    IF r.retired_at IS NULL AND r.state IN ('completed', 'failed', 'partial') THEN
      UPDATE simulation.runs_current SET retired_at = v_at, retired_by = p_actor, retire_reason = btrim(p_reason) WHERE run_id = r.run_id;
    END IF;
  END IF;
  IF p_experiment_id IS NOT NULL THEN
    v_reach := v_reach || jsonb_build_object('experiment', (SELECT jsonb_build_object('experiment_id', e.experiment_id, 'title', e.title, 'state', e.state) FROM simulation.experiments e WHERE e.experiment_id = p_experiment_id));
  END IF;
  FOR pkg IN SELECT DISTINCT (x ->> 'package_id')::uuid AS package_id, x ->> 'title' AS title, nullif(x ->> 'owner', '')::uuid AS owner
               FROM jsonb_array_elements(coalesce(v_reach -> 'packages', '[]'::jsonb)) x LOOP
    v_item := simulation.sxp_notify(r.tenant_id, r.domain_id, 'simulation.validity', 'package', pkg.package_id,
                format('A simulation run your package cites was retired: %s', coalesce(pkg.title, pkg.package_id::text)),
                jsonb_build_array(format('run %s was retired: %s', r.run_id, btrim(p_reason)),
                                  CASE WHEN p_superseded_by IS NULL THEN 'no superseding run was named' ELSE format('it is superseded by run %s', p_superseded_by) END,
                                  'a retired run is no longer analysed nor taken as a control; cite the superseding run at the package''s next version'),
                pkg.owner, p_retirement_id, 'simulation.run_retired',
                jsonb_build_object('kind', 'run_retired', 'run_id', r.run_id, 'experiment_id', p_experiment_id, 'superseded_by', p_superseded_by, 'retirement_id', p_retirement_id),
                interval '7 days', p_actor, p_correlation);
    v_notified := v_notified || jsonb_build_object('package_id', pkg.package_id, 'owner', pkg.owner, 'attention_item_id', v_item);
  END LOOP;
  INSERT INTO simulation.retirements (retirement_id, scope, tenant_id, domain_id, subject_kind, run_id, experiment_id, reason, superseded_by, reach, notified, retired_by, retired_at, correlation_id)
  VALUES (p_retirement_id, 'DOMAIN', r.tenant_id, r.domain_id, p_kind, r.run_id, p_experiment_id, btrim(p_reason), p_superseded_by, v_reach, v_notified, p_actor, v_at, p_correlation)
  RETURNING * INTO v_out;
  RETURN to_jsonb(v_out) - 'scope' - 'correlation_id';
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION simulation.sxp_retire(uuid, text, simulation.runs_current, uuid, text, uuid, uuid, uuid) FROM PUBLIC;

/* RETIRE A RUN (simulation.retirement.run — human-gated): a FINISHED run (completed, partial or failed) of this domain, by a named, active
   human who is its operator, the twin's owner, a twin owner or the domain administrator, with a reason (≥ 8 characters) and, optionally,
   the run that supersedes it (a completed, unretired run of this domain). Refused: the acting principal (actor 403), a person not active
   or without that standing (authority 403), an unknown run or superseding run (404), an unfinished or an already retired run (state 409),
   the reason or a superseding run that is not usable (422). */
CREATE OR REPLACE FUNCTION simulation.retire_run(p_retirement_id uuid, p_tenant uuid, p_domain uuid, p_run_id uuid, p_reason text, p_superseded_by uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = simulation, twin, executive, decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r simulation.runs_current%ROWTYPE; s simulation.runs_current%ROWTYPE; v_twin_owner uuid; v_out jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['simulation.retirement.run']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'retirement rejected (actor): recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF NOT decision.is_active_human(p_actor, p_tenant) THEN RAISE EXCEPTION 'retirement rejected (authority): a run is retired by a named, active human' USING ERRCODE = '42501'; END IF;
  SELECT * INTO r FROM simulation.runs_current x WHERE x.run_id = p_run_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'retirement rejected (unknown_run): % is not a simulation run of this domain', p_run_id USING ERRCODE = '23503'; END IF;
  SELECT t.owner_principal_id INTO v_twin_owner FROM twin.twins_current t WHERE t.twin_id = r.twin_id;
  IF p_actor IS DISTINCT FROM r.operator_principal_id AND p_actor IS DISTINCT FROM v_twin_owner
     AND NOT executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['twin_owner', 'domain_admin', 'platform_admin']) THEN
    RAISE EXCEPTION 'retirement rejected (authority): a run is retired by its operator, its twin''s owner, a twin owner or the domain administrator' USING ERRCODE = '42501';
  END IF;
  IF r.state NOT IN ('completed', 'failed', 'partial') THEN
    RAISE EXCEPTION 'retirement rejected (state): run % is %; only a finished run (completed, partial or failed) is retired', p_run_id, r.state USING ERRCODE = '2F002';
  END IF;
  IF r.retired_at IS NOT NULL THEN RAISE EXCEPTION 'retirement rejected (state): run % was retired at % (%); a retirement is recorded once', p_run_id, r.retired_at, r.retire_reason USING ERRCODE = '2F002'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN RAISE EXCEPTION 'retirement rejected (reason): a retirement says why, in at least 8 characters' USING ERRCODE = '22023'; END IF;
  IF p_superseded_by IS NOT NULL THEN
    SELECT * INTO s FROM simulation.runs_current x WHERE x.run_id = p_superseded_by AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
    IF NOT FOUND THEN RAISE EXCEPTION 'retirement rejected (unknown_superseding_run): % is not a simulation run of this domain', p_superseded_by USING ERRCODE = '23503'; END IF;
    IF s.run_id = r.run_id OR s.state <> 'completed' OR s.retired_at IS NOT NULL OR s.validity = 'invalidated' THEN
      RAISE EXCEPTION 'retirement rejected (superseded_by): run % is not a completed, valid, unretired run other than the one retired (it is %)', p_superseded_by,
        s.state || CASE WHEN s.run_id = r.run_id THEN ', the same run' WHEN s.retired_at IS NOT NULL THEN ', retired' WHEN s.validity = 'invalidated' THEN ', invalidated' ELSE '' END USING ERRCODE = '22023';
    END IF;
  END IF;
  v_out := simulation.sxp_retire(p_retirement_id, 'run', r, NULL, p_reason, p_superseded_by, p_actor, p_correlation);
  RETURN v_out || jsonb_build_object('run', (SELECT jsonb_build_object('run_id', x.run_id, 'state', x.state, 'retired_at', x.retired_at, 'retired_by', x.retired_by, 'retire_reason', x.retire_reason)
                                               FROM simulation.runs_current x WHERE x.run_id = p_run_id));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION simulation.retire_run(uuid, uuid, uuid, uuid, text, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION simulation.retire_run(uuid, uuid, uuid, uuid, text, uuid, uuid, uuid) TO eye_commit;

/* RETIRE AN EXPERIMENT (simulation.retirement.experiment — human-gated): a FINISHED experiment (completed, partial, failed or cancelled), by
   a named, active human who is its declarer, its starter, a twin owner or the domain administrator, with a reason; its run — finished and
   not yet retired — is retired with it (the same reason, its reach recorded). The experiment's ledger: retired. Refused: the acting
   principal (actor 403), a person without that standing (authority 403), an unknown experiment (404), an experiment not finished or
   already retired (state 409), the reason (422). */
CREATE OR REPLACE FUNCTION simulation.retire_experiment(p_retirement_id uuid, p_tenant uuid, p_domain uuid, p_experiment_id uuid, p_reason text, p_actor uuid, p_event_id uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = simulation, executive, decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE e simulation.experiments%ROWTYPE; r simulation.runs_current%ROWTYPE; v_out jsonb; v_run_retired boolean := false; v_prior text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['simulation.retirement.experiment']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'retirement rejected (actor): recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF NOT decision.is_active_human(p_actor, p_tenant) THEN RAISE EXCEPTION 'retirement rejected (authority): an experiment is retired by a named, active human' USING ERRCODE = '42501'; END IF;
  SELECT * INTO e FROM simulation.experiments x WHERE x.experiment_id = p_experiment_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'retirement rejected (unknown_experiment): % is not an experiment of this domain', p_experiment_id USING ERRCODE = '23503'; END IF;
  IF p_actor IS DISTINCT FROM e.declared_by AND p_actor IS DISTINCT FROM e.started_by
     AND NOT executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['twin_owner', 'domain_admin', 'platform_admin']) THEN
    RAISE EXCEPTION 'retirement rejected (authority): an experiment is retired by its declarer, its starter, a twin owner or the domain administrator' USING ERRCODE = '42501';
  END IF;
  IF e.state = 'retired' THEN RAISE EXCEPTION 'retirement rejected (state): experiment % was retired at % (%); a retirement is recorded once', e.experiment_id, e.retirement ->> 'retired_at', e.retirement ->> 'reason' USING ERRCODE = '2F002'; END IF;
  IF e.state NOT IN ('completed', 'partial', 'failed', 'cancelled') THEN
    RAISE EXCEPTION 'retirement rejected (state): experiment % is %; only a finished experiment is retired (cancel a live one first)', e.experiment_id, e.state USING ERRCODE = '2F002';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN RAISE EXCEPTION 'retirement rejected (reason): a retirement says why, in at least 8 characters' USING ERRCODE = '22023'; END IF;
  v_prior := e.state;
  IF e.run_id IS NOT NULL THEN
    SELECT * INTO r FROM simulation.runs_current x WHERE x.run_id = e.run_id FOR UPDATE;
    v_run_retired := r.retired_at IS NULL AND r.state IN ('completed', 'failed', 'partial');
  ELSE
    r.tenant_id := p_tenant; r.domain_id := p_domain;   -- no run: the record carries the domain only
  END IF;
  v_out := simulation.sxp_retire(p_retirement_id, 'experiment', r, e.experiment_id, p_reason, NULL, p_actor, p_correlation);
  UPDATE simulation.experiments SET state = 'retired',
         retirement = jsonb_build_object('prior_state', v_prior, 'reason', btrim(p_reason), 'retired_by', p_actor, 'retired_at', v_out ->> 'retired_at', 'run_retired', v_run_retired, 'retirement_id', p_retirement_id)
   WHERE experiment_id = e.experiment_id RETURNING * INTO e;
  PERFORM simulation.sio_event(e, 'retired', p_actor, jsonb_build_object('reason', btrim(p_reason), 'prior_state', v_prior, 'run_id', e.run_id, 'run_retired', v_run_retired,
                                                                        'retirement_id', p_retirement_id, 'reach_counts', v_out -> 'reach' -> 'counts'), p_correlation, p_event_id);
  RETURN v_out || jsonb_build_object('experiment', simulation.sio_experiment_json(e));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION simulation.retire_experiment(uuid, uuid, uuid, uuid, text, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION simulation.retire_experiment(uuid, uuid, uuid, uuid, text, uuid, uuid, uuid) TO eye_commit;

/* THE GATES on a retired run (BEFORE INSERT; the siv_run_* precedent): it is no longer ANALYSED (B31's sensitivity analyses, second-order
   derivations, probability statements) — the analysis family's own refusal, class state — nor taken as an intervention run's CONTROL. */
CREATE OR REPLACE FUNCTION simulation.sxp_analysis_not_retired() RETURNS trigger
SECURITY DEFINER SET search_path = simulation, pg_catalog, pg_temp AS $$
DECLARE v_at timestamptz; v_reason text;
BEGIN
  SELECT r.retired_at, r.retire_reason INTO v_at, v_reason FROM simulation.runs_current r WHERE r.run_id = NEW.run_id;
  IF v_at IS NOT NULL THEN
    RAISE EXCEPTION 'impact analysis rejected (state): run % was retired at % (%); a retired result is not analysed — analyse the run that supersedes it', NEW.run_id, v_at, v_reason USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION simulation.sxp_analysis_not_retired() FROM PUBLIC;
CREATE TRIGGER sxp_sa_not_retired BEFORE INSERT ON simulation.sensitivity_analyses FOR EACH ROW EXECUTE FUNCTION simulation.sxp_analysis_not_retired();
CREATE TRIGGER sxp_soe_not_retired BEFORE INSERT ON simulation.second_order_effects FOR EACH ROW EXECUTE FUNCTION simulation.sxp_analysis_not_retired();
CREATE TRIGGER sxp_ps_not_retired BEFORE INSERT ON simulation.probability_statements FOR EACH ROW EXECUTE FUNCTION simulation.sxp_analysis_not_retired();

CREATE OR REPLACE FUNCTION simulation.sxp_run_control_not_retired() RETURNS trigger
SECURITY DEFINER SET search_path = simulation, pg_catalog, pg_temp AS $$
DECLARE v_at timestamptz; v_reason text;
BEGIN
  IF NEW.control_run_id IS NULL THEN RETURN NEW; END IF;
  SELECT r.retired_at, r.retire_reason INTO v_at, v_reason FROM simulation.runs_current r WHERE r.run_id = NEW.control_run_id;
  IF v_at IS NOT NULL THEN
    RAISE EXCEPTION 'run rejected (retired_control): control run % was retired at % (%); an intervention is compared against a control that is not retired', NEW.control_run_id, v_at, v_reason USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION simulation.sxp_run_control_not_retired() FROM PUBLIC;
CREATE TRIGGER sxp_run_control_not_retired BEFORE INSERT ON simulation.runs_current FOR EACH ROW EXECUTE FUNCTION simulation.sxp_run_control_not_retired();

-- §EX.5 NONLINEAR RESPONSE ACROSS THE ENVELOPE ─────────────────────────
/* Two numbers agree to the rule's rounding: six decimals, plus a binary floating-point error of a billionth of the larger magnitude. */
CREATE OR REPLACE FUNCTION simulation.sxp_close(a numeric, b numeric) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT a IS NOT NULL AND b IS NOT NULL AND abs(a - b) <= 0.000002 + 0.000000001 * greatest(abs(a), abs(b))
$$;

/* SWEEP THE ENVELOPE (simulation.sweep.run — a twin owner, a simulation operator, the domain administrator): RECORD the sweep the service
   executed with the pinned model over a completed valid run's stored contract (rule sxp-sweep@1). The port checks what a port can: the
   run (completed, valid, the outputs digest analysed, not retired), the method (supply-flow@1: the deterministic trajectory is its —
   a fabric method's sweep is not this rule's), every factor an envelope key swept over EXACTLY its envelope range on the declared grid
   (ascending, end points the bounds), and it RECOMPUTES each factor's nonlinearity from its grid and each pair's interaction from its
   corners — a stated figure that is not the grid's is refused; every pair of swept factors is present once. */
CREATE OR REPLACE FUNCTION simulation.sweep_envelope(p_sweep_id uuid, p_tenant uuid, p_domain uuid, p_run_id uuid, p_outputs_digest text, p_metric text, p_grid_points int, p_base numeric,
                                                     p_factors jsonb, p_interactions jsonb, p_digest text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = simulation, twin, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r simulation.runs_current%ROWTYPE; v_env jsonb; f jsonb; g jsonb; i int; n int; v_keys text[] := ARRAY[]::text[]; lo numeric; hi numeric; xs numeric[]; ms numeric[];
        v_span numeric; v_nl numeric; v_chord numeric; v_nonlinear int := 0; v_thr int := 0; t jsonb; x jsonb; a text; b text; ll numeric; lh numeric; hl numeric; hh numeric;
        v_ma numeric; v_mb numeric; v_int numeric; v_rel numeric; v_hidden int := 0; v_pairs int := 0; v_out simulation.envelope_sweeps%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['simulation.sweep.run']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'envelope sweep rejected (actor): a sweep is requested by the acting principal' USING ERRCODE = '42501'; END IF;
  r := simulation.sii_run_for_analysis('envelope sweep', p_tenant, p_domain, p_run_id, p_outputs_digest);
  IF r.retired_at IS NOT NULL THEN RAISE EXCEPTION 'envelope sweep rejected (state): run % was retired at % (%); a retired result is not swept', p_run_id, r.retired_at, r.retire_reason USING ERRCODE = '22023'; END IF;
  IF r.model_ref <> 'supply-flow@1' THEN
    RAISE EXCEPTION 'envelope sweep rejected (method): rule sxp-sweep@1 sweeps supply-flow@1''s deterministic trajectory; run % is %', p_run_id, r.model_ref USING ERRCODE = '22023';
  END IF;
  IF p_metric IS NULL OR p_metric NOT IN ('total_cost', 'line_stop_days', 'days_below_safety_stock') THEN RAISE EXCEPTION 'envelope sweep rejected (metric): the metric is total_cost, line_stop_days or days_below_safety_stock' USING ERRCODE = '22023'; END IF;
  IF p_grid_points IS NULL OR p_grid_points < 3 OR p_grid_points > 25 THEN RAISE EXCEPTION 'envelope sweep rejected (grid): a grid has 3 to 25 points' USING ERRCODE = '22023'; END IF;
  IF p_base IS NULL THEN RAISE EXCEPTION 'envelope sweep rejected (factors): the base value of the metric is stated' USING ERRCODE = '22023'; END IF;
  IF p_digest IS NULL OR p_digest !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'envelope sweep rejected (digest): the sweep carries its digest' USING ERRCODE = '22023'; END IF;
  SELECT m.operating_envelope INTO v_env FROM twin.behaviour_models m WHERE m.method_ref = r.model_ref;
  IF p_factors IS NULL OR jsonb_typeof(p_factors) <> 'array' OR jsonb_array_length(p_factors) = 0 THEN
    RAISE EXCEPTION 'envelope sweep rejected (factors): the model''s envelope names no factor the run''s contract carries; nothing to sweep' USING ERRCODE = '22023';
  END IF;
  n := 0;
  FOR f IN SELECT y FROM jsonb_array_elements(p_factors) y LOOP
    n := n + 1;
    IF jsonb_typeof(f) <> 'object' OR jsonb_typeof(f -> 'key') IS DISTINCT FROM 'string' OR jsonb_typeof(f -> 'grid') IS DISTINCT FROM 'array' OR jsonb_typeof(f -> 'range') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'envelope sweep rejected (factors): factor % names its key, its range and its grid', n USING ERRCODE = '22023';
    END IF;
    IF (f ->> 'key') = ANY (v_keys) THEN RAISE EXCEPTION 'envelope sweep rejected (factors): factor % is swept twice', f ->> 'key' USING ERRCODE = '22023'; END IF;
    v_keys := v_keys || (f ->> 'key');
    IF jsonb_typeof(v_env -> (f ->> 'key')) IS DISTINCT FROM 'array' OR jsonb_array_length(v_env -> (f ->> 'key')) <> 2 THEN
      RAISE EXCEPTION 'envelope sweep rejected (factors): % is not a range of the operating envelope of %', f ->> 'key', r.model_ref USING ERRCODE = '22023';
    END IF;
    lo := (v_env -> (f ->> 'key') ->> 0)::numeric; hi := (v_env -> (f ->> 'key') ->> 1)::numeric;
    IF NOT (simulation.sxp_close((f -> 'range' ->> 0)::numeric, lo) AND simulation.sxp_close((f -> 'range' ->> 1)::numeric, hi)) THEN
      RAISE EXCEPTION 'envelope sweep rejected (grid): % is swept over %, its envelope is [%, %]', f ->> 'key', f -> 'range', lo, hi USING ERRCODE = '22023';
    END IF;
    IF jsonb_array_length(f -> 'grid') <> p_grid_points THEN RAISE EXCEPTION 'envelope sweep rejected (grid): % carries % points, the sweep declares %', f ->> 'key', jsonb_array_length(f -> 'grid'), p_grid_points USING ERRCODE = '22023'; END IF;
    xs := ARRAY[]::numeric[]; ms := ARRAY[]::numeric[];
    FOR g IN SELECT y FROM jsonb_array_elements(f -> 'grid') y LOOP
      IF jsonb_typeof(g -> 'value') IS DISTINCT FROM 'number' OR jsonb_typeof(g -> 'metric') IS DISTINCT FROM 'number' THEN
        RAISE EXCEPTION 'envelope sweep rejected (grid): every grid point of % is {value, metric} with numbers', f ->> 'key' USING ERRCODE = '22023';
      END IF;
      xs := xs || (g ->> 'value')::numeric; ms := ms || (g ->> 'metric')::numeric;
    END LOOP;
    IF NOT simulation.sxp_close(xs[1], lo) OR NOT simulation.sxp_close(xs[p_grid_points], hi) THEN
      RAISE EXCEPTION 'envelope sweep rejected (grid): the grid of % runs from % to %, its envelope from % to %', f ->> 'key', xs[1], xs[p_grid_points], lo, hi USING ERRCODE = '22023';
    END IF;
    FOR i IN 2 .. p_grid_points LOOP
      IF xs[i] <= xs[i - 1] THEN RAISE EXCEPTION 'envelope sweep rejected (grid): the grid of % is not strictly ascending at point %', f ->> 'key', i USING ERRCODE = '22023'; END IF;
    END LOOP;
    -- the NONLINEARITY recomputed: the largest gap to the chord through the end points, as a share of the response's span
    SELECT max(v) - min(v) INTO v_span FROM unnest(ms) v;
    v_nl := 0;
    IF v_span > 0 THEN
      FOR i IN 1 .. p_grid_points LOOP
        v_chord := ms[1] + (ms[p_grid_points] - ms[1]) * (xs[i] - xs[1]) / (xs[p_grid_points] - xs[1]);
        v_nl := greatest(v_nl, abs(ms[i] - v_chord) / v_span);
      END LOOP;
    END IF;
    IF NOT simulation.sxp_close((f ->> 'nonlinearity')::numeric, round(v_nl, 6)) THEN
      RAISE EXCEPTION 'envelope sweep rejected (factors): % states a nonlinearity of %, its grid makes %', f ->> 'key', f ->> 'nonlinearity', round(v_nl, 6) USING ERRCODE = '22023';
    END IF;
    IF coalesce((f ->> 'nonlinear')::boolean, false) IS DISTINCT FROM (v_nl > 0.05) THEN
      RAISE EXCEPTION 'envelope sweep rejected (factors): % is stated %, its nonlinearity % makes it %', f ->> 'key', CASE WHEN (f ->> 'nonlinear')::boolean THEN 'nonlinear' ELSE 'linear' END, round(v_nl, 6),
        CASE WHEN v_nl > 0.05 THEN 'nonlinear' ELSE 'linear' END USING ERRCODE = '22023';
    END IF;
    IF v_nl > 0.05 THEN v_nonlinear := v_nonlinear + 1; END IF;
    IF jsonb_typeof(coalesce(f -> 'thresholds', '[]'::jsonb)) <> 'array' THEN RAISE EXCEPTION 'envelope sweep rejected (factors): the thresholds of % are a list', f ->> 'key' USING ERRCODE = '22023'; END IF;
    FOR t IN SELECT y FROM jsonb_array_elements(coalesce(f -> 'thresholds', '[]'::jsonb)) y LOOP
      IF coalesce(t ->> 'kind', '') NOT IN ('onset', 'saturation', 'kink') OR jsonb_typeof(t -> 'at') IS DISTINCT FROM 'number'
         OR NOT EXISTS (SELECT 1 FROM generate_series(2, p_grid_points - 1) k WHERE simulation.sxp_close(xs[k], (t ->> 'at')::numeric)) THEN
        RAISE EXCEPTION 'envelope sweep rejected (factors): a threshold of % is {kind (onset | saturation | kink), at — an interior point of its grid}', f ->> 'key' USING ERRCODE = '22023';
      END IF;
      v_thr := v_thr + 1;
    END LOOP;
  END LOOP;
  -- THE INTERACTIONS recomputed from their corners; every pair of swept factors once
  IF p_interactions IS NULL OR jsonb_typeof(p_interactions) <> 'array' THEN RAISE EXCEPTION 'envelope sweep rejected (interactions): the interactions are a list' USING ERRCODE = '22023'; END IF;
  FOR x IN SELECT y FROM jsonb_array_elements(p_interactions) y LOOP
    a := x -> 'factors' ->> 0; b := x -> 'factors' ->> 1;
    IF a IS NULL OR b IS NULL OR a = b OR NOT (a = ANY (v_keys)) OR NOT (b = ANY (v_keys)) OR jsonb_array_length(x -> 'factors') <> 2 THEN
      RAISE EXCEPTION 'envelope sweep rejected (interactions): an interaction names two distinct swept factors' USING ERRCODE = '22023';
    END IF;
    ll := (x -> 'corners' ->> 'll')::numeric; lh := (x -> 'corners' ->> 'lh')::numeric; hl := (x -> 'corners' ->> 'hl')::numeric; hh := (x -> 'corners' ->> 'hh')::numeric;
    IF ll IS NULL OR lh IS NULL OR hl IS NULL OR hh IS NULL THEN RAISE EXCEPTION 'envelope sweep rejected (interactions): the interaction of % × % carries its four corners', a, b USING ERRCODE = '22023'; END IF;
    v_ma := ((hl + hh) - (ll + lh)) / 2; v_mb := ((lh + hh) - (ll + hl)) / 2; v_int := hh - hl - lh + ll;
    v_rel := CASE WHEN greatest(abs(v_ma), abs(v_mb)) = 0 THEN CASE WHEN v_int = 0 THEN 0 ELSE 1 END ELSE abs(v_int) / greatest(abs(v_ma), abs(v_mb)) END;
    IF NOT simulation.sxp_close((x ->> 'interaction')::numeric, v_int) OR NOT simulation.sxp_close((x ->> 'relative')::numeric, round(v_rel, 6))
       OR coalesce((x ->> 'hidden_dependency')::boolean, false) IS DISTINCT FROM (v_rel > 0.1 AND v_int <> 0) THEN
      RAISE EXCEPTION 'envelope sweep rejected (interactions): % × % states interaction % (relative %, hidden %), its corners make % (relative %)', a, b, x ->> 'interaction', x ->> 'relative', x ->> 'hidden_dependency', v_int, round(v_rel, 6) USING ERRCODE = '22023';
    END IF;
    IF v_rel > 0.1 AND v_int <> 0 THEN v_hidden := v_hidden + 1; END IF;
    v_pairs := v_pairs + 1;
  END LOOP;
  IF v_pairs <> (cardinality(v_keys) * (cardinality(v_keys) - 1)) / 2
     OR (SELECT count(DISTINCT least(y -> 'factors' ->> 0, y -> 'factors' ->> 1) || '×' || greatest(y -> 'factors' ->> 0, y -> 'factors' ->> 1)) FROM jsonb_array_elements(p_interactions) y) <> v_pairs THEN
    RAISE EXCEPTION 'envelope sweep rejected (interactions): every pair of the % swept factors is crossed once (% given)', cardinality(v_keys), v_pairs USING ERRCODE = '22023';
  END IF;
  INSERT INTO simulation.envelope_sweeps (sweep_id, scope, tenant_id, domain_id, run_id, run_outputs_digest, model_ref, implementation_digest, metric, grid_points, envelope, base_value, factors,
                                          interactions, nonlinear_factors, thresholds, hidden_dependencies, rule, digest, synthetic_state, requested_by, correlation_id)
  VALUES (p_sweep_id, 'DOMAIN', p_tenant, p_domain, p_run_id, p_outputs_digest, r.model_ref, r.implementation_digest, p_metric, p_grid_points, v_env, p_base, p_factors,
          p_interactions, v_nonlinear, v_thr, v_hidden, 'sxp-sweep@1', p_digest, true, p_actor, p_correlation)
  RETURNING * INTO v_out;
  RETURN to_jsonb(v_out) - 'tenant_id' - 'domain_id' - 'scope' - 'correlation_id';
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION simulation.sweep_envelope(uuid, uuid, uuid, uuid, text, text, int, numeric, jsonb, jsonb, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION simulation.sweep_envelope(uuid, uuid, uuid, uuid, text, text, int, numeric, jsonb, jsonb, text, uuid, uuid) TO eye_commit;

-- §EX.6 RARE EVENTS, MODEL DISCREPANCY, BENCHMARK VALIDATION, CONVERGENCE ─
/* The values of one measure in a run's outputs, in path order: its seeded sample totals (supply-flow@1's, or a chunked fabric experiment's
   projected paths), else its single deterministic total. Null when the outputs carry no value of the measure. */
CREATE OR REPLACE FUNCTION simulation.sxp_run_values(p_outputs jsonb, p_measure text) RETURNS numeric[] LANGUAGE sql IMMUTABLE
SET search_path = simulation, pg_catalog, pg_temp AS $$
  SELECT CASE WHEN jsonb_typeof(p_outputs -> 'stochastic' -> 'sample_totals') = 'array' AND jsonb_array_length(p_outputs -> 'stochastic' -> 'sample_totals') > 0 THEN
           (SELECT array_agg(CASE WHEN p_measure = 'total_cost' THEN (t -> 'cost' ->> 'total')::numeric ELSE (t ->> p_measure)::numeric END ORDER BY o)
              FROM jsonb_array_elements(p_outputs -> 'stochastic' -> 'sample_totals') WITH ORDINALITY q(t, o))
         WHEN jsonb_typeof(p_outputs -> 'totals') = 'object' THEN
           ARRAY[CASE WHEN p_measure = 'total_cost' THEN (p_outputs -> 'totals' -> 'cost' ->> 'total')::numeric ELSE (p_outputs -> 'totals' ->> p_measure)::numeric END]
         ELSE NULL END
$$;

/* VALIDATE AGAINST A BENCHMARK (simulation.benchmark.validate — a twin owner, a simulation operator, the domain administrator, a method
   steward): RECORD the validation (rule sxp-benchmark@1). The port RECOMPUTES from the run's stored paths and the entered sample: the
   counts, the means, the bias, the relative bias, the KS distance and its critical value, the run's p05–p95 band and the benchmark's share
   inside it, the tail threshold (declared, else the benchmark's p95) and both tail frequencies — every stated figure must be these; the
   VERDICT is the port's. The convergence (the running mean at every tenth of the paths) is checked at its end: the paths and the mean are
   the run's. An observed sample cites the evidence it was read from (each cited object of this tenant); a benchmark states its basis. */
CREATE OR REPLACE FUNCTION simulation.validate_benchmark(p_validation_id uuid, p_tenant uuid, p_domain uuid, p_run_id uuid, p_outputs_digest text, p_measure text, p_kind text, p_benchmark jsonb,
                                                         p_tolerance numeric, p_tail_threshold numeric, p_discrepancy jsonb, p_tail jsonb, p_convergence jsonb, p_digest text,
                                                         p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = simulation, objects, twin, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r simulation.runs_current%ROWTYPE; v_run numeric[]; v_b numeric[]; n int; m int; v_rm numeric; v_bm numeric; v_bias numeric; v_rel numeric; v_ks numeric; v_crit numeric;
        v_p05 numeric; v_p95 numeric; v_cov numeric; v_thr numeric; v_rf numeric; v_bf numeric; v_ratio numeric; v_tailv text; v_verdict text; c jsonb; v_last jsonb;
        v_disc jsonb; v_tail jsonb; v_out simulation.benchmark_validations%ROWTYPE; k text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['simulation.benchmark.validate']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'benchmark validation rejected (actor): a validation is requested by the acting principal' USING ERRCODE = '42501'; END IF;
  r := simulation.sii_run_for_analysis('benchmark validation', p_tenant, p_domain, p_run_id, p_outputs_digest);
  IF r.retired_at IS NOT NULL THEN RAISE EXCEPTION 'benchmark validation rejected (state): run % was retired at % (%); a retired result is not validated', p_run_id, r.retired_at, r.retire_reason USING ERRCODE = '22023'; END IF;
  IF p_measure IS NULL OR p_measure NOT IN ('total_cost', 'line_stop_days', 'days_below_safety_stock') THEN RAISE EXCEPTION 'benchmark validation rejected (measure): the measure is total_cost, line_stop_days or days_below_safety_stock' USING ERRCODE = '22023'; END IF;
  v_run := simulation.sxp_run_values(r.outputs, p_measure);
  IF v_run IS NULL OR cardinality(v_run) = 0 OR EXISTS (SELECT 1 FROM unnest(v_run) v WHERE v IS NULL) THEN
    RAISE EXCEPTION 'benchmark validation rejected (measure): the outputs of run % carry no % for every path', p_run_id, p_measure USING ERRCODE = '22023';
  END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('observed', 'benchmark') THEN RAISE EXCEPTION 'benchmark validation rejected (kind): the comparison is against an observed or a benchmark sample' USING ERRCODE = '22023'; END IF;
  IF p_benchmark IS NULL OR jsonb_typeof(p_benchmark -> 'values') IS DISTINCT FROM 'array' OR jsonb_array_length(p_benchmark -> 'values') = 0 OR jsonb_array_length(p_benchmark -> 'values') > 10000
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_benchmark -> 'values') x WHERE jsonb_typeof(x) <> 'number') THEN
    RAISE EXCEPTION 'benchmark validation rejected (benchmark): the sample is 1 to 10000 numbers' USING ERRCODE = '22023';
  END IF;
  IF length(btrim(coalesce(p_benchmark ->> 'basis', ''))) < 16 THEN RAISE EXCEPTION 'benchmark validation rejected (basis): the sample states its basis (at least 16 characters)' USING ERRCODE = '22023'; END IF;
  IF p_kind = 'observed' THEN
    IF jsonb_typeof(p_benchmark -> 'citations') IS DISTINCT FROM 'array' OR jsonb_array_length(p_benchmark -> 'citations') = 0 OR NOT twin.citations_ok(p_benchmark -> 'citations')
       OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_benchmark -> 'citations') x WHERE x ->> 'kind' NOT IN ('evidence', 'claim')) THEN
      RAISE EXCEPTION 'benchmark validation rejected (citations): an observed sample cites the evidence or claims it was read from ({kind, id, version, digest})' USING ERRCODE = '22023';
    END IF;
    FOR c IN SELECT x FROM jsonb_array_elements(p_benchmark -> 'citations') x LOOP
      IF NOT EXISTS (SELECT 1 FROM objects.canonical_objects o WHERE o.object_id = (c ->> 'id')::uuid AND o.object_version = (c ->> 'version')::bigint AND o.tenant_id = p_tenant) THEN
        RAISE EXCEPTION 'benchmark validation rejected (unknown_citation): % % version % is not an object of this tenant', c ->> 'kind', c ->> 'id', c ->> 'version' USING ERRCODE = '23503';
      END IF;
    END LOOP;
  END IF;
  IF p_tolerance IS NULL OR p_tolerance <= 0 OR p_tolerance > 1 THEN RAISE EXCEPTION 'benchmark validation rejected (tolerance): the tolerance is a fraction in (0, 1]' USING ERRCODE = '22023'; END IF;
  IF p_digest IS NULL OR p_digest !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'benchmark validation rejected (digest): the validation carries its digest' USING ERRCODE = '22023'; END IF;
  SELECT array_agg((x #>> '{}')::numeric ORDER BY o) INTO v_b FROM jsonb_array_elements(p_benchmark -> 'values') WITH ORDINALITY q(x, o);
  n := cardinality(v_run); m := cardinality(v_b);
  -- THE DISCREPANCY, recomputed
  SELECT avg(v) INTO v_rm FROM unnest(v_run) v;
  SELECT avg(v) INTO v_bm FROM unnest(v_b) v;
  v_bias := v_rm - v_bm;
  v_rel := CASE WHEN v_bm = 0 THEN NULL ELSE v_bias / abs(v_bm) END;
  WITH u AS (SELECT v, 1 AS a, 0 AS b FROM unnest(v_run) v UNION ALL SELECT v, 0, 1 FROM unnest(v_b) v),
       cdf AS (SELECT sum(a) OVER w AS ca, sum(b) OVER w AS cb FROM u WINDOW w AS (ORDER BY v RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW))
  SELECT max(abs(ca::numeric / n - cb::numeric / m)) INTO v_ks FROM cdf;
  v_crit := 1.358 * sqrt((n + m)::numeric / (n::numeric * m));
  SELECT percentile_cont(0.05) WITHIN GROUP (ORDER BY v), percentile_cont(0.95) WITHIN GROUP (ORDER BY v) INTO v_p05, v_p95 FROM unnest(v_run) v;
  SELECT count(*) FILTER (WHERE v >= v_p05 AND v <= v_p95)::numeric / m INTO v_cov FROM unnest(v_b) v;
  v_disc := jsonb_build_object('run_paths', n, 'benchmark_n', m, 'run_mean', round(v_rm, 6), 'benchmark_mean', round(v_bm, 6), 'bias', round(v_bias, 6),
                               'relative_bias', CASE WHEN v_rel IS NULL THEN NULL ELSE round(v_rel, 6) END, 'ks', round(v_ks, 6), 'ks_critical', round(v_crit, 6),
                               'band', jsonb_build_array(round(v_p05::numeric, 6), round(v_p95::numeric, 6)), 'coverage_in_band', round(v_cov, 6));
  -- THE TAIL (rare events), recomputed
  v_thr := coalesce(p_tail_threshold, (SELECT percentile_cont(0.95) WITHIN GROUP (ORDER BY v) FROM unnest(v_b) v));
  SELECT count(*) FILTER (WHERE v >= v_thr)::numeric / n INTO v_rf FROM unnest(v_run) v;
  SELECT count(*) FILTER (WHERE v >= v_thr)::numeric / m INTO v_bf FROM unnest(v_b) v;
  v_ratio := CASE WHEN v_bf = 0 THEN NULL ELSE v_rf / v_bf END;
  v_tailv := CASE WHEN v_bf = 0 AND v_rf = 0 THEN 'covered' WHEN v_bf = 0 THEN 'over_represented'
                  WHEN n * v_bf < 5 THEN 'insufficient_paths' WHEN v_ratio < 0.5 THEN 'under_represented' WHEN v_ratio > 2 THEN 'over_represented' ELSE 'covered' END;
  v_tail := jsonb_build_object('threshold', round(v_thr::numeric, 6), 'threshold_basis', CASE WHEN p_tail_threshold IS NULL THEN 'the benchmark''s p95' ELSE 'declared' END,
                               'run_frequency', round(v_rf, 6), 'benchmark_frequency', round(v_bf, 6), 'ratio', CASE WHEN v_ratio IS NULL THEN NULL ELSE round(v_ratio, 6) END,
                               'run_tail_paths', (SELECT count(*) FROM unnest(v_run) v WHERE v >= v_thr), 'expected_tail_paths', round(n * v_bf, 6), 'verdict', v_tailv);
  -- every stated figure must be the port's
  IF p_discrepancy IS NULL OR p_tail IS NULL THEN RAISE EXCEPTION 'benchmark validation rejected (discrepancy): the validation states its discrepancy and its tail' USING ERRCODE = '22023'; END IF;
  FOREACH k IN ARRAY ARRAY['run_mean', 'benchmark_mean', 'bias', 'ks', 'ks_critical', 'coverage_in_band'] LOOP
    IF NOT simulation.sxp_close((p_discrepancy ->> k)::numeric, (v_disc ->> k)::numeric) THEN
      RAISE EXCEPTION 'benchmark validation rejected (discrepancy): % is stated %, the run''s paths and the sample make %', k, coalesce(p_discrepancy ->> k, '<none>'), v_disc ->> k USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF (p_discrepancy -> 'relative_bias' IS NULL OR jsonb_typeof(p_discrepancy -> 'relative_bias') = 'null') IS DISTINCT FROM (v_rel IS NULL)
     OR (v_rel IS NOT NULL AND NOT simulation.sxp_close((p_discrepancy ->> 'relative_bias')::numeric, round(v_rel, 6))) THEN
    RAISE EXCEPTION 'benchmark validation rejected (discrepancy): relative_bias is stated %, the run''s paths and the sample make %', coalesce(p_discrepancy ->> 'relative_bias', 'null'), coalesce(round(v_rel, 6)::text, 'null') USING ERRCODE = '22023';
  END IF;
  FOREACH k IN ARRAY ARRAY['threshold', 'run_frequency', 'benchmark_frequency'] LOOP
    IF NOT simulation.sxp_close((p_tail ->> k)::numeric, (v_tail ->> k)::numeric) THEN
      RAISE EXCEPTION 'benchmark validation rejected (tail): % is stated %, the run''s paths and the sample make %', k, coalesce(p_tail ->> k, '<none>'), v_tail ->> k USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF coalesce(p_tail ->> 'verdict', '') <> v_tailv THEN RAISE EXCEPTION 'benchmark validation rejected (tail): the tail is stated %, its frequencies make it %', coalesce(p_tail ->> 'verdict', '<none>'), v_tailv USING ERRCODE = '22023'; END IF;
  -- THE CONVERGENCE: its last checkpoint is the run's whole path count and mean
  IF p_convergence IS NULL OR jsonb_typeof(p_convergence -> 'checkpoints') IS DISTINCT FROM 'array' OR coalesce(p_convergence ->> 'verdict', '') NOT IN ('converged', 'not_converged', 'not_applicable') THEN
    RAISE EXCEPTION 'benchmark validation rejected (convergence): the convergence states its checkpoints and its verdict (converged | not_converged | not_applicable)' USING ERRCODE = '22023';
  END IF;
  IF n = 1 THEN
    IF p_convergence ->> 'verdict' <> 'not_applicable' THEN RAISE EXCEPTION 'benchmark validation rejected (convergence): a single deterministic path has no convergence (not_applicable)' USING ERRCODE = '22023'; END IF;
  ELSE
    v_last := p_convergence -> 'checkpoints' -> (jsonb_array_length(p_convergence -> 'checkpoints') - 1);
    IF v_last IS NULL OR (v_last ->> 'paths')::int IS DISTINCT FROM n OR NOT simulation.sxp_close((v_last ->> 'mean')::numeric, round(v_rm, 6)) THEN
      RAISE EXCEPTION 'benchmark validation rejected (convergence): the last checkpoint is the run''s % paths and its mean %', n, round(v_rm, 6) USING ERRCODE = '22023';
    END IF;
  END IF;
  v_verdict := CASE WHEN m < 5 OR (r.stochastic_mode = 'seeded' AND n < 30) THEN 'insufficient'
                    WHEN (v_rel IS NOT NULL AND abs(v_rel) > p_tolerance) OR (v_rel IS NULL AND abs(v_bias) > p_tolerance) OR v_ks > v_crit OR v_tailv = 'under_represented' THEN 'discrepant'
                    ELSE 'consistent' END;
  INSERT INTO simulation.benchmark_validations (validation_id, scope, tenant_id, domain_id, run_id, run_outputs_digest, model_ref, measure, benchmark_kind, benchmark, benchmark_digest, run_paths,
                                                benchmark_n, tolerance, discrepancy, tail, convergence, verdict, rule, digest, synthetic_state, requested_by, correlation_id)
  VALUES (p_validation_id, 'DOMAIN', p_tenant, p_domain, p_run_id, p_outputs_digest, r.model_ref, p_measure, p_kind,
          jsonb_build_object('values', p_benchmark -> 'values', 'basis', btrim(p_benchmark ->> 'basis'), 'citations', coalesce(p_benchmark -> 'citations', '[]'::jsonb)),
          encode(sha256(convert_to((p_benchmark -> 'values')::text, 'UTF8')), 'hex'), n, m, p_tolerance, v_disc, v_tail,
          p_convergence, v_verdict, 'sxp-benchmark@1', p_digest, true, p_actor, p_correlation)
  RETURNING * INTO v_out;
  RETURN to_jsonb(v_out) - 'tenant_id' - 'domain_id' - 'scope' - 'correlation_id';
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION simulation.validate_benchmark(uuid, uuid, uuid, uuid, text, text, text, jsonb, numeric, numeric, jsonb, jsonb, jsonb, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION simulation.validate_benchmark(uuid, uuid, uuid, uuid, text, text, text, jsonb, numeric, numeric, jsonb, jsonb, jsonb, text, uuid, uuid) TO eye_commit;

-- §EX.7 THE READS (invoker, under the caller's RLS) ─────────────────────
/* The fabric overview of the domain: the chunkable methods with their adapter health, the experiments (their policy, checkpoint actions,
   retirement), the retirements, the sweeps and the validations — newest first, bounded. */
CREATE OR REPLACE FUNCTION simulation.fabric_overview(p_limit int) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = simulation, twin, pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object(
    'methods', (SELECT coalesce(jsonb_agg(jsonb_build_object('method_ref', m.method_ref, 'family', m.family, 'containment', m.containment, 'operating_envelope', m.operating_envelope,
                                                             'health', (SELECT jsonb_build_object('state', h.state, 'quarantined_at', h.quarantined_at, 'last_fault', h.last_fault, 'reinstated_at', h.reinstated_at)
                                                                          FROM simulation.adapter_health h WHERE h.model_ref = m.method_ref LIMIT 1)) ORDER BY m.method_ref), '[]'::jsonb)
                  FROM twin.behaviour_models m WHERE m.method_ref = ANY (simulation.sio_chunkable_methods())),
    'experiments', (SELECT coalesce(jsonb_agg(x.j ORDER BY x.declared_at DESC), '[]'::jsonb) FROM (
                      SELECT jsonb_build_object('experiment_id', e.experiment_id, 'title', e.title, 'method_ref', e.method_ref, 'state', e.state, 'on_unstable', e.on_unstable, 'paths', e.paths,
                                                'chunk_size', e.chunk_size, 'progress', e.progress, 'run_id', e.run_id, 'retirement', e.retirement, 'outcome', e.outcome,
                                                'actions', (SELECT coalesce(jsonb_agg(jsonb_build_object('event', v.event, 'details', v.details, 'occurred_at', v.occurred_at) ORDER BY v.occurred_at, v.event_id), '[]'::jsonb)
                                                              FROM simulation.experiment_events v WHERE v.experiment_id = e.experiment_id
                                                               AND v.event IN ('policy_set', 'stopped_unstable', 'paused_unstable', 'adapter_quarantined', 'review_routed', 'retired', 'stopped_quarantined')),
                                                'last_indicators', e.indicators, 'synthetic', true) AS j, e.declared_at
                        FROM simulation.experiments e ORDER BY e.declared_at DESC LIMIT greatest(1, least(coalesce(p_limit, 50), 200))) x),
    'retirements', (SELECT coalesce(jsonb_agg(to_jsonb(t) - 'scope' - 'correlation_id' ORDER BY t.retired_at DESC), '[]'::jsonb)
                      FROM (SELECT * FROM simulation.retirements ORDER BY retired_at DESC LIMIT greatest(1, least(coalesce(p_limit, 50), 200))) t),
    'sweeps', (SELECT coalesce(jsonb_agg(to_jsonb(w) - 'scope' - 'correlation_id' ORDER BY w.swept_at DESC), '[]'::jsonb)
                 FROM (SELECT * FROM simulation.envelope_sweeps ORDER BY swept_at DESC LIMIT greatest(1, least(coalesce(p_limit, 50), 200))) w),
    'validations', (SELECT coalesce(jsonb_agg(to_jsonb(b) - 'scope' - 'correlation_id' ORDER BY b.validated_at DESC), '[]'::jsonb)
                      FROM (SELECT * FROM simulation.benchmark_validations ORDER BY validated_at DESC LIMIT greatest(1, least(coalesce(p_limit, 50), 200))) b),
    'synthetic', true)
$$;
/* One run's retirement standing: its columns, its retirement record (if any) and its reach as it stands now. */
CREATE OR REPLACE FUNCTION simulation.run_retirement(p_run_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = simulation, pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object('run_id', r.run_id, 'state', r.state, 'model_ref', r.model_ref, 'retired_at', r.retired_at, 'retired_by', r.retired_by, 'retire_reason', r.retire_reason,
                            'retirement', (SELECT to_jsonb(t) - 'scope' - 'correlation_id' FROM simulation.retirements t WHERE t.run_id = r.run_id ORDER BY t.retired_at DESC LIMIT 1),
                            'reach', simulation.sxp_retirement_reach(r.run_id),
                            'sweeps', (SELECT coalesce(jsonb_agg(to_jsonb(w) - 'scope' - 'correlation_id' ORDER BY w.swept_at DESC), '[]'::jsonb) FROM simulation.envelope_sweeps w WHERE w.run_id = r.run_id),
                            'validations', (SELECT coalesce(jsonb_agg(to_jsonb(b) - 'scope' - 'correlation_id' ORDER BY b.validated_at DESC), '[]'::jsonb) FROM simulation.benchmark_validations b WHERE b.run_id = r.run_id))
    FROM simulation.runs_current r WHERE r.run_id = p_run_id
$$;
GRANT EXECUTE ON FUNCTION simulation.fabric_overview(int), simulation.run_retirement(uuid), simulation.sxp_run_values(jsonb, text), simulation.sxp_chunk_aggregate(jsonb, text[]),
                          simulation.sxp_unstable_reading(jsonb, jsonb, jsonb), simulation.sxp_close(numeric, numeric) TO eye_app, eye_commit;
