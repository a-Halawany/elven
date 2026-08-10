-- 0019: Gate-2.2 C6 — make every capability binding ENFORCEABLE at the port.
--
-- GOVERNED FORWARD MIGRATION. 0001–0018 remain byte-identical.
--
-- Findings:
--   1. tenancy.create_tenant / create_domain accepted a CALLER-SUPPLIED actor
--      string and wrote it verbatim into tenancy.lifecycle_events. The governance
--      record of "who created this tenant" was therefore whatever the caller
--      claimed, not the authenticated principal.
--   2. NO business port checked eye_bound_target(): the capability names the exact
--      object it authorizes, but create_tenant/create_domain/create_principal/
--      admit_version never compared it to the object they actually wrote. A
--      capability minted for object A could create object B.
--   3. The canonical header's audit_correlation_id was accepted as supplied, so an
--      admitted object could point at a correlation other than the operation's.
--   4. Causation was carried in the request envelope and written into the audit
--      event, but nothing bound it to the operation.
--
-- Corrections: actors are derived from the bound principal; every business port
-- asserts the capability's exact target; the canonical header's audit correlation
-- must equal the operation's correlation; and causation, when bound, is verified
-- against the closing audit event by the C1 closure trigger.

-- ============================================================
-- 1. Exact-target assertion, shared by the business ports.
-- ============================================================
CREATE OR REPLACE FUNCTION ctx.assert_bound_target(p_target text)
RETURNS void SECURITY DEFINER SET search_path = ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  IF public.eye_bound_target() IS DISTINCT FROM p_target THEN
    RAISE EXCEPTION 'target binding denied: capability is bound to target %, not %',
      coalesce(nullif(public.eye_bound_target(), ''), '<none>'), p_target USING ERRCODE = '42501';
  END IF;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION ctx.assert_bound_target(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ctx.assert_bound_target(text) TO eye_commit, eye_identity;

-- The authenticated actor, derived — never accepted from the caller.
CREATE OR REPLACE FUNCTION ctx.bound_actor()
RETURNS text SECURITY DEFINER SET search_path = ctx, public, pg_catalog, pg_temp AS $$
  SELECT CASE
    WHEN public.eye_principal() IS NOT NULL THEN 'principal:' || public.eye_principal()::text
    WHEN public.eye_ctx_mode() = 'bootstrap' THEN 'workload:system.bootstrap'
    ELSE 'workload:system.commit-pipeline'
  END
$$ LANGUAGE sql STABLE;
REVOKE ALL ON FUNCTION ctx.bound_actor() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ctx.bound_actor() TO eye_commit, eye_identity;

-- ============================================================
-- 2. Causation binding on the open operation (verified at closure).
-- ============================================================
CREATE OR REPLACE FUNCTION ctx.bind_operation_causation(p_causation uuid)
RETURNS void SECURITY DEFINER SET search_path = ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_op uuid := ctx.current_operation();
BEGIN
  IF public.eye_ctx_mode() <> 'authority' THEN
    RAISE EXCEPTION 'causation binding denied: authority mode required (context is %)',
      coalesce(public.eye_ctx_mode(),'none') USING ERRCODE = '42501';
  END IF;
  IF v_op IS NULL THEN
    RAISE EXCEPTION 'causation binding denied: no open operation' USING ERRCODE = '42501';
  END IF;
  UPDATE ctx.operation SET causation_id = p_causation
   WHERE operation_id = v_op AND NOT finalized
     AND txid = pg_current_xact_id() AND backend_pid = pg_backend_pid();
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION ctx.bind_operation_causation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ctx.bind_operation_causation(uuid) TO eye_commit, eye_identity;

-- The closure check additionally verifies CAUSATION when the operation bound one.
CREATE OR REPLACE FUNCTION ctx.assert_operation_closed()
RETURNS trigger
SECURITY DEFINER SET search_path = ctx, policy, audit, public, pg_catalog, pg_temp AS $$
DECLARE op ctx.operation%ROWTYPE; v_pol int; v_aud int;
BEGIN
  SELECT * INTO op FROM ctx.operation WHERE operation_id = NEW.operation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'operation closure: effect % references an unknown operation', NEW.effect_kind
      USING ERRCODE = '23514';
  END IF;
  IF op.finalized THEN RETURN NULL; END IF;

  SELECT count(*) INTO v_pol FROM policy.policy_decisions d
   WHERE d.id = op.decision_id
     AND d.decision IN ('allow', 'allow_with_obligations')
     AND d.evidence_only = false
     AND d.correlation_id = op.correlation_id
     AND d.action = op.action;
  IF v_pol <> 1 THEN
    RAISE EXCEPTION 'operation closure: business effect present without a matching persisted allow decision (found % for decision %)',
      v_pol, op.decision_id USING ERRCODE = '23514';
  END IF;

  IF op.obligations_required AND NOT op.obligations_executed THEN
    RAISE EXCEPTION 'operation closure: required obligations were not executed' USING ERRCODE = '23514';
  END IF;

  -- The closing audit event must match action + correlation + decision, and — when
  -- the operation bound a causation — the exact causation chain it declared.
  SELECT count(*) INTO v_aud FROM audit.audit_events a
   WHERE a.correlation_id = op.correlation_id
     AND a.action = op.action
     AND a.outcome = 'success'
     AND (a.event->>'policy_decision_id')::uuid = op.decision_id
     AND (op.causation_id IS NULL
          OR (a.event->>'causation_id') IS NOT DISTINCT FROM op.causation_id::text);
  IF v_aud <> 1 THEN
    RAISE EXCEPTION 'operation closure: business effect present without exactly one matching success audit event (found %)',
      v_aud USING ERRCODE = '23514';
  END IF;

  UPDATE ctx.operation SET finalized = true WHERE operation_id = op.operation_id;
  RETURN NULL;
END $$ LANGUAGE plpgsql;

-- ============================================================
-- 3. Business ports: derived actor + exact target binding.
-- ============================================================
-- The caller-supplied actor parameter is GONE from the signature, so a caller
-- cannot even express a false actor.
DROP FUNCTION IF EXISTS tenancy.create_tenant(uuid, text, text, text);
CREATE OR REPLACE FUNCTION tenancy.create_tenant(p_id uuid, p_name text, p_residency text)
RETURNS void SECURITY DEFINER SET search_path = tenancy, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM ctx.assert_business_authority('tenancy.tenant.create');
  PERFORM ctx.assert_bound_target(p_id::text);
  IF public.eye_scope() <> 'PLATFORM' THEN
    RAISE EXCEPTION 'tenant creation rejected: platform authority required' USING ERRCODE = '42501';
  END IF;
  INSERT INTO tenancy.tenants (id, name, status, residency_profile, retention_profile, activated_at)
    VALUES (p_id, p_name, 'active', p_residency, 'default', clock_timestamp());
  INSERT INTO tenancy.lifecycle_events (id, scope, tenant_id, domain_id, event, actor, details)
    VALUES (gen_random_uuid(), 'TENANT', p_id, NULL, 'tenant.created', ctx.bound_actor(),
            jsonb_build_object('name', p_name, 'residency_profile', p_residency));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION tenancy.create_tenant(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tenancy.create_tenant(uuid, text, text) TO eye_commit;

DROP FUNCTION IF EXISTS tenancy.create_domain(uuid, uuid, text, text);
CREATE OR REPLACE FUNCTION tenancy.create_domain(p_id uuid, p_tenant uuid, p_name text)
RETURNS void SECURITY DEFINER SET search_path = tenancy, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM ctx.assert_business_authority('tenancy.domain.create');
  PERFORM ctx.assert_bound_target(p_id::text);
  IF NOT (public.eye_scope() = 'PLATFORM'
          OR (public.eye_scope() = 'TENANT' AND p_tenant = public.eye_tenant())) THEN
    RAISE EXCEPTION 'domain creation rejected: tenant-level authority required' USING ERRCODE = '42501';
  END IF;
  INSERT INTO tenancy.domains (id, tenant_id, name, status, activated_at)
    VALUES (p_id, p_tenant, p_name, 'active', clock_timestamp());
  INSERT INTO tenancy.lifecycle_events (id, scope, tenant_id, domain_id, event, actor, details)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_id, 'domain.created', ctx.bound_actor(),
            jsonb_build_object('name', p_name));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION tenancy.create_domain(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tenancy.create_domain(uuid, uuid, text) TO eye_commit;

-- Principal creation: exact target binding in authority mode (bootstrap has no
-- pre-issued target, so it is exempt — its capability is single-use and claim-bound).
CREATE OR REPLACE FUNCTION identity.create_principal(
  p_id uuid, p_kind text, p_scope text, p_tenant uuid, p_domain uuid,
  p_display_name text, p_login_name text, p_secret_hash text, p_role_code text
) RETURNS void
SECURITY DEFINER SET search_path = identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_grantor uuid := public.eye_principal();
BEGIN
  IF public.eye_ctx_mode() = 'bootstrap' THEN
    PERFORM ctx.assert_capability('bootstrap', 'bootstrap', 'identity.bootstrap.platform_admin');
    v_grantor := NULL;
  ELSE
    PERFORM ctx.assert_business_authority('identity.principal.create');
    PERFORM ctx.assert_bound_target(p_id::text);
    IF NOT ((public.eye_scope() = 'PLATFORM' AND p_scope = 'PLATFORM' AND p_tenant IS NULL)
            OR public.eye_row_writable(p_scope, p_tenant, p_domain)) THEN
      RAISE EXCEPTION 'principal creation rejected: context not authorized for that scope'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  IF p_secret_hash IS NOT NULL AND p_kind <> 'human' THEN
    RAISE EXCEPTION 'password credentials are restricted to human principals' USING ERRCODE = '42501';
  END IF;
  IF p_secret_hash IS NOT NULL AND (p_login_name IS NULL OR length(p_login_name) < 3) THEN
    RAISE EXCEPTION 'a unique login_name is required for password principals' USING ERRCODE = '22023';
  END IF;
  INSERT INTO identity.principals (id, kind, scope, tenant_id, domain_id, display_name, login_name, status)
    VALUES (p_id, p_kind, p_scope, p_tenant, p_domain, p_display_name,
            CASE WHEN p_kind = 'human' THEN p_login_name ELSE NULL END, 'active');
  IF p_secret_hash IS NOT NULL THEN
    INSERT INTO identity.credentials (id, principal_id, type, secret_hash, status)
      VALUES (gen_random_uuid(), p_id, 'password', p_secret_hash, 'active');
  END IF;
  IF p_role_code IS NOT NULL THEN
    INSERT INTO identity.role_bindings (id, principal_id, role_code, scope, tenant_id, domain_id,
                                        granted_by_principal, granted_by_scope)
      VALUES (gen_random_uuid(), p_id, p_role_code, p_scope, p_tenant, p_domain,
              v_grantor, public.eye_scope());
  END IF;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION identity.create_principal(uuid,text,text,uuid,uuid,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION identity.create_principal(uuid,text,text,uuid,uuid,text,text,text,text) TO eye_identity;

-- ============================================================
-- 4. Canonical admission: the header's audit correlation must be the OPERATION's
--    correlation, and the object id must be the capability's bound target.
-- ============================================================
CREATE OR REPLACE FUNCTION objects.assert_header_binding(p_header jsonb)
RETURNS void SECURITY DEFINER SET search_path = objects, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM ctx.assert_bound_target(p_header->>'object_id');
  IF (p_header->>'audit_correlation_id') IS DISTINCT FROM public.eye_correlation()::text THEN
    RAISE EXCEPTION 'admission rejected: header audit_correlation_id does not match the governed operation'
      USING ERRCODE = '42501';
  END IF;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION objects.assert_header_binding(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION objects.assert_header_binding(jsonb) TO eye_commit;

-- Governed re-emit of objects.admit_version with the C6 target/correlation binding
-- (body otherwise byte-identical to 0012).
CREATE OR REPLACE FUNCTION objects.admit_version(
  p_header jsonb, p_payload jsonb, p_digest text
) RETURNS TABLE (object_id uuid, object_version bigint, content_digest text)
SECURITY DEFINER SET search_path = objects, canon, ctx, public, pg_catalog, pg_temp
AS $$
DECLARE
  v_missing text; v_extra text; v_recomputed text;
  v_scope text := p_header->>'scope';
  v_tenant uuid := NULLIF(p_header->>'tenant_id','')::uuid;
  v_domain uuid := NULLIF(p_header->>'domain_id','')::uuid;
BEGIN
  -- Authority mode + the bound canonical action; system/evidence modes fail.
  IF public.eye_ctx_mode() <> 'authority' THEN
    RAISE EXCEPTION 'admission rejected: authority mode required (context is %)',
      public.eye_ctx_mode() USING ERRCODE = '42501';
  END IF;
  IF public.eye_bound_action() NOT IN ('objects.create','objects.correct') THEN
    RAISE EXCEPTION 'admission rejected: context is bound to action %, not a canonical write',
      coalesce(public.eye_bound_action(),'<none>') USING ERRCODE = '42501';
  END IF;
  PERFORM ctx.assert_live_authority();
  -- Gate-2.2 C6: the object written must be the capability's bound TARGET, and
  -- the header's audit correlation must be the governed operation's correlation.
  PERFORM objects.assert_header_binding(p_header);

  SELECT string_agg(field_name, ', ') INTO v_missing
    FROM objects.canonical_field_registry r WHERE NOT (p_header ? r.field_name);
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'admission rejected: header missing required field(s): %', v_missing
      USING ERRCODE = '22023';
  END IF;
  SELECT string_agg(k, ', ') INTO v_extra
    FROM jsonb_object_keys(p_header) AS k
   WHERE NOT EXISTS (SELECT 1 FROM objects.canonical_field_registry r WHERE r.field_name = k);
  IF v_extra IS NOT NULL THEN
    RAISE EXCEPTION 'admission rejected: header carries unregistered field(s): %', v_extra
      USING ERRCODE = '22023';
  END IF;

  -- Full header SEMANTICS, not merely key presence (Gate-2.1 §8).
  PERFORM objects.assert_header_semantics(p_header);

  v_recomputed := canon.sha256_hex(canon.jcs(jsonb_build_object('header', p_header, 'payload', p_payload)));
  IF p_digest IS DISTINCT FROM v_recomputed THEN
    RAISE EXCEPTION 'admission rejected: content digest does not bind the header and payload'
      USING ERRCODE = '42501';
  END IF;
  IF NOT ((public.eye_scope() = 'PLATFORM' AND v_scope = 'PLATFORM' AND v_tenant IS NULL)
          OR public.eye_row_writable(v_scope, v_tenant, v_domain)) THEN
    RAISE EXCEPTION 'admission rejected: context not authorized for the object scope'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO objects.canonical_objects (
    object_id, object_type, tenant_id, domain_id, scope, object_version, lifecycle_state,
    owning_component, accountable_owner, source_object_ids, event_time, observation_time,
    valid_from, valid_to, recorded_at, time_precision, source_clock_quality, truth_state,
    synthetic_state, confidence, uncertainty, evidence_refs, provenance_ref, method_ref,
    contradiction_refs, corroboration_refs, human_refs, classification, purpose_scope,
    rights_profile, residency_profile, retention_profile, access_policy_ref, quality_profile,
    quality_state, freshness_state, schema_ref, ontology_ref, correction_of, supersedes,
    withdrawal_reason, audit_correlation_id, content_ref, payload, content_digest
  ) VALUES (
    (p_header->>'object_id')::uuid, p_header->>'object_type', v_tenant, v_domain, v_scope,
    (p_header->>'object_version')::bigint, p_header->>'lifecycle_state',
    p_header->>'owning_component', p_header->>'accountable_owner',
    coalesce(p_header->'source_object_ids','[]'::jsonb),
    NULLIF(p_header->>'event_time','')::timestamptz, NULLIF(p_header->>'observation_time','')::timestamptz,
    NULLIF(p_header->>'valid_from','')::timestamptz, NULLIF(p_header->>'valid_to','')::timestamptz,
    (p_header->>'recorded_at')::timestamptz, p_header->>'time_precision',
    p_header->>'source_clock_quality', p_header->>'truth_state',
    (p_header->>'synthetic_state')::boolean, p_header->'confidence', p_header->'uncertainty',
    coalesce(p_header->'evidence_refs','[]'::jsonb), p_header->>'provenance_ref', p_header->>'method_ref',
    coalesce(p_header->'contradiction_refs','[]'::jsonb), coalesce(p_header->'corroboration_refs','[]'::jsonb),
    coalesce(p_header->'human_refs','[]'::jsonb), p_header->>'classification', p_header->>'purpose_scope',
    p_header->>'rights_profile', p_header->>'residency_profile', p_header->>'retention_profile',
    p_header->>'access_policy_ref', p_header->>'quality_profile', p_header->'quality_state',
    p_header->'freshness_state', p_header->>'schema_ref', p_header->>'ontology_ref',
    p_header->>'correction_of', p_header->>'supersedes', p_header->>'withdrawal_reason',
    (p_header->>'audit_correlation_id')::uuid, p_header->>'content_ref',
    p_payload, v_recomputed
  );
  RETURN QUERY SELECT (p_header->>'object_id')::uuid, (p_header->>'object_version')::bigint, v_recomputed;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION objects.admit_version(jsonb, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION objects.admit_version(jsonb, jsonb, text) TO eye_commit;
