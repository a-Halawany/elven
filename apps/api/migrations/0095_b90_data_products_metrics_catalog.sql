-- 0095 — CP-6 B90 (2026-09-30): DATA PRODUCTS, SEMANTIC METRICS, THE METADATA CATALOG — F-P7-F-09 (governed data products and event
-- subscriptions), F-P7-F-10 (the semantic analytics layer and certified metrics), F-P7-F-11 (the metadata catalog and data discovery).
-- V7 ch5 (DP-05), ch41 (DP-41), ch43 (DP-43), ch44 (DP-44), ch49 (DP-49); App A DAT-SV-01/03/04/05/10, DAT-TR-01; App B DZ-06/15/16;
-- App G DPD-01..13; App O DADR-016.
--
-- One migration in five sections, the prelude written first by the integrator, the four parts built and proven on their own in parallel
-- worktrees (their harnesses phase6-{products,events,metrics,catalog}-b90), then combined here in the apply order every fresh-database run
-- used (§0, then the part files alphabetically: §K catalog, §E events, §M metrics, §R products) — no function is re-declared by two sections:
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

-- ═════════════════════════════════════════════════════════════════════
-- section `catalog` (§K) — the part-local file 0095_b90_x_catalog.sql, combined here at integration in the apply order every fresh-database run used (§0, §K, §E, §M, §R)
-- ═════════════════════════════════════════════════════════════════════
-- ═════════════════════════════════════════════════════════════════════
-- section `catalog` (§K) — the part-local file 0095_b90_x_catalog.sql, combined into 0095 at integration after §R, §E and §M
-- ═════════════════════════════════════════════════════════════════════
-- 0095 §K — CP-6 B90 part `catalog` (2026-09-30): THE METADATA CATALOG AND DATA DISCOVERY — F-P7-F-11; V7 ch49 DP-49-001..006; App A
-- DAT-TR-01. Built on the §0 prelude (the schema products, the role data_steward, products.products_current, the one SLO ledger); nothing
-- of §0, §R, §E or §M re-declared. Forward-only; 0084–0094 untouched. Every figure a harness seeds is SYNTHETIC.
--
-- WHAT THE CATALOG IS (DP-49-001): one row per data ASSET — a schema of objects.schema_registry (kind@version), a canonical field of
-- objects.canonical_field_registry, a source of observation.source_contracts_current, a data product of products.products_current (every
-- kind: the event products and the semantic models are products), a STAGING asset a steward declares (a table, a file drop, an extract)
-- and an EXTERNAL asset by reference (a partner's dataset) — with its identity (kind + ref, unique in the domain), title, description,
-- OWNER (nullable → coverage debt), classification, contracts, locations, glossary terms, quality, SLO, consumers, release, the source's
-- own lifecycle state (`unknown` when its registry does not say), discoverable / trusted, the FLAGS with since and reason, the runtime
-- observation (when the reconciliation last saw the asset in its registry), the ownership recertification date.
--
-- THE AUTHORITY BOUNDARY (DP-49-003, kept): the catalog DESCRIBES and INDEXES authority; it writes no source, no schema, no product and no
-- canonical object. Its ports write products.catalog_* and products.lineage_edges / products.glossary_terms only; the reconciliation READS
-- the registries and copies what they say.
--
-- THE CONTINUITY RULE (DP-49-006): "when catalog coverage, ownership, lineage, policy or runtime observations are missing, stale, duplicated
-- or inconsistent: mark affected assets UNDISCOVERABLE or UNTRUSTED, stop new consumption where required, reconcile authoritative
-- registries, expose COVERAGE DEBT". Here: a flag of kind orphan makes an asset UNDISCOVERABLE; a flag of kind stale, ownership_lapsed or
-- inconsistent makes it UNTRUSTED; unowned, duplicate and lineage_missing are debt the coverage read exposes and the steward resolves.
-- The stop of new consumption is a read every consumer may consult: products.catalog_trust(kind, ref). The staleness period is 7 days,
-- the ownership recertification period 180 days (constants declared below, named once).
--
-- HUMAN AUTHORITY: a named human — the data steward, or the asset's owner — catalogues, sets owners, declares lineage, defines terms,
-- flags and reconciles; the OWNER alone recertifies their ownership. The attention tick's step catalog-reconcile (order 66) runs the
-- reconciliation under executive.attention.tick; a new orphan or ownership_lapsed flag raises an attention item of class catalog.coverage
-- (subject kind asset) routed to the asset's owner when one is an active human, else to the class's roles under the active attention
-- policy (the harness publishes data_steward).
--
-- THE REFUSAL FAMILIES (mapped in observation-errors.ts, the `/* B90 catalog */` block): `catalog asset rejected (<class>)`, `catalog
-- rejected (<class>)`, `glossary term rejected (<class>)`, `lineage rejected (<class>)` — 403 actor | authority | not_owner; 404 unknown_*;
-- 409 state | duplicate; else 422.
--
-- Helpers beyond MAP.md's list (all prefixed catalog_, colliding with no part): catalog_kinds, catalog_registry_kinds, catalog_flag_kinds,
-- catalog_lineage_kinds, catalog_staleness_period, catalog_recertification_period, catalog_search_document, catalog_lineage_forward
-- (trigger), catalog_asset_json, catalog_principal_name, catalog_event, catalog_flag_set, catalog_flag_clear, catalog_settle_asset,
-- catalog_registry_facts, catalog_raise_coverage.

-- ═════════════════════════════════════════════════════════════════════
-- §K.1 THE VOCABULARIES AND THE CONSTANTS
-- ═════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION products.catalog_kinds() RETURNS text[]
LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY['schema', 'field', 'source', 'product', 'staging', 'external'] $$;
/* The kinds that have an AUTHORITATIVE REGISTRY the reconciliation walks (a staging or external asset is accepted as declared). */
CREATE OR REPLACE FUNCTION products.catalog_registry_kinds() RETURNS text[]
LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY['schema', 'field', 'source', 'product'] $$;
CREATE OR REPLACE FUNCTION products.catalog_flag_kinds() RETURNS text[]
LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY['unowned', 'stale', 'duplicate', 'inconsistent', 'orphan', 'lineage_missing', 'ownership_lapsed'] $$;
CREATE OR REPLACE FUNCTION products.catalog_lineage_kinds() RETURNS text[]
LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY['derives_from', 'feeds', 'serves', 'describes'] $$;
/* THE STALENESS PERIOD: a registry-kind asset the reconciliation has not seen in its registry for longer than this is stale (untrusted). */
CREATE OR REPLACE FUNCTION products.catalog_staleness_period() RETURNS interval
LANGUAGE sql IMMUTABLE AS $$ SELECT interval '7 days' $$;
/* THE OWNERSHIP RECERTIFICATION PERIOD: an owner recertifies within this of the last certification, or the ownership lapses (untrusted). */
CREATE OR REPLACE FUNCTION products.catalog_recertification_period() RETURNS interval
LANGUAGE sql IMMUTABLE AS $$ SELECT interval '180 days' $$;
/* The search document of an asset (title, description, ref, glossary terms) — the 'simple' configuration: no stemming of identifiers. */
CREATE OR REPLACE FUNCTION products.catalog_search_document(p_title text, p_description text, p_ref text, p_terms text[]) RETURNS tsvector
LANGUAGE sql IMMUTABLE AS $$
  SELECT to_tsvector('simple', coalesce(p_title, '') || ' ' || coalesce(p_description, '') || ' ' || coalesce(replace(replace(p_ref, '@', ' '), '_', ' '), '') || ' ' || coalesce(array_to_string(p_terms, ' '), ''))
$$;
GRANT EXECUTE ON FUNCTION products.catalog_kinds() TO eye_app, eye_commit;
GRANT EXECUTE ON FUNCTION products.catalog_registry_kinds() TO eye_app, eye_commit;
GRANT EXECUTE ON FUNCTION products.catalog_flag_kinds() TO eye_app, eye_commit;
GRANT EXECUTE ON FUNCTION products.catalog_lineage_kinds() TO eye_app, eye_commit;
GRANT EXECUTE ON FUNCTION products.catalog_staleness_period() TO eye_app, eye_commit;
GRANT EXECUTE ON FUNCTION products.catalog_recertification_period() TO eye_app, eye_commit;
GRANT EXECUTE ON FUNCTION products.catalog_search_document(text, text, text, text[]) TO eye_app, eye_commit;

-- ═════════════════════════════════════════════════════════════════════
-- §K.2 THE TABLES
-- ═════════════════════════════════════════════════════════════════════
CREATE TABLE products.catalog_assets (
  asset_id            uuid PRIMARY KEY,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  kind                text NOT NULL CHECK (kind = ANY (products.catalog_kinds())),
  ref                 text NOT NULL CHECK (length(btrim(ref)) BETWEEN 1 AND 200),        -- schema: TYPE@vN · field: the field name · source: the source key · product: the product id · staging/external: the steward's reference
  title               text NOT NULL CHECK (length(btrim(title)) BETWEEN 2 AND 200),
  description         text,
  owner_principal_id  uuid,                                                              -- a named, active human of the tenant; NULL is coverage debt (flag unowned)
  classification      text NOT NULL DEFAULT 'internal' CHECK (classification IN ('public', 'internal', 'confidential', 'restricted')),
  contracts           jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(contracts) = 'object'),
  locations           jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(locations) = 'array'),   -- where it lives: a relation, a vault root, a URL — by reference
  glossary_terms      text[] NOT NULL DEFAULT '{}',
  quality             jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(quality) = 'object'),
  slo                 jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(slo) = 'object'),
  consumers           jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(consumers) = 'object'),   -- {count, ids} copied from the product registry on reconciliation
  release             jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(release) = 'object'),     -- the released version, copied
  lifecycle_state     text NOT NULL DEFAULT 'unknown' CHECK (length(btrim(lifecycle_state)) BETWEEN 1 AND 40),
  discoverable        boolean NOT NULL DEFAULT true,
  trusted             boolean NOT NULL DEFAULT true,
  flags               jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(flags) = 'array'),      -- [{kind, since, reason}]
  last_observed_at    timestamptz,                                                       -- the runtime observation: when the reconciliation last saw the asset in its registry (registry kinds)
  recertify_by        timestamptz,                                                       -- the ownership recertification date (set with the owner)
  registered_by       uuid NOT NULL,
  registered_at       timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id      uuid NOT NULL,
  CONSTRAINT kca_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT kca_identity UNIQUE (tenant_id, domain_id, kind, ref),
  CONSTRAINT kca_recertify_bound CHECK ((owner_principal_id IS NULL) = (recertify_by IS NULL))
);
CREATE INDEX kca_domain ON products.catalog_assets (tenant_id, domain_id, kind, discoverable, trusted);
CREATE INDEX kca_owner ON products.catalog_assets (owner_principal_id) WHERE owner_principal_id IS NOT NULL;
CREATE INDEX kca_search ON products.catalog_assets USING gin (products.catalog_search_document(title, description, ref, glossary_terms));
CREATE TRIGGER kca_no_delete BEFORE DELETE ON products.catalog_assets FOR EACH ROW EXECUTE FUNCTION products.no_delete();
COMMENT ON TABLE products.catalog_assets IS 'B90 (0095 §K): THE CATALOG ENTRY (DP-49-001/-002) — one row per data asset of the domain with its identity (kind + ref), owner, classification, contracts, locations, glossary terms, quality, SLO, consumers, release, lifecycle state, discoverable / trusted and the flags of the continuity rule. Describes and indexes authority; never the authority itself (DP-49-003). Never deleted.';

CREATE TABLE products.lineage_edges (
  edge_id           uuid PRIMARY KEY,
  scope             text NOT NULL,
  tenant_id         uuid NOT NULL,
  domain_id         uuid NOT NULL,
  from_asset_id     uuid NOT NULL REFERENCES products.catalog_assets (asset_id),
  to_asset_id       uuid NOT NULL REFERENCES products.catalog_assets (asset_id),
  kind              text NOT NULL CHECK (kind = ANY (products.catalog_lineage_kinds())),   -- from DERIVES FROM to · from FEEDS to · from SERVES to · from DESCRIBES to
  evidence          jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(evidence) = 'object'),
  declared_by       uuid NOT NULL,
  declared_at       timestamptz NOT NULL DEFAULT clock_timestamp(),
  retired_at        timestamptz,
  retired_by        uuid,
  retirement_reason text,
  correlation_id    uuid NOT NULL,
  CONSTRAINT kle_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT kle_not_self CHECK (from_asset_id <> to_asset_id),
  CONSTRAINT kle_retire_pair CHECK ((retired_at IS NULL) = (retired_by IS NULL))
);
CREATE UNIQUE INDEX kle_live_once ON products.lineage_edges (from_asset_id, to_asset_id, kind) WHERE retired_at IS NULL;
CREATE INDEX kle_from ON products.lineage_edges (from_asset_id) WHERE retired_at IS NULL;
CREATE INDEX kle_to ON products.lineage_edges (to_asset_id) WHERE retired_at IS NULL;
COMMENT ON TABLE products.lineage_edges IS 'B90 (0095 §K): the directed lineage between catalog assets (derives_from | feeds | serves | describes) with who declared it and the evidence; append-only — an edge is retired by its retirement set once (products.catalog_lineage_forward), never deleted.';
/* An edge moves one way: live → retired (the triple set once); nothing else of the row changes; never deleted. */
CREATE OR REPLACE FUNCTION products.catalog_lineage_forward() RETURNS trigger
SET search_path = products, pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'lineage edges are append-only: DELETE prohibited' USING ERRCODE = '2F002'; END IF;
  IF OLD.retired_at IS NOT NULL OR NEW.retired_at IS NULL
     OR (to_jsonb(NEW) - 'retired_at' - 'retired_by' - 'retirement_reason') <> (to_jsonb(OLD) - 'retired_at' - 'retired_by' - 'retirement_reason') THEN
    RAISE EXCEPTION 'lineage edge % is immutable; only its retirement is set, once', OLD.edge_id USING ERRCODE = '2F002';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER kle_forward BEFORE UPDATE OR DELETE ON products.lineage_edges FOR EACH ROW EXECUTE FUNCTION products.catalog_lineage_forward();

CREATE TABLE products.glossary_terms (
  term_id             uuid PRIMARY KEY,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  term                text NOT NULL CHECK (length(btrim(term)) BETWEEN 2 AND 120),
  term_key            text NOT NULL,                                                   -- lower(btrim(term)): the identity a term is bound to assets by
  definition          text NOT NULL CHECK (length(btrim(definition)) >= 8),
  owner_principal_id  uuid NOT NULL,                                                   -- a named, active human of the tenant
  version             int  NOT NULL DEFAULT 1 CHECK (version >= 1),
  since               timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  defined_by          uuid NOT NULL,
  correlation_id      uuid NOT NULL,
  CONSTRAINT kgt_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT kgt_term_per_domain UNIQUE (tenant_id, domain_id, term_key)
);
COMMENT ON TABLE products.glossary_terms IS 'B90 (0095 §K): the business glossary — a term (unique per domain, case-insensitive), its definition and its owner; bound to assets by name (catalog_assets.glossary_terms). A redefinition moves the row forward and keeps the prior definition in products.catalog_events.';

