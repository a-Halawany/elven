-- 0105 — CP-6 B91 (2026-10-04): USAGE METERING, COST LEDGER, ENTITLEMENTS AND LICENSING — F-P7-F-02 (meters per tenant, capability and
-- profile with caps; the cost and resource ledger with allocation keys, rates, budgets and variance; unit data cost; reconciliation and anomaly
-- alerts; energy accounting; optimisation that never weakens isolation or residency) and F-P7-F-01 (the offer/package/SKU/capability/limit/
-- entitlement model with effective time and provenance; the contract scope; enforcement that gates AVAILABILITY only — never mandatory
-- controls or human authority, ADR-022; grace, quota, renewal and suspension; the offline licence token; the entitlement surface); and B90's
-- carryover (the consumer register's usage counters incremented).
--
-- One migration in five sections: the prelude (§0, the integrator's), the four parts built and proven alone in parallel worktrees (harnesses
-- phase6-{meters,ledger,entitlements,grace}-b91), combined in the apply order (§0, §EN entitlements, §GR grace, §LE ledger, §ME meters).
-- Forward-only; 0001–0104 untouched. Each part keeps its own ledger; no existing event list is widened on an existing path. The interface
-- register stays 50/0/0. A real billing or cloud account is an external prerequisite: a synthetic invoice demonstrates the software and
-- closes no clause that needs the real integration.

-- ═════════════════════════════════════════════════════════════════════
-- section `prelude`
-- ═════════════════════════════════════════════════════════════════════
-- §0.1 THE SCHEMA: commercial — every B91 table lives here, FORCE RLS in the 0081 idiom (the isolation policy of the schemas before it).
CREATE SCHEMA IF NOT EXISTS commercial;
GRANT USAGE ON SCHEMA commercial TO eye_app, eye_commit;

-- §0.2 THE ATTENTION CLASSES AND SUBJECT KINDS (0103 §0.1's lists whole, plus B91's): commercial.usage (a meter's cap reached or a budget's
-- variance or anomaly → the tenant's budget owner and the operation's actor), commercial.entitlement (an entitlement lapsing, entering grace,
-- suspended or renewed, a capability refused for entitlement → the tenant administrator and the commercial authority). Subject kinds: meter,
-- budget, entitlement, contract.
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
  'commercial.usage', 'commercial.entitlement'] $$;
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
  'commercial.usage', 'commercial.entitlement'));
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
  'meter', 'budget', 'entitlement', 'contract'));

-- §0.3 THE COMMERCIAL AUTHORITY (PLATFORM): the vendor's named commercial role — issues offers and packages, assigns, renews, suspends and
-- reinstates a tenant's licence and contract. It holds NO business authority over a customer's data, decisions or controls (the platform
-- administrator's rule, 0002), and an entitlement it sets gates availability only (ADR-022).
INSERT INTO identity.roles (code, scope, description) VALUES
  ('commercial_authority', 'PLATFORM', 'The vendor''s commercial authority (B91): offers, packages, licences and contracts — availability only; never business decision authority, never a mandatory control')
ON CONFLICT (code) DO NOTHING;

-- §0.4 THE TWO SHARED TABLES (the seams between the parts — every part reads them; their WRITERS are named).
-- commercial.licences: a tenant's licence, versioned. §EN issues and supersedes versions (the package, the licensed capabilities, the limits,
-- the effective window, the provenance); §GR moves its STATE (active → grace → suspended | lapsed; reinstated, renewed) through its own ports.
-- The row a tenant is entitled by is its latest non-superseded version. A tenant with NO licence row is UNCONTRACTED (development and the
-- existing deployments): the availability gate does not apply to it — stated, so a contract is what turns enforcement on.
CREATE TABLE commercial.licences (
  licence_id       uuid NOT NULL,
  version          int NOT NULL CHECK (version >= 1),
  scope            text NOT NULL DEFAULT 'TENANT' CHECK (scope = 'TENANT'),
  tenant_id        uuid NOT NULL REFERENCES tenancy.tenants(id),
  domain_id        uuid NULL CHECK (domain_id IS NULL),
  package_key      text NOT NULL CHECK (package_key ~ '^[a-z][a-z0-9-]{1,60}$'),
  capabilities     text[] NOT NULL,
  limits           jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(limits) = 'object'),
  effective_from   timestamptz NOT NULL,
  effective_to     timestamptz NULL CHECK (effective_to IS NULL OR effective_to > effective_from),
  state            text NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'grace', 'suspended', 'lapsed', 'superseded')),
  grace_until      timestamptz NULL,
  last_valid       jsonb NULL,
  provenance       jsonb NOT NULL CHECK (jsonb_typeof(provenance) = 'object'),
  digest           text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  issued_by        uuid NOT NULL,
  issued_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  state_changed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id   uuid NOT NULL,
  PRIMARY KEY (licence_id, version)
);
CREATE INDEX c0_licences_tenant ON commercial.licences (tenant_id, licence_id, version DESC);
-- commercial.usage_records: the METERED usage, append-only. §ME writes it (from the recording points it owns); §LE prices it; §GR shows it.
CREATE TABLE commercial.usage_records (
  usage_id         uuid PRIMARY KEY,
  scope            text NOT NULL CHECK (scope IN ('TENANT', 'DOMAIN')),
  tenant_id        uuid NOT NULL REFERENCES tenancy.tenants(id),
  domain_id        uuid NULL,
  capability_key   text NOT NULL CHECK (capability_key ~ '^[a-z][a-z0-9_]{1,40}$'),
  dimension        text NOT NULL CHECK (dimension IN ('model_inference', 'source_consumption', 'storage', 'simulation_compute', 'product_consumption')),
  unit             text NOT NULL CHECK (length(btrim(unit)) BETWEEN 1 AND 40),
  quantity         numeric NOT NULL CHECK (quantity >= 0),
  profile          text NOT NULL DEFAULT 'local-dev',
  source_kind      text NOT NULL CHECK (length(btrim(source_kind)) BETWEEN 2 AND 60),
  source_ref       text NOT NULL CHECK (length(btrim(source_ref)) BETWEEN 1 AND 200),
  details          jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
  occurred_at      timestamptz NOT NULL,
  recorded_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id   uuid NULL,
  CHECK ((scope = 'TENANT') = (domain_id IS NULL)),
  UNIQUE (tenant_id, dimension, source_kind, source_ref)
);
CREATE INDEX c0_usage_tenant ON commercial.usage_records (tenant_id, dimension, occurred_at);
CREATE TRIGGER c0_usage_append_only BEFORE UPDATE OR DELETE ON commercial.usage_records FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
REVOKE ALL ON commercial.licences, commercial.usage_records FROM PUBLIC;
GRANT SELECT ON commercial.licences, commercial.usage_records TO eye_app, eye_commit;
ALTER TABLE commercial.licences ENABLE ROW LEVEL SECURITY;
ALTER TABLE commercial.licences FORCE ROW LEVEL SECURITY;
CREATE POLICY commercial_licence_read ON commercial.licences
  USING (tenant_id = public.eye_tenant() OR public.eye_scope() = 'PLATFORM');
ALTER TABLE commercial.usage_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE commercial.usage_records FORCE ROW LEVEL SECURITY;
CREATE POLICY commercial_isolation ON commercial.usage_records
  USING (tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR domain_id IS NULL OR domain_id = public.eye_domain()));
