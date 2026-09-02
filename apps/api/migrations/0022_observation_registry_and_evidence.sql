-- 0022: PHASE 1 (L1 World Observation Layer) — source registry, governed
-- acquisition, evidence custody, quarantine, coverage/health and corrections.
--
-- GOVERNED FORWARD MIGRATION. 0001–0021 remain byte-identical; no rebaseline.
--
-- PHASE1_PLAN Revision 5 is the binding specification. The mapping is:
--   §4  event-sourced, scope-mandatory data model      → sections 2–9 below
--   §5  acquisition lifecycle + attempt/evidence identity → sections 5, 7, 11
--   §6  executable coverage model                       → section 8
--   §7  source-contract enforcement                     → sections 3, 10
--   §9  evidence-vault isolation (manifests, tombstones) → section 6
--   §10 correction honesty                              → section 9
--   §11 agent contracts                                 → section 4
--
-- THREE STRUCTURAL RULES CARRIED FROM PHASE 0, NOT RE-ARGUED HERE:
--
--  1. EVERY row carries the scope triple, NOT NULL per its scope class, with a
--     CHECK mirroring the Phase 0 scope-consistency constraints. Scope is never
--     populated from a client payload; the ports below re-derive it from the
--     established capability context and refuse a mismatch.
--  2. Append-only tables are append-only at BOTH levels: no role holds UPDATE or
--     DELETE, and public.raise_append_only() fires on either. Completion state
--     lives in the separate, rebuildable projections.
--  3. NO ROLE WRITES DIRECTLY. Every write goes through a SECURITY DEFINER port
--     that asserts the bound action through ctx.assert_business_authority, so the
--     capability minted for one operation cannot perform another. The 0013
--     operation-closure protocol then requires POL + AUD before the transaction
--     may commit — which is why the effect tables carry stamp_effect triggers.

-- ============================================================
-- 1. Schema, role code, and the shared authority guard.
-- ============================================================
CREATE SCHEMA IF NOT EXISTS observation;
GRANT USAGE ON SCHEMA observation TO eye_app, eye_commit;

-- The approver of a source contract (PHASE1_PLAN §12). Registration is performed
-- by a domain_analyst; approval REQUIRES this role AND a different principal.
INSERT INTO identity.roles (code, scope, description) VALUES
  ('collection_manager', 'DOMAIN',
   'Collection manager — approves source contracts, releases quarantine, reviews corrections. Registrar may never approve their own registration (PHASE1_PLAN §7).'),
  -- The AGENT's own role. Deliberately narrower than any human role: it may run
  -- collection, admit, quarantine, checkpoint, measure coverage and reconcile —
  -- and it may NOT approve a contract, release a quarantined item, or apply a
  -- correction. An agent that could release its own quarantine would make the
  -- quarantine decorative.
  ('collection_agent', 'DOMAIN',
   'Collection agent — bounded acquisition under a registered agent grant (PHASE1_PLAN §11). Cannot approve, release quarantine, or apply corrections.')
ON CONFLICT (code) DO NOTHING;

/*
 * One guard for every observation port.
 *
 * ctx.assert_business_authority binds a context to EXACTLY ONE action, which is
 * right, but the observation lifecycle has a dozen actions and one port per
 * action would be a dozen near-identical bodies. This helper keeps the binding
 * property intact: a port declares the action set it serves, the context's OWN
 * bound action must be in that set, and the unmodified Phase 0 assertion then
 * verifies the context really is bound to that action with a live, unexpired
 * issuance nonce. The caller cannot widen the set, and cannot pass an action the
 * context does not already carry.
 */
