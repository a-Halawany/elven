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
    IF p IS NULL OR p !~ '^[a-z][a-z_]*(\.[a-z_]+)*\.$' THEN
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
  SELECT * INTO lic FROM commercial.licences l WHERE l.tenant_id = p_tenant AND l.state <> 'superseded' ORDER BY l.issued_at DESC, l.version DESC LIMIT 1;
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
      IF to_regprocedure('commercial.grace_rules(uuid)') IS NOT NULL THEN
        BEGIN
          EXECUTE 'SELECT to_jsonb(commercial.grace_rules($1))' INTO v_rules USING p_tenant;
          v_rules_source := 'commercial.grace_rules';
        EXCEPTION WHEN OTHERS THEN
          v_rules := NULL; v_rules_source := 'commercial.grace_rules unreadable — default: read and preserve only';
        END;
      END IF;
      IF v_rules IS NULL OR jsonb_typeof(v_rules) <> 'object' THEN
        v_rules := jsonb_build_object('mode', 'read_preserve', 'allow_actions', '[]'::jsonb);
        v_rules_source := coalesce(v_rules_source, 'default: read and preserve only (no grace rules declared)');
      END IF;
      v_avail := coalesce(v_rules ->> 'mode', '') = 'full'
              OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(v_rules -> 'allow_actions') = 'array' THEN v_rules -> 'allow_actions' ELSE '[]'::jsonb END) e
                          WHERE e <> '' AND left(p_action, length(e)) = e);
      v_reason := CASE WHEN v_avail
        THEN format('grace: %s is available under licence v%s in grace (%s)%s', cap.capability_key, lic.version, v_rules_source, CASE WHEN v_indeterminate THEN ' — the entitlement is indeterminate (more than one live licence)' ELSE '' END)
        ELSE format('capability unavailable (entitlement): %s is in grace for this tenant (grace%s; licence v%s) — grace allows reading and preserving work only%s; %s',
                    cap.capability_key, coalesce(' until ' || to_char(lic.grace_until AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI "UTC"'), ''), lic.version,
                    CASE WHEN v_indeterminate THEN ' (the entitlement is indeterminate: more than one live licence)' ELSE '' END, commercial.cen_stays_available()) END;
      v_grace := jsonb_build_object('in_grace', true, 'grace_until', lic.grace_until, 'last_valid', lic.last_valid, 'rules', v_rules, 'rules_source', v_rules_source,
                                    'indeterminate', v_indeterminate, 'expired_pending_transition', lic.state = 'active');
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
  SELECT * INTO lic FROM commercial.licences l WHERE l.tenant_id = p_tenant AND l.state <> 'superseded' ORDER BY l.issued_at DESC, l.version DESC LIMIT 1;
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
