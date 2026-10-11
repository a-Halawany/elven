-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0113 — CP-6 B92: PRODUCT ANALYTICS, THE METRIC CATALOG AND UX TELEMETRY (F-P7-F-03: V8 ch.70 PR-70-001..006, AT-70, CAP-DL-11, App M
-- MET-001..040; V9 ch.70 UX-70-001..006, CAP-PD-09; V1 V01-T-040/-046), and the residuals assigned to B92 (B36 §B36.12 row 9: ES-40-008's
-- indicators governed; B90 §B90.9 row 4: DP-44-001 cohorts / relationships / analytical models, DP-44-005 the uses of a withdrawn metric,
-- DP-44-006 the exposure-EUR fixture). 0001–0112 are applied and frozen and untouched.
--
-- §0 PRELUDE — the schema `analytics`, the three roles, the attention vocabulary, the entitlement, the SHARED tables (purposes, scopes, metric
-- definitions and their ledger, the computation registry, results, result records, uses), the uncertainty / window / digest helpers, THE
-- COMPUTE PORT with its two hooks, THE REPLAY PORT and the reads. The parts' PORTS on these tables are theirs (§MD definitions, purposes, scopes,
-- uses; §MC-A / §MC-B the computations; §CO comparability, standing evaluation, cost; §UX experience quality; §OR the operating review).
--
-- THE PRINCIPLES (stated once, enforced by the ports):
--   * humans approve metrics and actions — a named product analytics owner approves a definition, never its proposer, never an agent; a named
--     privacy officer approves a purpose; AI may compute and propose, never approve or decide (PR-70-003, UX-70-004);
--   * no employee-performance inference and no surveillance: no person-grained dimension, no performance purpose, role cohorts only above
--     k distinct principals, telemetry pseudonymous per purpose and per day (PR-70-001/-003, App M header and Balanced use);
--   * missing, insufficient, biased, stale or non-comparable evidence gives an EXPLAINED indeterminate result — never an invented zero or rate
--     (PR-70-005, UX-70-005); a metric with no source in the product is served `unsupported` with its carrier;
--   * every result is traceable and replayable: its definition version and digest, its computation version and digest, its scope version, its
--     window and clock, its as-of, its source revision and the records themselves (App M Audit control).
-- BOUNDARY: the signed acceptance records (AT-70, PR-70-006, UX-70-006) → R2; accessibility conformance → B107/H3; deployment parity → B106;
-- customer onboarding time → B94. A substitute (the synthetic demo mailbox, synthetic NORDWERK records) demonstrates the software and never
-- closes a clause that needs the real integration.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- §0.1 THE SCHEMA ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS analytics;
GRANT USAGE ON SCHEMA analytics TO eye_app, eye_commit;

-- §0.2 THE ROLES (DOMAIN) ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
INSERT INTO identity.roles (code, scope, description) VALUES
  ('product_analytics_owner', 'DOMAIN', 'The product analytics owner (B92; CAP-DL-11''s accountable owner in the domain): approves product metric definitions, scopes, experiments and the actions a finding leads to — a named human, never the proposer, never an agent (PR-70-003, UX-70-004)'),
  ('privacy_officer', 'DOMAIN', 'The privacy officer (B92): approves the purposes product analytics and telemetry may serve and every telemetry event definition (the privacy and minimisation review), and holds or releases collection — a named human, never the proposer'),
  ('product_analyst', 'DOMAIN', 'The product analyst (B92): proposes metric definitions, computes and reviews results, compares cohorts, proposes findings and analyses experiments — approves nothing')
ON CONFLICT (code) DO NOTHING;

-- §0.3 THE ATTENTION VOCABULARY (0111 §0.2's function and both CHECKs, copied whole, plus B92's): analytics.metric (a result needing review: a
-- breached threshold — a review workflow, never an automatic decision — or an unsafe use stopped), analytics.privacy (a privacy or
-- minimisation review: a collection held, a purpose or consent problem), analytics.experience (an experience-quality finding or an
-- invalidated experiment). Subject kinds: metric_definition, metric_result, telemetry_definition, experience_finding, operating_review
-- (`experiment` exists, B31).
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
  'analytics.metric', 'analytics.privacy', 'analytics.experience'] $$;
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
  -- B92 (0113)
  'analytics.metric', 'analytics.privacy', 'analytics.experience'));
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
  'metric_definition', 'metric_result', 'telemetry_definition', 'experience_finding', 'operating_review'));

-- §0.4 THE ENTITLEMENT — `product_analytics` v1 (built; prefixes {analytics.}): product analytics, the metric catalog and UX telemetry are a
-- licensable capability (CAP-DL-11). On a CONTRACTED tenant whose live licence lacks it, every non-exempt `analytics.*` write answers EYE-ENT-001;
-- human-gated acts, reads and corrections stay exempt; an uncontracted tenant is never gated. NORDWERK's licence lacks it — the act's FIRST step
-- is the commercial authority's reissue. SYNTHETIC vendor data, as the 0105 seed. Written once.
DO $$
DECLARE v_reason text := 'B92 (0113 §0.4): product analytics, the governed metric catalog and privacy-minimised UX telemetry are built — product_analytics claims the analytics. action prefix (F-P7-F-03, CAP-DL-11)';
BEGIN
  IF EXISTS (SELECT 1 FROM commercial.capabilities c WHERE c.capability_key = 'product_analytics') THEN RETURN; END IF;
  INSERT INTO commercial.capabilities (capability_key, version, label, description, action_prefixes, included_in, core, entitlement_unit, tier, built, spec_refs,
                                       cannot_remove, status, declared_by, reason, provenance, digest)
  VALUES ('product_analytics', 1, 'Product Analytics and Experience Quality',
          'Governed product metric definitions (MET-001..040), traceable and replayable results with uncertainty and explained indeterminacy, cohort comparison, cost reconciliation, privacy-minimised UX telemetry under purpose and consent, experiments, findings, human-decided actions and the operating review (B92).',
          ARRAY['analytics.'], NULL, false, 'approved purposes and metric definitions', 'multi_domain', true, ARRAY['V8 CAP-DL-11', 'V9 CAP-PD-09', 'F-P7-F-03'],
          'No employee-performance inference; humans approve metrics and actions', 'active', '00000000-0000-0000-0000-000000000000'::uuid, v_reason,
          jsonb_build_object('seeded_by', 'migration 0113 §0.4', 'synthetic', true),
          commercial.cen_digest(jsonb_build_object('key', 'product_analytics', 'version', 1, 'prefixes', to_jsonb(ARRAY['analytics.']), 'core', false, 'included_in', NULL::text,
                                                   'unit', 'approved purposes and metric definitions', 'tier', 'multi_domain', 'status', 'active')));
  INSERT INTO commercial.entitlement_events (event_id, tenant_id, subject_kind, subject_key, version, event, actor, reason, details)
  VALUES (gen_random_uuid(), NULL, 'capability', 'product_analytics', 1, 'capability.declared', '00000000-0000-0000-0000-000000000000'::uuid, v_reason,
          jsonb_build_object('prefixes', to_jsonb(ARRAY['analytics.']), 'built', true, 'seeded', true, 'migration', '0113 §0.4'));
END $$;

