-- 0102 — N-01 (2026-10-02): later-schema SECURITY DEFINER reads bound to the CALLER'S scope; the constraint-gate capability narrowed to
-- constraint operations; unintended PUBLIC EXECUTE revoked; the migration role's default function privileges set. Forward-only; 0001–0101
-- untouched. Every re-declared function is copied whole from its live definition (pg_get_functiondef at 0101) with its change marked.
--
-- THE FINDING (database defense in depth — not an established anonymous HTTP exploit). The migration role that owns these functions is a
-- superuser, and a SECURITY DEFINER function owned by a superuser bypasses row-level security even on FORCE RLS tables. Seven definer reads
-- take the tenant and domain (or an object id) from their arguments and never compare them with the caller's bound context, so a runtime
-- role (eye_app, eye_commit) — bound to another tenant, or to no context at all — reads across the isolation boundary:
--   observation.replay_health · graph.strategy_plan_links · executive.publication_controls · executive.publication_source ·
--   executive.publication_recipients · executive.role_holder_ids · decision.commitment_item_signal
-- plus two more of the same shape given explicit behavioural cases here: executive.health_input_owner (definer, tenant/domain arguments)
-- and executive.publication_archive_record (an INVOKER read with PUBLIC EXECUTE that reaches the definer publication_controls by object id).
-- Separately, simulation.issue_constraint_gate_capability let eye_commit mint a DOMAIN context for any caller-selected tenant and domain:
-- under it every RLS-protected table of that domain (publications, legal holds…) was readable, not only the constraint sets the gate needs.
--
-- §1 the read-scope check (observation.read_scope_ok / assert_read_scope): the caller's bound tenant, and its bound domain unless the
--    binding is TENANT-wide — the RLS isolation predicate of these schemas, stated as a check; an unbound caller is refused.
-- §2 the guarded reads, re-declared: tenant/domain functions check their ARGUMENTS against the bound scope; object-id functions look up the
--    object's ACTUAL tenant and domain and check those.
-- §3 the constraint gate narrowed: the minter issues a context of its own scope CONSTRAINT_GATE with NO tenant or domain field (every
--    tenant/domain RLS policy therefore admits nothing under it) and binds the gate's tenant and domain into the context's signed TARGET;
--    simulation.gate_tenant()/gate_domain() read them back only for that scope, mode, operation class and action. Two permissive SELECT
--    policies admit the gate on simulation.constraint_sets and simulation.constraint_set_versions, and simulation.record_plan_check checks
--    the gate's bound tenant and domain instead of the context's (which the gate no longer carries). The minter refuses an unknown or
--    inactive domain.
-- §4 grants: PUBLIC EXECUTE revoked where it was unintended — graph.strategy_plan_links and executive.publication_archive_record (both keep
--    their explicit runtime grants) and ten later-schema TRIGGER functions (firing needs no EXECUTE) — and, as a SEPARATE step, the
--    migration role's global default function privileges no longer grant EXECUTE to PUBLIC (functions created later carry explicit grants).
--    The foundation schemas (ctx, identity, public, …) are not touched by §4.

