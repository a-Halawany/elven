-- 0095 — CP-6 B90 (2026-09-30): DATA PRODUCTS, SEMANTIC METRICS, THE METADATA CATALOG — F-P7-F-09 (governed data products and event
-- subscriptions), F-P7-F-10 (the semantic analytics layer and certified metrics), F-P7-F-11 (the metadata catalog and data discovery).
-- V7 ch5 (DP-05), ch41 (DP-41), ch43 (DP-43), ch44 (DP-44), ch49 (DP-49); App A DAT-SV-01/03/04/05/10, DAT-TR-01; App B DZ-06/15/16;
-- App G DPD-01..13; App O DADR-016.
--
-- One migration in five sections, the prelude written first by the integrator, the four parts built and proven on their own in parallel
-- worktrees (their harnesses phase6-{products,events,metrics,catalog}-b90), then combined here — no function is re-declared by two sections:
--   §0  the prelude: the schema products, the role data_steward, the canonical DPR object, the PRODUCT REGISTRY core (products_current,
--       product_versions, product_reviews, slo_observations, product_events) and its ports (register, declare, review, release, observe),
--       the widened vocabularies (attention classes and subject kinds, the signature subject kinds)
--   §R  products: consumers, contract tests, scorecards, cost, degradation / withdrawal / retirement with consumer notification (F-P7-F-09)
--   §E  event products and subscriptions: the gateway, the stream, checkpoints, filters, lag policy, replay, revocation (F-P7-F-09)
--   §M  the semantic layer: certified metrics with grain and source revision, the query service, certification withdrawal (F-P7-F-10)
--   §K  the catalog: assets, owners, lineage, glossary, quality, coverage debt, reconciliation, orphan detection, search (F-P7-F-11)
--   §I  the integrator
-- The interface register stays 50/0/0 unless a part says otherwise in its report. Forward-only; 0084–0094 untouched. Every figure a
-- harness seeds is SYNTHETIC.