-- §0.5 THE VOCABULARY ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* Dimensions that name a PERSON — never a cohort dimension of a product metric, never a grouping of a result (D4). */
CREATE OR REPLACE FUNCTION analytics.person_dimensions() RETURNS text[]
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT ARRAY['principal', 'principal_id', 'person', 'user', 'user_id', 'actor', 'actor_id', 'owner', 'owner_principal_id', 'acknowledged_by', 'approver', 'approved_by',
               'reviewer', 'reviewed_by', 'assignee', 'employee', 'login', 'login_name', 'email', 'display_name', 'decided_by', 'closed_by', 'created_by'] $$;
/* Purposes product analytics may serve (a purpose of another kind — performance evaluation, employee scoring — is refused by the register). */
CREATE OR REPLACE FUNCTION analytics.purpose_kinds() RETURNS text[]
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$ SELECT ARRAY['product_improvement', 'mission_outcome', 'governance', 'reliability', 'cost'] $$;
GRANT EXECUTE ON FUNCTION analytics.person_dimensions(), analytics.purpose_kinds() TO eye_app, eye_commit;

/* The keys of a jsonb object as text[] (usable in a CHECK). */
CREATE OR REPLACE FUNCTION analytics.json_keys(p jsonb) RETURNS text[]
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$ SELECT coalesce(array_agg(k ORDER BY k), '{}') FROM jsonb_object_keys(coalesce(p, '{}'::jsonb)) k $$;
GRANT EXECUTE ON FUNCTION analytics.json_keys(jsonb) TO eye_app, eye_commit;

/* sha256 hex over a jsonb value's canonical text (jsonb's own ordering of keys). */
CREATE OR REPLACE FUNCTION analytics.digest(p jsonb) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = public, pg_catalog, pg_temp AS $$ SELECT encode(sha256(convert_to(coalesce(p, 'null'::jsonb)::text, 'UTF8')), 'hex') $$;
GRANT EXECUTE ON FUNCTION analytics.digest(jsonb) TO eye_app, eye_commit;

/* A NAMED PERIOD → its half-open window [from, to) in UTC: `2026-Q3` (calendar quarter), `2026-09` (calendar month), `R90@2026-10-12`
   (the N days ending with and including that day). NULL rows for anything else. */
CREATE OR REPLACE FUNCTION analytics.period_window(p_period text) RETURNS TABLE (period_kind text, window_from timestamptz, window_to timestamptz)
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
DECLARE m text[]; d date;
BEGIN
  IF p_period ~ '^[0-9]{4}-Q[1-4]$' THEN
    d := make_date(substr(p_period, 1, 4)::int, (substr(p_period, 7, 1)::int - 1) * 3 + 1, 1);
    RETURN QUERY SELECT 'calendar_quarter'::text, (d::timestamp AT TIME ZONE 'UTC'), ((d + interval '3 months')::timestamp AT TIME ZONE 'UTC');
  ELSIF p_period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$' THEN
    d := make_date(substr(p_period, 1, 4)::int, substr(p_period, 6, 2)::int, 1);
    RETURN QUERY SELECT 'calendar_month'::text, (d::timestamp AT TIME ZONE 'UTC'), ((d + interval '1 month')::timestamp AT TIME ZONE 'UTC');
  ELSE
    m := regexp_match(p_period, '^R([0-9]{1,4})@([0-9]{4}-[0-9]{2}-[0-9]{2})$');
    IF m IS NOT NULL AND m[1]::int BETWEEN 1 AND 3660 THEN
      d := m[2]::date;
      RETURN QUERY SELECT 'rolling_days'::text, ((d - (m[1]::int - 1))::timestamp AT TIME ZONE 'UTC'), ((d + 1)::timestamp AT TIME ZONE 'UTC');
    END IF;
  END IF;
END $$;
GRANT EXECUTE ON FUNCTION analytics.period_window(text) TO eye_app, eye_commit;

/* UNCERTAINTY (D6). Wilson's 95 % interval of a proportion k/n; NULL when n = 0. */
CREATE OR REPLACE FUNCTION analytics.wilson(p_k numeric, p_n numeric, p_z numeric DEFAULT 1.959964) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT CASE WHEN p_n IS NULL OR p_n <= 0 OR p_k IS NULL OR p_k < 0 OR p_k > p_n THEN NULL ELSE
    jsonb_build_object('method', 'wilson', 'level', 0.95,
      'lo', round(greatest(0, ((p_k / p_n) + p_z * p_z / (2 * p_n) - p_z * sqrt(((p_k / p_n) * (1 - p_k / p_n) + p_z * p_z / (4 * p_n)) / p_n)) / (1 + p_z * p_z / p_n))::numeric, 6),
      'hi', round(least(1, ((p_k / p_n) + p_z * p_z / (2 * p_n) + p_z * sqrt(((p_k / p_n) * (1 - p_k / p_n) + p_z * p_z / (4 * p_n)) / p_n)) / (1 + p_z * p_z / p_n))::numeric, 6)) END
$$;
/* The distribution-free 95 % interval of a MEDIAN over n sorted values: the 1-based ranks [lo, hi] (binomial order statistics, normal
   approximation); NULL ranks when n < 6 (the interval is unbounded at that size — said, never invented). */
CREATE OR REPLACE FUNCTION analytics.median_ci_ranks(p_n int) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT CASE WHEN p_n IS NULL OR p_n < 6 THEN jsonb_build_object('method', 'order_statistics', 'level', 0.95, 'lo_rank', NULL, 'hi_rank', NULL, 'note', 'n < 6: the interval of the median is unbounded')
    ELSE jsonb_build_object('method', 'order_statistics', 'level', 0.95,
      'lo_rank', greatest(1, floor(p_n / 2.0 - 1.959964 * sqrt(p_n) / 2.0)::int), 'hi_rank', least(p_n, ceil(1 + p_n / 2.0 + 1.959964 * sqrt(p_n) / 2.0)::int)) END
$$;
/* The p-th percentile (0 ≤ p ≤ 1, linear interpolation — percentile_cont) of a set of values; NULL for an empty set. */
CREATE OR REPLACE FUNCTION analytics.percentile(p_values numeric[], p numeric) RETURNS numeric
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT CASE WHEN coalesce(cardinality(p_values), 0) = 0 THEN NULL ELSE (SELECT percentile_cont(p::double precision) WITHIN GROUP (ORDER BY x) FROM unnest(p_values) x)::numeric END
$$;
GRANT EXECUTE ON FUNCTION analytics.wilson(numeric, numeric, numeric), analytics.median_ci_ranks(int), analytics.percentile(numeric[], numeric) TO eye_app, eye_commit;