-- ─────────────────────────────────────────────────────────────────────
-- §1 THE READ-SCOPE CHECK
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION observation.read_scope_ok(p_tenant uuid, p_domain uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path = public, pg_catalog, pg_temp AS $$
  SELECT (p_tenant IS NOT NULL AND public.eye_tenant() IS NOT NULL AND p_tenant = public.eye_tenant()
          AND (public.eye_scope() = 'TENANT' OR (public.eye_scope() = 'DOMAIN' AND p_domain IS NOT NULL AND p_domain = public.eye_domain())))
      -- a session whose OWN login role bypasses RLS (the migration/operator role) reads these tables directly anyway: narrowing it here
      -- protects nothing. session_user is the authenticated login, not the definer's owner, and only a superuser can change it.
      OR coalesce((SELECT r.rolbypassrls OR r.rolsuper FROM pg_catalog.pg_roles r WHERE r.rolname = session_user), false)
$$;
REVOKE ALL ON FUNCTION observation.read_scope_ok(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.read_scope_ok(uuid, uuid) TO eye_app, eye_commit;

CREATE OR REPLACE FUNCTION observation.assert_read_scope(p_tenant uuid, p_domain uuid, p_what text) RETURNS void
LANGUAGE plpgsql STABLE SET search_path = public, observation, pg_catalog, pg_temp AS $$
BEGIN
  IF NOT observation.read_scope_ok(p_tenant, p_domain) THEN
    RAISE EXCEPTION 'read rejected (scope): % is read only within the caller''s bound tenant and domain (bound: %/%/%; asked: %/%)', p_what,
      coalesce(public.eye_scope(), 'NONE'), coalesce(public.eye_tenant()::text, '-'), coalesce(public.eye_domain()::text, '-'), coalesce(p_tenant::text, '-'), coalesce(p_domain::text, '-')
      USING ERRCODE = '42501';
  END IF;
END $$;
REVOKE ALL ON FUNCTION observation.assert_read_scope(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.assert_read_scope(uuid, uuid, text) TO eye_app, eye_commit;

-- ─────────────────────────────────────────────────────────────────────
-- §2 THE GUARDED READS (each copied whole from its live definition; the guard is the only change, marked N-01)
-- ─────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION observation.replay_health(p_tenant uuid, p_domain uuid, p_source_id uuid)
 RETURNS TABLE(evaluated_at timestamp with time zone, state text, calc_version text, universe_version text, reason text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'observation', 'public', 'pg_catalog', 'pg_temp'
AS $function$
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the replay health of a source');  -- N-01
  RETURN QUERY SELECT h.evaluated_at, h.new_state, h.calc_version, h.coverage_universe_version, h.reason
    FROM observation.source_health_events h
   WHERE h.tenant_id = p_tenant AND h.domain_id = p_domain AND h.source_id = p_source_id
   ORDER BY h.evaluated_at, h.event_id;
END $function$;

CREATE OR REPLACE FUNCTION graph.strategy_plan_links(p_tenant uuid, p_domain uuid, p_objective uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'graph', 'executive', 'pg_catalog', 'pg_temp'
AS $function$
DECLARE v jsonb;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the planning links of an objective');  -- N-01
  IF to_regclass('executive.initiatives') IS NULL THEN
    RETURN jsonb_build_object('available', false, 'reason', 'no planning objects in this deployment (executive.initiatives is not declared)', 'initiatives', '[]'::jsonb);
  END IF;
  EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.initiative_id), ''[]''::jsonb) FROM executive.initiatives i WHERE i.tenant_id = $1 AND i.domain_id = $2 AND (%s)',
                 CASE WHEN p_objective IS NULL THEN 'true' ELSE 'i.objective_id = $3' END)
     INTO v USING p_tenant, p_domain, p_objective;
  RETURN jsonb_build_object('available', true, 'initiatives', v);
END $function$;

CREATE OR REPLACE FUNCTION executive.publication_source(p_tenant uuid, p_domain uuid, p_kind text, p_id uuid, p_version integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'executive', 'objects', 'observation', 'decision', 'pg_catalog', 'pg_temp'
AS $function$
DECLARE o objects.canonical_objects%ROWTYPE; v_type text; v_digest text; v_holds jsonb; v_title text; v_evd uuid[];
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the source of a publication');  -- N-01
  IF p_kind NOT IN ('briefing', 'report') THEN RETURN jsonb_build_object('found', false, 'reason', 'the source kind is briefing or report'); END IF;
  v_type := CASE p_kind WHEN 'briefing' THEN 'BRF' ELSE 'DPK' END;
  SELECT * INTO o FROM objects.canonical_objects c WHERE c.object_id = p_id AND c.object_type = v_type AND c.object_version = p_version AND c.tenant_id = p_tenant AND c.domain_id = p_domain;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false, 'reason', CASE WHEN p_kind = 'briefing' THEN 'no briefing edition ' || p_id::text || ' is recorded in this domain'
                                                             ELSE 'no proposed version ' || p_version || ' of package ' || p_id::text || ' is recorded in this domain (a report binds a proposed, approved or committed version)' END);
  END IF;
  IF p_kind = 'briefing' THEN
    SELECT b.content_digest INTO v_digest FROM executive.briefings b WHERE b.briefing_id = p_id;
    v_title := 'Briefing ' || to_char(coalesce((SELECT b.known_at FROM executive.briefings b WHERE b.briefing_id = p_id), o.recorded_at), 'YYYY-MM-DD HH24:MI') || ' UTC';
  ELSE
    v_digest := o.content_digest;
    SELECT p.title INTO v_title FROM decision.packages_current p WHERE p.package_id = p_id;
  END IF;
  SELECT coalesce(array_agg(DISTINCT substring(r from 5 for 36)::uuid), ARRAY[]::uuid[]) INTO v_evd
    FROM (SELECT jsonb_array_elements_text(coalesce(o.evidence_refs, '[]'::jsonb)) r UNION ALL SELECT jsonb_array_elements_text(coalesce(o.source_object_ids, '[]'::jsonb))) x
   WHERE r ~ '^EVD:[0-9a-f-]{36}@';
  SELECT coalesce(jsonb_agg(jsonb_build_object('hold_id', h.hold_id, 'manifest_id', h.manifest_id, 'evd_object_id', h.evd_object_id, 'reason', h.reason, 'placed_at', h.placed_at) ORDER BY h.placed_at), '[]'::jsonb) INTO v_holds
    FROM observation.legal_holds h
   WHERE h.tenant_id = p_tenant AND h.domain_id = p_domain AND h.lifted_at IS NULL
     AND (h.evd_object_id = ANY (v_evd)
          OR h.manifest_id IN (SELECT (e.payload ->> 'manifest_id')::uuid FROM objects.canonical_objects e WHERE e.object_type = 'EVD' AND e.object_id = ANY (v_evd) AND e.payload ? 'manifest_id'));
  RETURN jsonb_build_object('found', true, 'kind', p_kind, 'id', p_id, 'version', p_version, 'object_type', v_type, 'object_version', o.object_version, 'digest', v_digest,
                            'canonical_digest', o.content_digest, 'title', coalesce(v_title, 'untitled'), 'lifecycle_state', o.lifecycle_state, 'synthetic_state', o.synthetic_state,
                            'controls', jsonb_build_object('classification', o.classification, 'rights_profile', o.rights_profile, 'residency_profile', o.residency_profile,
                                                           'retention_profile', o.retention_profile, 'access_policy_ref', o.access_policy_ref),
                            'source_object_ids', coalesce(o.source_object_ids, '[]'::jsonb), 'evidence_refs', coalesce(o.evidence_refs, '[]'::jsonb), 'holds', v_holds);
END $function$;

CREATE OR REPLACE FUNCTION executive.publication_recipients(p_tenant uuid, p_domain uuid, p_audience jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'executive', 'identity', 'pg_catalog', 'pg_temp'
AS $function$
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the recipients of a publication');  -- N-01
  RETURN (WITH named AS (
    SELECT (x.v)::uuid AS principal_id, 'named' AS via FROM jsonb_array_elements_text(coalesce(p_audience -> 'recipients', '[]'::jsonb)) AS x(v) WHERE x.v ~ '^[0-9a-f-]{36}$'
  ), by_role AS (
    SELECT DISTINCT b.principal_id, 'role:' || b.role_code AS via
      FROM identity.role_bindings b
     WHERE b.revoked_at IS NULL AND b.role_code IN (SELECT jsonb_array_elements_text(coalesce(p_audience -> 'roles', '[]'::jsonb)))
       AND b.tenant_id = p_tenant AND (b.scope = 'TENANT' OR (b.scope = 'DOMAIN' AND b.domain_id = p_domain))
  ), everyone AS (SELECT * FROM named UNION ALL SELECT * FROM by_role)
  SELECT coalesce(jsonb_agg(jsonb_build_object('principal_id', e.principal_id, 'display_name', p.display_name, 'via', e.via) ORDER BY p.display_name, e.principal_id), '[]'::jsonb)
    FROM (SELECT principal_id, min(via) AS via FROM everyone GROUP BY principal_id) e
    JOIN identity.principals p ON p.id = e.principal_id AND p.kind = 'human' AND p.status = 'active' AND (p.tenant_id = p_tenant OR p.scope = 'PLATFORM'));
END $function$;

CREATE OR REPLACE FUNCTION executive.role_holder_ids(p_tenant uuid, p_domain uuid, p_roles text[])
 RETURNS SETOF uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'identity', 'pg_catalog', 'pg_temp'
AS $function$
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the holders of a role');  -- N-01
  RETURN QUERY SELECT DISTINCT b.principal_id FROM identity.role_bindings b JOIN identity.principals p ON p.id = b.principal_id
   WHERE p.kind = 'human' AND p.status = 'active' AND b.revoked_at IS NULL AND b.role_code = ANY (p_roles)
     AND b.tenant_id = p_tenant AND (b.scope = 'TENANT' OR (b.scope = 'DOMAIN' AND b.domain_id = p_domain));
END $function$;

CREATE OR REPLACE FUNCTION decision.commitment_item_signal(p_tenant uuid, p_domain uuid, p_item uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'decision', 'pg_catalog', 'pg_temp'
AS $function$
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the signal of a commitment item');  -- N-01
  RETURN (SELECT jsonb_build_object('item_id', i.item_id, 'commitment_id', i.commitment_id, 'package_id', i.package_id, 'title', i.title, 'kind', i.kind,
                            'owner', i.owner_principal_id, 'reviewer', i.reviewer_principal_id, 'due_at', i.due_at, 'state', i.state,
                            'severity', CASE WHEN (i.due_at <= clock_timestamp() AND i.state IN ('open', 'in_progress', 'exception', 'retask_required'))
                                                  OR EXISTS (SELECT 1 FROM decision.execution_residuals r WHERE r.item_id = i.item_id AND NOT r.disposed) THEN 'C3' ELSE 'C2' END,
                            'overdue', i.due_at <= clock_timestamp() AND i.state IN ('open', 'in_progress', 'exception', 'retask_required'),
                            'open_exceptions', (SELECT count(*) FROM decision.commitment_exceptions e WHERE e.item_id = i.item_id AND e.state IN ('open', 'proposed')),
                            'residual', (SELECT jsonb_agg(jsonb_build_object('handoff_id', r.handoff_id, 'line_key', r.line_key, 'residual', r.residual_quantity) ORDER BY r.handoff_id, r.line_key)
                                           FROM decision.execution_residuals r WHERE r.item_id = i.item_id AND NOT r.disposed),
                            'objectives', to_jsonb(i.objective_ids))
    FROM decision.commitment_items i WHERE i.item_id = p_item AND i.tenant_id = p_tenant AND i.domain_id = p_domain);
END $function$;

CREATE OR REPLACE FUNCTION executive.health_input_owner(p_tenant uuid, p_domain uuid, p_kind text, p_ref uuid)
 RETURNS TABLE(owner_principal_id uuid, owner_basis text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'executive', 'graph', 'prediction', 'decision', 'pg_catalog', 'pg_temp'
AS $function$
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the owner of a health input');  -- N-01
  RETURN QUERY WITH cand AS (
    SELECT s.owner_principal_id AS o, format('the owner of %s "%s"', s.object_type, s.title) AS basis
      FROM graph.strategy_current s WHERE p_kind IN ('measure', 'capability', 'execution', 'outcome', 'quality') AND s.strategy_object_id = p_ref AND s.tenant_id = p_tenant AND s.domain_id = p_domain
    UNION ALL
    SELECT i.owner_principal_id, format('the owner of indicator %s', i.indicator_id)
      FROM prediction.indicators_current i WHERE p_kind = 'indicator' AND i.indicator_id = p_ref AND i.tenant_id = p_tenant AND i.domain_id = p_domain
    UNION ALL
    SELECT x.owner_principal_id, format('the owner of the %s exposure %s', x.polarity, x.exposure_id)
      FROM prediction.exposure_current x WHERE p_kind IN ('risk', 'opportunity') AND x.exposure_id = p_ref AND x.tenant_id = p_tenant AND x.domain_id = p_domain
  )
  SELECT CASE WHEN decision.is_active_human(c.o, p_tenant) THEN c.o END,
         CASE WHEN decision.is_active_human(c.o, p_tenant) THEN c.basis ELSE c.basis || ' — not an active human; no owner edit is admitted until one is assigned' END
    FROM cand c LIMIT 1;
END $function$;

CREATE OR REPLACE FUNCTION executive.publication_controls(p_publication uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'executive', 'pg_catalog', 'pg_temp'
AS $function$
DECLARE v_t uuid; v_d uuid;
BEGIN
  SELECT p.tenant_id, p.domain_id INTO v_t, v_d FROM executive.publications p WHERE p.publication_id = p_publication;   -- N-01: the object's ACTUAL scope
  IF NOT FOUND THEN RETURN NULL; END IF;
  PERFORM observation.assert_read_scope(v_t, v_d, 'the controls of a publication');   -- N-01
  RETURN (SELECT executive.publication_source(p.tenant_id, p.domain_id, v.source_kind, v.source_id, v.source_version) - 'source_object_ids' - 'evidence_refs'
    FROM executive.publications p JOIN executive.publication_versions v ON v.publication_id = p.publication_id AND v.version = p.current_version
   WHERE p.publication_id = p_publication);
END $function$;

CREATE OR REPLACE FUNCTION executive.publication_archive_record(p_publication uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'executive', 'observation', 'pg_catalog', 'pg_temp'
AS $function$
DECLARE v_t uuid; v_d uuid;
BEGIN
  -- N-01: an INVOKER read — the publication is looked up under the caller's own RLS; a publication outside the bound scope is not found,
  -- and its controls (a definer read) are never reached for it.
  SELECT p.tenant_id, p.domain_id INTO v_t, v_d FROM executive.publications p WHERE p.publication_id = p_publication;
  IF NOT FOUND OR NOT observation.read_scope_ok(v_t, v_d) THEN RETURN NULL; END IF;
  RETURN (SELECT jsonb_build_object(
    'publication', (SELECT to_jsonb(p) - 'scope' FROM executive.publications p WHERE p.publication_id = p_publication),
    'versions', (SELECT coalesce(jsonb_agg((to_jsonb(v) - 'scope' - 'tenant_id' - 'domain_id') || jsonb_build_object('signatures', executive.signature_of('publication', v.publication_id, v.version)) ORDER BY v.version), '[]'::jsonb)
                   FROM executive.publication_versions v WHERE v.publication_id = p_publication),
    'deliveries', (SELECT coalesce(jsonb_agg(to_jsonb(d) - 'scope' - 'tenant_id' - 'domain_id' ORDER BY d.version, d.delivered_at, d.delivery_id), '[]'::jsonb)
                     FROM executive.publication_deliveries d WHERE d.publication_id = p_publication),
    'external_drafts', (SELECT coalesce(jsonb_agg((to_jsonb(x) - 'scope' - 'tenant_id' - 'domain_id') || jsonb_build_object('signatures', executive.signature_of('publication', x.draft_id, 1)) ORDER BY x.version), '[]'::jsonb)
                          FROM executive.external_drafts x WHERE x.publication_id = p_publication),
    'events', (SELECT coalesce(jsonb_agg(to_jsonb(e) - 'scope' - 'tenant_id' - 'domain_id' ORDER BY e.occurred_at, e.event_id), '[]'::jsonb)
                 FROM executive.publication_events e WHERE e.publication_id = p_publication),
    'controls', executive.publication_controls(p_publication),
    'read_at', clock_timestamp()));
END $function$;


-- ─────────────────────────────────────────────────────────────────────
-- §3 THE CONSTRAINT GATE NARROWED
-- ─────────────────────────────────────────────────────────────────────
/* The gate's tenant and domain, read back from the signed TARGET of a CONSTRAINT_GATE context bound to the gate's mode, operation class and
   action — NULL under every other context. */
CREATE OR REPLACE FUNCTION simulation.gate_tenant() RETURNS uuid
LANGUAGE sql STABLE SET search_path = public, pg_catalog, pg_temp AS $$
  SELECT CASE WHEN public.eye_scope() = 'CONSTRAINT_GATE' AND public.eye_ctx_mode() = 'schedule' AND public.eye_op_class() = 'constraint_gate'
                   AND public.eye_bound_action() = 'simulation.constraint.gate' AND public.eye_bound_target() ~ '^[0-9a-f-]{36}:[0-9a-f-]{36}$'
              THEN split_part(public.eye_bound_target(), ':', 1)::uuid END
$$;
CREATE OR REPLACE FUNCTION simulation.gate_domain() RETURNS uuid
LANGUAGE sql STABLE SET search_path = public, pg_catalog, pg_temp AS $$
  SELECT CASE WHEN simulation.gate_tenant() IS NOT NULL THEN split_part(public.eye_bound_target(), ':', 2)::uuid END
$$;
REVOKE ALL ON FUNCTION simulation.gate_tenant() FROM PUBLIC;
REVOKE ALL ON FUNCTION simulation.gate_domain() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION simulation.gate_tenant() TO eye_app, eye_commit;
GRANT EXECUTE ON FUNCTION simulation.gate_domain() TO eye_app, eye_commit;

CREATE POLICY simulation_constraint_gate ON simulation.constraint_sets FOR SELECT
  USING (tenant_id = simulation.gate_tenant() AND domain_id = simulation.gate_domain());
CREATE POLICY simulation_constraint_gate ON simulation.constraint_set_versions FOR SELECT
  USING (tenant_id = simulation.gate_tenant() AND domain_id = simulation.gate_domain());


CREATE OR REPLACE FUNCTION simulation.issue_constraint_gate_capability(p_tenant uuid, p_domain uuid, p_reason text, p_ttl_seconds integer DEFAULT 30)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'simulation', 'ctx', 'tenancy', 'public', 'pg_catalog', 'pg_temp'
AS $function$
BEGIN
  IF p_tenant IS NULL OR p_domain IS NULL THEN RAISE EXCEPTION 'constraint gate capability requires a tenant and a domain' USING ERRCODE = '42501'; END IF;
  IF p_reason IS NULL OR length(p_reason) < 3 THEN RAISE EXCEPTION 'constraint gate capability requires a reason' USING ERRCODE = '42501'; END IF;
  IF p_ttl_seconds IS NULL OR p_ttl_seconds < 1 OR p_ttl_seconds > 60 THEN RAISE EXCEPTION 'constraint gate capability ttl out of bounds' USING ERRCODE = '42501'; END IF;
  -- N-01: the domain must exist and be active
  IF NOT EXISTS (SELECT 1 FROM tenancy.domains d WHERE d.id = p_domain AND d.tenant_id = p_tenant AND d.status = 'active') THEN
    RAISE EXCEPTION 'constraint gate capability requires an active domain of the tenant' USING ERRCODE = '42501';
  END IF;
  -- N-01: a CONSTRAINT_GATE context with NO tenant or domain field — every tenant/domain RLS policy admits nothing under it; the gate's
  -- tenant and domain ride in the signed target, read back only by simulation.gate_tenant()/gate_domain() (§3).
  PERFORM set_config('eye.ctx3', ctx.build(
    NULL, NULL, 'CONSTRAINT_GATE', NULL, NULL, 'machine', 'simulation.constraint_gate', 0,
    'schedule', 'constraint_gate', 'simulation.constraint.gate', p_tenant::text || ':' || p_domain::text,
    NULL, NULL, NULL, p_ttl_seconds), true);
  PERFORM set_config('eye.ctx_reason', p_reason, true);
END $function$;

CREATE OR REPLACE FUNCTION simulation.record_plan_check(p_check_id uuid, p_tenant uuid, p_domain uuid, p_subject_kind text, p_subject_ref text, p_subject jsonb, p_sets jsonb, p_outcome text, p_violations jsonb, p_reason text, p_budget_ms integer, p_elapsed_ms integer, p_actor uuid, p_correlation uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'simulation', 'observation', 'ctx', 'public', 'pg_catalog', 'pg_temp'
AS $function$
DECLARE v_via text; v_at timestamptz := clock_timestamp(); v_pin jsonb; v_digest text;
BEGIN
  IF public.eye_ctx_mode() = 'schedule' THEN
    PERFORM ctx.assert_capability('schedule', 'constraint_gate', 'simulation.constraint.gate');
    IF p_actor IS NOT NULL THEN RAISE EXCEPTION 'plan check rejected (actor): the gate records no principal' USING ERRCODE = '42501'; END IF;
    v_via := 'gate';
  ELSE
    PERFORM observation.assert_authority(ARRAY['simulation.plan.check']);
    IF p_actor IS NULL OR p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'plan check rejected (actor): recorded by the acting principal' USING ERRCODE = '42501'; END IF;
    IF p_subject_kind <> 'plan' THEN RAISE EXCEPTION 'plan check rejected (subject): the plan check route checks plans; a run''s inputs and outputs are checked by the gate' USING ERRCODE = '22023'; END IF;
    v_via := 'route';
  END IF;
  IF v_via = 'gate' THEN   -- N-01: the gate's context carries no tenant or domain; its signed target names them
    IF p_tenant IS NULL OR p_domain IS NULL OR p_tenant IS DISTINCT FROM simulation.gate_tenant() OR p_domain IS DISTINCT FROM simulation.gate_domain() THEN
      RAISE EXCEPTION 'plan check rejected (scope): the gate capability is bound to another tenant and domain' USING ERRCODE = '42501';
    END IF;
  ELSE
    PERFORM observation.assert_scope(p_tenant, p_domain);
  END IF;
  IF p_subject_kind IS NULL OR p_subject_kind NOT IN ('plan', 'run_input', 'run_output') THEN RAISE EXCEPTION 'plan check rejected (subject): a subject is a plan, a run''s inputs or a run''s outputs' USING ERRCODE = '22023'; END IF;
  IF p_outcome IS NULL OR p_outcome NOT IN ('satisfied', 'violated', 'indeterminate') THEN RAISE EXCEPTION 'plan check rejected (outcome): satisfied, violated or indeterminate' USING ERRCODE = '22023'; END IF;
  IF p_sets IS NULL OR jsonb_typeof(p_sets) <> 'array' THEN RAISE EXCEPTION 'plan check rejected (pins): the set versions checked against are a list' USING ERRCODE = '22023'; END IF;
  IF p_outcome = 'satisfied' AND jsonb_array_length(p_sets) = 0 AND p_subject ? 'set_keys' THEN
    RAISE EXCEPTION 'plan check rejected (pins): named sets that were not checked do not satisfy a subject' USING ERRCODE = '22023';
  END IF;
  FOR v_pin IN SELECT * FROM jsonb_array_elements(p_sets) LOOP
    SELECT v.digest INTO v_digest FROM simulation.constraint_set_versions v JOIN simulation.constraint_sets s ON s.set_id = v.set_id
     WHERE v.set_id = (v_pin ->> 'set_id')::uuid AND v.version = (v_pin ->> 'version')::int AND s.set_key = v_pin ->> 'set_key'
       AND v.tenant_id = p_tenant AND v.domain_id = p_domain;
    IF v_digest IS NULL THEN RAISE EXCEPTION 'plan check rejected (unknown_pin): set % version % is not declared in this domain', v_pin ->> 'set_key', v_pin ->> 'version' USING ERRCODE = '23503'; END IF;
    IF v_digest <> v_pin ->> 'digest' THEN RAISE EXCEPTION 'plan check rejected (stale_pin): set % version % has digest %, not %', v_pin ->> 'set_key', v_pin ->> 'version', v_digest, v_pin ->> 'digest' USING ERRCODE = '22023'; END IF;
  END LOOP;
  INSERT INTO simulation.plan_checks (check_id, scope, tenant_id, domain_id, subject_kind, subject_ref, subject, subject_digest, sets, outcome, violations, indeterminate_reason,
                                      budget_ms, elapsed_ms, checked_via, checked_by, checked_at, correlation_id)
  VALUES (p_check_id, 'DOMAIN', p_tenant, p_domain, p_subject_kind, p_subject_ref, p_subject, encode(sha256(convert_to(p_subject::text, 'UTF8')), 'hex'), p_sets, p_outcome,
          coalesce(p_violations, '[]'::jsonb), CASE WHEN p_outcome = 'indeterminate' THEN coalesce(p_reason, 'no reason given') END,
          greatest(coalesce(p_budget_ms, 0), 0), greatest(coalesce(p_elapsed_ms, 0), 0), v_via, p_actor, v_at, p_correlation);
  RETURN jsonb_build_object('check_id', p_check_id, 'subject_kind', p_subject_kind, 'subject_ref', p_subject_ref, 'outcome', p_outcome, 'sets', p_sets,
                            'violations', coalesce(p_violations, '[]'::jsonb), 'indeterminate_reason', CASE WHEN p_outcome = 'indeterminate' THEN coalesce(p_reason, 'no reason given') END,
                            'checked_via', v_via, 'checked_by', p_actor, 'checked_at', v_at);
END $function$;


-- ─────────────────────────────────────────────────────────────────────
-- §4 GRANTS
-- ─────────────────────────────────────────────────────────────────────
-- (a) unintended PUBLIC EXECUTE on existing later-schema functions (explicit runtime grants preserved: strategy_plan_links and
--     publication_archive_record keep eye_app and eye_commit)
REVOKE EXECUTE ON FUNCTION graph.strategy_plan_links(uuid, uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION executive.publication_archive_record(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION decision.seed_commitment_tracker() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION executive.briefing_dependencies() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION executive.hold_commitment_on_breach() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION graph.edge_reassessment_closed_event() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION graph.edge_reassessment_closes() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION prediction.warning_level_immutable() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION twin.agent_write_boundary() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION twin.propose_couplings() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION twin.twin_kind_in_scope() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION twin.upstream_owner_boundary() FROM PUBLIC;
-- the re-declared definer reads keep exactly their explicit grants (CREATE OR REPLACE preserves the ACL); stated for the reader:
--   eye_app and eye_commit on replay_health, strategy_plan_links, publication_controls, publication_source, publication_recipients,
--   role_holder_ids, commitment_item_signal, health_input_owner; eye_commit only on issue_constraint_gate_capability.

-- (b) the migration role's GLOBAL default function privileges: functions it creates from here on grant no EXECUTE to PUBLIC
DO $$ BEGIN
  EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC', current_user);
END $$;
