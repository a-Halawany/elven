-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0120 §CL — CP-6 B50: CORRECTION-PROPAGATION CLOSURE — ACKNOWLEDGEMENT, FREEZE AND ESCALATION (F-P3-05's closure: V03-T-297, V03-T-301,
-- V03-T-302, ES-30-005, DP-24-002, DP-24-005, DP-24-006, DQM-020, DF-12, PR-24-001/-002/-003, CAP-UM-12, JRN-05, HX-18; built for the B+X rows
-- PR-24-006 and AT-24; re-verified: V03-T-300, MS-06, DCN-09, PR-24-005). Part-local file (folded into the one 0120 at integration, after §0,
-- §HD, §LC, §CI, §PV); applies ALONE on 0001–0119 + the prelude + the wave-1 files (it sorts after them).
--
-- THE GAP. A correction case read CLOSED the moment it was applied: observation.close_correction_case (0022:1570) sets closed_at at
-- 'applied', and nothing afterwards asked whether a single affected product had been reconciled. The walk (§CI) now reaches and CLASSES every
-- product, but a stale briefing, a forecast owed a re-run or a decision owed its owner's review stayed decision-active with nobody owning it;
-- a subscription consumer whose delivery failed was a ledger row; there was no window after which anyone was told, nothing froze, and
-- MET-010 measured to the end of the WALK, not to the consumers' closure.
--
-- THE MECHANISM (DESIGN D7, D8, D9).
-- (CL.1) THE CLOSURE RECORD graph.correction_closures — one per correction case, OPENED by the database when a case is applied after 0120
--   (an AFTER trigger on observation.correction_current; the apply and its closed_at are kept as they were: closed_at is the APPLY instant);
--   an older applied case gets one only through the governed ADOPT act (never automatically: D9). A case is CLOSED only through
--   graph.close_correction_case, which refuses unless (a) the impact scope is known (propagation complete, no truncated walk), (b) the
--   correction authority is not disputed (no open challenge on a corrected object), (c) EVERY material consumer is closed — each affected
--   product whose class is not `current` acknowledged, recomputed or under an unexpired BOUNDED EXCEPTION (reason, expiry, owner), each
--   subscription consumer delivered or, after a failure, acknowledged or excepted — and (d) the projections RECONCILE (graph.rebuild_projections
--   — re-declared whole only to admit the close's own action — every row 0 / 0 / 0, every representation current, no partition withdrawn).
--   The record then states the reached consumers, the failed deliveries, the residual exposure (products closed by an exception), every
--   acknowledgement and the projection check, with the AUDIT DIGEST (sha256) over all of it; the case's freezes lift.
-- (CL.2) THE ACKNOWLEDGEMENTS graph.consumer_acknowledgements (append-only; the latest row per (case, consumer) is its state): acknowledged |
--   recomputed (naming the recomputed record, which must exist and post-date the apply) | bounded_exception | failed (a delivery failure,
--   recorded by the sweep). WHO: the product's accountable owner (an active human), or — only when the product has none — a knowledge owner
--   or the domain administrator; a subscription consumer's owner or the domain administrator. A human_review product (a decision, a
--   commitment, a package, a memory record, a lesson) is acknowledged by its owner and NEVER by the correction authority (the person who
--   applied the case — PR-24-003), and is never `recomputed`: no automatic rewrite of a human decision or commitment (V03-T-300).
-- (CL.3) THE CLOSURE CONTRACT graph.closure_contracts — declared and VERSIONED per domain by the domain administrator (append-only): an
--   acknowledgement window per consumer class (stale, challenged, withdrawn, recompute, human_review, subscription), in seconds, and the
--   longest a bounded exception may run. A window under an hour is declared SYNTHETIC (a demonstration contract — B28's fast-expiry precedent).
-- (CL.4) THE SWEEP graph.sweep_correction_closures — an attention-tick step (executive.attention.tick, the attention agent) and a person's
--   route (graph.closure.sweep), waiting on the DATABASE clock: a consumer past its window, or a subscription delivery that FAILED (an
--   immediate stall), STALLS the case; on a stall every pending material product of the case FREEZES and each stalled consumer is routed to
--   its owner as an attention item of the new class `correction_propagation_stall` (executive.attention_items under the active policy;
--   escalated by executive.escalate_attention_due when unacknowledged past its deadline). A withdrawn product still reached freezes at once;
--   a truncated walk (impact scope unknown) freezes its corrected object at once.
-- (CL.5) THE FREEZE graph.publication_freezes + the hook objects.publication_frozen (§0's stub, re-declared whole: STABLE, invoker, read-only)
--   — THE REACH (this part's decision): a live freeze answers for (a) the frozen object itself (any version when the freeze names none), (b)
--   any product a walk of the freezing case reached THROUGH the frozen product (its path names it — it cites it, directly or transitively),
--   and (c) a decision-package version whose option cites the frozen object directly. §0's re-declared ports then refuse publication
--   approval and delivery and the export build (`publication rejected (held)` / `export rejected (held)`). The frozen product itself stays
--   VISIBLE: the reads answer the frozen marker and the case link (never hidden, never suppressed).
-- (CL.6) MET-010 v2 — analytics.mc_met010_correction_propagation re-declared: the end instant is the closure record's closed_at (material
--   consumer closure), not the walk; registered again (computation version 2).
-- (CL.7) THE READS — the case page's one read (identity, authority, target versions, reason, effective time, replacement, impacted graph,
--   propagation state, per-consumer acknowledgement, freezes, escalations, closure, the correction impact NOTICE of HX-18), the list with
--   each case's closure state (an 'applied' case reads open until its closure record closes, or "not tracked" before B50), the adoptable cases.
--
-- THE VOCABULARY: executive.attention_signal_classes() and the attention_items CHECKs copied whole from 0115 (their last definition) with
-- `correction_propagation_stall` (§CL) and `knowledge_challenge_overdue` (for §PV's overdue challenges — the class only; §PV routes it), and
-- the subject kinds `correction_case` and `knowledge_challenge`.
-- THE REFUSAL NOUN (one, the class form): `correction closure rejected (<class>): …` — reported to the integrator for observation-errors.ts.
-- THREE CLAIMS: construction (this file, phase6-closure-b50); demonstrated operation (the act — SYNTHETIC personas, a SYNTHETIC short
-- window); real acceptance never claimed (PR-24-006 / AT-24 → B111's recording path, then R2).
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- ─── §CL.0 THE VOCABULARIES (0115 §0.3a's function and both CHECKs, copied whole; the B50 classes and subject kinds added) ─────────────────
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
  'analytics.metric', 'analytics.privacy', 'analytics.experience',
  -- B94 (0114)
  'onboarding.migration', 'onboarding.drift', 'implementation.readiness', 'service.case', 'support.access', 'responsibility.gap',
  -- B107 (0115)
  'governance.exception', 'governance.acceptance', 'governance.conformance', 'governance.conflict', 'governance.ownership',
  -- B50 cl (0120 §CL): a correction's consumer past its acknowledgement window or failed; §PV's knowledge challenge past its review
  'correction_propagation_stall', 'knowledge_challenge_overdue'] $$;
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
  'analytics.metric', 'analytics.privacy', 'analytics.experience',
  -- B94 (0114)
  'onboarding.migration', 'onboarding.drift', 'implementation.readiness', 'service.case', 'support.access', 'responsibility.gap',
  -- B107 (0115)
  'governance.exception', 'governance.acceptance', 'governance.conformance', 'governance.conflict', 'governance.ownership',
  -- B50 cl (0120 §CL)
  'correction_propagation_stall', 'knowledge_challenge_overdue'));
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
  'metric_definition', 'metric_result', 'telemetry_definition', 'experience_finding', 'operating_review',
  -- B94 (0114)
  'onboarding_programme', 'config_baseline', 'migration_wave', 'cutover', 'implementation_programme', 'readiness_gate', 'service_case',
  'support_grant', 'responsibility_matrix',
  -- B107 (0115)
  'acceptance_record', 'governance_exception', 'release_candidate', 'conformance_finding', 'stewardship_case', 'design_contribution', 'change_proposal',
  -- B50 cl (0120 §CL)
  'correction_case', 'knowledge_challenge'));

-- ─── §CL.1 THE CLOSURE CONTRACT (declared, versioned, append-only; per domain) ─────────────────────────────────────────────────────────────
CREATE TABLE graph.closure_contracts (
  contract_id        uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  version            int  NOT NULL CHECK (version >= 1),
  windows            jsonb NOT NULL CHECK (jsonb_typeof(windows) = 'object'),     -- {consumer class: acknowledgement window in seconds}
  exception_max_days int  NOT NULL CHECK (exception_max_days BETWEEN 1 AND 365),
  synthetic          boolean NOT NULL,                                            -- a demonstration contract (a window under an hour)
  statement          text NOT NULL CHECK (length(btrim(statement)) BETWEEN 16 AND 2000),
  contract_digest    text NOT NULL CHECK (contract_digest ~ '^[0-9a-f]{64}$'),
  declared_by        uuid NOT NULL,
  declared_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT gclc_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT gclc_version UNIQUE (tenant_id, domain_id, version)
);
CREATE TRIGGER gclc_append_only BEFORE UPDATE OR DELETE ON graph.closure_contracts FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE graph.closure_contracts IS 'B50 §CL (0120; DF-12, DESIGN D8): the domain''s DECLARED closure contract, versioned and append-only (the newest version is in force): an acknowledgement window per consumer class (stale, challenged, withdrawn, recompute, human_review, subscription — seconds) and the longest a bounded exception may run. Declared by the domain administrator; a window under an hour is a SYNTHETIC demonstration contract.';

-- ─── §CL.2 THE CLOSURE RECORD (one per correction case; its events append-only) ───────────────────────────────────────────────────────────
CREATE TABLE graph.correction_closures (
  closure_id             uuid PRIMARY KEY,
  scope                  text NOT NULL,
  tenant_id              uuid NOT NULL,
  domain_id              uuid NOT NULL,
  case_id                uuid NOT NULL UNIQUE,
  opened_at              timestamptz NOT NULL,                 -- the APPLY instant (observation.correction_current.closed_at): the windows run from it
  opened_via             text NOT NULL CHECK (opened_via IN ('applied', 'adopted')),
  adopted_by             uuid,
  adopted_at             timestamptz,
  adopt_reason           text,
  state                  text NOT NULL CHECK (state IN ('open', 'stalled', 'closed')),
  stalled_at             timestamptz,
  stall_reasons          jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(stall_reasons) = 'array'),
  closed_at              timestamptz,
  closed_by              uuid,
  statement              text,
  reached_consumers      int,
  failed_deliveries      jsonb,
  residual_exposure      jsonb,
  acknowledgements       jsonb,
  projections            jsonb,
  projections_reconciled boolean,
  contract_version       int,
  audit_digest           text CHECK (audit_digest IS NULL OR audit_digest ~ '^[0-9a-f]{64}$'),
  record                 jsonb,
  correlation_id         uuid NOT NULL,
  CONSTRAINT gccl_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT gccl_adopted CHECK ((opened_via = 'adopted') = (adopted_by IS NOT NULL AND adopted_at IS NOT NULL AND length(btrim(coalesce(adopt_reason, ''))) >= 16)),
  CONSTRAINT gccl_stalled CHECK ((stalled_at IS NULL) = (state = 'open' OR (state = 'closed' AND stalled_at IS NULL))),
  CONSTRAINT gccl_closed CHECK ((state = 'closed') = (closed_at IS NOT NULL AND closed_by IS NOT NULL AND audit_digest IS NOT NULL AND record IS NOT NULL AND projections_reconciled IS TRUE))
);
CREATE INDEX gccl_domain_state ON graph.correction_closures (tenant_id, domain_id, state, opened_at);
COMMENT ON TABLE graph.correction_closures IS 'B50 §CL (0120; V03-T-297, ES-30-005, DP-24-002): THE PROPAGATION-CLOSURE RECORD of a correction case — opened by the database at the apply (after 0120) or by the governed adopt act (an older case), stalled by the sweep, CLOSED only by graph.close_correction_case: the reached consumers, the failed deliveries, the residual exposure, every acknowledgement, the projection check and the audit digest over them. observation.correction_current.closed_at stays the APPLY instant; the case is closed when this record is.';