-- §0.6 THE SHARED TABLES (their ports are the parts') ──────────────────────────────────────────────────────────────────────────────────────
/* THE PURPOSE REGISTER (PR-70-003, UX-70-002 `purpose`): what product analytics and telemetry may serve. Versioned; proposed by an analyst or
   the owner, APPROVED by a named privacy officer (never the proposer); retired. purpose_kind ∈ analytics.purpose_kinds() — never performance
   evaluation. retention_days bounds the raw telemetry collected under it (§UX's purge). §MD's ports. */
CREATE TABLE analytics.purposes (
  purpose_id      uuid PRIMARY KEY,
  scope           text NOT NULL,
  tenant_id       uuid NOT NULL,
  domain_id       uuid NOT NULL,
  purpose_key     text NOT NULL CHECK (purpose_key ~ '^[a-z][a-z0-9_.-]{2,62}$'),
  version         int  NOT NULL CHECK (version >= 1),
  title           text NOT NULL CHECK (length(btrim(title)) BETWEEN 4 AND 200),
  purpose_kind    text NOT NULL,
  description     text NOT NULL CHECK (length(btrim(description)) BETWEEN 16 AND 4000),
  retention_days  int  NOT NULL CHECK (retention_days BETWEEN 1 AND 3660),
  state           text NOT NULL DEFAULT 'proposed' CHECK (state IN ('proposed', 'approved', 'rejected', 'superseded', 'retired')),
  digest          text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  proposed_by     uuid NOT NULL,
  proposed_at     timestamptz NOT NULL DEFAULT clock_timestamp(),
  decided_by      uuid,
  decided_at      timestamptz,
  decision_reason text,
  retired_by      uuid,
  retired_at      timestamptz,
  retire_reason   text,
  correlation_id  uuid NOT NULL,
  CONSTRAINT apu_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT apu_kind CHECK (purpose_kind = ANY (analytics.purpose_kinds())),
  CONSTRAINT apu_version_once UNIQUE (tenant_id, domain_id, purpose_key, version),
  CONSTRAINT apu_decided CHECK (state = 'proposed' OR state = 'retired' OR (decided_by IS NOT NULL AND decided_at IS NOT NULL)),
  CONSTRAINT apu_sod CHECK (decided_by IS NULL OR decided_by <> proposed_by),
  CONSTRAINT apu_retired CHECK ((state = 'retired') = (retired_at IS NOT NULL))
);
CREATE UNIQUE INDEX apu_one_approved ON analytics.purposes (tenant_id, domain_id, purpose_key) WHERE state = 'approved';

/* THE SCOPE REGISTER (D8): a named, versioned, APPROVED population scope — "the corridor" — the entities, objectives, series and geographies a
   computation restricts to. Approved by a product analytics owner. §MD's ports. */
CREATE TABLE analytics.scopes (
  scope_id        uuid PRIMARY KEY,
  scope           text NOT NULL,
  tenant_id       uuid NOT NULL,
  domain_id       uuid NOT NULL,
  scope_key       text NOT NULL CHECK (scope_key ~ '^[a-z][a-z0-9_.-]{2,62}$'),
  version         int  NOT NULL CHECK (version >= 1),
  title           text NOT NULL CHECK (length(btrim(title)) BETWEEN 4 AND 200),
  entity_ids      uuid[] NOT NULL DEFAULT '{}',
  objective_ids   uuid[] NOT NULL DEFAULT '{}',
  series_keys     text[] NOT NULL DEFAULT '{}',
  geographies     text[] NOT NULL DEFAULT '{}',
  description     text NOT NULL CHECK (length(btrim(description)) BETWEEN 8 AND 2000),
  state           text NOT NULL DEFAULT 'proposed' CHECK (state IN ('proposed', 'approved', 'rejected', 'superseded', 'retired')),
  digest          text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  proposed_by     uuid NOT NULL,
  proposed_at     timestamptz NOT NULL DEFAULT clock_timestamp(),
  decided_by      uuid,
  decided_at      timestamptz,
  decision_reason text,
  retired_at      timestamptz,
  correlation_id  uuid NOT NULL,
  CONSTRAINT asc_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT asc_version_once UNIQUE (tenant_id, domain_id, scope_key, version),
  CONSTRAINT asc_nonempty CHECK (cardinality(entity_ids) + cardinality(objective_ids) + cardinality(series_keys) + cardinality(geographies) > 0),
  CONSTRAINT asc_sod CHECK (decided_by IS NULL OR decided_by <> proposed_by)
);
CREATE UNIQUE INDEX asc_one_approved ON analytics.scopes (tenant_id, domain_id, scope_key) WHERE state = 'approved';

/* THE METRIC DEFINITIONS (D2; PR-70-002, App M Contract): one row per (key, version); the CONTRACT digested; draft → proposed → approved
   (one approved version per key per domain) → superseded | retired; rejected. A definition with no computation in the product is
   `supported = false` with its reason and carrier — computed `unsupported`, visible, never silently missing (Balanced use). §MD's ports
   write it (and its guard is §MD's); the compute port READS it. */
CREATE TABLE analytics.metric_definitions (
  definition_id     uuid PRIMARY KEY,
  scope             text NOT NULL,
  tenant_id         uuid NOT NULL,
  domain_id         uuid NOT NULL,
  metric_key        text NOT NULL CHECK (metric_key ~ '^[A-Z][A-Z0-9]{1,9}-[A-Za-z0-9.-]{1,40}$'),
  version           int  NOT NULL CHECK (version >= 1),
  title             text NOT NULL CHECK (length(btrim(title)) BETWEEN 4 AND 200),
  meaning           text NOT NULL CHECK (length(btrim(meaning)) BETWEEN 8 AND 2000),
  kind              text NOT NULL CHECK (kind IN ('rate', 'duration', 'ratio', 'count', 'score')),
  unit              text NOT NULL CHECK (length(btrim(unit)) BETWEEN 1 AND 40),
  direction         text NOT NULL CHECK (direction IN ('higher', 'lower', 'band', 'track')),
  population        jsonb NOT NULL CHECK (jsonb_typeof(population) = 'object'),
  numerator         text,
  denominator       text,
  exclusions        jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(exclusions) = 'array'),
  window_spec       jsonb NOT NULL CHECK (jsonb_typeof(window_spec) = 'object' AND window_spec ->> 'kind' IN ('calendar_quarter', 'calendar_month', 'rolling_days')
                                          AND coalesce(window_spec ->> 'clock', 'record') IN ('record', 'world')),
  dimensions        text[] NOT NULL DEFAULT '{}',
  privacy_class     text NOT NULL CHECK (privacy_class IN ('aggregate', 'pseudonymous_cohort')),
  k_min             int  NOT NULL DEFAULT 5 CHECK (k_min >= 5),
  floor_n           int  NOT NULL CHECK (floor_n >= 1),
  threshold         jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(threshold) = 'object'),
  purpose_key       text NOT NULL,
  serves            jsonb NOT NULL CHECK (jsonb_typeof(serves) = 'object'),
  cadence           text NOT NULL CHECK (length(btrim(cadence)) BETWEEN 3 AND 60),
  owner_principal_id uuid NOT NULL,
  action            text NOT NULL CHECK (length(btrim(action)) >= 8),
  retirement        text NOT NULL CHECK (length(btrim(retirement)) >= 8),
  quality           jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(quality) = 'object'),
  cost_allocation   jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(cost_allocation) = 'object'),
  computation_key   text,
  params            jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(params) = 'object'),
  supported         boolean NOT NULL,
  unsupported_reason text,
  source_refs       text[] NOT NULL DEFAULT '{}',
  state             text NOT NULL DEFAULT 'proposed' CHECK (state IN ('draft', 'proposed', 'approved', 'rejected', 'superseded', 'retired')),
  digest            text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  proposed_by       uuid NOT NULL,
  proposed_by_kind  text NOT NULL,
  proposed_at       timestamptz NOT NULL DEFAULT clock_timestamp(),
  decided_by        uuid,
  decided_at        timestamptz,
  decision_reason   text,
  effective_from    timestamptz,
  superseded_at     timestamptz,
  retired_by        uuid,
  retired_at        timestamptz,
  retire_reason     text,
  correlation_id    uuid NOT NULL,
  CONSTRAINT amd_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT amd_version_once UNIQUE (tenant_id, domain_id, metric_key, version),
  CONSTRAINT amd_no_person_dimension CHECK (NOT (dimensions && analytics.person_dimensions())),
  CONSTRAINT amd_supported CHECK (supported = (computation_key IS NOT NULL) AND (supported OR length(btrim(coalesce(unsupported_reason, ''))) >= 8)),
  CONSTRAINT amd_rate_parts CHECK (kind <> 'rate' OR (numerator IS NOT NULL AND denominator IS NOT NULL)),
  CONSTRAINT amd_decided CHECK (state IN ('draft', 'proposed', 'retired') OR (decided_by IS NOT NULL AND decided_at IS NOT NULL)),
  CONSTRAINT amd_sod CHECK (decided_by IS NULL OR decided_by <> proposed_by),
  CONSTRAINT amd_effective CHECK (state NOT IN ('approved', 'superseded') OR effective_from IS NOT NULL),
  CONSTRAINT amd_retired CHECK ((state = 'retired') = (retired_at IS NOT NULL) AND (retired_at IS NULL) = (retire_reason IS NULL))
);
CREATE UNIQUE INDEX amd_one_approved ON analytics.metric_definitions (tenant_id, domain_id, metric_key) WHERE state = 'approved';
CREATE INDEX amd_lookup ON analytics.metric_definitions (tenant_id, domain_id, metric_key, version DESC);

