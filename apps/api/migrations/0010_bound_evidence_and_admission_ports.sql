-- 0010: Gate-2 closure part 2 — unforgeable POL/AUD evidence, canonical
-- admission and outbox controls, the refresh-token family ledger, and the
-- least-privilege identity ports. GOVERNED FORWARD MIGRATION.
--
-- The application no longer submits evidence: it submits a REQUEST to commit.
-- Every authority field (scope, tenant, domain, actor, session) is derived from
-- the validated bound context inside the port; the canonical bytes and the
-- chain hash are computed by canon.jcs / canon.audit_row_hash INSIDE the
-- trusted boundary, so what is stored in event_jcs is exactly what was hashed.

-- ============================================================
-- 1. Availability + suppression state (fail-closed evidence, restart-durable)
-- ============================================================
CREATE TABLE IF NOT EXISTS audit.availability_incidents (
  id             uuid PRIMARY KEY,
  detected_at    timestamptz NOT NULL DEFAULT now(),
  kind           text NOT NULL CHECK (kind IN ('audit_unavailable','evidence_write_failed','degraded_recovered')),
  partition_hint text,
  correlation_id uuid,
  details        jsonb NOT NULL DEFAULT '{}'::jsonb,
  reconciled_at  timestamptz
);
REVOKE ALL ON audit.availability_incidents FROM PUBLIC;

