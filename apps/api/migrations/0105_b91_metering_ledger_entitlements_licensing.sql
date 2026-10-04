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

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §EN — ENTITLEMENTS: the catalogue, offers, licence issuance, contracts and THE AVAILABILITY GATE
-- (built as the part `entitlements` on its own worktree; folded here in apply order §EN, §GR, §LE, §ME)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- ═════════════════════════════════════════════════════════════════════
-- section `entitlements` (§EN) — CP-6 B91, part `entitlements` (F-P7-F-01: the object model, the contract scope, THE AVAILABILITY GATE)
-- ═════════════════════════════════════════════════════════════════════
-- Applies after the prelude (§0, 0105_b91_metering_ledger_entitlements_licensing.sql — it sorts before this file); USES §0's schema
-- `commercial`, the role commercial_authority and the shared table commercial.licences (this part WRITES its versions; §GR moves its state).
-- Nothing earlier is edited; no function of another stage is re-declared; no existing event list is widened.
--
-- §EN.1 THE CATALOGUE AND THE OBJECT MODEL — commercial.capabilities (the capability catalogue: V8 App L ENT-01..20 and V10 App E
--        ENT-01..20 as rows, seeded here; the CORE rows cannot be removed or changed), commercial.packages (capabilities + limits + tier),
--        commercial.skus (a package version × a term), commercial.offers (SKUs presented together) — each VERSIONED (key, version), with
--        status, effective time where it applies, the digest and the provenance (who, when, why); commercial.contracts — THE CONTRACT
--        SCOPE (V10-T-015: the decision cells, the sources, the twins, the authorities, the environments and the support boundary, versioned,
--        pinned to the licence version it was declared against); commercial.entitlement_events — the ledger (append-only).
-- §EN.2 THE PURE RULES — commercial.cen_exemption(action, human_gated) (the EXEMPTION LIST, ADR-022 / PR-66-003: the mandatory controls
--        a licence can never make unavailable) and commercial.cen_action_capability(action) (the longest catalogued prefix). The TypeScript
--        twin of cen_exemption is apps/api/src/commercial/entitlements/entitlement-gate.ts (the pipeline's fast path); the unit test pins
--        both to one table of cases.
-- §EN.3 THE SEED — the catalogue rows (SYNTHETIC vendor data: no price, no customer).
-- §EN.4 THE PORTS (commercial_authority, PLATFORM; every one human-gated at the PEP): declare_capability, declare_package, declare_sku,
--        declare_offer, issue_licence (v+1 of the tenant's licence; the previous version superseded; the digest; the provenance — who, the
--        SKU, the order reference), declare_contract.
-- §EN.5 THE GATE — commercial.capability_available(tenant, action, human_gated) (a GUARDED definer: N-01's assert_read_scope, or the
--        PLATFORM scope): uncontracted → available; exempt or core → available always; licensed + active → available; licensed + grace →
--        as §GR's commercial.grace_rules(tenant) declares (a to_regprocedure SEAM — absent, grace is READ AND PRESERVE ONLY); suspended,
--        lapsed or not licensed → UNAVAILABLE with the reason. The ENFORCEMENT POINT is the pipeline's resolveAndEvaluate (the one
--        `B91 entitlements` block after the PDP's allow; refusals recorded through recordDenial with EYE-ENT-001). The PDP stays pure.
--        commercial.entitlement_summary(tenant) — the tenant's current entitlement, the matrix, the contract.
--
-- Refusal families (anchored in observation-errors.ts' B91 entitlements block): `capability rejected (<class>)`, `offer rejected (<class>)`
-- (offers, packages and SKUs), `licence rejected (<class>)`, `contract rejected (<class>)`.

-- ─────────────────────────────────────────────────────────────────────
-- §EN.1 THE CATALOGUE AND THE OBJECT MODEL
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE commercial.capabilities (
  capability_key   text NOT NULL CHECK (capability_key ~ '^[a-z][a-z0-9_]{1,40}$'),
  version          int NOT NULL CHECK (version >= 1),
  label            text NOT NULL CHECK (length(btrim(label)) BETWEEN 2 AND 120),
  description      text NOT NULL CHECK (length(btrim(description)) BETWEEN 2 AND 600),
  /* the action prefixes this capability covers (each ends with '.'); EMPTY for a catalogue row whose capability is folded into another
     (included_in) or not built yet (built = false) — such a row is listed, packaged and licensed, but gates nothing on its own */
  action_prefixes  text[] NOT NULL DEFAULT '{}',
  included_in      text NULL CHECK (included_in IS NULL OR included_in ~ '^[a-z][a-z0-9_]{1,40}$'),
  core             boolean NOT NULL DEFAULT false,
  entitlement_unit text NOT NULL CHECK (length(btrim(entitlement_unit)) BETWEEN 2 AND 80),
  tier             text NOT NULL CHECK (tier IN ('core', 'foundation', 'strategic_cell', 'multi_domain', 'sovereign')),
  built            boolean NOT NULL DEFAULT true,
  spec_refs        text[] NOT NULL DEFAULT '{}',
  cannot_remove    text NOT NULL DEFAULT '' CHECK (length(cannot_remove) <= 400),
  status           text NOT NULL CHECK (status IN ('active', 'retired', 'superseded')),
  declared_by      uuid NOT NULL,
  declared_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  superseded_at    timestamptz NULL,
  reason           text NOT NULL CHECK (length(btrim(reason)) >= 8),
  provenance       jsonb NOT NULL CHECK (jsonb_typeof(provenance) = 'object'),
  digest           text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  correlation_id   uuid NULL,
  PRIMARY KEY (capability_key, version),
  CONSTRAINT cen_cap_core_tier CHECK (core = (tier = 'core')),
  CONSTRAINT cen_cap_prefix_form CHECK (array_position(action_prefixes, NULL) IS NULL),
  CONSTRAINT cen_cap_folded CHECK (included_in IS NULL OR cardinality(action_prefixes) = 0),
  CONSTRAINT cen_cap_superseded CHECK ((status = 'superseded') = (superseded_at IS NOT NULL))
);
CREATE UNIQUE INDEX cen_cap_one_live ON commercial.capabilities (capability_key) WHERE status <> 'superseded';

CREATE TABLE commercial.packages (
  package_key      text NOT NULL CHECK (package_key ~ '^[a-z][a-z0-9-]{1,60}$'),
  version          int NOT NULL CHECK (version >= 1),
  title            text NOT NULL CHECK (length(btrim(title)) BETWEEN 2 AND 160),
  capabilities     text[] NOT NULL,
  limits           jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(limits) = 'object'),
  tier             text NOT NULL CHECK (tier IN ('foundation', 'strategic_cell', 'multi_domain', 'sovereign', 'custom')),
  status           text NOT NULL CHECK (status IN ('published', 'withdrawn', 'superseded')),
  effective_from   timestamptz NOT NULL DEFAULT clock_timestamp(),
  declared_by      uuid NOT NULL,
  declared_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  superseded_at    timestamptz NULL,
  reason           text NOT NULL CHECK (length(btrim(reason)) >= 8),
  provenance       jsonb NOT NULL CHECK (jsonb_typeof(provenance) = 'object'),
  digest           text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  correlation_id   uuid NOT NULL,
  PRIMARY KEY (package_key, version),
  CONSTRAINT cen_pkg_superseded CHECK ((status = 'superseded') = (superseded_at IS NOT NULL))
);
CREATE UNIQUE INDEX cen_pkg_one_live ON commercial.packages (package_key) WHERE status <> 'superseded';

CREATE TABLE commercial.skus (
  sku_code         text NOT NULL CHECK (sku_code ~ '^[A-Z][A-Z0-9-]{2,40}$'),
  version          int NOT NULL CHECK (version >= 1),
  title            text NOT NULL CHECK (length(btrim(title)) BETWEEN 2 AND 160),
  package_key      text NOT NULL,
  package_version  int NOT NULL,
  term_months      int NOT NULL CHECK (term_months BETWEEN 1 AND 120),
  status           text NOT NULL CHECK (status IN ('active', 'withdrawn', 'superseded')),
  declared_by      uuid NOT NULL,
  declared_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  superseded_at    timestamptz NULL,
  reason           text NOT NULL CHECK (length(btrim(reason)) >= 8),
  provenance       jsonb NOT NULL CHECK (jsonb_typeof(provenance) = 'object'),
  digest           text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  correlation_id   uuid NOT NULL,
  PRIMARY KEY (sku_code, version),
  FOREIGN KEY (package_key, package_version) REFERENCES commercial.packages (package_key, version),
  CONSTRAINT cen_sku_superseded CHECK ((status = 'superseded') = (superseded_at IS NOT NULL))
);
CREATE UNIQUE INDEX cen_sku_one_live ON commercial.skus (sku_code) WHERE status <> 'superseded';

CREATE TABLE commercial.offers (
  offer_key        text NOT NULL CHECK (offer_key ~ '^[a-z][a-z0-9-]{1,60}$'),
  version          int NOT NULL CHECK (version >= 1),
  title            text NOT NULL CHECK (length(btrim(title)) BETWEEN 2 AND 160),
  summary          text NOT NULL CHECK (length(btrim(summary)) BETWEEN 8 AND 2000),
  sku_codes        text[] NOT NULL CHECK (cardinality(sku_codes) >= 1),
  status           text NOT NULL CHECK (status IN ('published', 'withdrawn', 'superseded')),
  effective_from   timestamptz NOT NULL,
  effective_to     timestamptz NULL CHECK (effective_to IS NULL OR effective_to > effective_from),
  declared_by      uuid NOT NULL,
  declared_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  superseded_at    timestamptz NULL,
  reason           text NOT NULL CHECK (length(btrim(reason)) >= 8),
  provenance       jsonb NOT NULL CHECK (jsonb_typeof(provenance) = 'object'),
  digest           text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  correlation_id   uuid NOT NULL,
  PRIMARY KEY (offer_key, version),
  CONSTRAINT cen_off_superseded CHECK ((status = 'superseded') = (superseded_at IS NOT NULL))
);
CREATE UNIQUE INDEX cen_off_one_live ON commercial.offers (offer_key) WHERE status <> 'superseded';

/* THE CONTRACT SCOPE (V10-T-015): what a contract names — decision cells (the tenant's domains), the sources and the twins inside them, the
   customer's named authorities, the environments (deployment profiles) and the support boundary — versioned, and PINNED to the licence
   version it was declared against. It describes; the availability gate reads the licence. */
CREATE TABLE commercial.contracts (
  contract_id      uuid NOT NULL,
  version          int NOT NULL CHECK (version >= 1),
  scope            text NOT NULL DEFAULT 'TENANT' CHECK (scope = 'TENANT'),
  tenant_id        uuid NOT NULL REFERENCES tenancy.tenants(id),
  contract_ref     text NOT NULL CHECK (length(btrim(contract_ref)) BETWEEN 2 AND 120),
  licence_id       uuid NOT NULL,
  licence_version  int NOT NULL,
  decision_cells   jsonb NOT NULL CHECK (jsonb_typeof(decision_cells) = 'array' AND jsonb_array_length(decision_cells) >= 1),
  sources          jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(sources) = 'array'),
  twins            jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(twins) = 'array'),
  authorities      jsonb NOT NULL CHECK (jsonb_typeof(authorities) = 'array' AND jsonb_array_length(authorities) >= 1),
  environments     text[] NOT NULL CHECK (cardinality(environments) >= 1),
  support_boundary jsonb NOT NULL CHECK (jsonb_typeof(support_boundary) = 'object'),
  effective_from   timestamptz NOT NULL,
  effective_to     timestamptz NULL CHECK (effective_to IS NULL OR effective_to > effective_from),
  status           text NOT NULL CHECK (status IN ('active', 'terminated', 'superseded')),
  declared_by      uuid NOT NULL,
  declared_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  superseded_at    timestamptz NULL,
  reason           text NOT NULL CHECK (length(btrim(reason)) >= 8),
  provenance       jsonb NOT NULL CHECK (jsonb_typeof(provenance) = 'object'),
  digest           text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  correlation_id   uuid NOT NULL,
  PRIMARY KEY (contract_id, version),
  FOREIGN KEY (licence_id, licence_version) REFERENCES commercial.licences (licence_id, version),
  CONSTRAINT cen_ctr_superseded CHECK ((status = 'superseded') = (superseded_at IS NOT NULL))
);
CREATE UNIQUE INDEX cen_ctr_one_live ON commercial.contracts (contract_id) WHERE status <> 'superseded';
CREATE INDEX cen_ctr_tenant ON commercial.contracts (tenant_id, contract_id, version DESC);

/* THE LEDGER: every catalogue, licence and contract change, append-only. tenant_id NULL = a vendor catalogue event. */
CREATE TABLE commercial.entitlement_events (
  event_id         uuid PRIMARY KEY,
  tenant_id        uuid NULL REFERENCES tenancy.tenants(id),
  subject_kind     text NOT NULL CHECK (subject_kind IN ('capability', 'package', 'sku', 'offer', 'licence', 'contract')),
  subject_key      text NOT NULL CHECK (length(btrim(subject_key)) BETWEEN 1 AND 120),
  version          int NOT NULL CHECK (version >= 1),
  event            text NOT NULL CHECK (event IN ('capability.declared', 'capability.retired', 'package.declared', 'package.withdrawn',
                                                  'sku.declared', 'sku.withdrawn', 'offer.declared', 'offer.withdrawn',
                                                  'licence.issued', 'licence.superseded', 'contract.declared', 'contract.terminated',
                                                  'contract.superseded')),
  actor            uuid NOT NULL,
  reason           text NOT NULL,
  details          jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
  occurred_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id   uuid NULL
);
CREATE INDEX cen_events_subject ON commercial.entitlement_events (subject_kind, subject_key, occurred_at);
CREATE INDEX cen_events_tenant ON commercial.entitlement_events (tenant_id, occurred_at);
CREATE TRIGGER cen_events_append_only BEFORE UPDATE OR DELETE ON commercial.entitlement_events FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

/* A version is IMMUTABLE: the only change a versioned row admits is its supersession (status → superseded, superseded_at set) — every
   other column stays as declared; nothing is deleted. */
CREATE OR REPLACE FUNCTION commercial.cen_version_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = commercial, pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'capability rejected (state): a % version is never deleted (it is superseded)', TG_TABLE_NAME USING ERRCODE = '22023';
  END IF;
  IF (to_jsonb(NEW) - 'status' - 'superseded_at') IS DISTINCT FROM (to_jsonb(OLD) - 'status' - 'superseded_at')
     OR NOT (NEW.status = 'superseded' AND OLD.status <> 'superseded') THEN
    RAISE EXCEPTION 'capability rejected (state): a % version is immutable; only its supersession is recorded', TG_TABLE_NAME USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION commercial.cen_version_guard() FROM PUBLIC;
CREATE TRIGGER cen_cap_version_guard BEFORE UPDATE OR DELETE ON commercial.capabilities FOR EACH ROW EXECUTE FUNCTION commercial.cen_version_guard();
CREATE TRIGGER cen_pkg_version_guard BEFORE UPDATE OR DELETE ON commercial.packages FOR EACH ROW EXECUTE FUNCTION commercial.cen_version_guard();
CREATE TRIGGER cen_sku_version_guard BEFORE UPDATE OR DELETE ON commercial.skus FOR EACH ROW EXECUTE FUNCTION commercial.cen_version_guard();
CREATE TRIGGER cen_off_version_guard BEFORE UPDATE OR DELETE ON commercial.offers FOR EACH ROW EXECUTE FUNCTION commercial.cen_version_guard();
CREATE TRIGGER cen_ctr_version_guard BEFORE UPDATE OR DELETE ON commercial.contracts FOR EACH ROW EXECUTE FUNCTION commercial.cen_version_guard();

/* Row security. The CATALOGUE (capabilities, packages, SKUs, offers) is the vendor's published offer — readable by every reader (UX-67-003:
   inspect and compare); the TENANT's objects (contracts, its ledger rows) by the tenant and the platform scope (the prelude's
   commercial_licence_read idiom); the catalogue's own ledger rows (tenant_id NULL) by every reader. Writes: the definer ports only. */
REVOKE ALL ON commercial.capabilities, commercial.packages, commercial.skus, commercial.offers, commercial.contracts, commercial.entitlement_events FROM PUBLIC;
GRANT SELECT ON commercial.capabilities, commercial.packages, commercial.skus, commercial.offers, commercial.contracts, commercial.entitlement_events TO eye_app, eye_commit;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['capabilities', 'packages', 'skus', 'offers'] LOOP
    EXECUTE format('ALTER TABLE commercial.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE commercial.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY commercial_catalogue_read ON commercial.%I USING (true)', t);
  END LOOP;
END $$;
ALTER TABLE commercial.contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE commercial.contracts FORCE ROW LEVEL SECURITY;
CREATE POLICY commercial_contract_read ON commercial.contracts
  USING (tenant_id = public.eye_tenant() OR public.eye_scope() = 'PLATFORM');
ALTER TABLE commercial.entitlement_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE commercial.entitlement_events FORCE ROW LEVEL SECURITY;
CREATE POLICY commercial_entitlement_event_read ON commercial.entitlement_events
  USING (tenant_id IS NULL OR tenant_id = public.eye_tenant() OR public.eye_scope() = 'PLATFORM');

-- ─────────────────────────────────────────────────────────────────────
-- §EN.2 THE PURE RULES
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION commercial.cen_digest(p jsonb) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = public, pg_catalog, pg_temp AS $$
  SELECT encode(public.digest(convert_to(p::text, 'UTF8'), 'sha256'), 'hex') $$;
REVOKE ALL ON FUNCTION commercial.cen_digest(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION commercial.cen_digest(jsonb) TO eye_app, eye_commit;

/* THE EXEMPTION LIST (ADR-022, PR-66-003, UX-67-004): the actions no licence state can make unavailable, in this order —
     human_gate            every rule carrying the human gate (a named human's approval, decision, admission or retirement: human
                           authority is never sold or removed);
     mandatory_control     identity, tenancy, audit, policy, retention (export and the customer's own records), objects (canonical
                           objects and provenance), commercial (the customer always sees and manages its own entitlement);
     warning_control       warnings and their acknowledgement, and the attention layer that carries them (prediction.warning.*,
                           executive.attention.*);
     correction_withdrawal a correction or a withdrawal of any record (a segment beginning correct… or withdraw…);
     read_existing         a read of existing records — a segment read, list, search, export, download or verify (customer work is
                           preserved and stays readable).
   Mirrored EXACTLY by entitlementExemption() in apps/api/src/commercial/entitlements/entitlement-gate.ts. */
CREATE OR REPLACE FUNCTION commercial.cen_exemption(p_action text, p_human_gated boolean DEFAULT false) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT CASE
    WHEN p_action IS NULL THEN NULL
    WHEN coalesce(p_human_gated, false) THEN 'human_gate'
    WHEN split_part(p_action, '.', 1) IN ('identity', 'tenancy', 'audit', 'policy', 'retention', 'objects', 'commercial') THEN 'mandatory_control'
    WHEN left(p_action, 19) = 'prediction.warning.' OR left(p_action, 20) = 'executive.attention.' THEN 'warning_control'
    WHEN p_action ~ '(^|\.)(correct|withdraw)[a-z_]*(\.|$)' THEN 'correction_withdrawal'
    WHEN p_action ~ '(^|\.)(read|list|search|export|download|verify)(\.|$)' THEN 'read_existing'
    ELSE NULL END $$;
REVOKE ALL ON FUNCTION commercial.cen_exemption(text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION commercial.cen_exemption(text, boolean) TO eye_app, eye_commit;

/* The capability an action belongs to: the LIVE catalogue row with the LONGEST prefix the action starts with (prefixes compared as text,
   never as LIKE patterns: '_' is a character). NULL — the action is uncatalogued (no licence names it, so none can make it unavailable). */
CREATE OR REPLACE FUNCTION commercial.cen_action_capability(p_action text) RETURNS commercial.capabilities
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = commercial, pg_catalog, pg_temp AS $$
  SELECT c.* FROM commercial.capabilities c, unnest(c.action_prefixes) AS p(prefix)
   WHERE c.status = 'active' AND left(p_action, length(p.prefix)) = p.prefix
   ORDER BY length(p.prefix) DESC, c.capability_key LIMIT 1 $$;
REVOKE ALL ON FUNCTION commercial.cen_action_capability(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION commercial.cen_action_capability(text) TO eye_app, eye_commit;

/* The mandatory controls a refusal names as staying available (the refusal text's tail). */
CREATE OR REPLACE FUNCTION commercial.cen_stays_available() RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT 'reads of existing records, corrections and withdrawals, export, audit, identity, warnings and their acknowledgement, and every human decision stay available' $$;
REVOKE ALL ON FUNCTION commercial.cen_stays_available() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION commercial.cen_stays_available() TO eye_app, eye_commit;

-- ─────────────────────────────────────────────────────────────────────
-- §EN.3 THE SEED — the capability catalogue (SYNTHETIC vendor data; no price, no customer). V8 App L ENT-01..20 are the capability rows;
-- V10 App E ENT-01..20 are package-tier rows, each mapped onto the capability it tiers (spec_refs). The MAP's enforcement mapping:
-- foresight = prediction.*; decision = decision.*, executive.* (the executive operating system folded in), briefing.*, room.*;
-- simulation = simulation.*, twin.* (the twin portfolio folded in). Rows whose capability is not built yet carry no prefixes (built = false).
-- ─────────────────────────────────────────────────────────────────────
INSERT INTO commercial.capabilities (capability_key, version, label, description, action_prefixes, included_in, core, entitlement_unit, tier, built,
                                     spec_refs, cannot_remove, status, declared_by, reason, provenance, digest)
SELECT s.key, 1, s.label, s.descr, s.prefixes, s.included_in, s.tier = 'core', s.unit, s.tier, s.built, s.refs, s.cannot,
       'active', '00000000-0000-0000-0000-000000000000'::uuid, 'seeded by migration 0105 §EN (the capability catalogue, V8 App L / V10 App E)',
       jsonb_build_object('seeded_by', 'migration 0105 §EN', 'synthetic', true),
       commercial.cen_digest(jsonb_build_object('key', s.key, 'version', 1, 'prefixes', to_jsonb(s.prefixes), 'core', s.tier = 'core', 'included_in', s.included_in, 'unit', s.unit, 'tier', s.tier))
FROM (VALUES
  ('core', 'Universal Strategic Intelligence Core', 'Canonical objects, roles, workflows, audit, policy, the API, retention and export, and the commercial surface itself.',
   ARRAY['identity.', 'tenancy.', 'audit.', 'policy.', 'objects.', 'retention.', 'commercial.', 'report.'], NULL::text, 'every deployment', 'core', true,
   ARRAY['V8 ENT-01', 'V10 ENT-17'], 'Cannot be removed: canonical objects, trust and provenance, roles, audit, export'),
  ('attention_controls', 'Warnings, attention and acknowledgement', 'Warnings, their acknowledgement and the attention layer that carries them to named people (a mandatory control).',
   ARRAY['prediction.warning.', 'executive.attention.'], NULL, 'every deployment', 'core', true,
   ARRAY['ADR-022', 'PR-66-003', 'UX-67-004'], 'Cannot be removed: a warning and its acknowledgement are mandatory controls'),
  ('observation', 'World Observation', 'Source registry, collection plans, external and internal acquisition, coverage.',
   ARRAY['observation.'], NULL, 'authorized sources and capacity', 'foundation', true, ARRAY['V8 ENT-02', 'V10 ENT-01', 'V10 ENT-02'], 'Rights and custody controls'),
  ('knowledge_memory', 'Knowledge and Memory', 'Entities, relationships, the Knowledge Graph, Enterprise Memory and search.',
   ARRAY['graph.', 'memory.'], NULL, 'tenant and domain scope', 'foundation', true, ARRAY['V8 ENT-03', 'V10 ENT-03', 'V10 ENT-04', 'V10 ENT-05'], 'The canonical semantic contract stays universal'),
  ('model_portfolio', 'Model portfolio and extraction', 'Methods, the model gateway, extraction and claims.',
   ARRAY['intelligence.'], NULL, 'approved methods and models', 'multi_domain', true, ARRAY['V10 ENT-14'], 'Model provenance and evaluation evidence'),
  ('foresight', 'Foresight', 'Signals, warnings, risk, opportunity, forecasts and scenarios (prediction).',
   ARRAY['prediction.'], NULL, 'approved domains, methods and horizons', 'strategic_cell', true, ARRAY['V8 ENT-04', 'V10 ENT-07'], 'Six canonical horizons; warnings stay a mandatory control'),
  ('scenario', 'Scenario Intelligence', 'Scenario authoring, comparison and indicators — licensed with Foresight (its actions are prediction.scenario.*).',
   ARRAY[]::text[], 'foresight', 'authors and packages', 'strategic_cell', true, ARRAY['V8 ENT-05', 'V10 ENT-08'], 'Scenario plurality cannot be disabled'),
  ('simulation', 'Simulation', 'Simulation design, compute, run control, sensitivity and validation, and the digital twins they run on.',
   ARRAY['simulation.', 'twin.'], NULL, 'runs, capacity and model limits', 'strategic_cell', true, ARRAY['V8 ENT-06', 'V10 ENT-09'], 'Validity and reproducibility evidence'),
  ('digital_twin', 'Digital Twin Portfolio', 'Twin types, observed snapshots, branches, models, time travel — licensed with Simulation (its actions are twin.*).',
   ARRAY[]::text[], 'simulation', 'licensed twin families and capacity', 'strategic_cell', true, ARRAY['V8 ENT-07', 'V10 ENT-06'], 'Observed and synthetic state stay distinguished'),
  ('decision', 'Decision Intelligence', 'Cases, recommendations, approval, commitments, decision replay, and the executive operating system.',
   ARRAY['decision.', 'executive.', 'briefing.', 'room.'], NULL, 'named decision roles and consequence classes', 'strategic_cell', true,
   ARRAY['V8 ENT-08', 'V10 ENT-10', 'V10 ENT-12'], 'Human final authority'),
  ('executive_os', 'Executive Operating System', 'Executive cadence, briefings, health, priority queue, planning — licensed with Decision (its actions are executive.*).',
   ARRAY[]::text[], 'decision', 'named executive and support roles', 'multi_domain', true, ARRAY['V8 ENT-09', 'V10 ENT-11'], 'Underlying evidence and explanation'),
  ('agent_platform', 'Agent Platform', 'Agent registry, invocation, supervision, tools, trace, override.',
   ARRAY['agent.'], NULL, 'agent count, runs, tools, models and capacity', 'multi_domain', true, ARRAY['V8 ENT-10', 'V10 ENT-13'], 'Bounded authority and evaluation'),
  ('advanced_integration', 'Advanced Integration', 'High-volume APIs, events, data products, exchange.',
   ARRAY['products.'], NULL, 'rate, transfer, connector and environment limits', 'multi_domain', true, ARRAY['V8 ENT-14'], 'Controls and receipts'),
  ('agent_marketplace', 'Agent Marketplace', 'Discovery, purchase, install, evaluation and lifecycle of agents — not built (P7-C, B112).',
   ARRAY[]::text[], NULL, 'publisher and consumer entitlement', 'sovereign', false, ARRAY['V8 ENT-11', 'V10 ENT-19'], 'Customer approval and sandbox cannot be bypassed'),
  ('scenario_marketplace', 'Scenario Marketplace', 'Discovery, purchase, install, configure, evaluate and update of scenarios — not built (P7-C, B112).',
   ARRAY[]::text[], NULL, 'publisher and consumer entitlement', 'sovereign', false, ARRAY['V8 ENT-12', 'V10 ENT-19'], 'Assumptions, provenance and compatibility'),
  ('domain_package', 'Domain Intelligence Package', 'Governed ontology, sources, models, agents, workspaces and metrics per domain — not built (P7-C).',
   ARRAY[]::text[], NULL, 'approved tenant domains', 'multi_domain', false, ARRAY['V8 ENT-13', 'V10 ENT-15'], 'Cannot fork canonical core semantics'),
  ('disconnected_ops', 'Disconnected and Air-Gapped Operations', 'Offline packages, synchronization, portable updates, local verification — the profile is not built (P7-D, B106); the offline licence token is §GR''s.',
   ARRAY[]::text[], NULL, 'approved deployment and operating process', 'sovereign', false, ARRAY['V8 ENT-15', 'V10 ENT-16'], 'Local verification stays available'),
  ('sovereign_control', 'Sovereign Control Package', 'Customer keys, administrative control, residency, evidence export — the profiles are not built (P7-D).',
   ARRAY[]::text[], NULL, 'private cloud or on-premise profile', 'sovereign', false, ARRAY['V8 ENT-16', 'V10 ENT-16'], 'Does not weaken platform controls'),
  ('premium_support', 'Premium Service and Support', 'Service objectives, named support, response, readiness exercises — a contracted service (B94).',
   ARRAY[]::text[], NULL, 'contracted customer and environments', 'sovereign', false, ARRAY['V8 ENT-17', 'V10 ENT-20'], 'Support access remains governed'),
  ('capacity', 'Capacity Entitlement', 'Storage, observation, users, agent runs, model inference and simulation as measured units — the licence''s limits; metered by §ME.',
   ARRAY[]::text[], NULL, 'measured units and declared grace', 'foundation', true, ARRAY['V8 ENT-18'], 'A limit never corrupts or deletes work'),
  ('evaluation_sandbox', 'Evaluation and Sandbox', 'Package, model, agent, scenario and data evaluation environment — not built (P7-D).',
   ARRAY[]::text[], NULL, 'non-production scope and expiry', 'multi_domain', false, ARRAY['V8 ENT-19'], 'No production authority or data'),
  ('publisher_program', 'Publisher Program', 'Signing, certification, listing, telemetry, update, revocation — not built (P7-C, B112).',
   ARRAY[]::text[], NULL, 'approved publishers and package classes', 'sovereign', false, ARRAY['V8 ENT-20'], 'A publisher cannot self-certify'),
  ('advanced_assurance', 'Advanced Assurance', 'Independent testing and certification support — not built (P7-D).',
   ARRAY[]::text[], NULL, 'assurance artefacts', 'sovereign', false, ARRAY['V10 ENT-18'], 'Assurance evidence is never weakened')
) AS s(key, label, descr, prefixes, included_in, unit, tier, built, refs, cannot);
INSERT INTO commercial.entitlement_events (event_id, tenant_id, subject_kind, subject_key, version, event, actor, reason, details)
SELECT gen_random_uuid(), NULL, 'capability', c.capability_key, 1, 'capability.declared', c.declared_by, c.reason,
       jsonb_build_object('core', c.core, 'prefixes', to_jsonb(c.action_prefixes), 'seeded', true)
  FROM commercial.capabilities c;

-- ─────────────────────────────────────────────────────────────────────
-- §EN.4 THE PORTS (commercial_authority, PLATFORM — the vendor's; human-gated at the PEP)
-- ─────────────────────────────────────────────────────────────────────
/* The vendor's standing: the bound action, the PLATFORM scope, the acting principal recorded and compared. */
CREATE OR REPLACE FUNCTION commercial.cen_assert_vendor(p_action text, p_actor uuid, p_noun text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = commercial, observation, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_authority(ARRAY[p_action]);
  IF public.eye_scope() IS DISTINCT FROM 'PLATFORM' THEN
    RAISE EXCEPTION '% rejected (authority): the commercial catalogue, licences and contracts are the vendor''s (PLATFORM scope)', p_noun USING ERRCODE = '42501';
  END IF;
  IF p_actor IS NULL OR p_actor IS DISTINCT FROM public.eye_principal() THEN
    RAISE EXCEPTION '% rejected (actor): the act is recorded under the acting principal', p_noun USING ERRCODE = '42501';
  END IF;
END $$;
REVOKE ALL ON FUNCTION commercial.cen_assert_vendor(text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION commercial.cen_assert_vendor(text, uuid, text) TO eye_commit;

/* The prefixes a non-core capability may NEVER claim: the exempt areas (a capability covering them would claim to gate a mandatory control). */
CREATE OR REPLACE FUNCTION commercial.cen_protected_prefix(p_prefix text) RETURNS boolean
LANGUAGE sql STABLE SET search_path = commercial, pg_catalog, pg_temp AS $$
  SELECT commercial.cen_exemption(rtrim(p_prefix, '.') || '.x', false) IS NOT NULL AND commercial.cen_exemption(rtrim(p_prefix, '.') || '.x', false) <> 'read_existing'
      OR EXISTS (SELECT 1 FROM commercial.capabilities c, unnest(c.action_prefixes) q WHERE c.core AND c.status = 'active' AND left(p_prefix, length(q)) = q) $$;
REVOKE ALL ON FUNCTION commercial.cen_protected_prefix(text) FROM PUBLIC;

/* declare_capability — catalogue maintenance: a new capability (expected version 0) or a new version of a live one; status active or
   retired. CORE rows are immutable (never versioned, never retired); a non-core row may not claim a protected prefix, a prefix another
   live capability claims, or a parent that does not exist. */
CREATE OR REPLACE FUNCTION commercial.declare_capability(p_key text, p_expected_version int, p_label text, p_description text, p_prefixes text[],
  p_included_in text, p_unit text, p_tier text, p_built boolean, p_spec_refs text[], p_cannot_remove text, p_status text, p_reason text,
  p_actor uuid, p_event_id uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = commercial, public, pg_catalog, pg_temp AS $$
DECLARE cur commercial.capabilities%ROWTYPE; v_version int; p text; v_other text; v_prefixes text[] := coalesce(p_prefixes, '{}'); v_row commercial.capabilities%ROWTYPE;
BEGIN
  PERFORM commercial.cen_assert_vendor('commercial.capability.declare', p_actor, 'capability');
  IF p_key IS NULL OR p_key !~ '^[a-z][a-z0-9_]{1,40}$' THEN RAISE EXCEPTION 'capability rejected (key): a capability key is lower-case snake case (2–41 characters)' USING ERRCODE = '22023'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN RAISE EXCEPTION 'capability rejected (reason): a catalogue change states its reason (8 characters or more)' USING ERRCODE = '22023'; END IF;
  IF p_status IS NULL OR p_status NOT IN ('active', 'retired') THEN RAISE EXCEPTION 'capability rejected (status): a capability is declared active or retired' USING ERRCODE = '22023'; END IF;
  IF p_tier IS NULL OR p_tier NOT IN ('foundation', 'strategic_cell', 'multi_domain', 'sovereign') THEN
    RAISE EXCEPTION 'capability rejected (core): the core tier is the platform''s own and is never declared; a capability''s tier is foundation, strategic_cell, multi_domain or sovereign' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO cur FROM commercial.capabilities c WHERE c.capability_key = p_key AND c.status <> 'superseded' FOR UPDATE;
  IF cur.capability_key IS NOT NULL AND cur.core THEN
    RAISE EXCEPTION 'capability rejected (core): % is a core capability — it cannot be changed, retired or removed (ADR-022)', p_key USING ERRCODE = '22023';
  END IF;
  IF coalesce(p_expected_version, -1) <> coalesce(cur.version, 0) THEN
    RAISE EXCEPTION 'capability rejected (stale): % is at version %, not %', p_key, coalesce(cur.version, 0), p_expected_version USING ERRCODE = '22023';
  END IF;
  IF p_included_in IS NOT NULL AND NOT EXISTS (SELECT 1 FROM commercial.capabilities c WHERE c.capability_key = p_included_in AND c.status = 'active' AND c.capability_key <> p_key) THEN
    RAISE EXCEPTION 'capability rejected (unknown_parent): % is not a live capability', p_included_in USING ERRCODE = '22023';
  END IF;
  IF p_included_in IS NOT NULL AND cardinality(v_prefixes) > 0 THEN
    RAISE EXCEPTION 'capability rejected (prefixes): a capability folded into % gates nothing of its own (no prefixes)', p_included_in USING ERRCODE = '22023';
  END IF;
  FOREACH p IN ARRAY v_prefixes LOOP
    IF p IS NULL OR p !~ '^[a-z][a-z0-9_]*(\.[a-z0-9_]+)*\.$' THEN
      RAISE EXCEPTION 'capability rejected (prefixes): % is not an action prefix (dotted lower-case segments ending with a dot)', coalesce(p, '<null>') USING ERRCODE = '22023';
    END IF;
    IF commercial.cen_protected_prefix(p) THEN
      RAISE EXCEPTION 'capability rejected (boundary): % covers a mandatory control (identity, tenancy, audit, policy, retention and export, objects, warnings, attention, corrections) — no licence can gate it (ADR-022)', p USING ERRCODE = '22023';
    END IF;
    SELECT c.capability_key INTO v_other FROM commercial.capabilities c WHERE c.status = 'active' AND c.capability_key <> p_key AND p = ANY (c.action_prefixes) LIMIT 1;
    IF v_other IS NOT NULL THEN
      RAISE EXCEPTION 'capability rejected (duplicate): % is already covered by capability %', p, v_other USING ERRCODE = '22023';
    END IF;
  END LOOP;
  v_version := coalesce(cur.version, 0) + 1;
  IF cur.capability_key IS NOT NULL THEN
    UPDATE commercial.capabilities SET status = 'superseded', superseded_at = clock_timestamp() WHERE capability_key = p_key AND version = cur.version;
  END IF;
  INSERT INTO commercial.capabilities (capability_key, version, label, description, action_prefixes, included_in, core, entitlement_unit, tier, built, spec_refs,
                                       cannot_remove, status, declared_by, reason, provenance, digest, correlation_id)
  VALUES (p_key, v_version, p_label, p_description, v_prefixes, p_included_in, false, p_unit, p_tier, coalesce(p_built, true), coalesce(p_spec_refs, '{}'),
          coalesce(p_cannot_remove, ''), p_status, p_actor, p_reason, jsonb_build_object('declared_by', p_actor, 'correlation_id', p_correlation),
          commercial.cen_digest(jsonb_build_object('key', p_key, 'version', v_version, 'prefixes', to_jsonb(v_prefixes), 'core', false, 'included_in', p_included_in, 'unit', p_unit, 'tier', p_tier, 'status', p_status)),
          p_correlation)
  RETURNING * INTO v_row;
  INSERT INTO commercial.entitlement_events (event_id, tenant_id, subject_kind, subject_key, version, event, actor, reason, details, correlation_id)
  VALUES (p_event_id, NULL, 'capability', p_key, v_version, CASE WHEN p_status = 'retired' THEN 'capability.retired' ELSE 'capability.declared' END, p_actor, p_reason,
          jsonb_build_object('prefixes', to_jsonb(v_prefixes), 'supersedes', cur.version), p_correlation);
  RETURN to_jsonb(v_row);
END $$;

/* declare_package — the capabilities (live catalogue keys; core is implicit in every licence) and the limits (an object of non-negative
   numbers or of {quantity ≥ 0, unit, period}) — a new package or a new version; published or withdrawn. */
CREATE OR REPLACE FUNCTION commercial.declare_package(p_key text, p_expected_version int, p_title text, p_capabilities text[], p_limits jsonb, p_tier text,
  p_status text, p_reason text, p_actor uuid, p_event_id uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = commercial, public, pg_catalog, pg_temp AS $$
DECLARE cur commercial.packages%ROWTYPE; v_version int; k text; v_unknown text; v_caps text[]; v_row commercial.packages%ROWTYPE; v_limits jsonb := coalesce(p_limits, '{}'::jsonb);
BEGIN
  PERFORM commercial.cen_assert_vendor('commercial.offer.package', p_actor, 'offer');
  IF p_key IS NULL OR p_key !~ '^[a-z][a-z0-9-]{1,60}$' THEN RAISE EXCEPTION 'offer rejected (key): a package key is lower-case kebab case' USING ERRCODE = '22023'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN RAISE EXCEPTION 'offer rejected (reason): a package states its reason (8 characters or more)' USING ERRCODE = '22023'; END IF;
  IF p_status IS NULL OR p_status NOT IN ('published', 'withdrawn') THEN RAISE EXCEPTION 'offer rejected (status): a package is published or withdrawn' USING ERRCODE = '22023'; END IF;
  IF p_title IS NULL OR length(btrim(p_title)) NOT BETWEEN 2 AND 160 THEN RAISE EXCEPTION 'offer rejected (title): a package has a title (2–160 characters)' USING ERRCODE = '22023'; END IF;
  SELECT string_agg(x, ', ') INTO v_unknown FROM unnest(coalesce(p_capabilities, '{}')) x
   WHERE NOT EXISTS (SELECT 1 FROM commercial.capabilities c WHERE c.capability_key = x AND c.status = 'active');
  IF v_unknown IS NOT NULL THEN RAISE EXCEPTION 'offer rejected (unknown_capability): % — not a live capability of the catalogue', v_unknown USING ERRCODE = '22023'; END IF;
  SELECT coalesce(array_agg(DISTINCT x ORDER BY x), '{}') INTO v_caps FROM unnest(coalesce(p_capabilities, '{}')) x;
  IF jsonb_typeof(v_limits) <> 'object' THEN RAISE EXCEPTION 'offer rejected (limits): limits are an object of dimension → limit' USING ERRCODE = '22023'; END IF;
  FOR k IN SELECT e.key FROM jsonb_each(v_limits) e LOOP
    IF k !~ '^[a-z][a-z0-9_]{1,40}$'
       OR NOT ((jsonb_typeof(v_limits -> k) = 'number' AND (v_limits ->> k)::numeric >= 0)
               OR (jsonb_typeof(v_limits -> k) = 'object' AND jsonb_typeof(v_limits -> k -> 'quantity') = 'number' AND (v_limits -> k ->> 'quantity')::numeric >= 0)) THEN
      RAISE EXCEPTION 'offer rejected (limits): limit % is a non-negative number or {quantity ≥ 0, unit, period}', k USING ERRCODE = '22023';
    END IF;
  END LOOP;
  SELECT * INTO cur FROM commercial.packages x WHERE x.package_key = p_key AND x.status <> 'superseded' FOR UPDATE;
  IF coalesce(p_expected_version, -1) <> coalesce(cur.version, 0) THEN
    RAISE EXCEPTION 'offer rejected (stale): package % is at version %, not %', p_key, coalesce(cur.version, 0), p_expected_version USING ERRCODE = '22023';
  END IF;
  v_version := coalesce(cur.version, 0) + 1;
  IF cur.package_key IS NOT NULL THEN UPDATE commercial.packages SET status = 'superseded', superseded_at = clock_timestamp() WHERE package_key = p_key AND version = cur.version; END IF;
  INSERT INTO commercial.packages (package_key, version, title, capabilities, limits, tier, status, declared_by, reason, provenance, digest, correlation_id)
  VALUES (p_key, v_version, p_title, v_caps, v_limits, coalesce(p_tier, 'custom'), p_status, p_actor, p_reason, jsonb_build_object('declared_by', p_actor, 'correlation_id', p_correlation),
          commercial.cen_digest(jsonb_build_object('package', p_key, 'version', v_version, 'capabilities', to_jsonb(v_caps), 'limits', v_limits, 'tier', coalesce(p_tier, 'custom'), 'status', p_status)),
          p_correlation)
  RETURNING * INTO v_row;
  INSERT INTO commercial.entitlement_events (event_id, tenant_id, subject_kind, subject_key, version, event, actor, reason, details, correlation_id)
  VALUES (p_event_id, NULL, 'package', p_key, v_version, CASE WHEN p_status = 'withdrawn' THEN 'package.withdrawn' ELSE 'package.declared' END, p_actor, p_reason,
          jsonb_build_object('capabilities', to_jsonb(v_caps), 'limits', v_limits, 'supersedes', cur.version), p_correlation);
  RETURN to_jsonb(v_row);
END $$;

/* declare_sku — a SKU names a PUBLISHED package (its current version, pinned) and a term. */
CREATE OR REPLACE FUNCTION commercial.declare_sku(p_code text, p_expected_version int, p_title text, p_package_key text, p_term_months int, p_status text,
  p_reason text, p_actor uuid, p_event_id uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = commercial, public, pg_catalog, pg_temp AS $$
DECLARE cur commercial.skus%ROWTYPE; pk commercial.packages%ROWTYPE; v_version int; v_row commercial.skus%ROWTYPE;
BEGIN
  PERFORM commercial.cen_assert_vendor('commercial.offer.sku', p_actor, 'offer');
  IF p_code IS NULL OR p_code !~ '^[A-Z][A-Z0-9-]{2,40}$' THEN RAISE EXCEPTION 'offer rejected (key): a SKU code is upper-case (3–41 characters)' USING ERRCODE = '22023'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN RAISE EXCEPTION 'offer rejected (reason): a SKU states its reason (8 characters or more)' USING ERRCODE = '22023'; END IF;
  IF p_status IS NULL OR p_status NOT IN ('active', 'withdrawn') THEN RAISE EXCEPTION 'offer rejected (status): a SKU is active or withdrawn' USING ERRCODE = '22023'; END IF;
  IF p_term_months IS NULL OR p_term_months NOT BETWEEN 1 AND 120 THEN RAISE EXCEPTION 'offer rejected (term): a SKU''s term is 1 to 120 months' USING ERRCODE = '22023'; END IF;
  IF p_title IS NULL OR length(btrim(p_title)) NOT BETWEEN 2 AND 160 THEN RAISE EXCEPTION 'offer rejected (title): a SKU has a title (2–160 characters)' USING ERRCODE = '22023'; END IF;
  SELECT * INTO pk FROM commercial.packages x WHERE x.package_key = p_package_key AND x.status <> 'superseded';
  IF NOT FOUND THEN RAISE EXCEPTION 'offer rejected (unknown_package): % is not a package of the catalogue', coalesce(p_package_key, '<none>') USING ERRCODE = '22023'; END IF;
  IF pk.status <> 'published' THEN RAISE EXCEPTION 'offer rejected (state): package % is %; a SKU names a published package', p_package_key, pk.status USING ERRCODE = '22023'; END IF;
  SELECT * INTO cur FROM commercial.skus x WHERE x.sku_code = p_code AND x.status <> 'superseded' FOR UPDATE;
  IF coalesce(p_expected_version, -1) <> coalesce(cur.version, 0) THEN
    RAISE EXCEPTION 'offer rejected (stale): SKU % is at version %, not %', p_code, coalesce(cur.version, 0), p_expected_version USING ERRCODE = '22023';
  END IF;
  v_version := coalesce(cur.version, 0) + 1;
  IF cur.sku_code IS NOT NULL THEN UPDATE commercial.skus SET status = 'superseded', superseded_at = clock_timestamp() WHERE sku_code = p_code AND version = cur.version; END IF;
  INSERT INTO commercial.skus (sku_code, version, title, package_key, package_version, term_months, status, declared_by, reason, provenance, digest, correlation_id)
  VALUES (p_code, v_version, p_title, pk.package_key, pk.version, p_term_months, p_status, p_actor, p_reason, jsonb_build_object('declared_by', p_actor, 'correlation_id', p_correlation),
          commercial.cen_digest(jsonb_build_object('sku', p_code, 'version', v_version, 'package', pk.package_key, 'package_version', pk.version, 'package_digest', pk.digest, 'term_months', p_term_months, 'status', p_status)),
          p_correlation)
  RETURNING * INTO v_row;
  INSERT INTO commercial.entitlement_events (event_id, tenant_id, subject_kind, subject_key, version, event, actor, reason, details, correlation_id)
  VALUES (p_event_id, NULL, 'sku', p_code, v_version, CASE WHEN p_status = 'withdrawn' THEN 'sku.withdrawn' ELSE 'sku.declared' END, p_actor, p_reason,
          jsonb_build_object('package', pk.package_key, 'package_version', pk.version, 'term_months', p_term_months), p_correlation);
  RETURN to_jsonb(v_row);
END $$;

/* declare_offer — SKUs presented together, with an effective window; published or withdrawn. */
CREATE OR REPLACE FUNCTION commercial.declare_offer(p_key text, p_expected_version int, p_title text, p_summary text, p_sku_codes text[], p_effective_from timestamptz,
  p_effective_to timestamptz, p_status text, p_reason text, p_actor uuid, p_event_id uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = commercial, public, pg_catalog, pg_temp AS $$
DECLARE cur commercial.offers%ROWTYPE; v_version int; v_unknown text; v_from timestamptz := coalesce(p_effective_from, clock_timestamp()); v_row commercial.offers%ROWTYPE; v_skus text[];
BEGIN
  PERFORM commercial.cen_assert_vendor('commercial.offer.declare', p_actor, 'offer');
  IF p_key IS NULL OR p_key !~ '^[a-z][a-z0-9-]{1,60}$' THEN RAISE EXCEPTION 'offer rejected (key): an offer key is lower-case kebab case' USING ERRCODE = '22023'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN RAISE EXCEPTION 'offer rejected (reason): an offer states its reason (8 characters or more)' USING ERRCODE = '22023'; END IF;
  IF p_status IS NULL OR p_status NOT IN ('published', 'withdrawn') THEN RAISE EXCEPTION 'offer rejected (status): an offer is published or withdrawn' USING ERRCODE = '22023'; END IF;
  IF p_title IS NULL OR length(btrim(p_title)) NOT BETWEEN 2 AND 160 THEN RAISE EXCEPTION 'offer rejected (title): an offer has a title (2–160 characters)' USING ERRCODE = '22023'; END IF;
  IF p_summary IS NULL OR length(btrim(p_summary)) NOT BETWEEN 8 AND 2000 THEN RAISE EXCEPTION 'offer rejected (summary): an offer has a summary (8–2000 characters)' USING ERRCODE = '22023'; END IF;
  IF p_effective_to IS NOT NULL AND p_effective_to <= v_from THEN RAISE EXCEPTION 'offer rejected (window): the offer ends after it begins' USING ERRCODE = '22023'; END IF;
  SELECT coalesce(array_agg(DISTINCT x ORDER BY x), '{}') INTO v_skus FROM unnest(coalesce(p_sku_codes, '{}')) x;
  IF cardinality(v_skus) = 0 THEN RAISE EXCEPTION 'offer rejected (skus): an offer presents at least one SKU' USING ERRCODE = '22023'; END IF;
  SELECT string_agg(x, ', ') INTO v_unknown FROM unnest(v_skus) x WHERE NOT EXISTS (SELECT 1 FROM commercial.skus s WHERE s.sku_code = x AND s.status = 'active');
  IF v_unknown IS NOT NULL THEN RAISE EXCEPTION 'offer rejected (unknown_sku): % — not an active SKU', v_unknown USING ERRCODE = '22023'; END IF;
  SELECT * INTO cur FROM commercial.offers x WHERE x.offer_key = p_key AND x.status <> 'superseded' FOR UPDATE;
  IF coalesce(p_expected_version, -1) <> coalesce(cur.version, 0) THEN
    RAISE EXCEPTION 'offer rejected (stale): offer % is at version %, not %', p_key, coalesce(cur.version, 0), p_expected_version USING ERRCODE = '22023';
  END IF;
  v_version := coalesce(cur.version, 0) + 1;
  IF cur.offer_key IS NOT NULL THEN UPDATE commercial.offers SET status = 'superseded', superseded_at = clock_timestamp() WHERE offer_key = p_key AND version = cur.version; END IF;
  INSERT INTO commercial.offers (offer_key, version, title, summary, sku_codes, status, effective_from, effective_to, declared_by, reason, provenance, digest, correlation_id)
  VALUES (p_key, v_version, p_title, p_summary, v_skus, p_status, v_from, p_effective_to, p_actor, p_reason, jsonb_build_object('declared_by', p_actor, 'correlation_id', p_correlation),
          commercial.cen_digest(jsonb_build_object('offer', p_key, 'version', v_version, 'skus', to_jsonb(v_skus), 'from', v_from, 'to', p_effective_to, 'status', p_status)),
          p_correlation)
  RETURNING * INTO v_row;
  INSERT INTO commercial.entitlement_events (event_id, tenant_id, subject_kind, subject_key, version, event, actor, reason, details, correlation_id)
  VALUES (p_event_id, NULL, 'offer', p_key, v_version, CASE WHEN p_status = 'withdrawn' THEN 'offer.withdrawn' ELSE 'offer.declared' END, p_actor, p_reason,
          jsonb_build_object('skus', to_jsonb(v_skus)), p_correlation);
  RETURN to_jsonb(v_row);
END $$;

/* issue_licence — assigns a licence VERSION to a tenant (PR-66-002, CAP-DL-03): the SKU's pinned package → the capabilities (the package's
   ∪ every core capability — core is in every licence) and the limits (the package's, or an override), the effective window, the provenance
   (who, the SKU and its version, the package and its version, the order reference, the reason) and the digest. The tenant's licence keeps
   ONE licence_id: the first issuance creates it (p_licence_id), every later one is v+1 and SUPERSEDES the live version. A SUSPENDED licence
   is not re-issued over (reinstatement is §GR's transition, never a back door); a version takes effect when issued (a renewal of the
   window is §GR's). */
CREATE OR REPLACE FUNCTION commercial.issue_licence(p_licence_id uuid, p_tenant uuid, p_sku_code text, p_limits jsonb, p_effective_from timestamptz,
  p_effective_to timestamptz, p_order_ref text, p_reason text, p_actor uuid, p_event_id uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = commercial, public, pg_catalog, pg_temp AS $$
DECLARE
  v_now timestamptz := clock_timestamp(); v_from timestamptz := coalesce(p_effective_from, clock_timestamp());
  sk commercial.skus%ROWTYPE; pk commercial.packages%ROWTYPE; cur commercial.licences%ROWTYPE; v_live int;
  v_caps text[]; v_limits jsonb; v_version int; v_lid uuid; v_prov jsonb; v_row commercial.licences%ROWTYPE; k text;
BEGIN
  PERFORM commercial.cen_assert_vendor('commercial.licence.issue', p_actor, 'licence');
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN RAISE EXCEPTION 'licence rejected (reason): an issuance states its reason (8 characters or more)' USING ERRCODE = '22023'; END IF;
  IF p_order_ref IS NULL OR length(btrim(p_order_ref)) NOT BETWEEN 2 AND 120 THEN RAISE EXCEPTION 'licence rejected (order): an issuance names its order reference (2–120 characters)' USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM tenancy.tenants t WHERE t.id = p_tenant) THEN RAISE EXCEPTION 'licence rejected (unknown_tenant): no such tenant' USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM tenancy.tenants t WHERE t.id = p_tenant AND t.status = 'active') THEN RAISE EXCEPTION 'licence rejected (state): the tenant is not active' USING ERRCODE = '22023'; END IF;
  SELECT * INTO sk FROM commercial.skus s WHERE s.sku_code = p_sku_code AND s.status <> 'superseded';
  IF NOT FOUND THEN RAISE EXCEPTION 'licence rejected (unknown_sku): % is not a SKU of the catalogue', coalesce(p_sku_code, '<none>') USING ERRCODE = '22023'; END IF;
  IF sk.status <> 'active' THEN RAISE EXCEPTION 'licence rejected (state): SKU % is %', p_sku_code, sk.status USING ERRCODE = '22023'; END IF;
  SELECT * INTO pk FROM commercial.packages x WHERE x.package_key = sk.package_key AND x.version = sk.package_version;
  IF pk.status = 'withdrawn' THEN RAISE EXCEPTION 'licence rejected (state): package % v% is withdrawn', pk.package_key, pk.version USING ERRCODE = '22023'; END IF;
  IF v_from > v_now + interval '1 minute' THEN
    RAISE EXCEPTION 'licence rejected (window): a licence version takes effect when issued (effective_from % is in the future; a renewal of the window is a transition of its own)', v_from USING ERRCODE = '22023';
  END IF;
  IF p_effective_to IS NOT NULL AND p_effective_to <= greatest(v_from, v_now) THEN RAISE EXCEPTION 'licence rejected (window): the licence must end after it begins and after now' USING ERRCODE = '22023'; END IF;
  v_limits := coalesce(p_limits, pk.limits);
  IF jsonb_typeof(v_limits) <> 'object' THEN RAISE EXCEPTION 'licence rejected (limits): limits are an object of dimension → limit' USING ERRCODE = '22023'; END IF;
  FOR k IN SELECT e.key FROM jsonb_each(v_limits) e LOOP
    IF NOT ((jsonb_typeof(v_limits -> k) = 'number' AND (v_limits ->> k)::numeric >= 0)
            OR (jsonb_typeof(v_limits -> k) = 'object' AND jsonb_typeof(v_limits -> k -> 'quantity') = 'number' AND (v_limits -> k ->> 'quantity')::numeric >= 0)) THEN
      RAISE EXCEPTION 'licence rejected (limits): limit % is a non-negative number or {quantity ≥ 0, unit, period}', k USING ERRCODE = '22023';
    END IF;
  END LOOP;
  -- the tenant's live licence (its latest non-superseded version), locked: two issuances serialise
  SELECT count(DISTINCT l.licence_id) INTO v_live FROM commercial.licences l WHERE l.tenant_id = p_tenant AND l.state <> 'superseded';
  IF v_live > 1 THEN RAISE EXCEPTION 'licence rejected (state): the tenant holds % live licences (indeterminate) — reconcile before issuing', v_live USING ERRCODE = '22023'; END IF;
  SELECT * INTO cur FROM commercial.licences l WHERE l.tenant_id = p_tenant AND l.state <> 'superseded' ORDER BY l.version DESC LIMIT 1 FOR UPDATE;
  IF cur.licence_id IS NOT NULL AND cur.state = 'suspended' THEN
    RAISE EXCEPTION 'licence rejected (state): licence v% is suspended; reinstatement is a transition of its own, never a re-issuance', cur.version USING ERRCODE = '22023';
  END IF;
  IF cur.licence_id IS NULL THEN
    SELECT l.licence_id, max(l.version) INTO v_lid, v_version FROM commercial.licences l WHERE l.tenant_id = p_tenant GROUP BY l.licence_id ORDER BY max(l.version) DESC LIMIT 1;
    v_lid := coalesce(v_lid, p_licence_id); v_version := coalesce(v_version, 0) + 1;
  ELSE
    v_lid := cur.licence_id; v_version := (SELECT max(l.version) FROM commercial.licences l WHERE l.licence_id = cur.licence_id) + 1;
  END IF;
  IF v_lid IS NULL THEN RAISE EXCEPTION 'licence rejected (key): a first issuance names its licence id' USING ERRCODE = '22023'; END IF;
  SELECT array_agg(DISTINCT x ORDER BY x) INTO v_caps FROM (
    SELECT unnest(pk.capabilities) AS x UNION SELECT c.capability_key FROM commercial.capabilities c WHERE c.core AND c.status = 'active') u;
  v_prov := jsonb_build_object('issued_by', p_actor, 'sku', sk.sku_code, 'sku_version', sk.version, 'sku_digest', sk.digest, 'package', pk.package_key,
                               'package_version', pk.version, 'package_digest', pk.digest, 'term_months', sk.term_months, 'order_ref', btrim(p_order_ref),
                               'reason', p_reason, 'supersedes', cur.version, 'correlation_id', p_correlation);
  IF cur.licence_id IS NOT NULL THEN
    UPDATE commercial.licences SET state = 'superseded', state_changed_at = v_now WHERE licence_id = cur.licence_id AND version = cur.version;
  END IF;
  INSERT INTO commercial.licences (licence_id, version, scope, tenant_id, domain_id, package_key, capabilities, limits, effective_from, effective_to, state,
                                   grace_until, last_valid, provenance, digest, issued_by, issued_at, state_changed_at, correlation_id)
  VALUES (v_lid, v_version, 'TENANT', p_tenant, NULL, pk.package_key, v_caps, v_limits, v_from, p_effective_to, 'active', NULL, NULL, v_prov,
          commercial.cen_digest(jsonb_build_object('licence', v_lid, 'version', v_version, 'tenant', p_tenant, 'package', pk.package_key, 'package_version', pk.version,
                                                   'capabilities', to_jsonb(v_caps), 'limits', v_limits, 'from', v_from, 'to', p_effective_to, 'provenance', v_prov)),
          p_actor, v_now, v_now, p_correlation)
  RETURNING * INTO v_row;
  IF cur.licence_id IS NOT NULL THEN
    INSERT INTO commercial.entitlement_events (event_id, tenant_id, subject_kind, subject_key, version, event, actor, reason, details, correlation_id)
    VALUES (gen_random_uuid(), p_tenant, 'licence', v_lid::text, cur.version, 'licence.superseded', p_actor, p_reason,
            jsonb_build_object('by_version', v_version, 'prior_state', cur.state), p_correlation);
  END IF;
  INSERT INTO commercial.entitlement_events (event_id, tenant_id, subject_kind, subject_key, version, event, actor, reason, details, correlation_id)
  VALUES (p_event_id, p_tenant, 'licence', v_lid::text, v_version, 'licence.issued', p_actor, p_reason,
          jsonb_build_object('sku', sk.sku_code, 'package', pk.package_key, 'package_version', pk.version, 'capabilities', to_jsonb(v_caps), 'digest', v_row.digest,
                             'order_ref', btrim(p_order_ref)), p_correlation);
  RETURN to_jsonb(v_row);
END $$;

/* declare_contract — THE CONTRACT SCOPE (V10-T-015): the decision cells (domains of the tenant, active), the sources and the twins (each
   of the tenant and inside a named cell), the authorities (each a customer role of the catalogue, optionally a named principal of the
   tenant — never the vendor's role or the platform administrator: the contract names CUSTOMER authority), the environments (deployment
   profiles by name; only local-dev exists — say so, the others are named, not available) and the support boundary {tier, statement}.
   Pinned to the tenant's live licence version (unknown_licence without one). */
CREATE OR REPLACE FUNCTION commercial.declare_contract(p_contract_id uuid, p_tenant uuid, p_expected_version int, p_contract_ref text, p_scope jsonb,
  p_effective_from timestamptz, p_effective_to timestamptz, p_status text, p_reason text, p_actor uuid, p_event_id uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = commercial, public, pg_catalog, pg_temp AS $$
DECLARE
  cur commercial.contracts%ROWTYPE; lic commercial.licences%ROWTYPE; v_version int; v_from timestamptz := coalesce(p_effective_from, clock_timestamp());
  v_cells jsonb; v_sources jsonb; v_twins jsonb; v_auth jsonb; v_env text[]; v_support jsonb; v_bad text; v_cell_ids uuid[]; a jsonb; v_row commercial.contracts%ROWTYPE;
BEGIN
  PERFORM commercial.cen_assert_vendor('commercial.contract.declare', p_actor, 'contract');
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN RAISE EXCEPTION 'contract rejected (reason): a contract states its reason (8 characters or more)' USING ERRCODE = '22023'; END IF;
  IF p_status IS NULL OR p_status NOT IN ('active', 'terminated') THEN RAISE EXCEPTION 'contract rejected (status): a contract is active or terminated' USING ERRCODE = '22023'; END IF;
  IF p_contract_ref IS NULL OR length(btrim(p_contract_ref)) NOT BETWEEN 2 AND 120 THEN RAISE EXCEPTION 'contract rejected (ref): a contract names its reference (2–120 characters)' USING ERRCODE = '22023'; END IF;
  IF p_scope IS NULL OR jsonb_typeof(p_scope) <> 'object' THEN RAISE EXCEPTION 'contract rejected (scope): the scope is an object' USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM tenancy.tenants t WHERE t.id = p_tenant) THEN RAISE EXCEPTION 'contract rejected (unknown_tenant): no such tenant' USING ERRCODE = '22023'; END IF;
  SELECT * INTO lic FROM commercial.licences l WHERE l.tenant_id = p_tenant AND l.state <> 'superseded' ORDER BY l.version DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'contract rejected (unknown_licence): the tenant holds no licence — a contract scopes a licence' USING ERRCODE = '22023'; END IF;
  -- decision cells
  v_cells := coalesce(p_scope -> 'decision_cells', '[]'::jsonb);
  IF jsonb_typeof(v_cells) <> 'array' OR jsonb_array_length(v_cells) = 0 THEN RAISE EXCEPTION 'contract rejected (decision_cells): a contract names at least one decision cell (a domain of the tenant)' USING ERRCODE = '22023'; END IF;
  SELECT string_agg(x, ', ') INTO v_bad FROM jsonb_array_elements_text(v_cells) x
   WHERE x !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      OR NOT EXISTS (SELECT 1 FROM tenancy.domains d WHERE d.id = x::uuid AND d.tenant_id = p_tenant AND d.status = 'active');
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION 'contract rejected (decision_cells): % — not an active domain of this tenant', v_bad USING ERRCODE = '22023'; END IF;
  SELECT array_agg(DISTINCT x::uuid) INTO v_cell_ids FROM jsonb_array_elements_text(v_cells) x;
  SELECT to_jsonb(array_agg(x ORDER BY x)) INTO v_cells FROM unnest(v_cell_ids) x;
  -- sources and twins: of the tenant, inside a named cell
  v_sources := coalesce(p_scope -> 'sources', '[]'::jsonb);
  IF jsonb_typeof(v_sources) <> 'array' THEN RAISE EXCEPTION 'contract rejected (sources): sources are a list of source ids' USING ERRCODE = '22023'; END IF;
  SELECT string_agg(x, ', ') INTO v_bad FROM jsonb_array_elements_text(v_sources) x
   WHERE x !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      OR NOT EXISTS (SELECT 1 FROM observation.source_contracts_current s WHERE s.source_id = x::uuid AND s.tenant_id = p_tenant AND s.domain_id = ANY (v_cell_ids));
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION 'contract rejected (sources): % — not a source of this tenant inside a named decision cell', v_bad USING ERRCODE = '22023'; END IF;
  SELECT coalesce(to_jsonb(array_agg(DISTINCT x ORDER BY x)), '[]'::jsonb) INTO v_sources FROM jsonb_array_elements_text(v_sources) x;
  v_twins := coalesce(p_scope -> 'twins', '[]'::jsonb);
  IF jsonb_typeof(v_twins) <> 'array' THEN RAISE EXCEPTION 'contract rejected (twins): twins are a list of twin ids' USING ERRCODE = '22023'; END IF;
  SELECT string_agg(x, ', ') INTO v_bad FROM jsonb_array_elements_text(v_twins) x
   WHERE x !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      OR NOT EXISTS (SELECT 1 FROM twin.twins_current t WHERE t.twin_id = x::uuid AND t.tenant_id = p_tenant AND t.domain_id = ANY (v_cell_ids));
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION 'contract rejected (twins): % — not a twin of this tenant inside a named decision cell', v_bad USING ERRCODE = '22023'; END IF;
  SELECT coalesce(to_jsonb(array_agg(DISTINCT x ORDER BY x)), '[]'::jsonb) INTO v_twins FROM jsonb_array_elements_text(v_twins) x;
  -- authorities: the customer's named roles
  v_auth := coalesce(p_scope -> 'authorities', '[]'::jsonb);
  IF jsonb_typeof(v_auth) <> 'array' OR jsonb_array_length(v_auth) = 0 THEN RAISE EXCEPTION 'contract rejected (authorities): a contract names at least one customer authority {role, principal_id?}' USING ERRCODE = '22023'; END IF;
  FOR a IN SELECT * FROM jsonb_array_elements(v_auth) LOOP
    IF jsonb_typeof(a) <> 'object' OR NOT EXISTS (SELECT 1 FROM identity.roles r WHERE r.code = a ->> 'role') THEN
      RAISE EXCEPTION 'contract rejected (authorities): % is not a role of the catalogue', coalesce(a ->> 'role', a::text) USING ERRCODE = '22023';
    END IF;
    IF a ->> 'role' IN ('commercial_authority', 'platform_admin') THEN
      RAISE EXCEPTION 'contract rejected (authorities): % is the vendor''s role — a contract names the customer''s authorities (never sold, never the vendor''s)', a ->> 'role' USING ERRCODE = '22023';
    END IF;
    IF a ? 'principal_id' AND ((a ->> 'principal_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        OR NOT EXISTS (SELECT 1 FROM identity.principals p WHERE p.id = (a ->> 'principal_id')::uuid AND p.tenant_id = p_tenant)) THEN
      RAISE EXCEPTION 'contract rejected (authorities): principal % is not a principal of this tenant', a ->> 'principal_id' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  -- environments
  IF jsonb_typeof(p_scope -> 'environments') <> 'array' OR jsonb_array_length(p_scope -> 'environments') = 0 THEN
    RAISE EXCEPTION 'contract rejected (environments): a contract names at least one environment (deployment profile)' USING ERRCODE = '22023';
  END IF;
  SELECT array_agg(DISTINCT x ORDER BY x) INTO v_env FROM jsonb_array_elements_text(p_scope -> 'environments') x;
  SELECT string_agg(x, ', ') INTO v_bad FROM unnest(v_env) x WHERE x NOT IN ('local-dev', 'saas', 'private-cloud', 'on-premise', 'disconnected', 'sovereign');
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION 'contract rejected (environments): % — the profiles are local-dev, saas, private-cloud, on-premise, disconnected, sovereign', v_bad USING ERRCODE = '22023'; END IF;
  -- the support boundary
  v_support := p_scope -> 'support_boundary';
  IF v_support IS NULL OR jsonb_typeof(v_support) <> 'object' OR length(btrim(coalesce(v_support ->> 'statement', ''))) NOT BETWEEN 8 AND 2000 THEN
    RAISE EXCEPTION 'contract rejected (support_boundary): the support boundary is {tier, statement (8–2000 characters)}' USING ERRCODE = '22023';
  END IF;
  IF p_effective_to IS NOT NULL AND p_effective_to <= v_from THEN RAISE EXCEPTION 'contract rejected (window): the contract ends after it begins' USING ERRCODE = '22023'; END IF;
  SELECT * INTO cur FROM commercial.contracts c WHERE c.contract_id = p_contract_id AND c.status <> 'superseded' FOR UPDATE;
  IF cur.contract_id IS NOT NULL AND cur.tenant_id <> p_tenant THEN RAISE EXCEPTION 'contract rejected (unknown_contract): no such contract for this tenant' USING ERRCODE = '22023'; END IF;
  IF coalesce(p_expected_version, -1) <> coalesce(cur.version, 0) THEN
    RAISE EXCEPTION 'contract rejected (stale): contract % is at version %, not %', p_contract_id, coalesce(cur.version, 0), p_expected_version USING ERRCODE = '22023';
  END IF;
  IF cur.contract_id IS NOT NULL AND cur.status = 'terminated' THEN RAISE EXCEPTION 'contract rejected (state): the contract was terminated; a new contract is declared afresh' USING ERRCODE = '22023'; END IF;
  v_version := coalesce(cur.version, 0) + 1;
  IF cur.contract_id IS NOT NULL THEN UPDATE commercial.contracts SET status = 'superseded', superseded_at = clock_timestamp() WHERE contract_id = p_contract_id AND version = cur.version; END IF;
  INSERT INTO commercial.contracts (contract_id, version, scope, tenant_id, contract_ref, licence_id, licence_version, decision_cells, sources, twins, authorities, environments,
                                    support_boundary, effective_from, effective_to, status, declared_by, reason, provenance, digest, correlation_id)
  VALUES (p_contract_id, v_version, 'TENANT', p_tenant, btrim(p_contract_ref), lic.licence_id, lic.version, v_cells, v_sources, v_twins, v_auth, v_env, v_support,
          v_from, p_effective_to, p_status, p_actor, p_reason,
          jsonb_build_object('declared_by', p_actor, 'licence_digest', lic.digest, 'correlation_id', p_correlation,
                             'environments_available', to_jsonb(ARRAY(SELECT x FROM unnest(v_env) x WHERE x = 'local-dev'))),
          commercial.cen_digest(jsonb_build_object('contract', p_contract_id, 'version', v_version, 'tenant', p_tenant, 'licence', lic.licence_id, 'licence_version', lic.version,
                                                   'cells', v_cells, 'sources', v_sources, 'twins', v_twins, 'authorities', v_auth, 'environments', to_jsonb(v_env),
                                                   'support', v_support, 'from', v_from, 'to', p_effective_to, 'status', p_status)),
          p_correlation)
  RETURNING * INTO v_row;
  IF cur.contract_id IS NOT NULL THEN
    INSERT INTO commercial.entitlement_events (event_id, tenant_id, subject_kind, subject_key, version, event, actor, reason, details, correlation_id)
    VALUES (gen_random_uuid(), p_tenant, 'contract', p_contract_id::text, cur.version, 'contract.superseded', p_actor, p_reason, jsonb_build_object('by_version', v_version), p_correlation);
  END IF;
  INSERT INTO commercial.entitlement_events (event_id, tenant_id, subject_kind, subject_key, version, event, actor, reason, details, correlation_id)
  VALUES (p_event_id, p_tenant, 'contract', p_contract_id::text, v_version, CASE WHEN p_status = 'terminated' THEN 'contract.terminated' ELSE 'contract.declared' END, p_actor, p_reason,
          jsonb_build_object('licence_version', lic.version, 'digest', v_row.digest, 'cells', jsonb_array_length(v_cells)), p_correlation);
  RETURN to_jsonb(v_row);
END $$;

REVOKE ALL ON FUNCTION commercial.declare_capability(text, int, text, text, text[], text, text, text, boolean, text[], text, text, text, uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION commercial.declare_package(text, int, text, text[], jsonb, text, text, text, uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION commercial.declare_sku(text, int, text, text, int, text, text, uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION commercial.declare_offer(text, int, text, text, text[], timestamptz, timestamptz, text, text, uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION commercial.issue_licence(uuid, uuid, text, jsonb, timestamptz, timestamptz, text, text, uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION commercial.declare_contract(uuid, uuid, int, text, jsonb, timestamptz, timestamptz, text, text, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION commercial.declare_capability(text, int, text, text, text[], text, text, text, boolean, text[], text, text, text, uuid, uuid, uuid) TO eye_commit;
GRANT EXECUTE ON FUNCTION commercial.declare_package(text, int, text, text[], jsonb, text, text, text, uuid, uuid, uuid) TO eye_commit;
GRANT EXECUTE ON FUNCTION commercial.declare_sku(text, int, text, text, int, text, text, uuid, uuid, uuid) TO eye_commit;
GRANT EXECUTE ON FUNCTION commercial.declare_offer(text, int, text, text, text[], timestamptz, timestamptz, text, text, uuid, uuid, uuid) TO eye_commit;
GRANT EXECUTE ON FUNCTION commercial.issue_licence(uuid, uuid, text, jsonb, timestamptz, timestamptz, text, text, uuid, uuid, uuid) TO eye_commit;
GRANT EXECUTE ON FUNCTION commercial.declare_contract(uuid, uuid, int, text, jsonb, timestamptz, timestamptz, text, text, uuid, uuid, uuid) TO eye_commit;

-- ─────────────────────────────────────────────────────────────────────
-- §EN.5 THE GATE AND THE TENANT'S READS
-- ─────────────────────────────────────────────────────────────────────
/* The read guard: the PLATFORM scope (the vendor, the platform), or the caller's bound tenant (N-01's assert_read_scope, the domain of a
   DOMAIN-bound caller being its own — a licence is tenant-wide). An unbound caller is refused. */
CREATE OR REPLACE FUNCTION commercial.cen_assert_read(p_tenant uuid, p_what text) RETURNS void
LANGUAGE plpgsql STABLE SET search_path = commercial, observation, public, pg_catalog, pg_temp AS $$
BEGIN
  IF public.eye_scope() IS DISTINCT FROM 'PLATFORM' THEN
    PERFORM observation.assert_read_scope(p_tenant, public.eye_domain(), p_what);
  END IF;
END $$;
REVOKE ALL ON FUNCTION commercial.cen_assert_read(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION commercial.cen_assert_read(uuid, text) TO eye_app, eye_commit;

/* THE GATE (ADR-022, PR-66-003): is `p_action` AVAILABLE to `p_tenant` now? `p_human_gated` = the PDP rule carries the human gate (the
   pipeline passes it; a reader asking leaves it false). The answer, as jsonb:
     available, action, tenant_id, contracted, exemption, capability {key, label, core, built}, licence {licence_id, version, state,
     package_key, effective_from, effective_to, digest}, state, reason, stays_available, grace {in_grace, grace_until, last_valid, rules,
     rules_source}.
   In order: an EXEMPT action is available always (whatever the licence); an UNCONTRACTED tenant (no licence row) is never gated; an
   INDETERMINATE entitlement (more than one live licence) is treated as GRACE on the latest (FEX-30); a CORE or UNCATALOGUED action is
   available; a capability the live licence does not list is UNAVAILABLE (not licensed); an ACTIVE licence past its effective_to whose
   transition has not run yet reads as GRACE; ACTIVE → available; GRACE → as commercial.grace_rules(tenant) declares (§GR's seam, consulted
   through to_regprocedure: {mode: 'full' | 'read_preserve' | …, allow_actions: [action prefixes]}) — absent, READ AND PRESERVE ONLY (every
   exempt action stays; no other); SUSPENDED or LAPSED → UNAVAILABLE. */
CREATE OR REPLACE FUNCTION commercial.capability_available(p_tenant uuid, p_action text, p_human_gated boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = commercial, public, pg_catalog, pg_temp AS $$
DECLARE
  v_now timestamptz := clock_timestamp(); v_ex text; cap commercial.capabilities%ROWTYPE; lic commercial.licences%ROWTYPE; v_live int;
  v_state text; v_avail boolean; v_reason text; v_rules jsonb; v_rules_source text; v_grace jsonb := NULL; v_capj jsonb := NULL; v_licj jsonb := NULL;
  v_indeterminate boolean := false; v_name text;
BEGIN
  PERFORM commercial.cen_assert_read(p_tenant, 'the availability of a capability');
  IF p_action IS NULL OR p_action !~ '^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$' THEN
    RAISE EXCEPTION 'capability rejected (action): % is not an action name', coalesce(p_action, '<none>') USING ERRCODE = '22023';
  END IF;
  v_ex := commercial.cen_exemption(p_action, p_human_gated);
  cap := commercial.cen_action_capability(p_action);
  IF cap.capability_key IS NOT NULL THEN
    v_capj := jsonb_build_object('key', cap.capability_key, 'label', cap.label, 'core', cap.core, 'built', cap.built, 'version', cap.version);
  END IF;
  SELECT count(DISTINCT l.licence_id) INTO v_live FROM commercial.licences l WHERE l.tenant_id = p_tenant AND l.state <> 'superseded';
  SELECT * INTO lic FROM commercial.licences l WHERE l.tenant_id = p_tenant AND l.state <> 'superseded'
   ORDER BY EXISTS (SELECT 1 FROM commercial.entitlement_events e WHERE e.subject_kind = 'licence' AND e.subject_key = l.licence_id::text
                                    AND e.version = l.version AND e.event = 'licence.issued') DESC, l.issued_at DESC, l.version DESC LIMIT 1;
  IF lic.licence_id IS NOT NULL THEN
    v_licj := jsonb_build_object('licence_id', lic.licence_id, 'version', lic.version, 'state', lic.state, 'package_key', lic.package_key,
                                 'effective_from', lic.effective_from, 'effective_to', lic.effective_to, 'digest', lic.digest, 'capabilities', to_jsonb(lic.capabilities));
  END IF;
  v_name := coalesce(cap.capability_key, split_part(p_action, '.', 1));

  IF v_ex IS NOT NULL THEN
    v_avail := true; v_state := coalesce(lic.state, 'uncontracted'); v_reason := 'exempt (' || v_ex || '): a mandatory control or a human decision is never made unavailable by an entitlement';
  ELSIF lic.licence_id IS NULL THEN
    v_avail := true; v_state := 'uncontracted'; v_reason := 'uncontracted: this tenant holds no licence; the availability gate does not apply';
  ELSE
    v_state := lic.state;
    IF v_live > 1 THEN v_indeterminate := true; v_state := 'grace'; END IF;
    IF v_state = 'active' AND lic.effective_to IS NOT NULL AND lic.effective_to <= v_now THEN v_state := 'grace'; END IF;
    IF v_state = 'grace' THEN
      IF to_regprocedure('commercial.grace_rules(uuid)') IS NOT NULL THEN
        BEGIN
          EXECUTE 'SELECT to_jsonb(commercial.grace_rules($1))' INTO v_rules USING p_tenant;
          v_rules_source := 'commercial.grace_rules';
        EXCEPTION WHEN OTHERS THEN
          v_rules := NULL; v_rules_source := 'commercial.grace_rules unreadable — default: read and preserve only';
        END;
      END IF;
      -- integration seam: §GR's grace_rules answers {state, policy, rules {new_work, finish_running_work, finish_running_actions,
      -- capabilities (the last valid entitlement)}, explanation}; read as this gate's {mode, allow_actions, capabilities}:
      -- new work allowed → full; running work may finish → only the finishing actions; otherwise read and preserve only.
      IF v_rules IS NOT NULL AND jsonb_typeof(v_rules -> 'rules') = 'object' THEN
        v_rules := jsonb_build_object(
          'mode', CASE WHEN coalesce((v_rules -> 'rules' ->> 'new_work')::boolean, false) THEN 'full'
                       WHEN coalesce((v_rules -> 'rules' ->> 'finish_running_work')::boolean, false) THEN 'finish_running'
                       ELSE 'read_preserve' END,
          'allow_actions', CASE WHEN NOT coalesce((v_rules -> 'rules' ->> 'new_work')::boolean, false)
                                 AND coalesce((v_rules -> 'rules' ->> 'finish_running_work')::boolean, false)
                                 AND jsonb_typeof(v_rules -> 'rules' -> 'finish_running_actions') = 'array'
                                THEN v_rules -> 'rules' -> 'finish_running_actions' ELSE '[]'::jsonb END,
          'capabilities', v_rules -> 'rules' -> 'capabilities',
          'explanation', v_rules -> 'explanation', 'policy', v_rules -> 'policy');
      END IF;
      IF v_rules IS NULL OR jsonb_typeof(v_rules) <> 'object' THEN
        v_rules := jsonb_build_object('mode', 'read_preserve', 'allow_actions', '[]'::jsonb);
        v_rules_source := coalesce(v_rules_source, 'default: read and preserve only (no grace rules declared)');
      END IF;
      v_grace := jsonb_build_object('in_grace', true, 'grace_until', lic.grace_until, 'last_valid', lic.last_valid, 'rules', v_rules, 'rules_source', v_rules_source,
                                    'indeterminate', v_indeterminate, 'expired_pending_transition', lic.state = 'active', 'last_valid_licence_version', lic.version);
    END IF;
    IF cap.capability_key IS NULL THEN
      v_avail := true; v_reason := 'uncatalogued: no capability of the catalogue covers ' || p_action || ', so no licence can make it unavailable';
    ELSIF cap.core THEN
      v_avail := true; v_reason := 'core: ' || cap.capability_key || ' is a core capability (it cannot be removed)';
    ELSIF NOT (cap.capability_key = ANY (lic.capabilities)) THEN
      v_avail := false;
      v_reason := format('capability unavailable (entitlement): %s is not licensed for this tenant (%s; licence v%s) — %s', cap.capability_key, v_state, lic.version, commercial.cen_stays_available());
    ELSIF v_state = 'active' THEN
      v_avail := true; v_reason := format('licensed: %s under licence v%s (active)', cap.capability_key, lic.version);
    ELSIF v_state = 'grace' THEN
      v_avail := (jsonb_typeof(v_rules -> 'capabilities') IS DISTINCT FROM 'array' OR (v_rules -> 'capabilities') ? cap.capability_key)  -- the last valid entitlement (§GR)
             AND (coalesce(v_rules ->> 'mode', '') = 'full'
              OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(v_rules -> 'allow_actions') = 'array' THEN v_rules -> 'allow_actions' ELSE '[]'::jsonb END) e
                          WHERE e <> '' AND left(p_action, length(e)) = e));
      v_reason := CASE WHEN v_avail
        THEN format('grace: %s is available under licence v%s in grace (%s)%s', cap.capability_key, lic.version, v_rules_source, CASE WHEN v_indeterminate THEN ' — the entitlement is indeterminate (more than one live licence)' ELSE '' END)
        ELSE format('capability unavailable (entitlement): %s is in grace for this tenant (grace%s; licence v%s) — grace allows reading and preserving work only%s; %s',
                    cap.capability_key, coalesce(' until ' || to_char(lic.grace_until AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI "UTC"'), ''), lic.version,
                    CASE WHEN v_indeterminate THEN ' (the entitlement is indeterminate: more than one live licence)' ELSE '' END, commercial.cen_stays_available()) END;
    ELSE  -- suspended, lapsed
      v_avail := false;
      v_reason := format('capability unavailable (entitlement): %s is not available for this tenant (%s; licence v%s) — %s', cap.capability_key, v_state, lic.version, commercial.cen_stays_available());
    END IF;
  END IF;
  RETURN jsonb_build_object('available', v_avail, 'action', p_action, 'tenant_id', p_tenant, 'contracted', lic.licence_id IS NOT NULL, 'exemption', v_ex,
                            'capability', v_capj, 'capability_name', v_name, 'licence', v_licj, 'state', v_state, 'reason', v_reason,
                            'stays_available', commercial.cen_stays_available(),
                            'grace', coalesce(v_grace, jsonb_build_object('in_grace', v_state = 'grace', 'grace_until', lic.grace_until, 'last_valid', lic.last_valid)));
END $$;
REVOKE ALL ON FUNCTION commercial.capability_available(uuid, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION commercial.capability_available(uuid, text, boolean) TO eye_app, eye_commit;

/* THE TENANT'S ENTITLEMENT (UX-67-001/002): the live licence and its history, the MATRIX (every live catalogue capability: core, licensed,
   available now, the reason), the live contract, and what always stays available. Guarded like the gate. */
CREATE OR REPLACE FUNCTION commercial.entitlement_summary(p_tenant uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = commercial, public, pg_catalog, pg_temp AS $$
DECLARE lic commercial.licences%ROWTYPE; v_matrix jsonb; v_hist jsonb; v_contract jsonb; v_state text;
BEGIN
  PERFORM commercial.cen_assert_read(p_tenant, 'the entitlement of a tenant');
  SELECT * INTO lic FROM commercial.licences l WHERE l.tenant_id = p_tenant AND l.state <> 'superseded'
   ORDER BY EXISTS (SELECT 1 FROM commercial.entitlement_events e WHERE e.subject_kind = 'licence' AND e.subject_key = l.licence_id::text
                                    AND e.version = l.version AND e.event = 'licence.issued') DESC, l.issued_at DESC, l.version DESC LIMIT 1;
  v_state := CASE WHEN lic.licence_id IS NULL THEN 'uncontracted'
                  WHEN lic.state = 'active' AND lic.effective_to IS NOT NULL AND lic.effective_to <= clock_timestamp() THEN 'grace' ELSE lic.state END;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'key', c.capability_key, 'label', c.label, 'core', c.core, 'built', c.built, 'tier', c.tier, 'included_in', c.included_in,
           'prefixes', to_jsonb(c.action_prefixes), 'unit', c.entitlement_unit, 'spec_refs', to_jsonb(c.spec_refs),
           'licensed', c.core OR lic.licence_id IS NULL OR c.capability_key = ANY (lic.capabilities)
                      OR (c.included_in IS NOT NULL AND c.included_in = ANY (lic.capabilities)),
           'available', CASE WHEN c.core OR lic.licence_id IS NULL THEN true
                             WHEN NOT (c.capability_key = ANY (lic.capabilities) OR (c.included_in IS NOT NULL AND c.included_in = ANY (lic.capabilities))) THEN false
                             WHEN v_state = 'active' THEN true
                             WHEN v_state = 'grace' THEN NULL  -- constrained: as the grace rules declare, per action
                             ELSE false END)
         ORDER BY c.core DESC, c.tier, c.capability_key), '[]'::jsonb)
    INTO v_matrix FROM commercial.capabilities c WHERE c.status = 'active';
  SELECT coalesce(jsonb_agg(jsonb_build_object('licence_id', l.licence_id, 'version', l.version, 'state', l.state, 'package_key', l.package_key,
           'capabilities', to_jsonb(l.capabilities), 'limits', l.limits, 'effective_from', l.effective_from, 'effective_to', l.effective_to,
           'grace_until', l.grace_until, 'last_valid', l.last_valid, 'provenance', l.provenance, 'digest', l.digest, 'issued_by', l.issued_by,
           'issued_at', l.issued_at, 'state_changed_at', l.state_changed_at) ORDER BY l.version DESC), '[]'::jsonb)
    INTO v_hist FROM commercial.licences l WHERE l.tenant_id = p_tenant;
  SELECT to_jsonb(c) INTO v_contract FROM commercial.contracts c WHERE c.tenant_id = p_tenant AND c.status <> 'superseded' ORDER BY c.declared_at DESC LIMIT 1;
  RETURN jsonb_build_object('tenant_id', p_tenant, 'contracted', lic.licence_id IS NOT NULL, 'state', v_state,
                            'licence', CASE WHEN lic.licence_id IS NULL THEN NULL ELSE v_hist -> 0 END,
                            'history', v_hist, 'matrix', v_matrix, 'contract', v_contract, 'stays_available', commercial.cen_stays_available(),
                            'grace_rules_declared', to_regprocedure('commercial.grace_rules(uuid)') IS NOT NULL);
END $$;
REVOKE ALL ON FUNCTION commercial.entitlement_summary(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION commercial.entitlement_summary(uuid) TO eye_app, eye_commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §GR — GRACE: grace policies, licence transitions, the lapse tick, grace rules and the offline licence token
-- (built as the part `grace` on its own worktree; folded here in apply order §EN, §GR, §LE, §ME)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- ═════════════════════════════════════════════════════════════════════
-- section `grace` — CP-6 B91 §GR (part `grace`): GRACE, CONTINUITY AND THE OFFLINE LICENCE TOKEN (F-P7-F-01, its fourth and fifth clauses:
-- FEX-30, PR-66-005/006, AT-66 (renewal and suspension recovery, quota and grace scenarios, offline licensing), UX-67-001..006).
--
-- The part file of the combined 0105 (apply order §0, §EN, §GR, §LE, §ME). It USES the prelude's commercial.licences (the versions are §EN's;
-- this section moves only a version's state, grace_until, last_valid and state_changed_at) and commercial.usage_records (read on the surface);
-- it re-declares nothing. Forward only.
--
--   §GR.1 commercial.grace_policies     per tenant, versioned: the grace length, what grace allows (read and preserve — never removable —,
--                                        finish running work, new work) and the renewal notice. A tenant with none has the DEFAULT, stated.
--   §GR.2 commercial.licence_transitions the ledger of a licence version's state changes (and its renewal notices), with reason, actor,
--                                        evidence, the term before and after, the grace and the last valid entitlement. Append-only.
--   §GR.3 commercial.offline_tokens      issued offline licence tokens: the canonical payload text, its digest, the Ed25519 signature and
--                                        the key REFERENCE and id (never the key), the issue and expiry instants, the target profile.
--   §GR.4 the helpers                    the term end (effective_to, extended by renewals), the readability rule, the snapshot, the policy in
--                                        force, the token basis, the actor check, the notice (attention items under the PUBLISHED policy).
--   §GR.5 the reads                      commercial.grace_rules(tenant) — the read §EN's availability gate consults.
--   §GR.6 the ports                      renew, suspend, reinstate (commercial authority, human-gated, reasoned); set_grace_policy;
--                                        issue_offline_token; lapse_licences (the tick step commercial-licence-lapse).
--
-- THE BOUNDARY (ADR-022): a transition makes capabilities unavailable, explained; it never deletes, never edits a version's content
-- (package, capabilities, limits, window, provenance, digest), and grace always allows reading and preserving every existing record.
-- The DISCONNECTED PROFILE itself does not exist yet (P7-D / B106): the token closes the token clause only.

-- ─────────────────────────────────────────────────────────────────────
-- §GR.1 GRACE POLICIES
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE commercial.grace_policies (
  policy_id            uuid NOT NULL UNIQUE,
  tenant_id            uuid NOT NULL REFERENCES tenancy.tenants(id),
  version              int NOT NULL CHECK (version >= 1),
  state                text NOT NULL CHECK (state IN ('active', 'superseded')),
  grace_days           int NOT NULL CHECK (grace_days BETWEEN 1 AND 90),
  -- what grace allows: read_and_preserve is mandatory (a grace that hides or destroys customer work is not a grace)
  allows               text[] NOT NULL CHECK ('read_and_preserve' = ANY (allows) AND allows <@ ARRAY['read_and_preserve', 'finish_running_work', 'new_work']::text[]),
  renewal_notice_days  int NOT NULL CHECK (renewal_notice_days BETWEEN 0 AND 180),
  reason               text NOT NULL CHECK (length(btrim(reason)) BETWEEN 8 AND 2000),
  digest               text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  supersedes           int NULL CHECK (supersedes IS NULL OR supersedes = version - 1),
  set_by               uuid NOT NULL,
  effective_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  superseded_at        timestamptz NULL CHECK ((state = 'superseded') = (superseded_at IS NOT NULL)),
  correlation_id       uuid NOT NULL,
  PRIMARY KEY (tenant_id, version)
);
CREATE UNIQUE INDEX cgr_policy_one_active ON commercial.grace_policies (tenant_id) WHERE state = 'active';
-- a version is immutable; the one move is active → superseded (state and superseded_at only); never deleted
CREATE OR REPLACE FUNCTION commercial.cgr_policy_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'grace policy rejected (state): a grace policy version is never deleted' USING ERRCODE = '2F002'; END IF;
  IF NOT (OLD.state = 'active' AND NEW.state = 'superseded')
     OR (to_jsonb(NEW) - 'state' - 'superseded_at') IS DISTINCT FROM (to_jsonb(OLD) - 'state' - 'superseded_at') THEN
    RAISE EXCEPTION 'grace policy rejected (state): a grace policy version is immutable; it is only superseded' USING ERRCODE = '2F002';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER cgr_policy_guard BEFORE UPDATE OR DELETE ON commercial.grace_policies FOR EACH ROW EXECUTE FUNCTION commercial.cgr_policy_guard();

-- ─────────────────────────────────────────────────────────────────────
-- §GR.2 THE TRANSITIONS LEDGER
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE commercial.licence_transitions (
  transition_id        uuid PRIMARY KEY,
  tenant_id            uuid NOT NULL REFERENCES tenancy.tenants(id),
  licence_id           uuid NOT NULL,
  version              int NOT NULL,
  kind                 text NOT NULL CHECK (kind IN ('grace_entered', 'lapsed', 'suspended', 'reinstated', 'renewed', 'renewal_notice')),
  cause                text NOT NULL CHECK (cause IN ('term_ended', 'grace_ended', 'indeterminate_conflict', 'indeterminate_unreadable', 'commanded', 'renewal_due')),
  from_state           text NOT NULL CHECK (from_state IN ('active', 'grace', 'suspended', 'lapsed')),
  to_state             text NOT NULL CHECK (to_state IN ('active', 'grace', 'suspended', 'lapsed')),
  reason               text NOT NULL CHECK (length(btrim(reason)) BETWEEN 8 AND 2000),
  evidence             jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(evidence) = 'object'),
  term_end_before      timestamptz NULL,
  term_end_after       timestamptz NULL,
  renewed_until        timestamptz NULL CHECK ((kind = 'renewed') = (renewed_until IS NOT NULL)),
  grace_until          timestamptz NULL,
  last_valid           jsonb NULL,
  grace_policy         jsonb NOT NULL CHECK (jsonb_typeof(grace_policy) = 'object'),
  actor_principal_id   uuid NOT NULL,
  actor_kind           text NOT NULL CHECK (actor_kind IN ('human', 'tick')),
  attention_items      uuid[] NOT NULL DEFAULT '{}',
  occurred_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id       uuid NOT NULL,
  FOREIGN KEY (licence_id, version) REFERENCES commercial.licences (licence_id, version),
  CHECK (kind <> 'renewal_notice' OR from_state = to_state),
  CHECK ((actor_kind = 'tick') = (cause IN ('term_ended', 'grace_ended', 'indeterminate_conflict', 'indeterminate_unreadable', 'renewal_due')))
);
CREATE INDEX cgr_transitions_licence ON commercial.licence_transitions (licence_id, version, occurred_at);
CREATE INDEX cgr_transitions_tenant ON commercial.licence_transitions (tenant_id, occurred_at);
-- one renewal notice per version and term end
CREATE UNIQUE INDEX cgr_notice_once ON commercial.licence_transitions (licence_id, version, term_end_after) WHERE kind = 'renewal_notice';
CREATE TRIGGER cgr_transitions_append_only BEFORE UPDATE OR DELETE ON commercial.licence_transitions FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

-- ─────────────────────────────────────────────────────────────────────
-- §GR.3 OFFLINE LICENCE TOKENS
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE commercial.offline_tokens (
  token_id             uuid PRIMARY KEY,
  tenant_id            uuid NOT NULL REFERENCES tenancy.tenants(id),
  licence_id           uuid NOT NULL,
  version              int NOT NULL,
  format               text NOT NULL CHECK (format = 'eye-licence-token/1'),
  -- the DISCONNECTED profile the token is for: it does not exist yet (P7-D / B106) — the token is the software's part only
  profile              text NOT NULL CHECK (profile IN ('disconnected', 'air-gapped')),
  payload_text         text NOT NULL CHECK (length(payload_text) BETWEEN 2 AND 65536),
  payload_digest       text NOT NULL CHECK (payload_digest ~ '^[0-9a-f]{64}$'),
  algorithm            text NOT NULL CHECK (algorithm = 'Ed25519'),
  signature            text NOT NULL CHECK (signature ~ '^[A-Za-z0-9+/]{86}==$'),
  key_ref              text NOT NULL CHECK (key_ref ~ '^EYE_LICENCE_SIGNING_KEY_[A-Z0-9_]{1,64}$'),
  key_id               text NOT NULL CHECK (key_id ~ '^ed25519:[0-9a-f]{16}$'),
  public_key_pem       text NOT NULL CHECK (public_key_pem LIKE '-----BEGIN PUBLIC KEY-----%'),
  issued_at            timestamptz NOT NULL,
  expires_at           timestamptz NOT NULL CHECK (expires_at > issued_at),
  issued_by            uuid NOT NULL,
  reason               text NOT NULL CHECK (length(btrim(reason)) BETWEEN 8 AND 2000),
  correlation_id       uuid NOT NULL,
  FOREIGN KEY (licence_id, version) REFERENCES commercial.licences (licence_id, version)
);
CREATE INDEX cgr_tokens_licence ON commercial.offline_tokens (tenant_id, licence_id, version, issued_at);
CREATE TRIGGER cgr_tokens_append_only BEFORE UPDATE OR DELETE ON commercial.offline_tokens FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

-- row security: the prelude's licence policy (the tenant's own rows; the PLATFORM commercial authority reads every tenant's)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['grace_policies', 'licence_transitions', 'offline_tokens'] LOOP
    EXECUTE format('ALTER TABLE commercial.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE commercial.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$CREATE POLICY commercial_licence_read ON commercial.%I USING (tenant_id = public.eye_tenant() OR public.eye_scope() = 'PLATFORM')$f$, t);
    EXECUTE format('REVOKE ALL ON commercial.%I FROM PUBLIC', t);
    EXECUTE format('GRANT SELECT ON commercial.%I TO eye_app, eye_commit', t);
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- §GR.4 THE HELPERS
-- ─────────────────────────────────────────────────────────────────────
-- An instant as the token and the snapshot write it: UTC, microseconds, 'Z' (one text per instant, so a canonical payload is reproducible).
CREATE OR REPLACE FUNCTION commercial.cgr_instant(p timestamptz) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT CASE WHEN p IS NULL THEN NULL ELSE to_char(p AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') END
$$;
GRANT EXECUTE ON FUNCTION commercial.cgr_instant(timestamptz) TO eye_app, eye_commit;

-- THE TERM END of a licence version: its effective_to, extended by the latest renewal of that version; NULL = no end (perpetual).
CREATE OR REPLACE FUNCTION commercial.licence_term_end(p_licence uuid, p_version int) RETURNS timestamptz
LANGUAGE sql STABLE SET search_path = commercial, pg_catalog, pg_temp AS $$
  SELECT CASE WHEN l.effective_to IS NULL THEN NULL
              ELSE greatest(l.effective_to, (SELECT max(t.renewed_until) FROM commercial.licence_transitions t
                                              WHERE t.licence_id = l.licence_id AND t.version = l.version AND t.kind = 'renewed')) END
    FROM commercial.licences l WHERE l.licence_id = p_licence AND l.version = p_version
$$;
GRANT EXECUTE ON FUNCTION commercial.licence_term_end(uuid, int) TO eye_app, eye_commit;

-- READABILITY (FEX-30's "unreadable licence"): NULL when the version reads as an entitlement, else why not. A version is unreadable when it
-- names no capability, names one outside the key form or twice, or carries no provenance (nobody can say where it came from).
CREATE OR REPLACE FUNCTION commercial.cgr_unreadable(l commercial.licences) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT CASE
    WHEN l.capabilities IS NULL OR cardinality(l.capabilities) = 0 THEN 'the version names no capability'
    WHEN EXISTS (SELECT 1 FROM unnest(l.capabilities) c WHERE c IS NULL OR c !~ '^[a-z][a-z0-9_]{1,40}$') THEN 'the version names a capability outside the key form'
    WHEN (SELECT count(DISTINCT c) FROM unnest(l.capabilities) c) <> cardinality(l.capabilities) THEN 'the version names a capability twice'
    WHEN l.provenance IS NULL OR l.provenance = '{}'::jsonb THEN 'the version carries no provenance'
    ELSE NULL END
$$;
GRANT EXECUTE ON FUNCTION commercial.cgr_unreadable(commercial.licences) TO eye_app, eye_commit;

-- THE SNAPSHOT of a version as the last valid entitlement (FEX-30: last valid entitlement, limits, expiry, affected capability).
CREATE OR REPLACE FUNCTION commercial.cgr_snapshot(l commercial.licences, p_note text) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = commercial, pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object('licence_id', l.licence_id, 'version', l.version, 'package_key', l.package_key,
                            'capabilities', to_jsonb(ARRAY(SELECT c FROM unnest(l.capabilities) c ORDER BY c)), 'limits', l.limits,
                            'effective_from', commercial.cgr_instant(l.effective_from), 'effective_to', commercial.cgr_instant(l.effective_to),
                            'term_end', commercial.cgr_instant(commercial.licence_term_end(l.licence_id, l.version)),
                            'state_at_snapshot', l.state, 'digest', l.digest, 'snapshot_at', commercial.cgr_instant(clock_timestamp()), 'note', p_note)
$$;
REVOKE ALL ON FUNCTION commercial.cgr_snapshot(commercial.licences, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION commercial.cgr_snapshot(commercial.licences, text) TO eye_app, eye_commit;

-- THE GRACE POLICY IN FORCE for a tenant: the active version, or the DEFAULT (14 days; read and preserve, finish running work; no new work;
-- the renewal notice 30 days before the term ends) — stated as the default, never presented as a declaration.
CREATE OR REPLACE FUNCTION commercial.cgr_policy(p_tenant uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = commercial, pg_catalog, pg_temp AS $$
  SELECT coalesce(
    (SELECT jsonb_build_object('source', 'declared', 'policy_id', g.policy_id, 'version', g.version, 'grace_days', g.grace_days,
                               'allows', to_jsonb(g.allows), 'renewal_notice_days', g.renewal_notice_days, 'digest', g.digest,
                               'set_by', g.set_by, 'effective_at', g.effective_at)
       FROM commercial.grace_policies g WHERE g.tenant_id = p_tenant AND g.state = 'active'),
    jsonb_build_object('source', 'default', 'policy_id', NULL, 'version', NULL, 'grace_days', 14,
                       'allows', to_jsonb(ARRAY['read_and_preserve', 'finish_running_work']), 'renewal_notice_days', 30, 'digest', NULL,
                       'set_by', NULL, 'effective_at', NULL))
$$;
GRANT EXECUTE ON FUNCTION commercial.cgr_policy(uuid) TO eye_app, eye_commit;

-- THE TOKEN BASIS: what an offline token states about the licence version (the signed payload's `licence` member) — every instant in the
-- one text form, the capabilities sorted. The issue port re-derives it and requires the payload to carry exactly this.
CREATE OR REPLACE FUNCTION commercial.cgr_token_basis(p_licence uuid, p_version int) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = commercial, pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object('licence_id', l.licence_id, 'version', l.version, 'tenant_id', l.tenant_id, 'package_key', l.package_key,
                            'capabilities', to_jsonb(ARRAY(SELECT c FROM unnest(l.capabilities) c ORDER BY c)), 'limits', l.limits,
                            'effective_from', commercial.cgr_instant(l.effective_from), 'effective_to', commercial.cgr_instant(l.effective_to),
                            'term_end', commercial.cgr_instant(commercial.licence_term_end(l.licence_id, l.version)),
                            'state', l.state, 'grace_until', commercial.cgr_instant(l.grace_until), 'digest', l.digest)
    FROM commercial.licences l WHERE l.licence_id = p_licence AND l.version = p_version
$$;
GRANT EXECUTE ON FUNCTION commercial.cgr_token_basis(uuid, int) TO eye_app, eye_commit;

-- THE ACTING COMMERCIAL AUTHORITY: a PLATFORM context, the acting principal recorded is the bound one, an active human holding
-- commercial_authority at PLATFORM. p_noun is the refusal family's noun.
CREATE OR REPLACE FUNCTION commercial.cgr_assert_commercial(p_actor uuid, p_noun text) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = identity, public, pg_catalog, pg_temp AS $$
BEGIN
  IF public.eye_scope() IS DISTINCT FROM 'PLATFORM' THEN
    RAISE EXCEPTION '% rejected (authority): a licence''s state is the vendor''s commercial authority''s act, in the PLATFORM scope (the context is %)', p_noun, coalesce(public.eye_scope(), 'NONE') USING ERRCODE = '42501';
  END IF;
  IF p_actor IS NULL OR p_actor IS DISTINCT FROM public.eye_principal() THEN
    RAISE EXCEPTION '% rejected (actor): recorded by the acting principal', p_noun USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM identity.role_bindings b JOIN identity.principals p ON p.id = b.principal_id
                  WHERE b.principal_id = p_actor AND p.kind = 'human' AND p.status = 'active' AND b.revoked_at IS NULL
                    AND b.role_code = 'commercial_authority' AND b.scope = 'PLATFORM') THEN
    RAISE EXCEPTION '% rejected (authority): the acting principal is not an active human holding the commercial authority', p_noun USING ERRCODE = '42501';
  END IF;
END $$;
REVOKE ALL ON FUNCTION commercial.cgr_assert_commercial(uuid, text) FROM PUBLIC;

-- THE NOTICE: a commercial.entitlement attention item in EVERY active domain of the tenant (a licence is the tenant's), routed under that
-- domain's PUBLISHED attention policy (0094 §P / 0095's idiom — a class the policy does not name abstains and is deprioritized: seen by nobody,
-- which is why the act routes it); owned by the commercial authority (the acting one, or the version's issuer) when an active human holding
-- it, and routed to the roles the policy names (the tenant administrator). The cause is the transition row. Answers the item ids.
CREATE OR REPLACE FUNCTION commercial.cgr_notify(p_tenant uuid, l commercial.licences, p_transition uuid, p_kind text, p_title text, p_details jsonb,
                                                 p_owner uuid, p_hours numeric, p_actor uuid, p_correlation uuid) RETURNS uuid[]
LANGUAGE plpgsql SET search_path = commercial, executive, identity, pg_catalog, pg_temp AS $$
DECLARE d record; pol executive.attention_policies%ROWTYPE; v_eval jsonb; v_route jsonb; v_state text; v_item uuid; v_items uuid[] := '{}'; v_owner uuid;
BEGIN
  v_owner := CASE WHEN p_owner IS NOT NULL AND EXISTS (SELECT 1 FROM identity.role_bindings b JOIN identity.principals p ON p.id = b.principal_id
                                                        WHERE b.principal_id = p_owner AND p.kind = 'human' AND p.status = 'active' AND b.revoked_at IS NULL
                                                          AND b.role_code = 'commercial_authority' AND b.scope = 'PLATFORM') THEN p_owner END;
  FOR d IN SELECT x.id FROM tenancy.domains x WHERE x.tenant_id = p_tenant AND x.status = 'active' ORDER BY x.created_at, x.id LOOP
    pol := NULL;
    SELECT * INTO pol FROM executive.attention_policies a WHERE a.tenant_id = p_tenant AND a.domain_id = d.id AND a.state = 'active';
    v_eval := executive.evaluate_attention(CASE WHEN pol.policy_id IS NULL THEN NULL ELSE pol.rules END, 'commercial.entitlement',
                                           jsonb_build_object('consequence', 'C2', 'confidence', 1, 'hours_to_window', coalesce(p_hours, 0))) || jsonb_build_object('policy_version', pol.version);
    v_route := executive.attention_route(pol.rules, 'commercial.entitlement', v_eval ->> 'outcome', v_owner, p_tenant, d.id);
    v_state := v_route ->> 'state';
    v_item := gen_random_uuid();
    INSERT INTO executive.attention_items (item_id, scope, tenant_id, domain_id, signal_class, subject_kind, subject_id, cause_event_id, cause_event_type, title, outcome, state,
                                           owner_principal_id, route_roles, policy_id, policy_version, evaluation, details, due_at, escalations, correlation_id)
    VALUES (v_item, 'DOMAIN', p_tenant, d.id, 'commercial.entitlement', 'entitlement', l.licence_id, p_transition, 'LicenceTransition', left(p_title, 512), v_eval ->> 'outcome', v_state,
            v_owner, ARRAY(SELECT jsonb_array_elements_text(v_route -> 'route_roles')), pol.policy_id, pol.version, v_eval,
            jsonb_build_object('licence_id', l.licence_id, 'version', l.version, 'package_key', l.package_key, 'transition_id', p_transition, 'kind', p_kind,
                               'commercial_authority', p_owner, 'by', 'the licence continuity (B91 §GR)') || coalesce(p_details, '{}'::jsonb),
            (v_route ->> 'due_at')::timestamptz, (v_route ->> 'escalations')::int, p_correlation);
    PERFORM executive.attention_event(v_item, p_tenant, d.id,
              CASE v_state WHEN 'open' THEN 'item.routed' WHEN 'escalated' THEN 'item.escalated' WHEN 'unrouted' THEN 'item.unrouted' ELSE 'item.deprioritized' END,
              p_actor, jsonb_build_object('outcome', v_eval ->> 'outcome', 'reasons', v_eval -> 'reasons', 'policy_version', pol.version, 'owner', v_owner, 'route_roles', v_route -> 'route_roles',
                                          'due_at', v_route -> 'due_at', 'cause_event_id', p_transition, 'cause_event_type', 'LicenceTransition', 'unrouted', coalesce((v_route ->> 'unrouted')::boolean, false)), p_correlation);
    v_items := v_items || v_item;
  END LOOP;
  RETURN v_items;
END $$;
REVOKE ALL ON FUNCTION commercial.cgr_notify(uuid, commercial.licences, uuid, text, text, jsonb, uuid, numeric, uuid, uuid) FROM PUBLIC;

-- ONE TRANSITION: the version's state columns moved (state, grace_until, last_valid, state_changed_at — nothing else), the ledger row and
-- the notice. The caller holds the row's lock.
CREATE OR REPLACE FUNCTION commercial.cgr_transition(l commercial.licences, p_transition uuid, p_kind text, p_cause text, p_to text, p_reason text, p_evidence jsonb,
                                                     p_renewed_until timestamptz, p_grace_until timestamptz, p_last_valid jsonb, p_actor uuid, p_actor_kind text,
                                                     p_owner uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SET search_path = commercial, pg_catalog, pg_temp AS $$
DECLARE v_before timestamptz := commercial.licence_term_end(l.licence_id, l.version); v_after timestamptz; v_items uuid[]; v_policy jsonb := commercial.cgr_policy(l.tenant_id);
        v_title text; v_hours numeric; v_at timestamptz := clock_timestamp();
BEGIN
  IF p_kind <> 'renewal_notice' THEN
    UPDATE commercial.licences SET state = p_to, grace_until = p_grace_until, last_valid = p_last_valid, state_changed_at = v_at
     WHERE licence_id = l.licence_id AND version = l.version;
  END IF;
  v_after := CASE WHEN p_kind = 'renewed' THEN p_renewed_until ELSE v_before END;
  v_title := CASE p_kind
    WHEN 'grace_entered' THEN format('Licence in GRACE: %s v%s — %s; grace until %s (the last valid entitlement kept: %s)', l.package_key, l.version,
                                     CASE p_cause WHEN 'term_ended' THEN 'the term ended' ELSE 'the entitlement is indeterminate' END,
                                     to_char(p_grace_until AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI "UTC"'), coalesce(array_to_string(ARRAY(SELECT jsonb_array_elements_text(p_last_valid -> 'capabilities')), ', '), 'none'))
    WHEN 'lapsed' THEN format('Licence LAPSED: %s v%s — the grace ended; licensed capabilities are unavailable, every record stays readable and exportable', l.package_key, l.version)
    WHEN 'suspended' THEN format('Licence SUSPENDED: %s v%s — %s', l.package_key, l.version, left(p_reason, 200))
    WHEN 'reinstated' THEN format('Licence REINSTATED: %s v%s is active again', l.package_key, l.version)
    WHEN 'renewed' THEN format('Licence RENEWED: %s v%s until %s', l.package_key, l.version, to_char(p_renewed_until AT TIME ZONE 'UTC', 'YYYY-MM-DD'))
    ELSE format('Licence renewal due: %s v%s ends %s', l.package_key, l.version, to_char(v_before AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI "UTC"')) END;
  v_hours := CASE WHEN p_kind = 'grace_entered' AND p_grace_until IS NOT NULL THEN greatest(extract(epoch FROM p_grace_until - v_at) / 3600, 0)
                  WHEN p_kind = 'renewal_notice' AND v_before IS NOT NULL THEN greatest(extract(epoch FROM v_before - v_at) / 3600, 0) ELSE 0 END;
  v_items := commercial.cgr_notify(l.tenant_id, l, p_transition, p_kind, v_title,
                                   jsonb_build_object('from_state', l.state, 'to_state', p_to, 'cause', p_cause, 'reason', left(p_reason, 400), 'grace_until', p_grace_until,
                                                      'term_end', v_after, 'last_valid', p_last_valid, 'synthetic', true),
                                   p_owner, v_hours, p_actor, p_correlation);
  INSERT INTO commercial.licence_transitions (transition_id, tenant_id, licence_id, version, kind, cause, from_state, to_state, reason, evidence, term_end_before, term_end_after,
                                              renewed_until, grace_until, last_valid, grace_policy, actor_principal_id, actor_kind, attention_items, occurred_at, correlation_id)
  VALUES (p_transition, l.tenant_id, l.licence_id, l.version, p_kind, p_cause, l.state, p_to, btrim(p_reason), coalesce(p_evidence, '{}'::jsonb), v_before, v_after,
          p_renewed_until, p_grace_until, p_last_valid, v_policy, p_actor, p_actor_kind, v_items, v_at, p_correlation);
  RETURN jsonb_build_object('transition_id', p_transition, 'licence_id', l.licence_id, 'version', l.version, 'kind', p_kind, 'cause', p_cause,
                            'from_state', l.state, 'to_state', p_to, 'term_end_before', v_before, 'term_end_after', v_after, 'grace_until', p_grace_until,
                            'last_valid', p_last_valid, 'attention_items', to_jsonb(v_items), 'occurred_at', v_at);
END $$;
REVOKE ALL ON FUNCTION commercial.cgr_transition(commercial.licences, uuid, text, text, text, text, jsonb, timestamptz, timestamptz, jsonb, uuid, text, uuid, uuid) FROM PUBLIC;

-- THE DETERMINACY of a tenant's entitlement now: NULL when one readable live version stands, else {cause, reason}.
CREATE OR REPLACE FUNCTION commercial.cgr_indeterminacy(p_tenant uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = commercial, pg_catalog, pg_temp AS $$
  WITH live AS (SELECT l.* FROM commercial.licences l WHERE l.tenant_id = p_tenant AND l.state <> 'superseded'),
       newest AS (SELECT * FROM live ORDER BY issued_at DESC, version DESC LIMIT 1)
  SELECT CASE
    WHEN (SELECT count(*) FROM live) > 1 THEN jsonb_build_object('cause', 'indeterminate_conflict',
           'reason', format('%s live licence versions conflict (%s) — the commercial authority supersedes the stray one', (SELECT count(*) FROM live),
                            (SELECT string_agg(format('%s v%s', x.licence_id, x.version), ', ' ORDER BY x.issued_at, x.version) FROM live x)))
    WHEN (SELECT commercial.cgr_unreadable(n) FROM newest n) IS NOT NULL THEN jsonb_build_object('cause', 'indeterminate_unreadable',
           'reason', format('licence %s v%s is unreadable: %s', (SELECT n.licence_id FROM newest n), (SELECT n.version FROM newest n), (SELECT commercial.cgr_unreadable(n) FROM newest n)))
    ELSE NULL END
$$;
GRANT EXECUTE ON FUNCTION commercial.cgr_indeterminacy(uuid) TO eye_app, eye_commit;

-- ─────────────────────────────────────────────────────────────────────
-- §GR.5 THE READ §EN's GATE CONSULTS: commercial.grace_rules(tenant)
-- ─────────────────────────────────────────────────────────────────────
/* What the tenant's entitlement is NOW and what each state allows. A guarded definer: the PLATFORM scope, or a TENANT/DOMAIN context bound to
   this tenant (N-01's read_scope_ok on the bound domain), or a session whose own login bypasses RLS. Answers:
     contracted        false → the tenant has NO licence row: UNCONTRACTED, the gate does not apply (the prelude's rule);
     state             uncontracted | active | grace | suspended | lapsed (the newest live version's recorded state);
     determinate       false when live versions conflict or the newest is unreadable (the tick moves it to grace; until then it is reported);
     licence           the newest live version (with its term end) and, in grace or suspension, the LAST VALID entitlement;
     policy            the grace policy in force (declared, or the DEFAULT, stated);
     rules             read_and_preserve ALWAYS true (every state; never removable); in grace: the capabilities of the last valid entitlement,
                       whether running work may finish (and the actions that finish it), whether new work may start; suspended/lapsed:
                       nothing licensed is available beyond read and preserve; mandatory_controls: what stays available in every state. */
CREATE OR REPLACE FUNCTION commercial.grace_rules(p_tenant uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = commercial, observation, public, pg_catalog, pg_temp AS $$
DECLARE l commercial.licences%ROWTYPE; v_policy jsonb; v_ind jsonb; v_allows text[]; v_caps jsonb; v_state text; v_term timestamptz; v_expl text;
        v_mandatory jsonb := jsonb_build_array('audit: the audit read and verification', 'warnings and their acknowledgement', 'corrections and withdrawals',
                                               'export and the customer''s own records (retention)', 'provenance of every record', 'identity and sign-in',
                                               'reading every existing record (customer work preserved; nothing is deleted)');
        v_finish jsonb := jsonb_build_array('simulation.experiment.execute', 'simulation.experiment.pause', 'simulation.experiment.cancel', 'simulation.run.complete');
BEGIN
  IF NOT (public.eye_scope() = 'PLATFORM' OR observation.read_scope_ok(p_tenant, public.eye_domain())) THEN
    RAISE EXCEPTION 'read rejected (scope): the grace rules of tenant % are read only within that tenant or by the commercial authority (bound: %/%)', p_tenant,
      coalesce(public.eye_scope(), 'NONE'), coalesce(public.eye_tenant()::text, '-') USING ERRCODE = '42501';
  END IF;
  v_policy := commercial.cgr_policy(p_tenant);
  SELECT * INTO l FROM commercial.licences x WHERE x.tenant_id = p_tenant AND x.state <> 'superseded' ORDER BY x.issued_at DESC, x.version DESC LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('tenant_id', p_tenant, 'contracted', false, 'state', 'uncontracted', 'determinate', true, 'indeterminate', NULL, 'licence', NULL, 'last_valid', NULL,
      'policy', v_policy, 'rules', jsonb_build_object('read_and_preserve', true, 'gate_applies', false, 'mandatory_controls', v_mandatory),
      'explanation', 'UNCONTRACTED: this tenant holds no licence; the availability gate does not apply to it.', 'as_of', clock_timestamp());
  END IF;
  v_ind := commercial.cgr_indeterminacy(p_tenant);
  v_state := l.state;
  v_term := commercial.licence_term_end(l.licence_id, l.version);
  SELECT coalesce(array_agg(a), '{}') INTO v_allows FROM jsonb_array_elements_text(v_policy -> 'allows') a;
  v_caps := CASE WHEN v_state = 'active' THEN to_jsonb(ARRAY(SELECT c FROM unnest(l.capabilities) c ORDER BY c))
                 WHEN v_state = 'grace' THEN coalesce(l.last_valid -> 'capabilities', '[]'::jsonb)
                 ELSE '[]'::jsonb END;
  v_expl := CASE v_state
    WHEN 'active' THEN format('ACTIVE: licence %s v%s (%s)%s.', l.package_key, l.version, array_to_string(l.capabilities, ', '),
                              CASE WHEN v_term IS NULL THEN ', no term end' ELSE ' until ' || to_char(v_term AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI "UTC"') END)
    WHEN 'grace' THEN format('GRACE until %s: the last valid entitlement (%s) stays available as the grace policy allows — %s; every record stays readable and exportable.',
                             to_char(l.grace_until AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI "UTC"'), coalesce(array_to_string(ARRAY(SELECT jsonb_array_elements_text(v_caps)), ', '), 'none'),
                             CASE WHEN 'new_work' = ANY (v_allows) THEN 'new work may start' WHEN 'finish_running_work' = ANY (v_allows) THEN 'running work may finish, no new work starts' ELSE 'no work runs' END)
    WHEN 'suspended' THEN format('SUSPENDED: licence %s v%s is suspended by the commercial authority; licensed capabilities are unavailable — every record stays readable and exportable.', l.package_key, l.version)
    ELSE format('LAPSED: licence %s v%s lapsed%s; licensed capabilities are unavailable — every record stays readable and exportable; a renewal restores it.', l.package_key, l.version,
                CASE WHEN l.grace_until IS NULL THEN '' ELSE ' (grace ended ' || to_char(l.grace_until AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI "UTC"') || ')' END) END
    || CASE WHEN v_ind IS NULL THEN '' ELSE ' INDETERMINATE: ' || (v_ind ->> 'reason') || '.' END;
  RETURN jsonb_build_object('tenant_id', p_tenant, 'contracted', true, 'state', v_state, 'determinate', v_ind IS NULL, 'indeterminate', v_ind,
    'licence', jsonb_build_object('licence_id', l.licence_id, 'version', l.version, 'package_key', l.package_key, 'capabilities', to_jsonb(ARRAY(SELECT c FROM unnest(l.capabilities) c ORDER BY c)),
                                  'limits', l.limits, 'effective_from', l.effective_from, 'effective_to', l.effective_to, 'term_end', v_term, 'grace_until', l.grace_until,
                                  'state_changed_at', l.state_changed_at, 'digest', l.digest),
    'last_valid', l.last_valid, 'policy', v_policy,
    'rules', jsonb_build_object('read_and_preserve', true, 'gate_applies', true,
                                'capabilities', v_caps,
                                'finish_running_work', v_state = 'active' OR (v_state = 'grace' AND ('finish_running_work' = ANY (v_allows) OR 'new_work' = ANY (v_allows))),
                                'finish_running_actions', v_finish,
                                'new_work', v_state = 'active' OR (v_state = 'grace' AND 'new_work' = ANY (v_allows)),
                                'mandatory_controls', v_mandatory),
    'explanation', v_expl, 'as_of', clock_timestamp());
END $$;
REVOKE ALL ON FUNCTION commercial.grace_rules(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION commercial.grace_rules(uuid) TO eye_app, eye_commit;

-- ─────────────────────────────────────────────────────────────────────
-- §GR.6 THE PORTS
-- ─────────────────────────────────────────────────────────────────────
-- The version a commanded transition acts on, locked: it exists (unknown_licence), it is the licence's newest version (stale), it is live.
CREATE OR REPLACE FUNCTION commercial.cgr_lock_version(p_licence uuid, p_version int, p_noun text) RETURNS commercial.licences
LANGUAGE plpgsql SET search_path = commercial, pg_catalog, pg_temp AS $$
DECLARE l commercial.licences%ROWTYPE;
BEGIN
  SELECT * INTO l FROM commercial.licences x WHERE x.licence_id = p_licence AND x.version = p_version FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '% rejected (unknown_licence): licence % has no version %', p_noun, p_licence, p_version USING ERRCODE = '23503'; END IF;
  IF l.state = 'superseded' OR EXISTS (SELECT 1 FROM commercial.licences y WHERE y.licence_id = p_licence AND y.version > p_version) THEN
    RAISE EXCEPTION '% rejected (stale): licence % v% is superseded — act on its newest version', p_noun, p_licence, p_version USING ERRCODE = '2F002';
  END IF;
  RETURN l;
END $$;
REVOKE ALL ON FUNCTION commercial.cgr_lock_version(uuid, int, text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION commercial.cgr_check_reason(p_reason text, p_evidence jsonb, p_noun text) RETURNS void
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 OR length(p_reason) > 2000 THEN
    RAISE EXCEPTION '% rejected (reason): a transition says why (8 to 2000 characters)', p_noun USING ERRCODE = '22023';
  END IF;
  IF p_evidence IS NOT NULL AND jsonb_typeof(p_evidence) <> 'object' THEN
    RAISE EXCEPTION '% rejected (evidence): the evidence is an object (an order or ticket reference, a contract clause)', p_noun USING ERRCODE = '22023';
  END IF;
END $$;

/* RENEW (commercial.licence.renew; the commercial authority, human-gated): the newest version's term extended to p_renewed_until (later than
   now and than its current term end; at most five years ahead) and its state ACTIVE again — from active (an early renewal), grace or
   lapsed (the recovery). A suspended licence is reinstated first (state); an indeterminate entitlement is resolved first (indeterminate). */
CREATE OR REPLACE FUNCTION commercial.renew_licence(p_transition_id uuid, p_licence uuid, p_version int, p_renewed_until timestamptz, p_reason text, p_evidence jsonb,
                                                   p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = commercial, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE l commercial.licences%ROWTYPE; v_term timestamptz; v_ind jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['commercial.licence.renew']);
  PERFORM commercial.cgr_assert_commercial(p_actor, 'licence transition');
  PERFORM commercial.cgr_check_reason(p_reason, p_evidence, 'licence transition');
  l := commercial.cgr_lock_version(p_licence, p_version, 'licence transition');
  IF l.state = 'suspended' THEN
    RAISE EXCEPTION 'licence transition rejected (state): licence % v% is suspended — the commercial authority reinstates it before a renewal', p_licence, p_version USING ERRCODE = '2F002';
  END IF;
  v_ind := commercial.cgr_indeterminacy(l.tenant_id);
  IF v_ind IS NOT NULL THEN
    RAISE EXCEPTION 'licence transition rejected (indeterminate): %', v_ind ->> 'reason' USING ERRCODE = '2F002';
  END IF;
  IF l.effective_to IS NULL THEN
    RAISE EXCEPTION 'licence transition rejected (term): licence % v% has no term end — there is nothing to renew', p_licence, p_version USING ERRCODE = '22023';
  END IF;
  v_term := commercial.licence_term_end(p_licence, p_version);
  IF p_renewed_until IS NULL OR p_renewed_until <= clock_timestamp() OR p_renewed_until <= v_term OR p_renewed_until > clock_timestamp() + interval '5 years' THEN
    RAISE EXCEPTION 'licence transition rejected (term): a renewal runs to an instant later than now and than the current term end (%), at most five years ahead', commercial.cgr_instant(v_term) USING ERRCODE = '22023';
  END IF;
  RETURN commercial.cgr_transition(l, p_transition_id, 'renewed', 'commanded', 'active', p_reason, p_evidence, p_renewed_until, NULL, NULL, p_actor, 'human', p_actor, p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION commercial.renew_licence(uuid, uuid, int, timestamptz, text, jsonb, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION commercial.renew_licence(uuid, uuid, int, timestamptz, text, jsonb, uuid, uuid) TO eye_commit;

/* SUSPEND (commercial.licence.suspend; human-gated, reasoned): an active or grace version → SUSPENDED; the last valid entitlement kept
   (snapshotted when none is held), its grace_until kept as it stood. Nothing is deleted; every record stays readable. */
CREATE OR REPLACE FUNCTION commercial.suspend_licence(p_transition_id uuid, p_licence uuid, p_version int, p_reason text, p_evidence jsonb, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = commercial, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE l commercial.licences%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['commercial.licence.suspend']);
  PERFORM commercial.cgr_assert_commercial(p_actor, 'licence transition');
  PERFORM commercial.cgr_check_reason(p_reason, p_evidence, 'licence transition');
  l := commercial.cgr_lock_version(p_licence, p_version, 'licence transition');
  IF l.state NOT IN ('active', 'grace') THEN
    RAISE EXCEPTION 'licence transition rejected (state): licence % v% is % — only an active or grace licence is suspended', p_licence, p_version, l.state USING ERRCODE = '2F002';
  END IF;
  RETURN commercial.cgr_transition(l, p_transition_id, 'suspended', 'commanded', 'suspended', p_reason, p_evidence, NULL, l.grace_until,
                                   coalesce(l.last_valid, commercial.cgr_snapshot(l, 'the entitlement in force when it was suspended')), p_actor, 'human', p_actor, p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION commercial.suspend_licence(uuid, uuid, int, text, jsonb, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION commercial.suspend_licence(uuid, uuid, int, text, jsonb, uuid, uuid) TO eye_commit;

/* REINSTATE (commercial.licence.reinstate; human-gated, reasoned): a suspended version, or one held in grace because the entitlement was
   indeterminate, → ACTIVE — when its term still runs (else: renew) and the entitlement is determinate now (else: resolve it first). */
CREATE OR REPLACE FUNCTION commercial.reinstate_licence(p_transition_id uuid, p_licence uuid, p_version int, p_reason text, p_evidence jsonb, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = commercial, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE l commercial.licences%ROWTYPE; v_term timestamptz; v_ind jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['commercial.licence.reinstate']);
  PERFORM commercial.cgr_assert_commercial(p_actor, 'licence transition');
  PERFORM commercial.cgr_check_reason(p_reason, p_evidence, 'licence transition');
  l := commercial.cgr_lock_version(p_licence, p_version, 'licence transition');
  IF l.state NOT IN ('suspended', 'grace') THEN
    RAISE EXCEPTION 'licence transition rejected (state): licence % v% is % — only a suspended or grace licence is reinstated (a lapsed one is renewed)', p_licence, p_version, l.state USING ERRCODE = '2F002';
  END IF;
  v_term := commercial.licence_term_end(p_licence, p_version);
  IF v_term IS NOT NULL AND v_term <= clock_timestamp() THEN
    RAISE EXCEPTION 'licence transition rejected (state): the term of licence % v% ended % — a renewal restores it, not a reinstatement', p_licence, p_version, v_term USING ERRCODE = '2F002';
  END IF;
  v_ind := commercial.cgr_indeterminacy(l.tenant_id);
  IF v_ind IS NOT NULL THEN
    RAISE EXCEPTION 'licence transition rejected (indeterminate): %', v_ind ->> 'reason' USING ERRCODE = '2F002';
  END IF;
  RETURN commercial.cgr_transition(l, p_transition_id, 'reinstated', 'commanded', 'active', p_reason, p_evidence, NULL, NULL, NULL, p_actor, 'human', p_actor, p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION commercial.reinstate_licence(uuid, uuid, int, text, jsonb, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION commercial.reinstate_licence(uuid, uuid, int, text, jsonb, uuid, uuid) TO eye_commit;

/* SET THE GRACE POLICY (commercial.grace.set; the commercial authority, human-gated): version expected_version + 1 of the tenant's policy,
   the prior superseded. read_and_preserve cannot be removed (boundary). A grace already entered keeps the grace_until it was given. */
CREATE OR REPLACE FUNCTION commercial.set_grace_policy(p_policy_id uuid, p_tenant uuid, p_expected_version int, p_grace_days int, p_allows text[], p_renewal_notice_days int,
                                                       p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = commercial, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_current int; v_allows text[]; v_digest text; v_at timestamptz := clock_timestamp();
BEGIN
  PERFORM observation.assert_authority(ARRAY['commercial.grace.set']);
  PERFORM commercial.cgr_assert_commercial(p_actor, 'grace policy');
  IF NOT EXISTS (SELECT 1 FROM tenancy.tenants t WHERE t.id = p_tenant) THEN
    RAISE EXCEPTION 'grace policy rejected (unknown_tenant): no tenant %', p_tenant USING ERRCODE = '23503';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 OR length(p_reason) > 2000 THEN
    RAISE EXCEPTION 'grace policy rejected (reason): a grace policy says why (8 to 2000 characters)' USING ERRCODE = '22023';
  END IF;
  IF p_allows IS NULL OR NOT ('read_and_preserve' = ANY (p_allows)) THEN
    RAISE EXCEPTION 'grace policy rejected (boundary): read and preserve cannot be removed — a grace that hides or destroys customer work is not a grace (ADR-022)' USING ERRCODE = '22023';
  END IF;
  IF NOT (p_allows <@ ARRAY['read_and_preserve', 'finish_running_work', 'new_work']::text[]) THEN
    RAISE EXCEPTION 'grace policy rejected (allows): grace allows read_and_preserve, finish_running_work and new_work only' USING ERRCODE = '22023';
  END IF;
  IF p_grace_days IS NULL OR p_grace_days NOT BETWEEN 1 AND 90 THEN
    RAISE EXCEPTION 'grace policy rejected (grace_days): a grace lasts 1 to 90 days' USING ERRCODE = '22023';
  END IF;
  IF p_renewal_notice_days IS NULL OR p_renewal_notice_days NOT BETWEEN 0 AND 180 THEN
    RAISE EXCEPTION 'grace policy rejected (notice): the renewal notice is 0 to 180 days before the term ends' USING ERRCODE = '22023';
  END IF;
  SELECT g.version INTO v_current FROM commercial.grace_policies g WHERE g.tenant_id = p_tenant AND g.state = 'active' FOR UPDATE;
  IF coalesce(v_current, 0) IS DISTINCT FROM coalesce(p_expected_version, -1) THEN
    RAISE EXCEPTION 'grace policy rejected (stale): the tenant''s grace policy is at version % — name it as the expected version', coalesce(v_current, 0) USING ERRCODE = '2F002';
  END IF;
  v_allows := ARRAY(SELECT DISTINCT a FROM unnest(p_allows) a ORDER BY a);
  v_digest := encode(sha256(convert_to(jsonb_build_object('tenant_id', p_tenant, 'version', coalesce(v_current, 0) + 1, 'grace_days', p_grace_days, 'allows', to_jsonb(v_allows),
                                                          'renewal_notice_days', p_renewal_notice_days)::text, 'UTF8')), 'hex');
  IF v_current IS NOT NULL THEN
    UPDATE commercial.grace_policies SET state = 'superseded', superseded_at = v_at WHERE tenant_id = p_tenant AND version = v_current;
  END IF;
  INSERT INTO commercial.grace_policies (policy_id, tenant_id, version, state, grace_days, allows, renewal_notice_days, reason, digest, supersedes, set_by, effective_at, correlation_id)
  VALUES (p_policy_id, p_tenant, coalesce(v_current, 0) + 1, 'active', p_grace_days, v_allows, p_renewal_notice_days, btrim(p_reason), v_digest, v_current, p_actor, v_at, p_correlation);
  RETURN jsonb_build_object('policy_id', p_policy_id, 'tenant_id', p_tenant, 'version', coalesce(v_current, 0) + 1, 'supersedes', v_current, 'grace_days', p_grace_days,
                            'allows', to_jsonb(v_allows), 'renewal_notice_days', p_renewal_notice_days, 'digest', v_digest, 'effective_at', v_at);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION commercial.set_grace_policy(uuid, uuid, int, int, text[], int, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION commercial.set_grace_policy(uuid, uuid, int, int, text[], int, text, uuid, uuid) TO eye_commit;

/* ISSUE AN OFFLINE TOKEN (commercial.offline_token.issue; human-gated): the service canonicalises the payload (JCS) and signs its digest with
   the Ed25519 key its env REFERENCE names; this port binds the record: sha256(payload text) = the digest; the payload is the token
   (format, token id, tenant, profile, issued_at within five minutes of now, expires_at = the stated expiry) over EXACTLY the version's basis
   (commercial.cgr_token_basis); the version is the licence's newest and active or in grace (a suspended or lapsed licence gets no token);
   the expiry is at least an hour ahead and no later than the term end (in grace: the grace end), and at most 400 days ahead. The signature
   cannot be checked in SQL (Ed25519): its form is; the service verifies it against the derived public key before calling. */
CREATE OR REPLACE FUNCTION commercial.issue_offline_token(p_token_id uuid, p_licence uuid, p_version int, p_profile text, p_payload_text text, p_payload_digest text,
                                                         p_signature text, p_key_ref text, p_key_id text, p_public_key_pem text, p_expires_at timestamptz, p_reason text,
                                                         p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = commercial, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE l commercial.licences%ROWTYPE; v_payload jsonb; v_term timestamptz; v_ceiling timestamptz; v_issued timestamptz; v_now timestamptz := clock_timestamp();
BEGIN
  PERFORM observation.assert_authority(ARRAY['commercial.offline_token.issue']);
  PERFORM commercial.cgr_assert_commercial(p_actor, 'offline token');
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 OR length(p_reason) > 2000 THEN
    RAISE EXCEPTION 'offline token rejected (reason): a token issue says why (8 to 2000 characters)' USING ERRCODE = '22023';
  END IF;
  IF p_profile IS NULL OR p_profile NOT IN ('disconnected', 'air-gapped') THEN
    RAISE EXCEPTION 'offline token rejected (profile): a token is for the disconnected or air-gapped profile' USING ERRCODE = '22023';
  END IF;
  l := commercial.cgr_lock_version(p_licence, p_version, 'offline token');
  IF l.state NOT IN ('active', 'grace') THEN
    RAISE EXCEPTION 'offline token rejected (state): licence % v% is % — a token states an entitlement that holds (active or grace)', p_licence, p_version, l.state USING ERRCODE = '2F002';
  END IF;
  IF EXISTS (SELECT 1 FROM commercial.offline_tokens t WHERE t.token_id = p_token_id) THEN
    RAISE EXCEPTION 'offline token rejected (duplicate): token % is already issued', p_token_id USING ERRCODE = '23505';
  END IF;
  IF p_payload_digest IS NULL OR p_payload_text IS NULL OR encode(sha256(convert_to(p_payload_text, 'UTF8')), 'hex') IS DISTINCT FROM p_payload_digest THEN
    RAISE EXCEPTION 'offline token rejected (digest): the digest is not sha256 of the payload text' USING ERRCODE = '22023';
  END IF;
  BEGIN v_payload := p_payload_text::jsonb;
  EXCEPTION WHEN others THEN RAISE EXCEPTION 'offline token rejected (payload): the payload text is not JSON' USING ERRCODE = '22023'; END;
  IF jsonb_typeof(v_payload) <> 'object' OR v_payload ->> 'format' IS DISTINCT FROM 'eye-licence-token/1' OR v_payload ->> 'token_id' IS DISTINCT FROM p_token_id::text
     OR v_payload ->> 'tenant_id' IS DISTINCT FROM l.tenant_id::text OR v_payload ->> 'profile' IS DISTINCT FROM p_profile
     OR (v_payload -> 'licence') IS DISTINCT FROM commercial.cgr_token_basis(p_licence, p_version)
     OR v_payload ->> 'expires_at' IS DISTINCT FROM commercial.cgr_instant(p_expires_at)
     OR v_payload -> 'issuer' IS DISTINCT FROM jsonb_build_object('principal_id', p_actor, 'key_id', p_key_id)
     OR (SELECT count(*) FROM jsonb_object_keys(v_payload)) <> 8 THEN
    RAISE EXCEPTION 'offline token rejected (payload): the payload is not the token of licence % v% as it stands (format, token, tenant, profile, issuer, expiry and the version''s basis)', p_licence, p_version USING ERRCODE = '22023';
  END IF;
  BEGIN v_issued := (v_payload ->> 'issued_at')::timestamptz;
  EXCEPTION WHEN others THEN v_issued := NULL; END;
  IF v_issued IS NULL OR v_issued > v_now + interval '1 minute' OR v_issued < v_now - interval '5 minutes' THEN
    RAISE EXCEPTION 'offline token rejected (payload): issued_at is not this instant (within five minutes before now)' USING ERRCODE = '22023';
  END IF;
  IF p_key_ref IS NULL OR p_key_ref !~ '^EYE_LICENCE_SIGNING_KEY_[A-Z0-9_]{1,64}$' OR p_key_id IS NULL OR p_key_id !~ '^ed25519:[0-9a-f]{16}$'
     OR p_public_key_pem IS NULL OR p_public_key_pem NOT LIKE '-----BEGIN PUBLIC KEY-----%' THEN
    RAISE EXCEPTION 'offline token rejected (key): the key is named by its reference (EYE_LICENCE_SIGNING_KEY_<NAME>), its id and its public key' USING ERRCODE = '22023';
  END IF;
  IF p_signature IS NULL OR p_signature !~ '^[A-Za-z0-9+/]{86}==$' THEN
    RAISE EXCEPTION 'offline token rejected (signature): an Ed25519 signature is 64 bytes in base64' USING ERRCODE = '22023';
  END IF;
  v_term := commercial.licence_term_end(p_licence, p_version);
  v_ceiling := least(v_now + interval '400 days', CASE WHEN l.state = 'grace' THEN l.grace_until ELSE v_term END);
  IF p_expires_at IS NULL OR p_expires_at < v_now + interval '1 hour' OR p_expires_at > v_ceiling THEN
    RAISE EXCEPTION 'offline token rejected (expiry): a token expires at least an hour ahead and no later than % (the %, at most 400 days ahead)', v_ceiling,
      CASE WHEN l.state = 'grace' THEN 'grace end' ELSE 'term end' END USING ERRCODE = '22023';
  END IF;
  INSERT INTO commercial.offline_tokens (token_id, tenant_id, licence_id, version, format, profile, payload_text, payload_digest, algorithm, signature, key_ref, key_id,
                                         public_key_pem, issued_at, expires_at, issued_by, reason, correlation_id)
  VALUES (p_token_id, l.tenant_id, p_licence, p_version, 'eye-licence-token/1', p_profile, p_payload_text, p_payload_digest, 'Ed25519', p_signature, p_key_ref, p_key_id,
          p_public_key_pem, v_issued, p_expires_at, p_actor, btrim(p_reason), p_correlation);
  RETURN jsonb_build_object('token_id', p_token_id, 'tenant_id', l.tenant_id, 'licence_id', p_licence, 'version', p_version, 'profile', p_profile, 'payload_digest', p_payload_digest,
                            'key_id', p_key_id, 'issued_at', v_issued, 'expires_at', p_expires_at, 'state', l.state);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION commercial.issue_offline_token(uuid, uuid, int, text, text, text, text, text, text, text, timestamptz, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION commercial.issue_offline_token(uuid, uuid, int, text, text, text, text, text, text, text, timestamptz, text, uuid, uuid) TO eye_commit;

/* THE TICK STEP commercial-licence-lapse (under executive.attention.tick, in the tick's own write): the tenant's live versions, locked.
   No licence → nothing (UNCONTRACTED: default-off). Per version, in this order:
     · a grace whose end has passed → LAPSED (grace_ended);
     · live versions that CONFLICT → each active one enters GRACE (indeterminate_conflict) with the last valid entitlement = the oldest
       readable of them (the one in force when another appeared beside it), the grace from now;
     · the newest live version UNREADABLE → GRACE (indeterminate_unreadable) with the last valid = the newest readable earlier version of the
       same licence (else of another licence of the tenant);
     · an active version past its term end → GRACE (term_ended; grace_until = the term end + the policy's days; the last valid = itself),
       and LAPSED at once when that grace has also passed;
     · an active version within the policy's renewal notice → one renewal notice per term end.
   Each move: the ledger row and the commercial.entitlement notice in every active domain of the tenant. The tick LIFTS nothing: a reinstatement
   and a renewal are the commercial authority's. */
CREATE OR REPLACE FUNCTION commercial.lapse_licences(p_tenant uuid, p_domain uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = commercial, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE live commercial.licences[]; l commercial.licences; v_now timestamptz := clock_timestamp(); v_out jsonb := '[]'::jsonb; v_policy jsonb; v_days int; v_notice int;
        v_last jsonb; v_term timestamptz; v_grace timestamptz; v_r jsonb; v_owner uuid; n int; v_newest commercial.licences; v_bad text; v_prev commercial.licences;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.attention.tick']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN
    RAISE EXCEPTION 'licence transition rejected (actor): recorded by the acting principal (the attention agent)' USING ERRCODE = '42501';
  END IF;
  PERFORM 1 FROM commercial.licences y WHERE y.tenant_id = p_tenant AND y.state <> 'superseded' ORDER BY y.issued_at, y.version FOR UPDATE;
  SELECT coalesce(array_agg(x ORDER BY x.issued_at, x.version), '{}') INTO live FROM commercial.licences x WHERE x.tenant_id = p_tenant AND x.state <> 'superseded';
  n := cardinality(live);
  IF n = 0 THEN RETURN jsonb_build_object('contracted', false, 'transitions', '[]'::jsonb); END IF;
  v_policy := commercial.cgr_policy(p_tenant);
  v_days := (v_policy ->> 'grace_days')::int; v_notice := (v_policy ->> 'renewal_notice_days')::int;
  -- 1. graces that have ended
  FOREACH l IN ARRAY live LOOP
    IF l.state = 'grace' AND l.grace_until IS NOT NULL AND l.grace_until <= v_now THEN
      v_r := commercial.cgr_transition(l, gen_random_uuid(), 'lapsed', 'grace_ended', 'lapsed', format('the grace ended %s; no renewal was recorded', commercial.cgr_instant(l.grace_until)),
                                       '{}'::jsonb, NULL, l.grace_until, l.last_valid, p_actor, 'tick', l.issued_by, p_correlation);
      v_out := v_out || v_r;
    END IF;
  END LOOP;
  -- re-read after the lapses (the state moved)
  SELECT coalesce(array_agg(x ORDER BY x.issued_at, x.version), '{}') INTO live FROM commercial.licences x WHERE x.tenant_id = p_tenant AND x.state <> 'superseded';
  v_newest := live[n];
  IF n > 1 THEN
    -- 2. CONFLICT: the last valid = the oldest readable live version
    SELECT x.* INTO v_prev FROM unnest(live) x WHERE commercial.cgr_unreadable(x) IS NULL ORDER BY x.issued_at, x.version LIMIT 1;
    v_last := CASE WHEN v_prev.licence_id IS NULL THEN jsonb_build_object('none', true, 'note', 'no live version reads as an entitlement')
                   ELSE commercial.cgr_snapshot(v_prev, 'the last valid entitlement: the oldest readable of the conflicting live versions') END;
    FOREACH l IN ARRAY live LOOP
      IF l.state = 'active' THEN
        v_r := commercial.cgr_transition(l, gen_random_uuid(), 'grace_entered', 'indeterminate_conflict', 'grace',
                 format('the entitlement is indeterminate: %s live versions conflict', n), jsonb_build_object('live', (SELECT jsonb_agg(jsonb_build_object('licence_id', x.licence_id, 'version', x.version)) FROM unnest(live) x)),
                 NULL, v_now + make_interval(days => v_days), v_last, p_actor, 'tick', l.issued_by, p_correlation);
        v_out := v_out || v_r;
      END IF;
    END LOOP;
    RETURN jsonb_build_object('contracted', true, 'live', n, 'transitions', v_out);
  END IF;
  l := v_newest;
  v_bad := commercial.cgr_unreadable(l);
  IF l.state = 'active' AND v_bad IS NOT NULL THEN
    -- 3. UNREADABLE: the last valid = the newest readable earlier version of the SAME licence (superseded or not), else of another of the tenant's
    SELECT x.* INTO v_prev FROM commercial.licences x WHERE x.tenant_id = p_tenant AND NOT (x.licence_id = l.licence_id AND x.version = l.version)
      AND commercial.cgr_unreadable(x) IS NULL AND x.issued_at <= l.issued_at ORDER BY (x.licence_id = l.licence_id) DESC, x.issued_at DESC, x.version DESC LIMIT 1;
    v_last := CASE WHEN v_prev.licence_id IS NULL THEN jsonb_build_object('none', true, 'note', 'no earlier version reads as an entitlement')
                   ELSE commercial.cgr_snapshot(v_prev, 'the last valid entitlement: the newest readable earlier version') END;
    v_r := commercial.cgr_transition(l, gen_random_uuid(), 'grace_entered', 'indeterminate_unreadable', 'grace', format('the entitlement is indeterminate: %s', v_bad),
                                     jsonb_build_object('unreadable', v_bad), NULL, v_now + make_interval(days => v_days), v_last, p_actor, 'tick', l.issued_by, p_correlation);
    RETURN jsonb_build_object('contracted', true, 'live', 1, 'transitions', v_out || v_r);
  END IF;
  v_term := commercial.licence_term_end(l.licence_id, l.version);
  IF l.state = 'active' AND v_term IS NOT NULL AND v_term <= v_now THEN
    -- 4. THE TERM ENDED → grace from the term end; lapsed at once when that grace has passed too
    v_grace := v_term + make_interval(days => v_days);
    v_r := commercial.cgr_transition(l, gen_random_uuid(), 'grace_entered', 'term_ended', 'grace', format('the term ended %s; the declared grace runs %s days', commercial.cgr_instant(v_term), v_days),
                                     '{}'::jsonb, NULL, v_grace, commercial.cgr_snapshot(l, 'the last valid entitlement: the version whose term ended'), p_actor, 'tick', l.issued_by, p_correlation);
    v_out := v_out || v_r;
    IF v_grace <= v_now THEN
      SELECT * INTO l FROM commercial.licences x WHERE x.licence_id = l.licence_id AND x.version = l.version;
      v_r := commercial.cgr_transition(l, gen_random_uuid(), 'lapsed', 'grace_ended', 'lapsed', format('the grace ended %s; no renewal was recorded', commercial.cgr_instant(v_grace)),
                                       '{}'::jsonb, NULL, v_grace, l.last_valid, p_actor, 'tick', l.issued_by, p_correlation);
      v_out := v_out || v_r;
    END IF;
  ELSIF l.state = 'active' AND v_term IS NOT NULL AND v_notice > 0 AND v_term - make_interval(days => v_notice) <= v_now
        AND NOT EXISTS (SELECT 1 FROM commercial.licence_transitions t WHERE t.licence_id = l.licence_id AND t.version = l.version AND t.kind = 'renewal_notice' AND t.term_end_after = v_term) THEN
    -- 5. THE RENEWAL NOTICE (no state change)
    v_r := commercial.cgr_transition(l, gen_random_uuid(), 'renewal_notice', 'renewal_due', 'active', format('the term ends %s, within the %s-day renewal notice', commercial.cgr_instant(v_term), v_notice),
                                     '{}'::jsonb, NULL, NULL, NULL, p_actor, 'tick', l.issued_by, p_correlation);
    v_out := v_out || v_r;
  END IF;
  RETURN jsonb_build_object('contracted', true, 'live', 1, 'transitions', v_out);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION commercial.lapse_licences(uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION commercial.lapse_licences(uuid, uuid, uuid, uuid) TO eye_commit;
-- end section `grace`

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §LE — THE COST LEDGER: rate cards, allocation keys, cost entries, budgets, synthetic invoices, reconciliation, optimisation
-- (built as the part `ledger` on its own worktree; folded here in apply order §EN, §GR, §LE, §ME)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- ═════════════════════════════════════════════════════════════════════
-- section `ledger` (§LE) — CP-6 B91, part `ledger` (F-P7-F-02: the cost and resource ledger, budgets, variance, unit data cost,
-- reconciliation to invoice lines, anomaly, energy, optimisation that never weakens a control)
-- ═════════════════════════════════════════════════════════════════════
-- Applies after §0 (the prelude: the schema commercial, commercial.usage_records — §ME's meters —, the attention class commercial.usage and
-- the subject kind budget, the role commercial_authority). Forward only; nothing earlier is edited; no existing function is re-declared; no
-- existing event list is widened. Prefix cle_. Every figure a harness seeds here is SYNTHETIC.
--
--   §LE.1 THE TABLES     rate_cards (the vendor's price per dimension × unit, versioned with effective time, with an ENERGY coefficient that
--                        is an ESTIMATE and says so) · allocation_keys (how a tenant-level usage is shared out to domains / products /
--                        consumers, versioned with effective time) · cost_entries (usage × the rate in force at occurred_at: one entry per
--                        usage record and allocation share, append-only, idempotent per usage record, keeping the rate-card and allocation
--                        versions) · budgets (tenant or domain × capability × period, an amount and a NAMED HUMAN owner, versioned) ·
--                        budget_events (the ledger: declared, revised, threshold, anomaly) · invoices + invoice_lines (imported by the
--                        commercial authority — SYNTHETIC only in this build: a real billing account is the external prerequisite) ·
--                        reconciliations (an invoice's lines against the ledger's totals per dimension, with the differences) ·
--                        optimisation_decisions (the trade-offs recorded; an optimisation touching a protected control is REFUSED).
--   §LE.2 THE HELPERS    the acting principal, the platform/tenant scope, the commercial authority, the rate and the allocation in force at
--                        an instant, the period, the variance (internal), the attention item.
--   §LE.3 THE PORTS      set_rate_card · set_allocation_key (commercial.rate.set / commercial.allocation.set — the commercial authority) ·
--                        set_budget (commercial.budget.set — the tenant administrator, or the budget's owner for a revision) ·
--                        import_invoice · reconcile_invoice (commercial.invoice.import / .reconcile — the commercial authority) ·
--                        record_optimisation (commercial.optimisation.record — the commercial authority, human-gated) ·
--                        ledger_tick (executive.attention.tick — the tick step commercial-ledger: price, thresholds, anomaly).
--   §LE.4 THE READS      budget_variance (guarded definer: the budget's own scope) · unit_data_cost (DQM-040) · energy_estimate (INVOKER: RLS).
--
-- THE BOUNDARY (ADR-022, IA-70-003, DP-70-003): a budget threshold or an anomaly RAISES an item to the budget's owner; it never stops, deletes
-- or hides work. An optimisation may change only declared, adjustable controls; one that would change residency, isolation, retention,
-- recovery (or sovereignty, provenance, audit, evidence, human authority, accessibility, quality, freshness, durability, resilience) is
-- refused: `optimisation rejected (boundary)`. Nothing here is inferred: usage with no rate in force stays UNPRICED and is counted, never
-- read as zero; a reconciliation with unpriced usage in its period cannot be `matched`.

-- ─────────────────────────────────────────────────────────────────────
-- §LE.1 THE TABLES
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE commercial.rate_cards (
  rate_card_id         uuid PRIMARY KEY,
  rate_key             text NOT NULL CHECK (rate_key ~ '^[a-z_]+:.{1,40}$'),
  version              int NOT NULL CHECK (version >= 1),
  dimension            text NOT NULL CHECK (dimension IN ('model_inference', 'source_consumption', 'storage', 'simulation_compute', 'product_consumption')),
  unit                 text NOT NULL CHECK (length(btrim(unit)) BETWEEN 1 AND 40),
  price_per_unit       numeric NOT NULL CHECK (price_per_unit >= 0),
  currency             text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  energy_kwh_per_unit  numeric NULL CHECK (energy_kwh_per_unit IS NULL OR energy_kwh_per_unit >= 0),
  energy_label         text NULL CHECK (energy_label IS NULL OR energy_label = 'ESTIMATE'),
  energy_basis         text NULL,
  effective_from       timestamptz NOT NULL,
  synthetic            boolean NOT NULL,
  reason               text NOT NULL CHECK (length(btrim(reason)) >= 8),
  set_by               uuid NOT NULL,
  set_at               timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id       uuid NOT NULL,
  UNIQUE (rate_key, version),
  UNIQUE (rate_key, effective_from),
  CHECK (rate_key = dimension || ':' || unit),
  -- an energy coefficient is an ESTIMATE, labelled so, with its basis stated
  CHECK ((energy_kwh_per_unit IS NULL) = (energy_label IS NULL) AND (energy_kwh_per_unit IS NULL) = (energy_basis IS NULL)),
  CHECK (energy_basis IS NULL OR length(btrim(energy_basis)) >= 8)
);
CREATE INDEX cle_rate_in_force ON commercial.rate_cards (rate_key, effective_from DESC);
COMMENT ON TABLE commercial.rate_cards IS 'B91 §LE: the vendor''s price per usage dimension × unit, versioned with effective time (the version in force at an instant is the latest effective_from at or before it); the energy coefficient (kWh per unit) is an ESTIMATE, labelled so, with its basis. A version may not take effect before usage already priced under the card (no retroactive repricing).';

CREATE TABLE commercial.allocation_keys (
  allocation_key_id    uuid PRIMARY KEY,
  scope                text NOT NULL DEFAULT 'TENANT' CHECK (scope = 'TENANT'),
  tenant_id            uuid NOT NULL REFERENCES tenancy.tenants(id),
  dimension            text NOT NULL CHECK (dimension IN ('model_inference', 'source_consumption', 'storage', 'simulation_compute', 'product_consumption')),
  version              int NOT NULL CHECK (version >= 1),
  basis                text NOT NULL CHECK (length(btrim(basis)) >= 8),
  shares               jsonb NOT NULL CHECK (jsonb_typeof(shares) = 'array' AND jsonb_array_length(shares) BETWEEN 1 AND 50),
  effective_from       timestamptz NOT NULL,
  reason               text NOT NULL CHECK (length(btrim(reason)) >= 8),
  set_by               uuid NOT NULL,
  set_at               timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id       uuid NOT NULL,
  UNIQUE (tenant_id, dimension, version),
  UNIQUE (tenant_id, dimension, effective_from)
);
COMMENT ON TABLE commercial.allocation_keys IS 'B91 §LE: how a TENANT-level usage of a dimension (a usage record with no domain) is shared out to domains — and, where named, a product and a consumer — by weights summing to 1; versioned with effective time; a key may not take effect before usage it would re-allocate has been priced.';

CREATE TABLE commercial.cost_entries (
  entry_id              uuid PRIMARY KEY,
  usage_id              uuid NOT NULL REFERENCES commercial.usage_records(usage_id),
  line                  int NOT NULL CHECK (line >= 0),
  scope                 text NOT NULL CHECK (scope IN ('TENANT', 'DOMAIN')),
  tenant_id             uuid NOT NULL REFERENCES tenancy.tenants(id),
  domain_id             uuid NULL,
  product_id            uuid NULL,
  consumer_principal_id uuid NULL,
  capability_key        text NOT NULL,
  dimension             text NOT NULL,
  unit                  text NOT NULL,
  asset_ref             text NOT NULL,
  profile               text NOT NULL,
  quantity              numeric NOT NULL CHECK (quantity >= 0),
  share                 numeric NOT NULL CHECK (share > 0 AND share <= 1),
  allocation            text NOT NULL CHECK (allocation IN ('direct', 'allocated', 'unallocated')),
  allocation_key_id     uuid NULL REFERENCES commercial.allocation_keys(allocation_key_id),
  allocation_version    int NULL,
  rate_card_id          uuid NOT NULL REFERENCES commercial.rate_cards(rate_card_id),
  rate_key              text NOT NULL,
  rate_version          int NOT NULL,
  price_per_unit        numeric NOT NULL,
  currency              text NOT NULL,
  amount                numeric NOT NULL CHECK (amount >= 0),
  energy_kwh            numeric NULL,
  energy_label          text NULL CHECK (energy_label IS NULL OR energy_label = 'ESTIMATE'),
  occurred_at           timestamptz NOT NULL,
  priced_at             timestamptz NOT NULL DEFAULT clock_timestamp(),
  priced_by             uuid NOT NULL,
  correlation_id        uuid NOT NULL,
  UNIQUE (usage_id, line),
  CHECK ((scope = 'TENANT') = (domain_id IS NULL)),
  CHECK ((allocation = 'allocated') = (allocation_key_id IS NOT NULL) AND (allocation_key_id IS NULL) = (allocation_version IS NULL))
);
CREATE INDEX cle_entries_tenant ON commercial.cost_entries (tenant_id, occurred_at);
CREATE INDEX cle_entries_rate ON commercial.cost_entries (rate_key, occurred_at);
COMMENT ON TABLE commercial.cost_entries IS 'B91 §LE: the cost ledger — each usage record priced ONCE (unique per usage record and line) at the rate-card version in force at its occurred_at, kept with that version and the allocation key version that shared it; the energy estimate (kWh, labelled ESTIMATE) beside it. Append-only.';

CREATE TABLE commercial.budgets (
  budget_id           uuid NOT NULL,
  version             int NOT NULL CHECK (version >= 1),
  scope               text NOT NULL CHECK (scope IN ('TENANT', 'DOMAIN')),
  tenant_id           uuid NOT NULL REFERENCES tenancy.tenants(id),
  domain_id           uuid NULL,
  label               text NOT NULL CHECK (length(btrim(label)) BETWEEN 4 AND 200),
  capability_key      text NOT NULL CHECK (capability_key ~ '^[a-z][a-z0-9_]{1,40}$'),
  period_kind         text NOT NULL CHECK (period_kind IN ('month', 'quarter', 'year')),
  amount              numeric(18,2) NOT NULL CHECK (amount > 0),
  currency            text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  owner_principal_id  uuid NOT NULL,
  thresholds          int[] NOT NULL CHECK (cardinality(thresholds) BETWEEN 1 AND 6),
  anomaly_rule        jsonb NOT NULL CHECK (jsonb_typeof(anomaly_rule) = 'object'),
  reason              text NOT NULL CHECK (length(btrim(reason)) >= 8),
  set_by              uuid NOT NULL,
  set_at              timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id      uuid NOT NULL,
  PRIMARY KEY (budget_id, version),
  CHECK ((scope = 'TENANT') = (domain_id IS NULL))
);
-- one budget per (tenant, domain or none, capability, period kind): its first version is unique; later versions revise it
CREATE UNIQUE INDEX cle_budget_once ON commercial.budgets (tenant_id, coalesce(domain_id, '00000000-0000-0000-0000-000000000000'::uuid), capability_key, period_kind) WHERE version = 1;
CREATE INDEX cle_budget_tenant ON commercial.budgets (tenant_id, budget_id, version DESC);
COMMENT ON TABLE commercial.budgets IS 'B91 §LE: a budget — tenant or domain × capability (`all` for every capability) × period (month, quarter, year) — an amount in a currency, a NAMED HUMAN owner of the tenant, its thresholds (percent) and its declared anomaly rule; versioned (the current is the highest version). Set by the tenant administrator; revised by the administrator or the owner. A budget raises; it never stops work.';

CREATE TABLE commercial.budget_events (
  event_id            uuid PRIMARY KEY,
  scope               text NOT NULL CHECK (scope IN ('TENANT', 'DOMAIN')),
  tenant_id           uuid NOT NULL,
  domain_id           uuid NULL,
  budget_id           uuid NOT NULL,
  budget_version      int NOT NULL,
  event               text NOT NULL CHECK (event IN ('declared', 'revised', 'threshold', 'anomaly')),
  period_start        date NULL,
  threshold           int NULL,
  day                 date NULL,
  raised_in_domain    uuid NULL,
  attention_item_id   uuid NULL,
  details             jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
  actor_principal_id  uuid NULL,
  recorded_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id      uuid NOT NULL,
  FOREIGN KEY (budget_id, budget_version) REFERENCES commercial.budgets(budget_id, version),
  CHECK ((scope = 'TENANT') = (domain_id IS NULL)),
  CHECK (event <> 'threshold' OR (period_start IS NOT NULL AND threshold IS NOT NULL)),
  CHECK (event <> 'anomaly' OR day IS NOT NULL)
);
CREATE UNIQUE INDEX cle_be_threshold_once ON commercial.budget_events (budget_id, budget_version, period_start, threshold) WHERE event = 'threshold';
CREATE UNIQUE INDEX cle_be_anomaly_once ON commercial.budget_events (budget_id, day) WHERE event = 'anomaly';
CREATE INDEX cle_be_budget ON commercial.budget_events (budget_id, recorded_at);

CREATE TABLE commercial.invoices (
  invoice_id      uuid PRIMARY KEY,
  scope           text NOT NULL DEFAULT 'TENANT' CHECK (scope = 'TENANT'),
  tenant_id       uuid NOT NULL REFERENCES tenancy.tenants(id),
  invoice_ref     text NOT NULL CHECK (length(btrim(invoice_ref)) BETWEEN 1 AND 80),
  period_start    date NOT NULL,
  period_end      date NOT NULL,
  currency        text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  total           numeric(18,2) NOT NULL CHECK (total >= 0),
  issuer          text NOT NULL CHECK (length(btrim(issuer)) BETWEEN 2 AND 200),
  -- SYNTHETIC only in this build: a real billing account is the external prerequisite (F-P7-F-02's) and closes the clause, not this row
  synthetic       boolean NOT NULL CHECK (synthetic),
  digest          text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  imported_by     uuid NOT NULL,
  imported_at     timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id  uuid NOT NULL,
  UNIQUE (tenant_id, invoice_ref),
  CHECK (period_end >= period_start)
);
CREATE TABLE commercial.invoice_lines (
  invoice_id      uuid NOT NULL REFERENCES commercial.invoices(invoice_id),
  line_no         int NOT NULL CHECK (line_no >= 1),
  tenant_id       uuid NOT NULL,
  dimension       text NOT NULL CHECK (dimension IN ('model_inference', 'source_consumption', 'storage', 'simulation_compute', 'product_consumption')),
  unit            text NOT NULL CHECK (length(btrim(unit)) BETWEEN 1 AND 40),
  quantity        numeric NOT NULL CHECK (quantity >= 0),
  amount          numeric(18,2) NOT NULL CHECK (amount >= 0),
  description     text NULL,
  PRIMARY KEY (invoice_id, line_no)
);
CREATE TABLE commercial.reconciliations (
  reconciliation_id uuid PRIMARY KEY,
  scope             text NOT NULL DEFAULT 'TENANT' CHECK (scope = 'TENANT'),
  tenant_id         uuid NOT NULL,
  invoice_id        uuid NOT NULL REFERENCES commercial.invoices(invoice_id),
  version           int NOT NULL CHECK (version >= 1),
  tolerance         numeric NOT NULL CHECK (tolerance >= 0),
  outcome           text NOT NULL CHECK (outcome IN ('matched', 'differences')),
  lines             jsonb NOT NULL CHECK (jsonb_typeof(lines) = 'array'),
  totals            jsonb NOT NULL CHECK (jsonb_typeof(totals) = 'object'),
  reconciled_by     uuid NOT NULL,
  reconciled_at     timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id    uuid NOT NULL,
  UNIQUE (invoice_id, version)
);
CREATE TABLE commercial.optimisation_decisions (
  decision_id      uuid PRIMARY KEY,
  scope            text NOT NULL CHECK (scope IN ('PLATFORM', 'TENANT')),
  tenant_id        uuid NULL REFERENCES tenancy.tenants(id),
  title            text NOT NULL CHECK (length(btrim(title)) BETWEEN 4 AND 200),
  decision         text NOT NULL CHECK (decision IN ('adopt', 'defer')),
  changes          jsonb NOT NULL CHECK (jsonb_typeof(changes) = 'array'),
  tradeoffs        jsonb NOT NULL CHECK (jsonb_typeof(tradeoffs) = 'array' AND jsonb_array_length(tradeoffs) >= 1),
  expected_saving  jsonb NULL,
  rationale        text NOT NULL CHECK (length(btrim(rationale)) >= 8),
  boundary_check   jsonb NOT NULL,
  decided_by       uuid NOT NULL,
  decided_at       timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id   uuid NOT NULL,
  CHECK ((scope = 'PLATFORM') = (tenant_id IS NULL))
);
COMMENT ON TABLE commercial.optimisation_decisions IS 'B91 §LE (IA-70-003/-005, DP-70-003/-005): an economic optimisation decided by the commercial authority with its trade-offs; only declared adjustable controls may change — an optimisation that would change a protected control (residency, isolation, retention, recovery, …) is refused by the port and never recorded as adopted. A decision records; it applies nothing by itself.';

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['rate_cards', 'allocation_keys', 'cost_entries', 'budgets', 'budget_events', 'invoices', 'invoice_lines', 'reconciliations', 'optimisation_decisions'] LOOP
    EXECUTE format('CREATE TRIGGER cle_%s_append_only BEFORE UPDATE OR DELETE ON commercial.%I FOR EACH ROW EXECUTE FUNCTION public.raise_append_only()', t, t);
    EXECUTE format('REVOKE ALL ON commercial.%I FROM PUBLIC', t);
    EXECUTE format('ALTER TABLE commercial.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE commercial.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('GRANT SELECT ON commercial.%I TO eye_app, eye_commit', t);
  END LOOP;
END $$;
-- the vendor's price list: every bound context reads it
CREATE POLICY commercial_rate_read ON commercial.rate_cards USING (public.eye_scope() IS NOT NULL);
-- the customer's budget governance: the prelude's usage isolation, verbatim (the tenant; a domain sees its own and the tenant-level rows)
CREATE POLICY commercial_isolation ON commercial.budgets
  USING (tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR domain_id IS NULL OR domain_id = public.eye_domain()));
CREATE POLICY commercial_isolation ON commercial.budget_events
  USING (tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR domain_id IS NULL OR domain_id = public.eye_domain()));
-- the ledger and the billing records: the tenant's isolation, and the commercial authority (PLATFORM) for reconciliation
CREATE POLICY commercial_isolation ON commercial.cost_entries
  USING ((tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR domain_id IS NULL OR domain_id = public.eye_domain())) OR public.eye_scope() = 'PLATFORM');
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['allocation_keys', 'invoices', 'invoice_lines', 'reconciliations'] LOOP
    EXECUTE format('CREATE POLICY commercial_licence_read ON commercial.%I USING (tenant_id = public.eye_tenant() OR public.eye_scope() = ''PLATFORM'')', t);
  END LOOP;
END $$;
-- a platform-wide optimisation is visible to every tenant (what the vendor changed and what it traded); a tenant's to that tenant
CREATE POLICY commercial_licence_read ON commercial.optimisation_decisions
  USING (tenant_id IS NULL OR tenant_id = public.eye_tenant() OR public.eye_scope() = 'PLATFORM');

-- ─────────────────────────────────────────────────────────────────────
-- §LE.2 THE HELPERS (internal: REVOKEd from PUBLIC, granted to nobody — called only inside the definer ports)
-- ─────────────────────────────────────────────────────────────────────
/* The acting principal is the context's. */
CREATE OR REPLACE FUNCTION commercial.cle_assert_actor(p_noun text, p_actor uuid) RETURNS void
SET search_path = commercial, public, pg_catalog, pg_temp AS $$
BEGIN
  IF p_actor IS NULL OR p_actor IS DISTINCT FROM public.eye_principal() THEN
    RAISE EXCEPTION '% rejected (actor): recorded by the acting principal', p_noun USING ERRCODE = '42501';
  END IF;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION commercial.cle_assert_actor(text, uuid) FROM PUBLIC;

/* THE COMMERCIAL AUTHORITY: a PLATFORM context, and the actor an active human holding commercial_authority (never an agent, never a workload). */
CREATE OR REPLACE FUNCTION commercial.cle_assert_commercial_authority(p_noun text, p_actor uuid) RETURNS void
SECURITY DEFINER SET search_path = commercial, identity, public, pg_catalog, pg_temp AS $$
BEGIN
  IF public.eye_scope() IS DISTINCT FROM 'PLATFORM' THEN
    RAISE EXCEPTION '% rejected (authority): the vendor''s commercial records are set in the platform scope by the commercial authority', p_noun USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM identity.principals p JOIN identity.role_bindings b ON b.principal_id = p.id
                  WHERE p.id = p_actor AND p.kind = 'human' AND p.status = 'active' AND b.role_code = 'commercial_authority' AND b.scope = 'PLATFORM' AND b.revoked_at IS NULL) THEN
    RAISE EXCEPTION '% rejected (authority): a named, active human holding the commercial authority sets it', p_noun USING ERRCODE = '42501';
  END IF;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION commercial.cle_assert_commercial_authority(text, uuid) FROM PUBLIC;

/* A tenant's own scope: the bound tenant; a DOMAIN context acts on its own domain's records only (a tenant-level record is the tenant's). */
CREATE OR REPLACE FUNCTION commercial.cle_assert_tenant_scope(p_noun text, p_tenant uuid, p_domain uuid) RETURNS void
SET search_path = commercial, public, pg_catalog, pg_temp AS $$
BEGIN
  IF public.eye_scope() NOT IN ('TENANT', 'DOMAIN') OR p_tenant IS DISTINCT FROM public.eye_tenant() THEN
    RAISE EXCEPTION '% rejected (authority): a tenant''s record is set within that tenant''s bound scope', p_noun USING ERRCODE = '42501';
  END IF;
  IF public.eye_scope() = 'DOMAIN' AND p_domain IS DISTINCT FROM public.eye_domain() THEN
    RAISE EXCEPTION '% rejected (authority): a domain context sets its own domain''s record only (a tenant-level record is set in the tenant scope)', p_noun USING ERRCODE = '42501';
  END IF;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION commercial.cle_assert_tenant_scope(text, uuid, uuid) FROM PUBLIC;

/* The rate-card version in force for a dimension × unit at an instant (the latest effective_from at or before it), or NULL. */
CREATE OR REPLACE FUNCTION commercial.cle_rate_at(p_dimension text, p_unit text, p_at timestamptz) RETURNS commercial.rate_cards
STABLE SET search_path = commercial, pg_catalog, pg_temp AS $$
  SELECT r.* FROM commercial.rate_cards r WHERE r.rate_key = p_dimension || ':' || p_unit AND r.effective_from <= p_at ORDER BY r.effective_from DESC LIMIT 1
$$ LANGUAGE sql;
REVOKE ALL ON FUNCTION commercial.cle_rate_at(text, text, timestamptz) FROM PUBLIC;

/* The allocation key version in force for a tenant × dimension at an instant, or NULL. */
CREATE OR REPLACE FUNCTION commercial.cle_allocation_at(p_tenant uuid, p_dimension text, p_at timestamptz) RETURNS commercial.allocation_keys
STABLE SET search_path = commercial, pg_catalog, pg_temp AS $$
  SELECT k.* FROM commercial.allocation_keys k WHERE k.tenant_id = p_tenant AND k.dimension = p_dimension AND k.effective_from <= p_at ORDER BY k.effective_from DESC LIMIT 1
$$ LANGUAGE sql;
REVOKE ALL ON FUNCTION commercial.cle_allocation_at(uuid, text, timestamptz) FROM PUBLIC;

/* The budget's current version (the highest). */
CREATE OR REPLACE FUNCTION commercial.cle_budget_current(p_budget_id uuid) RETURNS commercial.budgets
STABLE SET search_path = commercial, pg_catalog, pg_temp AS $$
  SELECT b.* FROM commercial.budgets b WHERE b.budget_id = p_budget_id ORDER BY b.version DESC LIMIT 1
$$ LANGUAGE sql;
REVOKE ALL ON FUNCTION commercial.cle_budget_current(uuid) FROM PUBLIC;

/* THE VARIANCE of a budget at an instant (cle-variance@1; apps/api/src/commercial/ledger/ledger-math.ts `variance` is the same rule):
   the period is the calendar month / quarter / year (UTC) containing the instant; spent = the priced cost entries of the budget's tenant
   (its domain when it is a domain budget; its capability unless `all`) in the budget's currency that occurred in the period; variance =
   spent − amount (positive = over); the FORECAST to period end is the linear run-rate spent ÷ elapsed fraction; the usage in the period
   still UNPRICED (no rate in force) and the entries in another currency are counted — the figures are COMPLETE only when both are 0. */
CREATE OR REPLACE FUNCTION commercial.cle_variance(b commercial.budgets, p_at timestamptz) RETURNS jsonb
STABLE SET search_path = commercial, pg_catalog, pg_temp AS $$
DECLARE v_start date := date_trunc(b.period_kind, p_at AT TIME ZONE 'UTC')::date;
        v_end date; v_from timestamptz; v_to timestamptz; v_spent numeric; v_other int; v_unpriced int; v_elapsed numeric; v_forecast numeric;
BEGIN
  v_end := (v_start + CASE b.period_kind WHEN 'month' THEN interval '1 month' WHEN 'quarter' THEN interval '3 months' ELSE interval '1 year' END)::date;
  v_from := v_start::timestamp AT TIME ZONE 'UTC'; v_to := v_end::timestamp AT TIME ZONE 'UTC';
  SELECT coalesce(sum(c.amount) FILTER (WHERE c.currency = b.currency), 0), count(*) FILTER (WHERE c.currency <> b.currency)
    INTO v_spent, v_other
    FROM commercial.cost_entries c
   WHERE c.tenant_id = b.tenant_id AND (b.domain_id IS NULL OR c.domain_id = b.domain_id) AND (b.capability_key = 'all' OR c.capability_key = b.capability_key)
     AND c.occurred_at >= v_from AND c.occurred_at < v_to;
  SELECT count(*) INTO v_unpriced FROM commercial.usage_records u
   WHERE u.tenant_id = b.tenant_id AND (b.domain_id IS NULL OR u.domain_id = b.domain_id OR u.domain_id IS NULL) AND (b.capability_key = 'all' OR u.capability_key = b.capability_key)
     AND u.occurred_at >= v_from AND u.occurred_at < v_to AND NOT EXISTS (SELECT 1 FROM commercial.cost_entries c WHERE c.usage_id = u.usage_id);
  v_elapsed := extract(epoch FROM (least(greatest(p_at, v_from), v_to) - v_from)) / extract(epoch FROM (v_to - v_from));
  v_forecast := CASE WHEN v_elapsed > 0 THEN v_spent / v_elapsed END;
  RETURN jsonb_build_object('rule', 'cle-variance@1', 'budget_id', b.budget_id, 'version', b.version, 'label', b.label, 'scope', b.scope, 'domain_id', b.domain_id,
    'capability_key', b.capability_key, 'period_kind', b.period_kind, 'period_start', v_start, 'period_end', v_end, 'as_of', p_at,
    'amount', b.amount, 'currency', b.currency, 'owner_principal_id', b.owner_principal_id, 'thresholds', to_jsonb(b.thresholds),
    'spent', round(v_spent, 6), 'variance', round(v_spent - b.amount, 6), 'pct', round(v_spent / b.amount * 100, 2),
    'elapsed_fraction', round(v_elapsed, 6), 'forecast', round(v_forecast, 6), 'forecast_variance', round(v_forecast - b.amount, 6),
    'forecast_basis', 'linear run-rate: spent ÷ the elapsed fraction of the period',
    'unpriced_usage', v_unpriced, 'other_currency_entries', v_other, 'complete', v_unpriced = 0 AND v_other = 0);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION commercial.cle_variance(commercial.budgets, timestamptz) FROM PUBLIC;

/* A commercial.usage item for a budget's owner, raised in the domain the tick runs in (attention items are domain-scoped; a tenant budget's
   item lands in the domain whose tick saw it first — the event's uniqueness keeps it ONE). The owner when an active human of the tenant,
   else UNROUTED with the tenant administrators as the route roles (the sio_notify idiom, 0099 §O). */
CREATE OR REPLACE FUNCTION commercial.cle_notify(p_item uuid, b commercial.budgets, p_domain uuid, p_title text, p_reasons jsonb, p_cause_event uuid, p_cause_type text,
                                                 p_details jsonb, p_actor uuid, p_correlation uuid) RETURNS void
SECURITY DEFINER SET search_path = executive, identity, decision, pg_catalog, pg_temp AS $$
DECLARE v_state text; v_due timestamptz := clock_timestamp() + interval '24 hours'; v_roles text[] := ARRAY['tenant_admin'];
BEGIN
  v_state := CASE WHEN decision.is_active_human(b.owner_principal_id, b.tenant_id) THEN 'open'
                  WHEN executive.role_holders(b.tenant_id, p_domain, v_roles) > 0 THEN 'open' ELSE 'unrouted' END;
  INSERT INTO executive.attention_items (item_id, scope, tenant_id, domain_id, signal_class, subject_kind, subject_id, cause_event_id, cause_event_type, title, outcome, state, owner_principal_id, route_roles, evaluation, details, due_at, escalations, correlation_id)
  VALUES (p_item, 'DOMAIN', b.tenant_id, p_domain, 'commercial.usage', 'budget', b.budget_id, p_cause_event, p_cause_type, left(p_title, 512), 'material', v_state,
          CASE WHEN decision.is_active_human(b.owner_principal_id, b.tenant_id) THEN b.owner_principal_id END, v_roles,
          jsonb_build_object('outcome', 'material', 'reasons', p_reasons, 'policy_version', NULL, 'dimensions', jsonb_build_object('consequence', 'C2', 'confidence', 1)),
          jsonb_build_object('budget_id', b.budget_id, 'budget_version', b.version, 'label', b.label, 'synthetic_figures_possible', true) || coalesce(p_details, '{}'::jsonb), v_due, 0, p_correlation);
  PERFORM executive.attention_event(p_item, b.tenant_id, p_domain, CASE v_state WHEN 'open' THEN 'item.routed' ELSE 'item.unrouted' END, p_actor,
            jsonb_build_object('outcome', 'material', 'reasons', p_reasons, 'policy_version', NULL, 'owner', b.owner_principal_id, 'route_roles', to_jsonb(v_roles), 'due_at', v_due,
                               'cause_event_id', p_cause_event, 'cause_event_type', p_cause_type, 'unrouted', v_state = 'unrouted', 'budget_id', b.budget_id), p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION commercial.cle_notify(uuid, commercial.budgets, uuid, text, jsonb, uuid, text, jsonb, uuid, uuid) FROM PUBLIC;

/* The optimisation vocabulary: the controls an optimisation MAY adjust, and the PROTECTED ones it may never change (IA-70-003, DP-70-003). */
CREATE OR REPLACE FUNCTION commercial.cle_adjustable_controls() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY['compute_schedule', 'batch_window', 'cache_tier', 'index_tier', 'instance_size', 'reservation', 'model_choice', 'sampling_rate', 'storage_compression', 'chunk_pace'] $$;
CREATE OR REPLACE FUNCTION commercial.cle_protected_controls() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY['residency', 'region', 'isolation', 'tenancy', 'retention', 'recovery', 'backup', 'rpo', 'rto', 'sovereignty', 'provenance', 'audit', 'evidence',
               'human_authority', 'accessibility', 'quality', 'freshness', 'durability', 'resilience', 'replication', 'encryption'] $$;

-- ─────────────────────────────────────────────────────────────────────
-- §LE.3 THE PORTS
-- ─────────────────────────────────────────────────────────────────────
/* SET A RATE CARD (commercial.rate.set — the commercial authority, human-gated): a new version of the price of a dimension × unit from an
   effective instant. A version takes effect AFTER the one before it, and never before usage already priced under the card (a price is not
   changed under a priced entry: no retroactive repricing — class `priced`). The currency stays the card's. The energy coefficient, when
   given, is an ESTIMATE with its basis. */
CREATE OR REPLACE FUNCTION commercial.set_rate_card(p_rate_card_id uuid, p_dimension text, p_unit text, p_price numeric, p_currency text, p_energy_kwh numeric,
                                                    p_energy_basis text, p_effective_from timestamptz, p_synthetic boolean, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = commercial, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_key text; p commercial.rate_cards%ROWTYPE; r commercial.rate_cards%ROWTYPE; v_last timestamptz;
BEGIN
  PERFORM observation.assert_authority(ARRAY['commercial.rate.set']);
  PERFORM commercial.cle_assert_actor('rate card', p_actor);
  PERFORM commercial.cle_assert_commercial_authority('rate card', p_actor);
  IF p_dimension IS NULL OR NOT (p_dimension = ANY (ARRAY['model_inference', 'source_consumption', 'storage', 'simulation_compute', 'product_consumption'])) THEN
    RAISE EXCEPTION 'rate card rejected (dimension): the dimension is one of model_inference, source_consumption, storage, simulation_compute, product_consumption' USING ERRCODE = '22023';
  END IF;
  IF length(btrim(coalesce(p_unit, ''))) NOT BETWEEN 1 AND 40 THEN RAISE EXCEPTION 'rate card rejected (unit): the unit is named (1–40 characters)' USING ERRCODE = '22023'; END IF;
  IF p_price IS NULL OR p_price < 0 THEN RAISE EXCEPTION 'rate card rejected (price): the price per unit is a number at or above 0' USING ERRCODE = '22023'; END IF;
  IF p_currency IS NULL OR p_currency !~ '^[A-Z]{3}$' THEN RAISE EXCEPTION 'rate card rejected (currency): the currency is an ISO 4217 code' USING ERRCODE = '22023'; END IF;
  IF p_energy_kwh IS NOT NULL AND (p_energy_kwh < 0 OR length(btrim(coalesce(p_energy_basis, ''))) < 8) THEN
    RAISE EXCEPTION 'rate card rejected (energy): an energy coefficient is kWh per unit at or above 0, an ESTIMATE that states its basis (at least 8 characters)' USING ERRCODE = '22023';
  END IF;
  IF p_effective_from IS NULL THEN RAISE EXCEPTION 'rate card rejected (effective_from): a version names the instant it takes effect' USING ERRCODE = '22023'; END IF;
  IF p_synthetic IS NULL THEN RAISE EXCEPTION 'rate card rejected (synthetic): a rate card says whether its price is SYNTHETIC' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'rate card rejected (reason): a rate card states its reason (at least 8 characters)' USING ERRCODE = '22023'; END IF;
  v_key := p_dimension || ':' || btrim(p_unit);
  PERFORM pg_advisory_xact_lock(hashtext('cle_rate:' || v_key));
  SELECT * INTO p FROM commercial.rate_cards x WHERE x.rate_key = v_key ORDER BY x.version DESC LIMIT 1;
  IF FOUND THEN
    IF p_effective_from <= p.effective_from THEN
      RAISE EXCEPTION 'rate card rejected (stale): version % of % takes effect %; a new version takes effect after it', p.version, v_key, p.effective_from USING ERRCODE = '2F002';
    END IF;
    IF p_currency <> p.currency THEN RAISE EXCEPTION 'rate card rejected (currency): % is priced in %; a version keeps the card''s currency', v_key, p.currency USING ERRCODE = '22023'; END IF;
  END IF;
  SELECT max(c.occurred_at) INTO v_last FROM commercial.cost_entries c WHERE c.rate_key = v_key AND c.occurred_at >= p_effective_from;
  IF v_last IS NOT NULL THEN
    RAISE EXCEPTION 'rate card rejected (priced): usage of % that occurred at % is already priced; a price never changes under a priced entry (take effect after %)', v_key, v_last, v_last USING ERRCODE = '2F002';
  END IF;
  INSERT INTO commercial.rate_cards (rate_card_id, rate_key, version, dimension, unit, price_per_unit, currency, energy_kwh_per_unit, energy_label, energy_basis, effective_from, synthetic, reason, set_by, correlation_id)
  VALUES (p_rate_card_id, v_key, coalesce(p.version, 0) + 1, p_dimension, btrim(p_unit), p_price, p_currency, p_energy_kwh, CASE WHEN p_energy_kwh IS NOT NULL THEN 'ESTIMATE' END,
          CASE WHEN p_energy_kwh IS NOT NULL THEN btrim(p_energy_basis) END, p_effective_from, p_synthetic, btrim(p_reason), p_actor, p_correlation)
  RETURNING * INTO r;
  RETURN to_jsonb(r) || jsonb_build_object('prior_version', p.version);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION commercial.set_rate_card(uuid, text, text, numeric, text, numeric, text, timestamptz, boolean, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION commercial.set_rate_card(uuid, text, text, numeric, text, numeric, text, timestamptz, boolean, text, uuid, uuid) TO eye_commit;

/* SET AN ALLOCATION KEY (commercial.allocation.set — the commercial authority, human-gated): how a tenant's TENANT-level usage of a dimension
   is shared out — each share a domain of the tenant (optionally a product of that domain and a consumer principal of the tenant) and a
   weight; the weights sum to 1 (an unreliable allocation is refused, IA-70-005). Versioned from an effective instant, after the prior
   version's, and never before tenant-level usage of the dimension already priced. */
CREATE OR REPLACE FUNCTION commercial.set_allocation_key(p_key_id uuid, p_tenant uuid, p_dimension text, p_basis text, p_shares jsonb, p_effective_from timestamptz,
                                                         p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = commercial, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE p commercial.allocation_keys%ROWTYPE; k commercial.allocation_keys%ROWTYPE; s jsonb; v_sum numeric := 0; v_targets text[] := '{}'; v_target text; v_norm jsonb := '[]'::jsonb;
        v_last timestamptz; v_w numeric;
BEGIN
  PERFORM observation.assert_authority(ARRAY['commercial.allocation.set']);
  PERFORM commercial.cle_assert_actor('allocation key', p_actor);
  PERFORM commercial.cle_assert_commercial_authority('allocation key', p_actor);
  IF NOT EXISTS (SELECT 1 FROM tenancy.tenants t WHERE t.id = p_tenant) THEN RAISE EXCEPTION 'allocation key rejected (unknown_tenant): % is not a tenant', p_tenant USING ERRCODE = '23503'; END IF;
  IF p_dimension IS NULL OR NOT (p_dimension = ANY (ARRAY['model_inference', 'source_consumption', 'storage', 'simulation_compute', 'product_consumption'])) THEN
    RAISE EXCEPTION 'allocation key rejected (dimension): the dimension is one of model_inference, source_consumption, storage, simulation_compute, product_consumption' USING ERRCODE = '22023';
  END IF;
  IF length(btrim(coalesce(p_basis, ''))) < 8 OR length(btrim(coalesce(p_reason, ''))) < 8 THEN
    RAISE EXCEPTION 'allocation key rejected (reason): an allocation key states its basis and its reason (at least 8 characters each)' USING ERRCODE = '22023';
  END IF;
  IF p_effective_from IS NULL THEN RAISE EXCEPTION 'allocation key rejected (effective_from): a version names the instant it takes effect' USING ERRCODE = '22023'; END IF;
  IF jsonb_typeof(p_shares) IS DISTINCT FROM 'array' OR jsonb_array_length(p_shares) NOT BETWEEN 1 AND 50 THEN
    RAISE EXCEPTION 'allocation key rejected (shares): the shares are a list of 1 to 50' USING ERRCODE = '22023';
  END IF;
  FOR s IN SELECT x FROM jsonb_array_elements(p_shares) x LOOP
    IF jsonb_typeof(s) <> 'object' OR coalesce(s ->> 'domain_id', '') !~ '^[0-9a-f-]{36}$' OR jsonb_typeof(s -> 'weight') IS DISTINCT FROM 'number' THEN
      RAISE EXCEPTION 'allocation key rejected (shares): each share names a domain_id and a numeric weight' USING ERRCODE = '22023';
    END IF;
    v_w := (s ->> 'weight')::numeric;
    IF v_w <= 0 OR v_w > 1 THEN RAISE EXCEPTION 'allocation key rejected (weights): each weight is in (0, 1]' USING ERRCODE = '22023'; END IF;
    IF NOT EXISTS (SELECT 1 FROM tenancy.domains d WHERE d.id = (s ->> 'domain_id')::uuid AND d.tenant_id = p_tenant) THEN
      RAISE EXCEPTION 'allocation key rejected (unknown_domain): % is not a domain of this tenant', s ->> 'domain_id' USING ERRCODE = '23503';
    END IF;
    IF s ? 'product_id' AND jsonb_typeof(s -> 'product_id') <> 'null' THEN
      IF coalesce(s ->> 'product_id', '') !~ '^[0-9a-f-]{36}$' OR to_regclass('products.products_current') IS NULL
         OR NOT EXISTS (SELECT 1 FROM products.products_current pc WHERE pc.product_id = (s ->> 'product_id')::uuid AND pc.tenant_id = p_tenant AND pc.domain_id = (s ->> 'domain_id')::uuid) THEN
        RAISE EXCEPTION 'allocation key rejected (unknown_product): % is not a product of domain %', s ->> 'product_id', s ->> 'domain_id' USING ERRCODE = '23503';
      END IF;
    END IF;
    IF s ? 'consumer_principal_id' AND jsonb_typeof(s -> 'consumer_principal_id') <> 'null' THEN
      IF coalesce(s ->> 'consumer_principal_id', '') !~ '^[0-9a-f-]{36}$'
         OR NOT EXISTS (SELECT 1 FROM identity.principals pr WHERE pr.id = (s ->> 'consumer_principal_id')::uuid AND pr.tenant_id = p_tenant) THEN
        RAISE EXCEPTION 'allocation key rejected (unknown_consumer): % is not a principal of this tenant', s ->> 'consumer_principal_id' USING ERRCODE = '23503';
      END IF;
    END IF;
    v_target := concat_ws('/', s ->> 'domain_id', nullif(s ->> 'product_id', ''), nullif(s ->> 'consumer_principal_id', ''));
    IF v_target = ANY (v_targets) THEN RAISE EXCEPTION 'allocation key rejected (shares): the share % is named twice', v_target USING ERRCODE = '22023'; END IF;
    v_targets := v_targets || v_target; v_sum := v_sum + v_w;
    v_norm := v_norm || jsonb_build_object('domain_id', s ->> 'domain_id', 'product_id', nullif(s ->> 'product_id', ''), 'consumer_principal_id', nullif(s ->> 'consumer_principal_id', ''), 'weight', v_w);
  END LOOP;
  IF abs(v_sum - 1) > 0.000000001 THEN
    RAISE EXCEPTION 'allocation key rejected (weights): the weights sum to %, not 1 — an allocation that does not account for the whole usage is unreliable', v_sum USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('cle_alloc:' || p_tenant::text || ':' || p_dimension));
  SELECT * INTO p FROM commercial.allocation_keys x WHERE x.tenant_id = p_tenant AND x.dimension = p_dimension ORDER BY x.version DESC LIMIT 1;
  IF FOUND AND p_effective_from <= p.effective_from THEN
    RAISE EXCEPTION 'allocation key rejected (stale): version % takes effect %; a new version takes effect after it', p.version, p.effective_from USING ERRCODE = '2F002';
  END IF;
  SELECT max(c.occurred_at) INTO v_last FROM commercial.cost_entries c
   WHERE c.tenant_id = p_tenant AND c.dimension = p_dimension AND c.allocation <> 'direct' AND c.occurred_at >= p_effective_from;
  IF v_last IS NOT NULL THEN
    RAISE EXCEPTION 'allocation key rejected (priced): tenant-level % usage that occurred at % is already priced and allocated; a key never re-allocates a priced entry (take effect after %)', p_dimension, v_last, v_last USING ERRCODE = '2F002';
  END IF;
  INSERT INTO commercial.allocation_keys (allocation_key_id, tenant_id, dimension, version, basis, shares, effective_from, reason, set_by, correlation_id)
  VALUES (p_key_id, p_tenant, p_dimension, coalesce(p.version, 0) + 1, btrim(p_basis), v_norm, p_effective_from, btrim(p_reason), p_actor, p_correlation)
  RETURNING * INTO k;
  RETURN to_jsonb(k) || jsonb_build_object('prior_version', p.version);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION commercial.set_allocation_key(uuid, uuid, text, text, jsonb, timestamptz, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION commercial.set_allocation_key(uuid, uuid, text, text, jsonb, timestamptz, text, uuid, uuid) TO eye_commit;

/* SET A BUDGET (commercial.budget.set — human-gated): the FIRST version by the tenant administrator (a named, active human holding
   tenant_admin in the tenant); a REVISION (p_expected_version = the current) by the administrator or the budget's current owner. The owner
   is a named, active human of the tenant — never an agent. The key (tenant, domain, capability, period) is fixed by the first version. The
   scope: the tenant's context for a tenant-level budget, a domain's for its own; the OWNER of a tenant-level budget may revise it from its
   own domain's context (the owner's roles — executive, strategy owner … — are domain roles). */
CREATE OR REPLACE FUNCTION commercial.set_budget(p_budget_id uuid, p_tenant uuid, p_domain uuid, p_label text, p_capability_key text, p_period_kind text, p_amount numeric,
                                                 p_currency text, p_owner uuid, p_thresholds int[], p_anomaly jsonb, p_expected_version int, p_reason text, p_actor uuid,
                                                 p_event_id uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = commercial, observation, decision, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE cur commercial.budgets%ROWTYPE; b commercial.budgets%ROWTYPE; v_admin boolean; v_thr int[]; v_k numeric; v_w int; v_anom jsonb; v_domain uuid := p_domain; v_cap text := p_capability_key; v_kind text := p_period_kind;
BEGIN
  PERFORM observation.assert_authority(ARRAY['commercial.budget.set']);
  PERFORM commercial.cle_assert_actor('budget', p_actor);
  IF NOT decision.is_active_human(p_actor, p_tenant) THEN RAISE EXCEPTION 'budget rejected (authority): a budget is set by a named, active human of the tenant — never an agent' USING ERRCODE = '42501'; END IF;
  v_admin := EXISTS (SELECT 1 FROM identity.role_bindings rb WHERE rb.principal_id = p_actor AND rb.role_code = 'tenant_admin' AND rb.scope = 'TENANT' AND rb.tenant_id = p_tenant AND rb.revoked_at IS NULL);
  IF p_expected_version IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('cle_budget:' || p_budget_id::text));
    cur := commercial.cle_budget_current(p_budget_id);
    IF cur.budget_id IS NULL OR cur.tenant_id <> p_tenant THEN RAISE EXCEPTION 'budget rejected (unknown_budget): % is not a budget of this tenant', p_budget_id USING ERRCODE = '23503'; END IF;
    v_domain := cur.domain_id; v_cap := cur.capability_key; v_kind := cur.period_kind;
  END IF;
  IF p_expected_version IS NOT NULL AND v_domain IS NULL AND public.eye_scope() = 'DOMAIN' AND public.eye_tenant() = p_tenant AND p_actor = cur.owner_principal_id THEN
    NULL;  -- the OWNER of a tenant-level budget revises it from its own domain's context (an owner's roles are domain roles)
  ELSE
    PERFORM commercial.cle_assert_tenant_scope('budget', p_tenant, v_domain);
  END IF;
  IF p_expected_version IS NULL THEN
    IF NOT v_admin THEN RAISE EXCEPTION 'budget rejected (authority): a budget is declared by the tenant administrator' USING ERRCODE = '42501'; END IF;
  ELSE
    IF cur.version <> p_expected_version THEN RAISE EXCEPTION 'budget rejected (stale): the budget is at version %, not %', cur.version, p_expected_version USING ERRCODE = '2F002'; END IF;
    IF NOT v_admin AND p_actor IS DISTINCT FROM cur.owner_principal_id THEN
      RAISE EXCEPTION 'budget rejected (ownership): a budget is revised by the tenant administrator or its owner' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF length(btrim(coalesce(p_label, ''))) NOT BETWEEN 4 AND 200 THEN RAISE EXCEPTION 'budget rejected (label): a budget is named (4–200 characters)' USING ERRCODE = '22023'; END IF;
  IF v_cap IS NULL OR v_cap !~ '^[a-z][a-z0-9_]{1,40}$' THEN RAISE EXCEPTION 'budget rejected (capability): the capability is a capability key, or all' USING ERRCODE = '22023'; END IF;
  IF v_kind IS NULL OR v_kind NOT IN ('month', 'quarter', 'year') THEN RAISE EXCEPTION 'budget rejected (period): the period is month, quarter or year' USING ERRCODE = '22023'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount >= 10000000000000000 THEN RAISE EXCEPTION 'budget rejected (amount): the amount is a positive number' USING ERRCODE = '22023'; END IF;
  IF p_currency IS NULL OR p_currency !~ '^[A-Z]{3}$' THEN RAISE EXCEPTION 'budget rejected (currency): the currency is an ISO 4217 code' USING ERRCODE = '22023'; END IF;
  IF v_domain IS NOT NULL AND NOT EXISTS (SELECT 1 FROM tenancy.domains d WHERE d.id = v_domain AND d.tenant_id = p_tenant) THEN
    RAISE EXCEPTION 'budget rejected (unknown_domain): % is not a domain of this tenant', v_domain USING ERRCODE = '23503';
  END IF;
  IF p_owner IS NULL OR NOT decision.is_active_human(p_owner, p_tenant) THEN
    RAISE EXCEPTION 'budget rejected (owner): the owner is a named, active human of the tenant — never an agent' USING ERRCODE = '22023';
  END IF;
  SELECT coalesce(array_agg(DISTINCT x ORDER BY x), '{}') INTO v_thr FROM unnest(coalesce(p_thresholds, ARRAY[80, 100])) x;
  IF cardinality(v_thr) NOT BETWEEN 1 AND 6 OR EXISTS (SELECT 1 FROM unnest(v_thr) x WHERE x IS NULL OR x < 1 OR x > 500) THEN
    RAISE EXCEPTION 'budget rejected (thresholds): 1 to 6 thresholds, each a percentage of the amount in [1, 500]' USING ERRCODE = '22023';
  END IF;
  v_anom := coalesce(p_anomaly, '{"k": 3, "window_days": 7}'::jsonb);
  IF jsonb_typeof(v_anom) <> 'object' OR jsonb_typeof(v_anom -> 'k') IS DISTINCT FROM 'number' OR jsonb_typeof(v_anom -> 'window_days') IS DISTINCT FROM 'number' THEN
    RAISE EXCEPTION 'budget rejected (anomaly): the anomaly rule declares k and window_days' USING ERRCODE = '22023';
  END IF;
  v_k := (v_anom ->> 'k')::numeric; v_w := (v_anom ->> 'window_days')::numeric::int;
  IF v_k <= 1 OR v_k > 100 OR v_w < 3 OR v_w > 90 OR (v_anom ->> 'window_days')::numeric <> v_w THEN
    RAISE EXCEPTION 'budget rejected (anomaly): k is in (1, 100] and window_days an integer in [3, 90]' USING ERRCODE = '22023';
  END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'budget rejected (reason): a budget states its reason (at least 8 characters)' USING ERRCODE = '22023'; END IF;
  IF p_expected_version IS NULL AND EXISTS (SELECT 1 FROM commercial.budgets x WHERE x.version = 1 AND x.tenant_id = p_tenant AND x.domain_id IS NOT DISTINCT FROM v_domain
                                                  AND x.capability_key = v_cap AND x.period_kind = v_kind) THEN
    RAISE EXCEPTION 'budget rejected (duplicate): this tenant already has a % budget for % in this scope — revise it', v_kind, v_cap USING ERRCODE = '23505';
  END IF;
  INSERT INTO commercial.budgets (budget_id, version, scope, tenant_id, domain_id, label, capability_key, period_kind, amount, currency, owner_principal_id, thresholds, anomaly_rule, reason, set_by, correlation_id)
  VALUES (CASE WHEN p_expected_version IS NULL THEN p_budget_id ELSE cur.budget_id END, coalesce(cur.version, 0) + 1, CASE WHEN v_domain IS NULL THEN 'TENANT' ELSE 'DOMAIN' END, p_tenant, v_domain,
          btrim(p_label), v_cap, v_kind, p_amount, p_currency, p_owner, v_thr, jsonb_build_object('rule', 'cle-anomaly@1', 'k', v_k, 'window_days', v_w), btrim(p_reason), p_actor, p_correlation)
  RETURNING * INTO b;
  INSERT INTO commercial.budget_events (event_id, scope, tenant_id, domain_id, budget_id, budget_version, event, details, actor_principal_id, correlation_id)
  VALUES (p_event_id, b.scope, b.tenant_id, b.domain_id, b.budget_id, b.version, CASE WHEN b.version = 1 THEN 'declared' ELSE 'revised' END,
          jsonb_build_object('amount', b.amount, 'currency', b.currency, 'owner', b.owner_principal_id, 'thresholds', to_jsonb(b.thresholds), 'anomaly_rule', b.anomaly_rule, 'reason', b.reason,
                             'prior', CASE WHEN cur.budget_id IS NOT NULL THEN jsonb_build_object('version', cur.version, 'amount', cur.amount, 'owner', cur.owner_principal_id) END),
          p_actor, p_correlation);
  RETURN to_jsonb(b) || jsonb_build_object('variance', commercial.cle_variance(b, clock_timestamp()));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION commercial.set_budget(uuid, uuid, uuid, text, text, text, numeric, text, uuid, int[], jsonb, int, text, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION commercial.set_budget(uuid, uuid, uuid, text, text, text, numeric, text, uuid, int[], jsonb, int, text, uuid, uuid, uuid) TO eye_commit;

/* IMPORT AN INVOICE (commercial.invoice.import — the commercial authority, human-gated): the vendor's invoice of a tenant for a period, its
   lines per dimension × unit, their amounts summing to the total. SYNTHETIC only in this build — a real billing account is the external
   prerequisite (F-P7-F-02); a synthetic invoice demonstrates the reconciliation and closes no clause that needs the real one. */
CREATE OR REPLACE FUNCTION commercial.import_invoice(p_invoice_id uuid, p_tenant uuid, p_invoice_ref text, p_period_start date, p_period_end date, p_currency text, p_total numeric,
                                                     p_issuer text, p_synthetic boolean, p_lines jsonb, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = commercial, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE l jsonb; n int := 0; v_sum numeric := 0; v_digest text; i commercial.invoices%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['commercial.invoice.import']);
  PERFORM commercial.cle_assert_actor('invoice', p_actor);
  PERFORM commercial.cle_assert_commercial_authority('invoice', p_actor);
  IF NOT EXISTS (SELECT 1 FROM tenancy.tenants t WHERE t.id = p_tenant) THEN RAISE EXCEPTION 'invoice rejected (unknown_tenant): % is not a tenant', p_tenant USING ERRCODE = '23503'; END IF;
  IF p_synthetic IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'invoice rejected (synthetic): this build imports SYNTHETIC invoices only — a real billing account is the external prerequisite, and only it closes reconciliation to actual cost' USING ERRCODE = '22023';
  END IF;
  IF length(btrim(coalesce(p_invoice_ref, ''))) NOT BETWEEN 1 AND 80 OR length(btrim(coalesce(p_issuer, ''))) NOT BETWEEN 2 AND 200 THEN
    RAISE EXCEPTION 'invoice rejected (reference): an invoice names its reference (1–80 characters) and its issuer' USING ERRCODE = '22023';
  END IF;
  IF p_period_start IS NULL OR p_period_end IS NULL OR p_period_end < p_period_start THEN RAISE EXCEPTION 'invoice rejected (period): the period starts on or before it ends' USING ERRCODE = '22023'; END IF;
  IF p_currency IS NULL OR p_currency !~ '^[A-Z]{3}$' THEN RAISE EXCEPTION 'invoice rejected (currency): the currency is an ISO 4217 code' USING ERRCODE = '22023'; END IF;
  IF p_total IS NULL OR p_total < 0 THEN RAISE EXCEPTION 'invoice rejected (total): the total is at or above 0' USING ERRCODE = '22023'; END IF;
  IF jsonb_typeof(p_lines) IS DISTINCT FROM 'array' OR jsonb_array_length(p_lines) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'invoice rejected (lines): an invoice has 1 to 200 lines' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM commercial.invoices x WHERE x.tenant_id = p_tenant AND x.invoice_ref = btrim(p_invoice_ref)) THEN
    RAISE EXCEPTION 'invoice rejected (duplicate): invoice % of this tenant is already imported', btrim(p_invoice_ref) USING ERRCODE = '23505';
  END IF;
  v_digest := encode(sha256(convert_to(jsonb_build_object('tenant', p_tenant, 'ref', btrim(p_invoice_ref), 'from', p_period_start, 'to', p_period_end, 'currency', p_currency, 'total', p_total,
                                                          'issuer', btrim(p_issuer), 'lines', p_lines)::text, 'UTF8')), 'hex');
  INSERT INTO commercial.invoices (invoice_id, tenant_id, invoice_ref, period_start, period_end, currency, total, issuer, synthetic, digest, imported_by, correlation_id)
  VALUES (p_invoice_id, p_tenant, btrim(p_invoice_ref), p_period_start, p_period_end, p_currency, p_total, btrim(p_issuer), true, v_digest, p_actor, p_correlation)
  RETURNING * INTO i;
  FOR l IN SELECT x FROM jsonb_array_elements(p_lines) x LOOP
    n := n + 1;
    IF jsonb_typeof(l) <> 'object' OR NOT (coalesce(l ->> 'dimension', '') = ANY (ARRAY['model_inference', 'source_consumption', 'storage', 'simulation_compute', 'product_consumption']))
       OR length(btrim(coalesce(l ->> 'unit', ''))) NOT BETWEEN 1 AND 40 OR jsonb_typeof(l -> 'quantity') IS DISTINCT FROM 'number' OR jsonb_typeof(l -> 'amount') IS DISTINCT FROM 'number'
       OR (l ->> 'quantity')::numeric < 0 OR (l ->> 'amount')::numeric < 0 OR round((l ->> 'amount')::numeric, 2) <> (l ->> 'amount')::numeric THEN
      RAISE EXCEPTION 'invoice rejected (lines): line % names a dimension, a unit, a quantity at or above 0 and an amount at or above 0 in cents', n USING ERRCODE = '22023';
    END IF;
    v_sum := v_sum + (l ->> 'amount')::numeric;
    INSERT INTO commercial.invoice_lines (invoice_id, line_no, tenant_id, dimension, unit, quantity, amount, description)
    VALUES (p_invoice_id, n, p_tenant, l ->> 'dimension', btrim(l ->> 'unit'), (l ->> 'quantity')::numeric, (l ->> 'amount')::numeric, left(nullif(btrim(l ->> 'description'), ''), 400));
  END LOOP;
  IF v_sum <> p_total THEN RAISE EXCEPTION 'invoice rejected (total): the lines sum to %, the total is %', v_sum, p_total USING ERRCODE = '22023'; END IF;
  RETURN to_jsonb(i) || jsonb_build_object('lines', (SELECT jsonb_agg(to_jsonb(x) ORDER BY x.line_no) FROM commercial.invoice_lines x WHERE x.invoice_id = p_invoice_id));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION commercial.import_invoice(uuid, uuid, text, date, date, text, numeric, text, boolean, jsonb, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION commercial.import_invoice(uuid, uuid, text, date, date, text, numeric, text, boolean, jsonb, uuid, uuid) TO eye_commit;

/* RECONCILE AN INVOICE (commercial.invoice.reconcile — the commercial authority, human-gated; V10-T-016, IA-70-002): per dimension, the
   invoice's quantity and amount against the ledger's (the tenant's cost entries in the invoice's currency that occurred in its period),
   with the differences; a line is within tolerance when |amount difference| ≤ the tolerance AND no usage of that dimension in the period is
   unpriced. The outcome is `matched` only when every line is — never inferred: unpriced usage, entries in another currency, or a dimension
   on one side only are differences. Each reconciliation is a new version; the earlier ones stand. */
CREATE OR REPLACE FUNCTION commercial.reconcile_invoice(p_reconciliation_id uuid, p_invoice_id uuid, p_tolerance numeric, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = commercial, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE i commercial.invoices%ROWTYPE; v_from timestamptz; v_to timestamptz; v_lines jsonb; v_tol numeric := coalesce(p_tolerance, 0.01); v_outcome text; v_version int; r commercial.reconciliations%ROWTYPE;
        v_other int; v_totals jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['commercial.invoice.reconcile']);
  PERFORM commercial.cle_assert_actor('reconciliation', p_actor);
  PERFORM commercial.cle_assert_commercial_authority('reconciliation', p_actor);
  SELECT * INTO i FROM commercial.invoices x WHERE x.invoice_id = p_invoice_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'reconciliation rejected (unknown_invoice): % is not an imported invoice', p_invoice_id USING ERRCODE = '23503'; END IF;
  IF v_tol < 0 OR v_tol > 1000000 THEN RAISE EXCEPTION 'reconciliation rejected (tolerance): the tolerance is an amount in [0, 1000000]' USING ERRCODE = '22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('cle_recon:' || p_invoice_id::text));
  v_from := i.period_start::timestamp AT TIME ZONE 'UTC'; v_to := (i.period_end + 1)::timestamp AT TIME ZONE 'UTC';
  WITH inv AS (SELECT l.dimension, sum(l.quantity) q, sum(l.amount) a FROM commercial.invoice_lines l WHERE l.invoice_id = i.invoice_id GROUP BY l.dimension),
       led AS (SELECT c.dimension, sum(c.quantity) q, sum(c.amount) a FROM commercial.cost_entries c
                WHERE c.tenant_id = i.tenant_id AND c.currency = i.currency AND c.occurred_at >= v_from AND c.occurred_at < v_to GROUP BY c.dimension),
       unp AS (SELECT u.dimension, count(*) n FROM commercial.usage_records u
                WHERE u.tenant_id = i.tenant_id AND u.occurred_at >= v_from AND u.occurred_at < v_to AND NOT EXISTS (SELECT 1 FROM commercial.cost_entries c WHERE c.usage_id = u.usage_id) GROUP BY u.dimension),
       dims AS (SELECT dimension FROM inv UNION SELECT dimension FROM led UNION SELECT dimension FROM unp)
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'dimension', d.dimension,
           'invoice_quantity', coalesce(inv.q, 0), 'ledger_quantity', coalesce(led.q, 0), 'quantity_difference', coalesce(inv.q, 0) - coalesce(led.q, 0),
           'invoice_amount', coalesce(inv.a, 0), 'ledger_amount', round(coalesce(led.a, 0), 6), 'amount_difference', round(coalesce(inv.a, 0) - coalesce(led.a, 0), 6),
           'unpriced_usage', coalesce(unp.n, 0),
           'on_invoice', inv.dimension IS NOT NULL, 'in_ledger', led.dimension IS NOT NULL,
           'within_tolerance', abs(coalesce(inv.a, 0) - coalesce(led.a, 0)) <= v_tol AND coalesce(unp.n, 0) = 0)
           ORDER BY d.dimension), '[]'::jsonb)
    INTO v_lines
    FROM dims d LEFT JOIN inv ON inv.dimension = d.dimension LEFT JOIN led ON led.dimension = d.dimension LEFT JOIN unp ON unp.dimension = d.dimension;
  SELECT count(*) INTO v_other FROM commercial.cost_entries c WHERE c.tenant_id = i.tenant_id AND c.currency <> i.currency AND c.occurred_at >= v_from AND c.occurred_at < v_to;
  v_outcome := CASE WHEN v_other = 0 AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_lines) x WHERE (x ->> 'within_tolerance')::boolean IS NOT TRUE) THEN 'matched' ELSE 'differences' END;
  v_totals := jsonb_build_object('invoice_total', i.total, 'ledger_total', round((SELECT coalesce(sum((x ->> 'ledger_amount')::numeric), 0) FROM jsonb_array_elements(v_lines) x), 6),
                                 'difference', round(i.total - (SELECT coalesce(sum((x ->> 'ledger_amount')::numeric), 0) FROM jsonb_array_elements(v_lines) x), 6),
                                 'currency', i.currency, 'other_currency_entries', v_other, 'period_start', i.period_start, 'period_end', i.period_end, 'synthetic_invoice', i.synthetic,
                                 'rule', 'cle-reconcile@1');
  SELECT coalesce(max(x.version), 0) + 1 INTO v_version FROM commercial.reconciliations x WHERE x.invoice_id = i.invoice_id;
  INSERT INTO commercial.reconciliations (reconciliation_id, tenant_id, invoice_id, version, tolerance, outcome, lines, totals, reconciled_by, correlation_id)
  VALUES (p_reconciliation_id, i.tenant_id, i.invoice_id, v_version, v_tol, v_outcome, v_lines, v_totals, p_actor, p_correlation)
  RETURNING * INTO r;
  RETURN to_jsonb(r) || jsonb_build_object('invoice_ref', i.invoice_ref);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION commercial.reconcile_invoice(uuid, uuid, numeric, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION commercial.reconcile_invoice(uuid, uuid, numeric, uuid, uuid) TO eye_commit;

/* RECORD AN OPTIMISATION (commercial.optimisation.record — the commercial authority, human-gated; IA-70-003/-005, DP-70-003/-005): the
   decision (adopt | defer) on an economic optimisation with its TRADE-OFFS stated. Each change names a control from the declared
   ADJUSTABLE vocabulary; a change of a PROTECTED control — named as the control, or as a key anywhere in what it changes from or to — is
   REFUSED (`optimisation rejected (boundary)`): nothing is recorded as adopted and nothing applies. An unknown control is refused, never
   assumed safe. A decision records; it applies nothing by itself. */
CREATE OR REPLACE FUNCTION commercial.record_optimisation(p_decision_id uuid, p_tenant uuid, p_title text, p_decision text, p_changes jsonb, p_tradeoffs jsonb, p_expected_saving jsonb,
                                                          p_rationale text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = commercial, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE c jsonb; t jsonb; v_hit text[] := '{}'; v_keys text[]; v_controls text[] := '{}'; o commercial.optimisation_decisions%ROWTYPE; v_re text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['commercial.optimisation.record']);
  PERFORM commercial.cle_assert_actor('optimisation', p_actor);
  PERFORM commercial.cle_assert_commercial_authority('optimisation', p_actor);
  IF p_tenant IS NOT NULL AND NOT EXISTS (SELECT 1 FROM tenancy.tenants x WHERE x.id = p_tenant) THEN RAISE EXCEPTION 'optimisation rejected (unknown_tenant): % is not a tenant', p_tenant USING ERRCODE = '23503'; END IF;
  IF length(btrim(coalesce(p_title, ''))) NOT BETWEEN 4 AND 200 OR length(btrim(coalesce(p_rationale, ''))) < 8 THEN
    RAISE EXCEPTION 'optimisation rejected (rationale): an optimisation is named (4–200 characters) and states its rationale (at least 8)' USING ERRCODE = '22023';
  END IF;
  IF p_decision IS NULL OR p_decision NOT IN ('adopt', 'defer') THEN RAISE EXCEPTION 'optimisation rejected (decision): the decision is adopt or defer' USING ERRCODE = '22023'; END IF;
  IF jsonb_typeof(p_changes) IS DISTINCT FROM 'array' OR jsonb_array_length(p_changes) NOT BETWEEN 1 AND 20 THEN
    RAISE EXCEPTION 'optimisation rejected (changes): an optimisation lists 1 to 20 changes, each {control, from, to}' USING ERRCODE = '22023';
  END IF;
  v_re := '^(' || array_to_string(commercial.cle_protected_controls(), '|') || ')$';
  FOR c IN SELECT x FROM jsonb_array_elements(p_changes) x LOOP
    IF jsonb_typeof(c) <> 'object' OR length(btrim(coalesce(c ->> 'control', ''))) = 0 OR NOT (c ? 'to') THEN
      RAISE EXCEPTION 'optimisation rejected (changes): each change names its control and what it changes to' USING ERRCODE = '22023';
    END IF;
    IF lower(c ->> 'control') = ANY (commercial.cle_protected_controls()) THEN v_hit := v_hit || lower(c ->> 'control'); END IF;
    -- a protected control named as a KEY inside what the change touches (a residency move dressed as an instance resize)
    SELECT coalesce(array_agg(DISTINCT lower(k)), '{}') INTO v_keys
      FROM jsonb_path_query(jsonb_build_object('from', c -> 'from', 'to', c -> 'to'), 'lax $.** ? (@.type() == "object").keyvalue().key') k0(k0j), LATERAL (SELECT k0j #>> '{}' AS k) kk
     WHERE lower(k) ~ v_re;
    v_hit := v_hit || v_keys;
    v_controls := v_controls || lower(c ->> 'control');
  END LOOP;
  SELECT coalesce(array_agg(DISTINCT x ORDER BY x), '{}') INTO v_hit FROM unnest(v_hit) x;
  IF jsonb_typeof(p_tradeoffs) IS DISTINCT FROM 'array' OR jsonb_array_length(p_tradeoffs) < 1 THEN
    RAISE EXCEPTION 'optimisation rejected (tradeoffs): an optimisation states its trade-offs (at least one: what is given up, for what)' USING ERRCODE = '22023';
  END IF;
  FOR t IN SELECT x FROM jsonb_array_elements(p_tradeoffs) x LOOP
    IF jsonb_typeof(t) <> 'object' OR length(btrim(coalesce(t ->> 'dimension', ''))) = 0 OR length(btrim(coalesce(t ->> 'effect', ''))) < 8 THEN
      RAISE EXCEPTION 'optimisation rejected (tradeoffs): each trade-off names its dimension and its effect (at least 8 characters)' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF cardinality(v_hit) > 0 THEN
    RAISE EXCEPTION 'optimisation rejected (boundary): "%" would change % — economic optimisation never weakens residency, isolation, retention or recovery (nor sovereignty, provenance, audit, evidence, human authority, accessibility, quality, freshness, durability or resilience: IA-70-003, DP-70-003); its stated trade-offs: %; nothing is adopted or applied',
      btrim(p_title), array_to_string(v_hit, ', '), left((SELECT string_agg((x ->> 'dimension') || ': ' || (x ->> 'effect'), '; ') FROM jsonb_array_elements(p_tradeoffs) x), 600) USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(v_controls) x WHERE NOT (x = ANY (commercial.cle_adjustable_controls()))) THEN
    RAISE EXCEPTION 'optimisation rejected (control): % — an optimisation changes only declared adjustable controls (%); an unknown control is never assumed safe',
      (SELECT string_agg(x, ', ') FROM unnest(v_controls) x WHERE NOT (x = ANY (commercial.cle_adjustable_controls()))), array_to_string(commercial.cle_adjustable_controls(), ', ') USING ERRCODE = '22023';
  END IF;
  IF p_expected_saving IS NOT NULL AND jsonb_typeof(p_expected_saving) <> 'null' AND (jsonb_typeof(p_expected_saving) <> 'object' OR jsonb_typeof(p_expected_saving -> 'amount') IS DISTINCT FROM 'number'
       OR coalesce(p_expected_saving ->> 'currency', '') !~ '^[A-Z]{3}$') THEN
    RAISE EXCEPTION 'optimisation rejected (saving): an expected saving is {amount, currency}' USING ERRCODE = '22023';
  END IF;
  INSERT INTO commercial.optimisation_decisions (decision_id, scope, tenant_id, title, decision, changes, tradeoffs, expected_saving, rationale, boundary_check, decided_by, correlation_id)
  VALUES (p_decision_id, CASE WHEN p_tenant IS NULL THEN 'PLATFORM' ELSE 'TENANT' END, p_tenant, btrim(p_title), p_decision, p_changes, p_tradeoffs, nullif(p_expected_saving, 'null'::jsonb),
          btrim(p_rationale), jsonb_build_object('rule', 'cle-boundary@1', 'protected', to_jsonb(commercial.cle_protected_controls()), 'changed_controls', to_jsonb(v_controls), 'protected_touched', '[]'::jsonb, 'passed', true),
          p_actor, p_correlation)
  RETURNING * INTO o;
  RETURN to_jsonb(o);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION commercial.record_optimisation(uuid, uuid, text, text, jsonb, jsonb, jsonb, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION commercial.record_optimisation(uuid, uuid, text, text, jsonb, jsonb, jsonb, text, uuid, uuid) TO eye_commit;

/* THE TICK STEP commercial-ledger (executive.attention.tick — the domain's active attention agent): (1) PRICE every usage record of the
   tenant visible to this domain's tick (this domain's, and the tenant-level ones) not yet priced, at the rate-card version in force at its
   occurred_at — a domain usage is one DIRECT entry; a tenant-level usage is ALLOCATED by the key in force (one entry per share) or kept
   UNALLOCATED; usage with no rate in force stays UNPRICED (counted, never zero); (2) the BUDGET THRESHOLDS (each declared percentage
   reached in the current period, once per budget version and period) and (3) the ANOMALY (cle-anomaly@1: today's spend > k × the mean
   daily spend of the previous window_days days, the mean > 0; once per budget and day) of every current budget of the tenant visible here
   — each recorded in budget_events and RAISED as a commercial.usage item to the budget's owner. Default-off: with no usage, no rate card
   and no budget, it writes nothing. Pricing is idempotent per usage record (unique (usage_id, line)). */
CREATE OR REPLACE FUNCTION commercial.ledger_tick(p_tenant uuid, p_domain uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = commercial, observation, executive, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_now timestamptz := clock_timestamp(); u commercial.usage_records%ROWTYPE; r commercial.rate_cards%ROWTYPE; k commercial.allocation_keys%ROWTYPE; s record;
        v_priced int := 0; v_lines int := 0; v_n int; v_unpriced jsonb := '{}'::jsonb; v_key text; b commercial.budgets%ROWTYPE; v_var jsonb; t int; v_ev uuid; v_item uuid;
        v_thr jsonb := '[]'::jsonb; v_anom jsonb := '[]'::jsonb; v_today date := (v_now AT TIME ZONE 'UTC')::date; v_today_spend numeric; v_trailing numeric; v_kk numeric; v_w int;
        v_product uuid; v_consumer uuid; v_budgets int := 0; v_noted jsonb := '[]'::jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.attention.tick']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM commercial.cle_assert_actor('ledger tick', p_actor);
  IF NOT EXISTS (SELECT 1 FROM executive.agents a WHERE a.principal_id = p_actor AND a.tenant_id = p_tenant AND a.domain_id = p_domain AND a.agent_kind = 'attention' AND a.status = 'active') THEN
    RAISE EXCEPTION 'ledger tick rejected (authority): the ledger is priced by the domain''s active attention agent' USING ERRCODE = '42501';
  END IF;
  -- (1) PRICE
  FOR u IN SELECT x.* FROM commercial.usage_records x
            WHERE x.tenant_id = p_tenant AND (x.domain_id = p_domain OR x.domain_id IS NULL) AND x.occurred_at <= v_now
              AND NOT EXISTS (SELECT 1 FROM commercial.cost_entries c WHERE c.usage_id = x.usage_id)
            ORDER BY x.occurred_at, x.usage_id LIMIT 5000 LOOP
    r := commercial.cle_rate_at(u.dimension, u.unit, u.occurred_at);
    IF r.rate_card_id IS NULL THEN
      v_key := u.dimension || ':' || u.unit;
      v_unpriced := jsonb_set(v_unpriced, ARRAY[v_key], to_jsonb(coalesce((v_unpriced ->> v_key)::int, 0) + 1));
      CONTINUE;
    END IF;
    v_product := CASE WHEN coalesce(u.details ->> 'product_id', '') ~ '^[0-9a-f-]{36}$' THEN (u.details ->> 'product_id')::uuid END;
    v_consumer := CASE WHEN coalesce(u.details ->> 'consumer_principal_id', '') ~ '^[0-9a-f-]{36}$' THEN (u.details ->> 'consumer_principal_id')::uuid END;
    k := NULL;
    IF u.domain_id IS NULL THEN k := commercial.cle_allocation_at(u.tenant_id, u.dimension, u.occurred_at); END IF;
    IF u.domain_id IS NOT NULL OR k.allocation_key_id IS NULL THEN
      INSERT INTO commercial.cost_entries (entry_id, usage_id, line, scope, tenant_id, domain_id, product_id, consumer_principal_id, capability_key, dimension, unit, asset_ref, profile,
                                           quantity, share, allocation, allocation_key_id, allocation_version, rate_card_id, rate_key, rate_version, price_per_unit, currency, amount,
                                           energy_kwh, energy_label, occurred_at, priced_by, correlation_id)
      VALUES (gen_random_uuid(), u.usage_id, 0, u.scope, u.tenant_id, u.domain_id, v_product, v_consumer, u.capability_key, u.dimension, u.unit,
              coalesce(nullif(u.details ->> 'asset', ''), u.source_kind), u.profile, u.quantity, 1, CASE WHEN u.domain_id IS NULL THEN 'unallocated' ELSE 'direct' END, NULL, NULL,
              r.rate_card_id, r.rate_key, r.version, r.price_per_unit, r.currency, u.quantity * r.price_per_unit,
              CASE WHEN r.energy_kwh_per_unit IS NOT NULL THEN u.quantity * r.energy_kwh_per_unit END, r.energy_label, u.occurred_at, p_actor, p_correlation)
      ON CONFLICT (usage_id, line) DO NOTHING;
      GET DIAGNOSTICS v_n = ROW_COUNT;
    ELSE
      INSERT INTO commercial.cost_entries (entry_id, usage_id, line, scope, tenant_id, domain_id, product_id, consumer_principal_id, capability_key, dimension, unit, asset_ref, profile,
                                           quantity, share, allocation, allocation_key_id, allocation_version, rate_card_id, rate_key, rate_version, price_per_unit, currency, amount,
                                           energy_kwh, energy_label, occurred_at, priced_by, correlation_id)
      SELECT gen_random_uuid(), u.usage_id, (sh.ord - 1)::int, 'DOMAIN', u.tenant_id, (sh.v ->> 'domain_id')::uuid,
             coalesce(nullif(sh.v ->> 'product_id', '')::uuid, v_product), coalesce(nullif(sh.v ->> 'consumer_principal_id', '')::uuid, v_consumer),
             u.capability_key, u.dimension, u.unit, coalesce(nullif(u.details ->> 'asset', ''), u.source_kind), u.profile,
             u.quantity * (sh.v ->> 'weight')::numeric, (sh.v ->> 'weight')::numeric, 'allocated', k.allocation_key_id, k.version,
             r.rate_card_id, r.rate_key, r.version, r.price_per_unit, r.currency, u.quantity * (sh.v ->> 'weight')::numeric * r.price_per_unit,
             CASE WHEN r.energy_kwh_per_unit IS NOT NULL THEN u.quantity * (sh.v ->> 'weight')::numeric * r.energy_kwh_per_unit END, r.energy_label, u.occurred_at, p_actor, p_correlation
        FROM jsonb_array_elements(k.shares) WITH ORDINALITY sh(v, ord)
      ON CONFLICT (usage_id, line) DO NOTHING;
      GET DIAGNOSTICS v_n = ROW_COUNT;
    END IF;
    IF v_n > 0 THEN v_priced := v_priced + 1; v_lines := v_lines + v_n; END IF;
  END LOOP;
  -- (2) THRESHOLDS and (3) ANOMALY, on every current budget of the tenant this domain's tick sees (its own domain's and the tenant's)
  FOR b IN SELECT DISTINCT ON (x.budget_id) x.* FROM commercial.budgets x
            WHERE x.tenant_id = p_tenant AND (x.domain_id IS NULL OR x.domain_id = p_domain) ORDER BY x.budget_id, x.version DESC LOOP
    v_budgets := v_budgets + 1;
    v_var := commercial.cle_variance(b, v_now);
    FOREACH t IN ARRAY b.thresholds LOOP
      CONTINUE WHEN (v_var ->> 'pct')::numeric < t;
      v_ev := gen_random_uuid(); v_item := gen_random_uuid();
      INSERT INTO commercial.budget_events (event_id, scope, tenant_id, domain_id, budget_id, budget_version, event, period_start, threshold, raised_in_domain, attention_item_id, details, actor_principal_id, correlation_id)
      VALUES (v_ev, b.scope, b.tenant_id, b.domain_id, b.budget_id, b.version, 'threshold', (v_var ->> 'period_start')::date, t, p_domain, v_item,
              jsonb_build_object('spent', v_var -> 'spent', 'amount', b.amount, 'currency', b.currency, 'pct', v_var -> 'pct', 'forecast', v_var -> 'forecast',
                                 'unpriced_usage', v_var -> 'unpriced_usage', 'complete', v_var -> 'complete', 'period_end', v_var -> 'period_end', 'by', 'tick'),
              p_actor, p_correlation)
      ON CONFLICT DO NOTHING;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      IF v_n > 0 THEN
        PERFORM commercial.cle_notify(v_item, b, p_domain,
          format('Budget %s%% reached: %s — %s of %s %s spent this %s (forecast %s %s by %s)', t, b.label, round((v_var ->> 'spent')::numeric, 2), b.amount, b.currency, b.period_kind,
                 round((v_var ->> 'forecast')::numeric, 2), b.currency, v_var ->> 'period_end'),
          jsonb_build_array(format('%s%% of the %s budget is spent (threshold %s%%)', v_var ->> 'pct', b.period_kind, t),
                            CASE WHEN (v_var ->> 'complete')::boolean THEN 'every usage of the period is priced' ELSE format('%s usage record(s) of the period are UNPRICED (no rate in force): the spend is a floor, not complete', v_var ->> 'unpriced_usage') END,
                            'a budget raises; it never stops or deletes work'),
          v_ev, 'budget.threshold', jsonb_build_object('kind', 'threshold', 'threshold', t, 'variance', v_var), p_actor, p_correlation);
        v_thr := v_thr || jsonb_build_object('budget_id', b.budget_id, 'threshold', t, 'pct', v_var -> 'pct', 'event_id', v_ev, 'attention_item_id', v_item);
      END IF;
    END LOOP;
    -- the anomaly rule (cle-anomaly@1)
    v_kk := (b.anomaly_rule ->> 'k')::numeric; v_w := (b.anomaly_rule ->> 'window_days')::int;
    SELECT coalesce(sum(c.amount) FILTER (WHERE (c.occurred_at AT TIME ZONE 'UTC')::date = v_today), 0),
           coalesce(sum(c.amount) FILTER (WHERE (c.occurred_at AT TIME ZONE 'UTC')::date >= v_today - v_w AND (c.occurred_at AT TIME ZONE 'UTC')::date < v_today), 0) / v_w
      INTO v_today_spend, v_trailing
      FROM commercial.cost_entries c
     WHERE c.tenant_id = b.tenant_id AND (b.domain_id IS NULL OR c.domain_id = b.domain_id) AND (b.capability_key = 'all' OR c.capability_key = b.capability_key) AND c.currency = b.currency
       AND c.occurred_at >= ((v_today - v_w)::timestamp AT TIME ZONE 'UTC') AND c.occurred_at < ((v_today + 1)::timestamp AT TIME ZONE 'UTC');
    IF v_trailing > 0 AND v_today_spend > v_kk * v_trailing THEN
      v_ev := gen_random_uuid(); v_item := gen_random_uuid();
      INSERT INTO commercial.budget_events (event_id, scope, tenant_id, domain_id, budget_id, budget_version, event, day, raised_in_domain, attention_item_id, details, actor_principal_id, correlation_id)
      VALUES (v_ev, b.scope, b.tenant_id, b.domain_id, b.budget_id, b.version, 'anomaly', v_today, p_domain, v_item,
              jsonb_build_object('rule', 'cle-anomaly@1', 'today_spend', round(v_today_spend, 6), 'trailing_mean', round(v_trailing, 6), 'k', v_kk, 'window_days', v_w,
                                 'ratio', round(v_today_spend / v_trailing, 4), 'currency', b.currency, 'by', 'tick'),
              p_actor, p_correlation)
      ON CONFLICT DO NOTHING;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      IF v_n > 0 THEN
        PERFORM commercial.cle_notify(v_item, b, p_domain,
          format('Spend anomaly: %s — %s %s today, %s× the %s-day mean of %s %s', b.label, round(v_today_spend, 2), b.currency, round(v_today_spend / v_trailing, 1), v_w, round(v_trailing, 2), b.currency),
          jsonb_build_array(format('today''s spend %s exceeds %s × the trailing mean %s (cle-anomaly@1)', round(v_today_spend, 2), v_kk, round(v_trailing, 2)),
                            'a budget raises; it never stops or deletes work'),
          v_ev, 'budget.anomaly', jsonb_build_object('kind', 'anomaly', 'today_spend', round(v_today_spend, 6), 'trailing_mean', round(v_trailing, 6), 'k', v_kk, 'window_days', v_w), p_actor, p_correlation);
        v_anom := v_anom || jsonb_build_object('budget_id', b.budget_id, 'day', v_today, 'today_spend', round(v_today_spend, 6), 'trailing_mean', round(v_trailing, 6), 'event_id', v_ev, 'attention_item_id', v_item);
      END IF;
    ELSIF v_trailing = 0 AND v_today_spend > 0 THEN
      v_noted := v_noted || jsonb_build_object('budget_id', b.budget_id, 'anomaly', 'no_baseline', 'note', format('no spend in the previous %s days: the anomaly rule has no baseline and is not applied', v_w));
    END IF;
  END LOOP;
  RETURN jsonb_build_object('priced_usage', v_priced, 'cost_lines', v_lines, 'unpriced', v_unpriced, 'budgets_evaluated', v_budgets, 'thresholds', v_thr, 'anomalies', v_anom, 'notes', v_noted, 'as_of', v_now);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION commercial.ledger_tick(uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION commercial.ledger_tick(uuid, uuid, uuid, uuid) TO eye_commit;

-- ─────────────────────────────────────────────────────────────────────
-- §LE.4 THE READS
-- ─────────────────────────────────────────────────────────────────────
/* THE BUDGET VARIANCE (a guarded definer: the budget is read within its own scope — the tenant, a domain for its own and the tenant's
   budgets, as the budgets table's row security reads; N-01's rule): the current version's cle-variance@1 at the database's instant. */
CREATE OR REPLACE FUNCTION commercial.budget_variance(p_tenant uuid, p_budget_id uuid) RETURNS jsonb
STABLE SECURITY DEFINER SET search_path = commercial, observation, public, pg_catalog, pg_temp AS $$
DECLARE b commercial.budgets%ROWTYPE;
BEGIN
  b := commercial.cle_budget_current(p_budget_id);
  IF b.budget_id IS NULL OR b.tenant_id IS DISTINCT FROM p_tenant THEN RETURN NULL; END IF;
  IF b.domain_id IS NULL THEN
    -- a tenant-level budget is visible to its tenant and to each of the tenant's domains (the table's own policy)
    IF NOT (public.eye_tenant() = p_tenant AND public.eye_scope() IN ('TENANT', 'DOMAIN')) THEN PERFORM observation.assert_read_scope(p_tenant, NULL, 'a budget''s variance'); END IF;
  ELSE
    PERFORM observation.assert_read_scope(p_tenant, b.domain_id, 'a budget''s variance');
  END IF;
  RETURN commercial.cle_variance(b, clock_timestamp());
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION commercial.budget_variance(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION commercial.budget_variance(uuid, uuid) TO eye_app, eye_commit;

/* UNIT DATA COST (DQM-040): cost per governed unit — per asset (the usage's declared asset, else its source kind) + tenant + deployment
   profile + product + consumer + window — with the quantity, the unit and the entries. INVOKER: the caller's row security decides. */
CREATE OR REPLACE FUNCTION commercial.unit_data_cost(p_tenant uuid, p_from timestamptz, p_to timestamptz)
RETURNS TABLE (asset_ref text, tenant_id uuid, profile text, product_id uuid, consumer_principal_id uuid, dimension text, unit text, currency text,
               quantity numeric, amount numeric, unit_cost numeric, entries bigint, window_from timestamptz, window_to timestamptz)
LANGUAGE sql STABLE SET search_path = commercial, pg_catalog, pg_temp AS $$
  SELECT c.asset_ref, c.tenant_id, c.profile, c.product_id, c.consumer_principal_id, c.dimension, c.unit, c.currency,
         sum(c.quantity), round(sum(c.amount), 6), CASE WHEN sum(c.quantity) > 0 THEN round(sum(c.amount) / sum(c.quantity), 8) END, count(*), p_from, p_to
    FROM commercial.cost_entries c
   WHERE c.tenant_id = p_tenant AND c.occurred_at >= p_from AND c.occurred_at < p_to
   GROUP BY c.asset_ref, c.tenant_id, c.profile, c.product_id, c.consumer_principal_id, c.dimension, c.unit, c.currency
   ORDER BY c.dimension, c.asset_ref, c.product_id NULLS FIRST, c.consumer_principal_id NULLS FIRST
$$;
REVOKE ALL ON FUNCTION commercial.unit_data_cost(uuid, timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION commercial.unit_data_cost(uuid, timestamptz, timestamptz) TO eye_app, eye_commit;

/* THE ENERGY ESTIMATE (IA-70-001's energy visibility, an ESTIMATE): kWh per dimension in a window from the rate cards' coefficients; the
   entries priced under a card WITHOUT a coefficient are counted as not estimated — never as zero. INVOKER: row security decides. */
CREATE OR REPLACE FUNCTION commercial.energy_estimate(p_tenant uuid, p_from timestamptz, p_to timestamptz)
RETURNS TABLE (dimension text, unit text, quantity numeric, energy_kwh numeric, entries_estimated bigint, entries_not_estimated bigint, label text, bases text[])
LANGUAGE sql STABLE SET search_path = commercial, pg_catalog, pg_temp AS $$
  SELECT c.dimension, c.unit, sum(c.quantity), round(sum(c.energy_kwh), 6), count(*) FILTER (WHERE c.energy_kwh IS NOT NULL), count(*) FILTER (WHERE c.energy_kwh IS NULL), 'ESTIMATE',
         (SELECT array_agg(DISTINCT r.energy_basis) FROM commercial.rate_cards r WHERE r.rate_card_id = ANY (array_agg(c.rate_card_id)) AND r.energy_basis IS NOT NULL)
    FROM commercial.cost_entries c
   WHERE c.tenant_id = p_tenant AND c.occurred_at >= p_from AND c.occurred_at < p_to
   GROUP BY c.dimension, c.unit
   ORDER BY c.dimension, c.unit
$$;
REVOKE ALL ON FUNCTION commercial.energy_estimate(uuid, timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION commercial.energy_estimate(uuid, timestamptz, timestamptz) TO eye_app, eye_commit;

/* THE UNPRICED USAGE COUNTS for the commercial authority (a guarded definer, PLATFORM only): the prelude's usage isolation gives the vendor no
   row of a tenant's usage, so its view of a tenant's ledger could not otherwise say what is still UNPRICED — and a view that cannot see the
   gap must not claim completeness. Counts per dimension × unit only; no usage row leaves. The tenant's own contexts read the rows under RLS. */
CREATE OR REPLACE FUNCTION commercial.unpriced_usage_counts(p_tenant uuid, p_from timestamptz, p_to timestamptz)
RETURNS TABLE (dimension text, unit text, usage_records int)
STABLE SECURITY DEFINER SET search_path = commercial, public, pg_catalog, pg_temp AS $$
BEGIN
  IF public.eye_scope() IS DISTINCT FROM 'PLATFORM' THEN
    RAISE EXCEPTION 'read rejected (scope): the unpriced usage counts are the commercial authority''s (platform scope); a tenant reads its own usage' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT u.dimension, u.unit, count(*)::int FROM commercial.usage_records u
    WHERE u.tenant_id = p_tenant AND u.occurred_at >= p_from AND u.occurred_at < p_to AND NOT EXISTS (SELECT 1 FROM commercial.cost_entries c WHERE c.usage_id = u.usage_id)
    GROUP BY u.dimension, u.unit ORDER BY u.dimension, u.unit;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION commercial.unpriced_usage_counts(uuid, timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION commercial.unpriced_usage_counts(uuid, timestamptz, timestamptz) TO eye_app, eye_commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §ME — METERS: the recording points, the B90 usage counters, caps, breaches and admission enforcement
-- (built as the part `meters` on its own worktree; folded here in apply order §EN, §GR, §LE, §ME)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- ═════════════════════════════════════════════════════════════════════
-- section `meters` (§ME) — CP-6 B91 part `meters` (F-P7-F-02: the meters per tenant, capability and profile; caps; B90's carryover)
-- ═════════════════════════════════════════════════════════════════════
-- THE METERS. Every recording point writes commercial.usage_records ONLY (the prelude's append-only table), through ONE internal writer
-- (commercial.cme_record) that is idempotent on the table's unique key (tenant, dimension, source_kind, source_ref): a recording point that
-- fires twice for the same source records once. NO existing event list changes; no existing table gains a column. The recording points:
--   model_inference    AFTER INSERT ON intelligence.gateway_calls — one CALL per gateway call (unit calls; the latency, the mode, the model
--                      and the outcome in the details). NO TOKEN COUNT EXISTS: the gateway records no tokens and no cost today (0023), so
--                      inference is metered in calls; a replayed call is metered as a call with its mode `replay` stated.
--   source_consumption AFTER INSERT ON observation.collection_run_events — a terminal event that carries the run's spent budget
--                      (run.finished: details.budget_spent) records the run's REQUESTS (unit requests) and its BYTES (unit bytes, its own
--                      source kind collection_run_bytes). A run.budget_exceeded / run.failed event carries no spent figures today and
--                      is not metered (stated).
--   simulation_compute AFTER UPDATE ON simulation.experiment_chunks — every recorded chunk ATTEMPT (finished_at newly set; done or failed)
--                      records its wall ms (unit wall_ms; the paths and the attempt in the details); AFTER UPDATE ON
--                      simulation.runs_current — a run COMPLETED from opened with its resource records resource.elapsed_ms, unless the
--                      run is an experiment's (its chunks are already metered: never twice); the B30 ENVELOPE SWEEP — its route measures
--                      the sweep's wall ms and records it through the port commercial.record_usage (the sweep table records none).
--   storage            the tick step `commercial-storage-sample` (order 80) — the domain's EVIDENCE bytes (hot and archive tiers of the
--                      evidence vault, tombstoned blobs excluded), measured BY THE PORT (commercial.record_usage, source kind
--                      storage_sample) once per domain per hour of the database's clock. A gauge: a cap compares the latest sample.
--   product_consumption (B90's CARRYOVER) — AFTER INSERT ON products.metric_servings (unit servings) and ON products.subscription_catchups
--                      (unit events: the batch served), and products.read_subscription_events RE-DECLARED (copied whole from 0096; its
--                      plain read writes no row any trigger could see — the only way the read path is reached in the database); each
--                      also INCREMENTS products.product_consumers.usage of the live registration (product, consumer) when one exists
--                      (no registration: the usage record alone — the register is the consumer's own act, never created here).
-- THE CAPS: commercial.caps — per tenant (or one of its domains) × dimension × unit × period (day | month, UTC calendar), a limit and an
-- action stop | warn, VERSIONED (a new version supersedes the live one); set by the tenant's ADMINISTRATOR (a named human holding
-- tenant_admin; never an agent) within the licence's limits (the prelude's commercial.licences: a cap above the latest licence version's
-- limit for the dimension is refused; an UNCONTRACTED tenant has no licence and its cap is bounded by nothing but itself). `stop` is admitted
-- only where an ADMISSION point enforces it — simulation_compute (the experiment chunk claim and the envelope sweep route); every other
-- dimension's cap is `warn` (model_inference above all: a stop at the gateway would refuse an extraction mid-run). commercial.cap_breaches —
-- the ledger: `crossed` (the meter reached the cap in its period: once per cap version and period, commercial.usage raised) and `refused`
-- (new work stopped at admission, commercial.usage raised). THE BOUNDARY: a cap stops NEW work; it never deletes work — an experiment it
-- stops ends PARTIAL with its completed paths kept (or failed when none completed), recorded and explained; a sweep it refuses never ran.
-- No cap set → nothing changes (the claim and the sweep behave exactly as before).

-- §ME.1 THE TABLES ─────────────────────────────────────────────────────
CREATE TABLE commercial.caps (
  cap_id          uuid NOT NULL,
  version         int  NOT NULL CHECK (version >= 1),
  scope           text NOT NULL CHECK (scope IN ('TENANT', 'DOMAIN')),
  tenant_id       uuid NOT NULL REFERENCES tenancy.tenants(id),
  domain_id       uuid NULL,
  dimension       text NOT NULL CHECK (dimension IN ('model_inference', 'source_consumption', 'storage', 'simulation_compute', 'product_consumption')),
  unit            text NOT NULL CHECK (unit IN ('calls', 'requests', 'bytes', 'wall_ms', 'events', 'servings')),
  period          text NOT NULL CHECK (period IN ('day', 'month')),
  cap_limit       numeric NOT NULL CHECK (cap_limit > 0),
  action          text NOT NULL CHECK (action IN ('stop', 'warn')),
  state           text NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'superseded')),
  licence_id      uuid NULL,
  licence_version int  NULL,
  licence_limit   numeric NULL,
  reason          text NOT NULL CHECK (length(btrim(reason)) BETWEEN 8 AND 1000),
  set_by          uuid NOT NULL,
  set_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  superseded_at   timestamptz NULL,
  correlation_id  uuid NOT NULL,
  PRIMARY KEY (cap_id, version),
  CHECK ((scope = 'TENANT') = (domain_id IS NULL)),
  CHECK ((state = 'superseded') = (superseded_at IS NOT NULL)),
  CHECK (action = 'warn' OR dimension = 'simulation_compute'),
  CHECK ((licence_id IS NULL) = (licence_version IS NULL))
);
CREATE UNIQUE INDEX cme_caps_live_once ON commercial.caps (tenant_id, coalesce(domain_id, '00000000-0000-0000-0000-000000000000'::uuid), dimension, unit, period) WHERE state = 'active';
CREATE INDEX cme_caps_tenant ON commercial.caps (tenant_id, dimension, unit, state);
COMMENT ON TABLE commercial.caps IS 'B91 §ME (0105): usage caps per tenant (or domain) × dimension × unit × period, a limit and stop|warn, versioned; set by the tenant administrator within the licence''s limits. A cap stops NEW work at admission; it never deletes work.';

CREATE TABLE commercial.cap_breaches (
  breach_id       uuid PRIMARY KEY,
  scope           text NOT NULL CHECK (scope IN ('TENANT', 'DOMAIN')),
  tenant_id       uuid NOT NULL REFERENCES tenancy.tenants(id),
  domain_id       uuid NULL,
  cap_id          uuid NOT NULL,
  cap_version     int  NOT NULL,
  dimension       text NOT NULL,
  unit            text NOT NULL,
  period          text NOT NULL,
  period_start    timestamptz NOT NULL,
  kind            text NOT NULL CHECK (kind IN ('crossed', 'refused')),
  action          text NOT NULL CHECK (action IN ('stop', 'warn')),
  cap_limit       numeric NOT NULL,
  used            numeric NOT NULL,
  subject_kind    text NOT NULL CHECK (subject_kind IN ('meter', 'experiment', 'envelope_sweep')),
  subject_id      uuid NULL,
  source_ref      text NULL,
  attention_item_id uuid NULL,
  details         jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
  actor_principal_id uuid NULL,
  occurred_at     timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id  uuid NULL,
  CHECK ((scope = 'TENANT') = (domain_id IS NULL)),
  FOREIGN KEY (cap_id, cap_version) REFERENCES commercial.caps (cap_id, version)
);
CREATE UNIQUE INDEX cme_breach_crossed_once ON commercial.cap_breaches (cap_id, cap_version, period_start) WHERE kind = 'crossed';
CREATE INDEX cme_breach_tenant ON commercial.cap_breaches (tenant_id, occurred_at DESC);
CREATE TRIGGER cme_breach_append_only BEFORE UPDATE OR DELETE ON commercial.cap_breaches FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE commercial.cap_breaches IS 'B91 §ME (0105): the cap ledger — crossed (the meter reached the cap in its period; once per cap version and period) and refused (new work stopped at admission: an experiment ended partial, a sweep never ran). Append-only.';

/* A cap version is immutable but for its retirement by the next version (active → superseded, once); never deleted. */
CREATE OR REPLACE FUNCTION commercial.cme_caps_forward() RETURNS trigger
LANGUAGE plpgsql SET search_path = commercial, pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'usage cap rejected (state): a cap version is never deleted' USING ERRCODE = '2F002'; END IF;
  IF OLD.state <> 'active' OR NEW.state <> 'superseded' OR NEW.superseded_at IS NULL
     OR (to_jsonb(NEW) - 'state' - 'superseded_at') IS DISTINCT FROM (to_jsonb(OLD) - 'state' - 'superseded_at') THEN
    RAISE EXCEPTION 'usage cap rejected (state): a cap version changes only by its supersession (active → superseded)' USING ERRCODE = '2F002';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER cme_caps_forward BEFORE UPDATE OR DELETE ON commercial.caps FOR EACH ROW EXECUTE FUNCTION commercial.cme_caps_forward();

-- RLS (the prelude's commercial_isolation text, verbatim: a domain reader sees its domain's rows and the tenant's own); the ports write.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['caps', 'cap_breaches'] LOOP
    EXECUTE format('REVOKE ALL ON commercial.%I FROM PUBLIC', t);
    EXECUTE format('ALTER TABLE commercial.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE commercial.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY commercial_isolation ON commercial.%I
        USING (tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR domain_id IS NULL OR domain_id = public.eye_domain()))$f$, t);
    EXECUTE format('GRANT SELECT ON commercial.%I TO eye_app, eye_commit', t);
  END LOOP;
END $$;

-- §ME.2 THE VOCABULARY AND THE INTERNAL HELPERS (not granted: called by the triggers and the ports only) ───────────
/* The units a dimension is metered in (the first is its primary unit — a licence limit given as a bare number is in it). */
CREATE OR REPLACE FUNCTION commercial.cme_units(p_dimension text) RETURNS text[]
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_dimension WHEN 'model_inference' THEN ARRAY['calls'] WHEN 'source_consumption' THEN ARRAY['requests', 'bytes'] WHEN 'simulation_compute' THEN ARRAY['wall_ms']
                          WHEN 'storage' THEN ARRAY['bytes'] WHEN 'product_consumption' THEN ARRAY['events', 'servings'] END
$$;
/* The capability a dimension is metered against (§EN's catalogue keys are the integrator's seam; these are the meter's own labels). */
CREATE OR REPLACE FUNCTION commercial.cme_capability(p_dimension text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  -- the catalogue's keys (§EN): the gateway is model_portfolio's, collection observation's, compute simulation's, storage the capacity
  -- entitlement's, product consumption advanced_integration's (products.*)
  SELECT CASE p_dimension WHEN 'model_inference' THEN 'model_portfolio' WHEN 'source_consumption' THEN 'observation' WHEN 'simulation_compute' THEN 'simulation'
                          WHEN 'storage' THEN 'capacity' WHEN 'product_consumption' THEN 'advanced_integration' END
$$;
/* The start of the period an instant falls in (the UTC calendar day or month). */
CREATE OR REPLACE FUNCTION commercial.cme_period_start(p_period text, p_at timestamptz) RETURNS timestamptz
LANGUAGE sql IMMUTABLE AS $$ SELECT date_trunc(p_period, p_at AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' $$;
/* The licence a tenant is entitled by: its latest version that is not superseded (none: UNCONTRACTED). */
CREATE OR REPLACE FUNCTION commercial.cme_licence(p_tenant uuid) RETURNS commercial.licences
LANGUAGE sql STABLE SET search_path = commercial, pg_catalog, pg_temp AS $$
  SELECT l.* FROM commercial.licences l WHERE l.tenant_id = p_tenant AND l.state <> 'superseded' ORDER BY l.version DESC LIMIT 1
$$;
/* The licence's limit for a dimension and unit: limits -> dimension as a number (in the dimension's primary unit) or as an object
   {<unit>: number}; NULL when the licence names none (the seam §EN's issue_licence writes; stated for the integrator). */
CREATE OR REPLACE FUNCTION commercial.cme_licence_limit(p_limits jsonb, p_dimension text, p_unit text) RETURNS numeric
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE jsonb_typeof(p_limits -> p_dimension)
           WHEN 'number' THEN CASE WHEN p_unit = (commercial.cme_units(p_dimension))[1] THEN (p_limits ->> p_dimension)::numeric END
           WHEN 'object' THEN CASE WHEN jsonb_typeof(p_limits -> p_dimension -> p_unit) = 'number' THEN (p_limits -> p_dimension ->> p_unit)::numeric
                                   -- §EN's declared form {quantity, unit, period}: the quantity, in its unit (absent: the primary unit)
                                   WHEN jsonb_typeof(p_limits -> p_dimension -> 'quantity') = 'number'
                                    AND coalesce(p_limits -> p_dimension ->> 'unit', (commercial.cme_units(p_dimension))[1]) = p_unit
                                   THEN (p_limits -> p_dimension ->> 'quantity')::numeric END
         END
$$;
/* The usage of a meter since an instant: the sum of the records (a gauge — storage — the latest sample per domain, summed). p_domain NULL:
   the whole tenant. Read by the definer ports and reads (their owner reads every row). */
CREATE OR REPLACE FUNCTION commercial.cme_used(p_tenant uuid, p_domain uuid, p_dimension text, p_unit text, p_since timestamptz) RETURNS numeric
LANGUAGE sql STABLE SET search_path = commercial, pg_catalog, pg_temp AS $$
  SELECT CASE WHEN p_dimension = 'storage' THEN
    coalesce((SELECT sum(s.q) FROM (SELECT DISTINCT ON (u.domain_id) u.quantity AS q FROM commercial.usage_records u
                                     WHERE u.tenant_id = p_tenant AND (p_domain IS NULL OR u.domain_id = p_domain) AND u.dimension = 'storage' AND u.unit = p_unit AND u.occurred_at >= p_since
                                     ORDER BY u.domain_id, u.occurred_at DESC, u.recorded_at DESC) s), 0)
  ELSE coalesce((SELECT sum(u.quantity) FROM commercial.usage_records u
                  WHERE u.tenant_id = p_tenant AND (p_domain IS NULL OR u.domain_id = p_domain) AND u.dimension = p_dimension AND u.unit = p_unit AND u.occurred_at >= p_since), 0) END
$$;
/* A cap's standing now: its period, the usage in it (the tenant's for a tenant cap, the domain's for a domain cap), the remaining, reached. */
CREATE OR REPLACE FUNCTION commercial.cme_cap_json(c commercial.caps) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = commercial, pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object('cap_id', c.cap_id, 'version', c.version, 'scope', c.scope, 'domain_id', c.domain_id, 'dimension', c.dimension, 'unit', c.unit, 'period', c.period,
                            'limit', c.cap_limit, 'action', c.action, 'state', c.state, 'licence', CASE WHEN c.licence_id IS NULL THEN NULL ELSE jsonb_build_object('licence_id', c.licence_id, 'version', c.licence_version, 'limit', c.licence_limit) END,
                            'reason', c.reason, 'set_by', c.set_by, 'set_at', c.set_at, 'period_start', p.s, 'used', u.used, 'remaining', greatest(c.cap_limit - u.used, 0), 'reached', u.used >= c.cap_limit)
    FROM (SELECT commercial.cme_period_start(c.period, clock_timestamp()) AS s) p
    CROSS JOIN LATERAL (SELECT commercial.cme_used(c.tenant_id, c.domain_id, c.dimension, c.unit, p.s) AS used) u
$$;
/* THE ONE WRITER of usage_records (idempotent on the unique key). Answers the record's id, or NULL when the source was already recorded. */
CREATE OR REPLACE FUNCTION commercial.cme_record(p_tenant uuid, p_domain uuid, p_dimension text, p_unit text, p_quantity numeric, p_source_kind text, p_source_ref text,
                                                 p_details jsonb, p_occurred_at timestamptz, p_correlation uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = commercial, pg_catalog, pg_temp AS $$
DECLARE v uuid := gen_random_uuid(); v_profile text;
BEGIN
  SELECT coalesce(d.residency_profile, t.residency_profile, 'local-dev') INTO v_profile FROM tenancy.tenants t LEFT JOIN tenancy.domains d ON d.id = p_domain AND d.tenant_id = t.id WHERE t.id = p_tenant;
  INSERT INTO commercial.usage_records (usage_id, scope, tenant_id, domain_id, capability_key, dimension, unit, quantity, profile, source_kind, source_ref, details, occurred_at, correlation_id)
  VALUES (v, CASE WHEN p_domain IS NULL THEN 'TENANT' ELSE 'DOMAIN' END, p_tenant, p_domain, commercial.cme_capability(p_dimension), p_dimension, p_unit, greatest(coalesce(p_quantity, 0), 0),
          coalesce(v_profile, 'local-dev'), p_source_kind, left(p_source_ref, 200), coalesce(p_details, '{}'::jsonb), coalesce(p_occurred_at, clock_timestamp()), p_correlation)
  ON CONFLICT (tenant_id, dimension, source_kind, source_ref) DO NOTHING;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION commercial.cme_record(uuid, uuid, text, text, numeric, text, text, jsonb, timestamptz, uuid) FROM PUBLIC;

/* THE NOTICE: commercial.usage, subject the cap (kind meter), owned by the administrator who set it (open when an active human) and routed
   to the tenant's administrators; its cause the breach row (the 0099 §O sio_notify idiom). */
CREATE OR REPLACE FUNCTION commercial.cme_notify(c commercial.caps, p_domain uuid, p_breach uuid, p_cause_type text, p_title text, p_reasons jsonb, p_details jsonb, p_actor uuid, p_correlation uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = executive, identity, decision, pg_catalog, pg_temp AS $$
DECLARE v_item uuid := gen_random_uuid(); v_state text; v_due timestamptz := clock_timestamp() + interval '24 hours'; v_corr uuid := coalesce(p_correlation, gen_random_uuid());
BEGIN
  v_state := CASE WHEN decision.is_active_human(c.set_by, c.tenant_id) OR executive.role_holders(c.tenant_id, p_domain, ARRAY['tenant_admin']) > 0 THEN 'open' ELSE 'unrouted' END;
  INSERT INTO executive.attention_items (item_id, scope, tenant_id, domain_id, signal_class, subject_kind, subject_id, cause_event_id, cause_event_type, title, outcome, state, owner_principal_id, route_roles, evaluation, details, due_at, escalations, correlation_id)
  VALUES (v_item, 'DOMAIN', c.tenant_id, p_domain, 'commercial.usage', 'meter', c.cap_id, p_breach, p_cause_type, left(p_title, 512), 'material', v_state,
          CASE WHEN decision.is_active_human(c.set_by, c.tenant_id) THEN c.set_by END, ARRAY['tenant_admin'],
          jsonb_build_object('outcome', 'material', 'reasons', p_reasons, 'policy_version', NULL, 'dimensions', jsonb_build_object('consequence', 'C2', 'confidence', 1)),
          jsonb_build_object('cap_id', c.cap_id, 'cap_version', c.version, 'dimension', c.dimension, 'unit', c.unit, 'period', c.period, 'limit', c.cap_limit, 'action', c.action, 'breach_id', p_breach) || coalesce(p_details, '{}'::jsonb),
          v_due, 0, v_corr);
  PERFORM executive.attention_event(v_item, c.tenant_id, p_domain, CASE v_state WHEN 'open' THEN 'item.routed' ELSE 'item.unrouted' END, p_actor,
            jsonb_build_object('outcome', 'material', 'reasons', p_reasons, 'policy_version', NULL, 'owner', c.set_by, 'route_roles', to_jsonb(ARRAY['tenant_admin']), 'due_at', v_due,
                               'cause_event_id', p_breach, 'cause_event_type', p_cause_type, 'unrouted', v_state = 'unrouted', 'cap_id', c.cap_id), v_corr);
  RETURN v_item;
END $$;
REVOKE ALL ON FUNCTION commercial.cme_notify(commercial.caps, uuid, uuid, text, text, jsonb, jsonb, uuid, uuid) FROM PUBLIC;

/* THE BREACH: the ledger row and the notice. `crossed` is recorded once per cap version and period (a second crossing in the period answers
   NULL and raises nothing); `refused` once per refusal. p_domain: where the usage or the stopped work lives (the notice's domain). */
CREATE OR REPLACE FUNCTION commercial.cme_breach(c commercial.caps, p_kind text, p_used numeric, p_domain uuid, p_subject_kind text, p_subject_id uuid, p_source_ref text,
                                                 p_details jsonb, p_actor uuid, p_correlation uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = commercial, pg_catalog, pg_temp AS $$
DECLARE v uuid := gen_random_uuid(); v_start timestamptz := commercial.cme_period_start(c.period, clock_timestamp()); v_item uuid; v_actor uuid := coalesce(p_actor, public.eye_principal(), c.set_by);
        v_what text;
BEGIN
  INSERT INTO commercial.cap_breaches (breach_id, scope, tenant_id, domain_id, cap_id, cap_version, dimension, unit, period, period_start, kind, action, cap_limit, used, subject_kind, subject_id, source_ref, details, actor_principal_id, correlation_id)
  VALUES (v, c.scope, c.tenant_id, c.domain_id, c.cap_id, c.version, c.dimension, c.unit, c.period, v_start, p_kind, c.action, c.cap_limit, p_used, p_subject_kind, p_subject_id, left(p_source_ref, 200),
          coalesce(p_details, '{}'::jsonb), v_actor, p_correlation)
  ON CONFLICT (cap_id, cap_version, period_start) WHERE kind = 'crossed' DO NOTHING;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF p_domain IS NOT NULL THEN
    v_what := CASE p_kind WHEN 'crossed' THEN format('Usage cap reached: %s %s %s of %s this %s (%s)', c.dimension, p_used, c.unit, c.cap_limit, c.period, CASE c.action WHEN 'stop' THEN 'new work stops at admission' ELSE 'a warning; nothing is stopped' END)
                          ELSE format('Usage cap stopped new work: %s %s of %s %s this %s — the %s was not continued', c.dimension, p_used, c.cap_limit, c.unit, c.period, replace(p_subject_kind, '_', ' ')) END;
    v_item := commercial.cme_notify(c, p_domain, v, 'usage.cap_' || p_kind, v_what,
                jsonb_build_array(format('the %s cap (%s) is %s %s per %s; used %s since %s', c.dimension, c.action, c.cap_limit, c.unit, c.period, p_used, v_start),
                                  CASE WHEN p_kind = 'refused' THEN 'no work was deleted: completed work is kept; the stopped work is recorded with the cap as its reason' ELSE 'the cap is the tenant administrator''s; raising it or the period''s turn admits new work again' END),
                jsonb_build_object('kind', p_kind, 'used', p_used, 'period_start', v_start, 'subject_kind', p_subject_kind, 'subject_id', p_subject_id), v_actor, p_correlation);
    -- the ledger row is append-only: the notice is named by its cause (the breach id) instead of written back
  END IF;
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION commercial.cme_breach(commercial.caps, text, numeric, uuid, text, uuid, text, jsonb, uuid, uuid) FROM PUBLIC;

/* The first STOP cap of the tenant (or of this domain) on a dimension that is reached in its period: the cap and its usage, or NULL. */
CREATE OR REPLACE FUNCTION commercial.cme_reached_stop(p_tenant uuid, p_domain uuid, p_dimension text) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = commercial, pg_catalog, pg_temp AS $$
  SELECT j FROM (SELECT commercial.cme_cap_json(c) AS j, c.domain_id FROM commercial.caps c
                  WHERE c.tenant_id = p_tenant AND c.state = 'active' AND c.action = 'stop' AND c.dimension = p_dimension AND (c.domain_id IS NULL OR c.domain_id = p_domain)) x
   WHERE (x.j ->> 'reached')::boolean ORDER BY x.domain_id NULLS FIRST, x.j ->> 'cap_id' LIMIT 1
$$;

-- §ME.3 THE CROSSING (AFTER INSERT ON usage_records): every live cap the new record counts towards is re-read; reached → `crossed`, once
-- per cap version and period (the notice raised then). The record itself is never refused here: metering records, admission stops.
CREATE OR REPLACE FUNCTION commercial.cme_usage_crossing() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = commercial, pg_catalog, pg_temp AS $$
DECLARE c commercial.caps%ROWTYPE; v_used numeric; v_start timestamptz;
BEGIN
  BEGIN   -- a meter never fails the act it meters: an error is a WARNING, the act goes on (the record is missing, never the act)
    FOR c IN SELECT * FROM commercial.caps x WHERE x.tenant_id = NEW.tenant_id AND x.state = 'active' AND x.dimension = NEW.dimension AND x.unit = NEW.unit
                                              AND (x.domain_id IS NULL OR x.domain_id = NEW.domain_id) ORDER BY x.domain_id NULLS FIRST, x.cap_id LOOP
      v_start := commercial.cme_period_start(c.period, clock_timestamp());
      CONTINUE WHEN NEW.occurred_at < v_start;
      v_used := commercial.cme_used(c.tenant_id, c.domain_id, c.dimension, c.unit, v_start);
      IF v_used >= c.cap_limit THEN
        PERFORM commercial.cme_breach(c, 'crossed', v_used, coalesce(NEW.domain_id, c.domain_id), 'meter', c.cap_id, NEW.source_kind || ':' || NEW.source_ref,
                                      jsonb_build_object('usage_id', NEW.usage_id, 'source_kind', NEW.source_kind, 'source_ref', NEW.source_ref, 'quantity', NEW.quantity), NULL, NEW.correlation_id);
      END IF;
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'B91 meters: % not recorded: %', TG_NAME, SQLERRM;
  END;
  RETURN NULL;
END $$;
CREATE TRIGGER cme_usage_crossing AFTER INSERT ON commercial.usage_records FOR EACH ROW EXECUTE FUNCTION commercial.cme_usage_crossing();

-- §ME.4 THE RECORDING POINTS (AFTER triggers; definer; usage_records ONLY) ───────────────────────────────────
/* model_inference: one call per gateway call (NO TOKENS EXIST: the gateway records none). */
CREATE OR REPLACE FUNCTION commercial.cme_gateway_call_usage() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = commercial, pg_catalog, pg_temp AS $$
BEGIN
  BEGIN   -- a meter never fails the act it meters: an error is a WARNING, the act goes on (the record is missing, never the act)
    PERFORM commercial.cme_record(NEW.tenant_id, NEW.domain_id, 'model_inference', 'calls', 1, 'gateway_call', NEW.call_id::text,
              jsonb_build_object('latency_ms', NEW.latency_ms, 'mode', NEW.mode, 'model_id', NEW.model_id, 'outcome', NEW.outcome, 'run_id', NEW.run_id, 'method_id', NEW.method_id,
                                 'tokens', NULL, 'tokens_note', 'the gateway records no token counts; inference is metered in calls'), NEW.occurred_at, NEW.correlation_id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'B91 meters: % not recorded: %', TG_NAME, SQLERRM;
  END;
  RETURN NULL;
END $$;
CREATE TRIGGER cme_gateway_call_usage AFTER INSERT ON intelligence.gateway_calls FOR EACH ROW EXECUTE FUNCTION commercial.cme_gateway_call_usage();

/* source_consumption: a terminal run event carrying the spent budget → the requests and the bytes. */
CREATE OR REPLACE FUNCTION commercial.cme_collection_run_usage() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = commercial, pg_catalog, pg_temp AS $$
DECLARE v_spent jsonb := NEW.details -> 'budget_spent'; v_det jsonb;
BEGIN
  BEGIN   -- a meter never fails the act it meters: an error is a WARNING, the act goes on (the record is missing, never the act)
    IF jsonb_typeof(v_spent) <> 'object' THEN RETURN NULL; END IF;
    v_det := jsonb_build_object('run_id', NEW.run_id, 'source_id', NEW.source_id, 'event', NEW.event, 'connector', NEW.connector, 'acquisition_mode', NEW.acquisition_mode,
                                'elapsed_ms', v_spent -> 'elapsedMs', 'admitted', NEW.details -> 'admitted', 'bytes_stored', NEW.details -> 'bytes_stored');
    PERFORM commercial.cme_record(NEW.tenant_id, NEW.domain_id, 'source_consumption', 'requests', coalesce((v_spent ->> 'requests')::numeric, 0), 'collection_run', NEW.run_id::text,
              v_det, NEW.occurred_at, NEW.correlation_id);
    PERFORM commercial.cme_record(NEW.tenant_id, NEW.domain_id, 'source_consumption', 'bytes', coalesce((v_spent ->> 'bytes')::numeric, 0), 'collection_run_bytes', NEW.run_id::text,
              v_det, NEW.occurred_at, NEW.correlation_id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'B91 meters: % not recorded: %', TG_NAME, SQLERRM;
  END;
  RETURN NULL;
END $$;
CREATE TRIGGER cme_collection_run_usage AFTER INSERT ON observation.collection_run_events FOR EACH ROW
  WHEN (NEW.event = 'run.finished') EXECUTE FUNCTION commercial.cme_collection_run_usage();

/* simulation_compute: every recorded chunk attempt (finished_at newly set) → its wall ms. */
CREATE OR REPLACE FUNCTION commercial.cme_chunk_usage() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = commercial, pg_catalog, pg_temp AS $$
BEGIN
  BEGIN   -- a meter never fails the act it meters: an error is a WARNING, the act goes on (the record is missing, never the act)
    PERFORM commercial.cme_record(NEW.tenant_id, NEW.domain_id, 'simulation_compute', 'wall_ms', greatest(NEW.wall_ms, 0), 'experiment_chunk',
              NEW.experiment_id::text || ':' || NEW.chunk_index || ':' || NEW.attempts,
              jsonb_build_object('experiment_id', NEW.experiment_id, 'chunk_index', NEW.chunk_index, 'attempt', NEW.attempts, 'paths', NEW.paths, 'outcome', NEW.state), NEW.finished_at, NULL);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'B91 meters: % not recorded: %', TG_NAME, SQLERRM;
  END;
  RETURN NULL;
END $$;
CREATE TRIGGER cme_chunk_usage AFTER UPDATE ON simulation.experiment_chunks FOR EACH ROW
  WHEN (NEW.finished_at IS NOT NULL AND NEW.finished_at IS DISTINCT FROM OLD.finished_at AND NEW.wall_ms IS NOT NULL) EXECUTE FUNCTION commercial.cme_chunk_usage();

/* simulation_compute: a run completed with its resource (not an experiment's: its chunks are metered). */
CREATE OR REPLACE FUNCTION commercial.cme_run_usage() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = commercial, pg_catalog, pg_temp AS $$
BEGIN
  BEGIN   -- a meter never fails the act it meters: an error is a WARNING, the act goes on (the record is missing, never the act)
    IF EXISTS (SELECT 1 FROM simulation.experiments e WHERE e.run_id = NEW.run_id) THEN RETURN NULL; END IF;
    PERFORM commercial.cme_record(NEW.tenant_id, NEW.domain_id, 'simulation_compute', 'wall_ms', round(coalesce((NEW.resource ->> 'elapsed_ms')::numeric, 0)), 'simulation_run', NEW.run_id::text,
              jsonb_build_object('run_id', NEW.run_id, 'model_ref', NEW.model_ref, 'samples_run', NEW.resource -> 'samples_run', 'samples', NEW.samples), coalesce(NEW.completed_at, clock_timestamp()), NULL);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'B91 meters: % not recorded: %', TG_NAME, SQLERRM;
  END;
  RETURN NULL;
END $$;
CREATE TRIGGER cme_run_usage AFTER UPDATE OF state ON simulation.runs_current FOR EACH ROW
  WHEN (OLD.state = 'opened' AND NEW.state = 'completed' AND NEW.resource IS NOT NULL) EXECUTE FUNCTION commercial.cme_run_usage();

/* product_consumption and B90's CARRYOVER: the usage record and the live registration's counter (product, consumer). */
CREATE OR REPLACE FUNCTION commercial.cme_product_consumption(p_tenant uuid, p_domain uuid, p_product uuid, p_consumer uuid, p_kind text, p_quantity numeric, p_source_ref text,
                                                              p_details jsonb, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = commercial, products, pg_catalog, pg_temp AS $$
DECLARE v_unit text := CASE p_kind WHEN 'metric_serving' THEN 'servings' ELSE 'events' END; v_usage uuid; v_consumer uuid; v_counter text;
BEGIN
  BEGIN   -- a meter never fails the read or the serving it meters
    v_usage := commercial.cme_record(p_tenant, p_domain, 'product_consumption', v_unit, CASE p_kind WHEN 'metric_serving' THEN 1 ELSE greatest(coalesce(p_quantity, 0), 0) END, p_kind, p_source_ref,
                 coalesce(p_details, '{}'::jsonb) || jsonb_build_object('product_id', p_product, 'consumer_principal_id', p_consumer), clock_timestamp(), p_correlation);
    IF v_usage IS NULL THEN RETURN jsonb_build_object('recorded', false); END IF;   -- recorded once: never counted twice
    v_counter := CASE p_kind WHEN 'metric_serving' THEN 'metric_servings' WHEN 'subscription_read' THEN 'subscription_reads' ELSE 'catch_ups' END;
    UPDATE products.product_consumers pc
       SET usage = pc.usage || jsonb_build_object(v_counter, coalesce((pc.usage ->> v_counter)::bigint, 0) + 1)
                            || CASE WHEN p_kind <> 'metric_serving' THEN jsonb_build_object('events_served', coalesce((pc.usage ->> 'events_served')::bigint, 0) + greatest(coalesce(p_quantity, 0), 0)::bigint) ELSE '{}'::jsonb END
                            || jsonb_build_object('last_consumed_at', clock_timestamp(), 'metered_by', 'B91 §ME (0105)')
     WHERE pc.product_id = p_product AND pc.consumer_principal_id = p_consumer AND pc.state IN ('registered', 'accepted')
    RETURNING pc.consumer_id INTO v_consumer;
    RETURN jsonb_build_object('recorded', true, 'usage_id', v_usage, 'consumer_id', v_consumer);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'B91 meters: product consumption not recorded: %', SQLERRM;
    RETURN jsonb_build_object('recorded', false, 'error', SQLERRM);
  END;
END $$;
REVOKE ALL ON FUNCTION commercial.cme_product_consumption(uuid, uuid, uuid, uuid, text, numeric, text, jsonb, uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION commercial.cme_metric_serving_usage() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = commercial, pg_catalog, pg_temp AS $$
BEGIN
  BEGIN   -- a meter never fails the act it meters: an error is a WARNING, the act goes on (the record is missing, never the act)
    PERFORM commercial.cme_product_consumption(NEW.tenant_id, NEW.domain_id, NEW.model_id, NEW.served_to, 'metric_serving', 1, NEW.serving_id::text,
              jsonb_build_object('serving_id', NEW.serving_id, 'view', NEW.view, 'grain', NEW.grain, 'version', NEW.version, 'certified', NEW.certified, 'source_rows', NEW.source_rows), NEW.correlation_id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'B91 meters: % not recorded: %', TG_NAME, SQLERRM;
  END;
  RETURN NULL;
END $$;
CREATE TRIGGER cme_metric_serving_usage AFTER INSERT ON products.metric_servings FOR EACH ROW EXECUTE FUNCTION commercial.cme_metric_serving_usage();

CREATE OR REPLACE FUNCTION commercial.cme_catchup_usage() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = commercial, products, pg_catalog, pg_temp AS $$
DECLARE v_product uuid;
BEGIN
  BEGIN   -- a meter never fails the act it meters: an error is a WARNING, the act goes on (the record is missing, never the act)
    SELECT s.product_id INTO v_product FROM products.event_subscriptions s WHERE s.subscription_id = NEW.subscription_id;
    PERFORM commercial.cme_product_consumption(NEW.tenant_id, NEW.domain_id, v_product, NEW.served_to, 'catch_up', NEW.served, NEW.catchup_id::text,
              jsonb_build_object('subscription_id', NEW.subscription_id, 'catchup_id', NEW.catchup_id, 'after', NEW.after_sequence, 'through', NEW.through_sequence), NEW.correlation_id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'B91 meters: % not recorded: %', TG_NAME, SQLERRM;
  END;
  RETURN NULL;
END $$;
CREATE TRIGGER cme_catchup_usage AFTER INSERT ON products.subscription_catchups FOR EACH ROW EXECUTE FUNCTION commercial.cme_catchup_usage();

-- §ME.5 THE PORTS ──────────────────────────────────────────────────────
/* The administrator's standing: an active HUMAN holding tenant_admin at the tenant's scope (never an agent). */
CREATE OR REPLACE FUNCTION commercial.cme_is_tenant_admin(p_principal uuid, p_tenant uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = identity, pg_catalog, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM identity.role_bindings b JOIN identity.principals p ON p.id = b.principal_id
                  WHERE b.principal_id = p_principal AND p.kind = 'human' AND p.status = 'active' AND b.revoked_at IS NULL
                    AND b.role_code = 'tenant_admin' AND b.scope = 'TENANT' AND b.tenant_id = p_tenant)
$$;
REVOKE ALL ON FUNCTION commercial.cme_is_tenant_admin(uuid, uuid) FROM PUBLIC;

/* SET A CAP (commercial.cap.set — the tenant's administrator, human-gated): a new version of the cap on (tenant | domain, dimension, unit,
   period) superseding the live one; within the licence's limit (an uncontracted tenant: bounded by nothing but itself); stop only where an
   admission point enforces it (simulation_compute). Answers the cap with its standing. */
CREATE OR REPLACE FUNCTION commercial.set_cap(p_tenant uuid, p_domain uuid, p_dimension text, p_unit text, p_period text, p_limit numeric, p_action text, p_reason text,
                                              p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = commercial, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_unit text; old commercial.caps%ROWTYPE; c commercial.caps%ROWTYPE; l commercial.licences%ROWTYPE; v_llimit numeric; v_id uuid; v_version int := 1;
BEGIN
  PERFORM observation.assert_authority(ARRAY['commercial.cap.set']);
  IF public.eye_scope() <> 'TENANT' OR public.eye_tenant() IS DISTINCT FROM p_tenant THEN
    RAISE EXCEPTION 'usage cap rejected (scope): a cap is set at the tenant''s own scope by its administrator (bound: %)', public.eye_scope() USING ERRCODE = '42501';
  END IF;
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'usage cap rejected (actor): a cap is set by the acting principal' USING ERRCODE = '42501'; END IF;
  IF NOT commercial.cme_is_tenant_admin(p_actor, p_tenant) THEN
    RAISE EXCEPTION 'usage cap rejected (authority): a cap is set by a named human administrator of the tenant (tenant_admin); an agent never sets, raises or lifts a cap' USING ERRCODE = '42501';
  END IF;
  IF p_dimension IS NULL OR commercial.cme_units(p_dimension) IS NULL THEN
    RAISE EXCEPTION 'usage cap rejected (dimension): % is not a metered dimension (model_inference, source_consumption, storage, simulation_compute, product_consumption)', coalesce(p_dimension, '<none>') USING ERRCODE = '22023';
  END IF;
  v_unit := coalesce(nullif(btrim(p_unit), ''), (commercial.cme_units(p_dimension))[1]);
  IF NOT (v_unit = ANY (commercial.cme_units(p_dimension))) THEN
    RAISE EXCEPTION 'usage cap rejected (unit): % is metered in %; % is not among them', p_dimension, array_to_string(commercial.cme_units(p_dimension), ', '), v_unit USING ERRCODE = '22023';
  END IF;
  IF p_period IS NULL OR p_period NOT IN ('day', 'month') THEN RAISE EXCEPTION 'usage cap rejected (period): a cap''s period is day or month (the UTC calendar)' USING ERRCODE = '22023'; END IF;
  IF p_limit IS NULL OR p_limit <= 0 THEN RAISE EXCEPTION 'usage cap rejected (limit): the limit is a positive quantity of %', v_unit USING ERRCODE = '22023'; END IF;
  IF p_action IS NULL OR p_action NOT IN ('stop', 'warn') THEN RAISE EXCEPTION 'usage cap rejected (action): a cap''s action is stop or warn' USING ERRCODE = '22023'; END IF;
  IF p_action = 'stop' AND p_dimension <> 'simulation_compute' THEN
    RAISE EXCEPTION 'usage cap rejected (action): a % cap is warn only — % (stop is enforced at admission for simulation_compute: the experiment chunk claim and the envelope sweep)', p_dimension,
      CASE p_dimension WHEN 'model_inference' THEN 'a stop at the gateway would refuse an extraction mid-run' ELSE 'no admission point enforces a stop on it' END USING ERRCODE = '22023';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN RAISE EXCEPTION 'usage cap rejected (reason): a cap states its reason (8 characters or more)' USING ERRCODE = '22023'; END IF;
  IF p_domain IS NOT NULL AND NOT EXISTS (SELECT 1 FROM tenancy.domains d WHERE d.id = p_domain AND d.tenant_id = p_tenant) THEN
    RAISE EXCEPTION 'usage cap rejected (unknown_domain): % is not a domain of this tenant', p_domain USING ERRCODE = '22023';
  END IF;
  l := commercial.cme_licence(p_tenant);
  IF l.licence_id IS NOT NULL THEN
    v_llimit := commercial.cme_licence_limit(l.limits, p_dimension, v_unit);
    IF v_llimit IS NOT NULL AND p_limit > v_llimit THEN
      RAISE EXCEPTION 'usage cap rejected (licence): the cap % % per % exceeds the licence v% limit % % — a cap is set within the licence''s limits', p_limit, v_unit, p_period, l.version, v_llimit, v_unit USING ERRCODE = '22023';
    END IF;
  END IF;
  SELECT * INTO old FROM commercial.caps x WHERE x.tenant_id = p_tenant AND x.domain_id IS NOT DISTINCT FROM p_domain AND x.dimension = p_dimension AND x.unit = v_unit AND x.period = p_period AND x.state = 'active' FOR UPDATE;
  IF FOUND THEN
    IF old.cap_limit = p_limit AND old.action = p_action THEN
      RAISE EXCEPTION 'usage cap rejected (unchanged): the % cap (% % per %, %) is already version %', p_dimension, p_limit, v_unit, p_period, p_action, old.version USING ERRCODE = '2F002';
    END IF;
    UPDATE commercial.caps SET state = 'superseded', superseded_at = clock_timestamp() WHERE cap_id = old.cap_id AND version = old.version;
    v_id := old.cap_id; v_version := old.version + 1;
  ELSE
    v_id := gen_random_uuid();
  END IF;
  INSERT INTO commercial.caps (cap_id, version, scope, tenant_id, domain_id, dimension, unit, period, cap_limit, action, state, licence_id, licence_version, licence_limit, reason, set_by, correlation_id)
  VALUES (v_id, v_version, CASE WHEN p_domain IS NULL THEN 'TENANT' ELSE 'DOMAIN' END, p_tenant, p_domain, p_dimension, v_unit, p_period, p_limit, p_action, 'active',
          l.licence_id, CASE WHEN l.licence_id IS NOT NULL THEN l.version END, v_llimit, btrim(p_reason), p_actor, p_correlation)
  RETURNING * INTO c;
  RETURN commercial.cme_cap_json(c) || jsonb_build_object('supersedes', CASE WHEN v_version > 1 THEN v_version - 1 END,
                                                           'licence_bound', CASE WHEN l.licence_id IS NULL THEN 'uncontracted: no licence limit applies; the cap is bounded by nothing but itself'
                                                                                 WHEN v_llimit IS NULL THEN format('licence v%s names no %s limit in %s', l.version, p_dimension, v_unit)
                                                                                 ELSE format('within the licence v%s limit %s %s', l.version, v_llimit, v_unit) END);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION commercial.set_cap(uuid, uuid, text, text, text, numeric, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION commercial.set_cap(uuid, uuid, text, text, text, numeric, text, text, uuid, uuid) TO eye_commit;

/* RECORD USAGE (the envelope sweep's route under simulation.sweep.run; the storage tick step under executive.attention.tick): an
   envelope_sweep record names a sweep of this domain requested by the actor, its quantity the route's measured wall ms; a storage_sample's
   quantity is MEASURED BY THE PORT (the domain's evidence bytes; a caller's figure is refused), once per domain per hour. Idempotent. */
CREATE OR REPLACE FUNCTION commercial.record_usage(p_tenant uuid, p_domain uuid, p_source_kind text, p_source_ref text, p_quantity numeric, p_details jsonb, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = commercial, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_action text; v_usage uuid; v_ref text; v_hot bigint; v_archive bigint; v_n int; v_det jsonb; v_q numeric;
BEGIN
  v_action := observation.assert_authority(ARRAY['simulation.sweep.run', 'executive.attention.tick']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'usage record rejected (actor): usage is recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF p_source_kind = 'envelope_sweep' AND v_action = 'simulation.sweep.run' THEN
    IF p_source_ref IS NULL OR p_source_ref !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       OR NOT EXISTS (SELECT 1 FROM simulation.envelope_sweeps s WHERE s.sweep_id = p_source_ref::uuid AND s.tenant_id = p_tenant AND s.domain_id = p_domain AND s.requested_by = p_actor) THEN
      RAISE EXCEPTION 'usage record rejected (unknown_sweep): % is not an envelope sweep of this domain requested by the actor', coalesce(p_source_ref, '<none>') USING ERRCODE = '22023';
    END IF;
    IF p_quantity IS NULL OR p_quantity < 0 THEN RAISE EXCEPTION 'usage record rejected (quantity): a sweep''s wall time is a non-negative number of milliseconds' USING ERRCODE = '22023'; END IF;
    v_ref := p_source_ref; v_q := round(p_quantity);
    v_usage := commercial.cme_record(p_tenant, p_domain, 'simulation_compute', 'wall_ms', v_q, 'envelope_sweep', v_ref, coalesce(p_details, '{}'::jsonb) || jsonb_build_object('sweep_id', p_source_ref, 'measured_by', 'the sweep route'),
                                     clock_timestamp(), p_correlation);
    RETURN jsonb_build_object('recorded', v_usage IS NOT NULL, 'usage_id', v_usage, 'dimension', 'simulation_compute', 'unit', 'wall_ms', 'quantity', v_q, 'source_kind', 'envelope_sweep', 'source_ref', v_ref);
  ELSIF p_source_kind = 'storage_sample' AND v_action = 'executive.attention.tick' THEN
    IF p_quantity IS NOT NULL THEN RAISE EXCEPTION 'usage record rejected (quantity): a storage sample is measured by the port; the caller names no figure' USING ERRCODE = '22023'; END IF;
    SELECT coalesce(sum(m.byte_length) FILTER (WHERE t.tier = 'hot'), 0)::bigint, coalesce(sum(m.byte_length) FILTER (WHERE t.tier = 'archive'), 0)::bigint, count(*)::int
      INTO v_hot, v_archive, v_n
      FROM observation.blob_manifests m CROSS JOIN LATERAL (SELECT observation.manifest_tier(m.manifest_id) AS tier) t
     WHERE m.tenant_id = p_tenant AND m.domain_id = p_domain AND m.vault = 'evidence'
       AND NOT EXISTS (SELECT 1 FROM observation.blob_tombstones x WHERE x.manifest_id = m.manifest_id);
    v_ref := p_domain::text || ':' || to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24');
    v_det := jsonb_build_object('hot_bytes', v_hot, 'archive_bytes', v_archive, 'manifests', v_n, 'vault', 'evidence', 'sampled_at', clock_timestamp(), 'gauge', true);
    v_usage := commercial.cme_record(p_tenant, p_domain, 'storage', 'bytes', v_hot + v_archive, 'storage_sample', v_ref, v_det, clock_timestamp(), p_correlation);
    RETURN jsonb_build_object('recorded', v_usage IS NOT NULL, 'usage_id', v_usage, 'dimension', 'storage', 'unit', 'bytes', 'quantity', v_hot + v_archive, 'source_kind', 'storage_sample', 'source_ref', v_ref) || v_det;
  END IF;
  RAISE EXCEPTION 'usage record rejected (source): % is not recorded under % (envelope_sweep under simulation.sweep.run; storage_sample under the attention tick)', coalesce(p_source_kind, '<none>'), v_action USING ERRCODE = '22023';
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION commercial.record_usage(uuid, uuid, text, text, numeric, jsonb, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION commercial.record_usage(uuid, uuid, text, text, numeric, jsonb, uuid, uuid) TO eye_commit;

/* RECORD A CAP BREACH (the envelope sweep's route, simulation.sweep.run): the sweep was REFUSED before running because a stop cap on
   simulation_compute is reached — the `refused` row and the notice, in the route's own committed write (the refusal then answered 409).
   Refused (state) when no stop cap is reached: a breach is never recorded for work that was admissible. */
CREATE OR REPLACE FUNCTION commercial.record_cap_breach(p_tenant uuid, p_domain uuid, p_dimension text, p_subject_kind text, p_subject_id uuid, p_details jsonb, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = commercial, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_cap jsonb; c commercial.caps%ROWTYPE; v_breach uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['simulation.sweep.run']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'usage cap rejected (actor): a breach is recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF p_dimension IS DISTINCT FROM 'simulation_compute' OR p_subject_kind IS DISTINCT FROM 'envelope_sweep' THEN
    RAISE EXCEPTION 'usage cap rejected (source): the sweep route records a simulation_compute breach of an envelope sweep' USING ERRCODE = '22023';
  END IF;
  v_cap := commercial.cme_reached_stop(p_tenant, p_domain, p_dimension);
  IF v_cap IS NULL THEN RAISE EXCEPTION 'usage cap rejected (state): no stop cap on % is reached for this domain; nothing was refused', p_dimension USING ERRCODE = '2F002'; END IF;
  SELECT * INTO c FROM commercial.caps x WHERE x.cap_id = (v_cap ->> 'cap_id')::uuid AND x.version = (v_cap ->> 'version')::int;
  v_breach := commercial.cme_breach(c, 'refused', (v_cap ->> 'used')::numeric, p_domain, p_subject_kind, p_subject_id, NULL, coalesce(p_details, '{}'::jsonb) || jsonb_build_object('cap', v_cap), p_actor, p_correlation);
  RETURN jsonb_build_object('breach_id', v_breach, 'kind', 'refused', 'cap', v_cap, 'subject_kind', p_subject_kind, 'subject_id', p_subject_id,
                            'explanation', format('usage cap rejected (cap): the tenant''s %s cap (%s %s per %s, stop) is reached — %s used since %s; the sweep did not run and nothing was deleted',
                                                  p_dimension, v_cap ->> 'limit', v_cap ->> 'unit', v_cap ->> 'period', v_cap ->> 'used', v_cap ->> 'period_start'));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION commercial.record_cap_breach(uuid, uuid, text, text, uuid, jsonb, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION commercial.record_cap_breach(uuid, uuid, text, text, uuid, jsonb, uuid, uuid) TO eye_commit;

-- §ME.6 THE READS (guarded definers: N-01's assert_read_scope on the tenant/domain arguments) ─────────────────
/* commercial.cap_status(tenant, domain, dimension): the live caps that bound the domain's (or, domain NULL, the tenant's) usage on a dimension
   (every dimension when NULL), each with its period, usage, remaining and whether it is reached; and the first reached STOP cap. */
CREATE OR REPLACE FUNCTION commercial.cap_status(p_tenant uuid, p_domain uuid, p_dimension text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = commercial, observation, public, pg_catalog, pg_temp AS $$
DECLARE v jsonb;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the usage caps');
  SELECT coalesce(jsonb_agg(commercial.cme_cap_json(c) ORDER BY c.dimension, c.unit, c.period, c.domain_id NULLS FIRST), '[]'::jsonb) INTO v
    FROM commercial.caps c WHERE c.tenant_id = p_tenant AND c.state = 'active' AND (p_dimension IS NULL OR c.dimension = p_dimension)
     AND (c.domain_id IS NULL OR (p_domain IS NULL AND public.eye_scope() = 'TENANT') OR c.domain_id = p_domain);
  RETURN jsonb_build_object('tenant_id', p_tenant, 'domain_id', p_domain, 'dimension', p_dimension, 'caps', v,
                            'stop', CASE WHEN p_dimension IS NOT NULL THEN commercial.cme_reached_stop(p_tenant, p_domain, p_dimension) END, 'at', clock_timestamp());
END $$;
REVOKE ALL ON FUNCTION commercial.cap_status(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION commercial.cap_status(uuid, uuid, text) TO eye_app, eye_commit;

/* commercial.usage_summary(tenant, domain): the meters (per dimension and unit: today, this month, all time; per domain for a tenant read),
   the caps with their standing, the breaches, the latest records, the licence that bounds the caps (or uncontracted), and what is not
   metered (stated). */
CREATE OR REPLACE FUNCTION commercial.usage_summary(p_tenant uuid, p_domain uuid, p_limit int) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = commercial, observation, public, pg_catalog, pg_temp AS $$
DECLARE v_day timestamptz := commercial.cme_period_start('day', clock_timestamp()); v_month timestamptz := commercial.cme_period_start('month', clock_timestamp());
        v_meters jsonb; v_domains jsonb; v_caps jsonb; v_breaches jsonb; v_records jsonb; l commercial.licences%ROWTYPE; v_n int := least(greatest(coalesce(p_limit, 50), 1), 200);
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the usage meters');
  SELECT coalesce(jsonb_agg(jsonb_build_object('dimension', d.dimension, 'unit', d.unit, 'capability', commercial.cme_capability(d.dimension), 'gauge', d.dimension = 'storage',
                                               'today', commercial.cme_used(p_tenant, p_domain, d.dimension, d.unit, v_day),
                                               'this_month', commercial.cme_used(p_tenant, p_domain, d.dimension, d.unit, v_month),
                                               'all_time', commercial.cme_used(p_tenant, p_domain, d.dimension, d.unit, '-infinity'::timestamptz),
                                               'records', d.n, 'last_at', d.last_at) ORDER BY d.dimension, d.unit), '[]'::jsonb)
    INTO v_meters
    FROM (SELECT u.dimension, u.unit, count(*)::int n, max(u.occurred_at) last_at FROM commercial.usage_records u
           WHERE u.tenant_id = p_tenant AND (p_domain IS NULL OR u.domain_id = p_domain) GROUP BY u.dimension, u.unit) d;
  IF p_domain IS NULL THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object('domain_id', x.domain_id, 'domain', x.name, 'dimension', x.dimension, 'unit', x.unit, 'this_month', commercial.cme_used(p_tenant, x.domain_id, x.dimension, x.unit, v_month))
                              ORDER BY x.name, x.dimension, x.unit), '[]'::jsonb) INTO v_domains
      FROM (SELECT DISTINCT u.domain_id, d.name, u.dimension, u.unit FROM commercial.usage_records u LEFT JOIN tenancy.domains d ON d.id = u.domain_id
             WHERE u.tenant_id = p_tenant AND u.domain_id IS NOT NULL) x;
  END IF;
  SELECT coalesce(jsonb_agg(commercial.cme_cap_json(c) ORDER BY c.dimension, c.unit, c.period, c.domain_id NULLS FIRST), '[]'::jsonb) INTO v_caps
    FROM commercial.caps c WHERE c.tenant_id = p_tenant AND c.state = 'active' AND (c.domain_id IS NULL OR p_domain IS NULL OR c.domain_id = p_domain);
  SELECT coalesce(jsonb_agg(jsonb_build_object('breach_id', b.breach_id, 'kind', b.kind, 'action', b.action, 'cap_id', b.cap_id, 'cap_version', b.cap_version, 'dimension', b.dimension, 'unit', b.unit,
                                               'period', b.period, 'period_start', b.period_start, 'limit', b.cap_limit, 'used', b.used, 'subject_kind', b.subject_kind, 'subject_id', b.subject_id,
                                               'domain_id', b.domain_id, 'actor', b.actor_principal_id, 'occurred_at', b.occurred_at) ORDER BY b.occurred_at DESC), '[]'::jsonb) INTO v_breaches
    FROM (SELECT x.* FROM commercial.cap_breaches x WHERE x.tenant_id = p_tenant AND (p_domain IS NULL OR x.domain_id IS NULL OR x.domain_id = p_domain)
           ORDER BY x.occurred_at DESC LIMIT v_n) b;
  SELECT coalesce(jsonb_agg(jsonb_build_object('usage_id', u.usage_id, 'domain_id', u.domain_id, 'dimension', u.dimension, 'unit', u.unit, 'quantity', u.quantity, 'capability', u.capability_key,
                                               'profile', u.profile, 'source_kind', u.source_kind, 'source_ref', u.source_ref, 'details', u.details, 'occurred_at', u.occurred_at) ORDER BY u.occurred_at DESC, u.usage_id), '[]'::jsonb) INTO v_records
    FROM (SELECT x.* FROM commercial.usage_records x WHERE x.tenant_id = p_tenant AND (p_domain IS NULL OR x.domain_id = p_domain) ORDER BY x.occurred_at DESC, x.usage_id LIMIT v_n) u;
  l := commercial.cme_licence(p_tenant);
  RETURN jsonb_build_object('tenant_id', p_tenant, 'domain_id', p_domain, 'at', clock_timestamp(), 'day_start', v_day, 'month_start', v_month,
    'meters', v_meters, 'domains', v_domains, 'caps', v_caps, 'breaches', v_breaches, 'records', v_records,
    'licence', CASE WHEN l.licence_id IS NULL THEN jsonb_build_object('contracted', false, 'note', 'uncontracted: no licence limits apply; a cap is bounded by nothing but itself')
                    ELSE jsonb_build_object('contracted', true, 'licence_id', l.licence_id, 'version', l.version, 'state', l.state, 'package_key', l.package_key, 'limits', l.limits) END,
    'not_metered', jsonb_build_array('model inference TOKENS: the gateway records none (inference is metered in calls)',
                                     'a collection run that ends budget_exceeded or failed: its terminal event carries no spent figures',
                                     'storage outside the evidence vault (the quarantine vault, export packages, the database itself)'));
END $$;
REVOKE ALL ON FUNCTION commercial.usage_summary(uuid, uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION commercial.usage_summary(uuid, uuid, int) TO eye_app, eye_commit;

-- §ME.7 THE RE-DECLARED PORTS (copied whole from their latest definitions; the B91 meters changes marked `-- B91 meters`) ─────────────

/* simulation.claim_experiment_chunk — copied whole from 0099:1421 (its latest definition); the B91 meters change is the tenant cap at admission. */
/* CLAIM (the WORKER's; simulation.experiment.execute): the oldest running experiment of the domain whose run is bound (or the one named)
   answers — {kind: 'finish', outcome, reason} when a stop is pending or every chunk is done; {kind: 'chunk', …, run: the stored contract}
   for its next chunk: a QUEUED one, or a RUNNING one whose lease lapsed (a worker that died mid-chunk: reclaimed, chunk_reclaimed) —
   FOR UPDATE SKIP LOCKED, the attempt counted against the budget's chunk executions; or null (nothing to do). */
CREATE OR REPLACE FUNCTION simulation.claim_experiment_chunk(p_tenant uuid, p_domain uuid, p_experiment_id uuid, p_exclude uuid[], p_lease_seconds int, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = simulation, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE e simulation.experiments%ROWTYPE; c simulation.experiment_chunks%ROWTYPE; r simulation.runs_current%ROWTYPE; v_lease int := greatest(5, least(coalesce(p_lease_seconds, 300), 3600));
        v_left int; v_reclaimed boolean := false;
        v_cap jsonb; v_capr commercial.caps%ROWTYPE;   -- B91 meters
BEGIN
  PERFORM observation.assert_authority(ARRAY['simulation.experiment.execute']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM simulation.sio_assert_actor(p_actor);
  PERFORM simulation.sio_assert_worker(p_tenant, p_domain, p_actor);
  SELECT * INTO e FROM simulation.experiments x
   WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.state = 'running' AND x.run_id IS NOT NULL AND (p_experiment_id IS NULL OR x.experiment_id = p_experiment_id) AND NOT (x.experiment_id = ANY (coalesce(p_exclude, ARRAY[]::uuid[])))
   ORDER BY x.started_at, x.experiment_id LIMIT 1 FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF e.stop_pending IS NOT NULL THEN RETURN jsonb_build_object('kind', 'finish', 'experiment_id', e.experiment_id, 'run_id', e.run_id, 'outcome', e.stop_pending ->> 'outcome', 'reason', e.stop_pending ->> 'reason'); END IF;
  SELECT count(*) INTO v_left FROM simulation.experiment_chunks k WHERE k.experiment_id = e.experiment_id AND k.state <> 'done';
  IF v_left = 0 THEN RETURN jsonb_build_object('kind', 'finish', 'experiment_id', e.experiment_id, 'run_id', e.run_id, 'outcome', 'completed', 'reason', 'paths'); END IF;
  SELECT * INTO c FROM simulation.experiment_chunks k
   WHERE k.experiment_id = e.experiment_id AND (k.state = 'queued' OR (k.state = 'running' AND k.started_at < clock_timestamp() - make_interval(secs => v_lease)))
   ORDER BY k.chunk_index LIMIT 1 FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN RETURN NULL; END IF;   -- every remaining chunk is in flight under a live lease
  v_reclaimed := c.state = 'running';
  -- B91 meters: THE TENANT'S CAP AT ADMISSION — a reached STOP cap on simulation_compute (the tenant's, or this domain's) stops the
  -- experiment BEFORE the next chunk runs: stop_pending partial (failed when no chunk completed) with reason tenant_cap, the existing
  -- budget_exceeded event carrying the cap, a `refused` cap breach and commercial.usage raised. Nothing is deleted: the completed chunks
  -- stay and the run ends partial over them. No cap set (or none reached) → this block changes nothing.
  v_cap := commercial.cme_reached_stop(e.tenant_id, e.domain_id, 'simulation_compute');
  IF v_cap IS NOT NULL THEN
    UPDATE simulation.experiments SET stop_pending = jsonb_build_object('outcome', CASE WHEN (e.progress ->> 'chunks_done')::int > 0 THEN 'partial' ELSE 'failed' END, 'reason', 'tenant_cap')
     WHERE experiment_id = e.experiment_id RETURNING * INTO e;
    PERFORM simulation.sio_event(e, 'budget_exceeded', p_actor, jsonb_build_object('budget', 'tenant_cap', 'cap', v_cap, 'used', e.progress, 'approved', e.budget), p_correlation);
    SELECT * INTO v_capr FROM commercial.caps x WHERE x.cap_id = (v_cap ->> 'cap_id')::uuid AND x.version = (v_cap ->> 'version')::int;
    PERFORM commercial.cme_breach(v_capr, 'refused', (v_cap ->> 'used')::numeric, e.domain_id, 'experiment', e.experiment_id, NULL,
              jsonb_build_object('experiment_id', e.experiment_id, 'title', e.title, 'run_id', e.run_id, 'outcome', e.stop_pending ->> 'outcome', 'chunks_done', e.progress -> 'chunks_done', 'cap', v_cap), p_actor, p_correlation);
    RETURN jsonb_build_object('kind', 'finish', 'experiment_id', e.experiment_id, 'run_id', e.run_id, 'outcome', e.stop_pending ->> 'outcome', 'reason', 'tenant_cap');
  END IF;
  -- end B91 meters
  IF (e.progress ->> 'executions')::int >= (e.budget ->> 'max_chunks')::int THEN
    UPDATE simulation.experiments SET stop_pending = jsonb_build_object('outcome', CASE WHEN (e.progress ->> 'chunks_done')::int > 0 THEN 'partial' ELSE 'failed' END, 'reason', 'budget_exceeded')
     WHERE experiment_id = e.experiment_id RETURNING * INTO e;
    PERFORM simulation.sio_event(e, 'budget_exceeded', p_actor, jsonb_build_object('budget', 'max_chunks', 'used', e.progress, 'approved', e.budget), p_correlation);
    RETURN jsonb_build_object('kind', 'finish', 'experiment_id', e.experiment_id, 'run_id', e.run_id, 'outcome', e.stop_pending ->> 'outcome', 'reason', 'budget_exceeded');
  END IF;
  UPDATE simulation.experiment_chunks SET state = 'running', attempts = attempts + 1, claimed_by = p_actor, started_at = clock_timestamp(), finished_at = NULL, error = NULL
   WHERE experiment_id = c.experiment_id AND chunk_index = c.chunk_index RETURNING * INTO c;
  UPDATE simulation.experiments SET progress = jsonb_set(progress, '{executions}', to_jsonb((progress ->> 'executions')::int + 1)) WHERE experiment_id = e.experiment_id RETURNING * INTO e;
  IF v_reclaimed THEN PERFORM simulation.sio_event(e, 'chunk_reclaimed', p_actor, jsonb_build_object('chunk_index', c.chunk_index, 'attempt', c.attempts, 'lease_seconds', v_lease), p_correlation); END IF;
  SELECT * INTO r FROM simulation.runs_current x WHERE x.run_id = e.run_id;
  RETURN jsonb_build_object('kind', 'chunk', 'experiment_id', e.experiment_id, 'chunk_index', c.chunk_index, 'first_path', c.first_path, 'paths', c.paths, 'attempt', c.attempts,
                            'reclaimed', v_reclaimed, 'run_id', e.run_id, 'chunks_per_tick', coalesce((e.pace ->> 'chunks_per_tick')::int, 1),
                            'run', jsonb_build_object('initial_state', r.initial_state, 'component', r.component, 'constraints', r.constraints, 'shock', r.shock, 'stochastic_mode', r.stochastic_mode,
                                                      'seed', r.seed, 'samples', r.samples, 'jitter', r.jitter, 'interventions', r.interventions, 'assumptions', r.assumptions,
                                                      'model_ref', r.model_ref, 'implementation_digest', r.implementation_digest));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION simulation.claim_experiment_chunk(uuid, uuid, uuid, uuid[], int, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION simulation.claim_experiment_chunk(uuid, uuid, uuid, uuid[], int, uuid, uuid) TO eye_commit;

/* products.read_subscription_events — copied whole from 0096:149 (its latest definition); the B91 meters change is the read's metering and the
   consumer register's counter (B90's carryover). The catch-up (0098:15) is NOT re-declared: its ledger row (products.subscription_catchups) is
   metered by the AFTER INSERT trigger cme_catchup_usage. */
CREATE OR REPLACE FUNCTION products.read_subscription_events(p_subscription_id uuid, p_tenant uuid, p_domain uuid, p_after_sequence bigint, p_limit int, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = products, executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE s products.event_subscriptions%ROWTYPE; ep products.event_products%ROWTYPE; r products.products_current%ROWTYPE; v_after bigint; v_limit int; v_floor timestamptz; v_head bigint;
        v_from timestamptz; v_to timestamptz; v_kinds text[]; v_okeys text[]; v_subjects uuid[]; v_fields text[]; v_events jsonb; v_served int; v_omitted int; v_next bigint;
BEGIN
  PERFORM observation.assert_authority(ARRAY['products.subscription.read']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'subscription rejected (actor): read by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO s FROM products.event_subscriptions x WHERE x.subscription_id = p_subscription_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'subscription rejected (unknown_subscription): % is not a subscription of this domain', p_subscription_id USING ERRCODE = '22023'; END IF;
  IF s.consumer_principal_id <> p_actor THEN RAISE EXCEPTION 'subscription rejected (not_consumer): the events of a subscription are read by its consumer' USING ERRCODE = '42501'; END IF;
  IF s.state = 'registered' THEN RAISE EXCEPTION 'subscription rejected (state): subscription % is registered and not yet authorized by the product''s owner', p_subscription_id USING ERRCODE = '22023'; END IF;
  IF s.state = 'revoked' THEN RAISE EXCEPTION 'subscription rejected (state): subscription % was revoked at % (%); nothing is served (the checkpoint % is preserved)', p_subscription_id, s.revoked_at, s.revocation_reason, s.checkpoint_sequence USING ERRCODE = '22023'; END IF;
  IF s.state IN ('paused', 'lagging') THEN
    RAISE EXCEPTION 'subscription rejected (state): subscription % is % (%); delivery is paused with the checkpoint % preserved — the consumer''s conformance and the owner''s resumption are required before reading%', p_subscription_id, s.state, s.paused_reason, s.checkpoint_sequence,
      CASE WHEN s.state = 'lagging' THEN format(' (the authorized backlog through sequence %s is served by the catch-up route)', s.catchup_head) ELSE '' END USING ERRCODE = '22023';
  END IF;
  SELECT * INTO ep FROM products.event_products x WHERE x.product_id = s.product_id;
  SELECT * INTO r FROM products.products_current x WHERE x.product_id = s.product_id;
  v_after := coalesce(p_after_sequence, s.checkpoint_sequence);
  IF v_after < s.checkpoint_sequence THEN
    RAISE EXCEPTION 'subscription rejected (window): reading from sequence % is before the checkpoint %; a replay moves the checkpoint back (DP-43-002: consumers may not infer broader access)', v_after, s.checkpoint_sequence USING ERRCODE = '22023';
  END IF;
  v_limit := least(greatest(coalesce(p_limit, 100), 1), 500);
  v_floor := clock_timestamp() - make_interval(days => ep.retention_days);
  v_head := coalesce((SELECT max(x.sequence) FROM products.event_stream x WHERE x.product_id = s.product_id), 0);
  v_from := CASE WHEN jsonb_typeof(s.granted -> 'from') = 'string' THEN (s.granted ->> 'from')::timestamptz END;
  v_to := CASE WHEN jsonb_typeof(s.granted -> 'to') = 'string' THEN (s.granted ->> 'to')::timestamptz END;
  SELECT array_agg(f) INTO v_fields FROM jsonb_array_elements_text(s.granted -> 'fields') f;
  IF jsonb_typeof(s.filters -> 'event_kinds') = 'array' AND jsonb_array_length(s.filters -> 'event_kinds') > 0 THEN SELECT array_agg(k) INTO v_kinds FROM jsonb_array_elements_text(s.filters -> 'event_kinds') k; END IF;
  IF jsonb_typeof(s.filters -> 'ordering_keys') = 'array' AND jsonb_array_length(s.filters -> 'ordering_keys') > 0 THEN SELECT array_agg(k) INTO v_okeys FROM jsonb_array_elements_text(s.filters -> 'ordering_keys') k; END IF;
  IF jsonb_typeof(s.filters -> 'subject_ids') = 'array' AND jsonb_array_length(s.filters -> 'subject_ids') > 0 THEN SELECT array_agg(k::uuid) INTO v_subjects FROM jsonb_array_elements_text(s.filters -> 'subject_ids') k; END IF;
  IF jsonb_typeof(s.filters -> 'subject_kinds') = 'array' AND jsonb_array_length(s.filters -> 'subject_kinds') > 0
     AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(s.filters -> 'subject_kinds') k WHERE k = ep.subject_kind) THEN
    PERFORM commercial.cme_product_consumption(s.tenant_id, s.domain_id, s.product_id, s.consumer_principal_id, 'subscription_read', 0, gen_random_uuid()::text,   -- B91 meters: the read counted (nothing served)
              jsonb_build_object('subscription_id', p_subscription_id, 'after', v_after, 'served', 0), p_correlation);
    RETURN jsonb_build_object('subscription_id', p_subscription_id, 'product_id', s.product_id, 'product_key', r.product_key, 'after', v_after, 'next_after', v_after, 'head', v_head, 'checkpoint', s.checkpoint_sequence,
                              'served', 0, 'omitted', jsonb_build_object('corrections', 0), 'retention_floor', v_floor, 'window', jsonb_build_object('from', v_from, 'to', v_to), 'events', '[]'::jsonb,
                              'note', 'the subject kind filter excludes this product''s subject kind ' || ep.subject_kind);
  END IF;
  WITH candidates AS (
    SELECT x.* FROM products.event_stream x
     WHERE x.product_id = s.product_id AND x.sequence > v_after AND x.occurred_at >= v_floor
       AND (v_from IS NULL OR x.occurred_at >= v_from) AND (v_to IS NULL OR x.occurred_at <= v_to)
       AND (v_kinds IS NULL OR x.event_kind = ANY (v_kinds)) AND (v_okeys IS NULL OR x.ordering_key = ANY (v_okeys)) AND (v_subjects IS NULL OR x.subject_id = ANY (v_subjects))
     ORDER BY x.sequence LIMIT v_limit)
  SELECT coalesce(jsonb_agg(jsonb_build_object('sequence', c.sequence, 'event_kind', c.event_kind, 'source_event', c.source_event, 'subject_id', c.subject_id, 'subject_kind', ep.subject_kind, 'ordering_key', c.ordering_key,
                                              'occurred_at', c.occurred_at, 'schema_version', c.schema_version, 'payload', products.event_projection(c.payload, v_fields)) ORDER BY c.sequence)
                  FILTER (WHERE s.handles_corrections OR c.event_kind <> 'correction'), '[]'::jsonb),
         count(*) FILTER (WHERE s.handles_corrections OR c.event_kind <> 'correction'), count(*) FILTER (WHERE NOT s.handles_corrections AND c.event_kind = 'correction'), coalesce(max(c.sequence), v_after)
    INTO v_events, v_served, v_omitted, v_next
    FROM candidates c;
  -- B91 meters: B90's CARRYOVER — the read is metered (product_consumption, unit events: the events served) and the consumer's live
  -- registration counts it (products.product_consumers.usage: subscription_reads + 1, events_served + the served count)
  PERFORM commercial.cme_product_consumption(s.tenant_id, s.domain_id, s.product_id, s.consumer_principal_id, 'subscription_read', v_served, gen_random_uuid()::text,
              jsonb_build_object('subscription_id', p_subscription_id, 'after', v_after, 'next_after', v_next, 'served', v_served), p_correlation);
  -- end B91 meters
  RETURN jsonb_build_object('subscription_id', p_subscription_id, 'product_id', s.product_id, 'product_key', r.product_key, 'after', v_after, 'next_after', v_next, 'head', v_head, 'checkpoint', s.checkpoint_sequence,
                            'served', v_served, 'omitted', jsonb_build_object('corrections', v_omitted, 'reason', CASE WHEN v_omitted > 0 THEN 'this subscription declared it cannot process corrections; the correction rows are withheld and counted' END),
                            'retention_floor', v_floor, 'window', jsonb_build_object('from', v_from, 'to', v_to), 'fields', to_jsonb(v_fields), 'events', v_events);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION products.read_subscription_events(uuid,uuid,uuid,bigint,int,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION products.read_subscription_events(uuid,uuid,uuid,bigint,int,uuid,uuid) TO eye_commit;
