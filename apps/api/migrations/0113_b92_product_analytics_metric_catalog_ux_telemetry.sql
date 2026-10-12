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
              'quality', coalesce(out -> 'quality', '{}'::jsonb), 'records_count', coalesce(jsonb_array_length(out -> 'records'), 0), 'tenant_id', d.tenant_id, 'domain_id', d.domain_id,
              'records', coalesce(out -> 'records', '[]'::jsonb), 'distinct_actors', out -> 'distinct_actors', 'kind', d.kind, 'numerator', v_num, 'denominator', v_den));
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

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §MD — metric definitions, purposes, scopes, uses, the catalog (PR-70-002, PR-70-003, CAP-DL-11, V01-T-040; DP-44-005)
-- (folded at integration from the part-local file 0113_b92_x_md.sql, unchanged but for the integrator's marked lines; apply order §0, §MD, §MCA, §MCB, §CO, §UX, §OR, §I)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0113 §MD — CP-6 B92: METRIC DEFINITIONS, PURPOSES, SCOPES, USES, THE CATALOG (rows PR-70-002, PR-70-003, CAP-DL-11, V01-T-040; the residual
-- DP-44-005; ES-40-008's governance — residual R1, §B36.12 row 9). Part-local: applies ALONE on top of 0001–0112 and the 0113 prelude. Prefix amd_.
-- Re-declares exactly ONE function: products.metric_withdraw (copied WHOLE from its last definition, 0095:2731 — no later migration re-declares
-- it; the change marked `-- B92 md`).
--
-- WHAT IS BUILT (SOFTWARE CAPABILITY; every harness row is SYNTHETIC, a synthetic demonstration never closes a clause that needs the real
-- integration, and the signed acceptance of the catalog is R2's):
--   §MD.1 helpers — the acting principal, the human/role tests, the ledger write, the performance-purpose word test, the App M owner-role map,
--         the canonical CONTRACT of a definition (the digest the approver sees and the field-level diff are both computed over it).
--   §MD.2 THE PURPOSE REGISTER's ports — propose (analyst | owner, a named human), decide (a named privacy officer, never the proposer, digest-bound,
--         reason 8+), retire (the privacy officer). A performance / employee-scoring purpose is refused `analytics purpose rejected (person)`.
--   §MD.3 THE SCOPE REGISTER's ports — propose, decide (a named product analytics owner ≠ proposer), retire; every entity a graph entity of the
--         domain, every objective an OBJ strategy object, every series registered — re-validated at the decision (the B33-F boundary lesson).
--   §MD.4 THE DEFINITIONS' ports — propose (a HUMAN analyst or owner; an agent is refused at the port: AI computes and proposes findings, a definition
--         is a human's proposal), decide (approve | reject at the digest seen; the owner ≠ proposer; the whole contract RE-VALIDATED; approval
--         supersedes the prior approved version), retire (lists the uses of every version's results in the retirement event; refuses nothing).
--   §MD.5 THE USES LEDGER's port (analytics.use.record) and ES-40-008's constraint: an indeterminate or unsupported result is cited in a briefing
--         or a publication ONLY with an explicit qualification that says so.
--   §MD.6 DP-44-005 — products.metric_serving_uses + products.record_metric_serving_use (products.metric.use), and the withdrawal step lists them.
--   §MD.7 the reads (INVOKER): the definition diff.
-- THE CATALOG (CAP-DL-11): products.catalogue_asset (0095:927) admits the kinds schema | field | source | product | staging | external — none is a
-- governed analytics definition, its registry kinds are walked by B90's reconciliation, and it asserts its OWN bound action (a data steward's
-- act), so it is NOT called from a definition's approval (that would force it). The catalog VIEW is analytics' own read (the approved
-- definitions with their latest results per period); a data steward MAY catalogue a definition through B90's own route as kind `external`, ref
-- `analytics:<metric_key>` — the read shows that entry when present. The integrator decides whether a `metric_definition` catalog kind is added.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- §MD.1 HELPERS (internal; no runtime grant) ─────────────────────────────────────────────────────────────────────────────────────────────────
/* The acting principal is the one recorded. */
CREATE OR REPLACE FUNCTION analytics.amd_assert_actor(p_noun text, p_actor uuid) RETURNS void
LANGUAGE plpgsql SET search_path = analytics, pg_catalog, pg_temp AS $$
BEGIN
  IF p_actor IS NULL OR p_actor IS DISTINCT FROM public.eye_principal() THEN
    RAISE EXCEPTION '% rejected (actor): the act is recorded under the acting principal', p_noun USING ERRCODE = '42501';
  END IF;
END $$;
REVOKE ALL ON FUNCTION analytics.amd_assert_actor(text, uuid) FROM PUBLIC;

/* The kind of an ACTIVE principal (human | agent | workload | system), NULL otherwise. */
CREATE OR REPLACE FUNCTION analytics.amd_kind(p_principal uuid) RETURNS text
STABLE SECURITY DEFINER SET search_path = identity, pg_catalog, pg_temp AS $$
  SELECT p.kind FROM identity.principals p WHERE p.id = p_principal AND p.status = 'active'
$$ LANGUAGE sql;
REVOKE ALL ON FUNCTION analytics.amd_kind(uuid) FROM PUBLIC;

/* A named, active HUMAN of the tenant holding one of the roles in the domain (or at the tenant). */
CREATE OR REPLACE FUNCTION analytics.amd_human_with(p_principal uuid, p_tenant uuid, p_domain uuid, p_roles text[]) RETURNS boolean
STABLE SECURITY DEFINER SET search_path = identity, pg_catalog, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM identity.role_bindings b JOIN identity.principals p ON p.id = b.principal_id
                  WHERE b.principal_id = p_principal AND p.kind = 'human' AND p.status = 'active' AND b.revoked_at IS NULL
                    AND b.role_code = ANY (p_roles) AND b.tenant_id = p_tenant
                    AND ((b.scope = 'DOMAIN' AND b.domain_id = p_domain) OR b.scope = 'TENANT'))
$$ LANGUAGE sql;
REVOKE ALL ON FUNCTION analytics.amd_human_with(uuid, uuid, uuid, text[]) FROM PUBLIC;

/* The act's HUMAN test in one place: an agent (or any non-human) is refused `(actor)`; a human without one of the roles `(authority)`. */
CREATE OR REPLACE FUNCTION analytics.amd_assert_human(p_noun text, p_actor uuid, p_tenant uuid, p_domain uuid, p_roles text[], p_what text) RETURNS void
LANGUAGE plpgsql SET search_path = analytics, pg_catalog, pg_temp AS $$
BEGIN
  IF analytics.amd_kind(p_actor) IS DISTINCT FROM 'human' THEN
    RAISE EXCEPTION '% rejected (actor): % is a named human''s act; an agent or a system never performs it (AI may compute and propose findings, never this)', p_noun, p_what USING ERRCODE = '42501';
  END IF;
  IF NOT analytics.amd_human_with(p_actor, p_tenant, p_domain, p_roles) THEN
    RAISE EXCEPTION '% rejected (authority): % is the act of a %', p_noun, p_what, array_to_string(p_roles, ' or ') USING ERRCODE = '42501';
  END IF;
END $$;
REVOKE ALL ON FUNCTION analytics.amd_assert_human(text, uuid, uuid, uuid, text[], text) FROM PUBLIC;

/* A reason of 8+ characters. */
CREATE OR REPLACE FUNCTION analytics.amd_assert_reason(p_noun text, p_reason text, p_what text) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION '% rejected (reason): % states its reason (8+ characters)', p_noun, p_what USING ERRCODE = '22023'; END IF;
  RETURN btrim(p_reason);
END $$;
REVOKE ALL ON FUNCTION analytics.amd_assert_reason(text, text, text) FROM PUBLIC;

/* The definitions' ledger (analytics.definition_events, the prelude's). */
CREATE OR REPLACE FUNCTION analytics.amd_event(p_tenant uuid, p_domain uuid, p_kind text, p_subject uuid, p_key text, p_version int, p_event text, p_actor uuid, p_details jsonb, p_correlation uuid) RETURNS void
LANGUAGE sql SET search_path = analytics, pg_catalog, pg_temp AS $$
  INSERT INTO analytics.definition_events (event_id, scope, tenant_id, domain_id, subject_kind, subject_id, subject_key, version, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_kind, p_subject, p_key, p_version, p_event, p_actor, coalesce(p_details, '{}'::jsonb), p_correlation)
$$;
REVOKE ALL ON FUNCTION analytics.amd_event(uuid, uuid, text, uuid, text, int, text, uuid, jsonb, uuid) FROM PUBLIC;

/* THE PERFORMANCE-PURPOSE TEST (PR-70-003, App M header "none authorizes surveillance, employee scoring…"): the phrases that STATE a purpose of
   evaluating, scoring, ranking or watching people. A phrase NEGATED earlier in its own clause ("never for employee performance, ranking or
   surveillance", "no ranking of staff") is a disclaimer, not a purpose, and passes; a clause ends at . ; : ! ? or a dash between words. The text
   is lower-cased and its hyphens / underscores / slashes read as spaces. */
CREATE OR REPLACE FUNCTION analytics.performance_purpose_terms() RETURNS text[]
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT ARRAY['performance review', 'performance evaluation', 'performance appraisal', 'performance management', 'employee performance', 'staff performance',
               'individual performance', 'worker performance', 'personal performance', 'employee scoring', 'employee score', 'scoring employees', 'score employees',
               'scoring staff', 'score staff', 'productivity scoring', 'productivity score', 'ranking staff', 'rank staff', 'ranking employees', 'rank employees',
               'employee ranking', 'staff ranking', 'monitor employees', 'monitoring employees', 'track employees', 'tracking employees', 'employee surveillance',
               'surveillance of staff', 'surveil', 'disciplinary', 'appraisal of staff', 'appraise employees'] $$;
GRANT EXECUTE ON FUNCTION analytics.performance_purpose_terms() TO eye_app, eye_commit;
CREATE OR REPLACE FUNCTION analytics.states_performance_purpose(p_text text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  WITH t AS (SELECT regexp_replace(lower(coalesce(p_text, '')), '[.;:!?—–]|\s-+\s', '|', 'g') AS s),
       c AS (SELECT regexp_replace(regexp_replace(x, '[-_/]+', ' ', 'g'), '\s+', ' ', 'g') AS clause FROM t, regexp_split_to_table(t.s, '\|') x)
  SELECT (SELECT term FROM unnest(analytics.performance_purpose_terms()) term, c
           WHERE position(term IN c.clause) > 0
             AND NOT (substr(c.clause, 1, position(term IN c.clause) - 1) ~ '\m(no|not|never|without|nor|excluding|excludes)\M')
           ORDER BY length(term) DESC LIMIT 1)
$$;
GRANT EXECUTE ON FUNCTION analytics.states_performance_purpose(text) TO eye_app, eye_commit;

/* APP M's OWNER COLUMN → the role of this product that holds it (CAP-DL-11's "Chief Product Officer" → product_analytics_owner, stated). A
   definition's named owner is a human holding product_analytics_owner, or the role its App M owner maps to (a role code itself is accepted).
   Every mapped role is a HUMAN role (no agent, no subscriber). */
CREATE OR REPLACE FUNCTION analytics.owner_role_map() RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$ SELECT '{
  "chief product officer": "product_analytics_owner", "product analytics owner": "product_analytics_owner", "research product owner": "product_analytics_owner",
  "accessibility owner": "product_analytics_owner", "product authority": "product_analytics_owner",
  "executive product owner": "executive", "customer sponsor": "executive", "executive operator": "executive_operator",
  "decision product owner": "decision_owner", "strategy authority": "strategy_owner",
  "governance": "auditor", "trust authority": "auditor", "ai governance": "auditor", "agent governance": "auditor",
  "data product owner": "data_steward", "data authority": "data_steward", "correction owner": "data_steward",
  "knowledge authority": "knowledge_owner", "retrieval owner": "knowledge_owner", "memory owner": "knowledge_owner", "graph owner": "ontology_steward",
  "collection owner": "collection_manager", "observation operations": "collection_manager",
  "foresight owner": "forecast_owner", "forecast owner": "forecast_owner", "scenario owner": "forecast_owner", "simulation owner": "method_steward",
  "warning owner": "risk_owner", "risk owner": "risk_owner", "twin owner": "twin_owner",
  "agent owner": "domain_admin", "service owner": "domain_admin", "recovery authority": "domain_admin", "implementation owner": "tenant_admin"
}'::jsonb $$;
GRANT EXECUTE ON FUNCTION analytics.owner_role_map() TO eye_app, eye_commit;
/* The role an owner-role text names: the map's, or the text itself when it is a human role code of this product; NULL otherwise. */
CREATE OR REPLACE FUNCTION analytics.amd_owner_role(p_owner_role text) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = identity, analytics, pg_catalog, pg_temp AS $$
  SELECT coalesce(analytics.owner_role_map() ->> lower(btrim(coalesce(p_owner_role, ''))),
                  (SELECT r.code FROM identity.roles r WHERE r.code = btrim(coalesce(p_owner_role, '')) AND r.code !~ '(_agent|_subscriber)$'))
$$;
REVOKE ALL ON FUNCTION analytics.amd_owner_role(text) FROM PUBLIC;

/* THE CANONICAL CONTRACT of a definition (D2): exactly the fields App M's Contract control names plus the computation binding — never the
   version, state or decision. Built from a row (to_jsonb(d)) or from the propose port's validated values; the digest the approver sees is
   analytics.digest(contract); the diff compares two contracts key by key. Arrays of names are sorted (order carries no meaning). */
CREATE OR REPLACE FUNCTION analytics.definition_contract(p jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = analytics, pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object(
    'metric_key', p -> 'metric_key', 'title', p -> 'title', 'meaning', p -> 'meaning', 'kind', p -> 'kind', 'unit', p -> 'unit', 'direction', p -> 'direction',
    'population', coalesce(p -> 'population', '{}'::jsonb), 'numerator', p -> 'numerator', 'denominator', p -> 'denominator',
    'exclusions', coalesce(p -> 'exclusions', '[]'::jsonb), 'window', coalesce(p -> 'window_spec', '{}'::jsonb),
    'dimensions', coalesce((SELECT jsonb_agg(x ORDER BY x) FROM jsonb_array_elements_text(coalesce(p -> 'dimensions', '[]'::jsonb)) x), '[]'::jsonb),
    'privacy_class', p -> 'privacy_class', 'k_min', p -> 'k_min', 'floor_n', p -> 'floor_n', 'threshold', coalesce(p -> 'threshold', '{}'::jsonb),
    'purpose_key', p -> 'purpose_key', 'serves', coalesce(p -> 'serves', '{}'::jsonb), 'cadence', p -> 'cadence', 'owner_principal_id', p -> 'owner_principal_id',
    'action', p -> 'action', 'retirement', p -> 'retirement', 'quality', coalesce(p -> 'quality', '{}'::jsonb), 'cost_allocation', coalesce(p -> 'cost_allocation', '{}'::jsonb),
    'computation_key', p -> 'computation_key', 'params', coalesce(p -> 'params', '{}'::jsonb), 'supported', p -> 'supported', 'unsupported_reason', p -> 'unsupported_reason',
    'source_refs', coalesce((SELECT jsonb_agg(x ORDER BY x) FROM jsonb_array_elements_text(coalesce(p -> 'source_refs', '[]'::jsonb)) x), '[]'::jsonb))
$$;
GRANT EXECUTE ON FUNCTION analytics.definition_contract(jsonb) TO eye_app, eye_commit;
/* THE FIELD-LEVEL DIFF of two contracts (rows or contracts): [{field, from, to}] for every contract field that differs, in field order. */
CREATE OR REPLACE FUNCTION analytics.definition_diff_of(p_from jsonb, p_to jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = analytics, pg_catalog, pg_temp AS $$
  WITH a AS (SELECT analytics.definition_contract(p_from) c), b AS (SELECT analytics.definition_contract(p_to) c)
  SELECT coalesce(jsonb_agg(jsonb_build_object('field', k, 'from', a.c -> k, 'to', b.c -> k) ORDER BY k), '[]'::jsonb)
    FROM a, b, jsonb_object_keys(b.c) k WHERE (a.c -> k) IS DISTINCT FROM (b.c -> k)
$$;
GRANT EXECUTE ON FUNCTION analytics.definition_diff_of(jsonb, jsonb) TO eye_app, eye_commit;

/* An APPROVED purpose of the domain by key (the register's current approved version), or NULL. */
CREATE OR REPLACE FUNCTION analytics.amd_purpose(p_tenant uuid, p_domain uuid, p_key text) RETURNS analytics.purposes
LANGUAGE sql STABLE SET search_path = analytics, pg_catalog, pg_temp AS $$
  SELECT * FROM analytics.purposes x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.purpose_key = p_key AND x.state = 'approved'
$$;
REVOKE ALL ON FUNCTION analytics.amd_purpose(uuid, uuid, text) FROM PUBLIC;

/* THE CONTRACT'S VALIDATION (PR-70-002/-003, V01-T-040, D2/D4): the whole contract, refused in the class form `metric definition rejected (…)`.
   Called by the propose port and AGAIN by the decide port (what was valid when proposed — an approved purpose, a registered computation of the
   same kind and dimensions, an owner holding the role, a live objective — is re-validated at the approval). Returns the normalised row values. */
CREATE OR REPLACE FUNCTION analytics.amd_validate_contract(p_tenant uuid, p_domain uuid, c jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = analytics, graph, decision, executive, pg_catalog, pg_temp AS $$
DECLARE bad text; reg analytics.computation_registry%ROWTYPE; pu analytics.purposes%ROWTYPE; v_dims text[]; v_person text[]; v_obj text; v_role text;
        v_supported boolean; v_owner uuid; e jsonb; v_term text;
BEGIN
  IF c IS NULL OR jsonb_typeof(c) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'metric definition rejected (contract): the contract is an object' USING ERRCODE = '22023'; END IF;
  bad := CASE
    WHEN coalesce(c ->> 'metric_key', '') !~ '^[A-Z][A-Z0-9]{1,9}-[A-Za-z0-9.-]{1,40}$' THEN 'metric_key is of the form MET-001 / V1-decision-cycle / ES40-commitment-visibility'
    WHEN length(btrim(coalesce(c ->> 'title', ''))) NOT BETWEEN 4 AND 200 THEN 'title has 4–200 characters'
    WHEN length(btrim(coalesce(c ->> 'meaning', ''))) NOT BETWEEN 8 AND 2000 THEN 'meaning states the measured meaning (8–2000 characters)'
    WHEN coalesce(c ->> 'kind', '') NOT IN ('rate', 'duration', 'ratio', 'count', 'score') THEN 'kind is rate, duration, ratio, count or score'
    WHEN length(btrim(coalesce(c ->> 'unit', ''))) NOT BETWEEN 1 AND 40 THEN 'unit is named (1–40 characters)'
    WHEN coalesce(c ->> 'direction', '') NOT IN ('higher', 'lower', 'band', 'track') THEN 'direction is higher, lower, band or track'
    WHEN jsonb_typeof(c -> 'population') IS DISTINCT FROM 'object' OR length(btrim(coalesce(c #>> '{population,subject}', ''))) < 3 THEN 'population is an object naming its subject (and its inclusion)'
    WHEN c ->> 'kind' = 'rate' AND (length(btrim(coalesce(c ->> 'numerator', ''))) < 3 OR length(btrim(coalesce(c ->> 'denominator', ''))) < 3) THEN 'a rate states its numerator and its denominator'
    WHEN jsonb_typeof(c -> 'exclusions') IS DISTINCT FROM 'array' THEN 'exclusions is a list of {rule, reason}'
    WHEN jsonb_typeof(c -> 'window_spec') IS DISTINCT FROM 'object' OR coalesce(c #>> '{window_spec,kind}', '') NOT IN ('calendar_quarter', 'calendar_month', 'rolling_days') THEN 'window.kind is calendar_quarter, calendar_month or rolling_days'
    WHEN coalesce(c #>> '{window_spec,clock}', '') NOT IN ('record', 'world') THEN 'window.clock is record (when the product recorded it) or world (the subject''s own time) — stated, never assumed'
    WHEN c #>> '{window_spec,kind}' = 'rolling_days' AND (jsonb_typeof(c #> '{window_spec,days}') IS DISTINCT FROM 'number' OR (c #>> '{window_spec,days}')::numeric NOT BETWEEN 1 AND 3660) THEN 'a rolling window states its days (1–3660)'
    WHEN jsonb_typeof(c -> 'dimensions') IS DISTINCT FROM 'array' THEN 'dimensions is a list of names'
    WHEN coalesce(c ->> 'privacy_class', '') NOT IN ('aggregate', 'pseudonymous_cohort') THEN 'privacy_class is aggregate or pseudonymous_cohort'
    WHEN jsonb_typeof(c -> 'k_min') IS DISTINCT FROM 'number' OR (c ->> 'k_min')::numeric < 5 OR (c ->> 'k_min')::numeric <> floor((c ->> 'k_min')::numeric) THEN 'k_min is a whole number of at least 5'
    WHEN jsonb_typeof(c -> 'floor_n') IS DISTINCT FROM 'number' OR (c ->> 'floor_n')::numeric < 1 OR (c ->> 'floor_n')::numeric <> floor((c ->> 'floor_n')::numeric) THEN 'floor_n (the minimum n for a determinate value) is a whole number of at least 1'
    WHEN length(btrim(coalesce(c ->> 'cadence', ''))) NOT BETWEEN 3 AND 60 THEN 'cadence is named (3–60 characters)'
    WHEN length(btrim(coalesce(c ->> 'retirement', ''))) < 8 THEN 'retirement states the condition the metric is retired on (8+ characters)'
    WHEN jsonb_typeof(c -> 'quality') IS DISTINCT FROM 'object' OR jsonb_typeof(c -> 'cost_allocation') IS DISTINCT FROM 'object' OR jsonb_typeof(c -> 'params') IS DISTINCT FROM 'object' THEN 'quality, cost_allocation and params are objects'
    WHEN jsonb_typeof(c -> 'source_refs') IS DISTINCT FROM 'array' THEN 'source_refs lists the App M / V1 / ES rows the contract answers'
  END;
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'metric definition rejected (contract): %', bad USING ERRCODE = '22023'; END IF;
  FOR e IN SELECT * FROM jsonb_array_elements(c -> 'exclusions') LOOP
    IF jsonb_typeof(e) IS DISTINCT FROM 'object' OR length(btrim(coalesce(e ->> 'rule', ''))) < 3 OR length(btrim(coalesce(e ->> 'reason', ''))) < 4 THEN
      RAISE EXCEPTION 'metric definition rejected (contract): every exclusion is {rule, reason} (got %)', left(e::text, 200) USING ERRCODE = '22023';
    END IF;
  END LOOP;
  -- THE ACTION: a breach opens a REVIEW or an investigation — never an automatic or punitive decision (App M Action control)
  IF length(btrim(coalesce(c ->> 'action', ''))) < 8 OR (c ->> 'action') !~* '(review|investigat)' THEN
    RAISE EXCEPTION 'metric definition rejected (action): the breach action names the review or investigation workflow it opens (a threshold creates a review, never an automatic or punitive decision)' USING ERRCODE = '22023';
  END IF;
  -- THE DIMENSIONS: never a person (403), each one the computation's (422)
  SELECT coalesce(array_agg(DISTINCT x ORDER BY x), '{}') INTO v_dims FROM jsonb_array_elements_text(c -> 'dimensions') x;
  v_person := ARRAY(SELECT x FROM unnest(v_dims) x WHERE x = ANY (analytics.person_dimensions()) OR x ~* '(^|_)(employee|person|people|principal|user|actor|owner|assignee|reviewer|approver|staff|worker)s?(_|$)');
  IF cardinality(v_person) > 0 THEN
    RAISE EXCEPTION 'metric definition rejected (person): the dimension(s) % name a person — a product metric is never grouped by a person (no employee-performance inference; role cohorts only, above k)', array_to_string(v_person, ', ') USING ERRCODE = '42501';
  END IF;
  -- THE PURPOSE: an APPROVED purpose of the register
  pu := analytics.amd_purpose(p_tenant, p_domain, c ->> 'purpose_key');
  IF pu.purpose_id IS NULL THEN
    RAISE EXCEPTION 'metric definition rejected (purpose): % is not an approved purpose of this domain — a privacy officer approves the purpose first', coalesce(c ->> 'purpose_key', '<none>') USING ERRCODE = '22023';
  END IF;
  v_term := analytics.states_performance_purpose((c ->> 'title') || ' ' || (c ->> 'meaning'));
  IF v_term IS NOT NULL THEN
    RAISE EXCEPTION 'metric definition rejected (person): the definition states a purpose of evaluating people ("%") — no employee-performance inference', v_term USING ERRCODE = '42501';
  END IF;
  -- THE PRIVACY CLASS: pseudonymous cohorts only with k ≥ 5 and a product-improvement purpose
  IF c ->> 'privacy_class' = 'pseudonymous_cohort' AND pu.purpose_kind <> 'product_improvement' THEN
    RAISE EXCEPTION 'metric definition rejected (privacy): a pseudonymous cohort metric serves a product-improvement purpose only (% is %)', pu.purpose_key, pu.purpose_kind USING ERRCODE = '22023';
  END IF;
  -- THE COMPUTATION: supported ⇔ a registered computation of the same kind; its dimensions ⊇ the definition's
  v_supported := coalesce(c ->> 'computation_key', '') <> '';
  IF v_supported THEN
    SELECT * INTO reg FROM analytics.computation_registry r WHERE r.computation_key = c ->> 'computation_key';
    IF NOT FOUND THEN RAISE EXCEPTION 'metric definition rejected (unknown_computation): % is not a registered computation', c ->> 'computation_key' USING ERRCODE = '23503'; END IF;
    IF reg.kind <> c ->> 'kind' THEN
      RAISE EXCEPTION 'metric definition rejected (kind): the definition is a %, the computation % computes a %', c ->> 'kind', reg.computation_key, reg.kind USING ERRCODE = '22023';
    END IF;
    IF NOT (v_dims <@ reg.dimensions) THEN
      RAISE EXCEPTION 'metric definition rejected (dimension): the dimension(s) % are outside the computation''s (%)', array_to_string(ARRAY(SELECT x FROM unnest(v_dims) x WHERE NOT (x = ANY (reg.dimensions))), ', '),
        coalesce(nullif(array_to_string(reg.dimensions, ', '), ''), 'none') USING ERRCODE = '22023';
    END IF;
    IF c ? 'unsupported_reason' AND jsonb_typeof(c -> 'unsupported_reason') = 'string' AND btrim(c ->> 'unsupported_reason') <> '' THEN
      RAISE EXCEPTION 'metric definition rejected (unsupported): a definition with a computation is supported; it states no unsupported reason' USING ERRCODE = '22023';
    END IF;
  ELSE
    IF length(btrim(coalesce(c ->> 'unsupported_reason', ''))) < 8 THEN
      RAISE EXCEPTION 'metric definition rejected (unsupported): a definition with no computation states why the product cannot compute it and its carrier (8+ characters) — it is served unsupported, never silently missing' USING ERRCODE = '22023';
    END IF;
    IF cardinality(v_dims) > 0 THEN
      RAISE EXCEPTION 'metric definition rejected (dimension): an unsupported definition has no computation, so no cohort dimension (got %)', array_to_string(v_dims, ', ') USING ERRCODE = '22023';
    END IF;
  END IF;
  -- THE THRESHOLD: {} | {target} | {band: [lo, hi]} — and nothing else; a rate's values lie in [0, 1]
  IF jsonb_typeof(c -> 'threshold') IS DISTINCT FROM 'object'
     OR EXISTS (SELECT 1 FROM jsonb_object_keys(c -> 'threshold') k WHERE k NOT IN ('target', 'band'))
     OR (c -> 'threshold' ? 'target' AND c -> 'threshold' ? 'band')
     OR (c -> 'threshold' ? 'target' AND jsonb_typeof(c #> '{threshold,target}') IS DISTINCT FROM 'number')
     OR (c -> 'threshold' ? 'band' AND (jsonb_typeof(c #> '{threshold,band}') IS DISTINCT FROM 'array' OR jsonb_array_length(c #> '{threshold,band}') <> 2
                                        OR jsonb_typeof(c #> '{threshold,band,0}') IS DISTINCT FROM 'number' OR jsonb_typeof(c #> '{threshold,band,1}') IS DISTINCT FROM 'number'
                                        OR (c #>> '{threshold,band,0}')::numeric > (c #>> '{threshold,band,1}')::numeric)) THEN
    RAISE EXCEPTION 'metric definition rejected (threshold): the threshold is {} (none), {target: <number>} or {band: [lo, hi]} with lo ≤ hi' USING ERRCODE = '22023';
  END IF;
  IF c ->> 'kind' = 'rate' AND ((c -> 'threshold' ? 'target' AND (c #>> '{threshold,target}')::numeric NOT BETWEEN 0 AND 1)
                                OR (c -> 'threshold' ? 'band' AND ((c #>> '{threshold,band,0}')::numeric < 0 OR (c #>> '{threshold,band,1}')::numeric > 1))) THEN
    RAISE EXCEPTION 'metric definition rejected (threshold): a rate''s threshold lies between 0 and 1' USING ERRCODE = '22023';
  END IF;
  IF c -> 'threshold' ? 'band' AND c ->> 'direction' NOT IN ('band', 'track') THEN
    RAISE EXCEPTION 'metric definition rejected (threshold): a band threshold belongs to a definition whose direction is band' USING ERRCODE = '22023';
  END IF;
  IF c -> 'threshold' ? 'target' AND c ->> 'direction' NOT IN ('higher', 'lower') THEN
    RAISE EXCEPTION 'metric definition rejected (threshold): a target belongs to a definition whose direction is higher or lower' USING ERRCODE = '22023';
  END IF;
  -- SERVES (V01-T-040 "every measure links to the decision and objective it serves"): at least one objective, decision class or value measure
  IF jsonb_typeof(c -> 'serves') IS DISTINCT FROM 'object'
     OR (coalesce(jsonb_array_length(CASE WHEN jsonb_typeof(c #> '{serves,objective_ids}') = 'array' THEN c #> '{serves,objective_ids}' END), 0) = 0
         AND coalesce(jsonb_array_length(CASE WHEN jsonb_typeof(c #> '{serves,decision_classes}') = 'array' THEN c #> '{serves,decision_classes}' END), 0) = 0
         AND length(btrim(coalesce(c #>> '{serves,value_measure}', ''))) < 3) THEN
    RAISE EXCEPTION 'metric definition rejected (serves): the definition names the objective(s), decision class(es) or value measure it serves (V01-T-040: every measure links to the decision and objective it serves)' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(c #> '{serves,objective_ids}') = 'array' THEN
    FOR v_obj IN SELECT x FROM jsonb_array_elements_text(c #> '{serves,objective_ids}') x LOOP
      IF v_obj !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' OR NOT EXISTS (
           SELECT 1 FROM graph.strategy_current s WHERE s.strategy_object_id = v_obj::uuid AND s.tenant_id = p_tenant AND s.domain_id = p_domain AND s.object_type = 'OBJ' AND s.status = 'active') THEN
        RAISE EXCEPTION 'metric definition rejected (unknown_objective): % is not an active objective of this domain', v_obj USING ERRCODE = '23503';
      END IF;
    END LOOP;
  END IF;
  IF jsonb_typeof(c #> '{serves,decision_classes}') = 'array' AND EXISTS (SELECT 1 FROM jsonb_array_elements(c #> '{serves,decision_classes}') x WHERE jsonb_typeof(x) <> 'string' OR length(btrim(x #>> '{}')) < 3) THEN
    RAISE EXCEPTION 'metric definition rejected (serves): every decision class is named (3+ characters)' USING ERRCODE = '22023';
  END IF;
  -- THE OWNER: a named, active human of the domain holding product_analytics_owner, or the role App M's owner column maps to
  IF coalesce(c ->> 'owner_principal_id', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'metric definition rejected (owner): the owner is a named human (owner_principal_id)' USING ERRCODE = '22023';
  END IF;
  v_owner := (c ->> 'owner_principal_id')::uuid;
  v_role := CASE WHEN length(btrim(coalesce(c #>> '{quality,owner_role}', ''))) > 0 THEN analytics.amd_owner_role(c #>> '{quality,owner_role}') END;
  IF length(btrim(coalesce(c #>> '{quality,owner_role}', ''))) > 0 AND v_role IS NULL THEN
    RAISE EXCEPTION 'metric definition rejected (owner): App M''s owner "%" maps to no role of this product (analytics.owner_role_map)', c #>> '{quality,owner_role}' USING ERRCODE = '22023';
  END IF;
  IF NOT analytics.amd_human_with(v_owner, p_tenant, p_domain, ARRAY['product_analytics_owner'] || CASE WHEN v_role IS NULL THEN '{}'::text[] ELSE ARRAY[v_role] END) THEN
    RAISE EXCEPTION 'metric definition rejected (owner): the owner is a named, active human of this domain holding product_analytics_owner%', CASE WHEN v_role IS NULL THEN '' ELSE ' or ' || v_role || ' (App M''s ' || (c #>> '{quality,owner_role}') || ')' END USING ERRCODE = '22023';
  END IF;
  RETURN jsonb_build_object(
    'metric_key', c ->> 'metric_key', 'title', btrim(c ->> 'title'), 'meaning', btrim(c ->> 'meaning'), 'kind', c ->> 'kind', 'unit', btrim(c ->> 'unit'), 'direction', c ->> 'direction',
    'population', c -> 'population', 'numerator', nullif(btrim(coalesce(c ->> 'numerator', '')), ''), 'denominator', nullif(btrim(coalesce(c ->> 'denominator', '')), ''),
    'exclusions', c -> 'exclusions', 'window_spec', c -> 'window_spec', 'dimensions', to_jsonb(v_dims), 'privacy_class', c ->> 'privacy_class',
    'k_min', (c ->> 'k_min')::int, 'floor_n', (c ->> 'floor_n')::int, 'threshold', c -> 'threshold', 'purpose_key', c ->> 'purpose_key', 'serves', c -> 'serves',
    'cadence', btrim(c ->> 'cadence'), 'owner_principal_id', v_owner, 'action', btrim(c ->> 'action'), 'retirement', btrim(c ->> 'retirement'), 'quality', c -> 'quality',
    'cost_allocation', c -> 'cost_allocation', 'computation_key', CASE WHEN v_supported THEN c ->> 'computation_key' END, 'params', c -> 'params', 'supported', v_supported,
    'unsupported_reason', CASE WHEN v_supported THEN NULL ELSE btrim(c ->> 'unsupported_reason') END,
    'source_refs', coalesce((SELECT jsonb_agg(DISTINCT x) FROM jsonb_array_elements_text(c -> 'source_refs') x), '[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION analytics.amd_validate_contract(uuid, uuid, jsonb) FROM PUBLIC;

-- §MD.2 THE PURPOSE REGISTER ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION analytics.amd_purpose_digest(p_key text, p_title text, p_kind text, p_description text, p_retention int) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = analytics, pg_catalog, pg_temp AS $$
  SELECT analytics.digest(jsonb_build_object('purpose_key', p_key, 'title', p_title, 'purpose_kind', p_kind, 'description', p_description, 'retention_days', p_retention))
$$;
GRANT EXECUTE ON FUNCTION analytics.amd_purpose_digest(text, text, text, text, int) TO eye_app, eye_commit;

/* PROPOSE a purpose (analytics.purpose.propose): a named human product analyst or product analytics owner proposes the next VERSION of a purpose
   key — title, kind (analytics.purpose_kinds(); a performance / employee kind refused `(person)`), description (a performance or employee-scoring
   purpose refused `(person)`), the raw-telemetry retention in days. One open proposal per key. */
CREATE OR REPLACE FUNCTION analytics.propose_purpose(p_purpose uuid, p_tenant uuid, p_domain uuid, p_key text, p_title text, p_kind text, p_description text, p_retention_days int,
                                                     p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = analytics, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_next int; v_term text; o analytics.purposes%ROWTYPE; v_digest text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['analytics.purpose.propose']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM analytics.amd_assert_actor('analytics purpose', p_actor);
  PERFORM analytics.amd_assert_human('analytics purpose', p_actor, p_tenant, p_domain, ARRAY['product_analyst', 'product_analytics_owner'], 'a purpose proposal');
  IF coalesce(p_key, '') !~ '^[a-z][a-z0-9_.-]{2,62}$' THEN RAISE EXCEPTION 'analytics purpose rejected (key): a purpose key is lower-case letters, digits, dot, dash or underscore (3–63 characters)' USING ERRCODE = '22023'; END IF;
  IF coalesce(p_kind, '') ~* '(perform|employ|staff|worker|productiv|scor|rank|apprais|surveil|disciplin)' THEN
    RAISE EXCEPTION 'analytics purpose rejected (person): % is a purpose of evaluating people — product analytics serves %, never performance evaluation or employee scoring', p_kind, array_to_string(analytics.purpose_kinds(), ', ') USING ERRCODE = '42501';
  END IF;
  IF NOT (coalesce(p_kind, '') = ANY (analytics.purpose_kinds())) THEN
    RAISE EXCEPTION 'analytics purpose rejected (kind): the kind is one of %', array_to_string(analytics.purpose_kinds(), ', ') USING ERRCODE = '22023';
  END IF;
  IF length(btrim(coalesce(p_title, ''))) NOT BETWEEN 4 AND 200 THEN RAISE EXCEPTION 'analytics purpose rejected (title): a title has 4–200 characters' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_description, ''))) NOT BETWEEN 16 AND 4000 THEN RAISE EXCEPTION 'analytics purpose rejected (description): the description states what the purpose serves (16–4000 characters)' USING ERRCODE = '22023'; END IF;
  v_term := analytics.states_performance_purpose(p_title || ' ' || p_description);
  IF v_term IS NOT NULL THEN
    RAISE EXCEPTION 'analytics purpose rejected (person): the purpose states "%" — product analytics never serves performance evaluation, employee scoring, ranking or surveillance of people (PR-70-003)', v_term USING ERRCODE = '42501';
  END IF;
  IF p_retention_days IS NULL OR p_retention_days NOT BETWEEN 1 AND 3660 THEN RAISE EXCEPTION 'analytics purpose rejected (retention): the raw-telemetry retention is 1–3660 days' USING ERRCODE = '22023'; END IF;
  SELECT * INTO o FROM analytics.purposes x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.purpose_key = p_key AND x.state = 'proposed' ORDER BY x.version DESC LIMIT 1 FOR UPDATE;
  IF FOUND THEN RAISE EXCEPTION 'analytics purpose rejected (state): version % of % is proposed; it is decided before the next', o.version, p_key USING ERRCODE = '22023'; END IF;
  SELECT coalesce(max(x.version), 0) + 1 INTO v_next FROM analytics.purposes x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.purpose_key = p_key;
  v_digest := analytics.amd_purpose_digest(p_key, btrim(p_title), p_kind, btrim(p_description), p_retention_days);
  INSERT INTO analytics.purposes (purpose_id, scope, tenant_id, domain_id, purpose_key, version, title, purpose_kind, description, retention_days, state, digest, proposed_by, correlation_id)
  VALUES (p_purpose, 'DOMAIN', p_tenant, p_domain, p_key, v_next, btrim(p_title), p_kind, btrim(p_description), p_retention_days, 'proposed', v_digest, p_actor, p_correlation);
  PERFORM analytics.amd_event(p_tenant, p_domain, 'purpose', p_purpose, p_key, v_next, 'purpose.proposed', p_actor,
                              jsonb_build_object('purpose_kind', p_kind, 'retention_days', p_retention_days, 'digest', v_digest, 'pending', 'a privacy officer''s decision'), p_correlation);
  RETURN (SELECT to_jsonb(x) FROM analytics.purposes x WHERE x.purpose_id = p_purpose);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION analytics.propose_purpose(uuid,uuid,uuid,text,text,text,text,int,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION analytics.propose_purpose(uuid,uuid,uuid,text,text,text,text,int,uuid,uuid) TO eye_commit;

/* DECIDE a purpose (analytics.purpose.decide, human-gated): a named privacy officer — never the proposer, never an agent — approves or rejects the
   proposed version AT THE DIGEST it read (a stale digest refused 409), with a reason; approval supersedes the prior approved version. */
CREATE OR REPLACE FUNCTION analytics.decide_purpose(p_purpose uuid, p_tenant uuid, p_domain uuid, p_decision text, p_digest text, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = analytics, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE pu analytics.purposes%ROWTYPE; v_reason text; v_prev uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['analytics.purpose.decide']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM analytics.amd_assert_actor('analytics purpose', p_actor);
  PERFORM analytics.amd_assert_human('analytics purpose', p_actor, p_tenant, p_domain, ARRAY['privacy_officer'], 'a purpose decision (the privacy and minimisation review)');
  SELECT * INTO pu FROM analytics.purposes x WHERE x.purpose_id = p_purpose AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'analytics purpose rejected (unknown_purpose): % is not a purpose of this domain', p_purpose USING ERRCODE = '23503'; END IF;
  IF pu.proposed_by = p_actor THEN RAISE EXCEPTION 'analytics purpose rejected (separation_of_duties): the proposer of % v% does not decide it', pu.purpose_key, pu.version USING ERRCODE = '42501'; END IF;
  IF pu.state <> 'proposed' THEN RAISE EXCEPTION 'analytics purpose rejected (state): % v% is %; only a proposed version is decided', pu.purpose_key, pu.version, pu.state USING ERRCODE = '22023'; END IF;
  IF p_decision NOT IN ('approve', 'reject') THEN RAISE EXCEPTION 'analytics purpose rejected (decision): the decision is approve or reject' USING ERRCODE = '22023'; END IF;
  v_reason := analytics.amd_assert_reason('analytics purpose', p_reason, 'a purpose decision');
  IF p_digest IS DISTINCT FROM pu.digest THEN
    RAISE EXCEPTION 'analytics purpose rejected (stale): % v% is at digest %…, not the one decided (%…)', pu.purpose_key, pu.version, left(pu.digest, 12), left(coalesce(p_digest, '<none>'), 12) USING ERRCODE = '22023';
  END IF;
  IF p_decision = 'approve' THEN
    UPDATE analytics.purposes SET state = 'superseded' WHERE tenant_id = p_tenant AND domain_id = p_domain AND purpose_key = pu.purpose_key AND state = 'approved' RETURNING purpose_id INTO v_prev;
    UPDATE analytics.purposes SET state = 'approved', decided_by = p_actor, decided_at = clock_timestamp(), decision_reason = v_reason WHERE purpose_id = p_purpose;
  ELSE
    UPDATE analytics.purposes SET state = 'rejected', decided_by = p_actor, decided_at = clock_timestamp(), decision_reason = v_reason WHERE purpose_id = p_purpose;
  END IF;
  PERFORM analytics.amd_event(p_tenant, p_domain, 'purpose', p_purpose, pu.purpose_key, pu.version, CASE WHEN p_decision = 'approve' THEN 'purpose.approved' ELSE 'purpose.rejected' END, p_actor,
                              jsonb_build_object('digest', pu.digest, 'reason', v_reason, 'superseded', v_prev), p_correlation);
  IF v_prev IS NOT NULL THEN
    PERFORM analytics.amd_event(p_tenant, p_domain, 'purpose', v_prev, pu.purpose_key, pu.version - 1, 'purpose.superseded', p_actor, jsonb_build_object('by_version', pu.version), p_correlation);
  END IF;
  RETURN (SELECT to_jsonb(x) FROM analytics.purposes x WHERE x.purpose_id = p_purpose);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION analytics.decide_purpose(uuid,uuid,uuid,text,text,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION analytics.decide_purpose(uuid,uuid,uuid,text,text,text,uuid,uuid) TO eye_commit;

/* RETIRE a purpose (analytics.purpose.retire, human-gated): the privacy officer retires the approved (or a still-proposed) version with a reason. The
   definitions that name the purpose are LISTED in the event (they keep their history; a new definition or approval under it is refused — the
   purpose is no longer approved; §UX's collection under it stops). */
CREATE OR REPLACE FUNCTION analytics.retire_purpose(p_purpose uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = analytics, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE pu analytics.purposes%ROWTYPE; v_reason text; v_defs jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['analytics.purpose.retire']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM analytics.amd_assert_actor('analytics purpose', p_actor);
  PERFORM analytics.amd_assert_human('analytics purpose', p_actor, p_tenant, p_domain, ARRAY['privacy_officer'], 'a purpose retirement');
  SELECT * INTO pu FROM analytics.purposes x WHERE x.purpose_id = p_purpose AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'analytics purpose rejected (unknown_purpose): % is not a purpose of this domain', p_purpose USING ERRCODE = '23503'; END IF;
  IF pu.state NOT IN ('approved', 'proposed') THEN RAISE EXCEPTION 'analytics purpose rejected (state): % v% is %; an approved or proposed version is retired', pu.purpose_key, pu.version, pu.state USING ERRCODE = '22023'; END IF;
  v_reason := analytics.amd_assert_reason('analytics purpose', p_reason, 'a retirement');
  UPDATE analytics.purposes SET state = 'retired', retired_by = p_actor, retired_at = clock_timestamp(), retire_reason = v_reason WHERE purpose_id = p_purpose;
  SELECT coalesce(jsonb_agg(jsonb_build_object('metric_key', d.metric_key, 'version', d.version, 'state', d.state) ORDER BY d.metric_key, d.version), '[]'::jsonb) INTO v_defs
    FROM analytics.metric_definitions d WHERE d.tenant_id = p_tenant AND d.domain_id = p_domain AND d.purpose_key = pu.purpose_key AND d.state IN ('proposed', 'approved');
  PERFORM analytics.amd_event(p_tenant, p_domain, 'purpose', p_purpose, pu.purpose_key, pu.version, 'purpose.retired', p_actor,
                              jsonb_build_object('reason', v_reason, 'definitions_naming_it', v_defs, 'consequence', 'no new definition, approval or collection under this purpose; history stays readable'), p_correlation);
  RETURN (SELECT to_jsonb(x) FROM analytics.purposes x WHERE x.purpose_id = p_purpose) || jsonb_build_object('definitions_naming_it', v_defs);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION analytics.retire_purpose(uuid,uuid,uuid,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION analytics.retire_purpose(uuid,uuid,uuid,text,uuid,uuid) TO eye_commit;

-- §MD.3 THE SCOPE REGISTER ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION analytics.amd_scope_digest(p_key text, p_title text, p_entities uuid[], p_objectives uuid[], p_series text[], p_geographies text[], p_description text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = analytics, pg_catalog, pg_temp AS $$
  SELECT analytics.digest(jsonb_build_object('scope_key', p_key, 'title', p_title, 'description', p_description,
    'entity_ids', coalesce((SELECT jsonb_agg(x ORDER BY x) FROM unnest(p_entities) x), '[]'::jsonb), 'objective_ids', coalesce((SELECT jsonb_agg(x ORDER BY x) FROM unnest(p_objectives) x), '[]'::jsonb),
    'series_keys', coalesce((SELECT jsonb_agg(x ORDER BY x) FROM unnest(p_series) x), '[]'::jsonb), 'geographies', coalesce((SELECT jsonb_agg(x ORDER BY x) FROM unnest(p_geographies) x), '[]'::jsonb)))
$$;
GRANT EXECUTE ON FUNCTION analytics.amd_scope_digest(text, text, uuid[], uuid[], text[], text[], text) TO eye_app, eye_commit;

/* A scope's members, each a fact of the domain: an ACTIVE graph entity, an ACTIVE objective (OBJ), a REGISTERED series; geographies are named
   tokens. Unknown → `(unknown_entity | unknown_objective | unknown_series)` 404. Called at the proposal and again at the decision. */
CREATE OR REPLACE FUNCTION analytics.amd_assert_scope_members(p_tenant uuid, p_domain uuid, p_entities uuid[], p_objectives uuid[], p_series text[], p_geographies text[]) RETURNS void
LANGUAGE plpgsql STABLE SET search_path = analytics, graph, prediction, pg_catalog, pg_temp AS $$
DECLARE e uuid; s text;
BEGIN
  IF coalesce(cardinality(p_entities), 0) + coalesce(cardinality(p_objectives), 0) + coalesce(cardinality(p_series), 0) + coalesce(cardinality(p_geographies), 0) = 0 THEN
    RAISE EXCEPTION 'analytics scope rejected (empty): a scope names at least one entity, objective, series or geography' USING ERRCODE = '22023';
  END IF;
  FOREACH e IN ARRAY coalesce(p_entities, '{}'::uuid[]) LOOP
    IF NOT EXISTS (SELECT 1 FROM graph.entities_current x WHERE x.entity_id = e AND x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.lifecycle_state = 'active') THEN
      RAISE EXCEPTION 'analytics scope rejected (unknown_entity): % is not an active graph entity of this domain', e USING ERRCODE = '23503';
    END IF;
  END LOOP;
  FOREACH e IN ARRAY coalesce(p_objectives, '{}'::uuid[]) LOOP
    IF NOT EXISTS (SELECT 1 FROM graph.strategy_current x WHERE x.strategy_object_id = e AND x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.object_type = 'OBJ' AND x.status = 'active') THEN
      RAISE EXCEPTION 'analytics scope rejected (unknown_objective): % is not an active objective of this domain', e USING ERRCODE = '23503';
    END IF;
  END LOOP;
  FOREACH s IN ARRAY coalesce(p_series, '{}'::text[]) LOOP
    IF NOT EXISTS (SELECT 1 FROM prediction.series_registry x WHERE x.series_key = s AND x.tenant_id = p_tenant AND x.domain_id = p_domain) THEN
      RAISE EXCEPTION 'analytics scope rejected (unknown_series): % is not a registered series of this domain', s USING ERRCODE = '23503';
    END IF;
  END LOOP;
  FOREACH s IN ARRAY coalesce(p_geographies, '{}'::text[]) LOOP
    IF s IS NULL OR s !~ '^[A-Za-z0-9][A-Za-z0-9 ._:-]{1,79}$' THEN
      RAISE EXCEPTION 'analytics scope rejected (geography): a geography is a named token (2–80 characters; letters, digits, space, dot, colon, dash)' USING ERRCODE = '22023';
    END IF;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION analytics.amd_assert_scope_members(uuid, uuid, uuid[], uuid[], text[], text[]) FROM PUBLIC;

/* PROPOSE a scope (analytics.scope.propose): a named human analyst or owner proposes the next version of a scope key — "the corridor": its
   entities, objectives, series and geographies, each a fact of the domain. One open proposal per key. */
CREATE OR REPLACE FUNCTION analytics.propose_scope(p_scope_id uuid, p_tenant uuid, p_domain uuid, p_key text, p_title text, p_entities uuid[], p_objectives uuid[], p_series text[], p_geographies text[],
                                                   p_description text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = analytics, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_next int; o analytics.scopes%ROWTYPE; v_digest text; v_e uuid[]; v_o uuid[]; v_s text[]; v_g text[];
BEGIN
  PERFORM observation.assert_authority(ARRAY['analytics.scope.propose']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM analytics.amd_assert_actor('analytics scope', p_actor);
  PERFORM analytics.amd_assert_human('analytics scope', p_actor, p_tenant, p_domain, ARRAY['product_analyst', 'product_analytics_owner'], 'a scope proposal');
  IF coalesce(p_key, '') !~ '^[a-z][a-z0-9_.-]{2,62}$' THEN RAISE EXCEPTION 'analytics scope rejected (key): a scope key is lower-case letters, digits, dot, dash or underscore (3–63 characters)' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_title, ''))) NOT BETWEEN 4 AND 200 THEN RAISE EXCEPTION 'analytics scope rejected (title): a title has 4–200 characters' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_description, ''))) NOT BETWEEN 8 AND 2000 THEN RAISE EXCEPTION 'analytics scope rejected (description): the description says how the scope applies (8–2000 characters)' USING ERRCODE = '22023'; END IF;
  v_e := ARRAY(SELECT DISTINCT x FROM unnest(coalesce(p_entities, '{}'::uuid[])) x ORDER BY x); v_o := ARRAY(SELECT DISTINCT x FROM unnest(coalesce(p_objectives, '{}'::uuid[])) x ORDER BY x);
  v_s := ARRAY(SELECT DISTINCT x FROM unnest(coalesce(p_series, '{}'::text[])) x ORDER BY x); v_g := ARRAY(SELECT DISTINCT btrim(x) FROM unnest(coalesce(p_geographies, '{}'::text[])) x ORDER BY 1);
  PERFORM analytics.amd_assert_scope_members(p_tenant, p_domain, v_e, v_o, v_s, v_g);
  SELECT * INTO o FROM analytics.scopes x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.scope_key = p_key AND x.state = 'proposed' ORDER BY x.version DESC LIMIT 1 FOR UPDATE;
  IF FOUND THEN RAISE EXCEPTION 'analytics scope rejected (state): version % of % is proposed; it is decided before the next', o.version, p_key USING ERRCODE = '22023'; END IF;
  SELECT coalesce(max(x.version), 0) + 1 INTO v_next FROM analytics.scopes x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.scope_key = p_key;
  v_digest := analytics.amd_scope_digest(p_key, btrim(p_title), v_e, v_o, v_s, v_g, btrim(p_description));
  INSERT INTO analytics.scopes (scope_id, scope, tenant_id, domain_id, scope_key, version, title, entity_ids, objective_ids, series_keys, geographies, description, state, digest, proposed_by, correlation_id)
  VALUES (p_scope_id, 'DOMAIN', p_tenant, p_domain, p_key, v_next, btrim(p_title), v_e, v_o, v_s, v_g, btrim(p_description), 'proposed', v_digest, p_actor, p_correlation);
  PERFORM analytics.amd_event(p_tenant, p_domain, 'scope', p_scope_id, p_key, v_next, 'scope.proposed', p_actor,
                              jsonb_build_object('digest', v_digest, 'entities', cardinality(v_e), 'objectives', cardinality(v_o), 'series', to_jsonb(v_s), 'geographies', to_jsonb(v_g)), p_correlation);
  RETURN (SELECT to_jsonb(x) FROM analytics.scopes x WHERE x.scope_id = p_scope_id);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION analytics.propose_scope(uuid,uuid,uuid,text,text,uuid[],uuid[],text[],text[],text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION analytics.propose_scope(uuid,uuid,uuid,text,text,uuid[],uuid[],text[],text[],text,uuid,uuid) TO eye_commit;

/* DECIDE a scope (analytics.scope.decide, human-gated): a named product analytics owner ≠ the proposer, at the digest read, with a reason; the
   members RE-VALIDATED (an entity retired since the proposal is refused); approval supersedes the prior approved version (results computed under
   it keep naming it). */
CREATE OR REPLACE FUNCTION analytics.decide_scope(p_scope_id uuid, p_tenant uuid, p_domain uuid, p_decision text, p_digest text, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = analytics, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE s analytics.scopes%ROWTYPE; v_reason text; v_prev uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['analytics.scope.decide']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM analytics.amd_assert_actor('analytics scope', p_actor);
  PERFORM analytics.amd_assert_human('analytics scope', p_actor, p_tenant, p_domain, ARRAY['product_analytics_owner'], 'a scope decision');
  SELECT * INTO s FROM analytics.scopes x WHERE x.scope_id = p_scope_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'analytics scope rejected (unknown_scope): % is not a scope of this domain', p_scope_id USING ERRCODE = '23503'; END IF;
  IF s.proposed_by = p_actor THEN RAISE EXCEPTION 'analytics scope rejected (separation_of_duties): the proposer of % v% does not decide it', s.scope_key, s.version USING ERRCODE = '42501'; END IF;
  IF s.state <> 'proposed' THEN RAISE EXCEPTION 'analytics scope rejected (state): % v% is %; only a proposed version is decided', s.scope_key, s.version, s.state USING ERRCODE = '22023'; END IF;
  IF p_decision NOT IN ('approve', 'reject') THEN RAISE EXCEPTION 'analytics scope rejected (decision): the decision is approve or reject' USING ERRCODE = '22023'; END IF;
  v_reason := analytics.amd_assert_reason('analytics scope', p_reason, 'a scope decision');
  IF p_digest IS DISTINCT FROM s.digest THEN
    RAISE EXCEPTION 'analytics scope rejected (stale): % v% is at digest %…, not the one decided (%…)', s.scope_key, s.version, left(s.digest, 12), left(coalesce(p_digest, '<none>'), 12) USING ERRCODE = '22023';
  END IF;
  IF p_decision = 'approve' THEN
    PERFORM analytics.amd_assert_scope_members(p_tenant, p_domain, s.entity_ids, s.objective_ids, s.series_keys, s.geographies);
    UPDATE analytics.scopes SET state = 'superseded' WHERE tenant_id = p_tenant AND domain_id = p_domain AND scope_key = s.scope_key AND state = 'approved' RETURNING scope_id INTO v_prev;
    UPDATE analytics.scopes SET state = 'approved', decided_by = p_actor, decided_at = clock_timestamp(), decision_reason = v_reason WHERE scope_id = p_scope_id;
  ELSE
    UPDATE analytics.scopes SET state = 'rejected', decided_by = p_actor, decided_at = clock_timestamp(), decision_reason = v_reason WHERE scope_id = p_scope_id;
  END IF;
  PERFORM analytics.amd_event(p_tenant, p_domain, 'scope', p_scope_id, s.scope_key, s.version, CASE WHEN p_decision = 'approve' THEN 'scope.approved' ELSE 'scope.rejected' END, p_actor,
                              jsonb_build_object('digest', s.digest, 'reason', v_reason, 'superseded', v_prev), p_correlation);
  IF v_prev IS NOT NULL THEN
    PERFORM analytics.amd_event(p_tenant, p_domain, 'scope', v_prev, s.scope_key, NULL, 'scope.superseded', p_actor, jsonb_build_object('by_version', s.version), p_correlation);
  END IF;
  RETURN (SELECT to_jsonb(x) FROM analytics.scopes x WHERE x.scope_id = p_scope_id);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION analytics.decide_scope(uuid,uuid,uuid,text,text,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION analytics.decide_scope(uuid,uuid,uuid,text,text,text,uuid,uuid) TO eye_commit;

/* RETIRE a scope (analytics.scope.retire, human-gated): the product analytics owner retires the approved version (a computation naming the key is
   then refused unknown_scope; results computed under it keep naming it). The reason goes to the ledger. */
CREATE OR REPLACE FUNCTION analytics.retire_scope(p_scope_id uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = analytics, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE s analytics.scopes%ROWTYPE; v_reason text; v_results int;
BEGIN
  PERFORM observation.assert_authority(ARRAY['analytics.scope.retire']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM analytics.amd_assert_actor('analytics scope', p_actor);
  PERFORM analytics.amd_assert_human('analytics scope', p_actor, p_tenant, p_domain, ARRAY['product_analytics_owner'], 'a scope retirement');
  SELECT * INTO s FROM analytics.scopes x WHERE x.scope_id = p_scope_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'analytics scope rejected (unknown_scope): % is not a scope of this domain', p_scope_id USING ERRCODE = '23503'; END IF;
  IF s.state <> 'approved' THEN RAISE EXCEPTION 'analytics scope rejected (state): % v% is %; the approved version is retired', s.scope_key, s.version, s.state USING ERRCODE = '22023'; END IF;
  v_reason := analytics.amd_assert_reason('analytics scope', p_reason, 'a retirement');
  UPDATE analytics.scopes SET state = 'retired', retired_at = clock_timestamp() WHERE scope_id = p_scope_id;
  SELECT count(*)::int INTO v_results FROM analytics.metric_results r WHERE r.scope_id = p_scope_id;
  PERFORM analytics.amd_event(p_tenant, p_domain, 'scope', p_scope_id, s.scope_key, s.version, 'scope.retired', p_actor,
                              jsonb_build_object('reason', v_reason, 'results_under_it', v_results, 'consequence', 'no new computation under this scope key; the results computed under it stay readable'), p_correlation);
  RETURN (SELECT to_jsonb(x) FROM analytics.scopes x WHERE x.scope_id = p_scope_id) || jsonb_build_object('results_under_it', v_results, 'reason', v_reason);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION analytics.retire_scope(uuid,uuid,uuid,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION analytics.retire_scope(uuid,uuid,uuid,text,uuid,uuid) TO eye_commit;

-- §MD.4 THE DEFINITIONS ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* PROPOSE a definition version (analytics.definition.propose): a named HUMAN product analyst or product analytics owner proposes the next version
   of a metric key with its whole CONTRACT (D2) — validated whole here (analytics.amd_validate_contract) and digested; one open proposal per key.
   An agent is refused AT THE PORT (AI computes and proposes findings; a definition is a human's proposal). The approval pending is routed as an
   `analytics.metric` item (subject the definition) under the published policy, the named owner kept. */
CREATE OR REPLACE FUNCTION analytics.propose_definition(p_definition uuid, p_tenant uuid, p_domain uuid, p_contract jsonb, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = analytics, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v jsonb; v_next int; o analytics.metric_definitions%ROWTYPE; v_digest text; v_item jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['analytics.definition.propose']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM analytics.amd_assert_actor('metric definition', p_actor);
  PERFORM analytics.amd_assert_human('metric definition', p_actor, p_tenant, p_domain, ARRAY['product_analyst', 'product_analytics_owner'], 'a definition proposal');
  v := analytics.amd_validate_contract(p_tenant, p_domain, p_contract);
  SELECT * INTO o FROM analytics.metric_definitions x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.metric_key = v ->> 'metric_key' AND x.state IN ('draft', 'proposed')
   ORDER BY x.version DESC LIMIT 1 FOR UPDATE;
  IF FOUND THEN RAISE EXCEPTION 'metric definition rejected (state): version % of % is %; it is decided before the next', o.version, o.metric_key, o.state USING ERRCODE = '22023'; END IF;
  SELECT coalesce(max(x.version), 0) + 1 INTO v_next FROM analytics.metric_definitions x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.metric_key = v ->> 'metric_key';
  v_digest := analytics.digest(analytics.definition_contract(v));
  IF EXISTS (SELECT 1 FROM analytics.metric_definitions x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.metric_key = v ->> 'metric_key' AND x.state = 'approved' AND x.digest = v_digest) THEN
    RAISE EXCEPTION 'metric definition rejected (duplicate): the contract of % is unchanged from its approved version (digest %…)', v ->> 'metric_key', left(v_digest, 12) USING ERRCODE = '23505';
  END IF;
  INSERT INTO analytics.metric_definitions (definition_id, scope, tenant_id, domain_id, metric_key, version, title, meaning, kind, unit, direction, population, numerator, denominator, exclusions,
                                            window_spec, dimensions, privacy_class, k_min, floor_n, threshold, purpose_key, serves, cadence, owner_principal_id, action, retirement, quality,
                                            cost_allocation, computation_key, params, supported, unsupported_reason, source_refs, state, digest, proposed_by, proposed_by_kind, correlation_id)
  VALUES (p_definition, 'DOMAIN', p_tenant, p_domain, v ->> 'metric_key', v_next, v ->> 'title', v ->> 'meaning', v ->> 'kind', v ->> 'unit', v ->> 'direction', v -> 'population',
          v ->> 'numerator', v ->> 'denominator', v -> 'exclusions', v -> 'window_spec', ARRAY(SELECT jsonb_array_elements_text(v -> 'dimensions')), v ->> 'privacy_class',
          (v ->> 'k_min')::int, (v ->> 'floor_n')::int, v -> 'threshold', v ->> 'purpose_key', v -> 'serves', v ->> 'cadence', (v ->> 'owner_principal_id')::uuid, v ->> 'action',
          v ->> 'retirement', v -> 'quality', v -> 'cost_allocation', v ->> 'computation_key', v -> 'params', (v ->> 'supported')::boolean, v ->> 'unsupported_reason',
          ARRAY(SELECT jsonb_array_elements_text(v -> 'source_refs')), 'proposed', v_digest, p_actor, 'human', p_correlation);
  PERFORM analytics.amd_event(p_tenant, p_domain, 'definition', p_definition, v ->> 'metric_key', v_next, 'definition.proposed', p_actor,
                              jsonb_build_object('digest', v_digest, 'supported', (v ->> 'supported')::boolean, 'computation_key', v ->> 'computation_key', 'purpose_key', v ->> 'purpose_key',
                                                 'pending', 'a named product analytics owner''s approval (never the proposer)'), p_correlation);
  v_item := executive.b33_raise_routed(p_tenant, p_domain, 'analytics.metric', 'metric_definition', p_definition,
              format('Metric definition %s v%s awaits approval', v ->> 'metric_key', v_next),
              jsonb_build_array(format('proposed by a named human; a product analytics owner approves or rejects it at digest %s…, never the proposer', left(v_digest, 12))),
              (v ->> 'owner_principal_id')::uuid, p_definition, 'analytics.definition.proposed',
              jsonb_build_object('metric_key', v ->> 'metric_key', 'version', v_next, 'digest', v_digest, 'pending', 'approval'), NULL, p_actor, p_correlation);
  RETURN (SELECT to_jsonb(x) FROM analytics.metric_definitions x WHERE x.definition_id = p_definition) || jsonb_build_object('contract', analytics.definition_contract(v), 'item', v_item);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION analytics.propose_definition(uuid,uuid,uuid,jsonb,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION analytics.propose_definition(uuid,uuid,uuid,jsonb,uuid,uuid) TO eye_commit;

/* DECIDE a definition (analytics.definition.decide, human-gated): a named product analytics owner — never the proposer (403), never an agent (403) —
   approves or rejects the proposed version AT THE DIGEST it saw (stale → 409), with a reason (8+). The whole contract is RE-VALIDATED first (the
   validation-to-effect boundary: the purpose still approved, the computation still registered with the same kind and dimensions, the owner still
   holding the role, the objectives still live). Approval: the prior approved version is SUPERSEDED (superseded_at now), this one is approved
   effective now. The routed item is closed. */
CREATE OR REPLACE FUNCTION analytics.decide_definition(p_definition uuid, p_tenant uuid, p_domain uuid, p_decision text, p_digest text, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = analytics, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE d analytics.metric_definitions%ROWTYPE; v_reason text; v_prev analytics.metric_definitions%ROWTYPE; v_now timestamptz := clock_timestamp(); v_closed jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['analytics.definition.decide']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM analytics.amd_assert_actor('metric definition', p_actor);
  PERFORM analytics.amd_assert_human('metric definition', p_actor, p_tenant, p_domain, ARRAY['product_analytics_owner'], 'a definition decision');
  SELECT * INTO d FROM analytics.metric_definitions x WHERE x.definition_id = p_definition AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'metric definition rejected (unknown_definition): % is not a metric definition of this domain', p_definition USING ERRCODE = '23503'; END IF;
  IF d.proposed_by = p_actor THEN RAISE EXCEPTION 'metric definition rejected (separation_of_duties): the proposer of % v% does not decide it — a named product analytics owner who did not propose it does', d.metric_key, d.version USING ERRCODE = '42501'; END IF;
  IF d.state <> 'proposed' THEN RAISE EXCEPTION 'metric definition rejected (state): % v% is %; only a proposed version is decided', d.metric_key, d.version, d.state USING ERRCODE = '22023'; END IF;
  IF p_decision NOT IN ('approve', 'reject') THEN RAISE EXCEPTION 'metric definition rejected (decision): the decision is approve or reject' USING ERRCODE = '22023'; END IF;
  v_reason := analytics.amd_assert_reason('metric definition', p_reason, 'a definition decision');
  IF p_digest IS DISTINCT FROM d.digest THEN
    RAISE EXCEPTION 'metric definition rejected (stale): % v% is at digest %…, not the one decided (%…) — read the contract again', d.metric_key, d.version, left(d.digest, 12), left(coalesce(p_digest, '<none>'), 12) USING ERRCODE = '22023';
  END IF;
  IF p_decision = 'approve' THEN
    PERFORM analytics.amd_validate_contract(p_tenant, p_domain, to_jsonb(d));
    SELECT * INTO v_prev FROM analytics.metric_definitions x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.metric_key = d.metric_key AND x.state = 'approved' FOR UPDATE;
    IF FOUND THEN
      UPDATE analytics.metric_definitions SET state = 'superseded', superseded_at = v_now WHERE definition_id = v_prev.definition_id;
      PERFORM analytics.amd_event(p_tenant, p_domain, 'definition', v_prev.definition_id, d.metric_key, v_prev.version, 'definition.superseded', p_actor,
                                  jsonb_build_object('by_version', d.version, 'diff', analytics.definition_diff_of(to_jsonb(v_prev), to_jsonb(d))), p_correlation);
    END IF;
    UPDATE analytics.metric_definitions SET state = 'approved', decided_by = p_actor, decided_at = v_now, decision_reason = v_reason, effective_from = v_now WHERE definition_id = p_definition;
  ELSE
    UPDATE analytics.metric_definitions SET state = 'rejected', decided_by = p_actor, decided_at = v_now, decision_reason = v_reason WHERE definition_id = p_definition;
  END IF;
  PERFORM analytics.amd_event(p_tenant, p_domain, 'definition', p_definition, d.metric_key, d.version, CASE WHEN p_decision = 'approve' THEN 'definition.approved' ELSE 'definition.rejected' END, p_actor,
                              jsonb_build_object('digest', d.digest, 'reason', v_reason, 'superseded_version', v_prev.version, 'effective_from', CASE WHEN p_decision = 'approve' THEN v_now END), p_correlation);
  v_closed := executive.b33_close_items(p_tenant, p_domain, 'analytics.metric', 'metric_definition', p_definition,
                format('definition %s v%s %s by a named product analytics owner', d.metric_key, d.version, CASE WHEN p_decision = 'approve' THEN 'approved' ELSE 'rejected' END), p_actor, p_correlation);
  RETURN (SELECT to_jsonb(x) FROM analytics.metric_definitions x WHERE x.definition_id = p_definition) || jsonb_build_object('superseded', v_prev.definition_id, 'items_closed', v_closed);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION analytics.decide_definition(uuid,uuid,uuid,text,text,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION analytics.decide_definition(uuid,uuid,uuid,text,text,text,uuid,uuid) TO eye_commit;

/* RETIRE a definition (analytics.definition.retire, human-gated): a named product analytics owner retires the APPROVED version with a reason; the
   computation stops (the compute port finds no approved version), the history stays readable, and the USES of the key's results — every
   version's — are LISTED in the retirement event and the answer. Nothing is refused because of a use: the citing records keep their citation. */
CREATE OR REPLACE FUNCTION analytics.retire_definition(p_definition uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = analytics, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE d analytics.metric_definitions%ROWTYPE; v_reason text; v_uses jsonb; v_closed jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['analytics.definition.retire']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM analytics.amd_assert_actor('metric definition', p_actor);
  PERFORM analytics.amd_assert_human('metric definition', p_actor, p_tenant, p_domain, ARRAY['product_analytics_owner'], 'a definition retirement');
  SELECT * INTO d FROM analytics.metric_definitions x WHERE x.definition_id = p_definition AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'metric definition rejected (unknown_definition): % is not a metric definition of this domain', p_definition USING ERRCODE = '23503'; END IF;
  IF d.state <> 'approved' THEN RAISE EXCEPTION 'metric definition rejected (state): % v% is %; the approved version is retired (a proposal is rejected instead)', d.metric_key, d.version, d.state USING ERRCODE = '22023'; END IF;
  v_reason := analytics.amd_assert_reason('metric definition', p_reason, 'a retirement');
  SELECT coalesce(jsonb_agg(jsonb_build_object('use_id', u.use_id, 'used_in_kind', u.used_in_kind, 'used_in_id', u.used_in_id, 'result_id', u.result_id, 'definition_version', r.definition_version,
                                               'period_key', r.period_key, 'result_state', r.state, 'used_at', u.used_at) ORDER BY u.used_at), '[]'::jsonb)
    INTO v_uses FROM analytics.metric_uses u JOIN analytics.metric_results r ON r.result_id = u.result_id
   WHERE r.tenant_id = p_tenant AND r.domain_id = p_domain AND r.metric_key = d.metric_key;
  UPDATE analytics.metric_definitions SET state = 'retired', retired_by = p_actor, retired_at = clock_timestamp(), retire_reason = v_reason WHERE definition_id = p_definition;
  PERFORM analytics.amd_event(p_tenant, p_domain, 'definition', p_definition, d.metric_key, d.version, 'definition.retired', p_actor,
                              jsonb_build_object('reason', v_reason, 'retirement_condition', d.retirement, 'uses', v_uses,
                                                 'consequence', 'computation stops (no approved version); results, records and uses stay readable; citing records keep their citations'), p_correlation);
  v_closed := executive.b33_close_items(p_tenant, p_domain, NULL, 'metric_definition', p_definition, format('definition %s v%s retired', d.metric_key, d.version), p_actor, p_correlation);
  RETURN (SELECT to_jsonb(x) FROM analytics.metric_definitions x WHERE x.definition_id = p_definition) || jsonb_build_object('uses', v_uses, 'items_closed', v_closed);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION analytics.retire_definition(uuid,uuid,uuid,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION analytics.retire_definition(uuid,uuid,uuid,text,uuid,uuid) TO eye_commit;

-- §MD.5 THE USES LEDGER (PR-70-002 `decision`; ES-40-008's governance) ────────────────────────────────────────────────────────────────────────
/* Whether a citing object exists in the domain: a decision package, a briefing, a publication — and analytics' own reviews, findings and exports
   by uuid lookup WHEN their table is present (§OR / §UX; an absent table means no such object yet → unknown). */
CREATE OR REPLACE FUNCTION analytics.amd_citing_exists(p_tenant uuid, p_domain uuid, p_kind text, p_id uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SET search_path = analytics, decision, executive, pg_catalog, pg_temp AS $$
DECLARE v_table text; v_col text; v_ok boolean := false;
BEGIN
  CASE p_kind
    WHEN 'decision_package' THEN RETURN EXISTS (SELECT 1 FROM decision.packages_current x WHERE x.package_id = p_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain);
    WHEN 'briefing' THEN RETURN EXISTS (SELECT 1 FROM executive.briefings x WHERE x.briefing_id = p_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain);
    WHEN 'publication' THEN RETURN EXISTS (SELECT 1 FROM executive.publications x WHERE x.publication_id = p_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain);
    WHEN 'operating_review' THEN v_table := 'analytics.operating_reviews'; v_col := 'review_id';
    WHEN 'finding' THEN v_table := coalesce(CASE WHEN to_regclass('analytics.experience_findings') IS NOT NULL THEN 'analytics.experience_findings' END,
                                            CASE WHEN to_regclass('analytics.findings') IS NOT NULL THEN 'analytics.findings' END); v_col := 'finding_id';
    WHEN 'export' THEN v_table := 'analytics.exports'; v_col := 'export_id';
    ELSE RETURN false;
  END CASE;
  IF v_table IS NULL OR to_regclass(v_table) IS NULL THEN RETURN false; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = to_regclass(v_table) AND a.attname = v_col AND NOT a.attisdropped) THEN RETURN false; END IF;
  EXECUTE format('SELECT EXISTS (SELECT 1 FROM %s x WHERE x.%I = $1 AND x.tenant_id = $2 AND x.domain_id = $3)', v_table, v_col) INTO v_ok USING p_id, p_tenant, p_domain;
  RETURN coalesce(v_ok, false);
END $$;
REVOKE ALL ON FUNCTION analytics.amd_citing_exists(uuid, uuid, text, uuid) FROM PUBLIC;

/* RECORD A USE (analytics.use.record): a result cited in an operating review, a decision package, a briefing, a publication, an export or a
   finding. The citing object exists in the domain (else 404). A PREVIEW (computed on a proposed definition), a REPLAY, or a result of a definition
   that is no longer current (superseded or retired) is refused `(state)` 409 — never served as current. ES-40-008: an INDETERMINATE or
   UNSUPPORTED result cited in a BRIEFING or a PUBLICATION is refused `(state)` 409 unless the citation is explicitly QUALIFIED (qualified = true and
   a note that says the result is indeterminate / unsupported) — a failed or indeterminate indicator constrains downstream use; it is never
   presented as current and complete. The use row references the (immutable) result, so it records the state cited; the ledger event says it. */
CREATE OR REPLACE FUNCTION analytics.record_use(p_use uuid, p_tenant uuid, p_domain uuid, p_result uuid, p_kind text, p_used_in uuid, p_note text, p_qualified boolean, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = analytics, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r analytics.metric_results%ROWTYPE; d analytics.metric_definitions%ROWTYPE; v_note text := nullif(btrim(coalesce(p_note, '')), ''); v_qualified boolean := coalesce(p_qualified, false);
BEGIN
  PERFORM observation.assert_authority(ARRAY['analytics.use.record']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM analytics.amd_assert_actor('metric use', p_actor);
  IF NOT executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['product_analyst', 'product_analytics_owner', 'executive', 'executive_operator', 'strategy_owner', 'decision_owner', 'risk_owner', 'forecast_owner']) THEN
    RAISE EXCEPTION 'metric use rejected (authority): a use is recorded by a product analyst or owner, an executive, or the strategy, decision, risk or forecast owner who cites it' USING ERRCODE = '42501';
  END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('operating_review', 'decision_package', 'briefing', 'publication', 'export', 'finding') THEN
    RAISE EXCEPTION 'metric use rejected (kind): a result is cited in an operating_review, decision_package, briefing, publication, export or finding' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO r FROM analytics.metric_results x WHERE x.result_id = p_result AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'metric use rejected (unknown_result): % is not a result of this domain', p_result USING ERRCODE = '23503'; END IF;
  IF NOT analytics.amd_citing_exists(p_tenant, p_domain, p_kind, p_used_in) THEN
    RAISE EXCEPTION 'metric use rejected (unknown_%): % is not a % of this domain', p_kind, p_used_in, replace(p_kind, '_', ' ') USING ERRCODE = '23503';
  END IF;
  IF r.preview THEN RAISE EXCEPTION 'metric use rejected (state): result % is a PREVIEW computed on a proposed definition for its review — never cited as current', p_result USING ERRCODE = '22023'; END IF;
  IF r.replay_of IS NOT NULL THEN RAISE EXCEPTION 'metric use rejected (state): result % is a replay of %; the original is cited', p_result, r.replay_of USING ERRCODE = '22023'; END IF;
  SELECT * INTO d FROM analytics.metric_definitions x WHERE x.definition_id = r.definition_id;
  IF d.state <> 'approved' THEN
    RAISE EXCEPTION 'metric use rejected (state): result % was computed on % v%, which is now % — a non-current definition''s result is not cited as current (compute it again under the approved version)', p_result, d.metric_key, d.version, d.state USING ERRCODE = '22023';
  END IF;
  IF r.state <> 'determinate' AND p_kind IN ('briefing', 'publication') THEN
    IF NOT v_qualified THEN
      RAISE EXCEPTION 'metric use rejected (state): result % of % is % (%) — a briefing or publication cites it only QUALIFIED (qualified: true and a note saying it is %), never as current and complete',
        p_result, r.metric_key, r.state, left(coalesce(r.reasons ->> 0, ''), 200), r.state USING ERRCODE = '22023';
    END IF;
    IF v_note IS NULL OR length(v_note) < 16 OR v_note !~* r.state THEN
      RAISE EXCEPTION 'metric use rejected (qualification): the qualification note states that the result is % (16+ characters naming the state)', r.state USING ERRCODE = '22023';
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM analytics.metric_uses x WHERE x.result_id = p_result AND x.used_in_kind = p_kind AND x.used_in_id = p_used_in) THEN
    RAISE EXCEPTION 'metric use rejected (duplicate): result % is already cited in that %', p_result, replace(p_kind, '_', ' ') USING ERRCODE = '23505';
  END IF;
  INSERT INTO analytics.metric_uses (use_id, scope, tenant_id, domain_id, result_id, used_in_kind, used_in_id, note, used_by, correlation_id)
  VALUES (p_use, 'DOMAIN', p_tenant, p_domain, p_result, p_kind, p_used_in, v_note, p_actor, p_correlation);
  PERFORM analytics.amd_event(p_tenant, p_domain, 'use', p_use, r.metric_key, r.definition_version, 'use.recorded', p_actor,
                              jsonb_build_object('result_id', p_result, 'used_in_kind', p_kind, 'used_in_id', p_used_in, 'result_state', r.state, 'qualified', v_qualified AND r.state <> 'determinate',
                                                 'period_key', r.period_key, 'scope_key', r.scope_key, 'source_revision', r.source_revision), p_correlation);
  RETURN (SELECT to_jsonb(x) FROM analytics.metric_uses x WHERE x.use_id = p_use)
         || jsonb_build_object('result_state', r.state, 'qualified', v_qualified AND r.state <> 'determinate', 'metric_key', r.metric_key, 'definition_version', r.definition_version, 'period_key', r.period_key);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION analytics.record_use(uuid,uuid,uuid,uuid,text,uuid,text,boolean,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION analytics.record_use(uuid,uuid,uuid,uuid,text,uuid,text,boolean,uuid,uuid) TO eye_commit;

-- §MD.6 DP-44-005 — THE USES OF A B90 METRIC SERVING ──────────────────────────────────────────────────────────────────────────────────────────
/* A decision package, a briefing or a publication citing a B90 metric SERVING (products.metric_servings): the reports and decisions a withdrawn
   metric affected are LINKED (the servings ledger exposed only the readers). Append-only. */
CREATE TABLE products.metric_serving_uses (
  use_id          uuid PRIMARY KEY,
  scope           text NOT NULL,
  tenant_id       uuid NOT NULL,
  domain_id       uuid NOT NULL,
  serving_id      uuid NOT NULL REFERENCES products.metric_servings (serving_id),
  model_id        uuid NOT NULL REFERENCES products.semantic_models (model_id),
  version         int  NOT NULL,
  view            text NOT NULL,
  certified       boolean NOT NULL,                       -- the serving's standing when served (copied)
  used_in_kind    text NOT NULL CHECK (used_in_kind IN ('decision_package', 'briefing', 'publication')),
  used_in_id      uuid NOT NULL,
  note            text,
  used_by         uuid NOT NULL,
  used_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id  uuid NOT NULL,
  CONSTRAINT pmsu_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT pmsu_once UNIQUE (serving_id, used_in_kind, used_in_id)
);
CREATE INDEX pmsu_model ON products.metric_serving_uses (model_id, used_at);
CREATE TRIGGER pmsu_append_only BEFORE UPDATE OR DELETE ON products.metric_serving_uses FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE products.metric_serving_uses IS 'B92 §MD (0113; DP-44-005): the decision packages, briefings and publications that CITE a metric serving — the withdrawal of the metric lists them beside the servings. Append-only.';
REVOKE ALL ON products.metric_serving_uses FROM PUBLIC;
ALTER TABLE products.metric_serving_uses ENABLE ROW LEVEL SECURITY;
ALTER TABLE products.metric_serving_uses FORCE ROW LEVEL SECURITY;
CREATE POLICY products_isolation ON products.metric_serving_uses
  USING (tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain()));
GRANT SELECT ON products.metric_serving_uses TO eye_app, eye_commit;

/* RECORD A SERVING USE (products.metric.use): the citing object exists in the domain (else 404); a RECALCULATION serving is not a reading and is
   not cited `(state)`; an UNCERTIFIED serving (the analyst view's marked one) is cited in a briefing or publication only qualified — never as an
   executive basis (`(state)` 409, the B90 note's own rule). */
CREATE OR REPLACE FUNCTION products.record_metric_serving_use(p_use uuid, p_tenant uuid, p_domain uuid, p_serving uuid, p_kind text, p_used_in uuid, p_note text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = products, analytics, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE s products.metric_servings%ROWTYPE; m products.semantic_models%ROWTYPE; v_note text := nullif(btrim(coalesce(p_note, '')), '');
BEGIN
  PERFORM observation.assert_authority(ARRAY['products.metric.use']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM analytics.amd_assert_actor('metric use', p_actor);
  IF NOT executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['executive', 'executive_operator', 'strategy_owner', 'decision_owner', 'decision_authority', 'risk_owner', 'forecast_owner',
                                                               'data_steward', 'domain_analyst', 'product_analyst', 'product_analytics_owner']) THEN
    RAISE EXCEPTION 'metric use rejected (authority): a serving''s use is recorded by the executive, strategy, decision, risk or forecast owner, the steward or an analyst who cites it' USING ERRCODE = '42501';
  END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('decision_package', 'briefing', 'publication') THEN
    RAISE EXCEPTION 'metric use rejected (kind): a serving is cited in a decision_package, briefing or publication' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO s FROM products.metric_servings x WHERE x.serving_id = p_serving AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'metric use rejected (unknown_serving): % is not a metric serving of this domain', p_serving USING ERRCODE = '23503'; END IF;
  IF NOT analytics.amd_citing_exists(p_tenant, p_domain, p_kind, p_used_in) THEN
    RAISE EXCEPTION 'metric use rejected (unknown_%): % is not a % of this domain', p_kind, p_used_in, replace(p_kind, '_', ' ') USING ERRCODE = '23503';
  END IF;
  IF s.view = 'recalculation' THEN RAISE EXCEPTION 'metric use rejected (state): serving % is a recalculation (a reproducibility check), not a reading to cite', p_serving USING ERRCODE = '22023'; END IF;
  IF NOT s.certified AND p_kind IN ('briefing', 'publication') AND (v_note IS NULL OR v_note !~* 'uncertified') THEN
    RAISE EXCEPTION 'metric use rejected (state): serving % was UNCERTIFIED (the analyst view''s marked serving) — a briefing or publication cites it only with a note saying it is uncertified', p_serving USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM products.metric_serving_uses x WHERE x.serving_id = p_serving AND x.used_in_kind = p_kind AND x.used_in_id = p_used_in) THEN
    RAISE EXCEPTION 'metric use rejected (duplicate): serving % is already cited in that %', p_serving, replace(p_kind, '_', ' ') USING ERRCODE = '23505';
  END IF;
  SELECT * INTO m FROM products.semantic_models x WHERE x.model_id = s.model_id;
  INSERT INTO products.metric_serving_uses (use_id, scope, tenant_id, domain_id, serving_id, model_id, version, view, certified, used_in_kind, used_in_id, note, used_by, correlation_id)
  VALUES (p_use, 'DOMAIN', p_tenant, p_domain, p_serving, s.model_id, s.version, s.view, s.certified, p_kind, p_used_in, v_note, p_actor, p_correlation);
  -- the ledger: analytics' own (products.product_events' vocabulary is B90's and is not re-declared here)
  PERFORM analytics.amd_event(p_tenant, p_domain, 'use', p_use, m.metric_key, s.version, 'serving_use.recorded', p_actor,
                              jsonb_build_object('serving_id', p_serving, 'model_id', s.model_id, 'used_in_kind', p_kind, 'used_in_id', p_used_in, 'view', s.view, 'certified', s.certified,
                                                 'source_revision', s.source_revision), p_correlation);
  RETURN (SELECT to_jsonb(x) FROM products.metric_serving_uses x WHERE x.use_id = p_use) || jsonb_build_object('metric_key', m.metric_key);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION products.record_metric_serving_use(uuid,uuid,uuid,uuid,text,uuid,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION products.record_metric_serving_use(uuid,uuid,uuid,uuid,text,uuid,text,uuid,uuid) TO eye_commit;

/* THE WITHDRAWAL STEP (private — the ports below call it inside their own transaction; it is no port: it asserts nothing itself, the
   caller did): the active certification moves to `withdrawn` or `expired` with the reason, the model's state follows and its last valid
   version is frozen readable; the servings since the certification are LISTED ("expose affected reports and decisions") in the answer and
   in the event's details. */
-- B92 md (DP-44-005): copied WHOLE from its last definition (0095:2731; no later re-declaration) — the USES of those servings (the decision
-- packages, briefings and publications that cited them, products.metric_serving_uses) are listed beside the servings, in the answer and the event.
CREATE OR REPLACE FUNCTION products.metric_withdraw(p_model_id uuid, p_state text, p_reason text, p_detail jsonb, p_actor uuid, p_event_id uuid, p_correlation uuid) RETURNS jsonb
SET search_path = products, pg_catalog, pg_temp AS $$
DECLARE m products.semantic_models%ROWTYPE; c products.metric_certifications%ROWTYPE; v_servings jsonb;
        v_uses jsonb;   -- B92 md
BEGIN
  SELECT * INTO m FROM products.semantic_models x WHERE x.model_id = p_model_id FOR UPDATE;
  SELECT * INTO c FROM products.metric_certifications x WHERE x.model_id = p_model_id AND x.state = 'active' ORDER BY x.certified_at DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('serving_id', s.serving_id, 'view', s.view, 'grain', s.grain, 'as_of', s.as_of, 'served_to', s.served_to, 'served_at', s.served_at, 'value_digest', s.value_digest) ORDER BY s.served_at), '[]'::jsonb)
    INTO v_servings FROM products.metric_servings s WHERE s.model_id = p_model_id AND s.served_at >= c.certified_at AND s.view IN ('executive', 'analyst');
  -- B92 md: the uses of the exposed servings — the reports and decisions the withdrawal affects
  SELECT coalesce(jsonb_agg(jsonb_build_object('use_id', u.use_id, 'serving_id', u.serving_id, 'used_in_kind', u.used_in_kind, 'used_in_id', u.used_in_id, 'used_by', u.used_by, 'used_at', u.used_at,
                                               'certified', u.certified) ORDER BY u.used_at), '[]'::jsonb)
    INTO v_uses FROM products.metric_serving_uses u JOIN products.metric_servings s ON s.serving_id = u.serving_id
   WHERE u.model_id = p_model_id AND s.served_at >= c.certified_at AND s.view IN ('executive', 'analyst');
  UPDATE products.metric_certifications SET state = p_state, withdrawn_at = clock_timestamp(), withdrawn_by = p_actor, withdrawal_reason = btrim(p_reason) WHERE certification_id = c.certification_id;
  UPDATE products.semantic_models SET state = p_state, certified_version = NULL, last_valid_version = c.version, updated_at = clock_timestamp() WHERE model_id = p_model_id;
  INSERT INTO products.product_events (event_id, scope, tenant_id, domain_id, product_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', m.tenant_id, m.domain_id, p_model_id, 'metric.certification_withdrawn', p_actor,
          jsonb_build_object('certification_id', c.certification_id, 'version', c.version, 'state', p_state, 'reason', btrim(p_reason), 'detail', coalesce(p_detail, '{}'::jsonb),
                             'last_valid_version', c.version, 'servings_exposed', v_servings,
                             'uses_exposed', v_uses), p_correlation);   -- B92 md
  RETURN jsonb_build_object('certification_id', c.certification_id, 'version', c.version, 'state', p_state, 'reason', btrim(p_reason), 'event_id', p_event_id, 'servings_exposed', v_servings,
                            'uses_exposed', v_uses,   -- B92 md
                            'consequence', 'the last valid version ' || c.version || ' is frozen and stays readable; the executive view serves nothing until the owner re-certifies');
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION products.metric_withdraw(uuid,text,text,jsonb,uuid,uuid,uuid) FROM PUBLIC;

-- §MD.7 THE READS (INVOKER, under the caller's RLS — N-01) ─────────────────────────────────────────────────────────────────────────────────────
/* The field-level diff between two versions of a definition (both readable to the caller), with their digests. */
CREATE OR REPLACE FUNCTION analytics.definition_diff(p_from uuid, p_to uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = analytics, pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object('from', jsonb_build_object('definition_id', a.definition_id, 'metric_key', a.metric_key, 'version', a.version, 'state', a.state, 'digest', a.digest),
                            'to', jsonb_build_object('definition_id', b.definition_id, 'metric_key', b.metric_key, 'version', b.version, 'state', b.state, 'digest', b.digest),
                            'changed', analytics.definition_diff_of(to_jsonb(a), to_jsonb(b)))
    FROM analytics.metric_definitions a, analytics.metric_definitions b WHERE a.definition_id = p_from AND b.definition_id = p_to
$$;
GRANT EXECUTE ON FUNCTION analytics.definition_diff(uuid, uuid) TO eye_app, eye_commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §MCA — computations A: decisions, strategy, foresight, warnings, forecasts (MET-001..005, MET-019..030, V01-T-046, ES-40-008)
-- (folded at integration from the part-local file 0113_b92_x_mca.sql, unchanged but for the integrator's marked lines; apply order §0, §MD, §MCA, §MCB, §CO, §UX, §OR, §I)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0113 §MCA — CP-6 B92 COMPUTATIONS A: the product metrics of decisions, strategy, foresight, warnings and forecasts (App M MET-001..005,
-- MET-019..030; V1 V01-T-046's measures with a source in the product; ES-40-008's two new indicators — residual R1 of §B36.12 row 9).
-- Part-local; applies ALONE on 0001–0112 + the 0113 prelude. Nothing of 0001–0112 or of the prelude is re-declared here.
--
-- Each computation keeps the prelude's §0.7 CONTRACT: analytics.mc_<key>(p_tenant, p_domain, p_from, p_to, p_as_of, p_scope, p_cohort, p_params)
-- RETURNS jsonb, SECURITY DEFINER, N-01 read-scope guard first; it reads ONLY rows recorded at or before p_as_of (replay), restricts to the
-- window on the definition's clock, applies the scope by its registered rule and the cohort over its registered dimensions — never a person;
-- it returns the RECORDS (the port derives n, the value and the uncertainty from them) with every exclusion's reason, and the reasons that
-- make the result indeterminate (an absent input, an unsupported clock). Records name RECORDS (packages, warnings, outcomes …) and ROLES —
-- never a principal id (D4: no employee-performance inference).
--
-- The computations WRAP the product's existing meanings and never re-derive a different one: decision.decision_metrics (outcome linkage,
-- the option criteria), decision.recommendation_completeness (alternatives, uncertainty), decision.dsp_citation_states (a citation's
-- standing), prediction.evaluate_warnings (feedback rates, the acknowledgement clock), executive.metrics (time to understanding, decision
-- latency), executive.evaluate_attention_queue (precision), ForecastingService.calibration (covered = q10 ≤ observed ≤ q90 on the outcome
-- ledger). Where the wrapped read is evaluated NOW (decision_metrics, dsp_citation_states), the same predicate is evaluated here AT p_as_of
-- (a replay must reproduce) — said on each contract.
--
-- CLAIMS: this is SOFTWARE CAPABILITY. The harness proves it on SYNTHETIC planted records; the act demonstrates it on NORDWERK's SYNTHETIC
-- demonstration records; neither is real-provider or signed acceptance (R2). A synthetic channel's receipts (demo-mailbox) are excluded from
-- latency unless a definition admits them, and then said.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- §MCA.0 HELPERS (internal; no runtime grant) ─────────────────────────────────────────────────────────────────────────────────────────────
/* lower-cased text[] of a scope key (objective_ids, entity_ids, series_keys, geographies); {} when absent. */
CREATE OR REPLACE FUNCTION analytics.mca_txt(p_scope jsonb, p_key text) RETURNS text[]
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT coalesce((SELECT array_agg(lower(x)) FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(p_scope -> p_key) = 'array' THEN p_scope -> p_key ELSE '[]'::jsonb END) x), '{}')
$$;
/* lower-cased text[] of any text[]. */
CREATE OR REPLACE FUNCTION analytics.mca_lower(p text[]) RETURNS text[]
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$ SELECT coalesce((SELECT array_agg(lower(x)) FROM unnest(p) x WHERE x IS NOT NULL), '{}') $$;
/* lower-cased text[] of a jsonb array of strings (or {} for anything else). */
CREATE OR REPLACE FUNCTION analytics.mca_jtxt(p jsonb) RETURNS text[]
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT coalesce((SELECT array_agg(lower(x #>> '{}')) FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p) = 'array' THEN p ELSE '[]'::jsonb END) x WHERE jsonb_typeof(x) = 'string'), '{}')
$$;
/* THE SCOPE RULE (PARTS.md vocabulary): what a record names (objectives, entities, series, geographies) against the scope → the matches
   ("objective", "entity", "series", "geography"); {domain} for a NULL scope (the whole domain); {} = outside the scope. */
CREATE OR REPLACE FUNCTION analytics.mca_scope_via(p_scope jsonb, p_objectives text[], p_entities text[], p_series text[], p_geographies text[]) RETURNS text[]
LANGUAGE sql IMMUTABLE SET search_path = analytics, pg_catalog, pg_temp AS $$
  SELECT CASE WHEN p_scope IS NULL THEN ARRAY['domain'] ELSE array_remove(ARRAY[
    CASE WHEN analytics.mca_txt(p_scope, 'objective_ids') && analytics.mca_lower(p_objectives) THEN 'objective' END,
    CASE WHEN analytics.mca_txt(p_scope, 'entity_ids') && analytics.mca_lower(p_entities) THEN 'entity' END,
    CASE WHEN analytics.mca_txt(p_scope, 'series_keys') && analytics.mca_lower(p_series) THEN 'series' END,
    CASE WHEN analytics.mca_txt(p_scope, 'geographies') && analytics.mca_lower(p_geographies) THEN 'geography' END], NULL) END
$$;
/* The clock check: a computation reading on `p_supported` clocks only; the definition's clock otherwise is a REASON (mixing clocks inside
   one population is never done silently — D7). */
CREATE OR REPLACE FUNCTION analytics.mca_clock_reasons(p_params jsonb, p_supported text[]) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT CASE WHEN coalesce(p_params ->> 'clock', 'record') = ANY (p_supported) THEN '[]'::jsonb
              ELSE jsonb_build_array(format('the definition''s clock is %s; this computation reads on the %s clock only — a different clock is not substituted', coalesce(p_params ->> 'clock', 'record'), array_to_string(p_supported, ' / '))) END
$$;
/* The §0.7 answer: the counts derived from the records themselves (the port cross-checks them); quality carries, beside the computation's
   own notes, what the standing evaluation (§CO) reads: newest_record_at (the newest instant among the population's records — p_at_key names
   the detail field that holds it), excluded_count, and composition (counts of the population's records by p_comp_key — a detail field, or
   `_kind` for the record kind; by role when none is named). */
CREATE OR REPLACE FUNCTION analytics.mca_out(p_kind text, p_records jsonb, p_reasons jsonb, p_quality jsonb, p_distinct_actors int DEFAULT NULL, p_value numeric DEFAULT NULL,
                                             p_comp_key text DEFAULT NULL, p_at_key text DEFAULT NULL) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object('kind', p_kind,
    'numerator', CASE WHEN p_kind = 'rate' THEN (SELECT count(*) FROM jsonb_array_elements(coalesce(p_records, '[]'::jsonb)) r WHERE r ->> 'role' = 'numerator') END,
    'denominator', CASE WHEN p_kind = 'rate' THEN (SELECT count(*) FROM jsonb_array_elements(coalesce(p_records, '[]'::jsonb)) r WHERE r ->> 'role' IN ('numerator', 'denominator')) END,
    'value', p_value, 'distinct_actors', p_distinct_actors,
    'records', coalesce(p_records, '[]'::jsonb), 'reasons', coalesce(p_reasons, '[]'::jsonb),
    'quality', coalesce(p_quality, '{}'::jsonb) || jsonb_build_object(
      'excluded_count', (SELECT count(*) FROM jsonb_array_elements(coalesce(p_records, '[]'::jsonb)) r WHERE r ->> 'role' = 'excluded'),
      'newest_record_at', CASE WHEN p_at_key IS NULL THEN NULL ELSE
        (SELECT max((r -> 'detail' ->> p_at_key)::timestamptz) FROM jsonb_array_elements(coalesce(p_records, '[]'::jsonb)) r
          WHERE r ->> 'role' <> 'context' AND jsonb_typeof(r -> 'detail' -> p_at_key) = 'string') END,
      'composition', jsonb_build_object('by', coalesce(p_comp_key, 'role'), 'counts', coalesce((SELECT jsonb_object_agg(k, n) FROM (
          SELECT coalesce(CASE WHEN p_comp_key IS NULL THEN r ->> 'role' WHEN p_comp_key = '_kind' THEN r ->> 'kind' ELSE r -> 'detail' ->> p_comp_key END, 'unspecified') AS k, count(*) AS n
            FROM jsonb_array_elements(coalesce(p_records, '[]'::jsonb)) r WHERE r ->> 'role' <> 'context' GROUP BY 1) z), '{}'::jsonb))))
$$;
/* A record of the §0.7 shape. */
CREATE OR REPLACE FUNCTION analytics.mca_rec(p_kind text, p_id text, p_role text, p_reason text, p_detail jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT jsonb_strip_nulls(jsonb_build_object('kind', p_kind, 'id', p_id, 'role', p_role, 'reason', p_reason)) || jsonb_build_object('detail', coalesce(p_detail, '{}'::jsonb))
$$;
/* Whether a principal is an active-or-past HUMAN (an agent's act is never a human's). */
CREATE OR REPLACE FUNCTION analytics.mca_is_human(p_principal uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path = identity, pg_catalog, pg_temp AS $$ SELECT coalesce((SELECT p.kind = 'human' FROM identity.principals p WHERE p.id = p_principal), false) $$;
/* The first of p_roles (in their order) the principal HELD at p_at at the domain (a DOMAIN or TENANT binding, or PLATFORM) — a ROLE, the
   only grain a cohort may carry; NULL when none. */
CREATE OR REPLACE FUNCTION analytics.mca_role_at(p_principal uuid, p_tenant uuid, p_domain uuid, p_roles text[], p_at timestamptz) RETURNS text
LANGUAGE sql STABLE SET search_path = identity, pg_catalog, pg_temp AS $$
  SELECT u.r FROM unnest(p_roles) WITH ORDINALITY AS u(r, o)
   WHERE EXISTS (SELECT 1 FROM identity.role_bindings b JOIN identity.principals p ON p.id = b.principal_id
                  WHERE b.principal_id = p_principal AND p.kind = 'human' AND b.role_code = u.r AND b.created_at <= p_at AND (b.revoked_at IS NULL OR b.revoked_at > p_at)
                    AND (b.scope = 'PLATFORM' OR (b.tenant_id = p_tenant AND (b.scope = 'TENANT' OR (b.scope = 'DOMAIN' AND b.domain_id = p_domain)))))
   ORDER BY u.o LIMIT 1
$$;
/* A CITATION'S STANDING AS OF an instant — decision.dsp_citation_states' rule evaluated at p_as_of (it reads now): a run is standing when
   completed by then and not invalidated by then; a forecast when issued by then and not withdrawn by then; a canonical object (evidence,
   claim …) when its newest version recorded by then is neither disputed nor withdrawn/deleted. 'missing' when nothing is recorded. */
CREATE OR REPLACE FUNCTION analytics.mca_standing(p_kind text, p_id uuid, p_tenant uuid, p_domain uuid, p_as_of timestamptz) RETURNS text
LANGUAGE plpgsql STABLE SET search_path = analytics, simulation, prediction, objects, pg_catalog, pg_temp AS $$
DECLARE s text;
BEGIN
  IF p_id IS NULL THEN RETURN 'missing'; END IF;
  IF p_kind = 'run' THEN
    SELECT CASE WHEN r.run_id IS NULL THEN 'missing' WHEN r.state <> 'completed' OR r.completed_at IS NULL OR r.completed_at > p_as_of THEN 'not_completed'
                WHEN r.validity = 'invalidated' AND r.invalidated_at <= p_as_of THEN 'withdrawn' ELSE 'standing' END INTO s
      FROM (SELECT 1) one LEFT JOIN simulation.runs_current r ON r.run_id = p_id AND r.tenant_id = p_tenant AND r.domain_id = p_domain AND r.opened_at <= p_as_of;
  ELSIF p_kind = 'forecast' THEN
    SELECT CASE WHEN f.forecast_id IS NULL THEN 'missing' WHEN f.withdrawn_at IS NOT NULL AND f.withdrawn_at <= p_as_of THEN 'withdrawn' ELSE 'standing' END INTO s
      FROM (SELECT 1) one LEFT JOIN prediction.forecasts_current f ON f.forecast_id = p_id AND f.tenant_id = p_tenant AND f.domain_id = p_domain AND f.issued_at <= p_as_of;
  ELSE
    SELECT CASE WHEN co.object_id IS NULL THEN 'missing' WHEN co.lifecycle_state = 'disputed' THEN 'disputed' WHEN co.lifecycle_state IN ('withdrawn', 'deleted') THEN 'withdrawn' ELSE 'standing' END INTO s
      FROM (SELECT 1) one LEFT JOIN LATERAL (SELECT x.object_id, x.lifecycle_state FROM objects.canonical_objects x
                                              WHERE x.object_id = p_id AND x.tenant_id = p_tenant AND (x.domain_id = p_domain OR x.domain_id IS NULL) AND x.recorded_at <= p_as_of
                                              ORDER BY x.object_version DESC LIMIT 1) co ON true;
  END IF;
  RETURN coalesce(s, 'missing');
END $$;
/* A decision package version's scope matches (the package rule): its objectives, or the ids its options cite (entities), against the scope. */
CREATE OR REPLACE FUNCTION analytics.mca_package_scope(p_scope jsonb, p_package uuid, p_version int, p_objectives jsonb) RETURNS text[]
LANGUAGE sql STABLE SET search_path = analytics, decision, pg_catalog, pg_temp AS $$
  SELECT CASE WHEN p_scope IS NULL THEN ARRAY['domain'] ELSE analytics.mca_scope_via(p_scope, analytics.mca_jtxt(p_objectives),
    coalesce((SELECT array_agg(c ->> 'id') FROM decision.options o CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(o.consequences) = 'array' THEN o.consequences ELSE '[]'::jsonb END) c
               WHERE o.package_id = p_package AND o.version = p_version AND c ->> 'id' IS NOT NULL), '{}'), '{}', '{}') END
$$;
/* A warning's scope matches (the warning rule): its `affected` objectives, assets (entities or series keys) and geographies; the series of
   the forecast it was raised on. */
CREATE OR REPLACE FUNCTION analytics.mca_warning_scope(p_scope jsonb, p_affected jsonb, p_forecast uuid) RETURNS text[]
LANGUAGE sql STABLE SET search_path = analytics, prediction, pg_catalog, pg_temp AS $$
  SELECT CASE WHEN p_scope IS NULL THEN ARRAY['domain'] ELSE analytics.mca_scope_via(p_scope,
    analytics.mca_jtxt(p_affected -> 'objectives'), analytics.mca_jtxt(p_affected -> 'assets'),
    analytics.mca_jtxt(p_affected -> 'assets') || coalesce((SELECT ARRAY[f.series_key] FROM prediction.forecasts_current f WHERE f.forecast_id = p_forecast), '{}'),
    analytics.mca_jtxt(p_affected -> 'geographies')) END
$$;
/* A forecast's (or an outcome's) scope matches (the forecast rule): its series key in series_keys, or its subject entity in entity_ids. */
CREATE OR REPLACE FUNCTION analytics.mca_forecast_scope(p_scope jsonb, p_series text, p_subject uuid) RETURNS text[]
LANGUAGE sql IMMUTABLE SET search_path = analytics, pg_catalog, pg_temp AS $$
  SELECT CASE WHEN p_scope IS NULL THEN ARRAY['domain'] ELSE analytics.mca_scope_via(p_scope, '{}', ARRAY[p_subject::text], ARRAY[p_series], '{}') END
$$;
/* The note a computation adds when it ignores the scope (domain-wide by nature). */
CREATE OR REPLACE FUNCTION analytics.mca_scope_ignored(p_scope jsonb, p_why text) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT CASE WHEN p_scope IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(format('this metric ignores the scope %s (domain-wide by nature: %s)', p_scope ->> 'scope_key', p_why)) END
$$;
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['analytics.mca_txt(jsonb,text)', 'analytics.mca_lower(text[])', 'analytics.mca_jtxt(jsonb)', 'analytics.mca_scope_via(jsonb,text[],text[],text[],text[])',
                           'analytics.mca_clock_reasons(jsonb,text[])', 'analytics.mca_out(text,jsonb,jsonb,jsonb,int,numeric,text,text)', 'analytics.mca_rec(text,text,text,text,jsonb)',
                           'analytics.mca_is_human(uuid)', 'analytics.mca_role_at(uuid,uuid,uuid,text[],timestamptz)', 'analytics.mca_standing(text,uuid,uuid,uuid,timestamptz)',
                           'analytics.mca_package_scope(jsonb,uuid,int,jsonb)', 'analytics.mca_warning_scope(jsonb,jsonb,uuid)', 'analytics.mca_forecast_scope(jsonb,text,uuid)',
                           'analytics.mca_scope_ignored(jsonb,text)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
  END LOOP;
END $$;

-- §MCA.1 DECISIONS ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/* MET-001 STRATEGIC LOOP CLOSURE (rate; the scene's metric #1; DESIGN D9). POPULATION: the decision packages COMMITTED in the window (their
   latest commitment in [from, to) on the record clock, recorded by as_of), in scope by the package rule. NUMERATOR: those with ALL SIX links,
   each judged AS OF p_as_of:
     objective  — the committed version names ≥ 1 objective that resolves to a strategy objective (graph.strategy_current OBJ) of the domain;
     evidence   — ≥ 1 cited evidence or claim object STANDING (decision_metrics' `with_evidence` kinds; dsp_citation_states' standing at as_of);
     foresight  — a cited run standing, a cited forecast standing, a scenario reached through a cited run (decision.dsp_scenarios_of), or an
                  active scenario set of the package (bound in decision.package_scenario_sets, or declared for it — scenario_sets.package_id);
     commitment — the commitment itself (met by construction for a committed package — shown, not hidden) with its tracked items counted;
     outcome    — ≥ 1 outcome recorded on the committed version AND ≥ 1 outcome assessment (decision_metrics' outcome_linkage.linked);
     learning   — a governed lesson (decision.lessons) or the closure's lessons record (package.closed / commitment.closed with lessons).
   Every record carries its LINK VECTOR (each link met or not, with what it rests on) and the missing links named. */
CREATE OR REPLACE FUNCTION analytics.mc_met001_loop_closure(p_tenant uuid, p_domain uuid, p_from timestamptz, p_to timestamptz, p_as_of timestamptz, p_scope jsonb, p_cohort jsonb, p_params jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = analytics, decision, graph, simulation, prediction, pg_catalog, pg_temp AS $$
DECLARE r record; v_recs jsonb := '[]'::jsonb; v_via text[]; v_obj text[]; v_ev int; v_runs int; v_fc int; v_scn int; v_sets int; v_items int; v_out int; v_ass int; v_les int; v_clo int;
        v_links jsonb; v_missing text[]; v_n int := 0; v_syn int := 0;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'MET-001 loop closure: committed decision packages and their six links');
  FOR r IN
    SELECT DISTINCT ON (c.package_id) c.package_id, c.commitment_id, c.version, c.committed_at, p.synthetic_state, v.objectives
      FROM decision.commitments c JOIN decision.packages_current p ON p.package_id = c.package_id
      JOIN decision.package_versions v ON v.package_id = c.package_id AND v.version = c.version
     WHERE c.tenant_id = p_tenant AND c.domain_id = p_domain AND c.committed_at >= p_from AND c.committed_at < p_to AND c.committed_at <= p_as_of
     ORDER BY c.package_id, c.committed_at DESC, c.commitment_id
  LOOP
    v_via := analytics.mca_package_scope(p_scope, r.package_id, r.version, r.objectives);
    CONTINUE WHEN cardinality(v_via) = 0;
    SELECT coalesce(array_agg(o ORDER BY o), '{}') INTO v_obj FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(r.objectives) = 'array' THEN r.objectives ELSE '[]'::jsonb END) o
     WHERE EXISTS (SELECT 1 FROM graph.strategy_current s WHERE s.strategy_object_id::text = lower(o) AND s.tenant_id = p_tenant AND s.domain_id = p_domain AND s.object_type = 'OBJ' AND s.declared_at <= p_as_of);
    SELECT count(*) FILTER (WHERE x.kind IN ('evidence', 'claim') AND x.standing = 'standing'), count(*) FILTER (WHERE x.kind = 'run' AND x.standing = 'standing'),
           count(*) FILTER (WHERE x.kind = 'forecast' AND x.standing = 'standing')
      INTO v_ev, v_runs, v_fc
      FROM (SELECT c ->> 'kind' AS kind, analytics.mca_standing(c ->> 'kind', (c ->> 'id')::uuid, p_tenant, p_domain, p_as_of) AS standing
              FROM decision.options o CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(o.consequences) = 'array' THEN o.consequences ELSE '[]'::jsonb END) c
             WHERE o.package_id = r.package_id AND o.version = r.version AND o.set_at <= p_as_of AND coalesce(c ->> 'id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') x;
    SELECT count(DISTINCT s.scenario_id) INTO v_scn FROM decision.dsp_scenarios_of(r.package_id, r.version) s;
    SELECT count(DISTINCT x.set_id) INTO v_sets FROM (SELECT b.set_id FROM decision.package_scenario_sets b WHERE b.package_id = r.package_id AND b.bound_at <= p_as_of
                                                     UNION SELECT s.set_id FROM prediction.scenario_sets s WHERE s.package_id = r.package_id AND s.tenant_id = p_tenant AND s.domain_id = p_domain
                                                                                                       AND s.activated_at IS NOT NULL AND s.activated_at <= p_as_of) x;
    SELECT count(*) INTO v_items FROM decision.commitment_items i WHERE i.commitment_id = r.commitment_id AND i.created_at <= p_as_of;
    SELECT count(*) INTO v_out FROM decision.outcomes o WHERE o.package_id = r.package_id AND o.version = r.version AND o.recorded_at <= p_as_of;
    SELECT count(*) INTO v_ass FROM decision.outcome_assessments a WHERE a.package_id = r.package_id AND a.assessed_at <= p_as_of;
    SELECT count(*) INTO v_les FROM decision.lessons l WHERE l.package_id = r.package_id AND l.linked_at <= p_as_of;
    SELECT count(*) INTO v_clo FROM decision.package_events e WHERE e.package_id = r.package_id AND e.event IN ('package.closed', 'commitment.closed') AND e.occurred_at <= p_as_of
       AND length(btrim(coalesce(e.details ->> 'lessons', ''))) > 0;
    v_links := jsonb_build_object(
      'objective', jsonb_build_object('met', cardinality(v_obj) > 0, 'objectives', to_jsonb(v_obj)),
      'evidence', jsonb_build_object('met', v_ev > 0, 'standing_evidence_citations', v_ev),
      'foresight', jsonb_build_object('met', v_runs + v_fc + v_scn + v_sets > 0, 'standing_runs', v_runs, 'standing_forecasts', v_fc, 'scenarios_via_runs', v_scn, 'bound_scenario_sets', v_sets),
      'commitment', jsonb_build_object('met', true, 'commitment_id', r.commitment_id, 'items', v_items, 'note', 'met by construction for a committed package'),
      'outcome', jsonb_build_object('met', v_out > 0 AND v_ass > 0, 'outcomes_recorded', v_out, 'assessments', v_ass),
      'learning', jsonb_build_object('met', v_les + v_clo > 0, 'governed_lessons', v_les, 'closure_lessons_records', v_clo));
    SELECT coalesce(array_agg(k ORDER BY k), '{}') INTO v_missing FROM jsonb_each(v_links) e(k, v) WHERE NOT (v ->> 'met')::boolean;
    v_n := v_n + 1; v_syn := v_syn + CASE WHEN r.synthetic_state THEN 1 ELSE 0 END;
    v_recs := v_recs || analytics.mca_rec('decision_package', r.package_id::text, CASE WHEN cardinality(v_missing) = 0 THEN 'numerator' ELSE 'denominator' END, NULL,
      jsonb_build_object('version', r.version, 'committed_at', r.committed_at, 'links', v_links, 'missing', to_jsonb(v_missing), 'scope_via', to_jsonb(v_via), 'synthetic', r.synthetic_state));
  END LOOP;
  RETURN analytics.mca_out('rate', v_recs, analytics.mca_clock_reasons(p_params, ARRAY['record']),
    jsonb_build_object('clock', 'record', 'window_field', 'decision.commitments.committed_at', 'synthetic_share', CASE WHEN v_n = 0 THEN NULL ELSE round(v_syn::numeric / v_n, 4) END,
                       'links', jsonb_build_array('objective', 'evidence', 'foresight', 'commitment', 'outcome', 'learning'),
                       'notes', jsonb_build_array('each link judged AS OF the result''s as-of (decision_metrics'' predicates, which read now, evaluated at as-of so a replay reproduces)')), p_comp_key => 'synthetic', p_at_key => 'committed_at');
END $$;

/* MET-002 DECISION PACKAGE COMPLETENESS (rate). POPULATION: the package versions that REACHED THE GATE in the window — p_params.gate
   'ready' (default: the B34 decision-ready gate action, decision.gate_actions action ready, its first `at`) or 'proposed' (the version's
   proposal) — in scope by the package rule; cohort decision_class (packages_current.decision_class). NUMERATOR: all six of App M's elements
   present AT THE GATE INSTANT: evidence (≥ 1 standing evidence/claim/run citation — dsp_citation_states' kinds), alternatives (decision_metrics'
   `options` ≥ 2 AND exactly one `status_quo`), risks (the version's risks named), dissent (≥ 1 recorded position on the version — the product
   has no "no dissent" declaration, so an unasked dissent is absent, said), explanation (an explanation of the version, decision.explanations),
   authority (the version's approver policy). */
CREATE OR REPLACE FUNCTION analytics.mc_met002_package_completeness(p_tenant uuid, p_domain uuid, p_from timestamptz, p_to timestamptz, p_as_of timestamptz, p_scope jsonb, p_cohort jsonb, p_params jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = analytics, decision, pg_catalog, pg_temp AS $$
DECLARE r record; v_recs jsonb := '[]'::jsonb; v_reasons jsonb; v_gate text := coalesce(p_params ->> 'gate', 'ready'); v_via text[]; v_ev int; v_opts int; v_sq int; v_dis int; v_xpl int;
        v_el jsonb; v_missing text[]; v_n int := 0; v_syn int := 0;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'MET-002 package completeness: package versions at the decision gate');
  v_reasons := analytics.mca_clock_reasons(p_params, ARRAY['record']);
  IF v_gate NOT IN ('ready', 'proposed') THEN v_reasons := v_reasons || to_jsonb(format('the definition names the gate %s; the gates are ready | proposed', v_gate)); END IF;
  FOR r IN
    SELECT g.package_id, g.version, g.gate_at, p.decision_class, p.synthetic_state, v.objectives, v.risks, v.approver_policy
      FROM ((SELECT DISTINCT ON (a.package_id, a.version) a.package_id, a.version, a.at AS gate_at FROM decision.gate_actions a
             WHERE v_gate = 'ready' AND a.tenant_id = p_tenant AND a.domain_id = p_domain AND a.action = 'ready' AND a.at <= p_as_of
             ORDER BY a.package_id, a.version, a.at)
            UNION ALL
            SELECT x.package_id, x.version, x.proposed_at FROM decision.package_versions x
             WHERE v_gate = 'proposed' AND x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.proposed_at IS NOT NULL AND x.proposed_at <= p_as_of) g
      JOIN decision.packages_current p ON p.package_id = g.package_id
      JOIN decision.package_versions v ON v.package_id = g.package_id AND v.version = g.version
     WHERE g.gate_at >= p_from AND g.gate_at < p_to
       AND (p_cohort ->> 'decision_class' IS NULL OR p.decision_class = p_cohort ->> 'decision_class')
     ORDER BY g.gate_at, g.package_id
  LOOP
    v_via := analytics.mca_package_scope(p_scope, r.package_id, r.version, r.objectives);
    CONTINUE WHEN cardinality(v_via) = 0;
    SELECT count(*) FILTER (WHERE analytics.mca_standing(c ->> 'kind', (c ->> 'id')::uuid, p_tenant, p_domain, r.gate_at) = 'standing') INTO v_ev
      FROM decision.options o CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(o.consequences) = 'array' THEN o.consequences ELSE '[]'::jsonb END) c
     WHERE o.package_id = r.package_id AND o.version = r.version AND o.set_at <= r.gate_at AND c ->> 'kind' IN ('evidence', 'claim', 'run')
       AND coalesce(c ->> 'id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
    SELECT count(*), count(*) FILTER (WHERE o.kind = 'status_quo') INTO v_opts, v_sq FROM decision.options o WHERE o.package_id = r.package_id AND o.version = r.version AND o.set_at <= r.gate_at;
    SELECT count(*) INTO v_dis FROM decision.dissent d WHERE d.package_id = r.package_id AND d.version = r.version AND d.recorded_at <= r.gate_at;
    SELECT count(*) INTO v_xpl FROM decision.explanations e WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain AND e.subject_kind = 'package_version' AND e.subject_id = r.package_id
       AND e.subject_version = r.version AND e.generated_at <= r.gate_at;
    v_el := jsonb_build_object(
      'evidence', jsonb_build_object('met', v_ev > 0, 'standing_citations', v_ev),
      'alternatives', jsonb_build_object('met', v_opts >= 2 AND v_sq = 1, 'options', v_opts, 'status_quo', v_sq),
      'risks', jsonb_build_object('met', jsonb_array_length(coalesce(r.risks, '[]'::jsonb)) > 0, 'named', jsonb_array_length(coalesce(r.risks, '[]'::jsonb))),
      'dissent', jsonb_build_object('met', v_dis > 0, 'positions_recorded', v_dis),
      'explanation', jsonb_build_object('met', v_xpl > 0, 'explanations', v_xpl),
      'authority', jsonb_build_object('met', r.approver_policy IS NOT NULL AND r.approver_policy <> '{}'::jsonb));
    SELECT coalesce(array_agg(k ORDER BY k), '{}') INTO v_missing FROM jsonb_each(v_el) e(k, v) WHERE NOT (v ->> 'met')::boolean;
    v_n := v_n + 1; v_syn := v_syn + CASE WHEN r.synthetic_state THEN 1 ELSE 0 END;
    v_recs := v_recs || analytics.mca_rec('package_version', format('%s@%s', r.package_id, r.version), CASE WHEN cardinality(v_missing) = 0 THEN 'numerator' ELSE 'denominator' END, NULL,
      jsonb_build_object('package_id', r.package_id, 'version', r.version, 'gate', v_gate, 'gate_at', r.gate_at, 'decision_class', r.decision_class, 'elements', v_el,
                         'missing', to_jsonb(v_missing), 'scope_via', to_jsonb(v_via), 'synthetic', r.synthetic_state));
  END LOOP;
  RETURN analytics.mca_out('rate', v_recs, v_reasons, jsonb_build_object('clock', 'record', 'gate', v_gate,
    'window_field', CASE v_gate WHEN 'ready' THEN 'decision.gate_actions.at (action ready)' ELSE 'decision.package_versions.proposed_at' END,
    'synthetic_share', CASE WHEN v_n = 0 THEN NULL ELSE round(v_syn::numeric / v_n, 4) END), p_comp_key => 'decision_class', p_at_key => 'gate_at');
END $$;

/* MET-003 DECISION REPLAY SUCCESS (rate). POPULATION: the packages COMMITTED in the window (their latest commitment in it), in scope. Each
   one's LATEST replay of the committed version recorded by as_of (decision.replays): no unavailable input → numerator; unavailable inputs →
   denominator (named). A package NEVER REPLAYED is EXCLUDED with the reason "not replayed" and counted; when more than half the cohort is
   unreplayed the result is indeterminate — measured over the replays someone chose to run, the rate is biased (MAP §2 caveat). */
CREATE OR REPLACE FUNCTION analytics.mc_met003_replay_success(p_tenant uuid, p_domain uuid, p_from timestamptz, p_to timestamptz, p_as_of timestamptz, p_scope jsonb, p_cohort jsonb, p_params jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = analytics, decision, pg_catalog, pg_temp AS $$
DECLARE r record; rp record; v_recs jsonb := '[]'::jsonb; v_reasons jsonb; v_via text[]; v_total int := 0; v_unrep int := 0;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'MET-003 replay success: committed packages and their replays');
  v_reasons := analytics.mca_clock_reasons(p_params, ARRAY['record']);
  FOR r IN
    SELECT DISTINCT ON (c.package_id) c.package_id, c.version, c.committed_at, v.objectives
      FROM decision.commitments c JOIN decision.package_versions v ON v.package_id = c.package_id AND v.version = c.version
     WHERE c.tenant_id = p_tenant AND c.domain_id = p_domain AND c.committed_at >= p_from AND c.committed_at < p_to AND c.committed_at <= p_as_of
     ORDER BY c.package_id, c.committed_at DESC, c.commitment_id
  LOOP
    v_via := analytics.mca_package_scope(p_scope, r.package_id, r.version, r.objectives);
    CONTINUE WHEN cardinality(v_via) = 0;
    v_total := v_total + 1;
    SELECT x.replay_id, x.replayed_at, x.unavailable INTO rp FROM decision.replays x
     WHERE x.package_id = r.package_id AND x.version = r.version AND x.replayed_at <= p_as_of ORDER BY x.replayed_at DESC, x.replay_id DESC LIMIT 1;
    IF rp.replay_id IS NULL THEN
      v_unrep := v_unrep + 1;
      v_recs := v_recs || analytics.mca_rec('decision_package', r.package_id::text, 'excluded', 'not replayed: no replay of the committed version is recorded by the as-of',
                                            jsonb_build_object('version', r.version, 'committed_at', r.committed_at, 'scope_via', to_jsonb(v_via)));
    ELSE
      v_recs := v_recs || analytics.mca_rec('decision_package', r.package_id::text,
                                            CASE WHEN jsonb_array_length(coalesce(rp.unavailable, '[]'::jsonb)) = 0 THEN 'numerator' ELSE 'denominator' END, NULL,
                                            jsonb_build_object('version', r.version, 'committed_at', r.committed_at, 'replay_id', rp.replay_id, 'replayed_at', rp.replayed_at,
                                                               'unavailable', coalesce(rp.unavailable, '[]'::jsonb), 'scope_via', to_jsonb(v_via)));
    END IF;
  END LOOP;
  IF v_total > 0 AND v_unrep * 2 > v_total THEN
    v_reasons := v_reasons || to_jsonb(format('%s of the %s committed package(s) were never replayed: more than half the cohort is unmeasured, so a rate over the replays performed would be biased (a cohort replay is run first)', v_unrep, v_total));
  END IF;
  RETURN analytics.mca_out('rate', v_recs, v_reasons, jsonb_build_object('clock', 'record', 'window_field', 'decision.commitments.committed_at', 'cohort_size', v_total, 'not_replayed', v_unrep), p_comp_key => NULL, p_at_key => 'committed_at');
END $$;

/* MET-004 HUMAN AUTHORITY INTEGRITY (rate; dimension consequence_class). THE UNIVERSE of consequential effects (stated, a definitional
   choice): (a) DECISION COMMITMENTS (consequence class = the commitment's op_class) and (b) SIGNED ACTS (executive.signatures — metric
   certifications, publications, plan baselines, gate signatures …; class = the policy decision of the same correlation and action, else
   `unclassified`), recorded in the window. NUMERATOR: bound to an ELIGIBLE HUMAN (every approval a commitment names is an `approve` by a
   human principal on the same version digest, recorded before the commitment and not revoked before it; a signature's signer is a human),
   to a DIGEST (version/header digest; the signature's subject digest) AND to an AUDIT EVENT (audit.audit_events of the same correlation,
   recorded by as_of). Records name the effect and which binding failed — never the person. */
CREATE OR REPLACE FUNCTION analytics.mc_met004_authority_integrity(p_tenant uuid, p_domain uuid, p_from timestamptz, p_to timestamptz, p_as_of timestamptz, p_scope jsonb, p_cohort jsonb, p_params jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = analytics, decision, executive, audit, policy, pg_catalog, pg_temp AS $$
DECLARE r record; v_recs jsonb := '[]'::jsonb; v_human boolean; v_digest boolean; v_audit boolean; v_apr int; v_good int; v_class text; v_fail text[];
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'MET-004 authority integrity: commitments and signed acts with their approvals and audit');
  FOR r IN
    SELECT c.commitment_id, c.version_digest, c.header_digest, c.approvals, c.op_class, c.committed_at, c.correlation_id, c.package_id, c.version, c.policy_decision_id
      FROM decision.commitments c
     WHERE c.tenant_id = p_tenant AND c.domain_id = p_domain AND c.committed_at >= p_from AND c.committed_at < p_to AND c.committed_at <= p_as_of
       AND (p_cohort ->> 'consequence_class' IS NULL OR c.op_class = p_cohort ->> 'consequence_class')
     ORDER BY c.committed_at, c.commitment_id
  LOOP
    v_apr := jsonb_array_length(CASE WHEN jsonb_typeof(r.approvals) = 'array' THEN r.approvals ELSE '[]'::jsonb END);
    SELECT count(*) INTO v_good FROM jsonb_array_elements(CASE WHEN jsonb_typeof(r.approvals) = 'array' THEN r.approvals ELSE '[]'::jsonb END) x
      JOIN decision.approvals a ON a.approval_id::text = x ->> 'approval_id'
     WHERE a.package_id = r.package_id AND a.version = r.version AND a.decision = 'approve' AND a.version_digest = r.version_digest AND analytics.mca_is_human(a.approver_principal_id)
       AND a.recorded_at <= r.committed_at AND (a.revoked_at IS NULL OR a.revoked_at > r.committed_at);
    v_human := v_apr > 0 AND v_good = v_apr;
    v_digest := r.version_digest IS NOT NULL AND r.header_digest IS NOT NULL;
    v_audit := r.policy_decision_id IS NOT NULL AND EXISTS (SELECT 1 FROM audit.audit_events e WHERE e.correlation_id = r.correlation_id AND e.created_at <= p_as_of
                                                                AND (e.tenant_id = p_tenant OR e.tenant_id IS NULL));
    v_fail := array_remove(ARRAY[CASE WHEN NOT v_human THEN 'eligible_human' END, CASE WHEN NOT v_digest THEN 'digest' END, CASE WHEN NOT v_audit THEN 'audit' END], NULL);
    v_recs := v_recs || analytics.mca_rec('decision_commitment', r.commitment_id::text, CASE WHEN cardinality(v_fail) = 0 THEN 'numerator' ELSE 'denominator' END, NULL,
      jsonb_build_object('effect', 'decision commitment', 'consequence_class', r.op_class, 'at', r.committed_at, 'approvals_named', v_apr, 'approvals_eligible', v_good,
                         'eligible_human', v_human, 'digest', v_digest, 'audit', v_audit, 'failed', to_jsonb(v_fail)));
  END LOOP;
  FOR r IN
    SELECT s.signature_id, s.subject_kind, s.subject_digest, s.signer, s.bound_action, s.signed_at, s.correlation_id,
           coalesce((SELECT d.consequence_class FROM policy.policy_decisions d WHERE d.correlation_id = s.correlation_id AND d.action = s.bound_action AND d.created_at <= p_as_of
                      ORDER BY d.created_at LIMIT 1), 'unclassified') AS cclass
      FROM executive.signatures s
     WHERE s.tenant_id = p_tenant AND s.domain_id = p_domain AND s.signed_at >= p_from AND s.signed_at < p_to AND s.signed_at <= p_as_of
     ORDER BY s.signed_at, s.signature_id
  LOOP
    CONTINUE WHEN p_cohort ->> 'consequence_class' IS NOT NULL AND r.cclass IS DISTINCT FROM p_cohort ->> 'consequence_class';
    v_human := analytics.mca_is_human(r.signer);
    v_digest := r.subject_digest IS NOT NULL AND length(r.subject_digest) > 0;
    v_audit := EXISTS (SELECT 1 FROM audit.audit_events e WHERE e.correlation_id = r.correlation_id AND e.created_at <= p_as_of AND (e.tenant_id = p_tenant OR e.tenant_id IS NULL));
    v_fail := array_remove(ARRAY[CASE WHEN NOT v_human THEN 'eligible_human' END, CASE WHEN NOT v_digest THEN 'digest' END, CASE WHEN NOT v_audit THEN 'audit' END], NULL);
    v_recs := v_recs || analytics.mca_rec('signed_act', r.signature_id::text, CASE WHEN cardinality(v_fail) = 0 THEN 'numerator' ELSE 'denominator' END, NULL,
      jsonb_build_object('effect', r.subject_kind, 'bound_action', r.bound_action, 'consequence_class', r.cclass, 'at', r.signed_at, 'eligible_human', v_human, 'digest', v_digest,
                         'audit', v_audit, 'failed', to_jsonb(v_fail)));
  END LOOP;
  RETURN analytics.mca_out('rate', v_recs, analytics.mca_clock_reasons(p_params, ARRAY['record']),
    jsonb_build_object('clock', 'record', 'universe', jsonb_build_array('decision commitments (decision.commitments)', 'signed acts (executive.signatures)'),
                       'notes', analytics.mca_scope_ignored(p_scope, 'authority integrity is a property of every consequential effect of the domain')), p_comp_key => 'consequence_class', p_at_key => 'at');
END $$;

/* MET-005 RECOMMENDATION EXPLANATION CLOSURE (rate). POPULATION: the recommendations recorded in the window that are DECISION-ACTIVE at the
   as-of (proposed or accepted for consideration then — not withdrawn, superseded or declined by then: those are excluded with the reason),
   in scope by their package. NUMERATOR: the five resolutions, each named on the record: evidence (the recommended option cites ≥ 1
   evidence, claim or run), assumptions (assumptions or analytical assumptions stated), methods (model outputs or option runs named),
   alternatives (≥ 2 interventions beside the status quo on the version — recommendation_completeness' `alternatives`), uncertainty (the
   recommended option rests on a completed run — recommendation_completeness' `uncertainty` — or the recommendation has an explanation, whose
   uncertainty block is mandatory). */
CREATE OR REPLACE FUNCTION analytics.mc_met005_explanation_closure(p_tenant uuid, p_domain uuid, p_from timestamptz, p_to timestamptz, p_as_of timestamptz, p_scope jsonb, p_cohort jsonb, p_params jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = analytics, decision, pg_catalog, pg_temp AS $$
DECLARE r record; v_recs jsonb := '[]'::jsonb; v_via text[]; v_cites int; v_sim boolean; v_int int; v_xpl int; v_el jsonb; v_missing text[]; v_off text;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'MET-005 explanation closure: decision-active recommendations');
  FOR r IN
    SELECT x.*, v.objectives FROM decision.recommendations x JOIN decision.package_versions v ON v.package_id = x.package_id AND v.version = x.version
     WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.recorded_at >= p_from AND x.recorded_at < p_to AND x.recorded_at <= p_as_of
     ORDER BY x.recorded_at, x.recommendation_id
  LOOP
    v_via := analytics.mca_package_scope(p_scope, r.package_id, r.version, r.objectives);
    CONTINUE WHEN cardinality(v_via) = 0;
    v_off := CASE WHEN r.withdrawn_at IS NOT NULL AND r.withdrawn_at <= p_as_of THEN 'withdrawn by the as-of: no longer decision-active'
                  WHEN r.superseded_at IS NOT NULL AND r.superseded_at <= p_as_of THEN 'superseded by the as-of: no longer decision-active'
                  WHEN r.state = 'declined' AND r.decided_at <= p_as_of THEN 'declined by the as-of: no longer decision-active' END;
    IF v_off IS NOT NULL THEN
      v_recs := v_recs || analytics.mca_rec('recommendation', r.recommendation_id::text, 'excluded', v_off, jsonb_build_object('package_id', r.package_id, 'version', r.version, 'author_kind', r.author_kind));
      CONTINUE;
    END IF;
    SELECT count(*) INTO v_cites FROM decision.options o CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(o.consequences) = 'array' THEN o.consequences ELSE '[]'::jsonb END) c
     WHERE o.package_id = r.package_id AND o.version = r.version AND o.key = r.option_key AND c ->> 'kind' IN ('evidence', 'claim', 'run');
    SELECT coalesce(bool_or(o.simulated), false) INTO v_sim FROM decision.options o WHERE o.package_id = r.package_id AND o.version = r.version AND o.key = r.option_key;
    SELECT count(*) INTO v_int FROM decision.options o WHERE o.package_id = r.package_id AND o.version = r.version AND o.kind = 'intervention' AND o.set_at <= p_as_of;
    SELECT count(*) INTO v_xpl FROM decision.explanations e WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain AND e.subject_kind = 'recommendation' AND e.subject_id = r.recommendation_id
       AND e.generated_at <= p_as_of;
    v_el := jsonb_build_object(
      'evidence', jsonb_build_object('met', v_cites > 0, 'citations', v_cites),
      'assumptions', jsonb_build_object('met', jsonb_array_length(r.assumptions) + jsonb_array_length(r.analytical_assumptions) > 0,
                                        'stated', jsonb_array_length(r.assumptions) + jsonb_array_length(r.analytical_assumptions)),
      'methods', jsonb_build_object('met', jsonb_array_length(r.model_outputs) + jsonb_array_length(r.option_runs) > 0, 'model_outputs', jsonb_array_length(r.model_outputs),
                                    'option_runs', jsonb_array_length(r.option_runs)),
      'alternatives', jsonb_build_object('met', v_int >= 2, 'interventions', v_int),
      'uncertainty', jsonb_build_object('met', v_sim OR v_xpl > 0, 'option_simulated', v_sim, 'explanations', v_xpl));
    SELECT coalesce(array_agg(k ORDER BY k), '{}') INTO v_missing FROM jsonb_each(v_el) e(k, v) WHERE NOT (v ->> 'met')::boolean;
    v_recs := v_recs || analytics.mca_rec('recommendation', r.recommendation_id::text, CASE WHEN cardinality(v_missing) = 0 THEN 'numerator' ELSE 'denominator' END, NULL,
      jsonb_build_object('package_id', r.package_id, 'version', r.version, 'option_key', r.option_key, 'author_kind', r.author_kind, 'recorded_at', r.recorded_at, 'resolutions', v_el, 'missing', to_jsonb(v_missing),
                         'scope_via', to_jsonb(v_via)));
  END LOOP;
  RETURN analytics.mca_out('rate', v_recs, analytics.mca_clock_reasons(p_params, ARRAY['record']),
    jsonb_build_object('clock', 'record', 'window_field', 'decision.recommendations.recorded_at', 'decision_active', 'proposed or accepted for consideration at the as-of'), p_comp_key => 'author_kind', p_at_key => 'recorded_at');
END $$;

-- §MCA.2 FORESIGHT: SIGNALS, WARNINGS, FORECASTS, SCENARIOS, RUNS, TWINS ────────────────────────────────────────────────────────────────

/* MET-019 WEAK SIGNAL PRECISION (rate; dimension detector — the detector key, or `analyst` for an analyst's nomination; "monitored, not
   optimized alone"). POPULATION: the nominations whose latest HUMAN disposition (prediction.signal_events signal.disposition /
   signal.escalated by a human, recorded by as_of) falls in the window, in scope (the signal's subject entity, or the warning raised from it).
   NUMERATOR: confirmed — `confirm`, or `escalate` (an escalation is the analyst's confirmation that raises a warning; MET-020 measures what
   followed). DENOMINATOR: `monitor`, `dismiss`. A disposition by an agent is not a human review: not in the population. */
CREATE OR REPLACE FUNCTION analytics.mc_met019_signal_precision(p_tenant uuid, p_domain uuid, p_from timestamptz, p_to timestamptz, p_as_of timestamptz, p_scope jsonb, p_cohort jsonb, p_params jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = analytics, prediction, pg_catalog, pg_temp AS $$
DECLARE r record; v_recs jsonb := '[]'::jsonb; v_via text[]; v_det text;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'MET-019 signal precision: human-dispositioned weak-signal nominations');
  FOR r IN
    SELECT s.signal_id, s.subject_kind, s.subject_id, s.nominator_kind, s.detector_key, s.synthetic_state, d.event, d.occurred_at,
           CASE WHEN d.event = 'signal.escalated' THEN 'escalate' ELSE d.details ->> 'disposition' END AS disposition,
           (SELECT w.affected FROM prediction.warnings_current w WHERE w.tenant_id = p_tenant AND w.domain_id = p_domain AND w.origin_kind = 'weak_signal'
               AND w.origin_ref ->> 'signal_id' = s.signal_id::text AND w.raised_at <= p_as_of ORDER BY w.raised_at LIMIT 1) AS warned_affected
      FROM prediction.signals_current s
      CROSS JOIN LATERAL (SELECT e.event, e.occurred_at, e.details FROM prediction.signal_events e
                           WHERE e.signal_id = s.signal_id AND e.event IN ('signal.disposition', 'signal.escalated') AND e.occurred_at <= p_as_of
                             AND analytics.mca_is_human(e.actor_principal_id)
                           ORDER BY e.occurred_at DESC, e.event_id DESC LIMIT 1) d
     WHERE s.tenant_id = p_tenant AND s.domain_id = p_domain AND s.created_at <= p_as_of AND d.occurred_at >= p_from AND d.occurred_at < p_to
     ORDER BY d.occurred_at, s.signal_id
  LOOP
    v_det := coalesce(r.detector_key, CASE WHEN r.nominator_kind = 'analyst' THEN 'analyst' ELSE r.nominator_kind END);
    CONTINUE WHEN p_cohort ->> 'detector' IS NOT NULL AND v_det IS DISTINCT FROM p_cohort ->> 'detector';
    v_via := CASE WHEN p_scope IS NULL THEN ARRAY['domain'] ELSE
               analytics.mca_scope_via(p_scope, analytics.mca_jtxt(r.warned_affected -> 'objectives'),
                                       CASE WHEN r.subject_kind = 'entity' THEN ARRAY[r.subject_id::text] ELSE '{}'::text[] END || analytics.mca_jtxt(r.warned_affected -> 'assets'),
                                       analytics.mca_jtxt(r.warned_affected -> 'assets'), analytics.mca_jtxt(r.warned_affected -> 'geographies')) END;
    CONTINUE WHEN cardinality(v_via) = 0;
    IF r.disposition NOT IN ('confirm', 'escalate', 'monitor', 'dismiss') OR r.disposition IS NULL THEN
      v_recs := v_recs || analytics.mca_rec('weak_signal', r.signal_id::text, 'excluded', format('the disposition event carries no recognised disposition (%s)', coalesce(r.disposition, 'none')), '{}'::jsonb);
      CONTINUE;
    END IF;
    v_recs := v_recs || analytics.mca_rec('weak_signal', r.signal_id::text, CASE WHEN r.disposition IN ('confirm', 'escalate') THEN 'numerator' ELSE 'denominator' END, NULL,
      jsonb_build_object('disposition', r.disposition, 'disposed_at', r.occurred_at, 'detector', v_det, 'nominator_kind', r.nominator_kind, 'synthetic', r.synthetic_state, 'scope_via', to_jsonb(v_via)));
  END LOOP;
  RETURN analytics.mca_out('rate', v_recs, analytics.mca_clock_reasons(p_params, ARRAY['record']),
    jsonb_build_object('clock', 'record', 'window_field', 'prediction.signal_events.occurred_at (the latest human disposition)',
                       'notes', jsonb_build_array('monitored, not optimized alone (App M): a precision read beside the lead time (MET-020) and the warnings that followed')), p_comp_key => 'detector', p_at_key => 'disposed_at');
END $$;

/* MET-020 WEAK SIGNAL LEAD TIME (duration, seconds). POPULATION: the warnings RAISED FROM A SIGNAL (origin_kind weak_signal, origin_ref
   signal_id) in the window, in scope by the warning rule. VALUE per warning: the warning's raise − the signal's first governed record
   (signals_current.created_at). "Material event or assessment" is read as the warning raised from the signal — the only recorded link. */
CREATE OR REPLACE FUNCTION analytics.mc_met020_signal_lead_time(p_tenant uuid, p_domain uuid, p_from timestamptz, p_to timestamptz, p_as_of timestamptz, p_scope jsonb, p_cohort jsonb, p_params jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = analytics, prediction, pg_catalog, pg_temp AS $$
DECLARE r record; v_recs jsonb := '[]'::jsonb; v_via text[];
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'MET-020 signal lead time: warnings raised from weak signals');
  FOR r IN
    SELECT w.warning_id, w.raised_at, w.affected, w.forecast_id, s.signal_id, s.created_at AS signal_at
      FROM prediction.warnings_current w
      LEFT JOIN prediction.signals_current s ON s.signal_id::text = w.origin_ref ->> 'signal_id' AND s.tenant_id = p_tenant AND s.domain_id = p_domain AND s.created_at <= p_as_of
     WHERE w.tenant_id = p_tenant AND w.domain_id = p_domain AND w.origin_kind = 'weak_signal' AND w.raised_at >= p_from AND w.raised_at < p_to AND w.raised_at <= p_as_of
     ORDER BY w.raised_at, w.warning_id
  LOOP
    v_via := analytics.mca_warning_scope(p_scope, r.affected, r.forecast_id);
    CONTINUE WHEN cardinality(v_via) = 0;
    IF r.signal_id IS NULL THEN
      v_recs := v_recs || analytics.mca_rec('warning', r.warning_id::text, 'excluded', 'the originating signal is not readable in this domain by the as-of: the lead time has no start', '{}'::jsonb);
    ELSIF r.raised_at < r.signal_at THEN
      v_recs := v_recs || analytics.mca_rec('warning', r.warning_id::text, 'excluded', 'the warning precedes the signal''s record: the lead time is undefined', jsonb_build_object('signal_id', r.signal_id));
    ELSE
      v_recs := v_recs || analytics.mca_rec('warning', r.warning_id::text, 'included', NULL,
        jsonb_build_object('value', round(extract(epoch FROM r.raised_at - r.signal_at)::numeric, 3), 'signal_id', r.signal_id, 'signal_at', r.signal_at, 'raised_at', r.raised_at, 'scope_via', to_jsonb(v_via)));
    END IF;
  END LOOP;
  RETURN analytics.mca_out('duration', v_recs, analytics.mca_clock_reasons(p_params, ARRAY['record']),
    jsonb_build_object('clock', 'record', 'unit', 'seconds', 'start', 'prediction.signals_current.created_at', 'end', 'prediction.warnings_current.raised_at'), p_comp_key => NULL, p_at_key => 'raised_at');
END $$;

/* MET-021 WARNING DELIVERY LATENCY (duration, seconds; dimensions severity = the warning's level, channel). POPULATION: the DELIVERED
   deliveries (executive.attention_deliveries, state delivered, receipt instant receipt.at in the window, recorded by as_of) of the attention
   items whose subject is a warning in scope. VALUE: the receipt − the trigger (the warning's raise, raised_at). A SYNTHETIC channel's receipt
   (demo-mailbox …) is EXCLUDED unless the definition admits it (p_params.admit_synthetic = true) — then it is counted and quality says the
   synthetic share: a synthetic receipt demonstrates the software and never closes the real-delivery clause. */
CREATE OR REPLACE FUNCTION analytics.mc_met021_warning_delivery_latency(p_tenant uuid, p_domain uuid, p_from timestamptz, p_to timestamptz, p_as_of timestamptz, p_scope jsonb, p_cohort jsonb, p_params jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = analytics, executive, prediction, pg_catalog, pg_temp AS $$
DECLARE r record; v_recs jsonb := '[]'::jsonb; v_via text[]; v_admit boolean := coalesce((p_params ->> 'admit_synthetic')::boolean, false); v_inc int := 0; v_syn int := 0; v_notes jsonb := '[]'::jsonb;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'MET-021 warning delivery latency: delivery receipts of warnings');
  FOR r IN
    SELECT d.delivery_id, d.channel, d.synthetic_state, (d.receipt ->> 'at')::timestamptz AS receipt_at, w.warning_id, w.raised_at, w.affected, w.forecast_id, coalesce(w.level, 'unclassified') AS severity
      FROM executive.attention_deliveries d
      JOIN executive.attention_items i ON i.item_id = d.item_id AND i.subject_kind = 'warning'
      JOIN prediction.warnings_current w ON w.warning_id = i.subject_id AND w.tenant_id = p_tenant AND w.domain_id = p_domain
     WHERE d.tenant_id = p_tenant AND d.domain_id = p_domain AND d.state = 'delivered' AND jsonb_typeof(d.receipt -> 'at') = 'string'
       AND (d.receipt ->> 'at')::timestamptz >= p_from AND (d.receipt ->> 'at')::timestamptz < p_to AND (d.receipt ->> 'at')::timestamptz <= p_as_of AND d.created_at <= p_as_of
       AND (p_cohort ->> 'severity' IS NULL OR coalesce(w.level, 'unclassified') = p_cohort ->> 'severity')
       AND (p_cohort ->> 'channel' IS NULL OR d.channel = p_cohort ->> 'channel')
     ORDER BY (d.receipt ->> 'at')::timestamptz, d.delivery_id
  LOOP
    v_via := analytics.mca_warning_scope(p_scope, r.affected, r.forecast_id);
    CONTINUE WHEN cardinality(v_via) = 0;
    IF r.synthetic_state AND NOT v_admit THEN
      v_recs := v_recs || analytics.mca_rec('attention_delivery', r.delivery_id::text, 'excluded', format('a synthetic channel (%s): its receipt demonstrates the software, not a delivery; the definition does not admit synthetic receipts', r.channel),
                                            jsonb_build_object('warning_id', r.warning_id, 'channel', r.channel, 'severity', r.severity));
    ELSIF r.receipt_at < r.raised_at THEN
      v_recs := v_recs || analytics.mca_rec('attention_delivery', r.delivery_id::text, 'excluded', 'the receipt precedes the warning''s raise: the latency is undefined', jsonb_build_object('warning_id', r.warning_id));
    ELSE
      v_inc := v_inc + 1; v_syn := v_syn + CASE WHEN r.synthetic_state THEN 1 ELSE 0 END;
      v_recs := v_recs || analytics.mca_rec('attention_delivery', r.delivery_id::text, 'included', NULL,
        jsonb_build_object('value', round(extract(epoch FROM r.receipt_at - r.raised_at)::numeric, 3), 'warning_id', r.warning_id, 'trigger_at', r.raised_at, 'receipt_at', r.receipt_at,
                           'channel', r.channel, 'severity', r.severity, 'synthetic', r.synthetic_state, 'scope_via', to_jsonb(v_via)));
    END IF;
  END LOOP;
  IF v_syn > 0 THEN v_notes := v_notes || to_jsonb(format('%s of %s receipt(s) came through a synthetic channel the definition admits: the latency demonstrates the software, not a real delivery', v_syn, v_inc)); END IF;
  RETURN analytics.mca_out('duration', v_recs, analytics.mca_clock_reasons(p_params, ARRAY['record']),
    jsonb_build_object('clock', 'record', 'unit', 'seconds', 'start', 'prediction.warnings_current.raised_at (the trigger)', 'end', 'executive.attention_deliveries.receipt.at',
                       'admit_synthetic', v_admit, 'synthetic_share', CASE WHEN v_inc = 0 THEN NULL ELSE round(v_syn::numeric / v_inc, 4) END, 'notes', v_notes), p_comp_key => 'channel', p_at_key => 'receipt_at');
END $$;

/* MET-022 WARNING ACKNOWLEDGEMENT LATENCY (duration, seconds; the scene's metric #2; DESIGN D9; dimensions severity = the warning's level,
   role = the acknowledger's QUALIFYING ROLE — a role, never a person). POPULATION: the warnings in scope ACKNOWLEDGED in the window
   (acknowledged_at, the record clock, recorded by as_of) by a QUALIFIED role: the acknowledger held, at the acknowledgement instant, one of
   p_params.qualified_roles (default: the roles the acknowledge rule admits at the domain — domain_admin, strategy_owner, forecast_owner,
   risk_owner); an acknowledgement by anyone else is EXCLUDED (unqualified). START: the RECEIPT — the earliest delivered receipt (receipt.at)
   of the warning's attention item(s), recorded by as_of, from a non-synthetic channel (a synthetic one only when p_params.admit_synthetic).
   A warning with NO receipt is EXCLUDED ("no receipt instant") — unless the definition declares the PROXY (p_params.start = 'raised_proxy'):
   then its raise (raised_at) stands in, LABELLED on the record and counted in quality.proxy_share; likewise a warning acknowledged before any
   receipt (the person answered it before its delivery) — excluded as undefined when no proxy is declared. WORLD-CLOCK (timing_mode replay) warnings are EXCLUDED with the reason — their acknowledgement answers on the replay
   instant, not comparable with a live receipt (prediction.evaluate_warnings measures them on their own clock). For a role cohort the distinct
   acknowledgers are COUNTED (distinct_actors — the port applies k; no id leaves this function). */
CREATE OR REPLACE FUNCTION analytics.mc_met022_warning_ack_latency(p_tenant uuid, p_domain uuid, p_from timestamptz, p_to timestamptz, p_as_of timestamptz, p_scope jsonb, p_cohort jsonb, p_params jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = analytics, executive, prediction, identity, pg_catalog, pg_temp AS $$
DECLARE r record; v_recs jsonb := '[]'::jsonb; v_via text[]; v_roles text[]; v_role text; v_proxy boolean := coalesce(p_params ->> 'start', 'receipt') = 'raised_proxy';
        v_admit boolean := coalesce((p_params ->> 'admit_synthetic')::boolean, false); v_receipt timestamptz; v_channel text; v_syn boolean; v_start timestamptz; v_start_kind text;
        v_inc int := 0; v_prox int := 0; v_world int := 0; v_actors uuid[] := '{}'; v_reasons jsonb;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'MET-022 acknowledgement latency: acknowledged warnings, their receipts and the acknowledging roles');
  v_reasons := analytics.mca_clock_reasons(p_params, ARRAY['record']);
  IF coalesce(p_params ->> 'start', 'receipt') NOT IN ('receipt', 'raised_proxy') THEN v_reasons := v_reasons || to_jsonb(format('the definition names the start %s; the starts are receipt | raised_proxy', p_params ->> 'start')); END IF;
  v_roles := CASE WHEN jsonb_typeof(p_params -> 'qualified_roles') = 'array' THEN ARRAY(SELECT jsonb_array_elements_text(p_params -> 'qualified_roles'))
                  ELSE ARRAY['domain_admin', 'strategy_owner', 'forecast_owner', 'risk_owner'] END;
  FOR r IN
    SELECT w.warning_id, w.acknowledged_at, w.acknowledged_by, w.raised_at, w.timing_mode, w.affected, w.forecast_id, coalesce(w.level, 'unclassified') AS severity
      FROM prediction.warnings_current w
     WHERE w.tenant_id = p_tenant AND w.domain_id = p_domain AND w.acknowledged_at IS NOT NULL AND w.acknowledged_at >= p_from AND w.acknowledged_at < p_to AND w.acknowledged_at <= p_as_of
       AND (p_cohort ->> 'severity' IS NULL OR coalesce(w.level, 'unclassified') = p_cohort ->> 'severity')
     ORDER BY w.acknowledged_at, w.warning_id
  LOOP
    v_via := analytics.mca_warning_scope(p_scope, r.affected, r.forecast_id);
    CONTINUE WHEN cardinality(v_via) = 0;
    v_role := analytics.mca_role_at(r.acknowledged_by, p_tenant, p_domain, v_roles, r.acknowledged_at);
    CONTINUE WHEN p_cohort ->> 'role' IS NOT NULL AND v_role IS DISTINCT FROM p_cohort ->> 'role';
    IF r.timing_mode = 'replay' THEN
      v_world := v_world + 1;
      v_recs := v_recs || analytics.mca_rec('warning', r.warning_id::text, 'excluded', 'a replayed (world-clock) warning: its acknowledgement answers on the replay instant, not comparable with a live receipt',
                                            jsonb_build_object('severity', r.severity, 'timing_mode', r.timing_mode));
      CONTINUE;
    END IF;
    IF v_role IS NULL THEN
      v_recs := v_recs || analytics.mca_rec('warning', r.warning_id::text, 'excluded', format('acknowledged by a principal holding none of the qualified roles (%s) at the instant', array_to_string(v_roles, ', ')),
                                            jsonb_build_object('severity', r.severity));
      CONTINUE;
    END IF;
    SELECT (d.receipt ->> 'at')::timestamptz, d.channel, d.synthetic_state INTO v_receipt, v_channel, v_syn
      FROM executive.attention_deliveries d JOIN executive.attention_items i ON i.item_id = d.item_id
     WHERE i.tenant_id = p_tenant AND i.domain_id = p_domain AND i.subject_kind = 'warning' AND i.subject_id = r.warning_id AND d.state = 'delivered'
       AND jsonb_typeof(d.receipt -> 'at') = 'string' AND (d.receipt ->> 'at')::timestamptz <= p_as_of AND d.created_at <= p_as_of AND (v_admit OR NOT d.synthetic_state)
     ORDER BY (d.receipt ->> 'at')::timestamptz, d.delivery_id LIMIT 1;
    IF NOT FOUND THEN v_receipt := NULL; v_channel := NULL; v_syn := NULL; END IF;
    IF v_receipt IS NOT NULL AND r.acknowledged_at >= v_receipt THEN
      v_start := v_receipt; v_start_kind := 'receipt';
    ELSIF v_receipt IS NOT NULL AND v_proxy THEN
      v_start := r.raised_at; v_start_kind := 'raised_at (the definition''s declared proxy: acknowledged before any receipt)';
    ELSIF v_receipt IS NOT NULL THEN
      v_recs := v_recs || analytics.mca_rec('warning', r.warning_id::text, 'excluded', 'acknowledged before its receipt: the receipt-to-acknowledgement time is undefined and the definition declares no proxy',
                                            jsonb_build_object('severity', r.severity, 'role', v_role));
      CONTINUE;
    ELSIF v_proxy THEN
      v_start := r.raised_at; v_start_kind := 'raised_at (the definition''s declared proxy: no receipt recorded)';
    ELSE
      v_recs := v_recs || analytics.mca_rec('warning', r.warning_id::text, 'excluded', 'no receipt instant: the warning was never delivered through the delivery ledger by the as-of, and the definition declares no proxy',
                                            jsonb_build_object('severity', r.severity, 'role', v_role));
      CONTINUE;
    END IF;
    IF r.acknowledged_at < v_start THEN
      v_recs := v_recs || analytics.mca_rec('warning', r.warning_id::text, 'excluded', 'acknowledged before its start instant: the latency is undefined', jsonb_build_object('severity', r.severity, 'role', v_role));
      CONTINUE;
    END IF;
    v_inc := v_inc + 1; v_prox := v_prox + CASE WHEN v_start_kind = 'receipt' THEN 0 ELSE 1 END; v_actors := v_actors || r.acknowledged_by;
    v_recs := v_recs || analytics.mca_rec('warning', r.warning_id::text, 'included', NULL,
      jsonb_build_object('value', round(extract(epoch FROM r.acknowledged_at - v_start)::numeric, 3), 'start', v_start_kind, 'start_at', v_start, 'acknowledged_at', r.acknowledged_at,
                         'severity', r.severity, 'role', v_role, 'channel', v_channel, 'synthetic', v_syn, 'scope_via', to_jsonb(v_via)));
  END LOOP;
  RETURN analytics.mca_out('duration', v_recs, v_reasons,
    jsonb_build_object('clock', 'record', 'unit', 'seconds', 'start', CASE WHEN v_proxy THEN 'receipt (executive.attention_deliveries.receipt.at), else the declared proxy raised_at' ELSE 'receipt (executive.attention_deliveries.receipt.at)' END,
                       'end', 'prediction.warnings_current.acknowledged_at', 'qualified_roles', to_jsonb(v_roles), 'proxy_declared', v_proxy,
                       'proxy_share', CASE WHEN v_inc = 0 THEN NULL ELSE round(v_prox::numeric / v_inc, 4) END, 'world_clock_excluded', v_world, 'admit_synthetic', v_admit),
    CASE WHEN p_cohort ? 'role' THEN (SELECT count(DISTINCT a)::int FROM unnest(v_actors) a) END, p_comp_key => 'severity', p_at_key => 'acknowledged_at');
END $$;

/* MET-023 WARNING ACTION CLOSURE (rate; dimension severity). POPULATION: the MATERIAL warnings raised in the window (the attention engine
   judged the warning's item `material`; a warning with no item: level high or critical), in scope. NUMERATOR, all three by the as-of:
   an OWNED DISPOSITION (acknowledged or closed by a human), an ACTION (an attention act on the warning's item that acted, or an exposure
   response opened on the exposure the warning was raised from), an OUTCOME (feedback recorded on the warning, or its closure). */
CREATE OR REPLACE FUNCTION analytics.mc_met023_warning_action_closure(p_tenant uuid, p_domain uuid, p_from timestamptz, p_to timestamptz, p_as_of timestamptz, p_scope jsonb, p_cohort jsonb, p_params jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = analytics, executive, prediction, pg_catalog, pg_temp AS $$
DECLARE r record; v_recs jsonb := '[]'::jsonb; v_via text[]; v_disp boolean; v_act int; v_resp int; v_fb int; v_closed boolean; v_el jsonb; v_missing text[]; v_material boolean; v_basis text;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'MET-023 warning action closure: material warnings, their dispositions, actions and outcomes');
  FOR r IN
    SELECT w.*, coalesce(w.level, 'unclassified') AS severity,
           (SELECT i.outcome FROM executive.attention_items i WHERE i.tenant_id = p_tenant AND i.domain_id = p_domain AND i.subject_kind = 'warning' AND i.subject_id = w.warning_id
               AND i.created_at <= p_as_of ORDER BY i.created_at LIMIT 1) AS item_outcome
      FROM prediction.warnings_current w
     WHERE w.tenant_id = p_tenant AND w.domain_id = p_domain AND w.raised_at >= p_from AND w.raised_at < p_to AND w.raised_at <= p_as_of
       AND (p_cohort ->> 'severity' IS NULL OR coalesce(w.level, 'unclassified') = p_cohort ->> 'severity')
     ORDER BY w.raised_at, w.warning_id
  LOOP
    v_via := analytics.mca_warning_scope(p_scope, r.affected, r.forecast_id);
    CONTINUE WHEN cardinality(v_via) = 0;
    v_material := CASE WHEN r.item_outcome IS NOT NULL THEN r.item_outcome = 'material' ELSE r.level IN ('high', 'critical') END;
    v_basis := CASE WHEN r.item_outcome IS NOT NULL THEN 'the attention engine''s verdict on the warning''s item' ELSE 'the warning''s level (no attention item)' END;
    IF NOT v_material THEN
      v_recs := v_recs || analytics.mca_rec('warning', r.warning_id::text, 'excluded', format('not material (%s)', v_basis), jsonb_build_object('severity', r.severity, 'item_outcome', r.item_outcome));
      CONTINUE;
    END IF;
    v_disp := (r.acknowledged_at IS NOT NULL AND r.acknowledged_at <= p_as_of AND analytics.mca_is_human(r.acknowledged_by))
              OR (r.closed_at IS NOT NULL AND r.closed_at <= p_as_of AND analytics.mca_is_human(r.closed_by));
    SELECT count(*) INTO v_act FROM executive.attention_item_acts a JOIN executive.attention_items i ON i.item_id = a.item_id
     WHERE i.tenant_id = p_tenant AND i.domain_id = p_domain AND i.subject_kind = 'warning' AND i.subject_id = r.warning_id AND a.state = 'acted' AND a.settled_at <= p_as_of;
    SELECT count(*) INTO v_resp FROM prediction.exposure_responses x
     WHERE r.origin_kind = 'exposure' AND x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.exposure_id::text = r.origin_ref ->> 'exposure_id' AND x.opened_at <= p_as_of;
    SELECT count(*) INTO v_fb FROM prediction.warning_feedback f WHERE f.warning_id = r.warning_id AND f.given_at <= p_as_of;
    v_closed := r.closed_at IS NOT NULL AND r.closed_at <= p_as_of AND r.closure IS NOT NULL;
    v_el := jsonb_build_object('disposition', jsonb_build_object('met', v_disp, 'acknowledged', r.acknowledged_at IS NOT NULL AND r.acknowledged_at <= p_as_of, 'closed', v_closed),
                               'action', jsonb_build_object('met', v_act + v_resp > 0, 'attention_acts', v_act, 'exposure_responses', v_resp),
                               'outcome', jsonb_build_object('met', v_fb > 0 OR v_closed, 'feedback', v_fb, 'closure', v_closed));
    SELECT coalesce(array_agg(k ORDER BY k), '{}') INTO v_missing FROM jsonb_each(v_el) e(k, v) WHERE NOT (v ->> 'met')::boolean;
    v_recs := v_recs || analytics.mca_rec('warning', r.warning_id::text, CASE WHEN cardinality(v_missing) = 0 THEN 'numerator' ELSE 'denominator' END, NULL,
      jsonb_build_object('severity', r.severity, 'raised_at', r.raised_at, 'state_now', r.state, 'material_basis', v_basis, 'closure', v_el, 'missing', to_jsonb(v_missing), 'scope_via', to_jsonb(v_via)));
  END LOOP;
  RETURN analytics.mca_out('rate', v_recs, analytics.mca_clock_reasons(p_params, ARRAY['record']), jsonb_build_object('clock', 'record', 'window_field', 'prediction.warnings_current.raised_at'), p_comp_key => 'severity', p_at_key => 'raised_at');
END $$;

/* MET-024 FORECAST CALIBRATION (rate against an approved BAND; the scene's metric #3; DESIGN D9; dimensions horizon, method). POPULATION:
   the SCORED LIVE OUTCOMES (prediction.outcome_ledger, recorded by as_of) whose known_at falls in the window (the record clock; the world
   clock reads target_at — the day the outcome is about), for forecasts in scope by the forecast rule. NUMERATOR: covered — q10 ≤ observed ≤
   q90, ForecastingService.calibration's rule as recorded on the ledger (`covered`). The value is the 10–90 COVERAGE; the definition's band
   (threshold.band, the T1 constant 80 % ± 5 pp made a governed band) judges it. BACKTESTS are a DIFFERENT definition (held-out history,
   labelled by mode retrospective/historical): those of the scope's series computed in the window are listed as CONTEXT records, never
   counted, never shown as live calibration. */
CREATE OR REPLACE FUNCTION analytics.mc_met024_forecast_calibration(p_tenant uuid, p_domain uuid, p_from timestamptz, p_to timestamptz, p_as_of timestamptz, p_scope jsonb, p_cohort jsonb, p_params jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = analytics, prediction, pg_catalog, pg_temp AS $$
DECLARE r record; v_recs jsonb := '[]'::jsonb; v_via text[]; v_world boolean := coalesce(p_params ->> 'clock', 'record') = 'world'; v_bt int := 0; v_long int := 0; v_notes jsonb := '[]'::jsonb;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'MET-024 forecast calibration: scored live outcomes');
  FOR r IN
    SELECT o.outcome_id, o.forecast_id, o.series_key, o.horizon_code, o.method, o.target_at, o.known_at, o.observed_value, o.q10, o.q50, o.q90, o.covered, o.label, f.subject_entity_id
      FROM prediction.outcome_ledger o LEFT JOIN prediction.forecasts_current f ON f.forecast_id = o.forecast_id
     WHERE o.tenant_id = p_tenant AND o.domain_id = p_domain AND o.recorded_at <= p_as_of
       AND ((NOT v_world AND o.known_at >= p_from AND o.known_at < p_to) OR (v_world AND o.target_at >= (p_from AT TIME ZONE 'UTC')::date AND o.target_at < (p_to AT TIME ZONE 'UTC')::date))
       AND (p_cohort ->> 'horizon' IS NULL OR o.horizon_code = p_cohort ->> 'horizon') AND (p_cohort ->> 'method' IS NULL OR o.method = p_cohort ->> 'method')
     ORDER BY o.known_at, o.outcome_id
  LOOP
    v_via := analytics.mca_forecast_scope(p_scope, r.series_key, r.subject_entity_id);
    CONTINUE WHEN cardinality(v_via) = 0;
    v_long := v_long + CASE WHEN r.horizon_code IN ('3y', '5y') THEN 1 ELSE 0 END;
    v_recs := v_recs || analytics.mca_rec('forecast_outcome', r.outcome_id::text, CASE WHEN r.covered THEN 'numerator' ELSE 'denominator' END, NULL,
      jsonb_build_object('forecast_id', r.forecast_id, 'series_key', r.series_key, 'horizon', r.horizon_code, 'method', r.method, 'target_at', r.target_at, 'known_at', r.known_at,
                         'observed', r.observed_value, 'q10', r.q10, 'q50', r.q50, 'q90', r.q90, 'covered', r.covered, 'label', r.label, 'scope_via', to_jsonb(v_via)));
  END LOOP;
  FOR r IN
    SELECT b.backtest_id, b.series_key, b.horizon_code, b.method, b.mode, b.coverage_80, b.origins, b.computed_at
      FROM prediction.backtests b
     WHERE b.tenant_id = p_tenant AND b.domain_id = p_domain AND b.computed_at >= p_from AND b.computed_at < p_to AND b.computed_at <= p_as_of
       AND (p_cohort ->> 'horizon' IS NULL OR b.horizon_code = p_cohort ->> 'horizon') AND (p_cohort ->> 'method' IS NULL OR b.method = p_cohort ->> 'method')
     ORDER BY b.computed_at, b.backtest_id
  LOOP
    CONTINUE WHEN cardinality(analytics.mca_forecast_scope(p_scope, r.series_key, NULL)) = 0;
    v_bt := v_bt + 1;
    v_recs := v_recs || analytics.mca_rec('backtest', r.backtest_id::text, 'context', format('a backtest (mode %s) is held-out history — a different definition, never counted as live calibration', r.mode),
      jsonb_build_object('mode', r.mode, 'series_key', r.series_key, 'horizon', r.horizon_code, 'method', r.method, 'coverage_80', r.coverage_80, 'origins', r.origins, 'computed_at', r.computed_at));
  END LOOP;
  IF v_bt > 0 THEN v_notes := v_notes || to_jsonb(format('%s backtest(s) of the scope''s series were computed in the window: listed as context, NOT counted — backtest coverage is a different definition labelled by its mode', v_bt)); END IF;
  IF v_long > 0 THEN v_notes := v_notes || to_jsonb(format('%s outcome(s) of a 3y/5y horizon are in the population: their coverage is observed, never a validation claim (no 3y/5y method validation has passed)', v_long)); END IF;
  RETURN analytics.mca_out('rate', v_recs, '[]'::jsonb,
    jsonb_build_object('clock', CASE WHEN v_world THEN 'world' ELSE 'record' END, 'window_field', CASE WHEN v_world THEN 'prediction.outcome_ledger.target_at' ELSE 'prediction.outcome_ledger.known_at' END,
                       'rule', 'covered = q10 ≤ observed ≤ q90 (the outcome ledger''s own flag; ForecastingService.calibration)', 'backtests_not_counted', v_bt, 'long_horizon_outcomes', v_long,
                       'notes', v_notes), p_comp_key => 'horizon', p_at_key => 'known_at');
END $$;

/* MET-025 FORECAST SHARPNESS (score; dimension horizon; lower is sharper). POPULATION: the same scored live outcomes as MET-024 (known_at in
   the window, in scope). VALUE: the MEAN RELATIVE INTERVAL WIDTH (q90 − q10) / |q50| (an outcome with q50 = 0 is excluded: the relative width
   is undefined). INDETERMINATE when the same population is not CALIBRATED — its 10–90 coverage outside the band (p_params.band, default
   [0.75, 0.85]) or fewer than p_params.min_calibrated (default 8) outcomes: a sharp but uncalibrated distribution is not a virtue. */
CREATE OR REPLACE FUNCTION analytics.mc_met025_forecast_sharpness(p_tenant uuid, p_domain uuid, p_from timestamptz, p_to timestamptz, p_as_of timestamptz, p_scope jsonb, p_cohort jsonb, p_params jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = analytics, prediction, pg_catalog, pg_temp AS $$
DECLARE r record; v_recs jsonb := '[]'::jsonb; v_via text[]; v_n int := 0; v_cov int := 0; v_sum numeric := 0; v_w int := 0; v_reasons jsonb; v_lo numeric; v_hi numeric; v_min int; v_share numeric;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'MET-025 forecast sharpness: scored live outcomes');
  v_reasons := analytics.mca_clock_reasons(p_params, ARRAY['record']);
  v_lo := coalesce((p_params -> 'band' ->> 0)::numeric, 0.75); v_hi := coalesce((p_params -> 'band' ->> 1)::numeric, 0.85); v_min := coalesce((p_params ->> 'min_calibrated')::int, 8);
  FOR r IN
    SELECT o.outcome_id, o.series_key, o.horizon_code, o.method, o.q10, o.q50, o.q90, o.covered, o.known_at, f.subject_entity_id
      FROM prediction.outcome_ledger o LEFT JOIN prediction.forecasts_current f ON f.forecast_id = o.forecast_id
     WHERE o.tenant_id = p_tenant AND o.domain_id = p_domain AND o.recorded_at <= p_as_of AND o.known_at >= p_from AND o.known_at < p_to
       AND (p_cohort ->> 'horizon' IS NULL OR o.horizon_code = p_cohort ->> 'horizon')
     ORDER BY o.known_at, o.outcome_id
  LOOP
    v_via := analytics.mca_forecast_scope(p_scope, r.series_key, r.subject_entity_id);
    CONTINUE WHEN cardinality(v_via) = 0;
    v_n := v_n + 1; v_cov := v_cov + CASE WHEN r.covered THEN 1 ELSE 0 END;
    IF r.q50 IS NULL OR r.q50 = 0 OR r.q10 IS NULL OR r.q90 IS NULL THEN
      v_recs := v_recs || analytics.mca_rec('forecast_outcome', r.outcome_id::text, 'excluded', 'q50 = 0 (or a quantile missing): the relative interval width is undefined', jsonb_build_object('horizon', r.horizon_code));
    ELSE
      v_w := v_w + 1; v_sum := v_sum + (r.q90 - r.q10) / abs(r.q50);
      v_recs := v_recs || analytics.mca_rec('forecast_outcome', r.outcome_id::text, 'included', NULL,
        jsonb_build_object('value', round((r.q90 - r.q10) / abs(r.q50), 6), 'known_at', r.known_at, 'horizon', r.horizon_code, 'method', r.method, 'series_key', r.series_key, 'covered', r.covered, 'scope_via', to_jsonb(v_via)));
    END IF;
  END LOOP;
  v_share := CASE WHEN v_n = 0 THEN NULL ELSE round(v_cov::numeric / v_n, 6) END;
  IF v_n < v_min THEN
    v_reasons := v_reasons || to_jsonb(format('sharpness is read only for calibrated distributions: the population''s calibration rests on %s outcome(s), below %s (MET-024''s floor)', v_n, v_min));
  ELSIF v_share < v_lo OR v_share > v_hi THEN
    v_reasons := v_reasons || to_jsonb(format('sharpness is read only for calibrated distributions: the population''s 10–90 coverage is %s, outside the band [%s, %s] (MET-024)', trim_scale(v_share), trim_scale(v_lo), trim_scale(v_hi)));
  END IF;
  RETURN analytics.mca_out('score', v_recs, v_reasons,
    jsonb_build_object('clock', 'record', 'measure', 'mean (q90 − q10) / |q50| over the included outcomes', 'calibration', jsonb_build_object('n', v_n, 'covered', v_cov, 'coverage', v_share, 'band', jsonb_build_array(v_lo, v_hi))),
    NULL, CASE WHEN v_w = 0 THEN NULL ELSE round(v_sum / v_w, 6) END, p_comp_key => 'horizon', p_at_key => 'known_at');
END $$;

/* MET-026 SCENARIO DISTINCTNESS (rate). POPULATION: the APPROVED (active) scenario sets live in the window (activated by its end, not
   retired before its start, by the as-of). THE DISTINCTNESS TEST (stated): each live member branch's STRUCTURE is the set of its active
   driver and impact elements (prediction.scenario_elements of kinds driver and impact, the branch's own and its scenario's shared ones, by
   the as-of), as "kind:name"; two branches are materially different when the Jaccard similarity of their structures is ≤ p_params.
   max_similarity (default 0.5). A set PASSES when it has ≥ 2 live branches, every branch declares a structure, and every pair is materially
   different. The failing pairs and the structureless branches are named on the record. Scope: the set's package objectives (the package
   rule), else ignored (said). */
CREATE OR REPLACE FUNCTION analytics.mc_met026_scenario_distinctness(p_tenant uuid, p_domain uuid, p_from timestamptz, p_to timestamptz, p_as_of timestamptz, p_scope jsonb, p_cohort jsonb, p_params jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = analytics, prediction, decision, pg_catalog, pg_temp AS $$
DECLARE s record; v_recs jsonb := '[]'::jsonb; v_max numeric := coalesce((p_params ->> 'max_similarity')::numeric, 0.5); v_br jsonb; v_pairs jsonb; v_empty jsonb; v_n int; v_pass boolean; v_via text[];
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'MET-026 scenario distinctness: approved scenario sets and their branch structures');
  FOR s IN
    SELECT x.set_id, x.title, x.package_id, x.activated_at, x.retired_at FROM prediction.scenario_sets x
     WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.activated_at IS NOT NULL AND x.activated_at < p_to AND x.activated_at <= p_as_of
       AND (x.retired_at IS NULL OR x.retired_at >= p_from OR x.retired_at > p_as_of)
     ORDER BY x.activated_at, x.set_id
  LOOP
    v_via := CASE WHEN p_scope IS NULL THEN ARRAY['domain']
                  WHEN s.package_id IS NULL THEN '{}'::text[]
                  ELSE (SELECT analytics.mca_package_scope(p_scope, v.package_id, v.version, v.objectives) FROM decision.package_versions v WHERE v.package_id = s.package_id ORDER BY v.version DESC LIMIT 1) END;
    CONTINUE WHEN coalesce(cardinality(v_via), 0) = 0;
    WITH m AS (SELECT DISTINCT ON (mm.branch_id) mm.branch_id, mm.scenario_id FROM prediction.scenario_set_members mm
                WHERE mm.set_id = s.set_id AND mm.branch_id IS NOT NULL AND mm.added_at <= p_as_of AND (mm.removed_at IS NULL OR mm.removed_at > p_as_of)
                ORDER BY mm.branch_id, mm.added_at DESC),
         st AS (SELECT m.branch_id, coalesce(array_agg(DISTINCT e.kind || ':' || lower(btrim(e.name))) FILTER (WHERE e.element_id IS NOT NULL), '{}') AS sig
                  FROM m LEFT JOIN prediction.scenario_elements e ON e.scenario_id = m.scenario_id AND (e.branch_id = m.branch_id OR e.branch_id IS NULL)
                       AND e.kind IN ('driver', 'impact') AND e.declared_at <= p_as_of AND (e.retired_at IS NULL OR e.retired_at > p_as_of)
                 GROUP BY m.branch_id)
    SELECT coalesce(jsonb_agg(jsonb_build_object('branch_id', st.branch_id, 'structure', to_jsonb(st.sig)) ORDER BY st.branch_id), '[]'::jsonb),
           coalesce(jsonb_agg(to_jsonb(st.branch_id) ORDER BY st.branch_id) FILTER (WHERE cardinality(st.sig) = 0), '[]'::jsonb), count(*)
      INTO v_br, v_empty, v_n FROM st;
    SELECT coalesce(jsonb_agg(jsonb_build_object('a', a.branch_id, 'b', b.branch_id, 'similarity', round(sim, 4)) ORDER BY a.branch_id, b.branch_id) FILTER (WHERE sim > v_max), '[]'::jsonb) INTO v_pairs
      FROM (SELECT (x ->> 'branch_id')::uuid AS branch_id, ARRAY(SELECT jsonb_array_elements_text(x -> 'structure')) AS sig FROM jsonb_array_elements(v_br) x) a
      JOIN (SELECT (x ->> 'branch_id')::uuid AS branch_id, ARRAY(SELECT jsonb_array_elements_text(x -> 'structure')) AS sig FROM jsonb_array_elements(v_br) x) b ON a.branch_id < b.branch_id
      CROSS JOIN LATERAL (SELECT CASE WHEN cardinality(a.sig) + cardinality(b.sig) = 0 THEN 1.0
                                      ELSE (SELECT count(*) FROM (SELECT unnest(a.sig) INTERSECT SELECT unnest(b.sig)) i)::numeric / (SELECT count(*) FROM (SELECT unnest(a.sig) UNION SELECT unnest(b.sig)) u) END AS sim) j;
    v_pass := v_n >= 2 AND jsonb_array_length(v_empty) = 0 AND jsonb_array_length(v_pairs) = 0;
    v_recs := v_recs || analytics.mca_rec('scenario_set', s.set_id::text, CASE WHEN v_pass THEN 'numerator' ELSE 'denominator' END, NULL,
      jsonb_build_object('title', s.title, 'activated_at', s.activated_at, 'live_branches', v_n, 'structureless_branches', v_empty, 'too_similar_pairs', v_pairs, 'max_similarity', v_max, 'branches', v_br,
                         'fails', to_jsonb(array_remove(ARRAY[CASE WHEN v_n < 2 THEN 'fewer than two live branches' END, CASE WHEN jsonb_array_length(v_empty) > 0 THEN 'a branch declares no driver/impact structure' END,
                                                               CASE WHEN jsonb_array_length(v_pairs) > 0 THEN 'branches not materially different' END], NULL)),
                         'scope_via', to_jsonb(v_via)));
  END LOOP;
  RETURN analytics.mca_out('rate', v_recs, analytics.mca_clock_reasons(p_params, ARRAY['record']),
    jsonb_build_object('clock', 'record', 'test', format('Jaccard similarity of the branches'' driver+impact element sets ≤ %s for every pair; ≥ 2 live branches; none structureless', v_max)), p_comp_key => NULL, p_at_key => 'activated_at');
END $$;

/* MET-027 SIMULATION REPRODUCIBILITY (rate). POPULATION: the ACCEPTED runs (completed, and valid at the as-of) completed in the window. Each
   run's LATEST reproduction by the as-of (simulation.reproductions): `reproduced` → numerator; `mismatch` / `unreproducible` → denominator.
   THE TOLERANCE is 0: the product reproduces by DIGEST EQUALITY of the outputs (stated — a numerical tolerance is not recorded). A run never
   reproduced is EXCLUDED and counted ("never reproduced"). Scope: a run on a twin whose boundary intersects the entities, or on a scenario
   of the scope's objectives? — the twin rule (boundary entities). */
CREATE OR REPLACE FUNCTION analytics.mc_met027_simulation_reproducibility(p_tenant uuid, p_domain uuid, p_from timestamptz, p_to timestamptz, p_as_of timestamptz, p_scope jsonb, p_cohort jsonb, p_params jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = analytics, simulation, twin, pg_catalog, pg_temp AS $$
DECLARE r record; rp record; v_recs jsonb := '[]'::jsonb; v_via text[]; v_never int := 0;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'MET-027 simulation reproducibility: accepted runs and their reproductions');
  FOR r IN
    SELECT x.run_id, x.model_ref, x.completed_at, x.twin_id, t.boundary
      FROM simulation.runs_current x LEFT JOIN twin.twins_current t ON t.twin_id = x.twin_id
     WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.state = 'completed' AND x.completed_at >= p_from AND x.completed_at < p_to AND x.completed_at <= p_as_of
       AND NOT (x.validity = 'invalidated' AND x.invalidated_at <= p_as_of)
     ORDER BY x.completed_at, x.run_id
  LOOP
    v_via := CASE WHEN p_scope IS NULL THEN ARRAY['domain'] ELSE analytics.mca_scope_via(p_scope, '{}', analytics.mca_jtxt(r.boundary), '{}', '{}') END;
    CONTINUE WHEN cardinality(v_via) = 0;
    SELECT y.reproduction_id, y.verdict, y.reason, y.reproduced_at INTO rp FROM simulation.reproductions y
     WHERE y.run_id = r.run_id AND y.reproduced_at <= p_as_of ORDER BY y.reproduced_at DESC, y.reproduction_id DESC LIMIT 1;
    IF rp.reproduction_id IS NULL THEN
      v_never := v_never + 1;
      v_recs := v_recs || analytics.mca_rec('simulation_run', r.run_id::text, 'excluded', 'never reproduced by the as-of: unmeasured, not a failure', jsonb_build_object('model_ref', r.model_ref));
    ELSE
      v_recs := v_recs || analytics.mca_rec('simulation_run', r.run_id::text, CASE WHEN rp.verdict = 'reproduced' THEN 'numerator' ELSE 'denominator' END, NULL,
        jsonb_build_object('model_ref', r.model_ref, 'completed_at', r.completed_at, 'verdict', rp.verdict, 'reproduction_id', rp.reproduction_id, 'reproduced_at', rp.reproduced_at, 'reason', rp.reason, 'scope_via', to_jsonb(v_via)));
    END IF;
  END LOOP;
  RETURN analytics.mca_out('rate', v_recs, analytics.mca_clock_reasons(p_params, ARRAY['record']),
    jsonb_build_object('clock', 'record', 'tolerance', 0, 'tolerance_basis', 'digest equality of the outputs (simulation.reproductions) — no numerical tolerance is recorded', 'never_reproduced', v_never), p_comp_key => 'model_ref', p_at_key => 'completed_at');
END $$;

/* MET-028 TWIN SYNCHRONIZATION HEALTH (rate). POPULATION: the twins with an ADMITTED head on the `actual` branch at the as-of (declared, and
   admitted, by then), in scope by the twin rule (boundary entities). WITHIN CONTRACT when, at the as-of: FRESHNESS — the latest freshness
   policy by then holds (the head's age = the as-of's day − observed_through, else the day of known_at, ≤ max_age_days: twin.tbr_age's rule
   evaluated at the as-of); COVERAGE — every key the twin's published contract (current by then) exposes is present on the head and not
   expired (no published contract: the clause does not apply, said); VALIDATION — the latest validation of the head by then is `fit`. A twin
   with NO freshness policy has no sync contract: EXCLUDED, counted. */
CREATE OR REPLACE FUNCTION analytics.mc_met028_twin_sync_health(p_tenant uuid, p_domain uuid, p_from timestamptz, p_to timestamptz, p_as_of timestamptz, p_scope jsonb, p_cohort jsonb, p_params jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = analytics, twin, pg_catalog, pg_temp AS $$
DECLARE t record; hv record; fp record; ct record; v_recs jsonb := '[]'::jsonb; v_via text[]; v_day date := (p_as_of AT TIME ZONE 'UTC')::date; v_age int; v_fresh boolean; v_missing jsonb;
        v_cov boolean; v_val text; v_el jsonb; v_fail text[];
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'MET-028 twin sync health: twins, their heads, policies, contracts and validations');
  FOR t IN SELECT x.twin_id, x.title, x.boundary FROM twin.twins_current x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.declared_at <= p_as_of ORDER BY x.twin_id LOOP
    v_via := CASE WHEN p_scope IS NULL THEN ARRAY['domain'] ELSE analytics.mca_scope_via(p_scope, '{}', analytics.mca_jtxt(t.boundary), '{}', '{}') END;
    CONTINUE WHEN cardinality(v_via) = 0;
    SELECT v.version, v.known_at, v.observed_through INTO hv FROM twin.twin_versions v
     WHERE v.twin_id = t.twin_id AND v.branch_id = 'actual' AND v.state = 'admitted' AND v.admitted_at IS NOT NULL AND v.admitted_at <= p_as_of
       AND (v.withdrawn_at IS NULL OR v.withdrawn_at > p_as_of) ORDER BY v.version DESC LIMIT 1;
    IF hv.version IS NULL THEN
      v_recs := v_recs || analytics.mca_rec('twin', t.twin_id::text, 'excluded', 'no admitted state on the actual branch by the as-of: nothing to be in sync', '{}'::jsonb);
      CONTINUE;
    END IF;
    SELECT f.version, f.max_age_days INTO fp FROM twin.freshness_policies f WHERE f.twin_id = t.twin_id AND f.set_at <= p_as_of ORDER BY f.version DESC LIMIT 1;
    IF fp.version IS NULL THEN
      v_recs := v_recs || analytics.mca_rec('twin', t.twin_id::text, 'excluded', 'no freshness policy by the as-of: the twin has no synchronization contract to be within', jsonb_build_object('head_version', hv.version));
      CONTINUE;
    END IF;
    v_age := v_day - coalesce(hv.observed_through, (hv.known_at AT TIME ZONE 'UTC')::date);
    v_fresh := v_age <= fp.max_age_days;
    SELECT c.contract_version, c.exposed INTO ct FROM twin.twin_contracts c WHERE c.twin_id = t.twin_id AND c.published_at <= p_as_of ORDER BY c.contract_version DESC LIMIT 1;
    IF ct.contract_version IS NULL THEN
      v_cov := NULL; v_missing := '[]'::jsonb;
    ELSE
      SELECT coalesce(jsonb_agg(k ORDER BY k), '[]'::jsonb) INTO v_missing FROM jsonb_object_keys(ct.exposed) k
       WHERE NOT EXISTS (SELECT 1 FROM twin.state_elements e WHERE e.twin_id = t.twin_id AND e.version = hv.version AND e.key = k AND (e.valid_to IS NULL OR e.valid_to >= v_day));
      v_cov := jsonb_array_length(v_missing) = 0;
    END IF;
    SELECT x.verdict INTO v_val FROM twin.validations x WHERE x.twin_id = t.twin_id AND x.version = hv.version AND x.validated_at <= p_as_of ORDER BY x.validated_at DESC LIMIT 1;
    IF NOT FOUND THEN v_val := NULL; END IF;
    v_el := jsonb_build_object('freshness', jsonb_build_object('met', v_fresh, 'age_days', v_age, 'max_age_days', fp.max_age_days, 'policy_version', fp.version),
                               'coverage', jsonb_build_object('met', v_cov, 'contract_version', ct.contract_version, 'missing_keys', v_missing,
                                                              'note', CASE WHEN ct.contract_version IS NULL THEN 'no published contract: the clause does not apply' END),
                               'validation', jsonb_build_object('met', v_val = 'fit', 'verdict', coalesce(v_val, 'never validated')));
    v_fail := array_remove(ARRAY[CASE WHEN NOT v_fresh THEN 'freshness' END, CASE WHEN v_cov IS FALSE THEN 'coverage' END, CASE WHEN v_val IS DISTINCT FROM 'fit' THEN 'validation' END], NULL);
    v_recs := v_recs || analytics.mca_rec('twin', t.twin_id::text, CASE WHEN cardinality(v_fail) = 0 THEN 'numerator' ELSE 'denominator' END, NULL,
      jsonb_build_object('title', t.title, 'head_version', hv.version, 'head_known_at', hv.known_at, 'contracts', v_el, 'failed', to_jsonb(v_fail), 'scope_via', to_jsonb(v_via)));
  END LOOP;
  RETURN analytics.mca_out('rate', v_recs, analytics.mca_clock_reasons(p_params, ARRAY['record']),
    jsonb_build_object('clock', 'record', 'state_at', 'the as-of (a state measure: the window bounds nothing but the period it is reported for)', 'as_of_day', v_day), p_comp_key => NULL, p_at_key => 'head_known_at');
END $$;

-- §MCA.3 STRATEGY AND COMMITMENTS ──────────────────────────────────────────────────────────────────────────────────────────────────────

/* MET-029 STRATEGIC ALIGNMENT COVERAGE (rate). POPULATION ("material items", stated): the APPROVED initiatives (approved by the window's end,
   by the as-of) and the ROOT commitment obligations live in the period (created by the window's end, due on or after its start), in scope
   (their objectives). NUMERATOR: linked to all four, by the as-of — an OBJECTIVE (the initiative's objective / initiative_objectives; the
   obligation's objective_ids) that is a strategy objective; a CAPABILITY (an active alignment builds/supports to a CAP from the item or one of
   its objectives); an OWNER (a named human); a MEASURE (a plan measure of the initiative's plan, or an active `measures` alignment onto the
   item or one of its objectives). */
CREATE OR REPLACE FUNCTION analytics.mc_met029_alignment_coverage(p_tenant uuid, p_domain uuid, p_from timestamptz, p_to timestamptz, p_as_of timestamptz, p_scope jsonb, p_cohort jsonb, p_params jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = analytics, executive, decision, graph, pg_catalog, pg_temp AS $$
DECLARE r record; v_recs jsonb := '[]'::jsonb; v_via text[]; v_objs uuid[]; v_cap int; v_msr int; v_el jsonb; v_missing text[];
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'MET-029 alignment coverage: approved initiatives and live commitment obligations');
  FOR r IN
    SELECT 'initiative'::text AS kind, i.initiative_id AS id, i.owner_principal_id AS owner, i.plan_id, i.approved_at AS at,
           ARRAY(SELECT o FROM (SELECT i.objective_id AS o UNION SELECT io.objective_id FROM executive.initiative_objectives io WHERE io.initiative_id = i.initiative_id AND io.linked_at <= p_as_of) z WHERE o IS NOT NULL) AS objs
      FROM executive.initiatives i
     WHERE i.tenant_id = p_tenant AND i.domain_id = p_domain AND i.approved_at IS NOT NULL AND i.approved_at < p_to AND i.approved_at <= p_as_of
    UNION ALL
    SELECT 'commitment_obligation', ci.item_id, ci.owner_principal_id, NULL::uuid, ci.created_at, coalesce(ci.objective_ids, '{}')
      FROM decision.commitment_items ci
     WHERE ci.tenant_id = p_tenant AND ci.domain_id = p_domain AND ci.parent_item_id IS NULL AND ci.created_at < p_to AND ci.created_at <= p_as_of AND ci.due_at >= p_from
     ORDER BY 1, 2
  LOOP
    v_via := analytics.mca_scope_via(p_scope, ARRAY(SELECT x::text FROM unnest(r.objs) x), '{}', '{}', '{}');
    CONTINUE WHEN cardinality(v_via) = 0;
    SELECT coalesce(array_agg(s.strategy_object_id), '{}') INTO v_objs FROM graph.strategy_current s
     WHERE s.strategy_object_id = ANY (r.objs) AND s.tenant_id = p_tenant AND s.domain_id = p_domain AND s.object_type = 'OBJ' AND s.declared_at <= p_as_of;
    SELECT count(*) INTO v_cap FROM graph.alignments a
     WHERE a.tenant_id = p_tenant AND a.domain_id = p_domain AND a.kind IN ('builds', 'supports') AND a.to_type = 'CAP' AND (a.from_id = r.id OR a.from_id = ANY (v_objs))
       AND a.declared_at <= p_as_of AND (a.retired_at IS NULL OR a.retired_at > p_as_of);
    SELECT (SELECT count(*) FROM executive.plan_measures pm WHERE r.plan_id IS NOT NULL AND pm.plan_id = r.plan_id AND pm.bound_at <= p_as_of)
         + (SELECT count(*) FROM graph.alignments a WHERE a.tenant_id = p_tenant AND a.domain_id = p_domain AND a.kind = 'measures' AND (a.to_id = r.id OR a.to_id = ANY (v_objs))
               AND a.declared_at <= p_as_of AND (a.retired_at IS NULL OR a.retired_at > p_as_of))
      INTO v_msr;
    v_el := jsonb_build_object('objective', jsonb_build_object('met', cardinality(v_objs) > 0, 'objectives', to_jsonb(v_objs)),
                               'capability', jsonb_build_object('met', v_cap > 0, 'alignments', v_cap),
                               'owner', jsonb_build_object('met', r.owner IS NOT NULL AND analytics.mca_is_human(r.owner)),
                               'measure', jsonb_build_object('met', v_msr > 0, 'measures', v_msr));
    SELECT coalesce(array_agg(k ORDER BY k), '{}') INTO v_missing FROM jsonb_each(v_el) e(k, v) WHERE NOT (v ->> 'met')::boolean;
    v_recs := v_recs || analytics.mca_rec(r.kind, r.id::text, CASE WHEN cardinality(v_missing) = 0 THEN 'numerator' ELSE 'denominator' END, NULL,
      jsonb_build_object('at', r.at, 'links', v_el, 'missing', to_jsonb(v_missing), 'scope_via', to_jsonb(v_via)));
  END LOOP;
  RETURN analytics.mca_out('rate', v_recs, analytics.mca_clock_reasons(p_params, ARRAY['record']),
    jsonb_build_object('clock', 'record', 'material', 'approved initiatives; root commitment obligations live in the period'), p_comp_key => '_kind', p_at_key => 'at');
END $$;

/* MET-030 COMMITMENT OUTCOME CLOSURE (rate; dimension portfolio = the package's initiative, or `none` — PORTFOLIO LEVEL ONLY: App M's
   "Owner" scope is never a grouping (D4); an item's owner routes accountability on the item itself and is never aggregated per person).
   POPULATION: the commitment items DUE in the window (due_at, created by the as-of). NUMERATOR: CLOSED by the as-of with — EVIDENCE (item.done
   with its evidence; for a root obligation, the commitment's co-signed closure), an EXCEPTION (item.waived, co-signed), an OUTCOME (a root
   obligation whose package has an outcome recorded on the committed version) or SUPERSESSION (item.cancelled, or the package committed again
   later — a newer commitment supersedes this one). Not closed by the as-of → denominator. */
CREATE OR REPLACE FUNCTION analytics.mc_met030_commitment_closure(p_tenant uuid, p_domain uuid, p_from timestamptz, p_to timestamptz, p_as_of timestamptz, p_scope jsonb, p_cohort jsonb, p_params jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = analytics, decision, pg_catalog, pg_temp AS $$
DECLARE r record; v_recs jsonb := '[]'::jsonb; v_via text[]; v_how text; v_at timestamptz;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'MET-030 commitment closure: commitment items due in the window');
  FOR r IN
    SELECT ci.item_id, ci.commitment_id, ci.package_id, ci.parent_item_id, ci.due_at, ci.objective_ids, c.version, c.committed_at, coalesce(p.initiative_id::text, 'none') AS portfolio
      FROM decision.commitment_items ci JOIN decision.commitments c ON c.commitment_id = ci.commitment_id JOIN decision.packages_current p ON p.package_id = ci.package_id
     WHERE ci.tenant_id = p_tenant AND ci.domain_id = p_domain AND ci.due_at >= p_from AND ci.due_at < p_to AND ci.created_at <= p_as_of
       AND (p_cohort ->> 'portfolio' IS NULL OR coalesce(p.initiative_id::text, 'none') = p_cohort ->> 'portfolio')
     ORDER BY ci.due_at, ci.item_id
  LOOP
    v_via := analytics.mca_scope_via(p_scope, ARRAY(SELECT x::text FROM unnest(r.objective_ids) x), '{}', '{}', '{}');
    CONTINUE WHEN cardinality(v_via) = 0;
    v_how := NULL; v_at := NULL;
    SELECT CASE e.event WHEN 'item.done' THEN 'evidence' WHEN 'item.waived' THEN 'exception' WHEN 'item.cancelled' THEN 'supersession' END, e.occurred_at INTO v_how, v_at
      FROM decision.commitment_events e WHERE e.item_id = r.item_id AND e.event IN ('item.done', 'item.waived', 'item.cancelled') AND e.occurred_at <= p_as_of
     ORDER BY e.occurred_at, e.event_id LIMIT 1;
    IF v_how IS NULL AND r.parent_item_id IS NULL THEN
      SELECT 'evidence', e.occurred_at INTO v_how, v_at FROM decision.commitment_events e
       WHERE e.commitment_id = r.commitment_id AND e.event = 'closure.cosigned' AND e.occurred_at <= p_as_of ORDER BY e.occurred_at LIMIT 1;
      IF v_how IS NULL THEN
        SELECT 'outcome', o.recorded_at INTO v_how, v_at FROM decision.outcomes o WHERE o.package_id = r.package_id AND o.version = r.version AND o.recorded_at <= p_as_of ORDER BY o.recorded_at LIMIT 1;
      END IF;
    END IF;
    IF v_how IS NULL THEN
      SELECT 'supersession', c2.committed_at INTO v_how, v_at FROM decision.commitments c2
       WHERE c2.package_id = r.package_id AND c2.committed_at > r.committed_at AND c2.committed_at <= p_as_of ORDER BY c2.committed_at LIMIT 1;
    END IF;
    v_recs := v_recs || analytics.mca_rec(CASE WHEN r.parent_item_id IS NULL THEN 'commitment_obligation' ELSE 'commitment_item' END, r.item_id::text,
      CASE WHEN v_how IS NOT NULL THEN 'numerator' ELSE 'denominator' END, NULL,
      jsonb_build_object('due_at', r.due_at, 'closed_by', coalesce(v_how, 'not closed by the as-of'), 'closed_at', v_at, 'portfolio', r.portfolio, 'scope_via', to_jsonb(v_via)));
  END LOOP;
  RETURN analytics.mca_out('rate', v_recs, analytics.mca_clock_reasons(p_params, ARRAY['record']),
    jsonb_build_object('clock', 'record', 'window_field', 'decision.commitment_items.due_at', 'grain', 'portfolio level only — never per owner (D4)'), p_comp_key => 'portfolio', p_at_key => 'due_at');
END $$;

-- §MCA.4 V01-T-046 VALUE MEASURES AND ES-40-008 INDICATORS ─────────────────────────────────────────────────────────────────────────────

/* V1 DECISION CYCLE TIME (duration, seconds): executive.metrics' decision_latency — per COMMITMENT recorded in the window whose version was
   proposed: the version's proposal → its commitment. A package recommitted after a reopening contributes each cycle. In scope by the package
   rule. */
CREATE OR REPLACE FUNCTION analytics.mc_v1_decision_cycle(p_tenant uuid, p_domain uuid, p_from timestamptz, p_to timestamptz, p_as_of timestamptz, p_scope jsonb, p_cohort jsonb, p_params jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = analytics, decision, pg_catalog, pg_temp AS $$
DECLARE r record; v_recs jsonb := '[]'::jsonb; v_via text[];
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'V1 decision cycle time: commitments and their proposals');
  FOR r IN
    SELECT c.commitment_id, c.package_id, c.version, c.committed_at, v.proposed_at, v.objectives FROM decision.commitments c
      JOIN decision.package_versions v ON v.package_id = c.package_id AND v.version = c.version
     WHERE c.tenant_id = p_tenant AND c.domain_id = p_domain AND c.committed_at >= p_from AND c.committed_at < p_to AND c.committed_at <= p_as_of
     ORDER BY c.committed_at, c.commitment_id
  LOOP
    v_via := analytics.mca_package_scope(p_scope, r.package_id, r.version, r.objectives);
    CONTINUE WHEN cardinality(v_via) = 0;
    IF r.proposed_at IS NULL OR r.proposed_at > p_as_of THEN
      v_recs := v_recs || analytics.mca_rec('decision_commitment', r.commitment_id::text, 'excluded', 'the committed version records no proposal instant: the cycle has no start', jsonb_build_object('package_id', r.package_id));
    ELSE
      v_recs := v_recs || analytics.mca_rec('decision_commitment', r.commitment_id::text, 'included', NULL,
        jsonb_build_object('value', round(extract(epoch FROM r.committed_at - r.proposed_at)::numeric, 3), 'package_id', r.package_id, 'version', r.version, 'proposed_at', r.proposed_at,
                           'committed_at', r.committed_at, 'scope_via', to_jsonb(v_via)));
    END IF;
  END LOOP;
  RETURN analytics.mca_out('duration', v_recs, analytics.mca_clock_reasons(p_params, ARRAY['record']),
    jsonb_build_object('clock', 'record', 'unit', 'seconds', 'basis', 'executive.metrics decision_latency: package_versions.proposed_at → commitments.committed_at'), p_comp_key => NULL, p_at_key => 'committed_at');
END $$;

/* V1 UNDERSTANDING LATENCY (duration, seconds): executive.metrics' time_to_understanding — the attention items FIRST ROUTED in the window
   (item.routed / item.escalated / item.unrouted): the routing → the first human act on the item (acknowledged, suppressed, delegated, closed, a
   suppression requested, an act launched), by the as-of. Items without an act by then are EXCLUDED and counted (not measured, never zero).
   Domain-wide by nature (the attention queue is the domain's). */
CREATE OR REPLACE FUNCTION analytics.mc_v1_understanding_latency(p_tenant uuid, p_domain uuid, p_from timestamptz, p_to timestamptz, p_as_of timestamptz, p_scope jsonb, p_cohort jsonb, p_params jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = analytics, executive, pg_catalog, pg_temp AS $$
DECLARE r record; v_recs jsonb := '[]'::jsonb; v_none int := 0;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'V1 understanding latency: routed attention items and their first human act');
  FOR r IN
    WITH routed AS (
      SELECT e.item_id, min(e.occurred_at) AS routed_at FROM executive.attention_item_events e
       WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain AND e.event IN ('item.routed', 'item.escalated', 'item.unrouted') AND e.occurred_at <= p_as_of GROUP BY e.item_id)
    SELECT r0.item_id, r0.routed_at, i.signal_class,
           least((SELECT min(x.occurred_at) FROM executive.attention_item_events x WHERE x.item_id = r0.item_id AND x.occurred_at > r0.routed_at AND x.occurred_at <= p_as_of
                    AND x.event IN ('item.acknowledged', 'item.suppressed', 'item.delegated', 'item.closed', 'item.suppression_requested')),
                 (SELECT min(a.launched_at) FROM executive.attention_item_acts a WHERE a.item_id = r0.item_id AND a.launched_at > r0.routed_at AND a.launched_at <= p_as_of)) AS acted_at
      FROM routed r0 JOIN executive.attention_items i ON i.item_id = r0.item_id
     WHERE r0.routed_at >= p_from AND r0.routed_at < p_to
     ORDER BY r0.routed_at, r0.item_id
  LOOP
    IF r.acted_at IS NULL THEN
      v_none := v_none + 1;
      v_recs := v_recs || analytics.mca_rec('attention_item', r.item_id::text, 'excluded', 'no human act on the item by the as-of: counted, not measured', jsonb_build_object('signal_class', r.signal_class));
    ELSE
      v_recs := v_recs || analytics.mca_rec('attention_item', r.item_id::text, 'included', NULL,
        jsonb_build_object('value', round(extract(epoch FROM r.acted_at - r.routed_at)::numeric, 3), 'signal_class', r.signal_class, 'routed_at', r.routed_at, 'acted_at', r.acted_at));
    END IF;
  END LOOP;
  RETURN analytics.mca_out('duration', v_recs, analytics.mca_clock_reasons(p_params, ARRAY['record']),
    jsonb_build_object('clock', 'record', 'unit', 'seconds', 'basis', 'executive.metrics time_to_understanding: the first routing → the first human act', 'without_act', v_none,
                       'notes', analytics.mca_scope_ignored(p_scope, 'the attention queue is the domain''s')), p_comp_key => 'signal_class', p_at_key => 'routed_at');
END $$;

/* V1 WARNING PRECISION (rate): prediction.evaluate_warnings' feedback — of the warnings raised in the window (in scope) that carry USEFUL or
   FALSE feedback by the as-of, the share marked useful. A warning marked both is EXCLUDED (contradictory feedback, named); late / missed /
   duplicated feedback alone does not enter the precision (evaluate_warnings reports those rates apart). */
CREATE OR REPLACE FUNCTION analytics.mc_v1_warning_precision(p_tenant uuid, p_domain uuid, p_from timestamptz, p_to timestamptz, p_as_of timestamptz, p_scope jsonb, p_cohort jsonb, p_params jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = analytics, prediction, pg_catalog, pg_temp AS $$
DECLARE r record; v_recs jsonb := '[]'::jsonb; v_via text[];
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'V1 warning precision: warnings and their useful / false feedback');
  FOR r IN
    SELECT w.warning_id, w.affected, w.forecast_id, w.origin_kind, w.raised_at,
           bool_or(f.kind = 'useful') AS useful, bool_or(f.kind = 'false') AS falsed
      FROM prediction.warnings_current w JOIN prediction.warning_feedback f ON f.warning_id = w.warning_id AND f.given_at <= p_as_of AND f.kind IN ('useful', 'false')
     WHERE w.tenant_id = p_tenant AND w.domain_id = p_domain AND w.raised_at >= p_from AND w.raised_at < p_to AND w.raised_at <= p_as_of
     GROUP BY w.warning_id, w.affected, w.forecast_id, w.origin_kind, w.raised_at
     ORDER BY w.warning_id
  LOOP
    v_via := analytics.mca_warning_scope(p_scope, r.affected, r.forecast_id);
    CONTINUE WHEN cardinality(v_via) = 0;
    IF r.useful AND r.falsed THEN
      v_recs := v_recs || analytics.mca_rec('warning', r.warning_id::text, 'excluded', 'contradictory feedback: marked both useful and false', jsonb_build_object('origin_kind', r.origin_kind, 'raised_at', r.raised_at));
    ELSE
      v_recs := v_recs || analytics.mca_rec('warning', r.warning_id::text, CASE WHEN r.useful THEN 'numerator' ELSE 'denominator' END, NULL,
        jsonb_build_object('feedback', CASE WHEN r.useful THEN 'useful' ELSE 'false' END, 'origin_kind', r.origin_kind, 'raised_at', r.raised_at, 'scope_via', to_jsonb(v_via)));
    END IF;
  END LOOP;
  RETURN analytics.mca_out('rate', v_recs, analytics.mca_clock_reasons(p_params, ARRAY['record']),
    jsonb_build_object('clock', 'record', 'basis', 'prediction.evaluate_warnings'' feedback: useful ÷ (useful + false), a warning counted once'), p_comp_key => 'origin_kind', p_at_key => 'raised_at');
END $$;

/* V1 ATTENTION SAVED (rate; noise reduction): executive.evaluate_attention_queue's PRECISION — over the attention items created in the window:
   positive = material when it arrived, not elevated later, acknowledged, then disposed `actioned`; negative (a false alarm) = material, not
   elevated, then disposed not_material or duplicate, or closed without acknowledgement (and not actioned or late) — each by the as-of. Items
   neither (below threshold, elevated, late, undisposed) are EXCLUDED with their reason. Domain-wide by nature. */
CREATE OR REPLACE FUNCTION analytics.mc_v1_attention_saved(p_tenant uuid, p_domain uuid, p_from timestamptz, p_to timestamptz, p_as_of timestamptz, p_scope jsonb, p_cohort jsonb, p_params jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = analytics, executive, pg_catalog, pg_temp AS $$
DECLARE r record; v_recs jsonb := '[]'::jsonb; v_role text; v_reason text;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'V1 attention saved: the attention queue''s precision');
  FOR r IN
    SELECT i.item_id, i.signal_class, i.outcome, i.created_at,
           (CASE WHEN i.acknowledged_at IS NOT NULL AND i.acknowledged_at <= p_as_of THEN i.acknowledged_at END) AS ack_at,
           (i.state = 'closed' AND i.closed_at <= p_as_of) AS closed,
           (SELECT d.details ->> 'disposition' FROM executive.attention_item_events d WHERE d.item_id = i.item_id AND d.event = 'item.disposition' AND d.occurred_at <= p_as_of
             ORDER BY d.occurred_at DESC, d.event_id DESC LIMIT 1) AS disposition,
           EXISTS (SELECT 1 FROM executive.attention_item_events d WHERE d.item_id = i.item_id AND d.occurred_at <= p_as_of
                     AND (d.event = 'item.elevated' OR (d.event = 'item.reevaluated' AND d.details ->> 'to_outcome' = 'material' AND d.details ->> 'from_outcome' IS DISTINCT FROM 'material'))) AS elevated
      FROM executive.attention_items i
     WHERE i.tenant_id = p_tenant AND i.domain_id = p_domain AND i.created_at >= p_from AND i.created_at < p_to AND i.created_at <= p_as_of
     ORDER BY i.created_at, i.item_id
  LOOP
    v_role := NULL; v_reason := NULL;
    IF r.outcome = 'material' AND NOT r.elevated AND r.ack_at IS NOT NULL AND r.disposition = 'actioned' THEN v_role := 'numerator';
    ELSIF r.outcome = 'material' AND NOT r.elevated AND (r.disposition IN ('not_material', 'duplicate') OR (r.closed AND r.ack_at IS NULL AND coalesce(r.disposition, '') NOT IN ('actioned', 'late'))) THEN v_role := 'denominator';
    ELSE
      v_reason := CASE WHEN r.outcome <> 'material' THEN format('not judged material on arrival (%s)', r.outcome) WHEN r.elevated THEN 'elevated to material later: a recall miss, not a precision case'
                       WHEN r.disposition = 'late' THEN 'disposed late: counted apart' WHEN r.disposition IS NULL THEN 'not disposed by the as-of' ELSE format('disposed %s without the positive''s conditions', r.disposition) END;
    END IF;
    v_recs := v_recs || analytics.mca_rec('attention_item', r.item_id::text, coalesce(v_role, 'excluded'), v_reason,
      jsonb_build_object('signal_class', r.signal_class, 'created_at', r.created_at, 'outcome', r.outcome, 'disposition', r.disposition, 'elevated', r.elevated));
  END LOOP;
  RETURN analytics.mca_out('rate', v_recs, analytics.mca_clock_reasons(p_params, ARRAY['record']),
    jsonb_build_object('clock', 'record', 'basis', 'executive.evaluate_attention_queue precision (B24): true positives ÷ (true positives + false alarms)',
                       'notes', analytics.mca_scope_ignored(p_scope, 'the attention queue is the domain''s')), p_comp_key => 'signal_class', p_at_key => 'created_at');
END $$;

/* ES-40-008 COMMITMENT VISIBILITY (rate; residual R1 of §B36.12 row 9). POPULATION: the commitment items CREATED in the window (by the as-of),
   in scope by their objectives. NUMERATOR: VISIBLE to the item's owner within p_params.within_days (default 2) days of creation — a delivered
   receipt of an attention item on the commitment item to its owner (a non-synthetic channel), or the owner's own acceptance of the item
   (item.accepted by the owner: the owner saw it). Read events of the tracker page are not recorded by the product (no telemetry before §UX) —
   said. */
CREATE OR REPLACE FUNCTION analytics.mc_es40_commitment_visibility(p_tenant uuid, p_domain uuid, p_from timestamptz, p_to timestamptz, p_as_of timestamptz, p_scope jsonb, p_cohort jsonb, p_params jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = analytics, decision, executive, pg_catalog, pg_temp AS $$
DECLARE r record; v_recs jsonb := '[]'::jsonb; v_via text[]; v_days int := coalesce((p_params ->> 'within_days')::int, 2); v_rcpt timestamptz; v_acc timestamptz; v_seen timestamptz;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'ES-40-008 commitment visibility: commitment items and their owners'' receipts');
  FOR r IN
    SELECT ci.item_id, ci.owner_principal_id, ci.created_at, ci.objective_ids, ci.parent_item_id FROM decision.commitment_items ci
     WHERE ci.tenant_id = p_tenant AND ci.domain_id = p_domain AND ci.created_at >= p_from AND ci.created_at < p_to AND ci.created_at <= p_as_of
     ORDER BY ci.created_at, ci.item_id
  LOOP
    v_via := analytics.mca_scope_via(p_scope, ARRAY(SELECT x::text FROM unnest(r.objective_ids) x), '{}', '{}', '{}');
    CONTINUE WHEN cardinality(v_via) = 0;
    SELECT min((d.receipt ->> 'at')::timestamptz) INTO v_rcpt FROM executive.attention_deliveries d JOIN executive.attention_items i ON i.item_id = d.item_id
     WHERE i.tenant_id = p_tenant AND i.domain_id = p_domain AND i.subject_kind = 'commitment_item' AND i.subject_id = r.item_id AND d.recipient_principal_id = r.owner_principal_id
       AND d.state = 'delivered' AND NOT d.synthetic_state AND jsonb_typeof(d.receipt -> 'at') = 'string' AND (d.receipt ->> 'at')::timestamptz <= p_as_of;
    SELECT min(e.occurred_at) INTO v_acc FROM decision.commitment_events e WHERE e.item_id = r.item_id AND e.event = 'item.accepted' AND e.actor_principal_id = r.owner_principal_id AND e.occurred_at <= p_as_of;
    v_seen := least(v_rcpt, v_acc);
    v_recs := v_recs || analytics.mca_rec(CASE WHEN r.parent_item_id IS NULL THEN 'commitment_obligation' ELSE 'commitment_item' END, r.item_id::text,
      CASE WHEN v_seen IS NOT NULL AND v_seen <= r.created_at + make_interval(days => v_days) THEN 'numerator' ELSE 'denominator' END, NULL,
      jsonb_build_object('created_at', r.created_at, 'owner_receipt_at', v_rcpt, 'owner_accepted_at', v_acc, 'within_days', v_days,
                         'visible_after_seconds', CASE WHEN v_seen IS NULL THEN NULL ELSE round(extract(epoch FROM v_seen - r.created_at)::numeric, 3) END, 'scope_via', to_jsonb(v_via)));
  END LOOP;
  RETURN analytics.mca_out('rate', v_recs, analytics.mca_clock_reasons(p_params, ARRAY['record']),
    jsonb_build_object('clock', 'record', 'visibility', 'a delivered (non-synthetic) receipt to the owner, or the owner''s acceptance, within the declared days',
                       'notes', jsonb_build_array('page reads are not recorded by the product before §UX telemetry: visibility rests on receipts and acceptances only')), p_comp_key => '_kind', p_at_key => 'created_at');
END $$;

/* ES-40-008 EXPLANATION USE (rate; residual R1). POPULATION: the decisions COMMITTED in the window (each commitment), in scope by the package
   rule. NUMERATOR: the committed version's explanation was RENDERED (decision.explanation_renderings of an explanation of that package version,
   rendered at or before the commitment and standing then) before the commitment. Page reads are not recorded (no telemetry before §UX) —
   renderings only, said. */
CREATE OR REPLACE FUNCTION analytics.mc_es40_explanation_use(p_tenant uuid, p_domain uuid, p_from timestamptz, p_to timestamptz, p_as_of timestamptz, p_scope jsonb, p_cohort jsonb, p_params jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = analytics, decision, pg_catalog, pg_temp AS $$
DECLARE r record; v_recs jsonb := '[]'::jsonb; v_via text[]; v_rend int; v_xpl int;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'ES-40-008 explanation use: commitments and the renderings of their explanations');
  FOR r IN
    SELECT c.commitment_id, c.package_id, c.version, c.committed_at, v.objectives FROM decision.commitments c
      JOIN decision.package_versions v ON v.package_id = c.package_id AND v.version = c.version
     WHERE c.tenant_id = p_tenant AND c.domain_id = p_domain AND c.committed_at >= p_from AND c.committed_at < p_to AND c.committed_at <= p_as_of
     ORDER BY c.committed_at, c.commitment_id
  LOOP
    v_via := analytics.mca_package_scope(p_scope, r.package_id, r.version, r.objectives);
    CONTINUE WHEN cardinality(v_via) = 0;
    SELECT count(DISTINCT e.explanation_id), count(rd.rendering_id) INTO v_xpl, v_rend
      FROM decision.explanations e LEFT JOIN decision.explanation_renderings rd ON rd.explanation_id = e.explanation_id AND rd.rendered_at <= r.committed_at
           AND (rd.withdrawn_at IS NULL OR rd.withdrawn_at > r.committed_at)
     WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain AND e.subject_kind = 'package_version' AND e.subject_id = r.package_id AND e.subject_version = r.version
       AND e.generated_at <= r.committed_at;
    v_recs := v_recs || analytics.mca_rec('decision_commitment', r.commitment_id::text, CASE WHEN v_rend > 0 THEN 'numerator' ELSE 'denominator' END, NULL,
      jsonb_build_object('package_id', r.package_id, 'version', r.version, 'committed_at', r.committed_at, 'explanations', v_xpl, 'renderings_before_commitment', v_rend, 'scope_via', to_jsonb(v_via)));
  END LOOP;
  RETURN analytics.mca_out('rate', v_recs, analytics.mca_clock_reasons(p_params, ARRAY['record']),
    jsonb_build_object('clock', 'record', 'use', 'a standing rendering of the committed version''s explanation at or before the commitment',
                       'notes', jsonb_build_array('page reads are not recorded by the product before §UX telemetry: use rests on renderings only')), p_comp_key => NULL, p_at_key => 'committed_at');
END $$;

-- §MCA.5 GRANTS AND REGISTRATION ────────────────────────────────────────────────────────────────────────────────────────────────────────
/* The computations run only inside the definer compute port (analytics.amc_compute, owned by the migration role): no runtime grant. */
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['met001_loop_closure', 'met002_package_completeness', 'met003_replay_success', 'met004_authority_integrity', 'met005_explanation_closure',
                           'met019_signal_precision', 'met020_signal_lead_time', 'met021_warning_delivery_latency', 'met022_warning_ack_latency', 'met023_warning_action_closure',
                           'met024_forecast_calibration', 'met025_forecast_sharpness', 'met026_scenario_distinctness', 'met027_simulation_reproducibility', 'met028_twin_sync_health',
                           'met029_alignment_coverage', 'met030_commitment_closure', 'v1_decision_cycle', 'v1_understanding_latency', 'v1_warning_precision', 'v1_attention_saved',
                           'es40_commitment_visibility', 'es40_explanation_use'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION analytics.mc_%s(uuid,uuid,timestamptz,timestamptz,timestamptz,jsonb,jsonb,jsonb) FROM PUBLIC', f);
  END LOOP;
END $$;

SELECT analytics.register_computation('met001_loop_closure', 'analytics.mc_met001_loop_closure', 'rate', ARRAY[]::text[],
  ARRAY['decision.commitments', 'decision.packages_current', 'decision.package_versions', 'decision.options', 'graph.strategy_current', 'objects.canonical_objects', 'simulation.runs_current',
        'prediction.forecasts_current', 'decision.package_scenario_sets', 'prediction.scenario_sets', 'decision.commitment_items', 'decision.outcomes', 'decision.outcome_assessments', 'decision.lessons', 'decision.package_events'],
  'the package rule: the committed version''s objectives, or the ids its options cite, intersect the scope''s objective_ids / entity_ids; a NULL scope = the domain',
  'MET-001 strategic loop closure: committed packages with all six links (objective, evidence, foresight, commitment, outcome recorded and assessed, learning), each judged at the as-of', '0113 §MCA');
SELECT analytics.register_computation('met002_package_completeness', 'analytics.mc_met002_package_completeness', 'rate', ARRAY['decision_class'],
  ARRAY['decision.gate_actions', 'decision.package_versions', 'decision.packages_current', 'decision.options', 'decision.dissent', 'decision.explanations', 'objects.canonical_objects', 'simulation.runs_current'],
  'the package rule (objectives or cited ids against the scope); a NULL scope = the domain',
  'MET-002 package completeness: versions at the decision gate with evidence, alternatives, risks, dissent, explanation and authority present at the gate instant', '0113 §MCA');
SELECT analytics.register_computation('met003_replay_success', 'analytics.mc_met003_replay_success', 'rate', ARRAY[]::text[],
  ARRAY['decision.commitments', 'decision.package_versions', 'decision.replays', 'decision.options'],
  'the package rule (objectives or cited ids against the scope); a NULL scope = the domain',
  'MET-003 decision replay success: committed packages whose latest replay has no unavailable input; never-replayed packages excluded and counted', '0113 §MCA');
SELECT analytics.register_computation('met004_authority_integrity', 'analytics.mc_met004_authority_integrity', 'rate', ARRAY['consequence_class'],
  ARRAY['decision.commitments', 'decision.approvals', 'executive.signatures', 'policy.policy_decisions', 'audit.audit_events', 'identity.principals'],
  'this metric ignores the scope (domain-wide by nature: authority integrity is a property of every consequential effect)',
  'MET-004 human authority integrity: commitments and signed acts bound to an eligible human, a digest and an audit event', '0113 §MCA');
SELECT analytics.register_computation('met005_explanation_closure', 'analytics.mc_met005_explanation_closure', 'rate', ARRAY[]::text[],
  ARRAY['decision.recommendations', 'decision.package_versions', 'decision.options', 'decision.explanations'],
  'the package rule of the recommendation''s package version; a NULL scope = the domain',
  'MET-005 recommendation explanation closure: decision-active recommendations resolving to evidence, assumptions, methods, alternatives and uncertainty', '0113 §MCA');
SELECT analytics.register_computation('met019_signal_precision', 'analytics.mc_met019_signal_precision', 'rate', ARRAY['detector'],
  ARRAY['prediction.signals_current', 'prediction.signal_events', 'prediction.warnings_current', 'identity.principals'],
  'the signal''s subject entity in entity_ids, or the warning raised from it by the warning rule; a NULL scope = the domain',
  'MET-019 weak signal precision: human-dispositioned nominations confirmed (confirm or escalate) — monitored, not optimized alone', '0113 §MCA');
SELECT analytics.register_computation('met020_signal_lead_time', 'analytics.mc_met020_signal_lead_time', 'duration', ARRAY[]::text[],
  ARRAY['prediction.warnings_current', 'prediction.signals_current'],
  'the warning rule: affected objectives / assets / geographies, or the forecast''s series, against the scope; a NULL scope = the domain',
  'MET-020 weak signal lead time: the signal''s record → the warning raised from it', '0113 §MCA');
SELECT analytics.register_computation('met021_warning_delivery_latency', 'analytics.mc_met021_warning_delivery_latency', 'duration', ARRAY['severity', 'channel'],
  ARRAY['executive.attention_deliveries', 'executive.attention_items', 'prediction.warnings_current', 'prediction.forecasts_current'],
  'the warning rule: affected objectives / assets / geographies, or the forecast''s series, against the scope; a NULL scope = the domain',
  'MET-021 warning delivery latency: the warning''s raise → the delivery receipt; synthetic channels excluded unless admitted', '0113 §MCA');
SELECT analytics.register_computation('met022_warning_ack_latency', 'analytics.mc_met022_warning_ack_latency', 'duration', ARRAY['severity', 'role'],
  ARRAY['prediction.warnings_current', 'executive.attention_deliveries', 'executive.attention_items', 'identity.role_bindings', 'identity.principals', 'prediction.forecasts_current'],
  'the warning rule: affected objectives / assets / geographies, or the forecast''s series, against the scope; a NULL scope = the domain',
  'MET-022 warning acknowledgement latency: the receipt → a qualified role''s acknowledgement (the raised_at proxy only when declared); world-clock warnings excluded', '0113 §MCA');
SELECT analytics.register_computation('met023_warning_action_closure', 'analytics.mc_met023_warning_action_closure', 'rate', ARRAY['severity'],
  ARRAY['prediction.warnings_current', 'executive.attention_items', 'executive.attention_item_acts', 'prediction.exposure_responses', 'prediction.warning_feedback'],
  'the warning rule: affected objectives / assets / geographies, or the forecast''s series, against the scope; a NULL scope = the domain',
  'MET-023 warning action closure: material warnings with an owned disposition, an action and an outcome', '0113 §MCA');
SELECT analytics.register_computation('met024_forecast_calibration', 'analytics.mc_met024_forecast_calibration', 'rate', ARRAY['horizon', 'method'],
  ARRAY['prediction.outcome_ledger', 'prediction.forecasts_current', 'prediction.backtests'],
  'the forecast rule: the outcome''s series key in series_keys, or its forecast''s subject entity in entity_ids; a NULL scope = the domain',
  'MET-024 forecast calibration: the 10–90 coverage of scored live outcomes (covered = q10 ≤ observed ≤ q90); backtests listed as context, never counted', '0113 §MCA');
SELECT analytics.register_computation('met025_forecast_sharpness', 'analytics.mc_met025_forecast_sharpness', 'score', ARRAY['horizon'],
  ARRAY['prediction.outcome_ledger', 'prediction.forecasts_current'],
  'the forecast rule: the outcome''s series key in series_keys, or its forecast''s subject entity in entity_ids; a NULL scope = the domain',
  'MET-025 forecast sharpness: mean relative interval width (q90 − q10)/|q50|, indeterminate unless the same population is calibrated', '0113 §MCA');
SELECT analytics.register_computation('met026_scenario_distinctness', 'analytics.mc_met026_scenario_distinctness', 'rate', ARRAY[]::text[],
  ARRAY['prediction.scenario_sets', 'prediction.scenario_set_members', 'prediction.scenario_elements', 'decision.package_versions'],
  'the set''s package by the package rule (a set bound to no package is outside any named scope); a NULL scope = the domain',
  'MET-026 scenario distinctness: approved sets whose branches'' driver/impact structures are pairwise materially different (Jaccard ≤ max_similarity)', '0113 §MCA');
SELECT analytics.register_computation('met027_simulation_reproducibility', 'analytics.mc_met027_simulation_reproducibility', 'rate', ARRAY[]::text[],
  ARRAY['simulation.runs_current', 'simulation.reproductions', 'twin.twins_current'],
  'the twin rule: the run''s twin boundary entities intersect entity_ids; a NULL scope = the domain',
  'MET-027 simulation reproducibility: accepted runs reproduced by digest equality (tolerance 0); never-reproduced runs excluded and counted', '0113 §MCA');
SELECT analytics.register_computation('met028_twin_sync_health', 'analytics.mc_met028_twin_sync_health', 'rate', ARRAY[]::text[],
  ARRAY['twin.twins_current', 'twin.twin_versions', 'twin.freshness_policies', 'twin.twin_contracts', 'twin.state_elements', 'twin.validations'],
  'the twin rule: the twin''s boundary entities intersect entity_ids; a NULL scope = the domain',
  'MET-028 twin sync health: admitted twins within their freshness, coverage and validation contracts at the as-of', '0113 §MCA');
SELECT analytics.register_computation('met029_alignment_coverage', 'analytics.mc_met029_alignment_coverage', 'rate', ARRAY[]::text[],
  ARRAY['executive.initiatives', 'executive.initiative_objectives', 'executive.plan_measures', 'decision.commitment_items', 'graph.strategy_current', 'graph.alignments', 'identity.principals'],
  'the item''s objectives against objective_ids; a NULL scope = the domain',
  'MET-029 strategic alignment coverage: approved initiatives and live commitment obligations linked to an objective, a capability, an owner and a measure', '0113 §MCA');
SELECT analytics.register_computation('met030_commitment_closure', 'analytics.mc_met030_commitment_closure', 'rate', ARRAY['portfolio'],
  ARRAY['decision.commitment_items', 'decision.commitments', 'decision.packages_current', 'decision.commitment_events', 'decision.outcomes'],
  'the item''s objectives against objective_ids; a NULL scope = the domain',
  'MET-030 commitment outcome closure: items due in the window closed with evidence, an exception, an outcome or supersession — portfolio level only', '0113 §MCA');
SELECT analytics.register_computation('v1_decision_cycle', 'analytics.mc_v1_decision_cycle', 'duration', ARRAY[]::text[],
  ARRAY['decision.commitments', 'decision.package_versions', 'decision.options'],
  'the package rule (objectives or cited ids against the scope); a NULL scope = the domain',
  'V01-T-046 decision cycle time: executive.metrics'' decision latency per commitment (proposal → commitment)', '0113 §MCA');
SELECT analytics.register_computation('v1_understanding_latency', 'analytics.mc_v1_understanding_latency', 'duration', ARRAY[]::text[],
  ARRAY['executive.attention_item_events', 'executive.attention_items', 'executive.attention_item_acts'],
  'this metric ignores the scope (domain-wide by nature: the attention queue is the domain''s)',
  'V01-T-046 understanding latency: executive.metrics'' time to understanding (first routing → first human act)', '0113 §MCA');
SELECT analytics.register_computation('v1_warning_precision', 'analytics.mc_v1_warning_precision', 'rate', ARRAY[]::text[],
  ARRAY['prediction.warnings_current', 'prediction.warning_feedback', 'prediction.forecasts_current'],
  'the warning rule: affected objectives / assets / geographies, or the forecast''s series, against the scope; a NULL scope = the domain',
  'V01-T-046 warning precision: evaluate_warnings'' useful ÷ (useful + false) feedback', '0113 §MCA');
SELECT analytics.register_computation('v1_attention_saved', 'analytics.mc_v1_attention_saved', 'rate', ARRAY[]::text[],
  ARRAY['executive.attention_items', 'executive.attention_item_events'],
  'this metric ignores the scope (domain-wide by nature: the attention queue is the domain''s)',
  'V01-T-046 attention saved / noise reduction: evaluate_attention_queue''s precision', '0113 §MCA');
SELECT analytics.register_computation('es40_commitment_visibility', 'analytics.mc_es40_commitment_visibility', 'rate', ARRAY[]::text[],
  ARRAY['decision.commitment_items', 'decision.commitment_events', 'executive.attention_deliveries', 'executive.attention_items'],
  'the item''s objectives against objective_ids; a NULL scope = the domain',
  'ES-40-008 commitment visibility: items received or accepted by their owner within the declared days of creation', '0113 §MCA');
SELECT analytics.register_computation('es40_explanation_use', 'analytics.mc_es40_explanation_use', 'rate', ARRAY[]::text[],
  ARRAY['decision.commitments', 'decision.package_versions', 'decision.explanations', 'decision.explanation_renderings', 'decision.options'],
  'the package rule (objectives or cited ids against the scope); a NULL scope = the domain',
  'ES-40-008 explanation use: commitments whose version''s explanation was rendered before the commitment', '0113 §MCA');

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §MCB — computations B: provenance, knowledge, observation, search, memory, agents, operations (MET-006..018, MET-031..040)
-- (folded at integration from the part-local file 0113_b92_x_mcb.sql, unchanged but for the integrator's marked lines; apply order §0, §MD, §MCA, §MCB, §CO, §UX, §OR, §I)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0113 §MCB — CP-6 B92 COMPUTATIONS B: provenance, knowledge, observation, search, memory, agents and operations (App M MET-006..018 and
-- MET-031..040). Part-local; applies alone on 0001–0112 + the prelude (0113 §0). Re-declares nothing of another part.
--
-- WHAT THIS PART BUILDS
--   §MCB.0  internal helpers (a reference's resolution to an exact source version, a record's lineage walk, the scope's sources, the cap);
--   §MCB.1  the TEMPORAL REQUIREMENTS register (MET-009 needs a per-object-type declaration of the required time fields: a named product
--           analytics owner declares it — human-gated, versioned, append-only) and its port analytics.declare_temporal_requirement;
--   §MCB.2  the SEARCH REVIEWS register (MET-014 needs a human review of a search's results: a named analyst or owner — never the searcher —
--           marks a search relevant or not and classes its query; ROLE-LEVEL only) and its port analytics.review_search;
--   §MCB.3  fifteen computations of the 0113 §0.7 contract, each registered (analytics.register_computation) with its kind, dimensions,
--           reads and scope rule. The eight App M rows with no honest source in the product (MET-015, -016, -032, -034, -035, -038, -039,
--           -040) have NO computation: their contracts (src/analytics/computations-b/definitions-b.ts) carry computationKey null and the
--           unsupported reason naming the carrier stage — served `unsupported`, visible, never a fake computation.
--
-- THE READINGS (App M gives meaning, scope, threshold, cadence and owner — never numerator, denominator, population or window): each
-- computation's header states this product's reading; each contract repeats it for the approving owner (PR-70-003). Every computation:
--   * reads ONLY rows recorded at or before p_as_of (replay) and inside [p_from, p_to) on the RECORD clock — a world clock is refused as an
--     explained reason where the source has no world time (never silently re-read on another clock);
--   * returns RECORDS (the drill-down) naming records — never a person: no principal id, no person dimension (D4);
--   * reports in its `quality` the newest record of its population (newest_record_at), how many records it excluded (excluded_count) and
--     the population's composition (counts by a meaningful category — analytics.mcb_finish); never `distinct_actors` (no §MCB cohort is
--     a role cohort);
--   * where the product cannot tell an input, says so as a REASON (→ indeterminate, never 0);
--   * where a population exceeds the traceable bound (p_params.max_records, default 50 000 records), returns NO value and says so (a result
--     is either traceable record by record or not computed — never a silent sample);
--   * where it reads a CURRENT-state table (a row updated in place), says so in quality.notes: a replay at the original as-of then reports
--     `mismatch` if that state moved since — honest, never hidden.
-- SOFTWARE CAPABILITY vs SYNTHETIC DEMONSTRATION vs ACCEPTANCE: these computations are software capability. The harness proves them on
-- SYNTHETIC planted records; nothing here is a real-provider or signed acceptance (R2 / B107 / H3 carry those).
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- §MCB.0 INTERNAL HELPERS (no runtime grant: called inside the definer computations and ports only) ───────────────────────────────────────

/* The traceable bound of a computation's population (records). */
CREATE OR REPLACE FUNCTION analytics.mcb_cap(p_params jsonb) RETURNS int
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT least(200000, greatest(1, coalesce(CASE WHEN coalesce(p_params ->> 'max_records', '') ~ '^[0-9]{1,6}$' THEN (p_params ->> 'max_records')::int END, 50000)))
$$;
REVOKE ALL ON FUNCTION analytics.mcb_cap(jsonb) FROM PUBLIC;

/* The answer of a computation that cannot run on the definition's clock: no records, the reason. */
CREATE OR REPLACE FUNCTION analytics.mcb_clock_refused(p_kind text, p_metric text, p_why text, p_params jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object('kind', p_kind, 'records', '[]'::jsonb,
    'reasons', jsonb_build_array(format('%s is measured on the record clock only: %s; the definition names the %s clock — not computed on another clock', p_metric, p_why, coalesce(p_params ->> 'clock', 'record'))),
    'quality', jsonb_build_object('clock', coalesce(p_params ->> 'clock', 'record'), 'newest_record_at', NULL, 'excluded_count', 0, 'composition', jsonb_build_object('by', NULL, 'counts', '{}'::jsonb)))
$$;
REVOKE ALL ON FUNCTION analytics.mcb_clock_refused(text, text, text, jsonb) FROM PUBLIC;

/* The answer of a computation whose population exceeds the traceable bound: no records, the reason (never a silent sample). */
CREATE OR REPLACE FUNCTION analytics.mcb_over_cap(p_kind text, p_metric text, p_count bigint, p_cap int, p_clock text) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object('kind', p_kind, 'records', '[]'::jsonb,
    'reasons', jsonb_build_array(format('%s: the population holds %s records, above the traceable bound %s (params.max_records): a result is traceable record by record or not computed — narrow the cohort or the window', p_metric, p_count, p_cap)),
    'quality', jsonb_build_object('clock', p_clock, 'population_upper_bound', p_count, 'max_records', p_cap, 'newest_record_at', NULL, 'excluded_count', 0,
                                  'composition', jsonb_build_object('by', NULL, 'counts', '{}'::jsonb)))
$$;
REVOKE ALL ON FUNCTION analytics.mcb_over_cap(text, text, bigint, int, text) FROM PUBLIC;

/* THE QUALITY EVERY COMPUTATION REPORTS (the integrator's contract, beside its own notes): the newest record of its population, how many
   records it excluded, and the population's COMPOSITION — counts by a meaningful category of the metric (an object type, a source, a
   class …; `role` for a metric whose records carry no finer category). Applied to every answer, including the explained refusals. */
CREATE OR REPLACE FUNCTION analytics.mcb_finish(p_out jsonb, p_category text, p_newest timestamptz) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT p_out || jsonb_build_object('quality', coalesce(p_out -> 'quality', '{}'::jsonb) || jsonb_build_object(
    'newest_record_at', p_newest,
    'excluded_count', (SELECT count(*) FROM jsonb_array_elements(coalesce(p_out -> 'records', '[]'::jsonb)) x WHERE x ->> 'role' = 'excluded'),
    'composition', jsonb_build_object('by', p_category, 'counts', coalesce((SELECT jsonb_object_agg(z.k, z.n) FROM (
        SELECT coalesce(x -> 'detail' ->> p_category, x ->> p_category, '(none)') AS k, count(*) AS n
          FROM jsonb_array_elements(coalesce(p_out -> 'records', '[]'::jsonb)) x GROUP BY 1) z), '{}'::jsonb))))
$$;
REVOKE ALL ON FUNCTION analytics.mcb_finish(jsonb, text, timestamptz) FROM PUBLIC;

/* The SOURCES a scope reaches (D8's rule for source-based metrics): a source concerns the scope when it feeds a series named in
   series_keys, or a series whose subject entity is in entity_ids (prediction.series_registry.source_key → the source's contracts). NULL
   for a NULL scope (the whole domain). An empty array when the scope reaches no source (the population is then empty — said by the port). */
CREATE OR REPLACE FUNCTION analytics.mcb_scope_sources(p_tenant uuid, p_domain uuid, p_scope jsonb) RETURNS uuid[]
LANGUAGE sql STABLE SET search_path = analytics, observation, prediction, pg_catalog, pg_temp AS $$
  SELECT CASE WHEN p_scope IS NULL THEN NULL ELSE coalesce((
    SELECT array_agg(DISTINCT c.source_id ORDER BY c.source_id)
      FROM prediction.series_registry s JOIN observation.source_contracts_current c ON c.source_key = s.source_key AND c.tenant_id = s.tenant_id AND c.domain_id = s.domain_id
     WHERE s.tenant_id = p_tenant AND s.domain_id = p_domain
       AND (s.series_key IN (SELECT jsonb_array_elements_text(coalesce(p_scope -> 'series_keys', '[]'::jsonb)))
            OR s.subject_entity_id::text IN (SELECT jsonb_array_elements_text(coalesce(p_scope -> 'entity_ids', '[]'::jsonb))))), '{}'::uuid[]) END
$$;
REVOKE ALL ON FUNCTION analytics.mcb_scope_sources(uuid, uuid, jsonb) FROM PUBLIC;

/* THE RESOLUTION OF ONE REFERENCE to an exact, accessible source version (MET-006's and MET-007's judgement), at p_as_of:
     `TYP:<uuid>@<n>`  an exact canonical version (pinned explicitly);
     `TYP:<uuid>`, `evidence:<uuid>` (EVD), `forecast:<uuid>` (FCT), `claim:<uuid>` / `strategy:<uuid>` (a canonical record of any
                       type), a bare `<uuid>` — resolved to the version CURRENT AT p_at (the citing record's own record time: pinned as-of);
     `blob:<uuid>`     the stored bytes (a vault manifest);
     anything else     a REGISTER reference (a gateway call, a review case, a graph entity or edge row, a candidate, a flip …) — not an
                       evidence citation of a source version; classed `register`, judged nothing. (Read off the product's records: an
                       `entity:` / `edge:` id names a graph register row, not a canonical record; `claim:`, `strategy:`, `forecast:` and
                       `evidence:` ids name canonical records.)
   p_digest / p_byte_end (a claim's lineage): the EVD version whose content digest is the lineage's digest, and the segment inside its bytes.
   Resolved = the version exists (recorded ≤ p_as_of) in this tenant (a DOMAIN record of THIS domain, or a tenant/platform record), is of the
   named type, its object is not withdrawn or deleted as of p_as_of, and — evidence — its bytes are stored and not tombstoned as of p_as_of
   (an archived manifest still resolves: its tier is named). The reader's own clearance is NOT judged here (a definer judges the record;
   the drill-down reads under the reader's RLS). */
CREATE OR REPLACE FUNCTION analytics.mcb_resolve(p_tenant uuid, p_domain uuid, p_ref text, p_at timestamptz, p_as_of timestamptz, p_digest text DEFAULT NULL, p_byte_end int DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = analytics, objects, observation, pg_catalog, pg_temp AS $$
DECLARE m text[]; v_prefix text; v_type text; v_id uuid; v_ver bigint; o objects.canonical_objects%ROWTYPE; v_latest text; v_pin text; v_man uuid; v_out jsonb;
        bm observation.blob_manifests%ROWTYPE; v_tomb timestamptz; v_tier text;
BEGIN
  m := regexp_match(btrim(coalesce(p_ref, '')), '^([A-Za-z][A-Za-z-]*):([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})(@([0-9]{1,9}))?$');
  IF m IS NULL THEN
    IF btrim(coalesce(p_ref, '')) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN m := ARRAY['', btrim(p_ref), NULL, NULL];
    ELSE RETURN jsonb_build_object('class', 'register', 'prefix', CASE WHEN position(':' IN coalesce(p_ref, '')) > 0 THEN split_part(p_ref, ':', 1) ELSE 'unparsed' END);
    END IF;
  END IF;
  v_prefix := m[1]; v_id := m[2]::uuid; v_ver := CASE WHEN m[4] IS NOT NULL THEN m[4]::bigint END;
  IF v_prefix = 'blob' THEN
    SELECT * INTO bm FROM observation.blob_manifests b WHERE b.manifest_id = v_id AND b.tenant_id = p_tenant AND b.domain_id = p_domain AND b.created_at <= p_as_of;
    IF NOT FOUND THEN RETURN jsonb_build_object('class', 'blob', 'resolved', false, 'reason', 'the cited bytes have no stored manifest in this domain as of the as-of'); END IF;
    SELECT t.tombstoned_at INTO v_tomb FROM observation.blob_tombstones t WHERE t.manifest_id = v_id AND t.tombstoned_at <= p_as_of;
    IF v_tomb IS NOT NULL THEN RETURN jsonb_build_object('class', 'blob', 'resolved', false, 'reason', format('the cited bytes were tombstoned at %s', v_tomb)); END IF;
    SELECT coalesce((SELECT r.tier FROM observation.blob_tier_records r WHERE r.manifest_id = v_id AND r.moved_at <= p_as_of ORDER BY r.moved_at DESC, r.record_id DESC LIMIT 1), 'hot') INTO v_tier;
    RETURN jsonb_build_object('class', 'blob', 'resolved', true, 'tier', v_tier);
  END IF;
  v_type := CASE WHEN v_prefix ~ '^[A-Z]{3}$' THEN v_prefix WHEN v_prefix = 'evidence' THEN 'EVD' WHEN v_prefix = 'forecast' THEN 'FCT' WHEN v_prefix IN ('claim', 'strategy', '') THEN NULL ELSE '?' END;
  IF v_type = '?' THEN RETURN jsonb_build_object('class', 'register', 'prefix', v_prefix); END IF;
  IF p_digest IS NOT NULL THEN
    SELECT * INTO o FROM objects.canonical_objects x WHERE x.object_id = v_id AND x.recorded_at <= p_as_of AND x.payload ->> 'content_digest' = p_digest ORDER BY x.object_version DESC LIMIT 1;
    v_pin := 'lineage_digest';
  ELSIF v_ver IS NOT NULL THEN
    SELECT * INTO o FROM objects.canonical_objects x WHERE x.object_id = v_id AND x.object_version = v_ver AND x.recorded_at <= p_as_of;
    v_pin := 'explicit';
  ELSE
    SELECT * INTO o FROM objects.canonical_objects x WHERE x.object_id = v_id AND x.recorded_at <= least(coalesce(p_at, p_as_of), p_as_of) ORDER BY x.object_version DESC LIMIT 1;
    v_pin := 'as_of';
  END IF;
  IF o.object_id IS NULL THEN
    RETURN jsonb_build_object('class', 'canonical', 'resolved', false, 'pin', v_pin, 'reason', CASE v_pin
      WHEN 'lineage_digest' THEN 'no version of the cited evidence carries the digest the lineage names'
      WHEN 'explicit' THEN format('version %s of the cited record does not exist (as of the as-of)', v_ver)
      ELSE 'no version of the cited record existed when it was cited' END);
  END IF;
  v_out := jsonb_build_object('class', 'canonical', 'pin', v_pin, 'type', o.object_type, 'id', o.object_id, 'version', o.object_version);
  IF o.tenant_id IS NOT NULL AND o.tenant_id <> p_tenant THEN RETURN v_out || jsonb_build_object('resolved', false, 'reason', 'the cited record belongs to another tenant'); END IF;
  IF o.scope = 'DOMAIN' AND o.domain_id <> p_domain THEN RETURN v_out || jsonb_build_object('resolved', false, 'reason', 'the cited record belongs to another domain (not accessible here)'); END IF;
  IF v_type IS NOT NULL AND o.object_type <> v_type THEN RETURN v_out || jsonb_build_object('resolved', false, 'reason', format('the citation names a %s; the record is a %s', v_type, o.object_type)); END IF;
  SELECT x.lifecycle_state INTO v_latest FROM objects.canonical_objects x WHERE x.object_id = o.object_id AND x.recorded_at <= p_as_of ORDER BY x.object_version DESC LIMIT 1;
  IF v_latest IN ('withdrawn', 'deleted') THEN RETURN v_out || jsonb_build_object('resolved', false, 'reason', format('the cited record is %s as of the as-of (no longer an accessible source)', v_latest)); END IF;
  IF p_byte_end IS NOT NULL AND (o.payload ->> 'byte_length') ~ '^[0-9]+$' AND p_byte_end > (o.payload ->> 'byte_length')::bigint THEN
    RETURN v_out || jsonb_build_object('resolved', false, 'reason', format('the cited segment ends at byte %s, beyond the evidence''s %s bytes', p_byte_end, o.payload ->> 'byte_length'));
  END IF;
  IF o.object_type = 'EVD' THEN
    v_man := CASE WHEN coalesce(o.payload ->> 'manifest_id', '') ~* '^[0-9a-f-]{36}$' THEN (o.payload ->> 'manifest_id')::uuid END;
    IF v_man IS NULL OR NOT EXISTS (SELECT 1 FROM observation.blob_manifests b WHERE b.manifest_id = v_man AND b.created_at <= p_as_of) THEN
      RETURN v_out || jsonb_build_object('resolved', false, 'reason', 'the evidence names no stored bytes (no manifest)');
    END IF;
    SELECT t.tombstoned_at INTO v_tomb FROM observation.blob_tombstones t WHERE t.manifest_id = v_man AND t.tombstoned_at <= p_as_of;
    IF v_tomb IS NOT NULL THEN RETURN v_out || jsonb_build_object('resolved', false, 'reason', format('the evidence''s bytes were tombstoned at %s', v_tomb)); END IF;
    SELECT coalesce((SELECT r.tier FROM observation.blob_tier_records r WHERE r.manifest_id = v_man AND r.moved_at <= p_as_of ORDER BY r.moved_at DESC, r.record_id DESC LIMIT 1), 'hot') INTO v_tier;
    v_out := v_out || jsonb_build_object('tier', v_tier);
  END IF;
  RETURN v_out || jsonb_build_object('resolved', true);
END $$;
REVOKE ALL ON FUNCTION analytics.mcb_resolve(uuid, uuid, text, timestamptz, timestamptz, text, int) FROM PUBLIC;

/* THE LINEAGE WALK of one record (MET-007): from the record, upstream through every evidence reference, source object and claim lineage,
   to its ORIGINS — stored bytes (an EVD whose bytes resolve, a blob), a registered source (SRC), or a named human's declaration (a record
   whose only provenance is its human_refs: the declaration is its own origin, stated). COMPLETE when no path breaks: every canonical
   reference resolves (mcb_resolve) and every record reaches an origin. Bounded: 200 records, depth 8 — beyond the bound it is NOT complete
   (said). Register references are context, not walked. */
CREATE OR REPLACE FUNCTION analytics.mcb_lineage(p_tenant uuid, p_domain uuid, p_root text, p_as_of timestamptz) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = analytics, objects, intelligence, pg_catalog, pg_temp AS $$
DECLARE v_queue text[] := ARRAY[p_root]; v_depths int[] := ARRAY[0]; v_seen text[] := '{}'; v_i int := 1; v_ref text; v_depth int; r jsonb; o objects.canonical_objects%ROWTYPE;
        v_up text[]; v_u text; v_broken jsonb := '[]'::jsonb; v_origins jsonb := '[]'::jsonb; v_nodes int := 0; v_maxdepth int := 0; v_key text; v_walkable int;
BEGIN
  WHILE v_i <= coalesce(array_length(v_queue, 1), 0) LOOP
    v_ref := v_queue[v_i]; v_depth := v_depths[v_i]; v_i := v_i + 1;
    r := analytics.mcb_resolve(p_tenant, p_domain, v_ref, p_as_of, p_as_of);
    IF r ->> 'class' = 'register' THEN CONTINUE; END IF;
    v_key := coalesce((r ->> 'type') || ':' || (r ->> 'id') || '@' || (r ->> 'version'), v_ref);
    IF v_key = ANY (v_seen) THEN CONTINUE; END IF;
    v_seen := v_seen || v_key; v_nodes := v_nodes + 1; v_maxdepth := greatest(v_maxdepth, v_depth);
    IF v_nodes > 200 OR v_depth > 8 THEN
      v_broken := v_broken || jsonb_build_object('ref', v_ref, 'reason', 'beyond the walk bound (200 records, depth 8): the lineage is not shown complete');
      EXIT;
    END IF;
    IF NOT (r ->> 'resolved')::boolean THEN v_broken := v_broken || jsonb_build_object('ref', v_ref, 'reason', r ->> 'reason'); CONTINUE; END IF;
    IF r ->> 'class' = 'blob' THEN v_origins := v_origins || jsonb_build_object('origin', 'bytes', 'ref', v_ref); CONTINUE; END IF;
    IF r ->> 'type' IN ('EVD', 'SRC') THEN v_origins := v_origins || jsonb_build_object('origin', CASE r ->> 'type' WHEN 'EVD' THEN 'evidence' ELSE 'source' END, 'ref', v_key); CONTINUE; END IF;
    SELECT * INTO o FROM objects.canonical_objects x WHERE x.object_id = (r ->> 'id')::uuid AND x.object_version = (r ->> 'version')::bigint;
    v_up := ARRAY(SELECT e FROM jsonb_array_elements_text(o.evidence_refs) e
                  UNION SELECT s FROM jsonb_array_elements_text(o.source_object_ids) s
                  UNION SELECT 'EVD:' || l.evidence_object_id FROM intelligence.claim_lineage l WHERE l.claim_object_id = o.object_id AND l.claim_version = o.object_version AND l.recorded_at <= p_as_of);
    v_walkable := 0;
    FOREACH v_u IN ARRAY v_up LOOP
      -- an unversioned upstream reference resolves as of the citing record's OWN record time: judged and pinned here
      r := analytics.mcb_resolve(p_tenant, p_domain, v_u, o.recorded_at, p_as_of);
      CONTINUE WHEN r ->> 'class' = 'register';
      v_walkable := v_walkable + 1;
      IF NOT (r ->> 'resolved')::boolean THEN
        v_broken := v_broken || jsonb_build_object('ref', v_u, 'cited_by', v_key, 'reason', r ->> 'reason');
      ELSE
        v_queue := v_queue || CASE WHEN r ->> 'class' = 'canonical' THEN (r ->> 'type') || ':' || (r ->> 'id') || '@' || (r ->> 'version') ELSE v_u END;
        v_depths := v_depths || (v_depth + 1);
      END IF;
    END LOOP;
    IF v_walkable = 0 THEN
      IF jsonb_array_length(o.human_refs) > 0 THEN v_origins := v_origins || jsonb_build_object('origin', 'human_declaration', 'ref', v_key);
      ELSE v_broken := v_broken || jsonb_build_object('ref', v_key, 'reason', 'no upstream reference reaches a source, stored bytes or a named human'); END IF;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('complete', jsonb_array_length(v_broken) = 0 AND jsonb_array_length(v_origins) > 0, 'records_walked', v_nodes, 'depth', v_maxdepth,
                            'origins', (SELECT coalesce(jsonb_agg(DISTINCT x ->> 'origin'), '[]'::jsonb) FROM jsonb_array_elements(v_origins) x), 'broken', v_broken);
END $$;
REVOKE ALL ON FUNCTION analytics.mcb_lineage(uuid, uuid, text, timestamptz) FROM PUBLIC;

/* The query classes a search review may assign (MET-014's dimension; a class of the QUERY, never of the searcher). */
CREATE OR REPLACE FUNCTION analytics.mcb_query_classes() RETURNS text[]
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$ SELECT ARRAY['entity', 'event', 'evidence', 'decision', 'strategy', 'forecast', 'warning', 'memory', 'other'] $$;
GRANT EXECUTE ON FUNCTION analytics.mcb_query_classes() TO eye_app, eye_commit;

/* The time fields a temporal requirement may name (recorded_at is NOT NULL on every canonical record by construction — never listed). */
CREATE OR REPLACE FUNCTION analytics.mcb_time_fields() RETURNS text[]
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$ SELECT ARRAY['event_time', 'observation_time', 'valid_from', 'valid_to'] $$;
GRANT EXECUTE ON FUNCTION analytics.mcb_time_fields() TO eye_app, eye_commit;

-- §MCB.1 THE TEMPORAL REQUIREMENTS (MET-009) ────────────────────────────────────────────────────────────────────────────────────────────────
/* Which time fields a record of an object type MUST carry (App M MET-009 "objects with required event, observation, validity, and record
   times"): declared per object type by a NAMED PRODUCT ANALYTICS OWNER (human-gated; the declaration IS the owner's approval — the owner is
   the approving authority of product metric inputs, D3), versioned, append-only (a new version supersedes; a retirement is a version
   with state `retired`). The CURRENT requirement of a type at an instant = its latest version declared at or before it. */
CREATE TABLE analytics.temporal_requirements (
  requirement_id  uuid PRIMARY KEY,
  scope           text NOT NULL,
  tenant_id       uuid NOT NULL,
  domain_id       uuid NOT NULL,
  object_type     text NOT NULL CHECK (object_type ~ '^[A-Z]{3}$'),
  version         int  NOT NULL CHECK (version >= 1),
  required_fields text[] NOT NULL,
  state           text NOT NULL CHECK (state IN ('approved', 'retired')),
  reason          text NOT NULL CHECK (length(btrim(reason)) >= 8),
  digest          text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  declared_by     uuid NOT NULL,
  declared_at     timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id  uuid NOT NULL,
  CONSTRAINT atr_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT atr_version_once UNIQUE (tenant_id, domain_id, object_type, version),
  CONSTRAINT atr_fields CHECK (required_fields <@ ARRAY['event_time', 'observation_time', 'valid_from', 'valid_to']::text[]
                               AND (state = 'retired' OR cardinality(required_fields) >= 1))
);
CREATE INDEX atr_lookup ON analytics.temporal_requirements (tenant_id, domain_id, object_type, version DESC);

/* THE SEARCH REVIEWS (MET-014): a named human (product analyst or owner — NEVER the searcher) reviews a recorded search: were its results
   relevant decision-support evidence? — and classes its QUERY. One review per search. ROLE-LEVEL: the reviewer's role is recorded for the
   record; reviewed_by is the accountable human of the act (separation of duties), never a metric dimension, grouping or listing. The
   searcher is never named here. */
CREATE TABLE analytics.search_reviews (
  review_id      uuid PRIMARY KEY,
  scope          text NOT NULL,
  tenant_id      uuid NOT NULL,
  domain_id      uuid NOT NULL,
  search_id      uuid NOT NULL,
  query_class    text NOT NULL,
  verdict        text NOT NULL CHECK (verdict IN ('relevant', 'not_relevant')),
  reason         text NOT NULL CHECK (length(btrim(reason)) >= 8),
  reviewer_role  text NOT NULL CHECK (reviewer_role IN ('product_analyst', 'product_analytics_owner')),
  reviewed_by    uuid NOT NULL,
  reviewed_at    timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id uuid NOT NULL,
  CONSTRAINT asr_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT asr_class CHECK (query_class = ANY (analytics.mcb_query_classes())),
  CONSTRAINT asr_once UNIQUE (search_id)
);
CREATE INDEX asr_lookup ON analytics.search_reviews (tenant_id, domain_id, reviewed_at);

CREATE TRIGGER atr_append_only BEFORE UPDATE OR DELETE ON analytics.temporal_requirements FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
CREATE TRIGGER asr_append_only BEFORE UPDATE OR DELETE ON analytics.search_reviews FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['temporal_requirements', 'search_reviews'] LOOP
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

/* DECLARE a temporal requirement (analytics.temporal.declare — human-gated): the named product analytics owner, the object type (one the
   schema registry knows), the required fields (⊆ event_time, observation_time, valid_from, valid_to) or a retirement, a reason, and the
   version the owner saw (p_expected_version: the current version, 0 for none — a moved requirement is refused stale). */
CREATE OR REPLACE FUNCTION analytics.declare_temporal_requirement(p_requirement uuid, p_tenant uuid, p_domain uuid, p_object_type text, p_required text[], p_retire boolean,
                                                                  p_reason text, p_expected_version int, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = analytics, observation, executive, identity, objects, ctx, public, pg_catalog, pg_temp AS $$
DECLARE cur analytics.temporal_requirements%ROWTYPE; v_fields text[]; v_state text; v_digest text; v_kind text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['analytics.temporal.declare']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS NULL OR p_actor IS DISTINCT FROM public.eye_principal() THEN
    RAISE EXCEPTION 'metric definition rejected (actor): a temporal requirement is declared by the acting principal' USING ERRCODE = '42501';
  END IF;
  SELECT p.kind INTO v_kind FROM identity.principals p WHERE p.id = p_actor AND p.status = 'active';
  IF v_kind IS DISTINCT FROM 'human' THEN
    RAISE EXCEPTION 'metric definition rejected (actor): a temporal requirement is a named human''s declaration; an agent or a system principal never declares one' USING ERRCODE = '42501';
  END IF;
  IF NOT executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['product_analytics_owner']) THEN
    RAISE EXCEPTION 'metric definition rejected (authority): a temporal requirement is declared by the domain''s product analytics owner; the acting human is not one' USING ERRCODE = '42501';
  END IF;
  IF coalesce(length(btrim(p_reason)), 0) < 8 THEN RAISE EXCEPTION 'metric definition rejected (reason): a temporal requirement states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  IF p_object_type IS NULL OR p_object_type !~ '^[A-Z]{3}$' THEN RAISE EXCEPTION 'metric definition rejected (object_type): % is not an object type (three capitals)', p_object_type USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM objects.schema_registry s WHERE s.object_type = p_object_type) THEN
    RAISE EXCEPTION 'metric definition rejected (unknown_object_type): % is not a registered object type', p_object_type USING ERRCODE = '23503';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('analytics.temporal_requirements:' || p_tenant || ':' || p_domain || ':' || p_object_type, 92));
  SELECT * INTO cur FROM analytics.temporal_requirements x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.object_type = p_object_type ORDER BY x.version DESC LIMIT 1;
  IF p_expected_version IS NULL OR p_expected_version IS DISTINCT FROM coalesce(cur.version, 0) THEN
    RAISE EXCEPTION 'metric definition rejected (stale): the temporal requirement of % is at version %, not % — re-read it', p_object_type, coalesce(cur.version, 0), coalesce(p_expected_version::text, 'unstated') USING ERRCODE = '22023';
  END IF;
  IF coalesce(p_retire, false) THEN
    IF cur.requirement_id IS NULL OR cur.state <> 'approved' THEN
      RAISE EXCEPTION 'metric definition rejected (state): % has no requirement in force to retire', p_object_type USING ERRCODE = '22023';
    END IF;
    v_fields := '{}'; v_state := 'retired';
  ELSE
    SELECT coalesce(array_agg(DISTINCT f ORDER BY f), '{}') INTO v_fields FROM unnest(coalesce(p_required, '{}')) f;
    IF cardinality(v_fields) = 0 OR NOT (v_fields <@ analytics.mcb_time_fields()) THEN
      RAISE EXCEPTION 'metric definition rejected (fields): the required fields are a non-empty subset of % (recorded_at is required of every record by construction)', array_to_string(analytics.mcb_time_fields(), ', ') USING ERRCODE = '22023';
    END IF;
    IF cur.state = 'approved' AND cur.required_fields = v_fields THEN
      RAISE EXCEPTION 'metric definition rejected (duplicate): % already requires exactly %', p_object_type, array_to_string(v_fields, ', ') USING ERRCODE = '22023';
    END IF;
    v_state := 'approved';
  END IF;
  v_digest := analytics.digest(jsonb_build_object('object_type', p_object_type, 'version', coalesce(cur.version, 0) + 1, 'required_fields', to_jsonb(v_fields), 'state', v_state));
  INSERT INTO analytics.temporal_requirements (requirement_id, scope, tenant_id, domain_id, object_type, version, required_fields, state, reason, digest, declared_by, correlation_id)
  VALUES (p_requirement, 'DOMAIN', p_tenant, p_domain, p_object_type, coalesce(cur.version, 0) + 1, v_fields, v_state, btrim(p_reason), v_digest, p_actor, p_correlation);
  RETURN (SELECT to_jsonb(x) FROM analytics.temporal_requirements x WHERE x.requirement_id = p_requirement) || jsonb_build_object('supersedes', cur.requirement_id);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION analytics.declare_temporal_requirement(uuid,uuid,uuid,text,text[],boolean,text,int,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION analytics.declare_temporal_requirement(uuid,uuid,uuid,text,text[],boolean,text,int,uuid,uuid) TO eye_commit;

/* REVIEW a search (analytics.search.review — human-gated): a named human holding product_analyst or product_analytics_owner, NEVER the
   searcher (separation of duties: nobody grades their own search), the verdict, the query's class, a reason. One review per search. */
CREATE OR REPLACE FUNCTION analytics.review_search(p_review uuid, p_tenant uuid, p_domain uuid, p_search uuid, p_verdict text, p_query_class text, p_reason text,
                                                   p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = analytics, observation, executive, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE s executive.search_events%ROWTYPE; v_kind text; v_role text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['analytics.search.review']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS NULL OR p_actor IS DISTINCT FROM public.eye_principal() THEN
    RAISE EXCEPTION 'metric computation rejected (actor): a search review is recorded by the acting principal' USING ERRCODE = '42501';
  END IF;
  SELECT p.kind INTO v_kind FROM identity.principals p WHERE p.id = p_actor AND p.status = 'active';
  IF v_kind IS DISTINCT FROM 'human' THEN
    RAISE EXCEPTION 'metric computation rejected (actor): a search review is a named human''s judgement; an agent never reviews a search' USING ERRCODE = '42501';
  END IF;
  v_role := CASE WHEN executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['product_analytics_owner']) THEN 'product_analytics_owner'
                 WHEN executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['product_analyst']) THEN 'product_analyst' END;
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'metric computation rejected (authority): a search review needs a product analyst or the product analytics owner of the domain' USING ERRCODE = '42501';
  END IF;
  IF p_verdict IS NULL OR p_verdict NOT IN ('relevant', 'not_relevant') THEN
    RAISE EXCEPTION 'metric computation rejected (verdict): a search review''s verdict is relevant or not_relevant' USING ERRCODE = '22023';
  END IF;
  IF p_query_class IS NULL OR NOT (p_query_class = ANY (analytics.mcb_query_classes())) THEN
    RAISE EXCEPTION 'metric computation rejected (query_class): the query class is one of %', array_to_string(analytics.mcb_query_classes(), ', ') USING ERRCODE = '22023';
  END IF;
  IF coalesce(length(btrim(p_reason)), 0) < 8 THEN RAISE EXCEPTION 'metric computation rejected (reason): a search review states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  SELECT * INTO s FROM executive.search_events x WHERE x.search_id = p_search AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'metric computation rejected (unknown_search): % is not a search recorded in this domain', p_search USING ERRCODE = '23503'; END IF;
  IF s.principal_id = p_actor THEN
    RAISE EXCEPTION 'metric computation rejected (separation_of_duties): a search is reviewed by someone other than the person who searched' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM analytics.search_reviews r WHERE r.search_id = p_search) THEN
    RAISE EXCEPTION 'metric computation rejected (duplicate): the search % is already reviewed', p_search USING ERRCODE = '22023';
  END IF;
  INSERT INTO analytics.search_reviews (review_id, scope, tenant_id, domain_id, search_id, query_class, verdict, reason, reviewer_role, reviewed_by, correlation_id)
  VALUES (p_review, 'DOMAIN', p_tenant, p_domain, p_search, p_query_class, p_verdict, btrim(p_reason), v_role, p_actor, p_correlation);
  RETURN (SELECT to_jsonb(r) - 'reviewed_by' FROM analytics.search_reviews r WHERE r.review_id = p_review);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION analytics.review_search(uuid,uuid,uuid,uuid,text,text,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION analytics.review_search(uuid,uuid,uuid,uuid,text,text,text,uuid,uuid) TO eye_commit;

/* THE READS (INVOKER, under the caller's RLS): the temporal requirements (current per type + history); the searches awaiting or holding a
   review — the query, its hits and kinds, never who searched (the searcher's id is not selected). */
CREATE OR REPLACE FUNCTION analytics.temporal_requirements_read() RETURNS jsonb
LANGUAGE sql STABLE SET search_path = analytics, pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object(
    'current', coalesce((SELECT jsonb_agg(to_jsonb(c) - 'declared_by' ORDER BY c.object_type) FROM (SELECT DISTINCT ON (x.tenant_id, x.domain_id, x.object_type) x.* FROM analytics.temporal_requirements x
                          ORDER BY x.tenant_id, x.domain_id, x.object_type, x.version DESC) c), '[]'::jsonb),
    'history', coalesce((SELECT jsonb_agg(to_jsonb(x) - 'declared_by' ORDER BY x.object_type, x.version) FROM analytics.temporal_requirements x), '[]'::jsonb),
    'time_fields', to_jsonb(analytics.mcb_time_fields()))
$$;
GRANT EXECUTE ON FUNCTION analytics.temporal_requirements_read() TO eye_app, eye_commit;

CREATE OR REPLACE FUNCTION analytics.search_reviews_read(p_limit int DEFAULT 100) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = analytics, executive, pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object(
    'searches', coalesce((SELECT jsonb_agg(z ORDER BY z ->> 'searched_at' DESC) FROM (
      SELECT jsonb_build_object('search_id', s.search_id, 'query', s.query, 'hits', s.hits, 'kinds', s.kinds, 'searched_at', s.searched_at,
               'review', (SELECT to_jsonb(r) - 'reviewed_by' - 'tenant_id' - 'domain_id' FROM analytics.search_reviews r WHERE r.search_id = s.search_id)) z
        FROM executive.search_events s ORDER BY s.searched_at DESC LIMIT greatest(1, least(coalesce(p_limit, 100), 500))) q), '[]'::jsonb),
    'query_classes', to_jsonb(analytics.mcb_query_classes()))
$$;
GRANT EXECUTE ON FUNCTION analytics.search_reviews_read(int) TO eye_app, eye_commit;

-- §MCB.3 THE COMPUTATIONS (0113 §0.7) ─────────────────────────────────────────────────────────────────────────────────────────────────────

/* MET-006 EVIDENCE CITATION RESOLUTION (rate; dimension object_type; App M: "citations resolving to exact accessible source version and
   segment"). READING — population: every evidence CITATION recorded in the window: (a) each claim's lineage row (the evidence, its digest,
   its byte span), (b) each canonical-form reference in the evidence_refs of a record version recorded in the window (`TYP:<id>@<n>`,
   `TYP:<id>`, `evidence:`, `entity:`, `claim:`, a bare id, `blob:<manifest>`) — a lineage-covered `EVD:<id>` reference of a claim is
   counted once (its lineage row). Numerator: the citation resolves (analytics.mcb_resolve) to an exact version — the lineage's digest,
   the explicit version, or the version current at the citing record's own record time (`as_of` pinning, stated per record) — that
   exists, is not withdrawn, whose bytes are stored and not tombstoned, and (lineage) whose segment lies inside the bytes. REGISTER
   references (a gateway call, a review case, a strategy node, a candidate …) are not evidence citations of a source version: counted in
   quality.register_references, outside the population. Accessibility is judged as the record's standing, not the reader's clearance
   (the drill-down reads under the reader's RLS). SCOPE: ignored — citation integrity is domain-wide by nature (stated). */
CREATE OR REPLACE FUNCTION analytics.mc_met006_citation_resolution(p_tenant uuid, p_domain uuid, p_from timestamptz, p_to timestamptz, p_as_of timestamptz, p_scope jsonb, p_cohort jsonb, p_params jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = analytics, objects, intelligence, observation, public, pg_catalog, pg_temp AS $$
DECLARE v_newest timestamptz; v_type text := p_cohort ->> 'object_type'; v_cap int := analytics.mcb_cap(p_params); v_bound bigint; v_recs jsonb; v_register jsonb; v_pins jsonb;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the evidence citations of the domain''s records (MET-006)');
  IF coalesce(p_params ->> 'clock', 'record') <> 'record' THEN RETURN analytics.mcb_clock_refused('rate', 'MET-006', 'a citation is recorded with its citing record and has no world time', p_params); END IF;
  SELECT coalesce((SELECT count(*) FROM intelligence.claim_lineage l WHERE l.tenant_id = p_tenant AND l.domain_id = p_domain AND l.recorded_at >= p_from AND l.recorded_at < p_to AND l.recorded_at <= p_as_of
                    AND (v_type IS NULL OR l.claim_type = v_type)), 0)
       + coalesce((SELECT sum(jsonb_array_length(o.evidence_refs)) FROM objects.canonical_objects o WHERE o.tenant_id = p_tenant AND o.domain_id = p_domain AND o.recorded_at >= p_from
                    AND o.recorded_at < p_to AND o.recorded_at <= p_as_of AND (v_type IS NULL OR o.object_type = v_type)), 0) INTO v_bound;
  IF v_bound > v_cap THEN RETURN analytics.mcb_over_cap('rate', 'MET-006', v_bound, v_cap, 'record'); END IF;
  WITH cit AS (
    SELECT l.claim_type AS otype, l.claim_object_id AS oid, l.claim_version AS over, l.recorded_at AS at, 'EVD:' || l.evidence_object_id AS ref, l.evidence_digest AS dg,
           l.byte_end AS be, jsonb_build_object('start', l.byte_start, 'end', l.byte_end) AS seg, 'lineage' AS via
      FROM intelligence.claim_lineage l
     WHERE l.tenant_id = p_tenant AND l.domain_id = p_domain AND l.recorded_at >= p_from AND l.recorded_at < p_to AND l.recorded_at <= p_as_of AND (v_type IS NULL OR l.claim_type = v_type)
    UNION ALL
    SELECT o.object_type, o.object_id, o.object_version, o.recorded_at, e.ref, NULL, NULL, NULL, 'evidence_refs'
      FROM objects.canonical_objects o CROSS JOIN LATERAL jsonb_array_elements_text(o.evidence_refs) e(ref)
     WHERE o.tenant_id = p_tenant AND o.domain_id = p_domain AND o.recorded_at >= p_from AND o.recorded_at < p_to AND o.recorded_at <= p_as_of AND (v_type IS NULL OR o.object_type = v_type)
       AND NOT EXISTS (SELECT 1 FROM intelligence.claim_lineage l WHERE l.claim_object_id = o.object_id AND l.claim_version = o.object_version AND e.ref IN ('EVD:' || l.evidence_object_id, 'evidence:' || l.evidence_object_id))),
  judged AS (SELECT c.*, analytics.mcb_resolve(p_tenant, p_domain, c.ref, c.at, p_as_of, c.dg, c.be) AS r FROM cit c)
  SELECT (SELECT coalesce(jsonb_agg(jsonb_build_object('kind', 'citation', 'id', format('%s:%s@%s->%s', j.otype, j.oid, j.over, j.ref),
                                               'role', CASE WHEN (j.r ->> 'resolved')::boolean THEN 'numerator' ELSE 'denominator' END,
                                               'reason', CASE WHEN NOT (j.r ->> 'resolved')::boolean THEN j.r ->> 'reason' END,
                                               'detail', jsonb_strip_nulls(jsonb_build_object('object_type', j.otype, 'via', j.via, 'pin', j.r ->> 'pin', 'cited_version', j.r ->> 'version',
                                                                                              'segment', j.seg, 'tier', j.r ->> 'tier')))
                                    ORDER BY j.at, j.oid, j.over, j.ref), '[]'::jsonb) FROM judged j WHERE j.r ->> 'class' <> 'register'),
         (SELECT coalesce(jsonb_object_agg(z.prefix, z.n), '{}'::jsonb) FROM (SELECT j.r ->> 'prefix' AS prefix, count(*) AS n FROM judged j WHERE j.r ->> 'class' = 'register' GROUP BY 1) z)
,
         (SELECT max(j.at) FROM judged j WHERE j.r ->> 'class' <> 'register')
    INTO v_recs, v_register, v_newest;
  SELECT coalesce(jsonb_object_agg(p, n), '{}'::jsonb) INTO v_pins FROM (SELECT x -> 'detail' ->> 'pin' p, count(*) n FROM jsonb_array_elements(v_recs) x WHERE x -> 'detail' ? 'pin' GROUP BY 1) z;
  RETURN analytics.mcb_finish(jsonb_build_object('kind', 'rate', 'records', v_recs, 'reasons', '[]'::jsonb,
    'quality', jsonb_build_object('clock', 'record', 'register_references', v_register, 'pinning', v_pins, 'scope_rule', 'ignored: citation integrity is domain-wide by nature',
      'notes', jsonb_build_array('an unversioned reference resolves to the version current at the citing record''s own record time (pin = as_of)',
                                 'accessibility is the record''s standing (exists, not withdrawn, bytes stored and not tombstoned) — the reader''s clearance is applied at the drill-down'))), 'object_type', v_newest);
END $$;
REVOKE ALL ON FUNCTION analytics.mc_met006_citation_resolution(uuid,uuid,timestamptz,timestamptz,timestamptz,jsonb,jsonb,jsonb) FROM PUBLIC;
SELECT analytics.register_computation('met006_citation_resolution', 'analytics.mc_met006_citation_resolution', 'rate', ARRAY['object_type'],
  ARRAY['intelligence.claim_lineage', 'objects.canonical_objects', 'observation.blob_manifests', 'observation.blob_tombstones', 'observation.blob_tier_records'],
  'ignored: citation integrity is a property of every record of the domain (domain-wide by nature)',
  'MET-006: evidence citations recorded in the window (claim lineage rows and canonical-form evidence references) resolving to an exact, stored, untombstoned, unwithdrawn source version and segment', '0113 §MCB');

/* MET-007 PROVENANCE CLOSURE (rate; dimension object_type; App M: "material outputs with complete source-to-product lineage", threshold
   100 % decision-active). READING — population: the DECISION-ACTIVE outputs: each distinct record cited (an option's consequence with an
   id: a run, a forecast, an assumption …) by an option set in the window on a decision package that is live now (proposed, under review,
   approved, committed, monitoring or reopened — packages_current is a CURRENT-state table, stated). A cited run is its SIM record, or — a
   run with no SIM record — its twin version. Numerator: the output's lineage is complete (analytics.mcb_lineage: every upstream reference
   resolves and every path reaches stored bytes, a registered source or a named human's declaration). SCOPE: a package concerns the scope
   when its cited version's objectives intersect the scope's objective_ids (a NULL scope = the domain). */
CREATE OR REPLACE FUNCTION analytics.mc_met007_provenance_closure(p_tenant uuid, p_domain uuid, p_from timestamptz, p_to timestamptz, p_as_of timestamptz, p_scope jsonb, p_cohort jsonb, p_params jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = analytics, decision, simulation, objects, observation, public, pg_catalog, pg_temp AS $$
DECLARE v_newest timestamptz; v_type text := p_cohort ->> 'object_type'; v_cap int := analytics.mcb_cap(p_params); v_recs jsonb := '[]'::jsonb; c record; v_root text; v_lin jsonb; v_rtype text; v_n int := 0;
        v_obj text[] := CASE WHEN p_scope IS NULL THEN NULL ELSE ARRAY(SELECT jsonb_array_elements_text(coalesce(p_scope -> 'objective_ids', '[]'::jsonb))) END;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the lineage of the domain''s decision-active outputs (MET-007)');
  IF coalesce(p_params ->> 'clock', 'record') <> 'record' THEN RETURN analytics.mcb_clock_refused('rate', 'MET-007', 'a citation by a decision option is recorded when the option is set', p_params); END IF;
  FOR c IN
    SELECT x.kind, x.id, x.version, array_agg(DISTINCT x.package_id::text ORDER BY x.package_id::text) AS packages, min(x.set_at) AS first_cited, max(x.set_at) AS last_cited
      FROM (SELECT cc ->> 'kind' AS kind, (cc ->> 'id')::uuid AS id, CASE WHEN coalesce(cc ->> 'version', '') ~ '^[0-9]+$' THEN (cc ->> 'version')::bigint END AS version, o.package_id, o.set_at
              FROM decision.options o JOIN decision.packages_current p ON p.package_id = o.package_id
              JOIN decision.package_versions pv ON pv.package_id = o.package_id AND pv.version = o.version
              CROSS JOIN LATERAL jsonb_array_elements(o.consequences) cc
             WHERE o.tenant_id = p_tenant AND o.domain_id = p_domain AND o.set_at >= p_from AND o.set_at < p_to AND o.set_at <= p_as_of
               AND p.state IN ('proposed', 'under_review', 'approved', 'committed', 'monitoring', 'reopened')
               AND coalesce(cc ->> 'id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
               AND (v_obj IS NULL OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(coalesce(pv.objectives, '[]'::jsonb)) ob WHERE ob = ANY (v_obj)))) x
     GROUP BY x.kind, x.id, x.version ORDER BY min(x.set_at), x.id
  LOOP
    v_n := v_n + 1; v_newest := greatest(v_newest, c.last_cited);
    IF v_n > v_cap THEN RETURN analytics.mcb_over_cap('rate', 'MET-007', v_n, v_cap, 'record'); END IF;
    -- the record the citation names: its canonical record (the cited version, or the version current at the as-of); a cited run with no
    -- SIM record walks from the twin version it ran on; an id that names nothing walks from the bare id (and breaks, said)
    v_root := NULL; v_rtype := NULL;
    SELECT o.object_type INTO v_rtype FROM objects.canonical_objects o WHERE o.object_id = c.id AND o.recorded_at <= p_as_of ORDER BY o.object_version DESC LIMIT 1;
    IF v_rtype IS NOT NULL THEN
      v_root := v_rtype || ':' || c.id || coalesce('@' || c.version, '');
    ELSIF c.kind = 'run' THEN
      SELECT 'TWN:' || r.twin_id || '@' || r.twin_version INTO v_root FROM simulation.runs_current r WHERE r.run_id = c.id;
      IF v_root IS NOT NULL THEN v_rtype := 'SIM'; END IF;
    END IF;
    IF v_root IS NULL THEN v_root := c.id::text; v_rtype := upper(left(c.kind, 3)); END IF;
    IF v_type IS NOT NULL AND v_rtype IS DISTINCT FROM v_type THEN CONTINUE; END IF;
    v_lin := analytics.mcb_lineage(p_tenant, p_domain, v_root, p_as_of);
    v_recs := v_recs || jsonb_build_object('kind', 'output', 'id', format('%s:%s', c.kind, c.id) || coalesce('@' || c.version, ''),
      'role', CASE WHEN (v_lin ->> 'complete')::boolean THEN 'numerator' ELSE 'denominator' END,
      'reason', CASE WHEN NOT (v_lin ->> 'complete')::boolean THEN coalesce((v_lin -> 'broken' -> 0 ->> 'reason'), 'the lineage reaches no origin') END,
      'detail', jsonb_build_object('object_type', v_rtype, 'cited_by_packages', to_jsonb(c.packages), 'walked_from', v_root, 'lineage', v_lin));
  END LOOP;
  RETURN analytics.mcb_finish(jsonb_build_object('kind', 'rate', 'records', v_recs, 'reasons', '[]'::jsonb,
    'quality', jsonb_build_object('clock', 'record', 'scope_rule', CASE WHEN p_scope IS NULL THEN 'the domain' ELSE 'packages whose cited version names an objective of the scope' END,
      'notes', jsonb_build_array('decision-active = cited by an option of a package live NOW (decision.packages_current is a current-state table: a replay reports mismatch if a package''s state moved since)',
                                 'a lineage origin is stored bytes, a registered source, or a named human''s declaration (a record whose only provenance is its human_refs)'))), 'object_type', v_newest);
END $$;
REVOKE ALL ON FUNCTION analytics.mc_met007_provenance_closure(uuid,uuid,timestamptz,timestamptz,timestamptz,jsonb,jsonb,jsonb) FROM PUBLIC;
SELECT analytics.register_computation('met007_provenance_closure', 'analytics.mc_met007_provenance_closure', 'rate', ARRAY['object_type'],
  ARRAY['decision.options', 'decision.packages_current', 'decision.package_versions', 'simulation.runs_current', 'objects.canonical_objects', 'intelligence.claim_lineage', 'observation.blob_manifests', 'observation.blob_tombstones'],
  'a decision package concerns the scope when its cited version''s objectives intersect the scope''s objective_ids; a NULL scope is the domain',
  'MET-007: decision-active outputs (cited by an option of a live package, set in the window) whose source-to-product lineage is complete', '0113 §MCB');

/* MET-008 TRUTH-STATE COMPLETENESS (rate; dimension object_type; App M: "objects with valid explicit epistemic state and transitions").
   READING — population: the record VERSIONS recorded in the window. The explicit state is COMPLETE BY CONSTRUCTION (truth_state NOT NULL,
   its vocabulary and synthetic consistency are CHECKs of objects.canonical_objects) — so the measured part is the TRANSITIONS and the
   state's agreement with the lifecycle: a version is valid when (1) its truth state and its lifecycle agree on withdrawal, (2) a synthetic
   record never becomes a real one (prior synthetic, this not), (3) a withdrawn record is terminal unless this version is a correction or a
   supersession of it, (4) its version follows its prior without a gap (an unrecorded transition). Where NO version in the population has
   a prior (no transition exercised), the result is INDETERMINATE (said): a 100 % over constructed states alone would be a vanity number.
   SCOPE: ignored — the epistemic state is domain-wide by nature (stated). */
CREATE OR REPLACE FUNCTION analytics.mc_met008_truth_state_completeness(p_tenant uuid, p_domain uuid, p_from timestamptz, p_to timestamptz, p_as_of timestamptz, p_scope jsonb, p_cohort jsonb, p_params jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = analytics, objects, observation, public, pg_catalog, pg_temp AS $$
DECLARE v_newest timestamptz; v_type text := p_cohort ->> 'object_type'; v_cap int := analytics.mcb_cap(p_params); v_bound bigint; v_recs jsonb; v_trans int; v_reasons jsonb := '[]'::jsonb;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the truth states of the domain''s records (MET-008)');
  IF coalesce(p_params ->> 'clock', 'record') <> 'record' THEN RETURN analytics.mcb_clock_refused('rate', 'MET-008', 'a truth state is recorded with its version', p_params); END IF;
  SELECT count(*) INTO v_bound FROM objects.canonical_objects o WHERE o.tenant_id = p_tenant AND o.domain_id = p_domain AND o.recorded_at >= p_from AND o.recorded_at < p_to AND o.recorded_at <= p_as_of
     AND (v_type IS NULL OR o.object_type = v_type);
  IF v_bound > v_cap THEN RETURN analytics.mcb_over_cap('rate', 'MET-008', v_bound, v_cap, 'record'); END IF;
  WITH v AS (
    SELECT o.object_id, o.object_type, o.object_version, o.truth_state, o.lifecycle_state, o.synthetic_state, o.correction_of, o.supersedes, o.recorded_at,
           pr.object_version AS pv, pr.truth_state AS pts, pr.lifecycle_state AS pls, pr.synthetic_state AS pss
      FROM objects.canonical_objects o
      LEFT JOIN LATERAL (SELECT x.object_version, x.truth_state, x.lifecycle_state, x.synthetic_state FROM objects.canonical_objects x
                          WHERE x.object_id = o.object_id AND x.object_version < o.object_version AND x.recorded_at <= p_as_of ORDER BY x.object_version DESC LIMIT 1) pr ON true
     WHERE o.tenant_id = p_tenant AND o.domain_id = p_domain AND o.recorded_at >= p_from AND o.recorded_at < p_to AND o.recorded_at <= p_as_of AND (v_type IS NULL OR o.object_type = v_type)),
  judged AS (
    SELECT v.*, array_remove(ARRAY[
             CASE WHEN (v.truth_state = 'withdrawn') <> (v.lifecycle_state = 'withdrawn') THEN 'the truth state and the lifecycle disagree on withdrawal' END,
             CASE WHEN v.pss AND NOT v.synthetic_state THEN 'a synthetic record became a real one' END,
             CASE WHEN v.pls = 'withdrawn' AND v.correction_of IS NULL AND v.supersedes IS NULL THEN 'a withdrawn record changed without a correction or a supersession' END,
             CASE WHEN v.pv IS NOT NULL AND v.object_version <> v.pv + 1 THEN format('version %s follows version %s: an unrecorded transition', v.object_version, v.pv)
                  WHEN v.pv IS NULL AND v.object_version > 1 THEN format('version %s has no recorded prior version', v.object_version) END], NULL) AS violations
      FROM v)
  SELECT coalesce(jsonb_agg(jsonb_build_object('kind', 'record_version', 'id', format('%s:%s@%s', j.object_type, j.object_id, j.object_version),
                                               'role', CASE WHEN cardinality(j.violations) = 0 THEN 'numerator' ELSE 'denominator' END,
                                               'reason', CASE WHEN cardinality(j.violations) > 0 THEN array_to_string(j.violations, '; ') END,
                                               'detail', jsonb_strip_nulls(jsonb_build_object('object_type', j.object_type, 'truth_state', j.truth_state, 'lifecycle', j.lifecycle_state,
                                                                                              'transition', CASE WHEN j.pv IS NOT NULL THEN format('%s/%s → %s/%s', j.pts, j.pls, j.truth_state, j.lifecycle_state) END)))
                            ORDER BY j.recorded_at, j.object_id, j.object_version), '[]'::jsonb),
         count(*) FILTER (WHERE j.pv IS NOT NULL OR j.object_version > 1),
         max(j.recorded_at)
    INTO v_recs, v_trans, v_newest FROM judged j;
  IF jsonb_array_length(v_recs) > 0 AND v_trans = 0 THEN
    v_reasons := v_reasons || to_jsonb('no record in the population changed state (every version is a first version): the explicit state is complete by construction and the transitions are unexercised — a 100 % here would be a vanity number'::text);
  END IF;
  RETURN analytics.mcb_finish(jsonb_build_object('kind', 'rate', 'records', v_recs, 'reasons', v_reasons,
    'quality', jsonb_build_object('clock', 'record', 'transitions_measured', v_trans, 'by_construction', jsonb_build_array('truth_state NOT NULL', 'truth_state vocabulary', 'synthetic consistency'),
      'scope_rule', 'ignored: the epistemic state is domain-wide by nature')), 'object_type', v_newest);
END $$;
REVOKE ALL ON FUNCTION analytics.mc_met008_truth_state_completeness(uuid,uuid,timestamptz,timestamptz,timestamptz,jsonb,jsonb,jsonb) FROM PUBLIC;
SELECT analytics.register_computation('met008_truth_state_completeness', 'analytics.mc_met008_truth_state_completeness', 'rate', ARRAY['object_type'],
  ARRAY['objects.canonical_objects'], 'ignored: the epistemic state of records is domain-wide by nature',
  'MET-008: record versions recorded in the window whose truth state agrees with the lifecycle and whose transitions are admissible (the state itself complete by construction — said, never a vanity 100 %)', '0113 §MCB');

/* MET-009 TEMPORAL COMPLETENESS (rate; dimension object_type; App M: "objects with required event, observation, validity, and record
   times"). READING — population: the record versions recorded in the window whose object type has a temporal requirement IN FORCE at the
   as-of (analytics.temporal_requirements, the owner's declaration; recorded_at is required of all and NOT NULL by construction).
   Numerator: every required field is set. A type with no requirement is outside the population (counted in quality); NO requirement for
   any type → INDETERMINATE (what "required" means is undeclared). SCOPE: ignored (domain-wide by nature, stated). */
CREATE OR REPLACE FUNCTION analytics.mc_met009_temporal_completeness(p_tenant uuid, p_domain uuid, p_from timestamptz, p_to timestamptz, p_as_of timestamptz, p_scope jsonb, p_cohort jsonb, p_params jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = analytics, objects, observation, public, pg_catalog, pg_temp AS $$
DECLARE v_newest timestamptz; v_type text := p_cohort ->> 'object_type'; v_cap int := analytics.mcb_cap(p_params); v_bound bigint; v_recs jsonb; v_req jsonb; v_without jsonb; v_reasons jsonb := '[]'::jsonb;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the time fields of the domain''s records (MET-009)');
  IF coalesce(p_params ->> 'clock', 'record') <> 'record' THEN RETURN analytics.mcb_clock_refused('rate', 'MET-009', 'a record''s time fields are judged when it is recorded', p_params); END IF;
  SELECT coalesce(jsonb_object_agg(r.object_type, jsonb_build_object('version', r.version, 'fields', to_jsonb(r.required_fields))), '{}'::jsonb) INTO v_req
    FROM (SELECT DISTINCT ON (x.object_type) x.* FROM analytics.temporal_requirements x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.declared_at <= p_as_of
           ORDER BY x.object_type, x.version DESC) r WHERE r.state = 'approved';
  IF v_req = '{}'::jsonb THEN
    RETURN analytics.mcb_finish(jsonb_build_object('kind', 'rate', 'records', '[]'::jsonb, 'quality', jsonb_build_object('clock', 'record'),
      'reasons', jsonb_build_array('no temporal requirement is in force for any object type as of the as-of: what "required" means is undeclared (analytics.temporal.declare, the product analytics owner)')), 'object_type', NULL);
  END IF;
  IF v_type IS NOT NULL AND NOT v_req ? v_type THEN
    RETURN analytics.mcb_finish(jsonb_build_object('kind', 'rate', 'records', '[]'::jsonb, 'quality', jsonb_build_object('clock', 'record', 'requirements', v_req),
      'reasons', jsonb_build_array(format('no temporal requirement is in force for %s as of the as-of: its completeness is undeclared', v_type))), 'object_type', NULL);
  END IF;
  SELECT count(*) INTO v_bound FROM objects.canonical_objects o WHERE o.tenant_id = p_tenant AND o.domain_id = p_domain AND o.recorded_at >= p_from AND o.recorded_at < p_to AND o.recorded_at <= p_as_of
     AND v_req ? o.object_type AND (v_type IS NULL OR o.object_type = v_type);
  IF v_bound > v_cap THEN RETURN analytics.mcb_over_cap('rate', 'MET-009', v_bound, v_cap, 'record'); END IF;
  WITH v AS (
    SELECT o.object_type, o.object_id, o.object_version, o.recorded_at,
           ARRAY(SELECT f FROM jsonb_array_elements_text(v_req -> o.object_type -> 'fields') f
                  WHERE (f = 'event_time' AND o.event_time IS NULL) OR (f = 'observation_time' AND o.observation_time IS NULL)
                     OR (f = 'valid_from' AND o.valid_from IS NULL) OR (f = 'valid_to' AND o.valid_to IS NULL) ORDER BY f) AS missing
      FROM objects.canonical_objects o
     WHERE o.tenant_id = p_tenant AND o.domain_id = p_domain AND o.recorded_at >= p_from AND o.recorded_at < p_to AND o.recorded_at <= p_as_of AND v_req ? o.object_type
       AND (v_type IS NULL OR o.object_type = v_type))
  SELECT coalesce(jsonb_agg(jsonb_build_object('kind', 'record_version', 'id', format('%s:%s@%s', v.object_type, v.object_id, v.object_version),
                                               'role', CASE WHEN cardinality(v.missing) = 0 THEN 'numerator' ELSE 'denominator' END,
                                               'reason', CASE WHEN cardinality(v.missing) > 0 THEN 'missing ' || array_to_string(v.missing, ', ') END,
                                               'detail', jsonb_build_object('object_type', v.object_type, 'requirement_version', v_req -> v.object_type -> 'version', 'required', v_req -> v.object_type -> 'fields'))
                            ORDER BY v.recorded_at, v.object_id, v.object_version), '[]'::jsonb), max(v.recorded_at) INTO v_recs, v_newest FROM v;
  SELECT coalesce(jsonb_object_agg(t, n), '{}'::jsonb) INTO v_without FROM (
    SELECT o.object_type t, count(*) n FROM objects.canonical_objects o WHERE o.tenant_id = p_tenant AND o.domain_id = p_domain AND o.recorded_at >= p_from AND o.recorded_at < p_to
       AND o.recorded_at <= p_as_of AND NOT v_req ? o.object_type AND v_type IS NULL GROUP BY 1) z;
  RETURN analytics.mcb_finish(jsonb_build_object('kind', 'rate', 'records', v_recs, 'reasons', v_reasons,
    'quality', jsonb_build_object('clock', 'record', 'requirements', v_req, 'types_without_requirement', v_without, 'scope_rule', 'ignored: temporal completeness is domain-wide by nature')), 'object_type', v_newest);
END $$;
REVOKE ALL ON FUNCTION analytics.mc_met009_temporal_completeness(uuid,uuid,timestamptz,timestamptz,timestamptz,jsonb,jsonb,jsonb) FROM PUBLIC;
SELECT analytics.register_computation('met009_temporal_completeness', 'analytics.mc_met009_temporal_completeness', 'rate', ARRAY['object_type'],
  ARRAY['objects.canonical_objects', 'analytics.temporal_requirements'], 'ignored: temporal completeness of records is domain-wide by nature',
  'MET-009: record versions recorded in the window, of an object type with a declared temporal requirement, carrying every required time field', '0113 §MCB');

/* MET-010 CORRECTION PROPAGATION TIME (duration, seconds; App M: "time from accepted correction to all affected products reconciled or
   constrained"). READING — population: corrections ACCEPTED in the window (observation.correction_events `case.applied`). Start: the
   acceptance instant. End — THE CLOSURE INSTANT (defined here): the latest of (a) every dependency-propagation assessment of the case
   (graph.invalidations_current.assessed_at — what each affected product was marked or reported) and (b) the automatic propagation's
   completion (graph.propagation_attempts.finished_at, state complete) — the moment all known propagation work had finished; only when the
   case's propagation is complete and that instant is at or before the as-of. A case still propagating is EXCLUDED as censored and, when
   censored cases are more than half the accepted ones, the median is INDETERMINATE (a survivor-biased distribution). No propagation
   contract is declared in the product (App M "within contract"): the duration is measured; its breach is the definition's threshold.
   correction_current and propagation_attempts are CURRENT-state tables (stated). SCOPE: a correction concerns the scope when its source
   reaches the scope (analytics.mcb_scope_sources). */
CREATE OR REPLACE FUNCTION analytics.mc_met010_correction_propagation(p_tenant uuid, p_domain uuid, p_from timestamptz, p_to timestamptz, p_as_of timestamptz, p_scope jsonb, p_cohort jsonb, p_params jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = analytics, observation, graph, public, pg_catalog, pg_temp AS $$
DECLARE v_newest timestamptz; v_src uuid[] := analytics.mcb_scope_sources(p_tenant, p_domain, p_scope); v_recs jsonb; v_cens int; v_total int; v_reasons jsonb := '[]'::jsonb;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the propagation of the domain''s corrections (MET-010)');
  IF coalesce(p_params ->> 'clock', 'record') <> 'record' THEN RETURN analytics.mcb_clock_refused('duration', 'MET-010', 'a correction is accepted and propagated in record time', p_params); END IF;
  WITH acc AS (
    SELECT DISTINCT ON (e.case_id) e.case_id, e.occurred_at AS accepted_at, c.source_id, c.kind, c.propagation_state
      FROM observation.correction_events e JOIN observation.correction_current c ON c.case_id = e.case_id
     WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain AND e.event = 'case.applied' AND e.occurred_at >= p_from AND e.occurred_at < p_to AND e.occurred_at <= p_as_of
       AND (v_src IS NULL OR c.source_id = ANY (v_src))
     ORDER BY e.case_id, e.occurred_at),
  closed AS (
    SELECT a.*, (SELECT max(i.assessed_at) FROM graph.invalidations_current i WHERE i.correction_case_id = a.case_id AND i.assessed_at IS NOT NULL AND i.assessed_at <= p_as_of) AS assessed_at,
           (SELECT max(t.finished_at) FROM graph.propagation_attempts t WHERE t.case_id = a.case_id AND t.state = 'complete' AND t.finished_at <= p_as_of) AS walked_at,
           EXISTS (SELECT 1 FROM graph.propagation_attempts t WHERE t.case_id = a.case_id AND (t.state <> 'complete' OR t.finished_at IS NULL OR t.finished_at > p_as_of)) AS open_attempt
      FROM acc a),
  judged AS (SELECT c.*, CASE WHEN c.propagation_state = 'complete' AND NOT c.open_attempt AND coalesce(c.assessed_at, c.walked_at) IS NOT NULL
                              THEN greatest(c.assessed_at, c.walked_at) END AS closed_at FROM closed c)
  SELECT coalesce(jsonb_agg(CASE WHEN j.closed_at IS NOT NULL THEN
                              jsonb_build_object('kind', 'correction', 'id', j.case_id, 'role', 'included',
                                'detail', jsonb_strip_nulls(jsonb_build_object('value', round(greatest(0, extract(epoch FROM (j.closed_at - j.accepted_at)))::numeric, 3), 'accepted_at', j.accepted_at,
                                                           'closed_at', j.closed_at, 'closure', CASE WHEN j.walked_at IS NOT NULL AND (j.assessed_at IS NULL OR j.walked_at >= j.assessed_at) THEN 'propagation walk complete' ELSE 'dependency assessment' END,
                                                           'correction_kind', j.kind)))
                            ELSE jsonb_build_object('kind', 'correction', 'id', j.case_id, 'role', 'excluded',
                                'reason', 'censored: the propagation is not complete as of the as-of (no closure instant yet)', 'detail', jsonb_build_object('accepted_at', j.accepted_at, 'propagation_state', j.propagation_state, 'closure', 'censored')) END
                            ORDER BY j.accepted_at, j.case_id), '[]'::jsonb),
         count(*) FILTER (WHERE j.closed_at IS NULL), count(*),
         max(j.accepted_at)
    INTO v_recs, v_cens, v_total, v_newest FROM judged j;
  IF v_total > 0 AND v_cens * 2 > v_total THEN
    v_reasons := v_reasons || to_jsonb(format('%s of %s accepted corrections are still propagating (censored): a median over the closed ones alone would be survivor-biased', v_cens, v_total));
  END IF;
  RETURN analytics.mcb_finish(jsonb_build_object('kind', 'duration', 'records', v_recs, 'reasons', v_reasons,
    'quality', jsonb_build_object('clock', 'record', 'censored', v_cens, 'accepted', v_total, 'unit', 'seconds',
      'scope_rule', CASE WHEN p_scope IS NULL THEN 'the domain' ELSE 'corrections of sources feeding the scope''s series or entities' END,
      'notes', jsonb_build_array('the closure instant = the latest dependency assessment or the completed propagation walk of the case',
                                 'no correction-propagation contract is declared in the product: the duration is measured, its breach is the definition''s threshold',
                                 'correction_current and propagation_attempts are current-state tables: a replay reports mismatch if a propagation moved since'))), 'closure', v_newest);
END $$;
REVOKE ALL ON FUNCTION analytics.mc_met010_correction_propagation(uuid,uuid,timestamptz,timestamptz,timestamptz,jsonb,jsonb,jsonb) FROM PUBLIC;
SELECT analytics.register_computation('met010_correction_propagation', 'analytics.mc_met010_correction_propagation', 'duration', ARRAY[]::text[],
  ARRAY['observation.correction_events', 'observation.correction_current', 'graph.invalidations_current', 'graph.propagation_attempts', 'prediction.series_registry', 'observation.source_contracts_current'],
  'a correction concerns the scope when its source feeds a series of the scope''s series_keys or of an entity in its entity_ids; a NULL scope is the domain',
  'MET-010: seconds from an accepted correction to its closure instant (the latest dependency assessment or completed propagation walk); censored cases excluded and said', '0113 §MCB');

/* MET-011 SOURCE COVERAGE ATTAINMENT (rate; dimension source; App M: "observed coverage against approved dimension and priority
   targets"). READING — population: each MEASURED actual-coverage measurement evaluated in the window, paired with its source's
   expected-coverage measurement for the same measurement window. Numerator: actual ≥ the target. THE TARGET: the product holds NO approved
   coverage target (no plan or contract declares a dimension or priority target) — the expected coverage is the coverage universe's count,
   not an approved target: the result is INDETERMINATE with that reason UNLESS the definition declares (params.expected_is_target = true,
   approved with the definition by its owner and labelled in quality) that the universe's expected coverage IS the approved target.
   Unmeasured measurements (unknown, insufficient evidence, indeterminate, not applicable) are excluded with their state. SCOPE: the
   scope's sources (analytics.mcb_scope_sources). */
CREATE OR REPLACE FUNCTION analytics.mc_met011_coverage_attainment(p_tenant uuid, p_domain uuid, p_from timestamptz, p_to timestamptz, p_as_of timestamptz, p_scope jsonb, p_cohort jsonb, p_params jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = analytics, observation, public, pg_catalog, pg_temp AS $$
DECLARE v_newest timestamptz; v_src uuid[] := analytics.mcb_scope_sources(p_tenant, p_domain, p_scope); v_key text := p_cohort ->> 'source'; v_recs jsonb; v_reasons jsonb := '[]'::jsonb;
        v_declared boolean := coalesce(p_params ->> 'expected_is_target', 'false') = 'true';
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the coverage measurements of the domain''s sources (MET-011)');
  IF coalesce(p_params ->> 'clock', 'record') <> 'record' THEN RETURN analytics.mcb_clock_refused('rate', 'MET-011', 'a coverage measurement is evaluated and stored in record time', p_params); END IF;
  WITH a AS (
    SELECT m.*, (SELECT c.source_key FROM observation.source_contracts_current c WHERE c.source_id = m.source_id ORDER BY c.contract_version DESC LIMIT 1) AS source_key
      FROM observation.coverage_measurements m
     WHERE m.tenant_id = p_tenant AND m.domain_id = p_domain AND m.dimension = 'actual_coverage' AND m.evaluated_at >= p_from AND m.evaluated_at < p_to AND m.recorded_at <= p_as_of
       AND (v_src IS NULL OR m.source_id = ANY (v_src))),
  paired AS (
    SELECT a.*, e.state AS e_state, e.value_numeric AS e_value, e.measurement_id AS e_id
      FROM a LEFT JOIN LATERAL (SELECT x.* FROM observation.coverage_measurements x WHERE x.source_id = a.source_id AND x.dimension = 'expected_coverage'
                                  AND x.window_start = a.window_start AND x.window_end = a.window_end AND x.recorded_at <= p_as_of ORDER BY x.evaluated_at DESC LIMIT 1) e ON true
     WHERE v_key IS NULL OR a.source_key = v_key)
  SELECT coalesce(jsonb_agg(CASE
           WHEN p.state <> 'measured' OR p.value_numeric IS NULL THEN jsonb_build_object('kind', 'coverage_measurement', 'id', p.measurement_id, 'role', 'excluded',
                'reason', format('the actual coverage is %s, not measured', p.state), 'detail', jsonb_build_object('source', p.source_key))
           WHEN p.e_id IS NULL OR p.e_state <> 'measured' OR p.e_value IS NULL THEN jsonb_build_object('kind', 'coverage_measurement', 'id', p.measurement_id, 'role', 'excluded',
                'reason', 'no measured expected coverage for the same window: no target to compare with', 'detail', jsonb_build_object('source', p.source_key))
           ELSE jsonb_build_object('kind', 'coverage_measurement', 'id', p.measurement_id, 'role', CASE WHEN p.value_numeric >= p.e_value THEN 'numerator' ELSE 'denominator' END,
                'detail', jsonb_build_object('source', p.source_key, 'actual', p.value_numeric, 'target', p.e_value, 'target_kind', 'coverage universe expected coverage',
                                             'window_start', p.window_start, 'window_end', p.window_end, 'expected_measurement', p.e_id)) END
         ORDER BY p.evaluated_at, p.measurement_id), '[]'::jsonb), max(p.evaluated_at) INTO v_recs, v_newest FROM paired p;
  IF NOT v_declared THEN
    v_reasons := v_reasons || to_jsonb('no approved coverage target exists in the product (no plan or contract declares a dimension or priority target): the coverage universe''s expected coverage is not an approved target unless the definition declares it so (params.expected_is_target)'::text);
  END IF;
  RETURN analytics.mcb_finish(jsonb_build_object('kind', 'rate', 'records', v_recs, 'reasons', v_reasons,
    'quality', jsonb_build_object('clock', 'record', 'target', CASE WHEN v_declared THEN 'declared by the definition: the coverage universe''s expected coverage is the approved target' ELSE 'none approved' END,
      'scope_rule', CASE WHEN p_scope IS NULL THEN 'the domain' ELSE 'the sources feeding the scope''s series or entities' END)), 'source', v_newest);
END $$;
REVOKE ALL ON FUNCTION analytics.mc_met011_coverage_attainment(uuid,uuid,timestamptz,timestamptz,timestamptz,jsonb,jsonb,jsonb) FROM PUBLIC;
SELECT analytics.register_computation('met011_coverage_attainment', 'analytics.mc_met011_coverage_attainment', 'rate', ARRAY['source'],
  ARRAY['observation.coverage_measurements', 'observation.source_contracts_current', 'prediction.series_registry'],
  'a source concerns the scope when it feeds a series of the scope''s series_keys or of an entity in its entity_ids; a NULL scope is the domain',
  'MET-011: measured actual coverage against its target; the product holds no approved coverage target — indeterminate unless the definition declares the coverage universe''s expected coverage the target', '0113 §MCB');

/* MET-012 SOURCE FRESHNESS ATTAINMENT (rate; dimension source; App M: "expected arrivals within freshness contract"). READING —
   population: the EXPECTED ARRIVALS of scheduled sources in the window: each scheduled attempt (observation.scheduled_attempts — the
   scheduler firing on the approved contract's cadence) started in the window and finished at or before the as-of. Numerator: the attempt
   finished AND the source's previous successful arrival (if any) lies within the contract's freshness threshold of it
   (freshness_threshold_seconds of the attempt's contract version) — freshness kept. Denominator: a failed or refused attempt (no arrival)
   or an arrival after a gap beyond the threshold (freshness lost before it). An attempt whose contract declares no freshness threshold is
   excluded (no contract to attain). SCOPE: the scope's sources. */
CREATE OR REPLACE FUNCTION analytics.mc_met012_freshness_attainment(p_tenant uuid, p_domain uuid, p_from timestamptz, p_to timestamptz, p_as_of timestamptz, p_scope jsonb, p_cohort jsonb, p_params jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = analytics, observation, public, pg_catalog, pg_temp AS $$
DECLARE v_newest timestamptz; v_src uuid[] := analytics.mcb_scope_sources(p_tenant, p_domain, p_scope); v_key text := p_cohort ->> 'source'; v_cap int := analytics.mcb_cap(p_params); v_bound bigint; v_recs jsonb;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the scheduled arrivals of the domain''s sources (MET-012)');
  IF coalesce(p_params ->> 'clock', 'record') <> 'record' THEN RETURN analytics.mcb_clock_refused('rate', 'MET-012', 'an expected arrival is a scheduler''s attempt in record time', p_params); END IF;
  SELECT count(*) INTO v_bound FROM observation.scheduled_attempts a WHERE a.tenant_id = p_tenant AND a.domain_id = p_domain AND a.started_at >= p_from AND a.started_at < p_to AND a.finished_at <= p_as_of;
  IF v_bound > v_cap THEN RETURN analytics.mcb_over_cap('rate', 'MET-012', v_bound, v_cap, 'record'); END IF;
  WITH att AS (
    SELECT a.*, c.source_key, c.freshness_threshold_seconds AS thr,
           (SELECT max(p.finished_at) FROM observation.scheduled_attempts p WHERE p.source_id = a.source_id AND p.outcome = 'finished' AND p.finished_at < a.finished_at AND p.finished_at <= p_as_of) AS prev_ok
      FROM observation.scheduled_attempts a
      LEFT JOIN observation.source_contracts_current c ON c.source_id = a.source_id AND c.contract_version = a.contract_version
     WHERE a.tenant_id = p_tenant AND a.domain_id = p_domain AND a.started_at >= p_from AND a.started_at < p_to AND a.finished_at <= p_as_of
       AND (v_src IS NULL OR a.source_id = ANY (v_src)) AND (v_key IS NULL OR c.source_key = v_key))
  SELECT coalesce(jsonb_agg(CASE
           WHEN a.thr IS NULL THEN jsonb_build_object('kind', 'scheduled_attempt', 'id', a.attempt_id, 'role', 'excluded', 'reason', 'the source''s contract declares no freshness threshold: no contract to attain',
                                                     'detail', jsonb_build_object('source', a.source_key))
           WHEN a.outcome <> 'finished' THEN jsonb_build_object('kind', 'scheduled_attempt', 'id', a.attempt_id, 'role', 'denominator', 'reason', format('the expected arrival did not happen (%s)', a.outcome),
                                                     'detail', jsonb_build_object('source', a.source_key, 'threshold_seconds', a.thr))
           WHEN a.prev_ok IS NOT NULL AND extract(epoch FROM (a.finished_at - a.prev_ok)) > a.thr THEN
                jsonb_build_object('kind', 'scheduled_attempt', 'id', a.attempt_id, 'role', 'denominator', 'reason', 'arrived after a gap beyond the freshness threshold (freshness was lost before it)',
                                   'detail', jsonb_build_object('source', a.source_key, 'threshold_seconds', a.thr, 'gap_seconds', round(extract(epoch FROM (a.finished_at - a.prev_ok))::numeric, 3)))
           ELSE jsonb_build_object('kind', 'scheduled_attempt', 'id', a.attempt_id, 'role', 'numerator',
                                   'detail', jsonb_strip_nulls(jsonb_build_object('source', a.source_key, 'threshold_seconds', a.thr, 'gap_seconds', CASE WHEN a.prev_ok IS NOT NULL THEN round(extract(epoch FROM (a.finished_at - a.prev_ok))::numeric, 3) END))) END
         ORDER BY a.started_at, a.attempt_id), '[]'::jsonb), max(a.finished_at) INTO v_recs, v_newest FROM att a;
  RETURN analytics.mcb_finish(jsonb_build_object('kind', 'rate', 'records', v_recs, 'reasons', '[]'::jsonb,
    'quality', jsonb_build_object('clock', 'record', 'scope_rule', CASE WHEN p_scope IS NULL THEN 'the domain' ELSE 'the sources feeding the scope''s series or entities' END,
      'notes', jsonb_build_array('an expected arrival = a scheduler attempt on the approved contract''s cadence; an unscheduled (manual) collection is not an expected arrival'))), 'source', v_newest);
END $$;
REVOKE ALL ON FUNCTION analytics.mc_met012_freshness_attainment(uuid,uuid,timestamptz,timestamptz,timestamptz,jsonb,jsonb,jsonb) FROM PUBLIC;
SELECT analytics.register_computation('met012_freshness_attainment', 'analytics.mc_met012_freshness_attainment', 'rate', ARRAY['source'],
  ARRAY['observation.scheduled_attempts', 'observation.source_contracts_current', 'prediction.series_registry'],
  'a source concerns the scope when it feeds a series of the scope''s series_keys or of an entity in its entity_ids; a NULL scope is the domain',
  'MET-012: scheduled (expected) arrivals in the window that arrived within the approved contract''s freshness threshold', '0113 §MCB');

/* The coverage losses of a window (MET-013, MET-037): a source health event moving the source INTO degraded, failed or suspended from
   healthy, unknown or a first evaluation, evaluated in the window and recorded at or before the as-of. */
CREATE OR REPLACE FUNCTION analytics.mcb_losses(p_tenant uuid, p_domain uuid, p_from timestamptz, p_to timestamptz, p_as_of timestamptz, p_sources uuid[])
RETURNS TABLE (event_id uuid, source_id uuid, prior_state text, new_state text, evaluated_at timestamptz, recorded_at timestamptz, lag_class text)
LANGUAGE sql STABLE SET search_path = observation, pg_catalog, pg_temp AS $$
  SELECT h.event_id, h.source_id, h.prior_state, h.new_state, h.evaluated_at, h.recorded_at, h.lag_class
    FROM observation.source_health_events h
   WHERE h.tenant_id = p_tenant AND h.domain_id = p_domain AND h.evaluated_at >= p_from AND h.evaluated_at < p_to AND h.recorded_at <= p_as_of
     AND h.new_state IN ('degraded', 'failed', 'suspended') AND (h.prior_state IS NULL OR h.prior_state IN ('healthy', 'unknown'))
     AND (p_sources IS NULL OR h.source_id = ANY (p_sources))
$$;
REVOKE ALL ON FUNCTION analytics.mcb_losses(uuid, uuid, timestamptz, timestamptz, timestamptz, uuid[]) FROM PUBLIC;

/* MET-013 BLIND-SPOT DETECTION LATENCY (duration, seconds; App M: "time from coverage loss to visible declared blind spot"). READING —
   population: the COVERAGE LOSSES evaluated in the window (analytics.mcb_losses). Start: the loss's stored evaluation instant. End: the
   blind spot DECLARED — the earliest of the source's coverage-loss attention item (executive.attention_items, class source.coverage_loss,
   subject the source, created at or after the loss) and the first impact marker the loss set on a dependent record
   (observation.source_impact_markers.set_by_event) — at or before the as-of. A loss never declared by the as-of is EXCLUDED as censored and
   the median is INDETERMINATE when any loss is censored (an undeclared blind spot is the worst case, never dropped silently). SCOPE: the
   scope's sources. */
CREATE OR REPLACE FUNCTION analytics.mc_met013_blind_spot_latency(p_tenant uuid, p_domain uuid, p_from timestamptz, p_to timestamptz, p_as_of timestamptz, p_scope jsonb, p_cohort jsonb, p_params jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = analytics, observation, executive, public, pg_catalog, pg_temp AS $$
DECLARE v_newest timestamptz; v_src uuid[] := analytics.mcb_scope_sources(p_tenant, p_domain, p_scope); v_recs jsonb; v_cens int; v_reasons jsonb := '[]'::jsonb;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the coverage losses of the domain''s sources (MET-013)');
  IF coalesce(p_params ->> 'clock', 'record') <> 'record' THEN RETURN analytics.mcb_clock_refused('duration', 'MET-013', 'a coverage loss and its declaration happen in record time', p_params); END IF;
  WITH l AS (
    SELECT x.*, (SELECT min(i.created_at) FROM executive.attention_items i WHERE i.tenant_id = p_tenant AND i.domain_id = p_domain AND i.signal_class = 'source.coverage_loss'
                    AND i.subject_kind = 'source' AND i.subject_id = x.source_id AND i.created_at >= x.evaluated_at AND i.created_at <= p_as_of) AS item_at,
           (SELECT min(m.set_at) FROM observation.source_impact_markers m WHERE m.set_by_event = x.event_id AND m.set_at <= p_as_of) AS marker_at
      FROM analytics.mcb_losses(p_tenant, p_domain, p_from, p_to, p_as_of, v_src) x)
  SELECT coalesce(jsonb_agg(CASE WHEN coalesce(l.item_at, l.marker_at) IS NOT NULL THEN
             jsonb_build_object('kind', 'coverage_loss', 'id', l.event_id, 'role', 'included',
               'detail', jsonb_build_object('value', round(greatest(0, extract(epoch FROM (least(l.item_at, l.marker_at) - l.evaluated_at)))::numeric, 3), 'lost_at', l.evaluated_at,
                                            'declared_at', least(l.item_at, l.marker_at), 'declared_by', CASE WHEN l.marker_at IS NULL OR (l.item_at IS NOT NULL AND l.item_at <= l.marker_at) THEN 'attention item' ELSE 'impact marker' END,
                                            'transition', format('%s → %s', coalesce(l.prior_state, 'first evaluation'), l.new_state), 'lag_class', l.lag_class))
           ELSE jsonb_build_object('kind', 'coverage_loss', 'id', l.event_id, 'role', 'excluded', 'reason', 'censored: no declared blind spot (no coverage-loss item, no impact marker) as of the as-of',
                                   'detail', jsonb_build_object('lost_at', l.evaluated_at, 'transition', format('%s → %s', coalesce(l.prior_state, 'first evaluation'), l.new_state))) END
           ORDER BY l.evaluated_at, l.event_id), '[]'::jsonb),
         count(*) FILTER (WHERE coalesce(l.item_at, l.marker_at) IS NULL),
         max(l.evaluated_at)
    INTO v_recs, v_cens, v_newest FROM l;
  IF v_cens > 0 THEN v_reasons := v_reasons || to_jsonb(format('%s coverage loss(es) were never declared as of the as-of: the latency distribution is censored (an undeclared blind spot is the worst case)', v_cens)); END IF;
  RETURN analytics.mcb_finish(jsonb_build_object('kind', 'duration', 'records', v_recs, 'reasons', v_reasons,
    'quality', jsonb_build_object('clock', 'record', 'unit', 'seconds', 'censored', v_cens, 'scope_rule', CASE WHEN p_scope IS NULL THEN 'the domain' ELSE 'the sources feeding the scope''s series or entities' END)), 'declared_by', v_newest);
END $$;
REVOKE ALL ON FUNCTION analytics.mc_met013_blind_spot_latency(uuid,uuid,timestamptz,timestamptz,timestamptz,jsonb,jsonb,jsonb) FROM PUBLIC;
SELECT analytics.register_computation('met013_blind_spot_latency', 'analytics.mc_met013_blind_spot_latency', 'duration', ARRAY[]::text[],
  ARRAY['observation.source_health_events', 'executive.attention_items', 'observation.source_impact_markers', 'prediction.series_registry', 'observation.source_contracts_current'],
  'a source concerns the scope when it feeds a series of the scope''s series_keys or of an entity in its entity_ids; a NULL scope is the domain',
  'MET-013: seconds from a coverage loss to its declared blind spot (coverage-loss attention item or first impact marker); censored losses said', '0113 §MCB');

/* MET-014 SEARCH EVIDENCE USEFULNESS (rate; dimension query_class; App M: "reviewed searches yielding relevant decision-support
   evidence"). READING — population: the REVIEWED searches recorded in the window (analytics.search_reviews, a named human never the
   searcher), reviewed at or before the as-of. Numerator: verdict relevant. Unreviewed searches are not in the population (counted in
   quality). Never by person: the searcher is not read, the reviewer is not returned (D4). SCOPE: ignored — a search's subject is free text
   (stated). */
CREATE OR REPLACE FUNCTION analytics.mc_met014_search_usefulness(p_tenant uuid, p_domain uuid, p_from timestamptz, p_to timestamptz, p_as_of timestamptz, p_scope jsonb, p_cohort jsonb, p_params jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = analytics, executive, observation, public, pg_catalog, pg_temp AS $$
DECLARE v_newest timestamptz; v_class text := p_cohort ->> 'query_class'; v_recs jsonb; v_unrev int;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the reviewed searches of the domain (MET-014)');
  IF coalesce(p_params ->> 'clock', 'record') <> 'record' THEN RETURN analytics.mcb_clock_refused('rate', 'MET-014', 'a search and its review are recorded in record time', p_params); END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('kind', 'search_review', 'id', r.review_id, 'role', CASE WHEN r.verdict = 'relevant' THEN 'numerator' ELSE 'denominator' END,
                                               'detail', jsonb_build_object('search_id', s.search_id, 'query_class', r.query_class, 'hits', s.hits, 'reviewer_role', r.reviewer_role))
                            ORDER BY s.searched_at, r.review_id), '[]'::jsonb), max(s.searched_at) INTO v_recs, v_newest
    FROM analytics.search_reviews r JOIN executive.search_events s ON s.search_id = r.search_id
   WHERE r.tenant_id = p_tenant AND r.domain_id = p_domain AND s.searched_at >= p_from AND s.searched_at < p_to AND r.reviewed_at <= p_as_of
     AND (v_class IS NULL OR r.query_class = v_class);
  SELECT count(*) INTO v_unrev FROM executive.search_events s WHERE s.tenant_id = p_tenant AND s.domain_id = p_domain AND s.searched_at >= p_from AND s.searched_at < p_to AND s.searched_at <= p_as_of
     AND NOT EXISTS (SELECT 1 FROM analytics.search_reviews r WHERE r.search_id = s.search_id AND r.reviewed_at <= p_as_of);
  RETURN analytics.mcb_finish(jsonb_build_object('kind', 'rate', 'records', v_recs, 'reasons', '[]'::jsonb,
    'quality', jsonb_build_object('clock', 'record', 'unreviewed_searches', v_unrev, 'scope_rule', 'ignored: a search''s subject is free text',
      'notes', jsonb_build_array('role-level: no searcher and no reviewer is named or grouped; the reviewer is never the searcher (separation of duties at the review port)'))), 'query_class', v_newest);
END $$;
REVOKE ALL ON FUNCTION analytics.mc_met014_search_usefulness(uuid,uuid,timestamptz,timestamptz,timestamptz,jsonb,jsonb,jsonb) FROM PUBLIC;
SELECT analytics.register_computation('met014_search_usefulness', 'analytics.mc_met014_search_usefulness', 'rate', ARRAY['query_class'],
  ARRAY['analytics.search_reviews', 'executive.search_events'], 'ignored: a search''s subject is free text (no scope relation)',
  'MET-014: reviewed searches of the window whose results a named reviewer (never the searcher) judged relevant decision-support evidence', '0113 §MCB');

/* MET-017 GRAPH PROVENANCE VALIDITY (rate; dimension relationship_class; App M: "graph relationships resolving to admissible evidence and
   revision"). READING — population: the graph edges ASSERTED in the window, still canonical at the as-of (an edge retracted at or before
   the as-of is excluded: not canonical). Numerator: the edge's claim resolves to its exact version (the REVISION the edge rests on; the
   graph revision that committed it is named when there is one) and is not withdrawn, AND its evidence resolves by the edge's digest to
   stored, untombstoned bytes (admissible). The predicate is the relationship class. SCOPE: an edge concerns the scope when its subject or
   object entity is in the scope's entity_ids. edges_current is a CURRENT-state table: retraction instants are kept, so a replay is stable
   unless an edge row is re-asserted in place (stated). */
CREATE OR REPLACE FUNCTION analytics.mc_met017_edge_provenance_validity(p_tenant uuid, p_domain uuid, p_from timestamptz, p_to timestamptz, p_as_of timestamptz, p_scope jsonb, p_cohort jsonb, p_params jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = analytics, graph, objects, observation, public, pg_catalog, pg_temp AS $$
DECLARE v_newest timestamptz; v_class text := p_cohort ->> 'relationship_class'; v_cap int := analytics.mcb_cap(p_params); v_bound bigint; v_recs jsonb;
        v_ent text[] := CASE WHEN p_scope IS NULL THEN NULL ELSE ARRAY(SELECT jsonb_array_elements_text(coalesce(p_scope -> 'entity_ids', '[]'::jsonb))) END;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the provenance of the domain''s graph relationships (MET-017)');
  IF coalesce(p_params ->> 'clock', 'record') <> 'record' THEN RETURN analytics.mcb_clock_refused('rate', 'MET-017', 'an edge is asserted in record time', p_params); END IF;
  SELECT count(*) INTO v_bound FROM graph.edges_current e WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain AND e.asserted_at >= p_from AND e.asserted_at < p_to AND e.asserted_at <= p_as_of;
  IF v_bound > v_cap THEN RETURN analytics.mcb_over_cap('rate', 'MET-017', v_bound, v_cap, 'record'); END IF;
  WITH e AS (
    SELECT x.*, analytics.mcb_resolve(p_tenant, p_domain, 'claim:' || x.claim_object_id || '@' || x.claim_version, x.asserted_at, p_as_of) AS rc,
           analytics.mcb_resolve(p_tenant, p_domain, 'EVD:' || x.evidence_object_id, x.asserted_at, p_as_of, x.evidence_digest) AS re,
           (SELECT r.revision FROM graph.revision_items i JOIN graph.revisions r ON r.revision_id = i.revision_id WHERE i.kind = 'edge' AND i.ref_id = x.edge_id AND r.committed_at <= p_as_of
             ORDER BY r.revision LIMIT 1) AS graph_revision
      FROM graph.edges_current x
     WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.asserted_at >= p_from AND x.asserted_at < p_to AND x.asserted_at <= p_as_of
       AND (v_class IS NULL OR x.predicate = v_class)
       AND (v_ent IS NULL OR x.subject_entity_id::text = ANY (v_ent) OR x.object_entity_id::text = ANY (v_ent)))
  SELECT coalesce(jsonb_agg(CASE
           WHEN e.retracted_at IS NOT NULL AND e.retracted_at <= p_as_of THEN jsonb_build_object('kind', 'edge', 'id', e.edge_id, 'role', 'excluded', 'reason', 'retracted at or before the as-of: not canonical',
                                                     'detail', jsonb_build_object('relationship_class', e.predicate))
           ELSE jsonb_build_object('kind', 'edge', 'id', e.edge_id,
             'role', CASE WHEN (e.rc ->> 'resolved')::boolean AND (e.re ->> 'resolved')::boolean THEN 'numerator' ELSE 'denominator' END,
             'reason', CASE WHEN NOT (e.rc ->> 'resolved')::boolean THEN 'claim: ' || (e.rc ->> 'reason') WHEN NOT (e.re ->> 'resolved')::boolean THEN 'evidence: ' || (e.re ->> 'reason') END,
             'detail', jsonb_strip_nulls(jsonb_build_object('relationship_class', e.predicate, 'claim', format('%s@%s', e.claim_object_id, e.claim_version), 'evidence_version', e.re ->> 'version',
                                                            'mode', e.mode, 'graph_revision', e.graph_revision, 'tier', e.re ->> 'tier'))) END
         ORDER BY e.asserted_at, e.edge_id), '[]'::jsonb), max(e.asserted_at) INTO v_recs, v_newest FROM e;
  RETURN analytics.mcb_finish(jsonb_build_object('kind', 'rate', 'records', v_recs, 'reasons', '[]'::jsonb,
    'quality', jsonb_build_object('clock', 'record', 'scope_rule', CASE WHEN p_scope IS NULL THEN 'the domain' ELSE 'edges whose subject or object entity is in the scope' END,
      'replay_share', (SELECT round(count(*) FILTER (WHERE x -> 'detail' ->> 'mode' = 'replay')::numeric / nullif(count(*), 0), 6) FROM jsonb_array_elements(v_recs) x),
      'notes', jsonb_build_array('the revision an edge rests on = its claim''s exact version; the committing graph revision is named when the edge was committed through one'))), 'relationship_class', v_newest);
END $$;
REVOKE ALL ON FUNCTION analytics.mc_met017_edge_provenance_validity(uuid,uuid,timestamptz,timestamptz,timestamptz,jsonb,jsonb,jsonb) FROM PUBLIC;
SELECT analytics.register_computation('met017_edge_provenance_validity', 'analytics.mc_met017_edge_provenance_validity', 'rate', ARRAY['relationship_class'],
  ARRAY['graph.edges_current', 'graph.revision_items', 'graph.revisions', 'objects.canonical_objects', 'observation.blob_manifests', 'observation.blob_tombstones'],
  'an edge concerns the scope when its subject or object entity is in the scope''s entity_ids; a NULL scope is the domain',
  'MET-017: canonical edges asserted in the window whose claim version and evidence (by digest) resolve to admissible, stored records', '0113 §MCB');

/* MET-018 MEMORY RETRIEVAL VALIDITY (rate; dimension memory_class; App M: "retrieved memories current for as-of, permission, correction,
   and retention context"). READING — population: each memory ACCESS in the window (memory.item_access — one row per served version).
   Each is RE-JUDGED: (as-of) the served version is the version current at the read's as-of in RECORD time (the latest MEM version recorded
   at or before it; no as-of = the access instant) — the retrieval's own rule; (correction) the item was not withdrawn at or before that
   instant; (retention) its retain_until had not passed at that instant; (permission) the access names a purpose the item's audience
   admits (when it declares purposes) and an authorising policy decision. The memory class is the item's record_class. items_current is a
   CURRENT-state table (audience, retention) — stated. SCOPE: an item concerns the scope when its related objective is in objective_ids. */
CREATE OR REPLACE FUNCTION analytics.mc_met018_memory_retrieval_validity(p_tenant uuid, p_domain uuid, p_from timestamptz, p_to timestamptz, p_as_of timestamptz, p_scope jsonb, p_cohort jsonb, p_params jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = analytics, memory, objects, observation, public, pg_catalog, pg_temp AS $$
DECLARE v_newest timestamptz; v_class text := p_cohort ->> 'memory_class'; v_cap int := analytics.mcb_cap(p_params); v_bound bigint; v_recs jsonb;
        v_obj text[] := CASE WHEN p_scope IS NULL THEN NULL ELSE ARRAY(SELECT jsonb_array_elements_text(coalesce(p_scope -> 'objective_ids', '[]'::jsonb))) END;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the memory accesses of the domain (MET-018)');
  IF coalesce(p_params ->> 'clock', 'record') <> 'record' THEN RETURN analytics.mcb_clock_refused('rate', 'MET-018', 'a memory access is re-judged at its own record-time as-of', p_params); END IF;
  SELECT count(*) INTO v_bound FROM memory.item_access a WHERE a.tenant_id = p_tenant AND a.domain_id = p_domain AND a.accessed_at >= p_from AND a.accessed_at < p_to AND a.accessed_at <= p_as_of;
  IF v_bound > v_cap THEN RETURN analytics.mcb_over_cap('rate', 'MET-018', v_bound, v_cap, 'record'); END IF;
  WITH a AS (
    SELECT x.access_id, x.item_id, x.object_version, x.purpose_id, x.policy_decision_id, x.accessed_at, coalesce(x.read_as_of, x.accessed_at) AS at, x.read_as_of,
           i.record_class, i.audience_purposes, i.retain_until, i.related_objective_id
      FROM memory.item_access x JOIN memory.items_current i ON i.item_id = x.item_id
     WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.accessed_at >= p_from AND x.accessed_at < p_to AND x.accessed_at <= p_as_of
       AND (v_class IS NULL OR i.record_class = v_class) AND (v_obj IS NULL OR i.related_objective_id::text = ANY (v_obj))),
  j AS (
    SELECT a.*, (SELECT max(o.object_version) FROM objects.canonical_objects o WHERE o.object_id = a.item_id AND o.object_type = 'MEM' AND o.recorded_at <= a.at) AS current_version,
           (SELECT min(e.occurred_at) FROM memory.item_events e WHERE e.item_id = a.item_id AND e.event = 'memory.withdrawn' AND e.occurred_at <= a.at) AS withdrawn_at
      FROM a),
  judged AS (
    SELECT j.*, array_remove(ARRAY[
             CASE WHEN j.current_version IS NULL THEN format('version %s was served but no version was recorded at the read''s as-of', j.object_version)
                  WHEN j.current_version <> j.object_version THEN format('version %s was served; version %s was current at the read''s as-of', j.object_version, j.current_version) END,
             CASE WHEN j.withdrawn_at IS NOT NULL THEN format('the item was withdrawn at %s, before the read''s as-of', j.withdrawn_at) END,
             CASE WHEN j.retain_until IS NOT NULL AND j.retain_until <= j.at THEN 'served past its retention' END,
             CASE WHEN j.policy_decision_id IS NULL THEN 'no authorising policy decision is recorded for the access' END,
             CASE WHEN cardinality(coalesce(j.audience_purposes, '{}')) > 0 AND NOT (j.purpose_id = ANY (j.audience_purposes)) THEN format('the purpose %s is outside the item''s audience', j.purpose_id) END], NULL) AS v
      FROM j)
  SELECT coalesce(jsonb_agg(jsonb_build_object('kind', 'memory_access', 'id', x.access_id, 'role', CASE WHEN cardinality(x.v) = 0 THEN 'numerator' ELSE 'denominator' END,
                                               'reason', CASE WHEN cardinality(x.v) > 0 THEN array_to_string(x.v, '; ') END,
                                               'detail', jsonb_strip_nulls(jsonb_build_object('memory_class', x.record_class, 'item_id', x.item_id, 'version_served', x.object_version,
                                                                                              'version_current', x.current_version, 'read_as_of', x.read_as_of, 'purpose', x.purpose_id)))
                            ORDER BY x.accessed_at, x.access_id), '[]'::jsonb), max(x.accessed_at) INTO v_recs, v_newest FROM judged x;
  RETURN analytics.mcb_finish(jsonb_build_object('kind', 'rate', 'records', v_recs, 'reasons', '[]'::jsonb,
    'quality', jsonb_build_object('clock', 'record', 'scope_rule', CASE WHEN p_scope IS NULL THEN 'the domain' ELSE 'items whose related objective is in the scope' END,
      'notes', jsonb_build_array('the as-of is record time (the retrieval''s own rule: the version recorded at or before it)',
                                 'memory.items_current is a current-state table (audience, retention): a replay reports mismatch if they moved since'))), 'memory_class', v_newest);
END $$;
REVOKE ALL ON FUNCTION analytics.mc_met018_memory_retrieval_validity(uuid,uuid,timestamptz,timestamptz,timestamptz,jsonb,jsonb,jsonb) FROM PUBLIC;
SELECT analytics.register_computation('met018_memory_retrieval_validity', 'analytics.mc_met018_memory_retrieval_validity', 'rate', ARRAY['memory_class'],
  ARRAY['memory.item_access', 'memory.items_current', 'memory.item_events', 'objects.canonical_objects'],
  'a memory item concerns the scope when its related objective is in the scope''s objective_ids; a NULL scope is the domain',
  'MET-018: memory accesses of the window re-judged against the version current at their as-of, withdrawal, retention and purpose', '0113 §MCB');

/* MET-031 AGENT TASK SUCCESS (rate; dimensions agent_kind, task; App M: "bounded runs completing accepted outcome without authority, tool,
   or evidence violation"). READING — population: the agent runs FINISHED in the window (closed at or before the as-of). Denominator: a run
   that did not complete (faulted, refused, stopped) or that recorded a refusal (the product refused one of its acts — an authority, tool or
   evidence violation attempted) or escalated. Numerator: a clean, finished run whose outcome was ACCEPTED. ACCEPTANCE IS NOT RECORDED
   UNIFORMLY: the product records no acceptance of an agent's outcome as such. A clean run's acceptance is told only where the definition
   declares a task SELF-ACCEPTING (params.self_accepting_tasks — a bounded autonomous task whose completion is its accepted outcome,
   approved with the definition and labelled per record); every other clean run is EXCLUDED ("acceptance not recorded") and, when any is,
   the result is INDETERMINATE (a rate over failures and declared tasks alone would mislead). SCOPE: ignored — agent runs are domain
   operations (stated). */
CREATE OR REPLACE FUNCTION analytics.mc_met031_agent_task_success(p_tenant uuid, p_domain uuid, p_from timestamptz, p_to timestamptz, p_as_of timestamptz, p_scope jsonb, p_cohort jsonb, p_params jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = analytics, executive, observation, public, pg_catalog, pg_temp AS $$
DECLARE v_newest timestamptz; v_kind text := p_cohort ->> 'agent_kind'; v_task text := p_cohort ->> 'task'; v_cap int := analytics.mcb_cap(p_params); v_bound bigint; v_recs jsonb; v_untold int; v_tasks text;
        v_self text[] := ARRAY(SELECT jsonb_array_elements_text(CASE WHEN jsonb_typeof(p_params -> 'self_accepting_tasks') = 'array' THEN p_params -> 'self_accepting_tasks' ELSE '[]'::jsonb END));
        v_reasons jsonb := '[]'::jsonb;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the agent runs of the domain (MET-031)');
  IF coalesce(p_params ->> 'clock', 'record') <> 'record' THEN RETURN analytics.mcb_clock_refused('rate', 'MET-031', 'an agent run is closed in record time', p_params); END IF;
  SELECT count(*) INTO v_bound FROM executive.agent_runs r WHERE r.tenant_id = p_tenant AND r.domain_id = p_domain AND r.finished_at >= p_from AND r.finished_at < p_to AND r.finished_at <= p_as_of
     AND (v_kind IS NULL OR r.agent_kind = v_kind) AND (v_task IS NULL OR r.task = v_task);
  IF v_bound > v_cap THEN RETURN analytics.mcb_over_cap('rate', 'MET-031', v_bound, v_cap, 'record'); END IF;
  WITH r AS (
    SELECT x.run_id, x.agent_kind, x.task, x.outcome, x.stop_reason, x.escalated_to, jsonb_array_length(coalesce(x.refusals, '[]'::jsonb)) AS refusals, x.finished_at,
           CASE WHEN coalesce(x.outcome, '') <> 'finished' THEN format('the run did not complete (%s)', coalesce(x.outcome, 'no outcome'))
                WHEN jsonb_array_length(coalesce(x.refusals, '[]'::jsonb)) > 0 THEN format('%s of its acts were refused (an authority, tool or evidence violation attempted)', jsonb_array_length(x.refusals))
                WHEN x.escalated_to IS NOT NULL THEN 'it escalated instead of completing' END AS failure
      FROM executive.agent_runs x
     WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.finished_at >= p_from AND x.finished_at < p_to AND x.finished_at <= p_as_of
       AND (v_kind IS NULL OR x.agent_kind = v_kind) AND (v_task IS NULL OR x.task = v_task))
  SELECT coalesce(jsonb_agg(CASE
           WHEN r.failure IS NOT NULL THEN jsonb_build_object('kind', 'agent_run', 'id', r.run_id, 'role', 'denominator', 'reason', r.failure, 'detail', jsonb_build_object('agent_kind', r.agent_kind, 'task', r.task, 'outcome', r.outcome))
           WHEN r.task = ANY (v_self) THEN jsonb_build_object('kind', 'agent_run', 'id', r.run_id, 'role', 'numerator',
                                                             'detail', jsonb_build_object('agent_kind', r.agent_kind, 'task', r.task, 'outcome', r.outcome, 'acceptance', 'declared by the definition: completion is this task''s accepted outcome'))
           ELSE jsonb_build_object('kind', 'agent_run', 'id', r.run_id, 'role', 'excluded', 'reason', format('acceptance not recorded: the product records no acceptance of a %s run''s outcome', r.task),
                                   'detail', jsonb_build_object('agent_kind', r.agent_kind, 'task', r.task, 'outcome', r.outcome)) END
         ORDER BY r.finished_at, r.run_id), '[]'::jsonb),
         count(*) FILTER (WHERE r.failure IS NULL AND NOT (r.task = ANY (v_self))),
         string_agg(DISTINCT r.task, ', ' ORDER BY r.task) FILTER (WHERE r.failure IS NULL AND NOT (r.task = ANY (v_self))),
         max(r.finished_at)
    INTO v_recs, v_untold, v_tasks, v_newest FROM r;
  IF v_untold > 0 THEN
    v_reasons := v_reasons || to_jsonb(format('acceptance cannot be told for %s clean run(s) (tasks: %s): the product records no uniform acceptance of an agent''s outcome — a rate over failures and declared tasks alone would mislead', v_untold, v_tasks));
  END IF;
  RETURN analytics.mcb_finish(jsonb_build_object('kind', 'rate', 'records', v_recs, 'reasons', v_reasons,
    'quality', jsonb_build_object('clock', 'record', 'acceptance_untold', v_untold, 'self_accepting_tasks', to_jsonb(v_self), 'scope_rule', 'ignored: agent runs are domain operations')), 'task', v_newest);
END $$;
REVOKE ALL ON FUNCTION analytics.mc_met031_agent_task_success(uuid,uuid,timestamptz,timestamptz,timestamptz,jsonb,jsonb,jsonb) FROM PUBLIC;
SELECT analytics.register_computation('met031_agent_task_success', 'analytics.mc_met031_agent_task_success', 'rate', ARRAY['agent_kind', 'task'],
  ARRAY['executive.agent_runs'], 'ignored: agent runs are operations of the domain (no scope relation)',
  'MET-031: agent runs finished in the window completing without refusal, escalation or fault with an accepted outcome — acceptance told only for tasks the definition declares self-accepting; otherwise indeterminate, said', '0113 §MCB');

/* MET-033 AGENT TRACE CLOSURE (rate; dimension agent_kind; App M: "runs with complete identity, context, model, tool, action, checkpoint,
   and outcome trace"). READING — population: the agent runs finished in the window. Per run, the trace vector the product CAN tell:
   identity (agent, principal, version, code digest), context (the trigger and its reference, room or package), action (outputs recorded),
   outcome (the outcome and its closing instant). The product records NO model, tool-call or checkpoint trace of an agent run (no gateway
   call is linked to an agent run; the tool gateway and checkpoints arrive with B70 / B71): those three fields cannot be told, so the
   result is INDETERMINATE (said, never 0). Each record still shows which recorded fields are present (numerator: all recorded fields
   present). SCOPE: ignored (domain operations, stated). */
CREATE OR REPLACE FUNCTION analytics.mc_met033_agent_trace_closure(p_tenant uuid, p_domain uuid, p_from timestamptz, p_to timestamptz, p_as_of timestamptz, p_scope jsonb, p_cohort jsonb, p_params jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = analytics, executive, observation, public, pg_catalog, pg_temp AS $$
DECLARE v_newest timestamptz; v_kind text := p_cohort ->> 'agent_kind'; v_cap int := analytics.mcb_cap(p_params); v_bound bigint; v_recs jsonb;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the agent run traces of the domain (MET-033)');
  IF coalesce(p_params ->> 'clock', 'record') <> 'record' THEN RETURN analytics.mcb_clock_refused('rate', 'MET-033', 'an agent run is closed in record time', p_params); END IF;
  SELECT count(*) INTO v_bound FROM executive.agent_runs r WHERE r.tenant_id = p_tenant AND r.domain_id = p_domain AND r.finished_at >= p_from AND r.finished_at < p_to AND r.finished_at <= p_as_of
     AND (v_kind IS NULL OR r.agent_kind = v_kind);
  IF v_bound > v_cap THEN RETURN analytics.mcb_over_cap('rate', 'MET-033', v_bound, v_cap, 'record'); END IF;
  WITH r AS (
    SELECT x.run_id, x.agent_kind, x.finished_at,
           (x.agent_id IS NOT NULL AND x.principal_id IS NOT NULL AND btrim(x.agent_version) <> '' AND btrim(x.code_digest) <> '') AS identity,
           (btrim(x.trigger_kind) <> '' AND (x.trigger_ref IS NOT NULL OR x.room_id IS NOT NULL OR x.package_id IS NOT NULL)) AS context,
           (x.outputs IS NOT NULL AND x.outputs <> '{}'::jsonb) AS action,
           (x.outcome IS NOT NULL AND x.finished_at IS NOT NULL) AS outcome
      FROM executive.agent_runs x
     WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.finished_at >= p_from AND x.finished_at < p_to AND x.finished_at <= p_as_of AND (v_kind IS NULL OR x.agent_kind = v_kind))
  SELECT coalesce(jsonb_agg(jsonb_build_object('kind', 'agent_run', 'id', r.run_id, 'role', CASE WHEN r.identity AND r.context AND r.action AND r.outcome THEN 'numerator' ELSE 'denominator' END,
             'reason', CASE WHEN NOT (r.identity AND r.context AND r.action AND r.outcome) THEN 'missing ' || array_to_string(array_remove(ARRAY[CASE WHEN NOT r.identity THEN 'identity' END,
                        CASE WHEN NOT r.context THEN 'context' END, CASE WHEN NOT r.action THEN 'action' END, CASE WHEN NOT r.outcome THEN 'outcome' END], NULL), ', ') END,
             'detail', jsonb_build_object('agent_kind', r.agent_kind, 'trace', jsonb_build_object('identity', r.identity, 'context', r.context, 'action', r.action, 'outcome', r.outcome,
                                          'model', 'not recorded', 'tool', 'not recorded', 'checkpoint', 'not recorded')))
           ORDER BY r.finished_at, r.run_id), '[]'::jsonb), max(r.finished_at) INTO v_recs, v_newest FROM r;
  RETURN analytics.mcb_finish(jsonb_build_object('kind', 'rate', 'records', v_recs,
    'reasons', CASE WHEN jsonb_array_length(v_recs) > 0 THEN jsonb_build_array('the product records no model, tool-call or checkpoint trace of an agent run (the tool gateway and checkpoints arrive with B70/B71): trace closure cannot be told — the recorded fields are shown per run') ELSE '[]'::jsonb END,
    'quality', jsonb_build_object('clock', 'record', 'fields_recorded', jsonb_build_array('identity', 'context', 'action', 'outcome'), 'fields_unrecorded', jsonb_build_array('model', 'tool', 'checkpoint'),
      'scope_rule', 'ignored: agent runs are domain operations')), 'agent_kind', v_newest);
END $$;
REVOKE ALL ON FUNCTION analytics.mc_met033_agent_trace_closure(uuid,uuid,timestamptz,timestamptz,timestamptz,jsonb,jsonb,jsonb) FROM PUBLIC;
SELECT analytics.register_computation('met033_agent_trace_closure', 'analytics.mc_met033_agent_trace_closure', 'rate', ARRAY['agent_kind'],
  ARRAY['executive.agent_runs'], 'ignored: agent runs are operations of the domain (no scope relation)',
  'MET-033: agent runs of the window with a complete trace — indeterminate while the product records no model, tool or checkpoint trace (said; the recorded fields shown per run)', '0113 §MCB');

/* MET-036 PRODUCT AVAILABILITY (rate; dimension capability; App M: "successful safe product outcomes over eligible demand"). READING
   (defined here from the audit chain): ELIGIBLE DEMAND = the API requests of the window (audit.audit_events `api.request`) that the policy
   decision point ADMITTED (an outcome other than `denied`: a request refused for authority, scope or entitlement is not eligible demand —
   counted in quality). A SAFE PRODUCT OUTCOME = the request succeeded (`success`; a degraded but declared answer — EYE-DEG-001 — counts,
   flagged). UNAVAILABLE = a failure of the product's own (integrity EYE-INT, dependency EYE-DEP, model EYE-MDL, capacity EYE-CAP, audit
   EYE-AUD, external effect EYE-EXT, reconciliation EYE-RCV, deadline EYE-WFL-003, degraded refusal EYE-DEG, or an unclassified code).
   A GOVERNED REFUSAL of the request (request, state, temporal, provenance, quality, workflow, authority-in-port, agent, governance,
   entitlement, tenancy codes) is the product answering safely an unsatisfiable request: EXCLUDED from eligible demand, said per record.
   The capability is the action's first segment (`decision`, `prediction` …). Records name the request (partition#sequence) and its action
   and code — never the actor. SCOPE: ignored — availability is the service's (stated). */
CREATE OR REPLACE FUNCTION analytics.mc_met036_product_availability(p_tenant uuid, p_domain uuid, p_from timestamptz, p_to timestamptz, p_as_of timestamptz, p_scope jsonb, p_cohort jsonb, p_params jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = analytics, audit, observation, public, pg_catalog, pg_temp AS $$
DECLARE v_newest timestamptz; v_cap_key text := p_cohort ->> 'capability'; v_cap int := analytics.mcb_cap(p_params); v_bound bigint; v_denied bigint; v_recs jsonb;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the request outcomes of the domain (MET-036)');
  IF coalesce(p_params ->> 'clock', 'record') <> 'record' THEN RETURN analytics.mcb_clock_refused('rate', 'MET-036', 'a request is served in record time', p_params); END IF;
  SELECT count(*) FILTER (WHERE a.outcome <> 'denied'), count(*) FILTER (WHERE a.outcome = 'denied') INTO v_bound, v_denied
    FROM audit.audit_events a WHERE a.tenant_id = p_tenant AND a.domain_id = p_domain AND a.event_type = 'api.request' AND a.created_at >= p_from AND a.created_at < p_to AND a.created_at <= p_as_of
     AND (v_cap_key IS NULL OR split_part(a.action, '.', 1) = v_cap_key);
  IF v_bound > v_cap THEN RETURN analytics.mcb_over_cap('rate', 'MET-036', v_bound, v_cap, 'record'); END IF;
  WITH q AS (
    SELECT a.partition_id, a.audit_seq, a.action, a.outcome, a.result_code, a.created_at, split_part(a.action, '.', 1) AS capability,
           CASE WHEN a.outcome = 'success' THEN 'safe'
                WHEN coalesce(a.result_code, '') ~ '^EYE[-_](INT|DEP|MDL|CAP|AUD|EXT|RCV|DEG)[-_]' OR coalesce(a.result_code, '') ~ '^EYE[-_]WFL[-_]003$' THEN 'unavailable'
                WHEN coalesce(a.result_code, '') ~ '^EYE[-_](REQ|STA|TMP|PRV|QUA|WFL|AUT|AGT|GOV|ENT|TEN|IDN)[-_]' THEN 'governed_refusal'
                ELSE 'unavailable' END AS class
      FROM audit.audit_events a
     WHERE a.tenant_id = p_tenant AND a.domain_id = p_domain AND a.event_type = 'api.request' AND a.outcome <> 'denied' AND a.created_at >= p_from AND a.created_at < p_to AND a.created_at <= p_as_of
       AND (v_cap_key IS NULL OR split_part(a.action, '.', 1) = v_cap_key))
  SELECT coalesce(jsonb_agg(jsonb_build_object('kind', 'request', 'id', q.partition_id || '#' || q.audit_seq,
             'role', CASE q.class WHEN 'safe' THEN 'numerator' WHEN 'unavailable' THEN 'denominator' ELSE 'excluded' END,
             'reason', CASE q.class WHEN 'unavailable' THEN format('the product failed the request (%s)', coalesce(q.result_code, 'no code'))
                                    WHEN 'governed_refusal' THEN format('a governed refusal (%s): the product answered an unsatisfiable request safely — not eligible demand for a successful outcome', q.result_code) END,
             'detail', jsonb_strip_nulls(jsonb_build_object('capability', q.capability, 'action', q.action, 'result_code', q.result_code,
                                                            'degraded', CASE WHEN q.class = 'safe' AND coalesce(q.result_code, '') ~ '^EYE[-_]DEG' THEN true END)))
           ORDER BY q.created_at, q.partition_id, q.audit_seq), '[]'::jsonb), max(q.created_at) INTO v_recs, v_newest FROM q;
  RETURN analytics.mcb_finish(jsonb_build_object('kind', 'rate', 'records', v_recs, 'reasons', '[]'::jsonb,
    'quality', jsonb_build_object('clock', 'record', 'denied_not_eligible', v_denied, 'scope_rule', 'ignored: availability is the service''s',
      'degraded_share', (SELECT round(count(*) FILTER (WHERE (x -> 'detail' ->> 'degraded')::boolean)::numeric / nullif(count(*) FILTER (WHERE x ->> 'role' = 'numerator'), 0), 6) FROM jsonb_array_elements(v_recs) x),
      'notes', jsonb_build_array('eligible demand = requests the policy decision point admitted; a governed refusal is excluded (the product answered safely)',
                                 'the capability is the action''s first segment'))), 'capability', v_newest);
END $$;
REVOKE ALL ON FUNCTION analytics.mc_met036_product_availability(uuid,uuid,timestamptz,timestamptz,timestamptz,jsonb,jsonb,jsonb) FROM PUBLIC;
SELECT analytics.register_computation('met036_product_availability', 'analytics.mc_met036_product_availability', 'rate', ARRAY['capability'],
  ARRAY['audit.audit_events'], 'ignored: availability is a property of the service (no scope relation)',
  'MET-036: requests the policy decision point admitted in the window that the product served successfully (degraded answers flagged); governed refusals excluded, failures counted', '0113 §MCB');

/* MET-037 DEGRADED-MODE DECLARATION LATENCY (duration, seconds; App M: "time from qualifying condition to accurate user-visible product
   state"). READING — population: the QUALIFYING CONDITIONS of the window that reached products: each coverage loss (analytics.mcb_losses)
   that set impact markers on dependent records (forecasts, warnings, packages, scenarios, runs, assumptions). Start: the loss's stored
   evaluation instant. End: THE USER-VISIBLE INSTANT = the marker's set_at (the marker is what a product's reader sees); "accurate" = every
   dependent the loss marked shows it — the LATEST set_at of the markers that loss set. A loss that marked no dependent is excluded (no
   product state to declare); a product degraded by a person's act (products.product_events product.degraded) has no recorded qualifying
   condition and is counted in quality, not measured. (MET-013 measures the declaration to humans; MET-037 the product's own state.)
   SCOPE: the scope's sources. */
CREATE OR REPLACE FUNCTION analytics.mc_met037_degraded_declaration_latency(p_tenant uuid, p_domain uuid, p_from timestamptz, p_to timestamptz, p_as_of timestamptz, p_scope jsonb, p_cohort jsonb, p_params jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = analytics, observation, products, public, pg_catalog, pg_temp AS $$
DECLARE v_newest timestamptz; v_src uuid[] := analytics.mcb_scope_sources(p_tenant, p_domain, p_scope); v_recs jsonb; v_human bigint;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the degraded declarations of the domain''s products (MET-037)');
  IF coalesce(p_params ->> 'clock', 'record') <> 'record' THEN RETURN analytics.mcb_clock_refused('duration', 'MET-037', 'a condition and its user-visible state happen in record time', p_params); END IF;
  WITH l AS (
    SELECT x.*, (SELECT max(m.set_at) FROM observation.source_impact_markers m WHERE m.set_by_event = x.event_id AND m.set_at <= p_as_of) AS visible_at,
           (SELECT count(*) FROM observation.source_impact_markers m WHERE m.set_by_event = x.event_id AND m.set_at <= p_as_of) AS marked,
           (SELECT jsonb_agg(DISTINCT m.subject_kind) FROM observation.source_impact_markers m WHERE m.set_by_event = x.event_id AND m.set_at <= p_as_of) AS kinds
      FROM analytics.mcb_losses(p_tenant, p_domain, p_from, p_to, p_as_of, v_src) x)
  SELECT coalesce(jsonb_agg(CASE WHEN l.visible_at IS NOT NULL THEN
             jsonb_build_object('kind', 'coverage_loss', 'id', l.event_id, 'role', 'included',
               'detail', jsonb_build_object('value', round(greatest(0, extract(epoch FROM (l.visible_at - l.evaluated_at)))::numeric, 3), 'condition_at', l.evaluated_at, 'visible_at', l.visible_at,
                                            'products_marked', l.marked, 'product_kinds', l.kinds))
           ELSE jsonb_build_object('kind', 'coverage_loss', 'id', l.event_id, 'role', 'excluded', 'reason', 'the condition marked no dependent product (no product state to declare)',
                                   'detail', jsonb_build_object('condition_at', l.evaluated_at)) END
           ORDER BY l.evaluated_at, l.event_id), '[]'::jsonb), max(l.evaluated_at) INTO v_recs, v_newest FROM l;
  SELECT count(*) INTO v_human FROM products.product_events e WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain AND e.event = 'product.degraded' AND e.occurred_at >= p_from AND e.occurred_at < p_to AND e.occurred_at <= p_as_of;
  RETURN analytics.mcb_finish(jsonb_build_object('kind', 'duration', 'records', v_recs, 'reasons', '[]'::jsonb,
    'quality', jsonb_build_object('clock', 'record', 'unit', 'seconds', 'products_degraded_by_a_person', v_human,
      'scope_rule', CASE WHEN p_scope IS NULL THEN 'the domain' ELSE 'the sources feeding the scope''s series or entities' END,
      'notes', jsonb_build_array('the user-visible instant is the impact marker''s set_at; accurate = every dependent the condition marked shows it (the latest marker)',
                                 'a product degraded by a person''s act has no recorded qualifying condition: counted, not measured'))), 'role', v_newest);
END $$;
REVOKE ALL ON FUNCTION analytics.mc_met037_degraded_declaration_latency(uuid,uuid,timestamptz,timestamptz,timestamptz,jsonb,jsonb,jsonb) FROM PUBLIC;
SELECT analytics.register_computation('met037_degraded_declaration_latency', 'analytics.mc_met037_degraded_declaration_latency', 'duration', ARRAY[]::text[],
  ARRAY['observation.source_health_events', 'observation.source_impact_markers', 'products.product_events', 'prediction.series_registry', 'observation.source_contracts_current'],
  'a source concerns the scope when it feeds a series of the scope''s series_keys or of an entity in its entity_ids; a NULL scope is the domain',
  'MET-037: seconds from a qualifying condition (a coverage loss) to the last impact marker it set on dependent products (the user-visible state)', '0113 §MCB');

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §CO — the standing evaluation, cohort comparison, governed semantic objects, cost reconciliation (PR-70-005, PR-70-006, AT-70; DP-44-001, DP-44-006)
-- (folded at integration from the part-local file 0113_b92_x_co.sql, unchanged but for the integrator's marked lines; apply order §0, §MD, §MCA, §MCB, §CO, §UX, §OR, §I)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0113 §CO — CP-6 B92 part `comparability` (2026-10-12): COMPARABILITY, UNCERTAINTY IN USE, THE STANDING EVALUATION, COST RECONCILIATION AND
-- THE ACCEPTANCE FIXTURES (F-P7-F-03: V8 ch.70 PR-70-005, PR-70-006, AT-70; the B90 residuals DP-44-001 cohorts / relationships / analytical
-- models as governed semantic objects and DP-44-006 the exposure-EUR fixture — the fixture itself is the harness's).
--
-- Applies ALONE on top of 0001–0112 and the prelude (0113 §0). Forward-only; the prelude and 0001–0112 untouched. Re-declared here (and ONLY
-- here — DESIGN/PARTS §CO): the prelude's two hooks analytics.evaluate_result and analytics.after_result, each copied whole from the prelude
-- (0113 §0.7) and replaced by the body marked `-- B92 co`.
--
--   §CO.1 THE TABLES      analytics.computation_costs (the meter of every computation: records read, compute ms — B91's dimension vocabulary is
--                         a closed CHECK on commercial.usage_records, so no B91 meter is registered here: the cost is this ledger's and the
--                         reconciliation compares it with B91's) · analytics.comparisons (append-only) · analytics.reconciliations
--                         (append-only) · products.semantic_objects / semantic_object_versions / semantic_object_certifications (DP-44-001)
--   §CO.2 THE HELPERS     the breach rule (the compute body's, as a function), the semantic projection of a definition, Newcombe's interval,
--                         a safe instant cast
--   §CO.3 HOOK 1          analytics.evaluate_result — THE STANDING EVALUATION (PR-70-005): stale, incomplete, biased, non-comparable, gamed,
--                         privacy, outcome-detached; each failing check is a REASON (→ indeterminate) and a listed check
--   §CO.4 HOOK 2          analytics.after_result — the meter; a determinate BREACH raised as a REVIEW (analytics.metric, never an automatic
--                         decision); an unsafe evaluation raised (analytics.privacy / analytics.metric) and closed when the metric recovers
--   §CO.5 COMPARISON      analytics.compare_results [analytics.comparison.run] + the reads
--   §CO.6 SEMANTIC OBJECTS products.semantic_declare [products.semantic.declare] · products.semantic_certify [products.semantic.certify] ·
--                         products.semantic_withdraw [products.semantic.withdraw] + the reads (DP-44-001)
--   §CO.7 RECONCILIATION  analytics.reconcile_costs [analytics.reconciliation.run] + the reads (PR-70-006, D15)
--
-- THE CLAIMS (three different things, never confused): SOFTWARE CAPABILITY — what these functions do, proven by the part harness on
-- SYNTHETIC rows; SYNTHETIC DEMONSTRATION — the act on NORDWERK's synthetic records; REAL-PROVIDER / SIGNED ACCEPTANCE — AT-70's and
-- PR-70-006's named-authority acceptance record is R2's, not built here.
-- Refusal nouns (apps/api/src/analytics/seams.ts): `cohort comparison`, `semantic object`, `cost reconciliation` — rows central (B92 §0).
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- §CO.1 THE TABLES ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* THE COMPUTATION METER (PR-70-006, D15): one row per written result (a computation, a replay, a preview) — the records it read (the records
   the result rests on: what the computation returned, not the rows the planner scanned — stated), the compute time (the database clock from
   the start of the statement that called the compute or replay port to the after-result step — stated), the definition's cost allocation.
   Written by HOOK 2 only (definer); append-only. */
CREATE TABLE analytics.computation_costs (
  result_id           uuid PRIMARY KEY REFERENCES analytics.metric_results (result_id),
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  metric_key          text NOT NULL,
  definition_version  int  NOT NULL,
  computation_key     text,
  computation_version int,
  rows_read           int  NOT NULL CHECK (rows_read >= 0),
  compute_ms          numeric NOT NULL CHECK (compute_ms >= 0),
  replay              boolean NOT NULL,
  preview             boolean NOT NULL,
  cost_allocation     jsonb NOT NULL DEFAULT '{}'::jsonb,
  measured_by         text NOT NULL,
  computed_by_kind    text NOT NULL,
  recorded_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT acc_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX acc_window ON analytics.computation_costs (tenant_id, domain_id, recorded_at);

/* THE COHORT COMPARISONS (PR-70-005 Interpretation control; DP-44-001's "cohort comparison"): two results of one metric — two cohorts or two
   periods — compared WITH uncertainty, or INDETERMINATE with the reasons it cannot be. Append-only. */
CREATE TABLE analytics.comparisons (
  comparison_id     uuid PRIMARY KEY,
  scope             text NOT NULL,
  tenant_id         uuid NOT NULL,
  domain_id         uuid NOT NULL,
  metric_key        text NOT NULL,
  result_a          uuid NOT NULL REFERENCES analytics.metric_results (result_id),
  result_b          uuid NOT NULL REFERENCES analytics.metric_results (result_id),
  cohort_object_a   jsonb,
  cohort_object_b   jsonb,
  kind              text NOT NULL,
  state             text NOT NULL CHECK (state IN ('determinate', 'indeterminate')),
  estimate          numeric,
  interval          jsonb,
  method            text,
  claim             text NOT NULL CHECK (length(btrim(claim)) >= 8),
  sides             jsonb NOT NULL CHECK (jsonb_typeof(sides) = 'object'),
  composition       jsonb NOT NULL DEFAULT '{}'::jsonb,
  comparability     jsonb NOT NULL DEFAULT '{}'::jsonb,
  reasons           jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(reasons) = 'array'),
  digest            text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  run_by            uuid NOT NULL,
  run_by_kind       text NOT NULL,
  run_at            timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id    uuid NOT NULL,
  CONSTRAINT acp_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT acp_two CHECK (result_a <> result_b),
  CONSTRAINT acp_state CHECK ((state = 'determinate') = (estimate IS NOT NULL) AND (state = 'determinate' OR jsonb_array_length(reasons) >= 1))
);
CREATE INDEX acp_metric ON analytics.comparisons (tenant_id, domain_id, metric_key, run_at DESC);

/* THE COST RECONCILIATIONS (PR-70-006, D15): this ledger's computations of a period against B91's metered usage and its priced cost entries —
   matched | unpriced | discrepant units named one by one; `empty` when the period holds no computation; NEVER a silent pass. Append-only. */
CREATE TABLE analytics.reconciliations (
  reconciliation_id uuid PRIMARY KEY,
  scope             text NOT NULL,
  tenant_id         uuid NOT NULL,
  domain_id         uuid NOT NULL,
  period_key        text NOT NULL,
  window_from       timestamptz NOT NULL,
  window_to         timestamptz NOT NULL,
  tolerance         numeric NOT NULL CHECK (tolerance >= 0 AND tolerance <= 1),
  outcome           text NOT NULL CHECK (outcome IN ('matched', 'unpriced', 'discrepant', 'empty')),
  units             jsonb NOT NULL CHECK (jsonb_typeof(units) = 'array'),
  counts            jsonb NOT NULL CHECK (jsonb_typeof(counts) = 'object'),
  totals            jsonb NOT NULL CHECK (jsonb_typeof(totals) = 'object'),
  reasons           jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(reasons) = 'array'),
  digest            text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  run_by            uuid NOT NULL,
  run_at            timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id    uuid NOT NULL,
  CONSTRAINT arc_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT arc_window CHECK (window_to > window_from),
  CONSTRAINT arc_not_silent CHECK (outcome = 'matched' OR jsonb_array_length(reasons) >= 1)
);
CREATE INDEX arc_period ON analytics.reconciliations (tenant_id, domain_id, period_key, run_at DESC);

/* DP-44-001 — COHORTS, RELATIONSHIPS AND ANALYTICAL MODELS AS GOVERNED SEMANTIC OBJECTS of B90's layer (beside products.semantic_models):
   one row per object (its standing, the B90 semantic_models idiom; never deleted), its versions (append-only, digested), its certifications
   (the B90 metric_certifications idiom: the OWNER's act, an expiry ≤ 366 days, forward-only active → withdrawn | expired). The owner is a
   named human holding product_analytics_owner (CAP-DL-11's accountable owner, stated mapping); the declarer is a data steward or a product
   analyst; the owner never certifies a version they declared themselves (humans approve, never the proposer). */
CREATE TABLE products.semantic_objects (
  object_id          uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  object_key         text NOT NULL CHECK (object_key ~ '^[a-z][a-z0-9_.-]{2,62}$'),
  kind               text NOT NULL CHECK (kind IN ('cohort', 'relationship', 'analytical_model')),
  title              text NOT NULL CHECK (length(btrim(title)) BETWEEN 4 AND 200),
  owner_principal_id uuid NOT NULL,
  current_version    int  NOT NULL CHECK (current_version >= 1),
  certified_version  int,
  last_valid_version int,
  state              text NOT NULL DEFAULT 'declared' CHECK (state IN ('declared', 'certified', 'withdrawn', 'expired')),
  declared_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT pso_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT pso_key_per_domain UNIQUE (tenant_id, domain_id, object_key),
  CONSTRAINT pso_certified_bound CHECK ((state = 'certified') = (certified_version IS NOT NULL)),
  CONSTRAINT pso_last_valid CHECK (state = 'declared' OR last_valid_version IS NOT NULL)
);
CREATE TRIGGER pso_no_delete BEFORE DELETE ON products.semantic_objects FOR EACH ROW EXECUTE FUNCTION products.no_delete();

CREATE TABLE products.semantic_object_versions (
  object_id        uuid NOT NULL REFERENCES products.semantic_objects (object_id),
  version          int  NOT NULL CHECK (version >= 1),
  tenant_id        uuid NOT NULL,
  domain_id        uuid NOT NULL,
  title            text NOT NULL,
  definition       jsonb NOT NULL CHECK (jsonb_typeof(definition) = 'object'),
  digest           text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  declared_by      uuid NOT NULL,
  declared_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id   uuid NOT NULL,
  PRIMARY KEY (object_id, version)
);
CREATE TRIGGER psov_append_only BEFORE UPDATE OR DELETE ON products.semantic_object_versions FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

CREATE TABLE products.semantic_object_certifications (
  certification_id  uuid PRIMARY KEY,
  object_id         uuid NOT NULL REFERENCES products.semantic_objects (object_id),
  tenant_id         uuid NOT NULL,
  domain_id         uuid NOT NULL,
  version           int  NOT NULL,
  digest            text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  certified_by      uuid NOT NULL,
  certified_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at        timestamptz NOT NULL,
  reason            text NOT NULL CHECK (length(btrim(reason)) >= 8),
  state             text NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'withdrawn', 'expired')),
  withdrawn_at      timestamptz,
  withdrawn_by      uuid,
  withdrawal_reason text,
  correlation_id    uuid NOT NULL,
  CONSTRAINT psoc_version FOREIGN KEY (object_id, version) REFERENCES products.semantic_object_versions (object_id, version),
  CONSTRAINT psoc_expiry CHECK (expires_at > certified_at AND expires_at <= certified_at + interval '366 days'),
  CONSTRAINT psoc_withdrawn_bound CHECK ((state = 'active') = (withdrawn_at IS NULL AND withdrawn_by IS NULL AND withdrawal_reason IS NULL))
);
CREATE INDEX psoc_object ON products.semantic_object_certifications (object_id, certified_at DESC);
/* A certification moves ONE way (active → withdrawn | expired, the triple set once; nothing else changes; never deleted) — 0095's idiom. */
CREATE OR REPLACE FUNCTION products.sob_certifications_forward() RETURNS trigger
SET search_path = products, pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'semantic object certifications are append-only: DELETE prohibited' USING ERRCODE = '2F002'; END IF;
  IF OLD.state <> 'active' OR NEW.state = 'active' OR NEW.withdrawn_at IS NULL OR NEW.withdrawn_by IS NULL OR NEW.withdrawal_reason IS NULL
     OR (to_jsonb(NEW) - 'state' - 'withdrawn_at' - 'withdrawn_by' - 'withdrawal_reason') <> (to_jsonb(OLD) - 'state' - 'withdrawn_at' - 'withdrawn_by' - 'withdrawal_reason') THEN
    RAISE EXCEPTION 'semantic object certification % is immutable; it moves once from active to withdrawn or expired', OLD.certification_id USING ERRCODE = '2F002';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER psoc_forward BEFORE UPDATE OR DELETE ON products.semantic_object_certifications FOR EACH ROW EXECUTE FUNCTION products.sob_certifications_forward();

CREATE TRIGGER acc_append_only BEFORE UPDATE OR DELETE ON analytics.computation_costs FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
CREATE TRIGGER acp_append_only BEFORE UPDATE OR DELETE ON analytics.comparisons FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
CREATE TRIGGER arc_append_only BEFORE UPDATE OR DELETE ON analytics.reconciliations FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

-- RLS and grants (the prelude's loop idiom): SELECT under domain isolation; no write grant — the definer ports and hook 2 write.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['computation_costs', 'comparisons', 'reconciliations'] LOOP
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
  FOREACH t IN ARRAY ARRAY['semantic_objects', 'semantic_object_versions', 'semantic_object_certifications'] LOOP
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

-- §CO.2 THE HELPERS (internal: REVOKE PUBLIC, granted to nobody unless said) ──────────────────────────────────────────────────────────────
/* The breach rule of the compute body (0113 §0.7, amc_compute) as a function: a band → outside it; a target → below it (higher) or above it
   (lower); anything else → NULL (no breach rule). */
CREATE OR REPLACE FUNCTION analytics.aco_breach(p_threshold jsonb, p_direction text, p_value numeric) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT CASE WHEN p_value IS NULL OR p_threshold IS NULL OR p_threshold = '{}'::jsonb THEN NULL
              WHEN p_threshold ? 'band' THEN p_value < (p_threshold -> 'band' ->> 0)::numeric OR p_value > (p_threshold -> 'band' ->> 1)::numeric
              WHEN p_threshold ? 'target' AND p_direction = 'higher' THEN p_value < (p_threshold ->> 'target')::numeric
              WHEN p_threshold ? 'target' AND p_direction = 'lower' THEN p_value > (p_threshold ->> 'target')::numeric
              ELSE NULL END
$$;
/* The SEMANTIC projection of a definition (what decides the value): two versions whose projections are equal compute the same quantity —
   their contract digests may differ in non-semantic fields only (title, meaning's wording, cadence, owner, action, retirement, serves,
   threshold, quality, cost allocation, source rows): THE COMPARABILITY RULE of the comparison (stated on every comparison). */
CREATE OR REPLACE FUNCTION analytics.aco_semantic(d analytics.metric_definitions) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = analytics, pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object('kind', d.kind, 'unit', d.unit, 'direction', d.direction, 'population', d.population, 'numerator', d.numerator, 'denominator', d.denominator,
                            'exclusions', d.exclusions, 'window_spec', d.window_spec, 'dimensions', to_jsonb(d.dimensions), 'privacy_class', d.privacy_class, 'k_min', d.k_min,
                            'floor_n', d.floor_n, 'computation_key', d.computation_key, 'params', d.params, 'supported', d.supported)
$$;
/* NEWCOMBE's hybrid score interval (method 10) of a difference of two proportions k1/n1 − k2/n2, from the two Wilson intervals (D6). */
CREATE OR REPLACE FUNCTION analytics.aco_newcombe(p_k1 numeric, p_n1 numeric, p_k2 numeric, p_n2 numeric) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path = analytics, pg_catalog, pg_temp AS $$
DECLARE w1 jsonb := analytics.wilson(p_k1, p_n1); w2 jsonb := analytics.wilson(p_k2, p_n2); p1 numeric; p2 numeric; l1 numeric; u1 numeric; l2 numeric; u2 numeric; dd numeric;
BEGIN
  IF w1 IS NULL OR w2 IS NULL THEN RETURN NULL; END IF;
  p1 := p_k1 / p_n1; p2 := p_k2 / p_n2; l1 := (w1 ->> 'lo')::numeric; u1 := (w1 ->> 'hi')::numeric; l2 := (w2 ->> 'lo')::numeric; u2 := (w2 ->> 'hi')::numeric; dd := p1 - p2;
  RETURN jsonb_build_object('method', 'newcombe_hybrid_score', 'level', 0.95, 'estimate', round(dd, 6),
                            'lo', round(greatest(-1, dd - sqrt(power(p1 - l1, 2) + power(u2 - p2, 2))), 6),
                            'hi', round(least(1, dd + sqrt(power(u1 - p1, 2) + power(p2 - l2, 2))), 6),
                            'a', w1 || jsonb_build_object('p', round(p1, 6), 'k', p_k1, 'n', p_n1), 'b', w2 || jsonb_build_object('p', round(p2, 6), 'k', p_k2, 'n', p_n2));
END $$;
/* An instant from jsonb text, NULL when it is none (a computation's quality is data, never trusted to parse). */
CREATE OR REPLACE FUNCTION analytics.aco_instant(p text) RETURNS timestamptz
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF p IS NULL OR p !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' THEN RETURN NULL; END IF;
  RETURN p::timestamptz;
EXCEPTION WHEN OTHERS THEN RETURN NULL;
END $$;
/* A number from jsonb, NULL when it is none. */
CREATE OR REPLACE FUNCTION analytics.aco_num(p jsonb) RETURNS numeric
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$ SELECT CASE WHEN jsonb_typeof(p) = 'number' THEN (p #>> '{}')::numeric END $$;
REVOKE ALL ON FUNCTION analytics.aco_semantic(analytics.metric_definitions), analytics.aco_instant(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION analytics.aco_breach(jsonb, text, numeric), analytics.aco_newcombe(numeric, numeric, numeric, numeric), analytics.aco_num(jsonb) TO eye_app, eye_commit;

-- §CO.3 HOOK 1 — THE STANDING EVALUATION ──────────────────────────────────────────────────────────────────────────────────────────────────
/* HOOK 1 — the standing evaluation of a draft result BEFORE it is written (§CO re-declares it, copied whole): stale, biased, gamed,
   privacy-invasive, non-comparable or outcome-detached → reasons that make the result indeterminate; checks for the record.
   -- B92 co: THE STANDING EVALUATION (PR-70-005). The draft is the compute body's (0113 §0.7: metric_key, definition_id, definition_version,
   period, window_from/to, as_of, scope, cohort, n, value, quality, records_count, tenant_id, domain_id; and — when the integrator widens it —
   records and distinct_actors). Every check reads only what was recorded at or before the draft's as-of, so a replay re-evaluates the same
   way. Each check is listed in `checks` as {check, status: pass | fail | not_evaluable | not_declared, detail}; each FAIL adds a reason
   prefixed with its class word (stale: · incomplete: · biased: · non-comparable: · gamed: · privacy: · outcome-detached:) and makes the
   result INDETERMINATE (never a zero). The checks, stated:
     STALE            the population's newest record (quality.newest_record_at | quality.source_newest_at | the records' detail.at) older than
                      quality.max_staleness_days (default 1.5 × the window's length) before the window's end (or the as-of when earlier).
     INCOMPLETE       the excluded share (excluded ÷ (excluded + n): the records' roles, else quality.excluded_count) above
                      quality.max_exclusion_share (default 0.5).
     BIASED           a DECLARED bias check quality.bias {dimension, min_share, values?}: a cohort of the population (by the records' detail
                      or quality.composition) under-represented below min_share — a declared check that cannot be evaluated is itself a
                      failure; and the synthetic / replayed share (quality.synthetic_share | replay_share) above quality.max_synthetic_share
                      | max_replay_share WHEN THE DEFINITION DECLARES ONE (B92 integration: no default cap — undeclared, the share is a label) — stated either way.
     NON-COMPARABLE   the definition changed inside the window (another version of the key effective strictly inside (from, to), at or
                      before the as-of, after an earlier effective version); or the computation's clock differs from the definition's, or it
                      reports mixed clocks.
     GAMED            (a) against the PREVIOUS period's determinate result (same metric, scope and cohort; written at or before the as-of):
                      the excluded share GREW while the value moved in the definition's favourable direction by more than quality.gaming_jump
                      (default 0.15 — absolute for a rate, relative otherwise); (b) the threshold changed with this version (version − 1's
                      differs) and that change ALONE moves this value from breach to pass.
     PRIVACY          a cohort key outside the definition's dimensions or naming a person; a pseudonymous_cohort definition without k_min ≥ 5
                      under a product_improvement purpose; a role cohort with no distinct-principal count (k cannot be established) or below
                      k; the definition's purpose present in the register but approved by no version at the as-of (a retired or rejected
                      purpose — collection beyond an approved purpose).
     OUTCOME-DETACHED a `serves` objective absent from the domain's strategy objects at the as-of, or closed / withdrawn by then.
   An empty `serves` is not a failure here: §MD's proposal port refuses it (a planted definition is said `not_declared`). */
CREATE OR REPLACE FUNCTION analytics.evaluate_result(p_draft jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = analytics, pg_catalog, pg_temp AS $$   -- B92 co (the prelude's body was the no-op `SELECT jsonb_build_object('reasons', '[]', 'checks', '[]', 'by', …)`)
DECLARE d analytics.metric_definitions%ROWTYPE; dq jsonb; q jsonb := coalesce(p_draft -> 'quality', '{}'::jsonb); v_recs jsonb; v_checks jsonb := '[]'::jsonb; v_reasons jsonb := '[]'::jsonb;
        v_from timestamptz := analytics.aco_instant(p_draft ->> 'window_from'); v_to timestamptz := analytics.aco_instant(p_draft ->> 'window_to');
        v_as_of timestamptz := analytics.aco_instant(p_draft ->> 'as_of'); v_n int := (p_draft ->> 'n')::int; v_value numeric := analytics.aco_num(p_draft -> 'value');
        v_cohort jsonb := coalesce(p_draft -> 'cohort', '{}'::jsonb); v_ref timestamptz; v_newest timestamptz; v_max numeric; v_days numeric; v_excl int; v_share numeric;
        v_bias jsonb; v_dim text; v_comp jsonb; v_pop numeric; v_min numeric; v_low jsonb; v_val text; v_syn numeric; v_rep numeric; v_ver record; v_prev record;
        v_prev_share numeric; v_jump numeric; v_move numeric; v_prior analytics.metric_definitions%ROWTYPE; v_k int; v_fail text; v_obj text; v_status text; v_bad jsonb;
        v_clock text; v_purpose_known boolean; v_purpose_ok boolean; v_kind text;
BEGIN
  SELECT * INTO d FROM analytics.metric_definitions x WHERE x.definition_id = (p_draft ->> 'definition_id')::uuid;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('reasons', '[]'::jsonb, 'checks', '[]'::jsonb, 'by', 'B92 co (the draft names no definition: nothing evaluated)');
  END IF;
  dq := coalesce(d.quality, '{}'::jsonb);
  v_recs := CASE WHEN jsonb_typeof(p_draft -> 'records') = 'array' THEN p_draft -> 'records' END;
  v_ref := least(v_to, coalesce(v_as_of, v_to));
  v_clock := coalesce(d.window_spec ->> 'clock', 'record');

  -- STALE
  v_days := extract(epoch FROM (v_to - v_from)) / 86400.0;
  v_max := coalesce(analytics.aco_num(dq -> 'max_staleness_days'), round(1.5 * v_days, 3));
  v_newest := coalesce(analytics.aco_instant(q ->> 'newest_record_at'), analytics.aco_instant(q ->> 'source_newest_at'));
  IF v_newest IS NULL AND v_recs IS NOT NULL THEN
    SELECT max(analytics.aco_instant(coalesce(r -> 'detail' ->> 'at', r -> 'detail' ->> 'recorded_at'))) INTO v_newest FROM jsonb_array_elements(v_recs) r WHERE r ->> 'role' IN ('numerator', 'denominator', 'included');
  END IF;
  IF v_newest IS NULL THEN
    v_checks := v_checks || jsonb_build_object('check', 'stale', 'status', 'not_evaluable', 'detail', CASE WHEN coalesce(v_n, 0) = 0 THEN 'no population to date' ELSE 'the computation reports no newest-record instant (quality.newest_record_at)' END);
  ELSIF extract(epoch FROM (v_ref - v_newest)) / 86400.0 > v_max THEN
    v_reasons := v_reasons || to_jsonb(format('stale: the population''s newest record (%s) is %s days before %s, beyond the %s days the definition allows (quality.max_staleness_days) — the source has gone quiet; not presented as current',
                                              v_newest, round(extract(epoch FROM (v_ref - v_newest)) / 86400.0, 1), v_ref, v_max));
    v_checks := v_checks || jsonb_build_object('check', 'stale', 'status', 'fail', 'detail', jsonb_build_object('newest', v_newest, 'reference', v_ref, 'max_days', v_max));
  ELSE
    v_checks := v_checks || jsonb_build_object('check', 'stale', 'status', 'pass', 'detail', jsonb_build_object('newest', v_newest, 'reference', v_ref, 'max_days', v_max));
  END IF;

  -- INCOMPLETE
  IF v_recs IS NOT NULL THEN
    SELECT count(*) FILTER (WHERE r ->> 'role' = 'excluded') INTO v_excl FROM jsonb_array_elements(v_recs) r;
  ELSE
    v_excl := analytics.aco_num(q -> 'excluded_count')::int;
  END IF;
  v_max := coalesce(analytics.aco_num(dq -> 'max_exclusion_share'), 0.5);
  IF v_excl IS NULL THEN
    v_checks := v_checks || jsonb_build_object('check', 'incomplete', 'status', 'not_evaluable', 'detail', 'the draft carries no records and the computation reports no quality.excluded_count');
  ELSIF v_excl + coalesce(v_n, 0) = 0 THEN
    v_checks := v_checks || jsonb_build_object('check', 'incomplete', 'status', 'not_evaluable', 'detail', 'no record at all');
  ELSE
    v_share := round(v_excl::numeric / (v_excl + coalesce(v_n, 0)), 6);
    IF v_share > v_max THEN
      v_reasons := v_reasons || to_jsonb(format('incomplete: %s of %s records are excluded (%s%%), above the %s%% the definition allows (quality.max_exclusion_share): what remains does not stand for the population',
                                                v_excl, v_excl + coalesce(v_n, 0), round(100 * v_share, 1), round(100 * v_max, 1)));
      v_checks := v_checks || jsonb_build_object('check', 'incomplete', 'status', 'fail', 'detail', jsonb_build_object('excluded', v_excl, 'n', v_n, 'share', v_share, 'max', v_max));
    ELSE
      v_checks := v_checks || jsonb_build_object('check', 'incomplete', 'status', 'pass', 'detail', jsonb_build_object('excluded', v_excl, 'n', v_n, 'share', v_share, 'max', v_max));
    END IF;
  END IF;

  -- BIASED (a declared cohort check; the synthetic / replay share)
  v_bias := dq -> 'bias';
  IF jsonb_typeof(v_bias) = 'object' AND v_bias ? 'dimension' THEN
    v_dim := v_bias ->> 'dimension'; v_min := coalesce(analytics.aco_num(v_bias -> 'min_share'), 0.1);
    IF v_recs IS NOT NULL THEN
      SELECT jsonb_object_agg(k, c) INTO v_comp FROM (SELECT coalesce(r -> 'detail' ->> v_dim, '(none)') k, count(*) c FROM jsonb_array_elements(v_recs) r
                                                        WHERE r ->> 'role' IN ('numerator', 'denominator', 'included') GROUP BY 1) z;
    ELSE
      v_comp := CASE WHEN jsonb_typeof(q -> 'composition' -> v_dim) = 'object' THEN q -> 'composition' -> v_dim END;
    END IF;
    IF v_comp IS NULL THEN
      v_reasons := v_reasons || to_jsonb(format('biased: the definition declares a bias check on %s, which cannot be evaluated — the computation reports no composition by %s; an unverifiable population is not presented as representative', v_dim, v_dim));
      v_checks := v_checks || jsonb_build_object('check', 'biased', 'status', 'fail', 'detail', jsonb_build_object('dimension', v_dim, 'composition', NULL));
    ELSE
      SELECT sum((value #>> '{}')::numeric) INTO v_pop FROM jsonb_each(v_comp);
      SELECT coalesce(jsonb_object_agg(v.x, round(coalesce((v_comp ->> v.x)::numeric, 0) / nullif(v_pop, 0), 6)), '{}'::jsonb) INTO v_low
        FROM (SELECT x FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(v_bias -> 'values') = 'array' THEN v_bias -> 'values' ELSE (SELECT jsonb_agg(k) FROM jsonb_object_keys(v_comp) k) END) x) v
       WHERE coalesce((v_comp ->> v.x)::numeric, 0) / nullif(v_pop, 0) < v_min OR v_pop IS NULL OR v_pop = 0;
      IF v_low <> '{}'::jsonb THEN
        v_reasons := v_reasons || to_jsonb(format('biased: on %s the cohort(s) %s are under-represented (share below %s%% of the %s records in the population): the declared bias check fails',
                                                  v_dim, (SELECT string_agg(k || ' ' || round(100 * (v_low ->> k)::numeric, 1) || '%', ', ' ORDER BY k) FROM jsonb_object_keys(v_low) k), round(100 * v_min, 1), coalesce(v_pop, 0)));
        v_checks := v_checks || jsonb_build_object('check', 'biased', 'status', 'fail', 'detail', jsonb_build_object('dimension', v_dim, 'composition', v_comp, 'under_represented', v_low, 'min_share', v_min));
      ELSE
        v_checks := v_checks || jsonb_build_object('check', 'biased', 'status', 'pass', 'detail', jsonb_build_object('dimension', v_dim, 'composition', v_comp, 'min_share', v_min));
      END IF;
    END IF;
  ELSE
    v_checks := v_checks || jsonb_build_object('check', 'biased', 'status', 'not_declared', 'detail', 'the definition declares no bias check (quality.bias)');
  END IF;
  v_syn := analytics.aco_num(q -> 'synthetic_share');
  IF v_syn IS NULL AND v_recs IS NOT NULL AND coalesce(v_n, 0) > 0 THEN
    SELECT round(count(*) FILTER (WHERE (r -> 'detail' ->> 'synthetic') = 'true')::numeric / v_n, 6) INTO v_syn FROM jsonb_array_elements(v_recs) r WHERE r ->> 'role' IN ('numerator', 'denominator', 'included');
  END IF;
  v_rep := analytics.aco_num(q -> 'replay_share');
  -- B92 integration: the cap applies only when the definition DECLARES it (quality.max_synthetic_share); otherwise the share is a LABEL on the result
  -- (status `labelled`, shown with the value) — a synthetic demonstration is said to be one, never refused wholesale nor presented as real
  v_max := analytics.aco_num(dq -> 'max_synthetic_share');
  IF v_syn IS NOT NULL AND v_max IS NOT NULL AND v_syn > v_max THEN
    v_reasons := v_reasons || to_jsonb(format('biased: %s%% of the population is synthetic (a substitute channel or fixture), above the %s%% the definition admits (quality.max_synthetic_share): a demonstration is not presented as the measure',
                                              round(100 * v_syn, 1), round(100 * v_max, 1)));
    v_checks := v_checks || jsonb_build_object('check', 'synthetic_share', 'status', 'fail', 'detail', jsonb_build_object('share', v_syn, 'max', v_max));
  ELSE
    v_checks := v_checks || jsonb_build_object('check', 'synthetic_share', 'status', CASE WHEN v_syn IS NULL THEN 'not_evaluable' WHEN v_max IS NULL THEN 'labelled' ELSE 'pass' END, 'detail', jsonb_build_object('share', v_syn, 'max', v_max));
  END IF;
  -- B92 integration: the cap applies only when the definition DECLARES it (quality.max_replay_share); otherwise the share is a LABEL on the result
  -- (status `labelled`, shown with the value) — a synthetic demonstration is said to be one, never refused wholesale nor presented as real
  v_max := analytics.aco_num(dq -> 'max_replay_share');
  IF v_rep IS NOT NULL AND v_max IS NOT NULL AND v_rep > v_max THEN
    v_reasons := v_reasons || to_jsonb(format('biased: %s%% of the population is replayed (world-clock) records, above the %s%% the definition admits (quality.max_replay_share)', round(100 * v_rep, 1), round(100 * v_max, 1)));
    v_checks := v_checks || jsonb_build_object('check', 'replay_share', 'status', 'fail', 'detail', jsonb_build_object('share', v_rep, 'max', v_max));
  ELSE
    v_checks := v_checks || jsonb_build_object('check', 'replay_share', 'status', CASE WHEN v_rep IS NULL THEN 'not_evaluable' WHEN v_max IS NULL THEN 'labelled' ELSE 'pass' END, 'detail', jsonb_build_object('share', v_rep, 'max', v_max));
  END IF;

  -- NON-COMPARABLE (the definition changed inside the window; the clock)
  SELECT x.version, x.effective_from INTO v_ver FROM analytics.metric_definitions x
   WHERE x.tenant_id = d.tenant_id AND x.domain_id = d.domain_id AND x.metric_key = d.metric_key AND x.effective_from IS NOT NULL
     AND x.effective_from > v_from AND x.effective_from < v_to AND x.effective_from <= coalesce(v_as_of, v_to)
     AND EXISTS (SELECT 1 FROM analytics.metric_definitions y WHERE y.tenant_id = d.tenant_id AND y.domain_id = d.domain_id AND y.metric_key = d.metric_key
                                                               AND y.effective_from IS NOT NULL AND y.effective_from < x.effective_from AND y.version < x.version)
   ORDER BY x.effective_from DESC LIMIT 1;
  IF FOUND THEN
    v_reasons := v_reasons || to_jsonb(format('non-comparable: the definition changed inside the window — version %s took effect at %s, inside [%s, %s): the window mixes two definitions; compute the periods on either side',
                                              v_ver.version, v_ver.effective_from, v_from, v_to));
    v_checks := v_checks || jsonb_build_object('check', 'non_comparable', 'status', 'fail', 'detail', jsonb_build_object('changed_version', v_ver.version, 'effective_from', v_ver.effective_from));
  ELSIF coalesce((q ->> 'mixed_clocks')::boolean, false) OR (q ? 'clock' AND q ->> 'clock' IS NOT NULL AND q ->> 'clock' <> v_clock) THEN
    v_reasons := v_reasons || to_jsonb(format('non-comparable: the population mixes clocks (the definition reads the %s clock; the computation reports %s): record-time and world-time instants are not one window',
                                              v_clock, coalesce(q ->> 'clock', 'mixed clocks')));
    v_checks := v_checks || jsonb_build_object('check', 'non_comparable', 'status', 'fail', 'detail', jsonb_build_object('definition_clock', v_clock, 'quality_clock', q ->> 'clock', 'mixed', q -> 'mixed_clocks'));
  ELSE
    v_checks := v_checks || jsonb_build_object('check', 'non_comparable', 'status', 'pass', 'detail', jsonb_build_object('version', d.version, 'clock', v_clock));
  END IF;

  -- GAMED (a) exclusions grew while the value jumped; (b) the threshold moved the value across it
  IF v_value IS NULL THEN
    v_checks := v_checks || jsonb_build_object('check', 'gamed', 'status', 'not_evaluable', 'detail', 'no value to test');
  ELSE
    v_fail := NULL;
    SELECT r.result_id, r.value, r.n, r.period_key,
           (SELECT count(*) FROM analytics.result_records rr WHERE rr.result_id = r.result_id AND rr.role = 'excluded') AS excluded
      INTO v_prev FROM analytics.metric_results r
     WHERE r.tenant_id = d.tenant_id AND r.domain_id = d.domain_id AND r.metric_key = d.metric_key AND r.window_to = v_from AND r.state = 'determinate'
       AND NOT r.preview AND r.replay_of IS NULL AND r.scope_key IS NOT DISTINCT FROM (p_draft -> 'scope' ->> 'scope_key') AND r.cohort = v_cohort
       AND r.computed_at <= coalesce(v_as_of, clock_timestamp())
     ORDER BY r.computed_at DESC LIMIT 1;
    v_jump := coalesce(analytics.aco_num(dq -> 'gaming_jump'), 0.15);
    IF FOUND AND v_share IS NOT NULL AND coalesce(v_prev.n, 0) + v_prev.excluded > 0 THEN
      v_prev_share := round(v_prev.excluded::numeric / (v_prev.excluded + coalesce(v_prev.n, 0)), 6);
      v_move := CASE d.direction WHEN 'higher' THEN v_value - v_prev.value WHEN 'lower' THEN v_prev.value - v_value ELSE abs(v_value - v_prev.value) END;
      IF d.kind <> 'rate' THEN v_move := CASE WHEN v_prev.value = 0 THEN NULL ELSE v_move / abs(v_prev.value) END; END IF;
      IF v_share > v_prev_share AND v_move IS NOT NULL AND v_move > v_jump THEN
        v_fail := format('gamed: the excluded share grew from %s%% (%s) to %s%% while the value improved by %s (beyond the %s the definition tolerates, quality.gaming_jump): an improvement bought by exclusion is not shown',
                         round(100 * v_prev_share, 1), v_prev.period_key, round(100 * v_share, 1), round(v_move, 6), v_jump);
        v_reasons := v_reasons || to_jsonb(v_fail);
        v_checks := v_checks || jsonb_build_object('check', 'gamed', 'status', 'fail', 'detail', jsonb_build_object('test', 'exclusion_jump', 'previous_result', v_prev.result_id, 'previous_period', v_prev.period_key,
                                                                                                   'previous_share', v_prev_share, 'share', v_share, 'move', v_move, 'jump', v_jump));
      END IF;
    END IF;
    IF v_fail IS NULL THEN
      SELECT * INTO v_prior FROM analytics.metric_definitions x WHERE x.tenant_id = d.tenant_id AND x.domain_id = d.domain_id AND x.metric_key = d.metric_key AND x.version = d.version - 1;
      IF FOUND AND v_prior.threshold IS DISTINCT FROM d.threshold AND analytics.aco_breach(v_prior.threshold, v_prior.direction, v_value) IS TRUE
         AND analytics.aco_breach(d.threshold, d.direction, v_value) IS NOT TRUE THEN
        v_fail := format('gamed: the threshold changed with version %s (%s → %s) and that change alone moves this value (%s) from breach to pass: the review the old threshold opens is not avoided by re-drawing the line — a version re-approved without the change, or a recorded review, clears it',
                         d.version, v_prior.threshold, d.threshold, v_value);
        v_reasons := v_reasons || to_jsonb(v_fail);
        v_checks := v_checks || jsonb_build_object('check', 'gamed', 'status', 'fail', 'detail', jsonb_build_object('test', 'threshold_moved', 'prior_version', v_prior.version, 'prior_threshold', v_prior.threshold,
                                                                                                   'threshold', d.threshold, 'value', v_value));
      END IF;
    END IF;
    IF v_fail IS NULL THEN
      v_checks := v_checks || jsonb_build_object('check', 'gamed', 'status', 'pass', 'detail', jsonb_build_object('previous_result', CASE WHEN v_prev.result_id IS NULL THEN NULL ELSE v_prev.result_id END, 'jump', v_jump,
                                                                                                 'tests', jsonb_build_array('exclusion_jump', 'threshold_moved')));
    END IF;
  END IF;

  -- PRIVACY
  v_bad := '[]'::jsonb;
  IF EXISTS (SELECT 1 FROM jsonb_object_keys(v_cohort) k WHERE k = ANY (analytics.person_dimensions()) OR NOT (k = ANY (d.dimensions))) THEN
    v_bad := v_bad || to_jsonb(format('the cohort %s uses a key outside the definition''s dimensions or naming a person', v_cohort));
  END IF;
  IF d.privacy_class = 'pseudonymous_cohort' AND (d.k_min < 5 OR NOT EXISTS (SELECT 1 FROM analytics.purposes p WHERE p.tenant_id = d.tenant_id AND p.domain_id = d.domain_id AND p.purpose_key = d.purpose_key
                                                                                                                  AND p.purpose_kind = 'product_improvement')) THEN
    v_bad := v_bad || to_jsonb('a pseudonymous cohort metric needs k_min >= 5 under a product_improvement purpose'::text);
  END IF;
  v_k := coalesce(analytics.aco_num(p_draft -> 'distinct_actors'), analytics.aco_num(q -> 'distinct_actors'))::int;
  IF v_cohort ? 'role' AND v_k IS NULL THEN
    v_bad := v_bad || to_jsonb('a role cohort reports no distinct-principal count: k cannot be established'::text);
  ELSIF v_k IS NOT NULL AND v_k < d.k_min THEN
    v_bad := v_bad || to_jsonb(format('the cohort rests on %s distinct principals, below k = %s', v_k, d.k_min));
  END IF;
  v_purpose_known := EXISTS (SELECT 1 FROM analytics.purposes p WHERE p.tenant_id = d.tenant_id AND p.domain_id = d.domain_id AND p.purpose_key = d.purpose_key);
  v_purpose_ok := EXISTS (SELECT 1 FROM analytics.purposes p WHERE p.tenant_id = d.tenant_id AND p.domain_id = d.domain_id AND p.purpose_key = d.purpose_key
                            AND p.decided_at IS NOT NULL AND p.decided_at <= coalesce(v_as_of, clock_timestamp()) AND p.state IN ('approved', 'superseded', 'retired')
                            AND (p.retired_at IS NULL OR p.retired_at > coalesce(v_as_of, clock_timestamp())));
  IF v_purpose_known AND NOT v_purpose_ok THEN
    v_bad := v_bad || to_jsonb(format('the purpose %s is approved by no version at %s (rejected, retired or never approved): a measure beyond an approved purpose is not used', d.purpose_key, coalesce(v_as_of, clock_timestamp())));
  END IF;
  IF jsonb_array_length(v_bad) > 0 THEN
    v_reasons := v_reasons || to_jsonb('privacy: ' || (SELECT string_agg(x, '; ') FROM jsonb_array_elements_text(v_bad) x) || ' — routed to privacy review');
    v_checks := v_checks || jsonb_build_object('check', 'privacy', 'status', 'fail', 'detail', jsonb_build_object('findings', v_bad, 'privacy_class', d.privacy_class, 'k_min', d.k_min, 'purpose', d.purpose_key));
  ELSE
    v_checks := v_checks || jsonb_build_object('check', 'privacy', 'status', 'pass', 'detail', jsonb_build_object('privacy_class', d.privacy_class, 'k_min', d.k_min, 'purpose', d.purpose_key,
                                                                                                  'purpose_register', CASE WHEN v_purpose_known THEN 'approved at the as-of' ELSE 'not in the register (a planted definition; §MD''s port requires it)' END));
  END IF;

  -- OUTCOME-DETACHED
  v_bad := '[]'::jsonb;
  FOR v_obj IN SELECT x FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(d.serves -> 'objective_ids') = 'array' THEN d.serves -> 'objective_ids' ELSE '[]'::jsonb END) x LOOP
    IF v_obj !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       OR NOT EXISTS (SELECT 1 FROM graph.strategy_events e WHERE e.strategy_object_id = v_obj::uuid AND e.tenant_id = d.tenant_id AND e.domain_id = d.domain_id
                                                             AND e.event = 'strategy.declared' AND e.occurred_at <= coalesce(v_as_of, clock_timestamp())) THEN
      v_bad := v_bad || jsonb_build_object('objective', v_obj, 'status', 'absent');
    ELSE
      v_status := decision.strategy_status_as_of(v_obj::uuid, coalesce(v_as_of, clock_timestamp()));
      IF v_status <> 'active' THEN v_bad := v_bad || jsonb_build_object('objective', v_obj, 'status', v_status); END IF;
    END IF;
  END LOOP;
  IF jsonb_array_length(v_bad) > 0 THEN
    v_reasons := v_reasons || to_jsonb(format('outcome-detached: the objective(s) this measure serves are no longer live (%s): a measure detached from the outcome it serves is not presented as evidence of it',
                                              (SELECT string_agg((x ->> 'objective') || ' ' || (x ->> 'status'), ', ') FROM jsonb_array_elements(v_bad) x)));
    v_checks := v_checks || jsonb_build_object('check', 'outcome_detached', 'status', 'fail', 'detail', jsonb_build_object('objectives', v_bad));
  ELSIF coalesce(jsonb_array_length(CASE WHEN jsonb_typeof(d.serves -> 'objective_ids') = 'array' THEN d.serves -> 'objective_ids' END), 0) = 0
        AND coalesce(jsonb_array_length(CASE WHEN jsonb_typeof(d.serves -> 'decision_classes') = 'array' THEN d.serves -> 'decision_classes' END), 0) = 0
        AND coalesce(d.serves ->> 'value_measure', '') = '' THEN
    v_checks := v_checks || jsonb_build_object('check', 'outcome_detached', 'status', 'not_declared', 'detail', 'the definition names nothing it serves (§MD''s proposal port refuses that; a planted definition)');
  ELSE
    v_checks := v_checks || jsonb_build_object('check', 'outcome_detached', 'status', 'pass', 'detail', jsonb_build_object('serves', d.serves));
  END IF;

  RETURN jsonb_build_object('reasons', v_reasons, 'checks', v_checks, 'by', 'B92 co standing evaluation (0113 §CO.3)', 'evaluated_as_of', v_as_of,
                            'failed', (SELECT coalesce(jsonb_agg(c ->> 'check'), '[]'::jsonb) FROM jsonb_array_elements(v_checks) c WHERE c ->> 'status' = 'fail'));
END $$;
REVOKE ALL ON FUNCTION analytics.evaluate_result(jsonb) FROM PUBLIC;

-- §CO.4 HOOK 2 — AFTER THE RESULT ─────────────────────────────────────────────────────────────────────────────────────────────────────────
/* HOOK 2 — after a result is written (§CO re-declares it, copied whole): route a breached threshold as a REVIEW (analytics.metric, never an
   automatic decision), stop unsafe use, meter the computation's cost. Returns what it did.
   -- B92 co: (1) THE METER — one analytics.computation_costs row (a meter never fails the act it meters: an error is a WARNING and the
   row is missing, which the reconciliation then names unpriced/discrepant); (2) for an ORIGINAL, non-preview result: every failing check of
   the standing evaluation raises ONE item per (metric, scope, cohort, class) — `analytics.privacy` for privacy, `analytics.metric` for the
   others — subject the result that found it, the definition's owner named, origin `standing_evaluation` (an open one is not raised twice);
   a DETERMINATE result with no failing check CLOSES the open standing-evaluation items of the same (metric, scope, cohort) — THE RECOVERY;
   a determinate BREACH raises `analytics.metric` as a REVIEW (origin `threshold_breach`, the definition's action quoted — never an automatic
   or punitive decision; one per metric, period, scope and cohort while open). Stopping the unsafe USE is the result's own state: an
   indeterminate result is never cited unqualified (§MD's use port). A replay only meters. */
CREATE OR REPLACE FUNCTION analytics.after_result(p_result uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SET search_path = analytics, pg_catalog, pg_temp AS $$   -- B92 co (the prelude's body was the no-op `SELECT jsonb_build_object('routed', NULL, 'by', …)`)
DECLARE r analytics.metric_results%ROWTYPE; d analytics.metric_definitions%ROWTYPE; v_ms numeric; v_meter jsonb; v_routed jsonb := '[]'::jsonb; v_closed jsonb := '[]'::jsonb;
        v_fails jsonb; v_class text; v_reasons jsonb; v_open uuid; v_item jsonb; i record; v_ids jsonb; v_title text;
BEGIN
  SELECT * INTO r FROM analytics.metric_results x WHERE x.result_id = p_result;
  IF NOT FOUND THEN RETURN jsonb_build_object('by', 'B92 co', 'note', 'no such result'); END IF;
  SELECT * INTO d FROM analytics.metric_definitions x WHERE x.definition_id = r.definition_id;
  -- (1) the meter
  BEGIN
    v_ms := round(greatest(0, extract(epoch FROM (clock_timestamp() - statement_timestamp())) * 1000)::numeric, 3);
    INSERT INTO analytics.computation_costs (result_id, scope, tenant_id, domain_id, metric_key, definition_version, computation_key, computation_version, rows_read, compute_ms, replay, preview,
                                             cost_allocation, measured_by, computed_by_kind)
    VALUES (r.result_id, 'DOMAIN', r.tenant_id, r.domain_id, r.metric_key, r.definition_version, r.computation_key, r.computation_version, r.records_count, v_ms, r.replay_of IS NOT NULL, r.preview,
            coalesce(d.cost_allocation, '{}'::jsonb), 'B92 co after_result: records returned; database clock from the calling statement''s start', r.computed_by_kind);
    v_meter := jsonb_build_object('rows_read', r.records_count, 'compute_ms', v_ms);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'B92 co meter: computation % not metered: %', r.result_id, SQLERRM;
    v_meter := jsonb_build_object('error', SQLERRM);
  END;
  IF r.replay_of IS NOT NULL OR r.preview THEN
    RETURN jsonb_build_object('by', 'B92 co', 'metered', v_meter, 'routed', v_routed, 'closed', v_closed, 'note', CASE WHEN r.preview THEN 'a preview routes nothing' ELSE 'a replay routes nothing' END);
  END IF;
  v_fails := (SELECT coalesce(jsonb_agg(c), '[]'::jsonb) FROM jsonb_array_elements(coalesce(r.evaluation -> 'checks', '[]'::jsonb)) c WHERE c ->> 'status' = 'fail');
  -- (2a) the unsafe evaluation: one item per class while open
  FOREACH v_class IN ARRAY ARRAY['analytics.privacy', 'analytics.metric'] LOOP
    v_reasons := (SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM jsonb_array_elements_text(r.reasons) x
                   WHERE (v_class = 'analytics.privacy' AND x LIKE 'privacy:%')
                      OR (v_class = 'analytics.metric' AND (x LIKE 'stale:%' OR x LIKE 'incomplete:%' OR x LIKE 'biased:%' OR x LIKE 'non-comparable:%' OR x LIKE 'gamed:%' OR x LIKE 'outcome-detached:%')));
    IF jsonb_array_length(v_reasons) = 0 THEN CONTINUE; END IF;
    SELECT it.item_id INTO v_open FROM executive.attention_items it
     WHERE it.tenant_id = r.tenant_id AND it.domain_id = r.domain_id AND it.signal_class = v_class AND it.subject_kind = 'metric_result' AND it.state <> 'closed'
       AND it.details ->> 'origin' = 'standing_evaluation' AND it.details ->> 'metric_key' = r.metric_key AND (it.details ->> 'scope_key') IS NOT DISTINCT FROM r.scope_key
       AND it.details -> 'cohort' = r.cohort
     LIMIT 1;
    IF FOUND THEN
      v_routed := v_routed || jsonb_build_object('class', v_class, 'item_id', v_open, 'existing', true);
      CONTINUE;
    END IF;
    v_title := left(format('%s %s (%s%s): %s — the result is indeterminate; its use is stopped until reviewed', CASE WHEN v_class = 'analytics.privacy' THEN 'Privacy review —' ELSE 'Metric review —' END,
                           r.metric_key, r.period_key, CASE WHEN r.scope_key IS NULL THEN '' ELSE ', ' || r.scope_key END,
                           (SELECT string_agg(split_part(x, ':', 1), ', ') FROM jsonb_array_elements_text(v_reasons) x)), 500);
    v_item := executive.b33_raise_routed(r.tenant_id, r.domain_id, v_class, 'metric_result', r.result_id, v_title, v_reasons, d.owner_principal_id, r.result_id, 'analytics.result.indeterminate',
                jsonb_build_object('origin', 'standing_evaluation', 'metric_key', r.metric_key, 'definition_id', r.definition_id, 'definition_version', r.definition_version, 'period', r.period_key,
                                   'scope_key', r.scope_key, 'cohort', r.cohort, 'failed_checks', v_fails, 'result_id', r.result_id,
                                   'note', 'a review workflow: the owner (or the privacy officer) reviews the metric''s standing; nothing is decided automatically'),
                jsonb_build_object('consequence', 'C2'), p_actor, p_correlation);
    v_routed := v_routed || (v_item || jsonb_build_object('class', v_class, 'origin', 'standing_evaluation'));
  END LOOP;
  -- (2b) THE RECOVERY: a determinate result with no failing check closes the open standing-evaluation items of the same metric, scope and cohort
  IF r.state = 'determinate' AND jsonb_array_length(v_fails) = 0 THEN
    FOR i IN SELECT it.item_id, it.signal_class, it.subject_id FROM executive.attention_items it
              WHERE it.tenant_id = r.tenant_id AND it.domain_id = r.domain_id AND it.signal_class IN ('analytics.metric', 'analytics.privacy') AND it.subject_kind = 'metric_result'
                AND it.state <> 'closed' AND it.details ->> 'origin' = 'standing_evaluation' AND it.details ->> 'metric_key' = r.metric_key
                AND (it.details ->> 'scope_key') IS NOT DISTINCT FROM r.scope_key AND it.details -> 'cohort' = r.cohort
              ORDER BY it.created_at LOOP
      v_ids := executive.b33_close_items(r.tenant_id, r.domain_id, i.signal_class, 'metric_result', i.subject_id,
                 format('recovered: result %s (%s) of %s is determinate and passes the standing evaluation', r.result_id, r.period_key, r.metric_key), p_actor, p_correlation);
      v_closed := v_closed || v_ids;
    END LOOP;
  END IF;
  -- (2c) a determinate BREACH: a review, never an automatic decision
  IF r.state = 'determinate' AND (r.threshold_eval ->> 'breach') = 'true'
     AND analytics.exemption_for(r.tenant_id, r.domain_id, r.metric_key, r.period_key, r.scope_key, r.cohort) IS NOT NULL THEN   -- B92 integration (§I): an approved, unexpired threshold exemption
    v_routed := v_routed || jsonb_build_object('class', 'analytics.metric', 'origin', 'threshold_breach', 'exempted_by',
                  analytics.exemption_for(r.tenant_id, r.domain_id, r.metric_key, r.period_key, r.scope_key, r.cohort), 'note', 'the breach is not raised: an approved threshold exemption is in force (said, never hidden)');
  ELSIF r.state = 'determinate' AND (r.threshold_eval ->> 'breach') = 'true' THEN
    SELECT it.item_id INTO v_open FROM executive.attention_items it
     WHERE it.tenant_id = r.tenant_id AND it.domain_id = r.domain_id AND it.signal_class = 'analytics.metric' AND it.subject_kind = 'metric_result' AND it.state <> 'closed'
       AND it.details ->> 'origin' = 'threshold_breach' AND it.details ->> 'metric_key' = r.metric_key AND it.details ->> 'period' = r.period_key
       AND (it.details ->> 'scope_key') IS NOT DISTINCT FROM r.scope_key AND it.details -> 'cohort' = r.cohort
     LIMIT 1;
    IF FOUND THEN
      v_routed := v_routed || jsonb_build_object('class', 'analytics.metric', 'item_id', v_open, 'existing', true, 'origin', 'threshold_breach');
    ELSE
      v_item := executive.b33_raise_routed(r.tenant_id, r.domain_id, 'analytics.metric', 'metric_result', r.result_id,
                  left(format('Metric breach for review — %s (%s%s): %s against %s', r.metric_key, r.period_key, CASE WHEN r.scope_key IS NULL THEN '' ELSE ', ' || r.scope_key END, r.value, d.threshold), 500),
                  jsonb_build_array(format('the determinate value %s breaches the approved threshold %s', r.value, d.threshold), format('the definition''s action: %s', d.action),
                                    'a review workflow for the named owner — never an automatic or punitive decision'),
                  d.owner_principal_id, r.result_id, 'analytics.result.breach',
                  jsonb_build_object('origin', 'threshold_breach', 'metric_key', r.metric_key, 'definition_id', r.definition_id, 'definition_version', r.definition_version, 'period', r.period_key,
                                     'scope_key', r.scope_key, 'cohort', r.cohort, 'value', r.value, 'threshold', d.threshold, 'action', d.action, 'result_id', r.result_id),
                  jsonb_build_object('consequence', 'C2'), p_actor, p_correlation);
      v_routed := v_routed || (v_item || jsonb_build_object('class', 'analytics.metric', 'origin', 'threshold_breach'));
    END IF;
  END IF;
  RETURN jsonb_build_object('by', 'B92 co', 'metered', v_meter, 'routed', v_routed, 'closed', v_closed);
END $$;
REVOKE ALL ON FUNCTION analytics.after_result(uuid, uuid, uuid) FROM PUBLIC;

-- §CO.5 THE COHORT COMPARISON ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* COMPARE (analytics.comparison.run — an analyst, the owner, or the attention agent: AI may compute). Two ORIGINAL, non-preview results of one
   metric (two cohorts, two periods, or two scopes); each side may name a CERTIFIED cohort object (DP-44-001) whose criteria must be the side's
   cohort — its version, digest and certification are recorded. COMPARABLE when: both determinate (n ≥ floor and k held by the compute port);
   the two definition versions' SEMANTIC projections are equal (analytics.aco_semantic — the rule stated); the computation digests are equal;
   the clocks and the period kinds are equal. A rate is compared by Newcombe's interval of the difference (a claim only when it excludes 0); a
   duration by the two medians with their order-statistic intervals (a claim only when they do not overlap; none when one is unbounded); a
   ratio, count or score has no interval method here → indeterminate, said. The composition of both sides by every declared dimension (from the
   records) is stated beside the difference. Long reads happen inside this one port (it locks nothing it reads). */
CREATE OR REPLACE FUNCTION analytics.compare_results(p_comparison uuid, p_tenant uuid, p_domain uuid, p_result_a uuid, p_result_b uuid, p_cohort_object_a uuid, p_cohort_object_b uuid,
                                                     p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = analytics, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE a analytics.metric_results%ROWTYPE; b analytics.metric_results%ROWTYPE; da analytics.metric_definitions%ROWTYPE; db analytics.metric_definitions%ROWTYPE;
        v_reasons jsonb := '[]'::jsonb; v_cmp jsonb := '{}'::jsonb; v_state text; v_est numeric := NULL; v_int jsonb := NULL; v_method text := NULL; v_claim text; v_co_a jsonb := NULL; v_co_b jsonb := NULL;
        v_comp jsonb := '{}'::jsonb; v_dim text; v_sides jsonb; v_row jsonb; ua jsonb; ub jsonb; v_kind_ok boolean := true; v_obj uuid; v_side text; v_res analytics.metric_results%ROWTYPE; v_co jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['analytics.comparison.run']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS NULL OR p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'cohort comparison rejected (actor): a comparison is recorded under the acting principal' USING ERRCODE = '42501'; END IF;
  IF p_result_a IS NULL OR p_result_b IS NULL OR p_result_a = p_result_b THEN RAISE EXCEPTION 'cohort comparison rejected (request): a comparison names two different results' USING ERRCODE = '22023'; END IF;
  SELECT * INTO a FROM analytics.metric_results x WHERE x.result_id = p_result_a AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'cohort comparison rejected (unknown_result): % is not a result of this domain', p_result_a USING ERRCODE = '23503'; END IF;
  SELECT * INTO b FROM analytics.metric_results x WHERE x.result_id = p_result_b AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'cohort comparison rejected (unknown_result): % is not a result of this domain', p_result_b USING ERRCODE = '23503'; END IF;
  IF a.metric_key <> b.metric_key THEN RAISE EXCEPTION 'cohort comparison rejected (metric): % and % are results of two metrics (% and %); a comparison is within one metric', p_result_a, p_result_b, a.metric_key, b.metric_key USING ERRCODE = '22023'; END IF;
  IF a.preview OR b.preview THEN RAISE EXCEPTION 'cohort comparison rejected (state): a PREVIEW result (computed on a proposed definition) is never compared as current' USING ERRCODE = '22023'; END IF;
  IF a.replay_of IS NOT NULL OR b.replay_of IS NOT NULL THEN RAISE EXCEPTION 'cohort comparison rejected (state): a replay is compared through its original result' USING ERRCODE = '22023'; END IF;
  SELECT * INTO da FROM analytics.metric_definitions x WHERE x.definition_id = a.definition_id;
  SELECT * INTO db FROM analytics.metric_definitions x WHERE x.definition_id = b.definition_id;
  -- the named cohort objects (DP-44-001): certified, unexpired, a cohort, its criteria the side's cohort
  FOREACH v_side IN ARRAY ARRAY['a', 'b'] LOOP
    v_obj := CASE v_side WHEN 'a' THEN p_cohort_object_a ELSE p_cohort_object_b END;
    v_res := CASE v_side WHEN 'a' THEN a ELSE b END;
    IF v_obj IS NULL THEN CONTINUE; END IF;
    SELECT jsonb_build_object('object_id', o.object_id, 'object_key', o.object_key, 'kind', o.kind, 'state', o.state, 'version', o.certified_version, 'digest', v.digest, 'criteria', v.definition -> 'criteria',
                              'metric_keys', v.definition -> 'metric_keys', 'certification_id', c.certification_id, 'expires_at', c.expires_at, 'cert_state', c.state)
      INTO v_co FROM products.semantic_objects o
      LEFT JOIN products.semantic_object_versions v ON v.object_id = o.object_id AND v.version = coalesce(o.certified_version, o.current_version)
      LEFT JOIN LATERAL (SELECT * FROM products.semantic_object_certifications c WHERE c.object_id = o.object_id AND c.state = 'active' ORDER BY c.certified_at DESC LIMIT 1) c ON true
     WHERE o.object_id = v_obj AND o.tenant_id = p_tenant AND o.domain_id = p_domain;
    IF v_co IS NULL THEN RAISE EXCEPTION 'cohort comparison rejected (unknown_semantic_object): % is not a semantic object of this domain', v_obj USING ERRCODE = '23503'; END IF;
    IF v_co ->> 'kind' <> 'cohort' THEN RAISE EXCEPTION 'cohort comparison rejected (cohort): % is a % object; a comparison names a COHORT object', v_co ->> 'object_key', v_co ->> 'kind' USING ERRCODE = '22023'; END IF;
    IF v_co ->> 'state' <> 'certified' OR v_co ->> 'certification_id' IS NULL THEN
      RAISE EXCEPTION 'cohort comparison rejected (state): cohort % is % — only a CERTIFIED cohort object is a governed cohort definition', v_co ->> 'object_key', v_co ->> 'state' USING ERRCODE = '22023';
    END IF;
    IF (v_co ->> 'expires_at')::timestamptz <= clock_timestamp() THEN
      RAISE EXCEPTION 'cohort comparison rejected (state): the certification of cohort % expired at % — re-certified by its owner before use', v_co ->> 'object_key', v_co ->> 'expires_at' USING ERRCODE = '22023';
    END IF;
    IF NOT ((v_co -> 'metric_keys') ? v_res.metric_key) THEN
      RAISE EXCEPTION 'cohort comparison rejected (cohort): cohort % is declared for % — not for %', v_co ->> 'object_key', v_co -> 'metric_keys', v_res.metric_key USING ERRCODE = '22023';
    END IF;
    IF (v_co -> 'criteria') IS DISTINCT FROM v_res.cohort THEN
      RAISE EXCEPTION 'cohort comparison rejected (cohort): side % was computed on the cohort %, which is not cohort % (%)', v_side, v_res.cohort, v_co ->> 'object_key', v_co -> 'criteria' USING ERRCODE = '22023';
    END IF;
    IF v_side = 'a' THEN v_co_a := v_co; ELSE v_co_b := v_co; END IF;
  END LOOP;

  -- COMPARABILITY
  IF a.state <> 'determinate' THEN v_reasons := v_reasons || to_jsonb(format('side a (%s, %s) is %s: %s', a.period_key, a.cohort, a.state, a.reasons)); END IF;
  IF b.state <> 'determinate' THEN v_reasons := v_reasons || to_jsonb(format('side b (%s, %s) is %s: %s', b.period_key, b.cohort, b.state, b.reasons)); END IF;
  IF a.n IS NOT NULL AND a.n < da.floor_n THEN v_reasons := v_reasons || to_jsonb(format('side a: n = %s is below the floor %s', a.n, da.floor_n)); END IF;
  IF b.n IS NOT NULL AND b.n < db.floor_n THEN v_reasons := v_reasons || to_jsonb(format('side b: n = %s is below the floor %s', b.n, db.floor_n)); END IF;
  IF a.definition_version <> b.definition_version AND analytics.aco_semantic(da) IS DISTINCT FROM analytics.aco_semantic(db) THEN
    v_reasons := v_reasons || to_jsonb(format('non-comparable: definition versions %s and %s differ in what decides the value (%s)', a.definition_version, b.definition_version,
      (SELECT string_agg(k, ', ' ORDER BY k) FROM jsonb_object_keys(analytics.aco_semantic(da)) k WHERE analytics.aco_semantic(da) -> k IS DISTINCT FROM analytics.aco_semantic(db) -> k)));
  END IF;
  IF a.computation_digest IS DISTINCT FROM b.computation_digest THEN
    v_reasons := v_reasons || to_jsonb(format('non-comparable: the two results ran different computation bodies (%s v%s, %s v%s)', a.computation_key, a.computation_version, b.computation_key, b.computation_version));
  END IF;
  IF a.clock <> b.clock THEN v_reasons := v_reasons || to_jsonb(format('non-comparable: the clocks differ (%s vs %s)', a.clock, b.clock)); END IF;
  IF a.period_kind <> b.period_kind THEN v_reasons := v_reasons || to_jsonb(format('non-comparable: the windows are of different kinds (%s vs %s)', a.period_kind, b.period_kind)); END IF;
  IF a.kind NOT IN ('rate', 'duration') THEN
    v_kind_ok := false;
    v_reasons := v_reasons || to_jsonb(format('no interval method for a %s metric: a difference without its uncertainty is not shown', a.kind));
  END IF;
  v_cmp := jsonb_build_object('rule', 'comparable when both results are determinate original non-preview results, their definitions'' semantic projections are equal (kind, unit, direction, population, numerator, denominator, exclusions, window, dimensions, privacy class, k, floor, computation and params; title, wording, owner, cadence, action, retirement, serves, threshold, quality and cost allocation are non-semantic), the computation bodies are equal and the clocks and window kinds agree',
                              'definition_versions', jsonb_build_array(a.definition_version, b.definition_version), 'same_semantics', analytics.aco_semantic(da) IS NOT DISTINCT FROM analytics.aco_semantic(db),
                              'computation_digests', jsonb_build_array(a.computation_digest, b.computation_digest));

  -- COMPOSITION (stated beside the difference): what differs between the sides, and both populations by every declared dimension
  v_comp := jsonb_build_object('differs', (SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM (VALUES ('period', a.period_key IS DISTINCT FROM b.period_key), ('cohort', a.cohort IS DISTINCT FROM b.cohort),
                                                                                                ('scope', a.scope_key IS DISTINCT FROM b.scope_key OR a.scope_version IS DISTINCT FROM b.scope_version)) z(x, f) WHERE f),
                               'n', jsonb_build_object('a', a.n, 'b', b.n), 'excluded', jsonb_build_object(
                                  'a', (SELECT count(*) FROM analytics.result_records rr WHERE rr.result_id = a.result_id AND rr.role = 'excluded'),
                                  'b', (SELECT count(*) FROM analytics.result_records rr WHERE rr.result_id = b.result_id AND rr.role = 'excluded')));
  FOREACH v_dim IN ARRAY da.dimensions LOOP
    v_comp := jsonb_set(v_comp, ARRAY['by_' || v_dim], jsonb_build_object(
      'a', (SELECT coalesce(jsonb_object_agg(k, c), '{}'::jsonb) FROM (SELECT coalesce(rr.detail ->> v_dim, '(none)') k, count(*) c FROM analytics.result_records rr
                                                                       WHERE rr.result_id = a.result_id AND rr.role IN ('numerator', 'denominator', 'included') GROUP BY 1) z),
      'b', (SELECT coalesce(jsonb_object_agg(k, c), '{}'::jsonb) FROM (SELECT coalesce(rr.detail ->> v_dim, '(none)') k, count(*) c FROM analytics.result_records rr
                                                                       WHERE rr.result_id = b.result_id AND rr.role IN ('numerator', 'denominator', 'included') GROUP BY 1) z)));
  END LOOP;

  v_sides := jsonb_build_object(
    'a', jsonb_build_object('result_id', a.result_id, 'period', a.period_key, 'scope_key', a.scope_key, 'scope_version', a.scope_version, 'cohort', a.cohort, 'state', a.state, 'value', a.value, 'n', a.n,
                            'numerator', a.numerator, 'denominator', a.denominator, 'uncertainty', a.uncertainty, 'definition_version', a.definition_version, 'source_revision', a.source_revision, 'cohort_object', v_co_a),
    'b', jsonb_build_object('result_id', b.result_id, 'period', b.period_key, 'scope_key', b.scope_key, 'scope_version', b.scope_version, 'cohort', b.cohort, 'state', b.state, 'value', b.value, 'n', b.n,
                            'numerator', b.numerator, 'denominator', b.denominator, 'uncertainty', b.uncertainty, 'definition_version', b.definition_version, 'source_revision', b.source_revision, 'cohort_object', v_co_b));

  IF jsonb_array_length(v_reasons) = 0 AND v_kind_ok THEN
    v_state := 'determinate';
    IF a.kind = 'rate' THEN
      ua := analytics.aco_newcombe(a.numerator, a.denominator, b.numerator, b.denominator);
      v_est := (ua ->> 'estimate')::numeric; v_int := ua; v_method := 'newcombe_hybrid_score';
      v_claim := CASE WHEN (ua ->> 'lo')::numeric > 0 THEN format('a is higher than b by %s (95%% interval %s to %s)', ua ->> 'estimate', ua ->> 'lo', ua ->> 'hi')
                      WHEN (ua ->> 'hi')::numeric < 0 THEN format('a is lower than b by %s (95%% interval %s to %s)', abs((ua ->> 'estimate')::numeric), ua ->> 'lo', ua ->> 'hi')
                      ELSE format('no difference shown: the 95%% interval of the difference (%s to %s) contains 0', ua ->> 'lo', ua ->> 'hi') END;
    ELSE
      ua := a.uncertainty; ub := b.uncertainty;
      v_est := round(a.value - b.value, 6); v_method := 'medians_with_order_statistic_intervals';
      v_int := jsonb_build_object('method', v_method, 'level', 0.95, 'a', jsonb_build_object('median', a.value, 'lo', ua -> 'lo', 'hi', ua -> 'hi', 'n', a.n),
                                  'b', jsonb_build_object('median', b.value, 'lo', ub -> 'lo', 'hi', ub -> 'hi', 'n', b.n));
      v_claim := CASE WHEN (ua ->> 'lo') IS NULL OR (ub ->> 'lo') IS NULL THEN 'no claim: the interval of a median is unbounded below n = 6 — the medians are shown, no difference is claimed'
                      WHEN (ua ->> 'lo')::numeric > (ub ->> 'hi')::numeric THEN format('a''s median (%s) is higher than b''s (%s): the intervals do not overlap', a.value, b.value)
                      WHEN (ua ->> 'hi')::numeric < (ub ->> 'lo')::numeric THEN format('a''s median (%s) is lower than b''s (%s): the intervals do not overlap', a.value, b.value)
                      ELSE format('no claim: the medians'' intervals overlap ([%s, %s] and [%s, %s])', ua ->> 'lo', ua ->> 'hi', ub ->> 'lo', ub ->> 'hi') END;
    END IF;
  ELSE
    v_state := 'indeterminate';
    v_claim := 'indeterminate: no difference is shown — ' || (SELECT string_agg(x, '; ') FROM jsonb_array_elements_text(v_reasons) x);
  END IF;

  v_row := jsonb_build_object('metric_key', a.metric_key, 'kind', a.kind, 'state', v_state, 'estimate', v_est, 'interval', v_int, 'method', v_method, 'claim', v_claim, 'sides', v_sides,
                              'composition', v_comp, 'comparability', v_cmp, 'reasons', v_reasons);
  INSERT INTO analytics.comparisons (comparison_id, scope, tenant_id, domain_id, metric_key, result_a, result_b, cohort_object_a, cohort_object_b, kind, state, estimate, interval, method, claim,
                                     sides, composition, comparability, reasons, digest, run_by, run_by_kind, correlation_id)
  VALUES (p_comparison, 'DOMAIN', p_tenant, p_domain, a.metric_key, a.result_id, b.result_id, v_co_a, v_co_b, a.kind, v_state, v_est, v_int, v_method, v_claim, v_sides, v_comp, v_cmp, v_reasons,
          analytics.digest(v_row), p_actor, coalesce((SELECT p.kind FROM identity.principals p WHERE p.id = p_actor), 'system'), p_correlation);
  INSERT INTO analytics.definition_events (event_id, scope, tenant_id, domain_id, subject_kind, subject_id, subject_key, version, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, 'comparison', p_comparison, a.metric_key, a.definition_version, 'comparison.run', p_actor,
          jsonb_build_object('state', v_state, 'result_a', a.result_id, 'result_b', b.result_id, 'cohort_objects', jsonb_build_array(v_co_a -> 'object_id', v_co_b -> 'object_id'), 'claim', v_claim), p_correlation);
  RETURN (SELECT to_jsonb(x) FROM analytics.comparisons x WHERE x.comparison_id = p_comparison);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION analytics.compare_results(uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION analytics.compare_results(uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid) TO eye_commit;

/* The comparisons of the domain (newest first; a metric key narrows) and one comparison — INVOKER, under the caller's RLS. */
CREATE OR REPLACE FUNCTION analytics.comparison_list(p_metric_key text, p_limit int) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = analytics, pg_catalog, pg_temp AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(c) - 'tenant_id' - 'domain_id' - 'scope' ORDER BY c.run_at DESC), '[]'::jsonb)
    FROM (SELECT * FROM analytics.comparisons x WHERE p_metric_key IS NULL OR x.metric_key = p_metric_key ORDER BY x.run_at DESC LIMIT greatest(1, least(coalesce(p_limit, 50), 500))) c
$$;
CREATE OR REPLACE FUNCTION analytics.comparison_read(p_comparison uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = analytics, pg_catalog, pg_temp AS $$
  SELECT to_jsonb(c) - 'tenant_id' - 'domain_id' - 'scope' FROM analytics.comparisons c WHERE c.comparison_id = p_comparison
$$;
GRANT EXECUTE ON FUNCTION analytics.comparison_list(text, int), analytics.comparison_read(uuid) TO eye_app, eye_commit;

-- §CO.6 DP-44-001 — THE GOVERNED SEMANTIC OBJECTS ──────────────────────────────────────────────────────────────────────────────────────────
/* An endpoint a relationship or a model names exists in the domain: a product metric (analytics.metric_definitions, any version not
   rejected), a B90 semantic model (products.semantic_models), another semantic object. */
CREATE OR REPLACE FUNCTION products.sob_endpoint_exists(p_tenant uuid, p_domain uuid, p_ref jsonb) RETURNS boolean
LANGUAGE sql STABLE SET search_path = products, analytics, pg_catalog, pg_temp AS $$
  SELECT CASE p_ref ->> 'kind'
    WHEN 'metric' THEN EXISTS (SELECT 1 FROM analytics.metric_definitions d WHERE d.tenant_id = p_tenant AND d.domain_id = p_domain AND d.metric_key = p_ref ->> 'key' AND d.state <> 'rejected')
    WHEN 'semantic_model' THEN EXISTS (SELECT 1 FROM products.semantic_models m WHERE m.tenant_id = p_tenant AND m.domain_id = p_domain AND m.metric_key = p_ref ->> 'key')
    WHEN 'semantic_object' THEN EXISTS (SELECT 1 FROM products.semantic_objects o WHERE o.tenant_id = p_tenant AND o.domain_id = p_domain AND o.object_key = p_ref ->> 'key')
    ELSE false END
$$;
/* THE DEFINITION RULES per kind (raises the refusal; answers the normalised definition):
     cohort            {criteria: {dimension: scalar} (≥ 1, never a person), metric_keys: [≥ 1 metric of the domain whose latest live version declares
                       every criteria dimension], rationale (8+)}
     relationship      {from: {kind, key}, to: {kind, key} (metric | semantic_model | semantic_object, existing, different), relation (leads | lags |
                       explains | decomposes_into | constrains | correlates_with | same_population), rationale (8+)}
     analytical_model  {method (decomposition | regression | index | ratio | composite | threshold_rule), inputs: [≥ 1 {kind, key}, existing],
                       output (8+), assumptions: [≥ 1 text], validity (8+)} */
CREATE OR REPLACE FUNCTION products.sob_validate(p_tenant uuid, p_domain uuid, p_kind text, p_def jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = products, analytics, pg_catalog, pg_temp AS $$
DECLARE k text; m text; v_dims text[]; r jsonb;
BEGIN
  IF p_def IS NULL OR jsonb_typeof(p_def) <> 'object' THEN RAISE EXCEPTION 'semantic object rejected (definition): a definition is an object' USING ERRCODE = '22023'; END IF;
  IF p_kind = 'cohort' THEN
    IF jsonb_typeof(p_def -> 'criteria') IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(p_def -> 'criteria')) = 0 THEN
      RAISE EXCEPTION 'semantic object rejected (definition): a cohort declares criteria {dimension: value} (one at least)' USING ERRCODE = '22023';
    END IF;
    FOR k IN SELECT x FROM jsonb_object_keys(p_def -> 'criteria') x LOOP
      IF k = ANY (analytics.person_dimensions()) THEN
        RAISE EXCEPTION 'semantic object rejected (person): a cohort is never a person-grained group (%): no employee-performance inference', k USING ERRCODE = '42501';
      END IF;
      IF jsonb_typeof(p_def -> 'criteria' -> k) NOT IN ('string', 'number', 'boolean') THEN RAISE EXCEPTION 'semantic object rejected (definition): criterion % is a scalar value', k USING ERRCODE = '22023'; END IF;
    END LOOP;
    IF jsonb_typeof(p_def -> 'metric_keys') IS DISTINCT FROM 'array' OR jsonb_array_length(p_def -> 'metric_keys') = 0 THEN
      RAISE EXCEPTION 'semantic object rejected (definition): a cohort names the metric(s) it groups (metric_keys)' USING ERRCODE = '22023';
    END IF;
    FOR m IN SELECT x FROM jsonb_array_elements_text(p_def -> 'metric_keys') x LOOP
      SELECT d.dimensions INTO v_dims FROM analytics.metric_definitions d WHERE d.tenant_id = p_tenant AND d.domain_id = p_domain AND d.metric_key = m AND d.state IN ('approved', 'proposed', 'superseded')
       ORDER BY (d.state = 'approved') DESC, d.version DESC LIMIT 1;
      IF NOT FOUND THEN RAISE EXCEPTION 'semantic object rejected (unknown_metric): % is no metric of this domain', m USING ERRCODE = '23503'; END IF;
      FOR k IN SELECT x FROM jsonb_object_keys(p_def -> 'criteria') x LOOP
        IF NOT (k = ANY (v_dims)) THEN RAISE EXCEPTION 'semantic object rejected (dimension): % does not declare the dimension % (its dimensions: %)', m, k, array_to_string(v_dims, ', ') USING ERRCODE = '22023'; END IF;
      END LOOP;
    END LOOP;
    IF length(btrim(coalesce(p_def ->> 'rationale', ''))) < 8 THEN RAISE EXCEPTION 'semantic object rejected (definition): a cohort states its rationale (8+ characters)' USING ERRCODE = '22023'; END IF;
    RETURN jsonb_build_object('criteria', p_def -> 'criteria', 'metric_keys', (SELECT jsonb_agg(DISTINCT x ORDER BY x) FROM jsonb_array_elements_text(p_def -> 'metric_keys') x), 'rationale', btrim(p_def ->> 'rationale'));
  ELSIF p_kind = 'relationship' THEN
    IF NOT (coalesce(p_def ->> 'relation', '') = ANY (ARRAY['leads', 'lags', 'explains', 'decomposes_into', 'constrains', 'correlates_with', 'same_population'])) THEN
      RAISE EXCEPTION 'semantic object rejected (definition): a relationship''s relation is leads, lags, explains, decomposes_into, constrains, correlates_with or same_population' USING ERRCODE = '22023';
    END IF;
    FOREACH k IN ARRAY ARRAY['from', 'to'] LOOP
      r := p_def -> k;
      IF jsonb_typeof(r) IS DISTINCT FROM 'object' OR NOT (coalesce(r ->> 'kind', '') = ANY (ARRAY['metric', 'semantic_model', 'semantic_object'])) OR coalesce(r ->> 'key', '') = '' THEN
        RAISE EXCEPTION 'semantic object rejected (definition): a relationship''s % is {kind: metric | semantic_model | semantic_object, key}', k USING ERRCODE = '22023';
      END IF;
      IF NOT products.sob_endpoint_exists(p_tenant, p_domain, r) THEN RAISE EXCEPTION 'semantic object rejected (unknown_reference): % % is not in this domain', r ->> 'kind', r ->> 'key' USING ERRCODE = '23503'; END IF;
    END LOOP;
    IF p_def -> 'from' = p_def -> 'to' THEN RAISE EXCEPTION 'semantic object rejected (definition): a relationship joins two different objects' USING ERRCODE = '22023'; END IF;
    IF length(btrim(coalesce(p_def ->> 'rationale', ''))) < 8 THEN RAISE EXCEPTION 'semantic object rejected (definition): a relationship states its rationale (8+ characters)' USING ERRCODE = '22023'; END IF;
    RETURN jsonb_build_object('from', jsonb_build_object('kind', p_def -> 'from' ->> 'kind', 'key', p_def -> 'from' ->> 'key'), 'to', jsonb_build_object('kind', p_def -> 'to' ->> 'kind', 'key', p_def -> 'to' ->> 'key'),
                              'relation', p_def ->> 'relation', 'rationale', btrim(p_def ->> 'rationale'));
  ELSIF p_kind = 'analytical_model' THEN
    IF NOT (coalesce(p_def ->> 'method', '') = ANY (ARRAY['decomposition', 'regression', 'index', 'ratio', 'composite', 'threshold_rule'])) THEN
      RAISE EXCEPTION 'semantic object rejected (definition): a model''s method is decomposition, regression, index, ratio, composite or threshold_rule' USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(p_def -> 'inputs') IS DISTINCT FROM 'array' OR jsonb_array_length(p_def -> 'inputs') = 0 THEN RAISE EXCEPTION 'semantic object rejected (definition): a model names its inputs' USING ERRCODE = '22023'; END IF;
    FOR r IN SELECT x FROM jsonb_array_elements(p_def -> 'inputs') x LOOP
      IF jsonb_typeof(r) IS DISTINCT FROM 'object' OR NOT (coalesce(r ->> 'kind', '') = ANY (ARRAY['metric', 'semantic_model', 'semantic_object'])) OR coalesce(r ->> 'key', '') = '' THEN
        RAISE EXCEPTION 'semantic object rejected (definition): an input is {kind: metric | semantic_model | semantic_object, key}' USING ERRCODE = '22023';
      END IF;
      IF NOT products.sob_endpoint_exists(p_tenant, p_domain, r) THEN RAISE EXCEPTION 'semantic object rejected (unknown_reference): % % is not in this domain', r ->> 'kind', r ->> 'key' USING ERRCODE = '23503'; END IF;
    END LOOP;
    IF length(btrim(coalesce(p_def ->> 'output', ''))) < 8 OR length(btrim(coalesce(p_def ->> 'validity', ''))) < 8 THEN
      RAISE EXCEPTION 'semantic object rejected (definition): a model states its output and its validity (8+ characters each)' USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(p_def -> 'assumptions') IS DISTINCT FROM 'array' OR jsonb_array_length(p_def -> 'assumptions') = 0 THEN
      RAISE EXCEPTION 'semantic object rejected (definition): a model states its assumptions (one at least)' USING ERRCODE = '22023';
    END IF;
    RETURN jsonb_build_object('method', p_def ->> 'method', 'inputs', (SELECT jsonb_agg(jsonb_build_object('kind', x ->> 'kind', 'key', x ->> 'key')) FROM jsonb_array_elements(p_def -> 'inputs') x),
                              'output', btrim(p_def ->> 'output'), 'assumptions', p_def -> 'assumptions', 'validity', btrim(p_def ->> 'validity'));
  END IF;
  RAISE EXCEPTION 'semantic object rejected (kind): % is not a kind (cohort, relationship, analytical_model)', coalesce(p_kind, 'null') USING ERRCODE = '22023';
END $$;
/* THE WITHDRAWAL STEP (private, the 0095 metric_withdraw idiom): the active certification → withdrawn | expired with the reason; the object's
   standing follows (its last valid version frozen readable); the COMPARISONS that named the object are LISTED in the answer and the event. */
CREATE OR REPLACE FUNCTION products.sob_withdraw(p_object_id uuid, p_state text, p_reason text, p_detail jsonb, p_actor uuid, p_correlation uuid) RETURNS jsonb
SET search_path = products, analytics, pg_catalog, pg_temp AS $$
DECLARE o products.semantic_objects%ROWTYPE; c products.semantic_object_certifications%ROWTYPE; v_uses jsonb;
BEGIN
  SELECT * INTO o FROM products.semantic_objects x WHERE x.object_id = p_object_id FOR UPDATE;
  SELECT * INTO c FROM products.semantic_object_certifications x WHERE x.object_id = p_object_id AND x.state = 'active' ORDER BY x.certified_at DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('comparison_id', x.comparison_id, 'metric_key', x.metric_key, 'state', x.state, 'run_at', x.run_at, 'claim', x.claim) ORDER BY x.run_at), '[]'::jsonb)
    INTO v_uses FROM analytics.comparisons x
   WHERE x.tenant_id = o.tenant_id AND x.domain_id = o.domain_id AND ((x.cohort_object_a ->> 'object_id')::uuid = p_object_id OR (x.cohort_object_b ->> 'object_id')::uuid = p_object_id);
  UPDATE products.semantic_object_certifications SET state = p_state, withdrawn_at = clock_timestamp(), withdrawn_by = p_actor, withdrawal_reason = btrim(p_reason) WHERE certification_id = c.certification_id;
  UPDATE products.semantic_objects SET state = p_state, certified_version = NULL, last_valid_version = c.version, updated_at = clock_timestamp() WHERE object_id = p_object_id;
  INSERT INTO analytics.definition_events (event_id, scope, tenant_id, domain_id, subject_kind, subject_id, subject_key, version, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', o.tenant_id, o.domain_id, 'semantic_object', p_object_id, o.object_key, c.version, 'semantic_object.certification_' || p_state, p_actor,
          jsonb_build_object('certification_id', c.certification_id, 'version', c.version, 'reason', btrim(p_reason), 'detail', coalesce(p_detail, '{}'::jsonb), 'uses_exposed', v_uses), p_correlation);
  RETURN jsonb_build_object('certification_id', c.certification_id, 'version', c.version, 'state', p_state, 'reason', btrim(p_reason), 'uses_exposed', v_uses,
                            'consequence', 'the last valid version ' || c.version || ' is frozen and stays readable; no comparison names the object as a governed cohort until its owner re-certifies');
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION products.sob_endpoint_exists(uuid, uuid, jsonb), products.sob_validate(uuid, uuid, text, jsonb), products.sob_withdraw(uuid, text, text, jsonb, uuid, uuid) FROM PUBLIC;

/* DECLARE (products.semantic.declare): a DATA STEWARD or a PRODUCT ANALYST (a named human) declares a cohort, a relationship or an analytical
   model — or re-declares it as the next VERSION — with its owner (a named human holding product_analytics_owner in the domain). A
   re-declaration that changes a CERTIFIED object withdraws its certification (reason definition_changed; the comparisons that named it
   exposed). An unchanged definition is refused (duplicate). */
CREATE OR REPLACE FUNCTION products.semantic_declare(p_object_id uuid, p_tenant uuid, p_domain uuid, p_key text, p_kind text, p_title text, p_definition jsonb, p_owner uuid,
                                                     p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = products, analytics, executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE o products.semantic_objects%ROWTYPE; pv products.semantic_object_versions%ROWTYPE; v_def jsonb; v_digest text; v_version int; v_withdrawal jsonb := NULL; v_changed jsonb := NULL;
BEGIN
  PERFORM observation.assert_authority(ARRAY['products.semantic.declare']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS NULL OR p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'semantic object rejected (actor): declared by the acting principal' USING ERRCODE = '42501'; END IF;
  IF NOT decision.is_active_human(p_actor, p_tenant) THEN RAISE EXCEPTION 'semantic object rejected (actor): a semantic object is declared by a named human (an agent proposes findings, never semantics)' USING ERRCODE = '42501'; END IF;
  IF NOT executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['data_steward', 'product_analyst']) THEN
    RAISE EXCEPTION 'semantic object rejected (authority): a semantic object is declared by a data steward or a product analyst' USING ERRCODE = '42501';
  END IF;
  IF p_key IS NULL OR p_key !~ '^[a-z][a-z0-9_.-]{2,62}$' THEN RAISE EXCEPTION 'semantic object rejected (request): a key is lower-case, 3–63 characters' USING ERRCODE = '22023'; END IF;
  IF p_title IS NULL OR length(btrim(p_title)) NOT BETWEEN 4 AND 200 THEN RAISE EXCEPTION 'semantic object rejected (title): a title is 4–200 characters' USING ERRCODE = '22023'; END IF;
  IF p_owner IS NULL OR NOT decision.is_active_human(p_owner, p_tenant) OR NOT executive.holds_role(p_owner, p_tenant, p_domain, ARRAY['product_analytics_owner']) THEN
    RAISE EXCEPTION 'semantic object rejected (owner): the owner is a named human holding product_analytics_owner in this domain (the certifier)' USING ERRCODE = '22023';
  END IF;
  v_def := products.sob_validate(p_tenant, p_domain, p_kind, p_definition);
  v_digest := analytics.digest(jsonb_build_object('key', p_key, 'kind', p_kind, 'title', btrim(p_title), 'owner', p_owner, 'definition', v_def));
  SELECT * INTO o FROM products.semantic_objects x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.object_key = p_key FOR UPDATE;
  IF FOUND AND o.object_id <> p_object_id THEN
    RAISE EXCEPTION 'semantic object rejected (duplicate): the key % names the object % of this domain; re-declare it by its id', p_key, o.object_id USING ERRCODE = '22023';
  END IF;
  IF NOT FOUND THEN
    SELECT * INTO o FROM products.semantic_objects x WHERE x.object_id = p_object_id FOR UPDATE;
    IF FOUND THEN RAISE EXCEPTION 'semantic object rejected (request): % is the object % — its key does not change', p_object_id, o.object_key USING ERRCODE = '22023'; END IF;
    v_version := 1;
    INSERT INTO products.semantic_objects (object_id, scope, tenant_id, domain_id, object_key, kind, title, owner_principal_id, current_version, correlation_id)
    VALUES (p_object_id, 'DOMAIN', p_tenant, p_domain, p_key, p_kind, btrim(p_title), p_owner, 1, p_correlation);
  ELSE
    IF o.kind <> p_kind THEN RAISE EXCEPTION 'semantic object rejected (kind): % is a %; its kind does not change', p_key, o.kind USING ERRCODE = '22023'; END IF;
    SELECT * INTO pv FROM products.semantic_object_versions x WHERE x.object_id = o.object_id AND x.version = o.current_version;
    IF pv.digest = v_digest THEN RAISE EXCEPTION 'semantic object rejected (duplicate): the definition of % is unchanged from version %', p_key, o.current_version USING ERRCODE = '22023'; END IF;
    v_version := o.current_version + 1;
    SELECT coalesce(jsonb_agg(jsonb_build_object('key', k, 'from', pv.definition -> k, 'to', v_def -> k) ORDER BY k), '[]'::jsonb) INTO v_changed
      FROM (SELECT DISTINCT kk AS k FROM (SELECT jsonb_object_keys(pv.definition) kk UNION SELECT jsonb_object_keys(v_def) kk) q) z WHERE pv.definition -> k IS DISTINCT FROM v_def -> k;
    IF o.state = 'certified' THEN
      v_withdrawal := products.sob_withdraw(o.object_id, 'withdrawn', format('definition_changed: the certified version %s was re-declared as version %s', o.certified_version, v_version),
                                            jsonb_build_object('from_version', o.certified_version, 'to_version', v_version, 'changed', v_changed), p_actor, p_correlation);
    END IF;
    UPDATE products.semantic_objects SET title = btrim(p_title), owner_principal_id = p_owner, current_version = v_version, updated_at = clock_timestamp() WHERE object_id = o.object_id;
  END IF;
  INSERT INTO products.semantic_object_versions (object_id, version, tenant_id, domain_id, title, definition, digest, declared_by, correlation_id)
  VALUES (p_object_id, v_version, p_tenant, p_domain, btrim(p_title), v_def, v_digest, p_actor, p_correlation);
  INSERT INTO analytics.definition_events (event_id, scope, tenant_id, domain_id, subject_kind, subject_id, subject_key, version, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, 'semantic_object', p_object_id, p_key, v_version, 'semantic_object.declared', p_actor,
          jsonb_build_object('kind', p_kind, 'digest', v_digest, 'owner', p_owner, 'changed', v_changed, 'withdrawal', v_withdrawal), p_correlation);
  RETURN products.semantic_object_read(p_object_id) || jsonb_build_object('version', v_version, 'digest', v_digest, 'changed', v_changed, 'withdrawal', v_withdrawal);
END $$ LANGUAGE plpgsql;

/* CERTIFY (products.semantic.certify; human-gated): the OBJECT'S OWNER only (a steward or analyst declares, never certifies — 0095's rule),
   never the human who declared the version (separation of duties), the CURRENT version at the digest the owner saw (a stale digest is
   refused), an expiry in the future and ≤ 366 days ahead, a reason; a CONFLICT refused — another certified object of the same kind with the
   same normalised title under a different digest (reconcile under semantic governance). */
CREATE OR REPLACE FUNCTION products.semantic_certify(p_certification_id uuid, p_object_id uuid, p_tenant uuid, p_domain uuid, p_version int, p_digest text, p_expires_at timestamptz, p_reason text,
                                                     p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = products, analytics, executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE o products.semantic_objects%ROWTYPE; pv products.semantic_object_versions%ROWTYPE; v_now timestamptz := clock_timestamp(); v_other text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['products.semantic.certify']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS NULL OR p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'semantic object rejected (actor): certified by the acting principal' USING ERRCODE = '42501'; END IF;
  IF NOT decision.is_active_human(p_actor, p_tenant) THEN RAISE EXCEPTION 'semantic object rejected (actor): a certification is a named human''s act; an agent never certifies' USING ERRCODE = '42501'; END IF;
  SELECT * INTO o FROM products.semantic_objects x WHERE x.object_id = p_object_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'semantic object rejected (unknown_semantic_object): % is not a semantic object of this domain', p_object_id USING ERRCODE = '23503'; END IF;
  IF o.owner_principal_id <> p_actor THEN RAISE EXCEPTION 'semantic object rejected (authority): % is certified by its owner (a steward or an analyst declares, never certifies)', o.object_key USING ERRCODE = '42501'; END IF;
  IF o.state = 'certified' THEN RAISE EXCEPTION 'semantic object rejected (state): % is already certified at version %', o.object_key, o.certified_version USING ERRCODE = '22023'; END IF;
  IF p_version IS DISTINCT FROM o.current_version THEN RAISE EXCEPTION 'semantic object rejected (stale): only the current version % of % is certified (asked: %)', o.current_version, o.object_key, coalesce(p_version::text, 'null') USING ERRCODE = '22023'; END IF;
  SELECT * INTO pv FROM products.semantic_object_versions x WHERE x.object_id = p_object_id AND x.version = p_version;
  IF p_digest IS DISTINCT FROM pv.digest THEN RAISE EXCEPTION 'semantic object rejected (stale): the digest % is not version %''s (%): the owner certifies what they read', coalesce(p_digest, 'null'), p_version, pv.digest USING ERRCODE = '22023'; END IF;
  IF pv.declared_by = p_actor THEN RAISE EXCEPTION 'semantic object rejected (separation_of_duties): version % of % was declared by its owner; another human declares, the owner certifies', p_version, o.object_key USING ERRCODE = '42501'; END IF;
  IF p_expires_at IS NULL OR p_expires_at <= v_now THEN RAISE EXCEPTION 'semantic object rejected (expiry): a certification expires at a future instant' USING ERRCODE = '22023'; END IF;
  IF p_expires_at > v_now + interval '366 days' THEN RAISE EXCEPTION 'semantic object rejected (expiry): a certification expires within 366 days (asked: %)', p_expires_at USING ERRCODE = '22023'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN RAISE EXCEPTION 'semantic object rejected (reason): a certification says why (8+ characters)' USING ERRCODE = '22023'; END IF;
  SELECT x.object_key INTO v_other FROM products.semantic_objects x JOIN products.semantic_object_versions xv ON xv.object_id = x.object_id AND xv.version = x.certified_version
   WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.object_id <> p_object_id AND x.state = 'certified' AND x.kind = o.kind
     AND lower(btrim(x.title)) = lower(btrim(pv.title)) AND xv.digest <> pv.digest LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'semantic object rejected (conflict): % conflicts with the certified % (the same title, a different definition) — reconcile under semantic governance: withdraw one or re-declare', o.object_key, v_other USING ERRCODE = '22023';
  END IF;
  INSERT INTO products.semantic_object_certifications (certification_id, object_id, tenant_id, domain_id, version, digest, certified_by, certified_at, expires_at, reason, correlation_id)
  VALUES (p_certification_id, p_object_id, p_tenant, p_domain, p_version, pv.digest, p_actor, v_now, p_expires_at, btrim(p_reason), p_correlation);
  UPDATE products.semantic_objects SET state = 'certified', certified_version = p_version, last_valid_version = p_version, updated_at = clock_timestamp() WHERE object_id = p_object_id;
  INSERT INTO analytics.definition_events (event_id, scope, tenant_id, domain_id, subject_kind, subject_id, subject_key, version, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, 'semantic_object', p_object_id, o.object_key, p_version, 'semantic_object.certified', p_actor,
          jsonb_build_object('certification_id', p_certification_id, 'digest', pv.digest, 'expires_at', p_expires_at, 'reason', btrim(p_reason)), p_correlation);
  RETURN products.semantic_object_read(p_object_id);
END $$ LANGUAGE plpgsql;

/* WITHDRAW (products.semantic.withdraw; human-gated): the owner or a data steward withdraws the active certification with a reason; the last
   valid version is frozen readable; the comparisons that named the object are exposed. */
CREATE OR REPLACE FUNCTION products.semantic_withdraw(p_object_id uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = products, analytics, executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE o products.semantic_objects%ROWTYPE; v_out jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['products.semantic.withdraw']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS NULL OR p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'semantic object rejected (actor): withdrawn by the acting principal' USING ERRCODE = '42501'; END IF;
  IF NOT decision.is_active_human(p_actor, p_tenant) THEN RAISE EXCEPTION 'semantic object rejected (actor): a withdrawal is a named human''s act' USING ERRCODE = '42501'; END IF;
  SELECT * INTO o FROM products.semantic_objects x WHERE x.object_id = p_object_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'semantic object rejected (unknown_semantic_object): % is not a semantic object of this domain', p_object_id USING ERRCODE = '23503'; END IF;
  IF o.owner_principal_id <> p_actor AND NOT executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['data_steward']) THEN
    RAISE EXCEPTION 'semantic object rejected (authority): a certification is withdrawn by the object''s owner or by a data steward' USING ERRCODE = '42501';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN RAISE EXCEPTION 'semantic object rejected (reason): a withdrawal says why (8+ characters)' USING ERRCODE = '22023'; END IF;
  IF o.state <> 'certified' THEN RAISE EXCEPTION 'semantic object rejected (state): % is %; there is no active certification to withdraw', o.object_key, o.state USING ERRCODE = '22023'; END IF;
  v_out := products.sob_withdraw(p_object_id, 'withdrawn', p_reason, jsonb_build_object('by', CASE WHEN o.owner_principal_id = p_actor THEN 'owner' ELSE 'data_steward' END), p_actor, p_correlation);
  RETURN products.semantic_object_read(p_object_id) || jsonb_build_object('withdrawal', v_out);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION products.semantic_declare(uuid,uuid,uuid,text,text,text,jsonb,uuid,uuid,uuid), products.semantic_certify(uuid,uuid,uuid,uuid,int,text,timestamptz,text,uuid,uuid),
                       products.semantic_withdraw(uuid,uuid,uuid,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION products.semantic_declare(uuid,uuid,uuid,text,text,text,jsonb,uuid,uuid,uuid), products.semantic_certify(uuid,uuid,uuid,uuid,int,text,timestamptz,text,uuid,uuid),
                          products.semantic_withdraw(uuid,uuid,uuid,text,uuid,uuid) TO eye_commit;

/* THE READS (INVOKER, under the caller's RLS): an object with its versions, certifications, its STANDING now (certified | certified but past
   its expiry — not usable | declared | withdrawn | expired) and the comparisons that named it; the list (a kind narrows). */
CREATE OR REPLACE FUNCTION products.semantic_object_read(p_object_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = products, analytics, pg_catalog, pg_temp AS $$
  SELECT (to_jsonb(o) - 'scope' - 'correlation_id') || jsonb_build_object(
    'standing', CASE WHEN o.state = 'certified' AND EXISTS (SELECT 1 FROM products.semantic_object_certifications c WHERE c.object_id = o.object_id AND c.state = 'active' AND c.expires_at <= clock_timestamp())
                     THEN 'certified, past its expiry — not usable until re-certified' ELSE o.state END,
    'versions', coalesce((SELECT jsonb_agg(jsonb_build_object('version', v.version, 'title', v.title, 'definition', v.definition, 'digest', v.digest, 'declared_by', v.declared_by, 'declared_at', v.declared_at) ORDER BY v.version)
                           FROM products.semantic_object_versions v WHERE v.object_id = o.object_id), '[]'::jsonb),
    'certifications', coalesce((SELECT jsonb_agg(to_jsonb(c) - 'tenant_id' - 'domain_id' - 'correlation_id' ORDER BY c.certified_at) FROM products.semantic_object_certifications c WHERE c.object_id = o.object_id), '[]'::jsonb),
    'uses', coalesce((SELECT jsonb_agg(jsonb_build_object('comparison_id', x.comparison_id, 'metric_key', x.metric_key, 'state', x.state, 'run_at', x.run_at) ORDER BY x.run_at)
                       FROM analytics.comparisons x WHERE (x.cohort_object_a ->> 'object_id')::uuid = o.object_id OR (x.cohort_object_b ->> 'object_id')::uuid = o.object_id), '[]'::jsonb))
    FROM products.semantic_objects o WHERE o.object_id = p_object_id
$$;
CREATE OR REPLACE FUNCTION products.semantic_object_list(p_kind text) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = products, pg_catalog, pg_temp AS $$
  SELECT coalesce(jsonb_agg((to_jsonb(o) - 'scope' - 'correlation_id') || jsonb_build_object('definition', v.definition, 'digest', v.digest) ORDER BY o.kind, o.object_key), '[]'::jsonb)
    FROM products.semantic_objects o JOIN products.semantic_object_versions v ON v.object_id = o.object_id AND v.version = o.current_version
   WHERE p_kind IS NULL OR o.kind = p_kind
$$;
GRANT EXECUTE ON FUNCTION products.semantic_object_read(uuid), products.semantic_object_list(text) TO eye_app, eye_commit;

-- §CO.7 THE COST RECONCILIATION ────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* RECONCILE (analytics.reconciliation.run — an analyst or the owner): the computations this ledger metered in a named period against B91's
   ledger. B91's dimensions are a closed vocabulary (model_inference, source_consumption, storage, simulation_compute, product_consumption) and
   none is analytics: B91 meters NO analytics computation today, and this part registers none (its CHECK and its meters are B91's). A B91
   usage record for a computation is one whose source_kind is `analytics_computation` (or whose capability is `product_analytics`) and whose
   source_ref is the result id — the seam a future meter writes. Per unit:
     MATCHED     a computation with its B91 usage record, the quantity agreeing (unit wall_ms: compute_ms within the tolerance, relative;
                 unit rows: rows_read exactly; any other unit: 1 per computation), PRICED by a B91 cost entry (amount, currency, rate card)
     UNPRICED    a computation B91 never metered (no usage record — today's honest state), or metered but with no cost entry (no rate card)
     DISCREPANT  a usage record whose quantity disagrees beyond the tolerance, or a B91 analytics usage record no computation of this ledger
                 explains (an orphan meter)
   outcome = discrepant if any unit is; else unpriced if any is; else matched; `empty` when the period holds neither — never a silent pass
   (every non-matched outcome carries its reasons). */
CREATE OR REPLACE FUNCTION analytics.reconcile_costs(p_reconciliation uuid, p_tenant uuid, p_domain uuid, p_period text, p_tolerance numeric, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = analytics, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE w record; v_tol numeric := coalesce(p_tolerance, 0.05); v_units jsonb := '[]'::jsonb; c record; u record; e record; v_class text; v_note text; v_expected numeric;
        v_counts jsonb; v_totals jsonb; v_outcome text; v_reasons jsonb := '[]'::jsonb; v_row jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['analytics.reconciliation.run']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS NULL OR p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'cost reconciliation rejected (actor): a reconciliation is recorded under the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO w FROM analytics.period_window(p_period);
  IF w.window_from IS NULL THEN RAISE EXCEPTION 'cost reconciliation rejected (period): % is not a period (2026-Q3, 2026-09 or R90@2026-10-12)', coalesce(p_period, 'null') USING ERRCODE = '22023'; END IF;
  IF v_tol < 0 OR v_tol > 1 THEN RAISE EXCEPTION 'cost reconciliation rejected (tolerance): the tolerance is a share between 0 and 1 (asked %)', v_tol USING ERRCODE = '22023'; END IF;
  IF w.window_to > clock_timestamp() THEN v_reasons := v_reasons || to_jsonb(format('the period %s is open until %s: a partial period is reconciled as far as it goes', p_period, w.window_to)); END IF;
  FOR c IN SELECT * FROM analytics.computation_costs x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.recorded_at >= w.window_from AND x.recorded_at < w.window_to ORDER BY x.recorded_at, x.result_id LOOP
    SELECT * INTO u FROM commercial.usage_records ur WHERE ur.tenant_id = p_tenant AND ur.source_ref = c.result_id::text AND (ur.source_kind = 'analytics_computation' OR ur.capability_key = 'product_analytics')
     ORDER BY ur.recorded_at LIMIT 1;
    IF NOT FOUND THEN
      v_class := 'unpriced'; v_note := 'no B91 usage record meters this computation (B91 meters no analytics dimension today)';
      v_units := v_units || jsonb_build_object('class', v_class, 'result_id', c.result_id, 'metric_key', c.metric_key, 'rows_read', c.rows_read, 'compute_ms', c.compute_ms, 'replay', c.replay, 'preview', c.preview, 'note', v_note);
      CONTINUE;
    END IF;
    v_expected := CASE u.unit WHEN 'wall_ms' THEN c.compute_ms WHEN 'rows' THEN c.rows_read ELSE 1 END;
    IF (u.unit = 'wall_ms' AND abs(u.quantity - v_expected) > v_tol * greatest(v_expected, 1)) OR (u.unit <> 'wall_ms' AND u.quantity <> v_expected) THEN
      v_class := 'discrepant'; v_note := format('B91 metered %s %s; this ledger measured %s', u.quantity, u.unit, v_expected);
      v_units := v_units || jsonb_build_object('class', v_class, 'result_id', c.result_id, 'metric_key', c.metric_key, 'usage_id', u.usage_id, 'unit', u.unit, 'metered', u.quantity, 'measured', v_expected, 'note', v_note);
      CONTINUE;
    END IF;
    SELECT ce.amount, ce.currency, ce.rate_key, ce.rate_version INTO e FROM commercial.cost_entries ce WHERE ce.usage_id = u.usage_id ORDER BY ce.line LIMIT 1;
    IF NOT FOUND THEN
      v_units := v_units || jsonb_build_object('class', 'unpriced', 'result_id', c.result_id, 'metric_key', c.metric_key, 'usage_id', u.usage_id, 'unit', u.unit, 'metered', u.quantity,
                                               'note', 'metered, but no B91 cost entry prices it (no rate card in force for its dimension and unit)');
    ELSE
      v_units := v_units || jsonb_build_object('class', 'matched', 'result_id', c.result_id, 'metric_key', c.metric_key, 'usage_id', u.usage_id, 'unit', u.unit, 'metered', u.quantity, 'measured', v_expected,
                                               'amount', e.amount, 'currency', e.currency, 'rate_key', e.rate_key, 'rate_version', e.rate_version);
    END IF;
  END LOOP;
  -- the orphan meters: B91 analytics usage in the window that no computation of this ledger explains
  FOR u IN SELECT ur.* FROM commercial.usage_records ur
            WHERE ur.tenant_id = p_tenant AND (ur.domain_id = p_domain OR ur.domain_id IS NULL) AND (ur.source_kind = 'analytics_computation' OR ur.capability_key = 'product_analytics')
              AND ur.occurred_at >= w.window_from AND ur.occurred_at < w.window_to
              AND NOT EXISTS (SELECT 1 FROM analytics.computation_costs x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.result_id::text = ur.source_ref)
            ORDER BY ur.occurred_at LOOP
    v_units := v_units || jsonb_build_object('class', 'discrepant', 'usage_id', u.usage_id, 'source_ref', u.source_ref, 'unit', u.unit, 'metered', u.quantity,
                                             'note', 'a B91 analytics usage record that no computation of this ledger explains (an orphan meter)');
  END LOOP;
  SELECT jsonb_build_object('matched', count(*) FILTER (WHERE x ->> 'class' = 'matched'), 'unpriced', count(*) FILTER (WHERE x ->> 'class' = 'unpriced'),
                            'discrepant', count(*) FILTER (WHERE x ->> 'class' = 'discrepant'), 'units', count(*)) INTO v_counts FROM jsonb_array_elements(v_units) x;
  SELECT jsonb_build_object('computations', count(*), 'rows_read', coalesce(sum(x.rows_read), 0), 'compute_ms', coalesce(sum(x.compute_ms), 0), 'replays', count(*) FILTER (WHERE x.replay),
                            'previews', count(*) FILTER (WHERE x.preview),
                            'priced', (SELECT coalesce(jsonb_object_agg(cur, amt), '{}'::jsonb) FROM (SELECT y ->> 'currency' cur, sum((y ->> 'amount')::numeric) amt FROM jsonb_array_elements(v_units) y
                                                                                                         WHERE y ->> 'class' = 'matched' GROUP BY 1) z))
    INTO v_totals FROM analytics.computation_costs x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.recorded_at >= w.window_from AND x.recorded_at < w.window_to;
  v_outcome := CASE WHEN (v_counts ->> 'units')::int = 0 THEN 'empty' WHEN (v_counts ->> 'discrepant')::int > 0 THEN 'discrepant' WHEN (v_counts ->> 'unpriced')::int > 0 THEN 'unpriced' ELSE 'matched' END;
  IF v_outcome = 'empty' THEN v_reasons := v_reasons || to_jsonb(format('nothing to reconcile: no computation was metered in %s and B91 holds no analytics usage for it — not a pass', p_period)); END IF;
  IF (v_counts ->> 'unpriced')::int > 0 THEN v_reasons := v_reasons || to_jsonb(format('%s unit(s) unpriced: the analytics cost is measured here but not priced by B91 (no meter or no rate card)', v_counts ->> 'unpriced')); END IF;
  IF (v_counts ->> 'discrepant')::int > 0 THEN v_reasons := v_reasons || to_jsonb(format('%s unit(s) discrepant: B91''s meter and this ledger disagree, or B91 holds analytics usage no computation explains', v_counts ->> 'discrepant')); END IF;
  v_row := jsonb_build_object('period', p_period, 'tolerance', v_tol, 'outcome', v_outcome, 'units', v_units, 'counts', v_counts, 'totals', v_totals, 'reasons', v_reasons);
  INSERT INTO analytics.reconciliations (reconciliation_id, scope, tenant_id, domain_id, period_key, window_from, window_to, tolerance, outcome, units, counts, totals, reasons, digest, run_by, correlation_id)
  VALUES (p_reconciliation, 'DOMAIN', p_tenant, p_domain, p_period, w.window_from, w.window_to, v_tol, v_outcome, v_units, v_counts, v_totals,
          v_reasons, analytics.digest(v_row), p_actor, p_correlation);
  INSERT INTO analytics.definition_events (event_id, scope, tenant_id, domain_id, subject_kind, subject_id, subject_key, version, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, 'reconciliation', p_reconciliation, p_period, NULL, 'reconciliation.run', p_actor, jsonb_build_object('outcome', v_outcome, 'counts', v_counts), p_correlation);
  RETURN (SELECT to_jsonb(x) - 'tenant_id' - 'domain_id' - 'scope' FROM analytics.reconciliations x WHERE x.reconciliation_id = p_reconciliation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION analytics.reconcile_costs(uuid, uuid, uuid, text, numeric, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION analytics.reconcile_costs(uuid, uuid, uuid, text, numeric, uuid, uuid) TO eye_commit;

/* The reconciliations (newest first) and the meter's rows of a period — INVOKER, under the caller's RLS. */
CREATE OR REPLACE FUNCTION analytics.reconciliation_list(p_limit int) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = analytics, pg_catalog, pg_temp AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(r) - 'tenant_id' - 'domain_id' - 'scope' ORDER BY r.run_at DESC), '[]'::jsonb)
    FROM (SELECT * FROM analytics.reconciliations x ORDER BY x.run_at DESC LIMIT greatest(1, least(coalesce(p_limit, 50), 500))) r
$$;
CREATE OR REPLACE FUNCTION analytics.computation_cost_list(p_period text, p_limit int) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = analytics, pg_catalog, pg_temp AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(c) - 'tenant_id' - 'domain_id' - 'scope' ORDER BY c.recorded_at DESC), '[]'::jsonb)
    FROM (SELECT x.* FROM analytics.computation_costs x LEFT JOIN LATERAL analytics.period_window(p_period) w ON true
           WHERE p_period IS NULL OR (x.recorded_at >= w.window_from AND x.recorded_at < w.window_to)
           ORDER BY x.recorded_at DESC LIMIT greatest(1, least(coalesce(p_limit, 100), 1000))) c
$$;
GRANT EXECUTE ON FUNCTION analytics.reconciliation_list(int), analytics.computation_cost_list(text, int) TO eye_app, eye_commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §UX — the experience-quality workflow (UX-70-001..006, CAP-PD-09)
-- (folded at integration from the part-local file 0113_b92_x_ux.sql, unchanged but for the integrator's marked lines; apply order §0, §MD, §MCA, §MCB, §CO, §UX, §OR, §I)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0113 §UX — CP-6 B92 THE EXPERIENCE-QUALITY WORKFLOW (V9 ch.70 UX-70-001..006, CAP-PD-09 = CAP-DL-11's alias; DESIGN D12–D14) — prefix aux_,
-- schema analytics. Part-local: applies ALONE on 0001–0112 + the §0 prelude. Re-declares NOTHING.
--
--   §UX.1 the vocabulary (outcomes, measures, variant kinds, action kinds, the field names a telemetry definition may never carry)
--   §UX.2 the tables: the salt (no runtime role reads it), CONSENTS (the person's own, append-only, readable by that person only), TELEMETRY
--         DEFINITIONS (versioned; a field whitelist; reviewed by a privacy officer; held / released / retired), TELEMETRY EVENTS (pseudonymous
--         per purpose per UTC day; the bound roles; NO principal id, NO correlation id, NO instant finer than the day; no runtime role reads
--         them — every read aggregates inside a definer and suppresses below k), the refused / uncollected ATTEMPTS (their shape, never their
--         values), JOURNEYS, SEGMENTS, BASELINES, THRESHOLDS, UX EXPERIMENTS (+ approvals, analyses), FINDINGS, ACTIONS, PURGES, EXPORTS and the
--         experience LEDGER
--   §UX.3 the internal helpers (the pseudonym, the arm, the field checks, the measure, the hold)
--   §UX.4 consent (UX1)                         §UX.5 telemetry definitions + privacy review + hold/release/retire (UX2)
--   §UX.6 ingestion (UX3/UX4)                   §UX.7 journeys, segments, baselines, thresholds → a routed REVIEW (UX5)
--   §UX.8 experiments (UX6)                     §UX.9 findings → human-decided actions (UX7)
--   §UX.10 the governed purge (UX8)             §UX.11 the export (UX8)             §UX.12 the reads
--
-- THE PRINCIPLES this part enforces IN ITS PORTS (never only at the PDP):
--   * the person's consent is theirs alone — granted and withdrawn by the person, for an APPROVED purpose, never by another; a consent names
--     the purpose VERSION it was given for: a changed purpose needs a new consent (it never carries over silently);
--   * collection only under an approved purpose, an approved and not-held event definition and the person's CURRENT consent — no consent →
--     NOT collected (a counter row, no shape, no value), never an error that nags the person;
--   * minimisation: a field whitelist (enum | int | duration_ms | bool, bounded), no free text, no content, no identifiers; a field outside it
--     refuses the event (its SHAPE counted: the known field names and the number of unknown ones — never a value, never an unknown name);
--   * pseudonymity: sha256(salt ‖ tenant ‖ principal ‖ purpose ‖ UTC day); no principal id is stored with an event; segments and baselines
--     are suppressed below k distinct pseudonyms (k ≥ 5; counted as the busiest DAY's distinct pseudonyms — a lower bound on distinct persons,
--     since a pseudonym rotates daily);
--   * no experiment manipulates users: variants are layout | wording | ordering | default_visibility, described, approved by the product
--     analytics owner AND the privacy officer (two different humans, neither the proposer); the primary measure is an experience measure, never
--     an engagement proxy; a person who has not consented always sees the control; SRM, a privacy hold or a drifted definition INVALIDATES;
--   * a finding becomes an action only by a named product analytics owner's decision (not the finding's proposer, never an agent), against a
--     consequence PREVIEW the owner saw (its digest) — nothing automatic, nothing preselected;
--   * missing / insufficient / held / partial evidence gives an EXPLAINED indeterminate baseline — never an invented zero or rate.
-- CLAIMS: this is SOFTWARE CAPABILITY. The harness proves it on SYNTHETIC personas and events; a demonstration on eye_demo is a synthetic
-- demonstration; the signed acceptance (UX-70-006's named authorities, the independent conformance package) → R2 / B107, accessibility
-- conformance → B107/H3 — none is claimed here.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- §UX.1 THE VOCABULARY ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* The outcome an event reports (a step's result — never content). */
CREATE OR REPLACE FUNCTION analytics.aux_outcomes() RETURNS text[]
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$ SELECT ARRAY['started', 'success', 'failure', 'error', 'recovered', 'abandoned', 'cancelled'] $$;
/* The experience measures a baseline, a threshold or an experiment's primary measure may name — task success, step latency, error recovery.
   An engagement proxy (time on page, clicks, sessions, return visits) is never one of them (UX-70-005, PR-70-003). */
CREATE OR REPLACE FUNCTION analytics.aux_measures() RETURNS text[]
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$ SELECT ARRAY['task_success_rate', 'step_p50_ms', 'error_recovery_rate'] $$;
/* The ONLY variant kinds an experiment may compare (D13: approved design alternatives — never a dark pattern). */
CREATE OR REPLACE FUNCTION analytics.aux_variant_kinds() RETURNS text[]
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$ SELECT ARRAY['layout', 'wording', 'ordering', 'default_visibility'] $$;
/* The actions a finding may lead to (D14) — each decided by a named human. */
CREATE OR REPLACE FUNCTION analytics.aux_action_kinds() RETURNS text[]
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$ SELECT ARRAY['backlog_item', 'design_change_proposal', 'research_request', 'hold_collection', 'retire_measure'] $$;
/* Field names a telemetry definition may never declare: content, free text, identifiers (and every person dimension). */
CREATE OR REPLACE FUNCTION analytics.aux_forbidden_fields() RETURNS text[]
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT ARRAY['text', 'free_text', 'comment', 'comments', 'query', 'search', 'search_term', 'content', 'message', 'note', 'notes', 'body', 'title', 'name', 'email',
               'url', 'uri', 'path', 'ip', 'ip_address', 'address', 'phone', 'input', 'value', 'label', 'subject', 'description', 'session', 'session_id', 'token', 'cookie',
               'device_id', 'fingerprint', 'user_agent', 'referrer', 'location', 'geo', 'latitude', 'longitude'] || analytics.person_dimensions() $$;
GRANT EXECUTE ON FUNCTION analytics.aux_outcomes(), analytics.aux_measures(), analytics.aux_variant_kinds(), analytics.aux_action_kinds(), analytics.aux_forbidden_fields() TO eye_app, eye_commit;

-- §UX.2 THE TABLES ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* THE SALT of the pseudonyms: one secret row, written here, readable by NO runtime role (no grant, RLS forced with no policy) — only the
   definer ports compute a pseudonym. Never exported, never returned. */
CREATE TABLE analytics.telemetry_salt (
  singleton  boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  salt       bytea NOT NULL CHECK (length(salt) >= 32),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
INSERT INTO analytics.telemetry_salt (singleton, salt) VALUES (true, gen_random_bytes(32));
REVOKE ALL ON analytics.telemetry_salt FROM PUBLIC;
ALTER TABLE analytics.telemetry_salt ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics.telemetry_salt FORCE ROW LEVEL SECURITY;

/* THE CONSENT REGISTER (UX-70-002 `consent`; D12): the PERSON grants or withdraws consent for an APPROVED purpose THEMSELVES — nobody grants
   for another. Append-only history; the CURRENT consent is the person's latest row for the purpose key, and it counts only while it names
   the purpose version approved NOW (a changed purpose needs a new consent). Each person reads only their own rows (RLS); the privacy officer
   reads counts (analytics.aux_consent_summary). */
CREATE TABLE analytics.consents (
  consent_id      uuid PRIMARY KEY,
  scope           text NOT NULL,
  tenant_id       uuid NOT NULL,
  domain_id       uuid NOT NULL,
  principal_id    uuid NOT NULL,
  purpose_key     text NOT NULL,
  purpose_id      uuid NOT NULL REFERENCES analytics.purposes (purpose_id),
  purpose_version int  NOT NULL,
  purpose_digest  text NOT NULL CHECK (purpose_digest ~ '^[0-9a-f]{64}$'),
  decision        text NOT NULL CHECK (decision IN ('granted', 'withdrawn')),
  recorded_at     timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id  uuid NOT NULL,
  CONSTRAINT acn_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX acn_current ON analytics.consents (tenant_id, domain_id, principal_id, purpose_key, recorded_at DESC);

/* THE TELEMETRY EVENT DEFINITIONS (UX-70-002 `metric/event`; D12): versioned per event key; a journey step; an APPROVED purpose of kind
   product_improvement or reliability; a FIELD WHITELIST {name: {type: enum|int|duration_ms|bool, values? | min?/max?}} — no free text, no
   content, no identifiers. proposed (an analyst or the owner) → approved (a named privacy officer, never the proposer: the privacy and
   minimisation review) | rejected; approving supersedes the prior approved version; retention comes from the purpose at approval.
   COLLECTION open | held (the privacy officer, or the owner's hold_collection action): a held definition refuses events (the attempt counted,
   its shape kept). retired: collection stops for good; history stays readable. */
CREATE TABLE analytics.telemetry_definitions (
  definition_id   uuid PRIMARY KEY,
  scope           text NOT NULL,
  tenant_id       uuid NOT NULL,
  domain_id       uuid NOT NULL,
  event_key       text NOT NULL CHECK (event_key ~ '^[a-z][a-z0-9_.-]{2,62}$'),
  version         int  NOT NULL CHECK (version >= 1),
  title           text NOT NULL CHECK (length(btrim(title)) BETWEEN 4 AND 200),
  purpose_key     text NOT NULL,
  purpose_id      uuid REFERENCES analytics.purposes (purpose_id),
  journey_key     text NOT NULL,
  step_key        text NOT NULL,
  fields          jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(fields) = 'object'),
  retention_days  int CHECK (retention_days IS NULL OR retention_days BETWEEN 1 AND 3660),
  state           text NOT NULL DEFAULT 'proposed' CHECK (state IN ('proposed', 'approved', 'rejected', 'superseded', 'retired')),
  collection      text NOT NULL DEFAULT 'open' CHECK (collection IN ('open', 'held')),
  hold_reason     text,
  held_by         uuid,
  held_at         timestamptz,
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
  CONSTRAINT atd_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT atd_version_once UNIQUE (tenant_id, domain_id, event_key, version),
  CONSTRAINT atd_no_person_field CHECK (NOT (analytics.json_keys(fields) && analytics.person_dimensions())),
  CONSTRAINT atd_decided CHECK (state IN ('proposed', 'retired') OR (decided_by IS NOT NULL AND decided_at IS NOT NULL)),
  CONSTRAINT atd_sod CHECK (decided_by IS NULL OR decided_by <> proposed_by),
  CONSTRAINT atd_approved_retention CHECK (state NOT IN ('approved', 'superseded') OR (retention_days IS NOT NULL AND purpose_id IS NOT NULL)),
  CONSTRAINT atd_retired CHECK ((state = 'retired') = (retired_at IS NOT NULL)),
  CONSTRAINT atd_held CHECK ((collection = 'held') = (held_at IS NOT NULL AND length(btrim(coalesce(hold_reason, ''))) >= 8))
);
CREATE UNIQUE INDEX atd_one_approved ON analytics.telemetry_definitions (tenant_id, domain_id, event_key) WHERE state = 'approved';

/* THE TELEMETRY EVENTS (D12): PSEUDONYMOUS, MINIMISED. The pseudonym per purpose per UTC day; the ROLE codes bound to the person in the domain
   (coarse); journey, step, outcome, a duration, the WHITELISTED fields, a device class and a language (both coarse), the experiment arm. NO
   principal id, NO correlation id, NO instant finer than the UTC day (a timestamp would let the audit chain re-identify an event). The event
   id is random (not time-ordered). NO RUNTIME ROLE reads this table: every read aggregates inside a definer and suppresses below k. Never
   updated; deleted ONLY by the governed purge (§UX.10). */
CREATE TABLE analytics.telemetry_events (
  event_id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  definition_id      uuid NOT NULL REFERENCES analytics.telemetry_definitions (definition_id),
  definition_version int  NOT NULL,
  event_key          text NOT NULL,
  purpose_key        text NOT NULL,
  journey_key        text NOT NULL,
  step_key           text NOT NULL,
  pseudonym          text NOT NULL CHECK (pseudonym ~ '^[0-9a-f]{64}$'),
  roles              text[] NOT NULL DEFAULT '{}',
  device_class       text CHECK (device_class IS NULL OR device_class IN ('desktop', 'tablet', 'mobile')),
  locale             text CHECK (locale IS NULL OR locale ~ '^[a-z]{2}$'),
  outcome            text NOT NULL CHECK (outcome = ANY (analytics.aux_outcomes())),
  duration_ms        int CHECK (duration_ms IS NULL OR duration_ms BETWEEN 0 AND 86400000),
  fields             jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(fields) = 'object'),
  experiment_id      uuid,
  variant            text CHECK (variant IS NULL OR variant ~ '^[a-z][a-z0-9_]{0,20}$'),
  event_day          date NOT NULL,
  CONSTRAINT aev_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT aev_no_person_field CHECK (NOT (analytics.json_keys(fields) && analytics.person_dimensions())),
  CONSTRAINT aev_variant CHECK ((experiment_id IS NULL) = (variant IS NULL))
);
CREATE INDEX aev_journey ON analytics.telemetry_events (tenant_id, domain_id, journey_key, event_day);
CREATE INDEX aev_definition ON analytics.telemetry_events (definition_id, event_day);
CREATE INDEX aev_experiment ON analytics.telemetry_events (experiment_id) WHERE experiment_id IS NOT NULL;
CREATE OR REPLACE FUNCTION analytics.aux_events_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('eye.aux_purge', true) = 'on' THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'telemetry event rejected (state): telemetry events are append-only; only the governed purge (analytics.telemetry.purge) deletes them' USING ERRCODE = '22023';
END $$;
CREATE TRIGGER aev_guard BEFORE UPDATE OR DELETE ON analytics.telemetry_events FOR EACH ROW EXECUTE FUNCTION analytics.aux_events_guard();

/* THE ATTEMPTS NOT COLLECTED (UX-70-005 "preserve raw evidence"): a person without consent (no shape — nothing of theirs is kept), a held or
   retired definition, an unavailable purpose, a field outside the whitelist. The SHAPE is the known field names and the number of unknown
   ones — never a value, never an unknown name. The UTC day only; no principal. Append-only. */
CREATE TABLE analytics.telemetry_attempts (
  attempt_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope           text NOT NULL,
  tenant_id       uuid NOT NULL,
  domain_id       uuid NOT NULL,
  definition_id   uuid NOT NULL REFERENCES analytics.telemetry_definitions (definition_id),
  event_key       text NOT NULL,
  disposition     text NOT NULL CHECK (disposition IN ('not_consented', 'held', 'retired', 'purpose_unavailable', 'minimisation')),
  shape           jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(shape) = 'object'),
  event_day       date NOT NULL,
  CONSTRAINT aat_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT aat_no_shape_without_consent CHECK (disposition <> 'not_consented' OR shape = '{}'::jsonb)
);
CREATE INDEX aat_definition ON analytics.telemetry_attempts (definition_id, disposition);

/* THE JOURNEYS (UX-70-002 `journey`; UX-70-001's four-part anatomy): the QUALITY OBJECTIVE first (the statement, the strategy objectives it
   serves), the ordered steps, the purpose its telemetry serves, the floor a baseline needs. Versioned: a new version supersedes. */
CREATE TABLE analytics.experience_journeys (
  journey_id      uuid PRIMARY KEY,
  scope           text NOT NULL,
  tenant_id       uuid NOT NULL,
  domain_id       uuid NOT NULL,
  journey_key     text NOT NULL CHECK (journey_key ~ '^[a-z][a-z0-9_.-]{2,62}$'),
  version         int  NOT NULL CHECK (version >= 1),
  title           text NOT NULL CHECK (length(btrim(title)) BETWEEN 4 AND 200),
  purpose_key     text NOT NULL,
  objective       text NOT NULL CHECK (length(btrim(objective)) BETWEEN 16 AND 2000),
  objective_ids   uuid[] NOT NULL DEFAULT '{}',
  steps           text[] NOT NULL CHECK (cardinality(steps) BETWEEN 2 AND 20),
  floor_n         int  NOT NULL DEFAULT 5 CHECK (floor_n >= 1),
  state           text NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'superseded', 'retired')),
  declared_by     uuid NOT NULL,
  declared_at     timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id  uuid NOT NULL,
  CONSTRAINT ajn_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT ajn_version_once UNIQUE (tenant_id, domain_id, journey_key, version)
);
CREATE UNIQUE INDEX ajn_one_active ON analytics.experience_journeys (tenant_id, domain_id, journey_key) WHERE state = 'active';

/* THE SEGMENTS (UX-70-002 `segment`): role | device_class | locale — never a person; read only above k (k_min ≥ 5). */
CREATE TABLE analytics.experience_segments (
  segment_id      uuid PRIMARY KEY,
  scope           text NOT NULL,
  tenant_id       uuid NOT NULL,
  domain_id       uuid NOT NULL,
  segment_key     text NOT NULL CHECK (segment_key ~ '^[a-z][a-z0-9_.-]{2,62}$'),
  dimension       text NOT NULL CHECK (dimension IN ('role', 'device_class', 'locale')),
  value           text NOT NULL CHECK (length(value) BETWEEN 2 AND 64),
  k_min           int  NOT NULL DEFAULT 5 CHECK (k_min >= 5),
  state           text NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'retired')),
  declared_by     uuid NOT NULL,
  declared_at     timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id  uuid NOT NULL,
  CONSTRAINT asg_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE UNIQUE INDEX asg_one_active ON analytics.experience_segments (tenant_id, domain_id, segment_key) WHERE state = 'active';

/* THE BASELINES (UX-70-002 `baseline`): a MEASURED value of an experience measure over a named period (the prelude's period vocabulary),
   for a journey (a step for the latency), a segment or the whole journey — recorded by an analyst FROM THE EVENTS, with n, k, the floor,
   the uncertainty, the definitions it rests on and its source revision. Indeterminate (value NULL, reasons) below the floor, below k, with a
   held definition, for a partial period. A crossing of an approved threshold is recorded and routed as a REVIEW. Append-only. */
CREATE TABLE analytics.experience_baselines (
  baseline_id       uuid PRIMARY KEY,
  scope             text NOT NULL,
  tenant_id         uuid NOT NULL,
  domain_id         uuid NOT NULL,
  journey_id        uuid NOT NULL REFERENCES analytics.experience_journeys (journey_id),
  journey_key       text NOT NULL,
  journey_version   int  NOT NULL,
  measure           text NOT NULL CHECK (measure = ANY (analytics.aux_measures())),
  step_key          text,
  segment_id        uuid REFERENCES analytics.experience_segments (segment_id),
  segment_key       text,
  segment           jsonb,
  period_key        text NOT NULL,
  window_from       date NOT NULL,
  window_to         date NOT NULL,
  state             text NOT NULL CHECK (state IN ('determinate', 'indeterminate')),
  value             numeric,
  numerator         numeric,
  denominator       numeric,
  n                 int NOT NULL,
  k_observed        int NOT NULL,
  k_min             int NOT NULL,
  floor_n           int NOT NULL,
  distribution      jsonb,
  uncertainty       jsonb,
  reasons           jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(reasons) = 'array'),
  definitions_used  jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_revision   text NOT NULL CHECK (source_revision ~ '^[0-9a-f]{64}$'),
  crossings         jsonb NOT NULL DEFAULT '[]'::jsonb,
  recorded_by       uuid NOT NULL,
  recorded_by_kind  text NOT NULL,
  recorded_at       timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id    uuid NOT NULL,
  CONSTRAINT abl_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT abl_value_state CHECK ((state = 'determinate') = (value IS NOT NULL)),
  CONSTRAINT abl_reasons_state CHECK (state = 'determinate' OR jsonb_array_length(reasons) >= 1),
  CONSTRAINT abl_step CHECK ((measure = 'step_p50_ms') = (step_key IS NOT NULL))
);
CREATE INDEX abl_lookup ON analytics.experience_baselines (tenant_id, domain_id, journey_key, measure, period_key, recorded_at DESC);

/* THE THRESHOLDS (UX-70-002 `threshold`): proposed by an analyst, APPROVED by a named product analytics owner (never the proposer); a crossing
   opens a REVIEW (analytics.experience) — never an automatic or punitive decision (App M Action control). */
CREATE TABLE analytics.experience_thresholds (
  threshold_id    uuid PRIMARY KEY,
  scope           text NOT NULL,
  tenant_id       uuid NOT NULL,
  domain_id       uuid NOT NULL,
  journey_key     text NOT NULL,
  measure         text NOT NULL CHECK (measure = ANY (analytics.aux_measures())),
  step_key        text,
  segment_key     text,
  bound           text NOT NULL CHECK (bound IN ('min', 'max')),
  value           numeric NOT NULL,
  rationale       text NOT NULL CHECK (length(btrim(rationale)) >= 8),
  state           text NOT NULL DEFAULT 'proposed' CHECK (state IN ('proposed', 'approved', 'rejected', 'retired')),
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
  CONSTRAINT ath_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT ath_sod CHECK (decided_by IS NULL OR decided_by <> proposed_by),
  CONSTRAINT ath_step CHECK ((measure = 'step_p50_ms') = (step_key IS NOT NULL)),
  CONSTRAINT ath_rate_bounds CHECK (measure = 'step_p50_ms' OR value BETWEEN 0 AND 1)
);

/* THE UX EXPERIMENTS (UX-70-002 `experiment`; D13): a hypothesis, an experience PRIMARY MEASURE, 2–4 variants of the four admitted kinds
   (`control` first — the current design), a minimum sample per arm. proposed → running (BOTH approvals: the product analytics owner AND the
   privacy officer, two humans, neither the proposer, at the experiment's digest) | rejected; running → invalidated (SRM, a privacy hold, a
   drifted definition — routed) | concluded (a named owner, with the analysis). */
CREATE TABLE analytics.ux_experiments (
  experiment_id     uuid PRIMARY KEY,
  scope             text NOT NULL,
  tenant_id         uuid NOT NULL,
  domain_id         uuid NOT NULL,
  journey_key       text NOT NULL,
  journey_version   int  NOT NULL,
  purpose_key       text NOT NULL,
  title             text NOT NULL CHECK (length(btrim(title)) BETWEEN 4 AND 200),
  hypothesis        text NOT NULL CHECK (length(btrim(hypothesis)) BETWEEN 16 AND 2000),
  primary_measure   text NOT NULL CHECK (primary_measure = ANY (analytics.aux_measures())),
  step_key          text,
  variants          jsonb NOT NULL CHECK (jsonb_typeof(variants) = 'array' AND jsonb_array_length(variants) BETWEEN 2 AND 4),
  min_sample_per_arm int NOT NULL CHECK (min_sample_per_arm BETWEEN 5 AND 1000000),
  state             text NOT NULL DEFAULT 'proposed' CHECK (state IN ('proposed', 'running', 'rejected', 'invalidated', 'concluded')),
  digest            text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  proposed_by       uuid NOT NULL,
  proposed_by_kind  text NOT NULL,
  proposed_at       timestamptz NOT NULL DEFAULT clock_timestamp(),
  started_at        timestamptz,
  invalidated_at    timestamptz,
  invalidation      jsonb,
  concluded_by      uuid,
  concluded_at      timestamptz,
  conclusion        jsonb,
  correlation_id    uuid NOT NULL,
  CONSTRAINT aex_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT aex_step CHECK ((primary_measure = 'step_p50_ms') = (step_key IS NOT NULL)),
  CONSTRAINT aex_running CHECK (state NOT IN ('running', 'concluded') OR started_at IS NOT NULL),
  CONSTRAINT aex_invalidated CHECK ((state = 'invalidated') = (invalidated_at IS NOT NULL) OR (state = 'concluded' AND invalidated_at IS NOT NULL)),
  CONSTRAINT aex_concluded CHECK ((state = 'concluded') = (concluded_at IS NOT NULL))
);
CREATE TABLE analytics.ux_experiment_approvals (
  approval_id     uuid PRIMARY KEY,
  scope           text NOT NULL,
  tenant_id       uuid NOT NULL,
  domain_id       uuid NOT NULL,
  experiment_id   uuid NOT NULL REFERENCES analytics.ux_experiments (experiment_id),
  role            text NOT NULL CHECK (role IN ('product_analytics_owner', 'privacy_officer')),
  decision        text NOT NULL CHECK (decision IN ('approve', 'reject')),
  approver        uuid NOT NULL,
  reason          text NOT NULL CHECK (length(btrim(reason)) >= 8),
  digest          text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  decided_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id  uuid NOT NULL,
  CONSTRAINT aea_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT aea_once UNIQUE (experiment_id, role)
);
CREATE TABLE analytics.ux_experiment_analyses (
  analysis_id       uuid PRIMARY KEY,
  scope             text NOT NULL,
  tenant_id         uuid NOT NULL,
  domain_id         uuid NOT NULL,
  experiment_id     uuid NOT NULL REFERENCES analytics.ux_experiments (experiment_id),
  verdict           text NOT NULL CHECK (verdict IN ('valid', 'invalid', 'insufficient')),
  arms              jsonb NOT NULL CHECK (jsonb_typeof(arms) = 'array'),
  comparisons       jsonb NOT NULL DEFAULT '[]'::jsonb,
  srm               jsonb NOT NULL,
  checks            jsonb NOT NULL DEFAULT '[]'::jsonb,
  reasons           jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(reasons) = 'array'),
  digest            text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  analysed_by       uuid NOT NULL,
  analysed_by_kind  text NOT NULL,
  analysed_at       timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id    uuid NOT NULL,
  CONSTRAINT aen_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT aen_reasons CHECK (verdict = 'valid' OR jsonb_array_length(reasons) >= 1)
);

/* THE FINDINGS (UX-70-002 `finding`; D14): from a baseline, a threshold crossing, an experiment or a product metric result — proposed by an
   analyst, the owner or an AGENT (AI may propose); a proposed finding is routed for the owner's review. */
CREATE TABLE analytics.experience_findings (
  finding_id        uuid PRIMARY KEY,
  scope             text NOT NULL,
  tenant_id         uuid NOT NULL,
  domain_id         uuid NOT NULL,
  origin_kind       text NOT NULL CHECK (origin_kind IN ('baseline', 'threshold', 'experiment', 'result')),
  origin_id         uuid NOT NULL,
  journey_key       text,
  statement         text NOT NULL CHECK (length(btrim(statement)) BETWEEN 16 AND 4000),
  evidence          jsonb NOT NULL DEFAULT '{}'::jsonb,
  state             text NOT NULL DEFAULT 'proposed' CHECK (state IN ('proposed', 'actioned', 'dismissed')),
  digest            text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  proposed_by       uuid NOT NULL,
  proposed_by_kind  text NOT NULL,
  proposed_at       timestamptz NOT NULL DEFAULT clock_timestamp(),
  decided_at        timestamptz,
  item_id           uuid,
  correlation_id    uuid NOT NULL,
  CONSTRAINT afi_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT afi_decided CHECK ((state = 'proposed') = (decided_at IS NULL))
);
/* THE ACTIONS (UX-70-002 `action`; UX-70-004): a named product analytics owner's decision on a finding (act | dismiss), of a kind, against the
   consequence PREVIEW they saw (its digest); the effect recorded. One per finding. Append-only. */
CREATE TABLE analytics.experience_actions (
  action_id       uuid PRIMARY KEY,
  scope           text NOT NULL,
  tenant_id       uuid NOT NULL,
  domain_id       uuid NOT NULL,
  finding_id      uuid NOT NULL REFERENCES analytics.experience_findings (finding_id),
  decision        text NOT NULL CHECK (decision IN ('act', 'dismiss')),
  kind            text CHECK (kind IS NULL OR kind = ANY (analytics.aux_action_kinds())),
  target_kind     text,
  target_id       uuid,
  preview         jsonb NOT NULL,
  preview_digest  text NOT NULL CHECK (preview_digest ~ '^[0-9a-f]{64}$'),
  reason          text NOT NULL CHECK (length(btrim(reason)) >= 8),
  effect          jsonb NOT NULL DEFAULT '{}'::jsonb,
  decided_by      uuid NOT NULL,
  decided_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id  uuid NOT NULL,
  CONSTRAINT aac_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT aac_once UNIQUE (finding_id),
  CONSTRAINT aac_kind CHECK ((decision = 'act') = (kind IS NOT NULL))
);

/* THE GOVERNED PURGES (D12): raw events older than their definition's purpose-bound retention, deleted by a named privacy officer; the
   counts per definition recorded (a zero is recorded too — never silently). Append-only. */
CREATE TABLE analytics.telemetry_purges (
  purge_id        uuid PRIMARY KEY,
  scope           text NOT NULL,
  tenant_id       uuid NOT NULL,
  domain_id       uuid NOT NULL,
  reason          text NOT NULL CHECK (length(btrim(reason)) >= 8),
  as_of_day       date NOT NULL,
  counts          jsonb NOT NULL CHECK (jsonb_typeof(counts) = 'array'),
  total_deleted   int  NOT NULL CHECK (total_deleted >= 0),
  purged_by       uuid NOT NULL,
  purged_at       timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id  uuid NOT NULL,
  CONSTRAINT apg_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);

/* THE EXPORTS (UX-70-003 `export`; D14): an AGGREGATE package — purposes, event definitions, journeys, segments, baselines (below k
   suppressed), thresholds, experiments and their analyses (arms below k suppressed), findings, actions, purges — canonical JSON with its
   sha256; NEVER a raw event, a pseudonym or a consent row. Append-only. */
CREATE TABLE analytics.exports (
  export_id       uuid PRIMARY KEY,
  scope           text NOT NULL,
  tenant_id       uuid NOT NULL,
  domain_id       uuid NOT NULL,
  title           text NOT NULL CHECK (length(btrim(title)) BETWEEN 4 AND 200),
  schema_ref      text NOT NULL,
  package         jsonb NOT NULL,
  canonical_bytes int  NOT NULL,
  digest          text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  created_by      uuid NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id  uuid NOT NULL,
  CONSTRAINT aexp_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);

/* THE EXPERIENCE LEDGER (UX-70-003 "attributable, recoverable, replayable"): every governed act of this part (never an event's recording —
   that would link a person to an instant). Append-only. */
CREATE TABLE analytics.experience_events (
  event_id           uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  subject_kind       text NOT NULL CHECK (subject_kind IN ('telemetry_definition', 'journey', 'segment', 'baseline', 'threshold', 'experiment', 'finding', 'action', 'purge', 'export')),
  subject_id         uuid NOT NULL,
  subject_key        text,
  version            int,
  event              text NOT NULL CHECK (event ~ '^[a-z_]+\.[a-z_.]+$'),
  actor_principal_id uuid NOT NULL,
  details            jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT axe_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX axe_subject ON analytics.experience_events (subject_id, occurred_at);

CREATE TRIGGER acn_append_only BEFORE UPDATE OR DELETE ON analytics.consents FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
CREATE TRIGGER aat_append_only BEFORE UPDATE OR DELETE ON analytics.telemetry_attempts FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
CREATE TRIGGER abl_append_only BEFORE UPDATE OR DELETE ON analytics.experience_baselines FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
CREATE TRIGGER aea_append_only BEFORE UPDATE OR DELETE ON analytics.ux_experiment_approvals FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
CREATE TRIGGER aen_append_only BEFORE UPDATE OR DELETE ON analytics.ux_experiment_analyses FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
CREATE TRIGGER aac_append_only BEFORE UPDATE OR DELETE ON analytics.experience_actions FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
CREATE TRIGGER apg_append_only BEFORE UPDATE OR DELETE ON analytics.telemetry_purges FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
CREATE TRIGGER aexp_append_only BEFORE UPDATE OR DELETE ON analytics.exports FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
CREATE TRIGGER axe_append_only BEFORE UPDATE OR DELETE ON analytics.experience_events FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

-- RLS and grants (the 0081 loop idiom): SELECT to eye_app and eye_commit under domain isolation; no write grant — the definer ports write.
-- THE EXCEPTIONS: the consents are readable by the PERSON only (principal_id = the session's principal); the telemetry events and the salt
-- are readable by NO runtime role at all.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['telemetry_definitions', 'telemetry_attempts', 'experience_journeys', 'experience_segments', 'experience_baselines', 'experience_thresholds',
                           'ux_experiments', 'ux_experiment_approvals', 'ux_experiment_analyses', 'experience_findings', 'experience_actions', 'telemetry_purges', 'exports',
                           'experience_events'] LOOP
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
REVOKE ALL ON analytics.consents FROM PUBLIC;
ALTER TABLE analytics.consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics.consents FORCE ROW LEVEL SECURITY;
CREATE POLICY own_consent ON analytics.consents
  USING (tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain()) AND principal_id = public.eye_principal());
GRANT SELECT ON analytics.consents TO eye_app, eye_commit;
REVOKE ALL ON analytics.telemetry_events FROM PUBLIC;
ALTER TABLE analytics.telemetry_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics.telemetry_events FORCE ROW LEVEL SECURITY;
CREATE POLICY domain_isolation ON analytics.telemetry_events
  USING (tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain()));
-- (no GRANT on analytics.telemetry_events or analytics.telemetry_salt — by design)

-- §UX.3 THE INTERNAL HELPERS (REVOKE PUBLIC; called by this part's definer ports) ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION analytics.aux_assert_actor(p_noun text, p_actor uuid) RETURNS void
LANGUAGE plpgsql SET search_path = analytics, pg_catalog, pg_temp AS $$
BEGIN
  IF p_actor IS NULL OR p_actor IS DISTINCT FROM public.eye_principal() THEN
    RAISE EXCEPTION '% rejected (actor): the act is recorded under the acting principal', p_noun USING ERRCODE = '42501';
  END IF;
END $$;
REVOKE ALL ON FUNCTION analytics.aux_assert_actor(text, uuid) FROM PUBLIC;

/* The kind of an active principal (human | agent | workload | system), NULL when not active. */
CREATE OR REPLACE FUNCTION analytics.aux_kind(p_principal uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = identity, pg_catalog, pg_temp AS $$
  SELECT p.kind FROM identity.principals p WHERE p.id = p_principal AND p.status = 'active'
$$;
REVOKE ALL ON FUNCTION analytics.aux_kind(uuid) FROM PUBLIC;

/* A principal (any kind) holding one of the roles in the domain (or at the tenant). */
CREATE OR REPLACE FUNCTION analytics.aux_holds(p_principal uuid, p_tenant uuid, p_domain uuid, p_roles text[]) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = identity, pg_catalog, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM identity.role_bindings b JOIN identity.principals p ON p.id = b.principal_id
                  WHERE b.principal_id = p_principal AND p.status = 'active' AND b.revoked_at IS NULL AND b.role_code = ANY (p_roles) AND b.tenant_id = p_tenant
                    AND ((b.scope = 'DOMAIN' AND b.domain_id = p_domain) OR b.scope = 'TENANT'))
$$;
REVOKE ALL ON FUNCTION analytics.aux_holds(uuid, uuid, uuid, text[]) FROM PUBLIC;

/* The acting principal is a NAMED HUMAN holding one of the roles: an agent / system is refused (actor), a human without the role (authority). */
CREATE OR REPLACE FUNCTION analytics.aux_assert_human(p_noun text, p_actor uuid, p_tenant uuid, p_domain uuid, p_roles text[], p_what text) RETURNS void
LANGUAGE plpgsql SET search_path = analytics, pg_catalog, pg_temp AS $$
BEGIN
  IF analytics.aux_kind(p_actor) IS DISTINCT FROM 'human' THEN
    RAISE EXCEPTION '% rejected (actor): % is a named human''s act; an agent or a system never does it', p_noun, p_what USING ERRCODE = '42501';
  END IF;
  IF NOT analytics.aux_holds(p_actor, p_tenant, p_domain, p_roles) THEN
    RAISE EXCEPTION '% rejected (authority): % is done by a holder of % in this domain', p_noun, p_what, array_to_string(p_roles, ' or ') USING ERRCODE = '42501';
  END IF;
END $$;
REVOKE ALL ON FUNCTION analytics.aux_assert_human(text, uuid, uuid, uuid, text[], text) FROM PUBLIC;

/* The role codes bound to a principal in the domain (the event's coarse role). */
CREATE OR REPLACE FUNCTION analytics.aux_roles_of(p_principal uuid, p_tenant uuid, p_domain uuid) RETURNS text[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = identity, pg_catalog, pg_temp AS $$
  SELECT coalesce(array_agg(DISTINCT b.role_code ORDER BY b.role_code), '{}') FROM identity.role_bindings b
   WHERE b.principal_id = p_principal AND b.revoked_at IS NULL AND b.tenant_id = p_tenant AND ((b.scope = 'DOMAIN' AND b.domain_id = p_domain) OR b.scope = 'TENANT')
$$;
REVOKE ALL ON FUNCTION analytics.aux_roles_of(uuid, uuid, uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION analytics.aux_ledger(p_tenant uuid, p_domain uuid, p_kind text, p_subject uuid, p_key text, p_version int, p_event text, p_actor uuid, p_details jsonb, p_correlation uuid) RETURNS void
LANGUAGE sql SET search_path = analytics, pg_catalog, pg_temp AS $$
  INSERT INTO analytics.experience_events (event_id, scope, tenant_id, domain_id, subject_kind, subject_id, subject_key, version, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_kind, p_subject, p_key, p_version, p_event, p_actor, coalesce(p_details, '{}'::jsonb), p_correlation)
$$;
REVOKE ALL ON FUNCTION analytics.aux_ledger(uuid, uuid, text, uuid, text, int, text, uuid, jsonb, uuid) FROM PUBLIC;

/* The APPROVED purpose of a key (NULL row when none). */
CREATE OR REPLACE FUNCTION analytics.aux_purpose(p_tenant uuid, p_domain uuid, p_key text) RETURNS analytics.purposes
LANGUAGE sql STABLE SET search_path = analytics, pg_catalog, pg_temp AS $$
  SELECT p.* FROM analytics.purposes p WHERE p.tenant_id = p_tenant AND p.domain_id = p_domain AND p.purpose_key = p_key AND p.state = 'approved'
$$;
REVOKE ALL ON FUNCTION analytics.aux_purpose(uuid, uuid, text) FROM PUBLIC;

/* THE CURRENT CONSENT of a person for a purpose: their latest row is a grant AND it names the purpose version approved now. Under a runtime
   role (the self read) RLS shows the caller's own rows only; inside the definer ports it is the port's check. */
CREATE OR REPLACE FUNCTION analytics.aux_consented(p_tenant uuid, p_domain uuid, p_principal uuid, p_purpose_key text) RETURNS boolean
LANGUAGE sql STABLE SET search_path = analytics, pg_catalog, pg_temp AS $$
  SELECT coalesce((SELECT c.decision = 'granted' AND c.purpose_id = (SELECT p.purpose_id FROM analytics.purposes p
                                                                       WHERE p.tenant_id = p_tenant AND p.domain_id = p_domain AND p.purpose_key = p_purpose_key AND p.state = 'approved')
                     FROM analytics.consents c
                    WHERE c.tenant_id = p_tenant AND c.domain_id = p_domain AND c.principal_id = p_principal AND c.purpose_key = p_purpose_key
                    ORDER BY c.recorded_at DESC, c.consent_id DESC LIMIT 1), false)
$$;
REVOKE ALL ON FUNCTION analytics.aux_consented(uuid, uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION analytics.aux_consented(uuid, uuid, uuid, text) TO eye_app, eye_commit;

/* THE PSEUDONYM (D4/D12): sha256(salt ‖ tenant ‖ principal ‖ purpose ‖ UTC day) — per purpose, per day; the salt is unreadable by any runtime
   role. Internal (the ports and the assignment read compute it; nothing returns it). */
CREATE OR REPLACE FUNCTION analytics.aux_pseudonym(p_tenant uuid, p_principal uuid, p_purpose_key text, p_day date) RETURNS text
LANGUAGE sql STABLE SET search_path = analytics, public, pg_catalog, pg_temp AS $$
  SELECT encode(sha256((SELECT s.salt FROM analytics.telemetry_salt s WHERE s.singleton) ||
                       convert_to(format('%s|%s|%s|%s', p_tenant, p_principal, p_purpose_key, to_char(p_day, 'YYYY-MM-DD')), 'UTF8')), 'hex')
$$;
REVOKE ALL ON FUNCTION analytics.aux_pseudonym(uuid, uuid, text, date) FROM PUBLIC;

/* THE ARM of a person in an experiment: deterministic from a per-experiment pseudonym sha256(salt ‖ 'experiment' ‖ experiment ‖ principal) —
   stable for the person over the experiment (no daily flip of the design they see), never stored (only the arm is stored with an event). */
CREATE OR REPLACE FUNCTION analytics.aux_arm(p_experiment uuid, p_principal uuid, p_arms int) RETURNS int
LANGUAGE sql STABLE SET search_path = analytics, public, pg_catalog, pg_temp AS $$
  SELECT ((get_byte(h, 0)::bigint * 16777216 + get_byte(h, 1) * 65536 + get_byte(h, 2) * 256 + get_byte(h, 3)) % greatest(p_arms, 1))::int
    FROM (SELECT sha256((SELECT s.salt FROM analytics.telemetry_salt s WHERE s.singleton) || convert_to(format('experiment|%s|%s', p_experiment, p_principal), 'UTF8')) AS h) z
$$;
REVOKE ALL ON FUNCTION analytics.aux_arm(uuid, uuid, int) FROM PUBLIC;

/* THE UTC DAY of now. */
CREATE OR REPLACE FUNCTION analytics.aux_today() RETURNS date
LANGUAGE sql STABLE SET search_path = pg_catalog, pg_temp AS $$ SELECT (clock_timestamp() AT TIME ZONE 'UTC')::date $$;
GRANT EXECUTE ON FUNCTION analytics.aux_today() TO eye_app, eye_commit;

/* A FIELD WHITELIST's form (UX2: minimisation). ≤ 12 fields; a name ^[a-z][a-z0-9_]{1,40}$ that is neither content, free text, an identifier
   nor a person; a type enum (1–30 values) | int (bounded) | duration_ms (bounded, 0–86 400 000) | bool. */
CREATE OR REPLACE FUNCTION analytics.aux_assert_fields(p_fields jsonb) RETURNS void
LANGUAGE plpgsql IMMUTABLE SET search_path = analytics, pg_catalog, pg_temp AS $$
DECLARE k text; s jsonb; v jsonb;
BEGIN
  IF jsonb_typeof(p_fields) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'telemetry definition rejected (fields): the fields are an object {name: {type, …}}' USING ERRCODE = '22023'; END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(p_fields)) > 12 THEN RAISE EXCEPTION 'telemetry definition rejected (minimisation): at most 12 fields — collect what the purpose needs, nothing more' USING ERRCODE = '22023'; END IF;
  FOR k, s IN SELECT * FROM jsonb_each(p_fields) LOOP
    IF k !~ '^[a-z][a-z0-9_]{1,40}$' THEN RAISE EXCEPTION 'telemetry definition rejected (fields): the field name % is ^[a-z][a-z0-9_]{1,40}$', k USING ERRCODE = '22023'; END IF;
    IF k = ANY (analytics.aux_forbidden_fields()) OR k ~ '(_id|_name|_text|_email|_url|_query|_comment|_content|_message|_address|_ip)$' THEN
      RAISE EXCEPTION 'telemetry definition rejected (minimisation): the field % would carry content, free text, an identifier or a person — telemetry carries enumerations, bounded numbers, durations and flags only', k USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(s) IS DISTINCT FROM 'object' OR s ->> 'type' IS NULL OR NOT (s ->> 'type' = ANY (ARRAY['enum', 'int', 'duration_ms', 'bool'])) THEN
      RAISE EXCEPTION 'telemetry definition rejected (minimisation): the field % has a type enum | int | duration_ms | bool (free text is never a type)', k USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_object_keys(s) x WHERE x NOT IN ('type', 'values', 'min', 'max')) THEN
      RAISE EXCEPTION 'telemetry definition rejected (fields): the field % declares only type, values, min, max', k USING ERRCODE = '22023';
    END IF;
    IF s ->> 'type' = 'enum' THEN
      IF jsonb_typeof(s -> 'values') IS DISTINCT FROM 'array' OR jsonb_array_length(s -> 'values') NOT BETWEEN 1 AND 30 THEN
        RAISE EXCEPTION 'telemetry definition rejected (fields): the enum field % lists 1–30 allowed values', k USING ERRCODE = '22023';
      END IF;
      FOR v IN SELECT * FROM jsonb_array_elements(s -> 'values') LOOP
        IF jsonb_typeof(v) IS DISTINCT FROM 'string' OR (v #>> '{}') !~ '^[a-z0-9_.-]{1,40}$' THEN
          RAISE EXCEPTION 'telemetry definition rejected (fields): the enum field %''s values are codes ^[a-z0-9_.-]{1,40}$', k USING ERRCODE = '22023';
        END IF;
      END LOOP;
    ELSIF s ->> 'type' IN ('int', 'duration_ms') THEN
      IF jsonb_typeof(s -> 'min') IS DISTINCT FROM 'number' OR jsonb_typeof(s -> 'max') IS DISTINCT FROM 'number'
         OR (s ->> 'min')::numeric <> trunc((s ->> 'min')::numeric) OR (s ->> 'max')::numeric <> trunc((s ->> 'max')::numeric)
         OR (s ->> 'min')::numeric > (s ->> 'max')::numeric THEN
        RAISE EXCEPTION 'telemetry definition rejected (fields): the % field % declares integer bounds min ≤ max', s ->> 'type', k USING ERRCODE = '22023';
      END IF;
      IF s ->> 'type' = 'duration_ms' AND ((s ->> 'min')::numeric < 0 OR (s ->> 'max')::numeric > 86400000) THEN
        RAISE EXCEPTION 'telemetry definition rejected (fields): the duration field % is bounded within 0–86 400 000 ms', k USING ERRCODE = '22023';
      END IF;
      IF s ->> 'type' = 'int' AND ((s ->> 'min')::numeric < -1000000000 OR (s ->> 'max')::numeric > 1000000000) THEN
        RAISE EXCEPTION 'telemetry definition rejected (fields): the int field % is bounded within ±1 000 000 000', k USING ERRCODE = '22023';
      END IF;
    ELSIF s ? 'values' OR s ? 'min' OR s ? 'max' THEN
      RAISE EXCEPTION 'telemetry definition rejected (fields): the bool field % declares no values or bounds', k USING ERRCODE = '22023';
    END IF;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION analytics.aux_assert_fields(jsonb) FROM PUBLIC;

/* AN EVENT's fields against the whitelist: {ok, problems[] (never a value), known[] (names), unknown (a count — an unknown NAME is not kept)}. */
CREATE OR REPLACE FUNCTION analytics.aux_check_fields(p_spec jsonb, p_fields jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path = analytics, pg_catalog, pg_temp AS $$
DECLARE k text; v jsonb; s jsonb; v_known text[] := '{}'; v_unknown int := 0; v_problems text[] := '{}';
BEGIN
  IF p_fields IS NULL OR p_fields = 'null'::jsonb THEN RETURN jsonb_build_object('ok', true, 'problems', '[]'::jsonb, 'known', '[]'::jsonb, 'unknown', 0); END IF;
  IF jsonb_typeof(p_fields) <> 'object' THEN RETURN jsonb_build_object('ok', false, 'problems', jsonb_build_array('the fields are an object'), 'known', '[]'::jsonb, 'unknown', 0); END IF;
  FOR k, v IN SELECT * FROM jsonb_each(p_fields) LOOP
    s := p_spec -> k;
    IF s IS NULL THEN v_unknown := v_unknown + 1; CONTINUE; END IF;
    v_known := v_known || k;
    IF s ->> 'type' = 'enum' AND NOT (jsonb_typeof(v) = 'string' AND (s -> 'values') @> jsonb_build_array(v)) THEN
      v_problems := v_problems || format('the field %s is outside its allowed values', k);
    ELSIF s ->> 'type' IN ('int', 'duration_ms') AND NOT (jsonb_typeof(v) = 'number' AND (v #>> '{}')::numeric = trunc((v #>> '{}')::numeric)
                                                        AND (v #>> '{}')::numeric BETWEEN (s ->> 'min')::numeric AND (s ->> 'max')::numeric) THEN
      v_problems := v_problems || format('the field %s is not an integer within its bounds', k);
    ELSIF s ->> 'type' = 'bool' AND jsonb_typeof(v) <> 'boolean' THEN
      v_problems := v_problems || format('the field %s is not a flag', k);
    END IF;
  END LOOP;
  IF v_unknown > 0 THEN v_problems := v_problems || format('%s field(s) outside the approved whitelist', v_unknown); END IF;
  RETURN jsonb_build_object('ok', cardinality(v_problems) = 0, 'problems', to_jsonb(v_problems), 'known', to_jsonb((SELECT coalesce(array_agg(x ORDER BY x), '{}') FROM unnest(v_known) x)),
                            'unknown', v_unknown);
END $$;
REVOKE ALL ON FUNCTION analytics.aux_check_fields(jsonb, jsonb) FROM PUBLIC;

/* THE MEASURE over the events (internal; the baseline and the experiment analysis share it). The journey instance is a (pseudonym, UTC day)
   unit — the pseudonym rotates daily, so a unit never spans days.
     task_success_rate   population: units with an event on the journey's FIRST step; numerator: those with a `success` on its LAST step
     error_recovery_rate population: units with an `error` on the journey; numerator: those with a `recovered`, or a `success` on the last step
     step_p50_ms         included: the durations of `success` events on the step
   k_observed = the busiest day's distinct pseudonyms in the population (a LOWER bound of the distinct persons — the honest count when a
   pseudonym rotates daily). The source revision is sha256 over the events' ids, sorted. Returns {kind, n, numerator, denominator, values[],
   k_observed, days, definitions_used, revision}. */
CREATE OR REPLACE FUNCTION analytics.aux_measure(p_tenant uuid, p_domain uuid, p_journey_key text, p_steps text[], p_measure text, p_step text, p_seg_dim text, p_seg_value text,
                                                 p_from date, p_to date, p_experiment uuid, p_arm text) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = analytics, pg_catalog, pg_temp AS $$
  WITH ev AS (
    SELECT e.event_id, e.definition_id, e.definition_version, e.event_key, e.pseudonym, e.step_key, e.outcome, e.duration_ms, e.event_day
      FROM analytics.telemetry_events e
     WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain AND e.journey_key = p_journey_key AND e.event_day >= p_from AND e.event_day < p_to
       AND (p_experiment IS NULL OR (e.experiment_id = p_experiment AND e.variant = p_arm))
       AND (p_seg_dim IS NULL OR (p_seg_dim = 'role' AND p_seg_value = ANY (e.roles)) OR (p_seg_dim = 'device_class' AND e.device_class = p_seg_value)
            OR (p_seg_dim = 'locale' AND e.locale = p_seg_value))),
  units AS (
    SELECT u.pseudonym, u.event_day, bool_or(u.step_key = p_steps[1]) AS started, bool_or(u.outcome = 'error') AS errored,
           bool_or(u.step_key = p_steps[cardinality(p_steps)] AND u.outcome = 'success') AS succeeded, bool_or(u.outcome = 'recovered') AS recovered
      FROM ev u GROUP BY u.pseudonym, u.event_day),
  pop AS (SELECT * FROM units WHERE p_measure IN ('task_success_rate', 'error_recovery_rate') AND CASE p_measure WHEN 'task_success_rate' THEN started ELSE errored END),
  inc_rate AS (SELECT a.* FROM ev a JOIN pop p ON p.pseudonym = a.pseudonym AND p.event_day = a.event_day),
  inc_dur AS (SELECT a.* FROM ev a WHERE p_measure = 'step_p50_ms' AND a.step_key = p_step AND a.outcome = 'success' AND a.duration_ms IS NOT NULL),
  inc AS (SELECT * FROM inc_rate UNION ALL SELECT * FROM inc_dur)
  SELECT CASE WHEN p_measure = 'step_p50_ms' THEN
           jsonb_build_object('kind', 'duration', 'n', (SELECT count(*) FROM inc_dur),
             'values', coalesce((SELECT jsonb_agg(i.duration_ms ORDER BY i.duration_ms) FROM inc_dur i), '[]'::jsonb),
             'k_observed', coalesce((SELECT max(c) FROM (SELECT count(DISTINCT i.pseudonym) c FROM inc_dur i GROUP BY i.event_day) z), 0),
             'days', (SELECT count(DISTINCT i.event_day) FROM inc_dur i))
         ELSE
           jsonb_build_object('kind', 'rate', 'n', (SELECT count(*) FROM pop),
             'numerator', (SELECT count(*) FROM pop WHERE CASE p_measure WHEN 'task_success_rate' THEN succeeded ELSE (recovered OR succeeded) END),
             'denominator', (SELECT count(*) FROM pop),
             'k_observed', coalesce((SELECT max(c) FROM (SELECT count(DISTINCT p.pseudonym) c FROM pop p GROUP BY p.event_day) z), 0),
             'days', (SELECT count(DISTINCT p.event_day) FROM pop p)) END
      || jsonb_build_object(
           'definitions_used', coalesce((SELECT jsonb_agg(DISTINCT jsonb_build_object('definition_id', i.definition_id, 'version', i.definition_version, 'event_key', i.event_key)) FROM inc i), '[]'::jsonb),
           'revision', encode(sha256(convert_to(coalesce((SELECT string_agg(i.event_id::text, ',' ORDER BY i.event_id) FROM inc i), ''), 'UTF8')), 'hex'))
$$;
REVOKE ALL ON FUNCTION analytics.aux_measure(uuid, uuid, text, text[], text, text, text, text, date, date, uuid, text) FROM PUBLIC;

/* A measure's VALUE and UNCERTAINTY from aux_measure's counts (D6): a rate → its share and Wilson's 95 % interval; a duration → p50, p90 and
   the median's distribution-free 95 % interval (unbounded below n = 6 — said). */
CREATE OR REPLACE FUNCTION analytics.aux_value(p_m jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path = analytics, pg_catalog, pg_temp AS $$
DECLARE v_vals numeric[]; v_n int; v_ranks jsonb;
BEGIN
  IF p_m ->> 'kind' = 'rate' THEN
    IF (p_m ->> 'denominator')::numeric > 0 THEN
      RETURN jsonb_build_object('value', round((p_m ->> 'numerator')::numeric / (p_m ->> 'denominator')::numeric, 6),
                                'uncertainty', analytics.wilson((p_m ->> 'numerator')::numeric, (p_m ->> 'denominator')::numeric), 'distribution', NULL);
    END IF;
    RETURN jsonb_build_object('value', NULL, 'uncertainty', NULL, 'distribution', NULL);
  END IF;
  SELECT array_agg(x::numeric ORDER BY x::numeric) INTO v_vals FROM jsonb_array_elements_text(p_m -> 'values') x;
  v_n := coalesce(cardinality(v_vals), 0);
  IF v_n = 0 THEN RETURN jsonb_build_object('value', NULL, 'uncertainty', NULL, 'distribution', NULL); END IF;
  v_ranks := analytics.median_ci_ranks(v_n);
  RETURN jsonb_build_object('value', round(analytics.percentile(v_vals, 0.5), 3),
    'distribution', jsonb_build_object('p50', round(analytics.percentile(v_vals, 0.5), 3), 'p90', round(analytics.percentile(v_vals, 0.9), 3), 'min', v_vals[1], 'max', v_vals[v_n], 'n', v_n),
    'uncertainty', v_ranks || CASE WHEN (v_ranks ->> 'lo_rank') IS NOT NULL THEN jsonb_build_object('lo', v_vals[(v_ranks ->> 'lo_rank')::int], 'hi', v_vals[(v_ranks ->> 'hi_rank')::int]) ELSE '{}'::jsonb END);
END $$;
REVOKE ALL ON FUNCTION analytics.aux_value(jsonb) FROM PUBLIC;

/* INVALIDATE a running experiment (SRM, a privacy hold, drift): the state, the reason, the routed REVIEW (analytics.experience). */
CREATE OR REPLACE FUNCTION analytics.aux_invalidate(x analytics.ux_experiments, p_cause text, p_reasons jsonb, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SET search_path = analytics, executive, pg_catalog, pg_temp AS $$
DECLARE v_item jsonb;
BEGIN
  UPDATE analytics.ux_experiments SET state = 'invalidated', invalidated_at = clock_timestamp(),
         invalidation = jsonb_build_object('cause', p_cause, 'reasons', p_reasons, 'at', clock_timestamp())
   WHERE experiment_id = x.experiment_id AND state = 'running';
  v_item := executive.b33_raise_routed(x.tenant_id, x.domain_id, 'analytics.experience', 'experiment', x.experiment_id,
              format('Experiment "%s" invalidated (%s): its analysis cannot be claimed — review', x.title, p_cause), p_reasons, NULL, gen_random_uuid(),
              'experience.experiment_invalidated', jsonb_build_object('experiment_id', x.experiment_id, 'cause', p_cause, 'journey_key', x.journey_key), NULL, p_actor, p_correlation);
  PERFORM analytics.aux_ledger(x.tenant_id, x.domain_id, 'experiment', x.experiment_id, x.journey_key, NULL, 'experiment.invalidated', p_actor,
                               jsonb_build_object('cause', p_cause, 'reasons', p_reasons, 'item', v_item), p_correlation);
  RETURN v_item;
END $$;
REVOKE ALL ON FUNCTION analytics.aux_invalidate(analytics.ux_experiments, text, jsonb, uuid, uuid) FROM PUBLIC;

/* HOLD collection on a definition (the privacy officer's port and the owner's hold_collection action share it): collection held, the
   privacy REVIEW routed (analytics.privacy), every experiment RUNNING on its journey invalidated (a privacy hold). */
CREATE OR REPLACE FUNCTION analytics.aux_hold(d analytics.telemetry_definitions, p_reason text, p_via text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SET search_path = analytics, executive, pg_catalog, pg_temp AS $$
DECLARE v_item jsonb; x analytics.ux_experiments%ROWTYPE; v_inv jsonb := '[]'::jsonb;
BEGIN
  UPDATE analytics.telemetry_definitions SET collection = 'held', hold_reason = btrim(p_reason), held_by = p_actor, held_at = clock_timestamp() WHERE definition_id = d.definition_id;
  v_item := executive.b33_raise_routed(d.tenant_id, d.domain_id, 'analytics.privacy', 'telemetry_definition', d.definition_id,
              format('Telemetry collection held: %s v%s (%s) — privacy review', d.event_key, d.version, p_via), jsonb_build_array(btrim(p_reason)), NULL, gen_random_uuid(),
              'experience.collection_held', jsonb_build_object('definition_id', d.definition_id, 'event_key', d.event_key, 'version', d.version, 'via', p_via), NULL, p_actor, p_correlation);
  FOR x IN SELECT * FROM analytics.ux_experiments e WHERE e.tenant_id = d.tenant_id AND e.domain_id = d.domain_id AND e.journey_key = d.journey_key AND e.state = 'running' FOR UPDATE LOOP
    PERFORM analytics.aux_invalidate(x, 'privacy_hold', jsonb_build_array(format('collection of %s v%s was held: %s', d.event_key, d.version, btrim(p_reason))), p_actor, p_correlation);
    v_inv := v_inv || to_jsonb(x.experiment_id);
  END LOOP;
  PERFORM analytics.aux_ledger(d.tenant_id, d.domain_id, 'telemetry_definition', d.definition_id, d.event_key, d.version, 'telemetry.held', p_actor,
                               jsonb_build_object('reason', btrim(p_reason), 'via', p_via, 'item', v_item, 'experiments_invalidated', v_inv), p_correlation);
  RETURN jsonb_build_object('held', true, 'item', v_item, 'experiments_invalidated', v_inv);
END $$;
REVOKE ALL ON FUNCTION analytics.aux_hold(analytics.telemetry_definitions, text, text, uuid, uuid) FROM PUBLIC;

/* RETIRE a definition (its port and the owner's retire_measure action share it): collection stops for good; history stays readable. */
CREATE OR REPLACE FUNCTION analytics.aux_retire_definition(d analytics.telemetry_definitions, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SET search_path = analytics, executive, pg_catalog, pg_temp AS $$
DECLARE v_closed jsonb;
BEGIN
  UPDATE analytics.telemetry_definitions SET state = 'retired', retired_by = p_actor, retired_at = clock_timestamp(), retire_reason = btrim(p_reason) WHERE definition_id = d.definition_id;
  v_closed := executive.b33_close_items(d.tenant_id, d.domain_id, NULL, 'telemetry_definition', d.definition_id, format('the definition was retired: %s', btrim(p_reason)), p_actor, p_correlation);
  PERFORM analytics.aux_ledger(d.tenant_id, d.domain_id, 'telemetry_definition', d.definition_id, d.event_key, d.version, 'telemetry.retired', p_actor,
                               jsonb_build_object('reason', btrim(p_reason), 'from_state', d.state, 'items_closed', v_closed), p_correlation);
  RETURN jsonb_build_object('retired', true, 'items_closed', v_closed);
END $$;
REVOKE ALL ON FUNCTION analytics.aux_retire_definition(analytics.telemetry_definitions, text, uuid, uuid) FROM PUBLIC;

-- §UX.4 CONSENT (UX1) ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* GRANT or WITHDRAW consent (analytics.consent.grant | .withdraw — human-gated: a person's own act). The PERSON acts for themselves: the
   acting principal IS the person recorded (no parameter names another); a grant needs an APPROVED purpose of a telemetry kind
   (product_improvement | reliability) and names its version and digest; a withdrawal is always possible (even for a retired purpose) and
   takes effect for the next event. A repeated grant of the same version answers the standing consent (`unchanged`). */
CREATE OR REPLACE FUNCTION analytics.record_consent(p_consent uuid, p_tenant uuid, p_domain uuid, p_purpose_key text, p_decision text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = analytics, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE pu analytics.purposes%ROWTYPE; v_last analytics.consents%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY[CASE WHEN p_decision = 'granted' THEN 'analytics.consent.grant' ELSE 'analytics.consent.withdraw' END]);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM analytics.aux_assert_actor('consent', p_actor);
  IF analytics.aux_kind(p_actor) IS DISTINCT FROM 'human' THEN
    RAISE EXCEPTION 'consent rejected (actor): consent is a person''s own act; an agent or a system has none to give' USING ERRCODE = '42501';
  END IF;
  IF p_decision NOT IN ('granted', 'withdrawn') THEN RAISE EXCEPTION 'consent rejected (decision): consent is granted or withdrawn' USING ERRCODE = '22023'; END IF;
  SELECT * INTO v_last FROM analytics.consents c WHERE c.tenant_id = p_tenant AND c.domain_id = p_domain AND c.principal_id = p_actor AND c.purpose_key = p_purpose_key
   ORDER BY c.recorded_at DESC, c.consent_id DESC LIMIT 1;
  pu := analytics.aux_purpose(p_tenant, p_domain, p_purpose_key);
  IF p_decision = 'granted' THEN
    IF pu.purpose_id IS NULL THEN
      RAISE EXCEPTION 'consent rejected (unknown_purpose): % has no approved purpose in this domain — consent is given only to an approved purpose', p_purpose_key USING ERRCODE = '23503';
    END IF;
    IF NOT (pu.purpose_kind = ANY (ARRAY['product_improvement', 'reliability'])) THEN
      RAISE EXCEPTION 'consent rejected (purpose): % is a % purpose; experience telemetry is collected only for product improvement or reliability', p_purpose_key, pu.purpose_kind USING ERRCODE = '22023';
    END IF;
    IF v_last.consent_id IS NOT NULL AND v_last.decision = 'granted' AND v_last.purpose_id = pu.purpose_id THEN
      RETURN to_jsonb(v_last) - 'tenant_id' - 'domain_id' || jsonb_build_object('unchanged', true, 'current', true);
    END IF;
  ELSE
    IF v_last.consent_id IS NULL OR v_last.decision = 'withdrawn' THEN
      RETURN coalesce(to_jsonb(v_last) - 'tenant_id' - 'domain_id', '{}'::jsonb) || jsonb_build_object('unchanged', true, 'current', false, 'purpose_key', p_purpose_key);
    END IF;
    SELECT * INTO pu FROM analytics.purposes p WHERE p.purpose_id = v_last.purpose_id;   -- a withdrawal names the purpose version the person had consented to
  END IF;
  INSERT INTO analytics.consents (consent_id, scope, tenant_id, domain_id, principal_id, purpose_key, purpose_id, purpose_version, purpose_digest, decision, correlation_id)
  VALUES (p_consent, 'DOMAIN', p_tenant, p_domain, p_actor, p_purpose_key, pu.purpose_id, pu.version, pu.digest, p_decision, p_correlation);
  RETURN (SELECT to_jsonb(c) - 'tenant_id' - 'domain_id' FROM analytics.consents c WHERE c.consent_id = p_consent)
         || jsonb_build_object('unchanged', false, 'current', p_decision = 'granted', 'purpose_title', pu.title);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION analytics.record_consent(uuid, uuid, uuid, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION analytics.record_consent(uuid, uuid, uuid, text, text, uuid, uuid) TO eye_commit;

-- §UX.5 TELEMETRY EVENT DEFINITIONS (UX2) ────────────────────────────────────────────────────────────────────────────────────────────────
/* DEFINE (analytics.telemetry.define — an analyst or the owner; an agent never defines collection): a new version of an event key — a step of
   an ACTIVE journey, the journey's APPROVED purpose (product_improvement | reliability), the field whitelist checked (minimisation). One open
   (proposed) version per key. */
CREATE OR REPLACE FUNCTION analytics.define_telemetry(p_definition uuid, p_tenant uuid, p_domain uuid, p_event_key text, p_title text, p_journey_key text, p_step_key text, p_fields jsonb,
                                                      p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = analytics, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE j analytics.experience_journeys%ROWTYPE; pu analytics.purposes%ROWTYPE; v_version int; v_digest text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['analytics.telemetry.define']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM analytics.aux_assert_actor('telemetry definition', p_actor);
  PERFORM analytics.aux_assert_human('telemetry definition', p_actor, p_tenant, p_domain, ARRAY['product_analyst', 'product_analytics_owner'], 'defining what telemetry is collected');
  IF coalesce(p_event_key, '') !~ '^[a-z][a-z0-9_.-]{2,62}$' THEN RAISE EXCEPTION 'telemetry definition rejected (request): the event key is ^[a-z][a-z0-9_.-]{2,62}$' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_title, ''))) NOT BETWEEN 4 AND 200 THEN RAISE EXCEPTION 'telemetry definition rejected (request): a title of 4–200 characters' USING ERRCODE = '22023'; END IF;
  SELECT * INTO j FROM analytics.experience_journeys x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.journey_key = p_journey_key AND x.state = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'telemetry definition rejected (unknown_journey): % is not an active journey of this domain', p_journey_key USING ERRCODE = '23503'; END IF;
  IF NOT (coalesce(p_step_key, '') = ANY (j.steps)) THEN
    RAISE EXCEPTION 'telemetry definition rejected (step): % is not a step of the journey % (%)', p_step_key, j.journey_key, array_to_string(j.steps, ' → ') USING ERRCODE = '22023';
  END IF;
  pu := analytics.aux_purpose(p_tenant, p_domain, j.purpose_key);
  IF pu.purpose_id IS NULL THEN RAISE EXCEPTION 'telemetry definition rejected (purpose): the journey''s purpose % is not approved — nothing is collected without an approved purpose', j.purpose_key USING ERRCODE = '22023'; END IF;
  IF NOT (pu.purpose_kind = ANY (ARRAY['product_improvement', 'reliability'])) THEN
    RAISE EXCEPTION 'telemetry definition rejected (purpose): % is a % purpose; telemetry serves product improvement or reliability only', pu.purpose_key, pu.purpose_kind USING ERRCODE = '22023';
  END IF;
  PERFORM analytics.aux_assert_fields(coalesce(p_fields, '{}'::jsonb));
  PERFORM 1 FROM analytics.telemetry_definitions x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.event_key = p_event_key FOR UPDATE;
  IF EXISTS (SELECT 1 FROM analytics.telemetry_definitions x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.event_key = p_event_key AND x.state = 'proposed') THEN
    RAISE EXCEPTION 'telemetry definition rejected (duplicate): % has a proposed version awaiting the privacy review', p_event_key USING ERRCODE = '22023';
  END IF;
  SELECT coalesce(max(x.version), 0) + 1 INTO v_version FROM analytics.telemetry_definitions x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.event_key = p_event_key;
  v_digest := analytics.digest(jsonb_build_object('event_key', p_event_key, 'version', v_version, 'title', btrim(p_title), 'purpose_key', j.purpose_key, 'journey_key', j.journey_key,
                                                  'step_key', p_step_key, 'fields', coalesce(p_fields, '{}'::jsonb)));
  INSERT INTO analytics.telemetry_definitions (definition_id, scope, tenant_id, domain_id, event_key, version, title, purpose_key, journey_key, step_key, fields, digest, proposed_by, correlation_id)
  VALUES (p_definition, 'DOMAIN', p_tenant, p_domain, p_event_key, v_version, btrim(p_title), j.purpose_key, j.journey_key, p_step_key, coalesce(p_fields, '{}'::jsonb), v_digest, p_actor, p_correlation);
  PERFORM analytics.aux_ledger(p_tenant, p_domain, 'telemetry_definition', p_definition, p_event_key, v_version, 'telemetry.defined', p_actor,
                               jsonb_build_object('digest', v_digest, 'journey_key', j.journey_key, 'step_key', p_step_key, 'fields', analytics.json_keys(p_fields)), p_correlation);
  RETURN (SELECT to_jsonb(x) - 'tenant_id' - 'domain_id' FROM analytics.telemetry_definitions x WHERE x.definition_id = p_definition);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION analytics.define_telemetry(uuid, uuid, uuid, text, text, text, text, jsonb, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION analytics.define_telemetry(uuid, uuid, uuid, text, text, text, text, jsonb, uuid, uuid) TO eye_commit;

/* THE PRIVACY AND MINIMISATION REVIEW (analytics.telemetry.review — human-gated): a named PRIVACY OFFICER, never the proposer, approves or
   rejects a PROPOSED version at the digest they saw (stale → 409), with a reason. Approval supersedes the prior approved version and binds
   the purpose version and its retention. */
CREATE OR REPLACE FUNCTION analytics.review_telemetry(p_definition uuid, p_tenant uuid, p_domain uuid, p_decision text, p_reason text, p_digest text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = analytics, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE d analytics.telemetry_definitions%ROWTYPE; pu analytics.purposes%ROWTYPE; v_prev uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['analytics.telemetry.review']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM analytics.aux_assert_actor('telemetry definition', p_actor);
  PERFORM analytics.aux_assert_human('telemetry definition', p_actor, p_tenant, p_domain, ARRAY['privacy_officer'], 'the privacy and minimisation review');
  SELECT * INTO d FROM analytics.telemetry_definitions x WHERE x.definition_id = p_definition AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'telemetry definition rejected (unknown_definition): % is not a telemetry definition of this domain', p_definition USING ERRCODE = '23503'; END IF;
  IF d.proposed_by = p_actor THEN RAISE EXCEPTION 'telemetry definition rejected (separation_of_duties): the proposer of % v% does not review it', d.event_key, d.version USING ERRCODE = '42501'; END IF;
  IF d.state <> 'proposed' THEN RAISE EXCEPTION 'telemetry definition rejected (state): % v% is %; only a proposed version is reviewed', d.event_key, d.version, d.state USING ERRCODE = '22023'; END IF;
  IF p_digest IS DISTINCT FROM d.digest THEN
    RAISE EXCEPTION 'telemetry definition rejected (stale): % v% is at digest %…, not the one reviewed (%…)', d.event_key, d.version, left(d.digest, 12), left(coalesce(p_digest, '<none>'), 12) USING ERRCODE = '22023';
  END IF;
  IF p_decision NOT IN ('approve', 'reject') THEN RAISE EXCEPTION 'telemetry definition rejected (decision): the review approves or rejects' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'telemetry definition rejected (reason): a review states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  IF p_decision = 'approve' THEN
    pu := analytics.aux_purpose(p_tenant, p_domain, d.purpose_key);
    IF pu.purpose_id IS NULL THEN RAISE EXCEPTION 'telemetry definition rejected (state): the purpose % is no longer approved — nothing is collected without it', d.purpose_key USING ERRCODE = '22023'; END IF;
    PERFORM analytics.aux_assert_fields(d.fields);
    SELECT x.definition_id INTO v_prev FROM analytics.telemetry_definitions x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.event_key = d.event_key AND x.state = 'approved' FOR UPDATE;
    IF v_prev IS NOT NULL THEN UPDATE analytics.telemetry_definitions SET state = 'superseded' WHERE definition_id = v_prev; END IF;
    UPDATE analytics.telemetry_definitions SET state = 'approved', decided_by = p_actor, decided_at = clock_timestamp(), decision_reason = btrim(p_reason), purpose_id = pu.purpose_id,
           retention_days = pu.retention_days WHERE definition_id = p_definition;
  ELSE
    UPDATE analytics.telemetry_definitions SET state = 'rejected', decided_by = p_actor, decided_at = clock_timestamp(), decision_reason = btrim(p_reason) WHERE definition_id = p_definition;
  END IF;
  PERFORM analytics.aux_ledger(p_tenant, p_domain, 'telemetry_definition', p_definition, d.event_key, d.version, CASE p_decision WHEN 'approve' THEN 'telemetry.approved' ELSE 'telemetry.rejected' END,
                               p_actor, jsonb_build_object('reason', btrim(p_reason), 'digest', d.digest, 'superseded', v_prev, 'purpose_version', pu.version, 'retention_days', pu.retention_days), p_correlation);
  RETURN (SELECT to_jsonb(x) - 'tenant_id' - 'domain_id' FROM analytics.telemetry_definitions x WHERE x.definition_id = p_definition);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION analytics.review_telemetry(uuid, uuid, uuid, text, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION analytics.review_telemetry(uuid, uuid, uuid, text, text, text, uuid, uuid) TO eye_commit;

/* HOLD | RELEASE collection (analytics.telemetry.hold | .release — human-gated, a named PRIVACY OFFICER; an agent never holds or releases).
   Hold: an approved, open definition; the privacy review routed; running experiments on the journey invalidated. Release: a held one; the
   privacy items closed (an invalidated experiment stays invalidated — a new one is proposed). */
CREATE OR REPLACE FUNCTION analytics.hold_telemetry(p_definition uuid, p_tenant uuid, p_domain uuid, p_hold boolean, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = analytics, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE d analytics.telemetry_definitions%ROWTYPE; v_out jsonb; v_closed jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY[CASE WHEN p_hold THEN 'analytics.telemetry.hold' ELSE 'analytics.telemetry.release' END]);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM analytics.aux_assert_actor('telemetry definition', p_actor);
  PERFORM analytics.aux_assert_human('telemetry definition', p_actor, p_tenant, p_domain, ARRAY['privacy_officer'], CASE WHEN p_hold THEN 'holding collection' ELSE 'releasing collection' END);
  SELECT * INTO d FROM analytics.telemetry_definitions x WHERE x.definition_id = p_definition AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'telemetry definition rejected (unknown_definition): % is not a telemetry definition of this domain', p_definition USING ERRCODE = '23503'; END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'telemetry definition rejected (reason): a hold or a release states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  IF d.state <> 'approved' THEN RAISE EXCEPTION 'telemetry definition rejected (state): % v% is %; collection is held or released on the approved version', d.event_key, d.version, d.state USING ERRCODE = '22023'; END IF;
  IF p_hold THEN
    IF d.collection = 'held' THEN RAISE EXCEPTION 'telemetry definition rejected (state): collection of % v% is already held (%)', d.event_key, d.version, d.hold_reason USING ERRCODE = '22023'; END IF;
    v_out := analytics.aux_hold(d, p_reason, 'privacy officer', p_actor, p_correlation);
  ELSE
    IF d.collection <> 'held' THEN RAISE EXCEPTION 'telemetry definition rejected (state): collection of % v% is not held', d.event_key, d.version USING ERRCODE = '22023'; END IF;
    UPDATE analytics.telemetry_definitions SET collection = 'open', hold_reason = NULL, held_by = NULL, held_at = NULL WHERE definition_id = p_definition;
    v_closed := executive.b33_close_items(p_tenant, p_domain, 'analytics.privacy', 'telemetry_definition', p_definition, format('collection released by the privacy officer: %s', btrim(p_reason)), p_actor, p_correlation);
    PERFORM analytics.aux_ledger(p_tenant, p_domain, 'telemetry_definition', p_definition, d.event_key, d.version, 'telemetry.released', p_actor,
                                 jsonb_build_object('reason', btrim(p_reason), 'held_since', d.held_at, 'hold_reason', d.hold_reason, 'items_closed', v_closed), p_correlation);
    v_out := jsonb_build_object('held', false, 'items_closed', v_closed);
  END IF;
  RETURN (SELECT to_jsonb(x) - 'tenant_id' - 'domain_id' FROM analytics.telemetry_definitions x WHERE x.definition_id = p_definition) || jsonb_build_object('effect', v_out);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION analytics.hold_telemetry(uuid, uuid, uuid, boolean, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION analytics.hold_telemetry(uuid, uuid, uuid, boolean, text, uuid, uuid) TO eye_commit;

/* RETIRE a definition (analytics.telemetry.retire — human-gated: the privacy officer or the owner): collection stops for good; the events
   collected stay readable as aggregates until the purge's retention. */
CREATE OR REPLACE FUNCTION analytics.retire_telemetry(p_definition uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = analytics, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE d analytics.telemetry_definitions%ROWTYPE; v_out jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['analytics.telemetry.retire']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM analytics.aux_assert_actor('telemetry definition', p_actor);
  PERFORM analytics.aux_assert_human('telemetry definition', p_actor, p_tenant, p_domain, ARRAY['privacy_officer', 'product_analytics_owner'], 'retiring collection');
  SELECT * INTO d FROM analytics.telemetry_definitions x WHERE x.definition_id = p_definition AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'telemetry definition rejected (unknown_definition): % is not a telemetry definition of this domain', p_definition USING ERRCODE = '23503'; END IF;
  IF d.state IN ('retired', 'rejected', 'superseded') THEN RAISE EXCEPTION 'telemetry definition rejected (state): % v% is already %', d.event_key, d.version, d.state USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'telemetry definition rejected (reason): a retirement states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  v_out := analytics.aux_retire_definition(d, p_reason, p_actor, p_correlation);
  RETURN (SELECT to_jsonb(x) - 'tenant_id' - 'domain_id' FROM analytics.telemetry_definitions x WHERE x.definition_id = p_definition) || jsonb_build_object('effect', v_out);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION analytics.retire_telemetry(uuid, uuid, uuid, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION analytics.retire_telemetry(uuid, uuid, uuid, text, uuid, uuid) TO eye_commit;

-- §UX.6 INGESTION (UX3/UX4) ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* RECORD an event (analytics.telemetry.record — any authenticated human of the domain; NOT human-gated; gated by the product_analytics licence
   on a contracted tenant). The order of the checks is the privacy order:
     1. the definition of the key: the latest approved / retired version (none → 404, raised);
     2. retired → NOT collected, the attempt counted (`retired`), refused (state) — answered after the count is committed;
     3. held → NOT collected, counted with its SHAPE (`held`), refused (state);
     4. the purpose no longer approved → NOT collected, counted, refused (state);
     5. the caller's CURRENT consent for the purpose — none → NOT collected: {collected: false, reason: 'not_consented'} and a counter row
        WITHOUT shape (nothing of the person is kept); never an error;
     6. the outcome, duration, device class, language and the fields against the whitelist — outside it → counted with its shape
        (`minimisation`), refused (minimisation);
     7. stored: the pseudonym of (purpose, UTC day), the bound role codes, the UTC day — NEVER the principal id; the experiment arm computed
        HERE when the caller names a RUNNING experiment of the same journey (the client's claim of an arm is never trusted).
   No event id is accepted or returned; nothing ties the stored row to the request. Returns {collected, reason?, refused?: {status, cls,
   message}, definition_version?, event_day?, variant?}. */
CREATE OR REPLACE FUNCTION analytics.record_telemetry(p_tenant uuid, p_domain uuid, p_event_key text, p_outcome text, p_duration_ms int, p_fields jsonb, p_device_class text,
                                                      p_locale text, p_experiment uuid, p_actor uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = analytics, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE d analytics.telemetry_definitions%ROWTYPE; pu analytics.purposes%ROWTYPE; v_day date := analytics.aux_today(); v_check jsonb; v_shape jsonb; x analytics.ux_experiments%ROWTYPE;
        v_variant text := NULL; v_exp uuid := NULL; v_note text := NULL;
BEGIN
  PERFORM observation.assert_authority(ARRAY['analytics.telemetry.record']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM analytics.aux_assert_actor('telemetry event', p_actor);
  SELECT * INTO d FROM analytics.telemetry_definitions t WHERE t.tenant_id = p_tenant AND t.domain_id = p_domain AND t.event_key = p_event_key AND t.state IN ('approved', 'retired')
   ORDER BY (t.state = 'approved') DESC, t.version DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'telemetry event rejected (unknown_definition): % has no approved telemetry definition in this domain — nothing is collected without one', p_event_key USING ERRCODE = '23503'; END IF;
  v_check := analytics.aux_check_fields(d.fields, p_fields);
  v_shape := jsonb_build_object('fields', v_check -> 'known', 'unknown_fields', v_check -> 'unknown', 'outcome_given', p_outcome IS NOT NULL, 'duration_given', p_duration_ms IS NOT NULL);
  IF d.state = 'retired' THEN
    INSERT INTO analytics.telemetry_attempts (scope, tenant_id, domain_id, definition_id, event_key, disposition, shape, event_day) VALUES ('DOMAIN', p_tenant, p_domain, d.definition_id, d.event_key, 'retired', v_shape, v_day);
    RETURN jsonb_build_object('collected', false, 'reason', 'retired', 'refused', jsonb_build_object('status', 409, 'cls', 'state',
             'message', format('%s v%s was retired (%s): nothing is collected under it', d.event_key, d.version, d.retire_reason)));
  END IF;
  IF d.collection = 'held' THEN
    INSERT INTO analytics.telemetry_attempts (scope, tenant_id, domain_id, definition_id, event_key, disposition, shape, event_day) VALUES ('DOMAIN', p_tenant, p_domain, d.definition_id, d.event_key, 'held', v_shape, v_day);
    RETURN jsonb_build_object('collected', false, 'reason', 'held', 'refused', jsonb_build_object('status', 409, 'cls', 'state',
             'message', format('collection of %s v%s is held by the privacy review (%s): the attempt is counted, its values are not kept', d.event_key, d.version, d.hold_reason)));
  END IF;
  pu := analytics.aux_purpose(p_tenant, p_domain, d.purpose_key);
  IF pu.purpose_id IS NULL THEN
    INSERT INTO analytics.telemetry_attempts (scope, tenant_id, domain_id, definition_id, event_key, disposition, shape, event_day) VALUES ('DOMAIN', p_tenant, p_domain, d.definition_id, d.event_key, 'purpose_unavailable', v_shape, v_day);
    RETURN jsonb_build_object('collected', false, 'reason', 'purpose_unavailable', 'refused', jsonb_build_object('status', 409, 'cls', 'state',
             'message', format('the purpose %s is no longer approved: nothing is collected without an approved purpose', d.purpose_key)));
  END IF;
  IF NOT analytics.aux_consented(p_tenant, p_domain, p_actor, d.purpose_key) THEN
    INSERT INTO analytics.telemetry_attempts (scope, tenant_id, domain_id, definition_id, event_key, disposition, shape, event_day) VALUES ('DOMAIN', p_tenant, p_domain, d.definition_id, d.event_key, 'not_consented', '{}'::jsonb, v_day);
    RETURN jsonb_build_object('collected', false, 'reason', 'not_consented', 'purpose_key', d.purpose_key);
  END IF;
  IF p_outcome IS NULL OR NOT (p_outcome = ANY (analytics.aux_outcomes())) THEN v_check := jsonb_set(v_check, '{ok}', 'false') || jsonb_build_object('problems', (v_check -> 'problems') || to_jsonb(format('the outcome is one of %s', array_to_string(analytics.aux_outcomes(), ', ')))); END IF;
  IF p_duration_ms IS NOT NULL AND p_duration_ms NOT BETWEEN 0 AND 86400000 THEN v_check := jsonb_set(v_check, '{ok}', 'false') || jsonb_build_object('problems', (v_check -> 'problems') || to_jsonb('the duration is 0–86 400 000 ms'::text)); END IF;
  IF p_device_class IS NOT NULL AND p_device_class NOT IN ('desktop', 'tablet', 'mobile') THEN v_check := jsonb_set(v_check, '{ok}', 'false') || jsonb_build_object('problems', (v_check -> 'problems') || to_jsonb('the device class is desktop, tablet or mobile'::text)); END IF;
  IF p_locale IS NOT NULL AND p_locale !~ '^[a-z]{2}$' THEN v_check := jsonb_set(v_check, '{ok}', 'false') || jsonb_build_object('problems', (v_check -> 'problems') || to_jsonb('the language is a two-letter code (a region or a full locale is not kept)'::text)); END IF;
  IF NOT (v_check ->> 'ok')::boolean THEN
    INSERT INTO analytics.telemetry_attempts (scope, tenant_id, domain_id, definition_id, event_key, disposition, shape, event_day) VALUES ('DOMAIN', p_tenant, p_domain, d.definition_id, d.event_key, 'minimisation', v_shape, v_day);
    RETURN jsonb_build_object('collected', false, 'reason', 'minimisation', 'refused', jsonb_build_object('status', 422, 'cls', 'minimisation',
             'message', format('%s v%s collects only its approved whitelist: %s', d.event_key, d.version, (SELECT string_agg(p, '; ') FROM jsonb_array_elements_text(v_check -> 'problems') p))));
  END IF;
  IF p_experiment IS NOT NULL THEN
    SELECT * INTO x FROM analytics.ux_experiments e WHERE e.experiment_id = p_experiment AND e.tenant_id = p_tenant AND e.domain_id = p_domain;
    IF x.experiment_id IS NOT NULL AND x.state = 'running' AND x.journey_key = d.journey_key THEN
      v_exp := x.experiment_id;
      v_variant := x.variants -> analytics.aux_arm(x.experiment_id, p_actor, jsonb_array_length(x.variants)) ->> 'key';
    ELSE
      v_note := 'the named experiment is not running on this journey: the event is collected without an arm';
    END IF;
  END IF;
  INSERT INTO analytics.telemetry_events (scope, tenant_id, domain_id, definition_id, definition_version, event_key, purpose_key, journey_key, step_key, pseudonym, roles, device_class, locale,
                                          outcome, duration_ms, fields, experiment_id, variant, event_day)
  VALUES ('DOMAIN', p_tenant, p_domain, d.definition_id, d.version, d.event_key, d.purpose_key, d.journey_key, d.step_key, analytics.aux_pseudonym(p_tenant, p_actor, d.purpose_key, v_day),
          analytics.aux_roles_of(p_actor, p_tenant, p_domain), p_device_class, p_locale, p_outcome, p_duration_ms, coalesce(p_fields, '{}'::jsonb), v_exp, v_variant, v_day);
  RETURN jsonb_build_object('collected', true, 'event_key', d.event_key, 'definition_version', d.version, 'event_day', v_day, 'variant', v_variant, 'note', v_note);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION analytics.record_telemetry(uuid, uuid, text, text, int, jsonb, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION analytics.record_telemetry(uuid, uuid, text, text, int, jsonb, text, text, uuid, uuid) TO eye_commit;

-- §UX.7 JOURNEYS, SEGMENTS, BASELINES, THRESHOLDS (UX5) ─────────────────────────────────────────────────────────────────────────────────
/* DECLARE a journey (analytics.experience.journey.declare — an analyst or the owner): the quality objective first, the ordered steps, the
   APPROVED purpose (product_improvement | reliability), the objectives it serves (strategy objects of the domain), the floor. A new
   version supersedes the active one. */
CREATE OR REPLACE FUNCTION analytics.declare_journey(p_journey uuid, p_tenant uuid, p_domain uuid, p_key text, p_title text, p_purpose_key text, p_objective text, p_objective_ids uuid[],
                                                     p_steps text[], p_floor int, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = analytics, graph, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE pu analytics.purposes%ROWTYPE; v_version int; v_prev uuid; s text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['analytics.experience.journey.declare']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM analytics.aux_assert_actor('experience journey', p_actor);
  PERFORM analytics.aux_assert_human('experience journey', p_actor, p_tenant, p_domain, ARRAY['product_analyst', 'product_analytics_owner'], 'declaring a journey');
  IF coalesce(p_key, '') !~ '^[a-z][a-z0-9_.-]{2,62}$' THEN RAISE EXCEPTION 'experience journey rejected (request): the journey key is ^[a-z][a-z0-9_.-]{2,62}$' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_objective, ''))) < 16 THEN RAISE EXCEPTION 'experience journey rejected (objective): a journey states the quality objective it serves (16+ characters) — the objective precedes the metric' USING ERRCODE = '22023'; END IF;
  IF coalesce(cardinality(p_steps), 0) NOT BETWEEN 2 AND 20 OR (SELECT count(DISTINCT x) FROM unnest(p_steps) x) <> cardinality(p_steps)
     OR EXISTS (SELECT 1 FROM unnest(p_steps) x WHERE x !~ '^[a-z][a-z0-9_]{1,40}$') THEN
    RAISE EXCEPTION 'experience journey rejected (steps): 2–20 distinct ordered steps, each ^[a-z][a-z0-9_]{1,40}$' USING ERRCODE = '22023';
  END IF;
  IF coalesce(p_floor, 5) < 1 THEN RAISE EXCEPTION 'experience journey rejected (floor): the floor is at least 1' USING ERRCODE = '22023'; END IF;
  pu := analytics.aux_purpose(p_tenant, p_domain, p_purpose_key);
  IF pu.purpose_id IS NULL THEN RAISE EXCEPTION 'experience journey rejected (unknown_purpose): % has no approved purpose in this domain', p_purpose_key USING ERRCODE = '23503'; END IF;
  IF NOT (pu.purpose_kind = ANY (ARRAY['product_improvement', 'reliability'])) THEN
    RAISE EXCEPTION 'experience journey rejected (purpose): % is a % purpose; a journey is measured for product improvement or reliability only', p_purpose_key, pu.purpose_kind USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(coalesce(p_objective_ids, '{}')) o WHERE NOT EXISTS (SELECT 1 FROM graph.strategy_current g WHERE g.strategy_object_id = o AND g.tenant_id = p_tenant AND g.domain_id = p_domain)) THEN
    RAISE EXCEPTION 'experience journey rejected (unknown_objective): an objective id is not a strategy object of this domain' USING ERRCODE = '23503';
  END IF;
  SELECT x.journey_id INTO v_prev FROM analytics.experience_journeys x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.journey_key = p_key AND x.state = 'active' FOR UPDATE;
  SELECT coalesce(max(x.version), 0) + 1 INTO v_version FROM analytics.experience_journeys x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.journey_key = p_key;
  IF v_prev IS NOT NULL THEN UPDATE analytics.experience_journeys SET state = 'superseded' WHERE journey_id = v_prev; END IF;
  INSERT INTO analytics.experience_journeys (journey_id, scope, tenant_id, domain_id, journey_key, version, title, purpose_key, objective, objective_ids, steps, floor_n, declared_by, correlation_id)
  VALUES (p_journey, 'DOMAIN', p_tenant, p_domain, p_key, v_version, btrim(p_title), p_purpose_key, btrim(p_objective), coalesce(p_objective_ids, '{}'), p_steps, coalesce(p_floor, 5), p_actor, p_correlation);
  PERFORM analytics.aux_ledger(p_tenant, p_domain, 'journey', p_journey, p_key, v_version, 'journey.declared', p_actor,
                               jsonb_build_object('steps', to_jsonb(p_steps), 'purpose_key', p_purpose_key, 'superseded', v_prev), p_correlation);
  RETURN (SELECT to_jsonb(x) - 'tenant_id' - 'domain_id' FROM analytics.experience_journeys x WHERE x.journey_id = p_journey);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION analytics.declare_journey(uuid, uuid, uuid, text, text, text, text, uuid[], text[], int, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION analytics.declare_journey(uuid, uuid, uuid, text, text, text, text, uuid[], text[], int, uuid, uuid) TO eye_commit;

/* DECLARE a segment (analytics.experience.segment.declare — an analyst or the owner): role (a role code of the product) | device_class |
   locale — never a person; k_min ≥ 5. */
CREATE OR REPLACE FUNCTION analytics.declare_segment(p_segment uuid, p_tenant uuid, p_domain uuid, p_key text, p_dimension text, p_value text, p_k int, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = analytics, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_authority(ARRAY['analytics.experience.segment.declare']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM analytics.aux_assert_actor('experience segment', p_actor);
  PERFORM analytics.aux_assert_human('experience segment', p_actor, p_tenant, p_domain, ARRAY['product_analyst', 'product_analytics_owner'], 'declaring a segment');
  IF coalesce(p_key, '') !~ '^[a-z][a-z0-9_.-]{2,62}$' THEN RAISE EXCEPTION 'experience segment rejected (request): the segment key is ^[a-z][a-z0-9_.-]{2,62}$' USING ERRCODE = '22023'; END IF;
  IF coalesce(p_dimension, '') = ANY (analytics.person_dimensions()) THEN
    RAISE EXCEPTION 'experience segment rejected (person): a segment is never a person (%): no employee-performance inference', p_dimension USING ERRCODE = '42501';
  END IF;
  IF p_dimension NOT IN ('role', 'device_class', 'locale') THEN RAISE EXCEPTION 'experience segment rejected (dimension): a segment is a role, a device class or a language' USING ERRCODE = '22023'; END IF;
  IF p_dimension = 'role' AND NOT EXISTS (SELECT 1 FROM identity.roles r WHERE r.code = p_value) THEN RAISE EXCEPTION 'experience segment rejected (value): % is not a role of the product', p_value USING ERRCODE = '22023'; END IF;
  IF p_dimension = 'device_class' AND p_value NOT IN ('desktop', 'tablet', 'mobile') THEN RAISE EXCEPTION 'experience segment rejected (value): a device class is desktop, tablet or mobile' USING ERRCODE = '22023'; END IF;
  IF p_dimension = 'locale' AND coalesce(p_value, '') !~ '^[a-z]{2}$' THEN RAISE EXCEPTION 'experience segment rejected (value): a language is a two-letter code' USING ERRCODE = '22023'; END IF;
  IF coalesce(p_k, 5) < 5 THEN RAISE EXCEPTION 'experience segment rejected (k): a segment is read only above k ≥ 5 distinct pseudonyms' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM analytics.experience_segments s WHERE s.tenant_id = p_tenant AND s.domain_id = p_domain AND s.segment_key = p_key AND s.state = 'active') THEN
    RAISE EXCEPTION 'experience segment rejected (duplicate): % is an active segment of this domain', p_key USING ERRCODE = '22023';
  END IF;
  INSERT INTO analytics.experience_segments (segment_id, scope, tenant_id, domain_id, segment_key, dimension, value, k_min, declared_by, correlation_id)
  VALUES (p_segment, 'DOMAIN', p_tenant, p_domain, p_key, p_dimension, p_value, coalesce(p_k, 5), p_actor, p_correlation);
  PERFORM analytics.aux_ledger(p_tenant, p_domain, 'segment', p_segment, p_key, NULL, 'segment.declared', p_actor, jsonb_build_object('dimension', p_dimension, 'value', p_value, 'k_min', coalesce(p_k, 5)), p_correlation);
  RETURN (SELECT to_jsonb(x) - 'tenant_id' - 'domain_id' FROM analytics.experience_segments x WHERE x.segment_id = p_segment);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION analytics.declare_segment(uuid, uuid, uuid, text, text, text, int, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION analytics.declare_segment(uuid, uuid, uuid, text, text, text, int, uuid, uuid) TO eye_commit;

/* RECORD A BASELINE (analytics.experience.baseline.record — an analyst or the owner): MEASURED from the events of the period (the prelude's
   named periods, UTC days), for the journey or a segment; n, k, the floor, the uncertainty, the definitions it rests on, the source
   revision. INDETERMINATE (value NULL, explained) below the floor, below k, while a definition of the journey is HELD, for a partial
   period, with no event. A determinate value crossing an APPROVED threshold → a FINDING proposed and routed as a REVIEW
   (analytics.experience) — never an automatic or punitive decision. */
CREATE OR REPLACE FUNCTION analytics.record_baseline(p_baseline uuid, p_tenant uuid, p_domain uuid, p_journey_key text, p_measure text, p_step_key text, p_segment_key text, p_period text,
                                                     p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = analytics, observation, identity, ctx, public, executive, pg_catalog, pg_temp AS $$
DECLARE j analytics.experience_journeys%ROWTYPE; sg analytics.experience_segments%ROWTYPE; w record; v_from date; v_to date; m jsonb; v jsonb; v_reasons jsonb := '[]'::jsonb;
        v_k int; v_state text; v_value numeric; t analytics.experience_thresholds%ROWTYPE; v_cross jsonb := '[]'::jsonb; v_finding uuid; v_item jsonb; v_kind text := analytics.aux_kind(p_actor);
        v_held text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['analytics.experience.baseline.record']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM analytics.aux_assert_actor('experience baseline', p_actor);
  IF NOT analytics.aux_holds(p_actor, p_tenant, p_domain, ARRAY['product_analyst', 'product_analytics_owner']) THEN
    RAISE EXCEPTION 'experience baseline rejected (authority): a baseline is recorded by a product analyst or the product analytics owner' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO j FROM analytics.experience_journeys x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.journey_key = p_journey_key AND x.state = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'experience baseline rejected (unknown_journey): % is not an active journey of this domain', p_journey_key USING ERRCODE = '23503'; END IF;
  IF NOT (coalesce(p_measure, '') = ANY (analytics.aux_measures())) THEN
    RAISE EXCEPTION 'experience baseline rejected (measure): the measure is one of % (an engagement proxy never is)', array_to_string(analytics.aux_measures(), ', ') USING ERRCODE = '22023';
  END IF;
  IF (p_measure = 'step_p50_ms') <> (p_step_key IS NOT NULL) THEN RAISE EXCEPTION 'experience baseline rejected (step): a step latency names its step; a rate names none' USING ERRCODE = '22023'; END IF;
  IF p_step_key IS NOT NULL AND NOT (p_step_key = ANY (j.steps)) THEN RAISE EXCEPTION 'experience baseline rejected (step): % is not a step of %', p_step_key, j.journey_key USING ERRCODE = '22023'; END IF;
  IF p_segment_key IS NOT NULL THEN
    SELECT * INTO sg FROM analytics.experience_segments s WHERE s.tenant_id = p_tenant AND s.domain_id = p_domain AND s.segment_key = p_segment_key AND s.state = 'active';
    IF NOT FOUND THEN RAISE EXCEPTION 'experience baseline rejected (unknown_segment): % is not an active segment of this domain', p_segment_key USING ERRCODE = '23503'; END IF;
  END IF;
  SELECT * INTO w FROM analytics.period_window(p_period);
  IF w.window_from IS NULL THEN RAISE EXCEPTION 'experience baseline rejected (period): % is not a period (2026-Q3, 2026-09 or R90@2026-10-12)', p_period USING ERRCODE = '22023'; END IF;
  v_from := (w.window_from AT TIME ZONE 'UTC')::date; v_to := (w.window_to AT TIME ZONE 'UTC')::date;
  m := analytics.aux_measure(p_tenant, p_domain, j.journey_key, j.steps, p_measure, p_step_key, sg.dimension, sg.value, v_from, v_to, NULL, NULL);
  v := analytics.aux_value(m);
  v_k := coalesce(sg.k_min, 5);
  IF w.window_to > clock_timestamp() THEN v_reasons := v_reasons || to_jsonb(format('the period %s is open until %s: a partial period is not presented as the period', p_period, w.window_to)); END IF;
  IF (m ->> 'n')::int = 0 THEN v_reasons := v_reasons || to_jsonb('no event in the population for this period and segment — nothing to measure, not a measured zero'::text);
  ELSIF (m ->> 'n')::int < j.floor_n THEN v_reasons := v_reasons || to_jsonb(format('n = %s is below the journey''s floor %s: the sample cannot carry a determinate value', m ->> 'n', j.floor_n)); END IF;
  IF (m ->> 'n')::int > 0 AND (m ->> 'k_observed')::int < v_k THEN
    v_reasons := v_reasons || to_jsonb(format('the segment rests on at most %s distinct pseudonyms on any day, below k = %s: it is suppressed (no person is singled out)', m ->> 'k_observed', v_k));
  END IF;
  SELECT string_agg(format('%s v%s (%s)', x.event_key, x.version, x.hold_reason), '; ') INTO v_held FROM analytics.telemetry_definitions x
   WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.journey_key = j.journey_key AND x.state = 'approved' AND x.collection = 'held';
  IF v_held IS NOT NULL THEN v_reasons := v_reasons || to_jsonb(format('collection on this journey is held by the privacy review: %s — the measure is qualified, not current and complete', v_held)); END IF;
  v_state := CASE WHEN jsonb_array_length(v_reasons) = 0 AND (v ->> 'value') IS NOT NULL THEN 'determinate' ELSE 'indeterminate' END;
  v_value := CASE WHEN v_state = 'determinate' THEN (v ->> 'value')::numeric END;
  IF v_state = 'indeterminate' AND jsonb_array_length(v_reasons) = 0 THEN v_reasons := jsonb_build_array('the value could not be derived from the events'); END IF;
  -- the thresholds: a crossing opens a REVIEW (a finding, routed) — never an automatic decision
  IF v_state = 'determinate' THEN
    FOR t IN SELECT * FROM analytics.experience_thresholds h WHERE h.tenant_id = p_tenant AND h.domain_id = p_domain AND h.journey_key = j.journey_key AND h.measure = p_measure
               AND h.step_key IS NOT DISTINCT FROM p_step_key AND h.segment_key IS NOT DISTINCT FROM p_segment_key AND h.state = 'approved' LOOP
      IF (t.bound = 'min' AND v_value < t.value) OR (t.bound = 'max' AND v_value > t.value) THEN
        v_finding := gen_random_uuid();
        INSERT INTO analytics.experience_findings (finding_id, scope, tenant_id, domain_id, origin_kind, origin_id, journey_key, statement, evidence, digest, proposed_by, proposed_by_kind, correlation_id)
        VALUES (v_finding, 'DOMAIN', p_tenant, p_domain, 'threshold', t.threshold_id, j.journey_key,
                format('%s of the journey "%s"%s over %s is %s, %s the approved %s of %s — a review, not a decision', p_measure, j.title,
                       CASE WHEN p_segment_key IS NULL THEN '' ELSE format(' (segment %s)', p_segment_key) END, p_period, v_value,
                       CASE t.bound WHEN 'min' THEN 'below' ELSE 'above' END, t.bound, t.value),
                jsonb_build_object('baseline_id', p_baseline, 'threshold_id', t.threshold_id, 'value', v_value, 'n', m -> 'n', 'uncertainty', v -> 'uncertainty', 'automatic_origin', true),
                analytics.digest(jsonb_build_object('origin', 'threshold', 'threshold_id', t.threshold_id, 'baseline_id', p_baseline, 'value', v_value)), p_actor, coalesce(v_kind, 'system'), p_correlation);
        v_item := executive.b33_raise_routed(p_tenant, p_domain, 'analytics.experience', 'experience_finding', v_finding,
                    format('Experience threshold crossed: %s on %s (%s %s %s) — review', p_measure, j.journey_key, v_value, CASE t.bound WHEN 'min' THEN '<' ELSE '>' END, t.value),
                    jsonb_build_array(format('baseline %s over %s, n = %s', p_baseline, p_period, m ->> 'n')), t.decided_by, p_baseline, 'experience.threshold_crossed',
                    jsonb_build_object('baseline_id', p_baseline, 'threshold_id', t.threshold_id, 'journey_key', j.journey_key), NULL, p_actor, p_correlation);
        UPDATE analytics.experience_findings SET item_id = (v_item ->> 'item_id')::uuid WHERE finding_id = v_finding;
        v_cross := v_cross || jsonb_build_object('threshold_id', t.threshold_id, 'bound', t.bound, 'value', t.value, 'finding_id', v_finding, 'item', v_item);
      END IF;
    END LOOP;
  END IF;
  INSERT INTO analytics.experience_baselines (baseline_id, scope, tenant_id, domain_id, journey_id, journey_key, journey_version, measure, step_key, segment_id, segment_key, segment, period_key,
                                              window_from, window_to, state, value, numerator, denominator, n, k_observed, k_min, floor_n, distribution, uncertainty, reasons, definitions_used,
                                              source_revision, crossings, recorded_by, recorded_by_kind, correlation_id)
  VALUES (p_baseline, 'DOMAIN', p_tenant, p_domain, j.journey_id, j.journey_key, j.version, p_measure, p_step_key, sg.segment_id, sg.segment_key,
          CASE WHEN sg.segment_id IS NULL THEN NULL ELSE jsonb_build_object('dimension', sg.dimension, 'value', sg.value) END, p_period, v_from, v_to, v_state, v_value,
          (m ->> 'numerator')::numeric, (m ->> 'denominator')::numeric, (m ->> 'n')::int, (m ->> 'k_observed')::int, v_k, j.floor_n,
          CASE WHEN v_state = 'determinate' THEN v -> 'distribution' END, CASE WHEN v_state = 'determinate' THEN v -> 'uncertainty' END, v_reasons, m -> 'definitions_used', m ->> 'revision',
          v_cross, p_actor, coalesce(v_kind, 'system'), p_correlation);
  PERFORM analytics.aux_ledger(p_tenant, p_domain, 'baseline', p_baseline, j.journey_key, j.version, 'baseline.recorded', p_actor,
                               jsonb_build_object('measure', p_measure, 'period', p_period, 'segment_key', p_segment_key, 'state', v_state, 'n', m -> 'n', 'crossings', jsonb_array_length(v_cross)), p_correlation);
  RETURN (SELECT to_jsonb(x) - 'tenant_id' - 'domain_id' FROM analytics.experience_baselines x WHERE x.baseline_id = p_baseline);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION analytics.record_baseline(uuid, uuid, uuid, text, text, text, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION analytics.record_baseline(uuid, uuid, uuid, text, text, text, text, text, uuid, uuid) TO eye_commit;

/* PROPOSE a threshold (analytics.experience.threshold.propose — an analyst or the owner). */
CREATE OR REPLACE FUNCTION analytics.propose_threshold(p_threshold uuid, p_tenant uuid, p_domain uuid, p_journey_key text, p_measure text, p_step_key text, p_segment_key text, p_bound text,
                                                       p_value numeric, p_rationale text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = analytics, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE j analytics.experience_journeys%ROWTYPE; v_digest text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['analytics.experience.threshold.propose']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM analytics.aux_assert_actor('experience baseline', p_actor);
  PERFORM analytics.aux_assert_human('experience baseline', p_actor, p_tenant, p_domain, ARRAY['product_analyst', 'product_analytics_owner'], 'proposing a threshold');
  SELECT * INTO j FROM analytics.experience_journeys x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.journey_key = p_journey_key AND x.state = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'experience baseline rejected (unknown_journey): % is not an active journey of this domain', p_journey_key USING ERRCODE = '23503'; END IF;
  IF NOT (coalesce(p_measure, '') = ANY (analytics.aux_measures())) THEN RAISE EXCEPTION 'experience baseline rejected (measure): the measure is one of %', array_to_string(analytics.aux_measures(), ', ') USING ERRCODE = '22023'; END IF;
  IF (p_measure = 'step_p50_ms') <> (p_step_key IS NOT NULL) OR (p_step_key IS NOT NULL AND NOT (p_step_key = ANY (j.steps))) THEN
    RAISE EXCEPTION 'experience baseline rejected (step): a step latency names a step of the journey; a rate names none' USING ERRCODE = '22023';
  END IF;
  IF p_segment_key IS NOT NULL AND NOT EXISTS (SELECT 1 FROM analytics.experience_segments s WHERE s.tenant_id = p_tenant AND s.domain_id = p_domain AND s.segment_key = p_segment_key AND s.state = 'active') THEN
    RAISE EXCEPTION 'experience baseline rejected (unknown_segment): % is not an active segment', p_segment_key USING ERRCODE = '23503';
  END IF;
  IF p_bound NOT IN ('min', 'max') OR p_value IS NULL OR (p_measure <> 'step_p50_ms' AND p_value NOT BETWEEN 0 AND 1) OR (p_measure = 'step_p50_ms' AND p_value < 0) THEN
    RAISE EXCEPTION 'experience baseline rejected (threshold): a threshold is a min or max bound; a rate''s within 0–1, a latency''s ≥ 0 ms' USING ERRCODE = '22023';
  END IF;
  IF length(btrim(coalesce(p_rationale, ''))) < 8 THEN RAISE EXCEPTION 'experience baseline rejected (reason): a threshold states its rationale (8+ characters)' USING ERRCODE = '22023'; END IF;
  v_digest := analytics.digest(jsonb_build_object('journey_key', p_journey_key, 'measure', p_measure, 'step_key', p_step_key, 'segment_key', p_segment_key, 'bound', p_bound, 'value', p_value, 'rationale', btrim(p_rationale)));
  INSERT INTO analytics.experience_thresholds (threshold_id, scope, tenant_id, domain_id, journey_key, measure, step_key, segment_key, bound, value, rationale, digest, proposed_by, correlation_id)
  VALUES (p_threshold, 'DOMAIN', p_tenant, p_domain, p_journey_key, p_measure, p_step_key, p_segment_key, p_bound, p_value, btrim(p_rationale), v_digest, p_actor, p_correlation);
  PERFORM analytics.aux_ledger(p_tenant, p_domain, 'threshold', p_threshold, p_journey_key, NULL, 'threshold.proposed', p_actor, jsonb_build_object('digest', v_digest, 'measure', p_measure, 'bound', p_bound, 'value', p_value), p_correlation);
  RETURN (SELECT to_jsonb(x) - 'tenant_id' - 'domain_id' FROM analytics.experience_thresholds x WHERE x.threshold_id = p_threshold);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION analytics.propose_threshold(uuid, uuid, uuid, text, text, text, text, text, numeric, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION analytics.propose_threshold(uuid, uuid, uuid, text, text, text, text, text, numeric, text, uuid, uuid) TO eye_commit;

/* DECIDE (approve | reject) or RETIRE a threshold (analytics.experience.threshold.decide | .retire — human-gated: a named product analytics
   owner; the proposer never approves). A decision binds the digest the owner saw. */
CREATE OR REPLACE FUNCTION analytics.decide_threshold(p_threshold uuid, p_tenant uuid, p_domain uuid, p_decision text, p_reason text, p_digest text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = analytics, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE t analytics.experience_thresholds%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY[CASE WHEN p_decision = 'retire' THEN 'analytics.experience.threshold.retire' ELSE 'analytics.experience.threshold.decide' END]);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM analytics.aux_assert_actor('experience baseline', p_actor);
  PERFORM analytics.aux_assert_human('experience baseline', p_actor, p_tenant, p_domain, ARRAY['product_analytics_owner'], 'deciding a threshold');
  SELECT * INTO t FROM analytics.experience_thresholds x WHERE x.threshold_id = p_threshold AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'experience baseline rejected (unknown_threshold): % is not a threshold of this domain', p_threshold USING ERRCODE = '23503'; END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'experience baseline rejected (reason): a decision states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  IF p_decision = 'retire' THEN
    IF t.state <> 'approved' THEN RAISE EXCEPTION 'experience baseline rejected (state): the threshold is %; only an approved threshold is retired', t.state USING ERRCODE = '22023'; END IF;
    UPDATE analytics.experience_thresholds SET state = 'retired', retired_by = p_actor, retired_at = clock_timestamp(), retire_reason = btrim(p_reason) WHERE threshold_id = p_threshold;
  ELSE
    IF t.proposed_by = p_actor THEN RAISE EXCEPTION 'experience baseline rejected (separation_of_duties): the proposer of a threshold does not approve it' USING ERRCODE = '42501'; END IF;
    IF t.state <> 'proposed' THEN RAISE EXCEPTION 'experience baseline rejected (state): the threshold is %; only a proposed threshold is decided', t.state USING ERRCODE = '22023'; END IF;
    IF p_digest IS DISTINCT FROM t.digest THEN RAISE EXCEPTION 'experience baseline rejected (stale): the threshold is at digest %…, not the one decided', left(t.digest, 12) USING ERRCODE = '22023'; END IF;
    IF p_decision NOT IN ('approve', 'reject') THEN RAISE EXCEPTION 'experience baseline rejected (decision): approve, reject or retire' USING ERRCODE = '22023'; END IF;
    UPDATE analytics.experience_thresholds SET state = CASE p_decision WHEN 'approve' THEN 'approved' ELSE 'rejected' END, decided_by = p_actor, decided_at = clock_timestamp(),
           decision_reason = btrim(p_reason) WHERE threshold_id = p_threshold;
  END IF;
  PERFORM analytics.aux_ledger(p_tenant, p_domain, 'threshold', p_threshold, t.journey_key, NULL, 'threshold.' || CASE p_decision WHEN 'approve' THEN 'approved' WHEN 'reject' THEN 'rejected' ELSE 'retired' END,
                               p_actor, jsonb_build_object('reason', btrim(p_reason), 'digest', t.digest), p_correlation);
  RETURN (SELECT to_jsonb(x) - 'tenant_id' - 'domain_id' FROM analytics.experience_thresholds x WHERE x.threshold_id = p_threshold);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION analytics.decide_threshold(uuid, uuid, uuid, text, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION analytics.decide_threshold(uuid, uuid, uuid, text, text, text, uuid, uuid) TO eye_commit;

-- §UX.8 EXPERIMENTS (UX6) ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* PROPOSE (analytics.experiment.propose — an analyst or the owner): an active journey; an EXPERIENCE primary measure (never an engagement
   proxy — refused `(engagement)`); 2–4 variants, `control` first, each of an admitted kind with its description; no manipulation in the
   hypothesis or a description (dark-pattern words — refused `(manipulation)`); a minimum sample per arm. */
CREATE OR REPLACE FUNCTION analytics.propose_experiment(p_experiment uuid, p_tenant uuid, p_domain uuid, p_journey_key text, p_title text, p_hypothesis text, p_measure text, p_step_key text,
                                                        p_variants jsonb, p_min_sample int, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = analytics, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE j analytics.experience_journeys%ROWTYPE; v jsonb; v_keys text[] := '{}'; v_text text; v_digest text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['analytics.experiment.propose']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM analytics.aux_assert_actor('ux experiment', p_actor);
  PERFORM analytics.aux_assert_human('ux experiment', p_actor, p_tenant, p_domain, ARRAY['product_analyst', 'product_analytics_owner'], 'proposing an experiment');
  SELECT * INTO j FROM analytics.experience_journeys x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.journey_key = p_journey_key AND x.state = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'ux experiment rejected (unknown_journey): % is not an active journey of this domain', p_journey_key USING ERRCODE = '23503'; END IF;
  IF NOT (coalesce(p_measure, '') = ANY (analytics.aux_measures())) THEN
    RAISE EXCEPTION 'ux experiment rejected (engagement): the primary measure is an experience measure (%) — never an engagement proxy such as time on page, clicks or sessions', array_to_string(analytics.aux_measures(), ', ') USING ERRCODE = '22023';
  END IF;
  IF (p_measure = 'step_p50_ms') <> (p_step_key IS NOT NULL) OR (p_step_key IS NOT NULL AND NOT (p_step_key = ANY (j.steps))) THEN
    RAISE EXCEPTION 'ux experiment rejected (step): a step latency names a step of the journey; a rate names none' USING ERRCODE = '22023';
  END IF;
  IF length(btrim(coalesce(p_title, ''))) NOT BETWEEN 4 AND 200 OR length(btrim(coalesce(p_hypothesis, ''))) < 16 THEN
    RAISE EXCEPTION 'ux experiment rejected (request): a title (4–200) and a hypothesis (16+ characters)' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_variants) IS DISTINCT FROM 'array' OR jsonb_array_length(p_variants) NOT BETWEEN 2 AND 4 THEN
    RAISE EXCEPTION 'ux experiment rejected (variants): 2–4 variants, the first the control' USING ERRCODE = '22023';
  END IF;
  FOR v IN SELECT * FROM jsonb_array_elements(p_variants) LOOP
    IF jsonb_typeof(v) IS DISTINCT FROM 'object' OR coalesce(v ->> 'key', '') !~ '^[a-z][a-z0-9_]{0,20}$' OR (v ->> 'key') = ANY (v_keys) THEN
      RAISE EXCEPTION 'ux experiment rejected (variants): each variant has a distinct key ^[a-z][a-z0-9_]{0,20}$' USING ERRCODE = '22023';
    END IF;
    IF NOT (coalesce(v ->> 'kind', '') = ANY (analytics.aux_variant_kinds())) THEN
      RAISE EXCEPTION 'ux experiment rejected (variants): a variant is a %, an approved design alternative — % is not admitted', array_to_string(analytics.aux_variant_kinds(), ' | '), coalesce(v ->> 'kind', '<none>') USING ERRCODE = '22023';
    END IF;
    IF length(btrim(coalesce(v ->> 'description', ''))) < 16 THEN RAISE EXCEPTION 'ux experiment rejected (variants): each variant is described (16+ characters) for its approvers' USING ERRCODE = '22023'; END IF;
    IF EXISTS (SELECT 1 FROM jsonb_object_keys(v) x WHERE x NOT IN ('key', 'kind', 'description')) THEN RAISE EXCEPTION 'ux experiment rejected (variants): a variant declares key, kind and description only' USING ERRCODE = '22023'; END IF;
    v_keys := v_keys || (v ->> 'key');
  END LOOP;
  IF v_keys[1] <> 'control' THEN RAISE EXCEPTION 'ux experiment rejected (variants): the first variant is `control` — the current design' USING ERRCODE = '22023'; END IF;
  v_text := lower(p_hypothesis || ' ' || (SELECT string_agg(x ->> 'description', ' ') FROM jsonb_array_elements(p_variants) x));
  IF v_text ~ '(dark pattern|\murgen(t|cy)\M|\mscarcity\M|countdown|confirmshaming|\mnag(ging)?\M|\mguilt|pre-?checked|pre-?selected|hide the (cancel|opt|decline)|\mtrick|\maddict|\mfomo\M|\mengagement\M|time on (page|site)|session length|\mstreaks?\M|\mmanipulat)' THEN
    RAISE EXCEPTION 'ux experiment rejected (manipulation): an experiment compares approved design alternatives; urgency, scarcity, nagging, pre-selection, hidden refusal or engagement optimisation is never tested on people' USING ERRCODE = '22023';
  END IF;
  IF coalesce(p_min_sample, 0) NOT BETWEEN 5 AND 1000000 THEN RAISE EXCEPTION 'ux experiment rejected (sample): a minimum sample per arm of at least 5' USING ERRCODE = '22023'; END IF;
  v_digest := analytics.digest(jsonb_build_object('journey_key', j.journey_key, 'journey_version', j.version, 'title', btrim(p_title), 'hypothesis', btrim(p_hypothesis), 'measure', p_measure,
                                                  'step_key', p_step_key, 'variants', p_variants, 'min_sample_per_arm', p_min_sample));
  INSERT INTO analytics.ux_experiments (experiment_id, scope, tenant_id, domain_id, journey_key, journey_version, purpose_key, title, hypothesis, primary_measure, step_key, variants, min_sample_per_arm,
                                        digest, proposed_by, proposed_by_kind, correlation_id)
  VALUES (p_experiment, 'DOMAIN', p_tenant, p_domain, j.journey_key, j.version, j.purpose_key, btrim(p_title), btrim(p_hypothesis), p_measure, p_step_key, p_variants, p_min_sample, v_digest,
          p_actor, 'human', p_correlation);
  PERFORM analytics.aux_ledger(p_tenant, p_domain, 'experiment', p_experiment, j.journey_key, j.version, 'experiment.proposed', p_actor, jsonb_build_object('digest', v_digest, 'arms', to_jsonb(v_keys)), p_correlation);
  RETURN (SELECT to_jsonb(x) - 'tenant_id' - 'domain_id' FROM analytics.ux_experiments x WHERE x.experiment_id = p_experiment);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION analytics.propose_experiment(uuid, uuid, uuid, text, text, text, text, text, jsonb, int, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION analytics.propose_experiment(uuid, uuid, uuid, text, text, text, text, text, jsonb, int, uuid, uuid) TO eye_commit;

/* APPROVE | REJECT (analytics.experiment.approve — human-gated): TWO approvals, one by a product analytics owner and one by a privacy officer,
   two different humans, neither the proposer, each at the experiment's digest; both approved → RUNNING. One rejection → rejected. The role
   an approval fills is named by the approver (`p_role`) and re-checked. */
CREATE OR REPLACE FUNCTION analytics.approve_experiment(p_approval uuid, p_tenant uuid, p_domain uuid, p_experiment uuid, p_role text, p_decision text, p_reason text, p_digest text,
                                                        p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = analytics, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE x analytics.ux_experiments%ROWTYPE; v_other analytics.ux_experiment_approvals%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['analytics.experiment.approve']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM analytics.aux_assert_actor('ux experiment', p_actor);
  IF p_role NOT IN ('product_analytics_owner', 'privacy_officer') THEN RAISE EXCEPTION 'ux experiment rejected (role): an approval is the product analytics owner''s or the privacy officer''s' USING ERRCODE = '22023'; END IF;
  PERFORM analytics.aux_assert_human('ux experiment', p_actor, p_tenant, p_domain, ARRAY[p_role], format('the %s''s approval of an experiment', replace(p_role, '_', ' ')));
  SELECT * INTO x FROM analytics.ux_experiments e WHERE e.experiment_id = p_experiment AND e.tenant_id = p_tenant AND e.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ux experiment rejected (unknown_experiment): % is not an experiment of this domain', p_experiment USING ERRCODE = '23503'; END IF;
  IF x.proposed_by = p_actor THEN RAISE EXCEPTION 'ux experiment rejected (separation_of_duties): the proposer does not approve the experiment' USING ERRCODE = '42501'; END IF;
  IF x.state <> 'proposed' THEN RAISE EXCEPTION 'ux experiment rejected (state): the experiment is %; approvals are given while it is proposed', x.state USING ERRCODE = '22023'; END IF;
  IF p_digest IS DISTINCT FROM x.digest THEN RAISE EXCEPTION 'ux experiment rejected (stale): the experiment is at digest %…, not the one approved', left(x.digest, 12) USING ERRCODE = '22023'; END IF;
  IF p_decision NOT IN ('approve', 'reject') THEN RAISE EXCEPTION 'ux experiment rejected (decision): approve or reject' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'ux experiment rejected (reason): an approval states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM analytics.ux_experiment_approvals a WHERE a.experiment_id = p_experiment AND a.role = p_role) THEN
    RAISE EXCEPTION 'ux experiment rejected (duplicate): the % has already decided this experiment', replace(p_role, '_', ' ') USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_other FROM analytics.ux_experiment_approvals a WHERE a.experiment_id = p_experiment AND a.role <> p_role;
  IF v_other.approver = p_actor THEN
    RAISE EXCEPTION 'ux experiment rejected (separation_of_duties): the two approvals are two different people (the % already approved as %)', 'approver', replace(v_other.role, '_', ' ') USING ERRCODE = '42501';
  END IF;
  INSERT INTO analytics.ux_experiment_approvals (approval_id, scope, tenant_id, domain_id, experiment_id, role, decision, approver, reason, digest, correlation_id)
  VALUES (p_approval, 'DOMAIN', p_tenant, p_domain, p_experiment, p_role, p_decision, p_actor, btrim(p_reason), x.digest, p_correlation);
  IF p_decision = 'reject' THEN
    UPDATE analytics.ux_experiments SET state = 'rejected' WHERE experiment_id = p_experiment;
  ELSIF v_other.decision = 'approve' THEN
    UPDATE analytics.ux_experiments SET state = 'running', started_at = clock_timestamp() WHERE experiment_id = p_experiment;
  END IF;
  PERFORM analytics.aux_ledger(p_tenant, p_domain, 'experiment', p_experiment, x.journey_key, NULL, 'experiment.' || CASE p_decision WHEN 'approve' THEN 'approved' ELSE 'rejected' END, p_actor,
                               jsonb_build_object('role', p_role, 'reason', btrim(p_reason), 'digest', x.digest), p_correlation);
  RETURN (SELECT to_jsonb(e) - 'tenant_id' - 'domain_id' FROM analytics.ux_experiments e WHERE e.experiment_id = p_experiment)
         || jsonb_build_object('approvals', (SELECT jsonb_agg(jsonb_build_object('role', a.role, 'decision', a.decision, 'decided_at', a.decided_at) ORDER BY a.decided_at) FROM analytics.ux_experiment_approvals a WHERE a.experiment_id = p_experiment));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION analytics.approve_experiment(uuid, uuid, uuid, uuid, text, text, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION analytics.approve_experiment(uuid, uuid, uuid, uuid, text, text, text, text, uuid, uuid) TO eye_commit;

/* THE ASSIGNMENT for the client (analytics.experiment.assignment.read — a read): the caller's arm in a RUNNING experiment, deterministic, never
   stored. A person who has NOT consented to the journey's purpose, or an experiment that is not running, gets the CONTROL — the current
   design — with the reason (no experimentation on people who did not consent). */
CREATE OR REPLACE FUNCTION analytics.experiment_assignment(p_tenant uuid, p_domain uuid, p_experiment uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = analytics, observation, public, pg_catalog, pg_temp AS $$
DECLARE x analytics.ux_experiments%ROWTYPE; v_me uuid := public.eye_principal(); v_arm int;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'an experiment assignment');
  SELECT * INTO x FROM analytics.ux_experiments e WHERE e.experiment_id = p_experiment AND e.tenant_id = p_tenant AND e.domain_id = p_domain;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF x.state <> 'running' THEN
    RETURN jsonb_build_object('experiment_id', x.experiment_id, 'assigned', false, 'arm', x.variants -> 0, 'reason', format('the experiment is %s: everyone sees the control', x.state));
  END IF;
  IF v_me IS NULL OR analytics.aux_kind(v_me) IS DISTINCT FROM 'human' OR NOT analytics.aux_consented(p_tenant, p_domain, v_me, x.purpose_key) THEN
    RETURN jsonb_build_object('experiment_id', x.experiment_id, 'assigned', false, 'arm', x.variants -> 0, 'reason', 'not_consented: without consent to the purpose you always see the control (the current design)');
  END IF;
  v_arm := analytics.aux_arm(x.experiment_id, v_me, jsonb_array_length(x.variants));
  RETURN jsonb_build_object('experiment_id', x.experiment_id, 'assigned', true, 'arm', x.variants -> v_arm, 'journey_key', x.journey_key);
END $$;
REVOKE ALL ON FUNCTION analytics.experiment_assignment(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION analytics.experiment_assignment(uuid, uuid, uuid) TO eye_app, eye_commit;

/* ANALYSE (analytics.experiment.analyse — an analyst or the owner; AI may analyse? NO — the analysis feeds a human conclusion; an analyst
   runs it). Per arm, the primary measure from the events carrying the arm (aux_measure), k per arm; the SAMPLE-RATIO-MISMATCH check
   (χ² of the units per arm against equal allocation, α = 0.001); the PRIVACY HOLD check (a definition of the journey held now); the DRIFT
   check (a definition of the journey approved after the start — the semantics changed under the experiment). SRM / hold / drift → verdict
   `invalid`, the experiment INVALIDATED and routed; an arm below its minimum sample or below k → `insufficient` (no claim); otherwise
   `valid` with the comparison against the control: a rate's difference with NEWCOMBE's 95 % interval (claim only when it excludes 0), a
   duration's medians with both intervals (no claim when they overlap or are unbounded). */
CREATE OR REPLACE FUNCTION analytics.analyse_experiment(p_analysis uuid, p_tenant uuid, p_domain uuid, p_experiment uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = analytics, observation, identity, ctx, public, executive, pg_catalog, pg_temp AS $$
DECLARE x analytics.ux_experiments%ROWTYPE; j analytics.experience_journeys%ROWTYPE; v jsonb; m jsonb; vv jsonb; v_arms jsonb := '[]'::jsonb; v_cmp jsonb := '[]'::jsonb; v_reasons jsonb := '[]'::jsonb;
        v_checks jsonb := '[]'::jsonb; v_total numeric := 0; v_chi numeric := 0; v_crit numeric; v_k int; v_srm boolean; v_verdict text; v_from date; v_to date; c jsonb; a jsonb;
        p1 numeric; p2 numeric; l1 numeric; u1 numeric; l2 numeric; u2 numeric; d numeric; lo numeric; hi numeric; v_held text; v_drift text; v_digest text; v_claim text; v_item jsonb := NULL;
BEGIN
  PERFORM observation.assert_authority(ARRAY['analytics.experiment.analyse']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM analytics.aux_assert_actor('ux experiment', p_actor);
  PERFORM analytics.aux_assert_human('ux experiment', p_actor, p_tenant, p_domain, ARRAY['product_analyst', 'product_analytics_owner'], 'analysing an experiment');
  SELECT * INTO x FROM analytics.ux_experiments e WHERE e.experiment_id = p_experiment AND e.tenant_id = p_tenant AND e.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ux experiment rejected (unknown_experiment): % is not an experiment of this domain', p_experiment USING ERRCODE = '23503'; END IF;
  IF x.state <> 'running' THEN RAISE EXCEPTION 'ux experiment rejected (state): the experiment is %; a running experiment is analysed', x.state USING ERRCODE = '22023'; END IF;
  SELECT * INTO j FROM analytics.experience_journeys g WHERE g.tenant_id = p_tenant AND g.domain_id = p_domain AND g.journey_key = x.journey_key AND g.version = x.journey_version;
  v_from := (x.started_at AT TIME ZONE 'UTC')::date; v_to := analytics.aux_today() + 1;
  FOR v IN SELECT * FROM jsonb_array_elements(x.variants) LOOP
    m := analytics.aux_measure(p_tenant, p_domain, x.journey_key, j.steps, x.primary_measure, x.step_key, NULL, NULL, v_from, v_to, x.experiment_id, v ->> 'key');
    vv := analytics.aux_value(m);
    v_arms := v_arms || jsonb_build_object('key', v ->> 'key', 'kind', v ->> 'kind', 'n', m -> 'n', 'numerator', m -> 'numerator', 'k_observed', m -> 'k_observed',
                                           'value', vv -> 'value', 'uncertainty', vv -> 'uncertainty', 'distribution', vv -> 'distribution', 'revision', m -> 'revision');
    v_total := v_total + (m ->> 'n')::numeric;
  END LOOP;
  -- sample-ratio mismatch: χ² against equal allocation, df = arms − 1, α = 0.001
  IF v_total > 0 THEN
    SELECT sum(power((a2 ->> 'n')::numeric - v_total / jsonb_array_length(v_arms), 2) / (v_total / jsonb_array_length(v_arms))) INTO v_chi FROM jsonb_array_elements(v_arms) a2;
  END IF;
  v_crit := CASE jsonb_array_length(v_arms) WHEN 2 THEN 10.828 WHEN 3 THEN 13.816 ELSE 16.266 END;
  v_chi := coalesce(v_chi, 0);
  v_srm := v_total >= 2 * jsonb_array_length(v_arms) AND v_chi > v_crit;
  v_checks := v_checks || jsonb_build_object('check', 'sample_ratio', 'chi_square', round(coalesce(v_chi, 0), 4), 'critical', v_crit, 'alpha', 0.001, 'units', v_total, 'passed', NOT v_srm);
  IF v_srm THEN v_reasons := v_reasons || to_jsonb(format('sample-ratio mismatch: χ² = %s > %s (α = 0.001) over %s units — the assignment or the collection is broken; no comparison is claimed', round(v_chi, 3), v_crit, v_total)); END IF;
  SELECT string_agg(format('%s v%s', t.event_key, t.version), ', ') INTO v_held FROM analytics.telemetry_definitions t
   WHERE t.tenant_id = p_tenant AND t.domain_id = p_domain AND t.journey_key = x.journey_key AND t.state = 'approved' AND t.collection = 'held';
  v_checks := v_checks || jsonb_build_object('check', 'privacy_hold', 'held', v_held, 'passed', v_held IS NULL);
  IF v_held IS NOT NULL THEN v_reasons := v_reasons || to_jsonb(format('collection on the journey is held by the privacy review (%s)', v_held)); END IF;
  SELECT string_agg(format('%s v%s approved %s', t.event_key, t.version, t.decided_at), ', ') INTO v_drift FROM analytics.telemetry_definitions t
   WHERE t.tenant_id = p_tenant AND t.domain_id = p_domain AND t.journey_key = x.journey_key AND t.state IN ('approved', 'superseded', 'retired') AND t.decided_at > x.started_at;
  v_checks := v_checks || jsonb_build_object('check', 'definition_drift', 'changed', v_drift, 'passed', v_drift IS NULL);
  IF v_drift IS NOT NULL THEN v_reasons := v_reasons || to_jsonb(format('the event semantics drifted during the experiment (%s): the arms are not comparable', v_drift)); END IF;
  IF jsonb_array_length(v_reasons) > 0 THEN
    v_verdict := 'invalid';
  ELSE
    FOR a IN SELECT * FROM jsonb_array_elements(v_arms) LOOP
      IF (a ->> 'n')::int < x.min_sample_per_arm THEN v_reasons := v_reasons || to_jsonb(format('arm %s: n = %s is below the minimum sample %s', a ->> 'key', a ->> 'n', x.min_sample_per_arm)); END IF;
      IF (a ->> 'k_observed')::int < 5 THEN v_reasons := v_reasons || to_jsonb(format('arm %s rests on at most %s distinct pseudonyms on any day, below k = 5: suppressed', a ->> 'key', a ->> 'k_observed')); END IF;
    END LOOP;
    v_verdict := CASE WHEN jsonb_array_length(v_reasons) > 0 THEN 'insufficient' ELSE 'valid' END;
  END IF;
  IF v_verdict = 'valid' THEN
    c := v_arms -> 0;
    FOR a IN SELECT z.e FROM jsonb_array_elements(v_arms) WITH ORDINALITY z(e, o) WHERE z.o > 1 LOOP
      IF x.primary_measure <> 'step_p50_ms' THEN
        p1 := (a ->> 'value')::numeric; p2 := (c ->> 'value')::numeric; l1 := (a -> 'uncertainty' ->> 'lo')::numeric; u1 := (a -> 'uncertainty' ->> 'hi')::numeric;
        l2 := (c -> 'uncertainty' ->> 'lo')::numeric; u2 := (c -> 'uncertainty' ->> 'hi')::numeric; d := p1 - p2;
        lo := d - sqrt(power(p1 - l1, 2) + power(u2 - p2, 2)); hi := d + sqrt(power(u1 - p1, 2) + power(p2 - l2, 2));
        v_claim := CASE WHEN lo > 0 THEN 'better' WHEN hi < 0 THEN 'worse' ELSE 'no_claim (the interval includes 0)' END;
        v_cmp := v_cmp || jsonb_build_object('arm', a ->> 'key', 'against', 'control', 'difference', round(d, 6), 'interval', jsonb_build_object('method', 'newcombe', 'level', 0.95, 'lo', round(lo, 6), 'hi', round(hi, 6)), 'claim', v_claim);
      ELSE
        v_claim := CASE WHEN (a -> 'uncertainty' ->> 'hi') IS NULL OR (c -> 'uncertainty' ->> 'hi') IS NULL THEN 'no_claim (an interval of the median is unbounded at this n)'
                        WHEN (a -> 'uncertainty' ->> 'hi')::numeric < (c -> 'uncertainty' ->> 'lo')::numeric THEN 'better'
                        WHEN (a -> 'uncertainty' ->> 'lo')::numeric > (c -> 'uncertainty' ->> 'hi')::numeric THEN 'worse'
                        ELSE 'no_claim (the intervals of the medians overlap)' END;
        v_cmp := v_cmp || jsonb_build_object('arm', a ->> 'key', 'against', 'control', 'median', a -> 'value', 'control_median', c -> 'value', 'interval', a -> 'uncertainty', 'control_interval', c -> 'uncertainty', 'claim', v_claim);
      END IF;
    END LOOP;
  END IF;
  v_digest := analytics.digest(jsonb_build_object('experiment_id', p_experiment, 'verdict', v_verdict, 'arms', v_arms, 'comparisons', v_cmp, 'reasons', v_reasons));
  INSERT INTO analytics.ux_experiment_analyses (analysis_id, scope, tenant_id, domain_id, experiment_id, verdict, arms, comparisons, srm, checks, reasons, digest, analysed_by, analysed_by_kind, correlation_id)
  VALUES (p_analysis, 'DOMAIN', p_tenant, p_domain, p_experiment, v_verdict, v_arms, v_cmp, (v_checks -> 0), v_checks, v_reasons, v_digest, p_actor, coalesce(analytics.aux_kind(p_actor), 'system'), p_correlation);
  IF v_verdict = 'invalid' THEN
    v_item := analytics.aux_invalidate(x, CASE WHEN v_srm THEN 'sample_ratio_mismatch' WHEN v_held IS NOT NULL THEN 'privacy_hold' ELSE 'drift' END, v_reasons, p_actor, p_correlation);
  END IF;
  PERFORM analytics.aux_ledger(p_tenant, p_domain, 'experiment', p_experiment, x.journey_key, NULL, 'experiment.analysed', p_actor, jsonb_build_object('analysis_id', p_analysis, 'verdict', v_verdict, 'digest', v_digest), p_correlation);
  RETURN (SELECT to_jsonb(n) - 'tenant_id' - 'domain_id' FROM analytics.ux_experiment_analyses n WHERE n.analysis_id = p_analysis)
         || jsonb_build_object('experiment_state', (SELECT e.state FROM analytics.ux_experiments e WHERE e.experiment_id = p_experiment), 'item', v_item);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION analytics.analyse_experiment(uuid, uuid, uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION analytics.analyse_experiment(uuid, uuid, uuid, uuid, uuid, uuid) TO eye_commit;

/* CONCLUDE (analytics.experiment.conclude — human-gated: a named product analytics owner, not the proposer): adopt an arm | no_change |
   inconclusive, with the LATEST analysis at its digest (stale → 409). Adopting needs a VALID analysis whose comparison claims the arm
   better (a rate's interval above 0, a median's interval below the control's); an invalidated experiment concludes only no_change or
   inconclusive. A conclusion ADVISES product improvement — it changes nothing in the product by itself (UX-70-004). */
CREATE OR REPLACE FUNCTION analytics.conclude_experiment(p_tenant uuid, p_domain uuid, p_experiment uuid, p_conclusion text, p_arm text, p_analysis uuid, p_analysis_digest text, p_reason text,
                                                         p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = analytics, observation, identity, ctx, public, executive, pg_catalog, pg_temp AS $$
DECLARE x analytics.ux_experiments%ROWTYPE; n analytics.ux_experiment_analyses%ROWTYPE; v_cmp jsonb; v_closed jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['analytics.experiment.conclude']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM analytics.aux_assert_actor('ux experiment', p_actor);
  PERFORM analytics.aux_assert_human('ux experiment', p_actor, p_tenant, p_domain, ARRAY['product_analytics_owner'], 'concluding an experiment');
  SELECT * INTO x FROM analytics.ux_experiments e WHERE e.experiment_id = p_experiment AND e.tenant_id = p_tenant AND e.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ux experiment rejected (unknown_experiment): % is not an experiment of this domain', p_experiment USING ERRCODE = '23503'; END IF;
  IF x.proposed_by = p_actor THEN RAISE EXCEPTION 'ux experiment rejected (separation_of_duties): the proposer does not conclude the experiment' USING ERRCODE = '42501'; END IF;
  IF x.state NOT IN ('running', 'invalidated') THEN RAISE EXCEPTION 'ux experiment rejected (state): the experiment is %; a running or invalidated experiment is concluded', x.state USING ERRCODE = '22023'; END IF;
  IF p_conclusion NOT IN ('adopt', 'no_change', 'inconclusive') THEN RAISE EXCEPTION 'ux experiment rejected (conclusion): adopt, no_change or inconclusive' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'ux experiment rejected (reason): a conclusion states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  SELECT * INTO n FROM analytics.ux_experiment_analyses a WHERE a.experiment_id = p_experiment ORDER BY a.analysed_at DESC, a.analysis_id DESC LIMIT 1;
  IF n.analysis_id IS NULL THEN RAISE EXCEPTION 'ux experiment rejected (evidence): the experiment has no analysis — a conclusion rests on one' USING ERRCODE = '22023'; END IF;
  IF n.analysis_id IS DISTINCT FROM p_analysis OR n.digest IS DISTINCT FROM p_analysis_digest THEN
    RAISE EXCEPTION 'ux experiment rejected (stale): the latest analysis is % at digest %…, not the one concluded on', n.analysis_id, left(n.digest, 12) USING ERRCODE = '22023';
  END IF;
  IF p_conclusion = 'adopt' THEN
    IF x.state = 'invalidated' OR n.verdict <> 'valid' THEN
      RAISE EXCEPTION 'ux experiment rejected (evidence): the analysis is % (the experiment %): nothing is adopted on it — conclude no_change or inconclusive', n.verdict, x.state USING ERRCODE = '22023';
    END IF;
    SELECT c INTO v_cmp FROM jsonb_array_elements(n.comparisons) c WHERE c ->> 'arm' = p_arm;
    IF v_cmp IS NULL THEN RAISE EXCEPTION 'ux experiment rejected (arm): % is not a compared arm of the experiment', coalesce(p_arm, '<none>') USING ERRCODE = '22023'; END IF;
    IF v_cmp ->> 'claim' <> 'better' THEN
      RAISE EXCEPTION 'ux experiment rejected (evidence): arm % is not shown better than the control (%): adopting it would claim what the uncertainty does not support', p_arm, v_cmp ->> 'claim' USING ERRCODE = '22023';
    END IF;
  END IF;
  UPDATE analytics.ux_experiments SET state = 'concluded', concluded_by = p_actor, concluded_at = clock_timestamp(),
         conclusion = jsonb_build_object('conclusion', p_conclusion, 'arm', p_arm, 'analysis_id', n.analysis_id, 'analysis_digest', n.digest, 'reason', btrim(p_reason), 'comparison', v_cmp,
                                         'advisory', 'a conclusion advises product improvement; the change itself is a governed product decision, never automatic')
   WHERE experiment_id = p_experiment;
  v_closed := executive.b33_close_items(p_tenant, p_domain, 'analytics.experience', 'experiment', p_experiment, format('concluded by the product analytics owner: %s', p_conclusion), p_actor, p_correlation);
  PERFORM analytics.aux_ledger(p_tenant, p_domain, 'experiment', p_experiment, x.journey_key, NULL, 'experiment.concluded', p_actor,
                               jsonb_build_object('conclusion', p_conclusion, 'arm', p_arm, 'analysis_id', n.analysis_id, 'items_closed', v_closed), p_correlation);
  RETURN (SELECT to_jsonb(e) - 'tenant_id' - 'domain_id' FROM analytics.ux_experiments e WHERE e.experiment_id = p_experiment);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION analytics.conclude_experiment(uuid, uuid, uuid, text, text, uuid, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION analytics.conclude_experiment(uuid, uuid, uuid, text, text, uuid, text, text, uuid, uuid) TO eye_commit;

-- §UX.9 FINDINGS → HUMAN-DECIDED ACTIONS (UX7) ─────────────────────────────────────────────────────────────────────────────────────────
/* PROPOSE a finding (analytics.experience.finding.propose — an analyst, the owner or an AGENT: AI may propose): from a baseline, a threshold,
   an experiment or a product metric result of the domain; routed for the owner's review (analytics.experience). */
CREATE OR REPLACE FUNCTION analytics.propose_finding(p_finding uuid, p_tenant uuid, p_domain uuid, p_origin_kind text, p_origin uuid, p_journey_key text, p_statement text, p_evidence jsonb,
                                                     p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = analytics, observation, identity, ctx, public, executive, pg_catalog, pg_temp AS $$
DECLARE v_kind text := analytics.aux_kind(p_actor); v_exists boolean; v_digest text; v_item jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['analytics.experience.finding.propose']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM analytics.aux_assert_actor('experience finding', p_actor);
  IF NOT analytics.aux_holds(p_actor, p_tenant, p_domain, ARRAY['product_analyst', 'product_analytics_owner', 'attention_agent']) THEN
    RAISE EXCEPTION 'experience finding rejected (authority): a finding is proposed by a product analyst, the owner or the attention agent' USING ERRCODE = '42501';
  END IF;
  IF p_origin_kind NOT IN ('baseline', 'threshold', 'experiment', 'result') THEN RAISE EXCEPTION 'experience finding rejected (origin): a finding comes from a baseline, a threshold, an experiment or a metric result' USING ERRCODE = '22023'; END IF;
  v_exists := CASE p_origin_kind
    WHEN 'baseline' THEN EXISTS (SELECT 1 FROM analytics.experience_baselines b WHERE b.baseline_id = p_origin AND b.tenant_id = p_tenant AND b.domain_id = p_domain)
    WHEN 'threshold' THEN EXISTS (SELECT 1 FROM analytics.experience_thresholds b WHERE b.threshold_id = p_origin AND b.tenant_id = p_tenant AND b.domain_id = p_domain)
    WHEN 'experiment' THEN EXISTS (SELECT 1 FROM analytics.ux_experiments b WHERE b.experiment_id = p_origin AND b.tenant_id = p_tenant AND b.domain_id = p_domain)
    ELSE EXISTS (SELECT 1 FROM analytics.metric_results b WHERE b.result_id = p_origin AND b.tenant_id = p_tenant AND b.domain_id = p_domain) END;
  IF NOT v_exists THEN RAISE EXCEPTION 'experience finding rejected (unknown_origin): % is not a % of this domain', p_origin, p_origin_kind USING ERRCODE = '23503'; END IF;
  IF p_journey_key IS NOT NULL AND NOT EXISTS (SELECT 1 FROM analytics.experience_journeys g WHERE g.tenant_id = p_tenant AND g.domain_id = p_domain AND g.journey_key = p_journey_key) THEN
    RAISE EXCEPTION 'experience finding rejected (unknown_journey): % is not a journey of this domain', p_journey_key USING ERRCODE = '23503';
  END IF;
  IF length(btrim(coalesce(p_statement, ''))) < 16 THEN RAISE EXCEPTION 'experience finding rejected (statement): a finding states what was found (16+ characters)' USING ERRCODE = '22023'; END IF;
  IF p_evidence IS NOT NULL AND jsonb_typeof(p_evidence) <> 'object' THEN RAISE EXCEPTION 'experience finding rejected (evidence): the evidence is an object' USING ERRCODE = '22023'; END IF;
  v_digest := analytics.digest(jsonb_build_object('origin_kind', p_origin_kind, 'origin_id', p_origin, 'journey_key', p_journey_key, 'statement', btrim(p_statement), 'evidence', coalesce(p_evidence, '{}'::jsonb)));
  INSERT INTO analytics.experience_findings (finding_id, scope, tenant_id, domain_id, origin_kind, origin_id, journey_key, statement, evidence, digest, proposed_by, proposed_by_kind, correlation_id)
  VALUES (p_finding, 'DOMAIN', p_tenant, p_domain, p_origin_kind, p_origin, p_journey_key, btrim(p_statement), coalesce(p_evidence, '{}'::jsonb), v_digest, p_actor, coalesce(v_kind, 'system'), p_correlation);
  v_item := executive.b33_raise_routed(p_tenant, p_domain, 'analytics.experience', 'experience_finding', p_finding,
              format('Experience finding (%s, proposed by %s): review and decide its action', p_origin_kind, CASE WHEN v_kind = 'agent' THEN 'an agent' ELSE 'an analyst' END),
              jsonb_build_array(left(btrim(p_statement), 400)), NULL, p_finding, 'experience.finding_proposed', jsonb_build_object('finding_id', p_finding, 'origin_kind', p_origin_kind, 'origin_id', p_origin),
              NULL, p_actor, p_correlation);
  UPDATE analytics.experience_findings SET item_id = (v_item ->> 'item_id')::uuid WHERE finding_id = p_finding;
  PERFORM analytics.aux_ledger(p_tenant, p_domain, 'finding', p_finding, p_journey_key, NULL, 'finding.proposed', p_actor, jsonb_build_object('origin_kind', p_origin_kind, 'origin_id', p_origin, 'by_kind', v_kind, 'item', v_item), p_correlation);
  RETURN (SELECT to_jsonb(f) - 'tenant_id' - 'domain_id' FROM analytics.experience_findings f WHERE f.finding_id = p_finding) || jsonb_build_object('item', v_item);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION analytics.propose_finding(uuid, uuid, uuid, text, uuid, text, text, jsonb, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION analytics.propose_finding(uuid, uuid, uuid, text, uuid, text, text, jsonb, uuid, uuid) TO eye_commit;

/* THE CONSEQUENCE PREVIEW of an action (a read — analytics.read): what deciding it would do, stated before anyone decides — the finding at its
   digest, the kind, the target, the effects (a hold stops collection and invalidates the running experiments of the journey; a retirement
   stops computation or collection and keeps history; a backlog item / design change proposal / research request is RECORDED — nothing in
   the product changes automatically), and the preview's own digest the decision must name. NULL for an unknown finding. */
CREATE OR REPLACE FUNCTION analytics.action_preview(p_tenant uuid, p_domain uuid, p_finding uuid, p_kind text, p_target uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = analytics, observation, public, pg_catalog, pg_temp AS $$
DECLARE f analytics.experience_findings%ROWTYPE; d analytics.telemetry_definitions%ROWTYPE; t analytics.experience_thresholds%ROWTYPE; v_eff jsonb := '[]'::jsonb; v_target jsonb := NULL;
        v_ok boolean := true; v_problem text := NULL; v_out jsonb;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'an action''s consequence preview');
  SELECT * INTO f FROM analytics.experience_findings x WHERE x.finding_id = p_finding AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF p_kind IS NULL THEN   -- the DISMISSAL's preview
    IF p_target IS NOT NULL THEN v_ok := false; v_problem := 'a dismissal names no target'; END IF;
    v_eff := v_eff || to_jsonb('the finding is DISMISSED: nothing in the product changes; the finding and its evidence stay readable'::text);
  ELSIF NOT (p_kind = ANY (analytics.aux_action_kinds())) THEN
    v_ok := false; v_problem := format('the kind is one of %s', array_to_string(analytics.aux_action_kinds(), ', '));
  ELSIF p_kind = 'hold_collection' THEN
    SELECT * INTO d FROM analytics.telemetry_definitions x WHERE x.definition_id = p_target AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
    IF d.definition_id IS NULL OR d.state <> 'approved' THEN v_ok := false; v_problem := 'a hold names an APPROVED telemetry definition of this domain';
    ELSE
      v_target := jsonb_build_object('kind', 'telemetry_definition', 'id', d.definition_id, 'event_key', d.event_key, 'version', d.version, 'collection', d.collection);
      v_eff := v_eff || to_jsonb(CASE WHEN d.collection = 'held' THEN format('collection of %s v%s is already held — no change', d.event_key, d.version)
                                      ELSE format('collection of %s v%s STOPS (held); the events already stored stay as they are until the purge', d.event_key, d.version) END)
                     || to_jsonb(format('running experiments on the journey %s are INVALIDATED: %s', d.journey_key,
                                        coalesce((SELECT string_agg(e.title, '; ') FROM analytics.ux_experiments e WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain AND e.journey_key = d.journey_key AND e.state = 'running'), 'none')))
                     || to_jsonb('a privacy review is routed to the privacy officer, who alone releases the hold'::text);
    END IF;
  ELSIF p_kind = 'retire_measure' THEN
    SELECT * INTO t FROM analytics.experience_thresholds x WHERE x.threshold_id = p_target AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
    IF t.threshold_id IS NOT NULL THEN
      IF t.state <> 'approved' THEN v_ok := false; v_problem := 'a retired measure is an APPROVED threshold or telemetry definition'; END IF;
      v_target := jsonb_build_object('kind', 'threshold', 'id', t.threshold_id, 'journey_key', t.journey_key, 'measure', t.measure, 'bound', t.bound, 'value', t.value);
      v_eff := v_eff || to_jsonb(format('the threshold (%s %s %s on %s) is RETIRED: no crossing of it opens a review any more; its history stays readable', t.measure, t.bound, t.value, t.journey_key));
    ELSE
      SELECT * INTO d FROM analytics.telemetry_definitions x WHERE x.definition_id = p_target AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
      IF d.definition_id IS NULL OR d.state <> 'approved' THEN v_ok := false; v_problem := 'a retired measure is an APPROVED threshold or telemetry definition of this domain';
      ELSE
        v_target := jsonb_build_object('kind', 'telemetry_definition', 'id', d.definition_id, 'event_key', d.event_key, 'version', d.version);
        v_eff := v_eff || to_jsonb(format('the event definition %s v%s is RETIRED: collection stops for good; what was collected stays readable as aggregates until the purge', d.event_key, d.version));
      END IF;
    END IF;
  ELSE
    IF p_target IS NOT NULL THEN v_ok := false; v_problem := format('a %s names no target', replace(p_kind, '_', ' ')); END IF;
    v_eff := v_eff || to_jsonb(format('a %s is RECORDED against the finding; nothing in the product changes automatically — its follow-through is the owner''s', replace(p_kind, '_', ' ')));
  END IF;
  v_out := jsonb_build_object('finding_id', f.finding_id, 'finding_digest', f.digest, 'finding_state', f.state, 'kind', p_kind, 'target', v_target, 'effects', v_eff,
                              'automatic', false, 'admissible', v_ok, 'problem', v_problem);
  RETURN v_out || jsonb_build_object('preview_digest', analytics.digest(v_out));
END $$;
REVOKE ALL ON FUNCTION analytics.action_preview(uuid, uuid, uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION analytics.action_preview(uuid, uuid, uuid, text, uuid) TO eye_app, eye_commit;

/* DECIDE an action (analytics.experience.action.decide — human-gated): a named PRODUCT ANALYTICS OWNER, never the finding's proposer, never an
   agent (refused at the PEP AND here), acts or dismisses, naming the finding digest and the PREVIEW digest they saw (both recomputed now:
   stale → 409). Acting performs exactly the previewed effect: a hold (the privacy officer alone releases it), a retirement, or a recorded
   backlog item / design change proposal / research request. The finding's items close. */
CREATE OR REPLACE FUNCTION analytics.decide_action(p_action uuid, p_tenant uuid, p_domain uuid, p_finding uuid, p_decision text, p_kind text, p_target uuid, p_reason text,
                                                   p_finding_digest text, p_preview_digest text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = analytics, observation, identity, ctx, public, executive, pg_catalog, pg_temp AS $$
DECLARE f analytics.experience_findings%ROWTYPE; v_preview jsonb; v_effect jsonb := '{}'::jsonb; d analytics.telemetry_definitions%ROWTYPE; v_closed jsonb; v_kind text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['analytics.experience.action.decide']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM analytics.aux_assert_actor('experience action', p_actor);
  PERFORM analytics.aux_assert_human('experience action', p_actor, p_tenant, p_domain, ARRAY['product_analytics_owner'], 'deciding the action a finding leads to');
  SELECT * INTO f FROM analytics.experience_findings x WHERE x.finding_id = p_finding AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'experience action rejected (unknown_finding): % is not a finding of this domain', p_finding USING ERRCODE = '23503'; END IF;
  IF f.proposed_by = p_actor THEN RAISE EXCEPTION 'experience action rejected (separation_of_duties): the proposer of a finding does not decide its action' USING ERRCODE = '42501'; END IF;
  IF f.state <> 'proposed' THEN RAISE EXCEPTION 'experience action rejected (state): the finding is already %', f.state USING ERRCODE = '22023'; END IF;
  IF p_finding_digest IS DISTINCT FROM f.digest THEN RAISE EXCEPTION 'experience action rejected (stale): the finding is at digest %…, not the one decided', left(f.digest, 12) USING ERRCODE = '22023'; END IF;
  IF p_decision NOT IN ('act', 'dismiss') THEN RAISE EXCEPTION 'experience action rejected (decision): act or dismiss' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'experience action rejected (reason): a decision states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  v_kind := CASE WHEN p_decision = 'act' THEN p_kind END;
  IF p_decision = 'act' AND p_kind IS NULL THEN RAISE EXCEPTION 'experience action rejected (kind): acting names the kind — %', array_to_string(analytics.aux_action_kinds(), ', ') USING ERRCODE = '22023'; END IF;
  v_preview := analytics.action_preview(p_tenant, p_domain, p_finding, v_kind, CASE WHEN p_decision = 'act' THEN p_target END);
  IF NOT (v_preview ->> 'admissible')::boolean THEN RAISE EXCEPTION 'experience action rejected (target): %', v_preview ->> 'problem' USING ERRCODE = '22023'; END IF;
  IF p_preview_digest IS DISTINCT FROM v_preview ->> 'preview_digest' THEN
    RAISE EXCEPTION 'experience action rejected (stale): the consequence preview is now %… (%), not the one decided on — read it again', left(v_preview ->> 'preview_digest', 12),
      (SELECT string_agg(e, '; ') FROM jsonb_array_elements_text(v_preview -> 'effects') e) USING ERRCODE = '22023';
  END IF;
  IF p_decision = 'act' AND p_kind = 'hold_collection' THEN
    SELECT * INTO d FROM analytics.telemetry_definitions x WHERE x.definition_id = p_target FOR UPDATE;
    v_effect := CASE WHEN d.collection = 'held' THEN jsonb_build_object('held', true, 'already', true)
                     ELSE analytics.aux_hold(d, format('the product analytics owner''s action on finding %s: %s', p_finding, btrim(p_reason)), 'owner action', p_actor, p_correlation) END;
  ELSIF p_decision = 'act' AND p_kind = 'retire_measure' THEN
    IF (v_preview -> 'target' ->> 'kind') = 'threshold' THEN
      UPDATE analytics.experience_thresholds SET state = 'retired', retired_by = p_actor, retired_at = clock_timestamp(), retire_reason = format('action on finding %s: %s', p_finding, btrim(p_reason))
       WHERE threshold_id = p_target AND state = 'approved';
      PERFORM analytics.aux_ledger(p_tenant, p_domain, 'threshold', p_target, NULL, NULL, 'threshold.retired', p_actor, jsonb_build_object('finding_id', p_finding, 'reason', btrim(p_reason)), p_correlation);
      v_effect := jsonb_build_object('retired', 'threshold', 'id', p_target);
    ELSE
      SELECT * INTO d FROM analytics.telemetry_definitions x WHERE x.definition_id = p_target FOR UPDATE;
      v_effect := analytics.aux_retire_definition(d, format('action on finding %s: %s', p_finding, btrim(p_reason)), p_actor, p_correlation) || jsonb_build_object('id', p_target);
    END IF;
  ELSIF p_decision = 'act' THEN
    v_effect := jsonb_build_object('recorded', p_kind, 'automatic', false, 'follow_through', 'the owner''s');
  END IF;
  INSERT INTO analytics.experience_actions (action_id, scope, tenant_id, domain_id, finding_id, decision, kind, target_kind, target_id, preview, preview_digest, reason, effect, decided_by, correlation_id)
  VALUES (p_action, 'DOMAIN', p_tenant, p_domain, p_finding, p_decision, v_kind, v_preview -> 'target' ->> 'kind', p_target, v_preview, v_preview ->> 'preview_digest', btrim(p_reason), v_effect, p_actor, p_correlation);
  UPDATE analytics.experience_findings SET state = CASE p_decision WHEN 'act' THEN 'actioned' ELSE 'dismissed' END, decided_at = clock_timestamp() WHERE finding_id = p_finding;
  v_closed := executive.b33_close_items(p_tenant, p_domain, 'analytics.experience', 'experience_finding', p_finding, format('decided by the product analytics owner: %s', coalesce(v_kind, 'dismissed')), p_actor, p_correlation);
  PERFORM analytics.aux_ledger(p_tenant, p_domain, 'action', p_action, f.journey_key, NULL, 'action.' || CASE p_decision WHEN 'act' THEN 'decided' ELSE 'dismissed' END, p_actor,
                               jsonb_build_object('finding_id', p_finding, 'kind', v_kind, 'target', p_target, 'preview_digest', v_preview ->> 'preview_digest', 'effect', v_effect, 'items_closed', v_closed), p_correlation);
  RETURN (SELECT to_jsonb(a) - 'tenant_id' - 'domain_id' FROM analytics.experience_actions a WHERE a.action_id = p_action);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION analytics.decide_action(uuid, uuid, uuid, uuid, text, text, uuid, text, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION analytics.decide_action(uuid, uuid, uuid, uuid, text, text, uuid, text, text, text, uuid, uuid) TO eye_commit;

-- §UX.10 THE GOVERNED PURGE (UX8) ───────────────────────────────────────────────────────────────────────────────────────────────────────
/* PURGE (analytics.telemetry.purge — human-gated: a named PRIVACY OFFICER): every event older than its definition's retention (the purpose's,
   bound at approval) is deleted; the counts per definition — deleted and remaining, a zero included — are recorded. Never silent. */
CREATE OR REPLACE FUNCTION analytics.purge_telemetry(p_purge uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = analytics, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE d record; v_today date := analytics.aux_today(); v_cut date; v_del int; v_counts jsonb := '[]'::jsonb; v_total int := 0;
BEGIN
  PERFORM observation.assert_authority(ARRAY['analytics.telemetry.purge']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM analytics.aux_assert_actor('telemetry definition', p_actor);
  PERFORM analytics.aux_assert_human('telemetry definition', p_actor, p_tenant, p_domain, ARRAY['privacy_officer'], 'the governed purge of raw telemetry');
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'telemetry definition rejected (reason): a purge states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  PERFORM set_config('eye.aux_purge', 'on', true);
  FOR d IN SELECT t.definition_id, t.event_key, t.version, t.retention_days, t.state FROM analytics.telemetry_definitions t
            WHERE t.tenant_id = p_tenant AND t.domain_id = p_domain AND t.retention_days IS NOT NULL ORDER BY t.event_key, t.version LOOP
    v_cut := v_today - d.retention_days;
    DELETE FROM analytics.telemetry_events e WHERE e.definition_id = d.definition_id AND e.event_day < v_cut;
    GET DIAGNOSTICS v_del = ROW_COUNT;
    v_total := v_total + v_del;
    v_counts := v_counts || jsonb_build_object('definition_id', d.definition_id, 'event_key', d.event_key, 'version', d.version, 'state', d.state, 'retention_days', d.retention_days,
                                               'cutoff_day', v_cut, 'deleted', v_del, 'remaining', (SELECT count(*) FROM analytics.telemetry_events e WHERE e.definition_id = d.definition_id));
  END LOOP;
  PERFORM set_config('eye.aux_purge', 'off', true);
  INSERT INTO analytics.telemetry_purges (purge_id, scope, tenant_id, domain_id, reason, as_of_day, counts, total_deleted, purged_by, correlation_id)
  VALUES (p_purge, 'DOMAIN', p_tenant, p_domain, btrim(p_reason), v_today, v_counts, v_total, p_actor, p_correlation);
  PERFORM analytics.aux_ledger(p_tenant, p_domain, 'purge', p_purge, NULL, NULL, 'telemetry.purged', p_actor, jsonb_build_object('total_deleted', v_total, 'definitions', jsonb_array_length(v_counts)), p_correlation);
  RETURN (SELECT to_jsonb(x) - 'tenant_id' - 'domain_id' FROM analytics.telemetry_purges x WHERE x.purge_id = p_purge);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION analytics.purge_telemetry(uuid, uuid, uuid, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION analytics.purge_telemetry(uuid, uuid, uuid, text, uuid, uuid) TO eye_commit;

-- §UX.11 THE EXPORT (UX8) ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* A baseline as it may leave the product: below k (or with nothing measured) its n, numerator and value are SUPPRESSED. */
CREATE OR REPLACE FUNCTION analytics.aux_baseline_public(b analytics.experience_baselines) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = analytics, pg_catalog, pg_temp AS $$
  SELECT (to_jsonb(b) - 'tenant_id' - 'domain_id' - 'recorded_by' - 'correlation_id')
         || CASE WHEN b.k_observed < b.k_min THEN jsonb_build_object('n', NULL, 'numerator', NULL, 'denominator', NULL, 'k_observed', NULL, 'value', NULL, 'distribution', NULL,
                                                                      'suppressed', format('below k = %s distinct pseudonyms: suppressed', b.k_min))
                 ELSE jsonb_build_object('suppressed', NULL) END
$$;
REVOKE ALL ON FUNCTION analytics.aux_baseline_public(analytics.experience_baselines) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION analytics.aux_baseline_public(analytics.experience_baselines) TO eye_app, eye_commit;
/* An analysis as it may leave the product: an arm below k has its counts and value suppressed. */
CREATE OR REPLACE FUNCTION analytics.aux_analysis_public(n analytics.ux_experiment_analyses) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = analytics, pg_catalog, pg_temp AS $$
  SELECT (to_jsonb(n) - 'tenant_id' - 'domain_id' - 'analysed_by' - 'correlation_id' - 'arms')
         || jsonb_build_object('arms', coalesce((SELECT jsonb_agg(CASE WHEN coalesce((a ->> 'k_observed')::int, 0) < 5
                                                                      THEN (a - 'n' - 'numerator' - 'k_observed' - 'value' - 'distribution' - 'revision') || jsonb_build_object('suppressed', 'below k = 5 distinct pseudonyms')
                                                                      ELSE a - 'revision' END ORDER BY o)
                                                  FROM jsonb_array_elements(n.arms) WITH ORDINALITY z(a, o)), '[]'::jsonb))
$$;
REVOKE ALL ON FUNCTION analytics.aux_analysis_public(analytics.ux_experiment_analyses) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION analytics.aux_analysis_public(analytics.ux_experiment_analyses) TO eye_app, eye_commit;

/* EXPORT (analytics.export.create — human-gated: a named product analytics owner): the AGGREGATE package (AUX-EXPORT@v1) — never a raw event,
   a pseudonym, a consent row or a principal; segments and arms below k suppressed — canonical JSON (jsonb's canonical text) with its sha256,
   recorded. */
CREATE OR REPLACE FUNCTION analytics.create_export(p_export uuid, p_tenant uuid, p_domain uuid, p_title text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = analytics, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_pkg jsonb; v_text text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['analytics.export.create']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM analytics.aux_assert_actor('analytics export', p_actor);
  PERFORM analytics.aux_assert_human('analytics export', p_actor, p_tenant, p_domain, ARRAY['product_analytics_owner'], 'exporting experience quality');
  IF length(btrim(coalesce(p_title, ''))) NOT BETWEEN 4 AND 200 THEN RAISE EXCEPTION 'analytics export rejected (request): a title of 4–200 characters' USING ERRCODE = '22023'; END IF;
  v_pkg := jsonb_build_object(
    'schema', 'AUX-EXPORT@v1', 'tenant_id', p_tenant, 'domain_id', p_domain, 'title', btrim(p_title), 'generated_at', clock_timestamp(),
    'contents', 'aggregates only: no raw event, no pseudonym, no consent row, no principal; segments and arms below k suppressed',
    'purposes', coalesce((SELECT jsonb_agg(jsonb_build_object('purpose_key', p.purpose_key, 'version', p.version, 'kind', p.purpose_kind, 'title', p.title, 'retention_days', p.retention_days, 'digest', p.digest) ORDER BY p.purpose_key)
                          FROM analytics.purposes p WHERE p.tenant_id = p_tenant AND p.domain_id = p_domain AND p.state = 'approved'
                            AND p.purpose_key IN (SELECT DISTINCT t.purpose_key FROM analytics.telemetry_definitions t WHERE t.tenant_id = p_tenant AND t.domain_id = p_domain)), '[]'::jsonb),
    'telemetry_definitions', coalesce((SELECT jsonb_agg(jsonb_build_object('event_key', t.event_key, 'version', t.version, 'state', t.state, 'collection', t.collection, 'journey_key', t.journey_key,
                                                                           'step_key', t.step_key, 'fields', t.fields, 'retention_days', t.retention_days, 'digest', t.digest) ORDER BY t.event_key, t.version)
                                       FROM analytics.telemetry_definitions t WHERE t.tenant_id = p_tenant AND t.domain_id = p_domain), '[]'::jsonb),
    'journeys', coalesce((SELECT jsonb_agg(jsonb_build_object('journey_key', j.journey_key, 'version', j.version, 'title', j.title, 'objective', j.objective, 'objective_ids', j.objective_ids,
                                                              'steps', j.steps, 'floor_n', j.floor_n, 'state', j.state) ORDER BY j.journey_key, j.version)
                          FROM analytics.experience_journeys j WHERE j.tenant_id = p_tenant AND j.domain_id = p_domain), '[]'::jsonb),
    'segments', coalesce((SELECT jsonb_agg(jsonb_build_object('segment_key', s.segment_key, 'dimension', s.dimension, 'value', s.value, 'k_min', s.k_min, 'state', s.state) ORDER BY s.segment_key)
                          FROM analytics.experience_segments s WHERE s.tenant_id = p_tenant AND s.domain_id = p_domain), '[]'::jsonb),
    'baselines', coalesce((SELECT jsonb_agg(analytics.aux_baseline_public(b) ORDER BY b.recorded_at, b.baseline_id) FROM analytics.experience_baselines b WHERE b.tenant_id = p_tenant AND b.domain_id = p_domain), '[]'::jsonb),
    'thresholds', coalesce((SELECT jsonb_agg(to_jsonb(t) - 'tenant_id' - 'domain_id' - 'proposed_by' - 'decided_by' - 'retired_by' - 'correlation_id' ORDER BY t.proposed_at)
                            FROM analytics.experience_thresholds t WHERE t.tenant_id = p_tenant AND t.domain_id = p_domain), '[]'::jsonb),
    'experiments', coalesce((SELECT jsonb_agg((to_jsonb(e) - 'tenant_id' - 'domain_id' - 'proposed_by' - 'concluded_by' - 'correlation_id')
                                               || jsonb_build_object('analyses', coalesce((SELECT jsonb_agg(analytics.aux_analysis_public(n) ORDER BY n.analysed_at) FROM analytics.ux_experiment_analyses n WHERE n.experiment_id = e.experiment_id), '[]'::jsonb),
                                                                     'approvals', coalesce((SELECT jsonb_agg(jsonb_build_object('role', a.role, 'decision', a.decision, 'decided_at', a.decided_at) ORDER BY a.decided_at) FROM analytics.ux_experiment_approvals a WHERE a.experiment_id = e.experiment_id), '[]'::jsonb))
                                               ORDER BY e.proposed_at) FROM analytics.ux_experiments e WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain), '[]'::jsonb),
    'findings', coalesce((SELECT jsonb_agg(to_jsonb(f) - 'tenant_id' - 'domain_id' - 'proposed_by' - 'correlation_id' ORDER BY f.proposed_at) FROM analytics.experience_findings f WHERE f.tenant_id = p_tenant AND f.domain_id = p_domain), '[]'::jsonb),
    'actions', coalesce((SELECT jsonb_agg(to_jsonb(a) - 'tenant_id' - 'domain_id' - 'decided_by' - 'correlation_id' ORDER BY a.decided_at) FROM analytics.experience_actions a WHERE a.tenant_id = p_tenant AND a.domain_id = p_domain), '[]'::jsonb),
    'purges', coalesce((SELECT jsonb_agg(to_jsonb(g) - 'tenant_id' - 'domain_id' - 'purged_by' - 'correlation_id' ORDER BY g.purged_at) FROM analytics.telemetry_purges g WHERE g.tenant_id = p_tenant AND g.domain_id = p_domain), '[]'::jsonb),
    'consent_counts', analytics.aux_consent_counts(p_tenant, p_domain),
    'boundary', 'software capability; a synthetic demonstration never closes a clause that needs a real integration; the signed acceptance (UX-70-006) → R2 / B107');
  v_text := v_pkg::text;
  INSERT INTO analytics.exports (export_id, scope, tenant_id, domain_id, title, schema_ref, package, canonical_bytes, digest, created_by, correlation_id)
  VALUES (p_export, 'DOMAIN', p_tenant, p_domain, btrim(p_title), 'AUX-EXPORT@v1', v_pkg, octet_length(v_text), encode(sha256(convert_to(v_text, 'UTF8')), 'hex'), p_actor, p_correlation);
  PERFORM analytics.aux_ledger(p_tenant, p_domain, 'export', p_export, NULL, NULL, 'export.created', p_actor,
                               jsonb_build_object('digest', encode(sha256(convert_to(v_text, 'UTF8')), 'hex'), 'bytes', octet_length(v_text)), p_correlation);
  RETURN (SELECT jsonb_build_object('export_id', x.export_id, 'title', x.title, 'schema_ref', x.schema_ref, 'canonical_bytes', x.canonical_bytes, 'digest', x.digest, 'created_at', x.created_at)
            FROM analytics.exports x WHERE x.export_id = p_export);
END $$ LANGUAGE plpgsql;

/* The consent counts per purpose (the privacy officer's view — counts, never who): current grants, and withdrawals ever recorded. Definer: the
   consent rows themselves are readable by their persons only. */
CREATE OR REPLACE FUNCTION analytics.aux_consent_counts(p_tenant uuid, p_domain uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = analytics, observation, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the consent counts');
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('purpose_key', z.purpose_key, 'consenting_now', z.consenting_now, 'withdrawals_recorded', z.withdrawals) ORDER BY z.purpose_key) FROM (
    SELECT c.purpose_key,
           count(DISTINCT c.principal_id) FILTER (WHERE analytics.aux_consented(p_tenant, p_domain, c.principal_id, c.purpose_key)) AS consenting_now,
           count(*) FILTER (WHERE c.decision = 'withdrawn') AS withdrawals
      FROM analytics.consents c WHERE c.tenant_id = p_tenant AND c.domain_id = p_domain GROUP BY c.purpose_key) z), '[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION analytics.aux_consent_counts(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION analytics.aux_consent_counts(uuid, uuid) TO eye_app, eye_commit;
REVOKE ALL ON FUNCTION analytics.create_export(uuid, uuid, uuid, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION analytics.create_export(uuid, uuid, uuid, text, uuid, uuid) TO eye_commit;

-- §UX.12 THE READS ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* The collection tallies per definition (definer — the events are readable by no runtime role): events stored now, by day count, and the
   attempts not collected by disposition. Counts only. */
CREATE OR REPLACE FUNCTION analytics.aux_collection_counts(p_tenant uuid, p_domain uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = analytics, observation, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the telemetry collection counts');
  RETURN coalesce((SELECT jsonb_object_agg(t.definition_id::text, jsonb_build_object(
            'stored', (SELECT count(*) FROM analytics.telemetry_events e WHERE e.definition_id = t.definition_id),
            'days', (SELECT count(DISTINCT e.event_day) FROM analytics.telemetry_events e WHERE e.definition_id = t.definition_id),
            'not_collected', coalesce((SELECT jsonb_object_agg(a.disposition, a.c) FROM (SELECT x.disposition, count(*) c FROM analytics.telemetry_attempts x WHERE x.definition_id = t.definition_id GROUP BY x.disposition) a), '{}'::jsonb),
            'purged', coalesce((SELECT sum((c ->> 'deleted')::int) FROM analytics.telemetry_purges g, jsonb_array_elements(g.counts) c WHERE g.tenant_id = p_tenant AND g.domain_id = p_domain AND (c ->> 'definition_id')::uuid = t.definition_id), 0)))
          FROM analytics.telemetry_definitions t WHERE t.tenant_id = p_tenant AND t.domain_id = p_domain), '{}'::jsonb);
END $$;
REVOKE ALL ON FUNCTION analytics.aux_collection_counts(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION analytics.aux_collection_counts(uuid, uuid) TO eye_app, eye_commit;

/* THE SELF READ (analytics.consent.read — any human of the domain): the caller's OWN consent per telemetry purpose (current or not, with
   its history), and the client's instrumentation catalogue — the approved, OPEN event definitions (key, journey, step, fields) and the
   running experiments (id, journey, arm keys). INVOKER: the consents under RLS (own rows only). */
CREATE OR REPLACE FUNCTION analytics.experience_self(p_tenant uuid, p_domain uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = analytics, pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object(
    'purposes', coalesce((SELECT jsonb_agg(jsonb_build_object('purpose_key', p.purpose_key, 'version', p.version, 'title', p.title, 'kind', p.purpose_kind, 'description', p.description,
                                                              'retention_days', p.retention_days, 'digest', p.digest,
                                                              'consented', analytics.aux_consented(p_tenant, p_domain, public.eye_principal(), p.purpose_key),
                                                              'history', coalesce((SELECT jsonb_agg(jsonb_build_object('decision', c.decision, 'purpose_version', c.purpose_version, 'recorded_at', c.recorded_at) ORDER BY c.recorded_at)
                                                                                   FROM analytics.consents c WHERE c.tenant_id = p_tenant AND c.domain_id = p_domain AND c.purpose_key = p.purpose_key
                                                                                     AND c.principal_id = public.eye_principal()), '[]'::jsonb)) ORDER BY p.purpose_key)
                          FROM analytics.purposes p WHERE p.tenant_id = p_tenant AND p.domain_id = p_domain AND p.state = 'approved' AND p.purpose_kind IN ('product_improvement', 'reliability')), '[]'::jsonb),
    'definitions', coalesce((SELECT jsonb_agg(jsonb_build_object('event_key', t.event_key, 'version', t.version, 'purpose_key', t.purpose_key, 'journey_key', t.journey_key, 'step_key', t.step_key,
                                                                 'fields', t.fields) ORDER BY t.event_key)
                             FROM analytics.telemetry_definitions t WHERE t.tenant_id = p_tenant AND t.domain_id = p_domain AND t.state = 'approved' AND t.collection = 'open'), '[]'::jsonb),
    'experiments', coalesce((SELECT jsonb_agg(jsonb_build_object('experiment_id', e.experiment_id, 'journey_key', e.journey_key, 'title', e.title,
                                                                 'arms', (SELECT jsonb_agg(v ->> 'key') FROM jsonb_array_elements(e.variants) v)) ORDER BY e.proposed_at)
                             FROM analytics.ux_experiments e WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain AND e.state = 'running'), '[]'::jsonb),
    'read_at', clock_timestamp())
$$;
GRANT EXECUTE ON FUNCTION analytics.experience_self(uuid, uuid) TO eye_app, eye_commit;

/* THE WORKSPACE (analytics.read): per journey the FOUR-PART ANATOMY (UX-70-001) — the objective; the metrics with their lineage (the latest
   baseline per measure / step / segment: value or the explained indeterminate, n, k, floor, the definitions it rests on, the source
   revision); the segments with their uncertainty (below k suppressed); the decisions and follow-through (findings, actions, experiments with
   their approvals, analyses and conclusion) — then the telemetry definitions (with their review, hold and retirement, and the collection
   tallies), the purposes, the thresholds, the purges, the exports (metadata), the consent counts and the ledger. */
CREATE OR REPLACE FUNCTION analytics.experience_workspace(p_tenant uuid, p_domain uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = analytics, pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object(
    'journeys', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'journey', to_jsonb(j) - 'tenant_id' - 'domain_id',
        'objective', jsonb_build_object('statement', j.objective, 'objective_ids', j.objective_ids, 'purpose_key', j.purpose_key),
        'metrics', coalesce((SELECT jsonb_agg(analytics.aux_baseline_public(b) ORDER BY b.measure, b.step_key NULLS FIRST, b.period_key DESC)
                               FROM analytics.experience_baselines b
                              WHERE b.baseline_id IN (SELECT DISTINCT ON (x.measure, x.step_key, x.period_key) x.baseline_id FROM analytics.experience_baselines x
                                                       WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.journey_key = j.journey_key AND x.segment_id IS NULL
                                                       ORDER BY x.measure, x.step_key, x.period_key, x.recorded_at DESC)), '[]'::jsonb),
        'segments', coalesce((SELECT jsonb_agg(analytics.aux_baseline_public(b) ORDER BY b.segment_key, b.measure, b.period_key DESC)
                                FROM analytics.experience_baselines b
                               WHERE b.baseline_id IN (SELECT DISTINCT ON (x.segment_key, x.measure, x.step_key, x.period_key) x.baseline_id FROM analytics.experience_baselines x
                                                        WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.journey_key = j.journey_key AND x.segment_id IS NOT NULL
                                                        ORDER BY x.segment_key, x.measure, x.step_key, x.period_key, x.recorded_at DESC)), '[]'::jsonb),
        'thresholds', coalesce((SELECT jsonb_agg(to_jsonb(t) - 'tenant_id' - 'domain_id' ORDER BY t.proposed_at) FROM analytics.experience_thresholds t
                                 WHERE t.tenant_id = p_tenant AND t.domain_id = p_domain AND t.journey_key = j.journey_key), '[]'::jsonb),
        'findings', coalesce((SELECT jsonb_agg((to_jsonb(f) - 'tenant_id' - 'domain_id') || jsonb_build_object('action', (SELECT to_jsonb(a) - 'tenant_id' - 'domain_id' FROM analytics.experience_actions a WHERE a.finding_id = f.finding_id))
                                               ORDER BY f.proposed_at DESC) FROM analytics.experience_findings f
                               WHERE f.tenant_id = p_tenant AND f.domain_id = p_domain AND (f.journey_key = j.journey_key)), '[]'::jsonb),
        'experiments', coalesce((SELECT jsonb_agg((to_jsonb(e) - 'tenant_id' - 'domain_id') || jsonb_build_object(
                                      'approvals', coalesce((SELECT jsonb_agg(jsonb_build_object('role', a.role, 'decision', a.decision, 'reason', a.reason, 'decided_at', a.decided_at) ORDER BY a.decided_at) FROM analytics.ux_experiment_approvals a WHERE a.experiment_id = e.experiment_id), '[]'::jsonb),
                                      'analyses', coalesce((SELECT jsonb_agg(analytics.aux_analysis_public(n) ORDER BY n.analysed_at DESC) FROM analytics.ux_experiment_analyses n WHERE n.experiment_id = e.experiment_id), '[]'::jsonb))
                                   ORDER BY e.proposed_at DESC) FROM analytics.ux_experiments e WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain AND e.journey_key = j.journey_key), '[]'::jsonb))
      ORDER BY j.journey_key) FROM analytics.experience_journeys j WHERE j.tenant_id = p_tenant AND j.domain_id = p_domain AND j.state = 'active'), '[]'::jsonb),
    'findings_unattached', coalesce((SELECT jsonb_agg((to_jsonb(f) - 'tenant_id' - 'domain_id') || jsonb_build_object('action', (SELECT to_jsonb(a) - 'tenant_id' - 'domain_id' FROM analytics.experience_actions a WHERE a.finding_id = f.finding_id)) ORDER BY f.proposed_at DESC)
                                      FROM analytics.experience_findings f WHERE f.tenant_id = p_tenant AND f.domain_id = p_domain AND f.journey_key IS NULL), '[]'::jsonb),
    'definitions', coalesce((SELECT jsonb_agg(to_jsonb(t) - 'tenant_id' - 'domain_id' ORDER BY t.event_key, t.version DESC) FROM analytics.telemetry_definitions t WHERE t.tenant_id = p_tenant AND t.domain_id = p_domain), '[]'::jsonb),
    'collection', analytics.aux_collection_counts(p_tenant, p_domain),
    'purposes', coalesce((SELECT jsonb_agg(to_jsonb(p) - 'tenant_id' - 'domain_id' ORDER BY p.purpose_key, p.version DESC) FROM analytics.purposes p WHERE p.tenant_id = p_tenant AND p.domain_id = p_domain), '[]'::jsonb),
    'segments', coalesce((SELECT jsonb_agg(to_jsonb(s) - 'tenant_id' - 'domain_id' ORDER BY s.segment_key) FROM analytics.experience_segments s WHERE s.tenant_id = p_tenant AND s.domain_id = p_domain), '[]'::jsonb),
    'purges', coalesce((SELECT jsonb_agg(to_jsonb(g) - 'tenant_id' - 'domain_id' ORDER BY g.purged_at DESC) FROM analytics.telemetry_purges g WHERE g.tenant_id = p_tenant AND g.domain_id = p_domain), '[]'::jsonb),
    'exports', coalesce((SELECT jsonb_agg(jsonb_build_object('export_id', x.export_id, 'title', x.title, 'schema_ref', x.schema_ref, 'canonical_bytes', x.canonical_bytes, 'digest', x.digest, 'created_at', x.created_at) ORDER BY x.created_at DESC)
                         FROM analytics.exports x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain), '[]'::jsonb),
    'consent_counts', analytics.aux_consent_counts(p_tenant, p_domain),
    'items', coalesce((SELECT jsonb_agg(jsonb_build_object('item_id', i.item_id, 'signal_class', i.signal_class, 'subject_kind', i.subject_kind, 'subject_id', i.subject_id, 'title', i.title, 'state', i.state,
                                                           'route_roles', i.route_roles, 'created_at', i.created_at) ORDER BY i.created_at DESC)
                       FROM executive.attention_items i WHERE i.tenant_id = p_tenant AND i.domain_id = p_domain AND i.signal_class IN ('analytics.experience', 'analytics.privacy')), '[]'::jsonb),
    'ledger', coalesce((SELECT jsonb_agg(to_jsonb(l) - 'tenant_id' - 'domain_id' ORDER BY l.occurred_at DESC) FROM (SELECT * FROM analytics.experience_events l WHERE l.tenant_id = p_tenant AND l.domain_id = p_domain ORDER BY l.occurred_at DESC LIMIT 200) l), '[]'::jsonb),
    'read_at', clock_timestamp())
$$;
GRANT EXECUTE ON FUNCTION analytics.experience_workspace(uuid, uuid) TO eye_app, eye_commit;

/* An export's package (analytics.read): the canonical text and its digest re-verified at the read. */
CREATE OR REPLACE FUNCTION analytics.export_read(p_export uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = analytics, pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object('export_id', x.export_id, 'title', x.title, 'schema_ref', x.schema_ref, 'digest', x.digest, 'canonical_bytes', x.canonical_bytes, 'created_at', x.created_at,
                            'canonical', x.package::text, 'verified', encode(sha256(convert_to(x.package::text, 'UTF8')), 'hex') = x.digest)
    FROM analytics.exports x WHERE x.export_id = p_export
$$;
GRANT EXECUTE ON FUNCTION analytics.export_read(uuid) TO eye_app, eye_commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §OR — the operating review (PR-70-001)
-- (folded at integration from the part-local file 0113_b92_x_or.sql, unchanged but for the integrator's marked lines; apply order §0, §MD, §MCA, §MCB, §CO, §UX, §OR, §I)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0113 §OR — CP-6 B92 THE OPERATING REVIEW (row PR-70-001: "a governed, role-appropriate capability through which authorized users measure
-- product quality, adoption, mission outcomes, decision support, trust, reliability, cost, capacity and value without surveillance or vanity
-- metrics" — its read model, its accountable business review and its page; the stage's demonstration scene: the NORDWERK operating review shows
-- loop-closure rate, warning acknowledgement latency and forecast calibration for the Red Sea corridor over 2026-Q3, each traceable to its
-- definition and underlying records). Part-local file: applies ALONE on top of 0001–0112 and the §0 prelude; folded last at integration
-- (§0, §MD, §MCA, §MCB, §CO, §UX, §OR). Re-declares NOTHING of the prelude or of another part.
--
-- WHAT IT IS:
--   * THE REVIEW (analytics.review.*): an operating review record — title, a NAMED calendar period (2026-Q3 / 2026-09), an APPROVED scope
--     (or the whole domain), the metric keys it reviews, the CHAIR (a named human: executive / strategy owner / product analytics owner) and
--     the participants' ROLES (never persons — no surveillance, no person listing). draft → held → closed.
--       open      — a human opens it (analytics.review.open);
--       assemble  — computes NOTHING: it CITES, per reviewed metric, the latest NON-PREVIEW, non-replay, whole-population result of the
--                   review's (metric, period, scope) by reading analytics.metric_results, records each citation as an analytics.metric_uses
--                   row (used_in_kind 'operating_review') — the DP-44-005 traceability — and lists a metric with no result as NOT COMPUTED
--                   (never hidden); an explicit pin may name a result, and a PREVIEW (a proposed definition's result) is refused;
--       hold      — the chair holds the review: the citations freeze (the meeting discusses a fixed set);
--       note      — discussion notes by the chair or a holder of a participant role;
--       decide    — the FOLLOW-THROUGH, by the chair alone: an action with a named owner (routing accountability on the record, never an
--                   aggregate per person) and a due date — routed as an `analytics.metric` attention item to that owner — or "no action"
--                   with its reason. A breached threshold or an indeterminate result opens this review workflow; nothing here is an
--                   automatic or punitive decision (App M Action control);
--       close     — the chair's SIGNED CLOSE: a digest over the cited results' source revisions, the notes and the follow-through, bound
--                   to the digest the chair read (a stale digest is refused), with a statement. A closed review is IMMUTABLE.
--   * THE SERIES (analytics.review_series — read under analytics.read): for a metric and scope, the last N periods (quarters or months) —
--     EVERY period listed: a computed period with its state (an indeterminate one with its reasons, never 0), a period with no result yet
--     `not computed`, a period wholly before the deployment's first record of the metric's population `indeterminate: no history (the
--     deployment holds no records before <date>)` — SPARSE HISTORY EXPLICIT (D7), never a blank or a zero.
--   * THE READ (analytics.operating_review_read — analytics.read): the review with, per metric, its definition (title, meaning, population,
--     numerator/denominator, window and clock, floor, owner), the cited result (value or the EXPLAINED indeterminate / unsupported state, n,
--     the interval, window, clock, scope), the drill-down to the prelude's results/:id/read (definition → result → records), the series, the
--     notes, the follow-through and the signature (verified by recomputing the digest).
--
-- CLAIMS: this is SOFTWARE CAPABILITY. The harness's reviews, results and records are SYNTHETIC; the demonstration on eye_demo is a SYNTHETIC
-- demonstration (NORDWERK records, the demo-mailbox receipts); a signed acceptance of the business review (PR-70-006 / AT-70) is R2's.
-- The chair's close is a DIGEST-BOUND act of a named human recorded on the review (the B33 section-approval idiom); an Ed25519 signature in
-- executive.signatures would need the subject kind `operating_review` added to that shared constraint — an integrator's decision, not taken here.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- §OR.1 THE TABLES ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* THE OPERATING REVIEW. The facts of the review (title, period, scope, metrics, chair, participant roles) never change; its state moves forward
   only (draft → held → closed); a closed review is immutable (aor_guard). */
CREATE TABLE analytics.operating_reviews (
  review_id          uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  title              text NOT NULL CHECK (length(btrim(title)) BETWEEN 4 AND 200),
  period_key         text NOT NULL,
  period_kind        text NOT NULL CHECK (period_kind IN ('calendar_quarter', 'calendar_month')),
  window_from        timestamptz NOT NULL,
  window_to          timestamptz NOT NULL,
  scope_id           uuid REFERENCES analytics.scopes (scope_id),
  scope_key          text,
  scope_version      int,
  metric_keys        text[] NOT NULL CHECK (cardinality(metric_keys) BETWEEN 1 AND 20),
  chair_principal_id uuid NOT NULL,
  participant_roles  text[] NOT NULL CHECK (cardinality(participant_roles) BETWEEN 1 AND 20),
  state              text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft', 'held', 'closed')),
  assembly           int  NOT NULL DEFAULT 0 CHECK (assembly >= 0),
  assembled_at       timestamptz,
  assembled_by       uuid,
  held_at            timestamptz,
  held_by            uuid,
  close_digest       text CHECK (close_digest IS NULL OR close_digest ~ '^[0-9a-f]{64}$'),
  close_statement    text,
  closed_by          uuid,
  closed_at          timestamptz,
  created_by         uuid NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT aor_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT aor_window CHECK (window_to > window_from),
  CONSTRAINT aor_scope_named CHECK ((scope_id IS NULL) = (scope_key IS NULL) AND (scope_id IS NULL) = (scope_version IS NULL)),
  CONSTRAINT aor_assembled CHECK ((assembly = 0) = (assembled_at IS NULL)),
  CONSTRAINT aor_held CHECK (state = 'draft' OR (held_at IS NOT NULL AND held_by = chair_principal_id AND assembly >= 1)),
  CONSTRAINT aor_closed CHECK ((state = 'closed') = (closed_at IS NOT NULL) AND (state = 'closed') = (close_digest IS NOT NULL)
                               AND (closed_by IS NULL OR closed_by = chair_principal_id) AND (state <> 'closed' OR length(btrim(coalesce(close_statement, ''))) >= 8))
);
CREATE INDEX aor_lookup ON analytics.operating_reviews (tenant_id, domain_id, period_key, created_at DESC);

/* THE CITATIONS of an assembly: per reviewed metric (in the review's order), the cited result, or NOT COMPUTED with the reason. Each assembly is
   a new round (a draft may be re-assembled); the read shows the review's latest round. Append-only. */
CREATE TABLE analytics.review_citations (
  review_id   uuid NOT NULL REFERENCES analytics.operating_reviews (review_id),
  assembly    int  NOT NULL CHECK (assembly >= 1),
  ordinal     int  NOT NULL CHECK (ordinal >= 1),
  tenant_id   uuid NOT NULL,
  domain_id   uuid NOT NULL,
  metric_key  text NOT NULL,
  status      text NOT NULL CHECK (status IN ('cited', 'not_computed')),
  result_id   uuid REFERENCES analytics.metric_results (result_id),
  pinned      boolean NOT NULL DEFAULT false,
  note        text,
  PRIMARY KEY (review_id, assembly, ordinal),
  CONSTRAINT arc_status CHECK ((status = 'cited') = (result_id IS NOT NULL)),
  CONSTRAINT arc_not_computed CHECK (status = 'cited' OR length(btrim(coalesce(note, ''))) >= 8)
);

/* THE NOTES (the discussion). Append-only. */
CREATE TABLE analytics.review_notes (
  note_id             uuid PRIMARY KEY,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  review_id           uuid NOT NULL REFERENCES analytics.operating_reviews (review_id),
  metric_key          text,
  body                text NOT NULL CHECK (length(btrim(body)) BETWEEN 4 AND 4000),
  author_principal_id uuid NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id      uuid NOT NULL,
  CONSTRAINT arn_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX arn_review ON analytics.review_notes (review_id, created_at);

/* THE FOLLOW-THROUGH: the chair's decision per metric (or for the review as a whole): an ACTION named with its owner (a named human — routing
   accountability on this record, never aggregated per person) and its due date, or NO ACTION with its reason. Append-only. */
CREATE TABLE analytics.review_followups (
  followup_id        uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  review_id          uuid NOT NULL REFERENCES analytics.operating_reviews (review_id),
  metric_key         text,
  kind               text NOT NULL CHECK (kind IN ('action', 'no_action')),
  action             text,
  owner_principal_id uuid,
  due_on             date,
  reason             text NOT NULL CHECK (length(btrim(reason)) >= 8),
  item_id            uuid,
  decided_by         uuid NOT NULL,
  decided_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT arf_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT arf_kind CHECK (CASE kind WHEN 'action' THEN length(btrim(coalesce(action, ''))) BETWEEN 8 AND 500 AND owner_principal_id IS NOT NULL AND due_on IS NOT NULL
                                       ELSE action IS NULL AND owner_principal_id IS NULL AND due_on IS NULL AND item_id IS NULL END)
);
CREATE INDEX arf_review ON analytics.review_followups (review_id, decided_at);

/* THE REVIEW'S LEDGER (append-only): every governed act on a review. */
CREATE TABLE analytics.review_events (
  event_id           uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  review_id          uuid NOT NULL REFERENCES analytics.operating_reviews (review_id),
  event              text NOT NULL CHECK (event ~ '^review\.[a-z_]+$'),
  actor_principal_id uuid NOT NULL,
  details            jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT are_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX are_review ON analytics.review_events (review_id, occurred_at);

/* THE GUARD of a review: never deleted; a closed review never changes; the facts never change; the state moves forward only. */
CREATE OR REPLACE FUNCTION analytics.aor_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = analytics, pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'operating review rejected (state): an operating review is never deleted' USING ERRCODE = '22023'; END IF;
  IF OLD.state = 'closed' THEN RAISE EXCEPTION 'operating review rejected (state): review % is closed and immutable', OLD.review_id USING ERRCODE = '22023'; END IF;
  IF (NEW.review_id, NEW.scope, NEW.tenant_id, NEW.domain_id, NEW.title, NEW.period_key, NEW.period_kind, NEW.window_from, NEW.window_to, NEW.scope_id, NEW.scope_key, NEW.scope_version,
      NEW.metric_keys, NEW.chair_principal_id, NEW.participant_roles, NEW.created_by, NEW.created_at)
     IS DISTINCT FROM
     (OLD.review_id, OLD.scope, OLD.tenant_id, OLD.domain_id, OLD.title, OLD.period_key, OLD.period_kind, OLD.window_from, OLD.window_to, OLD.scope_id, OLD.scope_key, OLD.scope_version,
      OLD.metric_keys, OLD.chair_principal_id, OLD.participant_roles, OLD.created_by, OLD.created_at) THEN
    RAISE EXCEPTION 'operating review rejected (state): the facts of review % (title, period, scope, metrics, chair, participants) never change', OLD.review_id USING ERRCODE = '22023';
  END IF;
  IF NOT ((OLD.state = 'draft' AND NEW.state IN ('draft', 'held')) OR (OLD.state = 'held' AND NEW.state IN ('held', 'closed'))) THEN
    RAISE EXCEPTION 'operating review rejected (state): review % moves draft → held → closed, not % → %', OLD.review_id, OLD.state, NEW.state USING ERRCODE = '22023';
  END IF;
  IF OLD.state <> 'draft' AND NEW.assembly <> OLD.assembly THEN
    RAISE EXCEPTION 'operating review rejected (state): review % is %; its citations are frozen', OLD.review_id, OLD.state USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER aor_guard BEFORE UPDATE OR DELETE ON analytics.operating_reviews FOR EACH ROW EXECUTE FUNCTION analytics.aor_guard();

/* A child row (a citation, a note, a follow-through) is admitted only while its review is open for it: citations in a draft; notes in a draft
   or held review; follow-through in a held review. Never on a closed one (defence in depth — the ports refuse first). */
CREATE OR REPLACE FUNCTION analytics.aor_child_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = analytics, pg_catalog, pg_temp AS $$
DECLARE v_state text;
BEGIN
  SELECT r.state INTO v_state FROM analytics.operating_reviews r WHERE r.review_id = NEW.review_id;
  IF v_state = 'closed' OR (TG_TABLE_NAME = 'review_citations' AND v_state <> 'draft') OR (TG_TABLE_NAME = 'review_followups' AND v_state <> 'held') THEN
    RAISE EXCEPTION 'operating review rejected (state): review % is %; % cannot be added', NEW.review_id, v_state, TG_TABLE_NAME USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER arc_child_guard BEFORE INSERT ON analytics.review_citations FOR EACH ROW EXECUTE FUNCTION analytics.aor_child_guard();
CREATE TRIGGER arn_child_guard BEFORE INSERT ON analytics.review_notes FOR EACH ROW EXECUTE FUNCTION analytics.aor_child_guard();
CREATE TRIGGER arf_child_guard BEFORE INSERT ON analytics.review_followups FOR EACH ROW EXECUTE FUNCTION analytics.aor_child_guard();

CREATE TRIGGER arc_append_only BEFORE UPDATE OR DELETE ON analytics.review_citations FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
CREATE TRIGGER arn_append_only BEFORE UPDATE OR DELETE ON analytics.review_notes FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
CREATE TRIGGER arf_append_only BEFORE UPDATE OR DELETE ON analytics.review_followups FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
CREATE TRIGGER are_append_only BEFORE UPDATE OR DELETE ON analytics.review_events FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

-- RLS and grants (the prelude's loop idiom): SELECT to eye_app and eye_commit under domain isolation; no write grant — the definer ports write.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['operating_reviews', 'review_citations', 'review_notes', 'review_followups', 'review_events'] LOOP
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

-- §OR.2 THE HELPERS (internal) ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* The kind of an ACTIVE principal (human, agent, workload, system), or NULL. */
CREATE OR REPLACE FUNCTION analytics.aor_kind(p_principal uuid) RETURNS text
STABLE SECURITY DEFINER SET search_path = identity, pg_catalog, pg_temp AS $$
  SELECT p.kind FROM identity.principals p WHERE p.id = p_principal AND p.status = 'active'
$$ LANGUAGE sql;
REVOKE ALL ON FUNCTION analytics.aor_kind(uuid) FROM PUBLIC;

/* A principal holding one of the roles in the domain (or at the tenant); p_human: and a named, active human of the tenant. */
CREATE OR REPLACE FUNCTION analytics.aor_holds(p_principal uuid, p_tenant uuid, p_domain uuid, p_roles text[], p_human boolean) RETURNS boolean
STABLE SECURITY DEFINER SET search_path = identity, pg_catalog, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM identity.role_bindings b JOIN identity.principals p ON p.id = b.principal_id
                  WHERE b.principal_id = p_principal AND p.status = 'active' AND b.revoked_at IS NULL AND (NOT p_human OR p.kind = 'human')
                    AND b.role_code = ANY (p_roles) AND b.tenant_id = p_tenant
                    AND ((b.scope = 'DOMAIN' AND b.domain_id = p_domain) OR b.scope = 'TENANT'))
$$ LANGUAGE sql;
REVOKE ALL ON FUNCTION analytics.aor_holds(uuid, uuid, uuid, text[], boolean) FROM PUBLIC;

/* The roles a CHAIR holds (D9 / PARTS §OR: an executive, a strategy owner or the product analytics owner). */
CREATE OR REPLACE FUNCTION analytics.aor_chair_roles() RETURNS text[]
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$ SELECT ARRAY['executive', 'strategy_owner', 'product_analytics_owner'] $$;
GRANT EXECUTE ON FUNCTION analytics.aor_chair_roles() TO eye_app, eye_commit;

/* The acting principal is the one recorded. */
CREATE OR REPLACE FUNCTION analytics.aor_assert_actor(p_actor uuid) RETURNS void
LANGUAGE plpgsql SET search_path = analytics, pg_catalog, pg_temp AS $$
BEGIN
  IF p_actor IS NULL OR p_actor IS DISTINCT FROM public.eye_principal() THEN
    RAISE EXCEPTION 'operating review rejected (actor): the act is recorded by the acting principal' USING ERRCODE = '42501';
  END IF;
END $$;
REVOKE ALL ON FUNCTION analytics.aor_assert_actor(uuid) FROM PUBLIC;

/* A NAMED period shifted by n periods of its own kind (quarters or months); NULL for another kind. */
CREATE OR REPLACE FUNCTION analytics.aor_shift_period(p_period text, p_n int) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
DECLARE v int;
BEGIN
  IF p_period ~ '^[0-9]{4}-Q[1-4]$' THEN
    v := substr(p_period, 1, 4)::int * 4 + (substr(p_period, 7, 1)::int - 1) + p_n;
    RETURN format('%s-Q%s', lpad((v / 4)::text, 4, '0'), (v % 4) + 1);
  ELSIF p_period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$' THEN
    v := substr(p_period, 1, 4)::int * 12 + (substr(p_period, 6, 2)::int - 1) + p_n;
    RETURN format('%s-%s', lpad((v / 12)::text, 4, '0'), lpad(((v % 12) + 1)::text, 2, '0'));
  END IF;
  RETURN NULL;
END $$;
GRANT EXECUTE ON FUNCTION analytics.aor_shift_period(text, int) TO eye_app, eye_commit;

/* The review of this domain, locked for the act (unknown → 404). */
CREATE OR REPLACE FUNCTION analytics.aor_review(p_tenant uuid, p_domain uuid, p_review uuid) RETURNS analytics.operating_reviews
LANGUAGE plpgsql SET search_path = analytics, pg_catalog, pg_temp AS $$
DECLARE r analytics.operating_reviews%ROWTYPE;
BEGIN
  SELECT * INTO r FROM analytics.operating_reviews x WHERE x.review_id = p_review AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'operating review rejected (unknown_review): % is not an operating review of this domain', p_review USING ERRCODE = '23503'; END IF;
  RETURN r;
END $$;
REVOKE ALL ON FUNCTION analytics.aor_review(uuid, uuid, uuid) FROM PUBLIC;

/* A closed review refuses every edit (409). */
CREATE OR REPLACE FUNCTION analytics.aor_assert_open(r analytics.operating_reviews, p_what text) RETURNS void
LANGUAGE plpgsql SET search_path = analytics, pg_catalog, pg_temp AS $$
BEGIN
  IF r.state = 'closed' THEN
    RAISE EXCEPTION 'operating review rejected (state): review "%" was closed by its chair at % and is immutable — % is refused', r.title, r.closed_at, p_what USING ERRCODE = '22023';
  END IF;
END $$;
REVOKE ALL ON FUNCTION analytics.aor_assert_open(analytics.operating_reviews, text) FROM PUBLIC;

/* The chair alone (a named human) acts. */
CREATE OR REPLACE FUNCTION analytics.aor_assert_chair(r analytics.operating_reviews, p_actor uuid, p_what text) RETURNS void
LANGUAGE plpgsql SET search_path = analytics, pg_catalog, pg_temp AS $$
BEGIN
  IF analytics.aor_kind(p_actor) IS DISTINCT FROM 'human' THEN
    RAISE EXCEPTION 'operating review rejected (actor): only a named human may %; an agent or a system never does', p_what USING ERRCODE = '42501';
  END IF;
  IF p_actor IS DISTINCT FROM r.chair_principal_id THEN
    RAISE EXCEPTION 'operating review rejected (authority): only the chair of review "%" may %', r.title, p_what USING ERRCODE = '42501';
  END IF;
  IF NOT analytics.aor_holds(p_actor, r.tenant_id, r.domain_id, analytics.aor_chair_roles(), true) THEN
    RAISE EXCEPTION 'operating review rejected (authority): the chair no longer holds an executive, strategy-owner or product-analytics-owner role in this domain' USING ERRCODE = '42501';
  END IF;
END $$;
REVOKE ALL ON FUNCTION analytics.aor_assert_chair(analytics.operating_reviews, uuid, text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION analytics.aor_event(r analytics.operating_reviews, p_event text, p_actor uuid, p_details jsonb, p_correlation uuid) RETURNS void
LANGUAGE sql SET search_path = analytics, pg_catalog, pg_temp AS $$
  INSERT INTO analytics.review_events (event_id, scope, tenant_id, domain_id, review_id, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', r.tenant_id, r.domain_id, r.review_id, p_event, p_actor, coalesce(p_details, '{}'::jsonb), p_correlation)
$$;
REVOKE ALL ON FUNCTION analytics.aor_event(analytics.operating_reviews, text, uuid, jsonb, uuid) FROM PUBLIC;

/* The latest CITABLE result of (metric, period, scope): not a preview, not a replay, the whole population (no cohort). */
CREATE OR REPLACE FUNCTION analytics.aor_latest_result(p_tenant uuid, p_domain uuid, p_metric_key text, p_period text, p_scope_key text) RETURNS analytics.metric_results
LANGUAGE sql STABLE SET search_path = analytics, pg_catalog, pg_temp AS $$
  SELECT x.* FROM analytics.metric_results x
   WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.metric_key = p_metric_key AND x.period_key = p_period
     AND x.scope_key IS NOT DISTINCT FROM p_scope_key AND NOT x.preview AND x.replay_of IS NULL AND x.cohort = '{}'::jsonb
   ORDER BY x.computed_at DESC, x.result_id DESC LIMIT 1
$$;
GRANT EXECUTE ON FUNCTION analytics.aor_latest_result(uuid, uuid, text, text, text) TO eye_app, eye_commit;

/* THE HISTORY ORIGIN of a metric's population (D7 — sparse history explicit): the earliest record instant, in this domain, of the tables the
   metric's REGISTERED computation reads (analytics.computation_registry.reads), each on its first record-time column among recorded_at,
   created_at, raised_at, occurred_at, known_at, committed_at, proposed_at, opened_at, observed_at, and only for a table that carries
   tenant_id and domain_id. The EARLIEST across the tables (conservative: a period is called "no history" only when NO table the computation reads
   holds a record before its end). established = false when no table could be read this way (a period without a result is then "not computed",
   never "no history"). N-01 guarded (SECURITY DEFINER: it reads other schemas' tables, filtered by the bound tenant and domain). */
CREATE OR REPLACE FUNCTION analytics.aor_history_origin(p_tenant uuid, p_domain uuid, p_metric_key text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = analytics, pg_catalog, pg_temp AS $$
DECLARE d analytics.metric_definitions%ROWTYPE; reg analytics.computation_registry%ROWTYPE; t text; v_rel regclass; v_col text; v_min timestamptz; v_best timestamptz;
        v_src text; v_considered jsonb := '[]'::jsonb; v_used int := 0;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the history origin of a product metric');
  SELECT * INTO d FROM analytics.metric_definitions x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.metric_key = p_metric_key
   ORDER BY (x.state = 'approved') DESC, x.version DESC LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('established', false, 'origin', NULL, 'why', format('%s has no definition in this domain', p_metric_key)); END IF;
  IF NOT d.supported THEN RETURN jsonb_build_object('established', false, 'origin', NULL, 'why', format('unsupported: %s', d.unsupported_reason)); END IF;
  SELECT * INTO reg FROM analytics.computation_registry r WHERE r.computation_key = d.computation_key;
  IF NOT FOUND THEN RETURN jsonb_build_object('established', false, 'origin', NULL, 'why', format('the computation %s is not registered', d.computation_key)); END IF;
  FOREACH t IN ARRAY reg.reads LOOP
    v_rel := to_regclass(t); v_col := NULL; v_min := NULL;
    IF v_rel IS NULL OR NOT EXISTS (SELECT 1 FROM pg_class c WHERE c.oid = v_rel AND c.relkind IN ('r', 'v', 'm', 'p')) THEN
      v_considered := v_considered || jsonb_build_array(jsonb_build_object('table', t, 'used', false, 'why', 'not a table or view')); CONTINUE;
    END IF;
    IF (SELECT count(*) FROM pg_attribute a WHERE a.attrelid = v_rel AND a.attname IN ('tenant_id', 'domain_id') AND NOT a.attisdropped) < 2 THEN
      v_considered := v_considered || jsonb_build_array(jsonb_build_object('table', t, 'used', false, 'why', 'no tenant_id / domain_id columns')); CONTINUE;
    END IF;
    SELECT c.n INTO v_col FROM unnest(ARRAY['recorded_at', 'created_at', 'raised_at', 'occurred_at', 'known_at', 'committed_at', 'proposed_at', 'opened_at', 'observed_at']) WITH ORDINALITY c(n, o)
      JOIN pg_attribute a ON a.attrelid = v_rel AND a.attname = c.n AND NOT a.attisdropped AND a.atttypid IN ('timestamptz'::regtype, 'timestamp'::regtype)
     ORDER BY c.o LIMIT 1;
    IF v_col IS NULL THEN
      v_considered := v_considered || jsonb_build_array(jsonb_build_object('table', t, 'used', false, 'why', 'no record-time column')); CONTINUE;
    END IF;
    EXECUTE format('SELECT min(%I)::timestamptz FROM %s WHERE tenant_id = $1 AND domain_id = $2', v_col, v_rel) INTO v_min USING p_tenant, p_domain;
    v_used := v_used + 1;
    v_considered := v_considered || jsonb_build_array(jsonb_build_object('table', t, 'used', true, 'column', v_col, 'first', v_min));
    IF v_min IS NOT NULL AND (v_best IS NULL OR v_min < v_best) THEN v_best := v_min; v_src := t || '.' || v_col; END IF;
  END LOOP;
  RETURN jsonb_build_object('established', v_used > 0, 'origin', v_best, 'source', v_src, 'considered', v_considered, 'computation_key', reg.computation_key,
    'why', CASE WHEN v_used = 0 THEN 'no table the computation reads carries tenant_id, domain_id and a record-time column' WHEN v_best IS NULL THEN 'the deployment holds no record of the population yet' END,
    'rule', 'the earliest record instant, in this domain, over the tables the registered computation reads');
END $$;
REVOKE ALL ON FUNCTION analytics.aor_history_origin(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION analytics.aor_history_origin(uuid, uuid, text) TO eye_app, eye_commit;

/* THE CLOSE DIGEST of a review AS IT STANDS: sha256 over its facts, the cited results' source revisions (the latest assembly), the notes (each
   body digested) and the follow-through. What the chair reads is what the chair signs (the close port recomputes and compares). */
CREATE OR REPLACE FUNCTION analytics.aor_close_body(p_review uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = analytics, pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object(
    'review_id', r.review_id, 'title', r.title, 'period', r.period_key, 'scope_key', r.scope_key, 'scope_version', r.scope_version, 'metric_keys', to_jsonb(r.metric_keys),
    'chair', r.chair_principal_id, 'participant_roles', to_jsonb(r.participant_roles), 'assembly', r.assembly,
    'citations', coalesce((SELECT jsonb_agg(jsonb_build_object('metric_key', c.metric_key, 'status', c.status, 'result_id', c.result_id, 'source_revision', m.source_revision,
                                                               'state', m.state, 'value', m.value, 'n', m.n, 'definition_version', m.definition_version) ORDER BY c.ordinal)
                           FROM analytics.review_citations c LEFT JOIN analytics.metric_results m ON m.result_id = c.result_id
                          WHERE c.review_id = r.review_id AND c.assembly = r.assembly), '[]'::jsonb),
    'notes', coalesce((SELECT jsonb_agg(jsonb_build_object('note_id', n.note_id, 'metric_key', n.metric_key, 'author', n.author_principal_id,
                                                           'body_digest', encode(sha256(convert_to(n.body, 'UTF8')), 'hex')) ORDER BY n.created_at, n.note_id)
                       FROM analytics.review_notes n WHERE n.review_id = r.review_id), '[]'::jsonb),
    'followthrough', coalesce((SELECT jsonb_agg(jsonb_build_object('followup_id', f.followup_id, 'metric_key', f.metric_key, 'kind', f.kind, 'action', f.action,
                                                                   'owner', f.owner_principal_id, 'due_on', f.due_on, 'reason', f.reason) ORDER BY f.decided_at, f.followup_id)
                               FROM analytics.review_followups f WHERE f.review_id = r.review_id), '[]'::jsonb))
  FROM analytics.operating_reviews r WHERE r.review_id = p_review
$$;
GRANT EXECUTE ON FUNCTION analytics.aor_close_body(uuid) TO eye_app, eye_commit;

-- §OR.3 THE PORTS ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* OPEN a review (analytics.review.open): a named human (an analyst, the owner, an executive, a strategy owner) opens it for a NAMED calendar
   period (a quarter or a month), an APPROVED scope (or none: the whole domain), 1–20 metric keys each with an APPROVED definition in the domain,
   a CHAIR (a named, active human holding an executive, strategy-owner or product-analytics-owner role here) and the participants' ROLES (role
   codes — never persons). */
CREATE OR REPLACE FUNCTION analytics.open_operating_review(p_review uuid, p_tenant uuid, p_domain uuid, p_title text, p_period text, p_scope_key text, p_metric_keys text[],
                                                          p_chair uuid, p_participant_roles text[], p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = analytics, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE w record; s analytics.scopes%ROWTYPE; k text; v_bad text[]; r analytics.operating_reviews%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['analytics.review.open']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM analytics.aor_assert_actor(p_actor);
  IF analytics.aor_kind(p_actor) IS DISTINCT FROM 'human' THEN RAISE EXCEPTION 'operating review rejected (actor): a review is opened by a named human' USING ERRCODE = '42501'; END IF;
  IF length(btrim(coalesce(p_title, ''))) NOT BETWEEN 4 AND 200 THEN RAISE EXCEPTION 'operating review rejected (title): a review has a title of 4–200 characters' USING ERRCODE = '22023'; END IF;
  SELECT * INTO w FROM analytics.period_window(p_period);
  IF w.period_kind IS NULL OR w.period_kind NOT IN ('calendar_quarter', 'calendar_month') THEN
    RAISE EXCEPTION 'operating review rejected (period): % is not a named calendar quarter or month (2026-Q3, 2026-09)', coalesce(p_period, '<none>') USING ERRCODE = '22023';
  END IF;
  IF p_scope_key IS NOT NULL THEN
    SELECT * INTO s FROM analytics.scopes x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.scope_key = p_scope_key AND x.state = 'approved';
    IF NOT FOUND THEN RAISE EXCEPTION 'operating review rejected (unknown_scope): % has no approved scope in this domain', p_scope_key USING ERRCODE = '23503'; END IF;
  END IF;
  IF p_metric_keys IS NULL OR cardinality(p_metric_keys) NOT BETWEEN 1 AND 20 OR (SELECT count(DISTINCT x) FROM unnest(p_metric_keys) x) <> cardinality(p_metric_keys) THEN
    RAISE EXCEPTION 'operating review rejected (metrics): a review names 1–20 distinct metric keys' USING ERRCODE = '22023';
  END IF;
  FOREACH k IN ARRAY p_metric_keys LOOP
    IF k IS NULL OR k !~ '^[A-Z][A-Z0-9]{1,9}-[A-Za-z0-9.-]{1,40}$' THEN RAISE EXCEPTION 'operating review rejected (metrics): % is not a metric key (MET-001)', coalesce(k, '<null>') USING ERRCODE = '22023'; END IF;
    IF NOT EXISTS (SELECT 1 FROM analytics.metric_definitions d WHERE d.tenant_id = p_tenant AND d.domain_id = p_domain AND d.metric_key = k) THEN
      RAISE EXCEPTION 'operating review rejected (unknown_metric): % has no definition in this domain', k USING ERRCODE = '23503';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM analytics.metric_definitions d WHERE d.tenant_id = p_tenant AND d.domain_id = p_domain AND d.metric_key = k AND d.state = 'approved') THEN
      RAISE EXCEPTION 'operating review rejected (state): % has no APPROVED definition in this domain (%): an operating review reviews approved metrics', k,
        (SELECT string_agg(format('v%s %s', d.version, d.state), ', ' ORDER BY d.version) FROM analytics.metric_definitions d WHERE d.tenant_id = p_tenant AND d.domain_id = p_domain AND d.metric_key = k) USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF p_chair IS NULL OR NOT analytics.aor_holds(p_chair, p_tenant, p_domain, analytics.aor_chair_roles(), true) THEN
    RAISE EXCEPTION 'operating review rejected (chair): the chair is a named, active human holding an executive, strategy-owner or product-analytics-owner role in this domain' USING ERRCODE = '22023';
  END IF;
  IF p_participant_roles IS NULL OR cardinality(p_participant_roles) NOT BETWEEN 1 AND 20 THEN
    RAISE EXCEPTION 'operating review rejected (participants): a review names 1–20 participant ROLES (role codes — never persons)' USING ERRCODE = '22023';
  END IF;
  SELECT array_agg(x) INTO v_bad FROM unnest(p_participant_roles) x WHERE NOT EXISTS (SELECT 1 FROM identity.roles ro WHERE ro.code = x);
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION 'operating review rejected (participants): % are not roles — participants are named by role, never by person', v_bad USING ERRCODE = '22023'; END IF;
  INSERT INTO analytics.operating_reviews (review_id, scope, tenant_id, domain_id, title, period_key, period_kind, window_from, window_to, scope_id, scope_key, scope_version,
                                           metric_keys, chair_principal_id, participant_roles, created_by, correlation_id)
  VALUES (p_review, 'DOMAIN', p_tenant, p_domain, btrim(p_title), p_period, w.period_kind, w.window_from, w.window_to, s.scope_id, s.scope_key, s.version,
          p_metric_keys, p_chair, (SELECT array_agg(DISTINCT x ORDER BY x) FROM unnest(p_participant_roles) x), p_actor, p_correlation)
  RETURNING * INTO r;
  PERFORM analytics.aor_event(r, 'review.opened', p_actor, jsonb_build_object('period', p_period, 'scope_key', s.scope_key, 'scope_version', s.version, 'metric_keys', to_jsonb(p_metric_keys),
                                                                             'chair', p_chair, 'participant_roles', to_jsonb(r.participant_roles)), p_correlation);
  RETURN to_jsonb(r);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION analytics.open_operating_review(uuid,uuid,uuid,text,text,text,text[],uuid,text[],uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION analytics.open_operating_review(uuid,uuid,uuid,text,text,text,text[],uuid,text[],uuid,uuid) TO eye_commit;

/* ASSEMBLE a draft (analytics.review.assemble): computes NOTHING. Per reviewed metric, in order: the PIN (p_pins {metric_key: result_id}) or
   the latest citable result of (metric, the review's period, the review's scope) — CITED, with an analytics.metric_uses row (used_in_kind
   'operating_review', once per result and review); none → NOT COMPUTED with its reason (a preview that exists is said, never cited). A pinned
   result must be this domain's, of the metric, the period and the scope, the whole population, not a replay — and NEVER A PREVIEW (a result
   computed on a proposed definition for its review is never served as current). Each assembly is a new round; a held or closed review is frozen. */
CREATE OR REPLACE FUNCTION analytics.assemble_operating_review(p_review uuid, p_tenant uuid, p_domain uuid, p_pins jsonb, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = analytics, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r analytics.operating_reviews%ROWTYPE; k text; o bigint; m analytics.metric_results%ROWTYPE; v_pin text; v_round int; v_note text; v_cited int := 0; v_missing jsonb := '[]'::jsonb;
        v_previews int;
BEGIN
  PERFORM observation.assert_authority(ARRAY['analytics.review.assemble']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM analytics.aor_assert_actor(p_actor);
  r := analytics.aor_review(p_tenant, p_domain, p_review);
  IF NOT (analytics.aor_holds(p_actor, p_tenant, p_domain, ARRAY['product_analyst', 'product_analytics_owner'] || analytics.aor_chair_roles(), false) OR p_actor = r.chair_principal_id) THEN
    RAISE EXCEPTION 'operating review rejected (authority): a review is assembled by a product analyst, the product analytics owner or a chair role of this domain' USING ERRCODE = '42501';
  END IF;
  PERFORM analytics.aor_assert_open(r, 'assembling it');
  IF r.state <> 'draft' THEN RAISE EXCEPTION 'operating review rejected (state): review "%" is held; its citations are frozen (assemble a draft)', r.title USING ERRCODE = '22023'; END IF;
  IF p_pins IS NOT NULL AND jsonb_typeof(p_pins) <> 'object' THEN RAISE EXCEPTION 'operating review rejected (request): pins are {metric_key: result_id}' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_object_keys(coalesce(p_pins, '{}'::jsonb)) x WHERE NOT (x = ANY (r.metric_keys))) THEN
    RAISE EXCEPTION 'operating review rejected (unknown_metric): a pin names a metric the review does not review (%)', (SELECT string_agg(x, ', ') FROM jsonb_object_keys(p_pins) x WHERE NOT (x = ANY (r.metric_keys))) USING ERRCODE = '23503';
  END IF;
  v_round := r.assembly + 1;
  FOR k, o IN SELECT u.k, u.o FROM unnest(r.metric_keys) WITH ORDINALITY u(k, o) LOOP
    m := NULL; v_note := NULL;
    v_pin := p_pins ->> k;
    IF v_pin IS NOT NULL THEN
      IF v_pin !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RAISE EXCEPTION 'operating review rejected (request): the pin of % is a result id', k USING ERRCODE = '22023'; END IF;
      SELECT * INTO m FROM analytics.metric_results x WHERE x.result_id = v_pin::uuid AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
      IF NOT FOUND THEN RAISE EXCEPTION 'operating review rejected (unknown_result): % is not a result of this domain', v_pin USING ERRCODE = '23503'; END IF;
      IF m.preview THEN
        RAISE EXCEPTION 'operating review rejected (preview): result % of % is a PREVIEW computed on a proposed definition (v%) for its review — it is never cited as current', v_pin, k, m.definition_version USING ERRCODE = '22023';
      END IF;
      IF m.replay_of IS NOT NULL THEN RAISE EXCEPTION 'operating review rejected (replay): result % is a replay of %; cite the original', v_pin, m.replay_of USING ERRCODE = '22023'; END IF;
      IF m.metric_key <> k OR m.period_key <> r.period_key OR m.scope_key IS DISTINCT FROM r.scope_key OR m.cohort <> '{}'::jsonb THEN
        RAISE EXCEPTION 'operating review rejected (mismatch): result % is % for % (scope %, cohort %) — the review cites % for % (scope %, the whole population)', v_pin, m.metric_key, m.period_key,
          coalesce(m.scope_key, 'the domain'), m.cohort, k, r.period_key, coalesce(r.scope_key, 'the domain') USING ERRCODE = '22023';
      END IF;
    ELSE
      m := analytics.aor_latest_result(p_tenant, p_domain, k, r.period_key, r.scope_key);
    END IF;
    IF m.result_id IS NULL THEN
      SELECT count(*) INTO v_previews FROM analytics.metric_results x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.metric_key = k AND x.period_key = r.period_key
         AND x.scope_key IS NOT DISTINCT FROM r.scope_key AND x.preview;
      v_note := format('not computed: no result of %s for %s (%s) has been computed yet%s', k, r.period_key, coalesce('scope ' || r.scope_key, 'the whole domain'),
                       CASE WHEN v_previews > 0 THEN format(' — %s preview result(s) on a proposed definition exist and are never cited as current', v_previews) ELSE '' END);
      INSERT INTO analytics.review_citations (review_id, assembly, ordinal, tenant_id, domain_id, metric_key, status, result_id, pinned, note)
      VALUES (r.review_id, v_round, o, p_tenant, p_domain, k, 'not_computed', NULL, false, v_note);
      v_missing := v_missing || to_jsonb(k);
    ELSE
      INSERT INTO analytics.review_citations (review_id, assembly, ordinal, tenant_id, domain_id, metric_key, status, result_id, pinned, note)
      VALUES (r.review_id, v_round, o, p_tenant, p_domain, k, 'cited', m.result_id, v_pin IS NOT NULL, NULL);
      INSERT INTO analytics.metric_uses (use_id, scope, tenant_id, domain_id, result_id, used_in_kind, used_in_id, note, used_by, correlation_id)
      VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, m.result_id, 'operating_review', r.review_id, format('cited by the operating review "%s" (%s, assembly %s)', r.title, r.period_key, v_round), p_actor, p_correlation)
      ON CONFLICT (result_id, used_in_kind, used_in_id) DO NOTHING;
      v_cited := v_cited + 1;
    END IF;
  END LOOP;
  UPDATE analytics.operating_reviews SET assembly = v_round, assembled_at = clock_timestamp(), assembled_by = p_actor WHERE review_id = r.review_id RETURNING * INTO r;
  PERFORM analytics.aor_event(r, 'review.assembled', p_actor, jsonb_build_object('assembly', v_round, 'cited', v_cited, 'not_computed', v_missing, 'pins', coalesce(p_pins, '{}'::jsonb)), p_correlation);
  RETURN to_jsonb(r) || jsonb_build_object('cited', v_cited, 'not_computed', v_missing,
    'citations', (SELECT jsonb_agg(to_jsonb(c) - 'tenant_id' - 'domain_id' ORDER BY c.ordinal) FROM analytics.review_citations c WHERE c.review_id = r.review_id AND c.assembly = v_round));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION analytics.assemble_operating_review(uuid,uuid,uuid,jsonb,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION analytics.assemble_operating_review(uuid,uuid,uuid,jsonb,uuid,uuid) TO eye_commit;

/* HOLD (analytics.review.hold, human-gated): the chair holds an ASSEMBLED draft — the meeting takes place over a fixed set of citations. */
CREATE OR REPLACE FUNCTION analytics.hold_operating_review(p_review uuid, p_tenant uuid, p_domain uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = analytics, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r analytics.operating_reviews%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['analytics.review.hold']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM analytics.aor_assert_actor(p_actor);
  r := analytics.aor_review(p_tenant, p_domain, p_review);
  PERFORM analytics.aor_assert_chair(r, p_actor, 'hold the review');
  PERFORM analytics.aor_assert_open(r, 'holding it');
  IF r.state <> 'draft' THEN RAISE EXCEPTION 'operating review rejected (state): review "%" is already held', r.title USING ERRCODE = '22023'; END IF;
  IF r.assembly = 0 THEN RAISE EXCEPTION 'operating review rejected (state): review "%" has not been assembled — its results are cited before it is held', r.title USING ERRCODE = '22023'; END IF;
  UPDATE analytics.operating_reviews SET state = 'held', held_at = clock_timestamp(), held_by = p_actor WHERE review_id = r.review_id RETURNING * INTO r;
  PERFORM analytics.aor_event(r, 'review.held', p_actor, jsonb_build_object('assembly', r.assembly), p_correlation);
  RETURN to_jsonb(r);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION analytics.hold_operating_review(uuid,uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION analytics.hold_operating_review(uuid,uuid,uuid,uuid,uuid) TO eye_commit;

/* NOTE (analytics.review.note): a discussion note on the review (or one of its metrics) by a named human — the chair or a holder of one of the
   review's participant roles. A draft or held review; never a closed one. */
CREATE OR REPLACE FUNCTION analytics.note_operating_review(p_note uuid, p_review uuid, p_tenant uuid, p_domain uuid, p_metric_key text, p_body text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = analytics, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r analytics.operating_reviews%ROWTYPE; n analytics.review_notes%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['analytics.review.note']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM analytics.aor_assert_actor(p_actor);
  r := analytics.aor_review(p_tenant, p_domain, p_review);
  IF analytics.aor_kind(p_actor) IS DISTINCT FROM 'human' THEN RAISE EXCEPTION 'operating review rejected (actor): a review note is a named human''s' USING ERRCODE = '42501'; END IF;
  IF NOT (p_actor = r.chair_principal_id OR analytics.aor_holds(p_actor, p_tenant, p_domain, r.participant_roles, true)) THEN
    RAISE EXCEPTION 'operating review rejected (authority): notes on review "%" are the chair''s and the participants'' (roles %)', r.title, array_to_string(r.participant_roles, ', ') USING ERRCODE = '42501';
  END IF;
  PERFORM analytics.aor_assert_open(r, 'a note');
  IF p_metric_key IS NOT NULL AND NOT (p_metric_key = ANY (r.metric_keys)) THEN
    RAISE EXCEPTION 'operating review rejected (unknown_metric): review "%" does not review %', r.title, p_metric_key USING ERRCODE = '23503';
  END IF;
  IF length(btrim(coalesce(p_body, ''))) NOT BETWEEN 4 AND 4000 THEN RAISE EXCEPTION 'operating review rejected (note): a note has 4–4000 characters' USING ERRCODE = '22023'; END IF;
  INSERT INTO analytics.review_notes (note_id, scope, tenant_id, domain_id, review_id, metric_key, body, author_principal_id, correlation_id)
  VALUES (p_note, 'DOMAIN', p_tenant, p_domain, r.review_id, p_metric_key, btrim(p_body), p_actor, p_correlation) RETURNING * INTO n;
  PERFORM analytics.aor_event(r, 'review.noted', p_actor, jsonb_build_object('note_id', p_note, 'metric_key', p_metric_key), p_correlation);
  RETURN to_jsonb(n);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION analytics.note_operating_review(uuid,uuid,uuid,uuid,text,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION analytics.note_operating_review(uuid,uuid,uuid,uuid,text,text,uuid,uuid) TO eye_commit;

/* DECIDE the follow-through (analytics.review.decide, human-gated): the CHAIR alone, on a HELD review, per metric (or for the review as a whole):
   an ACTION — its text, a named owner (an active human of the tenant: accountability for routing on this record, never an aggregate per
   person), a due date not in the past — routed as an `analytics.metric` attention item to that owner under the domain's published policy; or
   NO ACTION with its reason. Never automatic, never punitive (App M Action control). */
CREATE OR REPLACE FUNCTION analytics.decide_operating_review(p_followup uuid, p_review uuid, p_tenant uuid, p_domain uuid, p_metric_key text, p_kind text, p_action text, p_owner uuid,
                                                            p_due date, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = analytics, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r analytics.operating_reviews%ROWTYPE; f analytics.review_followups%ROWTYPE; v_item jsonb := NULL;
BEGIN
  PERFORM observation.assert_authority(ARRAY['analytics.review.decide']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM analytics.aor_assert_actor(p_actor);
  r := analytics.aor_review(p_tenant, p_domain, p_review);
  PERFORM analytics.aor_assert_chair(r, p_actor, 'decide the follow-through');
  PERFORM analytics.aor_assert_open(r, 'a follow-through decision');
  IF r.state <> 'held' THEN RAISE EXCEPTION 'operating review rejected (state): review "%" is a draft; the follow-through is decided once it is held', r.title USING ERRCODE = '22023'; END IF;
  IF p_metric_key IS NOT NULL AND NOT (p_metric_key = ANY (r.metric_keys)) THEN
    RAISE EXCEPTION 'operating review rejected (unknown_metric): review "%" does not review %', r.title, p_metric_key USING ERRCODE = '23503';
  END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('action', 'no_action') THEN RAISE EXCEPTION 'operating review rejected (kind): the follow-through is an action or no_action' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'operating review rejected (reason): a follow-through states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  IF p_kind = 'action' THEN
    IF length(btrim(coalesce(p_action, ''))) NOT BETWEEN 8 AND 500 THEN RAISE EXCEPTION 'operating review rejected (action): an action is named in 8–500 characters' USING ERRCODE = '22023'; END IF;
    IF p_owner IS NULL OR NOT decision.is_active_human(p_owner, p_tenant) THEN
      RAISE EXCEPTION 'operating review rejected (owner): an action has a named owner — an active human of the tenant' USING ERRCODE = '22023';
    END IF;
    IF p_due IS NULL OR p_due < (clock_timestamp() AT TIME ZONE 'UTC')::date THEN
      RAISE EXCEPTION 'operating review rejected (due): an action has a due date, today or later (%)', coalesce(p_due::text, '<none>') USING ERRCODE = '22023';
    END IF;
  ELSIF p_action IS NOT NULL OR p_owner IS NOT NULL OR p_due IS NOT NULL THEN
    RAISE EXCEPTION 'operating review rejected (kind): "no action" names no action, owner or due date — its reason says why' USING ERRCODE = '22023';
  END IF;
  IF p_kind = 'action' THEN   -- the item first (its subject is the follow-through's id), so the append-only row records it
    v_item := executive.b33_raise_routed(p_tenant, p_domain, 'analytics.metric', 'operating_review', p_followup,
                format('Follow-through of the operating review "%s"%s: %s (due %s)', r.title, coalesce(' — ' || p_metric_key, ''), btrim(p_action), p_due),
                jsonb_build_array(format('decided by the chair of the %s review: %s', r.period_key, btrim(p_reason)),
                                  'a review workflow decided by a named human — never an automatic or punitive decision'),
                p_owner, p_followup, 'analytics.review.followthrough_decided',
                jsonb_build_object('review_id', r.review_id, 'metric_key', p_metric_key, 'due_on', p_due, 'period', r.period_key), NULL, p_actor, p_correlation);
  END IF;
  INSERT INTO analytics.review_followups (followup_id, scope, tenant_id, domain_id, review_id, metric_key, kind, action, owner_principal_id, due_on, reason, item_id, decided_by, correlation_id)
  VALUES (p_followup, 'DOMAIN', p_tenant, p_domain, r.review_id, p_metric_key, p_kind, CASE WHEN p_kind = 'action' THEN btrim(p_action) END, p_owner, p_due, btrim(p_reason),
          (v_item ->> 'item_id')::uuid, p_actor, p_correlation);
  SELECT * INTO f FROM analytics.review_followups x WHERE x.followup_id = p_followup;
  PERFORM analytics.aor_event(r, 'review.followthrough_decided', p_actor, jsonb_build_object('followup_id', p_followup, 'metric_key', p_metric_key, 'kind', p_kind, 'owner', p_owner,
                                                                                            'due_on', p_due, 'item', v_item), p_correlation);
  RETURN to_jsonb(f) || jsonb_build_object('item', v_item);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION analytics.decide_operating_review(uuid,uuid,uuid,uuid,text,text,text,uuid,date,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION analytics.decide_operating_review(uuid,uuid,uuid,uuid,text,text,text,uuid,date,text,uuid,uuid) TO eye_commit;

/* CLOSE (analytics.review.close, human-gated): THE CHAIR'S SIGNED CLOSE. The chair alone, on a HELD review whose every metric has a
   follow-through decision (an action or "no action" — nothing passes silently), signs the digest it READ (analytics.aor_close_body: the cited
   results' source revisions, the notes, the follow-through); a digest that no longer matches the review is STALE (409). The review is then
   immutable; its open `analytics.metric` items of subject the review are closed (the follow-through items stay with their owners). */
CREATE OR REPLACE FUNCTION analytics.close_operating_review(p_review uuid, p_tenant uuid, p_domain uuid, p_digest text, p_statement text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = analytics, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r analytics.operating_reviews%ROWTYPE; v_body jsonb; v_digest text; v_open text[]; v_closed jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['analytics.review.close']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM analytics.aor_assert_actor(p_actor);
  r := analytics.aor_review(p_tenant, p_domain, p_review);
  PERFORM analytics.aor_assert_chair(r, p_actor, 'close the review');
  PERFORM analytics.aor_assert_open(r, 'closing it again');
  IF r.state <> 'held' THEN RAISE EXCEPTION 'operating review rejected (state): review "%" is a draft; it is held, discussed and decided before the chair closes it', r.title USING ERRCODE = '22023'; END IF;
  SELECT array_agg(k ORDER BY o) INTO v_open FROM unnest(r.metric_keys) WITH ORDINALITY u(k, o)
   WHERE NOT EXISTS (SELECT 1 FROM analytics.review_followups f WHERE f.review_id = r.review_id AND f.metric_key = u.k);
  IF v_open IS NOT NULL THEN
    RAISE EXCEPTION 'operating review rejected (followthrough): % have no follow-through decision yet — an action with its owner and due date, or "no action" with its reason', array_to_string(v_open, ', ') USING ERRCODE = '22023';
  END IF;
  IF length(btrim(coalesce(p_statement, ''))) < 8 THEN RAISE EXCEPTION 'operating review rejected (statement): the close carries the chair''s statement (8+ characters)' USING ERRCODE = '22023'; END IF;
  v_body := analytics.aor_close_body(r.review_id);
  v_digest := analytics.digest(v_body);
  IF p_digest IS DISTINCT FROM v_digest THEN
    RAISE EXCEPTION 'operating review rejected (stale): the review now digests to %…, not the one read and signed (%…) — read it again', left(v_digest, 12), left(coalesce(p_digest, '<none>'), 12) USING ERRCODE = '22023';
  END IF;
  UPDATE analytics.operating_reviews SET state = 'closed', close_digest = v_digest, close_statement = btrim(p_statement), closed_by = p_actor, closed_at = clock_timestamp()
   WHERE review_id = r.review_id RETURNING * INTO r;
  v_closed := executive.b33_close_items(p_tenant, p_domain, 'analytics.metric', 'operating_review', r.review_id, format('the operating review "%s" was closed by its chair', r.title), p_actor, p_correlation);
  PERFORM analytics.aor_event(r, 'review.closed', p_actor, jsonb_build_object('digest', v_digest, 'statement', btrim(p_statement), 'items_closed', v_closed), p_correlation);
  RETURN to_jsonb(r) || jsonb_build_object('signed_body', v_body);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION analytics.close_operating_review(uuid,uuid,uuid,text,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION analytics.close_operating_review(uuid,uuid,uuid,text,text,uuid,uuid) TO eye_commit;

-- §OR.4 THE READS (INVOKER, under the caller's RLS; analytics.read) ────────────────────────────────────────────────────────────────────────
/* THE SERIES of a metric for a scope: the p_count periods (1–12, of p_through's kind) ending with p_through (default: the last complete quarter
   by the database's clock) — EVERY period listed, oldest first:
     computed     — the latest citable result (its state: determinate with value and interval, or indeterminate / unsupported with its reasons —
                    never 0), with its drill-down;
     not_computed — no result yet (a preview on a proposed definition is said, never shown as the value);
     no_history   — no result and the period ends before the deployment's first record of the metric's population: INDETERMINATE, "no history
                    (the deployment holds no records before <date>)" — sparse history explicit, never a blank or a zero.
   The definition versions behind the computed periods are listed: periods computed on different versions are NOT comparable (said). */
CREATE OR REPLACE FUNCTION analytics.review_series(p_tenant uuid, p_domain uuid, p_metric_key text, p_scope_key text, p_through text, p_count int) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = analytics, pg_catalog, pg_temp AS $$
DECLARE v_through text := p_through; v_count int := coalesce(p_count, 4); v_now timestamptz := clock_timestamp(); v_origin jsonb; v_o timestamptz; v_est boolean;
        i int; v_p text; w record; m analytics.metric_results%ROWTYPE; v_prev int; v_periods jsonb := '[]'::jsonb; v_versions int[] := '{}';
BEGIN
  IF v_through IS NULL THEN
    v_through := analytics.aor_shift_period(format('%s-Q%s', extract(year FROM v_now AT TIME ZONE 'UTC')::int, ((extract(month FROM v_now AT TIME ZONE 'UTC')::int - 1) / 3) + 1), -1);
  END IF;
  IF analytics.aor_shift_period(v_through, 0) IS NULL THEN
    RAISE EXCEPTION 'operating review rejected (period): the series runs through a named calendar quarter or month (2026-Q3, 2026-09), not %', v_through USING ERRCODE = '22023';
  END IF;
  IF v_count NOT BETWEEN 1 AND 12 THEN RAISE EXCEPTION 'operating review rejected (request): a series has 1–12 periods' USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM analytics.metric_definitions d WHERE d.tenant_id = p_tenant AND d.domain_id = p_domain AND d.metric_key = p_metric_key) THEN
    RAISE EXCEPTION 'operating review rejected (unknown_metric): % has no definition in this domain', p_metric_key USING ERRCODE = '23503';
  END IF;
  v_origin := analytics.aor_history_origin(p_tenant, p_domain, p_metric_key);
  v_est := coalesce((v_origin ->> 'established')::boolean, false); v_o := (v_origin ->> 'origin')::timestamptz;
  FOR i IN REVERSE (v_count - 1)..0 LOOP
    v_p := analytics.aor_shift_period(v_through, -i);
    SELECT * INTO w FROM analytics.period_window(v_p);
    m := analytics.aor_latest_result(p_tenant, p_domain, p_metric_key, v_p, p_scope_key);
    IF m.result_id IS NOT NULL THEN
      v_versions := v_versions || m.definition_version;
      v_periods := v_periods || jsonb_build_array(jsonb_build_object('period', v_p, 'window_from', w.window_from, 'window_to', w.window_to, 'status', 'computed',
        'result_id', m.result_id, 'state', m.state, 'value', m.value, 'unit', m.unit, 'kind', m.kind, 'n', m.n, 'numerator', m.numerator, 'denominator', m.denominator,
        'uncertainty', m.uncertainty, 'distribution', m.distribution, 'reasons', m.reasons, 'threshold_eval', m.threshold_eval, 'definition_version', m.definition_version,
        'clock', m.clock, 'as_of', m.as_of, 'computed_at', m.computed_at, 'records_count', m.records_count,
        'before_history', v_est AND (v_o IS NULL OR w.window_to <= v_o),
        'drilldown', jsonb_build_object('result_id', m.result_id, 'route', format('results/%s/read', m.result_id))));
    ELSIF v_est AND (v_o IS NULL OR w.window_to <= v_o) THEN
      v_periods := v_periods || jsonb_build_array(jsonb_build_object('period', v_p, 'window_from', w.window_from, 'window_to', w.window_to, 'status', 'no_history',
        'state', 'indeterminate', 'value', NULL, 'n', NULL,
        'reasons', jsonb_build_array(CASE WHEN v_o IS NULL THEN 'no history: the deployment holds no records of this metric''s population yet'
                                          ELSE format('no history: the deployment holds no records before %s (%s)', to_char(v_o AT TIME ZONE 'UTC', 'YYYY-MM-DD'), v_origin ->> 'source') END)));
    ELSE
      SELECT count(*) INTO v_prev FROM analytics.metric_results x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.metric_key = p_metric_key AND x.period_key = v_p
         AND x.scope_key IS NOT DISTINCT FROM p_scope_key AND x.preview;
      v_periods := v_periods || jsonb_build_array(jsonb_build_object('period', v_p, 'window_from', w.window_from, 'window_to', w.window_to, 'status', 'not_computed',
        'state', NULL, 'value', NULL, 'n', NULL, 'previews', v_prev,
        'reasons', jsonb_build_array(format('not computed: no result of %s for %s has been computed yet%s%s', p_metric_key, v_p,
                                            CASE WHEN v_prev > 0 THEN format(' (%s preview(s) on a proposed definition, never shown as the value)', v_prev) ELSE '' END,
                                            CASE WHEN NOT v_est THEN format(' — the history origin could not be established (%s)', v_origin ->> 'why') ELSE '' END))));
    END IF;
  END LOOP;
  RETURN jsonb_build_object('metric_key', p_metric_key, 'scope_key', p_scope_key, 'through', v_through, 'count', v_count, 'history', v_origin,
    'definition_versions', (SELECT coalesce(jsonb_agg(DISTINCT x), '[]'::jsonb) FROM unnest(v_versions) x),
    'comparable', (SELECT count(DISTINCT x) FROM unnest(v_versions) x) <= 1,
    'comparability_note', CASE WHEN (SELECT count(DISTINCT x) FROM unnest(v_versions) x) > 1
                               THEN 'the computed periods rest on different definition versions: they are not comparable as one series' END,
    'periods', v_periods);
END $$;
GRANT EXECUTE ON FUNCTION analytics.review_series(uuid, uuid, text, text, text, int) TO eye_app, eye_commit;

/* THE REVIEW READ: the review, its chair (named on the record for accountability), per metric — the definition the cited result names (or the
   approved one), the citation (cited / not computed with its reason), the result (value or the explained state, n, interval, window, clock,
   scope, threshold evaluation, records by role) with its DRILL-DOWN (results/:id/read), the series (4 periods through the review's period) —
   the notes, the follow-through (with its attention item's state now), the ledger, and the signature: the close digest, verified by
   recomputing it, and the digest a close would sign NOW (what the chair reads is what the chair signs). */
CREATE OR REPLACE FUNCTION analytics.operating_review_read(p_review uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = analytics, pg_catalog, pg_temp AS $$
  SELECT to_jsonb(r) - 'tenant_id' - 'domain_id' || jsonb_build_object(
    'chair_name', (SELECT p.display_name FROM identity.principals p WHERE p.id = r.chair_principal_id),
    'scope_row', (SELECT to_jsonb(s) - 'tenant_id' - 'domain_id' FROM analytics.scopes s WHERE s.scope_id = r.scope_id),
    'metrics', (SELECT coalesce(jsonb_agg(z.v ORDER BY z.o), '[]'::jsonb) FROM (
      SELECT u.o, jsonb_build_object(
        'metric_key', u.k, 'ordinal', u.o,
        'citation', (SELECT to_jsonb(c) - 'tenant_id' - 'domain_id' FROM analytics.review_citations c WHERE c.review_id = r.review_id AND c.assembly = r.assembly AND c.metric_key = u.k),
        'definition', (SELECT to_jsonb(d) - 'tenant_id' - 'domain_id' || jsonb_build_object('owner_name', (SELECT p.display_name FROM identity.principals p WHERE p.id = d.owner_principal_id))
                         FROM analytics.metric_definitions d
                        WHERE d.tenant_id = r.tenant_id AND d.domain_id = r.domain_id AND d.metric_key = u.k
                        ORDER BY (d.definition_id = (SELECT m.definition_id FROM analytics.review_citations c JOIN analytics.metric_results m ON m.result_id = c.result_id
                                                     WHERE c.review_id = r.review_id AND c.assembly = r.assembly AND c.metric_key = u.k)) DESC NULLS LAST,
                                 (d.state = 'approved') DESC, d.version DESC LIMIT 1),
        'definition_current_version', (SELECT d.version FROM analytics.metric_definitions d WHERE d.tenant_id = r.tenant_id AND d.domain_id = r.domain_id AND d.metric_key = u.k AND d.state = 'approved'),
        'result', (SELECT to_jsonb(m) - 'tenant_id' - 'domain_id' || jsonb_build_object(
                            'records_by_role', coalesce((SELECT jsonb_object_agg(q.role, q.c) FROM (SELECT rr.role, count(*) c FROM analytics.result_records rr WHERE rr.result_id = m.result_id GROUP BY rr.role) q), '{}'::jsonb),
                            'drilldown', jsonb_build_object('result_id', m.result_id, 'route', format('results/%s/read', m.result_id)))
                     FROM analytics.review_citations c JOIN analytics.metric_results m ON m.result_id = c.result_id
                    WHERE c.review_id = r.review_id AND c.assembly = r.assembly AND c.metric_key = u.k),
        'series', analytics.review_series(r.tenant_id, r.domain_id, u.k, r.scope_key, r.period_key, 4)) AS v
      FROM unnest(r.metric_keys) WITH ORDINALITY u(k, o)) z),
    'notes', coalesce((SELECT jsonb_agg(to_jsonb(n) - 'tenant_id' - 'domain_id' || jsonb_build_object('author_name', (SELECT p.display_name FROM identity.principals p WHERE p.id = n.author_principal_id))
                                        ORDER BY n.created_at, n.note_id) FROM analytics.review_notes n WHERE n.review_id = r.review_id), '[]'::jsonb),
    'followthrough', coalesce((SELECT jsonb_agg(to_jsonb(f) - 'tenant_id' - 'domain_id' || jsonb_build_object(
                                 'owner_name', (SELECT p.display_name FROM identity.principals p WHERE p.id = f.owner_principal_id),
                                 'item', (SELECT jsonb_build_object('item_id', i.item_id, 'state', i.state, 'route_roles', to_jsonb(i.route_roles), 'due_at', i.due_at)
                                            FROM executive.attention_items i WHERE i.tenant_id = r.tenant_id AND i.domain_id = r.domain_id AND i.subject_id = f.followup_id
                                             AND i.signal_class = 'analytics.metric' ORDER BY i.created_at DESC LIMIT 1))
                                 ORDER BY f.decided_at, f.followup_id) FROM analytics.review_followups f WHERE f.review_id = r.review_id), '[]'::jsonb),
    'events', coalesce((SELECT jsonb_agg(jsonb_build_object('event', e.event, 'occurred_at', e.occurred_at, 'actor_principal_id', e.actor_principal_id, 'details', e.details) ORDER BY e.occurred_at, e.event_id)
                        FROM analytics.review_events e WHERE e.review_id = r.review_id), '[]'::jsonb),
    'uses', (SELECT count(*) FROM analytics.metric_uses u WHERE u.used_in_kind = 'operating_review' AND u.used_in_id = r.review_id),
    'digest_now', analytics.digest(analytics.aor_close_body(r.review_id)),
    'signature', CASE WHEN r.state = 'closed' THEN jsonb_build_object('digest', r.close_digest, 'statement', r.close_statement, 'closed_by', r.closed_by, 'closed_at', r.closed_at,
                                                                      'closed_by_name', (SELECT p.display_name FROM identity.principals p WHERE p.id = r.closed_by),
                                                                      'verified', analytics.digest(analytics.aor_close_body(r.review_id)) = r.close_digest,
                                                                      'kind', 'digest-bound close by the named chair (not an Ed25519 signature)') END)
  FROM analytics.operating_reviews r WHERE r.review_id = p_review
$$;
GRANT EXECUTE ON FUNCTION analytics.operating_review_read(uuid) TO eye_app, eye_commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §I — THE INTEGRATOR'S SECTION (folded last): PR-70-002's EXCEPTION and App M's Audit control "manual adjustments, exceptions, approvals and
-- uses remain replayable" — the two ledgers no part was assigned.
--   * analytics.metric_exceptions — an EXCEPTION to a definition's application for one (metric, period, scope, cohort): a threshold exemption
--     (the breach review is not raised — said on the result's routing), with its reason, proposed by an analyst or the owner and APPROVED by a named
--     product analytics owner (never the proposer), expiring within 366 days, revocable. It never changes a result.
--   * analytics.result_adjustments — a MANUAL ADJUSTMENT proposed beside a result (the adjusted value, the reason, the evidence), approved by a
--     named product analytics owner (never the proposer). The result itself is append-only and never changes: the adjustment is shown BESIDE it,
--     labelled, and a review or a use cites the result — the adjustment is readable and replayable, never silently substituted.
-- Both: digest-bound decisions, an append-only ledger in analytics.definition_events, refusals in the `metric definition` / `metric computation`
-- nouns (rows central, B92 §0).
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

CREATE TABLE analytics.metric_exceptions (
  exception_id    uuid PRIMARY KEY,
  scope           text NOT NULL,
  tenant_id       uuid NOT NULL,
  domain_id       uuid NOT NULL,
  metric_key      text NOT NULL,
  kind            text NOT NULL CHECK (kind IN ('threshold_exemption')),
  period_key      text NOT NULL,
  scope_key       text,
  cohort          jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(cohort) = 'object'),
  reason          text NOT NULL CHECK (length(btrim(reason)) BETWEEN 8 AND 2000),
  expires_at      timestamptz NOT NULL,
  state           text NOT NULL DEFAULT 'proposed' CHECK (state IN ('proposed', 'approved', 'rejected', 'revoked')),
  digest          text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  proposed_by     uuid NOT NULL,
  proposed_at     timestamptz NOT NULL DEFAULT clock_timestamp(),
  decided_by      uuid,
  decided_at      timestamptz,
  decision_reason text,
  revoked_by      uuid,
  revoked_at      timestamptz,
  correlation_id  uuid NOT NULL,
  CONSTRAINT ame_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT ame_no_person_cohort CHECK (NOT (analytics.json_keys(cohort) && analytics.person_dimensions())),
  CONSTRAINT ame_sod CHECK (decided_by IS NULL OR decided_by <> proposed_by),
  CONSTRAINT ame_decided CHECK (state = 'proposed' OR (decided_by IS NOT NULL AND decided_at IS NOT NULL)),
  CONSTRAINT ame_revoked CHECK ((state = 'revoked') = (revoked_at IS NOT NULL))
);
CREATE INDEX ame_lookup ON analytics.metric_exceptions (tenant_id, domain_id, metric_key, period_key, state);

CREATE TABLE analytics.result_adjustments (
  adjustment_id   uuid PRIMARY KEY,
  scope           text NOT NULL,
  tenant_id       uuid NOT NULL,
  domain_id       uuid NOT NULL,
  result_id       uuid NOT NULL REFERENCES analytics.metric_results (result_id),
  adjusted_value  numeric NOT NULL,
  reason          text NOT NULL CHECK (length(btrim(reason)) BETWEEN 8 AND 2000),
  evidence        jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(evidence) = 'array'),
  state           text NOT NULL DEFAULT 'proposed' CHECK (state IN ('proposed', 'approved', 'rejected')),
  digest          text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  proposed_by     uuid NOT NULL,
  proposed_at     timestamptz NOT NULL DEFAULT clock_timestamp(),
  decided_by      uuid,
  decided_at      timestamptz,
  decision_reason text,
  correlation_id  uuid NOT NULL,
  CONSTRAINT ara_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT ara_sod CHECK (decided_by IS NULL OR decided_by <> proposed_by),
  CONSTRAINT ara_decided CHECK (state = 'proposed' OR (decided_by IS NOT NULL AND decided_at IS NOT NULL))
);
CREATE INDEX ara_result ON analytics.result_adjustments (result_id);

/* Forward only: a decided row keeps its facts; only the decision (and a revocation of an approved exception) is written. */
CREATE OR REPLACE FUNCTION analytics.aix_forward() RETURNS trigger
LANGUAGE plpgsql SET search_path = analytics, pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION '% rows are never deleted', TG_TABLE_NAME USING ERRCODE = '42501'; END IF;
  IF OLD.state <> 'proposed' AND NOT (TG_TABLE_NAME = 'metric_exceptions' AND OLD.state = 'approved' AND NEW.state = 'revoked') THEN
    RAISE EXCEPTION 'metric definition rejected (state): a % row is decided (%)', TG_TABLE_NAME, OLD.state USING ERRCODE = '22023';
  END IF;
  IF NEW.digest <> OLD.digest OR NEW.proposed_by <> OLD.proposed_by OR NEW.tenant_id <> OLD.tenant_id THEN
    RAISE EXCEPTION 'metric definition rejected (state): a % row''s facts never change', TG_TABLE_NAME USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION analytics.aix_forward() FROM PUBLIC;
CREATE TRIGGER ame_forward BEFORE UPDATE OR DELETE ON analytics.metric_exceptions FOR EACH ROW EXECUTE FUNCTION analytics.aix_forward();
CREATE TRIGGER ara_forward BEFORE UPDATE OR DELETE ON analytics.result_adjustments FOR EACH ROW EXECUTE FUNCTION analytics.aix_forward();

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['metric_exceptions', 'result_adjustments'] LOOP
    EXECUTE format('REVOKE ALL ON analytics.%I FROM PUBLIC', t);
    EXECUTE format('ALTER TABLE analytics.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE analytics.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY domain_isolation ON analytics.%I
        USING (tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain()))$f$, t);
    EXECUTE format('GRANT SELECT ON analytics.%I TO eye_app, eye_commit', t);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION analytics.aix_is_owner(p_principal uuid, p_tenant uuid, p_domain uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path = identity, pg_catalog, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM identity.principals p JOIN identity.role_bindings b ON b.principal_id = p.id
                  WHERE p.id = p_principal AND p.kind = 'human' AND p.status = 'active' AND b.role_code = 'product_analytics_owner'
                    AND b.tenant_id = p_tenant AND (b.domain_id = p_domain OR b.domain_id IS NULL))
$$;
REVOKE ALL ON FUNCTION analytics.aix_is_owner(uuid, uuid, uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION analytics.aix_event(p_tenant uuid, p_domain uuid, p_kind text, p_subject uuid, p_key text, p_event text, p_actor uuid, p_details jsonb, p_correlation uuid) RETURNS void
LANGUAGE sql SET search_path = analytics, pg_catalog, pg_temp AS $$
  INSERT INTO analytics.definition_events (event_id, scope, tenant_id, domain_id, subject_kind, subject_id, subject_key, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_kind, p_subject, p_key, p_event, p_actor, coalesce(p_details, '{}'::jsonb), p_correlation)
$$;
REVOKE ALL ON FUNCTION analytics.aix_event(uuid, uuid, text, uuid, text, text, uuid, jsonb, uuid) FROM PUBLIC;

/* PROPOSE an exception (analytics.exception.propose — an analyst or the owner): the metric must have an approved definition; ≤ 366 days. */
CREATE OR REPLACE FUNCTION analytics.propose_metric_exception(p_exception uuid, p_tenant uuid, p_domain uuid, p_metric_key text, p_kind text, p_period text, p_scope_key text,
                                                              p_cohort jsonb, p_reason text, p_expires_at timestamptz, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = analytics, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_digest text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['analytics.exception.propose']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS NULL OR p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'metric definition rejected (actor): an exception is proposed under the acting principal' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM analytics.metric_definitions d WHERE d.tenant_id = p_tenant AND d.domain_id = p_domain AND d.metric_key = p_metric_key AND d.state = 'approved') THEN
    RAISE EXCEPTION 'metric definition rejected (unknown_metric): % has no approved definition in this domain', p_metric_key USING ERRCODE = '23503';
  END IF;
  IF p_kind IS DISTINCT FROM 'threshold_exemption' THEN RAISE EXCEPTION 'metric definition rejected (exception): the kind is threshold_exemption' USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM analytics.period_window(p_period)) THEN RAISE EXCEPTION 'metric definition rejected (period): % is not a period', p_period USING ERRCODE = '22023'; END IF;
  IF analytics.json_keys(coalesce(p_cohort, '{}'::jsonb)) && analytics.person_dimensions() THEN
    RAISE EXCEPTION 'metric definition rejected (person): an exception is never granted for a person' USING ERRCODE = '42501';
  END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'metric definition rejected (reason): an exception states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  IF p_expires_at IS NULL OR p_expires_at <= clock_timestamp() OR p_expires_at > clock_timestamp() + interval '366 days' THEN
    RAISE EXCEPTION 'metric definition rejected (expiry): an exception expires within 366 days' USING ERRCODE = '22023';
  END IF;
  v_digest := analytics.digest(jsonb_build_object('metric_key', p_metric_key, 'kind', p_kind, 'period', p_period, 'scope_key', p_scope_key, 'cohort', coalesce(p_cohort, '{}'::jsonb),
                                                  'reason', btrim(p_reason), 'expires_at', p_expires_at));
  INSERT INTO analytics.metric_exceptions (exception_id, scope, tenant_id, domain_id, metric_key, kind, period_key, scope_key, cohort, reason, expires_at, digest, proposed_by, correlation_id)
  VALUES (p_exception, 'DOMAIN', p_tenant, p_domain, p_metric_key, p_kind, p_period, p_scope_key, coalesce(p_cohort, '{}'::jsonb), btrim(p_reason), p_expires_at, v_digest, p_actor, p_correlation);
  PERFORM analytics.aix_event(p_tenant, p_domain, 'definition', p_exception, p_metric_key, 'exception.proposed', p_actor, jsonb_build_object('kind', p_kind, 'period', p_period, 'digest', v_digest), p_correlation);
  RETURN (SELECT to_jsonb(x) FROM analytics.metric_exceptions x WHERE x.exception_id = p_exception);
END $$ LANGUAGE plpgsql;

/* DECIDE an exception (analytics.exception.decide — human-gated: a named product analytics owner, never the proposer, at the digest). REVOKE it
   (the same action, decision 'revoke', on an approved exception). */
CREATE OR REPLACE FUNCTION analytics.decide_metric_exception(p_exception uuid, p_tenant uuid, p_domain uuid, p_decision text, p_digest text, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = analytics, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE e analytics.metric_exceptions%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['analytics.exception.decide']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS NULL OR p_actor IS DISTINCT FROM public.eye_principal() OR NOT analytics.aix_is_owner(p_actor, p_tenant, p_domain) THEN
    RAISE EXCEPTION 'metric definition rejected (authority): an exception is decided by a named human product analytics owner' USING ERRCODE = '42501';
  END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'metric definition rejected (reason): a decision states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  SELECT * INTO e FROM analytics.metric_exceptions x WHERE x.exception_id = p_exception AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'metric definition rejected (unknown_exception): % is not an exception of this domain', p_exception USING ERRCODE = '23503'; END IF;
  IF e.proposed_by = p_actor THEN RAISE EXCEPTION 'metric definition rejected (separation_of_duties): the proposer of an exception does not decide it' USING ERRCODE = '42501'; END IF;
  IF p_decision = 'revoke' THEN
    IF e.state <> 'approved' THEN RAISE EXCEPTION 'metric definition rejected (state): only an approved exception is revoked (it is %)', e.state USING ERRCODE = '22023'; END IF;
    UPDATE analytics.metric_exceptions SET state = 'revoked', revoked_by = p_actor, revoked_at = clock_timestamp() WHERE exception_id = p_exception;
  ELSE
    IF p_decision NOT IN ('approve', 'reject') THEN RAISE EXCEPTION 'metric definition rejected (decision): approve, reject or revoke' USING ERRCODE = '22023'; END IF;
    IF e.state <> 'proposed' THEN RAISE EXCEPTION 'metric definition rejected (state): the exception is %', e.state USING ERRCODE = '22023'; END IF;
    IF p_digest IS DISTINCT FROM e.digest THEN RAISE EXCEPTION 'metric definition rejected (stale): the exception is at digest %, not %', e.digest, p_digest USING ERRCODE = '22023'; END IF;
    UPDATE analytics.metric_exceptions SET state = CASE p_decision WHEN 'approve' THEN 'approved' ELSE 'rejected' END, decided_by = p_actor, decided_at = clock_timestamp(),
           decision_reason = btrim(p_reason) WHERE exception_id = p_exception;
  END IF;
  PERFORM analytics.aix_event(p_tenant, p_domain, 'definition', p_exception, e.metric_key, 'exception.' || CASE p_decision WHEN 'approve' THEN 'approved' WHEN 'reject' THEN 'rejected' ELSE 'revoked' END,
                              p_actor, jsonb_build_object('reason', btrim(p_reason)), p_correlation);
  RETURN (SELECT to_jsonb(x) FROM analytics.metric_exceptions x WHERE x.exception_id = p_exception);
END $$ LANGUAGE plpgsql;

/* The exemption in force for a result (§CO's breach routing consults it). */
CREATE OR REPLACE FUNCTION analytics.exemption_for(p_tenant uuid, p_domain uuid, p_metric_key text, p_period text, p_scope_key text, p_cohort jsonb) RETURNS uuid
LANGUAGE sql STABLE SET search_path = analytics, pg_catalog, pg_temp AS $$
  SELECT e.exception_id FROM analytics.metric_exceptions e
   WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain AND e.metric_key = p_metric_key AND e.period_key = p_period AND e.scope_key IS NOT DISTINCT FROM p_scope_key
     AND e.cohort = coalesce(p_cohort, '{}'::jsonb) AND e.kind = 'threshold_exemption' AND e.state = 'approved' AND e.expires_at > clock_timestamp()
   ORDER BY e.decided_at DESC LIMIT 1
$$;
REVOKE ALL ON FUNCTION analytics.exemption_for(uuid, uuid, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION analytics.exemption_for(uuid, uuid, text, text, text, jsonb) TO eye_app, eye_commit;

/* PROPOSE a manual adjustment beside a result (analytics.adjustment.propose — an analyst or the owner): a determinate or indeterminate result, never
   a preview or a replay; the result never changes. */
CREATE OR REPLACE FUNCTION analytics.propose_result_adjustment(p_adjustment uuid, p_tenant uuid, p_domain uuid, p_result uuid, p_value numeric, p_reason text, p_evidence jsonb,
                                                               p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = analytics, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r analytics.metric_results%ROWTYPE; v_digest text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['analytics.adjustment.propose']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS NULL OR p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'metric computation rejected (actor): an adjustment is proposed under the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO r FROM analytics.metric_results x WHERE x.result_id = p_result AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'metric computation rejected (unknown_result): % is not a result of this domain', p_result USING ERRCODE = '23503'; END IF;
  IF r.preview OR r.replay_of IS NOT NULL OR r.state = 'unsupported' THEN
    RAISE EXCEPTION 'metric computation rejected (state): a preview, a replay or an unsupported result is not adjusted' USING ERRCODE = '22023';
  END IF;
  IF p_value IS NULL THEN RAISE EXCEPTION 'metric computation rejected (adjustment): the adjusted value is stated' USING ERRCODE = '22023'; END IF;
  IF r.kind = 'rate' AND (p_value < 0 OR p_value > 1) THEN RAISE EXCEPTION 'metric computation rejected (adjustment): a rate lies in [0, 1]' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'metric computation rejected (reason): an adjustment states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  IF p_evidence IS NULL OR jsonb_typeof(p_evidence) <> 'array' OR jsonb_array_length(p_evidence) = 0 THEN
    RAISE EXCEPTION 'metric computation rejected (evidence): an adjustment cites what it rests on (records, documents)' USING ERRCODE = '22023';
  END IF;
  v_digest := analytics.digest(jsonb_build_object('result_id', p_result, 'value', p_value, 'reason', btrim(p_reason), 'evidence', p_evidence));
  INSERT INTO analytics.result_adjustments (adjustment_id, scope, tenant_id, domain_id, result_id, adjusted_value, reason, evidence, digest, proposed_by, correlation_id)
  VALUES (p_adjustment, 'DOMAIN', p_tenant, p_domain, p_result, p_value, btrim(p_reason), p_evidence, v_digest, p_actor, p_correlation);
  PERFORM analytics.aix_event(p_tenant, p_domain, 'result', p_result, r.metric_key, 'adjustment.proposed', p_actor, jsonb_build_object('adjustment_id', p_adjustment, 'value', p_value, 'digest', v_digest), p_correlation);
  RETURN (SELECT to_jsonb(x) FROM analytics.result_adjustments x WHERE x.adjustment_id = p_adjustment);
END $$ LANGUAGE plpgsql;

/* DECIDE an adjustment (analytics.adjustment.decide — human-gated: a named product analytics owner, never the proposer, at the digest). */
CREATE OR REPLACE FUNCTION analytics.decide_result_adjustment(p_adjustment uuid, p_tenant uuid, p_domain uuid, p_decision text, p_digest text, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = analytics, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE a analytics.result_adjustments%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['analytics.adjustment.decide']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS NULL OR p_actor IS DISTINCT FROM public.eye_principal() OR NOT analytics.aix_is_owner(p_actor, p_tenant, p_domain) THEN
    RAISE EXCEPTION 'metric computation rejected (authority): an adjustment is decided by a named human product analytics owner' USING ERRCODE = '42501';
  END IF;
  IF p_decision NOT IN ('approve', 'reject') THEN RAISE EXCEPTION 'metric computation rejected (decision): approve or reject' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'metric computation rejected (reason): a decision states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  SELECT * INTO a FROM analytics.result_adjustments x WHERE x.adjustment_id = p_adjustment AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'metric computation rejected (unknown_adjustment): % is not an adjustment of this domain', p_adjustment USING ERRCODE = '23503'; END IF;
  IF a.proposed_by = p_actor THEN RAISE EXCEPTION 'metric computation rejected (separation_of_duties): the proposer of an adjustment does not decide it' USING ERRCODE = '42501'; END IF;
  IF a.state <> 'proposed' THEN RAISE EXCEPTION 'metric computation rejected (state): the adjustment is %', a.state USING ERRCODE = '22023'; END IF;
  IF p_digest IS DISTINCT FROM a.digest THEN RAISE EXCEPTION 'metric computation rejected (stale): the adjustment is at digest %, not %', a.digest, p_digest USING ERRCODE = '22023'; END IF;
  UPDATE analytics.result_adjustments SET state = CASE p_decision WHEN 'approve' THEN 'approved' ELSE 'rejected' END, decided_by = p_actor, decided_at = clock_timestamp(),
         decision_reason = btrim(p_reason) WHERE adjustment_id = p_adjustment;
  PERFORM analytics.aix_event(p_tenant, p_domain, 'result', a.result_id, NULL, 'adjustment.' || CASE p_decision WHEN 'approve' THEN 'approved' ELSE 'rejected' END, p_actor,
                              jsonb_build_object('adjustment_id', p_adjustment, 'reason', btrim(p_reason)), p_correlation);
  RETURN (SELECT to_jsonb(x) FROM analytics.result_adjustments x WHERE x.adjustment_id = p_adjustment);
END $$ LANGUAGE plpgsql;

REVOKE ALL ON FUNCTION analytics.propose_metric_exception(uuid,uuid,uuid,text,text,text,text,jsonb,text,timestamptz,uuid,uuid), analytics.decide_metric_exception(uuid,uuid,uuid,text,text,text,uuid,uuid),
  analytics.propose_result_adjustment(uuid,uuid,uuid,uuid,numeric,text,jsonb,uuid,uuid), analytics.decide_result_adjustment(uuid,uuid,uuid,text,text,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION analytics.propose_metric_exception(uuid,uuid,uuid,text,text,text,text,jsonb,text,timestamptz,uuid,uuid), analytics.decide_metric_exception(uuid,uuid,uuid,text,text,text,uuid,uuid),
  analytics.propose_result_adjustment(uuid,uuid,uuid,uuid,numeric,text,jsonb,uuid,uuid), analytics.decide_result_adjustment(uuid,uuid,uuid,text,text,text,uuid,uuid) TO eye_commit;

/* analytics.result_read RE-DECLARED (copied whole from §0.9, the change marked B92 integration): the adjustments and the exceptions in force beside the result. */
CREATE OR REPLACE FUNCTION analytics.result_read(p_result uuid, p_records_limit int DEFAULT 500) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = analytics, pg_catalog, pg_temp AS $$
  SELECT to_jsonb(r) || jsonb_build_object(
    'definition', (SELECT to_jsonb(d) FROM analytics.metric_definitions d WHERE d.definition_id = r.definition_id),
    'scope_row', (SELECT to_jsonb(s) FROM analytics.scopes s WHERE s.scope_id = r.scope_id),
    'records', coalesce((SELECT jsonb_agg(to_jsonb(x) - 'tenant_id' - 'domain_id' ORDER BY x.ordinal) FROM (SELECT * FROM analytics.result_records rr WHERE rr.result_id = r.result_id ORDER BY rr.ordinal
                         LIMIT greatest(1, least(coalesce(p_records_limit, 500), 20000))) x), '[]'::jsonb),
    'records_by_role', coalesce((SELECT jsonb_object_agg(role, c) FROM (SELECT rr.role, count(*) c FROM analytics.result_records rr WHERE rr.result_id = r.result_id GROUP BY rr.role) z), '{}'::jsonb),
    'uses', coalesce((SELECT jsonb_agg(to_jsonb(u) - 'tenant_id' - 'domain_id' ORDER BY u.used_at) FROM analytics.metric_uses u WHERE u.result_id = r.result_id), '[]'::jsonb),
    'adjustments', coalesce((SELECT jsonb_agg(to_jsonb(a) - 'tenant_id' - 'domain_id' ORDER BY a.proposed_at) FROM analytics.result_adjustments a WHERE a.result_id = r.result_id), '[]'::jsonb),   -- B92 integration
    'exemption', analytics.exemption_for(r.tenant_id, r.domain_id, r.metric_key, r.period_key, r.scope_key, r.cohort),   -- B92 integration
    'replays', coalesce((SELECT jsonb_agg(jsonb_build_object('result_id', p.result_id, 'verdict', p.replay_verdict, 'computed_at', p.computed_at, 'source_revision', p.source_revision) ORDER BY p.computed_at)
                         FROM analytics.metric_results p WHERE p.replay_of = r.result_id), '[]'::jsonb))
  FROM analytics.metric_results r WHERE r.result_id = p_result
$$;
GRANT EXECUTE ON FUNCTION analytics.result_read(uuid, int) TO eye_app, eye_commit;