CREATE TABLE graph.correction_closure_events (
  event_id           uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  closure_id         uuid NOT NULL REFERENCES graph.correction_closures (closure_id),
  case_id            uuid NOT NULL,
  event              text NOT NULL CHECK (event IN ('closure.opened', 'closure.adopted', 'contract.bound', 'consumer.acknowledged', 'consumer.recomputed', 'consumer.excepted',
                                                    'consumer.failed', 'closure.stalled', 'product.frozen', 'freeze.lifted', 'consumer.escalated', 'closure.closed')),
  consumer_ref       text,
  actor_principal_id uuid,
  details            jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT gcce_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX gcce_case ON graph.correction_closure_events (case_id, occurred_at);
CREATE TRIGGER gcce_append_only BEFORE UPDATE OR DELETE ON graph.correction_closure_events FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

-- The record changes only forward and only through the ports: its identity never; a closed record never.
CREATE OR REPLACE FUNCTION graph.correction_closures_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'correction closure rejected (state): a closure record is never deleted' USING ERRCODE = '22023'; END IF;
  IF OLD.state = 'closed' THEN RAISE EXCEPTION 'correction closure rejected (state): the closure of case % is closed; a closed record never changes', OLD.case_id USING ERRCODE = '22023'; END IF;
  IF NEW.closure_id <> OLD.closure_id OR NEW.case_id <> OLD.case_id OR NEW.tenant_id <> OLD.tenant_id OR NEW.domain_id <> OLD.domain_id OR NEW.scope <> OLD.scope
     OR NEW.opened_at <> OLD.opened_at OR NEW.opened_via <> OLD.opened_via OR NEW.adopted_by IS DISTINCT FROM OLD.adopted_by OR NEW.adopted_at IS DISTINCT FROM OLD.adopted_at
     OR NEW.adopt_reason IS DISTINCT FROM OLD.adopt_reason THEN
    RAISE EXCEPTION 'correction closure rejected (state): the identity of a closure record never changes' USING ERRCODE = '22023';
  END IF;
  IF OLD.state = 'stalled' AND NEW.state = 'open' THEN RAISE EXCEPTION 'correction closure rejected (state): a stalled case stays stalled until it closes' USING ERRCODE = '22023'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER gccl_guard BEFORE UPDATE OR DELETE ON graph.correction_closures FOR EACH ROW EXECUTE FUNCTION graph.correction_closures_guard();

-- ─── §CL.3 THE ACKNOWLEDGEMENTS (append-only; the latest row per (case, consumer) is the consumer's state) ──────────────────────────────────
CREATE TABLE graph.consumer_acknowledgements (
  ack_id               uuid PRIMARY KEY,
  scope                text NOT NULL,
  tenant_id            uuid NOT NULL,
  domain_id            uuid NOT NULL,
  closure_id           uuid NOT NULL REFERENCES graph.correction_closures (closure_id),
  case_id              uuid NOT NULL,
  consumer_kind        text NOT NULL CHECK (consumer_kind IN ('affected_product', 'subscription')),
  consumer_ref         text NOT NULL CHECK (length(consumer_ref) BETWEEN 3 AND 200),
  product_kind         text,
  object_type          text,
  product_id           uuid,
  product_version      int,
  affected_id          uuid,
  affected_class       text CHECK (affected_class IS NULL OR affected_class IN ('current', 'stale', 'challenged', 'withdrawn', 'recompute', 'human_review')),
  subscription_id      uuid,
  delivery_event_id    uuid,
  state                text NOT NULL CHECK (state IN ('acknowledged', 'recomputed', 'bounded_exception', 'failed')),
  note                 text,
  recompute_ref        text,
  exception_reason     text,
  exception_expires_at timestamptz,
  exception_owner      uuid,
  recorded_by          uuid NOT NULL,
  recorded_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id       uuid NOT NULL,
  CONSTRAINT gcak_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT gcak_product CHECK ((consumer_kind = 'affected_product') = (product_id IS NOT NULL AND affected_class IS NOT NULL)),
  CONSTRAINT gcak_subscription CHECK ((consumer_kind = 'subscription') = (subscription_id IS NOT NULL)),
  CONSTRAINT gcak_exception CHECK ((state = 'bounded_exception') = (exception_reason IS NOT NULL AND exception_expires_at IS NOT NULL AND exception_owner IS NOT NULL)),
  CONSTRAINT gcak_recomputed CHECK ((state = 'recomputed') = (recompute_ref IS NOT NULL)),
  CONSTRAINT gcak_failed CHECK (state <> 'failed' OR (consumer_kind = 'subscription' AND delivery_event_id IS NOT NULL)),
  CONSTRAINT gcak_note CHECK (state IN ('failed', 'bounded_exception') OR length(btrim(coalesce(note, ''))) >= 8),
  CONSTRAINT gcak_no_rewrite CHECK (NOT (state = 'recomputed' AND affected_class = 'human_review'))
);
CREATE INDEX gcak_case ON graph.consumer_acknowledgements (case_id, consumer_ref, recorded_at DESC);
CREATE UNIQUE INDEX gcak_failed_once ON graph.consumer_acknowledgements (case_id, subscription_id, delivery_event_id) WHERE state = 'failed';
CREATE TRIGGER gcak_append_only BEFORE UPDATE OR DELETE ON graph.consumer_acknowledgements FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE graph.consumer_acknowledgements IS 'B50 §CL (0120; V03-T-301, DP-24-002, PR-24-003): per correction case, per affected product (§CI''s graph.case_affected_products) and per subscription consumer: acknowledged | recomputed (the re-run record named) | bounded exception (reason, expiry, owner) | failed (a delivery failure, recorded by the sweep). Append-only: the latest row per (case, consumer) is its state. A human_review product is its owner''s acknowledgement — never the correction authority''s, never a recompute (no automatic rewrite of a human decision, V03-T-300).';

-- ─── §CL.4 THE FREEZES ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE graph.publication_freezes (
  freeze_id          uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  closure_id         uuid NOT NULL REFERENCES graph.correction_closures (closure_id),
  case_id            uuid NOT NULL,
  object_type        text NOT NULL CHECK (object_type ~ '^[A-Z]{3}$|^[a-z][a-z_]{2,40}$'),
  object_id          uuid NOT NULL,
  object_version     int CHECK (object_version IS NULL OR object_version >= 1),   -- NULL: every version
  product_ref        text NOT NULL,
  reason_kind        text NOT NULL CHECK (reason_kind IN ('stall', 'delivery_failed', 'scope_unknown', 'withdrawn_active', 'manual')),
  reason             text NOT NULL CHECK (length(btrim(reason)) >= 8),
  frozen_by          uuid NOT NULL,
  frozen_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  lifted_at          timestamptz,
  lifted_by          uuid,
  lift_kind          text CHECK (lift_kind IS NULL OR lift_kind IN ('closure', 'consumer_closed')),
  lift_reason        text,
  correlation_id     uuid NOT NULL,
  CONSTRAINT gpfz_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT gpfz_lift CHECK ((lifted_at IS NULL) = (lifted_by IS NULL) AND (lifted_at IS NULL) = (lift_kind IS NULL) AND (lifted_at IS NULL OR length(btrim(coalesce(lift_reason, ''))) >= 8))
);
CREATE UNIQUE INDEX gpfz_one_live ON graph.publication_freezes (case_id, object_id, coalesce(object_version, 0)) WHERE lifted_at IS NULL;
CREATE INDEX gpfz_object ON graph.publication_freezes (object_id) WHERE lifted_at IS NULL;
CREATE OR REPLACE FUNCTION graph.publication_freezes_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'correction closure rejected (state): a freeze is never deleted; it is lifted' USING ERRCODE = '22023'; END IF;
  IF OLD.lifted_at IS NOT NULL THEN RAISE EXCEPTION 'correction closure rejected (state): freeze % is already lifted', OLD.freeze_id USING ERRCODE = '22023'; END IF;
  IF (NEW.freeze_id, NEW.scope, NEW.tenant_id, NEW.domain_id, NEW.closure_id, NEW.case_id, NEW.object_type, NEW.object_id, NEW.object_version, NEW.product_ref, NEW.reason_kind, NEW.reason, NEW.frozen_by, NEW.frozen_at, NEW.correlation_id)
     IS DISTINCT FROM (OLD.freeze_id, OLD.scope, OLD.tenant_id, OLD.domain_id, OLD.closure_id, OLD.case_id, OLD.object_type, OLD.object_id, OLD.object_version, OLD.product_ref, OLD.reason_kind, OLD.reason, OLD.frozen_by, OLD.frozen_at, OLD.correlation_id) THEN
    RAISE EXCEPTION 'correction closure rejected (state): a freeze changes only by being lifted' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER gpfz_guard BEFORE UPDATE OR DELETE ON graph.publication_freezes FOR EACH ROW EXECUTE FUNCTION graph.publication_freezes_guard();
COMMENT ON TABLE graph.publication_freezes IS 'B50 §CL (0120; DP-24-005, DF-12, DESIGN D7): a correction case''s FREEZE of an affected product (or, when the impact scope is unknown, of its corrected object): set by the sweep on a stall, a failed delivery, a truncated walk or a withdrawn product still reached, or by a steward; lifted when the case closes or once the product''s consumer is closed. Read by objects.publication_frozen (the reach: the object, what reached it through the frozen product, a package option citing it). The frozen product stays visible with its marker and the case link.';

-- Row-level security and read grants, exactly as every graph table (0024 §RLS); no write grant (the ports write as their definer).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['closure_contracts', 'correction_closures', 'correction_closure_events', 'consumer_acknowledgements', 'publication_freezes'] LOOP
    EXECUTE format('ALTER TABLE graph.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE graph.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY graph_isolation ON graph.%I
        USING (tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain()))$f$, t);
    EXECUTE format('REVOKE ALL ON graph.%I FROM PUBLIC', t);
    EXECUTE format('GRANT SELECT ON graph.%I TO eye_app, eye_commit', t);
  END LOOP;
END $$;

COMMENT ON COLUMN observation.correction_current.closed_at IS 'The instant the case left its intake (applied, rejected or failed — 0022). B50 §CL (0120): for an APPLIED case this is the apply instant, NOT the closure of its propagation: the case is closed when its graph.correction_closures record is (graph.correction_closure_state).';

-- ─── §CL.5 THE CLOSURE OPENS AT THE APPLY (a case applied after 0120; the apply itself unchanged) ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION graph._cl_open_on_apply() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = graph, observation, public, pg_catalog, pg_temp AS $$
DECLARE v_id uuid := gen_random_uuid(); v_corr uuid := gen_random_uuid();
BEGIN
  IF NEW.state = 'applied' AND (TG_OP = 'INSERT' OR OLD.state IS DISTINCT FROM 'applied') THEN
    INSERT INTO graph.correction_closures (closure_id, scope, tenant_id, domain_id, case_id, opened_at, opened_via, state, correlation_id)
    VALUES (v_id, 'DOMAIN', NEW.tenant_id, NEW.domain_id, NEW.case_id, coalesce(NEW.closed_at, clock_timestamp()), 'applied', 'open', v_corr)
    ON CONFLICT (case_id) DO NOTHING;
    IF FOUND THEN
      INSERT INTO graph.correction_closure_events (event_id, scope, tenant_id, domain_id, closure_id, case_id, event, actor_principal_id, details, correlation_id)
      VALUES (gen_random_uuid(), 'DOMAIN', NEW.tenant_id, NEW.domain_id, v_id, NEW.case_id, 'closure.opened', public.eye_principal(),
              jsonb_build_object('opened_at', coalesce(NEW.closed_at, clock_timestamp()), 'kind', NEW.kind, 'statement', 'the case was applied; it closes when every material consumer is acknowledged, recomputed or under a bounded exception and the projections reconcile'), v_corr);
    END IF;
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION graph._cl_open_on_apply() FROM PUBLIC;
CREATE TRIGGER gccl_open_on_apply AFTER INSERT OR UPDATE OF state ON observation.correction_current FOR EACH ROW EXECUTE FUNCTION graph._cl_open_on_apply();

-- ─── §CL.6 THE INTERNALS (no runtime grant: reachable only from inside the ports, as their definer) ───────────────────────────────────────
-- The acting principal of a person's act: the session's, a human, the actor named.
CREATE OR REPLACE FUNCTION graph._cl_person(p_actor uuid, p_tenant uuid) RETURNS uuid
LANGUAGE plpgsql STABLE SET search_path = graph, public, pg_catalog, pg_temp AS $$
BEGIN
  IF p_actor IS NULL OR p_actor IS DISTINCT FROM public.eye_principal() THEN
    RAISE EXCEPTION 'correction closure rejected (actor): the act is the acting principal''s own (the session''s principal)' USING ERRCODE = '42501';
  END IF;
  IF NOT decision.is_active_human(p_actor, p_tenant) THEN
    RAISE EXCEPTION 'correction closure rejected (actor): a person''s act — an agent or an inactive principal does not take it' USING ERRCODE = '42501';
  END IF;
  RETURN p_actor;
END $$;
REVOKE ALL ON FUNCTION graph._cl_person(uuid, uuid) FROM PUBLIC;

-- Who applied the case (the correction authority): the actor of its case.applied event.
CREATE OR REPLACE FUNCTION graph._cl_applier(p_case uuid) RETURNS uuid
LANGUAGE sql STABLE SET search_path = observation, pg_catalog, pg_temp AS $$
  SELECT NULLIF(regexp_replace(e.actor, '^principal:', ''), e.actor)::uuid
    FROM observation.correction_events e WHERE e.case_id = p_case AND e.event = 'case.applied' AND e.actor ~ '^principal:[0-9a-f-]{36}$'
   ORDER BY e.occurred_at LIMIT 1
$$;
REVOKE ALL ON FUNCTION graph._cl_applier(uuid) FROM PUBLIC;

-- The contract in force (the newest version), or NULL.
CREATE OR REPLACE FUNCTION graph._cl_contract(p_tenant uuid, p_domain uuid) RETURNS graph.closure_contracts
LANGUAGE sql STABLE SET search_path = graph, pg_catalog, pg_temp AS $$
  SELECT k FROM graph.closure_contracts k WHERE k.tenant_id = p_tenant AND k.domain_id = p_domain ORDER BY k.version DESC LIMIT 1
$$;
REVOKE ALL ON FUNCTION graph._cl_contract(uuid, uuid) FROM PUBLIC;

/*
 * THE CONSUMERS of a case and their state now (one row each): every product of the case's latest walk of each root (§CI's stable read; a
 * product reached from two roots is ONE consumer, its most material class kept) and every subscription that received one of the case's
 * change events (GraphChanged / MemoryCorrected carrying the case id). state:
 *   current            a product already reflecting the change (not material; closes nothing)
 *   pending            a material product with no closing act, or a subscription with a delivery not yet finished
 *   acknowledged / recomputed / bounded_exception   the latest act (an exception only while unexpired: else exception_expired)
 *   delivered          a subscription whose deliveries of the case's events all APPLIED (the subscription ledger's own acknowledgement)
 *   failed             a subscription with a failed or refused delivery and no later acknowledgement or exception
 * deadline: the apply (or the product's walk, if later) + the contract's window for its class — NULL without a contract (no time stall);
 * a failed delivery's deadline is its failure (an immediate stall).
 */
CREATE OR REPLACE FUNCTION graph._cl_consumers(p_tenant uuid, p_domain uuid, p_case uuid, p_now timestamptz, p_windows jsonb, p_opened_at timestamptz)
RETURNS TABLE (consumer_kind text, consumer_ref text, product_kind text, object_type text, product_id uuid, product_version int, class text, material boolean,
               owner_principal_id uuid, title text, bucket text, affected_id uuid, invalidation_id uuid, reached_at timestamptz, path jsonb,
               subscription_id uuid, delivery_state text, failure_class text, failed_event_id uuid, failed_at timestamptz,
               ack_id uuid, ack_state text, ack_by uuid, ack_at timestamptz, ack_note text, recompute_ref text, exception_reason text, exception_expires_at timestamptz, exception_owner uuid,
               state text, closing boolean, deadline timestamptz, overdue boolean)
LANGUAGE sql STABLE SET search_path = graph, objects, pg_catalog, pg_temp AS $$
  WITH prod AS (
    SELECT DISTINCT ON (a.product_ref) a.*
      FROM graph.case_affected_products a
     WHERE a.case_id = p_case AND a.tenant_id = p_tenant AND a.domain_id = p_domain
     ORDER BY a.product_ref, (a.class = 'current'), CASE a.class WHEN 'withdrawn' THEN 0 WHEN 'challenged' THEN 1 WHEN 'human_review' THEN 2 WHEN 'recompute' THEN 3 WHEN 'stale' THEN 4 ELSE 5 END, a.recorded_at DESC
  ), deliv AS (
    SELECT d.subscription_id, s.consumer_kind AS sub_kind, s.owner_principal_id AS sub_owner,
           CASE WHEN bool_or(d.state IN ('failed', 'refused')) THEN 'failed' WHEN bool_and(d.state = 'applied') THEN 'applied' ELSE 'pending' END AS dstate,
           (array_agg(d.failure_class ORDER BY d.finished_at DESC NULLS LAST) FILTER (WHERE d.state IN ('failed', 'refused')))[1] AS fclass,
           (array_agg(d.event_id ORDER BY d.finished_at DESC NULLS LAST) FILTER (WHERE d.state IN ('failed', 'refused')))[1] AS fevent,
           max(d.finished_at) FILTER (WHERE d.state IN ('failed', 'refused')) AS fat,
           min(d.first_received_at) AS first_at
      FROM graph.subscription_deliveries d
      JOIN objects.object_outbox o ON o.id = d.event_id AND o.tenant_id = p_tenant AND o.domain_id = p_domain
      JOIN graph.subscriptions s ON s.subscription_id = d.subscription_id
     WHERE d.tenant_id = p_tenant AND d.domain_id = p_domain AND o.event_type IN ('GraphChanged', 'MemoryCorrected') AND o.payload #>> '{change,correction_case_id}' = p_case::text
     GROUP BY d.subscription_id, s.consumer_kind, s.owner_principal_id
  ), consumers AS (
    SELECT 'affected_product'::text AS ck, p.product_ref AS cref, p.product_kind AS pk, p.object_type AS ot, p.product_id AS pid, p.product_version AS pv, p.class AS cls,
           p.class <> 'current' AS mat, p.owner_principal_id AS own, p.title AS ttl, p.bucket AS bkt, p.affected_id AS aid, p.invalidation_id AS iid, p.recorded_at AS rat, p.path AS pth,
           NULL::uuid AS sid, NULL::text AS ds, NULL::text AS fc, NULL::uuid AS fe, NULL::timestamptz AS fat
      FROM prod p
    UNION ALL
    SELECT 'subscription', 'SUB:' || x.subscription_id::text, NULL, NULL, NULL, NULL, NULL, true, x.sub_owner, 'subscription consumer ' || x.sub_kind, NULL, NULL, NULL, x.first_at, '[]'::jsonb,
           x.subscription_id, x.dstate, x.fclass, x.fevent, x.fat
      FROM deliv x
  )
  SELECT c.ck, c.cref, c.pk, c.ot, c.pid, c.pv, c.cls, c.mat, c.own, c.ttl, c.bkt, c.aid, c.iid, c.rat, c.pth,
         c.sid, c.ds, c.fc, c.fe, c.fat,
         k.ack_id, k.state, k.recorded_by, k.recorded_at, k.note, k.recompute_ref, k.exception_reason, k.exception_expires_at, k.exception_owner,
         s.st,
         s.st IN ('current', 'acknowledged', 'recomputed', 'bounded_exception', 'delivered'),
         CASE WHEN s.st IN ('current', 'acknowledged', 'recomputed', 'bounded_exception', 'delivered') THEN NULL
              WHEN c.ck = 'subscription' AND s.st = 'failed' THEN c.fat
              WHEN p_windows IS NULL OR NOT (p_windows ? coalesce(c.cls, 'subscription')) THEN NULL
              ELSE greatest(p_opened_at, coalesce(c.rat, p_opened_at)) + make_interval(secs => (p_windows ->> coalesce(c.cls, 'subscription'))::numeric::double precision) END,
         CASE WHEN s.st IN ('current', 'acknowledged', 'recomputed', 'bounded_exception', 'delivered') THEN false
              WHEN c.ck = 'subscription' AND s.st = 'failed' THEN true
              WHEN p_windows IS NULL OR NOT (p_windows ? coalesce(c.cls, 'subscription')) THEN false
              ELSE greatest(p_opened_at, coalesce(c.rat, p_opened_at)) + make_interval(secs => (p_windows ->> coalesce(c.cls, 'subscription'))::numeric::double precision) <= p_now END
    FROM consumers c
    LEFT JOIN LATERAL (SELECT a.* FROM graph.consumer_acknowledgements a WHERE a.case_id = p_case AND a.consumer_ref = c.cref ORDER BY a.recorded_at DESC, a.ack_id DESC LIMIT 1) k ON true
    CROSS JOIN LATERAL (SELECT CASE
        WHEN c.ck = 'affected_product' AND NOT c.mat THEN 'current'
        WHEN k.state = 'bounded_exception' AND k.exception_expires_at <= p_now THEN 'exception_expired'
        WHEN c.ck = 'affected_product' THEN coalesce(k.state, 'pending')
        -- a subscription: a failure stands until an act recorded AFTER it closes it; an applied ledger is its own acknowledgement
        WHEN c.ds = 'failed' AND k.state IN ('acknowledged', 'bounded_exception') AND k.recorded_at >= c.fat THEN k.state
        WHEN c.ds = 'failed' THEN 'failed'
        WHEN c.ds = 'applied' THEN 'delivered'
        WHEN k.state = 'bounded_exception' THEN 'bounded_exception'
        ELSE 'pending' END AS st) s
$$;
REVOKE ALL ON FUNCTION graph._cl_consumers(uuid, uuid, uuid, timestamptz, jsonb, timestamptz) FROM PUBLIC;

-- The consumers as jsonb (the reads and the record).
CREATE OR REPLACE FUNCTION graph._cl_consumers_json(p_tenant uuid, p_domain uuid, p_case uuid, p_now timestamptz, p_windows jsonb, p_opened_at timestamptz) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = graph, pg_catalog, pg_temp AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'consumer_kind', c.consumer_kind, 'consumer_ref', c.consumer_ref, 'product_kind', c.product_kind, 'object_type', c.object_type, 'product_id', c.product_id,
           'product_version', c.product_version, 'class', c.class, 'material', c.material, 'owner', c.owner_principal_id, 'title', c.title, 'bucket', c.bucket,
           'affected_id', c.affected_id, 'invalidation_id', c.invalidation_id, 'reached_at', c.reached_at, 'path', c.path,
           'subscription_id', c.subscription_id, 'delivery_state', c.delivery_state, 'failure_class', c.failure_class, 'failed_event_id', c.failed_event_id, 'failed_at', c.failed_at,
           'state', c.state, 'closing', c.closing, 'deadline', c.deadline, 'overdue', c.overdue,
           'ack', CASE WHEN c.ack_id IS NULL THEN NULL ELSE jsonb_build_object('ack_id', c.ack_id, 'state', c.ack_state, 'by', c.ack_by, 'at', c.ack_at, 'note', c.ack_note,
                     'recompute_ref', c.recompute_ref, 'exception', CASE WHEN c.ack_state = 'bounded_exception' THEN jsonb_build_object('reason', c.exception_reason, 'expires_at', c.exception_expires_at, 'owner', c.exception_owner) END) END,
           'frozen', EXISTS (SELECT 1 FROM graph.publication_freezes f WHERE f.case_id = p_case AND f.lifted_at IS NULL AND f.object_id = c.product_id))
         ORDER BY c.consumer_kind, c.material DESC, c.consumer_ref), '[]'::jsonb)
    FROM graph._cl_consumers(p_tenant, p_domain, p_case, p_now, p_windows, p_opened_at) c
