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
