-- ============================================================
-- 0023 — INTELLIGENCE LAYER (L2): governed extraction into claims.
--
-- Phase 1 can prove what arrived and from whom. It says nothing about what any of
-- it MEANS, deliberately. This migration adds the machinery that turns preserved
-- bytes into attributable claims, and it inherits Phase 1's posture unchanged:
-- the scope triple is NOT NULL and CHECK-constrained, every table is under FORCE
-- ROW LEVEL SECURITY, and every write goes through a SECURITY DEFINER port that
-- asserts the caller's own bound action.
--
--   §2  extraction method registry (register → approve → activate; registrar ≠ approver)
--   §3  model gateway: the recorded-response store and the call log
--   §4  extraction runs and EXTRACTION IDENTITY (idempotency, B5)
--   §5  claim lineage down to evidence byte offsets (B1)
--   §6  human review queue (B2, B3)
--   §7  RLS
--   §8  ports
--   §9  canonical write actions + ENT/EVT/CLM/REL/ASM schemas
--   §10 projection rebuild
--
-- THE MODE IS NEVER IMPLICIT. Every gateway call, every run, every claim's lineage
-- and every receipt carries `mode` — 'replay' or 'local-live'. A recorded response
-- must never read as though a model executed, so the column is NOT NULL everywhere
-- it appears and there is no default.
-- ============================================================

CREATE SCHEMA IF NOT EXISTS intelligence;
GRANT USAGE ON SCHEMA intelligence TO eye_app, eye_commit;

-- The two Phase 2 roles. `extraction_manager` approves methods and decides review
-- cases; `extraction_agent` runs extraction and admits claims and may do NEITHER
-- of those things — an agent that could approve its own method, or clear its own
-- low-confidence output, would make the review queue decorative.
INSERT INTO identity.roles (code, scope, description) VALUES
  ('extraction_manager', 'DOMAIN',
   'Extraction manager — approves extraction methods and decides review cases. May never approve a method they registered (PHASE2_BUILD_PLAN B2).'),
  ('extraction_agent', 'DOMAIN',
   'Extraction agent — bounded extraction runs under a registered method. Cannot approve a method or decide a review case.')
ON CONFLICT (code) DO NOTHING;

/*
 * The guards are observation's, deliberately reused rather than duplicated. They
 * are generic: one asserts that the established context is bound to the action
 * this port serves, the other that the scope written is the context's own scope
 * and never an argument. Nothing about either is observation-specific, and a
 * second copy would be a second thing to keep in step.
 */