$$;
REVOKE ALL ON FUNCTION graph._cl_consumers_json(uuid, uuid, uuid, timestamptz, jsonb, timestamptz) FROM PUBLIC;

-- The case's corrected objects (the walk roots) and whether the impact scope is known.
CREATE OR REPLACE FUNCTION graph._cl_scope(p_tenant uuid, p_domain uuid, p_case uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = graph, observation, pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object(
    'propagation_state', c.propagation_state,
    'roots', coalesce((SELECT jsonb_agg(DISTINCT x ->> 'object_id') FROM jsonb_array_elements(c.affected_resolved) x WHERE x ? 'object_id'), '[]'::jsonb),
    'walks', coalesce((SELECT jsonb_agg(jsonb_build_object('invalidation_id', i.invalidation_id, 'root', i.trigger_object_id, 'state', i.state, 'truncated', i.truncated, 'assessed_at', i.assessed_at) ORDER BY i.opened_at)
                         FROM graph.invalidations_current i WHERE i.correction_case_id = p_case AND i.tenant_id = p_tenant AND i.domain_id = p_domain), '[]'::jsonb),
    'truncated_roots', coalesce((SELECT jsonb_agg(DISTINCT l.trigger_object_id) FROM (
        SELECT DISTINCT ON (i.trigger_object_id) i.trigger_object_id, i.truncated FROM graph.invalidations_current i
         WHERE i.correction_case_id = p_case AND i.tenant_id = p_tenant AND i.domain_id = p_domain AND i.state = 'assessed'
         ORDER BY i.trigger_object_id, i.assessed_at DESC) l WHERE l.truncated), '[]'::jsonb),
    'disputed_roots', coalesce((SELECT jsonb_agg(DISTINCT x ->> 'object_id') FROM jsonb_array_elements(c.affected_resolved) x
                                 WHERE x ? 'object_id' AND graph._open_challenge(p_tenant, p_domain, 'evidence', (x ->> 'object_id')::uuid, NULL)), '[]'::jsonb),
    'held_roots', coalesce((SELECT jsonb_agg(DISTINCT h.evd_object_id) FROM observation.legal_holds h, jsonb_array_elements(c.affected_resolved) x
                             WHERE x ? 'object_id' AND h.evd_object_id = (x ->> 'object_id')::uuid AND h.lifted_at IS NULL AND h.tenant_id = p_tenant AND h.domain_id = p_domain), '[]'::jsonb))
    FROM observation.correction_current c WHERE c.case_id = p_case AND c.tenant_id = p_tenant AND c.domain_id = p_domain
$$;
REVOKE ALL ON FUNCTION graph._cl_scope(uuid, uuid, uuid) FROM PUBLIC;

-- The projection reconciliation (ES-30-005): the six projections against their logs, now, plus any withdrawn partition.
CREATE OR REPLACE FUNCTION graph._cl_projections(p_tenant uuid, p_domain uuid) RETURNS jsonb
LANGUAGE plpgsql SET search_path = graph, pg_catalog, pg_temp AS $$
DECLARE v_rows jsonb; v_ok boolean; v_withdrawn jsonb;
BEGIN
  SELECT coalesce(jsonb_agg(jsonb_build_object('projection', r.projection, 'live_rows', r.live_rows, 'rebuilt_rows', r.rebuilt_rows, 'mismatched', r.mismatched, 'missing', r.missing,
                                               'unexpected', r.unexpected, 'representation_ok', r.representation_ok) ORDER BY r.projection), '[]'::jsonb),
         coalesce(bool_and(r.mismatched = 0 AND r.missing = 0 AND r.unexpected = 0 AND r.representation_ok), true)
    INTO v_rows, v_ok FROM graph.rebuild_projections() r;
  SELECT coalesce(jsonb_agg(p.projection ORDER BY p.projection), '[]'::jsonb) INTO v_withdrawn FROM graph.projection_partitions p
   WHERE p.tenant_id = p_tenant AND p.domain_id = p_domain AND p.state = 'withdrawn';
  RETURN jsonb_build_object('reconciled', v_ok AND jsonb_array_length(v_withdrawn) = 0, 'rows', v_rows, 'withdrawn', v_withdrawn, 'checked_at', clock_timestamp(),
                            'representation_version', graph.projection_representation_version());
END $$;
REVOKE ALL ON FUNCTION graph._cl_projections(uuid, uuid) FROM PUBLIC;

-- What still holds the case open, in words (the close port's refusals and the page's readiness are this one function).
CREATE OR REPLACE FUNCTION graph._cl_readiness(p_tenant uuid, p_domain uuid, p_case uuid, p_now timestamptz, p_with_projections boolean) RETURNS jsonb
LANGUAGE plpgsql SET search_path = graph, observation, pg_catalog, pg_temp AS $$
DECLARE c graph.correction_closures; k graph.closure_contracts; cs observation.correction_current; v_scope jsonb; v_cons jsonb; v_open jsonb; v_reasons jsonb := '[]'::jsonb; v_proj jsonb := NULL;
BEGIN
  SELECT * INTO c FROM graph.correction_closures x WHERE x.case_id = p_case AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  SELECT * INTO cs FROM observation.correction_current x WHERE x.case_id = p_case AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  k := graph._cl_contract(p_tenant, p_domain);
  v_scope := graph._cl_scope(p_tenant, p_domain, p_case);
  v_cons := graph._cl_consumers_json(p_tenant, p_domain, p_case, p_now, k.windows, coalesce(c.opened_at, cs.closed_at, p_now));
  IF cs.state IS DISTINCT FROM 'applied' THEN v_reasons := v_reasons || to_jsonb(format('the case is %s, not applied', coalesce(cs.state, 'unknown'))); END IF;
  IF c.closure_id IS NULL THEN v_reasons := v_reasons || to_jsonb('the case has no closure record: it was applied before B50 — adopt it to track its closure'::text); END IF;
  IF coalesce(v_scope ->> 'propagation_state', 'pending') <> 'complete' THEN
    v_reasons := v_reasons || to_jsonb(format('the impact scope is not known: the propagation is %s (every corrected object is walked, none truncated, before the case closes)', coalesce(v_scope ->> 'propagation_state', 'pending')));
  END IF;
  IF jsonb_array_length(coalesce(v_scope -> 'truncated_roots', '[]'::jsonb)) > 0 THEN
    v_reasons := v_reasons || to_jsonb(format('the latest walk of %s corrected object(s) was truncated: the impact scope is incomplete', jsonb_array_length(v_scope -> 'truncated_roots')));
  END IF;
  IF jsonb_array_length(coalesce(v_scope -> 'disputed_roots', '[]'::jsonb)) > 0 THEN
    v_reasons := v_reasons || to_jsonb(format('the correction authority is disputed: an open challenge names %s corrected object(s); the challenge is decided first', jsonb_array_length(v_scope -> 'disputed_roots')));
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('ref', x ->> 'consumer_ref', 'state', x ->> 'state', 'class', x ->> 'class', 'owner', x ->> 'owner')), '[]'::jsonb) INTO v_open
    FROM jsonb_array_elements(v_cons) x WHERE NOT (x ->> 'closing')::boolean;
  IF jsonb_array_length(v_open) > 0 THEN
    v_reasons := v_reasons || to_jsonb(format('%s material consumer(s) are not closed (each is acknowledged, recomputed or under a bounded exception): %s', jsonb_array_length(v_open),
                                              (SELECT string_agg(format('%s %s', y ->> 'ref', y ->> 'state'), ', ') FROM (SELECT y FROM jsonb_array_elements(v_open) y LIMIT 8) q)));
  END IF;
  IF p_with_projections THEN
    v_proj := graph._cl_projections(p_tenant, p_domain);
    IF NOT (v_proj ->> 'reconciled')::boolean THEN
      v_reasons := v_reasons || to_jsonb('the projections do not reconcile with their logs (graph.rebuild_projections): rebuild them first'::text);
    END IF;
  END IF;
  RETURN jsonb_build_object('ready', jsonb_array_length(v_reasons) = 0, 'reasons', v_reasons, 'open_consumers', v_open, 'consumers', v_cons, 'scope', v_scope, 'projections', v_proj,
                            'contract_version', k.version, 'at', p_now);
END $$;
REVOKE ALL ON FUNCTION graph._cl_readiness(uuid, uuid, uuid, timestamptz, boolean) FROM PUBLIC;

CREATE OR REPLACE FUNCTION graph._cl_event(c graph.correction_closures, p_event text, p_ref text, p_actor uuid, p_details jsonb, p_correlation uuid) RETURNS uuid
LANGUAGE plpgsql SET search_path = graph, pg_catalog, pg_temp AS $$
DECLARE v_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO graph.correction_closure_events (event_id, scope, tenant_id, domain_id, closure_id, case_id, event, consumer_ref, actor_principal_id, details, correlation_id)
  VALUES (v_id, 'DOMAIN', c.tenant_id, c.domain_id, c.closure_id, c.case_id, p_event, p_ref, p_actor, coalesce(p_details, '{}'::jsonb), coalesce(p_correlation, gen_random_uuid()));
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION graph._cl_event(graph.correction_closures, text, text, uuid, jsonb, uuid) FROM PUBLIC;

-- The closure record of a case, locked, or the class-form refusal.
CREATE OR REPLACE FUNCTION graph._cl_lock(p_tenant uuid, p_domain uuid, p_case uuid) RETURNS graph.correction_closures
LANGUAGE plpgsql SET search_path = graph, observation, pg_catalog, pg_temp AS $$
DECLARE c graph.correction_closures;
BEGIN
  SELECT * INTO c FROM graph.correction_closures x WHERE x.case_id = p_case AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN
    IF EXISTS (SELECT 1 FROM observation.correction_current x WHERE x.case_id = p_case AND x.tenant_id = p_tenant AND x.domain_id = p_domain) THEN
      RAISE EXCEPTION 'correction closure rejected (state): case % has no closure record (applied before B50 or not applied); an applied case is adopted first', p_case USING ERRCODE = '22023';
    END IF;
    RAISE EXCEPTION 'correction closure rejected (unknown_case): no correction case % in this domain', p_case USING ERRCODE = '23503';
  END IF;
  RETURN c;
END $$;
REVOKE ALL ON FUNCTION graph._cl_lock(uuid, uuid, uuid) FROM PUBLIC;

-- One consumer of a case (the act's subject), or the class-form refusal.
CREATE OR REPLACE FUNCTION graph._cl_consumer(p_tenant uuid, p_domain uuid, c graph.correction_closures, p_ref text, p_now timestamptz) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = graph, pg_catalog, pg_temp AS $$
DECLARE k graph.closure_contracts; v jsonb;
BEGIN
  k := graph._cl_contract(p_tenant, p_domain);
  SELECT x INTO v FROM jsonb_array_elements(graph._cl_consumers_json(p_tenant, p_domain, c.case_id, p_now, k.windows, c.opened_at)) x WHERE x ->> 'consumer_ref' = p_ref;
  IF v IS NULL THEN RAISE EXCEPTION 'correction closure rejected (unknown_consumer): % is not a consumer of correction case %', coalesce(p_ref, '<none>'), c.case_id USING ERRCODE = '23503'; END IF;
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION graph._cl_consumer(uuid, uuid, graph.correction_closures, text, timestamptz) FROM PUBLIC;

-- Who closes one consumer: the product's accountable owner (an active human), or — only when it has none — a knowledge owner or the domain
-- administrator; a subscription's owner or the domain administrator. A human_review product is never the correction authority's (PR-24-003).
CREATE OR REPLACE FUNCTION graph._cl_assert_closer(p_tenant uuid, p_domain uuid, c graph.correction_closures, v jsonb, p_actor uuid, p_extra_roles text[]) RETURNS text
LANGUAGE plpgsql STABLE SET search_path = graph, pg_catalog, pg_temp AS $$
DECLARE v_owner uuid := NULLIF(v ->> 'owner', '')::uuid; v_applier uuid := graph._cl_applier(c.case_id); v_basis text;
BEGIN
  IF v ->> 'class' = 'human_review' AND p_actor IS NOT DISTINCT FROM v_applier THEN
    RAISE EXCEPTION 'correction closure rejected (separation_of_duties): % is a human review — its owner decides whether the prior decision needs review; the correction authority who applied case % never acknowledges it', v ->> 'consumer_ref', c.case_id USING ERRCODE = '42501';
  END IF;
  IF v_owner IS NOT NULL AND decision.is_active_human(v_owner, p_tenant) THEN
    IF p_actor = v_owner THEN RETURN 'the accountable owner'; END IF;
    IF p_extra_roles IS NOT NULL AND executive.holds_role(p_actor, p_tenant, p_domain, p_extra_roles) THEN RETURN 'a holder of ' || array_to_string(p_extra_roles, ' / '); END IF;
    RAISE EXCEPTION 'correction closure rejected (authority): % is owned by %; its owner closes it', v ->> 'consumer_ref', v_owner USING ERRCODE = '42501';
  END IF;
  IF executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['knowledge_owner', 'domain_admin'] || coalesce(p_extra_roles, '{}'::text[])) THEN
    v_basis := 'no active human owns it: a knowledge owner or the domain administrator';
    RETURN v_basis;
  END IF;
  RAISE EXCEPTION 'correction closure rejected (authority): % has no active human owner; a knowledge owner or the domain administrator closes it', v ->> 'consumer_ref' USING ERRCODE = '42501';
