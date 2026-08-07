-- 0013: Gate-2.2 C1 — DATABASE-ENFORCED POL/AUD/EFFECT OPERATION CLOSURE.
--
-- GOVERNED FORWARD MIGRATION. 0001–0012 remain byte-identical; no rebaseline,
-- no rehash. This migration adds a two-phase operation-closure protocol so that
-- POL/AUD/effect atomicity is enforced BY THE DATABASE at commit, not by
-- application convention.
--
-- Finding (C1): the request pipeline committed a business effect, its policy
-- decision and its audit event in ONE transaction purely because the
-- application put them there. Nothing in the database FORCED an effect to be
-- accompanied by a matching persisted allow decision and success audit event.
-- A handler that wrote an effect and skipped closure would still commit.
--
-- Mechanism:
--   * ctx.issue_commit now OPENS an operation: a server-generated operation id,
--     bound to txid + backend pid + runtime role + principal + session + scope +
--     tenant/domain + action + target + correlation + purpose + consequence +
--     bundle + the IMMUTABLE policy-decision id + capability class + expected
--     outcome, recorded in ctx.operation. The operation id lives in a GUC.
--   * Every authoritative BUSINESS EFFECT table (tenants, domains, principals,
--     role_bindings, canonical_objects, object_outbox) carries an AFTER INSERT
--     trigger that STAMPS the effect against the current operation. An
--     authority-mode effect with no open operation is impossible.
--   * A DEFERRED CONSTRAINT TRIGGER on the effect ledger fires AT COMMIT and
--     fails the whole transaction unless the operation is fully closed: exactly
--     one persisted allow / allow_with_obligations decision (not evidence-only),
--     obligations executed if required, and exactly one matching SUCCESS audit
--     event bound to the same decision + correlation + action.
--
-- Deny / indeterminate paths open NO operation (they run under evidence mode),
-- write POL + AUD only, and touch no effect table — so they are unaffected and
-- remain evidence-only with zero business mutation.

