-- 0042 · Phase 6, P6-M2 — approvals, revocation and the exact C3 commitment
-- (PHASE6_BUILD_PLAN.md §3 authority contract; F2, F3).
--
-- An approval is a named human's signature on the DIGEST of a proposed version —
-- what they read, not what the package later becomes. It expires, it can be revoked
-- by its author, and it never carries forward to another version. A quorum is a
-- count of DISTINCT eligible humans with live approvals of the same digest. The
-- author, the proposer, the owner and the action owner cannot approve their own
-- version. Commitment is one exact action, decision.commit, at consequence class C3,
-- by a named human holding decision_authority who is not among the approvers; the
-- port verifies the C3 class and the bound action in the authority context itself,
-- locks the package, recounts the live quorum at that instant and writes the
-- bounded CMT into Phase 3's strategy graph — the only CMT write this schema has.
--
--   §1  approvals            table, eligibility, live quorum
--   §2  commitments          table
--   §3  ports                record_approval, revoke_approval, commit_package
--   §4  write actions        decision.approve → APR, decision.commit → CMT; APR@v1; RLS
-- ============================================================

-- ============================================================
-- 1. Approvals.
-- ============================================================
CREATE TABLE decision.approvals (
  approval_id           uuid PRIMARY KEY,
  scope                 text NOT NULL,
  tenant_id             uuid NOT NULL,
  domain_id             uuid NOT NULL,
  package_id            uuid NOT NULL,
  version               int  NOT NULL,
  approver_principal_id uuid NOT NULL,
  decision              text NOT NULL CHECK (decision IN ('approve', 'reject')),
  /* The digest the approver read. It must equal the version's own digest at recording time. */
  version_digest        text NOT NULL CHECK (version_digest ~ '^[0-9a-f]{64}$'),
  rationale             text NOT NULL CHECK (length(btrim(rationale)) BETWEEN 8 AND 4096),
  conditions            jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(conditions) = 'array'),
  /* How the policy admitted this approver: 'principal' (named) or 'role:<code>' (role at scope). */
  eligible_by           text NOT NULL,
  expires_at            timestamptz NOT NULL,
  revoked_at            timestamptz,
  revoked_reason        text,
  header_digest         text CHECK (header_digest IS NULL OR header_digest ~ '^[0-9a-f]{64}$'),
  recorded_at           timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id        uuid NOT NULL,
  CONSTRAINT dap_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT dap_version FOREIGN KEY (package_id, version) REFERENCES decision.package_versions(package_id, version),
  CONSTRAINT dap_revocation_pair CHECK ((revoked_at IS NULL) = (revoked_reason IS NULL))
);
CREATE INDEX dap_version_idx ON decision.approvals (package_id, version, approver_principal_id);
/* Append-only, with exactly one permitted change: a revocation, once. */
CREATE OR REPLACE FUNCTION decision.approvals_revocation_only() RETURNS trigger
SET search_path = decision, pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'approvals are append-only: DELETE prohibited' USING ERRCODE = '2F002'; END IF;
  IF OLD.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'approval % is already revoked and immutable', OLD.approval_id USING ERRCODE = '2F002'; END IF;
  IF NEW.approval_id <> OLD.approval_id OR NEW.package_id <> OLD.package_id OR NEW.version <> OLD.version OR NEW.approver_principal_id <> OLD.approver_principal_id
     OR NEW.decision <> OLD.decision OR NEW.version_digest <> OLD.version_digest OR NEW.rationale <> OLD.rationale OR NEW.conditions <> OLD.conditions
     OR NEW.eligible_by <> OLD.eligible_by OR NEW.expires_at <> OLD.expires_at OR NEW.header_digest IS DISTINCT FROM OLD.header_digest
     OR NEW.recorded_at <> OLD.recorded_at OR NEW.tenant_id <> OLD.tenant_id OR NEW.domain_id <> OLD.domain_id THEN
    RAISE EXCEPTION 'approval % is immutable; only a revocation may be recorded on it', OLD.approval_id USING ERRCODE = '2F002';
  END IF;
  IF NEW.revoked_at IS NULL THEN RAISE EXCEPTION 'an approval changes only by revocation' USING ERRCODE = '2F002'; END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER dap_revocation_only BEFORE UPDATE OR DELETE ON decision.approvals
  FOR EACH ROW EXECUTE FUNCTION decision.approvals_revocation_only();

