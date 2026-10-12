-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0114 — CP-6 B94: CUSTOMER ONBOARDING, CONFIGURATION BASELINES AND GOVERNED MIGRATION (F-P7-F-04: V8 ch.67 PR-67-001..006, AT-67,
-- CAP-DL-04/05/06, JRN-01, JRN-23, PER-21; V9 ch.66 UX-66-001..006, JRN-23, CAP-PD-04/05/06); THE IMPLEMENTATION PROGRAMME, ADOPTION AND
-- ENABLEMENT (F-P7-F-05: V8 ch.68 PR-68-001..006, AT-68, CAP-DL-07/08; V8+V9 WS-20); SERVICE MANAGEMENT, SUPPORT ACCESS AND THE CUSTOMER
-- CONTROL CENTER (F-P7-F-06: V8 ch.69 PR-69-001..006, AT-69, CAP-DL-09/10, PER-20; V8 CAP-TR-12; V6 ch.4 IA-04-001..006; V1 V01-T-033) —
-- and the carryovers: B91's premium support bound to the portal's entitlement routing (V8 ENT-17, V10 ENT-20 — F-P7-F-01's piece) and B92's
-- MET-039 (computable now that this stage records its three sources). 0001–0113 are applied and frozen and untouched.
--
-- §0 PRELUDE — the schemas `onboarding`, `implementation`, `service` and their ledgers, the five roles, the attention / task / timer /
-- signature vocabularies, premium_support v2, the shared helpers (tenant scope, the approver test, digests), the onboarding PROGRAMME and the
-- RESPONSIBILITY MATRIX (shared by every part) with OWNER RESOLUTION. The parts' ports, tables and pages follow in their sections.
--
-- THE PRINCIPLES (stated once, enforced by the ports):
--   * the CUSTOMER'S AUTHORITY approves scope, mappings, data transfer, cutover, readiness, residual risk, responsibility and acceptance — a
--     named human, on the exact digest, never the proposer, never an implementation lead, never an agent (PR-67-003, UX-66-004, PER-21);
--     automation validates and executes only inside the approved plan;
--   * adoption never bypasses authority (PR-68-003): no measure, cohort or percentage releases a gate; an unfilled accountable role is not
--     overridable (IA-04-005); no employee-performance inference — training and competence are `complete | not_yet`, subject-visible,
--     purpose-bound, cohorts only above k;
--   * support access is customer-approved, purpose-, object- and action-scoped, time-limited, logged per read and read-only on customer
--     state (PR-69-003, PER-20); premium support never buys weaker governance, and opening a case is never refused by a licence state;
--   * no silent transfer of responsibility (IA-04-003); with no unambiguous accountable owner the dependent act stops, escalates and the gap
--     stays visible (IA-04-005); nothing is shown healthy, complete, authorized or recovered by inference.
-- THREE CLAIMS, never mixed: construction (this software and its harnesses); demonstrated operation (the act on SYNTHETIC NORDWERK records);
-- real customer acceptance (AT-67/68/69, PR-6x-006, UX-66-006 — R2, never claimed). Production admission and profile parity: R1 / B111.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- §0.1 THE SCHEMAS ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS onboarding;
CREATE SCHEMA IF NOT EXISTS implementation;
CREATE SCHEMA IF NOT EXISTS service;
GRANT USAGE ON SCHEMA onboarding, implementation, service TO eye_app, eye_commit;

-- §0.2 THE ROLES ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
INSERT INTO identity.roles (code, scope, description) VALUES
  ('customer_sponsor', 'TENANT', 'The customer sponsor (B94; JRN-01): records the sponsor intent of an onboarding, approves go-live and implementation changes, accepts operating readiness — owns organizational change (PR-68-003); a named human'),
  ('onboarding_authority', 'TENANT', 'The customer authority of an onboarding (B94; PR-67-003, UX-66-004): approves scope, mappings, data transfer, cutover, readiness, residual risk, responsibility matrices, configuration baselines and acceptance — on the exact digest, a named human, never the proposer'),
  ('implementation_lead', 'TENANT', 'The implementation lead (B94; PER-21): coordinates onboarding, configuration, migration, readiness and acceptance — proposes plans, baselines and mappings, runs rehearsals and executes inside the approved plan; never approves or accepts on the customer''s behalf'),
  ('support_engineer', 'DOMAIN', 'The support engineer (B94; PER-20): diagnoses through scoped, approved, time-limited access only — no data access without a live approved support grant; never mutates customer decisions, evidence, policy or source state'),
  ('enablement_assessor', 'DOMAIN', 'The enablement assessor (B94; CAP-DL-08): records role competence (complete | not yet) for a named subject other than themself — no score, no rank, no performance inference')
ON CONFLICT (code) DO NOTHING;

-- §0.3 THE VOCABULARIES ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
-- (a) attention (0113 §0.3's function and both CHECKs, copied whole, plus B94's): onboarding.migration (a held wave / cutover, a failed
-- reconciliation), onboarding.drift (configuration drift), implementation.readiness (a held go-live gate, a blocking readiness item),
-- service.case (a routed case, an SLA breach escalated by severity), support.access (an access request awaiting the customer, a lapse),
-- responsibility.gap (no unambiguous accountable owner — IA-04-005).
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
  'twin.reconciliation', 'twin.freshness', 'twin.envelope', 'twin.observation_request', 'simulation.checkpoint',
  -- B91 (0105)
  'commercial.usage', 'commercial.entitlement',
  -- B25 (0108)
  'forecast.disagreement',
  -- B33 (0111)
  'supply.dependency', 'supply.disruption', 'domain.alert', 'domain.package',
  -- B92 (0113)
  'analytics.metric', 'analytics.privacy', 'analytics.experience',
  -- B94 (0114)
  'onboarding.migration', 'onboarding.drift', 'implementation.readiness', 'service.case', 'support.access', 'responsibility.gap'] $$;