END $$;
REVOKE ALL ON FUNCTION graph._cl_assert_closer(uuid, uuid, graph.correction_closures, jsonb, uuid, text[]) FROM PUBLIC;

-- A recompute names the re-run record: a canonical version recorded after the apply (TYPE:id@version), or an evaluation / export record made after it.
CREATE OR REPLACE FUNCTION graph._cl_recompute_ok(p_tenant uuid, p_domain uuid, p_ref text, p_after timestamptz) RETURNS boolean
LANGUAGE plpgsql STABLE SET search_path = graph, pg_catalog, pg_temp AS $$
DECLARE m text[];
BEGIN
  m := regexp_match(coalesce(p_ref, ''), '^([A-Z]{3}):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})@([0-9]{1,9})$');
  IF m IS NOT NULL THEN
    RETURN EXISTS (SELECT 1 FROM objects.canonical_objects o WHERE o.object_type = m[1] AND o.object_id = m[2]::uuid AND o.object_version = m[3]::int
                                                              AND o.tenant_id = p_tenant AND o.domain_id = p_domain AND o.recorded_at > p_after);
  END IF;
  m := regexp_match(coalesce(p_ref, ''), '^(export_package|backtest|method_validation|information_set):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$');
  IF m IS NULL THEN
    RAISE EXCEPTION 'correction closure rejected (recompute_ref): a recompute names its re-run record — TYPE:<id>@<version> (a canonical version) or export_package | backtest | method_validation | information_set:<id>' USING ERRCODE = '22023';
  END IF;
  RETURN CASE m[1]
    WHEN 'export_package' THEN EXISTS (SELECT 1 FROM retention.export_packages x WHERE x.action_id = m[2]::uuid AND x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.built_at > p_after)
    WHEN 'backtest' THEN EXISTS (SELECT 1 FROM prediction.backtests x WHERE x.backtest_id = m[2]::uuid AND x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.computed_at > p_after)
    WHEN 'method_validation' THEN EXISTS (SELECT 1 FROM prediction.method_validations x WHERE x.validation_id = m[2]::uuid AND x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.computed_at > p_after)
    ELSE EXISTS (SELECT 1 FROM prediction.information_sets x WHERE x.information_set_id = m[2]::uuid AND x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.frozen_at > p_after) END;
END $$;
REVOKE ALL ON FUNCTION graph._cl_recompute_ok(uuid, uuid, text, timestamptz) FROM PUBLIC;

-- A freeze (idempotent per case and object): answers true when a new freeze row was written.
CREATE OR REPLACE FUNCTION graph._cl_freeze(c graph.correction_closures, p_type text, p_id uuid, p_version int, p_ref text, p_kind text, p_reason text, p_actor uuid, p_correlation uuid) RETURNS boolean
LANGUAGE plpgsql SET search_path = graph, pg_catalog, pg_temp AS $$
DECLARE v_id uuid := gen_random_uuid();
BEGIN
  IF p_id IS NULL THEN RETURN false; END IF;
  INSERT INTO graph.publication_freezes (freeze_id, scope, tenant_id, domain_id, closure_id, case_id, object_type, object_id, object_version, product_ref, reason_kind, reason, frozen_by, correlation_id)
  VALUES (v_id, 'DOMAIN', c.tenant_id, c.domain_id, c.closure_id, c.case_id, p_type, p_id, p_version, p_ref, p_kind, left(p_reason, 2000), p_actor, coalesce(p_correlation, gen_random_uuid()))
  ON CONFLICT (case_id, object_id, coalesce(object_version, 0)) WHERE lifted_at IS NULL DO NOTHING;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM graph._cl_event(c, 'product.frozen', p_ref, p_actor, jsonb_build_object('freeze_id', v_id, 'reason_kind', p_kind, 'reason', p_reason, 'object_type', p_type, 'object_id', p_id, 'object_version', p_version), p_correlation);
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION graph._cl_freeze(graph.correction_closures, text, uuid, int, text, text, text, uuid, uuid) FROM PUBLIC;

