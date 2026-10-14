-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0115 — CP-6 B107: GOVERNANCE REGISTRIES, TRACEABILITY AND CONFORMANCE MANIFESTS; THE PRODUCT-GOVERNANCE WORKSPACE; DESIGN GOVERNANCE;
-- ACCEPTANCE RECORDS (F-R0-04 scope-specific product acceptance records and evidence expiry; F-P7D-25 governance registries, traceability,
-- conformance manifests and operational acceptance; F-P7-E-17 design governance, doctrine and design acceptance records; F-P7-F-12 the
-- product governance workspace: baseline, decision rights, traceability, exceptions). 0001–0114 are applied and frozen and untouched.
--
-- §0 PRELUDE — the schema `governance` and its ledger, the five PLATFORM roles, the vocabularies (attention, tasks, timers, signatures:
-- copied whole, plus B107's), the shared core every part writes through: the ARTIFACTS (one identity per governed thing, vendor-side or
-- tenant-side), the LINKS between them (append-only), the platform SIGNATURES (a sibling of executive.signatures — B36's table untouched),
-- the HOLDS on a subject (a release candidate held by an expired exception, a conflict, stale evidence, a constrained acceptance), and the
-- approver test generalised (never the proposer, never the builder, never an agent). The parts' ports, tables and pages follow in their
-- sections (§RG, §CM, §DR, §PG, §AR, §DG).
--
-- THE PRINCIPLES (stated once, enforced by the ports):
--   * every acceptance, attestation, baseline decision, exception approval, design acceptance and change approval is a named active
--     HUMAN's act, never an agent's, never the proposer's, never the builder's; an exception's approver is never the owner whose authority
--     it expands (ES-02-004); one role never accepts all obligations (ES-71-002);
--   * evidence EXPIRES; an expired item constrains the record to its previously accepted unaffected scope (FEX-31) and holds expansion;
--     an expired exception holds the affected release candidate until renewal with current evidence (V03-T-453); a conformance conflict
--     holds the release at the last conformant candidate (FEX-32);
--   * the repository's registers (audit/requirements/*.csv, the tracker, EXCEPTIONS.md, DECISIONS.md, the C15 scanner dispositions) are
--     IMPORTED read-only — they stay authoritative; the product never writes them, never marks a unit verified:all, never governs the C15
--     records or the owner's standing authorization;
--   * THREE CLAIMS never mixed: construction (this software and its harnesses); demonstrated operation (the act — every record
--     `claim = 'demonstration'`); real acceptance (named independent / customer authorities, production admission: R1/R2/H2/H3) — never
--     claimed, and no record of this migration can carry it.
-- SUBSTITUTED (the owner may revise): B65 (signed releases) by a local RELEASE-CANDIDATE record, explicitly not a release; B64 (SLO
-- computation) by DECLARED SLO targets in the manifests. Out of scope and unchanged: B103, R2, H1, B106, B108, B109/B110, B80, the C15–C19
-- controls and the C15 standing authorization, .github/workflows/*.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- §0.1 THE SCHEMA ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS governance;
GRANT USAGE ON SCHEMA governance TO eye_app, eye_commit;

-- §0.2 THE ROLES (PLATFORM: vendor-side product governance) ─────────────────────────────────────────────────────────────────────────────────
INSERT INTO identity.roles (code, scope, description) VALUES
  ('product_authority', 'PLATFORM', 'The executive product authority (B107): signs the capability baseline and decision rights, accepts releases and capabilities for a declared scope — a named human, never the proposer or the builder'),
  ('design_system_authority', 'PLATFORM', 'The design system authority (B107): accepts design-system contributions, component and pattern versions and design acceptance records — never the proposer'),
  ('independent_assurance', 'PLATFORM', 'Independent assurance (B107): attests acceptance evidence and approves exceptions independently — never a builder of the subject, never the owner whose authority an exception expands'),
  ('operations_authority', 'PLATFORM', 'The operations authority (B107): attests operational acceptance (support model, runbooks, withdrawal criteria) — a named human'),
  ('conformance_steward', 'PLATFORM', 'The conformance steward (B107): imports the registries, generates manifests, runs conformance checks and opens findings — approves and accepts nothing')
ON CONFLICT (code) DO NOTHING;

-- §0.3 THE VOCABULARIES ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
-- (a) attention (0114 §0.3's function and both CHECKs, copied whole, plus B107's): governance.exception (an exception expiring / expired, a
-- release held), governance.acceptance (evidence expiring, a record constrained, an obligation awaiting attestation), governance.conformance
-- (a conformance finding: drift, an unmapped unit, stale evidence), governance.conflict (a cross-volume conflict holding a release),
-- governance.ownership (an ownership gap, a stewardship case past its SLA).
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
  'onboarding.migration', 'onboarding.drift', 'implementation.readiness', 'service.case', 'support.access', 'responsibility.gap',
  -- B107 (0115)
  'governance.exception', 'governance.acceptance', 'governance.conformance', 'governance.conflict', 'governance.ownership'] $$;
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
  'onboarding.migration', 'onboarding.drift', 'implementation.readiness', 'service.case', 'support.access', 'responsibility.gap',
  -- B107 (0115)
  'governance.exception', 'governance.acceptance', 'governance.conformance', 'governance.conflict', 'governance.ownership'));
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
  'support_grant', 'responsibility_matrix',
  -- B107 (0115)
  'acceptance_record', 'governance_exception', 'release_candidate', 'conformance_finding', 'stewardship_case', 'design_contribution', 'change_proposal'));

-- (b) human tasks (0114 §0.3b copied whole, plus B107's), their subjects and the workflow timers (0090's three lists, copied whole, plus B94's): the customer authority's review of
-- an onboarding approval, the domain admin's review of a support-access request, the customer's confirmation of a case closure, the
-- sponsor's go-live review; timers for a support grant's expiry, an SLA's response and resolution objectives, and a baseline drift check.
CREATE OR REPLACE FUNCTION executive.human_task_kinds() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY[
  'gate.approve', 'gate.review', 'gate.delegated_approval', 'gate.override_review', 'gate.ready_review',
  'commitment.accept', 'commitment.checkpoint', 'commitment.renegotiate', 'commitment.compensation',
  'collab.review', 'collab.contribute',
  'workflow.irreconcilable', 'workflow.compensation_confirm',
  -- B94 (0114)
  'onboarding.approve', 'support.access_review', 'service.closure_confirm', 'implementation.golive_review',
  -- B107 (0115)
  'governance.attest', 'governance.exception_review', 'governance.stewardship', 'governance.design_review'] $$;
CREATE OR REPLACE FUNCTION executive.task_subject_kinds() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY[
  'decision_package', 'decision_version', 'gate', 'commitment', 'commitment_item', 'execution_handoff', 'workspace', 'workflow_instance',
  -- B94 (0114)
  'onboarding_programme', 'config_baseline', 'migration_wave', 'cutover', 'implementation_programme', 'readiness_gate', 'service_case', 'support_grant', 'responsibility_matrix',
  -- B107 (0115)
  'acceptance_record', 'governance_exception', 'release_candidate', 'conformance_finding', 'stewardship_case', 'design_contribution', 'change_proposal'] $$;
CREATE OR REPLACE FUNCTION executive.workflow_timer_kinds() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY[
  'task.deadline', 'task.reminder', 'workflow.step_timeout', 'grant.expiry', 'commitment.checkpoint', 'gate.expiry',
  -- B94 (0114)
  'support_access.expiry', 'sla.response', 'sla.resolution', 'baseline.drift_check',
  -- B107 (0115)
  'acceptance.evidence_expiry', 'exception.expiry', 'stewardship.sla'] $$;

-- (c) the signature subject kinds (0095's list whole, plus B94's): a configuration baseline, a responsibility matrix, a migration mapping, a
-- cutover, a readiness acceptance (go-live), an acceptance record, an admission record.
ALTER TABLE executive.signatures DROP CONSTRAINT IF EXISTS signatures_subject_kind_check;
ALTER TABLE executive.signatures ADD CONSTRAINT signatures_subject_kind_check CHECK (subject_kind IN (
  'approval', 'decision', 'publication', 'queue_transition', 'plan_baseline', 'briefing', 'health_snapshot',
  'product_release', 'metric_certification',
  -- B94 (0114)
  'config_baseline', 'responsibility_matrix', 'mapping', 'cutover', 'readiness', 'acceptance', 'admission_record',
  -- B107 (0115)
  'acceptance_attestation', 'design_acceptance'));


-- §0.4 THE SHARED HELPERS ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* sha256 hex over a jsonb value's canonical text. */
CREATE OR REPLACE FUNCTION governance.digest(p jsonb) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = public, pg_catalog, pg_temp AS $$ SELECT encode(sha256(convert_to(coalesce(p, 'null'::jsonb)::text, 'UTF8')), 'hex') $$;
GRANT EXECUTE ON FUNCTION governance.digest(jsonb) TO eye_app, eye_commit;

/* A vendor-side (PLATFORM) governance write: the route's action, PLATFORM scope, the act recorded under the acting principal. */
CREATE OR REPLACE FUNCTION governance.assert_platform(p_action text, p_actor uuid, p_noun text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, observation, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_authority(ARRAY[p_action]);
  IF public.eye_scope() IS DISTINCT FROM 'PLATFORM' THEN
    RAISE EXCEPTION '% rejected (authority): product-governance registries are the vendor''s (PLATFORM scope)', p_noun USING ERRCODE = '42501';
  END IF;
  IF p_actor IS NULL OR p_actor IS DISTINCT FROM public.eye_principal() THEN
    RAISE EXCEPTION '% rejected (actor): the act is recorded under the acting principal', p_noun USING ERRCODE = '42501';
  END IF;
END $$;
REVOKE ALL ON FUNCTION governance.assert_platform(text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.assert_platform(text, uuid, text) TO eye_commit;

/* Does the principal hold (live) one of the roles at a scope that covers the subject: a PLATFORM binding covers everything; a TENANT binding
   its tenant; a DOMAIN binding its domain. */
CREATE OR REPLACE FUNCTION governance.holds_role(p_principal uuid, p_tenant uuid, p_domain uuid, p_roles text[]) RETURNS boolean
STABLE SECURITY DEFINER SET search_path = identity, pg_catalog, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM identity.role_bindings b JOIN identity.principals p ON p.id = b.principal_id
                  WHERE b.principal_id = p_principal AND p.status = 'active' AND b.revoked_at IS NULL AND b.role_code = ANY (p_roles)
                    AND (b.scope = 'PLATFORM'
                         OR (b.scope = 'TENANT' AND p_tenant IS NOT NULL AND b.tenant_id = p_tenant)
                         OR (b.scope = 'DOMAIN' AND p_domain IS NOT NULL AND b.domain_id = p_domain)))
$$ LANGUAGE sql;
REVOKE ALL ON FUNCTION governance.holds_role(uuid, uuid, uuid, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.holds_role(uuid, uuid, uuid, text[]) TO eye_commit;

/* THE APPROVER TEST (B94's, generalised — re-checked in every approving, accepting, attesting and signing port): a named ACTIVE HUMAN holding
   one of p_roles at a covering scope; never the PROPOSER; never the BUILDER of the subject (the principal(s) declared as having produced
   it); never an AGENT. Refusals in the class form: (actor) · (authority) · (separation_of_duties). */
CREATE OR REPLACE FUNCTION governance.assert_approver(p_noun text, p_actor uuid, p_tenant uuid, p_domain uuid, p_roles text[], p_proposer uuid, p_builders uuid[], p_what text) RETURNS void
LANGUAGE plpgsql STABLE SET search_path = governance, onboarding, pg_catalog, pg_temp AS $$
BEGIN
  IF onboarding.principal_kind(p_actor) IS DISTINCT FROM 'human' THEN
    RAISE EXCEPTION '% rejected (actor): % is a named human''s act; an agent or a system never approves, accepts or attests (it may draft evidence and proposals only)', p_noun, p_what USING ERRCODE = '42501';
  END IF;
  IF NOT governance.holds_role(p_actor, p_tenant, p_domain, p_roles) THEN
    RAISE EXCEPTION '% rejected (authority): % is the act of a %', p_noun, p_what, array_to_string(p_roles, ' or ') USING ERRCODE = '42501';
  END IF;
  IF p_proposer IS NOT NULL AND p_actor = p_proposer THEN
    RAISE EXCEPTION '% rejected (separation_of_duties): % is never done by its proposer (no self-acceptance)', p_noun, p_what USING ERRCODE = '42501';
  END IF;
  IF p_builders IS NOT NULL AND p_actor = ANY (p_builders) THEN
    RAISE EXCEPTION '% rejected (separation_of_duties): % is never done by a builder of the subject (independence)', p_noun, p_what USING ERRCODE = '42501';
  END IF;
END $$;
GRANT EXECUTE ON FUNCTION governance.assert_approver(text, uuid, uuid, uuid, text[], uuid, uuid[], text) TO eye_commit;

-- §0.5 THE LEDGER (append-only; every part's ports write it) ───────────────────────────────────────────────────────────────────────────────
CREATE TABLE governance.events (
  event_id           uuid PRIMARY KEY,
  scope              text NOT NULL CHECK (scope IN ('PLATFORM', 'TENANT', 'DOMAIN')),
  tenant_id          uuid,
  domain_id          uuid,
  subject_kind       text NOT NULL CHECK (subject_kind ~ '^[a-z][a-z_]{2,40}$'),
  subject_id         uuid NOT NULL,
  version            int,
  event              text NOT NULL CHECK (event ~ '^[a-z_]+\.[a-z_.]+$'),
  actor_principal_id uuid NOT NULL,
  details            jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
  occurred_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT gev_scope CHECK ((scope = 'PLATFORM' AND tenant_id IS NULL AND domain_id IS NULL) OR (scope = 'TENANT' AND tenant_id IS NOT NULL AND domain_id IS NULL)
                              OR (scope = 'DOMAIN' AND tenant_id IS NOT NULL AND domain_id IS NOT NULL))
);
CREATE INDEX gev_subject ON governance.events (subject_id, occurred_at);
CREATE TRIGGER gev_append_only BEFORE UPDATE OR DELETE ON governance.events FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

CREATE OR REPLACE FUNCTION governance.ledger(p_tenant uuid, p_domain uuid, p_subject_kind text, p_subject_id uuid, p_version int, p_event text, p_actor uuid, p_details jsonb, p_correlation uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, pg_catalog, pg_temp AS $$
DECLARE v uuid := gen_random_uuid();
BEGIN
  INSERT INTO governance.events (event_id, scope, tenant_id, domain_id, subject_kind, subject_id, version, event, actor_principal_id, details, correlation_id)
  VALUES (v, CASE WHEN p_domain IS NOT NULL THEN 'DOMAIN' WHEN p_tenant IS NOT NULL THEN 'TENANT' ELSE 'PLATFORM' END, p_tenant, p_domain, p_subject_kind, p_subject_id, p_version, p_event, p_actor,
          coalesce(p_details, '{}'::jsonb), p_correlation);
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION governance.ledger(uuid, uuid, text, uuid, int, text, uuid, jsonb, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.ledger(uuid, uuid, text, uuid, int, text, uuid, jsonb, uuid) TO eye_commit;

-- §0.6 THE SHARED CORE (its ports are the parts') ─────────────────────────────────────────────────────────────────────────────────────────
/* THE ARTIFACT KINDS and THE LINK RELATIONS (closed lists; a part that needs another kind asks the integrator). */
CREATE OR REPLACE FUNCTION governance.artifact_kinds() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY[
  'requirement', 'capability', 'journey', 'component', 'deployable_unit', 'interface', 'schema', 'policy_bundle', 'test', 'fixture', 'evidence',
  'release_candidate', 'decision_record', 'standard', 'design_asset', 'design_component', 'pattern', 'principle', 'exception', 'acceptance_record',
  'data_product', 'data_authority', 'domain', 'change_proposal', 'conflict', 'baseline', 'stewardship_case', 'manifest', 'feature', 'role'] $$;
CREATE OR REPLACE FUNCTION governance.link_relations() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY[
  'implements', 'verifies', 'depends_on', 'derives_from', 'cites', 'owned_by', 'supersedes', 'covers', 'accepted_in', 'excepts', 'deploys',
  'consumes', 'maps_to', 'evidences', 'conflicts_with', 'contributes_to', 'governs', 'part_of'] $$;
GRANT EXECUTE ON FUNCTION governance.artifact_kinds(), governance.link_relations() TO eye_app, eye_commit;

/* THE ARTIFACTS: one identity per governed thing. PLATFORM rows are the vendor's product registries (requirements, capabilities, components,
   manifests, the design system, exceptions …); TENANT/DOMAIN rows are a customer's (an acceptance record of a domain, a stewardship case …).
   One CURRENT version per (kind, external_key, scope owner); a change is a new version (superseded_at stamped). Each part registers its
   primary objects here (artifact_id = the object's id) so the others read them by kind and through the links — never by each other's tables. */
CREATE TABLE governance.artifacts (
  artifact_id        uuid NOT NULL,
  version            int  NOT NULL CHECK (version >= 1),
  scope              text NOT NULL CHECK (scope IN ('PLATFORM', 'TENANT', 'DOMAIN')),
  tenant_id          uuid,
  domain_id          uuid,
  kind               text NOT NULL CHECK (kind = ANY (governance.artifact_kinds())),
  external_key       text NOT NULL CHECK (length(btrim(external_key)) BETWEEN 1 AND 200),
  title              text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 500),
  owner_principal_id uuid,
  owner_role         text REFERENCES identity.roles (code),
  authority_class    text,
  controlling_volume text,
  lifecycle          text NOT NULL DEFAULT 'active' CHECK (lifecycle IN ('proposed', 'active', 'deprecated', 'retired', 'superseded', 'quarantined')),
  attributes         jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(attributes) = 'object'),
  source             jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(source) = 'object'),
  digest             text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  effective_from     timestamptz NOT NULL DEFAULT clock_timestamp(),
  superseded_at      timestamptz,
  recorded_by        uuid NOT NULL,
  correlation_id     uuid NOT NULL,
  PRIMARY KEY (artifact_id, version),
  CONSTRAINT gar_scope CHECK ((scope = 'PLATFORM' AND tenant_id IS NULL AND domain_id IS NULL) OR (scope = 'TENANT' AND tenant_id IS NOT NULL AND domain_id IS NULL)
                              OR (scope = 'DOMAIN' AND tenant_id IS NOT NULL AND domain_id IS NOT NULL))
);
CREATE UNIQUE INDEX gar_one_current ON governance.artifacts (artifact_id) WHERE superseded_at IS NULL;
CREATE UNIQUE INDEX gar_key_current ON governance.artifacts (kind, external_key, coalesce(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(domain_id, '00000000-0000-0000-0000-000000000000'::uuid)) WHERE superseded_at IS NULL;
CREATE INDEX gar_kind ON governance.artifacts (kind, lifecycle) WHERE superseded_at IS NULL;

/* THE LINKS (append-only): from → to with a relation; a link is RETIRED by a later row (retired = true), never updated or deleted. */
CREATE TABLE governance.links (
  link_id         uuid PRIMARY KEY,
  scope           text NOT NULL CHECK (scope IN ('PLATFORM', 'TENANT', 'DOMAIN')),
  tenant_id       uuid,
  domain_id       uuid,
  from_artifact   uuid NOT NULL,
  to_artifact     uuid NOT NULL,
  relation        text NOT NULL CHECK (relation = ANY (governance.link_relations())),
  retired         boolean NOT NULL DEFAULT false,
  retires_link    uuid REFERENCES governance.links (link_id),
  attributes      jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(attributes) = 'object'),
  recorded_by     uuid NOT NULL,
  recorded_at     timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id  uuid NOT NULL,
  CONSTRAINT gln_not_self CHECK (from_artifact <> to_artifact),
  CONSTRAINT gln_retire CHECK (retired = (retires_link IS NOT NULL)),
  CONSTRAINT gln_scope CHECK ((scope = 'PLATFORM' AND tenant_id IS NULL AND domain_id IS NULL) OR (scope = 'TENANT' AND tenant_id IS NOT NULL AND domain_id IS NULL)
                              OR (scope = 'DOMAIN' AND tenant_id IS NOT NULL AND domain_id IS NOT NULL))
);
CREATE INDEX gln_from ON governance.links (from_artifact, relation);
CREATE INDEX gln_to ON governance.links (to_artifact, relation);
CREATE TRIGGER gln_append_only BEFORE UPDATE OR DELETE ON governance.links FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

/* The LIVE links (a link not retired by a later row). */
CREATE OR REPLACE VIEW governance.links_live WITH (security_invoker = true) AS
  SELECT l.* FROM governance.links l WHERE NOT l.retired AND NOT EXISTS (SELECT 1 FROM governance.links r WHERE r.retires_link = l.link_id);

/* THE PLATFORM SIGNATURES (a sibling of executive.signatures, which is DOMAIN-scoped — B36's table untouched): a named human's Ed25519
   signature, by key reference, over a vendor-side subject's digest (the baseline decision, an exception approval, a release acceptance, a
   design acceptance, a manifest attestation). One per signer per subject version. Written by the parts' signing ports. */
CREATE OR REPLACE FUNCTION governance.signature_kinds() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY[
  'baseline_decision', 'decision_rights', 'exception_approval', 'release_acceptance', 'design_acceptance', 'design_contribution', 'manifest_attestation',
  'change_approval', 'conflict_resolution', 'ownership_transfer', 'acceptance_attestation'] $$;
GRANT EXECUTE ON FUNCTION governance.signature_kinds() TO eye_app, eye_commit;
CREATE TABLE governance.signatures (
  signature_id    uuid PRIMARY KEY,
  scope           text NOT NULL CHECK (scope IN ('PLATFORM', 'TENANT', 'DOMAIN')),
  tenant_id       uuid,
  domain_id       uuid,
  subject_kind    text NOT NULL CONSTRAINT gsg_subject_kind CHECK (subject_kind = ANY (governance.signature_kinds())),
  subject_id      uuid NOT NULL,
  subject_version int NOT NULL,
  subject_digest  text NOT NULL CHECK (subject_digest ~ '^[0-9a-f]{64}$'),
  signer          uuid NOT NULL,
  signer_role     text NOT NULL,
  key_id          text NOT NULL,
  algorithm       text NOT NULL CHECK (algorithm = 'ed25519'),
  signature       text NOT NULL,
  bound_action    text NOT NULL,
  signed_at       timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id  uuid NOT NULL,
  CONSTRAINT gsg_one_per_signer UNIQUE (subject_kind, subject_id, subject_version, signer)
);
CREATE TRIGGER gsg_append_only BEFORE UPDATE OR DELETE ON governance.signatures FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

/* THE HOLDS: a subject (a release candidate, a capability's expansion, an acceptance record) held, by whom and why — an expired exception
   (§PG), a conformance conflict (§PG), stale or missing evidence (§CM), a constrained acceptance (§AR). A hold is LIFTED by a later act
   (lifted_at), never deleted. §CM's release-candidate check and §AR's expansion check read the open holds. */
CREATE TABLE governance.holds (
  hold_id         uuid PRIMARY KEY,
  scope           text NOT NULL CHECK (scope IN ('PLATFORM', 'TENANT', 'DOMAIN')),
  tenant_id       uuid,
  domain_id       uuid,
  subject_artifact uuid NOT NULL,
  reason_kind     text NOT NULL CHECK (reason_kind IN ('exception_expired', 'conflict', 'evidence_stale', 'evidence_missing', 'acceptance_constrained', 'conformance_drift', 'ownership_gap')),
  source_artifact uuid,
  reason          text NOT NULL CHECK (length(btrim(reason)) >= 8),
  opened_by       uuid NOT NULL,
  opened_at       timestamptz NOT NULL DEFAULT clock_timestamp(),
  lifted_at       timestamptz,
  lifted_by       uuid,
  lift_reason     text,
  correlation_id  uuid NOT NULL,
  CONSTRAINT ghd_lifted CHECK ((lifted_at IS NULL) = (lifted_by IS NULL) AND (lifted_at IS NULL) = (lift_reason IS NULL))
);
CREATE INDEX ghd_open ON governance.holds (subject_artifact) WHERE lifted_at IS NULL;

-- RLS and grants. PLATFORM rows (the vendor's registries) are readable by every authenticated context (they are not tenant data); TENANT /
-- DOMAIN rows under the tenant / domain isolation idioms; SELECT to eye_app and eye_commit; no write grant — the definer ports write.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['governance.events', 'governance.artifacts', 'governance.links', 'governance.signatures', 'governance.holds'] LOOP
    EXECUTE format('REVOKE ALL ON %s FROM PUBLIC', t);
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$CREATE POLICY governance_visibility ON %s USING (
      (scope = 'PLATFORM' AND public.eye_scope() <> 'NONE')
      OR (scope = 'TENANT' AND tenant_id = public.eye_tenant())
      OR (scope = 'DOMAIN' AND tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain()))
      OR public.eye_scope() = 'PLATFORM')$f$, t);
    EXECUTE format('GRANT SELECT ON %s TO eye_app, eye_commit', t);
  END LOOP;
  GRANT SELECT ON governance.links_live TO eye_app, eye_commit;
END $$;