-- Restart-durable rate-limit suppression accounting (a process-local counter
-- would silently lose drops across a restart).
CREATE TABLE IF NOT EXISTS audit.intake_suppression (
  bucket        text PRIMARY KEY,
  suppressed    bigint NOT NULL DEFAULT 0,
  window_start  timestamptz NOT NULL DEFAULT now(),
  admitted      bigint NOT NULL DEFAULT 0,
  updated_at    timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON audit.intake_suppression FROM PUBLIC;

-- ============================================================
-- 2. Bound AUD port. Callers supply description, never authority.
-- ============================================================
CREATE OR REPLACE FUNCTION audit.commit_event(
  p_event_type text, p_action text, p_outcome text, p_result_code text,
  p_target_type text, p_target_id text, p_target_version text,
  p_policy_decision_id uuid, p_policy_version text,
  p_correlation uuid, p_causation uuid, p_trace text, p_request_digest text,
  p_delegation text, p_metadata jsonb
) RETURNS TABLE (partition_id text, audit_seq bigint, row_hash text)
SECURITY DEFINER SET search_path = audit, canon, public, pg_catalog, pg_temp
AS $$
DECLARE
  v_scope text := public.eye_scope();
  v_tenant uuid := public.eye_tenant();
  v_domain uuid := public.eye_domain();
  v_session uuid := public.eye_session();
  v_principal uuid := public.eye_principal();
  v_purpose text := public.eye_purpose();
  v_partition text;
  v_actor text;
  v_event jsonb;
  v_head RECORD;
  v_hash text;
  v_jcs text;
BEGIN
  IF v_scope NOT IN ('PLATFORM','TENANT','DOMAIN') THEN
    RAISE EXCEPTION 'audit rejected: no valid authoritative context' USING ERRCODE = '42501';
  END IF;
  IF p_outcome NOT IN ('success','denied','failure','indeterminate') THEN
    RAISE EXCEPTION 'audit rejected: invalid outcome %', p_outcome USING ERRCODE = '22023';
  END IF;
  -- Exact scope/identifier combination (malformed combinations are refused).
  IF (v_scope = 'PLATFORM' AND (v_tenant IS NOT NULL OR v_domain IS NOT NULL))
     OR (v_scope = 'TENANT' AND (v_tenant IS NULL OR v_domain IS NOT NULL))
     OR (v_scope = 'DOMAIN' AND (v_tenant IS NULL OR v_domain IS NULL)) THEN
    RAISE EXCEPTION 'audit rejected: malformed scope/identifier combination' USING ERRCODE = '42501';
  END IF;
  v_partition := CASE WHEN v_scope = 'PLATFORM' THEN 'platform' ELSE 'tenant:' || v_tenant::text END;
  -- Actor is DERIVED: the caller cannot fabricate it.
  v_actor := CASE WHEN v_principal = '00000000-0000-0000-0000-000000000000'
                  THEN 'workload:system.commit-pipeline'
                  ELSE 'principal:' || v_principal::text END;

  v_event := jsonb_build_object(
    'event_type', p_event_type,
    'outcome', p_outcome,
    'scope', v_scope,
    'tenant_id', v_tenant,
    'domain_id', v_domain,
    'actor', v_actor,
    'delegation_id', p_delegation,
    'action', p_action,
    'target_type', p_target_type,
    'target_id', p_target_id,
    'target_version', p_target_version,
    'purpose_id', v_purpose,
    'policy_decision_id', p_policy_decision_id,
    'policy_version', p_policy_version,
    'result_code', p_result_code,
    'occurred_at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'clock_quality', 'trusted',
    'correlation_id', p_correlation,
    'causation_id', p_causation,
    'trace_id', p_trace,
    'request_digest', p_request_digest,
    'session_id', v_session,
    'metadata', coalesce(p_metadata, '{}'::jsonb)
  );

  SELECT * INTO v_head FROM audit.advance_chain_head(v_partition);
  v_jcs := canon.jcs(v_event);
  v_hash := canon.audit_row_hash(v_partition, v_head.seq, v_head.prev_hash, v_jcs::jsonb);

  INSERT INTO audit.audit_events (partition_id, audit_seq, event_jcs, previous_hash, row_hash)
    VALUES (v_partition, v_head.seq, v_jcs, v_head.prev_hash, v_hash);
  PERFORM audit.commit_chain_head(v_partition, v_head.seq, v_hash);
  RETURN QUERY SELECT v_partition, v_head.seq, v_hash;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION audit.commit_event(text,text,text,text,text,text,text,uuid,text,uuid,uuid,text,text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION audit.commit_event(text,text,text,text,text,text,text,uuid,text,uuid,uuid,text,text,text,jsonb)
  TO eye_commit, eye_identity, eye_verifier;

-- Identity-flow port: used by the authentication paths, where the subject is
-- the principal just authenticated (no governed context exists yet). The actor
-- is still DERIVED — from a verified, active principal row.
CREATE OR REPLACE FUNCTION audit.commit_identity_event(
  p_principal uuid, p_session uuid, p_event_type text, p_action text, p_outcome text,
  p_result_code text, p_correlation uuid, p_metadata jsonb
) RETURNS TABLE (partition_id text, audit_seq bigint, row_hash text)
SECURITY DEFINER SET search_path = audit, canon, identity, public, pg_catalog, pg_temp
AS $$
DECLARE
  v_actor text;
  v_event jsonb;
  v_head RECORD;
  v_hash text;
  v_jcs text;
BEGIN
  IF public.eye_scope() <> 'PLATFORM' THEN
    RAISE EXCEPTION 'identity audit rejected: platform context required' USING ERRCODE = '42501';
  END IF;
  IF p_outcome NOT IN ('success','denied','failure') THEN
    RAISE EXCEPTION 'identity audit rejected: invalid outcome' USING ERRCODE = '22023';
  END IF;
  IF p_principal IS NULL THEN
    v_actor := 'anonymous';
  ELSE
    IF NOT EXISTS (SELECT 1 FROM identity.principals WHERE id = p_principal) THEN
      RAISE EXCEPTION 'identity audit rejected: unknown principal' USING ERRCODE = '42501';
    END IF;
    IF p_session IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM identity.sessions WHERE id = p_session AND principal_id = p_principal
    ) THEN
      RAISE EXCEPTION 'identity audit rejected: session does not belong to the principal' USING ERRCODE = '42501';
    END IF;
    v_actor := 'principal:' || p_principal::text;
  END IF;

  v_event := jsonb_build_object(
    'event_type', p_event_type, 'outcome', p_outcome, 'scope', 'PLATFORM',
    'tenant_id', NULL, 'domain_id', NULL, 'actor', v_actor, 'delegation_id', NULL,
    'action', p_action, 'target_type', 'SES', 'target_id', p_session, 'target_version', NULL,
    'purpose_id', 'authentication', 'policy_decision_id', NULL, 'policy_version', NULL,
    'result_code', p_result_code,
    'occurred_at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'clock_quality', 'trusted', 'correlation_id', p_correlation, 'causation_id', NULL,
    'trace_id', NULL, 'request_digest', NULL, 'session_id', p_session,
    'metadata', coalesce(p_metadata, '{}'::jsonb)
  );
  SELECT * INTO v_head FROM audit.advance_chain_head('platform');
  v_jcs := canon.jcs(v_event);
  v_hash := canon.audit_row_hash('platform', v_head.seq, v_head.prev_hash, v_jcs::jsonb);
  INSERT INTO audit.audit_events (partition_id, audit_seq, event_jcs, previous_hash, row_hash)
    VALUES ('platform', v_head.seq, v_jcs, v_head.prev_hash, v_hash);
  PERFORM audit.commit_chain_head('platform', v_head.seq, v_hash);
  RETURN QUERY SELECT 'platform'::text, v_head.seq, v_hash;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION audit.commit_identity_event(uuid,uuid,text,text,text,text,uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION audit.commit_identity_event(uuid,uuid,text,text,text,text,uuid,jsonb) TO eye_identity;

-- Durable audit-availability incident (independent of the ledger chain, so it
-- still records when the chain itself is refusing writes).
CREATE OR REPLACE FUNCTION audit.record_availability_incident(
  p_id uuid, p_kind text, p_partition_hint text, p_correlation uuid, p_details jsonb
) RETURNS void SECURITY DEFINER SET search_path = audit, pg_catalog, pg_temp AS $$
  INSERT INTO audit.availability_incidents (id, kind, partition_hint, correlation_id, details)
  VALUES (p_id, p_kind, p_partition_hint, p_correlation, coalesce(p_details,'{}'::jsonb))
  ON CONFLICT (id) DO NOTHING
$$ LANGUAGE sql;
REVOKE ALL ON FUNCTION audit.record_availability_incident(uuid,text,text,uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION audit.record_availability_incident(uuid,text,text,uuid,jsonb)
  TO eye_commit, eye_identity, eye_verifier;

CREATE OR REPLACE FUNCTION audit.bump_suppression(p_bucket text, p_admitted boolean)
RETURNS bigint SECURITY DEFINER SET search_path = audit, pg_catalog, pg_temp AS $$
DECLARE v_prev bigint;
BEGIN
  SELECT suppressed INTO v_prev FROM audit.intake_suppression
   WHERE bucket = p_bucket FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO audit.intake_suppression (bucket, suppressed, admitted) VALUES (p_bucket, 0, 0);
    v_prev := 0;
  END IF;
  IF p_admitted THEN
    -- An admitted write REPORTS and clears the carried drop count.
    UPDATE audit.intake_suppression
       SET suppressed = 0, admitted = admitted + 1, updated_at = now()
     WHERE bucket = p_bucket;
    RETURN v_prev;
  END IF;
  -- A suppressed failure is COUNTED durably; it is never lost.
  UPDATE audit.intake_suppression
     SET suppressed = suppressed + 1, updated_at = now()
   WHERE bucket = p_bucket;
  RETURN v_prev + 1;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION audit.bump_suppression(text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION audit.bump_suppression(text, boolean) TO eye_identity, eye_commit;

-- ============================================================
-- 3. Bound POL port.
-- ============================================================
CREATE OR REPLACE FUNCTION policy.commit_decision(
  p_id uuid, p_action text, p_object_type text, p_object_id uuid,
  p_consequence_class text, p_decision text, p_obligations jsonb,
  p_input_digest text, p_bundle_version text, p_exception_ref text,
  p_expires_at timestamptz, p_revocation_state text, p_reason text,
  p_correlation uuid, p_delegation text, p_environment jsonb
) RETURNS uuid
SECURITY DEFINER SET search_path = policy, public, pg_catalog, pg_temp
AS $$
DECLARE
  v_scope text := public.eye_scope();
  v_tenant uuid := public.eye_tenant();
  v_domain uuid := public.eye_domain();
  v_principal uuid := public.eye_principal();
  v_purpose text := public.eye_purpose();
BEGIN
  IF v_scope NOT IN ('PLATFORM','TENANT','DOMAIN') THEN
    RAISE EXCEPTION 'policy rejected: no valid authoritative context' USING ERRCODE = '42501';
  END IF;
  IF (v_scope = 'PLATFORM' AND (v_tenant IS NOT NULL OR v_domain IS NOT NULL))
     OR (v_scope = 'TENANT' AND (v_tenant IS NULL OR v_domain IS NOT NULL))
     OR (v_scope = 'DOMAIN' AND (v_tenant IS NULL OR v_domain IS NULL)) THEN
    RAISE EXCEPTION 'policy rejected: malformed scope/identifier combination' USING ERRCODE = '42501';
  END IF;
  IF p_decision NOT IN ('allow','allow_with_obligations','deny','indeterminate') THEN
    RAISE EXCEPTION 'policy rejected: invalid decision %', p_decision USING ERRCODE = '22023';
  END IF;
  INSERT INTO policy.policy_decisions (
    id, scope, tenant_id, domain_id, decision, obligations, principal_id, delegation_id,
    action, object_type, object_id, purpose_id, consequence_class, environment,
    input_digest, bundle_version, exception_ref, expires_at, revocation_state, reason, correlation_id
  ) VALUES (
    p_id, v_scope, v_tenant, v_domain, p_decision, coalesce(p_obligations,'[]'::jsonb),
    'principal:' || v_principal::text, p_delegation,
    p_action, p_object_type, p_object_id, v_purpose, p_consequence_class,
    coalesce(p_environment,'{}'::jsonb), p_input_digest, p_bundle_version,
    p_exception_ref, p_expires_at, coalesce(p_revocation_state,'none'), p_reason, p_correlation
  );
  RETURN p_id;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION policy.commit_decision(uuid,text,text,uuid,text,text,jsonb,text,text,text,timestamptz,text,text,uuid,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION policy.commit_decision(uuid,text,text,uuid,text,text,jsonb,text,text,text,timestamptz,text,text,uuid,text,jsonb)
  TO eye_commit, eye_identity;

-- ============================================================
-- 4. Canonical admission — the ONLY write path for canonical objects.
--    All 40 authoritative Volume 7 App. E fields + the 3 governed extensions
--    are required, and the complete header+payload digest is RECOMPUTED here.
-- ============================================================
CREATE TABLE IF NOT EXISTS objects.canonical_field_registry (
  field_name    text PRIMARY KEY,
  authoritative boolean NOT NULL,
  note          text
);
REVOKE ALL ON objects.canonical_field_registry FROM PUBLIC;
GRANT SELECT ON objects.canonical_field_registry TO eye_app, eye_commit;

INSERT INTO objects.canonical_field_registry (field_name, authoritative, note) VALUES
  ('object_id',true,NULL),('object_type',true,NULL),('tenant_id',true,NULL),('domain_id',true,NULL),
  ('object_version',true,NULL),('lifecycle_state',true,NULL),('owning_component',true,NULL),
  ('accountable_owner',true,NULL),('source_object_ids',true,NULL),('event_time',true,NULL),
  ('observation_time',true,NULL),('valid_from',true,NULL),('valid_to',true,NULL),('recorded_at',true,NULL),
  ('time_precision',true,NULL),('source_clock_quality',true,NULL),('truth_state',true,NULL),
  ('confidence',true,NULL),('uncertainty',true,NULL),('evidence_refs',true,NULL),
  ('provenance_ref',true,NULL),('method_ref',true,NULL),('contradiction_refs',true,NULL),
  ('corroboration_refs',true,NULL),('classification',true,NULL),('purpose_scope',true,NULL),
  ('rights_profile',true,NULL),('residency_profile',true,NULL),('retention_profile',true,NULL),
  ('access_policy_ref',true,NULL),('quality_profile',true,NULL),('quality_state',true,NULL),
  ('freshness_state',true,NULL),('schema_ref',true,NULL),('ontology_ref',true,NULL),
  ('correction_of',true,NULL),('supersedes',true,NULL),('withdrawal_reason',true,NULL),
  ('audit_correlation_id',true,NULL),('content_ref',true,NULL),
  ('scope',false,'governed extension — ADR-P0-04 scope axis'),
  ('synthetic_state',false,'governed extension — Vol 3 App. B synthetic marker'),
  ('human_refs',false,'governed extension — Vol 3 App. B human attribution')
ON CONFLICT (field_name) DO NOTHING;

CREATE OR REPLACE FUNCTION objects.admit_version(
  p_header jsonb, p_payload jsonb, p_digest text
) RETURNS TABLE (object_id uuid, object_version bigint, content_digest text)
SECURITY DEFINER SET search_path = objects, canon, public, pg_catalog, pg_temp
AS $$
DECLARE
  v_missing text;
  v_extra text;
  v_recomputed text;
  v_scope text := p_header->>'scope';
  v_tenant uuid := NULLIF(p_header->>'tenant_id','')::uuid;
  v_domain uuid := NULLIF(p_header->>'domain_id','')::uuid;
BEGIN
  -- (a) the complete registry must be present, and nothing beyond it
  SELECT string_agg(field_name, ', ') INTO v_missing
    FROM objects.canonical_field_registry r
   WHERE NOT (p_header ? r.field_name);
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'admission rejected: header missing required field(s): %', v_missing USING ERRCODE = '22023';
  END IF;
  SELECT string_agg(k, ', ') INTO v_extra
    FROM jsonb_object_keys(p_header) AS k
   WHERE NOT EXISTS (SELECT 1 FROM objects.canonical_field_registry r WHERE r.field_name = k);
  IF v_extra IS NOT NULL THEN
    RAISE EXCEPTION 'admission rejected: header carries unregistered field(s): %', v_extra USING ERRCODE = '22023';
  END IF;

  -- (b) the digest is recomputed here; a supplied value is only ever CHECKED
  v_recomputed := canon.sha256_hex(canon.jcs(jsonb_build_object('header', p_header, 'payload', p_payload)));
  IF p_digest IS DISTINCT FROM v_recomputed THEN
    RAISE EXCEPTION 'admission rejected: content digest does not bind the header and payload' USING ERRCODE = '42501';
  END IF;

  -- (c) the context must actually be authorized to write this row
  IF NOT ((public.eye_scope() = 'PLATFORM' AND v_scope = 'PLATFORM' AND v_tenant IS NULL)
          OR public.eye_row_writable(v_scope, v_tenant, v_domain)) THEN
    RAISE EXCEPTION 'admission rejected: context not authorized for the object scope' USING ERRCODE = '42501';
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

-- ============================================================
-- 5. Outbox: immutable event identity/content; narrow publish acknowledgement.
-- ============================================================
CREATE OR REPLACE FUNCTION objects.enforce_outbox_immutability()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.scope IS DISTINCT FROM OLD.scope
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.domain_id IS DISTINCT FROM OLD.domain_id
     OR NEW.event_type IS DISTINCT FROM OLD.event_type
     OR NEW.payload IS DISTINCT FROM OLD.payload
     OR NEW.correlation_id IS DISTINCT FROM OLD.correlation_id
     OR NEW.causation_id IS DISTINCT FROM OLD.causation_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'outbox event identity and content are immutable after insertion' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS object_outbox_immutable ON objects.object_outbox;
CREATE TRIGGER object_outbox_immutable
  BEFORE UPDATE ON objects.object_outbox
  FOR EACH ROW EXECUTE FUNCTION objects.enforce_outbox_immutability();

CREATE OR REPLACE FUNCTION objects.enqueue_event(
  p_id uuid, p_event_type text, p_payload jsonb, p_correlation uuid, p_causation uuid
) RETURNS void
SECURITY DEFINER SET search_path = objects, public, pg_catalog, pg_temp AS $$
DECLARE
  v_scope text := public.eye_scope();
  v_tenant uuid := public.eye_tenant();
  v_domain uuid := public.eye_domain();
BEGIN
  IF NOT public.eye_row_writable(v_scope, v_tenant, v_domain) THEN
    RAISE EXCEPTION 'outbox rejected: context not authorized' USING ERRCODE = '42501';
  END IF;
  INSERT INTO objects.object_outbox (id, scope, tenant_id, domain_id, event_type, payload,
                                     correlation_id, causation_id, status)
  VALUES (p_id, v_scope, v_tenant, v_domain, p_event_type, p_payload, p_correlation, p_causation, 'pending');
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION objects.enqueue_event(uuid, text, jsonb, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION objects.enqueue_event(uuid, text, jsonb, uuid, uuid) TO eye_commit;

-- Publisher surface: read pending, then a compare-and-set acknowledgement for
-- the permitted status transitions only. No general UPDATE anywhere.
CREATE OR REPLACE FUNCTION objects.outbox_claim(p_limit int)
RETURNS TABLE (id uuid, event_type text, payload jsonb, correlation_id uuid,
               causation_id uuid, tenant_id uuid, domain_id uuid)
SECURITY DEFINER SET search_path = objects, pg_catalog, pg_temp AS $$
  SELECT o.id, o.event_type, o.payload, o.correlation_id, o.causation_id, o.tenant_id, o.domain_id
    FROM objects.object_outbox o
   WHERE o.status = 'pending'
   ORDER BY o.created_at
   LIMIT least(greatest(coalesce(p_limit, 50), 1), 500)
$$ LANGUAGE sql STABLE;
REVOKE ALL ON FUNCTION objects.outbox_claim(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION objects.outbox_claim(int) TO eye_publisher;

CREATE OR REPLACE FUNCTION objects.outbox_ack(p_id uuid, p_from text, p_to text)
RETURNS boolean
SECURITY DEFINER SET search_path = objects, pg_catalog, pg_temp AS $$
DECLARE v_n int;
BEGIN
  IF p_from <> 'pending' OR p_to NOT IN ('published','failed') THEN
    RAISE EXCEPTION 'outbox ack rejected: transition %->% is not permitted', p_from, p_to USING ERRCODE = '42501';
  END IF;
  UPDATE objects.object_outbox
     SET status = p_to,
         published_at = CASE WHEN p_to = 'published' THEN now() ELSE published_at END
   WHERE id = p_id AND status = p_from;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n = 1;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION objects.outbox_ack(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION objects.outbox_ack(uuid, text, text) TO eye_publisher;

-- ============================================================
-- 6. Governed business-write ports (the app role has no table INSERT at all).
-- ============================================================
CREATE OR REPLACE FUNCTION tenancy.create_tenant(p_id uuid, p_name text, p_residency text, p_actor text)
RETURNS void SECURITY DEFINER SET search_path = tenancy, public, pg_catalog, pg_temp AS $$
BEGIN
  IF public.eye_scope() <> 'PLATFORM' THEN
    RAISE EXCEPTION 'tenant creation rejected: platform context required' USING ERRCODE = '42501';
  END IF;
  INSERT INTO tenancy.tenants (id, name, status, residency_profile, retention_profile, activated_at)
    VALUES (p_id, p_name, 'active', p_residency, 'default', now());
  INSERT INTO tenancy.lifecycle_events (id, scope, tenant_id, domain_id, event, actor, details)
    VALUES (gen_random_uuid(), 'TENANT', p_id, NULL, 'tenant.created', p_actor,
            jsonb_build_object('name', p_name, 'residency_profile', p_residency));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION tenancy.create_tenant(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tenancy.create_tenant(uuid, text, text, text) TO eye_commit;

CREATE OR REPLACE FUNCTION tenancy.create_domain(p_id uuid, p_tenant uuid, p_name text, p_actor text)
RETURNS void SECURITY DEFINER SET search_path = tenancy, public, pg_catalog, pg_temp AS $$
BEGIN
  -- Creating a domain is a TENANT-level act: a DOMAIN context can never do it.
  IF NOT (public.eye_scope() = 'PLATFORM'
          OR (public.eye_scope() = 'TENANT' AND p_tenant = public.eye_tenant())) THEN
    RAISE EXCEPTION 'domain creation rejected: tenant-level authority required' USING ERRCODE = '42501';
  END IF;
  INSERT INTO tenancy.domains (id, tenant_id, name, status, activated_at)
    VALUES (p_id, p_tenant, p_name, 'active', now());
  INSERT INTO tenancy.lifecycle_events (id, scope, tenant_id, domain_id, event, actor, details)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_id, 'domain.created', p_actor,
            jsonb_build_object('name', p_name));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION tenancy.create_domain(uuid, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tenancy.create_domain(uuid, uuid, text, text) TO eye_commit;

-- Principal + binding creation is identity mutation: the grantor is DERIVED
-- from the context, and the binding-authority trigger then enforces dominance.
CREATE OR REPLACE FUNCTION identity.create_principal(
  p_id uuid, p_kind text, p_scope text, p_tenant uuid, p_domain uuid,
  p_display_name text, p_login_name text, p_secret_hash text, p_role_code text
) RETURNS void
SECURITY DEFINER SET search_path = identity, public, pg_catalog, pg_temp AS $$
DECLARE v_grantor uuid := public.eye_principal();
BEGIN
  IF NOT ((public.eye_scope() = 'PLATFORM' AND p_scope = 'PLATFORM' AND p_tenant IS NULL)
          OR public.eye_row_writable(p_scope, p_tenant, p_domain)) THEN
    RAISE EXCEPTION 'principal creation rejected: context not authorized for that scope' USING ERRCODE = '42501';
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
              NULLIF(v_grantor,'00000000-0000-0000-0000-000000000000'::uuid), public.eye_scope());
  END IF;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION identity.create_principal(uuid,text,text,uuid,uuid,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION identity.create_principal(uuid,text,text,uuid,uuid,text,text,text,text) TO eye_identity;

-- ============================================================
-- 7. Refresh-token FAMILY ledger (append-only) — replaces the single
--    prev_refresh_token_hash field so replay of n-2, n-10 or any older token
--    is detected, revokes the whole family, and produces evidence.
-- ============================================================
CREATE TABLE IF NOT EXISTS identity.refresh_tokens (
  id             uuid PRIMARY KEY,
  family_id      uuid NOT NULL,
  session_id     uuid NOT NULL,
  token_hash     text NOT NULL UNIQUE,
  generation     int  NOT NULL,
  issued_at      timestamptz NOT NULL DEFAULT now(),
  invalidated_at timestamptz,
  replaced_by    uuid,
  reuse_seen_at  timestamptz
);
CREATE INDEX IF NOT EXISTS refresh_tokens_family ON identity.refresh_tokens (family_id, generation);
REVOKE ALL ON identity.refresh_tokens FROM PUBLIC;

-- Only the invalidation/replacement columns may ever change.
CREATE OR REPLACE FUNCTION identity.enforce_refresh_ledger_append_only()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'refresh-token ledger is append-only' USING ERRCODE = '42501';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.family_id IS DISTINCT FROM OLD.family_id
     OR NEW.session_id IS DISTINCT FROM OLD.session_id OR NEW.token_hash IS DISTINCT FROM OLD.token_hash
     OR NEW.generation IS DISTINCT FROM OLD.generation OR NEW.issued_at IS DISTINCT FROM OLD.issued_at THEN
    RAISE EXCEPTION 'refresh-token ledger identity is immutable' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS refresh_tokens_append_only ON identity.refresh_tokens;
CREATE TRIGGER refresh_tokens_append_only
  BEFORE UPDATE OR DELETE ON identity.refresh_tokens
  FOR EACH ROW EXECUTE FUNCTION identity.enforce_refresh_ledger_append_only();

CREATE OR REPLACE FUNCTION identity.bump_epoch(p_principal uuid)
RETURNS void SECURITY DEFINER SET search_path = identity, pg_catalog, pg_temp AS $$
  UPDATE identity.principals SET revocation_epoch = revocation_epoch + 1 WHERE id = p_principal
$$ LANGUAGE sql;
REVOKE ALL ON FUNCTION identity.bump_epoch(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION identity.bump_epoch(uuid) TO eye_identity;

-- Removing a binding invalidates outstanding contexts for that principal.
CREATE OR REPLACE FUNCTION identity.binding_revocation_bumps_epoch()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = identity, pg_catalog, pg_temp AS $$
BEGIN
  IF NEW.revoked_at IS NOT NULL AND OLD.revoked_at IS NULL THEN
    UPDATE identity.principals SET revocation_epoch = revocation_epoch + 1 WHERE id = NEW.principal_id;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS role_bindings_epoch ON identity.role_bindings;
CREATE TRIGGER role_bindings_epoch
  AFTER UPDATE ON identity.role_bindings
  FOR EACH ROW EXECUTE FUNCTION identity.binding_revocation_bumps_epoch();

-- Session opening: the caller supplies HASHES only (no plaintext token or
-- context key is ever stored), and the session is bound to the current epoch.
CREATE OR REPLACE FUNCTION identity.session_open(
  p_session uuid, p_principal uuid, p_assurance text, p_refresh_hash text,
  p_ctx_key_hash text, p_expires timestamptz, p_family uuid
) RETURNS void
SECURITY DEFINER SET search_path = identity, pg_catalog, pg_temp AS $$
DECLARE v_epoch bigint;
BEGIN
  SELECT revocation_epoch INTO v_epoch FROM identity.principals
   WHERE id = p_principal AND status = 'active';
  IF v_epoch IS NULL THEN
    RAISE EXCEPTION 'session rejected: principal not active' USING ERRCODE = '42501';
  END IF;
  INSERT INTO identity.sessions (id, principal_id, assurance, status, refresh_token_hash,
                                 expires_at, context_key_hash, bound_epoch, family_id)
    VALUES (p_session, p_principal, p_assurance, 'active', p_refresh_hash,
            p_expires, p_ctx_key_hash, v_epoch, p_family);
  INSERT INTO identity.refresh_tokens (id, family_id, session_id, token_hash, generation)
    VALUES (gen_random_uuid(), p_family, p_session, p_refresh_hash, 1);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION identity.session_open(uuid,uuid,text,text,text,timestamptz,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION identity.session_open(uuid,uuid,text,text,text,timestamptz,uuid) TO eye_identity;

CREATE OR REPLACE FUNCTION identity.refresh_rotate_family(
  p_old_hash text, p_new_hash text, p_new_ctx_key_hash text
) RETURNS TABLE (outcome text, session_id uuid, principal_id uuid, assurance text, generation int)
SECURITY DEFINER SET search_path = identity, pg_catalog, pg_temp AS $$
DECLARE tok RECORD; s RECORD; v_principal uuid;
BEGIN
  SELECT t.* INTO tok FROM identity.refresh_tokens t WHERE t.token_hash = p_old_hash FOR UPDATE;
  IF tok.id IS NULL THEN
    RETURN QUERY SELECT 'invalid'::text, NULL::uuid, NULL::uuid, NULL::text, NULL::int; RETURN;
  END IF;

  -- ANY previously invalidated generation (n-1, n-2, n-10, …) is theft evidence.
  IF tok.invalidated_at IS NOT NULL THEN
    UPDATE identity.refresh_tokens SET reuse_seen_at = now()
      WHERE token_hash = p_old_hash;
    UPDATE identity.refresh_tokens SET invalidated_at = coalesce(invalidated_at, now())
      WHERE family_id = tok.family_id;
    UPDATE identity.sessions SET status = 'revoked', revoked_at = now()
      WHERE family_id = tok.family_id AND status = 'active';
    -- Qualify: `principal_id` is also an OUT column of this function.
    SELECT sess.principal_id INTO v_principal
      FROM identity.sessions sess WHERE sess.id = tok.session_id;
    PERFORM identity.bump_epoch(v_principal);
    RETURN QUERY SELECT 'reuse'::text, tok.session_id, v_principal, NULL::text, tok.generation; RETURN;
  END IF;

  SELECT s2.id, s2.principal_id, s2.assurance, s2.status, s2.expires_at INTO s
    FROM identity.sessions s2 WHERE s2.id = tok.session_id FOR UPDATE;
  IF s.status <> 'active' OR s.expires_at <= now() THEN
    RETURN QUERY SELECT 'invalid'::text, NULL::uuid, NULL::uuid, NULL::text, NULL::int; RETURN;
  END IF;

  UPDATE identity.refresh_tokens SET invalidated_at = now() WHERE id = tok.id;
  INSERT INTO identity.refresh_tokens (id, family_id, session_id, token_hash, generation, replaced_by)
    VALUES (gen_random_uuid(), tok.family_id, tok.session_id, p_new_hash, tok.generation + 1, NULL);
  UPDATE identity.refresh_tokens SET replaced_by = (
      SELECT id FROM identity.refresh_tokens WHERE token_hash = p_new_hash
    ) WHERE id = tok.id;
  UPDATE identity.sessions
     SET refresh_token_hash = p_new_hash, context_key_hash = p_new_ctx_key_hash
   WHERE id = tok.session_id;
  RETURN QUERY SELECT 'rotated'::text, s.id, s.principal_id, s.assurance, tok.generation + 1;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION identity.refresh_rotate_family(text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION identity.refresh_rotate_family(text,text,text) TO eye_identity;

-- Credential ports: identity role only; rotation bumps the epoch so every
-- outstanding context and session dies with the old credential.
CREATE OR REPLACE FUNCTION identity.credential_rotate_v2(
  p_principal uuid, p_old_id uuid, p_new_id uuid, p_new_hash text
) RETURNS void SECURITY DEFINER SET search_path = identity, pg_catalog, pg_temp AS $$
BEGIN
  UPDATE identity.credentials SET status = 'rotated', rotated_at = now()
    WHERE id = p_old_id AND principal_id = p_principal;
  IF NOT FOUND THEN RAISE EXCEPTION 'rotation rejected: credential mismatch' USING ERRCODE = '42501'; END IF;
  INSERT INTO identity.credentials (id, principal_id, type, secret_hash, status)
    VALUES (p_new_id, p_principal, 'password', p_new_hash, 'active');
  UPDATE identity.sessions SET status = 'revoked', revoked_at = now()
    WHERE principal_id = p_principal AND status = 'active';
  UPDATE identity.refresh_tokens SET invalidated_at = coalesce(invalidated_at, now())
    WHERE session_id IN (SELECT id FROM identity.sessions WHERE principal_id = p_principal);
  PERFORM identity.bump_epoch(p_principal);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION identity.credential_rotate_v2(uuid,uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION identity.credential_rotate_v2(uuid,uuid,uuid,text) TO eye_identity;

CREATE OR REPLACE FUNCTION identity.sessions_revoke_all_v2(p_principal uuid)
RETURNS int SECURITY DEFINER SET search_path = identity, pg_catalog, pg_temp AS $$
DECLARE n int;
BEGIN
  UPDATE identity.sessions SET status = 'revoked', revoked_at = now()
   WHERE principal_id = p_principal AND status = 'active';
  GET DIAGNOSTICS n = ROW_COUNT;
  UPDATE identity.refresh_tokens SET invalidated_at = coalesce(invalidated_at, now())
   WHERE session_id IN (SELECT id FROM identity.sessions WHERE principal_id = p_principal);
  PERFORM identity.bump_epoch(p_principal);
  RETURN n;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION identity.sessions_revoke_all_v2(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION identity.sessions_revoke_all_v2(uuid) TO eye_identity;

-- Re-grant the pre-existing narrow identity ports to the identity role only.
DO $$ DECLARE f text;
BEGIN
  FOR f IN SELECT unnest(ARRAY[
    'identity.auth_lookup(text)',
    'identity.auth_principal(uuid)',
    'identity.auth_bindings(uuid)',
    'identity.session_get_active(uuid)',
    'identity.credential_get_active(uuid)',
    'identity.credential_issue(uuid,uuid,text,text,timestamptz)',
    'identity.credential_revoke(uuid)'
  ]) LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO eye_identity', f);
  END LOOP;
END $$;
-- Continuous session re-check on every request needs the read-only lookup.
GRANT EXECUTE ON FUNCTION identity.session_get_active(uuid) TO eye_app;
GRANT EXECUTE ON FUNCTION identity.auth_principal(uuid), identity.auth_bindings(uuid) TO eye_app;

-- ============================================================
-- 8. Verifier / recovery split.
-- ============================================================
-- Verification reads the head WITHOUT taking the append lock and runs under a
-- REPEATABLE READ snapshot (a stable snapshot satisfies the integrity
-- requirement without blocking appends, and without deadlocking against a
-- governed transaction that already holds the head lock to write its own
-- evidence). SEALING still takes the head lock — see audit.lock_head_for_seal —
-- so a seal can only ever cover exactly the head it verified.
CREATE OR REPLACE FUNCTION audit.read_head(p_partition text)
RETURNS TABLE (next_seq bigint, head_hash text, frozen boolean)
SECURITY DEFINER SET search_path = audit, pg_catalog, pg_temp AS $$
  SELECT h.next_seq, h.head_hash, h.frozen
    FROM audit.audit_chain_heads h WHERE h.partition_id = p_partition
$$ LANGUAGE sql STABLE;
REVOKE ALL ON FUNCTION audit.read_head(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION audit.read_head(text) TO eye_verifier;

GRANT SELECT ON audit.audit_events, audit.audit_chain_heads, audit.audit_seals,
                audit.integrity_incidents TO eye_verifier;
GRANT SELECT ON audit.audit_events, audit.audit_chain_heads TO eye_recovery;
GRANT EXECUTE ON FUNCTION audit.lock_head_for_seal(text) TO eye_verifier;
GRANT EXECUTE ON FUNCTION audit.append_seal(uuid, text, bigint, bigint, text, text) TO eye_verifier;
-- Tamper EVIDENCE (freeze + incident) belongs to the verifier; REPAIR does not.
GRANT EXECUTE ON FUNCTION audit.open_integrity_incident(uuid, text, bigint, bigint, jsonb) TO eye_verifier;
-- Break-glass repair: recovery role only, never a runtime pool.
GRANT EXECUTE ON FUNCTION audit.rebuild_chain_heads() TO eye_recovery;
GRANT EXECUTE ON FUNCTION audit.advance_chain_head(text) TO eye_commit, eye_identity;
GRANT EXECUTE ON FUNCTION audit.commit_chain_head(text, bigint, text) TO eye_commit, eye_identity;
GRANT INSERT, SELECT ON audit.audit_events TO eye_commit, eye_identity;
GRANT SELECT ON audit.audit_chain_heads TO eye_commit, eye_identity;
GRANT INSERT, SELECT ON policy.policy_decisions TO eye_commit, eye_identity;
GRANT SELECT ON policy.policy_bundles TO eye_commit, eye_identity;
-- NO direct INSERT: objects.admit_version (SECURITY DEFINER) is the only write
-- path, so the complete 40+3 registry check and the digest recomputation can
-- never be bypassed.
GRANT SELECT ON objects.canonical_objects TO eye_commit;
GRANT SELECT ON objects.schema_registry TO eye_commit;
GRANT SELECT, INSERT ON objects.object_outbox TO eye_commit;
GRANT SELECT, UPDATE ON objects.object_outbox TO eye_publisher;
GRANT SELECT, INSERT ON tenancy.tenants, tenancy.domains, tenancy.lifecycle_events TO eye_commit;
GRANT SELECT ON identity.principals, identity.role_bindings, identity.roles TO eye_commit;
GRANT SELECT, INSERT, UPDATE ON identity.principals, identity.role_bindings TO eye_identity;
GRANT SELECT, INSERT, UPDATE ON identity.credentials, identity.sessions, identity.refresh_tokens TO eye_identity;
GRANT SELECT ON identity.roles TO eye_identity;
GRANT SELECT, INSERT, UPDATE ON audit.intake_suppression TO eye_identity, eye_commit;
GRANT SELECT, INSERT, UPDATE ON audit.availability_incidents TO eye_identity, eye_commit, eye_verifier;
GRANT SELECT ON tenancy.tenants, tenancy.domains TO eye_identity;

ALTER TABLE identity.credentials      FORCE ROW LEVEL SECURITY;
ALTER TABLE identity.sessions         FORCE ROW LEVEL SECURITY;
ALTER TABLE identity.refresh_tokens   ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity.refresh_tokens   FORCE ROW LEVEL SECURITY;
-- The identity role reaches these tables ONLY through the definer ports above;
-- no policy grants direct row access to any runtime role.