-- ============================================================
-- 1. The operation ledger and the per-transaction effect ledger.
-- ============================================================
CREATE TABLE IF NOT EXISTS ctx.operation (
  operation_id         uuid PRIMARY KEY,
  decision_id          uuid NOT NULL,
  txid                 xid8 NOT NULL,
  backend_pid          int NOT NULL,
  runtime_role         text NOT NULL,
  principal_id         uuid,
  session_id           uuid,
  scope                text NOT NULL,
  tenant_id            uuid,
  domain_id            uuid,
  action               text NOT NULL,
  target               text,
  correlation_id       uuid NOT NULL,
  causation_id         uuid,
  purpose              text,
  consequence          text NOT NULL,
  bundle_version       text NOT NULL,
  capability_class     text NOT NULL,
  expected_outcome     text NOT NULL,
  obligations_required boolean NOT NULL DEFAULT false,
  obligations_executed boolean NOT NULL DEFAULT false,
  opened_at            timestamptz NOT NULL DEFAULT clock_timestamp(),
  finalized            boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS ctx.operation_effect (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  operation_id uuid NOT NULL REFERENCES ctx.operation(operation_id),
  effect_kind  text NOT NULL,
  effect_ref   text NOT NULL,
  recorded_at  timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS operation_effect_op_idx ON ctx.operation_effect(operation_id);

-- Deny-all direct access from every runtime role; the definer ports (owned by
-- the migrate superuser, which is BYPASSRLS) are the only writers/readers.
ALTER TABLE ctx.operation ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctx.operation FORCE ROW LEVEL SECURITY;
ALTER TABLE ctx.operation_effect ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctx.operation_effect FORCE ROW LEVEL SECURITY;
REVOKE ALL ON ctx.operation, ctx.operation_effect
  FROM eye_app, eye_commit, eye_identity, eye_publisher, eye_verifier, eye_recovery, PUBLIC;

-- ============================================================
-- 2. Open an operation from the freshly-signed authority context.
-- ============================================================
CREATE OR REPLACE FUNCTION ctx.open_operation(p_consequence text)
RETURNS uuid
SECURITY DEFINER SET search_path = ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_op uuid := gen_random_uuid();
BEGIN
  -- Only authority-mode contexts carry a business operation. Evidence, publish,
  -- verify, identity_op and bootstrap contexts open nothing.
  IF public.eye_ctx_mode() <> 'authority' THEN
    RETURN NULL;
  END IF;
  IF public.eye_policy_decision() IS NULL THEN
    RAISE EXCEPTION 'operation open denied: authority context carries no policy decision' USING ERRCODE = '42501';
  END IF;
  INSERT INTO ctx.operation (
    operation_id, decision_id, txid, backend_pid, runtime_role,
    principal_id, session_id, scope, tenant_id, domain_id,
    action, target, correlation_id, purpose, consequence,
    bundle_version, capability_class, expected_outcome
  ) VALUES (
    v_op, public.eye_policy_decision(), pg_current_xact_id(), pg_backend_pid(), current_user,
    public.eye_principal(), public.eye_session(), public.eye_scope(), public.eye_tenant(), public.eye_domain(),
    public.eye_bound_action(), nullif(public.eye_bound_target(), ''), public.eye_correlation(),
    public.eye_purpose(), coalesce(p_consequence, 'C1'),
    public.eye_bundle_version(), 'authority.commit', 'success'
  );
  PERFORM set_config('eye.op', v_op::text, true);
  RETURN v_op;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION ctx.open_operation(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ctx.open_operation(text) TO eye_commit, eye_identity;

CREATE OR REPLACE FUNCTION ctx.current_operation() RETURNS uuid
LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('eye.op', true), '')::uuid $$;

-- ============================================================
-- 3. Stamp an effect against the current operation.
-- ============================================================
CREATE OR REPLACE FUNCTION ctx.record_effect(p_kind text, p_ref text)
RETURNS void
SECURITY DEFINER SET search_path = ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_op uuid := ctx.current_operation(); op ctx.operation%ROWTYPE;
BEGIN
  IF public.eye_ctx_mode() <> 'authority' THEN
    RAISE EXCEPTION 'effect rejected: authority mode required (context is %)',
      public.eye_ctx_mode() USING ERRCODE = '42501';
  END IF;
  IF v_op IS NULL THEN
    RAISE EXCEPTION 'effect rejected: an authoritative effect requires an open operation'
      USING ERRCODE = '23514';
  END IF;
  SELECT * INTO op FROM ctx.operation WHERE operation_id = v_op;
  IF NOT FOUND OR op.txid <> pg_current_xact_id() OR op.backend_pid <> pg_backend_pid() THEN
    RAISE EXCEPTION 'effect rejected: operation is not bound to this transaction' USING ERRCODE = '42501';
  END IF;
  INSERT INTO ctx.operation_effect (operation_id, effect_kind, effect_ref)
    VALUES (v_op, p_kind, p_ref);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION ctx.record_effect(text, text) FROM PUBLIC;
-- Executed only from the effect-stamping trigger (definer), never by a role.

CREATE OR REPLACE FUNCTION ctx.mark_obligations_executed()
RETURNS void
SECURITY DEFINER SET search_path = ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  UPDATE ctx.operation SET obligations_executed = true
   WHERE operation_id = ctx.current_operation();
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION ctx.mark_obligations_executed() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ctx.mark_obligations_executed() TO eye_commit, eye_identity;

-- ============================================================
-- 4. THE CLOSURE CHECK — a DEFERRED constraint trigger that fires at commit.
-- ============================================================
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
  -- One effect check per operation is enough; later effect rows short-circuit.
  IF op.finalized THEN RETURN NULL; END IF;

  -- (a) Exactly one REAL allow decision (not an evidence-only re-record) bound to
  --     the operation's decision id, correlation and action.
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

  -- (b) Obligations, if the operation required them, must be marked executed.
  IF op.obligations_required AND NOT op.obligations_executed THEN
    RAISE EXCEPTION 'operation closure: required obligations were not executed' USING ERRCODE = '23514';
  END IF;

  -- (c) Exactly one SUCCESS audit event bound to the same decision id,
  --     correlation and action. audit_events keeps the decision id inside the
  --     canonical event object.
  SELECT count(*) INTO v_aud FROM audit.audit_events a
   WHERE a.correlation_id = op.correlation_id
     AND a.action = op.action
     AND a.outcome = 'success'
     AND (a.event->>'policy_decision_id')::uuid = op.decision_id;
  IF v_aud <> 1 THEN
    RAISE EXCEPTION 'operation closure: business effect present without exactly one matching success audit event (found %)',
      v_aud USING ERRCODE = '23514';
  END IF;

  UPDATE ctx.operation SET finalized = true WHERE operation_id = op.operation_id;
  RETURN NULL;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS assert_operation_closed ON ctx.operation_effect;
CREATE CONSTRAINT TRIGGER assert_operation_closed
  AFTER INSERT ON ctx.operation_effect
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION ctx.assert_operation_closed();

-- ============================================================
-- 5. Stamp every business-effect INSERT against the open operation.
-- ============================================================
CREATE OR REPLACE FUNCTION ctx.stamp_business_effect()
RETURNS trigger
SECURITY DEFINER SET search_path = ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  -- Only authority-mode writes are operation effects. Fixture seeding with no
  -- context (superuser), and evidence/publish/verify/identity/bootstrap modes,
  -- are not business operations and are never stamped.
  IF public.eye_ctx_mode() = 'authority' THEN
    PERFORM ctx.record_effect(TG_ARGV[0], (to_jsonb(NEW) ->> TG_ARGV[1]));
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS stamp_effect ON tenancy.tenants;
CREATE TRIGGER stamp_effect AFTER INSERT ON tenancy.tenants
  FOR EACH ROW EXECUTE FUNCTION ctx.stamp_business_effect('tenant', 'id');
DROP TRIGGER IF EXISTS stamp_effect ON tenancy.domains;
CREATE TRIGGER stamp_effect AFTER INSERT ON tenancy.domains
  FOR EACH ROW EXECUTE FUNCTION ctx.stamp_business_effect('domain', 'id');
DROP TRIGGER IF EXISTS stamp_effect ON identity.principals;
CREATE TRIGGER stamp_effect AFTER INSERT ON identity.principals
  FOR EACH ROW EXECUTE FUNCTION ctx.stamp_business_effect('principal', 'id');
DROP TRIGGER IF EXISTS stamp_effect ON identity.role_bindings;
CREATE TRIGGER stamp_effect AFTER INSERT ON identity.role_bindings
  FOR EACH ROW EXECUTE FUNCTION ctx.stamp_business_effect('binding', 'id');
DROP TRIGGER IF EXISTS stamp_effect ON objects.canonical_objects;
CREATE TRIGGER stamp_effect AFTER INSERT ON objects.canonical_objects
  FOR EACH ROW EXECUTE FUNCTION ctx.stamp_business_effect('canonical', 'object_id');
DROP TRIGGER IF EXISTS stamp_effect ON objects.object_outbox;
CREATE TRIGGER stamp_effect AFTER INSERT ON objects.object_outbox
  FOR EACH ROW EXECUTE FUNCTION ctx.stamp_business_effect('outbox', 'id');

-- ============================================================
-- 6. issue_commit now OPENS the operation as its final step.
--    (Faithful re-emit of the 0011 body with one appended PERFORM.)
-- ============================================================
CREATE OR REPLACE FUNCTION ctx.issue_commit(
  p_session uuid, p_context_key text, p_scope text, p_tenant uuid, p_domain uuid,
  p_purpose text, p_action text, p_target text, p_correlation uuid,
  p_policy_decision uuid, p_bundle text, p_consequence text, p_ttl_seconds int DEFAULT 60
) RETURNS void
SECURITY DEFINER SET search_path = ctx, identity, public, pg_catalog, pg_temp
AS $$
DECLARE s RECORD; v_epoch bigint; v_ok boolean := false;
BEGIN
  IF session_user = 'eye_identity' AND p_action NOT LIKE 'identity.%' THEN
    RAISE EXCEPTION 'context denied: the identity authority cannot mint a capability for action %', p_action
      USING ERRCODE = '42501';
  END IF;
  IF session_user = 'eye_commit' AND p_action LIKE 'identity.%' THEN
    RAISE EXCEPTION 'context denied: the commit authority cannot mint an identity capability (action %)', p_action
      USING ERRCODE = '42501';
  END IF;

  IF p_scope NOT IN ('PLATFORM','TENANT','DOMAIN') THEN
    RAISE EXCEPTION 'context denied: invalid scope %', p_scope USING ERRCODE = '42501';
  END IF;
  IF p_action IS NULL OR p_correlation IS NULL OR p_policy_decision IS NULL OR p_bundle IS NULL THEN
    RAISE EXCEPTION 'context denied: commit capability requires action, correlation, policy decision and bundle version'
      USING ERRCODE = '42501';
  END IF;
  IF p_context_key IS NULL OR length(p_context_key) < 20 THEN
    RAISE EXCEPTION 'context denied: proof of possession required' USING ERRCODE = '42501';
  END IF;
  SELECT s2.id, s2.principal_id, s2.assurance, s2.status, s2.expires_at, s2.context_key_hash, s2.bound_epoch
    INTO s FROM identity.sessions s2 WHERE s2.id = p_session;
  IF s.id IS NULL THEN
    RAISE EXCEPTION 'context denied: no such session' USING ERRCODE = '42501';
  END IF;
  IF s.context_key_hash IS DISTINCT FROM encode(public.digest(convert_to(p_context_key,'UTF8'),'sha256'),'hex') THEN
    RAISE EXCEPTION 'context denied: invalid session proof' USING ERRCODE = '42501';
  END IF;
  IF s.status <> 'active' OR s.expires_at <= clock_timestamp() THEN
    RAISE EXCEPTION 'context denied: session not active' USING ERRCODE = '42501';
  END IF;
  IF s.assurance = 'bootstrap_rotation' THEN
    RAISE EXCEPTION 'context denied: bootstrap assurance must complete forced rotation first' USING ERRCODE = '42501';
  END IF;
  SELECT p.revocation_epoch INTO v_epoch FROM identity.principals p
   WHERE p.id = s.principal_id AND p.status = 'active';
  IF v_epoch IS NULL THEN
    RAISE EXCEPTION 'context denied: principal not active' USING ERRCODE = '42501';
  END IF;
  IF s.bound_epoch IS DISTINCT FROM v_epoch THEN
    RAISE EXCEPTION 'context denied: authority epoch changed (re-authenticate)' USING ERRCODE = '42501';
  END IF;
  IF p_scope = 'PLATFORM' THEN
    IF p_tenant IS NOT NULL OR p_domain IS NOT NULL THEN
      RAISE EXCEPTION 'context denied: platform scope carries identifiers' USING ERRCODE = '42501';
    END IF;
    SELECT EXISTS (SELECT 1 FROM identity.role_bindings b
      WHERE b.principal_id = s.principal_id AND b.scope='PLATFORM' AND b.revoked_at IS NULL) INTO v_ok;
  ELSIF p_scope = 'TENANT' THEN
    IF p_tenant IS NULL OR p_domain IS NOT NULL THEN
      RAISE EXCEPTION 'context denied: tenant scope identifiers invalid' USING ERRCODE = '42501';
    END IF;
    SELECT EXISTS (SELECT 1 FROM identity.role_bindings b
      WHERE b.principal_id = s.principal_id AND b.revoked_at IS NULL
        AND (b.scope='PLATFORM' OR (b.scope='TENANT' AND b.tenant_id=p_tenant))) INTO v_ok;
  ELSE
    IF p_tenant IS NULL OR p_domain IS NULL THEN
      RAISE EXCEPTION 'context denied: domain scope identifiers invalid' USING ERRCODE = '42501';
    END IF;
    SELECT EXISTS (SELECT 1 FROM identity.role_bindings b
      WHERE b.principal_id = s.principal_id AND b.revoked_at IS NULL
        AND (b.scope='PLATFORM' OR (b.scope='TENANT' AND b.tenant_id=p_tenant)
             OR (b.scope='DOMAIN' AND b.tenant_id=p_tenant AND b.domain_id=p_domain))) INTO v_ok;
  END IF;
  IF NOT v_ok THEN
    RAISE EXCEPTION 'context denied: no qualifying binding for requested scope' USING ERRCODE = '42501';
  END IF;
  PERFORM set_config('eye.ctx3', ctx.build(
    p_session, s.principal_id, p_scope, p_tenant, p_domain, s.assurance, p_purpose,
    v_epoch, 'authority', coalesce(p_consequence,'C1'), p_action, p_target,
    p_correlation, p_policy_decision, p_bundle, p_ttl_seconds), true);
  -- Gate-2.2 C1: open the operation this capability authorizes. From here, any
  -- business effect written in this transaction is stamped against it and the
  -- transaction cannot commit unless the effect is closed by POL + AUD.
  PERFORM ctx.open_operation(coalesce(p_consequence,'C1'));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION ctx.issue_commit(uuid,text,text,uuid,uuid,text,text,text,uuid,uuid,text,text,int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ctx.issue_commit(uuid,text,text,uuid,uuid,text,text,text,uuid,uuid,text,text,int)
  TO eye_commit, eye_identity;