CREATE TABLE products.catalog_reconciliations (
  run_id              uuid PRIMARY KEY,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  trigger             text NOT NULL CHECK (trigger IN ('tick', 'steward')),
  started_at          timestamptz NOT NULL,
  finished_at         timestamptz NOT NULL,
  counts              jsonb NOT NULL CHECK (jsonb_typeof(counts) = 'object'),           -- {seen, created, flagged_by_kind, cleared, attention_items}
  actor_principal_id  uuid NOT NULL,
  correlation_id      uuid NOT NULL,
  CONSTRAINT kcr_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX kcr_domain ON products.catalog_reconciliations (tenant_id, domain_id, finished_at DESC);
CREATE TRIGGER kcr_append_only BEFORE UPDATE OR DELETE ON products.catalog_reconciliations FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE products.catalog_reconciliations IS 'B90 (0095 §K): every reconciliation run against the authoritative registries (DP-49-006) with its counts — append-only.';

CREATE TABLE products.catalog_events (
  event_id            uuid PRIMARY KEY,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  asset_id            uuid REFERENCES products.catalog_assets (asset_id),               -- NULL for a term's or a run's event
  event               text NOT NULL CHECK (event IN (
    'asset.catalogued', 'asset.owner_set', 'asset.flagged', 'asset.flag_cleared', 'asset.reconciled', 'asset.recertified',
    'lineage.declared', 'term.defined', 'term.redefined', 'catalog.reconciled')),
  occurred_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  actor_principal_id  uuid,
  details             jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
  correlation_id      uuid NOT NULL,
  CONSTRAINT kce_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX kce_asset ON products.catalog_events (asset_id, occurred_at);
CREATE INDEX kce_domain ON products.catalog_events (tenant_id, domain_id, occurred_at);
CREATE TRIGGER kce_append_only BEFORE UPDATE OR DELETE ON products.catalog_events FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE products.catalog_events IS 'B90 (0095 §K): the append-only ledger of everything that happens in the catalog — an asset catalogued, an owner set, a flag raised or cleared, a reconciliation, a recertification, a lineage edge, a term defined or redefined (the prior definition kept in details).';

-- RLS and grants (the 0081 loop idiom; the ports write)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['catalog_assets', 'lineage_edges', 'glossary_terms', 'catalog_reconciliations', 'catalog_events'] LOOP
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
-- §K.3 THE HELPERS (called from the ports; none is a port)
-- ═════════════════════════════════════════════════════════════════════
/* A principal's display name (an owner's, for the search and the reads) — of this tenant only; NULL otherwise. */
CREATE OR REPLACE FUNCTION products.catalog_principal_name(p_principal uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = identity, public, pg_catalog, pg_temp AS $$
  SELECT p.display_name FROM identity.principals p WHERE p.id = p_principal AND p.tenant_id = public.eye_tenant()
$$;
REVOKE ALL ON FUNCTION products.catalog_principal_name(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION products.catalog_principal_name(uuid) TO eye_app, eye_commit;

/* The asset as JSON: the row minus its scope and correlation, plus the owner's name and whether it is stale AS OF NOW (the database's
   instant: a registry-kind asset not seen in its registry for longer than the staleness period). */
CREATE OR REPLACE FUNCTION products.catalog_asset_json(r products.catalog_assets) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = products, pg_catalog, pg_temp AS $$
  SELECT (to_jsonb(r) - 'scope' - 'correlation_id')
         || jsonb_build_object('owner_name', products.catalog_principal_name(r.owner_principal_id),
                               'stale_now', r.kind = ANY (products.catalog_registry_kinds()) AND r.last_observed_at IS NOT NULL AND r.last_observed_at < now() - products.catalog_staleness_period())
$$;
GRANT EXECUTE ON FUNCTION products.catalog_asset_json(products.catalog_assets) TO eye_app, eye_commit;

/* One ledger row; answers its id (the cause of an attention item). */
CREATE OR REPLACE FUNCTION products.catalog_event(p_asset uuid, p_tenant uuid, p_domain uuid, p_event text, p_actor uuid, p_details jsonb, p_correlation uuid) RETURNS uuid
SET search_path = products, pg_catalog, pg_temp AS $$
DECLARE v_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO products.catalog_events (event_id, scope, tenant_id, domain_id, asset_id, event, actor_principal_id, details, correlation_id)
  VALUES (v_id, 'DOMAIN', p_tenant, p_domain, p_asset, p_event, p_actor, coalesce(p_details, '{}'::jsonb), p_correlation);
  RETURN v_id;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION products.catalog_event(uuid, uuid, uuid, text, uuid, jsonb, uuid) FROM PUBLIC;

/* SET A FLAG on an asset (once per kind): answers the asset.flagged event's id, or NULL when the flag was already there. */
CREATE OR REPLACE FUNCTION products.catalog_flag_set(p_asset uuid, p_tenant uuid, p_domain uuid, p_kind text, p_reason text, p_actor uuid, p_correlation uuid) RETURNS uuid
SET search_path = products, pg_catalog, pg_temp AS $$
DECLARE v_flags jsonb; v_now timestamptz := clock_timestamp();
BEGIN
  SELECT flags INTO v_flags FROM products.catalog_assets WHERE asset_id = p_asset;
  IF v_flags @> jsonb_build_array(jsonb_build_object('kind', p_kind)) THEN RETURN NULL; END IF;
  UPDATE products.catalog_assets SET flags = flags || jsonb_build_array(jsonb_build_object('kind', p_kind, 'since', v_now, 'reason', p_reason)), updated_at = v_now WHERE asset_id = p_asset;
  RETURN products.catalog_event(p_asset, p_tenant, p_domain, 'asset.flagged', p_actor, jsonb_build_object('flag', p_kind, 'reason', p_reason, 'since', v_now), p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION products.catalog_flag_set(uuid, uuid, uuid, text, text, uuid, uuid) FROM PUBLIC;

/* CLEAR A FLAG (when present): answers true when a flag was removed. */
CREATE OR REPLACE FUNCTION products.catalog_flag_clear(p_asset uuid, p_tenant uuid, p_domain uuid, p_kind text, p_reason text, p_actor uuid, p_correlation uuid) RETURNS boolean
SET search_path = products, pg_catalog, pg_temp AS $$
DECLARE v_flags jsonb;
BEGIN
  SELECT flags INTO v_flags FROM products.catalog_assets WHERE asset_id = p_asset;
  IF NOT (v_flags @> jsonb_build_array(jsonb_build_object('kind', p_kind))) THEN RETURN false; END IF;
  UPDATE products.catalog_assets
     SET flags = coalesce((SELECT jsonb_agg(f) FROM jsonb_array_elements(v_flags) f WHERE f ->> 'kind' <> p_kind), '[]'::jsonb), updated_at = clock_timestamp()
   WHERE asset_id = p_asset;
  PERFORM products.catalog_event(p_asset, p_tenant, p_domain, 'asset.flag_cleared', p_actor, jsonb_build_object('flag', p_kind, 'reason', p_reason), p_correlation);
  RETURN true;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION products.catalog_flag_clear(uuid, uuid, uuid, text, text, uuid, uuid) FROM PUBLIC;

/* SETTLE: trusted and discoverable follow the flags (the continuity rule's marks): orphan → undiscoverable; stale, ownership_lapsed or
   inconsistent → untrusted. Answers the asset. */
CREATE OR REPLACE FUNCTION products.catalog_settle_asset(p_asset uuid) RETURNS products.catalog_assets
SET search_path = products, pg_catalog, pg_temp AS $$
DECLARE r products.catalog_assets%ROWTYPE;
BEGIN
  UPDATE products.catalog_assets a
     SET discoverable = NOT (a.flags @> '[{"kind":"orphan"}]'::jsonb),
         trusted = NOT (a.flags @> '[{"kind":"stale"}]'::jsonb OR a.flags @> '[{"kind":"ownership_lapsed"}]'::jsonb OR a.flags @> '[{"kind":"inconsistent"}]'::jsonb),
         updated_at = clock_timestamp()
   WHERE a.asset_id = p_asset RETURNING * INTO r;
  RETURN r;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION products.catalog_settle_asset(uuid) FROM PUBLIC;

/* WHAT THE AUTHORITATIVE REGISTRY SAYS about a registry-kind asset (NULL when the registry has no such row): the title, the lifecycle
   state (`unknown` when the registry does not say), the owner (a product's), the classification, the contracts, the release, the
   declared SLO and the latest observation per measure from the one SLO ledger, the quality, the consumers. READ ONLY — nothing here writes. */
CREATE OR REPLACE FUNCTION products.catalog_registry_facts(p_tenant uuid, p_domain uuid, p_kind text, p_ref text) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = products, objects, observation, pg_catalog, pg_temp AS $$
DECLARE v jsonb; s record; p products.products_current%ROWTYPE;
BEGIN
  IF p_kind = 'schema' THEN
    IF p_ref !~ '^[A-Za-z0-9_]+@v[0-9]+$' THEN RETURN NULL; END IF;
    SELECT jsonb_build_object('title', 'Schema ' || r.object_type || '@' || r.schema_version, 'lifecycle_state', 'unknown', 'owner', NULL, 'classification', 'internal',
                              'contracts', jsonb_build_object('object_type', r.object_type, 'schema_version', r.schema_version, 'compatibility', r.compatibility),
                              'release', '{}'::jsonb, 'slo', '{}'::jsonb, 'quality', '{}'::jsonb, 'consumers', '{}'::jsonb)
      INTO v FROM objects.schema_registry r WHERE r.object_type = split_part(p_ref, '@', 1) AND r.schema_version = split_part(p_ref, '@', 2);
    RETURN v;
  ELSIF p_kind = 'field' THEN
    SELECT jsonb_build_object('title', 'Canonical field ' || f.field_name, 'lifecycle_state', 'unknown', 'owner', NULL, 'classification', 'internal',
                              'contracts', jsonb_build_object('field_name', f.field_name, 'authoritative', f.authoritative, 'note', f.note),
                              'release', '{}'::jsonb, 'slo', '{}'::jsonb, 'quality', '{}'::jsonb, 'consumers', '{}'::jsonb)
      INTO v FROM objects.canonical_field_registry f WHERE f.field_name = p_ref;
    RETURN v;
  ELSIF p_kind = 'source' THEN
    SELECT c.* INTO s FROM observation.source_contracts_current c WHERE c.tenant_id = p_tenant AND c.domain_id = p_domain AND c.source_key = p_ref ORDER BY c.contract_version DESC LIMIT 1;
    IF NOT FOUND THEN RETURN NULL; END IF;
    RETURN jsonb_build_object('title', s.name, 'lifecycle_state', s.lifecycle_state, 'owner', NULL, 'classification', s.classification_ceiling,
                              'contracts', jsonb_build_object('source_id', s.source_id, 'contract_version', s.contract_version, 'publisher', s.publisher, 'authority_class', s.authority_class,
                                                              'connector_kind', s.connector_kind, 'acquisition_mode', s.acquisition_mode, 'data_origin', s.data_origin, 'rights_state', s.rights_state, 'purposes', s.purposes),
                              'release', '{}'::jsonb,
                              'slo', jsonb_strip_nulls(jsonb_build_object('cadence_seconds', s.cadence_seconds, 'freshness_threshold_seconds', s.freshness_threshold_seconds)),
                              'quality', '{}'::jsonb, 'consumers', '{}'::jsonb);
  ELSIF p_kind = 'product' THEN
    IF p_ref !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RETURN NULL; END IF;
    SELECT * INTO p FROM products.products_current x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.product_id = p_ref::uuid;
    IF NOT FOUND THEN RETURN NULL; END IF;
    RETURN jsonb_build_object('title', p.title, 'lifecycle_state', p.state, 'owner', p.owner_principal_id,
                              'classification', coalesce(p.declaration #>> '{policy,data_classes,0}', 'internal'),
                              'contracts', jsonb_build_object('product_key', p.product_key, 'kind', p.kind, 'purpose', p.purpose, 'contract', coalesce(p.declaration -> 'contract', '{}'::jsonb),
                                                              'serving_modes', coalesce(p.declaration -> 'serving_modes', '[]'::jsonb), 'policy', coalesce(p.declaration -> 'policy', '{}'::jsonb)),
                              'release', CASE WHEN p.released_version IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('released_version', p.released_version, 'digest', p.declaration_digest) END,
                              'slo', jsonb_build_object('declared', coalesce(p.declaration -> 'slo', '{}'::jsonb),
                                                        'observed', coalesce((SELECT jsonb_object_agg(m.measure, jsonb_build_object('value', m.value, 'threshold', m.threshold, 'met', m.met, 'observed_at', m.observed_at))
                                                                                FROM (SELECT DISTINCT ON (o.measure) o.* FROM products.slo_observations o WHERE o.product_id = p.product_id ORDER BY o.measure, o.observed_at DESC) m), '{}'::jsonb)),
                              'quality', coalesce(p.declaration -> 'quality', '{}'::jsonb),
                              -- §I (the integrator): the consumer register is §R's (products.product_consumers, declared later in this file — plpgsql binds it at run time); the live consumers' count and ids
                              'consumers', (SELECT jsonb_build_object('count', count(*), 'ids', coalesce(jsonb_agg(c.consumer_id ORDER BY c.registered_at), '[]'::jsonb))
                                              FROM products.product_consumers c WHERE c.product_id = p.product_id AND c.state IN ('registered', 'accepted')));
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION products.catalog_registry_facts(uuid, uuid, text, text) FROM PUBLIC;

/* RAISE the catalog.coverage attention item for a NEW orphan or ownership_lapsed flag (0094 §P's idiom: the owner when an active human,
   else the class's roles under the active policy; the cause is the asset.flagged ledger row). Answers the item id. */
CREATE OR REPLACE FUNCTION products.catalog_raise_coverage(p_asset uuid, p_tenant uuid, p_domain uuid, p_flag text, p_cause_event uuid, p_actor uuid, p_correlation uuid) RETURNS uuid
SET search_path = products, executive, decision, identity, pg_catalog, pg_temp AS $$
DECLARE a products.catalog_assets%ROWTYPE; pol executive.attention_policies%ROWTYPE; v_eval jsonb; v_route jsonb; v_state text; v_owner uuid; v_item uuid := gen_random_uuid(); v_title text;
BEGIN
  SELECT * INTO a FROM products.catalog_assets WHERE asset_id = p_asset;
  v_owner := CASE WHEN a.owner_principal_id IS NOT NULL AND decision.is_active_human(a.owner_principal_id, p_tenant) THEN a.owner_principal_id END;
  SELECT * INTO pol FROM executive.attention_policies x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.state = 'active';
  v_eval := executive.evaluate_attention(CASE WHEN pol.policy_id IS NULL THEN NULL ELSE pol.rules END, 'catalog.coverage',
                                         jsonb_build_object('consequence', 'C2', 'confidence', 1, 'hours_to_window', 0)) || jsonb_build_object('policy_version', pol.version);
  v_route := executive.attention_route(pol.rules, 'catalog.coverage', v_eval ->> 'outcome', v_owner, p_tenant, p_domain);
  v_state := v_route ->> 'state';
  v_title := left(format('catalog coverage: %s %s (%s) flagged %s', a.kind, a.title, a.ref, p_flag), 512);
  INSERT INTO executive.attention_items (item_id, scope, tenant_id, domain_id, signal_class, subject_kind, subject_id, cause_event_id, cause_event_type, title, outcome, state,
                                         owner_principal_id, route_roles, policy_id, policy_version, evaluation, details, due_at, escalations, correlation_id)
  VALUES (v_item, 'DOMAIN', p_tenant, p_domain, 'catalog.coverage', 'asset', a.asset_id, p_cause_event, 'CatalogAssetFlagged', v_title, v_eval ->> 'outcome', v_state,
          v_owner, ARRAY(SELECT jsonb_array_elements_text(v_route -> 'route_roles')), pol.policy_id, pol.version, v_eval,
          jsonb_build_object('asset_id', a.asset_id, 'kind', a.kind, 'ref', a.ref, 'title', a.title, 'flag', p_flag, 'flags', a.flags, 'owner_principal_id', a.owner_principal_id, 'by', 'the catalog reconciliation (B90 §K)'),
          (v_route ->> 'due_at')::timestamptz, (v_route ->> 'escalations')::int, p_correlation);
  PERFORM executive.attention_event(v_item, p_tenant, p_domain,
            CASE v_state WHEN 'open' THEN 'item.routed' WHEN 'escalated' THEN 'item.escalated' WHEN 'unrouted' THEN 'item.unrouted' ELSE 'item.deprioritized' END,
            p_actor, jsonb_build_object('outcome', v_eval ->> 'outcome', 'reasons', v_eval -> 'reasons', 'policy_version', pol.version, 'owner', v_owner, 'route_roles', v_route -> 'route_roles',
                                        'due_at', v_route -> 'due_at', 'cause_event_id', p_cause_event, 'cause_event_type', 'CatalogAssetFlagged', 'unrouted', coalesce((v_route ->> 'unrouted')::boolean, false)), p_correlation);
  RETURN v_item;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION products.catalog_raise_coverage(uuid, uuid, uuid, text, uuid, uuid, uuid) FROM PUBLIC;

-- ═════════════════════════════════════════════════════════════════════
-- §K.4 THE PORTS
-- ═════════════════════════════════════════════════════════════════════
/* CATALOGUE AN ASSET (products.catalog.asset.register): the steward's act, or the owner's for their own asset; a kind+ref that already
   exists refused (duplicate); a registry-kind ref that names no registry row refused (unknown_ref) — a staging or external asset has no
   registry and is accepted as declared; for a registry kind the registry's lifecycle state, release and observation are copied (the title
   and description are the caller's). No owner → the flag unowned (coverage debt). */
CREATE OR REPLACE FUNCTION products.catalogue_asset(
  p_asset_id uuid, p_tenant uuid, p_domain uuid, p_kind text, p_ref text, p_title text, p_description text, p_owner uuid, p_classification text,
  p_contracts jsonb, p_locations jsonb, p_glossary_terms text[], p_quality jsonb, p_slo jsonb, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = products, executive, identity, observation, objects, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r products.catalog_assets%ROWTYPE; v_facts jsonb; v_term text; v_now timestamptz := clock_timestamp(); v_steward boolean;
BEGIN
  PERFORM observation.assert_authority(ARRAY['products.catalog.asset.register']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'catalog asset rejected (actor): catalogued by the acting principal' USING ERRCODE = '42501'; END IF;
  v_steward := executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['data_steward', 'domain_admin', 'platform_admin']);
  IF NOT v_steward AND (p_owner IS NULL OR p_owner <> p_actor) THEN
    RAISE EXCEPTION 'catalog asset rejected (authority): an asset is catalogued by a data steward, or by its owner as their own' USING ERRCODE = '42501';
  END IF;
  IF p_kind IS NULL OR p_kind <> ALL (products.catalog_kinds()) THEN RAISE EXCEPTION 'catalog asset rejected (kind): % is not a catalog asset kind (schema | field | source | product | staging | external)', coalesce(p_kind, 'null') USING ERRCODE = '22023'; END IF;
  IF p_ref IS NULL OR length(btrim(p_ref)) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'catalog asset rejected (ref): an asset is identified by its kind and a reference (1–200 characters)' USING ERRCODE = '22023'; END IF;
  IF p_title IS NULL OR length(btrim(p_title)) NOT BETWEEN 2 AND 200 THEN RAISE EXCEPTION 'catalog asset rejected (title): a title is 2–200 characters' USING ERRCODE = '22023'; END IF;
  IF p_classification IS NOT NULL AND p_classification NOT IN ('public', 'internal', 'confidential', 'restricted') THEN RAISE EXCEPTION 'catalog asset rejected (classification): % is not public, internal, confidential or restricted', p_classification USING ERRCODE = '22023'; END IF;
  IF p_owner IS NOT NULL AND NOT EXISTS (SELECT 1 FROM identity.principals x WHERE x.id = p_owner AND x.tenant_id = p_tenant AND x.kind = 'human' AND x.status = 'active') THEN
    RAISE EXCEPTION 'catalog asset rejected (unknown_owner): the owner is a named, active human of the tenant' USING ERRCODE = '22023';
  END IF;
  IF (p_contracts IS NOT NULL AND jsonb_typeof(p_contracts) <> 'object') OR (p_quality IS NOT NULL AND jsonb_typeof(p_quality) <> 'object') OR (p_slo IS NOT NULL AND jsonb_typeof(p_slo) <> 'object') THEN
    RAISE EXCEPTION 'catalog asset rejected (shape): contracts, quality and slo are objects' USING ERRCODE = '22023';
  END IF;
  IF p_locations IS NOT NULL AND jsonb_typeof(p_locations) <> 'array' THEN RAISE EXCEPTION 'catalog asset rejected (shape): locations is an array of references' USING ERRCODE = '22023'; END IF;
  FOREACH v_term IN ARRAY coalesce(p_glossary_terms, '{}'::text[]) LOOP
    IF v_term IS NULL OR length(btrim(v_term)) NOT BETWEEN 2 AND 120 THEN RAISE EXCEPTION 'catalog asset rejected (term): a glossary term is 2–120 characters' USING ERRCODE = '22023'; END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM products.catalog_assets x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.kind = p_kind AND x.ref = btrim(p_ref)) THEN
    RAISE EXCEPTION 'catalog asset rejected (duplicate): % % is already catalogued in this domain', p_kind, btrim(p_ref) USING ERRCODE = '23505';
  END IF;
  IF p_kind = ANY (products.catalog_registry_kinds()) THEN
    v_facts := products.catalog_registry_facts(p_tenant, p_domain, p_kind, btrim(p_ref));
    IF v_facts IS NULL THEN RAISE EXCEPTION 'catalog asset rejected (unknown_ref): % % names no row of its registry', p_kind, btrim(p_ref) USING ERRCODE = '22023'; END IF;
  END IF;
  INSERT INTO products.catalog_assets (asset_id, scope, tenant_id, domain_id, kind, ref, title, description, owner_principal_id, classification, contracts, locations, glossary_terms, quality, slo, consumers, release,
                                       lifecycle_state, flags, last_observed_at, recertify_by, registered_by, correlation_id)
  VALUES (p_asset_id, 'DOMAIN', p_tenant, p_domain, p_kind, btrim(p_ref), btrim(p_title), NULLIF(btrim(coalesce(p_description, '')), ''), p_owner,
          coalesce(p_classification, v_facts ->> 'classification', 'internal'),
          coalesce(p_contracts, v_facts -> 'contracts', '{}'::jsonb), coalesce(p_locations, '[]'::jsonb), coalesce(p_glossary_terms, '{}'::text[]),
          coalesce(p_quality, v_facts -> 'quality', '{}'::jsonb), coalesce(p_slo, v_facts -> 'slo', '{}'::jsonb), coalesce(v_facts -> 'consumers', '{}'::jsonb), coalesce(v_facts -> 'release', '{}'::jsonb),
          coalesce(v_facts ->> 'lifecycle_state', 'unknown'),
          CASE WHEN p_owner IS NULL THEN jsonb_build_array(jsonb_build_object('kind', 'unowned', 'since', v_now, 'reason', 'catalogued without an owner')) ELSE '[]'::jsonb END,
          CASE WHEN v_facts IS NULL THEN NULL ELSE v_now END, CASE WHEN p_owner IS NULL THEN NULL ELSE v_now + products.catalog_recertification_period() END, p_actor, p_correlation)
  RETURNING * INTO r;
  PERFORM products.catalog_event(p_asset_id, p_tenant, p_domain, 'asset.catalogued', p_actor, jsonb_build_object('kind', p_kind, 'ref', btrim(p_ref), 'owner_principal_id', p_owner, 'by', CASE WHEN v_steward THEN 'a data steward' ELSE 'the owner' END), p_correlation);
  IF p_owner IS NULL THEN
    PERFORM products.catalog_event(p_asset_id, p_tenant, p_domain, 'asset.flagged', p_actor, jsonb_build_object('flag', 'unowned', 'reason', 'catalogued without an owner', 'since', v_now), p_correlation);
  END IF;
  RETURN products.catalog_asset_json(r);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION products.catalogue_asset(uuid,uuid,uuid,text,text,text,text,uuid,text,jsonb,jsonb,text[],jsonb,jsonb,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION products.catalogue_asset(uuid,uuid,uuid,text,text,text,text,uuid,text,jsonb,jsonb,text[],jsonb,jsonb,uuid,uuid) TO eye_commit;

/* SET THE OWNER (products.catalog.owner.set): the steward's act; the owner a named, active human of the tenant; the recertification date
   set from now; the flags unowned and ownership_lapsed cleared. */
CREATE OR REPLACE FUNCTION products.set_asset_owner(p_asset_id uuid, p_tenant uuid, p_domain uuid, p_owner uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = products, executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r products.catalog_assets%ROWTYPE; v_now timestamptz := clock_timestamp();
BEGIN
  PERFORM observation.assert_authority(ARRAY['products.catalog.owner.set']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'catalog asset rejected (actor): the owner is set by the acting principal' USING ERRCODE = '42501'; END IF;
  IF NOT executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['data_steward', 'domain_admin', 'platform_admin']) THEN
    RAISE EXCEPTION 'catalog asset rejected (authority): an asset''s owner is set by a data steward' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO r FROM products.catalog_assets x WHERE x.asset_id = p_asset_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'catalog asset rejected (unknown_asset): % is not a catalog asset of this domain', p_asset_id USING ERRCODE = '22023'; END IF;
  IF p_owner IS NULL OR NOT EXISTS (SELECT 1 FROM identity.principals x WHERE x.id = p_owner AND x.tenant_id = p_tenant AND x.kind = 'human' AND x.status = 'active') THEN
    RAISE EXCEPTION 'catalog asset rejected (unknown_owner): the owner is a named, active human of the tenant' USING ERRCODE = '22023';
  END IF;
  IF r.owner_principal_id = p_owner THEN RAISE EXCEPTION 'catalog asset rejected (state): % % is already owned by %', r.kind, r.ref, p_owner USING ERRCODE = '22023'; END IF;
  UPDATE products.catalog_assets SET owner_principal_id = p_owner, recertify_by = v_now + products.catalog_recertification_period(), updated_at = v_now WHERE asset_id = p_asset_id;
  PERFORM products.catalog_flag_clear(p_asset_id, p_tenant, p_domain, 'unowned', 'an owner was set', p_actor, p_correlation);
  PERFORM products.catalog_flag_clear(p_asset_id, p_tenant, p_domain, 'ownership_lapsed', 'a new owner was set (certified now)', p_actor, p_correlation);
  PERFORM products.catalog_event(p_asset_id, p_tenant, p_domain, 'asset.owner_set', p_actor, jsonb_build_object('owner_principal_id', p_owner, 'prior_owner_principal_id', r.owner_principal_id, 'recertify_by', v_now + products.catalog_recertification_period()), p_correlation);
  r := products.catalog_settle_asset(p_asset_id);
  RETURN products.catalog_asset_json(r);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION products.set_asset_owner(uuid,uuid,uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION products.set_asset_owner(uuid,uuid,uuid,uuid,uuid,uuid) TO eye_commit;

/* RECERTIFY OWNERSHIP (products.catalog.recertify): THE OWNER's own act — the recertification date moved forward by the period; the
   flag ownership_lapsed cleared. */
CREATE OR REPLACE FUNCTION products.recertify_asset_ownership(p_asset_id uuid, p_tenant uuid, p_domain uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = products, executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r products.catalog_assets%ROWTYPE; v_now timestamptz := clock_timestamp();
BEGIN
  PERFORM observation.assert_authority(ARRAY['products.catalog.recertify']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'catalog asset rejected (actor): ownership is recertified by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO r FROM products.catalog_assets x WHERE x.asset_id = p_asset_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'catalog asset rejected (unknown_asset): % is not a catalog asset of this domain', p_asset_id USING ERRCODE = '22023'; END IF;
  IF r.owner_principal_id IS NULL THEN RAISE EXCEPTION 'catalog asset rejected (state): % % has no owner to recertify; a data steward sets one first', r.kind, r.ref USING ERRCODE = '22023'; END IF;
  IF r.owner_principal_id <> p_actor THEN RAISE EXCEPTION 'catalog asset rejected (not_owner): ownership of % % is recertified by its owner', r.kind, r.ref USING ERRCODE = '42501'; END IF;
  UPDATE products.catalog_assets SET recertify_by = v_now + products.catalog_recertification_period(), updated_at = v_now WHERE asset_id = p_asset_id;
  PERFORM products.catalog_flag_clear(p_asset_id, p_tenant, p_domain, 'ownership_lapsed', 'the owner recertified', p_actor, p_correlation);
  PERFORM products.catalog_event(p_asset_id, p_tenant, p_domain, 'asset.recertified', p_actor, jsonb_build_object('recertify_by', v_now + products.catalog_recertification_period(), 'prior_recertify_by', r.recertify_by), p_correlation);
  r := products.catalog_settle_asset(p_asset_id);
  RETURN products.catalog_asset_json(r);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION products.recertify_asset_ownership(uuid,uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION products.recertify_asset_ownership(uuid,uuid,uuid,uuid,uuid) TO eye_commit;

/* DECLARE LINEAGE (products.catalog.lineage.declare): the steward's act, or either asset's owner's; a self edge refused; a duplicate live
   edge refused; the flag lineage_missing cleared on both ends and orphan cleared on a staging end (it has lineage now). */
CREATE OR REPLACE FUNCTION products.declare_lineage(p_edge_id uuid, p_tenant uuid, p_domain uuid, p_from uuid, p_to uuid, p_kind text, p_evidence jsonb, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = products, executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE f products.catalog_assets%ROWTYPE; t products.catalog_assets%ROWTYPE; e products.lineage_edges%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['products.catalog.lineage.declare']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'lineage rejected (actor): declared by the acting principal' USING ERRCODE = '42501'; END IF;
  IF p_from IS NULL OR p_to IS NULL THEN RAISE EXCEPTION 'lineage rejected (assets): an edge names two catalog assets' USING ERRCODE = '22023'; END IF;
  IF p_from = p_to THEN RAISE EXCEPTION 'lineage rejected (self): an asset has no lineage to itself' USING ERRCODE = '22023'; END IF;
  IF p_kind IS NULL OR p_kind <> ALL (products.catalog_lineage_kinds()) THEN RAISE EXCEPTION 'lineage rejected (kind): % is not a lineage kind (derives_from | feeds | serves | describes)', coalesce(p_kind, 'null') USING ERRCODE = '22023'; END IF;
  IF p_evidence IS NOT NULL AND jsonb_typeof(p_evidence) <> 'object' THEN RAISE EXCEPTION 'lineage rejected (evidence): the evidence is an object' USING ERRCODE = '22023'; END IF;
  SELECT * INTO f FROM products.catalog_assets x WHERE x.asset_id = p_from AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'lineage rejected (unknown_asset): % is not a catalog asset of this domain', p_from USING ERRCODE = '22023'; END IF;
  SELECT * INTO t FROM products.catalog_assets x WHERE x.asset_id = p_to AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'lineage rejected (unknown_asset): % is not a catalog asset of this domain', p_to USING ERRCODE = '22023'; END IF;
  IF NOT executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['data_steward', 'domain_admin', 'platform_admin']) AND f.owner_principal_id IS DISTINCT FROM p_actor AND t.owner_principal_id IS DISTINCT FROM p_actor THEN
    RAISE EXCEPTION 'lineage rejected (authority): lineage is declared by a data steward or by the owner of either asset' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM products.lineage_edges x WHERE x.from_asset_id = p_from AND x.to_asset_id = p_to AND x.kind = p_kind AND x.retired_at IS NULL) THEN
    RAISE EXCEPTION 'lineage rejected (duplicate): a live % edge from % % to % % is already declared', p_kind, f.kind, f.ref, t.kind, t.ref USING ERRCODE = '23505';
  END IF;
  INSERT INTO products.lineage_edges (edge_id, scope, tenant_id, domain_id, from_asset_id, to_asset_id, kind, evidence, declared_by, correlation_id)
  VALUES (p_edge_id, 'DOMAIN', p_tenant, p_domain, p_from, p_to, p_kind, coalesce(p_evidence, '{}'::jsonb), p_actor, p_correlation) RETURNING * INTO e;
  PERFORM products.catalog_flag_clear(p_from, p_tenant, p_domain, 'lineage_missing', 'lineage declared', p_actor, p_correlation);
  PERFORM products.catalog_flag_clear(p_to, p_tenant, p_domain, 'lineage_missing', 'lineage declared', p_actor, p_correlation);
  IF f.kind = 'staging' THEN PERFORM products.catalog_flag_clear(p_from, p_tenant, p_domain, 'orphan', 'the staging asset has lineage now', p_actor, p_correlation); END IF;
  IF t.kind = 'staging' THEN PERFORM products.catalog_flag_clear(p_to, p_tenant, p_domain, 'orphan', 'the staging asset has lineage now', p_actor, p_correlation); END IF;
  PERFORM products.catalog_settle_asset(p_from);
  PERFORM products.catalog_settle_asset(p_to);
  PERFORM products.catalog_event(p_from, p_tenant, p_domain, 'lineage.declared', p_actor, jsonb_build_object('edge_id', p_edge_id, 'to_asset_id', p_to, 'kind', p_kind), p_correlation);
  RETURN (to_jsonb(e) - 'scope' - 'correlation_id') || jsonb_build_object('from_title', f.title, 'from_kind', f.kind, 'from_ref', f.ref, 'to_title', t.title, 'to_kind', t.kind, 'to_ref', t.ref);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION products.declare_lineage(uuid,uuid,uuid,uuid,uuid,text,jsonb,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION products.declare_lineage(uuid,uuid,uuid,uuid,uuid,text,jsonb,uuid,uuid) TO eye_commit;

/* DEFINE A GLOSSARY TERM (products.catalog.term.define): the steward's act; the term unique per domain (case-insensitive); a redefinition
   moves the row forward (version + 1) and keeps the prior definition and owner in the ledger. */
CREATE OR REPLACE FUNCTION products.define_glossary_term(p_term_id uuid, p_tenant uuid, p_domain uuid, p_term text, p_definition text, p_owner uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = products, executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE g products.glossary_terms%ROWTYPE; v_key text; v_now timestamptz := clock_timestamp();
BEGIN
  PERFORM observation.assert_authority(ARRAY['products.catalog.term.define']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'glossary term rejected (actor): defined by the acting principal' USING ERRCODE = '42501'; END IF;
  IF NOT executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['data_steward', 'domain_admin', 'platform_admin']) THEN
    RAISE EXCEPTION 'glossary term rejected (authority): a term is defined by a data steward' USING ERRCODE = '42501';
  END IF;
  IF p_term IS NULL OR length(btrim(p_term)) NOT BETWEEN 2 AND 120 THEN RAISE EXCEPTION 'glossary term rejected (term): a term is 2–120 characters' USING ERRCODE = '22023'; END IF;
  IF p_definition IS NULL OR length(btrim(p_definition)) < 8 THEN RAISE EXCEPTION 'glossary term rejected (definition): a definition is 8 characters or more' USING ERRCODE = '22023'; END IF;
  IF p_owner IS NULL OR NOT EXISTS (SELECT 1 FROM identity.principals x WHERE x.id = p_owner AND x.tenant_id = p_tenant AND x.kind = 'human' AND x.status = 'active') THEN
    RAISE EXCEPTION 'glossary term rejected (unknown_owner): a term''s owner is a named, active human of the tenant' USING ERRCODE = '22023';
  END IF;
  v_key := lower(btrim(p_term));
  SELECT * INTO g FROM products.glossary_terms x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.term_key = v_key FOR UPDATE;
  IF FOUND THEN
    IF g.definition = btrim(p_definition) AND g.owner_principal_id = p_owner THEN RAISE EXCEPTION 'glossary term rejected (state): % is already defined so, by that owner', g.term USING ERRCODE = '22023'; END IF;
    PERFORM products.catalog_event(NULL, p_tenant, p_domain, 'term.redefined', p_actor,
      jsonb_build_object('term_id', g.term_id, 'term', g.term, 'prior', jsonb_build_object('definition', g.definition, 'owner_principal_id', g.owner_principal_id, 'version', g.version), 'definition', btrim(p_definition), 'owner_principal_id', p_owner), p_correlation);
    UPDATE products.glossary_terms SET term = btrim(p_term), definition = btrim(p_definition), owner_principal_id = p_owner, version = version + 1, updated_at = v_now, defined_by = p_actor WHERE term_id = g.term_id RETURNING * INTO g;
  ELSE
    INSERT INTO products.glossary_terms (term_id, scope, tenant_id, domain_id, term, term_key, definition, owner_principal_id, defined_by, correlation_id)
    VALUES (p_term_id, 'DOMAIN', p_tenant, p_domain, btrim(p_term), v_key, btrim(p_definition), p_owner, p_actor, p_correlation) RETURNING * INTO g;
    PERFORM products.catalog_event(NULL, p_tenant, p_domain, 'term.defined', p_actor, jsonb_build_object('term_id', g.term_id, 'term', g.term, 'owner_principal_id', p_owner), p_correlation);
  END IF;
  RETURN (to_jsonb(g) - 'scope' - 'correlation_id') || jsonb_build_object('owner_name', products.catalog_principal_name(g.owner_principal_id),
           'assets', coalesce((SELECT jsonb_agg(jsonb_build_object('asset_id', a.asset_id, 'kind', a.kind, 'ref', a.ref, 'title', a.title) ORDER BY a.title)
                                 FROM products.catalog_assets a WHERE a.tenant_id = p_tenant AND a.domain_id = p_domain AND v_key = ANY (SELECT lower(btrim(x)) FROM unnest(a.glossary_terms) x)), '[]'::jsonb));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION products.define_glossary_term(uuid,uuid,uuid,text,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION products.define_glossary_term(uuid,uuid,uuid,text,text,uuid,uuid,uuid) TO eye_commit;

/* FLAG AN ASSET BY HAND, or clear a flag (products.catalog.flag): the steward's judgement (an inconsistency seen, a duplicate resolved);
   the marks follow (settle). */
CREATE OR REPLACE FUNCTION products.flag_asset(p_asset_id uuid, p_tenant uuid, p_domain uuid, p_kind text, p_reason text, p_clear boolean, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = products, executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r products.catalog_assets%ROWTYPE; v_ev uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['products.catalog.flag']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'catalog asset rejected (actor): flagged by the acting principal' USING ERRCODE = '42501'; END IF;
  IF NOT executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['data_steward', 'domain_admin', 'platform_admin']) THEN
    RAISE EXCEPTION 'catalog asset rejected (authority): a flag is set or cleared by a data steward' USING ERRCODE = '42501';
  END IF;
  IF p_kind IS NULL OR p_kind <> ALL (products.catalog_flag_kinds()) THEN RAISE EXCEPTION 'catalog asset rejected (flag): % is not a flag kind (unowned | stale | duplicate | inconsistent | orphan | lineage_missing | ownership_lapsed)', coalesce(p_kind, 'null') USING ERRCODE = '22023'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN RAISE EXCEPTION 'catalog asset rejected (reason): a flag is set or cleared with a reason (8 characters or more)' USING ERRCODE = '22023'; END IF;
  SELECT * INTO r FROM products.catalog_assets x WHERE x.asset_id = p_asset_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'catalog asset rejected (unknown_asset): % is not a catalog asset of this domain', p_asset_id USING ERRCODE = '22023'; END IF;
  IF coalesce(p_clear, false) THEN
    IF NOT products.catalog_flag_clear(p_asset_id, p_tenant, p_domain, p_kind, btrim(p_reason), p_actor, p_correlation) THEN
      RAISE EXCEPTION 'catalog asset rejected (state): % % does not carry the flag %', r.kind, r.ref, p_kind USING ERRCODE = '22023';
    END IF;
  ELSE
    v_ev := products.catalog_flag_set(p_asset_id, p_tenant, p_domain, p_kind, btrim(p_reason), p_actor, p_correlation);
    IF v_ev IS NULL THEN RAISE EXCEPTION 'catalog asset rejected (state): % % already carries the flag %', r.kind, r.ref, p_kind USING ERRCODE = '22023'; END IF;
  END IF;
  r := products.catalog_settle_asset(p_asset_id);
  RETURN products.catalog_asset_json(r);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION products.flag_asset(uuid,uuid,uuid,text,text,boolean,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION products.flag_asset(uuid,uuid,uuid,text,text,boolean,uuid,uuid) TO eye_commit;

/* RECONCILE THE CATALOG against the authoritative registries (products.catalog.reconcile — the steward's act — or executive.attention.tick
   — the step catalog-reconcile, order 66). DP-49-006 "inventory reconciliation, orphan detection, ownership recertification, lineage
   coverage, runtime sync":
     1. the registries walked — objects.schema_registry, objects.canonical_field_registry, observation.source_contracts_current (this
        domain, the newest contract version per source), products.products_current (this domain): a MISSING entry is created (title from
        the registry, owner from a product's owner or NULL → unowned); a present entry is refreshed (last_observed_at, lifecycle state,
        release, consumers, SLO, an owner learnt from the product registry) — an entry whose prior observation is older than the staleness
        period is flagged stale (the runtime sync had lapsed) and the flag stands until the next run finds the observation fresh;
     2. a registry-kind entry whose registry row is GONE → orphan (undiscoverable);
     3. a staging asset with NO owner AND NO live lineage edge → orphan;
     4. two entries of one kind with the same normalised title → duplicate;
     5. an owner whose recertification date is past → ownership_lapsed (untrusted);
     6. a released product with no lineage edge at all → lineage_missing;
   every flag the run raises or clears is a ledger row; a NEW orphan or ownership_lapsed flag raises a catalog.coverage attention item;
   the run is recorded with its counts. READS the registries, WRITES the catalog only. */
CREATE OR REPLACE FUNCTION products.reconcile_catalog(p_run_id uuid, p_tenant uuid, p_domain uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = products, executive, identity, observation, objects, decision, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_action text; v_trigger text; v_started timestamptz := clock_timestamp(); v_now timestamptz; reg record; a products.catalog_assets%ROWTYPE; v_facts jsonb;
        v_seen int := 0; v_created int := 0; v_cleared int := 0; v_flagged jsonb := '{}'::jsonb; v_items jsonb := '[]'::jsonb; v_ev uuid; v_owner uuid; v_changed jsonb; v_id uuid; v_prior timestamptz;
        v_kind text; v_title_key text; v_run products.catalog_reconciliations%ROWTYPE;
BEGIN
  v_action := observation.assert_authority(ARRAY['products.catalog.reconcile', 'executive.attention.tick']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'catalog rejected (actor): reconciled by the acting principal' USING ERRCODE = '42501'; END IF;
  IF v_action = 'products.catalog.reconcile' AND NOT executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['data_steward', 'domain_admin', 'platform_admin']) THEN
    RAISE EXCEPTION 'catalog rejected (authority): a reconciliation is run by a data steward, or by the attention tick' USING ERRCODE = '42501';
  END IF;
  v_trigger := CASE WHEN v_action = 'executive.attention.tick' THEN 'tick' ELSE 'steward' END;
  -- one run at a time in a domain: the domain's entries locked for the run (no other port is called on them)
  PERFORM 1 FROM products.catalog_assets x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  v_now := clock_timestamp();

  -- 1. THE REGISTRIES
  FOR reg IN
    SELECT 'schema' AS kind, s.object_type || '@' || s.schema_version AS ref FROM objects.schema_registry s
    UNION ALL SELECT 'field', f.field_name FROM objects.canonical_field_registry f
    UNION ALL SELECT DISTINCT 'source', c.source_key FROM observation.source_contracts_current c WHERE c.tenant_id = p_tenant AND c.domain_id = p_domain
    UNION ALL SELECT 'product', p.product_id::text FROM products.products_current p WHERE p.tenant_id = p_tenant AND p.domain_id = p_domain
    ORDER BY 1, 2
  LOOP
    v_seen := v_seen + 1;
    v_facts := products.catalog_registry_facts(p_tenant, p_domain, reg.kind, reg.ref);
    IF v_facts IS NULL THEN CONTINUE; END IF;   -- a row that vanished between the listing and the read
    v_owner := (v_facts ->> 'owner')::uuid;
    IF v_owner IS NOT NULL AND NOT decision.is_active_human(v_owner, p_tenant) THEN v_owner := NULL; END IF;
    SELECT * INTO a FROM products.catalog_assets x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.kind = reg.kind AND x.ref = reg.ref;
    IF NOT FOUND THEN
      v_id := gen_random_uuid();
      INSERT INTO products.catalog_assets (asset_id, scope, tenant_id, domain_id, kind, ref, title, owner_principal_id, classification, contracts, quality, slo, consumers, release, lifecycle_state,
                                           flags, last_observed_at, recertify_by, registered_by, correlation_id)
      VALUES (v_id, 'DOMAIN', p_tenant, p_domain, reg.kind, reg.ref, left(v_facts ->> 'title', 200), v_owner, coalesce(v_facts ->> 'classification', 'internal'),
              coalesce(v_facts -> 'contracts', '{}'::jsonb), coalesce(v_facts -> 'quality', '{}'::jsonb), coalesce(v_facts -> 'slo', '{}'::jsonb), coalesce(v_facts -> 'consumers', '{}'::jsonb), coalesce(v_facts -> 'release', '{}'::jsonb),
              coalesce(v_facts ->> 'lifecycle_state', 'unknown'), '[]'::jsonb, v_now, CASE WHEN v_owner IS NULL THEN NULL ELSE v_now + products.catalog_recertification_period() END, p_actor, p_correlation);
      v_created := v_created + 1;
      PERFORM products.catalog_event(v_id, p_tenant, p_domain, 'asset.catalogued', p_actor, jsonb_build_object('kind', reg.kind, 'ref', reg.ref, 'owner_principal_id', v_owner, 'by', 'the reconciliation (' || v_trigger || ')'), p_correlation);
      IF v_owner IS NULL THEN
        v_ev := products.catalog_flag_set(v_id, p_tenant, p_domain, 'unowned', 'the registry names no owner', p_actor, p_correlation);
        v_flagged := v_flagged || jsonb_build_object('unowned', coalesce((v_flagged ->> 'unowned')::int, 0) + 1);
      END IF;
    ELSE
      v_prior := a.last_observed_at;
      v_changed := '{}'::jsonb;
      IF a.lifecycle_state IS DISTINCT FROM coalesce(v_facts ->> 'lifecycle_state', 'unknown') THEN v_changed := v_changed || jsonb_build_object('lifecycle_state', jsonb_build_array(a.lifecycle_state, v_facts ->> 'lifecycle_state')); END IF;
      IF a.release <> coalesce(v_facts -> 'release', '{}'::jsonb) THEN v_changed := v_changed || jsonb_build_object('release', v_facts -> 'release'); END IF;
      IF a.owner_principal_id IS NULL AND v_owner IS NOT NULL THEN v_changed := v_changed || jsonb_build_object('owner_principal_id', v_owner); END IF;
      UPDATE products.catalog_assets
         SET last_observed_at = v_now, lifecycle_state = coalesce(v_facts ->> 'lifecycle_state', 'unknown'), title = left(v_facts ->> 'title', 200),
             release = coalesce(v_facts -> 'release', '{}'::jsonb), consumers = coalesce(v_facts -> 'consumers', '{}'::jsonb), slo = coalesce(v_facts -> 'slo', '{}'::jsonb),
             contracts = coalesce(v_facts -> 'contracts', '{}'::jsonb),
             owner_principal_id = CASE WHEN a.owner_principal_id IS NULL AND v_owner IS NOT NULL THEN v_owner ELSE a.owner_principal_id END,
             recertify_by = CASE WHEN a.owner_principal_id IS NULL AND v_owner IS NOT NULL THEN v_now + products.catalog_recertification_period() ELSE a.recertify_by END,
             updated_at = v_now
       WHERE asset_id = a.asset_id;
      -- the runtime sync: stale when the prior observation had lapsed; fresh again when it had not
      IF v_prior IS NOT NULL AND v_prior < v_now - products.catalog_staleness_period() THEN
        v_ev := products.catalog_flag_set(a.asset_id, p_tenant, p_domain, 'stale', format('not seen in its registry since %s (the staleness period is %s)', v_prior, products.catalog_staleness_period()), p_actor, p_correlation);
        IF v_ev IS NOT NULL THEN v_flagged := v_flagged || jsonb_build_object('stale', coalesce((v_flagged ->> 'stale')::int, 0) + 1); END IF;
      ELSIF products.catalog_flag_clear(a.asset_id, p_tenant, p_domain, 'stale', 'observed in its registry within the staleness period', p_actor, p_correlation) THEN
        v_cleared := v_cleared + 1;
      END IF;
      -- the registry row is here: not an orphan
      IF products.catalog_flag_clear(a.asset_id, p_tenant, p_domain, 'orphan', 'the registry row is present again', p_actor, p_correlation) THEN v_cleared := v_cleared + 1; END IF;
      -- ownership
      IF a.owner_principal_id IS NULL AND v_owner IS NOT NULL THEN
        IF products.catalog_flag_clear(a.asset_id, p_tenant, p_domain, 'unowned', 'the owner learnt from the registry', p_actor, p_correlation) THEN v_cleared := v_cleared + 1; END IF;
      ELSIF a.owner_principal_id IS NULL THEN
        v_ev := products.catalog_flag_set(a.asset_id, p_tenant, p_domain, 'unowned', 'the registry names no owner', p_actor, p_correlation);
        IF v_ev IS NOT NULL THEN v_flagged := v_flagged || jsonb_build_object('unowned', coalesce((v_flagged ->> 'unowned')::int, 0) + 1); END IF;
      END IF;
      IF v_changed <> '{}'::jsonb THEN PERFORM products.catalog_event(a.asset_id, p_tenant, p_domain, 'asset.reconciled', p_actor, jsonb_build_object('changed', v_changed, 'trigger', v_trigger), p_correlation); END IF;
    END IF;
  END LOOP;

  -- 2. ORPHANS: registry-kind entries this run did not see (their registry row is gone)
  FOR a IN SELECT * FROM products.catalog_assets x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.kind = ANY (products.catalog_registry_kinds()) AND (x.last_observed_at IS NULL OR x.last_observed_at < v_started) LOOP
    v_ev := products.catalog_flag_set(a.asset_id, p_tenant, p_domain, 'orphan', format('%s %s names no row of its registry any more', a.kind, a.ref), p_actor, p_correlation);
    IF v_ev IS NOT NULL THEN
      v_flagged := v_flagged || jsonb_build_object('orphan', coalesce((v_flagged ->> 'orphan')::int, 0) + 1);
      v_items := v_items || jsonb_build_object('asset_id', a.asset_id, 'flag', 'orphan', 'cause_event_id', v_ev);
    END IF;
  END LOOP;

  -- 3. STAGING ASSETS: no owner and no live lineage edge → orphan; otherwise not
  FOR a IN SELECT * FROM products.catalog_assets x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.kind = 'staging' LOOP
    IF a.owner_principal_id IS NULL AND NOT EXISTS (SELECT 1 FROM products.lineage_edges e WHERE (e.from_asset_id = a.asset_id OR e.to_asset_id = a.asset_id) AND e.retired_at IS NULL) THEN
      v_ev := products.catalog_flag_set(a.asset_id, p_tenant, p_domain, 'orphan', 'a staging asset with no owner and no lineage', p_actor, p_correlation);
      IF v_ev IS NOT NULL THEN
        v_flagged := v_flagged || jsonb_build_object('orphan', coalesce((v_flagged ->> 'orphan')::int, 0) + 1);
        v_items := v_items || jsonb_build_object('asset_id', a.asset_id, 'flag', 'orphan', 'cause_event_id', v_ev);
      END IF;
    ELSIF products.catalog_flag_clear(a.asset_id, p_tenant, p_domain, 'orphan', 'the staging asset has an owner or lineage', p_actor, p_correlation) THEN
      v_cleared := v_cleared + 1;
    END IF;
  END LOOP;

  -- 4. DUPLICATES: one kind, one normalised title, more than one entry
  FOR a IN SELECT * FROM products.catalog_assets x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain LOOP
    IF EXISTS (SELECT 1 FROM products.catalog_assets y WHERE y.tenant_id = p_tenant AND y.domain_id = p_domain AND y.kind = a.kind AND y.asset_id <> a.asset_id AND lower(btrim(y.title)) = lower(btrim(a.title))) THEN
      v_ev := products.catalog_flag_set(a.asset_id, p_tenant, p_domain, 'duplicate', format('another %s entry carries the title %s', a.kind, a.title), p_actor, p_correlation);
      IF v_ev IS NOT NULL THEN v_flagged := v_flagged || jsonb_build_object('duplicate', coalesce((v_flagged ->> 'duplicate')::int, 0) + 1); END IF;
    ELSIF products.catalog_flag_clear(a.asset_id, p_tenant, p_domain, 'duplicate', 'no other entry carries the title', p_actor, p_correlation) THEN
      v_cleared := v_cleared + 1;
    END IF;
  END LOOP;

  -- 5. OWNERSHIP RECERTIFICATION and 6. LINEAGE COVERAGE
  FOR a IN SELECT * FROM products.catalog_assets x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain LOOP
    IF a.owner_principal_id IS NOT NULL AND a.recertify_by < v_now THEN
      v_ev := products.catalog_flag_set(a.asset_id, p_tenant, p_domain, 'ownership_lapsed', format('the ownership recertification was due %s', a.recertify_by), p_actor, p_correlation);
      IF v_ev IS NOT NULL THEN
        v_flagged := v_flagged || jsonb_build_object('ownership_lapsed', coalesce((v_flagged ->> 'ownership_lapsed')::int, 0) + 1);
        v_items := v_items || jsonb_build_object('asset_id', a.asset_id, 'flag', 'ownership_lapsed', 'cause_event_id', v_ev);
      END IF;
    ELSIF products.catalog_flag_clear(a.asset_id, p_tenant, p_domain, 'ownership_lapsed', 'the ownership is certified', p_actor, p_correlation) THEN
      v_cleared := v_cleared + 1;
    END IF;
    IF a.kind = 'product' AND a.lifecycle_state IN ('released', 'degraded')
       AND NOT EXISTS (SELECT 1 FROM products.lineage_edges e WHERE (e.from_asset_id = a.asset_id OR e.to_asset_id = a.asset_id) AND e.retired_at IS NULL) THEN
      v_ev := products.catalog_flag_set(a.asset_id, p_tenant, p_domain, 'lineage_missing', 'a released product with no lineage edge', p_actor, p_correlation);
      IF v_ev IS NOT NULL THEN v_flagged := v_flagged || jsonb_build_object('lineage_missing', coalesce((v_flagged ->> 'lineage_missing')::int, 0) + 1); END IF;
    ELSIF products.catalog_flag_clear(a.asset_id, p_tenant, p_domain, 'lineage_missing', 'lineage is declared or the product is not released', p_actor, p_correlation) THEN
      v_cleared := v_cleared + 1;
    END IF;
  END LOOP;

  -- the marks follow the flags, for every entry of the domain
  UPDATE products.catalog_assets x
     SET discoverable = NOT (x.flags @> '[{"kind":"orphan"}]'::jsonb),
         trusted = NOT (x.flags @> '[{"kind":"stale"}]'::jsonb OR x.flags @> '[{"kind":"ownership_lapsed"}]'::jsonb OR x.flags @> '[{"kind":"inconsistent"}]'::jsonb)
   WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain
     AND (x.discoverable <> NOT (x.flags @> '[{"kind":"orphan"}]'::jsonb)
          OR x.trusted <> NOT (x.flags @> '[{"kind":"stale"}]'::jsonb OR x.flags @> '[{"kind":"ownership_lapsed"}]'::jsonb OR x.flags @> '[{"kind":"inconsistent"}]'::jsonb));

  -- the attention items for the NEW orphan and ownership_lapsed flags
  FOR reg IN SELECT (x ->> 'asset_id')::uuid AS asset_id, x ->> 'flag' AS flag, (x ->> 'cause_event_id')::uuid AS cause FROM jsonb_array_elements(v_items) x LOOP
    v_id := products.catalog_raise_coverage(reg.asset_id, p_tenant, p_domain, reg.flag, reg.cause, p_actor, p_correlation);
  END LOOP;

  INSERT INTO products.catalog_reconciliations (run_id, scope, tenant_id, domain_id, trigger, started_at, finished_at, counts, actor_principal_id, correlation_id)
  VALUES (p_run_id, 'DOMAIN', p_tenant, p_domain, v_trigger, v_started, clock_timestamp(),
          jsonb_build_object('seen', v_seen, 'created', v_created, 'flagged_by_kind', v_flagged, 'cleared', v_cleared, 'attention_items', jsonb_array_length(v_items)), p_actor, p_correlation)
  RETURNING * INTO v_run;
  PERFORM products.catalog_event(NULL, p_tenant, p_domain, 'catalog.reconciled', p_actor, jsonb_build_object('run_id', p_run_id, 'trigger', v_trigger, 'counts', v_run.counts), p_correlation);
  RETURN (to_jsonb(v_run) - 'scope' - 'correlation_id') || jsonb_build_object('items', v_items);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION products.reconcile_catalog(uuid,uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION products.reconcile_catalog(uuid,uuid,uuid,uuid,uuid) TO eye_commit;

-- ═════════════════════════════════════════════════════════════════════
-- §K.5 THE READS (invoker reads under the caller's RLS)
-- ═════════════════════════════════════════════════════════════════════
/* THE ASSET READ: the entry, its owner, its flags, its lineage both ways (each neighbour's kind, ref and title), its glossary terms with
   their definitions, its product's released version and the latest observation per measure when it is a product, its ledger. */
CREATE OR REPLACE FUNCTION products.catalog_asset_read(p_asset_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = products, pg_catalog, pg_temp AS $$
  SELECT products.catalog_asset_json(a)
         || jsonb_build_object(
              'upstream', coalesce((SELECT jsonb_agg(jsonb_build_object('edge_id', e.edge_id, 'kind', e.kind, 'asset_id', n.asset_id, 'asset_kind', n.kind, 'ref', n.ref, 'title', n.title, 'trusted', n.trusted, 'discoverable', n.discoverable, 'declared_at', e.declared_at, 'evidence', e.evidence) ORDER BY e.declared_at)
                                     FROM products.lineage_edges e JOIN products.catalog_assets n ON n.asset_id = e.from_asset_id WHERE e.to_asset_id = a.asset_id AND e.retired_at IS NULL), '[]'::jsonb),
              'downstream', coalesce((SELECT jsonb_agg(jsonb_build_object('edge_id', e.edge_id, 'kind', e.kind, 'asset_id', n.asset_id, 'asset_kind', n.kind, 'ref', n.ref, 'title', n.title, 'trusted', n.trusted, 'discoverable', n.discoverable, 'declared_at', e.declared_at, 'evidence', e.evidence) ORDER BY e.declared_at)
                                       FROM products.lineage_edges e JOIN products.catalog_assets n ON n.asset_id = e.to_asset_id WHERE e.from_asset_id = a.asset_id AND e.retired_at IS NULL), '[]'::jsonb),
              'terms', coalesce((SELECT jsonb_agg(jsonb_build_object('term_id', g.term_id, 'term', g.term, 'definition', g.definition, 'owner_principal_id', g.owner_principal_id, 'owner_name', products.catalog_principal_name(g.owner_principal_id), 'version', g.version) ORDER BY g.term)
                                   FROM products.glossary_terms g WHERE g.tenant_id = a.tenant_id AND g.domain_id = a.domain_id AND g.term_key = ANY (SELECT lower(btrim(x)) FROM unnest(a.glossary_terms) x)), '[]'::jsonb),
              'product', CASE WHEN a.kind = 'product' THEN
                           (SELECT jsonb_build_object('product_id', p.product_id, 'product_key', p.product_key, 'kind', p.kind, 'state', p.state, 'released_version', p.released_version, 'owner_principal_id', p.owner_principal_id,
                                                      'slo', coalesce((SELECT jsonb_object_agg(m.measure, jsonb_build_object('value', m.value, 'threshold', m.threshold, 'met', m.met, 'observed_at', m.observed_at, 'source', m.source))
                                                                         FROM (SELECT DISTINCT ON (s.measure) s.* FROM products.slo_observations s WHERE s.product_id = p.product_id ORDER BY s.measure, s.observed_at DESC) m), '{}'::jsonb))
                              FROM products.products_current p WHERE p.product_id::text = a.ref)
                         END,
              'events', coalesce((SELECT jsonb_agg(jsonb_build_object('event_id', v.event_id, 'event', v.event, 'occurred_at', v.occurred_at, 'actor_principal_id', v.actor_principal_id, 'details', v.details) ORDER BY v.occurred_at DESC)
                                    FROM (SELECT * FROM products.catalog_events x WHERE x.asset_id = a.asset_id ORDER BY x.occurred_at DESC LIMIT 50) v), '[]'::jsonb))
    FROM products.catalog_assets a WHERE a.asset_id = p_asset_id
$$;
GRANT EXECUTE ON FUNCTION products.catalog_asset_read(uuid) TO eye_app, eye_commit;

/* DISCOVERY (DAT-TR-01; DP-49-006 "search permission"): full text over title, description, ref and glossary terms ('simple': identifiers
   kept whole) plus the owner's display name, ranked, with an ILIKE fallback for short queries and partial identifiers; DISCOVERABLE
   entries within the READER's CLEARANCE only — what is hidden by either rule is COUNTED (`hidden`), never served. The clearance is the
   route's (shared/clearance.ts clearanceOf: administrators and auditors restricted, executives and owners confidential, else internal). */
CREATE OR REPLACE FUNCTION products.catalog_search(p_q text, p_kinds text[], p_limit int, p_clearance text) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = products, pg_catalog, pg_temp AS $$
  WITH q AS (SELECT btrim(coalesce(p_q, '')) AS q, plainto_tsquery('simple', btrim(coalesce(p_q, ''))) AS tq,
                    CASE coalesce(p_clearance, 'public') WHEN 'public' THEN 0 WHEN 'internal' THEN 1 WHEN 'confidential' THEN 2 WHEN 'restricted' THEN 3 ELSE 0 END AS clearance_rank),
  cand AS (
    SELECT a.asset_id, a.title, a.discoverable,
           (CASE a.classification WHEN 'public' THEN 0 WHEN 'internal' THEN 1 WHEN 'confidential' THEN 2 WHEN 'restricted' THEN 3 ELSE 3 END) <= q.clearance_rank AS cleared,
           CASE WHEN q.q = '' THEN 0
                ELSE ts_rank(products.catalog_search_document(a.title, a.description, a.ref, a.glossary_terms), q.tq)
                     + CASE WHEN a.title ILIKE '%' || q.q || '%' THEN 0.5 ELSE 0 END
                     + CASE WHEN a.ref ILIKE '%' || q.q || '%' THEN 0.25 ELSE 0 END END AS rank
      FROM products.catalog_assets a, q
     WHERE (p_kinds IS NULL OR cardinality(p_kinds) = 0 OR a.kind = ANY (p_kinds))
       AND (q.q = ''
            OR (q.tq <> ''::tsquery AND (products.catalog_search_document(a.title, a.description, a.ref, a.glossary_terms) @@ q.tq
                                         OR to_tsvector('simple', coalesce(products.catalog_principal_name(a.owner_principal_id), '')) @@ q.tq))
            OR a.title ILIKE '%' || q.q || '%' OR a.ref ILIKE '%' || q.q || '%'
            OR coalesce(products.catalog_principal_name(a.owner_principal_id), '') ILIKE '%' || q.q || '%')
  ),
  served AS (SELECT c.* FROM cand c WHERE c.discoverable AND c.cleared ORDER BY c.rank DESC, c.title LIMIT greatest(1, least(coalesce(p_limit, 50), 200)))
  SELECT jsonb_build_object(
           'at', now(), 'q', (SELECT q FROM q), 'clearance', coalesce(p_clearance, 'public'), 'kinds', coalesce(to_jsonb(p_kinds), '[]'::jsonb),
           'total', (SELECT count(*) FROM cand),
           'hidden', (SELECT count(*) FROM cand c WHERE NOT (c.discoverable AND c.cleared)),
           'hidden_by', jsonb_build_object('undiscoverable', (SELECT count(*) FROM cand c WHERE NOT c.discoverable), 'clearance', (SELECT count(*) FROM cand c WHERE c.discoverable AND NOT c.cleared)),
           'hits', coalesce((SELECT jsonb_agg(products.catalog_asset_read(s.asset_id) || jsonb_build_object('rank', s.rank) ORDER BY s.rank DESC, s.title) FROM served s), '[]'::jsonb))
$$;
GRANT EXECUTE ON FUNCTION products.catalog_search(text, text[], int, text) TO eye_app, eye_commit;

/* COVERAGE DEBT (DP-49-006): per kind — total, owned, trusted, discoverable, lineage-covered (a live edge either way), flagged by kind —
   the totals, the last reconciliation, and the open catalog.coverage items of the domain. */
CREATE OR REPLACE FUNCTION products.catalog_coverage(p_tenant uuid, p_domain uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = products, executive, pg_catalog, pg_temp AS $$
  WITH a AS (SELECT x.*, EXISTS (SELECT 1 FROM products.lineage_edges e WHERE (e.from_asset_id = x.asset_id OR e.to_asset_id = x.asset_id) AND e.retired_at IS NULL) AS lineage_covered
               FROM products.catalog_assets x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain),
  per_kind AS (
    SELECT a.kind,
           jsonb_build_object('total', count(*), 'owned', count(*) FILTER (WHERE a.owner_principal_id IS NOT NULL), 'trusted', count(*) FILTER (WHERE a.trusted),
                              'discoverable', count(*) FILTER (WHERE a.discoverable), 'lineage_covered', count(*) FILTER (WHERE a.lineage_covered),
                              'flagged', coalesce((SELECT jsonb_object_agg(f.k, f.n) FROM (SELECT fl ->> 'kind' AS k, count(*) AS n FROM a a2, jsonb_array_elements(a2.flags) fl WHERE a2.kind = a.kind GROUP BY 1) f), '{}'::jsonb)) AS stats
      FROM a GROUP BY a.kind)
  SELECT jsonb_build_object(
           'at', now(),
           'kinds', coalesce((SELECT jsonb_object_agg(k.kind, k.stats) FROM per_kind k), '{}'::jsonb),
           'totals', (SELECT jsonb_build_object('total', count(*), 'owned', count(*) FILTER (WHERE a.owner_principal_id IS NOT NULL), 'unowned', count(*) FILTER (WHERE a.owner_principal_id IS NULL),
                                                'trusted', count(*) FILTER (WHERE a.trusted), 'untrusted', count(*) FILTER (WHERE NOT a.trusted),
                                                'discoverable', count(*) FILTER (WHERE a.discoverable), 'undiscoverable', count(*) FILTER (WHERE NOT a.discoverable),
                                                'lineage_covered', count(*) FILTER (WHERE a.lineage_covered), 'flagged', count(*) FILTER (WHERE a.flags <> '[]'::jsonb),
                                                'stale_now', count(*) FILTER (WHERE a.kind = ANY (products.catalog_registry_kinds()) AND a.last_observed_at IS NOT NULL AND a.last_observed_at < now() - products.catalog_staleness_period()))
                        FROM a),
           'flagged_by_kind', coalesce((SELECT jsonb_object_agg(f.k, f.n) FROM (SELECT fl ->> 'kind' AS k, count(*) AS n FROM a, jsonb_array_elements(a.flags) fl GROUP BY 1) f), '{}'::jsonb),
           'last_reconciliation', (SELECT to_jsonb(r) - 'scope' - 'correlation_id' FROM products.catalog_reconciliations r WHERE r.tenant_id = p_tenant AND r.domain_id = p_domain ORDER BY r.finished_at DESC LIMIT 1),
           'open_items', (SELECT count(*) FROM executive.attention_items i WHERE i.tenant_id = p_tenant AND i.domain_id = p_domain AND i.signal_class = 'catalog.coverage' AND i.state IN ('open', 'escalated', 'unrouted')),
           'staleness_period', products.catalog_staleness_period()::text, 'recertification_period', products.catalog_recertification_period()::text)
$$;
GRANT EXECUTE ON FUNCTION products.catalog_coverage(uuid, uuid) TO eye_app, eye_commit;

/* THE STOP OF NEW CONSUMPTION: what a consumer asks before it registers against an asset (a subscription against an event product, a
   certification of a metric over a source) — trusted, discoverable, the flags; staleness judged AS OF NOW as well as by the last run; an
   asset the catalog does not know is coverage debt: not trusted. An invoker read under the caller's RLS (the caller's own domain). */
CREATE OR REPLACE FUNCTION products.catalog_trust(p_kind text, p_ref text) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = products, pg_catalog, pg_temp AS $$
  SELECT coalesce(
    (SELECT jsonb_build_object('known', true, 'asset_id', a.asset_id, 'kind', a.kind, 'ref', a.ref, 'title', a.title, 'owner_principal_id', a.owner_principal_id,
                               'trusted', a.trusted AND NOT (a.kind = ANY (products.catalog_registry_kinds()) AND a.last_observed_at IS NOT NULL AND a.last_observed_at < now() - products.catalog_staleness_period()),
                               'discoverable', a.discoverable,
                               'flags', a.flags || CASE WHEN a.kind = ANY (products.catalog_registry_kinds()) AND a.last_observed_at IS NOT NULL AND a.last_observed_at < now() - products.catalog_staleness_period() AND NOT (a.flags @> '[{"kind":"stale"}]'::jsonb)
                                                        THEN jsonb_build_array(jsonb_build_object('kind', 'stale', 'since', a.last_observed_at + products.catalog_staleness_period(), 'reason', 'judged at read: not seen in its registry within the staleness period'))
                                                        ELSE '[]'::jsonb END,
                               'last_observed_at', a.last_observed_at, 'as_of', now())
       FROM products.catalog_assets a WHERE a.kind = p_kind AND a.ref = p_ref AND a.tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR a.domain_id = public.eye_domain()) LIMIT 1),
    jsonb_build_object('known', false, 'kind', p_kind, 'ref', p_ref, 'trusted', false, 'discoverable', false, 'flags', '[]'::jsonb, 'as_of', now(), 'note', 'not catalogued: coverage debt (DP-49-006)'))
$$;
GRANT EXECUTE ON FUNCTION products.catalog_trust(text, text) TO eye_app, eye_commit;

-- ═════════════════════════════════════════════════════════════════════
-- section `events` (§E) — the part-local file 0095_b90_x_events.sql, combined here at integration in the apply order every fresh-database run used (§0, §K, §E, §M, §R)
-- ═════════════════════════════════════════════════════════════════════
-- ═════════════════════════════════════════════════════════════════════
-- section `events`
-- ═════════════════════════════════════════════════════════════════════
-- 0095 §E — CP-6 B90 PART E (2026-09-30): EVENT PRODUCTS AND SUBSCRIPTIONS — F-P7-F-09's event half (V7 ch43 DP-43-001..006; App A
-- DAT-SV-03; App G DPD-13; App B DZ-16 "event products"). Built on the prelude (§0: products_current, product_versions, product_reviews,
-- slo_observations, product_events, observe_slo) and nothing else of the registry; the outbox and the graph subscriptions (0006, 0063) are
-- the platform's INTERNAL consumers and are not touched — an event PRODUCT is served by PULL from its own stream.
--
--   E.1 THE VOCABULARY: the WHITELIST of the platform's own ledgers an event product may read (never a table the caller names), the six
--       event kinds (change | signal | correction | lifecycle | quality | strategic) and the mapping from a ledger's event name to a kind,
--       the projection of a source row's details to the declared schema's fields (never the whole row).
--   E.2 THE RECORD: products.event_products (the event declaration of a product of kind event: the VERSIONED schema — a registered
--       reference or declared fields —, the producer domain, the subject kind, the ordering key, pull delivery, the retention, the replay
--       policy, the SOURCE ledger; its compatibility with the prior declaration), products.event_stream (the DENSE per-product sequence:
--       kind, subject, ordering key value, occurred instant, the PROJECTED payload, the schema version, the source row once; append-only;
--       retention enforced on read, never by deletion here), products.event_subscriptions (the consumer, the PURPOSE, the DATA scope, the
--       TIME window, the CONSEQUENCE class, the filters, the accepted schema version, the LAG POLICY, the correction / replay capability;
--       registered → active → paused | lagging → active | revoked; the checkpoint PRESERVED on every state), products.subscription_checkpoints
--       (every acknowledgement and every replay, append-only), products.subscription_replays (append-only).
--   E.3 THE PORTS: declare_event_product (products.event_product.declare), emit_events (executive.attention.tick — the step `event-products`),
--       register_subscription / authorize_subscription / read_subscription_events / advance_checkpoint / pause_subscription /
--       conform_subscription / resume_subscription / replay_subscription / revoke_subscription (products.subscription.*),
--       evaluate_subscription_lag (executive.attention.tick — the step `subscription-lag`: the lag against the policy, the schema
--       compatibility, the attention item to the product owner, the SLO observations lag_events / lag_seconds on the prelude's ledger),
--       the reads event_product_read and subscription_read (invoker reads under the caller's RLS).
--   THE AUTHORITY BOUNDARY (DP-43-002): a subscription grants only the declared data (a subset of the schema's fields), purpose (one of
--   the product's policy purposes), time (the window), tenant (a named, active human of THIS tenant) and consequence scope; a read never
--   serves before the checkpoint ("consumers may not infer broader access from topic reachability"). THE CONTINUITY RULE (DP-43-006): a
--   subscription lagging beyond its policy, or accepting a schema the product broke, is PAUSED with its offset preserved, its owner
--   notified, and RESUMES only after the consumer's conformance and the owner's word.
--   Refusal family: `event product rejected (<class>)` and `subscription rejected (<class>)` — actor | authority | not_consumer → 403,
--   unknown_* → 404, state | lag | schema_pending → 409, the rest → 422. Every figure a harness seeds is SYNTHETIC. Forward-only.

-- ═════════════════════════════════════════════════════════════════════
-- §E.1 THE VOCABULARY
-- ═════════════════════════════════════════════════════════════════════
/* The whitelist: the platform's own ledgers an event product may read. The emitter's CASE dispatches on this name; nothing else is read. */
CREATE OR REPLACE FUNCTION products.event_source_ledgers() RETURNS text[]
LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY['prediction.warning_events', 'prediction.forecast_events', 'decision.package_events', 'prediction.exposure_events',
  'graph.strategy_detections', 'executive.briefing_events', 'products.product_events'] $$;

/* The six event kinds of ch43 ("versioned change, signal, correction, lifecycle, quality and strategic events"). */
CREATE OR REPLACE FUNCTION products.event_kinds() RETURNS text[]
LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY['change', 'signal', 'correction', 'lifecycle', 'quality', 'strategic'] $$;

/* A ledger's event NAME → the event KIND, mechanically: a corrected / correction / re_flagged / contested / retracted name is a correction;
   a warning.* / signal.* name (and an *.attention, *.appetite_breached) is a signal; strategy.* / exposure.* are strategic; a quality /
   unfit / coverage / stale / gamed / degraded name is quality; a terminal or opening verb is lifecycle; the rest is change. */
CREATE OR REPLACE FUNCTION products.event_kind_of(p_name text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_name ~ '(corrected|correction|re_flagged|contested|retracted)' THEN 'correction'
    WHEN p_name ~ '^(warning|signal)\.' OR p_name ~ '\.(attention|appetite_breached)$' THEN 'signal'
    WHEN p_name ~ '^(strategy|exposure)\.' THEN 'strategic'
    WHEN p_name ~ '(quality|unfit|coverage|stale|gamed|degraded)' THEN 'quality'
    WHEN p_name ~ '\.(registered|declared|opened|issued|raised|closed|withdrawn|retired|committed|released|resolved|superseded|expired|proposed|approved|rejected|sponsored|restored|revoked|authorized|reopened)$' THEN 'lifecycle'
    ELSE 'change' END $$;

/* Whether a source (its ledger, or the kinds it narrows to) carries correction events: the three ledgers whose vocabulary names one
   (warning.retracted, exposure.assessment_contested, briefing.re_flagged), or any narrowed kind that maps to a correction. */
CREATE OR REPLACE FUNCTION products.event_source_emits_corrections(p_source jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN jsonb_typeof(p_source -> 'kinds') = 'array' AND jsonb_array_length(p_source -> 'kinds') > 0
      THEN EXISTS (SELECT 1 FROM jsonb_array_elements_text(p_source -> 'kinds') k WHERE products.event_kind_of(k) = 'correction')
    ELSE (p_source ->> 'ledger') IN ('prediction.warning_events', 'prediction.exposure_events', 'executive.briefing_events') END $$;

/* The PROJECTION: a source row's details reduced to the named fields — never the whole row (DP-43-002 "only declared data"). */
CREATE OR REPLACE FUNCTION products.event_projection(p_details jsonb, p_fields text[]) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce((SELECT jsonb_object_agg(e.key, e.value) FROM jsonb_each(coalesce(p_details, '{}'::jsonb)) e WHERE e.key = ANY (p_fields)), '{}'::jsonb) $$;

/* The declared schema's FIELDS: a registered reference's json_schema properties, or the declared fields' names (NULL when neither names one). */
CREATE OR REPLACE FUNCTION products.event_schema_fields(p_ref jsonb, p_json jsonb) RETURNS text[]
LANGUAGE sql STABLE SET search_path = objects, pg_catalog, pg_temp AS $$
  SELECT CASE
    WHEN p_ref IS NOT NULL THEN (SELECT array_agg(k ORDER BY k) FROM objects.schema_registry s, jsonb_object_keys(coalesce(s.json_schema -> 'properties', '{}'::jsonb)) k
                                  WHERE s.object_type = p_ref ->> 'object_type' AND s.schema_version = p_ref ->> 'schema_version')
    WHEN jsonb_typeof(p_json -> 'fields') = 'array' THEN (SELECT array_agg(f ->> 'name' ORDER BY f ->> 'name') FROM jsonb_array_elements(p_json -> 'fields') f WHERE jsonb_typeof(f -> 'name') = 'string')
    ELSE NULL END $$;

GRANT EXECUTE ON FUNCTION products.event_source_ledgers() TO eye_app, eye_commit;
GRANT EXECUTE ON FUNCTION products.event_kinds() TO eye_app, eye_commit;
GRANT EXECUTE ON FUNCTION products.event_kind_of(text) TO eye_app, eye_commit;
GRANT EXECUTE ON FUNCTION products.event_source_emits_corrections(jsonb) TO eye_app, eye_commit;
GRANT EXECUTE ON FUNCTION products.event_projection(jsonb, text[]) TO eye_app, eye_commit;
GRANT EXECUTE ON FUNCTION products.event_schema_fields(jsonb, jsonb) TO eye_app, eye_commit;

-- ═════════════════════════════════════════════════════════════════════
-- §E.2 THE RECORD
-- ═════════════════════════════════════════════════════════════════════
CREATE TABLE products.event_products (
  product_id           uuid PRIMARY KEY REFERENCES products.products_current (product_id),
  tenant_id            uuid NOT NULL,
  domain_id            uuid NOT NULL,
  declaration_version  int  NOT NULL DEFAULT 1 CHECK (declaration_version >= 1),
  schema_ref           jsonb CHECK (schema_ref IS NULL OR jsonb_typeof(schema_ref) = 'object'),      -- {object_type, schema_version} of objects.schema_registry
  schema_json          jsonb CHECK (schema_json IS NULL OR jsonb_typeof(schema_json) = 'object'),    -- {version, fields: [{name, type, …}]}
  schema_version       text NOT NULL CHECK (schema_version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'),
  schema_fields        text[] NOT NULL CHECK (cardinality(schema_fields) >= 1),                     -- the projection (E.1)
  compatibility        text NOT NULL DEFAULT 'additive' CHECK (compatibility IN ('additive', 'breaking')),  -- of THIS declaration with the prior one
  producer_domain_id   uuid NOT NULL,                                                                -- this domain (the producer is the platform's own ledger)
  subject_kind         text NOT NULL CHECK (subject_kind ~ '^[a-z][a-z0-9_]{1,63}$'),
  ordering_key         text NOT NULL DEFAULT 'subject_id' CHECK (ordering_key ~ '^[a-z][a-z0-9_]{1,63}$'),   -- subject_id, or a details key
  delivery             text NOT NULL DEFAULT 'pull' CHECK (delivery = 'pull'),
  retention_days       int  NOT NULL CHECK (retention_days BETWEEN 1 AND 3650),
  replay_policy        jsonb NOT NULL DEFAULT '{"allowed": true}'::jsonb CHECK (jsonb_typeof(replay_policy) = 'object'),
  source               jsonb NOT NULL CHECK (jsonb_typeof(source) = 'object' AND (source ->> 'ledger') = ANY (products.event_source_ledgers())),  -- {ledger, kinds?, since}
  declared_by          uuid NOT NULL,
  declared_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at           timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id       uuid NOT NULL,
  CONSTRAINT pev_ep_schema_one CHECK ((schema_ref IS NULL) <> (schema_json IS NULL))
);
COMMENT ON TABLE products.event_products IS 'B90 (0095 §E): the event declaration of a product of kind event (DP-43-001: schema, producer, subject, ordering key, delivery, retention, replay policy) and its SOURCE — one of the platform''s own ledgers (the whitelist); re-declared by version, never deleted.';
CREATE TRIGGER pev_ep_no_delete BEFORE DELETE ON products.event_products FOR EACH ROW EXECUTE FUNCTION products.no_delete();

CREATE TABLE products.event_stream (
  product_id       uuid NOT NULL REFERENCES products.event_products (product_id),
  sequence         bigint NOT NULL CHECK (sequence >= 1),
  tenant_id        uuid NOT NULL,
  domain_id        uuid NOT NULL,
  event_kind       text NOT NULL CHECK (event_kind = ANY (products.event_kinds())),
  source_event     text NOT NULL,                       -- the ledger's own event name
  subject_id       uuid NOT NULL,
  ordering_key     text,                                -- the ordering key's VALUE on this row
  occurred_at      timestamptz NOT NULL,
  payload          jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),   -- the source details PROJECTED to the schema's fields
  schema_version   text NOT NULL,
  source_event_id  uuid NOT NULL,
  recorded_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id   uuid NOT NULL,
  PRIMARY KEY (product_id, sequence),
  CONSTRAINT pev_es_source_once UNIQUE (product_id, source_event_id)
);
CREATE INDEX pev_es_occurred ON products.event_stream (product_id, occurred_at);
CREATE TRIGGER pev_es_append_only BEFORE UPDATE OR DELETE ON products.event_stream FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE products.event_stream IS 'B90 (0095 §E): the stream of an event product — a DENSE per-product sequence written by the emitter (the tick step event-products) from the declared source ledger; append-only; retention is enforced on read (older rows are not served), never by deletion here.';

CREATE TABLE products.event_subscriptions (
  subscription_id        uuid PRIMARY KEY,
  product_id             uuid NOT NULL REFERENCES products.event_products (product_id),
  tenant_id              uuid NOT NULL,
  domain_id              uuid NOT NULL,
  consumer_principal_id  uuid NOT NULL,                  -- a named, active human of THIS tenant
  consumer_domain_id     uuid NOT NULL,
  purpose                text NOT NULL CHECK (length(btrim(purpose)) BETWEEN 2 AND 120),
  granted                jsonb NOT NULL CHECK (jsonb_typeof(granted) = 'object'),    -- {fields, from, to, consequence}
  filters                jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(filters) = 'object'),   -- {event_kinds?, ordering_keys?, subject_ids?, subject_kinds?}
  schema_version         text NOT NULL,                  -- the version the consumer accepts
  lag_policy             jsonb NOT NULL CHECK (jsonb_typeof(lag_policy) = 'object'), -- {max_lag_events, max_lag_seconds}
  handles_corrections    boolean NOT NULL,
  handles_replays        boolean NOT NULL,
  state                  text NOT NULL DEFAULT 'registered' CHECK (state IN ('registered', 'active', 'paused', 'lagging', 'revoked')),
  checkpoint_sequence    bigint NOT NULL DEFAULT 0 CHECK (checkpoint_sequence >= 0),   -- PRESERVED through every pause, lag and revocation
  checkpoint_at          timestamptz,
  paused_reason          text CHECK (paused_reason IS NULL OR paused_reason IN ('lag', 'schema', 'owner')),
  pause_note             text,
  paused_at              timestamptz,
  conformance            jsonb CHECK (conformance IS NULL OR jsonb_typeof(conformance) = 'object'),
  conformed_at           timestamptz,
  revoked_at             timestamptz,
  revoked_by             uuid,
  revocation_reason      text,
  registered_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  registered_by          uuid NOT NULL,
  authorized_at          timestamptz,
  authorized_by          uuid,
  updated_at             timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id         uuid NOT NULL,
  CONSTRAINT pev_sub_paused_bound CHECK ((state IN ('paused', 'lagging')) = (paused_reason IS NOT NULL AND paused_at IS NOT NULL) OR state = 'revoked'),
  CONSTRAINT pev_sub_revoked_bound CHECK ((state = 'revoked') = (revoked_at IS NOT NULL AND revoked_by IS NOT NULL AND revocation_reason IS NOT NULL)),
  CONSTRAINT pev_sub_authorized_bound CHECK ((state = 'registered') = (authorized_at IS NULL) OR state = 'revoked'),
  CONSTRAINT pev_sub_checkpoint_pair CHECK ((checkpoint_sequence = 0) OR checkpoint_at IS NOT NULL)
);
CREATE INDEX pev_sub_product ON products.event_subscriptions (product_id, state);
CREATE INDEX pev_sub_consumer ON products.event_subscriptions (tenant_id, consumer_principal_id);
CREATE TRIGGER pev_sub_no_delete BEFORE DELETE ON products.event_subscriptions FOR EACH ROW EXECUTE FUNCTION products.no_delete();
COMMENT ON TABLE products.event_subscriptions IS 'B90 (0095 §E): a REGISTERED subscription under the authority boundary (DP-43-002: only the declared data, purpose, time, tenant and consequence scope); registered → active (the owner''s authorization) → paused | lagging (the continuity rule, the offset preserved) → active (conformance, then the owner''s resumption) → revoked. Never deleted.';

CREATE TABLE products.subscription_checkpoints (
  checkpoint_id    uuid PRIMARY KEY,
  subscription_id  uuid NOT NULL REFERENCES products.event_subscriptions (subscription_id),
  tenant_id        uuid NOT NULL,
  domain_id        uuid NOT NULL,
  kind             text NOT NULL CHECK (kind IN ('advance', 'replay')),
  from_sequence    bigint NOT NULL CHECK (from_sequence >= 0),
  to_sequence      bigint NOT NULL CHECK (to_sequence >= 0),
  acknowledged_by  uuid NOT NULL,
  acknowledged_at  timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id   uuid NOT NULL,
  CONSTRAINT pev_ck_direction CHECK ((kind = 'advance' AND to_sequence > from_sequence) OR (kind = 'replay' AND to_sequence < from_sequence))
);
CREATE INDEX pev_ck_subscription ON products.subscription_checkpoints (subscription_id, acknowledged_at);
CREATE TRIGGER pev_ck_append_only BEFORE UPDATE OR DELETE ON products.subscription_checkpoints FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE products.subscription_checkpoints IS 'B90 (0095 §E): every move of a subscription''s checkpoint — an acknowledgement (forward only) or a replay (backward, within retention) — append-only.';

CREATE TABLE products.subscription_replays (
  replay_id        uuid PRIMARY KEY,
  subscription_id  uuid NOT NULL REFERENCES products.event_subscriptions (subscription_id),
  tenant_id        uuid NOT NULL,
  domain_id        uuid NOT NULL,
  from_sequence    bigint NOT NULL CHECK (from_sequence >= 0),   -- the checkpoint before the replay
  to_sequence      bigint NOT NULL CHECK (to_sequence >= 0),     -- the checkpoint after it (the consumer re-reads from here)
  reason           text NOT NULL CHECK (length(btrim(reason)) >= 8),
  requested_by     uuid NOT NULL,
  requested_at     timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id   uuid NOT NULL,
  CONSTRAINT pev_rp_backward CHECK (to_sequence < from_sequence)
);
CREATE INDEX pev_rp_subscription ON products.subscription_replays (subscription_id, requested_at);
CREATE TRIGGER pev_rp_append_only BEFORE UPDATE OR DELETE ON products.subscription_replays FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE products.subscription_replays IS 'B90 (0095 §E): a consumer''s replays — the checkpoint moved back within retention, with the reason (DP-43-006 replay semantics) — append-only.';

-- RLS and grants (the 0081 loop idiom; the ports write)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['event_products', 'event_stream', 'event_subscriptions', 'subscription_checkpoints', 'subscription_replays'] LOOP
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
-- §E.3 THE PORTS
-- ═════════════════════════════════════════════════════════════════════
/* The rows as JSON (every read and every port's answer): the row minus its tenant, domain and correlation. */
CREATE OR REPLACE FUNCTION products.event_product_json(r products.event_products) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$ SELECT to_jsonb(r) - 'tenant_id' - 'domain_id' - 'correlation_id' $$;
CREATE OR REPLACE FUNCTION products.subscription_json(s products.event_subscriptions) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$ SELECT to_jsonb(s) - 'tenant_id' - 'domain_id' - 'correlation_id' $$;
GRANT EXECUTE ON FUNCTION products.event_product_json(products.event_products) TO eye_app, eye_commit;
GRANT EXECUTE ON FUNCTION products.subscription_json(products.event_subscriptions) TO eye_app, eye_commit;

/* The owner-or-steward test every owner's act uses (the prelude's idiom): the product's owner, or a named human holding data_steward,
   domain_admin or platform_admin in the domain. */
CREATE OR REPLACE FUNCTION products.event_owner_or_steward(p_owner uuid, p_actor uuid, p_tenant uuid, p_domain uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path = executive, identity, pg_catalog, pg_temp AS $$
  SELECT p_owner = p_actor OR executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['data_steward', 'domain_admin', 'platform_admin']) $$;
REVOKE ALL ON FUNCTION products.event_owner_or_steward(uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION products.event_owner_or_steward(uuid,uuid,uuid,uuid) TO eye_commit;

/* DECLARE THE EVENT PRODUCT (products.event_product.declare): the owner's or a steward's act on a product of kind event (registered,
   released or degraded — never withdrawn or retired). The declaration: schema {ref: {object_type, schema_version}} (a registry row whose
   properties are the fields) or {version, fields: [{name, type}]}; subject_kind; ordering_key (subject_id or a details key); delivery pull;
   retention_days 1..3650; replay_policy {allowed}; source {ledger ∈ the whitelist, kinds?: [names], since?: instant}; compatibility
   additive | breaking (with the PRIOR declaration — the tick pauses the subscriptions a breaking one strands). A re-declaration is the
   next declaration_version; the source's `since` is kept from the first declaration unless named. */
CREATE OR REPLACE FUNCTION products.declare_event_product(
  p_product_id uuid, p_tenant uuid, p_domain uuid, p_declaration jsonb, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = products, executive, identity, observation, objects, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r products.products_current%ROWTYPE; ep products.event_products%ROWTYPE; d jsonb := p_declaration; s jsonb; v_ref jsonb; v_json jsonb; v_version text; v_fields text[];
        v_subject text; v_okey text; v_delivery text; v_retention int; v_replay jsonb; v_source jsonb; v_compat text; e jsonb; v_since timestamptz; v_prior_version text; v_next int;
BEGIN
  PERFORM observation.assert_authority(ARRAY['products.event_product.declare']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'event product rejected (actor): declared by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO r FROM products.products_current x WHERE x.product_id = p_product_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'event product rejected (unknown_product): % is not a product of this domain', p_product_id USING ERRCODE = '22023'; END IF;
  IF NOT products.event_owner_or_steward(r.owner_principal_id, p_actor, p_tenant, p_domain) THEN
    RAISE EXCEPTION 'event product rejected (authority): an event product is declared by the product''s owner or by a data steward' USING ERRCODE = '42501';
  END IF;
  IF r.kind <> 'event' THEN RAISE EXCEPTION 'event product rejected (kind): product % is of kind %; an event declaration belongs to a product of kind event (DPD-13)', r.product_key, r.kind USING ERRCODE = '22023'; END IF;
  IF r.state IN ('withdrawn', 'retired') THEN RAISE EXCEPTION 'event product rejected (state): product % is %; a withdrawn or retired product takes no event declaration', r.product_key, r.state USING ERRCODE = '22023'; END IF;
  IF d IS NULL OR jsonb_typeof(d) <> 'object' THEN RAISE EXCEPTION 'event product rejected (declaration): an event declaration is an object' USING ERRCODE = '22023'; END IF;
  -- the schema: a registered reference, or declared fields with a version
  s := d -> 'schema';
  IF s IS NULL OR jsonb_typeof(s) <> 'object' THEN RAISE EXCEPTION 'event product rejected (schema): an event declaration carries a schema object ({ref: {object_type, schema_version}} or {version, fields})' USING ERRCODE = '22023'; END IF;
  IF jsonb_typeof(s -> 'ref') = 'object' THEN
    v_ref := s -> 'ref';
    IF jsonb_typeof(v_ref -> 'object_type') <> 'string' OR jsonb_typeof(v_ref -> 'schema_version') <> 'string' THEN
      RAISE EXCEPTION 'event product rejected (schema): a schema reference names an object_type and a schema_version' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM objects.schema_registry x WHERE x.object_type = v_ref ->> 'object_type' AND x.schema_version = v_ref ->> 'schema_version') THEN
      RAISE EXCEPTION 'event product rejected (schema): schema %@% is not in the schema registry', v_ref ->> 'object_type', v_ref ->> 'schema_version' USING ERRCODE = '22023';
    END IF;
    v_ref := jsonb_build_object('object_type', v_ref ->> 'object_type', 'schema_version', v_ref ->> 'schema_version');
    v_version := (v_ref ->> 'object_type') || '@' || (v_ref ->> 'schema_version');
  ELSIF jsonb_typeof(s -> 'fields') = 'array' AND jsonb_array_length(s -> 'fields') >= 1 THEN
    IF jsonb_typeof(s -> 'version') <> 'string' OR (s ->> 'version') !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$' THEN
      RAISE EXCEPTION 'event product rejected (schema): declared fields carry a version (letters, digits, dots, dashes)' USING ERRCODE = '22023';
    END IF;
    FOR e IN SELECT x FROM jsonb_array_elements(s -> 'fields') x LOOP
      IF jsonb_typeof(e) <> 'object' OR jsonb_typeof(e -> 'name') <> 'string' OR (e ->> 'name') !~ '^[a-z][a-z0-9_]{0,63}$' OR jsonb_typeof(e -> 'type') <> 'string' THEN
        RAISE EXCEPTION 'event product rejected (schema): each declared field names a name (a lower-case identifier) and a type' USING ERRCODE = '22023';
      END IF;
    END LOOP;
    v_json := jsonb_build_object('version', s ->> 'version', 'fields', s -> 'fields');
    v_version := s ->> 'version';
  ELSE
    RAISE EXCEPTION 'event product rejected (schema): a schema is a registered reference (ref) or declared fields (version, fields)' USING ERRCODE = '22023';
  END IF;
  v_fields := products.event_schema_fields(v_ref, v_json);
  IF v_fields IS NULL OR cardinality(v_fields) = 0 THEN RAISE EXCEPTION 'event product rejected (schema): schema % names no fields to project', v_version USING ERRCODE = '22023'; END IF;
  -- the subject, the ordering key, the delivery, the retention, the replay policy
  v_subject := d ->> 'subject_kind';
  IF v_subject IS NULL OR v_subject !~ '^[a-z][a-z0-9_]{1,63}$' THEN RAISE EXCEPTION 'event product rejected (subject): an event declaration names its subject kind (a lower-case identifier)' USING ERRCODE = '22023'; END IF;
  v_okey := coalesce(d ->> 'ordering_key', 'subject_id');
  IF v_okey !~ '^[a-z][a-z0-9_]{1,63}$' THEN RAISE EXCEPTION 'event product rejected (ordering_key): the ordering key is subject_id or a details key (a lower-case identifier)' USING ERRCODE = '22023'; END IF;
  v_delivery := coalesce(d ->> 'delivery', 'pull');
  IF v_delivery <> 'pull' THEN RAISE EXCEPTION 'event product rejected (delivery): an event product is served by pull from its own stream; % is not offered', v_delivery USING ERRCODE = '22023'; END IF;
  IF jsonb_typeof(d -> 'retention_days') <> 'number' OR (d ->> 'retention_days') !~ '^[0-9]+$' OR (d ->> 'retention_days')::int NOT BETWEEN 1 AND 3650 THEN
    RAISE EXCEPTION 'event product rejected (retention): retention_days is a whole number of days in 1..3650' USING ERRCODE = '22023';
  END IF;
  v_retention := (d ->> 'retention_days')::int;
  v_replay := coalesce(d -> 'replay_policy', '{"allowed": true}'::jsonb);
  IF jsonb_typeof(v_replay) <> 'object' OR jsonb_typeof(v_replay -> 'allowed') <> 'boolean' THEN RAISE EXCEPTION 'event product rejected (replay_policy): the replay policy is an object naming whether a replay is allowed' USING ERRCODE = '22023'; END IF;
  -- the source: a whitelisted ledger, the kinds it narrows to, the instant it streams from
  v_source := d -> 'source';
  IF v_source IS NULL OR jsonb_typeof(v_source) <> 'object' OR jsonb_typeof(v_source -> 'ledger') <> 'string' THEN
    RAISE EXCEPTION 'event product rejected (source): an event declaration names its source ledger' USING ERRCODE = '22023';
  END IF;
  IF (v_source ->> 'ledger') <> ALL (products.event_source_ledgers()) THEN
    RAISE EXCEPTION 'event product rejected (source): % is not one of the platform ledgers an event product may read (%)', v_source ->> 'ledger', array_to_string(products.event_source_ledgers(), ', ') USING ERRCODE = '22023';
  END IF;
  IF v_source ? 'kinds' THEN
    IF jsonb_typeof(v_source -> 'kinds') <> 'array' THEN RAISE EXCEPTION 'event product rejected (source): kinds is an array of the ledger''s event names' USING ERRCODE = '22023'; END IF;
    FOR e IN SELECT x FROM jsonb_array_elements(v_source -> 'kinds') x LOOP
      IF jsonb_typeof(e) <> 'string' OR (e #>> '{}') !~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$' THEN RAISE EXCEPTION 'event product rejected (source): % is not an event name', e USING ERRCODE = '22023'; END IF;
    END LOOP;
  END IF;
  IF v_source ? 'since' THEN
    BEGIN v_since := (v_source ->> 'since')::timestamptz; EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'event product rejected (source): since is an instant' USING ERRCODE = '22023'; END;
  END IF;
  v_compat := coalesce(d ->> 'compatibility', 'additive');
  IF v_compat NOT IN ('additive', 'breaking') THEN RAISE EXCEPTION 'event product rejected (compatibility): compatibility is additive or breaking' USING ERRCODE = '22023'; END IF;
  -- the row: the first declaration, or the next version
  SELECT * INTO ep FROM products.event_products x WHERE x.product_id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN
    v_since := coalesce(v_since, clock_timestamp());
    INSERT INTO products.event_products (product_id, tenant_id, domain_id, declaration_version, schema_ref, schema_json, schema_version, schema_fields, compatibility, producer_domain_id, subject_kind,
                                         ordering_key, delivery, retention_days, replay_policy, source, declared_by, correlation_id)
    VALUES (p_product_id, p_tenant, p_domain, 1, v_ref, v_json, v_version, v_fields, 'additive', p_domain, v_subject, v_okey, v_delivery, v_retention, v_replay,
            (v_source - 'since') || jsonb_build_object('since', v_since), p_actor, p_correlation) RETURNING * INTO ep;
    v_next := 1;
  ELSE
    v_prior_version := ep.schema_version;
    v_since := coalesce(v_since, (ep.source ->> 'since')::timestamptz);
    v_next := ep.declaration_version + 1;
    UPDATE products.event_products
       SET declaration_version = v_next, schema_ref = v_ref, schema_json = v_json, schema_version = v_version, schema_fields = v_fields, compatibility = v_compat, subject_kind = v_subject,
           ordering_key = v_okey, delivery = v_delivery, retention_days = v_retention, replay_policy = v_replay, source = (v_source - 'since') || jsonb_build_object('since', v_since),
           declared_by = p_actor, updated_at = clock_timestamp(), correlation_id = p_correlation
     WHERE product_id = p_product_id RETURNING * INTO ep;
  END IF;
  INSERT INTO products.product_events (event_id, scope, tenant_id, domain_id, product_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_product_id, 'event_product.declared', p_actor,
          jsonb_build_object('declaration_version', v_next, 'schema_version', v_version, 'prior_schema_version', v_prior_version, 'compatibility', ep.compatibility, 'ledger', v_source ->> 'ledger',
                             'fields', to_jsonb(v_fields), 'retention_days', v_retention, 'emits_corrections', products.event_source_emits_corrections(ep.source)), p_correlation);
  RETURN products.event_product_json(ep) || jsonb_build_object('product_key', r.product_key, 'product_state', r.state, 'emits_corrections', products.event_source_emits_corrections(ep.source));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION products.declare_event_product(uuid,uuid,uuid,jsonb,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION products.declare_event_product(uuid,uuid,uuid,jsonb,uuid,uuid,uuid) TO eye_commit;

/* THE SOURCE ROWS of a ledger not yet in a product's stream, in the ledger's own (occurred instant, id) order — the CASE on the whitelisted
   name is the ONLY place a ledger is read; a name outside it answers nothing. A definer read of the platform's ledgers, so the tenant and
   the domain are filtered explicitly. Private to the emitter. */
CREATE OR REPLACE FUNCTION products.event_source_rows(p_ledger text, p_tenant uuid, p_domain uuid, p_since timestamptz, p_kinds text[], p_product_id uuid, p_limit int)
RETURNS TABLE (event_id uuid, subject_id uuid, event text, occurred_at timestamptz, details jsonb)
SECURITY DEFINER SET search_path = products, prediction, decision, graph, executive, pg_catalog, pg_temp AS $$
BEGIN
  CASE p_ledger
    WHEN 'prediction.warning_events' THEN
      RETURN QUERY SELECT e.event_id, e.warning_id, e.event, e.occurred_at, e.details FROM prediction.warning_events e
        WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain AND e.occurred_at >= p_since AND (p_kinds IS NULL OR e.event = ANY (p_kinds))
          AND NOT EXISTS (SELECT 1 FROM products.event_stream s WHERE s.product_id = p_product_id AND s.source_event_id = e.event_id)
        ORDER BY e.occurred_at, e.event_id LIMIT p_limit;
    WHEN 'prediction.forecast_events' THEN
      RETURN QUERY SELECT e.event_id, e.forecast_id, e.event, e.occurred_at, e.details FROM prediction.forecast_events e
        WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain AND e.occurred_at >= p_since AND (p_kinds IS NULL OR e.event = ANY (p_kinds))
          AND NOT EXISTS (SELECT 1 FROM products.event_stream s WHERE s.product_id = p_product_id AND s.source_event_id = e.event_id)
        ORDER BY e.occurred_at, e.event_id LIMIT p_limit;
    WHEN 'decision.package_events' THEN
      RETURN QUERY SELECT e.event_id, e.package_id, e.event, e.occurred_at, e.details FROM decision.package_events e
        WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain AND e.occurred_at >= p_since AND (p_kinds IS NULL OR e.event = ANY (p_kinds))
          AND NOT EXISTS (SELECT 1 FROM products.event_stream s WHERE s.product_id = p_product_id AND s.source_event_id = e.event_id)
        ORDER BY e.occurred_at, e.event_id LIMIT p_limit;
    WHEN 'prediction.exposure_events' THEN
      RETURN QUERY SELECT e.event_id, e.exposure_id, e.event, e.occurred_at, e.details FROM prediction.exposure_events e
        WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain AND e.occurred_at >= p_since AND (p_kinds IS NULL OR e.event = ANY (p_kinds))
          AND NOT EXISTS (SELECT 1 FROM products.event_stream s WHERE s.product_id = p_product_id AND s.source_event_id = e.event_id)
        ORDER BY e.occurred_at, e.event_id LIMIT p_limit;
    WHEN 'graph.strategy_detections' THEN
      RETURN QUERY SELECT e.detection_id, e.subject_id, 'strategy.' || e.kind, e.raised_at,
                          jsonb_build_object('kind', e.kind, 'detail', e.detail, 'subject_type', e.subject_type, 'measure_id', e.measure_id, 'cause_key', e.cause_key, 'owner_principal_id', e.owner_principal_id, 'routed_item_id', e.routed_item_id)
        FROM graph.strategy_detections e
        WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain AND e.raised_at >= p_since AND (p_kinds IS NULL OR ('strategy.' || e.kind) = ANY (p_kinds))
          AND NOT EXISTS (SELECT 1 FROM products.event_stream s WHERE s.product_id = p_product_id AND s.source_event_id = e.detection_id)
        ORDER BY e.raised_at, e.detection_id LIMIT p_limit;
    WHEN 'executive.briefing_events' THEN
      RETURN QUERY SELECT e.event_id, e.briefing_id, e.event, e.occurred_at, e.details FROM executive.briefing_events e
        WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain AND e.occurred_at >= p_since AND (p_kinds IS NULL OR e.event = ANY (p_kinds))
          AND NOT EXISTS (SELECT 1 FROM products.event_stream s WHERE s.product_id = p_product_id AND s.source_event_id = e.event_id)
        ORDER BY e.occurred_at, e.event_id LIMIT p_limit;
    WHEN 'products.product_events' THEN
      RETURN QUERY SELECT e.event_id, e.product_id, e.event, e.occurred_at, e.details FROM products.product_events e
        WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain AND e.occurred_at >= p_since AND (p_kinds IS NULL OR e.event = ANY (p_kinds))
          AND NOT EXISTS (SELECT 1 FROM products.event_stream s WHERE s.product_id = p_product_id AND s.source_event_id = e.event_id)
        ORDER BY e.occurred_at, e.event_id LIMIT p_limit;
    ELSE
      RETURN;
  END CASE;
END $$ LANGUAGE plpgsql STABLE;
REVOKE ALL ON FUNCTION products.event_source_rows(text,uuid,uuid,timestamptz,text[],uuid,int) FROM PUBLIC;

/* EMIT (executive.attention.tick — the step `event-products`, order 61): every source row since the last emitted becomes a stream row with
   the next DENSE sequence (the event product's row locked for the batch), its kind by name, the subject, the ordering key's value, the
   occurred instant, the payload PROJECTED to the schema's fields, the schema version; `events.emitted` on product_events with the count
   (when any). Only a released (or degraded) event product with an event declaration streams. */
CREATE OR REPLACE FUNCTION products.emit_events(p_product_id uuid, p_tenant uuid, p_domain uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = products, executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r products.products_current%ROWTYPE; ep products.event_products%ROWTYPE; src record; v_next bigint; v_from bigint; v_n int := 0; v_kinds text[]; v_since timestamptz;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.attention.tick']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT * INTO r FROM products.products_current x WHERE x.product_id = p_product_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'event product rejected (unknown_product): % is not a product of this domain', p_product_id USING ERRCODE = '22023'; END IF;
  IF r.state NOT IN ('released', 'degraded') THEN RAISE EXCEPTION 'event product rejected (state): product % is %; only a released event product streams', r.product_key, r.state USING ERRCODE = '22023'; END IF;
  SELECT * INTO ep FROM products.event_products x WHERE x.product_id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'event product rejected (state): product % has no event declaration', r.product_key USING ERRCODE = '22023'; END IF;
  v_next := coalesce((SELECT max(s.sequence) FROM products.event_stream s WHERE s.product_id = p_product_id), 0) + 1;
  v_from := v_next;
  v_since := coalesce((ep.source ->> 'since')::timestamptz, ep.declared_at);
  IF jsonb_typeof(ep.source -> 'kinds') = 'array' AND jsonb_array_length(ep.source -> 'kinds') > 0 THEN
    SELECT array_agg(k) INTO v_kinds FROM jsonb_array_elements_text(ep.source -> 'kinds') k;
  END IF;
  FOR src IN SELECT * FROM products.event_source_rows(ep.source ->> 'ledger', p_tenant, p_domain, v_since, v_kinds, p_product_id, 1000) LOOP
    INSERT INTO products.event_stream (product_id, sequence, tenant_id, domain_id, event_kind, source_event, subject_id, ordering_key, occurred_at, payload, schema_version, source_event_id, correlation_id)
    VALUES (p_product_id, v_next, p_tenant, p_domain, products.event_kind_of(src.event), src.event, src.subject_id,
            CASE ep.ordering_key WHEN 'subject_id' THEN src.subject_id::text ELSE src.details ->> ep.ordering_key END,
            src.occurred_at, products.event_projection(src.details, ep.schema_fields), ep.schema_version, src.event_id, p_correlation);
    v_next := v_next + 1; v_n := v_n + 1;
  END LOOP;
  IF v_n > 0 THEN
    INSERT INTO products.product_events (event_id, scope, tenant_id, domain_id, product_id, event, actor_principal_id, details, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_product_id, 'events.emitted', p_actor,
            jsonb_build_object('count', v_n, 'from_sequence', v_from, 'to_sequence', v_next - 1, 'ledger', ep.source ->> 'ledger', 'schema_version', ep.schema_version), p_correlation);
  END IF;
  RETURN jsonb_build_object('product_id', p_product_id, 'product_key', r.product_key, 'emitted', v_n, 'head', v_next - 1, 'ledger', ep.source ->> 'ledger');
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION products.emit_events(uuid,uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION products.emit_events(uuid,uuid,uuid,uuid,uuid) TO eye_commit;

/* REGISTER A SUBSCRIPTION (products.subscription.register): the consumer's own act (or a steward's for a named consumer) on a RELEASED
   event product, under the AUTHORITY BOUNDARY — the consumer a named, active human of THIS tenant; the purpose one of the product's policy
   purposes; the granted fields a subset of the schema's; the time window instants or null; the consequence class named; the filters
   (event_kinds, ordering_keys, subject_ids, subject_kinds); the accepted schema version the product's current; the lag policy
   {max_lag_events, max_lag_seconds}; whether corrections and replays can be processed. Opens `registered`; the owner authorizes. */
CREATE OR REPLACE FUNCTION products.register_subscription(
  p_subscription_id uuid, p_product_id uuid, p_tenant uuid, p_domain uuid, p_consumer uuid, p_purpose text, p_granted jsonb, p_filters jsonb, p_schema_version text, p_lag_policy jsonb,
  p_handles_corrections boolean, p_handles_replays boolean, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = products, executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r products.products_current%ROWTYPE; ep products.event_products%ROWTYPE; s products.event_subscriptions%ROWTYPE; c identity.principals%ROWTYPE; e jsonb; v_from timestamptz; v_to timestamptz; k text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['products.subscription.register']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'subscription rejected (actor): registered by the acting principal' USING ERRCODE = '42501'; END IF;
  IF p_consumer IS DISTINCT FROM p_actor AND NOT executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['data_steward', 'domain_admin', 'platform_admin']) THEN
    RAISE EXCEPTION 'subscription rejected (authority): a subscription is registered by its consumer, or by a data steward for a named consumer' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO c FROM identity.principals x WHERE x.id = p_consumer;
  IF NOT FOUND THEN RAISE EXCEPTION 'subscription rejected (unknown_consumer): % is not a principal', p_consumer USING ERRCODE = '22023'; END IF;
  IF c.tenant_id IS DISTINCT FROM p_tenant OR c.kind <> 'human' OR c.status <> 'active' THEN
    RAISE EXCEPTION 'subscription rejected (authority): the authority boundary (DP-43-002) — a subscription is granted to a named, active human of this tenant; % is not one', p_consumer USING ERRCODE = '42501';
  END IF;
  SELECT * INTO r FROM products.products_current x WHERE x.product_id = p_product_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'subscription rejected (unknown_product): % is not a product of this domain', p_product_id USING ERRCODE = '22023'; END IF;
  IF r.kind <> 'event' THEN RAISE EXCEPTION 'subscription rejected (kind): product % is of kind %; a subscription is on an event product', r.product_key, r.kind USING ERRCODE = '22023'; END IF;
  IF r.state NOT IN ('released', 'degraded') THEN RAISE EXCEPTION 'subscription rejected (state): product % is %; a subscription is registered on a released event product', r.product_key, r.state USING ERRCODE = '22023'; END IF;
  SELECT * INTO ep FROM products.event_products x WHERE x.product_id = p_product_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'subscription rejected (state): product % has no event declaration', r.product_key USING ERRCODE = '22023'; END IF;
  IF p_purpose IS NULL OR length(btrim(p_purpose)) NOT BETWEEN 2 AND 120 THEN RAISE EXCEPTION 'subscription rejected (purpose): a subscription states its purpose' USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(coalesce(r.declaration #> '{policy,purposes}', '[]'::jsonb)) p WHERE p = btrim(p_purpose)) THEN
    RAISE EXCEPTION 'subscription rejected (purpose): purpose % is outside the product''s policy purposes (%)', btrim(p_purpose), (SELECT string_agg(p, ', ') FROM jsonb_array_elements_text(coalesce(r.declaration #> '{policy,purposes}', '[]'::jsonb)) p) USING ERRCODE = '22023';
  END IF;
  -- the DATA scope: fields ⊆ the schema's
  IF p_granted IS NULL OR jsonb_typeof(p_granted) <> 'object' OR jsonb_typeof(p_granted -> 'fields') <> 'array' OR jsonb_array_length(p_granted -> 'fields') = 0 THEN
    RAISE EXCEPTION 'subscription rejected (fields): the grant names the fields it needs (a non-empty subset of the schema''s: %)', array_to_string(ep.schema_fields, ', ') USING ERRCODE = '22023';
  END IF;
  FOR e IN SELECT x FROM jsonb_array_elements(p_granted -> 'fields') x LOOP
    IF jsonb_typeof(e) <> 'string' OR (e #>> '{}') <> ALL (ep.schema_fields) THEN
      RAISE EXCEPTION 'subscription rejected (fields): % is not a field of schema % (%); a subscription grants only declared data', e, ep.schema_version, array_to_string(ep.schema_fields, ', ') USING ERRCODE = '22023';
    END IF;
  END LOOP;
  -- the CONSEQUENCE class and the TIME window
  IF jsonb_typeof(p_granted -> 'consequence') <> 'string' OR (p_granted ->> 'consequence') NOT IN ('C0', 'C1', 'C2', 'C3', 'C4') THEN
    RAISE EXCEPTION 'subscription rejected (consequence): the grant names the consequence class the consumer may act on (C0..C4)' USING ERRCODE = '22023';
  END IF;
  BEGIN
    v_from := CASE WHEN jsonb_typeof(p_granted -> 'from') = 'string' THEN (p_granted ->> 'from')::timestamptz ELSE NULL END;
    v_to := CASE WHEN jsonb_typeof(p_granted -> 'to') = 'string' THEN (p_granted ->> 'to')::timestamptz ELSE NULL END;
  EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'subscription rejected (window): the time window''s from and to are instants or null' USING ERRCODE = '22023'; END;
  IF (p_granted ? 'from' AND jsonb_typeof(p_granted -> 'from') NOT IN ('string', 'null')) OR (p_granted ? 'to' AND jsonb_typeof(p_granted -> 'to') NOT IN ('string', 'null')) OR (v_from IS NOT NULL AND v_to IS NOT NULL AND v_from >= v_to) THEN
    RAISE EXCEPTION 'subscription rejected (window): the time window''s from and to are instants or null, from before to' USING ERRCODE = '22023';
  END IF;
  -- the FILTERS
  IF p_filters IS NOT NULL AND jsonb_typeof(p_filters) <> 'object' THEN RAISE EXCEPTION 'subscription rejected (filters): the filters are an object {event_kinds?, ordering_keys?, subject_ids?, subject_kinds?}' USING ERRCODE = '22023'; END IF;
  FOR k IN SELECT jsonb_object_keys(coalesce(p_filters, '{}'::jsonb)) LOOP
    IF k NOT IN ('event_kinds', 'ordering_keys', 'subject_ids', 'subject_kinds') OR jsonb_typeof(p_filters -> k) <> 'array' THEN
      RAISE EXCEPTION 'subscription rejected (filters): % is not a filter (event_kinds, ordering_keys, subject_ids, subject_kinds — each an array)', k USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements_text(coalesce(p_filters -> 'event_kinds', '[]'::jsonb)) x WHERE x <> ALL (products.event_kinds())) THEN
    RAISE EXCEPTION 'subscription rejected (filters): an event kind filter names change, signal, correction, lifecycle, quality or strategic' USING ERRCODE = '22023';
  END IF;
  -- the SCHEMA version accepted, the LAG policy, the capabilities
  IF p_schema_version IS DISTINCT FROM ep.schema_version THEN
    RAISE EXCEPTION 'subscription rejected (schema): product % serves schema version %; a subscription accepts the current version (% was named)', r.product_key, ep.schema_version, coalesce(p_schema_version, 'null') USING ERRCODE = '22023';
  END IF;
  IF p_lag_policy IS NULL OR jsonb_typeof(p_lag_policy) <> 'object'
     OR jsonb_typeof(p_lag_policy -> 'max_lag_events') <> 'number' OR (p_lag_policy ->> 'max_lag_events') !~ '^[0-9]+$' OR (p_lag_policy ->> 'max_lag_events')::bigint < 1
     OR jsonb_typeof(p_lag_policy -> 'max_lag_seconds') <> 'number' OR (p_lag_policy ->> 'max_lag_seconds') !~ '^[0-9]+$' OR (p_lag_policy ->> 'max_lag_seconds')::bigint < 1 THEN
    RAISE EXCEPTION 'subscription rejected (lag_policy): the lag policy names max_lag_events and max_lag_seconds (whole numbers ≥ 1)' USING ERRCODE = '22023';
  END IF;
  IF p_handles_corrections IS NULL OR p_handles_replays IS NULL THEN RAISE EXCEPTION 'subscription rejected (capability): a subscription declares whether it can process corrections and replays' USING ERRCODE = '22023'; END IF;
  INSERT INTO products.event_subscriptions (subscription_id, product_id, tenant_id, domain_id, consumer_principal_id, consumer_domain_id, purpose, granted, filters, schema_version, lag_policy,
                                            handles_corrections, handles_replays, registered_by, correlation_id)
  VALUES (p_subscription_id, p_product_id, p_tenant, p_domain, p_consumer, coalesce(c.domain_id, p_domain), btrim(p_purpose),
          jsonb_build_object('fields', p_granted -> 'fields', 'consequence', p_granted ->> 'consequence', 'from', v_from, 'to', v_to),
          coalesce(p_filters, '{}'::jsonb), p_schema_version, jsonb_build_object('max_lag_events', (p_lag_policy ->> 'max_lag_events')::bigint, 'max_lag_seconds', (p_lag_policy ->> 'max_lag_seconds')::bigint),
          p_handles_corrections, p_handles_replays, p_actor, p_correlation) RETURNING * INTO s;
  INSERT INTO products.product_events (event_id, scope, tenant_id, domain_id, product_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_product_id, 'subscription.registered', p_actor,
          jsonb_build_object('subscription_id', p_subscription_id, 'consumer', p_consumer, 'purpose', btrim(p_purpose), 'fields', p_granted -> 'fields', 'consequence', p_granted ->> 'consequence', 'schema_version', p_schema_version), p_correlation);
  RETURN products.subscription_json(s);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION products.register_subscription(uuid,uuid,uuid,uuid,uuid,text,jsonb,jsonb,text,jsonb,boolean,boolean,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION products.register_subscription(uuid,uuid,uuid,uuid,uuid,text,jsonb,jsonb,text,jsonb,boolean,boolean,uuid,uuid,uuid) TO eye_commit;

/* AUTHORIZE (products.subscription.authorize): the owner's or a steward's act on a registered subscription; a product whose source carries
   correction events is refused to a consumer that cannot process them (DP-43-006). registered → active. */
CREATE OR REPLACE FUNCTION products.authorize_subscription(p_subscription_id uuid, p_tenant uuid, p_domain uuid, p_actor uuid, p_event_id uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = products, executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE s products.event_subscriptions%ROWTYPE; r products.products_current%ROWTYPE; ep products.event_products%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['products.subscription.authorize']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'subscription rejected (actor): authorized by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO s FROM products.event_subscriptions x WHERE x.subscription_id = p_subscription_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'subscription rejected (unknown_subscription): % is not a subscription of this domain', p_subscription_id USING ERRCODE = '22023'; END IF;
  SELECT * INTO r FROM products.products_current x WHERE x.product_id = s.product_id;
  SELECT * INTO ep FROM products.event_products x WHERE x.product_id = s.product_id;
  IF NOT products.event_owner_or_steward(r.owner_principal_id, p_actor, p_tenant, p_domain) THEN
    RAISE EXCEPTION 'subscription rejected (authority): a subscription is authorized by the product''s owner or by a data steward' USING ERRCODE = '42501';
  END IF;
  IF s.state <> 'registered' THEN RAISE EXCEPTION 'subscription rejected (state): subscription % is %; only a registered subscription is authorized', p_subscription_id, s.state USING ERRCODE = '22023'; END IF;
  IF r.state NOT IN ('released', 'degraded') THEN RAISE EXCEPTION 'subscription rejected (state): product % is %; a subscription is authorized on a released event product', r.product_key, r.state USING ERRCODE = '22023'; END IF;
  IF NOT s.handles_corrections AND products.event_source_emits_corrections(ep.source) THEN
    RAISE EXCEPTION 'subscription rejected (capability): the source ledger % of product % carries correction events; a consumer that cannot process corrections is not authorized (DP-43-006)', ep.source ->> 'ledger', r.product_key USING ERRCODE = '22023';
  END IF;
  UPDATE products.event_subscriptions SET state = 'active', authorized_at = clock_timestamp(), authorized_by = p_actor, updated_at = clock_timestamp() WHERE subscription_id = p_subscription_id RETURNING * INTO s;
  INSERT INTO products.product_events (event_id, scope, tenant_id, domain_id, product_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, s.product_id, 'subscription.authorized', p_actor, jsonb_build_object('subscription_id', p_subscription_id, 'consumer', s.consumer_principal_id), p_correlation);
  RETURN products.subscription_json(s);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION products.authorize_subscription(uuid,uuid,uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION products.authorize_subscription(uuid,uuid,uuid,uuid,uuid,uuid) TO eye_commit;

/* READ (products.subscription.read) — THE CONSUMER's own act: the stream rows after the checkpoint (or after p_after_sequence, never
   before the checkpoint), within the time window and the retention, FILTERED, each payload PROJECTED to the granted fields; a correction
   row is withheld from a consumer that cannot process corrections and COUNTED as omitted; refused on a paused, lagging or revoked
   subscription with the reason (conformance and the owner's resumption are required first). */
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
    RAISE EXCEPTION 'subscription rejected (state): subscription % is % (%); delivery is paused with the checkpoint % preserved — the consumer''s conformance and the owner''s resumption are required before reading', p_subscription_id, s.state, s.paused_reason, s.checkpoint_sequence USING ERRCODE = '22023';
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
  RETURN jsonb_build_object('subscription_id', p_subscription_id, 'product_id', s.product_id, 'product_key', r.product_key, 'after', v_after, 'next_after', v_next, 'head', v_head, 'checkpoint', s.checkpoint_sequence,
                            'served', v_served, 'omitted', jsonb_build_object('corrections', v_omitted, 'reason', CASE WHEN v_omitted > 0 THEN 'this subscription declared it cannot process corrections; the correction rows are withheld and counted' END),
                            'retention_floor', v_floor, 'window', jsonb_build_object('from', v_from, 'to', v_to), 'fields', to_jsonb(v_fields), 'events', v_events);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION products.read_subscription_events(uuid,uuid,uuid,bigint,int,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION products.read_subscription_events(uuid,uuid,uuid,bigint,int,uuid,uuid) TO eye_commit;

/* ACKNOWLEDGE (products.subscription.checkpoint): the consumer's own act; the checkpoint ADVANCES only, never beyond the head; on an
   active or a lagging (catching-up) subscription — catching up never resumes on its own (the owner's word). Append-only ledger row. */
CREATE OR REPLACE FUNCTION products.advance_checkpoint(p_checkpoint_id uuid, p_subscription_id uuid, p_tenant uuid, p_domain uuid, p_sequence bigint, p_actor uuid, p_event_id uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = products, executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE s products.event_subscriptions%ROWTYPE; v_head bigint; v_from bigint;
BEGIN
  PERFORM observation.assert_authority(ARRAY['products.subscription.checkpoint']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'subscription rejected (actor): acknowledged by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO s FROM products.event_subscriptions x WHERE x.subscription_id = p_subscription_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'subscription rejected (unknown_subscription): % is not a subscription of this domain', p_subscription_id USING ERRCODE = '22023'; END IF;
  IF s.consumer_principal_id <> p_actor THEN RAISE EXCEPTION 'subscription rejected (not_consumer): a checkpoint is acknowledged by the subscription''s consumer' USING ERRCODE = '42501'; END IF;
  IF s.state NOT IN ('active', 'lagging') THEN RAISE EXCEPTION 'subscription rejected (state): subscription % is %; a checkpoint moves on an active or a lagging (catching-up) subscription', p_subscription_id, s.state USING ERRCODE = '22023'; END IF;
  IF p_sequence IS NULL OR p_sequence <= s.checkpoint_sequence THEN RAISE EXCEPTION 'subscription rejected (sequence): a checkpoint advances; % is not beyond the checkpoint %', coalesce(p_sequence::text, 'null'), s.checkpoint_sequence USING ERRCODE = '22023'; END IF;
  v_head := coalesce((SELECT max(x.sequence) FROM products.event_stream x WHERE x.product_id = s.product_id), 0);
  IF p_sequence > v_head THEN RAISE EXCEPTION 'subscription rejected (head): sequence % is beyond the stream head %', p_sequence, v_head USING ERRCODE = '22023'; END IF;
  v_from := s.checkpoint_sequence;
  INSERT INTO products.subscription_checkpoints (checkpoint_id, subscription_id, tenant_id, domain_id, kind, from_sequence, to_sequence, acknowledged_by, correlation_id)
  VALUES (p_checkpoint_id, p_subscription_id, p_tenant, p_domain, 'advance', v_from, p_sequence, p_actor, p_correlation);
  UPDATE products.event_subscriptions SET checkpoint_sequence = p_sequence, checkpoint_at = clock_timestamp(), updated_at = clock_timestamp() WHERE subscription_id = p_subscription_id RETURNING * INTO s;
  INSERT INTO products.product_events (event_id, scope, tenant_id, domain_id, product_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, s.product_id, 'checkpoint.advanced', p_actor, jsonb_build_object('subscription_id', p_subscription_id, 'from_sequence', v_from, 'to_sequence', p_sequence, 'head', v_head, 'state', s.state), p_correlation);
  RETURN products.subscription_json(s) || jsonb_build_object('head', v_head, 'lag_events', v_head - p_sequence);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION products.advance_checkpoint(uuid,uuid,uuid,uuid,bigint,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION products.advance_checkpoint(uuid,uuid,uuid,uuid,bigint,uuid,uuid,uuid) TO eye_commit;

/* The owner's NOTICE (private; under the tick's action): an attention item of class subscription.lag, subject the subscription, owned by the
   PRODUCT OWNER (the 0094 §D notify idiom), due in 24 hours; its cause the product_events row that recorded the pause. */
CREATE OR REPLACE FUNCTION products.notify_subscription_owner(p_tenant uuid, p_domain uuid, s products.event_subscriptions, r products.products_current, p_reason text, p_cause_event uuid, p_cause_type text, p_measure jsonb, p_actor uuid, p_correlation uuid) RETURNS uuid
SET search_path = executive, identity, pg_catalog, pg_temp AS $$
DECLARE v_item uuid := gen_random_uuid(); v_state text; v_title text; v_reasons jsonb;
BEGIN
  v_state := CASE WHEN EXISTS (SELECT 1 FROM identity.principals p WHERE p.id = r.owner_principal_id AND p.kind = 'human' AND p.status = 'active') THEN 'open' ELSE 'unrouted' END;
  v_title := left(CASE p_reason WHEN 'lag' THEN format('Subscription lagging beyond policy: %s (consumer %s)', r.title, left(s.consumer_principal_id::text, 8))
                                ELSE format('Subscription paused on a breaking schema: %s (consumer %s)', r.title, left(s.consumer_principal_id::text, 8)) END, 512);
  v_reasons := CASE p_reason
    WHEN 'lag' THEN jsonb_build_array(format('the consumer is %s events behind the head (policy: %s) and %s seconds behind the oldest unacknowledged event (policy: %s)', p_measure ->> 'lag_events', p_measure ->> 'max_lag_events', p_measure ->> 'lag_seconds', p_measure ->> 'max_lag_seconds'),
                                      'delivery is paused with the offset preserved; the consumer declares conformance, then the owner resumes (DP-43-006)')
    ELSE jsonb_build_array(format('the product now serves schema version %s (breaking) and the subscription accepted %s', p_measure ->> 'current_schema', p_measure ->> 'accepted_schema'),
                           'delivery is paused with the offset preserved; the consumer conforms to the new schema, then the owner resumes (DP-43-006)') END;
  INSERT INTO executive.attention_items (item_id, scope, tenant_id, domain_id, signal_class, subject_kind, subject_id, cause_event_id, cause_event_type, title, outcome, state, owner_principal_id, route_roles, evaluation, details, due_at, escalations, correlation_id)
  VALUES (v_item, 'DOMAIN', p_tenant, p_domain, 'subscription.lag', 'subscription', s.subscription_id, p_cause_event, p_cause_type, v_title, 'material', v_state, r.owner_principal_id, '{}',
          jsonb_build_object('outcome', 'material', 'reasons', v_reasons, 'policy_version', NULL, 'dimensions', jsonb_build_object('consequence', s.granted ->> 'consequence', 'confidence', 1)),
          jsonb_build_object('reason', p_reason, 'subscription_id', s.subscription_id, 'product_id', r.product_id, 'product_key', r.product_key, 'consumer', s.consumer_principal_id, 'checkpoint', s.checkpoint_sequence) || p_measure,
          clock_timestamp() + interval '24 hours', 0, p_correlation);
  PERFORM executive.attention_event(v_item, p_tenant, p_domain, CASE v_state WHEN 'open' THEN 'item.routed' ELSE 'item.unrouted' END, p_actor,
            jsonb_build_object('outcome', 'material', 'reasons', v_reasons, 'policy_version', NULL, 'owner', r.owner_principal_id, 'route_roles', '[]'::jsonb, 'due_at', clock_timestamp() + interval '24 hours',
                               'cause_event_id', p_cause_event, 'cause_event_type', p_cause_type, 'unrouted', v_state = 'unrouted', 'subscription_id', s.subscription_id), p_correlation);
  RETURN v_item;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION products.notify_subscription_owner(uuid,uuid,products.event_subscriptions,products.products_current,text,uuid,text,jsonb,uuid,uuid) FROM PUBLIC;

/* EVALUATE THE LAG (executive.attention.tick — the step `subscription-lag`, order 63): for every ACTIVE subscription of a released event
   product — (e) the schema: accepted an older version the current declaration BREAKS → paused (schema), the owner notified once;
   (d) the lag: head − checkpoint (events) and now − the oldest unacknowledged row's occurred instant (seconds) against the policy →
   beyond it: `lagging` (delivery paused, the OFFSET PRESERVED), `subscription.lagging` on product_events, the owner's attention item, and
   the SLO observation lag_events met false on the prelude's ledger; within it: lag_events met true (the scorecard's attainment). Both
   measures observed every tick for every active subscription (lag_events, lag_seconds). */
CREATE OR REPLACE FUNCTION products.evaluate_subscription_lag(p_tenant uuid, p_domain uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = products, executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE s products.event_subscriptions%ROWTYPE; ep products.event_products%ROWTYPE; r products.products_current%ROWTYPE; x record; v_head bigint; v_lag bigint; v_oldest timestamptz; v_secs numeric; v_floor timestamptz;
        v_max_e bigint; v_max_s bigint; v_over boolean; v_ev uuid; v_item uuid; v_measure jsonb; v_out jsonb := '[]'::jsonb; v_evaluated int := 0; v_lagging int := 0; v_schema int := 0; v_healthy int := 0;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.attention.tick']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  FOR x IN SELECT sub.subscription_id FROM products.event_subscriptions sub JOIN products.products_current pc ON pc.product_id = sub.product_id
            WHERE sub.tenant_id = p_tenant AND sub.domain_id = p_domain AND sub.state = 'active' AND pc.state IN ('released', 'degraded') ORDER BY sub.registered_at, sub.subscription_id LOOP
    SELECT * INTO s FROM products.event_subscriptions y WHERE y.subscription_id = x.subscription_id FOR UPDATE;
    SELECT * INTO ep FROM products.event_products y WHERE y.product_id = s.product_id;
    SELECT * INTO r FROM products.products_current y WHERE y.product_id = s.product_id;
    v_evaluated := v_evaluated + 1;
    -- (e) the schema compatibility
    IF s.schema_version <> ep.schema_version AND ep.compatibility = 'breaking' THEN
      v_ev := gen_random_uuid();
      v_measure := jsonb_build_object('current_schema', ep.schema_version, 'accepted_schema', s.schema_version, 'declaration_version', ep.declaration_version);
      UPDATE products.event_subscriptions SET state = 'paused', paused_reason = 'schema', paused_at = clock_timestamp(), pause_note = format('the product now serves schema %s (breaking); the subscription accepted %s', ep.schema_version, s.schema_version), updated_at = clock_timestamp()
       WHERE subscription_id = s.subscription_id RETURNING * INTO s;
      INSERT INTO products.product_events (event_id, scope, tenant_id, domain_id, product_id, event, actor_principal_id, details, correlation_id)
      VALUES (v_ev, 'DOMAIN', p_tenant, p_domain, s.product_id, 'subscription.paused', p_actor, jsonb_build_object('subscription_id', s.subscription_id, 'reason', 'schema', 'checkpoint', s.checkpoint_sequence) || v_measure, p_correlation);
      v_item := products.notify_subscription_owner(p_tenant, p_domain, s, r, 'schema', v_ev, 'subscription.paused', v_measure, p_actor, p_correlation);
      v_schema := v_schema + 1;
      v_out := v_out || jsonb_build_object('subscription_id', s.subscription_id, 'outcome', 'paused_schema', 'item_id', v_item);
      CONTINUE;
    END IF;
    -- (d) the lag against the policy
    v_floor := clock_timestamp() - make_interval(days => ep.retention_days);
    v_head := coalesce((SELECT max(y.sequence) FROM products.event_stream y WHERE y.product_id = s.product_id), 0);
    v_lag := greatest(v_head - s.checkpoint_sequence, 0);
    SELECT min(y.occurred_at) INTO v_oldest FROM products.event_stream y WHERE y.product_id = s.product_id AND y.sequence > s.checkpoint_sequence AND y.occurred_at >= v_floor;
    v_secs := CASE WHEN v_oldest IS NULL THEN 0 ELSE round(extract(epoch FROM clock_timestamp() - v_oldest)::numeric, 3) END;
    v_max_e := (s.lag_policy ->> 'max_lag_events')::bigint; v_max_s := (s.lag_policy ->> 'max_lag_seconds')::bigint;
    v_over := v_lag > v_max_e OR v_secs > v_max_s;
    v_measure := jsonb_build_object('lag_events', v_lag, 'max_lag_events', v_max_e, 'lag_seconds', v_secs, 'max_lag_seconds', v_max_s, 'head', v_head, 'oldest_unacknowledged_at', v_oldest);
    PERFORM products.observe_slo(gen_random_uuid(), s.product_id, p_tenant, p_domain, 'lag_events', v_lag, v_max_e, v_lag <= v_max_e, 'subscription-lag tick',
                                 jsonb_build_object('subscription_id', s.subscription_id, 'consumer', s.consumer_principal_id, 'head', v_head, 'checkpoint', s.checkpoint_sequence), p_actor, p_correlation);
    PERFORM products.observe_slo(gen_random_uuid(), s.product_id, p_tenant, p_domain, 'lag_seconds', v_secs, v_max_s, v_secs <= v_max_s, 'subscription-lag tick',
                                 jsonb_build_object('subscription_id', s.subscription_id, 'consumer', s.consumer_principal_id, 'oldest_unacknowledged_at', v_oldest), p_actor, p_correlation);
    IF v_over THEN
      v_ev := gen_random_uuid();
      UPDATE products.event_subscriptions SET state = 'lagging', paused_reason = 'lag', paused_at = clock_timestamp(), pause_note = format('%s events and %s seconds behind (policy %s / %s)', v_lag, v_secs, v_max_e, v_max_s), updated_at = clock_timestamp()
       WHERE subscription_id = s.subscription_id RETURNING * INTO s;
      INSERT INTO products.product_events (event_id, scope, tenant_id, domain_id, product_id, event, actor_principal_id, details, correlation_id)
      VALUES (v_ev, 'DOMAIN', p_tenant, p_domain, s.product_id, 'subscription.lagging', p_actor, jsonb_build_object('subscription_id', s.subscription_id, 'consumer', s.consumer_principal_id, 'checkpoint', s.checkpoint_sequence) || v_measure, p_correlation);
      v_item := products.notify_subscription_owner(p_tenant, p_domain, s, r, 'lag', v_ev, 'subscription.lagging', v_measure, p_actor, p_correlation);
      v_lagging := v_lagging + 1;
      v_out := v_out || jsonb_build_object('subscription_id', s.subscription_id, 'outcome', 'lagging', 'item_id', v_item, 'lag_events', v_lag, 'lag_seconds', v_secs);
    ELSE
      v_healthy := v_healthy + 1;
      v_out := v_out || jsonb_build_object('subscription_id', s.subscription_id, 'outcome', 'healthy', 'lag_events', v_lag, 'lag_seconds', v_secs);
    END IF;
  END LOOP;
  RETURN jsonb_build_object('evaluated', v_evaluated, 'lagging', v_lagging, 'paused_schema', v_schema, 'healthy', v_healthy, 'subscriptions', v_out);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION products.evaluate_subscription_lag(uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION products.evaluate_subscription_lag(uuid,uuid,uuid,uuid) TO eye_commit;

/* PAUSE (products.subscription.pause): the owner's or a steward's act on an active subscription, with a reason; the offset preserved. */
CREATE OR REPLACE FUNCTION products.pause_subscription(p_subscription_id uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_event_id uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = products, executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE s products.event_subscriptions%ROWTYPE; r products.products_current%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['products.subscription.pause']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'subscription rejected (actor): paused by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO s FROM products.event_subscriptions x WHERE x.subscription_id = p_subscription_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'subscription rejected (unknown_subscription): % is not a subscription of this domain', p_subscription_id USING ERRCODE = '22023'; END IF;
  SELECT * INTO r FROM products.products_current x WHERE x.product_id = s.product_id;
  IF NOT products.event_owner_or_steward(r.owner_principal_id, p_actor, p_tenant, p_domain) THEN RAISE EXCEPTION 'subscription rejected (authority): a subscription is paused by the product''s owner or by a data steward' USING ERRCODE = '42501'; END IF;
  IF s.state <> 'active' THEN RAISE EXCEPTION 'subscription rejected (state): subscription % is %; only an active subscription is paused', p_subscription_id, s.state USING ERRCODE = '22023'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN RAISE EXCEPTION 'subscription rejected (reason): a pause says why (8+ characters)' USING ERRCODE = '22023'; END IF;
  UPDATE products.event_subscriptions SET state = 'paused', paused_reason = 'owner', pause_note = btrim(p_reason), paused_at = clock_timestamp(), updated_at = clock_timestamp() WHERE subscription_id = p_subscription_id RETURNING * INTO s;
  INSERT INTO products.product_events (event_id, scope, tenant_id, domain_id, product_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, s.product_id, 'subscription.paused', p_actor, jsonb_build_object('subscription_id', p_subscription_id, 'reason', 'owner', 'note', btrim(p_reason), 'checkpoint', s.checkpoint_sequence), p_correlation);
  RETURN products.subscription_json(s);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION products.pause_subscription(uuid,uuid,uuid,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION products.pause_subscription(uuid,uuid,uuid,text,uuid,uuid,uuid) TO eye_commit;

/* CONFORM (products.subscription.conform): the CONSUMER's own declaration on a paused or lagging subscription — it caught up and can
   process ({caught_up, can_process, note?, schema_version?, handles_corrections?}); a named schema version must be the product's current
   (the subscription then accepts it); the row keeps the declaration. Resumption stays the owner's word. */
CREATE OR REPLACE FUNCTION products.conform_subscription(p_subscription_id uuid, p_tenant uuid, p_domain uuid, p_declaration jsonb, p_actor uuid, p_event_id uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = products, executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE s products.event_subscriptions%ROWTYPE; ep products.event_products%ROWTYPE; v_schema text; v_hc boolean;
BEGIN
  PERFORM observation.assert_authority(ARRAY['products.subscription.conform']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'subscription rejected (actor): conformance is declared by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO s FROM products.event_subscriptions x WHERE x.subscription_id = p_subscription_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'subscription rejected (unknown_subscription): % is not a subscription of this domain', p_subscription_id USING ERRCODE = '22023'; END IF;
  IF s.consumer_principal_id <> p_actor THEN RAISE EXCEPTION 'subscription rejected (not_consumer): conformance is declared by the subscription''s consumer' USING ERRCODE = '42501'; END IF;
  IF s.state NOT IN ('paused', 'lagging') THEN RAISE EXCEPTION 'subscription rejected (state): subscription % is %; conformance is declared on a paused or lagging subscription', p_subscription_id, s.state USING ERRCODE = '22023'; END IF;
  IF p_declaration IS NULL OR jsonb_typeof(p_declaration) <> 'object' OR jsonb_typeof(p_declaration -> 'caught_up') <> 'boolean' OR jsonb_typeof(p_declaration -> 'can_process') <> 'boolean' THEN
    RAISE EXCEPTION 'subscription rejected (conformance): a conformance declares caught_up and can_process (booleans), optionally a note, the schema_version now accepted and handles_corrections' USING ERRCODE = '22023';
  END IF;
  IF NOT (p_declaration ->> 'caught_up')::boolean OR NOT (p_declaration ->> 'can_process')::boolean THEN
    RAISE EXCEPTION 'subscription rejected (conformance): a consumer that has not caught up or cannot process the stream has not conformed' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO ep FROM products.event_products x WHERE x.product_id = s.product_id;
  v_schema := s.schema_version;
  IF p_declaration ? 'schema_version' THEN
    IF jsonb_typeof(p_declaration -> 'schema_version') <> 'string' OR (p_declaration ->> 'schema_version') <> ep.schema_version THEN
      RAISE EXCEPTION 'subscription rejected (schema): the product serves schema version %; a conformance accepts the current version', ep.schema_version USING ERRCODE = '22023';
    END IF;
    v_schema := ep.schema_version;
  END IF;
  v_hc := s.handles_corrections;
  IF p_declaration ? 'handles_corrections' THEN
    IF jsonb_typeof(p_declaration -> 'handles_corrections') <> 'boolean' THEN RAISE EXCEPTION 'subscription rejected (conformance): handles_corrections is a boolean' USING ERRCODE = '22023'; END IF;
    v_hc := (p_declaration ->> 'handles_corrections')::boolean;
    IF NOT v_hc AND products.event_source_emits_corrections(ep.source) THEN RAISE EXCEPTION 'subscription rejected (capability): the source ledger % carries correction events; a consumer that cannot process corrections has not conformed', ep.source ->> 'ledger' USING ERRCODE = '22023'; END IF;
  END IF;
  UPDATE products.event_subscriptions
     SET conformance = p_declaration || jsonb_build_object('declared_at', clock_timestamp(), 'declared_by', p_actor, 'paused_reason', s.paused_reason, 'checkpoint', s.checkpoint_sequence),
         conformed_at = clock_timestamp(), schema_version = v_schema, handles_corrections = v_hc, updated_at = clock_timestamp()
   WHERE subscription_id = p_subscription_id RETURNING * INTO s;
  INSERT INTO products.product_events (event_id, scope, tenant_id, domain_id, product_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, s.product_id, 'subscription.conformed', p_actor, jsonb_build_object('subscription_id', p_subscription_id, 'paused_reason', s.paused_reason, 'schema_version', v_schema, 'checkpoint', s.checkpoint_sequence, 'declaration', p_declaration), p_correlation);
  RETURN products.subscription_json(s);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION products.conform_subscription(uuid,uuid,uuid,jsonb,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION products.conform_subscription(uuid,uuid,uuid,jsonb,uuid,uuid,uuid) TO eye_commit;

/* RESUME (products.subscription.resume): the owner's or a steward's word on a paused or lagging subscription — refused before the
   consumer's conformance (declared after the pause), while a lag pause still exceeds the policy, or while a schema pause's accepted
   version is still the broken one. The checkpoint is where it was. */
CREATE OR REPLACE FUNCTION products.resume_subscription(p_subscription_id uuid, p_tenant uuid, p_domain uuid, p_actor uuid, p_event_id uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = products, executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE s products.event_subscriptions%ROWTYPE; r products.products_current%ROWTYPE; ep products.event_products%ROWTYPE; v_head bigint; v_reason text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['products.subscription.resume']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'subscription rejected (actor): resumed by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO s FROM products.event_subscriptions x WHERE x.subscription_id = p_subscription_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'subscription rejected (unknown_subscription): % is not a subscription of this domain', p_subscription_id USING ERRCODE = '22023'; END IF;
  SELECT * INTO r FROM products.products_current x WHERE x.product_id = s.product_id;
  SELECT * INTO ep FROM products.event_products x WHERE x.product_id = s.product_id;
  IF NOT products.event_owner_or_steward(r.owner_principal_id, p_actor, p_tenant, p_domain) THEN RAISE EXCEPTION 'subscription rejected (authority): a subscription is resumed by the product''s owner or by a data steward' USING ERRCODE = '42501'; END IF;
  IF s.state NOT IN ('paused', 'lagging') THEN RAISE EXCEPTION 'subscription rejected (state): subscription % is %; only a paused or lagging subscription is resumed', p_subscription_id, s.state USING ERRCODE = '22023'; END IF;
  IF s.conformed_at IS NULL OR s.conformed_at < s.paused_at THEN
    RAISE EXCEPTION 'subscription rejected (state): subscription % is % (%) and its consumer has not declared conformance since the pause; conformance is required before resumption (DP-43-006)', p_subscription_id, s.state, s.paused_reason USING ERRCODE = '22023';
  END IF;
  IF s.paused_reason = 'schema' AND s.schema_version <> ep.schema_version THEN
    RAISE EXCEPTION 'subscription rejected (schema_pending): subscription % still accepts schema % while the product serves % (breaking); the consumer conforms to the current version first', p_subscription_id, s.schema_version, ep.schema_version USING ERRCODE = '22023';
  END IF;
  IF s.paused_reason = 'lag' THEN
    v_head := coalesce((SELECT max(x.sequence) FROM products.event_stream x WHERE x.product_id = s.product_id), 0);
    IF v_head - s.checkpoint_sequence > (s.lag_policy ->> 'max_lag_events')::bigint THEN
      RAISE EXCEPTION 'subscription rejected (lag): subscription % is still % events behind the head (policy %); the consumer catches up before the owner resumes', p_subscription_id, v_head - s.checkpoint_sequence, s.lag_policy ->> 'max_lag_events' USING ERRCODE = '22023';
    END IF;
  END IF;
  v_reason := s.paused_reason;
  UPDATE products.event_subscriptions SET state = 'active', paused_reason = NULL, pause_note = NULL, paused_at = NULL, updated_at = clock_timestamp() WHERE subscription_id = p_subscription_id RETURNING * INTO s;
  INSERT INTO products.product_events (event_id, scope, tenant_id, domain_id, product_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, s.product_id, 'subscription.resumed', p_actor, jsonb_build_object('subscription_id', p_subscription_id, 'cleared_reason', v_reason, 'conformed_at', s.conformed_at, 'checkpoint', s.checkpoint_sequence), p_correlation);
  RETURN products.subscription_json(s);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION products.resume_subscription(uuid,uuid,uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION products.resume_subscription(uuid,uuid,uuid,uuid,uuid,uuid) TO eye_commit;

/* REPLAY (products.subscription.replay): the consumer's own act on an active subscription that can process replays, under the product's
   replay policy — the checkpoint moves BACK to p_from_sequence (the consumer re-reads from there), within retention; recorded with the
   from / to sequences and the reason. */
CREATE OR REPLACE FUNCTION products.replay_subscription(p_replay_id uuid, p_subscription_id uuid, p_tenant uuid, p_domain uuid, p_from_sequence bigint, p_reason text, p_actor uuid, p_event_id uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = products, executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE s products.event_subscriptions%ROWTYPE; ep products.event_products%ROWTYPE; v_floor timestamptz; v_at timestamptz; v_from bigint;
BEGIN
  PERFORM observation.assert_authority(ARRAY['products.subscription.replay']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'subscription rejected (actor): a replay is requested by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO s FROM products.event_subscriptions x WHERE x.subscription_id = p_subscription_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'subscription rejected (unknown_subscription): % is not a subscription of this domain', p_subscription_id USING ERRCODE = '22023'; END IF;
  IF s.consumer_principal_id <> p_actor THEN RAISE EXCEPTION 'subscription rejected (not_consumer): a replay is requested by the subscription''s consumer' USING ERRCODE = '42501'; END IF;
  IF s.state <> 'active' THEN RAISE EXCEPTION 'subscription rejected (state): subscription % is %; a replay is requested on an active subscription', p_subscription_id, s.state USING ERRCODE = '22023'; END IF;
  SELECT * INTO ep FROM products.event_products x WHERE x.product_id = s.product_id;
  IF NOT s.handles_replays THEN RAISE EXCEPTION 'subscription rejected (capability): subscription % declared it cannot process replays', p_subscription_id USING ERRCODE = '22023'; END IF;
  IF NOT coalesce((ep.replay_policy ->> 'allowed')::boolean, false) THEN RAISE EXCEPTION 'subscription rejected (replay_policy): the event product''s replay policy does not allow a replay' USING ERRCODE = '22023'; END IF;
  IF p_from_sequence IS NULL OR p_from_sequence < 0 OR p_from_sequence >= s.checkpoint_sequence THEN
    RAISE EXCEPTION 'subscription rejected (sequence): a replay moves the checkpoint back; % is not before the checkpoint %', coalesce(p_from_sequence::text, 'null'), s.checkpoint_sequence USING ERRCODE = '22023';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN RAISE EXCEPTION 'subscription rejected (reason): a replay says why (8+ characters)' USING ERRCODE = '22023'; END IF;
  v_floor := clock_timestamp() - make_interval(days => ep.retention_days);
  SELECT x.occurred_at INTO v_at FROM products.event_stream x WHERE x.product_id = s.product_id AND x.sequence = p_from_sequence + 1;
  IF v_at IS NULL OR v_at < v_floor THEN RAISE EXCEPTION 'subscription rejected (retention): sequence % is older than the product''s retention of % days (or not in the stream); a replay stays within retention', p_from_sequence + 1, ep.retention_days USING ERRCODE = '22023'; END IF;
  v_from := s.checkpoint_sequence;
  INSERT INTO products.subscription_replays (replay_id, subscription_id, tenant_id, domain_id, from_sequence, to_sequence, reason, requested_by, correlation_id)
  VALUES (p_replay_id, p_subscription_id, p_tenant, p_domain, v_from, p_from_sequence, btrim(p_reason), p_actor, p_correlation);
  INSERT INTO products.subscription_checkpoints (checkpoint_id, subscription_id, tenant_id, domain_id, kind, from_sequence, to_sequence, acknowledged_by, correlation_id)
  VALUES (gen_random_uuid(), p_subscription_id, p_tenant, p_domain, 'replay', v_from, p_from_sequence, p_actor, p_correlation);
  UPDATE products.event_subscriptions SET checkpoint_sequence = p_from_sequence, checkpoint_at = clock_timestamp(), updated_at = clock_timestamp() WHERE subscription_id = p_subscription_id RETURNING * INTO s;
  INSERT INTO products.product_events (event_id, scope, tenant_id, domain_id, product_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, s.product_id, 'events.replayed', p_actor, jsonb_build_object('subscription_id', p_subscription_id, 'replay_id', p_replay_id, 'from_sequence', v_from, 'to_sequence', p_from_sequence, 'reason', btrim(p_reason)), p_correlation);
  RETURN products.subscription_json(s) || jsonb_build_object('replay_id', p_replay_id, 'replayed_from', v_from);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION products.replay_subscription(uuid,uuid,uuid,uuid,bigint,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION products.replay_subscription(uuid,uuid,uuid,uuid,bigint,text,uuid,uuid,uuid) TO eye_commit;

/* REVOKE (products.subscription.revoke): the owner's or a steward's act, with a reason; the offsets preserved on the row; every later
   read refused. Terminal. */
CREATE OR REPLACE FUNCTION products.revoke_subscription(p_subscription_id uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_event_id uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = products, executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE s products.event_subscriptions%ROWTYPE; r products.products_current%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['products.subscription.revoke']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'subscription rejected (actor): revoked by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO s FROM products.event_subscriptions x WHERE x.subscription_id = p_subscription_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'subscription rejected (unknown_subscription): % is not a subscription of this domain', p_subscription_id USING ERRCODE = '22023'; END IF;
  SELECT * INTO r FROM products.products_current x WHERE x.product_id = s.product_id;
  IF NOT products.event_owner_or_steward(r.owner_principal_id, p_actor, p_tenant, p_domain) THEN RAISE EXCEPTION 'subscription rejected (authority): a subscription is revoked by the product''s owner or by a data steward' USING ERRCODE = '42501'; END IF;
  IF s.state = 'revoked' THEN RAISE EXCEPTION 'subscription rejected (state): subscription % was revoked at %', p_subscription_id, s.revoked_at USING ERRCODE = '22023'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN RAISE EXCEPTION 'subscription rejected (reason): a revocation says why (8+ characters)' USING ERRCODE = '22023'; END IF;
  UPDATE products.event_subscriptions SET state = 'revoked', revoked_at = clock_timestamp(), revoked_by = p_actor, revocation_reason = btrim(p_reason), updated_at = clock_timestamp() WHERE subscription_id = p_subscription_id RETURNING * INTO s;
  INSERT INTO products.product_events (event_id, scope, tenant_id, domain_id, product_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, s.product_id, 'subscription.revoked', p_actor, jsonb_build_object('subscription_id', p_subscription_id, 'reason', btrim(p_reason), 'checkpoint_preserved', s.checkpoint_sequence, 'consumer', s.consumer_principal_id), p_correlation);
  RETURN products.subscription_json(s);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION products.revoke_subscription(uuid,uuid,uuid,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION products.revoke_subscription(uuid,uuid,uuid,text,uuid,uuid,uuid) TO eye_commit;

/* THE READS (invoker reads under the caller's RLS): the event product with its stream head, its retention floor and its subscriptions with
   their lag; a subscription with its product, head, lag, checkpoints and replays. NULL outside the caller's scope. */
CREATE OR REPLACE FUNCTION products.event_product_read(p_product_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = products, pg_catalog, pg_temp AS $$
  SELECT products.product_json(r)
         || jsonb_build_object(
              'event', products.event_product_json(ep),
              'emits_corrections', products.event_source_emits_corrections(ep.source),
              'head', coalesce((SELECT max(x.sequence) FROM products.event_stream x WHERE x.product_id = r.product_id), 0),
              'retention_floor', clock_timestamp() - make_interval(days => ep.retention_days),
              'stream', (SELECT jsonb_build_object('rows', count(*), 'within_retention', count(*) FILTER (WHERE x.occurred_at >= clock_timestamp() - make_interval(days => ep.retention_days)),
                                                   'oldest_at', min(x.occurred_at), 'newest_at', max(x.occurred_at),
                                                   'by_kind', (SELECT coalesce(jsonb_object_agg(k.event_kind, k.n), '{}'::jsonb) FROM (SELECT y.event_kind, count(*) n FROM products.event_stream y WHERE y.product_id = r.product_id GROUP BY y.event_kind) k))
                           FROM products.event_stream x WHERE x.product_id = r.product_id),
              'subscriptions', coalesce((SELECT jsonb_agg(products.subscription_json(s) || jsonb_build_object(
                                                   'lag_events', greatest(coalesce((SELECT max(x.sequence) FROM products.event_stream x WHERE x.product_id = r.product_id), 0) - s.checkpoint_sequence, 0),
                                                   'oldest_unacknowledged_at', (SELECT min(x.occurred_at) FROM products.event_stream x WHERE x.product_id = r.product_id AND x.sequence > s.checkpoint_sequence)) ORDER BY s.registered_at)
                                          FROM products.event_subscriptions s WHERE s.product_id = r.product_id), '[]'::jsonb),
              'slo', coalesce((SELECT jsonb_object_agg(m.measure, jsonb_build_object('value', m.value, 'threshold', m.threshold, 'met', m.met, 'observed_at', m.observed_at, 'source', m.source, 'details', m.details))
                                 FROM (SELECT DISTINCT ON (o.measure) o.* FROM products.slo_observations o WHERE o.product_id = r.product_id AND o.measure IN ('lag_events', 'lag_seconds') ORDER BY o.measure, o.observed_at DESC) m), '{}'::jsonb))
    FROM products.products_current r JOIN products.event_products ep ON ep.product_id = r.product_id WHERE r.product_id = p_product_id
$$;
GRANT EXECUTE ON FUNCTION products.event_product_read(uuid) TO eye_app, eye_commit;

CREATE OR REPLACE FUNCTION products.subscription_read(p_subscription_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = products, pg_catalog, pg_temp AS $$
  SELECT products.subscription_json(s)
         || jsonb_build_object(
              'product', jsonb_build_object('product_id', r.product_id, 'product_key', r.product_key, 'title', r.title, 'state', r.state, 'owner_principal_id', r.owner_principal_id,
                                            'schema_version', ep.schema_version, 'compatibility', ep.compatibility, 'retention_days', ep.retention_days, 'subject_kind', ep.subject_kind, 'emits_corrections', products.event_source_emits_corrections(ep.source)),
              'head', coalesce((SELECT max(x.sequence) FROM products.event_stream x WHERE x.product_id = r.product_id), 0),
              'lag_events', greatest(coalesce((SELECT max(x.sequence) FROM products.event_stream x WHERE x.product_id = r.product_id), 0) - s.checkpoint_sequence, 0),
              'oldest_unacknowledged_at', (SELECT min(x.occurred_at) FROM products.event_stream x WHERE x.product_id = r.product_id AND x.sequence > s.checkpoint_sequence),
              'retention_floor', clock_timestamp() - make_interval(days => ep.retention_days),
              'checkpoints', coalesce((SELECT jsonb_agg((to_jsonb(c) - 'tenant_id' - 'domain_id' - 'correlation_id') ORDER BY c.acknowledged_at DESC) FROM (SELECT * FROM products.subscription_checkpoints y WHERE y.subscription_id = s.subscription_id ORDER BY y.acknowledged_at DESC LIMIT 20) c), '[]'::jsonb),
              'replays', coalesce((SELECT jsonb_agg((to_jsonb(y) - 'tenant_id' - 'domain_id' - 'correlation_id') ORDER BY y.requested_at DESC) FROM products.subscription_replays y WHERE y.subscription_id = s.subscription_id), '[]'::jsonb))
    FROM products.event_subscriptions s JOIN products.products_current r ON r.product_id = s.product_id JOIN products.event_products ep ON ep.product_id = s.product_id
   WHERE s.subscription_id = p_subscription_id
$$;
GRANT EXECUTE ON FUNCTION products.subscription_read(uuid) TO eye_app, eye_commit;
-- end section `events`

-- ═════════════════════════════════════════════════════════════════════
-- section `metrics` (§M) — the part-local file 0095_b90_x_metrics.sql, combined here at integration in the apply order every fresh-database run used (§0, §K, §E, §M, §R)
-- ═════════════════════════════════════════════════════════════════════
-- ═════════════════════════════════════════════════════════════════════
-- section `metrics`
-- ═════════════════════════════════════════════════════════════════════
-- 0095 §M — CP-6 B90 part `metrics` (2026-09-30): THE SEMANTIC ANALYTICS LAYER AND CERTIFIED METRICS — F-P7-F-10 (V7 ch44 DP-44-001..006;
-- App A DAT-SV-04; App B DZ-15; App G DPD-12; the Strategic Health Score data model, V0 C-034). Built on the §0 prelude (the schema
-- products, the role data_steward, the registry core, the one SLO ledger, the signature subject kind metric_certification, the attention
-- class metric.certification and subject kind metric) and on nothing declared by another part.
--
-- The contract (ch44): governed metrics, dimensions, measures, grains and temporal views WITHOUT a parallel truth system — a semantic
-- model is a product of kind `metric` whose definition is DECLARATIVE (a named MEASURE from the whitelist below over the platform's own
-- canonical and served data, a unit, an aggregation, a grain, dimensions, filters, an effective time); every declaration is a VERSION with
-- a digest; the OWNER certifies a version with an expiry (≤ 366 days), SIGNED beyond the audit chain (kind metric_certification over the
-- version's digest) and admitted as the canonical MET object in the same write; dashboards and BI tools are ACCESS MODES: the executive
-- view serves certified metrics only (an uncertified, withdrawn or expired model is refused), the analyst view serves them MARKED; every
-- serving is recorded with the grain, the definition version and digest, the SOURCE REVISION (a sha256 over the rows the measure read as
-- of the instant) and observes freshness on the product. The continuity rule: a definition change of a certified model records the DIFF
-- and withdraws the certification; a recalculation at a past instant whose source revision no longer matches the serving's withdraws it
-- (reason reproducibility) and names the serving that diverged; the tick step `metric-certification` (order 65) expires certifications
-- past their expiry and raises an attention item to the owner; the last valid version stays readable on the model (frozen).
--
-- What is declared here, and nothing else:
--   §M.1 the canonical object MET@v1 (objects.schema_registry; the upgrade pin moves 47 → 48) and the write action products.metric.certify
--   §M.2 the MEASURE WHITELIST products.metric_measures() — the named measures, their sources, grains, dimensions and aggregations
--   §M.3 the tables products.semantic_models, products.metric_versions, products.metric_definition_diffs, products.metric_certifications
--        (forward-only: products.metric_certifications_forward), products.metric_servings — RLS in the prelude's products_isolation form
--   §M.4 the measure functions products.measure_measure_observations, products.measure_health_score, products.measure_exposure_eur_at_risk
--   §M.5 the private withdrawal step products.metric_withdraw (called by the ports below, never a port itself) and the ports
--        products.declare_metric [products.metric.declare], products.certify_metric [products.metric.certify],
--        products.withdraw_metric_certification [products.metric.withdraw_certification], products.serve_metric [products.metric.serve],
--        products.recalculate_metric [products.metric.recalculate], products.sweep_metric_certifications [executive.attention.tick]
--   §M.6 the read products.metric_read(p_model_id)
-- The refusal families are `metric rejected (<class>)` and `metric certification rejected (<class>)`. Forward-only; §0 untouched.
-- Every figure a harness seeds is SYNTHETIC.

-- ═════════════════════════════════════════════════════════════════════
-- §M.1 THE CANONICAL MET OBJECT
-- ═════════════════════════════════════════════════════════════════════
INSERT INTO observation.canonical_write_actions (action, object_types, rationale) VALUES
  ('products.metric.certify', ARRAY['MET'], 'Certifying a semantic model''s version admits it as a MET object (the certified metric definition, signed by its owner) and nothing else')
ON CONFLICT (action) DO NOTHING;

INSERT INTO objects.schema_registry (object_type, schema_version, json_schema, compatibility) VALUES
('MET', 'v1', '{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "additionalProperties": false,
  "required": ["model_id","product_id","metric_key","title","owner_principal_id","version","definition","definition_digest","certification","certification_ordinal","state"],
  "properties": {
    "model_id": { "type": "string" },
    "product_id": { "type": "string" },
    "metric_key": { "type": "string" },
    "title": { "type": "string", "minLength": 2 },
    "owner_principal_id": { "type": "string" },
    "version": { "type": "integer", "minimum": 1 },
    "definition": {
      "type": "object",
      "required": ["measure","unit","aggregation","grain","dimensions","filters","effective_from"],
      "properties": {
        "measure": { "type": "string" },
        "unit": { "type": "string" },
        "aggregation": { "enum": ["sum","avg","min","max","last","count"] },
        "grain": { "type": "string" },
        "dimensions": { "type": "array", "items": { "type": "string" } },
        "filters": { "type": "object" },
        "effective_from": { "type": "string" }
      }
    },
    "definition_digest": { "type": "string" },
    "certification": {
      "type": "object",
      "required": ["certification_id","certified_by","expires_at","signature_id"],
      "properties": {
        "certification_id": { "type": "string" },
        "certified_by": { "type": "string" },
        "expires_at": { "type": "string" },
        "signature_id": { "type": "string" }
      }
    },
    "certification_ordinal": { "type": "integer", "minimum": 1 },
    "state": { "enum": ["certified"] }
  }
}'::jsonb, 'additive')
ON CONFLICT (object_type, schema_version) DO NOTHING;

-- ═════════════════════════════════════════════════════════════════════
-- §M.2 THE MEASURE WHITELIST (declarative: a measure is a NAME the platform resolves to its own function — never an expression)
-- ═════════════════════════════════════════════════════════════════════
/* The named measures a semantic model may declare: each computes from ONE source of the platform's own data and reports the SOURCE
   REVISION (a sha256 over the ordered identities, values and instants of the rows it read as of the instant) and the source's newest
   instant (the freshness). A model declares a grain from the measure's list, dimensions from its list, filters on those dimensions and an
   aggregation from its list. `exposure_eur_at_risk` reads the B32 exposure register's ACCEPTED assessments whose impact is in EUR (0089
   §R4: exposure_versions.impact_high / unit) — the register does carry an amount with a unit, so the corridor exposure has two paths: the
   register's own figure, or a Strategy Graph MSR in EUR read through `measure_observations`. */
CREATE OR REPLACE FUNCTION products.metric_measures() RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$ SELECT '{
  "measure_observations": {
    "source": "graph.measure_observations",
    "description": "a Strategy Graph measure (MSR) and its readings (0089 §G2) — the readings observed and recorded at or before the instant",
    "grains": ["measure", "objective", "day", "week", "month"],
    "dimensions": ["measure_id", "objective_id"],
    "aggregations": ["sum", "avg", "min", "max", "last", "count"]
  },
  "health_score": {
    "source": "executive.health_score_snapshots",
    "description": "the Strategic Health Score (0089 §H3, 0094 §S; V0 C-034) — the latest CURRENT snapshot per definition at or before the instant: the aggregate per definition, or the normalised score per component",
    "grains": ["definition", "component"],
    "dimensions": ["definition_id", "dimension_key", "component_key"],
    "aggregations": ["last"]
  },
  "exposure_eur_at_risk": {
    "source": "prediction.exposure_versions",
    "description": "the exposure register (0089 §R4): the ACCEPTED assessment of each open exposure whose impact is in EUR — the impact''s high bound as the amount at risk",
    "grains": ["exposure", "category", "domain"],
    "dimensions": ["exposure_id", "category_key", "polarity"],
    "aggregations": ["sum", "max", "avg", "count"]
  }
}'::jsonb $$;
GRANT EXECUTE ON FUNCTION products.metric_measures() TO eye_app, eye_commit;

-- ═════════════════════════════════════════════════════════════════════
-- §M.3 THE TABLES
-- ═════════════════════════════════════════════════════════════════════
/* A SEMANTIC MODEL: one per product of kind `metric` (the model's id IS the product's id — one object, two views); the current
   definition denormalised for the list and the serve; the certification standing as its state. Never deleted (the registry rule). */
CREATE TABLE products.semantic_models (
  model_id            uuid PRIMARY KEY REFERENCES products.products_current (product_id),
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  metric_key          text NOT NULL,                       -- the product's key (unique per domain by the registry)
  title               text NOT NULL CHECK (length(btrim(title)) BETWEEN 2 AND 200),
  owner_principal_id  uuid NOT NULL,                       -- the product's owner (copied at declaration; the registry never changes it)
  measure             text NOT NULL,                       -- a key of products.metric_measures()
  unit                text NOT NULL CHECK (length(btrim(unit)) BETWEEN 1 AND 32),
  aggregation         text NOT NULL CHECK (aggregation IN ('sum', 'avg', 'min', 'max', 'last', 'count')),
  grain               text NOT NULL,
  dimensions          text[] NOT NULL DEFAULT '{}',
  filters             jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(filters) = 'object'),
  effective_from      timestamptz NOT NULL,
  current_version     int  NOT NULL CHECK (current_version >= 1),
  certified_version   int  CHECK (certified_version IS NULL OR certified_version >= 1),
  last_valid_version  int  CHECK (last_valid_version IS NULL OR last_valid_version >= 1),   -- the last certified version (frozen, readable)
  state               text NOT NULL DEFAULT 'declared' CHECK (state IN ('declared', 'certified', 'withdrawn', 'expired')),
  declared_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id      uuid NOT NULL,
  CONSTRAINT psm_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT psm_key_per_domain UNIQUE (tenant_id, domain_id, metric_key),
  CONSTRAINT psm_certified_bound CHECK ((state = 'certified') = (certified_version IS NOT NULL)),
  CONSTRAINT psm_last_valid CHECK (state = 'declared' OR last_valid_version IS NOT NULL)
);
CREATE INDEX psm_domain ON products.semantic_models (tenant_id, domain_id, state);
CREATE TRIGGER psm_no_delete BEFORE DELETE ON products.semantic_models FOR EACH ROW EXECUTE FUNCTION products.no_delete();
COMMENT ON TABLE products.semantic_models IS 'B90 (0095 §M): a semantic model — a product of kind metric with a declarative definition (a whitelisted measure, unit, aggregation, grain, dimensions, filters, effective time); versioned, certified by its owner, served with grain and source revision (DP-44-001..004).';

CREATE TABLE products.metric_versions (
  model_id        uuid NOT NULL REFERENCES products.semantic_models (model_id),
  version         int  NOT NULL CHECK (version >= 1),
  tenant_id       uuid NOT NULL,
  domain_id       uuid NOT NULL,
  definition      jsonb NOT NULL CHECK (jsonb_typeof(definition) = 'object'),
  digest          text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  effective_from  timestamptz NOT NULL,
  declared_by     uuid NOT NULL,
  declared_at     timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id  uuid NOT NULL,
  PRIMARY KEY (model_id, version)
);
CREATE INDEX pmv_effective ON products.metric_versions (model_id, effective_from DESC, version DESC);
CREATE TRIGGER pmv_append_only BEFORE UPDATE OR DELETE ON products.metric_versions FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE products.metric_versions IS 'B90 (0095 §M): every declared version of a semantic model''s definition with its digest and effective time — append-only; the serve resolves the version effective at the instant.';

CREATE TABLE products.metric_definition_diffs (
  diff_id         uuid PRIMARY KEY,
  model_id        uuid NOT NULL REFERENCES products.semantic_models (model_id),
  tenant_id       uuid NOT NULL,
  domain_id       uuid NOT NULL,
  from_version    int  NOT NULL,
  to_version      int  NOT NULL,
  changed         jsonb NOT NULL CHECK (jsonb_typeof(changed) = 'array'),   -- [{key, from, to}] — the definition keys that differ
  recorded_by     uuid NOT NULL,
  recorded_at     timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id  uuid NOT NULL
);
CREATE INDEX pmd_model ON products.metric_definition_diffs (model_id, recorded_at);
CREATE TRIGGER pmd_append_only BEFORE UPDATE OR DELETE ON products.metric_definition_diffs FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE products.metric_definition_diffs IS 'B90 (0095 §M; DP-44-006): the definition diff recorded when a CERTIFIED model is re-declared — the keys that differ, from and to; the certification is withdrawn in the same write. Append-only.';

CREATE TABLE products.metric_certifications (
  certification_id   uuid PRIMARY KEY,
  model_id           uuid NOT NULL REFERENCES products.semantic_models (model_id),
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  version            int  NOT NULL,
  certified_by       uuid NOT NULL,                        -- the product's owner
  certified_at       timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at         timestamptz NOT NULL,
  signature_id       uuid NOT NULL,                        -- executive.signatures (kind metric_certification) over the version's digest
  met_object_version int  NOT NULL CHECK (met_object_version >= 1),   -- the canonical MET version admitted in the same write
  state              text NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'withdrawn', 'expired')),
  withdrawn_at       timestamptz,
  withdrawn_by       uuid,
  withdrawal_reason  text,
  correlation_id     uuid NOT NULL,
  CONSTRAINT pmc_version FOREIGN KEY (model_id, version) REFERENCES products.metric_versions (model_id, version),
  CONSTRAINT pmc_expiry CHECK (expires_at > certified_at AND expires_at <= certified_at + interval '366 days'),
  CONSTRAINT pmc_withdrawn_bound CHECK ((state = 'active') = (withdrawn_at IS NULL AND withdrawn_by IS NULL AND withdrawal_reason IS NULL))
);
CREATE INDEX pmc_model ON products.metric_certifications (model_id, certified_at DESC);
CREATE INDEX pmc_active_expiry ON products.metric_certifications (tenant_id, domain_id, expires_at) WHERE state = 'active';
/* A certification row moves ONE way: active → withdrawn | expired, the withdrawal triple set once; nothing else of the row changes; never deleted. */
CREATE OR REPLACE FUNCTION products.metric_certifications_forward() RETURNS trigger
SET search_path = products, pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'metric certifications are append-only: DELETE prohibited' USING ERRCODE = '2F002'; END IF;
  IF OLD.state <> 'active' OR NEW.state = 'active' OR NEW.withdrawn_at IS NULL OR NEW.withdrawn_by IS NULL OR NEW.withdrawal_reason IS NULL
     OR (to_jsonb(NEW) - 'state' - 'withdrawn_at' - 'withdrawn_by' - 'withdrawal_reason') <> (to_jsonb(OLD) - 'state' - 'withdrawn_at' - 'withdrawn_by' - 'withdrawal_reason') THEN
    RAISE EXCEPTION 'metric certification % is immutable; it moves once from active to withdrawn or expired', OLD.certification_id USING ERRCODE = '2F002';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER pmc_forward BEFORE UPDATE OR DELETE ON products.metric_certifications FOR EACH ROW EXECUTE FUNCTION products.metric_certifications_forward();
COMMENT ON TABLE products.metric_certifications IS 'B90 (0095 §M; DP-44-005): the owner''s certification of a declared version with an expiry (≤ 366 days), the signature beyond the audit chain and the canonical MET version; forward-only: active → withdrawn (a reason: the owner''s, definition_changed, reproducibility) | expired (the tick).';

CREATE TABLE products.metric_servings (
  serving_id          uuid PRIMARY KEY,
  model_id            uuid NOT NULL REFERENCES products.semantic_models (model_id),
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  version             int  NOT NULL,
  view                text NOT NULL CHECK (view IN ('executive', 'analyst', 'recalculation')),
  grain               text NOT NULL,
  filters             jsonb NOT NULL CHECK (jsonb_typeof(filters) = 'object'),
  as_of               timestamptz NOT NULL,
  certified           boolean NOT NULL,                    -- the model's standing when served (the analyst view marks an uncertified one)
  source_revision     text NOT NULL CHECK (source_revision ~ '^[0-9a-f]{64}$'),
  source_rows         int  NOT NULL,
  value_digest        text NOT NULL CHECK (value_digest ~ '^[0-9a-f]{64}$'),
  result              jsonb NOT NULL CHECK (jsonb_typeof(result) = 'array'),   -- [{grain_key, value}] as served
  served_to           uuid NOT NULL,
  served_at           timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id      uuid NOT NULL
);
CREATE INDEX pms_model ON products.metric_servings (model_id, served_at DESC);
CREATE INDEX pms_as_of ON products.metric_servings (model_id, as_of, served_at DESC);
CREATE TRIGGER pms_append_only BEFORE UPDATE OR DELETE ON products.metric_servings FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE products.metric_servings IS 'B90 (0095 §M; DAT-SV-04): every serving of a metric — the view, the grain, the filters, the instant, the definition version, the SOURCE REVISION and the digest of what was served, to whom; a withdrawal exposes the servings since the certification. Append-only.';

-- RLS and grants (the prelude's products_isolation form; the ports write)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['semantic_models', 'metric_versions', 'metric_definition_diffs', 'metric_certifications', 'metric_servings'] LOOP
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
-- §M.4 THE MEASURES — each from ONE source, as of the instant, with its SOURCE REVISION and newest instant
-- ═════════════════════════════════════════════════════════════════════
/* measure_observations: a Strategy Graph measure's readings (0089 §G2) — observed AND recorded at or before the instant (bitemporal: a
   late-arriving reading never changes a past serving's revision; only a mutation of the rows does). Grain keys: the measure id, the
   objective id, or the UTC day / ISO week / month of the observation. */
CREATE OR REPLACE FUNCTION products.measure_measure_observations(p_tenant uuid, p_domain uuid, p_grain text, p_filters jsonb, p_as_of timestamptz, p_aggregation text)
RETURNS TABLE (grain_key text, value numeric, source_revision text, source_rows int, source_newest_at timestamptz)
LANGUAGE sql STABLE SET search_path = products, graph, public, pg_catalog, pg_temp AS $$
  WITH src AS (
    SELECT o.observation_id, o.measure_id, m.objective_id, o.value, o.observed_at, o.recorded_at
      FROM graph.measure_observations o JOIN graph.measures m ON m.measure_id = o.measure_id
     WHERE o.tenant_id = p_tenant AND o.domain_id = p_domain AND o.observed_at <= p_as_of AND o.recorded_at <= p_as_of
       AND (p_filters ->> 'measure_id' IS NULL OR o.measure_id::text = p_filters ->> 'measure_id')
       AND (p_filters ->> 'objective_id' IS NULL OR m.objective_id::text = p_filters ->> 'objective_id')
  ), rev AS (
    SELECT encode(digest(coalesce(string_agg(observation_id::text || ':' || value::text || ':' || observed_at::text || ':' || recorded_at::text, '|' ORDER BY observed_at, recorded_at, observation_id), ''), 'sha256'), 'hex') AS revision,
           count(*)::int AS n, max(observed_at) AS newest
      FROM src
  ), keyed AS (
    SELECT CASE p_grain WHEN 'measure' THEN measure_id::text WHEN 'objective' THEN objective_id::text
                        WHEN 'day' THEN to_char(observed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD')
                        WHEN 'week' THEN to_char(observed_at AT TIME ZONE 'UTC', 'IYYY-"W"IW')
                        WHEN 'month' THEN to_char(observed_at AT TIME ZONE 'UTC', 'YYYY-MM') END AS k,
           value, observed_at, recorded_at, observation_id
      FROM src
  )
  SELECT k,
         CASE p_aggregation WHEN 'sum' THEN sum(value) WHEN 'avg' THEN avg(value) WHEN 'min' THEN min(value) WHEN 'max' THEN max(value) WHEN 'count' THEN count(*)::numeric
                            ELSE (array_agg(value ORDER BY observed_at DESC, recorded_at DESC, observation_id DESC))[1] END,
         (SELECT revision FROM rev), (SELECT n FROM rev), (SELECT newest FROM rev)
    FROM keyed GROUP BY k ORDER BY k
$$;

/* health_score: the Strategic Health Score — the latest CURRENT snapshot per definition computed at or before the instant (0089 §H3;
   the definition is the model, the components its decomposition). Grain `definition` answers the aggregate (NULL when the snapshot is
   indeterminate — no opaque number); grain `component` answers each component's normalised score (NULL when stale or missing). The
   revision is over the snapshots' result digests. */
CREATE OR REPLACE FUNCTION products.measure_health_score(p_tenant uuid, p_domain uuid, p_grain text, p_filters jsonb, p_as_of timestamptz, p_aggregation text)
RETURNS TABLE (grain_key text, value numeric, source_revision text, source_rows int, source_newest_at timestamptz)
LANGUAGE sql STABLE SET search_path = products, executive, public, pg_catalog, pg_temp AS $$
  WITH snap AS (
    SELECT DISTINCT ON (s.definition_id) s.snapshot_id, s.definition_id, s.aggregate, s.result_digest, s.at, s.computed_at
      FROM executive.health_score_snapshots s
     WHERE s.tenant_id = p_tenant AND s.domain_id = p_domain AND s.kind = 'current' AND s.computed_at <= p_as_of AND s.at <= p_as_of
       AND (p_filters ->> 'definition_id' IS NULL OR s.definition_id::text = p_filters ->> 'definition_id')
     ORDER BY s.definition_id, s.at DESC, s.computed_at DESC
  ), comp AS (
    SELECT c.snapshot_id, c.component_key, c.dimension_key, c.normalised
      FROM executive.health_score_components c JOIN snap ON snap.snapshot_id = c.snapshot_id
     WHERE (p_filters ->> 'dimension_key' IS NULL OR c.dimension_key = p_filters ->> 'dimension_key')
       AND (p_filters ->> 'component_key' IS NULL OR c.component_key = p_filters ->> 'component_key')
  ), rev AS (
    SELECT encode(digest(coalesce(string_agg(snapshot_id::text || ':' || result_digest || ':' || computed_at::text, '|' ORDER BY definition_id), ''), 'sha256'), 'hex') AS revision,
           count(*)::int AS n, max(at) AS newest
      FROM snap
  )
  SELECT k, v, (SELECT revision FROM rev), (SELECT n FROM rev), (SELECT newest FROM rev)
    FROM (SELECT snap.definition_id::text AS k, snap.aggregate AS v FROM snap WHERE p_grain = 'definition'
          UNION ALL
          SELECT comp.component_key AS k, comp.normalised AS v FROM comp WHERE p_grain = 'component') x
   ORDER BY k
$$;

/* exposure_eur_at_risk: the exposure register's ACCEPTED assessments (0089 §R4) of the exposures open at the instant whose impact is
   stated in EUR — the impact's HIGH bound as the amount at risk. Grain keys: the exposure id, the category key, or the domain. */
CREATE OR REPLACE FUNCTION products.measure_exposure_eur_at_risk(p_tenant uuid, p_domain uuid, p_grain text, p_filters jsonb, p_as_of timestamptz, p_aggregation text)
RETURNS TABLE (grain_key text, value numeric, source_revision text, source_rows int, source_newest_at timestamptz)
LANGUAGE sql STABLE SET search_path = products, prediction, public, pg_catalog, pg_temp AS $$
  WITH src AS (
    SELECT x.exposure_id, x.category_key, x.polarity, v.version, v.impact_high, v.digest, x.accepted_at
      FROM prediction.exposure_current x JOIN prediction.exposure_versions v ON v.exposure_id = x.exposure_id AND v.version = x.accepted_version
     WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.accepted_at <= p_as_of AND (x.closed_at IS NULL OR x.closed_at > p_as_of)
       AND upper(btrim(v.unit)) = 'EUR'
       AND (p_filters ->> 'exposure_id' IS NULL OR x.exposure_id::text = p_filters ->> 'exposure_id')
       AND (p_filters ->> 'category_key' IS NULL OR x.category_key = p_filters ->> 'category_key')
       AND (p_filters ->> 'polarity' IS NULL OR x.polarity = p_filters ->> 'polarity')
  ), rev AS (
    SELECT encode(digest(coalesce(string_agg(exposure_id::text || ':' || version::text || ':' || digest || ':' || accepted_at::text, '|' ORDER BY exposure_id), ''), 'sha256'), 'hex') AS revision,
           count(*)::int AS n, max(accepted_at) AS newest
      FROM src
  ), keyed AS (
    SELECT CASE p_grain WHEN 'exposure' THEN exposure_id::text WHEN 'category' THEN category_key ELSE 'domain' END AS k, impact_high AS value FROM src
  )
  SELECT k, CASE p_aggregation WHEN 'sum' THEN sum(value) WHEN 'avg' THEN avg(value) WHEN 'count' THEN count(*)::numeric ELSE max(value) END,
         (SELECT revision FROM rev), (SELECT n FROM rev), (SELECT newest FROM rev)
    FROM keyed GROUP BY k ORDER BY k
$$;
REVOKE ALL ON FUNCTION products.measure_measure_observations(uuid,uuid,text,jsonb,timestamptz,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION products.measure_health_score(uuid,uuid,text,jsonb,timestamptz,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION products.measure_exposure_eur_at_risk(uuid,uuid,text,jsonb,timestamptz,text) FROM PUBLIC;

-- ═════════════════════════════════════════════════════════════════════
-- §M.5 THE PORTS
-- ═════════════════════════════════════════════════════════════════════
/* THE WITHDRAWAL STEP (private — the ports below call it inside their own transaction; it is no port: it asserts nothing itself, the
   caller did): the active certification moves to `withdrawn` or `expired` with the reason, the model's state follows and its last valid
   version is frozen readable; the servings since the certification are LISTED ("expose affected reports and decisions") in the answer and
   in the event's details. */
CREATE OR REPLACE FUNCTION products.metric_withdraw(p_model_id uuid, p_state text, p_reason text, p_detail jsonb, p_actor uuid, p_event_id uuid, p_correlation uuid) RETURNS jsonb
SET search_path = products, pg_catalog, pg_temp AS $$
DECLARE m products.semantic_models%ROWTYPE; c products.metric_certifications%ROWTYPE; v_servings jsonb;
BEGIN
  SELECT * INTO m FROM products.semantic_models x WHERE x.model_id = p_model_id FOR UPDATE;
  SELECT * INTO c FROM products.metric_certifications x WHERE x.model_id = p_model_id AND x.state = 'active' ORDER BY x.certified_at DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('serving_id', s.serving_id, 'view', s.view, 'grain', s.grain, 'as_of', s.as_of, 'served_to', s.served_to, 'served_at', s.served_at, 'value_digest', s.value_digest) ORDER BY s.served_at), '[]'::jsonb)
    INTO v_servings FROM products.metric_servings s WHERE s.model_id = p_model_id AND s.served_at >= c.certified_at AND s.view IN ('executive', 'analyst');
  UPDATE products.metric_certifications SET state = p_state, withdrawn_at = clock_timestamp(), withdrawn_by = p_actor, withdrawal_reason = btrim(p_reason) WHERE certification_id = c.certification_id;
  UPDATE products.semantic_models SET state = p_state, certified_version = NULL, last_valid_version = c.version, updated_at = clock_timestamp() WHERE model_id = p_model_id;
  INSERT INTO products.product_events (event_id, scope, tenant_id, domain_id, product_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', m.tenant_id, m.domain_id, p_model_id, 'metric.certification_withdrawn', p_actor,
          jsonb_build_object('certification_id', c.certification_id, 'version', c.version, 'state', p_state, 'reason', btrim(p_reason), 'detail', coalesce(p_detail, '{}'::jsonb),
                             'last_valid_version', c.version, 'servings_exposed', v_servings), p_correlation);
  RETURN jsonb_build_object('certification_id', c.certification_id, 'version', c.version, 'state', p_state, 'reason', btrim(p_reason), 'event_id', p_event_id, 'servings_exposed', v_servings,
                            'consequence', 'the last valid version ' || c.version || ' is frozen and stays readable; the executive view serves nothing until the owner re-certifies');
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION products.metric_withdraw(uuid,text,text,jsonb,uuid,uuid,uuid) FROM PUBLIC;

/* DECLARE (products.metric.declare): the product's owner or a data steward declares (or re-declares) the model's definition — a measure
   from the whitelist, an aggregation from its list, a grain from its grains, dimensions from its dimensions, filters on the declared
   dimensions, a unit, the effective time — as the next VERSION with its digest. A re-declaration that changes a CERTIFIED model's
   definition records the DIFF and WITHDRAWS the certification (reason definition_changed; the servings since exposed). */
CREATE OR REPLACE FUNCTION products.declare_metric(
  p_model_id uuid, p_tenant uuid, p_domain uuid, p_title text, p_measure text, p_unit text, p_aggregation text, p_grain text, p_dimensions text[], p_filters jsonb, p_effective_from timestamptz,
  p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = products, executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r products.products_current%ROWTYPE; m products.semantic_models%ROWTYPE; pv products.metric_versions%ROWTYPE;
        v_cat jsonb; v_spec jsonb; v_dims text[]; v_def jsonb; v_digest text; v_version int; v_effective timestamptz; k text; v_changed jsonb; v_withdrawal jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['products.metric.declare']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'metric rejected (actor): declared by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO r FROM products.products_current x WHERE x.product_id = p_model_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'metric rejected (unknown_product): % is not a product of this domain', p_model_id USING ERRCODE = '22023'; END IF;
  IF r.owner_principal_id <> p_actor AND NOT executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['data_steward', 'domain_admin', 'platform_admin']) THEN
    RAISE EXCEPTION 'metric rejected (authority): a semantic model is declared by the product''s owner or by a data steward' USING ERRCODE = '42501';
  END IF;
  IF r.kind <> 'metric' THEN RAISE EXCEPTION 'metric rejected (kind): product % is of kind %; a semantic model is a product of kind metric', r.product_key, r.kind USING ERRCODE = '22023'; END IF;
  IF r.state IN ('withdrawn', 'retired') THEN RAISE EXCEPTION 'metric rejected (state): product % is %; a withdrawn or retired product takes no definition', r.product_key, r.state USING ERRCODE = '22023'; END IF;
  IF p_title IS NULL OR length(btrim(p_title)) NOT BETWEEN 2 AND 200 THEN RAISE EXCEPTION 'metric rejected (title): a title is 2–200 characters' USING ERRCODE = '22023'; END IF;
  v_cat := products.metric_measures();
  IF p_measure IS NULL OR NOT (v_cat ? p_measure) THEN
    RAISE EXCEPTION 'metric rejected (measure): % is not a whitelisted measure (one of: %)', coalesce(p_measure, 'null'), (SELECT string_agg(x, ', ' ORDER BY x) FROM jsonb_object_keys(v_cat) x) USING ERRCODE = '22023';
  END IF;
  v_spec := v_cat -> p_measure;
  IF p_aggregation IS NULL OR NOT (v_spec -> 'aggregations' ? p_aggregation) THEN
    RAISE EXCEPTION 'metric rejected (aggregation): measure % aggregates by %; % is not among them', p_measure, (SELECT string_agg(x, ', ') FROM jsonb_array_elements_text(v_spec -> 'aggregations') x), coalesce(p_aggregation, 'null') USING ERRCODE = '22023';
  END IF;
  IF p_grain IS NULL OR NOT (v_spec -> 'grains' ? p_grain) THEN
    RAISE EXCEPTION 'metric rejected (grain): measure % allows the grains %; % is not among them', p_measure, (SELECT string_agg(x, ', ') FROM jsonb_array_elements_text(v_spec -> 'grains') x), coalesce(p_grain, 'null') USING ERRCODE = '22023';
  END IF;
  v_dims := coalesce(p_dimensions, '{}');
  FOREACH k IN ARRAY v_dims LOOP
    IF NOT (v_spec -> 'dimensions' ? k) THEN
      RAISE EXCEPTION 'metric rejected (dimension): measure % carries the dimensions %; % is not among them', p_measure, (SELECT string_agg(x, ', ') FROM jsonb_array_elements_text(v_spec -> 'dimensions') x), k USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF p_filters IS NOT NULL AND jsonb_typeof(p_filters) <> 'object' THEN RAISE EXCEPTION 'metric rejected (filter): filters are an object of dimension → value' USING ERRCODE = '22023'; END IF;
  FOR k IN SELECT x FROM jsonb_object_keys(coalesce(p_filters, '{}'::jsonb)) x LOOP
    IF NOT (k = ANY (v_dims)) THEN RAISE EXCEPTION 'metric rejected (filter): filter % is not on a declared dimension (%)', k, array_to_string(v_dims, ', ') USING ERRCODE = '22023'; END IF;
    IF jsonb_typeof(p_filters -> k) NOT IN ('string', 'number', 'boolean') THEN RAISE EXCEPTION 'metric rejected (filter): filter % is a scalar value', k USING ERRCODE = '22023'; END IF;
  END LOOP;
  IF p_unit IS NULL OR length(btrim(p_unit)) NOT BETWEEN 1 AND 32 THEN RAISE EXCEPTION 'metric rejected (unit): a unit is 1–32 characters' USING ERRCODE = '22023'; END IF;
  v_effective := coalesce(p_effective_from, clock_timestamp());
  SELECT array_agg(x ORDER BY x) INTO v_dims FROM unnest(v_dims) x;
  v_def := jsonb_build_object('measure', p_measure, 'unit', btrim(p_unit), 'aggregation', p_aggregation, 'grain', p_grain, 'dimensions', to_jsonb(coalesce(v_dims, '{}'::text[])),
                              'filters', coalesce(p_filters, '{}'::jsonb), 'effective_from', v_effective);
  v_digest := encode(digest(v_def::text, 'sha256'), 'hex');
  SELECT * INTO m FROM products.semantic_models x WHERE x.model_id = p_model_id FOR UPDATE;
  IF NOT FOUND THEN
    v_version := 1;
    INSERT INTO products.semantic_models (model_id, scope, tenant_id, domain_id, metric_key, title, owner_principal_id, measure, unit, aggregation, grain, dimensions, filters, effective_from, current_version, correlation_id)
    VALUES (p_model_id, 'DOMAIN', p_tenant, p_domain, r.product_key, btrim(p_title), r.owner_principal_id, p_measure, btrim(p_unit), p_aggregation, p_grain, coalesce(v_dims, '{}'::text[]), coalesce(p_filters, '{}'::jsonb), v_effective, 1, p_correlation);
  ELSE
    SELECT * INTO pv FROM products.metric_versions x WHERE x.model_id = p_model_id AND x.version = m.current_version;
    IF pv.digest = v_digest THEN RAISE EXCEPTION 'metric rejected (unchanged): the definition of metric % is unchanged from version %', m.metric_key, m.current_version USING ERRCODE = '22023'; END IF;
    v_version := m.current_version + 1;
    IF m.state = 'certified' THEN
      SELECT * INTO pv FROM products.metric_versions x WHERE x.model_id = p_model_id AND x.version = m.certified_version;
      SELECT coalesce(jsonb_agg(jsonb_build_object('key', x.k, 'from', pv.definition -> x.k, 'to', v_def -> x.k) ORDER BY x.k), '[]'::jsonb) INTO v_changed
        FROM (SELECT DISTINCT kk AS k FROM (SELECT jsonb_object_keys(pv.definition) kk UNION SELECT jsonb_object_keys(v_def) kk) q) x
       WHERE pv.definition -> x.k IS DISTINCT FROM v_def -> x.k;
      INSERT INTO products.metric_definition_diffs (diff_id, model_id, tenant_id, domain_id, from_version, to_version, changed, recorded_by, correlation_id)
      VALUES (gen_random_uuid(), p_model_id, p_tenant, p_domain, m.certified_version, v_version, v_changed, p_actor, p_correlation);
      INSERT INTO products.product_events (event_id, scope, tenant_id, domain_id, product_id, event, actor_principal_id, details, correlation_id)
      VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_model_id, 'metric.definition_changed', p_actor, jsonb_build_object('from_version', m.certified_version, 'to_version', v_version, 'changed', v_changed), p_correlation);
      v_withdrawal := products.metric_withdraw(p_model_id, 'withdrawn', 'definition_changed: the certified definition (version ' || m.certified_version || ') was re-declared as version ' || v_version,
                                               jsonb_build_object('from_version', m.certified_version, 'to_version', v_version, 'changed', v_changed), p_actor, gen_random_uuid(), p_correlation);
    END IF;
    UPDATE products.semantic_models SET title = btrim(p_title), measure = p_measure, unit = btrim(p_unit), aggregation = p_aggregation, grain = p_grain, dimensions = coalesce(v_dims, '{}'::text[]),
           filters = coalesce(p_filters, '{}'::jsonb), effective_from = v_effective, current_version = v_version, updated_at = clock_timestamp()
     WHERE model_id = p_model_id;
  END IF;
  INSERT INTO products.metric_versions (model_id, version, tenant_id, domain_id, definition, digest, effective_from, declared_by, correlation_id)
  VALUES (p_model_id, v_version, p_tenant, p_domain, v_def, v_digest, v_effective, p_actor, p_correlation);
  INSERT INTO products.product_events (event_id, scope, tenant_id, domain_id, product_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_model_id, 'metric.declared', p_actor, jsonb_build_object('version', v_version, 'digest', v_digest, 'measure', p_measure, 'grain', p_grain), p_correlation);
  RETURN products.metric_read(p_model_id) || jsonb_build_object('version', v_version, 'digest', v_digest, 'withdrawal', v_withdrawal, 'changed', v_changed);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION products.declare_metric(uuid,uuid,uuid,text,text,text,text,text,text[],jsonb,timestamptz,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION products.declare_metric(uuid,uuid,uuid,text,text,text,text,text,text[],jsonb,timestamptz,uuid,uuid,uuid) TO eye_commit;

/* CERTIFY (products.metric.certify): the OWNER's act (a steward is refused — authority); the model's CURRENT version; an expiry ≤ 366 days
   ahead; the SIGNATURE (kind metric_certification over the version's digest, by this owner, recorded by the service before the port) and the
   canonical MET object (object_version = this certification's ordinal) both present in this write; a CONFLICT refused: another CERTIFIED
   model of the domain with the same normalised title, or the same (measure, grain, filters), under a DIFFERENT definition digest —
   "reconcile definitions under semantic governance": the owner withdraws one or re-declares. */
CREATE OR REPLACE FUNCTION products.certify_metric(
  p_certification_id uuid, p_model_id uuid, p_tenant uuid, p_domain uuid, p_version int, p_expires_at timestamptz, p_signature_id uuid, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = products, executive, identity, observation, objects, ctx, public, pg_catalog, pg_temp AS $$
DECLARE m products.semantic_models%ROWTYPE; r products.products_current%ROWTYPE; pv products.metric_versions%ROWTYPE; v_ordinal int; v_other record; v_now timestamptz := clock_timestamp();
BEGIN
  PERFORM observation.assert_authority(ARRAY['products.metric.certify']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'metric certification rejected (actor): certified by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO m FROM products.semantic_models x WHERE x.model_id = p_model_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'metric certification rejected (unknown_metric): % is not a semantic model of this domain', p_model_id USING ERRCODE = '22023'; END IF;
  SELECT * INTO r FROM products.products_current x WHERE x.product_id = p_model_id;
  IF r.owner_principal_id <> p_actor THEN RAISE EXCEPTION 'metric certification rejected (authority): metric % is certified by its owner (a steward declares, never certifies)', m.metric_key USING ERRCODE = '42501'; END IF;
  IF r.state IN ('withdrawn', 'retired') THEN RAISE EXCEPTION 'metric certification rejected (state): product % is %', r.product_key, r.state USING ERRCODE = '22023'; END IF;
  IF m.state = 'certified' THEN RAISE EXCEPTION 'metric certification rejected (state): metric % is already certified at version %', m.metric_key, m.certified_version USING ERRCODE = '22023'; END IF;
  IF p_version IS DISTINCT FROM m.current_version THEN RAISE EXCEPTION 'metric certification rejected (state): only the current version % of metric % is certified (asked: %)', m.current_version, m.metric_key, coalesce(p_version::text, 'null') USING ERRCODE = '22023'; END IF;
  SELECT * INTO pv FROM products.metric_versions x WHERE x.model_id = p_model_id AND x.version = p_version;
  IF p_expires_at IS NULL OR p_expires_at <= v_now THEN RAISE EXCEPTION 'metric certification rejected (expiry): a certification expires at a future instant' USING ERRCODE = '22023'; END IF;
  IF p_expires_at > v_now + interval '366 days' THEN RAISE EXCEPTION 'metric certification rejected (expiry): a certification expires within 366 days (asked: %)', p_expires_at USING ERRCODE = '22023'; END IF;
  SELECT o.metric_key, o.title, CASE WHEN lower(btrim(o.title)) = lower(btrim(m.title)) THEN 'the same title' ELSE 'the same measure, grain and filters' END AS how INTO v_other
    FROM products.semantic_models o JOIN products.metric_versions ov ON ov.model_id = o.model_id AND ov.version = o.certified_version
   WHERE o.tenant_id = p_tenant AND o.domain_id = p_domain AND o.model_id <> p_model_id AND o.state = 'certified' AND ov.digest <> pv.digest
     AND (lower(btrim(o.title)) = lower(btrim(m.title)) OR (o.measure = m.measure AND o.grain = m.grain AND o.filters = m.filters))
   LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'metric certification rejected (conflict): metric % conflicts with the certified metric % (%) under a different definition — reconcile definitions under semantic governance: withdraw one or re-declare', m.metric_key, v_other.metric_key, v_other.how USING ERRCODE = '22023';
  END IF;
  SELECT count(*)::int + 1 INTO v_ordinal FROM products.metric_certifications x WHERE x.model_id = p_model_id;
  -- the signature's subject is the model at THIS certification's ordinal (a definition version may be certified again after an expiry), its digest the version's
  IF NOT EXISTS (SELECT 1 FROM executive.signatures s WHERE s.signature_id = p_signature_id AND s.subject_kind = 'metric_certification' AND s.subject_id = p_model_id AND s.subject_version = v_ordinal AND s.signer = p_actor AND s.subject_digest = pv.digest) THEN
    RAISE EXCEPTION 'metric certification rejected (signature): version % of metric % carries no signature by its owner over its digest in this write', p_version, m.metric_key USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM objects.canonical_objects c WHERE c.object_id = p_model_id AND c.object_type = 'MET' AND c.object_version = v_ordinal AND c.tenant_id = p_tenant) THEN
    RAISE EXCEPTION 'metric certification rejected (canonical): certification % of metric % was not admitted as a MET object in this write', v_ordinal, m.metric_key USING ERRCODE = '22023';
  END IF;
  INSERT INTO products.metric_certifications (certification_id, model_id, tenant_id, domain_id, version, certified_by, certified_at, expires_at, signature_id, met_object_version, correlation_id)
  VALUES (p_certification_id, p_model_id, p_tenant, p_domain, p_version, p_actor, v_now, p_expires_at, p_signature_id, v_ordinal, p_correlation);
  UPDATE products.semantic_models SET state = 'certified', certified_version = p_version, last_valid_version = p_version, updated_at = clock_timestamp() WHERE model_id = p_model_id;
  INSERT INTO products.product_events (event_id, scope, tenant_id, domain_id, product_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_model_id, 'metric.certified', p_actor,
          jsonb_build_object('certification_id', p_certification_id, 'version', p_version, 'digest', pv.digest, 'expires_at', p_expires_at, 'signature_id', p_signature_id, 'met_object_version', v_ordinal), p_correlation);
  RETURN products.metric_read(p_model_id) || jsonb_build_object('certification', jsonb_build_object('certification_id', p_certification_id, 'version', p_version, 'certified_by', p_actor, 'certified_at', v_now, 'expires_at', p_expires_at,
                                                                                                    'signature_id', p_signature_id, 'met_object_version', v_ordinal, 'state', 'active'));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION products.certify_metric(uuid,uuid,uuid,uuid,int,timestamptz,uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION products.certify_metric(uuid,uuid,uuid,uuid,int,timestamptz,uuid,uuid,uuid,uuid) TO eye_commit;

/* WITHDRAW (products.metric.withdraw_certification): the owner or a steward withdraws the active certification with a reason; the last
   valid version is frozen readable; the servings since the certification are exposed. */
CREATE OR REPLACE FUNCTION products.withdraw_metric_certification(p_model_id uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_event_id uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = products, executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE m products.semantic_models%ROWTYPE; v_out jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['products.metric.withdraw_certification']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'metric certification rejected (actor): withdrawn by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO m FROM products.semantic_models x WHERE x.model_id = p_model_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'metric certification rejected (unknown_metric): % is not a semantic model of this domain', p_model_id USING ERRCODE = '22023'; END IF;
  IF m.owner_principal_id <> p_actor AND NOT executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['data_steward', 'domain_admin', 'platform_admin']) THEN
    RAISE EXCEPTION 'metric certification rejected (authority): a certification is withdrawn by the product''s owner or by a data steward' USING ERRCODE = '42501';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN RAISE EXCEPTION 'metric certification rejected (reason): a withdrawal says why (8+ characters)' USING ERRCODE = '22023'; END IF;
  IF m.state <> 'certified' THEN RAISE EXCEPTION 'metric certification rejected (state): metric % is %; there is no active certification to withdraw', m.metric_key, m.state USING ERRCODE = '22023'; END IF;
  v_out := products.metric_withdraw(p_model_id, 'withdrawn', p_reason, jsonb_build_object('by', 'owner_or_steward'), p_actor, p_event_id, p_correlation);
  RETURN products.metric_read(p_model_id) || jsonb_build_object('withdrawal', v_out);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION products.withdraw_metric_certification(uuid,uuid,uuid,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION products.withdraw_metric_certification(uuid,uuid,uuid,text,uuid,uuid,uuid) TO eye_commit;

/* SERVE (products.metric.serve; DAT-SV-04): the model by key; the version EFFECTIVE at the instant (the database's when none is given); the
   grain the model's or an override among the measure's grains; the filters the model's plus the caller's on the declared dimensions; the
   measure computed and answered per grain key WITH the grain, the unit, the version and digest, the SOURCE REVISION, the certification
   standing and expiry, the effective time, the instant. The EXECUTIVE view refuses an uncertified, withdrawn or expired model — dashboards
   are access modes; the ANALYST view serves it MARKED. Every serving is recorded; freshness_seconds is observed on the product. */
CREATE OR REPLACE FUNCTION products.serve_metric(
  p_serving_id uuid, p_tenant uuid, p_domain uuid, p_metric_key text, p_grain text, p_filters jsonb, p_as_of timestamptz, p_view text, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = products, executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE m products.semantic_models%ROWTYPE; r products.products_current%ROWTYPE; pv products.metric_versions%ROWTYPE; c products.metric_certifications%ROWTYPE;
        v_spec jsonb; v_grain text; v_filters jsonb; v_as_of timestamptz; v_now timestamptz := clock_timestamp(); v_certified boolean; k text;
        v_rows jsonb; v_revision text; v_n int; v_newest timestamptz; v_digest text; v_fresh numeric; v_threshold numeric; v_standing text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['products.metric.serve']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'metric rejected (actor): served to the acting principal' USING ERRCODE = '42501'; END IF;
  IF p_view IS NULL OR p_view NOT IN ('executive', 'analyst') THEN RAISE EXCEPTION 'metric rejected (view): a metric is served in the executive or the analyst view' USING ERRCODE = '22023'; END IF;
  SELECT * INTO m FROM products.semantic_models x WHERE x.metric_key = p_metric_key AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'metric rejected (unknown_metric): % is not a semantic model of this domain', coalesce(p_metric_key, 'null') USING ERRCODE = '22023'; END IF;
  SELECT * INTO r FROM products.products_current x WHERE x.product_id = m.model_id;
  IF r.state IN ('withdrawn', 'retired') THEN RAISE EXCEPTION 'metric rejected (state): product % is %; nothing is served from it', r.product_key, r.state USING ERRCODE = '22023'; END IF;
  v_as_of := date_trunc('milliseconds', coalesce(p_as_of, v_now));   -- millisecond precision: the instant round-trips through a caller's ISO 8601 string
  IF v_as_of > v_now THEN RAISE EXCEPTION 'metric rejected (as_of): the instant is not in the future (asked %, now %)', v_as_of, v_now USING ERRCODE = '22023'; END IF;
  SELECT * INTO pv FROM products.metric_versions x WHERE x.model_id = m.model_id AND x.effective_from <= v_as_of ORDER BY x.effective_from DESC, x.version DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'metric rejected (effective): no definition of metric % is effective at % (the first is effective from %)', m.metric_key, v_as_of, m.effective_from USING ERRCODE = '22023'; END IF;
  SELECT * INTO c FROM products.metric_certifications x WHERE x.model_id = m.model_id AND x.state = 'active' ORDER BY x.certified_at DESC LIMIT 1;
  v_certified := m.state = 'certified' AND c.certification_id IS NOT NULL AND c.version = pv.version AND c.expires_at > v_now;
  v_standing := CASE WHEN v_certified THEN 'certified' WHEN m.state = 'certified' AND c.version <> pv.version THEN 'certified at another version (' || c.version || '); version ' || pv.version || ' is effective at the instant'
                     WHEN m.state = 'certified' THEN 'certification past its expiry (' || c.expires_at || '), not yet swept' ELSE m.state END;
  IF p_view = 'executive' AND NOT v_certified THEN
    RAISE EXCEPTION 'metric rejected (certification): metric % is % — the executive view serves certified metrics only (dashboards are access modes); the analyst view serves it marked uncertified', m.metric_key, v_standing USING ERRCODE = '22023';
  END IF;
  v_spec := products.metric_measures() -> (pv.definition ->> 'measure');
  v_grain := coalesce(p_grain, pv.definition ->> 'grain');
  IF NOT (v_spec -> 'grains' ? v_grain) THEN
    RAISE EXCEPTION 'metric rejected (grain): measure % allows the grains %; % is not among them', pv.definition ->> 'measure', (SELECT string_agg(x, ', ') FROM jsonb_array_elements_text(v_spec -> 'grains') x), v_grain USING ERRCODE = '22023';
  END IF;
  IF p_filters IS NOT NULL AND jsonb_typeof(p_filters) <> 'object' THEN RAISE EXCEPTION 'metric rejected (filter): filters are an object of dimension → value' USING ERRCODE = '22023'; END IF;
  FOR k IN SELECT x FROM jsonb_object_keys(coalesce(p_filters, '{}'::jsonb)) x LOOP
    IF NOT (pv.definition -> 'dimensions' ? k) THEN RAISE EXCEPTION 'metric rejected (filter): filter % is not a dimension of metric % (%)', k, m.metric_key, (SELECT string_agg(x, ', ') FROM jsonb_array_elements_text(pv.definition -> 'dimensions') x) USING ERRCODE = '22023'; END IF;
    IF jsonb_typeof(p_filters -> k) NOT IN ('string', 'number', 'boolean') THEN RAISE EXCEPTION 'metric rejected (filter): filter % is a scalar value', k USING ERRCODE = '22023'; END IF;
  END LOOP;
  v_filters := (pv.definition -> 'filters') || coalesce(p_filters, '{}'::jsonb);
  CASE pv.definition ->> 'measure'
    WHEN 'measure_observations' THEN
      SELECT coalesce(jsonb_agg(jsonb_build_object('grain_key', x.grain_key, 'value', x.value) ORDER BY x.grain_key), '[]'::jsonb), max(x.source_revision), max(x.source_rows), max(x.source_newest_at)
        INTO v_rows, v_revision, v_n, v_newest FROM products.measure_measure_observations(p_tenant, p_domain, v_grain, v_filters, v_as_of, pv.definition ->> 'aggregation') x;
    WHEN 'health_score' THEN
      SELECT coalesce(jsonb_agg(jsonb_build_object('grain_key', x.grain_key, 'value', x.value) ORDER BY x.grain_key), '[]'::jsonb), max(x.source_revision), max(x.source_rows), max(x.source_newest_at)
        INTO v_rows, v_revision, v_n, v_newest FROM products.measure_health_score(p_tenant, p_domain, v_grain, v_filters, v_as_of, pv.definition ->> 'aggregation') x;
    WHEN 'exposure_eur_at_risk' THEN
      SELECT coalesce(jsonb_agg(jsonb_build_object('grain_key', x.grain_key, 'value', x.value) ORDER BY x.grain_key), '[]'::jsonb), max(x.source_revision), max(x.source_rows), max(x.source_newest_at)
        INTO v_rows, v_revision, v_n, v_newest FROM products.measure_exposure_eur_at_risk(p_tenant, p_domain, v_grain, v_filters, v_as_of, pv.definition ->> 'aggregation') x;
    ELSE RAISE EXCEPTION 'metric rejected (measure): % is not a whitelisted measure', pv.definition ->> 'measure' USING ERRCODE = '22023';
  END CASE;
  -- an empty result set still has a revision (the sha256 of nothing read) and no freshness
  IF v_revision IS NULL THEN v_revision := encode(digest('', 'sha256'), 'hex'); v_n := 0; END IF;
  v_digest := encode(digest(v_rows::text, 'sha256'), 'hex');
  INSERT INTO products.metric_servings (serving_id, model_id, tenant_id, domain_id, version, view, grain, filters, as_of, certified, source_revision, source_rows, value_digest, result, served_to, served_at, correlation_id)
  VALUES (p_serving_id, m.model_id, p_tenant, p_domain, pv.version, p_view, v_grain, v_filters, v_as_of, v_certified, v_revision, v_n, v_digest, v_rows, p_actor, v_now, p_correlation);
  IF v_newest IS NOT NULL THEN
    v_fresh := extract(epoch FROM (v_now - v_newest));
    v_threshold := CASE WHEN jsonb_typeof(r.declaration #> '{slo,freshness_seconds}') = 'number' THEN (r.declaration #>> '{slo,freshness_seconds}')::numeric ELSE NULL END;
    PERFORM products.observe_slo(gen_random_uuid(), m.model_id, p_tenant, p_domain, 'freshness_seconds', v_fresh, v_threshold, v_threshold IS NULL OR v_fresh <= v_threshold, 'metric serve (§M)',
                                 jsonb_build_object('serving_id', p_serving_id, 'view', p_view, 'grain', v_grain, 'as_of', v_as_of, 'source_newest_at', v_newest), p_actor, p_correlation);
  END IF;
  RETURN jsonb_build_object(
    'serving_id', p_serving_id, 'model_id', m.model_id, 'metric_key', m.metric_key, 'title', m.title, 'view', p_view,
    'version', pv.version, 'digest', pv.digest, 'effective_from', pv.effective_from, 'measure', pv.definition ->> 'measure', 'unit', pv.definition ->> 'unit', 'aggregation', pv.definition ->> 'aggregation',
    'grain', v_grain, 'filters', v_filters, 'as_of', v_as_of, 'served_at', v_now,
    'certified', v_certified, 'certification_standing', v_standing,
    'certification', CASE WHEN c.certification_id IS NULL THEN NULL ELSE jsonb_build_object('certification_id', c.certification_id, 'version', c.version, 'certified_by', c.certified_by, 'certified_at', c.certified_at, 'expires_at', c.expires_at, 'signature_id', c.signature_id, 'state', c.state) END,
    'last_valid_version', m.last_valid_version,
    'source', v_spec ->> 'source', 'source_revision', v_revision, 'source_rows', v_n, 'source_newest_at', v_newest, 'freshness_seconds', v_fresh,
    'values', v_rows, 'value_digest', v_digest,
    'note', CASE WHEN v_certified THEN 'certified — served as the executive view would' ELSE 'UNCERTIFIED (' || v_standing || ') — served in the analyst view only; not a basis for an executive report' END);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION products.serve_metric(uuid,uuid,uuid,text,text,jsonb,timestamptz,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION products.serve_metric(uuid,uuid,uuid,text,text,jsonb,timestamptz,text,uuid,uuid) TO eye_commit;

/* RECALCULATE (products.metric.recalculate; DP-44-006): the owner or a steward re-serves the model at a PAST instant with the definition
   effective THEN, using the grain and filters of the last executive or analyst serving at that instant, and compares the SOURCE REVISION
   with the one that serving recorded. A mismatch means the source rows changed without a correction record: the certification is
   WITHDRAWN (reason reproducibility) and the serving that diverged is named; `reproducible` is observed on the product either way. */
CREATE OR REPLACE FUNCTION products.recalculate_metric(p_model_id uuid, p_tenant uuid, p_domain uuid, p_as_of timestamptz, p_actor uuid, p_event_id uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = products, executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE m products.semantic_models%ROWTYPE; pv products.metric_versions%ROWTYPE; s products.metric_servings%ROWTYPE; v_now timestamptz := clock_timestamp();
        v_rows jsonb; v_revision text; v_n int; v_newest timestamptz; v_reproduced boolean; v_withdrawal jsonb; v_serving uuid := gen_random_uuid();
BEGIN
  PERFORM observation.assert_authority(ARRAY['products.metric.recalculate']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'metric rejected (actor): recalculated by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO m FROM products.semantic_models x WHERE x.model_id = p_model_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'metric rejected (unknown_metric): % is not a semantic model of this domain', p_model_id USING ERRCODE = '22023'; END IF;
  IF m.owner_principal_id <> p_actor AND NOT executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['data_steward', 'domain_admin', 'platform_admin']) THEN
    RAISE EXCEPTION 'metric rejected (authority): a recalculation is the product''s owner''s or a data steward''s act' USING ERRCODE = '42501';
  END IF;
  IF p_as_of IS NULL OR p_as_of > v_now THEN RAISE EXCEPTION 'metric rejected (as_of): a recalculation names a past instant' USING ERRCODE = '22023'; END IF;
  p_as_of := date_trunc('milliseconds', p_as_of);
  SELECT * INTO pv FROM products.metric_versions x WHERE x.model_id = p_model_id AND x.effective_from <= p_as_of ORDER BY x.effective_from DESC, x.version DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'metric rejected (effective): no definition of metric % is effective at %', m.metric_key, p_as_of USING ERRCODE = '22023'; END IF;
  SELECT * INTO s FROM products.metric_servings x WHERE x.model_id = p_model_id AND x.as_of = p_as_of AND x.view IN ('executive', 'analyst') ORDER BY x.served_at DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'metric rejected (unknown_serving): metric % was never served at %; a recalculation compares with a recorded serving', m.metric_key, p_as_of USING ERRCODE = '22023'; END IF;
  CASE pv.definition ->> 'measure'
    WHEN 'measure_observations' THEN
      SELECT coalesce(jsonb_agg(jsonb_build_object('grain_key', x.grain_key, 'value', x.value) ORDER BY x.grain_key), '[]'::jsonb), max(x.source_revision), max(x.source_rows), max(x.source_newest_at)
        INTO v_rows, v_revision, v_n, v_newest FROM products.measure_measure_observations(p_tenant, p_domain, s.grain, s.filters, p_as_of, pv.definition ->> 'aggregation') x;
    WHEN 'health_score' THEN
      SELECT coalesce(jsonb_agg(jsonb_build_object('grain_key', x.grain_key, 'value', x.value) ORDER BY x.grain_key), '[]'::jsonb), max(x.source_revision), max(x.source_rows), max(x.source_newest_at)
        INTO v_rows, v_revision, v_n, v_newest FROM products.measure_health_score(p_tenant, p_domain, s.grain, s.filters, p_as_of, pv.definition ->> 'aggregation') x;
    WHEN 'exposure_eur_at_risk' THEN
      SELECT coalesce(jsonb_agg(jsonb_build_object('grain_key', x.grain_key, 'value', x.value) ORDER BY x.grain_key), '[]'::jsonb), max(x.source_revision), max(x.source_rows), max(x.source_newest_at)
        INTO v_rows, v_revision, v_n, v_newest FROM products.measure_exposure_eur_at_risk(p_tenant, p_domain, s.grain, s.filters, p_as_of, pv.definition ->> 'aggregation') x;
    ELSE RAISE EXCEPTION 'metric rejected (measure): % is not a whitelisted measure', pv.definition ->> 'measure' USING ERRCODE = '22023';
  END CASE;
  IF v_revision IS NULL THEN v_revision := encode(digest('', 'sha256'), 'hex'); v_n := 0; END IF;
  v_reproduced := v_revision = s.source_revision;   -- the SOURCE revision decides; the versions are reported beside it
  INSERT INTO products.metric_servings (serving_id, model_id, tenant_id, domain_id, version, view, grain, filters, as_of, certified, source_revision, source_rows, value_digest, result, served_to, served_at, correlation_id)
  VALUES (v_serving, p_model_id, p_tenant, p_domain, pv.version, 'recalculation', s.grain, s.filters, p_as_of, m.state = 'certified', v_revision, v_n, encode(digest(v_rows::text, 'sha256'), 'hex'), v_rows, p_actor, v_now, p_correlation);
  -- the `reproducible` observation on the product (the one SLO ledger; §0's observe_slo does not list this action, so the row is written here under it)
  INSERT INTO products.slo_observations (observation_id, product_id, tenant_id, domain_id, measure, value, threshold, met, source, details, observed_by, correlation_id)
  VALUES (gen_random_uuid(), p_model_id, p_tenant, p_domain, 'reproducible', CASE WHEN v_reproduced THEN 1 ELSE 0 END, 1, v_reproduced, 'metric recalculation (§M)',
          jsonb_build_object('as_of', p_as_of, 'serving_id', s.serving_id, 'recalculation_id', v_serving, 'expected_revision', s.source_revision, 'observed_revision', v_revision), p_actor, p_correlation);
  IF NOT v_reproduced AND m.state = 'certified' THEN
    v_withdrawal := products.metric_withdraw(p_model_id, 'withdrawn', 'reproducibility: the source revision at ' || p_as_of || ' no longer matches serving ' || s.serving_id || ' (expected ' || left(s.source_revision, 16) || '…, observed ' || left(v_revision, 16) || '…)',
                                             jsonb_build_object('as_of', p_as_of, 'diverged_serving_id', s.serving_id, 'expected_revision', s.source_revision, 'observed_revision', v_revision, 'serving_version', s.version, 'effective_version', pv.version),
                                             p_actor, gen_random_uuid(), p_correlation);
  END IF;
  INSERT INTO products.product_events (event_id, scope, tenant_id, domain_id, product_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_model_id, 'metric.recalculated', p_actor,
          jsonb_build_object('as_of', p_as_of, 'version', pv.version, 'reproduced', v_reproduced, 'serving_id', s.serving_id, 'recalculation_id', v_serving, 'expected_revision', s.source_revision, 'observed_revision', v_revision), p_correlation);
  RETURN jsonb_build_object('model_id', p_model_id, 'metric_key', m.metric_key, 'as_of', p_as_of, 'version', pv.version, 'digest', pv.digest, 'reproduced', v_reproduced,
                            'serving_id', s.serving_id, 'serving_version', s.version, 'served_at', s.served_at, 'expected_revision', s.source_revision, 'observed_revision', v_revision,
                            'expected_value_digest', s.value_digest, 'observed_value_digest', encode(digest(v_rows::text, 'sha256'), 'hex'), 'values', v_rows, 'recalculation_id', v_serving,
                            'diverged_serving', CASE WHEN v_reproduced THEN NULL ELSE jsonb_build_object('serving_id', s.serving_id, 'view', s.view, 'served_to', s.served_to, 'served_at', s.served_at) END,
                            'withdrawal', v_withdrawal, 'state', (SELECT x.state FROM products.semantic_models x WHERE x.model_id = p_model_id));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION products.recalculate_metric(uuid,uuid,uuid,timestamptz,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION products.recalculate_metric(uuid,uuid,uuid,timestamptz,uuid,uuid,uuid) TO eye_commit;

/* THE SWEEP (executive.attention.tick; the step `metric-certification`, order 65): every active certification past its expiry moves to
   `expired`, the model to `expired` (its last valid version frozen), and an attention item of class metric.certification (subject kind
   metric) is raised to the product's owner — the 0094 §D idiom. Idempotent: an expired certification is not swept twice. */
CREATE OR REPLACE FUNCTION products.sweep_metric_certifications(p_tenant uuid, p_domain uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = products, executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE c record; v_w jsonb; v_item uuid; v_out jsonb := '[]'::jsonb; v_n int := 0; v_ttl text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.attention.tick']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  FOR c IN SELECT x.certification_id, x.model_id, x.version, x.expires_at, m.metric_key, m.title, m.owner_principal_id
             FROM products.metric_certifications x JOIN products.semantic_models m ON m.model_id = x.model_id
            WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.state = 'active' AND x.expires_at <= clock_timestamp()
            ORDER BY x.expires_at LOOP
    v_w := products.metric_withdraw(c.model_id, 'expired', 'expired: the certification of version ' || c.version || ' passed its expiry ' || c.expires_at, jsonb_build_object('expires_at', c.expires_at), p_actor, gen_random_uuid(), p_correlation);
    v_item := gen_random_uuid();
    v_ttl := left('Metric certification expired: ' || c.title || ' (' || c.metric_key || ')', 512);
    INSERT INTO executive.attention_items (item_id, scope, tenant_id, domain_id, signal_class, subject_kind, subject_id, cause_event_id, cause_event_type, title, outcome, state, owner_principal_id, route_roles, evaluation, details, due_at, escalations, correlation_id)
    VALUES (v_item, 'DOMAIN', p_tenant, p_domain, 'metric.certification', 'metric', c.model_id, (v_w ->> 'event_id')::uuid, 'metric.certification_withdrawn', v_ttl, 'material', 'open',
            c.owner_principal_id, '{}', jsonb_build_object('outcome', 'material', 'reasons', jsonb_build_array('the certification of a metric expired (B90 §M d): the executive view serves it no longer; the owner re-certifies or withdraws the model'), 'policy_version', NULL),
            jsonb_build_object('model_id', c.model_id, 'metric_key', c.metric_key, 'version', c.version, 'expires_at', c.expires_at, 'certification_id', c.certification_id, 'servings_exposed', v_w -> 'servings_exposed'),
            clock_timestamp() + interval '7 days', 0, p_correlation);
    PERFORM executive.attention_event(v_item, p_tenant, p_domain, 'item.routed', p_actor, jsonb_build_object('outcome', 'material', 'reasons', jsonb_build_array('metric certification expired'), 'policy_version', NULL, 'owner', c.owner_principal_id, 'route_roles', '[]'::jsonb,
                                      'due_at', clock_timestamp() + interval '7 days', 'cause_event_id', (v_w ->> 'event_id')::uuid, 'cause_event_type', 'metric.certification_withdrawn', 'unrouted', false), p_correlation);
    v_n := v_n + 1;
    v_out := v_out || jsonb_build_object('model_id', c.model_id, 'metric_key', c.metric_key, 'version', c.version, 'expires_at', c.expires_at, 'item_id', v_item, 'owner', c.owner_principal_id);
  END LOOP;
  RETURN jsonb_build_object('expired', v_n, 'items', v_out, 'at', clock_timestamp());
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION products.sweep_metric_certifications(uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION products.sweep_metric_certifications(uuid,uuid,uuid,uuid) TO eye_commit;

-- ═════════════════════════════════════════════════════════════════════
-- §M.6 THE READ (an invoker read under the caller's RLS)
-- ═════════════════════════════════════════════════════════════════════
/* The model, the product's standing, its versions, its certifications (each with its signatures), the diffs, the last twenty servings and
   the measure's catalogue entry; NULL outside the caller's scope. */
CREATE OR REPLACE FUNCTION products.metric_read(p_model_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = products, executive, public, pg_catalog, pg_temp AS $$
  SELECT (to_jsonb(m) - 'scope' - 'correlation_id')
         || jsonb_build_object(
              'product_key', p.product_key, 'product_state', p.state, 'product_kind', p.kind, 'released_version', p.released_version,
              'measure_spec', products.metric_measures() -> m.measure,
              'versions', coalesce((SELECT jsonb_agg(jsonb_build_object('version', v.version, 'digest', v.digest, 'definition', v.definition, 'effective_from', v.effective_from, 'declared_by', v.declared_by, 'declared_at', v.declared_at) ORDER BY v.version)
                                      FROM products.metric_versions v WHERE v.model_id = m.model_id), '[]'::jsonb),
              'certifications', coalesce((SELECT jsonb_agg((to_jsonb(c) - 'tenant_id' - 'domain_id' - 'correlation_id') || jsonb_build_object('signatures', executive.signature_of('metric_certification', c.model_id, c.met_object_version)) ORDER BY c.certified_at)
                                            FROM products.metric_certifications c WHERE c.model_id = m.model_id), '[]'::jsonb),
              'active_certification', (SELECT to_jsonb(c) - 'tenant_id' - 'domain_id' - 'correlation_id' FROM products.metric_certifications c WHERE c.model_id = m.model_id AND c.state = 'active' ORDER BY c.certified_at DESC LIMIT 1),
              'diffs', coalesce((SELECT jsonb_agg((to_jsonb(d) - 'tenant_id' - 'domain_id' - 'correlation_id') ORDER BY d.recorded_at) FROM products.metric_definition_diffs d WHERE d.model_id = m.model_id), '[]'::jsonb),
              'servings', coalesce((SELECT jsonb_agg(x ORDER BY (x ->> 'served_at') DESC) FROM (SELECT (to_jsonb(s) - 'tenant_id' - 'domain_id' - 'correlation_id' - 'result') AS x
                                                                                                    FROM products.metric_servings s WHERE s.model_id = m.model_id ORDER BY s.served_at DESC LIMIT 20) q), '[]'::jsonb),
              'events', coalesce((SELECT jsonb_agg(jsonb_build_object('event', e.event, 'occurred_at', e.occurred_at, 'actor', e.actor_principal_id, 'details', e.details) ORDER BY e.occurred_at)
                                    FROM products.product_events e WHERE e.product_id = m.model_id AND e.event LIKE 'metric.%'), '[]'::jsonb))
    FROM products.semantic_models m JOIN products.products_current p ON p.product_id = m.model_id
   WHERE m.model_id = p_model_id
$$;
GRANT EXECUTE ON FUNCTION products.metric_read(uuid) TO eye_app, eye_commit;

-- ═════════════════════════════════════════════════════════════════════
-- section `products` (§R) — the part-local file 0095_b90_x_products.sql, combined here at integration in the apply order every fresh-database run used (§0, §K, §E, §M, §R)
-- ═════════════════════════════════════════════════════════════════════
-- ═════════════════════════════════════════════════════════════════════
-- section `products`
-- ═════════════════════════════════════════════════════════════════════
-- 0095 §R — CP-6 B90 part `products` (2026-09-30): THE DATA PRODUCT REGISTRY COMPLETED (F-P7-F-09's product half; V7 ch5 DP-05-001/-002/
-- -005/-006, ch41 DP-41-001/-002/-003/-005/-006; App A DAT-SV-01, DAT-SV-10; App B DZ-06, DZ-16; App G DPD-01..11; App O DADR-016).
-- Built on §0 (the prelude): its registry, versions, reviews, the ONE SLO ledger and the event ledger are USED here, never re-declared.
--   §R.1  the canonical write actions of the lifecycle: products.product.withdraw and products.product.retire admit the DPR's withdrawn and
--         archived versions (the SAME object at the next object_version — 0078's lifecycle idiom, as 0094 §D's publication does)
--   §R.2  the tables: product_consumers (who consumes a product, under which contract version, for which purpose, with what impact —
--         DAT-SV-10, DP-41-002 "consumers"; the state registered → accepted → revoked | migrated), contract_tests (a consumer's test of a
--         contract version with its outcome and evidence — DP-41-006; append-only), scorecards (SLO attainment, reviews, consumer
--         acceptance, contract tests, lineage and policy closure, cost — computed on a schedule, never on read; append-only),
--         cost_attributions (a period's cost with its basis — DP-41-006; a period once; append-only)
--   §R.3  the release guard products.assert_release_consumers (DP-41-006: a BREAKING version is not released over an accepted consumer that
--         has no passing contract test on it — the release SERVICE calls it before admitting the DPR)
--   §R.4  the ports: register_consumer / accept_consumer_contract (THE CONSUMER's own act — DP-05-006 "consumer acceptance") /
--         revoke_consumer / migrate_consumer / record_contract_test (writes the test AND observes contract_test_pass into §0's ledger) /
--         attribute_cost / compute_scorecard (the owner's, the steward's, or the tick's) / degrade_product (the owner, the steward, or the
--         tick — every ACCEPTED consumer gets an attention item of class product.degradation) / restore_product (through a scorecard that
--         reads ok or a domain review newer than the degradation) / withdraw_product (the released version STAYS the last valid version;
--         the consumers notified the same way) / retire_product (no accepted consumer remains; an accepted retirement review; the DPR's
--         archived version admitted); the read products.product_scorecard (the latest scorecard with everything the page shows)
-- Refusal families (mapped in observation-errors.ts `/* B90 products */`): `data product consumer rejected (<class>)`, `contract test
-- rejected (<class>)`, `product scorecard rejected (<class>)`, `product cost rejected (<class>)`; the lifecycle ports use the prelude's
-- `data product rejected (<class>)`. Every figure a harness seeds is SYNTHETIC. Forward-only; §0 untouched.

-- ═════════════════════════════════════════════════════════════════════
-- §R.1 THE LIFECYCLE'S CANONICAL WRITE ACTIONS
-- ═════════════════════════════════════════════════════════════════════
INSERT INTO observation.canonical_write_actions (action, object_types, rationale) VALUES
  ('products.product.withdraw', ARRAY['DPR'], 'Withdrawing a released data product admits the DPR''s WITHDRAWN version (the same object at the next object_version, the reason in the header) and nothing else'),
  ('products.product.retire', ARRAY['DPR'], 'Retiring a data product admits the DPR''s ARCHIVED version (the retirement evidence: the reviews, the consumers released, the last valid version) and nothing else')
ON CONFLICT (action) DO NOTHING;

-- ═════════════════════════════════════════════════════════════════════
-- §R.2 THE TABLES
-- ═════════════════════════════════════════════════════════════════════
CREATE TABLE products.product_consumers (
  consumer_id            uuid PRIMARY KEY,
  scope                  text NOT NULL,
  tenant_id              uuid NOT NULL,
  domain_id              uuid NOT NULL,
  product_id             uuid NOT NULL REFERENCES products.products_current (product_id),
  consumer_principal_id  uuid NOT NULL,                     -- a human or an agent of the tenant (active)
  consumer_domain_id     uuid,                              -- the domain the consumer serves (NULL: the product's own)
  purpose                text NOT NULL CHECK (length(btrim(purpose)) >= 8),
  impact                 text,                              -- what breaks downstream when this product breaks (the notification's substance)
  contract_version       int  NOT NULL CHECK (contract_version >= 1),
  state                  text NOT NULL DEFAULT 'registered' CHECK (state IN ('registered', 'accepted', 'revoked', 'migrated')),
  usage                  jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(usage) = 'object'),
  registered_by          uuid NOT NULL,
  registered_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  accepted_at            timestamptz,
  accepted_by            uuid,
  revoked_at             timestamptz,
  revoked_by             uuid,
  revocation_reason      text,
  migrated_from          uuid REFERENCES products.product_consumers (consumer_id),   -- the row this one continues (a migration)
  migrated_to            uuid REFERENCES products.product_consumers (consumer_id) DEFERRABLE INITIALLY DEFERRED,   -- the row that continues this one (written before it exists: the old row closes first, so the live-once index admits the new one)
  migrated_at            timestamptz,
  updated_at             timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id         uuid NOT NULL,
  CONSTRAINT prc_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT prc_accepted_bound CHECK ((state = 'registered') = (accepted_at IS NULL) OR state = 'registered'),
  CONSTRAINT prc_accept_pair CHECK ((accepted_at IS NULL) = (accepted_by IS NULL)),
  CONSTRAINT prc_revoked_bound CHECK ((state = 'revoked') = (revoked_at IS NOT NULL AND revoked_by IS NOT NULL AND revocation_reason IS NOT NULL)),
  CONSTRAINT prc_migrated_bound CHECK ((state = 'migrated') = (migrated_to IS NOT NULL AND migrated_at IS NOT NULL))
);
CREATE INDEX prc_product ON products.product_consumers (product_id, state, registered_at);
CREATE INDEX prc_consumer ON products.product_consumers (consumer_principal_id, state);
/* One LIVE registration per consumer per product (a revoked or migrated one may be followed by another). */
CREATE UNIQUE INDEX prc_live_once ON products.product_consumers (product_id, consumer_principal_id) WHERE state IN ('registered', 'accepted');
CREATE TRIGGER prc_no_delete BEFORE DELETE ON products.product_consumers FOR EACH ROW EXECUTE FUNCTION products.no_delete();
COMMENT ON TABLE products.product_consumers IS 'B90 (0095 §R): the consumer registry (DAT-SV-10; DP-41-002) — who consumes a product, under which contract version, for which purpose, with what downstream impact; registered → ACCEPTED (the consumer''s own act, DP-05-006) → revoked | migrated (a new row continues it on the newer version). Never deleted.';

CREATE TABLE products.contract_tests (
  test_id         uuid PRIMARY KEY,
  scope           text NOT NULL,
  tenant_id       uuid NOT NULL,
  domain_id       uuid NOT NULL,
  product_id      uuid NOT NULL REFERENCES products.products_current (product_id),
  consumer_id     uuid NOT NULL REFERENCES products.product_consumers (consumer_id),
  version         int  NOT NULL CHECK (version >= 1),
  outcome         text NOT NULL CHECK (outcome IN ('pass', 'fail')),
  evidence        jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(evidence) = 'object'),
  recorded_by     uuid NOT NULL,
  recorded_at     timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id  uuid NOT NULL,
  CONSTRAINT prt_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX prt_product ON products.contract_tests (product_id, version, consumer_id, recorded_at DESC);
CREATE TRIGGER prt_append_only BEFORE UPDATE OR DELETE ON products.contract_tests FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE products.contract_tests IS 'B90 (0095 §R): a consumer''s test of a contract version with its outcome and evidence (DP-41-006 "consumer contract tests"); every test also lands in the one SLO ledger as contract_test_pass. Append-only.';

CREATE TABLE products.scorecards (
  scorecard_id      uuid PRIMARY KEY,
  scope             text NOT NULL,
  tenant_id         uuid NOT NULL,
  domain_id         uuid NOT NULL,
  product_id        uuid NOT NULL REFERENCES products.products_current (product_id),
  computed_at       timestamptz NOT NULL DEFAULT clock_timestamp(),
  computed_by       uuid NOT NULL,                     -- the owner, the steward, or the attention agent (the tick)
  window_days       int  NOT NULL CHECK (window_days BETWEEN 1 AND 366),
  state_at          text NOT NULL,                     -- the product's state when computed (never part of the verdict)
  released_version  int,
  slo               jsonb NOT NULL CHECK (jsonb_typeof(slo) = 'object'),        -- measure → {observations, met, attainment_pct, last_value, threshold, last_observed_at}
  attainment_pct    numeric,                           -- the least attainment among the measures observed in the window; NULL when none
  floor_pct         numeric NOT NULL,                  -- declaration.slo.attainment_floor_pct (default 95)
  below_floor       boolean NOT NULL,
  reviews           jsonb NOT NULL CHECK (jsonb_typeof(reviews) = 'object'),    -- kind → the latest outcome
  consumers         jsonb NOT NULL CHECK (jsonb_typeof(consumers) = 'object'),  -- {registered, accepted, revoked, migrated}
  contract_tests    jsonb NOT NULL CHECK (jsonb_typeof(contract_tests) = 'object'),   -- {pass, fail, version}
  lineage_closed    boolean NOT NULL,                  -- every input names a kind and a ref, and there is at least one
  policy_closed     boolean NOT NULL,                  -- purposes and data_classes declared
  cost              jsonb,                             -- the latest attribution (NULL when none)
  overall           text NOT NULL CHECK (overall IN ('ok', 'degraded', 'failing')),
  reasons           jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(reasons) = 'array'),
  digest            text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  correlation_id    uuid NOT NULL,
  CONSTRAINT prs_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX prs_product ON products.scorecards (product_id, computed_at DESC);
CREATE TRIGGER prs_append_only BEFORE UPDATE OR DELETE ON products.scorecards FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE products.scorecards IS 'B90 (0095 §R): the product scorecard (DP-05-006, DP-41-006) — SLO attainment over a window, the reviews, the consumers, the contract tests, lineage and policy closure, the latest cost; computed by the tick step product-scorecards (order 64) or on demand, NEVER on read. Append-only.';

CREATE TABLE products.cost_attributions (
  attribution_id  uuid PRIMARY KEY,
  scope           text NOT NULL,
  tenant_id       uuid NOT NULL,
  domain_id       uuid NOT NULL,
  product_id      uuid NOT NULL REFERENCES products.products_current (product_id),
  period_start    date NOT NULL,
  period_end      date NOT NULL,
  amount          numeric(18,2) NOT NULL CHECK (amount >= 0),
  currency        text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  basis           text NOT NULL CHECK (length(btrim(basis)) BETWEEN 2 AND 400),
  details         jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
  attributed_by   uuid NOT NULL,
  attributed_at   timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id  uuid NOT NULL,
  CONSTRAINT prk_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT prk_period CHECK (period_start < period_end),
  CONSTRAINT prk_period_once UNIQUE (product_id, period_start, period_end)
);
CREATE INDEX prk_product ON products.cost_attributions (product_id, period_end DESC);
CREATE TRIGGER prk_append_only BEFORE UPDATE OR DELETE ON products.cost_attributions FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE products.cost_attributions IS 'B90 (0095 §R): a period''s cost of a product with its basis (DP-41-006) — a period attributed once; the scorecard carries the latest. Append-only.';

-- RLS and grants (the 0081 loop idiom; the prelude's policy text; the ports write)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['product_consumers', 'contract_tests', 'scorecards', 'cost_attributions'] LOOP
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
-- §R.3 THE RELEASE GUARD (DP-41-006): a BREAKING version over accepted consumers without a passing contract test
-- ═════════════════════════════════════════════════════════════════════
/* Called by the release SERVICE (products.service.ts release(), under products.product.release) BEFORE the DPR is admitted: when the
   version's declaration says contract.compatibility = 'breaking', every ACCEPTED consumer of the product must hold a PASSING contract
   test on that version — otherwise the release is refused and the consumers NAMED. A compatible version passes. Answers what it checked. */
CREATE OR REPLACE FUNCTION products.assert_release_consumers(p_product_id uuid, p_version int) RETURNS jsonb
SECURITY DEFINER SET search_path = products, pg_catalog, pg_temp AS $$
DECLARE r products.products_current%ROWTYPE; v products.product_versions%ROWTYPE; v_missing text[]; v_accepted int;
BEGIN
  SELECT * INTO r FROM products.products_current x WHERE x.product_id = p_product_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'data product rejected (unknown_product): % is not a product of this domain', p_product_id USING ERRCODE = '22023'; END IF;
  SELECT * INTO v FROM products.product_versions x WHERE x.product_id = p_product_id AND x.version = p_version;
  IF NOT FOUND THEN RAISE EXCEPTION 'data product rejected (unknown_version): product % has no version %', r.product_key, p_version USING ERRCODE = '22023'; END IF;
  SELECT count(*) INTO v_accepted FROM products.product_consumers c WHERE c.product_id = p_product_id AND c.state = 'accepted';
  IF (v.declaration #>> '{contract,compatibility}') IS DISTINCT FROM 'breaking' THEN
    RETURN jsonb_build_object('version', p_version, 'compatibility', coalesce(v.declaration #>> '{contract,compatibility}', 'unstated'), 'accepted_consumers', v_accepted, 'checked', false);
  END IF;
  SELECT coalesce(array_agg(c.consumer_id::text ORDER BY c.registered_at), '{}') INTO v_missing
    FROM products.product_consumers c
   WHERE c.product_id = p_product_id AND c.state = 'accepted'
     AND NOT EXISTS (SELECT 1 FROM products.contract_tests t WHERE t.product_id = p_product_id AND t.consumer_id = c.consumer_id AND t.version = p_version AND t.outcome = 'pass');
  IF cardinality(v_missing) > 0 THEN
    RAISE EXCEPTION 'data product rejected (contract_tests): publication denied — version % of product % is BREAKING and accepted consumer(s) % hold no passing contract test on it', p_version, r.product_key, array_to_string(v_missing, ', ') USING ERRCODE = '22023';
  END IF;
  RETURN jsonb_build_object('version', p_version, 'compatibility', 'breaking', 'accepted_consumers', v_accepted, 'checked', true);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION products.assert_release_consumers(uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION products.assert_release_consumers(uuid, int) TO eye_commit;

-- ═════════════════════════════════════════════════════════════════════
-- §R.4 THE PORTS
-- ═════════════════════════════════════════════════════════════════════
/* REGISTER A CONSUMER (products.consumer.register): the consumer's own act, or a steward's (data_steward / domain_admin / platform_admin)
   for a named consumer — a human or an agent of the tenant, active; the product RELEASED (or degraded); one live registration per consumer
   per product; the contract version adopted is the released one (the acceptance names it again — DP-05-006). */
CREATE OR REPLACE FUNCTION products.register_consumer(
  p_consumer_id uuid, p_product_id uuid, p_tenant uuid, p_domain uuid, p_consumer uuid, p_consumer_domain uuid, p_purpose text, p_impact text, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = products, executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r products.products_current%ROWTYPE; c products.product_consumers%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['products.consumer.register']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'data product consumer rejected (actor): registered by the acting principal' USING ERRCODE = '42501'; END IF;
  IF p_consumer IS DISTINCT FROM p_actor AND NOT executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['data_steward', 'domain_admin', 'platform_admin']) THEN
    RAISE EXCEPTION 'data product consumer rejected (authority): a consumer registers itself, or a data steward registers it' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO r FROM products.products_current x WHERE x.product_id = p_product_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'data product consumer rejected (unknown_product): % is not a product of this domain', p_product_id USING ERRCODE = '22023'; END IF;
  IF r.state NOT IN ('released', 'degraded') THEN RAISE EXCEPTION 'data product consumer rejected (state): product % is %; a consumer registers on a released product', r.product_key, r.state USING ERRCODE = '22023'; END IF;
  IF p_consumer IS NULL OR NOT EXISTS (SELECT 1 FROM identity.principals x WHERE x.id = p_consumer AND x.tenant_id = p_tenant AND x.kind IN ('human', 'agent') AND x.status = 'active') THEN
    RAISE EXCEPTION 'data product consumer rejected (unknown_consumer): the consumer is a named, active human or agent of the tenant' USING ERRCODE = '22023';
  END IF;
  IF p_purpose IS NULL OR length(btrim(p_purpose)) < 8 THEN RAISE EXCEPTION 'data product consumer rejected (purpose): a consumer states its purpose (8+ characters)' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM products.product_consumers x WHERE x.product_id = p_product_id AND x.consumer_principal_id = p_consumer AND x.state IN ('registered', 'accepted')) THEN
    RAISE EXCEPTION 'data product consumer rejected (duplicate): principal % is already a live consumer of product %', p_consumer, r.product_key USING ERRCODE = '23505';
  END IF;
  INSERT INTO products.product_consumers (consumer_id, scope, tenant_id, domain_id, product_id, consumer_principal_id, consumer_domain_id, purpose, impact, contract_version, registered_by, correlation_id)
  VALUES (p_consumer_id, 'DOMAIN', p_tenant, p_domain, p_product_id, p_consumer, coalesce(p_consumer_domain, p_domain), btrim(p_purpose), NULLIF(btrim(coalesce(p_impact, '')), ''), r.released_version, p_actor, p_correlation)
  RETURNING * INTO c;
  INSERT INTO products.product_events (event_id, scope, tenant_id, domain_id, product_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_product_id, 'consumer.registered', p_actor,
          jsonb_build_object('consumer_id', p_consumer_id, 'consumer_principal_id', p_consumer, 'contract_version', r.released_version, 'purpose', btrim(p_purpose)), p_correlation);
  RETURN to_jsonb(c) - 'scope' - 'tenant_id' - 'domain_id' - 'correlation_id';
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION products.register_consumer(uuid,uuid,uuid,uuid,uuid,uuid,text,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION products.register_consumer(uuid,uuid,uuid,uuid,uuid,uuid,text,text,uuid,uuid,uuid) TO eye_commit;

/* ACCEPT THE CONTRACT (products.consumer.accept) — DP-05-006 "consumer acceptance": THE CONSUMER's own act (nobody accepts for it), naming
   the contract version it accepts, which must be the RELEASED one; registered → accepted. */
CREATE OR REPLACE FUNCTION products.accept_consumer_contract(
  p_consumer_id uuid, p_product_id uuid, p_tenant uuid, p_domain uuid, p_version int, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = products, executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r products.products_current%ROWTYPE; c products.product_consumers%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['products.consumer.accept']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'data product consumer rejected (actor): accepted by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO r FROM products.products_current x WHERE x.product_id = p_product_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'data product consumer rejected (unknown_product): % is not a product of this domain', p_product_id USING ERRCODE = '22023'; END IF;
  SELECT * INTO c FROM products.product_consumers x WHERE x.consumer_id = p_consumer_id AND x.product_id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'data product consumer rejected (unknown_consumer): % is not a consumer of product %', p_consumer_id, r.product_key USING ERRCODE = '22023'; END IF;
  IF c.consumer_principal_id <> p_actor THEN RAISE EXCEPTION 'data product consumer rejected (not_consumer): a contract is accepted by the consumer itself — nobody accepts for it' USING ERRCODE = '42501'; END IF;
  IF c.state <> 'registered' THEN RAISE EXCEPTION 'data product consumer rejected (state): consumer % is %; acceptance follows registration once', p_consumer_id, c.state USING ERRCODE = '22023'; END IF;
  IF r.state NOT IN ('released', 'degraded') THEN RAISE EXCEPTION 'data product consumer rejected (state): product % is %; there is no released contract to accept', r.product_key, r.state USING ERRCODE = '22023'; END IF;
  IF p_version IS NULL OR p_version <> r.released_version THEN
    RAISE EXCEPTION 'data product consumer rejected (version): the accepted contract version is the released one — version % of product % (not %)', r.released_version, r.product_key, coalesce(p_version::text, 'null') USING ERRCODE = '22023';
  END IF;
  UPDATE products.product_consumers SET state = 'accepted', contract_version = p_version, accepted_at = clock_timestamp(), accepted_by = p_actor, updated_at = clock_timestamp()
   WHERE consumer_id = p_consumer_id RETURNING * INTO c;
  INSERT INTO products.product_events (event_id, scope, tenant_id, domain_id, product_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_product_id, 'consumer.accepted', p_actor,
          jsonb_build_object('consumer_id', p_consumer_id, 'consumer_principal_id', c.consumer_principal_id, 'contract_version', p_version), p_correlation);
  RETURN to_jsonb(c) - 'scope' - 'tenant_id' - 'domain_id' - 'correlation_id';
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION products.accept_consumer_contract(uuid,uuid,uuid,uuid,int,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION products.accept_consumer_contract(uuid,uuid,uuid,uuid,int,uuid,uuid,uuid) TO eye_commit;

/* REVOKE A CONSUMER (products.consumer.revoke): the product's owner, the consumer itself, or a steward; a reason; registered | accepted → revoked. */
CREATE OR REPLACE FUNCTION products.revoke_consumer(
  p_consumer_id uuid, p_product_id uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = products, executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r products.products_current%ROWTYPE; c products.product_consumers%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['products.consumer.revoke']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'data product consumer rejected (actor): revoked by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO r FROM products.products_current x WHERE x.product_id = p_product_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'data product consumer rejected (unknown_product): % is not a product of this domain', p_product_id USING ERRCODE = '22023'; END IF;
  SELECT * INTO c FROM products.product_consumers x WHERE x.consumer_id = p_consumer_id AND x.product_id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'data product consumer rejected (unknown_consumer): % is not a consumer of product %', p_consumer_id, r.product_key USING ERRCODE = '22023'; END IF;
  IF p_actor <> r.owner_principal_id AND p_actor <> c.consumer_principal_id AND NOT executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['data_steward', 'domain_admin', 'platform_admin']) THEN
    RAISE EXCEPTION 'data product consumer rejected (authority): a consumer is revoked by the product''s owner, by the consumer itself, or by a data steward' USING ERRCODE = '42501';
  END IF;
  IF c.state NOT IN ('registered', 'accepted') THEN RAISE EXCEPTION 'data product consumer rejected (state): consumer % is already %', p_consumer_id, c.state USING ERRCODE = '22023'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN RAISE EXCEPTION 'data product consumer rejected (reason): a revocation names its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  UPDATE products.product_consumers SET state = 'revoked', revoked_at = clock_timestamp(), revoked_by = p_actor, revocation_reason = btrim(p_reason), updated_at = clock_timestamp()
   WHERE consumer_id = p_consumer_id RETURNING * INTO c;
  INSERT INTO products.product_events (event_id, scope, tenant_id, domain_id, product_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_product_id, 'consumer.revoked', p_actor,
          jsonb_build_object('consumer_id', p_consumer_id, 'consumer_principal_id', c.consumer_principal_id, 'reason', btrim(p_reason), 'was', CASE WHEN c.accepted_at IS NULL THEN 'registered' ELSE 'accepted' END), p_correlation);
  RETURN to_jsonb(c) - 'scope' - 'tenant_id' - 'domain_id' - 'correlation_id';
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION products.revoke_consumer(uuid,uuid,uuid,uuid,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION products.revoke_consumer(uuid,uuid,uuid,uuid,text,uuid,uuid,uuid) TO eye_commit;

/* MIGRATE A CONSUMER (products.consumer.migrate): THE CONSUMER's own act (a migration is an acceptance of the newer contract) — from an
   accepted registration to the product's NEWER released version; refused unless a PASSING contract test of this consumer on that version
   exists (DP-41-006). The old row closes as `migrated` and a NEW row continues it, accepted on the new version. */
CREATE OR REPLACE FUNCTION products.migrate_consumer(
  p_consumer_id uuid, p_new_consumer_id uuid, p_product_id uuid, p_tenant uuid, p_domain uuid, p_version int, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = products, executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r products.products_current%ROWTYPE; c products.product_consumers%ROWTYPE; n products.product_consumers%ROWTYPE; v_now timestamptz := clock_timestamp();
BEGIN
  PERFORM observation.assert_authority(ARRAY['products.consumer.migrate']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'data product consumer rejected (actor): migrated by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO r FROM products.products_current x WHERE x.product_id = p_product_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'data product consumer rejected (unknown_product): % is not a product of this domain', p_product_id USING ERRCODE = '22023'; END IF;
  SELECT * INTO c FROM products.product_consumers x WHERE x.consumer_id = p_consumer_id AND x.product_id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'data product consumer rejected (unknown_consumer): % is not a consumer of product %', p_consumer_id, r.product_key USING ERRCODE = '22023'; END IF;
  IF c.consumer_principal_id <> p_actor THEN RAISE EXCEPTION 'data product consumer rejected (not_consumer): a consumer migrates itself — a migration is its acceptance of the newer contract' USING ERRCODE = '42501'; END IF;
  IF c.state <> 'accepted' THEN RAISE EXCEPTION 'data product consumer rejected (state): consumer % is %; only an accepted consumer migrates', p_consumer_id, c.state USING ERRCODE = '22023'; END IF;
  IF r.state NOT IN ('released', 'degraded') THEN RAISE EXCEPTION 'data product consumer rejected (state): product % is %; there is no released contract to migrate to', r.product_key, r.state USING ERRCODE = '22023'; END IF;
  IF p_version IS NULL OR p_version <> r.released_version OR p_version <= c.contract_version THEN
    RAISE EXCEPTION 'data product consumer rejected (version): a migration moves to the newer released version — version % of product % (the consumer holds %, asked %)', r.released_version, r.product_key, c.contract_version, coalesce(p_version::text, 'null') USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM products.contract_tests t WHERE t.product_id = p_product_id AND t.consumer_id = p_consumer_id AND t.version = p_version AND t.outcome = 'pass') THEN
    RAISE EXCEPTION 'data product consumer rejected (contract_tests): consumer % holds no passing contract test on version % of product %; record one first', p_consumer_id, p_version, r.product_key USING ERRCODE = '22023';
  END IF;
  -- the old row closes FIRST (one live registration per consumer per product — prc_live_once), then the new row continues it
  UPDATE products.product_consumers SET state = 'migrated', migrated_to = p_new_consumer_id, migrated_at = v_now, updated_at = v_now WHERE consumer_id = p_consumer_id;
  INSERT INTO products.product_consumers (consumer_id, scope, tenant_id, domain_id, product_id, consumer_principal_id, consumer_domain_id, purpose, impact, contract_version, state, usage, registered_by, registered_at,
                                          accepted_at, accepted_by, migrated_from, correlation_id)
  VALUES (p_new_consumer_id, 'DOMAIN', p_tenant, p_domain, p_product_id, c.consumer_principal_id, c.consumer_domain_id, c.purpose, c.impact, p_version, 'accepted', c.usage, p_actor, v_now, v_now, p_actor, p_consumer_id, p_correlation)
  RETURNING * INTO n;
  INSERT INTO products.product_events (event_id, scope, tenant_id, domain_id, product_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_product_id, 'consumer.migrated', p_actor,
          jsonb_build_object('consumer_id', p_consumer_id, 'new_consumer_id', p_new_consumer_id, 'consumer_principal_id', c.consumer_principal_id, 'from_version', c.contract_version, 'to_version', p_version), p_correlation);
  RETURN (to_jsonb(n) - 'scope' - 'tenant_id' - 'domain_id' - 'correlation_id') || jsonb_build_object('migrated_from_version', c.contract_version);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION products.migrate_consumer(uuid,uuid,uuid,uuid,uuid,int,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION products.migrate_consumer(uuid,uuid,uuid,uuid,uuid,int,uuid,uuid,uuid) TO eye_commit;

/* RECORD A CONTRACT TEST (products.product.contract_test): the consumer itself, the product's owner, or a steward records a consumer's test
   of a DECLARED version with its outcome and evidence; the test lands in the one SLO ledger as contract_test_pass (1 | 0, threshold 1)
   through §0's observe_slo under this same action. Never on a retired product (observe_slo refuses it). */
CREATE OR REPLACE FUNCTION products.record_contract_test(
  p_test_id uuid, p_product_id uuid, p_consumer_id uuid, p_tenant uuid, p_domain uuid, p_version int, p_outcome text, p_evidence jsonb, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = products, executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r products.products_current%ROWTYPE; c products.product_consumers%ROWTYPE; t products.contract_tests%ROWTYPE; v_obs jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['products.product.contract_test']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'contract test rejected (actor): recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO r FROM products.products_current x WHERE x.product_id = p_product_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'contract test rejected (unknown_product): % is not a product of this domain', p_product_id USING ERRCODE = '22023'; END IF;
  SELECT * INTO c FROM products.product_consumers x WHERE x.consumer_id = p_consumer_id AND x.product_id = p_product_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'contract test rejected (unknown_consumer): % is not a consumer of product %', p_consumer_id, r.product_key USING ERRCODE = '22023'; END IF;
  IF p_actor <> c.consumer_principal_id AND p_actor <> r.owner_principal_id AND NOT executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['data_steward', 'domain_admin', 'platform_admin']) THEN
    RAISE EXCEPTION 'contract test rejected (authority): a contract test is recorded by the consumer, the product''s owner, or a data steward' USING ERRCODE = '42501';
  END IF;
  IF c.state NOT IN ('registered', 'accepted') THEN RAISE EXCEPTION 'contract test rejected (state): consumer % is %; a live consumer tests', p_consumer_id, c.state USING ERRCODE = '22023'; END IF;
  IF r.state = 'retired' THEN RAISE EXCEPTION 'contract test rejected (state): product % is retired', r.product_key USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM products.product_versions v WHERE v.product_id = p_product_id AND v.version = p_version) THEN
    RAISE EXCEPTION 'contract test rejected (unknown_version): product % has no version %', r.product_key, coalesce(p_version::text, 'null') USING ERRCODE = '22023';
  END IF;
  IF p_outcome IS NULL OR p_outcome NOT IN ('pass', 'fail') THEN RAISE EXCEPTION 'contract test rejected (outcome): a contract test passes or fails' USING ERRCODE = '22023'; END IF;
  IF p_evidence IS NOT NULL AND jsonb_typeof(p_evidence) <> 'object' THEN RAISE EXCEPTION 'contract test rejected (evidence): a contract test''s evidence is an object' USING ERRCODE = '22023'; END IF;
  INSERT INTO products.contract_tests (test_id, scope, tenant_id, domain_id, product_id, consumer_id, version, outcome, evidence, recorded_by, correlation_id)
  VALUES (p_test_id, 'DOMAIN', p_tenant, p_domain, p_product_id, p_consumer_id, p_version, p_outcome, coalesce(p_evidence, '{}'::jsonb), p_actor, p_correlation) RETURNING * INTO t;
  v_obs := products.observe_slo(gen_random_uuid(), p_product_id, p_tenant, p_domain, 'contract_test_pass', CASE WHEN p_outcome = 'pass' THEN 1 ELSE 0 END, 1, p_outcome = 'pass',
                                format('contract test of consumer %s', left(p_consumer_id::text, 8)), jsonb_build_object('test_id', p_test_id, 'consumer_id', p_consumer_id, 'version', p_version), p_actor, p_correlation);
  INSERT INTO products.product_events (event_id, scope, tenant_id, domain_id, product_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_product_id, 'contract_test.recorded', p_actor,
          jsonb_build_object('test_id', p_test_id, 'consumer_id', p_consumer_id, 'version', p_version, 'outcome', p_outcome, 'observation_id', v_obs ->> 'observation_id'), p_correlation);
  RETURN (to_jsonb(t) - 'scope' - 'tenant_id' - 'domain_id' - 'correlation_id') || jsonb_build_object('observation', v_obs);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION products.record_contract_test(uuid,uuid,uuid,uuid,uuid,int,text,jsonb,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION products.record_contract_test(uuid,uuid,uuid,uuid,uuid,int,text,jsonb,uuid,uuid,uuid) TO eye_commit;

/* ATTRIBUTE A PERIOD'S COST (products.product.cost.attribute): the owner or a steward; a period (start < end) ONCE; an amount ≥ 0 in an
   ISO-4217 currency with its basis. Never on a retired product. */
CREATE OR REPLACE FUNCTION products.attribute_cost(
  p_attribution_id uuid, p_product_id uuid, p_tenant uuid, p_domain uuid, p_period_start date, p_period_end date, p_amount numeric, p_currency text, p_basis text, p_details jsonb, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = products, executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r products.products_current%ROWTYPE; k products.cost_attributions%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['products.product.cost.attribute']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'product cost rejected (actor): attributed by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO r FROM products.products_current x WHERE x.product_id = p_product_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'product cost rejected (unknown_product): % is not a product of this domain', p_product_id USING ERRCODE = '22023'; END IF;
  IF p_actor <> r.owner_principal_id AND NOT executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['data_steward', 'domain_admin', 'platform_admin']) THEN
    RAISE EXCEPTION 'product cost rejected (authority): a cost is attributed by the product''s owner or by a data steward' USING ERRCODE = '42501';
  END IF;
  IF r.state = 'retired' THEN RAISE EXCEPTION 'product cost rejected (state): product % is retired', r.product_key USING ERRCODE = '22023'; END IF;
  IF p_period_start IS NULL OR p_period_end IS NULL OR p_period_start >= p_period_end THEN RAISE EXCEPTION 'product cost rejected (period): a period runs from a start day to a later end day' USING ERRCODE = '22023'; END IF;
  IF p_amount IS NULL OR p_amount < 0 THEN RAISE EXCEPTION 'product cost rejected (amount): a cost is a non-negative amount' USING ERRCODE = '22023'; END IF;
  IF p_currency IS NULL OR p_currency !~ '^[A-Z]{3}$' THEN RAISE EXCEPTION 'product cost rejected (currency): a currency is an ISO-4217 code' USING ERRCODE = '22023'; END IF;
  IF p_basis IS NULL OR length(btrim(p_basis)) NOT BETWEEN 2 AND 400 THEN RAISE EXCEPTION 'product cost rejected (basis): a cost names its basis (2–400 characters)' USING ERRCODE = '22023'; END IF;
  IF p_details IS NOT NULL AND jsonb_typeof(p_details) <> 'object' THEN RAISE EXCEPTION 'product cost rejected (details): a cost''s details are an object' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM products.cost_attributions x WHERE x.product_id = p_product_id AND x.period_start = p_period_start AND x.period_end = p_period_end) THEN
    RAISE EXCEPTION 'product cost rejected (duplicate): the period % – % of product % is already attributed', p_period_start, p_period_end, r.product_key USING ERRCODE = '23505';
  END IF;
  INSERT INTO products.cost_attributions (attribution_id, scope, tenant_id, domain_id, product_id, period_start, period_end, amount, currency, basis, details, attributed_by, correlation_id)
  VALUES (p_attribution_id, 'DOMAIN', p_tenant, p_domain, p_product_id, p_period_start, p_period_end, p_amount, p_currency, btrim(p_basis), coalesce(p_details, '{}'::jsonb), p_actor, p_correlation) RETURNING * INTO k;
  INSERT INTO products.product_events (event_id, scope, tenant_id, domain_id, product_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_product_id, 'cost.attributed', p_actor,
          jsonb_build_object('attribution_id', p_attribution_id, 'period_start', p_period_start, 'period_end', p_period_end, 'amount', k.amount::text, 'currency', p_currency, 'basis', btrim(p_basis)), p_correlation);
  -- money leaves as a DECIMAL STRING with its two places (a JSON number would drop them and become a float on the wire)
  RETURN (to_jsonb(k) - 'scope' - 'tenant_id' - 'domain_id' - 'correlation_id') || jsonb_build_object('amount', k.amount::text);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION products.attribute_cost(uuid,uuid,uuid,uuid,date,date,numeric,text,text,jsonb,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION products.attribute_cost(uuid,uuid,uuid,uuid,date,date,numeric,text,text,jsonb,uuid,uuid,uuid) TO eye_commit;

/* COMPUTE THE SCORECARD (products.product.scorecard.compute — the owner or a steward — OR executive.attention.tick — the step
   product-scorecards): on a released or degraded product, over a window of days ending at the DATABASE's instant. THE SLO: per measure
   observed in the window, the observations, how many met, the attainment percentage, the last value and threshold; the product's
   attainment is the LEAST among its measures (NULL when nothing was observed); the floor is declaration.slo.attainment_floor_pct
   (default 95). THE VERDICT: failing when the attainment is under the floor or every contract test on the released version fails;
   degraded when something is open (no observation in the window, a failing contract test, lineage or policy not closed); ok otherwise.
   The product's own state is RECORDED (state_at), never part of the verdict — a degraded product's scorecard reads ok when its levels
   recover, which is what its restoration needs. Answers the consecutive below-floor scorecards SINCE the last release or restoration
   (the tick degrades at declaration.slo.grace_ticks, default 2). */
CREATE OR REPLACE FUNCTION products.compute_scorecard(
  p_scorecard_id uuid, p_product_id uuid, p_tenant uuid, p_domain uuid, p_window_days int, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = products, executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r products.products_current%ROWTYPE; s products.scorecards%ROWTYPE; q record; v_now timestamptz := clock_timestamp(); v_window int := coalesce(p_window_days, 30);
        v_slo jsonb; v_att numeric; v_floor numeric; v_grace int; v_below boolean; v_reviews jsonb; v_consumers jsonb; v_tests jsonb; v_lineage boolean; v_policy boolean; v_cost jsonb;
        v_overall text; v_reasons jsonb := '[]'::jsonb; v_body jsonb; v_digest text; v_since timestamptz; v_consecutive int := 0; v_pass int; v_fail int; v_floor_txt text; v_grace_txt text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['products.product.scorecard.compute', 'executive.attention.tick']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'product scorecard rejected (actor): computed by the acting principal' USING ERRCODE = '42501'; END IF;
  IF v_window NOT BETWEEN 1 AND 366 THEN RAISE EXCEPTION 'product scorecard rejected (window): a scorecard window is 1 to 366 days' USING ERRCODE = '22023'; END IF;
  SELECT * INTO r FROM products.products_current x WHERE x.product_id = p_product_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'product scorecard rejected (unknown_product): % is not a product of this domain', p_product_id USING ERRCODE = '22023'; END IF;
  IF p_actor <> r.owner_principal_id AND public.eye_bound_action() <> 'executive.attention.tick' AND NOT executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['data_steward', 'domain_admin', 'platform_admin']) THEN
    RAISE EXCEPTION 'product scorecard rejected (authority): a scorecard is computed by the product''s owner, by a data steward, or by the attention tick' USING ERRCODE = '42501';
  END IF;
  IF r.state NOT IN ('released', 'degraded') THEN RAISE EXCEPTION 'product scorecard rejected (state): product % is %; a scorecard is computed on a released or degraded product', r.product_key, r.state USING ERRCODE = '22023'; END IF;
  -- the SLO over the window
  SELECT coalesce(jsonb_object_agg(m.measure, jsonb_build_object('observations', m.n, 'met', m.met_n, 'attainment_pct', m.att, 'last_value', m.last_value, 'threshold', m.threshold, 'last_observed_at', m.last_at)), '{}'::jsonb), min(m.att)
    INTO v_slo, v_att
    FROM (SELECT o.measure, count(*) AS n, count(*) FILTER (WHERE o.met) AS met_n, round(100.0 * (count(*) FILTER (WHERE o.met)) / count(*), 2) AS att,
                 (array_agg(o.value ORDER BY o.observed_at DESC))[1] AS last_value, (array_agg(o.threshold ORDER BY o.observed_at DESC))[1] AS threshold, max(o.observed_at) AS last_at
            FROM products.slo_observations o WHERE o.product_id = p_product_id AND o.observed_at >= v_now - make_interval(days => v_window) GROUP BY o.measure) m;
  v_floor_txt := r.declaration #>> '{slo,attainment_floor_pct}';
  v_floor := CASE WHEN v_floor_txt ~ '^[0-9]{1,3}(\.[0-9]{1,2})?$' AND v_floor_txt::numeric <= 100 THEN v_floor_txt::numeric ELSE 95 END;
  v_grace_txt := r.declaration #>> '{slo,grace_ticks}';
  v_grace := CASE WHEN v_grace_txt ~ '^[0-9]{1,2}$' AND v_grace_txt::int BETWEEN 1 AND 24 THEN v_grace_txt::int ELSE 2 END;
  v_below := v_att IS NOT NULL AND v_att < v_floor;
  -- the reviews: the latest outcome per kind
  SELECT coalesce(jsonb_object_agg(k.kind, jsonb_build_object('outcome', k.outcome, 'version', k.version, 'reviewed_at', k.reviewed_at, 'reviewer_principal_id', k.reviewer_principal_id)), '{}'::jsonb) INTO v_reviews
    FROM (SELECT DISTINCT ON (x.kind) x.kind, x.outcome, x.version, x.reviewed_at, x.reviewer_principal_id FROM products.product_reviews x WHERE x.product_id = p_product_id ORDER BY x.kind, x.reviewed_at DESC) k;
  -- the consumers and the contract tests on the released version
  SELECT jsonb_build_object('registered', count(*) FILTER (WHERE c.state = 'registered'), 'accepted', count(*) FILTER (WHERE c.state = 'accepted'),
                            'revoked', count(*) FILTER (WHERE c.state = 'revoked'), 'migrated', count(*) FILTER (WHERE c.state = 'migrated'))
    INTO v_consumers FROM products.product_consumers c WHERE c.product_id = p_product_id;
  SELECT count(*) FILTER (WHERE t.outcome = 'pass'), count(*) FILTER (WHERE t.outcome = 'fail') INTO v_pass, v_fail
    FROM products.contract_tests t WHERE t.product_id = p_product_id AND t.version = r.released_version;
  v_tests := jsonb_build_object('pass', v_pass, 'fail', v_fail, 'version', r.released_version);
  -- lineage and policy closure (DP-41-002: the declaration names where it comes from and what it may be used for)
  v_lineage := jsonb_typeof(r.declaration -> 'inputs') = 'array' AND jsonb_array_length(r.declaration -> 'inputs') > 0
               AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(r.declaration -> 'inputs') i WHERE jsonb_typeof(i -> 'kind') <> 'string' OR length(btrim(coalesce(i ->> 'ref', ''))) = 0);
  v_policy := jsonb_typeof(r.declaration #> '{policy,purposes}') = 'array' AND jsonb_array_length(r.declaration #> '{policy,purposes}') > 0
              AND jsonb_typeof(r.declaration #> '{policy,data_classes}') = 'array' AND jsonb_array_length(r.declaration #> '{policy,data_classes}') > 0;
  SELECT (to_jsonb(k) - 'scope' - 'tenant_id' - 'domain_id' - 'correlation_id') || jsonb_build_object('amount', k.amount::text) INTO v_cost
    FROM products.cost_attributions k WHERE k.product_id = p_product_id ORDER BY k.period_end DESC, k.attributed_at DESC LIMIT 1;
  -- the verdict, with its reasons in words
  IF v_att IS NULL THEN v_reasons := v_reasons || to_jsonb(format('no SLO observation in the last %s day(s)', v_window)); END IF;
  IF v_below THEN v_reasons := v_reasons || to_jsonb(format('SLO attainment %s%% is under the floor %s%%', v_att, v_floor)); END IF;
  IF v_fail > 0 THEN v_reasons := v_reasons || to_jsonb(format('%s failing contract test(s) on version %s (%s passing)', v_fail, r.released_version, v_pass)); END IF;
  IF NOT v_lineage THEN v_reasons := v_reasons || to_jsonb('lineage is not closed: the declaration names no input, or an input without a kind and a ref'::text); END IF;
  IF NOT v_policy THEN v_reasons := v_reasons || to_jsonb('policy is not closed: purposes and data_classes are both declared when the policy is closed'::text); END IF;
  v_overall := CASE WHEN v_below OR (v_fail > 0 AND v_pass = 0) THEN 'failing' WHEN jsonb_array_length(v_reasons) > 0 THEN 'degraded' ELSE 'ok' END;
  v_body := jsonb_build_object('product_id', p_product_id, 'computed_at', v_now, 'window_days', v_window, 'state_at', r.state, 'released_version', r.released_version, 'slo', v_slo, 'attainment_pct', v_att,
                               'floor_pct', v_floor, 'below_floor', v_below, 'reviews', v_reviews, 'consumers', v_consumers, 'contract_tests', v_tests, 'lineage_closed', v_lineage, 'policy_closed', v_policy,
                               'cost', v_cost, 'overall', v_overall, 'reasons', v_reasons);
  v_digest := encode(digest(v_body::text, 'sha256'), 'hex');
  INSERT INTO products.scorecards (scorecard_id, scope, tenant_id, domain_id, product_id, computed_at, computed_by, window_days, state_at, released_version, slo, attainment_pct, floor_pct, below_floor, reviews, consumers,
                                   contract_tests, lineage_closed, policy_closed, cost, overall, reasons, digest, correlation_id)
  VALUES (p_scorecard_id, 'DOMAIN', p_tenant, p_domain, p_product_id, v_now, p_actor, v_window, r.state, r.released_version, v_slo, v_att, v_floor, v_below, v_reviews, v_consumers,
          v_tests, v_lineage, v_policy, v_cost, v_overall, v_reasons, v_digest, p_correlation) RETURNING * INTO s;
  -- the consecutive below-floor scorecards since the last release or restoration (the degradation counts only what followed the last human act)
  SELECT max(e.occurred_at) INTO v_since FROM products.product_events e WHERE e.product_id = p_product_id AND e.event IN ('product.released', 'product.restored');
  FOR q IN SELECT x.below_floor FROM products.scorecards x WHERE x.product_id = p_product_id AND (v_since IS NULL OR x.computed_at > v_since) ORDER BY x.computed_at DESC LOOP
    EXIT WHEN NOT q.below_floor;
    v_consecutive := v_consecutive + 1;
  END LOOP;
  INSERT INTO products.product_events (event_id, scope, tenant_id, domain_id, product_id, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_product_id, 'scorecard.computed', p_actor,
          jsonb_build_object('scorecard_id', p_scorecard_id, 'overall', v_overall, 'attainment_pct', v_att, 'floor_pct', v_floor, 'below_floor', v_below, 'consecutive_below_floor', v_consecutive, 'window_days', v_window,
                             'by', CASE WHEN public.eye_bound_action() = 'executive.attention.tick' THEN 'the attention tick step product-scorecards' ELSE 'on demand' END), p_correlation);
  RETURN (to_jsonb(s) - 'scope' - 'tenant_id' - 'domain_id' - 'correlation_id') || jsonb_build_object('consecutive_below_floor', v_consecutive, 'grace_ticks', v_grace);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION products.compute_scorecard(uuid,uuid,uuid,uuid,int,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION products.compute_scorecard(uuid,uuid,uuid,uuid,int,uuid,uuid) TO eye_commit;

/* DEGRADE (products.product.degrade — the owner or a steward — OR executive.attention.tick — the step, after grace_ticks consecutive
   below-floor scorecards): released → degraded with a reason, NEVER silently: every ACCEPTED consumer gets an attention item of class
   product.degradation (subject kind product), routed to the consumer when it is an active human, else by the class's roles under the
   active policy (0094 §D's idiom for raising an item from a port); the event names every item raised. */
CREATE OR REPLACE FUNCTION products.degrade_product(
  p_product_id uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = products, executive, identity, observation, decision, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r products.products_current%ROWTYPE; c record; pol executive.attention_policies%ROWTYPE; v_now timestamptz := clock_timestamp(); v_by_tick boolean := public.eye_bound_action() = 'executive.attention.tick';
        v_item uuid; v_cause uuid; v_owner uuid; v_eval jsonb; v_route jsonb; v_state text; v_notified jsonb := '[]'::jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['products.product.degrade', 'executive.attention.tick']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'data product rejected (actor): degraded by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO r FROM products.products_current x WHERE x.product_id = p_product_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'data product rejected (unknown_product): % is not a product of this domain', p_product_id USING ERRCODE = '22023'; END IF;
  IF NOT v_by_tick AND p_actor <> r.owner_principal_id AND NOT executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['data_steward', 'domain_admin', 'platform_admin']) THEN
    RAISE EXCEPTION 'data product rejected (authority): a product is degraded by its owner, by a data steward, or by the attention tick' USING ERRCODE = '42501';
  END IF;
  IF r.state <> 'released' THEN RAISE EXCEPTION 'data product rejected (state): product % is %; a released product degrades', r.product_key, r.state USING ERRCODE = '22023'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN RAISE EXCEPTION 'data product rejected (reason): a degradation names its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  UPDATE products.products_current SET state = 'degraded', degraded_reason = btrim(p_reason), degraded_at = v_now, updated_at = v_now WHERE product_id = p_product_id RETURNING * INTO r;
  SELECT * INTO pol FROM executive.attention_policies a WHERE a.tenant_id = p_tenant AND a.domain_id = p_domain AND a.state = 'active';
  FOR c IN SELECT x.* FROM products.product_consumers x WHERE x.product_id = p_product_id AND x.state = 'accepted' ORDER BY x.registered_at LOOP
    v_item := gen_random_uuid(); v_cause := gen_random_uuid();
    v_owner := CASE WHEN decision.is_active_human(c.consumer_principal_id, p_tenant) THEN c.consumer_principal_id END;
    v_eval := executive.evaluate_attention(CASE WHEN pol.policy_id IS NULL THEN NULL ELSE pol.rules END, 'product.degradation',
                                           jsonb_build_object('consequence', 'C2', 'confidence', 1, 'hours_to_window', 0)) || jsonb_build_object('policy_version', pol.version);
    v_route := executive.attention_route(pol.rules, 'product.degradation', v_eval ->> 'outcome', v_owner, p_tenant, p_domain);
    v_state := v_route ->> 'state';
    INSERT INTO executive.attention_items (item_id, scope, tenant_id, domain_id, signal_class, subject_kind, subject_id, cause_event_id, cause_event_type, title, outcome, state,
                                           owner_principal_id, route_roles, policy_id, policy_version, evaluation, details, due_at, escalations, correlation_id)
    VALUES (v_item, 'DOMAIN', p_tenant, p_domain, 'product.degradation', 'product', p_product_id, v_cause, 'ProductDegraded',
            left(format('Product %s DEGRADED: %s', r.product_key, btrim(p_reason)), 512), v_eval ->> 'outcome', v_state,
            v_owner, ARRAY(SELECT jsonb_array_elements_text(v_route -> 'route_roles')), pol.policy_id, pol.version, v_eval,
            jsonb_build_object('product_id', p_product_id, 'product_key', r.product_key, 'consumer_id', c.consumer_id, 'consumer_principal_id', c.consumer_principal_id, 'contract_version', c.contract_version,
                               'impact', c.impact, 'reason', btrim(p_reason), 'last_valid_version', r.released_version, 'raised_at', v_now,
                               'by', CASE WHEN v_by_tick THEN 'the attention tick step product-scorecards' ELSE 'the degradation port' END),
            (v_route ->> 'due_at')::timestamptz, (v_route ->> 'escalations')::int, p_correlation);
    PERFORM executive.attention_event(v_item, p_tenant, p_domain,
              CASE v_state WHEN 'open' THEN 'item.routed' WHEN 'escalated' THEN 'item.escalated' WHEN 'unrouted' THEN 'item.unrouted' ELSE 'item.deprioritized' END,
              p_actor, jsonb_build_object('outcome', v_eval ->> 'outcome', 'reasons', v_eval -> 'reasons', 'policy_version', pol.version, 'owner', v_owner, 'route_roles', v_route -> 'route_roles',
                                          'due_at', v_route -> 'due_at', 'cause_event_id', v_cause, 'cause_event_type', 'ProductDegraded', 'unrouted', coalesce((v_route ->> 'unrouted')::boolean, false)), p_correlation);
    v_notified := v_notified || jsonb_build_object('consumer_id', c.consumer_id, 'consumer_principal_id', c.consumer_principal_id, 'item_id', v_item, 'state', v_state, 'owner', v_owner);
  END LOOP;
  INSERT INTO products.product_events (event_id, scope, tenant_id, domain_id, product_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_product_id, 'product.degraded', p_actor,
          jsonb_build_object('reason', btrim(p_reason), 'by', CASE WHEN v_by_tick THEN 'tick' ELSE 'human' END, 'notified', v_notified, 'released_version', r.released_version), p_correlation);
  RETURN products.product_json(r) || jsonb_build_object('notified', v_notified);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION products.degrade_product(uuid,uuid,uuid,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION products.degrade_product(uuid,uuid,uuid,text,uuid,uuid,uuid) TO eye_commit;

/* RESTORE (products.product.restore): the OWNER's act; degraded → released ONLY through evidence — the latest scorecard reads ok, or an
   accepted DOMAIN review newer than the degradation; otherwise the owner releases a new version (the prelude's release clears the
   degradation — "restore through controlled release"). */
CREATE OR REPLACE FUNCTION products.restore_product(
  p_product_id uuid, p_tenant uuid, p_domain uuid, p_note text, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = products, executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r products.products_current%ROWTYPE; v_now timestamptz := clock_timestamp(); v_card record; v_review record; v_basis text; v_by text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['products.product.restore']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'data product rejected (actor): restored by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO r FROM products.products_current x WHERE x.product_id = p_product_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'data product rejected (unknown_product): % is not a product of this domain', p_product_id USING ERRCODE = '22023'; END IF;
  IF r.owner_principal_id <> p_actor THEN RAISE EXCEPTION 'data product rejected (not_owner): product % is restored by its owner', r.product_key USING ERRCODE = '42501'; END IF;
  IF r.state <> 'degraded' THEN RAISE EXCEPTION 'data product rejected (state): product % is %; a degraded product is restored', r.product_key, r.state USING ERRCODE = '22023'; END IF;
  SELECT s.scorecard_id, s.overall, s.computed_at INTO v_card FROM products.scorecards s WHERE s.product_id = p_product_id ORDER BY s.computed_at DESC LIMIT 1;
  SELECT x.review_id, x.reviewed_at INTO v_review FROM products.product_reviews x WHERE x.product_id = p_product_id AND x.kind = 'domain' AND x.outcome = 'accepted' AND x.reviewed_at > r.degraded_at ORDER BY x.reviewed_at DESC LIMIT 1;
  -- WHO degraded it decides what restores it: a degradation BY THE TICK (the SLO under its floor) is restored by an ok scorecard computed
  -- AFTER the degradation, or by a domain review; a degradation BY A PERSON names a reason no scorecard measures, so only an accepted domain
  -- review newer than it restores (the B90 rehearsal: a steward's degradation was restored on a green scorecard computed BEFORE it)
  SELECT e.details ->> 'by' INTO v_by FROM products.product_events e WHERE e.product_id = p_product_id AND e.event = 'product.degraded' ORDER BY e.occurred_at DESC, e.event_id DESC LIMIT 1;
  IF v_by = 'tick' AND v_card.scorecard_id IS NOT NULL AND v_card.overall = 'ok' AND v_card.computed_at > r.degraded_at THEN v_basis := 'scorecard';
  ELSIF v_review.review_id IS NOT NULL THEN v_basis := 'domain_review';
  ELSIF v_by IS DISTINCT FROM 'tick' THEN
    RAISE EXCEPTION 'data product rejected (review): product % stays degraded — degraded by a person ("%") at %, a reason no scorecard measures; no accepted domain review is newer than the degradation — restore through a domain review',
      r.product_key, left(coalesce(r.degraded_reason, ''), 120), r.degraded_at USING ERRCODE = '22023';
  ELSE
    RAISE EXCEPTION 'data product rejected (review): product % stays degraded — the latest scorecard reads % and no accepted domain review is newer than the degradation at %; restore through a domain review or a controlled release',
      r.product_key, coalesce(v_card.overall, 'nothing (none computed)'), r.degraded_at USING ERRCODE = '22023';
  END IF;
  UPDATE products.products_current SET state = 'released', degraded_reason = NULL, degraded_at = NULL, updated_at = v_now WHERE product_id = p_product_id RETURNING * INTO r;
  INSERT INTO products.product_events (event_id, scope, tenant_id, domain_id, product_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_product_id, 'product.restored', p_actor,
          jsonb_build_object('basis', v_basis, 'scorecard_id', v_card.scorecard_id, 'scorecard_overall', v_card.overall, 'review_id', v_review.review_id, 'note', NULLIF(btrim(coalesce(p_note, '')), '')), p_correlation);
  RETURN products.product_json(r) || jsonb_build_object('restored_on', v_basis);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION products.restore_product(uuid,uuid,uuid,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION products.restore_product(uuid,uuid,uuid,text,uuid,uuid,uuid) TO eye_commit;

/* WITHDRAW (products.product.withdraw): the OWNER's act with a reason; released | degraded → withdrawn; the released version STAYS the
   last valid version (readable; nothing is deleted); the DPR's WITHDRAWN version admitted by the service in this write BEFORE the port
   (the same object at the next object_version, lifecycle withdrawn, the reason in the header — missing → refused); every ACCEPTED
   consumer notified the same way as a degradation (class product.degradation, cause ProductWithdrawn). */
CREATE OR REPLACE FUNCTION products.withdraw_product(
  p_product_id uuid, p_tenant uuid, p_domain uuid, p_reason text, p_object_version bigint, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = products, executive, identity, observation, objects, decision, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r products.products_current%ROWTYPE; c record; pol executive.attention_policies%ROWTYPE; v_now timestamptz := clock_timestamp();
        v_item uuid; v_cause uuid; v_owner uuid; v_eval jsonb; v_route jsonb; v_state text; v_notified jsonb := '[]'::jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['products.product.withdraw']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'data product rejected (actor): withdrawn by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO r FROM products.products_current x WHERE x.product_id = p_product_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'data product rejected (unknown_product): % is not a product of this domain', p_product_id USING ERRCODE = '22023'; END IF;
  IF r.owner_principal_id <> p_actor THEN RAISE EXCEPTION 'data product rejected (not_owner): product % is withdrawn by its owner', r.product_key USING ERRCODE = '42501'; END IF;
  IF r.state NOT IN ('released', 'degraded') THEN RAISE EXCEPTION 'data product rejected (state): product % is %; a released or degraded product is withdrawn', r.product_key, r.state USING ERRCODE = '22023'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN RAISE EXCEPTION 'data product rejected (reason): a withdrawal names its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  IF p_object_version IS NULL OR NOT EXISTS (SELECT 1 FROM objects.canonical_objects o WHERE o.object_id = p_product_id AND o.object_type = 'DPR' AND o.tenant_id = p_tenant AND o.object_version = p_object_version
                                                 AND o.lifecycle_state = 'withdrawn' AND o.withdrawal_reason IS NOT NULL) THEN
    RAISE EXCEPTION 'data product rejected (canonical): the withdrawn DPR version of product % was not admitted in this write', r.product_key USING ERRCODE = '22023';
  END IF;
  UPDATE products.products_current SET state = 'withdrawn', withdrawn_at = v_now, withdrawn_by = p_actor, withdrawal_reason = btrim(p_reason), degraded_reason = NULL, degraded_at = NULL, updated_at = v_now
   WHERE product_id = p_product_id RETURNING * INTO r;
  SELECT * INTO pol FROM executive.attention_policies a WHERE a.tenant_id = p_tenant AND a.domain_id = p_domain AND a.state = 'active';
  FOR c IN SELECT x.* FROM products.product_consumers x WHERE x.product_id = p_product_id AND x.state = 'accepted' ORDER BY x.registered_at LOOP
    v_item := gen_random_uuid(); v_cause := gen_random_uuid();
    v_owner := CASE WHEN decision.is_active_human(c.consumer_principal_id, p_tenant) THEN c.consumer_principal_id END;
    v_eval := executive.evaluate_attention(CASE WHEN pol.policy_id IS NULL THEN NULL ELSE pol.rules END, 'product.degradation',
                                           jsonb_build_object('consequence', 'C2', 'confidence', 1, 'hours_to_window', 0)) || jsonb_build_object('policy_version', pol.version);
    v_route := executive.attention_route(pol.rules, 'product.degradation', v_eval ->> 'outcome', v_owner, p_tenant, p_domain);
    v_state := v_route ->> 'state';
    INSERT INTO executive.attention_items (item_id, scope, tenant_id, domain_id, signal_class, subject_kind, subject_id, cause_event_id, cause_event_type, title, outcome, state,
                                           owner_principal_id, route_roles, policy_id, policy_version, evaluation, details, due_at, escalations, correlation_id)
    VALUES (v_item, 'DOMAIN', p_tenant, p_domain, 'product.degradation', 'product', p_product_id, v_cause, 'ProductWithdrawn',
            left(format('Product %s WITHDRAWN: %s (last valid version %s)', r.product_key, btrim(p_reason), r.released_version), 512), v_eval ->> 'outcome', v_state,
            v_owner, ARRAY(SELECT jsonb_array_elements_text(v_route -> 'route_roles')), pol.policy_id, pol.version, v_eval,
            jsonb_build_object('product_id', p_product_id, 'product_key', r.product_key, 'consumer_id', c.consumer_id, 'consumer_principal_id', c.consumer_principal_id, 'contract_version', c.contract_version,
                               'impact', c.impact, 'reason', btrim(p_reason), 'last_valid_version', r.released_version, 'dpr_object_version', p_object_version, 'raised_at', v_now, 'by', 'the withdrawal port'),
            (v_route ->> 'due_at')::timestamptz, (v_route ->> 'escalations')::int, p_correlation);
    PERFORM executive.attention_event(v_item, p_tenant, p_domain,
              CASE v_state WHEN 'open' THEN 'item.routed' WHEN 'escalated' THEN 'item.escalated' WHEN 'unrouted' THEN 'item.unrouted' ELSE 'item.deprioritized' END,
              p_actor, jsonb_build_object('outcome', v_eval ->> 'outcome', 'reasons', v_eval -> 'reasons', 'policy_version', pol.version, 'owner', v_owner, 'route_roles', v_route -> 'route_roles',
                                          'due_at', v_route -> 'due_at', 'cause_event_id', v_cause, 'cause_event_type', 'ProductWithdrawn', 'unrouted', coalesce((v_route ->> 'unrouted')::boolean, false)), p_correlation);
    v_notified := v_notified || jsonb_build_object('consumer_id', c.consumer_id, 'consumer_principal_id', c.consumer_principal_id, 'item_id', v_item, 'state', v_state, 'owner', v_owner);
  END LOOP;
  INSERT INTO products.product_events (event_id, scope, tenant_id, domain_id, product_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_product_id, 'product.withdrawn', p_actor,
          jsonb_build_object('reason', btrim(p_reason), 'last_valid_version', r.released_version, 'dpr_object_version', p_object_version, 'notified', v_notified), p_correlation);
  RETURN products.product_json(r) || jsonb_build_object('notified', v_notified, 'dpr_object_version', p_object_version);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION products.withdraw_product(uuid,uuid,uuid,text,bigint,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION products.withdraw_product(uuid,uuid,uuid,text,bigint,uuid,uuid,uuid) TO eye_commit;

/* RETIRE (products.product.retire) — DP-05-006 "retirement evidence": the OWNER's act; refused while an ACCEPTED consumer remains
   (consumers — revoke or migrate them first) and unless an accepted RETIREMENT review exists (review); a product that was ever released
   has its DPR's ARCHIVED version admitted by the service in this write (the same object at the next object_version; missing → refused);
   a never-released product retires without one. The row stays (never deleted): retired is a state. */
CREATE OR REPLACE FUNCTION products.retire_product(
  p_product_id uuid, p_tenant uuid, p_domain uuid, p_object_version bigint, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = products, executive, identity, observation, objects, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r products.products_current%ROWTYPE; v_now timestamptz := clock_timestamp(); v_accepted int; v_review uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['products.product.retire']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'data product rejected (actor): retired by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO r FROM products.products_current x WHERE x.product_id = p_product_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'data product rejected (unknown_product): % is not a product of this domain', p_product_id USING ERRCODE = '22023'; END IF;
  IF r.owner_principal_id <> p_actor THEN RAISE EXCEPTION 'data product rejected (not_owner): product % is retired by its owner', r.product_key USING ERRCODE = '42501'; END IF;
  IF r.state = 'retired' THEN RAISE EXCEPTION 'data product rejected (state): product % is already retired', r.product_key USING ERRCODE = '22023'; END IF;
  SELECT count(*) INTO v_accepted FROM products.product_consumers c WHERE c.product_id = p_product_id AND c.state = 'accepted';
  IF v_accepted > 0 THEN RAISE EXCEPTION 'data product rejected (consumers): product % still has % accepted consumer(s); revoke or migrate them before retiring', r.product_key, v_accepted USING ERRCODE = '22023'; END IF;
  SELECT x.review_id INTO v_review FROM products.product_reviews x WHERE x.product_id = p_product_id AND x.kind = 'retirement' AND x.outcome = 'accepted' ORDER BY x.reviewed_at DESC LIMIT 1;
  IF v_review IS NULL THEN RAISE EXCEPTION 'data product rejected (review): product % has no accepted retirement review; retirement is reviewed by someone other than the owner', r.product_key USING ERRCODE = '22023'; END IF;
  IF r.released_version IS NOT NULL AND (p_object_version IS NULL OR NOT EXISTS (SELECT 1 FROM objects.canonical_objects o WHERE o.object_id = p_product_id AND o.object_type = 'DPR' AND o.tenant_id = p_tenant
                                                                                       AND o.object_version = p_object_version AND o.lifecycle_state = 'archived')) THEN
    RAISE EXCEPTION 'data product rejected (canonical): the archived DPR version of product % was not admitted in this write', r.product_key USING ERRCODE = '22023';
  END IF;
  UPDATE products.products_current SET state = 'retired', retired_at = v_now, retired_by = p_actor, degraded_reason = NULL, degraded_at = NULL, updated_at = v_now WHERE product_id = p_product_id RETURNING * INTO r;
  INSERT INTO products.product_events (event_id, scope, tenant_id, domain_id, product_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_product_id, 'product.retired', p_actor,
          jsonb_build_object('retirement_review_id', v_review, 'last_valid_version', r.released_version, 'dpr_object_version', p_object_version, 'was_withdrawn', r.withdrawn_at IS NOT NULL), p_correlation);
  RETURN products.product_json(r) || jsonb_build_object('retirement_review_id', v_review, 'dpr_object_version', p_object_version);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION products.retire_product(uuid,uuid,uuid,bigint,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION products.retire_product(uuid,uuid,uuid,bigint,uuid,uuid,uuid) TO eye_commit;

/* THE SCORECARD READ (an invoker read under the caller's RLS): the latest scorecard, the recent ones, the consumers, the contract tests,
   the cost attributions, the recent observations and the events — everything the product page shows beside §0's product_read. */
CREATE OR REPLACE FUNCTION products.product_scorecard(p_product_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = products, pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object(
    'product_id', p_product_id,
    'scorecard', (SELECT to_jsonb(s) - 'scope' - 'tenant_id' - 'domain_id' - 'correlation_id' FROM products.scorecards s WHERE s.product_id = p_product_id ORDER BY s.computed_at DESC LIMIT 1),
    'scorecards', coalesce((SELECT jsonb_agg(jsonb_build_object('scorecard_id', s.scorecard_id, 'computed_at', s.computed_at, 'computed_by', s.computed_by, 'overall', s.overall, 'attainment_pct', s.attainment_pct, 'floor_pct', s.floor_pct,
                                                               'below_floor', s.below_floor, 'window_days', s.window_days, 'state_at', s.state_at, 'digest', s.digest) ORDER BY s.computed_at DESC)
                              FROM (SELECT * FROM products.scorecards x WHERE x.product_id = p_product_id ORDER BY x.computed_at DESC LIMIT 12) s), '[]'::jsonb),
    'consumers', coalesce((SELECT jsonb_agg((to_jsonb(c) - 'scope' - 'tenant_id' - 'domain_id' - 'correlation_id') ORDER BY c.registered_at) FROM products.product_consumers c WHERE c.product_id = p_product_id), '[]'::jsonb),
    'contract_tests', coalesce((SELECT jsonb_agg((to_jsonb(t) - 'scope' - 'tenant_id' - 'domain_id' - 'correlation_id') ORDER BY t.recorded_at DESC) FROM products.contract_tests t WHERE t.product_id = p_product_id), '[]'::jsonb),
    'cost', coalesce((SELECT jsonb_agg(((to_jsonb(k) - 'scope' - 'tenant_id' - 'domain_id' - 'correlation_id') || jsonb_build_object('amount', k.amount::text)) ORDER BY k.period_end DESC, k.attributed_at DESC) FROM products.cost_attributions k WHERE k.product_id = p_product_id), '[]'::jsonb),
    'observations', coalesce((SELECT jsonb_agg((to_jsonb(o) - 'tenant_id' - 'domain_id' - 'correlation_id') ORDER BY o.observed_at DESC)
                                FROM (SELECT * FROM products.slo_observations x WHERE x.product_id = p_product_id ORDER BY x.observed_at DESC LIMIT 50) o), '[]'::jsonb),
    'events', coalesce((SELECT jsonb_agg(jsonb_build_object('event_id', e.event_id, 'event', e.event, 'occurred_at', e.occurred_at, 'actor_principal_id', e.actor_principal_id, 'details', e.details) ORDER BY e.occurred_at DESC)
                          FROM (SELECT * FROM products.product_events x WHERE x.product_id = p_product_id ORDER BY x.occurred_at DESC LIMIT 100) e), '[]'::jsonb))
$$;
GRANT EXECUTE ON FUNCTION products.product_scorecard(uuid) TO eye_app, eye_commit;
