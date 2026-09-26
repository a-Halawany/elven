-- 0088 — CP-6 B28 (2026-09-26): STREAM PROCESSING, THE WEAK-SIGNAL WORKBENCH, THE EARLY-WARNING LIFECYCLE, AND THE TWO B24 CARRYOVERS.
--
-- One migration in six sections, the prelude written first by the integrator, the four parts built and proven on their own in parallel
-- worktrees (their harnesses phase6-{remediation,signals,streams,warnings}-b28), then combined here in the order they were verified —
-- no function is re-declared by two sections:
--   §0  the prelude: the roles (stream_rule_subscriber, weak_signal_agent, warning_subscriber); the consumer kinds `stream-rules` and
--       `warnings`; the warning's origin and cluster columns and the events B28 adds; THE WARNING-CANDIDATE INTAKE (every non-indicator
--       origin submits; only §W turns a candidate into a warning)
--   §R  the REMEDIATION WORKFLOW on source coverage loss and source-impact MARKERS THROUGH ASSUMPTIONS (the B24 carryovers (a), (b))
--   §S  (signals) WEAK SIGNALS: the object, the detectors (cross-domain convergence declared absent), nomination and a human's disposition,
--       the independence test, corroboration as the only maturity change, indicator governance, the Weak Signal Agent (nominates and ranks
--       only), and F-P6-07's NOVELTY input (carryover (c))
--   §S  (streams) EVENT-TIME STREAM PROCESSING: rules, processors, windows fired on the watermark, lateness labelled (never hidden),
--       checkpoints, offsets reconciliation, stall/corruption semantics, retraction
--   §W  the EARLY-WARNING LIFECYCLE: candidates clustered or raised, storms, context (contradicting evidence, affected objectives,
--       falsification, playbook), closure, escalation on expiry, feedback and the warning evaluation (T3), the warnings consumer
--   §I  the integrator: the coverage gaps carry the source's remediation
-- The interface register stays 50/0/0 (B28 adds no interface). Forward-only; nothing earlier is edited. A real delivery provider is D6.

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- section `prelude`
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0088 §0 — CP-6 B28 PRELUDE (the integrator, 2026-09-26): the shared vocabulary the four B28 parts build on, written FIRST so no two
-- parts re-declare the same object. F-P4-10 (weak signals), F-P4-11 (event-time streams), F-P4-12 (the early-warning lifecycle) and the
-- two B24 carryovers (the remediation workflow on coverage loss; source-impact markers through assumptions).
--
--   * roles: stream_rule_subscriber (the stream-rules consumer), weak_signal_agent (the Weak Signal Agent: nominates and ranks, never
--     disposes), warning_subscriber (the warnings consumer: derives warning candidates from graph impact, forecast revision, twin degradation);
--   * the subscription vocabulary: the consumer kinds `stream-rules` (ObservationRecorded; action prediction.stream.subscription.apply) and
--     `warnings` (GraphChanged; action prediction.warning.subscription.apply) — the kind CHECK, the actions table (0066), the events table (0083);
--   * the warning's ORIGIN and CLUSTER columns (origin_kind, origin_ref, cluster_id — existing rows are indicator breaches) and the
--     warning events B28 adds;
--   * THE WARNING-CANDIDATE INTAKE: every origin (a stream rule's fired window, an escalated weak signal, the warnings consumer's graph
--     impact / forecast revision / twin degradation) SUBMITS a candidate here; the lifecycle part (§W) alone turns a candidate into a
--     warning — clustered into an open warning or raised — so no origin raises a warning of its own.
--
-- NOT HERE (stated): every part's own tables, ports, consumers and pages; the candidate processing (§W); raise_warning (unchanged: §W
-- calls it); the interface register (unchanged, 50/0/0 — B28 adds no interface: the candidates are an internal intake, the warnings keep
-- EarlyWarningRaised@v1).

INSERT INTO identity.roles (code, scope, description) VALUES
  ('stream_rule_subscriber', 'DOMAIN', 'The stream-rules subscription consumer (B28): feeds ObservationRecorded points into the event-time stream processors — exactly prediction.stream.subscription.apply'),
  ('weak_signal_agent', 'DOMAIN', 'The Weak Signal Agent (B28): runs the detectors, nominates and ranks weak signals — never records a disposition (a human act)'),
  ('warning_subscriber', 'DOMAIN', 'The warnings subscription consumer (B28): derives warning candidates from graph impact, forecast revision and twin degradation — exactly prediction.warning.subscription.apply')
ON CONFLICT (code) DO NOTHING;

ALTER TABLE graph.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_consumer_kind_check;
ALTER TABLE graph.subscriptions ADD CONSTRAINT subscriptions_consumer_kind_check CHECK (consumer_kind IN (
  'twins', 'forecasts', 'scenarios', 'decisions', 'retrieval', 'memory-mappings', 'relationships', 'observations', 'source-health', 'proposals', 'attention',
  -- B28 (0088)
  'stream-rules', 'warnings'));
INSERT INTO graph.subscription_consumer_actions (consumer_kind, action, role_code, since) VALUES
  ('stream-rules', 'prediction.stream.subscription.apply', 'stream_rule_subscriber', '0088'),
  ('warnings', 'prediction.warning.subscription.apply', 'warning_subscriber', '0088')
ON CONFLICT (consumer_kind) DO NOTHING;
INSERT INTO graph.subscription_consumer_events (consumer_kind, event_type, since) VALUES
  ('stream-rules', 'ObservationRecorded', '0088'), ('warnings', 'GraphChanged', '0088')
ON CONFLICT (consumer_kind, event_type) DO NOTHING;

ALTER TABLE prediction.warnings_current
  ADD COLUMN origin_kind text NOT NULL DEFAULT 'indicator_breach'
    CHECK (origin_kind IN ('indicator_breach', 'stream_rule', 'weak_signal', 'graph_impact', 'forecast_revision', 'twin_degradation')),
  ADD COLUMN origin_ref jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(origin_ref) = 'object'),
  ADD COLUMN cluster_id uuid;
COMMENT ON COLUMN prediction.warnings_current.origin_kind IS 'B28 (0088 §0): what raised the warning — an indicator breach (every warning before B28), a stream rule''s fired window, an escalated weak signal, graph impact, a forecast revision or twin degradation';

ALTER TABLE prediction.warning_events DROP CONSTRAINT IF EXISTS warning_events_event_check;
ALTER TABLE prediction.warning_events ADD CONSTRAINT warning_events_event_check CHECK (event IN (
  'warning.raised', 'warning.acknowledged', 'warning.expired', 'warning.closed', 'warning.attention',
  -- B28 (0088)
  'warning.clustered', 'warning.context_set', 'warning.escalated', 'warning.feedback', 'warning.retracted'));

-- THE INTAKE. One row per (origin_kind, origin_key) in a domain: a redelivered or replayed origin never submits twice.
CREATE TABLE prediction.warning_candidates (
  candidate_id        uuid PRIMARY KEY,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  origin_kind         text NOT NULL CHECK (origin_kind IN ('stream_rule', 'weak_signal', 'graph_impact', 'forecast_revision', 'twin_degradation')),
  origin_key          text NOT NULL CHECK (length(origin_key) BETWEEN 1 AND 300),
  origin_ref          jsonb NOT NULL CHECK (jsonb_typeof(origin_ref) = 'object'),
  title               text NOT NULL CHECK (length(title) BETWEEN 3 AND 300),
  consequence_class   text NOT NULL CHECK (consequence_class IN ('C1', 'C2', 'C3', 'C4')),
  confidence          numeric CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  cause_key           text NOT NULL CHECK (length(cause_key) BETWEEN 1 AND 300),   -- the incident the origin saw (the dedup basis with the affected scope)
  affected            jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(affected) = 'object'),   -- {objectives, assets, actors, geographies, horizon}
  evidence            jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(evidence) = 'array'),    -- [{object_id, version, source_id?, stance: supporting|contradicting}]
  response_window_hours int CHECK (response_window_hours IS NULL OR response_window_hours BETWEEN 1 AND 8760),
  submitted_by        uuid NOT NULL,
  submitted_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  state               text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'raised', 'clustered', 'refused')),
  warning_id          uuid,
  outcome             jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(outcome) = 'object'),
  decided_at          timestamptz,
  correlation_id      uuid NOT NULL,
  CONSTRAINT pwc_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT pwc_once UNIQUE (tenant_id, domain_id, origin_kind, origin_key),
  CONSTRAINT pwc_decided CHECK ((state = 'pending') = (decided_at IS NULL)),
  CONSTRAINT pwc_warning CHECK (state NOT IN ('raised', 'clustered') OR warning_id IS NOT NULL)
);
CREATE INDEX pwc_pending ON prediction.warning_candidates (tenant_id, domain_id, state, submitted_at);
COMMENT ON TABLE prediction.warning_candidates IS 'B28 (0088 §0): the warning-candidate intake — every non-indicator origin submits here; §W clusters or raises (F-P4-12)';
ALTER TABLE prediction.warning_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE prediction.warning_candidates FORCE ROW LEVEL SECURITY;
CREATE POLICY prediction_isolation ON prediction.warning_candidates USING (tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain()));  -- 0029:420-425 verbatim
GRANT SELECT ON prediction.warning_candidates TO eye_app, eye_commit;

-- SUBMIT: an origin's candidate, idempotent on (origin_kind, origin_key) — the same key answers `repeated` with the recorded candidate.
CREATE OR REPLACE FUNCTION prediction.submit_warning_candidate(
  p_tenant uuid, p_domain uuid, p_origin_kind text, p_origin_key text, p_origin_ref jsonb, p_title text, p_consequence text, p_confidence numeric,
  p_cause_key text, p_affected jsonb, p_evidence jsonb, p_window_hours int, p_actor uuid, p_correlation uuid)
RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_id uuid; c prediction.warning_candidates%ROWTYPE; e jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.stream.subscription.apply', 'prediction.signal.escalate', 'prediction.warning.subscription.apply', 'prediction.warning.raise']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_origin_kind IS NULL OR p_origin_kind NOT IN ('stream_rule', 'weak_signal', 'graph_impact', 'forecast_revision', 'twin_degradation') THEN
    RAISE EXCEPTION 'warning candidate rejected: origin_kind is one of stream_rule, weak_signal, graph_impact, forecast_revision, twin_degradation' USING ERRCODE = '22023';
  END IF;
  IF p_origin_key IS NULL OR length(p_origin_key) NOT BETWEEN 1 AND 300 OR p_cause_key IS NULL OR length(p_cause_key) NOT BETWEEN 1 AND 300 THEN
    RAISE EXCEPTION 'warning candidate rejected: an origin key and a cause key of 1..300 characters are required' USING ERRCODE = '22023';
  END IF;
  IF p_title IS NULL OR length(btrim(p_title)) NOT BETWEEN 3 AND 300 THEN RAISE EXCEPTION 'warning candidate rejected: a title of 3..300 characters is required' USING ERRCODE = '22023'; END IF;
  IF p_consequence IS NULL OR p_consequence NOT IN ('C1', 'C2', 'C3', 'C4') THEN RAISE EXCEPTION 'warning candidate rejected: the consequence class is C1..C4' USING ERRCODE = '22023'; END IF;
  IF p_confidence IS NOT NULL AND (p_confidence < 0 OR p_confidence > 1) THEN RAISE EXCEPTION 'warning candidate rejected: confidence is in 0..1' USING ERRCODE = '22023'; END IF;
  IF p_origin_ref IS NULL OR jsonb_typeof(p_origin_ref) <> 'object' OR (p_affected IS NOT NULL AND jsonb_typeof(p_affected) <> 'object')
     OR (p_evidence IS NOT NULL AND jsonb_typeof(p_evidence) <> 'array') THEN
    RAISE EXCEPTION 'warning candidate rejected: origin_ref and affected are objects, evidence an array' USING ERRCODE = '22023';
  END IF;
  FOR e IN SELECT value FROM jsonb_array_elements(coalesce(p_evidence, '[]'::jsonb)) LOOP
    IF jsonb_typeof(e) <> 'object' OR (e ->> 'object_id') IS NULL OR coalesce(e ->> 'stance', 'supporting') NOT IN ('supporting', 'contradicting') THEN
      RAISE EXCEPTION 'warning candidate rejected: each evidence item is {object_id, version?, source_id?, stance: supporting|contradicting}' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF p_window_hours IS NOT NULL AND (p_window_hours < 1 OR p_window_hours > 8760) THEN RAISE EXCEPTION 'warning candidate rejected: the response window is 1..8760 hours' USING ERRCODE = '22023'; END IF;
  -- the affected contract (§W's own check, prediction.warning_affected_problem — resolved at call time): a malformed block is refused HERE,
  -- at submission, never accepted and refused later (integrator, 0088 §I — the streams origin had sent its own keys)
  e := to_jsonb(prediction.warning_affected_problem(coalesce(p_affected, '{}'::jsonb)));
  IF e IS NOT NULL AND jsonb_typeof(e) = 'string' THEN RAISE EXCEPTION 'warning candidate rejected: %', e #>> '{}' USING ERRCODE = '22023'; END IF;
  INSERT INTO prediction.warning_candidates (candidate_id, scope, tenant_id, domain_id, origin_kind, origin_key, origin_ref, title, consequence_class, confidence, cause_key,
                                             affected, evidence, response_window_hours, submitted_by, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_origin_kind, p_origin_key, p_origin_ref, btrim(p_title), p_consequence, p_confidence, p_cause_key,
          coalesce(p_affected, '{}'::jsonb), coalesce(p_evidence, '[]'::jsonb), p_window_hours, p_actor, p_correlation)
  ON CONFLICT ON CONSTRAINT pwc_once DO NOTHING
  RETURNING candidate_id INTO v_id;
  IF v_id IS NULL THEN
    SELECT * INTO c FROM prediction.warning_candidates x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.origin_kind = p_origin_kind AND x.origin_key = p_origin_key;
    RETURN jsonb_build_object('candidate_id', c.candidate_id, 'state', c.state, 'warning_id', c.warning_id, 'repeated', true);
  END IF;
  RETURN jsonb_build_object('candidate_id', v_id, 'state', 'pending', 'warning_id', NULL, 'repeated', false);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.submit_warning_candidate(uuid,uuid,text,text,jsonb,text,text,numeric,text,jsonb,jsonb,int,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.submit_warning_candidate(uuid,uuid,text,text,jsonb,text,text,numeric,text,jsonb,jsonb,int,uuid,uuid) TO eye_commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- section `remediation`
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0088 §R — CP-6 B28 part `remediation` (2026-09-26): THE TWO B24 CARRYOVERS, B28 completion conditions (a) and (b).
--
-- (a) THE REMEDIATION WORKFLOW ON SOURCE COVERAGE LOSS. Until now a source.coverage_loss attention item was ROUTED (0083 §6, the
--     source-health subscriber) and nothing opened a remediation: the loss was seen and left. Here:
--   * observation.coverage_remediations (the current row) + observation.coverage_remediation_events (append-only): the SOURCE, the
--     coverage-loss ITEM it answers (executive.attention_items of class source.coverage_loss, subject the source), the OWNER (an active
--     human holding collection_manager or domain_admin), the state open | in_progress | closed_recovered | closed_gap_accepted | withdrawn,
--     the GAP (the loss's window — from the item's arrival to the closure — and the source's latest blind_spots / degraded_regions
--     coverage measurements, each with its own window; a dimension never measured is DECLARED absent, never invented), the STEPS
--     [{kind: fallback_source | recollect | accept_gap, fallback_source_id?, run_id?, reason, by, at, …}] and the CLOSURE. ONE open
--     remediation (open or in_progress) per (tenant, domain, source) — a partial unique index.
--   * THE SOURCE'S HEALTH NOW, from the records alone (observation.source_health_now): the LATEST of the source's SourceHealthChanged
--     announcements (objects.object_outbox — both producers: the coverage evaluation's new_state, the lifecycle transition's state; a
--     transition to active reads healthy, to retired suspended, the B22 subscriber's reading), its coverage evaluations
--     (observation.source_health_events) and its lifecycle events (observation.source_contract_events: activated / reactivated → healthy,
--     suspended / retired → suspended). Answered with its basis; `unknown` when nothing is recorded.
--   * THE PORTS (human-gated at the PDP; each asserts its own bound action, the scope, the acting principal and a named active human):
--       observation.open_coverage_remediation      the coverage-loss item's owner or a collection_manager; the item of THIS domain, of
--                                                  class source.coverage_loss, not closed; the source NOT healthy now; one open per source.
--       observation.add_coverage_remediation_step  fallback_source (the fallback exists in the domain, is another source, its latest
--                                                  contract is ACTIVE and its health now is not degraded/failed/suspended/unknown) |
--                                                  recollect (NAMES a collection run of THIS source started at or after the opening — the
--                                                  run is triggered through the EXISTING collection path, POST …/observation/sources/:id/
--                                                  collect or a stream; the remediation never starts or schedules a run itself) — the
--                                                  remediation's owner or a collection_manager | accept_gap (a reason of 8+ characters,
--                                                  recorded by a SECOND person: never the remediation's owner, holding collection_manager
--                                                  or domain_admin — separation of duties). The first step moves open → in_progress.
--       observation.close_coverage_remediation     recovered (only while the source's health now is healthy/active) | gap_accepted (only
--                                                  when an accept_gap step is recorded) — the owner or a collection_manager.
--       observation.withdraw_coverage_remediation  a reason; the owner or a collection_manager.
--     Refusals are `coverage remediation rejected (<class>): …` (the standing 42501 → 403; the absences 23503 → 404; the record's state
--     → 409; the caller's own request 22023 → 422).
--   * THE READ observation.source_remediations(tenant, domain, source_ids) — the remediations of the named sources (open first, then the
--     latest), scoped to the caller's own context — for the warnings part's coverage-gaps read (the integrator joins it onto a warning's
--     coverage gap: the scene's corridor warning).
--   * observation.mark_source_impact (LATEST body: 0086 §I, copied whole) with ONE block: when the source RECOVERS (healthy/active), its
--     open remediation closes `closed_recovered` (event remediation.closed, automatic, naming the health event).
--
-- (b) SOURCE-IMPACT MARKERS REACH PACKAGES THROUGH ASSUMPTIONS. 0086 §K reached packages through the forecasts and runs their options
--     cite. An option may also cite {kind: 'assumption', id} (0041 citations_ok); an assumption (graph.strategy_current ASU) RESTS on what
--     graph.dependencies records. Here:
--   * observation.source_derived_products (LATEST body: 0086 §M1, copied whole) adds the ASSUMPTIONS resting on the source: an ACTIVE
--     assumption with an ACTIVE dependency on a CLAIM whose lineage (intelligence.claim_lineage) names evidence of the source — the EVD
--     whose provenance_ref is 'SRC:<source>@…', or bytes whose manifest (observation.blob_manifests) is the source's — DEPTH 1; and the
--     active assumptions resting (depends_on_kind strategy) on a reached assumption, followed to DEPTH 4 at most (three assumption →
--     assumption hops; an assumption five levels up is not reached — the bound is stated, a cycle ends at it); and the PACKAGES whose
--     current version's options cite a reached assumption.
--   * the markers' subject_kind CHECK admits `assumption`.
--   * decision.source_impact_bearing (LATEST body: 0086 §M2, copied whole) reads an option's assumption citations: a marker on a cited
--     assumption BEARS on the version — so decision.commit_package (0086 §M4, NOT re-declared: it reads the bearing) refuses the
--     commitment until a decision authority acknowledges it for that version.
--
-- NOT HERE (stated): a remediation SCHEDULING a re-collection (the recollect step names a run the operator triggered through the existing
-- collection path; the collection schedule is the source contract's own, unchanged); a remediation for a source never routed as a
-- coverage loss (it answers a source.coverage_loss item); the warning's coverage-gap attachment (the warnings part owns the warning; the
-- integrator joins observation.source_remediations onto it); the coverage-loss item's own lifecycle (a remediation does not acknowledge,
-- close or suppress the item — the queue's acts stay the queue's); markers on a CLAIM an option cites directly, and on twins, twin
-- versions and briefings (unchanged from 0086); an assumption reached through an entity or an edge (only claims carry the lineage to a
-- source); decision.commit_package, decision.acknowledge_source_impact and simulation.open_run (unchanged — they read the bearing and the
-- markers); the source-health subscriber's code and its METHOD_REF (unchanged — the port it calls reaches further); the interface register
-- (unchanged, 50/0/0 — B28 adds no interface); no event is published for a remediation (its ledger is observation's).

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §R1 THE REMEDIATION LEDGER
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
CREATE TABLE observation.coverage_remediations (
  remediation_id     uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  source_id          uuid NOT NULL,
  item_id            uuid NOT NULL REFERENCES executive.attention_items(item_id),
  owner_principal_id uuid NOT NULL,
  opened_by          uuid NOT NULL,
  state              text NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'in_progress', 'closed_recovered', 'closed_gap_accepted', 'withdrawn')),
  health_at_opening  jsonb NOT NULL CHECK (jsonb_typeof(health_at_opening) = 'object'),
  gap_from           timestamptz NOT NULL,
  gap_to             timestamptz,
  gap                jsonb NOT NULL CHECK (jsonb_typeof(gap) = 'object'),
  steps              jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(steps) = 'array'),
  closure            jsonb,
  reason             text NOT NULL CHECK (length(btrim(reason)) BETWEEN 8 AND 2000),
  opened_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  closed_at          timestamptz,
  correlation_id     uuid NOT NULL,
  CONSTRAINT ocr_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT ocr_closed_bound CHECK ((state IN ('open', 'in_progress')) = (closed_at IS NULL) AND (closed_at IS NULL) = (closure IS NULL)),
  CONSTRAINT ocr_gap_order CHECK (gap_to IS NULL OR gap_to >= gap_from),
  CONSTRAINT ocr_gap_closed CHECK (state NOT IN ('closed_recovered', 'closed_gap_accepted') OR gap_to IS NOT NULL)
);
-- ONE open remediation per source (open or in_progress); the closed and withdrawn stay as history.
CREATE UNIQUE INDEX ocr_one_open ON observation.coverage_remediations (tenant_id, domain_id, source_id) WHERE state IN ('open', 'in_progress');
CREATE INDEX ocr_source ON observation.coverage_remediations (tenant_id, domain_id, source_id, opened_at DESC);
CREATE INDEX ocr_item ON observation.coverage_remediations (item_id);
COMMENT ON TABLE observation.coverage_remediations IS 'B28 (0088 §R): the remediation of a source''s coverage loss — opened from a source.coverage_loss attention item by its owner or a collection manager, owned by a named collection manager (or domain administrator), carrying the gap (the loss window and the blind-spot / degraded-region measurements, absence declared), the steps (a fallback source, a named re-collection run, a gap accepted by a second person) and the closure (recovered only while the source is healthy — automatically when the source-health subscriber applies the recovery; gap accepted only through the accepted step). One open per source.';
ALTER TABLE observation.coverage_remediations ENABLE ROW LEVEL SECURITY;
ALTER TABLE observation.coverage_remediations FORCE ROW LEVEL SECURITY;
CREATE POLICY observation_isolation ON observation.coverage_remediations USING (tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain()));
GRANT SELECT ON observation.coverage_remediations TO eye_app, eye_commit;

CREATE TABLE observation.coverage_remediation_events (
  event_id           uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  remediation_id     uuid NOT NULL REFERENCES observation.coverage_remediations(remediation_id),
  event              text NOT NULL CHECK (event IN ('remediation.opened', 'remediation.step_added', 'remediation.closed', 'remediation.withdrawn')),
  actor_principal_id uuid NOT NULL,
  details            jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT ocre_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX ocre_remediation ON observation.coverage_remediation_events (remediation_id, occurred_at);
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON observation.coverage_remediation_events
  FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE observation.coverage_remediation_events IS 'B28 (0088 §R): the append-only ledger of a coverage remediation — opened, each step, the closure (recovered — by a person or automatically on the recovery — or gap accepted), the withdrawal.';
ALTER TABLE observation.coverage_remediation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE observation.coverage_remediation_events FORCE ROW LEVEL SECURITY;
CREATE POLICY observation_isolation ON observation.coverage_remediation_events USING (tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain()));
GRANT SELECT ON observation.coverage_remediation_events TO eye_app, eye_commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §R2 THE SOURCE'S HEALTH NOW (from the records alone)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- The LATEST of: the source's SourceHealthChanged announcements (the outbox row IS the committed publication — both producers, read as
-- the source-health subscriber reads them), its coverage evaluations and its lifecycle events. {state, at, basis, ref}; `unknown` with
-- basis `none` when nothing is recorded (never healthy by default). Scoped to the caller's own context (another tenant or domain reads
-- `unknown`/`none`): the ports call it after asserting the scope; the read route under its own context.
CREATE OR REPLACE FUNCTION observation.source_health_now(p_tenant uuid, p_domain uuid, p_source_id uuid) RETURNS jsonb
STABLE SECURITY DEFINER SET search_path = observation, objects, public, pg_catalog, pg_temp AS $$
  SELECT coalesce((
    SELECT jsonb_build_object('state', x.state, 'at', x.at, 'basis', x.basis, 'ref', x.ref) FROM (
      SELECT CASE coalesce(o.payload ->> 'new_state', o.payload ->> 'state') WHEN 'active' THEN 'healthy' WHEN 'retired' THEN 'suspended'
                  ELSE coalesce(o.payload ->> 'new_state', o.payload ->> 'state') END AS state,
             o.created_at AS at, 'SourceHealthChanged' AS basis, o.id::text AS ref, 1 AS rank
        FROM objects.object_outbox o
       WHERE o.event_type = 'SourceHealthChanged' AND o.tenant_id = p_tenant AND o.domain_id = p_domain AND (o.payload ->> 'source_id') = p_source_id::text
         AND coalesce(o.payload ->> 'new_state', o.payload ->> 'state') IN ('healthy', 'active', 'degraded', 'failed', 'suspended', 'unknown', 'retired')
      UNION ALL
      SELECT e.new_state, e.recorded_at, 'coverage evaluation', e.event_id::text, 2
        FROM observation.source_health_events e WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain AND e.source_id = p_source_id
      UNION ALL
      SELECT CASE WHEN c.event IN ('contract.activated', 'contract.reactivated') THEN 'healthy' ELSE 'suspended' END, c.occurred_at, c.event, c.event_id::text, 3
        FROM observation.source_contract_events c
       WHERE c.tenant_id = p_tenant AND c.domain_id = p_domain AND c.source_id = p_source_id
         AND c.event IN ('contract.activated', 'contract.reactivated', 'contract.suspended', 'contract.retired')
    ) x WHERE p_tenant = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR p_domain = public.eye_domain())
    ORDER BY x.at DESC, x.rank LIMIT 1),
    jsonb_build_object('state', 'unknown', 'at', NULL, 'basis', 'none', 'ref', NULL));
$$ LANGUAGE sql;
REVOKE ALL ON FUNCTION observation.source_health_now(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.source_health_now(uuid, uuid, uuid) TO eye_app, eye_commit;

-- The gap of a source's coverage loss: the latest blind_spots and degraded_regions measurements, each with its window, or declared
-- absent. (Measured as the coverage evaluation recorded them — Phase 1 records both dimensions honestly `unknown`.)
CREATE OR REPLACE FUNCTION observation.coverage_gap_of(p_tenant uuid, p_domain uuid, p_source_id uuid) RETURNS jsonb
STABLE SECURITY DEFINER SET search_path = observation, pg_catalog, pg_temp AS $$
  SELECT jsonb_object_agg(d.dim, coalesce((
    SELECT jsonb_build_object('measurement_id', m.measurement_id, 'state', m.state, 'value_numeric', m.value_numeric, 'value_text', m.value_text,
                              'window_start', m.window_start, 'window_end', m.window_end, 'evaluated_at', m.evaluated_at, 'calc_version', m.calc_version)
      FROM observation.coverage_measurements m
     WHERE m.tenant_id = p_tenant AND m.domain_id = p_domain AND m.source_id = p_source_id AND m.dimension = d.dim
     ORDER BY m.evaluated_at DESC, m.recorded_at DESC LIMIT 1),
    jsonb_build_object('state', 'absent', 'reason', format('no %s measurement is recorded for this source', d.dim))))
    FROM (VALUES ('blind_spots'), ('degraded_regions')) d(dim);
$$ LANGUAGE sql;
REVOKE ALL ON FUNCTION observation.coverage_gap_of(uuid, uuid, uuid) FROM PUBLIC;

-- Who acts on a remediation: the principal is the acting one, a named active human.
CREATE OR REPLACE FUNCTION observation.assert_remediation_actor(p_tenant uuid, p_actor uuid) RETURNS void
STABLE SECURITY DEFINER SET search_path = observation, decision, public, pg_catalog, pg_temp AS $$
BEGIN
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN
    RAISE EXCEPTION 'coverage remediation rejected: recorded by the acting principal, never on behalf of another' USING ERRCODE = '42501';
  END IF;
  IF NOT decision.is_active_human(p_actor, p_tenant) THEN
    RAISE EXCEPTION 'coverage remediation rejected: a named, active human acts on a coverage remediation' USING ERRCODE = '42501';
  END IF;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION observation.assert_remediation_actor(uuid, uuid) FROM PUBLIC;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §R3 THE PORTS
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- OPEN: from a source.coverage_loss item of this domain (its owner or a collection manager), owned by a named collection manager or
-- domain administrator, while the source is not healthy; one open per source.
CREATE OR REPLACE FUNCTION observation.open_coverage_remediation(
  p_remediation_id uuid, p_tenant uuid, p_domain uuid, p_source_id uuid, p_item_id uuid, p_owner uuid, p_reason text, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = observation, executive, decision, ctx, public, pg_catalog, pg_temp AS $$
DECLARE i executive.attention_items%ROWTYPE; v_health jsonb; v_gap jsonb; v_open uuid; v_at timestamptz := clock_timestamp();
BEGIN
  PERFORM observation.assert_authority(ARRAY['observation.coverage_remediation.open']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM observation.assert_remediation_actor(p_tenant, p_actor);
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 OR length(p_reason) > 2000 THEN
    RAISE EXCEPTION 'coverage remediation rejected (reason): a reason of 8 to 2000 characters says what the remediation is for' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO i FROM executive.attention_items x WHERE x.item_id = p_item_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'coverage remediation rejected (unknown_item): no attention item % in this domain', p_item_id USING ERRCODE = '23503';
  END IF;
  IF i.signal_class <> 'source.coverage_loss' OR i.subject_kind <> 'source' THEN
    RAISE EXCEPTION 'coverage remediation rejected (not_coverage_loss): item % is a % item on a %; a remediation answers a source.coverage_loss item', p_item_id, i.signal_class, i.subject_kind USING ERRCODE = '22023';
  END IF;
  IF i.subject_id IS DISTINCT FROM p_source_id THEN
    RAISE EXCEPTION 'coverage remediation rejected (not_coverage_loss): item % is the coverage loss of source %, not of source %', p_item_id, i.subject_id, p_source_id USING ERRCODE = '22023';
  END IF;
  IF i.state = 'closed' THEN
    RAISE EXCEPTION 'coverage remediation rejected (item_closed): item % was closed at %; a closed coverage loss is not remediated', p_item_id, i.closed_at USING ERRCODE = '22023';
  END IF;
  IF p_actor IS DISTINCT FROM i.owner_principal_id AND NOT decision.holds_role(p_actor, p_tenant, p_domain, 'collection_manager') THEN
    RAISE EXCEPTION 'coverage remediation rejected (not_owner): principal % is neither the owner of item % nor a collection_manager of this domain', p_actor, p_item_id USING ERRCODE = '42501';
  END IF;
  IF p_owner IS NULL OR NOT decision.is_active_human(p_owner, p_tenant)
     OR NOT (decision.holds_role(p_owner, p_tenant, p_domain, 'collection_manager') OR decision.holds_role(p_owner, p_tenant, p_domain, 'domain_admin')) THEN
    RAISE EXCEPTION 'coverage remediation rejected (owner): the owner % is not an active human holding collection_manager or domain_admin in this domain', coalesce(p_owner::text, '<none>') USING ERRCODE = '22023';
  END IF;
  v_health := observation.source_health_now(p_tenant, p_domain, p_source_id);
  IF (v_health ->> 'state') IN ('healthy', 'active') THEN
    RAISE EXCEPTION 'coverage remediation rejected (source_healthy): source % is % now (% at %); there is no coverage loss to remediate', p_source_id, v_health ->> 'state', v_health ->> 'basis', v_health ->> 'at' USING ERRCODE = '22023';
  END IF;
  -- one open per source: the refusal names the one that stands; the partial unique index is the guard against a concurrent opening
  -- (its violation answered in the same words)
  SELECT r.remediation_id INTO v_open FROM observation.coverage_remediations r
   WHERE r.tenant_id = p_tenant AND r.domain_id = p_domain AND r.source_id = p_source_id AND r.state IN ('open', 'in_progress');
  IF v_open IS NOT NULL THEN
    RAISE EXCEPTION 'coverage remediation rejected (already_open): remediation % of source % is open; one remediation per source is open at a time', v_open, p_source_id USING ERRCODE = '23505';
  END IF;
  v_gap := jsonb_build_object('window', jsonb_build_object('from', i.created_at, 'to', NULL), 'measurements', observation.coverage_gap_of(p_tenant, p_domain, p_source_id),
                              'health_state', v_health ->> 'state', 'item_title', i.title);
  BEGIN
    INSERT INTO observation.coverage_remediations (remediation_id, scope, tenant_id, domain_id, source_id, item_id, owner_principal_id, opened_by, state, health_at_opening, gap_from, gap, reason, opened_at, updated_at, correlation_id)
    VALUES (p_remediation_id, 'DOMAIN', p_tenant, p_domain, p_source_id, p_item_id, p_owner, p_actor, 'open', v_health, i.created_at, v_gap, btrim(p_reason), v_at, v_at, p_correlation);
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'coverage remediation rejected (already_open): a remediation of source % was opened concurrently; one remediation per source is open at a time', p_source_id USING ERRCODE = '23505';
  END;
  INSERT INTO observation.coverage_remediation_events (event_id, scope, tenant_id, domain_id, remediation_id, event, actor_principal_id, details, occurred_at, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_remediation_id, 'remediation.opened', p_actor,
          jsonb_build_object('source_id', p_source_id, 'item_id', p_item_id, 'owner', p_owner, 'reason', btrim(p_reason), 'health', v_health, 'gap', v_gap), v_at, p_correlation);
  RETURN jsonb_build_object('remediation_id', p_remediation_id, 'source_id', p_source_id, 'item_id', p_item_id, 'owner', p_owner, 'opened_by', p_actor, 'state', 'open',
                            'health', v_health, 'gap', v_gap, 'opened_at', v_at);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION observation.open_coverage_remediation(uuid,uuid,uuid,uuid,uuid,uuid,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.open_coverage_remediation(uuid,uuid,uuid,uuid,uuid,uuid,text,uuid,uuid,uuid) TO eye_commit;

-- The remediation of this domain, locked, open (a closed or withdrawn one is refused `not_open`).
CREATE OR REPLACE FUNCTION observation.open_remediation_for_update(p_tenant uuid, p_domain uuid, p_remediation_id uuid) RETURNS observation.coverage_remediations
SECURITY DEFINER SET search_path = observation, pg_catalog, pg_temp AS $$
DECLARE r observation.coverage_remediations%ROWTYPE;
BEGIN
  SELECT * INTO r FROM observation.coverage_remediations x WHERE x.remediation_id = p_remediation_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'coverage remediation rejected (unknown_remediation): no coverage remediation % in this domain', p_remediation_id USING ERRCODE = '23503';
  END IF;
  IF r.state NOT IN ('open', 'in_progress') THEN
    RAISE EXCEPTION 'coverage remediation rejected (not_open): remediation % is % (at %); only an open remediation is acted on', p_remediation_id, r.state, r.closed_at USING ERRCODE = '22023';
  END IF;
  RETURN r;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION observation.open_remediation_for_update(uuid, uuid, uuid) FROM PUBLIC;

-- STEP: a fallback source, a named re-collection run (the owner or a collection manager), or the gap accepted (a second person).
CREATE OR REPLACE FUNCTION observation.add_coverage_remediation_step(
  p_tenant uuid, p_domain uuid, p_remediation_id uuid, p_kind text, p_fallback_source_id uuid, p_run_id uuid, p_reason text, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = observation, decision, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r observation.coverage_remediations%ROWTYPE; c record; run record; v_health jsonb; v_step jsonb; v_at timestamptz := clock_timestamp();
BEGIN
  PERFORM observation.assert_authority(ARRAY['observation.coverage_remediation.step']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM observation.assert_remediation_actor(p_tenant, p_actor);
  IF p_kind IS NULL OR p_kind NOT IN ('fallback_source', 'recollect', 'accept_gap') THEN
    RAISE EXCEPTION 'coverage remediation rejected (step): a step is fallback_source, recollect or accept_gap, not %', coalesce(p_kind, '<none>') USING ERRCODE = '22023';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 OR length(p_reason) > 2000 THEN
    RAISE EXCEPTION 'coverage remediation rejected (reason): a step carries a reason of 8 to 2000 characters' USING ERRCODE = '22023';
  END IF;
  r := observation.open_remediation_for_update(p_tenant, p_domain, p_remediation_id);
  IF p_kind = 'accept_gap' THEN
    -- SEPARATION OF DUTIES: the gap is accepted by a SECOND person — never the remediation's owner — holding collection_manager or domain_admin.
    IF p_actor = r.owner_principal_id THEN
      RAISE EXCEPTION 'coverage remediation rejected (separation): the owner of remediation % does not accept its own gap; a second person holding collection_manager or domain_admin accepts it', p_remediation_id USING ERRCODE = '42501';
    END IF;
    IF NOT (decision.holds_role(p_actor, p_tenant, p_domain, 'collection_manager') OR decision.holds_role(p_actor, p_tenant, p_domain, 'domain_admin')) THEN
      RAISE EXCEPTION 'coverage remediation rejected (separation): principal % holds neither collection_manager nor domain_admin in this domain; the gap is accepted by one who does', p_actor USING ERRCODE = '42501';
    END IF;
    v_step := jsonb_build_object('kind', 'accept_gap', 'reason', btrim(p_reason), 'by', p_actor, 'owner', r.owner_principal_id, 'at', v_at);
  ELSE
    IF p_actor IS DISTINCT FROM r.owner_principal_id AND NOT decision.holds_role(p_actor, p_tenant, p_domain, 'collection_manager') THEN
      RAISE EXCEPTION 'coverage remediation rejected (not_owner): principal % is neither the owner of remediation % nor a collection_manager of this domain', p_actor, p_remediation_id USING ERRCODE = '42501';
    END IF;
    IF p_kind = 'fallback_source' THEN
      IF p_fallback_source_id IS NULL THEN
        RAISE EXCEPTION 'coverage remediation rejected (step): a fallback_source step names the fallback source' USING ERRCODE = '22023';
      END IF;
      IF p_fallback_source_id = r.source_id THEN
        RAISE EXCEPTION 'coverage remediation rejected (step): source % cannot be its own fallback', p_fallback_source_id USING ERRCODE = '22023';
      END IF;
      SELECT x.source_id, x.contract_version, x.lifecycle_state, x.name, x.source_key INTO c FROM observation.source_contracts_current x
       WHERE x.source_id = p_fallback_source_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain ORDER BY x.contract_version DESC LIMIT 1;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'coverage remediation rejected (unknown_source): no source % in this domain', p_fallback_source_id USING ERRCODE = '23503';
      END IF;
      IF NOT EXISTS (SELECT 1 FROM observation.source_contracts_current x WHERE x.source_id = p_fallback_source_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.lifecycle_state = 'active') THEN
        RAISE EXCEPTION 'coverage remediation rejected (fallback_inactive): fallback source % (%) has no active contract (its latest is %); a fallback is an active source', p_fallback_source_id, c.source_key, c.lifecycle_state USING ERRCODE = '22023';
      END IF;
      v_health := observation.source_health_now(p_tenant, p_domain, p_fallback_source_id);
      IF (v_health ->> 'state') IN ('degraded', 'failed', 'suspended', 'unknown') AND (v_health ->> 'basis') <> 'none' THEN
        RAISE EXCEPTION 'coverage remediation rejected (fallback_inactive): fallback source % (%) is % now (%); a fallback is a healthy source', p_fallback_source_id, c.source_key, v_health ->> 'state', v_health ->> 'basis' USING ERRCODE = '22023';
      END IF;
      v_step := jsonb_build_object('kind', 'fallback_source', 'fallback_source_id', p_fallback_source_id, 'fallback_source_key', c.source_key, 'fallback_name', c.name,
                                   'fallback_health', v_health, 'reason', btrim(p_reason), 'by', p_actor, 'at', v_at);
    ELSE
      -- RECOLLECT names a collection run of THIS source, started at or after the opening — triggered through the EXISTING collection path
      -- (POST …/observation/sources/:id/collect or a stream); the remediation never starts or schedules a run itself.
      /* B28 integrator (found by the act): a SUSPENDED source records no collection run, and a suspension is the product's path to a coverage
         loss — so a recollect step without a run is recorded as PLANNED (the reason required, as for every step); a later recollect step names
         the run once the source can be collected. */
      IF p_run_id IS NULL THEN
        v_step := jsonb_build_object('kind', 'recollect', 'planned', true, 'run_id', NULL, 'reason', btrim(p_reason), 'by', p_actor, 'at', v_at,
                                     'note', 'planned: the source records no run while it cannot be collected (suspended or failed); a later recollect step names the run');
      ELSE
      /* end B28 integrator */
      SELECT x.run_id, x.source_id, x.state, x.started_at, x.finished_at, x.items_admitted INTO run FROM observation.collection_runs_current x
       WHERE x.run_id = p_run_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'coverage remediation rejected (unknown_run): no collection run % in this domain', p_run_id USING ERRCODE = '23503';
      END IF;
      IF run.source_id <> r.source_id THEN
        RAISE EXCEPTION 'coverage remediation rejected (step): run % collects source %, not the remediated source %', p_run_id, run.source_id, r.source_id USING ERRCODE = '22023';
      END IF;
      IF run.started_at < r.opened_at THEN
        RAISE EXCEPTION 'coverage remediation rejected (stale_run): run % started at %, before remediation % was opened at %; a re-collection is a run started for it', p_run_id, run.started_at, p_remediation_id, r.opened_at USING ERRCODE = '22023';
      END IF;
      v_step := jsonb_build_object('kind', 'recollect', 'run_id', p_run_id, 'run_state', run.state, 'run_started_at', run.started_at, 'run_finished_at', run.finished_at,
                                   'items_admitted', run.items_admitted, 'reason', btrim(p_reason), 'by', p_actor, 'at', v_at);
      END IF; /* B28 integrator: the planned recollect's ELSE */
    END IF;
  END IF;
  v_step := v_step || jsonb_build_object('step', jsonb_array_length(r.steps) + 1, 'event_id', p_event_id);
  UPDATE observation.coverage_remediations SET steps = steps || jsonb_build_array(v_step), state = 'in_progress', updated_at = v_at WHERE remediation_id = p_remediation_id;
  INSERT INTO observation.coverage_remediation_events (event_id, scope, tenant_id, domain_id, remediation_id, event, actor_principal_id, details, occurred_at, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_remediation_id, 'remediation.step_added', p_actor, jsonb_build_object('from_state', r.state, 'step', v_step), v_at, p_correlation);
  RETURN jsonb_build_object('remediation_id', p_remediation_id, 'from_state', r.state, 'state', 'in_progress', 'step', v_step, 'steps', jsonb_array_length(r.steps) + 1);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION observation.add_coverage_remediation_step(uuid,uuid,uuid,text,uuid,uuid,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.add_coverage_remediation_step(uuid,uuid,uuid,text,uuid,uuid,text,uuid,uuid,uuid) TO eye_commit;

-- CLOSE: recovered (only while the source is healthy now) or gap_accepted (only through an accept_gap step) — the owner or a collection manager.
CREATE OR REPLACE FUNCTION observation.close_coverage_remediation(
  p_tenant uuid, p_domain uuid, p_remediation_id uuid, p_kind text, p_note text, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = observation, decision, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r observation.coverage_remediations%ROWTYPE; v_health jsonb; v_accepted jsonb; v_closure jsonb; v_state text; v_at timestamptz := clock_timestamp();
BEGIN
  PERFORM observation.assert_authority(ARRAY['observation.coverage_remediation.close']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM observation.assert_remediation_actor(p_tenant, p_actor);
  IF p_kind IS NULL OR p_kind NOT IN ('recovered', 'gap_accepted') THEN
    RAISE EXCEPTION 'coverage remediation rejected (closure): a remediation closes recovered or gap_accepted, not %', coalesce(p_kind, '<none>') USING ERRCODE = '22023';
  END IF;
  IF p_note IS NOT NULL AND length(p_note) > 2000 THEN
    RAISE EXCEPTION 'coverage remediation rejected (closure): a closing note is at most 2000 characters' USING ERRCODE = '22023';
  END IF;
  r := observation.open_remediation_for_update(p_tenant, p_domain, p_remediation_id);
  IF p_actor IS DISTINCT FROM r.owner_principal_id AND NOT decision.holds_role(p_actor, p_tenant, p_domain, 'collection_manager') THEN
    RAISE EXCEPTION 'coverage remediation rejected (not_owner): principal % is neither the owner of remediation % nor a collection_manager of this domain', p_actor, p_remediation_id USING ERRCODE = '42501';
  END IF;
  v_health := observation.source_health_now(p_tenant, p_domain, r.source_id);
  IF p_kind = 'recovered' THEN
    IF (v_health ->> 'state') NOT IN ('healthy', 'active') THEN
      RAISE EXCEPTION 'coverage remediation rejected (not_recovered): source % is % now (% at %); a remediation closes recovered only once the source is healthy', r.source_id, v_health ->> 'state', v_health ->> 'basis', v_health ->> 'at' USING ERRCODE = '22023';
    END IF;
    v_state := 'closed_recovered';
    v_closure := jsonb_build_object('kind', 'recovered', 'by', p_actor, 'at', v_at, 'automatic', false, 'health', v_health, 'note', nullif(btrim(coalesce(p_note, '')), ''));
  ELSE
    SELECT s INTO v_accepted FROM jsonb_array_elements(r.steps) s WHERE s ->> 'kind' = 'accept_gap' ORDER BY (s ->> 'step')::int DESC LIMIT 1;
    IF v_accepted IS NULL THEN
      RAISE EXCEPTION 'coverage remediation rejected (no_accepted_gap): remediation % records no accept_gap step; a gap is accepted by a second person before the remediation closes on it', p_remediation_id USING ERRCODE = '22023';
    END IF;
    v_state := 'closed_gap_accepted';
    v_closure := jsonb_build_object('kind', 'gap_accepted', 'by', p_actor, 'at', v_at, 'automatic', false, 'accepted_by', v_accepted -> 'by', 'accepted_step', v_accepted -> 'step',
                                    'health', v_health, 'note', nullif(btrim(coalesce(p_note, '')), ''));
  END IF;
  UPDATE observation.coverage_remediations SET state = v_state, closure = v_closure, closed_at = v_at, gap_to = greatest(v_at, gap_from),
         gap = jsonb_set(gap, '{window,to}', to_jsonb(greatest(v_at, gap_from))), updated_at = v_at
   WHERE remediation_id = p_remediation_id;
  INSERT INTO observation.coverage_remediation_events (event_id, scope, tenant_id, domain_id, remediation_id, event, actor_principal_id, details, occurred_at, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_remediation_id, 'remediation.closed', p_actor, jsonb_build_object('from_state', r.state, 'state', v_state, 'closure', v_closure), v_at, p_correlation);
  RETURN jsonb_build_object('remediation_id', p_remediation_id, 'from_state', r.state, 'state', v_state, 'closure', v_closure, 'closed_at', v_at);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION observation.close_coverage_remediation(uuid,uuid,uuid,text,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.close_coverage_remediation(uuid,uuid,uuid,text,text,uuid,uuid,uuid) TO eye_commit;

-- WITHDRAW: with a reason — the owner or a collection manager. The gap's window stays open (a withdrawal does not say the loss ended).
CREATE OR REPLACE FUNCTION observation.withdraw_coverage_remediation(
  p_tenant uuid, p_domain uuid, p_remediation_id uuid, p_reason text, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = observation, decision, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r observation.coverage_remediations%ROWTYPE; v_closure jsonb; v_at timestamptz := clock_timestamp();
BEGIN
  PERFORM observation.assert_authority(ARRAY['observation.coverage_remediation.withdraw']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM observation.assert_remediation_actor(p_tenant, p_actor);
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 OR length(p_reason) > 2000 THEN
    RAISE EXCEPTION 'coverage remediation rejected (reason): a withdrawal carries a reason of 8 to 2000 characters' USING ERRCODE = '22023';
  END IF;
  r := observation.open_remediation_for_update(p_tenant, p_domain, p_remediation_id);
  IF p_actor IS DISTINCT FROM r.owner_principal_id AND NOT decision.holds_role(p_actor, p_tenant, p_domain, 'collection_manager') THEN
    RAISE EXCEPTION 'coverage remediation rejected (not_owner): principal % is neither the owner of remediation % nor a collection_manager of this domain', p_actor, p_remediation_id USING ERRCODE = '42501';
  END IF;
  v_closure := jsonb_build_object('kind', 'withdrawn', 'by', p_actor, 'at', v_at, 'automatic', false, 'reason', btrim(p_reason));
  UPDATE observation.coverage_remediations SET state = 'withdrawn', closure = v_closure, closed_at = v_at, updated_at = v_at WHERE remediation_id = p_remediation_id;
  INSERT INTO observation.coverage_remediation_events (event_id, scope, tenant_id, domain_id, remediation_id, event, actor_principal_id, details, occurred_at, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_remediation_id, 'remediation.withdrawn', p_actor, jsonb_build_object('from_state', r.state, 'closure', v_closure), v_at, p_correlation);
  RETURN jsonb_build_object('remediation_id', p_remediation_id, 'from_state', r.state, 'state', 'withdrawn', 'closure', v_closure, 'closed_at', v_at);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION observation.withdraw_coverage_remediation(uuid,uuid,uuid,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.withdraw_coverage_remediation(uuid,uuid,uuid,text,uuid,uuid,uuid) TO eye_commit;

-- THE READ for the warnings part's coverage gaps (the integrator joins it onto a warning): the remediations of the named sources, the
-- open one first, then the latest; scoped to the caller's own context (a tenant and domain other than the context's read nothing).
CREATE OR REPLACE FUNCTION observation.source_remediations(p_tenant uuid, p_domain uuid, p_source_ids uuid[])
RETURNS TABLE (source_id uuid, remediation_id uuid, item_id uuid, state text, owner_principal_id uuid, gap_from timestamptz, gap_to timestamptz, gap jsonb,
               steps jsonb, closure jsonb, opened_at timestamptz, closed_at timestamptz, health_now jsonb)
STABLE SECURITY DEFINER SET search_path = observation, public, pg_catalog, pg_temp AS $$
  SELECT r.source_id, r.remediation_id, r.item_id, r.state, r.owner_principal_id, r.gap_from, r.gap_to, r.gap, r.steps, r.closure, r.opened_at, r.closed_at,
         observation.source_health_now(p_tenant, p_domain, r.source_id)
    FROM observation.coverage_remediations r
   WHERE p_tenant = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR p_domain = public.eye_domain())
     AND r.tenant_id = p_tenant AND r.domain_id = p_domain AND r.source_id = ANY (coalesce(p_source_ids, '{}'::uuid[]))
   ORDER BY r.source_id, (r.state IN ('open', 'in_progress')) DESC, r.opened_at DESC, r.remediation_id;
$$ LANGUAGE sql;
REVOKE ALL ON FUNCTION observation.source_remediations(uuid, uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.source_remediations(uuid, uuid, uuid[]) TO eye_app, eye_commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §R4 THE AUTOMATIC CLOSURE ON RECOVERY — observation.mark_source_impact: 0086 §I's body (copied whole) with ONE block after the markers
-- are set or cleared: on healthy | active the source's open remediation closes `closed_recovered` (event remediation.closed, automatic,
-- naming the health event). Everything else as 0086 §I left it.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION observation.mark_source_impact(p_tenant uuid, p_domain uuid, p_source_id uuid, p_health_state text, p_reason text, p_event_id uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE d record; v_set jsonb := '[]'::jsonb; v_kept jsonb := '[]'::jsonb; v_changed jsonb := '[]'::jsonb; v_cleared jsonb := '[]'::jsonb; m observation.source_impact_markers%ROWTYPE; v_degraded boolean;
        rm observation.coverage_remediations%ROWTYPE; v_remediated jsonb := '[]'::jsonb; v_rclosure jsonb; v_rat timestamptz; /* B28 (0088) remediation */
BEGIN
  PERFORM observation.assert_authority(ARRAY['observation.source_health.subscription.apply']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_health_state IS NULL OR p_health_state NOT IN ('healthy', 'active', 'degraded', 'failed', 'suspended', 'unknown') THEN
    RAISE EXCEPTION 'source impact rejected: % is not a source health state', coalesce(p_health_state, '<none>') USING ERRCODE = '22023';
  END IF;
  v_degraded := p_health_state IN ('degraded', 'failed', 'suspended', 'unknown');
  IF v_degraded THEN
    FOR d IN SELECT * FROM observation.source_derived_products(p_tenant, p_domain, p_source_id) LOOP
      SELECT * INTO m FROM observation.source_impact_markers x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.source_id = p_source_id AND x.subject_kind = d.subject_kind AND x.subject_id = d.subject_id AND x.state = 'active';
      IF FOUND AND m.health_state = p_health_state THEN v_kept := v_kept || jsonb_build_object('kind', d.subject_kind, 'id', d.subject_id); CONTINUE; END IF;
      IF FOUND THEN
        -- B24 (0086 §I): the source's health CHANGED between two non-healthy states (degraded → suspended, or back): the old marker is
        -- cleared with the new state recorded and a new marker set — so a gate reads the CURRENT state, and an acknowledgement given
        -- for the old marker does not carry to the new one (history kept; nothing rewritten in place).
        UPDATE observation.source_impact_markers SET state = 'cleared', cleared_at = clock_timestamp(), cleared_by_event = p_event_id, cleared_state = p_health_state
         WHERE marker_id = m.marker_id;
        v_changed := v_changed || jsonb_build_object('kind', d.subject_kind, 'id', d.subject_id, 'from', m.health_state, 'to', p_health_state);
      END IF;
      INSERT INTO observation.source_impact_markers (marker_id, scope, tenant_id, domain_id, source_id, subject_kind, subject_id, health_state, reason, set_by_event, correlation_id)
      VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_source_id, d.subject_kind, d.subject_id, p_health_state, p_reason, p_event_id, p_correlation);
      v_set := v_set || jsonb_build_object('kind', d.subject_kind, 'id', d.subject_id, 'via', d.via);
    END LOOP;
  ELSE
    FOR m IN SELECT * FROM observation.source_impact_markers x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.source_id = p_source_id AND x.state = 'active' FOR UPDATE LOOP
      UPDATE observation.source_impact_markers SET state = 'cleared', cleared_at = clock_timestamp(), cleared_by_event = p_event_id, cleared_state = p_health_state WHERE marker_id = m.marker_id;
      v_cleared := v_cleared || jsonb_build_object('kind', m.subject_kind, 'id', m.subject_id);
    END LOOP;
    /* B28 (0088) remediation — the source RECOVERED (healthy | active): its open remediation closes `closed_recovered`, automatically, naming
       the health event that recovered it; the gap's window ends here. A redelivery finds none open and closes nothing more. */
    FOR rm IN SELECT * FROM observation.coverage_remediations x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.source_id = p_source_id AND x.state IN ('open', 'in_progress') FOR UPDATE LOOP
      v_rat := clock_timestamp();
      v_rclosure := jsonb_build_object('kind', 'recovered', 'by', p_actor, 'at', v_rat, 'automatic', true, 'health_event', p_event_id,
                                       'health', jsonb_build_object('state', p_health_state, 'at', v_rat, 'basis', 'the source-health subscriber', 'ref', p_event_id), 'note', p_reason);
      UPDATE observation.coverage_remediations SET state = 'closed_recovered', closure = v_rclosure, closed_at = v_rat, gap_to = greatest(v_rat, gap_from),
             gap = jsonb_set(gap, '{window,to}', to_jsonb(greatest(v_rat, gap_from))), updated_at = v_rat
       WHERE remediation_id = rm.remediation_id;
      INSERT INTO observation.coverage_remediation_events (event_id, scope, tenant_id, domain_id, remediation_id, event, actor_principal_id, details, occurred_at, correlation_id)
      VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, rm.remediation_id, 'remediation.closed', p_actor,
              jsonb_build_object('from_state', rm.state, 'state', 'closed_recovered', 'closure', v_rclosure), v_rat, p_correlation);
      v_remediated := v_remediated || jsonb_build_object('remediation_id', rm.remediation_id, 'from_state', rm.state, 'state', 'closed_recovered');
    END LOOP;
    /* end B28 remediation */
  END IF;
  RETURN jsonb_build_object('source_id', p_source_id, 'health_state', p_health_state, 'degraded', v_degraded, 'set', v_set, 'kept', v_kept, 'changed', v_changed, 'cleared', v_cleared,
                            /* B28 (0088) remediation */ 'remediations_closed', v_remediated /* end B28 remediation */);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION observation.mark_source_impact(uuid,uuid,uuid,text,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.mark_source_impact(uuid,uuid,uuid,text,text,uuid,uuid,uuid) TO eye_commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §R5 THE REACH THROUGH ASSUMPTIONS
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
ALTER TABLE observation.source_impact_markers DROP CONSTRAINT IF EXISTS source_impact_markers_subject_kind_check;
ALTER TABLE observation.source_impact_markers ADD CONSTRAINT source_impact_markers_subject_kind_check CHECK (subject_kind IN ('forecast', 'warning', 'package', 'scenario', 'run',
  -- B28 (0088)
  'assumption'));
COMMENT ON TABLE observation.source_impact_markers IS 'V03-T-077/-079 (0083; B24 0086; B28 0088): a derived product carrying the degraded health of a source it rests on — the issued forecasts of the source''s series, the open warnings on them, the active scenarios declared on them, the valid runs bound to those scenarios, the active assumptions resting on a claim extracted from the source''s evidence (and on such an assumption, to depth 4), the packages whose current version cites one of those forecasts, runs or assumptions; set by the source-health subscriber on degraded | failed | suspended | unknown (and on a run opened on a degraded or unknown source, by simulation.open_run), cleared on healthy | active. A marker bearing on a package version refuses its commitment until a decision authority acknowledges it for that version; a failed or suspended marker on a scenario''s forecast refuses a run on it.';

-- The derived products of a source, as they stand: its series' issued forecasts, the raised/acknowledged warnings on them, the active
-- scenarios declared on them, the valid runs bound to those scenarios, the ACTIVE ASSUMPTIONS resting on a claim extracted from the
-- source's evidence (depth 1) or on such an assumption (to depth 4), and the packages (declared → monitoring, reopened) whose CURRENT
-- version's options cite one of those forecasts, runs or assumptions, or whose current version's baseline is one of those runs.
CREATE OR REPLACE FUNCTION observation.source_derived_products(p_tenant uuid, p_domain uuid, p_source_id uuid) RETURNS TABLE (subject_kind text, subject_id uuid, via text)
STABLE SECURITY DEFINER SET search_path = observation, prediction, simulation, decision, graph, intelligence, objects, pg_catalog, pg_temp AS $$
  WITH RECURSIVE src AS (SELECT DISTINCT c.source_key FROM observation.source_contracts_current c WHERE c.source_id = p_source_id AND c.tenant_id = p_tenant AND c.domain_id = p_domain),
       f AS (SELECT fc.forecast_id, fc.series_key FROM prediction.forecasts_current fc JOIN prediction.series_registry sr ON sr.series_key = fc.series_key AND sr.tenant_id = fc.tenant_id AND sr.domain_id = fc.domain_id
              WHERE fc.tenant_id = p_tenant AND fc.domain_id = p_domain AND fc.state = 'issued' AND sr.source_key IN (SELECT source_key FROM src)),
       s AS (SELECT sc.scenario_id, sc.forecast_id FROM prediction.scenarios_current sc
              WHERE sc.tenant_id = p_tenant AND sc.domain_id = p_domain AND sc.state = 'active' AND sc.forecast_id IN (SELECT forecast_id FROM f)),
       r AS (SELECT rc.run_id, rc.scenario_id FROM simulation.runs_current rc
              WHERE rc.tenant_id = p_tenant AND rc.domain_id = p_domain AND rc.state IN ('opened', 'completed') AND rc.validity = 'valid' AND rc.scenario_id IN (SELECT scenario_id FROM s)),
       /* B28 (0088) remediation — THE REACH THROUGH ASSUMPTIONS: the claims extracted from the source's evidence (the EVD whose provenance
          names the source, or bytes whose manifest is the source's), the active assumptions with an active dependency on one (depth 1),
          and the active assumptions resting on a reached assumption, followed to depth 4 at most. */
       ev AS (SELECT e.object_id FROM objects.canonical_objects e
               WHERE e.object_type = 'EVD' AND e.tenant_id = p_tenant AND e.domain_id = p_domain AND e.provenance_ref LIKE 'SRC:' || p_source_id::text || '@%'),
       cl AS (SELECT DISTINCT l.claim_object_id FROM intelligence.claim_lineage l
               WHERE l.tenant_id = p_tenant AND l.domain_id = p_domain
                 AND (l.evidence_object_id IN (SELECT object_id FROM ev)
                      OR EXISTS (SELECT 1 FROM observation.blob_manifests b WHERE b.tenant_id = p_tenant AND b.domain_id = p_domain AND b.source_id = p_source_id AND b.content_digest = l.evidence_digest))),
       a (asu, depth, via) AS (
         SELECT d.dependent_object_id, 1, 'rests on claim ' || d.depends_on_id::text
           FROM graph.dependencies d JOIN graph.strategy_current sc ON sc.strategy_object_id = d.dependent_object_id AND sc.object_type = 'ASU' AND sc.status = 'active'
          WHERE d.tenant_id = p_tenant AND d.domain_id = p_domain AND d.state = 'active' AND d.dependent_type = 'ASU' AND d.depends_on_kind = 'claim'
            AND d.depends_on_id IN (SELECT claim_object_id FROM cl)
         UNION ALL
         SELECT d.dependent_object_id, a.depth + 1, 'rests on assumption ' || a.asu::text || ' (depth ' || (a.depth + 1)::text || ')'
           FROM a JOIN graph.dependencies d ON d.depends_on_kind = 'strategy' AND d.depends_on_id = a.asu AND d.state = 'active' AND d.dependent_type = 'ASU'
                                            AND d.tenant_id = p_tenant AND d.domain_id = p_domain
                  JOIN graph.strategy_current sc ON sc.strategy_object_id = d.dependent_object_id AND sc.object_type = 'ASU' AND sc.status = 'active'
          WHERE a.depth < 4),
       asu AS (SELECT DISTINCT ON (a.asu) a.asu, a.depth, a.via FROM a ORDER BY a.asu, a.depth, a.via)
       /* end B28 remediation */
  SELECT 'forecast', f.forecast_id, 'series ' || f.series_key FROM f
  UNION ALL
  SELECT 'warning', w.warning_id, 'forecast ' || w.forecast_id::text FROM prediction.warnings_current w
   WHERE w.tenant_id = p_tenant AND w.domain_id = p_domain AND w.state IN ('raised', 'acknowledged') AND w.forecast_id IN (SELECT forecast_id FROM f)
  UNION ALL
  SELECT 'scenario', s.scenario_id, 'forecast ' || s.forecast_id::text FROM s
  UNION ALL
  SELECT 'run', r.run_id, 'scenario ' || r.scenario_id::text FROM r
  UNION ALL
  /* B28 (0088) remediation */
  SELECT 'assumption', asu.asu, asu.via FROM asu
  UNION ALL
  /* end B28 remediation */
  SELECT x.subject_kind, x.subject_id, x.via FROM (
    SELECT DISTINCT ON (p.package_id) 'package'::text AS subject_kind, p.package_id AS subject_id, c.via
      FROM decision.packages_current p
      JOIN LATERAL (
        SELECT 'option ' || o.key || ' cites ' || (cs ->> 'kind') || ' ' || (cs ->> 'id') AS via, 1 AS rank
          FROM decision.options o CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(o.consequences) = 'array' THEN o.consequences ELSE '[]'::jsonb END) cs
         WHERE o.package_id = p.package_id AND o.version = p.current_version
           AND ((cs ->> 'id') IN (SELECT forecast_id::text FROM f) OR ((cs ->> 'kind') = 'run' AND (cs ->> 'id') IN (SELECT run_id::text FROM r))
                /* B28 (0088) remediation */ OR ((cs ->> 'kind') = 'assumption' AND (cs ->> 'id') IN (SELECT asu::text FROM asu)) /* end B28 remediation */)
        UNION ALL
        SELECT 'the baseline run ' || pv.baseline_run_id::text, 2 FROM decision.package_versions pv
         WHERE pv.package_id = p.package_id AND pv.version = p.current_version AND pv.baseline_run_id IN (SELECT run_id FROM r)
      ) c ON true
     WHERE p.tenant_id = p_tenant AND p.domain_id = p_domain AND p.state NOT IN ('withdrawn', 'closed')
     ORDER BY p.package_id, c.rank, c.via
  ) x;
$$ LANGUAGE sql;
REVOKE ALL ON FUNCTION observation.source_derived_products(uuid, uuid, uuid) FROM PUBLIC;

-- The ACTIVE markers that bear on one version of a package — on the package, or on what that version cites (its options' forecasts, runs,
-- warnings and — B28 — ASSUMPTIONS; its baseline run) — each with the acknowledgement recorded FOR THIS VERSION that names it, if any.
-- Scoped to the caller's own context (a tenant and domain other than the context's read nothing). 0086 §M2's body, copied whole; ONE
-- change: an option's `assumption` citations are read.
CREATE OR REPLACE FUNCTION decision.source_impact_bearing(p_tenant uuid, p_domain uuid, p_package_id uuid, p_version int)
RETURNS TABLE (marker_id uuid, source_id uuid, subject_kind text, subject_id uuid, health_state text, reason text, set_at timestamptz, bearing text,
               acknowledged boolean, acknowledged_by uuid, acknowledged_at timestamptz, acknowledgement_id uuid)
STABLE SECURITY DEFINER SET search_path = decision, observation, pg_catalog, pg_temp AS $$
  WITH cited AS (
    SELECT DISTINCT CASE WHEN (cs ->> 'kind') IS NULL THEN 'forecast' ELSE cs ->> 'kind' END AS kind, cs ->> 'id' AS id, 'option ' || o.key AS via
      FROM decision.options o CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(o.consequences) = 'array' THEN o.consequences ELSE '[]'::jsonb END) cs
     WHERE o.package_id = p_package_id AND o.version = p_version AND o.tenant_id = p_tenant AND o.domain_id = p_domain
       AND coalesce(cs ->> 'kind', 'forecast') IN ('forecast', 'run', 'warning', /* B28 (0088) remediation */ 'assumption' /* end B28 remediation */)
    UNION
    SELECT 'run', pv.baseline_run_id::text, 'the baseline' FROM decision.package_versions pv
     WHERE pv.package_id = p_package_id AND pv.version = p_version AND pv.tenant_id = p_tenant AND pv.domain_id = p_domain AND pv.baseline_run_id IS NOT NULL
  )
  SELECT m.marker_id, m.source_id, m.subject_kind, m.subject_id, m.health_state, m.reason, m.set_at,
         CASE WHEN m.subject_kind = 'package' THEN 'the package' ELSE (SELECT string_agg(DISTINCT c.via, ', ') FROM cited c WHERE c.kind = m.subject_kind AND c.id = m.subject_id::text) || ' cites it' END,
         a.event_id IS NOT NULL, a.actor_principal_id, a.occurred_at, a.event_id
    FROM observation.source_impact_markers m
    LEFT JOIN LATERAL (
      SELECT e.event_id, e.actor_principal_id, e.occurred_at FROM decision.package_events e
       WHERE e.package_id = p_package_id AND e.event = 'source_impact.acknowledged' AND (e.details ->> 'version')::int = p_version
         AND (e.details -> 'marker_ids') ? m.marker_id::text
       ORDER BY e.occurred_at DESC, e.event_id LIMIT 1) a ON true
   WHERE p_tenant = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR p_domain = public.eye_domain())
     AND m.tenant_id = p_tenant AND m.domain_id = p_domain AND m.state = 'active'
     AND ((m.subject_kind = 'package' AND m.subject_id = p_package_id)
          OR EXISTS (SELECT 1 FROM cited c WHERE c.kind = m.subject_kind AND c.id = m.subject_id::text))
   ORDER BY m.subject_kind, m.subject_id, m.set_at, m.marker_id;
$$ LANGUAGE sql;
REVOKE ALL ON FUNCTION decision.source_impact_bearing(uuid, uuid, uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.source_impact_bearing(uuid, uuid, uuid, int) TO eye_commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- section `signals`
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §S (section `signals`)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0088 §S (B28 part `signals`, feature F-P4-10; and F-P6-07's NOVELTY input) — CP-6 B28: WEAK-SIGNAL DETECTION AND THE INDICATOR
-- WORKBENCH (2026-09-26). V0 C-032, V00-T-097; V01-T-020; V02-T-157/-158 ("a weak-signal object with strengthen/falsify conditions and a
-- status that changes only by corroboration events"); V03-T-260; AI-57-001 (candidates with novelty basis, maturity and monitoring plan),
-- AG-031 (the Weak Signal Agent), MC-014 (an anomaly / weak-signal model class); PR-25-001..006, CAP-FW-01/-02, AT-25, JRN-06, OBJ-17/-18,
-- WS-08; UX-33-001..006.
--
-- THE GAP. Warnings originated only from indicator threshold breaches: nothing detected a weak signal, no object held one (its observation,
-- baseline, novelty basis, corroboration, source independence, strengthen/falsify conditions), nothing nominated, nobody disposed, and the
-- indicator registry had thresholds and owners but no lineage, sensitivity, expiry or review cadence.
--
-- THE MECHANISM.
-- (§S1) THE DETECTORS — prediction.signal_detectors, a global registry (code, not tenant data): one row per detector version with the SQL
--   function that computes it and the sha256 of that function's definition (pg_get_functiondef — the digest IS the code), its input kind,
--   and its status: AVAILABLE where this product holds the input, ABSENT with the reason where it does not. The model class of every
--   detector is `weak_signal_anomaly` (MC-014): deterministic, transparent, no learned weights.
--     novelty              indicator series   the observed window's median deviation from the baseline median, as the SHARE OF THE
--                                             BASELINE'S OWN DEVIATIONS it exceeds (a number in [0, 1]; fires at ≥ 0.95)
--     acceleration         indicator series   the mean day-on-day change of the window against the baseline's, in standard errors of the
--                                             baseline's own changes (fires at ≥ 3)
--     change_point         indicator series   the largest two-sample mean-shift statistic over the recent span, the split recent (fires ≥ 4)
--     relationship_change  graph edges        the entity's relationships that began or ended (world time) in the recent window against
--                                             every baseline window (fires when it exceeds all of them and reaches the minimum)
--     diffusion            edge sources       the distinct real sources whose evidence the entity's new relationships cite, against the
--                                             baseline windows (fires when more sources than any baseline window, at least two)
--     cross_domain_convergence   ABSENT      a convergence across domains needs a cross-domain read; every table is isolated per domain
--                                             under row-level security and no port reads across domains
--   The series detectors read the OBSERVATIONS THE PRODUCT'S INDICATORS EVALUATED (prediction.indicator_evaluations: the value, its
--   observation day and the evidence version it came from) — event time throughout: a detection is read AS OF an observation day, never
--   against the wall clock. Before judging, every series reading is checked for CONTINUITY (PR-25-005): too few points
--   (`insufficient_evidence`), a gap longer than the tolerance in the window or up to the as-of day (`source_gap`), a baseline whose halves
--   disagree by more than the tolerance (`baseline_drift`, novelty and acceleration) — a failed check HOLDS the reading: recorded,
--   exposed with its reason, never nominated. Diffusion holds a window whose only sources are synthetic (`synthetic_only`).
-- (§S2) THE LEDGERS. prediction.signal_detections (append-only: every detector reading, fired or not, held or not, one per detector version
--   × subject × as-of day — a rescan answers `repeated`); prediction.signals_current (the weak-signal OBJECT, versioned: every change a new
--   version with its event); prediction.signal_events (append-only); prediction.signal_evidence (append-only: object, version, source,
--   publisher, origin, digest, stance, and the independence verdict recorded when the row was added); prediction.signal_rankings
--   (append-only: every ranking act, the order, the key and the explanation of each place).
-- (§S3) THE MATURITY GATE (V02-T-158). maturity is tentative | corroborated | invalid and changes ONLY by corroboration: a BEFORE UPDATE
--   trigger refuses any change of it unless a `signal.corroborated` event of the SAME version names an evidence row of the signal, added in
--   that version, whose independence verdict is `independent`; a disposition in the same update never changes it. corroborated: the
--   supporting independent sources reach the signal's threshold (2 — the basis and one independent corroboration); invalid: the
--   contradicting independent sources reach it and outnumber the supporting.
-- (§S4) SOURCE INDEPENDENCE. Two evidence items are INDEPENDENT when their source, their publisher and their evidence digest all differ and
--   neither is synthetic; DEPENDENT when they share a source, a publisher, a digest or a declared upstream (the contract's `upstream`); and
--   UNKNOWN when the relation cannot be verified from the records — a source or publisher that cannot be established, synthetic evidence.
--   An unknown is never counted. A new row is judged against every counted row of its stance; the test port (a named human's act)
--   re-judges every pair and records the matrix.
-- (§S5) NOMINATION by a DETECTOR (a person runs the detectors: the port records nominator `detector`), by the Weak Signal AGENT (its own
--   run, under its own session: nominator `agent`) or by an ANALYST (a named human, with the evidence named). The DISPOSITION — confirm,
--   monitor (needs a falsify condition), dismiss, escalate — is a named human's act, never the nominator's; ESCALATION submits a warning
--   candidate through the intake (0088 §0 prediction.submit_warning_candidate, origin weak_signal, key signal:version) — the lifecycle
--   part turns it into a warning; this section raises none. The strengthen and falsify conditions are a human's, declared and shown.
-- (§S6) THE WEAK SIGNAL AGENT — executive agent kind `weak_signal` (role weak_signal_agent, 0088 §0), task `signal_scan`: its OWN run,
--   under its own session, triggered by an operator (the run route) — not an attention tick step (the tick runs under the attention
--   agent's principal, which is not the Weak Signal Agent's). Its only authorities are prediction.signal.nominate and prediction.signal.rank;
--   its attempt at a disposition is refused at the PDP and recorded on the run (the decision agent's precedent). executive.register_agent
--   and executive.open_agent_run re-declared (0086 §T copied whole): the kind, the task, max_items enforced by the scan.
-- (§S7) INDICATOR REGISTRY GOVERNANCE (CAP-FW-02): lineage (the series, its source and publisher, set at definition), classification,
--   expiry and review cadence on prediction.indicators_current; retire and renew with events (prediction.indicator_events, append-only);
--   prediction.define_indicator re-declared (0059 copied whole: the lineage and the `indicator.defined` event) and
--   prediction.evaluate_indicator re-declared (0030 copied whole) with ONE guard: a retired or expired indicator is not evaluated.
-- (§S8) THE NOVELTY INPUT (F-P6-07, the 0086 §M rule): executive.attention_dimensions gives the engine the novelty detector's measure — a
--   warning escalated from a weak signal carries that signal's novelty; a warning on an indicator carries the indicator's latest novelty
--   reading (a held reading is no input); every other class declares "no input". executive.validate_attention_rules admits
--   `min_novelty` (a number in [0, 1]); executive.evaluate_attention judges it where a class sets it and says "novelty: no input, not
--   judged" otherwise. `require` does not list novelty (unchanged vocabulary).
--
-- NOT HERE (stated): cross-domain convergence (ABSENT — no cross-domain read under RLS); evaluating the strengthen / falsify conditions
--   automatically (declared and shown; the status changes only by corroboration); a scheduled cadence for the Weak Signal Agent (an
--   operator's trigger runs it; a scheduler job kind is a later batch); learning from dispositions (nothing learns — the detectors are
--   versioned code); the warning itself (the lifecycle part §W turns the candidate into one); `monitored` as a maturity (the part prompt
--   proposed it — a maturity a person sets would break "changed only by corroboration", so monitoring is the DISPOSITION `monitor`);
--   an interface-register change (B28 adds no interface — 50/0/0).


-- ============================================================
-- §S6 THE WEAK SIGNAL AGENT: the fifth kind and its task
-- ============================================================
ALTER TABLE executive.agents DROP CONSTRAINT IF EXISTS agents_agent_kind_check;
ALTER TABLE executive.agents ADD CONSTRAINT agents_agent_kind_check CHECK (agent_kind IN ('decision', 'briefing', 'reporting', 'attention', 'weak_signal'));
ALTER TABLE executive.agent_runs DROP CONSTRAINT IF EXISTS agent_runs_task_check;
ALTER TABLE executive.agent_runs ADD CONSTRAINT agent_runs_task_check CHECK (task IN ('draft', 'briefing', 'report', 'monitor', 'attention_tick', 'signal_scan'));

-- 0086 §T copied whole (0049 §5 + B24); B28: the kind weak_signal (role weak_signal_agent, 0088 §0) and max_items enforced by its scan.
CREATE OR REPLACE FUNCTION executive.register_agent(
  p_agent_id uuid, p_tenant uuid, p_domain uuid, p_principal uuid, p_kind text, p_version text, p_code_digest text, p_owner uuid, p_escalation uuid,
  p_budgets jsonb, p_stop_conditions jsonb, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, decision, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_kind text; v_status text; sc jsonb; k text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['agent.register']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_kind NOT IN ('decision', 'briefing', 'reporting', 'attention', 'weak_signal') THEN RAISE EXCEPTION 'agent rejected: kind is decision, briefing, reporting, attention or weak_signal' USING ERRCODE = '22023'; END IF;
  SELECT kind, status INTO v_kind, v_status FROM identity.principals WHERE id = p_principal AND tenant_id = p_tenant;
  IF NOT FOUND OR v_kind <> 'agent' OR v_status <> 'active' THEN RAISE EXCEPTION 'agent rejected: the principal must be an active principal of kind agent in this tenant' USING ERRCODE = '42501'; END IF;
  IF NOT decision.is_active_human(p_owner, p_tenant) THEN RAISE EXCEPTION 'agent rejected: the owner is the accountable human, never another agent' USING ERRCODE = '42501'; END IF;
  IF NOT decision.is_active_human(p_escalation, p_tenant) THEN RAISE EXCEPTION 'agent rejected: the escalation target is a named human' USING ERRCODE = '42501'; END IF;
  IF p_budgets IS NULL OR jsonb_typeof(p_budgets) <> 'object' OR NOT (p_budgets ? 'max_reads' AND p_budgets ? 'max_gateway_calls' AND p_budgets ? 'max_elapsed_ms') THEN
    RAISE EXCEPTION 'agent rejected: budgets name max_reads, max_gateway_calls and max_elapsed_ms' USING ERRCODE = '22023';
  END IF;
  FOREACH k IN ARRAY ARRAY['max_reads', 'max_gateway_calls', 'max_elapsed_ms'] LOOP
    IF jsonb_typeof(p_budgets -> k) <> 'number' OR (p_budgets ->> k)::numeric < 0 OR (p_budgets ->> k)::numeric <> floor((p_budgets ->> k)::numeric) THEN
      RAISE EXCEPTION 'agent rejected: budget % is a non-negative integer', k USING ERRCODE = '22023';
    END IF;
  END LOOP;
  -- B24 (0086 §T): the attention timer's cadence — a whole number of seconds in [60, 86400]; no other kind carries it
  IF p_budgets ? 'tick_every_seconds' THEN
    IF p_kind <> 'attention' THEN RAISE EXCEPTION 'agent rejected: budget tick_every_seconds is the attention timer''s cadence; a % agent has none', p_kind USING ERRCODE = '22023'; END IF;
    IF jsonb_typeof(p_budgets -> 'tick_every_seconds') <> 'number' OR (p_budgets ->> 'tick_every_seconds')::numeric <> floor((p_budgets ->> 'tick_every_seconds')::numeric)
       OR (p_budgets ->> 'tick_every_seconds')::numeric < 60 OR (p_budgets ->> 'tick_every_seconds')::numeric > 86400 THEN
      RAISE EXCEPTION 'agent rejected: budget tick_every_seconds is a whole number of seconds in [60, 86400]' USING ERRCODE = '22023';
    END IF;
  END IF;
  IF p_stop_conditions IS NOT NULL AND jsonb_typeof(p_stop_conditions) <> 'array' THEN RAISE EXCEPTION 'agent rejected: stop_conditions is an array' USING ERRCODE = '22023'; END IF;
  FOR sc IN SELECT * FROM jsonb_array_elements(coalesce(p_stop_conditions, '[]'::jsonb)) LOOP
    IF jsonb_typeof(sc) <> 'object' OR (sc ->> 'kind') NOT IN ('max_items', 'on_degraded') THEN
      RAISE EXCEPTION 'agent rejected: stop condition % is not one this runtime supports (max_items, on_degraded)', coalesce(sc ->> 'kind', sc::text) USING ERRCODE = '22023';
    END IF;
    -- every accepted condition is one this agent kind's task enforces: max_items on the decision draft and the briefing; on_degraded on the briefing
    -- B28 (0088 §S6): max_items on the weak-signal scan too (the nominations one run makes; the rest wait for the next scan)
    IF (sc ->> 'kind') = 'max_items' AND p_kind NOT IN ('decision', 'briefing', 'weak_signal') THEN
      RAISE EXCEPTION 'agent rejected: stop condition max_items is not enforced by a % agent''s task; an unenforced control is not accepted', p_kind USING ERRCODE = '22023';
    END IF;
    IF (sc ->> 'kind') = 'on_degraded' AND p_kind <> 'briefing' THEN
      RAISE EXCEPTION 'agent rejected: stop condition on_degraded is not enforced by a % agent''s task; an unenforced control is not accepted', p_kind USING ERRCODE = '22023';
    END IF;
    IF (sc ->> 'kind') = 'max_items' AND (jsonb_typeof(sc -> 'value') <> 'number' OR (sc ->> 'value')::numeric < 0) THEN
      RAISE EXCEPTION 'agent rejected: stop condition max_items names a non-negative value' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  INSERT INTO executive.agents (agent_id, scope, tenant_id, domain_id, principal_id, agent_kind, agent_version, code_digest, owner_principal_id, escalation_principal_id, budgets, stop_conditions, created_by, correlation_id)
  VALUES (p_agent_id, 'DOMAIN', p_tenant, p_domain, p_principal, p_kind, p_version, p_code_digest, p_owner, p_escalation, p_budgets, coalesce(p_stop_conditions, '[]'::jsonb), p_actor, p_correlation);
  RETURN jsonb_build_object('agent_id', p_agent_id, 'principal_id', p_principal, 'kind', p_kind);
END $$ LANGUAGE plpgsql;

-- 0086 §T copied whole (0046 + B24); B28: the task signal_scan, run by a weak_signal agent and by no other kind (the refusal texts keep the
-- 0046 phrases the refusal row reads — `task is draft, briefing, report or monitor`, `a % agent does not run the task`).
CREATE OR REPLACE FUNCTION executive.open_agent_run(
  p_run_id uuid, p_tenant uuid, p_domain uuid, p_agent_id uuid, p_task text, p_trigger_kind text, p_trigger_principal uuid, p_trigger_ref text, p_room_id uuid, p_package_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE a executive.agents%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['agent.run']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT * INTO a FROM executive.agents WHERE agent_id = p_agent_id AND tenant_id = p_tenant AND domain_id = p_domain;
  IF NOT FOUND OR a.status <> 'active' THEN RAISE EXCEPTION 'run rejected: no active agent % in this domain', p_agent_id USING ERRCODE = '42501'; END IF;
  IF a.principal_id IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'run rejected: a run is opened by the agent itself, under its own session' USING ERRCODE = '42501'; END IF;
  IF p_task NOT IN ('draft', 'briefing', 'report', 'monitor', 'attention_tick', 'signal_scan') THEN RAISE EXCEPTION 'run rejected: task is draft, briefing, report or monitor (or attention_tick for an attention agent, signal_scan for a weak_signal agent)' USING ERRCODE = '22023'; END IF;
  IF (a.agent_kind = 'decision' AND p_task <> 'draft') OR (a.agent_kind = 'briefing' AND p_task NOT IN ('briefing', 'monitor')) OR (a.agent_kind = 'reporting' AND p_task <> 'report')
     OR (a.agent_kind = 'attention' AND p_task <> 'attention_tick') OR (a.agent_kind <> 'attention' AND p_task = 'attention_tick')
     -- B28 (0088 §S6): the weak-signal scan, run by a weak_signal agent and by no other kind
     OR (a.agent_kind = 'weak_signal' AND p_task <> 'signal_scan') OR (a.agent_kind <> 'weak_signal' AND p_task = 'signal_scan') THEN
    RAISE EXCEPTION 'run rejected: a % agent does not run the task %', a.agent_kind, p_task USING ERRCODE = '42501';
  END IF;
  INSERT INTO executive.agent_runs (run_id, scope, tenant_id, domain_id, agent_id, principal_id, agent_kind, agent_version, code_digest, task, trigger_kind, trigger_principal_id, trigger_ref, room_id, package_id, budget, correlation_id)
  VALUES (p_run_id, 'DOMAIN', p_tenant, p_domain, p_agent_id, a.principal_id, a.agent_kind, a.agent_version, a.code_digest, p_task, p_trigger_kind, p_trigger_principal, p_trigger_ref, p_room_id, p_package_id, a.budgets, p_correlation);
  RETURN jsonb_build_object('run_id', p_run_id, 'budget', a.budgets, 'stop_conditions', a.stop_conditions, 'escalation_principal_id', a.escalation_principal_id);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.open_agent_run(uuid,uuid,uuid,uuid,text,text,uuid,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.open_agent_run(uuid,uuid,uuid,uuid,text,text,uuid,text,uuid,uuid,uuid) TO eye_commit;


-- ============================================================
-- §S7 INDICATOR REGISTRY GOVERNANCE (CAP-FW-02): lineage, classification, expiry + review cadence, retire / renew with events
-- ============================================================
ALTER TABLE prediction.indicators_current
  ADD COLUMN classification text NOT NULL DEFAULT 'internal' CHECK (classification IN ('public', 'internal', 'confidential', 'restricted')),
  ADD COLUMN expires_at timestamptz,
  ADD COLUMN review_every_days int NOT NULL DEFAULT 90 CHECK (review_every_days BETWEEN 1 AND 3650),
  ADD COLUMN next_review_at timestamptz,
  ADD COLUMN lineage jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(lineage) = 'object'),
  ADD COLUMN retired_at timestamptz,
  ADD COLUMN retired_by uuid,
  ADD COLUMN retire_reason text,
  ADD COLUMN renewed_at timestamptz;
COMMENT ON COLUMN prediction.indicators_current.expires_at IS 'B28 (0088 §S7; CAP-FW-02): the instant the indicator''s definition lapses — an expired indicator is not evaluated (evaluate_indicator refuses) nor scanned until it is renewed; null: no expiry declared';
COMMENT ON COLUMN prediction.indicators_current.lineage IS 'B28 (0088 §S7): where the indicator comes from — the series, its source and publisher (set at definition) and the steward''s note';

CREATE TABLE prediction.indicator_events (
  event_id           uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  indicator_id       uuid NOT NULL REFERENCES prediction.indicators_current (indicator_id),
  event              text NOT NULL CHECK (event IN ('indicator.defined', 'indicator.governed', 'indicator.retired', 'indicator.renewed')),
  actor_principal_id uuid NOT NULL,
  details            jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
  occurred_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT pie_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX pie_indicator ON prediction.indicator_events (indicator_id, occurred_at);
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON prediction.indicator_events FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE prediction.indicator_events IS 'B28 (0088 §S7; CAP-FW-02): the indicator registry''s governance ledger — defined (with its lineage), governed, retired, renewed; append-only';
REVOKE ALL ON prediction.indicator_events FROM PUBLIC;
ALTER TABLE prediction.indicator_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE prediction.indicator_events FORCE ROW LEVEL SECURITY;
CREATE POLICY prediction_isolation ON prediction.indicator_events USING (tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain()));  -- 0029:420-425 verbatim
GRANT SELECT ON prediction.indicator_events TO eye_app, eye_commit;

-- The lineage of an indicator from its series: the series key, the source and its publisher (read from the registry and the contract).
CREATE OR REPLACE FUNCTION prediction.indicator_lineage(p_tenant uuid, p_domain uuid, p_series_key text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = prediction, observation, pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object('series_key', p_series_key, 'source_key', r.source_key, 'parser_ref', r.parser_ref, 'value_field', r.value_field,
                            'publisher', (SELECT c.publisher FROM observation.source_contracts_current c WHERE c.source_key = r.source_key AND c.tenant_id = p_tenant AND c.domain_id = p_domain ORDER BY c.contract_version DESC LIMIT 1),
                            'data_origin', (SELECT c.data_origin FROM observation.source_contracts_current c WHERE c.source_key = r.source_key AND c.tenant_id = p_tenant AND c.domain_id = p_domain ORDER BY c.contract_version DESC LIMIT 1),
                            'derived_from', 'series')
    FROM prediction.series_registry r WHERE r.tenant_id = p_tenant AND r.domain_id = p_domain AND r.series_key = p_series_key
$$;
REVOKE ALL ON FUNCTION prediction.indicator_lineage(uuid,uuid,text) FROM PUBLIC;


-- 0059 copied whole; B28: the lineage and the `indicator.defined` entry (same signature).
CREATE OR REPLACE FUNCTION prediction.define_indicator(
  p_indicator_id uuid, p_tenant uuid, p_domain uuid, p_series_key text, p_description text,
  p_comparator text, p_threshold numeric, p_consecutive int, p_owner uuid, p_observes_from date,
  p_actor uuid, p_correlation uuid
) RETURNS void
SECURITY DEFINER SET search_path = prediction, observation, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.indicator.define']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF NOT EXISTS (SELECT 1 FROM prediction.series_registry s
                  WHERE s.tenant_id = p_tenant AND s.domain_id = p_domain AND s.series_key = p_series_key) THEN
    RAISE EXCEPTION 'indicator rejected: series % is not registered in this domain', p_series_key USING ERRCODE = '23503';
  END IF;
  INSERT INTO prediction.indicators_current (
    indicator_id, scope, tenant_id, domain_id, series_key, description, comparator, threshold,
    consecutive_days, owner_principal_id, state, correlation_id, observes_from
  ) VALUES (
    p_indicator_id, 'DOMAIN', p_tenant, p_domain, p_series_key, p_description, p_comparator, p_threshold,
    p_consecutive, p_owner, 'active', p_correlation, p_observes_from);
  -- B28 (0088 §S7): the LINEAGE (the series, its source and publisher), the first review by the default cadence, the registry ledger's first entry
  UPDATE prediction.indicators_current SET lineage = coalesce(prediction.indicator_lineage(p_tenant, p_domain, p_series_key), '{}'::jsonb),
         next_review_at = clock_timestamp() + make_interval(days => review_every_days) WHERE indicator_id = p_indicator_id;
  INSERT INTO prediction.indicator_events (event_id, scope, tenant_id, domain_id, indicator_id, event, actor_principal_id, details, correlation_id)
  SELECT gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_indicator_id, 'indicator.defined', p_actor,
         jsonb_build_object('lineage', i.lineage, 'series_key', p_series_key, 'comparator', p_comparator, 'threshold', p_threshold, 'consecutive_days', p_consecutive,
                            'owner', p_owner, 'observes_from', p_observes_from, 'classification', i.classification, 'review_every_days', i.review_every_days, 'expires_at', i.expires_at), p_correlation
    FROM prediction.indicators_current i WHERE i.indicator_id = p_indicator_id;
END $$ LANGUAGE plpgsql;

-- 0030 copied whole (same signature); B28: ONE guard — a retired or expired indicator is not evaluated.
CREATE OR REPLACE FUNCTION prediction.evaluate_indicator(
  p_evaluation_id uuid, p_tenant uuid, p_domain uuid, p_indicator_id uuid, p_known_at timestamptz,
  p_observation_at date, p_value numeric, p_evidence_object_id uuid, p_evidence_version bigint,
  p_actor uuid, p_correlation uuid
) RETURNS TABLE (out_breached boolean, out_streak int, out_branch_id uuid, out_flip_event_id uuid)
SECURITY DEFINER SET search_path = prediction, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE i prediction.indicators_current%ROWTYPE; v_sat boolean; v_streak int; v_breached boolean; b record;
        v_flip uuid; v_any boolean := false;
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.indicator.evaluate']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT * INTO i FROM prediction.indicators_current
   WHERE indicator_id = p_indicator_id AND tenant_id = p_tenant AND domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'evaluation rejected: no such indicator in this domain' USING ERRCODE = '23503';
  END IF;
  -- B28 (0088 §S7, CAP-FW-02): a retired or EXPIRED indicator is not evaluated (renew it first; a retired one stays retired)
  IF i.state = 'retired' THEN
    RAISE EXCEPTION 'indicator governance rejected (retired): indicator % was retired at %; a retired indicator is not evaluated', p_indicator_id, i.retired_at USING ERRCODE = '23514';
  END IF;
  IF i.expires_at IS NOT NULL AND i.expires_at <= clock_timestamp() THEN
    RAISE EXCEPTION 'indicator governance rejected (expired): indicator % expired at %; an expired indicator is not evaluated until it is renewed', p_indicator_id, i.expires_at USING ERRCODE = '23514';
  END IF;
  IF i.last_observation_at IS NOT NULL AND p_observation_at <= i.last_observation_at THEN
    RAISE EXCEPTION 'evaluation rejected: observation % is not after the last evaluated observation %',
      p_observation_at, i.last_observation_at USING ERRCODE = '22023';
  END IF;
  v_sat := CASE i.comparator
    WHEN '<'  THEN p_value <  i.threshold
    WHEN '<=' THEN p_value <= i.threshold
    WHEN '>'  THEN p_value >  i.threshold
    ELSE           p_value >= i.threshold END;
  v_streak := CASE WHEN v_sat THEN i.streak + 1 ELSE 0 END;
  v_breached := v_streak >= i.consecutive_days;

  INSERT INTO prediction.indicator_evaluations (
    evaluation_id, scope, tenant_id, domain_id, indicator_id, known_at, observation_at, value,
    evidence_object_id, evidence_version, satisfied, streak, breached, actor_principal_id, correlation_id
  ) VALUES (
    p_evaluation_id, 'DOMAIN', p_tenant, p_domain, p_indicator_id, p_known_at, p_observation_at, p_value,
    p_evidence_object_id, p_evidence_version, v_sat, v_streak, v_breached, p_actor, p_correlation);

  UPDATE prediction.indicators_current
     SET last_value = p_value, last_observation_at = p_observation_at, last_evaluated_at = clock_timestamp(),
         streak = v_streak,
         breached = CASE WHEN v_breached THEN true ELSE i.breached AND v_sat END,
         breached_at = CASE WHEN v_breached AND NOT i.breached THEN clock_timestamp() ELSE i.breached_at END
   WHERE indicator_id = p_indicator_id;

  IF v_breached THEN
    FOR b IN SELECT br.branch_id, br.scenario_id FROM prediction.branches_current br
              WHERE br.indicator_id = p_indicator_id AND br.state = 'open' FOR UPDATE
    LOOP
      v_flip := gen_random_uuid();
      UPDATE prediction.branches_current
         SET state = 'flipped', flipped_at = clock_timestamp(), flip_event_id = v_flip,
             flip_correlation_id = p_correlation, warning_state = 'owed'
       WHERE branch_id = b.branch_id;
      INSERT INTO prediction.scenario_events (
        event_id, scope, tenant_id, domain_id, scenario_id, branch_id, event, actor_principal_id, details, correlation_id
      ) VALUES (
        v_flip, 'DOMAIN', p_tenant, p_domain, b.scenario_id, b.branch_id, 'branch.flipped', p_actor,
        jsonb_build_object('indicator_id', p_indicator_id, 'evaluation_id', p_evaluation_id,
                           'observation_at', p_observation_at, 'value', p_value, 'streak', v_streak,
                           'threshold', i.threshold, 'comparator', i.comparator,
                           'consecutive_days', i.consecutive_days, 'evidence_object_id', p_evidence_object_id,
                           'evidence_version', p_evidence_version),
        p_correlation);
      v_any := true;
      out_breached := true; out_streak := v_streak; out_branch_id := b.branch_id; out_flip_event_id := v_flip;
      RETURN NEXT;
    END LOOP;
  END IF;
  IF NOT v_any THEN
    out_breached := v_breached; out_streak := v_streak; out_branch_id := NULL; out_flip_event_id := NULL;
    RETURN NEXT;
  END IF;
END $$ LANGUAGE plpgsql;


-- The indicator a governance port acts on: in this domain, by a named human (the acting principal).
CREATE OR REPLACE FUNCTION prediction.indicator_for_governance(p_indicator uuid, p_tenant uuid, p_domain uuid, p_actor uuid) RETURNS prediction.indicators_current
LANGUAGE plpgsql SECURITY DEFINER SET search_path = prediction, decision, pg_catalog, pg_temp AS $$
DECLARE i prediction.indicators_current%ROWTYPE;
BEGIN
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'indicator governance rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF NOT decision.is_active_human(p_actor, p_tenant) THEN RAISE EXCEPTION 'indicator governance rejected: the registry is governed by a named, active human' USING ERRCODE = '42501'; END IF;
  SELECT * INTO i FROM prediction.indicators_current x WHERE x.indicator_id = p_indicator AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'indicator governance rejected: no such indicator % in this domain', p_indicator USING ERRCODE = '23503'; END IF;
  RETURN i;
END $$;
REVOKE ALL ON FUNCTION prediction.indicator_for_governance(uuid,uuid,uuid,uuid) FROM PUBLIC;

-- GOVERN: the classification, the expiry, the review cadence (the next review from now) and a steward's lineage note — each optional, at
-- least one named; a retired indicator is not governed (renew is refused too — it stays retired).
CREATE OR REPLACE FUNCTION prediction.govern_indicator(p_indicator uuid, p_tenant uuid, p_domain uuid, p_classification text, p_expires_at timestamptz, p_review_every_days int,
                                                       p_lineage_note text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE i prediction.indicators_current%ROWTYPE; v_note text := nullif(btrim(coalesce(p_lineage_note, '')), ''); v_lineage jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.indicator.govern']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_classification IS NULL AND p_expires_at IS NULL AND p_review_every_days IS NULL AND v_note IS NULL THEN
    RAISE EXCEPTION 'indicator governance rejected: name a classification, an expiry, a review cadence or a lineage note' USING ERRCODE = '22023';
  END IF;
  IF p_classification IS NOT NULL AND p_classification NOT IN ('public', 'internal', 'confidential', 'restricted') THEN
    RAISE EXCEPTION 'indicator governance rejected: the classification is public, internal, confidential or restricted' USING ERRCODE = '22023';
  END IF;
  IF p_review_every_days IS NOT NULL AND (p_review_every_days < 1 OR p_review_every_days > 3650) THEN RAISE EXCEPTION 'indicator governance rejected: the review cadence is 1..3650 days' USING ERRCODE = '22023'; END IF;
  IF p_expires_at IS NOT NULL AND p_expires_at <= clock_timestamp() THEN RAISE EXCEPTION 'indicator governance rejected: an expiry is a future instant' USING ERRCODE = '22023'; END IF;
  IF v_note IS NOT NULL AND length(v_note) NOT BETWEEN 8 AND 2000 THEN RAISE EXCEPTION 'indicator governance rejected: a lineage note is 8..2000 characters' USING ERRCODE = '22023'; END IF;
  i := prediction.indicator_for_governance(p_indicator, p_tenant, p_domain, p_actor);
  IF i.state = 'retired' THEN
    RAISE EXCEPTION 'indicator governance rejected (retired): indicator % was retired at %; a retired indicator is not governed or renewed', p_indicator, i.retired_at USING ERRCODE = '23514';
  END IF;
  v_lineage := CASE WHEN v_note IS NULL THEN i.lineage ELSE i.lineage || jsonb_build_object('note', v_note, 'noted_by', p_actor, 'noted_at', clock_timestamp()) END;
  UPDATE prediction.indicators_current SET classification = coalesce(p_classification, i.classification), expires_at = coalesce(p_expires_at, i.expires_at),
         review_every_days = coalesce(p_review_every_days, i.review_every_days),
         next_review_at = CASE WHEN p_review_every_days IS NULL THEN i.next_review_at ELSE clock_timestamp() + make_interval(days => p_review_every_days) END,
         lineage = v_lineage
   WHERE indicator_id = p_indicator;
  INSERT INTO prediction.indicator_events (event_id, scope, tenant_id, domain_id, indicator_id, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_indicator, 'indicator.governed', p_actor,
          jsonb_build_object('classification', jsonb_build_object('from', i.classification, 'to', coalesce(p_classification, i.classification)),
                             'expires_at', jsonb_build_object('from', i.expires_at, 'to', coalesce(p_expires_at, i.expires_at)),
                             'review_every_days', jsonb_build_object('from', i.review_every_days, 'to', coalesce(p_review_every_days, i.review_every_days)), 'lineage_note', v_note), p_correlation);
  RETURN (SELECT jsonb_build_object('indicator_id', x.indicator_id, 'state', x.state, 'classification', x.classification, 'expires_at', x.expires_at, 'review_every_days', x.review_every_days,
                                    'next_review_at', x.next_review_at, 'lineage', x.lineage) FROM prediction.indicators_current x WHERE x.indicator_id = p_indicator);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.govern_indicator(uuid,uuid,uuid,text,timestamptz,int,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.govern_indicator(uuid,uuid,uuid,text,timestamptz,int,text,uuid,uuid) TO eye_commit;

-- RETIRE: the indicator stops being evaluated and scanned; the open branches that watch it are NAMED in the answer (they no longer flip —
-- the person retiring it sees what they give up), never silently closed.
CREATE OR REPLACE FUNCTION prediction.retire_indicator(p_indicator uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE i prediction.indicators_current%ROWTYPE; v_reason text := nullif(btrim(coalesce(p_reason, '')), ''); v_branches jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.indicator.retire']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF v_reason IS NULL OR length(v_reason) NOT BETWEEN 8 AND 2000 THEN RAISE EXCEPTION 'indicator governance rejected: a retirement states why in 8..2000 characters' USING ERRCODE = '22023'; END IF;
  i := prediction.indicator_for_governance(p_indicator, p_tenant, p_domain, p_actor);
  IF i.state = 'retired' THEN
    RAISE EXCEPTION 'indicator governance rejected (retired): indicator % was retired at %; a retired indicator is not governed or renewed', p_indicator, i.retired_at USING ERRCODE = '23514';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('branch_id', b.branch_id, 'scenario_id', b.scenario_id, 'name', b.name) ORDER BY b.branch_id), '[]'::jsonb) INTO v_branches
    FROM prediction.branches_current b WHERE b.indicator_id = p_indicator AND b.state = 'open';
  UPDATE prediction.indicators_current SET state = 'retired', retired_at = clock_timestamp(), retired_by = p_actor, retire_reason = v_reason WHERE indicator_id = p_indicator;
  INSERT INTO prediction.indicator_events (event_id, scope, tenant_id, domain_id, indicator_id, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_indicator, 'indicator.retired', p_actor, jsonb_build_object('reason', v_reason, 'open_branches_watching', v_branches), p_correlation);
  RETURN jsonb_build_object('indicator_id', p_indicator, 'state', 'retired', 'reason', v_reason, 'open_branches_watching', v_branches,
                            'note', 'a retired indicator is not evaluated or scanned; the open branches named here no longer flip on it');
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.retire_indicator(uuid,uuid,uuid,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.retire_indicator(uuid,uuid,uuid,text,uuid,uuid) TO eye_commit;

-- RENEW: a new expiry later than now and than the current one; the next review from now by the cadence. An expired indicator renewed is
-- evaluated again from where it stopped (its last evaluated observation); a retired one is not renewed.
CREATE OR REPLACE FUNCTION prediction.renew_indicator(p_indicator uuid, p_tenant uuid, p_domain uuid, p_expires_at timestamptz, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE i prediction.indicators_current%ROWTYPE; v_reason text := nullif(btrim(coalesce(p_reason, '')), ''); v_was_expired boolean;
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.indicator.renew']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF v_reason IS NULL OR length(v_reason) NOT BETWEEN 8 AND 2000 THEN RAISE EXCEPTION 'indicator governance rejected: a renewal states why in 8..2000 characters' USING ERRCODE = '22023'; END IF;
  IF p_expires_at IS NULL OR p_expires_at <= clock_timestamp() THEN RAISE EXCEPTION 'indicator governance rejected: a renewal names a future expiry' USING ERRCODE = '22023'; END IF;
  i := prediction.indicator_for_governance(p_indicator, p_tenant, p_domain, p_actor);
  IF i.state = 'retired' THEN
    RAISE EXCEPTION 'indicator governance rejected (retired): indicator % was retired at %; a retired indicator is not governed or renewed', p_indicator, i.retired_at USING ERRCODE = '23514';
  END IF;
  IF i.expires_at IS NOT NULL AND p_expires_at <= i.expires_at THEN
    RAISE EXCEPTION 'indicator governance rejected: a renewal extends the expiry beyond %', i.expires_at USING ERRCODE = '22023';
  END IF;
  v_was_expired := i.expires_at IS NOT NULL AND i.expires_at <= clock_timestamp();
  UPDATE prediction.indicators_current SET expires_at = p_expires_at, renewed_at = clock_timestamp(), next_review_at = clock_timestamp() + make_interval(days => i.review_every_days)
   WHERE indicator_id = p_indicator;
  INSERT INTO prediction.indicator_events (event_id, scope, tenant_id, domain_id, indicator_id, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_indicator, 'indicator.renewed', p_actor,
          jsonb_build_object('reason', v_reason, 'prior_expires_at', i.expires_at, 'expires_at', p_expires_at, 'was_expired', v_was_expired), p_correlation);
  RETURN jsonb_build_object('indicator_id', p_indicator, 'state', i.state, 'expires_at', p_expires_at, 'prior_expires_at', i.expires_at, 'was_expired', v_was_expired,
                            'next_review_at', clock_timestamp() + make_interval(days => i.review_every_days));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.renew_indicator(uuid,uuid,uuid,timestamptz,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.renew_indicator(uuid,uuid,uuid,timestamptz,text,uuid,uuid) TO eye_commit;


-- ============================================================
-- §S1 THE DETECTORS — pure, versioned, transparent (the model class weak_signal_anomaly, MC-014)
-- ============================================================
-- A series point is {d: 'YYYY-MM-DD', v: number, e: evidence object id, ev: evidence version}. The median of a list.
CREATE OR REPLACE FUNCTION prediction.signal_median(p numeric[]) RETURNS numeric
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT CASE WHEN cardinality(p) = 0 THEN NULL ELSE (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY x) FROM unnest(p) x)::numeric END
$$;

-- CONTINUITY FIRST (PR-25-005): the points at or before the as-of day, the observed window (the last p_window) and the baseline (the
-- p_baseline before it); HELD for too few points, or for a gap longer than p_max_gap_days anywhere from the baseline's first day to the
-- as-of day. The observed window's evidence versions are the reading's basis.
CREATE OR REPLACE FUNCTION prediction.signal_series_prepare(p_points jsonb, p_as_of date, p_window int, p_baseline int, p_min_baseline int, p_max_gap_days int)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path = prediction, pg_catalog, pg_temp AS $$
DECLARE v_pts jsonb; v_n int; v_obs numeric[] := '{}'; v_base numeric[] := '{}'; v_dates date[] := '{}'; v_gap int := 0; v_gap_from date; v_gap_to date;
        i int; e jsonb; v_ev jsonb := '[]'::jsonb; v_held text; v_detail text;
BEGIN
  SELECT coalesce(jsonb_agg(p ORDER BY (p ->> 'd')::date), '[]'::jsonb) INTO v_pts FROM (
    SELECT p FROM jsonb_array_elements(coalesce(p_points, '[]'::jsonb)) p
     WHERE jsonb_typeof(p) = 'object' AND (p ->> 'd') ~ '^\d{4}-\d{2}-\d{2}$' AND jsonb_typeof(p -> 'v') = 'number' AND (p ->> 'd')::date <= p_as_of
     ORDER BY (p ->> 'd')::date DESC LIMIT p_window + p_baseline) s;
  v_n := jsonb_array_length(v_pts);
  FOR i IN 0 .. v_n - 1 LOOP
    e := v_pts -> i;
    v_dates := v_dates || (e ->> 'd')::date;
    IF i >= v_n - p_window THEN
      v_obs := v_obs || (e ->> 'v')::numeric;
      IF (e ->> 'e') IS NOT NULL AND NOT v_ev @> jsonb_build_array(jsonb_build_object('object_id', e ->> 'e', 'version', coalesce((e ->> 'ev')::int, 1))) THEN
        v_ev := v_ev || jsonb_build_array(jsonb_build_object('object_id', e ->> 'e', 'version', coalesce((e ->> 'ev')::int, 1)));
      END IF;
    ELSE v_base := v_base || (e ->> 'v')::numeric; END IF;
  END LOOP;
  FOR i IN 2 .. cardinality(v_dates) LOOP
    IF v_dates[i] - v_dates[i - 1] > v_gap THEN v_gap := v_dates[i] - v_dates[i - 1]; v_gap_from := v_dates[i - 1]; v_gap_to := v_dates[i]; END IF;
  END LOOP;
  IF cardinality(v_dates) > 0 AND p_as_of - v_dates[cardinality(v_dates)] > v_gap THEN
    v_gap := p_as_of - v_dates[cardinality(v_dates)]; v_gap_from := v_dates[cardinality(v_dates)]; v_gap_to := p_as_of;
  END IF;
  IF cardinality(v_obs) < p_window OR cardinality(v_base) < p_min_baseline THEN
    v_held := 'insufficient_evidence';
    v_detail := format('%s observed and %s baseline point(s) up to %s; the detector needs %s and %s', cardinality(v_obs), cardinality(v_base), p_as_of, p_window, p_min_baseline);
  ELSIF v_gap > p_max_gap_days THEN
    v_held := 'source_gap';
    v_detail := format('no observation between %s and %s (%s days; the tolerance is %s)', v_gap_from, v_gap_to, v_gap, p_max_gap_days);
  END IF;
  RETURN jsonb_build_object('obs', to_jsonb(v_obs), 'base', to_jsonb(v_base), 'n_obs', cardinality(v_obs), 'n_base', cardinality(v_base),
    'obs_from', CASE WHEN v_n >= p_window AND p_window > 0 THEN v_pts -> (v_n - p_window) ->> 'd' END, 'obs_to', v_pts -> (v_n - 1) ->> 'd',
    'base_from', CASE WHEN cardinality(v_base) > 0 THEN v_pts -> 0 ->> 'd' END, 'base_to', CASE WHEN cardinality(v_base) > 0 THEN v_pts -> (cardinality(v_base) - 1) ->> 'd' END,
    'max_gap_days', v_gap, 'held', v_held, 'held_detail', v_detail, 'evidence', v_ev);
END $$;

-- A baseline whose two halves' medians differ by more than p_drift_mad MADs is DRIFTING: a deviation from it is not novel, it is the drift.
CREATE OR REPLACE FUNCTION prediction.signal_baseline_drift(p_base numeric[], p_drift_mad numeric) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path = prediction, pg_catalog, pg_temp AS $$
DECLARE v_half int := cardinality(p_base) / 2; v_m numeric; v_mad numeric; v_a numeric; v_b numeric;
BEGIN
  IF v_half < 2 THEN RETURN jsonb_build_object('drifting', false); END IF;
  v_m := prediction.signal_median(p_base);
  v_mad := prediction.signal_median(ARRAY(SELECT abs(x - v_m) FROM unnest(p_base) x));
  v_a := prediction.signal_median(p_base[1:v_half]); v_b := prediction.signal_median(p_base[v_half + 1:cardinality(p_base)]);
  RETURN jsonb_build_object('drifting', abs(v_b - v_a) > p_drift_mad * greatest(v_mad, 1e-9), 'first_half_median', round(v_a, 4), 'second_half_median', round(v_b, 4),
                            'mad', round(v_mad, 4), 'tolerance_mads', p_drift_mad);
END $$;

-- NOVELTY: dev = |median(window) − median(baseline)|; novelty = the share of baseline points whose own |x − median(baseline)| is below dev.
CREATE OR REPLACE FUNCTION prediction.signal_measure_novelty(p_points jsonb, p_as_of date, p_params jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path = prediction, pg_catalog, pg_temp AS $$
DECLARE s jsonb := prediction.signal_series_prepare(p_points, p_as_of, (p_params ->> 'window')::int, (p_params ->> 'baseline')::int, (p_params ->> 'min_baseline')::int, (p_params ->> 'max_gap_days')::int);
        v_obs numeric[]; v_base numeric[]; v_m numeric; v_mad numeric; v_om numeric; v_dev numeric; v_nov numeric; d jsonb;
BEGIN
  IF s ->> 'held' IS NOT NULL THEN RETURN jsonb_build_object('fired', false, 'measure', NULL, 'held', s ->> 'held', 'held_detail', s ->> 'held_detail', 'series', s - 'obs' - 'base'); END IF;
  v_obs := ARRAY(SELECT x::numeric FROM jsonb_array_elements_text(s -> 'obs') x); v_base := ARRAY(SELECT x::numeric FROM jsonb_array_elements_text(s -> 'base') x);
  d := prediction.signal_baseline_drift(v_base, (p_params ->> 'drift_mads')::numeric);
  IF (d ->> 'drifting')::boolean THEN
    RETURN jsonb_build_object('fired', false, 'measure', NULL, 'held', 'baseline_drift',
      'held_detail', format('the baseline''s halves have medians %s and %s — more than %s MADs (%s) apart; a deviation from a drifting baseline is the drift, not a novelty', d ->> 'first_half_median', d ->> 'second_half_median', d ->> 'tolerance_mads', d ->> 'mad'),
      'series', s - 'obs' - 'base', 'drift', d);
  END IF;
  v_m := prediction.signal_median(v_base);
  v_mad := prediction.signal_median(ARRAY(SELECT abs(x - v_m) FROM unnest(v_base) x));
  v_om := prediction.signal_median(v_obs);
  v_dev := abs(v_om - v_m);
  SELECT round(count(*) FILTER (WHERE abs(x - v_m) < v_dev)::numeric / count(*), 4) INTO v_nov FROM unnest(v_base) x;
  RETURN jsonb_build_object('fired', v_nov >= (p_params ->> 'fire_at')::numeric, 'measure', v_nov, 'held', NULL,
    'direction', CASE WHEN v_om < v_m THEN 'below' WHEN v_om > v_m THEN 'above' ELSE 'level' END,
    'observation', jsonb_build_object('from', s ->> 'obs_from', 'to', s ->> 'obs_to', 'points', s -> 'n_obs', 'median', round(v_om, 4), 'values', s -> 'obs'),
    'baseline', jsonb_build_object('from', s ->> 'base_from', 'to', s ->> 'base_to', 'points', s -> 'n_base', 'median', round(v_m, 4), 'mad', round(v_mad, 4)),
    'novelty_basis', jsonb_build_object('measure', v_nov, 'deviation', round(v_dev, 4), 'fire_at', (p_params ->> 'fire_at')::numeric,
      'rule', 'the share of the baseline''s own deviations from its median that the observed window''s median deviation exceeds', 'drift', d),
    'evidence', s -> 'evidence', 'series', s - 'obs' - 'base');
END $$;

-- ACCELERATION: the window's mean day-on-day change against the baseline's, in standard errors of the baseline's changes (robust scale).
CREATE OR REPLACE FUNCTION prediction.signal_measure_acceleration(p_points jsonb, p_as_of date, p_params jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path = prediction, pg_catalog, pg_temp AS $$
DECLARE s jsonb := prediction.signal_series_prepare(p_points, p_as_of, (p_params ->> 'window')::int, (p_params ->> 'baseline')::int, (p_params ->> 'min_baseline')::int, (p_params ->> 'max_gap_days')::int);
        v_obs numeric[]; v_base numeric[]; v_all numeric[]; v_dobs numeric[]; v_dbase numeric[]; v_m numeric; v_scale numeric; v_se numeric; v_z numeric; d jsonb; i int; v_nb int;
BEGIN
  IF s ->> 'held' IS NOT NULL THEN RETURN jsonb_build_object('fired', false, 'measure', NULL, 'held', s ->> 'held', 'held_detail', s ->> 'held_detail', 'series', s - 'obs' - 'base'); END IF;
  v_obs := ARRAY(SELECT x::numeric FROM jsonb_array_elements_text(s -> 'obs') x); v_base := ARRAY(SELECT x::numeric FROM jsonb_array_elements_text(s -> 'base') x);
  d := prediction.signal_baseline_drift(v_base, (p_params ->> 'drift_mads')::numeric);
  IF (d ->> 'drifting')::boolean THEN
    RETURN jsonb_build_object('fired', false, 'measure', NULL, 'held', 'baseline_drift',
      'held_detail', format('the baseline''s halves have medians %s and %s — more than %s MADs apart; an acceleration against a drifting baseline is not read', d ->> 'first_half_median', d ->> 'second_half_median', d ->> 'tolerance_mads'),
      'series', s - 'obs' - 'base', 'drift', d);
  END IF;
  v_all := v_base || v_obs; v_nb := cardinality(v_base);
  FOR i IN 2 .. cardinality(v_all) LOOP
    IF i <= v_nb THEN v_dbase := v_dbase || (v_all[i] - v_all[i - 1]); ELSE v_dobs := coalesce(v_dobs, '{}') || (v_all[i] - v_all[i - 1]); END IF;
  END LOOP;
  v_m := prediction.signal_median(v_dbase);
  v_scale := 1.4826 * prediction.signal_median(ARRAY(SELECT abs(x - v_m) FROM unnest(v_dbase) x));
  v_se := greatest(v_scale, 1e-9) / sqrt(cardinality(v_dobs));
  v_z := round(abs((SELECT avg(x) FROM unnest(v_dobs) x) - (SELECT avg(x) FROM unnest(v_dbase) x)) / v_se, 4);
  RETURN jsonb_build_object('fired', v_z >= (p_params ->> 'fire_at')::numeric, 'measure', v_z, 'held', NULL,
    'direction', CASE WHEN (SELECT avg(x) FROM unnest(v_dobs) x) < (SELECT avg(x) FROM unnest(v_dbase) x) THEN 'below' ELSE 'above' END,
    'observation', jsonb_build_object('from', s ->> 'obs_from', 'to', s ->> 'obs_to', 'points', s -> 'n_obs', 'mean_change', round((SELECT avg(x) FROM unnest(v_dobs) x), 4)),
    'baseline', jsonb_build_object('from', s ->> 'base_from', 'to', s ->> 'base_to', 'points', s -> 'n_base', 'mean_change', round((SELECT avg(x) FROM unnest(v_dbase) x), 4), 'robust_scale', round(v_scale, 4)),
    'novelty_basis', jsonb_build_object('measure', v_z, 'fire_at', (p_params ->> 'fire_at')::numeric,
      'rule', 'the observed window''s mean day-on-day change against the baseline''s, in standard errors of the baseline''s changes (1.4826 × MAD)'),
    'evidence', s -> 'evidence', 'series', s - 'obs' - 'base');
END $$;

-- CHANGE POINT: over the last p_span points, the largest |mean(left) − mean(right)| / (pooled sd · √(1/nL + 1/nR)) over the splits leaving
-- p_min_segment on each side; it fires when the statistic reaches fire_at AND the split lies within the last `recent` points.
CREATE OR REPLACE FUNCTION prediction.signal_measure_change_point(p_points jsonb, p_as_of date, p_params jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path = prediction, pg_catalog, pg_temp AS $$
DECLARE v_span int := (p_params ->> 'span')::int; v_seg int := (p_params ->> 'min_segment')::int;
        s jsonb := prediction.signal_series_prepare(p_points, p_as_of, (p_params ->> 'span')::int, 0, 0, (p_params ->> 'max_gap_days')::int);
        v numeric[]; n int; k int; v_best numeric := 0; v_at int; l numeric[]; r numeric[]; v_sp numeric; v_t numeric; v_pts jsonb; v_split_day text; v_ml numeric; v_mr numeric;
BEGIN
  IF s ->> 'held' IS NOT NULL THEN RETURN jsonb_build_object('fired', false, 'measure', NULL, 'held', s ->> 'held', 'held_detail', s ->> 'held_detail', 'series', s - 'obs' - 'base'); END IF;
  v := ARRAY(SELECT x::numeric FROM jsonb_array_elements_text(s -> 'obs') x); n := cardinality(v);
  IF n < 2 * v_seg THEN
    RETURN jsonb_build_object('fired', false, 'measure', NULL, 'held', 'insufficient_evidence', 'held_detail', format('%s point(s) up to %s; a change point needs %s', n, p_as_of, 2 * v_seg), 'series', s - 'obs' - 'base');
  END IF;
  FOR k IN v_seg .. n - v_seg LOOP
    l := v[1:k]; r := v[k + 1:n];
    v_sp := sqrt(((SELECT coalesce(sum((x - (SELECT avg(y) FROM unnest(l) y))^2), 0) FROM unnest(l) x) + (SELECT coalesce(sum((x - (SELECT avg(y) FROM unnest(r) y))^2), 0) FROM unnest(r) x)) / greatest(n - 2, 1));
    v_t := abs((SELECT avg(x) FROM unnest(l) x) - (SELECT avg(x) FROM unnest(r) x)) / (greatest(v_sp, 1e-9) * sqrt(1.0 / k + 1.0 / (n - k)));
    IF v_t > v_best THEN v_best := v_t; v_at := k; v_ml := (SELECT avg(x) FROM unnest(l) x); v_mr := (SELECT avg(x) FROM unnest(r) x); END IF;
  END LOOP;
  v_best := round(v_best, 4);
  SELECT p ->> 'd' INTO v_split_day FROM (SELECT p, row_number() OVER (ORDER BY (p ->> 'd')::date) rn FROM jsonb_array_elements(p_points) p
                                            WHERE (p ->> 'd') ~ '^\d{4}-\d{2}-\d{2}$' AND (p ->> 'd')::date <= p_as_of AND (p ->> 'd')::date >= (s ->> 'obs_from')::date) z WHERE rn = v_at + 1;
  RETURN jsonb_build_object('fired', v_best >= (p_params ->> 'fire_at')::numeric AND n - v_at <= (p_params ->> 'recent')::int, 'measure', v_best, 'held', NULL,
    'direction', CASE WHEN v_mr < v_ml THEN 'below' ELSE 'above' END,
    'observation', jsonb_build_object('from', v_split_day, 'to', s ->> 'obs_to', 'points', n - v_at, 'mean', round(v_mr, 4)),
    'baseline', jsonb_build_object('from', s ->> 'obs_from', 'to', v_split_day, 'points', v_at, 'mean', round(v_ml, 4)),
    'novelty_basis', jsonb_build_object('measure', v_best, 'fire_at', (p_params ->> 'fire_at')::numeric, 'split_day', v_split_day, 'points_after_split', n - v_at, 'recent', (p_params ->> 'recent')::int,
      'rule', 'the largest two-sample mean-shift statistic over the recent span; the shift must begin within the recent points'),
    'evidence', s -> 'evidence', 'series', s - 'obs' - 'base');
END $$;

-- RELATIONSHIP CHANGE (graph edges, world time): the entity's relationships that began (valid_from) or ended (valid_to) in the recent
-- window against each of the baseline windows before it. measure = the share of baseline windows with fewer changes.
CREATE OR REPLACE FUNCTION prediction.signal_measure_relationship_change(p_tenant uuid, p_domain uuid, p_entity uuid, p_as_of date, p_params jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = prediction, graph, pg_catalog, pg_temp AS $$
DECLARE v_w int := (p_params ->> 'window_days')::int; v_k int := (p_params ->> 'baseline_windows')::int; v_known int; v_recent int; v_counts int[] := '{}'; i int; c int; v_measure numeric; v_ev jsonb;
BEGIN
  SELECT count(*) INTO v_known FROM graph.edges_current e WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain AND p_entity IN (e.subject_entity_id, e.object_entity_id) AND e.valid_from::date <= p_as_of;
  IF v_known < (p_params ->> 'min_edges')::int THEN
    RETURN jsonb_build_object('fired', false, 'measure', NULL, 'held', 'insufficient_evidence', 'held_detail', format('%s relationship(s) of the entity known up to %s; the detector needs %s', v_known, p_as_of, p_params ->> 'min_edges'));
  END IF;
  FOR i IN 0 .. v_k LOOP
    SELECT count(*) INTO c FROM graph.edges_current e WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain AND p_entity IN (e.subject_entity_id, e.object_entity_id)
       AND ((e.valid_from::date > p_as_of - (i + 1) * v_w AND e.valid_from::date <= p_as_of - i * v_w)
         OR (e.valid_to IS NOT NULL AND e.valid_to::date > p_as_of - (i + 1) * v_w AND e.valid_to::date <= p_as_of - i * v_w));
    IF i = 0 THEN v_recent := c; ELSE v_counts := v_counts || c; END IF;
  END LOOP;
  SELECT round(count(*) FILTER (WHERE x < v_recent)::numeric / greatest(count(*), 1), 4) INTO v_measure FROM unnest(v_counts) x;
  SELECT coalesce(jsonb_agg(DISTINCT jsonb_build_object('object_id', e.evidence_object_id, 'version', NULL)), '[]'::jsonb) INTO v_ev FROM graph.edges_current e
   WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain AND p_entity IN (e.subject_entity_id, e.object_entity_id) AND e.valid_from::date > p_as_of - v_w AND e.valid_from::date <= p_as_of;
  RETURN jsonb_build_object('fired', v_measure = 1 AND v_recent >= (p_params ->> 'min_changes')::int, 'measure', v_measure, 'held', NULL, 'direction', 'above',
    'observation', jsonb_build_object('from', p_as_of - v_w + 1, 'to', p_as_of, 'changes', v_recent),
    'baseline', jsonb_build_object('from', p_as_of - (v_k + 1) * v_w + 1, 'to', p_as_of - v_w, 'windows', v_k, 'window_days', v_w, 'changes_per_window', to_jsonb(v_counts)),
    'novelty_basis', jsonb_build_object('measure', v_measure, 'min_changes', (p_params ->> 'min_changes')::int,
      'rule', 'the relationships that began or ended in the recent window, against every baseline window: fires when it exceeds all of them and reaches the minimum'),
    'evidence', v_ev);
END $$;
REVOKE ALL ON FUNCTION prediction.signal_measure_relationship_change(uuid,uuid,uuid,date,jsonb) FROM PUBLIC;

-- The source of an evidence object (EVD provenance `SRC:<id>@<version>`, or a claim's lineage evidence) with the contract's publisher,
-- origin and declared upstream; NULL when the object is not in this domain.
CREATE OR REPLACE FUNCTION prediction.signal_resolve_object(p_tenant uuid, p_domain uuid, p_object_id uuid, p_version int) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = prediction, objects, intelligence, observation, pg_catalog, pg_temp AS $$
DECLARE o record; v_evd record; v_src uuid; v_srcver int; c record; v_digest text; v_type text;
BEGIN
  SELECT x.object_type, x.object_id, x.object_version, x.provenance_ref, x.payload, x.synthetic_state, x.classification, x.lifecycle_state INTO o
    FROM objects.canonical_objects x WHERE x.object_id = p_object_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.object_type IN ('EVD', 'CLM')
     AND (p_version IS NULL OR x.object_version = p_version) ORDER BY x.object_version DESC LIMIT 1;
  IF o.object_id IS NULL THEN RETURN NULL; END IF;
  v_type := o.object_type;
  IF o.object_type = 'EVD' THEN
    v_evd := o; v_digest := o.payload ->> 'content_digest';
  ELSE
    SELECT l.evidence_object_id, l.evidence_digest INTO c FROM intelligence.claim_lineage l WHERE l.claim_object_id = o.object_id AND l.claim_version = o.object_version;
    v_digest := c.evidence_digest;
    SELECT x.object_type, x.object_id, x.object_version, x.provenance_ref, x.payload, x.synthetic_state, x.classification, x.lifecycle_state INTO v_evd
      FROM objects.canonical_objects x WHERE x.object_id = c.evidence_object_id AND x.object_type = 'EVD' AND x.tenant_id = p_tenant AND x.domain_id = p_domain ORDER BY x.object_version DESC LIMIT 1;
  END IF;
  IF v_evd.provenance_ref ~ '^SRC:[0-9a-f-]{36}@[0-9]+' THEN
    v_src := substring(v_evd.provenance_ref FROM '^SRC:([0-9a-f-]{36})@')::uuid; v_srcver := substring(v_evd.provenance_ref FROM '^SRC:[0-9a-f-]{36}@([0-9]+)')::int;
  END IF;
  SELECT s.source_key, s.publisher, s.data_origin, s.authority_class, coalesce(s.contract ->> 'upstream', s.contract #>> '{identity,upstream}') AS upstream INTO c
    FROM observation.source_contracts_current s WHERE s.source_id = v_src AND s.tenant_id = p_tenant AND s.domain_id = p_domain
   ORDER BY (s.contract_version = v_srcver) DESC, s.contract_version DESC LIMIT 1;
  RETURN jsonb_build_object('object_type', v_type, 'object_id', o.object_id, 'object_version', o.object_version, 'lifecycle_state', o.lifecycle_state, 'classification', o.classification,
    'source_id', v_src, 'source_key', c.source_key, 'publisher', nullif(btrim(coalesce(c.publisher, '')), ''), 'data_origin', c.data_origin, 'authority_class', c.authority_class,
    'upstream', nullif(btrim(coalesce(c.upstream, '')), ''), 'content_digest', v_digest,
    'synthetic', coalesce(o.synthetic_state, false) OR coalesce(v_evd.synthetic_state, false) OR c.data_origin = 'synthetic');
END $$;
REVOKE ALL ON FUNCTION prediction.signal_resolve_object(uuid,uuid,uuid,int) FROM PUBLIC;

-- DIFFUSION (edge sources, world time): the distinct REAL sources whose evidence the entity's relationships that began in the recent window
-- cite, against each baseline window. A recent window whose only sources are synthetic is HELD (synthetic_only).
CREATE OR REPLACE FUNCTION prediction.signal_measure_diffusion(p_tenant uuid, p_domain uuid, p_entity uuid, p_as_of date, p_params jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = prediction, graph, pg_catalog, pg_temp AS $$
DECLARE v_w int := (p_params ->> 'window_days')::int; v_k int := (p_params ->> 'baseline_windows')::int; v_known int; v_recent int; v_synth int; v_counts int[] := '{}'; i int; c int; v_measure numeric;
        v_sources jsonb; v_ev jsonb;
BEGIN
  SELECT count(*) INTO v_known FROM graph.edges_current e WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain AND p_entity IN (e.subject_entity_id, e.object_entity_id) AND e.valid_from::date <= p_as_of;
  IF v_known < (p_params ->> 'min_edges')::int THEN
    RETURN jsonb_build_object('fired', false, 'measure', NULL, 'held', 'insufficient_evidence', 'held_detail', format('%s relationship(s) of the entity known up to %s; the detector needs %s', v_known, p_as_of, p_params ->> 'min_edges'));
  END IF;
  FOR i IN 0 .. v_k LOOP
    WITH src AS (
      SELECT DISTINCT r ->> 'source_id' AS source_id, (r ->> 'synthetic')::boolean AS synthetic
        FROM graph.edges_current e, LATERAL (SELECT prediction.signal_resolve_object(p_tenant, p_domain, e.evidence_object_id, NULL) AS r) z
       WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain AND p_entity IN (e.subject_entity_id, e.object_entity_id)
         AND e.valid_from::date > p_as_of - (i + 1) * v_w AND e.valid_from::date <= p_as_of - i * v_w AND r IS NOT NULL AND r ->> 'source_id' IS NOT NULL)
    SELECT count(DISTINCT source_id) FILTER (WHERE NOT synthetic), count(DISTINCT source_id) FILTER (WHERE synthetic),
           CASE WHEN i = 0 THEN coalesce(jsonb_agg(DISTINCT jsonb_build_object('source_id', source_id, 'synthetic', synthetic)), '[]'::jsonb) END
      INTO c, v_synth, v_sources FROM src;
    IF i = 0 THEN
      v_recent := c;
      IF c = 0 AND v_synth > 0 THEN
        RETURN jsonb_build_object('fired', false, 'measure', NULL, 'held', 'synthetic_only',
          'held_detail', format('the recent window''s %s source(s) are all synthetic: synthetic sources diffuse nothing', v_synth), 'sources', v_sources);
      END IF;
    ELSE v_counts := v_counts || c; END IF;
  END LOOP;
  SELECT round(count(*) FILTER (WHERE x < v_recent)::numeric / greatest(count(*), 1), 4) INTO v_measure FROM unnest(v_counts) x;
  SELECT coalesce(jsonb_agg(DISTINCT jsonb_build_object('object_id', e.evidence_object_id, 'version', NULL)), '[]'::jsonb) INTO v_ev FROM graph.edges_current e
   WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain AND p_entity IN (e.subject_entity_id, e.object_entity_id) AND e.valid_from::date > p_as_of - v_w AND e.valid_from::date <= p_as_of;
  RETURN jsonb_build_object('fired', v_recent >= (p_params ->> 'min_sources')::int AND v_recent > coalesce((SELECT max(x) FROM unnest(v_counts) x), 0), 'measure', v_measure, 'held', NULL, 'direction', 'above',
    'observation', jsonb_build_object('from', p_as_of - v_w + 1, 'to', p_as_of, 'real_sources', v_recent, 'sources', v_sources),
    'baseline', jsonb_build_object('from', p_as_of - (v_k + 1) * v_w + 1, 'to', p_as_of - v_w, 'windows', v_k, 'window_days', v_w, 'real_sources_per_window', to_jsonb(v_counts)),
    'novelty_basis', jsonb_build_object('measure', v_measure, 'min_sources', (p_params ->> 'min_sources')::int,
      'rule', 'the distinct real sources the entity''s new relationships cite in the recent window, against every baseline window: fires on more sources than any baseline window, at least the minimum'),
    'evidence', v_ev);
END $$;
REVOKE ALL ON FUNCTION prediction.signal_measure_diffusion(uuid,uuid,uuid,date,jsonb) FROM PUBLIC;

-- THE REGISTRY (code, not tenant data): one row per detector version; the digest is sha256 over the definitions of the functions that
-- compute it (the preparation and the measure) — a changed function is a new version. Append-only.
CREATE TABLE prediction.signal_detectors (
  detector_key     text NOT NULL CHECK (detector_key IN ('novelty', 'acceleration', 'change_point', 'relationship_change', 'diffusion', 'cross_domain_convergence')),
  detector_version text NOT NULL CHECK (detector_version ~ '^[0-9]+\.[0-9]+\.[0-9]+$'),
  model_class      text NOT NULL DEFAULT 'weak_signal_anomaly' CHECK (model_class = 'weak_signal_anomaly'),
  input_kind       text NOT NULL CHECK (input_kind IN ('indicator_series', 'graph_edges', 'edge_sources', 'cross_domain')),
  function_ref     text,
  code_digest      text CHECK (code_digest IS NULL OR code_digest ~ '^[0-9a-f]{64}$'),
  status           text NOT NULL CHECK (status IN ('available', 'absent')),
  absent_reason    text,
  method           text NOT NULL CHECK (length(btrim(method)) >= 12),
  params           jsonb NOT NULL CHECK (jsonb_typeof(params) = 'object'),
  registered_at    timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (detector_key, detector_version),
  CONSTRAINT psd_available CHECK ((status = 'available') = (function_ref IS NOT NULL AND code_digest IS NOT NULL)),
  CONSTRAINT psd_absent CHECK (status = 'available' OR length(btrim(coalesce(absent_reason, ''))) >= 12)
);
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON prediction.signal_detectors FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE prediction.signal_detectors IS 'B28 (0088 §S1; F-P4-10, MC-014): the weak-signal detectors — available with their function and code digest, or ABSENT with the reason; a global registry of code, append-only';
REVOKE ALL ON prediction.signal_detectors FROM PUBLIC;
GRANT SELECT ON prediction.signal_detectors TO eye_app, eye_commit;

CREATE OR REPLACE FUNCTION prediction.signal_code_digest(p_functions text[]) RETURNS text
LANGUAGE sql STABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT encode(sha256(convert_to(string_agg(pg_get_functiondef(f::regprocedure), E'\n' ORDER BY ord), 'UTF8')), 'hex')
    FROM unnest(p_functions) WITH ORDINALITY AS t(f, ord)
$$;

INSERT INTO prediction.signal_detectors (detector_key, detector_version, input_kind, function_ref, code_digest, status, absent_reason, method, params)
SELECT k, '1.0.0', ik, fref, CASE WHEN fns IS NULL THEN NULL ELSE prediction.signal_code_digest(fns) END, CASE WHEN fns IS NULL THEN 'absent' ELSE 'available' END, why, method, params::jsonb
  FROM (VALUES
    ('novelty', 'indicator_series', 'prediction.signal_measure_novelty(jsonb,date,jsonb)',
     ARRAY['prediction.signal_series_prepare(jsonb,date,int,int,int,int)', 'prediction.signal_baseline_drift(numeric[],numeric)', 'prediction.signal_measure_novelty(jsonb,date,jsonb)'], NULL,
     'the observed window''s median deviation from the baseline median, as the share of the baseline''s own deviations it exceeds',
     '{"window": 5, "baseline": 60, "min_baseline": 30, "max_gap_days": 5, "drift_mads": 1.5, "fire_at": 0.95}'),
    ('acceleration', 'indicator_series', 'prediction.signal_measure_acceleration(jsonb,date,jsonb)',
     ARRAY['prediction.signal_series_prepare(jsonb,date,int,int,int,int)', 'prediction.signal_baseline_drift(numeric[],numeric)', 'prediction.signal_measure_acceleration(jsonb,date,jsonb)'], NULL,
     'the observed window''s mean day-on-day change against the baseline''s, in standard errors of the baseline''s own changes',
     '{"window": 5, "baseline": 60, "min_baseline": 30, "max_gap_days": 5, "drift_mads": 1.5, "fire_at": 3}'),
    ('change_point', 'indicator_series', 'prediction.signal_measure_change_point(jsonb,date,jsonb)',
     ARRAY['prediction.signal_series_prepare(jsonb,date,int,int,int,int)', 'prediction.signal_measure_change_point(jsonb,date,jsonb)'], NULL,
     'the largest two-sample mean-shift statistic over the recent span, the shift beginning within the recent points',
     '{"span": 30, "min_segment": 5, "recent": 10, "max_gap_days": 5, "fire_at": 4}'),
    ('relationship_change', 'graph_edges', 'prediction.signal_measure_relationship_change(uuid,uuid,uuid,date,jsonb)',
     ARRAY['prediction.signal_measure_relationship_change(uuid,uuid,uuid,date,jsonb)'], NULL,
     'the entity''s relationships that began or ended (world time) in the recent window against every baseline window',
     '{"window_days": 7, "baseline_windows": 8, "min_edges": 3, "min_changes": 3}'),
    ('diffusion', 'edge_sources', 'prediction.signal_measure_diffusion(uuid,uuid,uuid,date,jsonb)',
     ARRAY['prediction.signal_resolve_object(uuid,uuid,uuid,int)', 'prediction.signal_measure_diffusion(uuid,uuid,uuid,date,jsonb)'], NULL,
     'the distinct real sources the entity''s new relationships cite in the recent window, against every baseline window',
     '{"window_days": 7, "baseline_windows": 8, "min_edges": 3, "min_sources": 2}'),
    ('cross_domain_convergence', 'cross_domain', NULL, NULL,
     'a convergence across domains needs a cross-domain read: every table this product holds is isolated per domain under row-level security (tenant_id = eye_tenant() and domain_id = eye_domain()) and no port reads across domains, so no detector can see a second domain''s changes without breaking that isolation',
     'the same change appearing in two or more domains of a tenant within one window', '{}')
  ) AS t(k, ik, fref, fns, why, method, params);

-- Every prediction table is under FORCE row-level security (phase4-acceptance D8): the registry is CODE, the same for every tenant, so its
-- one policy reads every row; nothing but a migration writes it (append-only; no port, no grant).
ALTER TABLE prediction.signal_detectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE prediction.signal_detectors FORCE ROW LEVEL SECURITY;
CREATE POLICY prediction_registry_read ON prediction.signal_detectors FOR SELECT USING (true);

GRANT EXECUTE ON FUNCTION prediction.signal_code_digest(text[]) TO eye_app, eye_commit;
GRANT EXECUTE ON FUNCTION prediction.signal_median(numeric[]) TO eye_app, eye_commit;
GRANT EXECUTE ON FUNCTION prediction.signal_series_prepare(jsonb,date,int,int,int,int) TO eye_app, eye_commit;
GRANT EXECUTE ON FUNCTION prediction.signal_baseline_drift(numeric[],numeric) TO eye_app, eye_commit;
GRANT EXECUTE ON FUNCTION prediction.signal_measure_novelty(jsonb,date,jsonb) TO eye_app, eye_commit;
GRANT EXECUTE ON FUNCTION prediction.signal_measure_acceleration(jsonb,date,jsonb) TO eye_app, eye_commit;
GRANT EXECUTE ON FUNCTION prediction.signal_measure_change_point(jsonb,date,jsonb) TO eye_app, eye_commit;

-- ============================================================
-- §S2 THE LEDGERS
-- ============================================================
-- Every detector reading — fired or not, held or not — once per detector version × subject × as-of day (a rescan answers `repeated`).
CREATE TABLE prediction.signal_detections (
  detection_id     uuid PRIMARY KEY,
  scope            text NOT NULL,
  tenant_id        uuid NOT NULL,
  domain_id        uuid NOT NULL,
  detector_key     text NOT NULL,
  detector_version text NOT NULL,
  code_digest      text NOT NULL CHECK (code_digest ~ '^[0-9a-f]{64}$'),
  subject_kind     text NOT NULL CHECK (subject_kind IN ('indicator', 'entity')),
  subject_id       uuid NOT NULL,
  as_of            date NOT NULL,
  measure          numeric,
  fired            boolean NOT NULL,
  held_reason      text CHECK (held_reason IS NULL OR held_reason IN ('insufficient_evidence', 'source_gap', 'baseline_drift', 'synthetic_only')),
  reading          jsonb NOT NULL CHECK (jsonb_typeof(reading) = 'object'),
  trigger          text NOT NULL CHECK (trigger IN ('agent', 'operator')),
  run_id           uuid,
  actor_principal_id uuid NOT NULL,
  recorded_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id   uuid NOT NULL,
  CONSTRAINT psdet_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT psdet_once UNIQUE (tenant_id, domain_id, detector_key, detector_version, subject_id, as_of),
  CONSTRAINT psdet_held CHECK (held_reason IS NULL OR NOT fired),
  CONSTRAINT psdet_detector FOREIGN KEY (detector_key, detector_version) REFERENCES prediction.signal_detectors (detector_key, detector_version)
);
CREATE INDEX psdet_subject ON prediction.signal_detections (tenant_id, domain_id, subject_id, detector_key, as_of DESC);
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON prediction.signal_detections FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE prediction.signal_detections IS 'B28 (0088 §S2; F-P4-10, PR-25-005): every weak-signal detector reading — the measure, fired, or HELD with its reason (insufficient evidence, a source gap, a drifting baseline, synthetic only); append-only';

-- THE WEAK-SIGNAL OBJECT (V02-T-157/-158, AI-57-001, PR-25-002): versioned — every change a new version with its event.
CREATE TABLE prediction.signals_current (
  signal_id        uuid PRIMARY KEY,
  scope            text NOT NULL,
  tenant_id        uuid NOT NULL,
  domain_id        uuid NOT NULL,
  version          int NOT NULL DEFAULT 1 CHECK (version >= 1),
  title            text NOT NULL CHECK (length(btrim(title)) BETWEEN 3 AND 300),
  statement        text NOT NULL CHECK (length(btrim(statement)) BETWEEN 8 AND 4000),
  subject_kind     text NOT NULL CHECK (subject_kind IN ('indicator', 'entity', 'none')),
  subject_id       uuid,
  nominator_kind   text NOT NULL CHECK (nominator_kind IN ('detector', 'analyst', 'agent')),
  nominated_by     uuid NOT NULL,
  nominated_run_id uuid,
  detection_id     uuid UNIQUE,
  detector_key     text,
  detector_version text,
  detector_digest  text,
  as_of            date,
  observation      jsonb NOT NULL CHECK (jsonb_typeof(observation) = 'object'),
  baseline         jsonb NOT NULL CHECK (jsonb_typeof(baseline) = 'object'),
  novelty_basis    jsonb NOT NULL CHECK (jsonb_typeof(novelty_basis) = 'object'),
  novelty          numeric CHECK (novelty IS NULL OR (novelty >= 0 AND novelty <= 1)),
  measure          numeric,
  confidence       numeric CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  maturity         text NOT NULL DEFAULT 'tentative' CHECK (maturity IN ('tentative', 'corroborated', 'invalid')),
  corroboration_threshold int NOT NULL DEFAULT 2 CHECK (corroboration_threshold BETWEEN 2 AND 10),
  independent_sources int NOT NULL DEFAULT 0 CHECK (independent_sources >= 0),
  contradicting_sources int NOT NULL DEFAULT 0 CHECK (contradicting_sources >= 0),
  disposition      text CHECK (disposition IS NULL OR disposition IN ('confirm', 'monitor', 'dismiss', 'escalate')),
  disposition_by   uuid,
  disposition_at   timestamptz,
  disposition_note text,
  strengthen_conditions jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(strengthen_conditions) = 'array'),
  falsify_conditions    jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(falsify_conditions) = 'array'),
  review_by        timestamptz,
  classification   text NOT NULL DEFAULT 'internal' CHECK (classification IN ('public', 'internal', 'confidential', 'restricted')),
  synthetic_state  boolean NOT NULL DEFAULT false,
  candidate_id     uuid,
  created_at       timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at       timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id   uuid NOT NULL,
  CONSTRAINT psig_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT psig_nominator CHECK ((nominator_kind = 'analyst') = (detection_id IS NULL)),
  CONSTRAINT psig_detector CHECK (nominator_kind = 'analyst' OR (detector_key IS NOT NULL AND detector_version IS NOT NULL AND detector_digest IS NOT NULL AND as_of IS NOT NULL)),
  CONSTRAINT psig_subject CHECK ((subject_kind = 'none') = (subject_id IS NULL)),
  CONSTRAINT psig_disposition CHECK ((disposition IS NULL) = (disposition_by IS NULL) AND (disposition IS NULL) = (disposition_at IS NULL)),
  CONSTRAINT psig_escalated CHECK (disposition IS DISTINCT FROM 'escalate' OR candidate_id IS NOT NULL),
  CONSTRAINT psig_monitor CHECK (disposition IS DISTINCT FROM 'monitor' OR jsonb_array_length(falsify_conditions) > 0)
);
CREATE INDEX psig_domain ON prediction.signals_current (tenant_id, domain_id, maturity, updated_at DESC);
COMMENT ON TABLE prediction.signals_current IS 'B28 (0088 §S2; V02-T-157/-158, AI-57-001): the weak signal — observation, baseline, novelty basis, corroboration (independent sources), strengthen/falsify conditions, the maturity changed only by corroboration, a named human''s disposition; versioned';

CREATE TABLE prediction.signal_events (
  event_id         uuid PRIMARY KEY,
  scope            text NOT NULL,
  tenant_id        uuid NOT NULL,
  domain_id        uuid NOT NULL,
  signal_id        uuid NOT NULL REFERENCES prediction.signals_current (signal_id),
  signal_version   int NOT NULL CHECK (signal_version >= 1),
  event            text NOT NULL CHECK (event IN ('signal.nominated', 'signal.evidence_added', 'signal.independence_tested', 'signal.corroborated',
                                                  'signal.disposition', 'signal.conditions_set', 'signal.escalated')),
  actor_principal_id uuid NOT NULL,
  details          jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
  occurred_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id   uuid NOT NULL,
  CONSTRAINT psev_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX psev_signal ON prediction.signal_events (signal_id, occurred_at);
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON prediction.signal_events FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

-- The evidence of a signal: what it is, where it came from, its stance and the independence verdict recorded when it was added.
CREATE TABLE prediction.signal_evidence (
  evidence_id      uuid PRIMARY KEY,
  scope            text NOT NULL,
  tenant_id        uuid NOT NULL,
  domain_id        uuid NOT NULL,
  -- DEFERRABLE: a nomination records its basis rows before the signal row that carries their counts (one transaction)
  signal_id        uuid NOT NULL REFERENCES prediction.signals_current (signal_id) DEFERRABLE INITIALLY DEFERRED,
  added_in_version int NOT NULL CHECK (added_in_version >= 1),
  object_type      text NOT NULL CHECK (object_type IN ('EVD', 'CLM')),
  object_id        uuid NOT NULL,
  object_version   int NOT NULL CHECK (object_version >= 1),
  source_id        uuid,
  source_key       text,
  publisher        text,
  data_origin      text,
  upstream         text,
  content_digest   text,
  synthetic        boolean NOT NULL,
  stance           text NOT NULL CHECK (stance IN ('supporting', 'contradicting')),
  role             text NOT NULL CHECK (role IN ('basis', 'corroboration')),
  independence     text NOT NULL CHECK (independence IN ('independent', 'dependent', 'unknown')),
  independence_reasons jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(independence_reasons) = 'array'),
  added_by         uuid NOT NULL,
  added_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id   uuid NOT NULL,
  CONSTRAINT psevd_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT psevd_once UNIQUE (signal_id, object_id, object_version)
);
CREATE INDEX psevd_signal ON prediction.signal_evidence (signal_id, added_at);
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON prediction.signal_evidence FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

-- Every ranking act (the agent's or an analyst's): the order, each place's key and its explanation. No weighted score.
CREATE TABLE prediction.signal_rankings (
  ranking_id       uuid PRIMARY KEY,
  scope            text NOT NULL,
  tenant_id        uuid NOT NULL,
  domain_id        uuid NOT NULL,
  ranked_by        uuid NOT NULL,
  ranker_kind      text NOT NULL CHECK (ranker_kind IN ('agent', 'analyst')),
  run_id           uuid,
  ordering         jsonb NOT NULL CHECK (jsonb_typeof(ordering) = 'array'),
  rule             text NOT NULL,
  ranked_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id   uuid NOT NULL,
  CONSTRAINT psrank_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX psrank_domain ON prediction.signal_rankings (tenant_id, domain_id, ranked_at DESC);
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON prediction.signal_rankings FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

-- ============================================================
-- §S3 THE MATURITY GATE — changed only by corroboration (V02-T-158)
-- ============================================================
CREATE OR REPLACE FUNCTION prediction.signal_maturity_gate() RETURNS trigger
LANGUAGE plpgsql SET search_path = prediction, pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.maturity <> 'tentative' OR NEW.version <> 1 THEN
      RAISE EXCEPTION 'signal rejected (maturity_gate): a signal is nominated tentative at version 1; its maturity changes only by corroboration' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'signal rejected: a signal is never deleted — it is dismissed or found invalid, and kept' USING ERRCODE = '23514'; END IF;
  IF NEW.version <> OLD.version + 1 THEN
    RAISE EXCEPTION 'signal rejected (maturity_gate): every change of signal % is the next version (% → %)', OLD.signal_id, OLD.version, NEW.version USING ERRCODE = '23514';
  END IF;
  IF NEW.maturity IS DISTINCT FROM OLD.maturity THEN
    IF NEW.disposition IS DISTINCT FROM OLD.disposition THEN
      RAISE EXCEPTION 'signal rejected (maturity_gate): a disposition never changes the maturity of signal %', OLD.signal_id USING ERRCODE = '23514';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM prediction.signal_events e JOIN prediction.signal_evidence x ON x.evidence_id::text = e.details ->> 'evidence_id'
                    WHERE e.signal_id = NEW.signal_id AND e.event = 'signal.corroborated' AND e.signal_version = NEW.version AND e.details ->> 'to' = NEW.maturity
                      AND x.signal_id = NEW.signal_id AND x.added_in_version = NEW.version AND x.independence = 'independent') THEN
      RAISE EXCEPTION 'signal rejected (maturity_gate): the maturity of signal % changes only by a signal.corroborated event of version % naming an independent evidence row added in it', OLD.signal_id, NEW.version USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER maturity_gate BEFORE INSERT OR UPDATE OR DELETE ON prediction.signals_current FOR EACH ROW EXECUTE FUNCTION prediction.signal_maturity_gate();

-- ============================================================
-- §S4 SOURCE INDEPENDENCE
-- ============================================================
-- Two resolved evidence items (prediction.signal_resolve_object's shape): independent | dependent | unknown, with the reasons.
CREATE OR REPLACE FUNCTION prediction.signal_pair_verdict(a jsonb, b jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
DECLARE v_dep jsonb := '[]'::jsonb; v_unk jsonb := '[]'::jsonb;
BEGIN
  IF coalesce((a ->> 'synthetic')::boolean, true) THEN v_unk := v_unk || to_jsonb(format('%s@%s is synthetic: synthetic evidence corroborates nothing', a ->> 'object_id', a ->> 'object_version')); END IF;
  IF coalesce((b ->> 'synthetic')::boolean, true) THEN v_unk := v_unk || to_jsonb(format('%s@%s is synthetic: synthetic evidence corroborates nothing', b ->> 'object_id', b ->> 'object_version')); END IF;
  IF a ->> 'source_id' IS NULL OR a ->> 'publisher' IS NULL THEN v_unk := v_unk || to_jsonb(format('the source or publisher of %s@%s cannot be established from the records', a ->> 'object_id', a ->> 'object_version')); END IF;
  IF b ->> 'source_id' IS NULL OR b ->> 'publisher' IS NULL THEN v_unk := v_unk || to_jsonb(format('the source or publisher of %s@%s cannot be established from the records', b ->> 'object_id', b ->> 'object_version')); END IF;
  IF a ->> 'source_id' IS NOT NULL AND a ->> 'source_id' = b ->> 'source_id' THEN v_dep := v_dep || to_jsonb(format('the same source %s', a ->> 'source_key')); END IF;
  IF a ->> 'publisher' IS NOT NULL AND lower(btrim(a ->> 'publisher')) = lower(btrim(b ->> 'publisher')) THEN v_dep := v_dep || to_jsonb(format('the same publisher %s', a ->> 'publisher')); END IF;
  IF a ->> 'content_digest' IS NOT NULL AND a ->> 'content_digest' = b ->> 'content_digest' THEN v_dep := v_dep || to_jsonb('the same evidence digest (the same bytes)'::text); END IF;
  IF a ->> 'upstream' IS NOT NULL AND lower(a ->> 'upstream') = lower(coalesce(b ->> 'upstream', '')) THEN v_dep := v_dep || to_jsonb(format('a shared declared upstream %s', a ->> 'upstream')); END IF;
  IF jsonb_array_length(v_dep) > 0 THEN RETURN jsonb_build_object('verdict', 'dependent', 'reasons', v_dep || v_unk); END IF;
  IF jsonb_array_length(v_unk) > 0 THEN RETURN jsonb_build_object('verdict', 'unknown', 'reasons', v_unk); END IF;
  RETURN jsonb_build_object('verdict', 'independent', 'reasons', jsonb_build_array(format('different sources (%s, %s), publishers (%s, %s) and evidence digests; neither synthetic',
    a ->> 'source_key', b ->> 'source_key', a ->> 'publisher', b ->> 'publisher')));
END $$;
GRANT EXECUTE ON FUNCTION prediction.signal_pair_verdict(jsonb, jsonb) TO eye_app, eye_commit;

-- A new item against the signal's COUNTED rows of its stance: dependent on any, else unknown on any, else independent. The first counted
-- item of a stance (nothing to compare with) is independent when its own source is established and it is not synthetic.
CREATE OR REPLACE FUNCTION prediction.signal_item_verdict(p_signal uuid, p_item jsonb, p_stance text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = prediction, pg_catalog, pg_temp AS $$
DECLARE x prediction.signal_evidence%ROWTYPE; v jsonb; v_dep jsonb := '[]'::jsonb; v_unk jsonb := '[]'::jsonb; v_n int := 0;
BEGIN
  FOR x IN SELECT * FROM prediction.signal_evidence e WHERE e.signal_id = p_signal AND e.stance = p_stance AND e.independence = 'independent' ORDER BY e.added_at LOOP
    v_n := v_n + 1;
    v := prediction.signal_pair_verdict(p_item, jsonb_build_object('object_id', x.object_id, 'object_version', x.object_version, 'source_id', x.source_id, 'source_key', x.source_key,
           'publisher', x.publisher, 'upstream', x.upstream, 'content_digest', x.content_digest, 'synthetic', x.synthetic));
    IF v ->> 'verdict' = 'dependent' THEN v_dep := v_dep || (v -> 'reasons'); ELSIF v ->> 'verdict' = 'unknown' THEN v_unk := v_unk || (v -> 'reasons'); END IF;
  END LOOP;
  IF jsonb_array_length(v_dep) > 0 THEN RETURN jsonb_build_object('verdict', 'dependent', 'reasons', v_dep, 'compared_with', v_n); END IF;
  IF jsonb_array_length(v_unk) > 0 THEN RETURN jsonb_build_object('verdict', 'unknown', 'reasons', v_unk, 'compared_with', v_n); END IF;
  IF v_n = 0 THEN
    IF coalesce((p_item ->> 'synthetic')::boolean, true) THEN RETURN jsonb_build_object('verdict', 'unknown', 'reasons', jsonb_build_array('synthetic evidence corroborates nothing'), 'compared_with', 0); END IF;
    IF p_item ->> 'source_id' IS NULL OR p_item ->> 'publisher' IS NULL THEN RETURN jsonb_build_object('verdict', 'unknown', 'reasons', jsonb_build_array('the source or publisher cannot be established from the records'), 'compared_with', 0); END IF;
    RETURN jsonb_build_object('verdict', 'independent', 'reasons', jsonb_build_array(format('the first counted %s source (%s, %s)', p_stance, p_item ->> 'source_key', p_item ->> 'publisher')), 'compared_with', 0);
  END IF;
  RETURN jsonb_build_object('verdict', 'independent', 'reasons', jsonb_build_array(format('independent of the %s counted %s source(s): a different source, publisher and digest, not synthetic', v_n, p_stance)), 'compared_with', v_n);
END $$;
REVOKE ALL ON FUNCTION prediction.signal_item_verdict(uuid, jsonb, text) FROM PUBLIC;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['signal_detections', 'signals_current', 'signal_events', 'signal_evidence', 'signal_rankings'] LOOP
    EXECUTE format('REVOKE ALL ON prediction.%I FROM PUBLIC', t);
    EXECUTE format('ALTER TABLE prediction.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE prediction.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY prediction_isolation ON prediction.%I
        USING (
          tenant_id = public.eye_tenant()
          AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain())
        )$f$, t);
    EXECUTE format('GRANT SELECT ON prediction.%I TO eye_app, eye_commit', t);
  END LOOP;
END $$;


-- ============================================================
-- §S5 THE PORTS
-- ============================================================
-- Who is acting: a named, active human; the domain's active Weak Signal Agent (its own principal); or neither.
CREATE OR REPLACE FUNCTION prediction.signal_actor_kind(p_tenant uuid, p_domain uuid, p_actor uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = prediction, executive, decision, identity, pg_catalog, pg_temp AS $$
  SELECT CASE
    WHEN decision.is_active_human(p_actor, p_tenant) THEN 'human'
    WHEN EXISTS (SELECT 1 FROM executive.agents a JOIN identity.principals p ON p.id = a.principal_id AND p.status = 'active'
                  WHERE a.principal_id = p_actor AND a.tenant_id = p_tenant AND a.domain_id = p_domain AND a.agent_kind = 'weak_signal' AND a.status = 'active') THEN 'agent'
    ELSE 'none' END
$$;
REVOKE ALL ON FUNCTION prediction.signal_actor_kind(uuid,uuid,uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION prediction.signal_event(p_signal uuid, p_version int, p_tenant uuid, p_domain uuid, p_event text, p_actor uuid, p_details jsonb, p_correlation uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = prediction, pg_catalog, pg_temp AS $$
DECLARE v_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO prediction.signal_events (event_id, scope, tenant_id, domain_id, signal_id, signal_version, event, actor_principal_id, details, correlation_id)
  VALUES (v_id, 'DOMAIN', p_tenant, p_domain, p_signal, p_version, p_event, p_actor, coalesce(p_details, '{}'::jsonb), p_correlation);
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION prediction.signal_event(uuid,int,uuid,uuid,text,uuid,jsonb,uuid) FROM PUBLIC;

-- One evidence row: resolved, judged against the counted rows of its stance, recorded. Answers the row and its verdict.
CREATE OR REPLACE FUNCTION prediction.signal_add_evidence_row(p_signal uuid, p_version int, p_tenant uuid, p_domain uuid, p_object_id uuid, p_object_version int, p_stance text, p_role text,
                                                             p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = prediction, pg_catalog, pg_temp AS $$
DECLARE r jsonb; v jsonb; v_id uuid := gen_random_uuid();
BEGIN
  r := prediction.signal_resolve_object(p_tenant, p_domain, p_object_id, p_object_version);
  IF r IS NULL THEN
    RAISE EXCEPTION 'signal rejected (evidence): no evidence or claim %@% in this domain', p_object_id, coalesce(p_object_version::text, 'latest') USING ERRCODE = '23503';
  END IF;
  IF r ->> 'lifecycle_state' = 'withdrawn' THEN
    RAISE EXCEPTION 'signal rejected (evidence_state): %@% is withdrawn; withdrawn evidence supports nothing', p_object_id, r ->> 'object_version' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (SELECT 1 FROM prediction.signal_evidence e WHERE e.signal_id = p_signal AND e.object_id = p_object_id AND e.object_version = (r ->> 'object_version')::int) THEN
    RAISE EXCEPTION 'signal rejected (duplicate_evidence): %@% is already evidence of signal %', p_object_id, r ->> 'object_version', p_signal USING ERRCODE = '23505';
  END IF;
  v := prediction.signal_item_verdict(p_signal, r, p_stance);
  INSERT INTO prediction.signal_evidence (evidence_id, scope, tenant_id, domain_id, signal_id, added_in_version, object_type, object_id, object_version, source_id, source_key, publisher,
                                          data_origin, upstream, content_digest, synthetic, stance, role, independence, independence_reasons, added_by, correlation_id)
  VALUES (v_id, 'DOMAIN', p_tenant, p_domain, p_signal, p_version, r ->> 'object_type', p_object_id, (r ->> 'object_version')::int, (r ->> 'source_id')::uuid, r ->> 'source_key', r ->> 'publisher',
          r ->> 'data_origin', r ->> 'upstream', r ->> 'content_digest', coalesce((r ->> 'synthetic')::boolean, true), p_stance, p_role, v ->> 'verdict', v -> 'reasons', p_actor, p_correlation);
  RETURN jsonb_build_object('evidence_id', v_id, 'object_type', r ->> 'object_type', 'object_id', p_object_id, 'object_version', (r ->> 'object_version')::int, 'source_id', r ->> 'source_id',
                            'source_key', r ->> 'source_key', 'publisher', r ->> 'publisher', 'data_origin', r ->> 'data_origin', 'synthetic', coalesce((r ->> 'synthetic')::boolean, true),
                            'stance', p_stance, 'role', p_role, 'independence', v ->> 'verdict', 'reasons', v -> 'reasons', 'classification', r ->> 'classification');
END $$;
REVOKE ALL ON FUNCTION prediction.signal_add_evidence_row(uuid,int,uuid,uuid,uuid,int,text,text,uuid,uuid) FROM PUBLIC;

-- The counts of a signal's counted sources, by stance.
CREATE OR REPLACE FUNCTION prediction.signal_counts(p_signal uuid) RETURNS TABLE (supporting int, contradicting int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = prediction, pg_catalog, pg_temp AS $$
  SELECT count(*) FILTER (WHERE stance = 'supporting' AND independence = 'independent')::int, count(*) FILTER (WHERE stance = 'contradicting' AND independence = 'independent')::int
    FROM prediction.signal_evidence WHERE signal_id = p_signal
$$;
REVOKE ALL ON FUNCTION prediction.signal_counts(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION prediction.signal_answer(s prediction.signals_current) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = prediction, pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object('signal_id', s.signal_id, 'version', s.version, 'title', s.title, 'maturity', s.maturity, 'disposition', s.disposition, 'nominator_kind', s.nominator_kind,
    'independent_sources', s.independent_sources, 'contradicting_sources', s.contradicting_sources, 'corroboration_threshold', s.corroboration_threshold, 'novelty', s.novelty,
    'detector_key', s.detector_key, 'as_of', s.as_of, 'candidate_id', s.candidate_id, 'falsify_conditions', s.falsify_conditions, 'strengthen_conditions', s.strengthen_conditions,
    'review_by', s.review_by)
$$;

-- A detection that fired and was not held → a TENTATIVE signal (nominator detector | agent), its basis evidence the observed window's.
CREATE OR REPLACE FUNCTION prediction.signal_from_detection(d prediction.signal_detections, p_nominator text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = prediction, graph, pg_catalog, pg_temp AS $$
DECLARE v_id uuid := gen_random_uuid(); v_name text; v_title text; e jsonb; v_row jsonb; v_rows jsonb := '[]'::jsonb; v_sup int; v_synth boolean := false; v_class text := 'internal';
        v_rank text[] := ARRAY['public', 'internal', 'confidential', 'restricted'];
BEGIN
  IF d.subject_kind = 'indicator' THEN SELECT i.description INTO v_name FROM prediction.indicators_current i WHERE i.indicator_id = d.subject_id;
  ELSE SELECT x.canonical_name INTO v_name FROM graph.entities_current x WHERE x.entity_id = d.subject_id; END IF;
  v_title := left(format('%s %s on %s (as of %s)', replace(d.detector_key, '_', ' '), coalesce(d.reading ->> 'direction', 'reading'), coalesce(v_name, d.subject_id::text), d.as_of), 300);
  -- the basis rows first (their foreign key is deferred), so the signal row is written once, with its counts and inherited controls
  FOR e IN SELECT value FROM jsonb_array_elements(coalesce(d.reading -> 'evidence', '[]'::jsonb)) LOOP
    IF prediction.signal_resolve_object(d.tenant_id, d.domain_id, (e ->> 'object_id')::uuid, (e ->> 'version')::int) IS NULL THEN CONTINUE; END IF;
    IF EXISTS (SELECT 1 FROM prediction.signal_evidence x WHERE x.signal_id = v_id AND x.object_id = (e ->> 'object_id')::uuid) THEN CONTINUE; END IF;
    v_row := prediction.signal_add_evidence_row(v_id, 1, d.tenant_id, d.domain_id, (e ->> 'object_id')::uuid, (e ->> 'version')::int, 'supporting', 'basis', p_actor, p_correlation);
    v_rows := v_rows || jsonb_build_array(v_row);
    v_synth := v_synth OR (v_row ->> 'synthetic')::boolean;
    IF array_position(v_rank, v_row ->> 'classification') > array_position(v_rank, v_class) THEN v_class := v_row ->> 'classification'; END IF;
  END LOOP;
  SELECT c.supporting INTO v_sup FROM prediction.signal_counts(v_id) c;
  INSERT INTO prediction.signals_current (signal_id, scope, tenant_id, domain_id, title, statement, subject_kind, subject_id, nominator_kind, nominated_by, nominated_run_id, detection_id,
                                          detector_key, detector_version, detector_digest, as_of, observation, baseline, novelty_basis, novelty, measure,
                                          independent_sources, synthetic_state, classification, correlation_id)
  VALUES (v_id, 'DOMAIN', d.tenant_id, d.domain_id, v_title,
          left(format('The %s detector (%s) read %s %s against its baseline as of %s: measure %s (%s). A weak signal until corroborated by independent sources.',
                      d.detector_key, d.detector_version, coalesce(v_name, d.subject_id::text), coalesce(d.reading ->> 'direction', ''), d.as_of, d.measure, coalesce(d.reading #>> '{novelty_basis,rule}', '')), 4000),
          d.subject_kind, d.subject_id, p_nominator, p_actor, d.run_id, d.detection_id, d.detector_key, d.detector_version, d.code_digest, d.as_of,
          coalesce(d.reading -> 'observation', '{}'::jsonb), coalesce(d.reading -> 'baseline', '{}'::jsonb), coalesce(d.reading -> 'novelty_basis', '{}'::jsonb),
          CASE WHEN d.detector_key = 'novelty' THEN d.measure END, d.measure, v_sup, v_synth, v_class, p_correlation);
  PERFORM prediction.signal_event(v_id, 1, d.tenant_id, d.domain_id, 'signal.nominated', p_actor,
    jsonb_build_object('nominator_kind', p_nominator, 'detection_id', d.detection_id, 'detector', d.detector_key, 'detector_version', d.detector_version, 'code_digest', d.code_digest,
                       'as_of', d.as_of, 'measure', d.measure, 'run_id', d.run_id, 'basis', v_rows), p_correlation);
  RETURN jsonb_build_object('signal_id', v_id, 'version', 1, 'title', v_title, 'detector', d.detector_key, 'subject_id', d.subject_id, 'as_of', d.as_of, 'measure', d.measure,
                            'independent_sources', v_sup, 'basis', v_rows);
END $$;
REVOKE ALL ON FUNCTION prediction.signal_from_detection(prediction.signal_detections,text,uuid,uuid) FROM PUBLIC;


-- The observations an indicator evaluated, up to an as-of day, as series points (the value, its day and its evidence version).
CREATE OR REPLACE FUNCTION prediction.signal_indicator_points(p_tenant uuid, p_domain uuid, p_indicator uuid, p_as_of date, p_limit int) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = prediction, pg_catalog, pg_temp AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('d', t.observation_at, 'v', t.value, 'e', t.evidence_object_id, 'ev', t.evidence_version) ORDER BY t.observation_at), '[]'::jsonb)
    FROM (SELECT e.observation_at, e.value, e.evidence_object_id, e.evidence_version FROM prediction.indicator_evaluations e
           WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain AND e.indicator_id = p_indicator AND e.observation_at <= p_as_of
           ORDER BY e.observation_at DESC LIMIT p_limit) t
$$;
REVOKE ALL ON FUNCTION prediction.signal_indicator_points(uuid,uuid,uuid,date,int) FROM PUBLIC;

-- One detector reading, recorded once per detector version × subject × as-of day; a fired, not held reading nominates (within the limit).
-- Answers {detection, held?, nominated?, repeated?, waiting?} for the scan to gather.
CREATE OR REPLACE FUNCTION prediction.signal_record_reading(p_tenant uuid, p_domain uuid, det prediction.signal_detectors, p_subject_kind text, p_subject uuid, p_as_of date, p_reading jsonb,
                                                            p_kind text, p_run_id uuid, p_nominate boolean, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = prediction, pg_catalog, pg_temp AS $$
DECLARE v_id uuid := gen_random_uuid(); d prediction.signal_detections%ROWTYPE; v_sig uuid; out jsonb;
BEGIN
  INSERT INTO prediction.signal_detections (detection_id, scope, tenant_id, domain_id, detector_key, detector_version, code_digest, subject_kind, subject_id, as_of, measure, fired,
                                            held_reason, reading, trigger, run_id, actor_principal_id, correlation_id)
  VALUES (v_id, 'DOMAIN', p_tenant, p_domain, det.detector_key, det.detector_version, det.code_digest, p_subject_kind, p_subject, p_as_of, (p_reading ->> 'measure')::numeric,
          coalesce((p_reading ->> 'fired')::boolean, false) AND p_reading ->> 'held' IS NULL, p_reading ->> 'held', p_reading, CASE WHEN p_kind = 'agent' THEN 'agent' ELSE 'operator' END,
          p_run_id, p_actor, p_correlation)
  ON CONFLICT ON CONSTRAINT psdet_once DO NOTHING;
  SELECT * INTO d FROM prediction.signal_detections x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.detector_key = det.detector_key
     AND x.detector_version = det.detector_version AND x.subject_id = p_subject AND x.as_of = p_as_of;
  out := jsonb_build_object('detection', jsonb_build_object('detection_id', d.detection_id, 'detector', d.detector_key, 'subject_kind', p_subject_kind, 'subject_id', p_subject,
                            'as_of', p_as_of, 'measure', d.measure, 'fired', d.fired, 'held', d.held_reason, 'repeated', d.detection_id <> v_id));
  IF d.held_reason IS NOT NULL THEN
    out := out || jsonb_build_object('held', jsonb_build_object('detection_id', d.detection_id, 'detector', d.detector_key, 'subject_id', p_subject, 'as_of', p_as_of,
                                                                'held', d.held_reason, 'detail', d.reading ->> 'held_detail'));
  END IF;
  IF d.fired THEN
    -- a fired reading nominates ONCE; one left waiting by an earlier scan's limit is nominated by the next scan that has room (under that run)
    SELECT s.signal_id INTO v_sig FROM prediction.signals_current s WHERE s.detection_id = d.detection_id;
    IF v_sig IS NOT NULL THEN out := out || jsonb_build_object('repeated', jsonb_build_object('detection_id', d.detection_id, 'signal_id', v_sig));
    ELSIF NOT p_nominate THEN out := out || jsonb_build_object('waiting', jsonb_build_object('detection_id', d.detection_id, 'detector', d.detector_key, 'subject_id', p_subject));
    ELSE
      d.run_id := p_run_id;
      out := out || jsonb_build_object('nominated', prediction.signal_from_detection(d, CASE WHEN p_kind = 'agent' THEN 'agent' ELSE 'detector' END, p_actor, p_correlation));
    END IF;
  END IF;
  RETURN out;
END $$;
REVOKE ALL ON FUNCTION prediction.signal_record_reading(uuid,uuid,prediction.signal_detectors,text,uuid,date,jsonb,text,uuid,boolean,uuid,uuid) FROM PUBLIC;

-- THE SCAN (OBJ-17: nomination by a detector or by the agent). Every AVAILABLE detector (its newest version) over the domain's indicators
-- that are active and not expired (the series detectors, as of the stated day or each indicator's last evaluated observation) and over
-- the entities with relationships (as of the stated day or the entity's latest relationship day; the 50 most recent); every reading
-- recorded ONCE (a rescan of the same detector version, subject and day answers `repeated`); a reading that fired and was not held
-- nominates a tentative signal — at most p_max_items nominations (the agent's registered stop condition; the rest are recorded and said
-- to be waiting for the next scan). The nominator is the acting principal's kind: the domain's Weak Signal Agent → `agent`, a named human →
-- `detector` (the detector nominated; a person ran it).
CREATE OR REPLACE FUNCTION prediction.scan_signals(p_tenant uuid, p_domain uuid, p_as_of date, p_run_id uuid, p_max_items int, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, graph, executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_kind text; det prediction.signal_detectors%ROWTYPE; subj record; v_as_of date; v_reading jsonb; r jsonb; v_absent jsonb;
        v_detections jsonb := '[]'::jsonb; v_nominated jsonb := '[]'::jsonb; v_repeated jsonb := '[]'::jsonb; v_held jsonb := '[]'::jsonb; v_waiting jsonb := '[]'::jsonb;
        v_n int := 0; v_limit int := coalesce(p_max_items, 1000);
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.signal.nominate']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'signal rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  v_kind := prediction.signal_actor_kind(p_tenant, p_domain, p_actor);
  IF v_kind = 'none' THEN RAISE EXCEPTION 'signal rejected: the detectors are run by a named human or by the domain''s active Weak Signal Agent' USING ERRCODE = '42501'; END IF;
  IF p_max_items IS NOT NULL AND (p_max_items < 0 OR p_max_items > 1000) THEN RAISE EXCEPTION 'signal rejected: max_items is 0..1000' USING ERRCODE = '22023'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('detector', x.detector_key, 'version', x.detector_version, 'reason', x.absent_reason) ORDER BY x.detector_key), '[]'::jsonb) INTO v_absent
    FROM prediction.signal_detectors x WHERE x.status = 'absent';
  FOR det IN SELECT * FROM prediction.signal_detectors x WHERE x.status = 'available'
               AND x.detector_version = (SELECT max(y.detector_version) FROM prediction.signal_detectors y WHERE y.detector_key = x.detector_key) ORDER BY x.detector_key LOOP
    FOR subj IN
      SELECT i.indicator_id AS id, 'indicator'::text AS kind, i.last_observation_at AS last_day FROM prediction.indicators_current i
       WHERE det.input_kind = 'indicator_series' AND i.tenant_id = p_tenant AND i.domain_id = p_domain AND i.state = 'active'
         AND (i.expires_at IS NULL OR i.expires_at > clock_timestamp()) AND i.last_observation_at IS NOT NULL
      UNION ALL
      SELECT q.entity_id, 'entity', q.last_day FROM (
        SELECT x.entity_id, max(greatest(x.vf, coalesce(x.vt, x.vf)))::date AS last_day, max(x.vf) AS recent FROM (
          SELECT e.subject_entity_id AS entity_id, e.valid_from AS vf, e.valid_to AS vt FROM graph.edges_current e WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain
          UNION ALL SELECT e.object_entity_id, e.valid_from, e.valid_to FROM graph.edges_current e WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain) x
         GROUP BY x.entity_id ORDER BY max(x.vf) DESC, x.entity_id LIMIT 50) q
       WHERE det.input_kind IN ('graph_edges', 'edge_sources')
    LOOP
      v_as_of := coalesce(p_as_of, subj.last_day);
      v_reading := CASE det.detector_key
        WHEN 'novelty' THEN prediction.signal_measure_novelty(prediction.signal_indicator_points(p_tenant, p_domain, subj.id, v_as_of, 400), v_as_of, det.params)
        WHEN 'acceleration' THEN prediction.signal_measure_acceleration(prediction.signal_indicator_points(p_tenant, p_domain, subj.id, v_as_of, 400), v_as_of, det.params)
        WHEN 'change_point' THEN prediction.signal_measure_change_point(prediction.signal_indicator_points(p_tenant, p_domain, subj.id, v_as_of, 400), v_as_of, det.params)
        WHEN 'relationship_change' THEN prediction.signal_measure_relationship_change(p_tenant, p_domain, subj.id, v_as_of, det.params)
        ELSE prediction.signal_measure_diffusion(p_tenant, p_domain, subj.id, v_as_of, det.params) END;
      r := prediction.signal_record_reading(p_tenant, p_domain, det, subj.kind, subj.id, v_as_of, v_reading, v_kind, p_run_id, v_n < v_limit, p_actor, p_correlation);
      v_detections := v_detections || jsonb_build_array(r -> 'detection');
      IF r ? 'held' THEN v_held := v_held || jsonb_build_array(r -> 'held'); END IF;
      IF r ? 'repeated' THEN v_repeated := v_repeated || jsonb_build_array(r -> 'repeated'); END IF;
      IF r ? 'waiting' THEN v_waiting := v_waiting || jsonb_build_array(r -> 'waiting'); END IF;
      IF r ? 'nominated' THEN v_nominated := v_nominated || jsonb_build_array(r -> 'nominated'); v_n := v_n + 1; END IF;
    END LOOP;
  END LOOP;
  RETURN jsonb_build_object('nominator_kind', CASE WHEN v_kind = 'agent' THEN 'agent' ELSE 'detector' END, 'as_of', p_as_of, 'run_id', p_run_id, 'detections', v_detections,
                            'nominated', v_nominated, 'repeated', v_repeated, 'held', v_held, 'waiting', v_waiting, 'absent', v_absent, 'max_items', p_max_items);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.scan_signals(uuid,uuid,date,uuid,int,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.scan_signals(uuid,uuid,date,uuid,int,uuid,uuid) TO eye_commit;

-- AN ANALYST'S NOMINATION (OBJ-17): a named human names the evidence (1..50 items), the observation, the baseline and the novelty basis in
-- their own words; the evidence rows are judged as they are recorded (the first counted source of each stance, then the rest against it).
CREATE OR REPLACE FUNCTION prediction.nominate_signal(p_signal_id uuid, p_tenant uuid, p_domain uuid, p_title text, p_statement text, p_subject_kind text, p_subject_id uuid,
                                                      p_evidence jsonb, p_observation jsonb, p_baseline jsonb, p_novelty_basis jsonb, p_confidence numeric, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, graph, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE e jsonb; v_row jsonb; v_rows jsonb := '[]'::jsonb; v_sup int; v_con int; v_synth boolean := false; v_class text := 'internal'; v_rank text[] := ARRAY['public', 'internal', 'confidential', 'restricted'];
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.signal.nominate']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'signal rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF prediction.signal_actor_kind(p_tenant, p_domain, p_actor) <> 'human' THEN
    RAISE EXCEPTION 'signal rejected: an analyst''s nomination is a named human''s act (the Weak Signal Agent nominates through its detectors)' USING ERRCODE = '42501';
  END IF;
  IF p_title IS NULL OR length(btrim(p_title)) NOT BETWEEN 3 AND 300 THEN RAISE EXCEPTION 'signal rejected: a title of 3..300 characters is required' USING ERRCODE = '22023'; END IF;
  IF p_statement IS NULL OR length(btrim(p_statement)) NOT BETWEEN 8 AND 4000 THEN RAISE EXCEPTION 'signal rejected: a statement of 8..4000 characters is required' USING ERRCODE = '22023'; END IF;
  IF p_subject_kind IS NULL OR p_subject_kind NOT IN ('indicator', 'entity', 'none') OR ((p_subject_kind = 'none') <> (p_subject_id IS NULL)) THEN
    RAISE EXCEPTION 'signal rejected: the subject is an indicator or an entity with its id, or none' USING ERRCODE = '22023';
  END IF;
  IF p_evidence IS NULL OR jsonb_typeof(p_evidence) <> 'array' OR jsonb_array_length(p_evidence) = 0 OR jsonb_array_length(p_evidence) > 50 THEN
    RAISE EXCEPTION 'signal rejected: a nomination names 1..50 evidence items {object_id, version?, stance?}' USING ERRCODE = '22023';
  END IF;
  FOR e IN SELECT value FROM jsonb_array_elements(p_evidence) LOOP
    IF jsonb_typeof(e) <> 'object' OR coalesce(e ->> 'object_id', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       OR coalesce(e ->> 'stance', 'supporting') NOT IN ('supporting', 'contradicting') OR (e ? 'version' AND jsonb_typeof(e -> 'version') NOT IN ('number', 'null')) THEN
      RAISE EXCEPTION 'signal rejected: each evidence item is {object_id, version?, stance: supporting|contradicting}' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF jsonb_typeof(coalesce(p_observation, 'null'::jsonb)) <> 'object' OR jsonb_typeof(coalesce(p_baseline, 'null'::jsonb)) <> 'object' OR jsonb_typeof(coalesce(p_novelty_basis, 'null'::jsonb)) <> 'object'
     OR length(coalesce(p_novelty_basis ->> 'basis', p_novelty_basis ->> 'rule', '')) < 8 THEN
    RAISE EXCEPTION 'signal rejected: the observation and the baseline are objects, and the novelty basis says what is new against what ({basis, …})' USING ERRCODE = '22023';
  END IF;
  IF p_confidence IS NOT NULL AND (p_confidence < 0 OR p_confidence > 1) THEN RAISE EXCEPTION 'signal rejected: confidence is in 0..1' USING ERRCODE = '22023'; END IF;
  IF p_subject_kind = 'indicator' AND NOT EXISTS (SELECT 1 FROM prediction.indicators_current i WHERE i.indicator_id = p_subject_id AND i.tenant_id = p_tenant AND i.domain_id = p_domain) THEN
    RAISE EXCEPTION 'signal rejected (subject): no indicator % in this domain', p_subject_id USING ERRCODE = '23503';
  END IF;
  IF p_subject_kind = 'entity' AND NOT EXISTS (SELECT 1 FROM graph.entities_current x WHERE x.entity_id = p_subject_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain) THEN
    RAISE EXCEPTION 'signal rejected (subject): no entity % in this domain', p_subject_id USING ERRCODE = '23503';
  END IF;
  IF EXISTS (SELECT 1 FROM prediction.signals_current s WHERE s.signal_id = p_signal_id) THEN RAISE EXCEPTION 'signal rejected (duplicate): signal % is already nominated', p_signal_id USING ERRCODE = '23505'; END IF;
  FOR e IN SELECT value FROM jsonb_array_elements(p_evidence) LOOP
    v_row := prediction.signal_add_evidence_row(p_signal_id, 1, p_tenant, p_domain, (e ->> 'object_id')::uuid, (e ->> 'version')::int, coalesce(e ->> 'stance', 'supporting'), 'basis', p_actor, p_correlation);
    v_rows := v_rows || jsonb_build_array(v_row);
    v_synth := v_synth OR (v_row ->> 'synthetic')::boolean;
    IF array_position(v_rank, v_row ->> 'classification') > array_position(v_rank, v_class) THEN v_class := v_row ->> 'classification'; END IF;
  END LOOP;
  SELECT c.supporting, c.contradicting INTO v_sup, v_con FROM prediction.signal_counts(p_signal_id) c;
  INSERT INTO prediction.signals_current (signal_id, scope, tenant_id, domain_id, title, statement, subject_kind, subject_id, nominator_kind, nominated_by, observation, baseline, novelty_basis,
                                          novelty, confidence, independent_sources, contradicting_sources, synthetic_state, classification, correlation_id)
  VALUES (p_signal_id, 'DOMAIN', p_tenant, p_domain, btrim(p_title), btrim(p_statement), p_subject_kind, p_subject_id, 'analyst', p_actor, p_observation, p_baseline, p_novelty_basis,
          NULL, p_confidence, v_sup, v_con, v_synth, v_class, p_correlation);
  PERFORM prediction.signal_event(p_signal_id, 1, p_tenant, p_domain, 'signal.nominated', p_actor, jsonb_build_object('nominator_kind', 'analyst', 'basis', v_rows, 'confidence', p_confidence), p_correlation);
  RETURN jsonb_build_object('signal_id', p_signal_id, 'version', 1, 'maturity', 'tentative', 'nominator_kind', 'analyst', 'independent_sources', v_sup, 'contradicting_sources', v_con, 'basis', v_rows,
                            'note', 'an analyst''s nomination carries no novelty measure: the novelty basis is the analyst''s statement');
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.nominate_signal(uuid,uuid,uuid,text,text,text,uuid,jsonb,jsonb,jsonb,jsonb,numeric,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.nominate_signal(uuid,uuid,uuid,text,text,text,uuid,jsonb,jsonb,jsonb,jsonb,numeric,uuid,uuid) TO eye_commit;

-- The signal as the human ports lock it: in this domain, at the version the caller saw (stale → 409), by a named human.
CREATE OR REPLACE FUNCTION prediction.signal_for_human_act(p_signal uuid, p_tenant uuid, p_domain uuid, p_expected int, p_actor uuid, p_what text) RETURNS prediction.signals_current
LANGUAGE plpgsql SECURITY DEFINER SET search_path = prediction, pg_catalog, pg_temp AS $$
DECLARE s prediction.signals_current%ROWTYPE;
BEGIN
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'signal rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF prediction.signal_actor_kind(p_tenant, p_domain, p_actor) <> 'human' THEN
    RAISE EXCEPTION 'signal rejected: % is a named human''s act; the Weak Signal Agent nominates and ranks only', p_what USING ERRCODE = '42501';
  END IF;
  SELECT * INTO s FROM prediction.signals_current x WHERE x.signal_id = p_signal AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'signal rejected: no such signal % in this domain', p_signal USING ERRCODE = '23503'; END IF;
  IF p_expected IS NOT NULL AND p_expected <> s.version THEN
    RAISE EXCEPTION 'signal rejected (stale_version): signal % is at version %, not %; read it again', p_signal, s.version, p_expected USING ERRCODE = '23514';
  END IF;
  RETURN s;
END $$;
REVOKE ALL ON FUNCTION prediction.signal_for_human_act(uuid,uuid,uuid,int,uuid,text) FROM PUBLIC;

-- CORROBORATION (V02-T-158): a named human adds an evidence item; it is judged against the counted sources of its stance; an INDEPENDENT
-- item that brings the supporting count to the threshold makes the signal CORROBORATED, one that brings the contradicting count to the
-- threshold above the supporting makes it INVALID — each by a `signal.corroborated` event naming the row (the gate's condition).
CREATE OR REPLACE FUNCTION prediction.add_signal_evidence(p_signal uuid, p_tenant uuid, p_domain uuid, p_object_id uuid, p_object_version int, p_stance text, p_expected int, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE s prediction.signals_current%ROWTYPE; v_ver int; v_row jsonb; v_sup int; v_con int; v_to text; v_ev uuid; v_rank text[] := ARRAY['public', 'internal', 'confidential', 'restricted'];
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.signal.evidence.add']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_stance IS NULL OR p_stance NOT IN ('supporting', 'contradicting') THEN RAISE EXCEPTION 'signal rejected: the stance is supporting or contradicting' USING ERRCODE = '22023'; END IF;
  IF p_object_id IS NULL THEN RAISE EXCEPTION 'signal rejected: an evidence item names an object' USING ERRCODE = '22023'; END IF;
  s := prediction.signal_for_human_act(p_signal, p_tenant, p_domain, p_expected, p_actor, 'adding evidence');
  v_ver := s.version + 1;
  v_row := prediction.signal_add_evidence_row(p_signal, v_ver, p_tenant, p_domain, p_object_id, p_object_version, p_stance, 'corroboration', p_actor, p_correlation);
  SELECT c.supporting, c.contradicting INTO v_sup, v_con FROM prediction.signal_counts(p_signal) c;
  PERFORM prediction.signal_event(p_signal, v_ver, p_tenant, p_domain, 'signal.evidence_added', p_actor, v_row || jsonb_build_object('independent_sources', v_sup, 'contradicting_sources', v_con), p_correlation);
  IF v_row ->> 'independence' = 'independent' THEN
    IF p_stance = 'supporting' AND s.maturity = 'tentative' AND v_sup >= s.corroboration_threshold THEN v_to := 'corroborated';
    ELSIF p_stance = 'contradicting' AND s.maturity <> 'invalid' AND v_con >= s.corroboration_threshold AND v_con > v_sup THEN v_to := 'invalid'; END IF;
  END IF;
  IF v_to IS NOT NULL THEN
    v_ev := prediction.signal_event(p_signal, v_ver, p_tenant, p_domain, 'signal.corroborated', p_actor,
      jsonb_build_object('evidence_id', v_row ->> 'evidence_id', 'from', s.maturity, 'to', v_to, 'stance', p_stance, 'independent_sources', v_sup, 'contradicting_sources', v_con,
                         'threshold', s.corroboration_threshold, 'rule', CASE v_to WHEN 'corroborated' THEN 'the independent supporting sources reached the threshold'
                                                                             ELSE 'the independent contradicting sources reached the threshold and outnumber the supporting' END), p_correlation);
  END IF;
  UPDATE prediction.signals_current SET version = v_ver, independent_sources = v_sup, contradicting_sources = v_con, maturity = coalesce(v_to, s.maturity),
         synthetic_state = s.synthetic_state OR (v_row ->> 'synthetic')::boolean,
         classification = CASE WHEN array_position(v_rank, v_row ->> 'classification') > array_position(v_rank, s.classification) THEN v_row ->> 'classification' ELSE s.classification END,
         updated_at = clock_timestamp()
   WHERE signal_id = p_signal;
  RETURN jsonb_build_object('signal_id', p_signal, 'version', v_ver, 'evidence', v_row, 'maturity', coalesce(v_to, s.maturity), 'maturity_changed', v_to IS NOT NULL, 'corroborated_event_id', v_ev,
                            'independent_sources', v_sup, 'contradicting_sources', v_con, 'threshold', s.corroboration_threshold);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.add_signal_evidence(uuid,uuid,uuid,uuid,int,text,int,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.add_signal_evidence(uuid,uuid,uuid,uuid,int,text,int,uuid,uuid) TO eye_commit;

-- THE INDEPENDENCE TEST (a named human's act): every pair of the signal's evidence judged afresh from the records as they stand (a source
-- since found synthetic, a publisher since changed), with each row's recorded verdict beside it; recorded as an event; nothing counted
-- changes (the counts move only when evidence is added).
CREATE OR REPLACE FUNCTION prediction.test_signal_independence(p_signal uuid, p_tenant uuid, p_domain uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE s prediction.signals_current%ROWTYPE; a record; b record; ra jsonb; rb jsonb; v jsonb; v_pairs jsonb := '[]'::jsonb; v_rows jsonb := '[]'::jsonb; v_n jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.signal.independence.test']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  s := prediction.signal_for_human_act(p_signal, p_tenant, p_domain, NULL, p_actor, 'testing source independence');
  FOR a IN SELECT * FROM prediction.signal_evidence e WHERE e.signal_id = p_signal ORDER BY e.added_at, e.evidence_id LOOP
    ra := coalesce(prediction.signal_resolve_object(p_tenant, p_domain, a.object_id, a.object_version), jsonb_build_object('object_id', a.object_id, 'object_version', a.object_version, 'synthetic', true));
    v_rows := v_rows || jsonb_build_array(jsonb_build_object('evidence_id', a.evidence_id, 'object_id', a.object_id, 'object_version', a.object_version, 'source_key', ra ->> 'source_key',
                'publisher', ra ->> 'publisher', 'data_origin', ra ->> 'data_origin', 'stance', a.stance, 'recorded', a.independence, 'recorded_reasons', a.independence_reasons));
    FOR b IN SELECT * FROM prediction.signal_evidence e WHERE e.signal_id = p_signal AND (e.added_at, e.evidence_id) > (a.added_at, a.evidence_id) ORDER BY e.added_at, e.evidence_id LOOP
      rb := coalesce(prediction.signal_resolve_object(p_tenant, p_domain, b.object_id, b.object_version), jsonb_build_object('object_id', b.object_id, 'object_version', b.object_version, 'synthetic', true));
      v := prediction.signal_pair_verdict(ra, rb);
      v_pairs := v_pairs || jsonb_build_array(jsonb_build_object('a', a.evidence_id, 'b', b.evidence_id, 'verdict', v ->> 'verdict', 'reasons', v -> 'reasons'));
    END LOOP;
  END LOOP;
  SELECT jsonb_build_object('independent', count(*) FILTER (WHERE p ->> 'verdict' = 'independent'), 'dependent', count(*) FILTER (WHERE p ->> 'verdict' = 'dependent'),
                            'unknown', count(*) FILTER (WHERE p ->> 'verdict' = 'unknown')) INTO v_n FROM jsonb_array_elements(v_pairs) p;
  PERFORM prediction.signal_event(p_signal, s.version, p_tenant, p_domain, 'signal.independence_tested', p_actor,
    jsonb_build_object('pairs', v_pairs, 'summary', v_n, 'independent_sources', s.independent_sources, 'contradicting_sources', s.contradicting_sources), p_correlation);
  RETURN jsonb_build_object('signal_id', p_signal, 'version', s.version, 'evidence', v_rows, 'pairs', v_pairs, 'summary', v_n, 'independent_sources', s.independent_sources,
                            'contradicting_sources', s.contradicting_sources, 'threshold', s.corroboration_threshold, 'maturity', s.maturity,
                            'rule', 'independent: a different source, publisher and evidence digest, neither synthetic; dependent: a shared source, publisher, digest or declared upstream; unknown: not verifiable from the records — never counted');
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.test_signal_independence(uuid,uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.test_signal_independence(uuid,uuid,uuid,uuid,uuid) TO eye_commit;

-- A condition: {text (8..500), kind: observation | indicator | source | deadline, indicator_id? (an indicator of this domain), by? (a date)}.
CREATE OR REPLACE FUNCTION prediction.signal_conditions_valid(p_tenant uuid, p_domain uuid, p jsonb, p_what text) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = prediction, pg_catalog, pg_temp AS $$
DECLARE c jsonb;
BEGIN
  IF p IS NULL OR jsonb_typeof(p) <> 'array' OR jsonb_array_length(p) > 20 THEN RAISE EXCEPTION 'signal rejected: % conditions are a list of at most 20', p_what USING ERRCODE = '22023'; END IF;
  FOR c IN SELECT value FROM jsonb_array_elements(p) LOOP
    IF jsonb_typeof(c) <> 'object' OR length(btrim(coalesce(c ->> 'text', ''))) NOT BETWEEN 8 AND 500 OR coalesce(c ->> 'kind', '') NOT IN ('observation', 'indicator', 'source', 'deadline')
       OR (c ? 'by' AND coalesce(c ->> 'by', '') !~ '^\d{4}-\d{2}-\d{2}') OR (c ->> 'kind' = 'indicator' AND coalesce(c ->> 'indicator_id', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') THEN
      RAISE EXCEPTION 'signal rejected: each % condition is {text: 8..500 characters, kind: observation|indicator|source|deadline, indicator_id (for an indicator), by?: YYYY-MM-DD}', p_what USING ERRCODE = '22023';
    END IF;
    IF c ->> 'kind' = 'indicator' AND NOT EXISTS (SELECT 1 FROM prediction.indicators_current i WHERE i.indicator_id = (c ->> 'indicator_id')::uuid AND i.tenant_id = p_tenant AND i.domain_id = p_domain) THEN
      RAISE EXCEPTION 'signal rejected (condition): no indicator % in this domain', c ->> 'indicator_id' USING ERRCODE = '23503';
    END IF;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION prediction.signal_conditions_valid(uuid,uuid,jsonb,text) FROM PUBLIC;

-- THE CONDITIONS (V02-T-158): what would strengthen and what would falsify the signal — a named human's statement, replacing the lists.
CREATE OR REPLACE FUNCTION prediction.set_signal_conditions(p_signal uuid, p_tenant uuid, p_domain uuid, p_strengthen jsonb, p_falsify jsonb, p_expected int, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE s prediction.signals_current%ROWTYPE; v_ver int;
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.signal.conditions.set']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_strengthen IS NULL AND p_falsify IS NULL THEN RAISE EXCEPTION 'signal rejected: name the strengthen conditions, the falsify conditions or both' USING ERRCODE = '22023'; END IF;
  s := prediction.signal_for_human_act(p_signal, p_tenant, p_domain, p_expected, p_actor, 'setting the conditions');
  PERFORM prediction.signal_conditions_valid(p_tenant, p_domain, coalesce(p_strengthen, s.strengthen_conditions), 'strengthen');
  PERFORM prediction.signal_conditions_valid(p_tenant, p_domain, coalesce(p_falsify, s.falsify_conditions), 'falsify');
  IF s.disposition = 'monitor' AND jsonb_array_length(coalesce(p_falsify, s.falsify_conditions)) = 0 THEN
    RAISE EXCEPTION 'signal rejected: signal % is monitored; a monitored signal keeps at least one falsify condition', p_signal USING ERRCODE = '22023';
  END IF;
  v_ver := s.version + 1;
  PERFORM prediction.signal_event(p_signal, v_ver, p_tenant, p_domain, 'signal.conditions_set', p_actor,
    jsonb_build_object('strengthen', coalesce(p_strengthen, s.strengthen_conditions), 'falsify', coalesce(p_falsify, s.falsify_conditions),
                       'prior_strengthen', s.strengthen_conditions, 'prior_falsify', s.falsify_conditions), p_correlation);
  UPDATE prediction.signals_current SET version = v_ver, strengthen_conditions = coalesce(p_strengthen, s.strengthen_conditions), falsify_conditions = coalesce(p_falsify, s.falsify_conditions),
         updated_at = clock_timestamp() WHERE signal_id = p_signal;
  RETURN prediction.signal_answer((SELECT x FROM prediction.signals_current x WHERE x.signal_id = p_signal));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.set_signal_conditions(uuid,uuid,uuid,jsonb,jsonb,int,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.set_signal_conditions(uuid,uuid,uuid,jsonb,jsonb,int,uuid,uuid) TO eye_commit;

-- THE DISPOSITION (OBJ-18): confirm | monitor | dismiss — a named human's act, never the nominator's; `monitor` needs a falsify condition
-- (named here or already set) and may set the next review; confirming an INVALID signal is refused. The maturity is untouched (the gate).
-- The same disposition and note again answers `repeated`. Escalation is its own port (it submits a warning candidate).
CREATE OR REPLACE FUNCTION prediction.record_signal_disposition(p_signal uuid, p_tenant uuid, p_domain uuid, p_disposition text, p_note text, p_falsify jsonb, p_review_by timestamptz,
                                                                p_expected int, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE s prediction.signals_current%ROWTYPE; v_ver int; v_note text := nullif(btrim(coalesce(p_note, '')), ''); v_falsify jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.signal.dispose']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_disposition IS NULL OR p_disposition NOT IN ('confirm', 'monitor', 'dismiss') THEN
    RAISE EXCEPTION 'signal rejected: the disposition is confirm, monitor or dismiss (escalate is its own act)' USING ERRCODE = '22023';
  END IF;
  IF v_note IS NULL OR length(v_note) NOT BETWEEN 8 AND 2000 THEN RAISE EXCEPTION 'signal rejected: a disposition states why in 8..2000 characters' USING ERRCODE = '22023'; END IF;
  s := prediction.signal_for_human_act(p_signal, p_tenant, p_domain, p_expected, p_actor, 'a disposition');
  IF s.nominated_by = p_actor THEN
    RAISE EXCEPTION 'signal rejected: the nominator of signal % does not dispose of it; a second person decides', p_signal USING ERRCODE = '42501';
  END IF;
  IF p_disposition = 'confirm' AND s.maturity = 'invalid' THEN
    RAISE EXCEPTION 'signal rejected (maturity): signal % is invalid — its independent contradicting sources outnumber the supporting; it is not confirmed', p_signal USING ERRCODE = '23514';
  END IF;
  IF p_falsify IS NOT NULL THEN PERFORM prediction.signal_conditions_valid(p_tenant, p_domain, p_falsify, 'falsify'); END IF;
  v_falsify := CASE WHEN p_falsify IS NULL THEN s.falsify_conditions ELSE s.falsify_conditions || p_falsify END;
  IF p_disposition = 'monitor' AND jsonb_array_length(v_falsify) = 0 THEN
    RAISE EXCEPTION 'signal rejected: `monitor` names what would falsify the signal (a falsify condition)' USING ERRCODE = '22023';
  END IF;
  IF p_review_by IS NOT NULL AND p_review_by <= clock_timestamp() THEN RAISE EXCEPTION 'signal rejected: the next review is a future instant' USING ERRCODE = '22023'; END IF;
  IF s.disposition = p_disposition AND s.disposition_note IS NOT DISTINCT FROM v_note AND p_falsify IS NULL AND p_review_by IS NULL THEN
    RETURN prediction.signal_answer(s) || jsonb_build_object('repeated', true);
  END IF;
  v_ver := s.version + 1;
  PERFORM prediction.signal_event(p_signal, v_ver, p_tenant, p_domain, 'signal.disposition', p_actor,
    jsonb_build_object('disposition', p_disposition, 'previous', s.disposition, 'note', v_note, 'maturity', s.maturity, 'independent_sources', s.independent_sources,
                       'falsify_added', coalesce(p_falsify, '[]'::jsonb), 'review_by', p_review_by), p_correlation);
  UPDATE prediction.signals_current SET version = v_ver, disposition = p_disposition, disposition_by = p_actor, disposition_at = clock_timestamp(), disposition_note = v_note,
         falsify_conditions = v_falsify, review_by = coalesce(p_review_by, s.review_by), updated_at = clock_timestamp() WHERE signal_id = p_signal;
  RETURN prediction.signal_answer((SELECT x FROM prediction.signals_current x WHERE x.signal_id = p_signal)) || jsonb_build_object('repeated', false, 'previous', s.disposition);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.record_signal_disposition(uuid,uuid,uuid,text,text,jsonb,timestamptz,int,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.record_signal_disposition(uuid,uuid,uuid,text,text,jsonb,timestamptz,int,uuid,uuid) TO eye_commit;

-- ESCALATION (OBJ-18, PR-25-003): a named human's act — the signal SUBMITS a warning candidate through the intake (0088 §0: origin weak_signal,
-- key signal:<id>:<version>, the cause the signal's subject, the evidence with its stances); the lifecycle part clusters or raises it. An
-- INVALID signal is not escalated; a signal already escalated answers `repeated` with its candidate.
CREATE OR REPLACE FUNCTION prediction.escalate_signal(p_signal uuid, p_tenant uuid, p_domain uuid, p_note text, p_consequence text, p_confidence numeric, p_window_hours int, p_affected jsonb,
                                                      p_expected int, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE s prediction.signals_current%ROWTYPE; v_ver int; v_note text := nullif(btrim(coalesce(p_note, '')), ''); v_cand jsonb; v_evidence jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.signal.escalate']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF v_note IS NULL OR length(v_note) NOT BETWEEN 8 AND 2000 THEN RAISE EXCEPTION 'signal rejected: an escalation states why in 8..2000 characters' USING ERRCODE = '22023'; END IF;
  IF p_consequence IS NULL OR p_consequence NOT IN ('C1', 'C2', 'C3', 'C4') THEN RAISE EXCEPTION 'signal rejected: an escalation names the consequence class C1..C4' USING ERRCODE = '22023'; END IF;
  s := prediction.signal_for_human_act(p_signal, p_tenant, p_domain, p_expected, p_actor, 'an escalation');
  IF s.nominated_by = p_actor THEN RAISE EXCEPTION 'signal rejected: the nominator of signal % does not dispose of it; a second person decides', p_signal USING ERRCODE = '42501'; END IF;
  IF s.disposition = 'escalate' AND s.candidate_id IS NOT NULL THEN
    RETURN prediction.signal_answer(s) || jsonb_build_object('repeated', true, 'candidate', (SELECT jsonb_build_object('candidate_id', c.candidate_id, 'state', c.state, 'warning_id', c.warning_id)
                                                                                           FROM prediction.warning_candidates c WHERE c.candidate_id = s.candidate_id));
  END IF;
  IF s.maturity = 'invalid' THEN
    RAISE EXCEPTION 'signal rejected (maturity): signal % is invalid — its independent contradicting sources outnumber the supporting; it is not escalated', p_signal USING ERRCODE = '23514';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('object_id', e.object_id, 'version', e.object_version, 'source_id', e.source_id, 'stance', e.stance, 'independence', e.independence) ORDER BY e.added_at), '[]'::jsonb)
    INTO v_evidence FROM prediction.signal_evidence e WHERE e.signal_id = p_signal;
  v_cand := prediction.submit_warning_candidate(p_tenant, p_domain, 'weak_signal', format('signal:%s:%s', p_signal, s.version),
    jsonb_build_object('signal_id', p_signal, 'version', s.version, 'maturity', s.maturity, 'independent_sources', s.independent_sources, 'detector_key', s.detector_key,
                       'novelty', s.novelty, 'as_of', s.as_of, 'nominator_kind', s.nominator_kind),
    left('Weak signal escalated: ' || s.title, 300), p_consequence, coalesce(p_confidence, s.confidence),
    format('signal-subject:%s:%s', s.subject_kind, coalesce(s.subject_id, s.signal_id)), coalesce(p_affected, '{}'::jsonb), v_evidence, p_window_hours, p_actor, p_correlation);
  v_ver := s.version + 1;
  PERFORM prediction.signal_event(p_signal, v_ver, p_tenant, p_domain, 'signal.escalated', p_actor,
    jsonb_build_object('candidate', v_cand, 'note', v_note, 'consequence', p_consequence, 'maturity', s.maturity, 'previous', s.disposition, 'origin_key', format('signal:%s:%s', p_signal, s.version)), p_correlation);
  UPDATE prediction.signals_current SET version = v_ver, disposition = 'escalate', disposition_by = p_actor, disposition_at = clock_timestamp(), disposition_note = v_note,
         candidate_id = (v_cand ->> 'candidate_id')::uuid, updated_at = clock_timestamp() WHERE signal_id = p_signal;
  RETURN prediction.signal_answer((SELECT x FROM prediction.signals_current x WHERE x.signal_id = p_signal)) || jsonb_build_object('repeated', false, 'candidate', v_cand);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.escalate_signal(uuid,uuid,uuid,text,text,numeric,int,jsonb,int,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.escalate_signal(uuid,uuid,uuid,text,text,numeric,int,jsonb,int,uuid,uuid) TO eye_commit;

-- THE RANK (AG-031: the agent nominates and RANKS): the live signals (not dismissed, not invalid) in a LEXICOGRAPHIC order — corroborated
-- first, more independent sources, higher novelty (none last), the later as-of day, the older nomination — each place with its key and
-- explanation. Recorded; no signal changes; no weighted score.
CREATE OR REPLACE FUNCTION prediction.rank_signals(p_tenant uuid, p_domain uuid, p_run_id uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_kind text; v_id uuid := gen_random_uuid(); v_order jsonb;
        v_rule text := 'lexicographic: corroborated before tentative; more independent sources; higher novelty (a signal with no novelty measure after one with); the later as-of day; the older nomination — no weighted score';
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.signal.rank']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'signal rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  v_kind := prediction.signal_actor_kind(p_tenant, p_domain, p_actor);
  IF v_kind = 'none' THEN RAISE EXCEPTION 'signal rejected: the signals are ranked by a named human or by the domain''s active Weak Signal Agent' USING ERRCODE = '42501'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('position', rn, 'signal_id', signal_id, 'version', version, 'title', title,
            'key', jsonb_build_array(maturity, independent_sources, novelty, as_of),
            'explanation', format('%s · %s independent source(s) · novelty %s · as of %s', maturity, independent_sources, coalesce(novelty::text, 'no input'), coalesce(as_of::text, '—'))) ORDER BY rn), '[]'::jsonb)
    INTO v_order FROM (
      SELECT s.*, row_number() OVER (ORDER BY (s.maturity = 'corroborated') DESC, s.independent_sources DESC, s.novelty DESC NULLS LAST, s.as_of DESC NULLS LAST, s.created_at, s.signal_id) rn
        FROM prediction.signals_current s WHERE s.tenant_id = p_tenant AND s.domain_id = p_domain AND s.maturity <> 'invalid' AND s.disposition IS DISTINCT FROM 'dismiss') t;
  INSERT INTO prediction.signal_rankings (ranking_id, scope, tenant_id, domain_id, ranked_by, ranker_kind, run_id, ordering, rule, correlation_id)
  VALUES (v_id, 'DOMAIN', p_tenant, p_domain, p_actor, CASE WHEN v_kind = 'agent' THEN 'agent' ELSE 'analyst' END, p_run_id, v_order, v_rule, p_correlation);
  RETURN jsonb_build_object('ranking_id', v_id, 'ranker_kind', CASE WHEN v_kind = 'agent' THEN 'agent' ELSE 'analyst' END, 'ordering', v_order, 'rule', v_rule);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.rank_signals(uuid,uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.rank_signals(uuid,uuid,uuid,uuid,uuid) TO eye_commit;


-- ============================================================
-- §S8 THE NOVELTY INPUT (F-P6-07; the 0086 §M rule: judged only where a class sets its threshold, "no input, not judged" otherwise)
-- ============================================================
-- 0086 §0 copied whole; B28: `min_novelty` admitted (a number in [0, 1]); `require` keeps its vocabulary (novelty is not requirable).
CREATE OR REPLACE FUNCTION executive.validate_attention_rules(p_rules jsonb) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = executive, identity, pg_catalog, pg_temp AS $$
DECLARE c record; k text; r jsonb; m jsonb; s jsonb; v jsonb;
BEGIN
  IF p_rules IS NULL OR jsonb_typeof(p_rules) <> 'object' THEN RAISE EXCEPTION 'attention policy rejected: the rules are an object {classes, overload?}' USING ERRCODE = '22023'; END IF;
  FOR k IN SELECT jsonb_object_keys(p_rules) LOOP
    IF k NOT IN ('classes', 'overload') THEN RAISE EXCEPTION 'attention policy rejected: unknown key % (the rules carry classes and optionally overload)', k USING ERRCODE = '22023'; END IF;
  END LOOP;
  IF jsonb_typeof(p_rules -> 'classes') IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(p_rules -> 'classes')) = 0 THEN
    RAISE EXCEPTION 'attention policy rejected: classes is a non-empty object keyed by signal class (%)', array_to_string(executive.attention_signal_classes(), ', ') USING ERRCODE = '22023';
  END IF;
  FOR c IN SELECT key, value FROM jsonb_each(p_rules -> 'classes') LOOP
    IF NOT (c.key = ANY (executive.attention_signal_classes())) THEN RAISE EXCEPTION 'attention policy rejected: % is not a signal class (%)', c.key, array_to_string(executive.attention_signal_classes(), ', ') USING ERRCODE = '22023'; END IF;
    r := c.value;
    IF jsonb_typeof(r) <> 'object' THEN RAISE EXCEPTION 'attention policy rejected: class % is an object', c.key USING ERRCODE = '22023'; END IF;
    FOR k IN SELECT jsonb_object_keys(r) LOOP
      IF k NOT IN ('materiality', 'route_roles', 'ack_within_minutes', 'escalate_to_roles', 'max_escalations', 'suppression', 'notify') THEN
        RAISE EXCEPTION 'attention policy rejected: class % carries the unknown key %', c.key, k USING ERRCODE = '22023';
      END IF;
    END LOOP;
    m := r -> 'materiality';
    IF jsonb_typeof(m) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'attention policy rejected: class % needs materiality {min_consequence, min_confidence, max_hours_to_window?}', c.key USING ERRCODE = '22023'; END IF;
    FOR k IN SELECT jsonb_object_keys(m) LOOP
      IF k NOT IN ('min_consequence', 'min_confidence', 'max_hours_to_window',
                   'min_probability', 'min_exposure', 'min_strategic_relevance', 'min_information_value', 'min_irreversibility', 'require',
                   /* B28 (0088 §S8) */ 'min_novelty') THEN
        RAISE EXCEPTION 'attention policy rejected: class % materiality carries the unknown key %', c.key, k USING ERRCODE = '22023';
      END IF;
    END LOOP;
    -- B24 (0086 §0): the five further dimensions (V00-T-069, V03-T-262) — each judged only when its class sets a threshold
    FOR k IN SELECT unnest(ARRAY['min_probability', 'min_strategic_relevance', 'min_information_value', /* B28 (0088 §S8) */ 'min_novelty']) LOOP
      IF m ? k AND (jsonb_typeof(m -> k) <> 'number' OR (m ->> k)::numeric < 0 OR (m ->> k)::numeric > 1) THEN
        RAISE EXCEPTION 'attention policy rejected: class % materiality.% is a number in [0, 1]', c.key, k USING ERRCODE = '22023';
      END IF;
    END LOOP;
    IF m ? 'min_exposure' AND (jsonb_typeof(m -> 'min_exposure') <> 'number' OR (m ->> 'min_exposure')::numeric < 0) THEN
      RAISE EXCEPTION 'attention policy rejected: class % materiality.min_exposure is a number ≥ 0 (the count of dependent products)', c.key USING ERRCODE = '22023';
    END IF;
    IF m ? 'min_irreversibility' AND coalesce(m ->> 'min_irreversibility', '') NOT IN ('reversible', 'costly', 'irreversible') THEN
      RAISE EXCEPTION 'attention policy rejected: class % materiality.min_irreversibility is reversible | costly | irreversible', c.key USING ERRCODE = '22023';
    END IF;
    IF m ? 'require' AND (jsonb_typeof(m -> 'require') <> 'array' OR EXISTS (SELECT 1 FROM jsonb_array_elements(m -> 'require') e
         WHERE jsonb_typeof(e) <> 'string' OR (e #>> '{}') NOT IN ('probability', 'exposure', 'strategic_relevance', 'information_value', 'irreversibility'))) THEN
      RAISE EXCEPTION 'attention policy rejected: class % materiality.require lists dimensions among probability, exposure, strategic_relevance, information_value, irreversibility', c.key USING ERRCODE = '22023';
    END IF;
    IF coalesce(m ->> 'min_consequence', '') NOT IN ('C0', 'C1', 'C2', 'C3', 'C4') THEN RAISE EXCEPTION 'attention policy rejected: class % materiality.min_consequence is C0..C4', c.key USING ERRCODE = '22023'; END IF;
    IF jsonb_typeof(m -> 'min_confidence') IS DISTINCT FROM 'number' OR (m ->> 'min_confidence')::numeric < 0 OR (m ->> 'min_confidence')::numeric > 1 THEN
      RAISE EXCEPTION 'attention policy rejected: class % materiality.min_confidence is a number in [0, 1]', c.key USING ERRCODE = '22023';
    END IF;
    IF m ? 'max_hours_to_window' AND jsonb_typeof(m -> 'max_hours_to_window') <> 'null'
       AND (jsonb_typeof(m -> 'max_hours_to_window') <> 'number' OR (m ->> 'max_hours_to_window')::numeric <= 0) THEN
      RAISE EXCEPTION 'attention policy rejected: class % materiality.max_hours_to_window is a positive number or null', c.key USING ERRCODE = '22023';
    END IF;
    FOR k IN SELECT unnest(ARRAY['route_roles', 'escalate_to_roles']) LOOP
      v := r -> k;
      IF k = 'route_roles' AND (jsonb_typeof(v) IS DISTINCT FROM 'array' OR jsonb_array_length(v) = 0) THEN RAISE EXCEPTION 'attention policy rejected: class % route_roles is a non-empty list of roles', c.key USING ERRCODE = '22023'; END IF;
      IF v IS NOT NULL AND jsonb_typeof(v) <> 'array' THEN RAISE EXCEPTION 'attention policy rejected: class % % is a list of roles', c.key, k USING ERRCODE = '22023'; END IF;
      IF v IS NOT NULL AND EXISTS (SELECT 1 FROM jsonb_array_elements(v) e WHERE jsonb_typeof(e) <> 'string' OR NOT EXISTS (SELECT 1 FROM identity.roles x WHERE x.code = e #>> '{}' AND x.code NOT LIKE '%\_subscriber' AND x.code NOT LIKE '%\_agent')) THEN
        RAISE EXCEPTION 'attention policy rejected: class % % names a role that is not a human role of this product', c.key, k USING ERRCODE = '22023';
      END IF;
    END LOOP;
    IF jsonb_typeof(r -> 'ack_within_minutes') IS DISTINCT FROM 'number' OR (r ->> 'ack_within_minutes')::numeric <> trunc((r ->> 'ack_within_minutes')::numeric)
       OR (r ->> 'ack_within_minutes')::numeric < 1 OR (r ->> 'ack_within_minutes')::numeric > 10080 THEN
      RAISE EXCEPTION 'attention policy rejected: class % ack_within_minutes is a whole number in [1, 10080]', c.key USING ERRCODE = '22023';
    END IF;
    IF r ? 'max_escalations' AND (jsonb_typeof(r -> 'max_escalations') <> 'number' OR (r ->> 'max_escalations')::numeric NOT IN (0, 1, 2, 3, 4, 5)) THEN
      RAISE EXCEPTION 'attention policy rejected: class % max_escalations is 0..5', c.key USING ERRCODE = '22023';
    END IF;
    IF coalesce((r ->> 'max_escalations')::int, 0) > 0 AND (r -> 'escalate_to_roles' IS NULL OR jsonb_array_length(r -> 'escalate_to_roles') = 0) THEN
      RAISE EXCEPTION 'attention policy rejected: class % escalates (max_escalations > 0) to nobody; name escalate_to_roles', c.key USING ERRCODE = '22023';
    END IF;
    s := r -> 'suppression';
    IF s IS NOT NULL THEN
      IF jsonb_typeof(s) <> 'object' OR jsonb_typeof(s -> 'allowed') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'attention policy rejected: class % suppression is {allowed, max_hours}', c.key USING ERRCODE = '22023'; END IF;
      IF (s ->> 'allowed')::boolean AND (jsonb_typeof(s -> 'max_hours') IS DISTINCT FROM 'number' OR (s ->> 'max_hours')::numeric < 1 OR (s ->> 'max_hours')::numeric > 720) THEN
        RAISE EXCEPTION 'attention policy rejected: class % suppression.max_hours is in [1, 720] when suppression is allowed', c.key USING ERRCODE = '22023';
      END IF;
      -- B24 (0086 §0): a suppression may need a second person's approval (V03-T-263, V03-T-171)
      FOR k IN SELECT jsonb_object_keys(s) LOOP
        IF k NOT IN ('allowed', 'max_hours', 'approval_required', 'approver_roles') THEN RAISE EXCEPTION 'attention policy rejected: class % suppression carries the unknown key %', c.key, k USING ERRCODE = '22023'; END IF;
      END LOOP;
      IF s ? 'approval_required' AND jsonb_typeof(s -> 'approval_required') <> 'boolean' THEN RAISE EXCEPTION 'attention policy rejected: class % suppression.approval_required is a boolean', c.key USING ERRCODE = '22023'; END IF;
      IF coalesce((s ->> 'approval_required')::boolean, false) AND (jsonb_typeof(s -> 'approver_roles') IS DISTINCT FROM 'array' OR jsonb_array_length(s -> 'approver_roles') = 0
         OR EXISTS (SELECT 1 FROM jsonb_array_elements(s -> 'approver_roles') e WHERE jsonb_typeof(e) <> 'string'
                     OR NOT EXISTS (SELECT 1 FROM identity.roles x WHERE x.code = e #>> '{}' AND x.code NOT LIKE '%\_subscriber' AND x.code NOT LIKE '%\_agent'))) THEN
        RAISE EXCEPTION 'attention policy rejected: class % suppression.approver_roles is a non-empty list of human roles when approval is required', c.key USING ERRCODE = '22023';
      END IF;
    END IF;
    -- B24 (0086 §0): notify is 'in_app' (as before) or {channels, max_attempts} over the channels this product has — in_app and the
    -- SYNTHETIC demo-mailbox; a real provider channel (email, sms, teams, push) needs a delivery provider (owner decision D6)
    IF r ? 'notify' THEN
      v := r -> 'notify';
      IF jsonb_typeof(v) = 'string' THEN
        IF v #>> '{}' <> 'in_app' THEN
          RAISE EXCEPTION 'attention policy rejected: class % notify is in_app or {channels, max_attempts}; % needs a delivery provider (owner decision D6)', c.key, v #>> '{}' USING ERRCODE = '22023';
        END IF;
      ELSIF jsonb_typeof(v) = 'object' THEN
        FOR k IN SELECT jsonb_object_keys(v) LOOP
          IF k NOT IN ('channels', 'max_attempts') THEN RAISE EXCEPTION 'attention policy rejected: class % notify carries the unknown key %', c.key, k USING ERRCODE = '22023'; END IF;
        END LOOP;
        IF jsonb_typeof(v -> 'channels') IS DISTINCT FROM 'array' OR jsonb_array_length(v -> 'channels') = 0 THEN
          RAISE EXCEPTION 'attention policy rejected: class % notify.channels is a non-empty list', c.key USING ERRCODE = '22023';
        END IF;
        IF EXISTS (SELECT 1 FROM jsonb_array_elements(v -> 'channels') e WHERE jsonb_typeof(e) <> 'string' OR (e #>> '{}') NOT IN ('in_app', 'demo-mailbox')) THEN
          RAISE EXCEPTION 'attention policy rejected: class % notify.channels are in_app and demo-mailbox (synthetic); % needs a delivery provider (owner decision D6)', c.key,
            (SELECT string_agg(e #>> '{}', ', ') FROM jsonb_array_elements(v -> 'channels') e WHERE (e #>> '{}') NOT IN ('in_app', 'demo-mailbox')) USING ERRCODE = '22023';
        END IF;
        IF v ? 'max_attempts' AND (jsonb_typeof(v -> 'max_attempts') <> 'number' OR (v ->> 'max_attempts')::numeric NOT IN (1, 2, 3, 4, 5)) THEN
          RAISE EXCEPTION 'attention policy rejected: class % notify.max_attempts is 1..5', c.key USING ERRCODE = '22023';
        END IF;
      ELSE
        RAISE EXCEPTION 'attention policy rejected: class % notify is in_app or {channels, max_attempts}', c.key USING ERRCODE = '22023';
      END IF;
    END IF;
  END LOOP;
  -- B24 (0086 §0): overload is the legacy {max_open_per_role} (stored versions are immutable) or the enforced
  -- {max_open_per_owner, window_hours, exempt_min_consequence} (PR-44-005: a C3/C4 item is never deprioritized for overload)
  IF p_rules ? 'overload' THEN
    v := p_rules -> 'overload';
    IF jsonb_typeof(v) <> 'object' THEN RAISE EXCEPTION 'attention policy rejected: overload is {max_open_per_role ≥ 1}' USING ERRCODE = '22023'; END IF;
    FOR k IN SELECT jsonb_object_keys(v) LOOP
      IF k NOT IN ('max_open_per_role', 'max_open_per_owner', 'window_hours', 'exempt_min_consequence') THEN
        RAISE EXCEPTION 'attention policy rejected: overload carries the unknown key % (max_open_per_owner, window_hours, exempt_min_consequence; or the legacy max_open_per_role)', k USING ERRCODE = '22023';
      END IF;
    END LOOP;
    IF v ? 'max_open_per_role' AND (jsonb_typeof(v -> 'max_open_per_role') <> 'number' OR (v ->> 'max_open_per_role')::numeric < 1) THEN
      RAISE EXCEPTION 'attention policy rejected: overload is {max_open_per_role ≥ 1}' USING ERRCODE = '22023';
    END IF;
    IF NOT (v ? 'max_open_per_role') AND NOT (v ? 'max_open_per_owner') THEN
      RAISE EXCEPTION 'attention policy rejected: overload is {max_open_per_role ≥ 1}' USING ERRCODE = '22023';
    END IF;
    IF v ? 'max_open_per_owner' AND (jsonb_typeof(v -> 'max_open_per_owner') <> 'number' OR (v ->> 'max_open_per_owner')::numeric < 1 OR (v ->> 'max_open_per_owner')::numeric <> trunc((v ->> 'max_open_per_owner')::numeric)) THEN
      RAISE EXCEPTION 'attention policy rejected: overload.max_open_per_owner is a whole number ≥ 1' USING ERRCODE = '22023';
    END IF;
    IF v ? 'window_hours' AND (jsonb_typeof(v -> 'window_hours') <> 'number' OR (v ->> 'window_hours')::numeric < 1 OR (v ->> 'window_hours')::numeric > 720) THEN
      RAISE EXCEPTION 'attention policy rejected: overload.window_hours is in [1, 720]' USING ERRCODE = '22023';
    END IF;
    IF v ? 'exempt_min_consequence' AND coalesce(v ->> 'exempt_min_consequence', '') NOT IN ('C1', 'C2', 'C3', 'C4') THEN
      RAISE EXCEPTION 'attention policy rejected: overload.exempt_min_consequence is C1..C4 (C3 and C4 items are never deprioritized for overload whatever it says)' USING ERRCODE = '22023';
    END IF;
  END IF;
END $$;
REVOKE ALL ON FUNCTION executive.validate_attention_rules(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.validate_attention_rules(jsonb) TO eye_commit;

-- 0086 §M3 copied whole (same signature, IMMUTABLE); B28: novelty the sixth further dimension, judged last, only where min_novelty is set.
CREATE OR REPLACE FUNCTION executive.evaluate_attention(p_rules jsonb, p_class text, p_dims jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE r jsonb := p_rules #> ARRAY['classes', p_class]; m jsonb; v_reasons jsonb := '[]'::jsonb; v_ok boolean := true;
        v_cons int; v_min int; v_conf numeric; v_hours numeric; v_max numeric;
        -- B24 (0086 §M)
        v_rank jsonb := executive.attention_rank(p_dims); d record; v_req boolean; v_num numeric; v_txt text; v_missing text[] := '{}';
        v_ord text[] := ARRAY['reversible', 'costly', 'irreversible'];
BEGIN
  IF p_rules IS NULL THEN
    RETURN jsonb_build_object('outcome', 'abstained', 'reasons', jsonb_build_array('no attention policy is published for this domain'), 'dimensions', p_dims, 'thresholds', NULL, 'rank', v_rank);
  END IF;
  IF r IS NULL THEN
    RETURN jsonb_build_object('outcome', 'abstained', 'reasons', jsonb_build_array(format('the policy has no rule for the class %s', p_class)), 'dimensions', p_dims, 'thresholds', NULL, 'rank', v_rank);
  END IF;
  m := r -> 'materiality';
  v_cons := CASE WHEN p_dims ->> 'consequence' ~ '^C[0-4]$' THEN substr(p_dims ->> 'consequence', 2)::int ELSE NULL END;
  v_min := substr(m ->> 'min_consequence', 2)::int;
  IF v_cons IS NULL THEN
    RETURN jsonb_build_object('outcome', 'abstained', 'reasons', jsonb_build_array('the signal carries no consequence class to judge'), 'dimensions', p_dims, 'thresholds', m, 'rank', v_rank);
  END IF;
  IF v_cons < v_min THEN v_ok := false; v_reasons := v_reasons || to_jsonb(format('consequence C%s below the threshold %s', v_cons, m ->> 'min_consequence'));
  ELSE v_reasons := v_reasons || to_jsonb(format('consequence C%s at or above %s', v_cons, m ->> 'min_consequence')); END IF;
  v_conf := CASE WHEN jsonb_typeof(p_dims -> 'confidence') = 'number' THEN (p_dims ->> 'confidence')::numeric ELSE NULL END;
  IF v_conf IS NULL THEN
    RETURN jsonb_build_object('outcome', 'abstained', 'reasons', v_reasons || to_jsonb('the signal carries no confidence to judge'::text), 'dimensions', p_dims, 'thresholds', m, 'rank', v_rank);
  END IF;
  IF v_conf < (m ->> 'min_confidence')::numeric THEN v_ok := false; v_reasons := v_reasons || to_jsonb(format('confidence %s below the threshold %s', v_conf, m ->> 'min_confidence'));
  ELSE v_reasons := v_reasons || to_jsonb(format('confidence %s at or above %s', v_conf, m ->> 'min_confidence')); END IF;
  v_max := CASE WHEN jsonb_typeof(m -> 'max_hours_to_window') = 'number' THEN (m ->> 'max_hours_to_window')::numeric ELSE NULL END;
  IF v_max IS NOT NULL THEN
    v_hours := CASE WHEN jsonb_typeof(p_dims -> 'hours_to_window') = 'number' THEN (p_dims ->> 'hours_to_window')::numeric ELSE NULL END;
    IF v_hours IS NULL THEN v_reasons := v_reasons || to_jsonb('no response window: the window threshold does not apply'::text);
    ELSIF v_hours > v_max THEN v_ok := false; v_reasons := v_reasons || to_jsonb(format('%s hours to the response window, beyond %s', round(v_hours, 1), v_max));
    ELSE v_reasons := v_reasons || to_jsonb(format('%s hours to the response window, within %s', round(v_hours, 1), v_max)); END IF;
  END IF;
  -- B24 (0086 §M): the five further dimensions, in this fixed order, each judged ONLY when its class sets its threshold (a class that
  -- sets none leaves every B22 reason exactly as it was); a threshold on a dimension with no input is said, not guessed; a REQUIRED
  -- dimension with no input makes the engine abstain.
  FOR d IN SELECT * FROM (VALUES (1, 'probability', 'min_probability'), (2, 'exposure', 'min_exposure'), (3, 'strategic_relevance', 'min_strategic_relevance'),
                                 (4, 'information_value', 'min_information_value'), (5, 'irreversibility', 'min_irreversibility'),
                                 /* B28 (0088 §S8): novelty, a number in [0, 1] */ (6, 'novelty', 'min_novelty')) AS t(n, dim, key) ORDER BY n LOOP
    v_req := coalesce(jsonb_typeof(m -> 'require') = 'array' AND (m -> 'require') ? d.dim, false);
    IF NOT (m ? d.key) AND NOT v_req THEN CONTINUE; END IF;
    IF d.dim = 'irreversibility' THEN
      v_txt := CASE WHEN (p_dims ->> 'irreversibility') = ANY (v_ord) THEN p_dims ->> 'irreversibility' ELSE NULL END;
      IF v_txt IS NULL THEN
        IF m ? d.key OR v_req THEN v_reasons := v_reasons || to_jsonb(format('%s: no input, not judged', d.dim)); END IF;
        IF v_req THEN v_missing := v_missing || d.dim; END IF;
        CONTINUE;
      END IF;
      IF NOT (m ? d.key) THEN CONTINUE; END IF;
      IF array_position(v_ord, v_txt) < array_position(v_ord, m ->> d.key) THEN
        v_ok := false; v_reasons := v_reasons || to_jsonb(format('irreversibility %s below the threshold %s', v_txt, m ->> d.key));
      ELSE v_reasons := v_reasons || to_jsonb(format('irreversibility %s at or above %s', v_txt, m ->> d.key)); END IF;
    ELSE
      v_num := CASE WHEN jsonb_typeof(p_dims -> d.dim) = 'number' THEN (p_dims ->> d.dim)::numeric ELSE NULL END;
      IF v_num IS NULL THEN
        v_reasons := v_reasons || to_jsonb(format('%s: no input, not judged', d.dim));
        IF v_req THEN v_missing := v_missing || d.dim; END IF;
        CONTINUE;
      END IF;
      IF NOT (m ? d.key) THEN CONTINUE; END IF;
      IF v_num < (m ->> d.key)::numeric THEN
        v_ok := false; v_reasons := v_reasons || to_jsonb(format('%s %s below the threshold %s', d.dim, v_num, m ->> d.key));
      ELSE v_reasons := v_reasons || to_jsonb(format('%s %s at or above %s', d.dim, v_num, m ->> d.key)); END IF;
    END IF;
  END LOOP;
  IF cardinality(v_missing) > 0 THEN
    RETURN jsonb_build_object('outcome', 'abstained', 'reasons', v_reasons || to_jsonb(format('abstained: the class requires %s, which the signal does not carry', array_to_string(v_missing, ', '))),
                              'dimensions', p_dims, 'thresholds', m, 'rank', v_rank);
  END IF;
  RETURN jsonb_build_object('outcome', CASE WHEN v_ok THEN 'material' ELSE 'below_threshold' END, 'reasons', v_reasons, 'dimensions', p_dims, 'thresholds', m, 'rank', v_rank);
END $$;
GRANT EXECUTE ON FUNCTION executive.evaluate_attention(jsonb, text, jsonb) TO eye_app, eye_commit;

-- 0086 §M4 copied whole; B28: the novelty input (the block before the answer) — every other line unchanged.
CREATE OR REPLACE FUNCTION executive.attention_dimensions(p_tenant uuid, p_domain uuid, p_class text, p_subject_id uuid, p_hint jsonb DEFAULT '{}'::jsonb) RETURNS jsonb
STABLE SECURITY DEFINER SET search_path = executive, decision, graph, prediction, simulation, observation, public, pg_catalog, pg_temp AS $$
DECLARE v_at timestamptz := clock_timestamp(); out jsonb := jsonb_build_object('probability', NULL, 'exposure', NULL, 'strategic_relevance', NULL, 'information_value', NULL, 'irreversibility', NULL);
        basis jsonb := '{}'::jsonb; v_pkg record; v_ver record; v_version int; v_rel jsonb; v_n int; v_m int; v_best jsonb; v_w record; v_f record; v_i record;
        v_q10 numeric; v_q50 numeric; v_q90 numeric; v_lo numeric; v_hi numeric; v_below boolean; v_rv record; v_iv text;
        /* B28 (0088 §S8) */ v_nov numeric; v_nbasis jsonb; v_nw record; v_nd record;
BEGIN
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_class = 'decision.material_change' THEN
    SELECT p.package_id, p.decision_object_id, p.current_version INTO v_pkg FROM decision.packages_current p WHERE p.package_id = p_subject_id AND p.tenant_id = p_tenant AND p.domain_id = p_domain;
    v_version := CASE WHEN jsonb_typeof(p_hint -> 'version') = 'number' THEN (p_hint ->> 'version')::int ELSE v_pkg.current_version END;
    SELECT v.reversibility, v.information_value INTO v_ver FROM decision.package_versions v WHERE v.package_id = p_subject_id AND v.version = v_version AND v.tenant_id = p_tenant AND v.domain_id = p_domain;
    IF v_pkg.package_id IS NULL OR v_version IS NULL OR NOT FOUND THEN
      RETURN out || jsonb_build_object('dimension_basis', jsonb_build_object('note', 'no package version to read: every further dimension has no input'));
    END IF;
    v_iv := executive.normalise_information_value(v_ver.information_value);
    out := out || jsonb_build_object('irreversibility', executive.normalise_reversibility(v_ver.reversibility), 'information_value', executive.information_value_point(v_iv));
    v_rel := executive.package_strategic_relevance(p_tenant, p_domain, p_subject_id, v_version);
    out := out || jsonb_build_object('strategic_relevance', v_rel -> 'score');
    -- EXPOSURE: the objects resting on the decision — its commitment and every active graph dependent of the DEC (counted once).
    SELECT count(DISTINCT x) INTO v_n FROM (
      SELECT c.commitment_id AS x FROM decision.commitments c WHERE c.package_id = p_subject_id AND c.tenant_id = p_tenant AND c.domain_id = p_domain
      UNION SELECT g.dependent_object_id FROM graph.dependencies g WHERE g.tenant_id = p_tenant AND g.domain_id = p_domain AND g.state = 'active' AND g.depends_on_kind = 'strategy' AND g.depends_on_id = v_pkg.decision_object_id) s;
    out := out || jsonb_build_object('exposure', v_n);
    basis := jsonb_build_object('version', v_version, 'reversibility_text', v_ver.reversibility, 'information_value_text', v_ver.information_value, 'information_value_word', v_iv,
      'strategic_relevance', v_rel, 'exposure', 'the commitment and the objects resting on the decision in the strategy graph', 'probability', 'no input: a material change carries no probability');
  ELSIF p_class = 'forecast.unfit' THEN
    -- the attention consumer's own count (attention.consumers.ts: the live scenarios on the forecast, the packages whose options cite it)
    SELECT count(*) INTO v_n FROM prediction.scenarios_current s WHERE s.tenant_id = p_tenant AND s.domain_id = p_domain AND s.forecast_id = p_subject_id AND s.state <> 'retired';
    SELECT count(DISTINCT o.package_id) INTO v_m FROM decision.options o
     WHERE o.tenant_id = p_tenant AND o.domain_id = p_domain AND EXISTS (SELECT 1 FROM jsonb_array_elements(o.consequences) c WHERE c ->> 'id' = p_subject_id::text);
    SELECT r2 INTO v_best FROM (
      SELECT executive.package_strategic_relevance(p_tenant, p_domain, p.package_id, p.current_version) AS r2
        FROM decision.packages_current p
       WHERE p.tenant_id = p_tenant AND p.domain_id = p_domain AND p.current_version IS NOT NULL
         AND p.package_id IN (SELECT o.package_id FROM decision.options o WHERE o.tenant_id = p_tenant AND o.domain_id = p_domain
                                AND EXISTS (SELECT 1 FROM jsonb_array_elements(o.consequences) c WHERE c ->> 'id' = p_subject_id::text))) t
     WHERE r2 IS NOT NULL ORDER BY (r2 ->> 'score')::numeric DESC, r2 ->> 'package_id' LIMIT 1;
    out := out || jsonb_build_object('exposure', v_n + v_m, 'strategic_relevance', v_best -> 'score');
    basis := jsonb_build_object('exposure', jsonb_build_object('scenarios', v_n, 'citing_packages', v_m),
      'strategic_relevance', coalesce(v_best, to_jsonb('no input: no package cites the forecast'::text)));
  ELSIF p_class = 'scenario.incoherent' THEN
    SELECT count(*) INTO v_n FROM simulation.runs_current r WHERE r.tenant_id = p_tenant AND r.domain_id = p_domain AND r.scenario_id = p_subject_id;
    SELECT count(DISTINCT o.package_id) INTO v_m FROM decision.options o
     WHERE o.tenant_id = p_tenant AND o.domain_id = p_domain AND EXISTS (SELECT 1 FROM jsonb_array_elements(o.consequences) c
             WHERE c ->> 'id' IN (SELECT r.run_id::text FROM simulation.runs_current r WHERE r.tenant_id = p_tenant AND r.domain_id = p_domain AND r.scenario_id = p_subject_id));
    out := out || jsonb_build_object('exposure', v_n + v_m);
    basis := jsonb_build_object('exposure', jsonb_build_object('runs', v_n, 'packages_citing_the_runs', v_m));
  ELSIF p_class = 'warning.raised' THEN
    SELECT w.warning_id, w.forecast_id, w.indicator_id, w.branch_id, w.response_window_closes_at INTO v_w
      FROM prediction.warnings_current w WHERE w.warning_id = p_subject_id AND w.tenant_id = p_tenant AND w.domain_id = p_domain;
    IF v_w.warning_id IS NULL THEN RETURN out || jsonb_build_object('dimension_basis', jsonb_build_object('note', 'no such warning: every further dimension has no input')); END IF;
    out := out || jsonb_build_object('hours_to_window', round((extract(epoch FROM (v_w.response_window_closes_at - v_at)) / 3600)::numeric, 1));
    SELECT f.forecast_id, f.series_key, f.quantiles INTO v_f FROM prediction.forecasts_current f
     WHERE f.tenant_id = p_tenant AND f.domain_id = p_domain
       AND f.forecast_id = coalesce(v_w.forecast_id, (SELECT s.forecast_id FROM prediction.branches_current b JOIN prediction.scenarios_current s USING (scenario_id) WHERE b.branch_id = v_w.branch_id));
    SELECT i.indicator_id, i.series_key, i.comparator, i.threshold INTO v_i FROM prediction.indicators_current i
     WHERE i.tenant_id = p_tenant AND i.domain_id = p_domain
       AND i.indicator_id = coalesce(v_w.indicator_id, (SELECT b.indicator_id FROM prediction.branches_current b WHERE b.branch_id = v_w.branch_id));
    IF v_f.forecast_id IS NULL OR v_i.indicator_id IS NULL THEN
      basis := jsonb_build_object('probability', format('no input: the warning names no %s', CASE WHEN v_f.forecast_id IS NULL THEN 'forecast' ELSE 'indicator' END));
    ELSIF v_f.series_key IS DISTINCT FROM v_i.series_key THEN
      basis := jsonb_build_object('probability', format('no input: the forecast is on %s, the indicator on %s', v_f.series_key, v_i.series_key));
    ELSE
      v_q10 := (v_f.quantiles ->> 'q10')::numeric; v_q50 := (v_f.quantiles ->> 'q50')::numeric; v_q90 := (v_f.quantiles ->> 'q90')::numeric;
      -- THE BRACKET: the probability that the forecast value is on the indicator's side of the threshold, read from where the threshold
      -- falls among the forecast's quantiles — [0.9, 1], [0.5, 0.9], [0.1, 0.5] or [0, 0.1]; the LOWER bound is the number judged.
      v_below := v_i.comparator IN ('<', '<=');
      IF v_below THEN
        IF (v_i.comparator = '<' AND v_i.threshold > v_q90) OR (v_i.comparator = '<=' AND v_i.threshold >= v_q90) THEN v_lo := 0.9; v_hi := 1;
        ELSIF (v_i.comparator = '<' AND v_i.threshold > v_q50) OR (v_i.comparator = '<=' AND v_i.threshold >= v_q50) THEN v_lo := 0.5; v_hi := 0.9;
        ELSIF (v_i.comparator = '<' AND v_i.threshold > v_q10) OR (v_i.comparator = '<=' AND v_i.threshold >= v_q10) THEN v_lo := 0.1; v_hi := 0.5;
        ELSE v_lo := 0; v_hi := 0.1; END IF;
      ELSE
        IF (v_i.comparator = '>' AND v_i.threshold < v_q10) OR (v_i.comparator = '>=' AND v_i.threshold <= v_q10) THEN v_lo := 0.9; v_hi := 1;
        ELSIF (v_i.comparator = '>' AND v_i.threshold < v_q50) OR (v_i.comparator = '>=' AND v_i.threshold <= v_q50) THEN v_lo := 0.5; v_hi := 0.9;
        ELSIF (v_i.comparator = '>' AND v_i.threshold < v_q90) OR (v_i.comparator = '>=' AND v_i.threshold <= v_q90) THEN v_lo := 0.1; v_hi := 0.5;
        ELSE v_lo := 0; v_hi := 0.1; END IF;
      END IF;
      out := out || jsonb_build_object('probability', v_lo);
      basis := jsonb_build_object('probability', jsonb_build_object('bracket', jsonb_build_array(v_lo, v_hi), 'judged', 'the lower bound',
        'forecast_id', v_f.forecast_id, 'indicator_id', v_i.indicator_id, 'comparator', v_i.comparator, 'threshold', v_i.threshold,
        'quantiles', jsonb_build_object('q10', v_q10, 'q50', v_q50, 'q90', v_q90),
        'reading', format('P(value %s %s) lies in [%s, %s] from the forecast''s quantiles at its target date; the indicator''s consecutive-day condition is not modelled', v_i.comparator, v_i.threshold, v_lo, v_hi)));
    END IF;
    basis := basis || jsonb_build_object('hours_to_window', 'the response window''s close against the database clock');
  ELSIF p_class = 'source.coverage_loss' THEN
    SELECT count(*) INTO v_n FROM observation.source_impact_markers k WHERE k.tenant_id = p_tenant AND k.domain_id = p_domain AND k.source_id = p_subject_id AND k.state = 'active';
    out := out || jsonb_build_object('exposure', v_n);
    basis := jsonb_build_object('exposure', 'the source''s active impact markers (issued forecasts, open warnings, citing packages)');
  ELSIF p_class = 'review.convened' THEN
    SELECT r.review_id, r.subject_kind, r.subject_id, r.due_at INTO v_rv FROM executive.reviews r WHERE r.review_id = p_subject_id AND r.tenant_id = p_tenant AND r.domain_id = p_domain;
    IF v_rv.review_id IS NULL THEN RETURN out || jsonb_build_object('dimension_basis', jsonb_build_object('note', 'no such review: every further dimension has no input')); END IF;
    out := out || jsonb_build_object('hours_to_window', CASE WHEN v_rv.due_at IS NULL THEN NULL ELSE round((extract(epoch FROM (v_rv.due_at - v_at)) / 3600)::numeric, 1) END);
    IF v_rv.subject_kind = 'objective' THEN
      out := out || jsonb_build_object('strategic_relevance', CASE WHEN EXISTS (SELECT 1 FROM graph.strategy_current s WHERE s.strategy_object_id = v_rv.subject_id AND s.object_type = 'OBJ' AND s.status = 'active') THEN 1 ELSE 0 END);
      basis := jsonb_build_object('strategic_relevance', 'the review''s subject is an objective (1 while it is active)');
    ELSE
      basis := jsonb_build_object('strategic_relevance', format('no input: the review''s subject is a %s', v_rv.subject_kind));
    END IF;
    basis := basis || jsonb_build_object('hours_to_window', 'the review''s due instant against the database clock');
  ELSE
    basis := jsonb_build_object('note', format('no further input exists for %s', p_class));
  END IF;
  -- B28 (0088 §S8): NOVELTY (V00-T-069; F-P4-10's detector) — a number in [0, 1]: the share of the baseline's own deviations the observed
  -- window's deviation exceeds. A warning escalated from a weak signal carries that signal's novelty; a warning on an indicator carries the
  -- indicator's LATEST novelty reading (a held reading — too few points, a source gap, a drifting baseline — is no input); every other class
  -- has no novelty input (declared, never invented).
  IF p_class = 'warning.raised' THEN
    SELECT w.origin_kind, w.origin_ref, coalesce(w.indicator_id, (SELECT b.indicator_id FROM prediction.branches_current b WHERE b.branch_id = w.branch_id)) AS indicator_id INTO v_nw
      FROM prediction.warnings_current w WHERE w.warning_id = p_subject_id AND w.tenant_id = p_tenant AND w.domain_id = p_domain;
    IF v_nw.origin_kind = 'weak_signal' AND (v_nw.origin_ref ->> 'signal_id') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      SELECT s.signal_id, s.novelty, s.detector_key, s.as_of, s.detection_id INTO v_nd FROM prediction.signals_current s
       WHERE s.signal_id = (v_nw.origin_ref ->> 'signal_id')::uuid AND s.tenant_id = p_tenant AND s.domain_id = p_domain;
      IF v_nd.signal_id IS NOT NULL AND v_nd.novelty IS NOT NULL THEN
        v_nov := v_nd.novelty;
        v_nbasis := jsonb_build_object('source', 'the weak signal the warning was escalated from', 'signal_id', v_nd.signal_id, 'detector', v_nd.detector_key, 'detection_id', v_nd.detection_id, 'as_of', v_nd.as_of);
      ELSE
        v_nbasis := to_jsonb('no input: the weak signal the warning was escalated from carries no novelty measure (an analyst''s nomination, or another detector)'::text);
      END IF;
    ELSIF v_nw.indicator_id IS NOT NULL THEN
      SELECT d.detection_id, d.measure, d.as_of, d.held_reason, d.fired INTO v_nd FROM prediction.signal_detections d
       WHERE d.tenant_id = p_tenant AND d.domain_id = p_domain AND d.detector_key = 'novelty' AND d.subject_kind = 'indicator' AND d.subject_id = v_nw.indicator_id
       ORDER BY d.as_of DESC, d.recorded_at DESC LIMIT 1;
      IF v_nd.detection_id IS NULL THEN v_nbasis := to_jsonb('no input: the novelty detector has not read the warning''s indicator'::text);
      ELSIF v_nd.held_reason IS NOT NULL THEN v_nbasis := to_jsonb(format('no input: the latest novelty reading of the warning''s indicator (as of %s) is held — %s', v_nd.as_of, v_nd.held_reason));
      ELSE
        v_nov := v_nd.measure;
        v_nbasis := jsonb_build_object('source', 'the novelty detector''s latest reading of the warning''s indicator', 'detection_id', v_nd.detection_id, 'indicator_id', v_nw.indicator_id,
                                       'as_of', v_nd.as_of, 'fired', v_nd.fired);
      END IF;
    ELSE
      v_nbasis := to_jsonb('no input: the warning names neither a weak signal nor an indicator'::text);
    END IF;
  ELSE
    v_nbasis := to_jsonb(format('no input: no novelty detector reads a %s', p_class));
  END IF;
  out := out || jsonb_build_object('novelty', v_nov);
  basis := basis || jsonb_build_object('novelty', v_nbasis);
  RETURN out || jsonb_build_object('dimension_basis', basis);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.attention_dimensions(uuid,uuid,text,uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.attention_dimensions(uuid,uuid,text,uuid,jsonb) TO eye_commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- section `streams`
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §S (section `streams`)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0088 (part `streams`) — CP-6 B28, F-P4-11: EVENT-TIME STREAM PROCESSING AND COMPLEX EVENT RULES (DP-31-001/-002/-003/-005/-006).
-- Before this section the product had no stream processor: an indicator is evaluated on demand in a batch (0029 §6
-- prediction.evaluate_indicator, which refuses an observation dated at or before the last one it saw — the late point is
-- silently not evaluated; scenarios.service.ts evaluate). THAT BATCH PATH IS LEFT EXACTLY AS IT IS: this section adds a second,
-- event-time path beside it and touches no indicator object.
--
-- WHAT A STREAM PROCESSOR IS HERE (stated, so nothing claims more). A versioned STREAM RULE binds a registered series (its source,
-- parser, value field and selector — the selector is the stream PARTITION, e.g. PortWatch's `chokepoint4`) to a window geometry
-- (tumbling or sliding days, aligned to an origin day), a watermark lag, an allowed lateness, a stall threshold and a CEP
-- predicate — "at least `min_hits` days in the window whose value is <comparator> <threshold>". A PROCESSOR (one live per rule)
-- is fed by the `stream-rules` subscription consumer: every ObservationRecorded of the rule's source is read through a governed,
-- custody-recorded retrieval, parsed by the series' deterministic parser into (day, value) points, and ingested here as INPUTS.
--
--   * EVENT TIME, NEVER THE WALL CLOCK: the event time is the publisher's day in the evidence bytes; the WATERMARK is the highest
--     event time ingested minus the rule's lag; a window [start, end) FIRES only once watermark >= end. Arrival order is the
--     input's own sequence; the database clock (clock_timestamp()) is used ONLY for arrival instants and the stall threshold.
--   * LATENESS IS NEVER CONCEALED: every input is stored with its label — on_time, late_within_allowance (a window containing it
--     had fired: the window is REVISED and a `revised` signal labelled late_window shows how late), late_beyond_allowance (the
--     window had closed: its fired value stands, the input is counted `late_excluded` on the window and the window says so).
--     Nothing is dropped. A window over an unresolved explicit incomplete range of the source's stream (0084 §4) fires labelled
--     partial_window (completeness partial_incomplete_range); a window with fewer observed days than it spans fires
--     partial_window too (partial_missing_days) — never `complete`. The predicate answers true, false, or NULL (undetermined:
--     the missing days could decide it).
--   * DUPLICATES: the same event key (evd@version:day) with the same value is an audited no-op (a redelivery, a replay); with a
--     different value it is REFUSED (409). A framed row whose parent page this processor already ingested with the same value is
--     COVERED by the parent (recorded, not stored twice). A recomputation that yields the value of the window's latest standing
--     signal emits nothing (output.duplicate_suppressed).
--   * STATE AND CHECKPOINTS: the window state carries a digest (prediction.stream_state_digest) recorded at every write; a
--     checkpoint (append-only) holds the watermark, the input offset, the source offsets, the window snapshot and its digest,
--     the rule digest and the topology version, taken at start, every `checkpoint_every` emissions and at recovery.
--   * FAILURE SEMANTICS (DP-31-005): a digest mismatch → CORRUPT (outputs suspended; every signal emitted after the last good
--     checkpoint RETRACTED); no input for `stall_after`, or a watermark that does not move while inputs wait → STALLED (outputs
--     suspended); the source offsets reconciled against the stream's segments (0084 §3) and a divergence → SUSPENDED with the gap
--     named; RECOVERY (a named human) restores the newest COMPATIBLE checkpoint (same rule digest, same topology version, a
--     snapshot that verifies) and REPLAYS the stored inputs after it in arrival order, re-emitting only what differs from the
--     standing signals (label `recovered`); a person may RETRACT a signal. A processor that is not running stores its inputs and
--     emits nothing — its signals are never presented as current.
--   * WARNINGS: a fired or revised signal whose predicate holds SUBMITS a warning candidate through the 0088 §0 intake
--     (prediction.submit_warning_candidate, origin_kind stream_rule, origin_key processor:window_start:revision, cause_key
--     stream:<rule_key>:<partition>:<window_start>) — in the consumer's transaction (the one action the intake admits for a
--     stream, prediction.stream.subscription.apply); a signal emitted under another action (a recovery replay) is OWED and
--     submitted by the consumer's next item. A retraction submits nothing; this section raises no warning.
--
-- THE TABLES: prediction.stream_rules, stream_processors, stream_inputs (append-only), stream_windows (the state), stream_checkpoints
-- (append-only), stream_signals (append-only), stream_processor_events (append-only ledger). Object type SPR.
-- THE PORTS: define_stream_rule, activate_stream_rule (human-gated at the PDP), start_stream_processor, ingest_stream_input and
-- stream_evidence_custody (the consumer), recover_stream_processor (human-gated), reconcile_stream_offsets, retract_stream_signal
-- (human-gated), sweep_stream_processors (a step of the attention tick: executive.attention.tick).
--
-- NOT HERE (stated): no indicator object, port or evaluation is touched (the batch path and its refusal of a late point stay as
-- they are — documented, not changed); no warning is raised or clustered here (§W); no interface is added (the register stays
-- 50/0/0); no Kafka/Flink or external stream runtime — the processor is ports over PostgreSQL fed by the outbox subscription
-- (at-least-once, per-domain FIFO); event time is a DAY (the series parsers yield days); an OFFSET-ranged incomplete range (a live
-- ArcGIS offset walk) cannot be placed in event time and is reported by the offsets reconciliation only; no automatic fitness
-- assessment of a rule (a rule is superseded by a new version or retired by a person — fitness beyond versioning is declared
-- absent); no load test (DP-31-006 "load tests" stays open); candidates already submitted are not withdrawn by a retraction (the
-- lifecycle part owns warnings).

-- ============================================================
-- §S1 helpers (pure)
-- ============================================================
-- The engine's code version: a checkpoint of another topology is not compatible.
CREATE OR REPLACE FUNCTION prediction.stream_topology_version() RETURNS text
LANGUAGE sql IMMUTABLE AS $$ SELECT 'stream-topology@1.0.0'::text $$;
-- An instant as UTC text: every digest is independent of the session's TimeZone.
CREATE OR REPLACE FUNCTION prediction.stream_ts(t timestamptz) RETURNS text
LANGUAGE sql IMMUTABLE AS $$ SELECT CASE WHEN t IS NULL THEN NULL ELSE to_char(t AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') END $$;
-- A day as the instant it starts (UTC), and back.
CREATE OR REPLACE FUNCTION prediction.stream_day(d date) RETURNS timestamptz
LANGUAGE sql IMMUTABLE AS $$ SELECT (d::timestamp AT TIME ZONE 'UTC') $$;
CREATE OR REPLACE FUNCTION prediction.stream_date(t timestamptz) RETURNS date
LANGUAGE sql IMMUTABLE AS $$ SELECT (t AT TIME ZONE 'UTC')::date $$;
-- floor division on integers (negative-safe).
CREATE OR REPLACE FUNCTION prediction.stream_fdiv(a int, b int) RETURNS int
LANGUAGE sql IMMUTABLE AS $$ SELECT floor(a::numeric / b)::int $$;
-- The comparator of a predicate.
CREATE OR REPLACE FUNCTION prediction.stream_cmp(v numeric, p_cmp text, p_thr numeric) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_cmp WHEN 'lt' THEN v < p_thr WHEN 'le' THEN v <= p_thr WHEN 'gt' THEN v > p_thr WHEN 'ge' THEN v >= p_thr ELSE NULL END
$$;
-- The digest of a processor state: the watermark, the highest event time and the window snapshot (UTC text throughout).
CREATE OR REPLACE FUNCTION prediction.stream_digest(p_watermark timestamptz, p_max_event timestamptz, p_windows jsonb) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT encode(sha256(convert_to(jsonb_build_object('watermark', prediction.stream_ts(p_watermark), 'max_event_time', prediction.stream_ts(p_max_event),
                                                     'windows', coalesce(p_windows, '[]'::jsonb))::text, 'UTF8')), 'hex')
$$;

-- ============================================================
-- §S2 THE RULES (versioned; immutable once defined but for their state)
-- ============================================================
CREATE TABLE prediction.stream_rules (
  rule_id              uuid PRIMARY KEY,
  scope                text NOT NULL,
  tenant_id            uuid NOT NULL,
  domain_id            uuid NOT NULL,
  rule_key             text NOT NULL CHECK (rule_key ~ '^[a-z0-9][a-z0-9._-]{2,79}$'),
  version              int  NOT NULL CHECK (version >= 1),
  title                text NOT NULL CHECK (length(title) BETWEEN 3 AND 300),
  series_key           text NOT NULL,
  source_key           text NOT NULL,
  -- The stream partition the rule reads: the series' selector (PortWatch's portid); NULL reads every partition of the source.
  partition            text,
  window_kind          text NOT NULL CHECK (window_kind IN ('tumbling', 'sliding')),
  window_days          int  NOT NULL CHECK (window_days BETWEEN 1 AND 366),
  slide_days           int  NOT NULL CHECK (slide_days BETWEEN 1 AND 366),
  window_origin        date NOT NULL,
  allowed_lateness     interval NOT NULL CHECK (allowed_lateness >= interval '0' AND allowed_lateness <= interval '366 days'),
  watermark_lag        interval NOT NULL CHECK (watermark_lag >= interval '0' AND watermark_lag <= interval '366 days'),
  stall_after          interval NOT NULL CHECK (stall_after >= interval '1 second' AND stall_after <= interval '30 days'),
  predicate            jsonb NOT NULL CHECK (jsonb_typeof(predicate) = 'object'),
  consequence_class    text NOT NULL CHECK (consequence_class IN ('C1', 'C2', 'C3', 'C4')),
  response_window_hours int CHECK (response_window_hours IS NULL OR response_window_hours BETWEEN 1 AND 8760),
  checkpoint_every     int  NOT NULL CHECK (checkpoint_every BETWEEN 1 AND 100),
  owner_principal_id   uuid NOT NULL,
  rule_digest          text NOT NULL CHECK (rule_digest ~ '^[0-9a-f]{64}$'),
  state                text NOT NULL CHECK (state IN ('draft', 'active', 'superseded', 'retired')),
  supersedes           uuid,
  defined_by           uuid NOT NULL,
  defined_at           timestamptz NOT NULL DEFAULT clock_timestamp(),
  activated_by         uuid,
  activated_at         timestamptz,
  ended_at             timestamptz,
  state_reason         text,
  correlation_id       uuid NOT NULL,
  CONSTRAINT psr_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT psr_version UNIQUE (tenant_id, domain_id, rule_key, version),
  CONSTRAINT psr_tumbling CHECK (window_kind <> 'tumbling' OR slide_days = window_days),
  CONSTRAINT psr_sliding CHECK (window_kind <> 'sliding' OR slide_days <= window_days),
  CONSTRAINT psr_activated CHECK ((state <> 'draft' OR activated_at IS NULL) AND (state NOT IN ('active', 'superseded') OR activated_at IS NOT NULL)),
  CONSTRAINT psr_ended CHECK ((state IN ('superseded', 'retired')) = (ended_at IS NOT NULL))
);
-- ONE active version per rule key.
CREATE UNIQUE INDEX psr_one_active ON prediction.stream_rules (tenant_id, domain_id, rule_key) WHERE state = 'active';
COMMENT ON TABLE prediction.stream_rules IS 'B28 (0088 §S, F-P4-11): versioned event-time stream rules (window geometry, watermark lag, allowed lateness, stall threshold, CEP predicate) — immutable once defined but for their state';
-- The definition is frozen; only the state moves, along draft → active → superseded | retired (or draft → retired).
CREATE OR REPLACE FUNCTION prediction.stream_rule_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'append-only: DELETE prohibited on prediction.stream_rules' USING ERRCODE = '55000'; END IF;
  IF (to_jsonb(NEW) - 'state' - 'activated_by' - 'activated_at' - 'ended_at' - 'state_reason')
     IS DISTINCT FROM (to_jsonb(OLD) - 'state' - 'activated_by' - 'activated_at' - 'ended_at' - 'state_reason') THEN
    RAISE EXCEPTION 'stream rule % is immutable once defined; a change is a new version', OLD.rule_id USING ERRCODE = '55000';
  END IF;
  IF NOT ((OLD.state = 'draft' AND NEW.state IN ('draft', 'active', 'retired')) OR (OLD.state = 'active' AND NEW.state IN ('active', 'superseded', 'retired'))
          OR (OLD.state = NEW.state)) THEN
    RAISE EXCEPTION 'stream rule % cannot move from % to %', OLD.rule_id, OLD.state, NEW.state USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON prediction.stream_rules FOR EACH ROW EXECUTE FUNCTION prediction.stream_rule_immutable();

-- ============================================================
-- §S3 THE PROCESSORS (one live per rule)
-- ============================================================
CREATE TABLE prediction.stream_processors (
  processor_id          uuid PRIMARY KEY,
  scope                 text NOT NULL,
  tenant_id             uuid NOT NULL,
  domain_id             uuid NOT NULL,
  rule_id               uuid NOT NULL REFERENCES prediction.stream_rules (rule_id),
  rule_digest           text NOT NULL,
  topology_version      text NOT NULL,
  -- The processor's identity as the ledger names it: <rule_key>@v<version>/<partition>#<processor id>.
  processor_identity    text NOT NULL,
  source_id             uuid NOT NULL,
  -- '<source_key>:<partition>' (0084's stable partition key), or NULL when the rule reads every partition of the source.
  partition_key         text,
  state                 text NOT NULL CHECK (state IN ('running', 'suspended', 'stalled', 'corrupt', 'recovering', 'retired')),
  state_reason          text,
  state_since           timestamptz NOT NULL DEFAULT clock_timestamp(),
  watermark             timestamptz,
  max_event_time        timestamptz,
  -- The last input (arrival sequence) the window state reflects.
  input_seq             bigint NOT NULL DEFAULT 0,
  inputs                int NOT NULL DEFAULT 0,
  -- The segments of the partition's streams already appended when the processor started (not expected of it): {stream_id: max seq}.
  baseline              jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(baseline) = 'object'),
  source_offsets        jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(source_offsets) = 'object'),
  last_input_at         timestamptz,
  last_watermark_move_at timestamptz,
  last_checkpoint_id    uuid,
  state_digest          text NOT NULL CHECK (state_digest ~ '^[0-9a-f]{64}$'),
  started_by            uuid NOT NULL,
  started_at            timestamptz NOT NULL DEFAULT clock_timestamp(),
  retired_at            timestamptz,
  correlation_id        uuid NOT NULL,
  CONSTRAINT psp_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT psp_retired CHECK ((state = 'retired') = (retired_at IS NOT NULL))
);
CREATE UNIQUE INDEX psp_one_live ON prediction.stream_processors (rule_id) WHERE state <> 'retired';
CREATE INDEX psp_source ON prediction.stream_processors (tenant_id, domain_id, source_id) WHERE state <> 'retired';
COMMENT ON TABLE prediction.stream_processors IS 'B28 (0088 §S): a live event-time processor of one rule version — watermark, offsets, state digest, last checkpoint, state and its reason';

-- ============================================================
-- §S4 THE INPUTS (append-only; every input stored and labelled, none dropped)
-- ============================================================
CREATE TABLE prediction.stream_inputs (
  input_id             uuid PRIMARY KEY,
  -- The ARRIVAL order (the fact a replay follows).
  input_seq            bigint GENERATED ALWAYS AS IDENTITY,
  scope                text NOT NULL,
  tenant_id            uuid NOT NULL,
  domain_id            uuid NOT NULL,
  processor_id         uuid NOT NULL REFERENCES prediction.stream_processors (processor_id),
  event_key            text NOT NULL CHECK (length(event_key) BETWEEN 1 AND 300),
  evd_object_id        uuid NOT NULL,
  evd_version          int  NOT NULL CHECK (evd_version >= 1),
  is_fragment          boolean NOT NULL,
  content_digest       text,
  event_time           timestamptz NOT NULL,
  value                numeric NOT NULL,
  arrived_at           timestamptz NOT NULL DEFAULT clock_timestamp(),
  watermark_at_arrival timestamptz,
  lateness             text NOT NULL CHECK (lateness IN ('on_time', 'late_within_allowance', 'late_beyond_allowance')),
  lateness_by          interval,
  disposition          text NOT NULL CHECK (disposition IN ('new', 'duplicate', 'revision')),
  prior_value          numeric,
  windows              jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(windows) = 'array'),
  outbox_event_id      uuid,
  correlation_id       uuid NOT NULL,
  CONSTRAINT psi_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT psi_once UNIQUE (processor_id, event_key),
  CONSTRAINT psi_late CHECK (lateness <> 'on_time' OR lateness_by IS NULL)
);
CREATE INDEX psi_time ON prediction.stream_inputs (processor_id, event_time, input_seq);
CREATE INDEX psi_seq ON prediction.stream_inputs (processor_id, input_seq);
CREATE INDEX psi_evd ON prediction.stream_inputs (processor_id, evd_object_id);
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON prediction.stream_inputs FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

-- ============================================================
-- §S5 THE WINDOWS (the processor's state — written only by the ports; its digest is on the processor)
-- ============================================================
CREATE TABLE prediction.stream_windows (
  processor_id         uuid NOT NULL REFERENCES prediction.stream_processors (processor_id),
  window_start         timestamptz NOT NULL,
  window_end           timestamptz NOT NULL,
  scope                text NOT NULL,
  tenant_id            uuid NOT NULL,
  domain_id            uuid NOT NULL,
  status               text NOT NULL CHECK (status IN ('open', 'fired', 'revised', 'closed')),
  completeness         text NOT NULL CHECK (completeness IN ('complete', 'partial_incomplete_range', 'partial_missing_days', 'late_revised', 'late_excluded')),
  incomplete_range_ids jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(incomplete_range_ids) = 'array'),
  value                jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(value) = 'object'),
  holds                boolean,
  late_inputs          int NOT NULL DEFAULT 0,
  late_excluded        int NOT NULL DEFAULT 0,
  -- The revision of the window's latest emission (-1: none yet).
  revision             int NOT NULL DEFAULT -1,
  closed_input_seq     bigint,
  fired_at             timestamptz,
  closed_at            timestamptz,
  updated_at           timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (processor_id, window_start),
  CONSTRAINT psw_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT psw_range CHECK (window_start < window_end),
  CONSTRAINT psw_closed CHECK ((status = 'closed') = (closed_at IS NOT NULL))
);

-- ============================================================
-- §S6 THE CHECKPOINTS (append-only)
-- ============================================================
CREATE TABLE prediction.stream_checkpoints (
  checkpoint_id        uuid PRIMARY KEY,
  checkpoint_seq       bigint GENERATED ALWAYS AS IDENTITY,
  scope                text NOT NULL,
  tenant_id            uuid NOT NULL,
  domain_id            uuid NOT NULL,
  processor_id         uuid NOT NULL REFERENCES prediction.stream_processors (processor_id),
  watermark            timestamptz,
  max_event_time       timestamptz,
  input_seq            bigint NOT NULL,
  -- The highest signal sequence the checkpoint's state reflects: a corruption retracts every signal after it.
  signal_hw            bigint NOT NULL,
  source_offsets       jsonb NOT NULL,
  windows              jsonb NOT NULL CHECK (jsonb_typeof(windows) = 'array'),
  state_digest         text NOT NULL CHECK (state_digest ~ '^[0-9a-f]{64}$'),
  rule_id              uuid NOT NULL,
  rule_digest          text NOT NULL,
  topology_version     text NOT NULL,
  reason               text NOT NULL CHECK (reason IN ('start', 'cadence', 'recovered')),
  taken_at             timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id       uuid NOT NULL,
  CONSTRAINT psc_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX psc_processor ON prediction.stream_checkpoints (processor_id, checkpoint_seq);
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON prediction.stream_checkpoints FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

-- ============================================================
-- §S7 THE SIGNALS (append-only; a retraction is a row of its own)
-- ============================================================
CREATE TABLE prediction.stream_signals (
  signal_id            uuid PRIMARY KEY,
  signal_seq           bigint GENERATED ALWAYS AS IDENTITY,
  scope                text NOT NULL,
  tenant_id            uuid NOT NULL,
  domain_id            uuid NOT NULL,
  processor_id         uuid NOT NULL REFERENCES prediction.stream_processors (processor_id),
  rule_id              uuid NOT NULL,
  window_start         timestamptz NOT NULL,
  window_end           timestamptz NOT NULL,
  revision             int NOT NULL CHECK (revision >= 0),
  emission             text NOT NULL CHECK (emission IN ('fired', 'revised', 'retracted')),
  label                text NOT NULL CHECK (label IN ('on_time', 'late_window', 'partial_window', 'recovered')),
  retracts             uuid REFERENCES prediction.stream_signals (signal_id),
  -- Who retracted: the state's corruption (the recovery re-derives what it took away) or a person (sticky until the value changes).
  retraction_kind      text CHECK (retraction_kind IN ('state_corrupt', 'operator')),
  value                jsonb NOT NULL CHECK (jsonb_typeof(value) = 'object'),
  holds                boolean,
  completeness         text NOT NULL,
  incomplete_range_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  lateness             jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(lateness) = 'object'),
  watermark            timestamptz,
  checkpoint_id        uuid,
  reason               text,
  emitted_by           uuid NOT NULL,
  emitted_at           timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id       uuid NOT NULL,
  CONSTRAINT pss_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT pss_once UNIQUE (processor_id, window_start, revision, emission),
  CONSTRAINT pss_retraction CHECK ((emission = 'retracted') = (retracts IS NOT NULL AND reason IS NOT NULL AND retraction_kind IS NOT NULL))
);
CREATE INDEX pss_window ON prediction.stream_signals (processor_id, window_start, signal_seq);
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON prediction.stream_signals FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

-- ============================================================
-- §S8 THE LEDGER (append-only)
-- ============================================================
CREATE TABLE prediction.stream_processor_events (
  event_id             uuid PRIMARY KEY,
  ledger_seq           bigint GENERATED ALWAYS AS IDENTITY,
  scope                text NOT NULL,
  tenant_id            uuid NOT NULL,
  domain_id            uuid NOT NULL,
  processor_id         uuid,
  rule_id              uuid,
  event                text NOT NULL CHECK (event IN (
    'rule.defined', 'rule.activated', 'rule.superseded',
    'processor.started', 'processor.retired', 'processor.stalled', 'processor.corrupt', 'processor.suspended', 'processor.recovering', 'processor.recovered',
    'evidence.ingested', 'evidence.unreadable', 'input.repeated', 'output.suspended', 'output.duplicate_suppressed',
    'watermark.advanced', 'window.closed', 'window.late_excluded',
    'checkpoint.taken', 'checkpoint.incompatible', 'offsets.reconciled', 'offsets.diverged',
    'signal.retracted', 'candidate.submitted', 'candidate.owed', 'sweep.checked')),
  actor                uuid NOT NULL,
  occurred_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  details              jsonb NOT NULL DEFAULT '{}'::jsonb,
  correlation_id       uuid NOT NULL,
  CONSTRAINT pspe_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT pspe_subject CHECK (processor_id IS NOT NULL OR rule_id IS NOT NULL)
);
CREATE INDEX pspe_processor ON prediction.stream_processor_events (processor_id, ledger_seq);
CREATE INDEX pspe_evidence ON prediction.stream_processor_events (processor_id, event, ((details ->> 'evd_object_id')));
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON prediction.stream_processor_events FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['stream_rules', 'stream_processors', 'stream_inputs', 'stream_windows', 'stream_checkpoints', 'stream_signals', 'stream_processor_events'] LOOP
    EXECUTE format('ALTER TABLE prediction.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE prediction.%I FORCE ROW LEVEL SECURITY', t);
    -- 0029:420-425 verbatim
    EXECUTE format($f$
      CREATE POLICY prediction_isolation ON prediction.%I
        USING (
          tenant_id = public.eye_tenant()
          AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain())
        )$f$, t);
    EXECUTE format('GRANT SELECT ON prediction.%I TO eye_app, eye_commit', t);
  END LOOP;
END $$;

-- ============================================================
-- §S9 INTERNALS (no role executes them; the ports have asserted authority and scope)
-- ============================================================
CREATE OR REPLACE FUNCTION prediction.stream_event(p_tenant uuid, p_domain uuid, p_processor uuid, p_rule uuid, p_event text, p_details jsonb, p_correlation uuid)
RETURNS void SECURITY DEFINER SET search_path = prediction, public, pg_catalog, pg_temp AS $$
BEGIN
  INSERT INTO prediction.stream_processor_events (event_id, scope, tenant_id, domain_id, processor_id, rule_id, event, actor, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_processor, p_rule, p_event, public.eye_principal(), coalesce(p_details, '{}'::jsonb), p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.stream_event(uuid, uuid, uuid, uuid, text, jsonb, uuid) FROM PUBLIC;

-- The window state as a snapshot (the digest's input and a checkpoint's content): UTC text, ordered by start.
CREATE OR REPLACE FUNCTION prediction.stream_windows_snapshot(p_processor uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, public, pg_catalog, pg_temp AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'window_start', prediction.stream_ts(w.window_start), 'window_end', prediction.stream_ts(w.window_end), 'status', w.status,
           'completeness', w.completeness, 'incomplete_range_ids', w.incomplete_range_ids, 'value', w.value, 'holds', w.holds,
           'late_inputs', w.late_inputs, 'late_excluded', w.late_excluded, 'revision', w.revision, 'closed_input_seq', w.closed_input_seq)
         ORDER BY w.window_start), '[]'::jsonb)
    FROM prediction.stream_windows w WHERE w.processor_id = p_processor
$$ LANGUAGE sql;
REVOKE ALL ON FUNCTION prediction.stream_windows_snapshot(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION prediction.stream_state_digest(p_processor uuid) RETURNS text
SECURITY DEFINER SET search_path = prediction, public, pg_catalog, pg_temp AS $$
  SELECT prediction.stream_digest(p.watermark, p.max_event_time, prediction.stream_windows_snapshot(p.processor_id))
    FROM prediction.stream_processors p WHERE p.processor_id = p_processor
$$ LANGUAGE sql;
REVOKE ALL ON FUNCTION prediction.stream_state_digest(uuid) FROM PUBLIC;

-- THE SOURCE OFFSETS: for every stream of the processor's partition, the segments appended after its baseline, the evidence each
-- admitted after the processor started, and which of it the processor has not consumed (an evidence.ingested / .unreadable row).
CREATE OR REPLACE FUNCTION prediction.stream_offsets(p_processor uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, observation, public, pg_catalog, pg_temp AS $$
DECLARE pr prediction.stream_processors%ROWTYPE; v_streams jsonb := '[]'::jsonb; v_missing jsonb := '[]'::jsonb; s record; g record;
        v_through int; v_gap boolean; v_n int; v_max int;
BEGIN
  SELECT * INTO pr FROM prediction.stream_processors WHERE processor_id = p_processor;
  FOR s IN SELECT x.stream_id, x.partition_key, x.state FROM observation.acquisition_streams x
            WHERE x.source_id = pr.source_id AND (pr.partition_key IS NULL OR x.partition_key = pr.partition_key)
            ORDER BY x.opened_at, x.stream_id LOOP
    v_through := coalesce((pr.baseline ->> s.stream_id::text)::int, -1); v_gap := false; v_n := 0; v_max := v_through;
    FOR g IN SELECT seg.seq, seg.range_from, seg.range_to,
                    (SELECT count(*) FROM jsonb_array_elements_text(seg.evidence_ids) e(id)
                      WHERE e.id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                        AND EXISTS (SELECT 1 FROM objects.canonical_objects o WHERE o.object_type = 'EVD' AND o.object_id = e.id::uuid AND o.recorded_at >= pr.started_at)
                        AND NOT EXISTS (SELECT 1 FROM prediction.stream_processor_events pe
                                         WHERE pe.processor_id = pr.processor_id AND pe.event IN ('evidence.ingested', 'evidence.unreadable') AND pe.details ->> 'evd_object_id' = e.id)) AS missing
               FROM observation.acquisition_segments seg
              WHERE seg.stream_id = s.stream_id AND seg.seq > coalesce((pr.baseline ->> s.stream_id::text)::int, -1)
              ORDER BY seg.seq LOOP
      v_n := v_n + 1; v_max := g.seq;
      IF g.missing > 0 THEN
        v_gap := true;
        v_missing := v_missing || jsonb_build_object('stream_id', s.stream_id, 'seq', g.seq, 'range_from', g.range_from, 'range_to', g.range_to, 'evidence', g.missing);
      ELSIF NOT v_gap THEN
        v_through := g.seq;
      END IF;
    END LOOP;
    v_streams := v_streams || jsonb_build_object('stream_id', s.stream_id, 'partition_key', s.partition_key, 'state', s.state, 'segments', v_n,
                                                 'max_seq', v_max, 'consumed_through', v_through, 'baseline', (pr.baseline ->> s.stream_id::text)::int);
  END LOOP;
  RETURN jsonb_build_object('streams', v_streams, 'missing', v_missing, 'diverged', jsonb_array_length(v_missing) > 0, 'checked_at', prediction.stream_ts(clock_timestamp()));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.stream_offsets(uuid) FROM PUBLIC;

-- A CHECKPOINT of the processor's current state (append-only), named on the processor.
CREATE OR REPLACE FUNCTION prediction.stream_checkpoint(p_processor uuid, p_reason text, p_correlation uuid) RETURNS uuid
SECURITY DEFINER SET search_path = prediction, public, pg_catalog, pg_temp AS $$
DECLARE pr prediction.stream_processors%ROWTYPE; v_id uuid := gen_random_uuid(); v_windows jsonb; v_offsets jsonb; v_digest text; v_hw bigint;
BEGIN
  SELECT * INTO pr FROM prediction.stream_processors WHERE processor_id = p_processor;
  v_windows := prediction.stream_windows_snapshot(p_processor);
  v_digest := prediction.stream_digest(pr.watermark, pr.max_event_time, v_windows);
  v_offsets := prediction.stream_offsets(p_processor);
  SELECT coalesce(max(signal_seq), 0) INTO v_hw FROM prediction.stream_signals WHERE processor_id = p_processor;
  INSERT INTO prediction.stream_checkpoints (checkpoint_id, scope, tenant_id, domain_id, processor_id, watermark, max_event_time, input_seq, signal_hw,
                                             source_offsets, windows, state_digest, rule_id, rule_digest, topology_version, reason, correlation_id)
  VALUES (v_id, 'DOMAIN', pr.tenant_id, pr.domain_id, p_processor, pr.watermark, pr.max_event_time, pr.input_seq, v_hw,
          v_offsets, v_windows, v_digest, pr.rule_id, pr.rule_digest, pr.topology_version, p_reason, p_correlation);
  UPDATE prediction.stream_processors SET last_checkpoint_id = v_id, source_offsets = v_offsets, state_digest = v_digest WHERE processor_id = p_processor;
  PERFORM prediction.stream_event(pr.tenant_id, pr.domain_id, p_processor, pr.rule_id, 'checkpoint.taken',
    jsonb_build_object('checkpoint_id', v_id, 'reason', p_reason, 'watermark', prediction.stream_ts(pr.watermark), 'input_seq', pr.input_seq, 'signal_hw', v_hw,
                       'state_digest', v_digest, 'windows', jsonb_array_length(v_windows)), p_correlation);
  RETURN v_id;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.stream_checkpoint(uuid, text, uuid) FROM PUBLIC;

-- The processor's state moves (with its ledger row).
CREATE OR REPLACE FUNCTION prediction.stream_set_state(p_processor uuid, p_state text, p_reason text, p_event text, p_details jsonb, p_correlation uuid) RETURNS void
SECURITY DEFINER SET search_path = prediction, public, pg_catalog, pg_temp AS $$
DECLARE pr prediction.stream_processors%ROWTYPE;
BEGIN
  UPDATE prediction.stream_processors SET state = p_state, state_reason = p_reason, state_since = clock_timestamp(),
         retired_at = CASE WHEN p_state = 'retired' THEN clock_timestamp() ELSE retired_at END
   WHERE processor_id = p_processor RETURNING * INTO pr;
  PERFORM prediction.stream_event(pr.tenant_id, pr.domain_id, p_processor, pr.rule_id, p_event,
    coalesce(p_details, '{}'::jsonb) || jsonb_build_object('state', p_state, 'reason', p_reason), p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.stream_set_state(uuid, text, text, text, jsonb, uuid) FROM PUBLIC;

-- ONE WINDOW's aggregate over the inputs that had ARRIVED by `p_upto` (the replay's point): per day, the value of the latest
-- arrival (a duplicate changes nothing, a revision replaces the day's value); the predicate's hits; holds true | false | NULL.
CREATE OR REPLACE FUNCTION prediction.stream_aggregate(p_processor uuid, p_start timestamptz, p_end timestamptz, p_days int, p_predicate jsonb, p_upto bigint)
RETURNS jsonb SECURITY DEFINER SET search_path = prediction, public, pg_catalog, pg_temp AS $$
  WITH eff AS (
    SELECT DISTINCT ON (i.event_time) i.event_time, i.value, i.evd_object_id, i.evd_version
      FROM prediction.stream_inputs i
     WHERE i.processor_id = p_processor AND i.event_time >= p_start AND i.event_time < p_end AND i.input_seq <= p_upto
     ORDER BY i.event_time, i.input_seq DESC),
  agg AS (
    SELECT count(*)::int AS n,
           count(*) FILTER (WHERE prediction.stream_cmp(value, p_predicate ->> 'comparator', (p_predicate ->> 'threshold')::numeric))::int AS hits,
           min(value) AS vmin, max(value) AS vmax, round(avg(value), 4) AS vmean,
           coalesce(jsonb_object_agg(to_char(prediction.stream_date(event_time), 'YYYY-MM-DD'), value) FILTER (WHERE event_time IS NOT NULL), '{}'::jsonb) AS days
      FROM eff)
  SELECT jsonb_build_object('n', a.n, 'expected_days', p_days, 'hits', a.hits, 'min', a.vmin, 'max', a.vmax, 'mean', a.vmean, 'days', a.days,
           'holds', CASE WHEN a.hits >= (p_predicate ->> 'min_hits')::int THEN to_jsonb(true)
                         WHEN a.hits + (p_days - a.n) < (p_predicate ->> 'min_hits')::int THEN to_jsonb(false)
                         ELSE 'null'::jsonb END)
    FROM agg a
$$ LANGUAGE sql;
REVOKE ALL ON FUNCTION prediction.stream_aggregate(uuid, timestamptz, timestamptz, int, jsonb, bigint) FROM PUBLIC;

-- The unresolved, DATE-ranged incomplete ranges of the processor's partition overlapping [start, end).
CREATE OR REPLACE FUNCTION prediction.stream_incomplete_ranges(p_processor uuid, p_start timestamptz, p_end timestamptz) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, observation, public, pg_catalog, pg_temp AS $$
  SELECT coalesce(jsonb_agg(ir.range_id ORDER BY ir.declared_at), '[]'::jsonb)
    FROM prediction.stream_processors pr
    JOIN observation.acquisition_incomplete_ranges ir ON ir.source_id = pr.source_id AND ir.resolved_by_seq IS NULL
    JOIN observation.acquisition_streams s ON s.stream_id = ir.stream_id AND (pr.partition_key IS NULL OR s.partition_key = pr.partition_key)
   WHERE pr.processor_id = p_processor
     AND ir.range_from ~ '^\d{4}-\d{2}-\d{2}$' AND ir.range_to ~ '^\d{4}-\d{2}-\d{2}$'
     AND ir.range_from < to_char(prediction.stream_date(p_end), 'YYYY-MM-DD') AND ir.range_to > to_char(prediction.stream_date(p_start), 'YYYY-MM-DD')
$$ LANGUAGE sql;
REVOKE ALL ON FUNCTION prediction.stream_incomplete_ranges(uuid, timestamptz, timestamptz) FROM PUBLIC;

-- The candidate origin key of a signal (processor:window_start:revision).
CREATE OR REPLACE FUNCTION prediction.stream_origin_key(p_processor uuid, p_start timestamptz, p_revision int) RETURNS text
LANGUAGE sql IMMUTABLE AS $$ SELECT p_processor::text || ':' || prediction.stream_ts(p_start) || ':' || p_revision::text $$;

-- SUBMIT the warning candidate of a standing emission whose predicate holds (0088 §0 intake; idempotent on the origin key).
CREATE OR REPLACE FUNCTION prediction.stream_submit(p_signal uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, observation, public, pg_catalog, pg_temp AS $$
DECLARE s prediction.stream_signals%ROWTYPE; r prediction.stream_rules%ROWTYPE; pr prediction.stream_processors%ROWTYPE; v_answer jsonb; v_evidence jsonb;
        v_title text; v_cmp text; v_n int; v_days int;
BEGIN
  SELECT * INTO s FROM prediction.stream_signals WHERE signal_id = p_signal;
  SELECT * INTO pr FROM prediction.stream_processors WHERE processor_id = s.processor_id;
  SELECT * INTO r FROM prediction.stream_rules WHERE rule_id = s.rule_id;
  v_n := coalesce((s.value ->> 'n')::int, 0); v_days := coalesce((s.value ->> 'expected_days')::int, r.window_days);
  v_cmp := CASE r.predicate ->> 'comparator' WHEN 'lt' THEN '<' WHEN 'le' THEN '<=' WHEN 'gt' THEN '>' ELSE '>=' END;
  SELECT coalesce(jsonb_agg(jsonb_build_object('object_id', e.evd_object_id, 'version', e.evd_version, 'source_id', pr.source_id,
                                               'stance', CASE WHEN prediction.stream_cmp(e.value, r.predicate ->> 'comparator', (r.predicate ->> 'threshold')::numeric) THEN 'supporting' ELSE 'contradicting' END)
                            ORDER BY e.event_time), '[]'::jsonb)
    INTO v_evidence
    FROM (SELECT DISTINCT ON (i.event_time) i.event_time, i.value, i.evd_object_id, i.evd_version FROM prediction.stream_inputs i
           WHERE i.processor_id = s.processor_id AND i.event_time >= s.window_start AND i.event_time < s.window_end
           ORDER BY i.event_time, i.input_seq DESC LIMIT 60) e;
  v_title := left(format('Stream rule %s: %s of %s observed days %s %s in %s..%s%s', r.title, s.value ->> 'hits', v_n, v_cmp, r.predicate ->> 'threshold',
                         to_char(prediction.stream_date(s.window_start), 'YYYY-MM-DD'), to_char(prediction.stream_date(s.window_end), 'YYYY-MM-DD'),
                         CASE s.label WHEN 'late_window' THEN ' (LATE window)' WHEN 'partial_window' THEN ' (PARTIAL window)' WHEN 'recovered' THEN ' (recovered)' ELSE '' END), 300);
  v_answer := prediction.submit_warning_candidate(
    s.tenant_id, s.domain_id, 'stream_rule', prediction.stream_origin_key(s.processor_id, s.window_start, s.revision),
    jsonb_build_object('processor_id', s.processor_id, 'rule_id', r.rule_id, 'rule_key', r.rule_key, 'rule_version', r.version, 'signal_id', s.signal_id,
                       'window_start', prediction.stream_ts(s.window_start), 'window_end', prediction.stream_ts(s.window_end), 'revision', s.revision,
                       'emission', s.emission, 'label', s.label, 'completeness', s.completeness, 'lateness', s.lateness, 'series_key', r.series_key),
    v_title, r.consequence_class, round(v_n::numeric / greatest(v_days, 1), 3),
    'stream:' || r.rule_key || ':' || coalesce(r.partition, '*') || ':' || prediction.stream_ts(s.window_start),
    -- the intake's affected contract (0088 §0: {objectives, assets, actors, geographies, horizon} — §W refuses any other key): the series and
    -- its partition are the affected assets, the window the horizon; the series key and the window stay on origin_ref (integrator, 0088 §I)
    jsonb_build_object('assets', CASE WHEN r.partition IS NULL THEN jsonb_build_array(r.series_key) ELSE jsonb_build_array(r.series_key, r.partition) END,
                       'horizon', to_char(prediction.stream_date(s.window_start), 'YYYY-MM-DD') || '..' || to_char(prediction.stream_date(s.window_end), 'YYYY-MM-DD')),
    v_evidence, r.response_window_hours, public.eye_principal(), p_correlation);
  PERFORM prediction.stream_event(s.tenant_id, s.domain_id, s.processor_id, s.rule_id, 'candidate.submitted',
    jsonb_build_object('signal_id', s.signal_id, 'window_start', prediction.stream_ts(s.window_start), 'revision', s.revision, 'candidate', v_answer), p_correlation);
  RETURN v_answer;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.stream_submit(uuid, uuid) FROM PUBLIC;

-- The OWED candidates of a processor: the latest standing emission of each window whose predicate holds and whose candidate was not
-- submitted — submitted now when the bound action is the consumer's (the one the intake admits for a stream), else left owed.
CREATE OR REPLACE FUNCTION prediction.stream_submit_owed(p_processor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, public, pg_catalog, pg_temp AS $$
DECLARE s record; v_out jsonb := '[]'::jsonb; pr prediction.stream_processors%ROWTYPE;
BEGIN
  SELECT * INTO pr FROM prediction.stream_processors WHERE processor_id = p_processor;
  IF pr.state <> 'running' OR public.eye_bound_action() IS DISTINCT FROM 'prediction.stream.subscription.apply' THEN RETURN v_out; END IF;
  FOR s IN
    SELECT x.signal_id FROM (
      SELECT DISTINCT ON (g.window_start) g.* FROM prediction.stream_signals g
       WHERE g.processor_id = p_processor AND g.emission IN ('fired', 'revised')
         AND NOT EXISTS (SELECT 1 FROM prediction.stream_signals t WHERE t.retracts = g.signal_id)
       ORDER BY g.window_start, g.signal_seq DESC) x
     WHERE x.holds IS TRUE
       AND NOT EXISTS (SELECT 1 FROM prediction.warning_candidates c WHERE c.tenant_id = x.tenant_id AND c.domain_id = x.domain_id AND c.origin_kind = 'stream_rule'
                                                                     AND c.origin_key = prediction.stream_origin_key(x.processor_id, x.window_start, x.revision))
     ORDER BY x.signal_seq LIMIT 20
  LOOP
    v_out := v_out || jsonb_build_object('signal_id', s.signal_id, 'candidate', prediction.stream_submit(s.signal_id, p_correlation));
  END LOOP;
  RETURN v_out;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.stream_submit_owed(uuid, uuid) FROM PUBLIC;

-- ONE EMISSION of a window (fired | revised), numbered after every earlier signal of the window; a holding predicate submits its
-- candidate when the bound action is the consumer's, and is recorded OWED otherwise.
CREATE OR REPLACE FUNCTION prediction.stream_emit(p_processor uuid, p_start timestamptz, p_end timestamptz, p_emission text, p_label text, p_value jsonb,
                                                  p_completeness text, p_ranges jsonb, p_lateness jsonb, p_correlation uuid) RETURNS prediction.stream_signals
SECURITY DEFINER SET search_path = prediction, public, pg_catalog, pg_temp AS $$
DECLARE pr prediction.stream_processors%ROWTYPE; s prediction.stream_signals%ROWTYPE; v_rev int;
BEGIN
  SELECT * INTO pr FROM prediction.stream_processors WHERE processor_id = p_processor;
  SELECT coalesce(max(revision), -1) + 1 INTO v_rev FROM prediction.stream_signals WHERE processor_id = p_processor AND window_start = p_start;
  INSERT INTO prediction.stream_signals (signal_id, scope, tenant_id, domain_id, processor_id, rule_id, window_start, window_end, revision, emission, label,
                                         value, holds, completeness, incomplete_range_ids, lateness, watermark, checkpoint_id, emitted_by, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', pr.tenant_id, pr.domain_id, p_processor, pr.rule_id, p_start, p_end, v_rev, p_emission, p_label,
          p_value, (CASE WHEN jsonb_typeof(p_value -> 'holds') = 'boolean' THEN (p_value ->> 'holds')::boolean ELSE NULL END), p_completeness, coalesce(p_ranges, '[]'::jsonb),
          coalesce(p_lateness, '{}'::jsonb), pr.watermark, pr.last_checkpoint_id, public.eye_principal(), p_correlation)
  RETURNING * INTO s;
  IF s.holds IS TRUE THEN
    IF public.eye_bound_action() = 'prediction.stream.subscription.apply' AND pr.state = 'running' THEN
      PERFORM prediction.stream_submit(s.signal_id, p_correlation);
    ELSE
      PERFORM prediction.stream_event(pr.tenant_id, pr.domain_id, p_processor, pr.rule_id, 'candidate.owed',
        jsonb_build_object('signal_id', s.signal_id, 'window_start', prediction.stream_ts(p_start), 'revision', v_rev,
                           'why', format('emitted under %s; the intake admits a stream''s candidate under prediction.stream.subscription.apply — submitted by the consumer''s next item', coalesce(public.eye_bound_action(), '<none>'))),
        p_correlation);
    END IF;
  END IF;
  RETURN s;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.stream_emit(uuid, timestamptz, timestamptz, text, text, jsonb, text, jsonb, jsonb, uuid) FROM PUBLIC;

-- The lateness block of a window: its inputs that arrived late (up to the replay point), the latest ten shown.
CREATE OR REPLACE FUNCTION prediction.stream_window_lateness(p_processor uuid, p_start timestamptz, p_end timestamptz, p_upto bigint) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, public, pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object(
    'late_inputs', count(*),
    'max_lateness', max(i.lateness_by)::text,
    'inputs', coalesce((SELECT jsonb_agg(jsonb_build_object('event_key', x.event_key, 'day', to_char(prediction.stream_date(x.event_time), 'YYYY-MM-DD'), 'value', x.value,
                                                           'lateness', x.lateness, 'lateness_by', x.lateness_by::text, 'disposition', x.disposition, 'prior_value', x.prior_value,
                                                           'arrived_at', prediction.stream_ts(x.arrived_at), 'watermark_at_arrival', prediction.stream_ts(x.watermark_at_arrival)) ORDER BY x.input_seq DESC)
                          FROM (SELECT * FROM prediction.stream_inputs y WHERE y.processor_id = p_processor AND y.event_time >= p_start AND y.event_time < p_end
                                   AND y.input_seq <= p_upto AND y.lateness <> 'on_time' ORDER BY y.input_seq DESC LIMIT 10) x), '[]'::jsonb))
    FROM prediction.stream_inputs i
   WHERE i.processor_id = p_processor AND i.event_time >= p_start AND i.event_time < p_end AND i.input_seq <= p_upto AND i.lateness <> 'on_time'
$$ LANGUAGE sql;
REVOKE ALL ON FUNCTION prediction.stream_window_lateness(uuid, timestamptz, timestamptz, bigint) FROM PUBLIC;

/*
 * THE STEP — the engine. Given the inputs that arrived up to `p_upto` (those after `p_since` are this step's own), it moves the
 * watermark (max event time − lag), then walks the windows in start order:
 *   · a window whose end is past the watermark stays OPEN (its running value shown, nothing emitted);
 *   · a due window never fired FIRES — unless it is already past its allowance with inputs in it (every one of them late beyond the
 *     allowance): it is then CLOSED with those inputs counted late_excluded, never evaluated;
 *   · a fired window whose value moved is REVISED; one whose value is the standing signal's emits nothing (duplicate suppressed,
 *     recorded when this step's own inputs touched it);
 *   · a window past its allowance CLOSES; inputs reaching a closed window are counted late_excluded (its value stands).
 * The comparison is always against the window's latest STANDING (not retracted) emission, so a recovery re-emits exactly what a
 * retraction took away and nothing it did not. `p_mode` 'recover' labels every emission `recovered` and takes no cadence checkpoint.
 */
CREATE OR REPLACE FUNCTION prediction.stream_step(p_processor uuid, p_mode text, p_since bigint, p_upto bigint, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, observation, public, pg_catalog, pg_temp AS $$
DECLARE
  pr prediction.stream_processors%ROWTYPE; r prediction.stream_rules%ROWTYPE; w prediction.stream_windows%ROWTYPE; s prediction.stream_signals%ROWTYPE;
  v_w timestamptz; v_prev_w timestamptz; v_origin date; v_len int; v_slide int; k int; ks int[]; v_start timestamptz; v_end timestamptz; v_exists boolean;
  v_agg jsonb; v_ranges jsonb; v_completeness text; v_label text; v_late jsonb; v_late_n int; v_touched boolean; v_standing jsonb; v_touched_n int;
  v_fired jsonb := '[]'::jsonb; v_revised jsonb := '[]'::jsonb; v_closed jsonb := '[]'::jsonb; v_suppressed jsonb := '[]'::jsonb; v_excluded jsonb := '[]'::jsonb;
  v_emitted int := 0; v_since_cp int; v_first int; v_due_hi int; v_open_hi int; v_n_in int; v_n_beyond int; v_excl int;
BEGIN
  SELECT * INTO pr FROM prediction.stream_processors WHERE processor_id = p_processor FOR UPDATE;
  SELECT * INTO r FROM prediction.stream_rules WHERE rule_id = pr.rule_id;
  v_origin := r.window_origin; v_len := r.window_days; v_slide := r.slide_days;
  -- THE WATERMARK (event time only).
  v_prev_w := pr.watermark;
  v_w := CASE WHEN pr.max_event_time IS NULL THEN NULL ELSE pr.max_event_time - r.watermark_lag END;
  IF v_w IS NOT NULL AND (v_prev_w IS NULL OR v_w > v_prev_w) THEN
    UPDATE prediction.stream_processors SET watermark = v_w, last_watermark_move_at = clock_timestamp() WHERE processor_id = p_processor;
    PERFORM prediction.stream_event(pr.tenant_id, pr.domain_id, p_processor, pr.rule_id, 'watermark.advanced',
      jsonb_build_object('from', prediction.stream_ts(v_prev_w), 'to', prediction.stream_ts(v_w), 'max_event_time', prediction.stream_ts(pr.max_event_time), 'mode', p_mode), p_correlation);
  ELSE
    v_w := v_prev_w;
  END IF;
  IF v_w IS NULL THEN RETURN jsonb_build_object('watermark', NULL, 'fired', v_fired, 'emitted', 0, 'suppressed', v_suppressed); END IF;

  -- THE WINDOWS TO WALK, in start order: every window containing an input of THIS step; every window not closed; and, from the first
  -- window of the processor's LIVE horizon (its first input not late beyond the allowance) to the highest event time, every window not
  -- yet closed — so a due window with no observation fires as the gap it is (never silently skipped), and the open ones are shown. A
  -- closed window no input of this step touches cannot change: it is not walked (the step's cost follows what arrived, not the history).
  SELECT min(prediction.stream_fdiv((prediction.stream_date(i.event_time) - v_origin) - v_len + v_slide, v_slide)) INTO v_first
    FROM prediction.stream_inputs i WHERE i.processor_id = p_processor AND i.input_seq <= p_upto AND i.lateness <> 'late_beyond_allowance';
  v_due_hi := prediction.stream_fdiv((prediction.stream_date(v_w) - v_origin) - v_len, v_slide);
  WHILE prediction.stream_day(v_origin + v_due_hi * v_slide + v_len) > v_w LOOP v_due_hi := v_due_hi - 1; END LOOP;
  WHILE prediction.stream_day(v_origin + (v_due_hi + 1) * v_slide + v_len) <= v_w LOOP v_due_hi := v_due_hi + 1; END LOOP;
  v_open_hi := prediction.stream_fdiv(prediction.stream_date(pr.max_event_time) - v_origin, v_slide);
  SELECT array_agg(DISTINCT kk ORDER BY kk) INTO ks FROM (
    SELECT generate_series(prediction.stream_fdiv((prediction.stream_date(i.event_time) - v_origin) - v_len + v_slide, v_slide),
                           prediction.stream_fdiv(prediction.stream_date(i.event_time) - v_origin, v_slide)) AS kk
      FROM prediction.stream_inputs i WHERE i.processor_id = p_processor AND i.input_seq > p_since AND i.input_seq <= p_upto
    UNION SELECT prediction.stream_fdiv(prediction.stream_date(x.window_start) - v_origin, v_slide) FROM prediction.stream_windows x WHERE x.processor_id = p_processor AND x.status <> 'closed'
    UNION SELECT g FROM generate_series(greatest(v_first, v_due_hi - 366), v_open_hi) g
           WHERE v_first IS NOT NULL
             AND NOT EXISTS (SELECT 1 FROM prediction.stream_windows y WHERE y.processor_id = p_processor AND y.window_start = prediction.stream_day(v_origin + g * v_slide) AND y.status = 'closed')) q;

  FOREACH k IN ARRAY coalesce(ks, '{}'::int[]) LOOP
    v_start := prediction.stream_day(v_origin + k * v_slide);
    v_end := prediction.stream_day(v_origin + k * v_slide + v_len);
    SELECT * INTO w FROM prediction.stream_windows WHERE processor_id = p_processor AND window_start = v_start FOR UPDATE;
    v_exists := FOUND;
    SELECT count(*)::int INTO v_touched_n FROM prediction.stream_inputs i
     WHERE i.processor_id = p_processor AND i.event_time >= v_start AND i.event_time < v_end AND i.input_seq > p_since AND i.input_seq <= p_upto;
    v_touched := v_touched_n > 0;

    -- A CLOSED window: its value stands; inputs after its closing are counted, never evaluated.
    IF v_exists AND w.status = 'closed' THEN
      SELECT count(*)::int INTO v_excl FROM prediction.stream_inputs i
       WHERE i.processor_id = p_processor AND i.event_time >= v_start AND i.event_time < v_end AND i.input_seq > coalesce(w.closed_input_seq, 0) AND i.input_seq <= p_upto;
      IF v_excl IS DISTINCT FROM w.late_excluded THEN
        UPDATE prediction.stream_windows SET late_excluded = v_excl,
               completeness = CASE WHEN completeness IN ('partial_incomplete_range', 'partial_missing_days') THEN completeness ELSE 'late_excluded' END, updated_at = clock_timestamp()
         WHERE processor_id = p_processor AND window_start = v_start;
        PERFORM prediction.stream_event(pr.tenant_id, pr.domain_id, p_processor, pr.rule_id, 'window.late_excluded',
          jsonb_build_object('window_start', prediction.stream_ts(v_start), 'window_end', prediction.stream_ts(v_end), 'late_excluded', v_excl,
                             'note', 'input(s) arrived after the window closed (beyond the allowed lateness): the fired value stands and the window says so'), p_correlation);
        v_excluded := v_excluded || jsonb_build_object('window_start', prediction.stream_ts(v_start), 'late_excluded', v_excl);
      END IF;
      CONTINUE;
    END IF;

    -- A FIRED window no input of this step touched (the live path): nothing new to judge — it only closes once past its allowance. (A
    -- person's retraction stands; the recovery re-judges every window against its standing signal.)
    IF p_mode <> 'recover' AND v_exists AND w.status IN ('fired', 'revised') AND NOT v_touched THEN
      IF v_end + r.allowed_lateness <= v_w THEN
        UPDATE prediction.stream_windows SET status = 'closed', closed_at = clock_timestamp(), closed_input_seq = p_upto, updated_at = clock_timestamp()
         WHERE processor_id = p_processor AND window_start = v_start;
        PERFORM prediction.stream_event(pr.tenant_id, pr.domain_id, p_processor, pr.rule_id, 'window.closed',
          jsonb_build_object('window_start', prediction.stream_ts(v_start), 'window_end', prediction.stream_ts(v_end), 'watermark', prediction.stream_ts(v_w),
                             'allowed_lateness', r.allowed_lateness::text, 'closed_input_seq', p_upto), p_correlation);
        v_closed := v_closed || to_jsonb(prediction.stream_ts(v_start));
      END IF;
      CONTINUE;
    END IF;

    v_agg := prediction.stream_aggregate(p_processor, v_start, v_end, v_len, r.predicate, p_upto);
    v_ranges := prediction.stream_incomplete_ranges(p_processor, v_start, v_end);
    v_late := prediction.stream_window_lateness(p_processor, v_start, v_end, p_upto);
    v_late_n := coalesce((v_late ->> 'late_inputs')::int, 0);

    -- NOT DUE: open, its running value shown, nothing emitted.
    IF v_end > v_w THEN
      INSERT INTO prediction.stream_windows (processor_id, window_start, window_end, scope, tenant_id, domain_id, status, completeness, incomplete_range_ids, value, holds, late_inputs)
      VALUES (p_processor, v_start, v_end, 'DOMAIN', pr.tenant_id, pr.domain_id, 'open',
              CASE WHEN jsonb_array_length(v_ranges) > 0 THEN 'partial_incomplete_range' WHEN (v_agg ->> 'n')::int < v_len THEN 'partial_missing_days' ELSE 'complete' END,
              v_ranges, v_agg, CASE WHEN jsonb_typeof(v_agg -> 'holds') = 'boolean' THEN (v_agg ->> 'holds')::boolean END, v_late_n)
      ON CONFLICT (processor_id, window_start) DO UPDATE SET completeness = EXCLUDED.completeness, incomplete_range_ids = EXCLUDED.incomplete_range_ids,
             value = EXCLUDED.value, holds = EXCLUDED.holds, late_inputs = EXCLUDED.late_inputs, updated_at = clock_timestamp();
      CONTINUE;
    END IF;

    -- DUE, NEVER FIRED, ALREADY PAST ITS ALLOWANCE, and EVERY input in it arrived beyond the allowance: closed, never evaluated.
    IF (NOT v_exists OR w.status = 'open') AND v_end + r.allowed_lateness <= v_w THEN
      SELECT count(*)::int, count(*) FILTER (WHERE i.lateness = 'late_beyond_allowance')::int INTO v_n_in, v_n_beyond
        FROM prediction.stream_inputs i WHERE i.processor_id = p_processor AND i.event_time >= v_start AND i.event_time < v_end AND i.input_seq <= p_upto;
      IF v_n_in > 0 AND v_n_in = v_n_beyond THEN
        INSERT INTO prediction.stream_windows (processor_id, window_start, window_end, scope, tenant_id, domain_id, status, completeness, incomplete_range_ids, value, holds,
                                               late_inputs, late_excluded, closed_input_seq, closed_at)
        VALUES (p_processor, v_start, v_end, 'DOMAIN', pr.tenant_id, pr.domain_id, 'closed',
                CASE WHEN jsonb_array_length(v_ranges) > 0 THEN 'partial_incomplete_range' ELSE 'late_excluded' END, v_ranges, '{}'::jsonb, NULL,
                v_late_n, v_n_in, 0, clock_timestamp())
        ON CONFLICT (processor_id, window_start) DO UPDATE SET status = 'closed', completeness = EXCLUDED.completeness, late_excluded = EXCLUDED.late_excluded,
               late_inputs = EXCLUDED.late_inputs, value = '{}'::jsonb, holds = NULL, closed_input_seq = 0, closed_at = clock_timestamp(), updated_at = clock_timestamp();
        PERFORM prediction.stream_event(pr.tenant_id, pr.domain_id, p_processor, pr.rule_id, 'window.late_excluded',
          jsonb_build_object('window_start', prediction.stream_ts(v_start), 'window_end', prediction.stream_ts(v_end), 'late_excluded', v_n_in, 'never_fired', true,
                             'note', 'every input of this window arrived beyond the allowed lateness: the window is closed unevaluated and says so'), p_correlation);
        v_excluded := v_excluded || jsonb_build_object('window_start', prediction.stream_ts(v_start), 'late_excluded', v_n_in, 'never_fired', true);
        CONTINUE;
      END IF;
    END IF;

    v_completeness := CASE WHEN jsonb_array_length(v_ranges) > 0 THEN 'partial_incomplete_range'
                           WHEN (v_agg ->> 'n')::int < v_len THEN 'partial_missing_days'
                           WHEN v_late_n > 0 THEN 'late_revised'
                           ELSE 'complete' END;
    -- The window's STANDING emission: the latest one not retracted by a state corruption (a person's retraction stands until the value moves).
    v_standing := NULL;
    SELECT g.value INTO v_standing FROM prediction.stream_signals g
     WHERE g.processor_id = p_processor AND g.window_start = v_start AND g.emission IN ('fired', 'revised')
       AND NOT EXISTS (SELECT 1 FROM prediction.stream_signals t WHERE t.retracts = g.signal_id AND t.retraction_kind = 'state_corrupt')
     ORDER BY g.signal_seq DESC LIMIT 1;

    IF v_standing IS NOT NULL AND v_standing = v_agg THEN
      -- The value is the standing signal's: nothing is emitted twice.
      IF v_touched OR p_mode = 'recover' THEN
        PERFORM prediction.stream_event(pr.tenant_id, pr.domain_id, p_processor, pr.rule_id, 'output.duplicate_suppressed',
          jsonb_build_object('window_start', prediction.stream_ts(v_start), 'window_end', prediction.stream_ts(v_end), 'mode', p_mode, 'inputs', v_touched_n,
                             'note', 'the recomputed window equals its standing signal: no second emission'), p_correlation);
        v_suppressed := v_suppressed || jsonb_build_object('window_start', prediction.stream_ts(v_start), 'inputs', v_touched_n, 'mode', p_mode);
      END IF;
      INSERT INTO prediction.stream_windows (processor_id, window_start, window_end, scope, tenant_id, domain_id, status, completeness, incomplete_range_ids, value, holds, late_inputs, revision, fired_at)
      VALUES (p_processor, v_start, v_end, 'DOMAIN', pr.tenant_id, pr.domain_id, 'fired', v_completeness, v_ranges, v_agg,
              CASE WHEN jsonb_typeof(v_agg -> 'holds') = 'boolean' THEN (v_agg ->> 'holds')::boolean END, v_late_n,
              coalesce((SELECT max(g.revision) FROM prediction.stream_signals g WHERE g.processor_id = p_processor AND g.window_start = v_start AND g.emission <> 'retracted'), -1), clock_timestamp())
      ON CONFLICT (processor_id, window_start) DO UPDATE SET
             status = CASE WHEN prediction.stream_windows.status = 'open' THEN 'fired' ELSE prediction.stream_windows.status END,
             completeness = EXCLUDED.completeness, incomplete_range_ids = EXCLUDED.incomplete_range_ids, value = EXCLUDED.value, holds = EXCLUDED.holds,
             late_inputs = EXCLUDED.late_inputs, revision = EXCLUDED.revision, fired_at = coalesce(prediction.stream_windows.fired_at, clock_timestamp()), updated_at = clock_timestamp();
    ELSE
      v_label := CASE WHEN p_mode = 'recover' THEN 'recovered'
                      WHEN v_completeness IN ('partial_incomplete_range', 'partial_missing_days') THEN 'partial_window'
                      WHEN v_late_n > 0 OR v_standing IS NOT NULL THEN 'late_window'
                      ELSE 'on_time' END;
      s := prediction.stream_emit(p_processor, v_start, v_end,
                                  CASE WHEN EXISTS (SELECT 1 FROM prediction.stream_signals g WHERE g.processor_id = p_processor AND g.window_start = v_start AND g.emission IN ('fired', 'revised'))
                                       THEN 'revised' ELSE 'fired' END,
                                  v_label, v_agg, v_completeness, v_ranges, v_late, p_correlation);
      v_emitted := v_emitted + 1;
      INSERT INTO prediction.stream_windows (processor_id, window_start, window_end, scope, tenant_id, domain_id, status, completeness, incomplete_range_ids, value, holds, late_inputs, revision, fired_at)
      VALUES (p_processor, v_start, v_end, 'DOMAIN', pr.tenant_id, pr.domain_id, CASE WHEN s.emission = 'revised' THEN 'revised' ELSE 'fired' END, v_completeness, v_ranges, v_agg,
              s.holds, v_late_n, s.revision, clock_timestamp())
      ON CONFLICT (processor_id, window_start) DO UPDATE SET status = EXCLUDED.status, completeness = EXCLUDED.completeness, incomplete_range_ids = EXCLUDED.incomplete_range_ids,
             value = EXCLUDED.value, holds = EXCLUDED.holds, late_inputs = EXCLUDED.late_inputs, revision = EXCLUDED.revision,
             fired_at = coalesce(prediction.stream_windows.fired_at, clock_timestamp()), updated_at = clock_timestamp();
      IF s.emission = 'revised' THEN
        v_revised := v_revised || jsonb_build_object('window_start', prediction.stream_ts(v_start), 'revision', s.revision, 'label', s.label, 'holds', s.holds, 'signal_id', s.signal_id);
      ELSE
        v_fired := v_fired || jsonb_build_object('window_start', prediction.stream_ts(v_start), 'revision', s.revision, 'label', s.label, 'holds', s.holds, 'signal_id', s.signal_id);
      END IF;
    END IF;

    -- PAST THE ALLOWANCE: closed (its fired value stands from now on).
    IF v_end + r.allowed_lateness <= v_w THEN
      UPDATE prediction.stream_windows SET status = 'closed', closed_at = clock_timestamp(), closed_input_seq = p_upto, updated_at = clock_timestamp()
       WHERE processor_id = p_processor AND window_start = v_start AND status <> 'closed';
      PERFORM prediction.stream_event(pr.tenant_id, pr.domain_id, p_processor, pr.rule_id, 'window.closed',
        jsonb_build_object('window_start', prediction.stream_ts(v_start), 'window_end', prediction.stream_ts(v_end), 'watermark', prediction.stream_ts(v_w),
                           'allowed_lateness', r.allowed_lateness::text, 'closed_input_seq', p_upto), p_correlation);
      v_closed := v_closed || to_jsonb(prediction.stream_ts(v_start));
    END IF;
  END LOOP;

  UPDATE prediction.stream_processors SET input_seq = greatest(input_seq, p_upto), state_digest = prediction.stream_state_digest(p_processor) WHERE processor_id = p_processor;
  -- THE CADENCE CHECKPOINT (not during a recovery: the recovery takes its own at the end).
  IF p_mode <> 'recover' THEN
    SELECT count(*)::int INTO v_since_cp FROM prediction.stream_signals g
     WHERE g.processor_id = p_processor AND g.emission IN ('fired', 'revised')
       AND g.signal_seq > coalesce((SELECT c.signal_hw FROM prediction.stream_checkpoints c WHERE c.checkpoint_id = pr.last_checkpoint_id), 0);
    IF v_since_cp >= r.checkpoint_every THEN PERFORM prediction.stream_checkpoint(p_processor, 'cadence', p_correlation); END IF;
  END IF;
  RETURN jsonb_build_object('watermark', prediction.stream_ts(v_w), 'fired', v_fired, 'revised', v_revised, 'closed', v_closed, 'suppressed', v_suppressed,
                            'late_excluded', v_excluded, 'emitted', v_emitted);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.stream_step(uuid, text, bigint, bigint, uuid) FROM PUBLIC;

-- RETRACT every standing emission after a checkpoint's signal high-water (a corruption: the state since it cannot be trusted).
CREATE OR REPLACE FUNCTION prediction.stream_retract_after(p_processor uuid, p_hw bigint, p_reason text, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, public, pg_catalog, pg_temp AS $$
DECLARE g prediction.stream_signals%ROWTYPE; v_out jsonb := '[]'::jsonb;
BEGIN
  FOR g IN SELECT * FROM prediction.stream_signals x WHERE x.processor_id = p_processor AND x.signal_seq > p_hw AND x.emission IN ('fired', 'revised')
                                                       AND NOT EXISTS (SELECT 1 FROM prediction.stream_signals t WHERE t.retracts = x.signal_id)
            ORDER BY x.signal_seq LOOP
    INSERT INTO prediction.stream_signals (signal_id, scope, tenant_id, domain_id, processor_id, rule_id, window_start, window_end, revision, emission, label, retracts, retraction_kind,
                                           value, holds, completeness, incomplete_range_ids, lateness, watermark, checkpoint_id, reason, emitted_by, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', g.tenant_id, g.domain_id, g.processor_id, g.rule_id, g.window_start, g.window_end, g.revision, 'retracted', g.label, g.signal_id, 'state_corrupt',
            g.value, g.holds, g.completeness, g.incomplete_range_ids, g.lateness, g.watermark, g.checkpoint_id, p_reason, public.eye_principal(), p_correlation);
    PERFORM prediction.stream_event(g.tenant_id, g.domain_id, p_processor, g.rule_id, 'signal.retracted',
      jsonb_build_object('signal_id', g.signal_id, 'window_start', prediction.stream_ts(g.window_start), 'revision', g.revision, 'reason', p_reason), p_correlation);
    v_out := v_out || jsonb_build_object('signal_id', g.signal_id, 'window_start', prediction.stream_ts(g.window_start), 'revision', g.revision);
  END LOOP;
  RETURN v_out;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.stream_retract_after(uuid, bigint, text, uuid) FROM PUBLIC;

-- The newest checkpoint whose snapshot verifies (and, when asked, is compatible with the processor's rule and topology).
CREATE OR REPLACE FUNCTION prediction.stream_good_checkpoint(p_processor uuid, p_compatible boolean) RETURNS prediction.stream_checkpoints
SECURITY DEFINER SET search_path = prediction, public, pg_catalog, pg_temp AS $$
  SELECT c.* FROM prediction.stream_checkpoints c JOIN prediction.stream_processors p ON p.processor_id = c.processor_id
   WHERE c.processor_id = p_processor AND prediction.stream_digest(c.watermark, c.max_event_time, c.windows) = c.state_digest
     AND (NOT p_compatible OR (c.rule_digest = p.rule_digest AND c.topology_version = prediction.stream_topology_version()))
   ORDER BY c.checkpoint_seq DESC LIMIT 1
$$ LANGUAGE sql;
REVOKE ALL ON FUNCTION prediction.stream_good_checkpoint(uuid, boolean) FROM PUBLIC;

-- VERIFY the state: the digest recomputed from the windows against the one recorded at the last write. A mismatch → CORRUPT (outputs
-- suspended) and every standing signal after the last good checkpoint retracted. Answers whether the state verified.
CREATE OR REPLACE FUNCTION prediction.stream_verify(p_processor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, public, pg_catalog, pg_temp AS $$
DECLARE pr prediction.stream_processors%ROWTYPE; v_found text; c prediction.stream_checkpoints%ROWTYPE; v_retracted jsonb;
BEGIN
  SELECT * INTO pr FROM prediction.stream_processors WHERE processor_id = p_processor FOR UPDATE;
  IF pr.state IN ('corrupt', 'retired') THEN RETURN jsonb_build_object('verified', pr.state <> 'corrupt', 'state', pr.state); END IF;
  v_found := prediction.stream_state_digest(p_processor);
  IF v_found = pr.state_digest THEN RETURN jsonb_build_object('verified', true, 'state', pr.state); END IF;
  c := prediction.stream_good_checkpoint(p_processor, false);
  PERFORM prediction.stream_set_state(p_processor, 'corrupt', format('state digest mismatch: recorded %s, found %s — outputs suspended', left(pr.state_digest, 12), left(v_found, 12)),
    'processor.corrupt', jsonb_build_object('recorded_digest', pr.state_digest, 'found_digest', v_found, 'last_good_checkpoint', c.checkpoint_id), p_correlation);
  PERFORM prediction.stream_event(pr.tenant_id, pr.domain_id, p_processor, pr.rule_id, 'output.suspended',
    jsonb_build_object('why', 'corrupt state', 'note', 'no signal of this processor is presented as current until it is recovered'), p_correlation);
  v_retracted := prediction.stream_retract_after(p_processor, coalesce(c.signal_hw, 0),
    format('state corrupt: emitted after the last good checkpoint %s — the state it was computed from cannot be trusted', coalesce(c.checkpoint_id::text, '<none>')), p_correlation);
  RETURN jsonb_build_object('verified', false, 'state', 'corrupt', 'recorded_digest', pr.state_digest, 'found_digest', v_found,
                            'last_good_checkpoint', c.checkpoint_id, 'retracted', v_retracted);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.stream_verify(uuid, uuid) FROM PUBLIC;

-- ============================================================
-- §S10 THE PORTS
-- ============================================================

-- DEFINE a rule version (a draft): the series it reads, the geometry, the lateness, the stall threshold, the predicate. Human-gated at the PDP.
CREATE OR REPLACE FUNCTION prediction.define_stream_rule(
  p_rule_id uuid, p_tenant uuid, p_domain uuid, p_rule_key text, p_title text, p_series_key text, p_window_kind text, p_window_days int, p_slide_days int,
  p_window_origin date, p_allowed_lateness interval, p_watermark_lag interval, p_stall_after interval, p_predicate jsonb, p_consequence text,
  p_response_hours int, p_checkpoint_every int, p_owner uuid, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE ser prediction.series_registry%ROWTYPE; prev prediction.stream_rules%ROWTYPE; v_slide int; v_pred jsonb; v_digest text; v_version int; v_rule prediction.stream_rules%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.stream.rule.define']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'stream rule rejected: defined by the acting principal' USING ERRCODE = '42501'; END IF;
  IF p_rule_key IS NULL OR p_rule_key !~ '^[a-z0-9][a-z0-9._-]{2,79}$' THEN
    RAISE EXCEPTION 'stream rule rejected: rule_key is 3..80 characters of a-z 0-9 . _ - (starting with a letter or digit)' USING ERRCODE = '22023';
  END IF;
  IF p_title IS NULL OR length(btrim(p_title)) NOT BETWEEN 3 AND 300 THEN RAISE EXCEPTION 'stream rule rejected: a title of 3..300 characters is required' USING ERRCODE = '22023'; END IF;
  IF p_window_kind IS NULL OR p_window_kind NOT IN ('tumbling', 'sliding') THEN RAISE EXCEPTION 'stream rule rejected: window_kind is tumbling or sliding' USING ERRCODE = '22023'; END IF;
  IF p_window_days IS NULL OR p_window_days NOT BETWEEN 1 AND 366 THEN RAISE EXCEPTION 'stream rule rejected: window_days is 1..366' USING ERRCODE = '22023'; END IF;
  v_slide := CASE WHEN p_window_kind = 'tumbling' THEN coalesce(p_slide_days, p_window_days) ELSE p_slide_days END;
  IF p_window_kind = 'tumbling' AND v_slide <> p_window_days THEN RAISE EXCEPTION 'stream rule rejected: a tumbling window slides by its own length (slide_days = window_days)' USING ERRCODE = '22023'; END IF;
  IF v_slide IS NULL OR v_slide NOT BETWEEN 1 AND p_window_days THEN RAISE EXCEPTION 'stream rule rejected: a sliding window slides by 1..window_days days' USING ERRCODE = '22023'; END IF;
  IF p_window_origin IS NULL THEN RAISE EXCEPTION 'stream rule rejected: window_origin (the day windows align to) is required' USING ERRCODE = '22023'; END IF;
  IF p_allowed_lateness IS NULL OR p_allowed_lateness < interval '0' OR p_allowed_lateness > interval '366 days' THEN RAISE EXCEPTION 'stream rule rejected: allowed_lateness is 0..366 days' USING ERRCODE = '22023'; END IF;
  IF p_watermark_lag IS NULL OR p_watermark_lag < interval '0' OR p_watermark_lag > interval '366 days' THEN RAISE EXCEPTION 'stream rule rejected: watermark_lag is 0..366 days' USING ERRCODE = '22023'; END IF;
  IF p_stall_after IS NULL OR p_stall_after < interval '1 second' OR p_stall_after > interval '30 days' THEN RAISE EXCEPTION 'stream rule rejected: stall_after is 1 second..30 days' USING ERRCODE = '22023'; END IF;
  IF p_predicate IS NULL OR jsonb_typeof(p_predicate) <> 'object' OR coalesce(p_predicate ->> 'comparator', '') NOT IN ('lt', 'le', 'gt', 'ge')
     OR jsonb_typeof(p_predicate -> 'threshold') <> 'number' OR jsonb_typeof(p_predicate -> 'min_hits') <> 'number'
     OR (p_predicate ->> 'min_hits') !~ '^[0-9]+$' OR (p_predicate ->> 'min_hits')::int NOT BETWEEN 1 AND p_window_days
     OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_predicate) k WHERE k NOT IN ('comparator', 'threshold', 'min_hits')) THEN
    RAISE EXCEPTION 'stream rule rejected: predicate is {comparator: lt|le|gt|ge, threshold: number, min_hits: 1..window_days} and nothing else' USING ERRCODE = '22023';
  END IF;
  IF p_consequence IS NULL OR p_consequence NOT IN ('C1', 'C2', 'C3', 'C4') THEN RAISE EXCEPTION 'stream rule rejected: the consequence class is C1..C4' USING ERRCODE = '22023'; END IF;
  IF p_response_hours IS NOT NULL AND p_response_hours NOT BETWEEN 1 AND 8760 THEN RAISE EXCEPTION 'stream rule rejected: the response window is 1..8760 hours' USING ERRCODE = '22023'; END IF;
  IF p_checkpoint_every IS NULL OR p_checkpoint_every NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'stream rule rejected: checkpoint_every is 1..100 emissions' USING ERRCODE = '22023'; END IF;
  IF p_owner IS NULL OR NOT EXISTS (SELECT 1 FROM identity.principals p WHERE p.id = p_owner AND p.kind = 'human' AND p.status = 'active' AND p.tenant_id = p_tenant) THEN
    RAISE EXCEPTION 'stream rule rejected: the owner % is not an active named human of this tenant', coalesce(p_owner::text, '<none>') USING ERRCODE = '22023';
  END IF;
  SELECT * INTO ser FROM prediction.series_registry WHERE tenant_id = p_tenant AND domain_id = p_domain AND series_key = p_series_key;
  IF NOT FOUND THEN RAISE EXCEPTION 'stream rule rejected: no series % is registered in this domain', coalesce(p_series_key, '<none>') USING ERRCODE = '23503'; END IF;
  v_pred := jsonb_build_object('comparator', p_predicate ->> 'comparator', 'threshold', (p_predicate ->> 'threshold')::numeric, 'min_hits', (p_predicate ->> 'min_hits')::int);
  v_digest := encode(sha256(convert_to(jsonb_build_object(
    'series_key', ser.series_key, 'source_key', ser.source_key, 'parser_ref', ser.parser_ref, 'value_field', ser.value_field, 'partition', ser.selector,
    'window_kind', p_window_kind, 'window_days', p_window_days, 'slide_days', v_slide, 'window_origin', p_window_origin::text,
    'allowed_lateness_s', extract(epoch FROM p_allowed_lateness)::bigint, 'watermark_lag_s', extract(epoch FROM p_watermark_lag)::bigint,
    'stall_after_s', extract(epoch FROM p_stall_after)::bigint, 'predicate', v_pred, 'consequence_class', p_consequence,
    'response_window_hours', p_response_hours, 'checkpoint_every', p_checkpoint_every, 'topology', prediction.stream_topology_version())::text, 'UTF8')), 'hex');
  SELECT * INTO prev FROM prediction.stream_rules x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.rule_key = p_rule_key ORDER BY x.version DESC LIMIT 1 FOR UPDATE;
  IF FOUND AND prev.state IN ('draft', 'active') AND prev.rule_digest = v_digest THEN
    RAISE EXCEPTION 'stream rule rejected (unchanged): version % of % (%) has this definition; a version records a change', prev.version, p_rule_key, prev.state USING ERRCODE = '23505';
  END IF;
  IF FOUND AND prev.state = 'draft' THEN
    RAISE EXCEPTION 'stream rule rejected (open_draft): version % of % is a draft not yet activated; activate or retire it before defining another', prev.version, p_rule_key USING ERRCODE = '23505';
  END IF;
  v_version := CASE WHEN prev.rule_id IS NULL THEN 1 ELSE prev.version + 1 END;
  INSERT INTO prediction.stream_rules (rule_id, scope, tenant_id, domain_id, rule_key, version, title, series_key, source_key, partition, window_kind, window_days, slide_days,
                                       window_origin, allowed_lateness, watermark_lag, stall_after, predicate, consequence_class, response_window_hours, checkpoint_every,
                                       owner_principal_id, rule_digest, state, supersedes, defined_by, correlation_id)
  VALUES (p_rule_id, 'DOMAIN', p_tenant, p_domain, p_rule_key, v_version, btrim(p_title), ser.series_key, ser.source_key, ser.selector, p_window_kind, p_window_days, v_slide,
          p_window_origin, p_allowed_lateness, p_watermark_lag, p_stall_after, v_pred, p_consequence, p_response_hours, p_checkpoint_every,
          p_owner, v_digest, 'draft', prev.rule_id, p_actor, p_correlation)
  RETURNING * INTO v_rule;
  PERFORM prediction.stream_event(p_tenant, p_domain, NULL, v_rule.rule_id, 'rule.defined',
    jsonb_build_object('rule_key', v_rule.rule_key, 'version', v_rule.version, 'rule_digest', v_rule.rule_digest, 'series_key', v_rule.series_key, 'partition', v_rule.partition, 'supersedes', v_rule.supersedes), p_correlation);
  RETURN to_jsonb(v_rule);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.define_stream_rule(uuid, uuid, uuid, text, text, text, text, int, int, date, interval, interval, interval, jsonb, text, int, int, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.define_stream_rule(uuid, uuid, uuid, text, text, text, text, int, int, date, interval, interval, interval, jsonb, text, int, int, uuid, uuid, uuid) TO eye_commit;

-- ACTIVATE a draft: the prior active version superseded and its live processor retired (a rule change is a new processor). Human-gated at the PDP.
CREATE OR REPLACE FUNCTION prediction.activate_stream_rule(p_rule_id uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_rule prediction.stream_rules%ROWTYPE; prev prediction.stream_rules%ROWTYPE; p record; v_retired jsonb := '[]'::jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.stream.rule.activate']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'stream rule rejected: activated by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_rule FROM prediction.stream_rules WHERE rule_id = p_rule_id AND tenant_id = p_tenant AND domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'stream rule rejected: no such rule % in this domain', p_rule_id USING ERRCODE = '23503'; END IF;
  IF v_rule.state <> 'draft' THEN RAISE EXCEPTION 'stream rule rejected (not_draft): rule % (version % of %) is %; only a draft is activated', p_rule_id, v_rule.version, v_rule.rule_key, v_rule.state USING ERRCODE = '23514'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 8 AND 1000 THEN RAISE EXCEPTION 'stream rule rejected: a reason of 8..1000 characters says why the rule is activated' USING ERRCODE = '22023'; END IF;
  SELECT * INTO prev FROM prediction.stream_rules WHERE tenant_id = p_tenant AND domain_id = p_domain AND rule_key = v_rule.rule_key AND state = 'active' FOR UPDATE;
  IF FOUND THEN
    UPDATE prediction.stream_rules SET state = 'superseded', ended_at = clock_timestamp(), state_reason = format('superseded by version %s: %s', v_rule.version, btrim(p_reason)) WHERE rule_id = prev.rule_id;
    PERFORM prediction.stream_event(p_tenant, p_domain, NULL, prev.rule_id, 'rule.superseded', jsonb_build_object('by', v_rule.rule_id, 'version', v_rule.version), p_correlation);
    FOR p IN SELECT processor_id FROM prediction.stream_processors WHERE rule_id = prev.rule_id AND state <> 'retired' FOR UPDATE LOOP
      PERFORM prediction.stream_set_state(p.processor_id, 'retired', format('rule %s superseded by version %s — its outputs are no longer current', prev.rule_key, v_rule.version),
        'processor.retired', jsonb_build_object('rule_superseded_by', v_rule.rule_id), p_correlation);
      v_retired := v_retired || to_jsonb(p.processor_id);
    END LOOP;
  END IF;
  UPDATE prediction.stream_rules SET state = 'active', activated_by = p_actor, activated_at = clock_timestamp(), state_reason = btrim(p_reason) WHERE rule_id = p_rule_id RETURNING * INTO v_rule;
  PERFORM prediction.stream_event(p_tenant, p_domain, NULL, v_rule.rule_id, 'rule.activated',
    jsonb_build_object('rule_key', v_rule.rule_key, 'version', v_rule.version, 'superseded', prev.rule_id, 'retired_processors', v_retired, 'reason', btrim(p_reason)), p_correlation);
  RETURN to_jsonb(v_rule) || jsonb_build_object('superseded', prev.rule_id, 'retired_processors', v_retired);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.activate_stream_rule(uuid, uuid, uuid, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.activate_stream_rule(uuid, uuid, uuid, text, uuid, uuid) TO eye_commit;

-- START the processor of an active rule: its source, its partition key, the segments already appended (its baseline), a start checkpoint.
CREATE OR REPLACE FUNCTION prediction.start_stream_processor(p_processor uuid, p_tenant uuid, p_domain uuid, p_rule_id uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_rule prediction.stream_rules%ROWTYPE; v_source uuid; v_pk text; v_baseline jsonb; live prediction.stream_processors%ROWTYPE; pr prediction.stream_processors%ROWTYPE; v_cp uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.stream.processor.start']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'stream processor rejected (actor): started by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_rule FROM prediction.stream_rules WHERE rule_id = p_rule_id AND tenant_id = p_tenant AND domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'stream processor rejected (no_rule): no such rule % in this domain', p_rule_id USING ERRCODE = '23503'; END IF;
  IF v_rule.state <> 'active' THEN RAISE EXCEPTION 'stream processor rejected (rule_not_active): rule % (version % of %) is %; a processor runs an active rule', p_rule_id, v_rule.version, v_rule.rule_key, v_rule.state USING ERRCODE = '23514'; END IF;
  SELECT * INTO live FROM prediction.stream_processors WHERE rule_id = p_rule_id AND state <> 'retired';
  IF FOUND THEN RAISE EXCEPTION 'stream processor rejected (already_running): processor % of rule % is %; one live processor per rule', live.processor_id, v_rule.rule_key, live.state USING ERRCODE = '23505'; END IF;
  SELECT c.source_id INTO v_source FROM observation.source_contracts_current c WHERE c.tenant_id = p_tenant AND c.domain_id = p_domain AND c.source_key = v_rule.source_key
   ORDER BY c.contract_version DESC LIMIT 1;
  IF v_source IS NULL THEN RAISE EXCEPTION 'stream processor rejected (no_source): no source % is registered in this domain', v_rule.source_key USING ERRCODE = '23503'; END IF;
  v_pk := CASE WHEN v_rule.partition IS NULL THEN NULL ELSE v_rule.source_key || ':' || v_rule.partition END;
  SELECT coalesce(jsonb_object_agg(q.stream_id::text, q.max_seq), '{}'::jsonb) INTO v_baseline
    FROM (SELECT g.stream_id, max(g.seq) AS max_seq FROM observation.acquisition_segments g JOIN observation.acquisition_streams s ON s.stream_id = g.stream_id
           WHERE s.source_id = v_source AND (v_pk IS NULL OR s.partition_key = v_pk) GROUP BY g.stream_id) q;
  INSERT INTO prediction.stream_processors (processor_id, scope, tenant_id, domain_id, rule_id, rule_digest, topology_version, processor_identity, source_id, partition_key,
                                            state, state_reason, baseline, state_digest, started_by, correlation_id, last_input_at)
  VALUES (p_processor, 'DOMAIN', p_tenant, p_domain, v_rule.rule_id, v_rule.rule_digest, prediction.stream_topology_version(),
          format('%s@v%s/%s#%s', v_rule.rule_key, v_rule.version, coalesce(v_rule.partition, '*'), p_processor), v_source, v_pk, 'running', 'started',
          v_baseline, prediction.stream_digest(NULL, NULL, '[]'::jsonb), p_actor, p_correlation, NULL)
  RETURNING * INTO pr;
  PERFORM prediction.stream_event(p_tenant, p_domain, p_processor, v_rule.rule_id, 'processor.started',
    jsonb_build_object('rule_key', v_rule.rule_key, 'version', v_rule.version, 'rule_digest', v_rule.rule_digest, 'topology_version', pr.topology_version, 'source_id', v_source,
                       'partition_key', v_pk, 'baseline', v_baseline), p_correlation);
  v_cp := prediction.stream_checkpoint(p_processor, 'start', p_correlation);
  SELECT * INTO pr FROM prediction.stream_processors WHERE processor_id = p_processor;
  RETURN to_jsonb(pr) || jsonb_build_object('checkpoint_id', v_cp);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.start_stream_processor(uuid, uuid, uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.start_stream_processor(uuid, uuid, uuid, uuid, uuid, uuid) TO eye_commit;

-- THE CUSTODY of the consumer's governed read of an evidence version (the vault's discipline: every byte read is in custody) —
-- the three kinds a retrieval writes: retrieved (verified), integrity_failed (refuted), retrieval_degraded (unverified).
CREATE OR REPLACE FUNCTION prediction.stream_evidence_custody(
  p_event_id uuid, p_tenant uuid, p_domain uuid, p_manifest uuid, p_obs uuid, p_evd uuid, p_source uuid, p_contract_version int, p_event text, p_actor text,
  p_content_digest text, p_digest_verified boolean, p_details jsonb, p_correlation uuid
) RETURNS void
SECURITY DEFINER SET search_path = prediction, observation, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.stream.subscription.apply']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_event IS NULL OR p_event NOT IN ('custody.retrieved', 'custody.integrity_failed', 'custody.retrieval_degraded') THEN
    RAISE EXCEPTION 'stream input rejected: a stream''s read of evidence records custody.retrieved, custody.integrity_failed or custody.retrieval_degraded' USING ERRCODE = '22023';
  END IF;
  INSERT INTO observation.custody_events (event_id, scope, tenant_id, domain_id, manifest_id, obs_object_id, evd_object_id, source_id, contract_version, run_id, event, actor,
                                          content_digest, digest_verified, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_manifest, p_obs, p_evd, p_source, p_contract_version, NULL, p_event, p_actor,
          p_content_digest, p_digest_verified, coalesce(p_details, '{}'::jsonb) || jsonb_build_object('read_for', 'prediction.stream'), p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.stream_evidence_custody(uuid, uuid, uuid, uuid, uuid, uuid, uuid, int, text, text, text, boolean, jsonb, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.stream_evidence_custody(uuid, uuid, uuid, uuid, uuid, uuid, uuid, int, text, text, text, boolean, jsonb, uuid) TO eye_commit;

/*
 * INGEST one evidence version's points (the consumer's effect): p_rows = [{day: YYYY-MM-DD, value: number}] parsed by the series'
 * deterministic parser, or p_unreadable = the reason the governed read could not serve the bytes (recorded, never guessed at). The
 * state is VERIFIED first; each point is keyed evd@version:day (the same key and value: an audited no-op; another value: refused 409),
 * COVERED when it is a framed row of a parent page this processor already ingested with the same value, and otherwise stored with its
 * lateness against the watermark AT ARRIVAL and its disposition against the day's standing value (new | duplicate | revision). A
 * running processor then STEPS (the watermark, the windows, the signals, the candidates) and submits any owed candidate; a processor
 * that is not running stores its inputs and emits nothing (output.suspended).
 */
CREATE OR REPLACE FUNCTION prediction.ingest_stream_input(
  p_processor uuid, p_tenant uuid, p_domain uuid, p_evd uuid, p_version int, p_is_fragment boolean, p_parent_evd uuid, p_digest text, p_rows jsonb,
  p_unreadable text, p_outbox_event uuid, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE
  pr prediction.stream_processors%ROWTYPE; r prediction.stream_rules%ROWTYPE; e jsonb; v_day date; v_value numeric; v_time timestamptz; v_key text;
  v_held numeric; v_prior numeric; v_has_prior boolean; v_lateness text; v_by interval; v_windows jsonb; v_worst int; k int; v_ws timestamptz; v_we timestamptz; w record;
  v_batch bigint; v_since bigint; v_upto bigint; v_first boolean := true; v_new int := 0; v_repeated int := 0; v_covered int := 0;
  v_late jsonb := '{"on_time": 0, "late_within_allowance": 0, "late_beyond_allowance": 0}'::jsonb; v_disp jsonb := '{"new": 0, "duplicate": 0, "revision": 0}'::jsonb;
  v_verify jsonb; v_step jsonb := NULL; v_owed jsonb := '[]'::jsonb; v_max timestamptz; v_id uuid; v_wfound boolean;
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.stream.subscription.apply']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'stream processor rejected (actor): ingested by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO pr FROM prediction.stream_processors WHERE processor_id = p_processor AND tenant_id = p_tenant AND domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'stream processor rejected (no_processor): no such processor % in this domain', p_processor USING ERRCODE = '23503'; END IF;
  IF pr.state = 'retired' THEN RAISE EXCEPTION 'stream processor rejected (retired): processor % is retired (%)', p_processor, coalesce(pr.state_reason, '') USING ERRCODE = '23514'; END IF;
  IF p_evd IS NULL OR p_version IS NULL OR p_version < 1 THEN RAISE EXCEPTION 'stream input rejected: an evidence id and a positive version are required' USING ERRCODE = '22023'; END IF;
  SELECT * INTO r FROM prediction.stream_rules WHERE rule_id = pr.rule_id;

  -- UNREADABLE: the governed read refused or could not serve the bytes — recorded (the offsets count it consumed), never guessed at.
  IF p_unreadable IS NOT NULL THEN
    PERFORM prediction.stream_event(p_tenant, p_domain, p_processor, pr.rule_id, 'evidence.unreadable',
      jsonb_build_object('evd_object_id', p_evd, 'evd_version', p_version, 'reason', left(p_unreadable, 500), 'outbox_event_id', p_outbox_event), p_correlation);
    RETURN jsonb_build_object('processor_id', p_processor, 'unreadable', left(p_unreadable, 500), 'rows', 0);
  END IF;
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN RAISE EXCEPTION 'stream input rejected: rows is an array of {day, value}' USING ERRCODE = '22023'; END IF;
  -- The points come from an ADMITTED evidence version of the processor's own source (the consumer read it; the port does not take its word).
  IF NOT EXISTS (SELECT 1 FROM objects.canonical_objects o WHERE o.object_type = 'EVD' AND o.object_id = p_evd AND o.object_version = p_version
                                                            AND o.provenance_ref LIKE 'SRC:' || pr.source_id::text || '@%') THEN
    RAISE EXCEPTION 'stream input rejected: evidence %@% is not an admitted evidence version of the processor''s source', p_evd, p_version USING ERRCODE = '23503';
  END IF;

  -- VERIFY THE STATE before anything is added to it.
  IF pr.state = 'running' THEN
    v_verify := prediction.stream_verify(p_processor, p_correlation);
    SELECT * INTO pr FROM prediction.stream_processors WHERE processor_id = p_processor FOR UPDATE;
  END IF;

  SELECT coalesce(max(input_seq), 0) INTO v_since FROM prediction.stream_inputs WHERE processor_id = p_processor;
  FOR e IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    IF jsonb_typeof(e) <> 'object' OR coalesce(e ->> 'day', '') !~ '^\d{4}-\d{2}-\d{2}$' OR jsonb_typeof(e -> 'value') <> 'number' THEN
      RAISE EXCEPTION 'stream input rejected: each row is {day: YYYY-MM-DD, value: number}' USING ERRCODE = '22023';
    END IF;
    v_day := (e ->> 'day')::date; v_value := (e ->> 'value')::numeric; v_time := prediction.stream_day(v_day);
    v_key := format('evd:%s@%s:%s', p_evd, p_version, e ->> 'day');
    -- THE SAME KEY: the same value is an audited no-op (a redelivery, a replay); another value is refused.
    SELECT value INTO v_held FROM prediction.stream_inputs WHERE processor_id = p_processor AND event_key = v_key;
    IF FOUND THEN
      IF v_held IS DISTINCT FROM v_value THEN
        RAISE EXCEPTION 'stream input rejected (value_conflict): % is held with value %, not %; an event key holds one value', v_key, v_held, v_value USING ERRCODE = '23505';
      END IF;
      v_repeated := v_repeated + 1;
      CONTINUE;
    END IF;
    -- COVERED: a framed row whose parent page this processor ingested with the same value (the fragment IS the parent's bytes).
    IF p_parent_evd IS NOT NULL AND EXISTS (SELECT 1 FROM prediction.stream_inputs i WHERE i.processor_id = p_processor AND i.evd_object_id = p_parent_evd
                                                                                      AND i.event_time = v_time AND i.value = v_value) THEN
      v_covered := v_covered + 1;
      CONTINUE;
    END IF;
    -- THE DAY'S STANDING VALUE (the latest arrival): new | duplicate | revision.
    SELECT i.value INTO v_prior FROM prediction.stream_inputs i WHERE i.processor_id = p_processor AND i.event_time = v_time ORDER BY i.input_seq DESC LIMIT 1;
    v_has_prior := FOUND;
    -- LATENESS against the watermark AT ARRIVAL, by the windows containing the day: the worst of them.
    v_windows := '[]'::jsonb; v_worst := 0;
    FOR k IN prediction.stream_fdiv((v_day - r.window_origin) - r.window_days + r.slide_days, r.slide_days) .. prediction.stream_fdiv(v_day - r.window_origin, r.slide_days) LOOP
      v_ws := prediction.stream_day(r.window_origin + k * r.slide_days); v_we := prediction.stream_day(r.window_origin + k * r.slide_days + r.window_days);
      SELECT status INTO w FROM prediction.stream_windows x WHERE x.processor_id = p_processor AND x.window_start = v_ws;
      v_wfound := FOUND;
      IF v_wfound AND w.status = 'closed' THEN v_worst := greatest(v_worst, 2);
      ELSIF v_wfound AND w.status IN ('fired', 'revised') THEN v_worst := greatest(v_worst, 1);
      ELSIF pr.watermark IS NOT NULL AND v_we <= pr.watermark THEN
        v_worst := greatest(v_worst, CASE WHEN v_we + r.allowed_lateness <= pr.watermark THEN 2 ELSE 1 END);
      END IF;
      v_windows := v_windows || jsonb_build_object('window_start', prediction.stream_ts(v_ws), 'status', CASE WHEN v_wfound THEN w.status ELSE 'none' END);
    END LOOP;
    v_lateness := CASE v_worst WHEN 2 THEN 'late_beyond_allowance' WHEN 1 THEN 'late_within_allowance' ELSE 'on_time' END;
    v_by := CASE WHEN v_worst > 0 THEN pr.watermark - v_time ELSE NULL END;
    INSERT INTO prediction.stream_inputs (input_id, scope, tenant_id, domain_id, processor_id, event_key, evd_object_id, evd_version, is_fragment, content_digest,
                                          event_time, value, watermark_at_arrival, lateness, lateness_by, disposition, prior_value, windows, outbox_event_id, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_processor, v_key, p_evd, p_version, coalesce(p_is_fragment, false), p_digest,
            v_time, v_value, pr.watermark, v_lateness, v_by,
            CASE WHEN NOT v_has_prior THEN 'new' WHEN v_prior = v_value THEN 'duplicate' ELSE 'revision' END,
            CASE WHEN v_has_prior AND v_prior <> v_value THEN v_prior END, v_windows, p_outbox_event, p_correlation)
    RETURNING input_id INTO v_id;
    v_new := v_new + 1;
    v_late := jsonb_set(v_late, ARRAY[v_lateness], to_jsonb((v_late ->> v_lateness)::int + 1));
    v_disp := jsonb_set(v_disp, ARRAY[CASE WHEN NOT v_has_prior THEN 'new' WHEN v_prior = v_value THEN 'duplicate' ELSE 'revision' END],
                        to_jsonb((v_disp ->> CASE WHEN NOT v_has_prior THEN 'new' WHEN v_prior = v_value THEN 'duplicate' ELSE 'revision' END)::int + 1));
  END LOOP;
  SELECT coalesce(max(input_seq), 0), max(event_time) INTO v_upto, v_max FROM prediction.stream_inputs WHERE processor_id = p_processor AND input_seq > v_since;
  v_upto := greatest(v_upto, v_since);
  -- THE BATCH: this call's inputs, [first, last] arrival sequence — recorded on the ledger row below (a replay steps one batch at a time).
  v_batch := (SELECT min(input_seq) FROM prediction.stream_inputs WHERE processor_id = p_processor AND input_seq > v_since);

  PERFORM prediction.stream_event(p_tenant, p_domain, p_processor, pr.rule_id, 'evidence.ingested',
    jsonb_build_object('evd_object_id', p_evd, 'evd_version', p_version, 'is_fragment', coalesce(p_is_fragment, false), 'parent_evd_id', p_parent_evd,
                       'rows', jsonb_array_length(p_rows), 'recorded', v_new, 'repeated', v_repeated, 'covered', v_covered, 'lateness', v_late, 'disposition', v_disp,
                       'batch_from_seq', v_batch, 'batch_to_seq', CASE WHEN v_new > 0 THEN v_upto END, 'outbox_event_id', p_outbox_event), p_correlation);
  IF v_repeated > 0 AND v_new = 0 THEN
    PERFORM prediction.stream_event(p_tenant, p_domain, p_processor, pr.rule_id, 'input.repeated',
      jsonb_build_object('evd_object_id', p_evd, 'evd_version', p_version, 'repeated', v_repeated, 'note', 'a redelivered or replayed input: recorded, nothing applied twice'), p_correlation);
  END IF;

  IF v_new > 0 THEN
    UPDATE prediction.stream_processors SET max_event_time = greatest(max_event_time, v_max), last_input_at = clock_timestamp(), inputs = inputs + v_new
     WHERE processor_id = p_processor RETURNING * INTO pr;
    IF pr.state = 'running' THEN
      v_step := prediction.stream_step(p_processor, 'ingest', v_since, v_upto, p_correlation);
    ELSE
      PERFORM prediction.stream_event(p_tenant, p_domain, p_processor, pr.rule_id, 'output.suspended',
        jsonb_build_object('why', pr.state, 'inputs', v_new, 'note', 'the processor is not running: its inputs are stored and labelled, nothing is emitted until it is recovered'), p_correlation);
    END IF;
  END IF;
  v_owed := prediction.stream_submit_owed(p_processor, p_correlation);
  SELECT * INTO pr FROM prediction.stream_processors WHERE processor_id = p_processor;
  RETURN jsonb_build_object('processor_id', p_processor, 'state', pr.state, 'rows', jsonb_array_length(p_rows), 'recorded', v_new, 'repeated', v_repeated, 'covered', v_covered,
                            'lateness', v_late, 'disposition', v_disp, 'watermark', prediction.stream_ts(pr.watermark), 'verify', v_verify, 'step', v_step, 'owed_submitted', v_owed);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.ingest_stream_input(uuid, uuid, uuid, uuid, int, boolean, uuid, text, jsonb, text, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.ingest_stream_input(uuid, uuid, uuid, uuid, int, boolean, uuid, text, jsonb, text, uuid, uuid, uuid) TO eye_commit;

-- RECONCILE the source offsets (internal): a divergence suspends the outputs of a running or stalled processor with the gap named.
CREATE OR REPLACE FUNCTION prediction.stream_reconcile(p_processor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, public, pg_catalog, pg_temp AS $$
DECLARE pr prediction.stream_processors%ROWTYPE; v_off jsonb;
BEGIN
  SELECT * INTO pr FROM prediction.stream_processors WHERE processor_id = p_processor FOR UPDATE;
  v_off := prediction.stream_offsets(p_processor);
  UPDATE prediction.stream_processors SET source_offsets = v_off WHERE processor_id = p_processor;
  IF (v_off ->> 'diverged')::boolean THEN
    PERFORM prediction.stream_event(pr.tenant_id, pr.domain_id, p_processor, pr.rule_id, 'offsets.diverged',
      jsonb_build_object('missing', v_off -> 'missing', 'streams', v_off -> 'streams',
                         'note', 'segments of the partition carry evidence this processor never consumed: its outputs cannot be presented as reconciled'), p_correlation);
    IF pr.state IN ('running', 'stalled', 'recovering') THEN
      PERFORM prediction.stream_set_state(p_processor, 'suspended',
        format('offsets diverged: %s segment(s) of the partition carry evidence never consumed (first: stream %s seq %s, %s..%s)', jsonb_array_length(v_off -> 'missing'),
               v_off #>> '{missing,0,stream_id}', v_off #>> '{missing,0,seq}', v_off #>> '{missing,0,range_from}', v_off #>> '{missing,0,range_to}'),
        'processor.suspended', jsonb_build_object('gap', v_off -> 'missing'), p_correlation);
      PERFORM prediction.stream_event(pr.tenant_id, pr.domain_id, p_processor, pr.rule_id, 'output.suspended',
        jsonb_build_object('why', 'offsets diverged', 'gap', v_off -> 'missing'), p_correlation);
    END IF;
  ELSE
    PERFORM prediction.stream_event(pr.tenant_id, pr.domain_id, p_processor, pr.rule_id, 'offsets.reconciled', jsonb_build_object('streams', v_off -> 'streams'), p_correlation);
  END IF;
  RETURN v_off;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.stream_reconcile(uuid, uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION prediction.reconcile_stream_offsets(p_processor uuid, p_tenant uuid, p_domain uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE pr prediction.stream_processors%ROWTYPE; v_off jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.stream.processor.reconcile']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'stream processor rejected (actor): reconciled by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO pr FROM prediction.stream_processors WHERE processor_id = p_processor AND tenant_id = p_tenant AND domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'stream processor rejected (no_processor): no such processor % in this domain', p_processor USING ERRCODE = '23503'; END IF;
  IF pr.state = 'retired' THEN RAISE EXCEPTION 'stream processor rejected (retired): processor % is retired (%)', p_processor, coalesce(pr.state_reason, '') USING ERRCODE = '23514'; END IF;
  v_off := prediction.stream_reconcile(p_processor, p_correlation);
  SELECT * INTO pr FROM prediction.stream_processors WHERE processor_id = p_processor;
  RETURN jsonb_build_object('processor_id', p_processor, 'state', pr.state, 'state_reason', pr.state_reason, 'offsets', v_off);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.reconcile_stream_offsets(uuid, uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.reconcile_stream_offsets(uuid, uuid, uuid, uuid, uuid) TO eye_commit;

/*
 * RECOVER (a named human; human-gated at the PDP): only a suspended, stalled or corrupt processor. The newest COMPATIBLE checkpoint —
 * the processor's rule digest, this engine's topology version, a snapshot whose digest verifies (every newer one skipped is recorded
 * checkpoint.incompatible with why) — is RESTORED (the windows, the watermark, the input offset), the stored inputs after it are
 * REPLAYED one arrival batch at a time (the live path's own order), every emission that differs from a standing signal labelled
 * `recovered` and every one that does not suppressed; the offsets are reconciled (a divergence leaves it suspended, the gap named);
 * otherwise it runs again from a recovery checkpoint.
 */
CREATE OR REPLACE FUNCTION prediction.recover_stream_processor(p_processor uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE pr prediction.stream_processors%ROWTYPE; r prediction.stream_rules%ROWTYPE; c prediction.stream_checkpoints%ROWTYPE; cc prediction.stream_checkpoints%ROWTYPE;
        v_from text; b record; v_steps jsonb := '[]'::jsonb; v_step jsonb; v_off jsonb; v_cp uuid; v_skipped jsonb := '[]'::jsonb; v_why text; v_emitted int := 0; v_suppressed int := 0;
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.stream.processor.recover']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'stream processor rejected (actor): recovered by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO pr FROM prediction.stream_processors WHERE processor_id = p_processor AND tenant_id = p_tenant AND domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'stream processor rejected (no_processor): no such processor % in this domain', p_processor USING ERRCODE = '23503'; END IF;
  IF pr.state NOT IN ('suspended', 'stalled', 'corrupt') THEN
    RAISE EXCEPTION 'stream processor rejected (not_recoverable): processor % is %; only a suspended, stalled or corrupt processor is recovered', p_processor, pr.state USING ERRCODE = '23514';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 8 AND 1000 THEN RAISE EXCEPTION 'stream processor rejected: a reason of 8..1000 characters says why the processor is recovered' USING ERRCODE = '22023'; END IF;
  SELECT * INTO r FROM prediction.stream_rules WHERE rule_id = pr.rule_id;
  v_from := pr.state;
  -- THE CHECKPOINT: the newest compatible one; every newer one skipped says why.
  FOR cc IN SELECT * FROM prediction.stream_checkpoints WHERE processor_id = p_processor ORDER BY checkpoint_seq DESC LOOP
    v_why := CASE WHEN cc.rule_digest <> pr.rule_digest THEN format('rule digest %s is not the processor''s %s', left(cc.rule_digest, 12), left(pr.rule_digest, 12))
                  WHEN cc.topology_version <> prediction.stream_topology_version() THEN format('topology %s is not %s', cc.topology_version, prediction.stream_topology_version())
                  WHEN prediction.stream_digest(cc.watermark, cc.max_event_time, cc.windows) <> cc.state_digest THEN 'its snapshot does not verify against its own digest'
                  ELSE NULL END;
    IF v_why IS NULL THEN c := cc; EXIT; END IF;
    PERFORM prediction.stream_event(p_tenant, p_domain, p_processor, pr.rule_id, 'checkpoint.incompatible', jsonb_build_object('checkpoint_id', cc.checkpoint_id, 'why', v_why), p_correlation);
    v_skipped := v_skipped || jsonb_build_object('checkpoint_id', cc.checkpoint_id, 'why', v_why);
  END LOOP;
  IF c.checkpoint_id IS NULL THEN
    RAISE EXCEPTION 'stream processor rejected (no_compatible_checkpoint): processor % has no checkpoint of rule digest % and topology % whose snapshot verifies', p_processor, left(pr.rule_digest, 12), prediction.stream_topology_version() USING ERRCODE = '23514';
  END IF;
  PERFORM prediction.stream_set_state(p_processor, 'recovering', btrim(p_reason), 'processor.recovering',
    jsonb_build_object('from', v_from, 'checkpoint_id', c.checkpoint_id, 'checkpoint_input_seq', c.input_seq, 'skipped', v_skipped), p_correlation);
  -- RESTORE the snapshot.
  DELETE FROM prediction.stream_windows WHERE processor_id = p_processor;
  INSERT INTO prediction.stream_windows (processor_id, window_start, window_end, scope, tenant_id, domain_id, status, completeness, incomplete_range_ids, value, holds,
                                         late_inputs, late_excluded, revision, closed_input_seq, fired_at, closed_at)
  SELECT p_processor, (x ->> 'window_start')::timestamptz, (x ->> 'window_end')::timestamptz, 'DOMAIN', p_tenant, p_domain, x ->> 'status', x ->> 'completeness',
         coalesce(x -> 'incomplete_range_ids', '[]'::jsonb), coalesce(x -> 'value', '{}'::jsonb), (CASE WHEN jsonb_typeof(x -> 'holds') = 'boolean' THEN (x ->> 'holds')::boolean END),
         coalesce((x ->> 'late_inputs')::int, 0), coalesce((x ->> 'late_excluded')::int, 0), coalesce((x ->> 'revision')::int, -1), (x ->> 'closed_input_seq')::bigint,
         CASE WHEN x ->> 'status' <> 'open' THEN clock_timestamp() END, CASE WHEN x ->> 'status' = 'closed' THEN clock_timestamp() END
    FROM jsonb_array_elements(c.windows) x;
  UPDATE prediction.stream_processors SET watermark = c.watermark, max_event_time = c.max_event_time, input_seq = c.input_seq WHERE processor_id = p_processor;
  -- REPLAY the inputs after it, one arrival batch at a time (a batch: the inputs one evidence.ingested row recorded).
  FOR b IN SELECT (e.details ->> 'batch_from_seq')::bigint AS lo, (e.details ->> 'batch_to_seq')::bigint AS hi
             FROM prediction.stream_processor_events e
            WHERE e.processor_id = p_processor AND e.event = 'evidence.ingested' AND (e.details ->> 'batch_to_seq') IS NOT NULL AND (e.details ->> 'batch_to_seq')::bigint > c.input_seq
            ORDER BY (e.details ->> 'batch_from_seq')::bigint LOOP
    UPDATE prediction.stream_processors SET max_event_time = (SELECT max(event_time) FROM prediction.stream_inputs WHERE processor_id = p_processor AND input_seq <= b.hi)
     WHERE processor_id = p_processor;
    v_step := prediction.stream_step(p_processor, 'recover', greatest(b.lo - 1, c.input_seq), b.hi, p_correlation);
    v_emitted := v_emitted + coalesce((v_step ->> 'emitted')::int, 0);
    v_suppressed := v_suppressed + jsonb_array_length(coalesce(v_step -> 'suppressed', '[]'::jsonb));
    v_steps := v_steps || jsonb_build_object('batch', jsonb_build_array(b.lo, b.hi), 'emitted', v_step -> 'emitted', 'suppressed', v_step -> 'suppressed');
  END LOOP;
  -- A final pass over the whole log (a restored window that no batch touched is re-judged against its standing signal).
  v_step := prediction.stream_step(p_processor, 'recover', (SELECT coalesce(max(input_seq), 0) FROM prediction.stream_inputs WHERE processor_id = p_processor),
                                   (SELECT coalesce(max(input_seq), 0) FROM prediction.stream_inputs WHERE processor_id = p_processor), p_correlation);
  v_emitted := v_emitted + coalesce((v_step ->> 'emitted')::int, 0);
  v_suppressed := v_suppressed + jsonb_array_length(coalesce(v_step -> 'suppressed', '[]'::jsonb));
  -- THE OFFSETS: a divergence leaves the processor suspended, the gap named.
  v_off := prediction.stream_reconcile(p_processor, p_correlation);
  SELECT * INTO pr FROM prediction.stream_processors WHERE processor_id = p_processor FOR UPDATE;
  IF pr.state = 'suspended' THEN
    UPDATE prediction.stream_processors SET state_digest = prediction.stream_state_digest(p_processor) WHERE processor_id = p_processor;
    RETURN jsonb_build_object('processor_id', p_processor, 'recovered', false, 'state', 'suspended', 'state_reason', pr.state_reason, 'from', v_from,
                              'checkpoint_id', c.checkpoint_id, 'skipped', v_skipped, 'replayed', v_steps, 'emitted', v_emitted, 'suppressed', v_suppressed, 'offsets', v_off);
  END IF;
  UPDATE prediction.stream_processors SET state_digest = prediction.stream_state_digest(p_processor), last_input_at = clock_timestamp(), last_watermark_move_at = clock_timestamp()
   WHERE processor_id = p_processor;
  PERFORM prediction.stream_set_state(p_processor, 'running', format('recovered from checkpoint %s: %s', c.checkpoint_id, btrim(p_reason)), 'processor.recovered',
    jsonb_build_object('from', v_from, 'checkpoint_id', c.checkpoint_id, 'emitted', v_emitted, 'suppressed', v_suppressed), p_correlation);
  v_cp := prediction.stream_checkpoint(p_processor, 'recovered', p_correlation);
  SELECT * INTO pr FROM prediction.stream_processors WHERE processor_id = p_processor;
  RETURN jsonb_build_object('processor_id', p_processor, 'recovered', true, 'state', pr.state, 'from', v_from, 'checkpoint_id', c.checkpoint_id, 'skipped', v_skipped,
                            'replayed', v_steps, 'emitted', v_emitted, 'suppressed', v_suppressed, 'offsets', v_off, 'recovery_checkpoint_id', v_cp,
                            'watermark', prediction.stream_ts(pr.watermark));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.recover_stream_processor(uuid, uuid, uuid, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.recover_stream_processor(uuid, uuid, uuid, text, uuid, uuid) TO eye_commit;

-- RETRACT a signal (a named human; human-gated at the PDP): a retraction row of its own, the reason stated; nothing is submitted.
CREATE OR REPLACE FUNCTION prediction.retract_stream_signal(p_signal uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE g prediction.stream_signals%ROWTYPE; t prediction.stream_signals%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.stream.signal.retract']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'stream signal rejected: retracted by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO g FROM prediction.stream_signals WHERE signal_id = p_signal AND tenant_id = p_tenant AND domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'stream signal rejected: no such signal % in this domain', p_signal USING ERRCODE = '23503'; END IF;
  IF g.emission = 'retracted' THEN RAISE EXCEPTION 'stream signal rejected (not_an_emission): signal % is itself a retraction', p_signal USING ERRCODE = '23514'; END IF;
  IF EXISTS (SELECT 1 FROM prediction.stream_signals x WHERE x.retracts = p_signal) THEN
    RAISE EXCEPTION 'stream signal rejected (already_retracted): signal % was retracted already', p_signal USING ERRCODE = '23514';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 8 AND 1000 THEN RAISE EXCEPTION 'stream signal rejected: a reason of 8..1000 characters says why the signal is retracted' USING ERRCODE = '22023'; END IF;
  INSERT INTO prediction.stream_signals (signal_id, scope, tenant_id, domain_id, processor_id, rule_id, window_start, window_end, revision, emission, label, retracts, retraction_kind,
                                         value, holds, completeness, incomplete_range_ids, lateness, watermark, checkpoint_id, reason, emitted_by, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', g.tenant_id, g.domain_id, g.processor_id, g.rule_id, g.window_start, g.window_end, g.revision, 'retracted', g.label, g.signal_id, 'operator',
          g.value, g.holds, g.completeness, g.incomplete_range_ids, g.lateness, g.watermark, g.checkpoint_id, btrim(p_reason), p_actor, p_correlation)
  RETURNING * INTO t;
  PERFORM prediction.stream_event(p_tenant, p_domain, g.processor_id, g.rule_id, 'signal.retracted',
    jsonb_build_object('signal_id', g.signal_id, 'retraction_id', t.signal_id, 'window_start', prediction.stream_ts(g.window_start), 'revision', g.revision, 'reason', btrim(p_reason), 'by', 'operator'), p_correlation);
  RETURN to_jsonb(t);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.retract_stream_signal(uuid, uuid, uuid, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.retract_stream_signal(uuid, uuid, uuid, text, uuid, uuid) TO eye_commit;

-- THE SWEEP (a step of the attention tick, executive.attention.tick): every running processor of the domain VERIFIED (a mismatch →
-- corrupt) and checked for a STALL on the database clock — no input for stall_after, or a watermark that has not moved for stall_after
-- while inputs wait in open windows → stalled, outputs suspended. Never raises for a processor's condition: it records it.
CREATE OR REPLACE FUNCTION prediction.sweep_stream_processors(p_tenant uuid, p_domain uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE pr prediction.stream_processors%ROWTYPE; r prediction.stream_rules%ROWTYPE; v_now timestamptz := clock_timestamp(); v_checked int := 0;
        v_stalled jsonb := '[]'::jsonb; v_corrupt jsonb := '[]'::jsonb; v_verify jsonb; v_why text; v_waiting int;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.attention.tick']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  FOR pr IN SELECT * FROM prediction.stream_processors WHERE tenant_id = p_tenant AND domain_id = p_domain AND state = 'running' ORDER BY started_at FOR UPDATE LOOP
    v_checked := v_checked + 1;
    SELECT * INTO r FROM prediction.stream_rules WHERE rule_id = pr.rule_id;
    v_verify := prediction.stream_verify(pr.processor_id, p_correlation);
    IF NOT (v_verify ->> 'verified')::boolean THEN
      v_corrupt := v_corrupt || jsonb_build_object('processor_id', pr.processor_id, 'retracted', v_verify -> 'retracted');
      CONTINUE;
    END IF;
    SELECT count(*)::int INTO v_waiting FROM prediction.stream_windows w WHERE w.processor_id = pr.processor_id AND w.status = 'open' AND (w.value ->> 'n')::int > 0;
    v_why := CASE
      WHEN v_now - coalesce(pr.last_input_at, pr.started_at) > r.stall_after
        THEN format('no input for %s (stall_after %s): the stream has gone quiet — its outputs are not current', date_trunc('second', v_now - coalesce(pr.last_input_at, pr.started_at)), r.stall_after)
      WHEN v_waiting > 0 AND pr.last_watermark_move_at IS NOT NULL AND pr.last_input_at > pr.last_watermark_move_at AND v_now - pr.last_watermark_move_at > r.stall_after
        THEN format('the watermark has not moved for %s while %s open window(s) hold inputs: inputs arrive but event time does not advance', date_trunc('second', v_now - pr.last_watermark_move_at), v_waiting)
      ELSE NULL END;
    IF v_why IS NOT NULL THEN
      PERFORM prediction.stream_set_state(pr.processor_id, 'stalled', v_why, 'processor.stalled',
        jsonb_build_object('last_input_at', prediction.stream_ts(pr.last_input_at), 'last_watermark_move_at', prediction.stream_ts(pr.last_watermark_move_at),
                           'watermark', prediction.stream_ts(pr.watermark), 'checked_at', prediction.stream_ts(v_now), 'stall_after', r.stall_after::text), p_correlation);
      PERFORM prediction.stream_event(p_tenant, p_domain, pr.processor_id, pr.rule_id, 'output.suspended',
        jsonb_build_object('why', 'stalled', 'note', 'no signal of this processor is presented as current until it is recovered'), p_correlation);
      v_stalled := v_stalled || jsonb_build_object('processor_id', pr.processor_id, 'why', v_why);
    END IF;
  END LOOP;
  RETURN jsonb_build_object('checked', v_checked, 'stalled', v_stalled, 'corrupt', v_corrupt, 'at', prediction.stream_ts(v_now));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.sweep_stream_processors(uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.sweep_stream_processors(uuid, uuid, uuid, uuid) TO eye_commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- section `warnings`
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §W (section `warnings`) — CP-6 B28, F-P4-12: THE EARLY-WARNING LIFECYCLE (2026-09-26).
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- Every warning before B28 was an indicator breach (0029/0031/0061/0065/0081): one flip, one warning, an owner, a window, an expiry
-- that waited for the next indicator evaluation, and nothing after. §W gives the warning its LIFECYCLE on top of the prelude's intake
-- (0088 §0: prediction.warning_candidates + prediction.submit_warning_candidate):
--
--   (W1) THE CANDIDATE PROCESSING — prediction.process_warning_candidates (the attention tick's step `warning-candidates`, order 5, under
--        executive.attention.tick; and a person's route under prediction.warning.candidates.process): per pending candidate (FOR UPDATE
--        SKIP LOCKED, bounded) the DEDUPLICATION KEY (the cause key + the sorted affected objectives + the sorted geographies + the
--        horizon — distinct causes, objectives, geographies and horizons stay distinct warnings); a candidate whose key has an OPEN warning
--        is CLUSTERED into it (a member row with its stance, source, evidence, cause, geography and horizon; `warning.clustered`; no new
--        warning, no new EarlyWarningRaised); the STORM rule (prediction.warning_storm_rule(): more than max_raises raises of one cause
--        within window_minutes → the rest are members of the storm's LEAD, member kind `storm`, the storm visible on the lead); an
--        unclustered candidate is RAISE-DUE. THE RAISE is prediction.raise_candidate_warning under prediction.warning.raise (a separate
--        governed write per candidate, the indicator evaluation's idiom): it calls prediction.raise_warning (0081:709, UNCHANGED — no
--        branch, the declared class) and sets origin_kind / origin_ref / cluster_id (0088 §0 columns), the cluster and its lead member.
--        prediction.warning_candidate_preflight decides a candidate again under the raise's own lock (cluster, storm, or raise).
--   (W2) THE CONTEXT — prediction.set_warning_context (the owner or a domain administrator; versioned by context_version, a stale
--        version refused): contradicting evidence (objects of this domain), the AFFECTED objectives (checked against graph.strategy_current
--        OBJ), assets, actors, geographies and horizon, the FALSIFICATION conditions, the verification / simulation PLAYBOOK (a scenario,
--        a branch of it, a run — each must exist); `warning.context_set` with the whole context.
--   (W3) EXPIRY THAT ESCALATES — prediction.expire_warnings re-declared (0031:168's body verbatim, ONE block): it admits
--        executive.attention.tick (the tick step `warning-expiry`, order 6 — expiry no longer waits for an indicator evaluation), and an
--        expired warning's LIVE attention item (warning.raised, open | escalated | unrouted) is ESCALATED AT ONCE under its own policy
--        version (the class's escalation roles joined, the deadline renewed, bounded by max_escalations — exhausted recorded) with
--        `warning.escalated` on the warning.
--   (W4) CLOSURE — prediction.close_warning (the owner or a domain administrator; criterion resolved | falsified (a declared condition
--        held) | duplicate (of an existing warning) | no_longer_relevant; a reason); `warning.closed`.
--   (W5) FEEDBACK AND EVALUATION — prediction.record_warning_feedback (false | late | missed | duplicated | useful; one per person, warning and
--        kind — a repeat answers `repeated`; append-only; `warning.feedback`) and prediction.evaluate_warnings (a NAMED HUMAN's act —
--        executive, domain_admin or platform_admin — the 0086 §G4 shape: the rates BY ORIGIN, T3 = the share raised before the decision
--        deadline, the acknowledgement p50/p90 on the warning's own clock, each abstaining below min_sample; append-only).
--   (W6) COVERAGE GAPS — prediction.warning_coverage_gaps (a read): the ACTIVE source-impact markers on the warning, on its forecast and
--        on its members' sources (observation.source_impact_markers).
--   (W7) THE STATE DERIVATIONS SKIP THE NEW NON-STATE EVENTS — prediction.rebuild_projections (0065:1271) and decision.warning_state_as_of
--        (0048:394) re-declared, each with ONE change. 0088 §0 widened warning_events with five non-state events; both derivations read
--        "anything else" as `closed`, so a clustered, context-set, escalated or feedback event would have read as a closure (the projection
--        check would report a mismatch; a replay would read a live warning as closed). The projection now reads the four state events
--        (0065 already left warning.attention out); the as-of read skips the five new events and is otherwise unchanged (its pre-existing
--        reading of 0065's `warning.attention` as `closed` is reported, not changed). The briefing's as-of state (briefing.service.ts) gets
--        the same skip in TS.
--
-- NOT HERE (stated): prediction.raise_warning (unchanged; called); the attention engine (executive.* — the expiry escalates the linked
-- item through the table's own rules, mirroring escalate_attention_due's bounded step for ONE item, and never re-declares an engine
-- function); the markers' functions; the intake (0088 §0); the retraction of a warning (`warning.retracted` stays unused by §W: a
-- stream signal's retraction submits nothing — the streams part — and a person CLOSES a warning); a RAISE BY THE TICK (the tick is
-- bound to executive.attention.tick and raise_warning asserts prediction.warning.raise alone — a raise-due candidate stays PENDING,
-- counted as `raise_owed` on the tick's step, until a person's processing raises it under prediction.warning.raise; stated in the
-- report); delivery channels beyond in_app (a real provider is owner decision D6 — the attention section's notify rule); the coverage
-- REMEDIATION (observation.coverage_remediations, the remediation part — joined to the gaps by the integrator); the interface register
-- (unchanged, 50/0/0: the warnings keep EarlyWarningRaised@v1, no key added).

-- ============================================================
-- §W0 THE WARNING'S LIFECYCLE COLUMNS
-- ============================================================
ALTER TABLE prediction.warnings_current
  ADD COLUMN contradicting   jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(contradicting) = 'array'),
  ADD COLUMN affected        jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(affected) = 'object'),
  ADD COLUMN falsification   jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(falsification) = 'array'),
  ADD COLUMN playbook        jsonb CHECK (playbook IS NULL OR jsonb_typeof(playbook) = 'object'),
  ADD COLUMN context_version int NOT NULL DEFAULT 0 CHECK (context_version >= 0),
  ADD COLUMN closure         jsonb CHECK (closure IS NULL OR jsonb_typeof(closure) = 'object'),
  ADD COLUMN closed_at       timestamptz,
  ADD COLUMN closed_by       uuid;
ALTER TABLE prediction.warnings_current ADD CONSTRAINT wrn_closure_bound CHECK ((closed_at IS NULL) = (closed_by IS NULL) AND (closure IS NULL OR closed_at IS NOT NULL));
COMMENT ON COLUMN prediction.warnings_current.contradicting IS 'B28 (0088 §W): the contradicting evidence a person set on the warning (the context port); the members'' contradicting reports are read from prediction.warning_cluster_members beside it.';
COMMENT ON COLUMN prediction.warnings_current.affected IS 'B28 (0088 §W): {objectives (OBJ of this domain), assets, actors, geographies, horizon} — seeded from the raising candidate, replaced by the context port.';
COMMENT ON COLUMN prediction.warnings_current.playbook IS 'B28 (0088 §W): the verification or simulation playbook — {kind: verification | simulation, scenario_id, branch_id?, run_id?, note?}; each reference exists.';
CREATE INDEX wrn_cluster ON prediction.warnings_current (cluster_id) WHERE cluster_id IS NOT NULL;

-- ============================================================
-- §W1 CLUSTERS, MEMBERS, FEEDBACK, EVALUATIONS (append-only)
-- ============================================================
-- A cluster is ONE warning's deduplication record: its key (cause | objectives | geographies | horizon) and its lead. Immutable.
CREATE TABLE prediction.warning_clusters (
  cluster_id      uuid PRIMARY KEY,
  scope           text NOT NULL,
  tenant_id       uuid NOT NULL,
  domain_id       uuid NOT NULL,
  lead_warning_id uuid NOT NULL REFERENCES prediction.warnings_current (warning_id),
  dedup_key       text NOT NULL CHECK (length(dedup_key) BETWEEN 1 AND 2000),
  cause_key       text NOT NULL CHECK (length(cause_key) BETWEEN 1 AND 300),
  objectives      jsonb NOT NULL CHECK (jsonb_typeof(objectives) = 'array'),
  geographies     jsonb NOT NULL CHECK (jsonb_typeof(geographies) = 'array'),
  horizon         text,
  storm_rule      jsonb NOT NULL CHECK (jsonb_typeof(storm_rule) = 'object'),
  created_by      uuid NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id  uuid NOT NULL,
  CONSTRAINT pwcl_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT pwcl_one_per_warning UNIQUE (lead_warning_id)
);
CREATE INDEX pwcl_key ON prediction.warning_clusters (tenant_id, domain_id, dedup_key);
CREATE INDEX pwcl_cause ON prediction.warning_clusters (tenant_id, domain_id, cause_key, created_at);
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON prediction.warning_clusters FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE prediction.warning_clusters IS 'B28 (0088 §W): one warning''s deduplication record — the key (cause key, sorted affected objectives, sorted geographies, horizon), the lead warning, the storm rule in force at the raise; append-only (F-P4-12).';

-- A member is ONE candidate folded into a warning: the lead (the candidate that raised it), a duplicate (same key) or a storm member
-- (the same cause beyond the storm rule, a DIFFERENT key kept on the member) — each with its stance and what it saw.
CREATE TABLE prediction.warning_cluster_members (
  member_id      uuid PRIMARY KEY,
  scope          text NOT NULL,
  tenant_id      uuid NOT NULL,
  domain_id      uuid NOT NULL,
  cluster_id     uuid NOT NULL REFERENCES prediction.warning_clusters (cluster_id),
  warning_id     uuid NOT NULL REFERENCES prediction.warnings_current (warning_id),
  candidate_id   uuid NOT NULL REFERENCES prediction.warning_candidates (candidate_id),
  member_kind    text NOT NULL CHECK (member_kind IN ('lead', 'duplicate', 'storm')),
  stance         text NOT NULL CHECK (stance IN ('supporting', 'contradicting')),
  origin_kind    text NOT NULL,
  origin_key     text NOT NULL,
  source_id      uuid,
  evidence       jsonb NOT NULL CHECK (jsonb_typeof(evidence) = 'array'),
  cause_key      text NOT NULL,
  dedup_key      text NOT NULL,
  objectives     jsonb NOT NULL CHECK (jsonb_typeof(objectives) = 'array'),
  geographies    jsonb NOT NULL CHECK (jsonb_typeof(geographies) = 'array'),
  horizon        text,
  title          text NOT NULL,
  confidence     numeric,
  joined_by      uuid NOT NULL,
  joined_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id uuid NOT NULL,
  CONSTRAINT pwcm_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT pwcm_once UNIQUE (candidate_id)
);
CREATE INDEX pwcm_warning ON prediction.warning_cluster_members (warning_id, joined_at);
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON prediction.warning_cluster_members FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE prediction.warning_cluster_members IS 'B28 (0088 §W): each candidate folded into a warning — lead | duplicate | storm — with its stance (supporting | contradicting), source, evidence, cause, objectives, geographies and horizon; append-only.';

-- FEEDBACK: one per (warning, person, kind); append-only (a person's verdict is history, never edited).
CREATE TABLE prediction.warning_feedback (
  feedback_id    uuid PRIMARY KEY,
  scope          text NOT NULL,
  tenant_id      uuid NOT NULL,
  domain_id      uuid NOT NULL,
  warning_id     uuid NOT NULL REFERENCES prediction.warnings_current (warning_id),
  kind           text NOT NULL CHECK (kind IN ('false', 'late', 'missed', 'duplicated', 'useful')),
  note           text,
  warning_state  text NOT NULL,
  given_by       uuid NOT NULL,
  given_at       timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id uuid NOT NULL,
  CONSTRAINT pwfb_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT pwfb_once UNIQUE (warning_id, given_by, kind)
);
CREATE INDEX pwfb_warning ON prediction.warning_feedback (warning_id, given_at);
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON prediction.warning_feedback FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE prediction.warning_feedback IS 'B28 (0088 §W): a named human''s feedback on a warning — false | late | missed | duplicated | useful; one per person, warning and kind (a repeat answers repeated); the evaluation''s input; append-only.';

CREATE TABLE prediction.warning_evaluations (
  evaluation_id  uuid PRIMARY KEY,
  scope          text NOT NULL,
  tenant_id      uuid NOT NULL,
  domain_id      uuid NOT NULL,
  window_from    timestamptz NOT NULL,
  window_to      timestamptz NOT NULL,
  min_sample     int NOT NULL CHECK (min_sample BETWEEN 1 AND 10000),
  measures       jsonb NOT NULL CHECK (jsonb_typeof(measures) = 'object'),
  verdict        text NOT NULL CHECK (verdict IN ('measured', 'partial', 'abstained')),
  reason         text NOT NULL CHECK (length(btrim(reason)) >= 8),
  evaluated_by   uuid NOT NULL,
  evaluated_at   timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id uuid NOT NULL,
  CONSTRAINT pwev_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT pwev_window CHECK (window_to >= window_from)
);
CREATE INDEX pwev_domain ON prediction.warning_evaluations (tenant_id, domain_id, evaluated_at);
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON prediction.warning_evaluations FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE prediction.warning_evaluations IS 'B28 (0088 §W; PR-26, AT-26): the warnings measured over a window by a named human — the feedback rates by origin, T3 (raised before the decision deadline), the acknowledgement p50/p90 — each abstaining below min_sample, with the verdict and its reason; append-only.';

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['warning_clusters', 'warning_cluster_members', 'warning_feedback', 'warning_evaluations'] LOOP
    EXECUTE format('REVOKE ALL ON prediction.%I FROM PUBLIC', t);
    EXECUTE format('ALTER TABLE prediction.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE prediction.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY prediction_isolation ON prediction.%I
        USING (
          tenant_id = public.eye_tenant()
          AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain())
        )$f$, t);
    EXECUTE format('GRANT SELECT ON prediction.%I TO eye_app, eye_commit', t);
  END LOOP;
END $$;

-- ============================================================
-- §W2 THE KEY, THE SHAPE, THE STORM RULE
-- ============================================================
-- The storm rule, versioned in code like the fitness and coherence rules: more than max_raises raises of ONE cause within
-- window_minutes and the rest are members of the storm's lead (the earliest open warning of that cause in the window).
CREATE OR REPLACE FUNCTION prediction.warning_storm_rule() RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$ SELECT '{"version": 1, "max_raises": 3, "window_minutes": 60}'::jsonb $$;
GRANT EXECUTE ON FUNCTION prediction.warning_storm_rule() TO eye_app, eye_commit;

-- What is wrong with an affected block, or NULL: {objectives: [uuid], assets: [text], actors: [text], geographies: [text], horizon: text|null}.
CREATE OR REPLACE FUNCTION prediction.warning_affected_problem(p jsonb) RETURNS text
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE k text; e jsonb;
BEGIN
  IF p IS NULL OR jsonb_typeof(p) <> 'object' THEN RETURN 'affected is an object {objectives, assets, actors, geographies, horizon}'; END IF;
  FOR k IN SELECT jsonb_object_keys(p) LOOP
    IF k NOT IN ('objectives', 'assets', 'actors', 'geographies', 'horizon') THEN RETURN format('affected carries the unknown key %s (objectives, assets, actors, geographies, horizon)', k); END IF;
  END LOOP;
  FOREACH k IN ARRAY ARRAY['objectives', 'assets', 'actors', 'geographies'] LOOP
    IF p ? k THEN
      IF jsonb_typeof(p -> k) <> 'array' OR jsonb_array_length(p -> k) > 50 THEN RETURN format('affected.%s is a list of at most 50', k); END IF;
      FOR e IN SELECT value FROM jsonb_array_elements(p -> k) LOOP
        IF jsonb_typeof(e) <> 'string' OR length(btrim(e #>> '{}')) NOT BETWEEN 1 AND 128 THEN RETURN format('affected.%s lists strings of 1..128 characters', k); END IF;
        IF k = 'objectives' AND (e #>> '{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RETURN 'affected.objectives lists objective ids'; END IF;
      END LOOP;
    END IF;
  END LOOP;
  IF p ? 'horizon' AND jsonb_typeof(p -> 'horizon') NOT IN ('string', 'null') THEN RETURN 'affected.horizon is a string or null'; END IF;
  IF jsonb_typeof(p -> 'horizon') = 'string' AND length(btrim(p ->> 'horizon')) NOT BETWEEN 1 AND 64 THEN RETURN 'affected.horizon is 1..64 characters'; END IF;
  RETURN NULL;
END $$;

-- The sorted, lower-cased, de-duplicated list of one affected dimension.
CREATE OR REPLACE FUNCTION prediction.warning_affected_list(p jsonb, p_key text) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce((SELECT jsonb_agg(x ORDER BY x) FROM (SELECT DISTINCT lower(btrim(v)) AS x FROM jsonb_array_elements_text(
    CASE WHEN jsonb_typeof(p -> p_key) = 'array' THEN p -> p_key ELSE '[]'::jsonb END) v) d), '[]'::jsonb);
$$;

-- THE DEDUPLICATION KEY: the cause the origin saw, the sorted affected objectives, the sorted geographies, the horizon — so two
-- reports of one incident against one objective collapse, and a distinct objective, geography or horizon stays its own warning.
CREATE OR REPLACE FUNCTION prediction.warning_dedup_key(p_cause text, p_affected jsonb) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT btrim(p_cause)
      || '|obj:' || coalesce((SELECT string_agg(x, ',' ORDER BY x) FROM jsonb_array_elements_text(prediction.warning_affected_list(p_affected, 'objectives')) x), '')
      || '|geo:' || coalesce((SELECT string_agg(x, ',' ORDER BY x) FROM jsonb_array_elements_text(prediction.warning_affected_list(p_affected, 'geographies')) x), '')
      || '|h:' || coalesce(lower(btrim(CASE WHEN jsonb_typeof(p_affected -> 'horizon') = 'string' THEN p_affected ->> 'horizon' END)), '');
$$;
GRANT EXECUTE ON FUNCTION prediction.warning_dedup_key(text, jsonb) TO eye_app, eye_commit;

-- A candidate's STANCE: contradicting when it carries evidence and every item of it contradicts; supporting otherwise.
CREATE OR REPLACE FUNCTION prediction.warning_candidate_stance(p_evidence jsonb) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN jsonb_typeof(p_evidence) = 'array' AND jsonb_array_length(p_evidence) > 0
                   AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_evidence) e WHERE coalesce(e ->> 'stance', 'supporting') <> 'contradicting')
              THEN 'contradicting' ELSE 'supporting' END;
$$;

-- A candidate's SOURCE: origin_ref.source_id, else the first evidence item's source_id — a uuid, or NULL.
CREATE OR REPLACE FUNCTION prediction.warning_candidate_source(p_origin_ref jsonb, p_evidence jsonb) RETURNS uuid
LANGUAGE sql IMMUTABLE AS $$
  SELECT (SELECT v FROM (SELECT p_origin_ref ->> 'source_id' AS v, 0 AS o
                          UNION ALL SELECT e ->> 'source_id', 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_evidence) = 'array' THEN p_evidence ELSE '[]'::jsonb END) e) s
           WHERE v ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' ORDER BY o LIMIT 1)::uuid;
$$;

-- An OPEN warning is one not closed (raised, acknowledged — and expired: the incident outlives its unanswered window).
-- FOLD a pending candidate into a warning (internal: called by the definer ports below, never granted): the member row, the
-- `warning.clustered` event on the warning, the candidate decided. Answers the member.
CREATE OR REPLACE FUNCTION prediction.warning_fold_candidate(c prediction.warning_candidates, p_warning uuid, p_kind text, p_storm jsonb, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, pg_catalog, pg_temp AS $$
DECLARE v_member uuid := gen_random_uuid(); v_cluster uuid; v_key text := prediction.warning_dedup_key(c.cause_key, c.affected); v_stance text := prediction.warning_candidate_stance(c.evidence);
BEGIN
  SELECT w.cluster_id INTO v_cluster FROM prediction.warnings_current w WHERE w.warning_id = p_warning;
  IF v_cluster IS NULL THEN RAISE EXCEPTION 'warning cluster rejected: warning % carries no cluster', p_warning USING ERRCODE = '22023'; END IF;
  INSERT INTO prediction.warning_cluster_members (member_id, scope, tenant_id, domain_id, cluster_id, warning_id, candidate_id, member_kind, stance, origin_kind, origin_key, source_id,
                                                  evidence, cause_key, dedup_key, objectives, geographies, horizon, title, confidence, joined_by, correlation_id)
  VALUES (v_member, 'DOMAIN', c.tenant_id, c.domain_id, v_cluster, p_warning, c.candidate_id, p_kind, v_stance, c.origin_kind, c.origin_key,
          prediction.warning_candidate_source(c.origin_ref, c.evidence), c.evidence, c.cause_key, v_key, prediction.warning_affected_list(c.affected, 'objectives'),
          prediction.warning_affected_list(c.affected, 'geographies'), CASE WHEN jsonb_typeof(c.affected -> 'horizon') = 'string' THEN c.affected ->> 'horizon' END,
          c.title, c.confidence, p_actor, p_correlation);
  INSERT INTO prediction.warning_events (event_id, scope, tenant_id, domain_id, warning_id, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', c.tenant_id, c.domain_id, p_warning, 'warning.clustered', p_actor,
          jsonb_build_object('member_id', v_member, 'candidate_id', c.candidate_id, 'member_kind', p_kind, 'stance', v_stance, 'origin_kind', c.origin_kind, 'origin_key', c.origin_key,
                             'cause_key', c.cause_key, 'dedup_key', v_key, 'storm', p_storm), p_correlation);
  UPDATE prediction.warning_candidates SET state = 'clustered', warning_id = p_warning, decided_at = clock_timestamp(),
         outcome = jsonb_build_object('member_id', v_member, 'member_kind', p_kind, 'stance', v_stance, 'dedup_key', v_key, 'storm', p_storm)
   WHERE candidate_id = c.candidate_id;
  RETURN jsonb_build_object('candidate_id', c.candidate_id, 'warning_id', p_warning, 'member_id', v_member, 'member_kind', p_kind, 'stance', v_stance, 'dedup_key', v_key, 'storm', p_storm);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.warning_fold_candidate(prediction.warning_candidates, uuid, text, jsonb, uuid, uuid) FROM PUBLIC;

-- REFUSE a pending candidate (internal): its state and the reason, visible on the intake — never dropped.
CREATE OR REPLACE FUNCTION prediction.warning_refuse_candidate(c prediction.warning_candidates, p_reason text) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, pg_catalog, pg_temp AS $$
BEGIN
  UPDATE prediction.warning_candidates SET state = 'refused', decided_at = clock_timestamp(), outcome = jsonb_build_object('reason', p_reason) WHERE candidate_id = c.candidate_id;
  RETURN jsonb_build_object('candidate_id', c.candidate_id, 'reason', p_reason);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.warning_refuse_candidate(prediction.warning_candidates, text) FROM PUBLIC;

-- DECIDE one pending candidate (internal; the caller holds its lock): refused (its affected block malformed, or an objective that is
-- not an objective of this domain) | clustered (an open warning of its key) | storm (its cause beyond the rule: folded into the lead)
-- | raise (nothing to fold into). p_extra_raises: raise-due candidates of the same cause already decided in THIS batch.
CREATE OR REPLACE FUNCTION prediction.warning_decide_candidate(c prediction.warning_candidates, p_extra_raises int, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, graph, pg_catalog, pg_temp AS $$
DECLARE v_problem text; v_key text; v_open uuid; v_rule jsonb := prediction.warning_storm_rule(); v_recent int; v_lead uuid; o text;
BEGIN
  v_problem := prediction.warning_affected_problem(c.affected);
  IF v_problem IS NOT NULL THEN RETURN jsonb_build_object('decision', 'refused') || prediction.warning_refuse_candidate(c, v_problem); END IF;
  FOR o IN SELECT jsonb_array_elements_text(prediction.warning_affected_list(c.affected, 'objectives')) LOOP
    IF NOT EXISTS (SELECT 1 FROM graph.strategy_current s WHERE s.strategy_object_id = o::uuid AND s.tenant_id = c.tenant_id AND s.domain_id = c.domain_id AND s.object_type = 'OBJ') THEN
      RETURN jsonb_build_object('decision', 'refused') || prediction.warning_refuse_candidate(c, format('affected objective %s is not an objective of this domain', o));
    END IF;
  END LOOP;
  v_key := prediction.warning_dedup_key(c.cause_key, c.affected);
  -- DEDUPLICATION: the open warning of this key (the oldest, should two exist by a race — the raise re-checks under its lock).
  SELECT w.warning_id INTO v_open FROM prediction.warning_clusters k JOIN prediction.warnings_current w ON w.warning_id = k.lead_warning_id
   WHERE k.tenant_id = c.tenant_id AND k.domain_id = c.domain_id AND k.dedup_key = v_key AND w.state <> 'closed'
   ORDER BY w.raised_at, w.warning_id LIMIT 1;
  IF v_open IS NOT NULL THEN RETURN jsonb_build_object('decision', 'clustered') || prediction.warning_fold_candidate(c, v_open, 'duplicate', NULL, p_actor, p_correlation); END IF;
  -- THE STORM: the open warnings of this cause raised within the window, and the raises this batch already owes it.
  SELECT count(*)::int, (array_agg(k.lead_warning_id ORDER BY w.raised_at, w.warning_id))[1] INTO v_recent, v_lead
    FROM prediction.warning_clusters k JOIN prediction.warnings_current w ON w.warning_id = k.lead_warning_id
   WHERE k.tenant_id = c.tenant_id AND k.domain_id = c.domain_id AND k.cause_key = c.cause_key AND w.state <> 'closed'
     AND w.raised_at >= clock_timestamp() - make_interval(mins => (v_rule ->> 'window_minutes')::int);
  IF v_recent >= (v_rule ->> 'max_raises')::int AND v_lead IS NOT NULL THEN
    RETURN jsonb_build_object('decision', 'storm') || prediction.warning_fold_candidate(c, v_lead, 'storm',
      v_rule || jsonb_build_object('cause_key', c.cause_key, 'raises_in_window', v_recent, 'lead_warning_id', v_lead), p_actor, p_correlation);
  END IF;
  IF v_recent + p_extra_raises >= (v_rule ->> 'max_raises')::int THEN
    RETURN jsonb_build_object('decision', 'deferred', 'candidate_id', c.candidate_id, 'dedup_key', v_key,
                              'reason', format('storm pending: %s raise(s) of cause %s are open or due in this batch (rule v%s: more than %s within %s min fold into the lead)', v_recent + p_extra_raises, c.cause_key, v_rule ->> 'version', v_rule ->> 'max_raises', v_rule ->> 'window_minutes'));
  END IF;
  RETURN jsonb_build_object('decision', 'raise', 'candidate_id', c.candidate_id, 'dedup_key', v_key, 'cause_key', c.cause_key);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.warning_decide_candidate(prediction.warning_candidates, int, uuid, uuid) FROM PUBLIC;

-- ============================================================
-- §W3 THE CANDIDATE PROCESSING — the tick's step and a person's route
-- ============================================================
-- PROCESS: every pending candidate (oldest first, FOR UPDATE SKIP LOCKED, at most p_limit) decided. A candidate of a key ALREADY
-- raise-due in this batch is deferred (it folds into that warning on the next pass); the raise-due are ANSWERED, never raised here —
-- the raise is prediction.raise_candidate_warning, its own governed write under prediction.warning.raise.
CREATE OR REPLACE FUNCTION prediction.process_warning_candidates(p_tenant uuid, p_domain uuid, p_limit int, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, graph, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE c prediction.warning_candidates%ROWTYPE; d jsonb; v_key text; v_limit int := coalesce(p_limit, 50);
        v_clustered jsonb := '[]'::jsonb; v_storm jsonb := '[]'::jsonb; v_raise jsonb := '[]'::jsonb; v_deferred jsonb := '[]'::jsonb; v_refused jsonb := '[]'::jsonb;
        v_keys text[] := '{}'; v_causes jsonb := '{}'::jsonb; v_seen int := 0;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.attention.tick', 'prediction.warning.candidates.process']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF v_limit < 1 OR v_limit > 200 THEN RAISE EXCEPTION 'warning cluster rejected: the batch is 1..200 candidates' USING ERRCODE = '22023'; END IF;
  FOR c IN SELECT * FROM prediction.warning_candidates x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.state = 'pending'
            ORDER BY x.submitted_at, x.candidate_id LIMIT v_limit FOR UPDATE SKIP LOCKED LOOP
    v_seen := v_seen + 1;
    v_key := CASE WHEN prediction.warning_affected_problem(c.affected) IS NULL THEN prediction.warning_dedup_key(c.cause_key, c.affected) END;
    IF v_key IS NOT NULL AND v_key = ANY (v_keys) THEN
      v_deferred := v_deferred || jsonb_build_object('candidate_id', c.candidate_id, 'dedup_key', v_key, 'reason', 'a candidate of the same key is due to be raised in this batch: it folds into that warning on the next pass');
      CONTINUE;
    END IF;
    d := prediction.warning_decide_candidate(c, coalesce((v_causes ->> c.cause_key)::int, 0), p_actor, p_correlation);
    CASE d ->> 'decision'
      WHEN 'clustered' THEN v_clustered := v_clustered || (d - 'decision');
      WHEN 'storm' THEN v_storm := v_storm || (d - 'decision');
      WHEN 'refused' THEN v_refused := v_refused || (d - 'decision');
      WHEN 'deferred' THEN v_deferred := v_deferred || (d - 'decision');
      ELSE
        v_raise := v_raise || (d - 'decision');
        v_keys := v_keys || v_key;
        v_causes := v_causes || jsonb_build_object(c.cause_key, coalesce((v_causes ->> c.cause_key)::int, 0) + 1);
    END CASE;
  END LOOP;
  RETURN jsonb_build_object('seen', v_seen, 'clustered', v_clustered, 'storm', v_storm, 'raise_due', v_raise, 'deferred', v_deferred, 'refused', v_refused,
                            'storm_rule', prediction.warning_storm_rule(), 'at', clock_timestamp());
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.process_warning_candidates(uuid,uuid,int,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.process_warning_candidates(uuid,uuid,int,uuid,uuid) TO eye_commit;

-- PREFLIGHT (under prediction.warning.raise, the raise's own write): the candidate LOCKED and decided again — folded (clustered or
-- storm) here and answered, or answered `raise` with what the raise needs: the key, the owner it routes to (the first affected
-- objective's owner when an active human, else the acting person), the forecast it names (origin_ref.forecast_id, when one of this
-- domain) and the decision deadline (origin_ref.decision_deadline, when an instant).
CREATE OR REPLACE FUNCTION prediction.warning_candidate_preflight(p_candidate uuid, p_tenant uuid, p_domain uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, graph, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE c prediction.warning_candidates%ROWTYPE; d jsonb; v_owner uuid; v_fct uuid; v_deadline timestamptz;
        /* B28 integrator */ v_route uuid; v_by text; /* end B28 integrator */
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.warning.raise']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT * INTO c FROM prediction.warning_candidates x WHERE x.candidate_id = p_candidate AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'warning cluster rejected: no such candidate % in this domain', p_candidate USING ERRCODE = '23503'; END IF;
  IF c.state <> 'pending' THEN RETURN jsonb_build_object('decision', 'done', 'candidate_id', c.candidate_id, 'state', c.state, 'warning_id', c.warning_id, 'outcome', c.outcome); END IF;
  d := prediction.warning_decide_candidate(c, 0, p_actor, p_correlation);
  IF d ->> 'decision' <> 'raise' THEN RETURN d; END IF;
  SELECT s.owner_principal_id INTO v_owner FROM graph.strategy_current s JOIN identity.principals p ON p.id = s.owner_principal_id AND p.kind = 'human' AND p.status = 'active'
   WHERE s.tenant_id = p_tenant AND s.domain_id = p_domain AND s.object_type = 'OBJ'
     AND s.strategy_object_id::text IN (SELECT jsonb_array_elements_text(prediction.warning_affected_list(c.affected, 'objectives')))
   ORDER BY s.strategy_object_id LIMIT 1;
  IF (c.origin_ref ->> 'forecast_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    SELECT f.forecast_id INTO v_fct FROM prediction.forecasts_current f WHERE f.forecast_id = (c.origin_ref ->> 'forecast_id')::uuid AND f.tenant_id = p_tenant AND f.domain_id = p_domain;
  END IF;
  BEGIN v_deadline := (c.origin_ref ->> 'decision_deadline')::timestamptz; EXCEPTION WHEN others THEN v_deadline := NULL; END;
  /* B28 integrator (found by the act: the attention agent raising after its tick became the routed owner): a warning is routed to a NAMED,
     ACTIVE HUMAN — the first affected objective's owner; else the acting person when a human; else the candidate's submitter when a human
     (the escalating analyst); else the origin's accountable owner (a stream rule's owner, a signal's disposer); none → the candidate stays
     PENDING, deferred with the reason (never routed to an agent). */
  v_route := v_owner; v_by := 'the first affected objective''s owner';
  IF v_route IS NULL AND EXISTS (SELECT 1 FROM identity.principals p WHERE p.id = p_actor AND p.kind = 'human' AND p.status = 'active') THEN
    v_route := p_actor; v_by := 'the acting person (no affected objective has an active human owner)';
  END IF;
  IF v_route IS NULL AND EXISTS (SELECT 1 FROM identity.principals p WHERE p.id = c.submitted_by AND p.kind = 'human' AND p.status = 'active') THEN
    v_route := c.submitted_by; v_by := 'the person who submitted the candidate (no affected objective has an active human owner)';
  END IF;
  IF v_route IS NULL AND c.origin_kind = 'stream_rule' AND (c.origin_ref ->> 'rule_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    SELECT r.owner_principal_id INTO v_route FROM prediction.stream_rules r JOIN identity.principals p ON p.id = r.owner_principal_id AND p.kind = 'human' AND p.status = 'active'
     WHERE r.rule_id = (c.origin_ref ->> 'rule_id')::uuid AND r.tenant_id = p_tenant AND r.domain_id = p_domain;
    IF v_route IS NOT NULL THEN v_by := 'the stream rule''s owner (no affected objective has an active human owner)'; END IF;
  END IF;
  IF v_route IS NULL AND c.origin_kind = 'weak_signal' AND (c.origin_ref ->> 'signal_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    SELECT s.disposition_by INTO v_route FROM prediction.signals_current s JOIN identity.principals p ON p.id = s.disposition_by AND p.kind = 'human' AND p.status = 'active'
     WHERE s.signal_id = (c.origin_ref ->> 'signal_id')::uuid AND s.tenant_id = p_tenant AND s.domain_id = p_domain;
    IF v_route IS NOT NULL THEN v_by := 'the person who escalated the signal (no affected objective has an active human owner)'; END IF;
  END IF;
  IF v_route IS NULL THEN
    RETURN jsonb_build_object('decision', 'deferred', 'candidate_id', c.candidate_id,
                              'reason', 'no named, active human to route the warning to (no affected objective owner; the actor, the submitter and the origin''s owner are not active humans) — it stays pending');
  END IF;
  /* end B28 integrator */
  RETURN d || jsonb_build_object('candidate', to_jsonb(c), 'routed_to', v_route, 'routed_by', v_by,
                                 'forecast_id', v_fct, 'decision_deadline', v_deadline, 'stance', prediction.warning_candidate_stance(c.evidence), 'now', clock_timestamp());
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.warning_candidate_preflight(uuid,uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.warning_candidate_preflight(uuid,uuid,uuid,uuid,uuid) TO eye_commit;

-- RAISE a pending candidate (under prediction.warning.raise; the WRN object admitted by the service BEFORE this port in the same write,
-- so a refusal here rolls it back): prediction.raise_warning (0081:709, unchanged — no branch, the declared class; the level the caller
-- derived is checked there), then the origin, the cluster and its lead member, the affected block seeded from the candidate.
CREATE OR REPLACE FUNCTION prediction.raise_candidate_warning(p_candidate uuid, p_tenant uuid, p_domain uuid, p_raise jsonb, p_actor uuid, p_event_id uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, graph, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE c prediction.warning_candidates%ROWTYPE; v_w uuid; v_cluster uuid := gen_random_uuid(); v_member uuid := gen_random_uuid(); v_key text; v_stance text; v_rule jsonb := prediction.warning_storm_rule();
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.warning.raise']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT * INTO c FROM prediction.warning_candidates x WHERE x.candidate_id = p_candidate AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'warning cluster rejected: no such candidate % in this domain', p_candidate USING ERRCODE = '23503'; END IF;
  IF c.state <> 'pending' THEN RAISE EXCEPTION 'warning cluster rejected (not_pending): candidate % is %', p_candidate, c.state USING ERRCODE = '22023'; END IF;
  IF p_raise IS NULL OR jsonb_typeof(p_raise) <> 'object' OR (p_raise ->> 'warning_id') IS NULL THEN RAISE EXCEPTION 'warning cluster rejected: the raise names its warning' USING ERRCODE = '22023'; END IF;
  v_w := (p_raise ->> 'warning_id')::uuid;
  v_key := prediction.warning_dedup_key(c.cause_key, c.affected);
  v_stance := prediction.warning_candidate_stance(c.evidence);
  PERFORM prediction.raise_warning(
    v_w, p_tenant, p_domain, NULL, NULL, (p_raise ->> 'forecast_id')::uuid,
    p_raise ->> 'title', p_raise -> 'evidence', p_raise ->> 'consequence', (p_raise ->> 'confidence')::numeric,
    (p_raise ->> 'opens_at')::timestamptz, (p_raise ->> 'closes_at')::timestamptz, (p_raise ->> 'routed_to')::uuid,
    NULL, (p_raise ->> 'raised_as_of')::timestamptz, 'live', (p_raise ->> 'decision_deadline')::timestamptz,
    CASE WHEN jsonb_typeof(p_raise -> 'timely') = 'boolean' THEN (p_raise ->> 'timely')::boolean END, coalesce((p_raise ->> 'decision_missed')::boolean, false), coalesce(p_raise -> 'controls', '{}'::jsonb),
    c.consequence_class, 'declared', p_raise ->> 'level', (p_raise ->> 'level_version')::int, p_raise ->> 'urgency', p_raise ->> 'op_class',
    p_actor, p_event_id, p_correlation);
  INSERT INTO prediction.warning_clusters (cluster_id, scope, tenant_id, domain_id, lead_warning_id, dedup_key, cause_key, objectives, geographies, horizon, storm_rule, created_by, correlation_id)
  VALUES (v_cluster, 'DOMAIN', p_tenant, p_domain, v_w, v_key, c.cause_key, prediction.warning_affected_list(c.affected, 'objectives'), prediction.warning_affected_list(c.affected, 'geographies'),
          CASE WHEN jsonb_typeof(c.affected -> 'horizon') = 'string' THEN c.affected ->> 'horizon' END, v_rule, p_actor, p_correlation);
  UPDATE prediction.warnings_current
     SET origin_kind = c.origin_kind,
         origin_ref = c.origin_ref || jsonb_build_object('candidate_id', c.candidate_id, 'origin_key', c.origin_key, 'cause_key', c.cause_key, 'dedup_key', v_key,
                                                         'confidence_basis', CASE WHEN c.confidence IS NULL THEN 'the origin stated no confidence: the neutral 0.5 is recorded and never read as evidence' ELSE 'the origin''s' END),
         cluster_id = v_cluster, affected = c.affected
   WHERE warning_id = v_w;
  INSERT INTO prediction.warning_cluster_members (member_id, scope, tenant_id, domain_id, cluster_id, warning_id, candidate_id, member_kind, stance, origin_kind, origin_key, source_id,
                                                  evidence, cause_key, dedup_key, objectives, geographies, horizon, title, confidence, joined_by, correlation_id)
  VALUES (v_member, 'DOMAIN', p_tenant, p_domain, v_cluster, v_w, c.candidate_id, 'lead', v_stance, c.origin_kind, c.origin_key, prediction.warning_candidate_source(c.origin_ref, c.evidence),
          c.evidence, c.cause_key, v_key, prediction.warning_affected_list(c.affected, 'objectives'), prediction.warning_affected_list(c.affected, 'geographies'),
          CASE WHEN jsonb_typeof(c.affected -> 'horizon') = 'string' THEN c.affected ->> 'horizon' END, c.title, c.confidence, p_actor, p_correlation);
  UPDATE prediction.warning_candidates SET state = 'raised', warning_id = v_w, decided_at = clock_timestamp(),
         outcome = jsonb_build_object('cluster_id', v_cluster, 'member_id', v_member, 'dedup_key', v_key) WHERE candidate_id = c.candidate_id;
  RETURN jsonb_build_object('candidate_id', c.candidate_id, 'warning_id', v_w, 'cluster_id', v_cluster, 'member_id', v_member, 'dedup_key', v_key, 'cause_key', c.cause_key,
                            'origin_kind', c.origin_kind, 'stance', v_stance);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.raise_candidate_warning(uuid,uuid,uuid,jsonb,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.raise_candidate_warning(uuid,uuid,uuid,jsonb,uuid,uuid,uuid) TO eye_commit;

-- ============================================================
-- §W4 THE CONTEXT
-- ============================================================
-- SET the context (a whole replacement at the version read): contradicting [{object_id, version?, source_id?, note}], affected
-- {objectives (OBJ of this domain), assets, actors, geographies, horizon}, falsification [{condition, indicator_id?}], playbook
-- {kind: verification | simulation, scenario_id, branch_id?, run_id?, note?} or null. By the warning's owner or a domain administrator.
CREATE OR REPLACE FUNCTION prediction.set_warning_context(p_warning uuid, p_tenant uuid, p_domain uuid, p_expected_version int, p_contradicting jsonb, p_affected jsonb,
                                                         p_falsification jsonb, p_playbook jsonb, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, graph, simulation, objects, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE w prediction.warnings_current%ROWTYPE; e jsonb; k text; v_problem text; o text; v_scn uuid; v_version int;
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.warning.context.set']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'warning context rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO w FROM prediction.warnings_current x WHERE x.warning_id = p_warning AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'warning context rejected: no such warning % in this domain', p_warning USING ERRCODE = '23503'; END IF;
  IF w.routed_to IS DISTINCT FROM p_actor AND NOT executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['domain_admin', 'platform_admin']) THEN
    RAISE EXCEPTION 'warning context rejected: the context is set by the warning''s owner (%) or a domain administrator', w.routed_to USING ERRCODE = '42501';
  END IF;
  IF w.state = 'closed' THEN RAISE EXCEPTION 'warning context rejected (closed): warning % was closed at %; its context is history', p_warning, w.closed_at USING ERRCODE = '22023'; END IF;
  IF p_expected_version IS NULL OR p_expected_version <> w.context_version THEN
    RAISE EXCEPTION 'warning context rejected (stale_version): the context stands at version %, not %', w.context_version, coalesce(p_expected_version::text, '<none>') USING ERRCODE = '22023';
  END IF;
  -- the shapes (422)
  IF p_contradicting IS NULL OR jsonb_typeof(p_contradicting) <> 'array' OR jsonb_array_length(p_contradicting) > 50 THEN
    RAISE EXCEPTION 'warning context rejected: contradicting is a list of at most 50 {object_id, version?, source_id?, note}' USING ERRCODE = '22023';
  END IF;
  FOR e IN SELECT value FROM jsonb_array_elements(p_contradicting) LOOP
    IF jsonb_typeof(e) <> 'object' OR coalesce(e ->> 'object_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       OR length(btrim(coalesce(e ->> 'note', ''))) < 4 OR (e ? 'version' AND jsonb_typeof(e -> 'version') <> 'number')
       OR (e ? 'source_id' AND coalesce(e ->> 'source_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') THEN
      RAISE EXCEPTION 'warning context rejected: each contradicting item is {object_id: uuid, version?: number, source_id?: uuid, note: 4+ characters}' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  v_problem := prediction.warning_affected_problem(p_affected);
  IF v_problem IS NOT NULL THEN RAISE EXCEPTION 'warning context rejected: %', v_problem USING ERRCODE = '22023'; END IF;
  IF p_falsification IS NULL OR jsonb_typeof(p_falsification) <> 'array' OR jsonb_array_length(p_falsification) > 20 THEN
    RAISE EXCEPTION 'warning context rejected: falsification is a list of at most 20 {condition, indicator_id?}' USING ERRCODE = '22023';
  END IF;
  FOR e IN SELECT value FROM jsonb_array_elements(p_falsification) LOOP
    IF jsonb_typeof(e) <> 'object' OR length(btrim(coalesce(e ->> 'condition', ''))) < 8
       OR (e ? 'indicator_id' AND coalesce(e ->> 'indicator_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') THEN
      RAISE EXCEPTION 'warning context rejected: each falsification condition is {condition: 8+ characters, indicator_id?: uuid}' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF p_playbook IS NOT NULL AND jsonb_typeof(p_playbook) <> 'null' THEN
    IF jsonb_typeof(p_playbook) <> 'object' OR coalesce(p_playbook ->> 'kind', '') NOT IN ('verification', 'simulation')
       OR coalesce(p_playbook ->> 'scenario_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       OR (p_playbook ? 'branch_id' AND jsonb_typeof(p_playbook -> 'branch_id') <> 'null' AND coalesce(p_playbook ->> 'branch_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
       OR (p_playbook ? 'run_id' AND jsonb_typeof(p_playbook -> 'run_id') <> 'null' AND coalesce(p_playbook ->> 'run_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') THEN
      RAISE EXCEPTION 'warning context rejected: the playbook is {kind: verification | simulation, scenario_id: uuid, branch_id?: uuid, run_id?: uuid, note?}' USING ERRCODE = '22023';
    END IF;
    FOR k IN SELECT jsonb_object_keys(p_playbook) LOOP
      IF k NOT IN ('kind', 'scenario_id', 'branch_id', 'run_id', 'note') THEN RAISE EXCEPTION 'warning context rejected: the playbook carries the unknown key %', k USING ERRCODE = '22023'; END IF;
    END LOOP;
  END IF;
  -- the references exist (404)
  FOR e IN SELECT value FROM jsonb_array_elements(p_contradicting) LOOP
    IF NOT EXISTS (SELECT 1 FROM objects.canonical_objects x WHERE x.object_id = (e ->> 'object_id')::uuid AND x.tenant_id = p_tenant AND x.domain_id = p_domain
                     AND (NOT (e ? 'version') OR x.object_version = (e ->> 'version')::bigint)) THEN
      RAISE EXCEPTION 'warning context rejected: no such object % in this domain (contradicting evidence)', e ->> 'object_id' USING ERRCODE = '23503';
    END IF;
  END LOOP;
  FOR o IN SELECT jsonb_array_elements_text(coalesce(p_affected -> 'objectives', '[]'::jsonb)) LOOP
    IF NOT EXISTS (SELECT 1 FROM graph.strategy_current s WHERE s.strategy_object_id = o::uuid AND s.tenant_id = p_tenant AND s.domain_id = p_domain AND s.object_type = 'OBJ') THEN
      RAISE EXCEPTION 'warning context rejected: no such objective % in this domain', o USING ERRCODE = '23503';
    END IF;
  END LOOP;
  FOR e IN SELECT value FROM jsonb_array_elements(p_falsification) WHERE value ? 'indicator_id' LOOP
    IF NOT EXISTS (SELECT 1 FROM prediction.indicators_current i WHERE i.indicator_id = (e ->> 'indicator_id')::uuid AND i.tenant_id = p_tenant AND i.domain_id = p_domain) THEN
      RAISE EXCEPTION 'warning context rejected: no such indicator % in this domain', e ->> 'indicator_id' USING ERRCODE = '23503';
    END IF;
  END LOOP;
  IF p_playbook IS NOT NULL AND jsonb_typeof(p_playbook) = 'object' THEN
    SELECT s.scenario_id INTO v_scn FROM prediction.scenarios_current s WHERE s.scenario_id = (p_playbook ->> 'scenario_id')::uuid AND s.tenant_id = p_tenant AND s.domain_id = p_domain;
    IF v_scn IS NULL THEN RAISE EXCEPTION 'warning context rejected: no such scenario % in this domain (playbook)', p_playbook ->> 'scenario_id' USING ERRCODE = '23503'; END IF;
    IF jsonb_typeof(p_playbook -> 'branch_id') = 'string' AND NOT EXISTS (SELECT 1 FROM prediction.branches_current b WHERE b.branch_id = (p_playbook ->> 'branch_id')::uuid AND b.scenario_id = v_scn) THEN
      RAISE EXCEPTION 'warning context rejected: no such branch % of scenario % (playbook)', p_playbook ->> 'branch_id', v_scn USING ERRCODE = '23503';
    END IF;
    IF jsonb_typeof(p_playbook -> 'run_id') = 'string' AND NOT EXISTS (SELECT 1 FROM simulation.runs_current r WHERE r.run_id = (p_playbook ->> 'run_id')::uuid AND r.tenant_id = p_tenant AND r.domain_id = p_domain) THEN
      RAISE EXCEPTION 'warning context rejected: no such run % in this domain (playbook)', p_playbook ->> 'run_id' USING ERRCODE = '23503';
    END IF;
  END IF;
  v_version := w.context_version + 1;
  UPDATE prediction.warnings_current SET contradicting = p_contradicting, affected = p_affected, falsification = p_falsification,
         playbook = CASE WHEN jsonb_typeof(p_playbook) = 'object' THEN p_playbook END, context_version = v_version
   WHERE warning_id = p_warning;
  INSERT INTO prediction.warning_events (event_id, scope, tenant_id, domain_id, warning_id, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_warning, 'warning.context_set', p_actor,
          jsonb_build_object('context_version', v_version, 'from_version', w.context_version, 'contradicting', p_contradicting, 'affected', p_affected, 'falsification', p_falsification,
                             'playbook', CASE WHEN jsonb_typeof(p_playbook) = 'object' THEN p_playbook END), p_correlation);
  RETURN jsonb_build_object('warning_id', p_warning, 'context_version', v_version, 'contradicting', p_contradicting, 'affected', p_affected, 'falsification', p_falsification,
                            'playbook', CASE WHEN jsonb_typeof(p_playbook) = 'object' THEN p_playbook END, 'state', w.state);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.set_warning_context(uuid,uuid,uuid,int,jsonb,jsonb,jsonb,jsonb,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.set_warning_context(uuid,uuid,uuid,int,jsonb,jsonb,jsonb,jsonb,uuid,uuid) TO eye_commit;

-- ============================================================
-- §W5 CLOSURE
-- ============================================================
-- CLOSE: by the owner or a domain administrator, on a CRITERION — resolved | falsified (p_ref {condition: n}, a declared falsification
-- condition, 0-based) | duplicate (p_ref {warning_id}, another warning of this domain) | no_longer_relevant — with a reason.
CREATE OR REPLACE FUNCTION prediction.close_warning(p_warning uuid, p_tenant uuid, p_domain uuid, p_criterion text, p_ref jsonb, p_reason text, p_actor uuid, p_event_id uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE w prediction.warnings_current%ROWTYPE; v_at timestamptz := clock_timestamp(); v_closure jsonb; v_n int;
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.warning.close']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'warning closure rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO w FROM prediction.warnings_current x WHERE x.warning_id = p_warning AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'warning closure rejected: no such warning % in this domain', p_warning USING ERRCODE = '23503'; END IF;
  IF w.routed_to IS DISTINCT FROM p_actor AND NOT executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['domain_admin', 'platform_admin']) THEN
    RAISE EXCEPTION 'warning closure rejected (not_owner): a warning is closed by its owner (%) or a domain administrator', w.routed_to USING ERRCODE = '42501';
  END IF;
  IF w.state NOT IN ('raised', 'acknowledged', 'expired') THEN RAISE EXCEPTION 'warning closure rejected (not_open): warning % is %', p_warning, w.state USING ERRCODE = '22023'; END IF;
  IF p_criterion IS NULL OR p_criterion NOT IN ('resolved', 'falsified', 'duplicate', 'no_longer_relevant') THEN
    RAISE EXCEPTION 'warning closure rejected: the criterion is resolved, falsified, duplicate or no_longer_relevant' USING ERRCODE = '22023';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN RAISE EXCEPTION 'warning closure rejected: a closure carries a reason of at least 8 characters' USING ERRCODE = '22023'; END IF;
  IF p_criterion = 'falsified' THEN
    IF jsonb_array_length(w.falsification) = 0 THEN
      RAISE EXCEPTION 'warning closure rejected (no_falsification): warning % declares no falsification condition; set the context first', p_warning USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(p_ref -> 'condition') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'warning closure rejected: a falsified closure names the condition that held ({condition: n})' USING ERRCODE = '22023'; END IF;
    v_n := (p_ref ->> 'condition')::int;
    IF v_n < 0 OR v_n >= jsonb_array_length(w.falsification) THEN
      RAISE EXCEPTION 'warning closure rejected: condition % is not one of the % declared', v_n, jsonb_array_length(w.falsification) USING ERRCODE = '22023';
    END IF;
    v_closure := jsonb_build_object('criterion', 'falsified', 'condition', w.falsification -> v_n, 'condition_index', v_n);
  ELSIF p_criterion = 'duplicate' THEN
    IF coalesce(p_ref ->> 'warning_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' OR (p_ref ->> 'warning_id')::uuid = p_warning THEN
      RAISE EXCEPTION 'warning closure rejected: a duplicate closure names the other warning ({warning_id})' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM prediction.warnings_current x WHERE x.warning_id = (p_ref ->> 'warning_id')::uuid AND x.tenant_id = p_tenant AND x.domain_id = p_domain) THEN
      RAISE EXCEPTION 'warning closure rejected: no such warning % in this domain (the duplicate''s original)', p_ref ->> 'warning_id' USING ERRCODE = '23503';
    END IF;
    v_closure := jsonb_build_object('criterion', 'duplicate', 'of_warning_id', p_ref ->> 'warning_id');
  ELSE
    v_closure := jsonb_build_object('criterion', p_criterion);
  END IF;
  v_closure := v_closure || jsonb_build_object('reason', btrim(p_reason), 'from_state', w.state, 'by', p_actor, 'at', v_at);
  UPDATE prediction.warnings_current SET state = 'closed', closure = v_closure, closed_at = v_at, closed_by = p_actor WHERE warning_id = p_warning;
  INSERT INTO prediction.warning_events (event_id, scope, tenant_id, domain_id, warning_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_warning, 'warning.closed', p_actor, v_closure, p_correlation);
  RETURN jsonb_build_object('warning_id', p_warning, 'state', 'closed', 'closure', v_closure);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.close_warning(uuid,uuid,uuid,text,jsonb,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.close_warning(uuid,uuid,uuid,text,jsonb,text,uuid,uuid,uuid) TO eye_commit;

-- ============================================================
-- §W6 FEEDBACK AND THE EVALUATION
-- ============================================================
-- FEEDBACK: a named human's verdict, one per person, warning and kind — a repeat answers the recorded one (`repeated`).
CREATE OR REPLACE FUNCTION prediction.record_warning_feedback(p_feedback_id uuid, p_warning uuid, p_tenant uuid, p_domain uuid, p_kind text, p_note text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE w prediction.warnings_current%ROWTYPE; f prediction.warning_feedback%ROWTYPE; v_id uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.warning.feedback']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'warning feedback rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM identity.principals p WHERE p.id = p_actor AND p.kind = 'human' AND p.status = 'active') THEN
    RAISE EXCEPTION 'warning feedback rejected: feedback is a named human''s act' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO w FROM prediction.warnings_current x WHERE x.warning_id = p_warning AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'warning feedback rejected: no such warning % in this domain', p_warning USING ERRCODE = '23503'; END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('false', 'late', 'missed', 'duplicated', 'useful') THEN
    RAISE EXCEPTION 'warning feedback rejected: the kind is false, late, missed, duplicated or useful' USING ERRCODE = '22023';
  END IF;
  IF p_kind IN ('false', 'missed', 'late', 'duplicated') AND length(btrim(coalesce(p_note, ''))) < 8 THEN
    RAISE EXCEPTION 'warning feedback rejected: % feedback carries a note of at least 8 characters (what was wrong)', p_kind USING ERRCODE = '22023';
  END IF;
  INSERT INTO prediction.warning_feedback (feedback_id, scope, tenant_id, domain_id, warning_id, kind, note, warning_state, given_by, correlation_id)
  VALUES (p_feedback_id, 'DOMAIN', p_tenant, p_domain, p_warning, p_kind, nullif(btrim(coalesce(p_note, '')), ''), w.state, p_actor, p_correlation)
  ON CONFLICT ON CONSTRAINT pwfb_once DO NOTHING
  RETURNING feedback_id INTO v_id;
  IF v_id IS NULL THEN
    SELECT * INTO f FROM prediction.warning_feedback x WHERE x.warning_id = p_warning AND x.given_by = p_actor AND x.kind = p_kind;
    RETURN jsonb_build_object('feedback_id', f.feedback_id, 'warning_id', p_warning, 'kind', f.kind, 'note', f.note, 'given_at', f.given_at, 'repeated', true);
  END IF;
  INSERT INTO prediction.warning_events (event_id, scope, tenant_id, domain_id, warning_id, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_warning, 'warning.feedback', p_actor,
          jsonb_build_object('feedback_id', v_id, 'kind', p_kind, 'note', nullif(btrim(coalesce(p_note, '')), ''), 'warning_state', w.state), p_correlation);
  RETURN jsonb_build_object('feedback_id', v_id, 'warning_id', p_warning, 'kind', p_kind, 'note', nullif(btrim(coalesce(p_note, '')), ''), 'warning_state', w.state, 'repeated', false);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.record_warning_feedback(uuid,uuid,uuid,uuid,text,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.record_warning_feedback(uuid,uuid,uuid,uuid,text,text,uuid,uuid) TO eye_commit;

-- A measured ratio, or its abstention below the sample floor (the 0086 §G4 shape).
CREATE OR REPLACE FUNCTION prediction.warning_ratio(p_num bigint, p_sample bigint, p_min int, p_what text) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN p_sample < p_min THEN jsonb_build_object('abstained', true, 'sample', p_sample, 'reason', format('%s: %s warning(s), below min_sample %s', p_what, p_sample, p_min))
              ELSE jsonb_build_object('abstained', false, 'sample', p_sample, 'numerator', p_num, 'value', round(p_num::numeric / p_sample, 4)) END;
$$;

-- EVALUATE: a NAMED HUMAN's act (executive, domain_admin or platform_admin); every measure computed HERE from the warnings of the
-- window (raised_at within it), their feedback and their clocks.
CREATE OR REPLACE FUNCTION prediction.evaluate_warnings(p_evaluation_id uuid, p_tenant uuid, p_domain uuid, p_window_from timestamptz, p_window_to timestamptz, p_min_sample int, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_at timestamptz := clock_timestamp(); v_from timestamptz; v_to timestamptz; v_min int := coalesce(p_min_sample, 5); o record; t record; a record; s record;
        v_origins jsonb := '{}'::jsonb; v_t3 jsonb; v_ack jsonb; v_clusters jsonb; v_measures jsonb; v_verdict text; v_reason text; v_measured int := 0; v_abstained int := 0; v_r jsonb; k text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.warning.evaluate']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'warning evaluation rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF NOT executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['executive', 'domain_admin', 'platform_admin']) THEN
    RAISE EXCEPTION 'warning evaluation rejected: the warnings are evaluated by a named human holding executive, domain_admin or platform_admin' USING ERRCODE = '42501';
  END IF;
  IF v_min < 1 OR v_min > 10000 THEN RAISE EXCEPTION 'warning evaluation rejected: min_sample is a whole number in [1, 10000]' USING ERRCODE = '22023'; END IF;
  v_to := coalesce(p_window_to, v_at); v_from := coalesce(p_window_from, v_to - interval '30 days');
  IF v_to < v_from THEN RAISE EXCEPTION 'warning evaluation rejected: the window ends before it begins' USING ERRCODE = '22023'; END IF;

  -- THE RATES BY ORIGIN: of the warnings with any feedback, the share marked false, late, missed, duplicated, useful (a warning counts once per kind).
  FOR o IN
    WITH w AS (SELECT x.warning_id, x.origin_kind FROM prediction.warnings_current x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.raised_at >= v_from AND x.raised_at <= v_to),
         f AS (SELECT w.origin_kind, w.warning_id, array_agg(DISTINCT b.kind) AS kinds FROM w JOIN prediction.warning_feedback b ON b.warning_id = w.warning_id GROUP BY w.origin_kind, w.warning_id)
    SELECT w.origin_kind, count(DISTINCT w.warning_id) AS raised, count(DISTINCT f.warning_id) AS judged,
           count(DISTINCT f.warning_id) FILTER (WHERE 'false' = ANY (f.kinds)) AS n_false, count(DISTINCT f.warning_id) FILTER (WHERE 'late' = ANY (f.kinds)) AS n_late,
           count(DISTINCT f.warning_id) FILTER (WHERE 'missed' = ANY (f.kinds)) AS n_missed, count(DISTINCT f.warning_id) FILTER (WHERE 'duplicated' = ANY (f.kinds)) AS n_dup,
           count(DISTINCT f.warning_id) FILTER (WHERE 'useful' = ANY (f.kinds)) AS n_useful
      FROM w LEFT JOIN f ON f.warning_id = w.warning_id GROUP BY w.origin_kind ORDER BY w.origin_kind
  LOOP
    v_r := jsonb_build_object('raised', o.raised, 'with_feedback', o.judged,
      'false_rate', prediction.warning_ratio(o.n_false, o.judged, v_min, 'false rate'), 'late_rate', prediction.warning_ratio(o.n_late, o.judged, v_min, 'late rate'),
      'missed_rate', prediction.warning_ratio(o.n_missed, o.judged, v_min, 'missed rate'), 'duplicated_rate', prediction.warning_ratio(o.n_dup, o.judged, v_min, 'duplicated rate'),
      'useful_rate', prediction.warning_ratio(o.n_useful, o.judged, v_min, 'useful rate'),
      'counts', jsonb_build_object('false', o.n_false, 'late', o.n_late, 'missed', o.n_missed, 'duplicated', o.n_dup, 'useful', o.n_useful));
    v_origins := v_origins || jsonb_build_object(o.origin_kind, v_r);
    FOREACH k IN ARRAY ARRAY['false_rate', 'late_rate', 'missed_rate', 'duplicated_rate', 'useful_rate'] LOOP
      IF (v_r #>> ARRAY[k, 'abstained'])::boolean THEN v_abstained := v_abstained + 1; ELSE v_measured := v_measured + 1; END IF;
    END LOOP;
  END LOOP;

  -- T3: the share raised BEFORE the decision deadline, over the warnings that declare one (the rest are unmeasured, counted).
  SELECT count(*) FILTER (WHERE x.decision_deadline IS NOT NULL) AS measured, count(*) FILTER (WHERE x.decision_deadline IS NOT NULL AND x.raised_as_of < x.decision_deadline) AS timely,
         count(*) FILTER (WHERE x.decision_deadline IS NULL) AS unmeasured
    INTO t FROM prediction.warnings_current x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.raised_at >= v_from AND x.raised_at <= v_to;
  v_t3 := prediction.warning_ratio(t.timely, t.measured, v_min, 'T3 (raised before the decision deadline)') || jsonb_build_object('unmeasured', t.unmeasured, 'basis', 'raised_as_of < decision_deadline, on the warning''s own clock');
  IF (v_t3 ->> 'abstained')::boolean THEN v_abstained := v_abstained + 1; ELSE v_measured := v_measured + 1; END IF;

  -- THE ACKNOWLEDGEMENT on the warning's own clock: acknowledged_as_of − raised_as_of, p50 and p90; the late answers and the expired counted.
  SELECT count(*) FILTER (WHERE x.acknowledged_as_of IS NOT NULL) AS n,
         percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM (x.acknowledged_as_of - x.raised_as_of))) FILTER (WHERE x.acknowledged_as_of IS NOT NULL) AS p50,
         percentile_cont(0.9) WITHIN GROUP (ORDER BY extract(epoch FROM (x.acknowledged_as_of - x.raised_as_of))) FILTER (WHERE x.acknowledged_as_of IS NOT NULL) AS p90,
         count(*) FILTER (WHERE x.response_timely IS FALSE AND x.acknowledged_as_of IS NOT NULL) AS late, count(*) FILTER (WHERE x.state = 'expired' OR x.expired_as_of IS NOT NULL) AS expired
    INTO a FROM prediction.warnings_current x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.raised_at >= v_from AND x.raised_at <= v_to;
  v_ack := CASE WHEN a.n < v_min THEN jsonb_build_object('abstained', true, 'sample', a.n, 'reason', format('acknowledgement latency: %s acknowledged warning(s), below min_sample %s', a.n, v_min))
                ELSE jsonb_build_object('abstained', false, 'sample', a.n, 'p50_seconds', round(a.p50::numeric, 3), 'p90_seconds', round(a.p90::numeric, 3)) END
           || jsonb_build_object('acknowledged_late', a.late, 'expired_unanswered', a.expired);
  IF (v_ack ->> 'abstained')::boolean THEN v_abstained := v_abstained + 1; ELSE v_measured := v_measured + 1; END IF;

  -- THE DEDUPLICATION: what the clusters absorbed in the window (duplicates, storm members, contradicting reports) — counts, no verdict.
  SELECT count(*) FILTER (WHERE m.member_kind = 'duplicate') AS dup, count(*) FILTER (WHERE m.member_kind = 'storm') AS storm, count(*) FILTER (WHERE m.stance = 'contradicting') AS contra,
         count(DISTINCT m.warning_id) FILTER (WHERE m.member_kind = 'storm') AS storms
    INTO s FROM prediction.warning_cluster_members m WHERE m.tenant_id = p_tenant AND m.domain_id = p_domain AND m.joined_at >= v_from AND m.joined_at <= v_to;
  v_clusters := jsonb_build_object('duplicates_absorbed', s.dup, 'storm_members', s.storm, 'storm_leads', s.storms, 'contradicting_reports', s.contra);

  v_verdict := CASE WHEN v_measured = 0 THEN 'abstained' WHEN v_abstained = 0 THEN 'measured' ELSE 'partial' END;
  v_reason := format('%s origin(s) in the window; %s measure(s) measured, %s abstained below min_sample %s; T3 %s; acknowledgement %s; %s duplicate(s) and %s storm member(s) absorbed',
    (SELECT count(*) FROM jsonb_object_keys(v_origins)), v_measured, v_abstained, v_min,
    CASE WHEN (v_t3 ->> 'abstained')::boolean THEN 'abstained' ELSE v_t3 ->> 'value' END,
    CASE WHEN (v_ack ->> 'abstained')::boolean THEN 'abstained' ELSE 'p50 ' || (v_ack ->> 'p50_seconds') || ' s' END, s.dup, s.storm);
  v_measures := jsonb_build_object('window', jsonb_build_object('from', v_from, 'to', v_to), 'min_sample', v_min, 'by_origin', v_origins, 't3', v_t3, 'acknowledgement', v_ack, 'clusters', v_clusters,
    'definitions', jsonb_build_object(
      'rates', 'of the warnings raised in the window that carry any feedback, the share a person marked with the kind (a warning counts once per kind)',
      't3', 'the share raised before the decision deadline, over the warnings that declare one; the rest unmeasured',
      'acknowledgement', 'acknowledged_as_of − raised_as_of on the warning''s own clock (the replay instant for a replayed warning)'));
  INSERT INTO prediction.warning_evaluations (evaluation_id, scope, tenant_id, domain_id, window_from, window_to, min_sample, measures, verdict, reason, evaluated_by, evaluated_at, correlation_id)
  VALUES (p_evaluation_id, 'DOMAIN', p_tenant, p_domain, v_from, v_to, v_min, v_measures, v_verdict, v_reason, p_actor, v_at, p_correlation);
  RETURN v_measures || jsonb_build_object('evaluation_id', p_evaluation_id, 'verdict', v_verdict, 'reason', v_reason, 'evaluated_by', p_actor, 'evaluated_at', v_at);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.evaluate_warnings(uuid,uuid,uuid,timestamptz,timestamptz,int,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.evaluate_warnings(uuid,uuid,uuid,timestamptz,timestamptz,int,uuid,uuid) TO eye_commit;

-- ============================================================
-- §W7 COVERAGE GAPS (a read, under the reader's RLS)
-- ============================================================
-- The ACTIVE source-impact markers that bear on a warning: on the warning itself, on the forecast it names, and on the sources of its
-- members (a marker on any product of a member's source says that source is degraded). The remediation of a gap is the remediation
-- part's (observation.coverage_remediations), joined by the integrator.
CREATE OR REPLACE FUNCTION prediction.warning_coverage_gaps(p_warning uuid) RETURNS jsonb
STABLE SET search_path = prediction, observation, pg_catalog, pg_temp AS $$
  WITH w AS (SELECT x.warning_id, x.forecast_id FROM prediction.warnings_current x WHERE x.warning_id = p_warning),
       src AS (SELECT DISTINCT m.source_id FROM prediction.warning_cluster_members m WHERE m.warning_id = p_warning AND m.source_id IS NOT NULL),
       hit AS (SELECT DISTINCT ON (k.marker_id) k.*, CASE WHEN k.subject_kind = 'warning' AND k.subject_id = w.warning_id THEN 'the warning'
                                                        WHEN k.subject_kind = 'forecast' AND k.subject_id = w.forecast_id THEN 'the warning''s forecast'
                                                        ELSE 'a member''s source' END AS via
                 FROM observation.source_impact_markers k, w
                WHERE k.state = 'active'
                  AND ((k.subject_kind = 'warning' AND k.subject_id = w.warning_id) OR (k.subject_kind = 'forecast' AND k.subject_id = w.forecast_id) OR k.source_id IN (SELECT source_id FROM src)))
  SELECT coalesce(jsonb_agg(jsonb_build_object('marker_id', h.marker_id, 'source_id', h.source_id, 'subject_kind', h.subject_kind, 'subject_id', h.subject_id,
                                               'health_state', h.health_state, 'reason', h.reason, 'set_at', h.set_at, 'via', h.via) ORDER BY h.set_at, h.marker_id), '[]'::jsonb)
    FROM hit h;
$$ LANGUAGE sql;
REVOKE ALL ON FUNCTION prediction.warning_coverage_gaps(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.warning_coverage_gaps(uuid) TO eye_app, eye_commit;

-- ============================================================
-- §W8 EXPIRY THAT ESCALATES — prediction.expire_warnings: 0031:168's body (copied whole, the signature unchanged) with ONE block
-- ============================================================
-- The authorities gain executive.attention.tick (the tick step `warning-expiry`); after each expiry, the warning's LIVE attention item
-- is escalated at once (the block marked B28) and `warning.escalated` records what happened to it. Nothing else changes.
CREATE OR REPLACE FUNCTION prediction.expire_warnings(p_tenant uuid, p_domain uuid, p_replay_as_of timestamptz, p_actor uuid, p_correlation uuid)
RETURNS int
SECURITY DEFINER SET search_path = prediction, executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r record; n int := 0; v_as_of timestamptz;
        /* B28 (0088) */ x executive.attention_items%ROWTYPE; v_rules jsonb; v_roles text[]; v_items jsonb; v_at timestamptz; /* end B28 */
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.warning.raise', 'prediction.indicator.evaluate', /* B28 (0088) */ 'executive.attention.tick']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  -- Live warnings expire on the audit clock. Replayed warnings expire only when a REPLAY clock is
  -- supplied and has passed their window; a live sweep says nothing about a replayed window.
  FOR r IN SELECT warning_id, response_window_closes_at, timing_mode FROM prediction.warnings_current
            WHERE tenant_id = p_tenant AND domain_id = p_domain AND state = 'raised'
              AND ((timing_mode = 'live' AND response_window_closes_at < clock_timestamp())
                OR (timing_mode = 'replay' AND p_replay_as_of IS NOT NULL AND response_window_closes_at < p_replay_as_of))
            FOR UPDATE
  LOOP
    v_as_of := CASE WHEN r.timing_mode = 'replay' THEN p_replay_as_of ELSE clock_timestamp() END;
    UPDATE prediction.warnings_current SET state = 'expired', expired_as_of = v_as_of, response_timely = false
     WHERE warning_id = r.warning_id;
    INSERT INTO prediction.warning_events (
      event_id, scope, tenant_id, domain_id, warning_id, event, actor_principal_id, details, correlation_id
    ) VALUES (
      gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, r.warning_id, 'warning.expired', p_actor,
      jsonb_build_object('closed_at', r.response_window_closes_at, 'expired_as_of', v_as_of, 'timing_mode', r.timing_mode,
                         'reason', 'the response window closed without an acknowledgement'), p_correlation);
    n := n + 1;
    /* B28 (0088): ESCALATION ON EXPIRY — the warning's live attention item (warning.raised: open, escalated or unrouted) escalated AT ONCE
       under its own policy version, as executive.escalate_attention_due escalates an overdue item (the class's escalation roles joined,
       the deadline renewed; bounded by max_escalations — exhausted recorded, nobody paged again); `warning.escalated` names what happened.
       A warning no attention item routes (no attention subscription, no policy) records no escalation: nothing is paged. */
    v_items := '[]'::jsonb; v_at := clock_timestamp();
    FOR x IN SELECT * FROM executive.attention_items i WHERE i.tenant_id = p_tenant AND i.domain_id = p_domain AND i.signal_class = 'warning.raised'
              AND i.subject_id = r.warning_id AND i.state IN ('open', 'escalated', 'unrouted') ORDER BY i.created_at, i.item_id FOR UPDATE LOOP
      SELECT a.rules #> ARRAY['classes', x.signal_class] INTO v_rules FROM executive.attention_policies a WHERE a.policy_id = x.policy_id;
      IF x.escalations >= coalesce((v_rules ->> 'max_escalations')::int, 0) THEN
        PERFORM executive.attention_event(x.item_id, p_tenant, p_domain, 'item.escalated', p_actor,
                  jsonb_build_object('exhausted', true, 'due_at', x.due_at, 'escalations', x.escalations, 'via', 'warning.expired', 'warning_id', r.warning_id), p_correlation);
        v_items := v_items || jsonb_build_object('item_id', x.item_id, 'from_state', x.state, 'exhausted', true, 'escalations', x.escalations);
        CONTINUE;
      END IF;
      SELECT ARRAY(SELECT DISTINCT unnest(x.route_roles || ARRAY(SELECT jsonb_array_elements_text(coalesce(v_rules -> 'escalate_to_roles', '[]'::jsonb)))) ORDER BY 1) INTO v_roles;
      UPDATE executive.attention_items SET state = 'escalated', escalations = x.escalations + 1, route_roles = v_roles,
             due_at = v_at + make_interval(mins => coalesce((v_rules ->> 'ack_within_minutes')::int, 60)), updated_at = v_at WHERE item_id = x.item_id;
      PERFORM executive.attention_event(x.item_id, p_tenant, p_domain, 'item.escalated', p_actor,
                jsonb_build_object('escalation', x.escalations + 1, 'missed_deadline', r.response_window_closes_at, 'route_roles', to_jsonb(v_roles), 'policy_version', x.policy_version,
                                   'via', 'warning.expired', 'warning_id', r.warning_id), p_correlation);
      v_items := v_items || jsonb_build_object('item_id', x.item_id, 'from_state', x.state, 'to_state', 'escalated', 'escalation', x.escalations + 1, 'route_roles', to_jsonb(v_roles));
    END LOOP;
    IF jsonb_array_length(v_items) > 0 THEN
      INSERT INTO prediction.warning_events (event_id, scope, tenant_id, domain_id, warning_id, event, actor_principal_id, details, correlation_id)
      VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, r.warning_id, 'warning.escalated', p_actor,
              jsonb_build_object('closed_at', r.response_window_closes_at, 'expired_as_of', v_as_of, 'items', v_items,
                                 'reason', 'the response window closed without an acknowledgement: the warning''s attention item escalated at once'), p_correlation);
    END IF;
    /* end B28 */
  END LOOP;
  RETURN n;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.expire_warnings(uuid,uuid,timestamptz,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.expire_warnings(uuid,uuid,timestamptz,uuid,uuid) TO eye_commit;

-- ============================================================
-- §W9 THE STATE DERIVATIONS FOLLOW STATE EVENTS ONLY
-- ============================================================
-- prediction.rebuild_projections: 0065:1271's body (copied whole) with ONE change in the warnings block — the state follows the last of
-- the four STATE events (0065 left out warning.attention alone; 0088 §0 added five non-state events, each of which would read `closed`).
CREATE OR REPLACE FUNCTION prediction.rebuild_projections()
RETURNS TABLE (projection text, live_rows bigint, rebuilt_rows bigint, mismatched bigint)
SECURITY DEFINER SET search_path = prediction, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_tenant uuid; v_domain uuid;
BEGIN
  v_tenant := public.eye_tenant(); v_domain := public.eye_domain();
  RETURN QUERY
    WITH issued AS (SELECT DISTINCT forecast_id FROM prediction.forecast_events
                     WHERE tenant_id = v_tenant AND domain_id = v_domain AND event = 'forecast.issued'),
         live AS (SELECT forecast_id FROM prediction.forecasts_current WHERE tenant_id = v_tenant AND domain_id = v_domain)
    SELECT 'forecasts_current'::text, (SELECT count(*) FROM live), (SELECT count(*) FROM issued),
           (SELECT count(*) FROM (SELECT forecast_id FROM issued EXCEPT SELECT forecast_id FROM live) x)
         + (SELECT count(*) FROM (SELECT forecast_id FROM live EXCEPT SELECT forecast_id FROM issued) y);
  RETURN QUERY
    WITH flips AS (SELECT DISTINCT branch_id FROM prediction.scenario_events
                    WHERE tenant_id = v_tenant AND domain_id = v_domain AND event = 'branch.flipped'),
         live AS (SELECT branch_id FROM prediction.branches_current
                   WHERE tenant_id = v_tenant AND domain_id = v_domain AND state = 'flipped')
    SELECT 'branches_current(flipped)'::text, (SELECT count(*) FROM live), (SELECT count(*) FROM flips),
           (SELECT count(*) FROM (SELECT branch_id FROM flips EXCEPT SELECT branch_id FROM live) x)
         + (SELECT count(*) FROM (SELECT branch_id FROM live EXCEPT SELECT branch_id FROM flips) y);
  RETURN QUERY
    WITH last AS (SELECT DISTINCT ON (warning_id) warning_id, event FROM prediction.warning_events
                   WHERE tenant_id = v_tenant AND domain_id = v_domain
                     /* B28 (0088): the four STATE events only (was: event <> 'warning.attention') */
                     AND event IN ('warning.raised', 'warning.acknowledged', 'warning.expired', 'warning.closed') /* end B28 */
                   ORDER BY warning_id, occurred_at DESC),
         expect AS (SELECT warning_id, CASE event WHEN 'warning.raised' THEN 'raised' WHEN 'warning.acknowledged' THEN 'acknowledged'
                                                  WHEN 'warning.expired' THEN 'expired' ELSE 'closed' END AS state FROM last),
         live AS (SELECT warning_id, state FROM prediction.warnings_current WHERE tenant_id = v_tenant AND domain_id = v_domain)
    SELECT 'warnings_current'::text, (SELECT count(*) FROM live), (SELECT count(*) FROM expect),
           (SELECT count(*) FROM (SELECT * FROM expect EXCEPT SELECT * FROM live) x)
         + (SELECT count(*) FROM (SELECT * FROM live EXCEPT SELECT * FROM expect) y);
END $$ LANGUAGE plpgsql;

-- decision.warning_state_as_of: 0048:394's body (copied whole) with ONE change — the five NON-STATE events 0088 §0 adds are skipped. Every
-- older event reads exactly as before (0065's `warning.attention` still falls to `closed` here — a pre-existing flaw, reported, not changed:
-- changing it would move the replay layers of every decision whose warning was marked for attention).
CREATE OR REPLACE FUNCTION decision.warning_state_as_of(p_warning uuid, p_at timestamptz) RETURNS text
STABLE SECURITY DEFINER SET search_path = prediction, pg_catalog, pg_temp AS $$
  SELECT coalesce((SELECT CASE e.event WHEN 'warning.raised' THEN 'raised' WHEN 'warning.acknowledged' THEN 'acknowledged' WHEN 'warning.expired' THEN 'expired' ELSE 'closed' END
                     FROM prediction.warning_events e WHERE e.warning_id = p_warning AND e.occurred_at <= p_at
                      /* B28 (0088) */ AND e.event NOT IN ('warning.clustered', 'warning.context_set', 'warning.escalated', 'warning.feedback', 'warning.retracted') /* end B28 */
                     ORDER BY e.occurred_at DESC, e.event_id DESC LIMIT 1), 'raised');
$$ LANGUAGE sql;
REVOKE ALL ON FUNCTION decision.warning_state_as_of(uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.warning_state_as_of(uuid, timestamptz) TO eye_app, eye_commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- section `integrator`
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0088 §I — CP-6 B28 THE INTEGRATOR (2026-09-26): what joins the parts.
--
--   * prediction.warning_coverage_gaps (§W7 copied whole; ONE change): each coverage gap carries the REMEDIATION of its source (§R's
--     observation.source_remediations — the open one first, else the latest), so a warning's coverage gap names who is closing it and how
--     (the B24 carryover (a) attached to the warning — scene B28-R).
--
-- The automatic raise of a candidate owed a warning is TypeScript (the attention agent's after-tick hook `warning-raise`, under
-- prediction.warning.raise — the PDP admits attention_agent there); the refusal row of the prelude's `warning candidate rejected` is in
-- observation-errors.ts. NOT HERE: raise_warning (unchanged); every part's own objects.

CREATE OR REPLACE FUNCTION prediction.warning_coverage_gaps(p_warning uuid) RETURNS jsonb
STABLE SET search_path = prediction, observation, pg_catalog, pg_temp AS $$
  WITH w AS (SELECT x.warning_id, x.forecast_id, x.tenant_id, x.domain_id FROM prediction.warnings_current x WHERE x.warning_id = p_warning),
       src AS (SELECT DISTINCT m.source_id FROM prediction.warning_cluster_members m WHERE m.warning_id = p_warning AND m.source_id IS NOT NULL),
       hit AS (SELECT DISTINCT ON (k.marker_id) k.*, CASE WHEN k.subject_kind = 'warning' AND k.subject_id = w.warning_id THEN 'the warning'
                                                        WHEN k.subject_kind = 'forecast' AND k.subject_id = w.forecast_id THEN 'the warning''s forecast'
                                                        ELSE 'a member''s source' END AS via
                 FROM observation.source_impact_markers k, w
                WHERE k.state = 'active'
                  AND ((k.subject_kind = 'warning' AND k.subject_id = w.warning_id) OR (k.subject_kind = 'forecast' AND k.subject_id = w.forecast_id) OR k.source_id IN (SELECT source_id FROM src)))
  SELECT coalesce(jsonb_agg(jsonb_build_object('marker_id', h.marker_id, 'source_id', h.source_id, 'subject_kind', h.subject_kind, 'subject_id', h.subject_id,
                                               'health_state', h.health_state, 'reason', h.reason, 'set_at', h.set_at, 'via', h.via,
                                               /* B28 (0088) integrator: the source's remediation (0088 §R), the open one first */
                                               'remediation', (SELECT jsonb_build_object('remediation_id', r.remediation_id, 'state', r.state, 'owner_principal_id', r.owner_principal_id,
                                                                                         'item_id', r.item_id, 'steps', r.steps, 'opened_at', r.opened_at, 'closed_at', r.closed_at)
                                                                 FROM w, observation.source_remediations(w.tenant_id, w.domain_id, ARRAY[h.source_id]) r LIMIT 1)
                                               /* end B28 integrator */) ORDER BY h.set_at, h.marker_id), '[]'::jsonb)
    FROM hit h;
$$ LANGUAGE sql;
REVOKE ALL ON FUNCTION prediction.warning_coverage_gaps(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.warning_coverage_gaps(uuid) TO eye_app, eye_commit;