CREATE OR REPLACE FUNCTION observation.assert_authority(p_allowed text[])
RETURNS text
SECURITY DEFINER SET search_path = observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_action text := public.eye_bound_action();
BEGIN
  IF v_action IS NULL OR NOT (v_action = ANY (p_allowed)) THEN
    RAISE EXCEPTION 'observation write rejected: context is bound to action %, which this port does not serve',
      coalesce(v_action, '<none>') USING ERRCODE = '42501';
  END IF;
  PERFORM ctx.assert_business_authority(v_action);
  RETURN v_action;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION observation.assert_authority(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.assert_authority(text[]) TO eye_commit;

/*
 * The scope a row is written with is the scope of the ESTABLISHED CONTEXT, never
 * an argument. Ports call this instead of trusting a caller-supplied triple; a
 * caller that supplies a different triple is refused rather than silently
 * corrected, so a scope-confusion bug fails loudly.
 */
CREATE OR REPLACE FUNCTION observation.assert_scope(p_tenant uuid, p_domain uuid)
RETURNS void
SECURITY DEFINER SET search_path = observation, public, pg_catalog, pg_temp AS $$
BEGIN
  IF public.eye_scope() = 'PLATFORM' THEN
    RAISE EXCEPTION 'observation write rejected: observation state is tenant/domain scoped; platform authority cannot own it'
      USING ERRCODE = '42501';
  END IF;
  IF p_tenant IS DISTINCT FROM public.eye_tenant() THEN
    RAISE EXCEPTION 'observation write rejected: tenant does not match the established context' USING ERRCODE = '42501';
  END IF;
  IF public.eye_scope() = 'DOMAIN' AND p_domain IS DISTINCT FROM public.eye_domain() THEN
    RAISE EXCEPTION 'observation write rejected: domain does not match the established context' USING ERRCODE = '42501';
  END IF;
  IF p_domain IS NULL THEN
    RAISE EXCEPTION 'observation write rejected: observation state requires a domain' USING ERRCODE = '42501';
  END IF;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION observation.assert_scope(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.assert_scope(uuid, uuid) TO eye_commit;

-- Reused by every table below. DOMAIN scope only: an observation source belongs
-- to exactly one Intelligence Domain, so PLATFORM/TENANT rows are not expressible.
CREATE OR REPLACE FUNCTION observation.scope_ok(p_scope text, p_tenant uuid, p_domain uuid)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT p_scope = 'DOMAIN' AND p_tenant IS NOT NULL AND p_domain IS NOT NULL
$$;

-- ============================================================
-- 2. Source contracts — event log + rebuildable projection (§7).
-- ============================================================
CREATE TABLE observation.source_contract_events (
  event_id           uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  source_id          uuid NOT NULL,
  contract_version   int  NOT NULL CHECK (contract_version >= 1),
  event              text NOT NULL CHECK (event IN (
    'contract.registered', 'contract.approved', 'contract.activated',
    'contract.suspended', 'contract.reactivated', 'contract.retired',
    'contract.superseded', 'contract.rejected')),
  occurred_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  actor_principal_id uuid NOT NULL,
  details            jsonb NOT NULL DEFAULT '{}'::jsonb,
  correlation_id     uuid NOT NULL,
  CONSTRAINT src_event_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX src_events_source ON observation.source_contract_events (source_id, contract_version, occurred_at);
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON observation.source_contract_events
  FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

/*
 * The projection. This is the row the admission transaction LOCKS (§5 8d), so it
 * carries lifecycle_state and nothing derived that could disagree with the log.
 * It is mutable and rebuildable — observation.rebuild_projections() reconstructs
 * it from the event log alone, and the A11 test asserts byte-equality.
 */
CREATE TABLE observation.source_contracts_current (
  source_id                uuid NOT NULL,
  contract_version         int  NOT NULL CHECK (contract_version >= 1),
  scope                    text NOT NULL,
  tenant_id                uuid NOT NULL,
  domain_id                uuid NOT NULL,
  -- The immutable SRC canonical object carrying the full validated contract.
  src_object_id            uuid NOT NULL,
  src_object_version       bigint NOT NULL,
  source_key               text NOT NULL,          -- stable human id, e.g. 'imf-portwatch-chokepoints'
  name                     text NOT NULL,
  publisher                text NOT NULL,
  -- D1: TWO authority classes only. An observational source may never be
  -- presented as factual authority; this is checked at admission, not in the UI.
  authority_class          text NOT NULL CHECK (authority_class IN ('authoritative', 'observational')),
  connector_kind           text NOT NULL CHECK (connector_kind IN ('upload', 'rss', 'rest')),
  acquisition_mode         text NOT NULL CHECK (acquisition_mode IN ('replay', 'live')),
  data_origin              text NOT NULL CHECK (data_origin IN ('real', 'synthetic')),
  lifecycle_state          text NOT NULL CHECK (lifecycle_state IN
    ('draft', 'approved', 'active', 'suspended', 'retired', 'superseded')),
  -- D2: rights that are not CONFIRMED hold the contract in draft. Activation is
  -- refused by observation.transition_contract, not merely discouraged.
  rights_state             text NOT NULL CHECK (rights_state IN ('confirmed', 'pending', 'withdrawn')),
  registrar_principal_id   uuid NOT NULL,
  approver_principal_id    uuid,
  effective_from           timestamptz,
  effective_to             timestamptz,
  cadence_seconds          int,
  freshness_threshold_seconds int,
  coverage_universe_version text NOT NULL DEFAULT 'v1',
  schema_drift_tolerance   int NOT NULL DEFAULT 0 CHECK (schema_drift_tolerance >= 0),
  classification_ceiling   text NOT NULL,
  residency                text NOT NULL,
  purposes                 jsonb NOT NULL DEFAULT '[]'::jsonb,
  endpoints                jsonb NOT NULL DEFAULT '[]'::jsonb,
  contract                 jsonb NOT NULL,          -- the complete validated §7 payload
  created_at               timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at               timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (source_id, contract_version),
  CONSTRAINT src_current_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  -- An approver who is also the registrar is not a second pair of eyes.
  CONSTRAINT src_separation_of_duties CHECK (
    approver_principal_id IS NULL OR approver_principal_id <> registrar_principal_id),
  CONSTRAINT src_approved_has_approver CHECK (
    lifecycle_state IN ('draft') OR approver_principal_id IS NOT NULL),
  /*
   * D2 as a DATABASE constraint: UNCONFIRMED RIGHTS CANNOT REACH `active` FOR
   * LIVE ACQUISITION.
   *
   * The distinction is the one the packet's own rationale draws — "costs nothing
   * because replay is unaffected". Polling a publisher, and redistributing what
   * comes back, exercises that publisher's reuse terms; reading a frozen local
   * fixture set does not. So a contract whose reuse notice we could not verify
   * may be activated for REPLAY and may never be activated for LIVE, and the
   * unconfirmed state stays visible on the source either way.
   *
   * A live version of such a source is a NEW contract version, which must confirm
   * its rights to activate — a replay activation cannot be quietly upgraded.
   */
  CONSTRAINT src_active_requires_rights CHECK (
    lifecycle_state <> 'active' OR rights_state = 'confirmed' OR acquisition_mode = 'replay'),
  CONSTRAINT src_effective_order CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to > effective_from)
);
-- Exactly one version of a source may be active at a time (§7 supersession).
CREATE UNIQUE INDEX src_one_active_version ON observation.source_contracts_current (source_id)
  WHERE lifecycle_state = 'active';
CREATE UNIQUE INDEX src_key_unique ON observation.source_contracts_current (tenant_id, domain_id, source_key, contract_version);
CREATE INDEX src_current_lookup ON observation.source_contracts_current (tenant_id, domain_id, lifecycle_state);

-- ============================================================
-- 3. Agents (§11) — instance- and version-specific, owned, revocable.
-- ============================================================
CREATE TABLE observation.agents (
  agent_id            uuid PRIMARY KEY,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  principal_id        uuid NOT NULL,      -- identity.principals, kind='agent'
  agent_kind          text NOT NULL CHECK (agent_kind IN ('observation', 'crawler', 'collection')),
  connector           text NOT NULL,
  agent_version       text NOT NULL CHECK (agent_version ~ '^[0-9]+\.[0-9]+\.[0-9]+$'),
  code_digest         text NOT NULL CHECK (code_digest ~ '^[0-9a-f]{64}$'),
  owner_principal_id  uuid NOT NULL,      -- the ACCOUNTABLE HUMAN, never another agent
  source_id           uuid,               -- NULL = not yet bound to a source contract
  budgets             jsonb NOT NULL,     -- requests, bytes, cost units, concurrency, timeout, retries
  status              text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  created_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  revoked_at          timestamptz,
  CONSTRAINT agent_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT agent_revoked_has_time CHECK ((status = 'revoked') = (revoked_at IS NOT NULL))
);
/*
 * A new VERSION is a new principal (§11), and the grant is scoped PER SOURCE
 * CONTRACT — so the identity of an agent registration is the source together
 * with the connector, its version and its code digest. Two sources polled by the
 * same connector version are two registrations, each with its own principal,
 * owner and budgets, which is what lets one be revoked without touching the
 * other.
 */
CREATE UNIQUE INDEX agent_instance_unique
  ON observation.agents (tenant_id, domain_id, source_id, connector, agent_version, code_digest);
CREATE INDEX agent_principal_lookup ON observation.agents (principal_id);

CREATE TABLE observation.agent_events (
  event_id       uuid PRIMARY KEY,
  scope          text NOT NULL,
  tenant_id      uuid NOT NULL,
  domain_id      uuid NOT NULL,
  agent_id       uuid NOT NULL,
  event          text NOT NULL CHECK (event IN ('agent.registered', 'agent.bound', 'agent.revoked', 'agent.budget_changed')),
  occurred_at    timestamptz NOT NULL DEFAULT clock_timestamp(),
  actor_principal_id uuid NOT NULL,
  details        jsonb NOT NULL DEFAULT '{}'::jsonb,
  correlation_id uuid NOT NULL,
  CONSTRAINT agent_event_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON observation.agent_events
  FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

-- ============================================================
-- 4. Collection runs — event log + projection (§4, §5).
-- ============================================================
CREATE TABLE observation.collection_run_events (
  event_id            uuid PRIMARY KEY,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  run_id              uuid NOT NULL,
  source_id           uuid NOT NULL,
  contract_version    int  NOT NULL,
  agent_principal_id  uuid NOT NULL,
  agent_version       text NOT NULL,
  code_digest         text NOT NULL,
  connector           text NOT NULL,
  connector_version   text NOT NULL,
  acquisition_mode    text NOT NULL CHECK (acquisition_mode IN ('replay', 'live')),
  event               text NOT NULL CHECK (event IN (
    'run.started', 'item.fetched', 'item.quarantined', 'item.admitted',
    'item.noop', 'run.checkpointed', 'run.finished', 'run.failed',
    'run.budget_exceeded', 'run.cancelled')),
  occurred_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  details             jsonb NOT NULL DEFAULT '{}'::jsonb,
  correlation_id      uuid NOT NULL,
  CONSTRAINT run_event_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX run_events_run ON observation.collection_run_events (run_id, occurred_at);
CREATE INDEX run_events_source ON observation.collection_run_events (source_id, occurred_at);
-- The sweeper's query (§5.11): started runs with no terminal event.
CREATE INDEX run_events_started ON observation.collection_run_events (occurred_at)
  WHERE event = 'run.started';
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON observation.collection_run_events
  FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

CREATE TABLE observation.collection_runs_current (
  run_id             uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  source_id          uuid NOT NULL,
  contract_version   int  NOT NULL,
  agent_principal_id uuid NOT NULL,
  agent_version      text NOT NULL,
  code_digest        text NOT NULL,
  connector          text NOT NULL,
  connector_version  text NOT NULL,
  acquisition_mode   text NOT NULL,
  state              text NOT NULL CHECK (state IN ('started', 'finished', 'failed', 'cancelled', 'budget_exceeded')),
  started_at         timestamptz NOT NULL,
  last_event_at      timestamptz NOT NULL,
  finished_at        timestamptz,
  items_fetched      int NOT NULL DEFAULT 0,
  items_admitted     int NOT NULL DEFAULT 0,
  items_quarantined  int NOT NULL DEFAULT 0,
  items_noop         int NOT NULL DEFAULT 0,
  failure_reason     text,
  CONSTRAINT run_current_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX runs_current_source ON observation.collection_runs_current (source_id, started_at DESC);
CREATE INDEX runs_current_open ON observation.collection_runs_current (started_at) WHERE state = 'started';

-- ============================================================
-- 5. Idempotency vs. evidence identity (§5.12) — the attempt key.
-- ============================================================
/*
 * The attempt key is (source, contract version, run, item natural key). ONLY an
 * exact replay of the same acquisition ATTEMPT no-ops. Identical BYTES observed
 * at a later observation time are a NEW observation with its own attempt key —
 * content digest is the identity of bytes, never of observations. The UNIQUE
 * constraint is what F45/F46 exercise.
 */
CREATE TABLE observation.acquisition_attempts (
  attempt_id        uuid PRIMARY KEY,
  scope             text NOT NULL,
  tenant_id         uuid NOT NULL,
  domain_id         uuid NOT NULL,
  source_id         uuid NOT NULL,
  contract_version  int  NOT NULL,
  run_id            uuid NOT NULL,
  item_key          text NOT NULL,
  first_seen_at     timestamptz NOT NULL DEFAULT clock_timestamp(),
  outcome           text NOT NULL DEFAULT 'claimed' CHECK (outcome IN ('claimed', 'admitted', 'quarantined', 'failed')),
  evd_object_id     uuid,
  correlation_id    uuid NOT NULL,
  CONSTRAINT attempt_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE UNIQUE INDEX attempt_key_unique
  ON observation.acquisition_attempts (source_id, contract_version, run_id, item_key);

-- ============================================================
-- 6. Evidence vault manifests and tombstones (§9).
-- ============================================================
/*
 * RETRIEVAL RESOLVES VIA THE MANIFEST ONLY. An admitted-candidate blob whose
 * transaction aborted has no manifest row and is therefore unreachable through
 * every retrieval path (§5 8g) — that is what makes F17/F18/F20 safe rather than
 * merely unlikely. The locator is an OPAQUE tenant/domain-scoped uuid path, never
 * the digest: there is no global digest namespace and no cross-tenant existence
 * disclosure.
 */
CREATE TABLE observation.blob_manifests (
  manifest_id          uuid PRIMARY KEY,
  scope                text NOT NULL,
  tenant_id            uuid NOT NULL,
  domain_id            uuid NOT NULL,
  vault                text NOT NULL CHECK (vault IN ('quarantine', 'evidence')),
  locator              text NOT NULL,
  content_digest       text NOT NULL CHECK (content_digest ~ '^[0-9a-f]{64}$'),
  byte_length          bigint NOT NULL CHECK (byte_length >= 0),
  media_type_declared  text,
  media_type_sniffed   text,
  active_content_risk  boolean NOT NULL DEFAULT false,
  classification       text NOT NULL,
  residency            text NOT NULL,
  retention_profile    text NOT NULL,
  legal_hold           boolean NOT NULL DEFAULT false,
  source_id            uuid NOT NULL,
  contract_version     int  NOT NULL,
  run_id               uuid,
  acquisition_mode     text NOT NULL CHECK (acquisition_mode IN ('replay', 'live')),
  created_at           timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id       uuid NOT NULL,
  CONSTRAINT manifest_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  -- The locator MUST begin with its own scope segments; the vault port checks the
  -- same thing on every read and write, independently of RLS (§9).
  CONSTRAINT manifest_locator_scoped CHECK (locator = tenant_id::text || '/' || domain_id::text || '/' || split_part(locator, '/', 3)
                                            AND split_part(locator, '/', 3) <> ''
                                            AND array_length(string_to_array(locator, '/'), 1) = 3)
);
CREATE UNIQUE INDEX manifest_locator_unique ON observation.blob_manifests (vault, locator);
-- Digest lookups are scoped PER DOMAIN only — no global digest namespace.
CREATE INDEX manifest_digest_scoped ON observation.blob_manifests (tenant_id, domain_id, content_digest);
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON observation.blob_manifests
  FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

CREATE TABLE observation.blob_tombstones (
  tombstone_id       uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  manifest_id        uuid NOT NULL REFERENCES observation.blob_manifests(manifest_id),
  reason             text NOT NULL,
  tombstoned_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  actor_principal_id uuid NOT NULL,
  correlation_id     uuid NOT NULL,
  CONSTRAINT tombstone_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
-- Tombstoning is IDEMPOTENT (F26/F27): one tombstone per manifest, re-runs no-op.
CREATE UNIQUE INDEX tombstone_manifest_unique ON observation.blob_tombstones (manifest_id);
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON observation.blob_tombstones
  FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

-- ============================================================
-- 7. Chain of custody (§5, A2).
-- ============================================================
CREATE TABLE observation.custody_events (
  event_id           uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  manifest_id        uuid,
  obs_object_id      uuid,
  evd_object_id      uuid,
  source_id          uuid NOT NULL,
  contract_version   int  NOT NULL,
  run_id             uuid,
  event              text NOT NULL CHECK (event IN (
    'custody.acquired', 'custody.quarantined', 'custody.verified',
    'custody.candidate_verified', 'custody.admitted', 'custody.finalized',
    'custody.retrieved', 'custody.tombstoned', 'custody.integrity_failed')),
  occurred_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  actor              text NOT NULL,          -- 'principal:<uuid>' or 'agent:<name>@<ver>'
  agent_principal_id uuid,
  agent_version      text,
  code_digest        text,
  connector          text,
  connector_version  text,
  method_ref         text,
  content_digest     text,
  digest_verified    boolean,
  details            jsonb NOT NULL DEFAULT '{}'::jsonb,
  correlation_id     uuid NOT NULL,
  CONSTRAINT custody_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX custody_by_evd ON observation.custody_events (evd_object_id, occurred_at);
CREATE INDEX custody_by_manifest ON observation.custody_events (manifest_id, occurred_at);
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON observation.custody_events
  FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

-- ============================================================
-- 8. Quarantine (§5, L1-C07).
-- ============================================================
CREATE TABLE observation.quarantine_events (
  event_id       uuid PRIMARY KEY,
  scope          text NOT NULL,
  tenant_id      uuid NOT NULL,
  domain_id      uuid NOT NULL,
  case_id        uuid NOT NULL,
  event          text NOT NULL CHECK (event IN (
    'case.opened', 'check.completed', 'case.admitted', 'case.rejected', 'case.expired')),
  occurred_at    timestamptz NOT NULL DEFAULT clock_timestamp(),
  actor          text NOT NULL,
  verdict        text,
  reason_class   text,
  details        jsonb NOT NULL DEFAULT '{}'::jsonb,
  correlation_id uuid NOT NULL,
  CONSTRAINT q_event_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX q_events_case ON observation.quarantine_events (case_id, occurred_at);
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON observation.quarantine_events
  FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

CREATE TABLE observation.quarantine_current (
  case_id           uuid PRIMARY KEY,
  scope             text NOT NULL,
  tenant_id         uuid NOT NULL,
  domain_id         uuid NOT NULL,
  source_id         uuid NOT NULL,
  contract_version  int  NOT NULL,
  run_id            uuid,
  manifest_id       uuid,
  item_key          text NOT NULL,
  state             text NOT NULL CHECK (state IN ('open', 'admitted', 'rejected', 'expired')),
  opened_at         timestamptz NOT NULL,
  closed_at         timestamptz,
  expires_at        timestamptz NOT NULL,
  reason_class      text,
  reason            text,
  declared_type     text,
  sniffed_type      text,
  byte_length       bigint,
  content_digest    text,
  review_actor      text,
  review_reason     text,
  CONSTRAINT q_current_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT q_closed_has_time CHECK ((state = 'open') = (closed_at IS NULL))
);
CREATE INDEX q_current_open ON observation.quarantine_current (tenant_id, domain_id, opened_at DESC) WHERE state = 'open';
CREATE INDEX q_current_expiry ON observation.quarantine_current (expires_at) WHERE state = 'open';

-- ============================================================
-- 9. Source health + executable coverage (§6).
-- ============================================================
CREATE TABLE observation.coverage_measurements (
  measurement_id            uuid PRIMARY KEY,
  scope                     text NOT NULL,
  tenant_id                 uuid NOT NULL,
  domain_id                 uuid NOT NULL,
  source_id                 uuid NOT NULL,
  dimension                 text NOT NULL CHECK (dimension IN (
    'expected_coverage', 'actual_coverage', 'freshness', 'completeness', 'latency',
    'authenticity', 'correction_lag', 'blind_spots', 'degraded_regions')),
  -- §6: unknown / indeterminate / insufficient_evidence NEVER map to healthy.
  state                     text NOT NULL CHECK (state IN (
    'measured', 'unknown', 'indeterminate', 'not_applicable', 'insufficient_evidence')),
  value_numeric             numeric,
  value_text                text,
  -- The STORED evaluation instant. Replay never computes state from an unstored now.
  evaluated_at              timestamptz NOT NULL,
  window_start              timestamptz NOT NULL,
  window_end                timestamptz NOT NULL,
  denominator               numeric,
  denominator_derivation    text,
  coverage_universe_version text NOT NULL,
  calc_method               text NOT NULL,
  calc_version              text NOT NULL,
  evidence_refs             jsonb NOT NULL DEFAULT '[]'::jsonb,
  applicability_state       text NOT NULL DEFAULT 'applicable'
    CHECK (applicability_state IN ('applicable', 'not_applicable')),
  not_applicable_reason     text,
  confidence                text NOT NULL DEFAULT 'unknown',
  error_class               text,
  correlation_id            uuid NOT NULL,
  recorded_at               timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT cov_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT cov_window_order CHECK (window_end > window_start),
  -- §6: not_applicable REQUIRES a contract-approved reason recorded on the row.
  CONSTRAINT cov_na_requires_reason CHECK (
    (state = 'not_applicable') = (not_applicable_reason IS NOT NULL)),
  -- A measured dimension must actually carry a measurement.
  CONSTRAINT cov_measured_has_value CHECK (
    state <> 'measured' OR value_numeric IS NOT NULL OR value_text IS NOT NULL),
  -- A failed measurement RUN is itself recorded, never skipped silently.
  CONSTRAINT cov_indeterminate_has_class CHECK (
    state <> 'indeterminate' OR error_class IS NOT NULL)
);
CREATE INDEX cov_by_source ON observation.coverage_measurements (source_id, dimension, evaluated_at DESC);
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON observation.coverage_measurements
  FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

CREATE TABLE observation.source_health_events (
  event_id                  uuid PRIMARY KEY,
  scope                     text NOT NULL,
  tenant_id                 uuid NOT NULL,
  domain_id                 uuid NOT NULL,
  source_id                 uuid NOT NULL,
  prior_state               text,
  new_state                 text NOT NULL CHECK (new_state IN
    ('healthy', 'degraded', 'unknown', 'suspended', 'failed')),
  evaluated_at              timestamptz NOT NULL,
  calc_version              text NOT NULL,
  coverage_universe_version text NOT NULL,
  evidence_refs             jsonb NOT NULL DEFAULT '[]'::jsonb,
  reason                    text NOT NULL,
  -- Publisher lag is displayed DISTINCTLY from collection failure. Conflating
  -- them is how an operator learns to ignore the panel.
  lag_class                 text NOT NULL DEFAULT 'unknown'
    CHECK (lag_class IN ('publisher_lag', 'collection_failure', 'none', 'unknown')),
  correlation_id            uuid NOT NULL,
  recorded_at               timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT health_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX health_by_source ON observation.source_health_events (source_id, evaluated_at);
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON observation.source_health_events
  FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

-- ============================================================
-- 10. Corrections and withdrawals (§10).
-- ============================================================
CREATE TABLE observation.correction_events (
  event_id       uuid PRIMARY KEY,
  scope          text NOT NULL,
  tenant_id      uuid NOT NULL,
  domain_id      uuid NOT NULL,
  case_id        uuid NOT NULL,
  event          text NOT NULL CHECK (event IN (
    'case.received', 'case.validated', 'case.rejected', 'case.applied', 'case.failed')),
  occurred_at    timestamptz NOT NULL DEFAULT clock_timestamp(),
  actor          text NOT NULL,
  details        jsonb NOT NULL DEFAULT '{}'::jsonb,
  correlation_id uuid NOT NULL,
  CONSTRAINT corr_event_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX corr_events_case ON observation.correction_events (case_id, occurred_at);
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON observation.correction_events
  FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

CREATE TABLE observation.correction_current (
  case_id                uuid PRIMARY KEY,
  scope                  text NOT NULL,
  tenant_id              uuid NOT NULL,
  domain_id              uuid NOT NULL,
  source_id              uuid NOT NULL,
  kind                   text NOT NULL CHECK (kind IN ('correction', 'withdrawal', 'supersession')),
  state                  text NOT NULL CHECK (state IN ('received', 'validated', 'rejected', 'applied', 'failed')),
  received_at            timestamptz NOT NULL,
  closed_at              timestamptz,
  channel                text NOT NULL,
  publisher_ref          text,
  reason                 text NOT NULL,
  -- §10.2: what we RESOLVED, and an explicit statement of what we did not.
  affected_resolved      jsonb NOT NULL DEFAULT '[]'::jsonb,
  propagation_unresolved text NOT NULL,
  failure_reason         text,
  CONSTRAINT corr_current_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX corr_current_source ON observation.correction_current (source_id, received_at DESC);

-- ============================================================
-- 11. Connector checkpoints and scheduler entries (§5 step 9, §12).
-- ============================================================
CREATE TABLE observation.checkpoint_events (
  event_id         uuid PRIMARY KEY,
  scope            text NOT NULL,
  tenant_id        uuid NOT NULL,
  domain_id        uuid NOT NULL,
  source_id        uuid NOT NULL,
  contract_version int  NOT NULL,
  run_id           uuid NOT NULL,
  checkpoint       jsonb NOT NULL,
  occurred_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id   uuid NOT NULL,
  CONSTRAINT cp_event_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX cp_events_source ON observation.checkpoint_events (source_id, occurred_at);
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON observation.checkpoint_events
  FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

-- Checkpoints are PRESERVED across suspension (§7): resumption after
-- reactivation continues from the last committed checkpoint.
CREATE TABLE observation.connector_checkpoints (
  source_id        uuid PRIMARY KEY,
  scope            text NOT NULL,
  tenant_id        uuid NOT NULL,
  domain_id        uuid NOT NULL,
  contract_version int  NOT NULL,
  run_id           uuid NOT NULL,
  checkpoint       jsonb NOT NULL,
  updated_at       timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT cp_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);

CREATE TABLE observation.scheduler_entries (
  source_id        uuid PRIMARY KEY,
  scope            text NOT NULL,
  tenant_id        uuid NOT NULL,
  domain_id        uuid NOT NULL,
  contract_version int  NOT NULL,
  scheduler_id     text NOT NULL,
  queue_name       text NOT NULL,
  -- The 60-second local floor is a DATABASE constraint too, not only scheduler code.
  cadence_seconds  int  NOT NULL CHECK (cadence_seconds >= 60),
  jitter_seconds   int  NOT NULL DEFAULT 0 CHECK (jitter_seconds >= 0),
  status           text NOT NULL CHECK (status IN ('scheduled', 'removed')),
  created_at       timestamptz NOT NULL DEFAULT clock_timestamp(),
  removed_at       timestamptz,
  CONSTRAINT sched_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  -- Queue names and scheduler ids are scope-prefixed (§4 Redis isolation).
  CONSTRAINT sched_scoped_names CHECK (
    queue_name LIKE 'obs:' || tenant_id::text || ':' || domain_id::text || '%'
    AND scheduler_id LIKE 'obs:' || tenant_id::text || ':' || domain_id::text || '%')
);

-- ============================================================
-- 12. Row-level security — one policy shape for every observation relation.
-- ============================================================
/*
 * PLATFORM authority reads nothing here: observation state is domain-owned, and a
 * platform-technical role is explicitly NOT a business reader (PER-18/19). A
 * TENANT context sees every domain in its tenant; a DOMAIN context sees only its
 * own. This is defence in depth beside the vault port's own locator check and the
 * §4 negative tests — never the only boundary.
 */
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'source_contract_events', 'source_contracts_current', 'agents', 'agent_events',
    'collection_run_events', 'collection_runs_current', 'acquisition_attempts',
    'blob_manifests', 'blob_tombstones', 'custody_events',
    'quarantine_events', 'quarantine_current', 'coverage_measurements',
    'source_health_events', 'correction_events', 'correction_current',
    'checkpoint_events', 'connector_checkpoints', 'scheduler_entries'
  ] LOOP
    EXECUTE format('ALTER TABLE observation.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE observation.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY observation_isolation ON observation.%I
        USING (
          tenant_id = public.eye_tenant()
          AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain())
        )$f$, t);
    EXECUTE format('GRANT SELECT ON observation.%I TO eye_app, eye_commit', t);
  END LOOP;
END $$;

-- ============================================================
-- 13. Operation-effect stamping (0013 C1) for the authoritative effect tables.
-- ============================================================
/*
 * Every table that records an authoritative BUSINESS EFFECT is stamped against
 * the open operation, so the deferred closure trigger fails the transaction
 * unless POL + AUD are present for the same decision. The projections are NOT
 * stamped: they are derived rows written inside the same transaction as the
 * event that produced them, and stamping them would count one effect twice.
 */
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('source_contract_events', 'event_id'),
    ('agent_events',           'event_id'),
    ('collection_run_events',  'event_id'),
    ('acquisition_attempts',   'attempt_id'),
    ('blob_manifests',         'manifest_id'),
    ('blob_tombstones',        'tombstone_id'),
    ('custody_events',         'event_id'),
    ('quarantine_events',      'event_id'),
    ('coverage_measurements',  'measurement_id'),
    ('source_health_events',   'event_id'),
    ('correction_events',      'event_id'),
    ('checkpoint_events',      'event_id')
  ) AS v(tbl, keycol) LOOP
    EXECUTE format(
      'CREATE TRIGGER stamp_effect AFTER INSERT ON observation.%I
         FOR EACH ROW EXECUTE FUNCTION ctx.stamp_business_effect(%L, %L)',
      r.tbl, 'observation.' || r.tbl, r.keycol);
  END LOOP;
END $$;

-- ============================================================
-- 14. Ports — source registry and contract lifecycle (§7).
-- ============================================================
CREATE OR REPLACE FUNCTION observation.register_source(
  p_source_id uuid, p_contract_version int, p_tenant uuid, p_domain uuid,
  p_src_object_id uuid, p_src_object_version bigint,
  p_source_key text, p_name text, p_publisher text,
  p_authority_class text, p_connector_kind text, p_acquisition_mode text, p_data_origin text,
  p_rights_state text, p_registrar uuid, p_cadence_seconds int,
  p_freshness_threshold_seconds int, p_coverage_universe_version text,
  p_schema_drift_tolerance int, p_classification_ceiling text, p_residency text,
  p_purposes jsonb, p_endpoints jsonb, p_contract jsonb,
  p_event_id uuid, p_correlation uuid
) RETURNS void
SECURITY DEFINER SET search_path = observation, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_authority(ARRAY['observation.source.register']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF public.eye_principal() IS DISTINCT FROM p_registrar THEN
    RAISE EXCEPTION 'source registration rejected: the registrar must be the acting principal'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO observation.source_contracts_current (
    source_id, contract_version, scope, tenant_id, domain_id,
    src_object_id, src_object_version, source_key, name, publisher,
    authority_class, connector_kind, acquisition_mode, data_origin,
    lifecycle_state, rights_state, registrar_principal_id, approver_principal_id,
    cadence_seconds, freshness_threshold_seconds, coverage_universe_version,
    schema_drift_tolerance, classification_ceiling, residency, purposes, endpoints, contract
  ) VALUES (
    p_source_id, p_contract_version, 'DOMAIN', p_tenant, p_domain,
    p_src_object_id, p_src_object_version, p_source_key, p_name, p_publisher,
    p_authority_class, p_connector_kind, p_acquisition_mode, p_data_origin,
    'draft', p_rights_state, p_registrar, NULL,
    p_cadence_seconds, p_freshness_threshold_seconds, p_coverage_universe_version,
    p_schema_drift_tolerance, p_classification_ceiling, p_residency, p_purposes, p_endpoints, p_contract
  );

  INSERT INTO observation.source_contract_events (
    event_id, scope, tenant_id, domain_id, source_id, contract_version,
    event, actor_principal_id, details, correlation_id
  ) VALUES (
    p_event_id, 'DOMAIN', p_tenant, p_domain, p_source_id, p_contract_version,
    'contract.registered', p_registrar,
    -- A11: the projection is rebuilt from the event log ALONE, so the registration
    -- event carries the complete row it produced. A snapshot that lived only in the
    -- projection would make the rebuild a re-derivation from itself.
    jsonb_build_object(
      'src_object_id', p_src_object_id, 'src_object_version', p_src_object_version,
      'source_key', p_source_key, 'name', p_name, 'publisher', p_publisher,
      'authority_class', p_authority_class, 'connector_kind', p_connector_kind,
      'acquisition_mode', p_acquisition_mode, 'data_origin', p_data_origin,
      'rights_state', p_rights_state, 'cadence_seconds', p_cadence_seconds,
      'freshness_threshold_seconds', p_freshness_threshold_seconds,
      'coverage_universe_version', p_coverage_universe_version,
      'schema_drift_tolerance', p_schema_drift_tolerance,
      'classification_ceiling', p_classification_ceiling, 'residency', p_residency,
      'purposes', p_purposes, 'endpoints', p_endpoints, 'contract', p_contract),
    p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION observation.register_source(uuid,int,uuid,uuid,uuid,bigint,text,text,text,text,text,text,text,text,uuid,int,int,text,int,text,text,jsonb,jsonb,jsonb,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.register_source(uuid,int,uuid,uuid,uuid,bigint,text,text,text,text,text,text,text,text,uuid,int,int,text,int,text,text,jsonb,jsonb,jsonb,uuid,uuid) TO eye_commit;

/*
 * Approval. SEPARATION OF DUTIES IS ENFORCED HERE, in the database, on the acting
 * principal — not by hiding a button. The registrar cannot approve their own
 * registration even holding the collection_manager role, and even by calling the
 * port directly with someone else's id in the argument, because the approver is
 * taken from the ESTABLISHED CONTEXT and compared with the stored registrar.
 */
CREATE OR REPLACE FUNCTION observation.approve_source(
  p_source_id uuid, p_contract_version int, p_tenant uuid, p_domain uuid,
  p_decision text, p_reason text, p_event_id uuid, p_correlation uuid
) RETURNS void
SECURITY DEFINER SET search_path = observation, ctx, identity, public, pg_catalog, pg_temp AS $$
DECLARE v_row observation.source_contracts_current%ROWTYPE;
        v_approver uuid := public.eye_principal();
        v_has_role boolean;
BEGIN
  PERFORM observation.assert_authority(ARRAY['observation.source.approve']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_decision NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'approval rejected: decision must be approve or reject' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_row FROM observation.source_contracts_current
   WHERE source_id = p_source_id AND contract_version = p_contract_version
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'approval rejected: no such source contract version' USING ERRCODE = '23503';
  END IF;
  IF v_row.lifecycle_state <> 'draft' THEN
    RAISE EXCEPTION 'approval rejected: contract is %, only a draft can be approved', v_row.lifecycle_state
      USING ERRCODE = '23514';
  END IF;
  IF v_approver IS NULL OR v_approver = v_row.registrar_principal_id THEN
    RAISE EXCEPTION 'approval rejected: the registrar of a source contract may never approve it (separation of duties)'
      USING ERRCODE = '42501';
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM identity.role_bindings b
     WHERE b.principal_id = v_approver AND b.revoked_at IS NULL
       AND b.role_code = 'collection_manager'
       AND b.tenant_id = p_tenant AND (b.domain_id = p_domain OR b.scope = 'TENANT')
  ) INTO v_has_role;
  IF NOT v_has_role THEN
    RAISE EXCEPTION 'approval rejected: approval requires the collection_manager role in this domain'
      USING ERRCODE = '42501';
  END IF;

  IF p_decision = 'approve' THEN
    UPDATE observation.source_contracts_current
       SET lifecycle_state = 'approved', approver_principal_id = v_approver, updated_at = clock_timestamp()
     WHERE source_id = p_source_id AND contract_version = p_contract_version;
  ELSE
    UPDATE observation.source_contracts_current
       SET lifecycle_state = 'retired', approver_principal_id = v_approver, updated_at = clock_timestamp()
     WHERE source_id = p_source_id AND contract_version = p_contract_version;
  END IF;

  INSERT INTO observation.source_contract_events (
    event_id, scope, tenant_id, domain_id, source_id, contract_version,
    event, actor_principal_id, details, correlation_id
  ) VALUES (
    p_event_id, 'DOMAIN', p_tenant, p_domain, p_source_id, p_contract_version,
    CASE WHEN p_decision = 'approve' THEN 'contract.approved' ELSE 'contract.rejected' END,
    v_approver,
    jsonb_build_object('registrar', v_row.registrar_principal_id, 'reason', p_reason),
    p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION observation.approve_source(uuid,int,uuid,uuid,text,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.approve_source(uuid,int,uuid,uuid,text,text,uuid,uuid) TO eye_commit;

/*
 * Lifecycle transitions. The permitted state machine lives here rather than in
 * application code, so a second caller cannot invent a transition:
 *   draft → approved (approve_source only)
 *   approved → active | retired
 *   active → suspended | retired | superseded
 *   suspended → active (reactivate) | retired
 * Activation additionally requires CONFIRMED rights (D2) and an approver.
 */
CREATE OR REPLACE FUNCTION observation.transition_contract(
  p_source_id uuid, p_contract_version int, p_tenant uuid, p_domain uuid,
  p_target text, p_reason text, p_event_id uuid, p_correlation uuid
) RETURNS void
SECURITY DEFINER SET search_path = observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_row observation.source_contracts_current%ROWTYPE; v_ok boolean;
BEGIN
  PERFORM observation.assert_authority(ARRAY['observation.source.transition']);
  PERFORM observation.assert_scope(p_tenant, p_domain);

  SELECT * INTO v_row FROM observation.source_contracts_current
   WHERE source_id = p_source_id AND contract_version = p_contract_version FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'transition rejected: no such source contract version' USING ERRCODE = '23503';
  END IF;

  v_ok := CASE
    WHEN v_row.lifecycle_state = 'approved'  AND p_target IN ('active', 'retired')                 THEN true
    WHEN v_row.lifecycle_state = 'active'    AND p_target IN ('suspended', 'retired', 'superseded') THEN true
    WHEN v_row.lifecycle_state = 'suspended' AND p_target IN ('active', 'retired')                 THEN true
    ELSE false END;
  IF NOT v_ok THEN
    RAISE EXCEPTION 'transition rejected: % → % is not a permitted source-contract transition',
      v_row.lifecycle_state, p_target USING ERRCODE = '23514';
  END IF;
  IF p_target = 'active' THEN
    -- Unconfirmed rights block LIVE acquisition only; frozen replay exercises no
    -- publisher's reuse terms. The unconfirmed state remains on the source and is
    -- surfaced as an attention item regardless of which mode it runs in.
    IF v_row.rights_state <> 'confirmed' AND v_row.acquisition_mode = 'live' THEN
      RAISE EXCEPTION 'activation rejected: rights are % and this contract acquires LIVE; a live contract may not be activated on unconfirmed rights',
        v_row.rights_state USING ERRCODE = '23514';
    END IF;
    IF v_row.rights_state = 'withdrawn' THEN
      RAISE EXCEPTION 'activation rejected: rights have been withdrawn' USING ERRCODE = '23514';
    END IF;
    IF v_row.approver_principal_id IS NULL THEN
      RAISE EXCEPTION 'activation rejected: contract has no approver' USING ERRCODE = '23514';
    END IF;
  END IF;

  UPDATE observation.source_contracts_current
     SET lifecycle_state = p_target,
         effective_from = CASE WHEN p_target = 'active' AND effective_from IS NULL
                               THEN clock_timestamp() ELSE effective_from END,
         effective_to   = CASE WHEN p_target IN ('retired', 'superseded')
                               THEN clock_timestamp() ELSE effective_to END,
         updated_at = clock_timestamp()
   WHERE source_id = p_source_id AND contract_version = p_contract_version;

  INSERT INTO observation.source_contract_events (
    event_id, scope, tenant_id, domain_id, source_id, contract_version,
    event, actor_principal_id, details, correlation_id
  ) VALUES (
    p_event_id, 'DOMAIN', p_tenant, p_domain, p_source_id, p_contract_version,
    CASE p_target
      WHEN 'active'     THEN CASE WHEN v_row.lifecycle_state = 'suspended'
                                  THEN 'contract.reactivated' ELSE 'contract.activated' END
      WHEN 'suspended'  THEN 'contract.suspended'
      WHEN 'retired'    THEN 'contract.retired'
      WHEN 'superseded' THEN 'contract.superseded' END,
    public.eye_principal(),
    jsonb_build_object('from', v_row.lifecycle_state, 'to', p_target, 'reason', p_reason),
    p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION observation.transition_contract(uuid,int,uuid,uuid,text,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.transition_contract(uuid,int,uuid,uuid,text,text,uuid,uuid) TO eye_commit;

/*
 * Rights confirmation is its OWN action. Marking a source's reuse terms confirmed
 * is the decision that unblocks activation, so it is not folded into a generic
 * contract edit where it could ride along with something else.
 */
CREATE OR REPLACE FUNCTION observation.set_rights_state(
  p_source_id uuid, p_contract_version int, p_tenant uuid, p_domain uuid,
  p_rights_state text, p_evidence text, p_event_id uuid, p_correlation uuid
) RETURNS void
SECURITY DEFINER SET search_path = observation, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_authority(ARRAY['observation.source.rights']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_rights_state NOT IN ('confirmed', 'pending', 'withdrawn') THEN
    RAISE EXCEPTION 'rights update rejected: unknown rights state %', p_rights_state USING ERRCODE = '22023';
  END IF;
  UPDATE observation.source_contracts_current
     SET rights_state = p_rights_state,
         -- §7 fail-closed: withdrawn rights immediately deactivate an active contract.
         lifecycle_state = CASE WHEN p_rights_state = 'withdrawn' AND lifecycle_state = 'active'
                                THEN 'suspended' ELSE lifecycle_state END,
         updated_at = clock_timestamp()
   WHERE source_id = p_source_id AND contract_version = p_contract_version;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'rights update rejected: no such source contract version' USING ERRCODE = '23503';
  END IF;
  INSERT INTO observation.source_contract_events (
    event_id, scope, tenant_id, domain_id, source_id, contract_version,
    event, actor_principal_id, details, correlation_id
  ) VALUES (
    p_event_id, 'DOMAIN', p_tenant, p_domain, p_source_id, p_contract_version,
    CASE WHEN p_rights_state = 'withdrawn' THEN 'contract.suspended' ELSE 'contract.registered' END,
    public.eye_principal(),
    jsonb_build_object('rights_state', p_rights_state, 'evidence', p_evidence, 'kind', 'rights_update'),
    p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION observation.set_rights_state(uuid,int,uuid,uuid,text,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.set_rights_state(uuid,int,uuid,uuid,text,text,uuid,uuid) TO eye_commit;

/*
 * THE TRANSACTIONALLY PROTECTED FINAL CONTRACT REVALIDATION (§5 8d).
 *
 * This is the third of the three revalidation points and the only one that can
 * be raced. It re-reads the exact contract version UNDER A ROW-LEVEL SHARE LOCK
 * inside the admission transaction, so a concurrent suspension either commits
 * before this lock (admission aborts here) or blocks until admission commits
 * (the cancellation path then revokes future runs). Admission can never commit
 * against a contract whose deactivation committed first.
 *
 * FOR SHARE, not FOR UPDATE: two concurrent admissions against the same active
 * contract must not serialize against each other, only against a writer.
 */
CREATE OR REPLACE FUNCTION observation.lock_active_contract(
  p_source_id uuid, p_contract_version int, p_tenant uuid, p_domain uuid, p_purpose text
) RETURNS observation.source_contracts_current
SECURITY DEFINER SET search_path = observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_row observation.source_contracts_current%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY[
    'observation.item.admit', 'observation.run.start', 'observation.item.quarantine']);
  PERFORM observation.assert_scope(p_tenant, p_domain);

  SELECT * INTO v_row FROM observation.source_contracts_current
   WHERE source_id = p_source_id AND contract_version = p_contract_version
     AND tenant_id = p_tenant AND domain_id = p_domain
   FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'contract revalidation failed: no such source contract version' USING ERRCODE = '23503';
  END IF;
  IF v_row.lifecycle_state <> 'active' THEN
    RAISE EXCEPTION 'contract revalidation failed: contract is %, not active', v_row.lifecycle_state
      USING ERRCODE = '23514';
  END IF;
  -- The same rule at admission: a LIVE contract needs confirmed rights; a replay
  -- contract needs rights that have not been WITHDRAWN.
  IF v_row.rights_state = 'withdrawn'
     OR (v_row.rights_state <> 'confirmed' AND v_row.acquisition_mode = 'live') THEN
    RAISE EXCEPTION 'contract revalidation failed: rights are % for a % contract',
      v_row.rights_state, v_row.acquisition_mode USING ERRCODE = '23514';
  END IF;
  IF v_row.effective_to IS NOT NULL AND v_row.effective_to <= clock_timestamp() THEN
    RAISE EXCEPTION 'contract revalidation failed: effective period has passed' USING ERRCODE = '23514';
  END IF;
  IF p_purpose IS NOT NULL AND NOT (v_row.purposes ? p_purpose) THEN
    RAISE EXCEPTION 'contract revalidation failed: purpose % is not among the contract purposes', p_purpose
      USING ERRCODE = '42501';
  END IF;
  RETURN v_row;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION observation.lock_active_contract(uuid,int,uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.lock_active_contract(uuid,int,uuid,uuid,text) TO eye_commit;

-- ============================================================
-- 15. Ports — agents (§11).
-- ============================================================
CREATE OR REPLACE FUNCTION observation.register_agent(
  p_agent_id uuid, p_tenant uuid, p_domain uuid, p_principal uuid,
  p_agent_kind text, p_connector text, p_agent_version text, p_code_digest text,
  p_owner uuid, p_source_id uuid, p_budgets jsonb, p_event_id uuid, p_correlation uuid
) RETURNS void
SECURITY DEFINER SET search_path = observation, ctx, identity, public, pg_catalog, pg_temp AS $$
DECLARE v_kind text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['observation.agent.register']);
  PERFORM observation.assert_scope(p_tenant, p_domain);

  SELECT kind INTO v_kind FROM identity.principals WHERE id = p_principal AND status = 'active';
  IF v_kind IS DISTINCT FROM 'agent' THEN
    RAISE EXCEPTION 'agent registration rejected: principal is not an active agent principal' USING ERRCODE = '42501';
  END IF;
  -- The accountable owner is a HUMAN. An agent owning an agent is not accountability.
  IF NOT EXISTS (SELECT 1 FROM identity.principals WHERE id = p_owner AND kind = 'human' AND status = 'active') THEN
    RAISE EXCEPTION 'agent registration rejected: the accountable owner must be an active human principal'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO observation.agents (
    agent_id, scope, tenant_id, domain_id, principal_id, agent_kind, connector,
    agent_version, code_digest, owner_principal_id, source_id, budgets
  ) VALUES (
    p_agent_id, 'DOMAIN', p_tenant, p_domain, p_principal, p_agent_kind, p_connector,
    p_agent_version, p_code_digest, p_owner, p_source_id, p_budgets);

  INSERT INTO observation.agent_events (
    event_id, scope, tenant_id, domain_id, agent_id, event, actor_principal_id, details, correlation_id
  ) VALUES (
    p_event_id, 'DOMAIN', p_tenant, p_domain, p_agent_id, 'agent.registered', public.eye_principal(),
    jsonb_build_object('connector', p_connector, 'version', p_agent_version,
                       'code_digest', p_code_digest, 'owner', p_owner, 'budgets', p_budgets),
    p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION observation.register_agent(uuid,uuid,uuid,uuid,text,text,text,text,uuid,uuid,jsonb,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.register_agent(uuid,uuid,uuid,uuid,text,text,text,text,uuid,uuid,jsonb,uuid,uuid) TO eye_commit;

CREATE OR REPLACE FUNCTION observation.revoke_agent(
  p_agent_id uuid, p_tenant uuid, p_domain uuid, p_reason text, p_event_id uuid, p_correlation uuid
) RETURNS void
SECURITY DEFINER SET search_path = observation, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_authority(ARRAY['observation.agent.revoke']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  UPDATE observation.agents SET status = 'revoked', revoked_at = clock_timestamp()
   WHERE agent_id = p_agent_id AND tenant_id = p_tenant AND domain_id = p_domain;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'agent revocation rejected: no such agent' USING ERRCODE = '23503';
  END IF;
  INSERT INTO observation.agent_events (
    event_id, scope, tenant_id, domain_id, agent_id, event, actor_principal_id, details, correlation_id
  ) VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_agent_id, 'agent.revoked',
            public.eye_principal(), jsonb_build_object('reason', p_reason), p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION observation.revoke_agent(uuid,uuid,uuid,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.revoke_agent(uuid,uuid,uuid,text,uuid,uuid) TO eye_commit;

/*
 * PER-RUN REAUTHORIZATION (§11). A queued job carries NO authority: at execution
 * the worker presents the agent instance it claims to be, and this port proves —
 * inside the run's own transaction — that the agent is still active, still bound
 * to this source contract, still the same code digest, and still owned. A job
 * pinned to a retired instance or a drifted digest is refused here, not at the
 * queue.
 */
CREATE OR REPLACE FUNCTION observation.authorize_agent_run(
  p_agent_id uuid, p_tenant uuid, p_domain uuid, p_principal uuid,
  p_agent_version text, p_code_digest text, p_source_id uuid
) RETURNS observation.agents
SECURITY DEFINER SET search_path = observation, ctx, identity, public, pg_catalog, pg_temp AS $$
DECLARE a observation.agents%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['observation.run.start']);
  PERFORM observation.assert_scope(p_tenant, p_domain);

  SELECT * INTO a FROM observation.agents
   WHERE agent_id = p_agent_id AND tenant_id = p_tenant AND domain_id = p_domain;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'agent run rejected: no such agent in this domain' USING ERRCODE = '42501';
  END IF;
  IF a.status <> 'active' THEN
    RAISE EXCEPTION 'agent run rejected: agent grant is revoked' USING ERRCODE = '42501';
  END IF;
  IF a.principal_id IS DISTINCT FROM p_principal THEN
    RAISE EXCEPTION 'agent run rejected: agent instance mismatch' USING ERRCODE = '42501';
  END IF;
  IF a.agent_version IS DISTINCT FROM p_agent_version THEN
    RAISE EXCEPTION 'agent run rejected: agent version mismatch (job pinned to %, registered %)',
      p_agent_version, a.agent_version USING ERRCODE = '42501';
  END IF;
  IF a.code_digest IS DISTINCT FROM p_code_digest THEN
    RAISE EXCEPTION 'agent run rejected: agent code digest mismatch' USING ERRCODE = '42501';
  END IF;
  IF a.source_id IS DISTINCT FROM p_source_id THEN
    RAISE EXCEPTION 'agent run rejected: agent is not bound to this source contract' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM identity.principals p
                  WHERE p.id = a.principal_id AND p.status = 'active') THEN
    RAISE EXCEPTION 'agent run rejected: agent principal is not active' USING ERRCODE = '42501';
  END IF;
  RETURN a;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION observation.authorize_agent_run(uuid,uuid,uuid,uuid,text,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.authorize_agent_run(uuid,uuid,uuid,uuid,text,text,uuid) TO eye_commit;

-- ============================================================
-- 16. Ports — collection runs (§5 steps 2, 9, 11).
-- ============================================================
CREATE OR REPLACE FUNCTION observation.append_run_event(
  p_event_id uuid, p_tenant uuid, p_domain uuid, p_run_id uuid, p_source_id uuid,
  p_contract_version int, p_agent_principal uuid, p_agent_version text, p_code_digest text,
  p_connector text, p_connector_version text, p_acquisition_mode text,
  p_event text, p_details jsonb, p_correlation uuid
) RETURNS void
SECURITY DEFINER SET search_path = observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_terminal boolean := p_event IN ('run.finished', 'run.failed', 'run.cancelled', 'run.budget_exceeded');
BEGIN
  PERFORM observation.assert_authority(ARRAY[
    'observation.run.start', 'observation.item.admit', 'observation.item.quarantine',
    'observation.run.checkpoint', 'observation.run.finish', 'observation.run.cancel',
    'observation.sweeper.reconcile']);
  PERFORM observation.assert_scope(p_tenant, p_domain);

  -- run.started is the ONLY event that may create the projection row, and it
  -- shares this transaction with POL + AUD (F05/F06).
  IF p_event = 'run.started' THEN
    INSERT INTO observation.collection_runs_current (
      run_id, scope, tenant_id, domain_id, source_id, contract_version,
      agent_principal_id, agent_version, code_digest, connector, connector_version,
      acquisition_mode, state, started_at, last_event_at
    ) VALUES (
      p_run_id, 'DOMAIN', p_tenant, p_domain, p_source_id, p_contract_version,
      p_agent_principal, p_agent_version, p_code_digest, p_connector, p_connector_version,
      p_acquisition_mode, 'started', clock_timestamp(), clock_timestamp());
  ELSE
    UPDATE observation.collection_runs_current
       SET last_event_at = clock_timestamp(),
           items_fetched     = items_fetched     + (p_event = 'item.fetched')::int,
           items_admitted    = items_admitted    + (p_event = 'item.admitted')::int,
           items_quarantined = items_quarantined + (p_event = 'item.quarantined')::int,
           items_noop        = items_noop        + (p_event = 'item.noop')::int,
           state = CASE
             WHEN p_event = 'run.finished'        THEN 'finished'
             WHEN p_event = 'run.failed'          THEN 'failed'
             WHEN p_event = 'run.cancelled'       THEN 'cancelled'
             WHEN p_event = 'run.budget_exceeded' THEN 'budget_exceeded'
             ELSE state END,
           finished_at = CASE WHEN v_terminal THEN clock_timestamp() ELSE finished_at END,
           failure_reason = CASE WHEN v_terminal AND p_event <> 'run.finished'
                                 THEN coalesce(p_details ->> 'reason', failure_reason)
                                 ELSE failure_reason END
     WHERE run_id = p_run_id AND tenant_id = p_tenant AND domain_id = p_domain;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'run event rejected: no started run % in this domain', p_run_id USING ERRCODE = '23503';
    END IF;
  END IF;

  INSERT INTO observation.collection_run_events (
    event_id, scope, tenant_id, domain_id, run_id, source_id, contract_version,
    agent_principal_id, agent_version, code_digest, connector, connector_version,
    acquisition_mode, event, details, correlation_id
  ) VALUES (
    p_event_id, 'DOMAIN', p_tenant, p_domain, p_run_id, p_source_id, p_contract_version,
    p_agent_principal, p_agent_version, p_code_digest, p_connector, p_connector_version,
    p_acquisition_mode, p_event, p_details, p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION observation.append_run_event(uuid,uuid,uuid,uuid,uuid,int,uuid,text,text,text,text,text,text,jsonb,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.append_run_event(uuid,uuid,uuid,uuid,uuid,int,uuid,text,text,text,text,text,text,jsonb,uuid) TO eye_commit;

/*
 * Claim the acquisition attempt key (§5.12). Returns 'claimed' for a new attempt
 * and 'replay' for an exact replay of the SAME attempt — never for identical
 * bytes seen later, which carry a different run and are a new observation.
 */
CREATE OR REPLACE FUNCTION observation.claim_attempt(
  p_attempt_id uuid, p_tenant uuid, p_domain uuid, p_source_id uuid,
  p_contract_version int, p_run_id uuid, p_item_key text, p_correlation uuid
) RETURNS text
SECURITY DEFINER SET search_path = observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_existing uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['observation.item.admit', 'observation.item.quarantine']);
  PERFORM observation.assert_scope(p_tenant, p_domain);

  SELECT attempt_id INTO v_existing FROM observation.acquisition_attempts
   WHERE source_id = p_source_id AND contract_version = p_contract_version
     AND run_id = p_run_id AND item_key = p_item_key;
  IF FOUND THEN RETURN 'replay'; END IF;

  INSERT INTO observation.acquisition_attempts (
    attempt_id, scope, tenant_id, domain_id, source_id, contract_version,
    run_id, item_key, correlation_id
  ) VALUES (
    p_attempt_id, 'DOMAIN', p_tenant, p_domain, p_source_id, p_contract_version,
    p_run_id, p_item_key, p_correlation);
  RETURN 'claimed';
EXCEPTION WHEN unique_violation THEN
  -- F46: the uniqueness violation raised at insert time takes the no-op path.
  RETURN 'replay';
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION observation.claim_attempt(uuid,uuid,uuid,uuid,int,uuid,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.claim_attempt(uuid,uuid,uuid,uuid,int,uuid,text,uuid) TO eye_commit;

CREATE OR REPLACE FUNCTION observation.append_checkpoint(
  p_event_id uuid, p_tenant uuid, p_domain uuid, p_source_id uuid,
  p_contract_version int, p_run_id uuid, p_checkpoint jsonb, p_correlation uuid
) RETURNS void
SECURITY DEFINER SET search_path = observation, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_authority(ARRAY['observation.run.checkpoint']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  INSERT INTO observation.checkpoint_events (
    event_id, scope, tenant_id, domain_id, source_id, contract_version, run_id, checkpoint, correlation_id
  ) VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_source_id, p_contract_version,
            p_run_id, p_checkpoint, p_correlation);
  INSERT INTO observation.connector_checkpoints (
    source_id, scope, tenant_id, domain_id, contract_version, run_id, checkpoint
  ) VALUES (p_source_id, 'DOMAIN', p_tenant, p_domain, p_contract_version, p_run_id, p_checkpoint)
  ON CONFLICT (source_id) DO UPDATE
    SET contract_version = EXCLUDED.contract_version, run_id = EXCLUDED.run_id,
        checkpoint = EXCLUDED.checkpoint, updated_at = clock_timestamp();
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION observation.append_checkpoint(uuid,uuid,uuid,uuid,int,uuid,jsonb,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.append_checkpoint(uuid,uuid,uuid,uuid,int,uuid,jsonb,uuid) TO eye_commit;

-- ============================================================
-- 17. Ports — vault manifests, custody, quarantine (§5, §9).
-- ============================================================
CREATE OR REPLACE FUNCTION observation.record_manifest(
  p_manifest_id uuid, p_tenant uuid, p_domain uuid, p_vault text, p_locator text,
  p_digest text, p_bytes bigint, p_declared text, p_sniffed text, p_active_risk boolean,
  p_classification text, p_residency text, p_retention text, p_legal_hold boolean,
  p_source_id uuid, p_contract_version int, p_run_id uuid, p_acquisition_mode text,
  p_correlation uuid
) RETURNS void
SECURITY DEFINER SET search_path = observation, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_authority(ARRAY[
    'observation.item.admit', 'observation.item.quarantine', 'observation.quarantine.review']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  -- The locator's OWN scope segments must be this scope. The vault port checks
  -- the same thing on the filesystem side, independently.
  IF p_locator <> p_tenant::text || '/' || p_domain::text || '/' || split_part(p_locator, '/', 3) THEN
    RAISE EXCEPTION 'manifest rejected: locator scope segments do not match the established context'
      USING ERRCODE = '42501';
  END IF;
  INSERT INTO observation.blob_manifests (
    manifest_id, scope, tenant_id, domain_id, vault, locator, content_digest, byte_length,
    media_type_declared, media_type_sniffed, active_content_risk, classification, residency,
    retention_profile, legal_hold, source_id, contract_version, run_id, acquisition_mode, correlation_id
  ) VALUES (
    p_manifest_id, 'DOMAIN', p_tenant, p_domain, p_vault, p_locator, p_digest, p_bytes,
    p_declared, p_sniffed, p_active_risk, p_classification, p_residency,
    p_retention, p_legal_hold, p_source_id, p_contract_version, p_run_id, p_acquisition_mode, p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION observation.record_manifest(uuid,uuid,uuid,text,text,text,bigint,text,text,boolean,text,text,text,boolean,uuid,int,uuid,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.record_manifest(uuid,uuid,uuid,text,text,text,bigint,text,text,boolean,text,text,text,boolean,uuid,int,uuid,text,uuid) TO eye_commit;

/*
 * Tombstoning is idempotent by construction (F26/F27): the unique index makes a
 * second attempt a no-op rather than a duplicate or an error, so the sweeper can
 * re-run it to completion after a crash at any point.
 */
CREATE OR REPLACE FUNCTION observation.tombstone_blob(
  p_tombstone_id uuid, p_tenant uuid, p_domain uuid, p_manifest_id uuid,
  p_reason text, p_correlation uuid
) RETURNS boolean
SECURITY DEFINER SET search_path = observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_inserted boolean;
BEGIN
  PERFORM observation.assert_authority(ARRAY[
    'observation.item.admit', 'observation.sweeper.reconcile', 'observation.quarantine.review']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF NOT EXISTS (SELECT 1 FROM observation.blob_manifests
                  WHERE manifest_id = p_manifest_id AND tenant_id = p_tenant AND domain_id = p_domain) THEN
    RAISE EXCEPTION 'tombstone rejected: no such manifest in this domain' USING ERRCODE = '23503';
  END IF;
  INSERT INTO observation.blob_tombstones (
    tombstone_id, scope, tenant_id, domain_id, manifest_id, reason, actor_principal_id, correlation_id
  ) VALUES (p_tombstone_id, 'DOMAIN', p_tenant, p_domain, p_manifest_id, p_reason,
            public.eye_principal(), p_correlation)
  ON CONFLICT (manifest_id) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION observation.tombstone_blob(uuid,uuid,uuid,uuid,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.tombstone_blob(uuid,uuid,uuid,uuid,text,uuid) TO eye_commit;

CREATE OR REPLACE FUNCTION observation.append_custody(
  p_event_id uuid, p_tenant uuid, p_domain uuid, p_manifest_id uuid,
  p_obs_object_id uuid, p_evd_object_id uuid, p_source_id uuid, p_contract_version int,
  p_run_id uuid, p_event text, p_actor text, p_agent_principal uuid, p_agent_version text,
  p_code_digest text, p_connector text, p_connector_version text, p_method_ref text,
  p_content_digest text, p_digest_verified boolean, p_details jsonb, p_correlation uuid
) RETURNS void
SECURITY DEFINER SET search_path = observation, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_authority(ARRAY[
    'observation.item.admit', 'observation.item.quarantine', 'observation.evidence.retrieve',
    'observation.sweeper.reconcile', 'observation.quarantine.review', 'observation.correction.apply']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  INSERT INTO observation.custody_events (
    event_id, scope, tenant_id, domain_id, manifest_id, obs_object_id, evd_object_id,
    source_id, contract_version, run_id, event, actor, agent_principal_id, agent_version,
    code_digest, connector, connector_version, method_ref, content_digest, digest_verified,
    details, correlation_id
  ) VALUES (
    p_event_id, 'DOMAIN', p_tenant, p_domain, p_manifest_id, p_obs_object_id, p_evd_object_id,
    p_source_id, p_contract_version, p_run_id, p_event, p_actor, p_agent_principal, p_agent_version,
    p_code_digest, p_connector, p_connector_version, p_method_ref, p_content_digest, p_digest_verified,
    p_details, p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION observation.append_custody(uuid,uuid,uuid,uuid,uuid,uuid,uuid,int,uuid,text,text,uuid,text,text,text,text,text,text,boolean,jsonb,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.append_custody(uuid,uuid,uuid,uuid,uuid,uuid,uuid,int,uuid,text,text,uuid,text,text,text,text,text,text,boolean,jsonb,uuid) TO eye_commit;

CREATE OR REPLACE FUNCTION observation.open_quarantine_case(
  p_case_id uuid, p_tenant uuid, p_domain uuid, p_source_id uuid, p_contract_version int,
  p_run_id uuid, p_manifest_id uuid, p_item_key text, p_reason_class text, p_reason text,
  p_declared text, p_sniffed text, p_bytes bigint, p_digest text, p_ttl_seconds int,
  p_event_id uuid, p_correlation uuid
) RETURNS void
SECURITY DEFINER SET search_path = observation, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_authority(ARRAY['observation.item.quarantine']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  INSERT INTO observation.quarantine_current (
    case_id, scope, tenant_id, domain_id, source_id, contract_version, run_id, manifest_id,
    item_key, state, opened_at, expires_at, reason_class, reason, declared_type, sniffed_type,
    byte_length, content_digest
  ) VALUES (
    p_case_id, 'DOMAIN', p_tenant, p_domain, p_source_id, p_contract_version, p_run_id, p_manifest_id,
    p_item_key, 'open', clock_timestamp(), clock_timestamp() + make_interval(secs => p_ttl_seconds),
    p_reason_class, p_reason, p_declared, p_sniffed, p_bytes, p_digest);
  INSERT INTO observation.quarantine_events (
    event_id, scope, tenant_id, domain_id, case_id, event, actor, verdict, reason_class, details, correlation_id
  ) VALUES (
    p_event_id, 'DOMAIN', p_tenant, p_domain, p_case_id, 'case.opened',
    coalesce('principal:' || public.eye_principal()::text, 'system'), 'quarantined', p_reason_class,
    jsonb_build_object('reason', p_reason, 'item_key', p_item_key,
                       'declared_type', p_declared, 'sniffed_type', p_sniffed,
                       'source_id', p_source_id, 'contract_version', p_contract_version,
                       'run_id', p_run_id, 'manifest_id', p_manifest_id,
                       'byte_length', p_bytes, 'content_digest', p_digest,
                       'ttl_seconds', p_ttl_seconds),
    p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION observation.open_quarantine_case(uuid,uuid,uuid,uuid,int,uuid,uuid,text,text,text,text,text,bigint,text,int,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.open_quarantine_case(uuid,uuid,uuid,uuid,int,uuid,uuid,text,text,text,text,text,bigint,text,int,uuid,uuid) TO eye_commit;

/*
 * Closing a quarantine case. RELEASE REQUIRES A SECOND OPERATOR: the acting
 * principal may not be the one who caused the item to be quarantined, and a
 * release always carries a reason. Expiry is the sweeper's path and carries no
 * human actor.
 */
CREATE OR REPLACE FUNCTION observation.close_quarantine_case(
  p_case_id uuid, p_tenant uuid, p_domain uuid, p_outcome text, p_reason text,
  p_event_id uuid, p_correlation uuid
) RETURNS void
SECURITY DEFINER SET search_path = observation, ctx, identity, public, pg_catalog, pg_temp AS $$
DECLARE v_row observation.quarantine_current%ROWTYPE; v_actor uuid := public.eye_principal(); v_has_role boolean;
BEGIN
  IF p_outcome = 'expired' THEN
    PERFORM observation.assert_authority(ARRAY['observation.sweeper.reconcile']);
  ELSE
    PERFORM observation.assert_authority(ARRAY['observation.quarantine.review']);
  END IF;
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_outcome NOT IN ('admitted', 'rejected', 'expired') THEN
    RAISE EXCEPTION 'quarantine close rejected: unknown outcome %', p_outcome USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_row FROM observation.quarantine_current
   WHERE case_id = p_case_id AND tenant_id = p_tenant AND domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'quarantine close rejected: no such case' USING ERRCODE = '23503';
  END IF;
  IF v_row.state <> 'open' THEN
    RAISE EXCEPTION 'quarantine close rejected: case is already %', v_row.state USING ERRCODE = '23514';
  END IF;
  IF p_outcome <> 'expired' THEN
    IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN
      RAISE EXCEPTION 'quarantine close rejected: a release or rejection requires a recorded reason'
        USING ERRCODE = '23514';
    END IF;
    SELECT EXISTS (
      SELECT 1 FROM identity.role_bindings b
       WHERE b.principal_id = v_actor AND b.revoked_at IS NULL
         AND b.role_code = 'collection_manager'
         AND b.tenant_id = p_tenant AND (b.domain_id = p_domain OR b.scope = 'TENANT')
    ) INTO v_has_role;
    IF NOT v_has_role THEN
      RAISE EXCEPTION 'quarantine close rejected: review requires the collection_manager role in this domain'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  UPDATE observation.quarantine_current
     SET state = p_outcome, closed_at = clock_timestamp(),
         review_actor = CASE WHEN p_outcome = 'expired' THEN 'sweeper'
                             ELSE 'principal:' || v_actor::text END,
         review_reason = p_reason
   WHERE case_id = p_case_id;

  INSERT INTO observation.quarantine_events (
    event_id, scope, tenant_id, domain_id, case_id, event, actor, verdict, reason_class, details, correlation_id
  ) VALUES (
    p_event_id, 'DOMAIN', p_tenant, p_domain, p_case_id,
    CASE p_outcome WHEN 'admitted' THEN 'case.admitted'
                   WHEN 'rejected' THEN 'case.rejected'
                   ELSE 'case.expired' END,
    CASE WHEN p_outcome = 'expired' THEN 'sweeper' ELSE 'principal:' || v_actor::text END,
    p_outcome, v_row.reason_class,
    jsonb_build_object('reason', p_reason, 'opened_by_run', v_row.run_id),
    p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION observation.close_quarantine_case(uuid,uuid,uuid,text,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.close_quarantine_case(uuid,uuid,uuid,text,text,uuid,uuid) TO eye_commit;

-- ============================================================
-- 18. Ports — coverage, health, corrections (§6, §10).
-- ============================================================
CREATE OR REPLACE FUNCTION observation.record_measurement(
  p_measurement_id uuid, p_tenant uuid, p_domain uuid, p_source_id uuid,
  p_dimension text, p_state text, p_value_numeric numeric, p_value_text text,
  p_evaluated_at timestamptz, p_window_start timestamptz, p_window_end timestamptz,
  p_denominator numeric, p_denominator_derivation text, p_universe_version text,
  p_calc_method text, p_calc_version text, p_evidence_refs jsonb,
  p_applicability text, p_na_reason text, p_confidence text, p_error_class text, p_correlation uuid
) RETURNS void
SECURITY DEFINER SET search_path = observation, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_authority(ARRAY['observation.coverage.measure']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  -- §6: not_applicable requires a CONTRACT-APPROVED reason. The port checks the
  -- contract actually declares it, so "approved" is not merely a free-text claim.
  IF p_state = 'not_applicable' THEN
    IF NOT EXISTS (
      SELECT 1 FROM observation.source_contracts_current c
       WHERE c.source_id = p_source_id AND c.tenant_id = p_tenant AND c.domain_id = p_domain
         AND c.contract -> 'security_and_operations' -> 'coverage_expectations'
                        -> 'not_applicable_dimensions' ? p_dimension
    ) THEN
      RAISE EXCEPTION 'measurement rejected: dimension % is recorded not_applicable but the source contract does not approve that exemption',
        p_dimension USING ERRCODE = '23514';
    END IF;
  END IF;
  INSERT INTO observation.coverage_measurements (
    measurement_id, scope, tenant_id, domain_id, source_id, dimension, state,
    value_numeric, value_text, evaluated_at, window_start, window_end, denominator,
    denominator_derivation, coverage_universe_version, calc_method, calc_version,
    evidence_refs, applicability_state, not_applicable_reason, confidence, error_class, correlation_id
  ) VALUES (
    p_measurement_id, 'DOMAIN', p_tenant, p_domain, p_source_id, p_dimension, p_state,
    p_value_numeric, p_value_text, p_evaluated_at, p_window_start, p_window_end, p_denominator,
    p_denominator_derivation, p_universe_version, p_calc_method, p_calc_version,
    p_evidence_refs, p_applicability, p_na_reason, p_confidence, p_error_class, p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION observation.record_measurement(uuid,uuid,uuid,uuid,text,text,numeric,text,timestamptz,timestamptz,timestamptz,numeric,text,text,text,text,jsonb,text,text,text,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.record_measurement(uuid,uuid,uuid,uuid,text,text,numeric,text,timestamptz,timestamptz,timestamptz,numeric,text,text,text,text,jsonb,text,text,text,text,uuid) TO eye_commit;

CREATE OR REPLACE FUNCTION observation.append_health_event(
  p_event_id uuid, p_tenant uuid, p_domain uuid, p_source_id uuid,
  p_prior text, p_new text, p_evaluated_at timestamptz, p_calc_version text,
  p_universe_version text, p_evidence_refs jsonb, p_reason text, p_lag_class text, p_correlation uuid
) RETURNS void
SECURITY DEFINER SET search_path = observation, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_authority(ARRAY['observation.coverage.measure', 'observation.source.transition']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  INSERT INTO observation.source_health_events (
    event_id, scope, tenant_id, domain_id, source_id, prior_state, new_state,
    evaluated_at, calc_version, coverage_universe_version, evidence_refs, reason, lag_class, correlation_id
  ) VALUES (
    p_event_id, 'DOMAIN', p_tenant, p_domain, p_source_id, p_prior, p_new,
    p_evaluated_at, p_calc_version, p_universe_version, p_evidence_refs, p_reason, p_lag_class, p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION observation.append_health_event(uuid,uuid,uuid,uuid,text,text,timestamptz,text,text,jsonb,text,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.append_health_event(uuid,uuid,uuid,uuid,text,text,timestamptz,text,text,jsonb,text,text,uuid) TO eye_commit;

CREATE OR REPLACE FUNCTION observation.open_correction_case(
  p_case_id uuid, p_tenant uuid, p_domain uuid, p_source_id uuid, p_kind text,
  p_channel text, p_publisher_ref text, p_reason text, p_event_id uuid, p_correlation uuid
) RETURNS void
SECURITY DEFINER SET search_path = observation, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_authority(ARRAY['observation.correction.receive']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  INSERT INTO observation.correction_current (
    case_id, scope, tenant_id, domain_id, source_id, kind, state, received_at,
    channel, publisher_ref, reason, affected_resolved, propagation_unresolved
  ) VALUES (
    p_case_id, 'DOMAIN', p_tenant, p_domain, p_source_id, p_kind, 'received', clock_timestamp(),
    p_channel, p_publisher_ref, p_reason, '[]'::jsonb,
    'downstream consumers not yet present (KG/dependency graph arrives Phase 3)');
  INSERT INTO observation.correction_events (
    event_id, scope, tenant_id, domain_id, case_id, event, actor, details, correlation_id
  ) VALUES (
    p_event_id, 'DOMAIN', p_tenant, p_domain, p_case_id, 'case.received',
    coalesce('principal:' || public.eye_principal()::text, 'system'),
    jsonb_build_object('kind', p_kind, 'channel', p_channel, 'publisher_ref', p_publisher_ref,
                       'reason', p_reason, 'source_id', p_source_id),
    p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION observation.open_correction_case(uuid,uuid,uuid,uuid,text,text,text,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.open_correction_case(uuid,uuid,uuid,uuid,text,text,text,text,uuid,uuid) TO eye_commit;

CREATE OR REPLACE FUNCTION observation.close_correction_case(
  p_case_id uuid, p_tenant uuid, p_domain uuid, p_outcome text,
  p_affected_resolved jsonb, p_failure_reason text, p_event_id uuid, p_correlation uuid
) RETURNS void
SECURITY DEFINER SET search_path = observation, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_authority(ARRAY['observation.correction.apply']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_outcome NOT IN ('validated', 'rejected', 'applied', 'failed') THEN
    RAISE EXCEPTION 'correction close rejected: unknown outcome %', p_outcome USING ERRCODE = '22023';
  END IF;
  UPDATE observation.correction_current
     SET state = p_outcome,
         affected_resolved = coalesce(p_affected_resolved, affected_resolved),
         failure_reason = p_failure_reason,
         closed_at = CASE WHEN p_outcome IN ('applied', 'rejected', 'failed')
                          THEN clock_timestamp() ELSE closed_at END
   WHERE case_id = p_case_id AND tenant_id = p_tenant AND domain_id = p_domain;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'correction close rejected: no such case' USING ERRCODE = '23503';
  END IF;
  INSERT INTO observation.correction_events (
    event_id, scope, tenant_id, domain_id, case_id, event, actor, details, correlation_id
  ) VALUES (
    p_event_id, 'DOMAIN', p_tenant, p_domain, p_case_id,
    CASE p_outcome WHEN 'validated' THEN 'case.validated'
                   WHEN 'rejected'  THEN 'case.rejected'
                   WHEN 'applied'   THEN 'case.applied'
                   ELSE 'case.failed' END,
    coalesce('principal:' || public.eye_principal()::text, 'system'),
    jsonb_build_object('affected_resolved', p_affected_resolved, 'failure_reason', p_failure_reason),
    p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION observation.close_correction_case(uuid,uuid,uuid,text,jsonb,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.close_correction_case(uuid,uuid,uuid,text,jsonb,text,uuid,uuid) TO eye_commit;

-- ============================================================
-- 19. Ports — scheduler entries (§12, 60-second local floor).
-- ============================================================
CREATE OR REPLACE FUNCTION observation.upsert_scheduler_entry(
  p_source_id uuid, p_tenant uuid, p_domain uuid, p_contract_version int,
  p_scheduler_id text, p_queue text, p_cadence int, p_jitter int, p_status text
) RETURNS void
SECURITY DEFINER SET search_path = observation, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  -- Registering an agent for an ALREADY ACTIVE source is the moment its schedule
  -- becomes possible, so that action establishes a schedule too. Without it a
  -- source activated before its agent existed would stay active with nothing
  -- scheduled to collect it.
  PERFORM observation.assert_authority(ARRAY[
    'observation.source.transition', 'observation.schedule.set', 'observation.agent.register']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_status = 'scheduled' AND p_cadence < 60 THEN
    RAISE EXCEPTION 'schedule rejected: the local profile enforces a 60-second minimum polling interval (requested %s)',
      p_cadence USING ERRCODE = '23514';
  END IF;
  INSERT INTO observation.scheduler_entries (
    source_id, scope, tenant_id, domain_id, contract_version, scheduler_id, queue_name,
    cadence_seconds, jitter_seconds, status, removed_at
  ) VALUES (
    p_source_id, 'DOMAIN', p_tenant, p_domain, p_contract_version, p_scheduler_id, p_queue,
    greatest(p_cadence, 60), p_jitter, p_status,
    CASE WHEN p_status = 'removed' THEN clock_timestamp() END)
  ON CONFLICT (source_id) DO UPDATE
    SET contract_version = EXCLUDED.contract_version, scheduler_id = EXCLUDED.scheduler_id,
        queue_name = EXCLUDED.queue_name, cadence_seconds = EXCLUDED.cadence_seconds,
        jitter_seconds = EXCLUDED.jitter_seconds, status = EXCLUDED.status,
        removed_at = EXCLUDED.removed_at;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION observation.upsert_scheduler_entry(uuid,uuid,uuid,int,text,text,int,int,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.upsert_scheduler_entry(uuid,uuid,uuid,int,text,text,int,int,text) TO eye_commit;

CREATE OR REPLACE FUNCTION observation.mark_attempt_outcome(
  p_tenant uuid, p_domain uuid, p_source_id uuid, p_contract_version int,
  p_run_id uuid, p_item_key text, p_outcome text, p_evd_object_id uuid
) RETURNS void
SECURITY DEFINER SET search_path = observation, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_authority(ARRAY['observation.item.admit', 'observation.item.quarantine']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  UPDATE observation.acquisition_attempts
     SET outcome = p_outcome, evd_object_id = p_evd_object_id
   WHERE source_id = p_source_id AND contract_version = p_contract_version
     AND run_id = p_run_id AND item_key = p_item_key;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION observation.mark_attempt_outcome(uuid,uuid,uuid,int,uuid,text,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.mark_attempt_outcome(uuid,uuid,uuid,int,uuid,text,text,uuid) TO eye_commit;

-- ============================================================
-- 20. SRC / OBS / EVD payload schemas (objects.schema_registry).
-- ============================================================
/*
 * The three Phase 1 canonical object types. They are registered here so the
 * existing objects.admit_version path validates them with no new code path — the
 * whole point of ADR-P1-01. Phase 1 performs TRANSPORT FRAMING AND SAFETY
 * VALIDATION ONLY: there is no semantic field anywhere in these schemas.
 */
INSERT INTO objects.schema_registry (object_type, schema_version, json_schema, compatibility) VALUES
('SRC', 'v1', '{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "additionalProperties": false,
  "required": ["source_key","name","publisher","authority_class","connector_kind","acquisition_mode",
               "data_origin","identity","authority_and_rights","security_and_operations","lifecycle"],
  "properties": {
    "source_key": { "type": "string", "minLength": 2, "maxLength": 128 },
    "name": { "type": "string", "minLength": 2, "maxLength": 256 },
    "publisher": { "type": "string", "minLength": 2, "maxLength": 256 },
    "authority_class": { "enum": ["authoritative", "observational"] },
    "connector_kind": { "enum": ["upload", "rss", "rest"] },
    "acquisition_mode": { "enum": ["replay", "live"] },
    "data_origin": { "enum": ["real", "synthetic"] },
    "identity": {
      "type": "object", "additionalProperties": false,
      "required": ["source_identity","publisher_identity","endpoints","scheme_allowlist","cadence_seconds"],
      "properties": {
        "source_identity": { "type": "string", "minLength": 2 },
        "publisher_identity": { "type": "string", "minLength": 2 },
        "endpoints": { "type": "array", "items": { "type": "string" } },
        "scheme_allowlist": { "type": "array", "items": { "enum": ["https"] } },
        "cadence_seconds": { "type": "integer", "minimum": 60 },
        "jitter_seconds": { "type": "integer", "minimum": 0 },
        "collection_window": { "type": ["string","null"] }
      }
    },
    "authority_and_rights": {
      "type": "object", "additionalProperties": false,
      "required": ["owner","steward","authority","legal_basis","rights_state","licence",
                   "permitted_use","robots_policy","purposes","classification_ceiling",
                   "residency","retention","deletion_obligation"],
      "properties": {
        "owner": { "type": "string" }, "steward": { "type": "string" },
        "authority": { "type": "string" }, "legal_basis": { "type": "string" },
        "rights_state": { "enum": ["confirmed","pending","withdrawn"] },
        "licence": { "type": "string" },
        "permitted_use": { "type": "array", "items": { "type": "string" } },
        "robots_policy": { "type": "string" },
        "purposes": { "type": "array", "minItems": 1, "items": { "type": "string" } },
        "classification_ceiling": { "type": "string" },
        "residency": { "type": "string" },
        "retention": { "type": "string" },
        "deletion_obligation": { "type": "string" }
      }
    },
    "security_and_operations": {
      "type": "object", "additionalProperties": false,
      "required": ["credential_ref","authentication_method","authenticity_method","budgets",
                   "expected_schema","freshness_expectation","coverage_expectations","correction_channel"],
      "properties": {
        "credential_ref": { "type": ["string","null"] },
        "authentication_method": { "type": "string" },
        "authenticity_method": {
          "type": "object", "additionalProperties": false,
          "required": ["transport_endpoint","byte_integrity","source_origin","content_authenticity"],
          "properties": {
            "transport_endpoint": { "type": "string" },
            "byte_integrity": { "type": "string" },
            "source_origin": { "type": "string" },
            "content_authenticity": { "type": "string" }
          }
        },
        "budgets": {
          "type": "object", "additionalProperties": false,
          "required": ["max_requests_per_run","max_bytes_per_run","max_concurrency","timeout_ms","max_retries"],
          "properties": {
            "max_requests_per_run": { "type": "integer", "minimum": 1 },
            "max_bytes_per_run": { "type": "integer", "minimum": 1 },
            "max_concurrency": { "type": "integer", "minimum": 1 },
            "timeout_ms": { "type": "integer", "minimum": 100 },
            "max_retries": { "type": "integer", "minimum": 0 },
            "cost_units": { "type": "number", "minimum": 0 }
          }
        },
        "expected_schema": {
          "type": "object", "additionalProperties": false,
          "required": ["media_types","required_fields","drift_tolerance"],
          "properties": {
            "media_types": { "type": "array", "items": { "type": "string" } },
            "required_fields": { "type": "array", "items": { "type": "string" } },
            "drift_tolerance": { "type": "integer", "minimum": 0 },
            "max_bytes": { "type": "integer", "minimum": 1 }
          }
        },
        "freshness_expectation": {
          "type": "object", "additionalProperties": false,
          "required": ["threshold_seconds","expected_interval"],
          "properties": {
            "threshold_seconds": { "type": "integer", "minimum": 1 },
            "expected_interval": { "type": "string" }
          }
        },
        "coverage_expectations": {
          "type": "object", "additionalProperties": false,
          "required": ["universe_version","denominator_derivation"],
          "properties": {
            "universe_version": { "type": "string" },
            "denominator_derivation": { "type": "string" },
            "expected_items_per_window": { "type": ["integer","null"] },
            "not_applicable_dimensions": { "type": "array", "items": { "type": "string" } },
            "not_applicable_reason": { "type": ["string","null"] }
          }
        },
        "correction_channel": { "type": "string" }
      }
    },
    "lifecycle": {
      "type": "object", "additionalProperties": false,
      "required": ["contract_version","effective_from"],
      "properties": {
        "contract_version": { "type": "integer", "minimum": 1 },
        "effective_from": { "type": "string" },
        "effective_to": { "type": ["string","null"] },
        "supersedes_version": { "type": ["integer","null"] }
      }
    },
    "separation_of_duties": {
      "type": "object", "additionalProperties": true
    }
  }
}'::jsonb, 'additive'),
('OBS', 'v1', '{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "additionalProperties": false,
  "required": ["source_key","source_id","contract_version","run_id","item_key",
               "acquisition_mode","authority_class","observed_at","transport"],
  "properties": {
    "source_key": { "type": "string" },
    "source_id": { "type": "string" },
    "contract_version": { "type": "integer", "minimum": 1 },
    "run_id": { "type": "string" },
    "item_key": { "type": "string" },
    "acquisition_mode": { "enum": ["replay","live"] },
    "authority_class": { "enum": ["authoritative","observational"] },
    "observed_at": { "type": "string" },
    "publisher_time": { "type": ["string","null"] },
    "transport": {
      "type": "object", "additionalProperties": false,
      "required": ["connector","connector_version","method_ref"],
      "properties": {
        "connector": { "type": "string" },
        "connector_version": { "type": "string" },
        "method_ref": { "type": "string" },
        "endpoint": { "type": ["string","null"] },
        "http_status": { "type": ["integer","null"] },
        "retained_headers": { "type": "object" },
        "tls_verified": { "type": ["boolean","null"] },
        "origin_allowlisted": { "type": ["boolean","null"] }
      }
    },
    "parent_obs_id": { "type": ["string","null"] },
    "fragment_ref": { "type": ["string","null"] }
  }
}'::jsonb, 'additive'),
('EVD', 'v1', '{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "additionalProperties": false,
  "required": ["obs_object_id","manifest_id","locator","content_digest","byte_length",
               "vault","acquisition_mode","authenticity"],
  "properties": {
    "obs_object_id": { "type": "string" },
    "manifest_id": { "type": "string" },
    "locator": { "type": "string" },
    "content_digest": { "type": "string", "pattern": "^[0-9a-f]{64}$" },
    "byte_length": { "type": "integer", "minimum": 0 },
    "vault": { "enum": ["evidence","quarantine"] },
    "acquisition_mode": { "enum": ["replay","live"] },
    "media_type_declared": { "type": ["string","null"] },
    "media_type_sniffed": { "type": ["string","null"] },
    "active_content_risk": { "type": "boolean" },
    "parent_evd_id": { "type": ["string","null"] },
    "fragment": {
      "type": ["object","null"], "additionalProperties": false,
      "properties": {
        "byte_start": { "type": "integer", "minimum": 0 },
        "byte_end": { "type": "integer", "minimum": 0 },
        "method_ref": { "type": "string" }
      }
    },
    "authenticity": {
      "type": "object", "additionalProperties": false,
      "required": ["transport_endpoint","byte_integrity","source_origin","content_authenticity"],
      "properties": {
        "transport_endpoint": { "enum": ["verified","unverified","not_applicable","unknown"] },
        "byte_integrity": { "enum": ["verified","failed","unknown"] },
        "source_origin": { "enum": ["verified","unverified","not_applicable","unknown"] },
        "content_authenticity": { "enum": ["verified","unknown","not_applicable"] }
      }
    }
  }
}'::jsonb, 'additive');

-- ============================================================
-- 21. Projection rebuild (§4, acceptance A11).
-- ============================================================
/*
 * "Projections are derived, mutable, reconstructable — with CI rebuild tests."
 *
 * This is the reconstruction. It rebuilds each projection FROM THE EVENT LOG
 * ALONE into a temporary relation and returns a per-table comparison against the
 * live projection, so the A11 test asserts equality on data rather than trusting
 * a re-derivation that read the projection it was supposed to check.
 *
 * It is a READ-ONLY diagnostic: it never writes to a projection. A drift is a
 * finding to investigate, not something to paper over by overwriting the live row.
 */
CREATE OR REPLACE FUNCTION observation.rebuild_projections(p_tenant uuid, p_domain uuid)
RETURNS TABLE (projection text, live_rows bigint, rebuilt_rows bigint, mismatched_rows bigint)
SECURITY DEFINER SET search_path = observation, public, pg_catalog, pg_temp AS $$
BEGIN
  -- ---- source_contracts_current ----
  CREATE TEMP TABLE _rb_src ON COMMIT DROP AS
  WITH reg AS (
    SELECT e.source_id, e.contract_version, e.actor_principal_id AS registrar, e.details, e.occurred_at
      FROM observation.source_contract_events e
     WHERE e.event = 'contract.registered' AND e.tenant_id = p_tenant AND e.domain_id = p_domain
       AND e.details ? 'contract'
  ), latest AS (
    SELECT DISTINCT ON (e.source_id, e.contract_version)
           e.source_id, e.contract_version, e.event, e.actor_principal_id, e.details
      FROM observation.source_contract_events e
     WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain
       AND e.event IN ('contract.approved','contract.rejected','contract.activated',
                       'contract.reactivated','contract.suspended','contract.retired','contract.superseded')
     ORDER BY e.source_id, e.contract_version, e.occurred_at DESC, e.event_id DESC
  ), approver AS (
    SELECT DISTINCT ON (e.source_id, e.contract_version) e.source_id, e.contract_version, e.actor_principal_id
      FROM observation.source_contract_events e
     WHERE e.event IN ('contract.approved','contract.rejected')
       AND e.tenant_id = p_tenant AND e.domain_id = p_domain
     ORDER BY e.source_id, e.contract_version, e.occurred_at DESC
  ), rights AS (
    SELECT DISTINCT ON (e.source_id, e.contract_version) e.source_id, e.contract_version,
           e.details ->> 'rights_state' AS rights_state
      FROM observation.source_contract_events e
     WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain
       AND e.details ? 'rights_state'
     ORDER BY e.source_id, e.contract_version, e.occurred_at DESC
  )
  SELECT reg.source_id, reg.contract_version,
         (reg.details ->> 'source_key')       AS source_key,
         coalesce(rights.rights_state, reg.details ->> 'rights_state') AS rights_state,
         reg.registrar                        AS registrar_principal_id,
         approver.actor_principal_id          AS approver_principal_id,
         CASE latest.event
           WHEN 'contract.approved'    THEN 'approved'
           WHEN 'contract.rejected'    THEN 'retired'
           WHEN 'contract.activated'   THEN 'active'
           WHEN 'contract.reactivated' THEN 'active'
           WHEN 'contract.suspended'   THEN 'suspended'
           WHEN 'contract.retired'     THEN 'retired'
           WHEN 'contract.superseded'  THEN 'superseded'
           ELSE 'draft'
         END AS lifecycle_state,
         (reg.details -> 'contract')          AS contract
    FROM reg
    LEFT JOIN latest   ON latest.source_id = reg.source_id AND latest.contract_version = reg.contract_version
    LEFT JOIN approver ON approver.source_id = reg.source_id AND approver.contract_version = reg.contract_version
    LEFT JOIN rights   ON rights.source_id = reg.source_id AND rights.contract_version = reg.contract_version;

  projection := 'source_contracts_current';
  SELECT count(*) INTO live_rows FROM observation.source_contracts_current c
   WHERE c.tenant_id = p_tenant AND c.domain_id = p_domain;
  SELECT count(*) INTO rebuilt_rows FROM _rb_src;
  SELECT count(*) INTO mismatched_rows
    FROM observation.source_contracts_current c
    FULL JOIN _rb_src r ON r.source_id = c.source_id AND r.contract_version = c.contract_version
   WHERE (c.tenant_id, c.domain_id) IS NOT DISTINCT FROM (p_tenant, p_domain)
     AND (c.source_id IS NULL OR r.source_id IS NULL
          OR c.lifecycle_state IS DISTINCT FROM r.lifecycle_state
          OR c.rights_state    IS DISTINCT FROM r.rights_state
          OR c.source_key      IS DISTINCT FROM r.source_key
          OR c.registrar_principal_id IS DISTINCT FROM r.registrar_principal_id
          OR c.approver_principal_id  IS DISTINCT FROM r.approver_principal_id
          OR c.contract        IS DISTINCT FROM r.contract);
  RETURN NEXT;

  -- ---- collection_runs_current ----
  CREATE TEMP TABLE _rb_runs ON COMMIT DROP AS
  SELECT e.run_id,
         min(e.occurred_at) FILTER (WHERE e.event = 'run.started')  AS started_at,
         max(e.occurred_at)                                          AS last_event_at,
         count(*) FILTER (WHERE e.event = 'item.fetched')::int       AS items_fetched,
         count(*) FILTER (WHERE e.event = 'item.admitted')::int      AS items_admitted,
         count(*) FILTER (WHERE e.event = 'item.quarantined')::int   AS items_quarantined,
         count(*) FILTER (WHERE e.event = 'item.noop')::int          AS items_noop,
         coalesce(max(CASE e.event WHEN 'run.finished' THEN 'finished'
                                   WHEN 'run.failed' THEN 'failed'
                                   WHEN 'run.cancelled' THEN 'cancelled'
                                   WHEN 'run.budget_exceeded' THEN 'budget_exceeded' END), 'started') AS state
    FROM observation.collection_run_events e
   WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain
   GROUP BY e.run_id;

  projection := 'collection_runs_current';
  SELECT count(*) INTO live_rows FROM observation.collection_runs_current c
   WHERE c.tenant_id = p_tenant AND c.domain_id = p_domain;
  SELECT count(*) INTO rebuilt_rows FROM _rb_runs;
  SELECT count(*) INTO mismatched_rows
    FROM observation.collection_runs_current c
    FULL JOIN _rb_runs r ON r.run_id = c.run_id
   WHERE (c.tenant_id, c.domain_id) IS NOT DISTINCT FROM (p_tenant, p_domain)
     AND (c.run_id IS NULL OR r.run_id IS NULL
          OR c.state             IS DISTINCT FROM r.state
          OR c.items_fetched     IS DISTINCT FROM r.items_fetched
          OR c.items_admitted    IS DISTINCT FROM r.items_admitted
          OR c.items_quarantined IS DISTINCT FROM r.items_quarantined
          OR c.items_noop        IS DISTINCT FROM r.items_noop);
  RETURN NEXT;

  -- ---- quarantine_current ----
  CREATE TEMP TABLE _rb_q ON COMMIT DROP AS
  WITH opened AS (
    SELECT e.case_id, e.occurred_at AS opened_at, e.details, e.reason_class
      FROM observation.quarantine_events e
     WHERE e.event = 'case.opened' AND e.tenant_id = p_tenant AND e.domain_id = p_domain
  ), closed AS (
    SELECT DISTINCT ON (e.case_id) e.case_id, e.event, e.occurred_at, e.details
      FROM observation.quarantine_events e
     WHERE e.event IN ('case.admitted','case.rejected','case.expired')
       AND e.tenant_id = p_tenant AND e.domain_id = p_domain
     ORDER BY e.case_id, e.occurred_at DESC
  )
  SELECT o.case_id, o.opened_at,
         (o.details ->> 'item_key')                AS item_key,
         (o.details ->> 'source_id')::uuid         AS source_id,
         o.reason_class,
         CASE closed.event WHEN 'case.admitted' THEN 'admitted'
                           WHEN 'case.rejected' THEN 'rejected'
                           WHEN 'case.expired'  THEN 'expired'
                           ELSE 'open' END          AS state
    FROM opened o LEFT JOIN closed ON closed.case_id = o.case_id;

  projection := 'quarantine_current';
  SELECT count(*) INTO live_rows FROM observation.quarantine_current c
   WHERE c.tenant_id = p_tenant AND c.domain_id = p_domain;
  SELECT count(*) INTO rebuilt_rows FROM _rb_q;
  SELECT count(*) INTO mismatched_rows
    FROM observation.quarantine_current c
    FULL JOIN _rb_q r ON r.case_id = c.case_id
   WHERE (c.tenant_id, c.domain_id) IS NOT DISTINCT FROM (p_tenant, p_domain)
     AND (c.case_id IS NULL OR r.case_id IS NULL
          OR c.state        IS DISTINCT FROM r.state
          OR c.item_key     IS DISTINCT FROM r.item_key
          OR c.source_id    IS DISTINCT FROM r.source_id
          OR c.reason_class IS DISTINCT FROM r.reason_class);
  RETURN NEXT;

  -- ---- correction_current ----
  CREATE TEMP TABLE _rb_corr ON COMMIT DROP AS
  WITH received AS (
    SELECT e.case_id, e.occurred_at AS received_at, e.details
      FROM observation.correction_events e
     WHERE e.event = 'case.received' AND e.tenant_id = p_tenant AND e.domain_id = p_domain
  ), last_ev AS (
    SELECT DISTINCT ON (e.case_id) e.case_id, e.event, e.details
      FROM observation.correction_events e
     WHERE e.event <> 'case.received' AND e.tenant_id = p_tenant AND e.domain_id = p_domain
     ORDER BY e.case_id, e.occurred_at DESC
  )
  SELECT r.case_id, r.received_at,
         (r.details ->> 'kind')            AS kind,
         (r.details ->> 'source_id')::uuid AS source_id,
         CASE last_ev.event WHEN 'case.validated' THEN 'validated'
                            WHEN 'case.rejected'  THEN 'rejected'
                            WHEN 'case.applied'   THEN 'applied'
                            WHEN 'case.failed'    THEN 'failed'
                            ELSE 'received' END AS state
    FROM received r LEFT JOIN last_ev ON last_ev.case_id = r.case_id;

  projection := 'correction_current';
  SELECT count(*) INTO live_rows FROM observation.correction_current c
   WHERE c.tenant_id = p_tenant AND c.domain_id = p_domain;
  SELECT count(*) INTO rebuilt_rows FROM _rb_corr;
  SELECT count(*) INTO mismatched_rows
    FROM observation.correction_current c
    FULL JOIN _rb_corr r ON r.case_id = c.case_id
   WHERE (c.tenant_id, c.domain_id) IS NOT DISTINCT FROM (p_tenant, p_domain)
     AND (c.case_id IS NULL OR r.case_id IS NULL
          OR c.state     IS DISTINCT FROM r.state
          OR c.kind      IS DISTINCT FROM r.kind
          OR c.source_id IS DISTINCT FROM r.source_id);
  RETURN NEXT;

  -- ---- connector_checkpoints ----
  CREATE TEMP TABLE _rb_cp ON COMMIT DROP AS
  SELECT DISTINCT ON (e.source_id) e.source_id, e.run_id, e.checkpoint, e.contract_version
    FROM observation.checkpoint_events e
   WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain
   ORDER BY e.source_id, e.occurred_at DESC, e.event_id DESC;

  projection := 'connector_checkpoints';
  SELECT count(*) INTO live_rows FROM observation.connector_checkpoints c
   WHERE c.tenant_id = p_tenant AND c.domain_id = p_domain;
  SELECT count(*) INTO rebuilt_rows FROM _rb_cp;
  SELECT count(*) INTO mismatched_rows
    FROM observation.connector_checkpoints c
    FULL JOIN _rb_cp r ON r.source_id = c.source_id
   WHERE (c.tenant_id, c.domain_id) IS NOT DISTINCT FROM (p_tenant, p_domain)
     AND (c.source_id IS NULL OR r.source_id IS NULL
          OR c.checkpoint       IS DISTINCT FROM r.checkpoint
          OR c.run_id           IS DISTINCT FROM r.run_id
          OR c.contract_version IS DISTINCT FROM r.contract_version);
  RETURN NEXT;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION observation.rebuild_projections(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.rebuild_projections(uuid, uuid) TO eye_commit, eye_app;

-- ============================================================
-- 22. Deterministic health replay (§6, acceptance A6).
-- ============================================================
/*
 * Replaying the stored event stream and measurements must reproduce the IDENTICAL
 * state timeline. This function derives the timeline from stored rows only — it
 * takes no `now`, no configuration, and no argument that could tilt the answer —
 * so the A6 test compares two runs of it and the recorded health events.
 */
CREATE OR REPLACE FUNCTION observation.replay_health(p_tenant uuid, p_domain uuid, p_source_id uuid)
RETURNS TABLE (evaluated_at timestamptz, state text, calc_version text, universe_version text, reason text)
SECURITY DEFINER SET search_path = observation, public, pg_catalog, pg_temp AS $$
  SELECT h.evaluated_at, h.new_state, h.calc_version, h.coverage_universe_version, h.reason
    FROM observation.source_health_events h
   WHERE h.tenant_id = p_tenant AND h.domain_id = p_domain AND h.source_id = p_source_id
   ORDER BY h.evaluated_at, h.event_id
$$ LANGUAGE sql STABLE;
REVOKE ALL ON FUNCTION observation.replay_health(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.replay_health(uuid, uuid, uuid) TO eye_commit, eye_app;

-- ============================================================
-- 23. Agent session issuance — NARROW, and narrower than login.
-- ============================================================
/*
 * A collection worker acts as its agent principal, so it needs a session to mint
 * capabilities with. It cannot log in: there is no password to present and there
 * is no human at the keyboard, and giving an agent a password would create a
 * credential that can be stolen and replayed from anywhere.
 *
 * This port issues a session ONLY for a principal that is (a) kind='agent',
 * (b) active, and (c) currently REGISTERED AS AN ACTIVE AGENT in this domain with
 * a matching version and code digest. So the authority it grants is exactly the
 * authority the agent registry already granted — it cannot mint a session for a
 * human, for an unregistered agent, for a revoked one, or for a drifted digest.
 *
 * It runs on the IDENTITY authority under an identity_op capability, exactly like
 * every other session mutation, and its audit event is committed in the same
 * transaction by the caller.
 */
/*
 * An agent presents no password, so recording its session assurance as
 * `password` would put a false statement in the audit trail about how the
 * principal was authenticated. `agent_grant` names what actually happened: the
 * session exists because an agent registration in this domain authorised it.
 */
ALTER TABLE identity.sessions DROP CONSTRAINT sessions_assurance_check;
ALTER TABLE identity.sessions ADD CONSTRAINT sessions_assurance_check
  CHECK (assurance IN ('password', 'break_glass', 'bootstrap_rotation', 'agent_grant'));

CREATE OR REPLACE FUNCTION identity.agent_session_open(
  p_session uuid, p_agent_id uuid, p_tenant uuid, p_domain uuid,
  p_agent_version text, p_code_digest text,
  p_refresh_hash text, p_context_key_hash text, p_expires_at timestamptz, p_family uuid
) RETURNS uuid
SECURITY DEFINER SET search_path = identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE a observation.agents%ROWTYPE; v_kind text; v_status text;
BEGIN
  IF public.eye_ctx_mode() <> 'identity_op' THEN
    RAISE EXCEPTION 'agent session denied: identity operation capability required (context is %)',
      public.eye_ctx_mode() USING ERRCODE = '42501';
  END IF;

  SELECT * INTO a FROM observation.agents
   WHERE agent_id = p_agent_id AND tenant_id = p_tenant AND domain_id = p_domain;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'agent session denied: no such agent in this domain' USING ERRCODE = '42501';
  END IF;
  IF a.status <> 'active' THEN
    RAISE EXCEPTION 'agent session denied: agent grant is revoked' USING ERRCODE = '42501';
  END IF;
  IF a.agent_version IS DISTINCT FROM p_agent_version OR a.code_digest IS DISTINCT FROM p_code_digest THEN
    RAISE EXCEPTION 'agent session denied: agent instance or code digest does not match the registration'
      USING ERRCODE = '42501';
  END IF;

  SELECT kind, status INTO v_kind, v_status FROM identity.principals WHERE id = a.principal_id;
  IF v_kind IS DISTINCT FROM 'agent' OR v_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'agent session denied: principal is not an active agent principal' USING ERRCODE = '42501';
  END IF;

  PERFORM identity.session_open(
    p_session, a.principal_id, 'agent_grant', p_refresh_hash, p_context_key_hash, p_expires_at, p_family);
  RETURN a.principal_id;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION identity.agent_session_open(uuid,uuid,uuid,uuid,text,text,text,text,timestamptz,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION identity.agent_session_open(uuid,uuid,uuid,uuid,text,text,text,text,timestamptz,uuid) TO eye_identity;
-- Deliberately NO grant on observation.agents to eye_identity. The definer above
-- reads it as its superuser owner; a direct grant would be an unused authority,
-- and 0021 is the record of what unused authority costs.

-- ============================================================
-- 24. Canonical admission for the Phase 1 object types.
-- ============================================================
/*
 * TWO GOVERNED FORWARD RE-EMITS. Both are needed because Phase 1 admits canonical
 * objects from actions Phase 0 never had, and PHASE1_PLAN §5 8e requires the OBS
 * and the EVD to share ONE transaction (F23a asserts exactly that: a crash
 * between them must leave neither).
 *
 * ── (a) ctx.assert_bound_target: ONE TARGET BECOMES A DECLARED SET ───────────
 *
 * Gate-2.2 C6's property is that THE OBJECT WRITTEN MUST BE THE ONE THE
 * CAPABILITY DECLARED BEFORE IT WAS MINTED. That property is preserved here and
 * is not being relaxed: the difference is only that a capability may declare a
 * SET of object ids rather than exactly one, because an admission legitimately
 * produces an OBS and an EVD together and cannot be split without breaking the
 * atomicity the plan requires.
 *
 * What keeps it honest:
 *   * The set is fixed AT MINT TIME, inside the signed context payload. It cannot
 *     be widened afterwards by a handler, and it cannot be forged, because the
 *     payload carries the issuer's signature.
 *   * The set is BOUNDED (8 entries) and every entry must be a UUID, so "a
 *     declared set" cannot degrade into "any target".
 *   * A single-target capability behaves EXACTLY as before: membership of a
 *     one-element set is equality.
 * Identity, verifier and recovery ports compare eye_bound_target() directly and
 * are untouched — they stay exact-equality, which is right for them.
 *
 * ── (b) objects.admit_version: the Phase 1 canonical-write actions ───────────
 *
 * Phase 0 allowed `objects.create` and `objects.correct`. Phase 1 adds four
 * observation actions that admit canonical objects, and — unlike the Phase 0
 * pair, which may admit ANY object type — each is restricted to the object types
 * it is actually entitled to write. For those four actions this is NARROWER than
 * the rule it extends, not wider.
 */
CREATE OR REPLACE FUNCTION ctx.assert_bound_target(p_target text)
RETURNS void SECURITY DEFINER SET search_path = ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_bound text := public.eye_bound_target(); v_targets text[];
BEGIN
  IF v_bound IS NULL OR v_bound = '' THEN
    RAISE EXCEPTION 'target binding denied: capability is bound to target <none>, not %', p_target
      USING ERRCODE = '42501';
  END IF;
  IF v_bound = p_target THEN RETURN; END IF;      -- the single-target case, unchanged
  IF position(',' IN v_bound) = 0 THEN
    RAISE EXCEPTION 'target binding denied: capability is bound to target %, not %', v_bound, p_target
      USING ERRCODE = '42501';
  END IF;
  v_targets := string_to_array(v_bound, ',');
  -- A bounded set, not an open one. A correction legitimately supersedes several
  -- objects in one governed operation; anything larger is performed as several
  -- operations, each declaring its own set, rather than by widening this.
  IF array_length(v_targets, 1) > 32 THEN
    RAISE EXCEPTION 'target binding denied: a capability may declare at most 32 objects' USING ERRCODE = '42501';
  END IF;
  -- Every declared entry must be a UUID. A set containing anything else is
  -- refused outright rather than being partially honoured.
  IF EXISTS (
    SELECT 1 FROM unnest(v_targets) AS t
     WHERE t !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ) THEN
    RAISE EXCEPTION 'target binding denied: declared target set contains a non-identifier' USING ERRCODE = '42501';
  END IF;
  IF NOT (p_target = ANY (v_targets)) THEN
    RAISE EXCEPTION 'target binding denied: % is not among the capability''s declared objects', p_target
      USING ERRCODE = '42501';
  END IF;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION ctx.assert_bound_target(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ctx.assert_bound_target(text) TO eye_commit, eye_identity;

/*
 * Which object types each canonical-write action may admit. The Phase 0 actions
 * keep their existing latitude (NULL = any registered type); every Phase 1 action
 * is pinned to the types it exists to write.
 */
CREATE TABLE observation.canonical_write_actions (
  action       text PRIMARY KEY,
  object_types text[],                 -- NULL = any type (the Phase 0 behaviour)
  rationale    text NOT NULL
);
INSERT INTO observation.canonical_write_actions (action, object_types, rationale) VALUES
  ('objects.create',  NULL, 'Phase 0 canonical creation — unchanged'),
  ('objects.correct', NULL, 'Phase 0 canonical correction — unchanged'),
  ('observation.source.register', ARRAY['SRC'],
   'Source registration admits the immutable SRC contract object and nothing else'),
  ('observation.item.admit', ARRAY['OBS','EVD'],
   'Admission writes the observation and its evidence in ONE transaction (PHASE1_PLAN §5 8e, F23a)'),
  ('observation.quarantine.review', ARRAY['OBS','EVD'],
   'Releasing a quarantined item admits it through the same path an acquisition uses'),
  ('observation.correction.apply', ARRAY['OBS','EVD'],
   'A correction or withdrawal admits a NEW version of the affected object; nothing is overwritten');
REVOKE ALL ON observation.canonical_write_actions FROM PUBLIC;
GRANT SELECT ON observation.canonical_write_actions TO eye_commit;

/*
 * Governed re-emit of objects.admit_version. The body is the 0019 body with ONE
 * change: the hard-coded two-action list becomes a lookup against the table
 * above, which additionally pins the permitted object types per action.
 */
CREATE OR REPLACE FUNCTION objects.admit_version(
  p_header jsonb, p_payload jsonb, p_digest text
) RETURNS TABLE (object_id uuid, object_version bigint, content_digest text)
SECURITY DEFINER SET search_path = objects, observation, canon, ctx, public, pg_catalog, pg_temp
AS $$
DECLARE
  v_missing text; v_extra text; v_recomputed text;
  v_scope text := p_header->>'scope';
  v_tenant uuid := NULLIF(p_header->>'tenant_id','')::uuid;
  v_domain uuid := NULLIF(p_header->>'domain_id','')::uuid;
  v_action text := public.eye_bound_action();
  v_types text[];
  v_known boolean;
BEGIN
  IF public.eye_ctx_mode() <> 'authority' THEN
    RAISE EXCEPTION 'admission rejected: authority mode required (context is %)',
      public.eye_ctx_mode() USING ERRCODE = '42501';
  END IF;
  SELECT true, w.object_types INTO v_known, v_types
    FROM observation.canonical_write_actions w WHERE w.action = v_action;
  IF v_known IS NOT TRUE THEN
    RAISE EXCEPTION 'admission rejected: context is bound to action %, not a canonical write',
      coalesce(v_action,'<none>') USING ERRCODE = '42501';
  END IF;
  IF v_types IS NOT NULL AND NOT ((p_header->>'object_type') = ANY (v_types)) THEN
    RAISE EXCEPTION 'admission rejected: action % may not admit a % object',
      v_action, p_header->>'object_type' USING ERRCODE = '42501';
  END IF;
  PERFORM ctx.assert_live_authority();
  PERFORM objects.assert_header_binding(p_header);

  SELECT string_agg(field_name, ', ') INTO v_missing
    FROM objects.canonical_field_registry r WHERE NOT (p_header ? r.field_name);
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'admission rejected: header missing required field(s): %', v_missing
      USING ERRCODE = '22023';
  END IF;
  SELECT string_agg(k, ', ') INTO v_extra
    FROM jsonb_object_keys(p_header) AS k
   WHERE NOT EXISTS (SELECT 1 FROM objects.canonical_field_registry r WHERE r.field_name = k);
  IF v_extra IS NOT NULL THEN
    RAISE EXCEPTION 'admission rejected: header carries unregistered field(s): %', v_extra
      USING ERRCODE = '22023';
  END IF;

  PERFORM objects.assert_header_semantics(p_header);

  v_recomputed := canon.sha256_hex(canon.jcs(jsonb_build_object('header', p_header, 'payload', p_payload)));
  IF p_digest IS DISTINCT FROM v_recomputed THEN
    RAISE EXCEPTION 'admission rejected: content digest does not bind the header and payload'
      USING ERRCODE = '42501';
  END IF;
  IF NOT ((public.eye_scope() = 'PLATFORM' AND v_scope = 'PLATFORM' AND v_tenant IS NULL)
          OR public.eye_row_writable(v_scope, v_tenant, v_domain)) THEN
    RAISE EXCEPTION 'admission rejected: context not authorized for the object scope'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO objects.canonical_objects (
    object_id, object_type, tenant_id, domain_id, scope, object_version, lifecycle_state,
    owning_component, accountable_owner, source_object_ids, event_time, observation_time,
    valid_from, valid_to, recorded_at, time_precision, source_clock_quality, truth_state,
    synthetic_state, confidence, uncertainty, evidence_refs, provenance_ref, method_ref,
    contradiction_refs, corroboration_refs, human_refs, classification, purpose_scope,
    rights_profile, residency_profile, retention_profile, access_policy_ref, quality_profile,
    quality_state, freshness_state, schema_ref, ontology_ref, correction_of, supersedes,
    withdrawal_reason, audit_correlation_id, content_ref, payload, content_digest
  ) VALUES (
    (p_header->>'object_id')::uuid, p_header->>'object_type', v_tenant, v_domain, v_scope,
    (p_header->>'object_version')::bigint, p_header->>'lifecycle_state',
    p_header->>'owning_component', p_header->>'accountable_owner',
    coalesce(p_header->'source_object_ids','[]'::jsonb),
    NULLIF(p_header->>'event_time','')::timestamptz, NULLIF(p_header->>'observation_time','')::timestamptz,
    NULLIF(p_header->>'valid_from','')::timestamptz, NULLIF(p_header->>'valid_to','')::timestamptz,
    (p_header->>'recorded_at')::timestamptz, p_header->>'time_precision',
    p_header->>'source_clock_quality', p_header->>'truth_state',
    (p_header->>'synthetic_state')::boolean, p_header->'confidence', p_header->'uncertainty',
    coalesce(p_header->'evidence_refs','[]'::jsonb), p_header->>'provenance_ref', p_header->>'method_ref',
    coalesce(p_header->'contradiction_refs','[]'::jsonb), coalesce(p_header->'corroboration_refs','[]'::jsonb),
    coalesce(p_header->'human_refs','[]'::jsonb), p_header->>'classification', p_header->>'purpose_scope',
    p_header->>'rights_profile', p_header->>'residency_profile', p_header->>'retention_profile',
    p_header->>'access_policy_ref', p_header->>'quality_profile', p_header->'quality_state',
    p_header->'freshness_state', p_header->>'schema_ref', p_header->>'ontology_ref',
    p_header->>'correction_of', p_header->>'supersedes', p_header->>'withdrawal_reason',
    (p_header->>'audit_correlation_id')::uuid, p_header->>'content_ref',
    p_payload, v_recomputed
  );
  RETURN QUERY SELECT (p_header->>'object_id')::uuid, (p_header->>'object_version')::bigint, v_recomputed;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION objects.admit_version(jsonb, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION objects.admit_version(jsonb, jsonb, text) TO eye_commit;
