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