-- ============================================================
-- 2. Extraction method registry.
-- ============================================================
CREATE TABLE intelligence.method_events (
  event_id           uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  method_id          uuid NOT NULL,
  method_version     int  NOT NULL CHECK (method_version >= 1),
  event              text NOT NULL CHECK (event IN (
    'method.registered', 'method.approved', 'method.activated',
    'method.suspended', 'method.retired', 'method.rejected')),
  occurred_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  actor_principal_id uuid NOT NULL,
  details            jsonb NOT NULL DEFAULT '{}'::jsonb,
  correlation_id     uuid NOT NULL,
  CONSTRAINT mth_event_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX mth_events_method ON intelligence.method_events (method_id, method_version, occurred_at);
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON intelligence.method_events
  FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

CREATE TABLE intelligence.methods_current (
  method_id             uuid PRIMARY KEY,
  scope                 text NOT NULL,
  tenant_id             uuid NOT NULL,
  domain_id             uuid NOT NULL,
  method_key            text NOT NULL CHECK (length(method_key) BETWEEN 2 AND 128),
  name                  text NOT NULL,
  method_version        int  NOT NULL CHECK (method_version >= 1),
  lifecycle_state       text NOT NULL CHECK (lifecycle_state IN
                          ('draft', 'approved', 'active', 'suspended', 'retired')),
  -- WHAT IT READS AND WHAT IT PRODUCES.
  source_id             uuid,                    -- NULL = any source in the domain
  target_types          text[] NOT NULL CHECK (
                          array_length(target_types, 1) BETWEEN 1 AND 5
                          AND target_types <@ ARRAY['ENT','EVT','CLM','REL','ASM']),
  -- THE PIN. Every element of it is part of the extraction identity in §4, so a
  -- change to any one of them is a different extraction, not a silent re-run.
  gateway_mode          text NOT NULL CHECK (gateway_mode IN ('replay', 'local-live')),
  model_id              text NOT NULL,
  model_weights_digest  text NOT NULL CHECK (model_weights_digest ~ '^[0-9a-f]{64}$'),
  runtime_version       text NOT NULL,
  prompt_ref            text NOT NULL,
  prompt_version        text NOT NULL,
  prompt_digest         text NOT NULL CHECK (prompt_digest ~ '^[0-9a-f]{64}$'),
  decoding_config       jsonb NOT NULL,
  decoding_digest       text NOT NULL CHECK (decoding_digest ~ '^[0-9a-f]{64}$'),
  -- ABSTENTION AND REVIEW.
  confidence_floor      numeric NOT NULL CHECK (confidence_floor >= 0 AND confidence_floor <= 1),
  review_below          numeric NOT NULL CHECK (review_below >= 0 AND review_below <= 1),
  -- BUDGETS: a run that breaches one stops and escalates.
  budget_calls          int NOT NULL CHECK (budget_calls > 0),
  budget_seconds        int NOT NULL CHECK (budget_seconds > 0),
  registrar_principal_id uuid NOT NULL,
  approver_principal_id  uuid,
  owner_principal_id     uuid NOT NULL,
  registered_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at            timestamptz NOT NULL DEFAULT clock_timestamp(),
  -- SEPARATION OF DUTIES, as a constraint rather than a disabled button.
  CONSTRAINT mth_separation_of_duties CHECK (
    approver_principal_id IS NULL OR approver_principal_id <> registrar_principal_id),
  CONSTRAINT mth_active_requires_approval CHECK (
    lifecycle_state IN ('draft', 'rejected') OR approver_principal_id IS NOT NULL),
  CONSTRAINT mth_review_at_or_above_floor CHECK (review_below >= confidence_floor),
  CONSTRAINT mth_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE UNIQUE INDEX mth_key_unique ON intelligence.methods_current (tenant_id, domain_id, method_key);
CREATE INDEX mth_state ON intelligence.methods_current (lifecycle_state, updated_at DESC);

-- ============================================================
-- 3. Model gateway — the recorded-response store and the call log.
-- ============================================================
/*
 * The replay store. A recorded response is keyed by the REQUEST DIGEST, so a
 * replay is a lookup of the exact bytes that were recorded for exactly this
 * request — not a fuzzy match, and not a cache that could serve a near-miss.
 */
CREATE TABLE intelligence.recorded_responses (
  request_digest   text NOT NULL CHECK (request_digest ~ '^[0-9a-f]{64}$'),
  scope            text NOT NULL,
  tenant_id        uuid NOT NULL,
  domain_id        uuid NOT NULL,
  response         jsonb NOT NULL,
  response_digest  text NOT NULL CHECK (response_digest ~ '^[0-9a-f]{64}$'),
  model_id         text NOT NULL,
  runtime_version  text NOT NULL,
  recorded_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  recorded_from    text NOT NULL CHECK (recorded_from IN ('local-live', 'fixture')),
  correlation_id   uuid NOT NULL,
  PRIMARY KEY (tenant_id, domain_id, request_digest),
  CONSTRAINT rec_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON intelligence.recorded_responses
  FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

CREATE TABLE intelligence.gateway_calls (
  call_id              uuid PRIMARY KEY,
  scope                text NOT NULL,
  tenant_id            uuid NOT NULL,
  domain_id            uuid NOT NULL,
  run_id               uuid,
  method_id            uuid NOT NULL,
  -- NOT NULL, no default: a call that cannot say which mode produced it is not a
  -- record of anything.
  mode                 text NOT NULL CHECK (mode IN ('replay', 'local-live')),
  request_digest       text NOT NULL CHECK (request_digest ~ '^[0-9a-f]{64}$'),
  response_digest      text CHECK (response_digest IS NULL OR response_digest ~ '^[0-9a-f]{64}$'),
  model_id             text NOT NULL,
  model_weights_digest text NOT NULL,
  runtime_version      text NOT NULL,
  prompt_version       text NOT NULL,
  decoding_digest      text NOT NULL,
  -- ABSTENTION IS AN OUTCOME, not an error and not an empty result.
  outcome              text NOT NULL CHECK (outcome IN
                         ('completed', 'abstained', 'refused', 'failed')),
  latency_ms           int NOT NULL CHECK (latency_ms >= 0),
  occurred_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  detail               jsonb NOT NULL DEFAULT '{}'::jsonb,
  correlation_id       uuid NOT NULL,
  CONSTRAINT gw_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT gw_completed_has_response CHECK (outcome <> 'completed' OR response_digest IS NOT NULL)
);
CREATE INDEX gw_calls_run ON intelligence.gateway_calls (run_id, occurred_at);
CREATE INDEX gw_calls_method ON intelligence.gateway_calls (method_id, occurred_at DESC);
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON intelligence.gateway_calls
  FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

-- ============================================================
-- 4. Extraction runs, and EXTRACTION IDENTITY.
-- ============================================================
CREATE TABLE intelligence.run_events (
  event_id           uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  run_id             uuid NOT NULL,
  method_id          uuid NOT NULL,
  event              text NOT NULL CHECK (event IN (
    'run.started', 'run.extracted', 'run.abstained', 'run.idempotent',
    'run.budget_exceeded', 'run.failed', 'run.finished')),
  occurred_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  actor_principal_id uuid NOT NULL,
  mode               text NOT NULL CHECK (mode IN ('replay', 'local-live')),
  details            jsonb NOT NULL DEFAULT '{}'::jsonb,
  correlation_id     uuid NOT NULL,
  CONSTRAINT run_event_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX run_events_run ON intelligence.run_events (run_id, occurred_at);
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON intelligence.run_events
  FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

CREATE TABLE intelligence.runs_current (
  run_id             uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  method_id          uuid NOT NULL,
  method_version     int  NOT NULL,
  agent_principal_id uuid NOT NULL,
  mode               text NOT NULL CHECK (mode IN ('replay', 'local-live')),
  state              text NOT NULL CHECK (state IN
                       ('running', 'completed', 'failed', 'budget_exceeded')),
  started_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  finished_at        timestamptz,
  evidence_read      int NOT NULL DEFAULT 0,
  claims_admitted    int NOT NULL DEFAULT 0,
  abstentions        int NOT NULL DEFAULT 0,
  idempotent_hits    int NOT NULL DEFAULT 0,
  calls_used         int NOT NULL DEFAULT 0,
  failure_reason     text,
  correlation_id     uuid NOT NULL,
  CONSTRAINT runc_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX runs_method ON intelligence.runs_current (method_id, started_at DESC);

/*
 * EXTRACTION IDENTITY — the B5 contract.
 *
 * An extraction's identity is the digest of the evidence it read together with the
 * digests of the method, model, prompt and decoding configuration that read it.
 * Repeating that identity is IDEMPOTENT: the port returns what was recorded and
 * the model is not called again.
 *
 * A deliberately requested NEW LIVE ATTEMPT is a different row — `attempt_ordinal`
 * increments — so two live executions of the same identity are both visible and
 * neither overwrites the other. This table therefore does NOT claim that separate
 * live executions agree; it makes their disagreement recorded rather than silent.
 */
CREATE TABLE intelligence.extraction_attempts (
  attempt_id          uuid PRIMARY KEY,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  extraction_identity text NOT NULL CHECK (extraction_identity ~ '^[0-9a-f]{64}$'),
  attempt_ordinal     int  NOT NULL CHECK (attempt_ordinal >= 1),
  run_id              uuid NOT NULL,
  method_id           uuid NOT NULL,
  evidence_object_id  uuid NOT NULL,
  evidence_digest     text NOT NULL CHECK (evidence_digest ~ '^[0-9a-f]{64}$'),
  mode                text NOT NULL CHECK (mode IN ('replay', 'local-live')),
  call_id             uuid,
  result_digest       text CHECK (result_digest IS NULL OR result_digest ~ '^[0-9a-f]{64}$'),
  claim_object_ids    uuid[] NOT NULL DEFAULT '{}',
  outcome             text NOT NULL CHECK (outcome IN ('admitted', 'abstained', 'failed')),
  recorded_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id      uuid NOT NULL,
  CONSTRAINT att_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE UNIQUE INDEX att_identity_ordinal
  ON intelligence.extraction_attempts (tenant_id, domain_id, extraction_identity, attempt_ordinal);
CREATE INDEX att_identity ON intelligence.extraction_attempts (tenant_id, domain_id, extraction_identity);
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON intelligence.extraction_attempts
  FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

-- ============================================================
-- 5. Claim lineage — down to the evidence bytes (B1).
-- ============================================================
/*
 * A claim that cannot say which bytes it came from is not admitted. The lineage
 * row is written in the SAME transaction as the canonical claim object, and it
 * names the evidence object, its digest, the byte span the extraction read, the
 * gateway call that produced it and the mode that call ran in.
 */
CREATE TABLE intelligence.claim_lineage (
  claim_object_id    uuid NOT NULL,
  claim_version      bigint NOT NULL,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  claim_type         text NOT NULL CHECK (claim_type IN ('ENT','EVT','CLM','REL','ASM')),
  run_id             uuid NOT NULL,
  method_id          uuid NOT NULL,
  call_id            uuid,
  mode               text NOT NULL CHECK (mode IN ('replay', 'local-live')),
  evidence_object_id uuid NOT NULL,
  evidence_digest    text NOT NULL CHECK (evidence_digest ~ '^[0-9a-f]{64}$'),
  byte_start         int NOT NULL CHECK (byte_start >= 0),
  byte_end           int NOT NULL CHECK (byte_end >= byte_start),
  confidence         numeric NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  recorded_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  PRIMARY KEY (claim_object_id, claim_version),
  CONSTRAINT lin_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX lin_evidence ON intelligence.claim_lineage (evidence_object_id);
CREATE INDEX lin_run ON intelligence.claim_lineage (run_id);
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON intelligence.claim_lineage
  FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

-- ============================================================
-- 6. Human review queue (B2, B3).
-- ============================================================
CREATE TABLE intelligence.review_events (
  event_id           uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  case_id            uuid NOT NULL,
  event              text NOT NULL CHECK (event IN (
    'case.queued', 'case.approved', 'case.corrected', 'case.rejected')),
  occurred_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  actor_principal_id uuid NOT NULL,
  details            jsonb NOT NULL DEFAULT '{}'::jsonb,
  correlation_id     uuid NOT NULL,
  CONSTRAINT rev_event_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX rev_events_case ON intelligence.review_events (case_id, occurred_at);
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON intelligence.review_events
  FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

CREATE TABLE intelligence.review_current (
  case_id              uuid PRIMARY KEY,
  scope                text NOT NULL,
  tenant_id            uuid NOT NULL,
  domain_id            uuid NOT NULL,
  claim_object_id      uuid,                 -- NULL for an abstention with no claim
  claim_version        bigint,
  run_id               uuid NOT NULL,
  method_id            uuid NOT NULL,
  -- WHY it is here. An abstention is its own reason, never rendered as absence.
  queued_reason        text NOT NULL CHECK (queued_reason IN
                         ('below_review_threshold', 'abstained', 'method_flagged')),
  confidence           numeric CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  state                text NOT NULL CHECK (state IN ('queued', 'approved', 'corrected', 'rejected')),
  opened_at            timestamptz NOT NULL DEFAULT clock_timestamp(),
  decided_at           timestamptz,
  decider_principal_id uuid,
  decision_reason      text,
  superseded_to_version bigint,
  correlation_id       uuid NOT NULL,
  CONSTRAINT revc_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT revc_decided_has_decider CHECK (
    state = 'queued' OR (decider_principal_id IS NOT NULL AND decision_reason IS NOT NULL)),
  CONSTRAINT revc_abstention_has_no_claim CHECK (
    queued_reason <> 'abstained' OR claim_object_id IS NULL)
);
CREATE INDEX revc_queue ON intelligence.review_current (state, confidence NULLS FIRST, opened_at);
CREATE INDEX revc_claim ON intelligence.review_current (claim_object_id);

-- ============================================================
-- 7. Row-level security on every table in the schema.
-- ============================================================
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'method_events', 'methods_current', 'recorded_responses', 'gateway_calls',
    'run_events', 'runs_current', 'extraction_attempts', 'claim_lineage',
    'review_events', 'review_current'
  ] LOOP
    EXECUTE format('ALTER TABLE intelligence.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE intelligence.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY intelligence_isolation ON intelligence.%I
        USING (
          tenant_id = public.eye_tenant()
          AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain())
        )$f$, t);
    EXECUTE format('GRANT SELECT ON intelligence.%I TO eye_app, eye_commit', t);
  END LOOP;
END $$;

-- ============================================================
-- 8. Ports. Every write to this schema goes through one of these, and each
--    asserts the caller's OWN bound action before it touches a row.
-- ============================================================

CREATE OR REPLACE FUNCTION intelligence.register_method(
  p_method_id uuid, p_tenant uuid, p_domain uuid, p_registrar uuid, p_owner uuid,
  p_method_key text, p_name text, p_source_id uuid, p_target_types text[],
  p_gateway_mode text, p_model_id text, p_weights_digest text, p_runtime_version text,
  p_prompt_ref text, p_prompt_version text, p_prompt_digest text,
  p_decoding jsonb, p_decoding_digest text,
  p_confidence_floor numeric, p_review_below numeric,
  p_budget_calls int, p_budget_seconds int, p_event_id uuid, p_correlation uuid
) RETURNS void
SECURITY DEFINER SET search_path = intelligence, observation, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_authority(ARRAY['intelligence.method.register']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  INSERT INTO intelligence.methods_current (
    method_id, scope, tenant_id, domain_id, method_key, name, method_version,
    lifecycle_state, source_id, target_types, gateway_mode, model_id,
    model_weights_digest, runtime_version, prompt_ref, prompt_version, prompt_digest,
    decoding_config, decoding_digest, confidence_floor, review_below,
    budget_calls, budget_seconds, registrar_principal_id, owner_principal_id
  ) VALUES (
    p_method_id, 'DOMAIN', p_tenant, p_domain, p_method_key, p_name, 1,
    'draft', p_source_id, p_target_types, p_gateway_mode, p_model_id,
    p_weights_digest, p_runtime_version, p_prompt_ref, p_prompt_version, p_prompt_digest,
    p_decoding, p_decoding_digest, p_confidence_floor, p_review_below,
    p_budget_calls, p_budget_seconds, p_registrar, p_owner);
  INSERT INTO intelligence.method_events (
    event_id, scope, tenant_id, domain_id, method_id, method_version, event,
    actor_principal_id, details, correlation_id
  ) VALUES (
    p_event_id, 'DOMAIN', p_tenant, p_domain, p_method_id, 1, 'method.registered',
    p_registrar,
    jsonb_build_object('method_key', p_method_key, 'mode', p_gateway_mode,
                       'model_id', p_model_id, 'prompt_version', p_prompt_version),
    p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION intelligence.register_method(uuid,uuid,uuid,uuid,uuid,text,text,uuid,text[],text,text,text,text,text,text,text,jsonb,text,numeric,numeric,int,int,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION intelligence.register_method(uuid,uuid,uuid,uuid,uuid,text,text,uuid,text[],text,text,text,text,text,text,text,jsonb,text,numeric,numeric,int,int,uuid,uuid) TO eye_commit;

/*
 * Approval. The separation-of-duties CHECK is what actually stops a registrar
 * approving their own method; this port raises the honest error before the
 * constraint would, so the refusal says WHY rather than surfacing a constraint name.
 */
CREATE OR REPLACE FUNCTION intelligence.approve_method(
  p_method_id uuid, p_tenant uuid, p_domain uuid, p_approver uuid, p_reason text,
  p_event_id uuid, p_correlation uuid
) RETURNS void
SECURITY DEFINER SET search_path = intelligence, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_registrar uuid; v_state text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['intelligence.method.approve']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT registrar_principal_id, lifecycle_state INTO v_registrar, v_state
    FROM intelligence.methods_current WHERE method_id = p_method_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'method approval rejected: no such method' USING ERRCODE = '23503';
  END IF;
  IF v_state <> 'draft' THEN
    RAISE EXCEPTION 'method approval rejected: method is %, not draft', v_state USING ERRCODE = '22023';
  END IF;
  IF v_registrar = p_approver THEN
    RAISE EXCEPTION 'method approval rejected: the registrar may not approve their own method'
      USING ERRCODE = '42501';
  END IF;
  UPDATE intelligence.methods_current
     SET lifecycle_state = 'approved', approver_principal_id = p_approver,
         updated_at = clock_timestamp()
   WHERE method_id = p_method_id;
  INSERT INTO intelligence.method_events (
    event_id, scope, tenant_id, domain_id, method_id, method_version, event,
    actor_principal_id, details, correlation_id
  ) VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_method_id, 1, 'method.approved',
            p_approver, jsonb_build_object('reason', p_reason), p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION intelligence.approve_method(uuid,uuid,uuid,uuid,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION intelligence.approve_method(uuid,uuid,uuid,uuid,text,uuid,uuid) TO eye_commit;

CREATE OR REPLACE FUNCTION intelligence.transition_method(
  p_method_id uuid, p_tenant uuid, p_domain uuid, p_to text, p_actor uuid, p_reason text,
  p_event_id uuid, p_correlation uuid
) RETURNS void
SECURITY DEFINER SET search_path = intelligence, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_state text; v_event text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['intelligence.method.activate']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT lifecycle_state INTO v_state FROM intelligence.methods_current
   WHERE method_id = p_method_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'method transition rejected: no such method' USING ERRCODE = '23503';
  END IF;
  v_event := CASE p_to WHEN 'active' THEN 'method.activated'
                       WHEN 'suspended' THEN 'method.suspended'
                       WHEN 'retired' THEN 'method.retired' END;
  IF v_event IS NULL THEN
    RAISE EXCEPTION 'method transition rejected: % is not a reachable state', p_to USING ERRCODE = '22023';
  END IF;
  IF p_to = 'active' AND v_state <> 'approved' AND v_state <> 'suspended' THEN
    RAISE EXCEPTION 'method transition rejected: % cannot become active', v_state USING ERRCODE = '22023';
  END IF;
  UPDATE intelligence.methods_current
     SET lifecycle_state = p_to, updated_at = clock_timestamp() WHERE method_id = p_method_id;
  INSERT INTO intelligence.method_events (
    event_id, scope, tenant_id, domain_id, method_id, method_version, event,
    actor_principal_id, details, correlation_id
  ) VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_method_id, 1, v_event,
            p_actor, jsonb_build_object('reason', p_reason, 'from', v_state), p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION intelligence.transition_method(uuid,uuid,uuid,text,uuid,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION intelligence.transition_method(uuid,uuid,uuid,text,uuid,text,uuid,uuid) TO eye_commit;

/*
 * The run lifecycle. `lock_active_method` is the extraction counterpart of §5's
 * contract re-read: it takes a FOR SHARE lock on the method row inside the
 * admitting transaction, so a method cannot be suspended between the check and
 * the write.
 */
CREATE OR REPLACE FUNCTION intelligence.lock_active_method(
  p_method_id uuid, p_tenant uuid, p_domain uuid
) RETURNS TABLE (
  method_key text, method_version int, gateway_mode text, model_id text,
  model_weights_digest text, runtime_version text, prompt_ref text, prompt_version text,
  prompt_digest text, decoding_digest text, confidence_floor numeric, review_below numeric,
  budget_calls int, budget_seconds int, target_types text[], source_id uuid
)
SECURITY DEFINER SET search_path = intelligence, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_state text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['intelligence.run.start', 'intelligence.claim.admit']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT m.lifecycle_state INTO v_state FROM intelligence.methods_current m
   WHERE m.method_id = p_method_id FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'extraction rejected: no such method' USING ERRCODE = '23503';
  END IF;
  IF v_state <> 'active' THEN
    RAISE EXCEPTION 'extraction rejected: method is %, not active', v_state USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT m.method_key, m.method_version, m.gateway_mode, m.model_id,
           m.model_weights_digest, m.runtime_version, m.prompt_ref, m.prompt_version,
           m.prompt_digest, m.decoding_digest, m.confidence_floor, m.review_below,
           m.budget_calls, m.budget_seconds, m.target_types, m.source_id
      FROM intelligence.methods_current m WHERE m.method_id = p_method_id;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION intelligence.lock_active_method(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION intelligence.lock_active_method(uuid,uuid,uuid) TO eye_commit;

CREATE OR REPLACE FUNCTION intelligence.start_run(
  p_run_id uuid, p_tenant uuid, p_domain uuid, p_method_id uuid, p_method_version int,
  p_agent uuid, p_mode text, p_event_id uuid, p_correlation uuid
) RETURNS void
SECURITY DEFINER SET search_path = intelligence, observation, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_authority(ARRAY['intelligence.run.start']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  INSERT INTO intelligence.runs_current (
    run_id, scope, tenant_id, domain_id, method_id, method_version, agent_principal_id,
    mode, state, correlation_id
  ) VALUES (p_run_id, 'DOMAIN', p_tenant, p_domain, p_method_id, p_method_version,
            p_agent, p_mode, 'running', p_correlation);
  INSERT INTO intelligence.run_events (
    event_id, scope, tenant_id, domain_id, run_id, method_id, event,
    actor_principal_id, mode, details, correlation_id
  ) VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_run_id, p_method_id, 'run.started',
            p_agent, p_mode, '{}'::jsonb, p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION intelligence.start_run(uuid,uuid,uuid,uuid,int,uuid,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION intelligence.start_run(uuid,uuid,uuid,uuid,int,uuid,text,uuid,uuid) TO eye_commit;

CREATE OR REPLACE FUNCTION intelligence.finish_run(
  p_run_id uuid, p_tenant uuid, p_domain uuid, p_state text, p_failure text,
  p_evidence_read int, p_claims int, p_abstentions int, p_idempotent int, p_calls int,
  p_actor uuid, p_mode text, p_event_id uuid, p_correlation uuid
) RETURNS void
SECURITY DEFINER SET search_path = intelligence, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_event text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['intelligence.run.finish']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  v_event := CASE p_state WHEN 'completed' THEN 'run.finished'
                          WHEN 'budget_exceeded' THEN 'run.budget_exceeded'
                          ELSE 'run.failed' END;
  UPDATE intelligence.runs_current
     SET state = p_state, finished_at = clock_timestamp(), failure_reason = p_failure,
         evidence_read = p_evidence_read, claims_admitted = p_claims,
         abstentions = p_abstentions, idempotent_hits = p_idempotent, calls_used = p_calls
   WHERE run_id = p_run_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'run finish rejected: no such run' USING ERRCODE = '23503';
  END IF;
  INSERT INTO intelligence.run_events (
    event_id, scope, tenant_id, domain_id, run_id,
    method_id, event, actor_principal_id, mode, details, correlation_id
  ) SELECT p_event_id, 'DOMAIN', p_tenant, p_domain, p_run_id, r.method_id, v_event,
           p_actor, p_mode,
           jsonb_build_object('claims', p_claims, 'abstentions', p_abstentions,
                              'idempotent', p_idempotent, 'calls', p_calls,
                              'failure', p_failure),
           p_correlation
      FROM intelligence.runs_current r WHERE r.run_id = p_run_id;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION intelligence.finish_run(uuid,uuid,uuid,text,text,int,int,int,int,int,uuid,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION intelligence.finish_run(uuid,uuid,uuid,text,text,int,int,int,int,int,uuid,text,uuid,uuid) TO eye_commit;

/*
 * THE IDEMPOTENCY PORT (B5).
 *
 * Given an extraction identity, this returns the recorded attempt if one exists
 * and `new_attempt` is false. The caller does not decide whether to call the model
 * — the database does, from what it already holds.
 */
CREATE OR REPLACE FUNCTION intelligence.claim_extraction(
  p_tenant uuid, p_domain uuid, p_identity text, p_new_attempt boolean
) RETURNS TABLE (
  decision text, attempt_ordinal int, prior_result_digest text,
  prior_claim_ids uuid[], prior_outcome text
)
SECURITY DEFINER SET search_path = intelligence, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_prior record; v_max int;
BEGIN
  PERFORM observation.assert_authority(ARRAY['intelligence.claim.admit']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  -- The HIGHEST ordinal, whatever its outcome, is what the next attempt counts from.
  SELECT max(a.attempt_ordinal) INTO v_max
    FROM intelligence.extraction_attempts a
   WHERE a.tenant_id = p_tenant AND a.domain_id = p_domain
     AND a.extraction_identity = p_identity;
  v_max := coalesce(v_max, 0);

  /*
   * A FAILED ATTEMPT IS NOT A RESULT.
   *
   * Idempotency stands in for work already done, and a failure is not work done:
   * a replay miss, a refused response or an unreachable model must not become a
   * permanent answer that no later run can get past. So only an attempt that
   * ADMITTED claims or recorded an ABSTENTION — both of which are real outcomes
   * the model produced — makes the identity idempotent. The failed attempts stay
   * in the table and stay visible; they simply do not answer for the identity.
   */
  SELECT a.attempt_ordinal, a.result_digest, a.claim_object_ids, a.outcome INTO v_prior
    FROM intelligence.extraction_attempts a
   WHERE a.tenant_id = p_tenant AND a.domain_id = p_domain
     AND a.extraction_identity = p_identity
     AND a.outcome IN ('admitted', 'abstained')
   ORDER BY a.attempt_ordinal DESC LIMIT 1;
  IF FOUND AND NOT p_new_attempt THEN
    -- IDEMPOTENT: return what was recorded. The model is not called again.
    RETURN QUERY SELECT 'idempotent'::text, v_prior.attempt_ordinal, v_prior.result_digest,
                        v_prior.claim_object_ids, v_prior.outcome;
    RETURN;
  END IF;
  RETURN QUERY SELECT 'proceed'::text, v_max + 1, NULL::text, NULL::uuid[], NULL::text;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION intelligence.claim_extraction(uuid,uuid,text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION intelligence.claim_extraction(uuid,uuid,text,boolean) TO eye_commit;

CREATE OR REPLACE FUNCTION intelligence.record_attempt(
  p_attempt_id uuid, p_tenant uuid, p_domain uuid, p_identity text, p_ordinal int,
  p_run_id uuid, p_method_id uuid, p_evidence_object uuid, p_evidence_digest text,
  p_mode text, p_call_id uuid, p_result_digest text, p_claim_ids uuid[], p_outcome text,
  p_correlation uuid
) RETURNS void
SECURITY DEFINER SET search_path = intelligence, observation, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_authority(ARRAY['intelligence.claim.admit']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  INSERT INTO intelligence.extraction_attempts (
    attempt_id, scope, tenant_id, domain_id, extraction_identity, attempt_ordinal,
    run_id, method_id, evidence_object_id, evidence_digest, mode, call_id,
    result_digest, claim_object_ids, outcome, correlation_id
  ) VALUES (
    p_attempt_id, 'DOMAIN', p_tenant, p_domain, p_identity, p_ordinal,
    p_run_id, p_method_id, p_evidence_object, p_evidence_digest, p_mode, p_call_id,
    p_result_digest, coalesce(p_claim_ids, '{}'), p_outcome, p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION intelligence.record_attempt(uuid,uuid,uuid,text,int,uuid,uuid,uuid,text,text,uuid,text,uuid[],text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION intelligence.record_attempt(uuid,uuid,uuid,text,int,uuid,uuid,uuid,text,text,uuid,text,uuid[],text,uuid) TO eye_commit;

CREATE OR REPLACE FUNCTION intelligence.record_gateway_call(
  p_call_id uuid, p_tenant uuid, p_domain uuid, p_run_id uuid, p_method_id uuid,
  p_mode text, p_request_digest text, p_response_digest text, p_model_id text,
  p_weights text, p_runtime text, p_prompt_version text, p_decoding text,
  p_outcome text, p_latency int, p_detail jsonb, p_correlation uuid
) RETURNS void
SECURITY DEFINER SET search_path = intelligence, observation, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_authority(ARRAY['intelligence.claim.admit', 'intelligence.gateway.call']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  INSERT INTO intelligence.gateway_calls (
    call_id, scope, tenant_id, domain_id, run_id, method_id, mode, request_digest,
    response_digest, model_id, model_weights_digest, runtime_version, prompt_version,
    decoding_digest, outcome, latency_ms, detail, correlation_id
  ) VALUES (
    p_call_id, 'DOMAIN', p_tenant, p_domain, p_run_id, p_method_id, p_mode, p_request_digest,
    p_response_digest, p_model_id, p_weights, p_runtime, p_prompt_version,
    p_decoding, p_outcome, p_latency, coalesce(p_detail, '{}'::jsonb), p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION intelligence.record_gateway_call(uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,text,text,text,int,jsonb,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION intelligence.record_gateway_call(uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,text,text,text,int,jsonb,uuid) TO eye_commit;

CREATE OR REPLACE FUNCTION intelligence.record_response(
  p_tenant uuid, p_domain uuid, p_request_digest text, p_response jsonb,
  p_response_digest text, p_model_id text, p_runtime text, p_from text, p_correlation uuid
) RETURNS boolean
SECURITY DEFINER SET search_path = intelligence, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE n int;
BEGIN
  PERFORM observation.assert_authority(ARRAY['intelligence.claim.admit', 'intelligence.gateway.call']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  INSERT INTO intelligence.recorded_responses (
    request_digest, scope, tenant_id, domain_id, response, response_digest,
    model_id, runtime_version, recorded_from, correlation_id
  ) VALUES (
    p_request_digest, 'DOMAIN', p_tenant, p_domain, p_response, p_response_digest,
    p_model_id, p_runtime, p_from, p_correlation)
  ON CONFLICT (tenant_id, domain_id, request_digest) DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n = 1;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION intelligence.record_response(uuid,uuid,text,jsonb,text,text,text,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION intelligence.record_response(uuid,uuid,text,jsonb,text,text,text,text,uuid) TO eye_commit;

CREATE OR REPLACE FUNCTION intelligence.record_lineage(
  p_claim uuid, p_version bigint, p_tenant uuid, p_domain uuid, p_claim_type text,
  p_run_id uuid, p_method_id uuid, p_call_id uuid, p_mode text,
  p_evidence uuid, p_evidence_digest text, p_start int, p_end int,
  p_confidence numeric, p_correlation uuid
) RETURNS void
SECURITY DEFINER SET search_path = intelligence, observation, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_authority(ARRAY['intelligence.claim.admit', 'intelligence.review.decide']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  INSERT INTO intelligence.claim_lineage (
    claim_object_id, claim_version, scope, tenant_id, domain_id, claim_type, run_id,
    method_id, call_id, mode, evidence_object_id, evidence_digest, byte_start, byte_end,
    confidence, correlation_id
  ) VALUES (
    p_claim, p_version, 'DOMAIN', p_tenant, p_domain, p_claim_type, p_run_id,
    p_method_id, p_call_id, p_mode, p_evidence, p_evidence_digest, p_start, p_end,
    p_confidence, p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION intelligence.record_lineage(uuid,bigint,uuid,uuid,text,uuid,uuid,uuid,text,uuid,text,int,int,numeric,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION intelligence.record_lineage(uuid,bigint,uuid,uuid,text,uuid,uuid,uuid,text,uuid,text,int,int,numeric,uuid) TO eye_commit;

CREATE OR REPLACE FUNCTION intelligence.queue_review(
  p_case_id uuid, p_tenant uuid, p_domain uuid, p_claim uuid, p_version bigint,
  p_run_id uuid, p_method_id uuid, p_reason text, p_confidence numeric,
  p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS void
SECURITY DEFINER SET search_path = intelligence, observation, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_authority(ARRAY['intelligence.claim.admit']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  INSERT INTO intelligence.review_current (
    case_id, scope, tenant_id, domain_id, claim_object_id, claim_version, run_id,
    method_id, queued_reason, confidence, state, correlation_id
  ) VALUES (
    p_case_id, 'DOMAIN', p_tenant, p_domain, p_claim, p_version, p_run_id,
    p_method_id, p_reason, p_confidence, 'queued', p_correlation);
  INSERT INTO intelligence.review_events (
    event_id, scope, tenant_id, domain_id, case_id, event, actor_principal_id,
    details, correlation_id
  ) VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_case_id, 'case.queued', p_actor,
            jsonb_build_object('reason', p_reason, 'confidence', p_confidence), p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION intelligence.queue_review(uuid,uuid,uuid,uuid,bigint,uuid,uuid,text,numeric,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION intelligence.queue_review(uuid,uuid,uuid,uuid,bigint,uuid,uuid,text,numeric,uuid,uuid,uuid) TO eye_commit;

/*
 * The review decision. A case may only be decided by someone who is not the agent
 * that produced it, the decision needs a reason, and a decided case cannot be
 * decided again — the reviewer's judgement is a record, not a toggle.
 */
CREATE OR REPLACE FUNCTION intelligence.decide_review(
  p_case_id uuid, p_tenant uuid, p_domain uuid, p_state text, p_decider uuid,
  p_reason text, p_superseded_to bigint, p_event_id uuid, p_correlation uuid
) RETURNS void
SECURITY DEFINER SET search_path = intelligence, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_state text; v_agent uuid; v_event text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['intelligence.review.decide']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN
    RAISE EXCEPTION 'review decision rejected: a decision needs a reason of at least 8 characters'
      USING ERRCODE = '22023';
  END IF;
  SELECT c.state, r.agent_principal_id INTO v_state, v_agent
    FROM intelligence.review_current c
    JOIN intelligence.runs_current r ON r.run_id = c.run_id
   WHERE c.case_id = p_case_id FOR UPDATE OF c;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'review decision rejected: no such case' USING ERRCODE = '23503';
  END IF;
  IF v_state <> 'queued' THEN
    RAISE EXCEPTION 'review decision rejected: case is already %', v_state USING ERRCODE = '22023';
  END IF;
  IF v_agent = p_decider THEN
    RAISE EXCEPTION 'review decision rejected: the agent that produced this output may not decide it'
      USING ERRCODE = '42501';
  END IF;
  v_event := CASE p_state WHEN 'approved' THEN 'case.approved'
                          WHEN 'corrected' THEN 'case.corrected'
                          WHEN 'rejected' THEN 'case.rejected' END;
  IF v_event IS NULL THEN
    RAISE EXCEPTION 'review decision rejected: % is not a decision', p_state USING ERRCODE = '22023';
  END IF;
  UPDATE intelligence.review_current
     SET state = p_state, decided_at = clock_timestamp(), decider_principal_id = p_decider,
         decision_reason = p_reason, superseded_to_version = p_superseded_to
   WHERE case_id = p_case_id;
  INSERT INTO intelligence.review_events (
    event_id, scope, tenant_id, domain_id, case_id, event, actor_principal_id,
    details, correlation_id
  ) VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_case_id, v_event, p_decider,
            jsonb_build_object('reason', p_reason, 'superseded_to', p_superseded_to), p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION intelligence.decide_review(uuid,uuid,uuid,text,uuid,text,bigint,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION intelligence.decide_review(uuid,uuid,uuid,text,uuid,text,bigint,uuid,uuid) TO eye_commit;

-- ============================================================
-- 9. Canonical write actions and the ENT/EVT/CLM/REL/ASM schemas.
-- ============================================================
/*
 * The Phase 1 action registry gains the Phase 2 writers, each pinned to the object
 * types it may produce. `intelligence.claim.admit` writes claims; it cannot write
 * an SRC, an OBS or an EVD, and `observation.item.admit` cannot write a claim.
 */
INSERT INTO observation.canonical_write_actions (action, object_types, rationale) VALUES
  ('intelligence.claim.admit', ARRAY['ENT','EVT','CLM','REL','ASM'],
   'Extraction admits claim objects and nothing else; it may not touch observation state'),
  ('intelligence.review.decide', ARRAY['ENT','EVT','CLM','REL','ASM'],
   'A reviewer correction admits a NEW version of the claim; nothing is overwritten')
ON CONFLICT (action) DO NOTHING;

/*
 * One schema shared by all five claim types. They differ in what `subject`,
 * `predicate` and `object_value` mean, not in shape, and a single schema keeps the
 * lineage fields mandatory for every one of them: a claim that cannot name its
 * method, model, mode and evidence span is refused at the schema boundary before
 * any port sees it.
 */
INSERT INTO objects.schema_registry (object_type, schema_version, json_schema, compatibility) VALUES
('CLM', 'v1', '{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "additionalProperties": false,
  "required": ["claim_kind","subject","predicate","object_value","confidence","lineage"],
  "properties": {
    "claim_kind": { "enum": ["entity","event","claim","relationship","assessment"] },
    "subject": { "type": "string", "minLength": 1, "maxLength": 512 },
    "predicate": { "type": "string", "minLength": 1, "maxLength": 256 },
    "object_value": { "type": "string", "minLength": 1, "maxLength": 4096 },
    "qualifiers": { "type": "object" },
    "confidence": { "type": "number", "minimum": 0, "maximum": 1 },
    "lineage": {
      "type": "object",
      "additionalProperties": false,
      "required": ["method_key","method_id","model_id","model_weights_digest",
                   "runtime_version","prompt_version","decoding_digest","mode",
                   "evidence_object_id","evidence_digest","byte_start","byte_end",
                   "extraction_identity"],
      "properties": {
        "method_key": { "type": "string" },
        "method_id": { "type": "string" },
        "model_id": { "type": "string" },
        "model_weights_digest": { "type": "string", "pattern": "^[0-9a-f]{64}$" },
        "runtime_version": { "type": "string" },
        "prompt_version": { "type": "string" },
        "decoding_digest": { "type": "string", "pattern": "^[0-9a-f]{64}$" },
        "mode": { "enum": ["replay", "local-live"] },
        "call_id": { "type": ["string", "null"] },
        "run_id": { "type": "string" },
        "evidence_object_id": { "type": "string" },
        "evidence_digest": { "type": "string", "pattern": "^[0-9a-f]{64}$" },
        "byte_start": { "type": "integer", "minimum": 0 },
        "byte_end": { "type": "integer", "minimum": 0 },
        "extraction_identity": { "type": "string", "pattern": "^[0-9a-f]{64}$" }
      }
    },
    "review": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "state": { "enum": ["not_required","queued","approved","corrected","rejected"] },
        "reason": { "type": ["string","null"] },
        "decider": { "type": ["string","null"] }
      }
    }
  }
}'::jsonb, 'backward')
ON CONFLICT (object_type, schema_version) DO NOTHING;

INSERT INTO objects.schema_registry (object_type, schema_version, json_schema, compatibility)
SELECT t, 'v1', (SELECT json_schema FROM objects.schema_registry
                  WHERE object_type = 'CLM' AND schema_version = 'v1'), 'backward'
  FROM unnest(ARRAY['ENT','EVT','REL','ASM']) AS t
ON CONFLICT (object_type, schema_version) DO NOTHING;

-- ============================================================
-- 10. Projection rebuild — the A11 property, extended to Phase 2.
-- ============================================================
/*
 * Every mutable projection in this schema is derivable from its event log. This
 * rebuilds them into temporary tables and reports any drift, exactly as
 * observation.rebuild_projections does for Phase 1.
 */
CREATE OR REPLACE FUNCTION intelligence.rebuild_projections()
RETURNS TABLE (projection text, live_rows bigint, rebuilt_rows bigint, mismatched bigint)
SECURITY DEFINER SET search_path = intelligence, observation, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_authority(ARRAY['intelligence.read', 'observation.read']);

  RETURN QUERY
  WITH last_method AS (
    SELECT DISTINCT ON (e.method_id) e.method_id, e.event
      FROM intelligence.method_events e ORDER BY e.method_id, e.occurred_at DESC, e.event_id DESC
  ), expect_method AS (
    SELECT lm.method_id,
           CASE lm.event WHEN 'method.registered' THEN 'draft'
                         WHEN 'method.approved'   THEN 'approved'
                         WHEN 'method.activated'  THEN 'active'
                         WHEN 'method.suspended'  THEN 'suspended'
                         WHEN 'method.retired'    THEN 'retired' END AS state
      FROM last_method lm
  )
  SELECT 'methods_current'::text,
         (SELECT count(*) FROM intelligence.methods_current),
         (SELECT count(*) FROM expect_method),
         (SELECT count(*) FROM intelligence.methods_current m
            JOIN expect_method x ON x.method_id = m.method_id
           WHERE m.lifecycle_state IS DISTINCT FROM x.state);

  RETURN QUERY
  WITH last_run AS (
    SELECT DISTINCT ON (e.run_id) e.run_id, e.event
      FROM intelligence.run_events e
     WHERE e.event IN ('run.started','run.finished','run.failed','run.budget_exceeded')
     ORDER BY e.run_id, e.occurred_at DESC, e.event_id DESC
  ), expect_run AS (
    SELECT lr.run_id,
           CASE lr.event WHEN 'run.started' THEN 'running'
                         WHEN 'run.finished' THEN 'completed'
                         WHEN 'run.budget_exceeded' THEN 'budget_exceeded'
                         ELSE 'failed' END AS state
      FROM last_run lr
  )
  SELECT 'runs_current'::text,
         (SELECT count(*) FROM intelligence.runs_current),
         (SELECT count(*) FROM expect_run),
         (SELECT count(*) FROM intelligence.runs_current r
            JOIN expect_run x ON x.run_id = r.run_id
           WHERE r.state IS DISTINCT FROM x.state);

  RETURN QUERY
  WITH last_case AS (
    SELECT DISTINCT ON (e.case_id) e.case_id, e.event
      FROM intelligence.review_events e ORDER BY e.case_id, e.occurred_at DESC, e.event_id DESC
  ), expect_case AS (
    SELECT lc.case_id,
           CASE lc.event WHEN 'case.queued' THEN 'queued'
                         WHEN 'case.approved' THEN 'approved'
                         WHEN 'case.corrected' THEN 'corrected'
                         ELSE 'rejected' END AS state
      FROM last_case lc
  )
  SELECT 'review_current'::text,
         (SELECT count(*) FROM intelligence.review_current),
         (SELECT count(*) FROM expect_case),
         (SELECT count(*) FROM intelligence.review_current c
            JOIN expect_case x ON x.case_id = c.case_id
           WHERE c.state IS DISTINCT FROM x.state);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION intelligence.rebuild_projections() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION intelligence.rebuild_projections() TO eye_app, eye_commit;
