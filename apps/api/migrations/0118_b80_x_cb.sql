-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0118 §CB — CP-6 B80 part `cb`: THE OPERATING CONTEXT BAR AND SCOPE SWITCHING (F-P7-E-01; UX-10-001…006, CMP-010, PAT-02, UX-ADR-003,
-- REL-03, CAP-AU-04, CAP-EO-02). The part-local file, folded into 0118 at integration after §SH; it applies ALONE on 0001–0117 + the prelude.
--
-- What it builds on (unchanged): 0094 §0's executive.contexts (append-only, one current row per principal and domain), executive.set_context
-- (the port; `context rejected (stale)`), executive.current_context and executive.context_choices (the switcher's choices with staleness).
--
-- What it adds:
--   §CB.1 executive.context_setter_roles() — the HUMAN DOMAIN roles that may set a context (DESIGN D3: every human domain role; the agents,
--         the subscribers (workloads) and the external collaborator excluded). The PDP's `executive.context.set` rule carries the same list
--         (pdp.service.ts, the B80 cb block); the harness proves the two equal and every DOMAIN role classified.
--   §CB.2 executive.context_digest_of(…) — the context digest, the SAME formula 0094's set_context records (so a preview names the digest the
--         commit will record).
--   §CB.3 executive.context_bar(tenant, domain, principal) — THE BAR's read: the principal's current context in this domain with its titles,
--         its version (the count of its append-only rows), the staleness of what it names (reconciled on read: a context naming an objective
--         since closed is shown with that dimension UNRESOLVED, never as current), and the choices.
--   §CB.4 executive.context_impact(tenant, domain, principal, proposed …) — THE IMPACT PREVIEW (PAT-02, UX-10-003/-004): the changed
--         dimensions; the stale choices; the affected open work — the principal's drafts (kept: a draft is personal and never discarded by a
--         switch), open tasks, routed requests, open workspaces and rooms (kept: nothing is re-scoped; each names whether it is linked to the
--         old or the new objective / scenario); the home's sections (recomposed under the new context); the APPROVALS listed as UNAFFECTED
--         (an approval binds the version digest it read — a context switch changes no version, eligibility, evidence or policy scope); the
--         client-held previews (invalidated by the page's registry; the server holds none); and the IMPACT DIGEST the commit must present.
--   §CB.5 executive.commit_context(…) — THE DELIBERATE COMMIT: the human, the role, the staleness (an objective or scenario not active),
--         the basis (the context the preview was computed from is still current) and the impact digest (the affected work has not changed
--         since the preview) RE-CHECKED IN THE PORT, then 0094's set_context, then the shell ledger row `shell.context.committed`.
--
-- THE PRINCIPLES: a context switch is PRESENTATION — it never alters an approval, never re-scopes work, never discards a draft; it is never
-- silent (no commit without the preview's digest); a stale or unresolved dimension is never shown as current. THREE CLAIMS: this file and
-- its harness (phase6-context-b80.test.ts) are CONSTRUCTION; the act (act-b80, l.brandt's switch) is DEMONSTRATED OPERATION on SYNTHETIC
-- personas; real acceptance (UX-10-006) is the shared non-demonstration recording path at B111 (F-P7-E-17's design acceptance slice), then H3.
--
-- Refusals in the CLASS form, all under the noun `context` mapped by B36 home's rows (observation-errors.ts): `(actor)` 403, `(stale)` 409,
-- every other class 422.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- §CB.1 THE ROLES THAT MAY SET A CONTEXT (D3) ──────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION executive.context_setter_roles() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY[
  'domain_admin', 'domain_analyst', 'collection_manager', 'extraction_manager', 'resolution_manager',
  'decision_owner', 'decision_approver', 'decision_authority', 'executive', 'executive_operator', 'board_member',
  'strategy_owner', 'forecast_owner', 'twin_owner', 'simulation_operator',
  'knowledge_owner', 'record_authority', 'retention_steward', 'ontology_steward',
  'risk_owner', 'opportunity_sponsor', 'execution_authority', 'method_steward', 'constraint_steward', 'data_steward',
  'domain_specialist', 'product_analytics_owner', 'privacy_officer', 'product_analyst', 'support_engineer', 'enablement_assessor'] $$;
COMMENT ON FUNCTION executive.context_setter_roles() IS 'B80 §CB (0118): the human DOMAIN roles that may set an operating context (DESIGN D3) — agents, subscribers (workloads) and the external collaborator never; the PDP rule executive.context.set carries the same list';
GRANT EXECUTE ON FUNCTION executive.context_setter_roles() TO eye_app, eye_commit;

-- §CB.2 THE DIGEST (0094 set_context's formula, verbatim) ──────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION executive.context_digest_of(p_tenant uuid, p_domain uuid, p_objective uuid, p_horizon text, p_scenario uuid, p_classification text, p_effective_at timestamptz)
RETURNS text LANGUAGE sql STABLE SET search_path = public, pg_catalog, pg_temp AS $$
  SELECT encode(digest(concat_ws('|', p_tenant::text, p_domain::text, coalesce(p_objective::text, ''), p_horizon, coalesce(p_scenario::text, ''), p_classification, coalesce(p_effective_at::text, '')), 'sha256'), 'hex')
$$;
GRANT EXECUTE ON FUNCTION executive.context_digest_of(uuid, uuid, uuid, text, uuid, text, timestamptz) TO eye_app, eye_commit;

-- the subject of a dimension in words: the objective (a graph OBJ) or the scenario, its title and its liveness — NULL when unknown here
CREATE OR REPLACE FUNCTION executive.context_subject(p_tenant uuid, p_domain uuid, p_kind text, p_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = executive, pg_catalog, pg_temp AS $$
  SELECT CASE
    WHEN p_id IS NULL THEN NULL
    WHEN p_kind = 'objective' THEN (SELECT jsonb_build_object('id', s.strategy_object_id, 'title', s.title, 'status', s.status, 'stale', s.status <> 'active')
                                       FROM graph.strategy_current s WHERE s.strategy_object_id = p_id AND s.tenant_id = p_tenant AND s.domain_id = p_domain AND s.object_type = 'OBJ')
    ELSE (SELECT jsonb_build_object('id', x.scenario_id, 'title', x.title, 'status', x.state, 'stale', x.state <> 'active')
            FROM prediction.scenarios_current x WHERE x.scenario_id = p_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain)
  END
$$;
REVOKE ALL ON FUNCTION executive.context_subject(uuid, uuid, text, uuid) FROM PUBLIC;

-- the staleness of a named subject, in the port's words (NULL when it may be set)
CREATE OR REPLACE FUNCTION executive.context_stale_reason(p_tenant uuid, p_domain uuid, p_kind text, p_id uuid) RETURNS text
LANGUAGE plpgsql STABLE SET search_path = executive, pg_catalog, pg_temp AS $$
DECLARE s jsonb := executive.context_subject(p_tenant, p_domain, p_kind, p_id);
BEGIN
  IF p_id IS NULL THEN RETURN NULL; END IF;
  IF s IS NULL THEN
    RETURN format('context rejected (stale): %s %s is not %s of this domain', p_kind, p_id, CASE WHEN p_kind = 'objective' THEN 'a live strategy object' ELSE 'a scenario' END);
  END IF;
  IF (s ->> 'stale')::boolean THEN
    RETURN format('context rejected (stale): %s %s is %s; a stale %s cannot be set', p_kind, p_id, s ->> 'status', p_kind);
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION executive.context_stale_reason(uuid, uuid, text, uuid) FROM PUBLIC;

-- §CB.3 THE BAR'S READ ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION executive.context_bar(p_tenant uuid, p_domain uuid, p_principal uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = executive, pg_catalog, pg_temp AS $$
DECLARE c executive.contexts; v_version int; v_obj jsonb; v_scn jsonb; v_unresolved jsonb := '[]'::jsonb;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the operating context');
  IF p_principal IS DISTINCT FROM public.eye_principal() THEN
    RAISE EXCEPTION 'context rejected (actor): the operating context is read by the acting principal, for its own context' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO c FROM executive.contexts x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.principal_id = p_principal AND x.superseded_at IS NULL;
  SELECT count(*)::int INTO v_version FROM executive.contexts x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.principal_id = p_principal;
  IF c.context_id IS NOT NULL THEN
    v_obj := executive.context_subject(p_tenant, p_domain, 'objective', c.objective_id);
    v_scn := executive.context_subject(p_tenant, p_domain, 'scenario', c.scenario_id);
    /* RECONCILED ON READ (UX-10-002 / -005): a dimension naming a subject no longer live (or no longer readable) is UNRESOLVED — the bar
       keeps the last valid context and says which dimension it cannot honour; it is never shown as current. */
    IF c.objective_id IS NOT NULL AND (v_obj IS NULL OR (v_obj ->> 'stale')::boolean) THEN
      v_unresolved := v_unresolved || jsonb_build_object('dimension', 'objective', 'id', c.objective_id, 'status', coalesce(v_obj ->> 'status', 'unknown'),
                                                         'reason', executive.context_stale_reason(p_tenant, p_domain, 'objective', c.objective_id));
    END IF;
    IF c.scenario_id IS NOT NULL AND (v_scn IS NULL OR (v_scn ->> 'stale')::boolean) THEN
      v_unresolved := v_unresolved || jsonb_build_object('dimension', 'scenario', 'id', c.scenario_id, 'status', coalesce(v_scn ->> 'status', 'unknown'),
                                                         'reason', executive.context_stale_reason(p_tenant, p_domain, 'scenario', c.scenario_id));
    END IF;
  END IF;
  RETURN jsonb_build_object(
    'as_of', clock_timestamp(),
    'tenant_id', p_tenant, 'domain_id', p_domain, 'principal_id', p_principal,
    'current', CASE WHEN c.context_id IS NULL THEN NULL ELSE jsonb_build_object(
      'context_id', c.context_id, 'version', v_version, 'digest', c.digest, 'set_at', c.set_at,
      'objective', CASE WHEN c.objective_id IS NULL THEN NULL ELSE coalesce(v_obj, jsonb_build_object('id', c.objective_id, 'title', NULL, 'status', 'unknown', 'stale', true)) END,
      'horizon', c.horizon,
      'scenario', CASE WHEN c.scenario_id IS NULL THEN NULL ELSE coalesce(v_scn, jsonb_build_object('id', c.scenario_id, 'title', NULL, 'status', 'unknown', 'stale', true)) END,
      'classification', c.classification, 'effective_at', c.effective_at) END,
    'version', v_version,
    'unresolved', v_unresolved,
    'may_set', EXISTS (SELECT 1 FROM identity.role_bindings b JOIN identity.principals p ON p.id = b.principal_id
                        WHERE b.principal_id = p_principal AND b.revoked_at IS NULL AND p.kind = 'human' AND p.status = 'active'
                          AND ((b.scope = 'DOMAIN' AND b.tenant_id = p_tenant AND b.domain_id = p_domain AND b.role_code = ANY (executive.context_setter_roles()))
                               OR (b.scope = 'PLATFORM' AND b.role_code = 'platform_admin'))),
    'choices', executive.context_choices(p_tenant, p_domain));
END $$;
COMMENT ON FUNCTION executive.context_bar(uuid, uuid, uuid) IS 'B80 §CB (0118): the operating context bar''s read — the principal''s current context in the domain (titles, version, digest), its unresolved dimensions (reconciled on read), whether the principal may set one, and the choices with their staleness';
REVOKE ALL ON FUNCTION executive.context_bar(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.context_bar(uuid, uuid, uuid) TO eye_app, eye_commit;

-- §CB.4 THE IMPACT PREVIEW ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION executive.context_impact(p_tenant uuid, p_domain uuid, p_principal uuid, p_objective uuid, p_horizon text, p_scenario uuid,
                                                    p_classification text, p_effective_at timestamptz) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = executive, pg_catalog, pg_temp AS $$
DECLARE
  c executive.contexts; v_now timestamptz := clock_timestamp(); v_limit int := 50;
  v_old_obj uuid; v_old_scn uuid; v_old_h text; v_old_cls text; v_old_eff timestamptz; v_old_digest text; v_new_digest text;
  v_changed jsonb := '[]'::jsonb; v_stale jsonb := '[]'::jsonb; v_reason text;
  v_drafts jsonb; v_tasks jsonb; v_requests jsonb; v_workspaces jsonb; v_rooms jsonb; v_approvals jsonb; v_ids jsonb;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the context impact');
  IF p_principal IS DISTINCT FROM public.eye_principal() THEN
    RAISE EXCEPTION 'context rejected (actor): the impact is read by the acting principal, for its own context' USING ERRCODE = '42501';
  END IF;
  IF p_horizon IS NULL OR p_horizon NOT IN ('30d', '90d', '12m', '36m') THEN
    RAISE EXCEPTION 'context rejected (horizon): the horizon is one of 30d, 90d, 12m, 36m' USING ERRCODE = '22023';
  END IF;
  IF p_classification IS NULL OR p_classification NOT IN ('public', 'internal', 'confidential', 'restricted') THEN
    RAISE EXCEPTION 'context rejected (classification): the classification ceiling is one of public, internal, confidential, restricted' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO c FROM executive.contexts x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.principal_id = p_principal AND x.superseded_at IS NULL;
  /* no context set: the reader's default — the whole domain, 90d, no scenario, the reader's own ceiling, effective now (0094 §0) */
  v_old_obj := c.objective_id; v_old_scn := c.scenario_id; v_old_h := coalesce(c.horizon, '90d'); v_old_cls := c.classification; v_old_eff := c.effective_at;
  v_old_digest := c.digest;
  v_new_digest := executive.context_digest_of(p_tenant, p_domain, p_objective, p_horizon, p_scenario, p_classification, p_effective_at);

  -- THE CHANGED DIMENSIONS (the tenant and the domain never change here: a different domain is a navigation, not a context)
  IF v_old_obj IS DISTINCT FROM p_objective THEN
    v_changed := v_changed || jsonb_build_object('dimension', 'objective', 'from', executive.context_subject(p_tenant, p_domain, 'objective', v_old_obj), 'from_id', v_old_obj,
                                                 'to', executive.context_subject(p_tenant, p_domain, 'objective', p_objective), 'to_id', p_objective);
  END IF;
  IF v_old_h IS DISTINCT FROM p_horizon THEN v_changed := v_changed || jsonb_build_object('dimension', 'horizon', 'from', v_old_h, 'to', p_horizon); END IF;
  IF v_old_scn IS DISTINCT FROM p_scenario THEN
    v_changed := v_changed || jsonb_build_object('dimension', 'scenario', 'from', executive.context_subject(p_tenant, p_domain, 'scenario', v_old_scn), 'from_id', v_old_scn,
                                                 'to', executive.context_subject(p_tenant, p_domain, 'scenario', p_scenario), 'to_id', p_scenario);
  END IF;
  IF v_old_cls IS DISTINCT FROM p_classification THEN v_changed := v_changed || jsonb_build_object('dimension', 'classification', 'from', v_old_cls, 'to', p_classification); END IF;
  IF v_old_eff IS DISTINCT FROM p_effective_at THEN v_changed := v_changed || jsonb_build_object('dimension', 'effective_at', 'from', v_old_eff, 'to', p_effective_at); END IF;

  -- THE STALE CHOICES (what the commit would refuse, in the port's words)
  v_reason := executive.context_stale_reason(p_tenant, p_domain, 'objective', p_objective);
  IF v_reason IS NOT NULL THEN v_stale := v_stale || jsonb_build_object('dimension', 'objective', 'id', p_objective, 'reason', v_reason); END IF;
  v_reason := executive.context_stale_reason(p_tenant, p_domain, 'scenario', p_scenario);
  IF v_reason IS NOT NULL THEN v_stale := v_stale || jsonb_build_object('dimension', 'scenario', 'id', p_scenario, 'reason', v_reason); END IF;

  -- THE AFFECTED OPEN WORK — each list complete in its count and its ids (the digest), its items bounded for the page
  /* the drafts (§CL-F's ports ledger each draft in shell.events, subject_kind 'draft'): open unless its latest event discarded, expired or
     submitted it, or its declared expiry has passed. A switch never discards a draft: each is KEPT (the person may discard it explicitly). */
  WITH latest AS (
    SELECT DISTINCT ON (e.subject_id) e.subject_id, e.version, e.event, e.details, e.occurred_at
      FROM shell.events e WHERE e.principal_id = p_principal AND e.tenant_id = p_tenant AND e.domain_id = p_domain AND e.subject_kind = 'draft'
     ORDER BY e.subject_id, e.occurred_at DESC, e.event_id DESC),
  opened AS (
    SELECT * FROM latest l WHERE l.event !~ '\.(discarded|expired|submitted)$'
       AND NOT (coalesce(l.details ->> 'expires_at', '') ~ '^\d{4}-\d{2}-\d{2}' AND (l.details ->> 'expires_at')::timestamptz <= v_now))
  SELECT jsonb_build_object('count', count(*), 'ids', coalesce(jsonb_agg(o.subject_id ORDER BY o.subject_id), '[]'::jsonb),
           'items', coalesce((SELECT jsonb_agg(jsonb_build_object('draft_id', q.subject_id, 'form_key', q.details ->> 'form_key', 'title', q.details ->> 'title', 'version', q.version,
                                                                   'saved_at', q.occurred_at, 'expires_at', q.details ->> 'expires_at', 'disposition', 'kept') ORDER BY q.occurred_at DESC)
                                FROM (SELECT * FROM opened ORDER BY occurred_at DESC LIMIT v_limit) q), '[]'::jsonb))
    INTO v_drafts FROM opened o;

  SELECT jsonb_build_object('count', count(*), 'ids', coalesce(jsonb_agg(t.task_id ORDER BY t.task_id), '[]'::jsonb),
           'items', coalesce((SELECT jsonb_agg(jsonb_build_object('task_id', q.task_id, 'kind', q.kind, 'title', q.title, 'state', q.state, 'deadline_at', q.deadline_at,
                                                                   'subject', q.subject, 'linked_to_old', (q.subject ->> 'id') IN (coalesce(v_old_obj::text, '-'), coalesce(v_old_scn::text, '-')),
                                                                   'linked_to_new', (q.subject ->> 'id') IN (coalesce(p_objective::text, '-'), coalesce(p_scenario::text, '-')),
                                                                   'disposition', 'kept') ORDER BY q.opened_at)
                                FROM (SELECT * FROM executive.human_tasks k WHERE k.tenant_id = p_tenant AND k.domain_id = p_domain AND k.assignee_principal_id = p_principal
                                         AND k.state IN ('open', 'escalated') ORDER BY k.opened_at LIMIT v_limit) q), '[]'::jsonb))
    INTO v_tasks FROM executive.human_tasks t
   WHERE t.tenant_id = p_tenant AND t.domain_id = p_domain AND t.assignee_principal_id = p_principal AND t.state IN ('open', 'escalated');

  SELECT jsonb_build_object('count', count(*), 'ids', coalesce(jsonb_agg(x.request_id ORDER BY x.request_id), '[]'::jsonb),
           'items', coalesce((SELECT jsonb_agg(jsonb_build_object('request_id', q.request_id, 'kind', q.kind, 'state', q.state, 'routed_to', q.routed_to, 'due_at', q.due_at,
                                                                   'subject', q.subject, 'linked_to_old', (q.subject ->> 'id') IN (coalesce(v_old_obj::text, '-'), coalesce(v_old_scn::text, '-')),
                                                                   'linked_to_new', (q.subject ->> 'id') IN (coalesce(p_objective::text, '-'), coalesce(p_scenario::text, '-')),
                                                                   'disposition', 'kept') ORDER BY q.requested_at)
                                FROM (SELECT * FROM executive.requests k WHERE k.tenant_id = p_tenant AND k.domain_id = p_domain AND k.requester_principal_id = p_principal
                                         AND k.state = 'routed' ORDER BY k.requested_at LIMIT v_limit) q), '[]'::jsonb))
    INTO v_requests FROM executive.requests x
   WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.requester_principal_id = p_principal AND x.state = 'routed';

  SELECT jsonb_build_object('count', count(*), 'ids', coalesce(jsonb_agg(w.workspace_id ORDER BY w.workspace_id), '[]'::jsonb),
           'items', coalesce((SELECT jsonb_agg(jsonb_build_object('workspace_id', q.workspace_id, 'title', q.title, 'purpose', q.purpose, 'classification_ceiling', q.classification_ceiling,
                                                                   'subject', q.subject, 'linked_to_old', (q.subject ->> 'id') IN (coalesce(v_old_obj::text, '-'), coalesce(v_old_scn::text, '-')),
                                                                   'linked_to_new', (q.subject ->> 'id') IN (coalesce(p_objective::text, '-'), coalesce(p_scenario::text, '-')),
                                                                   'disposition', 'kept') ORDER BY q.opened_at)
                                FROM (SELECT * FROM executive.collab_workspaces k WHERE k.tenant_id = p_tenant AND k.domain_id = p_domain AND k.state = 'open'
                                         AND (k.owner_principal_id = p_principal OR EXISTS (SELECT 1 FROM executive.collab_participants cp WHERE cp.workspace_id = k.workspace_id
                                                                                               AND cp.principal_id = p_principal AND cp.removed_at IS NULL))
                                       ORDER BY k.opened_at LIMIT v_limit) q), '[]'::jsonb))
    INTO v_workspaces FROM executive.collab_workspaces w
   WHERE w.tenant_id = p_tenant AND w.domain_id = p_domain AND w.state = 'open'
     AND (w.owner_principal_id = p_principal OR EXISTS (SELECT 1 FROM executive.collab_participants cp WHERE cp.workspace_id = w.workspace_id AND cp.principal_id = p_principal AND cp.removed_at IS NULL));

  SELECT jsonb_build_object('count', count(*), 'ids', coalesce(jsonb_agg(m.room_id ORDER BY m.room_id), '[]'::jsonb),
           'items', coalesce((SELECT jsonb_agg(jsonb_build_object('room_id', q.room_id, 'title', q.title, 'package_id', q.package_id, 'member_role', q.role, 'disposition', 'kept') ORDER BY q.opened_at)
                                FROM (SELECT rc.room_id, rc.title, rc.package_id, rc.opened_at, mm.role FROM executive.rooms_current rc JOIN executive.room_members mm ON mm.room_id = rc.room_id
                                       WHERE rc.tenant_id = p_tenant AND rc.domain_id = p_domain AND mm.principal_id = p_principal AND mm.removed_at IS NULL
                                       ORDER BY rc.opened_at LIMIT v_limit) q), '[]'::jsonb))
    INTO v_rooms FROM executive.room_members m
   WHERE m.tenant_id = p_tenant AND m.domain_id = p_domain AND m.principal_id = p_principal AND m.removed_at IS NULL;

  /* THE APPROVALS — UNAFFECTED: each binds the version digest its approver read (0042); a context switch changes no version, no eligibility,
     no evidence and no policy scope, so no approval is invalidated by it. What the switch DOES invalidate is client-held: a preview or a pending
     command the page bound to the old context digest (the page's registry lists them beside this read). */
  SELECT jsonb_build_object('count', count(*), 'ids', coalesce(jsonb_agg(a.approval_id ORDER BY a.approval_id), '[]'::jsonb),
           'items', coalesce((SELECT jsonb_agg(jsonb_build_object('approval_id', q.approval_id, 'package_id', q.package_id, 'version', q.version, 'decision', q.decision,
                                                                   'version_digest', q.version_digest, 'expires_at', q.expires_at, 'effect', 'unaffected',
                                                                   'why', 'an approval binds the version digest it read; a context switch changes no version, eligibility, evidence or policy scope') ORDER BY q.recorded_at)
                                FROM (SELECT * FROM decision.approvals k WHERE k.tenant_id = p_tenant AND k.domain_id = p_domain AND k.approver_principal_id = p_principal
                                         AND k.revoked_at IS NULL AND k.expires_at > v_now ORDER BY k.recorded_at LIMIT v_limit) q), '[]'::jsonb))
    INTO v_approvals FROM decision.approvals a
   WHERE a.tenant_id = p_tenant AND a.domain_id = p_domain AND a.approver_principal_id = p_principal AND a.revoked_at IS NULL AND a.expires_at > v_now;

  v_ids := jsonb_build_object('basis', c.context_id, 'proposed', v_new_digest, 'drafts', v_drafts -> 'ids', 'tasks', v_tasks -> 'ids', 'requests', v_requests -> 'ids',
                              'workspaces', v_workspaces -> 'ids', 'rooms', v_rooms -> 'ids', 'approvals', v_approvals -> 'ids');
  RETURN jsonb_build_object(
    'as_of', v_now, 'tenant_id', p_tenant, 'domain_id', p_domain, 'principal_id', p_principal,
    'basis', CASE WHEN c.context_id IS NULL THEN NULL ELSE jsonb_build_object('context_id', c.context_id, 'digest', c.digest, 'set_at', c.set_at) END,
    'current', jsonb_build_object('objective_id', v_old_obj, 'horizon', v_old_h, 'scenario_id', v_old_scn, 'classification', v_old_cls, 'effective_at', v_old_eff, 'digest', v_old_digest, 'set', c.context_id IS NOT NULL),
    'proposed', jsonb_build_object('objective', executive.context_subject(p_tenant, p_domain, 'objective', p_objective), 'objective_id', p_objective, 'horizon', p_horizon,
                                   'scenario', executive.context_subject(p_tenant, p_domain, 'scenario', p_scenario), 'scenario_id', p_scenario,
                                   'classification', p_classification, 'effective_at', p_effective_at, 'digest', v_new_digest),
    'changed', v_changed, 'unchanged', jsonb_array_length(v_changed) = 0, 'stale', v_stale, 'committable', jsonb_array_length(v_stale) = 0 AND jsonb_array_length(v_changed) > 0,
    'affected', jsonb_build_object('drafts', v_drafts - 'ids', 'tasks', v_tasks - 'ids', 'requests', v_requests - 'ids', 'workspaces', v_workspaces - 'ids', 'rooms', v_rooms - 'ids',
                                   'home', jsonb_build_object('sections', jsonb_build_array('priorities', 'intelligence', 'warnings', 'decisions', 'commitments', 'outcomes', 'cadence', 'attention queue'),
                                                              'effect', 'recomposed under the new context')),
    'approvals', (v_approvals - 'ids') || jsonb_build_object('effect', 'unaffected'),
    'previews', jsonb_build_object('held_by', 'client', 'effect', 'invalidated where bound to the old context digest',
                                   'note', 'previews and pending commands are held by the page; its registry lists and invalidates those bound to the old context digest — the server holds none'),
    'limit', v_limit,
    'impact_digest', encode(public.digest(v_ids::text, 'sha256'), 'hex'));
END $$;
COMMENT ON FUNCTION executive.context_impact(uuid, uuid, uuid, uuid, text, uuid, text, timestamptz) IS 'B80 §CB (0118; PAT-02, UX-10-003/-004): the impact preview of a proposed context switch — the changed dimensions, the stale choices, the affected open work (kept, never re-scoped), the approvals (unaffected: they bind version digests), the client-held previews (invalidated by the page), and the impact digest the commit presents';
REVOKE ALL ON FUNCTION executive.context_impact(uuid, uuid, uuid, uuid, text, uuid, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.context_impact(uuid, uuid, uuid, uuid, text, uuid, text, timestamptz) TO eye_app, eye_commit;

-- §CB.5 THE DELIBERATE COMMIT ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION executive.commit_context(
  p_context_id uuid, p_tenant uuid, p_domain uuid, p_objective uuid, p_horizon text, p_scenario uuid, p_classification text, p_effective_at timestamptz,
  p_basis_context uuid, p_impact_digest text, p_invalidated jsonb, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, pg_catalog, pg_temp AS $$
DECLARE v_current uuid; v_imp jsonb; v_set jsonb; v_reason text; v_event uuid; v_invalidated jsonb := coalesce(p_invalidated, '[]'::jsonb);
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.context.set']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'context rejected (actor): set by the acting principal' USING ERRCODE = '42501'; END IF;
  -- THE HUMAN AND THE ROLE, re-checked in the port (the PDP's human gate and its role list are the first line, not the only one)
  IF NOT EXISTS (SELECT 1 FROM identity.principals p WHERE p.id = p_actor AND p.kind = 'human' AND p.status = 'active') THEN
    RAISE EXCEPTION 'context rejected (actor): a context is set by a named human — an agent or a workload never sets one' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM identity.role_bindings b WHERE b.principal_id = p_actor AND b.revoked_at IS NULL
                    AND ((b.scope = 'DOMAIN' AND b.tenant_id = p_tenant AND b.domain_id = p_domain AND b.role_code = ANY (executive.context_setter_roles()))
                         OR (b.scope = 'PLATFORM' AND b.role_code = 'platform_admin'))) THEN
    RAISE EXCEPTION 'context rejected (actor): the acting principal holds no human domain role in this domain' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(v_invalidated) <> 'array' OR jsonb_array_length(v_invalidated) > 200
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_invalidated) e WHERE jsonb_typeof(e) <> 'string' OR length(e #>> '{}') NOT BETWEEN 1 AND 200) THEN
    RAISE EXCEPTION 'context rejected (previews): the invalidated previews are a list of at most 200 keys of 1–200 characters' USING ERRCODE = '22023';
  END IF;
  IF p_impact_digest IS NULL OR p_impact_digest !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'context rejected (preview): a context is committed only from its impact preview — the impact digest is required' USING ERRCODE = '22023';
  END IF;
  -- THE STALENESS, in the port (a closed objective or a closed scenario as well as an unknown one)
  v_reason := coalesce(executive.context_stale_reason(p_tenant, p_domain, 'objective', p_objective), executive.context_stale_reason(p_tenant, p_domain, 'scenario', p_scenario));
  IF v_reason IS NOT NULL THEN RAISE EXCEPTION '%', v_reason USING ERRCODE = '22023'; END IF;
  -- THE BASIS: the context the preview was computed from is still the current one (no switch over another's)
  SELECT context_id INTO v_current FROM executive.contexts x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.principal_id = p_actor AND x.superseded_at IS NULL FOR UPDATE;
  IF v_current IS DISTINCT FROM p_basis_context THEN
    RAISE EXCEPTION 'context rejected (stale): the context changed since the preview (previewed over %, current %); preview the switch again',
      coalesce(p_basis_context::text, 'none'), coalesce(v_current::text, 'none') USING ERRCODE = '22023';
  END IF;
  -- THE IMPACT: the affected work has not changed since the preview (never a switch the person did not see)
  v_imp := executive.context_impact(p_tenant, p_domain, p_actor, p_objective, p_horizon, p_scenario, p_classification, p_effective_at);
  IF (v_imp ->> 'impact_digest') IS DISTINCT FROM p_impact_digest THEN
    RAISE EXCEPTION 'context rejected (stale): the affected work changed since the preview (previewed %, now %); preview the switch again',
      left(p_impact_digest, 12), left(v_imp ->> 'impact_digest', 12) USING ERRCODE = '22023';
  END IF;
  IF (v_imp ->> 'unchanged')::boolean THEN
    RAISE EXCEPTION 'context rejected (unchanged): the proposed context is the current one; nothing to switch' USING ERRCODE = '22023';
  END IF;
  v_set := executive.set_context(p_context_id, p_tenant, p_domain, p_objective, p_horizon, p_scenario, p_classification, p_effective_at, p_actor, p_correlation);
  v_event := shell.ledger(p_tenant, p_domain, p_actor, 'context', p_context_id, (SELECT count(*)::int FROM executive.contexts x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.principal_id = p_actor),
    'shell.context.committed', jsonb_build_object(
      'supersedes', v_set -> 'supersedes', 'from_digest', v_imp #> '{current,digest}', 'to_digest', v_set -> 'digest',
      'changed', (SELECT coalesce(jsonb_agg(ch ->> 'dimension'), '[]'::jsonb) FROM jsonb_array_elements(v_imp -> 'changed') ch),
      'impact_digest', p_impact_digest,
      'kept', jsonb_build_object('drafts', v_imp #> '{affected,drafts,count}', 'tasks', v_imp #> '{affected,tasks,count}', 'requests', v_imp #> '{affected,requests,count}',
                                 'workspaces', v_imp #> '{affected,workspaces,count}', 'rooms', v_imp #> '{affected,rooms,count}'),
      'approvals_unaffected', v_imp #> '{approvals,count}',
      'invalidated_previews', v_invalidated, 'invalidated_by', 'client'), p_correlation);
  RETURN v_set || jsonb_build_object('impact_digest', p_impact_digest, 'changed', v_imp -> 'changed', 'approvals_unaffected', v_imp #> '{approvals,count}',
                                     'invalidated_previews', v_invalidated, 'ledger_event', v_event,
                                     'version', (SELECT count(*)::int FROM executive.contexts x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.principal_id = p_actor));
END $$ LANGUAGE plpgsql;
COMMENT ON FUNCTION executive.commit_context(uuid, uuid, uuid, uuid, text, uuid, text, timestamptz, uuid, text, jsonb, uuid, uuid) IS 'B80 §CB (0118; PAT-02): the deliberate commit of a previewed context switch — the human, the role, the staleness, the basis and the impact digest re-checked, then 0094''s set_context and the shell ledger row shell.context.committed';
REVOKE ALL ON FUNCTION executive.commit_context(uuid, uuid, uuid, uuid, text, uuid, text, timestamptz, uuid, text, jsonb, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.commit_context(uuid, uuid, uuid, uuid, text, uuid, text, timestamptz, uuid, text, jsonb, uuid, uuid) TO eye_commit;