ALTER TABLE executive.attention_items DROP CONSTRAINT IF EXISTS attention_items_signal_class_check;
ALTER TABLE executive.attention_items ADD CONSTRAINT attention_items_signal_class_check CHECK (signal_class IN (
  'forecast.unfit', 'scenario.incoherent', 'warning.raised', 'source.coverage_loss', 'proposal.review', 'decision.material_change', 'review.convened',
  'opportunity.raised', 'health.change', 'commitment.due', 'commitment.breach',
  'plan.variance', 'publication.correction', 'strategy.detection', 'queue.governance',
  'product.degradation', 'subscription.lag', 'metric.certification', 'catalog.coverage',
  'scenario.suspension', 'scenario.set_gap', 'scenario.quality', 'scenario.signpost', 'scenario.proposal',
  'simulation.budget', 'simulation.experiment', 'simulation.validity', 'simulation.value_of_information',
  'decision.recommendation', 'decision.appeal', 'decision.reversion', 'decision.review_due',
  'twin.reconciliation', 'twin.freshness', 'twin.envelope', 'twin.observation_request', 'simulation.checkpoint',
  'commercial.usage', 'commercial.entitlement',
  'forecast.disagreement',
  'supply.dependency', 'supply.disruption', 'domain.alert', 'domain.package',
  'analytics.metric', 'analytics.privacy', 'analytics.experience',
  -- B94 (0114)
  'onboarding.migration', 'onboarding.drift', 'implementation.readiness', 'service.case', 'support.access', 'responsibility.gap'));
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
  'twin', 'twin_version', 'twin_estimate', 'twin_branch', 'behaviour_model',
  -- B91 (0105)
  'meter', 'budget', 'entitlement', 'contract',
  -- B25 (0108)
  'ensemble_run',
  -- B33 (0111)
  'supply_inference', 'supply_disruption', 'domain_package', 'domain_assessment', 'competitor_profile', 'watchlist',
  -- B92 (0113)
  'metric_definition', 'metric_result', 'telemetry_definition', 'experience_finding', 'operating_review',
  -- B94 (0114)
  'onboarding_programme', 'config_baseline', 'migration_wave', 'cutover', 'implementation_programme', 'readiness_gate', 'service_case',
  'support_grant', 'responsibility_matrix'));

-- (b) human tasks, their subjects and the workflow timers (0090's three lists, copied whole, plus B94's): the customer authority's review of
-- an onboarding approval, the domain admin's review of a support-access request, the customer's confirmation of a case closure, the
-- sponsor's go-live review; timers for a support grant's expiry, an SLA's response and resolution objectives, and a baseline drift check.
CREATE OR REPLACE FUNCTION executive.human_task_kinds() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY[
  'gate.approve', 'gate.review', 'gate.delegated_approval', 'gate.override_review', 'gate.ready_review',
  'commitment.accept', 'commitment.checkpoint', 'commitment.renegotiate', 'commitment.compensation',
  'collab.review', 'collab.contribute',
  'workflow.irreconcilable', 'workflow.compensation_confirm',
  -- B94 (0114)
  'onboarding.approve', 'support.access_review', 'service.closure_confirm', 'implementation.golive_review'] $$;
CREATE OR REPLACE FUNCTION executive.task_subject_kinds() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY[
  'decision_package', 'decision_version', 'gate', 'commitment', 'commitment_item', 'execution_handoff', 'workspace', 'workflow_instance',
  -- B94 (0114)
  'onboarding_programme', 'config_baseline', 'migration_wave', 'cutover', 'implementation_programme', 'readiness_gate', 'service_case', 'support_grant', 'responsibility_matrix'] $$;
CREATE OR REPLACE FUNCTION executive.workflow_timer_kinds() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY[
  'task.deadline', 'task.reminder', 'workflow.step_timeout', 'grant.expiry', 'commitment.checkpoint', 'gate.expiry',
  -- B94 (0114)
  'support_access.expiry', 'sla.response', 'sla.resolution', 'baseline.drift_check'] $$;

-- (c) the signature subject kinds (0095's list whole, plus B94's): a configuration baseline, a responsibility matrix, a migration mapping, a
-- cutover, a readiness acceptance (go-live), an acceptance record, an admission record.
ALTER TABLE executive.signatures DROP CONSTRAINT IF EXISTS signatures_subject_kind_check;
ALTER TABLE executive.signatures ADD CONSTRAINT signatures_subject_kind_check CHECK (subject_kind IN (
  'approval', 'decision', 'publication', 'queue_transition', 'plan_baseline', 'briefing', 'health_snapshot',
  'product_release', 'metric_certification',
  -- B94 (0114)
  'config_baseline', 'responsibility_matrix', 'mapping', 'cutover', 'readiness', 'acceptance', 'admission_record'));