/* THE DEFINITIONS' LEDGER (append-only): every governed act on a purpose, a scope or a definition (proposed, approved, rejected, superseded,
   retired, catalogued, use recorded …). The parts write it through their ports. */
CREATE TABLE analytics.definition_events (
  event_id        uuid PRIMARY KEY,
  scope           text NOT NULL,
  tenant_id       uuid NOT NULL,
  domain_id       uuid NOT NULL,
  subject_kind    text NOT NULL CHECK (subject_kind IN ('purpose', 'scope', 'definition', 'result', 'use', 'comparison', 'reconciliation', 'semantic_object')),
  subject_id      uuid NOT NULL,
  subject_key     text,
  version         int,
  event           text NOT NULL CHECK (event ~ '^[a-z_]+\.[a-z_.]+$'),
  actor_principal_id uuid NOT NULL,
  details         jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at     timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id  uuid NOT NULL,
  CONSTRAINT ade_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX ade_subject ON analytics.definition_events (subject_id, occurred_at);

/* THE COMPUTATION REGISTRY (D10): one row per computation the parts provide (a SECURITY DEFINER SQL function of the §0.7 contract). Global (not
   tenant data): written by migrations only; the function's body digest is recorded at registration and checked by the compute port (a
   re-declared computation is a new version — a result names the digest it ran). */
CREATE TABLE analytics.computation_registry (
  computation_key text PRIMARY KEY CHECK (computation_key ~ '^[a-z][a-z0-9_]{2,62}$'),
  function_name   text NOT NULL CHECK (function_name ~ '^analytics\.mc_[a-z0-9_]{2,62}$'),
  version         int  NOT NULL CHECK (version >= 1),
  kind            text NOT NULL CHECK (kind IN ('rate', 'duration', 'ratio', 'count', 'score')),
  dimensions      text[] NOT NULL DEFAULT '{}',
  reads           text[] NOT NULL,
  scope_rule      text NOT NULL CHECK (length(btrim(scope_rule)) >= 8),
  description     text NOT NULL CHECK (length(btrim(description)) >= 8),
  body_digest     text NOT NULL CHECK (body_digest ~ '^[0-9a-f]{32}$'),
  registered_in   text NOT NULL,
  registered_at   timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT acr_no_person_dimension CHECK (NOT (dimensions && analytics.person_dimensions()))
);
/* Register (or re-register on a new version) a computation: the function must exist; its body digest (md5 of pg_get_functiondef) is taken
   now. Called by the parts' migration sections only (no runtime grant). */
CREATE OR REPLACE FUNCTION analytics.register_computation(p_key text, p_function text, p_kind text, p_dimensions text[], p_reads text[], p_scope_rule text, p_description text, p_registered_in text)
RETURNS void LANGUAGE plpgsql SET search_path = analytics, pg_catalog, pg_temp AS $$
DECLARE v_digest text; v_prev analytics.computation_registry%ROWTYPE;
BEGIN
  v_digest := md5(pg_get_functiondef(to_regprocedure(p_function || '(uuid,uuid,timestamptz,timestamptz,timestamptz,jsonb,jsonb,jsonb)')));
  IF v_digest IS NULL THEN RAISE EXCEPTION 'computation % names % with the §0.7 signature, which does not exist', p_key, p_function; END IF;
  SELECT * INTO v_prev FROM analytics.computation_registry WHERE computation_key = p_key;
  IF FOUND AND v_prev.body_digest = v_digest AND v_prev.function_name = p_function THEN RETURN; END IF;
  INSERT INTO analytics.computation_registry (computation_key, function_name, version, kind, dimensions, reads, scope_rule, description, body_digest, registered_in)
  VALUES (p_key, p_function, coalesce(v_prev.version, 0) + 1, p_kind, coalesce(p_dimensions, '{}'), p_reads, p_scope_rule, p_description, v_digest, p_registered_in)
  ON CONFLICT (computation_key) DO UPDATE SET function_name = EXCLUDED.function_name, version = EXCLUDED.version, kind = EXCLUDED.kind, dimensions = EXCLUDED.dimensions,
    reads = EXCLUDED.reads, scope_rule = EXCLUDED.scope_rule, description = EXCLUDED.description, body_digest = EXCLUDED.body_digest, registered_in = EXCLUDED.registered_in,
    registered_at = clock_timestamp();
END $$;
REVOKE ALL ON FUNCTION analytics.register_computation(text, text, text, text[], text[], text, text, text) FROM PUBLIC;

/* THE RESULTS (D5, D6, D11): append-only. state determinate (value set) | indeterminate (value NULL, reasons) | unsupported (value NULL, the
   definition's reason). preview = computed on a PROPOSED definition for its review — never served as current (§OR refuses it). The source
   revision is sha256 over the records (kind, id, role) in order; replay_of / replay_verdict name a replay (§0.8). */
CREATE TABLE analytics.metric_results (
  result_id          uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  definition_id      uuid NOT NULL REFERENCES analytics.metric_definitions (definition_id),
  metric_key         text NOT NULL,
  definition_version int  NOT NULL,
  definition_digest  text NOT NULL,
  preview            boolean NOT NULL DEFAULT false,
  scope_id           uuid REFERENCES analytics.scopes (scope_id),
  scope_key          text,
  scope_version      int,
  period_key         text NOT NULL,
  period_kind        text NOT NULL,
  window_from        timestamptz NOT NULL,
  window_to          timestamptz NOT NULL,
  clock              text NOT NULL CHECK (clock IN ('record', 'world')),
  cohort             jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(cohort) = 'object'),
  as_of              timestamptz NOT NULL,
  state              text NOT NULL CHECK (state IN ('determinate', 'indeterminate', 'unsupported')),
  kind               text NOT NULL,
  unit               text NOT NULL,
  value              numeric,
  numerator          numeric,
  denominator        numeric,
  n                  int,
  distribution       jsonb,
  uncertainty        jsonb,
  reasons            jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(reasons) = 'array'),
  quality            jsonb NOT NULL DEFAULT '{}'::jsonb,
  evaluation         jsonb NOT NULL DEFAULT '{}'::jsonb,
  threshold_eval     jsonb,
  computation_key    text,
  computation_version int,
  computation_digest text,
  source_revision    text NOT NULL CHECK (source_revision ~ '^[0-9a-f]{64}$'),
  records_count      int NOT NULL DEFAULT 0,
  replay_of          uuid REFERENCES analytics.metric_results (result_id),
  replay_verdict     text CHECK (replay_verdict IS NULL OR replay_verdict IN ('reproduced', 'mismatch')),
  computed_by        uuid NOT NULL,
  computed_by_kind   text NOT NULL,
  computed_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT amr_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT amr_value_state CHECK ((state = 'determinate') = (value IS NOT NULL)),
  CONSTRAINT amr_reasons_state CHECK (state = 'determinate' OR jsonb_array_length(reasons) >= 1),
  CONSTRAINT amr_window CHECK (window_to > window_from),
  CONSTRAINT amr_replay CHECK ((replay_of IS NULL) = (replay_verdict IS NULL)),
  CONSTRAINT amr_no_person_cohort CHECK (NOT (analytics.json_keys(cohort) && analytics.person_dimensions()))
);
CREATE INDEX amr_lookup ON analytics.metric_results (tenant_id, domain_id, metric_key, period_key, computed_at DESC);