-- A stalled consumer routed to its owner (the 0107 idiom: evaluated under the domain's ACTIVE policy, routed, its event recorded); one item
-- per (case, consumer) — a repeated sweep answers the item it made.
CREATE OR REPLACE FUNCTION graph._cl_raise(c graph.correction_closures, v jsonb, p_reason text, p_contract int, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SET search_path = graph, executive, identity, pg_catalog, pg_temp AS $$
DECLARE pol executive.attention_policies%ROWTYPE; v_eval jsonb; v_route jsonb; v_state text; v_owner uuid; v_item uuid := gen_random_uuid();
        v_cause uuid := md5('b50cl:' || c.case_id::text || ':' || (v ->> 'consumer_ref'))::uuid; x executive.attention_items%ROWTYPE;
BEGIN
  SELECT * INTO x FROM executive.attention_items i WHERE i.tenant_id = c.tenant_id AND i.domain_id = c.domain_id AND i.signal_class = 'correction_propagation_stall' AND i.subject_id = c.case_id AND i.cause_event_id = v_cause;
  IF FOUND THEN RETURN jsonb_build_object('item_id', x.item_id, 'repeated', true, 'state', x.state, 'owner', x.owner_principal_id); END IF;
  v_owner := CASE WHEN decision.is_active_human(NULLIF(v ->> 'owner', '')::uuid, c.tenant_id) THEN NULLIF(v ->> 'owner', '')::uuid END;
  SELECT * INTO pol FROM executive.attention_policies a WHERE a.tenant_id = c.tenant_id AND a.domain_id = c.domain_id AND a.state = 'active';
  v_eval := executive.evaluate_attention(CASE WHEN pol.policy_id IS NULL THEN NULL ELSE pol.rules END, 'correction_propagation_stall',
                                         jsonb_build_object('consequence', 'C2', 'confidence', 1, 'hours_to_window', 0)) || jsonb_build_object('policy_version', pol.version);
  v_route := executive.attention_route(pol.rules, 'correction_propagation_stall', v_eval ->> 'outcome', v_owner, c.tenant_id, c.domain_id);
  v_state := v_route ->> 'state';
  INSERT INTO executive.attention_items (item_id, scope, tenant_id, domain_id, signal_class, subject_kind, subject_id, cause_event_id, cause_event_type, title, outcome, state,
                                         owner_principal_id, route_roles, policy_id, policy_version, evaluation, details, due_at, escalations, correlation_id)
  VALUES (v_item, 'DOMAIN', c.tenant_id, c.domain_id, 'correction_propagation_stall', 'correction_case', c.case_id, v_cause, 'CorrectionPropagationStalled',
          left(format('Correction %s: %s is not closed (%s)', left(c.case_id::text, 8), coalesce(v ->> 'title', v ->> 'consumer_ref'), p_reason), 512), v_eval ->> 'outcome', v_state,
          v_owner, ARRAY(SELECT jsonb_array_elements_text(v_route -> 'route_roles')), pol.policy_id, pol.version, v_eval,
          jsonb_build_object('case_id', c.case_id, 'closure_id', c.closure_id, 'consumer_ref', v ->> 'consumer_ref', 'consumer_kind', v ->> 'consumer_kind', 'class', v -> 'class',
                             'state', v ->> 'state', 'deadline', v -> 'deadline', 'reason', p_reason, 'contract_version', p_contract, 'owner', v -> 'owner',
                             'link', '/observation/corrections/' || c.case_id::text),
          (v_route ->> 'due_at')::timestamptz, coalesce((v_route ->> 'escalations')::int, 0), coalesce(p_correlation, gen_random_uuid()));
  PERFORM executive.attention_event(v_item, c.tenant_id, c.domain_id,
            CASE v_state WHEN 'open' THEN 'item.routed' WHEN 'escalated' THEN 'item.escalated' WHEN 'unrouted' THEN 'item.unrouted' ELSE 'item.deprioritized' END, p_actor,
            jsonb_build_object('outcome', v_eval ->> 'outcome', 'reasons', v_eval -> 'reasons', 'policy_version', pol.version, 'owner', v_owner, 'route_roles', v_route -> 'route_roles',
                               'due_at', v_route -> 'due_at', 'cause_event_id', v_cause, 'cause_event_type', 'CorrectionPropagationStalled', 'unrouted', coalesce((v_route ->> 'unrouted')::boolean, false)),
            coalesce(p_correlation, gen_random_uuid()));
  PERFORM graph._cl_event(c, 'consumer.escalated', v ->> 'consumer_ref', p_actor, jsonb_build_object('item_id', v_item, 'state', v_state, 'owner', v_owner, 'reason', p_reason), p_correlation);
  RETURN jsonb_build_object('item_id', v_item, 'repeated', false, 'state', v_state, 'owner', v_owner, 'outcome', v_eval ->> 'outcome');
END $$;
REVOKE ALL ON FUNCTION graph._cl_raise(graph.correction_closures, jsonb, text, int, uuid, uuid) FROM PUBLIC;

-- ─── §CL.7 THE HOOK — objects.publication_frozen (§0's stub re-declared WHOLE: the same signature, STABLE, invoker, read-only) ──────────────
-- THE REACH (DESIGN D7, this part's decision): a live freeze of a correction case answers for (a) the frozen object itself — every version
-- when the freeze names none; (b) any product a walk of that case reached THROUGH the frozen product (a path element names the frozen
-- object: the product cites it, directly or transitively — a briefing resting on a frozen warning, a publication of a frozen package); (c) a
-- decision-package version one of whose options cites the frozen object directly. The current tenant scopes the answer (the callers run
-- under the request's context; a superuser read sees the object's own rows).
CREATE OR REPLACE FUNCTION objects.publication_frozen(p_type text, p_id uuid, p_version int, OUT frozen boolean, OUT case_id uuid)
LANGUAGE plpgsql STABLE SET search_path = objects, pg_catalog, pg_temp AS $$
DECLARE v_case uuid; v_tenant uuid := public.eye_tenant();
BEGIN
  -- B50 cl (a): the object itself
  SELECT f.case_id INTO v_case FROM graph.publication_freezes f
   WHERE f.lifted_at IS NULL AND f.object_id = p_id AND (f.object_version IS NULL OR p_version IS NULL OR f.object_version = p_version)
     AND (v_tenant IS NULL OR f.tenant_id = v_tenant)
   ORDER BY f.frozen_at, f.freeze_id LIMIT 1;
  -- B50 cl (b): reached through a frozen product by a walk of the freezing case
  IF v_case IS NULL THEN
    SELECT f.case_id INTO v_case FROM graph.publication_freezes f
      JOIN graph.affected_products a ON a.correction_case_id = f.case_id AND a.product_id = p_id AND a.tenant_id = f.tenant_id
                                     AND (a.product_version IS NULL OR p_version IS NULL OR a.product_version = p_version)
     WHERE f.lifted_at IS NULL AND f.object_id <> p_id AND (v_tenant IS NULL OR f.tenant_id = v_tenant)
       AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(a.path) x WHERE split_part(split_part(x, ':', 2), '@', 1) = f.object_id::text)
     ORDER BY f.frozen_at, f.freeze_id LIMIT 1;
  END IF;
  -- B50 cl (c): a package version whose option cites the frozen object
  IF v_case IS NULL AND p_type = 'DPK' THEN
    SELECT f.case_id INTO v_case FROM decision.options o CROSS JOIN LATERAL jsonb_array_elements(o.consequences) cq
      JOIN graph.publication_freezes f ON f.lifted_at IS NULL AND f.object_id::text = cq ->> 'id' AND f.tenant_id = o.tenant_id
     WHERE o.package_id = p_id AND o.version = p_version AND (v_tenant IS NULL OR f.tenant_id = v_tenant)
     ORDER BY f.frozen_at, f.freeze_id LIMIT 1;
  END IF;
  frozen := v_case IS NOT NULL;
  case_id := v_case;
  -- end B50 cl
END $$;
REVOKE ALL ON FUNCTION objects.publication_frozen(text, uuid, int) FROM PUBLIC;

-- ─── §CL.8 THE PORTS ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
-- DECLARE the domain's closure contract (a new version; the domain administrator; human-gated).
CREATE OR REPLACE FUNCTION graph.declare_closure_contract(p_contract_id uuid, p_tenant uuid, p_domain uuid, p_windows jsonb, p_exception_max_days int, p_synthetic boolean,
                                                          p_statement text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = graph, executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid; k graph.closure_contracts; v_digest text; v_version int; v_key text; v_val jsonb; v_min numeric;
        v_classes text[] := ARRAY['stale', 'challenged', 'withdrawn', 'recompute', 'human_review', 'subscription'];
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.closure.contract.declare']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  v_actor := graph._cl_person(p_actor, p_tenant);
  IF NOT executive.holds_role(v_actor, p_tenant, p_domain, ARRAY['domain_admin']) THEN
    RAISE EXCEPTION 'correction closure rejected (authority): a closure contract is declared by the domain administrator' USING ERRCODE = '42501';
  END IF;
  IF p_windows IS NULL OR jsonb_typeof(p_windows) <> 'object' THEN
    RAISE EXCEPTION 'correction closure rejected (windows): the contract names an acknowledgement window per consumer class (%)', array_to_string(v_classes, ', ') USING ERRCODE = '22023';
  END IF;
  FOR v_key, v_val IN SELECT * FROM jsonb_each(p_windows) LOOP
    IF NOT (v_key = ANY (v_classes)) THEN RAISE EXCEPTION 'correction closure rejected (windows): % is not a consumer class (%)', v_key, array_to_string(v_classes, ', ') USING ERRCODE = '22023'; END IF;
    IF jsonb_typeof(v_val) <> 'number' OR (v_val #>> '{}')::numeric <> trunc((v_val #>> '{}')::numeric) OR (v_val #>> '{}')::numeric < 1 OR (v_val #>> '{}')::numeric > 31536000 THEN
      RAISE EXCEPTION 'correction closure rejected (windows): the window of % is a whole number of seconds from 1 to 31536000 (a year)', v_key USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM unnest(v_classes) c WHERE NOT (p_windows ? c)) THEN
    RAISE EXCEPTION 'correction closure rejected (windows): every consumer class has its window (%)', array_to_string(v_classes, ', ') USING ERRCODE = '22023';
  END IF;
  SELECT min((x.value #>> '{}')::numeric) INTO v_min FROM jsonb_each(p_windows) x;
  IF v_min < 3600 AND NOT coalesce(p_synthetic, false) THEN
    RAISE EXCEPTION 'correction closure rejected (synthetic): a window under an hour (% s) is a demonstration contract — declare it synthetic', v_min USING ERRCODE = '22023';
  END IF;
  IF p_exception_max_days IS NULL OR p_exception_max_days < 1 OR p_exception_max_days > 365 THEN
    RAISE EXCEPTION 'correction closure rejected (exception_max_days): a bounded exception runs 1 to 365 days at most' USING ERRCODE = '22023';
  END IF;
  IF p_statement IS NULL OR length(btrim(p_statement)) NOT BETWEEN 16 AND 2000 THEN
    RAISE EXCEPTION 'correction closure rejected (statement): the contract states its basis in 16 to 2000 characters' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('graph.closure_contract:' || p_tenant::text || ':' || p_domain::text, 0));
  IF EXISTS (SELECT 1 FROM graph.closure_contracts x WHERE x.contract_id = p_contract_id) THEN
    SELECT * INTO k FROM graph.closure_contracts x WHERE x.contract_id = p_contract_id;
    IF k.tenant_id <> p_tenant OR k.domain_id <> p_domain THEN RAISE EXCEPTION 'correction closure rejected (duplicate): contract id % is taken', p_contract_id USING ERRCODE = '23505'; END IF;
    RETURN to_jsonb(k) || jsonb_build_object('repeated', true);
  END IF;
  v_digest := encode(sha256(convert_to(jsonb_build_object('windows', p_windows, 'exception_max_days', p_exception_max_days, 'synthetic', coalesce(p_synthetic, false))::text, 'UTF8')), 'hex');
  k := graph._cl_contract(p_tenant, p_domain);
  IF k.contract_id IS NOT NULL AND k.contract_digest = v_digest THEN
    RAISE EXCEPTION 'correction closure rejected (duplicate): the windows are unchanged from version %; a version records a change', k.version USING ERRCODE = '22023';
  END IF;
  v_version := coalesce(k.version, 0) + 1;
  INSERT INTO graph.closure_contracts (contract_id, scope, tenant_id, domain_id, version, windows, exception_max_days, synthetic, statement, contract_digest, declared_by, correlation_id)
  VALUES (p_contract_id, 'DOMAIN', p_tenant, p_domain, v_version, p_windows, p_exception_max_days, coalesce(p_synthetic, false), btrim(p_statement), v_digest, v_actor, p_correlation)
  RETURNING * INTO k;
  RETURN to_jsonb(k) || jsonb_build_object('repeated', false, 'supersedes', CASE WHEN v_version = 1 THEN NULL ELSE v_version - 1 END);
END $$;
REVOKE ALL ON FUNCTION graph.declare_closure_contract(uuid, uuid, uuid, jsonb, int, boolean, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.declare_closure_contract(uuid, uuid, uuid, jsonb, int, boolean, text, uuid, uuid) TO eye_commit;

-- ACKNOWLEDGE (or RECOMPUTED) one consumer of a case — its closer (graph._cl_assert_closer); idempotent on the ack id.
CREATE OR REPLACE FUNCTION graph.acknowledge_consumer(p_ack_id uuid, p_tenant uuid, p_domain uuid, p_case uuid, p_consumer_ref text, p_state text, p_note text, p_recompute_ref text,
                                                      p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = graph, executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid; c graph.correction_closures; v jsonb; a graph.consumer_acknowledgements; v_basis text; v_now timestamptz := clock_timestamp();
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.closure.acknowledge']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  v_actor := graph._cl_person(p_actor, p_tenant);
  SELECT * INTO a FROM graph.consumer_acknowledgements x WHERE x.ack_id = p_ack_id;
  IF FOUND THEN
    IF a.case_id <> p_case OR a.consumer_ref <> p_consumer_ref OR a.recorded_by <> v_actor THEN RAISE EXCEPTION 'correction closure rejected (duplicate): acknowledgement id % is another act''s', p_ack_id USING ERRCODE = '23505'; END IF;
    RETURN to_jsonb(a) || jsonb_build_object('repeated', true);
  END IF;
  c := graph._cl_lock(p_tenant, p_domain, p_case);
  IF c.state = 'closed' THEN RAISE EXCEPTION 'correction closure rejected (state): correction case % is closed', p_case USING ERRCODE = '22023'; END IF;
  IF p_state NOT IN ('acknowledged', 'recomputed') THEN RAISE EXCEPTION 'correction closure rejected (ack_state): an acknowledgement is acknowledged or recomputed (an exception is its own act)' USING ERRCODE = '22023'; END IF;
  IF p_note IS NULL OR length(btrim(p_note)) NOT BETWEEN 8 AND 2000 THEN RAISE EXCEPTION 'correction closure rejected (note): the acknowledgement says what was reviewed, in 8 to 2000 characters' USING ERRCODE = '22023'; END IF;
  v := graph._cl_consumer(p_tenant, p_domain, c, p_consumer_ref, v_now);
  IF NOT (v ->> 'material')::boolean THEN RAISE EXCEPTION 'correction closure rejected (state): % is current — it already reflects the correction and needs no acknowledgement', p_consumer_ref USING ERRCODE = '22023'; END IF;
  IF (v ->> 'state') IN ('acknowledged', 'recomputed') THEN RAISE EXCEPTION 'correction closure rejected (state): % is already %', p_consumer_ref, v ->> 'state' USING ERRCODE = '22023'; END IF;
  IF v ->> 'consumer_kind' = 'subscription' AND p_state = 'recomputed' THEN RAISE EXCEPTION 'correction closure rejected (ack_state): a subscription consumer is acknowledged (after its failure) or excepted, never recomputed' USING ERRCODE = '22023'; END IF;
  IF v ->> 'consumer_kind' = 'subscription' AND v ->> 'state' <> 'failed' THEN RAISE EXCEPTION 'correction closure rejected (state): subscription % is %; its own ledger acknowledges an applied delivery, a person acknowledges a failed one', p_consumer_ref, v ->> 'state' USING ERRCODE = '22023'; END IF;
  IF p_state = 'recomputed' AND v ->> 'class' = 'human_review' THEN
    RAISE EXCEPTION 'correction closure rejected (no_rewrite): % is a person''s decision or commitment — it is reviewed and acknowledged by its owner, never recomputed (no automatic rewrite)', p_consumer_ref USING ERRCODE = '22023';
  END IF;
  v_basis := graph._cl_assert_closer(p_tenant, p_domain, c, v, v_actor, CASE WHEN v ->> 'consumer_kind' = 'subscription' THEN ARRAY['domain_admin'] ELSE NULL END);
  IF p_state = 'recomputed' AND NOT graph._cl_recompute_ok(p_tenant, p_domain, p_recompute_ref, c.opened_at) THEN
    RAISE EXCEPTION 'correction closure rejected (unknown_recompute): % is not a record of this domain made after the correction was applied', p_recompute_ref USING ERRCODE = '23503';
  END IF;
  INSERT INTO graph.consumer_acknowledgements (ack_id, scope, tenant_id, domain_id, closure_id, case_id, consumer_kind, consumer_ref, product_kind, object_type, product_id, product_version,
                                               affected_id, affected_class, subscription_id, state, note, recompute_ref, recorded_by, correlation_id)
  VALUES (p_ack_id, 'DOMAIN', p_tenant, p_domain, c.closure_id, p_case, v ->> 'consumer_kind', p_consumer_ref, v ->> 'product_kind', v ->> 'object_type', NULLIF(v ->> 'product_id', '')::uuid,
          NULLIF(v ->> 'product_version', '')::int, NULLIF(v ->> 'affected_id', '')::uuid, v ->> 'class', NULLIF(v ->> 'subscription_id', '')::uuid, p_state, btrim(p_note),
          CASE WHEN p_state = 'recomputed' THEN p_recompute_ref END, v_actor, p_correlation)
  RETURNING * INTO a;
  PERFORM graph._cl_event(c, CASE p_state WHEN 'recomputed' THEN 'consumer.recomputed' ELSE 'consumer.acknowledged' END, p_consumer_ref, v_actor,
                          jsonb_build_object('ack_id', p_ack_id, 'class', v -> 'class', 'basis', v_basis, 'recompute_ref', a.recompute_ref, 'prior_state', v ->> 'state'), p_correlation);
  RETURN to_jsonb(a) || jsonb_build_object('repeated', false, 'basis', v_basis, 'prior_state', v ->> 'state');
END $$;
REVOKE ALL ON FUNCTION graph.acknowledge_consumer(uuid, uuid, uuid, uuid, text, text, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.acknowledge_consumer(uuid, uuid, uuid, uuid, text, text, text, text, uuid, uuid) TO eye_commit;

-- A BOUNDED EXCEPTION for one consumer: reason, expiry (within the contract's limit), the owner who answers for it. Under a legal hold on a
-- corrected object, the exception is the record authority's (V03-T-302).
CREATE OR REPLACE FUNCTION graph.except_consumer(p_ack_id uuid, p_tenant uuid, p_domain uuid, p_case uuid, p_consumer_ref text, p_reason text, p_expires_at timestamptz, p_owner uuid,
                                                 p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = graph, executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid; c graph.correction_closures; v jsonb; a graph.consumer_acknowledgements; k graph.closure_contracts; v_now timestamptz := clock_timestamp(); v_max int; v_basis text; v_held jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.closure.except']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  v_actor := graph._cl_person(p_actor, p_tenant);
  SELECT * INTO a FROM graph.consumer_acknowledgements x WHERE x.ack_id = p_ack_id;
  IF FOUND THEN
    IF a.case_id <> p_case OR a.consumer_ref <> p_consumer_ref OR a.recorded_by <> v_actor THEN RAISE EXCEPTION 'correction closure rejected (duplicate): acknowledgement id % is another act''s', p_ack_id USING ERRCODE = '23505'; END IF;
    RETURN to_jsonb(a) || jsonb_build_object('repeated', true);
  END IF;
  c := graph._cl_lock(p_tenant, p_domain, p_case);
  IF c.state = 'closed' THEN RAISE EXCEPTION 'correction closure rejected (state): correction case % is closed', p_case USING ERRCODE = '22023'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 16 AND 2000 THEN RAISE EXCEPTION 'correction closure rejected (reason): a bounded exception states its reason in 16 to 2000 characters' USING ERRCODE = '22023'; END IF;
  k := graph._cl_contract(p_tenant, p_domain);
  v_max := coalesce(k.exception_max_days, 30);
  IF p_expires_at IS NULL OR p_expires_at <= v_now OR p_expires_at > v_now + make_interval(days => v_max) THEN
    RAISE EXCEPTION 'correction closure rejected (expiry): a bounded exception expires after now and within % day(s)%', v_max, CASE WHEN k.contract_id IS NULL THEN ' (no contract declared: 30 days)' ELSE format(' (contract version %s)', k.version) END USING ERRCODE = '22023';
  END IF;
  IF p_owner IS NULL OR NOT decision.is_active_human(p_owner, p_tenant) THEN
    RAISE EXCEPTION 'correction closure rejected (owner): a bounded exception names its owner — an active human of this tenant' USING ERRCODE = '22023';
  END IF;
  v := graph._cl_consumer(p_tenant, p_domain, c, p_consumer_ref, v_now);
  IF NOT (v ->> 'material')::boolean THEN RAISE EXCEPTION 'correction closure rejected (state): % is current — it needs no exception', p_consumer_ref USING ERRCODE = '22023'; END IF;
  IF (v ->> 'state') IN ('acknowledged', 'recomputed', 'delivered') THEN RAISE EXCEPTION 'correction closure rejected (state): % is already %', p_consumer_ref, v ->> 'state' USING ERRCODE = '22023'; END IF;
  v_basis := graph._cl_assert_closer(p_tenant, p_domain, c, v, v_actor, ARRAY['record_authority', 'domain_admin']);
  v_held := graph._cl_scope(p_tenant, p_domain, p_case) -> 'held_roots';
  IF jsonb_array_length(coalesce(v_held, '[]'::jsonb)) > 0 AND NOT executive.holds_role(p_owner, p_tenant, p_domain, ARRAY['record_authority']) THEN
    RAISE EXCEPTION 'correction closure rejected (held): a corrected object of case % is under legal hold — the exception is routed to the record authority (its owner holds record_authority)', p_case USING ERRCODE = '22023';
  END IF;
  INSERT INTO graph.consumer_acknowledgements (ack_id, scope, tenant_id, domain_id, closure_id, case_id, consumer_kind, consumer_ref, product_kind, object_type, product_id, product_version,
                                               affected_id, affected_class, subscription_id, state, exception_reason, exception_expires_at, exception_owner, recorded_by, correlation_id)
  VALUES (p_ack_id, 'DOMAIN', p_tenant, p_domain, c.closure_id, p_case, v ->> 'consumer_kind', p_consumer_ref, v ->> 'product_kind', v ->> 'object_type', NULLIF(v ->> 'product_id', '')::uuid,
          NULLIF(v ->> 'product_version', '')::int, NULLIF(v ->> 'affected_id', '')::uuid, v ->> 'class', NULLIF(v ->> 'subscription_id', '')::uuid, 'bounded_exception',
          btrim(p_reason), p_expires_at, p_owner, v_actor, p_correlation)
  RETURNING * INTO a;
  PERFORM graph._cl_event(c, 'consumer.excepted', p_consumer_ref, v_actor,
                          jsonb_build_object('ack_id', p_ack_id, 'class', v -> 'class', 'basis', v_basis, 'reason', btrim(p_reason), 'expires_at', p_expires_at, 'owner', p_owner,
                                             'legal_hold', jsonb_array_length(coalesce(v_held, '[]'::jsonb)) > 0), p_correlation);
  RETURN to_jsonb(a) || jsonb_build_object('repeated', false, 'basis', v_basis, 'prior_state', v ->> 'state');
END $$;
REVOKE ALL ON FUNCTION graph.except_consumer(uuid, uuid, uuid, uuid, text, text, timestamptz, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.except_consumer(uuid, uuid, uuid, uuid, text, text, timestamptz, uuid, uuid, uuid) TO eye_commit;

-- FREEZE an affected product of an open case by a steward's act (a consumer that cannot reconcile; DP-24-005).
CREATE OR REPLACE FUNCTION graph.freeze_consumer_product(p_tenant uuid, p_domain uuid, p_case uuid, p_consumer_ref text, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = graph, executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid; c graph.correction_closures; v jsonb; v_new boolean;
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.closure.freeze']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  v_actor := graph._cl_person(p_actor, p_tenant);
  IF NOT executive.holds_role(v_actor, p_tenant, p_domain, ARRAY['domain_admin', 'collection_manager', 'knowledge_owner', 'data_steward']) THEN
    RAISE EXCEPTION 'correction closure rejected (authority): a freeze is a domain administrator''s, collection manager''s, knowledge owner''s or data steward''s act' USING ERRCODE = '42501';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 16 AND 2000 THEN RAISE EXCEPTION 'correction closure rejected (reason): a freeze states its reason in 16 to 2000 characters' USING ERRCODE = '22023'; END IF;
  c := graph._cl_lock(p_tenant, p_domain, p_case);
  IF c.state = 'closed' THEN RAISE EXCEPTION 'correction closure rejected (state): correction case % is closed', p_case USING ERRCODE = '22023'; END IF;
  v := graph._cl_consumer(p_tenant, p_domain, c, p_consumer_ref, clock_timestamp());
  IF v ->> 'consumer_kind' <> 'affected_product' OR NOT (v ->> 'material')::boolean OR (v ->> 'closing')::boolean THEN
    RAISE EXCEPTION 'correction closure rejected (state): % is not an open material product of case % (it is %)', p_consumer_ref, p_case, v ->> 'state' USING ERRCODE = '22023';
  END IF;
  v_new := graph._cl_freeze(c, v ->> 'object_type', NULLIF(v ->> 'product_id', '')::uuid, NULLIF(v ->> 'product_version', '')::int, p_consumer_ref, 'manual', btrim(p_reason), v_actor, p_correlation);
  RETURN jsonb_build_object('case_id', p_case, 'consumer_ref', p_consumer_ref, 'frozen', true, 'repeated', NOT v_new);
END $$;
REVOKE ALL ON FUNCTION graph.freeze_consumer_product(uuid, uuid, uuid, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.freeze_consumer_product(uuid, uuid, uuid, text, text, uuid, uuid) TO eye_commit;

-- LIFT one freeze before the case closes — only once what it guards is resolved: the product's consumer closed, or (a corrected object frozen
-- for an unknown scope) the propagation complete with no truncated walk. The correction authority or the domain administrator; human-gated.
CREATE OR REPLACE FUNCTION graph.lift_publication_freeze(p_freeze_id uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = graph, executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid; f graph.publication_freezes; c graph.correction_closures; k graph.closure_contracts; v jsonb; v_scope jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.closure.freeze.lift']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  v_actor := graph._cl_person(p_actor, p_tenant);
  IF NOT executive.holds_role(v_actor, p_tenant, p_domain, ARRAY['domain_admin', 'collection_manager']) THEN
    RAISE EXCEPTION 'correction closure rejected (authority): a freeze is lifted by the correction authority (collection manager) or the domain administrator' USING ERRCODE = '42501';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 16 AND 2000 THEN RAISE EXCEPTION 'correction closure rejected (reason): lifting a freeze states its reason in 16 to 2000 characters' USING ERRCODE = '22023'; END IF;
  SELECT * INTO f FROM graph.publication_freezes x WHERE x.freeze_id = p_freeze_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'correction closure rejected (unknown_freeze): no freeze % in this domain', p_freeze_id USING ERRCODE = '23503'; END IF;
  IF f.lifted_at IS NOT NULL THEN RAISE EXCEPTION 'correction closure rejected (state): freeze % was lifted at %', p_freeze_id, f.lifted_at USING ERRCODE = '22023'; END IF;
  c := graph._cl_lock(p_tenant, p_domain, f.case_id);
  IF f.reason_kind = 'scope_unknown' THEN
    v_scope := graph._cl_scope(p_tenant, p_domain, f.case_id);
    IF v_scope ->> 'propagation_state' <> 'complete' OR jsonb_array_length(v_scope -> 'truncated_roots') > 0 THEN
      RAISE EXCEPTION 'correction closure rejected (held): the impact scope of case % is still unknown (propagation %, % truncated walk(s)); the freeze stands', f.case_id, v_scope ->> 'propagation_state', jsonb_array_length(v_scope -> 'truncated_roots') USING ERRCODE = '22023';
    END IF;
  ELSE
    k := graph._cl_contract(p_tenant, p_domain);
    SELECT x INTO v FROM jsonb_array_elements(graph._cl_consumers_json(p_tenant, p_domain, f.case_id, clock_timestamp(), k.windows, c.opened_at)) x WHERE x ->> 'product_id' = f.object_id::text LIMIT 1;
    IF v IS NOT NULL AND NOT (v ->> 'closing')::boolean THEN
      RAISE EXCEPTION 'correction closure rejected (held): % is still % — it is acknowledged, recomputed or excepted before its freeze lifts', f.product_ref, v ->> 'state' USING ERRCODE = '22023';
    END IF;
  END IF;
  UPDATE graph.publication_freezes SET lifted_at = clock_timestamp(), lifted_by = v_actor, lift_kind = 'consumer_closed', lift_reason = btrim(p_reason) WHERE freeze_id = p_freeze_id RETURNING * INTO f;
  PERFORM graph._cl_event(c, 'freeze.lifted', f.product_ref, v_actor, jsonb_build_object('freeze_id', p_freeze_id, 'lift_kind', 'consumer_closed', 'reason', btrim(p_reason)), p_correlation);
  RETURN to_jsonb(f);
END $$;
REVOKE ALL ON FUNCTION graph.lift_publication_freeze(uuid, uuid, uuid, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.lift_publication_freeze(uuid, uuid, uuid, text, uuid, uuid) TO eye_commit;

/*
 * THE SWEEP (DF-12, DP-24-005; DESIGN D8) — on the DATABASE clock. The attention tick's step (executive.attention.tick, the attention agent)
 * and a person's route (graph.closure.sweep: the correction authority or the domain administrator). Per open or stalled case of the domain
 * (bounded: 100 per call, oldest first):
 *   1. every FAILED or REFUSED delivery of the case's change events is recorded once as a `failed` consumer row (the ledger's evidence);
 *   2. a truncated walk freezes its corrected object (impact scope unknown); a WITHDRAWN product still reached freezes at once;
 *   3. a consumer past its window (the contract in force) or with a failed delivery STALLS the case: the case is stalled, every pending
 *      material product freezes, and each stalled consumer is routed to its owner as a correction_propagation_stall attention item.
 * Idempotent: a freeze is once per (case, object); an item once per (case, consumer); the stall once.
 */
CREATE OR REPLACE FUNCTION graph.sweep_correction_closures(p_tenant uuid, p_domain uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = graph, executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_action text; v_now timestamptz := clock_timestamp(); k graph.closure_contracts; c graph.correction_closures; v jsonb; r record; v_scope jsonb; v_cons jsonb;
        v_stalled jsonb; v_out jsonb := '[]'::jsonb; v_frozen int; v_failed int; v_items jsonb; v_reason text; v_root text; v_n int := 0;
BEGIN
  v_action := observation.assert_authority(ARRAY['executive.attention.tick', 'graph.closure.sweep']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS NULL OR p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'correction closure rejected (actor): the sweep runs as the acting principal' USING ERRCODE = '42501'; END IF;
  IF v_action = 'graph.closure.sweep' THEN
    PERFORM graph._cl_person(p_actor, p_tenant);
    IF NOT executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['domain_admin', 'collection_manager']) THEN
      RAISE EXCEPTION 'correction closure rejected (authority): a person''s sweep is the correction authority''s (collection manager) or the domain administrator''s' USING ERRCODE = '42501';
    END IF;
  END IF;
  k := graph._cl_contract(p_tenant, p_domain);
  FOR c IN SELECT * FROM graph.correction_closures x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.state IN ('open', 'stalled') ORDER BY x.opened_at, x.closure_id LIMIT 100 FOR UPDATE SKIP LOCKED LOOP
    v_n := v_n + 1; v_frozen := 0; v_failed := 0; v_items := '[]'::jsonb; v_stalled := '[]'::jsonb;
    -- 1. the failed deliveries, recorded once each
    FOR r IN SELECT d.subscription_id, d.event_id, d.state, d.failure_class, d.last_error, d.finished_at
               FROM graph.subscription_deliveries d JOIN objects.object_outbox o ON o.id = d.event_id
              WHERE d.tenant_id = p_tenant AND d.domain_id = p_domain AND d.state IN ('failed', 'refused') AND o.event_type IN ('GraphChanged', 'MemoryCorrected')
                AND o.payload #>> '{change,correction_case_id}' = c.case_id::text
                AND NOT EXISTS (SELECT 1 FROM graph.consumer_acknowledgements a WHERE a.case_id = c.case_id AND a.subscription_id = d.subscription_id AND a.delivery_event_id = d.event_id AND a.state = 'failed') LOOP
      INSERT INTO graph.consumer_acknowledgements (ack_id, scope, tenant_id, domain_id, closure_id, case_id, consumer_kind, consumer_ref, subscription_id, delivery_event_id, state, note, recorded_by, correlation_id)
      VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, c.closure_id, c.case_id, 'subscription', 'SUB:' || r.subscription_id::text, r.subscription_id, r.event_id, 'failed',
              left(format('delivery %s %s%s', r.state, coalesce(r.failure_class, 'unclassed'), CASE WHEN r.last_error IS NULL THEN '' ELSE ': ' || r.last_error END), 2000), p_actor, coalesce(p_correlation, gen_random_uuid()));
      PERFORM graph._cl_event(c, 'consumer.failed', 'SUB:' || r.subscription_id::text, p_actor, jsonb_build_object('delivery_event_id', r.event_id, 'state', r.state, 'failure_class', r.failure_class, 'finished_at', r.finished_at), p_correlation);
      v_failed := v_failed + 1;
    END LOOP;
    -- 2. the immediate freezes: an unknown scope, a withdrawn product still reached
    v_scope := graph._cl_scope(p_tenant, p_domain, c.case_id);
    FOR v_root IN SELECT jsonb_array_elements_text(coalesce(v_scope -> 'truncated_roots', '[]'::jsonb)) LOOP
      IF graph._cl_freeze(c, coalesce((SELECT o.object_type FROM objects.canonical_objects o WHERE o.object_id = v_root::uuid LIMIT 1), 'EVD'), v_root::uuid, NULL,
                          coalesce((SELECT o.object_type FROM objects.canonical_objects o WHERE o.object_id = v_root::uuid LIMIT 1), 'EVD') || ':' || v_root,
                          'scope_unknown', 'the latest walk of this corrected object was truncated: what rests on it is not fully known', p_actor, p_correlation) THEN v_frozen := v_frozen + 1; END IF;
    END LOOP;
    v_cons := graph._cl_consumers_json(p_tenant, p_domain, c.case_id, v_now, k.windows, c.opened_at);
    FOR v IN SELECT x FROM jsonb_array_elements(v_cons) x WHERE x ->> 'consumer_kind' = 'affected_product' AND x ->> 'class' = 'withdrawn' AND NOT (x ->> 'closing')::boolean LOOP
      IF graph._cl_freeze(c, v ->> 'object_type', NULLIF(v ->> 'product_id', '')::uuid, NULLIF(v ->> 'product_version', '')::int, v ->> 'consumer_ref', 'withdrawn_active',
                          'a withdrawn product is still reached by the correction and must not stay decision-active', p_actor, p_correlation) THEN v_frozen := v_frozen + 1; END IF;
    END LOOP;
    -- 3. the stall: a consumer past its window, or a failed delivery
    SELECT coalesce(jsonb_agg(x), '[]'::jsonb) INTO v_stalled FROM jsonb_array_elements(v_cons) x WHERE (x ->> 'overdue')::boolean;
    IF jsonb_array_length(v_stalled) > 0 THEN
      IF c.state = 'open' THEN
        UPDATE graph.correction_closures SET state = 'stalled', stalled_at = v_now,
               stall_reasons = (SELECT coalesce(jsonb_agg(jsonb_build_object('consumer_ref', x ->> 'consumer_ref', 'state', x ->> 'state', 'deadline', x -> 'deadline',
                                                                             'reason', CASE WHEN x ->> 'state' = 'failed' THEN 'delivery_failed' ELSE 'window_passed' END)), '[]'::jsonb) FROM jsonb_array_elements(v_stalled) x)
         WHERE closure_id = c.closure_id RETURNING * INTO c;
        PERFORM graph._cl_event(c, 'closure.stalled', NULL, p_actor, jsonb_build_object('stalled', c.stall_reasons, 'contract_version', k.version, 'at', v_now), p_correlation);
      END IF;
      v_reason := CASE WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(v_stalled) x WHERE x ->> 'state' = 'failed') THEN 'delivery_failed' ELSE 'stall' END;
      FOR v IN SELECT x FROM jsonb_array_elements(v_cons) x WHERE x ->> 'consumer_kind' = 'affected_product' AND (x ->> 'material')::boolean AND NOT (x ->> 'closing')::boolean LOOP
        IF graph._cl_freeze(c, v ->> 'object_type', NULLIF(v ->> 'product_id', '')::uuid, NULLIF(v ->> 'product_version', '')::int, v ->> 'consumer_ref', v_reason,
                            CASE v_reason WHEN 'delivery_failed' THEN 'a consumer''s delivery of the correction failed: the case stalled and its open products freeze until they are owned'
                                          ELSE 'a consumer is past its acknowledgement window: the case stalled and its open products freeze until they are owned' END, p_actor, p_correlation) THEN v_frozen := v_frozen + 1; END IF;
      END LOOP;
      FOR v IN SELECT x FROM jsonb_array_elements(v_stalled) x LOOP
        v_items := v_items || graph._cl_raise(c, v, CASE WHEN v ->> 'state' = 'failed' THEN 'its delivery failed' ELSE 'past its acknowledgement window' END, k.version, p_actor, p_correlation);
      END LOOP;
    END IF;
    v_out := v_out || jsonb_build_object('case_id', c.case_id, 'state', c.state, 'stalled', jsonb_array_length(v_stalled), 'frozen_now', v_frozen, 'failed_recorded', v_failed, 'items', v_items);
  END LOOP;
  RETURN jsonb_build_object('at', v_now, 'by', v_action, 'contract_version', k.version, 'cases', v_n, 'swept', v_out);
END $$;
REVOKE ALL ON FUNCTION graph.sweep_correction_closures(uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.sweep_correction_closures(uuid, uuid, uuid, uuid) TO eye_commit;

/*
 * CLOSE a correction case (ES-30-005, V03-T-297) — the correction authority (collection manager) or the domain administrator; human-gated.
 * Refused unless graph._cl_readiness says ready WITH the projection check; then the record is written whole and digested, the case's freezes
 * lift, its stall items close (their purpose served), and the closure instant is the one MET-010 v2 measures to.
 */
CREATE OR REPLACE FUNCTION graph.close_correction_case(p_tenant uuid, p_domain uuid, p_case uuid, p_statement text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = graph, executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid; c graph.correction_closures; cs observation.correction_current; v_now timestamptz := clock_timestamp(); v_ready jsonb; v_cons jsonb; v_failed jsonb; v_residual jsonb;
        v_acks jsonb; v_record jsonb; v_digest text; v_lifted int; v_items int := 0; v_item executive.attention_items%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.closure.close']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  v_actor := graph._cl_person(p_actor, p_tenant);
  IF NOT executive.holds_role(v_actor, p_tenant, p_domain, ARRAY['collection_manager', 'domain_admin']) THEN
    RAISE EXCEPTION 'correction closure rejected (authority): a correction case is closed by the correction authority (collection manager) or the domain administrator' USING ERRCODE = '42501';
  END IF;
  IF p_statement IS NULL OR length(btrim(p_statement)) NOT BETWEEN 16 AND 2000 THEN
    RAISE EXCEPTION 'correction closure rejected (statement): the closure states what was reconciled, in 16 to 2000 characters' USING ERRCODE = '22023';
  END IF;
  c := graph._cl_lock(p_tenant, p_domain, p_case);
  IF c.state = 'closed' THEN RAISE EXCEPTION 'correction closure rejected (state): correction case % was closed at % by %', p_case, c.closed_at, c.closed_by USING ERRCODE = '22023'; END IF;
  v_ready := graph._cl_readiness(p_tenant, p_domain, p_case, v_now, true);
  IF NOT (v_ready ->> 'ready')::boolean THEN
    RAISE EXCEPTION 'correction closure rejected (held): case % does not close yet — %', p_case, (SELECT string_agg(r, '; ') FROM jsonb_array_elements_text(v_ready -> 'reasons') r) USING ERRCODE = '22023';
  END IF;
  SELECT * INTO cs FROM observation.correction_current x WHERE x.case_id = p_case;
  v_cons := v_ready -> 'consumers';
  SELECT coalesce(jsonb_agg(jsonb_build_object('ref', a.consumer_ref, 'subscription_id', a.subscription_id, 'delivery_event_id', a.delivery_event_id, 'failure', a.note, 'recorded_at', a.recorded_at) ORDER BY a.recorded_at), '[]'::jsonb)
    INTO v_failed FROM graph.consumer_acknowledgements a WHERE a.case_id = p_case AND a.state = 'failed';
  SELECT coalesce(jsonb_agg(jsonb_build_object('ref', y ->> 'consumer_ref', 'class', y -> 'class', 'exception', y #> '{ack,exception}') ORDER BY y ->> 'consumer_ref'), '[]'::jsonb)
    INTO v_residual FROM jsonb_array_elements(v_cons) y WHERE y ->> 'state' = 'bounded_exception';
  SELECT coalesce(jsonb_agg(jsonb_build_object('ack_id', a.ack_id, 'consumer_kind', a.consumer_kind, 'consumer_ref', a.consumer_ref, 'state', a.state, 'class', a.affected_class, 'by', a.recorded_by,
                                               'at', a.recorded_at, 'note', a.note, 'recompute_ref', a.recompute_ref,
                                               'exception', CASE WHEN a.state = 'bounded_exception' THEN jsonb_build_object('reason', a.exception_reason, 'expires_at', a.exception_expires_at, 'owner', a.exception_owner) END)
                            ORDER BY a.recorded_at, a.ack_id), '[]'::jsonb)
    INTO v_acks FROM graph.consumer_acknowledgements a WHERE a.case_id = p_case;
  v_record := jsonb_build_object(
    'schema', 'eye.correction-closure/1', 'closure_id', c.closure_id, 'case_id', p_case,
    'case', jsonb_build_object('kind', cs.kind, 'source_id', cs.source_id, 'reason', cs.reason, 'received_at', cs.received_at, 'applied_at', cs.closed_at, 'applied_by', graph._cl_applier(p_case),
                               'target_versions', cs.affected_resolved, 'propagation_state', cs.propagation_state),
    'opened_at', c.opened_at, 'opened_via', c.opened_via, 'stalled_at', c.stalled_at, 'stall_reasons', c.stall_reasons,
    'closed_at', v_now, 'closed_by', v_actor, 'statement', btrim(p_statement), 'contract_version', v_ready -> 'contract_version',
    'reached_consumers', jsonb_array_length(v_cons), 'consumers', v_cons, 'failed_deliveries', v_failed, 'residual_exposure', v_residual, 'acknowledgements', v_acks,
    'projections', v_ready -> 'projections', 'scope', v_ready -> 'scope',
    'events', (SELECT coalesce(jsonb_agg(jsonb_build_object('event_id', e.event_id, 'event', e.event, 'ref', e.consumer_ref, 'actor', e.actor_principal_id, 'at', e.occurred_at) ORDER BY e.occurred_at, e.event_id), '[]'::jsonb)
                 FROM graph.correction_closure_events e WHERE e.case_id = p_case),
    'correction_events', (SELECT coalesce(jsonb_agg(jsonb_build_object('event_id', e.event_id, 'event', e.event, 'actor', e.actor, 'at', e.occurred_at) ORDER BY e.occurred_at, e.event_id), '[]'::jsonb)
                            FROM observation.correction_events e WHERE e.case_id = p_case));
  v_digest := encode(sha256(convert_to(v_record::text, 'UTF8')), 'hex');
  UPDATE graph.correction_closures SET state = 'closed', closed_at = v_now, closed_by = v_actor, statement = btrim(p_statement), reached_consumers = jsonb_array_length(v_cons),
         failed_deliveries = v_failed, residual_exposure = v_residual, acknowledgements = v_acks, projections = v_ready -> 'projections', projections_reconciled = true,
         contract_version = NULLIF(v_ready ->> 'contract_version', '')::int, audit_digest = v_digest, record = v_record
   WHERE closure_id = c.closure_id;
  -- the case's freezes lift (their purpose served); its stall items close
  UPDATE graph.publication_freezes SET lifted_at = v_now, lifted_by = v_actor, lift_kind = 'closure', lift_reason = 'the correction case closed with every material consumer owned'
   WHERE case_id = p_case AND lifted_at IS NULL;
  GET DIAGNOSTICS v_lifted = ROW_COUNT;
  FOR v_item IN SELECT * FROM executive.attention_items i WHERE i.tenant_id = p_tenant AND i.domain_id = p_domain AND i.signal_class = 'correction_propagation_stall' AND i.subject_id = p_case AND i.state <> 'closed' FOR UPDATE LOOP
    UPDATE executive.attention_items SET state = 'closed', closed_at = v_now, closed_by = v_actor, suppressed_until = NULL, updated_at = v_now WHERE item_id = v_item.item_id;
    PERFORM executive.attention_event(v_item.item_id, p_tenant, p_domain, 'item.closed', v_actor, jsonb_build_object('from_state', v_item.state, 'note', 'the correction case closed (graph.close_correction_case)', 'case_id', p_case), coalesce(p_correlation, gen_random_uuid()));
    v_items := v_items + 1;
  END LOOP;
  SELECT * INTO c FROM graph.correction_closures WHERE closure_id = c.closure_id;
  PERFORM graph._cl_event(c, 'closure.closed', NULL, v_actor, jsonb_build_object('audit_digest', v_digest, 'reached_consumers', jsonb_array_length(v_cons), 'freezes_lifted', v_lifted, 'items_closed', v_items), p_correlation);
  RETURN v_record || jsonb_build_object('audit_digest', v_digest, 'freezes_lifted', v_lifted, 'items_closed', v_items, 'duration_seconds', round(extract(epoch FROM (v_now - cs.received_at))::numeric, 3));
END $$;
REVOKE ALL ON FUNCTION graph.close_correction_case(uuid, uuid, uuid, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.close_correction_case(uuid, uuid, uuid, text, uuid, uuid) TO eye_commit;

-- ADOPT an older applied case (DESIGN D9): a closure record for a case applied before 0120 — the correction authority's or the domain
-- administrator's governed act, never automatic. The windows run from the APPLY instant: an old case's consumers are past them at once
-- (the answer says how many), so its open products freeze at the next sweep.
CREATE OR REPLACE FUNCTION graph.adopt_correction_case(p_tenant uuid, p_domain uuid, p_case uuid, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = graph, executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid; cs observation.correction_current; c graph.correction_closures; k graph.closure_contracts; v_now timestamptz := clock_timestamp(); v_cons jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.closure.adopt']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  v_actor := graph._cl_person(p_actor, p_tenant);
  IF NOT executive.holds_role(v_actor, p_tenant, p_domain, ARRAY['collection_manager', 'domain_admin']) THEN
    RAISE EXCEPTION 'correction closure rejected (authority): an older case is adopted by the correction authority (collection manager) or the domain administrator' USING ERRCODE = '42501';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 16 AND 2000 THEN RAISE EXCEPTION 'correction closure rejected (reason): the adoption states its reason in 16 to 2000 characters' USING ERRCODE = '22023'; END IF;
  SELECT * INTO cs FROM observation.correction_current x WHERE x.case_id = p_case AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'correction closure rejected (unknown_case): no correction case % in this domain', p_case USING ERRCODE = '23503'; END IF;
  IF cs.state <> 'applied' THEN RAISE EXCEPTION 'correction closure rejected (state): case % is %; only an applied case is adopted', p_case, cs.state USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM graph.correction_closures x WHERE x.case_id = p_case) THEN
    RAISE EXCEPTION 'correction closure rejected (duplicate): case % already has a closure record', p_case USING ERRCODE = '22023';
  END IF;
  INSERT INTO graph.correction_closures (closure_id, scope, tenant_id, domain_id, case_id, opened_at, opened_via, adopted_by, adopted_at, adopt_reason, state, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_case, coalesce(cs.closed_at, v_now), 'adopted', v_actor, v_now, btrim(p_reason), 'open', p_correlation)
  RETURNING * INTO c;
  k := graph._cl_contract(p_tenant, p_domain);
  v_cons := graph._cl_consumers_json(p_tenant, p_domain, p_case, v_now, k.windows, c.opened_at);
  PERFORM graph._cl_event(c, 'closure.adopted', NULL, v_actor, jsonb_build_object('reason', btrim(p_reason), 'applied_at', cs.closed_at, 'contract_version', k.version), p_correlation);
  RETURN to_jsonb(c) || jsonb_build_object('consumers', jsonb_array_length(v_cons),
    'past_window', (SELECT count(*) FROM jsonb_array_elements(v_cons) x WHERE (x ->> 'overdue')::boolean),
    'statement', 'the windows run from the apply instant: a consumer already past its window stalls the case at the next sweep, and the case''s open products freeze');
END $$;
REVOKE ALL ON FUNCTION graph.adopt_correction_case(uuid, uuid, uuid, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.adopt_correction_case(uuid, uuid, uuid, text, uuid, uuid) TO eye_commit;

-- ─── §CL.9 THE READS (guarded by observation.assert_read_scope; granted to eye_app, eye_commit) ────────────────────────────────────────────
-- Each case of the domain with its closure state: an 'applied' case reads OPEN until its closure record closes; a case applied before B50
-- without a record reads "not tracked" (adopt it). The consumers' counts are the current state.
CREATE VIEW graph.correction_closure_state WITH (security_invoker = true) AS
  SELECT c.case_id, c.tenant_id, c.domain_id, c.kind, c.state AS case_state, c.received_at, c.closed_at AS applied_at, c.propagation_state,
         CASE WHEN c.state <> 'applied' THEN c.state WHEN x.closure_id IS NULL THEN 'not_tracked' ELSE x.state END AS closure_state,
         x.closure_id, x.opened_via, x.stalled_at, x.closed_at AS closure_closed_at, x.closed_by AS closure_closed_by, x.audit_digest
    FROM observation.correction_current c LEFT JOIN graph.correction_closures x ON x.case_id = c.case_id;
REVOKE ALL ON graph.correction_closure_state FROM PUBLIC;
GRANT SELECT ON graph.correction_closure_state TO eye_app, eye_commit;
COMMENT ON VIEW graph.correction_closure_state IS 'B50 §CL (0120; ES-30-005): every correction case with its CLOSURE state — an applied case is open (or stalled) until its closure record closes; not_tracked = applied before B50 and not adopted. observation.correction_current.closed_at is the apply instant (applied_at here), never the closure.';

CREATE OR REPLACE FUNCTION graph.correction_closures_list(p_tenant uuid, p_domain uuid, p_limit int) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = graph, observation, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the correction cases and their closure');
  RETURN (SELECT coalesce(jsonb_agg(to_jsonb(s) - 'tenant_id' - 'domain_id' ORDER BY s.received_at DESC), '[]'::jsonb)
            FROM (SELECT * FROM graph.correction_closure_state z WHERE z.tenant_id = p_tenant AND z.domain_id = p_domain ORDER BY z.received_at DESC LIMIT least(greatest(coalesce(p_limit, 100), 1), 500)) s);
END $$;
REVOKE ALL ON FUNCTION graph.correction_closures_list(uuid, uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.correction_closures_list(uuid, uuid, int) TO eye_app, eye_commit;

-- The applied cases with no closure record (the adopt act LISTS them; it adopts none by itself — DESIGN D9).
CREATE OR REPLACE FUNCTION graph.adoptable_correction_cases(p_tenant uuid, p_domain uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = graph, observation, public, pg_catalog, pg_temp AS $$
DECLARE k graph.closure_contracts;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the correction cases applied before B50');
  k := graph._cl_contract(p_tenant, p_domain);
  RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('case_id', c.case_id, 'kind', c.kind, 'source_id', c.source_id, 'reason', c.reason, 'received_at', c.received_at, 'applied_at', c.closed_at,
            'propagation_state', c.propagation_state, 'days_since_apply', round(extract(epoch FROM (clock_timestamp() - c.closed_at))::numeric / 86400, 1),
            'material_products', (SELECT count(*) FROM graph.case_affected_products a WHERE a.case_id = c.case_id AND a.class <> 'current'),
            'past_window_if_adopted', CASE WHEN k.contract_id IS NULL THEN NULL ELSE
               (SELECT count(*) FROM graph._cl_consumers(p_tenant, p_domain, c.case_id, clock_timestamp(), k.windows, c.closed_at) x WHERE x.overdue) END)
            ORDER BY c.received_at), '[]'::jsonb)
            FROM observation.correction_current c
           WHERE c.tenant_id = p_tenant AND c.domain_id = p_domain AND c.state = 'applied' AND NOT EXISTS (SELECT 1 FROM graph.correction_closures x WHERE x.case_id = c.case_id));
END $$;
REVOKE ALL ON FUNCTION graph.adoptable_correction_cases(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.adoptable_correction_cases(uuid, uuid) TO eye_app, eye_commit;

CREATE OR REPLACE FUNCTION graph.closure_contract_read(p_tenant uuid, p_domain uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = graph, observation, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the domain''s closure contract');
  RETURN jsonb_build_object('current', (SELECT to_jsonb(k) FROM graph.closure_contracts k WHERE k.tenant_id = p_tenant AND k.domain_id = p_domain ORDER BY k.version DESC LIMIT 1),
                            'versions', (SELECT coalesce(jsonb_agg(jsonb_build_object('version', k.version, 'declared_at', k.declared_at, 'declared_by', k.declared_by, 'synthetic', k.synthetic, 'contract_digest', k.contract_digest) ORDER BY k.version), '[]'::jsonb)
                                           FROM graph.closure_contracts k WHERE k.tenant_id = p_tenant AND k.domain_id = p_domain));
END $$;
REVOKE ALL ON FUNCTION graph.closure_contract_read(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.closure_contract_read(uuid, uuid) TO eye_app, eye_commit;

/*
 * THE CASE PAGE'S ONE READ (DP-24-002, PR-24-002, HX-18): the correction's identity, authority (who applied it), target versions, reason,
 * effective time, replacement, the impacted graph (its walks), the propagation state; every consumer with its acknowledgement, deadline and
 * freeze; the freezes; the escalations; the closure record; the readiness in words (with the projection check when p_check is true — an
 * explicit, audited read); and the correction impact NOTICE: the original, the correction, the affected products, the decisions, the required
 * reviews and the closure on one record. Nothing here is a write.
 */
CREATE OR REPLACE FUNCTION graph.correction_closure_read(p_tenant uuid, p_domain uuid, p_case uuid, p_check boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = graph, executive, observation, public, pg_catalog, pg_temp AS $$
DECLARE cs observation.correction_current; c graph.correction_closures; k graph.closure_contracts; v_now timestamptz := clock_timestamp(); v_ready jsonb; v_cons jsonb; v_notice jsonb;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'a correction case and its closure');
  SELECT * INTO cs FROM observation.correction_current x WHERE x.case_id = p_case AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'correction closure rejected (unknown_case): no correction case % in this domain', p_case USING ERRCODE = '23503'; END IF;
  SELECT * INTO c FROM graph.correction_closures x WHERE x.case_id = p_case;
  k := graph._cl_contract(p_tenant, p_domain);
  v_ready := graph._cl_readiness(p_tenant, p_domain, p_case, v_now, coalesce(p_check, false));
  v_cons := v_ready -> 'consumers';
  v_notice := jsonb_build_object(
    'schema', 'eye.correction-impact-notice/1',
    'original', (SELECT coalesce(jsonb_agg(jsonb_build_object('object_id', x ->> 'object_id', 'from_version', x -> 'from', 'to_version', x -> 'to')), '[]'::jsonb) FROM jsonb_array_elements(cs.affected_resolved) x),
    'correction', jsonb_build_object('case_id', p_case, 'kind', cs.kind, 'reason', cs.reason, 'received_at', cs.received_at, 'applied_at', cs.closed_at, 'applied_by', graph._cl_applier(p_case)),
    'affected_products', (SELECT coalesce(jsonb_agg(jsonb_build_object('ref', y ->> 'consumer_ref', 'title', y ->> 'title', 'class', y ->> 'class', 'state', y ->> 'state', 'frozen', y -> 'frozen', 'owner', y -> 'owner')
                                                    ORDER BY y ->> 'consumer_ref'), '[]'::jsonb) FROM jsonb_array_elements(v_cons) y WHERE y ->> 'consumer_kind' = 'affected_product' AND (y ->> 'material')::boolean),
    'decisions', (SELECT coalesce(jsonb_agg(jsonb_build_object('ref', y ->> 'consumer_ref', 'title', y ->> 'title', 'kind', y ->> 'product_kind', 'state', y ->> 'state', 'owner', y -> 'owner')
                                            ORDER BY y ->> 'consumer_ref'), '[]'::jsonb) FROM jsonb_array_elements(v_cons) y WHERE y ->> 'product_kind' IN ('decision', 'decision_package', 'commitment')),
    'required_review', (SELECT coalesce(jsonb_agg(jsonb_build_object('ref', y ->> 'consumer_ref', 'title', y ->> 'title', 'owner', y -> 'owner', 'state', y ->> 'state', 'deadline', y -> 'deadline')
                                                  ORDER BY y ->> 'consumer_ref'), '[]'::jsonb) FROM jsonb_array_elements(v_cons) y WHERE y ->> 'class' = 'human_review'),
    'closure', CASE WHEN c.closure_id IS NULL THEN jsonb_build_object('state', 'not_tracked') ELSE jsonb_build_object('state', c.state, 'closed_at', c.closed_at, 'closed_by', c.closed_by, 'audit_digest', c.audit_digest) END,
    'completeness', 'an affected product listed here does not claim current completeness until its consumer is closed; delivery of this notice to its recipients is B84''s (NOT-08/-13)');
  RETURN jsonb_build_object(
    'case', jsonb_build_object('case_id', p_case, 'kind', cs.kind, 'state', cs.state, 'source_id', cs.source_id, 'channel', cs.channel, 'publisher_ref', cs.publisher_ref, 'reason', cs.reason,
                               'received_at', cs.received_at, 'applied_at', cs.closed_at, 'applied_by', graph._cl_applier(p_case), 'target_versions', cs.affected_resolved,
                               'propagation_state', cs.propagation_state, 'propagation_statement', cs.propagation_unresolved, 'failure_reason', cs.failure_reason,
                               'closed_at_meaning', 'closed_at on the case is the apply instant; the case is closed when its closure record is'),
    'tracked', c.closure_id IS NOT NULL,
    'closure', CASE WHEN c.closure_id IS NULL THEN NULL ELSE to_jsonb(c) - 'record' END,
    'record', c.record,
    'contract', CASE WHEN k.contract_id IS NULL THEN NULL ELSE to_jsonb(k) END,
    'consumers', v_cons,
    'freezes', (SELECT coalesce(jsonb_agg(to_jsonb(f) ORDER BY f.frozen_at, f.freeze_id), '[]'::jsonb) FROM graph.publication_freezes f WHERE f.case_id = p_case),
    'escalations', (SELECT coalesce(jsonb_agg(jsonb_build_object('item_id', i.item_id, 'state', i.state, 'owner', i.owner_principal_id, 'route_roles', to_jsonb(i.route_roles), 'due_at', i.due_at,
                                                                 'escalations', i.escalations, 'title', i.title, 'consumer_ref', i.details ->> 'consumer_ref', 'created_at', i.created_at) ORDER BY i.created_at), '[]'::jsonb)
                      FROM executive.attention_items i WHERE i.tenant_id = p_tenant AND i.domain_id = p_domain AND i.signal_class = 'correction_propagation_stall' AND i.subject_id = p_case),
    'events', (SELECT coalesce(jsonb_agg(jsonb_build_object('event', e.event, 'ref', e.consumer_ref, 'actor', e.actor_principal_id, 'details', e.details, 'at', e.occurred_at) ORDER BY e.occurred_at, e.event_id), '[]'::jsonb)
                 FROM graph.correction_closure_events e WHERE e.case_id = p_case),
    'readiness', jsonb_build_object('ready', v_ready -> 'ready', 'reasons', v_ready -> 'reasons', 'projections_checked', coalesce(p_check, false), 'projections', v_ready -> 'projections'),
    'scope', v_ready -> 'scope',
    'notice', v_notice,
    -- the state the page's Command Review binds: a changed consumer, freeze or closure is a new state (the review is void, never updated)
    'state_digest', encode(sha256(convert_to(jsonb_build_object('consumers', (SELECT coalesce(jsonb_agg(jsonb_build_object('ref', y ->> 'consumer_ref', 'state', y ->> 'state', 'frozen', y -> 'frozen')
                                                                      ORDER BY y ->> 'consumer_kind', y ->> 'consumer_ref'), '[]'::jsonb) FROM jsonb_array_elements(v_cons) y),
                                                                'closure', c.state, 'contract', k.version)::text, 'UTF8')), 'hex'),
    'as_of', v_now);
END $$;
REVOKE ALL ON FUNCTION graph.correction_closure_read(uuid, uuid, uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.correction_closure_read(uuid, uuid, uuid, boolean) TO eye_app, eye_commit;

-- ─── §CL.10 graph.rebuild_projections RE-DECLARED — 0080 §4 (its LAST definition) copied WHOLE; the only change, marked `B50 cl`: the close's
-- own action admitted (the closure re-checks the projections inside its write, ES-30-005). ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION graph.rebuild_projections()
RETURNS TABLE (projection text, live_rows bigint, rebuilt_rows bigint, mismatched bigint, missing bigint, unexpected bigint, representation_ok boolean)
SECURITY DEFINER SET search_path = graph, memory, objects, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_tenant uuid; v_domain uuid; v_current text := graph.projection_representation_version();
BEGIN
  -- 0063: the retrieval subscriber verifies the projections after a change; 0080: the rebuild re-checks under its own action.
  PERFORM observation.assert_authority(ARRAY['graph.read', 'observation.read', 'graph.retrieval.subscription.apply', 'graph.projection.rebuild',
                                             /* B50 cl: the correction closure re-checks the projections before the case closes */ 'graph.closure.close' /* end B50 cl */]);
  v_tenant := public.eye_tenant();
  v_domain := public.eye_domain();
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'projection rebuild rejected: no tenant is established in this context' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH live AS (SELECT x.entity_id AS id, x.lifecycle_state AS state FROM graph.entities_current x WHERE x.tenant_id = v_tenant AND (v_domain IS NULL OR x.domain_id = v_domain)),
       expect AS (SELECT e.entity_id AS id, e.state FROM graph.expected_entities(v_tenant, v_domain) e)
  SELECT 'entities_current'::text, (SELECT count(*) FROM live), (SELECT count(*) FROM expect),
         (SELECT count(*) FROM live l JOIN expect e ON e.id = l.id WHERE l.state IS DISTINCT FROM e.state),
         (SELECT count(*) FROM expect e WHERE NOT EXISTS (SELECT 1 FROM live l WHERE l.id = e.id)),
         (SELECT count(*) FROM live l WHERE NOT EXISTS (SELECT 1 FROM expect e WHERE e.id = l.id)),
         graph.partition_representation_ok(v_tenant, v_domain, 'entities_current', v_current);

  RETURN QUERY
  WITH live AS (SELECT x.resolution_id AS id, x.state FROM graph.resolutions_current x WHERE x.tenant_id = v_tenant AND (v_domain IS NULL OR x.domain_id = v_domain)),
       expect AS (SELECT e.resolution_id AS id, e.state FROM graph.expected_resolutions(v_tenant, v_domain) e)
  SELECT 'resolutions_current'::text, (SELECT count(*) FROM live), (SELECT count(*) FROM expect),
         (SELECT count(*) FROM live l JOIN expect e ON e.id = l.id WHERE l.state IS DISTINCT FROM e.state),
         (SELECT count(*) FROM expect e WHERE NOT EXISTS (SELECT 1 FROM live l WHERE l.id = e.id)),
         (SELECT count(*) FROM live l WHERE NOT EXISTS (SELECT 1 FROM expect e WHERE e.id = l.id)),
         graph.partition_representation_ok(v_tenant, v_domain, 'resolutions_current', v_current);

  RETURN QUERY
  WITH live AS (SELECT x.edge_id AS id, x.state FROM graph.edges_current x WHERE x.tenant_id = v_tenant AND (v_domain IS NULL OR x.domain_id = v_domain)),
       expect AS (SELECT e.edge_id AS id, e.state FROM graph.expected_edges(v_tenant, v_domain) e)
  SELECT 'edges_current'::text, (SELECT count(*) FROM live), (SELECT count(*) FROM expect),
         (SELECT count(*) FROM live l JOIN expect e ON e.id = l.id WHERE l.state IS DISTINCT FROM e.state),
         (SELECT count(*) FROM expect e WHERE NOT EXISTS (SELECT 1 FROM live l WHERE l.id = e.id)),
         (SELECT count(*) FROM live l WHERE NOT EXISTS (SELECT 1 FROM expect e WHERE e.id = l.id)),
         graph.partition_representation_ok(v_tenant, v_domain, 'edges_current', v_current);

  RETURN QUERY
  WITH live AS (SELECT x.strategy_object_id AS id, x.object_type, x.verification_state FROM graph.strategy_current x WHERE x.tenant_id = v_tenant AND (v_domain IS NULL OR x.domain_id = v_domain)),
       expect AS (SELECT e.strategy_object_id AS id, e.state FROM graph.expected_strategy(v_tenant, v_domain) e)
  SELECT 'strategy_current'::text, (SELECT count(*) FROM live), (SELECT count(*) FROM expect),
         (SELECT count(*) FROM live l JOIN expect e ON e.id = l.id WHERE l.object_type = 'ASU' AND e.state IS NOT NULL AND l.verification_state IS DISTINCT FROM e.state),
         (SELECT count(*) FROM expect e WHERE NOT EXISTS (SELECT 1 FROM live l WHERE l.id = e.id)),
         (SELECT count(*) FROM live l WHERE NOT EXISTS (SELECT 1 FROM expect e WHERE e.id = l.id)),
         graph.partition_representation_ok(v_tenant, v_domain, 'strategy_current', v_current);

  RETURN QUERY
  WITH live AS (SELECT x.invalidation_id AS id, x.state FROM graph.invalidations_current x WHERE x.tenant_id = v_tenant AND (v_domain IS NULL OR x.domain_id = v_domain)),
       expect AS (SELECT e.invalidation_id AS id, e.state FROM graph.expected_invalidations(v_tenant, v_domain) e)
  SELECT 'invalidations_current'::text, (SELECT count(*) FROM live), (SELECT count(*) FROM expect),
         (SELECT count(*) FROM live l JOIN expect e ON e.id = l.id WHERE l.state IS DISTINCT FROM e.state),
         (SELECT count(*) FROM expect e WHERE NOT EXISTS (SELECT 1 FROM live l WHERE l.id = e.id)),
         (SELECT count(*) FROM live l WHERE NOT EXISTS (SELECT 1 FROM expect e WHERE e.id = l.id)),
         graph.partition_representation_ok(v_tenant, v_domain, 'invalidations_current', v_current);

  -- the memory row (C6): state, version and the three policy columns against the canonical version the log names; the
  -- e.classification IS NOT NULL guard — a log version with no canonical row is the content tier's absence, named by the rebuild
  -- as unrebuildable, not a policy drift
  RETURN QUERY
  WITH live AS (SELECT x.item_id AS id, x.state, x.object_version, x.classification, x.audience_roles, x.audience_purposes FROM memory.items_current x WHERE x.tenant_id = v_tenant AND (v_domain IS NULL OR x.domain_id = v_domain)),
       expect AS (SELECT e.item_id AS id, e.state, e.object_version, e.classification, e.audience_roles, e.audience_purposes FROM memory.expected_items(v_tenant, v_domain) e)
  SELECT 'memory_items_current'::text, (SELECT count(*) FROM live), (SELECT count(*) FROM expect),
         (SELECT count(*) FROM live l JOIN expect e ON e.id = l.id
           WHERE l.state IS DISTINCT FROM e.state OR l.object_version IS DISTINCT FROM e.object_version
              OR (e.classification IS NOT NULL AND (l.classification IS DISTINCT FROM e.classification OR l.audience_roles IS DISTINCT FROM e.audience_roles OR l.audience_purposes IS DISTINCT FROM e.audience_purposes))),
         (SELECT count(*) FROM expect e WHERE NOT EXISTS (SELECT 1 FROM live l WHERE l.id = e.id)),
         (SELECT count(*) FROM live l WHERE NOT EXISTS (SELECT 1 FROM expect e WHERE e.id = l.id)),
         graph.partition_representation_ok(v_tenant, v_domain, 'memory_items_current', v_current);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION graph.rebuild_projections() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.rebuild_projections() TO eye_app, eye_commit;

-- ─── §CL.11 MET-010 v2 (DQM-020) — analytics.mc_met010_correction_propagation re-declared: the end instant is the CLOSURE RECORD's ─────────
/* MET-010 CORRECTION PROPAGATION TIME v2 (duration, seconds; App M: "time from accepted correction to all affected products reconciled or
   constrained"; DQM-020 "to material consumer closure"). READING — population: corrections ACCEPTED in the window (observation.correction_events
   `case.applied`). Start: the acceptance instant. End — THE CLOSURE INSTANT: graph.correction_closures.closed_at, the moment every material
   consumer was acknowledged, recomputed or under a bounded exception and the projections reconciled (B50 §CL; v1 ended at the walk). A case
   whose closure is open or stalled, or a case applied before B50 and not adopted (no record), is EXCLUDED as censored and said; when censored
   cases are more than half the accepted ones the median is INDETERMINATE. The DECLARED closure contract (graph.closure_contracts) is named in
   the quality notes: the duration is measured; its breach is the contract's windows and the definition's threshold. DIMENSIONS: tenant and
   domain (the call), the asset (the scope rule), the deployment (the instance), the window (the period), the correction kind (cohort
   `correction_kind`) and per record the reached consumers and the product kinds. */
CREATE OR REPLACE FUNCTION analytics.mc_met010_correction_propagation(p_tenant uuid, p_domain uuid, p_from timestamptz, p_to timestamptz, p_as_of timestamptz, p_scope jsonb, p_cohort jsonb, p_params jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = analytics, observation, graph, public, pg_catalog, pg_temp AS $$
DECLARE v_newest timestamptz; v_src uuid[] := analytics.mcb_scope_sources(p_tenant, p_domain, p_scope); v_recs jsonb; v_cens int; v_total int; v_reasons jsonb := '[]'::jsonb; v_contract int;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the propagation of the domain''s corrections (MET-010)');
  IF coalesce(p_params ->> 'clock', 'record') <> 'record' THEN RETURN analytics.mcb_clock_refused('duration', 'MET-010', 'a correction is accepted and propagated in record time', p_params); END IF;
  SELECT max(k.version) INTO v_contract FROM graph.closure_contracts k WHERE k.tenant_id = p_tenant AND k.domain_id = p_domain AND k.declared_at <= p_as_of;
  WITH acc AS (
    SELECT DISTINCT ON (e.case_id) e.case_id, e.occurred_at AS accepted_at, c.source_id, c.kind
      FROM observation.correction_events e JOIN observation.correction_current c ON c.case_id = e.case_id
     WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain AND e.event = 'case.applied' AND e.occurred_at >= p_from AND e.occurred_at < p_to AND e.occurred_at <= p_as_of
       AND (v_src IS NULL OR c.source_id = ANY (v_src))
       AND (p_cohort ->> 'correction_kind' IS NULL OR c.kind = p_cohort ->> 'correction_kind')
     ORDER BY e.case_id, e.occurred_at),
  judged AS (
    SELECT a.*, x.closure_id, x.state AS closure_state, CASE WHEN x.state = 'closed' AND x.closed_at <= p_as_of THEN x.closed_at END AS closed_at, x.reached_consumers,
           (SELECT coalesce(jsonb_agg(DISTINCT y ->> 'product_kind') FILTER (WHERE y ->> 'product_kind' IS NOT NULL), '[]'::jsonb) FROM jsonb_array_elements(coalesce(x.record -> 'consumers', '[]'::jsonb)) y) AS product_kinds
      FROM acc a LEFT JOIN graph.correction_closures x ON x.case_id = a.case_id)
  SELECT coalesce(jsonb_agg(CASE WHEN j.closed_at IS NOT NULL THEN
                              jsonb_build_object('kind', 'correction', 'id', j.case_id, 'role', 'included',
                                'detail', jsonb_strip_nulls(jsonb_build_object('value', round(greatest(0, extract(epoch FROM (j.closed_at - j.accepted_at)))::numeric, 3), 'accepted_at', j.accepted_at,
                                                           'closed_at', j.closed_at, 'closure', 'material consumer closure (the closure record)', 'correction_kind', j.kind,
                                                           'consumers', j.reached_consumers, 'product_kinds', j.product_kinds)))
                            ELSE jsonb_build_object('kind', 'correction', 'id', j.case_id, 'role', 'excluded',
                                'reason', CASE WHEN j.closure_id IS NULL THEN 'censored: applied before B50 and not adopted — no closure record'
                                               ELSE 'censored: the closure is ' || j.closure_state || ' as of the as-of (no closure instant yet)' END,
                                'detail', jsonb_build_object('accepted_at', j.accepted_at, 'closure_state', coalesce(j.closure_state, 'not_tracked'), 'closure', 'censored')) END
                            ORDER BY j.accepted_at, j.case_id), '[]'::jsonb),
         count(*) FILTER (WHERE j.closed_at IS NULL), count(*),
         max(j.accepted_at)
    INTO v_recs, v_cens, v_total, v_newest FROM judged j;
  IF v_total > 0 AND v_cens * 2 > v_total THEN
    v_reasons := v_reasons || to_jsonb(format('%s of %s accepted corrections are not closed (censored): a median over the closed ones alone would be survivor-biased', v_cens, v_total));
  END IF;
  RETURN analytics.mcb_finish(jsonb_build_object('kind', 'duration', 'records', v_recs, 'reasons', v_reasons,
    'quality', jsonb_build_object('clock', 'record', 'censored', v_cens, 'accepted', v_total, 'unit', 'seconds', 'computation_version', 2,
      'scope_rule', CASE WHEN p_scope IS NULL THEN 'the domain' ELSE 'corrections of sources feeding the scope''s series or entities' END,
      'closure_contract_version', v_contract,
      'notes', jsonb_build_array('v2 (B50 §CL): the closure instant = the closure record''s closed_at — every material consumer acknowledged, recomputed or under a bounded exception and the projections reconciled; v1 ended at the walk',
                                 CASE WHEN v_contract IS NULL THEN 'no closure contract is declared in this domain: the duration is measured; its breach is the definition''s threshold'
                                      ELSE format('the domain''s declared closure contract (version %s) names the acknowledgement windows per consumer class', v_contract) END,
                                 'a case applied before B50 and not adopted has no closure record and is censored, never estimated'))), 'closure', v_newest);
END $$;
REVOKE ALL ON FUNCTION analytics.mc_met010_correction_propagation(uuid,uuid,timestamptz,timestamptz,timestamptz,jsonb,jsonb,jsonb) FROM PUBLIC;
SELECT analytics.register_computation('met010_correction_propagation', 'analytics.mc_met010_correction_propagation', 'duration', ARRAY['correction_kind']::text[],
  ARRAY['observation.correction_events', 'observation.correction_current', 'graph.correction_closures', 'graph.closure_contracts', 'prediction.series_registry', 'observation.source_contracts_current'],
  'a correction concerns the scope when its source feeds a series of the scope''s series_keys or of an entity in its entity_ids; a NULL scope is the domain',
  'MET-010 v2: seconds from an accepted correction to its MATERIAL CONSUMER CLOSURE (the closure record''s closed_at); open, stalled and untracked cases censored and said', '0120 §CL');

-- ─── §CL.12 THE MIGRATION'S OWN CHECKS ───────────────────────────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT ('correction_propagation_stall' = ANY (executive.attention_signal_classes())) OR NOT ('knowledge_challenge_overdue' = ANY (executive.attention_signal_classes())) THEN
    RAISE EXCEPTION 'migration 0120 §CL: the attention classes are not declared';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM analytics.computation_registry r WHERE r.function_name = 'analytics.mc_met010_correction_propagation' AND r.registered_in = '0120 §CL' AND r.version >= 2) THEN
    RAISE EXCEPTION 'migration 0120 §CL: MET-010 v2 is not registered';
  END IF;
  IF (SELECT p.provolatile FROM pg_proc p WHERE p.oid = 'objects.publication_frozen(text, uuid, integer)'::regprocedure) <> 's'
     OR (SELECT p.prosecdef FROM pg_proc p WHERE p.oid = 'objects.publication_frozen(text, uuid, integer)'::regprocedure) THEN
    RAISE EXCEPTION 'migration 0120 §CL: objects.publication_frozen must stay STABLE and invoker';
  END IF;
END $$;