-- §0.4 THE ENTITLEMENT — `premium_support` v2 (built; NO gating prefix) supersedes 0105's v1 ("not built"): premium support is a ROUTING
-- entitlement of the service portal (named support, response and resolution objectives per severity — §SV reads the tenant's live licence),
-- never a gate: opening a case, requesting or approving support access stay available to every tenant (premium support never buys weaker
-- governance; its cannot_remove already says "Support access remains governed"). SYNTHETIC vendor data, as the 0105 seed. Written once:
-- skipped when the live row is already built.
DO $$
DECLARE cur commercial.capabilities%ROWTYPE; v_reason text := 'B94 (0114 §0.4): the service portal is built — premium_support is the routing entitlement of its cases (named support, objectives per severity); it gates no action (V8 ENT-17, V10 ENT-20; F-P7-F-01''s piece)';
        v_descr text := 'Premium support: cases routed to named support with response and resolution objectives per severity (B94 service portal). Case opening and governed support access stay available to every tenant; premium support never weakens governance.';
BEGIN
  SELECT * INTO cur FROM commercial.capabilities c WHERE c.capability_key = 'premium_support' AND c.status <> 'superseded';
  IF cur.capability_key IS NULL OR cur.built THEN RETURN; END IF;
  UPDATE commercial.capabilities SET status = 'superseded', superseded_at = clock_timestamp() WHERE capability_key = 'premium_support' AND version = cur.version;
  INSERT INTO commercial.capabilities (capability_key, version, label, description, action_prefixes, included_in, core, entitlement_unit, tier, built, spec_refs,
                                       cannot_remove, status, declared_by, reason, provenance, digest)
  VALUES ('premium_support', cur.version + 1, cur.label, v_descr, '{}'::text[], cur.included_in, cur.core, cur.entitlement_unit, cur.tier, true, cur.spec_refs || ARRAY['F-P7-F-06'],
          cur.cannot_remove, 'active', '00000000-0000-0000-0000-000000000000'::uuid, v_reason,
          jsonb_build_object('seeded_by', 'migration 0114 §0.4', 'synthetic', true, 'supersedes', cur.version),
          commercial.cen_digest(jsonb_build_object('key', 'premium_support', 'version', cur.version + 1, 'prefixes', '[]'::jsonb, 'core', cur.core, 'included_in', cur.included_in,
                                                   'unit', cur.entitlement_unit, 'tier', cur.tier, 'status', 'active')));
  INSERT INTO commercial.entitlement_events (event_id, tenant_id, subject_kind, subject_key, version, event, actor, reason, details)
  VALUES (gen_random_uuid(), NULL, 'capability', 'premium_support', cur.version + 1, 'capability.declared', '00000000-0000-0000-0000-000000000000'::uuid, v_reason,
          jsonb_build_object('prefixes', '[]'::jsonb, 'supersedes', cur.version, 'built', true, 'seeded', true, 'migration', '0114 §0.4'));
END $$;

-- §0.5 THE SHARED HELPERS ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* sha256 hex over a jsonb value's canonical text (jsonb's own key ordering). */
CREATE OR REPLACE FUNCTION onboarding.digest(p jsonb) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = public, pg_catalog, pg_temp AS $$ SELECT encode(sha256(convert_to(coalesce(p, 'null'::jsonb)::text, 'UTF8')), 'hex') $$;
GRANT EXECUTE ON FUNCTION onboarding.digest(jsonb) TO eye_app, eye_commit;

/* A TENANT-level write (a programme, a matrix, a tenant-wide record): the context is the tenant's (TENANT, or DOMAIN inside it) — PLATFORM
   authority never owns customer onboarding state. p_noun names the refusal. */
CREATE OR REPLACE FUNCTION onboarding.assert_tenant(p_tenant uuid, p_noun text) RETURNS void
LANGUAGE plpgsql STABLE SET search_path = public, pg_catalog, pg_temp AS $$
BEGIN
  IF public.eye_scope() = 'PLATFORM' THEN
    RAISE EXCEPTION '% rejected (authority): onboarding, implementation and service records are the tenant''s; platform authority cannot own them', p_noun USING ERRCODE = '42501';
  END IF;
  IF p_tenant IS NULL OR p_tenant IS DISTINCT FROM public.eye_tenant() THEN
    RAISE EXCEPTION '% rejected (authority): the tenant does not match the established context', p_noun USING ERRCODE = '42501';
  END IF;
END $$;
GRANT EXECUTE ON FUNCTION onboarding.assert_tenant(uuid, text) TO eye_commit;

/* The kind of an ACTIVE principal (human | agent | workload | system); NULL otherwise. */
CREATE OR REPLACE FUNCTION onboarding.principal_kind(p_principal uuid) RETURNS text
STABLE SECURITY DEFINER SET search_path = identity, pg_catalog, pg_temp AS $$
  SELECT p.kind FROM identity.principals p WHERE p.id = p_principal AND p.status = 'active'