/* THE RECORDS each result rests on (traceability, D11): role numerator (in the population and meeting the numerator) | denominator (in the
   population, not meeting it) | included (in the population of a duration/count/score; detail.value carries its measured value) | excluded
   (with its reason) | context. Append-only. */
CREATE TABLE analytics.result_records (
  result_id   uuid NOT NULL REFERENCES analytics.metric_results (result_id),
  ordinal     int  NOT NULL,
  tenant_id   uuid NOT NULL,
  domain_id   uuid NOT NULL,
  record_kind text NOT NULL CHECK (record_kind ~ '^[a-z][a-z0-9_]{1,62}$'),
  record_id   text NOT NULL CHECK (length(record_id) BETWEEN 1 AND 200),
  role        text NOT NULL CHECK (role IN ('numerator', 'denominator', 'included', 'excluded', 'context')),
  reason      text,
  detail      jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(detail) = 'object'),
  PRIMARY KEY (result_id, ordinal),
  CONSTRAINT arr_excluded_reason CHECK (role <> 'excluded' OR length(btrim(coalesce(reason, ''))) >= 4)
);
CREATE INDEX arr_record ON analytics.result_records (record_kind, record_id);

/* THE USES of a result (DP-44-005's idiom for product metrics; PR-70-002 `decision`): where a result was cited — an operating review, a
   decision package, a briefing, a publication, an export. Withdrawal or retirement of the definition lists them (§MD). Append-only. */
CREATE TABLE analytics.metric_uses (
  use_id         uuid PRIMARY KEY,
  scope          text NOT NULL,
  tenant_id      uuid NOT NULL,
  domain_id      uuid NOT NULL,
  result_id      uuid NOT NULL REFERENCES analytics.metric_results (result_id),
  used_in_kind   text NOT NULL CHECK (used_in_kind IN ('operating_review', 'decision_package', 'briefing', 'publication', 'export', 'finding')),
  used_in_id     uuid NOT NULL,
  note           text,
  used_by        uuid NOT NULL,
  used_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id uuid NOT NULL,
  CONSTRAINT amu_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT amu_once UNIQUE (result_id, used_in_kind, used_in_id)
);

CREATE TRIGGER ade_append_only BEFORE UPDATE OR DELETE ON analytics.definition_events FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
CREATE TRIGGER amr_append_only BEFORE UPDATE OR DELETE ON analytics.metric_results FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
CREATE TRIGGER arr_append_only BEFORE UPDATE OR DELETE ON analytics.result_records FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
CREATE TRIGGER amu_append_only BEFORE UPDATE OR DELETE ON analytics.metric_uses FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

-- RLS and grants (the 0081 loop idiom): SELECT to eye_app and eye_commit under domain isolation; no write grant — the definer ports write.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['purposes', 'scopes', 'metric_definitions', 'definition_events', 'metric_results', 'result_records', 'metric_uses'] LOOP
    EXECUTE format('REVOKE ALL ON analytics.%I FROM PUBLIC', t);
    EXECUTE format('ALTER TABLE analytics.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE analytics.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY domain_isolation ON analytics.%I
        USING (
          tenant_id = public.eye_tenant()
          AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain())
        )$f$, t);
    EXECUTE format('GRANT SELECT ON analytics.%I TO eye_app, eye_commit', t);
  END LOOP;
END $$;
REVOKE ALL ON analytics.computation_registry FROM PUBLIC;
GRANT SELECT ON analytics.computation_registry TO eye_app, eye_commit;

-- §0.7 THE COMPUTATION CONTRACT AND THE COMPUTE PORT ──────────────────────────────────────────────────────────────────────────────────────
/* THE CONTRACT every computation keeps (D10):
     analytics.mc_<name>(p_tenant uuid, p_domain uuid, p_from timestamptz, p_to timestamptz, p_as_of timestamptz,
                         p_scope jsonb, p_cohort jsonb, p_params jsonb) RETURNS jsonb
   SECURITY DEFINER, `PERFORM observation.assert_read_scope(p_tenant, p_domain, '<what>')` first (N-01); reads ONLY rows recorded at or before
   p_as_of (replay) and inside [p_from, p_to) on the definition's clock (p_params.clock: record | world); applies p_scope (NULL = the domain;
   else {scope_key, version, entity_ids[], objective_ids[], series_keys[], geographies[]}) by its registered scope_rule; restricts to p_cohort
   ({dim: value} over its registered dimensions — NEVER a person); returns
     { "kind": rate|duration|ratio|count|score,
       "numerator": <number|null>, "denominator": <number|null>,      -- rate: the counts; ratio: the two sums
       "value": <number|null>,                                         -- ratio / score only (rate and duration are the port's)
       "distinct_actors": <int|null>,                                  -- the distinct principals behind a role cohort (k-anonymity), never their ids
       "records": [ {"kind", "id", "role": numerator|denominator|included|excluded|context, "reason"?, "detail"?: {"value"?: <seconds…>, …}} ],
       "reasons": [ "<why the result cannot be determinate>" … ],     -- definitional indeterminacy: an absent input, mixed clocks …
       "quality": { "clock", "synthetic_share"?, "replay_share"?, "notes"?: [] } }
   The port derives n, the value, the distribution and the uncertainty from the RECORDS (rate: numerator ÷ (numerator + denominator) records,
   cross-checked against the returned counts; duration: the included records' detail.value, seconds), applies the floor, k and the reasons. */

/* HOOK 1 — the standing evaluation of a draft result BEFORE it is written (§CO re-declares it, copied whole): stale, biased, gamed,
   privacy-invasive, non-comparable or outcome-detached → reasons that make the result indeterminate; checks for the record. */
CREATE OR REPLACE FUNCTION analytics.evaluate_result(p_draft jsonb) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = analytics, pg_catalog, pg_temp AS $$ SELECT jsonb_build_object('reasons', '[]'::jsonb, 'checks', '[]'::jsonb, 'by', 'prelude (no standing evaluation installed)') $$;
REVOKE ALL ON FUNCTION analytics.evaluate_result(jsonb) FROM PUBLIC;
/* HOOK 2 — after a result is written (§CO re-declares it, copied whole): route a breached threshold as a REVIEW (analytics.metric, never an
   automatic decision), stop unsafe use, meter the computation's cost. Returns what it did. */
