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
                              -- the consumer register is §R's (products.product_consumers); the integrator copies its count and ids here at §I
                              'consumers', jsonb_build_object('count', 0, 'ids', '[]'::jsonb));
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
