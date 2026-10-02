-- 0090 — CP-6 B34 (2026-09-28/29): DURABLE WORKFLOW, HUMAN GATES AND COMMITMENTS — the durable workflow engine, the human-task service and
-- collaboration with external collaborators (F-P6-14); human gate completeness (F-P6-04); the commitment tracker and the governed execution
-- handoff (F-P6-05); the attention completion (F-P6-07); the remainder of risk and opportunity intelligence (F-P4-13).
--
-- One migration in seven sections, the prelude written first by the integrator, the five parts built and proven on their own in parallel
-- worktrees (their harnesses phase6-{attention,commitments,exposures,gates,workflow}-b34), then combined here — no function is re-declared
-- by two sections:
--   §0  the prelude: the roles (execution_authority, external_collaborator, commitment_subscriber); the external collaborator's marker
--       (executive.external_principals — the frozen Phase 0 identity schema untouched) and decision.is_active_human for MEMBERS only; the
--       decision states deferred / information_requested, the package event union, decision_class / board; THE HUMAN-TASK SERVICE CORE
--       (tasks, assignments, events, timers; _open / _resolve / _cancel_human_tasks, _schedule_timer); the attention classes, subject kinds,
--       act events and channels; the three outbox events and the commitments consumer kind; the commitment item's signal contract
--   §A  (attention, F-P6-07) the new classes' dimensions from the records, the act registry and the act ports, ranking fairness in the queue
--       evaluation, the synthetic email / SMS / Teams channels in the policy validator and the delivery plan
--   §C  (commitments, F-P6-05) the tracker (items, exceptions, the deadline sweep), the governed execution gateway (targets, handoffs,
--       attempts, effects, residuals, compensations, reconciliation), the execution timeline, closure with the reviewer's co-sign,
--       graph.revise_objective and the re-tasking consumer; close_package re-declared
--   §X  (exposures, F-P4-13) taxonomy activation, the canonical polarity, scenarios linked, the outcome loop, holds and detections, the
--       further dimensions and concentration, owner resolution
--   §G  (gates, F-P6-04) typed approval conditions and the hold, defer / reject / request-for-information, overrides (normal and
--       emergency), delegation, decision-ready, the consequence preview, the board class, control decisions linked to replay
--   §W  (workflow, F-P6-14) versioned definitions, instances, the transition log, timers fired by the tick, compensation and resumption,
--       drills, the task routes, collaboration workspaces, external collaborators bounded by grants
--   §I  the integrator: the commitment breach's act
-- The interface register stays 50/0/0 (B34 adds no interface). Forward-only; nothing earlier is edited.

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- section `prelude`
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0090 §0 — CP-6 B34 PRELUDE (the integrator, 2026-09-28): the shared vocabulary the five B34 parts build on, written FIRST so no two
-- parts re-declare the same object. F-P6-14 (durable workflow, human tasks, collaboration), F-P6-04 (human gate completeness), F-P6-05
-- (the commitment tracker and the governed execution handoff), F-P6-07 (the attention completion) and F-P4-13's remainder (risk and
-- opportunity). What is declared here, and nothing else:
--   * roles: execution_authority (issues a governed execution handoff), external_collaborator (a partner's person, bounded by a grant),
--     commitment_subscriber (the commitments consumer of GraphChanged);
--   * identity: an EXTERNAL collaborator is marked in executive.external_principals (the Phase 0 identity schema is frozen by C14 and is not
--     altered); executive.principal_affiliation(p); decision.is_active_human re-declared (0041:266) to admit MEMBERS only — an
--     external collaborator is never an approver, committer, room member, action owner or escalation target;
--   * decision vocabulary: the version and package states `deferred`, `information_requested`; the package event CHECK as the UNION of
--     every B34 part's events; the package's decision_class (standard|board) and board columns;
--   * THE HUMAN-TASK SERVICE CORE: the task and timer tables, the kinds, and four INTERNAL definer ports (_open_human_task,
--     _resolve_human_tasks, _cancel_human_tasks, _schedule_timer) — callable only from other definer ports, which assert their own
--     bound action; the timers FIRE in the workflow part's tick step;
--   * attention vocabulary: four signal classes, three subject kinds, the item events item.acted / item.act_refused, the delivery
--     channels email / sms / teams (synthetic, local sinks only);
--   * subscription vocabulary: the events ExposureChanged, HealthScoreChanged, CommitmentChanged (outbox, emitted from the owning TS
--     routes); the consumer kind `commitments` (GraphChanged).
-- Forward-only; 0084–0089 untouched.

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §0.1 ROLES
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
INSERT INTO identity.roles (code, scope, description) VALUES
  ('execution_authority', 'DOMAIN', 'Issues a governed execution handoff to a registered execution target (B34): a named human, never the drafter nor the decision''s committer'),
  ('external_collaborator', 'DOMAIN', 'A partner firm''s person invited to a collaboration workspace (B34): acts only inside a live grant — its purpose, its audience ceiling and its expiry'),
  ('commitment_subscriber', 'DOMAIN', 'The commitments subscription consumer (B34): re-tasks the commitment items of a changed objective — exactly decision.commitment.subscription.apply')
ON CONFLICT (code) DO NOTHING;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §0.2 IDENTITY: members and external collaborators
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- The Phase 0 identity schema is FROZEN (the C14 matrix at 0021; the upgrade proof refuses a column added to identity.principals): the
-- marker of an EXTERNAL collaborator is a B34 row keyed by the principal. Every other principal is a MEMBER.
CREATE TABLE executive.external_principals (
  principal_id    uuid PRIMARY KEY,
  scope           text NOT NULL,
  tenant_id       uuid NOT NULL,
  domain_id       uuid NOT NULL,
  invited_by      uuid NOT NULL,
  reason          text NOT NULL CHECK (length(btrim(reason)) >= 8),
  created_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id  uuid NOT NULL,
  CONSTRAINT xep_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON executive.external_principals FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
REVOKE ALL ON executive.external_principals FROM PUBLIC;
ALTER TABLE executive.external_principals ENABLE ROW LEVEL SECURITY;
ALTER TABLE executive.external_principals FORCE ROW LEVEL SECURITY;
CREATE POLICY executive_isolation ON executive.external_principals
  USING (tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain()));
GRANT SELECT ON executive.external_principals TO eye_app, eye_commit;

CREATE OR REPLACE FUNCTION executive.principal_affiliation(p_principal uuid) RETURNS text
STABLE SECURITY DEFINER SET search_path = executive, pg_catalog, pg_temp AS $$
  SELECT CASE WHEN EXISTS (SELECT 1 FROM executive.external_principals x WHERE x.principal_id = p_principal) THEN 'external' ELSE 'member' END;
$$ LANGUAGE sql;
REVOKE ALL ON FUNCTION executive.principal_affiliation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.principal_affiliation(uuid) TO eye_app, eye_commit;

-- 0041:266's body with ONE condition: a MEMBER. An external collaborator (a partner's person) is a human and is attributed as one, but
-- holds no standing a member holds: every port that asks is_active_human (approvers, committers, room members, action owners, owners
-- and escalation targets) refuses them without being edited.
CREATE OR REPLACE FUNCTION decision.is_active_human(p_principal uuid, p_tenant uuid) RETURNS boolean
STABLE SECURITY DEFINER SET search_path = identity, pg_catalog, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM identity.principals p WHERE p.id = p_principal AND p.kind = 'human' AND p.status = 'active' AND p.tenant_id = p_tenant
                                                         AND NOT EXISTS (SELECT 1 FROM executive.external_principals x WHERE x.principal_id = p.id));
$$ LANGUAGE sql;
REVOKE ALL ON FUNCTION decision.is_active_human(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.is_active_human(uuid, uuid) TO eye_app, eye_commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §0.3 DECISION VOCABULARY
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
ALTER TABLE decision.package_versions DROP CONSTRAINT package_versions_state_check;
ALTER TABLE decision.package_versions ADD CONSTRAINT package_versions_state_check
  CHECK (state IN ('draft', 'proposed', 'under_review', 'approved', 'committed', 'rejected', 'superseded',
                   -- B34 (0090): the gate's defer and request-for-information (F-P6-04)
                   'deferred', 'information_requested'));
ALTER TABLE decision.packages_current DROP CONSTRAINT packages_current_state_check;
ALTER TABLE decision.packages_current ADD CONSTRAINT packages_current_state_check
  CHECK (state IN ('draft', 'proposed', 'under_review', 'approved', 'committed', 'monitoring', 'closed', 'rejected', 'withdrawn', 'reopened',
                   -- B34 (0090)
                   'deferred', 'information_requested'));
ALTER TABLE decision.package_events DROP CONSTRAINT package_events_event_check;
ALTER TABLE decision.package_events ADD CONSTRAINT package_events_event_check CHECK (event IN (
  'package.declared', 'version.opened', 'option.set', 'terms.set', 'choice.set', 'dissent.recorded', 'version.proposed',
  'review.recorded', 'version.approved', 'approval.revoked', 'version.rejected', 'package.committed', 'package.withdrawn',
  'outcome.recorded', 'package.closed', 'commit.refused', 'replay.recorded', 'condition.breached', 'review.overdue', 'input.invalidated', 'package.reopened',
  'policy.changed',
  -- B24 (0086) markers
  'source_impact.acknowledged',
  -- B34 (0090) the gates (F-P6-04)
  'commit.held', 'commit.previewed', 'approval_condition.failed', 'gate.reviewed', 'gate.acknowledged', 'version.ready', 'version.deferred',
  'version.information_requested', 'version.resumed', 'version.rejected_by_owner', 'override.granted', 'override.reviewed',
  'approval_delegation.granted', 'approval_delegation.ended', 'approval_delegation.reassigned', 'package.class_reserved', 'control.recorded',
  -- B34 (0090) the commitments (F-P6-05)
  'commitment.item_opened', 'commitment.exception', 'execution.handoff_issued', 'execution.partial_effect', 'commitment.closed'));

ALTER TABLE decision.packages_current ADD COLUMN IF NOT EXISTS decision_class text NOT NULL DEFAULT 'standard';
ALTER TABLE decision.packages_current ADD COLUMN IF NOT EXISTS board jsonb;
ALTER TABLE decision.packages_current DROP CONSTRAINT IF EXISTS packages_current_decision_class_check;
ALTER TABLE decision.packages_current ADD CONSTRAINT packages_current_decision_class_check CHECK (decision_class IN ('standard', 'board'));
ALTER TABLE decision.packages_current DROP CONSTRAINT IF EXISTS dpk_board_shape;
ALTER TABLE decision.packages_current ADD CONSTRAINT dpk_board_shape CHECK ((decision_class = 'board') = (board IS NOT NULL) AND (board IS NULL OR jsonb_typeof(board) = 'object'));

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §0.4 THE HUMAN-TASK SERVICE CORE (F-P6-14; used by the gates and the commitments parts)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION executive.human_task_kinds() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY[
  'gate.approve', 'gate.review', 'gate.delegated_approval', 'gate.override_review', 'gate.ready_review',
  'commitment.accept', 'commitment.checkpoint', 'commitment.renegotiate', 'commitment.compensation',
  'collab.review', 'collab.contribute',
  'workflow.irreconcilable', 'workflow.compensation_confirm'] $$;
CREATE OR REPLACE FUNCTION executive.task_subject_kinds() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY[
  'decision_package', 'decision_version', 'gate', 'commitment', 'commitment_item', 'execution_handoff', 'workspace', 'workflow_instance'] $$;
CREATE OR REPLACE FUNCTION executive.workflow_timer_kinds() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY[
  'task.deadline', 'task.reminder', 'workflow.step_timeout', 'grant.expiry', 'commitment.checkpoint', 'gate.expiry'] $$;
GRANT EXECUTE ON FUNCTION executive.human_task_kinds(), executive.task_subject_kinds(), executive.workflow_timer_kinds() TO eye_app, eye_commit;

CREATE TABLE executive.human_tasks (
  task_id              uuid PRIMARY KEY,
  scope                text NOT NULL,
  tenant_id            uuid NOT NULL,
  domain_id            uuid NOT NULL,
  kind                 text NOT NULL,
  dedupe_key           text NOT NULL,
  subject              jsonb NOT NULL,
  instance_id          uuid,
  step                 text,
  title                text NOT NULL,
  assignee_principal_id uuid,
  candidate_roles      text[] NOT NULL DEFAULT '{}',
  eligibility          jsonb NOT NULL DEFAULT '{}'::jsonb,
  deadline_at          timestamptz,
  deadline_timer_id    uuid,
  escalation           jsonb NOT NULL DEFAULT '{}'::jsonb,
  escalation_level     int NOT NULL DEFAULT 0,
  state                text NOT NULL DEFAULT 'open',
  outcome              text,
  completed_by         uuid,
  completed_at         timestamptz,
  completion_evidence  jsonb,
  opened_by            uuid NOT NULL,
  opened_at            timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at           timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id       uuid NOT NULL,
  CONSTRAINT xht_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT xht_kind CHECK (kind = ANY (executive.human_task_kinds())),
  CONSTRAINT xht_subject CHECK (jsonb_typeof(subject) = 'object' AND subject ->> 'kind' = ANY (executive.task_subject_kinds()) AND subject ? 'id'),
  CONSTRAINT xht_state CHECK (state IN ('open', 'escalated', 'completed', 'cancelled', 'lapsed')),
  CONSTRAINT xht_closed CHECK ((state IN ('completed', 'cancelled', 'lapsed')) = (completed_at IS NOT NULL)),
  CONSTRAINT xht_someone CHECK (assignee_principal_id IS NOT NULL OR cardinality(candidate_roles) > 0),
  CONSTRAINT xht_escalation CHECK (jsonb_typeof(escalation) = 'object' AND jsonb_typeof(eligibility) = 'object'),
  UNIQUE (tenant_id, domain_id, dedupe_key)
);
CREATE INDEX human_tasks_assignee ON executive.human_tasks (tenant_id, domain_id, assignee_principal_id, state);
CREATE INDEX human_tasks_subject ON executive.human_tasks USING gin (subject);

CREATE TABLE executive.human_task_assignments (
  assignment_id   uuid PRIMARY KEY,
  scope           text NOT NULL,
  tenant_id       uuid NOT NULL,
  domain_id       uuid NOT NULL,
  task_id         uuid NOT NULL REFERENCES executive.human_tasks (task_id),
  from_principal  uuid,
  to_principal    uuid,
  reason          text NOT NULL CHECK (reason IN ('opened', 'reassign', 'escalate', 'access_lost')),
  actor_principal_id uuid NOT NULL,
  at              timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id  uuid NOT NULL,
  CONSTRAINT xhta_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON executive.human_task_assignments FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

CREATE TABLE executive.human_task_events (
  event_id        uuid PRIMARY KEY,
  scope           text NOT NULL,
  tenant_id       uuid NOT NULL,
  domain_id       uuid NOT NULL,
  task_id         uuid NOT NULL REFERENCES executive.human_tasks (task_id),
  event           text NOT NULL CHECK (event IN ('task.opened', 'task.repeated', 'task.reassigned', 'task.escalated', 'task.escalation_exhausted',
                                                  'task.completed', 'task.cancelled', 'task.lapsed', 'task.reminded')),
  actor_principal_id uuid NOT NULL,
  details         jsonb NOT NULL DEFAULT '{}'::jsonb,
  at              timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id  uuid NOT NULL,
  CONSTRAINT xhte_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON executive.human_task_events FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

-- The timers of tasks, workflow steps, grants and commitments. A timer FIRES ONCE (fired_at set once, by the workflow part's tick step);
-- a cancelled timer never fires. Nothing here fires anything.
CREATE TABLE executive.workflow_timers (
  timer_id        uuid PRIMARY KEY,
  scope           text NOT NULL,
  tenant_id       uuid NOT NULL,
  domain_id       uuid NOT NULL,
  owner_kind      text NOT NULL CHECK (owner_kind IN ('task', 'workflow_instance', 'grant', 'commitment_item', 'gate')),
  owner_id        uuid NOT NULL,
  kind            text NOT NULL,
  due_at          timestamptz NOT NULL,
  payload         jsonb NOT NULL DEFAULT '{}'::jsonb,
  fired_at        timestamptz,
  fired_by_tick   uuid,
  drift_seconds   numeric,
  cancelled_at    timestamptz,
  created_by      uuid NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id  uuid NOT NULL,
  CONSTRAINT xwt_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT xwt_kind CHECK (kind = ANY (executive.workflow_timer_kinds())),
  CONSTRAINT xwt_once CHECK (fired_at IS NULL OR cancelled_at IS NULL)
);
CREATE INDEX workflow_timers_due ON executive.workflow_timers (tenant_id, domain_id, due_at) WHERE fired_at IS NULL AND cancelled_at IS NULL;
CREATE OR REPLACE FUNCTION executive.workflow_timer_once() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'workflow timer rejected: a timer is never deleted' USING ERRCODE = '42501'; END IF;
  IF OLD.fired_at IS NOT NULL OR OLD.cancelled_at IS NOT NULL THEN
    RAISE EXCEPTION 'workflow timer rejected: timer % already %', OLD.timer_id, CASE WHEN OLD.fired_at IS NOT NULL THEN 'fired' ELSE 'cancelled' END USING ERRCODE = '22023';
  END IF;
  IF (NEW.timer_id, NEW.tenant_id, NEW.domain_id, NEW.owner_kind, NEW.owner_id, NEW.kind, NEW.due_at, NEW.payload, NEW.created_by, NEW.created_at)
     IS DISTINCT FROM (OLD.timer_id, OLD.tenant_id, OLD.domain_id, OLD.owner_kind, OLD.owner_id, OLD.kind, OLD.due_at, OLD.payload, OLD.created_by, OLD.created_at) THEN
    RAISE EXCEPTION 'workflow timer rejected: only fired_at / cancelled_at are ever set' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER once BEFORE UPDATE OR DELETE ON executive.workflow_timers FOR EACH ROW EXECUTE FUNCTION executive.workflow_timer_once();

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['human_tasks', 'human_task_assignments', 'human_task_events', 'workflow_timers'] LOOP
    EXECUTE format('REVOKE ALL ON executive.%I FROM PUBLIC', t);
    EXECUTE format('ALTER TABLE executive.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE executive.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY executive_isolation ON executive.%I
        USING (
          tenant_id = public.eye_tenant()
          AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain())
        )$f$, t);
    EXECUTE format('GRANT SELECT ON executive.%I TO eye_app, eye_commit', t);
  END LOOP;
END $$;

-- Who may hold a task: an active human of the tenant; an EXTERNAL collaborator only for the collaboration kinds (their grant is the
-- workflow part's check at their own actions). Escalation targets are members (is_active_human).
CREATE OR REPLACE FUNCTION executive.task_holder_ok(p_principal uuid, p_tenant uuid, p_kind text) RETURNS boolean
STABLE SECURITY DEFINER SET search_path = identity, pg_catalog, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM identity.principals p WHERE p.id = p_principal AND p.kind = 'human' AND p.status = 'active' AND p.tenant_id = p_tenant
                    AND (NOT EXISTS (SELECT 1 FROM executive.external_principals x WHERE x.principal_id = p.id) OR p_kind IN ('collab.review', 'collab.contribute')));
$$ LANGUAGE sql;
REVOKE ALL ON FUNCTION executive.task_holder_ok(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.task_holder_ok(uuid, uuid, text) TO eye_app, eye_commit;

-- _schedule_timer: INTERNAL (called by definer ports only; REVOKEd, never granted).
CREATE OR REPLACE FUNCTION executive._schedule_timer(
  p_timer_id uuid, p_tenant uuid, p_domain uuid, p_owner_kind text, p_owner_id uuid, p_kind text, p_due_at timestamptz, p_payload jsonb,
  p_actor uuid, p_correlation uuid
) RETURNS uuid
SECURITY DEFINER SET search_path = executive, public, pg_catalog, pg_temp AS $$
BEGIN
  IF p_due_at IS NULL THEN RAISE EXCEPTION 'workflow timer rejected (due_at): a timer names its instant' USING ERRCODE = '22023'; END IF;
  INSERT INTO executive.workflow_timers (timer_id, scope, tenant_id, domain_id, owner_kind, owner_id, kind, due_at, payload, created_by, correlation_id)
  VALUES (p_timer_id, 'DOMAIN', p_tenant, p_domain, p_owner_kind, p_owner_id, p_kind, p_due_at, coalesce(p_payload, '{}'::jsonb), p_actor, p_correlation);
  RETURN p_timer_id;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive._schedule_timer(uuid, uuid, uuid, text, uuid, text, timestamptz, jsonb, uuid, uuid) FROM PUBLIC;

-- _open_human_task: INTERNAL. Idempotent on (tenant, domain, dedupe_key): a repeat answers the existing task (repeated true) and never a
-- second one. The deadline, when given, is a task.deadline timer; escalation {principal?, roles?, max_escalations, extend_minutes} is
-- stored for the workflow part's firing. The assignee holds the task (task_holder_ok); an escalation principal is a MEMBER.
CREATE OR REPLACE FUNCTION executive._open_human_task(
  p_task_id uuid, p_tenant uuid, p_domain uuid, p_kind text, p_dedupe_key text, p_subject jsonb, p_title text, p_assignee uuid,
  p_candidate_roles text[], p_eligibility jsonb, p_deadline_at timestamptz, p_escalation jsonb, p_instance_id uuid, p_step text,
  p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, decision, identity, public, pg_catalog, pg_temp AS $$
DECLARE t executive.human_tasks%ROWTYPE; v_timer uuid; v_esc uuid;
BEGIN
  IF p_kind IS NULL OR NOT (p_kind = ANY (executive.human_task_kinds())) THEN
    RAISE EXCEPTION 'human task rejected (kind): % is not a task kind (%)', coalesce(p_kind, '<none>'), array_to_string(executive.human_task_kinds(), ', ') USING ERRCODE = '22023';
  END IF;
  IF coalesce(length(btrim(p_dedupe_key)), 0) < 3 THEN RAISE EXCEPTION 'human task rejected (dedupe_key): a task names its idempotency key' USING ERRCODE = '22023'; END IF;
  SELECT * INTO t FROM executive.human_tasks x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.dedupe_key = p_dedupe_key;
  IF FOUND THEN
    INSERT INTO executive.human_task_events (event_id, scope, tenant_id, domain_id, task_id, event, actor_principal_id, details, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, t.task_id, 'task.repeated', p_actor, jsonb_build_object('dedupe_key', p_dedupe_key), p_correlation);
    RETURN jsonb_build_object('task_id', t.task_id, 'state', t.state, 'repeated', true, 'deadline_at', t.deadline_at, 'timer_id', t.deadline_timer_id);
  END IF;
  IF p_assignee IS NOT NULL AND NOT executive.task_holder_ok(p_assignee, p_tenant, p_kind) THEN
    RAISE EXCEPTION 'human task rejected (assignee): % is not an active human who may hold a % task', p_assignee, p_kind USING ERRCODE = '22023';
  END IF;
  IF p_assignee IS NULL AND cardinality(coalesce(p_candidate_roles, '{}')) = 0 THEN
    RAISE EXCEPTION 'human task rejected (assignee): a task names its assignee or its candidate roles' USING ERRCODE = '22023';
  END IF;
  v_esc := nullif(p_escalation ->> 'principal', '')::uuid;
  IF v_esc IS NOT NULL AND NOT decision.is_active_human(v_esc, p_tenant) THEN
    RAISE EXCEPTION 'human task rejected (escalation): % is not an active member to escalate to', v_esc USING ERRCODE = '22023';
  END IF;
  IF p_deadline_at IS NOT NULL AND p_deadline_at <= clock_timestamp() THEN
    RAISE EXCEPTION 'human task rejected (deadline): a deadline is in the future' USING ERRCODE = '22023';
  END IF;
  INSERT INTO executive.human_tasks (task_id, scope, tenant_id, domain_id, kind, dedupe_key, subject, instance_id, step, title, assignee_principal_id,
                                     candidate_roles, eligibility, deadline_at, escalation, opened_by, correlation_id)
  VALUES (p_task_id, 'DOMAIN', p_tenant, p_domain, p_kind, p_dedupe_key, p_subject, p_instance_id, p_step, p_title, p_assignee,
          coalesce(p_candidate_roles, '{}'), coalesce(p_eligibility, '{}'::jsonb), p_deadline_at, coalesce(p_escalation, '{}'::jsonb), p_actor, p_correlation);
  IF p_deadline_at IS NOT NULL THEN
    v_timer := executive._schedule_timer(gen_random_uuid(), p_tenant, p_domain, 'task', p_task_id, 'task.deadline', p_deadline_at,
                                         jsonb_build_object('kind', p_kind), p_actor, p_correlation);
    UPDATE executive.human_tasks SET deadline_timer_id = v_timer WHERE task_id = p_task_id;
  END IF;
  INSERT INTO executive.human_task_assignments (assignment_id, scope, tenant_id, domain_id, task_id, from_principal, to_principal, reason, actor_principal_id, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_task_id, NULL, p_assignee, 'opened', p_actor, p_correlation);
  INSERT INTO executive.human_task_events (event_id, scope, tenant_id, domain_id, task_id, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_task_id, 'task.opened', p_actor,
          jsonb_build_object('kind', p_kind, 'subject', p_subject, 'assignee', p_assignee, 'candidate_roles', to_jsonb(coalesce(p_candidate_roles, '{}')), 'deadline_at', p_deadline_at), p_correlation);
  RETURN jsonb_build_object('task_id', p_task_id, 'state', 'open', 'repeated', false, 'deadline_at', p_deadline_at, 'timer_id', v_timer);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive._open_human_task(uuid, uuid, uuid, text, text, jsonb, text, uuid, text[], jsonb, timestamptz, jsonb, uuid, text, uuid, uuid) FROM PUBLIC;

-- _resolve_human_tasks: INTERNAL. Completes the open / escalated tasks of the given kinds whose subject CONTAINS p_subject (the owning
-- port's act is the completion: an approval resolves the gate.approve task, a checkpoint the commitment.checkpoint task …); their
-- pending timers are cancelled. Answers what it resolved; nothing to resolve is not an error.
CREATE OR REPLACE FUNCTION executive._resolve_human_tasks(
  p_tenant uuid, p_domain uuid, p_subject jsonb, p_kinds text[], p_outcome text, p_effect_ref uuid, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, public, pg_catalog, pg_temp AS $$
DECLARE v_ids uuid[];
BEGIN
  WITH r AS (
    UPDATE executive.human_tasks t SET state = 'completed', outcome = p_outcome, completed_by = p_actor, completed_at = clock_timestamp(),
           completion_evidence = jsonb_build_object('effect_ref', p_effect_ref), updated_at = clock_timestamp()
     WHERE t.tenant_id = p_tenant AND t.domain_id = p_domain AND t.state IN ('open', 'escalated') AND t.subject @> p_subject AND t.kind = ANY (p_kinds)
    RETURNING t.task_id)
  SELECT coalesce(array_agg(task_id), '{}') INTO v_ids FROM r;
  UPDATE executive.workflow_timers SET cancelled_at = clock_timestamp()
   WHERE owner_kind = 'task' AND owner_id = ANY (v_ids) AND fired_at IS NULL AND cancelled_at IS NULL;
  INSERT INTO executive.human_task_events (event_id, scope, tenant_id, domain_id, task_id, event, actor_principal_id, details, correlation_id)
  SELECT gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, x, 'task.completed', p_actor, jsonb_build_object('outcome', p_outcome, 'effect_ref', p_effect_ref), p_correlation
    FROM unnest(v_ids) x;
  RETURN jsonb_build_object('resolved', cardinality(v_ids), 'task_ids', to_jsonb(v_ids));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive._resolve_human_tasks(uuid, uuid, jsonb, text[], text, uuid, uuid, uuid) FROM PUBLIC;

-- _cancel_human_tasks: INTERNAL. Cancels the open / escalated tasks of the kinds whose subject contains p_subject (a withdrawn package,
-- a superseded version, a revoked grant …), with the reason; their pending timers are cancelled.
CREATE OR REPLACE FUNCTION executive._cancel_human_tasks(
  p_tenant uuid, p_domain uuid, p_subject jsonb, p_kinds text[], p_reason text, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, public, pg_catalog, pg_temp AS $$
DECLARE v_ids uuid[];
BEGIN
  IF coalesce(length(btrim(p_reason)), 0) < 8 THEN RAISE EXCEPTION 'human task rejected (reason): a cancellation states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  WITH r AS (
    UPDATE executive.human_tasks t SET state = 'cancelled', outcome = 'cancelled', completed_by = p_actor, completed_at = clock_timestamp(),
           completion_evidence = jsonb_build_object('reason', p_reason), updated_at = clock_timestamp()
     WHERE t.tenant_id = p_tenant AND t.domain_id = p_domain AND t.state IN ('open', 'escalated') AND t.subject @> p_subject AND t.kind = ANY (p_kinds)
    RETURNING t.task_id)
  SELECT coalesce(array_agg(task_id), '{}') INTO v_ids FROM r;
  UPDATE executive.workflow_timers SET cancelled_at = clock_timestamp()
   WHERE owner_kind = 'task' AND owner_id = ANY (v_ids) AND fired_at IS NULL AND cancelled_at IS NULL;
  INSERT INTO executive.human_task_events (event_id, scope, tenant_id, domain_id, task_id, event, actor_principal_id, details, correlation_id)
  SELECT gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, x, 'task.cancelled', p_actor, jsonb_build_object('reason', p_reason), p_correlation FROM unnest(v_ids) x;
  RETURN jsonb_build_object('cancelled', cardinality(v_ids), 'task_ids', to_jsonb(v_ids));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive._cancel_human_tasks(uuid, uuid, jsonb, text[], text, uuid, uuid) FROM PUBLIC;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §0.5 ATTENTION VOCABULARY (F-P6-07; the attention part routes, ranks and acts)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION executive.attention_signal_classes() RETURNS text[]
LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY['forecast.unfit', 'scenario.incoherent', 'warning.raised', 'source.coverage_loss', 'proposal.review', 'decision.material_change', 'review.convened',
  -- B34 (0090)
  'opportunity.raised', 'health.change', 'commitment.due', 'commitment.breach'] $$;
GRANT EXECUTE ON FUNCTION executive.attention_signal_classes() TO eye_app, eye_commit;
ALTER TABLE executive.attention_items DROP CONSTRAINT IF EXISTS attention_items_signal_class_check;
ALTER TABLE executive.attention_items ADD CONSTRAINT attention_items_signal_class_check CHECK (signal_class IN (
  'forecast.unfit', 'scenario.incoherent', 'warning.raised', 'source.coverage_loss', 'proposal.review', 'decision.material_change', 'review.convened',
  'opportunity.raised', 'health.change', 'commitment.due', 'commitment.breach'));
ALTER TABLE executive.attention_items DROP CONSTRAINT IF EXISTS attention_items_subject_kind_check;
ALTER TABLE executive.attention_items ADD CONSTRAINT attention_items_subject_kind_check CHECK (subject_kind IN (
  'forecast', 'scenario', 'warning', 'source', 'claim', 'package', 'review',
  'exposure', 'health_change', 'commitment_item'));
ALTER TABLE executive.attention_item_events DROP CONSTRAINT IF EXISTS attention_item_events_event_check;
ALTER TABLE executive.attention_item_events ADD CONSTRAINT attention_item_events_event_check CHECK (event IN (
  'item.routed', 'item.deprioritized', 'item.unrouted', 'item.escalated', 'item.acknowledged', 'item.suppressed',
  'item.suppression_lapsed', 'item.reevaluated', 'item.closed', 'item.repeated',
  -- B24 (0086)
  'item.delegated', 'item.delegation_ended', 'item.suppression_requested', 'item.suppression_decided',
  'item.overload_deprioritized', 'item.elevated', 'item.disposition',
  -- B34 (0090): the act transition
  'item.acted', 'item.act_refused'));

-- The delivery channels: in_app (real), and every other one SYNTHETIC — the demo mailbox (0086) and B34's email / SMS / Teams ADAPTERS,
-- proven against LOCAL sinks only (a real provider is owner decision D6; nothing here closes a real-provider clause).
CREATE OR REPLACE FUNCTION executive.attention_delivery_channels() RETURNS text[]
LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY['in_app', 'demo-mailbox', 'email', 'sms', 'teams'] $$;
GRANT EXECUTE ON FUNCTION executive.attention_delivery_channels() TO eye_app, eye_commit;
ALTER TABLE executive.attention_deliveries DROP CONSTRAINT attention_deliveries_channel_check;
ALTER TABLE executive.attention_deliveries ADD CONSTRAINT attention_deliveries_channel_check CHECK (channel IN ('in_app', 'demo-mailbox', 'email', 'sms', 'teams'));
ALTER TABLE executive.attention_deliveries DROP CONSTRAINT xad_synthetic;
ALTER TABLE executive.attention_deliveries ADD CONSTRAINT xad_synthetic CHECK (synthetic_state = (channel <> 'in_app'));

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §0.6 SUBSCRIPTION VOCABULARY
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- Three new outbox events (their payload contracts: apps/api/src/executive/attention/signal-contracts.ts), emitted by the OWNING TS route
-- in the same governed write: ExposureChanged@v1 (the exposure ports — the exposures part), HealthScoreChanged@v1 (the health compute
-- route — the attention part), CommitmentChanged@v1 (the commitment and execution ports — the commitments part). No interface is bound:
-- the register stays 50/0/0.
INSERT INTO graph.subscribable_event_types (event_type, interface, since) VALUES
  ('ExposureChanged', NULL, '0090'), ('HealthScoreChanged', NULL, '0090'), ('CommitmentChanged', NULL, '0090')
ON CONFLICT (event_type) DO NOTHING;
ALTER TABLE graph.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_event_types_check;
ALTER TABLE graph.subscriptions ADD CONSTRAINT subscriptions_event_types_check CHECK (cardinality(event_types) >= 1 AND event_types <@ ARRAY[
  'GraphChanged', 'MemoryCorrected', 'ObservationRecorded', 'SourceHealthChanged', 'ClaimsExtracted', 'IntelligenceObjectAdmitted',
  'ForecastFitnessChanged', 'ScenarioCoherenceFailed', 'EarlyWarningRaised', 'AttentionPolicyChanged', 'MaterialChangeRaised', 'ReviewConvened',
  'ExposureChanged', 'HealthScoreChanged', 'CommitmentChanged']);
ALTER TABLE graph.subscription_deliveries DROP CONSTRAINT IF EXISTS subscription_deliveries_event_type_check;
ALTER TABLE graph.subscription_deliveries ADD CONSTRAINT subscription_deliveries_event_type_check CHECK (event_type IN (
  'GraphChanged', 'MemoryCorrected', 'ObservationRecorded', 'SourceHealthChanged', 'ClaimsExtracted', 'IntelligenceObjectAdmitted',
  'ForecastFitnessChanged', 'ScenarioCoherenceFailed', 'EarlyWarningRaised', 'AttentionPolicyChanged', 'MaterialChangeRaised', 'ReviewConvened',
  'ExposureChanged', 'HealthScoreChanged', 'CommitmentChanged'));
ALTER TABLE graph.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_consumer_kind_check;
ALTER TABLE graph.subscriptions ADD CONSTRAINT subscriptions_consumer_kind_check CHECK (consumer_kind IN (
  'twins', 'forecasts', 'scenarios', 'decisions', 'retrieval', 'memory-mappings', 'relationships', 'observations', 'source-health', 'proposals', 'attention',
  -- B28 (0088)
  'stream-rules', 'warnings',
  -- B34 (0090)
  'commitments'));
INSERT INTO graph.subscription_consumer_actions (consumer_kind, action, role_code, since) VALUES
  ('commitments', 'decision.commitment.subscription.apply', 'commitment_subscriber', '0090')
ON CONFLICT (consumer_kind) DO NOTHING;
INSERT INTO graph.subscription_consumer_events (consumer_kind, event_type, since) VALUES
  ('commitments', 'GraphChanged', '0090'),
  ('attention', 'ExposureChanged', '0090'), ('attention', 'HealthScoreChanged', '0090'), ('attention', 'CommitmentChanged', '0090')
ON CONFLICT (consumer_kind, event_type) DO NOTHING;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §0.7 THE COMMITMENT ITEM'S SIGNAL — the contract between the commitments part (which owns the record) and the attention part (which
-- routes it). The attention consumer reads a CommitmentChanged event's item THROUGH THIS FUNCTION ONLY. Declared here as a stub that knows
-- no item (NULL: the consumer records the event as not routed); the COMMITMENTS part alone re-declares it with the real body over its
-- tables. The answer, when an item is known:
--   {item_id, commitment_id, package_id, title, kind, owner, reviewer, due_at, state, severity ('C1'..'C4'), overdue boolean,
--    open_exceptions int, residual jsonb|null, objectives uuid[]}
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION decision.commitment_item_signal(p_tenant uuid, p_domain uuid, p_item uuid) RETURNS jsonb
STABLE SECURITY DEFINER SET search_path = decision, pg_catalog, pg_temp AS $$ SELECT NULL::jsonb $$ LANGUAGE sql;
REVOKE ALL ON FUNCTION decision.commitment_item_signal(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.commitment_item_signal(uuid, uuid, uuid) TO eye_app, eye_commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- section `attention`
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- section `attention`
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0090 §A — CP-6 B34 part `attention` (F-P6-07 "Attention policy, priority queue, notification and escalation" — the completion;
-- V3 L10-C02/-C07, L10-I02/-I05; V4 ES-40-*; V8 PR-44-*, CAP-EO-06, AT-44; V9 UX-44-*). On the prelude's vocabulary (0090 §0.5–§0.7):
--   §A1 THE POLICY VALIDATOR — executive.validate_attention_rules (0088:2279 copied whole): notify.channels are
--       executive.attention_delivery_channels() — in_app and the SYNTHETIC demo-mailbox, email, sms and teams (the last three reach LOCAL
--       sinks only; push and any real provider remain owner decision D6); a channel named twice refused. The four new classes are
--       validated like every class (the prelude's executive.attention_signal_classes()).
--   §A2 THE DELIVERY PLAN — executive.plan_attention_deliveries (0086:613 copied whole): synthetic_state = (channel <> 'in_app') (the
--       prelude's xad_synthetic); nothing else changes.
--   §A3 THE DIMENSIONS — executive.attention_dimensions (0088:2501 copied whole) with the branches of opportunity.raised (the exposure's
--       ACCEPTED version: probability, exposure, strategic relevance, irreversibility, the response window from its acceptance),
--       health.change (the change's snapshot: the decisions informed, the active objectives), commitment.due / commitment.breach (READ
--       THROUGH decision.commitment_item_signal ONLY — the prelude's contract; NULL in this part's worktree: no input, declared).
--   §A4 THE ACT — executive.attention_act_registry (signal class → governed action, human-gated; health.change has none) seeded with
--       opportunity.raised → prediction.exposure.sponsor and warning.raised → prediction.warning.acknowledge; executive.attention_item_acts
--       (launched → acted | refused); executive.launch_attention_act and executive.act_on_attention_item (item.acted / item.act_refused),
--       both under executive.attention.item.act. The governed action itself is performed by the route as its OWN governed write.
--   §A5 THE QUEUE EVALUATION — executive.evaluate_attention_queue (0086:1871 copied whole) with the RANKING FAIRNESS measure (per class
--       and per consequence tier: mean rank percentile, top-decile share, structural-null shares, disparity; reported, gating nothing).
-- NOT HERE (stated): the classes, subject kinds, item events, channels and event types (the prelude's); the emission of ExposureChanged
-- (the exposures part's routes) and CommitmentChanged (the commitments part's); HealthScoreChanged@v1 is emitted by the health compute
-- ROUTE (TS, this part) — no trigger; decision.commitment_item_signal's body (the commitments part's); the registry row of
-- commitment.breach (the integrator's, once the commitments part's action exists); the attention consumer's live subscription
-- re-registration (the integrator's act: the consumer's digest moves); the interface register (unchanged, 50/0/0); a real e-mail /
-- SMS / Teams provider (owner decision D6 — the adapters reach loopback sinks and close no real-provider clause).
-- Forward-only; 0083–0089 untouched.


-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §A1 THE POLICY VALIDATOR — 0088:2279 copied whole; B34: notify.channels from executive.attention_delivery_channels()
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION executive.validate_attention_rules(p_rules jsonb) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = executive, identity, pg_catalog, pg_temp AS $$
DECLARE c record; k text; r jsonb; m jsonb; s jsonb; v jsonb;
BEGIN
  IF p_rules IS NULL OR jsonb_typeof(p_rules) <> 'object' THEN RAISE EXCEPTION 'attention policy rejected: the rules are an object {classes, overload?}' USING ERRCODE = '22023'; END IF;
  FOR k IN SELECT jsonb_object_keys(p_rules) LOOP
    IF k NOT IN ('classes', 'overload') THEN RAISE EXCEPTION 'attention policy rejected: unknown key % (the rules carry classes and optionally overload)', k USING ERRCODE = '22023'; END IF;
  END LOOP;
  IF jsonb_typeof(p_rules -> 'classes') IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(p_rules -> 'classes')) = 0 THEN
    RAISE EXCEPTION 'attention policy rejected: classes is a non-empty object keyed by signal class (%)', array_to_string(executive.attention_signal_classes(), ', ') USING ERRCODE = '22023';
  END IF;
  FOR c IN SELECT key, value FROM jsonb_each(p_rules -> 'classes') LOOP
    IF NOT (c.key = ANY (executive.attention_signal_classes())) THEN RAISE EXCEPTION 'attention policy rejected: % is not a signal class (%)', c.key, array_to_string(executive.attention_signal_classes(), ', ') USING ERRCODE = '22023'; END IF;
    r := c.value;
    IF jsonb_typeof(r) <> 'object' THEN RAISE EXCEPTION 'attention policy rejected: class % is an object', c.key USING ERRCODE = '22023'; END IF;
    FOR k IN SELECT jsonb_object_keys(r) LOOP
      IF k NOT IN ('materiality', 'route_roles', 'ack_within_minutes', 'escalate_to_roles', 'max_escalations', 'suppression', 'notify') THEN
        RAISE EXCEPTION 'attention policy rejected: class % carries the unknown key %', c.key, k USING ERRCODE = '22023';
      END IF;
    END LOOP;
    m := r -> 'materiality';
    IF jsonb_typeof(m) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'attention policy rejected: class % needs materiality {min_consequence, min_confidence, max_hours_to_window?}', c.key USING ERRCODE = '22023'; END IF;
    FOR k IN SELECT jsonb_object_keys(m) LOOP
      IF k NOT IN ('min_consequence', 'min_confidence', 'max_hours_to_window',
                   'min_probability', 'min_exposure', 'min_strategic_relevance', 'min_information_value', 'min_irreversibility', 'require',
                   /* B28 (0088 §S8) */ 'min_novelty') THEN
        RAISE EXCEPTION 'attention policy rejected: class % materiality carries the unknown key %', c.key, k USING ERRCODE = '22023';
      END IF;
    END LOOP;
    -- B24 (0086 §0): the five further dimensions (V00-T-069, V03-T-262) — each judged only when its class sets a threshold
    FOR k IN SELECT unnest(ARRAY['min_probability', 'min_strategic_relevance', 'min_information_value', /* B28 (0088 §S8) */ 'min_novelty']) LOOP
      IF m ? k AND (jsonb_typeof(m -> k) <> 'number' OR (m ->> k)::numeric < 0 OR (m ->> k)::numeric > 1) THEN
        RAISE EXCEPTION 'attention policy rejected: class % materiality.% is a number in [0, 1]', c.key, k USING ERRCODE = '22023';
      END IF;
    END LOOP;
    IF m ? 'min_exposure' AND (jsonb_typeof(m -> 'min_exposure') <> 'number' OR (m ->> 'min_exposure')::numeric < 0) THEN
      RAISE EXCEPTION 'attention policy rejected: class % materiality.min_exposure is a number ≥ 0 (the count of dependent products)', c.key USING ERRCODE = '22023';
    END IF;
    IF m ? 'min_irreversibility' AND coalesce(m ->> 'min_irreversibility', '') NOT IN ('reversible', 'costly', 'irreversible') THEN
      RAISE EXCEPTION 'attention policy rejected: class % materiality.min_irreversibility is reversible | costly | irreversible', c.key USING ERRCODE = '22023';
    END IF;
    IF m ? 'require' AND (jsonb_typeof(m -> 'require') <> 'array' OR EXISTS (SELECT 1 FROM jsonb_array_elements(m -> 'require') e
         WHERE jsonb_typeof(e) <> 'string' OR (e #>> '{}') NOT IN ('probability', 'exposure', 'strategic_relevance', 'information_value', 'irreversibility'))) THEN
      RAISE EXCEPTION 'attention policy rejected: class % materiality.require lists dimensions among probability, exposure, strategic_relevance, information_value, irreversibility', c.key USING ERRCODE = '22023';
    END IF;
    IF coalesce(m ->> 'min_consequence', '') NOT IN ('C0', 'C1', 'C2', 'C3', 'C4') THEN RAISE EXCEPTION 'attention policy rejected: class % materiality.min_consequence is C0..C4', c.key USING ERRCODE = '22023'; END IF;
    IF jsonb_typeof(m -> 'min_confidence') IS DISTINCT FROM 'number' OR (m ->> 'min_confidence')::numeric < 0 OR (m ->> 'min_confidence')::numeric > 1 THEN
      RAISE EXCEPTION 'attention policy rejected: class % materiality.min_confidence is a number in [0, 1]', c.key USING ERRCODE = '22023';
    END IF;
    IF m ? 'max_hours_to_window' AND jsonb_typeof(m -> 'max_hours_to_window') <> 'null'
       AND (jsonb_typeof(m -> 'max_hours_to_window') <> 'number' OR (m ->> 'max_hours_to_window')::numeric <= 0) THEN
      RAISE EXCEPTION 'attention policy rejected: class % materiality.max_hours_to_window is a positive number or null', c.key USING ERRCODE = '22023';
    END IF;
    FOR k IN SELECT unnest(ARRAY['route_roles', 'escalate_to_roles']) LOOP
      v := r -> k;
      IF k = 'route_roles' AND (jsonb_typeof(v) IS DISTINCT FROM 'array' OR jsonb_array_length(v) = 0) THEN RAISE EXCEPTION 'attention policy rejected: class % route_roles is a non-empty list of roles', c.key USING ERRCODE = '22023'; END IF;
      IF v IS NOT NULL AND jsonb_typeof(v) <> 'array' THEN RAISE EXCEPTION 'attention policy rejected: class % % is a list of roles', c.key, k USING ERRCODE = '22023'; END IF;
      IF v IS NOT NULL AND EXISTS (SELECT 1 FROM jsonb_array_elements(v) e WHERE jsonb_typeof(e) <> 'string' OR NOT EXISTS (SELECT 1 FROM identity.roles x WHERE x.code = e #>> '{}' AND x.code NOT LIKE '%\_subscriber' AND x.code NOT LIKE '%\_agent')) THEN
        RAISE EXCEPTION 'attention policy rejected: class % % names a role that is not a human role of this product', c.key, k USING ERRCODE = '22023';
      END IF;
    END LOOP;
    IF jsonb_typeof(r -> 'ack_within_minutes') IS DISTINCT FROM 'number' OR (r ->> 'ack_within_minutes')::numeric <> trunc((r ->> 'ack_within_minutes')::numeric)
       OR (r ->> 'ack_within_minutes')::numeric < 1 OR (r ->> 'ack_within_minutes')::numeric > 10080 THEN
      RAISE EXCEPTION 'attention policy rejected: class % ack_within_minutes is a whole number in [1, 10080]', c.key USING ERRCODE = '22023';
    END IF;
    IF r ? 'max_escalations' AND (jsonb_typeof(r -> 'max_escalations') <> 'number' OR (r ->> 'max_escalations')::numeric NOT IN (0, 1, 2, 3, 4, 5)) THEN
      RAISE EXCEPTION 'attention policy rejected: class % max_escalations is 0..5', c.key USING ERRCODE = '22023';
    END IF;
    IF coalesce((r ->> 'max_escalations')::int, 0) > 0 AND (r -> 'escalate_to_roles' IS NULL OR jsonb_array_length(r -> 'escalate_to_roles') = 0) THEN
      RAISE EXCEPTION 'attention policy rejected: class % escalates (max_escalations > 0) to nobody; name escalate_to_roles', c.key USING ERRCODE = '22023';
    END IF;
    s := r -> 'suppression';
    IF s IS NOT NULL THEN
      IF jsonb_typeof(s) <> 'object' OR jsonb_typeof(s -> 'allowed') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'attention policy rejected: class % suppression is {allowed, max_hours}', c.key USING ERRCODE = '22023'; END IF;
      IF (s ->> 'allowed')::boolean AND (jsonb_typeof(s -> 'max_hours') IS DISTINCT FROM 'number' OR (s ->> 'max_hours')::numeric < 1 OR (s ->> 'max_hours')::numeric > 720) THEN
        RAISE EXCEPTION 'attention policy rejected: class % suppression.max_hours is in [1, 720] when suppression is allowed', c.key USING ERRCODE = '22023';
      END IF;
      -- B24 (0086 §0): a suppression may need a second person's approval (V03-T-263, V03-T-171)
      FOR k IN SELECT jsonb_object_keys(s) LOOP
        IF k NOT IN ('allowed', 'max_hours', 'approval_required', 'approver_roles') THEN RAISE EXCEPTION 'attention policy rejected: class % suppression carries the unknown key %', c.key, k USING ERRCODE = '22023'; END IF;
      END LOOP;
      IF s ? 'approval_required' AND jsonb_typeof(s -> 'approval_required') <> 'boolean' THEN RAISE EXCEPTION 'attention policy rejected: class % suppression.approval_required is a boolean', c.key USING ERRCODE = '22023'; END IF;
      IF coalesce((s ->> 'approval_required')::boolean, false) AND (jsonb_typeof(s -> 'approver_roles') IS DISTINCT FROM 'array' OR jsonb_array_length(s -> 'approver_roles') = 0
         OR EXISTS (SELECT 1 FROM jsonb_array_elements(s -> 'approver_roles') e WHERE jsonb_typeof(e) <> 'string'
                     OR NOT EXISTS (SELECT 1 FROM identity.roles x WHERE x.code = e #>> '{}' AND x.code NOT LIKE '%\_subscriber' AND x.code NOT LIKE '%\_agent'))) THEN
        RAISE EXCEPTION 'attention policy rejected: class % suppression.approver_roles is a non-empty list of human roles when approval is required', c.key USING ERRCODE = '22023';
      END IF;
    END IF;
    -- B24 (0086 §0): notify is 'in_app' (as before) or {channels, max_attempts} over the channels this product has — in_app and the
    -- SYNTHETIC demo-mailbox; a real provider channel (email, sms, teams, push) needs a delivery provider (owner decision D6)
    IF r ? 'notify' THEN
      v := r -> 'notify';
      IF jsonb_typeof(v) = 'string' THEN
        IF v #>> '{}' <> 'in_app' THEN
          -- B34 (0090): a bare word other than in_app is still refused (the message kept): a synthetic adapter is named in {channels}
          RAISE EXCEPTION 'attention policy rejected: class % notify is in_app or {channels, max_attempts}; % needs a delivery provider (owner decision D6) — the SYNTHETIC email, sms and teams adapters are named in {channels}', c.key, v #>> '{}' USING ERRCODE = '22023';
        END IF;
      ELSIF jsonb_typeof(v) = 'object' THEN
        FOR k IN SELECT jsonb_object_keys(v) LOOP
          IF k NOT IN ('channels', 'max_attempts') THEN RAISE EXCEPTION 'attention policy rejected: class % notify carries the unknown key %', c.key, k USING ERRCODE = '22023'; END IF;
        END LOOP;
        IF jsonb_typeof(v -> 'channels') IS DISTINCT FROM 'array' OR jsonb_array_length(v -> 'channels') = 0 THEN
          RAISE EXCEPTION 'attention policy rejected: class % notify.channels is a non-empty list', c.key USING ERRCODE = '22023';
        END IF;
        -- B34 (0090): the channels are executive.attention_delivery_channels() — in_app, and the SYNTHETIC demo-mailbox, email, sms and teams
        -- (the last three adapters reach LOCAL sinks only; a real provider — and push — is owner decision D6)
        IF EXISTS (SELECT 1 FROM jsonb_array_elements(v -> 'channels') e WHERE jsonb_typeof(e) <> 'string' OR NOT ((e #>> '{}') = ANY (executive.attention_delivery_channels()))) THEN
          RAISE EXCEPTION 'attention policy rejected: class % notify.channels are % (all but in_app SYNTHETIC — local sinks); % needs a delivery provider (owner decision D6)', c.key,
            array_to_string(executive.attention_delivery_channels(), ', '),
            (SELECT string_agg(coalesce(e #>> '{}', e::text), ', ') FROM jsonb_array_elements(v -> 'channels') e WHERE jsonb_typeof(e) <> 'string' OR NOT ((e #>> '{}') = ANY (executive.attention_delivery_channels()))) USING ERRCODE = '22023';
        END IF;
        IF (SELECT count(*) FROM jsonb_array_elements(v -> 'channels')) <> (SELECT count(DISTINCT e #>> '{}') FROM jsonb_array_elements(v -> 'channels') e) THEN
          RAISE EXCEPTION 'attention policy rejected: class % notify.channels names a channel twice', c.key USING ERRCODE = '22023';
        END IF;
        IF v ? 'max_attempts' AND (jsonb_typeof(v -> 'max_attempts') <> 'number' OR (v ->> 'max_attempts')::numeric NOT IN (1, 2, 3, 4, 5)) THEN
          RAISE EXCEPTION 'attention policy rejected: class % notify.max_attempts is 1..5', c.key USING ERRCODE = '22023';
        END IF;
      ELSE
        RAISE EXCEPTION 'attention policy rejected: class % notify is in_app or {channels, max_attempts}', c.key USING ERRCODE = '22023';
      END IF;
    END IF;
  END LOOP;
  -- B24 (0086 §0): overload is the legacy {max_open_per_role} (stored versions are immutable) or the enforced
  -- {max_open_per_owner, window_hours, exempt_min_consequence} (PR-44-005: a C3/C4 item is never deprioritized for overload)
  IF p_rules ? 'overload' THEN
    v := p_rules -> 'overload';
    IF jsonb_typeof(v) <> 'object' THEN RAISE EXCEPTION 'attention policy rejected: overload is {max_open_per_role ≥ 1}' USING ERRCODE = '22023'; END IF;
    FOR k IN SELECT jsonb_object_keys(v) LOOP
      IF k NOT IN ('max_open_per_role', 'max_open_per_owner', 'window_hours', 'exempt_min_consequence') THEN
        RAISE EXCEPTION 'attention policy rejected: overload carries the unknown key % (max_open_per_owner, window_hours, exempt_min_consequence; or the legacy max_open_per_role)', k USING ERRCODE = '22023';
      END IF;
    END LOOP;
    IF v ? 'max_open_per_role' AND (jsonb_typeof(v -> 'max_open_per_role') <> 'number' OR (v ->> 'max_open_per_role')::numeric < 1) THEN
      RAISE EXCEPTION 'attention policy rejected: overload is {max_open_per_role ≥ 1}' USING ERRCODE = '22023';
    END IF;
    IF NOT (v ? 'max_open_per_role') AND NOT (v ? 'max_open_per_owner') THEN
      RAISE EXCEPTION 'attention policy rejected: overload is {max_open_per_role ≥ 1}' USING ERRCODE = '22023';
    END IF;
    IF v ? 'max_open_per_owner' AND (jsonb_typeof(v -> 'max_open_per_owner') <> 'number' OR (v ->> 'max_open_per_owner')::numeric < 1 OR (v ->> 'max_open_per_owner')::numeric <> trunc((v ->> 'max_open_per_owner')::numeric)) THEN
      RAISE EXCEPTION 'attention policy rejected: overload.max_open_per_owner is a whole number ≥ 1' USING ERRCODE = '22023';
    END IF;
    IF v ? 'window_hours' AND (jsonb_typeof(v -> 'window_hours') <> 'number' OR (v ->> 'window_hours')::numeric < 1 OR (v ->> 'window_hours')::numeric > 720) THEN
      RAISE EXCEPTION 'attention policy rejected: overload.window_hours is in [1, 720]' USING ERRCODE = '22023';
    END IF;
    IF v ? 'exempt_min_consequence' AND coalesce(v ->> 'exempt_min_consequence', '') NOT IN ('C1', 'C2', 'C3', 'C4') THEN
      RAISE EXCEPTION 'attention policy rejected: overload.exempt_min_consequence is C1..C4 (C3 and C4 items are never deprioritized for overload whatever it says)' USING ERRCODE = '22023';
    END IF;
  END IF;
END $$;
REVOKE ALL ON FUNCTION executive.validate_attention_rules(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.validate_attention_rules(jsonb) TO eye_commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §A2 THE DELIVERY PLAN — 0086:613 copied whole; B34: every channel but in_app is SYNTHETIC
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION executive.plan_attention_deliveries(p_tenant uuid, p_domain uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE e record; v_since timestamptz; v_rule jsonb; v_plan jsonb; v_roles text[]; v_recipients uuid[]; v_ch text; v_rcpt uuid; v_id uuid;
        v_planned int := 0; v_events int := 0; v_not jsonb := '[]'::jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.attention.tick']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT min(a.created_at) INTO v_since FROM executive.agents a WHERE a.tenant_id = p_tenant AND a.domain_id = p_domain AND a.agent_kind = 'attention';
  IF v_since IS NULL THEN RETURN jsonb_build_object('planned', 0, 'events', 0, 'not_planned', '[]'::jsonb, 'note', 'no attention agent is registered in this domain'); END IF;
  FOR e IN
    SELECT ev.event_id, ev.event, ev.details, ev.occurred_at, i.item_id, i.state AS item_state, i.signal_class, i.owner_principal_id, i.route_roles AS item_roles, i.policy_id, i.policy_version
      FROM executive.attention_item_events ev JOIN executive.attention_items i ON i.item_id = ev.item_id
     WHERE ev.tenant_id = p_tenant AND ev.domain_id = p_domain AND ev.event IN ('item.routed', 'item.escalated', 'item.unrouted', 'item.elevated') AND ev.occurred_at >= v_since
       AND NOT coalesce((ev.details ->> 'exhausted')::boolean, false)
       AND NOT EXISTS (SELECT 1 FROM executive.attention_deliveries d WHERE d.item_event_id = ev.event_id)
       AND NOT EXISTS (SELECT 1 FROM executive.attention_delivery_events x WHERE x.item_event_id = ev.event_id AND x.event = 'delivery.not_planned')
     ORDER BY ev.occurred_at, ev.event_id
     LIMIT 200
  LOOP
    IF e.item_state = 'closed' THEN
      PERFORM executive.attention_delivery_event(NULL, e.item_id, e.event_id, p_tenant, p_domain, 'delivery.not_planned', p_actor, jsonb_build_object('reason', 'item_closed', 'item_event', e.event), p_correlation);
      v_not := v_not || jsonb_build_object('item_event_id', e.event_id, 'reason', 'item_closed');
      CONTINUE;
    END IF;
    SELECT a.rules #> ARRAY['classes', e.signal_class] INTO v_rule FROM executive.attention_policies a WHERE a.policy_id = e.policy_id;
    v_plan := executive.attention_notify_plan(v_rule -> 'notify');
    SELECT coalesce(array_agg(DISTINCT x), '{}') INTO v_roles FROM (
      SELECT jsonb_array_elements_text(CASE WHEN jsonb_typeof(e.details -> 'route_roles') = 'array' THEN e.details -> 'route_roles' ELSE to_jsonb(e.item_roles) END) x
      UNION ALL SELECT jsonb_array_elements_text(CASE WHEN e.event = 'item.unrouted' OR (e.event = 'item.elevated' AND coalesce((e.details ->> 'unrouted')::boolean, false)) THEN coalesce(v_rule -> 'escalate_to_roles', '[]'::jsonb) ELSE '[]'::jsonb END)) q;
    SELECT coalesce(array_agg(DISTINCT r ORDER BY r), '{}') INTO v_recipients FROM (
      SELECT e.owner_principal_id AS r WHERE e.owner_principal_id IS NOT NULL
         AND EXISTS (SELECT 1 FROM identity.principals p WHERE p.id = e.owner_principal_id AND p.kind = 'human' AND p.status = 'active')
      UNION SELECT h FROM executive.role_holder_ids(p_tenant, p_domain, v_roles) h) q;
    IF cardinality(v_recipients) = 0 THEN
      PERFORM executive.attention_delivery_event(NULL, e.item_id, e.event_id, p_tenant, p_domain, 'delivery.not_planned', p_actor,
                jsonb_build_object('reason', 'no_recipient', 'item_event', e.event, 'roles', to_jsonb(v_roles), 'owner', e.owner_principal_id), p_correlation);
      v_not := v_not || jsonb_build_object('item_event_id', e.event_id, 'reason', 'no_recipient');
      CONTINUE;
    END IF;
    FOR v_ch IN SELECT jsonb_array_elements_text(v_plan -> 'channels') LOOP
      FOREACH v_rcpt IN ARRAY v_recipients LOOP
        v_id := gen_random_uuid();
        INSERT INTO executive.attention_deliveries (delivery_id, scope, tenant_id, domain_id, item_id, item_event_id, item_event, channel, recipient_principal_id, attempt, max_attempts,
                                                    state, next_attempt_at, policy_version, synthetic_state, correlation_id)
        VALUES (v_id, 'DOMAIN', p_tenant, p_domain, e.item_id, e.event_id, e.event, v_ch, v_rcpt, 1, (v_plan ->> 'max_attempts')::int,
                'queued', clock_timestamp(), e.policy_version, v_ch <> 'in_app' /* B34 (0090): every channel but in_app is SYNTHETIC */, p_correlation)
        ON CONFLICT (item_event_id, channel, recipient_principal_id, attempt) DO NOTHING;
        IF FOUND THEN
          PERFORM executive.attention_delivery_event(v_id, e.item_id, e.event_id, p_tenant, p_domain, 'delivery.planned', p_actor,
                    jsonb_build_object('channel', v_ch, 'recipient', v_rcpt, 'attempt', 1, 'max_attempts', (v_plan ->> 'max_attempts')::int, 'policy_version', e.policy_version,
                                       'item_event', e.event, 'synthetic', v_ch <> 'in_app' /* B34 (0090): every channel but in_app is SYNTHETIC */), p_correlation);
          v_planned := v_planned + 1;
        END IF;
      END LOOP;
    END LOOP;
    v_events := v_events + 1;
  END LOOP;
  RETURN jsonb_build_object('planned', v_planned, 'events', v_events, 'not_planned', v_not);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.plan_attention_deliveries(uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.plan_attention_deliveries(uuid,uuid,uuid,uuid) TO eye_commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §A3 THE DIMENSIONS — 0088:2501 copied whole (B28 novelty kept); B34: the four new classes read from their records
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION executive.attention_dimensions(p_tenant uuid, p_domain uuid, p_class text, p_subject_id uuid, p_hint jsonb DEFAULT '{}'::jsonb) RETURNS jsonb
STABLE SECURITY DEFINER SET search_path = executive, decision, graph, prediction, simulation, observation, public, pg_catalog, pg_temp AS $$
DECLARE v_at timestamptz := clock_timestamp(); out jsonb := jsonb_build_object('probability', NULL, 'exposure', NULL, 'strategic_relevance', NULL, 'information_value', NULL, 'irreversibility', NULL);
        basis jsonb := '{}'::jsonb; v_pkg record; v_ver record; v_version int; v_rel jsonb; v_n int; v_m int; v_best jsonb; v_w record; v_f record; v_i record;
        v_q10 numeric; v_q50 numeric; v_q90 numeric; v_lo numeric; v_hi numeric; v_below boolean; v_rv record; v_iv text;
        /* B28 (0088 §S8) */ v_nov numeric; v_nbasis jsonb; v_nw record; v_nd record;
        /* B34 (0090) */ v_x record; v_xv record; v_objs int; v_hc record; v_hres jsonb; v_hdims jsonb; v_links int; v_hobj int; v_sig jsonb;
BEGIN
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_class = 'decision.material_change' THEN
    SELECT p.package_id, p.decision_object_id, p.current_version INTO v_pkg FROM decision.packages_current p WHERE p.package_id = p_subject_id AND p.tenant_id = p_tenant AND p.domain_id = p_domain;
    v_version := CASE WHEN jsonb_typeof(p_hint -> 'version') = 'number' THEN (p_hint ->> 'version')::int ELSE v_pkg.current_version END;
    SELECT v.reversibility, v.information_value INTO v_ver FROM decision.package_versions v WHERE v.package_id = p_subject_id AND v.version = v_version AND v.tenant_id = p_tenant AND v.domain_id = p_domain;
    IF v_pkg.package_id IS NULL OR v_version IS NULL OR NOT FOUND THEN
      RETURN out || jsonb_build_object('dimension_basis', jsonb_build_object('note', 'no package version to read: every further dimension has no input'));
    END IF;
    v_iv := executive.normalise_information_value(v_ver.information_value);
    out := out || jsonb_build_object('irreversibility', executive.normalise_reversibility(v_ver.reversibility), 'information_value', executive.information_value_point(v_iv));
    v_rel := executive.package_strategic_relevance(p_tenant, p_domain, p_subject_id, v_version);
    out := out || jsonb_build_object('strategic_relevance', v_rel -> 'score');
    -- EXPOSURE: the objects resting on the decision — its commitment and every active graph dependent of the DEC (counted once).
    SELECT count(DISTINCT x) INTO v_n FROM (
      SELECT c.commitment_id AS x FROM decision.commitments c WHERE c.package_id = p_subject_id AND c.tenant_id = p_tenant AND c.domain_id = p_domain
      UNION SELECT g.dependent_object_id FROM graph.dependencies g WHERE g.tenant_id = p_tenant AND g.domain_id = p_domain AND g.state = 'active' AND g.depends_on_kind = 'strategy' AND g.depends_on_id = v_pkg.decision_object_id) s;
    out := out || jsonb_build_object('exposure', v_n);
    basis := jsonb_build_object('version', v_version, 'reversibility_text', v_ver.reversibility, 'information_value_text', v_ver.information_value, 'information_value_word', v_iv,
      'strategic_relevance', v_rel, 'exposure', 'the commitment and the objects resting on the decision in the strategy graph', 'probability', 'no input: a material change carries no probability');
  ELSIF p_class = 'forecast.unfit' THEN
    -- the attention consumer's own count (attention.consumers.ts: the live scenarios on the forecast, the packages whose options cite it)
    SELECT count(*) INTO v_n FROM prediction.scenarios_current s WHERE s.tenant_id = p_tenant AND s.domain_id = p_domain AND s.forecast_id = p_subject_id AND s.state <> 'retired';
    SELECT count(DISTINCT o.package_id) INTO v_m FROM decision.options o
     WHERE o.tenant_id = p_tenant AND o.domain_id = p_domain AND EXISTS (SELECT 1 FROM jsonb_array_elements(o.consequences) c WHERE c ->> 'id' = p_subject_id::text);
    SELECT r2 INTO v_best FROM (
      SELECT executive.package_strategic_relevance(p_tenant, p_domain, p.package_id, p.current_version) AS r2
        FROM decision.packages_current p
       WHERE p.tenant_id = p_tenant AND p.domain_id = p_domain AND p.current_version IS NOT NULL
         AND p.package_id IN (SELECT o.package_id FROM decision.options o WHERE o.tenant_id = p_tenant AND o.domain_id = p_domain
                                AND EXISTS (SELECT 1 FROM jsonb_array_elements(o.consequences) c WHERE c ->> 'id' = p_subject_id::text))) t
     WHERE r2 IS NOT NULL ORDER BY (r2 ->> 'score')::numeric DESC, r2 ->> 'package_id' LIMIT 1;
    out := out || jsonb_build_object('exposure', v_n + v_m, 'strategic_relevance', v_best -> 'score');
    basis := jsonb_build_object('exposure', jsonb_build_object('scenarios', v_n, 'citing_packages', v_m),
      'strategic_relevance', coalesce(v_best, to_jsonb('no input: no package cites the forecast'::text)));
  ELSIF p_class = 'scenario.incoherent' THEN
    SELECT count(*) INTO v_n FROM simulation.runs_current r WHERE r.tenant_id = p_tenant AND r.domain_id = p_domain AND r.scenario_id = p_subject_id;
    SELECT count(DISTINCT o.package_id) INTO v_m FROM decision.options o
     WHERE o.tenant_id = p_tenant AND o.domain_id = p_domain AND EXISTS (SELECT 1 FROM jsonb_array_elements(o.consequences) c
             WHERE c ->> 'id' IN (SELECT r.run_id::text FROM simulation.runs_current r WHERE r.tenant_id = p_tenant AND r.domain_id = p_domain AND r.scenario_id = p_subject_id));
    out := out || jsonb_build_object('exposure', v_n + v_m);
    basis := jsonb_build_object('exposure', jsonb_build_object('runs', v_n, 'packages_citing_the_runs', v_m));
  ELSIF p_class = 'warning.raised' THEN
    SELECT w.warning_id, w.forecast_id, w.indicator_id, w.branch_id, w.response_window_closes_at INTO v_w
      FROM prediction.warnings_current w WHERE w.warning_id = p_subject_id AND w.tenant_id = p_tenant AND w.domain_id = p_domain;
    IF v_w.warning_id IS NULL THEN RETURN out || jsonb_build_object('dimension_basis', jsonb_build_object('note', 'no such warning: every further dimension has no input')); END IF;
    out := out || jsonb_build_object('hours_to_window', round((extract(epoch FROM (v_w.response_window_closes_at - v_at)) / 3600)::numeric, 1));
    SELECT f.forecast_id, f.series_key, f.quantiles INTO v_f FROM prediction.forecasts_current f
     WHERE f.tenant_id = p_tenant AND f.domain_id = p_domain
       AND f.forecast_id = coalesce(v_w.forecast_id, (SELECT s.forecast_id FROM prediction.branches_current b JOIN prediction.scenarios_current s USING (scenario_id) WHERE b.branch_id = v_w.branch_id));
    SELECT i.indicator_id, i.series_key, i.comparator, i.threshold INTO v_i FROM prediction.indicators_current i
     WHERE i.tenant_id = p_tenant AND i.domain_id = p_domain
       AND i.indicator_id = coalesce(v_w.indicator_id, (SELECT b.indicator_id FROM prediction.branches_current b WHERE b.branch_id = v_w.branch_id));
    IF v_f.forecast_id IS NULL OR v_i.indicator_id IS NULL THEN
      basis := jsonb_build_object('probability', format('no input: the warning names no %s', CASE WHEN v_f.forecast_id IS NULL THEN 'forecast' ELSE 'indicator' END));
    ELSIF v_f.series_key IS DISTINCT FROM v_i.series_key THEN
      basis := jsonb_build_object('probability', format('no input: the forecast is on %s, the indicator on %s', v_f.series_key, v_i.series_key));
    ELSE
      v_q10 := (v_f.quantiles ->> 'q10')::numeric; v_q50 := (v_f.quantiles ->> 'q50')::numeric; v_q90 := (v_f.quantiles ->> 'q90')::numeric;
      -- THE BRACKET: the probability that the forecast value is on the indicator's side of the threshold, read from where the threshold
      -- falls among the forecast's quantiles — [0.9, 1], [0.5, 0.9], [0.1, 0.5] or [0, 0.1]; the LOWER bound is the number judged.
      v_below := v_i.comparator IN ('<', '<=');
      IF v_below THEN
        IF (v_i.comparator = '<' AND v_i.threshold > v_q90) OR (v_i.comparator = '<=' AND v_i.threshold >= v_q90) THEN v_lo := 0.9; v_hi := 1;
        ELSIF (v_i.comparator = '<' AND v_i.threshold > v_q50) OR (v_i.comparator = '<=' AND v_i.threshold >= v_q50) THEN v_lo := 0.5; v_hi := 0.9;
        ELSIF (v_i.comparator = '<' AND v_i.threshold > v_q10) OR (v_i.comparator = '<=' AND v_i.threshold >= v_q10) THEN v_lo := 0.1; v_hi := 0.5;
        ELSE v_lo := 0; v_hi := 0.1; END IF;
      ELSE
        IF (v_i.comparator = '>' AND v_i.threshold < v_q10) OR (v_i.comparator = '>=' AND v_i.threshold <= v_q10) THEN v_lo := 0.9; v_hi := 1;
        ELSIF (v_i.comparator = '>' AND v_i.threshold < v_q50) OR (v_i.comparator = '>=' AND v_i.threshold <= v_q50) THEN v_lo := 0.5; v_hi := 0.9;
        ELSIF (v_i.comparator = '>' AND v_i.threshold < v_q90) OR (v_i.comparator = '>=' AND v_i.threshold <= v_q90) THEN v_lo := 0.1; v_hi := 0.5;
        ELSE v_lo := 0; v_hi := 0.1; END IF;
      END IF;
      out := out || jsonb_build_object('probability', v_lo);
      basis := jsonb_build_object('probability', jsonb_build_object('bracket', jsonb_build_array(v_lo, v_hi), 'judged', 'the lower bound',
        'forecast_id', v_f.forecast_id, 'indicator_id', v_i.indicator_id, 'comparator', v_i.comparator, 'threshold', v_i.threshold,
        'quantiles', jsonb_build_object('q10', v_q10, 'q50', v_q50, 'q90', v_q90),
        'reading', format('P(value %s %s) lies in [%s, %s] from the forecast''s quantiles at its target date; the indicator''s consecutive-day condition is not modelled', v_i.comparator, v_i.threshold, v_lo, v_hi)));
    END IF;
    basis := basis || jsonb_build_object('hours_to_window', 'the response window''s close against the database clock');
  ELSIF p_class = 'source.coverage_loss' THEN
    SELECT count(*) INTO v_n FROM observation.source_impact_markers k WHERE k.tenant_id = p_tenant AND k.domain_id = p_domain AND k.source_id = p_subject_id AND k.state = 'active';
    out := out || jsonb_build_object('exposure', v_n);
    basis := jsonb_build_object('exposure', 'the source''s active impact markers (issued forecasts, open warnings, citing packages)');
  ELSIF p_class = 'review.convened' THEN
    SELECT r.review_id, r.subject_kind, r.subject_id, r.due_at INTO v_rv FROM executive.reviews r WHERE r.review_id = p_subject_id AND r.tenant_id = p_tenant AND r.domain_id = p_domain;
    IF v_rv.review_id IS NULL THEN RETURN out || jsonb_build_object('dimension_basis', jsonb_build_object('note', 'no such review: every further dimension has no input')); END IF;
    out := out || jsonb_build_object('hours_to_window', CASE WHEN v_rv.due_at IS NULL THEN NULL ELSE round((extract(epoch FROM (v_rv.due_at - v_at)) / 3600)::numeric, 1) END);
    IF v_rv.subject_kind = 'objective' THEN
      out := out || jsonb_build_object('strategic_relevance', CASE WHEN EXISTS (SELECT 1 FROM graph.strategy_current s WHERE s.strategy_object_id = v_rv.subject_id AND s.object_type = 'OBJ' AND s.status = 'active') THEN 1 ELSE 0 END);
      basis := jsonb_build_object('strategic_relevance', 'the review''s subject is an objective (1 while it is active)');
    ELSE
      basis := jsonb_build_object('strategic_relevance', format('no input: the review''s subject is a %s', v_rv.subject_kind));
    END IF;
    basis := basis || jsonb_build_object('hours_to_window', 'the review''s due instant against the database clock');
  /* B34 (0090) attention: the four new classes — each READ FROM ITS RECORD (the event's payload is a hint, never trusted for a fact). */
  ELSIF p_class = 'opportunity.raised' THEN
    SELECT x.exposure_id, x.polarity, x.state, x.accepted_version, x.accepted_at INTO v_x
      FROM prediction.exposure_current x WHERE x.exposure_id = p_subject_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
    IF v_x.exposure_id IS NULL THEN RETURN out || jsonb_build_object('dimension_basis', jsonb_build_object('note', 'no such exposure: every further dimension has no input')); END IF;
    IF v_x.accepted_version IS NULL THEN
      RETURN out || jsonb_build_object('hours_to_window', NULL, 'dimension_basis', jsonb_build_object('note', 'no accepted assessment: an unaccepted estimate is no input (prediction.exposure_dimensions'' rule)'));
    END IF;
    SELECT v.probability_low, v.probability_high, v.plausibility, v.response_window_hours, v.reversibility, v.confidence INTO v_xv
      FROM prediction.exposure_versions v WHERE v.exposure_id = p_subject_id AND v.version = v_x.accepted_version;
    SELECT count(*) INTO v_objs FROM graph.strategy_current s WHERE s.strategy_object_id = ANY (prediction.exposure_objectives(p_subject_id)) AND s.object_type = 'OBJ' AND s.status = 'active';
    SELECT count(*) INTO v_n FROM prediction.exposure_responses r WHERE r.exposure_id = p_subject_id AND r.tenant_id = p_tenant AND r.domain_id = p_domain;
    out := out || jsonb_build_object('probability', v_xv.probability_low, 'exposure', v_objs + v_n, 'strategic_relevance', CASE WHEN v_objs > 0 THEN 1 ELSE 0 END,
      'irreversibility', CASE v_xv.reversibility WHEN 'reversible' THEN 'reversible' WHEN 'partly_reversible' THEN 'costly' WHEN 'irreversible' THEN 'irreversible' END,
      'hours_to_window', CASE WHEN v_xv.response_window_hours IS NULL THEN NULL
                              ELSE round((extract(epoch FROM (v_x.accepted_at + make_interval(hours => v_xv.response_window_hours) - v_at)) / 3600)::numeric, 1) END);
    basis := jsonb_build_object('accepted_version', v_x.accepted_version,
      'probability', CASE WHEN v_xv.probability_low IS NULL THEN to_jsonb(format('no input: the accepted version states plausibility %s, no probability bracket', coalesce(v_xv.plausibility, 'none')))
                          ELSE jsonb_build_object('bracket', jsonb_build_array(v_xv.probability_low, v_xv.probability_high), 'judged', 'the lower bound') END,
      'exposure', jsonb_build_object('active_objectives', v_objs, 'response_decisions', v_n),
      'strategic_relevance', 'the opportunity rests on an active objective (1) or none (0)',
      'irreversibility', format('the accepted version''s reversibility %s (partly_reversible read as costly)', coalesce(v_xv.reversibility, 'not stated')),
      'hours_to_window', 'the accepted version''s response window from its acceptance, against the database clock');
  ELSIF p_class = 'health.change' THEN
    SELECT c.change_id, c.subject, c.snapshot_id INTO v_hc FROM executive.health_score_changes c WHERE c.change_id = p_subject_id AND c.tenant_id = p_tenant AND c.domain_id = p_domain;
    IF v_hc.change_id IS NULL THEN RETURN out || jsonb_build_object('dimension_basis', jsonb_build_object('note', 'no such score change: every further dimension has no input')); END IF;
    SELECT s.result INTO v_hres FROM executive.health_score_snapshots s WHERE s.snapshot_id = v_hc.snapshot_id;
    SELECT coalesce(jsonb_agg(x), '[]'::jsonb) INTO v_hdims FROM jsonb_array_elements(coalesce(v_hres -> 'dimensions', '[]'::jsonb)) x
     WHERE v_hc.subject = 'aggregate' OR 'dimension:' || (x ->> 'key') = v_hc.subject;
    SELECT count(DISTINCT l ->> 'decision_id') INTO v_links FROM jsonb_array_elements(v_hdims) x, jsonb_array_elements(coalesce(x -> 'decision_links', '[]'::jsonb)) l;
    SELECT count(*) INTO v_hobj FROM graph.strategy_current s WHERE s.object_type = 'OBJ' AND s.status = 'active' AND s.tenant_id = p_tenant AND s.domain_id = p_domain
       AND s.strategy_object_id::text IN (SELECT o #>> '{}' FROM jsonb_array_elements(v_hdims) x, jsonb_array_elements(coalesce(x -> 'objective_ids', '[]'::jsonb)) o);
    out := out || jsonb_build_object('exposure', v_links, 'strategic_relevance', CASE WHEN v_hobj > 0 THEN 1 ELSE 0 END);
    basis := jsonb_build_object('exposure', format('the decisions the %s informs (the snapshot''s decision links)', v_hc.subject),
      'strategic_relevance', format('%s active objective(s) behind the %s', v_hobj, v_hc.subject), 'probability', 'no input: a score change is a computed fact, not a likelihood',
      'irreversibility', 'no input: a score change triggers review, never action');
  ELSIF p_class IN ('commitment.due', 'commitment.breach') THEN
    -- the commitment item READ THROUGH THE SIGNAL CONTRACT ONLY (decision.commitment_item_signal, 0090 §0.7; the commitments part owns the record)
    v_sig := decision.commitment_item_signal(p_tenant, p_domain, p_subject_id);
    IF v_sig IS NULL THEN
      RETURN out || jsonb_build_object('hours_to_window', NULL, 'dimension_basis', jsonb_build_object('note', 'the signal contract knows no such commitment item (decision.commitment_item_signal answered NULL)'));
    END IF;
    out := out || jsonb_build_object('exposure', coalesce((v_sig ->> 'open_exceptions')::int, 0),
      'strategic_relevance', CASE WHEN jsonb_typeof(v_sig -> 'objectives') = 'array' AND jsonb_array_length(v_sig -> 'objectives') > 0 THEN 1 ELSE 0 END,
      'hours_to_window', CASE WHEN v_sig ->> 'due_at' IS NULL THEN NULL ELSE round((extract(epoch FROM ((v_sig ->> 'due_at')::timestamptz - v_at)) / 3600)::numeric, 1) END);
    basis := jsonb_build_object('exposure', 'the item''s open exceptions', 'strategic_relevance', 'the item serves an objective (1) or none (0)',
      'hours_to_window', 'the item''s due instant against the database clock (negative: overdue)', 'probability', 'no input: a commitment item carries no probability');
  /* end B34 attention */
  ELSE
    basis := jsonb_build_object('note', format('no further input exists for %s', p_class));
  END IF;
  -- B28 (0088 §S8): NOVELTY (V00-T-069; F-P4-10's detector) — a number in [0, 1]: the share of the baseline's own deviations the observed
  -- window's deviation exceeds. A warning escalated from a weak signal carries that signal's novelty; a warning on an indicator carries the
  -- indicator's LATEST novelty reading (a held reading — too few points, a source gap, a drifting baseline — is no input); every other class
  -- has no novelty input (declared, never invented).
  IF p_class = 'warning.raised' THEN
    SELECT w.origin_kind, w.origin_ref, coalesce(w.indicator_id, (SELECT b.indicator_id FROM prediction.branches_current b WHERE b.branch_id = w.branch_id)) AS indicator_id INTO v_nw
      FROM prediction.warnings_current w WHERE w.warning_id = p_subject_id AND w.tenant_id = p_tenant AND w.domain_id = p_domain;
    IF v_nw.origin_kind = 'weak_signal' AND (v_nw.origin_ref ->> 'signal_id') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      SELECT s.signal_id, s.novelty, s.detector_key, s.as_of, s.detection_id INTO v_nd FROM prediction.signals_current s
       WHERE s.signal_id = (v_nw.origin_ref ->> 'signal_id')::uuid AND s.tenant_id = p_tenant AND s.domain_id = p_domain;
      IF v_nd.signal_id IS NOT NULL AND v_nd.novelty IS NOT NULL THEN
        v_nov := v_nd.novelty;
        v_nbasis := jsonb_build_object('source', 'the weak signal the warning was escalated from', 'signal_id', v_nd.signal_id, 'detector', v_nd.detector_key, 'detection_id', v_nd.detection_id, 'as_of', v_nd.as_of);
      ELSE
        v_nbasis := to_jsonb('no input: the weak signal the warning was escalated from carries no novelty measure (an analyst''s nomination, or another detector)'::text);
      END IF;
    ELSIF v_nw.indicator_id IS NOT NULL THEN
      SELECT d.detection_id, d.measure, d.as_of, d.held_reason, d.fired INTO v_nd FROM prediction.signal_detections d
       WHERE d.tenant_id = p_tenant AND d.domain_id = p_domain AND d.detector_key = 'novelty' AND d.subject_kind = 'indicator' AND d.subject_id = v_nw.indicator_id
       ORDER BY d.as_of DESC, d.recorded_at DESC LIMIT 1;
      IF v_nd.detection_id IS NULL THEN v_nbasis := to_jsonb('no input: the novelty detector has not read the warning''s indicator'::text);
      ELSIF v_nd.held_reason IS NOT NULL THEN v_nbasis := to_jsonb(format('no input: the latest novelty reading of the warning''s indicator (as of %s) is held — %s', v_nd.as_of, v_nd.held_reason));
      ELSE
        v_nov := v_nd.measure;
        v_nbasis := jsonb_build_object('source', 'the novelty detector''s latest reading of the warning''s indicator', 'detection_id', v_nd.detection_id, 'indicator_id', v_nw.indicator_id,
                                       'as_of', v_nd.as_of, 'fired', v_nd.fired);
      END IF;
    ELSE
      v_nbasis := to_jsonb('no input: the warning names neither a weak signal nor an indicator'::text);
    END IF;
  ELSE
    v_nbasis := to_jsonb(format('no input: no novelty detector reads a %s', p_class));
  END IF;
  out := out || jsonb_build_object('novelty', v_nov);
  basis := basis || jsonb_build_object('novelty', v_nbasis);
  RETURN out || jsonb_build_object('dimension_basis', basis);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.attention_dimensions(uuid,uuid,text,uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.attention_dimensions(uuid,uuid,text,uuid,jsonb) TO eye_commit;
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §A4 THE ACT — a consequential action LAUNCHED from an item, under the human gate (F-P6-07; PR-44-*, CAP-EO-06)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- THE REGISTRY: per signal class, the governed actions an item of that class may launch — each an EXISTING product action with its own
-- PDP rule and port (the act never widens what the actor may do: the governed action is performed as its OWN governed write under the
-- acting human's session). Append-only; a later migration adds rows. health.change has NO act — "a score change triggers review, never
-- action" (0089 §H4) — and the registry refuses a row for it.
CREATE TABLE executive.attention_act_registry (
  signal_class    text NOT NULL CHECK (signal_class = ANY (executive.attention_signal_classes())),
  action_key      text NOT NULL CHECK (action_key ~ '^[a-z][a-z0-9_]{2,40}$'),
  governed_action text NOT NULL CHECK (governed_action ~ '^[a-z][a-z0-9_.]{3,120}$'),
  gate            text NOT NULL CHECK (gate = 'human_gate'),
  target_kind     text NOT NULL,
  description     text NOT NULL CHECK (length(btrim(description)) >= 8),
  since           text NOT NULL,
  PRIMARY KEY (signal_class, action_key),
  CONSTRAINT xaar_no_score_action CHECK (signal_class <> 'health.change')
);
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON executive.attention_act_registry FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
REVOKE ALL ON executive.attention_act_registry FROM PUBLIC;
GRANT SELECT ON executive.attention_act_registry TO eye_app, eye_commit;
COMMENT ON TABLE executive.attention_act_registry IS 'B34 (0090 §A4): the governed actions an attention item of a class may launch (signal class → governed action, human-gated); append-only; health.change has none (a score change triggers review, never action)';
-- The rows for the actions that exist at 0090. commitment.breach's row is the integrator's, once the commitments part's action exists.
INSERT INTO executive.attention_act_registry (signal_class, action_key, governed_action, gate, target_kind, description, since) VALUES
  ('opportunity.raised', 'sponsor', 'prediction.exposure.sponsor', 'human_gate', 'exposure', 'sponsor the opportunity''s exact assessed version (an opportunity sponsor; the evaluation is opened from the exposure)', '0090'),
  ('warning.raised', 'acknowledge_warning', 'prediction.warning.acknowledge', 'human_gate', 'warning', 'acknowledge the warning itself (a person answering for it), from its attention item', '0090');

-- THE ACTS: one row per launch — launched → acted (the governed action's effect reference) | refused (the governed action's refusal);
-- the actor's rationale; never deleted. ONE act in flight per item.
CREATE TABLE executive.attention_item_acts (
  act_id           uuid PRIMARY KEY,
  scope            text NOT NULL,
  tenant_id        uuid NOT NULL,
  domain_id        uuid NOT NULL,
  item_id          uuid NOT NULL REFERENCES executive.attention_items (item_id),
  signal_class     text NOT NULL,
  action_key       text NOT NULL,
  governed_action  text NOT NULL,
  target_kind      text NOT NULL,
  target_id        uuid NOT NULL,
  rationale        text NOT NULL CHECK (length(btrim(rationale)) BETWEEN 8 AND 2000),
  state            text NOT NULL DEFAULT 'launched' CHECK (state IN ('launched', 'acted', 'refused')),
  launched_by      uuid NOT NULL,
  launched_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  effect_ref       text,
  effect           jsonb,
  refusal          text,
  settled_at       timestamptz,
  correlation_id   uuid NOT NULL,
  CONSTRAINT xaia_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT xaia_registered FOREIGN KEY (signal_class, action_key) REFERENCES executive.attention_act_registry (signal_class, action_key),
  CONSTRAINT xaia_settled CHECK ((state = 'launched') = (settled_at IS NULL)
                                 AND (state <> 'acted' OR (effect_ref IS NOT NULL AND length(btrim(effect_ref)) > 0))
                                 AND (state <> 'refused' OR (refusal IS NOT NULL AND length(btrim(refusal)) > 0)))
);
CREATE UNIQUE INDEX xaia_one_in_flight ON executive.attention_item_acts (item_id) WHERE state = 'launched';
CREATE INDEX xaia_item ON executive.attention_item_acts (item_id, launched_at);
CREATE OR REPLACE FUNCTION executive.attention_item_acts_settle_once() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'attention act rejected: an act is never deleted' USING ERRCODE = '2F002'; END IF;
  IF OLD.state <> 'launched' OR NEW.state = 'launched'
     OR (to_jsonb(NEW) - ARRAY['state', 'effect_ref', 'effect', 'refusal', 'settled_at']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['state', 'effect_ref', 'effect', 'refusal', 'settled_at']) THEN
    RAISE EXCEPTION 'attention act rejected: act % is % and settles once (launched → acted | refused)', OLD.act_id, OLD.state USING ERRCODE = '2F002';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER settle_once BEFORE UPDATE OR DELETE ON executive.attention_item_acts FOR EACH ROW EXECUTE FUNCTION executive.attention_item_acts_settle_once();
REVOKE ALL ON executive.attention_item_acts FROM PUBLIC;
ALTER TABLE executive.attention_item_acts ENABLE ROW LEVEL SECURITY;
ALTER TABLE executive.attention_item_acts FORCE ROW LEVEL SECURITY;
CREATE POLICY executive_isolation ON executive.attention_item_acts
  USING (tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain()));
GRANT SELECT ON executive.attention_item_acts TO eye_app, eye_commit;
COMMENT ON TABLE executive.attention_item_acts IS 'B34 (0090 §A4): the act transition — a registered governed action launched from an attention item by a named, active member who may act on it, settled acted (the effect reference) or refused (the reason); item.acted / item.act_refused on the item''s log';

CREATE OR REPLACE FUNCTION executive.attention_act_answer(a executive.attention_item_acts, p_repeated boolean) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_object('act_id', a.act_id, 'item_id', a.item_id, 'signal_class', a.signal_class, 'action_key', a.action_key, 'governed_action', a.governed_action,
                            'target_kind', a.target_kind, 'target_id', a.target_id, 'rationale', a.rationale, 'state', a.state, 'launched_by', a.launched_by, 'launched_at', a.launched_at,
                            'effect_ref', a.effect_ref, 'effect', a.effect, 'refusal', a.refusal, 'settled_at', a.settled_at, 'repeated', p_repeated);
$$;
REVOKE ALL ON FUNCTION executive.attention_act_answer(executive.attention_item_acts, boolean) FROM PUBLIC;

-- LAUNCH: the act's own governed write (executive.attention.item.act, human-gated at the PDP). A named, active MEMBER (0090 §0.2) who
-- may act on the item (its owner, a holder of its roles, an administrator, a delegate); a registered action of the item's class; a live
-- item; a rationale. Idempotent on the act id. The governed action is NOT performed here: the route performs it next, as its own write.
CREATE OR REPLACE FUNCTION executive.launch_attention_act(p_act_id uuid, p_item uuid, p_tenant uuid, p_domain uuid, p_action_key text, p_rationale text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, decision, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE x executive.attention_items%ROWTYPE; g executive.attention_act_registry%ROWTYPE; a executive.attention_item_acts%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.attention.item.act']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'attention act rejected: launched by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO a FROM executive.attention_item_acts z WHERE z.act_id = p_act_id;
  IF FOUND THEN
    IF a.item_id <> p_item OR a.launched_by <> p_actor OR a.action_key IS DISTINCT FROM p_action_key THEN
      RAISE EXCEPTION 'attention act rejected (act_id_reused): act % names another item, actor or action', p_act_id USING ERRCODE = '22023';
    END IF;
    RETURN executive.attention_act_answer(a, true);
  END IF;
  IF NOT decision.is_active_human(p_actor, p_tenant) THEN
    RAISE EXCEPTION 'attention act rejected: an act is a named, active member''s — never an agent''s or an external collaborator''s' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO x FROM executive.attention_items i WHERE i.item_id = p_item AND i.tenant_id = p_tenant AND i.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'attention act rejected: no such item in this domain' USING ERRCODE = '23503'; END IF;
  IF x.signal_class = 'health.change' THEN
    RAISE EXCEPTION 'attention act rejected (no_act): a score change triggers review, never action — acknowledge, challenge or close the item' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO g FROM executive.attention_act_registry r WHERE r.signal_class = x.signal_class AND r.action_key = p_action_key;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'attention act rejected (no_act): % is not a registered act of the class % (%)', coalesce(p_action_key, '<none>'), x.signal_class,
      coalesce((SELECT string_agg(r.action_key, ', ' ORDER BY r.action_key) FROM executive.attention_act_registry r WHERE r.signal_class = x.signal_class), 'none registered') USING ERRCODE = '22023';
  END IF;
  IF NOT executive.may_act_on_item(x, p_actor) THEN
    RAISE EXCEPTION 'attention act rejected: item % is routed to % (owner %); the acting principal may not act on it', p_item, array_to_string(x.route_roles, ', '), coalesce(x.owner_principal_id::text, 'none') USING ERRCODE = '42501';
  END IF;
  IF x.state NOT IN ('open', 'escalated', 'unrouted', 'acknowledged') THEN
    RAISE EXCEPTION 'attention act rejected (not_live): item % is %; an act is launched from an open, escalated, unrouted or acknowledged item', p_item, x.state USING ERRCODE = '22023';
  END IF;
  IF coalesce(length(btrim(p_rationale)), 0) < 8 THEN RAISE EXCEPTION 'attention act rejected: an act states its rationale (8+ characters)' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM executive.attention_item_acts z WHERE z.item_id = p_item AND z.state = 'launched') THEN
    RAISE EXCEPTION 'attention act rejected (in_flight): item % has an act launched and not yet settled', p_item USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM executive.attention_item_acts z WHERE z.item_id = p_item AND z.action_key = p_action_key AND z.state = 'acted') THEN
    RAISE EXCEPTION 'attention act rejected (already_acted): % was already acted from item %', p_action_key, p_item USING ERRCODE = '22023';
  END IF;
  INSERT INTO executive.attention_item_acts (act_id, scope, tenant_id, domain_id, item_id, signal_class, action_key, governed_action, target_kind, target_id, rationale, launched_by, correlation_id)
  VALUES (p_act_id, 'DOMAIN', p_tenant, p_domain, p_item, x.signal_class, g.action_key, g.governed_action, g.target_kind, x.subject_id, btrim(p_rationale), p_actor, p_correlation)
  RETURNING * INTO a;
  RETURN executive.attention_act_answer(a, false);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.launch_attention_act(uuid,uuid,uuid,uuid,text,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.launch_attention_act(uuid,uuid,uuid,uuid,text,text,uuid,uuid) TO eye_commit;

-- SETTLE (executive.act_on_attention_item): the launcher records what the governed action came to — acted (its effect reference and a
-- summary of its answer) or refused (the refusal it met) — and the item's log carries item.acted | item.act_refused. The item's state is
-- not moved: an act is not an acknowledgement (the person acknowledges or closes the item as ever).
CREATE OR REPLACE FUNCTION executive.act_on_attention_item(p_act_id uuid, p_tenant uuid, p_domain uuid, p_outcome text, p_effect_ref text, p_effect jsonb, p_refusal text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE a executive.attention_item_acts%ROWTYPE; v_at timestamptz := clock_timestamp();
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.attention.item.act']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'attention act rejected: settled by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO a FROM executive.attention_item_acts z WHERE z.act_id = p_act_id AND z.tenant_id = p_tenant AND z.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'attention act rejected: no such act in this domain' USING ERRCODE = '23503'; END IF;
  IF a.launched_by <> p_actor THEN RAISE EXCEPTION 'attention act rejected: an act is settled by the member who launched it' USING ERRCODE = '42501'; END IF;
  IF a.state <> 'launched' THEN RAISE EXCEPTION 'attention act rejected (settled): act % is already %', p_act_id, a.state USING ERRCODE = '22023'; END IF;
  IF p_outcome IS NULL OR p_outcome NOT IN ('acted', 'refused') THEN RAISE EXCEPTION 'attention act rejected: an act settles acted or refused' USING ERRCODE = '22023'; END IF;
  IF p_outcome = 'acted' AND coalesce(length(btrim(p_effect_ref)), 0) = 0 THEN RAISE EXCEPTION 'attention act rejected: an acted act names its effect' USING ERRCODE = '22023'; END IF;
  IF p_outcome = 'refused' AND coalesce(length(btrim(p_refusal)), 0) = 0 THEN RAISE EXCEPTION 'attention act rejected: a refused act says why' USING ERRCODE = '22023'; END IF;
  UPDATE executive.attention_item_acts SET state = p_outcome, effect_ref = CASE WHEN p_outcome = 'acted' THEN left(btrim(p_effect_ref), 500) END,
         effect = CASE WHEN jsonb_typeof(p_effect) = 'object' THEN p_effect END, refusal = CASE WHEN p_outcome = 'refused' THEN left(btrim(p_refusal), 1000) END, settled_at = v_at
   WHERE act_id = p_act_id RETURNING * INTO a;
  PERFORM executive.attention_event(a.item_id, p_tenant, p_domain, CASE p_outcome WHEN 'acted' THEN 'item.acted' ELSE 'item.act_refused' END, p_actor,
            jsonb_build_object('act_id', a.act_id, 'action_key', a.action_key, 'governed_action', a.governed_action, 'target_kind', a.target_kind, 'target_id', a.target_id,
                               'rationale', a.rationale, 'effect_ref', a.effect_ref, 'effect', a.effect, 'refusal', a.refusal, 'gate', 'human_gate'), p_correlation);
  RETURN executive.attention_act_answer(a, false);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.act_on_attention_item(uuid,uuid,uuid,text,text,jsonb,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.act_on_attention_item(uuid,uuid,uuid,text,text,jsonb,text,uuid,uuid) TO eye_commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §A5 THE QUEUE EVALUATION — 0086:1871 copied whole; B34: the ranking fairness (reported, gating nothing)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION executive.evaluate_attention_queue(p_evaluation_id uuid, p_tenant uuid, p_domain uuid, p_window_from timestamptz, p_window_to timestamptz, p_min_sample int, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_at timestamptz := clock_timestamp(); v_from timestamptz; v_to timestamptz; v_min int := coalesce(p_min_sample, 5);
        v_items jsonb; v_severe_list jsonb; c record; t record; s record; e record;
        v_classes jsonb := '{}'::jsonb; v_overall jsonb; v_stab jsonb; v_sev jsonb; v_delivery jsonb; v_breaches jsonb; v_esc jsonb; v_measures jsonb;
        v_class_measured int := 0; v_class_abstained int := 0; v_n bigint; v_verdict text; v_reason text; v_p jsonb; v_r jsonb;
        /* B34 (0090) */ v_fair jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.attention.queue.evaluate']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'attention queue evaluation rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF NOT executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['executive', 'domain_admin', 'platform_admin']) THEN
    RAISE EXCEPTION 'attention queue evaluation rejected: the queue is evaluated by a named human holding executive, domain_admin or platform_admin' USING ERRCODE = '42501';
  END IF;
  IF v_min < 1 OR v_min > 10000 THEN RAISE EXCEPTION 'attention queue evaluation rejected: min_sample is a whole number in [1, 10000]' USING ERRCODE = '22023'; END IF;
  v_to := coalesce(p_window_to, v_at); v_from := coalesce(p_window_from, v_to - interval '30 days');
  IF v_to < v_from THEN RAISE EXCEPTION 'attention queue evaluation rejected: the window ends before it begins' USING ERRCODE = '22023'; END IF;

  -- THE ITEMS OF THE WINDOW, each with what its ledger says: the latest disposition, whether it was elevated to material later, its FIRST
  -- deadline (the one its routing set — 0083's item.routed / item.escalated / item.unrouted carry due_at), whether it was ever deprioritized
  -- for overload.
  SELECT coalesce(jsonb_agg(f), '[]'::jsonb) INTO v_items FROM (
    SELECT i.item_id, i.signal_class, i.outcome, i.state, i.created_at, i.acknowledged_at, i.closed_at, i.evaluation #>> '{dimensions,consequence}' AS consequence,
           (SELECT d.details ->> 'disposition' FROM executive.attention_item_events d WHERE d.item_id = i.item_id AND d.event = 'item.disposition' ORDER BY d.occurred_at DESC, d.event_id DESC LIMIT 1) AS disposition,
           EXISTS (SELECT 1 FROM executive.attention_item_events d WHERE d.item_id = i.item_id
                     AND (d.event = 'item.elevated' OR (d.event = 'item.reevaluated' AND d.details ->> 'to_outcome' = 'material' AND d.details ->> 'from_outcome' IS DISTINCT FROM 'material'))) AS elevated,
           coalesce((SELECT (d.details ->> 'due_at')::timestamptz FROM executive.attention_item_events d
                      WHERE d.item_id = i.item_id AND d.event IN ('item.routed', 'item.escalated', 'item.unrouted') AND jsonb_typeof(d.details -> 'due_at') = 'string'
                      ORDER BY d.occurred_at, d.event_id LIMIT 1),
                    CASE WHEN i.escalations = 0 AND i.outcome = 'material' THEN i.due_at END) AS first_due,
           EXISTS (SELECT 1 FROM executive.attention_item_events d WHERE d.item_id = i.item_id AND d.event = 'item.overload_deprioritized') AS overload
      FROM executive.attention_items i
     WHERE i.tenant_id = p_tenant AND i.domain_id = p_domain AND i.created_at >= v_from AND i.created_at <= v_to
     ORDER BY i.created_at, i.item_id) f;

  -- PRECISION AND RECALL BY CLASS (and pooled). Positive: material when it arrived, acknowledged, then actioned. Negative (a false alarm):
  -- material, then not_material or duplicate, or closed without ever being acknowledged. A recall miss: `missed` recorded on an item the
  -- engine did not judge material, or an item elevated / re-evaluated to material later (it is a miss, never also a positive).
  FOR c IN
    WITH b AS (SELECT * FROM jsonb_to_recordset(v_items) AS r(item_id uuid, signal_class text, outcome text, state text, created_at timestamptz, acknowledged_at timestamptz, closed_at timestamptz,
                                                          consequence text, disposition text, elevated boolean, first_due timestamptz, overload boolean))
    SELECT coalesce(b.signal_class, '*') AS signal_class, count(*) AS items,
           count(*) FILTER (WHERE b.outcome = 'material' AND NOT b.elevated AND b.acknowledged_at IS NOT NULL AND b.disposition = 'actioned') AS tp,
           count(*) FILTER (WHERE b.outcome = 'material' AND NOT b.elevated AND (b.disposition IN ('not_material', 'duplicate') OR (b.state = 'closed' AND b.acknowledged_at IS NULL AND coalesce(b.disposition, '') NOT IN ('actioned', 'late')))) AS fp,
           count(*) FILTER (WHERE (b.outcome <> 'material' AND b.disposition = 'missed') OR b.elevated) AS fn,
           count(*) FILTER (WHERE b.disposition = 'late') AS late,
           count(*) FILTER (WHERE b.disposition IS NULL) AS undisposed,
           GROUPING(b.signal_class) AS pooled
      FROM b GROUP BY ROLLUP (b.signal_class) ORDER BY GROUPING(b.signal_class), b.signal_class
  LOOP
    v_p := executive.attention_ratio(c.tp, c.tp + c.fp, v_min, 'precision');
    v_r := executive.attention_ratio(c.tp, c.tp + c.fn, v_min, 'recall');
    IF c.pooled = 1 THEN
      v_overall := jsonb_build_object('items', c.items, 'true_positive', c.tp, 'false_positive', c.fp, 'missed', c.fn, 'late', c.late, 'undisposed', c.undisposed, 'precision', v_p, 'recall', v_r);
    ELSE
      v_classes := v_classes || jsonb_build_object(c.signal_class, jsonb_build_object('items', c.items, 'true_positive', c.tp, 'false_positive', c.fp, 'missed', c.fn, 'late', c.late,
                                                                                       'undisposed', c.undisposed, 'precision', v_p, 'recall', v_r));
      v_class_measured := v_class_measured + (CASE WHEN (v_p ->> 'abstained')::boolean THEN 0 ELSE 1 END) + (CASE WHEN (v_r ->> 'abstained')::boolean THEN 0 ELSE 1 END);
      v_class_abstained := v_class_abstained + (CASE WHEN (v_p ->> 'abstained')::boolean THEN 1 ELSE 0 END) + (CASE WHEN (v_r ->> 'abstained')::boolean THEN 1 ELSE 0 END);
    END IF;
  END LOOP;
  v_overall := coalesce(v_overall, jsonb_build_object('items', 0, 'true_positive', 0, 'false_positive', 0, 'missed', 0, 'late', 0, 'undisposed', 0,
                                                      'precision', executive.attention_ratio(0, 0, v_min, 'precision'), 'recall', executive.attention_ratio(0, 0, v_min, 'recall')));

  -- RANKING STABILITY: Kendall tau-b between each item's rank at the window's start and at its end, over the items ranked at both.
  WITH ranked AS (
    SELECT i.item_id, executive.attention_rank_at(i, v_from) AS a, executive.attention_rank_at(i, v_to) AS z
      FROM executive.attention_items i WHERE i.tenant_id = p_tenant AND i.domain_id = p_domain AND i.created_at <= v_to AND (i.closed_at IS NULL OR i.closed_at >= v_from)
  ), both_ends AS (SELECT * FROM ranked WHERE a IS NOT NULL AND z IS NOT NULL),
  pairs AS (SELECT CASE WHEN r1.a < r2.a THEN -1 WHEN r1.a > r2.a THEN 1 ELSE 0 END AS sa, CASE WHEN r1.z < r2.z THEN -1 WHEN r1.z > r2.z THEN 1 ELSE 0 END AS sz
                FROM both_ends r1 JOIN both_ends r2 ON r1.item_id < r2.item_id)
  SELECT (SELECT count(*) FROM ranked WHERE a IS NOT NULL OR z IS NOT NULL) AS any_rank, (SELECT count(*) FROM both_ends) AS n,
         count(*) AS n0, count(*) FILTER (WHERE sa * sz > 0) AS conc, count(*) FILTER (WHERE sa * sz < 0) AS disc,
         count(*) FILTER (WHERE sa = 0) AS ta, count(*) FILTER (WHERE sz = 0) AS tz
    INTO t FROM pairs;
  v_stab := CASE
    WHEN t.any_rank = 0 THEN jsonb_build_object('abstained', true, 'ranked', 0, 'reason', 'no rank exists: no item of the queue carries evaluation.rank (the ranking is another section''s)')
    WHEN t.n < greatest(2, v_min) THEN jsonb_build_object('abstained', true, 'ranked', t.n, 'reason', format('%s item(s) ranked at both ends of the window, below min_sample %s (at least 2)', t.n, greatest(2, v_min)))
    WHEN (t.n0 - t.ta) * (t.n0 - t.tz) = 0 THEN jsonb_build_object('abstained', true, 'ranked', t.n, 'reason', 'every rank is tied at one end of the window: tau is undefined')
    ELSE jsonb_build_object('abstained', false, 'ranked', t.n, 'method', 'kendall_tau_b', 'concordant', t.conc, 'discordant', t.disc, 'ties_start', t.ta, 'ties_end', t.tz,
                            'value', round((t.conc - t.disc)::numeric / sqrt(((t.n0 - t.ta) * (t.n0 - t.tz))::numeric), 4)) END;

  -- SEVERE-ITEM VISIBILITY (C3/C4): acknowledged before the first deadline, delivered before it (when a delivery ledger exists), never
  -- deprioritized for overload, the time to acknowledgement; every breach named.
  SELECT count(*) AS n, count(*) FILTER (WHERE b.first_due IS NOT NULL) AS routed,
         count(*) FILTER (WHERE b.first_due IS NOT NULL AND b.acknowledged_at IS NOT NULL AND b.acknowledged_at <= b.first_due) AS ack_in_time,
         count(*) FILTER (WHERE b.acknowledged_at IS NOT NULL) AS acked, count(*) FILTER (WHERE b.overload) AS overload,
         percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM (b.acknowledged_at - b.created_at))) FILTER (WHERE b.acknowledged_at IS NOT NULL) AS p50,
         percentile_cont(0.9) WITHIN GROUP (ORDER BY extract(epoch FROM (b.acknowledged_at - b.created_at))) FILTER (WHERE b.acknowledged_at IS NOT NULL) AS p90
    INTO s
    FROM jsonb_to_recordset(v_items) AS b(item_id uuid, signal_class text, outcome text, state text, created_at timestamptz, acknowledged_at timestamptz, closed_at timestamptz,
                                        consequence text, disposition text, elevated boolean, first_due timestamptz, overload boolean)
   WHERE b.consequence IN ('C3', 'C4');
  SELECT coalesce(jsonb_agg(x ORDER BY x ->> 'created_at', x ->> 'breach'), '[]'::jsonb) INTO v_breaches FROM (
    SELECT jsonb_build_object('item_id', b.item_id, 'signal_class', b.signal_class, 'consequence', b.consequence, 'breach', 'overload_deprioritized', 'created_at', b.created_at) AS x
      FROM jsonb_to_recordset(v_items) AS b(item_id uuid, signal_class text, consequence text, created_at timestamptz, overload boolean)
     WHERE b.consequence IN ('C3', 'C4') AND b.overload
    UNION ALL
    SELECT jsonb_build_object('item_id', b.item_id, 'signal_class', b.signal_class, 'consequence', b.consequence, 'breach', 'unacknowledged_past_deadline', 'deadline', b.first_due,
                              'acknowledged_at', b.acknowledged_at, 'created_at', b.created_at)
      FROM jsonb_to_recordset(v_items) AS b(item_id uuid, signal_class text, consequence text, created_at timestamptz, acknowledged_at timestamptz, first_due timestamptz)
     WHERE b.consequence IN ('C3', 'C4') AND b.first_due IS NOT NULL AND b.first_due <= v_at AND (b.acknowledged_at IS NULL OR b.acknowledged_at > b.first_due)) q;
  SELECT coalesce(jsonb_agg(jsonb_build_object('item_id', b.item_id, 'deadline', b.first_due)), '[]'::jsonb) INTO v_severe_list
    FROM jsonb_to_recordset(v_items) AS b(item_id uuid, consequence text, first_due timestamptz) WHERE b.consequence IN ('C3', 'C4');
  IF to_regclass('executive.attention_deliveries') IS NULL THEN
    v_delivery := jsonb_build_object('measurable', false, 'reason', 'not measurable: this deployment has no delivery ledger (executive.attention_deliveries)');
  ELSIF s.n = 0 THEN
    v_delivery := jsonb_build_object('measurable', false, 'reason', 'no C3/C4 item in the window');
  ELSE
    BEGIN
      EXECUTE 'SELECT count(*) FROM jsonb_to_recordset($1) AS s(item_id uuid, deadline timestamptz) WHERE EXISTS (SELECT 1 FROM executive.attention_deliveries d '
              'WHERE d.item_id = s.item_id AND d.state = ''delivered'' AND d.attempted_at IS NOT NULL AND (s.deadline IS NULL OR d.attempted_at <= s.deadline))' INTO v_n USING v_severe_list;
      v_delivery := jsonb_build_object('measurable', true, 'delivered_before_deadline', v_n, 'of', s.n, 'source', 'executive.attention_deliveries (item_id, state delivered, attempted_at)');
    EXCEPTION WHEN undefined_column OR undefined_table OR datatype_mismatch THEN
      v_delivery := jsonb_build_object('measurable', false, 'reason', 'not measurable: the delivery ledger does not carry (item_id, state, attempted_at) as read here');
    END;
  END IF;
  v_sev := jsonb_build_object('items', s.n, 'routed', s.routed, 'acknowledged', s.acked, 'acknowledged_before_deadline', s.ack_in_time, 'overload_deprioritized', s.overload,
                              'never_overload_deprioritized', s.overload = 0, 'time_to_acknowledge_seconds', CASE WHEN s.acked = 0 THEN NULL ELSE jsonb_build_object('p50', round(s.p50::numeric, 3), 'p90', round(s.p90::numeric, 3)) END,
                              'delivered_before_deadline', v_delivery, 'breaches', v_breaches);

  -- ESCALATION LATENCY: each escalation in the window after the deadline it answered (0083's item.escalated carries missed_deadline).
  SELECT count(*) AS n, percentile_cont(0.5) WITHIN GROUP (ORDER BY q.lat) AS p50, percentile_cont(0.9) WITHIN GROUP (ORDER BY q.lat) AS p90, max(q.lat) AS mx
    INTO e
    FROM (SELECT extract(epoch FROM (d.occurred_at - (d.details ->> 'missed_deadline')::timestamptz)) AS lat
            FROM executive.attention_item_events d JOIN executive.attention_items i ON i.item_id = d.item_id
           WHERE i.tenant_id = p_tenant AND i.domain_id = p_domain AND d.event = 'item.escalated' AND jsonb_typeof(d.details -> 'missed_deadline') = 'string'
             AND d.occurred_at >= v_from AND d.occurred_at <= v_to) q;
  v_esc := CASE WHEN e.n = 0 THEN jsonb_build_object('abstained', true, 'escalations', 0, 'reason', 'no escalation after a missed deadline in the window')
                ELSE jsonb_build_object('abstained', false, 'escalations', e.n, 'p50_seconds', round(e.p50::numeric, 3), 'p90_seconds', round(e.p90::numeric, 3), 'max_seconds', round(e.mx::numeric, 3)) END;

  -- B34 (0090) RANKING FAIRNESS (AT-44; PR-44-*): how the queue's TRANSPARENT rank (executive.attention_rank_key over the dimensions each item
  -- was judged on) places each class — per class and per consequence tier: the mean rank percentile (0 = first in the queue, 1 = last;
  -- percent_rank over the window's items), the top-decile share (the class's items at a percentile ≤ 0.1), the STRUCTURAL-NULL shares (a
  -- rank dimension with no input sorts after one with — a class that structurally lacks a window or an exposure ranks lower for it), and
  -- the DISPARITY (the spread of the mean percentile between the classes measured, at least min_sample items each). REPORTED, GATING
  -- NOTHING: it enters neither the verdict nor the reason.
  WITH r AS (
    SELECT i.item_id, i.signal_class, coalesce(i.evaluation #>> '{dimensions,consequence}', 'none') AS tier,
           executive.attention_rank_key(coalesce(i.evaluation -> 'dimensions', '{}'::jsonb)) AS k
      FROM executive.attention_items i
     WHERE i.tenant_id = p_tenant AND i.domain_id = p_domain AND i.created_at >= v_from AND i.created_at <= v_to
  ), p AS (SELECT r.*, (percent_rank() OVER (ORDER BY r.k))::numeric AS pct FROM r),
  cls AS (SELECT p.signal_class, count(*) AS n, avg(p.pct) AS mp, count(*) FILTER (WHERE p.pct <= 0.1) AS top,
                 count(*) FILTER (WHERE p.k[2] IS NULL) AS nh, count(*) FILTER (WHERE p.k[3] IS NULL) AS nc, count(*) FILTER (WHERE p.k[4] IS NULL) AS ne, count(*) FILTER (WHERE p.k[5] IS NULL) AS ns
            FROM p GROUP BY p.signal_class),
  tc AS (SELECT p.tier, p.signal_class, count(*) AS n, avg(p.pct) AS mp FROM p GROUP BY p.tier, p.signal_class),
  tiers AS (SELECT tc.tier, jsonb_object_agg(tc.signal_class, jsonb_build_object('items', tc.n, 'measured', tc.n >= v_min, 'mean_rank_percentile', round(tc.mp, 4))) AS classes,
                   count(*) FILTER (WHERE tc.n >= v_min) AS measured,
                   max(tc.mp) FILTER (WHERE tc.n >= v_min) - min(tc.mp) FILTER (WHERE tc.n >= v_min) AS spread
              FROM tc GROUP BY tc.tier)
  SELECT jsonb_build_object(
    'items', (SELECT count(*) FROM p), 'gates_nothing', true,
    'by_class', coalesce((SELECT jsonb_object_agg(cls.signal_class, jsonb_build_object('items', cls.n, 'measured', cls.n >= v_min, 'mean_rank_percentile', round(cls.mp, 4),
        'top_decile_share', round(cls.top::numeric / cls.n, 4),
        'structural_null_shares', jsonb_build_object('hours_to_window', round(cls.nh::numeric / cls.n, 4), 'confidence', round(cls.nc::numeric / cls.n, 4),
                                                     'exposure', round(cls.ne::numeric / cls.n, 4), 'strategic_relevance', round(cls.ns::numeric / cls.n, 4)))) FROM cls), '{}'::jsonb),
    'by_consequence_tier', coalesce((SELECT jsonb_object_agg(tiers.tier, jsonb_build_object('classes', tiers.classes, 'disparity',
        CASE WHEN tiers.measured >= 2 THEN jsonb_build_object('abstained', false, 'value', round(tiers.spread, 4), 'classes_measured', tiers.measured)
             ELSE jsonb_build_object('abstained', true, 'classes_measured', tiers.measured, 'reason', format('%s class(es) of this tier with at least min_sample %s item(s); a disparity needs two', tiers.measured, v_min)) END)) FROM tiers), '{}'::jsonb),
    'disparity', (SELECT CASE WHEN count(*) FILTER (WHERE cls.n >= v_min) >= 2
                              THEN jsonb_build_object('abstained', false, 'value', round(max(cls.mp) FILTER (WHERE cls.n >= v_min) - min(cls.mp) FILTER (WHERE cls.n >= v_min), 4), 'classes_measured', count(*) FILTER (WHERE cls.n >= v_min))
                              ELSE jsonb_build_object('abstained', true, 'classes_measured', count(*) FILTER (WHERE cls.n >= v_min), 'reason', format('fewer than two classes with at least min_sample %s item(s)', v_min)) END FROM cls),
    'definitions', jsonb_build_object(
      'mean_rank_percentile', 'the mean of percent_rank() over the window''s items ordered by executive.attention_rank_key (0 = first in the queue, 1 = last)',
      'top_decile_share', 'the share of the class''s items whose percentile is at most 0.1',
      'structural_null_shares', 'the share of the class''s items with no input for each rank dimension after consequence (a missing input sorts last)',
      'disparity', 'the largest minus the smallest mean rank percentile among the classes (of a tier) with at least min_sample items',
      'gating', 'reported only: the fairness measure enters neither the verdict nor the reason'))
    INTO v_fair;

  -- THE VERDICT: abstained when neither pooled precision nor pooled recall is measurable; measured when every class's precision and recall,
  -- the stability, the delivery and the escalation latency are; partial otherwise.
  v_verdict := CASE
    WHEN (v_overall #>> '{precision,abstained}')::boolean AND (v_overall #>> '{recall,abstained}')::boolean THEN 'abstained'
    WHEN v_class_abstained = 0 AND NOT (v_stab ->> 'abstained')::boolean AND (v_delivery ->> 'measurable')::boolean AND NOT (v_esc ->> 'abstained')::boolean THEN 'measured'
    ELSE 'partial' END;
  v_reason := format('%s item(s) in the window; pooled precision %s, recall %s; %s class measure(s) measured, %s abstained below min_sample %s; ranking stability %s; %s C3/C4 item(s), %s breach(es); delivery %s; escalation latency %s',
    jsonb_array_length(v_items),
    CASE WHEN (v_overall #>> '{precision,abstained}')::boolean THEN 'abstained' ELSE v_overall #>> '{precision,value}' END,
    CASE WHEN (v_overall #>> '{recall,abstained}')::boolean THEN 'abstained' ELSE v_overall #>> '{recall,value}' END,
    v_class_measured, v_class_abstained, v_min,
    CASE WHEN (v_stab ->> 'abstained')::boolean THEN 'abstained (' || (v_stab ->> 'reason') || ')' ELSE 'tau-b ' || (v_stab ->> 'value') END,
    s.n, jsonb_array_length(v_breaches),
    CASE WHEN (v_delivery ->> 'measurable')::boolean THEN 'measured' ELSE v_delivery ->> 'reason' END,
    CASE WHEN (v_esc ->> 'abstained')::boolean THEN 'abstained' ELSE 'p50 ' || (v_esc ->> 'p50_seconds') || ' s' END);
  v_measures := jsonb_build_object(
    'window', jsonb_build_object('from', v_from, 'to', v_to), 'min_sample', v_min, 'items', jsonb_array_length(v_items),
    'classes', v_classes, 'overall', v_overall, 'ranking_stability', v_stab, 'severe', v_sev, 'escalation_latency', v_esc,
    /* B34 (0090) */ 'ranking_fairness', v_fair,
    'definitions', jsonb_build_object(
      'positive', 'material when it arrived, acknowledged, then disposed actioned',
      'negative', 'material, then disposed not_material or duplicate, or closed without acknowledgement',
      'recall_miss', 'disposed missed on an item judged below threshold or abstained on, or elevated / re-evaluated to material later',
      'late', 'disposed late: counted apart, neither a positive nor a miss',
      'severe', 'consequence C3 or C4 in the evaluation''s dimensions; the deadline is the first one its routing set'));
  INSERT INTO executive.attention_queue_evaluations (evaluation_id, scope, tenant_id, domain_id, window_from, window_to, min_sample, measures, verdict, reason, evaluated_by, evaluated_at, correlation_id)
  VALUES (p_evaluation_id, 'DOMAIN', p_tenant, p_domain, v_from, v_to, v_min, v_measures, v_verdict, v_reason, p_actor, v_at, p_correlation);
  RETURN v_measures || jsonb_build_object('evaluation_id', p_evaluation_id, 'verdict', v_verdict, 'reason', v_reason, 'evaluated_by', p_actor, 'evaluated_at', v_at);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.evaluate_attention_queue(uuid,uuid,uuid,timestamptz,timestamptz,int,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.evaluate_attention_queue(uuid,uuid,uuid,timestamptz,timestamptz,int,uuid,uuid) TO eye_commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- section `commitments`
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- section `commitments` — CP-6 B34 part C (F-P6-05): THE COMMITMENT TRACKER AND THE GOVERNED EXECUTION HANDOFF
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- V2 V02-T-117 (an objective change re-tasks commitments and reassigns review owners); V3 L9-C08, CMT, V03-T-010 / -362 / -366 (external
-- execution only through a separately governed commitment and interface) / -372 (the execution timeline); V8 CAP-EO-08 (the tracker:
-- owners, deadlines, conditions, evidence, exceptions, completion), OBJ-37 (commitment close: owner and reviewer, deliverables, exceptions),
-- FEX-18 (partial effect: completed and residual effects, owners, compensation; effects reconciled and authority closes).
--
--   §C1  the tracker: decision.commitment_items (the versioned current row of each item: obligation | milestone | deliverable | handoff;
--        owner, reviewer with its BASIS declared | objective_owner, due_at, state, objectives, resources mirrored into graph.dependencies
--        CMT → RSC), the append-only ledger decision.commitment_events, decision.commitment_exceptions (deadline_missed | blocked |
--        partial_effect | objective_changed | scope_change; an extension or a waiver is PROPOSED by the owner and CO-SIGNED by the reviewer)
--   §C2  the SEED: an AFTER INSERT trigger on decision.commitments opens the ROOT item of every new commitment (decision.commit_package is
--        not touched — the gates part alone re-declares it); the root's owner is the choice's action owner, its reviewer the owner of the
--        package's first objective (basis objective_owner) or else the package owner (basis declared); a commitment.accept task opened
--   §C3  the items' ports: declare (children, resources mirrored), accept (commitment.checkpoint task at due_at), complete (deliverables
--        and evidence; a deadline_missed exception closed as completed late), raise / decide an exception (resolve, propose_extension,
--        propose_waiver, cosign, reject — the co-sign the reviewer's, never the proposer's)
--   §C4  the deadline SWEEP (the attention tick's step `commitment-deadlines`, order 45, executive.attention.tick): item.due_soon (48 h)
--        and item.overdue (+ a deadline_missed exception) recorded ONCE per item and due instant; compensation.overdue once
--   §C5  THE GOVERNED EXECUTION GATEWAY: decision.execution_targets (https + trust anchor + credential reference; SYNTHETIC only — a
--        non-synthetic target is refused until the owner's decision, the D6 precedent; retire-only), decision.execution_handoffs
--        (drafted → issuing → effected | partially_effected | failed → reconciled; role primary | compensating), decision.execution_attempts
--        (append-only; 1..5, backoff 1/2/4/8 minutes; the receipt BOUND: it echoes handoff id, attempt and payload digest — an unbound
--        receipt is evidence, never an effect), decision.execution_effects (per line), decision.execution_residuals (view),
--        decision.execution_compensations (reissue_residual | cancel_effected | alternate_source | accept_residual with a NAMED compensation
--        owner; accept_residual co-signed by the reviewer), reconcile. The issue is decision.execution.issue — C3, human-gated, a holder of
--        execution_authority who is neither the drafter nor the decision's committer; the retries are the tick's step
--        `execution-deliveries` (order 50)
--   §C6  the TIMELINE decision.execution_timeline (lanes commitment / resource / operational / deviation / governance) and the tracker
--        read decision.commitment_tracker; decision.commitment_item_signal (0090 §0.7's stub) re-declared with its body
--   §C7  CLOSURE: proposed by the root's owner with deliverables (every item done / waived / cancelled, no open exception, every handoff
--        reconciled) and CO-SIGNED by the reviewer → the CMT version 2, status closed (canonical write action decision.commitment.close);
--        decision.close_package (0045:221) re-declared: refused while the committed CMT's tracker is unclosed
--   §C8  RE-TASKING: graph.revise_objective (an OBJ re-declared at version + 1; the route publishes GraphChanged/objective.changed) and
--        the commitments consumer's port decision.apply_objective_change (decision.commitment.subscription.apply): every live item resting
--        on the objective → an objective_changed exception, retask_required, and the reviewer REASSIGNED when its basis is the objective's
--        owner and the owner moved; decision.commitment_signals for the after-tick publication of the sweep's CommitmentChanged events
--
-- NOT HERE (stated): decision.commit_package (the gates part's alone — the seed is a trigger); the package event CHECK (the prelude's union:
-- commitment.item_opened, commitment.exception, execution.handoff_issued, execution.partial_effect, commitment.closed are the only package
-- events written here); the human-task core and the timer firing (the prelude / the workflow part — this section opens and resolves tasks
-- only); the attention routing of CommitmentChanged (the attention part); the interface register (unchanged, 50/0/0); a REAL execution
-- target (an owner decision: every target here is synthetic and closes no real-ERP clause).

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §C1 THE TRACKER
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
CREATE TABLE decision.commitment_items (
  item_id               uuid PRIMARY KEY,
  scope                 text NOT NULL,
  tenant_id             uuid NOT NULL,
  domain_id             uuid NOT NULL,
  commitment_id         uuid NOT NULL REFERENCES decision.commitments (commitment_id),
  package_id            uuid NOT NULL,
  parent_item_id        uuid REFERENCES decision.commitment_items (item_id),
  kind                  text NOT NULL CHECK (kind IN ('obligation', 'milestone', 'deliverable', 'handoff')),
  title                 text NOT NULL CHECK (length(btrim(title)) BETWEEN 2 AND 256),
  owner_principal_id    uuid NOT NULL,
  reviewer_principal_id uuid,
  reviewer_basis        text NOT NULL CHECK (reviewer_basis IN ('declared', 'objective_owner')),
  due_at                timestamptz NOT NULL,
  state                 text NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'in_progress', 'exception', 'retask_required', 'done', 'waived', 'cancelled')),
  objective_ids         uuid[] NOT NULL DEFAULT '{}',
  resource_ids          uuid[] NOT NULL DEFAULT '{}',
  deliverables          jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(deliverables) = 'array'),
  completion_evidence   text,
  version               int NOT NULL DEFAULT 1 CHECK (version >= 1),
  due_soon_recorded_for timestamptz,
  overdue_recorded_for  timestamptz,
  created_by            uuid NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at            timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id        uuid NOT NULL,
  CONSTRAINT dci_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT dci_reviewer_not_owner CHECK (reviewer_principal_id IS NULL OR reviewer_principal_id <> owner_principal_id),
  CONSTRAINT dci_root_is_obligation CHECK (parent_item_id IS NOT NULL OR kind = 'obligation')
);
CREATE UNIQUE INDEX commitment_items_one_root ON decision.commitment_items (commitment_id) WHERE parent_item_id IS NULL;
CREATE INDEX commitment_items_due ON decision.commitment_items (tenant_id, domain_id, due_at) WHERE state IN ('open', 'in_progress', 'exception', 'retask_required');
CREATE INDEX commitment_items_objectives ON decision.commitment_items USING gin (objective_ids);

CREATE TABLE decision.commitment_events (
  event_id           uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  commitment_id      uuid,
  item_id            uuid,
  event              text NOT NULL CHECK (event IN (
    'item.opened', 'item.accepted', 'item.done', 'item.waived', 'item.cancelled', 'item.due_soon', 'item.overdue', 'item.retasked', 'reviewer.reassigned',
    'exception.raised', 'exception.proposed', 'exception.rejected', 'exception.resolved',
    'handoff.drafted', 'handoff.issued', 'handoff.attempted', 'handoff.effected', 'handoff.partial', 'handoff.failed', 'handoff.reconciled',
    'compensation.assigned', 'compensation.cosigned', 'compensation.done', 'compensation.overdue',
    'closure.proposed', 'closure.cosigned', 'target.declared', 'target.retired')),
  actor_principal_id uuid NOT NULL,
  details            jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT dce_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX commitment_events_commitment ON decision.commitment_events (commitment_id, occurred_at);
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON decision.commitment_events FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

CREATE TABLE decision.commitment_exceptions (
  exception_id        uuid PRIMARY KEY,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  item_id             uuid NOT NULL REFERENCES decision.commitment_items (item_id),
  kind                text NOT NULL CHECK (kind IN ('deadline_missed', 'blocked', 'partial_effect', 'objective_changed', 'scope_change')),
  source_ref          text NOT NULL,
  detail              text NOT NULL,
  state               text NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'proposed', 'resolved', 'extended', 'waived')),
  proposal            jsonb,
  proposed_by         uuid,
  resolution          text,
  resolved_by         uuid,
  cosigned_by         uuid,
  resolved_at         timestamptz,
  raised_by           uuid NOT NULL,
  raised_at           timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id      uuid NOT NULL,
  CONSTRAINT dcx_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT dcx_closed CHECK ((state IN ('resolved', 'extended', 'waived')) = (resolved_at IS NOT NULL)),
  CONSTRAINT dcx_cosign CHECK (state NOT IN ('extended', 'waived') OR (cosigned_by IS NOT NULL AND cosigned_by IS DISTINCT FROM proposed_by)),
  UNIQUE (item_id, kind, source_ref)
);

-- §C5's tables (declared here so the §C2–§C4 ports can read them)
CREATE TABLE decision.execution_targets (
  target_id          uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  target_key         text NOT NULL CHECK (target_key ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  label              text NOT NULL CHECK (length(btrim(label)) BETWEEN 2 AND 200),
  endpoint           text NOT NULL CHECK (endpoint ~ '^https://[^/@\s]+(/[^\s]*)?$'),
  trust_anchor_pem   text,
  credential_ref     text CHECK (credential_ref IS NULL OR credential_ref ~ '^EYE_DST_[A-Z0-9_]{1,64}$'),
  synthetic          boolean NOT NULL CHECK (synthetic),   -- a real execution target is an owner decision (the D6 precedent)
  state              text NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'retired')),
  retired_at         timestamptz,
  retired_reason     text,
  declared_by        uuid NOT NULL,
  declared_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT det_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT det_retired CHECK ((state = 'retired') = (retired_at IS NOT NULL)),
  UNIQUE (tenant_id, domain_id, target_key)
);
-- retire-only: nothing but the retirement ever changes a target
CREATE OR REPLACE FUNCTION decision.execution_target_retire_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'execution target rejected: a target is retired, never deleted' USING ERRCODE = '42501'; END IF;
  IF OLD.state = 'retired' THEN RAISE EXCEPTION 'execution target rejected: % is retired', OLD.target_key USING ERRCODE = '22023'; END IF;
  IF (NEW.target_id, NEW.target_key, NEW.endpoint, NEW.trust_anchor_pem, NEW.credential_ref, NEW.synthetic, NEW.label, NEW.declared_by, NEW.declared_at)
     IS DISTINCT FROM (OLD.target_id, OLD.target_key, OLD.endpoint, OLD.trust_anchor_pem, OLD.credential_ref, OLD.synthetic, OLD.label, OLD.declared_by, OLD.declared_at) THEN
    RAISE EXCEPTION 'execution target rejected: a target is retire-only; declare a new one' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER retire_only BEFORE UPDATE OR DELETE ON decision.execution_targets FOR EACH ROW EXECUTE FUNCTION decision.execution_target_retire_only();

CREATE TABLE decision.execution_compensations (
  compensation_id    uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  handoff_id         uuid NOT NULL,
  item_id            uuid NOT NULL REFERENCES decision.commitment_items (item_id),
  kind               text NOT NULL CHECK (kind IN ('reissue_residual', 'cancel_effected', 'alternate_source', 'accept_residual')),
  residual           jsonb NOT NULL CHECK (jsonb_typeof(residual) = 'array'),
  owner_principal_id uuid NOT NULL,
  due_at             timestamptz NOT NULL,
  note               text NOT NULL,
  state              text NOT NULL CHECK (state IN ('proposed', 'assigned', 'in_progress', 'done', 'accepted')),
  compensating_handoff_id uuid,
  proposed_by        uuid NOT NULL,
  cosigned_by        uuid,
  disposed_at        timestamptz,
  overdue_recorded_at timestamptz,
  created_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT dec_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT dec_cosign CHECK (state <> 'accepted' OR (cosigned_by IS NOT NULL AND cosigned_by <> proposed_by)),
  CONSTRAINT dec_disposed CHECK ((state IN ('done', 'accepted')) = (disposed_at IS NOT NULL))
);

CREATE TABLE decision.execution_handoffs (
  handoff_id         uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  commitment_id      uuid NOT NULL REFERENCES decision.commitments (commitment_id),
  item_id            uuid NOT NULL REFERENCES decision.commitment_items (item_id),
  target_id          uuid NOT NULL REFERENCES decision.execution_targets (target_id),
  role               text NOT NULL CHECK (role IN ('primary', 'compensating')),
  compensation_id    uuid REFERENCES decision.execution_compensations (compensation_id),
  lines              jsonb NOT NULL CHECK (jsonb_typeof(lines) = 'array' AND jsonb_array_length(lines) BETWEEN 1 AND 50),
  payload            jsonb NOT NULL,
  payload_digest     text NOT NULL CHECK (payload_digest ~ '^[0-9a-f]{64}$'),
  state              text NOT NULL DEFAULT 'drafted' CHECK (state IN ('drafted', 'issuing', 'effected', 'partially_effected', 'failed', 'reconciled')),
  failure_class      text CHECK (failure_class IS NULL OR failure_class IN ('denied', 'rejected', 'exhausted', 'target_retired')),
  attempts           int NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  next_attempt_at    timestamptz,
  drafted_by         uuid NOT NULL,
  drafted_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  issued_by          uuid,
  issued_at          timestamptz,
  policy_decision_id uuid,
  settled_at         timestamptz,
  reconciled_by      uuid,
  reconciled_at      timestamptz,
  correlation_id     uuid NOT NULL,
  CONSTRAINT deh_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT deh_role CHECK ((role = 'compensating') = (compensation_id IS NOT NULL)),
  CONSTRAINT deh_issuer CHECK (issued_by IS NULL OR issued_by <> drafted_by),
  CONSTRAINT deh_failed CHECK ((state = 'failed') = (failure_class IS NOT NULL) OR (state = 'reconciled' AND failure_class IS NOT NULL))
);
ALTER TABLE decision.execution_compensations ADD CONSTRAINT dec_handoff FOREIGN KEY (handoff_id) REFERENCES decision.execution_handoffs (handoff_id);
ALTER TABLE decision.execution_compensations ADD CONSTRAINT dec_compensating FOREIGN KEY (compensating_handoff_id) REFERENCES decision.execution_handoffs (handoff_id);
CREATE INDEX execution_handoffs_due ON decision.execution_handoffs (tenant_id, domain_id, next_attempt_at) WHERE state = 'issuing';

CREATE TABLE decision.execution_attempts (
  attempt_id         uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  handoff_id         uuid NOT NULL REFERENCES decision.execution_handoffs (handoff_id),
  attempt            int NOT NULL CHECK (attempt BETWEEN 1 AND 5),
  outcome            text NOT NULL CHECK (outcome IN ('effected', 'partial', 'rejected', 'denied', 'unbound', 'transport', 'invalid_receipt', 'target_retired')),
  http_status        int,
  failure_detail     text,
  receipt            jsonb,
  receipt_digest     text CHECK (receipt_digest IS NULL OR receipt_digest ~ '^[0-9a-f]{64}$'),
  egress             jsonb,
  by_tick            boolean NOT NULL,
  actor_principal_id uuid NOT NULL,
  attempted_at       timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT dea_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  UNIQUE (handoff_id, attempt)
);
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON decision.execution_attempts FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

CREATE TABLE decision.execution_effects (
  handoff_id         uuid NOT NULL REFERENCES decision.execution_handoffs (handoff_id),
  line_key           text NOT NULL,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  requested_quantity numeric NOT NULL CHECK (requested_quantity > 0),
  effected_quantity  numeric NOT NULL CHECK (effected_quantity >= 0),
  status             text NOT NULL CHECK (status IN ('effected', 'partial', 'rejected', 'pending')),
  erp_reference      text,
  attempt            int NOT NULL,
  recorded_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT dee_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT dee_bounded CHECK (effected_quantity <= requested_quantity),
  PRIMARY KEY (handoff_id, line_key)
);

-- The residual of every settled handoff: what was requested and not effected, per line.
CREATE VIEW decision.execution_residuals WITH (security_invoker = true) AS
  SELECT e.handoff_id, h.item_id, h.commitment_id, e.tenant_id, e.domain_id, e.line_key, e.requested_quantity, e.effected_quantity,
         e.requested_quantity - e.effected_quantity AS residual_quantity, e.status,
         (h.state = 'reconciled') AS disposed
    FROM decision.execution_effects e JOIN decision.execution_handoffs h ON h.handoff_id = e.handoff_id
   WHERE e.effected_quantity < e.requested_quantity;

CREATE TABLE decision.commitment_closures (
  closure_id         uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  commitment_id      uuid NOT NULL REFERENCES decision.commitments (commitment_id),
  deliverables       jsonb NOT NULL CHECK (jsonb_typeof(deliverables) = 'array' AND jsonb_array_length(deliverables) >= 1),
  statement          text NOT NULL,
  state              text NOT NULL DEFAULT 'proposed' CHECK (state IN ('proposed', 'cosigned', 'superseded')),
  proposed_by        uuid NOT NULL,
  proposed_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  cosigned_by        uuid,
  cosigned_at        timestamptz,
  cmt_header_digest  text,
  correlation_id     uuid NOT NULL,
  CONSTRAINT dcc_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT dcc_cosign CHECK ((state = 'cosigned') = (cosigned_by IS NOT NULL) AND (cosigned_by IS NULL OR cosigned_by <> proposed_by))
);
CREATE UNIQUE INDEX commitment_closures_one_live ON decision.commitment_closures (commitment_id) WHERE state IN ('proposed', 'cosigned');

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['commitment_items', 'commitment_events', 'commitment_exceptions', 'execution_targets', 'execution_compensations',
                           'execution_handoffs', 'execution_attempts', 'execution_effects', 'commitment_closures'] LOOP
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
REVOKE ALL ON decision.execution_residuals FROM PUBLIC;
GRANT SELECT ON decision.execution_residuals TO eye_app, eye_commit;

-- The ledger's one writer (INTERNAL: called by this section's definer ports only).
CREATE OR REPLACE FUNCTION decision._commitment_event(p_tenant uuid, p_domain uuid, p_commitment uuid, p_item uuid, p_event text, p_actor uuid, p_details jsonb, p_correlation uuid)
RETURNS uuid SECURITY DEFINER SET search_path = decision, public, pg_catalog, pg_temp AS $$
DECLARE v_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO decision.commitment_events (event_id, scope, tenant_id, domain_id, commitment_id, item_id, event, actor_principal_id, details, correlation_id)
  VALUES (v_id, 'DOMAIN', p_tenant, p_domain, p_commitment, p_item, p_event, p_actor, coalesce(p_details, '{}'::jsonb), p_correlation);
  RETURN v_id;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision._commitment_event(uuid, uuid, uuid, uuid, text, uuid, jsonb, uuid) FROM PUBLIC;

-- A task on an item (INTERNAL): the prelude's _open_human_task with the item as subject; a deadline in the past is not a task deadline.
CREATE OR REPLACE FUNCTION decision._commitment_task(p_tenant uuid, p_domain uuid, p_kind text, p_dedupe text, p_item uuid, p_title text, p_assignee uuid,
                                                     p_deadline timestamptz, p_actor uuid, p_correlation uuid)
RETURNS jsonb SECURITY DEFINER SET search_path = decision, executive, public, pg_catalog, pg_temp AS $$
  SELECT executive._open_human_task(gen_random_uuid(), p_tenant, p_domain, p_kind, p_dedupe, jsonb_build_object('kind', 'commitment_item', 'id', p_item), left(p_title, 256),
                                    p_assignee, '{}'::text[], '{}'::jsonb, CASE WHEN p_deadline > clock_timestamp() + interval '1 minute' THEN p_deadline END, '{}'::jsonb, NULL, NULL,
                                    p_actor, p_correlation);
$$ LANGUAGE sql;
REVOKE ALL ON FUNCTION decision._commitment_task(uuid, uuid, text, text, uuid, text, uuid, timestamptz, uuid, uuid) FROM PUBLIC;

-- An exception (INTERNAL): idempotent on (item, kind, source_ref) — a second raise of the same cause answers the first; the item → exception.
CREATE OR REPLACE FUNCTION decision._raise_commitment_exception(p_tenant uuid, p_domain uuid, p_item uuid, p_kind text, p_source text, p_detail text, p_actor uuid, p_correlation uuid)
RETURNS jsonb SECURITY DEFINER SET search_path = decision, executive, public, pg_catalog, pg_temp AS $$
DECLARE i decision.commitment_items%ROWTYPE; v_id uuid; v_event uuid; v_new boolean := false;
BEGIN
  SELECT * INTO i FROM decision.commitment_items x WHERE x.item_id = p_item FOR UPDATE;
  SELECT exception_id INTO v_id FROM decision.commitment_exceptions x WHERE x.item_id = p_item AND x.kind = p_kind AND x.source_ref = p_source;
  IF v_id IS NULL THEN
    v_id := gen_random_uuid(); v_new := true;
    INSERT INTO decision.commitment_exceptions (exception_id, scope, tenant_id, domain_id, item_id, kind, source_ref, detail, raised_by, correlation_id)
    VALUES (v_id, 'DOMAIN', p_tenant, p_domain, p_item, p_kind, p_source, p_detail, p_actor, p_correlation);
    IF i.state IN ('open', 'in_progress') THEN
      UPDATE decision.commitment_items SET state = 'exception', version = version + 1, updated_at = clock_timestamp() WHERE item_id = p_item;
    END IF;
    v_event := decision._commitment_event(p_tenant, p_domain, i.commitment_id, p_item, 'exception.raised', p_actor,
                                          jsonb_build_object('exception_id', v_id, 'kind', p_kind, 'source_ref', p_source, 'detail', p_detail), p_correlation);
    INSERT INTO decision.package_events (event_id, scope, tenant_id, domain_id, package_id, event, actor_principal_id, details, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, i.package_id, 'commitment.exception', p_actor,
            jsonb_build_object('commitment_id', i.commitment_id, 'item_id', p_item, 'exception_id', v_id, 'kind', p_kind), p_correlation);
    IF i.reviewer_principal_id IS NOT NULL THEN
      PERFORM decision._commitment_task(p_tenant, p_domain, 'commitment.renegotiate', format('commitment.renegotiate:%s', v_id), p_item,
                                        format('Exception (%s) on "%s": resolve, extend or waive', p_kind, i.title), i.owner_principal_id, NULL, p_actor, p_correlation);
    END IF;
  END IF;
  RETURN jsonb_build_object('exception_id', v_id, 'raised', v_new, 'event_id', v_event, 'item_id', p_item, 'kind', p_kind);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision._raise_commitment_exception(uuid, uuid, uuid, text, text, text, uuid, uuid) FROM PUBLIC;

-- The item as an answer (INTERNAL helper, also the base of the signal).
CREATE OR REPLACE FUNCTION decision._commitment_item_answer(p_item uuid) RETURNS jsonb
STABLE SECURITY DEFINER SET search_path = decision, public, pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object('item_id', i.item_id, 'commitment_id', i.commitment_id, 'package_id', i.package_id, 'parent_item_id', i.parent_item_id, 'kind', i.kind,
                            'title', i.title, 'owner', i.owner_principal_id, 'reviewer', i.reviewer_principal_id, 'reviewer_basis', i.reviewer_basis, 'due_at', i.due_at,
                            'state', i.state, 'version', i.version, 'objectives', to_jsonb(i.objective_ids), 'resources', to_jsonb(i.resource_ids))
    FROM decision.commitment_items i WHERE i.item_id = p_item;
$$ LANGUAGE sql;
REVOKE ALL ON FUNCTION decision._commitment_item_answer(uuid) FROM PUBLIC;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §C2 THE SEED — the root item of every new commitment (decision.commit_package untouched)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION decision.seed_commitment_tracker() RETURNS trigger
SECURITY DEFINER SET search_path = decision, graph, executive, public, pg_catalog, pg_temp AS $$
DECLARE p decision.packages_current%ROWTYPE; v decision.package_versions%ROWTYPE; v_owner uuid; v_rev uuid; v_basis text := 'declared';
        v_objs uuid[]; v_obj_owner uuid; v_due timestamptz; v_item uuid := gen_random_uuid(); v_title text;
BEGIN
  SELECT * INTO p FROM decision.packages_current x WHERE x.package_id = NEW.package_id;
  SELECT * INTO v FROM decision.package_versions x WHERE x.package_id = NEW.package_id AND x.version = NEW.version;
  SELECT coalesce(array_agg(o::uuid), '{}') INTO v_objs FROM jsonb_array_elements_text(v.objectives) o WHERE o ~ '^[0-9a-f-]{36}$';
  v_owner := CASE WHEN (v.choice ->> 'action_owner') ~ '^[0-9a-f-]{36}$' AND decision.is_active_human((v.choice ->> 'action_owner')::uuid, NEW.tenant_id)
                  THEN (v.choice ->> 'action_owner')::uuid ELSE p.owner_principal_id END;
  IF cardinality(v_objs) > 0 THEN
    SELECT s.owner_principal_id INTO v_obj_owner FROM graph.strategy_current s WHERE s.strategy_object_id = v_objs[1];
  END IF;
  IF v_obj_owner IS NOT NULL AND v_obj_owner <> v_owner AND decision.is_active_human(v_obj_owner, NEW.tenant_id) THEN
    v_rev := v_obj_owner; v_basis := 'objective_owner';
  ELSIF p.owner_principal_id <> v_owner AND decision.is_active_human(p.owner_principal_id, NEW.tenant_id) THEN
    v_rev := p.owner_principal_id;
  ELSIF NEW.committed_by <> v_owner THEN
    v_rev := NEW.committed_by;
  END IF;
  v_due := coalesce(CASE WHEN (v.choice ->> 'execution_due_at') IS NOT NULL THEN (v.choice ->> 'execution_due_at')::timestamptz END, NEW.committed_at + interval '30 days');
  v_title := left(format('Execute: %s', p.title), 256);
  INSERT INTO decision.commitment_items (item_id, scope, tenant_id, domain_id, commitment_id, package_id, parent_item_id, kind, title, owner_principal_id,
                                         reviewer_principal_id, reviewer_basis, due_at, objective_ids, created_by, correlation_id)
  VALUES (v_item, 'DOMAIN', NEW.tenant_id, NEW.domain_id, NEW.commitment_id, NEW.package_id, NULL, 'obligation', v_title, v_owner, v_rev, v_basis, v_due, v_objs,
          NEW.committed_by, NEW.correlation_id);
  PERFORM decision._commitment_event(NEW.tenant_id, NEW.domain_id, NEW.commitment_id, v_item, 'item.opened', NEW.committed_by,
                                     jsonb_build_object('root', true, 'owner', v_owner, 'reviewer', v_rev, 'reviewer_basis', v_basis, 'due_at', v_due, 'seeded_by', 'decision.commitments'), NEW.correlation_id);
  -- §I (the integrator): the root's event carries the COMMITMENT's instant (the decision's — commit_package stamps the commitment, decided_at and
  -- package.committed with one instant), so a replay's decided layer closes on it and never reads the seed as "observed after the decision".
  INSERT INTO decision.package_events (event_id, scope, tenant_id, domain_id, package_id, event, actor_principal_id, details, occurred_at, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', NEW.tenant_id, NEW.domain_id, NEW.package_id, 'commitment.item_opened', NEW.committed_by,
          jsonb_build_object('commitment_id', NEW.commitment_id, 'item_id', v_item, 'root', true, 'owner', v_owner, 'reviewer', v_rev), NEW.committed_at, NEW.correlation_id);
  PERFORM decision._commitment_task(NEW.tenant_id, NEW.domain_id, 'commitment.accept', format('commitment.accept:%s', v_item), v_item,
                                    format('Accept the commitment "%s"', p.title), v_owner, NULL, NEW.committed_by, NEW.correlation_id);
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER seed_tracker AFTER INSERT ON decision.commitments FOR EACH ROW EXECUTE FUNCTION decision.seed_commitment_tracker();

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §C3 THE ITEMS' PORTS
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION decision.declare_commitment_item(
  p_item_id uuid, p_tenant uuid, p_domain uuid, p_commitment uuid, p_parent uuid, p_kind text, p_title text, p_owner uuid, p_reviewer uuid,
  p_due_at timestamptz, p_resource_ids uuid[], p_deliverables jsonb, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, graph, executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r decision.commitment_items%ROWTYPE; par decision.commitment_items%ROWTYPE; p decision.packages_current%ROWTYPE; x uuid; v_event uuid; v_task jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.commitment.item.declare']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'commitment item rejected (actor): recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO r FROM decision.commitment_items x WHERE x.commitment_id = p_commitment AND x.parent_item_id IS NULL AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'commitment item rejected (unknown_commitment): no tracked commitment % in this domain', p_commitment USING ERRCODE = '23503'; END IF;
  SELECT * INTO p FROM decision.packages_current x WHERE x.package_id = r.package_id;
  IF p_actor <> r.owner_principal_id AND p_actor <> p.owner_principal_id THEN
    RAISE EXCEPTION 'commitment item rejected (not_owner): the commitment''s owner or the package owner declares its items' USING ERRCODE = '42501';
  END IF;
  IF r.state IN ('done', 'waived', 'cancelled') OR EXISTS (SELECT 1 FROM decision.commitment_closures c WHERE c.commitment_id = p_commitment AND c.state = 'cosigned') THEN
    RAISE EXCEPTION 'commitment item rejected (closed): the commitment % is closed', p_commitment USING ERRCODE = '22023';
  END IF;
  IF p_parent IS NULL THEN p_parent := r.item_id; END IF;
  SELECT * INTO par FROM decision.commitment_items x WHERE x.item_id = p_parent AND x.commitment_id = p_commitment;
  IF NOT FOUND THEN RAISE EXCEPTION 'commitment item rejected (parent): % is not an item of commitment %', p_parent, p_commitment USING ERRCODE = '23503'; END IF;
  IF p_kind NOT IN ('obligation', 'milestone', 'deliverable', 'handoff') THEN
    RAISE EXCEPTION 'commitment item rejected (kind): obligation, milestone, deliverable or handoff' USING ERRCODE = '22023';
  END IF;
  IF p_title IS NULL OR length(btrim(p_title)) NOT BETWEEN 2 AND 256 THEN RAISE EXCEPTION 'commitment item rejected (title): 2 to 256 characters' USING ERRCODE = '22023'; END IF;
  IF p_owner IS NULL OR NOT decision.is_active_human(p_owner, p_tenant) THEN
    RAISE EXCEPTION 'commitment item rejected (owner): % is not an active member', coalesce(p_owner::text, '<none>') USING ERRCODE = '22023';
  END IF;
  p_reviewer := coalesce(p_reviewer, r.reviewer_principal_id);
  IF p_reviewer IS NULL OR NOT decision.is_active_human(p_reviewer, p_tenant) OR p_reviewer = p_owner THEN
    RAISE EXCEPTION 'commitment item rejected (reviewer): an item names an active member other than its owner as reviewer' USING ERRCODE = '22023';
  END IF;
  IF p_due_at IS NULL OR p_due_at <= clock_timestamp() THEN RAISE EXCEPTION 'commitment item rejected (due_at): an item''s due instant is in the future' USING ERRCODE = '22023'; END IF;
  IF p_due_at > r.due_at THEN
    RAISE EXCEPTION 'commitment item rejected (due_at): % lies after the commitment''s own due instant %', p_due_at, r.due_at USING ERRCODE = '22023';
  END IF;
  FOREACH x IN ARRAY coalesce(p_resource_ids, '{}') LOOP
    IF NOT EXISTS (SELECT 1 FROM graph.strategy_current s WHERE s.strategy_object_id = x AND s.object_type = 'RSC' AND s.tenant_id = p_tenant AND s.domain_id = p_domain AND s.status = 'active') THEN
      RAISE EXCEPTION 'commitment item rejected (resource): % is not an active resource (RSC) of this domain', x USING ERRCODE = '23503';
    END IF;
  END LOOP;
  INSERT INTO decision.commitment_items (item_id, scope, tenant_id, domain_id, commitment_id, package_id, parent_item_id, kind, title, owner_principal_id,
                                         reviewer_principal_id, reviewer_basis, due_at, objective_ids, resource_ids, deliverables, created_by, correlation_id)
  VALUES (p_item_id, 'DOMAIN', p_tenant, p_domain, p_commitment, r.package_id, p_parent, p_kind, btrim(p_title), p_owner, p_reviewer,
          CASE WHEN p_reviewer = r.reviewer_principal_id THEN r.reviewer_basis ELSE 'declared' END, p_due_at, r.objective_ids,
          coalesce(p_resource_ids, '{}'), coalesce(p_deliverables, '[]'::jsonb), p_actor, p_correlation);
  -- the resources the item consumes, mirrored into the dependencies (CMT → RSC), as the alignments mirror theirs (0089 §G)
  FOREACH x IN ARRAY coalesce(p_resource_ids, '{}') LOOP
    INSERT INTO graph.dependencies (dependency_id, scope, tenant_id, domain_id, dependent_object_id, dependent_type, depends_on_kind, depends_on_id, rationale, state, created_by, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_commitment, 'CMT', 'strategy', x, format('commitment item %s (%s) consumes this resource', p_item_id, p_kind), 'active', p_actor, p_correlation)
    ON CONFLICT DO NOTHING;
  END LOOP;
  v_event := decision._commitment_event(p_tenant, p_domain, p_commitment, p_item_id, 'item.opened', p_actor,
                                        jsonb_build_object('root', false, 'kind', p_kind, 'owner', p_owner, 'reviewer', p_reviewer, 'due_at', p_due_at, 'resources', to_jsonb(coalesce(p_resource_ids, '{}'))), p_correlation);
  INSERT INTO decision.package_events (event_id, scope, tenant_id, domain_id, package_id, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, r.package_id, 'commitment.item_opened', p_actor,
          jsonb_build_object('commitment_id', p_commitment, 'item_id', p_item_id, 'root', false, 'kind', p_kind, 'owner', p_owner), p_correlation);
  v_task := decision._commitment_task(p_tenant, p_domain, 'commitment.accept', format('commitment.accept:%s', p_item_id), p_item_id,
                                      format('Accept "%s"', btrim(p_title)), p_owner, NULL, p_actor, p_correlation);
  RETURN decision._commitment_item_answer(p_item_id) || jsonb_build_object('event_id', v_event, 'task_id', v_task ->> 'task_id');
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.declare_commitment_item(uuid, uuid, uuid, uuid, uuid, text, text, uuid, uuid, timestamptz, uuid[], jsonb, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.declare_commitment_item(uuid, uuid, uuid, uuid, uuid, text, text, uuid, uuid, timestamptz, uuid[], jsonb, uuid, uuid) TO eye_commit;

-- The OWNER accepts (open, or retask_required after an objective change): in_progress; the accept / renegotiate tasks resolved; a checkpoint
-- task at the due instant.
CREATE OR REPLACE FUNCTION decision.accept_commitment_item(p_tenant uuid, p_domain uuid, p_item uuid, p_note text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE i decision.commitment_items%ROWTYPE; v_event uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.commitment.item.accept']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'commitment item rejected (actor): recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO i FROM decision.commitment_items x WHERE x.item_id = p_item AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'commitment item rejected (unknown_item): no item % in this domain', p_item USING ERRCODE = '23503'; END IF;
  IF i.owner_principal_id <> p_actor THEN RAISE EXCEPTION 'commitment item rejected (not_owner): the item''s owner accepts it' USING ERRCODE = '42501'; END IF;
  IF i.state NOT IN ('open', 'retask_required') THEN
    RAISE EXCEPTION 'commitment item rejected (state): item % is %; only an open or re-tasked item is accepted', p_item, i.state USING ERRCODE = '22023';
  END IF;
  IF i.state = 'retask_required' AND EXISTS (SELECT 1 FROM decision.commitment_exceptions e WHERE e.item_id = p_item AND e.kind = 'objective_changed' AND e.state IN ('open', 'proposed')) THEN
    UPDATE decision.commitment_exceptions SET state = 'resolved', resolution = coalesce(nullif(btrim(p_note), ''), 're-accepted against the revised objective'),
           resolved_by = p_actor, resolved_at = clock_timestamp() WHERE item_id = p_item AND kind = 'objective_changed' AND state IN ('open', 'proposed');
  END IF;
  UPDATE decision.commitment_items SET state = CASE WHEN EXISTS (SELECT 1 FROM decision.commitment_exceptions e WHERE e.item_id = p_item AND e.state IN ('open', 'proposed')) THEN 'exception' ELSE 'in_progress' END,
         version = version + 1, updated_at = clock_timestamp() WHERE item_id = p_item;
  PERFORM executive._resolve_human_tasks(p_tenant, p_domain, jsonb_build_object('kind', 'commitment_item', 'id', p_item), ARRAY['commitment.accept', 'commitment.renegotiate'], 'accepted', p_item, p_actor, p_correlation);
  PERFORM decision._commitment_task(p_tenant, p_domain, 'commitment.checkpoint', format('commitment.checkpoint:%s:%s', p_item, i.version + 1), p_item,
                                    format('Checkpoint: "%s" is due', i.title), p_actor, i.due_at, p_actor, p_correlation);
  v_event := decision._commitment_event(p_tenant, p_domain, i.commitment_id, p_item, 'item.accepted', p_actor, jsonb_build_object('from', i.state, 'note', p_note), p_correlation);
  RETURN decision._commitment_item_answer(p_item) || jsonb_build_object('event_id', v_event, 'from', i.state);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.accept_commitment_item(uuid, uuid, uuid, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.accept_commitment_item(uuid, uuid, uuid, text, uuid, uuid) TO eye_commit;

-- The OWNER completes a child item with its evidence and deliverables: no open exception but a deadline_missed one (closed as completed late),
-- every handoff of the item reconciled.
CREATE OR REPLACE FUNCTION decision.complete_commitment_item(p_tenant uuid, p_domain uuid, p_item uuid, p_evidence text, p_deliverables jsonb, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE i decision.commitment_items%ROWTYPE; v_event uuid; v_open text; v_hand text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.commitment.item.complete']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'commitment item rejected (actor): recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO i FROM decision.commitment_items x WHERE x.item_id = p_item AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'commitment item rejected (unknown_item): no item % in this domain', p_item USING ERRCODE = '23503'; END IF;
  IF i.owner_principal_id <> p_actor THEN RAISE EXCEPTION 'commitment item rejected (not_owner): the item''s owner completes it' USING ERRCODE = '42501'; END IF;
  IF i.parent_item_id IS NULL THEN RAISE EXCEPTION 'commitment item rejected (root): the root is closed by the commitment''s closure, co-signed by its reviewer' USING ERRCODE = '22023'; END IF;
  IF i.state NOT IN ('in_progress', 'exception') THEN RAISE EXCEPTION 'commitment item rejected (state): item % is %; an accepted item is completed', p_item, i.state USING ERRCODE = '22023'; END IF;
  IF p_evidence IS NULL OR length(btrim(p_evidence)) < 8 THEN RAISE EXCEPTION 'commitment item rejected (evidence): the completion states its evidence (8+ characters)' USING ERRCODE = '22023'; END IF;
  SELECT string_agg(format('%s (%s)', e.kind, e.exception_id), ', ') INTO v_open FROM decision.commitment_exceptions e
   WHERE e.item_id = p_item AND e.state IN ('open', 'proposed') AND e.kind <> 'deadline_missed';
  IF v_open IS NOT NULL THEN RAISE EXCEPTION 'commitment item rejected (open_exception): % must be resolved first', v_open USING ERRCODE = '22023'; END IF;
  SELECT string_agg(format('%s (%s)', h.handoff_id, h.state), ', ') INTO v_hand FROM decision.execution_handoffs h WHERE h.item_id = p_item AND h.state <> 'reconciled';
  IF v_hand IS NOT NULL THEN RAISE EXCEPTION 'commitment item rejected (unreconciled_handoff): % — a residual is disposed and the handoff reconciled first', v_hand USING ERRCODE = '22023'; END IF;
  UPDATE decision.commitment_exceptions SET state = 'resolved', resolution = 'completed late', resolved_by = p_actor, resolved_at = clock_timestamp()
   WHERE item_id = p_item AND kind = 'deadline_missed' AND state IN ('open', 'proposed');
  UPDATE decision.commitment_items SET state = 'done', completion_evidence = btrim(p_evidence), deliverables = coalesce(p_deliverables, deliverables),
         version = version + 1, updated_at = clock_timestamp() WHERE item_id = p_item;
  PERFORM executive._resolve_human_tasks(p_tenant, p_domain, jsonb_build_object('kind', 'commitment_item', 'id', p_item), ARRAY['commitment.checkpoint', 'commitment.accept', 'commitment.renegotiate'], 'done', p_item, p_actor, p_correlation);
  v_event := decision._commitment_event(p_tenant, p_domain, i.commitment_id, p_item, 'item.done', p_actor,
                                        jsonb_build_object('evidence', btrim(p_evidence), 'deliverables', coalesce(p_deliverables, i.deliverables), 'late', clock_timestamp() > i.due_at), p_correlation);
  RETURN decision._commitment_item_answer(p_item) || jsonb_build_object('event_id', v_event, 'late', clock_timestamp() > i.due_at);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.complete_commitment_item(uuid, uuid, uuid, text, jsonb, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.complete_commitment_item(uuid, uuid, uuid, text, jsonb, uuid, uuid) TO eye_commit;

-- A person raises an exception (blocked | scope_change): the owner or the reviewer.
CREATE OR REPLACE FUNCTION decision.raise_commitment_exception(p_tenant uuid, p_domain uuid, p_item uuid, p_kind text, p_detail text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE i decision.commitment_items%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.commitment.exception.raise']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'commitment exception rejected (actor): recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO i FROM decision.commitment_items x WHERE x.item_id = p_item AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'commitment exception rejected (unknown_item): no item % in this domain', p_item USING ERRCODE = '23503'; END IF;
  IF p_actor NOT IN (i.owner_principal_id, coalesce(i.reviewer_principal_id, i.owner_principal_id)) THEN
    RAISE EXCEPTION 'commitment exception rejected (not_party): the item''s owner or reviewer raises an exception' USING ERRCODE = '42501';
  END IF;
  IF p_kind NOT IN ('blocked', 'scope_change') THEN
    RAISE EXCEPTION 'commitment exception rejected (kind): a person raises blocked or scope_change; deadline_missed, partial_effect and objective_changed are recorded by the tracker' USING ERRCODE = '22023';
  END IF;
  IF i.state IN ('done', 'waived', 'cancelled') THEN RAISE EXCEPTION 'commitment exception rejected (state): item % is %', p_item, i.state USING ERRCODE = '22023'; END IF;
  IF p_detail IS NULL OR length(btrim(p_detail)) < 8 THEN RAISE EXCEPTION 'commitment exception rejected (detail): the exception states what happened (8+ characters)' USING ERRCODE = '22023'; END IF;
  RETURN decision._raise_commitment_exception(p_tenant, p_domain, p_item, p_kind, format('person:%s', gen_random_uuid()), btrim(p_detail), p_actor, p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.raise_commitment_exception(uuid, uuid, uuid, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.raise_commitment_exception(uuid, uuid, uuid, text, text, uuid, uuid) TO eye_commit;

-- The decision on an exception: resolve (owner or reviewer; never a partial_effect — reconciled — nor a deadline_missed — extended, waived or
-- completed late), propose_extension (owner, a new due instant), propose_waiver (owner), cosign (the REVIEWER, never the proposer: the
-- extension moves the due instant, the waiver waives the item), reject (the reviewer: back to open).
CREATE OR REPLACE FUNCTION decision.decide_commitment_exception(p_tenant uuid, p_domain uuid, p_exception uuid, p_act text, p_new_due_at timestamptz, p_note text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE e decision.commitment_exceptions%ROWTYPE; i decision.commitment_items%ROWTYPE; v_event uuid; v_kind text; v_state text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.commitment.exception.decide']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'commitment exception rejected (actor): recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO e FROM decision.commitment_exceptions x WHERE x.exception_id = p_exception AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'commitment exception rejected (unknown_exception): no exception % in this domain', p_exception USING ERRCODE = '23503'; END IF;
  SELECT * INTO i FROM decision.commitment_items x WHERE x.item_id = e.item_id FOR UPDATE;
  IF p_note IS NULL OR length(btrim(p_note)) < 8 THEN RAISE EXCEPTION 'commitment exception rejected (note): the decision states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  IF p_act = 'resolve' THEN
    IF e.state <> 'open' THEN RAISE EXCEPTION 'commitment exception rejected (state): exception % is %', p_exception, e.state USING ERRCODE = '22023'; END IF;
    IF p_actor NOT IN (i.owner_principal_id, coalesce(i.reviewer_principal_id, i.owner_principal_id)) THEN
      RAISE EXCEPTION 'commitment exception rejected (not_party): the item''s owner or reviewer resolves an exception' USING ERRCODE = '42501';
    END IF;
    IF e.kind IN ('partial_effect', 'deadline_missed') THEN
      RAISE EXCEPTION 'commitment exception rejected (kind): a % exception is closed by %', e.kind,
        CASE e.kind WHEN 'partial_effect' THEN 'the handoff''s reconciliation (its residual disposed)' ELSE 'an extension or a waiver co-signed by the reviewer, or the item completed' END USING ERRCODE = '22023';
    END IF;
    UPDATE decision.commitment_exceptions SET state = 'resolved', resolution = btrim(p_note), resolved_by = p_actor, resolved_at = clock_timestamp() WHERE exception_id = p_exception;
    v_kind := 'exception.resolved';
  ELSIF p_act IN ('propose_extension', 'propose_waiver') THEN
    IF e.state <> 'open' THEN RAISE EXCEPTION 'commitment exception rejected (state): exception % is %', p_exception, e.state USING ERRCODE = '22023'; END IF;
    IF p_actor <> i.owner_principal_id THEN RAISE EXCEPTION 'commitment exception rejected (not_owner): the item''s owner proposes an extension or a waiver' USING ERRCODE = '42501'; END IF;
    IF i.reviewer_principal_id IS NULL THEN RAISE EXCEPTION 'commitment exception rejected (no_reviewer): item % has no reviewer to co-sign', i.item_id USING ERRCODE = '22023'; END IF;
    IF p_act = 'propose_extension' AND (p_new_due_at IS NULL OR p_new_due_at <= clock_timestamp()) THEN
      RAISE EXCEPTION 'commitment exception rejected (due_at): an extension names a future due instant' USING ERRCODE = '22023';
    END IF;
    UPDATE decision.commitment_exceptions SET state = 'proposed', proposed_by = p_actor,
           proposal = jsonb_build_object('act', p_act, 'new_due_at', p_new_due_at, 'note', btrim(p_note), 'at', clock_timestamp()) WHERE exception_id = p_exception;
    v_kind := 'exception.proposed';
  ELSIF p_act IN ('cosign', 'reject') THEN
    IF e.state <> 'proposed' THEN RAISE EXCEPTION 'commitment exception rejected (state): exception % is % — only a proposal is co-signed or rejected', p_exception, e.state USING ERRCODE = '22023'; END IF;
    IF p_actor IS DISTINCT FROM i.reviewer_principal_id THEN
      RAISE EXCEPTION 'commitment exception rejected (not_reviewer): the item''s reviewer co-signs an extension or a waiver' USING ERRCODE = '42501';
    END IF;
    IF p_actor = e.proposed_by THEN RAISE EXCEPTION 'commitment exception rejected (self_cosign): the proposer never co-signs their own proposal' USING ERRCODE = '42501'; END IF;
    IF p_act = 'reject' THEN
      UPDATE decision.commitment_exceptions SET state = 'open', proposal = proposal || jsonb_build_object('rejected_by', p_actor, 'rejection', btrim(p_note)) WHERE exception_id = p_exception;
      v_kind := 'exception.rejected';
    ELSE
      v_state := CASE e.proposal ->> 'act' WHEN 'propose_extension' THEN 'extended' ELSE 'waived' END;
      UPDATE decision.commitment_exceptions SET state = v_state, cosigned_by = p_actor, resolved_by = p_actor, resolution = btrim(p_note), resolved_at = clock_timestamp() WHERE exception_id = p_exception;
      IF v_state = 'extended' THEN
        UPDATE decision.commitment_items SET due_at = (e.proposal ->> 'new_due_at')::timestamptz, due_soon_recorded_for = NULL, overdue_recorded_for = NULL,
               version = version + 1, updated_at = clock_timestamp() WHERE item_id = i.item_id;
      ELSE
        UPDATE decision.commitment_items SET state = 'waived', version = version + 1, updated_at = clock_timestamp() WHERE item_id = i.item_id;
        PERFORM executive._resolve_human_tasks(p_tenant, p_domain, jsonb_build_object('kind', 'commitment_item', 'id', i.item_id), ARRAY['commitment.checkpoint', 'commitment.accept'], 'waived', p_exception, p_actor, p_correlation);
        PERFORM decision._commitment_event(p_tenant, p_domain, i.commitment_id, i.item_id, 'item.waived', p_actor, jsonb_build_object('exception_id', p_exception, 'cosigned_by', p_actor, 'proposed_by', e.proposed_by), p_correlation);
      END IF;
      v_kind := 'exception.resolved';
    END IF;
  ELSE
    RAISE EXCEPTION 'commitment exception rejected (act): resolve, propose_extension, propose_waiver, cosign or reject' USING ERRCODE = '22023';
  END IF;
  -- the item leaves `exception` when nothing stays open on it
  IF v_kind = 'exception.resolved' THEN
    UPDATE decision.commitment_items SET state = 'in_progress', version = version + 1, updated_at = clock_timestamp()
     WHERE item_id = i.item_id AND state = 'exception' AND NOT EXISTS (SELECT 1 FROM decision.commitment_exceptions x WHERE x.item_id = i.item_id AND x.state IN ('open', 'proposed'));
    PERFORM executive._resolve_human_tasks(p_tenant, p_domain, jsonb_build_object('kind', 'commitment_item', 'id', i.item_id), ARRAY['commitment.renegotiate'], 'resolved', p_exception, p_actor, p_correlation);
  END IF;
  v_event := decision._commitment_event(p_tenant, p_domain, i.commitment_id, i.item_id, v_kind, p_actor,
                                        jsonb_build_object('exception_id', p_exception, 'kind', e.kind, 'act', p_act, 'new_due_at', p_new_due_at, 'note', btrim(p_note)), p_correlation);
  RETURN (SELECT to_jsonb(x) FROM decision.commitment_exceptions x WHERE x.exception_id = p_exception)
         || jsonb_build_object('event_id', v_event, 'change', v_kind, 'item', decision._commitment_item_answer(i.item_id));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.decide_commitment_exception(uuid, uuid, uuid, text, timestamptz, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.decide_commitment_exception(uuid, uuid, uuid, text, timestamptz, text, uuid, uuid) TO eye_commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §C4 THE DEADLINE SWEEP — the attention tick's step `commitment-deadlines` (order 45)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- Each record is made ONCE per item and due instant (an extension clears the marks: the new instant is swept anew). Answers the ledger
-- events it wrote — the after-tick hook publishes them as CommitmentChanged (decision.commitment_signals).
CREATE OR REPLACE FUNCTION decision.sweep_commitment_deadlines(p_tenant uuid, p_domain uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE i decision.commitment_items%ROWTYPE; c decision.execution_compensations%ROWTYPE; v_now timestamptz := clock_timestamp(); v_events jsonb := '[]'::jsonb; v_e uuid; v_x jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.attention.tick']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  FOR i IN SELECT * FROM decision.commitment_items x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.state IN ('open', 'in_progress', 'exception', 'retask_required')
             AND ((x.due_at <= v_now AND x.overdue_recorded_for IS DISTINCT FROM x.due_at) OR (x.due_at > v_now AND x.due_at <= v_now + interval '48 hours' AND x.due_soon_recorded_for IS DISTINCT FROM x.due_at))
             ORDER BY x.due_at, x.item_id FOR UPDATE LOOP
    IF i.due_at <= v_now THEN
      UPDATE decision.commitment_items SET overdue_recorded_for = i.due_at WHERE item_id = i.item_id;
      v_e := decision._commitment_event(p_tenant, p_domain, i.commitment_id, i.item_id, 'item.overdue', p_actor, jsonb_build_object('due_at', i.due_at, 'swept_at', v_now), p_correlation);
      v_events := v_events || jsonb_build_object('event_id', v_e, 'kind', 'item.overdue', 'item_id', i.item_id);
      v_x := decision._raise_commitment_exception(p_tenant, p_domain, i.item_id, 'deadline_missed', format('due:%s', i.due_at), format('the item was due at %s and is %s', i.due_at, i.state), p_actor, p_correlation);
      IF (v_x ->> 'raised')::boolean THEN v_events := v_events || jsonb_build_object('event_id', v_x ->> 'event_id', 'kind', 'exception.raised', 'item_id', i.item_id); END IF;
    ELSE
      UPDATE decision.commitment_items SET due_soon_recorded_for = i.due_at WHERE item_id = i.item_id;
      v_e := decision._commitment_event(p_tenant, p_domain, i.commitment_id, i.item_id, 'item.due_soon', p_actor, jsonb_build_object('due_at', i.due_at, 'swept_at', v_now), p_correlation);
      v_events := v_events || jsonb_build_object('event_id', v_e, 'kind', 'item.due_soon', 'item_id', i.item_id);
    END IF;
  END LOOP;
  FOR c IN SELECT * FROM decision.execution_compensations x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.state IN ('proposed', 'assigned', 'in_progress')
             AND x.due_at <= v_now AND x.overdue_recorded_at IS NULL ORDER BY x.due_at FOR UPDATE LOOP
    UPDATE decision.execution_compensations SET overdue_recorded_at = v_now WHERE compensation_id = c.compensation_id;
    v_e := decision._commitment_event(p_tenant, p_domain, (SELECT h.commitment_id FROM decision.execution_handoffs h WHERE h.handoff_id = c.handoff_id), c.item_id, 'compensation.overdue', p_actor,
                                      jsonb_build_object('compensation_id', c.compensation_id, 'owner', c.owner_principal_id, 'due_at', c.due_at), p_correlation);
    v_events := v_events || jsonb_build_object('event_id', v_e, 'kind', 'compensation.overdue', 'item_id', c.item_id);
  END LOOP;
  RETURN jsonb_build_object('swept_at', v_now, 'events', v_events, 'count', jsonb_array_length(v_events));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.sweep_commitment_deadlines(uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.sweep_commitment_deadlines(uuid, uuid, uuid, uuid) TO eye_commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §C5 THE GOVERNED EXECUTION GATEWAY
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION decision.declare_execution_target(
  p_target_id uuid, p_tenant uuid, p_domain uuid, p_key text, p_label text, p_endpoint text, p_trust_anchor text, p_credential_ref text, p_synthetic boolean, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, observation, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.execution.target.declare']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'execution target rejected (actor): recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF p_synthetic IS NOT TRUE THEN
    RAISE EXCEPTION 'execution target rejected (not_synthetic): only a SYNTHETIC execution target is admitted — a real ERP or ticketing target is an owner decision (the D6 precedent), not an administrator''s declaration' USING ERRCODE = '22023';
  END IF;
  IF p_key IS NULL OR p_key !~ '^[a-z0-9][a-z0-9-]{1,62}$' THEN RAISE EXCEPTION 'execution target rejected (key): lower-case letters, digits and dashes, 2 to 63' USING ERRCODE = '22023'; END IF;
  IF p_endpoint IS NULL OR p_endpoint !~ '^https://[^/@\s]+(/[^\s]*)?$' THEN RAISE EXCEPTION 'execution target rejected (endpoint): an https:// URL without userinfo' USING ERRCODE = '22023'; END IF;
  IF p_credential_ref IS NOT NULL AND p_credential_ref !~ '^EYE_DST_[A-Z0-9_]{1,64}$' THEN
    RAISE EXCEPTION 'execution target rejected (credential_ref): the deployment variable EYE_DST_<NAME>' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM decision.execution_targets t WHERE t.tenant_id = p_tenant AND t.domain_id = p_domain AND t.target_key = p_key) THEN
    RAISE EXCEPTION 'execution target rejected (duplicate): % is declared in this domain; a target is retired, never redeclared', p_key USING ERRCODE = '23505';
  END IF;
  INSERT INTO decision.execution_targets (target_id, scope, tenant_id, domain_id, target_key, label, endpoint, trust_anchor_pem, credential_ref, synthetic, declared_by, correlation_id)
  VALUES (p_target_id, 'DOMAIN', p_tenant, p_domain, p_key, btrim(p_label), p_endpoint, p_trust_anchor, p_credential_ref, true, p_actor, p_correlation);
  PERFORM decision._commitment_event(p_tenant, p_domain, NULL, NULL, 'target.declared', p_actor, jsonb_build_object('target_id', p_target_id, 'target_key', p_key, 'endpoint', p_endpoint, 'synthetic', true,
                                     'trust_anchor', p_trust_anchor IS NOT NULL, 'credential_ref', p_credential_ref), p_correlation);
  RETURN (SELECT to_jsonb(t) - 'trust_anchor_pem' || jsonb_build_object('trust_anchor_declared', t.trust_anchor_pem IS NOT NULL) FROM decision.execution_targets t WHERE t.target_id = p_target_id);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.declare_execution_target(uuid, uuid, uuid, text, text, text, text, text, boolean, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.declare_execution_target(uuid, uuid, uuid, text, text, text, text, text, boolean, uuid, uuid) TO eye_commit;

CREATE OR REPLACE FUNCTION decision.retire_execution_target(p_tenant uuid, p_domain uuid, p_key text, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE t decision.execution_targets%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.execution.target.retire']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'execution target rejected (actor): recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO t FROM decision.execution_targets x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.target_key = p_key FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'execution target rejected (unknown_target): no target % in this domain', p_key USING ERRCODE = '23503'; END IF;
  IF t.state = 'retired' THEN RAISE EXCEPTION 'execution target rejected (retired): % is already retired', p_key USING ERRCODE = '22023'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN RAISE EXCEPTION 'execution target rejected (reason): a retirement states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  UPDATE decision.execution_targets SET state = 'retired', retired_at = clock_timestamp(), retired_reason = btrim(p_reason) WHERE target_id = t.target_id;
  PERFORM decision._commitment_event(p_tenant, p_domain, NULL, NULL, 'target.retired', p_actor, jsonb_build_object('target_id', t.target_id, 'target_key', p_key, 'reason', btrim(p_reason)), p_correlation);
  RETURN jsonb_build_object('target_id', t.target_id, 'target_key', p_key, 'state', 'retired');
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.retire_execution_target(uuid, uuid, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.retire_execution_target(uuid, uuid, text, text, uuid, uuid) TO eye_commit;

-- The DRAFT: the item's owner (a primary handoff) or the compensation's owner (a compensating one). The lines [{line_key, description,
-- quantity > 0, unit}] and the payload the target is sent; the payload digest binds them (the receipt must echo it).
CREATE OR REPLACE FUNCTION decision.draft_execution_handoff(
  p_handoff_id uuid, p_tenant uuid, p_domain uuid, p_item uuid, p_target_key text, p_lines jsonb, p_compensation uuid, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, observation, canon, ctx, public, pg_catalog, pg_temp AS $$
DECLARE i decision.commitment_items%ROWTYPE; t decision.execution_targets%ROWTYPE; c decision.execution_compensations%ROWTYPE; l jsonb; v_keys text[] := '{}';
        v_payload jsonb; v_digest text; v_event uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.execution.draft']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'execution handoff rejected (actor): recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO i FROM decision.commitment_items x WHERE x.item_id = p_item AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'execution handoff rejected (unknown_item): no item % in this domain', p_item USING ERRCODE = '23503'; END IF;
  IF p_compensation IS NULL THEN
    IF p_actor <> i.owner_principal_id THEN RAISE EXCEPTION 'execution handoff rejected (not_owner): the item''s owner drafts its handoff' USING ERRCODE = '42501'; END IF;
    IF i.state NOT IN ('in_progress', 'exception') THEN
      RAISE EXCEPTION 'execution handoff rejected (state): item % is %; an accepted item issues a handoff', p_item, i.state USING ERRCODE = '22023';
    END IF;
  ELSE
    SELECT * INTO c FROM decision.execution_compensations x WHERE x.compensation_id = p_compensation AND x.item_id = p_item FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'execution handoff rejected (unknown_compensation): no compensation % on item %', p_compensation, p_item USING ERRCODE = '23503'; END IF;
    IF p_actor <> c.owner_principal_id THEN RAISE EXCEPTION 'execution handoff rejected (not_compensation_owner): the compensation''s named owner drafts its handoff' USING ERRCODE = '42501'; END IF;
    IF c.kind = 'accept_residual' OR c.state NOT IN ('assigned') THEN
      RAISE EXCEPTION 'execution handoff rejected (compensation_state): compensation % (%) is %; an assigned reissue, cancellation or alternate source drafts one handoff', p_compensation, c.kind, c.state USING ERRCODE = '22023';
    END IF;
  END IF;
  SELECT * INTO t FROM decision.execution_targets x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.target_key = p_target_key;
  IF NOT FOUND THEN RAISE EXCEPTION 'execution handoff rejected (unknown_target): no target % in this domain', p_target_key USING ERRCODE = '23503'; END IF;
  IF t.state <> 'active' THEN RAISE EXCEPTION 'execution handoff rejected (target_retired): % is retired', p_target_key USING ERRCODE = '22023'; END IF;
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) NOT BETWEEN 1 AND 50 THEN
    RAISE EXCEPTION 'execution handoff rejected (lines): 1 to 50 lines' USING ERRCODE = '22023';
  END IF;
  FOR l IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    IF jsonb_typeof(l) <> 'object' OR coalesce(l ->> 'line_key', '') !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$' OR jsonb_typeof(l -> 'quantity') <> 'number' OR (l ->> 'quantity')::numeric <= 0
       OR length(coalesce(l ->> 'description', '')) NOT BETWEEN 2 AND 500 OR length(coalesce(l ->> 'unit', '')) NOT BETWEEN 1 AND 32 THEN
      RAISE EXCEPTION 'execution handoff rejected (lines): each line is {line_key, description (2–500), quantity > 0, unit (1–32)}' USING ERRCODE = '22023';
    END IF;
    IF (l ->> 'line_key') = ANY (v_keys) THEN RAISE EXCEPTION 'execution handoff rejected (lines): line_key % repeats', l ->> 'line_key' USING ERRCODE = '22023'; END IF;
    v_keys := v_keys || (l ->> 'line_key');
  END LOOP;
  v_payload := jsonb_build_object('kind', 'purchase_request', 'handoff_id', p_handoff_id, 'commitment_id', i.commitment_id, 'item_id', p_item, 'target_key', p_target_key,
                                  'role', CASE WHEN p_compensation IS NULL THEN 'primary' ELSE 'compensating' END, 'compensation_id', p_compensation,
                                  'compensation_kind', c.kind, 'lines', p_lines, 'synthetic', true);
  v_digest := canon.sha256_hex(canon.jcs(v_payload));
  INSERT INTO decision.execution_handoffs (handoff_id, scope, tenant_id, domain_id, commitment_id, item_id, target_id, role, compensation_id, lines, payload, payload_digest, drafted_by, correlation_id)
  VALUES (p_handoff_id, 'DOMAIN', p_tenant, p_domain, i.commitment_id, p_item, t.target_id, CASE WHEN p_compensation IS NULL THEN 'primary' ELSE 'compensating' END, p_compensation,
          p_lines, v_payload, v_digest, p_actor, p_correlation);
  IF p_compensation IS NOT NULL THEN
    UPDATE decision.execution_compensations SET state = 'in_progress', compensating_handoff_id = p_handoff_id WHERE compensation_id = p_compensation;
  END IF;
  v_event := decision._commitment_event(p_tenant, p_domain, i.commitment_id, p_item, 'handoff.drafted', p_actor,
                                        jsonb_build_object('handoff_id', p_handoff_id, 'target_key', p_target_key, 'lines', jsonb_array_length(p_lines), 'payload_digest', v_digest, 'compensation_id', p_compensation), p_correlation);
  RETURN jsonb_build_object('handoff_id', p_handoff_id, 'item_id', p_item, 'commitment_id', i.commitment_id, 'target_key', p_target_key, 'state', 'drafted',
                            'role', CASE WHEN p_compensation IS NULL THEN 'primary' ELSE 'compensating' END, 'payload_digest', v_digest, 'payload', v_payload, 'event_id', v_event);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.draft_execution_handoff(uuid, uuid, uuid, uuid, text, jsonb, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.draft_execution_handoff(uuid, uuid, uuid, uuid, text, jsonb, uuid, uuid, uuid) TO eye_commit;

-- THE ISSUE (V03-T-366: a separately governed commitment and interface): decision.execution.issue, C3 in the context, a named active
-- member holding execution_authority who is NEITHER the drafter NOR the decision's committer, on the digest of the draft read. The
-- first attempt is the route's, in this write (the executors run inside the governed write, B13 C6).
CREATE OR REPLACE FUNCTION decision.issue_execution_handoff(p_tenant uuid, p_domain uuid, p_handoff uuid, p_payload_digest text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE h decision.execution_handoffs%ROWTYPE; t decision.execution_targets%ROWTYPE; cm decision.commitments%ROWTYPE; i decision.commitment_items%ROWTYPE; v_event uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.execution.issue']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF public.eye_op_class() IS DISTINCT FROM 'C3' THEN
    RAISE EXCEPTION 'execution issue rejected (class): decision.execution.issue requires a C3 authority context; this context is %', coalesce(public.eye_op_class(), 'unclassed') USING ERRCODE = '42501';
  END IF;
  IF public.eye_bound_action() IS DISTINCT FROM 'decision.execution.issue' THEN
    RAISE EXCEPTION 'execution issue rejected (bound_action): the context is bound to %, not decision.execution.issue', public.eye_bound_action() USING ERRCODE = '42501';
  END IF;
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'execution issue rejected (actor): issued by the acting principal, never on behalf of another' USING ERRCODE = '42501'; END IF;
  IF NOT decision.is_active_human(p_actor, p_tenant) OR NOT decision.holds_role(p_actor, p_tenant, p_domain, 'execution_authority') THEN
    RAISE EXCEPTION 'execution issue rejected (authority): principal % is not an active member holding execution_authority in this domain', p_actor USING ERRCODE = '42501';
  END IF;
  SELECT * INTO h FROM decision.execution_handoffs x WHERE x.handoff_id = p_handoff AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'execution issue rejected (unknown_handoff): no handoff % in this domain', p_handoff USING ERRCODE = '23503'; END IF;
  IF h.state <> 'drafted' THEN RAISE EXCEPTION 'execution issue rejected (state): handoff % is %; a draft is issued once', p_handoff, h.state USING ERRCODE = '22023'; END IF;
  IF p_actor = h.drafted_by THEN RAISE EXCEPTION 'execution issue rejected (separation): the drafter of handoff % never issues it', p_handoff USING ERRCODE = '42501'; END IF;
  SELECT * INTO cm FROM decision.commitments x WHERE x.commitment_id = h.commitment_id;
  IF p_actor = cm.committed_by THEN RAISE EXCEPTION 'execution issue rejected (separation): the decision''s committer never issues its execution' USING ERRCODE = '42501'; END IF;
  IF p_payload_digest IS DISTINCT FROM h.payload_digest THEN
    RAISE EXCEPTION 'execution issue rejected (stale_digest): the digest issued (%) is not the draft''s (%); an issue signs what was read', p_payload_digest, h.payload_digest USING ERRCODE = '22023';
  END IF;
  SELECT * INTO t FROM decision.execution_targets x WHERE x.target_id = h.target_id;
  IF t.state <> 'active' THEN RAISE EXCEPTION 'execution issue rejected (target_retired): target % is retired', t.target_key USING ERRCODE = '22023'; END IF;
  SELECT * INTO i FROM decision.commitment_items x WHERE x.item_id = h.item_id;
  UPDATE decision.execution_handoffs SET state = 'issuing', issued_by = p_actor, issued_at = clock_timestamp(), next_attempt_at = clock_timestamp(), policy_decision_id = public.eye_policy_decision()
   WHERE handoff_id = p_handoff;
  v_event := decision._commitment_event(p_tenant, p_domain, h.commitment_id, h.item_id, 'handoff.issued', p_actor,
                                        jsonb_build_object('handoff_id', p_handoff, 'target_key', t.target_key, 'payload_digest', h.payload_digest, 'op_class', 'C3', 'policy_decision_id', public.eye_policy_decision()), p_correlation);
  INSERT INTO decision.package_events (event_id, scope, tenant_id, domain_id, package_id, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, i.package_id, 'execution.handoff_issued', p_actor,
          jsonb_build_object('commitment_id', h.commitment_id, 'item_id', h.item_id, 'handoff_id', p_handoff, 'target_key', t.target_key, 'payload_digest', h.payload_digest, 'role', h.role), p_correlation);
  RETURN jsonb_build_object('handoff_id', p_handoff, 'commitment_id', h.commitment_id, 'item_id', h.item_id, 'state', 'issuing', 'payload', h.payload, 'payload_digest', h.payload_digest,
                            'target', jsonb_build_object('target_key', t.target_key, 'endpoint', t.endpoint, 'trust_anchor_pem', t.trust_anchor_pem, 'credential_ref', t.credential_ref, 'synthetic', t.synthetic),
                            'event_id', v_event, 'attempts', 0);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.issue_execution_handoff(uuid, uuid, uuid, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.issue_execution_handoff(uuid, uuid, uuid, text, uuid, uuid) TO eye_commit;

-- AN ATTEMPT RECORDED (the issue route's first, the tick's retries). The database classifies: a 2xx answer is a receipt only when it is a
-- JSON object that ECHOES this handoff id, this attempt and the payload digest (else `unbound` — kept as evidence, never an effect, retried);
-- its lines settle the effects (all effected → effected; some → partially_effected, a partial_effect exception; none → failed rejected);
-- 403 → failed denied; a transport fault, a 5xx or a body that is not a receipt → retried with backoff 1, 2, 4, 8 minutes, the fifth
-- failure → failed exhausted (a blocked exception). A compensating handoff effected completes its compensation.
CREATE OR REPLACE FUNCTION decision.record_execution_attempt(
  p_attempt_id uuid, p_tenant uuid, p_domain uuid, p_handoff uuid, p_attempt int, p_http_status int, p_failure_detail text, p_receipt jsonb, p_egress jsonb, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, executive, observation, canon, ctx, public, pg_catalog, pg_temp AS $$
DECLARE h decision.execution_handoffs%ROWTYPE; i decision.commitment_items%ROWTYPE; t decision.execution_targets%ROWTYPE; l jsonb; r jsonb; v_outcome text; v_state text; v_fclass text;
        v_by_tick boolean := public.eye_bound_action() = 'executive.attention.tick'; v_req numeric; v_eff numeric; v_status text; v_full int := 0; v_none int := 0; v_n int := 0;
        v_events jsonb := '[]'::jsonb; v_e uuid; v_x jsonb; v_next timestamptz; v_residual jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.execution.issue', 'executive.attention.tick']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT * INTO h FROM decision.execution_handoffs x WHERE x.handoff_id = p_handoff AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'execution attempt rejected (unknown_handoff): no handoff % in this domain', p_handoff USING ERRCODE = '23503'; END IF;
  IF h.state <> 'issuing' THEN RAISE EXCEPTION 'execution attempt rejected (state): handoff % is %; only an issuing handoff is attempted', p_handoff, h.state USING ERRCODE = '22023'; END IF;
  IF p_attempt IS DISTINCT FROM h.attempts + 1 OR p_attempt > 5 THEN
    RAISE EXCEPTION 'execution attempt rejected (attempt): handoff % has made % attempt(s); the next is %, at most 5', p_handoff, h.attempts, h.attempts + 1 USING ERRCODE = '22023';
  END IF;
  SELECT * INTO i FROM decision.commitment_items x WHERE x.item_id = h.item_id;
  SELECT * INTO t FROM decision.execution_targets x WHERE x.target_id = h.target_id;
  IF t.state <> 'active' THEN
    v_outcome := 'target_retired';
  ELSIF p_http_status = 403 THEN
    v_outcome := 'denied';
  ELSIF p_http_status IS NULL OR p_http_status < 200 OR p_http_status >= 300 THEN
    v_outcome := 'transport';
  ELSIF p_receipt IS NULL OR jsonb_typeof(p_receipt) <> 'object' OR jsonb_typeof(p_receipt -> 'lines') IS DISTINCT FROM 'array' THEN
    v_outcome := 'invalid_receipt';
  ELSIF (p_receipt ->> 'handoff_id') IS DISTINCT FROM p_handoff::text OR (p_receipt ->> 'attempt') IS DISTINCT FROM p_attempt::text OR (p_receipt ->> 'payload_digest') IS DISTINCT FROM h.payload_digest THEN
    v_outcome := 'unbound';
  ELSE
    -- a bound receipt: every requested line must be answered (an unanswered line is `pending`, never effected)
    FOR l IN SELECT * FROM jsonb_array_elements(h.lines) LOOP
      v_n := v_n + 1;
      v_req := (l ->> 'quantity')::numeric;
      SELECT x INTO r FROM jsonb_array_elements(p_receipt -> 'lines') x WHERE x ->> 'line_key' = l ->> 'line_key' LIMIT 1;
      v_eff := CASE WHEN r IS NULL OR jsonb_typeof(r -> 'effected_quantity') <> 'number' THEN 0 ELSE greatest(0, least(v_req, (r ->> 'effected_quantity')::numeric)) END;
      v_status := CASE WHEN r IS NULL THEN 'pending' WHEN v_eff >= v_req THEN 'effected' WHEN v_eff > 0 THEN 'partial' ELSE CASE WHEN r ->> 'status' = 'rejected' THEN 'rejected' ELSE 'pending' END END;
      IF v_eff >= v_req THEN v_full := v_full + 1; ELSIF v_eff = 0 THEN v_none := v_none + 1; END IF;
      INSERT INTO decision.execution_effects (handoff_id, line_key, scope, tenant_id, domain_id, requested_quantity, effected_quantity, status, erp_reference, attempt)
      VALUES (p_handoff, l ->> 'line_key', 'DOMAIN', p_tenant, p_domain, v_req, v_eff, v_status, left(coalesce(r ->> 'erp_reference', p_receipt ->> 'erp_reference'), 128), p_attempt)
      ON CONFLICT (handoff_id, line_key) DO UPDATE SET effected_quantity = EXCLUDED.effected_quantity, status = EXCLUDED.status, erp_reference = EXCLUDED.erp_reference,
                                                     attempt = EXCLUDED.attempt, recorded_at = clock_timestamp();
      r := NULL;
    END LOOP;
    v_outcome := CASE WHEN v_full = v_n THEN 'effected' WHEN v_none = v_n THEN 'rejected' ELSE 'partial' END;
  END IF;
  INSERT INTO decision.execution_attempts (attempt_id, scope, tenant_id, domain_id, handoff_id, attempt, outcome, http_status, failure_detail, receipt, receipt_digest, egress, by_tick, actor_principal_id, correlation_id)
  VALUES (p_attempt_id, 'DOMAIN', p_tenant, p_domain, p_handoff, p_attempt, v_outcome, p_http_status, left(p_failure_detail, 500), p_receipt,
          CASE WHEN p_receipt IS NULL THEN NULL ELSE canon.sha256_hex(canon.jcs(p_receipt)) END, p_egress, v_by_tick, p_actor, p_correlation);
  PERFORM decision._commitment_event(p_tenant, p_domain, h.commitment_id, h.item_id, 'handoff.attempted', p_actor,
                                     jsonb_build_object('handoff_id', p_handoff, 'attempt', p_attempt, 'outcome', v_outcome, 'http_status', p_http_status, 'by_tick', v_by_tick), p_correlation);
  IF v_outcome IN ('transport', 'invalid_receipt', 'unbound') AND p_attempt < 5 THEN
    v_state := 'issuing'; v_next := clock_timestamp() + make_interval(mins => (2 ^ (p_attempt - 1))::int);
  ELSIF v_outcome IN ('transport', 'invalid_receipt', 'unbound') THEN
    v_state := 'failed'; v_fclass := 'exhausted';
  ELSIF v_outcome = 'denied' THEN v_state := 'failed'; v_fclass := 'denied';
  ELSIF v_outcome = 'target_retired' THEN v_state := 'failed'; v_fclass := 'target_retired';
  ELSIF v_outcome = 'rejected' THEN v_state := 'failed'; v_fclass := 'rejected';
  ELSIF v_outcome = 'partial' THEN v_state := 'partially_effected';
  ELSE v_state := 'effected';
  END IF;
  UPDATE decision.execution_handoffs SET attempts = p_attempt, state = v_state, failure_class = v_fclass, next_attempt_at = v_next,
         settled_at = CASE WHEN v_state <> 'issuing' THEN clock_timestamp() END WHERE handoff_id = p_handoff;
  SELECT coalesce(jsonb_agg(jsonb_build_object('line_key', x.line_key, 'requested', x.requested_quantity, 'effected', x.effected_quantity, 'residual', x.requested_quantity - x.effected_quantity, 'status', x.status) ORDER BY x.line_key), '[]'::jsonb)
    INTO v_residual FROM decision.execution_effects x WHERE x.handoff_id = p_handoff AND x.effected_quantity < x.requested_quantity;
  IF v_state = 'partially_effected' THEN
    v_e := decision._commitment_event(p_tenant, p_domain, h.commitment_id, h.item_id, 'handoff.partial', p_actor, jsonb_build_object('handoff_id', p_handoff, 'attempt', p_attempt, 'residual', v_residual), p_correlation);
    v_events := v_events || jsonb_build_object('event_id', v_e, 'kind', 'handoff.partial', 'item_id', h.item_id);
    INSERT INTO decision.package_events (event_id, scope, tenant_id, domain_id, package_id, event, actor_principal_id, details, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, i.package_id, 'execution.partial_effect', p_actor,
            jsonb_build_object('commitment_id', h.commitment_id, 'item_id', h.item_id, 'handoff_id', p_handoff, 'residual', v_residual), p_correlation);
    v_x := decision._raise_commitment_exception(p_tenant, p_domain, h.item_id, 'partial_effect', format('handoff:%s', p_handoff),
                                                format('handoff %s partially effected: %s line(s) with a residual', p_handoff, jsonb_array_length(v_residual)), p_actor, p_correlation);
    IF (v_x ->> 'raised')::boolean THEN v_events := v_events || jsonb_build_object('event_id', v_x ->> 'event_id', 'kind', 'exception.raised', 'item_id', h.item_id); END IF;
  ELSIF v_state = 'failed' THEN
    PERFORM decision._commitment_event(p_tenant, p_domain, h.commitment_id, h.item_id, 'handoff.failed', p_actor, jsonb_build_object('handoff_id', p_handoff, 'attempt', p_attempt, 'failure_class', v_fclass), p_correlation);
    v_x := decision._raise_commitment_exception(p_tenant, p_domain, h.item_id, CASE WHEN v_fclass = 'rejected' THEN 'partial_effect' ELSE 'blocked' END, format('handoff:%s', p_handoff),
                                                format('handoff %s failed (%s) after %s attempt(s)', p_handoff, v_fclass, p_attempt), p_actor, p_correlation);
    IF (v_x ->> 'raised')::boolean THEN v_events := v_events || jsonb_build_object('event_id', v_x ->> 'event_id', 'kind', 'exception.raised', 'item_id', h.item_id); END IF;
  ELSIF v_state = 'effected' THEN
    PERFORM decision._commitment_event(p_tenant, p_domain, h.commitment_id, h.item_id, 'handoff.effected', p_actor, jsonb_build_object('handoff_id', p_handoff, 'attempt', p_attempt), p_correlation);
    IF h.compensation_id IS NOT NULL THEN
      UPDATE decision.execution_compensations SET state = 'done', disposed_at = clock_timestamp() WHERE compensation_id = h.compensation_id AND state = 'in_progress';
      PERFORM decision._commitment_event(p_tenant, p_domain, h.commitment_id, h.item_id, 'compensation.done', p_actor, jsonb_build_object('compensation_id', h.compensation_id, 'handoff_id', p_handoff), p_correlation);
      PERFORM executive._resolve_human_tasks(p_tenant, p_domain, jsonb_build_object('kind', 'commitment_item', 'id', h.item_id), ARRAY['commitment.compensation'], 'done', h.compensation_id, p_actor, p_correlation);
    END IF;
  END IF;
  RETURN jsonb_build_object('handoff_id', p_handoff, 'attempt', p_attempt, 'outcome', v_outcome, 'state', v_state, 'failure_class', v_fclass, 'next_attempt_at', v_next,
                            'residual', v_residual, 'events', v_events, 'commitment_id', h.commitment_id, 'item_id', h.item_id, 'by_tick', v_by_tick);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.record_execution_attempt(uuid, uuid, uuid, uuid, int, int, text, jsonb, jsonb, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.record_execution_attempt(uuid, uuid, uuid, uuid, int, int, text, jsonb, jsonb, uuid, uuid) TO eye_commit;

-- The tick step's work list: the issuing handoffs whose next attempt is due (the transport fields for the product's egress).
CREATE OR REPLACE FUNCTION decision.due_execution_handoffs(p_tenant uuid, p_domain uuid) RETURNS SETOF jsonb
SECURITY DEFINER SET search_path = decision, observation, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.attention.tick']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  RETURN QUERY SELECT jsonb_build_object('handoff_id', h.handoff_id, 'attempt', h.attempts + 1, 'payload', h.payload, 'payload_digest', h.payload_digest,
                                         'target', jsonb_build_object('target_key', t.target_key, 'endpoint', t.endpoint, 'trust_anchor_pem', t.trust_anchor_pem, 'credential_ref', t.credential_ref, 'state', t.state))
    FROM decision.execution_handoffs h JOIN decision.execution_targets t ON t.target_id = h.target_id
   WHERE h.tenant_id = p_tenant AND h.domain_id = p_domain AND h.state = 'issuing' AND h.attempts < 5 AND h.next_attempt_at <= clock_timestamp()
   ORDER BY h.next_attempt_at, h.handoff_id LIMIT 20;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.due_execution_handoffs(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.due_execution_handoffs(uuid, uuid) TO eye_commit;

-- COMPENSATION (FEX-18): on a partially effected or failed handoff, the item's owner or reviewer assigns the residual to a NAMED owner with a
-- due instant: reissue_residual | cancel_effected | alternate_source (a compensating handoff drafted by that owner) or accept_residual (a
-- proposal the REVIEWER co-signs; the proposer never co-signs). A commitment.compensation task for the owner.
CREATE OR REPLACE FUNCTION decision.assign_execution_compensation(
  p_compensation_id uuid, p_tenant uuid, p_domain uuid, p_handoff uuid, p_kind text, p_owner uuid, p_due_at timestamptz, p_note text, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE h decision.execution_handoffs%ROWTYPE; i decision.commitment_items%ROWTYPE; v_residual jsonb; v_event uuid; v_state text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.execution.compensation.assign']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'execution compensation rejected (actor): recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO h FROM decision.execution_handoffs x WHERE x.handoff_id = p_handoff AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'execution compensation rejected (unknown_handoff): no handoff % in this domain', p_handoff USING ERRCODE = '23503'; END IF;
  SELECT * INTO i FROM decision.commitment_items x WHERE x.item_id = h.item_id;
  IF p_actor NOT IN (i.owner_principal_id, coalesce(i.reviewer_principal_id, i.owner_principal_id)) THEN
    RAISE EXCEPTION 'execution compensation rejected (not_party): the item''s owner or reviewer assigns a compensation' USING ERRCODE = '42501';
  END IF;
  IF h.state NOT IN ('partially_effected', 'failed') THEN
    RAISE EXCEPTION 'execution compensation rejected (state): handoff % is %; a residual exists on a partially effected or failed handoff', p_handoff, h.state USING ERRCODE = '22023';
  END IF;
  IF p_kind NOT IN ('reissue_residual', 'cancel_effected', 'alternate_source', 'accept_residual') THEN
    RAISE EXCEPTION 'execution compensation rejected (kind): reissue_residual, cancel_effected, alternate_source or accept_residual' USING ERRCODE = '22023';
  END IF;
  IF p_owner IS NULL OR NOT decision.is_active_human(p_owner, p_tenant) THEN
    RAISE EXCEPTION 'execution compensation rejected (owner): a compensation names an active member as its owner' USING ERRCODE = '22023';
  END IF;
  IF p_due_at IS NULL OR p_due_at <= clock_timestamp() THEN RAISE EXCEPTION 'execution compensation rejected (due_at): a compensation is due in the future' USING ERRCODE = '22023'; END IF;
  IF p_note IS NULL OR length(btrim(p_note)) < 8 THEN RAISE EXCEPTION 'execution compensation rejected (note): the compensation states what is done (8+ characters)' USING ERRCODE = '22023'; END IF;
  IF p_kind = 'accept_residual' AND i.reviewer_principal_id IS NULL THEN RAISE EXCEPTION 'execution compensation rejected (no_reviewer): an accepted residual is co-signed by the item''s reviewer' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM decision.execution_compensations c WHERE c.handoff_id = p_handoff AND c.state IN ('proposed', 'assigned', 'in_progress')) THEN
    RAISE EXCEPTION 'execution compensation rejected (live_compensation): handoff % already has a live compensation', p_handoff USING ERRCODE = '23505';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('line_key', x.line_key, 'requested', x.requested_quantity, 'effected', x.effected_quantity, 'residual', x.requested_quantity - x.effected_quantity) ORDER BY x.line_key), '[]'::jsonb)
    INTO v_residual FROM decision.execution_effects x WHERE x.handoff_id = p_handoff AND x.effected_quantity < x.requested_quantity;
  IF jsonb_array_length(v_residual) = 0 THEN
    -- a failed handoff without effects (denied, exhausted): the whole request is the residual
    SELECT coalesce(jsonb_agg(jsonb_build_object('line_key', l ->> 'line_key', 'requested', (l ->> 'quantity')::numeric, 'effected', 0, 'residual', (l ->> 'quantity')::numeric)), '[]'::jsonb)
      INTO v_residual FROM jsonb_array_elements(h.lines) l;
  END IF;
  v_state := CASE WHEN p_kind = 'accept_residual' THEN 'proposed' ELSE 'assigned' END;
  INSERT INTO decision.execution_compensations (compensation_id, scope, tenant_id, domain_id, handoff_id, item_id, kind, residual, owner_principal_id, due_at, note, state, proposed_by, correlation_id)
  VALUES (p_compensation_id, 'DOMAIN', p_tenant, p_domain, p_handoff, h.item_id, p_kind, v_residual, p_owner, p_due_at, btrim(p_note), v_state, p_actor, p_correlation);
  PERFORM decision._commitment_task(p_tenant, p_domain, 'commitment.compensation', format('commitment.compensation:%s', p_compensation_id), h.item_id,
                                    format('Compensate the residual of handoff %s (%s)', p_handoff, p_kind), p_owner, p_due_at, p_actor, p_correlation);
  v_event := decision._commitment_event(p_tenant, p_domain, h.commitment_id, h.item_id, 'compensation.assigned', p_actor,
                                        jsonb_build_object('compensation_id', p_compensation_id, 'handoff_id', p_handoff, 'kind', p_kind, 'owner', p_owner, 'due_at', p_due_at, 'residual', v_residual), p_correlation);
  RETURN (SELECT to_jsonb(c) FROM decision.execution_compensations c WHERE c.compensation_id = p_compensation_id) || jsonb_build_object('event_id', v_event, 'commitment_id', h.commitment_id);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.assign_execution_compensation(uuid, uuid, uuid, uuid, text, uuid, timestamptz, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.assign_execution_compensation(uuid, uuid, uuid, uuid, text, uuid, timestamptz, text, uuid, uuid) TO eye_commit;

CREATE OR REPLACE FUNCTION decision.cosign_execution_compensation(p_tenant uuid, p_domain uuid, p_compensation uuid, p_note text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE c decision.execution_compensations%ROWTYPE; i decision.commitment_items%ROWTYPE; v_event uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.execution.compensation.cosign']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'execution compensation rejected (actor): recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO c FROM decision.execution_compensations x WHERE x.compensation_id = p_compensation AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'execution compensation rejected (unknown_compensation): no compensation % in this domain', p_compensation USING ERRCODE = '23503'; END IF;
  SELECT * INTO i FROM decision.commitment_items x WHERE x.item_id = c.item_id;
  IF c.state <> 'proposed' THEN RAISE EXCEPTION 'execution compensation rejected (state): compensation % is %; only a proposed acceptance is co-signed', p_compensation, c.state USING ERRCODE = '22023'; END IF;
  IF p_actor IS DISTINCT FROM i.reviewer_principal_id THEN RAISE EXCEPTION 'execution compensation rejected (not_reviewer): the item''s reviewer co-signs an accepted residual' USING ERRCODE = '42501'; END IF;
  IF p_actor = c.proposed_by THEN RAISE EXCEPTION 'execution compensation rejected (self_cosign): the proposer never co-signs their own proposal' USING ERRCODE = '42501'; END IF;
  IF p_note IS NULL OR length(btrim(p_note)) < 8 THEN RAISE EXCEPTION 'execution compensation rejected (note): the co-sign states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  UPDATE decision.execution_compensations SET state = 'accepted', cosigned_by = p_actor, disposed_at = clock_timestamp() WHERE compensation_id = p_compensation;
  PERFORM executive._resolve_human_tasks(p_tenant, p_domain, jsonb_build_object('kind', 'commitment_item', 'id', c.item_id), ARRAY['commitment.compensation'], 'accepted', p_compensation, p_actor, p_correlation);
  v_event := decision._commitment_event(p_tenant, p_domain, i.commitment_id, c.item_id, 'compensation.cosigned', p_actor,
                                        jsonb_build_object('compensation_id', p_compensation, 'kind', c.kind, 'proposed_by', c.proposed_by, 'note', btrim(p_note)), p_correlation);
  RETURN (SELECT to_jsonb(x) FROM decision.execution_compensations x WHERE x.compensation_id = p_compensation) || jsonb_build_object('event_id', v_event);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.cosign_execution_compensation(uuid, uuid, uuid, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.cosign_execution_compensation(uuid, uuid, uuid, text, uuid, uuid) TO eye_commit;

-- RECONCILE: an effected handoff, or a partially effected / failed one whose every compensation is disposed (done or accepted, at least one) →
-- reconciled; the handoff's partial_effect / blocked exceptions resolved; the item leaves `exception` when nothing stays open.
CREATE OR REPLACE FUNCTION decision.reconcile_execution_handoff(p_tenant uuid, p_domain uuid, p_handoff uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE h decision.execution_handoffs%ROWTYPE; i decision.commitment_items%ROWTYPE; v_disposed int; v_live int; v_event uuid; v_ex jsonb; v_x uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.execution.reconcile']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'execution reconcile rejected (actor): recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO h FROM decision.execution_handoffs x WHERE x.handoff_id = p_handoff AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'execution reconcile rejected (unknown_handoff): no handoff % in this domain', p_handoff USING ERRCODE = '23503'; END IF;
  SELECT * INTO i FROM decision.commitment_items x WHERE x.item_id = h.item_id FOR UPDATE;
  IF p_actor NOT IN (i.owner_principal_id, coalesce(i.reviewer_principal_id, i.owner_principal_id)) THEN
    RAISE EXCEPTION 'execution reconcile rejected (not_party): the item''s owner or reviewer reconciles its handoff' USING ERRCODE = '42501';
  END IF;
  IF h.state NOT IN ('effected', 'partially_effected', 'failed') THEN
    RAISE EXCEPTION 'execution reconcile rejected (state): handoff % is %; a settled handoff is reconciled', p_handoff, h.state USING ERRCODE = '22023';
  END IF;
  IF h.state <> 'effected' THEN
    SELECT count(*) FILTER (WHERE c.state IN ('done', 'accepted')), count(*) FILTER (WHERE c.state IN ('proposed', 'assigned', 'in_progress'))
      INTO v_disposed, v_live FROM decision.execution_compensations c WHERE c.handoff_id = p_handoff;
    IF v_live > 0 OR v_disposed = 0 THEN
      RAISE EXCEPTION 'execution reconcile rejected (residual_undisposed): handoff % is % and its residual is not disposed (% compensation(s) disposed, % live) — assign a compensation and complete or co-sign it first',
        p_handoff, h.state, v_disposed, v_live USING ERRCODE = '22023';
    END IF;
  END IF;
  UPDATE decision.execution_handoffs SET state = 'reconciled', reconciled_by = p_actor, reconciled_at = clock_timestamp() WHERE handoff_id = p_handoff;
  SELECT coalesce(jsonb_agg(exception_id), '[]'::jsonb) INTO v_ex FROM decision.commitment_exceptions x
   WHERE x.item_id = h.item_id AND x.source_ref = format('handoff:%s', p_handoff) AND x.state IN ('open', 'proposed');
  UPDATE decision.commitment_exceptions SET state = 'resolved', resolution = format('handoff %s reconciled: residual disposed', p_handoff), resolved_by = p_actor, resolved_at = clock_timestamp()
   WHERE item_id = h.item_id AND source_ref = format('handoff:%s', p_handoff) AND state IN ('open', 'proposed');
  FOR v_x IN SELECT (e #>> '{}')::uuid FROM jsonb_array_elements(v_ex) e LOOP
    PERFORM decision._commitment_event(p_tenant, p_domain, h.commitment_id, h.item_id, 'exception.resolved', p_actor, jsonb_build_object('exception_id', v_x, 'by', 'reconcile', 'handoff_id', p_handoff), p_correlation);
  END LOOP;
  UPDATE decision.commitment_items SET state = 'in_progress', version = version + 1, updated_at = clock_timestamp()
   WHERE item_id = h.item_id AND state = 'exception' AND NOT EXISTS (SELECT 1 FROM decision.commitment_exceptions x WHERE x.item_id = h.item_id AND x.state IN ('open', 'proposed'));
  v_event := decision._commitment_event(p_tenant, p_domain, h.commitment_id, h.item_id, 'handoff.reconciled', p_actor, jsonb_build_object('handoff_id', p_handoff, 'from', h.state, 'exceptions_resolved', v_ex), p_correlation);
  RETURN jsonb_build_object('handoff_id', p_handoff, 'state', 'reconciled', 'from', h.state, 'exceptions_resolved', v_ex, 'event_id', v_event, 'item', decision._commitment_item_answer(h.item_id));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.reconcile_execution_handoff(uuid, uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.reconcile_execution_handoff(uuid, uuid, uuid, uuid, uuid) TO eye_commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §C6 THE TRACKER READ, THE TIMELINE, THE SIGNAL
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- The cross-package tracker (CAP-EO-08): every item of the domain as of an instant, with its open exceptions, its residual and the
-- transparent reasons of its severity (no opaque score: C3 when overdue or holding an undisposed residual, else C2).
CREATE OR REPLACE FUNCTION decision.commitment_tracker(p_tenant uuid, p_domain uuid, p_at timestamptz) RETURNS TABLE (
  item_id uuid, commitment_id uuid, package_id uuid, package_title text, parent_item_id uuid, kind text, title text, owner uuid, reviewer uuid, reviewer_basis text,
  due_at timestamptz, state text, overdue boolean, open_exceptions int, residual jsonb, severity text, reasons text[], objectives uuid[], resources uuid[], version int)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = decision, pg_catalog, pg_temp AS $$
  SELECT i.item_id, i.commitment_id, i.package_id, p.title, i.parent_item_id, i.kind, i.title, i.owner_principal_id, i.reviewer_principal_id, i.reviewer_basis,
         i.due_at, i.state, (i.due_at <= coalesce(p_at, clock_timestamp()) AND i.state IN ('open', 'in_progress', 'exception', 'retask_required')),
         (SELECT count(*)::int FROM decision.commitment_exceptions e WHERE e.item_id = i.item_id AND e.state IN ('open', 'proposed')),
         nullif((SELECT coalesce(jsonb_agg(jsonb_build_object('handoff_id', r.handoff_id, 'line_key', r.line_key, 'residual', r.residual_quantity,
                                   'compensation', (SELECT jsonb_build_object('compensation_id', c.compensation_id, 'kind', c.kind, 'owner', c.owner_principal_id, 'state', c.state, 'due_at', c.due_at)
                                                      FROM decision.execution_compensations c WHERE c.handoff_id = r.handoff_id ORDER BY c.created_at DESC LIMIT 1))
                                   ORDER BY r.handoff_id, r.line_key), '[]'::jsonb)
                   FROM decision.execution_residuals r WHERE r.item_id = i.item_id AND NOT r.disposed), '[]'::jsonb),
         CASE WHEN (i.due_at <= coalesce(p_at, clock_timestamp()) AND i.state IN ('open', 'in_progress', 'exception', 'retask_required'))
                   OR EXISTS (SELECT 1 FROM decision.execution_residuals r WHERE r.item_id = i.item_id AND NOT r.disposed) THEN 'C3' ELSE 'C2' END,
         array_remove(ARRAY[
           CASE WHEN i.due_at <= coalesce(p_at, clock_timestamp()) AND i.state IN ('open', 'in_progress', 'exception', 'retask_required') THEN 'overdue' END,
           CASE WHEN EXISTS (SELECT 1 FROM decision.execution_residuals r WHERE r.item_id = i.item_id AND NOT r.disposed) THEN 'undisposed_residual' END,
           CASE WHEN i.state = 'retask_required' THEN 'objective_changed' END,
           CASE WHEN EXISTS (SELECT 1 FROM decision.commitment_exceptions e WHERE e.item_id = i.item_id AND e.state IN ('open', 'proposed')) THEN 'open_exception' END], NULL),
         i.objective_ids, i.resource_ids, i.version
    FROM decision.commitment_items i JOIN decision.packages_current p ON p.package_id = i.package_id
   WHERE i.tenant_id = p_tenant AND i.domain_id = p_domain AND i.created_at <= coalesce(p_at, clock_timestamp())
   ORDER BY i.due_at, i.item_id;
$$;
REVOKE ALL ON FUNCTION decision.commitment_tracker(uuid, uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.commitment_tracker(uuid, uuid, timestamptz) TO eye_app, eye_commit;

-- THE EXECUTION TIMELINE (V03-T-372): one commitment's history as of an instant, in five lanes — commitment (the items' own events),
-- resource (the resources the items consume, by their declaration), operational (handoffs, attempts, effects), deviation (exceptions,
-- residuals, compensations) and governance (the package's decision events and the closure).
CREATE OR REPLACE FUNCTION decision.execution_timeline(p_tenant uuid, p_domain uuid, p_commitment uuid, p_at timestamptz) RETURNS TABLE (
  at timestamptz, lane text, kind text, item_id uuid, ref text, actor uuid, details jsonb)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = decision, graph, pg_catalog, pg_temp AS $$
  WITH evs AS (
    SELECT e.occurred_at AS at,
           CASE WHEN e.event LIKE 'handoff.%' THEN 'operational'
                WHEN e.event LIKE 'exception.%' OR e.event LIKE 'compensation.%' OR e.event IN ('item.overdue', 'item.retasked') THEN 'deviation'
                WHEN e.event LIKE 'closure.%' OR e.event = 'reviewer.reassigned' THEN 'governance'
                ELSE 'commitment' END AS lane,
           e.event AS kind, e.item_id, coalesce(e.details ->> 'handoff_id', e.details ->> 'exception_id', e.details ->> 'compensation_id', e.item_id::text) AS ref, e.actor_principal_id AS actor, e.details
      FROM decision.commitment_events e WHERE e.commitment_id = p_commitment AND e.tenant_id = p_tenant AND e.domain_id = p_domain
  ), res AS (
    SELECT i.created_at AS at, 'resource'::text AS lane, 'resource.bound'::text AS kind, i.item_id, r::text AS ref, i.created_by AS actor,
           jsonb_build_object('resource_id', r, 'title', (SELECT s.title FROM graph.strategy_current s WHERE s.strategy_object_id = r), 'item_title', i.title) AS details
      FROM decision.commitment_items i, unnest(i.resource_ids) r WHERE i.commitment_id = p_commitment AND i.tenant_id = p_tenant AND i.domain_id = p_domain
  ), att AS (
    SELECT a.attempted_at AS at, 'operational'::text AS lane, format('attempt.%s', a.outcome) AS kind, h.item_id, a.handoff_id::text AS ref, a.actor_principal_id AS actor,
           jsonb_build_object('attempt', a.attempt, 'outcome', a.outcome, 'http_status', a.http_status, 'by_tick', a.by_tick) AS details
      FROM decision.execution_attempts a JOIN decision.execution_handoffs h ON h.handoff_id = a.handoff_id WHERE h.commitment_id = p_commitment
  ), gov AS (
    SELECT pe.occurred_at AS at, 'governance'::text AS lane, pe.event AS kind, NULL::uuid AS item_id, pe.package_id::text AS ref, pe.actor_principal_id AS actor, pe.details
      FROM decision.package_events pe JOIN decision.commitments c ON c.package_id = pe.package_id
     WHERE c.commitment_id = p_commitment AND pe.event IN ('package.committed', 'execution.handoff_issued', 'execution.partial_effect', 'commitment.closed', 'package.closed', 'condition.breached', 'package.reopened')
  )
  SELECT * FROM (SELECT * FROM evs UNION ALL SELECT * FROM res UNION ALL SELECT * FROM att UNION ALL SELECT * FROM gov) x
   WHERE x.at <= coalesce(p_at, clock_timestamp()) ORDER BY x.at, x.lane, x.kind;
$$;
REVOKE ALL ON FUNCTION decision.execution_timeline(uuid, uuid, uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.execution_timeline(uuid, uuid, uuid, timestamptz) TO eye_app, eye_commit;

-- 0090 §0.7's contract, with its body (the attention consumer reads a CommitmentChanged event's item through THIS function only).
CREATE OR REPLACE FUNCTION decision.commitment_item_signal(p_tenant uuid, p_domain uuid, p_item uuid) RETURNS jsonb
STABLE SECURITY DEFINER SET search_path = decision, pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object('item_id', i.item_id, 'commitment_id', i.commitment_id, 'package_id', i.package_id, 'title', i.title, 'kind', i.kind,
                            'owner', i.owner_principal_id, 'reviewer', i.reviewer_principal_id, 'due_at', i.due_at, 'state', i.state,
                            'severity', CASE WHEN (i.due_at <= clock_timestamp() AND i.state IN ('open', 'in_progress', 'exception', 'retask_required'))
                                                  OR EXISTS (SELECT 1 FROM decision.execution_residuals r WHERE r.item_id = i.item_id AND NOT r.disposed) THEN 'C3' ELSE 'C2' END,
                            'overdue', i.due_at <= clock_timestamp() AND i.state IN ('open', 'in_progress', 'exception', 'retask_required'),
                            'open_exceptions', (SELECT count(*) FROM decision.commitment_exceptions e WHERE e.item_id = i.item_id AND e.state IN ('open', 'proposed')),
                            'residual', (SELECT jsonb_agg(jsonb_build_object('handoff_id', r.handoff_id, 'line_key', r.line_key, 'residual', r.residual_quantity) ORDER BY r.handoff_id, r.line_key)
                                           FROM decision.execution_residuals r WHERE r.item_id = i.item_id AND NOT r.disposed),
                            'objectives', to_jsonb(i.objective_ids))
    FROM decision.commitment_items i WHERE i.item_id = p_item AND i.tenant_id = p_tenant AND i.domain_id = p_domain;
$$ LANGUAGE sql;
REVOKE ALL ON FUNCTION decision.commitment_item_signal(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.commitment_item_signal(uuid, uuid, uuid) TO eye_app, eye_commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §C7 CLOSURE
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION decision.commitment_closure_blockers(p_commitment uuid) RETURNS text
STABLE SECURITY DEFINER SET search_path = decision, pg_catalog, pg_temp AS $$
  SELECT nullif(concat_ws('; ',
    (SELECT 'items not done / waived / cancelled: ' || string_agg(format('%s (%s)', i.title, i.state), ', ' ORDER BY i.due_at) FROM decision.commitment_items i
      WHERE i.commitment_id = p_commitment AND i.parent_item_id IS NOT NULL AND i.state NOT IN ('done', 'waived', 'cancelled')),
    (SELECT 'open exceptions: ' || string_agg(format('%s on %s', e.kind, e.item_id), ', ') FROM decision.commitment_exceptions e JOIN decision.commitment_items i ON i.item_id = e.item_id
      WHERE i.commitment_id = p_commitment AND e.state IN ('open', 'proposed')),
    (SELECT 'handoffs not reconciled (a residual undisposed): ' || string_agg(format('%s (%s)', h.handoff_id, h.state), ', ') FROM decision.execution_handoffs h
      WHERE h.commitment_id = p_commitment AND h.state <> 'reconciled')), '');
$$ LANGUAGE sql;
REVOKE ALL ON FUNCTION decision.commitment_closure_blockers(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.commitment_closure_blockers(uuid) TO eye_app, eye_commit;

CREATE OR REPLACE FUNCTION decision.propose_commitment_closure(p_closure_id uuid, p_tenant uuid, p_domain uuid, p_commitment uuid, p_deliverables jsonb, p_statement text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r decision.commitment_items%ROWTYPE; v_block text; v_event uuid; d jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.commitment.closure.propose']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'commitment closure rejected (actor): recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO r FROM decision.commitment_items x WHERE x.commitment_id = p_commitment AND x.parent_item_id IS NULL AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'commitment closure rejected (unknown_commitment): no tracked commitment % in this domain', p_commitment USING ERRCODE = '23503'; END IF;
  IF p_actor <> r.owner_principal_id THEN RAISE EXCEPTION 'commitment closure rejected (not_owner): the commitment''s owner proposes its closure' USING ERRCODE = '42501'; END IF;
  IF r.reviewer_principal_id IS NULL THEN RAISE EXCEPTION 'commitment closure rejected (no_reviewer): a closure is co-signed by the commitment''s reviewer and it has none' USING ERRCODE = '22023'; END IF;
  IF r.state NOT IN ('in_progress') THEN RAISE EXCEPTION 'commitment closure rejected (state): the commitment is %; an accepted commitment is closed', r.state USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM decision.commitment_closures c WHERE c.commitment_id = p_commitment AND c.state IN ('proposed', 'cosigned')) THEN
    RAISE EXCEPTION 'commitment closure rejected (duplicate): a closure of % is already proposed or co-signed', p_commitment USING ERRCODE = '23505';
  END IF;
  IF p_deliverables IS NULL OR jsonb_typeof(p_deliverables) <> 'array' OR jsonb_array_length(p_deliverables) = 0 THEN
    RAISE EXCEPTION 'commitment closure rejected (deliverables): a closure names its deliverables [{title, evidence}]' USING ERRCODE = '22023';
  END IF;
  FOR d IN SELECT * FROM jsonb_array_elements(p_deliverables) LOOP
    IF jsonb_typeof(d) <> 'object' OR length(coalesce(d ->> 'title', '')) < 2 OR length(coalesce(d ->> 'evidence', '')) < 8 THEN
      RAISE EXCEPTION 'commitment closure rejected (deliverables): each deliverable is {title (2+), evidence (8+)}' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF p_statement IS NULL OR length(btrim(p_statement)) < 8 THEN RAISE EXCEPTION 'commitment closure rejected (statement): the closure states what was delivered (8+ characters)' USING ERRCODE = '22023'; END IF;
  v_block := decision.commitment_closure_blockers(p_commitment);
  IF v_block IS NOT NULL THEN RAISE EXCEPTION 'commitment closure rejected (not_ready): %', v_block USING ERRCODE = '22023'; END IF;
  INSERT INTO decision.commitment_closures (closure_id, scope, tenant_id, domain_id, commitment_id, deliverables, statement, proposed_by, correlation_id)
  VALUES (p_closure_id, 'DOMAIN', p_tenant, p_domain, p_commitment, p_deliverables, btrim(p_statement), p_actor, p_correlation);
  v_event := decision._commitment_event(p_tenant, p_domain, p_commitment, r.item_id, 'closure.proposed', p_actor, jsonb_build_object('closure_id', p_closure_id, 'deliverables', p_deliverables), p_correlation);
  RETURN jsonb_build_object('closure_id', p_closure_id, 'commitment_id', p_commitment, 'state', 'proposed', 'reviewer', r.reviewer_principal_id, 'event_id', v_event, 'item_id', r.item_id);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.propose_commitment_closure(uuid, uuid, uuid, uuid, jsonb, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.propose_commitment_closure(uuid, uuid, uuid, uuid, jsonb, text, uuid, uuid) TO eye_commit;

-- THE CO-SIGN (OBJ-37): the reviewer, never the proposer, under decision.commitment.close (the canonical write of CMT version 2): the
-- conditions re-checked; the CMT re-declared at version 2, status closed (strategy.declared + strategy.closed, so the projection derives it);
-- the root done; commitment.closed.
CREATE OR REPLACE FUNCTION decision.cosign_commitment_closure(p_tenant uuid, p_domain uuid, p_closure uuid, p_cmt_header_digest text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, graph, executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE c decision.commitment_closures%ROWTYPE; r decision.commitment_items%ROWTYPE; s graph.strategy_current%ROWTYPE; v_block text; v_event uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.commitment.close']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'commitment closure rejected (actor): recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO c FROM decision.commitment_closures x WHERE x.closure_id = p_closure AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'commitment closure rejected (unknown_closure): no closure % in this domain', p_closure USING ERRCODE = '23503'; END IF;
  IF c.state <> 'proposed' THEN RAISE EXCEPTION 'commitment closure rejected (state): closure % is %', p_closure, c.state USING ERRCODE = '22023'; END IF;
  SELECT * INTO r FROM decision.commitment_items x WHERE x.commitment_id = c.commitment_id AND x.parent_item_id IS NULL FOR UPDATE;
  IF p_actor IS DISTINCT FROM r.reviewer_principal_id THEN RAISE EXCEPTION 'commitment closure rejected (not_reviewer): the commitment''s reviewer co-signs its closure' USING ERRCODE = '42501'; END IF;
  IF p_actor = c.proposed_by THEN RAISE EXCEPTION 'commitment closure rejected (self_cosign): the proposer never co-signs their own closure' USING ERRCODE = '42501'; END IF;
  v_block := decision.commitment_closure_blockers(c.commitment_id);
  IF v_block IS NOT NULL THEN RAISE EXCEPTION 'commitment closure rejected (not_ready): %', v_block USING ERRCODE = '22023'; END IF;
  IF p_cmt_header_digest IS NULL OR p_cmt_header_digest !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'commitment closure rejected (digest): the CMT version 2 header digest' USING ERRCODE = '22023'; END IF;
  SELECT * INTO s FROM graph.strategy_current x WHERE x.strategy_object_id = c.commitment_id FOR UPDATE;
  UPDATE graph.strategy_current SET status = 'closed', object_version = s.object_version + 1, updated_at = clock_timestamp() WHERE strategy_object_id = c.commitment_id;
  INSERT INTO graph.strategy_events (event_id, scope, tenant_id, domain_id, strategy_object_id, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, c.commitment_id, 'strategy.declared', p_actor,
          jsonb_build_object('object_type', 'CMT', 'title', s.title, 'version', s.object_version + 1, 'status', 'closed', 'via', 'decision.commitment.close', 'closure_id', p_closure), p_correlation);
  INSERT INTO graph.strategy_events (event_id, scope, tenant_id, domain_id, strategy_object_id, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, c.commitment_id, 'strategy.closed', p_actor,
          jsonb_build_object('version', s.object_version + 1, 'closure_id', p_closure, 'proposed_by', c.proposed_by, 'cosigned_by', p_actor), p_correlation);
  UPDATE decision.commitment_closures SET state = 'cosigned', cosigned_by = p_actor, cosigned_at = clock_timestamp(), cmt_header_digest = p_cmt_header_digest WHERE closure_id = p_closure;
  UPDATE decision.commitment_items SET state = 'done', deliverables = c.deliverables, completion_evidence = c.statement, version = version + 1, updated_at = clock_timestamp() WHERE item_id = r.item_id;
  PERFORM executive._resolve_human_tasks(p_tenant, p_domain, jsonb_build_object('kind', 'commitment_item', 'id', r.item_id), ARRAY['commitment.checkpoint', 'commitment.accept', 'commitment.renegotiate'], 'closed', p_closure, p_actor, p_correlation);
  v_event := decision._commitment_event(p_tenant, p_domain, c.commitment_id, r.item_id, 'closure.cosigned', p_actor,
                                        jsonb_build_object('closure_id', p_closure, 'proposed_by', c.proposed_by, 'cmt_version', s.object_version + 1, 'cmt_header_digest', p_cmt_header_digest), p_correlation);
  INSERT INTO decision.package_events (event_id, scope, tenant_id, domain_id, package_id, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, r.package_id, 'commitment.closed', p_actor,
          jsonb_build_object('commitment_id', c.commitment_id, 'closure_id', p_closure, 'proposed_by', c.proposed_by, 'cosigned_by', p_actor, 'cmt_version', s.object_version + 1, 'deliverables', c.deliverables), p_correlation);
  RETURN jsonb_build_object('closure_id', p_closure, 'commitment_id', c.commitment_id, 'state', 'cosigned', 'cmt_version', s.object_version + 1, 'event_id', v_event, 'item_id', r.item_id,
                            'package_id', r.package_id, 'proposed_by', c.proposed_by);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.cosign_commitment_closure(uuid, uuid, uuid, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.cosign_commitment_closure(uuid, uuid, uuid, text, uuid, uuid) TO eye_commit;

INSERT INTO observation.canonical_write_actions (action, object_types, rationale) VALUES
  ('decision.commitment.close', ARRAY['CMT'], 'The reviewer''s co-sign of a commitment''s closure admits the CMT''s next version (status closed) and nothing else (B34)'),
  ('graph.objective.revise', ARRAY['OBJ'], 'An objective''s revision admits the OBJ''s next version and nothing else (B34)')
ON CONFLICT (action) DO NOTHING;

-- 0045:221's body (the only declaration) with ONE block: a package whose committed CMT carries a tracker (every commitment from 0090) is
-- closed only once that CMT is closed (proposed by its owner, co-signed by its reviewer). A commitment made before 0090 has no tracker
-- and closes as before.
CREATE OR REPLACE FUNCTION decision.close_package(
  p_tenant uuid, p_domain uuid, p_package_id uuid, p_lessons text, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE p record; v_outcomes int; v_criteria int; v_cmt uuid; /* B34 (0090) */
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.close']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'closure rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO p FROM decision.packages_current x WHERE x.package_id = p_package_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'closure rejected: no such package in this domain' USING ERRCODE = '23503'; END IF;
  IF p.owner_principal_id <> p_actor THEN RAISE EXCEPTION 'closure rejected: the package owner closes it' USING ERRCODE = '42501'; END IF;
  IF p.state NOT IN ('committed', 'monitoring') THEN RAISE EXCEPTION 'closure rejected: package is %; a committed decision is closed with its outcomes', p.state USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_lessons, ''))) < 8 THEN RAISE EXCEPTION 'closure rejected: the lessons are recorded as text, at least eight characters' USING ERRCODE = '22023'; END IF;
  /* B34 (0090) commitments: the committed CMT's tracker closed first */
  SELECT c.commitment_id INTO v_cmt FROM decision.commitments c WHERE c.package_id = p_package_id AND c.version = p.committed_version;
  IF v_cmt IS NOT NULL AND EXISTS (SELECT 1 FROM decision.commitment_items i WHERE i.commitment_id = v_cmt)
     AND NOT EXISTS (SELECT 1 FROM decision.commitment_closures k WHERE k.commitment_id = v_cmt AND k.state = 'cosigned') THEN
    RAISE EXCEPTION 'closure rejected (commitment_open): the committed commitment % is not closed — its owner proposes the closure with deliverables and its reviewer co-signs it (decision.commitment.close) before the package closes%',
      v_cmt, coalesce(' — ' || decision.commitment_closure_blockers(v_cmt), '') USING ERRCODE = '22023';
  END IF;
  /* end B34 commitments */
  SELECT count(*) INTO v_outcomes FROM decision.outcomes o WHERE o.package_id = p_package_id AND o.version = p.committed_version;
  SELECT jsonb_array_length(v.choice -> 'outcome_criteria') INTO v_criteria FROM decision.package_versions v WHERE v.package_id = p_package_id AND v.version = p.committed_version;
  IF v_outcomes = 0 THEN RAISE EXCEPTION 'closure rejected: no outcome is recorded; a decision closes on what was observed, not on what was intended' USING ERRCODE = '22023'; END IF;
  UPDATE decision.packages_current SET state = 'closed' WHERE package_id = p_package_id;
  INSERT INTO decision.package_events (event_id, scope, tenant_id, domain_id, package_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_package_id, 'package.closed', p_actor,
          jsonb_build_object('version', p.committed_version, 'lessons', p_lessons, 'outcomes_recorded', v_outcomes, 'criteria', v_criteria,
                             'outcomes', (SELECT coalesce(jsonb_agg(jsonb_build_object('outcome_id', o.outcome_id, 'criterion_key', o.criterion_key, 'met', o.met) ORDER BY o.criterion_key), '[]'::jsonb) FROM decision.outcomes o WHERE o.package_id = p_package_id AND o.version = p.committed_version)), p_correlation);
  RETURN jsonb_build_object('state', 'closed', 'outcomes_recorded', v_outcomes, 'criteria', v_criteria);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.close_package(uuid,uuid,uuid,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.close_package(uuid,uuid,uuid,text,uuid,uuid,uuid) TO eye_commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §C8 RE-TASKING
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- An objective REVISED: its owner, a strategy owner or a domain administrator re-declares it at version + 1 (strategy.declared with the
-- revision's reason, so graph.expected_strategy derives the row). The route admits the OBJ's next version and publishes
-- GraphChanged/objective.changed; answers the commitments resting on the objective (the consumer re-reads them).
CREATE OR REPLACE FUNCTION graph.revise_objective(
  p_object uuid, p_tenant uuid, p_domain uuid, p_title text, p_statement text, p_reason text, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = graph, decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE s graph.strategy_current%ROWTYPE; v_title text; v_statement text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.objective.revise']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'objective revision rejected (actor): recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 OR length(p_reason) > 2000 THEN
    RAISE EXCEPTION 'objective revision rejected (reason): a reason of 8 to 2000 characters says why the objective changes' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO s FROM graph.strategy_current x WHERE x.strategy_object_id = p_object AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'objective revision rejected (unknown_object): no strategy object % in this domain', p_object USING ERRCODE = '23503'; END IF;
  IF s.object_type <> 'OBJ' THEN RAISE EXCEPTION 'objective revision rejected (type): % is a %, not an objective', p_object, s.object_type USING ERRCODE = '22023'; END IF;
  IF s.status <> 'active' THEN RAISE EXCEPTION 'objective revision rejected (inactive): % is %', p_object, s.status USING ERRCODE = '22023'; END IF;
  IF NOT (s.owner_principal_id = p_actor OR decision.holds_role(p_actor, p_tenant, p_domain, 'strategy_owner') OR decision.holds_role(p_actor, p_tenant, p_domain, 'domain_admin')) THEN
    RAISE EXCEPTION 'objective revision rejected (not_authority): principal % is neither the objective''s owner nor a strategy owner or domain administrator', p_actor USING ERRCODE = '42501';
  END IF;
  v_title := coalesce(nullif(btrim(p_title), ''), s.title); v_statement := coalesce(nullif(btrim(p_statement), ''), s.statement);
  IF length(v_title) NOT BETWEEN 2 AND 256 OR length(v_statement) NOT BETWEEN 2 AND 4096 THEN
    RAISE EXCEPTION 'objective revision rejected (text): a title of 2–256 and a statement of 2–4096 characters' USING ERRCODE = '22023';
  END IF;
  IF v_title = s.title AND v_statement = s.statement THEN RAISE EXCEPTION 'objective revision rejected (unchanged): the revision changes the title or the statement' USING ERRCODE = '22023'; END IF;
  UPDATE graph.strategy_current SET object_version = s.object_version + 1, title = v_title, statement = v_statement, updated_at = clock_timestamp() WHERE strategy_object_id = p_object;
  INSERT INTO graph.strategy_events (event_id, scope, tenant_id, domain_id, strategy_object_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_object, 'strategy.declared', p_actor,
          jsonb_build_object('object_type', 'OBJ', 'title', v_title, 'version', s.object_version + 1, 'status', 'active', 'via', 'graph.objective.revise', 'reason', btrim(p_reason),
                             'from_version', s.object_version), p_correlation);
  RETURN jsonb_build_object('strategy_object_id', p_object, 'object_type', 'OBJ', 'from_version', s.object_version, 'to_version', s.object_version + 1, 'title', v_title,
                            'owner', s.owner_principal_id, 'reason', btrim(p_reason), 'graph_event_id', p_event_id,
                            'commitments', (SELECT coalesce(jsonb_agg(DISTINCT i.commitment_id), '[]'::jsonb) FROM decision.commitment_items i WHERE p_object = ANY (i.objective_ids) AND i.tenant_id = p_tenant AND i.domain_id = p_domain));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION graph.revise_objective(uuid, uuid, uuid, text, text, text, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.revise_objective(uuid, uuid, uuid, text, text, text, uuid, uuid, uuid) TO eye_commit;

-- THE COMMITMENTS CONSUMER'S EFFECT (V02-T-117): one ITEM of an objective.changed event — the item resting on the objective (not terminal)
-- gets an objective_changed exception (once per event: the source is the event), becomes retask_required, and its reviewer is REASSIGNED
-- when its basis is objective_owner and the objective's owner is now another active member who is not the item's owner. A renegotiation
-- task for the owner. Idempotent: a redelivered event raises nothing twice and reassigns nobody twice.
CREATE OR REPLACE FUNCTION decision.apply_objective_change(p_tenant uuid, p_domain uuid, p_item uuid, p_objective uuid, p_source_event uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, graph, executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE i decision.commitment_items%ROWTYPE; s graph.strategy_current%ROWTYPE; v_x jsonb; v_from uuid; v_to uuid; v_retask uuid; v_reassign uuid; v_repeat boolean;
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.commitment.subscription.apply']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT * INTO i FROM decision.commitment_items x WHERE x.item_id = p_item AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('item_id', p_item, 'effect', 'unknown_item'); END IF;
  IF NOT (p_objective = ANY (i.objective_ids)) THEN RETURN jsonb_build_object('item_id', p_item, 'effect', 'not_resting'); END IF;
  IF i.state IN ('done', 'waived', 'cancelled') THEN RETURN jsonb_build_object('item_id', p_item, 'effect', 'terminal', 'state', i.state); END IF;
  SELECT * INTO s FROM graph.strategy_current x WHERE x.strategy_object_id = p_objective;
  v_repeat := EXISTS (SELECT 1 FROM decision.commitment_exceptions e WHERE e.item_id = p_item AND e.kind = 'objective_changed' AND e.source_ref = format('event:%s', p_source_event));
  IF v_repeat THEN RETURN jsonb_build_object('item_id', p_item, 'effect', 'repeated'); END IF;
  v_x := decision._raise_commitment_exception(p_tenant, p_domain, p_item, 'objective_changed', format('event:%s', p_source_event),
                                              format('objective %s revised to version %s ("%s"): re-task against it', p_objective, s.object_version, s.title), p_actor, p_correlation);
  UPDATE decision.commitment_items SET state = 'retask_required', version = version + 1, updated_at = clock_timestamp() WHERE item_id = p_item;
  v_retask := decision._commitment_event(p_tenant, p_domain, i.commitment_id, p_item, 'item.retasked', p_actor,
                                         jsonb_build_object('objective_id', p_objective, 'objective_version', s.object_version, 'source_event', p_source_event, 'from', i.state, 'exception_id', v_x ->> 'exception_id'), p_correlation);
  v_from := i.reviewer_principal_id;
  IF i.reviewer_basis = 'objective_owner' AND s.owner_principal_id IS DISTINCT FROM v_from AND s.owner_principal_id <> i.owner_principal_id
     AND decision.is_active_human(s.owner_principal_id, p_tenant) THEN
    v_to := s.owner_principal_id;
    UPDATE decision.commitment_items SET reviewer_principal_id = v_to, version = version + 1, updated_at = clock_timestamp() WHERE item_id = p_item;
    v_reassign := decision._commitment_event(p_tenant, p_domain, i.commitment_id, p_item, 'reviewer.reassigned', p_actor,
                                             jsonb_build_object('from', v_from, 'to', v_to, 'basis', 'objective_owner', 'objective_id', p_objective, 'source_event', p_source_event), p_correlation);
  END IF;
  RETURN jsonb_build_object('item_id', p_item, 'effect', CASE WHEN v_to IS NULL THEN 'retasked' ELSE 'retasked_reviewer_reassigned' END, 'exception_id', v_x ->> 'exception_id',
                            'retask_event_id', v_retask, 'reassign_event_id', v_reassign, 'reviewer_from', v_from, 'reviewer_to', v_to, 'item', decision._commitment_item_answer(p_item));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.apply_objective_change(uuid, uuid, uuid, uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.apply_objective_change(uuid, uuid, uuid, uuid, uuid, uuid, uuid) TO eye_commit;

-- The consumer's item selection: the live items resting on an objective (read under the subscriber's action).
CREATE OR REPLACE FUNCTION decision.items_resting_on(p_tenant uuid, p_domain uuid, p_objective uuid) RETURNS SETOF uuid
SECURITY DEFINER SET search_path = decision, observation, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.commitment.subscription.apply']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  RETURN QUERY SELECT i.item_id FROM decision.commitment_items i WHERE i.tenant_id = p_tenant AND i.domain_id = p_domain AND p_objective = ANY (i.objective_ids)
                  AND i.state NOT IN ('done', 'waived', 'cancelled') ORDER BY i.item_id;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.items_resting_on(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.items_resting_on(uuid, uuid, uuid) TO eye_commit;

-- THE AFTER-TICK PUBLICATION: the ledger events the tick's steps wrote, with their items, read under decision.commitment.signal.publish (the
-- attention agent's own write after the tick commits) — the route builds CommitmentChanged@v1 from them. Only events of the kinds the
-- sweep and the retries write; an unknown id answers nothing.
CREATE OR REPLACE FUNCTION decision.commitment_signals(p_tenant uuid, p_domain uuid, p_event_ids uuid[]) RETURNS SETOF jsonb
SECURITY DEFINER SET search_path = decision, observation, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.commitment.signal.publish']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  RETURN QUERY SELECT jsonb_build_object('event_id', e.event_id, 'event', e.event, 'occurred_at', e.occurred_at, 'commitment_id', e.commitment_id, 'item', decision._commitment_item_answer(e.item_id),
                                         'severity', decision.commitment_item_signal(p_tenant, p_domain, e.item_id) ->> 'severity')
    FROM decision.commitment_events e
   WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain AND e.event_id = ANY (p_event_ids) AND e.item_id IS NOT NULL
     AND e.event IN ('item.due_soon', 'item.overdue', 'exception.raised', 'handoff.partial', 'compensation.overdue')
   ORDER BY e.occurred_at, e.event_id;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.commitment_signals(uuid, uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.commitment_signals(uuid, uuid, uuid[]) TO eye_commit;
-- end section `commitments`

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- section `exposures`
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0090 part `exposures` — CP-6 B34: THE REMAINDER OF F-P4-13 (risk and opportunity intelligence) over B32's core (0089 §R). Forward-only;
-- every 0089 §R function changed here is RE-DECLARED WHOLE from its 0089 body (the only declaration before this one) with the change named.
--   X1  THE TAXONOMY'S ACTIVATION: a published version is IN FORCE only once a SECOND named, active member activates it (the publisher never
--       does); prediction.risk_taxonomy_activations (append-only), prediction.activate_risk_taxonomy (prediction.exposure.taxonomy.activate),
--       prediction.risk_taxonomy_current re-declared (the latest ACTIVATED version); the version in force before 0090 is carried as activated
--       (grandfathered, its publisher named — the rule that held when it was published).
--   X2  THE POLARITY ON THE CANONICAL RSK: RSK@v1's schema already declares the optional, validated `polarity` (risk|opportunity; 0089 §0) —
--       NO RSK@v2, no rebuild or expected_strategy change: the Strategy Graph's declare writes it when stated; prediction.register_exposure
--       re-declared — a canonical polarity is the one registered (a contradiction refused), an RSK declared without one is registered as
--       before and says so (polarity_source).
--   X3  SCENARIOS LINKED TO AN EXPOSURE: prediction.exposure_scenarios (append-only), prediction.link_exposure_scenario
--       (prediction.exposure.scenario.link) — a scenario of this domain, not retired, once per pair, with its relation and rationale.
--   X4  THE HOLD, THE WINDOW: prediction.exposure_holds (an invalidated / withdrawn ASU or strategy dependency, a withdrawn claim driver, a
--       withdrawn evidence object), prediction.exposure_window_end (an opportunity's latest hypothesis window).
--   X5  THE OUTCOME LOOP: prediction.exposure_outcome_reviews (append-only), prediction.exposure_detections (false precision, held, possible
--       duplicate, time-expired, outcome unreviewed, owner unresolved — with the named resolvers —, options unclassified: words, no score),
--       prediction.review_exposure_outcome (prediction.exposure.outcome.review: the owner or the sponsor reviews the outcomes a response's
--       decision recorded — the effect, the residual computed again, its verdict, the lesson).
--   X6  THE OWNER RESOLUTION: prediction.reassign_exposure_owner (prediction.exposure.owner.resolve: a named domain administrator re-owns an
--       exposure whose owner is no longer an active risk owner — only then).
--   X7  prediction.accept_exposure_assessment and prediction.sponsor_opportunity RE-DECLARED (0089:1519, 0089:1703): a HELD exposure refused
--       (409), the SIGNATURE (digest, signer) in the answer; a time-expired opportunity is DETECTED, not refused.
--   X8  prediction.exposure_concentration: the portfolio's concentration by category and by shared driver (within polarity and unit).
--   X9  prediction.exposure_add_version RE-DECLARED (0089:1347): persistence, option value, information value, the likelihood as a
--       DISTRIBUTION beside the bracket, indicators, second-order effects, the mitigation-versus-capture trade-off, the option CLASS.
--   (the event vocabulary and the residual causes widened for X3–X6 here, once)
-- RE-DECLARED 0089 §R FUNCTIONS (this part alone): risk_taxonomy_current, register_exposure, accept_exposure_assessment, sponsor_opportunity,
-- exposure_add_version. NEW: activate_risk_taxonomy, link_exposure_scenario, exposure_holds, exposure_window_end, exposure_detections,
-- review_exposure_outcome, reassign_exposure_owner, exposure_concentration.
-- NOT HERE (stated): the attention consumer of ExposureChanged, its routing and the opportunity item class (the ATTENTION part); the
-- outbox publisher's ROUTED map (the attention part); the events themselves are described by the TS routes (no trigger); the interface
-- register (unchanged, 50/0/0); aggregate_exposures (not re-declared: a held or flagged member is shown with its gap, the roll-up's own
-- refusals are 0089's).

-- ════════════════════════════════════════════════════════════════════════════
-- §X0 VOCABULARY: the exposure events and the residual causes B34 adds
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE prediction.exposure_events DROP CONSTRAINT exposure_events_event_check;
ALTER TABLE prediction.exposure_events ADD CONSTRAINT exposure_events_event_check CHECK (event IN (
  'exposure.registered', 'exposure.assessed', 'exposure.estimated', 'exposure.assessment_contested', 'exposure.assessment_accepted',
  'exposure.control_added', 'exposure.residual_computed', 'exposure.appetite_breached', 'exposure.routed', 'exposure.hypothesis_declared',
  'exposure.sponsored', 'exposure.response_opened', 'exposure.correlation_recorded', 'exposure.closed',
  -- B34 (0090)
  'exposure.scenario_linked', 'exposure.outcome_recorded', 'exposure.owner_reassigned'));
ALTER TABLE prediction.exposure_residuals DROP CONSTRAINT exposure_residuals_cause_check;
ALTER TABLE prediction.exposure_residuals ADD CONSTRAINT exposure_residuals_cause_check CHECK (cause IN ('acceptance', 'control', /* B34 (0090) */ 'outcome_review'));

-- ════════════════════════════════════════════════════════════════════════════
-- §X1 THE TAXONOMY'S ACTIVATION (published → activated by a second named human; the active version is the one in force)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE prediction.risk_taxonomy_activations (
  activation_id   uuid PRIMARY KEY,
  scope           text NOT NULL,
  tenant_id       uuid NOT NULL,
  domain_id       uuid NOT NULL,
  taxonomy_id     uuid NOT NULL REFERENCES prediction.risk_taxonomy (taxonomy_id),
  version         int  NOT NULL CHECK (version >= 1),
  reason          text NOT NULL CHECK (length(btrim(reason)) BETWEEN 8 AND 2000),
  activated_by    uuid NOT NULL,
  activated_at    timestamptz NOT NULL DEFAULT clock_timestamp(),
  grandfathered   boolean NOT NULL DEFAULT false,
  correlation_id  uuid NOT NULL,
  CONSTRAINT prta_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT prta_once UNIQUE (tenant_id, domain_id, version)
);
COMMENT ON TABLE prediction.risk_taxonomy_activations IS 'B34 (0090 part exposures): the activation of a published taxonomy version by a second named human — the latest activated version is in force (PR-27-002); append-only';
CREATE TRIGGER prta_append_only BEFORE UPDATE OR DELETE ON prediction.risk_taxonomy_activations FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
ALTER TABLE prediction.risk_taxonomy_activations ENABLE ROW LEVEL SECURITY;
ALTER TABLE prediction.risk_taxonomy_activations FORCE ROW LEVEL SECURITY;
CREATE POLICY prediction_isolation ON prediction.risk_taxonomy_activations USING (tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain()));
GRANT SELECT ON prediction.risk_taxonomy_activations TO eye_app, eye_commit;

-- The version in force before 0090 (the latest published, per domain) stays in force: carried as activated, GRANDFATHERED, its publisher
-- named — the rule that held when it was published. A version published after 0090 waits for its activation.
INSERT INTO prediction.risk_taxonomy_activations (activation_id, scope, tenant_id, domain_id, taxonomy_id, version, reason, activated_by, grandfathered, correlation_id)
SELECT gen_random_uuid(), 'DOMAIN', t.tenant_id, t.domain_id, t.taxonomy_id, t.version, 'in force before 0090 (published before the activation step existed)', t.published_by, true, t.correlation_id
  FROM prediction.risk_taxonomy t
 WHERE t.version = (SELECT max(u.version) FROM prediction.risk_taxonomy u WHERE u.tenant_id = t.tenant_id AND u.domain_id = t.domain_id)
ON CONFLICT ON CONSTRAINT prta_once DO NOTHING;

-- 0089:829 re-declared: the taxonomy IN FORCE is the latest ACTIVATED version (was: the latest published), or NULL.
CREATE OR REPLACE FUNCTION prediction.risk_taxonomy_current(p_tenant uuid, p_domain uuid) RETURNS prediction.risk_taxonomy
LANGUAGE sql STABLE SET search_path = prediction, pg_catalog, pg_temp AS $$
  SELECT t.* FROM prediction.risk_taxonomy t
    JOIN prediction.risk_taxonomy_activations a ON a.taxonomy_id = t.taxonomy_id
   WHERE t.tenant_id = p_tenant AND t.domain_id = p_domain ORDER BY t.version DESC LIMIT 1
$$;
GRANT EXECUTE ON FUNCTION prediction.risk_taxonomy_current(uuid, uuid) TO eye_app, eye_commit;

-- ACTIVATE a published version (a named, active MEMBER other than its publisher; a version newer than the one in force).
CREATE OR REPLACE FUNCTION prediction.activate_risk_taxonomy(p_activation_id uuid, p_tenant uuid, p_domain uuid, p_version int, p_reason text, p_actor uuid, p_correlation uuid)
RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, identity, decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE t prediction.risk_taxonomy%ROWTYPE; cur prediction.risk_taxonomy%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.exposure.taxonomy.activate']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'risk taxonomy activation rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF NOT decision.is_active_human(p_actor, p_tenant) THEN
    RAISE EXCEPTION 'risk taxonomy activation rejected: a taxonomy is activated by a named, active member' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('prediction.risk_taxonomy:' || p_domain::text, 0));
  SELECT * INTO t FROM prediction.risk_taxonomy x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.version = p_version;
  IF NOT FOUND THEN RAISE EXCEPTION 'risk taxonomy activation rejected: no such taxonomy version % in this domain', coalesce(p_version::text, '<none>') USING ERRCODE = '23503'; END IF;
  IF t.published_by = p_actor THEN
    RAISE EXCEPTION 'risk taxonomy activation rejected (separation): the publisher of version % does not activate it — a second named human does', p_version USING ERRCODE = '42501';
  END IF;
  cur := prediction.risk_taxonomy_current(p_tenant, p_domain);
  IF cur.taxonomy_id IS NOT NULL AND cur.version >= p_version THEN
    RAISE EXCEPTION 'risk taxonomy activation rejected (%): version % is in force; version % is %', CASE WHEN cur.version = p_version THEN 'already_active' ELSE 'superseded' END,
      cur.version, p_version, CASE WHEN cur.version = p_version THEN 'the one in force' ELSE 'older' END USING ERRCODE = '22023';
  END IF;
  IF coalesce(length(btrim(p_reason)), 0) < 8 THEN RAISE EXCEPTION 'risk taxonomy activation rejected: an activation states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  INSERT INTO prediction.risk_taxonomy_activations (activation_id, scope, tenant_id, domain_id, taxonomy_id, version, reason, activated_by, correlation_id)
  VALUES (p_activation_id, 'DOMAIN', p_tenant, p_domain, t.taxonomy_id, p_version, btrim(p_reason), p_actor, p_correlation);
  RETURN jsonb_build_object('activation_id', p_activation_id, 'taxonomy_id', t.taxonomy_id, 'version', p_version, 'published_by', t.published_by, 'activated_by', p_actor,
                            'supersedes', cur.version, 'in_force', true);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.activate_risk_taxonomy(uuid,uuid,uuid,int,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.activate_risk_taxonomy(uuid,uuid,uuid,int,text,uuid,uuid) TO eye_commit;

-- ════════════════════════════════════════════════════════════════════════════
-- §X2 THE POLARITY ON THE CANONICAL RSK — register_exposure re-declared (0089:1428) with ONE change: the RSK's canonical payload
-- `polarity` (RSK@v1's validated optional property), when stated, is the polarity registered — a contradicting request refused
-- (`exposure rejected (polarity)`); an RSK declared without one registers the request's polarity and says so (polarity_source).
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION prediction.register_exposure(p_exposure uuid, p_tenant uuid, p_domain uuid, p_polarity text, p_category text, p_owner uuid, p_review_every_days int,
                                                       p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, graph, identity, executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE s graph.strategy_current%ROWTYPE; t prediction.risk_taxonomy%ROWTYPE; v_pol text; v_n int; v_canon text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.exposure.register']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'exposure rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO s FROM graph.strategy_current x WHERE x.strategy_object_id = p_exposure AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND OR s.object_type <> 'RSK' THEN RAISE EXCEPTION 'exposure rejected: no such RSK % in this domain (declare it through the Strategy Graph first)', p_exposure USING ERRCODE = '23503'; END IF;
  IF s.status <> 'active' THEN RAISE EXCEPTION 'exposure rejected (not_active): RSK % is %, not active', p_exposure, s.status USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM prediction.exposure_current x WHERE x.exposure_id = p_exposure) THEN
    RAISE EXCEPTION 'exposure rejected (duplicate): RSK % is registered already', p_exposure USING ERRCODE = '22023';
  END IF;
  IF p_polarity IS NULL OR p_polarity NOT IN ('risk', 'opportunity') THEN RAISE EXCEPTION 'exposure rejected: polarity is risk or opportunity' USING ERRCODE = '22023'; END IF;
  -- B34 (0090): the canonical RSK's polarity (its latest version), when it states one
  SELECT o.payload ->> 'polarity' INTO v_canon FROM objects.canonical_objects o
   WHERE o.object_id = p_exposure AND o.tenant_id = p_tenant AND o.domain_id = p_domain ORDER BY o.object_version DESC LIMIT 1;
  IF v_canon IS NOT NULL AND v_canon <> p_polarity THEN
    RAISE EXCEPTION 'exposure rejected (polarity): RSK % is declared a % on its canonical object; it is not registered as a %', p_exposure, v_canon, p_polarity USING ERRCODE = '22023';
  END IF;
  t := prediction.risk_taxonomy_current(p_tenant, p_domain);
  IF t.taxonomy_id IS NULL THEN RAISE EXCEPTION 'exposure rejected (no_taxonomy): this domain has no risk taxonomy in force; an exposure is filed under a category of an activated version' USING ERRCODE = '22023'; END IF;
  SELECT c ->> 'polarity' INTO v_pol FROM jsonb_array_elements(t.categories) c WHERE c ->> 'key' = p_category;
  IF v_pol IS NULL THEN RAISE EXCEPTION 'exposure rejected: no category % in taxonomy version %', coalesce(p_category, '<none>'), t.version USING ERRCODE = '23503'; END IF;
  IF v_pol NOT IN (p_polarity, 'both') THEN RAISE EXCEPTION 'exposure rejected: category % files the polarity %, not %', p_category, v_pol, p_polarity USING ERRCODE = '22023'; END IF;
  IF p_owner IS NULL OR NOT prediction.is_exposure_owner_eligible(p_owner, p_tenant, p_domain) THEN
    RAISE EXCEPTION 'exposure rejected (owner): the owner % is not a named, active risk owner of this domain — a material risk or opportunity is never left unowned', coalesce(p_owner::text, '<none>') USING ERRCODE = '22023';
  END IF;
  IF p_review_every_days IS NOT NULL AND p_review_every_days NOT BETWEEN 1 AND 366 THEN RAISE EXCEPTION 'exposure rejected: the review cadence is 1..366 days' USING ERRCODE = '22023'; END IF;
  INSERT INTO prediction.exposure_current (exposure_id, scope, tenant_id, domain_id, polarity, category_key, taxonomy_version, owner_principal_id, review_every_days, registered_by, correlation_id)
  VALUES (p_exposure, 'DOMAIN', p_tenant, p_domain, p_polarity, p_category, t.version, p_owner, p_review_every_days, p_actor, p_correlation);
  INSERT INTO prediction.exposure_drivers (driver_row_id, scope, tenant_id, domain_id, exposure_id, driver_kind, driver_id, source, note, declared_by, correlation_id)
  SELECT gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_exposure, d.depends_on_kind, d.depends_on_id, 'rests_on', d.rationale, p_actor, p_correlation
    FROM graph.dependencies d
   WHERE d.dependent_object_id = p_exposure AND d.state = 'active' AND d.depends_on_kind IN ('entity', 'claim', 'edge', 'strategy')
  ON CONFLICT ON CONSTRAINT pexd_once DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  PERFORM prediction.exposure_event(p_exposure, p_tenant, p_domain, 'exposure.registered', p_actor,
    jsonb_build_object('polarity', p_polarity, 'category', p_category, 'taxonomy_version', t.version, 'owner', p_owner, 'review_every_days', p_review_every_days, 'drivers', v_n, 'title', s.title,
                       'polarity_source', CASE WHEN v_canon IS NULL THEN 'register' ELSE 'canonical' END), p_correlation);
  RETURN jsonb_build_object('exposure_id', p_exposure, 'polarity', p_polarity, 'category', p_category, 'taxonomy_version', t.version, 'owner', p_owner, 'state', 'identified', 'drivers', v_n, 'title', s.title,
                            'polarity_source', CASE WHEN v_canon IS NULL THEN 'register' ELSE 'canonical' END);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.register_exposure(uuid,uuid,uuid,text,text,uuid,int,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.register_exposure(uuid,uuid,uuid,text,text,uuid,int,uuid,uuid) TO eye_commit;

-- ════════════════════════════════════════════════════════════════════════════
-- §X3 SCENARIOS LINKED TO AN EXPOSURE (the scenario an exposure would materialise in, or that stresses it; the link is the analyst's)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE prediction.exposure_scenarios (
  link_id        uuid PRIMARY KEY,
  scope          text NOT NULL,
  tenant_id      uuid NOT NULL,
  domain_id      uuid NOT NULL,
  exposure_id    uuid NOT NULL REFERENCES prediction.exposure_current (exposure_id),
  scenario_id    uuid NOT NULL REFERENCES prediction.scenarios_current (scenario_id),
  relation       text NOT NULL CHECK (relation IN ('materializes_in', 'stresses', 'relieves')),
  rationale      text NOT NULL CHECK (length(btrim(rationale)) BETWEEN 8 AND 2000),
  linked_by      uuid NOT NULL,
  linked_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id uuid NOT NULL,
  CONSTRAINT pexs_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT pexs_once UNIQUE (exposure_id, scenario_id)
);
COMMENT ON TABLE prediction.exposure_scenarios IS 'B34 (0090 part exposures): the scenarios an exposure is linked to (materializes_in | stresses | relieves) with the rationale — append-only (F-P4-13, AI-52-003)';
CREATE TRIGGER pexs_append_only BEFORE UPDATE OR DELETE ON prediction.exposure_scenarios FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
ALTER TABLE prediction.exposure_scenarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE prediction.exposure_scenarios FORCE ROW LEVEL SECURITY;
CREATE POLICY prediction_isolation ON prediction.exposure_scenarios USING (tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain()));
GRANT SELECT ON prediction.exposure_scenarios TO eye_app, eye_commit;

CREATE OR REPLACE FUNCTION prediction.link_exposure_scenario(p_link_id uuid, p_exposure uuid, p_tenant uuid, p_domain uuid, p_scenario uuid, p_relation text, p_rationale text, p_actor uuid, p_correlation uuid)
RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE x prediction.exposure_current%ROWTYPE; sc prediction.scenarios_current%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.exposure.scenario.link']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'exposure scenario link rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF NOT decision.is_active_human(p_actor, p_tenant) THEN RAISE EXCEPTION 'exposure scenario link rejected: a link is a named, active member''s act' USING ERRCODE = '42501'; END IF;
  SELECT * INTO x FROM prediction.exposure_current e WHERE e.exposure_id = p_exposure AND e.tenant_id = p_tenant AND e.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'exposure scenario link rejected: no such exposure % in this domain', p_exposure USING ERRCODE = '23503'; END IF;
  IF x.state = 'closed' THEN RAISE EXCEPTION 'exposure scenario link rejected (closed): exposure % was closed at %', p_exposure, x.closed_at USING ERRCODE = '22023'; END IF;
  SELECT * INTO sc FROM prediction.scenarios_current s WHERE s.scenario_id = p_scenario AND s.tenant_id = p_tenant AND s.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'exposure scenario link rejected: no such scenario % in this domain', coalesce(p_scenario::text, '<none>') USING ERRCODE = '23503'; END IF;
  IF sc.state <> 'active' THEN RAISE EXCEPTION 'exposure scenario link rejected (state): scenario % is %; only an active scenario is linked', p_scenario, sc.state USING ERRCODE = '22023'; END IF;
  IF p_relation IS NULL OR p_relation NOT IN ('materializes_in', 'stresses', 'relieves') THEN
    RAISE EXCEPTION 'exposure scenario link rejected: the relation is materializes_in, stresses or relieves' USING ERRCODE = '22023';
  END IF;
  IF coalesce(length(btrim(p_rationale)), 0) < 8 THEN RAISE EXCEPTION 'exposure scenario link rejected: a link states its rationale (8+ characters)' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM prediction.exposure_scenarios k WHERE k.exposure_id = p_exposure AND k.scenario_id = p_scenario) THEN
    RAISE EXCEPTION 'exposure scenario link rejected (duplicate): scenario % is linked to exposure % already', p_scenario, p_exposure USING ERRCODE = '22023';
  END IF;
  INSERT INTO prediction.exposure_scenarios (link_id, scope, tenant_id, domain_id, exposure_id, scenario_id, relation, rationale, linked_by, correlation_id)
  VALUES (p_link_id, 'DOMAIN', p_tenant, p_domain, p_exposure, p_scenario, p_relation, btrim(p_rationale), p_actor, p_correlation);
  PERFORM prediction.exposure_event(p_exposure, p_tenant, p_domain, 'exposure.scenario_linked', p_actor,
    jsonb_build_object('link_id', p_link_id, 'scenario_id', p_scenario, 'relation', p_relation, 'scenario_title', sc.title), p_correlation);
  RETURN jsonb_build_object('link_id', p_link_id, 'exposure_id', p_exposure, 'scenario_id', p_scenario, 'relation', p_relation, 'scenario_title', sc.title);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.link_exposure_scenario(uuid,uuid,uuid,uuid,uuid,text,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.link_exposure_scenario(uuid,uuid,uuid,uuid,uuid,text,text,uuid,uuid) TO eye_commit;

-- ════════════════════════════════════════════════════════════════════════════
-- §X4 THE HOLD, THE WINDOW, THE DETECTIONS (reads: invoker functions under the caller's RLS; the ports call the hold and the window)
-- ════════════════════════════════════════════════════════════════════════════
-- THE HOLD: what the exposure rests on that no longer stands — an ASU (or any strategy object) INVALIDATED or WITHDRAWN among its drivers
-- or its RSK's active dependencies; a claim WITHDRAWN among them; an evidence object of its accepted (else current) version WITHDRAWN.
-- Each hold names the dependency and the reason. An exposure with a hold is not accepted and not sponsored (the ports refuse, 409).
CREATE OR REPLACE FUNCTION prediction.exposure_holds(p_exposure uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = prediction, graph, objects, pg_catalog, pg_temp AS $$
  WITH x AS (SELECT * FROM prediction.exposure_current WHERE exposure_id = p_exposure),
  deps AS (
    SELECT d.driver_kind AS kind, d.driver_id AS id FROM prediction.exposure_drivers d JOIN x ON x.exposure_id = d.exposure_id
    UNION
    SELECT g.depends_on_kind, g.depends_on_id FROM graph.dependencies g JOIN x ON x.exposure_id = g.dependent_object_id WHERE g.state = 'active'
  ),
  ver AS (SELECT v.* FROM prediction.exposure_versions v JOIN x ON x.exposure_id = v.exposure_id
           WHERE v.version = coalesce(x.accepted_version, NULLIF(x.current_version, 0))),
  held AS (
    SELECT 'strategy'::text AS kind, s.strategy_object_id AS id, s.object_type || ' ' || s.title AS dependency,
           CASE WHEN s.verification_state = 'invalidated' THEN 'invalidated' || coalesce(': ' || s.verification_reason, '') ELSE 'withdrawn' END AS reason
      FROM deps JOIN graph.strategy_current s ON s.strategy_object_id = deps.id
     WHERE deps.kind = 'strategy' AND (s.verification_state = 'invalidated' OR s.status = 'withdrawn')
    UNION ALL
    SELECT 'claim', o.object_id, 'CLM ' || o.object_id::text, 'withdrawn' || coalesce(': ' || o.withdrawal_reason, '')
      FROM deps JOIN objects.canonical_objects o ON o.object_id = deps.id
     WHERE deps.kind = 'claim' AND o.lifecycle_state = 'withdrawn'
       AND o.object_version = (SELECT max(o2.object_version) FROM objects.canonical_objects o2 WHERE o2.object_id = o.object_id)
    UNION ALL
    SELECT 'evidence', o.object_id, o.object_type || ' ' || o.object_id::text || ' (evidence of version ' || ver.version || ')', 'withdrawn' || coalesce(': ' || o.withdrawal_reason, '')
      FROM ver CROSS JOIN LATERAL jsonb_array_elements(ver.evidence) e JOIN objects.canonical_objects o ON o.object_id = (e ->> 'object_id')::uuid
     WHERE o.lifecycle_state = 'withdrawn'
       AND o.object_version = (SELECT max(o2.object_version) FROM objects.canonical_objects o2 WHERE o2.object_id = o.object_id)
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object('kind', kind, 'id', id, 'dependency', dependency, 'reason', reason) ORDER BY kind, id), '[]'::jsonb) FROM held
$$;
GRANT EXECUTE ON FUNCTION prediction.exposure_holds(uuid) TO eye_app, eye_commit;

-- THE WINDOW of an opportunity: the `to` of its latest hypothesis's timing (a date), or NULL when none is stated.
CREATE OR REPLACE FUNCTION prediction.exposure_window_end(p_exposure uuid) RETURNS date
LANGUAGE sql STABLE SET search_path = prediction, pg_catalog, pg_temp AS $$
  SELECT CASE WHEN (h.timing ->> 'to') ~ '^\d{4}-\d{2}-\d{2}' THEN left(h.timing ->> 'to', 10)::date END
    FROM prediction.opportunity_hypotheses h WHERE h.exposure_id = p_exposure ORDER BY h.version DESC LIMIT 1
$$;
GRANT EXECUTE ON FUNCTION prediction.exposure_window_end(uuid) TO eye_app, eye_commit;

-- ════════════════════════════════════════════════════════════════════════════
-- §X5 THE OUTCOME LOOP (JRN-08 monitor → outcome, JRN-09 learn, AI-52-005, CAP-FW-04/-05)
-- ════════════════════════════════════════════════════════════════════════════
-- A REVIEW of the outcomes a response's decision recorded (decision.outcomes — the decision module's own record, read, never written),
-- against the exposure: the effect judged, the residual computed AGAIN (a new residual, cause `outcome_review`) with its verdict, the
-- LESSON recorded. Append-only; one review per outcome set (a later outcome is reviewed again).
CREATE TABLE prediction.exposure_outcome_reviews (
  review_id         uuid PRIMARY KEY,
  scope             text NOT NULL,
  tenant_id         uuid NOT NULL,
  domain_id         uuid NOT NULL,
  exposure_id       uuid NOT NULL REFERENCES prediction.exposure_current (exposure_id),
  response_id       uuid NOT NULL REFERENCES prediction.exposure_responses (response_id),
  package_id        uuid NOT NULL,
  outcome_ids       uuid[] NOT NULL CHECK (cardinality(outcome_ids) >= 1),
  outcomes          jsonb NOT NULL CHECK (jsonb_typeof(outcomes) = 'array'),
  effect            text NOT NULL CHECK (effect IN ('effective', 'partly_effective', 'ineffective', 'inconclusive')),
  residual_verdict  text NOT NULL CHECK (residual_verdict IN ('stands', 'reassess', 'close')),
  residual_before   uuid REFERENCES prediction.exposure_residuals (residual_id),
  residual_after    uuid REFERENCES prediction.exposure_residuals (residual_id),
  lesson            text NOT NULL CHECK (length(btrim(lesson)) BETWEEN 16 AND 4000),
  reviewed_by       uuid NOT NULL,
  reviewed_at       timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id    uuid NOT NULL,
  CONSTRAINT pexo_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX pexo_exposure ON prediction.exposure_outcome_reviews (exposure_id, reviewed_at);
COMMENT ON TABLE prediction.exposure_outcome_reviews IS 'B34 (0090 part exposures): a response''s decision outcomes reviewed against the exposure — the effect, the residual reviewed, the lesson (JRN-08/-09, AI-52-005); append-only';
CREATE TRIGGER pexo_append_only BEFORE UPDATE OR DELETE ON prediction.exposure_outcome_reviews FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
ALTER TABLE prediction.exposure_outcome_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE prediction.exposure_outcome_reviews FORCE ROW LEVEL SECURITY;
CREATE POLICY prediction_isolation ON prediction.exposure_outcome_reviews USING (tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain()));
GRANT SELECT ON prediction.exposure_outcome_reviews TO eye_app, eye_commit;

-- THE DETECTIONS of one exposure (transparent rules, each stated in words; nothing scored):
--   false_precision       the version in view (accepted, else current) states a probability bracket narrower than 0.05, or an impact range
--                         narrower than 2% of its high end, on fewer than three evidence objects (a POINT probability is refused at intake)
--   held                  exposure_holds: an invalidated or withdrawn dependency
--   possible_duplicate    an opportunity: another open opportunity of the same category sharing an entity, claim or edge driver
--   time_expired          an opportunity: its latest hypothesis window ended before today and it is not closed
--   outcome_unreviewed    a response's decision recorded an outcome no review of this exposure has covered (JRN-08 monitor → outcome)
--   owner_unresolved      the owner is no longer a named, active risk owner of this domain — routed to the NAMED RESOLVERS (the domain's
--                         active member domain administrators), who re-own it under prediction.exposure.owner.resolve
--   options_unclassified  the version in view has options without a class (no_regret | reversible | contingent | irreversible)
CREATE OR REPLACE FUNCTION prediction.exposure_detections(p_exposure uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = prediction, graph, decision, identity, executive, pg_catalog, pg_temp AS $$
DECLARE x prediction.exposure_current%ROWTYPE; v prediction.exposure_versions%ROWTYPE; d jsonb := '[]'::jsonb; n int; r record; v_to date; v_keys jsonb;
BEGIN
  SELECT * INTO x FROM prediction.exposure_current WHERE exposure_id = p_exposure;
  IF x.exposure_id IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO v FROM prediction.exposure_versions w WHERE w.exposure_id = p_exposure AND w.version = coalesce(x.accepted_version, NULLIF(x.current_version, 0));
  IF v.exposure_id IS NOT NULL THEN
    n := jsonb_array_length(v.evidence);
    IF v.probability_low IS NOT NULL AND (v.probability_high - v.probability_low) < 0.05 AND n < 3 THEN
      d := d || jsonb_build_object('kind', 'false_precision', 'version', v.version,
        'detail', format('a probability bracket [%s, %s] (width %s) on %s evidence object(s) is more precise than its evidence — widen it or cite more', v.probability_low, v.probability_high, v.probability_high - v.probability_low, n));
    END IF;
    IF v.impact_high > 0 AND (v.impact_high - v.impact_low) < 0.02 * v.impact_high AND n < 3 THEN
      d := d || jsonb_build_object('kind', 'false_precision', 'version', v.version,
        'detail', format('an impact range [%s, %s] %s narrower than 2%% of its high end on %s evidence object(s) is more precise than its evidence', v.impact_low, v.impact_high, v.unit, n));
    END IF;
    SELECT coalesce(jsonb_agg(o ->> 'key'), '[]'::jsonb) INTO v_keys FROM jsonb_array_elements(v.options) o WHERE NOT (o ? 'class');
    IF jsonb_array_length(v_keys) > 0 THEN
      d := d || jsonb_build_object('kind', 'options_unclassified', 'version', v.version, 'options', v_keys,
        'detail', 'each response option is classified no_regret, reversible, contingent or irreversible in the next assessment');
    END IF;
  END IF;
  IF x.state <> 'closed' THEN
    FOR r IN SELECT value AS h FROM jsonb_array_elements(prediction.exposure_holds(p_exposure)) LOOP
      d := d || jsonb_build_object('kind', 'held', 'dependency', r.h ->> 'dependency', 'id', r.h ->> 'id', 'detail', format('rests on %s — %s: not accepted or sponsored until resolved', r.h ->> 'dependency', r.h ->> 'reason'));
    END LOOP;
    IF x.polarity = 'opportunity' THEN
      FOR r IN SELECT o.exposure_id AS other, count(*) AS shared FROM prediction.exposure_current o
                 JOIN prediction.exposure_drivers od ON od.exposure_id = o.exposure_id AND od.driver_kind IN ('entity', 'claim', 'edge')
                 JOIN prediction.exposure_drivers xd ON xd.exposure_id = p_exposure AND xd.driver_kind = od.driver_kind AND xd.driver_id = od.driver_id
                WHERE o.exposure_id <> p_exposure AND o.tenant_id = x.tenant_id AND o.domain_id = x.domain_id AND o.polarity = 'opportunity' AND o.state <> 'closed'
                  AND o.category_key = x.category_key
                GROUP BY o.exposure_id ORDER BY o.exposure_id LOOP
        d := d || jsonb_build_object('kind', 'possible_duplicate', 'other', r.other, 'shared_drivers', r.shared,
          'detail', format('another open %s opportunity shares %s driver(s) with this one — one of them is closed as a duplicate, or the difference is stated', x.category_key, r.shared));
      END LOOP;
      v_to := prediction.exposure_window_end(p_exposure);
      IF v_to IS NOT NULL AND v_to < current_date THEN
        d := d || jsonb_build_object('kind', 'time_expired', 'window_end', v_to, 'detail', format('the window ended on %s: close it expired, or declare a hypothesis with a new window', v_to));
      END IF;
    END IF;
    FOR r IN SELECT q.response_id, q.package_id, count(o.outcome_id) AS n FROM prediction.exposure_responses q
               JOIN decision.outcomes o ON o.package_id = q.package_id
              WHERE q.exposure_id = p_exposure
                AND NOT EXISTS (SELECT 1 FROM prediction.exposure_outcome_reviews k WHERE k.response_id = q.response_id AND o.outcome_id = ANY (k.outcome_ids))
              GROUP BY q.response_id, q.package_id ORDER BY q.response_id LOOP
      d := d || jsonb_build_object('kind', 'outcome_unreviewed', 'response_id', r.response_id, 'package_id', r.package_id, 'outcomes', r.n,
        'detail', format('%s outcome(s) of the response''s decision are recorded and not yet reviewed against this exposure', r.n));
    END LOOP;
    IF NOT prediction.is_exposure_owner_eligible(x.owner_principal_id, x.tenant_id, x.domain_id) THEN
      d := d || jsonb_build_object('kind', 'owner_unresolved', 'owner', x.owner_principal_id, 'resolver_role', 'domain_admin',
        'resolvers', (SELECT coalesce(jsonb_agg(jsonb_build_object('principal_id', p.id, 'name', p.display_name) ORDER BY p.display_name, p.id), '[]'::jsonb)
                        FROM identity.principals p WHERE p.tenant_id = x.tenant_id AND p.kind = 'human' AND p.status = 'active' AND executive.principal_affiliation(p.id) = 'member'
                         AND executive.holds_role(p.id, x.tenant_id, x.domain_id, ARRAY['domain_admin'])),
        'detail', 'the owner is no longer a named, active risk owner of this domain: a domain administrator re-owns it (POST …/owner/resolve)');
    END IF;
  END IF;
  RETURN d;
END $$;
GRANT EXECUTE ON FUNCTION prediction.exposure_detections(uuid) TO eye_app, eye_commit;

CREATE OR REPLACE FUNCTION prediction.review_exposure_outcome(p_review_id uuid, p_exposure uuid, p_tenant uuid, p_domain uuid, p_response uuid, p_effect text, p_verdict text, p_lesson text,
                                                             p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, decision, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE x prediction.exposure_current%ROWTYPE; q prediction.exposure_responses%ROWTYPE; v_ids uuid[]; v_outcomes jsonb; v_before uuid; r jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.exposure.outcome.review']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'exposure outcome review rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO x FROM prediction.exposure_current e WHERE e.exposure_id = p_exposure AND e.tenant_id = p_tenant AND e.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'exposure outcome review rejected: no such exposure % in this domain', p_exposure USING ERRCODE = '23503'; END IF;
  IF (p_actor IS DISTINCT FROM x.owner_principal_id AND p_actor IS DISTINCT FROM x.sponsor_principal_id) OR NOT decision.is_active_human(p_actor, p_tenant) THEN
    RAISE EXCEPTION 'exposure outcome review rejected: an outcome is reviewed by the exposure''s owner (%) or its sponsor, a named, active member', x.owner_principal_id USING ERRCODE = '42501';
  END IF;
  IF x.state = 'closed' THEN RAISE EXCEPTION 'exposure outcome review rejected (closed): exposure % was closed at %', p_exposure, x.closed_at USING ERRCODE = '22023'; END IF;
  SELECT * INTO q FROM prediction.exposure_responses k WHERE k.response_id = p_response AND k.exposure_id = p_exposure;
  IF NOT FOUND THEN RAISE EXCEPTION 'exposure outcome review rejected: no such response % of exposure %', p_response, p_exposure USING ERRCODE = '23503'; END IF;
  IF p_effect IS NULL OR p_effect NOT IN ('effective', 'partly_effective', 'ineffective', 'inconclusive') THEN
    RAISE EXCEPTION 'exposure outcome review rejected: the effect is effective, partly_effective, ineffective or inconclusive' USING ERRCODE = '22023';
  END IF;
  IF p_verdict IS NULL OR p_verdict NOT IN ('stands', 'reassess', 'close') THEN
    RAISE EXCEPTION 'exposure outcome review rejected: the residual verdict is stands, reassess or close' USING ERRCODE = '22023';
  END IF;
  IF coalesce(length(btrim(p_lesson)), 0) < 16 THEN RAISE EXCEPTION 'exposure outcome review rejected: a review records its lesson (16+ characters)' USING ERRCODE = '22023'; END IF;
  SELECT coalesce(array_agg(o.outcome_id ORDER BY o.recorded_at, o.outcome_id), '{}'),
         coalesce(jsonb_agg(jsonb_build_object('outcome_id', o.outcome_id, 'criterion_key', o.criterion_key, 'met', o.met, 'observed_value', o.observed_value, 'target', o.target,
                                               'comparator', o.comparator, 'unit', o.unit, 'recorded_at', o.recorded_at) ORDER BY o.recorded_at, o.outcome_id), '[]'::jsonb)
    INTO v_ids, v_outcomes
    FROM decision.outcomes o WHERE o.package_id = q.package_id AND o.tenant_id = p_tenant AND o.domain_id = p_domain;
  IF cardinality(v_ids) = 0 THEN
    RAISE EXCEPTION 'exposure outcome review rejected (no_outcome): the response''s decision (package %) has recorded no outcome — the outcome is recorded first under decision.outcome', q.package_id USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM prediction.exposure_outcome_reviews k WHERE k.response_id = p_response AND k.outcome_ids @> v_ids) THEN
    RAISE EXCEPTION 'exposure outcome review rejected (already_reviewed): every outcome of the response''s decision is reviewed already; a later outcome is reviewed when it is recorded' USING ERRCODE = '22023';
  END IF;
  SELECT k.residual_id INTO v_before FROM prediction.exposure_residuals k WHERE k.exposure_id = p_exposure ORDER BY k.computed_at DESC, k.residual_id DESC LIMIT 1;
  r := prediction.exposure_store_residual(p_exposure, 'outcome_review', p_actor, p_correlation);   -- NULL when no assessment is accepted (said below)
  INSERT INTO prediction.exposure_outcome_reviews (review_id, scope, tenant_id, domain_id, exposure_id, response_id, package_id, outcome_ids, outcomes, effect, residual_verdict,
                                                  residual_before, residual_after, lesson, reviewed_by, correlation_id)
  VALUES (p_review_id, 'DOMAIN', p_tenant, p_domain, p_exposure, p_response, q.package_id, v_ids, v_outcomes, p_effect, p_verdict, v_before, (r ->> 'residual_id')::uuid, btrim(p_lesson), p_actor, p_correlation);
  PERFORM prediction.exposure_event(p_exposure, p_tenant, p_domain, 'exposure.outcome_recorded', p_actor,
    jsonb_build_object('review_id', p_review_id, 'response_id', p_response, 'package_id', q.package_id, 'outcomes', v_outcomes, 'effect', p_effect, 'residual_verdict', p_verdict,
                       'residual_before', v_before, 'residual_after', r ->> 'residual_id', 'lesson', btrim(p_lesson), 'version', x.accepted_version), p_correlation);
  RETURN jsonb_build_object('review_id', p_review_id, 'exposure_id', p_exposure, 'response_id', p_response, 'package_id', q.package_id, 'outcomes', v_outcomes, 'effect', p_effect,
                            'residual_verdict', p_verdict, 'residual_before', v_before, 'residual', r, 'lesson', btrim(p_lesson),
                            'residual_note', CASE WHEN r IS NULL THEN 'no assessment is accepted: no residual is computed' ELSE r ->> 'computation' END,
                            'route_due', (r ->> 'breach')::boolean IS TRUE);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.review_exposure_outcome(uuid,uuid,uuid,uuid,uuid,text,text,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.review_exposure_outcome(uuid,uuid,uuid,uuid,uuid,text,text,text,uuid,uuid) TO eye_commit;

-- ════════════════════════════════════════════════════════════════════════════
-- §X6 THE OWNER RESOLUTION: an exposure whose owner is missing or no longer a named, active risk owner is re-owned by a NAMED RESOLVER
-- (an active member domain administrator) — only then (an active owner is never re-owned around them), to an eligible risk owner.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION prediction.reassign_exposure_owner(p_exposure uuid, p_tenant uuid, p_domain uuid, p_owner uuid, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, decision, executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE x prediction.exposure_current%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.exposure.owner.resolve']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'exposure owner resolution rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF NOT decision.is_active_human(p_actor, p_tenant) OR NOT executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['domain_admin', 'platform_admin']) THEN
    RAISE EXCEPTION 'exposure owner resolution rejected: an owner is resolved by a named, active domain administrator' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO x FROM prediction.exposure_current e WHERE e.exposure_id = p_exposure AND e.tenant_id = p_tenant AND e.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'exposure owner resolution rejected: no such exposure % in this domain', p_exposure USING ERRCODE = '23503'; END IF;
  IF x.state = 'closed' THEN RAISE EXCEPTION 'exposure owner resolution rejected (closed): exposure % was closed at %', p_exposure, x.closed_at USING ERRCODE = '22023'; END IF;
  IF prediction.is_exposure_owner_eligible(x.owner_principal_id, p_tenant, p_domain) THEN
    RAISE EXCEPTION 'exposure owner resolution rejected (not_needed): the owner % is a named, active risk owner; an owner is not re-owned around them', x.owner_principal_id USING ERRCODE = '22023';
  END IF;
  IF p_owner IS NULL OR NOT prediction.is_exposure_owner_eligible(p_owner, p_tenant, p_domain) OR NOT decision.is_active_human(p_owner, p_tenant) THEN
    RAISE EXCEPTION 'exposure owner resolution rejected (owner): % is not a named, active risk owner of this domain', coalesce(p_owner::text, '<none>') USING ERRCODE = '22023';
  END IF;
  IF coalesce(length(btrim(p_reason)), 0) < 8 THEN RAISE EXCEPTION 'exposure owner resolution rejected: a resolution states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  UPDATE prediction.exposure_current SET owner_principal_id = p_owner, updated_at = clock_timestamp() WHERE exposure_id = p_exposure;
  PERFORM prediction.exposure_event(p_exposure, p_tenant, p_domain, 'exposure.owner_reassigned', p_actor,
    jsonb_build_object('from', x.owner_principal_id, 'to', p_owner, 'resolver', p_actor, 'reason', btrim(p_reason)), p_correlation);
  RETURN jsonb_build_object('exposure_id', p_exposure, 'from', x.owner_principal_id, 'to', p_owner, 'resolver', p_actor, 'reason', btrim(p_reason));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.reassign_exposure_owner(uuid,uuid,uuid,uuid,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.reassign_exposure_owner(uuid,uuid,uuid,uuid,text,uuid,uuid) TO eye_commit;

-- ════════════════════════════════════════════════════════════════════════════
-- §X7 ACCEPT and SPONSOR re-declared WHOLE from 0089:1519 and 0089:1703 with the HOLD refused as
-- the record's state (409), and the SIGNATURE (the exact digest and the named signer) in the answer the page renders.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION prediction.accept_exposure_assessment(p_exposure uuid, p_tenant uuid, p_domain uuid, p_version int, p_digest text, p_rationale text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE x prediction.exposure_current%ROWTYPE; v prediction.exposure_versions%ROWTYPE; r jsonb; v_sup int[]; v_holds jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.exposure.accept']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'exposure acceptance rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO x FROM prediction.exposure_current e WHERE e.exposure_id = p_exposure AND e.tenant_id = p_tenant AND e.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'exposure acceptance rejected: no such exposure % in this domain', p_exposure USING ERRCODE = '23503'; END IF;
  IF x.owner_principal_id IS DISTINCT FROM p_actor OR NOT EXISTS (SELECT 1 FROM identity.principals p WHERE p.id = p_actor AND p.kind = 'human' AND p.status = 'active') THEN
    RAISE EXCEPTION 'exposure acceptance rejected: the assessment is accepted by the exposure''s owner (%), a named, active human — never by another person or an agent', x.owner_principal_id USING ERRCODE = '42501';
  END IF;
  IF x.state = 'closed' THEN RAISE EXCEPTION 'exposure acceptance rejected (closed): exposure % was closed at %', p_exposure, x.closed_at USING ERRCODE = '22023'; END IF;
  SELECT * INTO v FROM prediction.exposure_versions w WHERE w.exposure_id = p_exposure AND w.version = p_version FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'exposure acceptance rejected: no such version % of exposure %', p_version, p_exposure USING ERRCODE = '23503'; END IF;
  IF v.state = 'accepted' THEN RAISE EXCEPTION 'exposure acceptance rejected (already_accepted): version % is the accepted assessment since %', p_version, x.accepted_at USING ERRCODE = '22023'; END IF;
  IF v.state = 'superseded' THEN RAISE EXCEPTION 'exposure acceptance rejected (superseded): version % was superseded', p_version USING ERRCODE = '22023'; END IF;
  IF p_digest IS DISTINCT FROM v.digest THEN
    RAISE EXCEPTION 'exposure acceptance rejected (stale_digest): the digest accepted is not version %''s (%…) — preview the version again', p_version, left(v.digest, 12) USING ERRCODE = '22023';
  END IF;
  IF coalesce(length(btrim(p_rationale)), 0) < 8 THEN RAISE EXCEPTION 'exposure acceptance rejected: an acceptance states its rationale (8+ characters)' USING ERRCODE = '22023'; END IF;
  -- B34 (0090): an exposure resting on an INVALIDATED dependency is HELD — nothing is accepted on a basis that no longer stands
  v_holds := prediction.exposure_holds(p_exposure);
  IF jsonb_array_length(v_holds) > 0 THEN
    RAISE EXCEPTION 'exposure acceptance rejected (state): exposure % is HELD — it rests on % (%); resolve the dependency or re-assess without it', p_exposure,
      v_holds -> 0 ->> 'dependency', v_holds -> 0 ->> 'reason' USING ERRCODE = '22023';
  END IF;
  SELECT coalesce(array_agg(w.version ORDER BY w.version), '{}') INTO v_sup FROM prediction.exposure_versions w
   WHERE w.exposure_id = p_exposure AND w.version <> p_version AND (w.state = 'accepted' OR (w.state IN ('proposed', 'contested') AND w.version < p_version));
  UPDATE prediction.exposure_versions SET state = 'superseded', state_changed_at = clock_timestamp(), state_changed_by = p_actor, state_reason = format('superseded by the acceptance of version %s', p_version)
   WHERE exposure_id = p_exposure AND version = ANY (v_sup);
  UPDATE prediction.exposure_versions SET state = 'accepted', state_changed_at = clock_timestamp(), state_changed_by = p_actor, state_reason = btrim(p_rationale)
   WHERE exposure_id = p_exposure AND version = p_version;
  UPDATE prediction.exposure_current SET accepted_version = p_version, accepted_by = p_actor, accepted_at = clock_timestamp(),
         state = CASE WHEN state = 'sponsored' THEN 'sponsored' ELSE 'accepted' END, updated_at = clock_timestamp()
   WHERE exposure_id = p_exposure;
  PERFORM prediction.exposure_event(p_exposure, p_tenant, p_domain, 'exposure.assessment_accepted', p_actor,
    jsonb_build_object('version', p_version, 'digest', v.digest, 'rationale', btrim(p_rationale), 'superseded', to_jsonb(v_sup), 'assessed_kind', v.assessed_kind, 'assessed_by', v.assessed_by), p_correlation);
  r := prediction.exposure_store_residual(p_exposure, 'acceptance', p_actor, p_correlation);
  RETURN jsonb_build_object('exposure_id', p_exposure, 'version', p_version, 'digest', v.digest, 'state', 'accepted', 'superseded', to_jsonb(v_sup), 'residual', r,
                            'route_due', (r ->> 'breach')::boolean IS TRUE,
                            -- B34 (0090): the signature — the exact digest and the named signer, rendered on the page
                            'signature', jsonb_build_object('digest', v.digest, 'signer', p_actor, 'signer_name', (SELECT p.display_name FROM identity.principals p WHERE p.id = p_actor), 'act', 'accept'));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.accept_exposure_assessment(uuid,uuid,uuid,int,text,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.accept_exposure_assessment(uuid,uuid,uuid,int,text,text,uuid,uuid) TO eye_commit;

CREATE OR REPLACE FUNCTION prediction.sponsor_opportunity(p_exposure uuid, p_tenant uuid, p_domain uuid, p_version int, p_digest text, p_terms jsonb, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, graph, executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE x prediction.exposure_current%ROWTYPE; v prediction.exposure_versions%ROWTYPE; k text; e jsonb; v_terms jsonb; v_holds jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.exposure.sponsor']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'exposure sponsorship rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF NOT executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['opportunity_sponsor']) THEN
    RAISE EXCEPTION 'exposure sponsorship rejected: an opportunity is sponsored by a named, active opportunity sponsor — never by an agent' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO x FROM prediction.exposure_current e2 WHERE e2.exposure_id = p_exposure AND e2.tenant_id = p_tenant AND e2.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'exposure sponsorship rejected: no such exposure % in this domain', p_exposure USING ERRCODE = '23503'; END IF;
  IF x.polarity <> 'opportunity' THEN RAISE EXCEPTION 'exposure sponsorship rejected: % is a risk; a risk is accepted by its owner, not sponsored', p_exposure USING ERRCODE = '22023'; END IF;
  IF x.state = 'closed' THEN RAISE EXCEPTION 'exposure sponsorship rejected (closed): exposure % was closed at %', p_exposure, x.closed_at USING ERRCODE = '22023'; END IF;
  IF x.sponsor_principal_id IS NOT NULL THEN RAISE EXCEPTION 'exposure sponsorship rejected (already_sponsored): exposure % was sponsored at % by %', p_exposure, x.sponsored_at, x.sponsor_principal_id USING ERRCODE = '22023'; END IF;
  SELECT * INTO v FROM prediction.exposure_versions w WHERE w.exposure_id = p_exposure AND w.version = p_version;
  IF NOT FOUND THEN RAISE EXCEPTION 'exposure sponsorship rejected: no such version % of exposure %', p_version, p_exposure USING ERRCODE = '23503'; END IF;
  IF p_digest IS DISTINCT FROM v.digest THEN RAISE EXCEPTION 'exposure sponsorship rejected (stale_digest): the digest sponsored is not version %''s (%…)', p_version, left(v.digest, 12) USING ERRCODE = '22023'; END IF;
  IF v.state IN ('superseded', 'contested') THEN RAISE EXCEPTION 'exposure sponsorship rejected (state): version % is %; a superseded or contested value range is not sponsored', p_version, v.state USING ERRCODE = '22023'; END IF;
  IF v.assessed_kind = 'agent' AND v.state <> 'accepted' THEN
    RAISE EXCEPTION 'exposure sponsorship rejected (agent_estimate): version % is the Opportunity Agent''s unaccepted estimate — a sponsor sponsors a human''s assessment or an accepted one', p_version USING ERRCODE = '22023';
  END IF;
  -- B34 (0090): a HELD opportunity (an invalidated dependency) is not sponsored. A TIME-EXPIRED one is DETECTED (exposure_detections),
  -- not refused here: the sponsor sees the detection and decides (a lapsed window is often the question the evaluation answers).
  v_holds := prediction.exposure_holds(p_exposure);
  IF jsonb_array_length(v_holds) > 0 THEN
    RAISE EXCEPTION 'exposure sponsorship rejected (state): exposure % is HELD — it rests on % (%)', p_exposure, v_holds -> 0 ->> 'dependency', v_holds -> 0 ->> 'reason' USING ERRCODE = '22023';
  END IF;
  IF p_terms IS NULL OR jsonb_typeof(p_terms) <> 'object' THEN RAISE EXCEPTION 'exposure sponsorship rejected: the terms are {option_key, rationale, conditions, budget?, objective_id?}' USING ERRCODE = '22023'; END IF;
  FOR k IN SELECT jsonb_object_keys(p_terms) LOOP
    IF k NOT IN ('option_key', 'rationale', 'conditions', 'budget', 'objective_id') THEN RAISE EXCEPTION 'exposure sponsorship rejected: the terms carry the unknown key %', k USING ERRCODE = '22023'; END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v.options) o WHERE o ->> 'key' = p_terms ->> 'option_key') THEN
    RAISE EXCEPTION 'exposure sponsorship rejected: the option % is not one of version %''s options', coalesce(p_terms ->> 'option_key', '<none>'), p_version USING ERRCODE = '22023';
  END IF;
  IF length(btrim(coalesce(p_terms ->> 'rationale', ''))) < 8 THEN RAISE EXCEPTION 'exposure sponsorship rejected: a sponsorship states its rationale (8+ characters)' USING ERRCODE = '22023'; END IF;
  IF jsonb_typeof(p_terms -> 'conditions') <> 'array' OR jsonb_array_length(p_terms -> 'conditions') NOT BETWEEN 1 AND 20 THEN
    RAISE EXCEPTION 'exposure sponsorship rejected: a sponsorship states its conditions (1..20 lines)' USING ERRCODE = '22023';
  END IF;
  FOR e IN SELECT value FROM jsonb_array_elements(p_terms -> 'conditions') LOOP
    IF jsonb_typeof(e) <> 'string' OR length(btrim(e #>> '{}')) < 4 THEN RAISE EXCEPTION 'exposure sponsorship rejected: each condition is a line of 4+ characters' USING ERRCODE = '22023'; END IF;
  END LOOP;
  IF p_terms ? 'budget' AND jsonb_typeof(p_terms -> 'budget') <> 'null'
     AND (jsonb_typeof(p_terms -> 'budget') <> 'object' OR jsonb_typeof(p_terms #> '{budget,amount}') <> 'number' OR (p_terms #>> '{budget,amount}')::numeric < 0 OR length(btrim(coalesce(p_terms #>> '{budget,unit}', ''))) NOT BETWEEN 1 AND 32) THEN
    RAISE EXCEPTION 'exposure sponsorship rejected: the budget is {amount ≥ 0, unit}' USING ERRCODE = '22023';
  END IF;
  IF p_terms ? 'objective_id' AND jsonb_typeof(p_terms -> 'objective_id') <> 'null' THEN
    IF coalesce(p_terms ->> 'objective_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       OR NOT EXISTS (SELECT 1 FROM graph.strategy_current s WHERE s.strategy_object_id = (p_terms ->> 'objective_id')::uuid AND s.tenant_id = p_tenant AND s.domain_id = p_domain AND s.object_type = 'OBJ') THEN
      RAISE EXCEPTION 'exposure sponsorship rejected: no such objective % in this domain', p_terms ->> 'objective_id' USING ERRCODE = '23503';
    END IF;
  END IF;
  v_terms := p_terms || jsonb_build_object('version', p_version, 'digest', v.digest, 'value', jsonb_build_object('low', v.impact_low, 'high', v.impact_high, 'unit', v.unit));
  UPDATE prediction.exposure_current SET sponsor_principal_id = p_actor, sponsored_version = p_version, sponsorship = v_terms, sponsored_at = clock_timestamp(), state = 'sponsored', updated_at = clock_timestamp()
   WHERE exposure_id = p_exposure;
  PERFORM prediction.exposure_event(p_exposure, p_tenant, p_domain, 'exposure.sponsored', p_actor, v_terms, p_correlation);
  RETURN jsonb_build_object('exposure_id', p_exposure, 'sponsor', p_actor, 'version', p_version, 'digest', v.digest, 'terms', v_terms, 'state', 'sponsored', 'evaluation_owed', true,
                            -- B34 (0090): the signature — the exact digest and the named signer
                            'signature', jsonb_build_object('digest', v.digest, 'signer', p_actor, 'signer_name', (SELECT p.display_name FROM identity.principals p WHERE p.id = p_actor), 'act', 'sponsor'));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.sponsor_opportunity(uuid,uuid,uuid,int,text,jsonb,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.sponsor_opportunity(uuid,uuid,uuid,int,text,jsonb,uuid,uuid) TO eye_commit;

-- ════════════════════════════════════════════════════════════════════════════
-- §X8 PORTFOLIO CONCENTRATION (a read): the share of the accepted, open exposures' residual (the conservative end, residual_high) that one
-- CATEGORY or one DRIVER (an entity, claim or edge several exposures rest on) carries — within polarity and unit (EUR is never summed with
-- days); `concentrated` when one category or driver carries half or more of it across two or more exposures. Transparent: the sums, the
-- counts and the rule are in the answer; nothing is scored.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION prediction.exposure_concentration(p_tenant uuid, p_domain uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = prediction, pg_catalog, pg_temp AS $$
  WITH latest AS (
    SELECT DISTINCT ON (r.exposure_id) r.exposure_id, r.residual_high, r.unit
      FROM prediction.exposure_residuals r JOIN prediction.exposure_current x ON x.exposure_id = r.exposure_id
     WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.state <> 'closed' AND x.accepted_version IS NOT NULL
     ORDER BY r.exposure_id, r.computed_at DESC, r.residual_id DESC),
  base AS (SELECT l.exposure_id, l.residual_high, l.unit, x.polarity, x.category_key FROM latest l JOIN prediction.exposure_current x ON x.exposure_id = l.exposure_id),
  tot AS (SELECT polarity, unit, sum(residual_high) AS total, count(*) AS n FROM base GROUP BY polarity, unit),
  parts AS (
    SELECT b.polarity, b.unit, 'category'::text AS dimension, b.category_key AS key, NULL::text AS driver_kind, sum(b.residual_high) AS part, count(*) AS members,
           jsonb_agg(b.exposure_id ORDER BY b.exposure_id) AS exposures
      FROM base b GROUP BY b.polarity, b.unit, b.category_key
    UNION ALL
    SELECT b.polarity, b.unit, 'driver', d.driver_id::text, d.driver_kind, sum(b.residual_high), count(*), jsonb_agg(b.exposure_id ORDER BY b.exposure_id)
      FROM base b JOIN prediction.exposure_drivers d ON d.exposure_id = b.exposure_id AND d.driver_kind IN ('entity', 'claim', 'edge')
     GROUP BY b.polarity, b.unit, d.driver_id, d.driver_kind)
  SELECT coalesce(jsonb_agg(jsonb_build_object('polarity', p.polarity, 'unit', p.unit, 'dimension', p.dimension, 'key', p.key, 'driver_kind', p.driver_kind,
                                               'part', p.part, 'total', t.total, 'members', p.members, 'of', t.n, 'exposures', p.exposures,
                                               'share', round(p.part / t.total, 4), 'concentrated', p.part / t.total >= 0.5 AND p.members >= 2,
                                               'rule', 'share = the part''s residual high / the total residual high of the accepted, open exposures of this polarity and unit; concentrated at ≥ 0.5 over ≥ 2 exposures')
                            ORDER BY p.polarity, p.unit, p.part / t.total DESC, p.dimension, p.key), '[]'::jsonb)
    FROM parts p JOIN tot t ON t.polarity = p.polarity AND t.unit = p.unit
   WHERE t.total > 0
$$;
GRANT EXECUTE ON FUNCTION prediction.exposure_concentration(uuid, uuid) TO eye_app, eye_commit;

-- ════════════════════════════════════════════════════════════════════════════
-- §X9 THE FURTHER DIMENSIONS — exposure_add_version re-declared WHOLE from 0089:1347 (the only declaration before this one): the keys
-- persistence, option_value, information_value, likelihood (a DISTRIBUTION: its shape and parameters beside the bracket, consistent with
-- it), indicators, second_order, trade_off (mitigation versus capture), and each option's CLASS (no_regret | reversible | contingent —
-- with its trigger — | irreversible). All optional (an assessment of B32's shape is admitted unchanged); all inside the version's digest.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION prediction.exposure_add_version(p_exposure uuid, p_tenant uuid, p_domain uuid, p_a jsonb, p_kind text, p_run uuid, p_rule text, p_based_on int,
                                                          p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, objects, pg_catalog, pg_temp AS $$
DECLARE x prediction.exposure_current%ROWTYPE; v_n int; e jsonb; k text; v_digest text; v_keys text[] := '{}'; v_shape text; v_lp jsonb; v_req text[]; v_ik text[] := '{}';
        v_pl numeric; v_ph numeric; v_il numeric; v_ih numeric;
BEGIN
  SELECT * INTO x FROM prediction.exposure_current WHERE exposure_id = p_exposure FOR UPDATE;
  IF p_a IS NULL OR jsonb_typeof(p_a) <> 'object' THEN RAISE EXCEPTION 'exposure assessment rejected: the assessment is an object' USING ERRCODE = '22023'; END IF;
  FOR k IN SELECT jsonb_object_keys(p_a) LOOP
    IF k NOT IN ('mechanism', 'probability', 'plausibility', 'impact', 'horizon', 'response_window_hours', 'velocity', 'reversibility', 'controllability', 'options', 'evidence', 'confidence', 'basis',
                 /* B34 (0090) */ 'persistence', 'option_value', 'information_value', 'likelihood', 'indicators', 'second_order', 'trade_off') THEN
      RAISE EXCEPTION 'exposure assessment rejected: the assessment carries the unknown key %', k USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF length(btrim(coalesce(p_a ->> 'mechanism', ''))) NOT BETWEEN 8 AND 4096 THEN RAISE EXCEPTION 'exposure assessment rejected: the mechanism is stated (8..4096 characters) — how the change becomes a loss or a gain' USING ERRCODE = '22023'; END IF;
  IF jsonb_typeof(p_a -> 'probability') = 'object' THEN
    IF jsonb_typeof(p_a #> '{probability,low}') <> 'number' OR jsonb_typeof(p_a #> '{probability,high}') <> 'number' THEN RAISE EXCEPTION 'exposure assessment rejected: the probability is a bracket {low, high} in [0, 1]' USING ERRCODE = '22023'; END IF;
    v_pl := (p_a #>> '{probability,low}')::numeric; v_ph := (p_a #>> '{probability,high}')::numeric;
    IF v_pl < 0 OR v_ph > 1 OR v_pl > v_ph THEN RAISE EXCEPTION 'exposure assessment rejected: the probability is a bracket {low, high} in [0, 1] with low ≤ high' USING ERRCODE = '22023'; END IF;
  ELSIF p_a ? 'probability' AND jsonb_typeof(p_a -> 'probability') <> 'null' THEN
    RAISE EXCEPTION 'exposure assessment rejected: the probability is a bracket {low, high} in [0, 1] (a point estimate is false precision — state a bracket)' USING ERRCODE = '22023';
  END IF;
  IF p_a ? 'plausibility' AND jsonb_typeof(p_a -> 'plausibility') <> 'null' AND coalesce(p_a ->> 'plausibility', '') NOT IN ('low', 'medium', 'high') THEN
    RAISE EXCEPTION 'exposure assessment rejected: plausibility is low, medium or high' USING ERRCODE = '22023';
  END IF;
  IF v_pl IS NULL AND coalesce(p_a ->> 'plausibility', '') NOT IN ('low', 'medium', 'high') THEN
    RAISE EXCEPTION 'exposure assessment rejected: a probability bracket or a plausibility is stated — the likelihood is never left out' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_a -> 'impact') <> 'object' OR jsonb_typeof(p_a #> '{impact,low}') <> 'number' OR jsonb_typeof(p_a #> '{impact,high}') <> 'number'
     OR length(btrim(coalesce(p_a #>> '{impact,unit}', ''))) NOT BETWEEN 1 AND 32 THEN
    RAISE EXCEPTION 'exposure assessment rejected: the impact (a risk''s consequence, an opportunity''s value) is a range {low, high, unit}' USING ERRCODE = '22023';
  END IF;
  v_il := (p_a #>> '{impact,low}')::numeric; v_ih := (p_a #>> '{impact,high}')::numeric;
  IF v_il < 0 OR v_il > v_ih THEN RAISE EXCEPTION 'exposure assessment rejected: the impact range has 0 ≤ low ≤ high' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_a ->> 'horizon', ''))) NOT BETWEEN 1 AND 64 THEN RAISE EXCEPTION 'exposure assessment rejected: the horizon is stated (1..64 characters)' USING ERRCODE = '22023'; END IF;
  IF p_a ? 'response_window_hours' AND jsonb_typeof(p_a -> 'response_window_hours') <> 'null'
     AND (jsonb_typeof(p_a -> 'response_window_hours') <> 'number' OR (p_a ->> 'response_window_hours')::numeric NOT BETWEEN 1 AND 8760 OR (p_a ->> 'response_window_hours')::numeric <> floor((p_a ->> 'response_window_hours')::numeric)) THEN
    RAISE EXCEPTION 'exposure assessment rejected: the response window is a whole number of hours in [1, 8760]' USING ERRCODE = '22023';
  END IF;
  IF p_a ? 'velocity' AND jsonb_typeof(p_a -> 'velocity') <> 'null' AND coalesce(p_a ->> 'velocity', '') NOT IN ('days', 'weeks', 'months', 'years') THEN RAISE EXCEPTION 'exposure assessment rejected: velocity is days, weeks, months or years' USING ERRCODE = '22023'; END IF;
  IF p_a ? 'reversibility' AND jsonb_typeof(p_a -> 'reversibility') <> 'null' AND coalesce(p_a ->> 'reversibility', '') NOT IN ('reversible', 'partly_reversible', 'irreversible') THEN RAISE EXCEPTION 'exposure assessment rejected: reversibility is reversible, partly_reversible or irreversible' USING ERRCODE = '22023'; END IF;
  IF p_a ? 'controllability' AND jsonb_typeof(p_a -> 'controllability') <> 'null' AND coalesce(p_a ->> 'controllability', '') NOT IN ('high', 'medium', 'low') THEN RAISE EXCEPTION 'exposure assessment rejected: controllability is high, medium or low' USING ERRCODE = '22023'; END IF;
  IF p_a ? 'confidence' AND jsonb_typeof(p_a -> 'confidence') <> 'null' AND (jsonb_typeof(p_a -> 'confidence') <> 'number' OR (p_a ->> 'confidence')::numeric NOT BETWEEN 0 AND 1) THEN RAISE EXCEPTION 'exposure assessment rejected: confidence is in [0, 1]' USING ERRCODE = '22023'; END IF;
  IF p_a ? 'options' AND (jsonb_typeof(p_a -> 'options') <> 'array' OR jsonb_array_length(p_a -> 'options') > 20) THEN RAISE EXCEPTION 'exposure assessment rejected: options is a list of at most 20 {key, label, kind, cost?}' USING ERRCODE = '22023'; END IF;
  FOR e IN SELECT value FROM jsonb_array_elements(coalesce(p_a -> 'options', '[]'::jsonb)) LOOP
    IF jsonb_typeof(e) <> 'object' OR coalesce(e ->> 'key', '') !~ '^[a-z][a-z0-9_-]{0,63}$' OR length(btrim(coalesce(e ->> 'label', ''))) NOT BETWEEN 2 AND 256
       OR coalesce(e ->> 'kind', '') NOT IN ('mitigate', 'exploit', 'accept', 'transfer', 'avoid', 'defer')
       OR (e ? 'cost' AND jsonb_typeof(e -> 'cost') NOT IN ('number', 'null'))
       -- B34 (0090): the option's CLASS (no_regret | reversible | contingent | irreversible); a contingent option names its trigger
       OR (e ? 'class' AND coalesce(e ->> 'class', '') NOT IN ('no_regret', 'reversible', 'contingent', 'irreversible'))
       OR (e ->> 'class' = 'contingent' AND length(btrim(coalesce(e ->> 'trigger', ''))) NOT BETWEEN 4 AND 512) THEN
      RAISE EXCEPTION 'exposure assessment rejected: each option is {key: [a-z][a-z0-9_-]*, label, kind: mitigate|exploit|accept|transfer|avoid|defer, cost?: number, class?: no_regret|reversible|contingent|irreversible, trigger (a contingent option''s, 4..512)}' USING ERRCODE = '22023';
    END IF;
    IF (e ->> 'key') = ANY (v_keys) THEN RAISE EXCEPTION 'exposure assessment rejected: the option key % is named twice', e ->> 'key' USING ERRCODE = '22023'; END IF;
    v_keys := v_keys || (e ->> 'key');
  END LOOP;
  IF p_a ? 'evidence' AND (jsonb_typeof(p_a -> 'evidence') <> 'array' OR jsonb_array_length(p_a -> 'evidence') > 50) THEN RAISE EXCEPTION 'exposure assessment rejected: evidence is a list of at most 50 {object_id, version?}' USING ERRCODE = '22023'; END IF;
  FOR e IN SELECT value FROM jsonb_array_elements(coalesce(p_a -> 'evidence', '[]'::jsonb)) LOOP
    IF jsonb_typeof(e) <> 'object' OR coalesce(e ->> 'object_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' OR (e ? 'version' AND jsonb_typeof(e -> 'version') <> 'number') THEN
      RAISE EXCEPTION 'exposure assessment rejected: each evidence item is {object_id: uuid, version?: number}' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM objects.canonical_objects o WHERE o.object_id = (e ->> 'object_id')::uuid AND o.tenant_id = p_tenant AND o.domain_id = p_domain
                     AND (NOT (e ? 'version') OR o.object_version = (e ->> 'version')::bigint)) THEN
      RAISE EXCEPTION 'exposure assessment rejected: no such evidence object % in this domain', e ->> 'object_id' USING ERRCODE = '23503';
    END IF;
  END LOOP;
  -- B34 (0090): THE FURTHER ASSESSED DIMENSIONS (F-P4-13's remainder; AI-52-002) — each optional, each checked, each inside the digest.
  IF p_a ? 'persistence' AND jsonb_typeof(p_a -> 'persistence') <> 'null' AND coalesce(p_a ->> 'persistence', '') NOT IN ('transient', 'persistent', 'structural') THEN
    RAISE EXCEPTION 'exposure assessment rejected: persistence is transient, persistent or structural' USING ERRCODE = '22023';
  END IF;
  FOREACH k IN ARRAY ARRAY['option_value', 'information_value'] LOOP
    IF p_a ? k AND jsonb_typeof(p_a -> k) <> 'null'
       AND (jsonb_typeof(p_a -> k) <> 'object' OR jsonb_typeof(p_a #> ARRAY[k, 'low']) <> 'number' OR jsonb_typeof(p_a #> ARRAY[k, 'high']) <> 'number'
            OR (p_a #>> ARRAY[k, 'low'])::numeric < 0 OR (p_a #>> ARRAY[k, 'low'])::numeric > (p_a #>> ARRAY[k, 'high'])::numeric
            OR length(btrim(coalesce(p_a #>> ARRAY[k, 'unit'], ''))) NOT BETWEEN 1 AND 32) THEN
      RAISE EXCEPTION 'exposure assessment rejected: % is a range {low, high, unit} with 0 ≤ low ≤ high — never a single number', k USING ERRCODE = '22023';
    END IF;
  END LOOP;
  -- THE LIKELIHOOD AS A DISTRIBUTION: a declared shape and its parameters BESIDE the bracket (the bracket stays the accepted statement)
  IF p_a ? 'likelihood' AND jsonb_typeof(p_a -> 'likelihood') <> 'null' THEN
    IF v_pl IS NULL THEN RAISE EXCEPTION 'exposure assessment rejected: a likelihood distribution is declared beside a probability bracket — state the bracket' USING ERRCODE = '22023'; END IF;
    v_shape := p_a #>> '{likelihood,shape}'; v_lp := p_a #> '{likelihood,params}';
    IF jsonb_typeof(p_a -> 'likelihood') <> 'object' OR coalesce(v_shape, '') NOT IN ('uniform', 'triangular', 'pert', 'beta', 'normal') OR jsonb_typeof(v_lp) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'exposure assessment rejected: the likelihood is {shape: uniform|triangular|pert|beta|normal, params}' USING ERRCODE = '22023';
    END IF;
    v_req := CASE v_shape WHEN 'uniform' THEN ARRAY['max', 'min'] WHEN 'beta' THEN ARRAY['alpha', 'beta'] WHEN 'normal' THEN ARRAY['mean', 'sd'] ELSE ARRAY['max', 'min', 'mode'] END;
    IF (SELECT array_agg(q ORDER BY q) FROM jsonb_object_keys(v_lp) q) IS DISTINCT FROM v_req
       OR EXISTS (SELECT 1 FROM jsonb_each(v_lp) q WHERE jsonb_typeof(q.value) <> 'number') THEN
      RAISE EXCEPTION 'exposure assessment rejected: a % likelihood states exactly the numbers %', v_shape, array_to_string(v_req, ', ') USING ERRCODE = '22023';
    END IF;
    IF (v_shape IN ('uniform', 'triangular', 'pert')
        AND NOT ((v_lp ->> 'min')::numeric >= 0 AND (v_lp ->> 'max')::numeric <= 1 AND (v_lp ->> 'min')::numeric <= v_pl AND v_ph <= (v_lp ->> 'max')::numeric
                 AND (v_shape = 'uniform' OR ((v_lp ->> 'min')::numeric <= (v_lp ->> 'mode')::numeric AND (v_lp ->> 'mode')::numeric <= (v_lp ->> 'max')::numeric))))
       OR (v_shape = 'beta' AND NOT ((v_lp ->> 'alpha')::numeric > 0 AND (v_lp ->> 'beta')::numeric > 0))
       OR (v_shape = 'normal' AND NOT ((v_lp ->> 'sd')::numeric > 0 AND (v_lp ->> 'mean')::numeric BETWEEN v_pl AND v_ph)) THEN
      RAISE EXCEPTION 'exposure assessment rejected: the % likelihood contradicts the bracket [%, %] (support in [0, 1] containing the bracket; min ≤ mode ≤ max; alpha, beta, sd > 0; the mean inside the bracket)', v_shape, v_pl, v_ph USING ERRCODE = '22023';
    END IF;
  END IF;
  -- THE INDICATORS watching the exposure: {key, label, signal, threshold?, direction?: rising|falling}
  IF p_a ? 'indicators' AND (jsonb_typeof(p_a -> 'indicators') <> 'array' OR jsonb_array_length(p_a -> 'indicators') > 20) THEN
    RAISE EXCEPTION 'exposure assessment rejected: indicators is a list of at most 20 {key, label, signal, threshold?, direction?}' USING ERRCODE = '22023';
  END IF;
  FOR e IN SELECT value FROM jsonb_array_elements(coalesce(p_a -> 'indicators', '[]'::jsonb)) LOOP
    IF jsonb_typeof(e) <> 'object' OR coalesce(e ->> 'key', '') !~ '^[a-z][a-z0-9_-]{0,63}$' OR length(btrim(coalesce(e ->> 'label', ''))) NOT BETWEEN 2 AND 256
       OR length(btrim(coalesce(e ->> 'signal', ''))) NOT BETWEEN 4 AND 512 OR (e ? 'threshold' AND jsonb_typeof(e -> 'threshold') NOT IN ('number', 'null'))
       OR (e ? 'direction' AND coalesce(e ->> 'direction', '') NOT IN ('rising', 'falling')) THEN
      RAISE EXCEPTION 'exposure assessment rejected: each indicator is {key: [a-z][a-z0-9_-]*, label, signal (what is watched, 4..512), threshold?: number, direction?: rising|falling}' USING ERRCODE = '22023';
    END IF;
    IF (e ->> 'key') = ANY (v_ik) THEN RAISE EXCEPTION 'exposure assessment rejected: the indicator key % is named twice', e ->> 'key' USING ERRCODE = '22023'; END IF;
    v_ik := v_ik || (e ->> 'key');
  END LOOP;
  -- SECOND-ORDER EFFECTS: {effect, sign: amplifies|dampens|creates, on_exposure?: another exposure of this domain}
  IF p_a ? 'second_order' AND (jsonb_typeof(p_a -> 'second_order') <> 'array' OR jsonb_array_length(p_a -> 'second_order') > 20) THEN
    RAISE EXCEPTION 'exposure assessment rejected: second_order is a list of at most 20 {effect, sign, on_exposure?}' USING ERRCODE = '22023';
  END IF;
  FOR e IN SELECT value FROM jsonb_array_elements(coalesce(p_a -> 'second_order', '[]'::jsonb)) LOOP
    IF jsonb_typeof(e) <> 'object' OR length(btrim(coalesce(e ->> 'effect', ''))) NOT BETWEEN 8 AND 1024 OR coalesce(e ->> 'sign', '') NOT IN ('amplifies', 'dampens', 'creates')
       OR (e ? 'on_exposure' AND jsonb_typeof(e -> 'on_exposure') <> 'null' AND coalesce(e ->> 'on_exposure', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') THEN
      RAISE EXCEPTION 'exposure assessment rejected: each second-order effect is {effect (8..1024), sign: amplifies|dampens|creates, on_exposure?: uuid}' USING ERRCODE = '22023';
    END IF;
    IF e ? 'on_exposure' AND jsonb_typeof(e -> 'on_exposure') <> 'null'
       AND ((e ->> 'on_exposure')::uuid = p_exposure
            OR NOT EXISTS (SELECT 1 FROM prediction.exposure_current o WHERE o.exposure_id = (e ->> 'on_exposure')::uuid AND o.tenant_id = p_tenant AND o.domain_id = p_domain)) THEN
      RAISE EXCEPTION 'exposure assessment rejected: no such exposure % in this domain (a second-order effect names another exposure)', e ->> 'on_exposure' USING ERRCODE = '23503';
    END IF;
  END LOOP;
  -- THE MITIGATION-VERSUS-CAPTURE TRADE-OFF: {statement, favours: mitigation|capture|balanced, mitigation_cost?, capture_value?, unit?}
  IF p_a ? 'trade_off' AND jsonb_typeof(p_a -> 'trade_off') <> 'null'
     AND (jsonb_typeof(p_a -> 'trade_off') <> 'object' OR length(btrim(coalesce(p_a #>> '{trade_off,statement}', ''))) NOT BETWEEN 8 AND 2000
          OR coalesce(p_a #>> '{trade_off,favours}', '') NOT IN ('mitigation', 'capture', 'balanced')
          OR ((p_a -> 'trade_off') ? 'mitigation_cost' AND jsonb_typeof(p_a #> '{trade_off,mitigation_cost}') <> 'number')
          OR ((p_a -> 'trade_off') ? 'capture_value' AND jsonb_typeof(p_a #> '{trade_off,capture_value}') <> 'number')
          OR (((p_a -> 'trade_off') ? 'mitigation_cost' OR (p_a -> 'trade_off') ? 'capture_value') AND length(btrim(coalesce(p_a #>> '{trade_off,unit}', ''))) NOT BETWEEN 1 AND 32)) THEN
    RAISE EXCEPTION 'exposure assessment rejected: the trade-off is {statement (8..2000), favours: mitigation|capture|balanced, mitigation_cost?, capture_value?, unit (with a number)}' USING ERRCODE = '22023';
  END IF;
  v_n := x.current_version + 1;
  v_digest := encode(sha256(convert_to(jsonb_build_object('exposure_id', p_exposure, 'version', v_n, 'assessment', p_a, 'assessed_kind', p_kind)::text, 'UTF8')), 'hex');
  INSERT INTO prediction.exposure_versions (exposure_id, version, scope, tenant_id, domain_id, mechanism, probability_low, probability_high, plausibility, impact_low, impact_high, unit, horizon,
                                            response_window_hours, velocity, reversibility, controllability, options, evidence, confidence, basis, assessment, digest, assessed_by, assessed_kind,
                                            agent_run_id, estimate_rule, based_on_version, correlation_id)
  VALUES (p_exposure, v_n, 'DOMAIN', p_tenant, p_domain, btrim(p_a ->> 'mechanism'), v_pl, v_ph, NULLIF(p_a ->> 'plausibility', ''), v_il, v_ih, btrim(p_a #>> '{impact,unit}'), btrim(p_a ->> 'horizon'),
          (p_a ->> 'response_window_hours')::int, p_a ->> 'velocity', p_a ->> 'reversibility', p_a ->> 'controllability', coalesce(p_a -> 'options', '[]'::jsonb), coalesce(p_a -> 'evidence', '[]'::jsonb),
          (p_a ->> 'confidence')::numeric, p_a ->> 'basis', p_a, v_digest, p_actor, p_kind, p_run, p_rule, p_based_on, p_correlation);
  UPDATE prediction.exposure_current SET current_version = v_n, state = CASE WHEN state = 'identified' THEN 'assessed' ELSE state END, updated_at = clock_timestamp() WHERE exposure_id = p_exposure;
  PERFORM prediction.exposure_event(p_exposure, p_tenant, p_domain, CASE p_kind WHEN 'agent' THEN 'exposure.estimated' ELSE 'exposure.assessed' END, p_actor,
    jsonb_build_object('version', v_n, 'digest', v_digest, 'assessed_kind', p_kind, 'agent_run_id', p_run, 'estimate_rule', p_rule, 'based_on_version', p_based_on,
                       'competes_with_accepted', x.accepted_version IS NOT NULL), p_correlation);
  RETURN jsonb_build_object('exposure_id', p_exposure, 'version', v_n, 'digest', v_digest, 'state', 'proposed', 'assessed_kind', p_kind, 'competes_with_accepted', x.accepted_version);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.exposure_add_version(uuid,uuid,uuid,jsonb,text,uuid,text,int,uuid,uuid) FROM PUBLIC;


-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- section `gates`
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0090 §G — CP-6 B34 part G: HUMAN GATE COMPLETENESS (F-P6-04; V8 PR-39-001..006, OBJ-32/-35, FEX-16, PER-01, HX-09/-12/-13, ADR-003;
-- V3 L9-C07/L9-I03). Built on the §0 prelude (the states deferred / information_requested, the package event union, decision_class/board,
-- the human-task core). What this section declares:
--   §G1 the ledgers: approval_condition_evaluations, gate_actions, gate_overrides, approval_delegations, commit_previews, control_decisions;
--   §G2 the TYPED approval CONDITIONS (assumption_holds | indicator_state | claim_truth | warning_absent | date_before; stages commit |
--       monitor) — validated at approval, evaluated at commitment (decision.hold_check → commit.held, recorded BEFORE the commit is tried)
--       and in monitoring (evaluate_conditions → approval_condition.failed);
--   §G3 the gate's distinct acts (review, acknowledge, ready, defer, reject, request_information, resume — HX-12) with rationale and next
--       review (OBJ-35), the INDEPENDENT reviewer's decision-ready with the information package digest (OBJ-32), gate tasks through the
--       prelude's human-task core (deadlines fire in the workflow part's tick — not here);
--   §G4 OVERRIDE as a recorded object (normal: a decision_authority, conditions only; emergency: an executive, + a quorum shortfall and a
--       mandatory after-the-fact review task) — never by the committer for their own commitment, never on a board decision;
--   §G5 DELEGATION of approval authority with expiry, end and reassignment (never of a board decision's);
--   §G6 the reserved BOARD decision class (an executive reserves it on a draft);
--   §G7 the CONSEQUENCE PREVIEW (HX-13): the commit carries the preview digest (commit_package's signature gains p_preview_digest);
--   §G8 policy revisions and control decisions as VERSIONED objects, and the controls in force as of an instant (for the replay);
--   §G9 the re-declarations this part alone owns: versions_immutable, live_approvals, live_approvals_as_of, record_approval,
--       propose_version, withdraw_package, evaluate_conditions, commit_package.
-- NOT HERE (stated): the deadline FIRING and escalation of gate tasks (the workflow part's tick step 20); the commitments' tracker (its
-- AFTER INSERT trigger on decision.commitments — commit_package's insert keeps its shape); record_replay (the replay SERVICE adds the controls
-- in force beside the content, not inside it); any interface (the register stays 50/0/0); a route that VERIFIES an assumption (the graph has
-- none; the harness plants the verification as a fixture — see the report).

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §G1 THE LEDGERS
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
CREATE TABLE decision.approval_condition_evaluations (
  evaluation_id   uuid PRIMARY KEY,
  scope           text NOT NULL,
  tenant_id       uuid NOT NULL,
  domain_id       uuid NOT NULL,
  package_id      uuid NOT NULL,
  version         int  NOT NULL,
  approval_id     uuid NOT NULL REFERENCES decision.approvals (approval_id),
  condition_index int  NOT NULL CHECK (condition_index >= 0),
  condition       jsonb NOT NULL,
  stage           text NOT NULL CHECK (stage IN ('commit', 'monitor', 'preview')),
  holds           boolean NOT NULL,
  waived_by       uuid,
  observed        jsonb NOT NULL DEFAULT '{}'::jsonb,
  evaluated_by    uuid NOT NULL,
  evaluated_at    timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id  uuid NOT NULL,
  CONSTRAINT dace_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT dace_version FOREIGN KEY (package_id, version) REFERENCES decision.package_versions (package_id, version)
);
CREATE INDEX dace_version_idx ON decision.approval_condition_evaluations (package_id, version, stage, evaluated_at);
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON decision.approval_condition_evaluations FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

CREATE TABLE decision.gate_actions (
  action_id       uuid PRIMARY KEY,
  scope           text NOT NULL,
  tenant_id       uuid NOT NULL,
  domain_id       uuid NOT NULL,
  package_id      uuid NOT NULL,
  version         int  NOT NULL,
  action          text NOT NULL CHECK (action IN ('review', 'acknowledge', 'ready', 'defer', 'reject', 'request_information', 'resume')),
  actor_principal_id uuid NOT NULL,
  rationale       text NOT NULL CHECK (length(btrim(rationale)) BETWEEN 8 AND 4000),
  next_review_at  timestamptz,
  info_request    text,
  information_package_digest text CHECK (information_package_digest IS NULL OR information_package_digest ~ '^[0-9a-f]{64}$'),
  from_state      text NOT NULL,
  to_state        text NOT NULL,
  task_id         uuid,
  at              timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id  uuid NOT NULL,
  CONSTRAINT dga_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT dga_version FOREIGN KEY (package_id, version) REFERENCES decision.package_versions (package_id, version),
  CONSTRAINT dga_next_review CHECK ((action IN ('defer', 'request_information')) = (next_review_at IS NOT NULL)),
  CONSTRAINT dga_info CHECK ((action = 'request_information') = (info_request IS NOT NULL)),
  CONSTRAINT dga_ready CHECK ((action = 'ready') = (information_package_digest IS NOT NULL))
);
CREATE INDEX dga_version_idx ON decision.gate_actions (package_id, version, at);
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON decision.gate_actions FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

-- An override is a RECORD: who, which kind, why, what it waived, until when; an emergency override's after-the-fact review is written
-- once onto it (the only change the row admits).
CREATE TABLE decision.gate_overrides (
  override_id     uuid PRIMARY KEY,
  scope           text NOT NULL,
  tenant_id       uuid NOT NULL,
  domain_id       uuid NOT NULL,
  package_id      uuid NOT NULL,
  version         int  NOT NULL,
  version_digest  text NOT NULL CHECK (version_digest ~ '^[0-9a-f]{64}$'),
  kind            text NOT NULL CHECK (kind IN ('normal', 'emergency')),
  granted_by      uuid NOT NULL,
  rationale       text NOT NULL CHECK (length(btrim(rationale)) BETWEEN 20 AND 4000),
  waived_conditions jsonb NOT NULL CHECK (jsonb_typeof(waived_conditions) = 'array'),
  quorum_shortfall int NOT NULL DEFAULT 0 CHECK (quorum_shortfall >= 0),
  expires_at      timestamptz NOT NULL,
  review_task_id  uuid,
  review_due_at   timestamptz,
  reviewed_by     uuid,
  reviewed_at     timestamptz,
  review_outcome  text CHECK (review_outcome IS NULL OR review_outcome IN ('upheld', 'contested')),
  review_note     text,
  granted_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id  uuid NOT NULL,
  CONSTRAINT dgo_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT dgo_version FOREIGN KEY (package_id, version) REFERENCES decision.package_versions (package_id, version),
  CONSTRAINT dgo_normal_waives_only CHECK (kind = 'emergency' OR quorum_shortfall = 0),
  CONSTRAINT dgo_emergency_reviewed CHECK (kind = 'normal' OR (review_task_id IS NOT NULL AND review_due_at IS NOT NULL)),
  CONSTRAINT dgo_review_once CHECK ((reviewed_at IS NULL) = (reviewed_by IS NULL) AND (reviewed_at IS NULL) = (review_outcome IS NULL))
);
CREATE OR REPLACE FUNCTION decision.gate_overrides_review_only() RETURNS trigger
SET search_path = decision, pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'gate overrides are append-only: DELETE prohibited' USING ERRCODE = '2F002'; END IF;
  IF OLD.reviewed_at IS NOT NULL THEN RAISE EXCEPTION 'override % is reviewed and immutable', OLD.override_id USING ERRCODE = '2F002'; END IF;
  IF (NEW.override_id, NEW.tenant_id, NEW.domain_id, NEW.package_id, NEW.version, NEW.version_digest, NEW.kind, NEW.granted_by, NEW.rationale, NEW.waived_conditions,
      NEW.quorum_shortfall, NEW.expires_at, NEW.review_task_id, NEW.review_due_at, NEW.granted_at)
     IS DISTINCT FROM (OLD.override_id, OLD.tenant_id, OLD.domain_id, OLD.package_id, OLD.version, OLD.version_digest, OLD.kind, OLD.granted_by, OLD.rationale, OLD.waived_conditions,
      OLD.quorum_shortfall, OLD.expires_at, OLD.review_task_id, OLD.review_due_at, OLD.granted_at) OR NEW.reviewed_at IS NULL THEN
    RAISE EXCEPTION 'override % changes only by its after-the-fact review, once', OLD.override_id USING ERRCODE = '2F002';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER dgo_review_only BEFORE UPDATE OR DELETE ON decision.gate_overrides FOR EACH ROW EXECUTE FUNCTION decision.gate_overrides_review_only();

-- A delegation of ONE approver's authority on ONE package to a named member, until an expiry (≤ 30 days); it ends early by the delegator,
-- or is reassigned (a new delegation names the one it replaces). The only change a row admits is its end, once.
CREATE TABLE decision.approval_delegations (
  delegation_id   uuid PRIMARY KEY,
  scope           text NOT NULL,
  tenant_id       uuid NOT NULL,
  domain_id       uuid NOT NULL,
  package_id      uuid NOT NULL REFERENCES decision.packages_current (package_id),
  delegator_principal_id uuid NOT NULL,
  delegate_principal_id  uuid NOT NULL,
  reason          text NOT NULL CHECK (length(btrim(reason)) BETWEEN 8 AND 2000),
  starts_at       timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at      timestamptz NOT NULL,
  replaces        uuid REFERENCES decision.approval_delegations (delegation_id),
  task_id         uuid,
  ended_at        timestamptz,
  ended_by        uuid,
  ended_reason    text,
  created_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id  uuid NOT NULL,
  CONSTRAINT dad_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT dad_not_self CHECK (delegator_principal_id <> delegate_principal_id),
  CONSTRAINT dad_expiry CHECK (expires_at > starts_at AND expires_at <= starts_at + interval '30 days'),
  CONSTRAINT dad_end_once CHECK ((ended_at IS NULL) = (ended_by IS NULL) AND (ended_at IS NULL) = (ended_reason IS NULL))
);
CREATE OR REPLACE FUNCTION decision.approval_delegations_end_only() RETURNS trigger
SET search_path = decision, pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'approval delegations are append-only: DELETE prohibited' USING ERRCODE = '2F002'; END IF;
  IF OLD.ended_at IS NOT NULL THEN RAISE EXCEPTION 'delegation % has ended and is immutable', OLD.delegation_id USING ERRCODE = '2F002'; END IF;
  IF (NEW.delegation_id, NEW.tenant_id, NEW.domain_id, NEW.package_id, NEW.delegator_principal_id, NEW.delegate_principal_id, NEW.reason, NEW.starts_at, NEW.expires_at, NEW.replaces, NEW.task_id, NEW.created_at)
     IS DISTINCT FROM (OLD.delegation_id, OLD.tenant_id, OLD.domain_id, OLD.package_id, OLD.delegator_principal_id, OLD.delegate_principal_id, OLD.reason, OLD.starts_at, OLD.expires_at, OLD.replaces, OLD.task_id, OLD.created_at)
     OR NEW.ended_at IS NULL THEN
    RAISE EXCEPTION 'delegation % changes only by its end, once', OLD.delegation_id USING ERRCODE = '2F002';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER dad_end_only BEFORE UPDATE OR DELETE ON decision.approval_delegations FOR EACH ROW EXECUTE FUNCTION decision.approval_delegations_end_only();

CREATE TABLE decision.commit_previews (
  preview_id      uuid PRIMARY KEY,
  scope           text NOT NULL,
  tenant_id       uuid NOT NULL,
  domain_id       uuid NOT NULL,
  package_id      uuid NOT NULL,
  version         int  NOT NULL,
  version_digest  text NOT NULL CHECK (version_digest ~ '^[0-9a-f]{64}$'),
  preview_digest  text NOT NULL CHECK (preview_digest ~ '^[0-9a-f]{64}$'),
  preview         jsonb NOT NULL,
  previewed_by    uuid NOT NULL,
  previewed_at    timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id  uuid NOT NULL,
  CONSTRAINT dcp_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT dcp_version FOREIGN KEY (package_id, version) REFERENCES decision.package_versions (package_id, version)
);
CREATE INDEX dcp_lookup ON decision.commit_previews (package_id, version, preview_digest);
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON decision.commit_previews FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

-- Policy revisions and control decisions: VERSIONED (control_key, version), each superseding the one before; what was in force at an
-- instant is the latest version of each key recorded and effective by then.
CREATE TABLE decision.control_decisions (
  control_id      uuid PRIMARY KEY,
  scope           text NOT NULL,
  tenant_id       uuid NOT NULL,
  domain_id       uuid NOT NULL,
  kind            text NOT NULL CHECK (kind IN ('policy_revision', 'control_decision')),
  control_key     text NOT NULL CHECK (control_key ~ '^[a-z0-9][a-z0-9._-]{2,79}$'),
  version         int  NOT NULL CHECK (version >= 1),
  body            jsonb NOT NULL CHECK (jsonb_typeof(body) = 'object'),
  rationale       text NOT NULL CHECK (length(btrim(rationale)) BETWEEN 8 AND 4000),
  package_id      uuid REFERENCES decision.packages_current (package_id),
  supersedes      uuid REFERENCES decision.control_decisions (control_id),
  effective_from  timestamptz NOT NULL,
  recorded_by     uuid NOT NULL,
  recorded_at     timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id  uuid NOT NULL,
  CONSTRAINT dcd_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  UNIQUE (tenant_id, domain_id, control_key, version)
);
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON decision.control_decisions FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['approval_condition_evaluations', 'gate_actions', 'gate_overrides', 'approval_delegations', 'commit_previews', 'control_decisions'] LOOP
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

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §G2 THE TYPED APPROVAL CONDITIONS
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- A condition is {kind, ref, expected, label, stages}: assumption_holds (an ASU's verification is `expected`, default verified),
-- indicator_state (an indicator is `expected`: clear | breached, default clear), claim_truth (a CLM's latest truth state is `expected`),
-- warning_absent (no raised or acknowledged warning on the indicator, branch or forecast `ref`), date_before (the instant is before
-- `expected`). stages ⊆ {commit, monitor} (default both). A plain STRING stays what it was before B34: a note on the approval, never
-- evaluated.
CREATE OR REPLACE FUNCTION decision.approval_condition_kinds() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY['assumption_holds', 'indicator_state', 'claim_truth', 'warning_absent', 'date_before'] $$;
GRANT EXECUTE ON FUNCTION decision.approval_condition_kinds() TO eye_app, eye_commit;

CREATE OR REPLACE FUNCTION decision.validate_approval_conditions(p_tenant uuid, p_domain uuid, p_conditions jsonb) RETURNS jsonb
STABLE SECURITY DEFINER SET search_path = decision, graph, prediction, objects, pg_catalog, pg_temp AS $$
DECLARE c jsonb; v_out jsonb := '[]'::jsonb; v_kind text; v_ref text; v_exp text; v_stages jsonb; i int := 0;
BEGIN
  IF p_conditions IS NULL THEN RETURN '[]'::jsonb; END IF;
  IF jsonb_typeof(p_conditions) <> 'array' OR jsonb_array_length(p_conditions) > 20 THEN
    RAISE EXCEPTION 'approval rejected (conditions): conditions are a list of at most 20' USING ERRCODE = '22023';
  END IF;
  FOR c IN SELECT value FROM jsonb_array_elements(p_conditions) LOOP
    IF jsonb_typeof(c) = 'string' THEN v_out := v_out || jsonb_build_array(c); i := i + 1; CONTINUE; END IF;
    IF jsonb_typeof(c) <> 'object' THEN RAISE EXCEPTION 'approval rejected (conditions): condition % is neither a note nor a typed condition', i USING ERRCODE = '22023'; END IF;
    v_kind := c ->> 'kind'; v_ref := c ->> 'ref'; v_exp := c ->> 'expected';
    IF v_kind IS NULL OR NOT (v_kind = ANY (decision.approval_condition_kinds())) THEN
      RAISE EXCEPTION 'approval rejected (conditions): condition % kind % is not one of %', i, coalesce(v_kind, '<none>'), array_to_string(decision.approval_condition_kinds(), ' | ') USING ERRCODE = '22023';
    END IF;
    IF coalesce(length(btrim(c ->> 'label')), 0) < 4 THEN RAISE EXCEPTION 'approval rejected (conditions): condition % names its label in words (4+ characters)', i USING ERRCODE = '22023'; END IF;
    v_stages := coalesce(c -> 'stages', '["commit", "monitor"]'::jsonb);
    IF jsonb_typeof(v_stages) <> 'array' OR jsonb_array_length(v_stages) = 0
       OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_stages) s WHERE jsonb_typeof(s) <> 'string' OR (s #>> '{}') NOT IN ('commit', 'monitor')) THEN
      RAISE EXCEPTION 'approval rejected (conditions): condition % stages are a non-empty subset of commit, monitor', i USING ERRCODE = '22023';
    END IF;
    IF v_kind = 'date_before' THEN
      IF v_exp IS NULL OR v_exp !~ '^\d{4}-\d{2}-\d{2}' THEN RAISE EXCEPTION 'approval rejected (conditions): condition % (date_before) names the instant it must precede', i USING ERRCODE = '22023'; END IF;
      v_exp := to_char((v_exp::timestamptz) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
      v_ref := NULL;
    ELSE
      IF v_ref IS NULL OR v_ref !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        RAISE EXCEPTION 'approval rejected (conditions): condition % (%) names the id it is about', i, v_kind USING ERRCODE = '22023';
      END IF;
      IF v_kind = 'assumption_holds' THEN
        v_exp := coalesce(v_exp, 'verified');
        IF v_exp <> 'verified' THEN RAISE EXCEPTION 'approval rejected (conditions): condition % (assumption_holds) expects verified', i USING ERRCODE = '22023'; END IF;
        IF NOT EXISTS (SELECT 1 FROM graph.strategy_current s WHERE s.strategy_object_id = v_ref::uuid AND s.object_type = 'ASU' AND s.tenant_id = p_tenant AND s.domain_id = p_domain) THEN
          RAISE EXCEPTION 'approval rejected (condition_ref): condition % names no assumption of this domain (%)', i, v_ref USING ERRCODE = '23503';
        END IF;
      ELSIF v_kind = 'indicator_state' THEN
        v_exp := coalesce(v_exp, 'clear');
        IF v_exp NOT IN ('clear', 'breached') THEN RAISE EXCEPTION 'approval rejected (conditions): condition % (indicator_state) expects clear or breached', i USING ERRCODE = '22023'; END IF;
        IF NOT EXISTS (SELECT 1 FROM prediction.indicators_current x WHERE x.indicator_id = v_ref::uuid AND x.tenant_id = p_tenant AND x.domain_id = p_domain) THEN
          RAISE EXCEPTION 'approval rejected (condition_ref): condition % names no indicator of this domain (%)', i, v_ref USING ERRCODE = '23503';
        END IF;
      ELSIF v_kind = 'claim_truth' THEN
        IF v_exp IS NULL OR length(v_exp) < 3 THEN RAISE EXCEPTION 'approval rejected (conditions): condition % (claim_truth) names the truth state expected', i USING ERRCODE = '22023'; END IF;
        IF NOT EXISTS (SELECT 1 FROM objects.canonical_objects o WHERE o.object_id = v_ref::uuid AND o.object_type = 'CLM' AND o.tenant_id = p_tenant) THEN
          RAISE EXCEPTION 'approval rejected (condition_ref): condition % names no claim of this tenant (%)', i, v_ref USING ERRCODE = '23503';
        END IF;
      ELSIF v_kind = 'warning_absent' THEN
        v_exp := NULL;
        IF NOT EXISTS (SELECT 1 FROM prediction.indicators_current x WHERE x.indicator_id = v_ref::uuid AND x.tenant_id = p_tenant AND x.domain_id = p_domain)
           AND NOT EXISTS (SELECT 1 FROM prediction.branches_current b WHERE b.branch_id = v_ref::uuid AND b.tenant_id = p_tenant AND b.domain_id = p_domain)
           AND NOT EXISTS (SELECT 1 FROM prediction.forecasts_current f WHERE f.forecast_id = v_ref::uuid AND f.tenant_id = p_tenant AND f.domain_id = p_domain) THEN
          RAISE EXCEPTION 'approval rejected (condition_ref): condition % names no indicator, branch or forecast of this domain (%)', i, v_ref USING ERRCODE = '23503';
        END IF;
      END IF;
    END IF;
    v_out := v_out || jsonb_build_array(jsonb_build_object('kind', v_kind, 'ref', v_ref, 'expected', v_exp, 'label', btrim(c ->> 'label'), 'stages', v_stages));
    i := i + 1;
  END LOOP;
  RETURN v_out;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.validate_approval_conditions(uuid, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.validate_approval_conditions(uuid, uuid, jsonb) TO eye_app, eye_commit;

-- Whether one typed condition holds at an instant, with what was observed.
CREATE OR REPLACE FUNCTION decision.condition_holds(p_tenant uuid, p_domain uuid, c jsonb, p_at timestamptz) RETURNS jsonb
STABLE SECURITY DEFINER SET search_path = decision, graph, prediction, objects, pg_catalog, pg_temp AS $$
DECLARE v_kind text := c ->> 'kind'; v_ref uuid; v_obs text; v_n int;
BEGIN
  IF v_kind <> 'date_before' THEN v_ref := (c ->> 'ref')::uuid; END IF;
  IF v_kind = 'assumption_holds' THEN
    SELECT s.verification_state INTO v_obs FROM graph.strategy_current s WHERE s.strategy_object_id = v_ref AND s.tenant_id = p_tenant AND s.domain_id = p_domain;
    RETURN jsonb_build_object('holds', coalesce(v_obs, 'unknown') = coalesce(c ->> 'expected', 'verified'), 'observed', jsonb_build_object('verification_state', coalesce(v_obs, 'unknown')));
  ELSIF v_kind = 'indicator_state' THEN
    SELECT CASE WHEN x.breached THEN 'breached' ELSE 'clear' END INTO v_obs FROM prediction.indicators_current x WHERE x.indicator_id = v_ref AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
    RETURN jsonb_build_object('holds', coalesce(v_obs, 'unknown') = coalesce(c ->> 'expected', 'clear'), 'observed', jsonb_build_object('indicator_state', coalesce(v_obs, 'unknown')));
  ELSIF v_kind = 'claim_truth' THEN
    SELECT o.truth_state INTO v_obs FROM objects.canonical_objects o WHERE o.object_id = v_ref AND o.object_type = 'CLM' AND o.tenant_id = p_tenant ORDER BY o.object_version DESC LIMIT 1;
    RETURN jsonb_build_object('holds', coalesce(v_obs, 'unknown') = (c ->> 'expected'), 'observed', jsonb_build_object('truth_state', coalesce(v_obs, 'unknown')));
  ELSIF v_kind = 'warning_absent' THEN
    SELECT count(*) INTO v_n FROM prediction.warnings_current w WHERE w.tenant_id = p_tenant AND w.domain_id = p_domain AND w.state IN ('raised', 'acknowledged')
       AND (w.indicator_id = v_ref OR w.branch_id = v_ref OR w.forecast_id = v_ref) AND w.raised_at <= p_at;
    RETURN jsonb_build_object('holds', v_n = 0, 'observed', jsonb_build_object('open_warnings', v_n));
  ELSIF v_kind = 'date_before' THEN
    RETURN jsonb_build_object('holds', p_at < (c ->> 'expected')::timestamptz, 'observed', jsonb_build_object('at', p_at));
  END IF;
  RETURN jsonb_build_object('holds', false, 'observed', jsonb_build_object('reason', 'unknown condition kind'));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.condition_holds(uuid, uuid, jsonb, timestamptz) FROM PUBLIC;

-- The live approvals' typed conditions for a stage, each evaluated now; a condition a live override waives is marked so. Scoped to the
-- caller's own context. `failed` counts what neither holds nor is waived; `held` is failed > 0.
CREATE OR REPLACE FUNCTION decision.approval_conditions_status(p_tenant uuid, p_domain uuid, p_package_id uuid, p_version int, p_stage text) RETURNS jsonb
STABLE SECURITY DEFINER SET search_path = decision, pg_catalog, pg_temp AS $$
DECLARE r record; c record; v_list jsonb := '[]'::jsonb; v_failed int := 0; v_h jsonb; v_waiver uuid; v_stage text := CASE WHEN p_stage = 'preview' THEN 'commit' ELSE p_stage END;
BEGIN
  IF p_tenant IS DISTINCT FROM public.eye_tenant() OR NOT (public.eye_scope() = 'TENANT' OR p_domain = public.eye_domain()) THEN
    RAISE EXCEPTION 'approval conditions rejected: outside the caller''s scope' USING ERRCODE = '42501';
  END IF;
  -- before the commitment: the LIVE approvals; in monitoring: the approvals the commitment was made on (an approval's expiry after the
  -- commitment does not end what it conditioned)
  FOR r IN SELECT a.approval_id, a.approver_principal_id, a.conditions FROM decision.approvals a
            WHERE a.tenant_id = p_tenant AND a.domain_id = p_domain AND a.package_id = p_package_id AND a.version = p_version
              AND a.approval_id IN (SELECT la.approval_id FROM decision.live_approvals(p_package_id, p_version) la WHERE v_stage <> 'monitor'
                                    UNION SELECT (x ->> 'approval_id')::uuid FROM decision.commitments cm CROSS JOIN LATERAL jsonb_array_elements(cm.approvals) x
                                           WHERE v_stage = 'monitor' AND cm.package_id = p_package_id AND cm.version = p_version)
            ORDER BY a.recorded_at, a.approval_id LOOP
    FOR c IN SELECT value AS cond, (ordinality - 1)::int AS idx FROM jsonb_array_elements(r.conditions) WITH ORDINALITY LOOP
      CONTINUE WHEN jsonb_typeof(c.cond) <> 'object' OR NOT ((c.cond -> 'stages') ? v_stage);
      v_h := decision.condition_holds(p_tenant, p_domain, c.cond, clock_timestamp());
      v_waiver := NULL;
      SELECT o.override_id INTO v_waiver FROM decision.gate_overrides o
       WHERE o.package_id = p_package_id AND o.version = p_version AND o.expires_at > clock_timestamp()
         AND o.waived_conditions @> jsonb_build_array(jsonb_build_object('approval_id', r.approval_id, 'condition_index', c.idx))
       ORDER BY o.granted_at DESC LIMIT 1;
      IF NOT (v_h ->> 'holds')::boolean AND v_waiver IS NULL THEN v_failed := v_failed + 1; END IF;
      v_list := v_list || jsonb_build_array(jsonb_build_object('approval_id', r.approval_id, 'approver', r.approver_principal_id, 'condition_index', c.idx,
                  'kind', c.cond ->> 'kind', 'ref', c.cond ->> 'ref', 'expected', c.cond ->> 'expected', 'label', c.cond ->> 'label', 'stages', c.cond -> 'stages',
                  'holds', (v_h ->> 'holds')::boolean, 'observed', v_h -> 'observed', 'waived_by', v_waiver));
    END LOOP;
  END LOOP;
  RETURN jsonb_build_object('stage', p_stage, 'conditions', v_list, 'failed', v_failed, 'held', v_failed > 0, 'evaluated_at', clock_timestamp());
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.approval_conditions_status(uuid, uuid, uuid, int, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.approval_conditions_status(uuid, uuid, uuid, int, text) TO eye_app, eye_commit;

-- Every evaluation of a status written to the ledger (the hold, the commitment, the monitoring pass).
CREATE OR REPLACE FUNCTION decision._record_condition_evaluations(
  p_tenant uuid, p_domain uuid, p_package_id uuid, p_version int, p_stage text, p_status jsonb, p_actor uuid, p_correlation uuid
) RETURNS int
SECURITY DEFINER SET search_path = decision, pg_catalog, pg_temp AS $$
DECLARE e jsonb; n int := 0;
BEGIN
  FOR e IN SELECT value FROM jsonb_array_elements(coalesce(p_status -> 'conditions', '[]'::jsonb)) LOOP
    INSERT INTO decision.approval_condition_evaluations (evaluation_id, scope, tenant_id, domain_id, package_id, version, approval_id, condition_index, condition, stage, holds, waived_by, observed, evaluated_by, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_package_id, p_version, (e ->> 'approval_id')::uuid, (e ->> 'condition_index')::int,
            jsonb_build_object('kind', e ->> 'kind', 'ref', e ->> 'ref', 'expected', e ->> 'expected', 'label', e ->> 'label', 'stages', e -> 'stages'),
            p_stage, (e ->> 'holds')::boolean, nullif(e ->> 'waived_by', '')::uuid, coalesce(e -> 'observed', '{}'::jsonb), p_actor, p_correlation);
    n := n + 1;
  END LOOP;
  RETURN n;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision._record_condition_evaluations(uuid, uuid, uuid, int, text, jsonb, uuid, uuid) FROM PUBLIC;

-- THE HOLD, recorded BEFORE the commitment is attempted (a refusal that raises rolls back and leaves no record): the committing authority's
-- own port, under the same bound action. When a commit-stage condition fails, every commit-stage evaluation is written and `commit.held`
-- names the failed ones; the route answers 200 {commitment: null, held}. Nothing else moves; commit_package re-checks and refuses a direct call.
CREATE OR REPLACE FUNCTION decision.hold_check(
  p_tenant uuid, p_domain uuid, p_package_id uuid, p_version int, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE s jsonb; v_failed jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.commit']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'commitment rejected: a commitment is made by the acting principal, never on behalf of another' USING ERRCODE = '42501'; END IF;
  PERFORM 1 FROM decision.packages_current x WHERE x.package_id = p_package_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'commitment rejected: no such package in this domain' USING ERRCODE = '23503'; END IF;
  PERFORM 1 FROM decision.package_versions x WHERE x.package_id = p_package_id AND x.version = p_version;
  IF NOT FOUND THEN RAISE EXCEPTION 'commitment rejected: no such version' USING ERRCODE = '23503'; END IF;
  s := decision.approval_conditions_status(p_tenant, p_domain, p_package_id, p_version, 'commit');
  IF NOT (s ->> 'held')::boolean THEN RETURN jsonb_build_object('held', false, 'conditions', s -> 'conditions'); END IF;
  PERFORM decision._record_condition_evaluations(p_tenant, p_domain, p_package_id, p_version, 'commit', s, p_actor, p_correlation);
  SELECT coalesce(jsonb_agg(x), '[]'::jsonb) INTO v_failed FROM jsonb_array_elements(s -> 'conditions') x WHERE NOT (x ->> 'holds')::boolean AND (x ->> 'waived_by') IS NULL;
  INSERT INTO decision.package_events (event_id, scope, tenant_id, domain_id, package_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_package_id, 'commit.held', p_actor,
          jsonb_build_object('version', p_version, 'failed', v_failed, 'evaluated', jsonb_array_length(s -> 'conditions')), p_correlation);
  RETURN jsonb_build_object('held', true, 'failed', v_failed, 'conditions', s -> 'conditions', 'event_id', p_event_id);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.hold_check(uuid, uuid, uuid, int, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.hold_check(uuid, uuid, uuid, int, uuid, uuid, uuid) TO eye_commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §G3 THE GATE'S DISTINCT ACTS (HX-12), DEFER / REJECT / REQUEST-FOR-INFORMATION / RESUME (OBJ-35), DECISION-READY (OBJ-32)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- The gate task subject of a version: {kind: decision_version, id: <package>, version: <n>}.
CREATE OR REPLACE FUNCTION decision.gate_subject(p_package_id uuid, p_version int) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object('kind', 'decision_version', 'id', p_package_id, 'version', p_version) $$;
GRANT EXECUTE ON FUNCTION decision.gate_subject(uuid, int) TO eye_app, eye_commit;

-- THE INFORMATION PACKAGE an independent reviewer reads: the version's digest, its options, every dissent on the package, the live
-- approvals, the typed conditions, and the source-impact markers bearing on it — digested; a reviewer marks ready what they read, and a
-- change to any of it makes their digest stale.
CREATE OR REPLACE FUNCTION decision.information_package(p_tenant uuid, p_domain uuid, p_package_id uuid, p_version int) RETURNS jsonb
STABLE SECURITY DEFINER SET search_path = decision, pg_catalog, pg_temp AS $$
DECLARE v jsonb;
BEGIN
  IF p_tenant IS DISTINCT FROM public.eye_tenant() OR NOT (public.eye_scope() = 'TENANT' OR p_domain = public.eye_domain()) THEN
    RAISE EXCEPTION 'information package rejected: outside the caller''s scope' USING ERRCODE = '42501';
  END IF;
  SELECT jsonb_build_object(
    'package_id', p_package_id, 'version', p_version, 'version_digest', pv.version_digest,
    'options', (SELECT coalesce(jsonb_agg(jsonb_build_object('option_id', o.option_id, 'key', o.key) ORDER BY o.key), '[]'::jsonb) FROM decision.options o WHERE o.package_id = p_package_id AND o.version = p_version),
    'dissent', (SELECT coalesce(jsonb_agg(d.dissent_id ORDER BY d.recorded_at, d.dissent_id), '[]'::jsonb) FROM decision.dissent d WHERE d.package_id = p_package_id),
    'approvals', (SELECT coalesce(jsonb_agg(la.approval_id ORDER BY la.approval_id), '[]'::jsonb) FROM decision.live_approvals(p_package_id, p_version) la),
    'conditions', (SELECT coalesce(jsonb_agg(jsonb_build_object('approval_id', a.approval_id, 'conditions', a.conditions) ORDER BY a.approval_id), '[]'::jsonb)
                     FROM decision.approvals a WHERE a.package_id = p_package_id AND a.version = p_version AND a.revoked_at IS NULL),
    'source_impact', (SELECT coalesce(jsonb_agg(jsonb_build_object('marker_id', b.marker_id, 'acknowledged', b.acknowledged) ORDER BY b.marker_id), '[]'::jsonb)
                        FROM decision.source_impact_bearing(p_tenant, p_domain, p_package_id, p_version) b))
    INTO v FROM decision.package_versions pv WHERE pv.package_id = p_package_id AND pv.version = p_version AND pv.tenant_id = p_tenant AND pv.domain_id = p_domain;
  IF v IS NULL THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('package', v, 'digest', encode(sha256(convert_to(v::text, 'UTF8')), 'hex'));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.information_package(uuid, uuid, uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.information_package(uuid, uuid, uuid, int) TO eye_app, eye_commit;

-- Who may defer, reject, request information or resume at the gate: the package owner, an approver the version's policy admits, or a
-- decision authority — each a named active member.
CREATE OR REPLACE FUNCTION decision.gate_standing(p_actor uuid, p_tenant uuid, p_domain uuid, p_package_id uuid, p_version int) RETURNS text
STABLE SECURITY DEFINER SET search_path = decision, identity, pg_catalog, pg_temp AS $$
DECLARE p record; v record;
BEGIN
  IF NOT decision.is_active_human(p_actor, p_tenant) THEN RETURN NULL; END IF;
  SELECT * INTO p FROM decision.packages_current x WHERE x.package_id = p_package_id;
  SELECT * INTO v FROM decision.package_versions x WHERE x.package_id = p_package_id AND x.version = p_version;
  IF p.owner_principal_id = p_actor THEN RETURN 'owner'; END IF;
  IF decision.approver_eligibility(p_actor, p_tenant, p_domain, v.approver_policy) IS NOT NULL THEN RETURN 'approver'; END IF;
  IF decision.holds_role(p_actor, p_tenant, p_domain, 'decision_authority') THEN RETURN 'authority'; END IF;
  RETURN NULL;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.gate_standing(uuid, uuid, uuid, uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.gate_standing(uuid, uuid, uuid, uuid, int) TO eye_app, eye_commit;

-- ONE port for the seven acts, each asserting ITS OWN bound action (decision.gate.<act>): review and acknowledge record the reading and
-- move nothing; ready is the INDEPENDENT reviewer's (not the author, proposer, owner, action owner, nor an approver with a record on the
-- version) on the information package digest they read; defer and request_information move the version (and the package) to deferred /
-- information_requested with a rationale and a next-review instant, and open a gate.review task due then; reject ends the version with
-- a rationale; resume returns a deferred or information-requested version to where its live approvals put it.
CREATE OR REPLACE FUNCTION decision.gate_act(
  p_action_id uuid, p_tenant uuid, p_domain uuid, p_package_id uuid, p_version int, p_action text, p_rationale text, p_next_review_at timestamptz,
  p_info_request text, p_package_digest text, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE p record; v record; v_to text; v_standing text; v_ip jsonb; v_task jsonb; v_task_id uuid; v_live int; v_quorum int; v_event text; v_open text[] := ARRAY['proposed', 'under_review', 'approved'];
BEGIN
  IF p_action IS NULL OR p_action NOT IN ('review', 'acknowledge', 'ready', 'defer', 'reject', 'request_information', 'resume') THEN
    RAISE EXCEPTION 'gate rejected (action): % is not a gate act (review, acknowledge, ready, defer, reject, request_information, resume)', coalesce(p_action, '<none>') USING ERRCODE = '22023';
  END IF;
  PERFORM observation.assert_authority(ARRAY['decision.gate.' || p_action]);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'gate rejected: a gate act is the acting principal''s own, never on behalf of another' USING ERRCODE = '42501'; END IF;
  IF NOT decision.is_active_human(p_actor, p_tenant) THEN RAISE EXCEPTION 'gate rejected: only a named, active member acts at the gate' USING ERRCODE = '42501'; END IF;
  IF p_rationale IS NULL OR length(btrim(p_rationale)) < 8 OR length(p_rationale) > 4000 THEN
    RAISE EXCEPTION 'gate rejected (rationale): a gate act states its rationale (8 to 4000 characters)' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO p FROM decision.packages_current x WHERE x.package_id = p_package_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'gate rejected: no such package in this domain' USING ERRCODE = '23503'; END IF;
  SELECT * INTO v FROM decision.package_versions x WHERE x.package_id = p_package_id AND x.version = p_version FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'gate rejected: no such version % of package %', p_version, p_package_id USING ERRCODE = '23503'; END IF;
  IF p.state IN ('withdrawn', 'closed') OR v.state NOT IN ('proposed', 'under_review', 'approved', 'deferred', 'information_requested') THEN
    RAISE EXCEPTION 'gate rejected (state): version % is % (the package is %); the gate acts on a proposed version not yet committed, rejected or superseded', p_version, v.state, p.state USING ERRCODE = '22023';
  END IF;
  v_to := v.state;
  IF p_action IN ('review', 'acknowledge') THEN
    v_event := CASE p_action WHEN 'review' THEN 'gate.reviewed' ELSE 'gate.acknowledged' END;
  ELSIF p_action = 'ready' THEN
    IF NOT (v.state = ANY (v_open)) THEN RAISE EXCEPTION 'gate rejected (state): version % is %; decision-ready is marked on a proposed, reviewed or approved version', p_version, v.state USING ERRCODE = '22023'; END IF;
    IF p_actor IN (v.author_principal_id, p.owner_principal_id) OR p_actor = v.proposed_by OR p_actor::text = (v.choice ->> 'action_owner')
       OR EXISTS (SELECT 1 FROM decision.approvals a WHERE a.package_id = p_package_id AND a.version = p_version AND a.approver_principal_id = p_actor AND a.revoked_at IS NULL) THEN
      RAISE EXCEPTION 'gate rejected (independence): the reviewer who marks a version decision-ready is independent — not its author, proposer, owner, action owner nor an approver of it' USING ERRCODE = '42501';
    END IF;
    v_ip := decision.information_package(p_tenant, p_domain, p_package_id, p_version);
    IF p_package_digest IS NULL OR p_package_digest IS DISTINCT FROM (v_ip ->> 'digest') THEN
      RAISE EXCEPTION 'gate rejected (stale_package): the information package read (%) is not the package now (%); read it again', coalesce(p_package_digest, '<none>'), v_ip ->> 'digest' USING ERRCODE = '22023';
    END IF;
    v_event := 'version.ready';
  ELSE
    v_standing := decision.gate_standing(p_actor, p_tenant, p_domain, p_package_id, p_version);
    IF v_standing IS NULL THEN
      RAISE EXCEPTION 'gate rejected (authority): principal % is neither the package owner, an approver the policy admits, nor a decision authority', p_actor USING ERRCODE = '42501';
    END IF;
    IF p_action IN ('defer', 'request_information') THEN
      IF NOT (v.state = ANY (v_open)) THEN RAISE EXCEPTION 'gate rejected (state): version % is already %; resume it first', p_version, v.state USING ERRCODE = '22023'; END IF;
      IF p_next_review_at IS NULL OR p_next_review_at <= clock_timestamp() OR p_next_review_at > clock_timestamp() + interval '180 days' THEN
        RAISE EXCEPTION 'gate rejected (next_review): a % names its next review, in the future and within 180 days', replace(p_action, '_', ' ') USING ERRCODE = '22023';
      END IF;
      IF p_action = 'request_information' AND (p_info_request IS NULL OR length(btrim(p_info_request)) < 8) THEN
        RAISE EXCEPTION 'gate rejected (info_request): a request for information says what is asked (8+ characters)' USING ERRCODE = '22023';
      END IF;
      v_to := CASE p_action WHEN 'defer' THEN 'deferred' ELSE 'information_requested' END;
      v_event := CASE p_action WHEN 'defer' THEN 'version.deferred' ELSE 'version.information_requested' END;
      v_task := executive._open_human_task(gen_random_uuid(), p_tenant, p_domain, 'gate.review', 'gate.review:' || p_action_id::text, decision.gate_subject(p_package_id, p_version),
        format('%s: review %s version %s by %s', CASE p_action WHEN 'defer' THEN 'Deferred' ELSE 'Information requested' END, p.title, p_version, to_char(p_next_review_at AT TIME ZONE 'UTC', 'YYYY-MM-DD')),
        CASE p_action WHEN 'defer' THEN p_actor ELSE p.owner_principal_id END, '{}', jsonb_build_object('gate_action_id', p_action_id), p_next_review_at,
        jsonb_build_object('principal', p.owner_principal_id, 'max_escalations', 1, 'extend_minutes', 1440), NULL, p_action, p_actor, p_correlation);
      v_task_id := (v_task ->> 'task_id')::uuid;
    ELSIF p_action = 'reject' THEN
      v_to := 'rejected'; v_event := 'version.rejected_by_owner';
    ELSE -- resume
      IF v.state NOT IN ('deferred', 'information_requested') THEN RAISE EXCEPTION 'gate rejected (state): version % is %; only a deferred or information-requested version resumes', p_version, v.state USING ERRCODE = '22023'; END IF;
      v_quorum := (v.approver_policy ->> 'quorum')::int;
      SELECT count(*) INTO v_live FROM decision.live_approvals(p_package_id, p_version);
      v_to := CASE WHEN v_live >= v_quorum THEN 'approved' WHEN v_live > 0 THEN 'under_review' ELSE 'proposed' END;
      v_event := 'version.resumed';
      PERFORM executive._resolve_human_tasks(p_tenant, p_domain, decision.gate_subject(p_package_id, p_version), ARRAY['gate.review'], 'resumed', p_action_id, p_actor, p_correlation);
    END IF;
  END IF;
  INSERT INTO decision.gate_actions (action_id, scope, tenant_id, domain_id, package_id, version, action, actor_principal_id, rationale, next_review_at, info_request, information_package_digest, from_state, to_state, task_id, correlation_id)
  VALUES (p_action_id, 'DOMAIN', p_tenant, p_domain, p_package_id, p_version, p_action, p_actor, btrim(p_rationale),
          CASE WHEN p_action IN ('defer', 'request_information') THEN p_next_review_at END, CASE WHEN p_action = 'request_information' THEN btrim(p_info_request) END,
          CASE WHEN p_action = 'ready' THEN p_package_digest END, v.state, v_to, v_task_id, p_correlation);
  IF v_to <> v.state THEN
    UPDATE decision.package_versions SET state = v_to WHERE package_id = p_package_id AND version = p_version;
    IF p.current_version = p_version THEN UPDATE decision.packages_current SET state = v_to WHERE package_id = p_package_id; END IF;
  END IF;
  IF p_action = 'reject' THEN
    PERFORM executive._cancel_human_tasks(p_tenant, p_domain, decision.gate_subject(p_package_id, p_version), ARRAY['gate.approve', 'gate.review', 'gate.ready_review', 'gate.delegated_approval'],
                                          'the version was rejected at the gate', p_actor, p_correlation);
  ELSIF p_action = 'ready' THEN
    PERFORM executive._resolve_human_tasks(p_tenant, p_domain, decision.gate_subject(p_package_id, p_version), ARRAY['gate.ready_review'], 'ready', p_action_id, p_actor, p_correlation);
  END IF;
  INSERT INTO decision.package_events (event_id, scope, tenant_id, domain_id, package_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_package_id, v_event, p_actor,
          jsonb_strip_nulls(jsonb_build_object('version', p_version, 'action_id', p_action_id, 'action', p_action, 'rationale', btrim(p_rationale), 'from_state', v.state, 'to_state', v_to,
                             'next_review_at', CASE WHEN p_action IN ('defer', 'request_information') THEN p_next_review_at END, 'info_request', CASE WHEN p_action = 'request_information' THEN btrim(p_info_request) END,
                             'information_package_digest', CASE WHEN p_action = 'ready' THEN p_package_digest END, 'standing', v_standing, 'task_id', v_task_id)), p_correlation);
  RETURN jsonb_strip_nulls(jsonb_build_object('action_id', p_action_id, 'package_id', p_package_id, 'version', p_version, 'action', p_action, 'from_state', v.state, 'to_state', v_to,
                            'next_review_at', CASE WHEN p_action IN ('defer', 'request_information') THEN p_next_review_at END, 'task_id', v_task_id, 'standing', v_standing, 'event', v_event));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.gate_act(uuid, uuid, uuid, uuid, int, text, text, timestamptz, text, text, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.gate_act(uuid, uuid, uuid, uuid, int, text, text, timestamptz, text, text, uuid, uuid, uuid) TO eye_commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §G4 OVERRIDE AS A RECORDED OBJECT
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- NORMAL: a decision authority waives the FAILING typed conditions of an approved version (nothing else); EMERGENCY: an executive waives
-- them and/or covers a quorum SHORTFALL, and a gate.override_review task (72 hours, another executive or decision authority) opens at once.
-- Never on a board decision; never by the version's author, proposer, owner, action owner or an approver of it; the override's grantor
-- never commits the version (commit_package). An override lives 24 hours.
CREATE OR REPLACE FUNCTION decision.grant_override(
  p_override_id uuid, p_tenant uuid, p_domain uuid, p_package_id uuid, p_version int, p_kind text, p_rationale text, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE p record; v record; s jsonb; v_waive jsonb; v_live int; v_quorum int; v_short int := 0; v_task jsonb; v_task_id uuid; v_due timestamptz; v_exp timestamptz := clock_timestamp() + interval '24 hours';
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.override.grant']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'override rejected: an override is the acting principal''s own, never on behalf of another' USING ERRCODE = '42501'; END IF;
  IF NOT decision.is_active_human(p_actor, p_tenant) THEN RAISE EXCEPTION 'override rejected: only a named, active member overrides' USING ERRCODE = '42501'; END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('normal', 'emergency') THEN RAISE EXCEPTION 'override rejected (kind): an override is normal or emergency' USING ERRCODE = '22023'; END IF;
  IF p_rationale IS NULL OR length(btrim(p_rationale)) < 20 OR length(p_rationale) > 4000 THEN
    RAISE EXCEPTION 'override rejected (rationale): an override states its rationale (20 to 4000 characters)' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO p FROM decision.packages_current x WHERE x.package_id = p_package_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'override rejected: no such package in this domain' USING ERRCODE = '23503'; END IF;
  SELECT * INTO v FROM decision.package_versions x WHERE x.package_id = p_package_id AND x.version = p_version FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'override rejected: no such version % of package %', p_version, p_package_id USING ERRCODE = '23503'; END IF;
  IF p.decision_class = 'board' THEN RAISE EXCEPTION 'override rejected (board): a board decision''s gate is never overridden' USING ERRCODE = '42501'; END IF;
  IF p_kind = 'normal' AND NOT decision.holds_role(p_actor, p_tenant, p_domain, 'decision_authority') THEN
    RAISE EXCEPTION 'override rejected (authority): a normal override is a decision authority''s' USING ERRCODE = '42501';
  END IF;
  IF p_kind = 'emergency' AND NOT decision.holds_role(p_actor, p_tenant, p_domain, 'executive') THEN
    RAISE EXCEPTION 'override rejected (authority): an emergency override is an executive''s' USING ERRCODE = '42501';
  END IF;
  IF p_actor IN (v.author_principal_id, p.owner_principal_id) OR p_actor = v.proposed_by OR p_actor::text = (v.choice ->> 'action_owner')
     OR EXISTS (SELECT 1 FROM decision.approvals a WHERE a.package_id = p_package_id AND a.version = p_version AND a.approver_principal_id = p_actor AND a.revoked_at IS NULL) THEN
    RAISE EXCEPTION 'override rejected (separation): the author, proposer, owner, action owner and approvers of a version never override its gate' USING ERRCODE = '42501';
  END IF;
  IF p.state IN ('committed', 'monitoring', 'closed', 'withdrawn')
     OR (p_kind = 'normal' AND v.state <> 'approved') OR (p_kind = 'emergency' AND v.state NOT IN ('proposed', 'under_review', 'approved')) THEN
    RAISE EXCEPTION 'override rejected (state): version % is % (the package is %); a % override acts on %', p_version, v.state, p.state, p_kind,
      CASE WHEN p_kind = 'normal' THEN 'an approved version' ELSE 'a proposed, reviewed or approved version' END USING ERRCODE = '22023';
  END IF;
  s := decision.approval_conditions_status(p_tenant, p_domain, p_package_id, p_version, 'commit');
  SELECT coalesce(jsonb_agg(jsonb_build_object('approval_id', x ->> 'approval_id', 'condition_index', (x ->> 'condition_index')::int)), '[]'::jsonb) INTO v_waive
    FROM jsonb_array_elements(s -> 'conditions') x WHERE NOT (x ->> 'holds')::boolean AND (x ->> 'waived_by') IS NULL;
  IF p_kind = 'emergency' THEN
    v_quorum := (v.approver_policy ->> 'quorum')::int;
    SELECT count(*) INTO v_live FROM decision.live_approvals(p_package_id, p_version);
    v_short := greatest(v_quorum - v_live, 0);
  END IF;
  IF jsonb_array_length(v_waive) = 0 AND v_short = 0 THEN
    RAISE EXCEPTION 'override rejected (nothing_to_override): version % has no failing condition%; there is nothing to override', p_version,
      CASE WHEN p_kind = 'emergency' THEN ' and no quorum shortfall' ELSE '' END USING ERRCODE = '22023';
  END IF;
  IF p_kind = 'emergency' THEN
    v_due := clock_timestamp() + interval '72 hours';
    v_task := executive._open_human_task(gen_random_uuid(), p_tenant, p_domain, 'gate.override_review', 'gate.override_review:' || p_override_id::text,
      jsonb_build_object('kind', 'gate', 'id', p_override_id, 'package_id', p_package_id, 'version', p_version),
      format('Review the emergency override of %s version %s (after the fact, within 72 hours)', p.title, p_version), NULL, ARRAY['executive', 'decision_authority'],
      jsonb_build_object('excluded', jsonb_build_array(p_actor)), v_due, jsonb_build_object('roles', jsonb_build_array('executive'), 'max_escalations', 1, 'extend_minutes', 1440),
      NULL, 'override_review', p_actor, p_correlation);
    v_task_id := (v_task ->> 'task_id')::uuid;
  END IF;
  INSERT INTO decision.gate_overrides (override_id, scope, tenant_id, domain_id, package_id, version, version_digest, kind, granted_by, rationale, waived_conditions, quorum_shortfall, expires_at, review_task_id, review_due_at, correlation_id)
  VALUES (p_override_id, 'DOMAIN', p_tenant, p_domain, p_package_id, p_version, v.version_digest, p_kind, p_actor, btrim(p_rationale), v_waive, v_short, v_exp, v_task_id, v_due, p_correlation);
  INSERT INTO decision.package_events (event_id, scope, tenant_id, domain_id, package_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_package_id, 'override.granted', p_actor,
          jsonb_strip_nulls(jsonb_build_object('version', p_version, 'override_id', p_override_id, 'kind', p_kind, 'waived_conditions', v_waive, 'quorum_shortfall', v_short,
                             'expires_at', v_exp, 'review_task_id', v_task_id, 'review_due_at', v_due, 'rationale', btrim(p_rationale))), p_correlation);
  RETURN jsonb_strip_nulls(jsonb_build_object('override_id', p_override_id, 'package_id', p_package_id, 'version', p_version, 'kind', p_kind, 'waived_conditions', v_waive,
                            'quorum_shortfall', v_short, 'expires_at', v_exp, 'review_task_id', v_task_id, 'review_due_at', v_due));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.grant_override(uuid, uuid, uuid, uuid, int, text, text, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.grant_override(uuid, uuid, uuid, uuid, int, text, text, uuid, uuid, uuid) TO eye_commit;

-- The MANDATORY after-the-fact review of an emergency override: another executive or decision authority (never its grantor) upholds or
-- contests it, once; the review task resolves.
CREATE OR REPLACE FUNCTION decision.review_override(
  p_tenant uuid, p_domain uuid, p_override_id uuid, p_outcome text, p_note text, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE o record; v_at timestamptz := clock_timestamp();
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.override.review']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'override review rejected: the review is the acting principal''s own' USING ERRCODE = '42501'; END IF;
  IF NOT decision.is_active_human(p_actor, p_tenant) THEN RAISE EXCEPTION 'override review rejected: only a named, active member reviews an override' USING ERRCODE = '42501'; END IF;
  IF p_outcome IS NULL OR p_outcome NOT IN ('upheld', 'contested') THEN RAISE EXCEPTION 'override review rejected (outcome): the review upholds or contests the override' USING ERRCODE = '22023'; END IF;
  IF p_note IS NULL OR length(btrim(p_note)) < 8 THEN RAISE EXCEPTION 'override review rejected (note): the review says why (8+ characters)' USING ERRCODE = '22023'; END IF;
  SELECT * INTO o FROM decision.gate_overrides x WHERE x.override_id = p_override_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'override review rejected: no such override in this domain' USING ERRCODE = '23503'; END IF;
  IF o.kind <> 'emergency' THEN RAISE EXCEPTION 'override review rejected (normal): only an emergency override carries an after-the-fact review' USING ERRCODE = '22023'; END IF;
  IF o.reviewed_at IS NOT NULL THEN RAISE EXCEPTION 'override review rejected (reviewed): override % was reviewed at %', p_override_id, o.reviewed_at USING ERRCODE = '22023'; END IF;
  IF o.granted_by = p_actor THEN RAISE EXCEPTION 'override review rejected (separation): the grantor never reviews their own override' USING ERRCODE = '42501'; END IF;
  IF NOT (decision.holds_role(p_actor, p_tenant, p_domain, 'executive') OR decision.holds_role(p_actor, p_tenant, p_domain, 'decision_authority')) THEN
    RAISE EXCEPTION 'override review rejected (authority): an executive or a decision authority reviews an emergency override' USING ERRCODE = '42501';
  END IF;
  UPDATE decision.gate_overrides SET reviewed_by = p_actor, reviewed_at = v_at, review_outcome = p_outcome, review_note = btrim(p_note) WHERE override_id = p_override_id;
  PERFORM executive._resolve_human_tasks(p_tenant, p_domain, jsonb_build_object('kind', 'gate', 'id', p_override_id), ARRAY['gate.override_review'], p_outcome, p_override_id, p_actor, p_correlation);
  INSERT INTO decision.package_events (event_id, scope, tenant_id, domain_id, package_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, o.package_id, 'override.reviewed', p_actor,
          jsonb_build_object('version', o.version, 'override_id', p_override_id, 'outcome', p_outcome, 'note', btrim(p_note), 'late', v_at > o.review_due_at), p_correlation);
  RETURN jsonb_build_object('override_id', p_override_id, 'outcome', p_outcome, 'reviewed_at', v_at, 'late', v_at > o.review_due_at);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.review_override(uuid, uuid, uuid, text, text, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.review_override(uuid, uuid, uuid, text, text, uuid, uuid, uuid) TO eye_commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §G5 DELEGATION OF APPROVAL AUTHORITY (FEX-16)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION decision._insert_delegation(
  p_delegation_id uuid, p_tenant uuid, p_domain uuid, p_package_id uuid, p_delegator uuid, p_delegate uuid, p_expires_at timestamptz, p_reason text, p_replaces uuid, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, executive, public, pg_catalog, pg_temp AS $$
DECLARE p record; v_task jsonb;
BEGIN
  SELECT * INTO p FROM decision.packages_current x WHERE x.package_id = p_package_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'delegation rejected: no such package in this domain' USING ERRCODE = '23503'; END IF;
  IF p.decision_class = 'board' THEN RAISE EXCEPTION 'delegation rejected (board): a board decision''s reserved authority is never delegated' USING ERRCODE = '42501'; END IF;
  IF p.state IN ('committed', 'monitoring', 'closed', 'withdrawn', 'rejected') THEN RAISE EXCEPTION 'delegation rejected (state): package % is %', p_package_id, p.state USING ERRCODE = '22023'; END IF;
  IF p_delegate IS NULL OR p_delegate = p_delegator OR NOT decision.is_active_human(p_delegate, p_tenant) THEN
    RAISE EXCEPTION 'delegation rejected (delegate): the delegate is another named, active member' USING ERRCODE = '22023';
  END IF;
  IF p_delegate = p.owner_principal_id THEN RAISE EXCEPTION 'delegation rejected (delegate): the package owner never holds its approval' USING ERRCODE = '22023'; END IF;
  IF p_expires_at IS NULL OR p_expires_at <= clock_timestamp() OR p_expires_at > clock_timestamp() + interval '30 days' THEN
    RAISE EXCEPTION 'delegation rejected (expiry): a delegation expires in the future and within 30 days' USING ERRCODE = '22023';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN RAISE EXCEPTION 'delegation rejected (reason): a delegation states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM decision.approval_delegations d WHERE d.package_id = p_package_id AND d.delegator_principal_id = p_delegator AND d.ended_at IS NULL AND d.expires_at > clock_timestamp()) THEN
    RAISE EXCEPTION 'delegation rejected (duplicate): principal % already delegates their approval of package %; end or reassign it', p_delegator, p_package_id USING ERRCODE = '23505';
  END IF;
  v_task := executive._open_human_task(gen_random_uuid(), p_tenant, p_domain, 'gate.delegated_approval', 'gate.delegated_approval:' || p_delegation_id::text,
    jsonb_build_object('kind', 'decision_package', 'id', p_package_id, 'delegation_id', p_delegation_id),
    format('Approve %s on behalf of %s (delegated until %s)', p.title, p_delegator, to_char(p_expires_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI')), p_delegate, '{}',
    jsonb_build_object('delegator', p_delegator), p_expires_at, '{}'::jsonb, NULL, 'delegated_approval', p_actor, p_correlation);
  INSERT INTO decision.approval_delegations (delegation_id, scope, tenant_id, domain_id, package_id, delegator_principal_id, delegate_principal_id, reason, expires_at, replaces, task_id, correlation_id)
  VALUES (p_delegation_id, 'DOMAIN', p_tenant, p_domain, p_package_id, p_delegator, p_delegate, btrim(p_reason), p_expires_at, p_replaces, (v_task ->> 'task_id')::uuid, p_correlation);
  RETURN jsonb_build_object('delegation_id', p_delegation_id, 'package_id', p_package_id, 'delegator', p_delegator, 'delegate', p_delegate, 'expires_at', p_expires_at, 'replaces', p_replaces, 'task_id', v_task ->> 'task_id');
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision._insert_delegation(uuid, uuid, uuid, uuid, uuid, uuid, timestamptz, text, uuid, uuid, uuid) FROM PUBLIC;

-- An approver delegates THEIR approval of one package to a named member until an expiry (≤ 30 days): the delegate's approval counts as
-- `delegation:<id>` while the delegation lives and the delegator is still eligible; it stops counting when the delegation ends or expires.
CREATE OR REPLACE FUNCTION decision.delegate_approval(
  p_delegation_id uuid, p_tenant uuid, p_domain uuid, p_package_id uuid, p_delegate uuid, p_expires_at timestamptz, p_reason text, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.delegation.grant']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'delegation rejected: a delegation is the delegator''s own act' USING ERRCODE = '42501'; END IF;
  IF NOT decision.is_active_human(p_actor, p_tenant) OR NOT decision.holds_role(p_actor, p_tenant, p_domain, 'decision_approver') THEN
    RAISE EXCEPTION 'delegation rejected (authority): only a named, active decision approver delegates their approval' USING ERRCODE = '42501';
  END IF;
  r := decision._insert_delegation(p_delegation_id, p_tenant, p_domain, p_package_id, p_actor, p_delegate, p_expires_at, p_reason, NULL, p_actor, p_correlation);
  INSERT INTO decision.package_events (event_id, scope, tenant_id, domain_id, package_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_package_id, 'approval_delegation.granted', p_actor, r || jsonb_build_object('reason', btrim(p_reason)), p_correlation);
  RETURN r;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.delegate_approval(uuid, uuid, uuid, uuid, uuid, timestamptz, text, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.delegate_approval(uuid, uuid, uuid, uuid, uuid, timestamptz, text, uuid, uuid, uuid) TO eye_commit;

-- The delegator ends a delegation (its task cancelled), or REASSIGNS it: the old one ends and a new one, naming it, goes to another member.
CREATE OR REPLACE FUNCTION decision.end_delegation(
  p_tenant uuid, p_domain uuid, p_delegation_id uuid, p_reason text, p_reassign_to uuid, p_new_delegation_id uuid, p_expires_at timestamptz, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE d record; r jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.delegation.end']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'delegation end rejected: the end is the delegator''s own act' USING ERRCODE = '42501'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN RAISE EXCEPTION 'delegation end rejected (reason): the end states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  SELECT * INTO d FROM decision.approval_delegations x WHERE x.delegation_id = p_delegation_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'delegation end rejected: no such delegation in this domain' USING ERRCODE = '23503'; END IF;
  IF d.delegator_principal_id <> p_actor THEN RAISE EXCEPTION 'delegation end rejected: only the delegator ends or reassigns their delegation' USING ERRCODE = '42501'; END IF;
  IF d.ended_at IS NOT NULL THEN RAISE EXCEPTION 'delegation end rejected (ended): delegation % ended at %', p_delegation_id, d.ended_at USING ERRCODE = '22023'; END IF;
  UPDATE decision.approval_delegations SET ended_at = clock_timestamp(), ended_by = p_actor, ended_reason = btrim(p_reason) WHERE delegation_id = p_delegation_id;
  PERFORM executive._cancel_human_tasks(p_tenant, p_domain, jsonb_build_object('delegation_id', p_delegation_id), ARRAY['gate.delegated_approval'], 'the delegation ended: ' || btrim(p_reason), p_actor, p_correlation);
  IF p_reassign_to IS NOT NULL THEN
    r := decision._insert_delegation(coalesce(p_new_delegation_id, gen_random_uuid()), p_tenant, p_domain, d.package_id, p_actor, p_reassign_to, coalesce(p_expires_at, d.expires_at), p_reason, p_delegation_id, p_actor, p_correlation);
  END IF;
  INSERT INTO decision.package_events (event_id, scope, tenant_id, domain_id, package_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, d.package_id, CASE WHEN p_reassign_to IS NULL THEN 'approval_delegation.ended' ELSE 'approval_delegation.reassigned' END, p_actor,
          jsonb_strip_nulls(jsonb_build_object('delegation_id', p_delegation_id, 'delegate', d.delegate_principal_id, 'reason', btrim(p_reason), 'reassigned', r)), p_correlation);
  RETURN jsonb_strip_nulls(jsonb_build_object('delegation_id', p_delegation_id, 'ended', true, 'reassigned', r));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.end_delegation(uuid, uuid, uuid, text, uuid, uuid, timestamptz, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.end_delegation(uuid, uuid, uuid, text, uuid, uuid, timestamptz, uuid, uuid, uuid) TO eye_commit;

-- Whether a delegation lets its delegate approve a version at an instant: live then, and its delegator eligible then under the version's policy.
CREATE OR REPLACE FUNCTION decision.delegation_standing_as_of(p_eligible_by text, p_approver uuid, p_tenant uuid, p_domain uuid, p_policy jsonb, p_at timestamptz) RETURNS boolean
STABLE SECURITY DEFINER SET search_path = decision, pg_catalog, pg_temp AS $$
  SELECT p_eligible_by LIKE 'delegation:%' AND EXISTS (
    SELECT 1 FROM decision.approval_delegations d
     WHERE d.delegation_id = substr(p_eligible_by, 12)::uuid AND d.delegate_principal_id = p_approver AND d.starts_at <= p_at AND d.expires_at > p_at
       AND (d.ended_at IS NULL OR d.ended_at > p_at)
       AND decision.approver_eligibility_as_of(d.delegator_principal_id, p_tenant, p_domain, p_policy, p_at) IS NOT NULL);
$$ LANGUAGE sql;
REVOKE ALL ON FUNCTION decision.delegation_standing_as_of(text, uuid, uuid, uuid, jsonb, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.delegation_standing_as_of(text, uuid, uuid, uuid, jsonb, timestamptz) TO eye_app, eye_commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §G6 THE RESERVED BOARD DECISION CLASS (PER-01)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- An executive reserves a DRAFT package for the board: {charter, quorum ≥ 2}. A board decision is never overridden, its approval never
-- delegated, it needs an independent decision-ready, and its commitment counts at least the board's quorum.
CREATE OR REPLACE FUNCTION decision.reserve_board_class(
  p_tenant uuid, p_domain uuid, p_package_id uuid, p_board jsonb, p_rationale text, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE p record; v_board jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.board.reserve']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'board reservation rejected: the reservation is the acting principal''s own' USING ERRCODE = '42501'; END IF;
  IF NOT decision.is_active_human(p_actor, p_tenant) OR NOT decision.holds_role(p_actor, p_tenant, p_domain, 'executive') THEN
    RAISE EXCEPTION 'board reservation rejected (authority): a named, active executive reserves a decision for the board' USING ERRCODE = '42501';
  END IF;
  IF p_board IS NULL OR jsonb_typeof(p_board) <> 'object' OR coalesce(length(btrim(p_board ->> 'charter')), 0) < 8
     OR jsonb_typeof(p_board -> 'quorum') IS DISTINCT FROM 'number' OR (p_board ->> 'quorum')::numeric < 2 OR (p_board ->> 'quorum')::numeric <> floor((p_board ->> 'quorum')::numeric) THEN
    RAISE EXCEPTION 'board reservation rejected (board): the board names its charter (8+ characters) and a whole quorum of at least 2' USING ERRCODE = '22023';
  END IF;
  IF p_rationale IS NULL OR length(btrim(p_rationale)) < 8 THEN RAISE EXCEPTION 'board reservation rejected (rationale): the reservation states its rationale (8+ characters)' USING ERRCODE = '22023'; END IF;
  SELECT * INTO p FROM decision.packages_current x WHERE x.package_id = p_package_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'board reservation rejected: no such package in this domain' USING ERRCODE = '23503'; END IF;
  IF p.decision_class = 'board' THEN RAISE EXCEPTION 'board reservation rejected (reserved): package % is already reserved for the board', p_package_id USING ERRCODE = '22023'; END IF;
  IF p.state <> 'draft' OR p.committed_version IS NOT NULL THEN
    RAISE EXCEPTION 'board reservation rejected (state): package % is %; a decision is reserved for the board while it is a draft', p_package_id, p.state USING ERRCODE = '22023';
  END IF;
  v_board := jsonb_build_object('charter', btrim(p_board ->> 'charter'), 'quorum', (p_board ->> 'quorum')::int, 'reserved_by', p_actor, 'reserved_at', clock_timestamp(), 'rationale', btrim(p_rationale));
  UPDATE decision.packages_current SET decision_class = 'board', board = v_board WHERE package_id = p_package_id;
  INSERT INTO decision.package_events (event_id, scope, tenant_id, domain_id, package_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_package_id, 'package.class_reserved', p_actor, jsonb_build_object('decision_class', 'board', 'board', v_board), p_correlation);
  RETURN jsonb_build_object('package_id', p_package_id, 'decision_class', 'board', 'board', v_board);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.reserve_board_class(uuid, uuid, uuid, jsonb, text, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.reserve_board_class(uuid, uuid, uuid, jsonb, text, uuid, uuid, uuid) TO eye_commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §G7 THE CONSEQUENCE PREVIEW (HX-13: "effect cannot execute without review")
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- The committing authority's own reading, recorded: the intended institutional effect (the bounded CMT under decision.commit at C3), the
-- affected objects (the DEC, the objectives, the chosen runs and the baseline), the reversibility, the residual risk (the version's risks,
-- the typed conditions evaluated now, the source-impact markers outstanding), the quorum, the overrides, the decision-ready and the audit
-- scope — with what WOULD hold or refuse the commit now. Digested; the commit carries the digest within 30 minutes.
CREATE OR REPLACE FUNCTION decision.commit_preview(
  p_preview_id uuid, p_tenant uuid, p_domain uuid, p_package_id uuid, p_version int, p_version_digest text, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE p record; v record; v_cs jsonb; v_live int; v_quorum int; v_si int; v_prev jsonb; v_digest text; v_ready record; v_ip jsonb; v_over jsonb; v_blockers jsonb := '[]'::jsonb; v_runs jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.commit.preview']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'preview rejected: a preview is the committing principal''s own reading' USING ERRCODE = '42501'; END IF;
  IF NOT decision.is_active_human(p_actor, p_tenant) OR NOT decision.holds_role(p_actor, p_tenant, p_domain, 'decision_authority') THEN
    RAISE EXCEPTION 'preview rejected (authority): the consequence preview is read by a named, active decision authority — the one who would commit' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO p FROM decision.packages_current x WHERE x.package_id = p_package_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'preview rejected: no such package in this domain' USING ERRCODE = '23503'; END IF;
  SELECT * INTO v FROM decision.package_versions x WHERE x.package_id = p_package_id AND x.version = p_version;
  IF NOT FOUND THEN RAISE EXCEPTION 'preview rejected: no such version % of package %', p_version, p_package_id USING ERRCODE = '23503'; END IF;
  IF p.state IN ('committed', 'monitoring', 'closed', 'withdrawn') OR v.state NOT IN ('proposed', 'under_review', 'approved') THEN
    RAISE EXCEPTION 'preview rejected (state): version % is % (the package is %); a commitment is previewed for a version that could be committed', p_version, v.state, p.state USING ERRCODE = '22023';
  END IF;
  IF p_version_digest IS DISTINCT FROM v.version_digest THEN
    RAISE EXCEPTION 'preview rejected: the digest previewed (%) is not the digest of version % (%)', p_version_digest, p_version, v.version_digest USING ERRCODE = '22023';
  END IF;
  v_cs := decision.approval_conditions_status(p_tenant, p_domain, p_package_id, p_version, 'preview');
  v_quorum := (v.approver_policy ->> 'quorum')::int;
  SELECT count(*) INTO v_live FROM decision.live_approvals(p_package_id, p_version);
  SELECT count(*) INTO v_si FROM decision.source_impact_bearing(p_tenant, p_domain, p_package_id, p_version) b WHERE NOT b.acknowledged;
  SELECT coalesce(jsonb_agg(jsonb_build_object('override_id', o.override_id, 'kind', o.kind, 'granted_by', o.granted_by, 'quorum_shortfall', o.quorum_shortfall, 'expires_at', o.expires_at) ORDER BY o.granted_at), '[]'::jsonb)
    INTO v_over FROM decision.gate_overrides o WHERE o.package_id = p_package_id AND o.version = p_version AND o.expires_at > clock_timestamp() AND o.version_digest = v.version_digest;
  SELECT * INTO v_ready FROM decision.gate_actions g WHERE g.package_id = p_package_id AND g.version = p_version AND g.action = 'ready' ORDER BY g.at DESC, g.action_id DESC LIMIT 1;
  v_ip := decision.information_package(p_tenant, p_domain, p_package_id, p_version);
  SELECT coalesce(jsonb_agg(DISTINCT x ->> 'id'), '[]'::jsonb) INTO v_runs FROM decision.options o, jsonb_array_elements(o.consequences) x
   WHERE o.package_id = p_package_id AND o.version = p_version AND o.key = (v.choice ->> 'option_key') AND (x ->> 'kind') = 'run';
  IF (v_cs ->> 'held')::boolean THEN v_blockers := v_blockers || jsonb_build_array(format('%s approval condition(s) do not hold — the commit would be HELD', v_cs ->> 'failed')); END IF;
  IF v_si > 0 THEN v_blockers := v_blockers || jsonb_build_array(format('%s source-impact marker(s) not acknowledged for this version', v_si)); END IF;
  IF v_live < v_quorum AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_over) o WHERE (o ->> 'quorum_shortfall')::int >= v_quorum - v_live) THEN
    v_blockers := v_blockers || jsonb_build_array(format('quorum %s; %s live approval(s)', v_quorum, v_live));
  END IF;
  IF (p.decision_class = 'board' OR (v.approver_policy ->> 'requires_ready') = 'true') AND (v_ready.action_id IS NULL OR v_ready.information_package_digest IS DISTINCT FROM (v_ip ->> 'digest')) THEN
    v_blockers := v_blockers || jsonb_build_array('no fresh independent decision-ready');
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_over) o WHERE (o ->> 'granted_by')::uuid = p_actor) THEN v_blockers := v_blockers || jsonb_build_array('you granted an override on this version; you do not commit it'); END IF;
  v_prev := jsonb_build_object(
    'package_id', p_package_id, 'version', p_version, 'version_digest', v.version_digest, 'decision_class', p.decision_class, 'board', p.board,
    'intended_effect', jsonb_build_object('writes', 'CMT', 'bound_action', 'decision.commit', 'op_class', 'C3', 'choice', v.choice,
                                          'statement', 'a bounded commitment (CMT) is written into the strategy graph; nothing executes on the world'),
    'affected_objects', jsonb_build_object('decision', p.decision_object_id, 'objectives', v.objectives, 'runs', v_runs, 'baseline_run_id', v.baseline_run_id),
    'reversibility', v.reversibility,
    'residual_risk', jsonb_build_object('risks', v.risks, 'second_order', v.second_order, 'conditions', v_cs -> 'conditions', 'conditions_failed', (v_cs ->> 'failed')::int, 'source_impact_outstanding', v_si,
                                        'monitoring_conditions', v.monitoring_conditions),
    'authority', jsonb_build_object('quorum', v_quorum, 'live_approvals', v_live, 'overrides', v_over,
                                    'ready', CASE WHEN v_ready.action_id IS NULL THEN NULL ELSE jsonb_build_object('by', v_ready.actor_principal_id, 'at', v_ready.at, 'fresh', v_ready.information_package_digest = (v_ip ->> 'digest')) END),
    'audit_scope', jsonb_build_object('tenant_id', p_tenant, 'domain_id', p_domain, 'previewed_by', p_actor, 'records', jsonb_build_array('decision.commitments', 'graph.strategy_current', 'graph.dependencies', 'decision.package_events', 'audit chain')),
    'blockers', v_blockers, 'would_commit', jsonb_array_length(v_blockers) = 0, 'previewed_at', clock_timestamp());
  v_digest := encode(sha256(convert_to(v_prev::text, 'UTF8')), 'hex');
  INSERT INTO decision.commit_previews (preview_id, scope, tenant_id, domain_id, package_id, version, version_digest, preview_digest, preview, previewed_by, correlation_id)
  VALUES (p_preview_id, 'DOMAIN', p_tenant, p_domain, p_package_id, p_version, v.version_digest, v_digest, v_prev, p_actor, p_correlation);
  PERFORM decision._record_condition_evaluations(p_tenant, p_domain, p_package_id, p_version, 'preview', v_cs, p_actor, p_correlation);
  INSERT INTO decision.package_events (event_id, scope, tenant_id, domain_id, package_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_package_id, 'commit.previewed', p_actor,
          jsonb_build_object('version', p_version, 'preview_id', p_preview_id, 'preview_digest', v_digest, 'would_commit', jsonb_array_length(v_blockers) = 0, 'blockers', v_blockers), p_correlation);
  RETURN jsonb_build_object('preview_id', p_preview_id, 'preview_digest', v_digest, 'preview', v_prev, 'valid_until', clock_timestamp() + interval '30 minutes');
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.commit_preview(uuid, uuid, uuid, uuid, int, text, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.commit_preview(uuid, uuid, uuid, uuid, int, text, uuid, uuid, uuid) TO eye_commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §G8 POLICY REVISIONS AND CONTROL DECISIONS, VERSIONED; THE CONTROLS IN FORCE AS OF AN INSTANT
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION decision.record_control(
  p_control_id uuid, p_tenant uuid, p_domain uuid, p_kind text, p_control_key text, p_body jsonb, p_rationale text, p_effective_from timestamptz, p_package_id uuid,
  p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_prev record; v_version int; v_from timestamptz := coalesce(p_effective_from, clock_timestamp());
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.control.record']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'control rejected: a control decision is the acting principal''s own' USING ERRCODE = '42501'; END IF;
  IF NOT decision.is_active_human(p_actor, p_tenant) OR NOT (decision.holds_role(p_actor, p_tenant, p_domain, 'executive') OR decision.holds_role(p_actor, p_tenant, p_domain, 'decision_authority')
                                                             OR decision.holds_role(p_actor, p_tenant, p_domain, 'domain_admin')) THEN
    RAISE EXCEPTION 'control rejected (authority): a named, active executive, decision authority or domain administrator records a policy revision or a control decision' USING ERRCODE = '42501';
  END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('policy_revision', 'control_decision') THEN RAISE EXCEPTION 'control rejected (kind): a control is a policy_revision or a control_decision' USING ERRCODE = '22023'; END IF;
  IF p_control_key IS NULL OR p_control_key !~ '^[a-z0-9][a-z0-9._-]{2,79}$' THEN RAISE EXCEPTION 'control rejected (key): the control key is 3 to 80 lower-case characters' USING ERRCODE = '22023'; END IF;
  IF p_body IS NULL OR jsonb_typeof(p_body) <> 'object' OR p_body = '{}'::jsonb THEN RAISE EXCEPTION 'control rejected (body): the control states its body (a non-empty object)' USING ERRCODE = '22023'; END IF;
  IF p_rationale IS NULL OR length(btrim(p_rationale)) < 8 THEN RAISE EXCEPTION 'control rejected (rationale): the control states its rationale (8+ characters)' USING ERRCODE = '22023'; END IF;
  IF v_from < clock_timestamp() - interval '1 minute' THEN RAISE EXCEPTION 'control rejected (backdated): a control takes effect now or later, never back-dated' USING ERRCODE = '22023'; END IF;
  IF p_package_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM decision.packages_current x WHERE x.package_id = p_package_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain) THEN
    RAISE EXCEPTION 'control rejected: no such package in this domain' USING ERRCODE = '23503';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('decision.control:' || p_tenant::text || ':' || p_domain::text || ':' || p_control_key, 0));
  SELECT * INTO v_prev FROM decision.control_decisions c WHERE c.tenant_id = p_tenant AND c.domain_id = p_domain AND c.control_key = p_control_key ORDER BY c.version DESC LIMIT 1;
  v_version := coalesce(v_prev.version, 0) + 1;
  IF v_prev.control_id IS NOT NULL AND v_prev.kind <> p_kind THEN RAISE EXCEPTION 'control rejected (kind): control % is a %', p_control_key, v_prev.kind USING ERRCODE = '22023'; END IF;
  INSERT INTO decision.control_decisions (control_id, scope, tenant_id, domain_id, kind, control_key, version, body, rationale, package_id, supersedes, effective_from, recorded_by, correlation_id)
  VALUES (p_control_id, 'DOMAIN', p_tenant, p_domain, p_kind, p_control_key, v_version, p_body, btrim(p_rationale), p_package_id, v_prev.control_id, v_from, p_actor, p_correlation);
  IF p_package_id IS NOT NULL THEN
    INSERT INTO decision.package_events (event_id, scope, tenant_id, domain_id, package_id, event, actor_principal_id, details, correlation_id)
    VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_package_id, 'control.recorded', p_actor,
            jsonb_build_object('control_id', p_control_id, 'kind', p_kind, 'control_key', p_control_key, 'version', v_version, 'supersedes', v_prev.control_id, 'effective_from', v_from), p_correlation);
  END IF;
  RETURN jsonb_build_object('control_id', p_control_id, 'kind', p_kind, 'control_key', p_control_key, 'version', v_version, 'supersedes', v_prev.control_id, 'effective_from', v_from);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.record_control(uuid, uuid, uuid, text, text, jsonb, text, timestamptz, uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.record_control(uuid, uuid, uuid, text, text, jsonb, text, timestamptz, uuid, uuid, uuid, uuid) TO eye_commit;

-- What was IN FORCE at an instant: per key, the latest version recorded by then and effective by then. Scoped to the caller's context.
CREATE OR REPLACE FUNCTION decision.control_decisions_as_of(p_tenant uuid, p_domain uuid, p_at timestamptz) RETURNS jsonb
STABLE SECURITY DEFINER SET search_path = decision, pg_catalog, pg_temp AS $$
BEGIN
  IF p_tenant IS DISTINCT FROM public.eye_tenant() OR NOT (public.eye_scope() = 'TENANT' OR p_domain = public.eye_domain()) THEN
    RAISE EXCEPTION 'controls rejected: outside the caller''s scope' USING ERRCODE = '42501';
  END IF;
  RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('control_id', c.control_id, 'kind', c.kind, 'control_key', c.control_key, 'version', c.version, 'body', c.body,
                                                       'rationale', c.rationale, 'effective_from', c.effective_from, 'recorded_at', c.recorded_at, 'recorded_by', c.recorded_by) ORDER BY c.control_key), '[]'::jsonb)
            FROM (SELECT DISTINCT ON (x.control_key) x.* FROM decision.control_decisions x
                   WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.recorded_at <= p_at AND x.effective_from <= p_at
                   ORDER BY x.control_key, x.version DESC) c);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.control_decisions_as_of(uuid, uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.control_decisions_as_of(uuid, uuid, timestamptz) TO eye_app, eye_commit;

-- THE GATE AS IT STANDS (HX-09: eligible authority, required reviewers, delegation, current gate): one read for the page.
CREATE OR REPLACE FUNCTION decision.gate_status(p_tenant uuid, p_domain uuid, p_package_id uuid, p_version int) RETURNS jsonb
STABLE SECURITY DEFINER SET search_path = decision, executive, pg_catalog, pg_temp AS $$
DECLARE p record; v record; v_ip jsonb;
BEGIN
  IF p_tenant IS DISTINCT FROM public.eye_tenant() OR NOT (public.eye_scope() = 'TENANT' OR p_domain = public.eye_domain()) THEN
    RAISE EXCEPTION 'gate status rejected: outside the caller''s scope' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO p FROM decision.packages_current x WHERE x.package_id = p_package_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO v FROM decision.package_versions x WHERE x.package_id = p_package_id AND x.version = p_version;
  IF NOT FOUND THEN RETURN NULL; END IF;
  v_ip := decision.information_package(p_tenant, p_domain, p_package_id, p_version);
  RETURN jsonb_build_object(
    'package_id', p_package_id, 'version', p_version, 'state', v.state, 'decision_class', p.decision_class, 'board', p.board,
    'requires_ready', p.decision_class = 'board' OR (v.approver_policy ->> 'requires_ready') = 'true',
    'information_package_digest', v_ip ->> 'digest',
    'conditions', decision.approval_conditions_status(p_tenant, p_domain, p_package_id, p_version, CASE WHEN p.committed_version = p_version THEN 'monitor' ELSE 'commit' END),
    'actions', (SELECT coalesce(jsonb_agg(to_jsonb(g) - 'scope' - 'tenant_id' - 'domain_id' ORDER BY g.at, g.action_id), '[]'::jsonb) FROM decision.gate_actions g WHERE g.package_id = p_package_id AND g.version = p_version),
    'overrides', (SELECT coalesce(jsonb_agg(to_jsonb(o) - 'scope' - 'tenant_id' - 'domain_id' || jsonb_build_object('live', o.expires_at > clock_timestamp()) ORDER BY o.granted_at), '[]'::jsonb)
                    FROM decision.gate_overrides o WHERE o.package_id = p_package_id AND o.version = p_version),
    'delegations', (SELECT coalesce(jsonb_agg(to_jsonb(d) - 'scope' - 'tenant_id' - 'domain_id' || jsonb_build_object('live', d.ended_at IS NULL AND d.expires_at > clock_timestamp()) ORDER BY d.created_at), '[]'::jsonb)
                      FROM decision.approval_delegations d WHERE d.package_id = p_package_id),
    'previews', (SELECT coalesce(jsonb_agg(jsonb_build_object('preview_id', c.preview_id, 'preview_digest', c.preview_digest, 'previewed_by', c.previewed_by, 'previewed_at', c.previewed_at,
                                                             'would_commit', c.preview -> 'would_commit', 'blockers', c.preview -> 'blockers') ORDER BY c.previewed_at DESC), '[]'::jsonb)
                   FROM (SELECT * FROM decision.commit_previews x WHERE x.package_id = p_package_id AND x.version = p_version ORDER BY x.previewed_at DESC LIMIT 5) c),
    'holds', (SELECT coalesce(jsonb_agg(jsonb_build_object('event_id', e.event_id, 'at', e.occurred_at, 'by', e.actor_principal_id, 'failed', e.details -> 'failed') ORDER BY e.occurred_at), '[]'::jsonb)
                FROM decision.package_events e WHERE e.package_id = p_package_id AND e.event = 'commit.held' AND (e.details ->> 'version')::int = p_version),
    'tasks', (SELECT coalesce(jsonb_agg(jsonb_build_object('task_id', t.task_id, 'kind', t.kind, 'state', t.state, 'title', t.title, 'assignee', t.assignee_principal_id, 'candidate_roles', t.candidate_roles,
                                                          'deadline_at', t.deadline_at, 'timer_id', t.deadline_timer_id, 'outcome', t.outcome) ORDER BY t.opened_at), '[]'::jsonb)
                FROM executive.human_tasks t WHERE t.tenant_id = p_tenant AND t.domain_id = p_domain AND t.kind LIKE 'gate.%'
                  AND (t.subject @> decision.gate_subject(p_package_id, p_version) OR t.subject @> jsonb_build_object('kind', 'decision_package', 'id', p_package_id)
                       OR (t.subject ->> 'package_id') = p_package_id::text)));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.gate_status(uuid, uuid, uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.gate_status(uuid, uuid, uuid, int) TO eye_app, eye_commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §G9 THE RE-DECLARATIONS (this part alone): versions_immutable (0042:69), live_approvals (0042:118), live_approvals_as_of (0049:257),
-- record_approval (0042:164), propose_version (0049:168), withdraw_package (0078:658), evaluate_conditions (0045:74), commit_package
-- (0086:2238) — each its latest body copied whole, the B34 lines marked.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION decision.versions_immutable() RETURNS trigger
SET search_path = decision, pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'decision package versions are append-only: DELETE prohibited' USING ERRCODE = '2F002';
  END IF;
  IF OLD.state <> 'draft' THEN
    IF NEW.known_at <> OLD.known_at OR NEW.observed_through IS DISTINCT FROM OLD.observed_through
       OR NEW.objectives <> OLD.objectives OR NEW.constraints <> OLD.constraints OR NEW.approver_policy <> OLD.approver_policy
       OR NEW.monitoring_conditions <> OLD.monitoring_conditions OR NEW.choice IS DISTINCT FROM OLD.choice
       OR NEW.reversibility IS DISTINCT FROM OLD.reversibility OR NEW.information_value IS DISTINCT FROM OLD.information_value
       OR NEW.second_order <> OLD.second_order OR NEW.risks <> OLD.risks OR NEW.opportunities <> OLD.opportunities
       OR NEW.baseline_run_id IS DISTINCT FROM OLD.baseline_run_id OR NEW.version_digest IS DISTINCT FROM OLD.version_digest
       OR NEW.header_digest IS DISTINCT FROM OLD.header_digest OR NEW.synthetic_state <> OLD.synthetic_state OR NEW.controls <> OLD.controls
       OR NEW.author_principal_id <> OLD.author_principal_id OR NEW.proposed_by IS DISTINCT FROM OLD.proposed_by
       OR NEW.proposed_at IS DISTINCT FROM OLD.proposed_at OR NEW.supersedes IS DISTINCT FROM OLD.supersedes THEN
      RAISE EXCEPTION 'version % of package % is proposed and immutable; a different choice is a new version', OLD.version, OLD.package_id
        USING ERRCODE = '2F002';
    END IF;
    IF NEW.state <> OLD.state AND NOT (
         (OLD.state = 'proposed' AND NEW.state IN ('under_review', 'approved', 'rejected', 'superseded'))
      OR (OLD.state = 'under_review' AND NEW.state IN ('approved', 'rejected', 'superseded'))
      OR (OLD.state = 'approved' AND NEW.state IN ('committed', 'rejected', 'superseded', 'under_review'))
      /* B34 (0090) gates: the defer and the request for information, and the resume (OBJ-35); an EMERGENCY override's quorum shortfall
         commits a proposed or reviewed version (commit_package checks the cover) */
      OR (OLD.state IN ('proposed', 'under_review', 'approved') AND NEW.state IN ('deferred', 'information_requested'))
      OR (OLD.state IN ('deferred', 'information_requested') AND NEW.state IN ('proposed', 'under_review', 'approved', 'rejected', 'superseded'))
      OR (OLD.state IN ('proposed', 'under_review') AND NEW.state = 'committed'
          AND EXISTS (SELECT 1 FROM decision.gate_overrides o WHERE o.package_id = OLD.package_id AND o.version = OLD.version AND o.kind = 'emergency'
                        AND o.quorum_shortfall > 0 AND o.expires_at > clock_timestamp() AND o.version_digest = OLD.version_digest))) THEN
      RAISE EXCEPTION 'version % of package %: % → % is not a workflow transition', OLD.version, OLD.package_id, OLD.state, NEW.state
        USING ERRCODE = '2F002';
    END IF;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
/* Live approvals of a version: distinct eligible humans, approve, not revoked, not expired, of THIS digest. */
CREATE OR REPLACE FUNCTION decision.live_approvals(p_package_id uuid, p_version int) RETURNS TABLE (approval_id uuid, approver_principal_id uuid)
STABLE SET search_path = decision, pg_catalog, pg_temp AS $$
  SELECT DISTINCT ON (a.approver_principal_id) a.approval_id, a.approver_principal_id
    FROM decision.approvals a JOIN decision.package_versions v ON v.package_id = a.package_id AND v.version = a.version
   WHERE a.package_id = p_package_id AND a.version = p_version AND a.decision = 'approve' AND a.revoked_at IS NULL
     AND a.expires_at > clock_timestamp() AND a.version_digest = v.version_digest
     /* B34 (0090) gates: an approval made under a DELEGATION counts while the delegation lives and its delegator is eligible */
     AND CASE WHEN a.eligible_by LIKE 'delegation:%' THEN decision.delegation_standing_as_of(a.eligible_by, a.approver_principal_id, a.tenant_id, a.domain_id, v.approver_policy, clock_timestamp())
              ELSE decision.approver_eligibility(a.approver_principal_id, a.tenant_id, a.domain_id, v.approver_policy) IS NOT NULL END
   ORDER BY a.approver_principal_id, a.recorded_at;
$$ LANGUAGE sql;
GRANT EXECUTE ON FUNCTION decision.live_approvals(uuid, int) TO eye_app, eye_commit;

/* The approvals of a version that STOOD at an instant: recorded by then, approve, not revoked by then, not expired by then, of the version's digest, by an approver eligible then. */
CREATE OR REPLACE FUNCTION decision.live_approvals_as_of(p_package_id uuid, p_version int, p_at timestamptz)
RETURNS TABLE (approval_id uuid, approver_principal_id uuid, expires_at timestamptz, eligible_by text)
STABLE SET search_path = decision, pg_catalog, pg_temp AS $$
  SELECT DISTINCT ON (a.approver_principal_id) a.approval_id, a.approver_principal_id, a.expires_at,
         CASE WHEN a.eligible_by LIKE 'delegation:%' THEN a.eligible_by ELSE decision.approver_eligibility_as_of(a.approver_principal_id, a.tenant_id, a.domain_id, v.approver_policy, p_at) END
    FROM decision.approvals a JOIN decision.package_versions v ON v.package_id = a.package_id AND v.version = a.version
   WHERE a.package_id = p_package_id AND a.version = p_version AND a.decision = 'approve' AND a.recorded_at <= p_at
     AND (a.revoked_at IS NULL OR a.revoked_at > p_at) AND a.expires_at > p_at AND a.version_digest = v.version_digest
     /* B34 (0090) gates: a delegated approval stood while its delegation lived and its delegator was eligible */
     AND CASE WHEN a.eligible_by LIKE 'delegation:%' THEN decision.delegation_standing_as_of(a.eligible_by, a.approver_principal_id, a.tenant_id, a.domain_id, v.approver_policy, p_at)
              ELSE decision.approver_eligibility_as_of(a.approver_principal_id, a.tenant_id, a.domain_id, v.approver_policy, p_at) IS NOT NULL END
   ORDER BY a.approver_principal_id, a.recorded_at;
$$ LANGUAGE sql;
GRANT EXECUTE ON FUNCTION decision.live_approvals_as_of(uuid, int, timestamptz) TO eye_app, eye_commit;
CREATE OR REPLACE FUNCTION decision.record_approval(
  p_approval_id uuid, p_tenant uuid, p_domain uuid, p_package_id uuid, p_version int, p_approver uuid, p_decision text, p_version_digest text,
  p_rationale text, p_conditions jsonb, p_header_digest text, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v record; p record; v_elig text; v_quorum int; v_live int; v_expires timestamptz; v_state text;
        v_conds jsonb; v_deleg decision.approval_delegations%ROWTYPE; /* B34 (0090) gates */
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.approve']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_approver IS DISTINCT FROM public.eye_principal() THEN
    RAISE EXCEPTION 'approval rejected: an approval is recorded by the approving principal, never on behalf of another' USING ERRCODE = '42501';
  END IF;
  IF NOT decision.is_active_human(p_approver, p_tenant) THEN RAISE EXCEPTION 'approval rejected: only a named, active human principal approves' USING ERRCODE = '42501'; END IF;
  IF p_decision NOT IN ('approve', 'reject') THEN RAISE EXCEPTION 'approval rejected: decision is approve or reject' USING ERRCODE = '22023'; END IF;
  SELECT * INTO v FROM decision.package_versions x WHERE x.package_id = p_package_id AND x.version = p_version AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'approval rejected: no such package version in this domain' USING ERRCODE = '23503'; END IF;
  IF v.state NOT IN ('proposed', 'under_review', 'approved') THEN
    RAISE EXCEPTION 'approval rejected: version % is %; only a proposed version is approved', p_version, v.state USING ERRCODE = '22023';
  END IF;
  SELECT * INTO p FROM decision.packages_current x WHERE x.package_id = p_package_id;
  IF p_version_digest IS DISTINCT FROM v.version_digest THEN
    RAISE EXCEPTION 'approval rejected: the digest approved (%) is not the digest of version % (%); an approval signs what was read', p_version_digest, p_version, v.version_digest USING ERRCODE = '22023';
  END IF;
  IF p_approver = v.author_principal_id OR p_approver = v.proposed_by OR p_approver = p.owner_principal_id OR p_approver::text = (v.choice ->> 'action_owner') THEN
    RAISE EXCEPTION 'approval rejected: self-approval is forbidden — the author, proposer, owner and action owner of a version cannot approve it' USING ERRCODE = '42501';
  END IF;
  /* B34 (0090) gates: the TYPED conditions validated (a plain string stays a note); a board decision reserved (PER-01) */
  v_conds := decision.validate_approval_conditions(p_tenant, p_domain, coalesce(p_conditions, '[]'::jsonb));
  v_elig := decision.approver_eligibility(p_approver, p_tenant, p_domain, v.approver_policy);
  /* B34 (0090) gates: the DELEGATE of an eligible approver approves under `delegation:<id>` while the delegation lives (never a board's) */
  IF v_elig IS NULL THEN
    SELECT * INTO v_deleg FROM decision.approval_delegations d
     WHERE d.package_id = p_package_id AND d.delegate_principal_id = p_approver AND d.ended_at IS NULL AND d.starts_at <= clock_timestamp() AND d.expires_at > clock_timestamp()
       AND decision.approver_eligibility(d.delegator_principal_id, p_tenant, p_domain, v.approver_policy) IS NOT NULL
     ORDER BY d.created_at LIMIT 1;
    IF FOUND THEN
      IF p.decision_class = 'board' THEN RAISE EXCEPTION 'approval rejected (board): a board decision''s approval is never delegated' USING ERRCODE = '42501'; END IF;
      IF EXISTS (SELECT 1 FROM decision.approvals a WHERE a.package_id = p_package_id AND a.version = p_version AND a.approver_principal_id = v_deleg.delegator_principal_id AND a.revoked_at IS NULL) THEN
        RAISE EXCEPTION 'approval rejected (delegation): the delegator % already has a live record on version %; one authority signs once', v_deleg.delegator_principal_id, p_version USING ERRCODE = '22023';
      END IF;
      v_elig := 'delegation:' || v_deleg.delegation_id::text;
    END IF;
  ELSIF EXISTS (SELECT 1 FROM decision.approvals a WHERE a.package_id = p_package_id AND a.version = p_version AND a.revoked_at IS NULL AND a.eligible_by LIKE 'delegation:%'
                  AND EXISTS (SELECT 1 FROM decision.approval_delegations d WHERE d.delegation_id = substr(a.eligible_by, 12)::uuid AND d.delegator_principal_id = p_approver)) THEN
    RAISE EXCEPTION 'approval rejected (delegation): your delegate already signed version % on your behalf; one authority signs once', p_version USING ERRCODE = '22023';
  END IF;
  /* end B34 gates */
  IF v_elig IS NULL THEN RAISE EXCEPTION 'approval rejected: principal % is not an eligible approver under this version''s policy', p_approver USING ERRCODE = '42501'; END IF;
  IF EXISTS (SELECT 1 FROM decision.approvals a WHERE a.package_id = p_package_id AND a.version = p_version AND a.approver_principal_id = p_approver AND a.revoked_at IS NULL) THEN
    RAISE EXCEPTION 'approval rejected: this approver already has a live record on version %; revoke it first', p_version USING ERRCODE = '22023';
  END IF;
  v_expires := clock_timestamp() + make_interval(days => coalesce((v.approver_policy ->> 'expires_after_days')::int, 14));
  INSERT INTO decision.approvals (approval_id, scope, tenant_id, domain_id, package_id, version, approver_principal_id, decision, version_digest, rationale, conditions, eligible_by, expires_at, header_digest, correlation_id)
  VALUES (p_approval_id, 'DOMAIN', p_tenant, p_domain, p_package_id, p_version, p_approver, p_decision, p_version_digest, p_rationale, v_conds, v_elig, v_expires, p_header_digest, p_correlation);
  INSERT INTO decision.package_events (event_id, scope, tenant_id, domain_id, package_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_package_id, 'review.recorded', p_approver,
          jsonb_build_object('version', p_version, 'approval_id', p_approval_id, 'decision', p_decision, 'version_digest', p_version_digest, 'eligible_by', v_elig, 'expires_at', v_expires), p_correlation);
  v_quorum := (v.approver_policy ->> 'quorum')::int;
  IF p_decision = 'reject' THEN
    UPDATE decision.package_versions SET state = 'rejected' WHERE package_id = p_package_id AND version = p_version;
    UPDATE decision.packages_current SET state = 'rejected' WHERE package_id = p_package_id;
    INSERT INTO decision.package_events (event_id, scope, tenant_id, domain_id, package_id, event, actor_principal_id, details, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_package_id, 'version.rejected', p_approver, jsonb_build_object('version', p_version, 'approval_id', p_approval_id), p_correlation);
    /* B34 (0090) gates: the version's gate tasks end with it */
    PERFORM executive._cancel_human_tasks(p_tenant, p_domain, decision.gate_subject(p_package_id, p_version), ARRAY['gate.approve', 'gate.review', 'gate.ready_review'],
                                          'the version was rejected by an approver', p_approver, p_correlation);
    RETURN jsonb_build_object('state', 'rejected', 'live_approvals', 0, 'quorum', v_quorum, 'expires_at', v_expires, 'eligible_by', v_elig);
  END IF;
  SELECT count(*) INTO v_live FROM decision.live_approvals(p_package_id, p_version);
  IF v_live >= v_quorum THEN v_state := 'approved'; ELSE v_state := 'under_review'; END IF;
  IF v.state <> v_state THEN
    UPDATE decision.package_versions SET state = v_state WHERE package_id = p_package_id AND version = p_version;
    UPDATE decision.packages_current SET state = v_state WHERE package_id = p_package_id;
    IF v_state = 'approved' THEN
      INSERT INTO decision.package_events (event_id, scope, tenant_id, domain_id, package_id, event, actor_principal_id, details, correlation_id)
      VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_package_id, 'version.approved', p_approver,
              jsonb_build_object('version', p_version, 'quorum', v_quorum, 'live_approvals', v_live, 'approvals', (SELECT coalesce(jsonb_agg(approval_id), '[]'::jsonb) FROM decision.live_approvals(p_package_id, p_version))), p_correlation);
    END IF;
  END IF;
  /* B34 (0090) gates: the approval resolves the delegate's task; the quorum resolves the version's gate.approve task */
  IF v_elig LIKE 'delegation:%' THEN
    PERFORM executive._resolve_human_tasks(p_tenant, p_domain, jsonb_build_object('delegation_id', substr(v_elig, 12)::uuid), ARRAY['gate.delegated_approval'], 'approved', p_approval_id, p_approver, p_correlation);
  END IF;
  IF v_state = 'approved' THEN
    PERFORM executive._resolve_human_tasks(p_tenant, p_domain, decision.gate_subject(p_package_id, p_version), ARRAY['gate.approve'], 'quorum', p_approval_id, p_approver, p_correlation);
  END IF;
  RETURN jsonb_build_object('state', v_state, 'live_approvals', v_live, 'quorum', v_quorum, 'expires_at', v_expires, 'eligible_by', v_elig);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.record_approval(uuid,uuid,uuid,uuid,int,uuid,text,text,text,jsonb,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.record_approval(uuid,uuid,uuid,uuid,int,uuid,text,text,text,jsonb,text,uuid,uuid) TO eye_commit;
/* The proposal revalidates every option under the version's cut-offs before the digest is computed: no write path escapes the derivation. */
CREATE OR REPLACE FUNCTION decision.propose_version(
  p_package_id uuid, p_tenant uuid, p_domain uuid, p_version int, p_expected_digest text, p_header_digest text, p_baseline_run uuid,
  p_synthetic boolean, p_controls jsonb, p_dependencies jsonb, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, graph, simulation, twin, objects, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v record; v_digest text; v_options int; v_status_quo int; v_bad int; v_baselines int; d jsonb; v_dec uuid; opt record;
        v_sup int; v_class text; v_due timestamptz; /* B34 (0090) gates */
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.package.propose']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT * INTO v FROM decision.package_versions x WHERE x.package_id = p_package_id AND x.version = p_version AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND OR v.state <> 'draft' THEN RAISE EXCEPTION 'proposal rejected: version % of package % is not an open draft in this domain', p_version, p_package_id USING ERRCODE = '2F002'; END IF;
  IF jsonb_array_length(v.objectives) = 0 THEN RAISE EXCEPTION 'proposal rejected: a package version names at least one objective' USING ERRCODE = '22023'; END IF;
  SELECT count(*), count(*) FILTER (WHERE kind = 'status_quo') INTO v_options, v_status_quo FROM decision.options o2 WHERE o2.package_id = p_package_id AND o2.version = p_version;
  IF v_options < 2 THEN RAISE EXCEPTION 'proposal rejected: a decision compares at least two options' USING ERRCODE = '22023'; END IF;
  IF v_status_quo <> 1 THEN RAISE EXCEPTION 'proposal rejected: exactly one option is the explicit status quo (do nothing)' USING ERRCODE = '22023'; END IF;
  SELECT count(*) INTO v_bad FROM decision.options o2 WHERE o2.package_id = p_package_id AND o2.version = p_version AND o2.uncertainty = '{}'::jsonb;
  IF v_bad > 0 THEN RAISE EXCEPTION 'proposal rejected: % option(s) carry no uncertainty block', v_bad USING ERRCODE = '22023'; END IF;
  -- every option, whatever wrote it, must enter THIS version's cut-offs
  FOR opt IN SELECT * FROM decision.options x WHERE x.package_id = p_package_id AND x.version = p_version ORDER BY x.key LOOP
    PERFORM decision.derive_option(p_tenant, p_domain, v.known_at, v.observed_through, opt.consequences, opt.unsimulated_reason, format('proposal rejected: option %s', opt.key));
  END LOOP;
  IF v.choice IS NULL THEN RAISE EXCEPTION 'proposal rejected: the choice — option, rationale, deadline, trade-offs, action owner, outcome criteria — is what is proposed; it is missing' USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM decision.options o2 WHERE o2.package_id = p_package_id AND o2.version = p_version AND o2.key = (v.choice ->> 'option_key')) THEN
    RAISE EXCEPTION 'proposal rejected: the chosen option % is not among this version''s options', v.choice ->> 'option_key' USING ERRCODE = '22023';
  END IF;
  IF v.approver_policy = '{}'::jsonb THEN RAISE EXCEPTION 'proposal rejected: the approver policy is missing' USING ERRCODE = '22023'; END IF;
  IF coalesce(jsonb_array_length(v.approver_policy -> 'roles'), 0) = 0
     AND (SELECT count(*) FROM jsonb_array_elements_text(coalesce(v.approver_policy -> 'principals', '[]'::jsonb)) a WHERE a::uuid <> v.author_principal_id) = 0 THEN
    RAISE EXCEPTION 'proposal rejected: the author cannot be the only approver named by the policy' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(v.monitoring_conditions) = 0 THEN RAISE EXCEPTION 'proposal rejected: a committed decision is watched — at least one monitoring condition is required' USING ERRCODE = '22023'; END IF;
  SELECT count(DISTINCT coalesce(r.control_run_id, r.run_id)) INTO v_baselines
    FROM decision.options o2, jsonb_array_elements(o2.consequences) c
    JOIN simulation.runs_current r ON r.run_id = (c ->> 'id')::uuid
   WHERE o2.package_id = p_package_id AND o2.version = p_version AND (c ->> 'kind') = 'run';
  IF v_baselines > 1 THEN RAISE EXCEPTION 'proposal rejected: the options'' simulated consequences rest on % different baselines; one control run is the common baseline', v_baselines USING ERRCODE = '22023'; END IF;
  IF v_baselines = 1 AND p_baseline_run IS DISTINCT FROM (SELECT coalesce(r.control_run_id, r.run_id) FROM decision.options o2, jsonb_array_elements(o2.consequences) c
      JOIN simulation.runs_current r ON r.run_id = (c ->> 'id')::uuid WHERE o2.package_id = p_package_id AND o2.version = p_version AND (c ->> 'kind') = 'run' LIMIT 1) THEN
    RAISE EXCEPTION 'proposal rejected: the declared baseline is not the control the cited runs rest on' USING ERRCODE = '22023';
  END IF;
  UPDATE decision.package_versions SET baseline_run_id = p_baseline_run WHERE package_id = p_package_id AND version = p_version;
  v_digest := decision.version_digest(p_package_id, p_version);
  IF p_expected_digest IS NULL OR v_digest <> p_expected_digest THEN
    RAISE EXCEPTION 'proposal rejected: the version changed between digesting and proposing (% vs %)', p_expected_digest, v_digest USING ERRCODE = '22023';
  END IF;
  UPDATE decision.package_versions
     SET state = 'proposed', version_digest = v_digest, header_digest = p_header_digest, synthetic_state = coalesce(p_synthetic, false),
         controls = coalesce(p_controls, '{}'::jsonb), proposed_by = p_actor, proposed_at = clock_timestamp()
   WHERE package_id = p_package_id AND version = p_version;
  /* B34 (0090) gates: a deferred or information-requested version is open too — superseded like the others, its gate tasks cancelled */
  FOR v_sup IN UPDATE decision.package_versions SET state = 'superseded'
   WHERE package_id = p_package_id AND version <> p_version AND state IN ('proposed', 'under_review', 'approved', 'deferred', 'information_requested') RETURNING version LOOP
    PERFORM executive._cancel_human_tasks(p_tenant, p_domain, decision.gate_subject(p_package_id, v_sup), ARRAY['gate.approve', 'gate.review', 'gate.ready_review'],
                                          format('version %s was superseded by version %s', v_sup, p_version), p_actor, p_correlation);
  END LOOP;
  /* the version's gate tasks: gate.approve for the approvers the policy admits (due at the policy's gate_deadline_hours, when named; the
     owner the escalation), and gate.ready_review for an independent reviewer when the policy requires decision-ready or the class is board */
  SELECT decision_class INTO v_class FROM decision.packages_current WHERE package_id = p_package_id;
  v_due := CASE WHEN (v.approver_policy ->> 'gate_deadline_hours') ~ '^[0-9]+$' AND (v.approver_policy ->> 'gate_deadline_hours')::int BETWEEN 1 AND 2160
                THEN clock_timestamp() + make_interval(hours => (v.approver_policy ->> 'gate_deadline_hours')::int) END;
  PERFORM executive._open_human_task(gen_random_uuid(), p_tenant, p_domain, 'gate.approve', format('gate.approve:%s:%s:%s', p_package_id, p_version, v_digest),
    decision.gate_subject(p_package_id, p_version), format('Approve or reject version %s (digest %s…)', p_version, left(v_digest, 12)), NULL,
    CASE WHEN coalesce(jsonb_array_length(v.approver_policy -> 'roles'), 0) > 0 THEN ARRAY(SELECT jsonb_array_elements_text(v.approver_policy -> 'roles')) ELSE ARRAY['decision_approver'] END,
    jsonb_build_object('principals', coalesce(v.approver_policy -> 'principals', '[]'::jsonb), 'quorum', v.approver_policy -> 'quorum', 'version_digest', v_digest), v_due,
    jsonb_build_object('principal', (SELECT owner_principal_id FROM decision.packages_current WHERE package_id = p_package_id), 'max_escalations', 1, 'extend_minutes', 1440),
    NULL, 'approve', p_actor, p_correlation);
  IF v_class = 'board' OR (v.approver_policy ->> 'requires_ready') = 'true' THEN
    PERFORM executive._open_human_task(gen_random_uuid(), p_tenant, p_domain, 'gate.ready_review', format('gate.ready_review:%s:%s:%s', p_package_id, p_version, v_digest),
      decision.gate_subject(p_package_id, p_version), format('Independent review: mark version %s decision-ready', p_version), NULL,
      ARRAY['decision_approver', 'decision_authority', 'executive', 'domain_analyst'], jsonb_build_object('independent', true), v_due, '{}'::jsonb, NULL, 'ready', p_actor, p_correlation);
  END IF;
  /* end B34 gates */
  UPDATE decision.packages_current
     SET state = 'proposed', current_version = p_version, synthetic_state = synthetic_state OR coalesce(p_synthetic, false), controls = coalesce(p_controls, controls)
   WHERE package_id = p_package_id;
  SELECT decision_object_id INTO v_dec FROM decision.packages_current WHERE package_id = p_package_id;
  FOR d IN SELECT * FROM jsonb_array_elements(coalesce(p_dependencies, '[]'::jsonb)) LOOP
    INSERT INTO graph.dependencies (dependency_id, scope, tenant_id, domain_id, dependent_object_id, dependent_type, depends_on_kind, depends_on_id, rationale, state, created_by, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, v_dec, 'DEC', d ->> 'kind', (d ->> 'id')::uuid,
            format('decision package %s version %s option %s cites it', p_package_id, p_version, d ->> 'key'), 'active', p_actor, p_correlation)
    ON CONFLICT DO NOTHING;
  END LOOP;
  INSERT INTO decision.package_events (event_id, scope, tenant_id, domain_id, package_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_package_id, 'version.proposed', p_actor,
          jsonb_build_object('version', p_version, 'version_digest', v_digest, 'header_digest', p_header_digest, 'choice', v.choice, 'baseline_run_id', p_baseline_run, 'synthetic_state', coalesce(p_synthetic, false), 'options_revalidated', true), p_correlation);
  RETURN jsonb_build_object('version_digest', v_digest, 'baseline_run_id', p_baseline_run);
END $$ LANGUAGE plpgsql;
-- withdraw_package: 0041's body with one refusal — a package whose commitment stands (reopened, or reopened and proposed, under review,
-- approved or rejected since) is re-committed, not withdrawn: a withdrawn package over a standing commitment would be the lie D5 forbids.
CREATE OR REPLACE FUNCTION decision.withdraw_package(
  p_package_id uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS void
SECURITY DEFINER SET search_path = decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_state text; v_committed int;
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.package.withdraw']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT state, committed_version INTO v_state, v_committed FROM decision.packages_current WHERE package_id = p_package_id AND tenant_id = p_tenant AND domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'withdrawal rejected: no such package in this domain' USING ERRCODE = '23503'; END IF;
  IF v_state IN ('committed', 'monitoring', 'closed') THEN RAISE EXCEPTION 'withdrawal rejected: a committed decision is not withdrawn; it is closed with its outcome' USING ERRCODE = '22023'; END IF;
  IF v_state = 'reopened' OR v_committed IS NOT NULL THEN
    RAISE EXCEPTION 'withdrawal rejected: package % was committed at version % and the commitment stands; a reopened decision is re-committed, not withdrawn', p_package_id, v_committed USING ERRCODE = '22023';
  END IF;
  /* B34 (0090) gates: a deferred or information-requested version is superseded too; every open gate task of the package is cancelled */
  UPDATE decision.package_versions SET state = 'superseded' WHERE package_id = p_package_id AND state IN ('proposed', 'under_review', 'approved', 'deferred', 'information_requested');
  PERFORM executive._cancel_human_tasks(p_tenant, p_domain, jsonb_build_object('id', p_package_id), ARRAY['gate.approve', 'gate.review', 'gate.ready_review', 'gate.delegated_approval'],
                                        'the package was withdrawn: ' || coalesce(p_reason, ''), p_actor, p_correlation);
  UPDATE decision.packages_current SET state = 'withdrawn' WHERE package_id = p_package_id;
  INSERT INTO decision.package_events (event_id, scope, tenant_id, domain_id, package_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_package_id, 'package.withdrawn', p_actor, jsonb_build_object('reason', p_reason), p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.withdraw_package(uuid,uuid,uuid,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.withdraw_package(uuid,uuid,uuid,text,uuid,uuid,uuid) TO eye_commit;
-- ============================================================
/* Evaluate the committed version's conditions against what was recorded after the decision. Idempotent: a breach is recorded once. */
CREATE OR REPLACE FUNCTION decision.evaluate_conditions(
  p_tenant uuid, p_domain uuid, p_package_id uuid, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, executive, prediction, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE p record; v record; r record; cond record; w record; v_new int := 0; v_overdue boolean := false; v_room_overdue boolean := false; v_breaches jsonb;
        v_ac jsonb; v_e jsonb; v_prev boolean; v_ac_new int := 0; /* B34 (0090) gates */
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.monitor']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT * INTO p FROM decision.packages_current x WHERE x.package_id = p_package_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'monitoring rejected: no such package in this domain' USING ERRCODE = '23503'; END IF;
  IF p.committed_version IS NULL THEN RAISE EXCEPTION 'monitoring rejected: package is %; conditions are watched after commitment', p.state USING ERRCODE = '22023'; END IF;
  SELECT * INTO v FROM decision.package_versions x WHERE x.package_id = p_package_id AND x.version = p.committed_version;
  SELECT * INTO r FROM executive.rooms_current x WHERE x.package_id = p_package_id;
  FOR cond IN SELECT value AS c, (ordinality - 1)::int AS idx FROM jsonb_array_elements(v.monitoring_conditions) WITH ORDINALITY LOOP
    IF (cond.c ->> 'kind') IN ('indicator', 'warning') THEN
      FOR w IN SELECT * FROM prediction.warnings_current x
                WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.raised_at > p.decided_at
                  AND ((cond.c ->> 'kind') = 'indicator' AND x.indicator_id = (cond.c ->> 'indicator_id')::uuid
                    OR (cond.c ->> 'kind') = 'warning' AND x.branch_id = (cond.c ->> 'branch_id')::uuid)
                ORDER BY x.raised_at LOOP
        IF NOT EXISTS (SELECT 1 FROM decision.condition_breaches b WHERE b.package_id = p_package_id AND b.version = v.version AND b.condition_index = cond.idx AND b.warning_id = w.warning_id) THEN
          INSERT INTO decision.condition_breaches (breach_id, scope, tenant_id, domain_id, package_id, version, condition_index, condition, warning_id, routed_to, response_window_closes_at, correlation_id)
          VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_package_id, v.version, cond.idx, cond.c, w.warning_id, (cond.c ->> 'owner')::uuid, w.response_window_closes_at, p_correlation);
          INSERT INTO decision.package_events (event_id, scope, tenant_id, domain_id, package_id, event, actor_principal_id, details, correlation_id)
          VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_package_id, 'condition.breached', p_actor,
                  jsonb_build_object('version', v.version, 'condition_index', cond.idx, 'kind', cond.c ->> 'kind', 'warning_id', w.warning_id, 'warning_title', w.title, 'routed_to', cond.c ->> 'owner',
                                     'response_window_closes_at', w.response_window_closes_at, 'warning_routed_to', w.routed_to), p_correlation);
          IF r.room_id IS NOT NULL THEN
            INSERT INTO executive.room_events (event_id, scope, tenant_id, domain_id, room_id, event, actor_principal_id, details, correlation_id)
            VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, r.room_id, 'condition.breached', p_actor,
                    jsonb_build_object('package_id', p_package_id, 'condition_index', cond.idx, 'warning_id', w.warning_id, 'warning_title', w.title, 'routed_to', cond.c ->> 'owner', 'response_window_closes_at', w.response_window_closes_at), p_correlation);
          END IF;
          v_new := v_new + 1;
        END IF;
      END LOOP;
    ELSIF (cond.c ->> 'kind') = 'review' AND r.room_id IS NOT NULL THEN
      IF r.next_review_at < clock_timestamp() THEN
        v_overdue := true;
        IF NOT EXISTS (SELECT 1 FROM decision.package_events e WHERE e.package_id = p_package_id AND e.event = 'review.overdue' AND (e.details ->> 'next_review_at')::timestamptz = r.next_review_at) THEN
          INSERT INTO decision.package_events (event_id, scope, tenant_id, domain_id, package_id, event, actor_principal_id, details, correlation_id)
          VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_package_id, 'review.overdue', p_actor,
                  jsonb_build_object('version', v.version, 'condition_index', cond.idx, 'room_id', r.room_id, 'next_review_at', r.next_review_at, 'routed_to', cond.c ->> 'owner'), p_correlation);
          INSERT INTO executive.room_events (event_id, scope, tenant_id, domain_id, room_id, event, actor_principal_id, details, correlation_id)
          VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, r.room_id, 'review.overdue', p_actor, jsonb_build_object('package_id', p_package_id, 'next_review_at', r.next_review_at, 'routed_to', cond.c ->> 'owner'), p_correlation);
          v_room_overdue := true;
        END IF;
      END IF;
    END IF;
  END LOOP;
  /* B34 (0090) gates: the approvals' MONITOR-stage conditions, evaluated on every pass (the ledger), a condition that newly fails recorded
     once as approval_condition.failed (routed to the package owner and the approver who set it) until it holds again */
  v_ac := decision.approval_conditions_status(p_tenant, p_domain, p_package_id, v.version, 'monitor');
  FOR v_e IN SELECT value FROM jsonb_array_elements(v_ac -> 'conditions') LOOP
    SELECT e.holds INTO v_prev FROM decision.approval_condition_evaluations e
     WHERE e.package_id = p_package_id AND e.version = v.version AND e.approval_id = (v_e ->> 'approval_id')::uuid AND e.condition_index = (v_e ->> 'condition_index')::int AND e.stage = 'monitor'
     ORDER BY e.evaluated_at DESC, e.evaluation_id DESC LIMIT 1;
    IF NOT (v_e ->> 'holds')::boolean AND (v_e ->> 'waived_by') IS NULL AND coalesce(v_prev, true) THEN
      INSERT INTO decision.package_events (event_id, scope, tenant_id, domain_id, package_id, event, actor_principal_id, details, correlation_id)
      VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_package_id, 'approval_condition.failed', p_actor,
              jsonb_build_object('version', v.version, 'approval_id', v_e ->> 'approval_id', 'condition_index', (v_e ->> 'condition_index')::int, 'kind', v_e ->> 'kind', 'ref', v_e ->> 'ref',
                                 'expected', v_e ->> 'expected', 'label', v_e ->> 'label', 'observed', v_e -> 'observed', 'routed_to', jsonb_build_array(p.owner_principal_id, v_e ->> 'approver')), p_correlation);
      v_ac_new := v_ac_new + 1;
    END IF;
    v_prev := NULL;
  END LOOP;
  PERFORM decision._record_condition_evaluations(p_tenant, p_domain, p_package_id, v.version, 'monitor', v_ac, p_actor, p_correlation);
  IF p.state = 'committed' AND v_ac_new > 0 THEN UPDATE decision.packages_current SET state = 'monitoring' WHERE package_id = p_package_id; END IF;
  /* end B34 gates */
  IF p.state = 'committed' AND v_new > 0 THEN UPDATE decision.packages_current SET state = 'monitoring' WHERE package_id = p_package_id; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('breach_id', b.breach_id, 'condition_index', b.condition_index, 'kind', b.condition ->> 'kind', 'warning_id', b.warning_id, 'routed_to', b.routed_to,
                                               'response_window_closes_at', b.response_window_closes_at, 'detected_at', b.detected_at) ORDER BY b.detected_at, b.condition_index), '[]'::jsonb)
    INTO v_breaches FROM decision.condition_breaches b WHERE b.package_id = p_package_id AND b.version = v.version;
  RETURN jsonb_build_object('package_id', p_package_id, 'version', v.version, 'state', (SELECT state FROM decision.packages_current WHERE package_id = p_package_id),
                            'new_breaches', v_new, 'breaches', v_breaches, 'review_overdue', v_overdue, 'review_overdue_recorded_now', v_room_overdue,
                            'next_review_at', r.next_review_at,
                            /* B34 (0090) gates */ 'approval_conditions', v_ac -> 'conditions', 'approval_conditions_failed_now', v_ac_new);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.evaluate_conditions(uuid,uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.evaluate_conditions(uuid,uuid,uuid,uuid,uuid) TO eye_commit;
-- commit_package: 0086 §M4's body (copied whole) with the B34 gate: the signature gains p_preview_digest (the commit CARRIES the digest of
-- the consequence preview its committer recorded within 30 minutes — HX-13; the 12-argument port is DROPPED, so nothing commits without
-- it); a live EMERGENCY override's quorum shortfall counts (a proposed or reviewed version then commits); a board decision counts at least
-- the board's quorum; after the markers' block: the override's grantor never commits (override_self), a board decision or a policy with
-- requires_ready needs a FRESH decision-ready (not_ready), a failing commit-stage condition refuses (conditions_hold — the route records
-- commit.held BEFORE it tries, through decision.hold_check), and the preview (no_preview). The insert into decision.commitments keeps its
-- shape (the commitments part's tracker hangs off its AFTER INSERT trigger).
DROP FUNCTION decision.commit_package(uuid,uuid,uuid,uuid,int,uuid,text,text,text,text,uuid,uuid);
CREATE OR REPLACE FUNCTION decision.commit_package(
  p_commitment_id uuid, p_tenant uuid, p_domain uuid, p_package_id uuid, p_version int, p_committer uuid, p_version_digest text, p_header_digest text,
  p_title text, p_statement text, p_event_id uuid, p_correlation uuid, p_preview_digest text
) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, graph, simulation, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE p record; v record; v_quorum int; v_live int; v_approvals jsonb; v_dec uuid; c jsonb; v_now timestamptz := clock_timestamp();
        v_si_unack int; v_si_list text; /* B24 (0086) markers */
        v_cover int := 0; v_overrides jsonb; v_cs jsonb; v_ready record; v_ip jsonb; v_preview uuid; /* B34 (0090) gates */
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.commit']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF public.eye_op_class() IS DISTINCT FROM 'C3' THEN
    RAISE EXCEPTION 'commitment rejected: decision.commit requires a C3 authority context; this context is %', coalesce(public.eye_op_class(), 'unclassed') USING ERRCODE = '42501';
  END IF;
  IF public.eye_bound_action() IS DISTINCT FROM 'decision.commit' THEN
    RAISE EXCEPTION 'commitment rejected: the context is bound to %, not decision.commit', public.eye_bound_action() USING ERRCODE = '42501';
  END IF;
  IF p_committer IS DISTINCT FROM public.eye_principal() THEN
    RAISE EXCEPTION 'commitment rejected: a commitment is made by the acting principal, never on behalf of another' USING ERRCODE = '42501';
  END IF;
  IF NOT decision.is_active_human(p_committer, p_tenant) THEN RAISE EXCEPTION 'commitment rejected: only a named, active human principal commits' USING ERRCODE = '42501'; END IF;
  IF NOT decision.holds_role(p_committer, p_tenant, p_domain, 'decision_authority') THEN
    RAISE EXCEPTION 'commitment rejected: principal % does not hold decision_authority at this scope', p_committer USING ERRCODE = '42501';
  END IF;
  SELECT * INTO p FROM decision.packages_current x WHERE x.package_id = p_package_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'commitment rejected: no such package in this domain' USING ERRCODE = '23503'; END IF;
  IF p.committed_version IS NOT NULL AND p.state IN ('committed', 'monitoring', 'closed') THEN
    RAISE EXCEPTION 'commitment rejected: package is already committed at version % and the commitment stands; a committed decision is reopened (decision.package.reopen), never re-committed over', p.committed_version USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v FROM decision.package_versions x WHERE x.package_id = p_package_id AND x.version = p_version FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'commitment rejected: no such version' USING ERRCODE = '23503'; END IF;
  /* B34 (0090) gates: the live overrides of this version (of its digest); an EMERGENCY override's quorum shortfall is the cover */
  SELECT coalesce(max(o.quorum_shortfall) FILTER (WHERE o.kind = 'emergency'), 0), coalesce(jsonb_agg(jsonb_build_object('override_id', o.override_id, 'kind', o.kind, 'granted_by', o.granted_by) ORDER BY o.granted_at), '[]'::jsonb)
    INTO v_cover, v_overrides FROM decision.gate_overrides o
   WHERE o.package_id = p_package_id AND o.version = p_version AND o.expires_at > v_now AND o.version_digest = v.version_digest;
  IF p.decision_class = 'board' THEN v_cover := 0; END IF;
  IF v.state <> 'approved' AND NOT (v.state IN ('proposed', 'under_review') AND v_cover > 0) THEN RAISE EXCEPTION 'commitment rejected: version % is %, not approved', p_version, v.state USING ERRCODE = '22023'; END IF;
  IF p_version_digest IS DISTINCT FROM v.version_digest THEN
    RAISE EXCEPTION 'commitment rejected: the digest committed (%) is not the digest of version % (%)', p_version_digest, p_version, v.version_digest USING ERRCODE = '22023';
  END IF;
  v_quorum := (v.approver_policy ->> 'quorum')::int;
  SELECT count(*), coalesce(jsonb_agg(jsonb_build_object('approval_id', approval_id, 'approver', approver_principal_id)), '[]'::jsonb)
    INTO v_live, v_approvals FROM decision.live_approvals(p_package_id, p_version);
  IF v_live + v_cover < v_quorum THEN
    RAISE EXCEPTION 'commitment rejected: quorum is % distinct eligible humans; % live approval(s) stand now (expired, revoked or re-digested approvals do not count)', v_quorum, v_live USING ERRCODE = '42501';
  END IF;
  /* B34 (0090) gates: a board decision counts at least the board's quorum, never covered by an override */
  IF p.decision_class = 'board' AND v_live < greatest(v_quorum, coalesce((p.board ->> 'quorum')::int, 2)) THEN
    RAISE EXCEPTION 'commitment rejected (board_quorum): a board decision needs % live approvals of the board; % stand now', greatest(v_quorum, coalesce((p.board ->> 'quorum')::int, 2)), v_live USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM decision.live_approvals(p_package_id, p_version) la WHERE la.approver_principal_id = p_committer) THEN
    RAISE EXCEPTION 'commitment rejected: the committing authority cannot be one of the approvers' USING ERRCODE = '42501';
  END IF;
  /* B24 (0086) markers — F-P6-07 (V03-T-077): a commitment does not rest, unacknowledged, on a source whose health is degraded, failed,
     suspended or unknown. Every ACTIVE source-impact marker on the package or on what THIS version cites (its options' forecasts, runs and
     warnings; its baseline run) must carry an acknowledgement recorded for THIS version by a decision authority
     (decision.acknowledge_source_impact, package event source_impact.acknowledged); a new version needs its own. */
  SELECT count(*), string_agg(format('%s %s (source %s %s; marker %s)', b.subject_kind, b.subject_id, b.source_id, b.health_state, b.marker_id), '; ' ORDER BY b.subject_kind, b.subject_id, b.marker_id)
    INTO v_si_unack, v_si_list
    FROM decision.source_impact_bearing(p_tenant, p_domain, p_package_id, p_version) b WHERE NOT b.acknowledged;
  IF v_si_unack > 0 THEN
    RAISE EXCEPTION 'commitment rejected (source_impact): % active source-impact marker(s) bear on version % of package % and are not acknowledged for this version — %; a decision authority acknowledges them for this version (decision.source_impact.acknowledge) before the commitment',
      v_si_unack, p_version, p_package_id, v_si_list USING ERRCODE = '22023';
  END IF;
  /* end B24 markers */
  /* B34 (0090) gates — F-P6-04. */
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_overrides) o WHERE (o ->> 'granted_by')::uuid = p_committer) THEN
    RAISE EXCEPTION 'commitment rejected (override_self): the committing authority granted an override on this version; the grantor of an override never commits what it opened' USING ERRCODE = '42501';
  END IF;
  IF p.decision_class = 'board' OR (v.approver_policy ->> 'requires_ready') = 'true' THEN
    SELECT * INTO v_ready FROM decision.gate_actions g WHERE g.package_id = p_package_id AND g.version = p_version AND g.action = 'ready' ORDER BY g.at DESC, g.action_id DESC LIMIT 1;
    v_ip := decision.information_package(p_tenant, p_domain, p_package_id, p_version);
    IF v_ready.action_id IS NULL OR v_ready.information_package_digest IS DISTINCT FROM (v_ip ->> 'digest') THEN
      RAISE EXCEPTION 'commitment rejected (not_ready): %; an independent reviewer marks the version decision-ready on the information package as it stands (decision.gate.ready)',
        CASE WHEN v_ready.action_id IS NULL THEN 'no independent reviewer has marked version ' || p_version || ' decision-ready' ELSE 'the information package changed since it was marked decision-ready' END USING ERRCODE = '22023';
    END IF;
  END IF;
  v_cs := decision.approval_conditions_status(p_tenant, p_domain, p_package_id, p_version, 'commit');
  IF (v_cs ->> 'held')::boolean THEN
    RAISE EXCEPTION 'commitment rejected (conditions_hold): % approval condition(s) do not hold at commitment — %; the commitment is held until they hold or are overridden',
      v_cs ->> 'failed', (SELECT string_agg(format('%s (%s %s)', x ->> 'label', x ->> 'kind', coalesce(x ->> 'ref', x ->> 'expected')), '; ') FROM jsonb_array_elements(v_cs -> 'conditions') x
                           WHERE NOT (x ->> 'holds')::boolean AND (x ->> 'waived_by') IS NULL) USING ERRCODE = '22023';
  END IF;
  SELECT cp.preview_id INTO v_preview FROM decision.commit_previews cp
   WHERE cp.package_id = p_package_id AND cp.version = p_version AND cp.version_digest = v.version_digest AND cp.preview_digest = p_preview_digest
     AND cp.previewed_by = p_committer AND cp.previewed_at > v_now - interval '30 minutes'
   ORDER BY cp.previewed_at DESC LIMIT 1;
  IF v_preview IS NULL THEN
    RAISE EXCEPTION 'commitment rejected (no_preview): the commitment carries the digest of a consequence preview its committer recorded for version % within the last 30 minutes (decision.commit.preview); % is not one', p_version, coalesce(p_preview_digest, '<none>') USING ERRCODE = '22023';
  END IF;
  /* end B34 gates */
  v_dec := p.decision_object_id;
  INSERT INTO graph.strategy_current (strategy_object_id, scope, tenant_id, domain_id, object_type, object_version, title, statement, status, verification_state, parent_objective_id, owner_principal_id, correlation_id)
  VALUES (p_commitment_id, 'DOMAIN', p_tenant, p_domain, 'CMT', 1, p_title, p_statement, 'active', 'not_applicable', NULL, p_committer, p_correlation);
  INSERT INTO graph.strategy_events (event_id, scope, tenant_id, domain_id, strategy_object_id, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_commitment_id, 'strategy.declared', p_committer,
          jsonb_build_object('object_type', 'CMT', 'title', p_title, 'version', 1, 'status', 'active', 'via', 'decision.commit', 'package_id', p_package_id, 'package_version', p_version), p_correlation);
  INSERT INTO graph.dependencies (dependency_id, scope, tenant_id, domain_id, dependent_object_id, dependent_type, depends_on_kind, depends_on_id, rationale, state, created_by, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_commitment_id, 'CMT', 'strategy', v_dec, format('the commitment executes decision %s (package %s v%s)', v_dec, p_package_id, p_version), 'active', p_committer, p_correlation);
  FOR c IN SELECT DISTINCT x FROM decision.options o, jsonb_array_elements(o.consequences) x WHERE o.package_id = p_package_id AND o.version = p_version AND o.key = (v.choice ->> 'option_key') AND (x ->> 'kind') = 'run' LOOP
    INSERT INTO graph.dependencies (dependency_id, scope, tenant_id, domain_id, dependent_object_id, dependent_type, depends_on_kind, depends_on_id, rationale, state, created_by, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_commitment_id, 'CMT', 'run', (c ->> 'id')::uuid, format('the chosen option %s rests on this run', v.choice ->> 'option_key'), 'active', p_committer, p_correlation)
    ON CONFLICT DO NOTHING;
  END LOOP;
  IF v.baseline_run_id IS NOT NULL THEN
    INSERT INTO graph.dependencies (dependency_id, scope, tenant_id, domain_id, dependent_object_id, dependent_type, depends_on_kind, depends_on_id, rationale, state, created_by, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_commitment_id, 'CMT', 'run', v.baseline_run_id, 'the common baseline the options were compared against', 'active', p_committer, p_correlation)
    ON CONFLICT DO NOTHING;
  END IF;
  -- ONE instant is the decision: the commitment, decided_at and the committed event carry it, so a replay's decided layer closes exactly there.
  INSERT INTO decision.commitments (commitment_id, scope, tenant_id, domain_id, package_id, version, committed_by, version_digest, approvals, op_class, bound_action, header_digest, policy_decision_id, committed_at, correlation_id)
  VALUES (p_commitment_id, 'DOMAIN', p_tenant, p_domain, p_package_id, p_version, p_committer, p_version_digest, v_approvals, public.eye_op_class(), public.eye_bound_action(), p_header_digest, public.eye_policy_decision(), v_now, p_correlation);
  UPDATE decision.package_versions SET state = 'committed' WHERE package_id = p_package_id AND version = p_version;
  UPDATE decision.packages_current SET state = 'committed', committed_version = p_version, decided_at = v_now WHERE package_id = p_package_id;
  INSERT INTO decision.package_events (event_id, scope, tenant_id, domain_id, package_id, event, actor_principal_id, details, occurred_at, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_package_id, 'package.committed', p_committer,
          jsonb_build_object('version', p_version, 'commitment_id', p_commitment_id, 'version_digest', p_version_digest, 'approvals', v_approvals, 'op_class', public.eye_op_class(), 'policy_decision_id', public.eye_policy_decision(), 'choice', v.choice,
                             'reopened_from', CASE WHEN p.reopens > 0 THEN jsonb_build_object('version', p.reopened_from_version, 'cause', p.reopen_cause, 'reopens', p.reopens) END)
          /* B34 (0090) gates */ || jsonb_build_object('preview_id', v_preview, 'preview_digest', p_preview_digest, 'overrides', v_overrides, 'decision_class', p.decision_class,
                                                       'conditions_evaluated', jsonb_array_length(v_cs -> 'conditions')), v_now, p_correlation);
  /* B34 (0090) gates: the commit-stage evaluations in the ledger; the version's open gate tasks resolved by the commitment */
  PERFORM decision._record_condition_evaluations(p_tenant, p_domain, p_package_id, p_version, 'commit', v_cs, p_committer, p_correlation);
  PERFORM executive._resolve_human_tasks(p_tenant, p_domain, decision.gate_subject(p_package_id, p_version), ARRAY['gate.approve', 'gate.review', 'gate.ready_review'], 'committed', p_commitment_id, p_committer, p_correlation);
  PERFORM executive._cancel_human_tasks(p_tenant, p_domain, jsonb_build_object('kind', 'decision_package', 'id', p_package_id), ARRAY['gate.delegated_approval'], 'the decision was committed', p_committer, p_correlation);
  RETURN jsonb_build_object('commitment_id', p_commitment_id, 'approvals', v_approvals, 'op_class', public.eye_op_class(), 'decided_at', v_now, 'policy_decision_id', public.eye_policy_decision(),
                            'reopened_from', CASE WHEN p.reopens > 0 THEN jsonb_build_object('version', p.reopened_from_version, 'cause', p.reopen_cause, 'reopens', p.reopens) END,
                            /* B34 (0090) gates */ 'preview_digest', p_preview_digest, 'overrides', v_overrides);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.commit_package(uuid,uuid,uuid,uuid,int,uuid,text,text,text,text,uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.commit_package(uuid,uuid,uuid,uuid,int,uuid,text,text,text,text,uuid,uuid,text) TO eye_commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- section `workflow`
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0090 §W — CP-6 B34 part `workflow` (F-P6-14 "Collaboration, human tasks and durable workflow engine"; V6 IA-41-001/-003/-005, INF-PF-05,
-- RU-06, MS-05/-12, FM-23, SC-09; V8 PR-46-001..006, CAP-EO-09/-10, AT-46, PER-22). Built on the §0 prelude's human-task service core
-- (executive.human_tasks / human_task_assignments / human_task_events / workflow_timers and the internal ports _open_human_task,
-- _resolve_human_tasks, _cancel_human_tasks, _schedule_timer), which this section does not re-declare. What is here:
--   §W1 THE DURABLE WORKFLOW ENGINE — versioned definitions (a digest over the spec; append-only), instances PINNED to a definition's digest
--       with a lease, the append-only transition log (UNIQUE (instance, seq) and (instance, idempotency_key): a duplicate worker's transition
--       answers `repeated`, never a second effect), compensations (a declared compensation recorded and handed to a human to confirm; an
--       undeclared one makes the instance IRRECONCILABLE and escalates it to the definition's named human), the replay (the state refolded
--       from the committed transitions under the pinned definition), and the INTERNAL ports _start_workflow / _workflow_transition
--       (REVOKEd like the prelude's). The engine persists ORCHESTRATION state only: business truth changes through the owning ports.
--   §W2 THE TIMER FIRING — the attention tick's step `workflow-timers` (order 20, TS) claims the due timers with SKIP LOCKED, hands each to
--       the TS WorkflowTimerRegistry by kind and marks it FIRED ONCE (the firing ledger: tick, outcome, drift); a failing handler is recorded
--       and retried by the next tick, abandoned after three attempts. The kinds served here: task.deadline (ESCALATE the task: the assignee
--       → the escalation principal, level + 1, the next deadline by extend_minutes, exhausted after max_escalations), task.reminder,
--       workflow.step_timeout, grant.expiry. Every port a tick step calls lists executive.attention.tick.
--   §W3 THE HUMAN TASKS' ROUTES' PORTS — reassign (to a MEMBER; a gate.* task's stored eligibility re-checked: reassignment moves work,
--       never authority) and complete (REFUSES gate.* and commitment.*: they complete through the owning action).
--   §W4 COLLABORATION — workspaces (subject, purpose, classification ceiling, owner), participants (never room membership, never approver
--       standing: nothing here is read by an approval, a commit or a room), threads and messages (append-only), artifacts (at or below the
--       ceiling; versioned, append-only), review requests (collab.review tasks) and reviews with verdicts.
--   §W5 EXTERNAL COLLABORATORS — invite (a DOMAIN principal of affiliation `external`, role external_collaborator, a grant with the
--       workspace's purpose, an audience ceiling at or below the workspace's, an expiry at most 30 days out; the invitation placed in the
--       SYNTHETIC invitation mailbox — a local sink, never a real channel; a one-time invitation credential), accept (the invitee sets their
--       own password: the credential then EXPIRES WITH THE GRANT), revoke, and the lapse (the grant.expiry timer, and the tick step
--       `collab-grant-expiry` (order 22) sweeping any grant past its expiry): the grant lapsed, the external's binding revoked (the epoch
--       bump kills its sessions), its open tasks reassigned with reason access_lost. Every collaboration port checks the live grant
--       (state, purpose = the context's purpose, ceiling, expiry) for an external actor.
--   §W6 DRILLS — restart_replay, duplicate_task, duplicate_timer, definition_change: executed in the port, recorded with a verdict.
-- NOT HERE (stated): the prelude's objects (human_tasks and its ledgers, workflow_timers, the four internal ports, the kinds, is_active_human,
-- the external_collaborator role); the gate.* and commitment.* tasks' opening and completion (the gates and commitments parts, through
-- their owning actions); the commitment.checkpoint and gate.expiry timer handlers (those parts register them in the TS registry); a real
-- e-mail / IdP / provider (the invitation mailbox is SYNTHETIC); objects.interface_register (unchanged, 50/0/0); the executive.demo_mailbox
-- table (0086's sink is keyed to attention deliveries — the invitations have their own synthetic sink here).

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §W1 THE DURABLE WORKFLOW ENGINE
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
CREATE TABLE executive.workflow_definitions (
  definition_id           uuid PRIMARY KEY,
  scope                   text NOT NULL,
  tenant_id               uuid NOT NULL,
  domain_id               uuid NOT NULL,
  def_key                 text NOT NULL CHECK (def_key ~ '^[a-z][a-z0-9_.-]{2,63}$'),
  version                 int NOT NULL CHECK (version >= 1),
  spec                    jsonb NOT NULL,
  digest                  text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  owner_principal_id      uuid NOT NULL,
  escalation_principal_id uuid NOT NULL,
  supersedes_version      int,
  reason                  text NOT NULL,
  published_by            uuid NOT NULL,
  published_at            timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id          uuid NOT NULL,
  CONSTRAINT xwd_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  UNIQUE (tenant_id, domain_id, def_key, version)
);
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON executive.workflow_definitions FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

CREATE TABLE executive.workflow_instances (
  instance_id     uuid PRIMARY KEY,
  scope           text NOT NULL,
  tenant_id       uuid NOT NULL,
  domain_id       uuid NOT NULL,
  definition_id   uuid NOT NULL REFERENCES executive.workflow_definitions (definition_id),
  def_key         text NOT NULL,
  def_version     int NOT NULL,
  def_digest      text NOT NULL,
  subject         jsonb NOT NULL,
  start_key       text NOT NULL,
  state           text NOT NULL,
  status          text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'compensated', 'irreconcilable', 'cancelled')),
  last_seq        int NOT NULL DEFAULT 0,
  lease_owner     text,
  lease_until     timestamptz,
  started_by      uuid NOT NULL,
  started_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id  uuid NOT NULL,
  CONSTRAINT xwi_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT xwi_subject CHECK (jsonb_typeof(subject) = 'object' AND subject ? 'kind' AND subject ? 'id'),
  UNIQUE (tenant_id, domain_id, start_key)
);
-- THE PIN: an instance runs to its end under the definition it started with; a newer version never re-points it.
CREATE OR REPLACE FUNCTION executive.workflow_instance_pinned() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'workflow rejected: an instance is never deleted' USING ERRCODE = '42501'; END IF;
  IF (NEW.instance_id, NEW.tenant_id, NEW.domain_id, NEW.definition_id, NEW.def_key, NEW.def_version, NEW.def_digest, NEW.subject, NEW.start_key, NEW.started_by, NEW.started_at)
     IS DISTINCT FROM (OLD.instance_id, OLD.tenant_id, OLD.domain_id, OLD.definition_id, OLD.def_key, OLD.def_version, OLD.def_digest, OLD.subject, OLD.start_key, OLD.started_by, OLD.started_at) THEN
    RAISE EXCEPTION 'workflow rejected (pinned): an instance keeps the definition, digest and subject it started with' USING ERRCODE = '22023';
  END IF;
  IF NEW.last_seq < OLD.last_seq THEN RAISE EXCEPTION 'workflow rejected (pinned): the committed sequence never goes back' USING ERRCODE = '22023'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pinned BEFORE UPDATE OR DELETE ON executive.workflow_instances FOR EACH ROW EXECUTE FUNCTION executive.workflow_instance_pinned();

CREATE TABLE executive.workflow_transitions (
  transition_id   uuid PRIMARY KEY,
  scope           text NOT NULL,
  tenant_id       uuid NOT NULL,
  domain_id       uuid NOT NULL,
  instance_id     uuid NOT NULL REFERENCES executive.workflow_instances (instance_id),
  seq             int NOT NULL CHECK (seq >= 0),
  idempotency_key text NOT NULL CHECK (length(btrim(idempotency_key)) BETWEEN 3 AND 200),
  kind            text NOT NULL CHECK (kind IN ('start', 'advance', 'timeout', 'compensate', 'escalate', 'cancel')),
  event           text NOT NULL,
  from_state      text,
  to_state        text NOT NULL,
  effect_ref      uuid,
  details         jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_principal_id uuid NOT NULL,
  at              timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id  uuid NOT NULL,
  CONSTRAINT xwtr_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  UNIQUE (instance_id, seq),
  UNIQUE (instance_id, idempotency_key)
);
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON executive.workflow_transitions FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

CREATE TABLE executive.workflow_compensations (
  compensation_id uuid PRIMARY KEY,
  scope           text NOT NULL,
  tenant_id       uuid NOT NULL,
  domain_id       uuid NOT NULL,
  instance_id     uuid NOT NULL REFERENCES executive.workflow_instances (instance_id),
  for_seq         int NOT NULL,
  for_event       text NOT NULL,
  action          text,
  outcome         text NOT NULL CHECK (outcome IN ('recorded', 'irreconcilable')),
  task_id         uuid,
  reason          text NOT NULL,
  actor_principal_id uuid NOT NULL,
  at              timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id  uuid NOT NULL,
  CONSTRAINT xwc_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  UNIQUE (instance_id, for_seq)
);
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON executive.workflow_compensations FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

-- The firing ledger: one row per FIRED timer (the prelude's workflow_timers keeps fired_at; this keeps what the firing did).
CREATE TABLE executive.workflow_timer_firings (
  timer_id        uuid PRIMARY KEY REFERENCES executive.workflow_timers (timer_id),
  scope           text NOT NULL,
  tenant_id       uuid NOT NULL,
  domain_id       uuid NOT NULL,
  kind            text NOT NULL,
  tick_key        bigint,
  tick_ref        uuid,
  outcome         text NOT NULL CHECK (outcome IN ('fired', 'failed', 'skipped')),
  result          jsonb NOT NULL DEFAULT '{}'::jsonb,
  drift_seconds   numeric NOT NULL,
  fired_by        uuid NOT NULL,
  at              timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id  uuid NOT NULL,
  CONSTRAINT xwtf_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON executive.workflow_timer_firings FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

CREATE TABLE executive.workflow_timer_failures (
  failure_id      uuid PRIMARY KEY,
  scope           text NOT NULL,
  tenant_id       uuid NOT NULL,
  domain_id       uuid NOT NULL,
  timer_id        uuid NOT NULL REFERENCES executive.workflow_timers (timer_id),
  attempt         int NOT NULL CHECK (attempt >= 1),
  error           text NOT NULL,
  tick_key        bigint,
  at              timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id  uuid NOT NULL,
  CONSTRAINT xwtx_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  UNIQUE (timer_id, attempt)
);
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON executive.workflow_timer_failures FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

CREATE TABLE executive.workflow_drills (
  drill_id        uuid PRIMARY KEY,
  scope           text NOT NULL,
  tenant_id       uuid NOT NULL,
  domain_id       uuid NOT NULL,
  kind            text NOT NULL CHECK (kind IN ('restart_replay', 'duplicate_task', 'duplicate_timer', 'definition_change')),
  instance_id     uuid REFERENCES executive.workflow_instances (instance_id),
  verdict         text NOT NULL CHECK (verdict IN ('pass', 'fail')),
  observations    jsonb NOT NULL,
  run_by          uuid NOT NULL,
  run_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id  uuid NOT NULL,
  CONSTRAINT xwdr_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON executive.workflow_drills FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §W4 / §W5 COLLABORATION AND EXTERNAL COLLABORATORS (the tables; the ports follow the engine's)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION executive.collab_class_rank(p_class text) RETURNS int LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_class WHEN 'public' THEN 0 WHEN 'internal' THEN 1 WHEN 'confidential' THEN 2 WHEN 'restricted' THEN 3 END $$;
GRANT EXECUTE ON FUNCTION executive.collab_class_rank(text) TO eye_app, eye_commit;

CREATE TABLE executive.collab_workspaces (
  workspace_id            uuid PRIMARY KEY,
  scope                   text NOT NULL,
  tenant_id               uuid NOT NULL,
  domain_id               uuid NOT NULL,
  title                   text NOT NULL CHECK (length(btrim(title)) BETWEEN 3 AND 300),
  subject                 jsonb NOT NULL,
  purpose                 text NOT NULL CHECK (length(btrim(purpose)) BETWEEN 3 AND 100),
  classification_ceiling  text NOT NULL CHECK (classification_ceiling IN ('public', 'internal', 'confidential', 'restricted')),
  owner_principal_id      uuid NOT NULL,
  state                   text NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'closed')),
  opened_by               uuid NOT NULL,
  opened_at               timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at              timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id          uuid NOT NULL,
  CONSTRAINT xcw_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT xcw_subject CHECK (jsonb_typeof(subject) = 'object' AND subject ? 'kind' AND subject ? 'id')
);

-- Participants: who takes part in a workspace — NEVER room membership, NEVER approver standing (no approval, commit or room port reads it).
CREATE TABLE executive.collab_participants (
  participant_id  uuid PRIMARY KEY,
  scope           text NOT NULL,
  tenant_id       uuid NOT NULL,
  domain_id       uuid NOT NULL,
  workspace_id    uuid NOT NULL REFERENCES executive.collab_workspaces (workspace_id),
  principal_id    uuid NOT NULL,
  role            text NOT NULL CHECK (role IN ('owner', 'contributor', 'reviewer', 'observer')),
  affiliation     text NOT NULL CHECK (affiliation IN ('member', 'external')),
  grant_id        uuid,
  added_by        uuid NOT NULL,
  added_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  removed_by      uuid,
  removed_at      timestamptz,
  removal_reason  text,
  correlation_id  uuid NOT NULL,
  CONSTRAINT xcp_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT xcp_external_grant CHECK ((affiliation = 'external') = (grant_id IS NOT NULL)),
  UNIQUE (workspace_id, principal_id)
);

CREATE TABLE executive.collab_threads (
  thread_id       uuid PRIMARY KEY,
  scope           text NOT NULL,
  tenant_id       uuid NOT NULL,
  domain_id       uuid NOT NULL,
  workspace_id    uuid NOT NULL REFERENCES executive.collab_workspaces (workspace_id),
  title           text NOT NULL CHECK (length(btrim(title)) BETWEEN 3 AND 300),
  opened_by       uuid NOT NULL,
  opened_at       timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id  uuid NOT NULL,
  CONSTRAINT xct_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON executive.collab_threads FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

CREATE TABLE executive.collab_messages (
  message_id      uuid PRIMARY KEY,
  scope           text NOT NULL,
  tenant_id       uuid NOT NULL,
  domain_id       uuid NOT NULL,
  workspace_id    uuid NOT NULL REFERENCES executive.collab_workspaces (workspace_id),
  thread_id       uuid NOT NULL REFERENCES executive.collab_threads (thread_id),
  author_principal_id uuid NOT NULL,
  author_affiliation text NOT NULL CHECK (author_affiliation IN ('member', 'external')),
  body            text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 8000),
  body_digest     text NOT NULL CHECK (body_digest ~ '^[0-9a-f]{64}$'),
  mentions        uuid[] NOT NULL DEFAULT '{}',
  posted_at       timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id  uuid NOT NULL,
  CONSTRAINT xcm_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON executive.collab_messages FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

CREATE TABLE executive.collab_artifacts (
  artifact_id     uuid PRIMARY KEY,
  scope           text NOT NULL,
  tenant_id       uuid NOT NULL,
  domain_id       uuid NOT NULL,
  workspace_id    uuid NOT NULL REFERENCES executive.collab_workspaces (workspace_id),
  artifact_key    text NOT NULL CHECK (artifact_key ~ '^[a-z0-9][a-z0-9_.-]{1,63}$'),
  version         int NOT NULL CHECK (version >= 1),
  title           text NOT NULL CHECK (length(btrim(title)) BETWEEN 3 AND 300),
  kind            text NOT NULL CHECK (kind IN ('note', 'document', 'evidence_ref')),
  classification  text NOT NULL CHECK (classification IN ('public', 'internal', 'confidential', 'restricted')),
  content         text,
  object_ref      jsonb,
  content_digest  text NOT NULL CHECK (content_digest ~ '^[0-9a-f]{64}$'),
  added_by        uuid NOT NULL,
  added_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id  uuid NOT NULL,
  CONSTRAINT xca_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT xca_body CHECK ((kind = 'evidence_ref') = (object_ref IS NOT NULL) AND (kind = 'evidence_ref' OR length(btrim(coalesce(content, ''))) BETWEEN 1 AND 20000)),
  UNIQUE (workspace_id, artifact_key, version)
);
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON executive.collab_artifacts FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

CREATE TABLE executive.collab_reviews (
  review_id       uuid PRIMARY KEY,
  scope           text NOT NULL,
  tenant_id       uuid NOT NULL,
  domain_id       uuid NOT NULL,
  workspace_id    uuid NOT NULL REFERENCES executive.collab_workspaces (workspace_id),
  task_id         uuid REFERENCES executive.human_tasks (task_id),
  artifact_id     uuid REFERENCES executive.collab_artifacts (artifact_id),
  reviewer_principal_id uuid NOT NULL,
  reviewer_affiliation text NOT NULL CHECK (reviewer_affiliation IN ('member', 'external')),
  verdict         text NOT NULL CHECK (verdict IN ('endorse', 'endorse_with_conditions', 'concerns', 'object')),
  statement       text NOT NULL CHECK (length(btrim(statement)) BETWEEN 8 AND 8000),
  recorded_at     timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id  uuid NOT NULL,
  CONSTRAINT xcr_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON executive.collab_reviews FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

-- A GRANT bounds an external collaborator: one workspace, its purpose, an audience ceiling, an expiry at most 30 days after the invitation.
CREATE TABLE executive.collab_grants (
  grant_id                uuid PRIMARY KEY,
  scope                   text NOT NULL,
  tenant_id               uuid NOT NULL,
  domain_id               uuid NOT NULL,
  workspace_id            uuid NOT NULL REFERENCES executive.collab_workspaces (workspace_id),
  principal_id            uuid NOT NULL,
  purpose                 text NOT NULL,
  audience_ceiling        text NOT NULL CHECK (audience_ceiling IN ('public', 'internal', 'confidential', 'restricted')),
  expires_at              timestamptz NOT NULL,
  invitation_token_hash   text NOT NULL CHECK (invitation_token_hash ~ '^[0-9a-f]{64}$'),
  invitation_expires_at   timestamptz NOT NULL,
  contact_label           text NOT NULL,
  state                   text NOT NULL DEFAULT 'invited' CHECK (state IN ('invited', 'accepted', 'revoked', 'lapsed')),
  expiry_timer_id         uuid,
  invited_by              uuid NOT NULL,
  invited_at              timestamptz NOT NULL DEFAULT clock_timestamp(),
  accepted_at             timestamptz,
  revoked_by              uuid,
  revoked_at              timestamptz,
  revoke_reason           text,
  lapsed_at               timestamptz,
  correlation_id          uuid NOT NULL,
  CONSTRAINT xcg_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT xcg_expiry CHECK (expires_at > invited_at AND expires_at <= invited_at + interval '30 days' AND invitation_expires_at <= expires_at),
  CONSTRAINT xcg_state CHECK ((state = 'accepted') <= (accepted_at IS NOT NULL) AND (state = 'revoked') = (revoked_at IS NOT NULL) AND (state = 'lapsed') = (lapsed_at IS NOT NULL))
);
CREATE INDEX collab_grants_principal ON executive.collab_grants (tenant_id, domain_id, principal_id, state);

CREATE TABLE executive.collab_events (
  event_id        uuid PRIMARY KEY,
  scope           text NOT NULL,
  tenant_id       uuid NOT NULL,
  domain_id       uuid NOT NULL,
  workspace_id    uuid NOT NULL REFERENCES executive.collab_workspaces (workspace_id),
  event           text NOT NULL CHECK (event IN ('workspace.opened', 'participant.added', 'participant.removed', 'thread.opened', 'message.posted',
                                                 'artifact.added', 'review.requested', 'review.recorded', 'grant.invited', 'grant.accepted', 'grant.revoked',
                                                 'grant.lapsed', 'access.refused')),
  actor_principal_id uuid NOT NULL,
  details         jsonb NOT NULL DEFAULT '{}'::jsonb,
  at              timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id  uuid NOT NULL,
  CONSTRAINT xce_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON executive.collab_events FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

-- The SYNTHETIC invitation mailbox: a local sink (subject and body digest per invitee). Nothing leaves the database; no e-mail is sent
-- (a real provider is owner decision D6) and this sink closes no real-provider clause.
CREATE TABLE executive.collab_invitation_mail (
  message_id      uuid PRIMARY KEY,
  scope           text NOT NULL,
  tenant_id       uuid NOT NULL,
  domain_id       uuid NOT NULL,
  grant_id        uuid NOT NULL UNIQUE REFERENCES executive.collab_grants (grant_id),
  recipient_principal_id uuid NOT NULL,
  channel         text NOT NULL DEFAULT 'demo-mailbox' CHECK (channel = 'demo-mailbox'),
  subject         text NOT NULL CHECK (length(btrim(subject)) BETWEEN 1 AND 300),
  body_digest     text NOT NULL CHECK (body_digest ~ '^[0-9a-f]{64}$'),
  synthetic_state boolean NOT NULL DEFAULT true CHECK (synthetic_state),
  placed_at       timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id  uuid NOT NULL,
  CONSTRAINT xcim_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON executive.collab_invitation_mail FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['workflow_definitions', 'workflow_instances', 'workflow_transitions', 'workflow_compensations', 'workflow_timer_firings',
                           'workflow_timer_failures', 'workflow_drills', 'collab_workspaces', 'collab_participants', 'collab_threads', 'collab_messages',
                           'collab_artifacts', 'collab_reviews', 'collab_grants', 'collab_events', 'collab_invitation_mail'] LOOP
    EXECUTE format('REVOKE ALL ON executive.%I FROM PUBLIC', t);
    EXECUTE format('ALTER TABLE executive.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE executive.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY executive_isolation ON executive.%I
        USING (
          tenant_id = public.eye_tenant()
          AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain())
        )$f$, t);
    EXECUTE format('GRANT SELECT ON executive.%I TO eye_app, eye_commit', t);
  END LOOP;
END $$;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §W1 THE ENGINE'S PORTS
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- A definition's spec, validated whole (22023 names the key):
--   {states: [text], initial: text, terminal: [text], transitions: [{from, event, to}], timeouts?: [{state, after_seconds, event}],
--    compensations?: {<event>: <the compensating action, in words>}}
-- (from, event) is unique; a timeout's event is a transition out of its state; a compensation names a transition's event.
CREATE OR REPLACE FUNCTION executive.validate_workflow_spec(p_spec jsonb) RETURNS void
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE v_states text[]; t jsonb; k text; v_seen text[] := '{}';
BEGIN
  IF p_spec IS NULL OR jsonb_typeof(p_spec) <> 'object' THEN RAISE EXCEPTION 'workflow definition rejected (spec): the spec is an object {states, initial, terminal, transitions, timeouts?, compensations?}' USING ERRCODE = '22023'; END IF;
  FOR k IN SELECT jsonb_object_keys(p_spec) LOOP
    IF k NOT IN ('states', 'initial', 'terminal', 'transitions', 'timeouts', 'compensations') THEN RAISE EXCEPTION 'workflow definition rejected (spec): % is not a spec key', k USING ERRCODE = '22023'; END IF;
  END LOOP;
  IF jsonb_typeof(p_spec -> 'states') <> 'array' OR jsonb_array_length(p_spec -> 'states') < 2 THEN RAISE EXCEPTION 'workflow definition rejected (states): at least two states' USING ERRCODE = '22023'; END IF;
  SELECT array_agg(x) INTO v_states FROM jsonb_array_elements_text(p_spec -> 'states') x;
  IF (SELECT count(DISTINCT x) FROM unnest(v_states) x) <> cardinality(v_states) OR EXISTS (SELECT 1 FROM unnest(v_states) x WHERE x !~ '^[a-z][a-z0-9_]{1,40}$') THEN
    RAISE EXCEPTION 'workflow definition rejected (states): states are distinct snake_case names' USING ERRCODE = '22023';
  END IF;
  IF NOT ((p_spec ->> 'initial') = ANY (v_states)) THEN RAISE EXCEPTION 'workflow definition rejected (initial): the initial state is one of the states' USING ERRCODE = '22023'; END IF;
  IF jsonb_typeof(p_spec -> 'terminal') <> 'array' OR jsonb_array_length(p_spec -> 'terminal') < 1
     OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(p_spec -> 'terminal') x WHERE NOT (x = ANY (v_states))) OR (p_spec ->> 'initial') IN (SELECT jsonb_array_elements_text(p_spec -> 'terminal')) THEN
    RAISE EXCEPTION 'workflow definition rejected (terminal): one or more terminal states, each a state, none the initial' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_spec -> 'transitions') <> 'array' OR jsonb_array_length(p_spec -> 'transitions') < 1 THEN RAISE EXCEPTION 'workflow definition rejected (transitions): at least one transition' USING ERRCODE = '22023'; END IF;
  FOR t IN SELECT * FROM jsonb_array_elements(p_spec -> 'transitions') LOOP
    IF jsonb_typeof(t) <> 'object' OR NOT ((t ->> 'from') = ANY (v_states)) OR NOT ((t ->> 'to') = ANY (v_states)) OR coalesce(t ->> 'event', '') !~ '^[a-z][a-z0-9_.]{1,60}$' THEN
      RAISE EXCEPTION 'workflow definition rejected (transitions): each transition is {from, event, to} over the states (%)', t::text USING ERRCODE = '22023';
    END IF;
    IF (t ->> 'from') IN (SELECT jsonb_array_elements_text(p_spec -> 'terminal')) THEN RAISE EXCEPTION 'workflow definition rejected (transitions): no transition leaves a terminal state (%)', t ->> 'from' USING ERRCODE = '22023'; END IF;
    IF ((t ->> 'from') || '/' || (t ->> 'event')) = ANY (v_seen) THEN RAISE EXCEPTION 'workflow definition rejected (transitions): % from % is declared twice', t ->> 'event', t ->> 'from' USING ERRCODE = '22023'; END IF;
    v_seen := v_seen || ((t ->> 'from') || '/' || (t ->> 'event'));
  END LOOP;
  IF p_spec ? 'timeouts' THEN
    IF jsonb_typeof(p_spec -> 'timeouts') <> 'array' THEN RAISE EXCEPTION 'workflow definition rejected (timeouts): timeouts is an array' USING ERRCODE = '22023'; END IF;
    FOR t IN SELECT * FROM jsonb_array_elements(p_spec -> 'timeouts') LOOP
      IF jsonb_typeof(t) <> 'object' OR NOT ((t ->> 'state') = ANY (v_states)) OR jsonb_typeof(t -> 'after_seconds') <> 'number'
         OR (t ->> 'after_seconds')::numeric <> floor((t ->> 'after_seconds')::numeric) OR (t ->> 'after_seconds')::numeric < 1 OR (t ->> 'after_seconds')::numeric > 31536000
         OR NOT (((t ->> 'state') || '/' || coalesce(t ->> 'event', '')) = ANY (v_seen)) THEN
        RAISE EXCEPTION 'workflow definition rejected (timeouts): each timeout is {state, after_seconds 1..31536000, event} whose event leaves that state (%)', t::text USING ERRCODE = '22023';
      END IF;
    END LOOP;
  END IF;
  IF p_spec ? 'compensations' THEN
    IF jsonb_typeof(p_spec -> 'compensations') <> 'object' THEN RAISE EXCEPTION 'workflow definition rejected (compensations): compensations is an object {event: action}' USING ERRCODE = '22023'; END IF;
    FOR k IN SELECT jsonb_object_keys(p_spec -> 'compensations') LOOP
      IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_spec -> 'transitions') x WHERE x ->> 'event' = k) OR length(btrim(coalesce(p_spec -> 'compensations' ->> k, ''))) < 8 THEN
        RAISE EXCEPTION 'workflow definition rejected (compensations): % is a transition event with its compensating action in words (8+ characters)', k USING ERRCODE = '22023';
      END IF;
    END LOOP;
  END IF;
END $$;
GRANT EXECUTE ON FUNCTION executive.validate_workflow_spec(jsonb) TO eye_app, eye_commit;

-- PUBLISH a definition version: the next version of its key (the prior one stays: a running instance keeps its pin), with its digest.
-- The owner and the escalation principal are named MEMBERS (an irreconcilable instance escalates to them).
CREATE OR REPLACE FUNCTION executive.publish_workflow_definition(
  p_definition_id uuid, p_tenant uuid, p_domain uuid, p_def_key text, p_spec jsonb, p_owner uuid, p_escalation uuid, p_reason text, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_prior executive.workflow_definitions%ROWTYPE; v_digest text; v_version int;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.workflow.define']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'workflow definition rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF coalesce(p_def_key, '') !~ '^[a-z][a-z0-9_.-]{2,63}$' THEN RAISE EXCEPTION 'workflow definition rejected (def_key): a lower-case key of 3..64 characters' USING ERRCODE = '22023'; END IF;
  IF coalesce(length(btrim(p_reason)), 0) < 8 THEN RAISE EXCEPTION 'workflow definition rejected (reason): a definition states why it changes (8+ characters)' USING ERRCODE = '22023'; END IF;
  IF NOT decision.is_active_human(p_owner, p_tenant) OR NOT decision.is_active_human(p_escalation, p_tenant) THEN
    RAISE EXCEPTION 'workflow definition rejected (owner): the owner and the escalation principal are active members' USING ERRCODE = '22023';
  END IF;
  PERFORM executive.validate_workflow_spec(p_spec);
  v_digest := encode(sha256(convert_to(p_spec::text, 'UTF8')), 'hex');
  SELECT * INTO v_prior FROM executive.workflow_definitions d WHERE d.tenant_id = p_tenant AND d.domain_id = p_domain AND d.def_key = p_def_key ORDER BY d.version DESC LIMIT 1 FOR UPDATE;
  IF FOUND AND v_prior.digest = v_digest AND v_prior.owner_principal_id = p_owner AND v_prior.escalation_principal_id = p_escalation THEN
    RAISE EXCEPTION 'workflow definition rejected (unchanged): version % of % already has digest %', v_prior.version, p_def_key, left(v_digest, 12) USING ERRCODE = '22023';
  END IF;
  v_version := coalesce(v_prior.version, 0) + 1;
  INSERT INTO executive.workflow_definitions (definition_id, scope, tenant_id, domain_id, def_key, version, spec, digest, owner_principal_id, escalation_principal_id,
                                              supersedes_version, reason, published_by, correlation_id)
  VALUES (p_definition_id, 'DOMAIN', p_tenant, p_domain, p_def_key, v_version, p_spec, v_digest, p_owner, p_escalation, v_prior.version, btrim(p_reason), p_actor, p_correlation);
  RETURN jsonb_build_object('definition_id', p_definition_id, 'def_key', p_def_key, 'version', v_version, 'digest', v_digest, 'supersedes_version', v_prior.version,
                            'running_on_prior', (SELECT count(*) FROM executive.workflow_instances i WHERE i.tenant_id = p_tenant AND i.domain_id = p_domain AND i.def_key = p_def_key AND i.status = 'running'));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.publish_workflow_definition(uuid, uuid, uuid, text, jsonb, uuid, uuid, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.publish_workflow_definition(uuid, uuid, uuid, text, jsonb, uuid, uuid, text, uuid, uuid) TO eye_commit;

-- The step timeout of a state, if the pinned spec declares one: scheduled as a workflow.step_timeout timer carrying the seq it guards.
CREATE OR REPLACE FUNCTION executive._schedule_step_timeout(p_instance uuid, p_tenant uuid, p_domain uuid, p_spec jsonb, p_state text, p_seq int, p_actor uuid, p_correlation uuid) RETURNS uuid
SECURITY DEFINER SET search_path = executive, public, pg_catalog, pg_temp AS $$
DECLARE t jsonb;
BEGIN
  SELECT x INTO t FROM jsonb_array_elements(coalesce(p_spec -> 'timeouts', '[]'::jsonb)) x WHERE x ->> 'state' = p_state LIMIT 1;
  IF t IS NULL THEN RETURN NULL; END IF;
  RETURN executive._schedule_timer(gen_random_uuid(), p_tenant, p_domain, 'workflow_instance', p_instance, 'workflow.step_timeout',
                                   clock_timestamp() + make_interval(secs => (t ->> 'after_seconds')::int),
                                   jsonb_build_object('state', p_state, 'seq', p_seq, 'event', t ->> 'event'), p_actor, p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive._schedule_step_timeout(uuid, uuid, uuid, jsonb, text, int, uuid, uuid) FROM PUBLIC;

-- _start_workflow: INTERNAL (REVOKEd; called by definer ports that asserted their own action). Idempotent on (tenant, domain, start_key):
-- a repeat answers the existing instance (repeated true). The instance is PINNED to the newest version's digest at its start.
CREATE OR REPLACE FUNCTION executive._start_workflow(
  p_instance_id uuid, p_tenant uuid, p_domain uuid, p_def_key text, p_subject jsonb, p_start_key text, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, public, pg_catalog, pg_temp AS $$
DECLARE d executive.workflow_definitions%ROWTYPE; i executive.workflow_instances%ROWTYPE; v_timer uuid;
BEGIN
  IF coalesce(length(btrim(p_start_key)), 0) < 3 THEN RAISE EXCEPTION 'workflow rejected (start_key): a start names its idempotency key' USING ERRCODE = '22023'; END IF;
  IF p_subject IS NULL OR jsonb_typeof(p_subject) <> 'object' OR NOT (p_subject ? 'kind' AND p_subject ? 'id') THEN RAISE EXCEPTION 'workflow rejected (subject): the subject is {kind, id}' USING ERRCODE = '22023'; END IF;
  SELECT * INTO i FROM executive.workflow_instances x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.start_key = p_start_key;
  IF FOUND THEN
    RETURN jsonb_build_object('instance_id', i.instance_id, 'state', i.state, 'status', i.status, 'seq', i.last_seq, 'def_version', i.def_version, 'def_digest', i.def_digest, 'repeated', true);
  END IF;
  SELECT * INTO d FROM executive.workflow_definitions x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.def_key = p_def_key ORDER BY x.version DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'workflow rejected (unknown_definition): no definition % in this domain', p_def_key USING ERRCODE = '23503'; END IF;
  INSERT INTO executive.workflow_instances (instance_id, scope, tenant_id, domain_id, definition_id, def_key, def_version, def_digest, subject, start_key, state, started_by, correlation_id)
  VALUES (p_instance_id, 'DOMAIN', p_tenant, p_domain, d.definition_id, d.def_key, d.version, d.digest, p_subject, p_start_key, d.spec ->> 'initial', p_actor, p_correlation);
  INSERT INTO executive.workflow_transitions (transition_id, scope, tenant_id, domain_id, instance_id, seq, idempotency_key, kind, event, from_state, to_state, details, actor_principal_id, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_instance_id, 0, 'start:' || p_start_key, 'start', 'start', NULL, d.spec ->> 'initial',
          jsonb_build_object('def_version', d.version, 'def_digest', d.digest), p_actor, p_correlation);
  v_timer := executive._schedule_step_timeout(p_instance_id, p_tenant, p_domain, d.spec, d.spec ->> 'initial', 0, p_actor, p_correlation);
  RETURN jsonb_build_object('instance_id', p_instance_id, 'state', d.spec ->> 'initial', 'status', 'running', 'seq', 0, 'def_version', d.version, 'def_digest', d.digest,
                            'repeated', false, 'timeout_timer_id', v_timer);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive._start_workflow(uuid, uuid, uuid, text, jsonb, text, uuid, uuid) FROM PUBLIC;

-- _workflow_transition: INTERNAL. EXACTLY-ONCE per (instance, idempotency_key): a repeat answers the committed transition (repeated true)
-- and has no second effect. The event is looked up in the instance's PINNED spec (the definition row of its digest), never the newest one.
-- The instance's pending step timeouts are cancelled; the new state's timeout scheduled; a terminal state completes the instance.
CREATE OR REPLACE FUNCTION executive._workflow_transition(
  p_instance uuid, p_tenant uuid, p_domain uuid, p_event text, p_idempotency_key text, p_kind text, p_effect_ref uuid, p_details jsonb, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, public, pg_catalog, pg_temp AS $$
DECLARE i executive.workflow_instances%ROWTYPE; d executive.workflow_definitions%ROWTYPE; r executive.workflow_transitions%ROWTYPE; v_to text; v_status text; v_timer uuid;
BEGIN
  SELECT * INTO i FROM executive.workflow_instances x WHERE x.instance_id = p_instance AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'workflow rejected (unknown_instance): no instance % in this domain', p_instance USING ERRCODE = '23503'; END IF;
  IF coalesce(length(btrim(p_idempotency_key)), 0) < 3 THEN RAISE EXCEPTION 'workflow rejected (idempotency_key): a transition names its idempotency key' USING ERRCODE = '22023'; END IF;
  SELECT * INTO r FROM executive.workflow_transitions x WHERE x.instance_id = p_instance AND x.idempotency_key = p_idempotency_key;
  IF FOUND THEN
    RETURN jsonb_build_object('instance_id', p_instance, 'transition_id', r.transition_id, 'seq', r.seq, 'event', r.event, 'from', r.from_state, 'to', r.to_state,
                              'state', i.state, 'status', i.status, 'repeated', true);
  END IF;
  IF i.status <> 'running' THEN RAISE EXCEPTION 'workflow rejected (not_running): instance % is %', p_instance, i.status USING ERRCODE = '22023'; END IF;
  SELECT * INTO d FROM executive.workflow_definitions x WHERE x.definition_id = i.definition_id AND x.digest = i.def_digest;
  IF NOT FOUND THEN RAISE EXCEPTION 'workflow rejected (pinned): the pinned definition % is missing', i.def_digest USING ERRCODE = '22023'; END IF;
  SELECT x ->> 'to' INTO v_to FROM jsonb_array_elements(d.spec -> 'transitions') x WHERE x ->> 'from' = i.state AND x ->> 'event' = p_event;
  IF v_to IS NULL THEN
    RAISE EXCEPTION 'workflow rejected (no_transition): % is not a transition from % in % v% (the pinned definition)', coalesce(p_event, '<none>'), i.state, i.def_key, i.def_version USING ERRCODE = '22023';
  END IF;
  INSERT INTO executive.workflow_transitions (transition_id, scope, tenant_id, domain_id, instance_id, seq, idempotency_key, kind, event, from_state, to_state, effect_ref, details, actor_principal_id, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_instance, i.last_seq + 1, p_idempotency_key, p_kind, p_event, i.state, v_to, p_effect_ref, coalesce(p_details, '{}'::jsonb), p_actor, p_correlation)
  RETURNING * INTO r;
  v_status := CASE WHEN v_to IN (SELECT jsonb_array_elements_text(d.spec -> 'terminal')) THEN 'completed' ELSE 'running' END;
  UPDATE executive.workflow_instances SET state = v_to, status = v_status, last_seq = r.seq, updated_at = clock_timestamp() WHERE instance_id = p_instance;
  -- the state's pending timeouts end with it (never the timeout being fired now: it is marked fired by its tick)
  UPDATE executive.workflow_timers SET cancelled_at = clock_timestamp()
   WHERE owner_kind = 'workflow_instance' AND owner_id = p_instance AND kind = 'workflow.step_timeout' AND fired_at IS NULL AND cancelled_at IS NULL
     AND NOT (p_kind = 'timeout' AND timer_id = p_effect_ref);
  IF v_status = 'running' THEN v_timer := executive._schedule_step_timeout(p_instance, p_tenant, p_domain, d.spec, v_to, r.seq, p_actor, p_correlation); END IF;
  RETURN jsonb_build_object('instance_id', p_instance, 'transition_id', r.transition_id, 'seq', r.seq, 'event', p_event, 'from', r.from_state, 'to', v_to,
                            'state', v_to, 'status', v_status, 'repeated', false, 'timeout_timer_id', v_timer);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive._workflow_transition(uuid, uuid, uuid, text, text, text, uuid, jsonb, uuid, uuid) FROM PUBLIC;

-- START an instance (the named human's act).
CREATE OR REPLACE FUNCTION executive.start_workflow(
  p_instance_id uuid, p_tenant uuid, p_domain uuid, p_def_key text, p_subject jsonb, p_start_key text, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, observation, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.workflow.start']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'workflow rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  RETURN executive._start_workflow(p_instance_id, p_tenant, p_domain, p_def_key, p_subject, p_start_key, p_actor, p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.start_workflow(uuid, uuid, uuid, text, jsonb, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.start_workflow(uuid, uuid, uuid, text, jsonb, text, uuid, uuid) TO eye_commit;

-- ADVANCE an instance under a LEASE: a worker (p_lease_owner) takes the lease when it is free or expired, keeps it while it is its own;
-- another worker's live lease refuses (409) — a crashed worker's lease expires and the next one RESUMES from the committed seq. An
-- expected seq that is not the committed one refuses (stale). The duplicate of a committed transition answers repeated (no lease needed).
CREATE OR REPLACE FUNCTION executive.advance_workflow(
  p_instance uuid, p_tenant uuid, p_domain uuid, p_event text, p_idempotency_key text, p_expected_seq int, p_lease_owner text, p_lease_seconds int,
  p_effect_ref uuid, p_details jsonb, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE i executive.workflow_instances%ROWTYPE; r jsonb; v_prior_owner text; v_resumed boolean := false;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.workflow.advance']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'workflow rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF coalesce(length(btrim(p_lease_owner)), 0) < 3 OR coalesce(p_lease_seconds, 0) NOT BETWEEN 1 AND 3600 THEN
    RAISE EXCEPTION 'workflow rejected (lease): a worker names itself and a lease of 1..3600 seconds' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO i FROM executive.workflow_instances x WHERE x.instance_id = p_instance AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'workflow rejected (unknown_instance): no instance % in this domain', p_instance USING ERRCODE = '23503'; END IF;
  IF EXISTS (SELECT 1 FROM executive.workflow_transitions x WHERE x.instance_id = p_instance AND x.idempotency_key = p_idempotency_key) THEN
    RETURN executive._workflow_transition(p_instance, p_tenant, p_domain, p_event, p_idempotency_key, 'advance', p_effect_ref, p_details, p_actor, p_correlation);
  END IF;
  IF i.lease_owner IS NOT NULL AND i.lease_owner <> p_lease_owner AND i.lease_until > clock_timestamp() THEN
    RAISE EXCEPTION 'workflow rejected (leased): instance % is leased by % until %', p_instance, i.lease_owner, i.lease_until USING ERRCODE = '23505';
  END IF;
  IF p_expected_seq IS NOT NULL AND p_expected_seq <> i.last_seq THEN
    RAISE EXCEPTION 'workflow rejected (stale_seq): the worker expected seq % and the committed seq is % — resume from the committed transition', p_expected_seq, i.last_seq USING ERRCODE = '23505';
  END IF;
  v_prior_owner := i.lease_owner;
  v_resumed := v_prior_owner IS NOT NULL AND v_prior_owner <> p_lease_owner;
  UPDATE executive.workflow_instances SET lease_owner = p_lease_owner, lease_until = clock_timestamp() + make_interval(secs => p_lease_seconds) WHERE instance_id = p_instance;
  r := executive._workflow_transition(p_instance, p_tenant, p_domain, p_event, p_idempotency_key, 'advance', p_effect_ref,
         coalesce(p_details, '{}'::jsonb) || jsonb_build_object('lease_owner', p_lease_owner) || CASE WHEN v_resumed THEN jsonb_build_object('resumed_from', v_prior_owner) ELSE '{}'::jsonb END,
         p_actor, p_correlation);
  RETURN r || jsonb_build_object('lease_owner', p_lease_owner, 'resumed_from', CASE WHEN v_resumed THEN v_prior_owner END);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.advance_workflow(uuid, uuid, uuid, text, text, int, text, int, uuid, jsonb, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.advance_workflow(uuid, uuid, uuid, text, text, int, text, int, uuid, jsonb, uuid, uuid) TO eye_commit;

-- THE REPLAY: the state refolded from the committed transitions under the PINNED spec (an invoker read under RLS). consistent = the
-- stored state and seq are what the log says, every transition a permitted one of the pinned definition, the seqs gap-free.
CREATE OR REPLACE FUNCTION executive.workflow_replay(p_instance uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = executive, public, pg_catalog, pg_temp AS $$
DECLARE i executive.workflow_instances%ROWTYPE; d executive.workflow_definitions%ROWTYPE; t executive.workflow_transitions%ROWTYPE; v_state text; v_seq int := -1; v_ok boolean := true; v_notes jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO i FROM executive.workflow_instances x WHERE x.instance_id = p_instance;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO d FROM executive.workflow_definitions x WHERE x.definition_id = i.definition_id;
  FOR t IN SELECT * FROM executive.workflow_transitions x WHERE x.instance_id = p_instance ORDER BY x.seq LOOP
    IF t.seq <> v_seq + 1 THEN v_ok := false; v_notes := v_notes || jsonb_build_object('gap_at', t.seq); END IF;
    IF t.kind = 'start' THEN
      IF t.to_state IS DISTINCT FROM d.spec ->> 'initial' THEN v_ok := false; v_notes := v_notes || jsonb_build_object('bad_start', t.to_state); END IF;
    ELSIF t.kind IN ('advance', 'timeout') THEN
      IF t.from_state IS DISTINCT FROM v_state OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(d.spec -> 'transitions') x WHERE x ->> 'from' = t.from_state AND x ->> 'event' = t.event AND x ->> 'to' = t.to_state) THEN
        v_ok := false; v_notes := v_notes || jsonb_build_object('not_permitted', t.seq);
      END IF;
    END IF;
    v_state := t.to_state; v_seq := t.seq;
  END LOOP;
  RETURN jsonb_build_object('instance_id', p_instance, 'def_key', i.def_key, 'def_version', i.def_version, 'def_digest', i.def_digest, 'pinned_digest_matches', d.digest = i.def_digest,
                            'replayed_state', v_state, 'replayed_seq', v_seq, 'stored_state', i.state, 'stored_seq', i.last_seq, 'status', i.status,
                            'consistent', v_ok AND v_state IS NOT DISTINCT FROM i.state AND v_seq = i.last_seq AND d.digest = i.def_digest, 'notes', v_notes);
END $$;
GRANT EXECUTE ON FUNCTION executive.workflow_replay(uuid) TO eye_app, eye_commit;

-- COMPENSATE a running (partially complete) instance: its committed advances walked back newest first. A compensation the pinned spec
-- declares is RECORDED and handed to the definition's owner to confirm (a workflow.compensation_confirm task — business truth changes only
-- through the owning ports); the first one it does NOT declare makes the instance IRRECONCILABLE: recorded, the walk stops, and a
-- workflow.irreconcilable task goes to the definition's escalation principal. Nothing is inferred healthy.
CREATE OR REPLACE FUNCTION executive.compensate_workflow(p_instance uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE i executive.workflow_instances%ROWTYPE; d executive.workflow_definitions%ROWTYPE; t executive.workflow_transitions%ROWTYPE; v_action text; v_recorded jsonb := '[]'::jsonb;
        v_irr jsonb := NULL; v_task jsonb; v_status text; v_seq int;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.workflow.compensate']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'workflow rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF coalesce(length(btrim(p_reason)), 0) < 8 THEN RAISE EXCEPTION 'workflow rejected (reason): a compensation states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  SELECT * INTO i FROM executive.workflow_instances x WHERE x.instance_id = p_instance AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'workflow rejected (unknown_instance): no instance % in this domain', p_instance USING ERRCODE = '23503'; END IF;
  IF i.status <> 'running' THEN RAISE EXCEPTION 'workflow rejected (not_running): instance % is %', p_instance, i.status USING ERRCODE = '22023'; END IF;
  SELECT * INTO d FROM executive.workflow_definitions x WHERE x.definition_id = i.definition_id;
  FOR t IN SELECT * FROM executive.workflow_transitions x WHERE x.instance_id = p_instance AND x.kind IN ('advance', 'timeout') ORDER BY x.seq DESC LOOP
    v_action := d.spec -> 'compensations' ->> t.event;
    IF v_action IS NULL THEN
      v_task := executive._open_human_task(gen_random_uuid(), p_tenant, p_domain, 'workflow.irreconcilable', 'workflow.irreconcilable:' || p_instance::text,
                  jsonb_build_object('kind', 'workflow_instance', 'id', p_instance), 'Irreconcilable workflow ' || i.def_key || ' v' || i.def_version || ': ' || t.event || ' has no declared compensation',
                  d.escalation_principal_id, '{}', '{}'::jsonb, NULL, '{}'::jsonb, p_instance, i.state, p_actor, p_correlation);
      INSERT INTO executive.workflow_compensations (compensation_id, scope, tenant_id, domain_id, instance_id, for_seq, for_event, action, outcome, task_id, reason, actor_principal_id, correlation_id)
      VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_instance, t.seq, t.event, NULL, 'irreconcilable', (v_task ->> 'task_id')::uuid, btrim(p_reason), p_actor, p_correlation);
      v_irr := jsonb_build_object('seq', t.seq, 'event', t.event, 'task_id', v_task ->> 'task_id', 'escalated_to', d.escalation_principal_id);
      EXIT;
    END IF;
    INSERT INTO executive.workflow_compensations (compensation_id, scope, tenant_id, domain_id, instance_id, for_seq, for_event, action, outcome, reason, actor_principal_id, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_instance, t.seq, t.event, v_action, 'recorded', btrim(p_reason), p_actor, p_correlation);
    v_recorded := v_recorded || jsonb_build_object('seq', t.seq, 'event', t.event, 'action', v_action);
  END LOOP;
  v_status := CASE WHEN v_irr IS NULL THEN 'compensated' ELSE 'irreconcilable' END;
  v_seq := i.last_seq + 1;
  INSERT INTO executive.workflow_transitions (transition_id, scope, tenant_id, domain_id, instance_id, seq, idempotency_key, kind, event, from_state, to_state, details, actor_principal_id, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_instance, v_seq, 'compensate:' || p_correlation::text, CASE WHEN v_irr IS NULL THEN 'compensate' ELSE 'escalate' END,
          CASE WHEN v_irr IS NULL THEN 'compensated' ELSE 'irreconcilable' END, i.state, i.state,
          jsonb_build_object('reason', btrim(p_reason), 'recorded', v_recorded, 'irreconcilable', v_irr), p_actor, p_correlation);
  UPDATE executive.workflow_instances SET status = v_status, last_seq = v_seq, lease_owner = NULL, lease_until = NULL, updated_at = clock_timestamp() WHERE instance_id = p_instance;
  UPDATE executive.workflow_timers SET cancelled_at = clock_timestamp()
   WHERE owner_kind = 'workflow_instance' AND owner_id = p_instance AND fired_at IS NULL AND cancelled_at IS NULL;
  IF jsonb_array_length(v_recorded) > 0 THEN
    v_task := executive._open_human_task(gen_random_uuid(), p_tenant, p_domain, 'workflow.compensation_confirm', 'workflow.compensation_confirm:' || p_instance::text,
                jsonb_build_object('kind', 'workflow_instance', 'id', p_instance), 'Confirm the compensations of workflow ' || i.def_key || ' v' || i.def_version,
                d.owner_principal_id, '{}', '{}'::jsonb, NULL, '{}'::jsonb, p_instance, i.state, p_actor, p_correlation);
  END IF;
  RETURN jsonb_build_object('instance_id', p_instance, 'status', v_status, 'recorded', v_recorded, 'irreconcilable', v_irr,
                            'confirm_task_id', CASE WHEN jsonb_array_length(v_recorded) > 0 THEN v_task ->> 'task_id' END);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.compensate_workflow(uuid, uuid, uuid, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.compensate_workflow(uuid, uuid, uuid, text, uuid, uuid) TO eye_commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §W2 THE TIMER FIRING (the tick step `workflow-timers`, order 20; every port lists executive.attention.tick)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- CLAIM the due timers: locked FOR UPDATE SKIP LOCKED for the tick's transaction (a concurrent tick never takes the same timer).
CREATE OR REPLACE FUNCTION executive.claim_due_workflow_timers(p_tenant uuid, p_domain uuid, p_limit int) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.attention.tick']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  WITH c AS (
    SELECT t.* FROM executive.workflow_timers t
     WHERE t.tenant_id = p_tenant AND t.domain_id = p_domain AND t.fired_at IS NULL AND t.cancelled_at IS NULL AND t.due_at <= clock_timestamp()
     ORDER BY t.due_at, t.timer_id LIMIT greatest(1, least(coalesce(p_limit, 100), 500))
     FOR UPDATE SKIP LOCKED)
  SELECT coalesce(jsonb_agg(jsonb_build_object('timer_id', c.timer_id, 'owner_kind', c.owner_kind, 'owner_id', c.owner_id, 'kind', c.kind, 'due_at', c.due_at, 'payload', c.payload,
                                               'attempts', (SELECT count(*) FROM executive.workflow_timer_failures f WHERE f.timer_id = c.timer_id)) ORDER BY c.due_at), '[]'::jsonb)
    INTO v FROM c;
  RETURN v;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.claim_due_workflow_timers(uuid, uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.claim_due_workflow_timers(uuid, uuid, int) TO eye_commit;

-- FIRE ONCE (internal): fired_at set once (the prelude's trigger refuses a second), the firing recorded with its drift.
CREATE OR REPLACE FUNCTION executive._fire_workflow_timer(p_timer uuid, p_tenant uuid, p_domain uuid, p_tick_key bigint, p_tick_ref uuid, p_outcome text, p_result jsonb, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, public, pg_catalog, pg_temp AS $$
DECLARE t executive.workflow_timers%ROWTYPE; v_at timestamptz := clock_timestamp(); v_drift numeric;
BEGIN
  SELECT * INTO t FROM executive.workflow_timers x WHERE x.timer_id = p_timer AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'workflow timer rejected (unknown_timer): no timer % in this domain', p_timer USING ERRCODE = '23503'; END IF;
  IF t.fired_at IS NOT NULL THEN RAISE EXCEPTION 'workflow timer rejected (fired): timer % fired at % — a timer fires once', p_timer, t.fired_at USING ERRCODE = '23505'; END IF;
  IF t.cancelled_at IS NOT NULL THEN RAISE EXCEPTION 'workflow timer rejected (cancelled): timer % was cancelled at %', p_timer, t.cancelled_at USING ERRCODE = '23505'; END IF;
  IF t.due_at > v_at THEN RAISE EXCEPTION 'workflow timer rejected (not_due): timer % is due at %', p_timer, t.due_at USING ERRCODE = '22023'; END IF;
  v_drift := round(extract(epoch FROM v_at - t.due_at)::numeric, 3);
  UPDATE executive.workflow_timers SET fired_at = v_at, fired_by_tick = p_tick_ref, drift_seconds = v_drift WHERE timer_id = p_timer;
  INSERT INTO executive.workflow_timer_firings (timer_id, scope, tenant_id, domain_id, kind, tick_key, tick_ref, outcome, result, drift_seconds, fired_by, correlation_id)
  VALUES (p_timer, 'DOMAIN', p_tenant, p_domain, t.kind, p_tick_key, p_tick_ref, p_outcome, coalesce(p_result, '{}'::jsonb), v_drift, p_actor, p_correlation);
  RETURN jsonb_build_object('timer_id', p_timer, 'kind', t.kind, 'fired_at', v_at, 'drift_seconds', v_drift, 'outcome', p_outcome);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive._fire_workflow_timer(uuid, uuid, uuid, bigint, uuid, text, jsonb, uuid, uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION executive.fire_workflow_timer(p_timer uuid, p_tenant uuid, p_domain uuid, p_tick_key bigint, p_tick_ref uuid, p_outcome text, p_result jsonb, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, observation, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.attention.tick']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'workflow timer rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF p_outcome NOT IN ('fired', 'skipped') THEN RAISE EXCEPTION 'workflow timer rejected (outcome): a firing is fired or skipped' USING ERRCODE = '22023'; END IF;
  RETURN executive._fire_workflow_timer(p_timer, p_tenant, p_domain, p_tick_key, p_tick_ref, p_outcome, p_result, p_actor, p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.fire_workflow_timer(uuid, uuid, uuid, bigint, uuid, text, jsonb, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.fire_workflow_timer(uuid, uuid, uuid, bigint, uuid, text, jsonb, uuid, uuid) TO eye_commit;

-- A HANDLER THAT FAILED: recorded; the timer stays due (the next tick retries it); the third failure fires it as `failed` (abandoned —
-- visible on the firing ledger, never silently dropped).
CREATE OR REPLACE FUNCTION executive.record_workflow_timer_failure(p_timer uuid, p_tenant uuid, p_domain uuid, p_error text, p_tick_key bigint, p_tick_ref uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_attempt int; v_fired jsonb := NULL;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.attention.tick']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'workflow timer rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT count(*) + 1 INTO v_attempt FROM executive.workflow_timer_failures f WHERE f.timer_id = p_timer;
  INSERT INTO executive.workflow_timer_failures (failure_id, scope, tenant_id, domain_id, timer_id, attempt, error, tick_key, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_timer, v_attempt, left(coalesce(p_error, 'the handler failed without a reason'), 1000), p_tick_key, p_correlation);
  IF v_attempt >= 3 THEN
    v_fired := executive._fire_workflow_timer(p_timer, p_tenant, p_domain, p_tick_key, p_tick_ref, 'failed', jsonb_build_object('abandoned_after', v_attempt, 'last_error', left(p_error, 500)), p_actor, p_correlation);
  END IF;
  RETURN jsonb_build_object('timer_id', p_timer, 'attempt', v_attempt, 'abandoned', v_fired IS NOT NULL);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.record_workflow_timer_failure(uuid, uuid, uuid, text, bigint, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.record_workflow_timer_failure(uuid, uuid, uuid, text, bigint, uuid, uuid, uuid) TO eye_commit;

-- task.deadline → ESCALATE the task: the assignee → the escalation principal (a member; unchanged when there is none or it already holds
-- the task), the candidate roles widened by escalation.roles, level + 1, the next deadline extend_minutes later (default 1440) — a
-- deadline timer again, so a task at max_escalations records task.escalation_exhausted when that deadline passes and stays visible. A
-- task no longer open, or a timer that is not the task's current deadline, is SKIPPED (answered, nothing changed).
CREATE OR REPLACE FUNCTION executive.escalate_human_task(p_timer uuid, p_tenant uuid, p_domain uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE tm executive.workflow_timers%ROWTYPE; t executive.human_tasks%ROWTYPE; v_max int; v_extend int; v_to uuid; v_roles text[]; v_next timestamptz; v_timer uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.attention.tick']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'human task rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO tm FROM executive.workflow_timers x WHERE x.timer_id = p_timer AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND OR tm.kind <> 'task.deadline' OR tm.owner_kind <> 'task' THEN RAISE EXCEPTION 'workflow timer rejected (kind): % is not a task deadline', p_timer USING ERRCODE = '22023'; END IF;
  SELECT * INTO t FROM executive.human_tasks x WHERE x.task_id = tm.owner_id FOR UPDATE;
  IF NOT FOUND OR t.state NOT IN ('open', 'escalated') OR t.deadline_timer_id IS DISTINCT FROM p_timer THEN
    RETURN jsonb_build_object('task_id', tm.owner_id, 'skipped', true, 'state', t.state);
  END IF;
  v_max := coalesce((t.escalation ->> 'max_escalations')::int, 0);
  v_extend := coalesce((t.escalation ->> 'extend_minutes')::int, 1440);
  IF t.escalation_level >= v_max THEN
    INSERT INTO executive.human_task_events (event_id, scope, tenant_id, domain_id, task_id, event, actor_principal_id, details, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, t.task_id, 'task.escalation_exhausted', p_actor,
            jsonb_build_object('missed_deadline', t.deadline_at, 'escalation_level', t.escalation_level, 'max_escalations', v_max, 'assignee', t.assignee_principal_id), p_correlation);
    UPDATE executive.human_tasks SET deadline_timer_id = NULL, updated_at = clock_timestamp() WHERE task_id = t.task_id;
    RETURN jsonb_build_object('task_id', t.task_id, 'exhausted', true, 'escalation_level', t.escalation_level, 'assignee', t.assignee_principal_id);
  END IF;
  v_to := nullif(t.escalation ->> 'principal', '')::uuid;
  IF v_to IS NULL OR v_to = t.assignee_principal_id OR NOT decision.is_active_human(v_to, p_tenant) THEN v_to := t.assignee_principal_id; END IF;
  SELECT ARRAY(SELECT DISTINCT x FROM unnest(t.candidate_roles || ARRAY(SELECT jsonb_array_elements_text(coalesce(t.escalation -> 'roles', '[]'::jsonb)))) x ORDER BY 1) INTO v_roles;
  v_next := clock_timestamp() + make_interval(mins => v_extend);
  v_timer := executive._schedule_timer(gen_random_uuid(), p_tenant, p_domain, 'task', t.task_id, 'task.deadline', v_next, jsonb_build_object('kind', t.kind, 'escalation_level', t.escalation_level + 1), p_actor, p_correlation);
  UPDATE executive.human_tasks SET state = 'escalated', escalation_level = t.escalation_level + 1, assignee_principal_id = v_to, candidate_roles = v_roles,
         deadline_at = v_next, deadline_timer_id = v_timer, updated_at = clock_timestamp() WHERE task_id = t.task_id;
  INSERT INTO executive.human_task_assignments (assignment_id, scope, tenant_id, domain_id, task_id, from_principal, to_principal, reason, actor_principal_id, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, t.task_id, t.assignee_principal_id, v_to, 'escalate', p_actor, p_correlation);
  INSERT INTO executive.human_task_events (event_id, scope, tenant_id, domain_id, task_id, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, t.task_id, 'task.escalated', p_actor,
          jsonb_build_object('escalation_level', t.escalation_level + 1, 'missed_deadline', t.deadline_at, 'from', t.assignee_principal_id, 'to', v_to,
                             'candidate_roles', to_jsonb(v_roles), 'next_deadline', v_next, 'timer_id', p_timer), p_correlation);
  RETURN jsonb_build_object('task_id', t.task_id, 'escalated', true, 'escalation_level', t.escalation_level + 1, 'from', t.assignee_principal_id, 'to', v_to, 'next_deadline', v_next, 'next_timer_id', v_timer);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.escalate_human_task(uuid, uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.escalate_human_task(uuid, uuid, uuid, uuid, uuid) TO eye_commit;

-- task.reminder → the reminder recorded on the task (the attention part's delivery is not engaged here).
CREATE OR REPLACE FUNCTION executive.remind_human_task(p_timer uuid, p_tenant uuid, p_domain uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE tm executive.workflow_timers%ROWTYPE; t executive.human_tasks%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.attention.tick']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'human task rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO tm FROM executive.workflow_timers x WHERE x.timer_id = p_timer AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND OR tm.kind <> 'task.reminder' OR tm.owner_kind <> 'task' THEN RAISE EXCEPTION 'workflow timer rejected (kind): % is not a task reminder', p_timer USING ERRCODE = '22023'; END IF;
  SELECT * INTO t FROM executive.human_tasks x WHERE x.task_id = tm.owner_id;
  IF NOT FOUND OR t.state NOT IN ('open', 'escalated') THEN RETURN jsonb_build_object('task_id', tm.owner_id, 'skipped', true); END IF;
  INSERT INTO executive.human_task_events (event_id, scope, tenant_id, domain_id, task_id, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, t.task_id, 'task.reminded', p_actor, jsonb_build_object('assignee', t.assignee_principal_id, 'deadline_at', t.deadline_at, 'timer_id', p_timer), p_correlation);
  RETURN jsonb_build_object('task_id', t.task_id, 'reminded', t.assignee_principal_id);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.remind_human_task(uuid, uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.remind_human_task(uuid, uuid, uuid, uuid, uuid) TO eye_commit;

-- workflow.step_timeout → the timeout event of the state it guards (exactly once: idempotency key timeout:<timer>); an instance that has
-- moved on (another seq) or stopped is SKIPPED.
CREATE OR REPLACE FUNCTION executive.workflow_step_timeout(p_timer uuid, p_tenant uuid, p_domain uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE tm executive.workflow_timers%ROWTYPE; i executive.workflow_instances%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.attention.tick']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'workflow rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO tm FROM executive.workflow_timers x WHERE x.timer_id = p_timer AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND OR tm.kind <> 'workflow.step_timeout' THEN RAISE EXCEPTION 'workflow timer rejected (kind): % is not a step timeout', p_timer USING ERRCODE = '22023'; END IF;
  SELECT * INTO i FROM executive.workflow_instances x WHERE x.instance_id = tm.owner_id;
  IF NOT FOUND OR i.status <> 'running' OR i.last_seq <> (tm.payload ->> 'seq')::int OR i.state <> tm.payload ->> 'state' THEN
    RETURN jsonb_build_object('instance_id', tm.owner_id, 'skipped', true, 'state', i.state, 'seq', i.last_seq);
  END IF;
  RETURN executive._workflow_transition(i.instance_id, p_tenant, p_domain, tm.payload ->> 'event', 'timeout:' || p_timer::text, 'timeout', p_timer,
                                        jsonb_build_object('timer_id', p_timer, 'due_at', tm.due_at), p_actor, p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.workflow_step_timeout(uuid, uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.workflow_step_timeout(uuid, uuid, uuid, uuid, uuid) TO eye_commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §W3 THE HUMAN TASKS' PORTS (reassign, complete)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- Whether a principal holds a live binding of one of the roles in this domain (DOMAIN here, or TENANT) — a revoked binding holds nothing.
CREATE OR REPLACE FUNCTION executive.holds_any_role(p_principal uuid, p_tenant uuid, p_domain uuid, p_roles text[]) RETURNS boolean
STABLE SECURITY DEFINER SET search_path = identity, pg_catalog, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM identity.role_bindings b WHERE b.principal_id = p_principal AND b.role_code = ANY (p_roles) AND b.tenant_id = p_tenant AND b.revoked_at IS NULL
                   AND ((b.scope = 'DOMAIN' AND b.domain_id = p_domain) OR b.scope = 'TENANT'));
$$ LANGUAGE sql;
REVOKE ALL ON FUNCTION executive.holds_any_role(uuid, uuid, uuid, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.holds_any_role(uuid, uuid, uuid, text[]) TO eye_app, eye_commit;

-- REASSIGN: the work moves; the authority does not. The target is an active MEMBER (a collab task may go to an external only through an
-- invitation's own grant, never here); a gate.* task's STORED eligibility is re-checked against the target ({roles?: [..], exclude?: [..]}:
-- a live binding of one of the roles, not an excluded principal). The acting human is the current assignee, or an executive or a domain
-- administrator of the domain.
CREATE OR REPLACE FUNCTION executive.reassign_human_task(p_task uuid, p_tenant uuid, p_domain uuid, p_to uuid, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE t executive.human_tasks%ROWTYPE; v_roles text[];
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.task.reassign']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'human task rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF coalesce(length(btrim(p_reason)), 0) < 8 THEN RAISE EXCEPTION 'human task rejected (reason): a reassignment states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  SELECT * INTO t FROM executive.human_tasks x WHERE x.task_id = p_task AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'human task rejected (unknown_task): no task % in this domain', p_task USING ERRCODE = '23503'; END IF;
  IF t.state NOT IN ('open', 'escalated') THEN RAISE EXCEPTION 'human task rejected (closed): task % is %', p_task, t.state USING ERRCODE = '23505'; END IF;
  IF p_actor IS DISTINCT FROM t.assignee_principal_id AND NOT executive.holds_any_role(p_actor, p_tenant, p_domain, ARRAY['executive', 'domain_admin']) THEN
    RAISE EXCEPTION 'human task rejected (not_assignee): a task is reassigned by its assignee, an executive or a domain administrator' USING ERRCODE = '42501';
  END IF;
  IF p_to IS NULL OR NOT decision.is_active_human(p_to, p_tenant) THEN
    RAISE EXCEPTION 'human task rejected (not_member): % is not an active member of this tenant — reassignment moves work to a member', p_to USING ERRCODE = '22023';
  END IF;
  IF p_to = t.assignee_principal_id THEN RAISE EXCEPTION 'human task rejected (unchanged): % already holds task %', p_to, p_task USING ERRCODE = '22023'; END IF;
  IF t.kind LIKE 'gate.%' THEN
    SELECT ARRAY(SELECT jsonb_array_elements_text(coalesce(t.eligibility -> 'roles', '[]'::jsonb))) INTO v_roles;
    IF (cardinality(v_roles) > 0 AND NOT executive.holds_any_role(p_to, p_tenant, p_domain, v_roles))
       OR coalesce(t.eligibility -> 'exclude', '[]'::jsonb) ? p_to::text THEN
      RAISE EXCEPTION 'human task rejected (not_eligible): % does not meet the stored eligibility of the % task (roles %, exclusions) — reassignment moves work, never authority',
        p_to, t.kind, array_to_string(v_roles, ', ') USING ERRCODE = '22023';
    END IF;
  END IF;
  UPDATE executive.human_tasks SET assignee_principal_id = p_to, updated_at = clock_timestamp() WHERE task_id = p_task;
  INSERT INTO executive.human_task_assignments (assignment_id, scope, tenant_id, domain_id, task_id, from_principal, to_principal, reason, actor_principal_id, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_task, t.assignee_principal_id, p_to, 'reassign', p_actor, p_correlation);
  INSERT INTO executive.human_task_events (event_id, scope, tenant_id, domain_id, task_id, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_task, 'task.reassigned', p_actor, jsonb_build_object('from', t.assignee_principal_id, 'to', p_to, 'reason', btrim(p_reason)), p_correlation);
  RETURN jsonb_build_object('task_id', p_task, 'from', t.assignee_principal_id, 'to', p_to, 'state', t.state, 'deadline_at', t.deadline_at);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.reassign_human_task(uuid, uuid, uuid, uuid, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.reassign_human_task(uuid, uuid, uuid, uuid, text, uuid, uuid) TO eye_commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §W4 / §W5 THE COLLABORATION PORTS
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION executive._collab_event(p_ws uuid, p_tenant uuid, p_domain uuid, p_event text, p_actor uuid, p_details jsonb, p_correlation uuid) RETURNS void
SECURITY DEFINER SET search_path = executive, public, pg_catalog, pg_temp AS $$
  INSERT INTO executive.collab_events (event_id, scope, tenant_id, domain_id, workspace_id, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_ws, p_event, p_actor, coalesce(p_details, '{}'::jsonb), p_correlation);
$$ LANGUAGE sql;
REVOKE ALL ON FUNCTION executive._collab_event(uuid, uuid, uuid, text, uuid, jsonb, uuid) FROM PUBLIC;

-- THE GUARD every collaboration port calls: the workspace exists in this domain and is open; the actor is an active participant; an
-- EXTERNAL actor holds a LIVE grant on it — accepted, not expired, not revoked or lapsed, the context's purpose the grant's purpose.
-- Answers the ceiling the actor works under (the workspace's for a member; the grant's audience ceiling for an external).
CREATE OR REPLACE FUNCTION executive._collab_guard(p_ws uuid, p_tenant uuid, p_domain uuid, p_actor uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, identity, public, pg_catalog, pg_temp AS $$
DECLARE w executive.collab_workspaces%ROWTYPE; v_aff text; g executive.collab_grants%ROWTYPE; pt executive.collab_participants%ROWTYPE;
BEGIN
  SELECT * INTO w FROM executive.collab_workspaces x WHERE x.workspace_id = p_ws AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'collaboration rejected (unknown_workspace): no workspace % in this domain', p_ws USING ERRCODE = '23503'; END IF;
  IF w.state <> 'open' THEN RAISE EXCEPTION 'collaboration rejected (closed): workspace % is closed', p_ws USING ERRCODE = '23505'; END IF;
  SELECT executive.principal_affiliation(p.id) INTO v_aff FROM identity.principals p WHERE p.id = p_actor AND p.tenant_id = p_tenant AND p.status = 'active' AND p.kind = 'human';
  IF v_aff IS NULL THEN RAISE EXCEPTION 'collaboration rejected (not_participant): the actor is not an active human of this tenant' USING ERRCODE = '42501'; END IF;
  SELECT * INTO pt FROM executive.collab_participants x WHERE x.workspace_id = p_ws AND x.principal_id = p_actor AND x.removed_at IS NULL;
  IF v_aff = 'external' THEN
    SELECT * INTO g FROM executive.collab_grants x WHERE x.workspace_id = p_ws AND x.principal_id = p_actor ORDER BY x.invited_at DESC LIMIT 1;
    IF NOT FOUND THEN RAISE EXCEPTION 'collaboration rejected (no_grant): an external collaborator acts only inside a grant on this workspace' USING ERRCODE = '42501'; END IF;
    IF g.state IN ('revoked', 'lapsed') THEN RAISE EXCEPTION 'collaboration rejected (grant_%): the grant on this workspace was % — access is lost', g.state, g.state USING ERRCODE = '42501'; END IF;
    IF g.expires_at <= clock_timestamp() THEN RAISE EXCEPTION 'collaboration rejected (grant_expired): the grant expired at %', g.expires_at USING ERRCODE = '42501'; END IF;
    IF g.state <> 'accepted' THEN RAISE EXCEPTION 'collaboration rejected (grant_not_accepted): the invitation is accepted before any act' USING ERRCODE = '42501'; END IF;
    IF public.eye_purpose() IS DISTINCT FROM g.purpose THEN
      RAISE EXCEPTION 'collaboration rejected (purpose): the grant is for the purpose %; this request states %', g.purpose, coalesce(public.eye_purpose(), '<none>') USING ERRCODE = '42501';
    END IF;
    IF pt.participant_id IS NULL THEN RAISE EXCEPTION 'collaboration rejected (not_participant): the external collaborator was removed from this workspace' USING ERRCODE = '42501'; END IF;
    RETURN jsonb_build_object('affiliation', 'external', 'ceiling', g.audience_ceiling, 'grant_id', g.grant_id, 'role', pt.role, 'owner', w.owner_principal_id, 'workspace_ceiling', w.classification_ceiling);
  END IF;
  IF pt.participant_id IS NULL THEN RAISE EXCEPTION 'collaboration rejected (not_participant): % takes no part in workspace %', p_actor, p_ws USING ERRCODE = '42501'; END IF;
  RETURN jsonb_build_object('affiliation', 'member', 'ceiling', w.classification_ceiling, 'grant_id', NULL, 'role', pt.role, 'owner', w.owner_principal_id, 'workspace_ceiling', w.classification_ceiling);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive._collab_guard(uuid, uuid, uuid, uuid) FROM PUBLIC;

-- OPEN a workspace: its subject, purpose and classification ceiling; the opener its owner (a member).
CREATE OR REPLACE FUNCTION executive.open_collab_workspace(p_ws uuid, p_tenant uuid, p_domain uuid, p_title text, p_subject jsonb, p_purpose text, p_ceiling text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, decision, observation, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.collab.workspace.open']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'collaboration rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF NOT decision.is_active_human(p_actor, p_tenant) THEN RAISE EXCEPTION 'collaboration rejected (not_member): a workspace is opened and owned by a member' USING ERRCODE = '42501'; END IF;
  IF coalesce(length(btrim(p_title)), 0) NOT BETWEEN 3 AND 300 THEN RAISE EXCEPTION 'collaboration rejected (title): a workspace has a title (3..300 characters)' USING ERRCODE = '22023'; END IF;
  IF p_subject IS NULL OR jsonb_typeof(p_subject) <> 'object' OR NOT (p_subject ? 'kind' AND p_subject ? 'id') THEN RAISE EXCEPTION 'collaboration rejected (subject): the subject is {kind, id}' USING ERRCODE = '22023'; END IF;
  IF coalesce(length(btrim(p_purpose)), 0) NOT BETWEEN 3 AND 100 THEN RAISE EXCEPTION 'collaboration rejected (purpose): a workspace names its purpose' USING ERRCODE = '22023'; END IF;
  IF executive.collab_class_rank(p_ceiling) IS NULL THEN RAISE EXCEPTION 'collaboration rejected (ceiling): the classification ceiling is public, internal, confidential or restricted' USING ERRCODE = '22023'; END IF;
  INSERT INTO executive.collab_workspaces (workspace_id, scope, tenant_id, domain_id, title, subject, purpose, classification_ceiling, owner_principal_id, opened_by, correlation_id)
  VALUES (p_ws, 'DOMAIN', p_tenant, p_domain, btrim(p_title), p_subject, btrim(p_purpose), p_ceiling, p_actor, p_actor, p_correlation);
  INSERT INTO executive.collab_participants (participant_id, scope, tenant_id, domain_id, workspace_id, principal_id, role, affiliation, added_by, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_ws, p_actor, 'owner', 'member', p_actor, p_correlation);
  PERFORM executive._collab_event(p_ws, p_tenant, p_domain, 'workspace.opened', p_actor, jsonb_build_object('subject', p_subject, 'purpose', btrim(p_purpose), 'ceiling', p_ceiling), p_correlation);
  RETURN jsonb_build_object('workspace_id', p_ws, 'owner', p_actor, 'purpose', btrim(p_purpose), 'classification_ceiling', p_ceiling, 'state', 'open');
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.open_collab_workspace(uuid, uuid, uuid, text, jsonb, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.open_collab_workspace(uuid, uuid, uuid, text, jsonb, text, text, uuid, uuid) TO eye_commit;

-- ADD or REMOVE a MEMBER participant (the owner's act). An external joins only by invitation and leaves by revocation or lapse.
CREATE OR REPLACE FUNCTION executive.set_collab_participant(p_ws uuid, p_tenant uuid, p_domain uuid, p_principal uuid, p_role text, p_op text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE gd jsonb; pt executive.collab_participants%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.collab.participant.set']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'collaboration rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  gd := executive._collab_guard(p_ws, p_tenant, p_domain, p_actor);
  IF (gd ->> 'owner')::uuid IS DISTINCT FROM p_actor THEN RAISE EXCEPTION 'collaboration rejected (not_owner): the workspace''s owner sets its participants' USING ERRCODE = '42501'; END IF;
  IF p_op NOT IN ('add', 'remove') THEN RAISE EXCEPTION 'collaboration rejected (op): add or remove' USING ERRCODE = '22023'; END IF;
  SELECT * INTO pt FROM executive.collab_participants x WHERE x.workspace_id = p_ws AND x.principal_id = p_principal;
  IF p_op = 'add' THEN
    IF p_role NOT IN ('contributor', 'reviewer', 'observer') THEN RAISE EXCEPTION 'collaboration rejected (role): a participant is a contributor, a reviewer or an observer' USING ERRCODE = '22023'; END IF;
    IF NOT decision.is_active_human(p_principal, p_tenant) THEN
      RAISE EXCEPTION 'collaboration rejected (members_only): % is not an active member — an external collaborator joins only by invitation', p_principal USING ERRCODE = '22023';
    END IF;
    IF pt.participant_id IS NOT NULL THEN RAISE EXCEPTION 'collaboration rejected (duplicate): % already takes part (or took part) in this workspace', p_principal USING ERRCODE = '23505'; END IF;
    INSERT INTO executive.collab_participants (participant_id, scope, tenant_id, domain_id, workspace_id, principal_id, role, affiliation, added_by, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_ws, p_principal, p_role, 'member', p_actor, p_correlation);
    PERFORM executive._collab_event(p_ws, p_tenant, p_domain, 'participant.added', p_actor, jsonb_build_object('principal', p_principal, 'role', p_role), p_correlation);
  ELSE
    IF pt.participant_id IS NULL OR pt.removed_at IS NOT NULL THEN RAISE EXCEPTION 'collaboration rejected (not_participant): % takes no part in workspace %', p_principal, p_ws USING ERRCODE = '42501'; END IF;
    IF pt.role = 'owner' OR pt.affiliation = 'external' THEN RAISE EXCEPTION 'collaboration rejected (role): the owner stays; an external leaves by revoking their grant' USING ERRCODE = '22023'; END IF;
    UPDATE executive.collab_participants SET removed_at = clock_timestamp(), removed_by = p_actor, removal_reason = 'removed by the owner' WHERE participant_id = pt.participant_id;
    PERFORM executive._collab_event(p_ws, p_tenant, p_domain, 'participant.removed', p_actor, jsonb_build_object('principal', p_principal), p_correlation);
  END IF;
  RETURN jsonb_build_object('workspace_id', p_ws, 'principal', p_principal, 'op', p_op, 'role', coalesce(p_role, pt.role));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.set_collab_participant(uuid, uuid, uuid, uuid, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.set_collab_participant(uuid, uuid, uuid, uuid, text, text, uuid, uuid) TO eye_commit;

-- POST a message (a new thread when none is named). Mentions name participants of the workspace.
CREATE OR REPLACE FUNCTION executive.post_collab_message(p_message uuid, p_thread uuid, p_new_thread_title text, p_tenant uuid, p_domain uuid, p_ws uuid, p_body text, p_body_digest text,
                                                         p_mentions uuid[], p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE gd jsonb; v_thread uuid := p_thread; v_bad uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.collab.discuss']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'collaboration rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  gd := executive._collab_guard(p_ws, p_tenant, p_domain, p_actor);
  IF gd ->> 'role' = 'observer' THEN RAISE EXCEPTION 'collaboration rejected (observer): an observer reads the workspace and does not post' USING ERRCODE = '42501'; END IF;
  IF coalesce(length(btrim(p_body)), 0) NOT BETWEEN 1 AND 8000 THEN RAISE EXCEPTION 'collaboration rejected (body): a message is 1..8000 characters' USING ERRCODE = '22023'; END IF;
  IF p_body_digest IS DISTINCT FROM encode(sha256(convert_to(p_body, 'UTF8')), 'hex') THEN RAISE EXCEPTION 'collaboration rejected (digest): the body digest is the sha-256 of the body' USING ERRCODE = '22023'; END IF;
  SELECT m INTO v_bad FROM unnest(coalesce(p_mentions, '{}')) m WHERE NOT EXISTS (SELECT 1 FROM executive.collab_participants x WHERE x.workspace_id = p_ws AND x.principal_id = m AND x.removed_at IS NULL) LIMIT 1;
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION 'collaboration rejected (mention): % takes no part in this workspace', v_bad USING ERRCODE = '22023'; END IF;
  IF v_thread IS NULL THEN
    IF coalesce(length(btrim(p_new_thread_title)), 0) NOT BETWEEN 3 AND 300 THEN RAISE EXCEPTION 'collaboration rejected (thread): a new thread has a title (3..300 characters)' USING ERRCODE = '22023'; END IF;
    v_thread := gen_random_uuid();
    INSERT INTO executive.collab_threads (thread_id, scope, tenant_id, domain_id, workspace_id, title, opened_by, correlation_id)
    VALUES (v_thread, 'DOMAIN', p_tenant, p_domain, p_ws, btrim(p_new_thread_title), p_actor, p_correlation);
    PERFORM executive._collab_event(p_ws, p_tenant, p_domain, 'thread.opened', p_actor, jsonb_build_object('thread_id', v_thread, 'title', btrim(p_new_thread_title)), p_correlation);
  ELSIF NOT EXISTS (SELECT 1 FROM executive.collab_threads x WHERE x.thread_id = v_thread AND x.workspace_id = p_ws) THEN
    RAISE EXCEPTION 'collaboration rejected (unknown_thread): no thread % in workspace %', v_thread, p_ws USING ERRCODE = '23503';
  END IF;
  INSERT INTO executive.collab_messages (message_id, scope, tenant_id, domain_id, workspace_id, thread_id, author_principal_id, author_affiliation, body, body_digest, mentions, correlation_id)
  VALUES (p_message, 'DOMAIN', p_tenant, p_domain, p_ws, v_thread, p_actor, gd ->> 'affiliation', p_body, p_body_digest, coalesce(p_mentions, '{}'), p_correlation);
  PERFORM executive._collab_event(p_ws, p_tenant, p_domain, 'message.posted', p_actor, jsonb_build_object('thread_id', v_thread, 'message_id', p_message, 'mentions', to_jsonb(coalesce(p_mentions, '{}'))), p_correlation);
  RETURN jsonb_build_object('message_id', p_message, 'thread_id', v_thread, 'author', p_actor, 'affiliation', gd ->> 'affiliation');
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.post_collab_message(uuid, uuid, text, uuid, uuid, uuid, text, text, uuid[], uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.post_collab_message(uuid, uuid, text, uuid, uuid, uuid, text, text, uuid[], uuid, uuid) TO eye_commit;

-- ADD an artifact (the next version of its key): classified AT OR BELOW the ceiling the actor works under (the workspace's; an external's
-- grant's audience ceiling).
CREATE OR REPLACE FUNCTION executive.add_collab_artifact(p_artifact uuid, p_tenant uuid, p_domain uuid, p_ws uuid, p_key text, p_title text, p_kind text, p_classification text,
                                                         p_content text, p_object_ref jsonb, p_content_digest text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE gd jsonb; v_version int;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.collab.discuss']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'collaboration rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  gd := executive._collab_guard(p_ws, p_tenant, p_domain, p_actor);
  IF gd ->> 'role' = 'observer' THEN RAISE EXCEPTION 'collaboration rejected (observer): an observer reads the workspace and does not add artifacts' USING ERRCODE = '42501'; END IF;
  IF executive.collab_class_rank(p_classification) IS NULL THEN RAISE EXCEPTION 'collaboration rejected (classification): public, internal, confidential or restricted' USING ERRCODE = '22023'; END IF;
  IF executive.collab_class_rank(p_classification) > executive.collab_class_rank(gd ->> 'ceiling') THEN
    RAISE EXCEPTION 'collaboration rejected (above_ceiling): % is above the ceiling % this actor works under in this workspace', p_classification, gd ->> 'ceiling' USING ERRCODE = '22023';
  END IF;
  IF coalesce(p_key, '') !~ '^[a-z0-9][a-z0-9_.-]{1,63}$' OR coalesce(length(btrim(p_title)), 0) NOT BETWEEN 3 AND 300 OR p_kind NOT IN ('note', 'document', 'evidence_ref') THEN
    RAISE EXCEPTION 'collaboration rejected (artifact): an artifact has a key, a title (3..300) and a kind (note, document, evidence_ref)' USING ERRCODE = '22023';
  END IF;
  IF (p_kind = 'evidence_ref') <> (p_object_ref IS NOT NULL) OR (p_kind <> 'evidence_ref' AND coalesce(length(btrim(p_content)), 0) NOT BETWEEN 1 AND 20000)
     OR (p_object_ref IS NOT NULL AND NOT (jsonb_typeof(p_object_ref) = 'object' AND p_object_ref ? 'object_id')) THEN
    RAISE EXCEPTION 'collaboration rejected (artifact): an evidence_ref names {object_id, version?}; a note or a document carries its content (1..20000)' USING ERRCODE = '22023';
  END IF;
  IF coalesce(p_content_digest, '') !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'collaboration rejected (digest): an artifact carries its content digest' USING ERRCODE = '22023'; END IF;
  SELECT coalesce(max(version), 0) + 1 INTO v_version FROM executive.collab_artifacts x WHERE x.workspace_id = p_ws AND x.artifact_key = p_key;
  INSERT INTO executive.collab_artifacts (artifact_id, scope, tenant_id, domain_id, workspace_id, artifact_key, version, title, kind, classification, content, object_ref, content_digest, added_by, correlation_id)
  VALUES (p_artifact, 'DOMAIN', p_tenant, p_domain, p_ws, p_key, v_version, btrim(p_title), p_kind, p_classification, p_content, p_object_ref, p_content_digest, p_actor, p_correlation);
  PERFORM executive._collab_event(p_ws, p_tenant, p_domain, 'artifact.added', p_actor, jsonb_build_object('artifact_id', p_artifact, 'artifact_key', p_key, 'version', v_version, 'classification', p_classification), p_correlation);
  RETURN jsonb_build_object('artifact_id', p_artifact, 'artifact_key', p_key, 'version', v_version, 'classification', p_classification);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.add_collab_artifact(uuid, uuid, uuid, uuid, text, text, text, text, text, jsonb, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.add_collab_artifact(uuid, uuid, uuid, uuid, text, text, text, text, text, jsonb, text, uuid, uuid) TO eye_commit;

-- REQUEST A REVIEW (a member participant's act): a collab.review task to a participant — a member, or an external whose grant is live
-- (invited or accepted, unexpired) — with a deadline and an escalation {principal (a member), roles?, max_escalations, extend_minutes}.
-- Idempotent on the request key (a duplicate request answers the task it opened).
CREATE OR REPLACE FUNCTION executive.request_collab_review(p_task uuid, p_tenant uuid, p_domain uuid, p_ws uuid, p_reviewer uuid, p_title text, p_deadline_at timestamptz, p_escalation jsonb,
                                                           p_request_key text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE gd jsonb; pt executive.collab_participants%ROWTYPE; g executive.collab_grants%ROWTYPE; r jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.collab.review.request']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'collaboration rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  gd := executive._collab_guard(p_ws, p_tenant, p_domain, p_actor);
  IF gd ->> 'affiliation' <> 'member' THEN RAISE EXCEPTION 'collaboration rejected (not_member): a review is requested by a member participant' USING ERRCODE = '42501'; END IF;
  SELECT * INTO pt FROM executive.collab_participants x WHERE x.workspace_id = p_ws AND x.principal_id = p_reviewer AND x.removed_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'collaboration rejected (not_participant): % takes no part in workspace %', p_reviewer, p_ws USING ERRCODE = '42501'; END IF;
  IF pt.affiliation = 'external' THEN
    SELECT * INTO g FROM executive.collab_grants x WHERE x.grant_id = pt.grant_id;
    IF g.state NOT IN ('invited', 'accepted') OR g.expires_at <= clock_timestamp() THEN
      RAISE EXCEPTION 'collaboration rejected (grant_%): the reviewer''s grant is not live', CASE WHEN g.expires_at <= clock_timestamp() THEN 'expired' ELSE g.state END USING ERRCODE = '42501';
    END IF;
    IF p_deadline_at IS NOT NULL AND p_deadline_at > g.expires_at THEN
      RAISE EXCEPTION 'collaboration rejected (deadline): the deadline % is after the reviewer''s grant expires (%)', p_deadline_at, g.expires_at USING ERRCODE = '22023';
    END IF;
  END IF;
  IF coalesce(length(btrim(p_request_key)), 0) < 3 THEN RAISE EXCEPTION 'collaboration rejected (request_key): a review request names its idempotency key' USING ERRCODE = '22023'; END IF;
  r := executive._open_human_task(p_task, p_tenant, p_domain, 'collab.review', 'collab.review:' || p_ws::text || ':' || btrim(p_request_key),
         jsonb_build_object('kind', 'workspace', 'id', p_ws, 'request', p_task), coalesce(nullif(btrim(p_title), ''), 'Review requested'), p_reviewer, '{}',
         jsonb_build_object('workspace', p_ws, 'grant', pt.grant_id), p_deadline_at, coalesce(p_escalation, '{}'::jsonb), NULL, NULL, p_actor, p_correlation);
  IF NOT (r ->> 'repeated')::boolean THEN
    PERFORM executive._collab_event(p_ws, p_tenant, p_domain, 'review.requested', p_actor,
              jsonb_build_object('task_id', r ->> 'task_id', 'reviewer', p_reviewer, 'deadline_at', p_deadline_at, 'escalation', coalesce(p_escalation, '{}'::jsonb)), p_correlation);
  END IF;
  RETURN r || jsonb_build_object('workspace_id', p_ws, 'reviewer', p_reviewer);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.request_collab_review(uuid, uuid, uuid, uuid, uuid, text, timestamptz, jsonb, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.request_collab_review(uuid, uuid, uuid, uuid, uuid, text, timestamptz, jsonb, text, uuid, uuid) TO eye_commit;

-- RECORD A REVIEW with its verdict; naming the collab.review task it answers completes that task — only its current assignee's review does.
CREATE OR REPLACE FUNCTION executive.record_collab_review(p_review uuid, p_tenant uuid, p_domain uuid, p_ws uuid, p_task uuid, p_artifact uuid, p_verdict text, p_statement text,
                                                          p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE gd jsonb; t executive.human_tasks%ROWTYPE; a executive.collab_artifacts%ROWTYPE; v_res jsonb := NULL;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.collab.review']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'collaboration rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  gd := executive._collab_guard(p_ws, p_tenant, p_domain, p_actor);
  IF p_verdict NOT IN ('endorse', 'endorse_with_conditions', 'concerns', 'object') THEN RAISE EXCEPTION 'collaboration rejected (verdict): endorse, endorse_with_conditions, concerns or object' USING ERRCODE = '22023'; END IF;
  IF coalesce(length(btrim(p_statement)), 0) NOT BETWEEN 8 AND 8000 THEN RAISE EXCEPTION 'collaboration rejected (statement): a review states its case (8..8000 characters)' USING ERRCODE = '22023'; END IF;
  IF p_artifact IS NOT NULL THEN
    SELECT * INTO a FROM executive.collab_artifacts x WHERE x.artifact_id = p_artifact AND x.workspace_id = p_ws;
    IF NOT FOUND OR executive.collab_class_rank(a.classification) > executive.collab_class_rank(gd ->> 'ceiling') THEN
      RAISE EXCEPTION 'collaboration rejected (unknown_artifact): no artifact % this actor may read in workspace %', p_artifact, p_ws USING ERRCODE = '23503';
    END IF;
  END IF;
  IF p_task IS NOT NULL THEN
    SELECT * INTO t FROM executive.human_tasks x WHERE x.task_id = p_task AND x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.kind = 'collab.review' AND x.subject ->> 'id' = p_ws::text;
    IF NOT FOUND THEN RAISE EXCEPTION 'collaboration rejected (unknown_task): no review task % in workspace %', p_task, p_ws USING ERRCODE = '23503'; END IF;
    IF t.state NOT IN ('open', 'escalated') THEN RAISE EXCEPTION 'collaboration rejected (task_closed): review task % is %', p_task, t.state USING ERRCODE = '23505'; END IF;
    IF t.assignee_principal_id IS DISTINCT FROM p_actor THEN RAISE EXCEPTION 'collaboration rejected (not_assignee): review task % is held by another participant', p_task USING ERRCODE = '42501'; END IF;
  END IF;
  INSERT INTO executive.collab_reviews (review_id, scope, tenant_id, domain_id, workspace_id, task_id, artifact_id, reviewer_principal_id, reviewer_affiliation, verdict, statement, correlation_id)
  VALUES (p_review, 'DOMAIN', p_tenant, p_domain, p_ws, p_task, p_artifact, p_actor, gd ->> 'affiliation', p_verdict, btrim(p_statement), p_correlation);
  IF p_task IS NOT NULL THEN
    v_res := executive._resolve_human_tasks(p_tenant, p_domain, jsonb_build_object('kind', 'workspace', 'id', p_ws, 'request', p_task), ARRAY['collab.review'], p_verdict, p_review, p_actor, p_correlation);
  END IF;
  PERFORM executive._collab_event(p_ws, p_tenant, p_domain, 'review.recorded', p_actor, jsonb_build_object('review_id', p_review, 'verdict', p_verdict, 'task_id', p_task, 'artifact_id', p_artifact), p_correlation);
  RETURN jsonb_build_object('review_id', p_review, 'verdict', p_verdict, 'reviewer', p_actor, 'affiliation', gd ->> 'affiliation', 'resolved', v_res);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.record_collab_review(uuid, uuid, uuid, uuid, uuid, uuid, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.record_collab_review(uuid, uuid, uuid, uuid, uuid, uuid, text, text, uuid, uuid) TO eye_commit;

-- INVITE an external collaborator (the workspace owner's act): a DOMAIN principal of affiliation `external` with the external_collaborator
-- role (granted by no one's standing — the grant is the authority, its expiry the binding's end), a one-time INVITATION credential (the
-- token's argon2 hash, expiring with the invitation window), the grant (purpose = the workspace's; ceiling at or below the workspace's;
-- expiry at most 30 days out), the participant row (reviewer), the grant.expiry timer, and the invitation placed in the SYNTHETIC mailbox.
CREATE OR REPLACE FUNCTION executive.invite_collaborator(
  p_grant uuid, p_principal uuid, p_tenant uuid, p_domain uuid, p_ws uuid, p_display_name text, p_login_name text, p_contact_label text, p_ceiling text, p_expires_at timestamptz,
  p_token_hash text, p_credential_hash text, p_invitation_expires_at timestamptz, p_mail_subject text, p_mail_body_digest text, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE gd jsonb; w executive.collab_workspaces%ROWTYPE; v_timer uuid; v_mail uuid := gen_random_uuid();
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.collab.invite']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'collaboration grant rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  gd := executive._collab_guard(p_ws, p_tenant, p_domain, p_actor);
  IF (gd ->> 'owner')::uuid IS DISTINCT FROM p_actor THEN RAISE EXCEPTION 'collaboration grant rejected (not_owner): the workspace''s owner invites an external collaborator' USING ERRCODE = '42501'; END IF;
  SELECT * INTO w FROM executive.collab_workspaces x WHERE x.workspace_id = p_ws;
  IF p_expires_at IS NULL OR p_expires_at <= clock_timestamp() OR p_expires_at > clock_timestamp() + interval '30 days' THEN
    RAISE EXCEPTION 'collaboration grant rejected (expiry): a grant expires in the future and at most 30 days out' USING ERRCODE = '22023';
  END IF;
  IF p_invitation_expires_at IS NULL OR p_invitation_expires_at <= clock_timestamp() OR p_invitation_expires_at > p_expires_at THEN
    RAISE EXCEPTION 'collaboration grant rejected (expiry): the invitation window ends in the future and no later than the grant' USING ERRCODE = '22023';
  END IF;
  IF executive.collab_class_rank(p_ceiling) IS NULL OR executive.collab_class_rank(p_ceiling) > executive.collab_class_rank(w.classification_ceiling) THEN
    RAISE EXCEPTION 'collaboration grant rejected (ceiling): the audience ceiling % is at or below the workspace''s ceiling %', coalesce(p_ceiling, '<none>'), w.classification_ceiling USING ERRCODE = '22023';
  END IF;
  IF coalesce(length(btrim(p_display_name)), 0) NOT BETWEEN 3 AND 200 OR coalesce(p_login_name, '') !~ '^ext-[a-z0-9-]{4,60}$' OR coalesce(length(btrim(p_contact_label)), 0) NOT BETWEEN 3 AND 200 THEN
    RAISE EXCEPTION 'collaboration grant rejected (invitee): a display name, an ext- login name and a contact label' USING ERRCODE = '22023';
  END IF;
  IF coalesce(p_token_hash, '') !~ '^[0-9a-f]{64}$' OR coalesce(p_credential_hash, '') NOT LIKE '$argon2id$%' OR coalesce(p_mail_body_digest, '') !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'collaboration grant rejected (invitation): the invitation carries its token hash, its credential hash and its message digest' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM identity.principals p WHERE p.login_name = p_login_name) THEN RAISE EXCEPTION 'collaboration grant rejected (duplicate): the login name % is taken', p_login_name USING ERRCODE = '23505'; END IF;
  INSERT INTO identity.principals (id, kind, scope, tenant_id, domain_id, display_name, login_name, status)
  VALUES (p_principal, 'human', 'DOMAIN', p_tenant, p_domain, btrim(p_display_name), p_login_name, 'active');
  -- the EXTERNAL marker (0090 §0.2): a B34 row, the frozen identity schema untouched
  INSERT INTO executive.external_principals (principal_id, scope, tenant_id, domain_id, invited_by, reason, correlation_id)
  VALUES (p_principal, 'DOMAIN', p_tenant, p_domain, p_actor, format('invited to workspace %s (grant %s)', p_ws, p_grant), p_correlation);
  INSERT INTO identity.role_bindings (id, principal_id, role_code, scope, tenant_id, domain_id, granted_by_principal, granted_by_scope)
  VALUES (gen_random_uuid(), p_principal, 'external_collaborator', 'DOMAIN', p_tenant, p_domain, NULL, 'DOMAIN');
  INSERT INTO identity.credentials (id, principal_id, type, secret_hash, status, expires_at)
  VALUES (gen_random_uuid(), p_principal, 'password', p_credential_hash, 'active', p_invitation_expires_at);
  v_timer := executive._schedule_timer(gen_random_uuid(), p_tenant, p_domain, 'grant', p_grant, 'grant.expiry', p_expires_at, jsonb_build_object('workspace', p_ws, 'principal', p_principal), p_actor, p_correlation);
  INSERT INTO executive.collab_grants (grant_id, scope, tenant_id, domain_id, workspace_id, principal_id, purpose, audience_ceiling, expires_at, invitation_token_hash, invitation_expires_at,
                                       contact_label, expiry_timer_id, invited_by, correlation_id)
  VALUES (p_grant, 'DOMAIN', p_tenant, p_domain, p_ws, p_principal, w.purpose, p_ceiling, p_expires_at, p_token_hash, p_invitation_expires_at, btrim(p_contact_label), v_timer, p_actor, p_correlation);
  INSERT INTO executive.collab_participants (participant_id, scope, tenant_id, domain_id, workspace_id, principal_id, role, affiliation, grant_id, added_by, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_ws, p_principal, 'reviewer', 'external', p_grant, p_actor, p_correlation);
  INSERT INTO executive.collab_invitation_mail (message_id, scope, tenant_id, domain_id, grant_id, recipient_principal_id, subject, body_digest, correlation_id)
  VALUES (v_mail, 'DOMAIN', p_tenant, p_domain, p_grant, p_principal, left(btrim(p_mail_subject), 300), p_mail_body_digest, p_correlation);
  PERFORM executive._collab_event(p_ws, p_tenant, p_domain, 'grant.invited', p_actor,
            jsonb_build_object('grant_id', p_grant, 'principal', p_principal, 'purpose', w.purpose, 'audience_ceiling', p_ceiling, 'expires_at', p_expires_at, 'mail', v_mail, 'synthetic', true), p_correlation);
  RETURN jsonb_build_object('grant_id', p_grant, 'principal_id', p_principal, 'login_name', p_login_name, 'purpose', w.purpose, 'audience_ceiling', p_ceiling, 'expires_at', p_expires_at,
                            'invitation_expires_at', p_invitation_expires_at, 'state', 'invited', 'expiry_timer_id', v_timer, 'mail', jsonb_build_object('message_id', v_mail, 'channel', 'demo-mailbox', 'synthetic', true));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.invite_collaborator(uuid, uuid, uuid, uuid, uuid, text, text, text, text, timestamptz, text, text, timestamptz, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.invite_collaborator(uuid, uuid, uuid, uuid, uuid, text, text, text, text, timestamptz, text, text, timestamptz, text, text, uuid, uuid) TO eye_commit;

-- ACCEPT (the invitee's own act, signed in with the invitation credential): the token presented again (its hash), the invitee sets their
-- own password — the invitation credential rotated, the new one EXPIRING WITH THE GRANT; the grant accepted.
CREATE OR REPLACE FUNCTION executive.accept_collaboration(p_grant uuid, p_tenant uuid, p_domain uuid, p_token_hash text, p_new_credential_hash text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE g executive.collab_grants%ROWTYPE; v_cred uuid := gen_random_uuid();
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.collab.accept']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'collaboration grant rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO g FROM executive.collab_grants x WHERE x.grant_id = p_grant AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'collaboration grant rejected (unknown_grant): no grant % in this domain', p_grant USING ERRCODE = '23503'; END IF;
  IF g.principal_id IS DISTINCT FROM p_actor THEN RAISE EXCEPTION 'collaboration grant rejected (not_invitee): only the invitee accepts their invitation' USING ERRCODE = '42501'; END IF;
  IF g.state <> 'invited' THEN RAISE EXCEPTION 'collaboration grant rejected (state): the grant is %', g.state USING ERRCODE = '23505'; END IF;
  IF g.expires_at <= clock_timestamp() OR g.invitation_expires_at <= clock_timestamp() THEN RAISE EXCEPTION 'collaboration grant rejected (state): the invitation expired' USING ERRCODE = '23505'; END IF;
  IF p_token_hash IS DISTINCT FROM g.invitation_token_hash THEN RAISE EXCEPTION 'collaboration grant rejected (token): the invitation token does not match' USING ERRCODE = '42501'; END IF;
  IF public.eye_purpose() IS DISTINCT FROM g.purpose THEN RAISE EXCEPTION 'collaboration grant rejected (purpose): the grant is for the purpose %', g.purpose USING ERRCODE = '42501'; END IF;
  IF coalesce(p_new_credential_hash, '') NOT LIKE '$argon2id$%' THEN RAISE EXCEPTION 'collaboration grant rejected (credential): the new credential is an argon2id hash' USING ERRCODE = '22023'; END IF;
  UPDATE identity.credentials SET status = 'rotated', rotated_at = now() WHERE principal_id = p_actor AND status IN ('active', 'must_rotate');
  INSERT INTO identity.credentials (id, principal_id, type, secret_hash, status, expires_at) VALUES (v_cred, p_actor, 'password', p_new_credential_hash, 'active', g.expires_at);
  UPDATE executive.collab_grants SET state = 'accepted', accepted_at = clock_timestamp() WHERE grant_id = p_grant;
  PERFORM executive._collab_event(g.workspace_id, p_tenant, p_domain, 'grant.accepted', p_actor, jsonb_build_object('grant_id', p_grant, 'credential_expires_at', g.expires_at), p_correlation);
  RETURN jsonb_build_object('grant_id', p_grant, 'state', 'accepted', 'workspace_id', g.workspace_id, 'expires_at', g.expires_at, 'credential_expires_at', g.expires_at, 'audience_ceiling', g.audience_ceiling);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.accept_collaboration(uuid, uuid, uuid, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.accept_collaboration(uuid, uuid, uuid, text, text, uuid, uuid) TO eye_commit;

-- THE END OF A GRANT (internal; revoke and lapse): the external's binding revoked (the epoch bump ends every session), the participant
-- removed, the expiry timer cancelled (a revocation), the external's open collab tasks REASSIGNED with reason access_lost — to the
-- task's escalation principal when it names a member, else the workspace's owner — so the work is preserved and routed, never dropped.
CREATE OR REPLACE FUNCTION executive._end_collab_grant(p_grant uuid, p_tenant uuid, p_domain uuid, p_state text, p_reason text, p_cancel_timer boolean, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, decision, identity, public, pg_catalog, pg_temp AS $$
DECLARE g executive.collab_grants%ROWTYPE; w executive.collab_workspaces%ROWTYPE; t executive.human_tasks%ROWTYPE; v_to uuid; v_moved jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO g FROM executive.collab_grants x WHERE x.grant_id = p_grant AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  SELECT * INTO w FROM executive.collab_workspaces x WHERE x.workspace_id = g.workspace_id;
  IF p_state = 'revoked' THEN
    UPDATE executive.collab_grants SET state = 'revoked', revoked_at = clock_timestamp(), revoked_by = p_actor, revoke_reason = p_reason WHERE grant_id = p_grant;
    UPDATE identity.credentials SET status = 'revoked' WHERE principal_id = g.principal_id AND status IN ('active', 'must_rotate');
  ELSE
    UPDATE executive.collab_grants SET state = 'lapsed', lapsed_at = clock_timestamp() WHERE grant_id = p_grant;
  END IF;
  -- the expiry timer ends with the grant — unless it is the timer being fired now (the lapse at step 20: its tick marks it fired)
  IF p_cancel_timer THEN
    UPDATE executive.workflow_timers SET cancelled_at = clock_timestamp() WHERE timer_id = g.expiry_timer_id AND fired_at IS NULL AND cancelled_at IS NULL;
  END IF;
  UPDATE identity.role_bindings SET revoked_at = now() WHERE principal_id = g.principal_id AND role_code = 'external_collaborator' AND revoked_at IS NULL;
  UPDATE executive.collab_participants SET removed_at = clock_timestamp(), removed_by = p_actor, removal_reason = 'grant ' || p_state
   WHERE workspace_id = g.workspace_id AND principal_id = g.principal_id AND removed_at IS NULL;
  FOR t IN SELECT * FROM executive.human_tasks x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.assignee_principal_id = g.principal_id AND x.state IN ('open', 'escalated') FOR UPDATE LOOP
    v_to := nullif(t.escalation ->> 'principal', '')::uuid;
    IF v_to IS NULL OR NOT decision.is_active_human(v_to, p_tenant) THEN v_to := w.owner_principal_id; END IF;
    UPDATE executive.human_tasks SET assignee_principal_id = v_to, updated_at = clock_timestamp() WHERE task_id = t.task_id;
    INSERT INTO executive.human_task_assignments (assignment_id, scope, tenant_id, domain_id, task_id, from_principal, to_principal, reason, actor_principal_id, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, t.task_id, g.principal_id, v_to, 'access_lost', p_actor, p_correlation);
    INSERT INTO executive.human_task_events (event_id, scope, tenant_id, domain_id, task_id, event, actor_principal_id, details, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, t.task_id, 'task.reassigned', p_actor,
            jsonb_build_object('from', g.principal_id, 'to', v_to, 'reason', 'access_lost', 'grant_id', p_grant, 'grant_state', p_state), p_correlation);
    v_moved := v_moved || jsonb_build_object('task_id', t.task_id, 'to', v_to);
  END LOOP;
  PERFORM executive._collab_event(g.workspace_id, p_tenant, p_domain, CASE WHEN p_state = 'revoked' THEN 'grant.revoked' ELSE 'grant.lapsed' END, p_actor,
            jsonb_build_object('grant_id', p_grant, 'principal', g.principal_id, 'reason', p_reason, 'reassigned', v_moved), p_correlation);
  RETURN jsonb_build_object('grant_id', p_grant, 'state', p_state, 'principal', g.principal_id, 'reassigned', v_moved);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive._end_collab_grant(uuid, uuid, uuid, text, text, boolean, uuid, uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION executive.revoke_collaboration_grant(p_grant uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE g executive.collab_grants%ROWTYPE; gd jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.collab.grant.revoke']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'collaboration grant rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF coalesce(length(btrim(p_reason)), 0) < 8 THEN RAISE EXCEPTION 'collaboration grant rejected (reason): a revocation states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  SELECT * INTO g FROM executive.collab_grants x WHERE x.grant_id = p_grant AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'collaboration grant rejected (unknown_grant): no grant % in this domain', p_grant USING ERRCODE = '23503'; END IF;
  gd := executive._collab_guard(g.workspace_id, p_tenant, p_domain, p_actor);
  IF (gd ->> 'owner')::uuid IS DISTINCT FROM p_actor THEN RAISE EXCEPTION 'collaboration grant rejected (not_owner): the workspace''s owner revokes a grant' USING ERRCODE = '42501'; END IF;
  IF g.state NOT IN ('invited', 'accepted') THEN RAISE EXCEPTION 'collaboration grant rejected (state): the grant is %', g.state USING ERRCODE = '23505'; END IF;
  RETURN executive._end_collab_grant(p_grant, p_tenant, p_domain, 'revoked', btrim(p_reason), true, p_actor, p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.revoke_collaboration_grant(uuid, uuid, uuid, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.revoke_collaboration_grant(uuid, uuid, uuid, text, uuid, uuid) TO eye_commit;

-- grant.expiry → the grant LAPSES (the tick, step 20); a grant already ended is skipped.
CREATE OR REPLACE FUNCTION executive.lapse_collaboration_grant(p_timer uuid, p_tenant uuid, p_domain uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE tm executive.workflow_timers%ROWTYPE; g executive.collab_grants%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.attention.tick']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'collaboration grant rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO tm FROM executive.workflow_timers x WHERE x.timer_id = p_timer AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND OR tm.kind <> 'grant.expiry' THEN RAISE EXCEPTION 'workflow timer rejected (kind): % is not a grant expiry', p_timer USING ERRCODE = '22023'; END IF;
  SELECT * INTO g FROM executive.collab_grants x WHERE x.grant_id = tm.owner_id;
  IF NOT FOUND OR g.state NOT IN ('invited', 'accepted') THEN RETURN jsonb_build_object('grant_id', tm.owner_id, 'skipped', true, 'state', g.state); END IF;
  RETURN executive._end_collab_grant(g.grant_id, p_tenant, p_domain, 'lapsed', 'the grant expired at ' || g.expires_at::text, false, p_actor, p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.lapse_collaboration_grant(uuid, uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.lapse_collaboration_grant(uuid, uuid, uuid, uuid, uuid) TO eye_commit;

-- The sweep (tick step `collab-grant-expiry`, order 22): every grant past its expiry that is still invited or accepted LAPSES — a grant
-- whose expiry timer has not fired (a timer failing, a clock skew) is never left live past its expiry.
CREATE OR REPLACE FUNCTION executive.lapse_expired_collab_grants(p_tenant uuid, p_domain uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE g executive.collab_grants%ROWTYPE; v jsonb := '[]'::jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.attention.tick']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'collaboration grant rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  FOR g IN SELECT * FROM executive.collab_grants x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.state IN ('invited', 'accepted') AND x.expires_at <= clock_timestamp()
           ORDER BY x.expires_at LIMIT 200 FOR UPDATE SKIP LOCKED LOOP
    v := v || executive._end_collab_grant(g.grant_id, p_tenant, p_domain, 'lapsed', 'the grant expired at ' || g.expires_at::text || ' (sweep)', true, p_actor, p_correlation);
  END LOOP;
  RETURN jsonb_build_object('lapsed', v);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.lapse_expired_collab_grants(uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.lapse_expired_collab_grants(uuid, uuid, uuid, uuid) TO eye_commit;

-- COMPLETE a task directly — REFUSED for gate.* and commitment.* (they complete through the owning action: the approval, the review, the
-- checkpoint …). The actor is the assignee (or, with none, a holder of a candidate role); an EXTERNAL assignee acts inside a live grant on
-- the task's workspace. Completion evidence {note, ref?} is kept on the task.
CREATE OR REPLACE FUNCTION executive.complete_human_task(p_task uuid, p_tenant uuid, p_domain uuid, p_outcome text, p_evidence jsonb, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE t executive.human_tasks%ROWTYPE; v_aff text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.task.complete']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'human task rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO t FROM executive.human_tasks x WHERE x.task_id = p_task AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'human task rejected (unknown_task): no task % in this domain', p_task USING ERRCODE = '23503'; END IF;
  IF t.kind LIKE 'gate.%' OR t.kind LIKE 'commitment.%' THEN
    RAISE EXCEPTION 'human task rejected (owning_action): a % task is completed through the owning action, never here — complete through the owning action', t.kind USING ERRCODE = '23505';
  END IF;
  IF t.state NOT IN ('open', 'escalated') THEN RAISE EXCEPTION 'human task rejected (closed): task % is %', p_task, t.state USING ERRCODE = '23505'; END IF;
  IF NOT (p_actor = t.assignee_principal_id OR (t.assignee_principal_id IS NULL AND executive.holds_any_role(p_actor, p_tenant, p_domain, t.candidate_roles))) THEN
    RAISE EXCEPTION 'human task rejected (not_assignee): task % is held by another principal', p_task USING ERRCODE = '42501';
  END IF;
  v_aff := executive.principal_affiliation(p_actor);
  IF v_aff = 'external' THEN
    IF t.subject ->> 'kind' <> 'workspace' THEN RAISE EXCEPTION 'collaboration rejected (no_grant): an external collaborator completes only a workspace''s task' USING ERRCODE = '42501'; END IF;
    PERFORM executive._collab_guard((t.subject ->> 'id')::uuid, p_tenant, p_domain, p_actor);
  END IF;
  IF p_outcome IS NULL OR p_outcome !~ '^[a-z][a-z_]{2,40}$' THEN RAISE EXCEPTION 'human task rejected (outcome): an outcome is a snake_case word' USING ERRCODE = '22023'; END IF;
  IF p_evidence IS NULL OR jsonb_typeof(p_evidence) <> 'object' OR coalesce(length(btrim(p_evidence ->> 'note')), 0) < 8 THEN
    RAISE EXCEPTION 'human task rejected (evidence): a completion carries its evidence {note (8+ characters), ref?}' USING ERRCODE = '22023';
  END IF;
  UPDATE executive.human_tasks SET state = 'completed', outcome = p_outcome, completed_by = p_actor, completed_at = clock_timestamp(), completion_evidence = p_evidence, updated_at = clock_timestamp()
   WHERE task_id = p_task;
  UPDATE executive.workflow_timers SET cancelled_at = clock_timestamp() WHERE owner_kind = 'task' AND owner_id = p_task AND fired_at IS NULL AND cancelled_at IS NULL;
  INSERT INTO executive.human_task_events (event_id, scope, tenant_id, domain_id, task_id, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_task, 'task.completed', p_actor, jsonb_build_object('outcome', p_outcome, 'evidence', p_evidence, 'affiliation', v_aff), p_correlation);
  RETURN jsonb_build_object('task_id', p_task, 'state', 'completed', 'outcome', p_outcome, 'completed_by', p_actor);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.complete_human_task(uuid, uuid, uuid, text, jsonb, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.complete_human_task(uuid, uuid, uuid, text, jsonb, uuid, uuid) TO eye_commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §W6 THE DRILLS (recorded objects with verdicts; executed here, each probe in its own subtransaction)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
--   restart_replay    — the instance's lease is taken by a crashed worker (expired), a new worker RESUMES: the state refolded from the
--                       committed transitions equals the stored one (workflow_replay) and the lease passes on; pass when consistent.
--   duplicate_task    — the same task opened twice with one dedupe key: the second answers repeated, one row exists; pass when so.
--   duplicate_timer   — a drill timer fired, then fired again: the second firing is refused, one firing recorded; pass when so.
--   definition_change — the instance's pin against the newest version of its key: pass when the pinned digest is its definition's and a
--                       transition resolves under the PINNED spec (the newest version, when it differs, is reported, never applied).
CREATE OR REPLACE FUNCTION executive.run_workflow_drill(p_drill uuid, p_tenant uuid, p_domain uuid, p_kind text, p_instance uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE i executive.workflow_instances%ROWTYPE; d executive.workflow_definitions%ROWTYPE; n executive.workflow_definitions%ROWTYPE; o jsonb := '{}'::jsonb; v_pass boolean := false;
        r1 jsonb; r2 jsonb; v_timer uuid; v_err text; v_count int; v_key text; v_task uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.workflow.drill']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'workflow drill rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF p_kind NOT IN ('restart_replay', 'duplicate_task', 'duplicate_timer', 'definition_change') THEN
    RAISE EXCEPTION 'workflow drill rejected (kind): restart_replay, duplicate_task, duplicate_timer or definition_change' USING ERRCODE = '22023';
  END IF;
  IF p_kind IN ('restart_replay', 'definition_change', 'duplicate_timer') THEN
    SELECT * INTO i FROM executive.workflow_instances x WHERE x.instance_id = p_instance AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'workflow drill rejected (unknown_instance): no instance % in this domain', p_instance USING ERRCODE = '23503'; END IF;
  END IF;
  IF p_kind = 'restart_replay' THEN
    -- the crashed worker: its lease left behind, already expired (the engine restarted); the resuming worker takes it over
    UPDATE executive.workflow_instances SET lease_owner = 'drill:crashed-worker', lease_until = clock_timestamp() - interval '1 second' WHERE instance_id = p_instance;
    r1 := executive.workflow_replay(p_instance);
    UPDATE executive.workflow_instances SET lease_owner = 'drill:resumed-worker', lease_until = clock_timestamp() + interval '30 seconds' WHERE instance_id = p_instance;
    v_pass := (r1 ->> 'consistent')::boolean AND (SELECT x.last_seq FROM executive.workflow_instances x WHERE x.instance_id = p_instance) = i.last_seq;
    -- the drill's worker lets go: the next real worker takes the lease at once (the drill never blocks the instance)
    UPDATE executive.workflow_instances SET lease_owner = NULL, lease_until = NULL WHERE instance_id = p_instance;
    o := jsonb_build_object('replay', r1, 'crashed_lease', 'drill:crashed-worker', 'resumed_by', 'drill:resumed-worker', 'released', true, 'resumed_at_seq', i.last_seq,
                            'transitions', (SELECT count(*) FROM executive.workflow_transitions x WHERE x.instance_id = p_instance));
  ELSIF p_kind = 'duplicate_task' THEN
    v_key := 'drill.duplicate_task:' || p_drill::text; v_task := gen_random_uuid();
    r1 := executive._open_human_task(v_task, p_tenant, p_domain, 'workflow.compensation_confirm', v_key, jsonb_build_object('kind', 'workflow_instance', 'id', coalesce(p_instance, p_drill), 'drill', p_drill),
            'Drill task (duplicate_task)', p_actor, '{}', '{}'::jsonb, NULL, '{}'::jsonb, p_instance, 'drill', p_actor, p_correlation);
    r2 := executive._open_human_task(gen_random_uuid(), p_tenant, p_domain, 'workflow.compensation_confirm', v_key, jsonb_build_object('kind', 'workflow_instance', 'id', coalesce(p_instance, p_drill), 'drill', p_drill),
            'Drill task (duplicate_task)', p_actor, '{}', '{}'::jsonb, NULL, '{}'::jsonb, p_instance, 'drill', p_actor, p_correlation);
    SELECT count(*) INTO v_count FROM executive.human_tasks x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.dedupe_key = v_key;
    PERFORM executive._cancel_human_tasks(p_tenant, p_domain, jsonb_build_object('drill', p_drill), ARRAY['workflow.compensation_confirm'], 'the duplicate_task drill is done', p_actor, p_correlation);
    v_pass := NOT (r1 ->> 'repeated')::boolean AND (r2 ->> 'repeated')::boolean AND (r2 ->> 'task_id') = (r1 ->> 'task_id') AND v_count = 1;
    o := jsonb_build_object('first', r1, 'second', r2, 'rows_with_key', v_count);
  ELSIF p_kind = 'duplicate_timer' THEN
    v_timer := executive._schedule_timer(gen_random_uuid(), p_tenant, p_domain, 'workflow_instance', p_instance, 'task.reminder', clock_timestamp(), jsonb_build_object('drill', p_drill), p_actor, p_correlation);
    r1 := executive._fire_workflow_timer(v_timer, p_tenant, p_domain, NULL, p_drill, 'skipped', jsonb_build_object('drill', 'duplicate_timer', 'firing', 1), p_actor, p_correlation);
    BEGIN
      r2 := executive._fire_workflow_timer(v_timer, p_tenant, p_domain, NULL, p_drill, 'skipped', jsonb_build_object('drill', 'duplicate_timer', 'firing', 2), p_actor, p_correlation);
    EXCEPTION WHEN unique_violation OR invalid_parameter_value THEN
      GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    END;
    SELECT count(*) INTO v_count FROM executive.workflow_timer_firings f WHERE f.timer_id = v_timer;
    v_pass := r2 IS NULL AND v_err IS NOT NULL AND v_count = 1;
    o := jsonb_build_object('timer_id', v_timer, 'first', r1, 'second_refused', v_err, 'firings', v_count);
  ELSE
    SELECT * INTO d FROM executive.workflow_definitions x WHERE x.definition_id = i.definition_id;
    SELECT * INTO n FROM executive.workflow_definitions x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.def_key = i.def_key ORDER BY x.version DESC LIMIT 1;
    v_pass := d.digest = i.def_digest AND d.version = i.def_version AND (executive.workflow_replay(p_instance) ->> 'consistent')::boolean;
    o := jsonb_build_object('pinned', jsonb_build_object('version', i.def_version, 'digest', i.def_digest), 'newest', jsonb_build_object('version', n.version, 'digest', n.digest),
                            'changed_since_start', n.digest <> i.def_digest,
                            'pinned_events_from_state', (SELECT coalesce(jsonb_agg(x ->> 'event'), '[]'::jsonb) FROM jsonb_array_elements(d.spec -> 'transitions') x WHERE x ->> 'from' = i.state),
                            'newest_events_from_state', (SELECT coalesce(jsonb_agg(x ->> 'event'), '[]'::jsonb) FROM jsonb_array_elements(n.spec -> 'transitions') x WHERE x ->> 'from' = i.state));
  END IF;
  INSERT INTO executive.workflow_drills (drill_id, scope, tenant_id, domain_id, kind, instance_id, verdict, observations, run_by, correlation_id)
  VALUES (p_drill, 'DOMAIN', p_tenant, p_domain, p_kind, p_instance, CASE WHEN v_pass THEN 'pass' ELSE 'fail' END, o, p_actor, p_correlation);
  RETURN jsonb_build_object('drill_id', p_drill, 'kind', p_kind, 'instance_id', p_instance, 'verdict', CASE WHEN v_pass THEN 'pass' ELSE 'fail' END, 'observations', o);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.run_workflow_drill(uuid, uuid, uuid, text, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.run_workflow_drill(uuid, uuid, uuid, text, uuid, uuid, uuid) TO eye_commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- section `integrator`
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0090 §I — THE B34 INTEGRATOR (A1). After the prelude (§0) and the five parts (§A attention, §C commitments, §X exposures, §G gates,
-- §W workflow).
--
-- THE COMMITMENT BREACH'S ACT: an attention item of class commitment.breach (an overdue item, routed through decision.commitment_item_signal)
-- may launch ONE governed action — its owner proposes an EXTENSION of the item's open deadline_missed exception
-- (decision.commitment.exception.decide, act propose_extension; human-gated); the item's reviewer co-signs on the tracker, a second
-- person's separate act. The performer is apps/api/src/executive/attention/act.service.ts `propose_extension`.
INSERT INTO executive.attention_act_registry (signal_class, action_key, governed_action, gate, target_kind, description, since) VALUES
  ('commitment.breach', 'propose_extension', 'decision.commitment.exception.decide', 'human_gate', 'commitment_item',
   'propose an extension of the overdue item''s open deadline_missed exception (its owner; the reviewer co-signs on the tracker)', '0090');

-- THE ASSUMPTION VERIFIED BY A PERSON (§I): the gates' conditions (assumption_holds) read an assumption's verification state, which only
-- impact propagation moved (to unverified / invalidated); a named, active MEMBER holding a planning authority now VERIFIES — or
-- invalidates — an assumption through its own governed route (graph.assumption.verify, human-gated), with a stated reason. 0024:1230's
-- body re-declared whole with ONE block for the new action; the propagation's path (graph.impact.propagate, graph.strategy.declare) is
-- unchanged.
CREATE OR REPLACE FUNCTION graph.set_assumption_state(
  p_object_id uuid, p_tenant uuid, p_domain uuid, p_state text, p_reason text,
  p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS void
SECURITY DEFINER SET search_path = graph, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_type text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.impact.propagate', 'graph.strategy.declare', /* B34 (0090 §I) */ 'graph.assumption.verify']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  /* B34 (0090 §I): a PERSON's verification — the acting principal, a named active member, a verified or invalidated state, a stated reason */
  IF public.eye_bound_action() = 'graph.assumption.verify' THEN
    IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'assumption verification rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
    IF NOT decision.is_active_human(p_actor, p_tenant) THEN RAISE EXCEPTION 'assumption verification rejected: a named, active member verifies an assumption' USING ERRCODE = '42501'; END IF;
    IF p_state IS NULL OR p_state NOT IN ('verified', 'invalidated') THEN
      RAISE EXCEPTION 'assumption verification rejected (state): a person records verified or invalidated' USING ERRCODE = '22023';
    END IF;
    IF coalesce(length(btrim(p_reason)), 0) < 16 THEN
      RAISE EXCEPTION 'assumption verification rejected (reason): the verification states what it rests on (16+ characters)' USING ERRCODE = '22023';
    END IF;
  END IF;
  /* end B34 §I */
  SELECT s.object_type INTO v_type FROM graph.strategy_current s
   WHERE s.strategy_object_id = p_object_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'assumption state rejected: no such strategy object' USING ERRCODE = '23503';
  END IF;
  IF v_type <> 'ASU' THEN
    RAISE EXCEPTION 'assumption state rejected: % objects do not carry a verification state', v_type
      USING ERRCODE = '22023';
  END IF;
  UPDATE graph.strategy_current
     SET verification_state = p_state, verification_reason = p_reason,
         verified_at = CASE WHEN p_state = 'verified' THEN clock_timestamp() ELSE verified_at END,
         updated_at = clock_timestamp()
   WHERE strategy_object_id = p_object_id;
  INSERT INTO graph.strategy_events (
    event_id, scope, tenant_id, domain_id, strategy_object_id, event,
    actor_principal_id, details, correlation_id
  ) VALUES (
    p_event_id, 'DOMAIN', p_tenant, p_domain, p_object_id,
    CASE p_state WHEN 'verified' THEN 'assumption.verified'
                 WHEN 'invalidated' THEN 'assumption.invalidated'
                 ELSE 'assumption.unverified' END,
    p_actor, jsonb_build_object('state', p_state, 'reason', p_reason), p_correlation);
END $$ LANGUAGE plpgsql;