CREATE OR REPLACE FUNCTION analytics.after_result(p_result uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE sql SET search_path = analytics, pg_catalog, pg_temp AS $$ SELECT jsonb_build_object('routed', NULL, 'by', 'prelude (no after-result step installed)') $$;
REVOKE ALL ON FUNCTION analytics.after_result(uuid, uuid, uuid) FROM PUBLIC;

/* The definition a computation is asked for: the APPROVED version, or — p_preview — the latest proposed or approved version (a preview result
   is marked and never served as current). */
CREATE OR REPLACE FUNCTION analytics.amc_definition(p_tenant uuid, p_domain uuid, p_key text, p_preview boolean) RETURNS analytics.metric_definitions
LANGUAGE plpgsql STABLE SET search_path = analytics, pg_catalog, pg_temp AS $$
DECLARE d analytics.metric_definitions%ROWTYPE;
BEGIN
  IF coalesce(p_preview, false) THEN
    SELECT * INTO d FROM analytics.metric_definitions x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.metric_key = p_key AND x.state IN ('proposed', 'approved')
     ORDER BY x.version DESC LIMIT 1;
  ELSE
    SELECT * INTO d FROM analytics.metric_definitions x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.metric_key = p_key AND x.state = 'approved';
  END IF;
  RETURN d;
END $$;
REVOKE ALL ON FUNCTION analytics.amc_definition(uuid, uuid, text, boolean) FROM PUBLIC;

/* THE COMPUTE BODY (internal; shared by the compute and the replay ports): runs the definition's computation over the window, derives the
   value and its uncertainty, applies the floor, k, the reasons and the standing evaluation, writes the result and its records, calls hook 2. */
CREATE OR REPLACE FUNCTION analytics.amc_compute(p_result uuid, d analytics.metric_definitions, p_scope analytics.scopes, p_period text, p_cohort jsonb, p_as_of timestamptz,
                                                  p_preview boolean, p_replay_of uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SET search_path = analytics, observation, pg_catalog, pg_temp AS $$
DECLARE w record; reg analytics.computation_registry%ROWTYPE; out jsonb := NULL; v_reasons jsonb := '[]'::jsonb; v_state text; v_value numeric; v_num numeric; v_den numeric;
        v_n int; v_dist jsonb := NULL; v_unc jsonb := NULL; v_vals numeric[]; v_ranks jsonb; v_rec jsonb; v_i int := 0; v_rev text; v_eval jsonb; v_thr jsonb := NULL;
        v_scope jsonb := NULL; v_clock text := coalesce(d.window_spec ->> 'clock', 'record'); v_digest text; v_after jsonb; v_cnt_num int; v_cnt_den int; v_k int; v_verdict text;
BEGIN
  SELECT * INTO w FROM analytics.period_window(p_period);
  IF w.window_from IS NULL THEN RAISE EXCEPTION 'metric computation rejected (period): % is not a period (2026-Q3, 2026-09 or R90@2026-10-12)', p_period USING ERRCODE = '22023'; END IF;
  IF p_scope.scope_id IS NOT NULL THEN
    v_scope := jsonb_build_object('scope_key', p_scope.scope_key, 'version', p_scope.version, 'entity_ids', to_jsonb(p_scope.entity_ids), 'objective_ids', to_jsonb(p_scope.objective_ids),
                                  'series_keys', to_jsonb(p_scope.series_keys), 'geographies', to_jsonb(p_scope.geographies));
  END IF;
  IF w.window_to > p_as_of THEN
    v_reasons := v_reasons || to_jsonb(format('the period %s is open until %s (as of %s): a partial period is not presented as the period', p_period, w.window_to, p_as_of));
  END IF;
  IF NOT d.supported THEN
    v_state := 'unsupported'; v_reasons := jsonb_build_array(format('unsupported: %s', d.unsupported_reason)) || v_reasons; v_n := NULL;
  ELSE
    SELECT * INTO reg FROM analytics.computation_registry r WHERE r.computation_key = d.computation_key;
    IF NOT FOUND THEN RAISE EXCEPTION 'metric computation rejected (computation): % names the computation %, which is not registered', d.metric_key, d.computation_key USING ERRCODE = '22023'; END IF;
    v_digest := md5(pg_get_functiondef(to_regprocedure(reg.function_name || '(uuid,uuid,timestamptz,timestamptz,timestamptz,jsonb,jsonb,jsonb)')));
    IF v_digest IS DISTINCT FROM reg.body_digest THEN
      RAISE EXCEPTION 'metric computation rejected (computation): the body of % no longer matches its registration (%); it is re-registered as a new version first', reg.function_name, reg.body_digest USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_object_keys(coalesce(p_cohort, '{}'::jsonb)) k WHERE NOT (k = ANY (d.dimensions)) OR NOT (k = ANY (reg.dimensions))) THEN
      RAISE EXCEPTION 'metric computation rejected (dimension): the cohort % uses a dimension outside the definition''s (%) and the computation''s (%)', p_cohort,
        array_to_string(d.dimensions, ', '), array_to_string(reg.dimensions, ', ') USING ERRCODE = '22023';
    END IF;
    EXECUTE format('SELECT %s($1, $2, $3, $4, $5, $6, $7, $8)', reg.function_name) INTO out
      USING d.tenant_id, d.domain_id, w.window_from, w.window_to, p_as_of, v_scope, coalesce(p_cohort, '{}'::jsonb), d.params || jsonb_build_object('clock', v_clock);
    IF out IS NULL OR jsonb_typeof(out) <> 'object' OR jsonb_typeof(out -> 'records') IS DISTINCT FROM 'array' OR out ->> 'kind' IS DISTINCT FROM d.kind THEN
      RAISE EXCEPTION 'metric computation rejected (computation): % returned no result of the contract (kind %, records[])', reg.function_name, d.kind USING ERRCODE = '22023';
    END IF;
    v_reasons := v_reasons || coalesce(out -> 'reasons', '[]'::jsonb);
    SELECT count(*) FILTER (WHERE r ->> 'role' = 'numerator'), count(*) FILTER (WHERE r ->> 'role' = 'denominator') INTO v_cnt_num, v_cnt_den FROM jsonb_array_elements(out -> 'records') r;
    IF d.kind = 'rate' THEN
      v_num := v_cnt_num; v_den := v_cnt_num + v_cnt_den; v_n := v_den::int;
      IF (out ->> 'numerator') IS NOT NULL AND ((out ->> 'numerator')::numeric <> v_num OR (out ->> 'denominator')::numeric <> v_den) THEN
        RAISE EXCEPTION 'metric computation rejected (computation): % counted %/% but its records say %/%', reg.function_name, out ->> 'numerator', out ->> 'denominator', v_num, v_den USING ERRCODE = '22023';
      END IF;
      IF v_den > 0 THEN v_value := round(v_num / v_den, 6); v_unc := analytics.wilson(v_num, v_den); END IF;
    ELSIF d.kind = 'duration' THEN
      SELECT array_agg((r -> 'detail' ->> 'value')::numeric ORDER BY (r -> 'detail' ->> 'value')::numeric) INTO v_vals FROM jsonb_array_elements(out -> 'records') r
       WHERE r ->> 'role' = 'included' AND (r -> 'detail' ->> 'value') IS NOT NULL;
      v_n := coalesce(cardinality(v_vals), 0);
      IF v_n > 0 THEN
        v_value := round(analytics.percentile(v_vals, 0.5), 3);
        v_ranks := analytics.median_ci_ranks(v_n);
        v_dist := jsonb_build_object('p50', v_value, 'p90', round(analytics.percentile(v_vals, 0.9), 3), 'min', v_vals[1], 'max', v_vals[v_n], 'n', v_n);
        v_unc := v_ranks || CASE WHEN (v_ranks ->> 'lo_rank') IS NOT NULL THEN jsonb_build_object('lo', v_vals[(v_ranks ->> 'lo_rank')::int], 'hi', v_vals[(v_ranks ->> 'hi_rank')::int]) ELSE '{}'::jsonb END;
      END IF;
    ELSE
      v_n := (SELECT count(*) FROM jsonb_array_elements(out -> 'records') r WHERE r ->> 'role' IN ('numerator', 'denominator', 'included'))::int;
      v_num := (out ->> 'numerator')::numeric; v_den := (out ->> 'denominator')::numeric;
      v_value := CASE d.kind WHEN 'count' THEN v_n WHEN 'ratio' THEN CASE WHEN coalesce(v_den, 0) <> 0 THEN round(v_num / v_den, 6) ELSE (out ->> 'value')::numeric END
                             ELSE (out ->> 'value')::numeric END;
    END IF;
    IF v_n IS NOT NULL AND v_n < d.floor_n THEN
      v_reasons := v_reasons || to_jsonb(format('n = %s is below the floor %s the definition declares: the sample cannot carry a determinate value', v_n, d.floor_n));
    END IF;
    v_k := (out ->> 'distinct_actors')::int;
    IF v_k IS NOT NULL AND v_k < d.k_min THEN
      v_reasons := v_reasons || to_jsonb(format('the cohort rests on %s distinct principals, below k = %s: it is not shown (no person is singled out)', v_k, d.k_min));
    END IF;
    IF v_value IS NULL AND jsonb_array_length(v_reasons) = 0 THEN
      v_reasons := v_reasons || to_jsonb('no record in the population for this window and scope — nothing to measure, not a measured zero'::text);
    END IF;
  END IF;
  v_eval := analytics.evaluate_result(jsonb_build_object('metric_key', d.metric_key, 'definition_id', d.definition_id, 'definition_version', d.version, 'period', p_period,
              'window_from', w.window_from, 'window_to', w.window_to, 'as_of', p_as_of, 'scope', v_scope, 'cohort', coalesce(p_cohort, '{}'::jsonb), 'n', v_n, 'value', v_value,
              'quality', coalesce(out -> 'quality', '{}'::jsonb), 'records_count', coalesce(jsonb_array_length(out -> 'records'), 0), 'tenant_id', d.tenant_id, 'domain_id', d.domain_id));
  v_reasons := v_reasons || coalesce(v_eval -> 'reasons', '[]'::jsonb);
  IF v_state IS NULL THEN v_state := CASE WHEN jsonb_array_length(v_reasons) = 0 AND v_value IS NOT NULL THEN 'determinate' ELSE 'indeterminate' END; END IF;
  IF v_state <> 'determinate' THEN v_value := NULL; END IF;
  IF v_state = 'determinate' AND d.threshold <> '{}'::jsonb THEN
    v_thr := jsonb_build_object('threshold', d.threshold, 'breach',
      CASE WHEN d.threshold ? 'band' THEN v_value < (d.threshold -> 'band' ->> 0)::numeric OR v_value > (d.threshold -> 'band' ->> 1)::numeric
           WHEN d.threshold ? 'target' AND d.direction = 'higher' THEN v_value < (d.threshold ->> 'target')::numeric
           WHEN d.threshold ? 'target' AND d.direction = 'lower' THEN v_value > (d.threshold ->> 'target')::numeric
           ELSE NULL END, 'action', d.action);
  END IF;
  v_rev := analytics.digest(coalesce((SELECT jsonb_agg(jsonb_build_array(r ->> 'kind', r ->> 'id', r ->> 'role') ORDER BY o) FROM jsonb_array_elements(out -> 'records') WITH ORDINALITY AS t(r, o)), '[]'::jsonb));
  IF p_replay_of IS NOT NULL THEN   -- a replay: the verdict against its original, decided before the row is written (results are append-only)
    SELECT CASE WHEN o.source_revision = v_rev AND o.value IS NOT DISTINCT FROM v_value AND o.state = v_state THEN 'reproduced' ELSE 'mismatch' END INTO v_verdict
      FROM analytics.metric_results o WHERE o.result_id = p_replay_of;
  END IF;
  INSERT INTO analytics.metric_results (result_id, scope, tenant_id, domain_id, definition_id, metric_key, definition_version, definition_digest, preview, scope_id, scope_key, scope_version,
                                        period_key, period_kind, window_from, window_to, clock, cohort, as_of, state, kind, unit, value, numerator, denominator, n, distribution, uncertainty,
                                        reasons, quality, evaluation, threshold_eval, computation_key, computation_version, computation_digest, source_revision, records_count,
                                        replay_of, replay_verdict, computed_by, computed_by_kind, correlation_id)
  VALUES (p_result, 'DOMAIN', d.tenant_id, d.domain_id, d.definition_id, d.metric_key, d.version, d.digest, coalesce(p_preview, false), p_scope.scope_id, p_scope.scope_key, p_scope.version,
          p_period, w.period_kind, w.window_from, w.window_to, v_clock, coalesce(p_cohort, '{}'::jsonb), p_as_of, v_state, d.kind, d.unit, v_value,
          CASE WHEN v_state = 'unsupported' THEN NULL ELSE v_num END, CASE WHEN v_state = 'unsupported' THEN NULL ELSE v_den END, v_n, v_dist, v_unc,
          v_reasons, coalesce(out -> 'quality', '{}'::jsonb), coalesce(v_eval, '{}'::jsonb), v_thr, reg.computation_key, reg.version, reg.body_digest, v_rev,
          coalesce(jsonb_array_length(out -> 'records'), 0), p_replay_of, v_verdict, p_actor,
          coalesce((SELECT p.kind FROM identity.principals p WHERE p.id = p_actor), 'system'), p_correlation);
  FOR v_rec IN SELECT * FROM jsonb_array_elements(coalesce(out -> 'records', '[]'::jsonb)) LOOP
    v_i := v_i + 1;
    INSERT INTO analytics.result_records (result_id, ordinal, tenant_id, domain_id, record_kind, record_id, role, reason, detail)
    VALUES (p_result, v_i, d.tenant_id, d.domain_id, v_rec ->> 'kind', v_rec ->> 'id', v_rec ->> 'role', v_rec ->> 'reason', coalesce(v_rec -> 'detail', '{}'::jsonb));
  END LOOP;
  v_after := analytics.after_result(p_result, p_actor, p_correlation);
  RETURN (SELECT to_jsonb(x) FROM analytics.metric_results x WHERE x.result_id = p_result) || jsonb_build_object('after', v_after);
END $$;
REVOKE ALL ON FUNCTION analytics.amc_compute(uuid, analytics.metric_definitions, analytics.scopes, text, jsonb, timestamptz, boolean, uuid, uuid, uuid) FROM PUBLIC;

/* COMPUTE (analytics.metric.compute — an analyst, the owner, or an agent: AI may compute). The approved definition (or, p_preview, the proposed
   one for its review); the approved scope; the named period; the cohort; the as-of (default now; never in the future). */
CREATE OR REPLACE FUNCTION analytics.compute_metric(p_result uuid, p_tenant uuid, p_domain uuid, p_metric_key text, p_period text, p_scope_key text, p_cohort jsonb,
                                                    p_as_of timestamptz, p_preview boolean, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = analytics, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE d analytics.metric_definitions%ROWTYPE; s analytics.scopes%ROWTYPE; v_as_of timestamptz := coalesce(p_as_of, clock_timestamp());
BEGIN
  PERFORM observation.assert_authority(ARRAY['analytics.metric.compute']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS NULL OR p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'metric computation rejected (actor): a computation is recorded under the acting principal' USING ERRCODE = '42501'; END IF;
  IF v_as_of > clock_timestamp() THEN RAISE EXCEPTION 'metric computation rejected (as_of): % is in the future', v_as_of USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_object_keys(coalesce(p_cohort, '{}'::jsonb)) k WHERE k = ANY (analytics.person_dimensions())) THEN
    RAISE EXCEPTION 'metric computation rejected (person): a product metric is never grouped by a person (cohort %): no employee-performance inference', p_cohort USING ERRCODE = '42501';
  END IF;
  d := analytics.amc_definition(p_tenant, p_domain, p_metric_key, p_preview);
  IF d.definition_id IS NULL THEN
    RAISE EXCEPTION 'metric computation rejected (unknown_metric): % has no % definition in this domain', p_metric_key, CASE WHEN coalesce(p_preview, false) THEN 'proposed or approved' ELSE 'approved' END USING ERRCODE = '23503';
  END IF;
  IF p_scope_key IS NOT NULL THEN
    SELECT * INTO s FROM analytics.scopes x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.scope_key = p_scope_key AND x.state = 'approved';
    IF NOT FOUND THEN RAISE EXCEPTION 'metric computation rejected (unknown_scope): % has no approved scope in this domain', p_scope_key USING ERRCODE = '23503'; END IF;
  END IF;
  RETURN analytics.amc_compute(p_result, d, s, p_period, p_cohort, v_as_of, coalesce(p_preview, false) OR d.state <> 'approved', NULL, p_actor, p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION analytics.compute_metric(uuid,uuid,uuid,text,text,text,jsonb,timestamptz,boolean,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION analytics.compute_metric(uuid,uuid,uuid,text,text,text,jsonb,timestamptz,boolean,uuid,uuid) TO eye_commit;

-- §0.8 REPLAY (D11) ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* REPLAY a result (analytics.metric.replay): recompute it AT ITS OWN as-of, with the definition VERSION, the scope VERSION and the period it
   named; reproduced when the source revision and the value agree, mismatch otherwise (the replay row keeps both, the differing records are
   readable by comparing the two record sets). A computation re-declared since names a different digest: said in the verdict's reason. */
CREATE OR REPLACE FUNCTION analytics.replay_result(p_replay uuid, p_tenant uuid, p_domain uuid, p_result uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = analytics, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r analytics.metric_results%ROWTYPE; d analytics.metric_definitions%ROWTYPE; s analytics.scopes%ROWTYPE; out jsonb; v_verdict text; v_reasons jsonb := '[]'::jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['analytics.metric.replay']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS NULL OR p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'metric computation rejected (actor): a replay is recorded under the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO r FROM analytics.metric_results x WHERE x.result_id = p_result AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'metric computation rejected (unknown_result): % is not a result of this domain', p_result USING ERRCODE = '23503'; END IF;
  IF r.replay_of IS NOT NULL THEN RAISE EXCEPTION 'metric computation rejected (state): % is itself a replay; replay its original %', p_result, r.replay_of USING ERRCODE = '22023'; END IF;
  SELECT * INTO d FROM analytics.metric_definitions x WHERE x.definition_id = r.definition_id;
  IF r.scope_id IS NOT NULL THEN SELECT * INTO s FROM analytics.scopes x WHERE x.scope_id = r.scope_id; END IF;
  out := analytics.amc_compute(p_replay, d, s, r.period_key, r.cohort, r.as_of, r.preview, p_result, p_actor, p_correlation);
  v_verdict := out ->> 'replay_verdict';
  IF out ->> 'computation_digest' IS DISTINCT FROM r.computation_digest THEN v_reasons := v_reasons || to_jsonb(format('the computation changed since (digest %s → %s)', r.computation_digest, out ->> 'computation_digest')); END IF;
  INSERT INTO analytics.definition_events (event_id, scope, tenant_id, domain_id, subject_kind, subject_id, subject_key, version, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, 'result', p_result, r.metric_key, r.definition_version, 'result.replayed', p_actor,
          jsonb_build_object('replay_id', p_replay, 'verdict', v_verdict, 'reasons', v_reasons, 'original_revision', r.source_revision, 'replay_revision', out ->> 'source_revision'), p_correlation);
  RETURN out || jsonb_build_object('replay_reasons', v_reasons, 'original', jsonb_build_object('value', r.value, 'state', r.state, 'source_revision', r.source_revision));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION analytics.replay_result(uuid,uuid,uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION analytics.replay_result(uuid,uuid,uuid,uuid,uuid,uuid) TO eye_commit;

-- §0.9 THE READS (INVOKER, under the caller's RLS) ───────────────────────────────────────────────────────────────────────────────────────
/* A result with its definition, its scope and its records (the drill-down: definition → result → records). */
CREATE OR REPLACE FUNCTION analytics.result_read(p_result uuid, p_records_limit int DEFAULT 500) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = analytics, pg_catalog, pg_temp AS $$
  SELECT to_jsonb(r) || jsonb_build_object(
    'definition', (SELECT to_jsonb(d) FROM analytics.metric_definitions d WHERE d.definition_id = r.definition_id),
    'scope_row', (SELECT to_jsonb(s) FROM analytics.scopes s WHERE s.scope_id = r.scope_id),
    'records', coalesce((SELECT jsonb_agg(to_jsonb(x) - 'tenant_id' - 'domain_id' ORDER BY x.ordinal) FROM (SELECT * FROM analytics.result_records rr WHERE rr.result_id = r.result_id ORDER BY rr.ordinal
                         LIMIT greatest(1, least(coalesce(p_records_limit, 500), 20000))) x), '[]'::jsonb),
    'records_by_role', coalesce((SELECT jsonb_object_agg(role, c) FROM (SELECT rr.role, count(*) c FROM analytics.result_records rr WHERE rr.result_id = r.result_id GROUP BY rr.role) z), '{}'::jsonb),
    'uses', coalesce((SELECT jsonb_agg(to_jsonb(u) - 'tenant_id' - 'domain_id' ORDER BY u.used_at) FROM analytics.metric_uses u WHERE u.result_id = r.result_id), '[]'::jsonb),
    'replays', coalesce((SELECT jsonb_agg(jsonb_build_object('result_id', p.result_id, 'verdict', p.replay_verdict, 'computed_at', p.computed_at, 'source_revision', p.source_revision) ORDER BY p.computed_at)
                         FROM analytics.metric_results p WHERE p.replay_of = r.result_id), '[]'::jsonb))
  FROM analytics.metric_results r WHERE r.result_id = p_result
$$;
GRANT EXECUTE ON FUNCTION analytics.result_read(uuid, int) TO eye_app, eye_commit;
