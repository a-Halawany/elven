-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- section `collab`
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0094 §C — CP-6 B36 part `collab` (2026-09-30): COLLABORATION COMPLETED AND THE CARRIED MECHANISMS — F-P6-14 COMPLETES (STAGES (q)–(t)),
-- F-P6-05 (u) THE ENFORCED ACTIVATION OF A REAL EXECUTION TARGET, F-P4-13 (i)–(j) THE OUTCOME LOOP'S LEARN STEP. V8 PR-46-002 (task
-- dependencies), PER-22 (the external collaborator's bounded surface), the B34 review's condition (t): the invitation token today lives only
-- in the API process — it is DELIVERED to the invitee's SYNTHETIC mailbox as a one-time PICKUP CODE and the token itself is SEALED at rest
-- under that code, written to no table, log line or answer in clear (the pickup answers it ONCE to the addressed person). Built on §0 (the
-- widened decision.package_events: execution.target_activated / execution.target_deactivated are this section's), 0090 §W (the tasks, the
-- workspaces, the grants), 0091 §F1 (the identity path — used, never re-declared), 0090 §C5 (the gateway — ONE port re-declared with ONE
-- addition), 0090 §X5 (the outcome review — used; the learn step is new).
--
--   §C0  the vocabularies: human_task_events (+ task.dependency_declared, task.released), collab_events (+ invitation.picked_up,
--        invitation.pickup_refused, invitation.locked), prediction.exposure_events (+ exposure.learning_recorded)
--   §C1  THE EXTERNAL'S BOUNDED SELF READ (q): executive.collab_grant_surface(principal) — the grants that bound an external collaborator
--        (its workspace, purpose, audience ceiling, expiry, whether live or expired at the DATABASE's instant); nothing of the tenant beyond
--   §C2  TASK DEPENDENCIES (r; PR-46-002): executive.human_task_dependencies (finish_to_start; a cycle refused), the port
--        executive.declare_task_dependency, the read executive.task_dependencies_of, the GUARD on executive.human_tasks (a task with an
--        unmet dependency cannot be completed: `task rejected (dependency)`) and the RELEASE (the prerequisite's closure releases the
--        dependent: task.released on the dependent's log); a workflow definition's transitions may declare `depends_on` (states whose
--        instance tasks must be closed before the transition is admitted — validated at publication, enforced on the transition)
--   §C3  THE LOCAL INVITATION DELIVERY AND PICKUP (t): executive.invitation_deliveries (one per grant: the pickup code's hash, the SEALED
--        acceptance material, the failures, the lock, the pickup), executive.invitation_pickups (append-only: every attempt and its
--        outcome, from where), executive.deliver_invitation (the identity administrator's act after the activation), executive.pickup_invitation
--        (THE ONE PORT WITHOUT A PRINCIPAL — the addressed person is not yet a principal; the mailbox's one-time code IS the authority; every
--        attempt recorded; five failures lock the invitation; a second pickup refused)
--   §C4  THE ENFORCED ACTIVATION OF A REAL EXECUTION TARGET (u; F-P6-05): decision.execution_targets gains activation_state ('synthetic' |
--        'inactive' | 'active') with activated_at / activated_by / authorized_by_decision and the deactivation; decision.register_execution_target
--        (a NON-synthetic target registered `inactive` by the domain administrator — 0090's declare stays synthetic-only, untouched);
--        decision.activate_execution_target (a named human holding execution_authority who is NOT the registrar, with the owner's COMMITTED
--        decision whose payload names the target); decision.deactivate_execution_target (a reason; new handoffs refused at once);
--        decision.issue_execution_handoff re-declared from 0090 §C5 line 2090 with ONE addition: a non-synthetic target that is not active
--        refuses the handoff (`execution handoff rejected (inactive_target)`). NOTHING REAL IS ACTIVATED by any harness or act: a "real"
--        target in the harness is a loopback literal recorded non-synthetic, and the production egress refuses it (the B14 rule).
--   §C5  THE LEARN STEP (j; JRN-09, PR-28-001/-002, CAP-FW-05): prediction.exposure_learnings — after an outcome review, what was EXPECTED
--        (the accepted assessment's bracket), what HAPPENED (the review's outcomes), what CHANGES in the estimate's basis; the port
--        prediction.record_exposure_learning (the owner or the sponsor); exposure.learning_recorded on the lineage
-- Forward-only; 0090, 0091 and §0 untouched. Every figure a harness seeds is SYNTHETIC. The refusal families are `task dependency rejected`,
-- `task rejected (dependency)`, `invitation rejected`, `execution registration rejected`, `execution activation rejected`, `exposure learning
-- rejected` and `workflow rejected (dependency)` — anchored nouns no earlier row reads.

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §C0 THE VOCABULARIES (each list copied whole from its last declaration, plus this section's)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- executive.human_task_events (0090 §0 line 211, whole, plus the dependency events)
ALTER TABLE executive.human_task_events DROP CONSTRAINT human_task_events_event_check;
ALTER TABLE executive.human_task_events ADD CONSTRAINT human_task_events_event_check CHECK (event IN (
  'task.opened', 'task.repeated', 'task.reassigned', 'task.escalated', 'task.escalation_exhausted', 'task.completed', 'task.cancelled', 'task.lapsed', 'task.reminded',
  -- B36 (0094 §C2)
  'task.dependency_declared', 'task.released'));

-- executive.collab_events (0091 §1, whole, plus the invitation delivery and pickup)
ALTER TABLE executive.collab_events DROP CONSTRAINT collab_events_event_check;
ALTER TABLE executive.collab_events ADD CONSTRAINT collab_events_event_check CHECK (event IN ('workspace.opened', 'participant.added', 'participant.removed',
  'thread.opened', 'message.posted', 'artifact.added', 'review.requested', 'review.recorded', 'grant.invited', 'grant.accepted', 'grant.revoked', 'grant.lapsed',
  'access.refused', 'grant.requested', 'grant.provisioning',
  -- B36 (0094 §C3): the pickup's outcomes (the delivery itself is the row of executive.invitation_deliveries — no event on the provisioning path,
  -- whose log the B34-F1 harness pins exactly)
  'invitation.picked_up', 'invitation.pickup_refused', 'invitation.locked'));

-- prediction.exposure_events (0090 §X0, whole, plus the learn step)
ALTER TABLE prediction.exposure_events DROP CONSTRAINT exposure_events_event_check;
ALTER TABLE prediction.exposure_events ADD CONSTRAINT exposure_events_event_check CHECK (event IN (
  'exposure.registered', 'exposure.assessed', 'exposure.estimated', 'exposure.assessment_contested', 'exposure.assessment_accepted',
  'exposure.control_added', 'exposure.residual_computed', 'exposure.appetite_breached', 'exposure.routed', 'exposure.hypothesis_declared',
  'exposure.sponsored', 'exposure.response_opened', 'exposure.correlation_recorded', 'exposure.closed',
  'exposure.scenario_linked', 'exposure.outcome_recorded', 'exposure.owner_reassigned',
  -- B36 (0094 §C5)
  'exposure.learning_recorded'));

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §C1 THE EXTERNAL'S BOUNDED SELF READ (q)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
/* An invoker read under the caller's RLS: the grants that name this principal, newest per workspace first — the workspace's title, the
   purpose, the audience ceiling, the expiry, the state, and whether the grant is LIVE or EXPIRED at the database's instant. It says nothing
   of the tenant beyond: no member, no room, no package. A principal with no grant reads an empty list. */
CREATE OR REPLACE FUNCTION executive.collab_grant_surface(p_principal uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = executive, pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object(
    'now', clock_timestamp(),
    'grants', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'grant_id', g.grant_id, 'workspace_id', g.workspace_id, 'workspace_title', w.title, 'purpose', g.purpose, 'audience_ceiling', g.audience_ceiling,
        'state', g.state, 'expires_at', g.expires_at, 'invitation_expires_at', g.invitation_expires_at, 'accepted_at', g.accepted_at,
        'live', (g.state = 'accepted' AND g.expires_at > clock_timestamp()),
        'expired', (g.state IN ('accepted', 'invited') AND g.expires_at <= clock_timestamp()) OR g.state = 'lapsed',
        'ended', g.state IN ('revoked', 'lapsed'),
        'reason', CASE WHEN g.state = 'revoked' THEN 'revoked' WHEN g.state = 'lapsed' THEN 'lapsed' WHEN g.expires_at <= clock_timestamp() THEN 'expired'
                       WHEN g.state = 'invited' THEN 'not_accepted' WHEN g.state = 'requested' THEN 'not_provisioned' ELSE NULL END
      ) ORDER BY g.invited_at DESC)
      FROM executive.collab_grants g JOIN executive.collab_workspaces w ON w.workspace_id = g.workspace_id
     WHERE g.principal_id = p_principal AND g.tenant_id = public.eye_tenant()), '[]'::jsonb))
$$;
GRANT EXECUTE ON FUNCTION executive.collab_grant_surface(uuid) TO eye_app, eye_commit;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §C2 TASK DEPENDENCIES (r; PR-46-002)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
CREATE TABLE executive.human_task_dependencies (
  dependency_id       uuid PRIMARY KEY,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  task_id             uuid NOT NULL REFERENCES executive.human_tasks (task_id),
  depends_on_task_id  uuid NOT NULL REFERENCES executive.human_tasks (task_id),
  kind                text NOT NULL DEFAULT 'finish_to_start' CHECK (kind = 'finish_to_start'),
  declared_by         uuid NOT NULL,
  declared_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  released_at         timestamptz,
  released_by_state   text CHECK (released_by_state IS NULL OR released_by_state IN ('completed', 'cancelled', 'lapsed')),
  correlation_id      uuid NOT NULL,
  CONSTRAINT xtd_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT xtd_not_self CHECK (task_id <> depends_on_task_id),
  CONSTRAINT xtd_released_bound CHECK ((released_at IS NULL) = (released_by_state IS NULL)),
  CONSTRAINT xtd_once UNIQUE (task_id, depends_on_task_id)
);
CREATE INDEX xtd_prerequisite ON executive.human_task_dependencies (depends_on_task_id) WHERE released_at IS NULL;
/* A dependency moves one way: declared → released (the release instant and the prerequisite's closing state set once); nothing else changes. */
CREATE OR REPLACE FUNCTION executive.human_task_dependencies_forward() RETURNS trigger
SET search_path = executive, pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'task dependencies are append-only: DELETE prohibited' USING ERRCODE = '2F002'; END IF;
  IF OLD.released_at IS NOT NULL OR NEW.released_at IS NULL OR (to_jsonb(NEW) - 'released_at' - 'released_by_state') <> (to_jsonb(OLD) - 'released_at' - 'released_by_state') THEN
    RAISE EXCEPTION 'task dependency % is immutable but for its release', OLD.dependency_id USING ERRCODE = '2F002';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER xtd_forward BEFORE UPDATE OR DELETE ON executive.human_task_dependencies FOR EACH ROW EXECUTE FUNCTION executive.human_task_dependencies_forward();

/* Whether a task has an UNMET dependency: a prerequisite still open or escalated (a completed, cancelled or lapsed prerequisite is met — a
   cancelled one releases with that state on the dependent's log, so the person sees what freed the task). */
CREATE OR REPLACE FUNCTION executive.task_unmet_dependencies(p_task uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = executive, pg_catalog, pg_temp AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('task_id', t.task_id, 'title', t.title, 'state', t.state, 'assignee', t.assignee_principal_id, 'deadline_at', t.deadline_at) ORDER BY t.opened_at), '[]'::jsonb)
    FROM executive.human_task_dependencies d JOIN executive.human_tasks t ON t.task_id = d.depends_on_task_id
   WHERE d.task_id = p_task AND d.released_at IS NULL AND t.state IN ('open', 'escalated')
$$;
GRANT EXECUTE ON FUNCTION executive.task_unmet_dependencies(uuid) TO eye_app, eye_commit;

/* The read: what a task waits on (each prerequisite with its state and whether it is met) and what waits on it. */
CREATE OR REPLACE FUNCTION executive.task_dependencies_of(p_task uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = executive, pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object(
    'waits_on', coalesce((SELECT jsonb_agg(jsonb_build_object('dependency_id', d.dependency_id, 'task_id', t.task_id, 'title', t.title, 'state', t.state, 'kind', d.kind,
                                                         'met', t.state IN ('completed', 'cancelled', 'lapsed'), 'released_at', d.released_at, 'released_by_state', d.released_by_state,
                                                         'declared_by', d.declared_by, 'declared_at', d.declared_at) ORDER BY d.declared_at)
                            FROM executive.human_task_dependencies d JOIN executive.human_tasks t ON t.task_id = d.depends_on_task_id WHERE d.task_id = p_task), '[]'::jsonb),
    'released_by_this', coalesce((SELECT jsonb_agg(jsonb_build_object('dependency_id', d.dependency_id, 'task_id', t.task_id, 'title', t.title, 'state', t.state,
                                                                 'released_at', d.released_at) ORDER BY d.declared_at)
                                    FROM executive.human_task_dependencies d JOIN executive.human_tasks t ON t.task_id = d.task_id WHERE d.depends_on_task_id = p_task), '[]'::jsonb),
    'blocked', (SELECT jsonb_array_length(executive.task_unmet_dependencies(p_task)) > 0))
$$;
GRANT EXECUTE ON FUNCTION executive.task_dependencies_of(uuid) TO eye_app, eye_commit;

/* THE PORT: a named, active member declares that p_task waits on p_depends_on (finish-to-start). Both tasks of this domain; the dependent
   open or escalated; the prerequisite open or escalated (a dependency on a closed task would be met at birth — it is refused as state);
   a self-dependency and a CYCLE refused (the prerequisite's own chain, followed transitively, may not reach the dependent); the declarer
   holds the dependent (its assignee), opened it, or holds the workspace it belongs to (the workspace's owner) — an executive or a domain
   administrator declares anywhere (the PDP's roles). The dependent's log gains task.dependency_declared. */
CREATE OR REPLACE FUNCTION executive.declare_task_dependency(p_dependency_id uuid, p_tenant uuid, p_domain uuid, p_task uuid, p_depends_on uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, decision, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE t executive.human_tasks%ROWTYPE; q executive.human_tasks%ROWTYPE; v_owner uuid; v_admin boolean;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.task.dependency.declare']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'task dependency rejected (actor): recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF NOT decision.is_active_human(p_actor, p_tenant) THEN RAISE EXCEPTION 'task dependency rejected (actor): a named, active member declares a dependency' USING ERRCODE = '42501'; END IF;
  IF p_task = p_depends_on THEN RAISE EXCEPTION 'task dependency rejected (cycle): a task cannot wait on itself' USING ERRCODE = '22023'; END IF;
  SELECT * INTO t FROM executive.human_tasks x WHERE x.task_id = p_task AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'task dependency rejected (unknown_task): no task % in this domain', p_task USING ERRCODE = '23503'; END IF;
  SELECT * INTO q FROM executive.human_tasks x WHERE x.task_id = p_depends_on AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'task dependency rejected (unknown_task): no task % in this domain', p_depends_on USING ERRCODE = '23503'; END IF;
  IF t.state NOT IN ('open', 'escalated') THEN RAISE EXCEPTION 'task dependency rejected (state): task % is %; only an open task waits', p_task, t.state USING ERRCODE = '23505'; END IF;
  IF q.state NOT IN ('open', 'escalated') THEN RAISE EXCEPTION 'task dependency rejected (state): task % is % already; a dependency on it would be met at birth', p_depends_on, q.state USING ERRCODE = '23505'; END IF;
  IF t.kind LIKE 'gate.%' OR t.kind LIKE 'commitment.%' THEN
    RAISE EXCEPTION 'task dependency rejected (owning_action): a % task is completed through its owning action; it takes no dependency here', t.kind USING ERRCODE = '22023';
  END IF;
  -- who may declare: the dependent's holder or opener, the owner of the workspace it belongs to, an executive or a domain administrator
  v_admin := executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['executive', 'domain_admin', 'platform_admin']);
  IF t.subject ->> 'kind' = 'workspace' THEN SELECT w.owner_principal_id INTO v_owner FROM executive.collab_workspaces w WHERE w.workspace_id = (t.subject ->> 'id')::uuid; END IF;
  IF NOT v_admin AND p_actor IS DISTINCT FROM t.assignee_principal_id AND p_actor IS DISTINCT FROM t.opened_by AND p_actor IS DISTINCT FROM v_owner THEN
    RAISE EXCEPTION 'task dependency rejected (not_holder): task % is held by another principal; its holder, its opener, the workspace''s owner, an executive or a domain administrator declares what it waits on', p_task USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM executive.human_task_dependencies d WHERE d.task_id = p_task AND d.depends_on_task_id = p_depends_on) THEN
    RAISE EXCEPTION 'task dependency rejected (duplicate): task % already waits on %', p_task, p_depends_on USING ERRCODE = '23505';
  END IF;
  -- THE CYCLE: following what the prerequisite itself waits on (transitively) must never reach the dependent
  IF EXISTS (WITH RECURSIVE chain(task_id) AS (
               SELECT d.depends_on_task_id FROM executive.human_task_dependencies d WHERE d.task_id = p_depends_on
               UNION
               SELECT d.depends_on_task_id FROM executive.human_task_dependencies d JOIN chain c ON c.task_id = d.task_id)
             SELECT 1 FROM chain WHERE task_id = p_task) THEN
    RAISE EXCEPTION 'task dependency rejected (cycle): task % already waits, through its chain, on %; the dependency would close a cycle', p_depends_on, p_task USING ERRCODE = '22023';
  END IF;
  INSERT INTO executive.human_task_dependencies (dependency_id, scope, tenant_id, domain_id, task_id, depends_on_task_id, declared_by, correlation_id)
  VALUES (p_dependency_id, 'DOMAIN', p_tenant, p_domain, p_task, p_depends_on, p_actor, p_correlation);
  INSERT INTO executive.human_task_events (event_id, scope, tenant_id, domain_id, task_id, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_task, 'task.dependency_declared', p_actor,
          jsonb_build_object('dependency_id', p_dependency_id, 'depends_on', p_depends_on, 'depends_on_title', q.title, 'kind', 'finish_to_start'), p_correlation);
  RETURN jsonb_build_object('dependency_id', p_dependency_id, 'task_id', p_task, 'depends_on', p_depends_on, 'kind', 'finish_to_start', 'declared_by', p_actor,
                            'dependencies', executive.task_dependencies_of(p_task));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.declare_task_dependency(uuid, uuid, uuid, uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.declare_task_dependency(uuid, uuid, uuid, uuid, uuid, uuid, uuid) TO eye_commit;

/* THE GUARD: a task with an UNMET dependency is not completed — by the route (0090's executive.complete_human_task, untouched) nor by an
   owning port's _resolve_human_tasks. A cancellation or a lapse is not a completion and passes (its own release follows). */
CREATE OR REPLACE FUNCTION executive.human_task_dependency_guard() RETURNS trigger
SET search_path = executive, pg_catalog, pg_temp AS $$
DECLARE v_unmet jsonb;
BEGIN
  IF NEW.state = 'completed' AND OLD.state IN ('open', 'escalated') THEN
    v_unmet := executive.task_unmet_dependencies(NEW.task_id);
    IF jsonb_array_length(v_unmet) > 0 THEN
      RAISE EXCEPTION 'task rejected (dependency): task % waits on % open task(s) (%); it is completed when they are', NEW.task_id, jsonb_array_length(v_unmet),
        (SELECT string_agg(x ->> 'title', '; ') FROM jsonb_array_elements(v_unmet) x) USING ERRCODE = '23505';
    END IF;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER xtd_guard BEFORE UPDATE OF state ON executive.human_tasks FOR EACH ROW EXECUTE FUNCTION executive.human_task_dependency_guard();

/* THE RELEASE: when a prerequisite closes (completed, cancelled or lapsed), every dependency on it is released with that state; a dependent
   whose last unmet dependency is thereby met gains task.released on its log (what freed it, and by whom). */
CREATE OR REPLACE FUNCTION executive.human_task_dependency_release() RETURNS trigger
SET search_path = executive, pg_catalog, pg_temp AS $$
DECLARE d record;
BEGIN
  IF NEW.state IN ('completed', 'cancelled', 'lapsed') AND OLD.state IN ('open', 'escalated') THEN
    FOR d IN SELECT x.dependency_id, x.task_id FROM executive.human_task_dependencies x WHERE x.depends_on_task_id = NEW.task_id AND x.released_at IS NULL ORDER BY x.declared_at LOOP
      UPDATE executive.human_task_dependencies SET released_at = clock_timestamp(), released_by_state = NEW.state WHERE dependency_id = d.dependency_id;
      IF jsonb_array_length(executive.task_unmet_dependencies(d.task_id)) = 0 THEN
        INSERT INTO executive.human_task_events (event_id, scope, tenant_id, domain_id, task_id, event, actor_principal_id, details, correlation_id)
        VALUES (gen_random_uuid(), NEW.scope, NEW.tenant_id, NEW.domain_id, d.task_id, 'task.released', coalesce(NEW.completed_by, NEW.opened_by),
                jsonb_build_object('released_by', NEW.task_id, 'released_by_title', NEW.title, 'released_by_state', NEW.state, 'dependency_id', d.dependency_id), NEW.correlation_id);
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER xtd_release AFTER UPDATE OF state ON executive.human_tasks FOR EACH ROW EXECUTE FUNCTION executive.human_task_dependency_release();

/* THE DEFINITION'S STEP SCHEMA gains `depends_on` on a transition: the states whose INSTANCE tasks (human_tasks.instance_id = the instance,
   step = the state) must all be closed before the transition's event is admitted. Validated at publication (0090's validator admits any
   extra key on a transition object; this guard reads the one this section defines) and enforced on the transition (a guard on
   executive.workflow_transitions: `workflow rejected (dependency)`). 0090's ports are untouched. */
CREATE OR REPLACE FUNCTION executive.workflow_definition_depends_on_guard() RETURNS trigger
SET search_path = executive, pg_catalog, pg_temp AS $$
DECLARE t jsonb; s jsonb; v_states text[];
BEGIN
  SELECT array_agg(x) INTO v_states FROM jsonb_array_elements_text(NEW.spec -> 'states') x;
  FOR t IN SELECT * FROM jsonb_array_elements(coalesce(NEW.spec -> 'transitions', '[]'::jsonb)) LOOP
    IF t ? 'depends_on' THEN
      IF jsonb_typeof(t -> 'depends_on') <> 'array' OR jsonb_array_length(t -> 'depends_on') = 0 THEN
        RAISE EXCEPTION 'workflow definition rejected (depends_on): a transition''s depends_on is a non-empty list of states (%)', t::text USING ERRCODE = '22023';
      END IF;
      FOR s IN SELECT * FROM jsonb_array_elements(t -> 'depends_on') LOOP
        IF jsonb_typeof(s) <> 'string' OR NOT ((s #>> '{}') = ANY (v_states)) THEN
          RAISE EXCEPTION 'workflow definition rejected (depends_on): % is not a state of this definition (%)', s::text, t ->> 'event' USING ERRCODE = '22023';
        END IF;
        IF (s #>> '{}') = (t ->> 'to') THEN
          RAISE EXCEPTION 'workflow definition rejected (depends_on): the transition % cannot wait on the state it enters (%)', t ->> 'event', t ->> 'to' USING ERRCODE = '22023';
        END IF;
      END LOOP;
    END IF;
  END LOOP;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER xtd_definition_depends_on BEFORE INSERT ON executive.workflow_definitions FOR EACH ROW EXECUTE FUNCTION executive.workflow_definition_depends_on_guard();

CREATE OR REPLACE FUNCTION executive.workflow_transition_depends_on_guard() RETURNS trigger
SET search_path = executive, pg_catalog, pg_temp AS $$
DECLARE i executive.workflow_instances%ROWTYPE; d executive.workflow_definitions%ROWTYPE; t jsonb; v_open int; v_steps text[];
BEGIN
  IF NEW.kind = 'start' OR NEW.from_state IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO i FROM executive.workflow_instances x WHERE x.instance_id = NEW.instance_id;
  SELECT * INTO d FROM executive.workflow_definitions x WHERE x.definition_id = i.definition_id AND x.digest = i.def_digest;
  IF NOT FOUND THEN RETURN NEW; END IF;
  SELECT x INTO t FROM jsonb_array_elements(d.spec -> 'transitions') x WHERE x ->> 'from' = NEW.from_state AND x ->> 'event' = NEW.event LIMIT 1;
  IF t IS NULL OR NOT (t ? 'depends_on') THEN RETURN NEW; END IF;
  SELECT array_agg(x) INTO v_steps FROM jsonb_array_elements_text(t -> 'depends_on') x;
  SELECT count(*) INTO v_open FROM executive.human_tasks h WHERE h.instance_id = NEW.instance_id AND h.step = ANY (v_steps) AND h.state IN ('open', 'escalated');
  IF v_open > 0 THEN
    RAISE EXCEPTION 'workflow rejected (dependency): % from % waits on % open task(s) of step(s) %', NEW.event, NEW.from_state, v_open, array_to_string(v_steps, ', ') USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER xtd_transition_depends_on BEFORE INSERT ON executive.workflow_transitions FOR EACH ROW EXECUTE FUNCTION executive.workflow_transition_depends_on_guard();

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §C3 THE LOCAL INVITATION DELIVERY AND PICKUP (t)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
/* ONE DELIVERY PER GRANT: the invitation is delivered to the invitee's SYNTHETIC mailbox (0090's executive.collab_invitation_mail keeps the
   subject and the message's digest; the message itself, carrying the PICKUP CODE and never the token, is held in the API process's synthetic
   sink — a real provider is owner decision D6). The CODE is random, hashed at rest (sha256 over grant id and code), and expires with the
   invitation window. The TOKEN — the acceptance material 0091 §F1's port compares — is SEALED under the code (AES-256-GCM, the key derived
   from the code and the grant id in the API process) and stored sealed: no table holds it in clear, and only the person holding the code
   can open it. The pickup answers it ONCE. */
CREATE TABLE executive.invitation_deliveries (
  delivery_id            uuid PRIMARY KEY,
  scope                  text NOT NULL,
  tenant_id              uuid NOT NULL,
  domain_id              uuid NOT NULL,
  grant_id               uuid NOT NULL UNIQUE REFERENCES executive.collab_grants (grant_id),
  message_id             uuid NOT NULL REFERENCES executive.collab_invitation_mail (message_id),
  recipient_principal_id uuid NOT NULL,
  channel                text NOT NULL DEFAULT 'demo-mailbox' CHECK (channel = 'demo-mailbox'),
  code_hash              text NOT NULL CHECK (code_hash ~ '^[0-9a-f]{64}$'),
  sealed_material        text NOT NULL CHECK (sealed_material ~ '^[A-Za-z0-9+/=]+$' AND length(sealed_material) BETWEEN 64 AND 4096),
  code_expires_at        timestamptz NOT NULL,
  failures               int NOT NULL DEFAULT 0 CHECK (failures BETWEEN 0 AND 5),
  locked_at              timestamptz,
  picked_up_at           timestamptz,
  picked_up_from         text CHECK (picked_up_from IS NULL OR length(picked_up_from) BETWEEN 1 AND 200),
  synthetic_state        boolean NOT NULL DEFAULT true CHECK (synthetic_state),
  delivered_by           uuid NOT NULL,
  delivered_at           timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id         uuid NOT NULL,
  CONSTRAINT xid_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT xid_picked CHECK ((picked_up_at IS NULL) = (picked_up_from IS NULL)),
  CONSTRAINT xid_locked CHECK (locked_at IS NULL OR failures = 5)
);
/* Forward-only: only the failures (monotonic, at most five), the lock and the pickup ever change; nothing else of the row. */
CREATE OR REPLACE FUNCTION executive.invitation_deliveries_forward() RETURNS trigger
SET search_path = executive, pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'invitation deliveries are append-only: DELETE prohibited' USING ERRCODE = '2F002'; END IF;
  IF (to_jsonb(NEW) - 'failures' - 'locked_at' - 'picked_up_at' - 'picked_up_from') <> (to_jsonb(OLD) - 'failures' - 'locked_at' - 'picked_up_at' - 'picked_up_from')
     OR NEW.failures < OLD.failures OR (OLD.locked_at IS NOT NULL AND NEW.locked_at IS DISTINCT FROM OLD.locked_at) OR (OLD.picked_up_at IS NOT NULL AND NEW.picked_up_at IS DISTINCT FROM OLD.picked_up_at) THEN
    RAISE EXCEPTION 'invitation delivery % is immutable but for its failures, its lock and its pickup', OLD.delivery_id USING ERRCODE = '2F002';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER xid_forward BEFORE UPDATE OR DELETE ON executive.invitation_deliveries FOR EACH ROW EXECUTE FUNCTION executive.invitation_deliveries_forward();

/* EVERY ATTEMPT, whatever its outcome, from where (the caller's stated address — a loopback in the harness and the demonstration). */
CREATE TABLE executive.invitation_pickups (
  pickup_id       uuid PRIMARY KEY,
  scope           text NOT NULL,
  tenant_id       uuid NOT NULL,
  domain_id       uuid NOT NULL,
  grant_id        uuid NOT NULL REFERENCES executive.collab_grants (grant_id),
  outcome         text NOT NULL CHECK (outcome IN ('picked_up', 'wrong_code', 'locked', 'expired', 'already_picked_up', 'not_delivered', 'grant_not_open')),
  failures_after  int NOT NULL CHECK (failures_after BETWEEN 0 AND 5),
  from_address    text NOT NULL CHECK (length(from_address) BETWEEN 1 AND 200),
  attempted_at    timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id  uuid NOT NULL,
  CONSTRAINT xip_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX xip_grant ON executive.invitation_pickups (grant_id, attempted_at);
CREATE TRIGGER xip_append_only BEFORE UPDATE OR DELETE ON executive.invitation_pickups FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

/* THE DELIVERY (the identity administrator's act, after 0091's activation committed — the same bound action executive.collab.provision):
   the grant is `invited` and its mailbox record exists; one delivery per grant; the code's hash and the sealed material recorded; the
   delivery's own row is the record (never the code, never the token). */
CREATE OR REPLACE FUNCTION executive.deliver_invitation(p_delivery_id uuid, p_tenant uuid, p_domain uuid, p_grant uuid, p_code_hash text, p_sealed text, p_code_expires_at timestamptz, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE g executive.collab_grants%ROWTYPE; m executive.collab_invitation_mail%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.collab.provision']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'invitation rejected (actor): delivered by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO g FROM executive.collab_grants x WHERE x.grant_id = p_grant AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'invitation rejected (unknown_invitation): no grant % in this domain', p_grant USING ERRCODE = '23503'; END IF;
  IF g.provisioned_by IS DISTINCT FROM p_actor THEN RAISE EXCEPTION 'invitation rejected (provisioner): the identity administrator who provisioned the invitation delivers it' USING ERRCODE = '42501'; END IF;
  IF g.state <> 'invited' THEN RAISE EXCEPTION 'invitation rejected (state): the grant is %; an invited grant is delivered', g.state USING ERRCODE = '23505'; END IF;
  SELECT * INTO m FROM executive.collab_invitation_mail x WHERE x.grant_id = p_grant;
  IF NOT FOUND THEN RAISE EXCEPTION 'invitation rejected (state): the grant has no mailbox record to deliver' USING ERRCODE = '23505'; END IF;
  IF EXISTS (SELECT 1 FROM executive.invitation_deliveries d WHERE d.grant_id = p_grant) THEN RAISE EXCEPTION 'invitation rejected (duplicate): the invitation of grant % is delivered already', p_grant USING ERRCODE = '23505'; END IF;
  IF coalesce(p_code_hash, '') !~ '^[0-9a-f]{64}$' OR coalesce(p_sealed, '') !~ '^[A-Za-z0-9+/=]+$' OR length(coalesce(p_sealed, '')) NOT BETWEEN 64 AND 4096 THEN
    RAISE EXCEPTION 'invitation rejected (material): a delivery carries the code''s hash and the sealed acceptance material' USING ERRCODE = '22023';
  END IF;
  IF p_code_expires_at IS NULL OR p_code_expires_at <= clock_timestamp() OR p_code_expires_at > g.invitation_expires_at THEN
    RAISE EXCEPTION 'invitation rejected (expiry): the code expires in the future and no later than the invitation window' USING ERRCODE = '22023';
  END IF;
  -- the delivery IS the record (its row; the workspace's event log gains nothing here: the provisioning path's log is pinned by the B34-F1 harness)
  INSERT INTO executive.invitation_deliveries (delivery_id, scope, tenant_id, domain_id, grant_id, message_id, recipient_principal_id, code_hash, sealed_material, code_expires_at, delivered_by, correlation_id)
  VALUES (p_delivery_id, 'DOMAIN', p_tenant, p_domain, p_grant, m.message_id, g.principal_id, p_code_hash, p_sealed, p_code_expires_at, p_actor, p_correlation);
  RETURN jsonb_build_object('delivery_id', p_delivery_id, 'grant_id', p_grant, 'message_id', m.message_id, 'channel', 'demo-mailbox', 'synthetic', true, 'code_expires_at', p_code_expires_at,
                            'recipient', g.principal_id, 'login_name', g.login_name, 'delivered_by', p_actor, 'pickup', 'POST /v1/collab/invitations/pickup {invitationId, code}');
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.deliver_invitation(uuid, uuid, uuid, uuid, text, text, timestamptz, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.deliver_invitation(uuid, uuid, uuid, uuid, text, text, timestamptz, uuid, uuid) TO eye_commit;

/* THE PICKUP — the one port of this system reached WITHOUT A PRINCIPAL (the addressed person is not yet a principal): the mailbox's one-time
   code is its authority, so it asserts no bound action and no scope (stated). It NEVER raises: every attempt is a row of
   executive.invitation_pickups whatever its outcome (a refusal that rolled the ledger back would leave the failures uncounted), and the
   caller maps the outcome to its refusal after the commit. Wrong code: counted; the fifth failure LOCKS the invitation (invitation.locked;
   the owner revokes and re-invites). Picked up: once; a second pickup refused (already_picked_up). Expired: the code's expiry, the
   invitation window or the grant. Only the SEALED material leaves — opened in the process by the code the caller holds. */
CREATE OR REPLACE FUNCTION executive.pickup_invitation(p_grant uuid, p_code_hash text, p_from text, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, public, pg_catalog, pg_temp AS $$
DECLARE g executive.collab_grants%ROWTYPE; d executive.invitation_deliveries%ROWTYPE; w executive.collab_workspaces%ROWTYPE; v_outcome text; v_failures int;
BEGIN
  SELECT * INTO g FROM executive.collab_grants x WHERE x.grant_id = p_grant;
  IF NOT FOUND THEN RETURN jsonb_build_object('outcome', 'unknown_invitation', 'grant_id', p_grant); END IF;
  SELECT * INTO d FROM executive.invitation_deliveries x WHERE x.grant_id = p_grant FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO executive.invitation_pickups (pickup_id, scope, tenant_id, domain_id, grant_id, outcome, failures_after, from_address, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', g.tenant_id, g.domain_id, p_grant, 'not_delivered', 0, left(coalesce(p_from, 'unstated'), 200), p_correlation);
    RETURN jsonb_build_object('outcome', 'not_delivered', 'grant_id', p_grant);
  END IF;
  v_failures := d.failures;
  IF d.locked_at IS NOT NULL THEN v_outcome := 'locked';
  ELSIF d.picked_up_at IS NOT NULL THEN v_outcome := 'already_picked_up';
  ELSIF g.state <> 'invited' THEN v_outcome := 'grant_not_open';
  ELSIF d.code_expires_at <= clock_timestamp() OR g.invitation_expires_at <= clock_timestamp() OR g.expires_at <= clock_timestamp() THEN v_outcome := 'expired';
  ELSIF coalesce(p_code_hash, '') <> d.code_hash THEN
    v_outcome := 'wrong_code'; v_failures := least(d.failures + 1, 5);
    UPDATE executive.invitation_deliveries SET failures = v_failures, locked_at = CASE WHEN v_failures >= 5 THEN clock_timestamp() ELSE NULL END WHERE delivery_id = d.delivery_id;
    IF v_failures >= 5 THEN
      v_outcome := 'locked';
      PERFORM executive._collab_event(g.workspace_id, g.tenant_id, g.domain_id, 'invitation.locked', g.provisioned_by,
                jsonb_build_object('grant_id', p_grant, 'delivery_id', d.delivery_id, 'failures', v_failures, 'from', left(coalesce(p_from, 'unstated'), 200), 'next', 'the owner revokes and re-invites'), p_correlation);
    ELSE
      PERFORM executive._collab_event(g.workspace_id, g.tenant_id, g.domain_id, 'invitation.pickup_refused', g.provisioned_by,
                jsonb_build_object('grant_id', p_grant, 'delivery_id', d.delivery_id, 'failures', v_failures, 'from', left(coalesce(p_from, 'unstated'), 200)), p_correlation);
    END IF;
  ELSE
    v_outcome := 'picked_up';
    UPDATE executive.invitation_deliveries SET picked_up_at = clock_timestamp(), picked_up_from = left(coalesce(p_from, 'unstated'), 200) WHERE delivery_id = d.delivery_id;
    PERFORM executive._collab_event(g.workspace_id, g.tenant_id, g.domain_id, 'invitation.picked_up', g.principal_id,
              jsonb_build_object('grant_id', p_grant, 'delivery_id', d.delivery_id, 'from', left(coalesce(p_from, 'unstated'), 200), 'next', 'the invitee signs in with the material and accepts (0091 §F1)'), p_correlation);
  END IF;
  INSERT INTO executive.invitation_pickups (pickup_id, scope, tenant_id, domain_id, grant_id, outcome, failures_after, from_address, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', g.tenant_id, g.domain_id, p_grant, v_outcome, v_failures, left(coalesce(p_from, 'unstated'), 200), p_correlation);
  IF v_outcome <> 'picked_up' THEN RETURN jsonb_build_object('outcome', v_outcome, 'grant_id', p_grant, 'failures', v_failures, 'remaining', 5 - v_failures); END IF;
  SELECT * INTO w FROM executive.collab_workspaces x WHERE x.workspace_id = g.workspace_id;
  RETURN jsonb_build_object('outcome', 'picked_up', 'grant_id', p_grant, 'tenant_id', g.tenant_id, 'domain_id', g.domain_id, 'workspace_id', g.workspace_id, 'workspace_title', w.title,
                            'purpose', g.purpose, 'audience_ceiling', g.audience_ceiling, 'expires_at', g.expires_at, 'invitation_expires_at', g.invitation_expires_at,
                            'principal_id', g.principal_id, 'login_name', g.login_name, 'display_name', g.display_name, 'sealed_material', d.sealed_material, 'picked_up_at', clock_timestamp());
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.pickup_invitation(uuid, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.pickup_invitation(uuid, text, text, uuid) TO eye_commit;

/* The delivery as a member reads it (never the hash, never the sealed material): the state of the invitation's pickup. */
CREATE OR REPLACE FUNCTION executive.invitation_delivery_of(p_grant uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = executive, pg_catalog, pg_temp AS $$
  SELECT CASE WHEN d.delivery_id IS NULL THEN NULL ELSE jsonb_build_object('delivery_id', d.delivery_id, 'channel', d.channel, 'synthetic', d.synthetic_state, 'delivered_at', d.delivered_at,
    'code_expires_at', d.code_expires_at, 'failures', d.failures, 'locked_at', d.locked_at, 'picked_up_at', d.picked_up_at, 'picked_up_from', d.picked_up_from,
    'state', CASE WHEN d.locked_at IS NOT NULL THEN 'locked' WHEN d.picked_up_at IS NOT NULL THEN 'picked_up' WHEN d.code_expires_at <= clock_timestamp() THEN 'expired' ELSE 'delivered' END,
    'attempts', (SELECT coalesce(jsonb_agg(jsonb_build_object('outcome', p.outcome, 'from', p.from_address, 'at', p.attempted_at) ORDER BY p.attempted_at), '[]'::jsonb) FROM executive.invitation_pickups p WHERE p.grant_id = p_grant)) END
    FROM (VALUES (1)) n(one) LEFT JOIN executive.invitation_deliveries d ON d.grant_id = p_grant
$$;
GRANT EXECUTE ON FUNCTION executive.invitation_delivery_of(uuid) TO eye_app, eye_commit;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §C4 THE ENFORCED ACTIVATION OF A REAL EXECUTION TARGET (u; F-P6-05)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
/* A target's ACTIVATION STATE: `synthetic` for a target recorded synthetic (0090's declare — every target until now); `inactive` at
   registration for a NON-synthetic one; `active` only through decision.activate_execution_target. The 0090 CHECK that admitted only
   synthetic rows is replaced by the binding of the flag to the state; 0090's retire-only trigger compares the columns it names, so the
   activation columns move under it without a re-declaration. */
ALTER TABLE decision.execution_targets DROP CONSTRAINT execution_targets_synthetic_check;
ALTER TABLE decision.execution_targets
  ADD COLUMN activation_state       text NOT NULL DEFAULT 'synthetic' CHECK (activation_state IN ('synthetic', 'inactive', 'active')),
  ADD COLUMN activated_at           timestamptz,
  ADD COLUMN activated_by           uuid,
  ADD COLUMN authorized_by_decision uuid,
  ADD COLUMN deactivated_at         timestamptz,
  ADD COLUMN deactivated_by         uuid,
  ADD COLUMN deactivation_reason    text;
ALTER TABLE decision.execution_targets ADD CONSTRAINT det_activation_bound CHECK (
  (synthetic AND activation_state = 'synthetic' AND activated_at IS NULL AND authorized_by_decision IS NULL)
  OR (NOT synthetic AND activation_state IN ('inactive', 'active')
      AND ((activation_state = 'active') = (activated_at IS NOT NULL AND activated_by IS NOT NULL AND authorized_by_decision IS NOT NULL AND deactivated_at IS NULL))));

/* REGISTER a NON-synthetic target `inactive` (the domain administrator; the same shape as 0090's declare — an https endpoint without
   userinfo, a trust anchor, a credential by reference — recorded synthetic = false). Registering is NOT activating: no handoff reaches it
   until a named execution authority activates it with the owner's decision. The harness registers a LOOPBACK LITERAL as its "real" target:
   nothing real is reached, and the production egress refuses it by the B14 rule. */
CREATE OR REPLACE FUNCTION decision.register_execution_target(
  p_target_id uuid, p_tenant uuid, p_domain uuid, p_key text, p_label text, p_endpoint text, p_trust_anchor text, p_credential_ref text, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, observation, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.execution.target.register']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'execution registration rejected (actor): recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF NOT decision.is_active_human(p_actor, p_tenant) THEN RAISE EXCEPTION 'execution registration rejected (actor): a named, active member registers a target' USING ERRCODE = '42501'; END IF;
  IF p_key IS NULL OR p_key !~ '^[a-z0-9][a-z0-9-]{1,62}$' THEN RAISE EXCEPTION 'execution registration rejected (key): lower-case letters, digits and dashes, 2 to 63' USING ERRCODE = '22023'; END IF;
  IF coalesce(length(btrim(p_label)), 0) NOT BETWEEN 2 AND 200 THEN RAISE EXCEPTION 'execution registration rejected (label): 2 to 200 characters' USING ERRCODE = '22023'; END IF;
  IF p_endpoint IS NULL OR p_endpoint !~ '^https://[^/@\s]+(/[^\s]*)?$' THEN RAISE EXCEPTION 'execution registration rejected (endpoint): an https:// URL without userinfo' USING ERRCODE = '22023'; END IF;
  IF p_trust_anchor IS NULL OR btrim(p_trust_anchor) = '' THEN RAISE EXCEPTION 'execution registration rejected (trust_anchor): a non-synthetic target declares the trust anchor its TLS identity is verified against' USING ERRCODE = '22023'; END IF;
  IF p_credential_ref IS NOT NULL AND p_credential_ref !~ '^EYE_DST_[A-Z0-9_]{1,64}$' THEN
    RAISE EXCEPTION 'execution registration rejected (credential_ref): the deployment variable EYE_DST_<NAME>' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM decision.execution_targets t WHERE t.tenant_id = p_tenant AND t.domain_id = p_domain AND t.target_key = p_key) THEN
    RAISE EXCEPTION 'execution registration rejected (duplicate): % is declared in this domain; a target is retired, never redeclared', p_key USING ERRCODE = '23505';
  END IF;
  INSERT INTO decision.execution_targets (target_id, scope, tenant_id, domain_id, target_key, label, endpoint, trust_anchor_pem, credential_ref, synthetic, activation_state, declared_by, correlation_id)
  VALUES (p_target_id, 'DOMAIN', p_tenant, p_domain, p_key, btrim(p_label), p_endpoint, p_trust_anchor, p_credential_ref, false, 'inactive', p_actor, p_correlation);
  PERFORM decision._commitment_event(p_tenant, p_domain, NULL, NULL, 'target.declared', p_actor, jsonb_build_object('target_id', p_target_id, 'target_key', p_key, 'endpoint', p_endpoint, 'synthetic', false,
                                     'activation_state', 'inactive', 'trust_anchor', true, 'credential_ref', p_credential_ref, 'next', 'an execution authority activates it with the owner''s committed decision'), p_correlation);
  RETURN (SELECT to_jsonb(t) - 'trust_anchor_pem' || jsonb_build_object('trust_anchor_declared', true) FROM decision.execution_targets t WHERE t.target_id = p_target_id);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.register_execution_target(uuid, uuid, uuid, text, text, text, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.register_execution_target(uuid, uuid, uuid, text, text, text, text, text, uuid, uuid) TO eye_commit;

/* ACTIVATE (the owner-authorized, recorded activation): a named, active member holding execution_authority who is NOT the target's registrar
   (two acts, two people), with the OWNER'S DECISION — a decision package of this domain, COMMITTED through the gate, whose committed
   version's payload (the choice, the constraints, the title or the statement) names the target's key. A synthetic target is never
   activated (it has no activation to make); a retired one neither; an active one is not activated twice. Recorded on the target and on
   the authorizing decision's log (execution.target_activated — §0's vocabulary). */
CREATE OR REPLACE FUNCTION decision.activate_execution_target(p_tenant uuid, p_domain uuid, p_key text, p_decision uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE t decision.execution_targets%ROWTYPE; p decision.packages_current%ROWTYPE; v decision.package_versions%ROWTYPE; cm decision.commitments%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.execution.target.activate']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'execution activation rejected (actor): recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF NOT decision.is_active_human(p_actor, p_tenant) OR NOT decision.holds_role(p_actor, p_tenant, p_domain, 'execution_authority') THEN
    RAISE EXCEPTION 'execution activation rejected (authority): principal % is not an active member holding execution_authority in this domain', p_actor USING ERRCODE = '42501';
  END IF;
  SELECT * INTO t FROM decision.execution_targets x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.target_key = p_key FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'execution activation rejected (unknown_target): no target % in this domain', p_key USING ERRCODE = '23503'; END IF;
  IF t.state <> 'active' THEN RAISE EXCEPTION 'execution activation rejected (retired): target % is retired', p_key USING ERRCODE = '23505'; END IF;
  IF t.synthetic THEN RAISE EXCEPTION 'execution activation rejected (synthetic): target % is recorded synthetic — it has no activation to make; a real target is registered non-synthetic first', p_key USING ERRCODE = '23505'; END IF;
  IF t.activation_state = 'active' THEN RAISE EXCEPTION 'execution activation rejected (state): target % is active already (since %, by decision %)', p_key, t.activated_at, t.authorized_by_decision USING ERRCODE = '23505'; END IF;
  IF p_actor = t.declared_by THEN RAISE EXCEPTION 'execution activation rejected (separation): the registrar of target % never activates it — a second named human does', p_key USING ERRCODE = '42501'; END IF;
  SELECT * INTO p FROM decision.packages_current x WHERE x.package_id = p_decision AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'execution activation rejected (unknown_decision): no decision package % in this domain', p_decision USING ERRCODE = '23503'; END IF;
  IF p.state NOT IN ('committed', 'monitoring') OR p.committed_version IS NULL THEN
    RAISE EXCEPTION 'execution activation rejected (decision_not_committed): decision % is %; the owner''s decision is COMMITTED through the gate before it authorizes an activation', p_decision, p.state USING ERRCODE = '23505';
  END IF;
  SELECT * INTO v FROM decision.package_versions x WHERE x.package_id = p_decision AND x.version = p.committed_version;
  SELECT * INTO cm FROM decision.commitments x WHERE x.package_id = p_decision;
  IF position(lower(p_key) IN lower(coalesce(v.choice::text, '') || ' ' || coalesce(v.constraints::text, '') || ' ' || p.title || ' ' || p.statement)) = 0 THEN
    RAISE EXCEPTION 'execution activation rejected (decision_names_no_target): the committed decision % names no target %; the owner''s decision states which target it authorizes', p_decision, p_key USING ERRCODE = '22023';
  END IF;
  UPDATE decision.execution_targets SET activation_state = 'active', activated_at = clock_timestamp(), activated_by = p_actor, authorized_by_decision = p_decision,
                                        deactivated_at = NULL, deactivated_by = NULL, deactivation_reason = NULL WHERE target_id = t.target_id;
  INSERT INTO decision.package_events (event_id, scope, tenant_id, domain_id, package_id, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_decision, 'execution.target_activated', p_actor,
          jsonb_build_object('target_id', t.target_id, 'target_key', p_key, 'endpoint', t.endpoint, 'synthetic', false, 'registered_by', t.declared_by, 'activated_by', p_actor,
                             'authorized_by_decision', p_decision, 'committed_version', p.committed_version, 'committed_by', cm.committed_by, 'decision_owner', p.owner_principal_id), p_correlation);
  RETURN (SELECT to_jsonb(x) - 'trust_anchor_pem' || jsonb_build_object('trust_anchor_declared', x.trust_anchor_pem IS NOT NULL, 'decision', jsonb_build_object('package_id', p_decision, 'title', p.title, 'state', p.state,
            'committed_version', p.committed_version, 'owner', p.owner_principal_id, 'committed_by', cm.committed_by))
          FROM decision.execution_targets x WHERE x.target_id = t.target_id);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.activate_execution_target(uuid, uuid, text, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.activate_execution_target(uuid, uuid, text, uuid, uuid, uuid) TO eye_commit;

/* DEACTIVATE (an execution authority or a domain administrator, a reason): new handoffs refused at once (the gateway below reads the
   state); what is in flight stays in flight under its own record. Recorded on the target and on the authorizing decision's log. */
CREATE OR REPLACE FUNCTION decision.deactivate_execution_target(p_tenant uuid, p_domain uuid, p_key text, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE t decision.execution_targets%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.execution.target.deactivate']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'execution activation rejected (actor): recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF NOT decision.is_active_human(p_actor, p_tenant) OR NOT (decision.holds_role(p_actor, p_tenant, p_domain, 'execution_authority') OR decision.holds_role(p_actor, p_tenant, p_domain, 'domain_admin')) THEN
    RAISE EXCEPTION 'execution activation rejected (authority): principal % is not an active member holding execution_authority or domain_admin in this domain', p_actor USING ERRCODE = '42501';
  END IF;
  IF coalesce(length(btrim(p_reason)), 0) < 8 THEN RAISE EXCEPTION 'execution activation rejected (reason): a deactivation states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  SELECT * INTO t FROM decision.execution_targets x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.target_key = p_key FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'execution activation rejected (unknown_target): no target % in this domain', p_key USING ERRCODE = '23503'; END IF;
  IF t.synthetic THEN RAISE EXCEPTION 'execution activation rejected (synthetic): target % is recorded synthetic — it is retired, never deactivated', p_key USING ERRCODE = '23505'; END IF;
  IF t.activation_state <> 'active' THEN RAISE EXCEPTION 'execution activation rejected (state): target % is %, not active', p_key, t.activation_state USING ERRCODE = '23505'; END IF;
  UPDATE decision.execution_targets SET activation_state = 'inactive', deactivated_at = clock_timestamp(), deactivated_by = p_actor, deactivation_reason = btrim(p_reason),
                                        activated_at = NULL, activated_by = NULL, authorized_by_decision = NULL WHERE target_id = t.target_id;
  INSERT INTO decision.package_events (event_id, scope, tenant_id, domain_id, package_id, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, t.authorized_by_decision, 'execution.target_deactivated', p_actor,
          jsonb_build_object('target_id', t.target_id, 'target_key', p_key, 'reason', btrim(p_reason), 'was_active_since', t.activated_at, 'activated_by', t.activated_by, 'authorized_by_decision', t.authorized_by_decision), p_correlation);
  RETURN (SELECT to_jsonb(x) - 'trust_anchor_pem' || jsonb_build_object('trust_anchor_declared', x.trust_anchor_pem IS NOT NULL, 'previously', jsonb_build_object('activated_at', t.activated_at, 'activated_by', t.activated_by, 'authorized_by_decision', t.authorized_by_decision))
          FROM decision.execution_targets x WHERE x.target_id = t.target_id);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.deactivate_execution_target(uuid, uuid, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.deactivate_execution_target(uuid, uuid, text, text, uuid, uuid) TO eye_commit;

/* THE GATEWAY — decision.issue_execution_handoff re-declared from 0090 §C5 line 2090 WHOLE with ONE addition (marked B36): a NON-synthetic
   target that is not `active` refuses the issue — `execution handoff rejected (inactive_target)`; a synthetic target is unaffected. The
   returned target object also names its activation_state (the same addition: the issuer's answer says what it reached). */
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
  -- B36 (0094 §C4): THE ONE ADDITION — a real (non-synthetic) target carries a handoff only while ACTIVE (an owner-authorized, recorded activation)
  IF NOT t.synthetic AND t.activation_state <> 'active' THEN
    RAISE EXCEPTION 'execution handoff rejected (inactive_target): target % is % — a named execution authority activates it with the owner''s committed decision before any handoff reaches it', t.target_key, t.activation_state USING ERRCODE = '23505';
  END IF;
  -- end B36
  SELECT * INTO i FROM decision.commitment_items x WHERE x.item_id = h.item_id;
  UPDATE decision.execution_handoffs SET state = 'issuing', issued_by = p_actor, issued_at = clock_timestamp(), next_attempt_at = clock_timestamp(), policy_decision_id = public.eye_policy_decision()
   WHERE handoff_id = p_handoff;
  v_event := decision._commitment_event(p_tenant, p_domain, h.commitment_id, h.item_id, 'handoff.issued', p_actor,
                                        jsonb_build_object('handoff_id', p_handoff, 'target_key', t.target_key, 'payload_digest', h.payload_digest, 'op_class', 'C3', 'policy_decision_id', public.eye_policy_decision()), p_correlation);
  INSERT INTO decision.package_events (event_id, scope, tenant_id, domain_id, package_id, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, i.package_id, 'execution.handoff_issued', p_actor,
          jsonb_build_object('commitment_id', h.commitment_id, 'item_id', h.item_id, 'handoff_id', p_handoff, 'target_key', t.target_key, 'payload_digest', h.payload_digest, 'role', h.role), p_correlation);
  RETURN jsonb_build_object('handoff_id', p_handoff, 'commitment_id', h.commitment_id, 'item_id', h.item_id, 'state', 'issuing', 'payload', h.payload, 'payload_digest', h.payload_digest,
                            'target', jsonb_build_object('target_key', t.target_key, 'endpoint', t.endpoint, 'trust_anchor_pem', t.trust_anchor_pem, 'credential_ref', t.credential_ref, 'synthetic', t.synthetic,
                                                         'activation_state', t.activation_state),
                            'event_id', v_event, 'attempts', 0);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.issue_execution_handoff(uuid, uuid, uuid, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.issue_execution_handoff(uuid, uuid, uuid, text, uuid, uuid) TO eye_commit;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §C5 THE LEARN STEP (j; JRN-09, PR-28-001/-002, CAP-FW-05)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
/* After an outcome review (0090 §X5 — the effect, the residual, the lesson), the LEARNING on the exposure's lineage: what was EXPECTED
   (the accepted assessment the response was opened under — its probability bracket or plausibility, its impact range and unit, its
   version), what HAPPENED (the review's outcomes and its effect), and what CHANGES in the estimate's basis (the owner's words: the next
   assessment's basis). One learning per review; the owner or the sponsor records it; append-only. */
CREATE TABLE prediction.exposure_learnings (
  learning_id      uuid PRIMARY KEY,
  scope            text NOT NULL,
  tenant_id        uuid NOT NULL,
  domain_id        uuid NOT NULL,
  exposure_id      uuid NOT NULL REFERENCES prediction.exposure_current (exposure_id),
  review_id        uuid NOT NULL UNIQUE REFERENCES prediction.exposure_outcome_reviews (review_id),
  response_id      uuid NOT NULL REFERENCES prediction.exposure_responses (response_id),
  basis_version    int,
  expected         jsonb NOT NULL CHECK (jsonb_typeof(expected) = 'object'),
  observed         jsonb NOT NULL CHECK (jsonb_typeof(observed) = 'object'),
  basis_change     text NOT NULL CHECK (length(btrim(basis_change)) BETWEEN 16 AND 4000),
  recorded_by      uuid NOT NULL,
  recorded_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id   uuid NOT NULL,
  CONSTRAINT pexl_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX pexl_exposure ON prediction.exposure_learnings (exposure_id, recorded_at);
COMMENT ON TABLE prediction.exposure_learnings IS 'B36 (0094 §C5): the learn step of the outcome loop — after an outcome review, what was expected, what happened, what changes in the estimate''s basis (JRN-09, PR-28-001/-002, CAP-FW-05); append-only';
CREATE TRIGGER pexl_append_only BEFORE UPDATE OR DELETE ON prediction.exposure_learnings FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
ALTER TABLE prediction.exposure_learnings ENABLE ROW LEVEL SECURITY;
ALTER TABLE prediction.exposure_learnings FORCE ROW LEVEL SECURITY;
CREATE POLICY prediction_isolation ON prediction.exposure_learnings USING (tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain()));
GRANT SELECT ON prediction.exposure_learnings TO eye_app, eye_commit;

CREATE OR REPLACE FUNCTION prediction.record_exposure_learning(p_learning_id uuid, p_exposure uuid, p_tenant uuid, p_domain uuid, p_review uuid, p_expected_note text, p_observed_note text, p_basis_change text,
                                                              p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, decision, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE x prediction.exposure_current%ROWTYPE; k prediction.exposure_outcome_reviews%ROWTYPE; v prediction.exposure_versions%ROWTYPE; v_expected jsonb; v_observed jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.exposure.learn']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'exposure learning rejected (actor): recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO x FROM prediction.exposure_current e WHERE e.exposure_id = p_exposure AND e.tenant_id = p_tenant AND e.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'exposure learning rejected (unknown_exposure): no exposure % in this domain', p_exposure USING ERRCODE = '23503'; END IF;
  IF (p_actor IS DISTINCT FROM x.owner_principal_id AND p_actor IS DISTINCT FROM x.sponsor_principal_id) OR NOT decision.is_active_human(p_actor, p_tenant) THEN
    RAISE EXCEPTION 'exposure learning rejected (not_owner): a learning is recorded by the exposure''s owner (%) or its sponsor, a named, active member', x.owner_principal_id USING ERRCODE = '42501';
  END IF;
  SELECT * INTO k FROM prediction.exposure_outcome_reviews r WHERE r.review_id = p_review AND r.exposure_id = p_exposure;
  IF NOT FOUND THEN RAISE EXCEPTION 'exposure learning rejected (unknown_review): no outcome review % of exposure %', p_review, p_exposure USING ERRCODE = '23503'; END IF;
  IF EXISTS (SELECT 1 FROM prediction.exposure_learnings l WHERE l.review_id = p_review) THEN
    RAISE EXCEPTION 'exposure learning rejected (duplicate): the outcome review % carries its learning already; a later review learns again', p_review USING ERRCODE = '23505';
  END IF;
  IF coalesce(length(btrim(p_basis_change)), 0) NOT BETWEEN 16 AND 4000 THEN RAISE EXCEPTION 'exposure learning rejected (basis_change): what changes in the estimate''s basis (16..4000 characters)' USING ERRCODE = '22023'; END IF;
  IF coalesce(length(btrim(p_expected_note)), 0) NOT BETWEEN 8 AND 2000 OR coalesce(length(btrim(p_observed_note)), 0) NOT BETWEEN 8 AND 2000 THEN
    RAISE EXCEPTION 'exposure learning rejected (notes): what was expected and what happened, each in words (8..2000 characters)' USING ERRCODE = '22023';
  END IF;
  -- what was EXPECTED: the assessment in force (accepted, else current) — the bracket the response was opened under
  SELECT * INTO v FROM prediction.exposure_versions w WHERE w.exposure_id = p_exposure AND w.version = coalesce(x.accepted_version, NULLIF(x.current_version, 0));
  v_expected := jsonb_build_object('note', btrim(p_expected_note), 'version', v.version, 'version_state', v.state,
                                   'probability', CASE WHEN v.probability_low IS NULL THEN NULL ELSE jsonb_build_object('low', v.probability_low, 'high', v.probability_high) END,
                                   'plausibility', v.plausibility, 'impact', jsonb_build_object('low', v.impact_low, 'high', v.impact_high, 'unit', v.unit), 'horizon', v.horizon,
                                   'residual_before_review', k.residual_before);
  v_observed := jsonb_build_object('note', btrim(p_observed_note), 'outcomes', k.outcomes, 'effect', k.effect, 'residual_verdict', k.residual_verdict, 'residual_after_review', k.residual_after,
                                   'lesson', k.lesson, 'reviewed_at', k.reviewed_at);
  INSERT INTO prediction.exposure_learnings (learning_id, scope, tenant_id, domain_id, exposure_id, review_id, response_id, basis_version, expected, observed, basis_change, recorded_by, correlation_id)
  VALUES (p_learning_id, 'DOMAIN', p_tenant, p_domain, p_exposure, p_review, k.response_id, v.version, v_expected, v_observed, btrim(p_basis_change), p_actor, p_correlation);
  PERFORM prediction.exposure_event(p_exposure, p_tenant, p_domain, 'exposure.learning_recorded', p_actor,
    jsonb_build_object('learning_id', p_learning_id, 'review_id', p_review, 'response_id', k.response_id, 'basis_version', v.version, 'expected', v_expected, 'observed', v_observed,
                       'basis_change', btrim(p_basis_change), 'next', 'the next assessment cites this learning as its basis'), p_correlation);
  RETURN jsonb_build_object('learning_id', p_learning_id, 'exposure_id', p_exposure, 'review_id', p_review, 'response_id', k.response_id, 'basis_version', v.version, 'expected', v_expected,
                            'observed', v_observed, 'basis_change', btrim(p_basis_change), 'recorded_by', p_actor, 'recorded_at', clock_timestamp());
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.record_exposure_learning(uuid,uuid,uuid,uuid,uuid,text,text,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.record_exposure_learning(uuid,uuid,uuid,uuid,uuid,text,text,text,uuid,uuid) TO eye_commit;

-- RLS and grants for this section's executive tables (the 0081 loop idiom; the ports write).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['human_task_dependencies', 'invitation_deliveries', 'invitation_pickups'] LOOP
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