-- ═════════════════════════════════════════════════════════════════════
-- section `prelude`
-- ═════════════════════════════════════════════════════════════════════
-- 0095 §0 — CP-6 B90 PRELUDE (the integrator, 2026-09-30): the shared vocabulary the four B90 parts build on, written FIRST so no two parts
-- re-declare the same object. What is declared here, and nothing else:
--   * the schema `products` and the role data_steward (DAT-TR-01: registers and curates products, event products, semantic models and
--     catalog assets; never the owner who releases, accepts or certifies);
--   * the canonical object DPR (a released data product version — DP-41-003 "an accountable operational contract, not a renamed table"):
--     the schema-registry row DPR@v1 and the canonical write action products.product.release;
--   * THE PRODUCT REGISTRY CORE: products.products_current (identity, domain, kind, purpose, OWNER — a named active human —, the current
--     declaration, the lifecycle state registered → released → degraded → withdrawn → retired), products.product_versions (every declared
--     version, its digest, its release), products.product_reviews (admission / domain / retirement reviews by a named human other than the
--     owner), products.slo_observations (the ONE ledger every part's measurement lands in — the scorecard reads it), products.product_events
--     (append-only) — and the ports: register_product (products.product.register), declare_product_version (products.product.declare),
--     record_product_review (products.product.review), release_product (products.product.release: the PUBLICATION DENIAL of DP-05-005 — no
--     contract, no accepted admission review, a DUPLICATE CANONICAL AUTHORITY; the DPR version admitted by the service BEFORE the port,
--     which refuses when it is missing), observe_slo (products.slo.observe and the tick's, the subscription's, the metric's own actions);
--   * the widened vocabularies: the attention classes (+ product.degradation, subscription.lag, metric.certification, catalog.coverage) and
--     subject kinds (+ product, subscription, metric, asset); executive.signatures.subject_kind (+ product_release, metric_certification).
-- Forward-only; 0084–0094 untouched.

-- ═════════════════════════════════════════════════════════════════════
-- §0.1 THE SCHEMA AND THE ROLE
-- ═════════════════════════════════════════════════════════════════════
CREATE SCHEMA IF NOT EXISTS products;
GRANT USAGE ON SCHEMA products TO eye_app, eye_commit;

INSERT INTO identity.roles (code, scope, description) VALUES
  ('data_steward', 'DOMAIN', 'The data steward (B90, DAT-TR-01): registers and curates data products, event products, semantic models and catalog assets, records reviews; never the owner who releases, accepts or certifies')
ON CONFLICT (code) DO NOTHING;

-- ═════════════════════════════════════════════════════════════════════
-- §0.2 THE WIDENED VOCABULARIES (each list copied whole from its last declaration — 0094 §0.7 — plus B90's names)
-- ═════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION executive.attention_signal_classes() RETURNS text[]
LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY['forecast.unfit', 'scenario.incoherent', 'warning.raised', 'source.coverage_loss', 'proposal.review', 'decision.material_change', 'review.convened',
  -- B34 (0090)
  'opportunity.raised', 'health.change', 'commitment.due', 'commitment.breach',
  -- B36 (0094)
  'plan.variance', 'publication.correction', 'strategy.detection', 'queue.governance',
  -- B90 (0095)
  'product.degradation', 'subscription.lag', 'metric.certification', 'catalog.coverage'] $$;
ALTER TABLE executive.attention_items DROP CONSTRAINT IF EXISTS attention_items_signal_class_check;
ALTER TABLE executive.attention_items ADD CONSTRAINT attention_items_signal_class_check CHECK (signal_class IN (
  'forecast.unfit', 'scenario.incoherent', 'warning.raised', 'source.coverage_loss', 'proposal.review', 'decision.material_change', 'review.convened',
  'opportunity.raised', 'health.change', 'commitment.due', 'commitment.breach',
  'plan.variance', 'publication.correction', 'strategy.detection', 'queue.governance',
  'product.degradation', 'subscription.lag', 'metric.certification', 'catalog.coverage'));
ALTER TABLE executive.attention_items DROP CONSTRAINT IF EXISTS attention_items_subject_kind_check;
ALTER TABLE executive.attention_items ADD CONSTRAINT attention_items_subject_kind_check CHECK (subject_kind IN (
  'forecast', 'scenario', 'warning', 'source', 'claim', 'package', 'review',
  'exposure', 'health_change', 'commitment_item',
  'plan', 'publication', 'strategy_object', 'queue',
  -- B90 (0095)
  'product', 'subscription', 'metric', 'asset'));

-- the signature subject kinds (0094 §0.2's list whole, plus B90's: a product release, a metric certification)
ALTER TABLE executive.signatures DROP CONSTRAINT IF EXISTS signatures_subject_kind_check;
ALTER TABLE executive.signatures ADD CONSTRAINT signatures_subject_kind_check CHECK (subject_kind IN (
  'approval', 'decision', 'publication', 'queue_transition', 'plan_baseline', 'briefing', 'health_snapshot',
  'product_release', 'metric_certification'));

-- the canonical DPR: the write action and the schema-registry row
INSERT INTO observation.canonical_write_actions (action, object_types, rationale) VALUES
  ('products.product.release', ARRAY['DPR'], 'Releasing a data product version admits it as a DPR object (the accountable operational contract) and nothing else')
ON CONFLICT (action) DO NOTHING;

INSERT INTO objects.schema_registry (object_type, schema_version, json_schema, compatibility) VALUES
('DPR', 'v1', '{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "additionalProperties": false,
  "required": ["product_id","product_key","title","kind","purpose","owner_principal_id","version","state","declaration","declaration_digest","reviews"],
  "properties": {
    "product_id": { "type": "string" },
    "product_key": { "type": "string" },
    "title": { "type": "string" },
    "kind": { "enum": ["object","evidence","dataset","graph","memory","twin_snapshot","forecast","scenario","simulation","decision","briefing","metric","event","search","vector","feature","evaluation_dataset","context","export","marketplace"] },
    "purpose": { "type": "string", "minLength": 8 },
    "owner_principal_id": { "type": "string" },
    "version": { "type": "integer", "minimum": 1 },
    "state": { "enum": ["released","degraded","withdrawn","retired"] },
    "declaration": {
      "type": "object",
      "required": ["contract","serving_modes","inputs","outputs","slo","policy","cost","quality"],
      "properties": {
        "contract": { "type": "object" },
        "serving_modes": { "type": "array", "minItems": 1, "items": { "enum": ["api","event","query","package"] } },
        "inputs": { "type": "array", "items": { "type": "object", "required": ["kind","ref"] } },
        "outputs": { "type": "array", "items": { "type": "object", "required": ["kind","ref"] } },
        "slo": { "type": "object" },
        "policy": { "type": "object", "required": ["purposes"], "properties": { "purposes": { "type": "array", "minItems": 1 } } },
        "cost": { "type": "object" },
        "quality": { "type": "object" }
      }
    },
    "declaration_digest": { "type": "string" },
    "reviews": { "type": "array", "items": { "type": "object", "required": ["review_id","kind","outcome","reviewer_principal_id","reviewed_at"] } },
    "degraded_reason": { "type": ["string","null"] },
    "withdrawal_reason": { "type": ["string","null"] }
  }
}'::jsonb, 'additive')
ON CONFLICT (object_type, schema_version) DO NOTHING;

-- ═════════════════════════════════════════════════════════════════════
-- §0.3 THE PRODUCT REGISTRY CORE
-- ═════════════════════════════════════════════════════════════════════
/* The product KINDS (App G DPD-01..20: the twenty product patterns; a part's product is one of them). */
CREATE OR REPLACE FUNCTION products.product_kinds() RETURNS text[]
LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY['object', 'evidence', 'dataset', 'graph', 'memory', 'twin_snapshot', 'forecast', 'scenario', 'simulation', 'decision', 'briefing',
  'metric', 'event', 'search', 'vector', 'feature', 'evaluation_dataset', 'context', 'export', 'marketplace'] $$;

CREATE TABLE products.products_current (
  product_id           uuid PRIMARY KEY,
  scope                text NOT NULL,
  tenant_id            uuid NOT NULL,
  domain_id            uuid NOT NULL,
  product_key          text NOT NULL CHECK (product_key ~ '^[a-z0-9][a-z0-9.-]{1,63}$'),
  title                text NOT NULL CHECK (length(btrim(title)) BETWEEN 2 AND 200),
  kind                 text NOT NULL CHECK (kind = ANY (products.product_kinds())),
  purpose              text NOT NULL CHECK (length(btrim(purpose)) >= 8),
  owner_principal_id   uuid NOT NULL,                      -- a named, active human of the tenant (DP-41-001 "ownership")
  registered_by        uuid NOT NULL,                      -- the steward or the owner
  state                text NOT NULL DEFAULT 'registered' CHECK (state IN ('registered', 'released', 'degraded', 'withdrawn', 'retired')),
  current_version      int  NOT NULL DEFAULT 0 CHECK (current_version >= 0),
  released_version     int  CHECK (released_version IS NULL OR released_version >= 1),
  declaration          jsonb CHECK (declaration IS NULL OR jsonb_typeof(declaration) = 'object'),   -- the CURRENT declaration (the released one when released)
  declaration_digest   text CHECK (declaration_digest IS NULL OR declaration_digest ~ '^[0-9a-f]{64}$'),
  degraded_reason      text,
  degraded_at          timestamptz,
  withdrawn_at         timestamptz,
  withdrawn_by         uuid,
  withdrawal_reason    text,
  retired_at           timestamptz,
  retired_by           uuid,
  registered_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at           timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id       uuid NOT NULL,
  CONSTRAINT pdp_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT pdp_key_per_domain UNIQUE (tenant_id, domain_id, product_key),
  CONSTRAINT pdp_released_bound CHECK ((state IN ('released', 'degraded')) = (released_version IS NOT NULL) OR state IN ('withdrawn', 'retired')),
  CONSTRAINT pdp_degraded_bound CHECK ((state = 'degraded') = (degraded_reason IS NOT NULL AND degraded_at IS NOT NULL) OR state <> 'degraded'),
  CONSTRAINT pdp_withdrawn_bound CHECK ((state = 'withdrawn') = (withdrawn_at IS NOT NULL AND withdrawn_by IS NOT NULL AND withdrawal_reason IS NOT NULL) OR state = 'retired'),
  CONSTRAINT pdp_retired_bound CHECK ((state = 'retired') = (retired_at IS NOT NULL AND retired_by IS NOT NULL))
);
CREATE INDEX pdp_domain ON products.products_current (tenant_id, domain_id, kind, state);
COMMENT ON TABLE products.products_current IS 'B90 (0095 §0): the data product registry — one row per governed data product (DP-41-002: identity, domain, owner, contract versions, serving modes, SLOs, policy, consumers, release, retirement); the declaration is the versioned contract, the state its lifecycle.';

/* A product row never leaves the registry (its retirement is a state); the ports move it forward. */
CREATE OR REPLACE FUNCTION products.no_delete() RETURNS trigger
SET search_path = products, pg_catalog, pg_temp AS $$
BEGIN RAISE EXCEPTION 'products registry rows are never deleted: DELETE prohibited' USING ERRCODE = '2F002'; END $$ LANGUAGE plpgsql;
CREATE TRIGGER pdp_no_delete BEFORE DELETE ON products.products_current FOR EACH ROW EXECUTE FUNCTION products.no_delete();

CREATE TABLE products.product_versions (
  product_id      uuid NOT NULL REFERENCES products.products_current (product_id),
  version         int  NOT NULL CHECK (version >= 1),
  tenant_id       uuid NOT NULL,
  domain_id       uuid NOT NULL,
  declaration     jsonb NOT NULL CHECK (jsonb_typeof(declaration) = 'object'),
  digest          text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  declared_by     uuid NOT NULL,
  declared_at     timestamptz NOT NULL DEFAULT clock_timestamp(),
  released_by     uuid,
  released_at     timestamptz,
  correlation_id  uuid NOT NULL,
  PRIMARY KEY (product_id, version),
  CONSTRAINT pdv_release_pair CHECK ((released_by IS NULL) = (released_at IS NULL))
);
COMMENT ON TABLE products.product_versions IS 'B90 (0095 §0): every declared version of a product''s contract with its digest; the release instant and the releasing owner set ONCE (products.versions_forward).';
/* A version row moves one way: declared → released (the pair set once); nothing else of the row changes; never deleted. */
CREATE OR REPLACE FUNCTION products.versions_forward() RETURNS trigger
SET search_path = products, pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'product versions are append-only: DELETE prohibited' USING ERRCODE = '2F002'; END IF;
  IF OLD.released_at IS NOT NULL OR NEW.released_at IS NULL OR (to_jsonb(NEW) - 'released_at' - 'released_by') <> (to_jsonb(OLD) - 'released_at' - 'released_by') THEN
    RAISE EXCEPTION 'product version %/% is immutable; only its release instant is set, once', OLD.product_id, OLD.version USING ERRCODE = '2F002';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER pdv_forward BEFORE UPDATE OR DELETE ON products.product_versions FOR EACH ROW EXECUTE FUNCTION products.versions_forward();

CREATE TABLE products.product_reviews (
  review_id             uuid PRIMARY KEY,
  product_id            uuid NOT NULL REFERENCES products.products_current (product_id),
  version               int  NOT NULL CHECK (version >= 1),
  tenant_id             uuid NOT NULL,
  domain_id             uuid NOT NULL,
  kind                  text NOT NULL CHECK (kind IN ('admission', 'domain', 'retirement')),
  outcome               text NOT NULL CHECK (outcome IN ('accepted', 'rejected', 'deferred')),
  reviewer_principal_id uuid NOT NULL,                      -- a named human, never the owner (DP-05-006 "domain reviews")
  notes                 text NOT NULL CHECK (length(btrim(notes)) >= 8),
  evidence              jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(evidence) = 'object'),
  reviewed_at           timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id        uuid NOT NULL
);
CREATE INDEX pdr_product ON products.product_reviews (product_id, version, kind, reviewed_at);
CREATE TRIGGER pdr_append_only BEFORE UPDATE OR DELETE ON products.product_reviews FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE products.product_reviews IS 'B90 (0095 §0): the reviews a product''s admission and continued operation require (DP-05-006, DP-41-006) — append-only, by a named human other than the owner.';

CREATE TABLE products.slo_observations (
  observation_id  uuid PRIMARY KEY,
  product_id      uuid NOT NULL REFERENCES products.products_current (product_id),
  tenant_id       uuid NOT NULL,
  domain_id       uuid NOT NULL,
  measure         text NOT NULL CHECK (measure ~ '^[a-z][a-z0-9_]{1,63}$'),   -- freshness_seconds | lag_events | lag_seconds | availability_pct | quality_pct | …
  value           numeric NOT NULL,
  threshold       numeric,
  met             boolean NOT NULL,
  source          text NOT NULL CHECK (length(btrim(source)) BETWEEN 2 AND 120),   -- which part / step observed it
  details         jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
  observed_at     timestamptz NOT NULL DEFAULT clock_timestamp(),
  observed_by     uuid NOT NULL,
  correlation_id  uuid NOT NULL
);
CREATE INDEX pso_product ON products.slo_observations (product_id, measure, observed_at DESC);
CREATE TRIGGER pso_append_only BEFORE UPDATE OR DELETE ON products.slo_observations FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE products.slo_observations IS 'B90 (0095 §0): the ONE SLO ledger — every part''s measurement of a product (the subscription lag, the metric freshness, a contract test, an availability probe) lands here; the scorecard (§R) reads it. Append-only.';

CREATE TABLE products.product_events (
  event_id           uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  product_id         uuid NOT NULL REFERENCES products.products_current (product_id),
  event              text NOT NULL CHECK (event IN (
    -- §0 the registry
    'product.registered', 'product.declared', 'product.reviewed', 'product.released',
    -- §R the lifecycle, the consumers, the scorecard, the cost
    'product.degraded', 'product.restored', 'product.withdrawn', 'product.retired',
    'consumer.registered', 'consumer.accepted', 'consumer.rejected', 'consumer.revoked', 'consumer.migrated', 'contract_test.recorded', 'scorecard.computed', 'cost.attributed',
    -- §E the event product and its subscriptions
    'event_product.declared', 'events.emitted', 'subscription.registered', 'subscription.authorized', 'subscription.paused', 'subscription.resumed', 'subscription.revoked',
    'subscription.lagging', 'subscription.conformed', 'checkpoint.advanced', 'events.replayed',
    -- §M the semantic model
    'metric.declared', 'metric.certified', 'metric.certification_withdrawn', 'metric.definition_changed', 'metric.recalculated',
    -- §K the catalog
    'asset.catalogued', 'asset.flagged', 'asset.reconciled', 'asset.recertified')),
  occurred_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  actor_principal_id uuid,
  details            jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
  correlation_id     uuid NOT NULL,
  CONSTRAINT pde_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX pde_product ON products.product_events (product_id, occurred_at);
CREATE TRIGGER pde_append_only BEFORE UPDATE OR DELETE ON products.product_events FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE products.product_events IS 'B90 (0095 §0): the append-only ledger of everything that happens to a data product — the parts append their own events (the list holds every part''s names; the integrator widens it at §I if a part reports one more).';

-- RLS and grants (the 0081 loop idiom; the ports write)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['products_current', 'product_versions', 'product_reviews', 'slo_observations', 'product_events'] LOOP
    EXECUTE format('REVOKE ALL ON products.%I FROM PUBLIC', t);
    EXECUTE format('ALTER TABLE products.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE products.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY products_isolation ON products.%I
        USING (
          tenant_id = public.eye_tenant()
          AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain())
        )$f$, t);
    EXECUTE format('GRANT SELECT ON products.%I TO eye_app, eye_commit', t);
  END LOOP;
END $$;

-- ═════════════════════════════════════════════════════════════════════
-- §0.4 THE PORTS
-- ═════════════════════════════════════════════════════════════════════
/* The product as JSON (every read and every port's answer): the row minus its scope and correlation. */
CREATE OR REPLACE FUNCTION products.product_json(r products.products_current) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$ SELECT to_jsonb(r) - 'scope' - 'correlation_id' $$;

/* What is wrong with a DECLARATION (NULL when nothing is): the contract (schema references that exist in the registry, or declared
   fields), the serving modes, the inputs and outputs (each a kind and a ref), the SLO, the policy (its purposes), the cost, the quality.
   A product without a contract is not a product (DP-41-003) — the declaration port refuses it, so a release never meets one. */
CREATE OR REPLACE FUNCTION products.declaration_problem(d jsonb) RETURNS text
LANGUAGE plpgsql STABLE SET search_path = products, objects, pg_catalog, pg_temp AS $$
DECLARE e jsonb; v_kind text;
BEGIN
  IF d IS NULL OR jsonb_typeof(d) <> 'object' THEN RETURN 'a declaration is an object'; END IF;
  IF jsonb_typeof(d -> 'contract') <> 'object' THEN RETURN 'a declaration carries a contract object'; END IF;
  IF jsonb_typeof(d #> '{contract,schema}') = 'array' AND jsonb_array_length(d #> '{contract,schema}') >= 1 THEN
    FOR e IN SELECT x FROM jsonb_array_elements(d #> '{contract,schema}') x LOOP
      IF jsonb_typeof(e) <> 'object' OR jsonb_typeof(e -> 'object_type') <> 'string' OR jsonb_typeof(e -> 'schema_version') <> 'string' THEN
        RETURN 'a contract schema reference names an object_type and a schema_version';
      END IF;
      IF NOT EXISTS (SELECT 1 FROM objects.schema_registry s WHERE s.object_type = e ->> 'object_type' AND s.schema_version = e ->> 'schema_version') THEN
        RETURN format('contract schema %s@%s is not in the schema registry', e ->> 'object_type', e ->> 'schema_version');
      END IF;
    END LOOP;
  ELSIF jsonb_typeof(d #> '{contract,fields}') = 'array' AND jsonb_array_length(d #> '{contract,fields}') >= 1 THEN
    FOR e IN SELECT x FROM jsonb_array_elements(d #> '{contract,fields}') x LOOP
      IF jsonb_typeof(e) <> 'object' OR jsonb_typeof(e -> 'name') <> 'string' OR jsonb_typeof(e -> 'type') <> 'string' THEN RETURN 'a contract field names a name and a type'; END IF;
    END LOOP;
  ELSE
    RETURN 'a contract references at least one registered schema (contract.schema) or declares at least one field (contract.fields)';
  END IF;
  IF jsonb_typeof(d -> 'serving_modes') <> 'array' OR jsonb_array_length(d -> 'serving_modes') = 0 THEN RETURN 'a declaration names at least one serving mode'; END IF;
  FOR e IN SELECT x FROM jsonb_array_elements(d -> 'serving_modes') x LOOP
    IF jsonb_typeof(e) <> 'string' OR (e #>> '{}') NOT IN ('api', 'event', 'query', 'package') THEN RETURN 'a serving mode is api, event, query or package'; END IF;
  END LOOP;
  FOREACH v_kind IN ARRAY ARRAY['inputs', 'outputs'] LOOP
    IF jsonb_typeof(d -> v_kind) <> 'array' THEN RETURN format('a declaration carries %s (an array; empty when none)', v_kind); END IF;
    FOR e IN SELECT x FROM jsonb_array_elements(d -> v_kind) x LOOP
      IF jsonb_typeof(e) <> 'object' OR jsonb_typeof(e -> 'kind') <> 'string' OR jsonb_typeof(e -> 'ref') <> 'string'
         OR (e ->> 'kind') NOT IN ('source', 'product', 'object_type', 'asset', 'relation', 'external') THEN
        RETURN format('each of %s names a kind (source | product | object_type | asset | relation | external) and a ref', v_kind);
      END IF;
    END LOOP;
  END LOOP;
  IF jsonb_typeof(d -> 'slo') <> 'object' THEN RETURN 'a declaration carries an slo object (its service levels; empty when none are promised)'; END IF;
  IF jsonb_typeof(d -> 'policy') <> 'object' OR jsonb_typeof(d #> '{policy,purposes}') <> 'array' OR jsonb_array_length(d #> '{policy,purposes}') = 0 THEN
    RETURN 'a declaration carries a policy object naming at least one purpose';
  END IF;
  IF jsonb_typeof(d -> 'cost') <> 'object' THEN RETURN 'a declaration carries a cost object (its attribution basis; empty when unknown)'; END IF;
  IF jsonb_typeof(d -> 'quality') <> 'object' THEN RETURN 'a declaration carries a quality object (its declared quality; empty when unknown)'; END IF;
  RETURN NULL;
END $$;

/* REGISTER (products.product.register): the owner's or a steward's act; the owner a named, active human of the tenant; the key unique in
   the domain; the product opens `registered` with no declaration (the declaration is a version). */
CREATE OR REPLACE FUNCTION products.register_product(
  p_product_id uuid, p_tenant uuid, p_domain uuid, p_key text, p_title text, p_kind text, p_purpose text, p_owner uuid, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = products, executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r products.products_current%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['products.product.register']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'data product rejected (actor): registered by the acting principal' USING ERRCODE = '42501'; END IF;
  IF p_owner IS DISTINCT FROM p_actor AND NOT executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['data_steward', 'domain_admin', 'platform_admin']) THEN
    RAISE EXCEPTION 'data product rejected (authority): a product is registered by its owner or by a data steward' USING ERRCODE = '42501';
  END IF;
  IF p_key IS NULL OR p_key !~ '^[a-z0-9][a-z0-9.-]{1,63}$' THEN RAISE EXCEPTION 'data product rejected (key): a product key is 2–64 lower-case letters, digits, dots and dashes' USING ERRCODE = '22023'; END IF;
  IF p_title IS NULL OR length(btrim(p_title)) NOT BETWEEN 2 AND 200 THEN RAISE EXCEPTION 'data product rejected (title): a title is 2–200 characters' USING ERRCODE = '22023'; END IF;
  IF p_kind IS NULL OR p_kind <> ALL (products.product_kinds()) THEN RAISE EXCEPTION 'data product rejected (kind): % is not a product kind (App G DPD-01..20)', coalesce(p_kind, 'null') USING ERRCODE = '22023'; END IF;
  IF p_purpose IS NULL OR length(btrim(p_purpose)) < 8 THEN RAISE EXCEPTION 'data product rejected (purpose): a product states its purpose (8+ characters)' USING ERRCODE = '22023'; END IF;
  IF p_owner IS NULL OR NOT EXISTS (SELECT 1 FROM identity.principals x WHERE x.id = p_owner AND x.tenant_id = p_tenant AND x.kind = 'human' AND x.status = 'active') THEN
    RAISE EXCEPTION 'data product rejected (unknown_owner): the owner is a named, active human of the tenant' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM products.products_current x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.product_key = p_key) THEN
    RAISE EXCEPTION 'data product rejected (duplicate): key % is already registered in this domain', p_key USING ERRCODE = '23505';
  END IF;
  INSERT INTO products.products_current (product_id, scope, tenant_id, domain_id, product_key, title, kind, purpose, owner_principal_id, registered_by, correlation_id)
  VALUES (p_product_id, 'DOMAIN', p_tenant, p_domain, p_key, btrim(p_title), p_kind, btrim(p_purpose), p_owner, p_actor, p_correlation) RETURNING * INTO r;
  INSERT INTO products.product_events (event_id, scope, tenant_id, domain_id, product_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_product_id, 'product.registered', p_actor,
          jsonb_build_object('product_key', p_key, 'kind', p_kind, 'owner_principal_id', p_owner), p_correlation);
  RETURN products.product_json(r);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION products.register_product(uuid,uuid,uuid,text,text,text,text,uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION products.register_product(uuid,uuid,uuid,text,text,text,text,uuid,uuid,uuid,uuid) TO eye_commit;

/* DECLARE A VERSION (products.product.declare): the owner's or a steward's act; the declaration validated whole (declaration_problem);
   the next version appended with its digest; the product's current declaration moves to it (the RELEASED declaration is the released
   version's — a reader who needs the served contract reads product_versions at released_version). Refused on a withdrawn or retired product. */
CREATE OR REPLACE FUNCTION products.declare_product_version(
  p_product_id uuid, p_tenant uuid, p_domain uuid, p_declaration jsonb, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = products, executive, identity, observation, objects, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r products.products_current%ROWTYPE; v_problem text; v_version int; v_digest text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['products.product.declare']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'data product rejected (actor): declared by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO r FROM products.products_current x WHERE x.product_id = p_product_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'data product rejected (unknown_product): % is not a product of this domain', p_product_id USING ERRCODE = '22023'; END IF;
  IF r.owner_principal_id <> p_actor AND NOT executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['data_steward', 'domain_admin', 'platform_admin']) THEN
    RAISE EXCEPTION 'data product rejected (authority): a version is declared by the product''s owner or by a data steward' USING ERRCODE = '42501';
  END IF;
  IF r.state IN ('withdrawn', 'retired') THEN RAISE EXCEPTION 'data product rejected (state): product % is %; a withdrawn or retired product takes no new version', r.product_key, r.state USING ERRCODE = '22023'; END IF;
  v_problem := products.declaration_problem(p_declaration);
  IF v_problem IS NOT NULL THEN RAISE EXCEPTION 'data product rejected (declaration): %', v_problem USING ERRCODE = '22023'; END IF;
  v_version := r.current_version + 1;
  v_digest := encode(digest(p_declaration::text, 'sha256'), 'hex');
  INSERT INTO products.product_versions (product_id, version, tenant_id, domain_id, declaration, digest, declared_by, correlation_id)
  VALUES (p_product_id, v_version, p_tenant, p_domain, p_declaration, v_digest, p_actor, p_correlation);
  UPDATE products.products_current SET current_version = v_version, declaration = p_declaration, declaration_digest = v_digest, updated_at = clock_timestamp()
   WHERE product_id = p_product_id RETURNING * INTO r;
  INSERT INTO products.product_events (event_id, scope, tenant_id, domain_id, product_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_product_id, 'product.declared', p_actor, jsonb_build_object('version', v_version, 'digest', v_digest), p_correlation);
  RETURN products.product_json(r) || jsonb_build_object('version', v_version, 'digest', v_digest);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION products.declare_product_version(uuid,uuid,uuid,jsonb,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION products.declare_product_version(uuid,uuid,uuid,jsonb,uuid,uuid,uuid) TO eye_commit;

/* RECORD A REVIEW (products.product.review): a named human holding data_steward, domain_admin, executive or platform_admin — never the
   product's owner (the separation DP-05-006 requires of a domain review) — records an admission, domain or retirement review of a declared
   version with an outcome, notes and evidence. Append-only. */
CREATE OR REPLACE FUNCTION products.record_product_review(
  p_review_id uuid, p_product_id uuid, p_tenant uuid, p_domain uuid, p_version int, p_kind text, p_outcome text, p_notes text, p_evidence jsonb, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = products, executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r products.products_current%ROWTYPE; rv products.product_reviews%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['products.product.review']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'data product rejected (actor): reviewed by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO r FROM products.products_current x WHERE x.product_id = p_product_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'data product rejected (unknown_product): % is not a product of this domain', p_product_id USING ERRCODE = '22023'; END IF;
  IF r.owner_principal_id = p_actor THEN RAISE EXCEPTION 'data product rejected (separation): the owner does not review their own product' USING ERRCODE = '42501'; END IF;
  IF NOT executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['data_steward', 'domain_admin', 'executive', 'platform_admin']) THEN
    RAISE EXCEPTION 'data product rejected (authority): a review is recorded by a named human holding data_steward, domain_admin, executive or platform_admin' USING ERRCODE = '42501';
  END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('admission', 'domain', 'retirement') THEN RAISE EXCEPTION 'data product rejected (review_kind): a review is an admission, domain or retirement review' USING ERRCODE = '22023'; END IF;
  IF p_outcome IS NULL OR p_outcome NOT IN ('accepted', 'rejected', 'deferred') THEN RAISE EXCEPTION 'data product rejected (outcome): a review''s outcome is accepted, rejected or deferred' USING ERRCODE = '22023'; END IF;
  IF p_notes IS NULL OR length(btrim(p_notes)) < 8 THEN RAISE EXCEPTION 'data product rejected (notes): a review carries notes (8+ characters)' USING ERRCODE = '22023'; END IF;
  IF p_evidence IS NOT NULL AND jsonb_typeof(p_evidence) <> 'object' THEN RAISE EXCEPTION 'data product rejected (evidence): a review''s evidence is an object' USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM products.product_versions v WHERE v.product_id = p_product_id AND v.version = p_version) THEN
    RAISE EXCEPTION 'data product rejected (unknown_version): product % has no version %', r.product_key, p_version USING ERRCODE = '22023';
  END IF;
  INSERT INTO products.product_reviews (review_id, product_id, version, tenant_id, domain_id, kind, outcome, reviewer_principal_id, notes, evidence, correlation_id)
  VALUES (p_review_id, p_product_id, p_version, p_tenant, p_domain, p_kind, p_outcome, p_actor, btrim(p_notes), coalesce(p_evidence, '{}'::jsonb), p_correlation) RETURNING * INTO rv;
  INSERT INTO products.product_events (event_id, scope, tenant_id, domain_id, product_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_product_id, 'product.reviewed', p_actor,
          jsonb_build_object('review_id', p_review_id, 'version', p_version, 'kind', p_kind, 'outcome', p_outcome), p_correlation);
  RETURN to_jsonb(rv) - 'tenant_id' - 'domain_id' - 'correlation_id';
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION products.record_product_review(uuid,uuid,uuid,uuid,int,text,text,text,jsonb,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION products.record_product_review(uuid,uuid,uuid,uuid,int,text,text,text,jsonb,uuid,uuid,uuid) TO eye_commit;

/* RELEASE (products.product.release) — THE PUBLICATION DENIAL (DP-05-005, DP-41-006): the OWNER's act; the version declared and newer than
   the released one; a contract (the declaration port guarantees it; asserted again here); an ACCEPTED ADMISSION REVIEW of that version by
   someone else; no DUPLICATE CANONICAL AUTHORITY — an output marked authority:true over a kind+ref another released product of the domain
   already holds authority over is refused and the canonical owner NAMED; the canonical DPR version admitted by the service BEFORE the port
   (missing → refused: the object and the registry move together or not at all). A released product's degradation clears on release. */
CREATE OR REPLACE FUNCTION products.release_product(
  p_product_id uuid, p_tenant uuid, p_domain uuid, p_version int, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = products, executive, identity, observation, objects, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r products.products_current%ROWTYPE; v products.product_versions%ROWTYPE; o jsonb; v_holder text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['products.product.release']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'data product rejected (actor): released by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO r FROM products.products_current x WHERE x.product_id = p_product_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'data product rejected (unknown_product): % is not a product of this domain', p_product_id USING ERRCODE = '22023'; END IF;
  IF r.owner_principal_id <> p_actor THEN RAISE EXCEPTION 'data product rejected (not_owner): product % is released by its owner', r.product_key USING ERRCODE = '42501'; END IF;
  IF r.state NOT IN ('registered', 'released', 'degraded') THEN RAISE EXCEPTION 'data product rejected (state): product % is %', r.product_key, r.state USING ERRCODE = '22023'; END IF;
  SELECT * INTO v FROM products.product_versions x WHERE x.product_id = p_product_id AND x.version = p_version;
  IF NOT FOUND THEN RAISE EXCEPTION 'data product rejected (unknown_version): product % has no version %', r.product_key, p_version USING ERRCODE = '22023'; END IF;
  IF r.released_version IS NOT NULL AND p_version <= r.released_version THEN
    RAISE EXCEPTION 'data product rejected (state): version % of product % is not newer than the released version %', p_version, r.product_key, r.released_version USING ERRCODE = '22023';
  END IF;
  IF products.declaration_problem(v.declaration) IS NOT NULL THEN
    RAISE EXCEPTION 'data product rejected (contract): publication denied — version % of product % declares no contract (%)', p_version, r.product_key, products.declaration_problem(v.declaration) USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM products.product_reviews x WHERE x.product_id = p_product_id AND x.version = p_version AND x.kind = 'admission' AND x.outcome = 'accepted') THEN
    RAISE EXCEPTION 'data product rejected (review): publication denied — version % of product % has no accepted admission review', p_version, r.product_key USING ERRCODE = '22023';
  END IF;
  FOR o IN SELECT x FROM jsonb_array_elements(v.declaration -> 'outputs') x WHERE (x ->> 'authority') = 'true' LOOP
    SELECT q.product_key INTO v_holder
      FROM products.products_current q
      JOIN products.product_versions qv ON qv.product_id = q.product_id AND qv.version = q.released_version
     WHERE q.tenant_id = p_tenant AND q.domain_id = p_domain AND q.product_id <> p_product_id AND q.state IN ('released', 'degraded')
       AND EXISTS (SELECT 1 FROM jsonb_array_elements(qv.declaration -> 'outputs') y
                    WHERE (y ->> 'authority') = 'true' AND y ->> 'kind' = o ->> 'kind' AND y ->> 'ref' = o ->> 'ref')
     LIMIT 1;
    IF v_holder IS NOT NULL THEN
      RAISE EXCEPTION 'data product rejected (duplicate_authority): publication denied — product % already holds canonical authority over %:%; reconcile with its owner', v_holder, o ->> 'kind', o ->> 'ref' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM objects.canonical_objects c WHERE c.object_id = p_product_id AND c.object_type = 'DPR' AND c.object_version = p_version AND c.tenant_id = p_tenant) THEN
    RAISE EXCEPTION 'data product rejected (canonical): version % of product % was not admitted as a DPR object in this write', p_version, r.product_key USING ERRCODE = '22023';
  END IF;
  UPDATE products.product_versions SET released_by = p_actor, released_at = clock_timestamp() WHERE product_id = p_product_id AND version = p_version;
  UPDATE products.products_current
     SET state = 'released', released_version = p_version, declaration = v.declaration, declaration_digest = v.digest, degraded_reason = NULL, degraded_at = NULL, updated_at = clock_timestamp()
   WHERE product_id = p_product_id RETURNING * INTO r;
  INSERT INTO products.product_events (event_id, scope, tenant_id, domain_id, product_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_product_id, 'product.released', p_actor, jsonb_build_object('version', p_version, 'digest', v.digest), p_correlation);
  RETURN products.product_json(r);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION products.release_product(uuid,uuid,uuid,int,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION products.release_product(uuid,uuid,uuid,int,uuid,uuid,uuid) TO eye_commit;

/* OBSERVE AN SLO MEASURE — the one ledger. Bound to the observer's own action: a human's or a probe's products.slo.observe, the attention
   tick's step (§E's lag evaluation, §R's scorecard, §M's certification sweep, §K's reconciliation run under executive.attention.tick), a
   subscription checkpoint (§E), a metric served (§M), a contract test (§R). Never on a retired product. */
CREATE OR REPLACE FUNCTION products.observe_slo(
  p_observation_id uuid, p_product_id uuid, p_tenant uuid, p_domain uuid, p_measure text, p_value numeric, p_threshold numeric, p_met boolean, p_source text, p_details jsonb, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = products, executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r products.products_current%ROWTYPE; s products.slo_observations%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['products.slo.observe', 'executive.attention.tick', 'products.subscription.checkpoint', 'products.subscription.read',
                                             'products.metric.serve', 'products.metric.certify', 'products.product.contract_test', 'products.product.scorecard.compute']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT * INTO r FROM products.products_current x WHERE x.product_id = p_product_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'data product rejected (unknown_product): % is not a product of this domain', p_product_id USING ERRCODE = '22023'; END IF;
  IF r.state = 'retired' THEN RAISE EXCEPTION 'data product rejected (state): product % is retired; nothing is observed on it', r.product_key USING ERRCODE = '22023'; END IF;
  IF p_measure IS NULL OR p_measure !~ '^[a-z][a-z0-9_]{1,63}$' THEN RAISE EXCEPTION 'data product rejected (measure): an SLO measure is a lower-case identifier' USING ERRCODE = '22023'; END IF;
  IF p_value IS NULL OR p_met IS NULL THEN RAISE EXCEPTION 'data product rejected (observation): an observation carries a value and whether the level was met' USING ERRCODE = '22023'; END IF;
  IF p_source IS NULL OR length(btrim(p_source)) NOT BETWEEN 2 AND 120 THEN RAISE EXCEPTION 'data product rejected (source): an observation names its source' USING ERRCODE = '22023'; END IF;
  INSERT INTO products.slo_observations (observation_id, product_id, tenant_id, domain_id, measure, value, threshold, met, source, details, observed_by, correlation_id)
  VALUES (p_observation_id, p_product_id, p_tenant, p_domain, p_measure, p_value, p_threshold, p_met, btrim(p_source), coalesce(p_details, '{}'::jsonb), coalesce(p_actor, public.eye_principal()), p_correlation)
  RETURNING * INTO s;
  RETURN to_jsonb(s) - 'tenant_id' - 'domain_id' - 'correlation_id';
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION products.observe_slo(uuid,uuid,uuid,uuid,text,numeric,numeric,boolean,text,jsonb,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION products.observe_slo(uuid,uuid,uuid,uuid,text,numeric,numeric,boolean,text,jsonb,uuid,uuid) TO eye_commit;

/* THE PRODUCT READ (an invoker read under the caller's RLS): the product, its versions, its reviews, the latest observation per measure. */
CREATE OR REPLACE FUNCTION products.product_read(p_product_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = products, pg_catalog, pg_temp AS $$
  SELECT products.product_json(r)
         || jsonb_build_object(
              'versions', coalesce((SELECT jsonb_agg(jsonb_build_object('version', v.version, 'digest', v.digest, 'declared_by', v.declared_by, 'declared_at', v.declared_at,
                                                                         'released_by', v.released_by, 'released_at', v.released_at) ORDER BY v.version)
                                      FROM products.product_versions v WHERE v.product_id = r.product_id), '[]'::jsonb),
              'reviews', coalesce((SELECT jsonb_agg((to_jsonb(x) - 'tenant_id' - 'domain_id' - 'correlation_id') ORDER BY x.reviewed_at)
                                     FROM products.product_reviews x WHERE x.product_id = r.product_id), '[]'::jsonb),
              'slo', coalesce((SELECT jsonb_object_agg(m.measure, jsonb_build_object('value', m.value, 'threshold', m.threshold, 'met', m.met, 'observed_at', m.observed_at, 'source', m.source))
                                 FROM (SELECT DISTINCT ON (s.measure) s.* FROM products.slo_observations s WHERE s.product_id = r.product_id ORDER BY s.measure, s.observed_at DESC) m), '{}'::jsonb))
    FROM products.products_current r WHERE r.product_id = p_product_id
$$;
GRANT EXECUTE ON FUNCTION products.product_read(uuid) TO eye_app, eye_commit;
GRANT EXECUTE ON FUNCTION products.product_json(products.products_current) TO eye_app, eye_commit;
GRANT EXECUTE ON FUNCTION products.declaration_problem(jsonb) TO eye_app, eye_commit;
GRANT EXECUTE ON FUNCTION products.product_kinds() TO eye_app, eye_commit;
