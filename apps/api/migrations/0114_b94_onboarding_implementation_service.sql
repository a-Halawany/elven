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


-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §ON — the onboarding programme, sponsor intent, steps, the draft domain, configuration baselines and drift (F-P7-F-04)
-- (folded at integration from the part-local file 0114_b94_x_on.sql, unchanged but for the marked `B94 integration` edits; apply order §0, §ON, §MG, §IM, §SV, §SA)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0114 §ON — CP-6 B94: THE ONBOARDING PROGRAMME, SPONSOR INTENT, STEPS, THE DRAFT DOMAIN, CONFIGURATION BASELINES AND DRIFT
-- (V1 V01-T-033 [managed configurations]; V8 PR-67-001, PR-67-002 [programme, responsibility pointer, baseline], CAP-DL-04, CAP-DL-05, PER-21
-- [§ON's acts], JRN-01; V9 UX-66-001, UX-66-002, CAP-PD-04, CAP-PD-05). Part-local: applies alone on 0001–0113 + the prelude (0114 §0).
--
-- What this section builds on the prelude's onboarding.programmes and ledger:
--   §ON.1 the programme's ports — open (v1 planned), revise, hold, resume, withdraw; every change a NEW VERSION (digest, effective time); a
--         programme leaves `planned` only with the customer sponsor's recorded intent (JRN-01); accepted is §MG's (its own port, by reading);
--   §ON.2 SPONSOR INTENT — the customer sponsor's own record (a named human holding customer_sponsor; never a lead, never an agent), versioned;
--   §ON.3 STEPS (JRN-01 + JRN-23; reversibility PR-67-001) — a closed list of step keys, each realized by a governed act VALIDATED against its
--         record (a domain of the tenant, a principal, an attention policy version, a source contract, a package version, a workflow
--         definition, a licence/contract version, a responsibility matrix version, a configuration baseline, or a record §MG/§IM ledgered),
--         its evidence and its COMPENSATION (the governed act that reverses it — required for `done`); a revert RECORDS the compensating act by
--         reference and never performs it;
--   §ON.4 THE DRAFT DOMAIN (D4) — tenancy.create_domain_draft: a tenant administrator, the 0019 create_domain idiom, status `draft`, lifecycle
--         `domain.drafted`; the programme's next version names it. tenancy.create_domain (the existing route) is UNCHANGED; activation is §MG's;
--   §ON.5 CONFIGURATION BASELINES (D6, CAP-DL-05) — the digested set of VERSION POINTERS of a domain (attention policy version, approved
--         analytics purposes, active package versions, workflow definitions, active source contracts, the role-binding CENSUS by role — counts,
--         never persons —, the licence version), captured / promoted and proposed by the implementation lead, APPROVED and SIGNED by the
--         onboarding authority (executive.signatures subject kind config_baseline) on the exact digest; DRIFT = the same pointers observed live
--         against the approved baseline (added / removed / changed), recorded only on change with an `onboarding.drift` item; the ROLLBACK
--         PLAN is a read (TypeScript) naming the governed act that restores each drifted pointer — never a direct write.
--
-- THREE CLAIMS: this file is CONSTRUCTION. An approval by a SYNTHETIC persona in the act is DEMONSTRATED OPERATION. Real customer acceptance
-- is R2 and never written here. Production admission and profile parity: R1 / B111.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- §ON.0 VOCABULARY AND GUARDS ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* The step keys, in the order of JRN-01 (context: intent → domain → authority → policy → sources/packages/workflows → licence →
   responsibility → baseline) and JRN-23 (mapping → rehearsal → reconciliation → training → cutover → acceptance). */
CREATE OR REPLACE FUNCTION onboarding.step_keys() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY[
  'intent', 'domain', 'authority', 'policy', 'sources', 'packages', 'workflows', 'licence', 'responsibility', 'baseline',
  'mapping', 'rehearsal', 'reconciliation', 'training', 'cutover', 'acceptance'] $$;
GRANT EXECUTE ON FUNCTION onboarding.step_keys() TO eye_app, eye_commit;

/* The realizing record kinds a step key admits. The `ledgered` kinds are §MG's and §IM's records: validated by their ledger (every governed
   act writes its event), since their tables are not this section's. */
CREATE OR REPLACE FUNCTION onboarding.step_realization_kinds(p_step_key text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_step_key
    WHEN 'intent' THEN ARRAY['sponsor_intent']
    WHEN 'domain' THEN ARRAY['domain']
    WHEN 'authority' THEN ARRAY['principal', 'role_binding']
    WHEN 'policy' THEN ARRAY['attention_policy', 'analytics_purpose']
    WHEN 'sources' THEN ARRAY['source_contract']
    WHEN 'packages' THEN ARRAY['package_version']
    WHEN 'workflows' THEN ARRAY['workflow_definition']
    WHEN 'licence' THEN ARRAY['licence', 'contract']
    WHEN 'responsibility' THEN ARRAY['responsibility_matrix']
    WHEN 'baseline' THEN ARRAY['config_baseline']
    WHEN 'mapping' THEN ARRAY['mapping', 'migration_wave']
    WHEN 'rehearsal' THEN ARRAY['rehearsal', 'migration_wave']
    WHEN 'reconciliation' THEN ARRAY['reconciliation', 'migration_wave']
    WHEN 'training' THEN ARRAY['training_path', 'training_record', 'implementation_programme', 'readiness_gate']
    WHEN 'cutover' THEN ARRAY['cutover', 'migration_wave']
    WHEN 'acceptance' THEN ARRAY['acceptance', 'readiness_gate', 'implementation_programme']
    ELSE ARRAY[]::text[] END $$;
GRANT EXECUTE ON FUNCTION onboarding.step_realization_kinds(text) TO eye_app, eye_commit;
CREATE OR REPLACE FUNCTION onboarding.ledgered_kinds() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY[
  'migration_wave', 'mapping', 'rehearsal', 'reconciliation', 'cutover', 'rollback', 'acceptance', 'training_path', 'training_record',
  'readiness_gate', 'implementation_programme'] $$;

CREATE OR REPLACE FUNCTION onboarding.profiles() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY['local-dev', 'saas', 'private-cloud', 'on-premise'] $$;

/* A versioned row is immutable but for the one supersession stamp (superseded_at NULL → a time); never deleted. */
CREATE OR REPLACE FUNCTION onboarding.on_version_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'table %.% keeps every version (B94 §ON): DELETE prohibited', TG_TABLE_SCHEMA, TG_TABLE_NAME USING ERRCODE = 'raise_exception';
  END IF;
  IF OLD.superseded_at IS NULL AND NEW.superseded_at IS NOT NULL AND (to_jsonb(NEW) - 'superseded_at') = (to_jsonb(OLD) - 'superseded_at') THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'table %.% keeps every version (B94 §ON): a version is immutable; a change is a new version', TG_TABLE_SCHEMA, TG_TABLE_NAME USING ERRCODE = 'raise_exception';
END $$;
-- the prelude's programmes table: §ON writes it — every version kept, only its supersession stamped (B94 on)
CREATE TRIGGER obp_version_guard BEFORE UPDATE OR DELETE ON onboarding.programmes FOR EACH ROW EXECUTE FUNCTION onboarding.on_version_guard();

-- §ON.2 SPONSOR INTENT (table) ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* The customer sponsor's OWN record of why and what (JRN-01): objectives, the scope statement, success measures, constraints, the target
   domain's name and the deployment profile. TENANT-scoped; one intent per programme, versioned (a new version supersedes). */
CREATE TABLE onboarding.sponsor_intents (
  intent_id            uuid NOT NULL,
  version              int  NOT NULL CHECK (version >= 1),
  scope                text NOT NULL DEFAULT 'TENANT' CHECK (scope = 'TENANT'),
  tenant_id            uuid NOT NULL REFERENCES tenancy.tenants (id),
  programme_id         uuid NOT NULL,
  sponsor_principal_id uuid NOT NULL,
  objectives           jsonb NOT NULL CHECK (jsonb_typeof(objectives) = 'array' AND jsonb_array_length(objectives) >= 1),
  scope_statement      text NOT NULL CHECK (length(btrim(scope_statement)) BETWEEN 16 AND 4000),
  success_measures     jsonb NOT NULL CHECK (jsonb_typeof(success_measures) = 'array' AND jsonb_array_length(success_measures) >= 1),
  constraints          jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(constraints) = 'array'),
  target_domain_name   text NOT NULL CHECK (length(btrim(target_domain_name)) BETWEEN 2 AND 200),
  deployment_profile   text NOT NULL CHECK (deployment_profile IN ('local-dev', 'saas', 'private-cloud', 'on-premise')),
  digest               text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  recorded_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  superseded_at        timestamptz,
  correlation_id       uuid NOT NULL,
  PRIMARY KEY (intent_id, version)
);
CREATE UNIQUE INDEX osi_one_current ON onboarding.sponsor_intents (programme_id) WHERE superseded_at IS NULL;
CREATE TRIGGER osi_version_guard BEFORE UPDATE OR DELETE ON onboarding.sponsor_intents FOR EACH ROW EXECUTE FUNCTION onboarding.on_version_guard();

-- §ON.3 STEPS (table) ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* One row per (programme, step key) — the step's CURRENT state; its every change is a ledger event carrying the full snapshot and digest (the
   replay). realized_by = {kind, id, version?, action, label} of the governed act's record (validated); compensation = {action, description}
   (the governed act that reverses the step — required for `done`); reverted_by = the compensating act RECORDED by reference. */
CREATE TABLE onboarding.steps (
  step_id          uuid PRIMARY KEY,
  scope            text NOT NULL DEFAULT 'TENANT' CHECK (scope = 'TENANT'),
  tenant_id        uuid NOT NULL REFERENCES tenancy.tenants (id),
  programme_id     uuid NOT NULL,
  step_key         text NOT NULL CHECK (step_key = ANY (onboarding.step_keys())),
  ordinal          int  NOT NULL CHECK (ordinal >= 1),
  version          int  NOT NULL CHECK (version >= 1),
  state            text NOT NULL DEFAULT 'planned' CHECK (state IN ('planned', 'in_progress', 'done', 'held', 'reverted')),
  realized_by      jsonb CHECK (realized_by IS NULL OR jsonb_typeof(realized_by) = 'object'),
  evidence         jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(evidence) = 'array'),
  compensation     jsonb CHECK (compensation IS NULL OR jsonb_typeof(compensation) = 'object'),
  held_reason      text,
  reverted_by      jsonb CHECK (reverted_by IS NULL OR jsonb_typeof(reverted_by) = 'object'),
  digest           text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  created_by       uuid NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_by       uuid NOT NULL,
  updated_at       timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id   uuid NOT NULL,
  CONSTRAINT ost_once UNIQUE (programme_id, step_key),
  CONSTRAINT ost_done CHECK (state <> 'done' OR (realized_by IS NOT NULL AND compensation IS NOT NULL)),
  CONSTRAINT ost_held CHECK (state <> 'held' OR length(btrim(coalesce(held_reason, ''))) >= 8),
  CONSTRAINT ost_reverted CHECK (state <> 'reverted' OR reverted_by IS NOT NULL)
);
CREATE INDEX ost_programme ON onboarding.steps (programme_id, ordinal);
/* A step is never deleted and never moves to another programme or key. */
CREATE OR REPLACE FUNCTION onboarding.ost_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'onboarding.steps keeps every step (B94 §ON): DELETE prohibited' USING ERRCODE = 'raise_exception'; END IF;
  IF NEW.step_id <> OLD.step_id OR NEW.programme_id <> OLD.programme_id OR NEW.step_key <> OLD.step_key OR NEW.tenant_id <> OLD.tenant_id OR NEW.created_by <> OLD.created_by
     OR NEW.version <> OLD.version + 1 THEN
    RAISE EXCEPTION 'onboarding.steps: a step keeps its identity, programme and key; each change is the next version' USING ERRCODE = 'raise_exception';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER ost_guard BEFORE UPDATE OR DELETE ON onboarding.steps FOR EACH ROW EXECUTE FUNCTION onboarding.ost_guard();

-- §ON.5 CONFIGURATION BASELINES (tables) ────────────────────────────────────────────────────────────────────────────────────────────────────
/* One lineage per domain (baseline_id constant), versioned: draft (captured or promoted by the implementation lead) → proposed → approved
   (the onboarding authority, digest-bound, SIGNED) | rejected; an approved version is superseded when the next is approved. The pointers and
   the digest of a version never change. */
CREATE TABLE onboarding.config_baselines (
  baseline_id      uuid NOT NULL,
  version          int  NOT NULL CHECK (version >= 1),
  scope            text NOT NULL DEFAULT 'DOMAIN' CHECK (scope = 'DOMAIN'),
  tenant_id        uuid NOT NULL,
  domain_id        uuid NOT NULL,
  programme_id     uuid,
  pointers         jsonb NOT NULL CHECK (jsonb_typeof(pointers) = 'object'),
  digest           text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  basis            text NOT NULL CHECK (basis IN ('capture', 'promotion')),
  promoted_from    int,
  absorbed         jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(absorbed) = 'array'),
  state            text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft', 'proposed', 'approved', 'rejected', 'superseded')),
  captured_by      uuid NOT NULL,
  captured_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  proposed_by      uuid,
  proposed_at      timestamptz,
  decided_by       uuid,
  decided_at       timestamptz,
  decision_reason  text,
  signature_id     uuid,
  effective_from   timestamptz,
  superseded_at    timestamptz,
  correlation_id   uuid NOT NULL,
  PRIMARY KEY (baseline_id, version),
  CONSTRAINT ocb_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT ocb_promotion CHECK ((basis = 'promotion') = (promoted_from IS NOT NULL)),
  CONSTRAINT ocb_proposed CHECK (state = 'draft' OR (proposed_by IS NOT NULL AND proposed_at IS NOT NULL)),
  CONSTRAINT ocb_decided CHECK (state IN ('draft', 'proposed') OR (decided_by IS NOT NULL AND decided_at IS NOT NULL AND length(btrim(coalesce(decision_reason, ''))) >= 8)),
  CONSTRAINT ocb_sod CHECK (decided_by IS NULL OR (decided_by <> captured_by AND decided_by <> proposed_by)),
  CONSTRAINT ocb_signed CHECK (state NOT IN ('approved', 'superseded') OR (signature_id IS NOT NULL AND effective_from IS NOT NULL)),
  CONSTRAINT ocb_superseded CHECK ((state = 'superseded') = (superseded_at IS NOT NULL))
);
CREATE UNIQUE INDEX ocb_domain_version ON onboarding.config_baselines (tenant_id, domain_id, version);
CREATE UNIQUE INDEX ocb_one_approved ON onboarding.config_baselines (tenant_id, domain_id) WHERE state = 'approved';
CREATE UNIQUE INDEX ocb_one_open ON onboarding.config_baselines (tenant_id, domain_id) WHERE state IN ('draft', 'proposed');
CREATE OR REPLACE FUNCTION onboarding.ocb_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'onboarding.config_baselines keeps every version (B94 §ON): DELETE prohibited' USING ERRCODE = 'raise_exception'; END IF;
  IF NEW.baseline_id <> OLD.baseline_id OR NEW.version <> OLD.version OR NEW.tenant_id <> OLD.tenant_id OR NEW.domain_id <> OLD.domain_id OR NEW.pointers <> OLD.pointers
     OR NEW.digest <> OLD.digest OR NEW.basis <> OLD.basis OR NEW.captured_by <> OLD.captured_by OR NEW.captured_at <> OLD.captured_at
     OR NEW.absorbed <> OLD.absorbed OR NEW.promoted_from IS DISTINCT FROM OLD.promoted_from THEN
    RAISE EXCEPTION 'onboarding.config_baselines: the pointers and digest of a version never change; a change is a promotion (a new version)' USING ERRCODE = 'raise_exception';
  END IF;
  IF OLD.state IN ('rejected', 'superseded') THEN
    RAISE EXCEPTION 'onboarding.config_baselines: a % version is final', OLD.state USING ERRCODE = 'raise_exception';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER ocb_guard BEFORE UPDATE OR DELETE ON onboarding.config_baselines FOR EACH ROW EXECUTE FUNCTION onboarding.ocb_guard();

/* DRIFT OBSERVATIONS (append-only): recorded only when the observed state against the approved baseline CHANGES (a new drift, a different
   drift, or back in line). */
CREATE TABLE onboarding.drift_events (
  event_id          uuid PRIMARY KEY,
  scope             text NOT NULL DEFAULT 'DOMAIN' CHECK (scope = 'DOMAIN'),
  tenant_id         uuid NOT NULL,
  domain_id         uuid NOT NULL,
  baseline_id       uuid NOT NULL,
  baseline_version  int  NOT NULL,
  baseline_digest   text NOT NULL CHECK (baseline_digest ~ '^[0-9a-f]{64}$'),
  observed_digest   text NOT NULL CHECK (observed_digest ~ '^[0-9a-f]{64}$'),
  state             text NOT NULL CHECK (state IN ('drifted', 'in_sync')),
  changes           jsonb NOT NULL CHECK (jsonb_typeof(changes) = 'array'),
  observed          jsonb NOT NULL CHECK (jsonb_typeof(observed) = 'object'),
  item              jsonb,
  recorded_by       uuid NOT NULL,
  recorded_at       timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id    uuid NOT NULL,
  CONSTRAINT ode_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT ode_changes CHECK ((state = 'drifted') = (jsonb_array_length(changes) > 0))
);
CREATE INDEX ode_domain ON onboarding.drift_events (tenant_id, domain_id, recorded_at DESC);
CREATE TRIGGER ode_append_only BEFORE UPDATE OR DELETE ON onboarding.drift_events FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

-- RLS and grants: TENANT rows under the tenant; DOMAIN rows under the domain_isolation idiom; SELECT to eye_app and eye_commit; no write grant.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['onboarding.sponsor_intents', 'onboarding.steps'] LOOP
    EXECUTE format('REVOKE ALL ON %s FROM PUBLIC', t);
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %s USING (tenant_id = public.eye_tenant())', t);
    EXECUTE format('GRANT SELECT ON %s TO eye_app, eye_commit', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['onboarding.config_baselines', 'onboarding.drift_events'] LOOP
    EXECUTE format('REVOKE ALL ON %s FROM PUBLIC', t);
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$CREATE POLICY domain_isolation ON %s USING (tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain()))$f$, t);
    EXECUTE format('GRANT SELECT ON %s TO eye_app, eye_commit', t);
  END LOOP;
END $$;

-- §ON.1 THE PROGRAMME'S PORTS ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION onboarding.programme_digest(p onboarding.programmes) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = onboarding, pg_catalog, pg_temp AS $$
  SELECT onboarding.digest(jsonb_build_object('programme_id', p.programme_id, 'version', p.version, 'programme_key', p.programme_key, 'title', p.title,
    'target_domain_id', p.target_domain_id, 'deployment_profile', p.deployment_profile, 'owner', p.owner_principal_id, 'state', p.state,
    'held_reasons', p.held_reasons, 'plan', p.plan)) $$;

/* The acting principal's live roles among p_roles (for the record of who held what). */
CREATE OR REPLACE FUNCTION onboarding.roles_held(p_principal uuid, p_tenant uuid, p_domain uuid, p_roles text[]) RETURNS text[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = identity, pg_catalog, pg_temp AS $$
  SELECT coalesce(array_agg(DISTINCT b.role_code ORDER BY b.role_code), '{}') FROM identity.role_bindings b JOIN identity.principals p ON p.id = b.principal_id
   WHERE b.principal_id = p_principal AND p.status = 'active' AND b.revoked_at IS NULL AND b.role_code = ANY (p_roles) AND b.tenant_id = p_tenant
     AND (b.scope = 'TENANT' OR (b.scope = 'DOMAIN' AND p_domain IS NOT NULL AND b.domain_id = p_domain)) $$;
REVOKE ALL ON FUNCTION onboarding.roles_held(uuid, uuid, uuid, text[]) FROM PUBLIC;

/* The common head of every §ON TENANT port: the bound action, the tenant context, the acting principal, one of the roles. */
CREATE OR REPLACE FUNCTION onboarding._on_tenant_head(p_action text, p_noun text, p_tenant uuid, p_actor uuid, p_roles text[], p_what text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = onboarding, observation, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_authority(ARRAY[p_action]);
  PERFORM onboarding.assert_tenant(p_tenant, p_noun);
  IF p_actor IS NULL OR p_actor IS DISTINCT FROM public.eye_principal() THEN
    RAISE EXCEPTION '% rejected (actor): the act is recorded under the acting principal', p_noun USING ERRCODE = '42501';
  END IF;
  IF NOT onboarding.holds_role(p_actor, p_tenant, NULL, p_roles) THEN
    RAISE EXCEPTION '% rejected (authority): % is the act of a %', p_noun, p_what, array_to_string(p_roles, ' or ') USING ERRCODE = '42501';
  END IF;
END $$;
REVOKE ALL ON FUNCTION onboarding._on_tenant_head(text, text, uuid, uuid, text[], text) FROM PUBLIC;

/* The next version of a programme (internal): the current version superseded, the next inserted with its digest, the ledger written. */
CREATE OR REPLACE FUNCTION onboarding._programme_next(cur onboarding.programmes, p_title text, p_target uuid, p_profile text, p_state text, p_held jsonb, p_plan jsonb,
                                                     p_event text, p_actor uuid, p_details jsonb, p_correlation uuid) RETURNS onboarding.programmes
LANGUAGE plpgsql SECURITY DEFINER SET search_path = onboarding, pg_catalog, pg_temp AS $$
DECLARE n onboarding.programmes%ROWTYPE;
BEGIN
  UPDATE onboarding.programmes SET superseded_at = clock_timestamp() WHERE programme_id = cur.programme_id AND version = cur.version;
  n := cur;
  n.version := cur.version + 1; n.title := p_title; n.target_domain_id := p_target; n.deployment_profile := p_profile; n.state := p_state;
  n.held_reasons := p_held; n.plan := p_plan; n.effective_from := clock_timestamp(); n.superseded_at := NULL; n.created_by := p_actor;
  n.created_at := clock_timestamp(); n.correlation_id := p_correlation;
  n.digest := onboarding.programme_digest(n);
  INSERT INTO onboarding.programmes VALUES (n.*);
  PERFORM onboarding.ledger('onboarding', n.tenant_id, NULL, 'onboarding_programme', n.programme_id, n.version, p_event, p_actor,
            coalesce(p_details, '{}'::jsonb) || jsonb_build_object('state', n.state, 'digest', n.digest, 'prior_version', cur.version, 'prior_state', cur.state,
                                                                 'target_domain_id', n.target_domain_id, 'held_reasons', n.held_reasons), p_correlation);
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION onboarding._programme_next(onboarding.programmes, text, uuid, text, text, jsonb, jsonb, text, uuid, jsonb, uuid) FROM PUBLIC;

/* The current version of a programme of the tenant, locked (404 when unknown). */
CREATE OR REPLACE FUNCTION onboarding._programme_current(p_programme uuid, p_tenant uuid, p_noun text) RETURNS onboarding.programmes
LANGUAGE plpgsql SECURITY DEFINER SET search_path = onboarding, pg_catalog, pg_temp AS $$
DECLARE p onboarding.programmes%ROWTYPE;
BEGIN
  SELECT * INTO p FROM onboarding.programmes x WHERE x.programme_id = p_programme AND x.tenant_id = p_tenant AND x.superseded_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '% rejected (unknown_programme): % is not an onboarding programme of this tenant', p_noun, p_programme USING ERRCODE = '22023'; END IF;
  RETURN p;
END $$;
REVOKE ALL ON FUNCTION onboarding._programme_current(uuid, uuid, text) FROM PUBLIC;

/* OPEN (onboarding.programme.open): an implementation lead or the tenant administrator opens v1 `planned`; the owner (the opener unless named)
   holds one of those roles. TENANT-scoped. */
CREATE OR REPLACE FUNCTION onboarding.open_programme(p_programme uuid, p_tenant uuid, p_key text, p_title text, p_profile text, p_plan jsonb, p_owner uuid,
                                                    p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = onboarding, observation, public, pg_catalog, pg_temp AS $$
DECLARE n onboarding.programmes%ROWTYPE; v_owner uuid := coalesce(p_owner, p_actor);
BEGIN
  PERFORM onboarding._on_tenant_head('onboarding.programme.open', 'onboarding programme', p_tenant, p_actor, ARRAY['implementation_lead', 'tenant_admin'], 'opening an onboarding programme');
  IF NOT onboarding.holds_role(v_owner, p_tenant, NULL, ARRAY['implementation_lead', 'tenant_admin']) THEN
    RAISE EXCEPTION 'onboarding programme rejected (ownership): the owner of a programme is an active implementation lead or tenant administrator of the tenant' USING ERRCODE = '42501';
  END IF;
  IF p_key IS NULL OR p_key !~ '^[a-z][a-z0-9_.-]{2,62}$' THEN RAISE EXCEPTION 'onboarding programme rejected (key): a programme key is 3–63 lower-case characters (a-z 0-9 _ . -)' USING ERRCODE = '22023'; END IF;
  IF p_title IS NULL OR length(btrim(p_title)) NOT BETWEEN 4 AND 200 THEN RAISE EXCEPTION 'onboarding programme rejected (title): a title of 4–200 characters' USING ERRCODE = '22023'; END IF;
  IF coalesce(p_profile, 'local-dev') <> ALL (onboarding.profiles()) THEN RAISE EXCEPTION 'onboarding programme rejected (profile): the deployment profile is one of %', array_to_string(onboarding.profiles(), ', ') USING ERRCODE = '22023'; END IF;
  IF p_plan IS NOT NULL AND jsonb_typeof(p_plan) <> 'object' THEN RAISE EXCEPTION 'onboarding programme rejected (plan): the plan is an object' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM onboarding.programmes x WHERE x.tenant_id = p_tenant AND x.programme_key = p_key AND x.superseded_at IS NULL) THEN
    RAISE EXCEPTION 'onboarding programme rejected (duplicate): the tenant already has a programme %', p_key USING ERRCODE = '22023';
  END IF;
  n.programme_id := p_programme; n.version := 1; n.scope := 'TENANT'; n.tenant_id := p_tenant; n.programme_key := p_key; n.title := btrim(p_title);
  n.target_domain_id := NULL; n.deployment_profile := coalesce(p_profile, 'local-dev'); n.owner_principal_id := v_owner; n.state := 'planned';
  n.held_reasons := '[]'::jsonb; n.plan := coalesce(p_plan, '{}'::jsonb); n.effective_from := clock_timestamp(); n.superseded_at := NULL;
  n.created_by := p_actor; n.created_at := clock_timestamp(); n.correlation_id := p_correlation;
  n.digest := onboarding.programme_digest(n);
  INSERT INTO onboarding.programmes VALUES (n.*);
  PERFORM onboarding.ledger('onboarding', p_tenant, NULL, 'onboarding_programme', p_programme, 1, 'programme.opened', p_actor,
            jsonb_build_object('state', 'planned', 'digest', n.digest, 'programme_key', p_key, 'title', n.title, 'owner', v_owner, 'deployment_profile', n.deployment_profile), p_correlation);
  RETURN to_jsonb(n);
END $$;
REVOKE ALL ON FUNCTION onboarding.open_programme(uuid, uuid, text, text, text, jsonb, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION onboarding.open_programme(uuid, uuid, text, text, text, jsonb, uuid, uuid, uuid) TO eye_commit;

/* REVISE (onboarding.programme.revise): the title, plan or deployment profile — a new version; the version read is named (stale → 409). */
CREATE OR REPLACE FUNCTION onboarding.revise_programme(p_programme uuid, p_tenant uuid, p_expected int, p_title text, p_plan jsonb, p_profile text, p_reason text,
                                                      p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = onboarding, observation, public, pg_catalog, pg_temp AS $$
DECLARE p onboarding.programmes%ROWTYPE; n onboarding.programmes%ROWTYPE; v_changed text[] := '{}';
BEGIN
  PERFORM onboarding._on_tenant_head('onboarding.programme.revise', 'onboarding programme', p_tenant, p_actor, ARRAY['implementation_lead', 'tenant_admin'], 'revising an onboarding programme');
  p := onboarding._programme_current(p_programme, p_tenant, 'onboarding programme');
  IF p.state IN ('withdrawn', 'accepted') THEN RAISE EXCEPTION 'onboarding programme rejected (state): programme % is %; it is not revised', p.programme_key, p.state USING ERRCODE = '22023'; END IF;
  IF p_expected IS DISTINCT FROM p.version THEN RAISE EXCEPTION 'onboarding programme rejected (stale): the revision names v%, the programme is at v%', coalesce(p_expected::text, '?'), p.version USING ERRCODE = '22023'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN RAISE EXCEPTION 'onboarding programme rejected (reason): a revision states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  IF p_title IS NOT NULL AND length(btrim(p_title)) NOT BETWEEN 4 AND 200 THEN RAISE EXCEPTION 'onboarding programme rejected (title): a title of 4–200 characters' USING ERRCODE = '22023'; END IF;
  IF p_profile IS NOT NULL AND p_profile <> ALL (onboarding.profiles()) THEN RAISE EXCEPTION 'onboarding programme rejected (profile): the deployment profile is one of %', array_to_string(onboarding.profiles(), ', ') USING ERRCODE = '22023'; END IF;
  IF p_plan IS NOT NULL AND jsonb_typeof(p_plan) <> 'object' THEN RAISE EXCEPTION 'onboarding programme rejected (plan): the plan is an object' USING ERRCODE = '22023'; END IF;
  IF p_title IS NOT NULL AND btrim(p_title) <> p.title THEN v_changed := array_append(v_changed, 'title'); END IF;
  IF p_plan IS NOT NULL AND p_plan <> p.plan THEN v_changed := array_append(v_changed, 'plan'); END IF;
  IF p_profile IS NOT NULL AND p_profile <> p.deployment_profile THEN v_changed := array_append(v_changed, 'deployment_profile'); END IF;
  IF cardinality(v_changed) = 0 THEN RAISE EXCEPTION 'onboarding programme rejected (unchanged): the revision changes nothing of v%', p.version USING ERRCODE = '22023'; END IF;
  n := onboarding._programme_next(p, coalesce(btrim(p_title), p.title), p.target_domain_id, coalesce(p_profile, p.deployment_profile), p.state, p.held_reasons, coalesce(p_plan, p.plan),
                                  'programme.revised', p_actor, jsonb_build_object('reason', btrim(p_reason), 'changed', to_jsonb(v_changed)), p_correlation);
  RETURN to_jsonb(n);
END $$;
REVOKE ALL ON FUNCTION onboarding.revise_programme(uuid, uuid, int, text, jsonb, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION onboarding.revise_programme(uuid, uuid, int, text, jsonb, text, text, uuid, uuid) TO eye_commit;

/* HOLD (onboarding.programme.hold): any accountable party (the lead, the tenant administrator, the customer sponsor, the onboarding
   authority) holds the programme with a reason; a held programme records no step. Holding a held programme adds a reason. */
CREATE OR REPLACE FUNCTION onboarding.hold_programme(p_programme uuid, p_tenant uuid, p_expected int, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = onboarding, observation, public, pg_catalog, pg_temp AS $$
DECLARE p onboarding.programmes%ROWTYPE; n onboarding.programmes%ROWTYPE;
        v_roles text[] := ARRAY['implementation_lead', 'tenant_admin', 'customer_sponsor', 'onboarding_authority'];
BEGIN
  PERFORM onboarding._on_tenant_head('onboarding.programme.hold', 'onboarding programme', p_tenant, p_actor, v_roles, 'holding an onboarding programme');
  p := onboarding._programme_current(p_programme, p_tenant, 'onboarding programme');
  IF p.state IN ('withdrawn', 'accepted') THEN RAISE EXCEPTION 'onboarding programme rejected (state): programme % is %; it is not held', p.programme_key, p.state USING ERRCODE = '22023'; END IF;
  IF p_expected IS DISTINCT FROM p.version THEN RAISE EXCEPTION 'onboarding programme rejected (stale): the hold names v%, the programme is at v%', coalesce(p_expected::text, '?'), p.version USING ERRCODE = '22023'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN RAISE EXCEPTION 'onboarding programme rejected (reason): a hold states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  n := onboarding._programme_next(p, p.title, p.target_domain_id, p.deployment_profile, 'held',
          p.held_reasons || jsonb_build_array(jsonb_build_object('reason', btrim(p_reason), 'held_by', p_actor, 'held_by_roles', to_jsonb(onboarding.roles_held(p_actor, p_tenant, NULL, v_roles)),
                                                                  'held_at', clock_timestamp(), 'state_before', CASE WHEN p.state = 'held' THEN NULL ELSE p.state END)),
          p.plan, 'programme.held', p_actor, jsonb_build_object('reason', btrim(p_reason)), p_correlation);
  RETURN to_jsonb(n);
END $$;
REVOKE ALL ON FUNCTION onboarding.hold_programme(uuid, uuid, int, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION onboarding.hold_programme(uuid, uuid, int, text, uuid, uuid) TO eye_commit;

/* RESUME (onboarding.programme.resume): a held programme returns to the state it held from (planned → planned; otherwise in_progress). A hold
   placed by the customer's sponsor or authority is released only by the customer's sponsor or authority (adoption never bypasses authority). */
CREATE OR REPLACE FUNCTION onboarding.resume_programme(p_programme uuid, p_tenant uuid, p_expected int, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = onboarding, observation, public, pg_catalog, pg_temp AS $$
DECLARE p onboarding.programmes%ROWTYPE; n onboarding.programmes%ROWTYPE; v_to text;
        v_roles text[] := ARRAY['implementation_lead', 'tenant_admin', 'customer_sponsor', 'onboarding_authority'];
BEGIN
  PERFORM onboarding._on_tenant_head('onboarding.programme.resume', 'onboarding programme', p_tenant, p_actor, v_roles, 'resuming an onboarding programme');
  p := onboarding._programme_current(p_programme, p_tenant, 'onboarding programme');
  IF p.state <> 'held' THEN RAISE EXCEPTION 'onboarding programme rejected (state): programme % is %, not held', p.programme_key, p.state USING ERRCODE = '22023'; END IF;
  IF p_expected IS DISTINCT FROM p.version THEN RAISE EXCEPTION 'onboarding programme rejected (stale): the resumption names v%, the programme is at v%', coalesce(p_expected::text, '?'), p.version USING ERRCODE = '22023'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN RAISE EXCEPTION 'onboarding programme rejected (reason): a resumption states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p.held_reasons) h WHERE (h -> 'held_by_roles') ?| ARRAY['customer_sponsor', 'onboarding_authority'])
     AND NOT onboarding.holds_role(p_actor, p_tenant, NULL, ARRAY['customer_sponsor', 'onboarding_authority']) THEN
    RAISE EXCEPTION 'onboarding programme rejected (separation_of_duties): a hold placed by the customer''s sponsor or onboarding authority is released only by the customer''s sponsor or authority' USING ERRCODE = '42501';
  END IF;
  SELECT coalesce((SELECT h ->> 'state_before' FROM jsonb_array_elements(p.held_reasons) WITH ORDINALITY x(h, i) WHERE h ->> 'state_before' IS NOT NULL ORDER BY i LIMIT 1), 'planned') INTO v_to;
  n := onboarding._programme_next(p, p.title, p.target_domain_id, p.deployment_profile, v_to, '[]'::jsonb, p.plan, 'programme.resumed', p_actor,
                                  jsonb_build_object('reason', btrim(p_reason), 'released', p.held_reasons), p_correlation);
  RETURN to_jsonb(n);
END $$;
REVOKE ALL ON FUNCTION onboarding.resume_programme(uuid, uuid, int, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION onboarding.resume_programme(uuid, uuid, int, text, uuid, uuid) TO eye_commit;

/* WITHDRAW (onboarding.programme.withdraw — human-gated): the customer sponsor or the tenant administrator, a named human, ends the programme.
   Final. A draft domain it created stays draft (never activated). */
CREATE OR REPLACE FUNCTION onboarding.withdraw_programme(p_programme uuid, p_tenant uuid, p_expected int, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = onboarding, observation, public, pg_catalog, pg_temp AS $$
DECLARE p onboarding.programmes%ROWTYPE; n onboarding.programmes%ROWTYPE;
BEGIN
  PERFORM onboarding._on_tenant_head('onboarding.programme.withdraw', 'onboarding programme', p_tenant, p_actor, ARRAY['customer_sponsor', 'tenant_admin'], 'withdrawing an onboarding programme');
  IF onboarding.principal_kind(p_actor) IS DISTINCT FROM 'human' THEN
    RAISE EXCEPTION 'onboarding programme rejected (actor): withdrawing a programme is a named human''s act' USING ERRCODE = '42501';
  END IF;
  p := onboarding._programme_current(p_programme, p_tenant, 'onboarding programme');
  IF p.state IN ('withdrawn', 'accepted') THEN RAISE EXCEPTION 'onboarding programme rejected (state): programme % is already %', p.programme_key, p.state USING ERRCODE = '22023'; END IF;
  IF p_expected IS DISTINCT FROM p.version THEN RAISE EXCEPTION 'onboarding programme rejected (stale): the withdrawal names v%, the programme is at v%', coalesce(p_expected::text, '?'), p.version USING ERRCODE = '22023'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN RAISE EXCEPTION 'onboarding programme rejected (reason): a withdrawal states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  n := onboarding._programme_next(p, p.title, p.target_domain_id, p.deployment_profile, 'withdrawn', '[]'::jsonb, p.plan, 'programme.withdrawn', p_actor,
                                  jsonb_build_object('reason', btrim(p_reason)), p_correlation);
  RETURN to_jsonb(n);
END $$;
REVOKE ALL ON FUNCTION onboarding.withdraw_programme(uuid, uuid, int, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION onboarding.withdraw_programme(uuid, uuid, int, text, uuid, uuid) TO eye_commit;

-- §ON.2 SPONSOR INTENT (port) ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* RECORD (onboarding.intent.record — human-gated): the CUSTOMER SPONSOR's own record — a named active human holding customer_sponsor, never an
   implementation lead (even one also holding the sponsor role), never an agent. The intent version read is named (0 for the first). */
CREATE OR REPLACE FUNCTION onboarding.record_intent(p_tenant uuid, p_programme uuid, p_expected int, p_objectives jsonb, p_scope text, p_measures jsonb, p_constraints jsonb,
                                                   p_target_name text, p_profile text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = onboarding, observation, public, pg_catalog, pg_temp AS $$
DECLARE p onboarding.programmes%ROWTYPE; cur onboarding.sponsor_intents%ROWTYPE; n onboarding.sponsor_intents%ROWTYPE; v_bad int;
BEGIN
  PERFORM onboarding._on_tenant_head('onboarding.intent.record', 'sponsor intent', p_tenant, p_actor, ARRAY['customer_sponsor'], 'the sponsor intent');
  IF onboarding.principal_kind(p_actor) IS DISTINCT FROM 'human' THEN
    RAISE EXCEPTION 'sponsor intent rejected (actor): the sponsor intent is a named human sponsor''s own record; an agent never records it' USING ERRCODE = '42501';
  END IF;
  IF onboarding.holds_role(p_actor, p_tenant, NULL, ARRAY['implementation_lead']) THEN
    RAISE EXCEPTION 'sponsor intent rejected (separation_of_duties): an implementation lead never records the customer sponsor''s intent' USING ERRCODE = '42501';
  END IF;
  p := onboarding._programme_current(p_programme, p_tenant, 'sponsor intent');
  IF p.state IN ('withdrawn', 'accepted') THEN RAISE EXCEPTION 'sponsor intent rejected (state): programme % is %', p.programme_key, p.state USING ERRCODE = '22023'; END IF;
  SELECT * INTO cur FROM onboarding.sponsor_intents i WHERE i.programme_id = p_programme AND i.tenant_id = p_tenant AND i.superseded_at IS NULL FOR UPDATE;
  IF coalesce(p_expected, -1) <> coalesce(cur.version, 0) THEN
    RAISE EXCEPTION 'sponsor intent rejected (stale): the record names intent v%, the programme''s intent is at v%', coalesce(p_expected::text, '?'), coalesce(cur.version, 0) USING ERRCODE = '22023';
  END IF;
  IF p_objectives IS NULL OR jsonb_typeof(p_objectives) <> 'array' OR jsonb_array_length(p_objectives) = 0 THEN
    RAISE EXCEPTION 'sponsor intent rejected (objectives): the intent names at least one objective' USING ERRCODE = '22023';
  END IF;
  SELECT count(*) INTO v_bad FROM jsonb_array_elements(p_objectives) o WHERE jsonb_typeof(o) <> 'string' OR length(btrim(o #>> '{}')) < 4;
  IF v_bad > 0 THEN RAISE EXCEPTION 'sponsor intent rejected (objectives): each objective is a statement of 4+ characters' USING ERRCODE = '22023'; END IF;
  IF p_scope IS NULL OR length(btrim(p_scope)) NOT BETWEEN 16 AND 4000 THEN RAISE EXCEPTION 'sponsor intent rejected (scope): the scope statement is 16–4000 characters' USING ERRCODE = '22023'; END IF;
  IF p_measures IS NULL OR jsonb_typeof(p_measures) <> 'array' OR jsonb_array_length(p_measures) = 0 THEN
    RAISE EXCEPTION 'sponsor intent rejected (success_measures): the intent names at least one success measure' USING ERRCODE = '22023';
  END IF;
  SELECT count(*) INTO v_bad FROM jsonb_array_elements(p_measures) o WHERE jsonb_typeof(o) <> 'string' OR length(btrim(o #>> '{}')) < 4;
  IF v_bad > 0 THEN RAISE EXCEPTION 'sponsor intent rejected (success_measures): each success measure is a statement of 4+ characters' USING ERRCODE = '22023'; END IF;
  IF p_constraints IS NOT NULL AND jsonb_typeof(p_constraints) <> 'array' THEN RAISE EXCEPTION 'sponsor intent rejected (constraints): constraints are a list' USING ERRCODE = '22023'; END IF;
  IF p_target_name IS NULL OR length(btrim(p_target_name)) NOT BETWEEN 2 AND 200 THEN RAISE EXCEPTION 'sponsor intent rejected (target): the target domain''s name is 2–200 characters' USING ERRCODE = '22023'; END IF;
  IF p_profile IS NULL OR p_profile <> ALL (onboarding.profiles()) THEN RAISE EXCEPTION 'sponsor intent rejected (profile): the deployment profile is one of %', array_to_string(onboarding.profiles(), ', ') USING ERRCODE = '22023'; END IF;
  IF cur.intent_id IS NOT NULL THEN UPDATE onboarding.sponsor_intents SET superseded_at = clock_timestamp() WHERE intent_id = cur.intent_id AND version = cur.version; END IF;
  n.intent_id := coalesce(cur.intent_id, gen_random_uuid()); n.version := coalesce(cur.version, 0) + 1; n.scope := 'TENANT'; n.tenant_id := p_tenant; n.programme_id := p_programme;
  n.sponsor_principal_id := p_actor; n.objectives := p_objectives; n.scope_statement := btrim(p_scope); n.success_measures := p_measures;
  n.constraints := coalesce(p_constraints, '[]'::jsonb); n.target_domain_name := btrim(p_target_name); n.deployment_profile := p_profile;
  n.recorded_at := clock_timestamp(); n.superseded_at := NULL; n.correlation_id := p_correlation;
  n.digest := onboarding.digest(jsonb_build_object('programme_id', p_programme, 'version', n.version, 'sponsor', p_actor, 'objectives', n.objectives, 'scope_statement', n.scope_statement,
                                                   'success_measures', n.success_measures, 'constraints', n.constraints, 'target_domain_name', n.target_domain_name, 'deployment_profile', n.deployment_profile));
  INSERT INTO onboarding.sponsor_intents VALUES (n.*);
  PERFORM onboarding.ledger('onboarding', p_tenant, NULL, 'sponsor_intent', n.intent_id, n.version, 'intent.recorded', p_actor,
            jsonb_build_object('programme_id', p_programme, 'digest', n.digest, 'supersedes', cur.version), p_correlation);
  RETURN to_jsonb(n);
END $$;
REVOKE ALL ON FUNCTION onboarding.record_intent(uuid, uuid, int, jsonb, text, jsonb, jsonb, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION onboarding.record_intent(uuid, uuid, int, jsonb, text, jsonb, jsonb, text, text, uuid, uuid) TO eye_commit;

-- §ON.3 STEPS (ports) ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION onboarding.step_digest(s onboarding.steps) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = onboarding, pg_catalog, pg_temp AS $$
  SELECT onboarding.digest(jsonb_build_object('step_id', s.step_id, 'programme_id', s.programme_id, 'version', s.version, 'step_key', s.step_key, 'state', s.state,
    'realized_by', s.realized_by, 'evidence', s.evidence, 'compensation', s.compensation, 'held_reason', s.held_reason, 'reverted_by', s.reverted_by)) $$;

/* A compensation: {action (a governed action name), description (8+)}. */
CREATE OR REPLACE FUNCTION onboarding._compensation(p jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path = onboarding, pg_catalog, pg_temp AS $$
BEGIN
  IF p IS NULL THEN RETURN NULL; END IF;
  IF jsonb_typeof(p) <> 'object' OR coalesce(p ->> 'action', '') !~ '^[a-z][a-z_]*(\.[a-z_]+)+$' OR length(btrim(coalesce(p ->> 'description', ''))) < 8 THEN
    RAISE EXCEPTION 'onboarding step rejected (compensation): a compensation names the governed act that reverses the step {action, description (8+ characters)}' USING ERRCODE = '22023';
  END IF;
  RETURN jsonb_build_object('action', p ->> 'action', 'description', btrim(p ->> 'description'));
END $$;

/* THE REALIZATION TEST: a reference {kind, id, version?, action} to the record of the governed act, validated against that record IN THIS TENANT
   (p_step_key NULL: any kind — a revert's compensating act). Answers the reference normalized (the version filled from the record). */
CREATE OR REPLACE FUNCTION onboarding.validate_reference(p_tenant uuid, p_programme onboarding.programmes, p_step_key text, p_ref jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = onboarding, pg_catalog, pg_temp AS $$
DECLARE v_kind text; v_id uuid; v_ver int; v_action text; v_label text; v_ok boolean := false; v_noun text := 'onboarding step';
        v_kinds text[];
BEGIN
  IF p_ref IS NULL OR jsonb_typeof(p_ref) <> 'object' THEN RAISE EXCEPTION 'onboarding step rejected (realized_by): a reference is {kind, id, version?, action}' USING ERRCODE = '22023'; END IF;
  v_kind := p_ref ->> 'kind'; v_action := p_ref ->> 'action';
  v_kinds := CASE WHEN p_step_key IS NULL
                  THEN ARRAY['sponsor_intent', 'domain', 'principal', 'role_binding', 'attention_policy', 'analytics_purpose', 'source_contract', 'package_version',
                             'workflow_definition', 'licence', 'contract', 'responsibility_matrix', 'config_baseline', 'ledger_event'] || onboarding.ledgered_kinds()
                  ELSE onboarding.step_realization_kinds(p_step_key) END;
  IF v_kind IS NULL OR NOT (v_kind = ANY (v_kinds)) THEN
    RAISE EXCEPTION 'onboarding step rejected (realized_by): %step % is realized by a % — not %', CASE WHEN p_step_key IS NULL THEN 'a compensating act of a ' ELSE '' END,
      coalesce(p_step_key, 'reverted'), array_to_string(v_kinds, ' or '), coalesce(v_kind, '<none>') USING ERRCODE = '22023';
  END IF;
  IF coalesce(p_ref ->> 'id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'onboarding step rejected (realized_by): the reference names the record''s id' USING ERRCODE = '22023';
  END IF;
  IF coalesce(v_action, '') !~ '^[a-z][a-z_]*(\.[a-z_]+)+$' THEN
    RAISE EXCEPTION 'onboarding step rejected (realized_by): the reference names the governed action that produced the record' USING ERRCODE = '22023';
  END IF;
  v_id := (p_ref ->> 'id')::uuid;
  IF p_ref ? 'version' AND p_ref ->> 'version' IS NOT NULL THEN
    IF (p_ref ->> 'version') !~ '^[0-9]{1,9}$' THEN RAISE EXCEPTION 'onboarding step rejected (realized_by): a version is a positive integer' USING ERRCODE = '22023'; END IF;
    v_ver := (p_ref ->> 'version')::int;
  END IF;
  IF v_kind IN ('source_contract', 'package_version', 'licence', 'contract', 'responsibility_matrix', 'config_baseline') AND v_ver IS NULL THEN
    RAISE EXCEPTION 'onboarding step rejected (realized_by): a % reference names its version', v_kind USING ERRCODE = '22023';
  END IF;
  CASE v_kind
    WHEN 'sponsor_intent' THEN
      SELECT i.version, 'sponsor intent v' || i.version INTO v_ver, v_label FROM onboarding.sponsor_intents i
       WHERE i.intent_id = v_id AND i.tenant_id = p_tenant AND i.programme_id = p_programme.programme_id AND i.superseded_at IS NULL;
      v_ok := FOUND;
    WHEN 'domain' THEN
      SELECT NULL::int, d.name || ' (' || d.status || ')' INTO v_ver, v_label FROM tenancy.domains d WHERE d.id = v_id AND d.tenant_id = p_tenant;
      v_ok := FOUND;
      IF v_ok AND p_step_key = 'domain' AND p_programme.target_domain_id IS NOT NULL AND p_programme.target_domain_id <> v_id THEN
        RAISE EXCEPTION 'onboarding step rejected (realized_by): the programme''s target domain is %, not %', p_programme.target_domain_id, v_id USING ERRCODE = '22023';
      END IF;
    WHEN 'principal' THEN
      SELECT NULL::int, p.display_name INTO v_ver, v_label FROM identity.principals p WHERE p.id = v_id AND p.tenant_id = p_tenant AND p.status = 'active';
      v_ok := FOUND;
    WHEN 'role_binding' THEN
      SELECT NULL::int, b.role_code || ' (' || b.scope || ')' INTO v_ver, v_label FROM identity.role_bindings b WHERE b.id = v_id AND b.tenant_id = p_tenant AND b.revoked_at IS NULL;
      v_ok := FOUND;
    WHEN 'attention_policy' THEN
      SELECT a.version, 'attention policy v' || a.version INTO v_ver, v_label FROM executive.attention_policies a WHERE a.policy_id = v_id AND a.tenant_id = p_tenant;
      v_ok := FOUND;
    WHEN 'analytics_purpose' THEN
      SELECT a.version, a.purpose_key || ' v' || a.version INTO v_ver, v_label FROM analytics.purposes a WHERE a.purpose_id = v_id AND a.tenant_id = p_tenant AND a.state IN ('approved', 'superseded');
      v_ok := FOUND;
    WHEN 'source_contract' THEN
      SELECT s.contract_version, s.source_key || ' v' || s.contract_version INTO v_ver, v_label FROM observation.source_contracts_current s
       WHERE s.source_id = v_id AND s.contract_version = v_ver AND s.tenant_id = p_tenant;
      v_ok := FOUND;
    WHEN 'package_version' THEN
      SELECT v.version, k.package_key || ' ' || v.semver || ' (' || v.state || ')' INTO v_ver, v_label FROM domain.package_versions v JOIN domain.packages k ON k.package_id = v.package_id
       WHERE v.package_id = v_id AND v.version = v_ver AND v.tenant_id = p_tenant;
      v_ok := FOUND;
    WHEN 'workflow_definition' THEN
      SELECT w.version, w.def_key || ' v' || w.version INTO v_ver, v_label FROM executive.workflow_definitions w WHERE w.definition_id = v_id AND w.tenant_id = p_tenant;
      v_ok := FOUND;
    WHEN 'licence' THEN
      SELECT l.version, l.package_key || ' v' || l.version || ' (' || l.state || ')' INTO v_ver, v_label FROM commercial.licences l WHERE l.licence_id = v_id AND l.version = v_ver AND l.tenant_id = p_tenant;
      v_ok := FOUND;
    WHEN 'contract' THEN
      SELECT c.version, c.contract_ref || ' v' || c.version INTO v_ver, v_label FROM commercial.contracts c WHERE c.contract_id = v_id AND c.version = v_ver AND c.tenant_id = p_tenant;
      v_ok := FOUND;
    WHEN 'responsibility_matrix' THEN
      SELECT m.version, 'responsibility matrix v' || m.version || ' (' || m.state || ')' INTO v_ver, v_label FROM service.responsibility_matrices m
       WHERE m.matrix_id = v_id AND m.version = v_ver AND m.tenant_id = p_tenant AND m.state IN ('approved', 'superseded');
      v_ok := FOUND;
      IF NOT v_ok THEN RAISE EXCEPTION 'onboarding step rejected (realized_by): responsibility matrix %/v% is not an approved matrix of this tenant', v_id, v_ver USING ERRCODE = '22023'; END IF;
    WHEN 'config_baseline' THEN
      SELECT b.version, 'configuration baseline v' || b.version || ' (' || b.state || ')' INTO v_ver, v_label FROM onboarding.config_baselines b
       WHERE b.baseline_id = v_id AND b.version = v_ver AND b.tenant_id = p_tenant AND b.state IN ('approved', 'superseded');
      v_ok := FOUND;
      IF NOT v_ok THEN RAISE EXCEPTION 'onboarding step rejected (realized_by): configuration baseline %/v% is not an approved (signed) baseline of this tenant', v_id, v_ver USING ERRCODE = '22023'; END IF;
    WHEN 'ledger_event' THEN
      SELECT NULL::int, e.event INTO v_ver, v_label FROM (SELECT x.event, x.tenant_id FROM onboarding.events x WHERE x.event_id = v_id
                                                          UNION ALL SELECT x.event, x.tenant_id FROM implementation.events x WHERE x.event_id = v_id
                                                          UNION ALL SELECT x.event, x.tenant_id FROM service.events x WHERE x.event_id = v_id) e WHERE e.tenant_id = p_tenant LIMIT 1;
      v_ok := FOUND;
    ELSE
      -- §MG's / §IM's records: validated by their ledger (every governed act writes its event)
      SELECT coalesce(v_ver, e.version), e.subject_kind || ' · ' || e.event INTO v_ver, v_label
        FROM (SELECT x.subject_kind, x.event, x.version, x.occurred_at FROM onboarding.events x WHERE x.subject_id = v_id AND x.tenant_id = p_tenant
              UNION ALL SELECT x.subject_kind, x.event, x.version, x.occurred_at FROM implementation.events x WHERE x.subject_id = v_id AND x.tenant_id = p_tenant) e
       ORDER BY e.occurred_at DESC LIMIT 1;
      v_ok := FOUND;
  END CASE;
  IF NOT v_ok THEN
    RAISE EXCEPTION 'onboarding step rejected (unknown_record): no % % is recorded in this tenant', v_kind, v_id || CASE WHEN v_ver IS NULL THEN '' ELSE ' v' || v_ver END USING ERRCODE = '22023';
  END IF;
  RETURN jsonb_build_object('kind', v_kind, 'id', v_id, 'version', v_ver, 'action', v_action, 'label', v_label);
END $$;
REVOKE ALL ON FUNCTION onboarding.validate_reference(uuid, onboarding.programmes, text, jsonb) FROM PUBLIC;

/* The common head of the step ports: the step of the tenant, locked; its programme current, open (not withdrawn / accepted) and, for a
   record, not held; the version read named. */
CREATE OR REPLACE FUNCTION onboarding._step_current(p_step uuid, p_tenant uuid, p_expected int, p_for_record boolean) RETURNS onboarding.steps
LANGUAGE plpgsql SECURITY DEFINER SET search_path = onboarding, pg_catalog, pg_temp AS $$
DECLARE s onboarding.steps%ROWTYPE; p onboarding.programmes%ROWTYPE;
BEGIN
  SELECT * INTO s FROM onboarding.steps x WHERE x.step_id = p_step AND x.tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'onboarding step rejected (unknown_step): % is not a step of an onboarding programme of this tenant', p_step USING ERRCODE = '22023'; END IF;
  p := onboarding._programme_current(s.programme_id, p_tenant, 'onboarding step');
  IF p.state IN ('withdrawn', 'accepted') THEN RAISE EXCEPTION 'onboarding step rejected (state): programme % is %; its steps no longer change', p.programme_key, p.state USING ERRCODE = '22023'; END IF;
  IF p_for_record AND p.state = 'held' THEN
    RAISE EXCEPTION 'onboarding step rejected (held): programme % is held (%); no step is recorded until it resumes', p.programme_key,
      (SELECT string_agg(h ->> 'reason', '; ') FROM jsonb_array_elements(p.held_reasons) h) USING ERRCODE = '22023';
  END IF;
  IF p_expected IS DISTINCT FROM s.version THEN
    RAISE EXCEPTION 'onboarding step rejected (stale): the act names step v%, the step is at v%', coalesce(p_expected::text, '?'), s.version USING ERRCODE = '22023';
  END IF;
  RETURN s;
END $$;
REVOKE ALL ON FUNCTION onboarding._step_current(uuid, uuid, int, boolean) FROM PUBLIC;

/* Write the step's next version and its ledger event (the full snapshot — the replay). */
CREATE OR REPLACE FUNCTION onboarding._step_write(n onboarding.steps, p_event text, p_actor uuid, p_details jsonb, p_correlation uuid, p_insert boolean) RETURNS onboarding.steps
LANGUAGE plpgsql SECURITY DEFINER SET search_path = onboarding, pg_catalog, pg_temp AS $$
BEGIN
  n.updated_by := p_actor; n.updated_at := clock_timestamp(); n.correlation_id := p_correlation;
  n.digest := onboarding.step_digest(n);
  IF p_insert THEN INSERT INTO onboarding.steps VALUES (n.*);
  ELSE
    UPDATE onboarding.steps SET version = n.version, state = n.state, realized_by = n.realized_by, evidence = n.evidence, compensation = n.compensation,
           held_reason = n.held_reason, reverted_by = n.reverted_by, digest = n.digest, updated_by = n.updated_by, updated_at = n.updated_at, correlation_id = n.correlation_id
     WHERE step_id = n.step_id;
  END IF;
  PERFORM onboarding.ledger('onboarding', n.tenant_id, NULL, 'onboarding_step', n.step_id, n.version, p_event, p_actor,
            coalesce(p_details, '{}'::jsonb) || jsonb_build_object('programme_id', n.programme_id, 'step_key', n.step_key, 'state', n.state, 'digest', n.digest,
                                                                 'realized_by', n.realized_by, 'compensation', n.compensation, 'reverted_by', n.reverted_by), p_correlation);
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION onboarding._step_write(onboarding.steps, text, uuid, jsonb, uuid, boolean) FROM PUBLIC;

/* PLAN (onboarding.step.plan): the lead or the tenant administrator plans a step of the closed list (once per programme), with the governed act
   that would compensate it (it may be named later — it is required before the step is done). */
CREATE OR REPLACE FUNCTION onboarding.plan_step(p_step uuid, p_tenant uuid, p_programme uuid, p_step_key text, p_compensation jsonb, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = onboarding, observation, public, pg_catalog, pg_temp AS $$
DECLARE p onboarding.programmes%ROWTYPE; n onboarding.steps%ROWTYPE;
BEGIN
  PERFORM onboarding._on_tenant_head('onboarding.step.plan', 'onboarding step', p_tenant, p_actor, ARRAY['implementation_lead', 'tenant_admin'], 'planning an onboarding step');
  p := onboarding._programme_current(p_programme, p_tenant, 'onboarding step');
  IF p.state IN ('withdrawn', 'accepted') THEN RAISE EXCEPTION 'onboarding step rejected (state): programme % is %', p.programme_key, p.state USING ERRCODE = '22023'; END IF;
  IF p_step_key IS NULL OR NOT (p_step_key = ANY (onboarding.step_keys())) THEN
    RAISE EXCEPTION 'onboarding step rejected (step_key): a step is one of %', array_to_string(onboarding.step_keys(), ', ') USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM onboarding.steps x WHERE x.programme_id = p_programme AND x.step_key = p_step_key) THEN
    RAISE EXCEPTION 'onboarding step rejected (duplicate): programme % already plans the % step', p.programme_key, p_step_key USING ERRCODE = '22023';
  END IF;
  n.step_id := p_step; n.scope := 'TENANT'; n.tenant_id := p_tenant; n.programme_id := p_programme; n.step_key := p_step_key;
  n.ordinal := array_position(onboarding.step_keys(), p_step_key); n.version := 1; n.state := 'planned'; n.realized_by := NULL; n.evidence := '[]'::jsonb;
  n.compensation := onboarding._compensation(p_compensation); n.held_reason := NULL; n.reverted_by := NULL; n.created_by := p_actor; n.created_at := clock_timestamp();
  n := onboarding._step_write(n, 'step.planned', p_actor, '{}'::jsonb, p_correlation, true);
  RETURN to_jsonb(n);
END $$;
REVOKE ALL ON FUNCTION onboarding.plan_step(uuid, uuid, uuid, text, jsonb, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION onboarding.plan_step(uuid, uuid, uuid, text, jsonb, uuid, uuid) TO eye_commit;

/* RECORD (onboarding.step.record): in_progress or done. `done` needs its realizing record (validated) and a compensation. The first step
   recorded on a `planned` programme starts it (in_progress) — only with the sponsor's recorded intent (JRN-01). A done step changes only by
   its revert. */
CREATE OR REPLACE FUNCTION onboarding.record_step(p_step uuid, p_tenant uuid, p_expected int, p_state text, p_realized jsonb, p_evidence jsonb, p_compensation jsonb,
                                                 p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = onboarding, observation, public, pg_catalog, pg_temp AS $$
DECLARE s onboarding.steps%ROWTYPE; p onboarding.programmes%ROWTYPE; n onboarding.steps%ROWTYPE; v_started jsonb := NULL; v_bad int;
BEGIN
  PERFORM onboarding._on_tenant_head('onboarding.step.record', 'onboarding step', p_tenant, p_actor, ARRAY['implementation_lead', 'tenant_admin'], 'recording an onboarding step');
  s := onboarding._step_current(p_step, p_tenant, p_expected, true);
  p := onboarding._programme_current(s.programme_id, p_tenant, 'onboarding step');
  IF p_state IS NULL OR p_state NOT IN ('in_progress', 'done') THEN RAISE EXCEPTION 'onboarding step rejected (step_state): a step is recorded in_progress or done' USING ERRCODE = '22023'; END IF;
  IF s.state = 'done' THEN RAISE EXCEPTION 'onboarding step rejected (state): the % step is done; it changes only by its revert (the compensating act)', s.step_key USING ERRCODE = '22023'; END IF;
  IF p_evidence IS NOT NULL AND jsonb_typeof(p_evidence) <> 'array' THEN RAISE EXCEPTION 'onboarding step rejected (evidence): evidence is a list of references' USING ERRCODE = '22023'; END IF;
  IF p_evidence IS NOT NULL THEN
    SELECT count(*) INTO v_bad FROM jsonb_array_elements(p_evidence) e WHERE jsonb_typeof(e) <> 'object' OR length(btrim(coalesce(e ->> 'kind', ''))) < 2 OR length(btrim(coalesce(e ->> 'ref', e ->> 'id', ''))) < 2;
    IF v_bad > 0 THEN RAISE EXCEPTION 'onboarding step rejected (evidence): each evidence item is {kind, ref|id, note?}' USING ERRCODE = '22023'; END IF;
  END IF;
  n := s; n.version := s.version + 1; n.state := p_state; n.held_reason := NULL;
  n.evidence := s.evidence || coalesce(p_evidence, '[]'::jsonb);
  n.compensation := coalesce(onboarding._compensation(p_compensation), s.compensation);
  IF p_realized IS NOT NULL THEN n.realized_by := onboarding.validate_reference(p_tenant, p, s.step_key, p_realized); END IF;
  IF p_state = 'done' AND n.realized_by IS NULL THEN
    RAISE EXCEPTION 'onboarding step rejected (realized_by): a done % step names the record of the governed act that realized it', s.step_key USING ERRCODE = '22023';
  END IF;
  IF p_state = 'done' AND n.compensation IS NULL THEN
    RAISE EXCEPTION 'onboarding step rejected (compensation): a done step names the governed act that would reverse it (PR-67-001)' USING ERRCODE = '22023';
  END IF;
  IF p.state = 'planned' THEN
    IF NOT EXISTS (SELECT 1 FROM onboarding.sponsor_intents i WHERE i.programme_id = p.programme_id AND i.tenant_id = p_tenant AND i.superseded_at IS NULL) THEN
      RAISE EXCEPTION 'onboarding step rejected (state): programme % cannot leave planned without the customer sponsor''s recorded intent (JRN-01)', p.programme_key USING ERRCODE = '22023';
    END IF;
    v_started := to_jsonb(onboarding._programme_next(p, p.title, p.target_domain_id, p.deployment_profile, 'in_progress', '[]'::jsonb, p.plan, 'programme.started', p_actor,
                                                     jsonb_build_object('by_step', s.step_key, 'step_id', s.step_id), p_correlation));
  END IF;
  n := onboarding._step_write(n, 'step.recorded', p_actor, jsonb_build_object('from_state', s.state, 'evidence_added', coalesce(p_evidence, '[]'::jsonb)), p_correlation, false);
  RETURN to_jsonb(n) || jsonb_build_object('programme_started', v_started);
END $$;
REVOKE ALL ON FUNCTION onboarding.record_step(uuid, uuid, int, text, jsonb, jsonb, jsonb, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION onboarding.record_step(uuid, uuid, int, text, jsonb, jsonb, jsonb, uuid, uuid) TO eye_commit;

/* HOLD a step (onboarding.step.hold): a planned or in-progress step held with its reason (any accountable party). */
CREATE OR REPLACE FUNCTION onboarding.hold_step(p_step uuid, p_tenant uuid, p_expected int, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = onboarding, observation, public, pg_catalog, pg_temp AS $$
DECLARE s onboarding.steps%ROWTYPE; p onboarding.programmes%ROWTYPE; n onboarding.steps%ROWTYPE;
BEGIN
  PERFORM onboarding._on_tenant_head('onboarding.step.hold', 'onboarding step', p_tenant, p_actor, ARRAY['implementation_lead', 'tenant_admin', 'customer_sponsor', 'onboarding_authority'], 'holding an onboarding step');
  s := onboarding._step_current(p_step, p_tenant, p_expected, false);
  p := onboarding._programme_current(s.programme_id, p_tenant, 'onboarding step');
  IF s.state NOT IN ('planned', 'in_progress') THEN RAISE EXCEPTION 'onboarding step rejected (state): the % step is %; only a planned or in-progress step is held', s.step_key, s.state USING ERRCODE = '22023'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN RAISE EXCEPTION 'onboarding step rejected (reason): a hold states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  n := s; n.version := s.version + 1; n.state := 'held'; n.held_reason := btrim(p_reason);
  n := onboarding._step_write(n, 'step.held', p_actor, jsonb_build_object('from_state', s.state, 'reason', btrim(p_reason)), p_correlation, false);
  RETURN to_jsonb(n);
END $$;
REVOKE ALL ON FUNCTION onboarding.hold_step(uuid, uuid, int, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION onboarding.hold_step(uuid, uuid, int, text, uuid, uuid) TO eye_commit;

/* REVERT (onboarding.step.revert): a done step is reverted by RECORDING its compensating act by reference — the planned compensation's action,
   performed through its own governed route — never performed here. */
CREATE OR REPLACE FUNCTION onboarding.revert_step(p_step uuid, p_tenant uuid, p_expected int, p_compensating jsonb, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = onboarding, observation, public, pg_catalog, pg_temp AS $$
DECLARE s onboarding.steps%ROWTYPE; p onboarding.programmes%ROWTYPE; n onboarding.steps%ROWTYPE; v_ref jsonb;
BEGIN
  PERFORM onboarding._on_tenant_head('onboarding.step.revert', 'onboarding step', p_tenant, p_actor, ARRAY['implementation_lead', 'tenant_admin'], 'reverting an onboarding step');
  s := onboarding._step_current(p_step, p_tenant, p_expected, false);
  p := onboarding._programme_current(s.programme_id, p_tenant, 'onboarding step');
  IF s.state <> 'done' THEN RAISE EXCEPTION 'onboarding step rejected (state): the % step is %; only a done step is reverted', s.step_key, s.state USING ERRCODE = '22023'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN RAISE EXCEPTION 'onboarding step rejected (reason): a revert states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  IF p_compensating IS NULL OR coalesce(p_compensating ->> 'action', '') IS DISTINCT FROM (s.compensation ->> 'action') THEN
    RAISE EXCEPTION 'onboarding step rejected (compensation): the % step is reversed by % (its planned compensation); the revert records that act, not %', s.step_key,
      s.compensation ->> 'action', coalesce(p_compensating ->> 'action', '<none>') USING ERRCODE = '22023';
  END IF;
  v_ref := onboarding.validate_reference(p_tenant, p, NULL, p_compensating);
  n := s; n.version := s.version + 1; n.state := 'reverted'; n.reverted_by := v_ref || jsonb_build_object('reason', btrim(p_reason), 'recorded_by', p_actor, 'recorded_at', clock_timestamp());
  n := onboarding._step_write(n, 'step.reverted', p_actor, jsonb_build_object('from_state', s.state, 'reason', btrim(p_reason)), p_correlation, false);
  RETURN to_jsonb(n);
END $$;
REVOKE ALL ON FUNCTION onboarding.revert_step(uuid, uuid, int, jsonb, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION onboarding.revert_step(uuid, uuid, int, jsonb, text, uuid, uuid) TO eye_commit;

-- §ON.4 THE DRAFT DOMAIN ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* tenancy.create_domain_draft (action tenancy.domain.draft): the 0019 create_domain idiom (the bound action, the bound target, the TENANT
   context of the tenant) for a TENANT ADMINISTRATOR, through an open programme that names no target yet: the domain `draft` (not activated),
   lifecycle `domain.drafted` with the programme, and the programme's next version naming it. The existing tenancy.create_domain is unchanged;
   activation is §MG's (tenancy.activate_domain). A draft domain is not an active domain: 0105 refuses it as a contract decision cell, and
   0102's constraint gate and 0105's entitlement notices pass it by (they read status = 'active'). */
CREATE OR REPLACE FUNCTION tenancy.create_domain_draft(p_id uuid, p_tenant uuid, p_name text, p_programme uuid, p_correlation uuid DEFAULT NULL) RETURNS jsonb
SECURITY DEFINER SET search_path = tenancy, onboarding, ctx, observation, public, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid := public.eye_principal(); p onboarding.programmes%ROWTYPE; n onboarding.programmes%ROWTYPE; v_existing record; v_corr uuid := coalesce(p_correlation, gen_random_uuid());
BEGIN
  PERFORM observation.assert_authority(ARRAY['tenancy.domain.draft']);
  PERFORM ctx.assert_bound_target(p_id::text);
  PERFORM onboarding.assert_tenant(p_tenant, 'domain draft');
  IF v_actor IS NULL OR NOT onboarding.holds_role(v_actor, p_tenant, NULL, ARRAY['tenant_admin']) THEN
    RAISE EXCEPTION 'domain draft rejected (authority): a draft domain is created by the tenant administrator' USING ERRCODE = '42501';
  END IF;
  IF p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 2 AND 200 THEN RAISE EXCEPTION 'domain draft rejected (name): a domain name is 2–200 characters' USING ERRCODE = '22023'; END IF;
  p := onboarding._programme_current(p_programme, p_tenant, 'domain draft');
  IF p.state IN ('withdrawn', 'accepted') THEN RAISE EXCEPTION 'domain draft rejected (state): programme % is %', p.programme_key, p.state USING ERRCODE = '22023'; END IF;
  IF p.target_domain_id IS NOT NULL THEN
    SELECT d.name, d.status INTO v_existing FROM tenancy.domains d WHERE d.id = p.target_domain_id;
    RAISE EXCEPTION 'domain draft rejected (duplicate): programme % already names its target domain % (%)', p.programme_key, coalesce(v_existing.name, p.target_domain_id::text), coalesce(v_existing.status, '?') USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM tenancy.domains d WHERE d.tenant_id = p_tenant AND d.name = btrim(p_name)) THEN
    RAISE EXCEPTION 'domain draft rejected (duplicate): the tenant already has a domain named %', btrim(p_name) USING ERRCODE = '22023';
  END IF;
  INSERT INTO tenancy.domains (id, tenant_id, name, status, activated_at) VALUES (p_id, p_tenant, btrim(p_name), 'draft', NULL);
  n := onboarding._programme_next(p, p.title, p_id, p.deployment_profile, p.state, p.held_reasons, p.plan, 'programme.domain_drafted', v_actor,
                                  jsonb_build_object('domain_id', p_id, 'name', btrim(p_name)), v_corr);
  INSERT INTO tenancy.lifecycle_events (id, scope, tenant_id, domain_id, event, actor, details)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_id, 'domain.drafted', ctx.bound_actor(),
            jsonb_build_object('name', btrim(p_name), 'status', 'draft', 'programme_id', p_programme, 'programme_version', n.version));
  PERFORM onboarding.ledger('onboarding', p_tenant, NULL, 'domain', p_id, NULL, 'domain.drafted', v_actor,
            jsonb_build_object('name', btrim(p_name), 'programme_id', p_programme, 'programme_version', n.version), n.correlation_id);
  RETURN jsonb_build_object('domain', jsonb_build_object('id', p_id, 'tenant_id', p_tenant, 'name', btrim(p_name), 'status', 'draft', 'activated_at', NULL),
                            'programme', to_jsonb(n));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION tenancy.create_domain_draft(uuid, uuid, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tenancy.create_domain_draft(uuid, uuid, text, uuid, uuid) TO eye_commit;

-- §ON.5 CONFIGURATION BASELINES (reads and ports) ───────────────────────────────────────────────────────────────────────────────────────────
/* THE OBSERVED CONFIGURATION of a domain, read LIVE — the version POINTERS (never the content): the active attention policy version, the
   approved analytics purposes (key → version), the active package versions (key → {version, semver}), the workflow definitions (key → latest
   version), the active source contracts (key → contract version), the role-binding CENSUS by role (counts of live holders in the domain,
   DOMAIN or TENANT bindings — never persons), the tenant's live licence version. SECURITY DEFINER under the read-scope guard (identity and
   commercial are read for counts and versions only). */
CREATE OR REPLACE FUNCTION onboarding.observe_config(p_tenant uuid, p_domain uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = onboarding, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the observed configuration of a domain');
  RETURN jsonb_build_object(
    'attention_policy', (SELECT jsonb_build_object('policy_id', a.policy_id, 'version', a.version, 'rules_digest', a.rules_digest) FROM executive.attention_policies a
                          WHERE a.tenant_id = p_tenant AND a.domain_id = p_domain AND a.state = 'active'),
    'analytics_purposes', coalesce((SELECT jsonb_object_agg(a.purpose_key, a.version) FROM analytics.purposes a WHERE a.tenant_id = p_tenant AND a.domain_id = p_domain AND a.state = 'approved'), '{}'::jsonb),
    'packages', coalesce((SELECT jsonb_object_agg(k.package_key, jsonb_build_object('version', v.version, 'semver', v.semver)) FROM domain.packages k
                            JOIN domain.package_versions v ON v.package_id = k.package_id AND v.state = 'active'
                           WHERE k.tenant_id = p_tenant AND k.domain_id = p_domain AND k.state = 'declared'), '{}'::jsonb),
    'workflow_definitions', coalesce((SELECT jsonb_object_agg(w.def_key, w.v) FROM (SELECT x.def_key, max(x.version) AS v FROM executive.workflow_definitions x
                                       WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain GROUP BY x.def_key) w), '{}'::jsonb),
    'source_contracts', coalesce((SELECT jsonb_object_agg(s.source_key, s.contract_version) FROM observation.source_contracts_current s
                                   WHERE s.tenant_id = p_tenant AND s.domain_id = p_domain AND s.lifecycle_state = 'active'), '{}'::jsonb),
    'role_census', coalesce((SELECT jsonb_object_agg(c.role_code, c.n) FROM (SELECT b.role_code, count(DISTINCT b.principal_id)::int AS n FROM identity.role_bindings b
                                JOIN identity.principals p ON p.id = b.principal_id
                               WHERE b.tenant_id = p_tenant AND b.revoked_at IS NULL AND p.status = 'active' AND (b.scope = 'TENANT' OR (b.scope = 'DOMAIN' AND b.domain_id = p_domain))
                               GROUP BY b.role_code) c), '{}'::jsonb),
    'licence', (SELECT jsonb_build_object('licence_id', l.licence_id, 'version', l.version, 'package_key', l.package_key) FROM commercial.licences l
                 WHERE l.tenant_id = p_tenant AND l.state <> 'superseded' ORDER BY l.version DESC LIMIT 1));
END $$;
REVOKE ALL ON FUNCTION onboarding.observe_config(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION onboarding.observe_config(uuid, uuid) TO eye_app, eye_commit;

/* THE POINTER DIFF (pure): baseline vs observed — per key of the map sections (added / removed / changed), whole-value for the pointer
   sections (attention_policy, licence). Ordered by section, key. */
CREATE OR REPLACE FUNCTION onboarding.pointer_diff(p_baseline jsonb, p_observed jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = onboarding, pg_catalog, pg_temp AS $$
  WITH maps AS (SELECT unnest(ARRAY['analytics_purposes', 'packages', 'workflow_definitions', 'source_contracts', 'role_census']) AS section),
  map_changes AS (
    SELECT m.section, k.key, coalesce(p_baseline -> m.section, '{}'::jsonb) -> k.key AS b, coalesce(p_observed -> m.section, '{}'::jsonb) -> k.key AS o
      FROM maps m, LATERAL (SELECT jsonb_object_keys(coalesce(p_baseline -> m.section, '{}'::jsonb)) AS key
                            UNION SELECT jsonb_object_keys(coalesce(p_observed -> m.section, '{}'::jsonb))) k),
  ptr AS (SELECT s AS section, NULL::text AS key, nullif(p_baseline -> s, 'null'::jsonb) AS b, nullif(p_observed -> s, 'null'::jsonb) AS o
            FROM unnest(ARRAY['attention_policy', 'licence']) s),
  allc AS (SELECT * FROM map_changes UNION ALL SELECT * FROM ptr)
  SELECT coalesce(jsonb_agg(jsonb_build_object('section', c.section, 'key', c.key,
            'change', CASE WHEN c.b IS NULL THEN 'added' WHEN c.o IS NULL THEN 'removed' ELSE 'changed' END, 'baseline', c.b, 'observed', c.o)
          ORDER BY c.section, c.key NULLS FIRST), '[]'::jsonb)
    FROM allc c WHERE c.b IS DISTINCT FROM c.o $$;
GRANT EXECUTE ON FUNCTION onboarding.pointer_diff(jsonb, jsonb) TO eye_app, eye_commit;

CREATE OR REPLACE FUNCTION onboarding.baseline_digest(p_baseline uuid, p_version int, p_domain uuid, p_pointers jsonb) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = onboarding, pg_catalog, pg_temp AS $$
  SELECT onboarding.digest(jsonb_build_object('baseline_id', p_baseline, 'version', p_version, 'domain_id', p_domain, 'pointers', p_pointers)) $$;

/* DRIFT (internal): the approved baseline of the domain against the observed configuration — {state: no_baseline | in_sync | drifted, …}. */
CREATE OR REPLACE FUNCTION onboarding._drift(p_tenant uuid, p_domain uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = onboarding, pg_catalog, pg_temp AS $$
DECLARE b onboarding.config_baselines%ROWTYPE; v_obs jsonb; v_changes jsonb;
BEGIN
  v_obs := onboarding.observe_config(p_tenant, p_domain);
  SELECT * INTO b FROM onboarding.config_baselines x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.state = 'approved';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('state', 'no_baseline', 'reason', 'the domain has no approved configuration baseline — drift is not inferred', 'observed', v_obs,
                              'observed_digest', onboarding.digest(v_obs), 'changes', '[]'::jsonb);
  END IF;
  v_changes := onboarding.pointer_diff(b.pointers, v_obs);
  RETURN jsonb_build_object('state', CASE WHEN jsonb_array_length(v_changes) = 0 THEN 'in_sync' ELSE 'drifted' END, 'baseline_id', b.baseline_id, 'version', b.version,
                            'digest', b.digest, 'effective_from', b.effective_from, 'observed', v_obs, 'observed_digest', onboarding.digest(v_obs), 'changes', v_changes);
END $$;
REVOKE ALL ON FUNCTION onboarding._drift(uuid, uuid) FROM PUBLIC;
/* The DRIFT read (guarded): the same, for the workspace and the after-tick hook's read-first. */
CREATE OR REPLACE FUNCTION onboarding.baseline_drift(p_tenant uuid, p_domain uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = onboarding, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the configuration drift of a domain');
  RETURN onboarding._drift(p_tenant, p_domain);
END $$;
REVOKE ALL ON FUNCTION onboarding.baseline_drift(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION onboarding.baseline_drift(uuid, uuid) TO eye_app, eye_commit;

/* The common head of a baseline port: the bound action, the DOMAIN scope, the acting principal, the roles; the domain of the tenant. */
CREATE OR REPLACE FUNCTION onboarding._cb_head(p_action text, p_tenant uuid, p_domain uuid, p_actor uuid, p_roles text[], p_what text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = onboarding, observation, public, pg_catalog, pg_temp AS $$
DECLARE v_status text;
BEGIN
  PERFORM observation.assert_authority(ARRAY[p_action]);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS NULL OR p_actor IS DISTINCT FROM public.eye_principal() THEN
    RAISE EXCEPTION 'config baseline rejected (actor): the act is recorded under the acting principal' USING ERRCODE = '42501';
  END IF;
  IF NOT onboarding.holds_role(p_actor, p_tenant, p_domain, p_roles) THEN
    RAISE EXCEPTION 'config baseline rejected (authority): % is the act of a %', p_what, array_to_string(p_roles, ' or ') USING ERRCODE = '42501';
  END IF;
  SELECT d.status INTO v_status FROM tenancy.domains d WHERE d.id = p_domain AND d.tenant_id = p_tenant;
  IF v_status IS NULL THEN RAISE EXCEPTION 'config baseline rejected (unknown_domain): % is not a domain of this tenant', p_domain USING ERRCODE = '22023'; END IF;
  IF v_status NOT IN ('draft', 'active') THEN RAISE EXCEPTION 'config baseline rejected (state): the domain is %', v_status USING ERRCODE = '22023'; END IF;
END $$;
REVOKE ALL ON FUNCTION onboarding._cb_head(text, uuid, uuid, uuid, text[], text) FROM PUBLIC;

/* CAPTURE (onboarding.baseline.capture): the implementation lead records the domain's FIRST baseline (v1, draft) from the observed pointers;
   later versions are promotions. */
CREATE OR REPLACE FUNCTION onboarding.capture_baseline(p_baseline uuid, p_tenant uuid, p_domain uuid, p_programme uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = onboarding, observation, public, pg_catalog, pg_temp AS $$
DECLARE n onboarding.config_baselines%ROWTYPE; v_existing uuid; p onboarding.programmes%ROWTYPE;
BEGIN
  PERFORM onboarding._cb_head('onboarding.baseline.capture', p_tenant, p_domain, p_actor, ARRAY['implementation_lead'], 'capturing a configuration baseline');
  SELECT x.baseline_id INTO v_existing FROM onboarding.config_baselines x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RAISE EXCEPTION 'config baseline rejected (duplicate): the domain already has baseline %; a new version is a promotion', v_existing USING ERRCODE = '22023';
  END IF;
  IF p_programme IS NOT NULL THEN
    SELECT * INTO p FROM onboarding.programmes x WHERE x.programme_id = p_programme AND x.tenant_id = p_tenant AND x.superseded_at IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'config baseline rejected (unknown_programme): % is not an onboarding programme of this tenant', p_programme USING ERRCODE = '22023'; END IF;
    IF p.target_domain_id IS DISTINCT FROM p_domain THEN
      RAISE EXCEPTION 'config baseline rejected (programme): programme % targets %, not this domain', p.programme_key, coalesce(p.target_domain_id::text, 'no domain yet') USING ERRCODE = '22023';
    END IF;
  END IF;
  n.baseline_id := p_baseline; n.version := 1; n.scope := 'DOMAIN'; n.tenant_id := p_tenant; n.domain_id := p_domain; n.programme_id := p_programme;
  n.pointers := onboarding.observe_config(p_tenant, p_domain); n.basis := 'capture'; n.promoted_from := NULL; n.absorbed := '[]'::jsonb; n.state := 'draft';
  n.captured_by := p_actor; n.captured_at := clock_timestamp(); n.correlation_id := p_correlation;
  n.digest := onboarding.baseline_digest(n.baseline_id, n.version, p_domain, n.pointers);
  INSERT INTO onboarding.config_baselines VALUES (n.*);
  PERFORM onboarding.ledger('onboarding', p_tenant, p_domain, 'config_baseline', p_baseline, 1, 'baseline.captured', p_actor,
            jsonb_build_object('digest', n.digest, 'programme_id', p_programme, 'pointers', n.pointers), p_correlation);
  RETURN to_jsonb(n);
END $$;
REVOKE ALL ON FUNCTION onboarding.capture_baseline(uuid, uuid, uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION onboarding.capture_baseline(uuid, uuid, uuid, uuid, uuid, uuid) TO eye_commit;

/* PROMOTE (onboarding.baseline.promote): the observed state becomes the next version (draft) — only from an approved baseline it differs from;
   the drift it absorbs is recorded. It still needs the authority's approval. */
CREATE OR REPLACE FUNCTION onboarding.promote_baseline(p_tenant uuid, p_domain uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = onboarding, observation, public, pg_catalog, pg_temp AS $$
DECLARE a onboarding.config_baselines%ROWTYPE; n onboarding.config_baselines%ROWTYPE; v_obs jsonb; v_changes jsonb; v_open int;
BEGIN
  PERFORM onboarding._cb_head('onboarding.baseline.promote', p_tenant, p_domain, p_actor, ARRAY['implementation_lead'], 'promoting a configuration baseline');
  SELECT * INTO a FROM onboarding.config_baselines x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.state = 'approved' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'config baseline rejected (state): the domain has no approved baseline to promote from (capture, propose and approve one first)' USING ERRCODE = '22023'; END IF;
  SELECT x.version INTO v_open FROM onboarding.config_baselines x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.state IN ('draft', 'proposed');
  IF v_open IS NOT NULL THEN RAISE EXCEPTION 'config baseline rejected (state): version % is still open (draft or proposed); decide it first', v_open USING ERRCODE = '22023'; END IF;
  v_obs := onboarding.observe_config(p_tenant, p_domain);
  v_changes := onboarding.pointer_diff(a.pointers, v_obs);
  IF jsonb_array_length(v_changes) = 0 THEN
    RAISE EXCEPTION 'config baseline rejected (state): the observed configuration equals approved v%; there is nothing to promote', a.version USING ERRCODE = '22023';
  END IF;
  n.baseline_id := a.baseline_id; n.version := (SELECT max(x.version) + 1 FROM onboarding.config_baselines x WHERE x.baseline_id = a.baseline_id);
  n.scope := 'DOMAIN'; n.tenant_id := p_tenant; n.domain_id := p_domain; n.programme_id := a.programme_id; n.pointers := v_obs; n.basis := 'promotion';
  n.promoted_from := a.version; n.absorbed := v_changes; n.state := 'draft'; n.captured_by := p_actor; n.captured_at := clock_timestamp(); n.correlation_id := p_correlation;
  n.digest := onboarding.baseline_digest(n.baseline_id, n.version, p_domain, n.pointers);
  INSERT INTO onboarding.config_baselines VALUES (n.*);
  PERFORM onboarding.ledger('onboarding', p_tenant, p_domain, 'config_baseline', n.baseline_id, n.version, 'baseline.promoted', p_actor,
            jsonb_build_object('digest', n.digest, 'promoted_from', a.version, 'absorbed', v_changes), p_correlation);
  RETURN to_jsonb(n);
END $$;
REVOKE ALL ON FUNCTION onboarding.promote_baseline(uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION onboarding.promote_baseline(uuid, uuid, uuid, uuid) TO eye_commit;

/* PROPOSE (onboarding.baseline.propose): the lead submits the draft at the digest read; the proposer is recorded (never its approver). */
CREATE OR REPLACE FUNCTION onboarding.propose_baseline(p_baseline uuid, p_tenant uuid, p_domain uuid, p_version int, p_digest text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = onboarding, observation, public, pg_catalog, pg_temp AS $$
DECLARE b onboarding.config_baselines%ROWTYPE;
BEGIN
  PERFORM onboarding._cb_head('onboarding.baseline.propose', p_tenant, p_domain, p_actor, ARRAY['implementation_lead'], 'proposing a configuration baseline');
  SELECT * INTO b FROM onboarding.config_baselines x WHERE x.baseline_id = p_baseline AND x.version = p_version AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'config baseline rejected (unknown_baseline): no version % of baseline % in this domain', p_version, p_baseline USING ERRCODE = '22023'; END IF;
  IF b.state <> 'draft' THEN RAISE EXCEPTION 'config baseline rejected (state): version % is %, not a draft', p_version, b.state USING ERRCODE = '22023'; END IF;
  IF p_digest IS DISTINCT FROM b.digest THEN RAISE EXCEPTION 'config baseline rejected (stale): the proposal names digest %, version % is %', coalesce(left(p_digest, 12), '?'), p_version, left(b.digest, 12) USING ERRCODE = '22023'; END IF;
  UPDATE onboarding.config_baselines SET state = 'proposed', proposed_by = p_actor, proposed_at = clock_timestamp() WHERE baseline_id = p_baseline AND version = p_version;
  PERFORM onboarding.ledger('onboarding', p_tenant, p_domain, 'config_baseline', p_baseline, p_version, 'baseline.proposed', p_actor, jsonb_build_object('digest', b.digest), p_correlation);
  RETURN (SELECT to_jsonb(x) FROM onboarding.config_baselines x WHERE x.baseline_id = p_baseline AND x.version = p_version);
END $$;
REVOKE ALL ON FUNCTION onboarding.propose_baseline(uuid, uuid, uuid, int, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION onboarding.propose_baseline(uuid, uuid, uuid, int, text, uuid, uuid) TO eye_commit;

/* DECIDE (onboarding.baseline.decide — human-gated): THE CUSTOMER AUTHORITY approves or rejects the proposed version AT ITS DIGEST
   (onboarding.assert_approver: a named active human holding onboarding_authority, never the proposer nor the capturer, never an implementation
   lead, never an agent). An approval is SIGNED (executive.signatures, subject kind config_baseline, signed by the approver under this action
   in the same write) and supersedes the prior approved version; the drift items of the lineage close. */
CREATE OR REPLACE FUNCTION onboarding.decide_baseline(p_baseline uuid, p_tenant uuid, p_domain uuid, p_version int, p_decision text, p_digest text, p_reason text, p_signature uuid,
                                                     p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = onboarding, observation, executive, public, pg_catalog, pg_temp AS $$
DECLARE b onboarding.config_baselines%ROWTYPE; v_prior int; v_closed jsonb := '[]'::jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['onboarding.baseline.decide']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS NULL OR p_actor IS DISTINCT FROM public.eye_principal() THEN
    RAISE EXCEPTION 'config baseline rejected (actor): the decision is recorded under the acting principal' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO b FROM onboarding.config_baselines x WHERE x.baseline_id = p_baseline AND x.version = p_version AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'config baseline rejected (unknown_baseline): no version % of baseline % in this domain', p_version, p_baseline USING ERRCODE = '22023'; END IF;
  PERFORM onboarding.assert_approver('config baseline', p_actor, p_tenant, p_domain, ARRAY['onboarding_authority'], b.proposed_by, 'approving a configuration baseline');
  IF p_actor = b.captured_by THEN
    RAISE EXCEPTION 'config baseline rejected (separation_of_duties): approving a configuration baseline is never the act of the principal who captured it' USING ERRCODE = '42501';
  END IF;
  IF b.state <> 'proposed' THEN RAISE EXCEPTION 'config baseline rejected (state): version % is %, not proposed', p_version, b.state USING ERRCODE = '22023'; END IF;
  IF p_digest IS DISTINCT FROM b.digest THEN
    RAISE EXCEPTION 'config baseline rejected (stale): the decision names digest %, version % is % — read it again', coalesce(left(p_digest, 12), '?'), p_version, left(b.digest, 12) USING ERRCODE = '22023';
  END IF;
  IF p_decision IS NULL OR p_decision NOT IN ('approve', 'reject') THEN RAISE EXCEPTION 'config baseline rejected (decision): the decision is approve or reject' USING ERRCODE = '22023'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN RAISE EXCEPTION 'config baseline rejected (reason): a decision states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  IF p_decision = 'reject' THEN
    IF p_signature IS NOT NULL THEN RAISE EXCEPTION 'config baseline rejected (signature): a rejection is not signed as an approval' USING ERRCODE = '22023'; END IF;
    UPDATE onboarding.config_baselines SET state = 'rejected', decided_by = p_actor, decided_at = clock_timestamp(), decision_reason = btrim(p_reason)
     WHERE baseline_id = p_baseline AND version = p_version;
    PERFORM onboarding.ledger('onboarding', p_tenant, p_domain, 'config_baseline', p_baseline, p_version, 'baseline.rejected', p_actor,
              jsonb_build_object('digest', b.digest, 'reason', btrim(p_reason)), p_correlation);
  ELSE
    IF p_signature IS NULL OR NOT EXISTS (SELECT 1 FROM executive.signatures s WHERE s.signature_id = p_signature AND s.subject_kind = 'config_baseline' AND s.subject_id = p_baseline
                                            AND s.subject_version = p_version AND s.subject_digest = b.digest AND s.signer = p_actor AND s.bound_action = 'onboarding.baseline.decide'
                                            AND s.tenant_id = p_tenant AND s.domain_id = p_domain) THEN
      RAISE EXCEPTION 'config baseline rejected (signature): an approval carries the approver''s signature over the version''s digest, recorded under this act' USING ERRCODE = '22023';
    END IF;
    SELECT x.version INTO v_prior FROM onboarding.config_baselines x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.state = 'approved' FOR UPDATE;
    IF v_prior IS NOT NULL THEN
      UPDATE onboarding.config_baselines SET state = 'superseded', superseded_at = clock_timestamp() WHERE baseline_id = p_baseline AND version = v_prior;
    END IF;
    UPDATE onboarding.config_baselines SET state = 'approved', decided_by = p_actor, decided_at = clock_timestamp(), decision_reason = btrim(p_reason), signature_id = p_signature,
           effective_from = clock_timestamp()
     WHERE baseline_id = p_baseline AND version = p_version;
    v_closed := executive.b33_close_items(p_tenant, p_domain, 'onboarding.drift', 'config_baseline', p_baseline, format('configuration baseline v%s approved: %s', p_version, btrim(p_reason)), p_actor, p_correlation);
    PERFORM onboarding.ledger('onboarding', p_tenant, p_domain, 'config_baseline', p_baseline, p_version, 'baseline.approved', p_actor,
              jsonb_build_object('digest', b.digest, 'reason', btrim(p_reason), 'signature_id', p_signature, 'supersedes', v_prior, 'closed_items', v_closed), p_correlation);
  END IF;
  RETURN (SELECT to_jsonb(x) || jsonb_build_object('closed_items', v_closed) FROM onboarding.config_baselines x WHERE x.baseline_id = p_baseline AND x.version = p_version);
END $$;
REVOKE ALL ON FUNCTION onboarding.decide_baseline(uuid, uuid, uuid, int, text, text, text, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION onboarding.decide_baseline(uuid, uuid, uuid, int, text, text, text, uuid, uuid, uuid) TO eye_commit;

/* RECORD DRIFT (onboarding.baseline.drift — the after-tick hook `onboarding-drift`, or a person): the drift re-computed here against the
   observed digest the caller READ FIRST (moved in between → 409 stale); recorded only on CHANGE (a new or different drift, or back in line);
   a drift raises `onboarding.drift` (routed by the domain's attention policy — to the domain administrator) and closes the prior drift items;
   back in line closes them. Nothing is restored here: the rollback plan is a read. */
CREATE OR REPLACE FUNCTION onboarding.record_drift(p_event uuid, p_tenant uuid, p_domain uuid, p_observed_digest text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = onboarding, observation, executive, public, pg_catalog, pg_temp AS $$
DECLARE v jsonb; last onboarding.drift_events%ROWTYPE; v_state text; v_item jsonb := NULL; v_closed jsonb := '[]'::jsonb; v_baseline uuid; v_version int;
BEGIN
  PERFORM onboarding._cb_head('onboarding.baseline.drift', p_tenant, p_domain, p_actor,
                              ARRAY['attention_agent', 'implementation_lead', 'onboarding_authority', 'tenant_admin', 'domain_admin'], 'recording configuration drift');
  v := onboarding._drift(p_tenant, p_domain);
  v_state := v ->> 'state';
  IF v_state = 'no_baseline' THEN RETURN jsonb_build_object('recorded', false, 'state', v_state, 'reason', v ->> 'reason'); END IF;
  IF p_observed_digest IS DISTINCT FROM (v ->> 'observed_digest') THEN
    RAISE EXCEPTION 'config baseline rejected (stale): the configuration moved since it was read (read %, now %) — read it again', coalesce(left(p_observed_digest, 12), '?'), left(v ->> 'observed_digest', 12) USING ERRCODE = '22023';
  END IF;
  v_baseline := (v ->> 'baseline_id')::uuid; v_version := (v ->> 'version')::int;
  SELECT * INTO last FROM onboarding.drift_events e WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain AND e.baseline_id = v_baseline AND e.baseline_version = v_version
   ORDER BY e.recorded_at DESC, e.event_id DESC LIMIT 1;
  IF (last.event_id IS NULL AND v_state = 'in_sync') OR (last.event_id IS NOT NULL AND last.state = v_state AND last.observed_digest = v ->> 'observed_digest') THEN
    RETURN jsonb_build_object('recorded', false, 'state', v_state, 'reason', 'unchanged since the last observation', 'baseline_version', v_version, 'last_event_id', last.event_id);
  END IF;
  v_closed := executive.b33_close_items(p_tenant, p_domain, 'onboarding.drift', 'config_baseline', v_baseline,
                CASE WHEN v_state = 'in_sync' THEN format('the domain is back in line with configuration baseline v%s', v_version)
                     ELSE format('superseded by a newer drift observation of baseline v%s', v_version) END, p_actor, p_correlation);
  IF v_state = 'drifted' THEN
    v_item := executive.b33_raise_routed(p_tenant, p_domain, 'onboarding.drift', 'config_baseline', v_baseline,
                format('Configuration drift: %s pointer(s) differ from approved baseline v%s', jsonb_array_length(v -> 'changes'), v_version),
                (SELECT coalesce(jsonb_agg(format('%s%s %s', c ->> 'section', CASE WHEN c ->> 'key' IS NULL THEN '' ELSE '.' || (c ->> 'key') END, c ->> 'change')), '[]'::jsonb) FROM jsonb_array_elements(v -> 'changes') c),
                NULL, p_event, 'onboarding.drift_event', jsonb_build_object('baseline_version', v_version, 'observed_digest', v ->> 'observed_digest'), NULL, p_actor, p_correlation);
  END IF;
  INSERT INTO onboarding.drift_events (event_id, tenant_id, domain_id, baseline_id, baseline_version, baseline_digest, observed_digest, state, changes, observed, item, recorded_by, correlation_id)
  VALUES (p_event, p_tenant, p_domain, v_baseline, v_version, v ->> 'digest', v ->> 'observed_digest', v_state, v -> 'changes', v -> 'observed', v_item, p_actor, p_correlation);
  PERFORM onboarding.ledger('onboarding', p_tenant, p_domain, 'config_baseline', v_baseline, v_version, 'baseline.drift_recorded', p_actor,
            jsonb_build_object('drift_event_id', p_event, 'state', v_state, 'changes', jsonb_array_length(v -> 'changes'), 'observed_digest', v ->> 'observed_digest', 'item', v_item, 'closed_items', v_closed), p_correlation);
  RETURN jsonb_build_object('recorded', true, 'event_id', p_event, 'state', v_state, 'baseline_version', v_version, 'changes', v -> 'changes', 'item', v_item, 'closed_items', v_closed);
END $$;
REVOKE ALL ON FUNCTION onboarding.record_drift(uuid, uuid, uuid, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION onboarding.record_drift(uuid, uuid, uuid, text, uuid, uuid) TO eye_commit;


-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §MG — governed migration: waves, mappings, rehearsals, reconciliation, cutover, activation, rollback, acceptance (F-P7-F-04)
-- (folded at integration from the part-local file 0114_b94_x_mg.sql, unchanged but for the marked `B94 integration` edits; apply order §0, §ON, §MG, §IM, §SV, §SA)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0114 §MG — CP-6 B94: GOVERNED MIGRATION, CUTOVER, DOMAIN ACTIVATION, ROLLBACK AND ACCEPTANCE (F-P7-F-04: V8 ch.67 PR-67-003, PR-67-005,
-- PR-67-006, CAP-DL-06, AT-67, JRN-23; V9 ch.66 UX-66-003..006, JRN-23, CAP-PD-06 (alias CAP-DL-06)). Applies alone on top of 0001–0113 and the
-- prelude (0114 §0); nothing earlier is edited.
--
-- DESIGN D7 (the coordinator's, binding): a WAVE (an onboarding programme's migration into its TARGET domain — created DRAFT by §ON) reads the
-- legacy spreadsheet as CSV evidence collected through an `upload` source contract IN THE TARGET DOMAIN (custody; formula-risk cells recorded,
-- never evaluated; xlsx refused with a residual — no parser dependency) → a MAPPING version (column → canonical field from a CLOSED list, the
-- key column, transforms from a CLOSED list, the target kind) proposed by the implementation lead (automation may PROPOSE suggestions, never
-- preselected as approved) and APPROVED by the onboarding authority on its digest (signed `mapping`) → a REHEARSAL (a deterministic dry run
-- over the stored evidence bytes into staging rows, digested: the same input + mapping + target state → the same digest) whose RECONCILIATION
-- REPORT counts mapped / rejected (missing key, formula cell, bad value) / ambiguous (duplicate key) / unmapped columns / would_create /
-- would_match / conflict → remediation (a new mapping version or a corrected file) → rehearsal 2 → the CUTOVER APPROVED by the onboarding
-- authority on the rehearsal's digest (HELD while `data.migration` has no resolved accountable owner, the reconciliation has blocking rows, or
-- the rehearsal's mapping is not the approved one) → EXECUTION by the lead or an agent (automation executes INSIDE the approved plan: the rows
-- written are the APPROVED STAGING ROWS — nothing else can be named; a re-read whose input differs is refused `contract_changed`; per-row
-- savepoints, the B16 admit idiom) → the POST-CUTOVER RECONCILIATION (equal to the rehearsal, or the cutover held) → `tenancy.activate_domain`
-- (domain.activated) → the ROLLBACK (a rehearsal record AND a real path: the migrated entities retired append-only, the activation reverted and
-- re-recorded) → the ACCEPTANCE record (the exact versions and digests; claim `demonstration` — `customer` is never written by this product).
--
-- TARGET (Q4): suppliers → graph ENTITIES (organization) carrying a LEGACY IDENTIFIER system. The RISK RATING rides as PROVENANCE on the entity
-- (its `entity.identified` event and the executed row) — NOT as a B32 exposure proposal: prediction.register_exposure requires a declared RSK
-- strategy object, an ACTIVE risk taxonomy in the domain AND a named, active risk owner ("a material risk is never left unowned"), and the new
-- subsidiary domain has none of them at cutover (scene 3 is exactly that the risk owner is unfilled). RESIDUAL: the exposures are proposed by
-- the domain's risk owner after go-live (§IM / B32 routes), from the migrated provenance — the migration never registers or accepts one.
--
-- THREE CLAIMS, never mixed: CONSTRUCTION (these ports and the harness phase6-migration-b94); DEMONSTRATED OPERATION (the act on SYNTHETIC
-- NORDWERK records — an approval or acceptance by a SYNTHETIC persona demonstrates the software only); REAL CUSTOMER ACCEPTANCE (AT-67,
-- PR-67-006, UX-66-006 — R2, never claimed: the acceptance record's `claim` is `demonstration` by construction).
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- §MG.1 THE CLOSED VOCABULARIES ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* The canonical fields a supplier-risk column may map to (the key column maps to legacy_id; legacy_id and name are required). */
CREATE OR REPLACE FUNCTION onboarding.mg_fields() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY[
  'legacy_id', 'name', 'country', 'risk_rating', 'risk_category', 'annual_spend_eur', 'last_review_on'] $$;
/* The transforms a mapping may apply (pure, deterministic; the TypeScript `applyTransforms` is their one implementation). */
CREATE OR REPLACE FUNCTION onboarding.mg_transforms() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY[
  'trim', 'collapse_spaces', 'upper', 'lower', 'null_if_blank', 'iso_country', 'rating_scale', 'decimal', 'date_iso'] $$;
GRANT EXECUTE ON FUNCTION onboarding.mg_fields() TO eye_app, eye_commit;
GRANT EXECUTE ON FUNCTION onboarding.mg_transforms() TO eye_app, eye_commit;
/* The name normal form the migration compares against (a matched entity is one ACTIVE organization of the target domain with this form). */
CREATE OR REPLACE FUNCTION onboarding.mg_normal(p text) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT lower(regexp_replace(btrim(coalesce(p, '')), '\s+', ' ', 'g')) $$;
GRANT EXECUTE ON FUNCTION onboarding.mg_normal(text) TO eye_app, eye_commit;

-- §MG.2 THE TABLES (DOMAIN-scoped in the TARGET domain; RLS domain_isolation; SELECT to the runtime roles; written by the ports only) ─────────
/* THE WAVE: one migration of a programme into its target domain from one upload source. state is the PROGRESSION; held_reasons (non-empty ⇔
   held) is the blocking list (PR-67-005: pause at the last verified boundary, expose the gaps). */
CREATE TABLE onboarding.migration_waves (
  wave_id            uuid PRIMARY KEY,
  scope              text NOT NULL DEFAULT 'DOMAIN' CHECK (scope = 'DOMAIN'),
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  programme_id       uuid NOT NULL,
  wave_key           text NOT NULL CHECK (wave_key ~ '^[a-z][a-z0-9_.-]{2,62}$'),
  title              text NOT NULL CHECK (length(btrim(title)) BETWEEN 4 AND 200),
  source_id          uuid NOT NULL,
  target_kind        text NOT NULL DEFAULT 'organization' CHECK (target_kind IN ('organization')),
  identifier_system  text NOT NULL CHECK (identifier_system ~ '^[a-z0-9][a-z0-9_.:-]{1,63}$'),
  identifier_authority text NOT NULL CHECK (length(btrim(identifier_authority)) >= 2),
  state              text NOT NULL DEFAULT 'planned' CHECK (state IN ('planned', 'rehearsing', 'reconciled', 'cutover_approved', 'executed', 'verified', 'activated',
                                                                   'accepted', 'rolled_back', 'withdrawn')),
  held_reasons       jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(held_reasons) = 'array'),
  held               boolean GENERATED ALWAYS AS (jsonb_array_length(held_reasons) > 0) STORED,
  created_by         uuid NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT omw_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT omw_key UNIQUE (tenant_id, domain_id, wave_key)
);

/* A MAPPING VERSION (CAP-DL-06): spec = {key_column, columns: [{column, field | null, transforms: [], ignore}], target_kind, identifier_system};
   proposed by the lead (basis: manual | adopted_suggestions — automation's suggestions are adopted by a human proposal, never pre-approved);
   decided by the onboarding authority on its digest; an approval SIGNED (`mapping`) and supersedes the prior approved version. */
CREATE TABLE onboarding.migration_mappings (
  wave_id            uuid NOT NULL REFERENCES onboarding.migration_waves (wave_id),
  version            int  NOT NULL CHECK (version >= 1),
  scope              text NOT NULL DEFAULT 'DOMAIN' CHECK (scope = 'DOMAIN'),
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  spec               jsonb NOT NULL CHECK (jsonb_typeof(spec) = 'object'),
  digest             text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  basis              text NOT NULL DEFAULT 'manual' CHECK (basis IN ('manual', 'adopted_suggestions')),
  rationale          text NOT NULL CHECK (length(btrim(rationale)) >= 8),
  state              text NOT NULL DEFAULT 'proposed' CHECK (state IN ('proposed', 'approved', 'rejected', 'superseded', 'withdrawn')),
  proposed_by        uuid NOT NULL,
  proposed_by_kind   text NOT NULL,
  proposed_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  decided_by         uuid,
  decided_at         timestamptz,
  decision_reason    text,
  signature_id       uuid,
  correlation_id     uuid NOT NULL,
  PRIMARY KEY (wave_id, version),
  CONSTRAINT omm_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT omm_decided CHECK (state IN ('proposed', 'withdrawn') OR (decided_by IS NOT NULL AND decided_at IS NOT NULL)),
  CONSTRAINT omm_sod CHECK (decided_by IS NULL OR decided_by <> proposed_by),
  CONSTRAINT omm_signed CHECK (state NOT IN ('approved', 'superseded') OR signature_id IS NOT NULL)
);
CREATE UNIQUE INDEX omm_one_approved ON onboarding.migration_mappings (wave_id) WHERE state = 'approved';

/* A REHEARSAL (a deterministic dry run) — or the POST-CUTOVER reconciliation (kind post_cutover, compared to the approved rehearsal). The
   reconciliation report is `counts` + the staging rows; input_digest covers what was read (mapping digest, the bytes' digest, the header, the
   parsed rows); plan_digest (THE REHEARSAL DIGEST a cutover is approved on) adds the dispositions against the target domain. */
CREATE TABLE onboarding.migration_rehearsals (
  rehearsal_id       uuid PRIMARY KEY,
  scope              text NOT NULL DEFAULT 'DOMAIN' CHECK (scope = 'DOMAIN'),
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  wave_id            uuid NOT NULL REFERENCES onboarding.migration_waves (wave_id),
  seq                int  NOT NULL CHECK (seq >= 1),
  kind               text NOT NULL CHECK (kind IN ('rehearsal', 'post_cutover')),
  mapping_version    int,
  mapping_digest     text,
  mapping_state      text,
  input              jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(input) = 'object'),
  columns            text[] NOT NULL DEFAULT '{}',
  unmapped_columns   text[] NOT NULL DEFAULT '{}',
  missing_columns    text[] NOT NULL DEFAULT '{}',
  counts             jsonb NOT NULL CHECK (jsonb_typeof(counts) = 'object'),
  blocking           int  NOT NULL CHECK (blocking >= 0),
  input_digest       text CHECK (input_digest IS NULL OR input_digest ~ '^[0-9a-f]{64}$'),
  plan_digest        text NOT NULL CHECK (plan_digest ~ '^[0-9a-f]{64}$'),
  cutover_id         uuid,
  compared_to        uuid REFERENCES onboarding.migration_rehearsals (rehearsal_id),
  equal              boolean,
  ran_by             uuid NOT NULL,
  ran_by_kind        text NOT NULL,
  ran_at             timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT omr_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT omr_seq UNIQUE (wave_id, seq),
  CONSTRAINT omr_kind CHECK ((kind = 'rehearsal') = (mapping_version IS NOT NULL AND input_digest IS NOT NULL)),
  CONSTRAINT omr_post CHECK (kind <> 'post_cutover' OR (compared_to IS NOT NULL AND equal IS NOT NULL AND cutover_id IS NOT NULL))
);
CREATE TRIGGER omr_append_only BEFORE UPDATE OR DELETE ON onboarding.migration_rehearsals FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

/* The STAGING rows of a rehearsal (append-only): one per legacy row — the mapped values, the disposition and its reasons, the matched entity. */
CREATE TABLE onboarding.migration_staging (
  rehearsal_id       uuid NOT NULL REFERENCES onboarding.migration_rehearsals (rehearsal_id),
  row_no             int  NOT NULL CHECK (row_no >= 1),
  scope              text NOT NULL DEFAULT 'DOMAIN' CHECK (scope = 'DOMAIN'),
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  legacy_id          text,
  name               text,
  "values"           jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof("values") = 'object'),
  disposition        text NOT NULL CHECK (disposition IN ('would_create', 'would_match', 'rejected', 'ambiguous', 'conflict')),
  reasons            text[] NOT NULL DEFAULT '{}',
  formula_cells      text[] NOT NULL DEFAULT '{}',
  match_entity_id    uuid,
  PRIMARY KEY (rehearsal_id, row_no),
  CONSTRAINT oms_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT oms_match CHECK ((disposition = 'would_match') = (match_entity_id IS NOT NULL))
);
CREATE TRIGGER oms_append_only BEFORE UPDATE OR DELETE ON onboarding.migration_staging FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

/* THE CUTOVER: requested by the lead on a rehearsal; HELD (held_reasons) while a blocking item stands; APPROVED by the onboarding authority on
   the rehearsal's plan digest (signed `cutover`); executed; verified by the post-cutover reconciliation; activated; or rolled back. */
CREATE TABLE onboarding.migration_cutovers (
  cutover_id         uuid PRIMARY KEY,
  scope              text NOT NULL DEFAULT 'DOMAIN' CHECK (scope = 'DOMAIN'),
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  wave_id            uuid NOT NULL REFERENCES onboarding.migration_waves (wave_id),
  rehearsal_id       uuid NOT NULL REFERENCES onboarding.migration_rehearsals (rehearsal_id),
  plan_digest        text NOT NULL CHECK (plan_digest ~ '^[0-9a-f]{64}$'),
  mapping_version    int  NOT NULL,
  state              text NOT NULL DEFAULT 'requested' CHECK (state IN ('requested', 'approved', 'executed', 'verified', 'activated', 'rolled_back', 'superseded')),
  held_reasons       jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(held_reasons) = 'array'),
  held               boolean GENERATED ALWAYS AS (jsonb_array_length(held_reasons) > 0) STORED,
  requested_by       uuid NOT NULL,
  requested_at       timestamptz NOT NULL DEFAULT clock_timestamp(),
  approved_by        uuid,
  approved_at        timestamptz,
  approval_reason    text,
  signature_id       uuid,
  executed_by        uuid,
  executed_by_kind   text,
  executed_at        timestamptz,
  execution          jsonb,
  verified_at        timestamptz,
  post_rehearsal_id  uuid,
  activated_at       timestamptz,
  rolled_back_at     timestamptz,
  updated_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT omc_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT omc_sod CHECK (approved_by IS NULL OR approved_by <> requested_by),
  CONSTRAINT omc_approved CHECK (state IN ('requested', 'superseded') OR (approved_by IS NOT NULL AND signature_id IS NOT NULL))
);
CREATE UNIQUE INDEX omc_one_open ON onboarding.migration_cutovers (wave_id) WHERE state NOT IN ('rolled_back', 'superseded');

/* What the execution wrote, per approved staging row (append-only): created | matched | failed, the entity and identifier, the PROVENANCE. */
CREATE TABLE onboarding.migration_executed_rows (
  cutover_id         uuid NOT NULL REFERENCES onboarding.migration_cutovers (cutover_id),
  row_no             int  NOT NULL,
  scope              text NOT NULL DEFAULT 'DOMAIN' CHECK (scope = 'DOMAIN'),
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  legacy_id          text NOT NULL,
  outcome            text NOT NULL CHECK (outcome IN ('created', 'matched', 'failed')),
  entity_id          uuid,
  identifier_id      uuid,
  provenance         jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason             text,
  executed_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (cutover_id, row_no),
  CONSTRAINT omx_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT omx_outcome CHECK ((outcome = 'failed') = (entity_id IS NULL AND reason IS NOT NULL))
);
CREATE TRIGGER omx_append_only BEFORE UPDATE OR DELETE ON onboarding.migration_executed_rows FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

/* ROLLBACK records (append-only): the REHEARSAL of a rollback (its plan and digest) and its EXECUTION (on that digest, by the authority). */
CREATE TABLE onboarding.migration_rollbacks (
  rollback_id        uuid PRIMARY KEY,
  scope              text NOT NULL DEFAULT 'DOMAIN' CHECK (scope = 'DOMAIN'),
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  cutover_id         uuid NOT NULL REFERENCES onboarding.migration_cutovers (cutover_id),
  kind               text NOT NULL CHECK (kind IN ('rehearsal', 'executed')),
  plan               jsonb NOT NULL CHECK (jsonb_typeof(plan) = 'object'),
  digest             text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  rehearsal_of       uuid REFERENCES onboarding.migration_rollbacks (rollback_id),
  reason             text,
  recorded_by        uuid NOT NULL,
  recorded_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT omb_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT omb_exec CHECK (kind <> 'executed' OR (rehearsal_of IS NOT NULL AND reason IS NOT NULL))
);
CREATE TRIGGER omb_append_only BEFORE UPDATE OR DELETE ON onboarding.migration_rollbacks FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

/* THE ACCEPTANCE record (PR-67-006; append-only): the exact versions and digests it binds, accepted or withheld by the onboarding authority on the
   candidate's digest, SIGNED `acceptance`. claim is `demonstration` BY CONSTRUCTION: real customer acceptance is R2 and never written here. */
CREATE TABLE onboarding.migration_acceptances (
  acceptance_id      uuid PRIMARY KEY,
  scope              text NOT NULL DEFAULT 'DOMAIN' CHECK (scope = 'DOMAIN'),
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  wave_id            uuid NOT NULL REFERENCES onboarding.migration_waves (wave_id),
  cutover_id         uuid REFERENCES onboarding.migration_cutovers (cutover_id),
  programme_id       uuid NOT NULL,
  decision           text NOT NULL CHECK (decision IN ('accepted', 'withheld')),
  claim              text NOT NULL DEFAULT 'demonstration' CHECK (claim = 'demonstration'),
  bound              jsonb NOT NULL CHECK (jsonb_typeof(bound) = 'object'),
  digest             text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  reason             text NOT NULL CHECK (length(btrim(reason)) >= 8),
  decided_by         uuid NOT NULL,
  decided_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  signature_id       uuid,
  correlation_id     uuid NOT NULL,
  CONSTRAINT oma_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT oma_signed CHECK (decision <> 'accepted' OR signature_id IS NOT NULL)
);
CREATE TRIGGER oma_append_only BEFORE UPDATE OR DELETE ON onboarding.migration_acceptances FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['onboarding.migration_waves', 'onboarding.migration_mappings', 'onboarding.migration_rehearsals', 'onboarding.migration_staging',
                           'onboarding.migration_cutovers', 'onboarding.migration_executed_rows', 'onboarding.migration_rollbacks', 'onboarding.migration_acceptances'] LOOP
    EXECUTE format('REVOKE ALL ON %s FROM PUBLIC', t);
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$CREATE POLICY domain_isolation ON %s USING (tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain()))$f$, t);
    EXECUTE format('GRANT SELECT ON %s TO eye_app, eye_commit', t);
  END LOOP;
END $$;

-- §MG.3 INTERNAL HELPERS (SECURITY DEFINER; REVOKE PUBLIC; called by the ports below) ──────────────────────────────────────────────────────────
/* The acting principal is the context's own (every port). */
CREATE OR REPLACE FUNCTION onboarding.mg_assert_actor(p_noun text, p_actor uuid) RETURNS void
LANGUAGE plpgsql STABLE SET search_path = public, pg_catalog, pg_temp AS $$
BEGIN
  IF p_actor IS NULL OR p_actor IS DISTINCT FROM public.eye_principal() THEN
    RAISE EXCEPTION '% rejected (actor): the act is recorded by the acting principal of the established context', p_noun USING ERRCODE = '42501';
  END IF;
END $$;
REVOKE ALL ON FUNCTION onboarding.mg_assert_actor(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION onboarding.mg_assert_actor(text, uuid) TO eye_commit;

/* The wave, locked, of this tenant/domain (404 otherwise). */
CREATE OR REPLACE FUNCTION onboarding.mg_wave(p_noun text, p_wave uuid, p_tenant uuid, p_domain uuid) RETURNS onboarding.migration_waves
LANGUAGE plpgsql SECURITY DEFINER SET search_path = onboarding, pg_catalog, pg_temp AS $$
DECLARE w onboarding.migration_waves%ROWTYPE;
BEGIN
  SELECT * INTO w FROM onboarding.migration_waves x WHERE x.wave_id = p_wave AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '% rejected (unknown_wave): % is not a migration wave of this domain', p_noun, coalesce(p_wave::text, '<none>') USING ERRCODE = '23503'; END IF;
  RETURN w;
END $$;
REVOKE ALL ON FUNCTION onboarding.mg_wave(text, uuid, uuid, uuid) FROM PUBLIC;

/* The cutover, locked, of this tenant/domain (404 otherwise). */
CREATE OR REPLACE FUNCTION onboarding.mg_cutover(p_noun text, p_cutover uuid, p_tenant uuid, p_domain uuid) RETURNS onboarding.migration_cutovers
LANGUAGE plpgsql SECURITY DEFINER SET search_path = onboarding, pg_catalog, pg_temp AS $$
DECLARE c onboarding.migration_cutovers%ROWTYPE;
BEGIN
  SELECT * INTO c FROM onboarding.migration_cutovers x WHERE x.cutover_id = p_cutover AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '% rejected (unknown_cutover): % is not a cutover of this domain', p_noun, coalesce(p_cutover::text, '<none>') USING ERRCODE = '23503'; END IF;
  RETURN c;
END $$;
REVOKE ALL ON FUNCTION onboarding.mg_cutover(text, uuid, uuid, uuid) FROM PUBLIC;

/* The domain's lifecycle status (draft | active | …). */
CREATE OR REPLACE FUNCTION onboarding.mg_domain_status(p_tenant uuid, p_domain uuid) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = tenancy, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'a domain''s lifecycle status');
  RETURN (SELECT d.status FROM tenancy.domains d WHERE d.id = p_domain AND d.tenant_id = p_tenant);
END $$;
/* The domain's lifecycle events (created / drafted / activated / activation_reverted), oldest first — a guarded definer read. */
CREATE OR REPLACE FUNCTION onboarding.mg_domain_lifecycle(p_tenant uuid, p_domain uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = tenancy, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'a domain''s lifecycle events');
  RETURN jsonb_build_object('status', (SELECT d.status FROM tenancy.domains d WHERE d.id = p_domain AND d.tenant_id = p_tenant),
    'name', (SELECT d.name FROM tenancy.domains d WHERE d.id = p_domain AND d.tenant_id = p_tenant),
    'activated_at', (SELECT d.activated_at FROM tenancy.domains d WHERE d.id = p_domain AND d.tenant_id = p_tenant),
    'events', coalesce((SELECT jsonb_agg(jsonb_build_object('event', e.event, 'occurred_at', e.occurred_at, 'details', e.details) ORDER BY e.occurred_at, e.id)
                          FROM tenancy.lifecycle_events e WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain), '[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION onboarding.mg_domain_lifecycle(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION onboarding.mg_domain_lifecycle(uuid, uuid) TO eye_app, eye_commit;
REVOKE ALL ON FUNCTION onboarding.mg_domain_status(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION onboarding.mg_domain_status(uuid, uuid) TO eye_app, eye_commit;

/* Raise an item once: an OPEN item of the class on the subject answers itself (a re-check never duplicates the escalation). */
CREATE OR REPLACE FUNCTION onboarding.mg_raise_once(p_tenant uuid, p_domain uuid, p_class text, p_kind text, p_subject uuid, p_title text, p_reasons jsonb,
                                                    p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = executive, pg_catalog, pg_temp AS $$
DECLARE i executive.attention_items%ROWTYPE;
BEGIN
  SELECT * INTO i FROM executive.attention_items x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.signal_class = p_class AND x.subject_id = p_subject AND x.state <> 'closed'
   ORDER BY x.created_at DESC LIMIT 1;
  IF FOUND THEN RETURN jsonb_build_object('item_id', i.item_id, 'state', i.state, 'existing', true); END IF;
  RETURN executive.b33_raise_routed(p_tenant, p_domain, p_class, p_kind, p_subject, p_title, p_reasons, NULL, gen_random_uuid(), 'onboarding.' || p_kind, jsonb_build_object('raised_by', 'b94.mg'),
                                    NULL, p_actor, p_correlation);
END $$;
REVOKE ALL ON FUNCTION onboarding.mg_raise_once(uuid, uuid, text, text, uuid, text, jsonb, uuid, uuid) FROM PUBLIC;

/* A requested (not yet approved) cutover of the wave SUPERSEDED (a newer rehearsal or request): its items close, its ledger says so. */
CREATE OR REPLACE FUNCTION onboarding.mg_supersede_requested(p_tenant uuid, p_domain uuid, p_wave uuid, p_reason text, p_actor uuid, p_correlation uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = onboarding, executive, pg_catalog, pg_temp AS $$
DECLARE v uuid;
BEGIN
  FOR v IN SELECT x.cutover_id FROM onboarding.migration_cutovers x WHERE x.wave_id = p_wave AND x.state = 'requested' FOR UPDATE LOOP
    UPDATE onboarding.migration_cutovers SET state = 'superseded', held_reasons = '[]'::jsonb, updated_at = clock_timestamp() WHERE cutover_id = v;
    PERFORM executive.b33_close_items(p_tenant, p_domain, NULL, 'cutover', v, p_reason, p_actor, p_correlation);
    PERFORM executive._cancel_human_tasks(p_tenant, p_domain, jsonb_build_object('kind', 'cutover', 'id', v, 'what', 'cutover'), ARRAY['onboarding.approve'], p_reason, p_actor, p_correlation);
    PERFORM onboarding.ledger('onboarding', p_tenant, p_domain, 'cutover', v, 1, 'cutover.superseded', p_actor, jsonb_build_object('wave_id', p_wave, 'reason', p_reason), p_correlation);
  END LOOP;
  UPDATE onboarding.migration_waves SET held_reasons = coalesce((SELECT jsonb_agg(h) FROM jsonb_array_elements(held_reasons) h WHERE h ->> 'kind' <> 'cutover'), '[]'::jsonb)
   WHERE wave_id = p_wave;
END $$;
REVOKE ALL ON FUNCTION onboarding.mg_supersede_requested(uuid, uuid, uuid, text, uuid, uuid) FROM PUBLIC;

/* THE APPROVAL TASK (the prelude's human task kind `onboarding.approve`): every act that awaits the customer authority opens one for the
   onboarding_authority role (idempotent on its dedupe key); the deciding act resolves it, a superseding act cancels it. subject.what names
   the decision (mapping | cutover | rollback | acceptance). */
CREATE OR REPLACE FUNCTION onboarding.mg_open_task(p_tenant uuid, p_domain uuid, p_kind text, p_id uuid, p_what text, p_dedupe text, p_title text, p_details jsonb, p_proposer uuid,
                                                   p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = executive, pg_catalog, pg_temp AS $$
BEGIN
  RETURN executive._open_human_task(gen_random_uuid(), p_tenant, p_domain, 'onboarding.approve', p_dedupe,
    jsonb_build_object('kind', p_kind, 'id', p_id, 'what', p_what) || coalesce(p_details, '{}'::jsonb), p_title, NULL, ARRAY['onboarding_authority'],
    jsonb_build_object('rule', 'a named human holding onboarding_authority, on the exact digest — never the proposer, never an implementation lead, never an agent', 'proposer', p_proposer),
    NULL, '{}'::jsonb, NULL, NULL, p_actor, p_correlation);
END $$;
REVOKE ALL ON FUNCTION onboarding.mg_open_task(uuid, uuid, text, uuid, text, text, text, jsonb, uuid, uuid, uuid) FROM PUBLIC;

/* Validate a mapping spec against the closed lists; returns it normalised (the canonical form the digest covers). */
CREATE OR REPLACE FUNCTION onboarding.mg_validate_spec(p_spec jsonb, p_identifier_system text) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path = onboarding, pg_catalog, pg_temp AS $$
DECLARE c jsonb; v_cols jsonb := '[]'::jsonb; v_seen_cols text[] := '{}'; v_seen_fields text[] := '{}'; v_col text; v_field text; v_tr text; v_key text; v_ignore boolean;
BEGIN
  IF p_spec IS NULL OR jsonb_typeof(p_spec) <> 'object' OR jsonb_typeof(p_spec -> 'columns') <> 'array' OR jsonb_array_length(p_spec -> 'columns') = 0 THEN
    RAISE EXCEPTION 'migration mapping rejected (spec): a mapping is {key_column, columns: [{column, field, transforms, ignore}]} with at least one column' USING ERRCODE = '22023';
  END IF;
  v_key := btrim(coalesce(p_spec ->> 'key_column', ''));
  FOR c IN SELECT x FROM jsonb_array_elements(p_spec -> 'columns') x LOOP
    v_col := btrim(coalesce(c ->> 'column', ''));
    IF length(v_col) NOT BETWEEN 1 AND 120 THEN RAISE EXCEPTION 'migration mapping rejected (spec): every column names its legacy header (1 to 120 characters)' USING ERRCODE = '22023'; END IF;
    IF v_col = ANY (v_seen_cols) THEN RAISE EXCEPTION 'migration mapping rejected (spec): column "%" is mapped twice', v_col USING ERRCODE = '22023'; END IF;
    v_seen_cols := v_seen_cols || v_col;
    v_ignore := coalesce((c ->> 'ignore')::boolean, false);
    v_field := nullif(btrim(coalesce(c ->> 'field', '')), '');
    IF v_ignore AND v_field IS NOT NULL THEN RAISE EXCEPTION 'migration mapping rejected (spec): column "%" is either ignored or mapped, not both', v_col USING ERRCODE = '22023'; END IF;
    IF NOT v_ignore AND v_field IS NULL THEN RAISE EXCEPTION 'migration mapping rejected (spec): column "%" maps to a canonical field or is declared ignored', v_col USING ERRCODE = '22023'; END IF;
    IF v_field IS NOT NULL AND NOT (v_field = ANY (onboarding.mg_fields())) THEN
      RAISE EXCEPTION 'migration mapping rejected (field): % is not a canonical field (%)', v_field, array_to_string(onboarding.mg_fields(), ', ') USING ERRCODE = '22023';
    END IF;
    IF v_field IS NOT NULL AND v_field = ANY (v_seen_fields) THEN RAISE EXCEPTION 'migration mapping rejected (field): % is mapped from two columns', v_field USING ERRCODE = '22023'; END IF;
    IF v_field IS NOT NULL THEN v_seen_fields := v_seen_fields || v_field; END IF;
    IF c ? 'transforms' AND jsonb_typeof(c -> 'transforms') <> 'array' THEN RAISE EXCEPTION 'migration mapping rejected (spec): transforms is a list' USING ERRCODE = '22023'; END IF;
    FOR v_tr IN SELECT jsonb_array_elements_text(coalesce(c -> 'transforms', '[]'::jsonb)) LOOP
      IF NOT (v_tr = ANY (onboarding.mg_transforms())) THEN
        RAISE EXCEPTION 'migration mapping rejected (transform): % is not a transform of the closed list (%)', v_tr, array_to_string(onboarding.mg_transforms(), ', ') USING ERRCODE = '22023';
      END IF;
    END LOOP;
    IF v_ignore AND jsonb_array_length(coalesce(c -> 'transforms', '[]'::jsonb)) > 0 THEN RAISE EXCEPTION 'migration mapping rejected (spec): an ignored column carries no transform' USING ERRCODE = '22023'; END IF;
    v_cols := v_cols || jsonb_build_array(jsonb_build_object('column', v_col, 'field', v_field, 'transforms', coalesce(c -> 'transforms', '[]'::jsonb), 'ignore', v_ignore));
  END LOOP;
  IF NOT ('legacy_id' = ANY (v_seen_fields)) OR NOT ('name' = ANY (v_seen_fields)) THEN
    RAISE EXCEPTION 'migration mapping rejected (field): a supplier mapping maps legacy_id (the key) and name' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_cols) x WHERE x ->> 'column' = v_key AND x ->> 'field' = 'legacy_id') THEN
    RAISE EXCEPTION 'migration mapping rejected (key): key_column "%" is the column mapped to legacy_id', v_key USING ERRCODE = '22023';
  END IF;
  RETURN jsonb_build_object('key_column', v_key, 'columns', v_cols, 'target_kind', 'organization', 'identifier_system', p_identifier_system);
END $$;
GRANT EXECUTE ON FUNCTION onboarding.mg_validate_spec(jsonb, text) TO eye_app, eye_commit;

/* THE CLASSIFICATION (deterministic; the record port and the execution re-check share it): the parsed rows (TypeScript parses the CSV and
   applies the transforms — `parseLegacy`) classified against the TARGET domain: a parse reason → rejected; a key shared by two rows → ambiguous
   (every row of it); the (system, key) held by an entity → would_match when that entity is an active organization of the same normal name, else
   conflict; else one active organization of the same normal name → would_match, several → conflict, none → would_create. Returns {rows, counts}. */
CREATE OR REPLACE FUNCTION onboarding.mg_classify(p_tenant uuid, p_domain uuid, p_system text, p_rows jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = onboarding, graph, pg_catalog, pg_temp AS $$
DECLARE r jsonb; v_out jsonb := '[]'::jsonb; v_disp text; v_reasons text[]; v_match uuid; v_holder record; v_n int; v_key text; v_name text;
        c_create int := 0; c_match int := 0; c_rej int := 0; c_amb int := 0; c_conf int := 0; c_mk int := 0; c_fc int := 0; c_bad int := 0;
BEGIN
  FOR r IN SELECT x FROM jsonb_array_elements(p_rows) x ORDER BY (x ->> 'row_no')::int LOOP
    v_key := nullif(btrim(coalesce(r ->> 'legacy_id', '')), ''); v_name := nullif(btrim(coalesce(r ->> 'name', '')), '');
    v_reasons := ARRAY(SELECT jsonb_array_elements_text(coalesce(r -> 'reasons', '[]'::jsonb)));
    v_match := NULL;
    IF cardinality(v_reasons) > 0 THEN
      v_disp := 'rejected';
      IF EXISTS (SELECT 1 FROM unnest(v_reasons) z WHERE z LIKE 'missing_key%') THEN c_mk := c_mk + 1; END IF;
      IF EXISTS (SELECT 1 FROM unnest(v_reasons) z WHERE z LIKE 'formula_cell%') THEN c_fc := c_fc + 1; END IF;
      IF EXISTS (SELECT 1 FROM unnest(v_reasons) z WHERE z LIKE 'bad_value%' OR z LIKE 'missing_name%') THEN c_bad := c_bad + 1; END IF;
    ELSIF v_key IS NULL OR v_name IS NULL THEN
      v_disp := 'rejected'; v_reasons := ARRAY[CASE WHEN v_key IS NULL THEN 'missing_key' ELSE 'missing_name' END];
      IF v_key IS NULL THEN c_mk := c_mk + 1; ELSE c_bad := c_bad + 1; END IF;
    ELSIF (SELECT count(*) FROM jsonb_array_elements(p_rows) y WHERE upper(btrim(coalesce(y ->> 'legacy_id', ''))) = upper(v_key)
             AND jsonb_array_length(coalesce(y -> 'reasons', '[]'::jsonb)) = 0) > 1 THEN
      v_disp := 'ambiguous'; v_reasons := ARRAY['duplicate_key: ' || v_key || ' names more than one legacy row'];
    ELSE
      SELECT e.entity_id, e.lifecycle_state, e.entity_type, e.normalized_name INTO v_holder
        FROM graph.entity_identifiers i JOIN graph.entities_current e ON e.entity_id = i.entity_id
       WHERE i.tenant_id = p_tenant AND i.domain_id = p_domain AND i.system_key = p_system AND i.identifier_value = v_key;
      IF FOUND THEN
        IF v_holder.lifecycle_state = 'active' AND v_holder.entity_type = 'organization' AND v_holder.normalized_name = onboarding.mg_normal(v_name) THEN
          v_disp := 'would_match'; v_match := v_holder.entity_id; v_reasons := ARRAY['identifier_held: the legacy identifier already names this entity'];
        ELSE
          v_disp := 'conflict'; v_reasons := ARRAY[format('identifier_conflict: %s %s already identifies a %s %s entity of another name', p_system, v_key, v_holder.lifecycle_state, v_holder.entity_type)];
        END IF;
      ELSE
        SELECT count(*), min(e.entity_id::text)::uuid INTO v_n, v_match FROM graph.entities_current e
         WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain AND e.entity_type = 'organization' AND e.lifecycle_state = 'active' AND e.normalized_name = onboarding.mg_normal(v_name);
        IF v_n = 0 THEN v_disp := 'would_create'; v_match := NULL;
        ELSIF v_n = 1 THEN v_disp := 'would_match'; v_reasons := ARRAY['name_match: one active organization of this domain has the same normal name'];
        ELSE v_disp := 'conflict'; v_match := NULL; v_reasons := ARRAY[format('name_conflict: %s active organizations share the normal name', v_n)];
        END IF;
      END IF;
    END IF;
    CASE v_disp WHEN 'would_create' THEN c_create := c_create + 1; WHEN 'would_match' THEN c_match := c_match + 1; WHEN 'rejected' THEN c_rej := c_rej + 1;
                WHEN 'ambiguous' THEN c_amb := c_amb + 1; ELSE c_conf := c_conf + 1; END CASE;
    v_out := v_out || jsonb_build_array(jsonb_build_object('row_no', (r ->> 'row_no')::int, 'legacy_id', v_key, 'name', v_name, 'values', coalesce(r -> 'values', '{}'::jsonb),
      'disposition', v_disp, 'reasons', to_jsonb(v_reasons), 'formula_cells', coalesce(r -> 'formula_cells', '[]'::jsonb), 'match_entity_id', v_match));
  END LOOP;
  RETURN jsonb_build_object('rows', v_out, 'counts', jsonb_build_object('rows', jsonb_array_length(p_rows), 'mapped', c_create + c_match, 'would_create', c_create, 'would_match', c_match,
    'rejected', c_rej, 'rejected_missing_key', c_mk, 'rejected_formula_cell', c_fc, 'rejected_bad_value', c_bad, 'ambiguous', c_amb, 'conflict', c_conf));
END $$;
REVOKE ALL ON FUNCTION onboarding.mg_classify(uuid, uuid, text, jsonb) FROM PUBLIC;

/* Validate the parsed rows a caller hands in (shape and the mapping's fields only) and return them in canonical form (the input digest covers it). */
CREATE OR REPLACE FUNCTION onboarding.mg_canonical_rows(p_noun text, p_rows jsonb, p_spec jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path = onboarding, pg_catalog, pg_temp AS $$
DECLARE r jsonb; v_out jsonb := '[]'::jsonb; v_fields text[]; v_k text; v_nos int[] := '{}'; v_no int;
BEGIN
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) = 0 THEN
    RAISE EXCEPTION '% rejected (input): the evidence yields no legacy row', p_noun USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_rows) > 50000 THEN RAISE EXCEPTION '% rejected (input): a wave migrates at most 50000 rows', p_noun USING ERRCODE = '22023'; END IF;
  v_fields := ARRAY(SELECT x ->> 'field' FROM jsonb_array_elements(p_spec -> 'columns') x WHERE x ->> 'field' IS NOT NULL);
  FOR r IN SELECT x FROM jsonb_array_elements(p_rows) x LOOP
    v_no := (r ->> 'row_no')::int;
    IF v_no IS NULL OR v_no < 1 OR v_no = ANY (v_nos) THEN RAISE EXCEPTION '% rejected (input): every row carries a distinct row_no ≥ 1', p_noun USING ERRCODE = '22023'; END IF;
    v_nos := v_nos || v_no;
    IF jsonb_typeof(coalesce(r -> 'values', '{}'::jsonb)) <> 'object' THEN RAISE EXCEPTION '% rejected (input): row % values are an object', p_noun, v_no USING ERRCODE = '22023'; END IF;
    FOR v_k IN SELECT jsonb_object_keys(coalesce(r -> 'values', '{}'::jsonb)) LOOP
      IF NOT (v_k = ANY (v_fields)) THEN
        RAISE EXCEPTION '% rejected (contract_changed): row % carries field % that the approved mapping does not map — nothing outside the approved mapping version is migrated', p_noun, v_no, v_k USING ERRCODE = '22023';
      END IF;
    END LOOP;
    v_out := v_out || jsonb_build_array(jsonb_build_object('row_no', v_no, 'legacy_id', r -> 'legacy_id', 'name', r -> 'name', 'values', coalesce(r -> 'values', '{}'::jsonb),
      'reasons', coalesce(r -> 'reasons', '[]'::jsonb), 'formula_cells', coalesce(r -> 'formula_cells', '[]'::jsonb)));
  END LOOP;
  RETURN (SELECT jsonb_agg(x ORDER BY (x ->> 'row_no')::int) FROM jsonb_array_elements(v_out) x);
END $$;
GRANT EXECUTE ON FUNCTION onboarding.mg_canonical_rows(text, jsonb, jsonb) TO eye_app, eye_commit;

/* The columns the file has that the mapping neither maps nor ignores (unmapped — blocking), and the mapping's columns the file lacks (missing). */
CREATE OR REPLACE FUNCTION onboarding.mg_column_diff(p_columns text[], p_spec jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object(
    'unmapped', coalesce((SELECT jsonb_agg(c ORDER BY c) FROM unnest(p_columns) c WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_spec -> 'columns') x WHERE x ->> 'column' = c)), '[]'::jsonb),
    'missing', coalesce((SELECT jsonb_agg(x ->> 'column' ORDER BY x ->> 'column') FROM jsonb_array_elements(p_spec -> 'columns') x WHERE NOT ((x ->> 'column') = ANY (p_columns))), '[]'::jsonb))
$$;
GRANT EXECUTE ON FUNCTION onboarding.mg_column_diff(text[], jsonb) TO eye_app, eye_commit;

/* The evidence of the wave's source, its manifest and its bytes' digest (404 / 422 otherwise). */
CREATE OR REPLACE FUNCTION onboarding.mg_evidence(p_noun text, p_tenant uuid, p_domain uuid, p_source uuid, p_evidence uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = onboarding, objects, observation, pg_catalog, pg_temp AS $$
DECLARE e record; m observation.blob_manifests%ROWTYPE;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the legacy evidence of a migration wave');
  SELECT o.object_id, o.object_version, o.payload, o.lifecycle_state, o.content_digest INTO e FROM objects.canonical_objects o
   WHERE o.object_id = p_evidence AND o.object_type = 'EVD' AND o.tenant_id = p_tenant AND o.domain_id = p_domain ORDER BY o.object_version DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION '% rejected (unknown_evidence): % is not an evidence object of this domain', p_noun, coalesce(p_evidence::text, '<none>') USING ERRCODE = '23503'; END IF;
  IF e.lifecycle_state = 'withdrawn' THEN RAISE EXCEPTION '% rejected (evidence): evidence % is withdrawn; its bytes are not served', p_noun, p_evidence USING ERRCODE = '22023'; END IF;
  SELECT * INTO m FROM observation.blob_manifests x WHERE x.manifest_id = (e.payload ->> 'manifest_id')::uuid AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION '% rejected (evidence): evidence % has no manifest; no bytes are reachable', p_noun, p_evidence USING ERRCODE = '22023'; END IF;
  IF m.source_id IS DISTINCT FROM p_source THEN
    RAISE EXCEPTION '% rejected (evidence): evidence % was collected by another source, not the wave''s legacy upload source', p_noun, p_evidence USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM observation.blob_tombstones t WHERE t.manifest_id = m.manifest_id) THEN
    RAISE EXCEPTION '% rejected (evidence): the bytes of evidence % have been governed-deleted', p_noun, p_evidence USING ERRCODE = '22023';
  END IF;
  RETURN jsonb_build_object('evidence_object_id', e.object_id, 'evidence_version', e.object_version, 'manifest_id', m.manifest_id, 'locator', m.locator, 'vault', m.vault,
                            'bytes_digest', m.content_digest, 'byte_length', m.byte_length, 'media_type', coalesce(m.media_type_sniffed, m.media_type_declared),
                            'media_type_declared', m.media_type_declared, 'source_id', m.source_id, 'canonical_digest', e.content_digest);
END $$;
REVOKE ALL ON FUNCTION onboarding.mg_evidence(text, uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION onboarding.mg_evidence(text, uuid, uuid, uuid, uuid) TO eye_app, eye_commit;

/* WHAT HOLDS A CUTOVER (live; UX-66-005): the accountable owner of `data.migration` not resolved (IA-04-005 — never inferred); the rehearsal's
   reconciliation has blocking rows; its mapping is not the wave's approved version; a later rehearsal exists; the target domain is not draft. */
CREATE OR REPLACE FUNCTION onboarding.mg_cutover_blocking(p_tenant uuid, p_domain uuid, p_wave uuid, p_rehearsal uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = onboarding, service, pg_catalog, pg_temp AS $$
DECLARE r onboarding.migration_rehearsals%ROWTYPE; v_out jsonb := '[]'::jsonb; v_owner jsonb; v_approved int; v_latest int; v_status text;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'what holds a cutover');
  SELECT * INTO r FROM onboarding.migration_rehearsals x WHERE x.rehearsal_id = p_rehearsal AND x.wave_id = p_wave AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RETURN jsonb_build_array(jsonb_build_object('kind', 'unknown_rehearsal', 'route', 'no such rehearsal of the wave')); END IF;
  v_owner := service.owner_resolution(p_tenant, p_domain, 'data.migration');
  IF coalesce(v_owner ->> 'state', 'undeclared') <> 'resolved' THEN
    v_out := v_out || jsonb_build_array(jsonb_build_object('kind', 'owner_gap', 'responsibility', 'data.migration', 'state', coalesce(v_owner ->> 'state', 'undeclared'),
      'owner_role', v_owner ->> 'owner_role', 'reason', coalesce(v_owner ->> 'reason', 'no accountable owner is resolved'), 'escalation_path', v_owner ->> 'escalation_path',
      'route', 'the responsibility matrix (data.migration) — fill or name the accountable owner; the cutover stays held until it resolves'));
  END IF;
  IF r.blocking > 0 THEN
    v_out := v_out || jsonb_build_array(jsonb_build_object('kind', 'reconciliation', 'blocking', r.blocking, 'counts', r.counts, 'unmapped_columns', to_jsonb(r.unmapped_columns),
      'missing_columns', to_jsonb(r.missing_columns), 'route', 'remediate: a new mapping version or a corrected file, then rehearse again'));
  END IF;
  SELECT m.version INTO v_approved FROM onboarding.migration_mappings m WHERE m.wave_id = p_wave AND m.state = 'approved';
  IF v_approved IS NULL OR v_approved <> r.mapping_version THEN
    v_out := v_out || jsonb_build_array(jsonb_build_object('kind', 'mapping_not_approved', 'mapping_version', r.mapping_version, 'approved_version', v_approved,
      'route', 'the onboarding authority approves the mapping version the rehearsal ran, or the lead rehearses the approved one'));
  END IF;
  SELECT max(x.seq) INTO v_latest FROM onboarding.migration_rehearsals x WHERE x.wave_id = p_wave AND x.kind = 'rehearsal';
  IF v_latest IS DISTINCT FROM r.seq THEN
    v_out := v_out || jsonb_build_array(jsonb_build_object('kind', 'rehearsal_superseded', 'rehearsal_seq', r.seq, 'latest_seq', v_latest,
      'route', 'request the cutover on the latest rehearsal'));
  END IF;
  v_status := onboarding.mg_domain_status(p_tenant, p_domain);
  IF v_status IS DISTINCT FROM 'draft' THEN
    v_out := v_out || jsonb_build_array(jsonb_build_object('kind', 'domain_state', 'status', v_status, 'route', 'a cutover migrates into a DRAFT target domain'));
  END IF;
  RETURN v_out;
END $$;
REVOKE ALL ON FUNCTION onboarding.mg_cutover_blocking(uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION onboarding.mg_cutover_blocking(uuid, uuid, uuid, uuid) TO eye_app, eye_commit;

/* THE POST-CUTOVER OBSERVATION (read live from the graph): per approved staging row that would create or match, is the legacy identifier on
   an ACTIVE entity (the matched one for a match)? Unexpected identifiers of the wave's system (outside the plan) and failed rows count against
   equality. → {expected, observed, missing: [row_no], failed, unexpected, equal}. */
CREATE OR REPLACE FUNCTION onboarding.mg_post_observed(p_cutover uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = onboarding, graph, pg_catalog, pg_temp AS $$
DECLARE c onboarding.migration_cutovers%ROWTYPE; w onboarding.migration_waves%ROWTYPE; v_expected int; v_observed int; v_missing jsonb; v_failed int; v_unexpected int;
        v_created int; v_matched int;
BEGIN
  SELECT * INTO c FROM onboarding.migration_cutovers x WHERE x.cutover_id = p_cutover;
  IF NOT FOUND THEN RETURN NULL; END IF;
  PERFORM observation.assert_read_scope(c.tenant_id, c.domain_id, 'a cutover''s post-cutover observation');
  SELECT * INTO w FROM onboarding.migration_waves x WHERE x.wave_id = c.wave_id;
  SELECT count(*) INTO v_expected FROM onboarding.migration_staging s WHERE s.rehearsal_id = c.rehearsal_id AND s.disposition IN ('would_create', 'would_match');
  WITH plan AS (
    SELECT s.row_no, s.legacy_id, s.disposition, s.match_entity_id FROM onboarding.migration_staging s
     WHERE s.rehearsal_id = c.rehearsal_id AND s.disposition IN ('would_create', 'would_match')
  ), seen AS (
    SELECT p.row_no, EXISTS (SELECT 1 FROM graph.entity_identifiers i JOIN graph.entities_current e ON e.entity_id = i.entity_id
                              WHERE i.tenant_id = c.tenant_id AND i.domain_id = c.domain_id AND i.system_key = w.identifier_system AND i.identifier_value = p.legacy_id
                                AND e.lifecycle_state = 'active' AND (p.disposition = 'would_create' OR e.entity_id = p.match_entity_id)) AS ok
      FROM plan p
  )
  SELECT count(*) FILTER (WHERE ok), coalesce(jsonb_agg(row_no ORDER BY row_no) FILTER (WHERE NOT ok), '[]'::jsonb) INTO v_observed, v_missing FROM seen;
  SELECT count(*) FILTER (WHERE x.outcome = 'failed'), count(*) FILTER (WHERE x.outcome = 'created'), count(*) FILTER (WHERE x.outcome = 'matched')
    INTO v_failed, v_created, v_matched FROM onboarding.migration_executed_rows x WHERE x.cutover_id = p_cutover;
  SELECT count(*) INTO v_unexpected FROM graph.entity_identifiers i
   WHERE i.tenant_id = c.tenant_id AND i.domain_id = c.domain_id AND i.system_key = w.identifier_system
     AND NOT EXISTS (SELECT 1 FROM onboarding.migration_staging s WHERE s.rehearsal_id = c.rehearsal_id AND s.disposition IN ('would_create', 'would_match') AND s.legacy_id = i.identifier_value);
  RETURN jsonb_build_object('expected', v_expected, 'observed', v_observed, 'missing', v_missing, 'failed', v_failed, 'unexpected', v_unexpected,
                            'created', v_created, 'matched', v_matched,
                            'equal', v_expected = v_observed AND v_failed = 0 AND v_unexpected = 0 AND c.state IN ('executed', 'verified', 'activated'));
END $$;
REVOKE ALL ON FUNCTION onboarding.mg_post_observed(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION onboarding.mg_post_observed(uuid) TO eye_app, eye_commit;

/* THE ROLLBACK PLAN (read live; never a write): the entities the cutover CREATED that are still active (to be RETIRED — append-only: the entity
   row is retired with an `entity.retired` event, its identifier stays as history), the identifiers it attached to MATCHED pre-existing entities
   (kept — append-only — and marked by the rollback's provenance), and the domain's activation (reverted to draft and re-recorded). */
CREATE OR REPLACE FUNCTION onboarding.mg_rollback_plan(p_cutover uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = onboarding, graph, tenancy, pg_catalog, pg_temp AS $$
DECLARE v_t uuid; v_d uuid;
BEGIN
  SELECT x.tenant_id, x.domain_id INTO v_t, v_d FROM onboarding.migration_cutovers x WHERE x.cutover_id = p_cutover;
  IF NOT FOUND THEN RETURN NULL; END IF;
  PERFORM observation.assert_read_scope(v_t, v_d, 'a cutover''s rollback plan');
  RETURN (SELECT jsonb_build_object(
    'cutover_id', c.cutover_id, 'cutover_state', c.state,
    'retire', coalesce((SELECT jsonb_agg(jsonb_build_object('row_no', x.row_no, 'legacy_id', x.legacy_id, 'entity_id', x.entity_id) ORDER BY x.row_no)
                          FROM onboarding.migration_executed_rows x JOIN graph.entities_current e ON e.entity_id = x.entity_id
                         WHERE x.cutover_id = c.cutover_id AND x.outcome = 'created' AND e.lifecycle_state = 'active'), '[]'::jsonb),
    'keep_identifiers', coalesce((SELECT jsonb_agg(jsonb_build_object('row_no', x.row_no, 'legacy_id', x.legacy_id, 'entity_id', x.entity_id) ORDER BY x.row_no)
                          FROM onboarding.migration_executed_rows x WHERE x.cutover_id = c.cutover_id AND x.outcome = 'matched'), '[]'::jsonb),
    'domain', jsonb_build_object('status', d.status, 'revert_to', CASE WHEN d.status = 'active' THEN 'draft' ELSE d.status END),
    'note', 'append-only: created entities are retired (entity.retired), identifiers stay as history, the activation is reverted and re-recorded (domain.activation_reverted); the source evidence and the staging stay')
  FROM onboarding.migration_cutovers c JOIN tenancy.domains d ON d.id = c.domain_id WHERE c.cutover_id = p_cutover);
END $$;
REVOKE ALL ON FUNCTION onboarding.mg_rollback_plan(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION onboarding.mg_rollback_plan(uuid) TO eye_app, eye_commit;

/* THE ACCEPTANCE CANDIDATE (PR-67-006): what an acceptance of the wave would bind — the exact mapping, rehearsals, post-cutover reconciliation,
   cutover, the configuration baseline (§ON's, when its table and a matching row exist; otherwise the given digest marked unverified), the live
   licence version (or `uncontracted`), the journeys and roles exercised, tenant/domain, deployment profile, the capability version, the period.
   Deterministic for the same records (no clock inside). */
CREATE OR REPLACE FUNCTION onboarding.mg_acceptance_candidate(p_tenant uuid, p_domain uuid, p_wave uuid, p_journeys text[], p_roles text[], p_baseline_digest text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = onboarding, commercial, tenancy, pg_catalog, pg_temp AS $$
DECLARE w onboarding.migration_waves%ROWTYPE; c onboarding.migration_cutovers%ROWTYPE; m onboarding.migration_mappings%ROWTYPE; p onboarding.programmes%ROWTYPE;
        lic record; v_base jsonb; v_ok boolean; v_rehearsals jsonb; v_post jsonb; v_dom tenancy.domains%ROWTYPE;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'an acceptance candidate');
  SELECT * INTO w FROM onboarding.migration_waves x WHERE x.wave_id = p_wave AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  SELECT * INTO c FROM onboarding.migration_cutovers x WHERE x.wave_id = p_wave AND x.state NOT IN ('rolled_back', 'superseded');
  SELECT * INTO m FROM onboarding.migration_mappings x WHERE x.wave_id = p_wave AND x.state = 'approved';
  SELECT * INTO p FROM onboarding.programmes x WHERE x.programme_id = w.programme_id AND x.superseded_at IS NULL;
  SELECT * INTO v_dom FROM tenancy.domains d WHERE d.id = p_domain;
  SELECT l.licence_id, l.version, l.state, l.package_key INTO lic FROM commercial.licences l WHERE l.tenant_id = p_tenant AND l.state <> 'superseded' ORDER BY l.version DESC LIMIT 1;
  SELECT coalesce(jsonb_agg(jsonb_build_object('rehearsal_id', r.rehearsal_id, 'seq', r.seq, 'mapping_version', r.mapping_version, 'plan_digest', r.plan_digest, 'blocking', r.blocking) ORDER BY r.seq), '[]'::jsonb)
    INTO v_rehearsals FROM onboarding.migration_rehearsals r WHERE r.wave_id = p_wave AND r.kind = 'rehearsal';
  SELECT jsonb_build_object('rehearsal_id', r.rehearsal_id, 'plan_digest', r.plan_digest, 'equal', r.equal, 'counts', r.counts) INTO v_post
    FROM onboarding.migration_rehearsals r WHERE r.rehearsal_id = c.post_rehearsal_id;
  IF p_baseline_digest IS NULL THEN v_base := jsonb_build_object('digest', NULL, 'verified', 'not_named');
  ELSIF to_regclass('onboarding.config_baselines') IS NULL THEN v_base := jsonb_build_object('digest', p_baseline_digest, 'verified', 'baseline_table_absent');
  ELSE
    BEGIN
      EXECUTE 'SELECT EXISTS (SELECT 1 FROM onboarding.config_baselines b WHERE b.tenant_id = $1 AND b.domain_id = $2 AND b.digest = $3)' INTO v_ok USING p_tenant, p_domain, p_baseline_digest;
      v_base := jsonb_build_object('digest', p_baseline_digest, 'verified', CASE WHEN v_ok THEN 'matched' ELSE 'no_such_baseline' END);
    EXCEPTION WHEN undefined_column THEN v_base := jsonb_build_object('digest', p_baseline_digest, 'verified', 'unverifiable');
    END;
  END IF;
  RETURN jsonb_build_object(
    'tenant_id', p_tenant, 'domain_id', p_domain, 'domain_name', v_dom.name, 'domain_status', v_dom.status,
    'programme', jsonb_build_object('programme_id', p.programme_id, 'version', p.version, 'digest', p.digest, 'deployment_profile', p.deployment_profile),
    'wave', jsonb_build_object('wave_id', w.wave_id, 'wave_key', w.wave_key, 'state', w.state, 'source_id', w.source_id, 'identifier_system', w.identifier_system),
    'mapping', CASE WHEN m.wave_id IS NULL THEN NULL ELSE jsonb_build_object('version', m.version, 'digest', m.digest, 'signature_id', m.signature_id) END,
    'rehearsals', v_rehearsals, 'post_cutover', v_post,
    'cutover', CASE WHEN c.cutover_id IS NULL THEN NULL ELSE jsonb_build_object('cutover_id', c.cutover_id, 'state', c.state, 'plan_digest', c.plan_digest, 'signature_id', c.signature_id,
                                                                                  'execution', c.execution, 'activated_at', c.activated_at) END,
    'baseline', v_base,
    'licence', CASE WHEN lic.licence_id IS NULL THEN jsonb_build_object('state', 'uncontracted') ELSE jsonb_build_object('licence_id', lic.licence_id, 'version', lic.version, 'state', lic.state, 'package_key', lic.package_key) END,
    'journeys', to_jsonb(coalesce(p_journeys, '{}')), 'roles', to_jsonb(coalesce(p_roles, '{}')),
    'deployment_profile', coalesce(p.deployment_profile, 'local-dev'), 'capability_version', 'B94 §MG (migration 0114)', 'consequence_class', 'C2',
    'period', jsonb_build_object('from', w.created_at, 'to', c.activated_at),
    'claim', 'demonstration');
END $$;
REVOKE ALL ON FUNCTION onboarding.mg_acceptance_candidate(uuid, uuid, uuid, text[], text[], text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION onboarding.mg_acceptance_candidate(uuid, uuid, uuid, text[], text[], text) TO eye_app, eye_commit;

-- §MG.4 THE PORTS ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* WAVE OPEN (onboarding.wave.open; the implementation lead): the programme's TARGET domain (draft), an UPLOAD source contract of the target
   domain (the legacy input), the legacy identifier system and its authority. */
CREATE OR REPLACE FUNCTION onboarding.open_wave(p_wave uuid, p_tenant uuid, p_domain uuid, p_programme uuid, p_key text, p_title text, p_source uuid, p_system text,
                                                p_authority text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = onboarding, observation, tenancy, pg_catalog, pg_temp AS $$
DECLARE p onboarding.programmes%ROWTYPE; s record;
BEGIN
  PERFORM observation.assert_authority(ARRAY['onboarding.wave.open']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM onboarding.mg_assert_actor('migration wave', p_actor);
  SELECT * INTO p FROM onboarding.programmes x WHERE x.programme_id = p_programme AND x.tenant_id = p_tenant AND x.superseded_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'migration wave rejected (unknown_programme): % is not an onboarding programme of this tenant', coalesce(p_programme::text, '<none>') USING ERRCODE = '23503'; END IF;
  IF p.state IN ('accepted', 'withdrawn') THEN RAISE EXCEPTION 'migration wave rejected (state): programme % is %', p.programme_key, p.state USING ERRCODE = '22023'; END IF;
  IF p.target_domain_id IS DISTINCT FROM p_domain THEN
    RAISE EXCEPTION 'migration wave rejected (target): the programme''s target domain is %, not this domain — a wave migrates into its programme''s target', coalesce(p.target_domain_id::text, '<none named>') USING ERRCODE = '22023';
  END IF;
  IF onboarding.mg_domain_status(p_tenant, p_domain) IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'migration wave rejected (state): the target domain is %, not draft — a governed migration fills a draft domain before it is activated', coalesce(onboarding.mg_domain_status(p_tenant, p_domain), '<none>') USING ERRCODE = '22023';
  END IF;
  SELECT c.source_id, c.connector_kind, c.lifecycle_state, c.source_key INTO s FROM observation.source_contracts_current c
   WHERE c.source_id = p_source AND c.tenant_id = p_tenant AND c.domain_id = p_domain ORDER BY c.contract_version DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'migration wave rejected (unknown_source): % is not a source contract of the target domain', coalesce(p_source::text, '<none>') USING ERRCODE = '23503'; END IF;
  IF s.connector_kind <> 'upload' THEN RAISE EXCEPTION 'migration wave rejected (source): the legacy input is an upload source contract (CSV evidence with custody); % is a % source', s.source_key, s.connector_kind USING ERRCODE = '22023'; END IF;
  IF p_key IS NULL OR p_key !~ '^[a-z][a-z0-9_.-]{2,62}$' THEN RAISE EXCEPTION 'migration wave rejected (key): a wave key is 3 to 63 characters of a-z, 0-9, _ . -' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_title, ''))) NOT BETWEEN 4 AND 200 THEN RAISE EXCEPTION 'migration wave rejected (title): a title is 4 to 200 characters' USING ERRCODE = '22023'; END IF;
  IF p_system IS NULL OR p_system !~ '^[a-z0-9][a-z0-9_.:-]{1,63}$' THEN RAISE EXCEPTION 'migration wave rejected (identifier): the legacy identifier system key is 2 to 64 characters of a-z, 0-9, _ . : -' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_authority, ''))) < 2 THEN RAISE EXCEPTION 'migration wave rejected (identifier): the identifier system names the authority that issues it' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM onboarding.migration_waves x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.wave_key = p_key) THEN
    RAISE EXCEPTION 'migration wave rejected (duplicate): wave % exists in this domain', p_key USING ERRCODE = '22023';
  END IF;
  INSERT INTO onboarding.migration_waves (wave_id, tenant_id, domain_id, programme_id, wave_key, title, source_id, identifier_system, identifier_authority, created_by, correlation_id)
  VALUES (p_wave, p_tenant, p_domain, p_programme, p_key, btrim(p_title), p_source, p_system, btrim(p_authority), p_actor, p_correlation);
  PERFORM onboarding.ledger('onboarding', p_tenant, p_domain, 'migration_wave', p_wave, 1, 'wave.opened', p_actor,
    jsonb_build_object('programme_id', p_programme, 'wave_key', p_key, 'source_id', p_source, 'identifier_system', p_system), p_correlation);
  RETURN (SELECT to_jsonb(x) FROM onboarding.migration_waves x WHERE x.wave_id = p_wave);
END $$;
REVOKE ALL ON FUNCTION onboarding.open_wave(uuid, uuid, uuid, uuid, text, text, uuid, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION onboarding.open_wave(uuid, uuid, uuid, uuid, text, text, uuid, text, text, uuid, uuid) TO eye_commit;

/* MAPPING PROPOSE (onboarding.mapping.propose; the lead): a new version (the spec validated against the closed lists); supersedes nothing
   until approved. */
CREATE OR REPLACE FUNCTION onboarding.propose_mapping(p_wave uuid, p_tenant uuid, p_domain uuid, p_spec jsonb, p_basis text, p_rationale text, p_expected_version int,
                                                      p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = onboarding, observation, pg_catalog, pg_temp AS $$
DECLARE w onboarding.migration_waves%ROWTYPE; v_spec jsonb; v_next int; v_digest text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['onboarding.mapping.propose']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM onboarding.mg_assert_actor('migration mapping', p_actor);
  w := onboarding.mg_wave('migration mapping', p_wave, p_tenant, p_domain);
  IF w.state NOT IN ('planned', 'rehearsing', 'reconciled') THEN RAISE EXCEPTION 'migration mapping rejected (state): wave % is % — its mapping is closed', w.wave_key, w.state USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_rationale, ''))) < 8 THEN RAISE EXCEPTION 'migration mapping rejected (rationale): a proposal states its rationale (8+ characters)' USING ERRCODE = '22023'; END IF;
  IF coalesce(p_basis, 'manual') NOT IN ('manual', 'adopted_suggestions') THEN RAISE EXCEPTION 'migration mapping rejected (basis): manual or adopted_suggestions' USING ERRCODE = '22023'; END IF;
  SELECT coalesce(max(m.version), 0) + 1 INTO v_next FROM onboarding.migration_mappings m WHERE m.wave_id = p_wave;
  IF p_expected_version IS NOT NULL AND p_expected_version <> v_next - 1 THEN
    RAISE EXCEPTION 'migration mapping rejected (stale): the wave''s latest mapping is v%, not v%', v_next - 1, p_expected_version USING ERRCODE = '22023';
  END IF;
  v_spec := onboarding.mg_validate_spec(p_spec, w.identifier_system);
  v_digest := onboarding.digest(jsonb_build_object('wave_id', p_wave, 'version', v_next, 'spec', v_spec));
  -- an undecided earlier proposal is WITHDRAWN by the newer one (never decided on anyone's behalf); its approval task cancelled
  UPDATE onboarding.migration_mappings SET state = 'withdrawn', decision_reason = format('withdrawn: v%s proposed before a decision', v_next)
   WHERE wave_id = p_wave AND state = 'proposed';
  PERFORM executive._cancel_human_tasks(p_tenant, p_domain, jsonb_build_object('kind', 'migration_wave', 'id', p_wave, 'what', 'mapping'), ARRAY['onboarding.approve'],
                                        format('withdrawn: v%s proposed before a decision', v_next), p_actor, p_correlation);
  INSERT INTO onboarding.migration_mappings (wave_id, version, tenant_id, domain_id, spec, digest, basis, rationale, proposed_by, proposed_by_kind, correlation_id)
  VALUES (p_wave, v_next, p_tenant, p_domain, v_spec, v_digest, coalesce(p_basis, 'manual'), btrim(p_rationale), p_actor, coalesce(onboarding.principal_kind(p_actor), 'unknown'), p_correlation);
  PERFORM onboarding.mg_open_task(p_tenant, p_domain, 'migration_wave', p_wave, 'mapping', format('mg-mapping-%s-v%s', p_wave, v_next),
    format('Approve or reject mapping v%s of migration wave %s (SYNTHETIC)', v_next, w.wave_key), jsonb_build_object('version', v_next, 'digest', v_digest), p_actor, p_actor, p_correlation);
  PERFORM onboarding.ledger('onboarding', p_tenant, p_domain, 'migration_mapping', p_wave, v_next, 'mapping.proposed', p_actor,
    jsonb_build_object('digest', v_digest, 'basis', coalesce(p_basis, 'manual'), 'columns', jsonb_array_length(v_spec -> 'columns')), p_correlation);
  UPDATE onboarding.migration_waves SET updated_at = clock_timestamp() WHERE wave_id = p_wave;
  RETURN (SELECT to_jsonb(x) FROM onboarding.migration_mappings x WHERE x.wave_id = p_wave AND x.version = v_next);
END $$;
REVOKE ALL ON FUNCTION onboarding.propose_mapping(uuid, uuid, uuid, jsonb, text, text, int, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION onboarding.propose_mapping(uuid, uuid, uuid, jsonb, text, text, int, uuid, uuid) TO eye_commit;

/* MAPPING DECIDE (onboarding.mapping.approve; the onboarding authority — assert_approver: a named human, never the proposer, never a lead,
   never an agent): approve | reject the PROPOSED version on its digest (stale → 409); an approval names its signature (kind mapping, subject =
   the wave, version = the mapping version, digest = the mapping digest, signer = the approver) and supersedes the prior approved version. */
CREATE OR REPLACE FUNCTION onboarding.decide_mapping(p_wave uuid, p_tenant uuid, p_domain uuid, p_version int, p_digest text, p_decision text, p_reason text, p_signature uuid,
                                                     p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = onboarding, executive, observation, pg_catalog, pg_temp AS $$
DECLARE w onboarding.migration_waves%ROWTYPE; m onboarding.migration_mappings%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['onboarding.mapping.approve']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM onboarding.mg_assert_actor('migration mapping', p_actor);
  w := onboarding.mg_wave('migration mapping', p_wave, p_tenant, p_domain);
  SELECT * INTO m FROM onboarding.migration_mappings x WHERE x.wave_id = p_wave AND x.version = p_version FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'migration mapping rejected (unknown_mapping): wave % has no mapping v%', w.wave_key, p_version USING ERRCODE = '23503'; END IF;
  PERFORM onboarding.assert_approver('migration mapping', p_actor, p_tenant, p_domain, ARRAY['onboarding_authority'], m.proposed_by, 'approving a migration mapping');
  IF m.state <> 'proposed' THEN RAISE EXCEPTION 'migration mapping rejected (state): mapping v% is %, not proposed', p_version, m.state USING ERRCODE = '22023'; END IF;
  IF p_digest IS DISTINCT FROM m.digest THEN
    RAISE EXCEPTION 'migration mapping rejected (stale): the digest seen (%) is not mapping v%''s digest — read the mapping again', coalesce(left(p_digest, 12), '<none>'), p_version USING ERRCODE = '22023';
  END IF;
  IF p_decision NOT IN ('approve', 'reject') THEN RAISE EXCEPTION 'migration mapping rejected (decision): approve or reject' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'migration mapping rejected (reason): a decision states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  IF p_decision = 'approve' THEN
    IF p_signature IS NULL OR NOT EXISTS (SELECT 1 FROM executive.signatures s WHERE s.signature_id = p_signature AND s.subject_kind = 'mapping' AND s.subject_id = p_wave
                                            AND s.subject_version = p_version AND s.subject_digest = m.digest AND s.signer = p_actor) THEN
      RAISE EXCEPTION 'migration mapping rejected (signature): an approval is signed by the approver over the mapping''s digest' USING ERRCODE = '22023';
    END IF;
    UPDATE onboarding.migration_mappings SET state = 'superseded' WHERE wave_id = p_wave AND state = 'approved';
  END IF;
  UPDATE onboarding.migration_mappings SET state = CASE WHEN p_decision = 'approve' THEN 'approved' ELSE 'rejected' END, decided_by = p_actor, decided_at = clock_timestamp(),
         decision_reason = btrim(p_reason), signature_id = CASE WHEN p_decision = 'approve' THEN p_signature END
   WHERE wave_id = p_wave AND version = p_version;
  PERFORM executive._resolve_human_tasks(p_tenant, p_domain, jsonb_build_object('kind', 'migration_wave', 'id', p_wave, 'what', 'mapping', 'version', p_version), ARRAY['onboarding.approve'],
                                         CASE WHEN p_decision = 'approve' THEN 'approved' ELSE 'rejected' END, p_signature, p_actor, p_correlation);
  PERFORM onboarding.ledger('onboarding', p_tenant, p_domain, 'migration_mapping', p_wave, p_version, CASE WHEN p_decision = 'approve' THEN 'mapping.approved' ELSE 'mapping.rejected' END, p_actor,
    jsonb_build_object('digest', m.digest, 'reason', btrim(p_reason), 'signature_id', p_signature, 'proposed_by', m.proposed_by), p_correlation);
  UPDATE onboarding.migration_waves SET updated_at = clock_timestamp() WHERE wave_id = p_wave;
  RETURN (SELECT to_jsonb(x) FROM onboarding.migration_mappings x WHERE x.wave_id = p_wave AND x.version = p_version);
END $$;
REVOKE ALL ON FUNCTION onboarding.decide_mapping(uuid, uuid, uuid, int, text, text, text, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION onboarding.decide_mapping(uuid, uuid, uuid, int, text, text, text, uuid, uuid, uuid) TO eye_commit;

/* REHEARSAL (onboarding.rehearsal.run; the lead or an agent holding the lead's role — a dry run writes nothing outside the wave's staging): the
   evidence of the wave's source (its manifest's digest = the bytes the TypeScript parser read), the mapping version, the header and the parsed
   rows → classified, digested, recorded; the reconciliation report. A report with blocking rows HOLDS the wave (`onboarding.migration` item);
   a clean report against the APPROVED mapping makes it `reconciled` and closes the wave's item. */
CREATE OR REPLACE FUNCTION onboarding.record_rehearsal(p_rehearsal uuid, p_wave uuid, p_tenant uuid, p_domain uuid, p_evidence uuid, p_bytes_digest text, p_mapping_version int,
                                                       p_columns text[], p_rows jsonb, p_recorded_formula_cells text[], p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = onboarding, observation, pg_catalog, pg_temp AS $$
DECLARE w onboarding.migration_waves%ROWTYPE; m onboarding.migration_mappings%ROWTYPE; v_ev jsonb; v_rows jsonb; v_cls jsonb; v_diff jsonb; v_seq int; v_input text; v_plan text;
        v_blocking int; v_counts jsonb; r jsonb; v_holds jsonb; v_item jsonb := NULL;
BEGIN
  PERFORM observation.assert_authority(ARRAY['onboarding.rehearsal.run']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM onboarding.mg_assert_actor('migration rehearsal', p_actor);
  w := onboarding.mg_wave('migration rehearsal', p_wave, p_tenant, p_domain);
  IF w.state NOT IN ('planned', 'rehearsing', 'reconciled') THEN RAISE EXCEPTION 'migration rehearsal rejected (state): wave % is % — rehearsals precede the cutover', w.wave_key, w.state USING ERRCODE = '22023'; END IF;
  SELECT * INTO m FROM onboarding.migration_mappings x WHERE x.wave_id = p_wave AND x.version = p_mapping_version;
  IF NOT FOUND THEN RAISE EXCEPTION 'migration rehearsal rejected (unknown_mapping): wave % has no mapping v%', w.wave_key, p_mapping_version USING ERRCODE = '23503'; END IF;
  IF m.state NOT IN ('proposed', 'approved') THEN RAISE EXCEPTION 'migration rehearsal rejected (state): mapping v% is %', p_mapping_version, m.state USING ERRCODE = '22023'; END IF;
  v_ev := onboarding.mg_evidence('migration rehearsal', p_tenant, p_domain, w.source_id, p_evidence);
  IF p_bytes_digest IS DISTINCT FROM v_ev ->> 'bytes_digest' THEN
    RAISE EXCEPTION 'migration rehearsal rejected (evidence): the bytes read do not carry the manifest''s digest — the stored evidence is the only input' USING ERRCODE = '22023';
  END IF;
  IF p_columns IS NULL OR cardinality(p_columns) = 0 THEN RAISE EXCEPTION 'migration rehearsal rejected (input): the file has a header row' USING ERRCODE = '22023'; END IF;
  v_rows := onboarding.mg_canonical_rows('migration rehearsal', p_rows, m.spec);
  v_diff := onboarding.mg_column_diff(p_columns, m.spec);
  v_input := onboarding.digest(jsonb_build_object('mapping_digest', m.digest, 'bytes_digest', p_bytes_digest, 'columns', to_jsonb(p_columns), 'rows', v_rows));
  v_cls := onboarding.mg_classify(p_tenant, p_domain, w.identifier_system, v_rows);
  v_counts := (v_cls -> 'counts') || jsonb_build_object('unmapped_columns', jsonb_array_length(v_diff -> 'unmapped'), 'missing_columns', jsonb_array_length(v_diff -> 'missing'),
                                                         'formula_cells_recorded', cardinality(coalesce(p_recorded_formula_cells, '{}')));
  v_blocking := (v_counts ->> 'rejected')::int + (v_counts ->> 'ambiguous')::int + (v_counts ->> 'conflict')::int + jsonb_array_length(v_diff -> 'unmapped') + jsonb_array_length(v_diff -> 'missing');
  v_plan := onboarding.digest(jsonb_build_object('input_digest', v_input,
    'staging', (SELECT jsonb_agg(jsonb_build_object('row_no', x -> 'row_no', 'legacy_id', x -> 'legacy_id', 'disposition', x -> 'disposition', 'reasons', x -> 'reasons', 'match_entity_id', x -> 'match_entity_id')
                                 ORDER BY (x ->> 'row_no')::int) FROM jsonb_array_elements(v_cls -> 'rows') x),
    'unmapped', v_diff -> 'unmapped', 'missing', v_diff -> 'missing'));
  SELECT coalesce(max(x.seq), 0) + 1 INTO v_seq FROM onboarding.migration_rehearsals x WHERE x.wave_id = p_wave;
  INSERT INTO onboarding.migration_rehearsals (rehearsal_id, tenant_id, domain_id, wave_id, seq, kind, mapping_version, mapping_digest, mapping_state, input, columns, unmapped_columns, missing_columns,
                                               counts, blocking, input_digest, plan_digest, ran_by, ran_by_kind, correlation_id)
  VALUES (p_rehearsal, p_tenant, p_domain, p_wave, v_seq, 'rehearsal', m.version, m.digest, m.state,
          v_ev || jsonb_build_object('formula_cells_recorded', to_jsonb(coalesce(p_recorded_formula_cells, '{}'))), p_columns,
          ARRAY(SELECT jsonb_array_elements_text(v_diff -> 'unmapped')), ARRAY(SELECT jsonb_array_elements_text(v_diff -> 'missing')),
          v_counts, v_blocking, v_input, v_plan, p_actor, coalesce(onboarding.principal_kind(p_actor), 'unknown'), p_correlation);
  FOR r IN SELECT x FROM jsonb_array_elements(v_cls -> 'rows') x LOOP
    INSERT INTO onboarding.migration_staging (rehearsal_id, row_no, tenant_id, domain_id, legacy_id, name, "values", disposition, reasons, formula_cells, match_entity_id)
    VALUES (p_rehearsal, (r ->> 'row_no')::int, p_tenant, p_domain, r ->> 'legacy_id', r ->> 'name', r -> 'values', r ->> 'disposition',
            ARRAY(SELECT jsonb_array_elements_text(r -> 'reasons')), ARRAY(SELECT jsonb_array_elements_text(r -> 'formula_cells')), (r ->> 'match_entity_id')::uuid);
  END LOOP;
  -- the wave's hold: a blocking reconciliation holds it (and routes the closure); a clean one releases the reconciliation hold
  v_holds := coalesce((SELECT jsonb_agg(h) FROM jsonb_array_elements(w.held_reasons) h WHERE h ->> 'kind' NOT IN ('reconciliation', 'cutover')), '[]'::jsonb);
  IF v_blocking > 0 THEN
    v_holds := v_holds || jsonb_build_array(jsonb_build_object('kind', 'reconciliation', 'rehearsal_id', p_rehearsal, 'seq', v_seq, 'blocking', v_blocking, 'counts', v_counts,
      'unmapped_columns', v_diff -> 'unmapped', 'missing_columns', v_diff -> 'missing', 'route', 'remediate: a new mapping version or a corrected file, then rehearse again'));
    v_item := onboarding.mg_raise_once(p_tenant, p_domain, 'onboarding.migration', 'migration_wave', p_wave, format('Migration wave %s held: reconciliation of rehearsal %s has %s blocking rows (SYNTHETIC)', w.wave_key, v_seq, v_blocking),
                                       jsonb_build_array(jsonb_build_object('kind', 'reconciliation', 'blocking', v_blocking)), p_actor, p_correlation);
  ELSIF m.state = 'approved' THEN
    PERFORM executive.b33_close_items(p_tenant, p_domain, 'onboarding.migration', 'migration_wave', p_wave, format('rehearsal %s reconciles clean against the approved mapping v%s', v_seq, m.version), p_actor, p_correlation);
  END IF;
  UPDATE onboarding.migration_waves SET held_reasons = v_holds, updated_at = clock_timestamp(),
         state = CASE WHEN v_blocking = 0 AND m.state = 'approved' THEN 'reconciled' ELSE 'rehearsing' END
   WHERE wave_id = p_wave;
  -- a requested cutover on an earlier rehearsal is superseded by this one (it must be requested again on the latest); its items close
  PERFORM onboarding.mg_supersede_requested(p_tenant, p_domain, p_wave, format('superseded by rehearsal %s', v_seq), p_actor, p_correlation);
  PERFORM onboarding.ledger('onboarding', p_tenant, p_domain, 'migration_rehearsal', p_rehearsal, v_seq,
    CASE WHEN v_blocking > 0 THEN 'reconciliation.failed' ELSE 'rehearsal.reconciled' END, p_actor,
    jsonb_build_object('wave_id', p_wave, 'seq', v_seq, 'mapping_version', m.version, 'mapping_state', m.state, 'evidence', v_ev -> 'evidence_object_id', 'bytes_digest', p_bytes_digest,
                       'counts', v_counts, 'blocking', v_blocking, 'plan_digest', v_plan, 'input_digest', v_input), p_correlation);
  RETURN (SELECT to_jsonb(x) FROM onboarding.migration_rehearsals x WHERE x.rehearsal_id = p_rehearsal) || jsonb_build_object('item', v_item, 'wave_held', v_blocking > 0);
END $$;
REVOKE ALL ON FUNCTION onboarding.record_rehearsal(uuid, uuid, uuid, uuid, uuid, text, int, text[], jsonb, text[], uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION onboarding.record_rehearsal(uuid, uuid, uuid, uuid, uuid, text, int, text[], jsonb, text[], uuid, uuid) TO eye_commit;

/* (internal) Evaluate and RECORD a cutover's holds: the blocking list on the cutover (and the wave), the `onboarding.migration` item and — for an
   owner gap — the `responsibility.gap` item raised (once); released → the items closed. Returns the blocking list. */
CREATE OR REPLACE FUNCTION onboarding.mg_evaluate_cutover(c onboarding.migration_cutovers, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = onboarding, executive, pg_catalog, pg_temp AS $$
DECLARE v_block jsonb; w onboarding.migration_waves%ROWTYPE;
BEGIN
  v_block := onboarding.mg_cutover_blocking(c.tenant_id, c.domain_id, c.wave_id, c.rehearsal_id);
  SELECT * INTO w FROM onboarding.migration_waves x WHERE x.wave_id = c.wave_id;
  UPDATE onboarding.migration_cutovers SET held_reasons = v_block, updated_at = clock_timestamp() WHERE cutover_id = c.cutover_id;
  UPDATE onboarding.migration_waves SET held_reasons = coalesce((SELECT jsonb_agg(h) FROM jsonb_array_elements(w.held_reasons) h WHERE h ->> 'kind' <> 'cutover'), '[]'::jsonb)
                                                     || CASE WHEN jsonb_array_length(v_block) > 0 THEN jsonb_build_array(jsonb_build_object('kind', 'cutover', 'cutover_id', c.cutover_id, 'blocking', v_block)) ELSE '[]'::jsonb END,
         updated_at = clock_timestamp()
   WHERE wave_id = c.wave_id;
  IF jsonb_array_length(v_block) > 0 THEN
    PERFORM onboarding.mg_raise_once(c.tenant_id, c.domain_id, 'onboarding.migration', 'cutover', c.cutover_id,
      format('Cutover of wave %s held: %s (SYNTHETIC)', w.wave_key, (SELECT string_agg(b ->> 'kind', ', ') FROM jsonb_array_elements(v_block) b)), v_block, p_actor, p_correlation);
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_block) b WHERE b ->> 'kind' = 'owner_gap') THEN
      PERFORM onboarding.mg_raise_once(c.tenant_id, c.domain_id, 'responsibility.gap', 'cutover', c.cutover_id,
        format('No resolved accountable owner for data.migration: the cutover of wave %s is held (SYNTHETIC)', w.wave_key),
        (SELECT jsonb_agg(b) FROM jsonb_array_elements(v_block) b WHERE b ->> 'kind' = 'owner_gap'), p_actor, p_correlation);
    ELSE
      PERFORM executive.b33_close_items(c.tenant_id, c.domain_id, 'responsibility.gap', 'cutover', c.cutover_id, 'the accountable owner of data.migration is resolved', p_actor, p_correlation);
    END IF;
  ELSE
    PERFORM executive.b33_close_items(c.tenant_id, c.domain_id, NULL, 'cutover', c.cutover_id, 'the cutover is released: no blocking item stands', p_actor, p_correlation);
  END IF;
  RETURN v_block;
END $$;
REVOKE ALL ON FUNCTION onboarding.mg_evaluate_cutover(onboarding.migration_cutovers, uuid, uuid) FROM PUBLIC;

/* CUTOVER REQUEST (onboarding.cutover.request; the lead): on the wave's LATEST rehearsal; the holds evaluated and recorded (a held request is
   recorded — the gap is visible and routed — and answered with its blocking list). */
CREATE OR REPLACE FUNCTION onboarding.request_cutover(p_cutover uuid, p_wave uuid, p_tenant uuid, p_domain uuid, p_rehearsal uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = onboarding, observation, pg_catalog, pg_temp AS $$
DECLARE w onboarding.migration_waves%ROWTYPE; r onboarding.migration_rehearsals%ROWTYPE; c onboarding.migration_cutovers%ROWTYPE; v_block jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['onboarding.cutover.request']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM onboarding.mg_assert_actor('migration cutover', p_actor);
  w := onboarding.mg_wave('migration cutover', p_wave, p_tenant, p_domain);
  IF w.state NOT IN ('rehearsing', 'reconciled') THEN RAISE EXCEPTION 'migration cutover rejected (state): wave % is % — a cutover is requested on a rehearsed wave', w.wave_key, w.state USING ERRCODE = '22023'; END IF;
  SELECT * INTO r FROM onboarding.migration_rehearsals x WHERE x.rehearsal_id = p_rehearsal AND x.wave_id = p_wave AND x.kind = 'rehearsal';
  IF NOT FOUND THEN RAISE EXCEPTION 'migration cutover rejected (unknown_rehearsal): % is not a rehearsal of wave %', coalesce(p_rehearsal::text, '<none>'), w.wave_key USING ERRCODE = '23503'; END IF;
  IF EXISTS (SELECT 1 FROM onboarding.migration_cutovers x WHERE x.wave_id = p_wave AND x.state NOT IN ('rolled_back', 'superseded', 'requested')) THEN
    RAISE EXCEPTION 'migration cutover rejected (state): wave % already has an approved cutover', w.wave_key USING ERRCODE = '22023';
  END IF;
  PERFORM onboarding.mg_supersede_requested(p_tenant, p_domain, p_wave, 'superseded by a newer cutover request', p_actor, p_correlation);
  INSERT INTO onboarding.migration_cutovers (cutover_id, tenant_id, domain_id, wave_id, rehearsal_id, plan_digest, mapping_version, requested_by, correlation_id)
  VALUES (p_cutover, p_tenant, p_domain, p_wave, p_rehearsal, r.plan_digest, r.mapping_version, p_actor, p_correlation);
  SELECT * INTO c FROM onboarding.migration_cutovers x WHERE x.cutover_id = p_cutover;
  v_block := onboarding.mg_evaluate_cutover(c, p_actor, p_correlation);
  PERFORM onboarding.mg_open_task(p_tenant, p_domain, 'cutover', p_cutover, 'cutover', format('mg-cutover-%s', p_cutover),
    format('Approve the cutover of migration wave %s on rehearsal %s (SYNTHETIC)', w.wave_key, r.seq), jsonb_build_object('plan_digest', r.plan_digest, 'wave_id', p_wave), p_actor, p_actor, p_correlation);
  PERFORM onboarding.ledger('onboarding', p_tenant, p_domain, 'cutover', p_cutover, 1, CASE WHEN jsonb_array_length(v_block) > 0 THEN 'cutover.held' ELSE 'cutover.requested' END, p_actor,
    jsonb_build_object('wave_id', p_wave, 'rehearsal_id', p_rehearsal, 'plan_digest', r.plan_digest, 'blocking', v_block), p_correlation);
  RETURN (SELECT to_jsonb(x) FROM onboarding.migration_cutovers x WHERE x.cutover_id = p_cutover);
END $$;
REVOKE ALL ON FUNCTION onboarding.request_cutover(uuid, uuid, uuid, uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION onboarding.request_cutover(uuid, uuid, uuid, uuid, uuid, uuid, uuid) TO eye_commit;

/* CUTOVER RECHECK (onboarding.cutover.recheck; the lead or the authority): re-evaluate a requested cutover's holds — RELEASED when nothing
   blocks (the items close), still held otherwise (the list updated). */
CREATE OR REPLACE FUNCTION onboarding.recheck_cutover(p_cutover uuid, p_tenant uuid, p_domain uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = onboarding, observation, pg_catalog, pg_temp AS $$
DECLARE c onboarding.migration_cutovers%ROWTYPE; v_block jsonb; v_was boolean;
BEGIN
  PERFORM observation.assert_authority(ARRAY['onboarding.cutover.recheck']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM onboarding.mg_assert_actor('migration cutover', p_actor);
  c := onboarding.mg_cutover('migration cutover', p_cutover, p_tenant, p_domain);
  IF c.state <> 'requested' THEN RAISE EXCEPTION 'migration cutover rejected (state): cutover is % — only a requested cutover is re-checked', c.state USING ERRCODE = '22023'; END IF;
  v_was := c.held;
  v_block := onboarding.mg_evaluate_cutover(c, p_actor, p_correlation);
  PERFORM onboarding.ledger('onboarding', p_tenant, p_domain, 'cutover', p_cutover, 1,
    CASE WHEN jsonb_array_length(v_block) > 0 THEN 'cutover.held' WHEN v_was THEN 'cutover.released' ELSE 'cutover.rechecked' END, p_actor,
    jsonb_build_object('blocking', v_block), p_correlation);
  RETURN (SELECT to_jsonb(x) FROM onboarding.migration_cutovers x WHERE x.cutover_id = p_cutover);
END $$;
REVOKE ALL ON FUNCTION onboarding.recheck_cutover(uuid, uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION onboarding.recheck_cutover(uuid, uuid, uuid, uuid, uuid) TO eye_commit;

/* CUTOVER APPROVE (onboarding.cutover.approve; the onboarding authority — assert_approver; the PEP's human gate too): on the rehearsal's PLAN
   DIGEST (stale → 409). The holds are re-evaluated LIVE: while one stands the approval is NOT given — the hold is RECORDED (returned, not
   thrown, so the hold, its items and its ledger event commit) and the route answers 409 `held` with the blocking list. Approved: signed
   (`cutover`), the wave `cutover_approved`, the items closed. */
CREATE OR REPLACE FUNCTION onboarding.approve_cutover(p_cutover uuid, p_tenant uuid, p_domain uuid, p_digest text, p_reason text, p_signature uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = onboarding, executive, observation, pg_catalog, pg_temp AS $$
DECLARE c onboarding.migration_cutovers%ROWTYPE; v_block jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['onboarding.cutover.approve']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM onboarding.mg_assert_actor('migration cutover', p_actor);
  c := onboarding.mg_cutover('migration cutover', p_cutover, p_tenant, p_domain);
  PERFORM onboarding.assert_approver('migration cutover', p_actor, p_tenant, p_domain, ARRAY['onboarding_authority'], c.requested_by, 'approving a cutover (the data transfer)');
  IF c.state <> 'requested' THEN RAISE EXCEPTION 'migration cutover rejected (state): the cutover is %, not awaiting approval', c.state USING ERRCODE = '22023'; END IF;
  IF p_digest IS DISTINCT FROM c.plan_digest THEN
    RAISE EXCEPTION 'migration cutover rejected (stale): the digest seen (%) is not the rehearsal''s plan digest — read the cutover again', coalesce(left(p_digest, 12), '<none>') USING ERRCODE = '22023';
  END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'migration cutover rejected (reason): an approval states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  v_block := onboarding.mg_evaluate_cutover(c, p_actor, p_correlation);
  IF jsonb_array_length(v_block) > 0 THEN
    PERFORM onboarding.ledger('onboarding', p_tenant, p_domain, 'cutover', p_cutover, 1, 'cutover.held', p_actor,
      jsonb_build_object('blocking', v_block, 'approval_refused_by', p_actor), p_correlation);
    RETURN jsonb_build_object('held', true, 'blocking', v_block, 'cutover', (SELECT to_jsonb(x) FROM onboarding.migration_cutovers x WHERE x.cutover_id = p_cutover));
  END IF;
  IF p_signature IS NULL OR NOT EXISTS (SELECT 1 FROM executive.signatures s WHERE s.signature_id = p_signature AND s.subject_kind = 'cutover' AND s.subject_id = p_cutover
                                          AND s.subject_version = 1 AND s.subject_digest = c.plan_digest AND s.signer = p_actor) THEN
    RAISE EXCEPTION 'migration cutover rejected (signature): an approval is signed by the approver over the rehearsal''s plan digest' USING ERRCODE = '22023';
  END IF;
  UPDATE onboarding.migration_cutovers SET state = 'approved', approved_by = p_actor, approved_at = clock_timestamp(), approval_reason = btrim(p_reason), signature_id = p_signature,
         held_reasons = '[]'::jsonb, updated_at = clock_timestamp()
   WHERE cutover_id = p_cutover;
  UPDATE onboarding.migration_waves SET state = 'cutover_approved', updated_at = clock_timestamp() WHERE wave_id = c.wave_id;
  PERFORM executive._resolve_human_tasks(p_tenant, p_domain, jsonb_build_object('kind', 'cutover', 'id', p_cutover, 'what', 'cutover'), ARRAY['onboarding.approve'], 'approved', p_signature, p_actor, p_correlation);
  PERFORM onboarding.ledger('onboarding', p_tenant, p_domain, 'cutover', p_cutover, 1, 'cutover.approved', p_actor,
    jsonb_build_object('plan_digest', c.plan_digest, 'rehearsal_id', c.rehearsal_id, 'signature_id', p_signature, 'reason', btrim(p_reason), 'requested_by', c.requested_by), p_correlation);
  RETURN jsonb_build_object('held', false, 'blocking', '[]'::jsonb, 'cutover', (SELECT to_jsonb(x) FROM onboarding.migration_cutovers x WHERE x.cutover_id = p_cutover));
END $$;
REVOKE ALL ON FUNCTION onboarding.approve_cutover(uuid, uuid, uuid, text, text, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION onboarding.approve_cutover(uuid, uuid, uuid, text, text, uuid, uuid, uuid) TO eye_commit;

/* EXECUTION, step 1 (onboarding.cutover.execute; the lead or an agent — automation executes INSIDE the approved plan): the re-read of the
   evidence (its parsed rows and header) must reproduce the APPROVED rehearsal's input digest under the APPROVED mapping version — otherwise
   `contract_changed` (a row or column outside the approved mapping version is never migrated); reclassified against the target now, it must
   reproduce the plan digest — otherwise `stale` (the target changed since the rehearsal: rehearse again). The identifier system is registered. */
CREATE OR REPLACE FUNCTION onboarding.begin_execution(p_cutover uuid, p_tenant uuid, p_domain uuid, p_bytes_digest text, p_columns text[], p_rows jsonb, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = onboarding, graph, observation, pg_catalog, pg_temp AS $$
DECLARE c onboarding.migration_cutovers%ROWTYPE; w onboarding.migration_waves%ROWTYPE; r onboarding.migration_rehearsals%ROWTYPE; m onboarding.migration_mappings%ROWTYPE;
        v_rows jsonb; v_input text; v_cls jsonb; v_diff jsonb; v_plan text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['onboarding.cutover.execute']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM onboarding.mg_assert_actor('migration cutover', p_actor);
  c := onboarding.mg_cutover('migration cutover', p_cutover, p_tenant, p_domain);
  IF c.state <> 'approved' THEN RAISE EXCEPTION 'migration cutover rejected (state): the cutover is %, not approved — automation executes only an approved plan', c.state USING ERRCODE = '22023'; END IF;
  w := onboarding.mg_wave('migration cutover', c.wave_id, p_tenant, p_domain);
  IF onboarding.mg_domain_status(p_tenant, p_domain) IS DISTINCT FROM 'draft' THEN RAISE EXCEPTION 'migration cutover rejected (state): the target domain is no longer draft' USING ERRCODE = '22023'; END IF;
  SELECT * INTO r FROM onboarding.migration_rehearsals x WHERE x.rehearsal_id = c.rehearsal_id;
  SELECT * INTO m FROM onboarding.migration_mappings x WHERE x.wave_id = c.wave_id AND x.state = 'approved';
  IF m.version IS DISTINCT FROM c.mapping_version OR m.digest IS DISTINCT FROM r.mapping_digest THEN
    RAISE EXCEPTION 'migration cutover rejected (contract_changed): the approved mapping is now v%, not the v% this cutover was approved on — nothing outside the approved mapping version is migrated', coalesce(m.version::text, 'none'), c.mapping_version USING ERRCODE = '22023';
  END IF;
  IF p_bytes_digest IS DISTINCT FROM r.input ->> 'bytes_digest' THEN
    RAISE EXCEPTION 'migration cutover rejected (contract_changed): the evidence read is not the rehearsed evidence (its bytes digest differs)' USING ERRCODE = '22023';
  END IF;
  v_diff := onboarding.mg_column_diff(coalesce(p_columns, '{}'), m.spec);
  IF jsonb_array_length(v_diff -> 'unmapped') > 0 OR jsonb_array_length(v_diff -> 'missing') > 0 THEN
    RAISE EXCEPTION 'migration cutover rejected (contract_changed): columns outside the approved mapping version (unmapped %, missing %)', v_diff -> 'unmapped', v_diff -> 'missing' USING ERRCODE = '22023';
  END IF;
  v_rows := onboarding.mg_canonical_rows('migration cutover', p_rows, m.spec);
  v_input := onboarding.digest(jsonb_build_object('mapping_digest', m.digest, 'bytes_digest', p_bytes_digest, 'columns', to_jsonb(p_columns), 'rows', v_rows));
  IF v_input IS DISTINCT FROM r.input_digest THEN
    RAISE EXCEPTION 'migration cutover rejected (contract_changed): the rows read now are not the rows the approved rehearsal read — nothing outside the approved plan is migrated' USING ERRCODE = '22023';
  END IF;
  v_cls := onboarding.mg_classify(p_tenant, p_domain, w.identifier_system, v_rows);
  v_plan := onboarding.digest(jsonb_build_object('input_digest', v_input,
    'staging', (SELECT jsonb_agg(jsonb_build_object('row_no', x -> 'row_no', 'legacy_id', x -> 'legacy_id', 'disposition', x -> 'disposition', 'reasons', x -> 'reasons', 'match_entity_id', x -> 'match_entity_id')
                                 ORDER BY (x ->> 'row_no')::int) FROM jsonb_array_elements(v_cls -> 'rows') x),
    'unmapped', v_diff -> 'unmapped', 'missing', v_diff -> 'missing'));
  IF v_plan IS DISTINCT FROM c.plan_digest THEN
    RAISE EXCEPTION 'migration cutover rejected (stale): the target domain changed since the approved rehearsal (the plan no longer reproduces its digest) — rehearse again and re-approve' USING ERRCODE = '22023';
  END IF;
  INSERT INTO graph.identifier_systems (scope, tenant_id, domain_id, system_key, authority, description, is_authoritative, registered_by, correlation_id)
  VALUES ('DOMAIN', p_tenant, p_domain, w.identifier_system, w.identifier_authority,
          format('the legacy identifiers of migration wave %s (B94 §MG); the identifier''s source claim reference is the approved cutover %s, its evidence the legacy file', w.wave_key, p_cutover),
          true, p_actor, p_correlation)
  ON CONFLICT (tenant_id, domain_id, system_key) DO NOTHING;
  RETURN jsonb_build_object('cutover_id', p_cutover, 'plan_digest', v_plan, 'rows', (SELECT count(*) FROM onboarding.migration_staging s WHERE s.rehearsal_id = c.rehearsal_id AND s.disposition IN ('would_create', 'would_match')),
                            'row_nos', (SELECT jsonb_agg(s.row_no ORDER BY s.row_no) FROM onboarding.migration_staging s WHERE s.rehearsal_id = c.rehearsal_id AND s.disposition IN ('would_create', 'would_match')));
END $$;
REVOKE ALL ON FUNCTION onboarding.begin_execution(uuid, uuid, uuid, text, text[], jsonb, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION onboarding.begin_execution(uuid, uuid, uuid, text, text[], jsonb, uuid, uuid) TO eye_commit;

/* EXECUTION, step 2 — ONE ROW (called per row under its own savepoint, the B16 admit idiom): the row is named by its NUMBER only and read from
   the APPROVED staging — a row the approved plan does not migrate is refused `contract_changed`. would_create → a graph entity (organization)
   + the legacy identifier; would_match → the identifier attached to the matched entity; the PROVENANCE (wave, cutover, row, the mapped values —
   the risk rating among them) rides on the `entity.identified` event and the executed row. A port refusal (e.g. the identifier now names
   another entity) rolls back to the row's savepoint and is recorded by mg_record_failed_row. */
CREATE OR REPLACE FUNCTION onboarding.execute_row(p_cutover uuid, p_tenant uuid, p_domain uuid, p_row_no int, p_entity uuid, p_identifier uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = onboarding, graph, observation, pg_catalog, pg_temp AS $$
DECLARE c onboarding.migration_cutovers%ROWTYPE; w onboarding.migration_waves%ROWTYPE; s onboarding.migration_staging%ROWTYPE; v_ent uuid; v_holder uuid; v_prov jsonb; v_ev uuid; v_outcome text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['onboarding.cutover.execute']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM onboarding.mg_assert_actor('migration cutover', p_actor);
  SELECT * INTO c FROM onboarding.migration_cutovers x WHERE x.cutover_id = p_cutover AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'migration cutover rejected (unknown_cutover): % is not a cutover of this domain', p_cutover USING ERRCODE = '23503'; END IF;
  IF c.state <> 'approved' THEN RAISE EXCEPTION 'migration cutover rejected (state): the cutover is %, not approved', c.state USING ERRCODE = '22023'; END IF;
  SELECT * INTO w FROM onboarding.migration_waves x WHERE x.wave_id = c.wave_id;
  SELECT * INTO s FROM onboarding.migration_staging x WHERE x.rehearsal_id = c.rehearsal_id AND x.row_no = p_row_no;
  IF NOT FOUND OR s.disposition NOT IN ('would_create', 'would_match') THEN
    RAISE EXCEPTION 'migration cutover rejected (contract_changed): row % is not a row the approved plan migrates (its disposition is %) — nothing outside the approved plan is written', p_row_no, coalesce(s.disposition, 'absent') USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM onboarding.migration_executed_rows x WHERE x.cutover_id = p_cutover AND x.row_no = p_row_no) THEN
    RAISE EXCEPTION 'migration cutover rejected (duplicate): row % is executed already', p_row_no USING ERRCODE = '22023';
  END IF;
  v_prov := jsonb_build_object('migrated_by', 'B94 §MG', 'wave_id', w.wave_id, 'wave_key', w.wave_key, 'cutover_id', p_cutover, 'rehearsal_id', c.rehearsal_id, 'plan_digest', c.plan_digest,
                               'mapping_version', c.mapping_version, 'row_no', p_row_no, 'legacy_id', s.legacy_id, 'values', s."values", 'synthetic', true,
                               'note', 'the legacy risk rating is provenance on the entity; an exposure is proposed by the domain''s risk owner after go-live, never by the migration');
  SELECT i.entity_id INTO v_holder FROM graph.entity_identifiers i WHERE i.tenant_id = p_tenant AND i.domain_id = p_domain AND i.system_key = w.identifier_system AND i.identifier_value = s.legacy_id;
  IF s.disposition = 'would_create' THEN
    IF v_holder IS NOT NULL THEN RAISE EXCEPTION 'migration cutover rejected (conflict): % % now identifies another entity', w.identifier_system, s.legacy_id USING ERRCODE = '23505'; END IF;
    v_ent := p_entity; v_outcome := 'created';
    INSERT INTO graph.entities_current (entity_id, scope, tenant_id, domain_id, entity_type, canonical_name, normalized_name, lifecycle_state, created_by, correlation_id)
    VALUES (v_ent, 'DOMAIN', p_tenant, p_domain, 'organization', s.name, onboarding.mg_normal(s.name), 'active', p_actor, p_correlation);
    INSERT INTO graph.entity_events (event_id, scope, tenant_id, domain_id, entity_id, event, actor_principal_id, details, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, v_ent, 'entity.created', p_actor,
            jsonb_build_object('entity_type', 'organization', 'canonical_name', s.name, 'normalized_name', onboarding.mg_normal(s.name), 'split_from', NULL, 'migration', v_prov), p_correlation);
  ELSE
    v_ent := s.match_entity_id; v_outcome := 'matched';
    IF NOT EXISTS (SELECT 1 FROM graph.entities_current e WHERE e.entity_id = v_ent AND e.tenant_id = p_tenant AND e.domain_id = p_domain AND e.lifecycle_state = 'active') THEN
      RAISE EXCEPTION 'migration cutover rejected (conflict): the matched entity % is no longer active', v_ent USING ERRCODE = '22023';
    END IF;
    IF v_holder IS NOT NULL AND v_holder <> v_ent THEN RAISE EXCEPTION 'migration cutover rejected (conflict): % % now identifies another entity', w.identifier_system, s.legacy_id USING ERRCODE = '23505'; END IF;
  END IF;
  IF v_holder IS NULL THEN
    INSERT INTO graph.entity_identifiers (identifier_id, scope, tenant_id, domain_id, entity_id, system_key, identifier_value, source_claim_object_id, source_evidence_object_id, recorded_by, correlation_id)
    VALUES (p_identifier, 'DOMAIN', p_tenant, p_domain, v_ent, w.identifier_system, s.legacy_id, p_cutover,
            (SELECT (r.input ->> 'evidence_object_id')::uuid FROM onboarding.migration_rehearsals r WHERE r.rehearsal_id = c.rehearsal_id), p_actor, p_correlation);
    v_ev := gen_random_uuid();
    INSERT INTO graph.entity_events (event_id, scope, tenant_id, domain_id, entity_id, event, actor_principal_id, details, correlation_id)
    VALUES (v_ev, 'DOMAIN', p_tenant, p_domain, v_ent, 'entity.identified', p_actor,
            jsonb_build_object('system_key', w.identifier_system, 'value', s.legacy_id, 'is_authoritative', true, 'claim_object_id', p_cutover, 'migration', v_prov), p_correlation);
  END IF;
  INSERT INTO onboarding.migration_executed_rows (cutover_id, row_no, tenant_id, domain_id, legacy_id, outcome, entity_id, identifier_id, provenance)
  VALUES (p_cutover, p_row_no, p_tenant, p_domain, s.legacy_id, v_outcome, v_ent, CASE WHEN v_holder IS NULL THEN p_identifier END, v_prov);
  RETURN jsonb_build_object('row_no', p_row_no, 'outcome', v_outcome, 'entity_id', v_ent);
END $$;
REVOKE ALL ON FUNCTION onboarding.execute_row(uuid, uuid, uuid, int, uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION onboarding.execute_row(uuid, uuid, uuid, int, uuid, uuid, uuid, uuid) TO eye_commit;

/* EXECUTION, a refused row (after its savepoint was rolled back): recorded `failed` with the port's reason — the post-cutover reconciliation
   will not be equal and the cutover is held (PR-67-005: never misrepresent state). */
CREATE OR REPLACE FUNCTION onboarding.record_failed_row(p_cutover uuid, p_tenant uuid, p_domain uuid, p_row_no int, p_reason text, p_actor uuid, p_correlation uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = onboarding, observation, pg_catalog, pg_temp AS $$
DECLARE c onboarding.migration_cutovers%ROWTYPE; s onboarding.migration_staging%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['onboarding.cutover.execute']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM onboarding.mg_assert_actor('migration cutover', p_actor);
  SELECT * INTO c FROM onboarding.migration_cutovers x WHERE x.cutover_id = p_cutover AND x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.state = 'approved';
  IF NOT FOUND THEN RAISE EXCEPTION 'migration cutover rejected (state): % is not an approved cutover of this domain', p_cutover USING ERRCODE = '22023'; END IF;
  SELECT * INTO s FROM onboarding.migration_staging x WHERE x.rehearsal_id = c.rehearsal_id AND x.row_no = p_row_no AND x.disposition IN ('would_create', 'would_match');
  IF NOT FOUND THEN RAISE EXCEPTION 'migration cutover rejected (contract_changed): row % is not a row of the approved plan', p_row_no USING ERRCODE = '22023'; END IF;
  INSERT INTO onboarding.migration_executed_rows (cutover_id, row_no, tenant_id, domain_id, legacy_id, outcome, reason)
  VALUES (p_cutover, p_row_no, p_tenant, p_domain, s.legacy_id, 'failed', left(coalesce(nullif(btrim(p_reason), ''), 'the row was refused'), 500));
END $$;
REVOKE ALL ON FUNCTION onboarding.record_failed_row(uuid, uuid, uuid, int, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION onboarding.record_failed_row(uuid, uuid, uuid, int, text, uuid, uuid) TO eye_commit;

/* EXECUTION, step 3: every approved row accounted for (executed or failed); the cutover `executed` with its counts; the wave `executed`. */
CREATE OR REPLACE FUNCTION onboarding.complete_execution(p_cutover uuid, p_tenant uuid, p_domain uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = onboarding, observation, pg_catalog, pg_temp AS $$
DECLARE c onboarding.migration_cutovers%ROWTYPE; v_plan int; v_done int; v_exec jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['onboarding.cutover.execute']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM onboarding.mg_assert_actor('migration cutover', p_actor);
  c := onboarding.mg_cutover('migration cutover', p_cutover, p_tenant, p_domain);
  IF c.state <> 'approved' THEN RAISE EXCEPTION 'migration cutover rejected (state): the cutover is %, not approved', c.state USING ERRCODE = '22023'; END IF;
  SELECT count(*) INTO v_plan FROM onboarding.migration_staging s WHERE s.rehearsal_id = c.rehearsal_id AND s.disposition IN ('would_create', 'would_match');
  SELECT count(*) INTO v_done FROM onboarding.migration_executed_rows x WHERE x.cutover_id = p_cutover;
  IF v_done <> v_plan THEN RAISE EXCEPTION 'migration cutover rejected (incomplete): % of % approved rows were executed or recorded', v_done, v_plan USING ERRCODE = '22023'; END IF;
  SELECT jsonb_build_object('rows', v_plan, 'created', count(*) FILTER (WHERE outcome = 'created'), 'matched', count(*) FILTER (WHERE outcome = 'matched'),
                            'failed', count(*) FILTER (WHERE outcome = 'failed')) INTO v_exec FROM onboarding.migration_executed_rows x WHERE x.cutover_id = p_cutover;
  UPDATE onboarding.migration_cutovers SET state = 'executed', executed_by = p_actor, executed_by_kind = coalesce(onboarding.principal_kind(p_actor), 'unknown'), executed_at = clock_timestamp(),
         execution = v_exec, updated_at = clock_timestamp() WHERE cutover_id = p_cutover;
  UPDATE onboarding.migration_waves SET state = 'executed', updated_at = clock_timestamp() WHERE wave_id = c.wave_id;
  PERFORM onboarding.ledger('onboarding', p_tenant, p_domain, 'cutover', p_cutover, 1, 'cutover.executed', p_actor,
    v_exec || jsonb_build_object('executed_by_kind', coalesce(onboarding.principal_kind(p_actor), 'unknown'), 'plan_digest', c.plan_digest), p_correlation);
  RETURN (SELECT to_jsonb(x) FROM onboarding.migration_cutovers x WHERE x.cutover_id = p_cutover);
END $$;
REVOKE ALL ON FUNCTION onboarding.complete_execution(uuid, uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION onboarding.complete_execution(uuid, uuid, uuid, uuid, uuid) TO eye_commit;

/* POST-CUTOVER RECONCILIATION (onboarding.cutover.reconcile; the lead): observed (read live from the graph) against the approved rehearsal —
   EQUAL → the cutover and the wave `verified` (activation may follow); otherwise the cutover HELD (the missing rows, failures, unexpected
   identifiers listed; an `onboarding.migration` item). Recorded as a rehearsal row of kind post_cutover compared to the approved one. */
CREATE OR REPLACE FUNCTION onboarding.reconcile_cutover(p_rehearsal uuid, p_cutover uuid, p_tenant uuid, p_domain uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = onboarding, executive, observation, pg_catalog, pg_temp AS $$
DECLARE c onboarding.migration_cutovers%ROWTYPE; w onboarding.migration_waves%ROWTYPE; r onboarding.migration_rehearsals%ROWTYPE; v_obs jsonb; v_seq int; v_eq boolean; v_hold jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['onboarding.cutover.reconcile']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM onboarding.mg_assert_actor('migration cutover', p_actor);
  c := onboarding.mg_cutover('migration cutover', p_cutover, p_tenant, p_domain);
  IF c.state NOT IN ('executed', 'verified') THEN RAISE EXCEPTION 'migration cutover rejected (state): the cutover is % — the post-cutover reconciliation follows the execution', c.state USING ERRCODE = '22023'; END IF;
  w := onboarding.mg_wave('migration cutover', c.wave_id, p_tenant, p_domain);
  SELECT * INTO r FROM onboarding.migration_rehearsals x WHERE x.rehearsal_id = c.rehearsal_id;
  v_obs := onboarding.mg_post_observed(p_cutover);
  v_eq := (v_obs ->> 'equal')::boolean;
  SELECT coalesce(max(x.seq), 0) + 1 INTO v_seq FROM onboarding.migration_rehearsals x WHERE x.wave_id = c.wave_id;
  INSERT INTO onboarding.migration_rehearsals (rehearsal_id, tenant_id, domain_id, wave_id, seq, kind, input, counts, blocking, plan_digest, cutover_id, compared_to, equal, ran_by, ran_by_kind, correlation_id)
  VALUES (p_rehearsal, p_tenant, p_domain, c.wave_id, v_seq, 'post_cutover', jsonb_build_object('compared_plan_digest', c.plan_digest), v_obs,
          CASE WHEN v_eq THEN 0 ELSE greatest(1, (v_obs ->> 'expected')::int - (v_obs ->> 'observed')::int + (v_obs ->> 'failed')::int + (v_obs ->> 'unexpected')::int) END,
          onboarding.digest(jsonb_build_object('cutover', p_cutover, 'compared_to', c.rehearsal_id, 'observed', v_obs)), p_cutover, c.rehearsal_id, v_eq,
          p_actor, coalesce(onboarding.principal_kind(p_actor), 'unknown'), p_correlation);
  IF v_eq THEN
    UPDATE onboarding.migration_cutovers SET state = 'verified', verified_at = clock_timestamp(), post_rehearsal_id = p_rehearsal, held_reasons = '[]'::jsonb, updated_at = clock_timestamp()
     WHERE cutover_id = p_cutover;
    UPDATE onboarding.migration_waves SET state = 'verified', held_reasons = coalesce((SELECT jsonb_agg(h) FROM jsonb_array_elements(w.held_reasons) h WHERE h ->> 'kind' <> 'post_cutover'), '[]'::jsonb),
           updated_at = clock_timestamp() WHERE wave_id = c.wave_id;
    PERFORM executive.b33_close_items(p_tenant, p_domain, 'onboarding.migration', 'cutover', p_cutover, 'the post-cutover reconciliation equals the approved rehearsal', p_actor, p_correlation);
  ELSE
    v_hold := jsonb_build_array(jsonb_build_object('kind', 'post_cutover', 'post_rehearsal_id', p_rehearsal, 'observed', v_obs,
      'route', 'the domain stays draft: remediate (re-execute is not offered — roll back by plan and re-run the wave) or roll back'));
    UPDATE onboarding.migration_cutovers SET state = 'executed', post_rehearsal_id = p_rehearsal, held_reasons = v_hold, updated_at = clock_timestamp() WHERE cutover_id = p_cutover;
    UPDATE onboarding.migration_waves SET held_reasons = coalesce((SELECT jsonb_agg(h) FROM jsonb_array_elements(w.held_reasons) h WHERE h ->> 'kind' <> 'post_cutover'), '[]'::jsonb) || v_hold,
           state = 'executed', updated_at = clock_timestamp() WHERE wave_id = c.wave_id;
    PERFORM onboarding.mg_raise_once(p_tenant, p_domain, 'onboarding.migration', 'cutover', p_cutover,
      format('Cutover of wave %s held: the post-cutover reconciliation differs from the approved rehearsal (%s of %s observed, %s failed, %s unexpected) (SYNTHETIC)', w.wave_key,
             v_obs ->> 'observed', v_obs ->> 'expected', v_obs ->> 'failed', v_obs ->> 'unexpected'), v_hold, p_actor, p_correlation);
  END IF;
  PERFORM onboarding.ledger('onboarding', p_tenant, p_domain, 'cutover', p_cutover, 1, CASE WHEN v_eq THEN 'cutover.reconciled' ELSE 'cutover.held' END, p_actor,
    jsonb_build_object('post_rehearsal_id', p_rehearsal, 'observed', v_obs, 'equal', v_eq), p_correlation);
  RETURN (SELECT to_jsonb(x) FROM onboarding.migration_rehearsals x WHERE x.rehearsal_id = p_rehearsal) || jsonb_build_object('cutover_state', CASE WHEN v_eq THEN 'verified' ELSE 'executed' END, 'held', NOT v_eq);
END $$;
REVOKE ALL ON FUNCTION onboarding.reconcile_cutover(uuid, uuid, uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION onboarding.reconcile_cutover(uuid, uuid, uuid, uuid, uuid, uuid) TO eye_commit;

/* DOMAIN ACTIVATION (D4; action tenancy.domain.activate — the tenancy authority: a tenant admin at TENANT scope, the 0019 idiom): refused
   unless the domain is DRAFT and its wave's cutover is EXECUTED and its post-cutover reconciliation EQUALS the approved rehearsal (re-read
   LIVE here, never trusted from a flag). Lifecycle `domain.activated` (with the cutover, wave and digests); the cutover and wave `activated`. */
CREATE OR REPLACE FUNCTION tenancy.activate_domain(p_domain uuid, p_tenant uuid, p_cutover uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = tenancy, onboarding, ctx, public, pg_catalog, pg_temp AS $$
DECLARE d tenancy.domains%ROWTYPE; c onboarding.migration_cutovers%ROWTYPE; v_obs jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['tenancy.domain.activate']);
  PERFORM ctx.assert_bound_target(p_domain::text);
  PERFORM onboarding.assert_tenant(p_tenant, 'migration cutover');
  PERFORM onboarding.mg_assert_actor('migration cutover', p_actor);
  SELECT * INTO d FROM tenancy.domains x WHERE x.id = p_domain AND x.tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'migration cutover rejected (unknown_domain): % is not a domain of this tenant', p_domain USING ERRCODE = '23503'; END IF;
  IF d.status <> 'draft' THEN RAISE EXCEPTION 'migration cutover rejected (state): domain % is %, not draft', d.name, d.status USING ERRCODE = '22023'; END IF;
  SELECT * INTO c FROM onboarding.migration_cutovers x WHERE x.cutover_id = p_cutover AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'migration cutover rejected (unknown_cutover): % is not a cutover of domain %', p_cutover, d.name USING ERRCODE = '23503'; END IF;
  IF c.state NOT IN ('executed', 'verified') THEN
    RAISE EXCEPTION 'migration cutover rejected (state): the cutover is % — a domain is activated only after its cutover is executed and reconciled', c.state USING ERRCODE = '22023';
  END IF;
  v_obs := onboarding.mg_post_observed(p_cutover);
  IF c.state <> 'verified' OR NOT (v_obs ->> 'equal')::boolean THEN
    RAISE EXCEPTION 'migration cutover rejected (held): the post-cutover reconciliation does not equal the approved rehearsal (% of % observed, % failed, % unexpected) — the domain stays draft',
      v_obs ->> 'observed', v_obs ->> 'expected', v_obs ->> 'failed', v_obs ->> 'unexpected' USING ERRCODE = '22023';
  END IF;
  UPDATE tenancy.domains SET status = 'active', activated_at = clock_timestamp() WHERE id = p_domain;
  INSERT INTO tenancy.lifecycle_events (id, scope, tenant_id, domain_id, event, actor, details)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, 'domain.activated', ctx.bound_actor(),
          jsonb_build_object('name', d.name, 'cutover_id', p_cutover, 'wave_id', c.wave_id, 'plan_digest', c.plan_digest, 'post_rehearsal_id', c.post_rehearsal_id, 'observed', v_obs, 'by', 'B94 §MG'));
  UPDATE onboarding.migration_cutovers SET state = 'activated', activated_at = clock_timestamp(), updated_at = clock_timestamp() WHERE cutover_id = p_cutover;
  UPDATE onboarding.migration_waves SET state = 'activated', updated_at = clock_timestamp() WHERE wave_id = c.wave_id;
  PERFORM onboarding.mg_open_task(p_tenant, p_domain, 'migration_wave', c.wave_id, 'acceptance', format('mg-acceptance-%s', c.wave_id),
    format('Accept or withhold the migration into %s (SYNTHETIC — an acceptance demonstrates the software; real acceptance is R2)', d.name), jsonb_build_object('cutover_id', p_cutover),
    c.executed_by, p_actor, p_correlation);
  PERFORM onboarding.ledger('onboarding', p_tenant, p_domain, 'domain', p_domain, NULL, 'domain.activated', p_actor,
    jsonb_build_object('cutover_id', p_cutover, 'wave_id', c.wave_id, 'plan_digest', c.plan_digest, 'observed', v_obs), p_correlation);
  RETURN jsonb_build_object('domain_id', p_domain, 'status', 'active', 'cutover_id', p_cutover, 'observed', v_obs);
END $$;
REVOKE ALL ON FUNCTION tenancy.activate_domain(uuid, uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tenancy.activate_domain(uuid, uuid, uuid, uuid, uuid) TO eye_commit;

/* ROLLBACK REHEARSAL (onboarding.rollback.rehearse; the lead): the plan read live and RECORDED with its digest (JRN-23's rollback proof) — no
   graph write. */
CREATE OR REPLACE FUNCTION onboarding.rehearse_rollback(p_rollback uuid, p_cutover uuid, p_tenant uuid, p_domain uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = onboarding, observation, pg_catalog, pg_temp AS $$
DECLARE c onboarding.migration_cutovers%ROWTYPE; v_plan jsonb; v_digest text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['onboarding.rollback.rehearse']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM onboarding.mg_assert_actor('migration rollback', p_actor);
  c := onboarding.mg_cutover('migration rollback', p_cutover, p_tenant, p_domain);
  IF c.state NOT IN ('executed', 'verified', 'activated') THEN RAISE EXCEPTION 'migration rollback rejected (state): the cutover is % — nothing was migrated to roll back', c.state USING ERRCODE = '22023'; END IF;
  v_plan := onboarding.mg_rollback_plan(p_cutover);
  v_digest := onboarding.digest(v_plan);
  INSERT INTO onboarding.migration_rollbacks (rollback_id, tenant_id, domain_id, cutover_id, kind, plan, digest, recorded_by, correlation_id)
  VALUES (p_rollback, p_tenant, p_domain, p_cutover, 'rehearsal', v_plan, v_digest, p_actor, p_correlation);
  PERFORM onboarding.mg_open_task(p_tenant, p_domain, 'cutover', p_cutover, 'rollback', format('mg-rollback-%s', p_rollback),
    format('Decide on executing the rehearsed rollback of cutover %s (SYNTHETIC)', left(p_cutover::text, 8)), jsonb_build_object('rollback_id', p_rollback, 'digest', v_digest), p_actor, p_actor, p_correlation);
  PERFORM onboarding.ledger('onboarding', p_tenant, p_domain, 'rollback', p_rollback, 1, 'rollback.rehearsed', p_actor,
    jsonb_build_object('cutover_id', p_cutover, 'digest', v_digest, 'retire', jsonb_array_length(v_plan -> 'retire'), 'keep_identifiers', jsonb_array_length(v_plan -> 'keep_identifiers')), p_correlation);
  RETURN (SELECT to_jsonb(x) FROM onboarding.migration_rollbacks x WHERE x.rollback_id = p_rollback);
END $$;
REVOKE ALL ON FUNCTION onboarding.rehearse_rollback(uuid, uuid, uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION onboarding.rehearse_rollback(uuid, uuid, uuid, uuid, uuid, uuid) TO eye_commit;

/* ROLLBACK EXECUTION (onboarding.rollback.execute; the onboarding authority — assert_approver, never the rehearsal's author, never a lead or an
   agent): on the rollback REHEARSAL's digest, re-read live (stale → 409). The created entities RETIRED (entity.retired; append-only — the
   rows, identifiers, staging and source evidence stay as history), an ACTIVE domain reverted to draft and RE-RECORDED
   (domain.activation_reverted), the cutover and wave `rolled_back`, the items closed. Terminal for the wave (its identifiers stay held). */
CREATE OR REPLACE FUNCTION onboarding.execute_rollback(p_rollback uuid, p_rehearsal uuid, p_cutover uuid, p_tenant uuid, p_domain uuid, p_digest text, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = onboarding, graph, tenancy, executive, observation, ctx, pg_catalog, pg_temp AS $$
DECLARE c onboarding.migration_cutovers%ROWTYPE; b onboarding.migration_rollbacks%ROWTYPE; v_plan jsonb; v_digest text; e jsonb; v_status text; v_n int := 0;
BEGIN
  PERFORM observation.assert_authority(ARRAY['onboarding.rollback.execute']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM onboarding.mg_assert_actor('migration rollback', p_actor);
  c := onboarding.mg_cutover('migration rollback', p_cutover, p_tenant, p_domain);
  SELECT * INTO b FROM onboarding.migration_rollbacks x WHERE x.rollback_id = p_rehearsal AND x.cutover_id = p_cutover AND x.kind = 'rehearsal';
  IF NOT FOUND THEN RAISE EXCEPTION 'migration rollback rejected (unknown_rollback): % is not a rollback rehearsal of this cutover', coalesce(p_rehearsal::text, '<none>') USING ERRCODE = '23503'; END IF;
  PERFORM onboarding.assert_approver('migration rollback', p_actor, p_tenant, p_domain, ARRAY['onboarding_authority'], b.recorded_by, 'executing a rollback');
  IF c.state NOT IN ('executed', 'verified', 'activated') THEN RAISE EXCEPTION 'migration rollback rejected (state): the cutover is %', c.state USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'migration rollback rejected (reason): a rollback states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  v_plan := onboarding.mg_rollback_plan(p_cutover);
  v_digest := onboarding.digest(v_plan);
  IF p_digest IS DISTINCT FROM b.digest OR v_digest IS DISTINCT FROM b.digest THEN
    RAISE EXCEPTION 'migration rollback rejected (stale): the rollback plan is no longer the rehearsed one (or the digest seen differs) — rehearse the rollback again' USING ERRCODE = '22023';
  END IF;
  FOR e IN SELECT x FROM jsonb_array_elements(v_plan -> 'retire') x LOOP
    UPDATE graph.entities_current SET lifecycle_state = 'retired', updated_at = clock_timestamp()
     WHERE entity_id = (e ->> 'entity_id')::uuid AND tenant_id = p_tenant AND domain_id = p_domain AND lifecycle_state = 'active';
    INSERT INTO graph.entity_events (event_id, scope, tenant_id, domain_id, entity_id, event, actor_principal_id, details, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, (e ->> 'entity_id')::uuid, 'entity.retired', p_actor,
            jsonb_build_object('reason', 'migration rollback', 'rollback_id', p_rollback, 'cutover_id', p_cutover, 'row_no', e -> 'row_no', 'legacy_id', e -> 'legacy_id'), p_correlation);
    v_n := v_n + 1;
  END LOOP;
  SELECT d.status INTO v_status FROM tenancy.domains d WHERE d.id = p_domain FOR UPDATE;
  IF v_status = 'active' THEN
    UPDATE tenancy.domains SET status = 'draft' WHERE id = p_domain;
    INSERT INTO tenancy.lifecycle_events (id, scope, tenant_id, domain_id, event, actor, details)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, 'domain.activation_reverted', ctx.bound_actor(),
            jsonb_build_object('rollback_id', p_rollback, 'cutover_id', p_cutover, 'reason', btrim(p_reason), 'by', 'B94 §MG'));
  END IF;
  INSERT INTO onboarding.migration_rollbacks (rollback_id, tenant_id, domain_id, cutover_id, kind, plan, digest, rehearsal_of, reason, recorded_by, correlation_id)
  VALUES (p_rollback, p_tenant, p_domain, p_cutover, 'executed', v_plan || jsonb_build_object('retired', v_n, 'domain_reverted', v_status = 'active'), v_digest, p_rehearsal, btrim(p_reason), p_actor, p_correlation);
  UPDATE onboarding.migration_cutovers SET state = 'rolled_back', rolled_back_at = clock_timestamp(), held_reasons = '[]'::jsonb, updated_at = clock_timestamp() WHERE cutover_id = p_cutover;
  UPDATE onboarding.migration_waves SET state = 'rolled_back', held_reasons = '[]'::jsonb, updated_at = clock_timestamp() WHERE wave_id = c.wave_id;
  PERFORM executive.b33_close_items(p_tenant, p_domain, NULL, 'cutover', p_cutover, 'the cutover is rolled back by plan', p_actor, p_correlation);
  PERFORM executive._resolve_human_tasks(p_tenant, p_domain, jsonb_build_object('kind', 'cutover', 'id', p_cutover, 'what', 'rollback'), ARRAY['onboarding.approve'], 'executed', p_rollback, p_actor, p_correlation);
  PERFORM executive._cancel_human_tasks(p_tenant, p_domain, jsonb_build_object('kind', 'migration_wave', 'id', c.wave_id), ARRAY['onboarding.approve'], 'the wave is rolled back', p_actor, p_correlation);
  PERFORM executive.b33_close_items(p_tenant, p_domain, NULL, 'migration_wave', c.wave_id, 'the wave is rolled back by plan', p_actor, p_correlation);
  PERFORM onboarding.ledger('onboarding', p_tenant, p_domain, 'rollback', p_rollback, 1, 'rollback.executed', p_actor,
    jsonb_build_object('cutover_id', p_cutover, 'rehearsal_of', p_rehearsal, 'digest', v_digest, 'retired', v_n, 'domain_reverted', v_status = 'active', 'reason', btrim(p_reason)), p_correlation);
  RETURN (SELECT to_jsonb(x) FROM onboarding.migration_rollbacks x WHERE x.rollback_id = p_rollback);
END $$;
REVOKE ALL ON FUNCTION onboarding.execute_rollback(uuid, uuid, uuid, uuid, uuid, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION onboarding.execute_rollback(uuid, uuid, uuid, uuid, uuid, text, text, uuid, uuid) TO eye_commit;

/* ACCEPTANCE (onboarding.acceptance.decide; the onboarding authority — assert_approver, never the lead who executed, never an agent): on the
   CANDIDATE's digest (stale → 409); `accepted` requires the domain ACTIVATED through this wave's verified cutover, is SIGNED (`acceptance`),
   marks the wave `accepted` and writes the programme's NEXT VERSION `accepted` (§MG writes it — D5); `withheld` records the refusal and keeps
   the prior safe operation (the domain and the wave unchanged — WS-20). claim = demonstration, always. */
CREATE OR REPLACE FUNCTION onboarding.decide_acceptance(p_acceptance uuid, p_wave uuid, p_tenant uuid, p_domain uuid, p_decision text, p_journeys text[], p_roles text[], p_baseline_digest text,
                                                        p_digest text, p_reason text, p_signature uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = onboarding, executive, identity, observation, pg_catalog, pg_temp AS $$
DECLARE w onboarding.migration_waves%ROWTYPE; c onboarding.migration_cutovers%ROWTYPE; p onboarding.programmes%ROWTYPE; v_cand jsonb; v_digest text; v_j text; v_r text; v_plan jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['onboarding.acceptance.decide']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM onboarding.mg_assert_actor('onboarding acceptance', p_actor);
  w := onboarding.mg_wave('onboarding acceptance', p_wave, p_tenant, p_domain);
  SELECT * INTO c FROM onboarding.migration_cutovers x WHERE x.wave_id = p_wave AND x.state NOT IN ('rolled_back', 'superseded');
  PERFORM onboarding.assert_approver('onboarding acceptance', p_actor, p_tenant, p_domain, ARRAY['onboarding_authority'], coalesce(c.executed_by, w.created_by), 'accepting a migration');
  IF p_decision NOT IN ('accept', 'withhold') THEN RAISE EXCEPTION 'onboarding acceptance rejected (decision): accept or withhold' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'onboarding acceptance rejected (reason): a decision states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  IF p_journeys IS NULL OR cardinality(p_journeys) = 0 THEN RAISE EXCEPTION 'onboarding acceptance rejected (journeys): an acceptance names the journeys it accepts (JRN-nn)' USING ERRCODE = '22023'; END IF;
  FOREACH v_j IN ARRAY p_journeys LOOP
    IF v_j !~ '^JRN-[0-9]{2}$' THEN RAISE EXCEPTION 'onboarding acceptance rejected (journeys): % is not a journey id (JRN-nn)', v_j USING ERRCODE = '22023'; END IF;
  END LOOP;
  IF p_roles IS NULL OR cardinality(p_roles) = 0 THEN RAISE EXCEPTION 'onboarding acceptance rejected (roles): an acceptance names the roles exercised' USING ERRCODE = '22023'; END IF;
  FOREACH v_r IN ARRAY p_roles LOOP
    IF NOT EXISTS (SELECT 1 FROM identity.roles x WHERE x.code = v_r) THEN RAISE EXCEPTION 'onboarding acceptance rejected (roles): % is not a role', v_r USING ERRCODE = '22023'; END IF;
  END LOOP;
  IF p_baseline_digest IS NOT NULL AND p_baseline_digest !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'onboarding acceptance rejected (baseline): a baseline digest is 64 hex characters' USING ERRCODE = '22023'; END IF;
  IF p_decision = 'accept' THEN
    IF w.state <> 'activated' OR c.cutover_id IS NULL OR c.state <> 'activated' OR onboarding.mg_domain_status(p_tenant, p_domain) IS DISTINCT FROM 'active' THEN
      RAISE EXCEPTION 'onboarding acceptance rejected (state): wave % is % — acceptance follows a verified cutover and the domain''s activation', w.wave_key, w.state USING ERRCODE = '22023';
    END IF;
    IF NOT (onboarding.mg_post_observed(c.cutover_id) ->> 'equal')::boolean THEN
      RAISE EXCEPTION 'onboarding acceptance rejected (held): the migrated records no longer equal the approved rehearsal' USING ERRCODE = '22023';
    END IF;
  ELSIF w.state IN ('accepted', 'withdrawn') THEN
    RAISE EXCEPTION 'onboarding acceptance rejected (state): wave % is %', w.wave_key, w.state USING ERRCODE = '22023';
  END IF;
  v_cand := onboarding.mg_acceptance_candidate(p_tenant, p_domain, p_wave, p_journeys, p_roles, p_baseline_digest);
  v_digest := onboarding.digest(v_cand);
  IF p_digest IS DISTINCT FROM v_digest THEN
    RAISE EXCEPTION 'onboarding acceptance rejected (stale): the digest seen (%) is not the acceptance candidate''s — read the candidate again', coalesce(left(p_digest, 12), '<none>') USING ERRCODE = '22023';
  END IF;
  IF p_decision = 'accept' AND (p_signature IS NULL OR NOT EXISTS (SELECT 1 FROM executive.signatures s WHERE s.signature_id = p_signature AND s.subject_kind = 'acceptance' AND s.subject_id = p_acceptance
                                                                     AND s.subject_version = 1 AND s.subject_digest = v_digest AND s.signer = p_actor)) THEN
    RAISE EXCEPTION 'onboarding acceptance rejected (signature): an acceptance is signed by the accepting authority over the candidate''s digest' USING ERRCODE = '22023';
  END IF;
  INSERT INTO onboarding.migration_acceptances (acceptance_id, tenant_id, domain_id, wave_id, cutover_id, programme_id, decision, bound, digest, reason, decided_by, signature_id, correlation_id)
  VALUES (p_acceptance, p_tenant, p_domain, p_wave, c.cutover_id, w.programme_id, CASE WHEN p_decision = 'accept' THEN 'accepted' ELSE 'withheld' END, v_cand, v_digest, btrim(p_reason), p_actor,
          CASE WHEN p_decision = 'accept' THEN p_signature END, p_correlation);
  IF p_decision = 'accept' THEN
    UPDATE onboarding.migration_waves SET state = 'accepted', updated_at = clock_timestamp() WHERE wave_id = p_wave;
    SELECT * INTO p FROM onboarding.programmes x WHERE x.programme_id = w.programme_id AND x.superseded_at IS NULL FOR UPDATE;
    IF FOUND AND p.state NOT IN ('accepted', 'withdrawn') THEN
      v_plan := p.plan || jsonb_build_object('accepted_by_migration', jsonb_build_object('acceptance_id', p_acceptance, 'wave_id', p_wave, 'digest', v_digest, 'claim', 'demonstration'));
      -- B94 integration: the next programme version through §ON's own writer (one digest formula — onboarding.programme_digest — and §ON's ledger event)
      PERFORM onboarding._programme_next(p, p.title, p.target_domain_id, p.deployment_profile, 'accepted', '[]'::jsonb, v_plan, 'programme.accepted', p_actor,
        jsonb_build_object('acceptance_id', p_acceptance, 'wave_id', p_wave, 'domain_id', p_domain, 'claim', 'demonstration'), p_correlation);
    END IF;
  END IF;
  IF p_decision = 'accept' THEN
    PERFORM executive._resolve_human_tasks(p_tenant, p_domain, jsonb_build_object('kind', 'migration_wave', 'id', p_wave, 'what', 'acceptance'), ARRAY['onboarding.approve'], 'accepted', p_acceptance, p_actor, p_correlation);
  END IF;
  PERFORM onboarding.ledger('onboarding', p_tenant, p_domain, 'acceptance', p_acceptance, 1, CASE WHEN p_decision = 'accept' THEN 'acceptance.recorded' ELSE 'acceptance.withheld' END, p_actor,
    jsonb_build_object('wave_id', p_wave, 'digest', v_digest, 'claim', 'demonstration', 'reason', btrim(p_reason), 'signature_id', p_signature), p_correlation);
  RETURN (SELECT to_jsonb(x) FROM onboarding.migration_acceptances x WHERE x.acceptance_id = p_acceptance);
END $$;
REVOKE ALL ON FUNCTION onboarding.decide_acceptance(uuid, uuid, uuid, uuid, text, text[], text[], text, text, text, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION onboarding.decide_acceptance(uuid, uuid, uuid, uuid, text, text[], text[], text, text, text, uuid, uuid, uuid) TO eye_commit;

/* WAVE WITHDRAW (onboarding.wave.withdraw; the lead): a wave that never cut over is withdrawn (its records stay). */
CREATE OR REPLACE FUNCTION onboarding.withdraw_wave(p_wave uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = onboarding, executive, observation, pg_catalog, pg_temp AS $$
DECLARE w onboarding.migration_waves%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['onboarding.wave.withdraw']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM onboarding.mg_assert_actor('migration wave', p_actor);
  w := onboarding.mg_wave('migration wave', p_wave, p_tenant, p_domain);
  IF w.state NOT IN ('planned', 'rehearsing', 'reconciled') THEN RAISE EXCEPTION 'migration wave rejected (state): wave % is % — a wave past its cutover approval is rolled back, not withdrawn', w.wave_key, w.state USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'migration wave rejected (reason): a withdrawal states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  PERFORM onboarding.mg_supersede_requested(p_tenant, p_domain, p_wave, 'the wave is withdrawn', p_actor, p_correlation);
  UPDATE onboarding.migration_waves SET state = 'withdrawn', held_reasons = '[]'::jsonb, updated_at = clock_timestamp() WHERE wave_id = p_wave;
  PERFORM executive.b33_close_items(p_tenant, p_domain, NULL, 'migration_wave', p_wave, 'the wave is withdrawn', p_actor, p_correlation);
  PERFORM executive._cancel_human_tasks(p_tenant, p_domain, jsonb_build_object('kind', 'migration_wave', 'id', p_wave), ARRAY['onboarding.approve'], 'the wave is withdrawn', p_actor, p_correlation);
  PERFORM onboarding.ledger('onboarding', p_tenant, p_domain, 'migration_wave', p_wave, 1, 'wave.withdrawn', p_actor, jsonb_build_object('reason', btrim(p_reason)), p_correlation);
  RETURN (SELECT to_jsonb(x) FROM onboarding.migration_waves x WHERE x.wave_id = p_wave);
END $$;
REVOKE ALL ON FUNCTION onboarding.withdraw_wave(uuid, uuid, uuid, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION onboarding.withdraw_wave(uuid, uuid, uuid, text, uuid, uuid) TO eye_commit;


-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §IM+§AD — the implementation programme, readiness and the go-live gate, enablement and adoption, MET-039 (F-P7-F-05; carryover b)
-- (folded at integration from the part-local file 0114_b94_x_im.sql, unchanged but for the marked `B94 integration` edits; apply order §0, §ON, §MG, §IM, §SV, §SA)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0114 §IM+§AD — CP-6 B94: THE IMPLEMENTATION PROGRAMME, READINESS AND THE GO-LIVE GATE, ENABLEMENT AND ADOPTION (F-P7-F-05: V8 ch.68
-- PR-68-001, PR-68-002, PR-68-003, PR-68-005, PR-68-006, CAP-DL-07, CAP-DL-08, AT-68; V8+V9 WS-20) and the carryover MET-039 (B92 → B94:
-- `analytics.mc_met039_time_to_accepted_operation`, now that this part records its sources). Part-local: applies ALONE on 0001–0113 + the
-- 0114 prelude (§0). Nothing of 0001–0113 or of the prelude is re-declared here.
--
-- WHAT IS BUILT (DESIGN.md D8, D9, D12):
--   §IM.1  the IMPLEMENTATION PROGRAMME (TENANT, versioned; links the onboarding programme and the TARGET domain): open, revise, start, hold,
--          resume, withdraw; its parts (PR-68-002) as versioned programme items — milestones, dependencies, stakeholders, processes, journeys
--          (priority journeys are accepted at go-live), risks, outcomes, feedback, role requirements and VALUE MEASURES (a pointer to a B92
--          metric definition); CHANGES proposed by the lead and approved ONLY by the customer sponsor or the onboarding authority (PR-68-003).
--   §IM.2  READINESS ITEMS per target domain (role_filled | owner_resolved | training_coverage | competence_coverage | accessibility_attested |
--          shadow_review | custom), EVALUATED LIVE — there is no stored "ready" flag; THE GATE = every blocking item satisfied (or accepted as a
--          signed residual risk by the onboarding authority — never for an unfilled accountable role, an unresolved owner or an inaccessible
--          path); a value measure cited in readiness whose B92 definition carries an approved exception (or is not approved) BLOCKS — a
--          measure, a cohort result or a percentage NEVER releases the gate (PR-68-003). A held gate raises `implementation.readiness` and, for
--          an owner gap, `responsibility.gap` (IA-04-005: the gap stays visible until filled or accepted); a ready gate closes them and opens the
--          sponsor's `implementation.golive_review` task.
--   §IM.3  GO-LIVE: `implementation.golive.approve` by the customer sponsor or the onboarding authority (onboarding.assert_approver: a named
--          human, never the lead, never an agent), on the exact gate digest, refused 409 `held` while held, naming the accepted OPERATING
--          CADENCE (an executive.cadences row of the domain) and the accepted PRIORITY JOURNEYS; SIGNED (executive.signatures kind `readiness`,
--          sealed in the same transaction — a deferred constraint refuses an unsigned approval). The decision carries the ACCEPTANCE RECORD
--          (PR-68-006: the exact programme version, journeys, roles, domain, deployment profile, licence, contract, configuration baseline,
--          paths, cohorts, shadow review, measures, period) with claim `demonstration` — this product never writes a customer acceptance (R2).
--          WITHHOLDING acceptance (WS-20) is recorded and changes nothing else: the prior safe operation stands.
--   §AD.1  ENABLEMENT: training PATHS (versioned, an ACCESSIBILITY ATTESTATION by a named human — an inaccessible or unattested path blocks
--          readiness), training RECORDS (the lead or an enablement assessor records completion for a holder of the path's roles; the SUBJECT
--          sees it), COMPETENCE records (a named enablement assessor ≠ subject, never a lead; complete | not_yet — no score, no rank). Both are
--          purpose-bound (`enablement_readiness` — no performance purpose exists), retention-limited (retain_until) and filtered PER PERSON by
--          RLS (the subject, the recorder, the authorities); the gate and the cohorts read COUNTS per role, never a name.
--   §AD.2  COHORTS (role × rollout wave — never a person) and the ADOPTION MEASURES `ADP-001` (training completion) and `ADP-002` (competence
--          completion) as B92 computations (rate; dimensions role, wave; k ≥ 5 — below k the result is INDETERMINATE, said so).
--   §AD.3  SHADOW WORKFLOWS: a legacy upload after cutover (the legacy upload contract RETIRED) is recorded as a SHADOW FINDING (the refused
--          attempt cited); open findings and the declared SHADOW-PROCESS REVIEW feed the `shadow_review` readiness item.
--   §MC    MET-039 `analytics.mc_met039_time_to_accepted_operation` (B92 §0.7 contract): per accepted implementation programme of the TENANT,
--          days from the effective_from of the contract current at the programme's opening to the go-live acceptance naming an accepted
--          cadence and accepted priority journeys; not yet accepted → excluded "not yet accepted" (indeterminate), never a value.
--
-- THREE CLAIMS, never mixed: CONSTRUCTION (this software and phase6-implementation-b94); DEMONSTRATED OPERATION (the act on SYNTHETIC
-- NORDWERK personas — an in-product go-live by a SYNTHETIC sponsor demonstrates the software only); REAL CUSTOMER ACCEPTANCE (AT-68,
-- PR-68-006's sponsor acceptance — R2, never claimed). Production admission and profile parity: R1 / B111.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- §IM.0 VOCABULARY AND HELPERS (internal) ──────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION implementation.item_kinds() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY[
  'milestone', 'dependency', 'stakeholder', 'process', 'journey', 'risk', 'outcome', 'feedback', 'role_requirement', 'value_measure'] $$;
CREATE OR REPLACE FUNCTION implementation.readiness_kinds() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY[
  'role_filled', 'owner_resolved', 'training_coverage', 'competence_coverage', 'accessibility_attested', 'shadow_review', 'custom'] $$;
/* The kinds no residual-risk acceptance can override: an unfilled accountable role, an unresolved accountable owner (IA-04-005) and an
   inaccessible path (PR-68-003: adoption never bypasses accessibility). */
CREATE OR REPLACE FUNCTION implementation.nonoverridable_kinds() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY['role_filled', 'owner_resolved', 'accessibility_attested'] $$;
/* The ONLY purpose a training or competence record may serve (no performance evaluation, no scoring, no ranking — ever). */
CREATE OR REPLACE FUNCTION implementation.record_purposes() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY['enablement_readiness'] $$;
GRANT EXECUTE ON FUNCTION implementation.item_kinds(), implementation.readiness_kinds(), implementation.nonoverridable_kinds(), implementation.record_purposes() TO eye_app, eye_commit;

/* The acting principal is the context's principal (every port). */
CREATE OR REPLACE FUNCTION implementation.imp_actor(p_noun text, p_actor uuid) RETURNS void
LANGUAGE plpgsql STABLE SET search_path = public, pg_catalog, pg_temp AS $$
BEGIN
  IF p_actor IS NULL OR p_actor IS DISTINCT FROM public.eye_principal() THEN
    RAISE EXCEPTION '% rejected (actor): the act is recorded under the acting principal', p_noun USING ERRCODE = '42501';
  END IF;
END $$;
REVOKE ALL ON FUNCTION implementation.imp_actor(text, uuid) FROM PUBLIC;

/* A named ACTIVE HUMAN acting (an agent never records a person's training or competence, attests accessibility or confirms an item). */
CREATE OR REPLACE FUNCTION implementation.imp_human(p_noun text, p_actor uuid, p_what text) RETURNS void
LANGUAGE plpgsql STABLE SET search_path = onboarding, pg_catalog, pg_temp AS $$
BEGIN
  IF onboarding.principal_kind(p_actor) IS DISTINCT FROM 'human' THEN
    RAISE EXCEPTION '% rejected (actor): % is a named human''s act; an agent or a system never does it', p_noun, p_what USING ERRCODE = '42501';
  END IF;
END $$;
REVOKE ALL ON FUNCTION implementation.imp_human(text, uuid, text) FROM PUBLIC;

/* The live holders of roles in the domain (a DOMAIN binding of the domain or a TENANT binding of the tenant), active principals, with the
   binding that makes each a holder (the earliest), as of p_at (NULL = now). */
CREATE OR REPLACE FUNCTION implementation.imp_holders(p_tenant uuid, p_domain uuid, p_roles text[], p_at timestamptz DEFAULT NULL)
RETURNS TABLE (principal_id uuid, role_code text, binding_id uuid, bound_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = identity, pg_catalog, pg_temp AS $$
  SELECT DISTINCT ON (b.principal_id, b.role_code) b.principal_id, b.role_code, b.id, b.created_at
    FROM identity.role_bindings b JOIN identity.principals p ON p.id = b.principal_id
   WHERE b.role_code = ANY (p_roles) AND p.status = 'active' AND b.tenant_id = p_tenant
     AND (b.scope = 'TENANT' OR (b.scope = 'DOMAIN' AND b.domain_id = p_domain))
     AND (p_at IS NULL AND b.revoked_at IS NULL OR p_at IS NOT NULL AND b.created_at <= p_at AND (b.revoked_at IS NULL OR b.revoked_at > p_at))
   ORDER BY b.principal_id, b.role_code, b.created_at, b.id
$$;
REVOKE ALL ON FUNCTION implementation.imp_holders(uuid, uuid, text[], timestamptz) FROM PUBLIC;

CREATE OR REPLACE FUNCTION implementation.imp_event(p_tenant uuid, p_domain uuid, p_kind text, p_subject uuid, p_version int, p_event text, p_actor uuid, p_details jsonb, p_correlation uuid)
RETURNS uuid LANGUAGE sql SECURITY DEFINER SET search_path = onboarding, pg_catalog, pg_temp AS $$
  SELECT onboarding.ledger('implementation', p_tenant, p_domain, p_kind, p_subject, p_version, p_event, p_actor, p_details, p_correlation)
$$;
REVOKE ALL ON FUNCTION implementation.imp_event(uuid, uuid, text, uuid, int, text, uuid, jsonb, uuid) FROM PUBLIC;

-- §IM.1 THE PROGRAMME ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* THE IMPLEMENTATION PROGRAMME (D8; PR-68-001, CAP-DL-07): TENANT-scoped and versioned — moving one customer context (the TARGET domain,
   which may be the §ON draft domain) from current practice to governed operation. state planned → in_progress ⇄ held → accepted (the signed
   go-live) | withdrawn. The plan is the programme's own statement (objectives, scope, constraints). */
CREATE TABLE implementation.programmes (
  programme_id     uuid NOT NULL,
  version          int  NOT NULL CHECK (version >= 1),
  scope            text NOT NULL DEFAULT 'TENANT' CHECK (scope = 'TENANT'),
  tenant_id        uuid NOT NULL REFERENCES tenancy.tenants (id),
  programme_key    text NOT NULL CHECK (programme_key ~ '^[a-z][a-z0-9_.-]{2,62}$'),
  title            text NOT NULL CHECK (length(btrim(title)) BETWEEN 4 AND 200),
  target_domain_id uuid NOT NULL,
  onboarding_programme_id uuid,
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
  CONSTRAINT ipr_held CHECK (state <> 'held' OR jsonb_array_length(held_reasons) >= 1)
);
CREATE UNIQUE INDEX ipr_one_current ON implementation.programmes (programme_id) WHERE superseded_at IS NULL;
CREATE UNIQUE INDEX ipr_key ON implementation.programmes (tenant_id, programme_key) WHERE superseded_at IS NULL;
CREATE INDEX ipr_domain ON implementation.programmes (tenant_id, target_domain_id) WHERE superseded_at IS NULL;

/* THE PROGRAMME'S PARTS (PR-68-002): versioned rows per (programme, kind, key); a correction is a new version (expected version, stale → 409),
   a retirement a new version in state retired. A journey with attributes.priority = true is a PRIORITY journey (accepted at go-live); a
   value measure points to a B92 metric definition ({metric_key, cited_in_readiness}) — it may BLOCK readiness, never release it. */
CREATE TABLE implementation.programme_items (
  item_id          uuid NOT NULL,
  version          int  NOT NULL CHECK (version >= 1),
  scope            text NOT NULL DEFAULT 'TENANT' CHECK (scope = 'TENANT'),
  tenant_id        uuid NOT NULL,
  programme_id     uuid NOT NULL,
  kind             text NOT NULL CHECK (kind = ANY (implementation.item_kinds())),
  item_key         text NOT NULL CHECK (item_key ~ '^[a-z][a-z0-9_.-]{1,62}$'),
  title            text NOT NULL CHECK (length(btrim(title)) BETWEEN 4 AND 200),
  attributes       jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(attributes) = 'object'),
  state            text NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'retired')),
  digest           text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  recorded_by      uuid NOT NULL,
  recorded_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  superseded_at    timestamptz,
  correlation_id   uuid NOT NULL,
  PRIMARY KEY (item_id, version)
);
CREATE UNIQUE INDEX ipi_one_current ON implementation.programme_items (programme_id, kind, item_key) WHERE superseded_at IS NULL;
CREATE UNIQUE INDEX ipi_item_current ON implementation.programme_items (item_id) WHERE superseded_at IS NULL;

/* A CHANGE to the programme (PR-68-003: customer leaders own organizational change): proposed by the lead, APPROVED or rejected only by the
   customer sponsor or the onboarding authority (a named human, never the proposer, never a lead), on the exact digest. */
CREATE TABLE implementation.changes (
  change_id        uuid PRIMARY KEY,
  scope            text NOT NULL DEFAULT 'TENANT' CHECK (scope = 'TENANT'),
  tenant_id        uuid NOT NULL,
  programme_id     uuid NOT NULL,
  title            text NOT NULL CHECK (length(btrim(title)) BETWEEN 4 AND 200),
  description      text NOT NULL CHECK (length(btrim(description)) >= 8),
  impact           jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(impact) = 'object'),
  state            text NOT NULL DEFAULT 'proposed' CHECK (state IN ('proposed', 'approved', 'rejected')),
  digest           text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  proposed_by      uuid NOT NULL,
  proposed_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  decided_by       uuid,
  decided_at       timestamptz,
  decision_reason  text,
  correlation_id   uuid NOT NULL,
  CONSTRAINT ich_decided CHECK (state = 'proposed' OR (decided_by IS NOT NULL AND decided_at IS NOT NULL)),
  CONSTRAINT ich_sod CHECK (decided_by IS NULL OR decided_by <> proposed_by)
);

/* The current programme row of the tenant (or the class-form 404). */
CREATE OR REPLACE FUNCTION implementation.imp_programme(p_tenant uuid, p_programme uuid, p_noun text) RETURNS implementation.programmes
LANGUAGE plpgsql STABLE SET search_path = implementation, pg_catalog, pg_temp AS $$
DECLARE r implementation.programmes%ROWTYPE;
BEGIN
  SELECT * INTO r FROM implementation.programmes x WHERE x.programme_id = p_programme AND x.tenant_id = p_tenant AND x.superseded_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION '% rejected (unknown_programme): % is not an implementation programme of this tenant', p_noun, p_programme USING ERRCODE = '23503'; END IF;
  RETURN r;
END $$;
REVOKE ALL ON FUNCTION implementation.imp_programme(uuid, uuid, text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION implementation.imp_programme_digest(r implementation.programmes) RETURNS text
LANGUAGE sql STABLE SET search_path = onboarding, pg_catalog, pg_temp AS $$
  SELECT onboarding.digest(jsonb_build_object('programme_id', r.programme_id, 'version', r.version, 'key', r.programme_key, 'title', r.title, 'target_domain_id', r.target_domain_id,
    'onboarding_programme_id', r.onboarding_programme_id, 'deployment_profile', r.deployment_profile, 'owner', r.owner_principal_id, 'state', r.state,
    'held_reasons', r.held_reasons, 'plan', r.plan))
$$;
REVOKE ALL ON FUNCTION implementation.imp_programme_digest(implementation.programmes) FROM PUBLIC;

/* Write the NEXT version of a programme (internal): the current row superseded, the new row digested. */
CREATE OR REPLACE FUNCTION implementation.imp_next_version(o implementation.programmes, p_state text, p_held jsonb, p_title text, p_plan jsonb, p_onboarding uuid, p_profile text,
                                                          p_actor uuid, p_correlation uuid) RETURNS implementation.programmes
LANGUAGE plpgsql SET search_path = implementation, pg_catalog, pg_temp AS $$
DECLARE n implementation.programmes%ROWTYPE;
BEGIN
  UPDATE implementation.programmes SET superseded_at = clock_timestamp() WHERE programme_id = o.programme_id AND version = o.version;
  n := o;
  n.version := o.version + 1; n.state := p_state; n.held_reasons := coalesce(p_held, '[]'::jsonb); n.title := coalesce(p_title, o.title); n.plan := coalesce(p_plan, o.plan);
  n.onboarding_programme_id := p_onboarding; n.deployment_profile := coalesce(p_profile, o.deployment_profile);
  n.effective_from := clock_timestamp(); n.superseded_at := NULL; n.created_by := p_actor; n.created_at := clock_timestamp(); n.correlation_id := p_correlation;
  n.digest := implementation.imp_programme_digest(n);
  INSERT INTO implementation.programmes VALUES (n.*);
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION implementation.imp_next_version(implementation.programmes, text, jsonb, text, jsonb, uuid, text, uuid, uuid) FROM PUBLIC;

/* The onboarding programme a programme links (§ON's table; the prelude's shared table) — must be the tenant's current one. */
CREATE OR REPLACE FUNCTION implementation.imp_check_onboarding(p_tenant uuid, p_onboarding uuid, p_target uuid) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = onboarding, pg_catalog, pg_temp AS $$
DECLARE o onboarding.programmes%ROWTYPE;
BEGIN
  IF p_onboarding IS NULL THEN RETURN; END IF;
  SELECT * INTO o FROM onboarding.programmes x WHERE x.programme_id = p_onboarding AND x.tenant_id = p_tenant AND x.superseded_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'implementation programme rejected (unknown_onboarding_programme): % is not an onboarding programme of this tenant', p_onboarding USING ERRCODE = '23503'; END IF;
  IF o.target_domain_id IS NOT NULL AND o.target_domain_id IS DISTINCT FROM p_target THEN
    RAISE EXCEPTION 'implementation programme rejected (target): the onboarding programme % onboards domain %, not %', p_onboarding, o.target_domain_id, p_target USING ERRCODE = '22023';
  END IF;
END $$;
REVOKE ALL ON FUNCTION implementation.imp_check_onboarding(uuid, uuid, uuid) FROM PUBLIC;

/* OPEN a programme (implementation.programme.open — the implementation lead or the tenant admin; TENANT route). */
CREATE OR REPLACE FUNCTION implementation.open_programme(p_programme uuid, p_tenant uuid, p_key text, p_title text, p_target_domain uuid, p_onboarding uuid, p_profile text, p_plan jsonb,
                                                         p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = implementation, onboarding, tenancy, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE n implementation.programmes%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['implementation.programme.open']);
  PERFORM onboarding.assert_tenant(p_tenant, 'implementation programme');
  PERFORM implementation.imp_actor('implementation programme', p_actor);
  IF NOT onboarding.holds_role(p_actor, p_tenant, NULL, ARRAY['implementation_lead', 'tenant_admin']) THEN
    RAISE EXCEPTION 'implementation programme rejected (authority): a programme is opened by an implementation lead or the tenant administrator' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM tenancy.domains d WHERE d.id = p_target_domain AND d.tenant_id = p_tenant AND d.status IN ('draft', 'active')) THEN
    RAISE EXCEPTION 'implementation programme rejected (unknown_domain): % is not a draft or active domain of this tenant', p_target_domain USING ERRCODE = '23503';
  END IF;
  PERFORM implementation.imp_check_onboarding(p_tenant, p_onboarding, p_target_domain);
  IF coalesce(p_key, '') !~ '^[a-z][a-z0-9_.-]{2,62}$' THEN RAISE EXCEPTION 'implementation programme rejected (key): a programme key is lower-case (3–63 characters)' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_title, ''))) NOT BETWEEN 4 AND 200 THEN RAISE EXCEPTION 'implementation programme rejected (title): a title of 4–200 characters' USING ERRCODE = '22023'; END IF;
  IF jsonb_typeof(coalesce(p_plan, '{}'::jsonb)) <> 'object' OR length(btrim(coalesce(p_plan ->> 'objective', ''))) < 8 THEN
    RAISE EXCEPTION 'implementation programme rejected (plan): the plan states its objective (8+ characters)' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM implementation.programmes x WHERE x.tenant_id = p_tenant AND x.programme_key = p_key AND x.superseded_at IS NULL) THEN
    RAISE EXCEPTION 'implementation programme rejected (duplicate): the tenant already has a programme %', p_key USING ERRCODE = '22023';
  END IF;
  n := ROW(p_programme, 1, 'TENANT', p_tenant, p_key, btrim(p_title), p_target_domain, p_onboarding, coalesce(p_profile, 'local-dev'), p_actor, 'planned', '[]'::jsonb, p_plan,
           repeat('0', 64), clock_timestamp(), NULL, p_actor, clock_timestamp(), p_correlation)::implementation.programmes;
  n.digest := implementation.imp_programme_digest(n);
  INSERT INTO implementation.programmes VALUES (n.*);
  PERFORM implementation.imp_event(p_tenant, NULL, 'implementation_programme', p_programme, 1, 'programme.opened', p_actor,
                                   jsonb_build_object('key', p_key, 'target_domain_id', p_target_domain, 'onboarding_programme_id', p_onboarding, 'digest', n.digest), p_correlation);
  RETURN to_jsonb(n);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION implementation.open_programme(uuid, uuid, text, text, uuid, uuid, text, jsonb, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION implementation.open_programme(uuid, uuid, text, text, uuid, uuid, text, jsonb, uuid, uuid) TO eye_commit;

/* REVISE (implementation.programme.revise — the lead or the tenant admin): a new version with the title / plan / onboarding link / profile
   changed, at the expected version (stale → 409). The target domain is fixed (another target is another programme). */
CREATE OR REPLACE FUNCTION implementation.revise_programme(p_programme uuid, p_tenant uuid, p_expected_version int, p_title text, p_plan jsonb, p_onboarding uuid, p_profile text,
                                                           p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = implementation, onboarding, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE o implementation.programmes%ROWTYPE; n implementation.programmes%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['implementation.programme.revise']);
  PERFORM onboarding.assert_tenant(p_tenant, 'implementation programme');
  PERFORM implementation.imp_actor('implementation programme', p_actor);
  IF NOT onboarding.holds_role(p_actor, p_tenant, NULL, ARRAY['implementation_lead', 'tenant_admin']) THEN
    RAISE EXCEPTION 'implementation programme rejected (authority): a programme is revised by an implementation lead or the tenant administrator' USING ERRCODE = '42501';
  END IF;
  o := implementation.imp_programme(p_tenant, p_programme, 'implementation programme');
  PERFORM 1 FROM implementation.programmes x WHERE x.programme_id = p_programme AND x.version = o.version FOR UPDATE;
  IF p_expected_version IS DISTINCT FROM o.version THEN
    RAISE EXCEPTION 'implementation programme rejected (stale): the programme is at version %, not %', o.version, p_expected_version USING ERRCODE = '22023';
  END IF;
  IF o.state IN ('accepted', 'withdrawn') THEN RAISE EXCEPTION 'implementation programme rejected (state): the programme is %', o.state USING ERRCODE = '22023'; END IF;
  IF p_title IS NOT NULL AND length(btrim(p_title)) NOT BETWEEN 4 AND 200 THEN RAISE EXCEPTION 'implementation programme rejected (title): a title of 4–200 characters' USING ERRCODE = '22023'; END IF;
  IF p_plan IS NOT NULL AND (jsonb_typeof(p_plan) <> 'object' OR length(btrim(coalesce(p_plan ->> 'objective', ''))) < 8) THEN
    RAISE EXCEPTION 'implementation programme rejected (plan): the plan states its objective (8+ characters)' USING ERRCODE = '22023';
  END IF;
  PERFORM implementation.imp_check_onboarding(p_tenant, coalesce(p_onboarding, o.onboarding_programme_id), o.target_domain_id);
  n := implementation.imp_next_version(o, o.state, o.held_reasons, btrim(p_title), p_plan, coalesce(p_onboarding, o.onboarding_programme_id), p_profile, p_actor, p_correlation);
  PERFORM implementation.imp_event(p_tenant, NULL, 'implementation_programme', p_programme, n.version, 'programme.revised', p_actor,
                                   jsonb_build_object('from_version', o.version, 'digest', n.digest, 'prior_digest', o.digest), p_correlation);
  RETURN to_jsonb(n);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION implementation.revise_programme(uuid, uuid, int, text, jsonb, uuid, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION implementation.revise_programme(uuid, uuid, int, text, jsonb, uuid, text, uuid, uuid) TO eye_commit;

/* TRANSITION (implementation.programme.start | .hold | .resume | .withdraw): planned → in_progress (start); in_progress → held (hold, with
   reasons); held → in_progress (resume); planned | in_progress | held → withdrawn (withdraw). The go-live alone sets `accepted`. The lead and
   the tenant admin start and withdraw; the lead, the sponsor and the authority hold and resume. */
CREATE OR REPLACE FUNCTION implementation.transition_programme(p_programme uuid, p_tenant uuid, p_act text, p_expected_version int, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = implementation, onboarding, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE o implementation.programmes%ROWTYPE; n implementation.programmes%ROWTYPE; v_to text; v_roles text[];
BEGIN
  IF p_act NOT IN ('start', 'hold', 'resume', 'withdraw') THEN RAISE EXCEPTION 'implementation programme rejected (act): start, hold, resume or withdraw' USING ERRCODE = '22023'; END IF;
  PERFORM observation.assert_authority(ARRAY['implementation.programme.' || p_act]);
  PERFORM onboarding.assert_tenant(p_tenant, 'implementation programme');
  PERFORM implementation.imp_actor('implementation programme', p_actor);
  v_roles := CASE WHEN p_act IN ('start', 'withdraw') THEN ARRAY['implementation_lead', 'tenant_admin'] ELSE ARRAY['implementation_lead', 'customer_sponsor', 'onboarding_authority'] END;
  IF NOT onboarding.holds_role(p_actor, p_tenant, NULL, v_roles) THEN
    RAISE EXCEPTION 'implementation programme rejected (authority): % is the act of a %', p_act, array_to_string(v_roles, ' or ') USING ERRCODE = '42501';
  END IF;
  o := implementation.imp_programme(p_tenant, p_programme, 'implementation programme');
  PERFORM 1 FROM implementation.programmes x WHERE x.programme_id = p_programme AND x.version = o.version FOR UPDATE;
  IF p_expected_version IS DISTINCT FROM o.version THEN
    RAISE EXCEPTION 'implementation programme rejected (stale): the programme is at version %, not %', o.version, p_expected_version USING ERRCODE = '22023';
  END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'implementation programme rejected (reason): a transition states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  v_to := CASE p_act WHEN 'start' THEN CASE WHEN o.state = 'planned' THEN 'in_progress' END
                     WHEN 'hold' THEN CASE WHEN o.state = 'in_progress' THEN 'held' END
                     WHEN 'resume' THEN CASE WHEN o.state = 'held' THEN 'in_progress' END
                     ELSE CASE WHEN o.state IN ('planned', 'in_progress', 'held') THEN 'withdrawn' END END;
  IF v_to IS NULL THEN RAISE EXCEPTION 'implementation programme rejected (state): a % programme cannot be %', o.state, CASE p_act WHEN 'start' THEN 'started' WHEN 'hold' THEN 'held' WHEN 'resume' THEN 'resumed' ELSE 'withdrawn' END USING ERRCODE = '22023'; END IF;
  n := implementation.imp_next_version(o, v_to, CASE WHEN v_to = 'held' THEN jsonb_build_array(btrim(p_reason)) ELSE '[]'::jsonb END, NULL, NULL, o.onboarding_programme_id, NULL, p_actor, p_correlation);
  PERFORM implementation.imp_event(p_tenant, NULL, 'implementation_programme', p_programme, n.version,
                                   'programme.' || CASE p_act WHEN 'start' THEN 'started' WHEN 'hold' THEN 'held' WHEN 'resume' THEN 'resumed' ELSE 'withdrawn' END, p_actor,
                                   jsonb_build_object('from', o.state, 'to', v_to, 'reason', btrim(p_reason), 'digest', n.digest), p_correlation);
  RETURN to_jsonb(n);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION implementation.transition_programme(uuid, uuid, text, int, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION implementation.transition_programme(uuid, uuid, text, int, text, uuid, uuid) TO eye_commit;

/* A programme part's attributes, validated per kind (closed shapes; nothing names a person except a stakeholder's optional named holder of
   the stakeholder role, who must hold it). */
CREATE OR REPLACE FUNCTION implementation.imp_validate_item(p_tenant uuid, p_programme implementation.programmes, p_kind text, p_attributes jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = implementation, identity, onboarding, pg_catalog, pg_temp AS $$
DECLARE a jsonb := coalesce(p_attributes, '{}'::jsonb); v text;
BEGIN
  IF jsonb_typeof(a) <> 'object' THEN RAISE EXCEPTION 'implementation programme rejected (attributes): the attributes are an object' USING ERRCODE = '22023'; END IF;
  IF p_kind = 'milestone' THEN
    IF coalesce(a ->> 'due_on', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION 'implementation programme rejected (attributes): a milestone names its due_on day (YYYY-MM-DD)' USING ERRCODE = '22023'; END IF;
    PERFORM (a ->> 'due_on')::date;
    IF coalesce(a ->> 'status', 'planned') NOT IN ('planned', 'done', 'missed') THEN RAISE EXCEPTION 'implementation programme rejected (attributes): a milestone is planned, done or missed' USING ERRCODE = '22023'; END IF;
    RETURN a || jsonb_build_object('status', coalesce(a ->> 'status', 'planned'));
  ELSIF p_kind = 'dependency' THEN
    FOREACH v IN ARRAY ARRAY[a ->> 'from_key', a ->> 'to_key'] LOOP
      IF v IS NULL OR NOT EXISTS (SELECT 1 FROM implementation.programme_items i WHERE i.programme_id = p_programme.programme_id AND i.kind = 'milestone' AND i.item_key = v
                                                                                    AND i.superseded_at IS NULL AND i.state = 'active') THEN
        RAISE EXCEPTION 'implementation programme rejected (attributes): a dependency joins two active milestones of the programme (from_key, to_key); % is not one', coalesce(v, '<none>') USING ERRCODE = '22023';
      END IF;
    END LOOP;
    IF a ->> 'from_key' = a ->> 'to_key' THEN RAISE EXCEPTION 'implementation programme rejected (attributes): a milestone does not depend on itself' USING ERRCODE = '22023'; END IF;
    RETURN a || jsonb_build_object('relation', coalesce(a ->> 'relation', 'finish_to_start'));
  ELSIF p_kind = 'stakeholder' THEN
    IF NOT EXISTS (SELECT 1 FROM identity.roles r WHERE r.code = a ->> 'role') THEN RAISE EXCEPTION 'implementation programme rejected (attributes): a stakeholder names an existing role' USING ERRCODE = '22023'; END IF;
    IF a ? 'principal_id' AND a ->> 'principal_id' IS NOT NULL
       AND NOT onboarding.holds_role((a ->> 'principal_id')::uuid, p_tenant, p_programme.target_domain_id, ARRAY[a ->> 'role']) THEN
      RAISE EXCEPTION 'implementation programme rejected (attributes): the named stakeholder does not hold %', a ->> 'role' USING ERRCODE = '22023';
    END IF;
    IF length(btrim(coalesce(a ->> 'interest', ''))) < 4 THEN RAISE EXCEPTION 'implementation programme rejected (attributes): a stakeholder states its interest' USING ERRCODE = '22023'; END IF;
    RETURN a;
  ELSIF p_kind = 'process' THEN
    IF length(btrim(coalesce(a ->> 'current_practice', ''))) < 4 OR length(btrim(coalesce(a ->> 'target_workflow', ''))) < 4 THEN
      RAISE EXCEPTION 'implementation programme rejected (attributes): a process states its current practice and its target workflow' USING ERRCODE = '22023';
    END IF;
    RETURN a;
  ELSIF p_kind = 'journey' THEN
    IF length(btrim(coalesce(a ->> 'journey_ref', ''))) < 3 THEN RAISE EXCEPTION 'implementation programme rejected (attributes): a journey names its journey reference (e.g. JRN-01)' USING ERRCODE = '22023'; END IF;
    RETURN a || jsonb_build_object('priority', coalesce((a ->> 'priority')::boolean, false));
  ELSIF p_kind = 'risk' THEN
    IF coalesce(a ->> 'likelihood', '') NOT IN ('low', 'medium', 'high') OR NOT EXISTS (SELECT 1 FROM identity.roles r WHERE r.code = a ->> 'owner_role') THEN
      RAISE EXCEPTION 'implementation programme rejected (attributes): a risk names its likelihood (low, medium, high) and its owner role' USING ERRCODE = '22023';
    END IF;
    RETURN a;
  ELSIF p_kind IN ('outcome', 'feedback') THEN
    IF length(btrim(coalesce(a ->> 'statement', ''))) < 8 THEN RAISE EXCEPTION 'implementation programme rejected (attributes): an % states itself (8+ characters)', p_kind USING ERRCODE = '22023'; END IF;
    IF p_kind = 'feedback' AND (a ? 'principal_id' OR a ? 'person') THEN
      RAISE EXCEPTION 'implementation programme rejected (person): feedback is recorded by role, never attributed to a person' USING ERRCODE = '42501';
    END IF;
    RETURN a;
  ELSIF p_kind = 'role_requirement' THEN
    IF NOT EXISTS (SELECT 1 FROM identity.roles r WHERE r.code = a ->> 'role') THEN RAISE EXCEPTION 'implementation programme rejected (attributes): a role requirement names an existing role' USING ERRCODE = '22023'; END IF;
    RETURN a;
  ELSIF p_kind = 'value_measure' THEN
    IF coalesce(a ->> 'metric_key', '') !~ '^[A-Z][A-Z0-9]{1,9}-[A-Za-z0-9.-]{1,40}$' THEN
      RAISE EXCEPTION 'implementation programme rejected (attributes): a value measure points to a B92 metric key (e.g. ADP-001)' USING ERRCODE = '22023';
    END IF;
    RETURN a || jsonb_build_object('cited_in_readiness', coalesce((a ->> 'cited_in_readiness')::boolean, false));
  END IF;
  RAISE EXCEPTION 'implementation programme rejected (kind): the kind is one of %', array_to_string(implementation.item_kinds(), ', ') USING ERRCODE = '22023';
END $$;
REVOKE ALL ON FUNCTION implementation.imp_validate_item(uuid, implementation.programmes, text, jsonb) FROM PUBLIC;

/* RECORD a programme part (implementation.item.record — the implementation lead): v1, or the next version at the expected version (a correction),
   or a retirement (p_retire). */
CREATE OR REPLACE FUNCTION implementation.record_item(p_item uuid, p_programme uuid, p_tenant uuid, p_kind text, p_key text, p_title text, p_attributes jsonb, p_expected_version int,
                                                      p_retire boolean, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = implementation, onboarding, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE pr implementation.programmes%ROWTYPE; o implementation.programme_items%ROWTYPE; v_attr jsonb; v_version int; v_id uuid; v_digest text; v_state text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['implementation.item.record']);
  PERFORM onboarding.assert_tenant(p_tenant, 'implementation programme');
  PERFORM implementation.imp_actor('implementation programme', p_actor);
  IF NOT onboarding.holds_role(p_actor, p_tenant, NULL, ARRAY['implementation_lead']) THEN
    RAISE EXCEPTION 'implementation programme rejected (authority): the programme''s parts are recorded by the implementation lead' USING ERRCODE = '42501';
  END IF;
  pr := implementation.imp_programme(p_tenant, p_programme, 'implementation programme');
  IF pr.state IN ('accepted', 'withdrawn') THEN RAISE EXCEPTION 'implementation programme rejected (state): the programme is %', pr.state USING ERRCODE = '22023'; END IF;
  SELECT * INTO o FROM implementation.programme_items x WHERE x.programme_id = p_programme AND x.kind = p_kind AND x.item_key = p_key AND x.superseded_at IS NULL FOR UPDATE;
  IF FOUND THEN
    IF p_expected_version IS DISTINCT FROM o.version THEN
      RAISE EXCEPTION 'implementation programme rejected (stale): the % % is at version %, not %', p_kind, p_key, o.version, coalesce(p_expected_version::text, '<none>') USING ERRCODE = '22023';
    END IF;
    IF o.state = 'retired' THEN RAISE EXCEPTION 'implementation programme rejected (state): the % % is retired', p_kind, p_key USING ERRCODE = '22023'; END IF;
    v_id := o.item_id; v_version := o.version + 1;
    UPDATE implementation.programme_items SET superseded_at = clock_timestamp() WHERE item_id = o.item_id AND version = o.version;
  ELSE
    IF coalesce(p_expected_version, 0) <> 0 THEN
      RAISE EXCEPTION 'implementation programme rejected (stale): the % % does not exist yet (expected version 0)', p_kind, p_key USING ERRCODE = '22023';
    END IF;
    IF coalesce(p_retire, false) THEN RAISE EXCEPTION 'implementation programme rejected (unknown_item): there is no % % to retire', p_kind, p_key USING ERRCODE = '23503'; END IF;
    v_id := p_item; v_version := 1;
  END IF;
  IF coalesce(p_key, '') !~ '^[a-z][a-z0-9_.-]{1,62}$' THEN RAISE EXCEPTION 'implementation programme rejected (key): an item key is lower-case (2–63 characters)' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_title, o.title, ''))) NOT BETWEEN 4 AND 200 THEN RAISE EXCEPTION 'implementation programme rejected (title): a title of 4–200 characters' USING ERRCODE = '22023'; END IF;
  v_state := CASE WHEN coalesce(p_retire, false) THEN 'retired' ELSE 'active' END;
  v_attr := CASE WHEN coalesce(p_retire, false) THEN o.attributes ELSE implementation.imp_validate_item(p_tenant, pr, p_kind, p_attributes) END;
  v_digest := onboarding.digest(jsonb_build_object('item_id', v_id, 'version', v_version, 'programme_id', p_programme, 'kind', p_kind, 'key', p_key, 'title', btrim(coalesce(p_title, o.title)),
                                                   'attributes', v_attr, 'state', v_state));
  INSERT INTO implementation.programme_items (item_id, version, tenant_id, programme_id, kind, item_key, title, attributes, state, digest, recorded_by, correlation_id)
  VALUES (v_id, v_version, p_tenant, p_programme, p_kind, p_key, btrim(coalesce(p_title, o.title)), v_attr, v_state, v_digest, p_actor, p_correlation);
  PERFORM implementation.imp_event(p_tenant, NULL, 'programme_item', v_id, v_version, CASE WHEN v_state = 'retired' THEN 'item.retired' ELSE 'item.recorded' END, p_actor,
                                   jsonb_build_object('programme_id', p_programme, 'kind', p_kind, 'key', p_key, 'digest', v_digest), p_correlation);
  RETURN (SELECT to_jsonb(x) FROM implementation.programme_items x WHERE x.item_id = v_id AND x.version = v_version);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION implementation.record_item(uuid, uuid, uuid, text, text, text, jsonb, int, boolean, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION implementation.record_item(uuid, uuid, uuid, text, text, text, jsonb, int, boolean, uuid, uuid) TO eye_commit;

/* PROPOSE a change (implementation.change.propose — the implementation lead). */
CREATE OR REPLACE FUNCTION implementation.propose_change(p_change uuid, p_programme uuid, p_tenant uuid, p_title text, p_description text, p_impact jsonb, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = implementation, onboarding, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE pr implementation.programmes%ROWTYPE; v_digest text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['implementation.change.propose']);
  PERFORM onboarding.assert_tenant(p_tenant, 'implementation change');
  PERFORM implementation.imp_actor('implementation change', p_actor);
  IF NOT onboarding.holds_role(p_actor, p_tenant, NULL, ARRAY['implementation_lead']) THEN
    RAISE EXCEPTION 'implementation change rejected (authority): a change is proposed by the implementation lead' USING ERRCODE = '42501';
  END IF;
  pr := implementation.imp_programme(p_tenant, p_programme, 'implementation change');
  IF pr.state IN ('accepted', 'withdrawn') THEN RAISE EXCEPTION 'implementation change rejected (state): the programme is %', pr.state USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_title, ''))) NOT BETWEEN 4 AND 200 OR length(btrim(coalesce(p_description, ''))) < 8 THEN
    RAISE EXCEPTION 'implementation change rejected (description): a change has a title (4–200) and a description (8+ characters)' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(coalesce(p_impact, '{}'::jsonb)) <> 'object' THEN RAISE EXCEPTION 'implementation change rejected (impact): the impact is an object' USING ERRCODE = '22023'; END IF;
  v_digest := onboarding.digest(jsonb_build_object('change_id', p_change, 'programme_id', p_programme, 'programme_version', pr.version, 'title', btrim(p_title),
                                                   'description', btrim(p_description), 'impact', coalesce(p_impact, '{}'::jsonb)));
  INSERT INTO implementation.changes (change_id, tenant_id, programme_id, title, description, impact, digest, proposed_by, correlation_id)
  VALUES (p_change, p_tenant, p_programme, btrim(p_title), btrim(p_description), coalesce(p_impact, '{}'::jsonb), v_digest, p_actor, p_correlation);
  PERFORM implementation.imp_event(p_tenant, NULL, 'implementation_change', p_change, NULL, 'change.proposed', p_actor, jsonb_build_object('programme_id', p_programme, 'digest', v_digest), p_correlation);
  RETURN (SELECT to_jsonb(x) FROM implementation.changes x WHERE x.change_id = p_change);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION implementation.propose_change(uuid, uuid, uuid, text, text, jsonb, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION implementation.propose_change(uuid, uuid, uuid, text, text, jsonb, uuid, uuid) TO eye_commit;

/* DECIDE a change (implementation.change.approve — HUMAN-GATED: the customer sponsor or the onboarding authority via the approver test, on
   the change's digest). */
CREATE OR REPLACE FUNCTION implementation.decide_change(p_change uuid, p_tenant uuid, p_decision text, p_digest text, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = implementation, onboarding, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE c implementation.changes%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['implementation.change.approve']);
  PERFORM onboarding.assert_tenant(p_tenant, 'implementation change');
  PERFORM implementation.imp_actor('implementation change', p_actor);
  SELECT * INTO c FROM implementation.changes x WHERE x.change_id = p_change AND x.tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'implementation change rejected (unknown_change): % is not a change of this tenant', p_change USING ERRCODE = '23503'; END IF;
  PERFORM onboarding.assert_approver('implementation change', p_actor, p_tenant, NULL, ARRAY['customer_sponsor', 'onboarding_authority'], c.proposed_by, 'deciding an implementation change');
  IF c.state <> 'proposed' THEN RAISE EXCEPTION 'implementation change rejected (state): the change is %', c.state USING ERRCODE = '22023'; END IF;
  IF p_decision NOT IN ('approve', 'reject') THEN RAISE EXCEPTION 'implementation change rejected (decision): approve or reject' USING ERRCODE = '22023'; END IF;
  IF p_digest IS DISTINCT FROM c.digest THEN RAISE EXCEPTION 'implementation change rejected (stale): the change is at digest %…, not the one decided (%…)', left(c.digest, 12), left(coalesce(p_digest, '<none>'), 12) USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'implementation change rejected (reason): a decision states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  UPDATE implementation.changes SET state = CASE p_decision WHEN 'approve' THEN 'approved' ELSE 'rejected' END, decided_by = p_actor, decided_at = clock_timestamp(), decision_reason = btrim(p_reason)
   WHERE change_id = p_change;
  PERFORM implementation.imp_event(p_tenant, NULL, 'implementation_change', p_change, NULL, CASE p_decision WHEN 'approve' THEN 'change.approved' ELSE 'change.rejected' END, p_actor,
                                   jsonb_build_object('programme_id', c.programme_id, 'digest', c.digest, 'reason', btrim(p_reason)), p_correlation);
  RETURN (SELECT to_jsonb(x) FROM implementation.changes x WHERE x.change_id = p_change);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION implementation.decide_change(uuid, uuid, text, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION implementation.decide_change(uuid, uuid, text, text, text, uuid, uuid) TO eye_commit;

-- §AD.1 ENABLEMENT: PATHS, ATTESTATIONS, TRAINING AND COMPETENCE RECORDS ───────────────────────────────────────────────────────────────────
/* A TRAINING PATH (DOMAIN, versioned): what holders of `roles` complete before go-live; content by reference (no content is stored here). */
CREATE TABLE implementation.training_paths (
  path_id          uuid NOT NULL,
  version          int  NOT NULL CHECK (version >= 1),
  scope            text NOT NULL DEFAULT 'DOMAIN' CHECK (scope = 'DOMAIN'),
  tenant_id        uuid NOT NULL,
  domain_id        uuid NOT NULL,
  programme_id     uuid,
  path_key         text NOT NULL CHECK (path_key ~ '^[a-z][a-z0-9_.-]{2,62}$'),
  title            text NOT NULL CHECK (length(btrim(title)) BETWEEN 4 AND 200),
  roles            text[] NOT NULL CHECK (cardinality(roles) >= 1),
  content_ref      text NOT NULL CHECK (length(btrim(content_ref)) >= 4),
  state            text NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'retired')),
  digest           text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  declared_by      uuid NOT NULL,
  declared_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  superseded_at    timestamptz,
  correlation_id   uuid NOT NULL,
  PRIMARY KEY (path_id, version),
  CONSTRAINT itp_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE UNIQUE INDEX itp_one_current ON implementation.training_paths (tenant_id, domain_id, path_key) WHERE superseded_at IS NULL;

/* The ACCESSIBILITY ATTESTATION of a path version (append-only; the latest counts): a named human (≠ the declarer), on the version's digest. */
CREATE TABLE implementation.path_attestations (
  attestation_id   uuid PRIMARY KEY,
  scope            text NOT NULL DEFAULT 'DOMAIN' CHECK (scope = 'DOMAIN'),
  tenant_id        uuid NOT NULL,
  domain_id        uuid NOT NULL,
  path_id          uuid NOT NULL,
  path_version     int  NOT NULL,
  path_digest      text NOT NULL CHECK (path_digest ~ '^[0-9a-f]{64}$'),
  verdict          text NOT NULL CHECK (verdict IN ('accessible', 'inaccessible')),
  statement        text NOT NULL CHECK (length(btrim(statement)) >= 8),
  attested_by      uuid NOT NULL,
  attested_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id   uuid NOT NULL,
  FOREIGN KEY (path_id, path_version) REFERENCES implementation.training_paths (path_id, version),
  CONSTRAINT ipa_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);

/* A TRAINING RECORD (append-only; the latest per subject × path version counts): complete | not_yet — nothing else (no score, no rank). */
CREATE TABLE implementation.training_records (
  record_id        uuid PRIMARY KEY,
  scope            text NOT NULL DEFAULT 'DOMAIN' CHECK (scope = 'DOMAIN'),
  tenant_id        uuid NOT NULL,
  domain_id        uuid NOT NULL,
  path_id          uuid NOT NULL,
  path_version     int  NOT NULL,
  subject_principal_id uuid NOT NULL,
  state            text NOT NULL CHECK (state IN ('complete', 'not_yet')),
  purpose          text NOT NULL CHECK (purpose = ANY (implementation.record_purposes())),
  note             text CHECK (note IS NULL OR length(note) <= 500),
  recorded_by      uuid NOT NULL,
  recorded_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  retain_until     timestamptz NOT NULL,
  correlation_id   uuid NOT NULL,
  FOREIGN KEY (path_id, path_version) REFERENCES implementation.training_paths (path_id, version),
  CONSTRAINT itr_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT itr_not_self CHECK (recorded_by <> subject_principal_id),
  CONSTRAINT itr_retention CHECK (retain_until > recorded_at AND retain_until <= recorded_at + interval '1095 days')
);
CREATE INDEX itr_subject ON implementation.training_records (tenant_id, domain_id, path_id, path_version, subject_principal_id, recorded_at DESC);

/* A COMPETENCE RECORD (append-only; the latest per subject × competence key counts): a named enablement assessor ≠ subject, complete | not_yet. */
CREATE TABLE implementation.competence_records (
  record_id        uuid PRIMARY KEY,
  scope            text NOT NULL DEFAULT 'DOMAIN' CHECK (scope = 'DOMAIN'),
  tenant_id        uuid NOT NULL,
  domain_id        uuid NOT NULL,
  competence_key   text NOT NULL CHECK (competence_key ~ '^[a-z][a-z0-9_.-]{2,62}$'),
  role_code        text NOT NULL,
  subject_principal_id uuid NOT NULL,
  outcome          text NOT NULL CHECK (outcome IN ('complete', 'not_yet')),
  purpose          text NOT NULL CHECK (purpose = ANY (implementation.record_purposes())),
  evidence_note    text CHECK (evidence_note IS NULL OR length(evidence_note) <= 500),
  assessor_principal_id uuid NOT NULL,
  recorded_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  retain_until     timestamptz NOT NULL,
  correlation_id   uuid NOT NULL,
  CONSTRAINT icr_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT icr_not_self CHECK (assessor_principal_id <> subject_principal_id),
  CONSTRAINT icr_retention CHECK (retain_until > recorded_at AND retain_until <= recorded_at + interval '1095 days')
);
CREATE INDEX icr_subject ON implementation.competence_records (tenant_id, domain_id, competence_key, subject_principal_id, recorded_at DESC);

/* The current path of a key in the domain (or NULL). */
CREATE OR REPLACE FUNCTION implementation.imp_path(p_tenant uuid, p_domain uuid, p_key text) RETURNS implementation.training_paths
LANGUAGE sql STABLE SET search_path = implementation, pg_catalog, pg_temp AS $$
  SELECT * FROM implementation.training_paths x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.path_key = p_key AND x.superseded_at IS NULL
$$;
REVOKE ALL ON FUNCTION implementation.imp_path(uuid, uuid, text) FROM PUBLIC;
/* The standing accessibility of a path version: the latest attestation at the version's digest — accessible | inaccessible | unattested. */
CREATE OR REPLACE FUNCTION implementation.imp_accessibility(p_path uuid, p_version int) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = implementation, pg_catalog, pg_temp AS $$
  SELECT coalesce((SELECT jsonb_build_object('state', a.verdict, 'attestation_id', a.attestation_id, 'attested_by', a.attested_by, 'attested_at', a.attested_at, 'statement', a.statement)
                     FROM implementation.path_attestations a JOIN implementation.training_paths t ON t.path_id = a.path_id AND t.version = a.path_version AND t.digest = a.path_digest
                    WHERE a.path_id = p_path AND a.path_version = p_version ORDER BY a.attested_at DESC, a.attestation_id DESC LIMIT 1),
                  jsonb_build_object('state', 'unattested'))
$$;
REVOKE ALL ON FUNCTION implementation.imp_accessibility(uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION implementation.imp_accessibility(uuid, int) TO eye_app, eye_commit;

/* DECLARE a path or its next version (implementation.training.path.declare — the lead, a domain admin or an enablement assessor). A new
   version needs a new attestation (the old one names the old digest). */
CREATE OR REPLACE FUNCTION implementation.declare_path(p_path uuid, p_tenant uuid, p_domain uuid, p_programme uuid, p_key text, p_title text, p_roles text[], p_content_ref text,
                                                       p_expected_version int, p_retire boolean, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = implementation, onboarding, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE o implementation.training_paths%ROWTYPE; v_id uuid; v_version int; v_digest text; v_state text; v_roles text[];
BEGIN
  PERFORM observation.assert_authority(ARRAY['implementation.training.path.declare']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM implementation.imp_actor('training path', p_actor);
  IF NOT onboarding.holds_role(p_actor, p_tenant, p_domain, ARRAY['implementation_lead', 'domain_admin', 'enablement_assessor']) THEN
    RAISE EXCEPTION 'training path rejected (authority): a path is declared by the implementation lead, a domain admin or an enablement assessor' USING ERRCODE = '42501';
  END IF;
  IF p_programme IS NOT NULL AND NOT EXISTS (SELECT 1 FROM implementation.programmes x WHERE x.programme_id = p_programme AND x.tenant_id = p_tenant AND x.target_domain_id = p_domain AND x.superseded_at IS NULL) THEN
    RAISE EXCEPTION 'training path rejected (unknown_programme): % is not a programme of this domain', p_programme USING ERRCODE = '23503';
  END IF;
  o := implementation.imp_path(p_tenant, p_domain, p_key);
  IF o.path_id IS NOT NULL THEN
    PERFORM 1 FROM implementation.training_paths x WHERE x.path_id = o.path_id AND x.version = o.version FOR UPDATE;
    IF p_expected_version IS DISTINCT FROM o.version THEN RAISE EXCEPTION 'training path rejected (stale): % is at version %, not %', p_key, o.version, coalesce(p_expected_version::text, '<none>') USING ERRCODE = '22023'; END IF;
    IF o.state = 'retired' THEN RAISE EXCEPTION 'training path rejected (state): % is retired', p_key USING ERRCODE = '22023'; END IF;
    v_id := o.path_id; v_version := o.version + 1;
    UPDATE implementation.training_paths SET superseded_at = clock_timestamp() WHERE path_id = o.path_id AND version = o.version;
  ELSE
    IF coalesce(p_expected_version, 0) <> 0 THEN RAISE EXCEPTION 'training path rejected (stale): % does not exist yet (expected version 0)', p_key USING ERRCODE = '22023'; END IF;
    IF coalesce(p_retire, false) THEN RAISE EXCEPTION 'training path rejected (unknown_path): there is no path % to retire', p_key USING ERRCODE = '23503'; END IF;
    v_id := p_path; v_version := 1;
  END IF;
  IF coalesce(p_key, '') !~ '^[a-z][a-z0-9_.-]{2,62}$' THEN RAISE EXCEPTION 'training path rejected (key): a path key is lower-case (3–63 characters)' USING ERRCODE = '22023'; END IF;
  v_state := CASE WHEN coalesce(p_retire, false) THEN 'retired' ELSE 'active' END;
  v_roles := CASE WHEN coalesce(p_retire, false) THEN o.roles ELSE (SELECT array_agg(DISTINCT r ORDER BY r) FROM unnest(p_roles) r) END;
  IF coalesce(cardinality(v_roles), 0) = 0 OR EXISTS (SELECT 1 FROM unnest(v_roles) r WHERE NOT EXISTS (SELECT 1 FROM identity.roles x WHERE x.code = r)) THEN
    RAISE EXCEPTION 'training path rejected (roles): a path names the existing roles whose holders complete it' USING ERRCODE = '22023';
  END IF;
  IF length(btrim(coalesce(p_title, o.title, ''))) NOT BETWEEN 4 AND 200 OR length(btrim(coalesce(p_content_ref, o.content_ref, ''))) < 4 THEN
    RAISE EXCEPTION 'training path rejected (content): a path has a title (4–200) and a content reference' USING ERRCODE = '22023';
  END IF;
  v_digest := onboarding.digest(jsonb_build_object('path_id', v_id, 'version', v_version, 'key', p_key, 'title', btrim(coalesce(p_title, o.title)), 'roles', to_jsonb(v_roles),
                                                   'content_ref', btrim(coalesce(p_content_ref, o.content_ref)), 'state', v_state));
  INSERT INTO implementation.training_paths (path_id, version, tenant_id, domain_id, programme_id, path_key, title, roles, content_ref, state, digest, declared_by, correlation_id)
  VALUES (v_id, v_version, p_tenant, p_domain, coalesce(p_programme, o.programme_id), p_key, btrim(coalesce(p_title, o.title)), v_roles, btrim(coalesce(p_content_ref, o.content_ref)),
          v_state, v_digest, p_actor, p_correlation);
  PERFORM implementation.imp_event(p_tenant, p_domain, 'training_path', v_id, v_version, CASE WHEN v_state = 'retired' THEN 'path.retired' ELSE 'path.declared' END, p_actor,
                                   jsonb_build_object('key', p_key, 'roles', to_jsonb(v_roles), 'digest', v_digest), p_correlation);
  RETURN (SELECT to_jsonb(x) FROM implementation.training_paths x WHERE x.path_id = v_id AND x.version = v_version);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION implementation.declare_path(uuid, uuid, uuid, uuid, text, text, text[], text, int, boolean, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION implementation.declare_path(uuid, uuid, uuid, uuid, text, text, text[], text, int, boolean, uuid, uuid) TO eye_commit;

/* ATTEST a path version's accessibility (implementation.training.path.attest — HUMAN-GATED: a named human domain admin, enablement assessor
   or onboarding authority, never the declarer of the version, never an implementation lead; on the version's digest). */
CREATE OR REPLACE FUNCTION implementation.attest_path(p_attestation uuid, p_path uuid, p_tenant uuid, p_domain uuid, p_version int, p_digest text, p_verdict text, p_statement text,
                                                      p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = implementation, onboarding, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE t implementation.training_paths%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['implementation.training.path.attest']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM implementation.imp_actor('training path', p_actor);
  SELECT * INTO t FROM implementation.training_paths x WHERE x.path_id = p_path AND x.version = p_version AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'training path rejected (unknown_path): % has no version % in this domain', p_path, p_version USING ERRCODE = '23503'; END IF;
  PERFORM onboarding.assert_approver('training path', p_actor, p_tenant, p_domain, ARRAY['domain_admin', 'enablement_assessor', 'onboarding_authority'], t.declared_by, 'attesting a path''s accessibility');
  IF t.superseded_at IS NOT NULL OR t.state <> 'active' THEN RAISE EXCEPTION 'training path rejected (state): version % of % is not the current active version', p_version, t.path_key USING ERRCODE = '22023'; END IF;
  IF p_digest IS DISTINCT FROM t.digest THEN RAISE EXCEPTION 'training path rejected (stale): version % is at digest %…, not the one attested (%…)', p_version, left(t.digest, 12), left(coalesce(p_digest, '<none>'), 12) USING ERRCODE = '22023'; END IF;
  IF p_verdict NOT IN ('accessible', 'inaccessible') THEN RAISE EXCEPTION 'training path rejected (verdict): accessible or inaccessible' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_statement, ''))) < 8 THEN RAISE EXCEPTION 'training path rejected (statement): an attestation states what was checked (8+ characters)' USING ERRCODE = '22023'; END IF;
  INSERT INTO implementation.path_attestations (attestation_id, tenant_id, domain_id, path_id, path_version, path_digest, verdict, statement, attested_by, correlation_id)
  VALUES (p_attestation, p_tenant, p_domain, p_path, p_version, t.digest, p_verdict, btrim(p_statement), p_actor, p_correlation);
  PERFORM implementation.imp_event(p_tenant, p_domain, 'training_path', p_path, p_version, 'path.attested', p_actor, jsonb_build_object('verdict', p_verdict, 'digest', t.digest), p_correlation);
  RETURN (SELECT to_jsonb(x) FROM implementation.path_attestations x WHERE x.attestation_id = p_attestation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION implementation.attest_path(uuid, uuid, uuid, uuid, int, text, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION implementation.attest_path(uuid, uuid, uuid, uuid, int, text, text, text, uuid, uuid) TO eye_commit;

/* RECORD training (implementation.training.record — the implementation lead or an enablement assessor; a named human ≠ the subject): the
   subject holds one of the path's roles in the domain; purpose enablement_readiness only; retained ≤ 3 years (default 2). The ledger names
   the record and the path, never the subject or the outcome (the record itself is subject-visible under RLS). */
CREATE OR REPLACE FUNCTION implementation.record_training(p_record uuid, p_path uuid, p_tenant uuid, p_domain uuid, p_version int, p_subject uuid, p_state text, p_purpose text, p_note text,
                                                          p_retain_days int, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = implementation, onboarding, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE t implementation.training_paths%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['implementation.training.record']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM implementation.imp_actor('training record', p_actor);
  PERFORM implementation.imp_human('training record', p_actor, 'recording a person''s training');
  IF NOT onboarding.holds_role(p_actor, p_tenant, p_domain, ARRAY['implementation_lead', 'enablement_assessor']) THEN
    RAISE EXCEPTION 'training record rejected (authority): training completion is recorded by the implementation lead or an enablement assessor' USING ERRCODE = '42501';
  END IF;
  IF p_subject = p_actor THEN RAISE EXCEPTION 'training record rejected (separation_of_duties): nobody records their own training' USING ERRCODE = '42501'; END IF;
  IF p_purpose IS DISTINCT FROM 'enablement_readiness' THEN
    RAISE EXCEPTION 'training record rejected (purpose): a training record serves enablement readiness only — never a performance purpose (asked: %)', coalesce(p_purpose, '<none>') USING ERRCODE = '22023';
  END IF;
  SELECT * INTO t FROM implementation.training_paths x WHERE x.path_id = p_path AND x.version = p_version AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'training record rejected (unknown_path): % has no version % in this domain', p_path, p_version USING ERRCODE = '23503'; END IF;
  IF t.superseded_at IS NOT NULL OR t.state <> 'active' THEN RAISE EXCEPTION 'training record rejected (state): version % of % is not the current active version', p_version, t.path_key USING ERRCODE = '22023'; END IF;
  IF onboarding.principal_kind(p_subject) IS DISTINCT FROM 'human' OR NOT onboarding.holds_role(p_subject, p_tenant, p_domain, t.roles) THEN
    RAISE EXCEPTION 'training record rejected (subject): the subject is an active human holding one of % in the domain', array_to_string(t.roles, ', ') USING ERRCODE = '22023';
  END IF;
  IF p_state NOT IN ('complete', 'not_yet') THEN RAISE EXCEPTION 'training record rejected (state_value): complete or not_yet — no score, no rank' USING ERRCODE = '22023'; END IF;
  IF coalesce(p_retain_days, 730) NOT BETWEEN 30 AND 1095 THEN RAISE EXCEPTION 'training record rejected (retention): retained 30–1095 days' USING ERRCODE = '22023'; END IF;
  INSERT INTO implementation.training_records (record_id, tenant_id, domain_id, path_id, path_version, subject_principal_id, state, purpose, note, recorded_by, retain_until, correlation_id)
  VALUES (p_record, p_tenant, p_domain, p_path, p_version, p_subject, p_state, p_purpose, nullif(btrim(coalesce(p_note, '')), ''), p_actor,
          clock_timestamp() + make_interval(days => coalesce(p_retain_days, 730)), p_correlation);
  PERFORM implementation.imp_event(p_tenant, p_domain, 'training_record', p_record, p_version, 'training.recorded', p_actor, jsonb_build_object('path_id', p_path, 'path_key', t.path_key), p_correlation);
  RETURN (SELECT to_jsonb(x) FROM implementation.training_records x WHERE x.record_id = p_record);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION implementation.record_training(uuid, uuid, uuid, uuid, int, uuid, text, text, text, int, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION implementation.record_training(uuid, uuid, uuid, uuid, int, uuid, text, text, text, int, uuid, uuid) TO eye_commit;

/* RECORD competence (implementation.competence.record — HUMAN-GATED: a named enablement assessor of the domain, ≠ the subject, never an
   implementation lead; complete | not_yet only; purpose enablement_readiness). */
CREATE OR REPLACE FUNCTION implementation.record_competence(p_record uuid, p_tenant uuid, p_domain uuid, p_key text, p_role text, p_subject uuid, p_outcome text, p_purpose text, p_note text,
                                                            p_retain_days int, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = implementation, onboarding, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_authority(ARRAY['implementation.competence.record']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM implementation.imp_actor('competence record', p_actor);
  PERFORM implementation.imp_human('competence record', p_actor, 'recording a person''s competence');
  IF NOT EXISTS (SELECT 1 FROM identity.role_bindings b WHERE b.principal_id = p_actor AND b.role_code = 'enablement_assessor' AND b.revoked_at IS NULL AND b.tenant_id = p_tenant
                                                       AND b.scope = 'DOMAIN' AND b.domain_id = p_domain) THEN
    RAISE EXCEPTION 'competence record rejected (authority): competence is recorded by a named enablement assessor of this domain' USING ERRCODE = '42501';
  END IF;
  IF onboarding.holds_role(p_actor, p_tenant, p_domain, ARRAY['implementation_lead']) THEN
    RAISE EXCEPTION 'competence record rejected (separation_of_duties): an implementation lead records training, never competence' USING ERRCODE = '42501';
  END IF;
  IF p_subject = p_actor THEN RAISE EXCEPTION 'competence record rejected (separation_of_duties): nobody assesses their own competence' USING ERRCODE = '42501'; END IF;
  IF p_purpose IS DISTINCT FROM 'enablement_readiness' THEN
    RAISE EXCEPTION 'competence record rejected (purpose): a competence record serves enablement readiness only — never a performance purpose (asked: %)', coalesce(p_purpose, '<none>') USING ERRCODE = '22023';
  END IF;
  IF coalesce(p_key, '') !~ '^[a-z][a-z0-9_.-]{2,62}$' THEN RAISE EXCEPTION 'competence record rejected (key): a competence key is lower-case (3–63 characters)' USING ERRCODE = '22023'; END IF;
  IF onboarding.principal_kind(p_subject) IS DISTINCT FROM 'human' OR NOT onboarding.holds_role(p_subject, p_tenant, p_domain, ARRAY[p_role]) THEN
    RAISE EXCEPTION 'competence record rejected (subject): the subject is an active human holding % in the domain', coalesce(p_role, '<none>') USING ERRCODE = '22023';
  END IF;
  IF p_outcome NOT IN ('complete', 'not_yet') THEN RAISE EXCEPTION 'competence record rejected (outcome): complete or not_yet — no score, no rank, no performance inference' USING ERRCODE = '22023'; END IF;
  IF coalesce(p_retain_days, 730) NOT BETWEEN 30 AND 1095 THEN RAISE EXCEPTION 'competence record rejected (retention): retained 30–1095 days' USING ERRCODE = '22023'; END IF;
  INSERT INTO implementation.competence_records (record_id, tenant_id, domain_id, competence_key, role_code, subject_principal_id, outcome, purpose, evidence_note, assessor_principal_id, retain_until, correlation_id)
  VALUES (p_record, p_tenant, p_domain, p_key, p_role, p_subject, p_outcome, p_purpose, nullif(btrim(coalesce(p_note, '')), ''), p_actor,
          clock_timestamp() + make_interval(days => coalesce(p_retain_days, 730)), p_correlation);
  PERFORM implementation.imp_event(p_tenant, p_domain, 'competence_record', p_record, NULL, 'competence.recorded', p_actor, jsonb_build_object('competence_key', p_key, 'role', p_role), p_correlation);
  RETURN (SELECT to_jsonb(x) FROM implementation.competence_records x WHERE x.record_id = p_record);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION implementation.record_competence(uuid, uuid, uuid, text, text, uuid, text, text, text, int, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION implementation.record_competence(uuid, uuid, uuid, text, text, uuid, text, text, text, int, uuid, uuid) TO eye_commit;

-- §AD.2 COHORTS ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* A COHORT = role × rollout wave (never a person): its members are the holders of the role whose binding began inside the wave's window. */
CREATE TABLE implementation.cohorts (
  cohort_id        uuid PRIMARY KEY,
  scope            text NOT NULL DEFAULT 'DOMAIN' CHECK (scope = 'DOMAIN'),
  tenant_id        uuid NOT NULL,
  domain_id        uuid NOT NULL,
  programme_id     uuid NOT NULL,
  role_code        text NOT NULL REFERENCES identity.roles (code),
  wave_key         text NOT NULL CHECK (wave_key ~ '^[a-z][a-z0-9_.-]{1,40}$'),
  bound_from       timestamptz,
  bound_to         timestamptz,
  declared_by      uuid NOT NULL,
  declared_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id   uuid NOT NULL,
  CONSTRAINT ico_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT ico_window CHECK (bound_from IS NULL OR bound_to IS NULL OR bound_to > bound_from),
  CONSTRAINT ico_once UNIQUE (tenant_id, domain_id, role_code, wave_key)
);

/* DECLARE a cohort (implementation.cohort.declare — the implementation lead): dimensions {role, wave} ONLY; a person dimension is refused. */
CREATE OR REPLACE FUNCTION implementation.declare_cohort(p_cohort uuid, p_programme uuid, p_tenant uuid, p_domain uuid, p_dimensions jsonb, p_from timestamptz, p_to timestamptz,
                                                         p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = implementation, onboarding, observation, identity, analytics, ctx, public, pg_catalog, pg_temp AS $$
DECLARE pr implementation.programmes%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['implementation.cohort.declare']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM implementation.imp_actor('adoption cohort', p_actor);
  IF NOT onboarding.holds_role(p_actor, p_tenant, p_domain, ARRAY['implementation_lead']) THEN
    RAISE EXCEPTION 'adoption cohort rejected (authority): a cohort is declared by the implementation lead' USING ERRCODE = '42501';
  END IF;
  IF analytics.json_keys(coalesce(p_dimensions, '{}'::jsonb)) && analytics.person_dimensions() THEN
    RAISE EXCEPTION 'adoption cohort rejected (person): a cohort is a role × a rollout wave, never a person (%)', array_to_string(analytics.json_keys(p_dimensions), ', ') USING ERRCODE = '42501';
  END IF;
  IF NOT (analytics.json_keys(coalesce(p_dimensions, '{}'::jsonb)) <@ ARRAY['role', 'wave']) OR p_dimensions ->> 'role' IS NULL OR p_dimensions ->> 'wave' IS NULL THEN
    RAISE EXCEPTION 'adoption cohort rejected (dimensions): a cohort names exactly {role, wave}' USING ERRCODE = '22023';
  END IF;
  pr := implementation.imp_programme(p_tenant, p_programme, 'adoption cohort');
  IF pr.target_domain_id <> p_domain THEN RAISE EXCEPTION 'adoption cohort rejected (unknown_programme): the programme targets another domain' USING ERRCODE = '23503'; END IF;
  IF NOT EXISTS (SELECT 1 FROM identity.roles r WHERE r.code = p_dimensions ->> 'role') THEN RAISE EXCEPTION 'adoption cohort rejected (role): % is not a role', p_dimensions ->> 'role' USING ERRCODE = '22023'; END IF;
  IF (p_dimensions ->> 'wave') !~ '^[a-z][a-z0-9_.-]{1,40}$' THEN RAISE EXCEPTION 'adoption cohort rejected (wave): a wave key is lower-case' USING ERRCODE = '22023'; END IF;
  IF p_from IS NOT NULL AND p_to IS NOT NULL AND p_to <= p_from THEN RAISE EXCEPTION 'adoption cohort rejected (window): the wave ends after it begins' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM implementation.cohorts c WHERE c.tenant_id = p_tenant AND c.domain_id = p_domain AND c.role_code = p_dimensions ->> 'role' AND c.wave_key = p_dimensions ->> 'wave') THEN
    RAISE EXCEPTION 'adoption cohort rejected (duplicate): % × % is declared', p_dimensions ->> 'role', p_dimensions ->> 'wave' USING ERRCODE = '22023';
  END IF;
  INSERT INTO implementation.cohorts (cohort_id, tenant_id, domain_id, programme_id, role_code, wave_key, bound_from, bound_to, declared_by, correlation_id)
  VALUES (p_cohort, p_tenant, p_domain, p_programme, p_dimensions ->> 'role', p_dimensions ->> 'wave', p_from, p_to, p_actor, p_correlation);
  PERFORM implementation.imp_event(p_tenant, p_domain, 'cohort', p_cohort, NULL, 'cohort.declared', p_actor, jsonb_build_object('role', p_dimensions ->> 'role', 'wave', p_dimensions ->> 'wave'), p_correlation);
  RETURN (SELECT to_jsonb(x) FROM implementation.cohorts x WHERE x.cohort_id = p_cohort);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION implementation.declare_cohort(uuid, uuid, uuid, uuid, jsonb, timestamptz, timestamptz, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION implementation.declare_cohort(uuid, uuid, uuid, uuid, jsonb, timestamptz, timestamptz, uuid, uuid) TO eye_commit;

-- §AD.3 SHADOW WORKFLOWS ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* A SHADOW FINDING: practice continuing outside the governed workflow — a legacy upload attempted after cutover against the RETIRED legacy
   upload contract (the observation port refuses it; the finding cites the refused attempt). Open until resolved with a remediation. */
CREATE TABLE implementation.shadow_findings (
  finding_id       uuid PRIMARY KEY,
  scope            text NOT NULL DEFAULT 'DOMAIN' CHECK (scope = 'DOMAIN'),
  tenant_id        uuid NOT NULL,
  domain_id        uuid NOT NULL,
  source_id        uuid NOT NULL,
  source_key       text NOT NULL,
  attempt          jsonb NOT NULL CHECK (jsonb_typeof(attempt) = 'object'),
  state            text NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'resolved')),
  recorded_by      uuid NOT NULL,
  recorded_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  resolved_by      uuid,
  resolved_at      timestamptz,
  remediation      text,
  correlation_id   uuid NOT NULL,
  CONSTRAINT isf_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT isf_resolved CHECK ((state = 'resolved') = (resolved_at IS NOT NULL AND resolved_by IS NOT NULL AND length(btrim(coalesce(remediation, ''))) >= 8))
);
/* The declared SHADOW-PROCESS REVIEW of a programme (append-only): a named human states what was reviewed. */
CREATE TABLE implementation.shadow_reviews (
  review_id        uuid PRIMARY KEY,
  scope            text NOT NULL DEFAULT 'DOMAIN' CHECK (scope = 'DOMAIN'),
  tenant_id        uuid NOT NULL,
  domain_id        uuid NOT NULL,
  programme_id     uuid NOT NULL,
  statement        text NOT NULL CHECK (length(btrim(statement)) >= 12),
  open_findings    int  NOT NULL CHECK (open_findings >= 0),
  reviewed_by      uuid NOT NULL,
  reviewed_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id   uuid NOT NULL,
  CONSTRAINT isr_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);

/* RECORD a shadow finding (implementation.shadow.record — the lead, a domain admin, a data steward, a collection manager or an attention
   agent): the named source is an UPLOAD contract of the domain and RETIRED (a live contract is not a shadow workflow). */
CREATE OR REPLACE FUNCTION implementation.record_shadow(p_finding uuid, p_tenant uuid, p_domain uuid, p_source uuid, p_attempt jsonb, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = implementation, onboarding, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE s record;
BEGIN
  PERFORM observation.assert_authority(ARRAY['implementation.shadow.record']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM implementation.imp_actor('shadow finding', p_actor);
  SELECT c.source_id, c.source_key, c.connector_kind, c.lifecycle_state INTO s FROM observation.source_contracts_current c
   WHERE c.source_id = p_source AND c.tenant_id = p_tenant AND c.domain_id = p_domain ORDER BY c.contract_version DESC LIMIT 1;
  IF s.source_id IS NULL THEN RAISE EXCEPTION 'shadow finding rejected (unknown_source): % is not a source of this domain', p_source USING ERRCODE = '23503'; END IF;
  IF s.connector_kind <> 'upload' OR s.lifecycle_state NOT IN ('retired', 'superseded') THEN
    RAISE EXCEPTION 'shadow finding rejected (state): % is a % contract in state % — a shadow workflow is practice continuing on a RETIRED legacy upload contract', s.source_key, s.connector_kind, s.lifecycle_state USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(coalesce(p_attempt, 'null'::jsonb)) <> 'object' OR length(btrim(coalesce(p_attempt ->> 'refusal', ''))) < 8 THEN
    RAISE EXCEPTION 'shadow finding rejected (attempt): the finding cites the refused attempt (attempt.refusal: the server''s words)' USING ERRCODE = '22023';
  END IF;
  INSERT INTO implementation.shadow_findings (finding_id, tenant_id, domain_id, source_id, source_key, attempt, recorded_by, correlation_id)
  VALUES (p_finding, p_tenant, p_domain, p_source, s.source_key, p_attempt, p_actor, p_correlation);
  PERFORM implementation.imp_event(p_tenant, p_domain, 'shadow_finding', p_finding, NULL, 'shadow.recorded', p_actor, jsonb_build_object('source_id', p_source, 'source_key', s.source_key), p_correlation);
  RETURN (SELECT to_jsonb(x) FROM implementation.shadow_findings x WHERE x.finding_id = p_finding);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION implementation.record_shadow(uuid, uuid, uuid, uuid, jsonb, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION implementation.record_shadow(uuid, uuid, uuid, uuid, jsonb, uuid, uuid) TO eye_commit;

/* RESOLVE a finding (implementation.shadow.resolve — HUMAN-GATED: a domain admin or the onboarding authority, never a lead): the targeted
   remediation stated (PR-68-005). */
CREATE OR REPLACE FUNCTION implementation.resolve_shadow(p_finding uuid, p_tenant uuid, p_domain uuid, p_remediation text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = implementation, onboarding, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE f implementation.shadow_findings%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['implementation.shadow.resolve']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM implementation.imp_actor('shadow finding', p_actor);
  SELECT * INTO f FROM implementation.shadow_findings x WHERE x.finding_id = p_finding AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'shadow finding rejected (unknown_finding): % is not a finding of this domain', p_finding USING ERRCODE = '23503'; END IF;
  PERFORM onboarding.assert_approver('shadow finding', p_actor, p_tenant, p_domain, ARRAY['domain_admin', 'onboarding_authority'], NULL, 'resolving a shadow finding');
  IF f.state <> 'open' THEN RAISE EXCEPTION 'shadow finding rejected (state): the finding is %', f.state USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_remediation, ''))) < 8 THEN RAISE EXCEPTION 'shadow finding rejected (remediation): the remediation is stated (8+ characters)' USING ERRCODE = '22023'; END IF;
  UPDATE implementation.shadow_findings SET state = 'resolved', resolved_by = p_actor, resolved_at = clock_timestamp(), remediation = btrim(p_remediation) WHERE finding_id = p_finding;
  PERFORM implementation.imp_event(p_tenant, p_domain, 'shadow_finding', p_finding, NULL, 'shadow.resolved', p_actor, jsonb_build_object('remediation', btrim(p_remediation)), p_correlation);
  RETURN (SELECT to_jsonb(x) FROM implementation.shadow_findings x WHERE x.finding_id = p_finding);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION implementation.resolve_shadow(uuid, uuid, uuid, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION implementation.resolve_shadow(uuid, uuid, uuid, text, uuid, uuid) TO eye_commit;

/* DECLARE the shadow-process review (implementation.shadow.review — HUMAN-GATED: a domain admin or the onboarding authority, never a lead):
   records the open findings at the instant; a review with findings open does not satisfy the shadow_review item. */
CREATE OR REPLACE FUNCTION implementation.review_shadow(p_review uuid, p_programme uuid, p_tenant uuid, p_domain uuid, p_statement text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = implementation, onboarding, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE pr implementation.programmes%ROWTYPE; v_open int;
BEGIN
  PERFORM observation.assert_authority(ARRAY['implementation.shadow.review']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM implementation.imp_actor('shadow finding', p_actor);
  PERFORM onboarding.assert_approver('shadow finding', p_actor, p_tenant, p_domain, ARRAY['domain_admin', 'onboarding_authority'], NULL, 'declaring the shadow-process review');
  pr := implementation.imp_programme(p_tenant, p_programme, 'shadow finding');
  IF pr.target_domain_id <> p_domain THEN RAISE EXCEPTION 'shadow finding rejected (unknown_programme): the programme targets another domain' USING ERRCODE = '23503'; END IF;
  IF length(btrim(coalesce(p_statement, ''))) < 12 THEN RAISE EXCEPTION 'shadow finding rejected (statement): the review states what was reviewed (12+ characters)' USING ERRCODE = '22023'; END IF;
  SELECT count(*)::int INTO v_open FROM implementation.shadow_findings f WHERE f.tenant_id = p_tenant AND f.domain_id = p_domain AND f.state = 'open';
  INSERT INTO implementation.shadow_reviews (review_id, tenant_id, domain_id, programme_id, statement, open_findings, reviewed_by, correlation_id)
  VALUES (p_review, p_tenant, p_domain, p_programme, btrim(p_statement), v_open, p_actor, p_correlation);
  PERFORM implementation.imp_event(p_tenant, p_domain, 'shadow_review', p_review, NULL, 'shadow.reviewed', p_actor, jsonb_build_object('programme_id', p_programme, 'open_findings', v_open), p_correlation);
  RETURN (SELECT to_jsonb(x) FROM implementation.shadow_reviews x WHERE x.review_id = p_review);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION implementation.review_shadow(uuid, uuid, uuid, uuid, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION implementation.review_shadow(uuid, uuid, uuid, uuid, text, uuid, uuid) TO eye_commit;

-- §IM.2 READINESS AND THE GATE ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* A READINESS ITEM (DOMAIN = the programme's target domain; versioned). spec per kind:
     role_filled {role} · owner_resolved {responsibility} · training_coverage {path_key, roles[]} · competence_coverage {competence_key, roles[]}
     · accessibility_attested {path_key} · shadow_review {} · custom {statement, confirm_role}.
   accountable_role: who the gap escalates to. Nothing here stores "satisfied" — every item is evaluated LIVE. */
CREATE TABLE implementation.readiness_items (
  item_id          uuid NOT NULL,
  version          int  NOT NULL CHECK (version >= 1),
  scope            text NOT NULL DEFAULT 'DOMAIN' CHECK (scope = 'DOMAIN'),
  tenant_id        uuid NOT NULL,
  domain_id        uuid NOT NULL,
  programme_id     uuid NOT NULL,
  item_key         text NOT NULL CHECK (item_key ~ '^[a-z][a-z0-9_.-]{2,62}$'),
  kind             text NOT NULL CHECK (kind = ANY (implementation.readiness_kinds())),
  title            text NOT NULL CHECK (length(btrim(title)) BETWEEN 4 AND 200),
  spec             jsonb NOT NULL CHECK (jsonb_typeof(spec) = 'object'),
  blocking         boolean NOT NULL DEFAULT true,
  accountable_role text NOT NULL REFERENCES identity.roles (code),
  state            text NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'retired')),
  digest           text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  declared_by      uuid NOT NULL,
  declared_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  superseded_at    timestamptz,
  retire_reason    text,
  correlation_id   uuid NOT NULL,
  PRIMARY KEY (item_id, version),
  CONSTRAINT iri_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT iri_retired CHECK ((state = 'retired') = (retire_reason IS NOT NULL))
);
CREATE UNIQUE INDEX iri_one_current ON implementation.readiness_items (programme_id, item_key) WHERE superseded_at IS NULL;
CREATE UNIQUE INDEX iri_item_current ON implementation.readiness_items (item_id) WHERE superseded_at IS NULL;

/* A custom item's CONFIRMATION by a named human holding the item's confirm_role (append-only; per item version). */
CREATE TABLE implementation.readiness_confirmations (
  confirmation_id  uuid PRIMARY KEY,
  scope            text NOT NULL DEFAULT 'DOMAIN' CHECK (scope = 'DOMAIN'),
  tenant_id        uuid NOT NULL,
  domain_id        uuid NOT NULL,
  item_id          uuid NOT NULL,
  item_version     int  NOT NULL,
  statement        text NOT NULL CHECK (length(btrim(statement)) >= 8),
  confirmed_by     uuid NOT NULL,
  confirmed_at     timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id   uuid NOT NULL,
  FOREIGN KEY (item_id, item_version) REFERENCES implementation.readiness_items (item_id, version),
  CONSTRAINT irc_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);

/* A RESIDUAL-RISK ACCEPTANCE of one blocking item version (the onboarding authority, SIGNED `readiness`): the item stops blocking, shown as
   `accepted_residual`, never as satisfied. Never for the non-overridable kinds. Sealed in the same transaction (deferred constraint). */
CREATE TABLE implementation.residual_acceptances (
  acceptance_id    uuid PRIMARY KEY,
  scope            text NOT NULL DEFAULT 'DOMAIN' CHECK (scope = 'DOMAIN'),
  tenant_id        uuid NOT NULL,
  domain_id        uuid NOT NULL,
  programme_id     uuid NOT NULL,
  item_id          uuid NOT NULL,
  item_version     int  NOT NULL,
  reason           text NOT NULL CHECK (length(btrim(reason)) >= 12),
  digest           text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  accepted_by      uuid NOT NULL,
  accepted_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  signature_id     uuid,
  correlation_id   uuid NOT NULL,
  FOREIGN KEY (item_id, item_version) REFERENCES implementation.readiness_items (item_id, version),
  CONSTRAINT ira_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT ira_once UNIQUE (item_id, item_version)
);

/* A GATE EVALUATION recorded by implementation.gate.evaluate (append-only): what the gate said at the instant (the live evaluation is the
   authority; this is its history). */
CREATE TABLE implementation.gate_evaluations (
  evaluation_id    uuid PRIMARY KEY,
  scope            text NOT NULL DEFAULT 'DOMAIN' CHECK (scope = 'DOMAIN'),
  tenant_id        uuid NOT NULL,
  domain_id        uuid NOT NULL,
  programme_id     uuid NOT NULL,
  programme_version int NOT NULL,
  state            text NOT NULL CHECK (state IN ('ready', 'held', 'accepted', 'withdrawn')),
  gate_digest      text NOT NULL CHECK (gate_digest ~ '^[0-9a-f]{64}$'),
  evaluation       jsonb NOT NULL,
  items_raised     jsonb NOT NULL DEFAULT '[]'::jsonb,
  evaluated_by     uuid NOT NULL,
  evaluated_at     timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id   uuid NOT NULL,
  CONSTRAINT ige_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX ige_programme ON implementation.gate_evaluations (programme_id, evaluated_at DESC);

/* THE GO-LIVE DECISION (PR-68-006's acceptance record): approve (SIGNED `readiness`, sealed in the same transaction) | withhold (recorded;
   nothing else changes — the prior safe operation stands, WS-20). claim is `demonstration` — this product never records a customer's own
   acceptance (R2). */
CREATE TABLE implementation.golive_decisions (
  decision_id      uuid PRIMARY KEY,
  scope            text NOT NULL DEFAULT 'DOMAIN' CHECK (scope = 'DOMAIN'),
  tenant_id        uuid NOT NULL,
  domain_id        uuid NOT NULL,
  programme_id     uuid NOT NULL,
  programme_version int NOT NULL,
  decision         text NOT NULL CHECK (decision IN ('approve', 'withhold')),
  gate_digest      text NOT NULL CHECK (gate_digest ~ '^[0-9a-f]{64}$'),
  cadence_id       uuid,
  journeys         jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(journeys) = 'array'),
  acceptance       jsonb NOT NULL CHECK (jsonb_typeof(acceptance) = 'object'),
  reason           text NOT NULL CHECK (length(btrim(reason)) >= 8),
  digest           text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  decided_by       uuid NOT NULL,
  decided_role     text NOT NULL CHECK (decided_role IN ('customer_sponsor', 'onboarding_authority')),
  decided_at       timestamptz NOT NULL DEFAULT clock_timestamp(),
  signature_id     uuid,
  claim            text NOT NULL DEFAULT 'demonstration' CHECK (claim = 'demonstration'),
  correlation_id   uuid NOT NULL,
  CONSTRAINT igd_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT igd_approve CHECK (decision <> 'approve' OR (cadence_id IS NOT NULL AND jsonb_array_length(journeys) >= 1))
);
CREATE UNIQUE INDEX igd_one_approval ON implementation.golive_decisions (programme_id) WHERE decision = 'approve';

/* A signed act is never left unsigned: at COMMIT an approval / a residual acceptance carries its signature (deferred). */
CREATE OR REPLACE FUNCTION implementation.imp_require_seal() RETURNS trigger
LANGUAGE plpgsql SET search_path = implementation, pg_catalog, pg_temp AS $$
DECLARE v_sig uuid;
BEGIN
  IF TG_TABLE_NAME = 'golive_decisions' THEN
    SELECT signature_id INTO v_sig FROM implementation.golive_decisions WHERE decision_id = NEW.decision_id;
    IF NEW.decision = 'approve' AND v_sig IS NULL THEN
      RAISE EXCEPTION 'go-live gate rejected (unsigned): a go-live approval is signed in the same act (no executive signing key signed it)' USING ERRCODE = '22023';
    END IF;
  ELSE
    SELECT signature_id INTO v_sig FROM implementation.residual_acceptances WHERE acceptance_id = NEW.acceptance_id;
    IF v_sig IS NULL THEN RAISE EXCEPTION 'readiness item rejected (unsigned): a residual-risk acceptance is signed in the same act' USING ERRCODE = '22023'; END IF;
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION implementation.imp_require_seal() FROM PUBLIC;
CREATE CONSTRAINT TRIGGER igd_sealed AFTER INSERT ON implementation.golive_decisions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION implementation.imp_require_seal();
CREATE CONSTRAINT TRIGGER ira_sealed AFTER INSERT ON implementation.residual_acceptances DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION implementation.imp_require_seal();

/* The spec of a readiness item, validated per kind. */
CREATE OR REPLACE FUNCTION implementation.imp_validate_spec(p_tenant uuid, p_domain uuid, p_kind text, p_spec jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = implementation, identity, pg_catalog, pg_temp AS $$
DECLARE s jsonb := coalesce(p_spec, '{}'::jsonb); v_roles text[];
BEGIN
  IF jsonb_typeof(s) <> 'object' THEN RAISE EXCEPTION 'readiness item rejected (spec): the spec is an object' USING ERRCODE = '22023'; END IF;
  IF p_kind = 'role_filled' THEN
    IF NOT EXISTS (SELECT 1 FROM identity.roles r WHERE r.code = s ->> 'role') THEN RAISE EXCEPTION 'readiness item rejected (spec): role_filled names an existing role {role}' USING ERRCODE = '22023'; END IF;
    RETURN jsonb_build_object('role', s ->> 'role');
  ELSIF p_kind = 'owner_resolved' THEN
    IF coalesce(s ->> 'responsibility', '') !~ '^[a-z][a-z0-9_.-]{2,62}$' THEN RAISE EXCEPTION 'readiness item rejected (spec): owner_resolved names a responsibility key {responsibility} (e.g. risk.ownership)' USING ERRCODE = '22023'; END IF;
    RETURN jsonb_build_object('responsibility', s ->> 'responsibility');
  ELSIF p_kind IN ('training_coverage', 'competence_coverage') THEN
    SELECT array_agg(DISTINCT x ORDER BY x) INTO v_roles FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(s -> 'roles') = 'array' THEN s -> 'roles' ELSE '[]'::jsonb END) x;
    IF coalesce(cardinality(v_roles), 0) = 0 OR EXISTS (SELECT 1 FROM unnest(v_roles) r WHERE NOT EXISTS (SELECT 1 FROM identity.roles x WHERE x.code = r)) THEN
      RAISE EXCEPTION 'readiness item rejected (spec): % names the existing roles whose holders are covered {roles[]}', p_kind USING ERRCODE = '22023';
    END IF;
    IF p_kind = 'training_coverage' THEN
      IF (implementation.imp_path(p_tenant, p_domain, s ->> 'path_key')).path_id IS NULL THEN
        RAISE EXCEPTION 'readiness item rejected (spec): training_coverage names a training path of the domain {path_key}' USING ERRCODE = '22023';
      END IF;
      RETURN jsonb_build_object('path_key', s ->> 'path_key', 'roles', to_jsonb(v_roles));
    END IF;
    IF coalesce(s ->> 'competence_key', '') !~ '^[a-z][a-z0-9_.-]{2,62}$' THEN RAISE EXCEPTION 'readiness item rejected (spec): competence_coverage names its competence key' USING ERRCODE = '22023'; END IF;
    RETURN jsonb_build_object('competence_key', s ->> 'competence_key', 'roles', to_jsonb(v_roles));
  ELSIF p_kind = 'accessibility_attested' THEN
    IF (implementation.imp_path(p_tenant, p_domain, s ->> 'path_key')).path_id IS NULL THEN
      RAISE EXCEPTION 'readiness item rejected (spec): accessibility_attested names a training path of the domain {path_key}' USING ERRCODE = '22023';
    END IF;
    RETURN jsonb_build_object('path_key', s ->> 'path_key');
  ELSIF p_kind = 'shadow_review' THEN
    RETURN '{}'::jsonb;
  ELSIF p_kind = 'custom' THEN
    IF length(btrim(coalesce(s ->> 'statement', ''))) < 8 OR NOT EXISTS (SELECT 1 FROM identity.roles r WHERE r.code = s ->> 'confirm_role') THEN
      RAISE EXCEPTION 'readiness item rejected (spec): a custom item states what is confirmed and by which role {statement, confirm_role}' USING ERRCODE = '22023';
    END IF;
    IF s ->> 'confirm_role' = 'implementation_lead' THEN
      RAISE EXCEPTION 'readiness item rejected (separation_of_duties): an implementation lead never confirms readiness on the customer''s behalf' USING ERRCODE = '42501';
    END IF;
    RETURN jsonb_build_object('statement', btrim(s ->> 'statement'), 'confirm_role', s ->> 'confirm_role');
  END IF;
  RAISE EXCEPTION 'readiness item rejected (kind): the kind is one of %', array_to_string(implementation.readiness_kinds(), ', ') USING ERRCODE = '22023';
END $$;
REVOKE ALL ON FUNCTION implementation.imp_validate_spec(uuid, uuid, text, jsonb) FROM PUBLIC;

/* EVALUATE ONE ITEM, live → {satisfied, reason, facts}. Counts per role, never a name (the gate names only the role holders it needs). */
CREATE OR REPLACE FUNCTION implementation.evaluate_item(p_tenant uuid, p_domain uuid, p_programme uuid, p_kind text, p_spec jsonb, p_item uuid, p_version int) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = implementation, service, identity, pg_catalog, pg_temp AS $$
DECLARE v_n int; v_done int; t implementation.training_paths%ROWTYPE; v_acc jsonb; v_res jsonb; v_roles text[]; v_open int; v_last_finding timestamptz; rv implementation.shadow_reviews%ROWTYPE;
BEGIN
  IF p_kind = 'role_filled' THEN
    SELECT count(DISTINCT h.principal_id)::int INTO v_n FROM implementation.imp_holders(p_tenant, p_domain, ARRAY[p_spec ->> 'role']) h;
    RETURN jsonb_build_object('satisfied', v_n > 0, 'facts', jsonb_build_object('role', p_spec ->> 'role', 'holders', v_n),
                              'reason', CASE WHEN v_n = 0 THEN format('nobody holds %s in the domain — an unfilled accountable role is not overridable', p_spec ->> 'role') END);
  ELSIF p_kind = 'owner_resolved' THEN
    v_res := service.owner_resolution(p_tenant, p_domain, p_spec ->> 'responsibility');
    RETURN jsonb_build_object('satisfied', v_res ->> 'state' = 'resolved',
                              'facts', jsonb_build_object('responsibility', p_spec ->> 'responsibility', 'state', v_res ->> 'state', 'owner_role', v_res ->> 'owner_role',
                                                          'holders', jsonb_array_length(coalesce(v_res -> 'principals', '[]'::jsonb)), 'matrix_id', v_res -> 'matrix_id', 'matrix_version', v_res -> 'version',
                                                          'escalation_path', v_res -> 'escalation_path'),
                              'reason', CASE WHEN v_res ->> 'state' <> 'resolved' THEN format('the accountable owner of %s is %s: %s', p_spec ->> 'responsibility', v_res ->> 'state',
                                                                                              coalesce(v_res ->> 'reason', 'no unambiguous owner')) END);
  ELSIF p_kind IN ('training_coverage', 'accessibility_attested') THEN
    t := implementation.imp_path(p_tenant, p_domain, p_spec ->> 'path_key');
    IF t.path_id IS NULL OR t.state <> 'active' THEN
      RETURN jsonb_build_object('satisfied', false, 'facts', jsonb_build_object('path_key', p_spec ->> 'path_key'), 'reason', format('no active training path %s in the domain', p_spec ->> 'path_key'));
    END IF;
    v_acc := implementation.imp_accessibility(t.path_id, t.version);
    IF p_kind = 'accessibility_attested' THEN
      RETURN jsonb_build_object('satisfied', v_acc ->> 'state' = 'accessible', 'facts', jsonb_build_object('path_key', t.path_key, 'path_version', t.version, 'accessibility', v_acc ->> 'state'),
                                'reason', CASE WHEN v_acc ->> 'state' <> 'accessible' THEN format('path %s v%s is %s — an inaccessible or unattested path blocks readiness', t.path_key, t.version, v_acc ->> 'state') END);
    END IF;
    SELECT array_agg(x) INTO v_roles FROM jsonb_array_elements_text(p_spec -> 'roles') x;
    SELECT count(DISTINCT h.principal_id)::int,
           count(DISTINCT h.principal_id) FILTER (WHERE (SELECT r.state FROM implementation.training_records r WHERE r.path_id = t.path_id AND r.path_version = t.version
                                                         AND r.subject_principal_id = h.principal_id AND r.retain_until > clock_timestamp() ORDER BY r.recorded_at DESC, r.record_id DESC LIMIT 1) = 'complete')::int
      INTO v_n, v_done FROM implementation.imp_holders(p_tenant, p_domain, v_roles) h;
    RETURN jsonb_build_object('satisfied', v_acc ->> 'state' = 'accessible' AND v_n > 0 AND v_done = v_n,
                              'facts', jsonb_build_object('path_key', t.path_key, 'path_version', t.version, 'accessibility', v_acc ->> 'state', 'roles', p_spec -> 'roles', 'holders', v_n, 'complete', v_done),
                              'reason', CASE WHEN v_acc ->> 'state' <> 'accessible' THEN format('path %s v%s is %s — training on an inaccessible or unattested path does not count', t.path_key, t.version, v_acc ->> 'state')
                                             WHEN v_n = 0 THEN format('nobody holds %s in the domain', array_to_string(v_roles, ' or '))
                                             WHEN v_done < v_n THEN format('%s of %s holders of %s have completed path %s v%s', v_done, v_n, array_to_string(v_roles, ' or '), t.path_key, t.version) END);
  ELSIF p_kind = 'competence_coverage' THEN
    SELECT array_agg(x) INTO v_roles FROM jsonb_array_elements_text(p_spec -> 'roles') x;
    SELECT count(DISTINCT h.principal_id)::int,
           count(DISTINCT h.principal_id) FILTER (WHERE (SELECT c.outcome FROM implementation.competence_records c WHERE c.tenant_id = p_tenant AND c.domain_id = p_domain
                                                         AND c.competence_key = p_spec ->> 'competence_key' AND c.subject_principal_id = h.principal_id AND c.retain_until > clock_timestamp()
                                                         ORDER BY c.recorded_at DESC, c.record_id DESC LIMIT 1) = 'complete')::int
      INTO v_n, v_done FROM implementation.imp_holders(p_tenant, p_domain, v_roles) h;
    RETURN jsonb_build_object('satisfied', v_n > 0 AND v_done = v_n, 'facts', jsonb_build_object('competence_key', p_spec ->> 'competence_key', 'roles', p_spec -> 'roles', 'holders', v_n, 'complete', v_done),
                              'reason', CASE WHEN v_n = 0 THEN format('nobody holds %s in the domain', array_to_string(v_roles, ' or '))
                                             WHEN v_done < v_n THEN format('%s of %s holders of %s are recorded competent in %s', v_done, v_n, array_to_string(v_roles, ' or '), p_spec ->> 'competence_key') END);
  ELSIF p_kind = 'shadow_review' THEN
    SELECT count(*) FILTER (WHERE f.state = 'open')::int, max(f.recorded_at) INTO v_open, v_last_finding FROM implementation.shadow_findings f WHERE f.tenant_id = p_tenant AND f.domain_id = p_domain;
    SELECT * INTO rv FROM implementation.shadow_reviews r WHERE r.programme_id = p_programme AND r.tenant_id = p_tenant AND r.domain_id = p_domain ORDER BY r.reviewed_at DESC, r.review_id DESC LIMIT 1;
    RETURN jsonb_build_object('satisfied', v_open = 0 AND rv.review_id IS NOT NULL AND rv.open_findings = 0 AND (v_last_finding IS NULL OR rv.reviewed_at >= v_last_finding),
                              'facts', jsonb_build_object('open_findings', v_open, 'review_id', rv.review_id, 'reviewed_at', rv.reviewed_at),
                              'reason', CASE WHEN v_open > 0 THEN format('%s shadow finding(s) open — practice continues outside the governed workflow', v_open)
                                             WHEN rv.review_id IS NULL THEN 'no shadow-process review is declared'
                                             WHEN rv.open_findings > 0 OR (v_last_finding IS NOT NULL AND rv.reviewed_at < v_last_finding) THEN 'the shadow-process review predates the latest finding; it is declared again' END);
  ELSIF p_kind = 'custom' THEN
    SELECT count(*)::int INTO v_n FROM implementation.readiness_confirmations c WHERE c.item_id = p_item AND c.item_version = p_version;
    RETURN jsonb_build_object('satisfied', v_n > 0, 'facts', jsonb_build_object('confirm_role', p_spec ->> 'confirm_role', 'confirmations', v_n),
                              'reason', CASE WHEN v_n = 0 THEN format('not yet confirmed by a %s', p_spec ->> 'confirm_role') END);
  END IF;
  RETURN jsonb_build_object('satisfied', false, 'reason', format('unknown kind %s', p_kind), 'facts', '{}'::jsonb);
END $$;
REVOKE ALL ON FUNCTION implementation.evaluate_item(uuid, uuid, uuid, text, jsonb, uuid, int) FROM PUBLIC;

/* A value measure's standing for READINESS USE (PR-68-005: a measure that misleads blocks its use): the B92 definition must be APPROVED in
   the domain and carry no approved, unexpired B92 EXCEPTION (analytics.metric_exceptions — the exception port is how a measure is marked
   not to be read at face value). A measure can only BLOCK: a value, a cohort result or a percentage never satisfies anything. */
CREATE OR REPLACE FUNCTION implementation.measure_use(p_tenant uuid, p_domain uuid, p_metric_key text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = analytics, pg_catalog, pg_temp AS $$
DECLARE d record; e record;
BEGIN
  SELECT x.definition_id, x.version INTO d FROM analytics.metric_definitions x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.metric_key = p_metric_key AND x.state = 'approved';
  IF d.definition_id IS NULL THEN
    RETURN jsonb_build_object('usable', false, 'state', 'no_approved_definition', 'reason', format('%s has no approved definition in the domain: it cannot be cited in readiness', p_metric_key));
  END IF;
  SELECT x.exception_id, x.reason, x.period_key INTO e FROM analytics.metric_exceptions x
   WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.metric_key = p_metric_key AND x.state = 'approved' AND x.expires_at > clock_timestamp()
   ORDER BY x.decided_at DESC LIMIT 1;
  IF e.exception_id IS NOT NULL THEN
    RETURN jsonb_build_object('usable', false, 'state', 'marked_misleading', 'exception_id', e.exception_id, 'definition_version', d.version,
                              'reason', format('%s carries an approved exception (%s, %s): it is not read at face value — its readiness use is blocked until the exception ends or the measure is no longer cited', p_metric_key, e.period_key, e.reason));
  END IF;
  RETURN jsonb_build_object('usable', true, 'state', 'cited', 'definition_version', d.version);
END $$;
REVOKE ALL ON FUNCTION implementation.measure_use(uuid, uuid, text) FROM PUBLIC;

/* THE GATE, evaluated LIVE (a definer read under the N-01 guard): every current readiness item (satisfied | unsatisfied | accepted_residual),
   every value measure cited in readiness (it may block, never release), the programme's own state. ready ⇔ the programme is in progress,
   at least one item is declared, and no blocking line stands. The digest binds the programme version, each item version and its state, and
   each measure's state — what an approver names. */
CREATE OR REPLACE FUNCTION implementation.evaluate_gate(p_tenant uuid, p_domain uuid, p_programme uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = implementation, observation, pg_catalog, pg_temp AS $$
DECLARE pr implementation.programmes%ROWTYPE; it record; v_eval jsonb; v_items jsonb := '[]'::jsonb; v_measures jsonb := '[]'::jsonb; v_blocking jsonb := '[]'::jsonb; v_state text;
        v_res implementation.residual_acceptances%ROWTYPE; v_line jsonb; v_status text; m record; v_use jsonb; v_gap boolean := false; v_digest text;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the go-live gate of an implementation programme');
  SELECT * INTO pr FROM implementation.programmes x WHERE x.programme_id = p_programme AND x.tenant_id = p_tenant AND x.superseded_at IS NULL;
  IF NOT FOUND OR pr.target_domain_id <> p_domain THEN
    RAISE EXCEPTION 'go-live gate rejected (unknown_programme): % is not an implementation programme of this domain', p_programme USING ERRCODE = '23503';
  END IF;
  FOR it IN SELECT * FROM implementation.readiness_items r WHERE r.programme_id = p_programme AND r.superseded_at IS NULL AND r.state = 'active' ORDER BY r.item_key LOOP
    v_eval := implementation.evaluate_item(p_tenant, p_domain, p_programme, it.kind, it.spec, it.item_id, it.version);
    SELECT * INTO v_res FROM implementation.residual_acceptances a WHERE a.item_id = it.item_id AND a.item_version = it.version AND a.signature_id IS NOT NULL;
    v_status := CASE WHEN (v_eval ->> 'satisfied')::boolean THEN 'satisfied'
                     WHEN v_res.acceptance_id IS NOT NULL AND NOT (it.kind = ANY (implementation.nonoverridable_kinds())) THEN 'accepted_residual'
                     ELSE 'unsatisfied' END;
    v_line := jsonb_build_object('item_id', it.item_id, 'version', it.version, 'item_key', it.item_key, 'kind', it.kind, 'title', it.title, 'blocking', it.blocking,
                                 'accountable_role', it.accountable_role, 'state', v_status, 'reason', v_eval -> 'reason', 'facts', v_eval -> 'facts', 'digest', it.digest,
                                 'overridable', NOT (it.kind = ANY (implementation.nonoverridable_kinds())),
                                 'residual', CASE WHEN v_res.acceptance_id IS NULL THEN NULL ELSE jsonb_build_object('acceptance_id', v_res.acceptance_id, 'accepted_by', v_res.accepted_by,
                                                                                                                      'accepted_at', v_res.accepted_at, 'reason', v_res.reason) END);
    v_items := v_items || jsonb_build_array(v_line);
    IF it.blocking AND v_status = 'unsatisfied' THEN
      v_blocking := v_blocking || jsonb_build_array(jsonb_build_object('kind', it.kind, 'item_key', it.item_key, 'title', it.title, 'reason', v_eval -> 'reason',
                                                                       'accountable_role', it.accountable_role, 'overridable', NOT (it.kind = ANY (implementation.nonoverridable_kinds()))));
      IF it.kind IN ('role_filled', 'owner_resolved') THEN v_gap := true; END IF;
    END IF;
  END LOOP;
  FOR m IN SELECT i.item_key, i.attributes ->> 'metric_key' AS metric_key FROM implementation.programme_items i
            WHERE i.programme_id = p_programme AND i.kind = 'value_measure' AND i.superseded_at IS NULL AND i.state = 'active' AND coalesce((i.attributes ->> 'cited_in_readiness')::boolean, false)
            ORDER BY i.item_key LOOP
    v_use := implementation.measure_use(p_tenant, p_domain, m.metric_key);
    v_measures := v_measures || jsonb_build_array(jsonb_build_object('item_key', m.item_key, 'metric_key', m.metric_key) || v_use);
    IF NOT (v_use ->> 'usable')::boolean THEN
      v_blocking := v_blocking || jsonb_build_array(jsonb_build_object('kind', 'measure_use', 'item_key', m.item_key, 'title', format('readiness use of %s', m.metric_key),
                                                                       'reason', v_use -> 'reason', 'accountable_role', 'customer_sponsor', 'overridable', false));
    END IF;
  END LOOP;
  IF pr.state <> 'in_progress' AND pr.state NOT IN ('accepted', 'withdrawn') THEN
    v_blocking := v_blocking || jsonb_build_array(jsonb_build_object('kind', 'programme', 'item_key', pr.programme_key, 'title', 'the programme',
      'reason', CASE pr.state WHEN 'planned' THEN 'the programme is planned, not started' ELSE format('the programme is held: %s', pr.held_reasons::text) END,
      'accountable_role', 'customer_sponsor', 'overridable', false));
  END IF;
  IF jsonb_array_length(v_items) = 0 THEN
    v_blocking := v_blocking || jsonb_build_array(jsonb_build_object('kind', 'undeclared', 'item_key', pr.programme_key, 'title', 'readiness',
      'reason', 'the programme declares no readiness item: nothing is shown ready by inference', 'accountable_role', 'implementation_lead', 'overridable', false));
  END IF;
  v_state := CASE WHEN pr.state IN ('accepted', 'withdrawn') THEN pr.state WHEN jsonb_array_length(v_blocking) = 0 THEN 'ready' ELSE 'held' END;
  v_digest := onboarding.digest(jsonb_build_object('programme_id', pr.programme_id, 'programme_version', pr.version, 'programme_digest', pr.digest, 'state', v_state,
    'items', (SELECT coalesce(jsonb_agg(jsonb_build_object('item_id', x ->> 'item_id', 'version', x -> 'version', 'state', x ->> 'state', 'blocking', x -> 'blocking') ORDER BY x ->> 'item_key'), '[]'::jsonb)
                FROM jsonb_array_elements(v_items) x),
    'measures', (SELECT coalesce(jsonb_agg(jsonb_build_object('metric_key', x ->> 'metric_key', 'state', x ->> 'state') ORDER BY x ->> 'item_key'), '[]'::jsonb) FROM jsonb_array_elements(v_measures) x)));
  RETURN jsonb_build_object('programme_id', pr.programme_id, 'programme_version', pr.version, 'programme_state', pr.state, 'domain_id', p_domain, 'state', v_state, 'digest', v_digest,
                            'items', v_items, 'measures', v_measures, 'blocking', v_blocking, 'owner_gap', v_gap, 'evaluated_at', clock_timestamp(),
                            'rule', 'ready only when every blocking item is satisfied or accepted as signed residual risk; an unfilled accountable role, an unresolved owner and an inaccessible path are never overridable; no measure, cohort result or percentage releases the gate');
END $$;
REVOKE ALL ON FUNCTION implementation.evaluate_gate(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION implementation.evaluate_gate(uuid, uuid, uuid) TO eye_app, eye_commit;

/* DECLARE a readiness item or its next version (implementation.readiness.declare — the implementation lead or the onboarding authority; a DOMAIN
   route on the target domain). WEAKENING an item (blocking → non-blocking) is the onboarding authority's act (the approver test), and never
   for an unsatisfied non-overridable item. */
CREATE OR REPLACE FUNCTION implementation.declare_readiness(p_item uuid, p_programme uuid, p_tenant uuid, p_domain uuid, p_key text, p_kind text, p_title text, p_spec jsonb, p_blocking boolean,
                                                           p_accountable_role text, p_expected_version int, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = implementation, onboarding, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE pr implementation.programmes%ROWTYPE; o implementation.readiness_items%ROWTYPE; v_spec jsonb; v_id uuid; v_version int; v_digest text; v_eval jsonb; v_role text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['implementation.readiness.declare']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM implementation.imp_actor('readiness item', p_actor);
  IF NOT onboarding.holds_role(p_actor, p_tenant, NULL, ARRAY['implementation_lead', 'onboarding_authority']) THEN
    RAISE EXCEPTION 'readiness item rejected (authority): readiness is declared by the implementation lead or the onboarding authority' USING ERRCODE = '42501';
  END IF;
  pr := implementation.imp_programme(p_tenant, p_programme, 'readiness item');
  IF pr.target_domain_id <> p_domain THEN RAISE EXCEPTION 'readiness item rejected (unknown_programme): the programme targets another domain' USING ERRCODE = '23503'; END IF;
  IF pr.state IN ('accepted', 'withdrawn') THEN RAISE EXCEPTION 'readiness item rejected (state): the programme is %', pr.state USING ERRCODE = '22023'; END IF;
  IF NOT (coalesce(p_kind, '') = ANY (implementation.readiness_kinds())) THEN
    RAISE EXCEPTION 'readiness item rejected (kind): the kind is one of %', array_to_string(implementation.readiness_kinds(), ', ') USING ERRCODE = '22023';
  END IF;
  IF coalesce(p_key, '') !~ '^[a-z][a-z0-9_.-]{2,62}$' THEN RAISE EXCEPTION 'readiness item rejected (key): an item key is lower-case (3–63 characters)' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_title, ''))) NOT BETWEEN 4 AND 200 THEN RAISE EXCEPTION 'readiness item rejected (title): a title of 4–200 characters' USING ERRCODE = '22023'; END IF;
  v_spec := implementation.imp_validate_spec(p_tenant, p_domain, p_kind, p_spec);
  v_role := coalesce(p_accountable_role, CASE p_kind WHEN 'role_filled' THEN 'domain_admin' WHEN 'owner_resolved' THEN 'onboarding_authority' WHEN 'custom' THEN v_spec ->> 'confirm_role'
                                                     ELSE 'customer_sponsor' END);
  IF NOT EXISTS (SELECT 1 FROM identity.roles r WHERE r.code = v_role) THEN RAISE EXCEPTION 'readiness item rejected (accountable_role): % is not a role', v_role USING ERRCODE = '22023'; END IF;
  SELECT * INTO o FROM implementation.readiness_items x WHERE x.programme_id = p_programme AND x.item_key = p_key AND x.superseded_at IS NULL FOR UPDATE;
  IF FOUND THEN
    IF p_expected_version IS DISTINCT FROM o.version THEN
      RAISE EXCEPTION 'readiness item rejected (stale): % is at version %, not %', p_key, o.version, coalesce(p_expected_version::text, '<none>') USING ERRCODE = '22023';
    END IF;
    IF o.state = 'retired' THEN RAISE EXCEPTION 'readiness item rejected (state): % is retired', p_key USING ERRCODE = '22023'; END IF;
    IF o.kind <> p_kind THEN RAISE EXCEPTION 'readiness item rejected (kind): % is a % item; another kind is another item', p_key, o.kind USING ERRCODE = '22023'; END IF;
    IF o.blocking AND NOT coalesce(p_blocking, true) THEN
      PERFORM onboarding.assert_approver('readiness item', p_actor, p_tenant, p_domain, ARRAY['onboarding_authority'], NULL, 'making a blocking readiness item non-blocking');
      v_eval := implementation.evaluate_item(p_tenant, p_domain, p_programme, o.kind, o.spec, o.item_id, o.version);
      IF o.kind = ANY (implementation.nonoverridable_kinds()) AND NOT (v_eval ->> 'satisfied')::boolean THEN
        RAISE EXCEPTION 'readiness item rejected (held): % is unsatisfied (%) and is not overridable — it is filled, never waived', p_key, v_eval ->> 'reason' USING ERRCODE = '22023';
      END IF;
    END IF;
    v_id := o.item_id; v_version := o.version + 1;
    UPDATE implementation.readiness_items SET superseded_at = clock_timestamp() WHERE item_id = o.item_id AND version = o.version;
  ELSE
    IF coalesce(p_expected_version, 0) <> 0 THEN RAISE EXCEPTION 'readiness item rejected (stale): % does not exist yet (expected version 0)', p_key USING ERRCODE = '22023'; END IF;
    v_id := p_item; v_version := 1;
  END IF;
  v_digest := onboarding.digest(jsonb_build_object('item_id', v_id, 'version', v_version, 'programme_id', p_programme, 'key', p_key, 'kind', p_kind, 'title', btrim(p_title), 'spec', v_spec,
                                                   'blocking', coalesce(p_blocking, true), 'accountable_role', v_role));
  INSERT INTO implementation.readiness_items (item_id, version, tenant_id, domain_id, programme_id, item_key, kind, title, spec, blocking, accountable_role, digest, declared_by, correlation_id)
  VALUES (v_id, v_version, p_tenant, p_domain, p_programme, p_key, p_kind, btrim(p_title), v_spec, coalesce(p_blocking, true), v_role, v_digest, p_actor, p_correlation);
  PERFORM implementation.imp_event(p_tenant, p_domain, 'readiness_item', v_id, v_version, 'readiness.declared', p_actor,
                                   jsonb_build_object('programme_id', p_programme, 'key', p_key, 'kind', p_kind, 'blocking', coalesce(p_blocking, true), 'digest', v_digest), p_correlation);
  RETURN (SELECT to_jsonb(x) FROM implementation.readiness_items x WHERE x.item_id = v_id AND x.version = v_version);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION implementation.declare_readiness(uuid, uuid, uuid, uuid, text, text, text, jsonb, boolean, text, int, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION implementation.declare_readiness(uuid, uuid, uuid, uuid, text, text, text, jsonb, boolean, text, int, uuid, uuid) TO eye_commit;

/* RETIRE a readiness item (implementation.readiness.retire — HUMAN-GATED: the onboarding authority via the approver test, the reason stated).
   An unsatisfied non-overridable item is never retired (an unfilled accountable role is filled, not waived). */
CREATE OR REPLACE FUNCTION implementation.retire_readiness(p_item uuid, p_tenant uuid, p_domain uuid, p_expected_version int, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = implementation, onboarding, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE o implementation.readiness_items%ROWTYPE; v_eval jsonb; v_digest text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['implementation.readiness.retire']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM implementation.imp_actor('readiness item', p_actor);
  SELECT * INTO o FROM implementation.readiness_items x WHERE x.item_id = p_item AND x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.superseded_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'readiness item rejected (unknown_item): % is not a readiness item of this domain', p_item USING ERRCODE = '23503'; END IF;
  PERFORM onboarding.assert_approver('readiness item', p_actor, p_tenant, p_domain, ARRAY['onboarding_authority'], o.declared_by, 'retiring a readiness item');
  IF p_expected_version IS DISTINCT FROM o.version THEN RAISE EXCEPTION 'readiness item rejected (stale): the item is at version %, not %', o.version, p_expected_version USING ERRCODE = '22023'; END IF;
  IF o.state = 'retired' THEN RAISE EXCEPTION 'readiness item rejected (state): the item is retired' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 12 THEN RAISE EXCEPTION 'readiness item rejected (reason): a retirement states its reason (12+ characters)' USING ERRCODE = '22023'; END IF;
  v_eval := implementation.evaluate_item(p_tenant, p_domain, o.programme_id, o.kind, o.spec, o.item_id, o.version);
  IF o.kind = ANY (implementation.nonoverridable_kinds()) AND NOT (v_eval ->> 'satisfied')::boolean THEN
    RAISE EXCEPTION 'readiness item rejected (held): % is unsatisfied (%) and is not overridable — it is filled, never retired away', o.item_key, v_eval ->> 'reason' USING ERRCODE = '22023';
  END IF;
  UPDATE implementation.readiness_items SET superseded_at = clock_timestamp() WHERE item_id = o.item_id AND version = o.version;
  v_digest := onboarding.digest(jsonb_build_object('item_id', o.item_id, 'version', o.version + 1, 'retired', true, 'reason', btrim(p_reason), 'prior', o.digest));
  INSERT INTO implementation.readiness_items (item_id, version, tenant_id, domain_id, programme_id, item_key, kind, title, spec, blocking, accountable_role, state, digest, declared_by, retire_reason, correlation_id)
  VALUES (o.item_id, o.version + 1, p_tenant, p_domain, o.programme_id, o.item_key, o.kind, o.title, o.spec, o.blocking, o.accountable_role, 'retired', v_digest, p_actor, btrim(p_reason), p_correlation);
  PERFORM implementation.imp_event(p_tenant, p_domain, 'readiness_item', o.item_id, o.version + 1, 'readiness.retired', p_actor, jsonb_build_object('reason', btrim(p_reason), 'key', o.item_key), p_correlation);
  RETURN (SELECT to_jsonb(x) FROM implementation.readiness_items x WHERE x.item_id = o.item_id AND x.version = o.version + 1);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION implementation.retire_readiness(uuid, uuid, uuid, int, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION implementation.retire_readiness(uuid, uuid, uuid, int, text, uuid, uuid) TO eye_commit;

/* CONFIRM a custom item (implementation.readiness.confirm — HUMAN-GATED: a named human holding the item's confirm_role, never the item's
   declarer, never a lead, never an agent), on the item's digest. */
CREATE OR REPLACE FUNCTION implementation.confirm_readiness(p_confirmation uuid, p_item uuid, p_tenant uuid, p_domain uuid, p_version int, p_digest text, p_statement text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = implementation, onboarding, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE o implementation.readiness_items%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['implementation.readiness.confirm']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM implementation.imp_actor('readiness item', p_actor);
  SELECT * INTO o FROM implementation.readiness_items x WHERE x.item_id = p_item AND x.version = p_version AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'readiness item rejected (unknown_item): % has no version % in this domain', p_item, p_version USING ERRCODE = '23503'; END IF;
  IF o.kind <> 'custom' THEN RAISE EXCEPTION 'readiness item rejected (kind): only a custom item is confirmed by a person; a % item is evaluated live', o.kind USING ERRCODE = '22023'; END IF;
  PERFORM onboarding.assert_approver('readiness item', p_actor, p_tenant, p_domain, ARRAY[o.spec ->> 'confirm_role'], o.declared_by, 'confirming a readiness item');
  IF o.superseded_at IS NOT NULL OR o.state <> 'active' THEN RAISE EXCEPTION 'readiness item rejected (stale): version % is not the current active version', p_version USING ERRCODE = '22023'; END IF;
  IF p_digest IS DISTINCT FROM o.digest THEN RAISE EXCEPTION 'readiness item rejected (stale): the item is at digest %…, not the one confirmed (%…)', left(o.digest, 12), left(coalesce(p_digest, '<none>'), 12) USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_statement, ''))) < 8 THEN RAISE EXCEPTION 'readiness item rejected (statement): a confirmation states what was confirmed (8+ characters)' USING ERRCODE = '22023'; END IF;
  INSERT INTO implementation.readiness_confirmations (confirmation_id, tenant_id, domain_id, item_id, item_version, statement, confirmed_by, correlation_id)
  VALUES (p_confirmation, p_tenant, p_domain, p_item, p_version, btrim(p_statement), p_actor, p_correlation);
  PERFORM implementation.imp_event(p_tenant, p_domain, 'readiness_item', p_item, p_version, 'readiness.confirmed', p_actor, jsonb_build_object('key', o.item_key), p_correlation);
  RETURN (SELECT to_jsonb(x) FROM implementation.readiness_confirmations x WHERE x.confirmation_id = p_confirmation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION implementation.confirm_readiness(uuid, uuid, uuid, uuid, int, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION implementation.confirm_readiness(uuid, uuid, uuid, uuid, int, text, text, uuid, uuid) TO eye_commit;

/* The digest a residual-risk acceptance signs (the TS signer computes it with this function in the same transaction). */
CREATE OR REPLACE FUNCTION implementation.residual_digest(p_acceptance uuid, p_item uuid, p_version int, p_item_digest text, p_reason text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = onboarding, pg_catalog, pg_temp AS $$
  SELECT onboarding.digest(jsonb_build_object('acceptance_id', p_acceptance, 'item_id', p_item, 'item_version', p_version, 'item_digest', p_item_digest, 'reason', btrim(coalesce(p_reason, '')),
                                              'kind', 'residual_risk'))
$$;
GRANT EXECUTE ON FUNCTION implementation.residual_digest(uuid, uuid, int, text, text) TO eye_app, eye_commit;

/* ACCEPT a blocking item as RESIDUAL RISK (implementation.readiness.accept_residual — HUMAN-GATED: the onboarding authority via the approver
   test, never the declarer; the item's digest named; never a non-overridable kind; the item must be unsatisfied). The row is sealed by
   implementation.seal_signature in the same transaction. */
CREATE OR REPLACE FUNCTION implementation.accept_residual(p_acceptance uuid, p_item uuid, p_tenant uuid, p_domain uuid, p_version int, p_digest text, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = implementation, onboarding, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE o implementation.readiness_items%ROWTYPE; v_eval jsonb; v_digest text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['implementation.readiness.accept_residual']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM implementation.imp_actor('readiness item', p_actor);
  SELECT * INTO o FROM implementation.readiness_items x WHERE x.item_id = p_item AND x.version = p_version AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'readiness item rejected (unknown_item): % has no version % in this domain', p_item, p_version USING ERRCODE = '23503'; END IF;
  PERFORM onboarding.assert_approver('readiness item', p_actor, p_tenant, p_domain, ARRAY['onboarding_authority'], o.declared_by, 'accepting a residual risk');
  IF o.kind = ANY (implementation.nonoverridable_kinds()) THEN
    RAISE EXCEPTION 'readiness item rejected (held): a % item is not overridable — an unfilled accountable role, an unresolved owner or an inaccessible path is filled, never accepted as residual risk', o.kind USING ERRCODE = '22023';
  END IF;
  IF o.superseded_at IS NOT NULL OR o.state <> 'active' THEN RAISE EXCEPTION 'readiness item rejected (stale): version % is not the current active version', p_version USING ERRCODE = '22023'; END IF;
  IF p_digest IS DISTINCT FROM o.digest THEN RAISE EXCEPTION 'readiness item rejected (stale): the item is at digest %…, not the one accepted (%…)', left(o.digest, 12), left(coalesce(p_digest, '<none>'), 12) USING ERRCODE = '22023'; END IF;
  IF NOT o.blocking THEN RAISE EXCEPTION 'readiness item rejected (state): the item does not block; nothing to accept' USING ERRCODE = '22023'; END IF;
  v_eval := implementation.evaluate_item(p_tenant, p_domain, o.programme_id, o.kind, o.spec, o.item_id, o.version);
  IF (v_eval ->> 'satisfied')::boolean THEN RAISE EXCEPTION 'readiness item rejected (state): the item is satisfied; a residual risk is accepted only for an unsatisfied item' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 12 THEN RAISE EXCEPTION 'readiness item rejected (reason): a residual-risk acceptance states the risk accepted (12+ characters)' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM implementation.residual_acceptances a WHERE a.item_id = p_item AND a.item_version = p_version) THEN
    RAISE EXCEPTION 'readiness item rejected (duplicate): version % is already accepted as residual risk', p_version USING ERRCODE = '22023';
  END IF;
  v_digest := implementation.residual_digest(p_acceptance, p_item, p_version, o.digest, p_reason);
  INSERT INTO implementation.residual_acceptances (acceptance_id, tenant_id, domain_id, programme_id, item_id, item_version, reason, digest, accepted_by, correlation_id)
  VALUES (p_acceptance, p_tenant, p_domain, o.programme_id, p_item, p_version, btrim(p_reason), v_digest, p_actor, p_correlation);
  PERFORM implementation.imp_event(p_tenant, p_domain, 'residual_acceptance', p_acceptance, p_version, 'residual.accepted', p_actor,
                                   jsonb_build_object('item_id', p_item, 'key', o.item_key, 'kind', o.kind, 'unsatisfied', v_eval -> 'reason', 'digest', v_digest), p_correlation);
  RETURN (SELECT to_jsonb(x) FROM implementation.residual_acceptances x WHERE x.acceptance_id = p_acceptance);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION implementation.accept_residual(uuid, uuid, uuid, uuid, int, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION implementation.accept_residual(uuid, uuid, uuid, uuid, int, text, text, uuid, uuid) TO eye_commit;

/* EVALUATE AND RECORD the gate (implementation.gate.evaluate — the lead, the sponsor, the authority, a domain admin or an attention agent):
   the live evaluation recorded; held → `implementation.readiness` raised (once while open) and, for an owner gap, `responsibility.gap`
   (IA-04-005); ready → both closed and the sponsor's `implementation.golive_review` task opened (once per gate digest); accepted/withdrawn
   → items closed. */
CREATE OR REPLACE FUNCTION implementation.record_gate(p_evaluation uuid, p_programme uuid, p_tenant uuid, p_domain uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = implementation, executive, onboarding, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE g jsonb; pr implementation.programmes%ROWTYPE; v_raised jsonb := '[]'::jsonb; v_r jsonb; v_task jsonb := NULL; v_reasons jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['implementation.gate.evaluate']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM implementation.imp_actor('go-live gate', p_actor);
  pr := implementation.imp_programme(p_tenant, p_programme, 'go-live gate');
  g := implementation.evaluate_gate(p_tenant, p_domain, p_programme);
  SELECT coalesce(jsonb_agg(format('%s: %s', b ->> 'title', b ->> 'reason')), '[]'::jsonb) INTO v_reasons FROM jsonb_array_elements(g -> 'blocking') b;
  IF g ->> 'state' = 'held' THEN
    IF NOT EXISTS (SELECT 1 FROM executive.attention_items i WHERE i.tenant_id = p_tenant AND i.domain_id = p_domain AND i.signal_class = 'implementation.readiness'
                                                              AND i.subject_id = p_programme AND i.state <> 'closed') THEN
      v_r := executive.b33_raise_routed(p_tenant, p_domain, 'implementation.readiness', 'readiness_gate', p_programme,
               format('Go-live gate held: %s (%s blocking)', pr.title, jsonb_array_length(g -> 'blocking')), v_reasons, NULL, p_evaluation, 'implementation.gate',
               jsonb_build_object('gate_digest', g ->> 'digest', 'programme_version', pr.version), '{}'::jsonb, p_actor, p_correlation);
      v_raised := v_raised || jsonb_build_array(v_r || jsonb_build_object('class', 'implementation.readiness'));
    END IF;
    IF (g ->> 'owner_gap')::boolean THEN
      IF NOT EXISTS (SELECT 1 FROM executive.attention_items i WHERE i.tenant_id = p_tenant AND i.domain_id = p_domain AND i.signal_class = 'responsibility.gap'
                                                                AND i.subject_id = p_programme AND i.state <> 'closed') THEN
        v_r := executive.b33_raise_routed(p_tenant, p_domain, 'responsibility.gap', 'readiness_gate', p_programme,
                 format('No unambiguous accountable owner: the go-live of %s stops until it is filled', pr.title),
                 (SELECT coalesce(jsonb_agg(format('%s: %s', b ->> 'title', b ->> 'reason')), '[]'::jsonb) FROM jsonb_array_elements(g -> 'blocking') b WHERE b ->> 'kind' IN ('role_filled', 'owner_resolved')),
                 NULL, p_evaluation, 'implementation.gate', jsonb_build_object('gate_digest', g ->> 'digest'), '{}'::jsonb, p_actor, p_correlation);
        v_raised := v_raised || jsonb_build_array(v_r || jsonb_build_object('class', 'responsibility.gap'));
      END IF;
    ELSE
      PERFORM executive.b33_close_items(p_tenant, p_domain, 'responsibility.gap', 'readiness_gate', p_programme, 'the accountable owner is filled (the go-live gate re-evaluated)', p_actor, p_correlation);
    END IF;
  ELSE
    PERFORM executive.b33_close_items(p_tenant, p_domain, 'implementation.readiness', 'readiness_gate', p_programme, format('the go-live gate is %s', g ->> 'state'), p_actor, p_correlation);
    PERFORM executive.b33_close_items(p_tenant, p_domain, 'responsibility.gap', 'readiness_gate', p_programme, format('the go-live gate is %s', g ->> 'state'), p_actor, p_correlation);
    IF g ->> 'state' = 'ready' THEN
      v_task := executive._open_human_task(gen_random_uuid(), p_tenant, p_domain, 'implementation.golive_review', format('golive:%s:%s', p_programme, left(g ->> 'digest', 16)),
                  jsonb_build_object('kind', 'readiness_gate', 'id', p_programme), format('Review the go-live of %s (the gate is ready)', pr.title), NULL,
                  ARRAY['customer_sponsor', 'onboarding_authority'], jsonb_build_object('rule', 'a named human sponsor or onboarding authority, never the lead, never an agent'),
                  NULL, '{}'::jsonb, NULL, NULL, p_actor, p_correlation);
    END IF;
  END IF;
  INSERT INTO implementation.gate_evaluations (evaluation_id, tenant_id, domain_id, programme_id, programme_version, state, gate_digest, evaluation, items_raised, evaluated_by, correlation_id)
  VALUES (p_evaluation, p_tenant, p_domain, p_programme, pr.version, g ->> 'state', g ->> 'digest', g, v_raised, p_actor, p_correlation);
  PERFORM implementation.imp_event(p_tenant, p_domain, 'readiness_gate', p_programme, pr.version, 'gate.evaluated', p_actor,
                                   jsonb_build_object('state', g ->> 'state', 'digest', g ->> 'digest', 'blocking', jsonb_array_length(g -> 'blocking'), 'raised', v_raised, 'task', v_task), p_correlation);
  RETURN g || jsonb_build_object('evaluation_id', p_evaluation, 'raised', v_raised, 'task', v_task);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION implementation.record_gate(uuid, uuid, uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION implementation.record_gate(uuid, uuid, uuid, uuid, uuid, uuid) TO eye_commit;

-- §IM.3 GO-LIVE ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* The digest a go-live decision signs (the TS signer computes it with this function in the same transaction). */
CREATE OR REPLACE FUNCTION implementation.golive_digest(p_decision_id uuid, p_programme uuid, p_version int, p_decision text, p_gate_digest text, p_cadence uuid, p_journeys uuid[], p_reason text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = onboarding, pg_catalog, pg_temp AS $$
  SELECT onboarding.digest(jsonb_build_object('decision_id', p_decision_id, 'programme_id', p_programme, 'programme_version', p_version, 'decision', p_decision, 'gate_digest', p_gate_digest,
                                              'cadence_id', p_cadence, 'journeys', (SELECT coalesce(jsonb_agg(j ORDER BY j), '[]'::jsonb) FROM unnest(coalesce(p_journeys, '{}'::uuid[])) j),
                                              'reason', btrim(coalesce(p_reason, ''))))
$$;
GRANT EXECUTE ON FUNCTION implementation.golive_digest(uuid, uuid, int, text, text, uuid, uuid[], text) TO eye_app, eye_commit;

/* The ACCEPTANCE RECORD's facts (PR-68-006): the exact versions and digests, read at the decision. */
CREATE OR REPLACE FUNCTION implementation.imp_acceptance_facts(pr implementation.programmes, p_gate jsonb, p_cadence uuid, p_journeys uuid[]) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = implementation, executive, commercial, tenancy, analytics, pg_catalog, pg_temp AS $$
DECLARE v_baseline jsonb := NULL; v_lic jsonb; v_ctr jsonb;
BEGIN
  IF to_regclass('onboarding.config_baselines') IS NOT NULL THEN
    EXECUTE 'SELECT to_jsonb(b) - ''pointers'' FROM onboarding.config_baselines b WHERE b.tenant_id = $1 AND b.domain_id = $2 AND b.state = ''approved'' ORDER BY b.version DESC LIMIT 1'
      INTO v_baseline USING pr.tenant_id, pr.target_domain_id;
  END IF;
  SELECT jsonb_build_object('licence_id', l.licence_id, 'version', l.version, 'state', l.state, 'package_key', l.package_key, 'capabilities', to_jsonb(l.capabilities)) INTO v_lic
    FROM commercial.licences l WHERE l.tenant_id = pr.tenant_id AND l.state <> 'superseded' ORDER BY l.issued_at DESC LIMIT 1;
  SELECT jsonb_build_object('contract_id', c.contract_id, 'version', c.version, 'effective_from', c.effective_from, 'licence_version', c.licence_version) INTO v_ctr
    FROM commercial.contracts c WHERE c.tenant_id = pr.tenant_id AND c.status = 'active' ORDER BY c.effective_from LIMIT 1;
  RETURN jsonb_build_object(
    'programme', jsonb_build_object('programme_id', pr.programme_id, 'version', pr.version, 'digest', pr.digest, 'key', pr.programme_key, 'title', pr.title, 'opened_at',
                                    (SELECT min(x.created_at) FROM implementation.programmes x WHERE x.programme_id = pr.programme_id)),
    'domain', (SELECT jsonb_build_object('domain_id', d.id, 'name', d.name, 'status', d.status) FROM tenancy.domains d WHERE d.id = pr.target_domain_id),
    'deployment_profile', pr.deployment_profile,
    'gate', jsonb_build_object('digest', p_gate ->> 'digest', 'items', (SELECT coalesce(jsonb_agg(jsonb_build_object('item_key', x ->> 'item_key', 'kind', x ->> 'kind', 'version', x -> 'version',
                                                                                                             'state', x ->> 'state', 'facts', x -> 'facts')), '[]'::jsonb) FROM jsonb_array_elements(p_gate -> 'items') x),
                               'measures', p_gate -> 'measures'),
    'journeys', (SELECT coalesce(jsonb_agg(jsonb_build_object('item_id', i.item_id, 'version', i.version, 'key', i.item_key, 'journey_ref', i.attributes ->> 'journey_ref', 'title', i.title) ORDER BY i.item_key), '[]'::jsonb)
                   FROM implementation.programme_items i WHERE i.item_id = ANY (coalesce(p_journeys, '{}'::uuid[])) AND i.superseded_at IS NULL),
    'cadence', (SELECT jsonb_build_object('cadence_id', c.cadence_id, 'period', c.period, 'sequence', c.sequence, 'opened_at', c.opened_at) FROM executive.cadences c WHERE c.cadence_id = p_cadence),
    'roles', (SELECT coalesce(to_jsonb(array_agg(DISTINCT z.role ORDER BY z.role)), '[]'::jsonb) FROM (
                SELECT jsonb_array_elements_text(r.spec -> 'roles') AS role FROM implementation.readiness_items r
                 WHERE r.programme_id = pr.programme_id AND r.superseded_at IS NULL AND jsonb_typeof(r.spec -> 'roles') = 'array'
                UNION SELECT r.spec ->> 'role' FROM implementation.readiness_items r WHERE r.programme_id = pr.programme_id AND r.superseded_at IS NULL AND r.spec ? 'role') z
               WHERE z.role IS NOT NULL),
    'training_paths', (SELECT coalesce(jsonb_agg(jsonb_build_object('path_key', t.path_key, 'version', t.version, 'digest', t.digest, 'accessibility', implementation.imp_accessibility(t.path_id, t.version) ->> 'state')
                                                 ORDER BY t.path_key), '[]'::jsonb)
                         FROM implementation.training_paths t WHERE t.tenant_id = pr.tenant_id AND t.domain_id = pr.target_domain_id AND t.superseded_at IS NULL AND t.state = 'active'),
    'cohorts', (SELECT coalesce(jsonb_agg(jsonb_build_object('role', c.role_code, 'wave', c.wave_key) ORDER BY c.role_code, c.wave_key), '[]'::jsonb)
                  FROM implementation.cohorts c WHERE c.programme_id = pr.programme_id),
    'shadow_review', (SELECT jsonb_build_object('review_id', r.review_id, 'reviewed_at', r.reviewed_at, 'open_findings', r.open_findings) FROM implementation.shadow_reviews r
                       WHERE r.programme_id = pr.programme_id ORDER BY r.reviewed_at DESC LIMIT 1),
    'licence', v_lic, 'contract', v_ctr, 'config_baseline', v_baseline,
    'data_model', jsonb_build_object('schemas', jsonb_build_array('implementation@0114')),
    'consequence_class', 'C2',
    'period', jsonb_build_object('from', (SELECT min(x.created_at) FROM implementation.programmes x WHERE x.programme_id = pr.programme_id), 'to', clock_timestamp()),
    'claim', 'demonstration',
    'boundary', 'an in-product go-live by a SYNTHETIC persona demonstrates the software only; the customer''s own signed acceptance (AT-68, PR-68-006) is R2 and is never written by this product');
END $$;
REVOKE ALL ON FUNCTION implementation.imp_acceptance_facts(implementation.programmes, jsonb, uuid, uuid[]) FROM PUBLIC;

/* DECIDE GO-LIVE (implementation.golive.approve — HUMAN-GATED: the customer sponsor or the onboarding authority via the approver test, never
   the lead, never an agent). approve: the gate READY at the digest named (held → 409 held; another digest → 409 stale), the accepted
   operating cadence (an executive.cadences row of the domain) and ≥ 1 accepted PRIORITY journey of the programme; the programme becomes
   `accepted`; the decision is sealed by its signature in the same transaction. withhold: recorded; nothing else changes. */
CREATE OR REPLACE FUNCTION implementation.decide_golive(p_decision_id uuid, p_programme uuid, p_tenant uuid, p_domain uuid, p_decision text, p_gate_digest text, p_cadence uuid, p_journeys uuid[],
                                                        p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = implementation, executive, onboarding, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE pr implementation.programmes%ROWTYPE; g jsonb; v_role text; v_bad uuid; n implementation.programmes%ROWTYPE; v_facts jsonb; v_digest text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['implementation.golive.approve']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM implementation.imp_actor('go-live gate', p_actor);
  pr := implementation.imp_programme(p_tenant, p_programme, 'go-live gate');
  IF pr.target_domain_id <> p_domain THEN RAISE EXCEPTION 'go-live gate rejected (unknown_programme): the programme targets another domain' USING ERRCODE = '23503'; END IF;
  PERFORM 1 FROM implementation.programmes x WHERE x.programme_id = p_programme AND x.version = pr.version FOR UPDATE;
  PERFORM onboarding.assert_approver('go-live gate', p_actor, p_tenant, p_domain, ARRAY['customer_sponsor', 'onboarding_authority'], NULL, 'accepting go-live');
  v_role := CASE WHEN onboarding.holds_role(p_actor, p_tenant, p_domain, ARRAY['customer_sponsor']) THEN 'customer_sponsor' ELSE 'onboarding_authority' END;
  IF p_decision NOT IN ('approve', 'withhold') THEN RAISE EXCEPTION 'go-live gate rejected (decision): approve or withhold' USING ERRCODE = '22023'; END IF;
  IF pr.state IN ('accepted', 'withdrawn') THEN RAISE EXCEPTION 'go-live gate rejected (state): the programme is %', pr.state USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'go-live gate rejected (reason): a go-live decision states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  g := implementation.evaluate_gate(p_tenant, p_domain, p_programme);
  IF p_decision = 'approve' THEN
    IF g ->> 'state' <> 'ready' THEN
      RAISE EXCEPTION 'go-live gate rejected (held): the gate is held — %', (SELECT string_agg(format('%s: %s', b ->> 'title', b ->> 'reason'), '; ') FROM jsonb_array_elements(g -> 'blocking') b) USING ERRCODE = '22023';
    END IF;
    IF p_gate_digest IS DISTINCT FROM g ->> 'digest' THEN
      RAISE EXCEPTION 'go-live gate rejected (stale): the gate is at digest %…, not the one approved (%…) — re-read it', left(g ->> 'digest', 12), left(coalesce(p_gate_digest, '<none>'), 12) USING ERRCODE = '22023';
    END IF;
    IF p_cadence IS NULL OR NOT EXISTS (SELECT 1 FROM executive.cadences c WHERE c.cadence_id = p_cadence AND c.tenant_id = p_tenant AND c.domain_id = p_domain) THEN
      RAISE EXCEPTION 'go-live gate rejected (cadence): go-live names the accepted operating cadence (an executive cadence of this domain)' USING ERRCODE = '22023';
    END IF;
    IF coalesce(cardinality(p_journeys), 0) = 0 THEN RAISE EXCEPTION 'go-live gate rejected (journeys): go-live names at least one accepted priority journey' USING ERRCODE = '22023'; END IF;
    SELECT j INTO v_bad FROM unnest(p_journeys) j
     WHERE NOT EXISTS (SELECT 1 FROM implementation.programme_items i WHERE i.item_id = j AND i.programme_id = p_programme AND i.kind = 'journey' AND i.superseded_at IS NULL
                                                                      AND i.state = 'active' AND coalesce((i.attributes ->> 'priority')::boolean, false)) LIMIT 1;
    IF v_bad IS NOT NULL THEN RAISE EXCEPTION 'go-live gate rejected (journeys): % is not an active priority journey of the programme', v_bad USING ERRCODE = '22023'; END IF;
  ELSIF p_gate_digest IS DISTINCT FROM g ->> 'digest' THEN
    RAISE EXCEPTION 'go-live gate rejected (stale): the gate is at digest %…, not the one read (%…)', left(g ->> 'digest', 12), left(coalesce(p_gate_digest, '<none>'), 12) USING ERRCODE = '22023';
  END IF;
  v_facts := implementation.imp_acceptance_facts(pr, g, p_cadence, p_journeys);
  v_digest := implementation.golive_digest(p_decision_id, p_programme, pr.version, p_decision, g ->> 'digest', p_cadence, p_journeys, p_reason);
  INSERT INTO implementation.golive_decisions (decision_id, tenant_id, domain_id, programme_id, programme_version, decision, gate_digest, cadence_id, journeys, acceptance, reason, digest,
                                               decided_by, decided_role, correlation_id)
  VALUES (p_decision_id, p_tenant, p_domain, p_programme, pr.version, p_decision, g ->> 'digest', p_cadence,
          (SELECT coalesce(jsonb_agg(j ORDER BY j), '[]'::jsonb) FROM unnest(coalesce(p_journeys, '{}'::uuid[])) j), v_facts, btrim(p_reason), v_digest, p_actor, v_role, p_correlation);
  IF p_decision = 'approve' THEN
    n := implementation.imp_next_version(pr, 'accepted', '[]'::jsonb, NULL, NULL, pr.onboarding_programme_id, NULL, p_actor, p_correlation);
    PERFORM implementation.imp_event(p_tenant, NULL, 'implementation_programme', p_programme, n.version, 'programme.accepted', p_actor,
                                     jsonb_build_object('decision_id', p_decision_id, 'gate_digest', g ->> 'digest', 'claim', 'demonstration'), p_correlation);
  END IF;
  PERFORM executive._resolve_human_tasks(p_tenant, p_domain, jsonb_build_object('kind', 'readiness_gate', 'id', p_programme), ARRAY['implementation.golive_review'],
                                         CASE p_decision WHEN 'approve' THEN 'approved' ELSE 'withheld' END, p_decision_id, p_actor, p_correlation);
  PERFORM implementation.imp_event(p_tenant, p_domain, 'golive_decision', p_decision_id, pr.version, CASE p_decision WHEN 'approve' THEN 'golive.approved' ELSE 'golive.withheld' END, p_actor,
                                   jsonb_build_object('programme_id', p_programme, 'gate_digest', g ->> 'digest', 'gate_state', g ->> 'state', 'cadence_id', p_cadence, 'role', v_role, 'digest', v_digest), p_correlation);
  RETURN (SELECT to_jsonb(x) FROM implementation.golive_decisions x WHERE x.decision_id = p_decision_id);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION implementation.decide_golive(uuid, uuid, uuid, uuid, text, text, uuid, uuid[], text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION implementation.decide_golive(uuid, uuid, uuid, uuid, text, text, uuid, uuid[], text, uuid, uuid) TO eye_commit;

/* SEAL a signed act with its signature (implementation.golive.approve | implementation.readiness.accept_residual, in the same transaction):
   the signature row must exist, be the acting principal's, bound to this very action, over this very digest. */
CREATE OR REPLACE FUNCTION implementation.seal_signature(p_kind text, p_subject uuid, p_tenant uuid, p_domain uuid, p_signature uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = implementation, executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_action text; v_digest text; v_by uuid; s executive.signatures%ROWTYPE;
BEGIN
  v_action := observation.assert_authority(ARRAY['implementation.golive.approve', 'implementation.readiness.accept_residual']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM implementation.imp_actor('go-live gate', p_actor);
  IF p_kind = 'golive' AND v_action = 'implementation.golive.approve' THEN
    SELECT d.digest, d.decided_by INTO v_digest, v_by FROM implementation.golive_decisions d WHERE d.decision_id = p_subject AND d.tenant_id = p_tenant AND d.domain_id = p_domain AND d.signature_id IS NULL;
  ELSIF p_kind = 'residual' AND v_action = 'implementation.readiness.accept_residual' THEN
    SELECT a.digest, a.accepted_by INTO v_digest, v_by FROM implementation.residual_acceptances a WHERE a.acceptance_id = p_subject AND a.tenant_id = p_tenant AND a.domain_id = p_domain AND a.signature_id IS NULL;
  END IF;
  IF v_digest IS NULL THEN RAISE EXCEPTION 'go-live gate rejected (unknown_subject): nothing unsealed to sign (%)', p_kind USING ERRCODE = '23503'; END IF;
  SELECT * INTO s FROM executive.signatures x WHERE x.signature_id = p_signature;
  IF s.signature_id IS NULL OR s.subject_kind <> 'readiness' OR s.subject_id <> p_subject OR s.subject_version <> 1 OR s.subject_digest <> v_digest OR s.signer <> p_actor OR s.signer <> v_by
     OR s.bound_action <> v_action THEN
    RAISE EXCEPTION 'go-live gate rejected (actor): the signature is not the acting principal''s over this act''s digest under this action' USING ERRCODE = '42501';
  END IF;
  IF p_kind = 'golive' THEN
    UPDATE implementation.golive_decisions SET signature_id = p_signature WHERE decision_id = p_subject;
  ELSE
    UPDATE implementation.residual_acceptances SET signature_id = p_signature WHERE acceptance_id = p_subject;
  END IF;
  PERFORM implementation.imp_event(p_tenant, p_domain, CASE p_kind WHEN 'golive' THEN 'golive_decision' ELSE 'residual_acceptance' END, p_subject, NULL, 'signature.sealed', p_actor,
                                   jsonb_build_object('signature_id', p_signature, 'key_id', s.key_id, 'digest', v_digest), p_correlation);
  RETURN jsonb_build_object('signature_id', p_signature, 'key_id', s.key_id, 'subject_digest', v_digest, 'signed_at', s.signed_at);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION implementation.seal_signature(text, uuid, uuid, uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION implementation.seal_signature(text, uuid, uuid, uuid, uuid, uuid, uuid) TO eye_commit;

-- §IM.4 THE READS ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* Who may read a PERSON's training and competence records (the RLS predicate below): the subject, the recorder / assessor, and the authorities
   (the customer sponsor, the onboarding authority, the domain admin of the domain). */
CREATE OR REPLACE FUNCTION implementation.may_read_person(p_tenant uuid, p_domain uuid, p_subject uuid, p_recorder uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = onboarding, public, pg_catalog, pg_temp AS $$
  SELECT public.eye_principal() IS NOT NULL AND (public.eye_principal() = p_subject OR public.eye_principal() = p_recorder
         OR onboarding.holds_role(public.eye_principal(), p_tenant, p_domain, ARRAY['customer_sponsor', 'onboarding_authority', 'domain_admin']))
$$;
REVOKE ALL ON FUNCTION implementation.may_read_person(uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION implementation.may_read_person(uuid, uuid, uuid, uuid) TO eye_app, eye_commit;

/* COVERAGE per path and role, per competence key and role — COUNTS ONLY (the readers who are not the authorities see this, never a person). */
CREATE OR REPLACE FUNCTION implementation.coverage(p_tenant uuid, p_domain uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = implementation, observation, pg_catalog, pg_temp AS $$
DECLARE v_paths jsonb; v_comp jsonb;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'enablement coverage');
  SELECT coalesce(jsonb_agg(jsonb_build_object('path_key', t.path_key, 'version', t.version, 'title', t.title, 'state', t.state, 'digest', t.digest, 'declared_at', t.declared_at,
           'accessibility', implementation.imp_accessibility(t.path_id, t.version), 'path_id', t.path_id,
           'by_role', (SELECT coalesce(jsonb_agg(jsonb_build_object('role', r, 'holders', (SELECT count(DISTINCT h.principal_id) FROM implementation.imp_holders(p_tenant, p_domain, ARRAY[r]) h),
                                                 'complete', (SELECT count(DISTINCT h.principal_id) FROM implementation.imp_holders(p_tenant, p_domain, ARRAY[r]) h
                                                               WHERE (SELECT x.state FROM implementation.training_records x WHERE x.path_id = t.path_id AND x.path_version = t.version
                                                                        AND x.subject_principal_id = h.principal_id AND x.retain_until > clock_timestamp() ORDER BY x.recorded_at DESC, x.record_id DESC LIMIT 1) = 'complete'))
                                       ORDER BY r), '[]'::jsonb) FROM unnest(t.roles) r)) ORDER BY t.path_key), '[]'::jsonb)
    INTO v_paths FROM implementation.training_paths t WHERE t.tenant_id = p_tenant AND t.domain_id = p_domain AND t.superseded_at IS NULL;
  SELECT coalesce(jsonb_agg(jsonb_build_object('competence_key', z.competence_key, 'role', z.role_code, 'recorded', z.n, 'complete', z.c) ORDER BY z.competence_key, z.role_code), '[]'::jsonb) INTO v_comp
    FROM (SELECT l.competence_key, l.role_code, count(*) AS n, count(*) FILTER (WHERE l.outcome = 'complete') AS c
            FROM (SELECT DISTINCT ON (c.competence_key, c.subject_principal_id) c.competence_key, c.role_code, c.outcome FROM implementation.competence_records c
                   WHERE c.tenant_id = p_tenant AND c.domain_id = p_domain AND c.retain_until > clock_timestamp() ORDER BY c.competence_key, c.subject_principal_id, c.recorded_at DESC, c.record_id DESC) l
           GROUP BY l.competence_key, l.role_code) z;
  RETURN jsonb_build_object('paths', v_paths, 'competence', v_comp, 'note', 'counts per role only — a person''s own records are read by the subject, the recorder and the authorities');
END $$;
REVOKE ALL ON FUNCTION implementation.coverage(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION implementation.coverage(uuid, uuid) TO eye_app, eye_commit;

-- RLS and grants: TENANT tables under `tenant_id = eye_tenant()`; DOMAIN tables under domain isolation; the two PERSON tables additionally
-- per person (the subject, the recorder, the authorities); SELECT to eye_app and eye_commit; no write grant — the definer ports write.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['implementation.programmes', 'implementation.programme_items', 'implementation.changes'] LOOP
    EXECUTE format('REVOKE ALL ON %s FROM PUBLIC', t);
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %s USING (tenant_id = public.eye_tenant())', t);
    EXECUTE format('GRANT SELECT ON %s TO eye_app, eye_commit', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['implementation.training_paths', 'implementation.path_attestations', 'implementation.cohorts', 'implementation.shadow_findings', 'implementation.shadow_reviews',
                           'implementation.readiness_items', 'implementation.readiness_confirmations', 'implementation.residual_acceptances', 'implementation.gate_evaluations',
                           'implementation.golive_decisions'] LOOP
    EXECUTE format('REVOKE ALL ON %s FROM PUBLIC', t);
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$CREATE POLICY domain_isolation ON %s USING (tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain()))$f$, t);
    EXECUTE format('GRANT SELECT ON %s TO eye_app, eye_commit', t);
  END LOOP;
  REVOKE ALL ON implementation.training_records, implementation.competence_records FROM PUBLIC;
  ALTER TABLE implementation.training_records ENABLE ROW LEVEL SECURITY;
  ALTER TABLE implementation.training_records FORCE ROW LEVEL SECURITY;
  ALTER TABLE implementation.competence_records ENABLE ROW LEVEL SECURITY;
  ALTER TABLE implementation.competence_records FORCE ROW LEVEL SECURITY;
  CREATE POLICY person_isolation ON implementation.training_records USING (tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain())
                                                                           AND implementation.may_read_person(tenant_id, domain_id, subject_principal_id, recorded_by));
  CREATE POLICY person_isolation ON implementation.competence_records USING (tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain())
                                                                             AND implementation.may_read_person(tenant_id, domain_id, subject_principal_id, assessor_principal_id));
  GRANT SELECT ON implementation.training_records, implementation.competence_records TO eye_app, eye_commit;
END $$;

CREATE TRIGGER ipa_append_only BEFORE UPDATE OR DELETE ON implementation.path_attestations FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
CREATE TRIGGER itr_append_only BEFORE UPDATE OR DELETE ON implementation.training_records FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
CREATE TRIGGER icr_append_only BEFORE UPDATE OR DELETE ON implementation.competence_records FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
CREATE TRIGGER irc_append_only BEFORE UPDATE OR DELETE ON implementation.readiness_confirmations FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
CREATE TRIGGER ige_append_only BEFORE UPDATE OR DELETE ON implementation.gate_evaluations FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
CREATE TRIGGER isr_append_only BEFORE UPDATE OR DELETE ON implementation.shadow_reviews FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
CREATE TRIGGER ico_append_only BEFORE UPDATE OR DELETE ON implementation.cohorts FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

/* A versioned row keeps its facts: only superseded_at is ever written after insertion (programmes, items, paths, readiness items). */
CREATE OR REPLACE FUNCTION implementation.imp_versioned_forward() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION '% rows are never deleted', TG_TABLE_NAME USING ERRCODE = '42501'; END IF;
  IF OLD.superseded_at IS NOT NULL OR NEW.superseded_at IS NULL OR (to_jsonb(NEW) - 'superseded_at') <> (to_jsonb(OLD) - 'superseded_at') THEN
    RAISE EXCEPTION '% rows are versioned: a change is a new version (only the supersession of the current one is written)', TG_TABLE_NAME USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION implementation.imp_versioned_forward() FROM PUBLIC;
CREATE TRIGGER ipr_forward BEFORE UPDATE OR DELETE ON implementation.programmes FOR EACH ROW EXECUTE FUNCTION implementation.imp_versioned_forward();
CREATE TRIGGER ipi_forward BEFORE UPDATE OR DELETE ON implementation.programme_items FOR EACH ROW EXECUTE FUNCTION implementation.imp_versioned_forward();
CREATE TRIGGER itp_forward BEFORE UPDATE OR DELETE ON implementation.training_paths FOR EACH ROW EXECUTE FUNCTION implementation.imp_versioned_forward();
CREATE TRIGGER iri_forward BEFORE UPDATE OR DELETE ON implementation.readiness_items FOR EACH ROW EXECUTE FUNCTION implementation.imp_versioned_forward();

/* A decided row keeps its facts: a change's decision, a finding's resolution and a seal are the only writes after insertion. */
CREATE OR REPLACE FUNCTION implementation.imp_decided_forward() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
DECLARE v_mutable text[]; v_open_state text;
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION '% rows are never deleted', TG_TABLE_NAME USING ERRCODE = '42501'; END IF;
  v_mutable := CASE TG_TABLE_NAME WHEN 'changes' THEN ARRAY['state', 'decided_by', 'decided_at', 'decision_reason']
                                  WHEN 'shadow_findings' THEN ARRAY['state', 'resolved_by', 'resolved_at', 'remediation']
                                  ELSE ARRAY['signature_id'] END;
  IF (to_jsonb(NEW) - v_mutable) <> (to_jsonb(OLD) - v_mutable) THEN RAISE EXCEPTION '% rows keep their facts', TG_TABLE_NAME USING ERRCODE = '42501'; END IF;
  v_open_state := CASE TG_TABLE_NAME WHEN 'changes' THEN 'proposed' WHEN 'shadow_findings' THEN 'open' END;
  IF v_open_state IS NOT NULL AND (to_jsonb(OLD) ->> 'state') <> v_open_state THEN
    RAISE EXCEPTION '% rows are decided once', TG_TABLE_NAME USING ERRCODE = '42501';
  END IF;
  IF TG_TABLE_NAME IN ('golive_decisions', 'residual_acceptances') AND (to_jsonb(OLD) ->> 'signature_id') IS NOT NULL THEN
    RAISE EXCEPTION '% rows are sealed once', TG_TABLE_NAME USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION implementation.imp_decided_forward() FROM PUBLIC;
CREATE TRIGGER ich_forward BEFORE UPDATE OR DELETE ON implementation.changes FOR EACH ROW EXECUTE FUNCTION implementation.imp_decided_forward();
CREATE TRIGGER isf_forward BEFORE UPDATE OR DELETE ON implementation.shadow_findings FOR EACH ROW EXECUTE FUNCTION implementation.imp_decided_forward();
CREATE TRIGGER igd_forward BEFORE UPDATE OR DELETE ON implementation.golive_decisions FOR EACH ROW EXECUTE FUNCTION implementation.imp_decided_forward();
CREATE TRIGGER ira_forward BEFORE UPDATE OR DELETE ON implementation.residual_acceptances FOR EACH ROW EXECUTE FUNCTION implementation.imp_decided_forward();

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §MC THE COMPUTATIONS (0113 §0.7 contract) — ADP-001, ADP-002 (adoption, k ≥ 5) and MET-039 (the carryover). Each reads ONLY rows recorded
-- at or before p_as_of; records name RECORDS (a role binding, a programme) and ROLES — never a principal id; k-anonymity through
-- distinct_actors (the port refuses a cohort below k). CONSTRUCTION; values on the harness and the act are SYNTHETIC demonstrations.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

/* The population of an adoption measure as at p_at: the holders of the declared cohorts' roles (role × wave) of the domain, restricted to
   p_cohort {role?, wave?} — one row per (principal, role) with the binding that places it. */
CREATE OR REPLACE FUNCTION analytics.mc_adp_population(p_tenant uuid, p_domain uuid, p_at timestamptz, p_cohort jsonb)
RETURNS TABLE (principal_id uuid, role_code text, wave_key text, binding_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = implementation, identity, pg_catalog, pg_temp AS $$
  SELECT DISTINCT ON (h.principal_id, c.role_code) h.principal_id, c.role_code, c.wave_key, h.binding_id
    FROM implementation.cohorts c
    CROSS JOIN LATERAL implementation.imp_holders(p_tenant, p_domain, ARRAY[c.role_code], p_at) h
   WHERE c.tenant_id = p_tenant AND c.domain_id = p_domain AND c.declared_at <= p_at
     AND (c.bound_from IS NULL OR h.bound_at >= c.bound_from) AND (c.bound_to IS NULL OR h.bound_at < c.bound_to)
     AND (p_cohort ->> 'role' IS NULL OR c.role_code = p_cohort ->> 'role') AND (p_cohort ->> 'wave' IS NULL OR c.wave_key = p_cohort ->> 'wave')
   ORDER BY h.principal_id, c.role_code, c.wave_key
$$;
REVOKE ALL ON FUNCTION analytics.mc_adp_population(uuid, uuid, timestamptz, jsonb) FROM PUBLIC;

/* ADP-001 TRAINING COMPLETION (rate; dimensions role, wave): the share of cohort role holders who have completed (latest record complete,
   inside retention, recorded by p_at) the CURRENT ACCESSIBLE version of every training path naming their role. A holder whose role has no
   attested-accessible path is EXCLUDED (said). As at the window's end (or p_as_of). */
CREATE OR REPLACE FUNCTION analytics.mc_adp001_training_completion(p_tenant uuid, p_domain uuid, p_from timestamptz, p_to timestamptz, p_as_of timestamptz, p_scope jsonb, p_cohort jsonb, p_params jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = analytics, implementation, identity, observation, pg_catalog, pg_temp AS $$
DECLARE v_at timestamptz := least(p_to, p_as_of); v_records jsonb := '[]'::jsonb; v_reasons jsonb := analytics.mca_clock_reasons(p_params, ARRAY['record']); r record; v_paths int; v_done int;
        v_people uuid[] := '{}'; v_cohorts int;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'ADP-001 training completion');
  SELECT count(*)::int INTO v_cohorts FROM implementation.cohorts c WHERE c.tenant_id = p_tenant AND c.domain_id = p_domain AND c.declared_at <= v_at;
  IF v_cohorts = 0 THEN v_reasons := v_reasons || to_jsonb('no adoption cohort (role × wave) is declared in the domain: there is no population'::text); END IF;
  FOR r IN SELECT * FROM analytics.mc_adp_population(p_tenant, p_domain, v_at, coalesce(p_cohort, '{}'::jsonb)) LOOP
    SELECT count(*)::int,
           count(*) FILTER (WHERE (SELECT x.state FROM implementation.training_records x WHERE x.path_id = t.path_id AND x.path_version = t.version AND x.subject_principal_id = r.principal_id
                                     AND x.recorded_at <= v_at AND x.retain_until > v_at ORDER BY x.recorded_at DESC, x.record_id DESC LIMIT 1) = 'complete')::int
      INTO v_paths, v_done
      FROM implementation.training_paths t
     WHERE t.tenant_id = p_tenant AND t.domain_id = p_domain AND r.role_code = ANY (t.roles) AND t.state = 'active' AND t.declared_at <= v_at
       AND (t.superseded_at IS NULL OR t.superseded_at > v_at)
       AND (SELECT a.verdict FROM implementation.path_attestations a WHERE a.path_id = t.path_id AND a.path_version = t.version AND a.path_digest = t.digest AND a.attested_at <= v_at
             ORDER BY a.attested_at DESC LIMIT 1) = 'accessible';
    IF v_paths = 0 THEN
      v_records := v_records || analytics.mca_rec('role_binding', r.binding_id::text, 'excluded', format('no attested-accessible training path names %s', r.role_code),
                                                  jsonb_build_object('role', r.role_code, 'wave', r.wave_key));
    ELSE
      v_people := v_people || r.principal_id;
      v_records := v_records || analytics.mca_rec('role_binding', r.binding_id::text, CASE WHEN v_done = v_paths THEN 'numerator' ELSE 'denominator' END, NULL,
                                                  jsonb_build_object('role', r.role_code, 'wave', r.wave_key, 'paths', v_paths, 'complete', v_done));
    END IF;
  END LOOP;
  RETURN analytics.mca_out('rate', v_records, v_reasons,
    jsonb_build_object('clock', 'record', 'as_at', v_at, 'scope_rule', 'ignored: adoption is read over the domain''s declared cohorts', 'grain', 'role × wave — never a person'),
    (SELECT count(DISTINCT x)::int FROM unnest(v_people) x), NULL, 'role', NULL);
END $$;
REVOKE ALL ON FUNCTION analytics.mc_adp001_training_completion(uuid,uuid,timestamptz,timestamptz,timestamptz,jsonb,jsonb,jsonb) FROM PUBLIC;
SELECT analytics.register_computation('adp001_training_completion', 'analytics.mc_adp001_training_completion', 'rate', ARRAY['role', 'wave'],
  ARRAY['implementation.cohorts', 'implementation.training_paths', 'implementation.path_attestations', 'implementation.training_records', 'identity.role_bindings'],
  'ignored: adoption is read over the domain''s declared cohorts (role × wave)',
  'ADP-001: the share of cohort role holders who completed every attested-accessible training path naming their role (latest record complete, inside retention), as at the window end', '0114 §IM');

/* ADP-002 COMPETENCE COMPLETION (rate; dimensions role, wave): the share of cohort role holders whose latest competence record for every key
   recorded for their role is complete (a holder never assessed is in the denominator — not yet assessed, never inferred). */
CREATE OR REPLACE FUNCTION analytics.mc_adp002_competence_completion(p_tenant uuid, p_domain uuid, p_from timestamptz, p_to timestamptz, p_as_of timestamptz, p_scope jsonb, p_cohort jsonb, p_params jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = analytics, implementation, identity, observation, pg_catalog, pg_temp AS $$
DECLARE v_at timestamptz := least(p_to, p_as_of); v_records jsonb := '[]'::jsonb; v_reasons jsonb := analytics.mca_clock_reasons(p_params, ARRAY['record']); r record; v_keys int; v_done int; v_cohorts int;
        v_people uuid[] := '{}';
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'ADP-002 competence completion');
  SELECT count(*)::int INTO v_cohorts FROM implementation.cohorts c WHERE c.tenant_id = p_tenant AND c.domain_id = p_domain AND c.declared_at <= v_at;
  IF v_cohorts = 0 THEN v_reasons := v_reasons || to_jsonb('no adoption cohort (role × wave) is declared in the domain: there is no population'::text); END IF;
  FOR r IN SELECT * FROM analytics.mc_adp_population(p_tenant, p_domain, v_at, coalesce(p_cohort, '{}'::jsonb)) LOOP
    SELECT count(*)::int, count(*) FILTER (WHERE l.outcome = 'complete')::int INTO v_keys, v_done
      FROM (SELECT DISTINCT ON (c.competence_key) c.competence_key, c.outcome FROM implementation.competence_records c
             WHERE c.tenant_id = p_tenant AND c.domain_id = p_domain AND c.role_code = r.role_code AND c.subject_principal_id = r.principal_id AND c.recorded_at <= v_at AND c.retain_until > v_at
             ORDER BY c.competence_key, c.recorded_at DESC, c.record_id DESC) l;
    v_records := v_records || analytics.mca_rec('role_binding', r.binding_id::text, CASE WHEN v_keys > 0 AND v_done = v_keys THEN 'numerator' ELSE 'denominator' END,
                                                CASE WHEN v_keys = 0 THEN 'not yet assessed' END, jsonb_build_object('role', r.role_code, 'wave', r.wave_key, 'keys', v_keys, 'complete', v_done));
    v_people := v_people || r.principal_id;
  END LOOP;
  RETURN analytics.mca_out('rate', v_records, v_reasons,
    jsonb_build_object('clock', 'record', 'as_at', v_at, 'scope_rule', 'ignored: adoption is read over the domain''s declared cohorts', 'grain', 'role × wave — never a person'),
    (SELECT count(DISTINCT x)::int FROM unnest(v_people) x), NULL, 'role', NULL);
END $$;
REVOKE ALL ON FUNCTION analytics.mc_adp002_competence_completion(uuid,uuid,timestamptz,timestamptz,timestamptz,jsonb,jsonb,jsonb) FROM PUBLIC;
SELECT analytics.register_computation('adp002_competence_completion', 'analytics.mc_adp002_competence_completion', 'rate', ARRAY['role', 'wave'],
  ARRAY['implementation.cohorts', 'implementation.competence_records', 'identity.role_bindings'],
  'ignored: adoption is read over the domain''s declared cohorts (role × wave)',
  'ADP-002: the share of cohort role holders whose latest competence record for every key assessed for their role is complete (complete | not_yet — no score), as at the window end', '0114 §IM');

/* MET-039 CUSTOMER TIME TO ACCEPTED OPERATION (duration, days; floor 1 — App M): per implementation programme of the TENANT (tenant-wide —
   the scope rule; an implementation is a tenant fact), the days from the effective_from of the tenant's contract current at the programme's
   OPENING (declared by then, not superseded by then; the earliest effective_from when several) to the GO-LIVE APPROVAL that names an accepted
   operating cadence and ≥ 1 accepted priority journey, approved inside the window (record clock) and by p_as_of. A programme opened by the
   window's end and NOT YET ACCEPTED is excluded "not yet accepted" — never a value; without a contract at opening, excluded "no contract". */
CREATE OR REPLACE FUNCTION analytics.mc_met039_time_to_accepted_operation(p_tenant uuid, p_domain uuid, p_from timestamptz, p_to timestamptz, p_as_of timestamptz, p_scope jsonb, p_cohort jsonb, p_params jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = analytics, implementation, commercial, observation, pg_catalog, pg_temp AS $$
DECLARE v_records jsonb := '[]'::jsonb; v_reasons jsonb := analytics.mca_clock_reasons(p_params, ARRAY['record']); r record; c record; v_days numeric; v_pending int := 0;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'MET-039 customer time to accepted operation');
  FOR r IN SELECT p.programme_id, p.programme_key, min(p.created_at) AS opened_at,
                  (SELECT d.decided_at FROM implementation.golive_decisions d WHERE d.programme_id = p.programme_id AND d.decision = 'approve' AND d.signature_id IS NOT NULL
                      AND d.cadence_id IS NOT NULL AND jsonb_array_length(d.journeys) >= 1 AND d.decided_at <= p_as_of) AS accepted_at,
                  (SELECT d.decision_id FROM implementation.golive_decisions d WHERE d.programme_id = p.programme_id AND d.decision = 'approve' AND d.signature_id IS NOT NULL AND d.decided_at <= p_as_of) AS decision_id,
                  (SELECT jsonb_array_length(d.journeys) FROM implementation.golive_decisions d WHERE d.programme_id = p.programme_id AND d.decision = 'approve' AND d.decided_at <= p_as_of) AS journeys
             FROM implementation.programmes p WHERE p.tenant_id = p_tenant AND p.created_at <= p_as_of
            GROUP BY p.programme_id, p.programme_key HAVING min(p.created_at) < p_to ORDER BY min(p.created_at), p.programme_id LOOP
    IF r.accepted_at IS NULL THEN
      v_pending := v_pending + 1;
      v_records := v_records || analytics.mca_rec('implementation_programme', r.programme_id::text, 'excluded', 'not yet accepted',
                                                  jsonb_build_object('programme_key', r.programme_key, 'opened_at', r.opened_at));
      CONTINUE;
    END IF;
    IF r.accepted_at < p_from OR r.accepted_at >= p_to THEN
      v_records := v_records || analytics.mca_rec('implementation_programme', r.programme_id::text, 'context', NULL,
                                                  jsonb_build_object('programme_key', r.programme_key, 'accepted_at', r.accepted_at, 'note', 'accepted outside the window'));
      CONTINUE;
    END IF;
    SELECT x.contract_id, x.version, x.effective_from INTO c FROM commercial.contracts x
     WHERE x.tenant_id = p_tenant AND x.declared_at <= r.opened_at AND (x.superseded_at IS NULL OR x.superseded_at > r.opened_at) AND x.declared_at <= p_as_of
     ORDER BY x.effective_from, x.contract_id LIMIT 1;
    IF c.contract_id IS NULL THEN
      v_records := v_records || analytics.mca_rec('implementation_programme', r.programme_id::text, 'excluded', 'no contract was current at the programme''s opening (no start to measure from)',
                                                  jsonb_build_object('programme_key', r.programme_key, 'opened_at', r.opened_at, 'accepted_at', r.accepted_at));
      CONTINUE;
    END IF;
    v_days := round(extract(epoch FROM (r.accepted_at - c.effective_from)) / 86400.0, 3);
    v_records := v_records || analytics.mca_rec('implementation_programme', r.programme_id::text, 'included', NULL,
                                                jsonb_build_object('value', v_days, 'unit', 'days', 'programme_key', r.programme_key, 'contract_id', c.contract_id, 'contract_version', c.version,
                                                                   'effective_from', c.effective_from, 'opened_at', r.opened_at, 'accepted_at', r.accepted_at, 'decision_id', r.decision_id,
                                                                   'accepted_journeys', r.journeys));
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_records) x WHERE x ->> 'role' = 'included') THEN
    v_reasons := v_reasons || to_jsonb(CASE WHEN v_pending > 0 THEN format('not yet accepted: %s implementation programme(s) of the tenant have no signed go-live naming an accepted cadence and priority journeys', v_pending)
                                            ELSE 'no implementation programme was accepted in the window' END);
  END IF;
  RETURN analytics.mca_out('duration', v_records, v_reasons,
    jsonb_build_object('clock', 'record', 'unit', 'days', 'scope_rule', 'tenant-wide: the tenant''s implementation programmes (an implementation is a tenant fact)',
                       'start', 'commercial.contracts.effective_from current at the programme''s opening', 'end', 'implementation.golive_decisions (approve, signed) naming a cadence and priority journeys',
                       'pending', v_pending),
    NULL, NULL, '_kind', 'accepted_at');
END $$;
REVOKE ALL ON FUNCTION analytics.mc_met039_time_to_accepted_operation(uuid,uuid,timestamptz,timestamptz,timestamptz,jsonb,jsonb,jsonb) FROM PUBLIC;
SELECT analytics.register_computation('met039_time_to_accepted_operation', 'analytics.mc_met039_time_to_accepted_operation', 'duration', ARRAY[]::text[],
  ARRAY['implementation.programmes', 'implementation.golive_decisions', 'commercial.contracts'],
  'tenant-wide: the tenant''s implementation programmes (an implementation is a tenant fact); the definition''s domain hosts the result',
  'MET-039: days from the contract effective_from current at the programme''s opening to the signed go-live naming an accepted operating cadence and accepted priority journeys; not yet accepted is excluded, never a value', '0114 §IM');


-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §SV — the service portal: cases, routing from the live licence (premium support), SLA, problems, bundles, customer success (F-P7-F-06; carryover a)
-- (folded at integration from the part-local file 0114_b94_x_sv.sql, unchanged but for the marked `B94 integration` edits; apply order §0, §ON, §MG, §IM, §SV, §SA)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0114 §SV — CP-6 B94 part `sv`: THE SERVICE PORTAL (F-P7-F-06: V8 ch.69 PR-69-001, PR-69-002, PR-69-005, PR-69-006, CAP-DL-09, CAP-DL-10,
-- AT-69) and the B91 carryover (a): premium support bound to the portal's ENTITLEMENT-BASED ROUTING (V8 ENT-17, V10 ENT-20 — F-P7-F-01's
-- piece). The part-local file of 0114: it applies ALONE on top of 0001–0113 and the prelude (0114_b94_onboarding_implementation_service.sql).
--
--   §SV.1 the SLA POLICIES (per routing tier × severity, versioned; SYNTHETIC vendor objectives) and the ROUTING read: the tenant's LIVE
--         licence decides — premium_support in a live ACTIVE licence → premium (named support, objectives per severity); anything else →
--         standard. Opening a case is NEVER licence-gated (`service.*` is no capability's prefix; the routing never refuses).
--   §SV.2 the case's columns (added to the prelude's service.cases), the notes, the evidence bundles, the problems / known errors /
--         changes, the commitments, the SLA breaches and drills, the value reviews — DOMAIN-scoped, FORCE RLS, append-only where a ledger.
--   §SV.3 the helpers: the customer / engineer test, THE ENGINEER GATE (service.live_grant FIRST, every attempt logged — a refusal for want
--         of a grant is LOGGED AND ANSWERED, not raised, so the log commits), the case lock, the SLA scheduling (B34 timers).
--   §SV.4 the case ports: open (any customer role; routed), triage, note, progress (awaiting_access | diagnosing | cannot_reproduce |
--         degraded_guidance | resolved), workaround propose / execute (the CUSTOMER executes — a case act linking the governed act the
--         customer performed, verified on its policy decision), known-error reuse, the evidence bundle (records under the case's scope,
--         digested, sensitive items REDACTED or WITHHELD with the reason), closure (the customer's confirmation; human), reopen on
--         regression, the engineer's case read.
--   §SV.5 commitments (record, settle; a missed one breaches and escalates by consequence).
--   §SV.6 problems, known errors (reused on a new case), changes linked to problems (proposed, decided by another named human, recorded).
--   §SV.7 the SLA timers' firing (sla.response / sla.resolution under executive.attention.tick: a breach → `service.case` escalated BY
--         SEVERITY), the drill (an `sla_escalation` drill: a timer due now, fired by the next real tick, recorded as a drill), the sweep
--         (the after-tick hook `service-sla`: a missed commitment; an objective past due whose timer did not fire).
--   §SV.8 the value review (CAP-DL-10): a record over the customer-success read model the route read first; MET-040 stays `unsupported`
--         (carrier B76); the record's claim is ALWAYS `demonstration` — joint value-review acceptance is R2.
--
-- THREE CLAIMS, never mixed: CONSTRUCTION (these ports and their harness phase6-service-b94); DEMONSTRATED OPERATION (the act on SYNTHETIC
-- NORDWERK personas, vendor and stall); REAL CUSTOMER ACCEPTANCE (AT-69, PR-69-006 — R2, never claimed by any record here). Every SLA
-- objective seeded below is SYNTHETIC vendor data.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- §SV.0 THE TIMER OWNER — B94 sv: an SLA timer is owned by its service case (0090's owner_kind list, copied whole, plus `service_case`).
ALTER TABLE executive.workflow_timers DROP CONSTRAINT IF EXISTS workflow_timers_owner_kind_check;
ALTER TABLE executive.workflow_timers ADD CONSTRAINT workflow_timers_owner_kind_check CHECK (owner_kind IN ('task', 'workflow_instance', 'grant', 'commitment_item', 'gate',
  -- B94 sv (0114 §SV.0)
  'service_case'));

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §SV.1 THE SLA POLICIES AND THE ROUTING
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
/* One row per (tier, severity, version): the response and resolution objectives (minutes), the update cadence, whether support is NAMED,
   the queue. Vendor reference data (no tenant): readable by every runtime role, written by this migration only (a new version supersedes).
   SYNTHETIC objectives — not a real support contract. */
CREATE TABLE service.sla_policies (
  tier               text NOT NULL CHECK (tier IN ('premium', 'standard')),
  severity           text NOT NULL CHECK (severity IN ('S1', 'S2', 'S3', 'S4')),
  version            int  NOT NULL CHECK (version >= 1),
  response_minutes   int  NOT NULL CHECK (response_minutes >= 1),
  resolution_minutes int  NOT NULL,
  update_minutes     int  NOT NULL CHECK (update_minutes >= 1),
  named_support      boolean NOT NULL,
  queue              text NOT NULL CHECK (length(btrim(queue)) >= 4),
  status             text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'superseded')),
  declared_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  reason             text NOT NULL CHECK (length(btrim(reason)) >= 8),
  provenance         jsonb NOT NULL CHECK (jsonb_typeof(provenance) = 'object'),
  digest             text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  PRIMARY KEY (tier, severity, version),
  CONSTRAINT ssp_resolution CHECK (resolution_minutes >= response_minutes)
);
CREATE UNIQUE INDEX ssp_one_active ON service.sla_policies (tier, severity) WHERE status = 'active';
REVOKE ALL ON service.sla_policies FROM PUBLIC;
-- every table of the service schema forces RLS (the prelude's invariant): vendor reference data is readable by every tenant, written by none
ALTER TABLE service.sla_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE service.sla_policies FORCE ROW LEVEL SECURITY;
CREATE POLICY reference_read ON service.sla_policies FOR SELECT USING (true);
GRANT SELECT ON service.sla_policies TO eye_app, eye_commit;
INSERT INTO service.sla_policies (tier, severity, version, response_minutes, resolution_minutes, update_minutes, named_support, queue, reason, provenance, digest)
SELECT x.tier, x.sev, 1, x.resp, x.reso, x.upd, x.tier = 'premium', x.queue, 'B94 (0114 §SV.1): the seeded objectives of the service portal (SYNTHETIC vendor data)',
       jsonb_build_object('seeded_by', 'migration 0114 §SV.1', 'synthetic', true),
       onboarding.digest(jsonb_build_object('tier', x.tier, 'severity', x.sev, 'version', 1, 'response', x.resp, 'resolution', x.reso, 'update', x.upd, 'queue', x.queue))
  FROM (VALUES ('premium', 'S1', 15, 240, 30, 'premium named support'), ('premium', 'S2', 30, 480, 60, 'premium named support'),
               ('premium', 'S3', 120, 1440, 240, 'premium named support'), ('premium', 'S4', 480, 4320, 1440, 'premium named support'),
               ('standard', 'S1', 60, 1440, 120, 'standard support queue'), ('standard', 'S2', 240, 2880, 480, 'standard support queue'),
               ('standard', 'S3', 1440, 7200, 1440, 'standard support queue'), ('standard', 'S4', 2880, 14400, 2880, 'standard support queue'))
       AS x(tier, sev, resp, reso, upd, queue);

/* THE ROUTING (carryover a): read from the tenant's LIVE licence (the same selection as commercial.capability_available: the latest
   non-superseded version, an issued one first). premium_support listed AND the version ACTIVE and inside its term → premium; otherwise
   standard, with the reason said (uncontracted; not licensed; in grace / suspended / lapsed — premium routing is never inferred). The
   live contract's support boundary is DESCRIPTIVE: its tier is shown, its named contact names premium support, it never decides the tier.
   This function NEVER refuses: opening a case is never licence-gated. Internal (the open port) and read (the routing preview). */
CREATE OR REPLACE FUNCTION service.routing_for(p_tenant uuid, p_severity text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = service, commercial, observation, public, pg_catalog, pg_temp AS $$
DECLARE lic commercial.licences%ROWTYPE; cap commercial.capabilities%ROWTYPE; ctr commercial.contracts%ROWTYPE; pol service.sla_policies%ROWTYPE;
        v_tier text := 'standard'; v_reason text; v_now timestamptz := clock_timestamp(); v_named text;
BEGIN
  IF p_severity IS NULL OR p_severity NOT IN ('S1', 'S2', 'S3', 'S4') THEN
    RAISE EXCEPTION 'service case rejected (severity): the severity is S1, S2, S3 or S4' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO cap FROM commercial.capabilities c WHERE c.capability_key = 'premium_support' AND c.status = 'active';
  SELECT * INTO lic FROM commercial.licences l WHERE l.tenant_id = p_tenant AND l.state <> 'superseded'
   ORDER BY EXISTS (SELECT 1 FROM commercial.entitlement_events e WHERE e.subject_kind = 'licence' AND e.subject_key = l.licence_id::text
                                    AND e.version = l.version AND e.event = 'licence.issued') DESC, l.issued_at DESC, l.version DESC LIMIT 1;
  SELECT * INTO ctr FROM commercial.contracts c WHERE c.tenant_id = p_tenant AND c.status = 'active' ORDER BY c.declared_at DESC, c.version DESC LIMIT 1;
  IF lic.licence_id IS NULL THEN
    v_reason := 'uncontracted: the tenant holds no licence, so premium support is not licensed — standard routing (opening a case is never licence-gated)';
  ELSIF NOT ('premium_support' = ANY (lic.capabilities)) THEN
    v_reason := format('premium_support is not in licence v%s (%s) — standard routing (opening a case is never licence-gated)', lic.version, lic.state);
  ELSIF lic.state <> 'active' OR (lic.effective_to IS NOT NULL AND lic.effective_to <= v_now) THEN
    v_reason := format('licence v%s lists premium_support but is %s — premium routing is never inferred from a licence that is not active; standard objectives apply (opening is never licence-gated)',
                       lic.version, CASE WHEN lic.state = 'active' THEN 'past its term (grace pending)' ELSE lic.state END);
  ELSIF cap.capability_key IS NULL OR NOT cap.built THEN
    v_reason := 'premium_support is not a built capability of the live catalogue — standard routing';
  ELSE
    v_tier := 'premium';
    v_reason := format('premium: premium_support v%s is licensed under licence v%s (active)', cap.version, lic.version);
  END IF;
  SELECT * INTO pol FROM service.sla_policies p WHERE p.tier = v_tier AND p.severity = p_severity AND p.status = 'active';
  v_named := CASE WHEN v_tier = 'premium' THEN coalesce(nullif(btrim(ctr.support_boundary ->> 'named_contact'), ''), pol.queue) ELSE NULL END;
  RETURN jsonb_build_object(
    'tier', v_tier, 'severity', p_severity, 'reason', v_reason, 'read_at', v_now,
    'licence', CASE WHEN lic.licence_id IS NULL THEN NULL ELSE jsonb_build_object('licence_id', lic.licence_id, 'version', lic.version, 'state', lic.state,
                                                                                    'package_key', lic.package_key, 'digest', lic.digest, 'premium_listed', 'premium_support' = ANY (lic.capabilities)) END,
    'capability', CASE WHEN cap.capability_key IS NULL THEN NULL ELSE jsonb_build_object('key', cap.capability_key, 'version', cap.version, 'built', cap.built, 'prefixes', to_jsonb(cap.action_prefixes)) END,
    'contract', CASE WHEN ctr.contract_id IS NULL THEN NULL ELSE jsonb_build_object('contract_id', ctr.contract_id, 'version', ctr.version, 'support_tier', ctr.support_boundary ->> 'tier',
                                                                                     'descriptive', true) END,
    'policy', jsonb_build_object('tier', pol.tier, 'severity', pol.severity, 'version', pol.version, 'digest', pol.digest),
    'objectives', jsonb_build_object('response_minutes', pol.response_minutes, 'resolution_minutes', pol.resolution_minutes, 'update_minutes', pol.update_minutes),
    'named_support', v_named, 'queue', pol.queue,
    'governance', 'premium support changes objectives and named support only — never an approval, a grant or a gate');
END $$;
REVOKE ALL ON FUNCTION service.routing_for(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION service.routing_for(uuid, text) TO eye_commit;

/* The routing preview (the page: how a case of each severity would route now) — a guarded read. */
CREATE OR REPLACE FUNCTION service.routing_preview(p_tenant uuid, p_domain uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = service, observation, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the routing of a service case');
  RETURN (SELECT jsonb_object_agg(s, service.routing_for(p_tenant, s)) FROM unnest(ARRAY['S1', 'S2', 'S3', 'S4']) s);
END $$;
REVOKE ALL ON FUNCTION service.routing_preview(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION service.routing_preview(uuid, uuid) TO eye_app, eye_commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §SV.2 THE RECORDS
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
/* The case (prelude table) gains: its VERSION (every state act names the version it read — stale → 409), the SLA facts (due instants, the
   timers, the response, the breaches), the triage, resolution, guidance, workaround (proposed / executed), the problem and known error,
   the reopen count and the closure. */
ALTER TABLE service.cases
  ADD COLUMN version                int NOT NULL DEFAULT 1 CHECK (version >= 1),
  ADD COLUMN response_due_at        timestamptz,
  ADD COLUMN resolution_due_at      timestamptz,
  ADD COLUMN response_timer_id      uuid,
  ADD COLUMN resolution_timer_id    uuid,
  ADD COLUMN responded_at           timestamptz,
  ADD COLUMN response_breached_at   timestamptz,
  ADD COLUMN resolution_breached_at timestamptz,
  ADD COLUMN triaged_by             uuid,
  ADD COLUMN triaged_at             timestamptz,
  ADD COLUMN resolved_by            uuid,
  ADD COLUMN resolved_at            timestamptz,
  ADD COLUMN resolution             text,
  ADD COLUMN guidance               text,
  ADD COLUMN workaround             jsonb CHECK (workaround IS NULL OR jsonb_typeof(workaround) = 'object'),
  ADD COLUMN workaround_executed    jsonb CHECK (workaround_executed IS NULL OR jsonb_typeof(workaround_executed) = 'object'),
  ADD COLUMN problem_id             uuid,
  ADD COLUMN known_error_id         uuid,
  ADD COLUMN reopen_count           int NOT NULL DEFAULT 0 CHECK (reopen_count >= 0),
  ADD COLUMN closed_by              uuid,
  ADD COLUMN closure                jsonb CHECK (closure IS NULL OR jsonb_typeof(closure) = 'object');

/* A note on a case: the customer's (any customer role) or support's (a support engineer under a live grant — its grant named). */
CREATE TABLE service.case_notes (
  note_id        uuid PRIMARY KEY,
  scope          text NOT NULL DEFAULT 'DOMAIN' CHECK (scope = 'DOMAIN'),
  tenant_id      uuid NOT NULL,
  domain_id      uuid NOT NULL,
  case_id        uuid NOT NULL REFERENCES service.cases (case_id),
  author_principal_id uuid NOT NULL,
  side           text NOT NULL CHECK (side IN ('customer', 'support')),
  grant_id       uuid REFERENCES service.support_grants (grant_id),
  kind           text NOT NULL CHECK (kind IN ('note', 'diagnosis', 'response')),
  body           text NOT NULL CHECK (length(btrim(body)) BETWEEN 4 AND 4000),
  at             timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id uuid NOT NULL,
  CONSTRAINT scn_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT scn_support_grant CHECK ((side = 'support') = (grant_id IS NOT NULL))
);
CREATE INDEX scn_case ON service.case_notes (case_id, at);
CREATE TRIGGER scn_append_only BEFORE UPDATE OR DELETE ON service.case_notes FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

/* AN EVIDENCE BUNDLE: assembled by the port from the records under the case's scope (and, for support, the grant's object scope), each item
   included, REDACTED or WITHHELD with its reason; digested. Append-only (a new assembly is a new bundle). */
CREATE TABLE service.evidence_bundles (
  bundle_id      uuid PRIMARY KEY,
  scope          text NOT NULL DEFAULT 'DOMAIN' CHECK (scope = 'DOMAIN'),
  tenant_id      uuid NOT NULL,
  domain_id      uuid NOT NULL,
  case_id        uuid NOT NULL REFERENCES service.cases (case_id),
  case_version   int NOT NULL,
  assembled_by   uuid NOT NULL,
  side           text NOT NULL CHECK (side IN ('customer', 'support')),
  grant_id       uuid REFERENCES service.support_grants (grant_id),
  items          jsonb NOT NULL CHECK (jsonb_typeof(items) = 'array'),
  counts         jsonb NOT NULL CHECK (jsonb_typeof(counts) = 'object'),
  digest         text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  assembled_at   timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id uuid NOT NULL,
  CONSTRAINT seb_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT seb_support_grant CHECK ((side = 'support') = (grant_id IS NOT NULL))
);
CREATE INDEX seb_case ON service.evidence_bundles (case_id, assembled_at);
CREATE TRIGGER seb_append_only BEFORE UPDATE OR DELETE ON service.evidence_bundles FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

/* PROBLEMS (the cause behind one or more cases), their case links, KNOWN ERRORS (a problem's documented symptom + workaround, reusable on a
   new case), their reuses, CHANGES linked to a problem. */
CREATE TABLE service.problems (
  problem_id     uuid PRIMARY KEY,
  scope          text NOT NULL DEFAULT 'DOMAIN' CHECK (scope = 'DOMAIN'),
  tenant_id      uuid NOT NULL,
  domain_id      uuid NOT NULL,
  problem_ref    text NOT NULL CHECK (problem_ref ~ '^PRB-[0-9]{4,}$'),
  title          text NOT NULL CHECK (length(btrim(title)) BETWEEN 4 AND 200),
  statement      text NOT NULL CHECK (length(btrim(statement)) >= 12),
  state          text NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'known_error', 'resolved', 'closed')),
  root_cause     text,
  version        int NOT NULL DEFAULT 1 CHECK (version >= 1),
  opened_by      uuid NOT NULL,
  opened_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  closed_by      uuid,
  closed_at      timestamptz,
  close_reason   text,
  correlation_id uuid NOT NULL,
  CONSTRAINT spr_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT spr_ref_once UNIQUE (tenant_id, problem_ref),
  CONSTRAINT spr_closed CHECK ((state IN ('resolved', 'closed')) = (closed_at IS NOT NULL))
);
CREATE TABLE service.problem_cases (
  problem_id     uuid NOT NULL REFERENCES service.problems (problem_id),
  case_id        uuid NOT NULL REFERENCES service.cases (case_id),
  scope          text NOT NULL DEFAULT 'DOMAIN' CHECK (scope = 'DOMAIN'),
  tenant_id      uuid NOT NULL,
  domain_id      uuid NOT NULL,
  linked_by      uuid NOT NULL,
  linked_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  reason         text NOT NULL CHECK (length(btrim(reason)) >= 8),
  PRIMARY KEY (problem_id, case_id),
  CONSTRAINT spc_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE TRIGGER spc_append_only BEFORE UPDATE OR DELETE ON service.problem_cases FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
CREATE TABLE service.known_errors (
  known_error_id uuid PRIMARY KEY,
  scope          text NOT NULL DEFAULT 'DOMAIN' CHECK (scope = 'DOMAIN'),
  tenant_id      uuid NOT NULL,
  domain_id      uuid NOT NULL,
  problem_id     uuid NOT NULL REFERENCES service.problems (problem_id),
  ke_ref         text NOT NULL CHECK (ke_ref ~ '^KE-[0-9]{4,}$'),
  title          text NOT NULL CHECK (length(btrim(title)) BETWEEN 4 AND 200),
  symptom        text NOT NULL CHECK (length(btrim(symptom)) >= 12),
  workaround     text NOT NULL CHECK (length(btrim(workaround)) >= 12),
  workaround_act jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(workaround_act) = 'object'),
  state          text NOT NULL DEFAULT 'published' CHECK (state IN ('published', 'retired')),
  digest         text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  published_by   uuid NOT NULL,
  published_at   timestamptz NOT NULL DEFAULT clock_timestamp(),
  retired_by     uuid,
  retired_at     timestamptz,
  retire_reason  text,
  correlation_id uuid NOT NULL,
  CONSTRAINT ske_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT ske_ref_once UNIQUE (tenant_id, ke_ref),
  CONSTRAINT ske_retired CHECK ((state = 'retired') = (retired_at IS NOT NULL))
);
CREATE TABLE service.known_error_uses (
  use_id         uuid PRIMARY KEY,
  scope          text NOT NULL DEFAULT 'DOMAIN' CHECK (scope = 'DOMAIN'),
  tenant_id      uuid NOT NULL,
  domain_id      uuid NOT NULL,
  known_error_id uuid NOT NULL REFERENCES service.known_errors (known_error_id),
  case_id        uuid NOT NULL REFERENCES service.cases (case_id),
  used_by        uuid NOT NULL,
  side           text NOT NULL CHECK (side IN ('customer', 'support')),
  grant_id       uuid REFERENCES service.support_grants (grant_id),
  used_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id uuid NOT NULL,
  CONSTRAINT sku_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT sku_once UNIQUE (known_error_id, case_id)
);
CREATE TRIGGER sku_append_only BEFORE UPDATE OR DELETE ON service.known_error_uses FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
CREATE TABLE service.changes (
  change_id      uuid PRIMARY KEY,
  scope          text NOT NULL DEFAULT 'DOMAIN' CHECK (scope = 'DOMAIN'),
  tenant_id      uuid NOT NULL,
  domain_id      uuid NOT NULL,
  problem_id     uuid NOT NULL REFERENCES service.problems (problem_id),
  change_ref     text NOT NULL CHECK (change_ref ~ '^CHG-[0-9]{4,}$'),
  title          text NOT NULL CHECK (length(btrim(title)) BETWEEN 4 AND 200),
  description    text NOT NULL CHECK (length(btrim(description)) >= 12),
  expected_effect text NOT NULL CHECK (length(btrim(expected_effect)) >= 8),
  state          text NOT NULL DEFAULT 'proposed' CHECK (state IN ('proposed', 'approved', 'rejected', 'implemented', 'verified', 'failed')),
  version        int NOT NULL DEFAULT 1 CHECK (version >= 1),
  proposed_by    uuid NOT NULL,
  proposed_at    timestamptz NOT NULL DEFAULT clock_timestamp(),
  decided_by     uuid,
  decided_at     timestamptz,
  decision_reason text,
  implemented_by uuid,
  implemented_at timestamptz,
  verified_by    uuid,
  verified_at    timestamptz,
  evidence       jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(evidence) = 'array'),
  correlation_id uuid NOT NULL,
  CONSTRAINT sch_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT sch_ref_once UNIQUE (tenant_id, change_ref),
  CONSTRAINT sch_decided CHECK (state = 'proposed' OR (decided_by IS NOT NULL AND decided_at IS NOT NULL)),
  CONSTRAINT sch_sod CHECK (decided_by IS NULL OR decided_by <> proposed_by)
);

/* A SUPPORT COMMITMENT on a case: what support (or the service owner) committed to, by when. open → met | breached | withdrawn; a breached
   commitment may still be met (late — recorded). */
CREATE TABLE service.commitments (
  commitment_id  uuid PRIMARY KEY,
  scope          text NOT NULL DEFAULT 'DOMAIN' CHECK (scope = 'DOMAIN'),
  tenant_id      uuid NOT NULL,
  domain_id      uuid NOT NULL,
  case_id        uuid NOT NULL REFERENCES service.cases (case_id),
  kind           text NOT NULL CHECK (kind IN ('update', 'workaround', 'fix', 'review', 'other')),
  statement      text NOT NULL CHECK (length(btrim(statement)) >= 8),
  due_at         timestamptz NOT NULL,
  state          text NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'met', 'breached', 'withdrawn')),
  made_by        uuid NOT NULL,
  side           text NOT NULL CHECK (side IN ('customer', 'support')),
  grant_id       uuid REFERENCES service.support_grants (grant_id),
  made_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  breached_at    timestamptz,
  settled_by     uuid,
  settled_at     timestamptz,
  settle_note    text,
  late           boolean NOT NULL DEFAULT false,
  correlation_id uuid NOT NULL,
  CONSTRAINT scm_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT scm_settled CHECK ((state IN ('met', 'withdrawn')) = (settled_at IS NOT NULL)),
  CONSTRAINT scm_breached CHECK (state <> 'breached' OR breached_at IS NOT NULL)
);
CREATE INDEX scm_due ON service.commitments (tenant_id, domain_id, state, due_at);

/* AN SLA BREACH (or a drill's): the objective, its due instant, when it was found breached, by what (timer | sweep | drill), the severity,
   the routed attention item. Append-only. */
CREATE TABLE service.sla_breaches (
  breach_id      uuid PRIMARY KEY,
  scope          text NOT NULL DEFAULT 'DOMAIN' CHECK (scope = 'DOMAIN'),
  tenant_id      uuid NOT NULL,
  domain_id      uuid NOT NULL,
  case_id        uuid NOT NULL REFERENCES service.cases (case_id),
  objective      text NOT NULL CHECK (objective IN ('response', 'resolution', 'commitment')),
  commitment_id  uuid REFERENCES service.commitments (commitment_id),
  severity       text NOT NULL CHECK (severity IN ('S1', 'S2', 'S3', 'S4')),
  tier           text NOT NULL CHECK (tier IN ('premium', 'standard')),
  due_at         timestamptz NOT NULL,
  breached_at    timestamptz NOT NULL DEFAULT clock_timestamp(),
  found_by       text NOT NULL CHECK (found_by IN ('timer', 'sweep', 'drill')),
  drill          boolean NOT NULL DEFAULT false,
  timer_id       uuid,
  item           jsonb NOT NULL DEFAULT '{}'::jsonb,
  correlation_id uuid NOT NULL,
  CONSTRAINT ssb_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT ssb_drill CHECK (drill = (found_by = 'drill')),
  CONSTRAINT ssb_commitment CHECK ((objective = 'commitment') = (commitment_id IS NOT NULL))
);
CREATE UNIQUE INDEX ssb_once ON service.sla_breaches (case_id, objective, due_at) WHERE NOT drill AND objective <> 'commitment';
CREATE UNIQUE INDEX ssb_commitment_once ON service.sla_breaches (commitment_id) WHERE objective = 'commitment';
CREATE TRIGGER ssb_append_only BEFORE UPDATE OR DELETE ON service.sla_breaches FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

/* AN SLA ESCALATION DRILL (PR-69-006 — kind `sla_escalation`): a timer due NOW, fired by the next real tick, its escalation recorded as a
   drill (the case's real SLA facts untouched). */
CREATE TABLE service.sla_drills (
  drill_id       uuid PRIMARY KEY,
  scope          text NOT NULL DEFAULT 'DOMAIN' CHECK (scope = 'DOMAIN'),
  tenant_id      uuid NOT NULL,
  domain_id      uuid NOT NULL,
  case_id        uuid NOT NULL REFERENCES service.cases (case_id),
  kind           text NOT NULL DEFAULT 'sla_escalation' CHECK (kind = 'sla_escalation'),
  objective      text NOT NULL CHECK (objective IN ('response', 'resolution')),
  timer_id       uuid NOT NULL,
  requested_by   uuid NOT NULL,
  requested_at   timestamptz NOT NULL DEFAULT clock_timestamp(),
  reason         text NOT NULL CHECK (length(btrim(reason)) >= 8),
  correlation_id uuid NOT NULL,
  CONSTRAINT ssd_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE TRIGGER ssd_append_only BEFORE UPDATE OR DELETE ON service.sla_drills FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

/* THE VALUE REVIEW (CAP-DL-10): the period, the customer-success inputs the route read first (their digest re-checked), the outcomes
   statement, the value status (MET-040: `unsupported` until B76 — read by the port, never asserted by the caller), recorded by a customer
   role and acknowledged (or withheld) by another named human. claim is ALWAYS `demonstration` — joint value-review acceptance is R2. */
CREATE TABLE service.value_reviews (
  review_id      uuid PRIMARY KEY,
  scope          text NOT NULL DEFAULT 'DOMAIN' CHECK (scope = 'DOMAIN'),
  tenant_id      uuid NOT NULL,
  domain_id      uuid NOT NULL,
  period_from    date NOT NULL,
  period_to      date NOT NULL,
  inputs         jsonb NOT NULL CHECK (jsonb_typeof(inputs) = 'object'),
  inputs_digest  text NOT NULL CHECK (inputs_digest ~ '^[0-9a-f]{64}$'),
  outcomes       text NOT NULL CHECK (length(btrim(outcomes)) >= 12),
  value_status   jsonb NOT NULL CHECK (jsonb_typeof(value_status) = 'object'),
  state          text NOT NULL DEFAULT 'recorded' CHECK (state IN ('recorded', 'acknowledged', 'withheld')),
  claim          text NOT NULL DEFAULT 'demonstration' CHECK (claim = 'demonstration'),
  digest         text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  recorded_by    uuid NOT NULL,
  recorded_at    timestamptz NOT NULL DEFAULT clock_timestamp(),
  decided_by     uuid,
  decided_at     timestamptz,
  decision_note  text,
  correlation_id uuid NOT NULL,
  CONSTRAINT svr_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT svr_period CHECK (period_to >= period_from),
  CONSTRAINT svr_decided CHECK ((state = 'recorded') = (decided_at IS NULL)),
  CONSTRAINT svr_sod CHECK (decided_by IS NULL OR decided_by <> recorded_by)
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['service.case_notes', 'service.evidence_bundles', 'service.problems', 'service.problem_cases', 'service.known_errors', 'service.known_error_uses',
                           'service.changes', 'service.commitments', 'service.sla_breaches', 'service.sla_drills', 'service.value_reviews'] LOOP
    EXECUTE format('REVOKE ALL ON %s FROM PUBLIC', t);
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$CREATE POLICY domain_isolation ON %s USING (tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain()))$f$, t);
    EXECUTE format('GRANT SELECT ON %s TO eye_app, eye_commit', t);
  END LOOP;
END $$;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §SV.3 THE HELPERS (internal: SECURITY DEFINER, REVOKE PUBLIC — called by the ports below only)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
/* The customer roles of a domain (who opens, notes, executes a workaround, confirms closure, reopens). A support engineer is never one. */
CREATE OR REPLACE FUNCTION service.sv_customer_roles() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY[
  'domain_admin', 'collection_manager', 'data_steward', 'executive', 'risk_owner', 'decision_owner', 'domain_analyst', 'strategy_owner',
  'product_analytics_owner', 'tenant_admin', 'customer_sponsor', 'onboarding_authority'] $$;
GRANT EXECUTE ON FUNCTION service.sv_customer_roles() TO eye_app, eye_commit;

/* The act is recorded by the acting principal. */
CREATE OR REPLACE FUNCTION service.sv_assert_actor(p_noun text, p_actor uuid) RETURNS void
LANGUAGE plpgsql STABLE SET search_path = public, pg_catalog, pg_temp AS $$
BEGIN
  IF p_actor IS NULL OR p_actor IS DISTINCT FROM public.eye_principal() THEN
    RAISE EXCEPTION '% rejected (actor): the act is recorded by the acting principal', p_noun USING ERRCODE = '42501';
  END IF;
END $$;
REVOKE ALL ON FUNCTION service.sv_assert_actor(text, uuid) FROM PUBLIC;

/* Does the actor act as SUPPORT here? A holder of support_engineer in the domain is ALWAYS treated as support (grant-checked), whatever
   else it holds — the stricter reading. */
CREATE OR REPLACE FUNCTION service.sv_is_engineer(p_actor uuid, p_tenant uuid, p_domain uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = onboarding, pg_catalog, pg_temp AS $$
  SELECT onboarding.holds_role(p_actor, p_tenant, p_domain, ARRAY['support_engineer'])
$$;
REVOKE ALL ON FUNCTION service.sv_is_engineer(uuid, uuid, uuid) FROM PUBLIC;

/* A customer act: a named active human (unless p_human_only is false), never a support engineer, holding one of p_roles (default: the
   customer roles). */
CREATE OR REPLACE FUNCTION service.sv_assert_customer(p_noun text, p_actor uuid, p_tenant uuid, p_domain uuid, p_roles text[], p_what text) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = service, onboarding, pg_catalog, pg_temp AS $$
DECLARE v_roles text[] := coalesce(p_roles, service.sv_customer_roles());
BEGIN
  IF service.sv_is_engineer(p_actor, p_tenant, p_domain) THEN
    RAISE EXCEPTION '% rejected (actor): % is the customer''s own act — a support engineer never performs it', p_noun, p_what USING ERRCODE = '42501';
  END IF;
  IF onboarding.principal_kind(p_actor) IS DISTINCT FROM 'human' THEN
    RAISE EXCEPTION '% rejected (actor): % is a named human''s act', p_noun, p_what USING ERRCODE = '42501';
  END IF;
  IF NOT onboarding.holds_role(p_actor, p_tenant, p_domain, v_roles) THEN
    RAISE EXCEPTION '% rejected (authority): % is the act of a % in this domain', p_noun, p_what, array_to_string(v_roles, ' or ') USING ERRCODE = '42501';
  END IF;
END $$;
REVOKE ALL ON FUNCTION service.sv_assert_customer(text, uuid, uuid, uuid, text[], text) FROM PUBLIC;

/* THE ENGINEER GATE: every port acting for a support engineer calls it FIRST. service.live_grant for the case, the act and (when named) the
   object; the attempt LOGGED either way (service.log_access). Without a live grant it answers {refused: {status 403, message}} — the port
   RETURNS that (it never raises it), so the log row commits with the refusal; the route answers 403 after the commit. */
CREATE OR REPLACE FUNCTION service.sv_engineer_gate(p_tenant uuid, p_domain uuid, p_actor uuid, p_case uuid, p_action text, p_object uuid, p_object_kind text,
                                                    p_noun text, p_what text, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = service, pg_catalog, pg_temp AS $$
DECLARE v_grant uuid; v_ref text; v_any record;
BEGIN
  v_grant := service.live_grant(p_tenant, p_domain, p_actor, p_case, p_action, p_object);
  SELECT c.case_ref INTO v_ref FROM service.cases c WHERE c.case_id = p_case;
  IF v_grant IS NULL THEN
    SELECT g.state, g.expires_at, g.action_scope INTO v_any FROM service.support_grants g
     WHERE g.tenant_id = p_tenant AND g.domain_id = p_domain AND g.engineer_principal_id = p_actor AND (p_case IS NULL OR g.case_id = p_case)
     ORDER BY g.requested_at DESC LIMIT 1;
    PERFORM service.log_access(p_tenant, p_domain, NULL, p_actor, p_action, coalesce(p_object_kind, 'service_case'), coalesce(p_object, p_case)::text, 'refused',
                               jsonb_build_object('what', p_what, 'case', v_ref, 'reason', 'no live support grant',
                                                  'latest_grant_state', v_any.state, 'latest_grant_expires_at', v_any.expires_at), p_correlation);
    RETURN jsonb_build_object('grant_id', NULL, 'refused', jsonb_build_object('status', 403,
      'message', format('%s rejected (access): %s needs a live support grant for case %s covering %s%s — %s (the attempt is logged)', p_noun, p_what, coalesce(v_ref, p_case::text), p_action,
                        CASE WHEN p_object IS NULL THEN '' ELSE format(' and the object %s', p_object) END,
                        CASE WHEN v_any.state IS NULL THEN 'no grant was ever requested for it'
                             WHEN v_any.state = 'approved' AND v_any.expires_at <= clock_timestamp() THEN format('the grant expired at %s', v_any.expires_at)
                             WHEN v_any.state = 'approved' THEN 'the approved grant does not cover this act or object'
                             ELSE format('the latest grant is %s', v_any.state) END)));
  END IF;
  PERFORM service.log_access(p_tenant, p_domain, v_grant, p_actor, p_action, coalesce(p_object_kind, 'service_case'), coalesce(p_object, p_case)::text, 'allowed',
                             jsonb_build_object('what', p_what, 'case', v_ref), p_correlation);
  RETURN jsonb_build_object('grant_id', v_grant);
END $$;
REVOKE ALL ON FUNCTION service.sv_engineer_gate(uuid, uuid, uuid, uuid, text, uuid, text, text, text, uuid) FROM PUBLIC;

/* The case of the domain, LOCKED (404 unknown_case); p_expected (when not NULL) must be its version (409 stale). */
CREATE OR REPLACE FUNCTION service.sv_case(p_tenant uuid, p_domain uuid, p_case uuid, p_expected int, p_noun text) RETURNS service.cases
LANGUAGE plpgsql SECURITY DEFINER SET search_path = service, pg_catalog, pg_temp AS $$
DECLARE c service.cases%ROWTYPE;
BEGIN
  SELECT * INTO c FROM service.cases x WHERE x.case_id = p_case AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '% rejected (unknown_case): % is not a case of this domain', p_noun, p_case USING ERRCODE = '23503'; END IF;
  IF p_expected IS NOT NULL AND p_expected <> c.version THEN
    RAISE EXCEPTION '% rejected (stale): case % is at version %, the act read version % — read it again', p_noun, c.case_ref, c.version, p_expected USING ERRCODE = '23505';
  END IF;
  RETURN c;
END $$;
REVOKE ALL ON FUNCTION service.sv_case(uuid, uuid, uuid, int, text) FROM PUBLIC;

/* The next reference of a kind in the tenant (CASE-0001, PRB-0001, KE-0001, CHG-0001), serialised per tenant. */
CREATE OR REPLACE FUNCTION service.sv_next_ref(p_tenant uuid, p_prefix text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = service, pg_catalog, pg_temp AS $$
DECLARE v int;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('service.ref:' || p_prefix || ':' || p_tenant::text, 0));
  v := CASE p_prefix
    WHEN 'CASE' THEN (SELECT coalesce(max(substr(case_ref, 6)::int), 0) FROM service.cases WHERE tenant_id = p_tenant)
    WHEN 'PRB' THEN (SELECT coalesce(max(substr(problem_ref, 5)::int), 0) FROM service.problems WHERE tenant_id = p_tenant)
    WHEN 'KE' THEN (SELECT coalesce(max(substr(ke_ref, 4)::int), 0) FROM service.known_errors WHERE tenant_id = p_tenant)
    WHEN 'CHG' THEN (SELECT coalesce(max(substr(change_ref, 5)::int), 0) FROM service.changes WHERE tenant_id = p_tenant) END;
  RETURN p_prefix || '-' || lpad((v + 1)::text, 4, '0');
END $$;
REVOKE ALL ON FUNCTION service.sv_next_ref(uuid, text) FROM PUBLIC;

/* The attention dimensions of a case signal, BY SEVERITY (the escalation by consequence): S1 → C4 within 1 h, S2 → C3 within 4 h, S3 → C2
   within 24 h, S4 → C1 within 72 h. Under a published policy a low severity may fall below the class's threshold (deprioritized — listed,
   never hidden); a high one is routed and escalated as the policy says. */
CREATE OR REPLACE FUNCTION service.sv_dims(p_severity text) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object('consequence', CASE p_severity WHEN 'S1' THEN 'C4' WHEN 'S2' THEN 'C3' WHEN 'S3' THEN 'C2' ELSE 'C1' END, 'confidence', 1,
                            'hours_to_window', CASE p_severity WHEN 'S1' THEN 1 WHEN 'S2' THEN 4 WHEN 'S3' THEN 24 ELSE 72 END)
$$;
GRANT EXECUTE ON FUNCTION service.sv_dims(text) TO eye_app, eye_commit;

/* The response evidence of a case: the first of its triage, its first support note, its first support-grant request (support answered
   "access needed") — the response objective is met by the earliest. */
CREATE OR REPLACE FUNCTION service.sv_responded_at(p_case uuid) RETURNS timestamptz
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = service, pg_catalog, pg_temp AS $$
  SELECT least((SELECT c.responded_at FROM service.cases c WHERE c.case_id = p_case),
               (SELECT min(g.requested_at) FROM service.support_grants g WHERE g.case_id = p_case))
$$;
REVOKE ALL ON FUNCTION service.sv_responded_at(uuid) FROM PUBLIC;

/* Schedule an SLA timer of the case (a B34 timer, owner the case). */
CREATE OR REPLACE FUNCTION service.sv_schedule(c service.cases, p_kind text, p_due timestamptz, p_payload jsonb, p_actor uuid, p_correlation uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = service, executive, pg_catalog, pg_temp AS $$
BEGIN
  RETURN executive._schedule_timer(gen_random_uuid(), c.tenant_id, c.domain_id, 'service_case', c.case_id, p_kind, p_due,
                                   jsonb_build_object('case_ref', c.case_ref, 'severity', c.severity, 'tier', c.routing ->> 'tier', 'drill', false) || coalesce(p_payload, '{}'::jsonb),
                                   p_actor, p_correlation);
END $$;
REVOKE ALL ON FUNCTION service.sv_schedule(service.cases, text, timestamptz, jsonb, uuid, uuid) FROM PUBLIC;

/* Cancel the case's pending SLA timers of a kind (NULL: every SLA kind). Drill timers are left to fire. */
CREATE OR REPLACE FUNCTION service.sv_cancel_timers(p_case uuid, p_kind text) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = service, executive, pg_catalog, pg_temp AS $$
DECLARE n int;
BEGIN
  UPDATE executive.workflow_timers SET cancelled_at = clock_timestamp()
   WHERE owner_kind = 'service_case' AND owner_id = p_case AND fired_at IS NULL AND cancelled_at IS NULL
     AND (p_kind IS NULL OR kind = p_kind) AND kind IN ('sla.response', 'sla.resolution') AND coalesce((payload ->> 'drill')::boolean, false) = false;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION service.sv_cancel_timers(uuid, text) FROM PUBLIC;

/* The ledger event of a case act, the case's version bumped by the caller. */
CREATE OR REPLACE FUNCTION service.sv_event(c service.cases, p_event text, p_actor uuid, p_details jsonb, p_correlation uuid) RETURNS uuid
LANGUAGE sql SECURITY DEFINER SET search_path = service, onboarding, pg_catalog, pg_temp AS $$
  SELECT onboarding.ledger('service', c.tenant_id, c.domain_id, 'service_case', c.case_id, c.version, p_event, p_actor,
                           jsonb_build_object('case_ref', c.case_ref, 'state', c.state) || coalesce(p_details, '{}'::jsonb), p_correlation)
$$;
REVOKE ALL ON FUNCTION service.sv_event(service.cases, text, uuid, jsonb, uuid) FROM PUBLIC;

/* A case as a port answers it. */
CREATE OR REPLACE FUNCTION service.sv_case_json(p_case uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = service, pg_catalog, pg_temp AS $$
  SELECT to_jsonb(c) FROM service.cases c WHERE c.case_id = p_case
$$;
REVOKE ALL ON FUNCTION service.sv_case_json(uuid) FROM PUBLIC;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §SV.4 THE CASE PORTS
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
/* OPEN (service.case.open): a named human holding a customer role in the domain — never a support engineer. NEVER licence-gated: the
   routing is READ from the live licence and recorded (tier, licence version, objectives, named support); both SLA timers scheduled; a
   `service.case` item raised (routed under the domain's published policy, by severity). object_refs: [{kind: source | run, id}] — each
   must be a record of this domain. */
CREATE OR REPLACE FUNCTION service.open_case(p_case uuid, p_tenant uuid, p_domain uuid, p_title text, p_severity text, p_capability text, p_object_refs jsonb,
                                             p_description text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = service, executive, observation, onboarding, ctx, public, pg_catalog, pg_temp AS $$
DECLARE c service.cases%ROWTYPE; v_routing jsonb; v_ref text; v_now timestamptz := clock_timestamp(); o jsonb; v_refs jsonb := '[]'::jsonb; v_ev uuid; v_item jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['service.case.open']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM service.sv_assert_actor('service case', p_actor);
  PERFORM service.sv_assert_customer('service case', p_actor, p_tenant, p_domain, NULL, 'opening a case');
  IF length(btrim(coalesce(p_title, ''))) NOT BETWEEN 4 AND 200 THEN RAISE EXCEPTION 'service case rejected (title): a case title has 4–200 characters' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_description, ''))) < 8 THEN RAISE EXCEPTION 'service case rejected (description): a case describes what happened (8+ characters)' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_capability, ''))) NOT BETWEEN 2 AND 80 THEN RAISE EXCEPTION 'service case rejected (capability): the affected capability is named (2–80 characters)' USING ERRCODE = '22023'; END IF;
  IF jsonb_typeof(coalesce(p_object_refs, '[]'::jsonb)) <> 'array' OR jsonb_array_length(coalesce(p_object_refs, '[]'::jsonb)) > 20 THEN
    RAISE EXCEPTION 'service case rejected (objects): the affected objects are a list of at most 20 {kind, id}' USING ERRCODE = '22023';
  END IF;
  FOR o IN SELECT * FROM jsonb_array_elements(coalesce(p_object_refs, '[]'::jsonb)) LOOP
    IF o ->> 'kind' NOT IN ('source', 'run') OR coalesce(o ->> 'id', '') !~ '^[0-9a-f-]{36}$' THEN
      RAISE EXCEPTION 'service case rejected (objects): an affected object is {kind: source | run, id}' USING ERRCODE = '22023';
    END IF;
    IF o ->> 'kind' = 'source' AND NOT EXISTS (SELECT 1 FROM observation.source_contracts_current s WHERE s.source_id = (o ->> 'id')::uuid AND s.tenant_id = p_tenant AND s.domain_id = p_domain) THEN
      RAISE EXCEPTION 'service case rejected (unknown_object): source % is not a source of this domain', o ->> 'id' USING ERRCODE = '23503';
    END IF;
    IF o ->> 'kind' = 'run' AND NOT EXISTS (SELECT 1 FROM observation.collection_runs_current r WHERE r.run_id = (o ->> 'id')::uuid AND r.tenant_id = p_tenant AND r.domain_id = p_domain) THEN
      RAISE EXCEPTION 'service case rejected (unknown_object): run % is not a run of this domain', o ->> 'id' USING ERRCODE = '23503';
    END IF;
    v_refs := v_refs || jsonb_build_array(jsonb_build_object('kind', o ->> 'kind', 'id', o ->> 'id',
      'label', CASE WHEN o ->> 'kind' = 'source' THEN (SELECT s.source_key FROM observation.source_contracts_current s WHERE s.source_id = (o ->> 'id')::uuid ORDER BY s.contract_version DESC LIMIT 1)
                    ELSE (SELECT 'run ' || to_char(r.started_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI "UTC"') FROM observation.collection_runs_current r WHERE r.run_id = (o ->> 'id')::uuid) END));
  END LOOP;
  IF EXISTS (SELECT 1 FROM service.cases x WHERE x.case_id = p_case) THEN RAISE EXCEPTION 'service case rejected (duplicate): case % exists', p_case USING ERRCODE = '23505'; END IF;
  v_routing := service.routing_for(p_tenant, p_severity);   -- never refuses: opening is never licence-gated
  v_ref := service.sv_next_ref(p_tenant, 'CASE');
  INSERT INTO service.cases (case_id, tenant_id, domain_id, case_ref, title, severity, affected_capability, object_refs, description, state, routing, opened_by, opened_at, updated_at,
                             correlation_id, response_due_at, resolution_due_at)
  VALUES (p_case, p_tenant, p_domain, v_ref, btrim(p_title), p_severity, btrim(p_capability), v_refs, btrim(p_description), 'open', v_routing, p_actor, v_now, v_now, p_correlation,
          v_now + make_interval(mins => (v_routing -> 'objectives' ->> 'response_minutes')::int),
          v_now + make_interval(mins => (v_routing -> 'objectives' ->> 'resolution_minutes')::int))
  RETURNING * INTO c;
  UPDATE service.cases SET response_timer_id = service.sv_schedule(c, 'sla.response', c.response_due_at, jsonb_build_object('objective', 'response'), p_actor, p_correlation),
                           resolution_timer_id = service.sv_schedule(c, 'sla.resolution', c.resolution_due_at, jsonb_build_object('objective', 'resolution'), p_actor, p_correlation)
   WHERE case_id = p_case RETURNING * INTO c;
  v_ev := service.sv_event(c, 'case.opened', p_actor, jsonb_build_object('severity', p_severity, 'routing', v_routing, 'objects', v_refs,
                                                                          'response_due_at', c.response_due_at, 'resolution_due_at', c.resolution_due_at), p_correlation);
  v_item := executive.b33_raise_routed(p_tenant, p_domain, 'service.case', 'service_case', p_case,
              format('Case %s (%s, %s routing) opened: %s', v_ref, p_severity, v_routing ->> 'tier', left(btrim(p_title), 120)),
              jsonb_build_array(jsonb_build_object('kind', 'case.opened', 'severity', p_severity, 'tier', v_routing ->> 'tier', 'response_due_at', c.response_due_at)),
              NULL, v_ev, 'case.opened', jsonb_build_object('case_ref', v_ref, 'routing_tier', v_routing ->> 'tier'), service.sv_dims(p_severity), p_actor, p_correlation);
  RETURN jsonb_build_object('case', service.sv_case_json(p_case), 'routing', v_routing, 'item', v_item);
END $$;
REVOKE ALL ON FUNCTION service.open_case(uuid, uuid, uuid, text, text, text, jsonb, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION service.open_case(uuid, uuid, uuid, text, text, text, jsonb, text, uuid, uuid) TO eye_commit;

/* TRIAGE (service.case.triage): the domain admin (the customer's service owner) or a support engineer under a live grant (case.note). open →
   triaged; the response objective is met by it (its timer cancelled). A RE-GRADE of the severity is the customer's (the domain admin, with a
   reason): the objectives are re-read for the case's tier and the new severity, the timers re-scheduled from the opening instant. */
CREATE OR REPLACE FUNCTION service.triage_case(p_case uuid, p_tenant uuid, p_domain uuid, p_expected int, p_severity text, p_note text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = service, executive, observation, onboarding, ctx, public, pg_catalog, pg_temp AS $$
DECLARE c service.cases%ROWTYPE; v_gate jsonb := '{}'::jsonb; v_eng boolean; pol service.sla_policies%ROWTYPE; v_regrade boolean := false; v_now timestamptz := clock_timestamp();
BEGIN
  PERFORM observation.assert_authority(ARRAY['service.case.triage']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM service.sv_assert_actor('service case', p_actor);
  v_eng := service.sv_is_engineer(p_actor, p_tenant, p_domain);
  IF v_eng THEN
    v_gate := service.sv_engineer_gate(p_tenant, p_domain, p_actor, p_case, 'case.note', NULL, 'service_case', 'service case', 'triaging a case', p_correlation);
    IF v_gate ? 'refused' THEN RETURN v_gate; END IF;
  ELSE
    PERFORM service.sv_assert_customer('service case', p_actor, p_tenant, p_domain, ARRAY['domain_admin'], 'triaging a case');
  END IF;
  c := service.sv_case(p_tenant, p_domain, p_case, p_expected, 'service case');
  IF c.state <> 'open' THEN RAISE EXCEPTION 'service case rejected (state): case % is %, not open', c.case_ref, c.state USING ERRCODE = '23505'; END IF;
  IF length(btrim(coalesce(p_note, ''))) < 8 THEN RAISE EXCEPTION 'service case rejected (note): a triage states what was assessed (8+ characters)' USING ERRCODE = '22023'; END IF;
  IF p_severity IS NOT NULL AND p_severity <> c.severity THEN
    IF v_eng THEN RAISE EXCEPTION 'service case rejected (severity): the severity is the customer''s statement — support proposes a re-grade in a note; the domain admin re-grades' USING ERRCODE = '22023'; END IF;
    SELECT * INTO pol FROM service.sla_policies p WHERE p.tier = c.routing ->> 'tier' AND p.severity = p_severity AND p.status = 'active';
    IF NOT FOUND THEN RAISE EXCEPTION 'service case rejected (severity): the severity is S1, S2, S3 or S4' USING ERRCODE = '22023'; END IF;
    v_regrade := true;
  END IF;
  UPDATE service.cases SET state = 'triaged', triaged_by = p_actor, triaged_at = v_now, responded_at = coalesce(responded_at, v_now), version = version + 1, updated_at = v_now,
         severity = CASE WHEN v_regrade THEN p_severity ELSE severity END,
         routing = CASE WHEN v_regrade THEN routing || jsonb_build_object('severity', p_severity, 'regraded_from', c.severity,
                     'objectives', jsonb_build_object('response_minutes', pol.response_minutes, 'resolution_minutes', pol.resolution_minutes, 'update_minutes', pol.update_minutes),
                     'policy', jsonb_build_object('tier', pol.tier, 'severity', pol.severity, 'version', pol.version, 'digest', pol.digest)) ELSE routing END,
         resolution_due_at = CASE WHEN v_regrade THEN opened_at + make_interval(mins => pol.resolution_minutes) ELSE resolution_due_at END
   WHERE case_id = p_case RETURNING * INTO c;
  PERFORM service.sv_cancel_timers(p_case, 'sla.response');
  IF v_regrade THEN
    PERFORM service.sv_cancel_timers(p_case, 'sla.resolution');
    UPDATE service.cases SET resolution_timer_id = service.sv_schedule(c, 'sla.resolution', greatest(c.resolution_due_at, v_now), jsonb_build_object('objective', 'resolution', 'regraded', true), p_actor, p_correlation)
     WHERE case_id = p_case RETURNING * INTO c;
  END IF;
  INSERT INTO service.case_notes (note_id, tenant_id, domain_id, case_id, author_principal_id, side, grant_id, kind, body, correlation_id)
  VALUES (gen_random_uuid(), p_tenant, p_domain, p_case, p_actor, CASE WHEN v_eng THEN 'support' ELSE 'customer' END, (v_gate ->> 'grant_id')::uuid, 'response', btrim(p_note), p_correlation);
  PERFORM service.sv_event(c, 'case.triaged', p_actor, jsonb_build_object('side', CASE WHEN v_eng THEN 'support' ELSE 'customer' END, 'grant_id', v_gate ->> 'grant_id',
                                                                         'regraded', v_regrade, 'severity', c.severity, 'response_met', c.responded_at <= c.response_due_at), p_correlation);
  RETURN jsonb_build_object('case', service.sv_case_json(p_case), 'grant_id', v_gate ->> 'grant_id');
END $$;
REVOKE ALL ON FUNCTION service.triage_case(uuid, uuid, uuid, int, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION service.triage_case(uuid, uuid, uuid, int, text, text, uuid, uuid) TO eye_commit;

/* NOTE (service.case.note): a customer role's note, or support's under a live grant (case.note — kind note | diagnosis). The first support
   note is a response (the response objective). A closed case takes no note (reopen it). */
CREATE OR REPLACE FUNCTION service.note_case(p_note uuid, p_case uuid, p_tenant uuid, p_domain uuid, p_kind text, p_body text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = service, executive, observation, onboarding, ctx, public, pg_catalog, pg_temp AS $$
DECLARE c service.cases%ROWTYPE; v_gate jsonb := '{}'::jsonb; v_eng boolean; v_now timestamptz := clock_timestamp();
BEGIN
  PERFORM observation.assert_authority(ARRAY['service.case.note']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM service.sv_assert_actor('service case', p_actor);
  v_eng := service.sv_is_engineer(p_actor, p_tenant, p_domain);
  IF v_eng THEN
    v_gate := service.sv_engineer_gate(p_tenant, p_domain, p_actor, p_case, 'case.note', NULL, 'service_case', 'service case', 'a support note', p_correlation);
    IF v_gate ? 'refused' THEN RETURN v_gate; END IF;
  ELSE
    PERFORM service.sv_assert_customer('service case', p_actor, p_tenant, p_domain, NULL, 'a case note');
  END IF;
  c := service.sv_case(p_tenant, p_domain, p_case, NULL, 'service case');
  IF c.state = 'closed' THEN RAISE EXCEPTION 'service case rejected (state): case % is closed — reopen it to continue', c.case_ref USING ERRCODE = '23505'; END IF;
  IF coalesce(p_kind, 'note') NOT IN ('note', 'diagnosis') THEN RAISE EXCEPTION 'service case rejected (kind): a note is a note or a diagnosis' USING ERRCODE = '22023'; END IF;
  IF p_kind = 'diagnosis' AND NOT v_eng THEN RAISE EXCEPTION 'service case rejected (kind): a diagnosis note is support''s (under a grant)' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_body, ''))) NOT BETWEEN 4 AND 4000 THEN RAISE EXCEPTION 'service case rejected (body): a note has 4–4000 characters' USING ERRCODE = '22023'; END IF;
  INSERT INTO service.case_notes (note_id, tenant_id, domain_id, case_id, author_principal_id, side, grant_id, kind, body, correlation_id)
  VALUES (p_note, p_tenant, p_domain, p_case, p_actor, CASE WHEN v_eng THEN 'support' ELSE 'customer' END, (v_gate ->> 'grant_id')::uuid, coalesce(p_kind, 'note'), btrim(p_body), p_correlation);
  IF v_eng AND c.responded_at IS NULL THEN
    UPDATE service.cases SET responded_at = v_now, updated_at = v_now WHERE case_id = p_case RETURNING * INTO c;
    PERFORM service.sv_cancel_timers(p_case, 'sla.response');
  ELSE
    UPDATE service.cases SET updated_at = v_now WHERE case_id = p_case;
  END IF;
  PERFORM service.sv_event(c, 'case.noted', p_actor, jsonb_build_object('note_id', p_note, 'kind', coalesce(p_kind, 'note'), 'side', CASE WHEN v_eng THEN 'support' ELSE 'customer' END,
                                                                       'grant_id', v_gate ->> 'grant_id'), p_correlation);
  RETURN jsonb_build_object('note', (SELECT to_jsonb(n) FROM service.case_notes n WHERE n.note_id = p_note), 'grant_id', v_gate ->> 'grant_id');
END $$;
REVOKE ALL ON FUNCTION service.note_case(uuid, uuid, uuid, uuid, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION service.note_case(uuid, uuid, uuid, uuid, text, text, uuid, uuid) TO eye_commit;

/* PROGRESS (service.case.progress): the domain admin, or support under a live grant (case.note). To:
     awaiting_access    ← open | triaged | diagnosing                  (support needs (more) access the customer must approve)
     diagnosing         ← triaged | awaiting_access | workaround_offered | degraded_guidance
     cannot_reproduce   ← triaged | awaiting_access | diagnosing        (what was tried — the customer confirms closure or reopens)
     degraded_guidance  ← triaged | awaiting_access | diagnosing | workaround_offered   (SAFE guidance: what to do meanwhile and what is NOT
                          recovered; the resolution clock keeps running — nothing is shown recovered by inference)
     resolved           ← triaged | diagnosing | workaround_offered | degraded_guidance  (the resolution; the resolution objective met or late;
                          the customer's `service.closure_confirm` task opened)
   The statement is required (12+ characters). */
CREATE OR REPLACE FUNCTION service.progress_case(p_case uuid, p_tenant uuid, p_domain uuid, p_expected int, p_to text, p_statement text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = service, executive, observation, onboarding, ctx, public, pg_catalog, pg_temp AS $$
DECLARE c service.cases%ROWTYPE; v_gate jsonb := '{}'::jsonb; v_eng boolean; v_now timestamptz := clock_timestamp(); v_from text[]; v_task jsonb := NULL; v_assignee uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['service.case.progress']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM service.sv_assert_actor('service case', p_actor);
  v_eng := service.sv_is_engineer(p_actor, p_tenant, p_domain);
  IF v_eng THEN
    v_gate := service.sv_engineer_gate(p_tenant, p_domain, p_actor, p_case, 'case.note', NULL, 'service_case', 'service case', format('moving a case to %s', coalesce(p_to, '?')), p_correlation);
    IF v_gate ? 'refused' THEN RETURN v_gate; END IF;
  ELSE
    PERFORM service.sv_assert_customer('service case', p_actor, p_tenant, p_domain, ARRAY['domain_admin'], 'progressing a case');
  END IF;
  c := service.sv_case(p_tenant, p_domain, p_case, p_expected, 'service case');
  v_from := CASE p_to WHEN 'awaiting_access' THEN ARRAY['open', 'triaged', 'diagnosing']
                      WHEN 'diagnosing' THEN ARRAY['triaged', 'awaiting_access', 'workaround_offered', 'degraded_guidance']
                      WHEN 'cannot_reproduce' THEN ARRAY['triaged', 'awaiting_access', 'diagnosing']
                      WHEN 'degraded_guidance' THEN ARRAY['triaged', 'awaiting_access', 'diagnosing', 'workaround_offered']
                      WHEN 'resolved' THEN ARRAY['triaged', 'diagnosing', 'workaround_offered', 'degraded_guidance'] END;
  IF v_from IS NULL THEN RAISE EXCEPTION 'service case rejected (to): a case progresses to awaiting_access, diagnosing, cannot_reproduce, degraded_guidance or resolved' USING ERRCODE = '22023'; END IF;
  IF NOT (c.state = ANY (v_from)) THEN
    RAISE EXCEPTION 'service case rejected (state): case % is % — % is reached from %', c.case_ref, c.state, p_to, array_to_string(v_from, ', ') USING ERRCODE = '23505';
  END IF;
  IF length(btrim(coalesce(p_statement, ''))) < 12 THEN
    RAISE EXCEPTION 'service case rejected (statement): % states %', p_to,
      CASE p_to WHEN 'degraded_guidance' THEN 'the safe guidance — what to do meanwhile and what is not recovered (12+ characters)'
                WHEN 'resolved' THEN 'the resolution (12+ characters)' WHEN 'cannot_reproduce' THEN 'what was tried (12+ characters)' ELSE 'why (12+ characters)' END USING ERRCODE = '22023';
  END IF;
  UPDATE service.cases SET state = p_to, version = version + 1, updated_at = v_now,
         responded_at = CASE WHEN v_eng THEN coalesce(responded_at, v_now) ELSE responded_at END,
         guidance = CASE WHEN p_to = 'degraded_guidance' THEN btrim(p_statement) ELSE guidance END,
         resolution = CASE WHEN p_to IN ('resolved', 'cannot_reproduce') THEN btrim(p_statement) ELSE resolution END,
         resolved_by = CASE WHEN p_to IN ('resolved', 'cannot_reproduce') THEN p_actor ELSE resolved_by END,
         resolved_at = CASE WHEN p_to IN ('resolved', 'cannot_reproduce') THEN v_now ELSE resolved_at END
   WHERE case_id = p_case RETURNING * INTO c;
  IF v_eng THEN PERFORM service.sv_cancel_timers(p_case, 'sla.response'); END IF;
  IF p_to IN ('resolved', 'cannot_reproduce') THEN
    PERFORM service.sv_cancel_timers(p_case, 'sla.resolution');
    v_assignee := CASE WHEN executive.task_holder_ok(c.opened_by, p_tenant, 'service.closure_confirm') AND NOT service.sv_is_engineer(c.opened_by, p_tenant, p_domain) THEN c.opened_by END;
    v_task := executive._open_human_task(gen_random_uuid(), p_tenant, p_domain, 'service.closure_confirm', format('service.closure_confirm:%s:%s', p_case, c.version),
                jsonb_build_object('kind', 'service_case', 'id', p_case), format('Confirm the closure of %s (%s) — or reopen it', c.case_ref, p_to), v_assignee,
                ARRAY['domain_admin'], jsonb_build_object('customer_roles', to_jsonb(service.sv_customer_roles())), NULL, '{}'::jsonb, NULL, NULL, p_actor, p_correlation);
  END IF;
  PERFORM service.sv_event(c, 'case.' || p_to, p_actor, jsonb_build_object('statement', btrim(p_statement), 'side', CASE WHEN v_eng THEN 'support' ELSE 'customer' END, 'grant_id', v_gate ->> 'grant_id',
                                                                          'resolution_met', CASE WHEN p_to IN ('resolved', 'cannot_reproduce') THEN v_now <= c.resolution_due_at END,
                                                                          'closure_task', v_task), p_correlation);
  RETURN jsonb_build_object('case', service.sv_case_json(p_case), 'grant_id', v_gate ->> 'grant_id', 'closure_task', v_task);
END $$;
REVOKE ALL ON FUNCTION service.progress_case(uuid, uuid, uuid, int, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION service.progress_case(uuid, uuid, uuid, int, text, text, uuid, uuid) TO eye_commit;

/* WORKAROUND PROPOSAL (service.case.workaround.propose): support under a live grant (case.workaround) or the domain admin. The workaround
   names the governed act the CUSTOMER performs ({action, object_type?, object_id?}) — never a service.* act, never one support performs.
   → workaround_offered. */
CREATE OR REPLACE FUNCTION service.propose_workaround(p_case uuid, p_tenant uuid, p_domain uuid, p_expected int, p_steps text, p_act jsonb, p_risk text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = service, executive, observation, onboarding, ctx, public, pg_catalog, pg_temp AS $$
DECLARE c service.cases%ROWTYPE; v_gate jsonb := '{}'::jsonb; v_eng boolean; v_now timestamptz := clock_timestamp(); v_w jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['service.case.workaround.propose']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM service.sv_assert_actor('service case', p_actor);
  v_eng := service.sv_is_engineer(p_actor, p_tenant, p_domain);
  IF v_eng THEN
    v_gate := service.sv_engineer_gate(p_tenant, p_domain, p_actor, p_case, 'case.workaround', NULL, 'service_case', 'service case', 'proposing a workaround', p_correlation);
    IF v_gate ? 'refused' THEN RETURN v_gate; END IF;
  ELSE
    PERFORM service.sv_assert_customer('service case', p_actor, p_tenant, p_domain, ARRAY['domain_admin'], 'proposing a workaround');
  END IF;
  c := service.sv_case(p_tenant, p_domain, p_case, p_expected, 'service case');
  IF c.state NOT IN ('triaged', 'awaiting_access', 'diagnosing', 'degraded_guidance') THEN
    RAISE EXCEPTION 'service case rejected (state): case % is % — a workaround is offered on a triaged, awaiting-access, diagnosing or degraded case', c.case_ref, c.state USING ERRCODE = '23505';
  END IF;
  IF length(btrim(coalesce(p_steps, ''))) < 12 THEN RAISE EXCEPTION 'service case rejected (workaround): a workaround states its steps (12+ characters)' USING ERRCODE = '22023'; END IF;
  IF jsonb_typeof(p_act) IS DISTINCT FROM 'object' OR coalesce(p_act ->> 'action', '') !~ '^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$' THEN
    RAISE EXCEPTION 'service case rejected (act): a workaround names the governed act the customer performs ({action, object_type?, object_id?})' USING ERRCODE = '22023';
  END IF;
  IF p_act ->> 'action' LIKE 'service.%' OR p_act ->> 'action' LIKE 'support.%' THEN
    RAISE EXCEPTION 'service case rejected (act): a workaround is the customer''s own governed act on their domain — never a service or support act' USING ERRCODE = '22023';
  END IF;
  v_w := jsonb_build_object('steps', btrim(p_steps), 'act', jsonb_build_object('action', p_act ->> 'action', 'object_type', p_act ->> 'object_type', 'object_id', p_act ->> 'object_id'),
                            'risk', nullif(btrim(coalesce(p_risk, '')), ''), 'proposed_by', p_actor, 'side', CASE WHEN v_eng THEN 'support' ELSE 'customer' END,
                            'grant_id', v_gate ->> 'grant_id', 'proposed_at', v_now, 'source', 'proposal', 'executor', 'the customer''s own role');
  UPDATE service.cases SET state = 'workaround_offered', workaround = v_w, workaround_executed = NULL, version = version + 1, updated_at = v_now,
         responded_at = CASE WHEN v_eng THEN coalesce(responded_at, v_now) ELSE responded_at END
   WHERE case_id = p_case RETURNING * INTO c;
  IF v_eng THEN PERFORM service.sv_cancel_timers(p_case, 'sla.response'); END IF;
  PERFORM service.sv_event(c, 'case.workaround_offered', p_actor, jsonb_build_object('workaround', v_w), p_correlation);
  RETURN jsonb_build_object('case', service.sv_case_json(p_case), 'grant_id', v_gate ->> 'grant_id');
END $$;
REVOKE ALL ON FUNCTION service.propose_workaround(uuid, uuid, uuid, int, text, jsonb, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION service.propose_workaround(uuid, uuid, uuid, int, text, jsonb, text, uuid, uuid) TO eye_commit;

/* WORKAROUND EXECUTED (service.case.workaround.execute): the CUSTOMER's case act linking the governed act they performed — a policy decision
   of this domain, ALLOWED, made for the acting customer AFTER the workaround was offered, of the act the workaround names (when it names
   one) and never a service/support act. A support engineer never records it (403 actor). The case stays workaround_offered (resolution is
   a separate act). */
CREATE OR REPLACE FUNCTION service.record_workaround_execution(p_case uuid, p_tenant uuid, p_domain uuid, p_expected int, p_policy_decision uuid, p_note text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = service, policy, observation, onboarding, ctx, public, pg_catalog, pg_temp AS $$
DECLARE c service.cases%ROWTYPE; d policy.policy_decisions%ROWTYPE; v_now timestamptz := clock_timestamp(); v_x jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['service.case.workaround.execute']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM service.sv_assert_actor('service case', p_actor);
  PERFORM service.sv_assert_customer('service case', p_actor, p_tenant, p_domain, NULL, 'executing a workaround');
  c := service.sv_case(p_tenant, p_domain, p_case, p_expected, 'service case');
  IF c.state <> 'workaround_offered' OR c.workaround IS NULL THEN
    RAISE EXCEPTION 'service case rejected (state): case % is % — no workaround is on offer', c.case_ref, c.state USING ERRCODE = '23505';
  END IF;
  SELECT * INTO d FROM policy.policy_decisions x WHERE x.id = p_policy_decision;
  IF NOT FOUND OR d.tenant_id IS DISTINCT FROM p_tenant OR d.domain_id IS DISTINCT FROM p_domain THEN
    RAISE EXCEPTION 'service case rejected (unknown_decision): % is not a policy decision of this domain', p_policy_decision USING ERRCODE = '23503';
  END IF;
  IF d.decision NOT IN ('allow', 'allow_with_obligations') THEN
    RAISE EXCEPTION 'service case rejected (act): decision % was %, not an allowed act', p_policy_decision, d.decision USING ERRCODE = '22023';
  END IF;
  IF d.principal_id <> 'principal:' || p_actor::text THEN
    RAISE EXCEPTION 'service case rejected (ownership): the linked act was performed by another principal — the customer who performed it records its execution' USING ERRCODE = '42501';
  END IF;
  IF d.action LIKE 'service.%' OR d.action LIKE 'support.%' OR d.action LIKE '%.read' THEN
    RAISE EXCEPTION 'service case rejected (act): % is not a workaround act on the customer''s domain', d.action USING ERRCODE = '22023';
  END IF;
  IF d.created_at < (c.workaround ->> 'proposed_at')::timestamptz THEN
    RAISE EXCEPTION 'service case rejected (act): the linked act preceded the workaround''s offer' USING ERRCODE = '22023';
  END IF;
  IF coalesce(c.workaround -> 'act' ->> 'action', '') <> '' AND d.action <> c.workaround -> 'act' ->> 'action' THEN
    RAISE EXCEPTION 'service case rejected (act): the workaround names %, the linked act is %', c.workaround -> 'act' ->> 'action', d.action USING ERRCODE = '22023';
  END IF;
  v_x := jsonb_build_object('policy_decision_id', d.id, 'action', d.action, 'object_type', d.object_type, 'object_id', d.object_id, 'decided_at', d.created_at,
                            'executed_by', p_actor, 'recorded_at', v_now, 'note', nullif(btrim(coalesce(p_note, '')), ''));
  UPDATE service.cases SET workaround_executed = v_x, version = version + 1, updated_at = v_now WHERE case_id = p_case RETURNING * INTO c;
  PERFORM service.sv_event(c, 'case.workaround_executed', p_actor, jsonb_build_object('executed', v_x), p_correlation);
  RETURN jsonb_build_object('case', service.sv_case_json(p_case));
END $$;
REVOKE ALL ON FUNCTION service.record_workaround_execution(uuid, uuid, uuid, int, uuid, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION service.record_workaround_execution(uuid, uuid, uuid, int, uuid, text, uuid, uuid) TO eye_commit;

/* KNOWN-ERROR REUSE (service.case.known_error.reuse): support under a live grant (case.workaround) or the domain admin offers a PUBLISHED known
   error's workaround on a new case: the reuse recorded, the case linked to the known error's problem, → workaround_offered. */
CREATE OR REPLACE FUNCTION service.reuse_known_error(p_case uuid, p_tenant uuid, p_domain uuid, p_expected int, p_known_error uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = service, executive, observation, onboarding, ctx, public, pg_catalog, pg_temp AS $$
DECLARE c service.cases%ROWTYPE; k service.known_errors%ROWTYPE; v_gate jsonb := '{}'::jsonb; v_eng boolean; v_now timestamptz := clock_timestamp(); v_w jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['service.case.known_error.reuse']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM service.sv_assert_actor('known error', p_actor);
  v_eng := service.sv_is_engineer(p_actor, p_tenant, p_domain);
  IF v_eng THEN
    v_gate := service.sv_engineer_gate(p_tenant, p_domain, p_actor, p_case, 'case.workaround', NULL, 'service_case', 'known error', 'reusing a known error', p_correlation);
    IF v_gate ? 'refused' THEN RETURN v_gate; END IF;
  ELSE
    PERFORM service.sv_assert_customer('known error', p_actor, p_tenant, p_domain, ARRAY['domain_admin'], 'reusing a known error');
  END IF;
  c := service.sv_case(p_tenant, p_domain, p_case, p_expected, 'known error');
  SELECT * INTO k FROM service.known_errors x WHERE x.known_error_id = p_known_error AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'known error rejected (unknown_known_error): % is not a known error of this domain', p_known_error USING ERRCODE = '23503'; END IF;
  IF k.state <> 'published' THEN RAISE EXCEPTION 'known error rejected (state): % is %', k.ke_ref, k.state USING ERRCODE = '23505'; END IF;
  IF c.state NOT IN ('open', 'triaged', 'awaiting_access', 'diagnosing', 'degraded_guidance') THEN
    RAISE EXCEPTION 'known error rejected (state): case % is % — a known error is reused on an open, triaged, awaiting-access, diagnosing or degraded case', c.case_ref, c.state USING ERRCODE = '23505';
  END IF;
  IF EXISTS (SELECT 1 FROM service.known_error_uses u WHERE u.known_error_id = p_known_error AND u.case_id = p_case) THEN
    RAISE EXCEPTION 'known error rejected (duplicate): % is already reused on case %', k.ke_ref, c.case_ref USING ERRCODE = '23505';
  END IF;
  INSERT INTO service.known_error_uses (use_id, tenant_id, domain_id, known_error_id, case_id, used_by, side, grant_id, correlation_id)
  VALUES (gen_random_uuid(), p_tenant, p_domain, p_known_error, p_case, p_actor, CASE WHEN v_eng THEN 'support' ELSE 'customer' END, (v_gate ->> 'grant_id')::uuid, p_correlation);
  IF NOT EXISTS (SELECT 1 FROM service.problem_cases pc WHERE pc.problem_id = k.problem_id AND pc.case_id = p_case) THEN
    INSERT INTO service.problem_cases (problem_id, case_id, tenant_id, domain_id, linked_by, reason)
    VALUES (k.problem_id, p_case, p_tenant, p_domain, p_actor, format('linked by the reuse of known error %s', k.ke_ref));
  END IF;
  v_w := jsonb_build_object('steps', k.workaround, 'act', k.workaround_act, 'risk', NULL, 'proposed_by', p_actor, 'side', CASE WHEN v_eng THEN 'support' ELSE 'customer' END,
                            'grant_id', v_gate ->> 'grant_id', 'proposed_at', v_now, 'source', 'known_error', 'known_error_id', k.known_error_id, 'ke_ref', k.ke_ref, 'ke_digest', k.digest,
                            'executor', 'the customer''s own role');
  UPDATE service.cases SET state = 'workaround_offered', workaround = v_w, workaround_executed = NULL, known_error_id = k.known_error_id, problem_id = coalesce(problem_id, k.problem_id),
         version = version + 1, updated_at = v_now, responded_at = coalesce(responded_at, v_now)
   WHERE case_id = p_case RETURNING * INTO c;
  PERFORM service.sv_cancel_timers(p_case, 'sla.response');
  PERFORM service.sv_event(c, 'case.known_error_reused', p_actor, jsonb_build_object('known_error_id', k.known_error_id, 'ke_ref', k.ke_ref, 'problem_id', k.problem_id, 'workaround', v_w), p_correlation);
  PERFORM onboarding.ledger('service', p_tenant, p_domain, 'known_error', k.known_error_id, NULL, 'known_error.reused', p_actor,
                            jsonb_build_object('ke_ref', k.ke_ref, 'case_id', p_case, 'case_ref', c.case_ref), p_correlation);
  RETURN jsonb_build_object('case', service.sv_case_json(p_case), 'known_error', to_jsonb(k), 'grant_id', v_gate ->> 'grant_id');
END $$;
REVOKE ALL ON FUNCTION service.reuse_known_error(uuid, uuid, uuid, int, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION service.reuse_known_error(uuid, uuid, uuid, int, uuid, uuid, uuid) TO eye_commit;

/* THE BUNDLE'S ITEMS (internal): the records under the case's scope — the case's facts, its customer and support notes, and for each source
   it names: the contract's state (person fields and endpoints / credential references REDACTED; a restricted source's name and publisher
   REDACTED), its recent runs (failure reasons with any URL query REDACTED), its health events; the EVIDENCE CONTENT of a source is ALWAYS
   WITHHELD (the customer's data — shared through the customer's own governed export). For support, a source outside the grant's object
   scope is WITHHELD with that reason (and logged by the caller). */
CREATE OR REPLACE FUNCTION service.sv_bundle_items(c service.cases, p_engineer uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = service, observation, pg_catalog, pg_temp AS $$
DECLARE v jsonb := '[]'::jsonb; o jsonb; s observation.source_contracts_current%ROWTYPE; v_in boolean; v_src uuid; v_runs jsonb; v_health jsonb; v_restricted boolean;
BEGIN
  v := v || jsonb_build_array(jsonb_build_object('kind', 'case', 'id', c.case_id, 'disposition', 'included',
           'content', jsonb_build_object('case_ref', c.case_ref, 'title', c.title, 'severity', c.severity, 'capability', c.affected_capability, 'state', c.state, 'version', c.version,
                                         'description', c.description, 'routing_tier', c.routing ->> 'tier', 'opened_at', c.opened_at, 'objects', c.object_refs)));
  v := v || jsonb_build_array(jsonb_build_object('kind', 'notes', 'id', c.case_id, 'disposition', 'included',
           'content', coalesce((SELECT jsonb_agg(jsonb_build_object('side', n.side, 'kind', n.kind, 'body', n.body, 'at', n.at) ORDER BY n.at) FROM service.case_notes n WHERE n.case_id = c.case_id), '[]'::jsonb),
           'redactions', jsonb_build_array('note authors are shown by side, never by person')));
  FOR o IN SELECT * FROM jsonb_array_elements(c.object_refs) LOOP
    v_src := CASE WHEN o ->> 'kind' = 'source' THEN (o ->> 'id')::uuid
                  ELSE (SELECT r.source_id FROM observation.collection_runs_current r WHERE r.run_id = (o ->> 'id')::uuid) END;
    v_in := p_engineer IS NULL OR service.live_grant(c.tenant_id, c.domain_id, p_engineer, c.case_id, 'case.bundle', v_src) IS NOT NULL;
    IF NOT v_in THEN
      v := v || jsonb_build_array(jsonb_build_object('kind', o ->> 'kind', 'id', o ->> 'id', 'disposition', 'withheld',
                 'reason', 'outside the support grant''s object scope — the grant names the sources support may see'));
      PERFORM service.log_access(c.tenant_id, c.domain_id, NULL, p_engineer, 'case.bundle', o ->> 'kind', o ->> 'id', 'refused',
                                 jsonb_build_object('what', 'a bundle item outside the grant''s object scope', 'case', c.case_ref), p_correlation);
      CONTINUE;
    END IF;
    SELECT * INTO s FROM observation.source_contracts_current x WHERE x.source_id = v_src ORDER BY x.contract_version DESC LIMIT 1;
    IF s.source_id IS NULL THEN
      v := v || jsonb_build_array(jsonb_build_object('kind', o ->> 'kind', 'id', o ->> 'id', 'disposition', 'withheld', 'reason', 'the record no longer exists in this domain'));
      CONTINUE;
    END IF;
    v_restricted := s.classification_ceiling = 'restricted';
    v := v || jsonb_build_array(jsonb_build_object('kind', 'source.contract', 'id', s.source_id, 'disposition', 'redacted',
             'content', jsonb_build_object('source_key', s.source_key, 'name', CASE WHEN v_restricted THEN '[redacted: restricted classification]' ELSE s.name END,
                                           'publisher', CASE WHEN v_restricted THEN '[redacted: restricted classification]' ELSE s.publisher END,
                                           'contract_version', s.contract_version, 'lifecycle_state', s.lifecycle_state, 'rights_state', s.rights_state, 'connector_kind', s.connector_kind,
                                           'acquisition_mode', s.acquisition_mode, 'data_origin', s.data_origin, 'cadence_seconds', s.cadence_seconds,
                                           'freshness_threshold_seconds', s.freshness_threshold_seconds, 'classification_ceiling', s.classification_ceiling),
             'redactions', jsonb_build_array('registrar and approver (persons) are never bundled', 'endpoints and credential references are never bundled')
                           || CASE WHEN v_restricted THEN jsonb_build_array('name and publisher: restricted classification') ELSE '[]'::jsonb END));
    SELECT coalesce(jsonb_agg(jsonb_build_object('run_id', r.run_id, 'state', r.state, 'started_at', r.started_at, 'finished_at', r.finished_at, 'items_fetched', r.items_fetched,
                                                 'items_admitted', r.items_admitted, 'items_quarantined', r.items_quarantined,
                                                 'failure_reason', regexp_replace(r.failure_reason, '\?[^\s]*', '?[redacted]', 'g')) ORDER BY r.started_at DESC), '[]'::jsonb)
      INTO v_runs FROM (SELECT * FROM observation.collection_runs_current r WHERE r.source_id = s.source_id ORDER BY r.started_at DESC LIMIT 10) r;
    v := v || jsonb_build_array(jsonb_build_object('kind', 'source.runs', 'id', s.source_id, 'disposition', 'redacted', 'content', v_runs,
             'redactions', jsonb_build_array('URL query strings in failure reasons are redacted', 'the agent principals are never bundled')));
    SELECT coalesce(jsonb_agg(jsonb_build_object('state', h.new_state, 'prior', h.prior_state, 'lag_class', h.lag_class, 'reason', h.reason, 'evaluated_at', h.evaluated_at) ORDER BY h.evaluated_at DESC), '[]'::jsonb)
      INTO v_health FROM (SELECT * FROM observation.source_health_events h WHERE h.source_id = s.source_id ORDER BY h.evaluated_at DESC LIMIT 10) h;
    v := v || jsonb_build_array(jsonb_build_object('kind', 'source.health', 'id', s.source_id, 'disposition', 'included', 'content', v_health));
    v := v || jsonb_build_array(jsonb_build_object('kind', 'source.evidence', 'id', s.source_id, 'disposition', 'withheld',
             'reason', 'evidence content is the customer''s data — never in a support bundle (the customer shares it through their own governed export)'));
  END LOOP;
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION service.sv_bundle_items(service.cases, uuid, uuid) FROM PUBLIC;

/* THE EVIDENCE BUNDLE (service.case.bundle): support under a live grant (case.bundle — the object scope decides which sources), or the
   domain admin / a data steward (the case's whole scope). Digested; the counts say what was included, redacted and withheld. */
CREATE OR REPLACE FUNCTION service.assemble_bundle(p_bundle uuid, p_case uuid, p_tenant uuid, p_domain uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = service, executive, observation, onboarding, ctx, public, pg_catalog, pg_temp AS $$
DECLARE c service.cases%ROWTYPE; v_gate jsonb := '{}'::jsonb; v_eng boolean; v_items jsonb; v_counts jsonb; v_digest text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['service.case.bundle']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM service.sv_assert_actor('evidence bundle', p_actor);
  v_eng := service.sv_is_engineer(p_actor, p_tenant, p_domain);
  IF v_eng THEN
    v_gate := service.sv_engineer_gate(p_tenant, p_domain, p_actor, p_case, 'case.bundle', NULL, 'service_case', 'evidence bundle', 'assembling an evidence bundle', p_correlation);
    IF v_gate ? 'refused' THEN RETURN v_gate; END IF;
  ELSE
    PERFORM service.sv_assert_customer('evidence bundle', p_actor, p_tenant, p_domain, ARRAY['domain_admin', 'data_steward'], 'assembling an evidence bundle');
  END IF;
  c := service.sv_case(p_tenant, p_domain, p_case, NULL, 'evidence bundle');
  IF c.state = 'closed' THEN RAISE EXCEPTION 'evidence bundle rejected (state): case % is closed', c.case_ref USING ERRCODE = '23505'; END IF;
  v_items := service.sv_bundle_items(c, CASE WHEN v_eng THEN p_actor END, p_correlation);
  SELECT jsonb_build_object('included', count(*) FILTER (WHERE e ->> 'disposition' = 'included'), 'redacted', count(*) FILTER (WHERE e ->> 'disposition' = 'redacted'),
                            'withheld', count(*) FILTER (WHERE e ->> 'disposition' = 'withheld'), 'items', count(*))
    INTO v_counts FROM jsonb_array_elements(v_items) e;
  v_digest := onboarding.digest(jsonb_build_object('case_id', p_case, 'case_version', c.version, 'items', v_items));
  INSERT INTO service.evidence_bundles (bundle_id, tenant_id, domain_id, case_id, case_version, assembled_by, side, grant_id, items, counts, digest, correlation_id)
  VALUES (p_bundle, p_tenant, p_domain, p_case, c.version, p_actor, CASE WHEN v_eng THEN 'support' ELSE 'customer' END, (v_gate ->> 'grant_id')::uuid, v_items, v_counts, v_digest, p_correlation);
  PERFORM service.sv_event(c, 'case.bundle_assembled', p_actor, jsonb_build_object('bundle_id', p_bundle, 'digest', v_digest, 'counts', v_counts, 'grant_id', v_gate ->> 'grant_id'), p_correlation);
  RETURN jsonb_build_object('bundle', (SELECT to_jsonb(b) FROM service.evidence_bundles b WHERE b.bundle_id = p_bundle), 'grant_id', v_gate ->> 'grant_id');
END $$;
REVOKE ALL ON FUNCTION service.assemble_bundle(uuid, uuid, uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION service.assemble_bundle(uuid, uuid, uuid, uuid, uuid, uuid) TO eye_commit;

/* CLOSURE (service.case.close, human-gated): the CUSTOMER's confirmation — a named human holding a customer role, never support. From
   resolved (outcome resolved) or cannot_reproduce (outcome not_reproduced); refused while a commitment is open. The closure task resolved,
   the case's routed items closed, any pending SLA timer cancelled. */
CREATE OR REPLACE FUNCTION service.confirm_closure(p_case uuid, p_tenant uuid, p_domain uuid, p_expected int, p_outcome text, p_note text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = service, executive, observation, onboarding, ctx, public, pg_catalog, pg_temp AS $$
DECLARE c service.cases%ROWTYPE; v_now timestamptz := clock_timestamp(); v_open text; v_task jsonb; v_items jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['service.case.close']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM service.sv_assert_actor('service case', p_actor);
  PERFORM service.sv_assert_customer('service case', p_actor, p_tenant, p_domain, NULL, 'confirming a closure');
  c := service.sv_case(p_tenant, p_domain, p_case, p_expected, 'service case');
  IF NOT ((c.state = 'resolved' AND p_outcome = 'resolved') OR (c.state = 'cannot_reproduce' AND p_outcome = 'not_reproduced')) THEN
    RAISE EXCEPTION 'service case rejected (state): case % is % — closure confirms a resolved case (outcome resolved) or a case support could not reproduce (outcome not_reproduced)', c.case_ref, c.state
      USING ERRCODE = '23505';
  END IF;
  IF length(btrim(coalesce(p_note, ''))) < 8 THEN RAISE EXCEPTION 'service case rejected (note): the customer states what they verified (8+ characters)' USING ERRCODE = '22023'; END IF;
  SELECT string_agg(format('%s (%s, due %s)', m.kind, m.state, m.due_at), '; ') INTO v_open FROM service.commitments m WHERE m.case_id = p_case AND m.state IN ('open', 'breached');
  IF v_open IS NOT NULL THEN
    RAISE EXCEPTION 'service case rejected (state): case % has unsettled commitments — %; settle or withdraw them first', c.case_ref, v_open USING ERRCODE = '23505';
  END IF;
  UPDATE service.cases SET state = 'closed', closed_at = v_now, closed_by = p_actor, version = version + 1, updated_at = v_now,
         closure = jsonb_build_object('outcome', p_outcome, 'note', btrim(p_note), 'confirmed_by', p_actor, 'confirmed_at', v_now, 'confirmation', 'the customer''s',
                                      'resolution_met', c.resolved_at <= c.resolution_due_at)
   WHERE case_id = p_case RETURNING * INTO c;
  PERFORM service.sv_cancel_timers(p_case, NULL);
  v_task := executive._resolve_human_tasks(p_tenant, p_domain, jsonb_build_object('kind', 'service_case', 'id', p_case), ARRAY['service.closure_confirm'], 'confirmed', p_case, p_actor, p_correlation);
  v_items := executive.b33_close_items(p_tenant, p_domain, 'service.case', 'service_case', p_case, format('case %s closed — the customer confirmed (%s)', c.case_ref, p_outcome), p_actor, p_correlation);
  PERFORM service.sv_event(c, 'case.closed', p_actor, jsonb_build_object('outcome', p_outcome, 'note', btrim(p_note), 'tasks', v_task, 'items_closed', v_items), p_correlation);
  RETURN jsonb_build_object('case', service.sv_case_json(p_case), 'tasks', v_task, 'items_closed', v_items);
END $$;
REVOKE ALL ON FUNCTION service.confirm_closure(uuid, uuid, uuid, int, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION service.confirm_closure(uuid, uuid, uuid, int, text, text, uuid, uuid) TO eye_commit;

/* REOPEN ON REGRESSION (service.case.reopen): a customer role, with the regression stated. resolved | cannot_reproduce | closed → triaged;
   the reopen counted; the resolution objective restarts from now (a new sla.resolution timer); the open closure task cancelled; a
   `service.case` item raised for the regression. */
CREATE OR REPLACE FUNCTION service.reopen_case(p_case uuid, p_tenant uuid, p_domain uuid, p_expected int, p_regression text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = service, executive, observation, onboarding, ctx, public, pg_catalog, pg_temp AS $$
DECLARE c service.cases%ROWTYPE; v_now timestamptz := clock_timestamp(); v_ev uuid; v_item jsonb; v_prior text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['service.case.reopen']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM service.sv_assert_actor('service case', p_actor);
  PERFORM service.sv_assert_customer('service case', p_actor, p_tenant, p_domain, NULL, 'reopening a case');
  c := service.sv_case(p_tenant, p_domain, p_case, p_expected, 'service case');
  IF c.state NOT IN ('resolved', 'cannot_reproduce', 'closed') THEN
    RAISE EXCEPTION 'service case rejected (state): case % is % — a resolved, unreproduced or closed case is reopened', c.case_ref, c.state USING ERRCODE = '23505';
  END IF;
  IF length(btrim(coalesce(p_regression, ''))) < 12 THEN RAISE EXCEPTION 'service case rejected (regression): a reopening states the regression (12+ characters)' USING ERRCODE = '22023'; END IF;
  v_prior := c.state;
  UPDATE service.cases SET state = 'triaged', closed_at = NULL, closed_by = NULL, resolved_at = NULL, resolved_by = NULL, reopen_count = reopen_count + 1, version = version + 1,
         updated_at = v_now, resolution_breached_at = NULL,
         resolution_due_at = v_now + make_interval(mins => (routing -> 'objectives' ->> 'resolution_minutes')::int),
         closure = CASE WHEN closure IS NULL THEN NULL ELSE closure || jsonb_build_object('reopened_at', v_now) END
   WHERE case_id = p_case RETURNING * INTO c;
  PERFORM service.sv_cancel_timers(p_case, 'sla.resolution');
  UPDATE service.cases SET resolution_timer_id = service.sv_schedule(c, 'sla.resolution', c.resolution_due_at, jsonb_build_object('objective', 'resolution', 'reopen', c.reopen_count), p_actor, p_correlation)
   WHERE case_id = p_case RETURNING * INTO c;
  PERFORM executive._cancel_human_tasks(p_tenant, p_domain, jsonb_build_object('kind', 'service_case', 'id', p_case), ARRAY['service.closure_confirm'],
                                        'the case was reopened on a regression', p_actor, p_correlation);
  v_ev := service.sv_event(c, 'case.reopened', p_actor, jsonb_build_object('regression', btrim(p_regression), 'from', v_prior, 'reopen_count', c.reopen_count,
                                                                          'resolution_due_at', c.resolution_due_at), p_correlation);
  v_item := executive.b33_raise_routed(p_tenant, p_domain, 'service.case', 'service_case', p_case,
              format('Case %s reopened on a regression (%s): %s', c.case_ref, c.severity, left(btrim(p_regression), 120)),
              jsonb_build_array(jsonb_build_object('kind', 'case.reopened', 'severity', c.severity, 'reopen_count', c.reopen_count)), NULL, v_ev, 'case.reopened',
              jsonb_build_object('case_ref', c.case_ref), service.sv_dims(c.severity), p_actor, p_correlation);
  RETURN jsonb_build_object('case', service.sv_case_json(p_case), 'item', v_item);
END $$;
REVOKE ALL ON FUNCTION service.reopen_case(uuid, uuid, uuid, int, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION service.reopen_case(uuid, uuid, uuid, int, text, uuid, uuid) TO eye_commit;

/* THE ENGINEER'S CASE READ (service.case.support_read): the case as support may see it — under a live grant (case.note), LOGGED; refused
   and logged without one (answered, not raised: the read's transaction commits the log). Customer notes included (written for support);
   persons shown by side. */
CREATE OR REPLACE FUNCTION service.support_read_case(p_case uuid, p_tenant uuid, p_domain uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = service, observation, onboarding, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_gate jsonb; c service.cases%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['service.case.support_read']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM service.sv_assert_actor('support access', p_actor);
  IF NOT service.sv_is_engineer(p_actor, p_tenant, p_domain) THEN
    RAISE EXCEPTION 'support access rejected (authority): the support read is a support engineer''s (customers read the case through service.read)' USING ERRCODE = '42501';
  END IF;
  v_gate := service.sv_engineer_gate(p_tenant, p_domain, p_actor, p_case, 'case.note', NULL, 'service_case', 'support access', 'reading a case', p_correlation);
  IF v_gate ? 'refused' THEN RETURN v_gate; END IF;
  SELECT * INTO c FROM service.cases x WHERE x.case_id = p_case AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  RETURN jsonb_build_object('grant_id', v_gate ->> 'grant_id',
    'case', jsonb_build_object('case_id', c.case_id, 'case_ref', c.case_ref, 'title', c.title, 'severity', c.severity, 'affected_capability', c.affected_capability,
                               'object_refs', c.object_refs, 'description', c.description, 'state', c.state, 'version', c.version, 'routing', c.routing,
                               'response_due_at', c.response_due_at, 'resolution_due_at', c.resolution_due_at, 'workaround', c.workaround, 'guidance', c.guidance, 'resolution', c.resolution),
    'notes', coalesce((SELECT jsonb_agg(jsonb_build_object('side', n.side, 'kind', n.kind, 'body', n.body, 'at', n.at) ORDER BY n.at) FROM service.case_notes n WHERE n.case_id = p_case), '[]'::jsonb),
    'commitments', coalesce((SELECT jsonb_agg(jsonb_build_object('commitment_id', m.commitment_id, 'kind', m.kind, 'statement', m.statement, 'due_at', m.due_at, 'state', m.state) ORDER BY m.due_at)
                             FROM service.commitments m WHERE m.case_id = p_case), '[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION service.support_read_case(uuid, uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION service.support_read_case(uuid, uuid, uuid, uuid, uuid) TO eye_commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §SV.5 COMMITMENTS
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
/* RECORD (service.commitment.record): support under a live grant (case.note) or the domain admin; on a case not closed; due within 90 days. */
CREATE OR REPLACE FUNCTION service.record_commitment(p_commitment uuid, p_case uuid, p_tenant uuid, p_domain uuid, p_kind text, p_statement text, p_due timestamptz, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = service, observation, onboarding, ctx, public, pg_catalog, pg_temp AS $$
DECLARE c service.cases%ROWTYPE; v_gate jsonb := '{}'::jsonb; v_eng boolean;
BEGIN
  PERFORM observation.assert_authority(ARRAY['service.commitment.record']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM service.sv_assert_actor('service commitment', p_actor);
  v_eng := service.sv_is_engineer(p_actor, p_tenant, p_domain);
  IF v_eng THEN
    v_gate := service.sv_engineer_gate(p_tenant, p_domain, p_actor, p_case, 'case.note', NULL, 'service_case', 'service commitment', 'recording a commitment', p_correlation);
    IF v_gate ? 'refused' THEN RETURN v_gate; END IF;
  ELSE
    PERFORM service.sv_assert_customer('service commitment', p_actor, p_tenant, p_domain, ARRAY['domain_admin'], 'recording a commitment');
  END IF;
  c := service.sv_case(p_tenant, p_domain, p_case, NULL, 'service commitment');
  IF c.state = 'closed' THEN RAISE EXCEPTION 'service commitment rejected (state): case % is closed', c.case_ref USING ERRCODE = '23505'; END IF;
  IF coalesce(p_kind, '') NOT IN ('update', 'workaround', 'fix', 'review', 'other') THEN
    RAISE EXCEPTION 'service commitment rejected (kind): a commitment is an update, a workaround, a fix, a review or other' USING ERRCODE = '22023';
  END IF;
  IF length(btrim(coalesce(p_statement, ''))) < 8 THEN RAISE EXCEPTION 'service commitment rejected (statement): a commitment states what is committed (8+ characters)' USING ERRCODE = '22023'; END IF;
  IF p_due IS NULL OR p_due <= clock_timestamp() OR p_due > clock_timestamp() + interval '90 days' THEN
    RAISE EXCEPTION 'service commitment rejected (due): a commitment is due in the future, within 90 days' USING ERRCODE = '22023';
  END IF;
  INSERT INTO service.commitments (commitment_id, tenant_id, domain_id, case_id, kind, statement, due_at, made_by, side, grant_id, correlation_id)
  VALUES (p_commitment, p_tenant, p_domain, p_case, p_kind, btrim(p_statement), p_due, p_actor, CASE WHEN v_eng THEN 'support' ELSE 'customer' END, (v_gate ->> 'grant_id')::uuid, p_correlation);
  PERFORM onboarding.ledger('service', p_tenant, p_domain, 'commitment', p_commitment, NULL, 'commitment.recorded', p_actor,
                            jsonb_build_object('case_id', p_case, 'case_ref', c.case_ref, 'kind', p_kind, 'due_at', p_due, 'grant_id', v_gate ->> 'grant_id'), p_correlation);
  RETURN jsonb_build_object('commitment', (SELECT to_jsonb(m) FROM service.commitments m WHERE m.commitment_id = p_commitment), 'grant_id', v_gate ->> 'grant_id');
END $$;
REVOKE ALL ON FUNCTION service.record_commitment(uuid, uuid, uuid, uuid, text, text, timestamptz, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION service.record_commitment(uuid, uuid, uuid, uuid, text, text, timestamptz, uuid, uuid) TO eye_commit;

/* SETTLE (service.commitment.settle): met (late when after its due instant or already breached) | withdrawn (with the reason) — support
   under a live grant for the commitment's case (case.note) or the domain admin. */
CREATE OR REPLACE FUNCTION service.settle_commitment(p_commitment uuid, p_tenant uuid, p_domain uuid, p_outcome text, p_note text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = service, executive, observation, onboarding, ctx, public, pg_catalog, pg_temp AS $$
DECLARE m service.commitments%ROWTYPE; v_gate jsonb := '{}'::jsonb; v_eng boolean; v_now timestamptz := clock_timestamp(); v_late boolean;
BEGIN
  PERFORM observation.assert_authority(ARRAY['service.commitment.settle']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM service.sv_assert_actor('service commitment', p_actor);
  SELECT * INTO m FROM service.commitments x WHERE x.commitment_id = p_commitment AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'service commitment rejected (unknown_commitment): % is not a commitment of this domain', p_commitment USING ERRCODE = '23503'; END IF;
  v_eng := service.sv_is_engineer(p_actor, p_tenant, p_domain);
  IF v_eng THEN
    v_gate := service.sv_engineer_gate(p_tenant, p_domain, p_actor, m.case_id, 'case.note', NULL, 'service_case', 'service commitment', 'settling a commitment', p_correlation);
    IF v_gate ? 'refused' THEN RETURN v_gate; END IF;
  ELSE
    PERFORM service.sv_assert_customer('service commitment', p_actor, p_tenant, p_domain, ARRAY['domain_admin'], 'settling a commitment');
  END IF;
  IF m.state NOT IN ('open', 'breached') THEN RAISE EXCEPTION 'service commitment rejected (state): the commitment is %', m.state USING ERRCODE = '23505'; END IF;
  IF coalesce(p_outcome, '') NOT IN ('met', 'withdrawn') THEN RAISE EXCEPTION 'service commitment rejected (outcome): a commitment is settled met or withdrawn' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_note, ''))) < 8 THEN RAISE EXCEPTION 'service commitment rejected (note): a settlement states its evidence or reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  v_late := p_outcome = 'met' AND (m.state = 'breached' OR v_now > m.due_at);
  UPDATE service.commitments SET state = p_outcome, settled_by = p_actor, settled_at = v_now, settle_note = btrim(p_note), late = v_late WHERE commitment_id = p_commitment RETURNING * INTO m;
  PERFORM onboarding.ledger('service', p_tenant, p_domain, 'commitment', p_commitment, NULL, 'commitment.' || p_outcome, p_actor,
                            jsonb_build_object('case_id', m.case_id, 'late', v_late, 'note', btrim(p_note), 'grant_id', v_gate ->> 'grant_id'), p_correlation);
  -- a breach item stays for the service owner to acknowledge (the case's closure closes it); the settlement is on the ledger
  RETURN jsonb_build_object('commitment', to_jsonb(m), 'grant_id', v_gate ->> 'grant_id');
END $$;
REVOKE ALL ON FUNCTION service.settle_commitment(uuid, uuid, uuid, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION service.settle_commitment(uuid, uuid, uuid, text, text, uuid, uuid) TO eye_commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §SV.6 PROBLEMS, KNOWN ERRORS, CHANGES (the domain admin — the customer's service owner; a named human)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION service.sv_problem(p_tenant uuid, p_domain uuid, p_problem uuid) RETURNS service.problems
LANGUAGE plpgsql SECURITY DEFINER SET search_path = service, pg_catalog, pg_temp AS $$
DECLARE p service.problems%ROWTYPE;
BEGIN
  SELECT * INTO p FROM service.problems x WHERE x.problem_id = p_problem AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'service problem rejected (unknown_problem): % is not a problem of this domain', p_problem USING ERRCODE = '23503'; END IF;
  RETURN p;
END $$;
REVOKE ALL ON FUNCTION service.sv_problem(uuid, uuid, uuid) FROM PUBLIC;

/* OPEN (service.problem.open): the cause behind cases — title, statement, the cases it explains (each linked, each case's problem set). */
CREATE OR REPLACE FUNCTION service.open_problem(p_problem uuid, p_tenant uuid, p_domain uuid, p_title text, p_statement text, p_cases uuid[], p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = service, observation, onboarding, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_ref text; x uuid; c service.cases%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['service.problem.open']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM service.sv_assert_actor('service problem', p_actor);
  PERFORM service.sv_assert_customer('service problem', p_actor, p_tenant, p_domain, ARRAY['domain_admin'], 'opening a problem');
  IF length(btrim(coalesce(p_title, ''))) NOT BETWEEN 4 AND 200 THEN RAISE EXCEPTION 'service problem rejected (title): a problem title has 4–200 characters' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_statement, ''))) < 12 THEN RAISE EXCEPTION 'service problem rejected (statement): a problem states the suspected cause (12+ characters)' USING ERRCODE = '22023'; END IF;
  IF cardinality(coalesce(p_cases, '{}')) = 0 THEN RAISE EXCEPTION 'service problem rejected (cases): a problem names the case(s) it explains' USING ERRCODE = '22023'; END IF;
  v_ref := service.sv_next_ref(p_tenant, 'PRB');
  INSERT INTO service.problems (problem_id, tenant_id, domain_id, problem_ref, title, statement, opened_by, correlation_id)
  VALUES (p_problem, p_tenant, p_domain, v_ref, btrim(p_title), btrim(p_statement), p_actor, p_correlation);
  FOREACH x IN ARRAY (SELECT array_agg(DISTINCT y) FROM unnest(p_cases) y) LOOP
    c := service.sv_case(p_tenant, p_domain, x, NULL, 'service problem');
    INSERT INTO service.problem_cases (problem_id, case_id, tenant_id, domain_id, linked_by, reason) VALUES (p_problem, x, p_tenant, p_domain, p_actor, format('explained by problem %s', v_ref));
    UPDATE service.cases SET problem_id = coalesce(problem_id, p_problem), updated_at = clock_timestamp() WHERE case_id = x;
  END LOOP;
  PERFORM onboarding.ledger('service', p_tenant, p_domain, 'problem', p_problem, 1, 'problem.opened', p_actor, jsonb_build_object('problem_ref', v_ref, 'cases', to_jsonb(p_cases)), p_correlation);
  RETURN jsonb_build_object('problem', (SELECT to_jsonb(p) FROM service.problems p WHERE p.problem_id = p_problem));
END $$;
REVOKE ALL ON FUNCTION service.open_problem(uuid, uuid, uuid, text, text, uuid[], uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION service.open_problem(uuid, uuid, uuid, text, text, uuid[], uuid, uuid) TO eye_commit;

/* LINK (service.problem.link): another case explained by the problem (problem open or known_error). */
CREATE OR REPLACE FUNCTION service.link_problem(p_problem uuid, p_case uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = service, observation, onboarding, ctx, public, pg_catalog, pg_temp AS $$
DECLARE p service.problems%ROWTYPE; c service.cases%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['service.problem.link']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM service.sv_assert_actor('service problem', p_actor);
  PERFORM service.sv_assert_customer('service problem', p_actor, p_tenant, p_domain, ARRAY['domain_admin'], 'linking a case to a problem');
  p := service.sv_problem(p_tenant, p_domain, p_problem);
  IF p.state NOT IN ('open', 'known_error') THEN RAISE EXCEPTION 'service problem rejected (state): problem % is %', p.problem_ref, p.state USING ERRCODE = '23505'; END IF;
  c := service.sv_case(p_tenant, p_domain, p_case, NULL, 'service problem');
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'service problem rejected (reason): a link states why (8+ characters)' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM service.problem_cases x WHERE x.problem_id = p_problem AND x.case_id = p_case) THEN
    RAISE EXCEPTION 'service problem rejected (duplicate): case % is already linked to %', c.case_ref, p.problem_ref USING ERRCODE = '23505';
  END IF;
  INSERT INTO service.problem_cases (problem_id, case_id, tenant_id, domain_id, linked_by, reason) VALUES (p_problem, p_case, p_tenant, p_domain, p_actor, btrim(p_reason));
  UPDATE service.cases SET problem_id = coalesce(problem_id, p_problem), updated_at = clock_timestamp() WHERE case_id = p_case;
  PERFORM onboarding.ledger('service', p_tenant, p_domain, 'problem', p_problem, p.version, 'problem.case_linked', p_actor, jsonb_build_object('case_id', p_case, 'case_ref', c.case_ref, 'reason', btrim(p_reason)), p_correlation);
  RETURN jsonb_build_object('problem', to_jsonb(p), 'case_id', p_case);
END $$;
REVOKE ALL ON FUNCTION service.link_problem(uuid, uuid, uuid, uuid, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION service.link_problem(uuid, uuid, uuid, uuid, text, uuid, uuid) TO eye_commit;

/* PUBLISH A KNOWN ERROR (service.problem.known_error): the problem's documented symptom and workaround (the governed act the customer
   performs, optional); the problem → known_error. Digested; reusable on a new case. */
CREATE OR REPLACE FUNCTION service.publish_known_error(p_known_error uuid, p_problem uuid, p_tenant uuid, p_domain uuid, p_title text, p_symptom text, p_workaround text, p_act jsonb,
                                                       p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = service, observation, onboarding, ctx, public, pg_catalog, pg_temp AS $$
DECLARE p service.problems%ROWTYPE; v_ref text; v_act jsonb := coalesce(p_act, '{}'::jsonb);
BEGIN
  PERFORM observation.assert_authority(ARRAY['service.problem.known_error']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM service.sv_assert_actor('known error', p_actor);
  PERFORM service.sv_assert_customer('known error', p_actor, p_tenant, p_domain, ARRAY['domain_admin'], 'publishing a known error');
  p := service.sv_problem(p_tenant, p_domain, p_problem);
  IF p.state NOT IN ('open', 'known_error') THEN RAISE EXCEPTION 'known error rejected (state): problem % is %', p.problem_ref, p.state USING ERRCODE = '23505'; END IF;
  IF length(btrim(coalesce(p_title, ''))) NOT BETWEEN 4 AND 200 THEN RAISE EXCEPTION 'known error rejected (title): a title has 4–200 characters' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_symptom, ''))) < 12 THEN RAISE EXCEPTION 'known error rejected (symptom): a known error states its symptom (12+ characters)' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_workaround, ''))) < 12 THEN RAISE EXCEPTION 'known error rejected (workaround): a known error states its workaround (12+ characters)' USING ERRCODE = '22023'; END IF;
  IF jsonb_typeof(v_act) <> 'object' OR (v_act ? 'action' AND (coalesce(v_act ->> 'action', '') !~ '^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$'
                                                                 OR v_act ->> 'action' LIKE 'service.%' OR v_act ->> 'action' LIKE 'support.%')) THEN
    RAISE EXCEPTION 'known error rejected (act): the workaround act is the customer''s governed act ({action, object_type?}) — never a service or support act' USING ERRCODE = '22023';
  END IF;
  v_ref := service.sv_next_ref(p_tenant, 'KE');
  INSERT INTO service.known_errors (known_error_id, tenant_id, domain_id, problem_id, ke_ref, title, symptom, workaround, workaround_act, digest, published_by, correlation_id)
  VALUES (p_known_error, p_tenant, p_domain, p_problem, v_ref, btrim(p_title), btrim(p_symptom), btrim(p_workaround), v_act,
          onboarding.digest(jsonb_build_object('problem', p_problem, 'title', btrim(p_title), 'symptom', btrim(p_symptom), 'workaround', btrim(p_workaround), 'act', v_act)), p_actor, p_correlation);
  UPDATE service.problems SET state = 'known_error', version = version + 1 WHERE problem_id = p_problem;
  PERFORM onboarding.ledger('service', p_tenant, p_domain, 'known_error', p_known_error, NULL, 'known_error.published', p_actor,
                            jsonb_build_object('ke_ref', v_ref, 'problem_id', p_problem, 'problem_ref', p.problem_ref), p_correlation);
  RETURN jsonb_build_object('known_error', (SELECT to_jsonb(k) FROM service.known_errors k WHERE k.known_error_id = p_known_error));
END $$;
REVOKE ALL ON FUNCTION service.publish_known_error(uuid, uuid, uuid, uuid, text, text, text, jsonb, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION service.publish_known_error(uuid, uuid, uuid, uuid, text, text, text, jsonb, uuid, uuid) TO eye_commit;

/* CLOSE (service.problem.close): resolved — only with a VERIFIED change linked (the fix proven), its known errors retired; or closed — with
   the reason (no fix; accepted). */
CREATE OR REPLACE FUNCTION service.close_problem(p_problem uuid, p_tenant uuid, p_domain uuid, p_outcome text, p_root_cause text, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = service, observation, onboarding, ctx, public, pg_catalog, pg_temp AS $$
DECLARE p service.problems%ROWTYPE; v_now timestamptz := clock_timestamp(); v_retired int;
BEGIN
  PERFORM observation.assert_authority(ARRAY['service.problem.close']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM service.sv_assert_actor('service problem', p_actor);
  PERFORM service.sv_assert_customer('service problem', p_actor, p_tenant, p_domain, ARRAY['domain_admin'], 'closing a problem');
  p := service.sv_problem(p_tenant, p_domain, p_problem);
  IF p.state NOT IN ('open', 'known_error') THEN RAISE EXCEPTION 'service problem rejected (state): problem % is %', p.problem_ref, p.state USING ERRCODE = '23505'; END IF;
  IF coalesce(p_outcome, '') NOT IN ('resolved', 'closed') THEN RAISE EXCEPTION 'service problem rejected (outcome): a problem is resolved or closed' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'service problem rejected (reason): a closure states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  IF p_outcome = 'resolved' AND NOT EXISTS (SELECT 1 FROM service.changes ch WHERE ch.problem_id = p_problem AND ch.state = 'verified') THEN
    RAISE EXCEPTION 'service problem rejected (state): problem % is resolved only by a verified change — none is verified (close it with a reason instead)', p.problem_ref USING ERRCODE = '23505';
  END IF;
  UPDATE service.problems SET state = p_outcome, closed_by = p_actor, closed_at = v_now, close_reason = btrim(p_reason), root_cause = nullif(btrim(coalesce(p_root_cause, '')), ''),
         version = version + 1 WHERE problem_id = p_problem RETURNING * INTO p;
  UPDATE service.known_errors SET state = 'retired', retired_by = p_actor, retired_at = v_now, retire_reason = format('problem %s %s', p.problem_ref, p_outcome)
   WHERE problem_id = p_problem AND state = 'published';
  GET DIAGNOSTICS v_retired = ROW_COUNT;
  PERFORM onboarding.ledger('service', p_tenant, p_domain, 'problem', p_problem, p.version, 'problem.' || p_outcome, p_actor,
                            jsonb_build_object('reason', btrim(p_reason), 'root_cause', p.root_cause, 'known_errors_retired', v_retired), p_correlation);
  RETURN jsonb_build_object('problem', to_jsonb(p), 'known_errors_retired', v_retired);
END $$;
REVOKE ALL ON FUNCTION service.close_problem(uuid, uuid, uuid, text, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION service.close_problem(uuid, uuid, uuid, text, text, text, uuid, uuid) TO eye_commit;

/* CHANGES linked to a problem: PROPOSE (service.change.propose) → DECIDE (service.change.decide, human-gated: another named domain admin —
   never the proposer) → RECORD (service.change.record: implemented (approved first) | verified (implemented first) | failed). */
CREATE OR REPLACE FUNCTION service.propose_change(p_change uuid, p_problem uuid, p_tenant uuid, p_domain uuid, p_title text, p_description text, p_effect text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = service, observation, onboarding, ctx, public, pg_catalog, pg_temp AS $$
DECLARE p service.problems%ROWTYPE; v_ref text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['service.change.propose']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM service.sv_assert_actor('service change', p_actor);
  PERFORM service.sv_assert_customer('service change', p_actor, p_tenant, p_domain, ARRAY['domain_admin'], 'proposing a change');
  p := service.sv_problem(p_tenant, p_domain, p_problem);
  IF p.state NOT IN ('open', 'known_error') THEN RAISE EXCEPTION 'service change rejected (state): problem % is %', p.problem_ref, p.state USING ERRCODE = '23505'; END IF;
  IF length(btrim(coalesce(p_title, ''))) NOT BETWEEN 4 AND 200 THEN RAISE EXCEPTION 'service change rejected (title): a title has 4–200 characters' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_description, ''))) < 12 THEN RAISE EXCEPTION 'service change rejected (description): a change describes what changes (12+ characters)' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_effect, ''))) < 8 THEN RAISE EXCEPTION 'service change rejected (effect): a change states its expected effect (8+ characters)' USING ERRCODE = '22023'; END IF;
  v_ref := service.sv_next_ref(p_tenant, 'CHG');
  INSERT INTO service.changes (change_id, tenant_id, domain_id, problem_id, change_ref, title, description, expected_effect, proposed_by, correlation_id)
  VALUES (p_change, p_tenant, p_domain, p_problem, v_ref, btrim(p_title), btrim(p_description), btrim(p_effect), p_actor, p_correlation);
  PERFORM onboarding.ledger('service', p_tenant, p_domain, 'change', p_change, 1, 'change.proposed', p_actor, jsonb_build_object('change_ref', v_ref, 'problem_id', p_problem, 'problem_ref', p.problem_ref), p_correlation);
  RETURN jsonb_build_object('change', (SELECT to_jsonb(x) FROM service.changes x WHERE x.change_id = p_change));
END $$;
REVOKE ALL ON FUNCTION service.propose_change(uuid, uuid, uuid, uuid, text, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION service.propose_change(uuid, uuid, uuid, uuid, text, text, text, uuid, uuid) TO eye_commit;

CREATE OR REPLACE FUNCTION service.decide_change(p_change uuid, p_tenant uuid, p_domain uuid, p_expected int, p_decision text, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = service, observation, onboarding, ctx, public, pg_catalog, pg_temp AS $$
DECLARE x service.changes%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['service.change.decide']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM service.sv_assert_actor('service change', p_actor);
  PERFORM service.sv_assert_customer('service change', p_actor, p_tenant, p_domain, ARRAY['domain_admin'], 'deciding a change');
  SELECT * INTO x FROM service.changes c WHERE c.change_id = p_change AND c.tenant_id = p_tenant AND c.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'service change rejected (unknown_change): % is not a change of this domain', p_change USING ERRCODE = '23503'; END IF;
  IF p_expected IS NOT NULL AND p_expected <> x.version THEN RAISE EXCEPTION 'service change rejected (stale): change % is at version %, the decision read %', x.change_ref, x.version, p_expected USING ERRCODE = '23505'; END IF;
  IF x.proposed_by = p_actor THEN RAISE EXCEPTION 'service change rejected (separation_of_duties): change % is never decided by its proposer', x.change_ref USING ERRCODE = '42501'; END IF;
  IF x.state <> 'proposed' THEN RAISE EXCEPTION 'service change rejected (state): change % is %', x.change_ref, x.state USING ERRCODE = '23505'; END IF;
  IF coalesce(p_decision, '') NOT IN ('approve', 'reject') THEN RAISE EXCEPTION 'service change rejected (decision): approve or reject' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'service change rejected (reason): a decision states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  UPDATE service.changes SET state = CASE p_decision WHEN 'approve' THEN 'approved' ELSE 'rejected' END, decided_by = p_actor, decided_at = clock_timestamp(), decision_reason = btrim(p_reason),
         version = version + 1 WHERE change_id = p_change RETURNING * INTO x;
  PERFORM onboarding.ledger('service', p_tenant, p_domain, 'change', p_change, x.version, 'change.' || x.state, p_actor, jsonb_build_object('reason', btrim(p_reason)), p_correlation);
  RETURN jsonb_build_object('change', to_jsonb(x));
END $$;
REVOKE ALL ON FUNCTION service.decide_change(uuid, uuid, uuid, int, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION service.decide_change(uuid, uuid, uuid, int, text, text, uuid, uuid) TO eye_commit;

CREATE OR REPLACE FUNCTION service.record_change(p_change uuid, p_tenant uuid, p_domain uuid, p_outcome text, p_evidence text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = service, observation, onboarding, ctx, public, pg_catalog, pg_temp AS $$
DECLARE x service.changes%ROWTYPE; v_now timestamptz := clock_timestamp();
BEGIN
  PERFORM observation.assert_authority(ARRAY['service.change.record']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM service.sv_assert_actor('service change', p_actor);
  PERFORM service.sv_assert_customer('service change', p_actor, p_tenant, p_domain, ARRAY['domain_admin'], 'recording a change');
  SELECT * INTO x FROM service.changes c WHERE c.change_id = p_change AND c.tenant_id = p_tenant AND c.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'service change rejected (unknown_change): % is not a change of this domain', p_change USING ERRCODE = '23503'; END IF;
  IF length(btrim(coalesce(p_evidence, ''))) < 8 THEN RAISE EXCEPTION 'service change rejected (evidence): a record states its evidence (8+ characters)' USING ERRCODE = '22023'; END IF;
  IF NOT ((p_outcome = 'implemented' AND x.state = 'approved') OR (p_outcome IN ('verified', 'failed') AND x.state = 'implemented')) THEN
    RAISE EXCEPTION 'service change rejected (state): change % is % — implemented follows approval; verified or failed follows implementation', x.change_ref, x.state USING ERRCODE = '23505';
  END IF;
  UPDATE service.changes SET state = p_outcome, version = version + 1,
         implemented_by = CASE WHEN p_outcome = 'implemented' THEN p_actor ELSE implemented_by END, implemented_at = CASE WHEN p_outcome = 'implemented' THEN v_now ELSE implemented_at END,
         verified_by = CASE WHEN p_outcome = 'verified' THEN p_actor ELSE verified_by END, verified_at = CASE WHEN p_outcome = 'verified' THEN v_now ELSE verified_at END,
         evidence = evidence || jsonb_build_array(jsonb_build_object('outcome', p_outcome, 'evidence', btrim(p_evidence), 'by', p_actor, 'at', v_now))
   WHERE change_id = p_change RETURNING * INTO x;
  PERFORM onboarding.ledger('service', p_tenant, p_domain, 'change', p_change, x.version, 'change.' || p_outcome, p_actor, jsonb_build_object('evidence', btrim(p_evidence)), p_correlation);
  RETURN jsonb_build_object('change', to_jsonb(x));
END $$;
REVOKE ALL ON FUNCTION service.record_change(uuid, uuid, uuid, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION service.record_change(uuid, uuid, uuid, text, text, uuid, uuid) TO eye_commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §SV.7 THE SLA: the timers' firing, the drill, the sweep
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
/* Record a breach (internal): the row, the case's breach instant (not for a drill), the ledger event, the `service.case` item ESCALATED BY
   SEVERITY (service.sv_dims) under the domain's published policy. */
CREATE OR REPLACE FUNCTION service.sv_breach(c service.cases, p_objective text, p_commitment uuid, p_due timestamptz, p_found_by text, p_timer uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = service, executive, onboarding, pg_catalog, pg_temp AS $$
DECLARE v_id uuid := gen_random_uuid(); v_ev uuid; v_item jsonb; v_drill boolean := p_found_by = 'drill'; v_title text;
BEGIN
  v_ev := onboarding.ledger('service', c.tenant_id, c.domain_id, 'service_case', c.case_id, c.version,
            CASE WHEN v_drill THEN 'sla.drill_breached' WHEN p_objective = 'commitment' THEN 'commitment.breached' ELSE 'sla.' || p_objective || '_breached' END, p_actor,
            jsonb_build_object('case_ref', c.case_ref, 'objective', p_objective, 'commitment_id', p_commitment, 'due_at', p_due, 'found_by', p_found_by, 'timer_id', p_timer,
                               'severity', c.severity, 'tier', c.routing ->> 'tier', 'drill', v_drill), p_correlation);
  v_title := format('%s%s %s of case %s (%s, %s) missed — due %s', CASE WHEN v_drill THEN 'DRILL — ' ELSE '' END,
                    CASE p_objective WHEN 'commitment' THEN 'A support commitment' WHEN 'response' THEN 'The response objective' ELSE 'The resolution objective' END,
                    CASE WHEN v_drill THEN '(sla_escalation drill)' ELSE '' END, c.case_ref, c.severity, c.routing ->> 'tier', to_char(p_due AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI "UTC"'));
  v_item := executive.b33_raise_routed(c.tenant_id, c.domain_id, 'service.case', 'service_case', c.case_id, v_title,
              jsonb_build_array(jsonb_build_object('kind', CASE WHEN v_drill THEN 'sla.drill' ELSE 'sla.breach' END, 'objective', p_objective, 'severity', c.severity, 'due_at', p_due, 'found_by', p_found_by)),
              NULL, v_ev, CASE WHEN p_objective = 'commitment' THEN 'commitment.breached' WHEN v_drill THEN 'sla.drill_breached' ELSE 'sla.breached' END,
              jsonb_build_object('case_ref', c.case_ref, 'objective', p_objective, 'commitment_id', p_commitment, 'drill', v_drill), service.sv_dims(c.severity), p_actor, p_correlation);
  INSERT INTO service.sla_breaches (breach_id, tenant_id, domain_id, case_id, objective, commitment_id, severity, tier, due_at, found_by, drill, timer_id, item, correlation_id)
  VALUES (v_id, c.tenant_id, c.domain_id, c.case_id, p_objective, p_commitment, c.severity, c.routing ->> 'tier', p_due, p_found_by, v_drill, p_timer, v_item, p_correlation);
  IF NOT v_drill AND p_objective = 'response' THEN UPDATE service.cases SET response_breached_at = clock_timestamp() WHERE case_id = c.case_id; END IF;
  IF NOT v_drill AND p_objective = 'resolution' THEN UPDATE service.cases SET resolution_breached_at = clock_timestamp() WHERE case_id = c.case_id; END IF;
  RETURN jsonb_build_object('breach_id', v_id, 'objective', p_objective, 'drill', v_drill, 'item', v_item);
END $$;
REVOKE ALL ON FUNCTION service.sv_breach(service.cases, text, uuid, timestamptz, text, uuid, uuid, uuid) FROM PUBLIC;

/* THE TIMER'S FIRING (the WorkflowTimerRegistry's handler for sla.response / sla.resolution; executive.attention.tick): a drill timer always
   records its drill breach; a real one is SKIPPED when the objective was met (response: any response evidence; resolution: resolved,
   cannot_reproduce or closed) or superseded (the case's current due instant differs — a regrade or a reopen re-scheduled it), else the
   breach is recorded and escalated by severity. Answers {skipped, …} or {breached, …}. */
CREATE OR REPLACE FUNCTION service.fire_sla_timer(p_timer uuid, p_tenant uuid, p_domain uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = service, executive, observation, onboarding, ctx, public, pg_catalog, pg_temp AS $$
DECLARE t executive.workflow_timers%ROWTYPE; c service.cases%ROWTYPE; v_obj text; v_responded timestamptz; v_due timestamptz;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.attention.tick']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'service case rejected (actor): the firing is recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO t FROM executive.workflow_timers x WHERE x.timer_id = p_timer AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND OR t.owner_kind <> 'service_case' OR t.kind NOT IN ('sla.response', 'sla.resolution') THEN
    RAISE EXCEPTION 'service case rejected (kind): % is not an SLA timer of a case', p_timer USING ERRCODE = '22023';
  END IF;
  c := service.sv_case(p_tenant, p_domain, t.owner_id, NULL, 'service case');
  v_obj := CASE t.kind WHEN 'sla.response' THEN 'response' ELSE 'resolution' END;
  IF coalesce((t.payload ->> 'drill')::boolean, false) THEN
    RETURN jsonb_build_object('breached', true, 'drill', true) || service.sv_breach(c, v_obj, NULL, t.due_at, 'drill', p_timer, p_actor, p_correlation);
  END IF;
  IF v_obj = 'response' THEN
    v_responded := service.sv_responded_at(c.case_id);
    IF v_responded IS NOT NULL THEN RETURN jsonb_build_object('skipped', true, 'reason', format('responded at %s', v_responded), 'case_ref', c.case_ref); END IF;
    v_due := c.response_due_at;
  ELSE
    IF c.state IN ('resolved', 'cannot_reproduce', 'closed') THEN RETURN jsonb_build_object('skipped', true, 'reason', format('the case is %s', c.state), 'case_ref', c.case_ref); END IF;
    v_due := c.resolution_due_at;
  END IF;
  IF v_due IS DISTINCT FROM t.due_at THEN
    RETURN jsonb_build_object('skipped', true, 'reason', format('superseded: the %s objective is now due %s', v_obj, v_due), 'case_ref', c.case_ref);
  END IF;
  IF EXISTS (SELECT 1 FROM service.sla_breaches b WHERE b.case_id = c.case_id AND b.objective = v_obj AND b.due_at = t.due_at AND NOT b.drill) THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'the breach is already recorded (the sweep found it first)', 'case_ref', c.case_ref);
  END IF;
  RETURN jsonb_build_object('breached', true, 'drill', false, 'case_ref', c.case_ref) || service.sv_breach(c, v_obj, NULL, t.due_at, 'timer', p_timer, p_actor, p_correlation);
END $$;
REVOKE ALL ON FUNCTION service.fire_sla_timer(uuid, uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION service.fire_sla_timer(uuid, uuid, uuid, uuid, uuid) TO eye_commit;

/* THE DRILL (service.sla.drill, human-gated: the domain admin): an `sla_escalation` drill on a case not closed — a timer of the objective due
   NOW (payload drill), fired by the domain's next real attention tick; the case's real SLA facts are never touched. */
CREATE OR REPLACE FUNCTION service.drill_sla(p_drill uuid, p_case uuid, p_tenant uuid, p_domain uuid, p_objective text, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = service, executive, observation, onboarding, ctx, public, pg_catalog, pg_temp AS $$
DECLARE c service.cases%ROWTYPE; v_timer uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['service.sla.drill']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM service.sv_assert_actor('service case', p_actor);
  PERFORM service.sv_assert_customer('service case', p_actor, p_tenant, p_domain, ARRAY['domain_admin'], 'running an SLA escalation drill');
  c := service.sv_case(p_tenant, p_domain, p_case, NULL, 'service case');
  IF c.state = 'closed' THEN RAISE EXCEPTION 'service case rejected (state): case % is closed', c.case_ref USING ERRCODE = '23505'; END IF;
  IF coalesce(p_objective, '') NOT IN ('response', 'resolution') THEN RAISE EXCEPTION 'service case rejected (objective): a drill exercises the response or the resolution objective' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'service case rejected (reason): a drill states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  v_timer := service.sv_schedule(c, 'sla.' || p_objective, clock_timestamp(), jsonb_build_object('objective', p_objective, 'drill', true, 'drill_id', p_drill), p_actor, p_correlation);
  INSERT INTO service.sla_drills (drill_id, tenant_id, domain_id, case_id, objective, timer_id, requested_by, reason, correlation_id)
  VALUES (p_drill, p_tenant, p_domain, p_case, p_objective, v_timer, p_actor, btrim(p_reason), p_correlation);
  PERFORM service.sv_event(c, 'sla.drill_requested', p_actor, jsonb_build_object('drill_id', p_drill, 'objective', p_objective, 'timer_id', v_timer, 'kind', 'sla_escalation'), p_correlation);
  RETURN jsonb_build_object('drill', (SELECT to_jsonb(d) FROM service.sla_drills d WHERE d.drill_id = p_drill),
                            'note', 'the drill timer is due now: the domain''s next attention tick fires it and records the escalation as a drill');
END $$;
REVOKE ALL ON FUNCTION service.drill_sla(uuid, uuid, uuid, uuid, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION service.drill_sla(uuid, uuid, uuid, uuid, text, text, uuid, uuid) TO eye_commit;

/* What the sweep would find (a plain read — the after-tick hook reads it FIRST, and writes only when it is not empty). */
CREATE OR REPLACE FUNCTION service.sla_sweep_candidates(p_tenant uuid, p_domain uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = service, executive, pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object(
    'commitments', coalesce((SELECT jsonb_agg(m.commitment_id) FROM service.commitments m WHERE m.tenant_id = p_tenant AND m.domain_id = p_domain AND m.state = 'open' AND m.due_at <= clock_timestamp()), '[]'::jsonb),
    'objectives', coalesce((SELECT jsonb_agg(jsonb_build_object('case_id', c.case_id, 'objective', o.obj)) FROM service.cases c
        CROSS JOIN LATERAL (VALUES ('response', c.response_due_at), ('resolution', c.resolution_due_at)) AS o(obj, due)
       WHERE c.tenant_id = p_tenant AND c.domain_id = p_domain AND o.due IS NOT NULL AND o.due <= clock_timestamp() AND c.state <> 'closed'
         AND ((o.obj = 'response' AND c.responded_at IS NULL AND c.response_breached_at IS NULL AND NOT EXISTS (SELECT 1 FROM service.support_grants g WHERE g.case_id = c.case_id))
           OR (o.obj = 'resolution' AND c.state NOT IN ('resolved', 'cannot_reproduce') AND c.resolution_breached_at IS NULL))
         AND NOT EXISTS (SELECT 1 FROM executive.workflow_timers t WHERE t.owner_kind = 'service_case' AND t.owner_id = c.case_id AND t.kind = 'sla.' || o.obj
                            AND t.due_at = o.due AND t.cancelled_at IS NULL AND coalesce((t.payload ->> 'drill')::boolean, false) = false
                            AND (t.fired_at IS NULL OR EXISTS (SELECT 1 FROM executive.workflow_timer_firings f WHERE f.timer_id = t.timer_id AND f.outcome <> 'failed')))), '[]'::jsonb))
$$;
GRANT EXECUTE ON FUNCTION service.sla_sweep_candidates(uuid, uuid) TO eye_app, eye_commit;

/* THE SWEEP (service.sla.sweep — the after-tick hook `service-sla`, the attention agent): every OPEN commitment past its due instant
   BREACHES (escalated by the case's severity); every objective past due whose timer did not fire (none scheduled, or abandoned after three
   failures) is recorded as breached by the sweep. Re-checked here (the read before it is only the trigger). */
CREATE OR REPLACE FUNCTION service.sla_sweep(p_tenant uuid, p_domain uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = service, executive, observation, onboarding, ctx, public, pg_catalog, pg_temp AS $$
DECLARE m service.commitments%ROWTYPE; c service.cases%ROWTYPE; v_cand jsonb; o jsonb; v_out jsonb := '[]'::jsonb; v_due timestamptz;
BEGIN
  PERFORM observation.assert_authority(ARRAY['service.sla.sweep']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'service commitment rejected (actor): the sweep is recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  FOR m IN SELECT * FROM service.commitments x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.state = 'open' AND x.due_at <= clock_timestamp()
            ORDER BY x.due_at FOR UPDATE SKIP LOCKED LOOP
    UPDATE service.commitments SET state = 'breached', breached_at = clock_timestamp() WHERE commitment_id = m.commitment_id;
    SELECT * INTO c FROM service.cases x WHERE x.case_id = m.case_id;
    v_out := v_out || jsonb_build_array(jsonb_build_object('commitment_id', m.commitment_id) || service.sv_breach(c, 'commitment', m.commitment_id, m.due_at, 'sweep', NULL, p_actor, p_correlation));
  END LOOP;
  v_cand := service.sla_sweep_candidates(p_tenant, p_domain) -> 'objectives';
  FOR o IN SELECT * FROM jsonb_array_elements(v_cand) LOOP
    SELECT * INTO c FROM service.cases x WHERE x.case_id = (o ->> 'case_id')::uuid FOR UPDATE SKIP LOCKED;
    IF NOT FOUND THEN CONTINUE; END IF;
    v_due := CASE o ->> 'objective' WHEN 'response' THEN c.response_due_at ELSE c.resolution_due_at END;
    IF EXISTS (SELECT 1 FROM service.sla_breaches b WHERE b.case_id = c.case_id AND b.objective = o ->> 'objective' AND b.due_at = v_due AND NOT b.drill) THEN CONTINUE; END IF;
    v_out := v_out || jsonb_build_array(jsonb_build_object('case_id', c.case_id) || service.sv_breach(c, o ->> 'objective', NULL, v_due, 'sweep', NULL, p_actor, p_correlation));
  END LOOP;
  RETURN jsonb_build_object('breaches', v_out, 'count', jsonb_array_length(v_out));
END $$;
REVOKE ALL ON FUNCTION service.sla_sweep(uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION service.sla_sweep(uuid, uuid, uuid, uuid) TO eye_commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §SV.8 THE VALUE REVIEW (CAP-DL-10)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
/* MET-040's status in the domain (read by the port — never the caller's word): its approved definition supported or not; absent → unsupported,
   carrier B76. */
CREATE OR REPLACE FUNCTION service.value_status(p_tenant uuid, p_domain uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = service, analytics, pg_catalog, pg_temp AS $$
  SELECT coalesce(
    (SELECT jsonb_build_object('metric_key', d.metric_key, 'version', d.version, 'state', CASE WHEN d.supported THEN 'supported' ELSE 'unsupported' END,
                               'reason', coalesce(d.unsupported_reason, 'computable under its registered computation'), 'carrier', CASE WHEN d.supported THEN NULL ELSE 'B76' END,
                               'definition_id', d.definition_id)
       FROM analytics.metric_definitions d WHERE d.tenant_id = p_tenant AND d.domain_id = p_domain AND d.metric_key = 'MET-040' AND d.state = 'approved'),
    jsonb_build_object('metric_key', 'MET-040', 'version', NULL, 'state', 'unsupported', 'carrier', 'B76',
                       'reason', 'MET-040 (realized strategic value) has no approved supported definition in this domain — value stays unsupported until B76'))
$$;
GRANT EXECUTE ON FUNCTION service.value_status(uuid, uuid) TO eye_app, eye_commit;

/* RECORD (service.value_review.record): a domain admin or an executive, over the customer-success inputs the route read FIRST (their digest
   re-checked); the value status read HERE; claim `demonstration`. */
CREATE OR REPLACE FUNCTION service.record_value_review(p_review uuid, p_tenant uuid, p_domain uuid, p_from date, p_to date, p_inputs jsonb, p_inputs_digest text, p_outcomes text,
                                                       p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = service, observation, onboarding, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_status jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['service.value_review.record']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM service.sv_assert_actor('value review', p_actor);
  PERFORM service.sv_assert_customer('value review', p_actor, p_tenant, p_domain, ARRAY['domain_admin', 'executive'], 'recording a value review');
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from OR p_to > (clock_timestamp() AT TIME ZONE 'UTC')::date THEN
    RAISE EXCEPTION 'value review rejected (period): a review covers a past period (from ≤ to ≤ today)' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_inputs) IS DISTINCT FROM 'object' OR NOT (p_inputs ? 'health' AND p_inputs ? 'adoption' AND p_inputs ? 'licence' AND p_inputs ? 'cases') THEN
    RAISE EXCEPTION 'value review rejected (inputs): a review rests on the customer-success read (health, adoption, licence, cases)' USING ERRCODE = '22023';
  END IF;
  IF p_inputs_digest IS DISTINCT FROM onboarding.digest(p_inputs) THEN
    RAISE EXCEPTION 'value review rejected (stale): the inputs'' digest does not match the inputs — read the customer-success view again' USING ERRCODE = '23505';
  END IF;
  IF length(btrim(coalesce(p_outcomes, ''))) < 12 THEN RAISE EXCEPTION 'value review rejected (outcomes): a review states the outcomes observed (12+ characters)' USING ERRCODE = '22023'; END IF;
  v_status := service.value_status(p_tenant, p_domain);
  INSERT INTO service.value_reviews (review_id, tenant_id, domain_id, period_from, period_to, inputs, inputs_digest, outcomes, value_status, digest, recorded_by, correlation_id)
  VALUES (p_review, p_tenant, p_domain, p_from, p_to, p_inputs, p_inputs_digest, btrim(p_outcomes), v_status,
          onboarding.digest(jsonb_build_object('from', p_from, 'to', p_to, 'inputs_digest', p_inputs_digest, 'outcomes', btrim(p_outcomes), 'value_status', v_status, 'claim', 'demonstration')),
          p_actor, p_correlation);
  PERFORM onboarding.ledger('service', p_tenant, p_domain, 'value_review', p_review, 1, 'value_review.recorded', p_actor,
                            jsonb_build_object('period_from', p_from, 'period_to', p_to, 'value_state', v_status ->> 'state', 'claim', 'demonstration'), p_correlation);
  RETURN jsonb_build_object('review', (SELECT to_jsonb(r) FROM service.value_reviews r WHERE r.review_id = p_review));
END $$;
REVOKE ALL ON FUNCTION service.record_value_review(uuid, uuid, uuid, date, date, jsonb, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION service.record_value_review(uuid, uuid, uuid, date, date, jsonb, text, text, uuid, uuid) TO eye_commit;

/* ACKNOWLEDGE or WITHHOLD (service.value_review.acknowledge, human-gated): an executive or a domain admin other than the recorder, on the
   review's digest (stale → 409). The claim stays `demonstration` — joint value-review acceptance is R2. */
CREATE OR REPLACE FUNCTION service.decide_value_review(p_review uuid, p_tenant uuid, p_domain uuid, p_digest text, p_decision text, p_note text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = service, observation, onboarding, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r service.value_reviews%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['service.value_review.acknowledge']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM service.sv_assert_actor('value review', p_actor);
  PERFORM service.sv_assert_customer('value review', p_actor, p_tenant, p_domain, ARRAY['executive', 'domain_admin'], 'acknowledging a value review');
  SELECT * INTO r FROM service.value_reviews x WHERE x.review_id = p_review AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'value review rejected (unknown_review): % is not a value review of this domain', p_review USING ERRCODE = '23503'; END IF;
  IF r.recorded_by = p_actor THEN RAISE EXCEPTION 'value review rejected (separation_of_duties): a review is never acknowledged by its recorder' USING ERRCODE = '42501'; END IF;
  IF r.state <> 'recorded' THEN RAISE EXCEPTION 'value review rejected (state): the review is %', r.state USING ERRCODE = '23505'; END IF;
  IF p_digest IS DISTINCT FROM r.digest THEN RAISE EXCEPTION 'value review rejected (stale): the review''s digest is %, the decision names %', r.digest, coalesce(p_digest, '<none>') USING ERRCODE = '23505'; END IF;
  IF coalesce(p_decision, '') NOT IN ('acknowledged', 'withheld') THEN RAISE EXCEPTION 'value review rejected (decision): acknowledged or withheld' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_note, ''))) < 8 THEN RAISE EXCEPTION 'value review rejected (note): a decision states its note (8+ characters)' USING ERRCODE = '22023'; END IF;
  UPDATE service.value_reviews SET state = p_decision, decided_by = p_actor, decided_at = clock_timestamp(), decision_note = btrim(p_note) WHERE review_id = p_review RETURNING * INTO r;
  PERFORM onboarding.ledger('service', p_tenant, p_domain, 'value_review', p_review, 1, 'value_review.' || p_decision, p_actor,
                            jsonb_build_object('note', btrim(p_note), 'claim', 'demonstration', 'boundary', 'joint value-review acceptance is R2'), p_correlation);
  RETURN jsonb_build_object('review', to_jsonb(r));
END $$;
REVOKE ALL ON FUNCTION service.decide_value_review(uuid, uuid, uuid, text, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION service.decide_value_review(uuid, uuid, uuid, text, text, text, uuid, uuid) TO eye_commit;


-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §SA — responsibility, owners and reconciliation, governed support access, drills, admission, the control center (F-P7-F-06; IA-04)
-- (folded at integration from the part-local file 0114_b94_x_sa.sql, unchanged but for the marked `B94 integration` edits; apply order §0, §ON, §MG, §IM, §SV, §SA)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0114 §SA — CP-6 B94 part §SA: THE SHARED-RESPONSIBILITY MATRIX AND THE ACCOUNTABLE-OWNER REGISTRY (IA-04-001/-002/-003/-005), GOVERNED SUPPORT
-- ACCESS (PR-69-003, PER-20 — request, approval, the three-layer lapse, the logged diagnostic reads), CUSTOMER-CONTROL DRILLS, THE JOINT
-- EXERCISE AND THE ADMISSION RECORD (IA-04-006), the reads of the CUSTOMER CONTROL CENTER (CAP-TR-12). Applies alone on 0001–0113 + the prelude
-- (0114_b94_onboarding_implementation_service.sql §0); it re-declares NO earlier function.
--
-- THE PATTERN is B34/B34-F's expiring collaborator grant (0090 §W5, 0091 §3–§7): a purpose-bound grant, an expiry TIMER (support_access.expiry,
-- fired by the attention tick's workflow-timers step through the WorkflowTimerRegistry), a SWEEP (the after-tick hook `support-access`) and
-- the IDENTITY revocation of what the ended grant left live (the engineer's sessions — revoked by the identity authority, never written here).
-- Three layers: (1) the engineer's sessions revoked with the grant's end; (2) `service.live_grant` (the prelude's) asked FIRST by every port
-- acting for an engineer, against the database clock — an expired grant is dead before any sweep; (3) the timer + the sweep marking it lapsed.
-- THE SUPPORT ENGINEER is a persistent vendor principal whose only live bindings are `support_engineer` (DOMAIN) — provisioned by the tenant
-- administrator through the Phase 0 principals route (identity.principal.create, one role at creation). A grant never adds a binding
-- (IA-04-003); a principal who also holds a customer role is refused support access (its customer roles could reach what the grant may not).
--
-- THREE CLAIMS, never mixed: CONSTRUCTION (this file, its ports and the harness phase6-support-b94); DEMONSTRATED OPERATION (the act on
-- SYNTHETIC NORDWERK personas — T. Richter's approval, the SYNTHETIC vendor engineer); REAL CUSTOMER ACCEPTANCE / PRODUCTION ADMISSION (R1/R2 —
-- an admission record signed here is construction evidence, never a production admission; IA-04-004 parity is B111).
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- §SA.1 COLUMNS ON THE PRELUDE'S TABLES (added, never redefined) ────────────────────────────────────────────────────────────────────────────
-- The grant: the request's DIGEST (the approver decides on it — stale → 409), its expiry timer and review task, the consequence preview the
-- approver saw. The matrix: the tenant contract's support_boundary recorded AT APPROVAL (a later change is drift — never a matrix change).
ALTER TABLE service.support_grants ADD COLUMN request_digest text CHECK (request_digest ~ '^[0-9a-f]{64}$'),
                                   ADD COLUMN expiry_timer_id uuid,
                                   ADD COLUMN review_task_id uuid,
                                   ADD COLUMN preview jsonb;
CREATE UNIQUE INDEX ssg_one_open ON service.support_grants (tenant_id, domain_id, case_id, engineer_principal_id) WHERE state IN ('requested', 'approved');
ALTER TABLE service.responsibility_matrices ADD COLUMN support_boundary jsonb,
                                            ADD COLUMN row_count int;

-- §SA.2 THE VOCABULARY, THE GAP SUBJECT ──────────────────────────────────────────────────────────────────────────────────────────────────
/* The responsibility keys every part uses (the prelude's §0 list) with their ACCOUNTABLE owner role. A vocabulary key keeps its owner role (a
   different owner is a different responsibility — a new key); a new key is the matrix's own. */
CREATE OR REPLACE FUNCTION service.responsibility_vocabulary() RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$ SELECT jsonb_build_object(
  'domain.operation', 'domain_admin', 'risk.ownership', 'risk_owner', 'data.migration', 'onboarding_authority', 'support.access', 'domain_admin',
  'evidence.custody', 'data_steward', 'decision.ownership', 'decision_owner') $$;
GRANT EXECUTE ON FUNCTION service.responsibility_vocabulary() TO eye_app, eye_commit;
/* The subject of a responsibility GAP's attention item: one stable id per (domain, responsibility) — the item stays visible until the gap is
   filled (IA-04-005); '*matrix*' names the gap of a domain with no approved matrix at all. */
CREATE OR REPLACE FUNCTION service.gap_subject(p_tenant uuid, p_domain uuid, p_key text) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT md5('b94.sa.gap:' || p_tenant::text || ':' || p_domain::text || ':' || p_key)::uuid $$;
GRANT EXECUTE ON FUNCTION service.gap_subject(uuid, uuid, text) TO eye_app, eye_commit;

-- §SA.3 THE TABLES ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* RECONCILIATION (IA-04-002): desired (the signed matrix version) vs observed (live bindings, live grants, the attention policy's routes, the
   domain's agents, the contract's support_boundary). One row per CHANGE of the observed state (the digest), append-only. */
CREATE TABLE service.reconciliation_events (
  event_id          uuid PRIMARY KEY,
  scope             text NOT NULL DEFAULT 'DOMAIN' CHECK (scope = 'DOMAIN'),
  tenant_id         uuid NOT NULL,
  domain_id         uuid NOT NULL,
  deployment_profile text NOT NULL DEFAULT 'local-dev' CHECK (deployment_profile IN ('local-dev', 'saas', 'private-cloud', 'on-premise')),
  matrix_id         uuid,
  matrix_version    int,
  desired_digest    text CHECK (desired_digest ~ '^[0-9a-f]{64}$'),
  observed          jsonb NOT NULL CHECK (jsonb_typeof(observed) = 'object'),
  observed_digest   text NOT NULL CHECK (observed_digest ~ '^[0-9a-f]{64}$'),
  findings          jsonb NOT NULL CHECK (jsonb_typeof(findings) = 'array'),
  gaps              int NOT NULL CHECK (gaps >= 0),
  drift             int NOT NULL CHECK (drift >= 0),
  items             jsonb NOT NULL DEFAULT '{}'::jsonb,
  recorded_by       uuid NOT NULL,
  recorded_at       timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id    uuid NOT NULL,
  CONSTRAINT sre_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX sre_domain ON service.reconciliation_events (tenant_id, domain_id, deployment_profile, recorded_at DESC);
CREATE TRIGGER sre_append_only BEFORE UPDATE OR DELETE ON service.reconciliation_events FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

/* A CUSTOMER-CONTROL DRILL (CAP-TR-12): the customer exercising its own control — revoke a live grant and PROVE the next act is refused (the
   live-grant test every port asks, probed for every action × object of the grant's scope), or prove an expired grant refused before any
   sweep. Append-only, with its evidence. */
CREATE TABLE service.control_drills (
  drill_id          uuid PRIMARY KEY,
  scope             text NOT NULL DEFAULT 'DOMAIN' CHECK (scope = 'DOMAIN'),
  tenant_id         uuid NOT NULL,
  domain_id         uuid NOT NULL,
  kind              text NOT NULL CHECK (kind IN ('revoke_live_grant', 'expired_grant_refused')),
  grant_id          uuid NOT NULL REFERENCES service.support_grants (grant_id),
  reason            text NOT NULL CHECK (length(btrim(reason)) >= 8),
  outcome           text NOT NULL CHECK (outcome IN ('passed', 'failed')),
  evidence          jsonb NOT NULL CHECK (jsonb_typeof(evidence) = 'object'),
  run_by            uuid NOT NULL,
  run_at            timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id    uuid NOT NULL,
  CONSTRAINT scd_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE TRIGGER scd_append_only BEFORE UPDATE OR DELETE ON service.control_drills FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

/* A JOINT OPERATING EXERCISE (IA-04-006): customer and vendor participants, what was exercised, the outcome. On SYNTHETIC personas it is a
   demonstration (claim); a real joint exercise for production admission is R1. Append-only. */
CREATE TABLE service.joint_exercises (
  exercise_id       uuid PRIMARY KEY,
  scope             text NOT NULL DEFAULT 'DOMAIN' CHECK (scope = 'DOMAIN'),
  tenant_id         uuid NOT NULL,
  domain_id         uuid NOT NULL,
  title             text NOT NULL CHECK (length(btrim(title)) BETWEEN 4 AND 200),
  scenario          text NOT NULL CHECK (length(btrim(scenario)) >= 12),
  held_on           date NOT NULL,
  customer_participants uuid[] NOT NULL CHECK (cardinality(customer_participants) >= 1),
  vendor_participants   uuid[] NOT NULL CHECK (cardinality(vendor_participants) >= 1),
  outcome           text NOT NULL CHECK (outcome IN ('completed', 'completed_with_findings', 'failed')),
  findings          text,
  evidence_refs     jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(evidence_refs) = 'array'),
  claim             text NOT NULL DEFAULT 'demonstration' CHECK (claim IN ('demonstration')),
  recorded_by       uuid NOT NULL,
  recorded_at       timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id    uuid NOT NULL,
  CONSTRAINT sjx_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE TRIGGER sjx_append_only BEFORE UPDATE OR DELETE ON service.joint_exercises FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

/* THE ADMISSION RECORD (IA-04-006): the signed matrix, the support-grant ledger (privileged access) and its access log, the drills, the joint
   exercises — each bound to the configuration BASELINE DIGEST (text: §ON's table may not be on this branch), the deployment profile and the
   period; digested; SIGNED by the onboarding authority (`admission_record`). PRODUCTION ADMISSION ITSELF IS R1 — this record is construction
   evidence (a demonstration on SYNTHETIC personas), stated on the row. Versioned per admission_id. */
CREATE TABLE service.admission_records (
  admission_id      uuid NOT NULL,
  version           int NOT NULL CHECK (version >= 1),
  scope             text NOT NULL DEFAULT 'DOMAIN' CHECK (scope = 'DOMAIN'),
  tenant_id         uuid NOT NULL,
  domain_id         uuid NOT NULL,
  deployment_profile text NOT NULL CHECK (deployment_profile IN ('local-dev', 'saas', 'private-cloud', 'on-premise')),
  period_from       date NOT NULL,
  period_to         date NOT NULL,
  baseline_digest   text NOT NULL CHECK (baseline_digest ~ '^[0-9a-f]{64}$'),
  matrix            jsonb NOT NULL CHECK (jsonb_typeof(matrix) = 'object'),
  grant_ledger      jsonb NOT NULL CHECK (jsonb_typeof(grant_ledger) = 'object'),
  drills            jsonb NOT NULL CHECK (jsonb_typeof(drills) = 'array'),
  exercises         jsonb NOT NULL CHECK (jsonb_typeof(exercises) = 'array'),
  digest            text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  state             text NOT NULL DEFAULT 'proposed' CHECK (state IN ('proposed', 'signed', 'rejected', 'superseded')),
  production_admission text NOT NULL DEFAULT 'R1: production admission is external — this record is construction evidence (a demonstration on SYNTHETIC personas)',
  proposed_by       uuid NOT NULL,
  proposed_at       timestamptz NOT NULL DEFAULT clock_timestamp(),
  decided_by        uuid,
  decided_at        timestamptz,
  decision_reason   text,
  signature_id      uuid,
  correlation_id    uuid NOT NULL,
  PRIMARY KEY (admission_id, version),
  CONSTRAINT sar_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT sar_period CHECK (period_to >= period_from),
  CONSTRAINT sar_decided CHECK (state IN ('proposed', 'superseded') OR (decided_by IS NOT NULL AND decided_at IS NOT NULL)),
  CONSTRAINT sar_sod CHECK (decided_by IS NULL OR decided_by <> proposed_by),
  CONSTRAINT sar_signed CHECK (state <> 'signed' OR signature_id IS NOT NULL)
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['service.reconciliation_events', 'service.control_drills', 'service.joint_exercises', 'service.admission_records'] LOOP
    EXECUTE format('REVOKE ALL ON %s FROM PUBLIC', t);
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$CREATE POLICY domain_isolation ON %s USING (tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain()))$f$, t);
    EXECUTE format('GRANT SELECT ON %s TO eye_app, eye_commit', t);
  END LOOP;
END $$;

-- §SA.4 INTERNAL HELPERS ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* The acting principal is the route's (every port). */
CREATE OR REPLACE FUNCTION service._sa_actor(p_noun text, p_actor uuid) RETURNS void
LANGUAGE plpgsql STABLE SET search_path = public, pg_catalog, pg_temp AS $$
BEGIN
  IF p_actor IS NULL OR p_actor IS DISTINCT FROM public.eye_principal() THEN
    RAISE EXCEPTION '% rejected (actor): recorded by the acting principal', p_noun USING ERRCODE = '42501';
  END IF;
END $$;
REVOKE ALL ON FUNCTION service._sa_actor(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION service._sa_actor(text, uuid) TO eye_commit;

/* Is the principal a support engineer (any live support_engineer binding in the tenant)? */
CREATE OR REPLACE FUNCTION service._is_support_engineer(p_principal uuid, p_tenant uuid) RETURNS boolean
STABLE SECURITY DEFINER SET search_path = identity, pg_catalog, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM identity.role_bindings b WHERE b.principal_id = p_principal AND b.tenant_id = p_tenant AND b.role_code = 'support_engineer' AND b.revoked_at IS NULL)
$$ LANGUAGE sql;
REVOKE ALL ON FUNCTION service._is_support_engineer(uuid, uuid) FROM PUBLIC;

/* Raise a responsibility.gap item for (domain, key) unless one is already open (the gap stays ONE visible item until filled); internal. */
CREATE OR REPLACE FUNCTION service._raise_gap(p_tenant uuid, p_domain uuid, p_key text, p_resolution jsonb, p_cause uuid, p_cause_type text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = service, executive, pg_catalog, pg_temp AS $$
DECLARE v_subject uuid := service.gap_subject(p_tenant, p_domain, p_key); v_open uuid;
BEGIN
  SELECT i.item_id INTO v_open FROM executive.attention_items i
   WHERE i.tenant_id = p_tenant AND i.domain_id = p_domain AND i.signal_class = 'responsibility.gap' AND i.subject_id = v_subject AND i.state <> 'closed' LIMIT 1;
  IF v_open IS NOT NULL THEN RETURN jsonb_build_object('item_id', v_open, 'existing', true, 'key', p_key); END IF;
  RETURN executive.b33_raise_routed(p_tenant, p_domain, 'responsibility.gap', 'responsibility_matrix', v_subject,
           CASE WHEN p_key = '*matrix*' THEN 'No approved responsibility matrix for the domain — no accountable owner can be resolved'
                ELSE format('No unambiguous accountable owner: %s (%s)', p_key, coalesce(p_resolution ->> 'state', 'undeclared')) END,
           jsonb_build_array(jsonb_build_object('responsibility', p_key, 'state', p_resolution ->> 'state', 'reason', p_resolution ->> 'reason',
                                                'escalation_path', p_resolution ->> 'escalation_path')),
           NULL, p_cause, p_cause_type,
           jsonb_build_object('responsibility', p_key, 'resolution', p_resolution, 'rule', 'IA-04-005: the dependent act stops; the gap stays visible until filled — never inferred'),
           jsonb_build_object('consequence', 'C2', 'confidence', 1, 'hours_to_window', 24), p_actor, p_correlation) || jsonb_build_object('key', p_key);
END $$;
REVOKE ALL ON FUNCTION service._raise_gap(uuid, uuid, text, jsonb, uuid, text, uuid, uuid) FROM PUBLIC;

/* THE END OF A GRANT (revoked | lapsed | withdrawn): the state, the timer (cancelled unless it is the one being fired), the open review task
   cancelled, the support.access items closed, the ledger event. The engineer's SESSIONS are the identity authority's: the route revokes them
   next and the after-tick hook `support-access` revokes whatever service._support_access_pending still finds. Internal. */
CREATE OR REPLACE FUNCTION service._end_support_grant(p_grant uuid, p_tenant uuid, p_domain uuid, p_state text, p_reason text, p_cancel_timer boolean, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = service, executive, onboarding, pg_catalog, pg_temp AS $$
DECLARE g service.support_grants%ROWTYPE; v_items jsonb; v_tasks jsonb := '{}'::jsonb;
BEGIN
  SELECT * INTO g FROM service.support_grants x WHERE x.grant_id = p_grant AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  UPDATE service.support_grants SET state = p_state, ended_at = clock_timestamp(), ended_by = p_actor, end_reason = btrim(p_reason) WHERE grant_id = p_grant;
  IF p_cancel_timer AND g.expiry_timer_id IS NOT NULL THEN
    UPDATE executive.workflow_timers SET cancelled_at = clock_timestamp() WHERE timer_id = g.expiry_timer_id AND fired_at IS NULL AND cancelled_at IS NULL;
  END IF;
  IF g.state = 'requested' THEN
    v_tasks := executive._cancel_human_tasks(p_tenant, p_domain, jsonb_build_object('kind', 'support_grant', 'id', p_grant), ARRAY['support.access_review'],
                                             format('the support grant was %s before a decision', p_state), p_actor, p_correlation);
  END IF;
  v_items := executive.b33_close_items(p_tenant, p_domain, 'support.access', 'support_grant', p_grant, format('the support grant is %s: %s', p_state, btrim(p_reason)), p_actor, p_correlation);
  PERFORM onboarding.ledger('service', p_tenant, p_domain, 'support_grant', p_grant, NULL, 'grant.' || p_state, p_actor,
            jsonb_build_object('reason', btrim(p_reason), 'engineer', g.engineer_principal_id, 'case_id', g.case_id, 'prior_state', g.state, 'expires_at', g.expires_at,
                               'items_closed', v_items, 'tasks', v_tasks, 'access', 'the engineer''s sessions are revoked by the identity authority next'), p_correlation);
  RETURN jsonb_build_object('grant_id', p_grant, 'state', p_state, 'engineer', g.engineer_principal_id, 'prior_state', g.state, 'ended_reason', btrim(p_reason));
END $$;
REVOKE ALL ON FUNCTION service._end_support_grant(uuid, uuid, uuid, text, text, boolean, uuid, uuid) FROM PUBLIC;

/* ACCESS STILL TO REVOKE (the 0091 §7 idiom): the engineers of this domain's ENDED grants (revoked, lapsed, withdrawn after approval) who still
   hold an active session ISSUED BEFORE the grant ended. A session opened afterwards is a new sign-in (no grant is live for it unless a new
   one is approved). Internal; read by the sweep and the revoke routes. */
CREATE OR REPLACE FUNCTION service._support_access_pending(p_tenant uuid, p_domain uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = service, identity, pg_catalog, pg_temp AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('principal', x.engineer_principal_id, 'grant_id', x.grant_id, 'grant_state', x.state) ORDER BY x.ended_at), '[]'::jsonb)
    FROM (SELECT DISTINCT ON (g.engineer_principal_id) g.engineer_principal_id, g.grant_id, g.state, g.ended_at
            FROM service.support_grants g
           WHERE g.tenant_id = p_tenant AND g.domain_id = p_domain AND g.state IN ('revoked', 'lapsed', 'withdrawn') AND g.decided_at IS NOT NULL AND g.ended_at IS NOT NULL
             AND EXISTS (SELECT 1 FROM identity.sessions s WHERE s.principal_id = g.engineer_principal_id AND s.status = 'active' AND s.expires_at > clock_timestamp()
                                                            AND s.issued_at < g.ended_at)
           ORDER BY g.engineer_principal_id, g.ended_at DESC LIMIT 200) x
$$;
REVOKE ALL ON FUNCTION service._support_access_pending(uuid, uuid) FROM PUBLIC;

-- §SA.5 THE RESPONSIBILITY MATRIX (IA-04-001/-003) ─────────────────────────────────────────────────────────────────────────────────────────
/* PROPOSE a matrix version (the implementation lead or the domain admin): the rows validated (roles exist; a vocabulary key keeps its owner
   role; a vendor role never owns nor holds customer authority; the paths stated; a named owner an active principal of the tenant), digested.
   A change is a NEW version (expected_version guards the race); an open proposal is decided before the next. A support engineer never
   writes a matrix (IA-04-003). Opens the authority's review task. */
CREATE OR REPLACE FUNCTION service.propose_matrix(p_matrix uuid, p_tenant uuid, p_domain uuid, p_programme uuid, p_profile text, p_rows jsonb, p_expected_version int,
                                                  p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = service, identity, onboarding, executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_id uuid; v_cur int; v_open service.responsibility_matrices%ROWTYPE; r jsonb; v_keys text[] := '{}'; v_key text; v_vocab jsonb := service.responsibility_vocabulary();
        v_rows jsonb := '[]'::jsonb; v_digest text; v_version int; v_task jsonb; v_profile text := coalesce(p_profile, 'local-dev'); v_ev uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['service.matrix.propose']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM service._sa_actor('responsibility matrix', p_actor);
  IF service._is_support_engineer(p_actor, p_tenant) THEN
    RAISE EXCEPTION 'responsibility matrix rejected (authority): a support engineer never writes a responsibility matrix (IA-04-003: no silent transfer through a support action)' USING ERRCODE = '42501';
  END IF;
  IF NOT onboarding.holds_role(p_actor, p_tenant, p_domain, ARRAY['implementation_lead', 'domain_admin']) THEN
    RAISE EXCEPTION 'responsibility matrix rejected (authority): a matrix is proposed by the implementation lead or the domain administrator' USING ERRCODE = '42501';
  END IF;
  IF v_profile NOT IN ('local-dev', 'saas', 'private-cloud', 'on-premise') THEN RAISE EXCEPTION 'responsibility matrix rejected (profile): % is not a deployment profile', v_profile USING ERRCODE = '22023'; END IF;
  IF p_programme IS NOT NULL AND NOT EXISTS (SELECT 1 FROM onboarding.programmes x WHERE x.programme_id = p_programme AND x.tenant_id = p_tenant AND x.superseded_at IS NULL) THEN
    RAISE EXCEPTION 'responsibility matrix rejected (unknown_programme): no onboarding programme % in this tenant', p_programme USING ERRCODE = '23503';
  END IF;
  IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' OR jsonb_array_length(p_rows) = 0 OR jsonb_array_length(p_rows) > 60 THEN
    RAISE EXCEPTION 'responsibility matrix rejected (rows): a matrix declares 1–60 responsibilities' USING ERRCODE = '22023';
  END IF;
  FOR r IN SELECT x FROM jsonb_array_elements(p_rows) x LOOP
    v_key := r ->> 'key';
    IF v_key IS NULL OR v_key !~ '^[a-z][a-z0-9_.-]{2,62}$' THEN RAISE EXCEPTION 'responsibility matrix rejected (row): % is not a responsibility key', coalesce(v_key, '<none>') USING ERRCODE = '22023'; END IF;
    IF v_key = ANY (v_keys) THEN RAISE EXCEPTION 'responsibility matrix rejected (row): % is declared twice', v_key USING ERRCODE = '22023'; END IF;
    v_keys := v_keys || v_key;
    IF length(btrim(coalesce(r ->> 'title', ''))) NOT BETWEEN 4 AND 200 THEN RAISE EXCEPTION 'responsibility matrix rejected (row): % has a title (4–200 characters)', v_key USING ERRCODE = '22023'; END IF;
    IF NOT EXISTS (SELECT 1 FROM identity.roles x WHERE x.code = r ->> 'owner_role') OR NOT EXISTS (SELECT 1 FROM identity.roles x WHERE x.code = r ->> 'operator_role')
       OR NOT EXISTS (SELECT 1 FROM identity.roles x WHERE x.code = r ->> 'customer_authority') THEN
      RAISE EXCEPTION 'responsibility matrix rejected (row): % names its owner role, operator role and customer authority among the roles that exist', v_key USING ERRCODE = '22023';
    END IF;
    IF v_vocab ? v_key AND (v_vocab ->> v_key) IS DISTINCT FROM (r ->> 'owner_role') THEN
      RAISE EXCEPTION 'responsibility matrix rejected (vocabulary): % is owned by % in the shared vocabulary — a different owner is a different responsibility (a new key)', v_key, v_vocab ->> v_key USING ERRCODE = '22023';
    END IF;
    IF (r ->> 'owner_role') = 'support_engineer' OR (r ->> 'customer_authority') = 'support_engineer' THEN
      RAISE EXCEPTION 'responsibility matrix rejected (row): % — a vendor support engineer never owns a responsibility nor holds the customer''s authority', v_key USING ERRCODE = '22023';
    END IF;
    FOREACH v_key IN ARRAY ARRAY['access_path', 'evidence_producer', 'escalation_path'] LOOP
      IF length(btrim(coalesce(r ->> v_key, ''))) < 4 THEN RAISE EXCEPTION 'responsibility matrix rejected (row): % states its % (4+ characters)', r ->> 'key', v_key USING ERRCODE = '22023'; END IF;
    END LOOP;
    IF nullif(r ->> 'owner_principal_id', '') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM identity.principals p WHERE p.id = (r ->> 'owner_principal_id')::uuid AND p.tenant_id = p_tenant AND p.status = 'active') THEN
      RAISE EXCEPTION 'responsibility matrix rejected (row): % names an owner who is not an active principal of the tenant', r ->> 'key' USING ERRCODE = '22023';
    END IF;
    v_rows := v_rows || jsonb_build_object('key', r ->> 'key', 'title', btrim(r ->> 'title'), 'owner_role', r ->> 'owner_role', 'owner_principal_id', nullif(r ->> 'owner_principal_id', ''),
                                           'operator_role', r ->> 'operator_role', 'customer_authority', r ->> 'customer_authority', 'access_path', btrim(r ->> 'access_path'),
                                           'evidence_producer', btrim(r ->> 'evidence_producer'), 'escalation_path', btrim(r ->> 'escalation_path'));
  END LOOP;
  -- the matrix of (tenant, domain, profile): one id, versions under it
  SELECT x.matrix_id, max(x.version) INTO v_id, v_cur FROM service.responsibility_matrices x
   WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.deployment_profile = v_profile GROUP BY x.matrix_id ORDER BY max(x.version) DESC LIMIT 1;
  IF v_id IS NOT NULL AND p_matrix IS NOT NULL AND p_matrix <> v_id THEN
    RAISE EXCEPTION 'responsibility matrix rejected (duplicate): the domain''s % matrix is %', v_profile, v_id USING ERRCODE = '23505';
  END IF;
  v_id := coalesce(v_id, p_matrix, gen_random_uuid()); v_cur := coalesce(v_cur, 0);
  IF p_expected_version IS DISTINCT FROM v_cur THEN
    RAISE EXCEPTION 'responsibility matrix rejected (stale): the matrix is at version % (expected %)', v_cur, coalesce(p_expected_version::text, '<none>') USING ERRCODE = '23505';
  END IF;
  SELECT * INTO v_open FROM service.responsibility_matrices x WHERE x.matrix_id = v_id AND x.state = 'proposed' LIMIT 1;
  IF FOUND THEN RAISE EXCEPTION 'responsibility matrix rejected (state): version % is proposed and awaits the customer authority''s decision', v_open.version USING ERRCODE = '23505'; END IF;
  v_version := v_cur + 1;
  SELECT jsonb_agg(x ORDER BY x ->> 'key') INTO v_rows FROM jsonb_array_elements(v_rows) x;
  v_digest := onboarding.digest(jsonb_build_object('matrix_id', v_id, 'version', v_version, 'tenant_id', p_tenant, 'domain_id', p_domain, 'profile', v_profile,
                                                   'programme_id', p_programme, 'rows', v_rows));
  INSERT INTO service.responsibility_matrices (matrix_id, version, tenant_id, domain_id, programme_id, deployment_profile, state, digest, proposed_by, correlation_id, row_count)
  VALUES (v_id, v_version, p_tenant, p_domain, p_programme, v_profile, 'proposed', v_digest, p_actor, p_correlation, jsonb_array_length(v_rows));
  INSERT INTO service.responsibility_rows (matrix_id, version, responsibility_key, tenant_id, domain_id, title, owner_role, owner_principal_id, operator_role, customer_authority,
                                           access_path, evidence_producer, escalation_path)
  SELECT v_id, v_version, x ->> 'key', p_tenant, p_domain, x ->> 'title', x ->> 'owner_role', (x ->> 'owner_principal_id')::uuid, x ->> 'operator_role', x ->> 'customer_authority',
         x ->> 'access_path', x ->> 'evidence_producer', x ->> 'escalation_path' FROM jsonb_array_elements(v_rows) x;
  v_task := executive._open_human_task(gen_random_uuid(), p_tenant, p_domain, 'onboarding.approve', format('b94-sa:matrix:%s:%s', v_id, v_version),
              jsonb_build_object('kind', 'responsibility_matrix', 'id', v_id, 'version', v_version, 'digest', v_digest), format('Decide the responsibility matrix v%s', v_version),
              NULL, ARRAY['onboarding_authority'], jsonb_build_object('approver', 'a named human onboarding authority, not the proposer, never an implementation lead'),
              NULL, '{}'::jsonb, NULL, NULL, p_actor, p_correlation);
  v_ev := onboarding.ledger('service', p_tenant, p_domain, 'responsibility_matrix', v_id, v_version, 'matrix.proposed', p_actor,
            jsonb_build_object('digest', v_digest, 'profile', v_profile, 'rows', jsonb_array_length(v_rows), 'programme_id', p_programme, 'task', v_task), p_correlation);
  RETURN jsonb_build_object('matrix_id', v_id, 'version', v_version, 'state', 'proposed', 'digest', v_digest, 'profile', v_profile, 'rows', v_rows, 'task', v_task, 'event_id', v_ev);
END $$;
REVOKE ALL ON FUNCTION service.propose_matrix(uuid, uuid, uuid, uuid, text, jsonb, int, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION service.propose_matrix(uuid, uuid, uuid, uuid, text, jsonb, int, uuid, uuid) TO eye_commit;

/* DECIDE a proposed version (the onboarding authority — the approver test: a named human, never the proposer, never an implementation lead,
   never an agent — on the EXACT digest; stale → 409). APPROVE needs the signature recorded under this action first (SignatureService, subject
   `responsibility_matrix`, the version's digest, the decider) — named here and verified; the prior approved version is superseded (keeps its
   signature); the contract's support_boundary at approval is recorded on the version. REJECT records the reason. */
CREATE OR REPLACE FUNCTION service.decide_matrix(p_matrix uuid, p_version int, p_tenant uuid, p_domain uuid, p_decision text, p_digest text, p_reason text, p_signature uuid,
                                                 p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = service, identity, onboarding, executive, commercial, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE m service.responsibility_matrices%ROWTYPE; v_prior int; v_boundary jsonb; v_tasks jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['service.matrix.decide']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM service._sa_actor('responsibility matrix', p_actor);
  SELECT * INTO m FROM service.responsibility_matrices x WHERE x.matrix_id = p_matrix AND x.version = p_version AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'responsibility matrix rejected (unknown_matrix): no matrix %/v% in this domain', p_matrix, p_version USING ERRCODE = '23503'; END IF;
  PERFORM onboarding.assert_approver('responsibility matrix', p_actor, p_tenant, p_domain, ARRAY['onboarding_authority'], m.proposed_by, 'deciding a responsibility matrix');
  IF m.state <> 'proposed' THEN RAISE EXCEPTION 'responsibility matrix rejected (state): version % is %', p_version, m.state USING ERRCODE = '23505'; END IF;
  IF p_digest IS DISTINCT FROM m.digest THEN
    RAISE EXCEPTION 'responsibility matrix rejected (stale): the decision names digest % but version % is %', left(coalesce(p_digest, '<none>'), 12), p_version, left(m.digest, 12) USING ERRCODE = '23505';
  END IF;
  IF p_decision NOT IN ('approve', 'reject') THEN RAISE EXCEPTION 'responsibility matrix rejected (decision): approve or reject' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'responsibility matrix rejected (reason): a decision states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  v_tasks := executive._resolve_human_tasks(p_tenant, p_domain, jsonb_build_object('kind', 'responsibility_matrix', 'id', p_matrix, 'version', p_version), ARRAY['onboarding.approve'],
                                            p_decision || 'd', p_matrix, p_actor, p_correlation);
  IF p_decision = 'reject' THEN
    UPDATE service.responsibility_matrices SET state = 'rejected', decided_by = p_actor, decided_at = clock_timestamp(), decision_reason = btrim(p_reason) WHERE matrix_id = p_matrix AND version = p_version;
    PERFORM onboarding.ledger('service', p_tenant, p_domain, 'responsibility_matrix', p_matrix, p_version, 'matrix.rejected', p_actor,
              jsonb_build_object('digest', m.digest, 'reason', btrim(p_reason), 'tasks', v_tasks), p_correlation);
    RETURN jsonb_build_object('matrix_id', p_matrix, 'version', p_version, 'state', 'rejected', 'digest', m.digest);
  END IF;
  IF p_signature IS NULL OR NOT EXISTS (SELECT 1 FROM executive.signatures s WHERE s.signature_id = p_signature AND s.subject_kind = 'responsibility_matrix' AND s.subject_id = p_matrix
                                                   AND s.subject_version = p_version AND s.subject_digest = m.digest AND s.signer = p_actor AND s.bound_action = 'service.matrix.decide') THEN
    RAISE EXCEPTION 'responsibility matrix rejected (signature): the approval carries the decider''s signature over the version''s digest' USING ERRCODE = '22023';
  END IF;
  SELECT x.version INTO v_prior FROM service.responsibility_matrices x WHERE x.matrix_id = p_matrix AND x.state = 'approved' FOR UPDATE;
  IF v_prior IS NOT NULL THEN UPDATE service.responsibility_matrices SET state = 'superseded' WHERE matrix_id = p_matrix AND version = v_prior; END IF;
  -- the tenant contract's support boundary NOW (descriptive: a later change is drift, never a matrix change — IA-04-003)
  SELECT jsonb_build_object('contract_id', c.contract_id, 'version', c.version, 'tier', c.support_boundary ->> 'tier', 'digest', onboarding.digest(c.support_boundary)) INTO v_boundary
    FROM commercial.contracts c WHERE c.tenant_id = p_tenant AND c.status = 'active' ORDER BY c.effective_from DESC, c.version DESC LIMIT 1;
  UPDATE service.responsibility_matrices SET state = 'approved', decided_by = p_actor, decided_at = clock_timestamp(), decision_reason = btrim(p_reason), signature_id = p_signature,
         support_boundary = v_boundary WHERE matrix_id = p_matrix AND version = p_version;
  PERFORM onboarding.ledger('service', p_tenant, p_domain, 'responsibility_matrix', p_matrix, p_version, 'matrix.approved', p_actor,
            jsonb_build_object('digest', m.digest, 'signature_id', p_signature, 'supersedes', v_prior, 'reason', btrim(p_reason), 'support_boundary', v_boundary, 'tasks', v_tasks), p_correlation);
  RETURN jsonb_build_object('matrix_id', p_matrix, 'version', p_version, 'state', 'approved', 'digest', m.digest, 'signature_id', p_signature, 'supersedes', v_prior, 'support_boundary', v_boundary);
END $$;
REVOKE ALL ON FUNCTION service.decide_matrix(uuid, int, uuid, uuid, text, text, text, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION service.decide_matrix(uuid, int, uuid, uuid, text, text, text, uuid, uuid, uuid) TO eye_commit;

-- §SA.6 THE OWNER REGISTRY AND RECONCILIATION (IA-04-002/-005) ─────────────────────────────────────────────────────────────────────────────
/* THE OBSERVED STATE (a definer read, guarded by the read scope): the approved matrix (desired) and, per row, the owner resolved LIVE plus
   the holders of its operator role and customer authority; the support engineers and their other roles; the live grants; the attention
   policy's routes for the support and gap classes; the domain's agents and whether their owners are live; the tenant contract's support
   boundary. Nothing volatile (no read instant) — its digest changes only when the state does. */
CREATE OR REPLACE FUNCTION service.observe_responsibility(p_tenant uuid, p_domain uuid, p_profile text DEFAULT 'local-dev') RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = service, identity, executive, commercial, onboarding, pg_catalog, pg_temp AS $$
DECLARE m service.responsibility_matrices%ROWTYPE; v_rows jsonb := '[]'::jsonb; v_pol executive.attention_policies%ROWTYPE; v_routes jsonb := '{}'::jsonb; c text;
        v_holders int; v_roles jsonb;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the observed responsibility state of a domain');
  SELECT * INTO m FROM service.responsibility_matrices x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.deployment_profile = coalesce(p_profile, 'local-dev') AND x.state = 'approved';
  IF FOUND THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'key', r.responsibility_key, 'title', r.title, 'owner_role', r.owner_role, 'owner_principal_id', r.owner_principal_id, 'operator_role', r.operator_role,
             'customer_authority', r.customer_authority, 'escalation_path', r.escalation_path,
             'resolution', service.owner_resolution(p_tenant, p_domain, r.responsibility_key, m.deployment_profile) - 'title',
             'operator_holders', (SELECT count(DISTINCT b.principal_id) FROM identity.role_bindings b JOIN identity.principals p ON p.id = b.principal_id
                                   WHERE b.role_code = r.operator_role AND b.revoked_at IS NULL AND p.status = 'active' AND b.tenant_id = p_tenant AND (b.scope = 'TENANT' OR b.domain_id = p_domain)),
             'authority_holders', (SELECT count(DISTINCT b.principal_id) FROM identity.role_bindings b JOIN identity.principals p ON p.id = b.principal_id
                                    WHERE b.role_code = r.customer_authority AND b.revoked_at IS NULL AND p.status = 'active' AND b.tenant_id = p_tenant AND (b.scope = 'TENANT' OR b.domain_id = p_domain)))
             ORDER BY r.responsibility_key), '[]'::jsonb) INTO v_rows
      FROM service.responsibility_rows r WHERE r.matrix_id = m.matrix_id AND r.version = m.version;
  END IF;
  SELECT * INTO v_pol FROM executive.attention_policies a WHERE a.tenant_id = p_tenant AND a.domain_id = p_domain AND a.state = 'active';
  FOREACH c IN ARRAY ARRAY['support.access', 'responsibility.gap'] LOOP
    v_roles := CASE WHEN v_pol.policy_id IS NULL THEN NULL ELSE v_pol.rules -> 'classes' -> c -> 'route_roles' END;
    SELECT count(DISTINCT b.principal_id) INTO v_holders FROM identity.role_bindings b JOIN identity.principals p ON p.id = b.principal_id
     WHERE v_roles IS NOT NULL AND b.role_code IN (SELECT jsonb_array_elements_text(v_roles)) AND b.revoked_at IS NULL AND p.status = 'active' AND p.kind = 'human'
       AND b.tenant_id = p_tenant AND (b.scope = 'TENANT' OR b.domain_id = p_domain);
    v_routes := v_routes || jsonb_build_object(c, jsonb_build_object('route_roles', v_roles, 'holders', v_holders));
  END LOOP;
  RETURN jsonb_build_object(
    'profile', coalesce(p_profile, 'local-dev'),
    'matrix', CASE WHEN m.matrix_id IS NULL THEN NULL ELSE jsonb_build_object('matrix_id', m.matrix_id, 'version', m.version, 'digest', m.digest, 'signature_id', m.signature_id,
                                                                              'support_boundary', m.support_boundary) END,
    'rows', v_rows,
    'vocabulary', service.responsibility_vocabulary(),
    'engineers', (SELECT coalesce(jsonb_agg(jsonb_build_object('principal', e.principal_id,
                    'other_roles', (SELECT coalesce(jsonb_agg(DISTINCT b2.role_code ORDER BY b2.role_code), '[]'::jsonb) FROM identity.role_bindings b2
                                     WHERE b2.principal_id = e.principal_id AND b2.revoked_at IS NULL AND b2.tenant_id = p_tenant AND b2.role_code <> 'support_engineer'))
                    ORDER BY e.principal_id), '[]'::jsonb)
                    FROM (SELECT DISTINCT b.principal_id FROM identity.role_bindings b JOIN identity.principals p ON p.id = b.principal_id
                           WHERE b.role_code = 'support_engineer' AND b.revoked_at IS NULL AND p.status = 'active' AND b.tenant_id = p_tenant AND b.domain_id = p_domain) e),
    'live_grants', (SELECT coalesce(jsonb_agg(jsonb_build_object('grant_id', g.grant_id, 'engineer', g.engineer_principal_id, 'case_id', g.case_id,
                      'engineer_holds_role', onboarding.holds_role(g.engineer_principal_id, p_tenant, p_domain, ARRAY['support_engineer'])) ORDER BY g.grant_id), '[]'::jsonb)
                      FROM service.support_grants g WHERE g.tenant_id = p_tenant AND g.domain_id = p_domain AND g.state = 'approved' AND clock_timestamp() < g.expires_at),
    'routes', jsonb_build_object('policy_version', v_pol.version) || v_routes,
    'agents', (SELECT coalesce(jsonb_agg(jsonb_build_object('agent_id', a.agent_id, 'kind', a.agent_kind, 'owner', a.owner_principal_id,
                 'owner_active', decision.is_active_human(a.owner_principal_id, p_tenant),
                 'escalation_active', a.escalation_principal_id IS NULL OR decision.is_active_human(a.escalation_principal_id, p_tenant)) ORDER BY a.agent_id), '[]'::jsonb)
                 FROM executive.agents a WHERE a.tenant_id = p_tenant AND a.domain_id = p_domain AND a.status = 'active'),
    'support_boundary', (SELECT jsonb_build_object('contract_id', c2.contract_id, 'version', c2.version, 'tier', c2.support_boundary ->> 'tier', 'digest', onboarding.digest(c2.support_boundary))
                           FROM commercial.contracts c2 WHERE c2.tenant_id = p_tenant AND c2.status = 'active' ORDER BY c2.effective_from DESC, c2.version DESC LIMIT 1));
END $$;
REVOKE ALL ON FUNCTION service.observe_responsibility(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION service.observe_responsibility(uuid, uuid, text) TO eye_app, eye_commit;

/* THE TICK'S CHEAP LOOK (the step `responsibility-observe`, inside the tick's write — a read only): has the domain declared a matrix at all, and
   did the observed state change since the last recorded reconciliation? The after-tick hook reconciles (its own read, then its own write)
   only when both hold — a domain that never declared responsibility is not written to by the tick (its gap is the control center's
   read and every dependent act's hold); an unchanged domain costs one read. */
CREATE OR REPLACE FUNCTION service.reconciliation_due(p_tenant uuid, p_domain uuid, p_profile text DEFAULT 'local-dev') RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = service, onboarding, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_declared boolean; v_digest text; v_last text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.attention.tick']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  v_declared := EXISTS (SELECT 1 FROM service.responsibility_matrices m WHERE m.tenant_id = p_tenant AND m.domain_id = p_domain AND m.deployment_profile = coalesce(p_profile, 'local-dev'));
  IF NOT v_declared THEN RETURN jsonb_build_object('declared', false, 'due', false); END IF;
  v_digest := onboarding.digest(service.observe_responsibility(p_tenant, p_domain, p_profile));
  SELECT e.observed_digest INTO v_last FROM service.reconciliation_events e WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain AND e.deployment_profile = coalesce(p_profile, 'local-dev')
   ORDER BY e.recorded_at DESC LIMIT 1;
  RETURN jsonb_build_object('declared', true, 'due', v_last IS DISTINCT FROM v_digest, 'observed_digest', v_digest, 'last_digest', v_last);
END $$;
REVOKE ALL ON FUNCTION service.reconciliation_due(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION service.reconciliation_due(uuid, uuid, text) TO eye_commit;

/* RECORD a reconciliation (the after-tick hook `responsibility-reconcile` or a person's "reconcile now"): the observation READ FIRST in its
   own governed read and its findings computed (support-logic.ts) are recorded ONLY WHEN THE OBSERVED DIGEST CHANGED. The gaps are decided
   HERE, live, from owner_resolution (never from the caller's findings): every declared responsibility not `resolved` — and a domain with no
   approved matrix — keeps ONE open `responsibility.gap` item; a gap filled closes its item. An observation of a superseded matrix is stale. */
CREATE OR REPLACE FUNCTION service.record_reconciliation(p_event uuid, p_tenant uuid, p_domain uuid, p_profile text, p_observed jsonb, p_findings jsonb, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = service, executive, onboarding, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE m service.responsibility_matrices%ROWTYPE; v_digest text; v_last service.reconciliation_events%ROWTYPE; r service.responsibility_rows%ROWTYPE; v_res jsonb;
        v_raised jsonb := '[]'::jsonb; v_closed jsonb := '[]'::jsonb; v_gaps int := 0; v_drift int; v_profile text := coalesce(p_profile, 'local-dev'); x jsonb; v_subject uuid; v_closed_one jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['service.responsibility.reconcile']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM service._sa_actor('accountable owner', p_actor);
  IF jsonb_typeof(p_observed) IS DISTINCT FROM 'object' OR jsonb_typeof(p_findings) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'accountable owner rejected (observation): an observed state (object) and its findings (array)' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO m FROM service.responsibility_matrices x2 WHERE x2.tenant_id = p_tenant AND x2.domain_id = p_domain AND x2.deployment_profile = v_profile AND x2.state = 'approved';
  IF ((p_observed -> 'matrix' ->> 'version')::int) IS DISTINCT FROM m.version OR ((p_observed -> 'matrix' ->> 'matrix_id')::uuid) IS DISTINCT FROM m.matrix_id THEN
    RAISE EXCEPTION 'accountable owner rejected (stale): the observation read matrix v% but v% is approved now — read again', coalesce(p_observed -> 'matrix' ->> 'version', '<none>'),
      coalesce(m.version::text, '<none>') USING ERRCODE = '23505';
  END IF;
  v_digest := onboarding.digest(p_observed);
  SELECT * INTO v_last FROM service.reconciliation_events e WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain AND e.deployment_profile = v_profile ORDER BY e.recorded_at DESC LIMIT 1;
  IF v_last.event_id IS NOT NULL AND v_last.observed_digest = v_digest THEN
    RETURN jsonb_build_object('recorded', false, 'unchanged', true, 'event_id', v_last.event_id, 'observed_digest', v_digest, 'since', v_last.recorded_at);
  END IF;
  -- THE GAPS, decided live
  IF m.matrix_id IS NULL THEN
    v_gaps := 1;
    v_raised := v_raised || service._raise_gap(p_tenant, p_domain, '*matrix*', jsonb_build_object('state', 'undeclared', 'reason', 'the domain has no approved responsibility matrix'),
                                              p_event, 'reconciliation.recorded', p_actor, p_correlation);
  ELSE
    v_closed := v_closed || executive.b33_close_items(p_tenant, p_domain, 'responsibility.gap', 'responsibility_matrix', service.gap_subject(p_tenant, p_domain, '*matrix*'),
                                                      format('matrix v%s approved', m.version), p_actor, p_correlation);
    FOR r IN SELECT * FROM service.responsibility_rows rr WHERE rr.matrix_id = m.matrix_id AND rr.version = m.version ORDER BY rr.responsibility_key LOOP
      v_res := service.owner_resolution(p_tenant, p_domain, r.responsibility_key, v_profile);
      v_subject := service.gap_subject(p_tenant, p_domain, r.responsibility_key);
      IF v_res ->> 'state' = 'resolved' THEN
        v_closed_one := executive.b33_close_items(p_tenant, p_domain, 'responsibility.gap', 'responsibility_matrix', v_subject,
                          format('filled: %s holds %s', v_res -> 'principals' ->> 0, r.owner_role), p_actor, p_correlation);
        v_closed := v_closed || v_closed_one;
      ELSE
        v_gaps := v_gaps + 1;
        v_raised := v_raised || service._raise_gap(p_tenant, p_domain, r.responsibility_key, v_res, p_event, 'reconciliation.recorded', p_actor, p_correlation);
      END IF;
    END LOOP;
  END IF;
  SELECT count(*) INTO v_drift FROM jsonb_array_elements(p_findings) f WHERE coalesce(f ->> 'class', '') = 'drift';
  INSERT INTO service.reconciliation_events (event_id, tenant_id, domain_id, deployment_profile, matrix_id, matrix_version, desired_digest, observed, observed_digest, findings, gaps, drift, items,
                                             recorded_by, correlation_id)
  VALUES (p_event, p_tenant, p_domain, v_profile, m.matrix_id, m.version, m.digest, p_observed, v_digest, p_findings, v_gaps, v_drift,
          jsonb_build_object('raised', v_raised, 'closed', v_closed), p_actor, p_correlation);
  PERFORM onboarding.ledger('service', p_tenant, p_domain, 'reconciliation', p_event, m.version, 'reconciliation.recorded', p_actor,
            jsonb_build_object('observed_digest', v_digest, 'desired_digest', m.digest, 'gaps', v_gaps, 'drift', v_drift, 'raised', v_raised, 'closed', v_closed), p_correlation);
  RETURN jsonb_build_object('recorded', true, 'event_id', p_event, 'observed_digest', v_digest, 'desired_digest', m.digest, 'matrix_version', m.version, 'gaps', v_gaps, 'drift', v_drift,
                            'raised', v_raised, 'closed', v_closed);
END $$;
REVOKE ALL ON FUNCTION service.record_reconciliation(uuid, uuid, uuid, text, jsonb, jsonb, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION service.record_reconciliation(uuid, uuid, uuid, text, jsonb, jsonb, uuid, uuid) TO eye_commit;

-- §SA.7 SUPPORT ACCESS (PR-69-003, PER-20) ─────────────────────────────────────────────────────────────────────────────────────────────────
/* REQUEST (the support engineer, for one case): purpose, object scope (named source ids of this domain), action scope ⊆ grant_actions(),
   duration 15 min – 24 h. The engineer is an active HUMAN holding support_engineer in the domain and NO customer role in the tenant (a
   grant never widens what its holder reaches; a member's roles would). Digested; the domain admin's review task and a `support.access` item
   (named to the accountable owner of support.access when resolved) opened. */
CREATE OR REPLACE FUNCTION service.request_support_grant(p_grant uuid, p_tenant uuid, p_domain uuid, p_case uuid, p_purpose text, p_object_scope jsonb, p_actions text[], p_minutes int,
                                                         p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = service, identity, onboarding, executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE c service.cases%ROWTYPE; v_sources uuid[]; v_actions text[]; v_digest text; v_other text[]; v_task jsonb; v_item jsonb; v_owner jsonb; v_ev uuid; s uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['service.grant.request']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM service._sa_actor('support grant', p_actor);
  IF onboarding.principal_kind(p_actor) IS DISTINCT FROM 'human' THEN
    RAISE EXCEPTION 'support grant rejected (actor): support access is requested by a named human support engineer, never an agent' USING ERRCODE = '42501';
  END IF;
  IF NOT onboarding.holds_role(p_actor, p_tenant, p_domain, ARRAY['support_engineer']) THEN
    RAISE EXCEPTION 'support grant rejected (authority): support access is requested by a support engineer of the domain' USING ERRCODE = '42501';
  END IF;
  SELECT coalesce(array_agg(DISTINCT b.role_code ORDER BY b.role_code), '{}') INTO v_other FROM identity.role_bindings b
   WHERE b.principal_id = p_actor AND b.tenant_id = p_tenant AND b.revoked_at IS NULL AND b.role_code <> 'support_engineer';
  IF cardinality(v_other) > 0 THEN
    RAISE EXCEPTION 'support grant rejected (access): a support engineer holds no customer role (this principal also holds %) — support access never rides on a member''s roles', array_to_string(v_other, ', ') USING ERRCODE = '42501';
  END IF;
  SELECT * INTO c FROM service.cases x WHERE x.case_id = p_case AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'support grant rejected (unknown_case): no case % in this domain', p_case USING ERRCODE = '23503'; END IF;
  IF c.state = 'closed' THEN RAISE EXCEPTION 'support grant rejected (state): case % is closed', c.case_ref USING ERRCODE = '23505'; END IF;
  IF length(btrim(coalesce(p_purpose, ''))) < 12 THEN RAISE EXCEPTION 'support grant rejected (purpose): a grant states its purpose (12+ characters)' USING ERRCODE = '22023'; END IF;
  IF p_minutes IS NULL OR p_minutes < 15 OR p_minutes > 1440 THEN RAISE EXCEPTION 'support grant rejected (duration): a grant lasts 15 minutes to 24 hours (asked %)', coalesce(p_minutes::text, '<none>') USING ERRCODE = '22023'; END IF;
  SELECT array_agg(DISTINCT a ORDER BY a) INTO v_actions FROM unnest(coalesce(p_actions, '{}')) a;
  IF v_actions IS NULL OR NOT (v_actions <@ service.grant_actions()) THEN
    RAISE EXCEPTION 'support grant rejected (actions): the action scope is a non-empty subset of % ', array_to_string(service.grant_actions(), ', ') USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_object_scope) IS DISTINCT FROM 'object' OR jsonb_typeof(p_object_scope -> 'sources') IS DISTINCT FROM 'array' OR jsonb_array_length(p_object_scope -> 'sources') = 0
     OR (SELECT count(*) FROM jsonb_object_keys(p_object_scope)) <> 1 THEN
    RAISE EXCEPTION 'support grant rejected (objects): the object scope names the sources it may read: {"sources": [id, …]}' USING ERRCODE = '22023';
  END IF;
  BEGIN
    SELECT array_agg(DISTINCT x::uuid ORDER BY x::uuid) INTO v_sources FROM jsonb_array_elements_text(p_object_scope -> 'sources') x;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'support grant rejected (objects): a source is named by its id' USING ERRCODE = '22023';
  END;
  FOREACH s IN ARRAY v_sources LOOP
    IF NOT EXISTS (SELECT 1 FROM observation.source_contracts_current sc WHERE sc.source_id = s AND sc.tenant_id = p_tenant AND sc.domain_id = p_domain) THEN
      RAISE EXCEPTION 'support grant rejected (unknown_source): % is not a source of this domain', s USING ERRCODE = '23503';
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM service.support_grants g WHERE g.tenant_id = p_tenant AND g.domain_id = p_domain AND g.case_id = p_case AND g.engineer_principal_id = p_actor
               AND (g.state = 'requested' OR (g.state = 'approved' AND clock_timestamp() < g.expires_at))) THEN
    RAISE EXCEPTION 'support grant rejected (duplicate): this engineer already holds an open grant for case %', c.case_ref USING ERRCODE = '23505';
  END IF;
  v_digest := onboarding.digest(jsonb_build_object('grant_id', p_grant, 'case_id', p_case, 'engineer', p_actor, 'purpose', btrim(p_purpose), 'sources', to_jsonb(v_sources),
                                                   'actions', to_jsonb(v_actions), 'minutes', p_minutes));
  INSERT INTO service.support_grants (grant_id, tenant_id, domain_id, case_id, engineer_principal_id, purpose, object_scope, action_scope, duration_minutes, state, request_digest, correlation_id)
  VALUES (p_grant, p_tenant, p_domain, p_case, p_actor, btrim(p_purpose), jsonb_build_object('sources', to_jsonb(v_sources)), v_actions, p_minutes, 'requested', v_digest, p_correlation);
  v_ev := onboarding.ledger('service', p_tenant, p_domain, 'support_grant', p_grant, NULL, 'grant.requested', p_actor,
            jsonb_build_object('case_id', p_case, 'case_ref', c.case_ref, 'purpose', btrim(p_purpose), 'sources', to_jsonb(v_sources), 'actions', to_jsonb(v_actions), 'minutes', p_minutes,
                               'request_digest', v_digest), p_correlation);
  v_task := executive._open_human_task(gen_random_uuid(), p_tenant, p_domain, 'support.access_review', format('b94-sa:grant:%s', p_grant),
              jsonb_build_object('kind', 'support_grant', 'id', p_grant, 'case_id', p_case, 'digest', v_digest), format('Review support access for %s (%s min)', c.case_ref, p_minutes),
              NULL, ARRAY['domain_admin'], jsonb_build_object('approver', 'a named human domain administrator — the accountable owner of support.access; never the engineer'),
              NULL, '{}'::jsonb, NULL, NULL, p_actor, p_correlation);
  UPDATE service.support_grants SET review_task_id = (v_task ->> 'task_id')::uuid WHERE grant_id = p_grant;
  v_owner := service.owner_resolution(p_tenant, p_domain, 'support.access');
  v_item := executive.b33_raise_routed(p_tenant, p_domain, 'support.access', 'support_grant', p_grant, format('Support access requested for %s — awaiting the customer''s decision', c.case_ref),
              jsonb_build_array(jsonb_build_object('purpose', btrim(p_purpose), 'minutes', p_minutes, 'actions', to_jsonb(v_actions), 'owner', v_owner ->> 'state')),
              CASE WHEN v_owner ->> 'state' = 'resolved' THEN (v_owner -> 'principals' ->> 0)::uuid END, v_ev, 'grant.requested',
              jsonb_build_object('case_id', p_case, 'request_digest', v_digest), NULL, p_actor, p_correlation);
  RETURN jsonb_build_object('grant_id', p_grant, 'state', 'requested', 'case_id', p_case, 'case_ref', c.case_ref, 'purpose', btrim(p_purpose), 'object_scope', jsonb_build_object('sources', to_jsonb(v_sources)),
                            'action_scope', to_jsonb(v_actions), 'duration_minutes', p_minutes, 'request_digest', v_digest, 'task', v_task, 'item', v_item, 'owner', v_owner);
END $$;
REVOKE ALL ON FUNCTION service.request_support_grant(uuid, uuid, uuid, uuid, text, jsonb, text[], int, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION service.request_support_grant(uuid, uuid, uuid, uuid, text, jsonb, text[], int, uuid, uuid) TO eye_commit;

/* DECIDE (approve | deny) — the domain administrator: the approver test (a named human, never the engineer, never an implementation lead,
   never an agent), on the request's EXACT digest (stale → 409). APPROVE is HELD while the accountable owner of `support.access` is not
   `resolved` (IA-04-005: the act stops, the gap is raised and stays visible) and is the RESOLVED OWNER's act; the window starts now; the
   `support_access.expiry` timer is scheduled; the review task resolved and the support.access item closed; the preview the approver saw is
   recorded. A held approval is ANSWERED (held: true) so that its gap item and ledger event commit — the route then refuses 409 `held`. */
CREATE OR REPLACE FUNCTION service.decide_support_grant(p_grant uuid, p_tenant uuid, p_domain uuid, p_decision text, p_digest text, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = service, identity, onboarding, executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE g service.support_grants%ROWTYPE; c service.cases%ROWTYPE; v_owner jsonb; v_timer uuid; v_tasks jsonb; v_items jsonb; v_gap jsonb; v_ev uuid; v_preview jsonb; v_now timestamptz := clock_timestamp();
BEGIN
  PERFORM observation.assert_authority(ARRAY['service.grant.decide']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM service._sa_actor('support grant', p_actor);
  SELECT * INTO g FROM service.support_grants x WHERE x.grant_id = p_grant AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'support grant rejected (unknown_grant): no grant % in this domain', p_grant USING ERRCODE = '23503'; END IF;
  PERFORM onboarding.assert_approver('support grant', p_actor, p_tenant, p_domain, ARRAY['domain_admin'], g.engineer_principal_id, 'deciding support access');
  IF g.state <> 'requested' THEN RAISE EXCEPTION 'support grant rejected (state): the grant is %', g.state USING ERRCODE = '23505'; END IF;
  IF p_digest IS DISTINCT FROM g.request_digest THEN
    RAISE EXCEPTION 'support grant rejected (stale): the decision names digest % but the request is %', left(coalesce(p_digest, '<none>'), 12), left(g.request_digest, 12) USING ERRCODE = '23505';
  END IF;
  IF p_decision NOT IN ('approve', 'deny') THEN RAISE EXCEPTION 'support grant rejected (decision): approve or deny' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'support grant rejected (reason): a decision states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  SELECT * INTO c FROM service.cases x WHERE x.case_id = g.case_id;
  IF p_decision = 'deny' THEN
    UPDATE service.support_grants SET state = 'denied', decided_by = p_actor, decided_at = v_now, decision_reason = btrim(p_reason) WHERE grant_id = p_grant;
    v_tasks := executive._resolve_human_tasks(p_tenant, p_domain, jsonb_build_object('kind', 'support_grant', 'id', p_grant), ARRAY['support.access_review'], 'denied', p_grant, p_actor, p_correlation);
    v_items := executive.b33_close_items(p_tenant, p_domain, 'support.access', 'support_grant', p_grant, 'support access denied by the customer', p_actor, p_correlation);
    PERFORM onboarding.ledger('service', p_tenant, p_domain, 'support_grant', p_grant, NULL, 'grant.denied', p_actor,
              jsonb_build_object('reason', btrim(p_reason), 'request_digest', g.request_digest, 'tasks', v_tasks, 'items_closed', v_items), p_correlation);
    RETURN jsonb_build_object('grant_id', p_grant, 'state', 'denied', 'decided_by', p_actor, 'request_digest', g.request_digest);
  END IF;
  IF c.state = 'closed' THEN RAISE EXCEPTION 'support grant rejected (state): case % is closed — no access for a closed case', c.case_ref USING ERRCODE = '23505'; END IF;
  -- IA-04-005: no unambiguous accountable owner of support access → HOLD (the gap raised and kept visible; nothing approved)
  v_owner := service.owner_resolution(p_tenant, p_domain, 'support.access');
  IF v_owner ->> 'state' IS DISTINCT FROM 'resolved' THEN
    v_ev := onboarding.ledger('service', p_tenant, p_domain, 'support_grant', p_grant, NULL, 'grant.held', p_actor,
              jsonb_build_object('blocking', jsonb_build_array(jsonb_build_object('responsibility', 'support.access', 'state', v_owner ->> 'state', 'reason', v_owner ->> 'reason')),
                                 'request_digest', g.request_digest), p_correlation);
    v_gap := service._raise_gap(p_tenant, p_domain, 'support.access', v_owner, v_ev, 'grant.held', p_actor, p_correlation);
    RETURN jsonb_build_object('grant_id', p_grant, 'state', 'requested', 'held', true, 'owner', v_owner, 'gap', v_gap,
                              'blocking', jsonb_build_array(jsonb_build_object('responsibility', 'support.access', 'state', v_owner ->> 'state', 'reason', v_owner ->> 'reason',
                                                                               'escalation_path', v_owner ->> 'escalation_path')));
  END IF;
  IF NOT (p_actor = ANY (ARRAY(SELECT jsonb_array_elements_text(v_owner -> 'principals'))::uuid[])) OR (v_owner ->> 'owner_principal_id' IS NOT NULL AND (v_owner ->> 'owner_principal_id')::uuid <> p_actor) THEN
    RAISE EXCEPTION 'support grant rejected (authority): support access is approved by the accountable owner of support.access (%), not by another administrator', v_owner -> 'principals' ->> 0 USING ERRCODE = '42501';
  END IF;
  v_preview := jsonb_build_object('case_ref', c.case_ref, 'severity', c.severity, 'purpose', g.purpose, 'object_scope', g.object_scope, 'action_scope', to_jsonb(g.action_scope),
                                  'starts_at', v_now, 'expires_at', v_now + make_interval(mins => g.duration_minutes), 'duration_minutes', g.duration_minutes,
                                  'cannot', 'mutate customer decisions, evidence, policy or source state; read evidence content; read another source',
                                  'lapse', 'the session revoked with the grant; every port asks live_grant on the database clock; the support_access.expiry timer and the sweep mark it lapsed');
  v_timer := executive._schedule_timer(gen_random_uuid(), p_tenant, p_domain, 'grant', p_grant, 'support_access.expiry', v_now + make_interval(mins => g.duration_minutes),
                                       jsonb_build_object('support_grant', p_grant, 'engineer', g.engineer_principal_id), p_actor, p_correlation);
  UPDATE service.support_grants SET state = 'approved', decided_by = p_actor, decided_at = v_now, decision_reason = btrim(p_reason), starts_at = v_now,
         expires_at = v_now + make_interval(mins => g.duration_minutes), expiry_timer_id = v_timer, preview = v_preview WHERE grant_id = p_grant;
  v_tasks := executive._resolve_human_tasks(p_tenant, p_domain, jsonb_build_object('kind', 'support_grant', 'id', p_grant), ARRAY['support.access_review'], 'approved', p_grant, p_actor, p_correlation);
  v_items := executive.b33_close_items(p_tenant, p_domain, 'support.access', 'support_grant', p_grant, 'support access approved by the accountable owner', p_actor, p_correlation);
  v_items := v_items || executive.b33_close_items(p_tenant, p_domain, 'responsibility.gap', 'responsibility_matrix', service.gap_subject(p_tenant, p_domain, 'support.access'),
                                                  'the accountable owner of support.access is resolved and approved', p_actor, p_correlation);
  PERFORM onboarding.ledger('service', p_tenant, p_domain, 'support_grant', p_grant, NULL, 'grant.approved', p_actor,
            jsonb_build_object('reason', btrim(p_reason), 'request_digest', g.request_digest, 'preview', v_preview, 'timer', v_timer, 'owner', v_owner, 'tasks', v_tasks, 'items_closed', v_items), p_correlation);
  RETURN jsonb_build_object('grant_id', p_grant, 'state', 'approved', 'decided_by', p_actor, 'starts_at', v_now, 'expires_at', v_now + make_interval(mins => g.duration_minutes),
                            'expiry_timer_id', v_timer, 'preview', v_preview, 'request_digest', g.request_digest, 'held', false);
END $$;
REVOKE ALL ON FUNCTION service.decide_support_grant(uuid, uuid, uuid, text, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION service.decide_support_grant(uuid, uuid, uuid, text, text, text, uuid, uuid) TO eye_commit;

/* REVOKE (the domain administrator — a named human, never the engineer): immediate; the timer cancelled; the engineer's sessions revoked by
   the route next (identity authority). WITHDRAW (the engineer, its own requested or approved grant). */
CREATE OR REPLACE FUNCTION service.revoke_support_grant(p_grant uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = service, onboarding, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE g service.support_grants%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['service.grant.revoke']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM service._sa_actor('support grant', p_actor);
  SELECT * INTO g FROM service.support_grants x WHERE x.grant_id = p_grant AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'support grant rejected (unknown_grant): no grant % in this domain', p_grant USING ERRCODE = '23503'; END IF;
  PERFORM onboarding.assert_approver('support grant', p_actor, p_tenant, p_domain, ARRAY['domain_admin'], g.engineer_principal_id, 'revoking support access');
  IF g.state <> 'approved' THEN RAISE EXCEPTION 'support grant rejected (state): only an approved grant is revoked (the grant is %)', g.state USING ERRCODE = '23505'; END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'support grant rejected (reason): a revocation states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  RETURN service._end_support_grant(p_grant, p_tenant, p_domain, 'revoked', p_reason, true, p_actor, p_correlation);
END $$;
REVOKE ALL ON FUNCTION service.revoke_support_grant(uuid, uuid, uuid, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION service.revoke_support_grant(uuid, uuid, uuid, text, uuid, uuid) TO eye_commit;

CREATE OR REPLACE FUNCTION service.withdraw_support_grant(p_grant uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = service, onboarding, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE g service.support_grants%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['service.grant.withdraw']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM service._sa_actor('support grant', p_actor);
  SELECT * INTO g FROM service.support_grants x WHERE x.grant_id = p_grant AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'support grant rejected (unknown_grant): no grant % in this domain', p_grant USING ERRCODE = '23503'; END IF;
  IF g.engineer_principal_id <> p_actor THEN RAISE EXCEPTION 'support grant rejected (ownership): only the requesting engineer withdraws a grant' USING ERRCODE = '42501'; END IF;
  IF g.state NOT IN ('requested', 'approved') THEN RAISE EXCEPTION 'support grant rejected (state): the grant is %', g.state USING ERRCODE = '23505'; END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'support grant rejected (reason): a withdrawal states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  RETURN service._end_support_grant(p_grant, p_tenant, p_domain, 'withdrawn', p_reason, true, p_actor, p_correlation);
END $$;
REVOKE ALL ON FUNCTION service.withdraw_support_grant(uuid, uuid, uuid, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION service.withdraw_support_grant(uuid, uuid, uuid, text, uuid, uuid) TO eye_commit;

/* THE LAPSE, LAYER 3 — (a) the `support_access.expiry` timer's handler (the tick's workflow-timers step 20, under executive.attention.tick):
   the grant named by the timer lapses (skipped when it already ended); (b) THE SWEEP (the tick step `support-grant-expiry`, order 23 — B34's
   collab-grant-expiry idiom, inside the tick's write: nothing is written when nothing expired): every approved grant past its expiry lapses
   whatever happened to its timer; then the engineers still holding a session from before their grant ended are READ for the after-tick hook
   `support-access`, which revokes them through the identity authority (never nested in the tick's write). */
CREATE OR REPLACE FUNCTION service.lapse_support_grant(p_timer uuid, p_tenant uuid, p_domain uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = service, executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE t executive.workflow_timers%ROWTYPE; g service.support_grants%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.attention.tick']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM service._sa_actor('support grant', p_actor);
  SELECT * INTO t FROM executive.workflow_timers x WHERE x.timer_id = p_timer AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND OR t.kind <> 'support_access.expiry' OR t.owner_kind <> 'grant' THEN
    RAISE EXCEPTION 'support grant rejected (unknown_timer): % is not a support access expiry of this domain', p_timer USING ERRCODE = '23503';
  END IF;
  SELECT * INTO g FROM service.support_grants x WHERE x.grant_id = t.owner_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('skipped', true, 'reason', 'no support grant names this timer'); END IF;
  IF g.state <> 'approved' THEN RETURN jsonb_build_object('skipped', true, 'grant_id', g.grant_id, 'reason', format('the grant is already %s', g.state)); END IF;
  IF g.expires_at > clock_timestamp() THEN RETURN jsonb_build_object('skipped', true, 'grant_id', g.grant_id, 'reason', 'the grant has not expired'); END IF;
  RETURN service._end_support_grant(g.grant_id, p_tenant, p_domain, 'lapsed', 'the grant expired (support_access.expiry timer)', false, p_actor, p_correlation) || jsonb_build_object('via', 'timer');
END $$;
REVOKE ALL ON FUNCTION service.lapse_support_grant(uuid, uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION service.lapse_support_grant(uuid, uuid, uuid, uuid, uuid) TO eye_commit;

CREATE OR REPLACE FUNCTION service.sweep_support_grants(p_tenant uuid, p_domain uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = service, executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE g record; v_out jsonb := '[]'::jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.attention.tick']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM service._sa_actor('support grant', p_actor);
  FOR g IN SELECT x.grant_id FROM service.support_grants x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.state = 'approved' AND x.expires_at <= clock_timestamp()
            ORDER BY x.expires_at FOR UPDATE SKIP LOCKED LOOP
    v_out := v_out || (service._end_support_grant(g.grant_id, p_tenant, p_domain, 'lapsed', 'the grant expired (sweep)', true, p_actor, p_correlation) || jsonb_build_object('via', 'sweep'));
  END LOOP;
  RETURN jsonb_build_object('lapsed', v_out, 'access_pending', service._support_access_pending(p_tenant, p_domain));
END $$;
REVOKE ALL ON FUNCTION service.sweep_support_grants(uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION service.sweep_support_grants(uuid, uuid, uuid, uuid) TO eye_commit;

/* What the identity authority still has to revoke (the revoke and drill routes read it after their own end). */
CREATE OR REPLACE FUNCTION service.support_access_pending(p_tenant uuid, p_domain uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = service, observation, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.attention.tick', 'service.grant.revoke', 'service.drill.run', 'service.grant.withdraw']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  RETURN service._support_access_pending(p_tenant, p_domain);
END $$;
REVOKE ALL ON FUNCTION service.support_access_pending(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION service.support_access_pending(uuid, uuid) TO eye_commit;

/* THE DIAGNOSTIC READS (the engineer's ONLY reads — support.diagnose.source | .runs | .health | .schedule, each its own exact PDP rule): the
   LIVE GRANT asked FIRST (for the case, the act, the named source — the database clock), EVERY attempt LOGGED in service.access_log with its
   grant (allowed) or without one (refused, with why). Reads only the named source's contract STATE (never its endpoints or contract body),
   recent runs, health transitions and scheduler state — never evidence content, never another source. A refusal is ANSWERED (refused: true)
   so the log row commits; the route then refuses 403 `access`. */
CREATE OR REPLACE FUNCTION service.diagnose(p_tenant uuid, p_domain uuid, p_case uuid, p_source uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = service, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_bound text := public.eye_bound_action(); v_act text; v_grant uuid; v_why text; v_data jsonb; v_log uuid; gg service.support_grants%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['support.diagnose.source', 'support.diagnose.runs', 'support.diagnose.health', 'support.diagnose.schedule']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM service._sa_actor('support access', p_actor);
  v_act := 'diagnose.' || split_part(v_bound, '.', 3);
  v_grant := service.live_grant(p_tenant, p_domain, p_actor, p_case, v_act, p_source);
  IF v_grant IS NULL THEN
    -- why: the most recent grant of this engineer for the case says it
    SELECT * INTO gg FROM service.support_grants g WHERE g.tenant_id = p_tenant AND g.domain_id = p_domain AND g.engineer_principal_id = p_actor AND (p_case IS NULL OR g.case_id = p_case)
     ORDER BY coalesce(g.decided_at, g.requested_at) DESC LIMIT 1;
    v_why := CASE WHEN gg.grant_id IS NULL THEN 'no support grant for this engineer and case'
                  WHEN gg.state = 'approved' AND clock_timestamp() >= gg.expires_at THEN format('grant %s expired at %s', gg.grant_id, gg.expires_at)
                  WHEN gg.state <> 'approved' THEN format('grant %s is %s', gg.grant_id, gg.state)
                  WHEN NOT (v_act = ANY (gg.action_scope)) THEN format('%s is outside grant %s''s action scope', v_act, gg.grant_id)
                  ELSE format('source %s is outside grant %s''s object scope', p_source, gg.grant_id) END;
    v_log := service.log_access(p_tenant, p_domain, gg.grant_id, p_actor, v_bound, 'source', p_source::text, 'refused',
                                jsonb_build_object('why', v_why, 'case_id', p_case, 'grant_state', gg.state), p_correlation);
    RETURN jsonb_build_object('refused', true, 'reason', v_why, 'log_id', v_log, 'grant_id', gg.grant_id);
  END IF;
  v_data := CASE v_act
    WHEN 'diagnose.source' THEN (SELECT jsonb_build_object('source_id', s.source_id, 'contract_version', s.contract_version, 'source_key', s.source_key, 'name', s.name, 'publisher', s.publisher,
                                   'connector_kind', s.connector_kind, 'acquisition_mode', s.acquisition_mode, 'lifecycle_state', s.lifecycle_state, 'rights_state', s.rights_state,
                                   'cadence_seconds', s.cadence_seconds, 'freshness_threshold_seconds', s.freshness_threshold_seconds, 'effective_from', s.effective_from, 'updated_at', s.updated_at)
                                 FROM observation.source_contracts_current s WHERE s.source_id = p_source AND s.tenant_id = p_tenant AND s.domain_id = p_domain ORDER BY s.contract_version DESC LIMIT 1)
    WHEN 'diagnose.runs' THEN (SELECT coalesce(jsonb_agg(jsonb_build_object('run_id', r.run_id, 'contract_version', r.contract_version, 'state', r.state, 'started_at', r.started_at, 'finished_at', r.finished_at,
                                   'items_fetched', r.items_fetched, 'items_admitted', r.items_admitted, 'items_quarantined', r.items_quarantined, 'items_noop', r.items_noop,
                                   'failure_reason', r.failure_reason) ORDER BY r.started_at DESC), '[]'::jsonb)
                               FROM (SELECT * FROM observation.collection_runs_current r0 WHERE r0.source_id = p_source AND r0.tenant_id = p_tenant AND r0.domain_id = p_domain
                                      ORDER BY r0.started_at DESC LIMIT 20) r)
    WHEN 'diagnose.health' THEN (SELECT coalesce(jsonb_agg(jsonb_build_object('prior_state', hh.prior_state, 'new_state', hh.new_state, 'evaluated_at', hh.evaluated_at, 'reason', hh.reason,
                                   'lag_class', hh.lag_class, 'calc_version', hh.calc_version) ORDER BY hh.evaluated_at DESC), '[]'::jsonb)
                                 FROM (SELECT * FROM observation.source_health_events h0 WHERE h0.source_id = p_source AND h0.tenant_id = p_tenant AND h0.domain_id = p_domain
                                        ORDER BY h0.evaluated_at DESC LIMIT 20) hh)
    ELSE jsonb_build_object(
           'entries', (SELECT coalesce(jsonb_agg(jsonb_build_object('scheduler_id', e.scheduler_id, 'contract_version', e.contract_version, 'queue_name', e.queue_name, 'cadence_seconds', e.cadence_seconds,
                         'status', e.status, 'created_at', e.created_at, 'removed_at', e.removed_at) ORDER BY e.created_at DESC), '[]'::jsonb)
                         FROM observation.scheduler_entries e WHERE e.source_id = p_source AND e.tenant_id = p_tenant AND e.domain_id = p_domain),
           'attempts', (SELECT coalesce(jsonb_agg(jsonb_build_object('attempt_id', a.attempt_id, 'trigger', a.trigger, 'started_at', a.started_at, 'finished_at', a.finished_at, 'outcome', a.outcome,
                          'reason', a.reason, 'run_id', a.run_id) ORDER BY a.started_at DESC), '[]'::jsonb)
                          FROM (SELECT * FROM observation.scheduled_attempts a0 WHERE a0.source_id = p_source AND a0.tenant_id = p_tenant AND a0.domain_id = p_domain
                                 ORDER BY a0.started_at DESC LIMIT 20) a))
  END;
  v_log := service.log_access(p_tenant, p_domain, v_grant, p_actor, v_bound, 'source', p_source::text, 'allowed', jsonb_build_object('case_id', p_case), p_correlation);
  RETURN jsonb_build_object('refused', false, 'grant_id', v_grant, 'log_id', v_log, 'action', v_bound, 'source_id', p_source, 'data', v_data,
                            'never', 'evidence content, another source, or any write');
END $$;
REVOKE ALL ON FUNCTION service.diagnose(uuid, uuid, uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION service.diagnose(uuid, uuid, uuid, uuid, uuid, uuid) TO eye_commit;

-- §SA.8 CUSTOMER-CONTROL DRILLS, THE JOINT EXERCISE, THE ADMISSION RECORD (CAP-TR-12, IA-04-006) ─────────────────────────────────────────────
/* A DRILL (the domain administrator — a named human, never the engineer): `revoke_live_grant` revokes a LIVE grant and probes the live-grant
   test for every action × named object of its scope (and the case acts with no object) — every probe must answer no grant (passed); each
   probe logged refused with the drill's id. `expired_grant_refused` probes a grant past its expiry (swept or not) the same way. */
CREATE OR REPLACE FUNCTION service.run_control_drill(p_drill uuid, p_tenant uuid, p_domain uuid, p_kind text, p_grant uuid, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = service, onboarding, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE g service.support_grants%ROWTYPE; v_before uuid; v_end jsonb; a text; s text; v_probe uuid; v_probes jsonb := '[]'::jsonb; v_live int := 0; v_outcome text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['service.drill.run']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM service._sa_actor('control drill', p_actor);
  IF p_kind NOT IN ('revoke_live_grant', 'expired_grant_refused') THEN RAISE EXCEPTION 'control drill rejected (kind): revoke_live_grant or expired_grant_refused' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'control drill rejected (reason): a drill states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  SELECT * INTO g FROM service.support_grants x WHERE x.grant_id = p_grant AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'control drill rejected (unknown_grant): no grant % in this domain', p_grant USING ERRCODE = '23503'; END IF;
  PERFORM onboarding.assert_approver('control drill', p_actor, p_tenant, p_domain, ARRAY['domain_admin'], g.engineer_principal_id, 'running a customer-control drill');
  IF p_kind = 'revoke_live_grant' THEN
    v_before := service.live_grant(p_tenant, p_domain, g.engineer_principal_id, g.case_id, g.action_scope[1], CASE WHEN g.action_scope[1] LIKE 'diagnose.%' THEN (g.object_scope -> 'sources' ->> 0)::uuid END);
    IF g.state <> 'approved' OR clock_timestamp() >= g.expires_at OR v_before IS NULL THEN
      RAISE EXCEPTION 'control drill rejected (state): revoke_live_grant needs a LIVE grant (the grant is %)', CASE WHEN g.state = 'approved' THEN 'expired' ELSE g.state END USING ERRCODE = '23505';
    END IF;
    v_end := service._end_support_grant(p_grant, p_tenant, p_domain, 'revoked', 'customer-control drill: ' || btrim(p_reason), true, p_actor, p_correlation);
  ELSE
    IF NOT (g.state = 'lapsed' OR (g.state = 'approved' AND clock_timestamp() >= g.expires_at)) THEN
      RAISE EXCEPTION 'control drill rejected (state): expired_grant_refused needs a grant past its expiry (the grant is %)', g.state USING ERRCODE = '23505';
    END IF;
  END IF;
  FOREACH a IN ARRAY g.action_scope LOOP
    IF a LIKE 'diagnose.%' THEN
      FOR s IN SELECT jsonb_array_elements_text(g.object_scope -> 'sources') LOOP
        v_probe := service.live_grant(p_tenant, p_domain, g.engineer_principal_id, g.case_id, a, s::uuid);
        v_live := v_live + CASE WHEN v_probe IS NULL THEN 0 ELSE 1 END;
        PERFORM service.log_access(p_tenant, p_domain, p_grant, g.engineer_principal_id, 'support.' || a, 'source', s, CASE WHEN v_probe IS NULL THEN 'refused' ELSE 'allowed' END,
                                   jsonb_build_object('drill', p_drill, 'probe', true, 'by', p_actor), p_correlation);
        v_probes := v_probes || jsonb_build_object('action', a, 'object', s, 'live_grant', v_probe);
      END LOOP;
    ELSE
      v_probe := service.live_grant(p_tenant, p_domain, g.engineer_principal_id, g.case_id, a, NULL);
      v_live := v_live + CASE WHEN v_probe IS NULL THEN 0 ELSE 1 END;
      PERFORM service.log_access(p_tenant, p_domain, p_grant, g.engineer_principal_id, 'service.' || a, 'case', g.case_id::text, CASE WHEN v_probe IS NULL THEN 'refused' ELSE 'allowed' END,
                                 jsonb_build_object('drill', p_drill, 'probe', true, 'by', p_actor), p_correlation);
      v_probes := v_probes || jsonb_build_object('action', a, 'object', NULL, 'live_grant', v_probe);
    END IF;
  END LOOP;
  v_outcome := CASE WHEN v_live = 0 THEN 'passed' ELSE 'failed' END;
  INSERT INTO service.control_drills (drill_id, tenant_id, domain_id, kind, grant_id, reason, outcome, evidence, run_by, correlation_id)
  VALUES (p_drill, p_tenant, p_domain, p_kind, p_grant, btrim(p_reason), v_outcome,
          jsonb_build_object('live_before', v_before, 'ended', v_end, 'probes', v_probes, 'live_after', v_live, 'engineer', g.engineer_principal_id, 'expires_at', g.expires_at), p_actor, p_correlation);
  PERFORM onboarding.ledger('service', p_tenant, p_domain, 'control_drill', p_drill, NULL, 'drill.run', p_actor,
            jsonb_build_object('kind', p_kind, 'grant_id', p_grant, 'outcome', v_outcome, 'probes', jsonb_array_length(v_probes), 'live_after', v_live), p_correlation);
  RETURN jsonb_build_object('drill_id', p_drill, 'kind', p_kind, 'grant_id', p_grant, 'outcome', v_outcome, 'probes', v_probes, 'engineer', g.engineer_principal_id, 'ended', v_end);
END $$;
REVOKE ALL ON FUNCTION service.run_control_drill(uuid, uuid, uuid, text, uuid, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION service.run_control_drill(uuid, uuid, uuid, text, uuid, text, uuid, uuid) TO eye_commit;

/* A JOINT EXERCISE recorded (the domain administrator or the onboarding authority, a named human): customer participants (active humans of the
   tenant, no support engineer) and vendor participants (support engineers of the domain), held on a day not in the future. */
CREATE OR REPLACE FUNCTION service.record_joint_exercise(p_exercise uuid, p_tenant uuid, p_domain uuid, p_title text, p_scenario text, p_held_on date, p_customer uuid[], p_vendor uuid[],
                                                         p_outcome text, p_findings text, p_evidence jsonb, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = service, onboarding, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE x uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['service.exercise.record']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM service._sa_actor('admission record', p_actor);
  PERFORM onboarding.assert_approver('admission record', p_actor, p_tenant, p_domain, ARRAY['domain_admin', 'onboarding_authority'], NULL, 'recording a joint operating exercise');
  IF length(btrim(coalesce(p_title, ''))) NOT BETWEEN 4 AND 200 OR length(btrim(coalesce(p_scenario, ''))) < 12 THEN
    RAISE EXCEPTION 'admission record rejected (exercise): a joint exercise has a title and a scenario (12+ characters)' USING ERRCODE = '22023';
  END IF;
  IF p_held_on IS NULL OR p_held_on > (clock_timestamp() AT TIME ZONE 'UTC')::date THEN RAISE EXCEPTION 'admission record rejected (exercise): an exercise was held on a day not in the future' USING ERRCODE = '22023'; END IF;
  IF p_outcome NOT IN ('completed', 'completed_with_findings', 'failed') THEN RAISE EXCEPTION 'admission record rejected (exercise): the outcome is completed, completed_with_findings or failed' USING ERRCODE = '22023'; END IF;
  IF cardinality(coalesce(p_customer, '{}')) = 0 OR cardinality(coalesce(p_vendor, '{}')) = 0 THEN
    RAISE EXCEPTION 'admission record rejected (exercise): a JOINT exercise names customer and vendor participants' USING ERRCODE = '22023';
  END IF;
  FOREACH x IN ARRAY p_customer LOOP
    IF NOT decision.is_active_human(x, p_tenant) OR service._is_support_engineer(x, p_tenant) THEN
      RAISE EXCEPTION 'admission record rejected (exercise): customer participant % is not an active human member of the tenant', x USING ERRCODE = '22023';
    END IF;
  END LOOP;
  FOREACH x IN ARRAY p_vendor LOOP
    IF NOT onboarding.holds_role(x, p_tenant, p_domain, ARRAY['support_engineer']) THEN
      RAISE EXCEPTION 'admission record rejected (exercise): vendor participant % is not a support engineer of the domain', x USING ERRCODE = '22023';
    END IF;
  END LOOP;
  INSERT INTO service.joint_exercises (exercise_id, tenant_id, domain_id, title, scenario, held_on, customer_participants, vendor_participants, outcome, findings, evidence_refs, recorded_by, correlation_id)
  VALUES (p_exercise, p_tenant, p_domain, btrim(p_title), btrim(p_scenario), p_held_on, p_customer, p_vendor, p_outcome, nullif(btrim(coalesce(p_findings, '')), ''), coalesce(p_evidence, '[]'::jsonb),
          p_actor, p_correlation);
  PERFORM onboarding.ledger('service', p_tenant, p_domain, 'joint_exercise', p_exercise, NULL, 'exercise.recorded', p_actor,
            jsonb_build_object('title', btrim(p_title), 'held_on', p_held_on, 'outcome', p_outcome, 'claim', 'demonstration'), p_correlation);
  RETURN jsonb_build_object('exercise_id', p_exercise, 'held_on', p_held_on, 'outcome', p_outcome, 'claim', 'demonstration');
END $$;
REVOKE ALL ON FUNCTION service.record_joint_exercise(uuid, uuid, uuid, text, text, date, uuid[], uuid[], text, text, jsonb, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION service.record_joint_exercise(uuid, uuid, uuid, text, text, date, uuid[], uuid[], text, text, jsonb, uuid, uuid) TO eye_commit;

/* PROPOSE an admission record (the implementation lead or the domain administrator): HELD (409) unless the profile's approved matrix is
   SIGNED, at least one drill in the period PASSED and at least one named joint exercise was held in the period. The grant ledger of the
   period (every grant, its window and end) and its access-log counts are assembled and digested; the record binds the baseline digest, the
   profile and the period. A newer version supersedes an open proposal. */
CREATE OR REPLACE FUNCTION service.propose_admission(p_admission uuid, p_tenant uuid, p_domain uuid, p_profile text, p_from date, p_to date, p_baseline_digest text, p_exercises uuid[],
                                                     p_expected_version int, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = service, onboarding, executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE m service.responsibility_matrices%ROWTYPE; v_cur int; v_matrix jsonb; v_ledger jsonb; v_drills jsonb; v_ex jsonb; v_digest text; v_version int; v_blocking jsonb := '[]'::jsonb;
        v_lo timestamptz; v_hi timestamptz; v_profile text := coalesce(p_profile, 'local-dev');
BEGIN
  PERFORM observation.assert_authority(ARRAY['service.admission.propose']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM service._sa_actor('admission record', p_actor);
  IF NOT onboarding.holds_role(p_actor, p_tenant, p_domain, ARRAY['implementation_lead', 'domain_admin']) OR service._is_support_engineer(p_actor, p_tenant) THEN
    RAISE EXCEPTION 'admission record rejected (authority): an admission record is assembled by the implementation lead or the domain administrator' USING ERRCODE = '42501';
  END IF;
  IF coalesce(p_baseline_digest, '') !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'admission record rejected (baseline): the record binds the configuration baseline''s digest (64 hex)' USING ERRCODE = '22023'; END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from OR p_to > (clock_timestamp() AT TIME ZONE 'UTC')::date THEN
    RAISE EXCEPTION 'admission record rejected (period): a period from ≤ to, ending no later than today' USING ERRCODE = '22023';
  END IF;
  v_lo := (p_from::timestamp AT TIME ZONE 'UTC'); v_hi := ((p_to + 1)::timestamp AT TIME ZONE 'UTC');
  SELECT coalesce(max(a.version), 0) INTO v_cur FROM service.admission_records a WHERE a.admission_id = p_admission;
  IF EXISTS (SELECT 1 FROM service.admission_records a WHERE a.admission_id = p_admission AND (a.tenant_id <> p_tenant OR a.domain_id <> p_domain)) THEN
    RAISE EXCEPTION 'admission record rejected (unknown_admission): % is not an admission record of this domain', p_admission USING ERRCODE = '23503';
  END IF;
  IF p_expected_version IS DISTINCT FROM v_cur THEN
    RAISE EXCEPTION 'admission record rejected (stale): the record is at version % (expected %)', v_cur, coalesce(p_expected_version::text, '<none>') USING ERRCODE = '23505';
  END IF;
  SELECT * INTO m FROM service.responsibility_matrices x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.deployment_profile = v_profile AND x.state = 'approved';
  IF m.matrix_id IS NULL OR m.signature_id IS NULL THEN
    v_blocking := v_blocking || jsonb_build_object('item', 'signed_matrix', 'reason', format('no signed responsibility matrix for %s', v_profile));
  ELSE
    v_matrix := jsonb_build_object('matrix_id', m.matrix_id, 'version', m.version, 'digest', m.digest, 'signature_id', m.signature_id, 'decided_by', m.decided_by, 'decided_at', m.decided_at);
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('drill_id', d.drill_id, 'kind', d.kind, 'grant_id', d.grant_id, 'outcome', d.outcome, 'run_at', d.run_at) ORDER BY d.run_at), '[]'::jsonb) INTO v_drills
    FROM service.control_drills d WHERE d.tenant_id = p_tenant AND d.domain_id = p_domain AND d.run_at >= v_lo AND d.run_at < v_hi;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_drills) d WHERE d ->> 'outcome' = 'passed') THEN
    v_blocking := v_blocking || jsonb_build_object('item', 'control_drill', 'reason', 'no customer-control drill passed in the period');
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('exercise_id', e.exercise_id, 'title', e.title, 'held_on', e.held_on, 'outcome', e.outcome, 'claim', e.claim) ORDER BY e.held_on), '[]'::jsonb) INTO v_ex
    FROM service.joint_exercises e WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain AND e.exercise_id = ANY (coalesce(p_exercises, '{}')) AND e.held_on BETWEEN p_from AND p_to;
  IF jsonb_array_length(v_ex) = 0 OR jsonb_array_length(v_ex) <> cardinality(coalesce(p_exercises, '{}')) THEN
    v_blocking := v_blocking || jsonb_build_object('item', 'joint_exercise', 'reason', 'every named joint exercise is of this domain and held in the period (at least one)');
  END IF;
  IF jsonb_array_length(v_blocking) > 0 THEN
    RAISE EXCEPTION 'admission record rejected (held): %', (SELECT string_agg(b ->> 'reason', '; ') FROM jsonb_array_elements(v_blocking) b) USING ERRCODE = '23505';
  END IF;
  SELECT jsonb_build_object(
      'grants', coalesce(jsonb_agg(jsonb_build_object('grant_id', g.grant_id, 'case_id', g.case_id, 'engineer', g.engineer_principal_id, 'state', g.state, 'purpose', g.purpose,
                  'action_scope', to_jsonb(g.action_scope), 'object_scope', g.object_scope, 'requested_at', g.requested_at, 'decided_by', g.decided_by, 'starts_at', g.starts_at,
                  'expires_at', g.expires_at, 'ended_at', g.ended_at, 'end_reason', g.end_reason, 'request_digest', g.request_digest) ORDER BY g.requested_at), '[]'::jsonb),
      'access_log', (SELECT jsonb_build_object('allowed', count(*) FILTER (WHERE l.outcome = 'allowed'), 'refused', count(*) FILTER (WHERE l.outcome = 'refused'))
                       FROM service.access_log l WHERE l.tenant_id = p_tenant AND l.domain_id = p_domain AND l.at >= v_lo AND l.at < v_hi))
    INTO v_ledger FROM service.support_grants g WHERE g.tenant_id = p_tenant AND g.domain_id = p_domain AND g.requested_at >= v_lo AND g.requested_at < v_hi;
  v_ledger := v_ledger || jsonb_build_object('digest', onboarding.digest(v_ledger));
  v_version := v_cur + 1;
  v_digest := onboarding.digest(jsonb_build_object('admission_id', p_admission, 'version', v_version, 'profile', v_profile, 'period', jsonb_build_array(p_from, p_to),
                                                   'baseline_digest', p_baseline_digest, 'matrix', v_matrix, 'grant_ledger', v_ledger, 'drills', v_drills, 'exercises', v_ex));
  UPDATE service.admission_records SET state = 'superseded' WHERE admission_id = p_admission AND state = 'proposed';
  INSERT INTO service.admission_records (admission_id, version, tenant_id, domain_id, deployment_profile, period_from, period_to, baseline_digest, matrix, grant_ledger, drills, exercises, digest,
                                         proposed_by, correlation_id)
  VALUES (p_admission, v_version, p_tenant, p_domain, v_profile, p_from, p_to, p_baseline_digest, v_matrix, v_ledger, v_drills, v_ex, v_digest, p_actor, p_correlation);
  PERFORM onboarding.ledger('service', p_tenant, p_domain, 'admission_record', p_admission, v_version, 'admission.proposed', p_actor,
            jsonb_build_object('digest', v_digest, 'profile', v_profile, 'period', jsonb_build_array(p_from, p_to), 'baseline_digest', p_baseline_digest, 'grants', jsonb_array_length(v_ledger -> 'grants'),
                               'drills', jsonb_array_length(v_drills), 'exercises', jsonb_array_length(v_ex)), p_correlation);
  RETURN jsonb_build_object('admission_id', p_admission, 'version', v_version, 'state', 'proposed', 'digest', v_digest, 'matrix', v_matrix, 'grant_ledger', v_ledger, 'drills', v_drills,
                            'exercises', v_ex, 'production_admission', 'R1: production admission is external — this record is construction evidence');
END $$;
REVOKE ALL ON FUNCTION service.propose_admission(uuid, uuid, uuid, text, date, date, text, uuid[], int, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION service.propose_admission(uuid, uuid, uuid, text, date, date, text, uuid[], int, uuid, uuid) TO eye_commit;

/* DECIDE (sign | reject) — the onboarding authority (the approver test), on the exact digest; SIGN needs the decider's signature over the
   digest recorded under this action (subject `admission_record`); a prior signed version is superseded. */
CREATE OR REPLACE FUNCTION service.decide_admission(p_admission uuid, p_version int, p_tenant uuid, p_domain uuid, p_decision text, p_digest text, p_reason text, p_signature uuid,
                                                    p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = service, onboarding, executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE a service.admission_records%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['service.admission.decide']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM service._sa_actor('admission record', p_actor);
  SELECT * INTO a FROM service.admission_records x WHERE x.admission_id = p_admission AND x.version = p_version AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'admission record rejected (unknown_admission): no admission record %/v% in this domain', p_admission, p_version USING ERRCODE = '23503'; END IF;
  PERFORM onboarding.assert_approver('admission record', p_actor, p_tenant, p_domain, ARRAY['onboarding_authority'], a.proposed_by, 'signing an admission record');
  IF a.state <> 'proposed' THEN RAISE EXCEPTION 'admission record rejected (state): version % is %', p_version, a.state USING ERRCODE = '23505'; END IF;
  IF p_digest IS DISTINCT FROM a.digest THEN RAISE EXCEPTION 'admission record rejected (stale): the decision names a digest other than version %''s', p_version USING ERRCODE = '23505'; END IF;
  IF p_decision NOT IN ('sign', 'reject') THEN RAISE EXCEPTION 'admission record rejected (decision): sign or reject' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'admission record rejected (reason): a decision states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  IF p_decision = 'reject' THEN
    UPDATE service.admission_records SET state = 'rejected', decided_by = p_actor, decided_at = clock_timestamp(), decision_reason = btrim(p_reason) WHERE admission_id = p_admission AND version = p_version;
  ELSE
    IF p_signature IS NULL OR NOT EXISTS (SELECT 1 FROM executive.signatures s WHERE s.signature_id = p_signature AND s.subject_kind = 'admission_record' AND s.subject_id = p_admission
                                                     AND s.subject_version = p_version AND s.subject_digest = a.digest AND s.signer = p_actor AND s.bound_action = 'service.admission.decide') THEN
      RAISE EXCEPTION 'admission record rejected (signature): signing carries the decider''s signature over the record''s digest' USING ERRCODE = '22023';
    END IF;
    UPDATE service.admission_records SET state = 'superseded' WHERE admission_id = p_admission AND state = 'signed';
    UPDATE service.admission_records SET state = 'signed', decided_by = p_actor, decided_at = clock_timestamp(), decision_reason = btrim(p_reason), signature_id = p_signature
     WHERE admission_id = p_admission AND version = p_version;
  END IF;
  PERFORM onboarding.ledger('service', p_tenant, p_domain, 'admission_record', p_admission, p_version, CASE WHEN p_decision = 'sign' THEN 'admission.signed' ELSE 'admission.rejected' END, p_actor,
            jsonb_build_object('digest', a.digest, 'reason', btrim(p_reason), 'signature_id', p_signature, 'production_admission', 'R1'), p_correlation);
  RETURN jsonb_build_object('admission_id', p_admission, 'version', p_version, 'state', CASE WHEN p_decision = 'sign' THEN 'signed' ELSE 'rejected' END, 'digest', a.digest, 'signature_id', p_signature,
                            'production_admission', 'R1: production admission is external — this signed record is construction evidence');
END $$;
REVOKE ALL ON FUNCTION service.decide_admission(uuid, int, uuid, uuid, text, text, text, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION service.decide_admission(uuid, int, uuid, uuid, text, text, text, uuid, uuid, uuid) TO eye_commit;