/* The workflow gains one transition: a revocation that breaks quorum sends an approved version back under review. */
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
      OR (OLD.state = 'approved' AND NEW.state IN ('committed', 'rejected', 'superseded', 'under_review'))) THEN
      RAISE EXCEPTION 'version % of package %: % → % is not a workflow transition', OLD.version, OLD.package_id, OLD.state, NEW.state
        USING ERRCODE = '2F002';
    END IF;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

/* Whether (and how) a principal may approve under a policy: a named human, or a human holding a listed role at this scope. */
CREATE OR REPLACE FUNCTION decision.approver_eligibility(p_principal uuid, p_tenant uuid, p_domain uuid, p_policy jsonb) RETURNS text
STABLE SECURITY DEFINER SET search_path = decision, identity, pg_catalog, pg_temp AS $$
DECLARE r text;
BEGIN
  IF NOT decision.is_active_human(p_principal, p_tenant) THEN RETURN NULL; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements_text(coalesce(p_policy -> 'principals', '[]'::jsonb)) a WHERE a = p_principal::text) THEN RETURN 'principal'; END IF;
  SELECT b.role_code INTO r FROM identity.role_bindings b
   WHERE b.principal_id = p_principal AND b.tenant_id = p_tenant
     AND ((b.scope = 'DOMAIN' AND b.domain_id = p_domain) OR b.scope = 'TENANT')
     AND b.role_code IN (SELECT jsonb_array_elements_text(coalesce(p_policy -> 'roles', '[]'::jsonb)))
   ORDER BY 1 LIMIT 1;
  IF r IS NOT NULL THEN RETURN 'role:' || r; END IF;
  RETURN NULL;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.approver_eligibility(uuid, uuid, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.approver_eligibility(uuid, uuid, uuid, jsonb) TO eye_app, eye_commit;

/* Live approvals of a version: distinct eligible humans, approve, not revoked, not expired, of THIS digest. */
CREATE OR REPLACE FUNCTION decision.live_approvals(p_package_id uuid, p_version int) RETURNS TABLE (approval_id uuid, approver_principal_id uuid)
STABLE SET search_path = decision, pg_catalog, pg_temp AS $$
  SELECT DISTINCT ON (a.approver_principal_id) a.approval_id, a.approver_principal_id
    FROM decision.approvals a JOIN decision.package_versions v ON v.package_id = a.package_id AND v.version = a.version
   WHERE a.package_id = p_package_id AND a.version = p_version AND a.decision = 'approve' AND a.revoked_at IS NULL
     AND a.expires_at > clock_timestamp() AND a.version_digest = v.version_digest
     AND decision.approver_eligibility(a.approver_principal_id, a.tenant_id, a.domain_id, v.approver_policy) IS NOT NULL
   ORDER BY a.approver_principal_id, a.recorded_at;
$$ LANGUAGE sql;
GRANT EXECUTE ON FUNCTION decision.live_approvals(uuid, int) TO eye_app, eye_commit;

CREATE OR REPLACE FUNCTION decision.holds_role(p_principal uuid, p_tenant uuid, p_domain uuid, p_role text) RETURNS boolean
STABLE SECURITY DEFINER SET search_path = identity, pg_catalog, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM identity.role_bindings b WHERE b.principal_id = p_principal AND b.role_code = p_role AND b.tenant_id = p_tenant
                   AND ((b.scope = 'DOMAIN' AND b.domain_id = p_domain) OR b.scope = 'TENANT'));