$$ LANGUAGE sql;
REVOKE ALL ON FUNCTION onboarding.principal_kind(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION onboarding.principal_kind(uuid) TO eye_commit;

/* Does the principal hold (live) one of the roles for the tenant / domain (a TENANT binding counts in every domain of the tenant)? */
CREATE OR REPLACE FUNCTION onboarding.holds_role(p_principal uuid, p_tenant uuid, p_domain uuid, p_roles text[]) RETURNS boolean
STABLE SECURITY DEFINER SET search_path = identity, pg_catalog, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM identity.role_bindings b JOIN identity.principals p ON p.id = b.principal_id
                  WHERE b.principal_id = p_principal AND p.status = 'active' AND b.revoked_at IS NULL AND b.role_code = ANY (p_roles) AND b.tenant_id = p_tenant
                    AND (b.scope = 'TENANT' OR (b.scope = 'DOMAIN' AND p_domain IS NOT NULL AND b.domain_id = p_domain)))
$$ LANGUAGE sql;
REVOKE ALL ON FUNCTION onboarding.holds_role(uuid, uuid, uuid, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION onboarding.holds_role(uuid, uuid, uuid, text[]) TO eye_commit;

/* THE APPROVER TEST, in one place (D3 — re-checked in every approving port): a named ACTIVE HUMAN holding one of p_roles for the tenant/domain,
   NOT the proposer, NOT an implementation lead (PER-21: the lead never approves or accepts on the customer's behalf, even when also holding
   an approving role), NOT an agent. Refusals in the class form: (actor) non-human · (authority) without the role · (separation_of_duties)
   the proposer or a lead. */
CREATE OR REPLACE FUNCTION onboarding.assert_approver(p_noun text, p_actor uuid, p_tenant uuid, p_domain uuid, p_roles text[], p_proposer uuid, p_what text) RETURNS void
LANGUAGE plpgsql STABLE SET search_path = onboarding, pg_catalog, pg_temp AS $$
BEGIN
  IF onboarding.principal_kind(p_actor) IS DISTINCT FROM 'human' THEN
    RAISE EXCEPTION '% rejected (actor): % is a named human''s act; an agent or a system never approves or accepts (automation may validate and execute only inside the approved plan)', p_noun, p_what USING ERRCODE = '42501';
  END IF;
  IF NOT onboarding.holds_role(p_actor, p_tenant, p_domain, p_roles) THEN
    RAISE EXCEPTION '% rejected (authority): % is the act of a %', p_noun, p_what, array_to_string(p_roles, ' or ') USING ERRCODE = '42501';
  END IF;
  IF p_proposer IS NOT NULL AND p_actor = p_proposer THEN
    RAISE EXCEPTION '% rejected (separation_of_duties): % is never approved by its proposer', p_noun, p_what USING ERRCODE = '42501';
  END IF;
  IF onboarding.holds_role(p_actor, p_tenant, p_domain, ARRAY['implementation_lead']) THEN
    RAISE EXCEPTION '% rejected (separation_of_duties): an implementation lead never approves or accepts on the customer''s behalf (%)', p_noun, p_what USING ERRCODE = '42501';
  END IF;
END $$;
GRANT EXECUTE ON FUNCTION onboarding.assert_approver(text, uuid, uuid, uuid, text[], uuid, text) TO eye_commit;

-- §0.6 THE LEDGERS (append-only; each schema's ports write their own) ──────────────────────────────────────────────────────────────────────
DO $$
DECLARE s text;
BEGIN
  FOREACH s IN ARRAY ARRAY['onboarding', 'implementation', 'service'] LOOP
    EXECUTE format($t$
      CREATE TABLE %1$I.events (
        event_id           uuid PRIMARY KEY,
        scope              text NOT NULL CHECK (scope IN ('TENANT', 'DOMAIN')),
        tenant_id          uuid NOT NULL,
        domain_id          uuid,
        subject_kind       text NOT NULL CHECK (subject_kind ~ '^[a-z][a-z_]{2,40}$'),
        subject_id         uuid NOT NULL,
        version            int,
        event              text NOT NULL CHECK (event ~ '^[a-z_]+\.[a-z_.]+$'),
        actor_principal_id uuid NOT NULL,
        details            jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
        occurred_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
        correlation_id     uuid NOT NULL,
        CONSTRAINT %1$s_ev_scope CHECK ((scope = 'TENANT') = (domain_id IS NULL))
      )$t$, s);
    EXECUTE format('CREATE INDEX %1$s_ev_subject ON %1$I.events (subject_id, occurred_at)', s);
    EXECUTE format('CREATE TRIGGER %1$s_ev_append_only BEFORE UPDATE OR DELETE ON %1$I.events FOR EACH ROW EXECUTE FUNCTION public.raise_append_only()', s);
  END LOOP;
END $$;

/* Append a ledger event (internal: called by the parts' definer ports only). */
CREATE OR REPLACE FUNCTION onboarding.ledger(p_schema text, p_tenant uuid, p_domain uuid, p_subject_kind text, p_subject_id uuid, p_version int, p_event text,
                                             p_actor uuid, p_details jsonb, p_correlation uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = onboarding, pg_catalog, pg_temp AS $$
DECLARE v_id uuid := gen_random_uuid();
BEGIN
  IF p_schema NOT IN ('onboarding', 'implementation', 'service') THEN RAISE EXCEPTION 'ledger: unknown schema %', p_schema; END IF;
  EXECUTE format('INSERT INTO %I.events (event_id, scope, tenant_id, domain_id, subject_kind, subject_id, version, event, actor_principal_id, details, correlation_id)
                  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)', p_schema)
    USING v_id, CASE WHEN p_domain IS NULL THEN 'TENANT' ELSE 'DOMAIN' END, p_tenant, p_domain, p_subject_kind, p_subject_id, p_version, p_event, p_actor,
          coalesce(p_details, '{}'::jsonb), p_correlation;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION onboarding.ledger(text, uuid, uuid, text, uuid, int, text, uuid, jsonb, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION onboarding.ledger(text, uuid, uuid, text, uuid, int, text, uuid, jsonb, uuid) TO eye_commit;

-- §0.7 THE SHARED TABLES (their ports are the parts') ──────────────────────────────────────────────────────────────────────────────────────
/* THE ONBOARDING PROGRAMME (D5; PR-67-001/-002, JRN-01, JRN-23): TENANT-scoped and versioned — the onboarding of one customer context (a
   target domain, created DRAFT by §ON, activated at cutover by §MG). §ON's ports write it; §MG, §IM and §SA read it. One row per (programme,
   version); state planned → in_progress → held → accepted | withdrawn. The SPONSOR INTENT is the customer sponsor's own record (§ON). */
CREATE TABLE onboarding.programmes (
  programme_id     uuid NOT NULL,
  version          int  NOT NULL CHECK (version >= 1),
  scope            text NOT NULL DEFAULT 'TENANT' CHECK (scope = 'TENANT'),
  tenant_id        uuid NOT NULL REFERENCES tenancy.tenants (id),
  programme_key    text NOT NULL CHECK (programme_key ~ '^[a-z][a-z0-9_.-]{2,62}$'),
  title            text NOT NULL CHECK (length(btrim(title)) BETWEEN 4 AND 200),
  target_domain_id uuid,
  deployment_profile text NOT NULL DEFAULT 'local-dev' CHECK (deployment_profile IN ('local-dev', 'saas', 'private-cloud', 'on-premise')),
  owner_principal_id uuid NOT NULL,
  state            text NOT NULL DEFAULT 'planned' CHECK (state IN ('planned', 'in_progress', 'held', 'accepted', 'withdrawn')),
  held_reasons     jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(held_reasons) = 'array'),
  plan             jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(plan) = 'object'),
  digest           text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  effective_from   timestamptz NOT NULL DEFAULT clock_timestamp(),
  superseded_at    timestamptz,
  created_by       uuid NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id   uuid NOT NULL,
  PRIMARY KEY (programme_id, version),
  CONSTRAINT obp_held CHECK (state <> 'held' OR jsonb_array_length(held_reasons) >= 1)
);
CREATE UNIQUE INDEX obp_one_current ON onboarding.programmes (programme_id) WHERE superseded_at IS NULL;
CREATE UNIQUE INDEX obp_key ON onboarding.programmes (tenant_id, programme_key) WHERE superseded_at IS NULL;

/* THE RESPONSIBILITY MATRIX (D11; IA-04-001..003): per tenant × domain × deployment profile, versioned; proposed by the implementation lead,
   APPROVED and SIGNED by the onboarding authority (a change is a NEW version — never written by a support grant). §SA's ports write it;
   OWNER RESOLUTION below reads it for §MG, §IM and §SA. */
CREATE TABLE service.responsibility_matrices (
  matrix_id        uuid NOT NULL,
  version          int  NOT NULL CHECK (version >= 1),
  scope            text NOT NULL DEFAULT 'DOMAIN' CHECK (scope = 'DOMAIN'),
  tenant_id        uuid NOT NULL,
  domain_id        uuid NOT NULL,
  programme_id     uuid,
  deployment_profile text NOT NULL DEFAULT 'local-dev' CHECK (deployment_profile IN ('local-dev', 'saas', 'private-cloud', 'on-premise')),
  state            text NOT NULL DEFAULT 'proposed' CHECK (state IN ('proposed', 'approved', 'rejected', 'superseded')),
  digest           text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  proposed_by      uuid NOT NULL,
  proposed_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  decided_by       uuid,
  decided_at       timestamptz,
  decision_reason  text,
  signature_id     uuid,
  correlation_id   uuid NOT NULL,
  PRIMARY KEY (matrix_id, version),
  CONSTRAINT srm_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT srm_decided CHECK (state = 'proposed' OR (decided_by IS NOT NULL AND decided_at IS NOT NULL)),
  CONSTRAINT srm_sod CHECK (decided_by IS NULL OR decided_by <> proposed_by),
  CONSTRAINT srm_signed CHECK (state NOT IN ('approved', 'superseded') OR signature_id IS NOT NULL)
);
CREATE UNIQUE INDEX srm_one_approved ON service.responsibility_matrices (tenant_id, domain_id, deployment_profile) WHERE state = 'approved';

/* A matrix row: one responsibility. owner_role (a role code) is the ACCOUNTABLE owner's role in the domain (or the tenant); owner_principal_id
   optionally NAMES the owner (then that principal must hold the role, live). operator_role, customer_authority (role), access_path,
   evidence_producer and escalation_path complete IA-04-001/-002's declaration. */
CREATE TABLE service.responsibility_rows (
  matrix_id          uuid NOT NULL,
  version            int  NOT NULL,
  responsibility_key text NOT NULL CHECK (responsibility_key ~ '^[a-z][a-z0-9_.-]{2,62}$'),
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  title              text NOT NULL CHECK (length(btrim(title)) BETWEEN 4 AND 200),
  owner_role         text NOT NULL REFERENCES identity.roles (code),
  owner_principal_id uuid,
  operator_role      text NOT NULL REFERENCES identity.roles (code),
  customer_authority text NOT NULL REFERENCES identity.roles (code),
  access_path        text NOT NULL CHECK (length(btrim(access_path)) >= 4),
  evidence_producer  text NOT NULL CHECK (length(btrim(evidence_producer)) >= 4),
  escalation_path    text NOT NULL CHECK (length(btrim(escalation_path)) >= 4),
  PRIMARY KEY (matrix_id, version, responsibility_key),
  FOREIGN KEY (matrix_id, version) REFERENCES service.responsibility_matrices (matrix_id, version)
);
CREATE TRIGGER srr_append_only BEFORE UPDATE OR DELETE ON service.responsibility_rows FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

/* OWNER RESOLUTION (IA-04-005), read LIVE: the domain's APPROVED matrix for the profile, its row for the responsibility, the live holders of
   the owner role (DOMAIN bindings of the domain, or TENANT bindings). → {state, responsibility, owner_role, principals, matrix_id, version}:
     undeclared — no approved matrix or no such row (the gap is the declaration itself);
     unfilled   — nobody holds the owner role (or the NAMED owner no longer holds it);
     ambiguous  — several hold it and the row names none;
     resolved   — the named owner holds it, or exactly one principal does.
   Only `resolved` lets a dependent act proceed; the parts stop, escalate (`responsibility.gap`) and keep the gap visible otherwise — never
   infer an owner. SECURITY DEFINER (reads identity), granted to eye_commit (ports) and eye_app (reads). */
CREATE OR REPLACE FUNCTION service.owner_resolution(p_tenant uuid, p_domain uuid, p_responsibility text, p_profile text DEFAULT 'local-dev') RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = service, identity, pg_catalog, pg_temp AS $$
DECLARE m service.responsibility_matrices%ROWTYPE; r service.responsibility_rows%ROWTYPE; v_holders uuid[];
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the accountable owner of a responsibility');
  SELECT * INTO m FROM service.responsibility_matrices x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.deployment_profile = coalesce(p_profile, 'local-dev') AND x.state = 'approved';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('state', 'undeclared', 'responsibility', p_responsibility, 'reason', 'the domain has no approved responsibility matrix for this deployment profile');
  END IF;
  SELECT * INTO r FROM service.responsibility_rows x WHERE x.matrix_id = m.matrix_id AND x.version = m.version AND x.responsibility_key = p_responsibility;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('state', 'undeclared', 'responsibility', p_responsibility, 'matrix_id', m.matrix_id, 'version', m.version,
                              'reason', format('the approved matrix v%s declares no responsibility %s', m.version, p_responsibility));
  END IF;
  SELECT coalesce(array_agg(DISTINCT b.principal_id ORDER BY b.principal_id), '{}') INTO v_holders
    FROM identity.role_bindings b JOIN identity.principals p ON p.id = b.principal_id
   WHERE b.role_code = r.owner_role AND b.revoked_at IS NULL AND p.status = 'active' AND b.tenant_id = p_tenant
     AND (b.scope = 'TENANT' OR (b.scope = 'DOMAIN' AND b.domain_id = p_domain));
  RETURN jsonb_build_object('responsibility', p_responsibility, 'title', r.title, 'owner_role', r.owner_role, 'matrix_id', m.matrix_id, 'version', m.version,
    'escalation_path', r.escalation_path, 'principals', to_jsonb(v_holders),
    'state', CASE WHEN r.owner_principal_id IS NOT NULL THEN CASE WHEN r.owner_principal_id = ANY (v_holders) THEN 'resolved' ELSE 'unfilled' END
                  WHEN cardinality(v_holders) = 0 THEN 'unfilled' WHEN cardinality(v_holders) = 1 THEN 'resolved' ELSE 'ambiguous' END,
    'owner_principal_id', r.owner_principal_id,
    'reason', CASE WHEN r.owner_principal_id IS NOT NULL AND NOT (r.owner_principal_id = ANY (v_holders)) THEN format('the named owner no longer holds %s', r.owner_role)
                   WHEN cardinality(v_holders) = 0 THEN format('nobody holds %s in the domain', r.owner_role)
                   WHEN r.owner_principal_id IS NULL AND cardinality(v_holders) > 1 THEN format('%s principals hold %s and the matrix names none', cardinality(v_holders), r.owner_role)
                   ELSE NULL END);
END $$;
REVOKE ALL ON FUNCTION service.owner_resolution(uuid, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION service.owner_resolution(uuid, uuid, text, text) TO eye_app, eye_commit;

/* THE SERVICE CASE (D10; PR-69-001/-002): DOMAIN-scoped, one row per case (its history is service.events). §SV's ports write it (and may add
   columns in its section); §SA's grants reference it (a support grant names its case). States: open → triaged → awaiting_access →
   diagnosing → workaround_offered → resolved → closed (the customer's confirmation) | cannot_reproduce | degraded_guidance; reopened on
   regression. routing = {tier: premium | standard, licence_version, objectives: {response_minutes, resolution_minutes}, queue} read from the
   tenant's LIVE licence at opening (premium_support) — opening is never licence-gated. */
CREATE TABLE service.cases (
  case_id            uuid PRIMARY KEY,
  scope              text NOT NULL DEFAULT 'DOMAIN' CHECK (scope = 'DOMAIN'),
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  case_ref           text NOT NULL CHECK (case_ref ~ '^CASE-[0-9]{4,}$'),
  title              text NOT NULL CHECK (length(btrim(title)) BETWEEN 4 AND 200),
  severity           text NOT NULL CHECK (severity IN ('S1', 'S2', 'S3', 'S4')),
  affected_capability text NOT NULL CHECK (length(btrim(affected_capability)) BETWEEN 2 AND 80),
  object_refs        jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(object_refs) = 'array'),
  description        text NOT NULL CHECK (length(btrim(description)) >= 8),
  state              text NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'triaged', 'awaiting_access', 'diagnosing', 'workaround_offered', 'resolved', 'closed',
                                                                   'cannot_reproduce', 'degraded_guidance')),
  routing            jsonb NOT NULL CHECK (jsonb_typeof(routing) = 'object' AND routing ->> 'tier' IN ('premium', 'standard')),
  opened_by          uuid NOT NULL,
  opened_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  closed_at          timestamptz,
  correlation_id     uuid NOT NULL,
  CONSTRAINT svc_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT svc_ref_once UNIQUE (tenant_id, case_ref),
  CONSTRAINT svc_closed CHECK ((state = 'closed') = (closed_at IS NOT NULL))
);
CREATE INDEX svc_domain_state ON service.cases (tenant_id, domain_id, state, opened_at DESC);

/* THE SUPPORT GRANT (D11; PR-69-003, PER-20 — the B34/B34-F collaborator-grant pattern): a support engineer's scoped, time-limited access for
   ONE case, requested by the engineer, APPROVED by the domain admin (human gate; §SA's ports), lapsing in three layers (the session's expiry,
   `service.live_grant` in every port below, the `support_access.expiry` timer + sweep + revocation — §SA). object_scope names what may be
   read ({"sources": [uuid…]}), action_scope the acts (closed list). A grant never adds a role binding beyond the engineer's own
   `support_engineer` binding and never writes customer decisions, evidence, policy or source state (IA-04-003). Shared: §SA writes it; §SV's
   engineer-side case acts (note, evidence bundle, workaround proposal) check it through `service.live_grant`. */
CREATE OR REPLACE FUNCTION service.grant_actions() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY[
  'diagnose.source', 'diagnose.runs', 'diagnose.health', 'diagnose.schedule', 'case.note', 'case.bundle', 'case.workaround'] $$;
GRANT EXECUTE ON FUNCTION service.grant_actions() TO eye_app, eye_commit;
CREATE TABLE service.support_grants (
  grant_id           uuid PRIMARY KEY,
  scope              text NOT NULL DEFAULT 'DOMAIN' CHECK (scope = 'DOMAIN'),
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  case_id            uuid NOT NULL REFERENCES service.cases (case_id),
  engineer_principal_id uuid NOT NULL,
  purpose            text NOT NULL CHECK (length(btrim(purpose)) >= 12),
  object_scope       jsonb NOT NULL CHECK (jsonb_typeof(object_scope) = 'object'),
  action_scope       text[] NOT NULL CHECK (cardinality(action_scope) >= 1),
  duration_minutes   int  NOT NULL CHECK (duration_minutes BETWEEN 1 AND 1440),
  state              text NOT NULL DEFAULT 'requested' CHECK (state IN ('requested', 'approved', 'denied', 'revoked', 'lapsed', 'withdrawn')),
  requested_at       timestamptz NOT NULL DEFAULT clock_timestamp(),
  decided_by         uuid,
  decided_at         timestamptz,
  decision_reason    text,
  starts_at          timestamptz,
  expires_at         timestamptz,
  ended_at           timestamptz,
  ended_by           uuid,
  end_reason         text,
  correlation_id     uuid NOT NULL,
  CONSTRAINT ssg_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT ssg_actions CHECK (action_scope <@ service.grant_actions()),
  CONSTRAINT ssg_decided CHECK (state IN ('requested', 'withdrawn') OR (decided_by IS NOT NULL AND decided_at IS NOT NULL)),
  CONSTRAINT ssg_sod CHECK (decided_by IS NULL OR decided_by <> engineer_principal_id),
  CONSTRAINT ssg_window CHECK (state NOT IN ('approved', 'revoked', 'lapsed') OR (starts_at IS NOT NULL AND expires_at IS NOT NULL AND expires_at > starts_at)),
  CONSTRAINT ssg_ended CHECK (state NOT IN ('revoked', 'lapsed', 'withdrawn') OR ended_at IS NOT NULL)
);
CREATE INDEX ssg_live ON service.support_grants (tenant_id, domain_id, engineer_principal_id, state, expires_at);

/* EVERY act under a grant is logged (allowed or refused) with its grant: the audit trail of support access (PR-69-003). Append-only. */
CREATE TABLE service.access_log (
  log_id         uuid PRIMARY KEY,
  scope          text NOT NULL DEFAULT 'DOMAIN' CHECK (scope = 'DOMAIN'),
  tenant_id      uuid NOT NULL,
  domain_id      uuid NOT NULL,
  grant_id       uuid REFERENCES service.support_grants (grant_id),
  principal_id   uuid NOT NULL,
  action         text NOT NULL CHECK (length(btrim(action)) >= 3),
  object_kind    text,
  object_id      text,
  outcome        text NOT NULL CHECK (outcome IN ('allowed', 'refused')),
  detail         jsonb NOT NULL DEFAULT '{}'::jsonb,
  at             timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id uuid NOT NULL,
  CONSTRAINT sal_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX sal_grant ON service.access_log (grant_id, at);
CREATE TRIGGER sal_append_only BEFORE UPDATE OR DELETE ON service.access_log FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

/* THE LIVE-GRANT TEST (every port acting for a support engineer calls it FIRST): the principal's APPROVED, UNEXPIRED grant in the domain
   for the case (when named) whose action scope holds the act and whose object scope holds the object (when named) — its id, or NULL. Read
   against the database clock: an expired grant is dead before any sweep marks it. */
CREATE OR REPLACE FUNCTION service.live_grant(p_tenant uuid, p_domain uuid, p_principal uuid, p_case uuid, p_action text, p_object uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = service, pg_catalog, pg_temp AS $$
  SELECT g.grant_id FROM service.support_grants g
   WHERE g.tenant_id = p_tenant AND g.domain_id = p_domain AND g.engineer_principal_id = p_principal AND g.state = 'approved'
     AND g.starts_at <= clock_timestamp() AND clock_timestamp() < g.expires_at AND p_action = ANY (g.action_scope)
     AND (p_case IS NULL OR g.case_id = p_case)
     AND (p_object IS NULL OR EXISTS (SELECT 1 FROM jsonb_each(g.object_scope) e, jsonb_array_elements_text(CASE WHEN jsonb_typeof(e.value) = 'array' THEN e.value ELSE '[]'::jsonb END) x
                                       WHERE x = p_object::text))
   ORDER BY g.expires_at DESC LIMIT 1
$$;
REVOKE ALL ON FUNCTION service.live_grant(uuid, uuid, uuid, uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION service.live_grant(uuid, uuid, uuid, uuid, text, uuid) TO eye_commit;
/* Log an act under (or refused for want of) a grant (internal: the parts' definer ports). */
CREATE OR REPLACE FUNCTION service.log_access(p_tenant uuid, p_domain uuid, p_grant uuid, p_principal uuid, p_action text, p_object_kind text, p_object_id text, p_outcome text,
                                              p_detail jsonb, p_correlation uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = service, pg_catalog, pg_temp AS $$
DECLARE v uuid := gen_random_uuid();
BEGIN
  INSERT INTO service.access_log (log_id, tenant_id, domain_id, grant_id, principal_id, action, object_kind, object_id, outcome, detail, correlation_id)
  VALUES (v, p_tenant, p_domain, p_grant, p_principal, p_action, p_object_kind, p_object_id, p_outcome, coalesce(p_detail, '{}'::jsonb), p_correlation);
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION service.log_access(uuid, uuid, uuid, uuid, text, text, text, text, jsonb, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION service.log_access(uuid, uuid, uuid, uuid, text, text, text, text, jsonb, uuid) TO eye_commit;

-- RLS and grants: TENANT-scoped rows under `tenant_id = eye_tenant()`; DOMAIN-scoped rows under the domain_isolation idiom (0081); SELECT to
-- eye_app and eye_commit; no write grant — the definer ports write.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['onboarding.events', 'implementation.events', 'service.events'] LOOP
    EXECUTE format('REVOKE ALL ON %s FROM PUBLIC', t);
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', t);
    -- a ledger row of a domain is the domain's; a TENANT row (domain_id NULL) is the tenant's
    EXECUTE format($f$CREATE POLICY tenant_isolation ON %s USING (tenant_id = public.eye_tenant() AND (domain_id IS NULL OR public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain()))$f$,
                   t) ;
    EXECUTE format('GRANT SELECT ON %s TO eye_app, eye_commit', t);
  END LOOP;
  -- a programme is the tenant's (TENANT scope, no domain column)
  REVOKE ALL ON onboarding.programmes FROM PUBLIC;
  ALTER TABLE onboarding.programmes ENABLE ROW LEVEL SECURITY;
  ALTER TABLE onboarding.programmes FORCE ROW LEVEL SECURITY;
  CREATE POLICY tenant_isolation ON onboarding.programmes USING (tenant_id = public.eye_tenant());
  GRANT SELECT ON onboarding.programmes TO eye_app, eye_commit;
  FOREACH t IN ARRAY ARRAY['service.responsibility_matrices', 'service.responsibility_rows', 'service.cases', 'service.support_grants', 'service.access_log'] LOOP
    EXECUTE format('REVOKE ALL ON %s FROM PUBLIC', t);
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$CREATE POLICY domain_isolation ON %s USING (tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain()))$f$, t);
    EXECUTE format('GRANT SELECT ON %s TO eye_app, eye_commit', t);
  END LOOP;
END $$;