$$ LANGUAGE sql;
REVOKE ALL ON FUNCTION decision.holds_role(uuid, uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.holds_role(uuid, uuid, uuid, text) TO eye_app, eye_commit;

-- ============================================================
-- 2. Commitments: one per package; the row IS the bounded CMT's record here.
-- ============================================================
CREATE TABLE decision.commitments (
  commitment_id         uuid PRIMARY KEY,                       -- = the CMT strategy object id
  scope                 text NOT NULL,
  tenant_id             uuid NOT NULL,
  domain_id             uuid NOT NULL,
  package_id            uuid NOT NULL UNIQUE REFERENCES decision.packages_current(package_id),
  version               int  NOT NULL,
  committed_by          uuid NOT NULL,
  version_digest        text NOT NULL CHECK (version_digest ~ '^[0-9a-f]{64}$'),
  approvals             jsonb NOT NULL CHECK (jsonb_typeof(approvals) = 'array'),
  op_class              text NOT NULL CHECK (op_class = 'C3'),
  bound_action          text NOT NULL CHECK (bound_action = 'decision.commit'),
  header_digest         text NOT NULL CHECK (header_digest ~ '^[0-9a-f]{64}$'),
  committed_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id        uuid NOT NULL,
  CONSTRAINT dcm_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT dcm_version FOREIGN KEY (package_id, version) REFERENCES decision.package_versions(package_id, version)
);
CREATE TRIGGER dcm_append_only BEFORE UPDATE OR DELETE ON decision.commitments
  FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

-- ============================================================
-- 3. Ports.
-- ============================================================
CREATE OR REPLACE FUNCTION decision.record_approval(
  p_approval_id uuid, p_tenant uuid, p_domain uuid, p_package_id uuid, p_version int, p_approver uuid, p_decision text, p_version_digest text,
  p_rationale text, p_conditions jsonb, p_header_digest text, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v record; p record; v_elig text; v_quorum int; v_live int; v_expires timestamptz; v_state text;
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
  v_elig := decision.approver_eligibility(p_approver, p_tenant, p_domain, v.approver_policy);
  IF v_elig IS NULL THEN RAISE EXCEPTION 'approval rejected: principal % is not an eligible approver under this version''s policy', p_approver USING ERRCODE = '42501'; END IF;
  IF EXISTS (SELECT 1 FROM decision.approvals a WHERE a.package_id = p_package_id AND a.version = p_version AND a.approver_principal_id = p_approver AND a.revoked_at IS NULL) THEN
    RAISE EXCEPTION 'approval rejected: this approver already has a live record on version %; revoke it first', p_version USING ERRCODE = '22023';
  END IF;
  v_expires := clock_timestamp() + make_interval(days => coalesce((v.approver_policy ->> 'expires_after_days')::int, 14));
  INSERT INTO decision.approvals (approval_id, scope, tenant_id, domain_id, package_id, version, approver_principal_id, decision, version_digest, rationale, conditions, eligible_by, expires_at, header_digest, correlation_id)
  VALUES (p_approval_id, 'DOMAIN', p_tenant, p_domain, p_package_id, p_version, p_approver, p_decision, p_version_digest, p_rationale, coalesce(p_conditions, '[]'::jsonb), v_elig, v_expires, p_header_digest, p_correlation);
  INSERT INTO decision.package_events (event_id, scope, tenant_id, domain_id, package_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_package_id, 'review.recorded', p_approver,
          jsonb_build_object('version', p_version, 'approval_id', p_approval_id, 'decision', p_decision, 'version_digest', p_version_digest, 'eligible_by', v_elig, 'expires_at', v_expires), p_correlation);
  v_quorum := (v.approver_policy ->> 'quorum')::int;
  IF p_decision = 'reject' THEN
    UPDATE decision.package_versions SET state = 'rejected' WHERE package_id = p_package_id AND version = p_version;
    UPDATE decision.packages_current SET state = 'rejected' WHERE package_id = p_package_id;
    INSERT INTO decision.package_events (event_id, scope, tenant_id, domain_id, package_id, event, actor_principal_id, details, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_package_id, 'version.rejected', p_approver, jsonb_build_object('version', p_version, 'approval_id', p_approval_id), p_correlation);
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
  RETURN jsonb_build_object('state', v_state, 'live_approvals', v_live, 'quorum', v_quorum, 'expires_at', v_expires, 'eligible_by', v_elig);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.record_approval(uuid,uuid,uuid,uuid,int,uuid,text,text,text,jsonb,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.record_approval(uuid,uuid,uuid,uuid,int,uuid,text,text,text,jsonb,text,uuid,uuid) TO eye_commit;

CREATE OR REPLACE FUNCTION decision.revoke_approval(
  p_approval_id uuid, p_tenant uuid, p_domain uuid, p_reason text, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE a record; v record; v_live int; v_quorum int; v_state text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.approve.revoke']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT * INTO a FROM decision.approvals x WHERE x.approval_id = p_approval_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'revocation rejected: no such approval in this domain' USING ERRCODE = '23503'; END IF;
  IF a.approver_principal_id IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'revocation rejected: only the approver revokes their own approval' USING ERRCODE = '42501'; END IF;
  IF a.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'revocation rejected: approval is already revoked' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 4 THEN RAISE EXCEPTION 'revocation rejected: a reason is required' USING ERRCODE = '22023'; END IF;
  SELECT * INTO v FROM decision.package_versions x WHERE x.package_id = a.package_id AND x.version = a.version FOR UPDATE;
  IF v.state = 'committed' THEN RAISE EXCEPTION 'revocation rejected: version % is committed; an approval is not withdrawn from a commitment', a.version USING ERRCODE = '22023'; END IF;
  UPDATE decision.approvals SET revoked_at = clock_timestamp(), revoked_reason = p_reason WHERE approval_id = p_approval_id;
  INSERT INTO decision.package_events (event_id, scope, tenant_id, domain_id, package_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, a.package_id, 'approval.revoked', a.approver_principal_id,
          jsonb_build_object('version', a.version, 'approval_id', p_approval_id, 'reason', p_reason), p_correlation);
  v_quorum := (v.approver_policy ->> 'quorum')::int;
  SELECT count(*) INTO v_live FROM decision.live_approvals(a.package_id, a.version);
  v_state := v.state;
  IF v.state = 'approved' AND v_live < v_quorum THEN
    v_state := 'under_review';
    UPDATE decision.package_versions SET state = 'under_review' WHERE package_id = a.package_id AND version = a.version;
    UPDATE decision.packages_current SET state = 'under_review' WHERE package_id = a.package_id;
  END IF;
  RETURN jsonb_build_object('state', v_state, 'live_approvals', v_live, 'quorum', v_quorum);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.revoke_approval(uuid,uuid,uuid,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.revoke_approval(uuid,uuid,uuid,text,uuid,uuid) TO eye_commit;

/*
 * COMMIT. One exact action, one consequence class, one named human, one package
 * lock, one recount, one bounded CMT. Everything the authority context must carry is
 * checked HERE, against the context itself — not against what the caller says.
 */
CREATE OR REPLACE FUNCTION decision.commit_package(
  p_commitment_id uuid, p_tenant uuid, p_domain uuid, p_package_id uuid, p_version int, p_committer uuid, p_version_digest text, p_header_digest text,
  p_title text, p_statement text, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, graph, simulation, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE p record; v record; v_quorum int; v_live int; v_approvals jsonb; v_dec uuid; c jsonb;
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
  IF p.committed_version IS NOT NULL THEN RAISE EXCEPTION 'commitment rejected: package is already committed at version %', p.committed_version USING ERRCODE = '22023'; END IF;
  SELECT * INTO v FROM decision.package_versions x WHERE x.package_id = p_package_id AND x.version = p_version FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'commitment rejected: no such version' USING ERRCODE = '23503'; END IF;
  IF v.state <> 'approved' THEN RAISE EXCEPTION 'commitment rejected: version % is %, not approved', p_version, v.state USING ERRCODE = '22023'; END IF;
  IF p_version_digest IS DISTINCT FROM v.version_digest THEN
    RAISE EXCEPTION 'commitment rejected: the digest committed (%) is not the digest of version % (%)', p_version_digest, p_version, v.version_digest USING ERRCODE = '22023';
  END IF;
  v_quorum := (v.approver_policy ->> 'quorum')::int;
  SELECT count(*), coalesce(jsonb_agg(jsonb_build_object('approval_id', approval_id, 'approver', approver_principal_id)), '[]'::jsonb)
    INTO v_live, v_approvals FROM decision.live_approvals(p_package_id, p_version);
  IF v_live < v_quorum THEN
    RAISE EXCEPTION 'commitment rejected: quorum is % distinct eligible humans; % live approval(s) stand now (expired, revoked or re-digested approvals do not count)', v_quorum, v_live USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM decision.live_approvals(p_package_id, p_version) la WHERE la.approver_principal_id = p_committer) THEN
    RAISE EXCEPTION 'commitment rejected: the committing authority cannot be one of the approvers' USING ERRCODE = '42501';
  END IF;
  v_dec := p.decision_object_id;
  -- The bounded CMT, into Phase 3's own tables, under THIS action — the only CMT write this schema makes.
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
  INSERT INTO decision.commitments (commitment_id, scope, tenant_id, domain_id, package_id, version, committed_by, version_digest, approvals, op_class, bound_action, header_digest, correlation_id)
  VALUES (p_commitment_id, 'DOMAIN', p_tenant, p_domain, p_package_id, p_version, p_committer, p_version_digest, v_approvals, public.eye_op_class(), public.eye_bound_action(), p_header_digest, p_correlation);
  UPDATE decision.package_versions SET state = 'committed' WHERE package_id = p_package_id AND version = p_version;
  UPDATE decision.packages_current SET state = 'committed', committed_version = p_version, decided_at = clock_timestamp() WHERE package_id = p_package_id;
  INSERT INTO decision.package_events (event_id, scope, tenant_id, domain_id, package_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_package_id, 'package.committed', p_committer,
          jsonb_build_object('version', p_version, 'commitment_id', p_commitment_id, 'version_digest', p_version_digest, 'approvals', v_approvals, 'op_class', public.eye_op_class(), 'choice', v.choice), p_correlation);
  RETURN jsonb_build_object('commitment_id', p_commitment_id, 'approvals', v_approvals, 'op_class', public.eye_op_class(), 'decided_at', clock_timestamp());
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.commit_package(uuid,uuid,uuid,uuid,int,uuid,text,text,text,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.commit_package(uuid,uuid,uuid,uuid,int,uuid,text,text,text,text,uuid,uuid) TO eye_commit;

-- ============================================================
-- 4. Write actions, APR@v1, RLS.
-- ============================================================
INSERT INTO observation.canonical_write_actions (action, object_types, rationale) VALUES
  ('decision.approve', ARRAY['APR'], 'An approval admits an approval record and nothing else'),
  ('decision.commit', ARRAY['CMT'], 'The exact C3 commitment admits the bounded CMT and nothing else')
ON CONFLICT (action) DO NOTHING;

INSERT INTO objects.schema_registry (object_type, schema_version, json_schema, compatibility) VALUES
('APR', 'v1', '{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "additionalProperties": false,
  "required": ["package_id","version","version_digest","approver","decision","rationale","conditions"],
  "properties": {
    "package_id": { "type": "string" },
    "version": { "type": "integer", "minimum": 1 },
    "version_digest": { "type": "string", "pattern": "^[0-9a-f]{64}$" },
    "approver": { "type": "string" },
    "decision": { "enum": ["approve","reject"] },
    "rationale": { "type": "string", "minLength": 8 },
    "conditions": { "type": "array" }
  }
}'::jsonb, 'backward')
ON CONFLICT DO NOTHING;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['approvals', 'commitments'] LOOP
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
