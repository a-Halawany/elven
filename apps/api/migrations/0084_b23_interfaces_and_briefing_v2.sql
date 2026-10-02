-- 0084 — CP-6 B23 (2026-09-25): THE SIX PARTIAL INTERFACES BOUND AND THE BRIEFING'S ATTENTION SECTION — the interface register 44/6/0 → 50/0/0.
--
-- One migration in five sections, each written and proven on its own (the B23 parts; their harnesses phase6-*-b23), then combined
-- here by the integrator — no function is re-declared by two sections, and each section alters only its own tables:
--   §A  L10-I02 MaterialChangeRaised@v1 and L10-I03 ReviewConvened@v1 (subscribable; the attention consumer routes both; governed
--       reviews executive.reviews / convene_review / close_review) and BRF@v2 (the executive briefing's attention section)
--   §B  L1-I02 Acquire — the STREAM form beside the unchanged command form (segments under a stable partition key, credit-based
--       backpressure, resume from the cursor, operator interrupt, explicit incomplete ranges)
--   §C  L3-I02 RetrieveContext — one purpose-bound, policy-filtered, STABLE query with explanation links and a declared product state
--   §D  L4-I02 CommitGraphRevision — an atomic, validated, idempotent change set applied as one graph revision (the domain's revision head)
--   §E  L7-I02 BranchScenario — a versioned branch added after the declaration (idempotent; stale version and duplicates refused)
--   §F  the register: every one of the fifty interfaces bound (50 / 0 / 0), asserted once.
-- Each section's header states what it does NOT do. Forward-only; nothing earlier is edited.

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §A (section `attention`)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0084 (section `attention`) — CP-6 B23: MATERIAL CHANGES AND GOVERNED REVIEWS AS EVENTS; THE BRIEFING'S ATTENTION SECTION (2026-09-25).
-- L10-I02 MaterialChangeRaised@v1 and L10-I03 ReviewConvened@v1 bound; BRF@v2 (the executive briefing with its attention section).
--
-- THE GAP (the register's own words). L10-I02 read "EarlyWarningRaised with its level and urgency (0061); material_change exposed on
-- a decision package (0065); no attention-policy engine" — B22 (0083) built the engine, but a MATERIAL CHANGE on a decision package
-- was a failure class on a delivery row, reaching nobody as itself. L10-I03 read "decision rooms and approvals (0042); intelligence
-- review cases; no review-convened event" — no governed review around an objective, a decision, a scenario, a commitment or an
-- outcome existed at all. 0083's header deferred "an attention section in the briefing (BRF@v1 is closed; B23 with
-- MaterialChangeRaised)".
--
-- THE MECHANISM.
-- (§1) SUBSCRIBABLE: MaterialChangeRaised (L10-I02) and ReviewConvened (L10-I03) join graph.subscribable_event_types (twelve) and the
--   attention kind's own types (graph.subscription_consumer_events); the two literal CHECKs (subscriptions.event_types,
--   subscription_deliveries.event_type) re-declared over the twelve. The receive / event-row / lease ports read the table (0083) —
--   no port is re-declared. Delivery is 0063–0066's: at-least-once from the outbox, the delivery ledger's per-item checkpoint (the
--   consumer's de-duplication), the reconciliation re-driving any committed publication with no terminal delivery; a payload that is
--   not the contract is QUARANTINED (invalid_event → human_review, 0083).
-- (§2) MaterialChangeRaised@v1 is PUBLISHED by the decisions subscriber in the item's own transaction (0066 §2: the outbox row rides
--   the item's write — committed with the package note or not at all), ONCE per cause: only when the package note is new
--   (decision.note_input_invalidated answered true) and the exposure's class is material_change. The payload carries the transparent
--   dimensions (consequence, confidence, hours to the decision deadline) and the attention-policy version active at publication (or
--   null — no policy). No SQL port is added for it: the producer's write is the existing note port.
-- (§3) THE ATTENTION CLASSES: executive.attention_signal_classes() re-declared with decision.material_change and review.convened
--   (validate_attention_rules reads it — a policy may carry rules for both); the attention_items CHECKs on signal_class and
--   subject_kind (package, review) re-declared.
-- (§4) THE GOVERNED REVIEW (L10-I03): executive.reviews — one row per review, around a declared objective | decision | scenario |
--   commitment | outcome at the version it stood at, with its question, its chair and reviewers (active humans), its due instant,
--   convened by a NAMED HUMAN (the port compares the acting principal and the convening roles), idempotent on (convener, convene_key)
--   with the request digest (the executive.requests idiom, 0066 §9: the same key and digest → the recorded review, repeated; a
--   different digest → refused); the append-only executive.review_events; executive.convene_review (ReviewConvened@v1 from the write
--   of a NEW review) and executive.close_review (concluded by the chair, withdrawn by the convener or the chair — a closed review is
--   a signal that no longer stands for the attention subscriber).
-- (§5) BRF@v2: executive.briefings gains schema_version ('v1' for every edition before 0084) and the attention section (NULL on a v1
--   edition, present on a v2 one — a CHECK binds the two); the BRF@v2 schema row (v1's, with the attention section required);
--   executive.compose_briefing re-declared (0069's body; the two parameters appended).
-- (§6) THE REGISTER: L10-I02 and L10-I03 bound (this section's rows only — the integrator asserts the register once).
--
-- NOT HERE (stated): a SQL port that publishes MaterialChangeRaised (the decisions subscriber's item write carries it); an event on a
-- review's conclusion or withdrawal (no interface names one); a timer host for a review's due instant (the attention item's deadline
-- and escalation carry it); the automatic closure of a review's attention item when the review closes (the item's owner closes it —
-- a late delivery of a closed review is recorded signal.no_longer_stands); external channels; the register's global assertion
-- (the integrator's).

-- ============================================================
-- §1 SUBSCRIBABLE: the twelve types, the attention kind's two new ones
-- ============================================================
INSERT INTO graph.subscribable_event_types (event_type, interface, since) VALUES
  ('MaterialChangeRaised', 'L10-I02', '0084'), ('ReviewConvened', 'L10-I03', '0084')
ON CONFLICT (event_type) DO NOTHING;
ALTER TABLE graph.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_event_types_check;
ALTER TABLE graph.subscriptions ADD CONSTRAINT subscriptions_event_types_check CHECK (cardinality(event_types) >= 1 AND event_types <@ ARRAY[
  'GraphChanged', 'MemoryCorrected', 'ObservationRecorded', 'SourceHealthChanged', 'ClaimsExtracted', 'IntelligenceObjectAdmitted',
  'ForecastFitnessChanged', 'ScenarioCoherenceFailed', 'EarlyWarningRaised', 'AttentionPolicyChanged', 'MaterialChangeRaised', 'ReviewConvened']);
ALTER TABLE graph.subscription_deliveries DROP CONSTRAINT IF EXISTS subscription_deliveries_event_type_check;
ALTER TABLE graph.subscription_deliveries ADD CONSTRAINT subscription_deliveries_event_type_check CHECK (event_type IN (
  'GraphChanged', 'MemoryCorrected', 'ObservationRecorded', 'SourceHealthChanged', 'ClaimsExtracted', 'IntelligenceObjectAdmitted',
  'ForecastFitnessChanged', 'ScenarioCoherenceFailed', 'EarlyWarningRaised', 'AttentionPolicyChanged', 'MaterialChangeRaised', 'ReviewConvened'));
INSERT INTO graph.subscription_consumer_events (consumer_kind, event_type, since) VALUES
  ('attention', 'MaterialChangeRaised', '0084'), ('attention', 'ReviewConvened', '0084')
ON CONFLICT (consumer_kind, event_type) DO NOTHING;
UPDATE identity.roles SET description = 'The attention subscription consumer (B22; B23): routes fitness, coherence, warning, material-change and review-convened signals under the attention policy, re-evaluates on a policy change and records the policy cause on committed packages — exactly executive.attention.subscription.apply'
 WHERE code = 'attention_subscriber';

-- ============================================================
-- §2 MaterialChangeRaised@v1 — no SQL: the decisions subscriber's item write (decision.note_input_invalidated, 0063/0078) carries the
--    outbox row in its own transaction (the dispatcher's pipeline write enqueues it, 0066 §2); the attention consumer reads it (§3).
-- ============================================================

-- ============================================================
-- §3 THE ATTENTION CLASSES: seven (0083's five, decision.material_change, review.convened)
-- ============================================================
CREATE OR REPLACE FUNCTION executive.attention_signal_classes() RETURNS text[]
LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY['forecast.unfit', 'scenario.incoherent', 'warning.raised', 'source.coverage_loss', 'proposal.review', 'decision.material_change', 'review.convened'] $$;
GRANT EXECUTE ON FUNCTION executive.attention_signal_classes() TO eye_app, eye_commit;
ALTER TABLE executive.attention_items DROP CONSTRAINT IF EXISTS attention_items_signal_class_check;
ALTER TABLE executive.attention_items ADD CONSTRAINT attention_items_signal_class_check CHECK (signal_class IN (
  'forecast.unfit', 'scenario.incoherent', 'warning.raised', 'source.coverage_loss', 'proposal.review', 'decision.material_change', 'review.convened'));
ALTER TABLE executive.attention_items DROP CONSTRAINT IF EXISTS attention_items_subject_kind_check;
ALTER TABLE executive.attention_items ADD CONSTRAINT attention_items_subject_kind_check CHECK (subject_kind IN (
  'forecast', 'scenario', 'warning', 'source', 'claim', 'package', 'review'));

-- ============================================================
-- §4 THE GOVERNED REVIEW (L10-I03 ReviewConvened)
-- ============================================================
CREATE TABLE executive.reviews (
  review_id          uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  subject_kind       text NOT NULL CHECK (subject_kind IN ('objective', 'decision', 'scenario', 'commitment', 'outcome')),
  subject_id         uuid NOT NULL,
  subject_version    int CHECK (subject_version IS NULL OR subject_version >= 1),
  subject_title      text,
  question           text NOT NULL CHECK (length(btrim(question)) BETWEEN 8 AND 2000),
  chair_principal_id uuid NOT NULL,
  reviewers          uuid[] NOT NULL DEFAULT '{}' CHECK (cardinality(reviewers) <= 20),
  due_at             timestamptz,
  state              text NOT NULL DEFAULT 'convened' CHECK (state IN ('convened', 'concluded', 'withdrawn')),
  convened_by        uuid NOT NULL,
  convene_key        text NOT NULL CHECK (length(btrim(convene_key)) BETWEEN 1 AND 200),
  request_digest     text NOT NULL CHECK (request_digest ~ '^[0-9a-f]{64}$'),
  cause_item_id      uuid REFERENCES executive.attention_items(item_id),
  room_id            uuid REFERENCES executive.rooms_current(room_id),
  convened_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  closed_at          timestamptz,
  closed_by          uuid,
  closing_note       text,
  correlation_id     uuid NOT NULL,
  CONSTRAINT xrv_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT xrv_key_once UNIQUE (tenant_id, domain_id, convened_by, convene_key),
  CONSTRAINT xrv_closed_bound CHECK ((state = 'convened') = (closed_at IS NULL) AND (closed_at IS NULL) = (closed_by IS NULL) AND (closed_at IS NULL) = (closing_note IS NULL))
);
CREATE INDEX xrv_subject ON executive.reviews (tenant_id, domain_id, subject_kind, subject_id);
CREATE INDEX xrv_state ON executive.reviews (tenant_id, domain_id, state, due_at);
COMMENT ON TABLE executive.reviews IS 'L10-I03 ReviewConvened (0084): a governed review around a declared objective, decision, scenario, commitment or outcome at the version it stood at — the question, the chair and reviewers (active humans), the due instant — convened by a named human, idempotent on (convener, convene_key) with the request digest; concluded by the chair or withdrawn by the convener (the only UPDATE).';
-- A review is never rewritten: the only UPDATE is its closure (convened → concluded | withdrawn, once, with who, when and why); nothing is deleted.
CREATE OR REPLACE FUNCTION executive.review_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'reviews are never deleted' USING ERRCODE = '55000'; END IF;
  IF OLD.state = 'convened' AND NEW.state IN ('concluded', 'withdrawn') AND NEW.closed_at IS NOT NULL
     AND (to_jsonb(NEW) - 'state' - 'closed_at' - 'closed_by' - 'closing_note') = (to_jsonb(OLD) - 'state' - 'closed_at' - 'closed_by' - 'closing_note') THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'review % is immutable but for its closure', OLD.review_id USING ERRCODE = '55000';
END $$;
CREATE TRIGGER xrv_immutable BEFORE UPDATE OR DELETE ON executive.reviews FOR EACH ROW EXECUTE FUNCTION executive.review_immutable();

CREATE TABLE executive.review_events (
  event_id           uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  review_id          uuid NOT NULL REFERENCES executive.reviews(review_id),
  event              text NOT NULL CHECK (event IN ('review.convened', 'review.repeated', 'review.concluded', 'review.withdrawn')),
  actor_principal_id uuid NOT NULL,
  details            jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT xrve_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX xrve_review ON executive.review_events (review_id, occurred_at);
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON executive.review_events FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['reviews', 'review_events'] LOOP
    EXECUTE format('ALTER TABLE executive.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE executive.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY executive_isolation ON executive.%I
        USING (
          tenant_id = public.eye_tenant()
          AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain())
        )$f$, t);
    EXECUTE format('GRANT SELECT ON executive.%I TO eye_app, eye_commit', t);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION executive.review_event(p_review uuid, p_tenant uuid, p_domain uuid, p_event text, p_actor uuid, p_details jsonb, p_correlation uuid) RETURNS void
SET search_path = executive, pg_catalog, pg_temp AS $$
  INSERT INTO executive.review_events (event_id, scope, tenant_id, domain_id, review_id, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_review, p_event, p_actor, coalesce(p_details, '{}'::jsonb), p_correlation);
$$ LANGUAGE sql;
REVOKE ALL ON FUNCTION executive.review_event(uuid,uuid,uuid,text,uuid,jsonb,uuid) FROM PUBLIC;

-- The roles that convene a governed review (the PDP's rule executive.review.convene names the same; the port re-checks them).
CREATE OR REPLACE FUNCTION executive.review_convening_roles() RETURNS text[]
LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY['executive', 'strategy_owner', 'decision_owner', 'decision_authority', 'domain_admin', 'platform_admin'] $$;
GRANT EXECUTE ON FUNCTION executive.review_convening_roles() TO eye_app, eye_commit;

-- A review's shape as the ports answer it (the event's material).
CREATE OR REPLACE FUNCTION executive.review_answer(r executive.reviews, p_repeated boolean) RETURNS jsonb
STABLE SET search_path = executive, pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object('review_id', r.review_id, 'repeated', p_repeated, 'state', r.state, 'subject_kind', r.subject_kind, 'subject_id', r.subject_id, 'subject_version', r.subject_version,
                            'subject_title', r.subject_title, 'question', r.question, 'chair', r.chair_principal_id, 'reviewers', to_jsonb(r.reviewers), 'due_at', r.due_at,
                            'convened_by', r.convened_by, 'convened_at', r.convened_at, 'convene_key', r.convene_key, 'request_digest', r.request_digest,
                            'cause_item_id', r.cause_item_id, 'room_id', r.room_id, 'closed_at', r.closed_at, 'closed_by', r.closed_by, 'closing_note', r.closing_note);
$$ LANGUAGE sql;
REVOKE ALL ON FUNCTION executive.review_answer(executive.reviews, boolean) FROM PUBLIC;

-- CONVENE: a named human's act around a declared subject of this domain; idempotent on (convener, convene_key) under the request digest.
CREATE OR REPLACE FUNCTION executive.convene_review(
  p_review_id uuid, p_tenant uuid, p_domain uuid, p_subject_kind text, p_subject_id uuid, p_subject_version int, p_question text,
  p_chair uuid, p_reviewers uuid[], p_due_at timestamptz, p_convene_key text, p_request_digest text, p_cause_item uuid, p_room uuid,
  p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, decision, prediction, graph, objects, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r executive.reviews%ROWTYPE; v_current int; v_title text; v_reviewers uuid[]; x uuid; v_at timestamptz := clock_timestamp();
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.review.convene']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'review convening rejected: convened by the acting principal' USING ERRCODE = '42501'; END IF;
  IF NOT executive.holds_role(p_actor, p_tenant, p_domain, executive.review_convening_roles()) THEN
    RAISE EXCEPTION 'review convening rejected: a review is convened by a named human holding %', array_to_string(executive.review_convening_roles(), ', ') USING ERRCODE = '42501';
  END IF;
  IF p_convene_key IS NULL OR length(btrim(p_convene_key)) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'review convening rejected: convene_key (1–200 characters) is the convener''s idempotency key for this review' USING ERRCODE = '22023';
  END IF;
  IF p_request_digest IS NULL OR p_request_digest !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'review convening rejected: the request digest is a SHA-256 hex digest' USING ERRCODE = '22023'; END IF;
  -- Exactly once: the same key with the same review returns the review already recorded; a different review under the key is refused.
  SELECT * INTO r FROM executive.reviews v WHERE v.tenant_id = p_tenant AND v.domain_id = p_domain AND v.convened_by = p_actor AND v.convene_key = btrim(p_convene_key) FOR UPDATE;
  IF FOUND THEN
    IF r.request_digest <> p_request_digest THEN
      RAISE EXCEPTION 'review convening rejected: convene key % was already used by this convener for a different review (digest % recorded, % offered); a new review takes a new key', btrim(p_convene_key), left(r.request_digest, 12), left(p_request_digest, 12) USING ERRCODE = '22023';
    END IF;
    PERFORM executive.review_event(r.review_id, p_tenant, p_domain, 'review.repeated', p_actor, jsonb_build_object('offered_review_id', p_review_id), p_correlation);
    RETURN executive.review_answer(r, true);
  END IF;
  IF p_subject_kind IS NULL OR p_subject_kind NOT IN ('objective', 'decision', 'scenario', 'commitment', 'outcome') THEN
    RAISE EXCEPTION 'review convening rejected: the subject is an objective, decision, scenario, commitment or outcome (%)', coalesce(p_subject_kind, '<none>') USING ERRCODE = '22023';
  END IF;
  IF p_question IS NULL OR length(btrim(p_question)) NOT BETWEEN 8 AND 2000 THEN RAISE EXCEPTION 'review convening rejected: the question the review answers is 8–2000 characters' USING ERRCODE = '22023'; END IF;
  -- The subject: DECLARED in this domain, at the version it stands at now (a named version must be the current one — stale context refused).
  CASE p_subject_kind
    WHEN 'objective' THEN
      SELECT s.object_version::int, s.title INTO v_current, v_title FROM graph.strategy_current s WHERE s.strategy_object_id = p_subject_id AND s.tenant_id = p_tenant AND s.domain_id = p_domain AND s.object_type = 'OBJ';
    WHEN 'decision' THEN
      SELECT p.current_version, p.title INTO v_current, v_title FROM decision.packages_current p WHERE p.package_id = p_subject_id AND p.tenant_id = p_tenant AND p.domain_id = p_domain;
    WHEN 'scenario' THEN
      SELECT (SELECT max(o.object_version)::int FROM objects.canonical_objects o WHERE o.object_id = s.scenario_id AND o.tenant_id = p_tenant AND o.object_type = 'SCN'), s.title INTO v_current, v_title
        FROM prediction.scenarios_current s WHERE s.scenario_id = p_subject_id AND s.tenant_id = p_tenant AND s.domain_id = p_domain;
    WHEN 'commitment' THEN
      SELECT c.version, 'commitment of ' || p.title || ' at version ' || c.version INTO v_current, v_title
        FROM decision.commitments c JOIN decision.packages_current p ON p.package_id = c.package_id WHERE c.commitment_id = p_subject_id AND c.tenant_id = p_tenant AND c.domain_id = p_domain;
    ELSE
      SELECT o.version, 'outcome ' || o.criterion_key || ' of ' || p.title INTO v_current, v_title
        FROM decision.outcomes o JOIN decision.packages_current p ON p.package_id = o.package_id WHERE o.outcome_id = p_subject_id AND o.tenant_id = p_tenant AND o.domain_id = p_domain;
  END CASE;
  IF NOT FOUND THEN RAISE EXCEPTION 'review convening rejected: no such % % in this domain', p_subject_kind, p_subject_id USING ERRCODE = '23503'; END IF;
  IF p_subject_version IS NOT NULL AND v_current IS DISTINCT FROM p_subject_version THEN
    RAISE EXCEPTION 'review convening rejected (stale_version): % % stands at version %, the review names version %', p_subject_kind, p_subject_id, coalesce(v_current::text, 'none'), p_subject_version USING ERRCODE = '22023';
  END IF;
  -- The chair and the reviewers: named, active humans of this tenant (or the platform).
  IF p_chair IS NULL OR NOT EXISTS (SELECT 1 FROM identity.principals p WHERE p.id = p_chair AND p.kind = 'human' AND p.status = 'active' AND (p.tenant_id = p_tenant OR p.scope = 'PLATFORM')) THEN
    RAISE EXCEPTION 'review convening rejected: the chair % is not an active human of this tenant', coalesce(p_chair::text, '<none>') USING ERRCODE = '22023';
  END IF;
  SELECT coalesce(array_agg(DISTINCT u ORDER BY u), '{}') INTO v_reviewers FROM unnest(coalesce(p_reviewers, '{}'::uuid[])) u WHERE u IS DISTINCT FROM p_chair;
  IF cardinality(v_reviewers) > 20 THEN RAISE EXCEPTION 'review convening rejected: at most 20 reviewers beside the chair' USING ERRCODE = '22023'; END IF;
  FOREACH x IN ARRAY v_reviewers LOOP
    IF NOT EXISTS (SELECT 1 FROM identity.principals p WHERE p.id = x AND p.kind = 'human' AND p.status = 'active' AND (p.tenant_id = p_tenant OR p.scope = 'PLATFORM')) THEN
      RAISE EXCEPTION 'review convening rejected: reviewer % is not an active human of this tenant', x USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF p_due_at IS NOT NULL AND (p_due_at <= v_at OR p_due_at > v_at + interval '366 days') THEN
    RAISE EXCEPTION 'review convening rejected: the review is due after now and within a year' USING ERRCODE = '22023';
  END IF;
  IF p_cause_item IS NOT NULL AND NOT EXISTS (SELECT 1 FROM executive.attention_items i WHERE i.item_id = p_cause_item AND i.tenant_id = p_tenant AND i.domain_id = p_domain) THEN
    RAISE EXCEPTION 'review convening rejected: no such attention item % in this domain', p_cause_item USING ERRCODE = '23503';
  END IF;
  IF p_room IS NOT NULL AND NOT EXISTS (SELECT 1 FROM executive.rooms_current m WHERE m.room_id = p_room AND m.tenant_id = p_tenant AND m.domain_id = p_domain) THEN
    RAISE EXCEPTION 'review convening rejected: no such room % in this domain', p_room USING ERRCODE = '23503';
  END IF;
  INSERT INTO executive.reviews (review_id, scope, tenant_id, domain_id, subject_kind, subject_id, subject_version, subject_title, question, chair_principal_id, reviewers, due_at,
                                 convened_by, convene_key, request_digest, cause_item_id, room_id, convened_at, correlation_id)
  VALUES (p_review_id, 'DOMAIN', p_tenant, p_domain, p_subject_kind, p_subject_id, v_current, left(v_title, 512), btrim(p_question), p_chair, v_reviewers, p_due_at,
          p_actor, btrim(p_convene_key), p_request_digest, p_cause_item, p_room, v_at, p_correlation)
  RETURNING * INTO r;
  PERFORM executive.review_event(p_review_id, p_tenant, p_domain, 'review.convened', p_actor,
            jsonb_build_object('subject_kind', p_subject_kind, 'subject_id', p_subject_id, 'subject_version', v_current, 'chair', p_chair, 'reviewers', to_jsonb(v_reviewers), 'due_at', p_due_at,
                               'cause_item_id', p_cause_item, 'room_id', p_room, 'convene_key', btrim(p_convene_key), 'request_digest', p_request_digest), p_correlation);
  RETURN executive.review_answer(r, false);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.convene_review(uuid,uuid,uuid,text,uuid,int,text,uuid,uuid[],timestamptz,text,text,uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.convene_review(uuid,uuid,uuid,text,uuid,int,text,uuid,uuid[],timestamptz,text,text,uuid,uuid,uuid,uuid) TO eye_commit;

-- CLOSE: concluded by the chair, withdrawn by the convener or the chair (a domain / platform administrator either), with a note; once.
CREATE OR REPLACE FUNCTION executive.close_review(p_review_id uuid, p_tenant uuid, p_domain uuid, p_disposition text, p_note text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r executive.reviews%ROWTYPE; v_admin boolean; v_at timestamptz := clock_timestamp();
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.review.close']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'review closure rejected: closed by the acting principal' USING ERRCODE = '42501'; END IF;
  IF p_disposition IS NULL OR p_disposition NOT IN ('concluded', 'withdrawn') THEN RAISE EXCEPTION 'review closure rejected: a review is concluded or withdrawn (%)', coalesce(p_disposition, '<none>') USING ERRCODE = '22023'; END IF;
  SELECT * INTO r FROM executive.reviews v WHERE v.review_id = p_review_id AND v.tenant_id = p_tenant AND v.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'review closure rejected: no such review % in this domain', p_review_id USING ERRCODE = '23503'; END IF;
  v_admin := executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['domain_admin', 'platform_admin']);
  IF p_disposition = 'concluded' AND NOT (p_actor = r.chair_principal_id OR v_admin) THEN
    RAISE EXCEPTION 'review closure rejected: a review is concluded by its chair (%)', r.chair_principal_id USING ERRCODE = '42501';
  END IF;
  IF p_disposition = 'withdrawn' AND NOT (p_actor = r.convened_by OR p_actor = r.chair_principal_id OR v_admin) THEN
    RAISE EXCEPTION 'review closure rejected: a review is withdrawn by its convener (%) or its chair', r.convened_by USING ERRCODE = '42501';
  END IF;
  IF r.state <> 'convened' THEN RAISE EXCEPTION 'review closure rejected: review % is %; only a convened review is concluded or withdrawn', p_review_id, r.state USING ERRCODE = '22023'; END IF;
  IF p_note IS NULL OR length(btrim(p_note)) < 8 THEN RAISE EXCEPTION 'review closure rejected: a closure carries a note of at least 8 characters (the conclusion, or why it is withdrawn)' USING ERRCODE = '22023'; END IF;
  UPDATE executive.reviews SET state = p_disposition, closed_at = v_at, closed_by = p_actor, closing_note = btrim(p_note) WHERE review_id = p_review_id RETURNING * INTO r;
  PERFORM executive.review_event(p_review_id, p_tenant, p_domain, CASE p_disposition WHEN 'concluded' THEN 'review.concluded' ELSE 'review.withdrawn' END, p_actor,
            jsonb_build_object('note', btrim(p_note), 'by_admin', v_admin AND p_actor <> r.chair_principal_id AND p_actor <> r.convened_by), p_correlation);
  RETURN executive.review_answer(r, false);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.close_review(uuid,uuid,uuid,text,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.close_review(uuid,uuid,uuid,text,text,uuid,uuid) TO eye_commit;

-- ============================================================
-- §5 BRF@v2: the executive briefing's attention section
-- ============================================================
-- Every edition before 0084 is v1 (the default fills them; the append-only trigger is an UPDATE/DELETE trigger — ADD COLUMN rewrites nothing it guards).
ALTER TABLE executive.briefings ADD COLUMN schema_version text NOT NULL DEFAULT 'v1' CHECK (schema_version IN ('v1', 'v2'));
ALTER TABLE executive.briefings ADD COLUMN attention jsonb CHECK (attention IS NULL OR jsonb_typeof(attention) = 'object');
ALTER TABLE executive.briefings ADD CONSTRAINT xbr_attention_v2 CHECK ((schema_version = 'v2') = (attention IS NOT NULL));
COMMENT ON COLUMN executive.briefings.attention IS 'BRF@v2 (0084): the attention section — the routed attention items as of the edition''s known_at (their state reconstructed from the item log, each with its confidence band) and the material changes since the prior edition; inside the content and its digest. NULL on a v1 edition.';

INSERT INTO objects.schema_registry (object_type, schema_version, json_schema, compatibility) VALUES
('BRF', 'v2', '{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "additionalProperties": false,
  "required": ["room_id","package_id","watermark","sources","items","windows","source_states","degraded","attention","content_digest","narrative","narrative_cites","composed_via"],
  "properties": {
    "room_id": { "type": ["string","null"] },
    "package_id": { "type": ["string","null"] },
    "watermark": { "type": "object", "required": ["prior_briefing_id","prior_composed_at","known_at"] },
    "sources": { "type": "array" },
    "items": { "type": "array", "items": { "type": "object", "required": ["item_id","kind","at","truth_state","source_state"] } },
    "windows": { "type": "array" },
    "source_states": { "type": "array" },
    "degraded": { "type": "boolean" },
    "attention": {
      "type": "object",
      "additionalProperties": false,
      "required": ["as_of","since","policy_version","items","counts","material_changes_since_prior"],
      "properties": {
        "as_of": { "type": "string" },
        "since": { "type": ["string","null"] },
        "policy_version": { "type": ["integer","null"] },
        "items": { "type": "array", "items": { "type": "object", "required": ["item_id","signal_class","subject_kind","subject_id","state","confidence","confidence_band"],
                   "properties": { "confidence_band": { "enum": ["high","medium","low","unknown"] } } } },
        "counts": { "type": "object" },
        "material_changes_since_prior": { "type": "array", "items": { "type": "object", "required": ["item_id","subject_id","state","confidence","confidence_band"],
                   "properties": { "confidence_band": { "enum": ["high","medium","low","unknown"] } } } }
      }
    },
    "content_digest": { "type": "string", "pattern": "^[0-9a-f]{64}$" },
    "narrative": { "type": ["string","null"] },
    "narrative_cites": { "type": "array" },
    "composed_via": { "enum": ["human","agent"] },
    "agent_id": { "type": ["string","null"] }
  }
}'::jsonb, 'backward')
ON CONFLICT DO NOTHING;

-- executive.compose_briefing: 0069's body verbatim, the schema version and the attention section appended (the previous signature dropped).
DROP FUNCTION IF EXISTS executive.compose_briefing(uuid,uuid,uuid,uuid,uuid,uuid,text,uuid,timestamptz,uuid,jsonb,jsonb,jsonb,jsonb,jsonb,boolean,text,jsonb,text,text,jsonb,uuid,uuid,jsonb);
CREATE OR REPLACE FUNCTION executive.compose_briefing(
  p_briefing_id uuid, p_tenant uuid, p_domain uuid, p_room_id uuid, p_package_id uuid, p_composer uuid, p_via text, p_agent_id uuid, p_known_at timestamptz,
  p_prior uuid, p_watermark jsonb, p_sources jsonb, p_items jsonb, p_windows jsonb, p_source_states jsonb, p_degraded boolean,
  p_narrative text, p_narrative_cites jsonb, p_content_digest text, p_header_digest text, p_controls jsonb, p_event_id uuid, p_correlation uuid,
  p_memory_accesses jsonb, p_schema_version text, p_attention jsonb
) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r record; pr record; c jsonb; v_ids jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['briefing.compose']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_composer IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'briefing rejected: composed by the acting principal' USING ERRCODE = '42501'; END IF;
  -- 0084 (BRF@v2): an edition names its schema version; a v2 edition carries its attention section, a v1 edition none.
  IF p_schema_version IS NULL OR p_schema_version NOT IN ('v1', 'v2') THEN RAISE EXCEPTION 'briefing rejected: the schema version is v1 or v2' USING ERRCODE = '22023'; END IF;
  IF (p_schema_version = 'v2') <> (p_attention IS NOT NULL AND jsonb_typeof(p_attention) = 'object') THEN
    RAISE EXCEPTION 'briefing rejected: a BRF@v2 edition carries its attention section and a BRF@v1 edition none' USING ERRCODE = '22023';
  END IF;
  IF p_via = 'agent' THEN
    IF NOT EXISTS (SELECT 1 FROM executive.agents a WHERE a.agent_id = p_agent_id AND a.principal_id = p_composer AND a.agent_kind = 'briefing' AND a.status = 'active' AND a.tenant_id = p_tenant AND a.domain_id = p_domain) THEN
      RAISE EXCEPTION 'briefing rejected: the composing principal is not an active briefing agent of this domain' USING ERRCODE = '42501';
    END IF;
  ELSIF p_via <> 'human' THEN
    RAISE EXCEPTION 'briefing rejected: composed_via is human or agent' USING ERRCODE = '22023';
  END IF;
  IF p_room_id IS NOT NULL THEN
    SELECT * INTO r FROM executive.rooms_current x WHERE x.room_id = p_room_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
    IF NOT FOUND THEN RAISE EXCEPTION 'briefing rejected: no such room in this domain' USING ERRCODE = '23503'; END IF;
    IF p_via = 'human' AND NOT executive.is_member(p_room_id, p_composer) THEN
      RAISE EXCEPTION 'briefing rejected: a room briefing is composed by a member of the room' USING ERRCODE = '42501';
    END IF;
    IF p_package_id IS DISTINCT FROM r.package_id THEN RAISE EXCEPTION 'briefing rejected: the package is not the room''s' USING ERRCODE = '22023'; END IF;
  END IF;
  IF p_prior IS NOT NULL THEN
    SELECT * INTO pr FROM executive.briefings x WHERE x.briefing_id = p_prior AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
    IF NOT FOUND THEN RAISE EXCEPTION 'briefing rejected: the prior briefing does not exist in this domain' USING ERRCODE = '23503'; END IF;
    IF pr.room_id IS DISTINCT FROM p_room_id THEN RAISE EXCEPTION 'briefing rejected: the prior briefing belongs to another room' USING ERRCODE = '22023'; END IF;
    IF pr.known_at > p_known_at THEN
      RAISE EXCEPTION 'briefing rejected: the prior briefing''s known_at (%) is after this briefing''s known_at (%); a briefing follows a prior that knew no more than it', decision.iso(pr.known_at), decision.iso(p_known_at) USING ERRCODE = '22023';
    END IF;
    IF (p_watermark ->> 'prior_briefing_id') IS DISTINCT FROM p_prior::text THEN RAISE EXCEPTION 'briefing rejected: the watermark does not name the prior it follows' USING ERRCODE = '22023'; END IF;
    IF (p_watermark ->> 'prior_known_at')::timestamptz IS DISTINCT FROM pr.known_at THEN RAISE EXCEPTION 'briefing rejected: the watermark''s prior_known_at is not the prior''s known_at' USING ERRCODE = '22023'; END IF;
  ELSIF (p_watermark ->> 'prior_briefing_id') IS NOT NULL THEN
    RAISE EXCEPTION 'briefing rejected: the watermark names a prior the briefing does not bind' USING ERRCODE = '22023';
  END IF;
  IF (p_watermark ->> 'known_at')::timestamptz IS DISTINCT FROM p_known_at THEN RAISE EXCEPTION 'briefing rejected: the watermark''s known_at is not the briefing''s' USING ERRCODE = '22023'; END IF;
  IF p_narrative IS NOT NULL THEN
    IF length(btrim(p_narrative)) < 8 THEN RAISE EXCEPTION 'briefing rejected: a narrative says something or is absent' USING ERRCODE = '22023'; END IF;
    SELECT coalesce(jsonb_agg(i ->> 'item_id'), '[]'::jsonb) INTO v_ids FROM jsonb_array_elements(p_items) i;
    FOR c IN SELECT * FROM jsonb_array_elements(coalesce(p_narrative_cites, '[]'::jsonb)) LOOP
      IF NOT (v_ids @> jsonb_build_array(c)) THEN RAISE EXCEPTION 'briefing rejected: the narrative cites %, which is not an item of this briefing', c USING ERRCODE = '22023'; END IF;
    END LOOP;
    IF jsonb_array_length(coalesce(p_narrative_cites, '[]'::jsonb)) = 0 THEN RAISE EXCEPTION 'briefing rejected: a narrative cites the items it summarises' USING ERRCODE = '22023'; END IF;
  END IF;
  INSERT INTO executive.briefings (briefing_id, scope, tenant_id, domain_id, room_id, package_id, composed_by, composed_via, agent_id, known_at, prior_briefing_id, watermark, sources, items, windows, source_states, degraded,
                                   narrative, narrative_cites, content_digest, header_digest, controls, correlation_id, memory_accesses, schema_version, attention)
  VALUES (p_briefing_id, 'DOMAIN', p_tenant, p_domain, p_room_id, p_package_id, p_composer, p_via, p_agent_id, p_known_at, p_prior, p_watermark, p_sources, p_items, p_windows, coalesce(p_source_states, '[]'::jsonb), coalesce(p_degraded, false),
          p_narrative, CASE WHEN p_narrative IS NULL THEN '[]'::jsonb ELSE coalesce(p_narrative_cites, '[]'::jsonb) END, p_content_digest, p_header_digest, coalesce(p_controls, '{}'::jsonb), p_correlation, coalesce(p_memory_accesses, '[]'::jsonb),
          p_schema_version, p_attention);
  IF p_room_id IS NOT NULL THEN
    INSERT INTO executive.room_events (event_id, scope, tenant_id, domain_id, room_id, event, actor_principal_id, details, correlation_id)
    VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_room_id, 'briefing.composed', p_composer,
            jsonb_build_object('briefing_id', p_briefing_id, 'prior_briefing_id', p_prior, 'known_at', p_known_at, 'content_digest', p_content_digest, 'items', jsonb_array_length(p_items), 'degraded', coalesce(p_degraded, false), 'via', p_via,
                               'schema_version', p_schema_version), p_correlation);
  END IF;
  RETURN jsonb_build_object('briefing_id', p_briefing_id, 'content_digest', p_content_digest, 'schema_version', p_schema_version);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.compose_briefing(uuid,uuid,uuid,uuid,uuid,uuid,text,uuid,timestamptz,uuid,jsonb,jsonb,jsonb,jsonb,jsonb,boolean,text,jsonb,text,text,jsonb,uuid,uuid,jsonb,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.compose_briefing(uuid,uuid,uuid,uuid,uuid,uuid,text,uuid,timestamptz,uuid,jsonb,jsonb,jsonb,jsonb,jsonb,boolean,text,jsonb,text,text,jsonb,uuid,uuid,jsonb,text,jsonb) TO eye_commit;

-- ============================================================
-- §6 THE INTERFACE REGISTER: L10-I02 and L10-I03 (this section's rows only; the integrator asserts the register once)
-- ============================================================
UPDATE objects.interface_register SET binding_state = 'bound', schema_version = 'v1', bound_at = clock_timestamp(), bound_in = '0084',
  bound_to = 'MaterialChangeRaised@v1 published by the decisions subscriber (decision.subscription.apply) in the SAME transaction as the package note it follows (decision.note_input_invalidated, once per cause; 0066 §2 — the outbox row rides the item''s write): only when the exposure''s class is material_change (a cited forecast withdrawn or assessed unfit, a cited run invalidated, a recomputation beyond the declared materiality rule) and the note is new, carrying the package, its version and owner, whether the decision was executed, the disposition, the upstream trigger (event, change kind, note), the TRANSPARENT dimensions — consequence (C3 when the decision was executed, C2 otherwise), confidence (1 for a recorded categorical loss or a measured material recomputation, 0.8 for an assessment under the fitness rule, 0.5 when unmeasurable), hours to the decision deadline — and the attention-policy version active at publication (null when none); CONSUMED by the attention subscriber (executive.attention.subscription.apply): routed under the domain''s ACTIVE policy as decision.material_change to the package owner and the class''s roles (executive.route_attention_item — one item per class, subject and cause, so a redelivery or a replay makes no second item); at-least-once delivery with the ledger''s per-item checkpoint and the reconciliation of any committed publication without a terminal delivery; an event that is not the contract QUARANTINED (invalid_event → human_review); a package withdrawn or closed since recorded signal.no_longer_stands. NOT here: EarlyWarningRaised stays its own class (warning.raised); no SQL port publishes the event'
  WHERE interface_id = 'L10-I02';
UPDATE objects.interface_register SET binding_state = 'bound', schema_version = 'v1', bound_at = clock_timestamp(), bound_in = '0084',
  bound_to = 'ReviewConvened@v1 from POST …/executive/reviews/convene (executive.review.convene, human-gated → executive.convene_review): a GOVERNED REVIEW opened around a declared objective | decision | scenario | commitment | outcome of the domain at the version it stands at (a named version that is not the current one refused as stale), with its question, its chair and reviewers (active humans) and its due instant, convened by a NAMED HUMAN holding executive, strategy_owner, decision_owner, decision_authority, domain_admin or platform_admin (the port compares the acting principal), optionally from an attention item or in a room; idempotent on (convener, convene_key) under the request digest — the same key and digest answer the recorded review with no second event, a different digest is refused; the event published transactionally from the write of a NEW review; CONSUMED by the attention subscriber: routed as review.convened to the chair (hours to the due instant in the dimensions), one item per review and cause (de-duplicated on redelivery and replay), the reconciliation re-driving a committed publication whose delivery was lost, an event that is not the contract QUARANTINED (invalid_event → human_review), a review concluded or withdrawn since recorded signal.no_longer_stands; executive.close_review concludes (the chair) or withdraws (the convener or the chair) with a note. NOT here: no event on the closure; no timer host for the due instant'
  WHERE interface_id = 'L10-I03';

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §B (section `stream`)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0084 (part `stream`) — CP-6 B23: L1-I02 "Acquire" GAINS ITS STREAM FORM (2026-09-25). The register row reads command/stream,
-- transport 'stream', reliability "At-least-once segments under stable partition key", failure "Backpressure, resume, or explicit
-- incomplete range"; 0065 recorded it partial: "the command form; no flow-controlled stream form". This section adds the stream
-- form beside the command form, which is UNCHANGED (collectNow, the scheduled job, Connector.acquire(), the lifecycle's walk():
-- no port, table or event vocabulary they use is touched here).
--
-- WHAT "STREAM" MEANS HERE (stated, so the register never claims more): SEGMENT PULL WITH CREDIT-BASED FLOW CONTROL over the
-- connector's own pages — the lifecycle pulls one page (a SEGMENT) at a time from the connector's stream form and never holds
-- more than `credit` segments delivered but not yet acknowledged; it is NOT a WebSocket or SSE transport and no socket is held
-- open to a publisher. A segment is ACKNOWLEDGED when its items have gone through the ordinary admission (purpose, rights,
-- residency, custody, quarantine, dedup — unchanged) and the segment is appended here.
--
-- THE MECHANISM.
-- (§1) observation.acquisition_streams — one row per stream: the source, the contract version it was opened under, the STABLE
--   PARTITION KEY ('<source_key>:<partition>', the same across runs), the declared range [range_from, range_to), the CURSOR (the
--   connector's own resume point, jsonb), the high-water position, the next sequence number, the CREDIT (the maximum number of
--   unacknowledged segments), the run currently driving it, and its state: open | running | backpressured | interrupted (non-
--   terminal) | completed | closed_incomplete (terminal). One non-terminal stream per (source, partition key) — a partial unique
--   index — so opening the same partition again RESUMES it from its cursor rather than starting a second stream.
-- (§2) observation.acquisition_stream_events — the stream's append-only ledger: opened, resumed, segment.appended,
--   segment.redelivered, backpressured, backpressure.relieved, paused, interrupt.requested, interrupted, range.incomplete,
--   range.resolved, closed.
-- (§3) observation.acquisition_segments — PK (stream_id, seq): the partition key, the segment's own range and the cursor before
--   and after it, the SEGMENT DIGEST (over its items' keys and byte digests), the evidence ids it admitted or found held, the
--   admitted / no-op / quarantined counts, the run that appended it and its delivery count. AT-LEAST-ONCE: the same (stream,
--   seq) with the same digest is an audited REDELIVERY (a no-op, delivery_count + 1); a different digest is REFUSED (23505).
-- (§4) observation.acquisition_incomplete_ranges — an EXPLICIT INCOMPLETE RANGE: [range_from, range_to) with its class
--   (publisher_gap | quarantined | interrupted | budget | refused) and detail; resolved_by_seq when a later segment of the same
--   stream re-covered it (an interrupted in-flight segment redelivered after a resume). A stream closes `completed` only when its
--   cursor reached the end of the range with no unresolved incomplete range; otherwise `closed_incomplete`.
-- (§5) THE PORTS (SECURITY DEFINER; observation.assert_authority + assert_scope; every effect of a run fenced by
--   observation.assert_run_holds_source, 0056) riding the actions the pipeline already binds for a run:
--     open_acquisition_stream        observation.run.start        (in the lease + run.started transaction; idempotent → RESUME)
--     append_stream_segment          observation.run.checkpoint   (redelivery no-op; digest conflict 23505; the lease heartbeat)
--     signal_stream_backpressure     observation.run.checkpoint   (the credit is exhausted; the lease heartbeat)
--     declare_incomplete_range       observation.run.checkpoint   (an explicit gap the connector or the run met)
--     pause_acquisition_stream       observation.run.finish       (a pull limit reached: open at its cursor)
--     close_acquisition_stream       observation.run.finish       (completed | closed_incomplete)
--     interrupt_stream               observation.run.cancel | observation.run.finish (the run itself: an interrupt honoured,
--                                    a failure, the escape path), observation.stream.interrupt (an OPERATOR: requested of a
--                                    running stream — honoured at the next segment boundary — or immediate for an idle one),
--                                    observation.sweeper.reconcile (the sweeper, for the stream of a run it reconciles)
--   The operator's own acts are observation.stream.open / .resume (a governed pre-flight read) and observation.stream.interrupt
--   (a write), with exact PDP rules; the reads are observation.read.streams.
-- (§6) THE REGISTER: L1-I02 bound.
--
-- NOT HERE (stated): no event is added to observation.collection_run_events (its closed CHECK, 0022:277, is untouched — a stream
-- run records run.started / item.* / run.finished | run.cancelled | run.failed exactly as a command run does, and the stream's
-- own facts live in §2); observation.connector_checkpoints is NOT advanced by a stream (the stream's cursor lives on its own row,
-- so the command form's checkpoint is exactly what the command form left); no new admission path (evidence is admitted only
-- through the lifecycle's existing admitOrQuarantine); no WebSocket/SSE transport; no scheduler entry for streams (a stream is
-- opened and resumed by an operator through the routes; the scheduled job stays the command form); no automatic retry of a
-- publisher gap (it stays an explicit, unresolved incomplete range until a new stream re-walks the partition).

-- ============================================================
-- §1 THE STREAMS
-- ============================================================
CREATE TABLE observation.acquisition_streams (
  stream_id           uuid PRIMARY KEY,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  source_id           uuid NOT NULL,
  contract_version    int  NOT NULL CHECK (contract_version >= 1),
  -- '<source_key>:<partition>' — stable across runs; the port refuses a key that does not begin with the source's own key.
  partition_key       text NOT NULL CHECK (partition_key ~ '^[a-z0-9][a-z0-9._-]*:[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  -- Positions in the partition's own order (dates for a period-range walk and a replay page set).
  range_from          text NOT NULL,
  range_to            text NOT NULL,
  cursor              jsonb NOT NULL,
  high_water          text,
  next_seq            int  NOT NULL DEFAULT 0 CHECK (next_seq >= 0),
  credit              int  NOT NULL CHECK (credit BETWEEN 1 AND 64),
  reached_end         boolean NOT NULL DEFAULT false,
  current_run_id      uuid,
  state               text NOT NULL CHECK (state IN ('open', 'running', 'backpressured', 'interrupted', 'completed', 'closed_incomplete')),
  -- An operator's interrupt of a RUNNING stream: recorded here and honoured by the run at its next segment boundary.
  interrupt_requested jsonb,
  opened_by           uuid NOT NULL,
  opened_at           timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  closed_at           timestamptz,
  correlation_id      uuid NOT NULL,
  CONSTRAINT aqs_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT aqs_range CHECK (range_from < range_to),
  CONSTRAINT aqs_running_has_run CHECK ((state IN ('running', 'backpressured')) = (current_run_id IS NOT NULL)),
  CONSTRAINT aqs_closed_bound CHECK ((state IN ('completed', 'closed_incomplete')) = (closed_at IS NOT NULL))
);
-- ONE non-terminal stream per (source, partition): opening it again is a RESUME, never a second stream.
CREATE UNIQUE INDEX aqs_one_live_partition ON observation.acquisition_streams (source_id, partition_key)
  WHERE state IN ('open', 'running', 'backpressured', 'interrupted');
CREATE INDEX aqs_source ON observation.acquisition_streams (tenant_id, domain_id, source_id, opened_at);
CREATE INDEX aqs_run ON observation.acquisition_streams (current_run_id) WHERE current_run_id IS NOT NULL;
COMMENT ON TABLE observation.acquisition_streams IS 'L1-I02 (0084): the STREAM form of Acquire — segment pull with credit-based flow control over a connector''s pages under a stable partition key; a cursor to resume from; the explicit incomplete ranges of §4. The command form (collection runs, connector_checkpoints) is unchanged.';

-- ============================================================
-- §2 THE STREAM LEDGER (append-only)
-- ============================================================
CREATE TABLE observation.acquisition_stream_events (
  event_id        uuid PRIMARY KEY,
  -- The ledger's own order: several rows of one transaction share an instant, and the order they were written in is the fact.
  ledger_seq      bigint GENERATED ALWAYS AS IDENTITY,
  scope           text NOT NULL,
  tenant_id       uuid NOT NULL,
  domain_id       uuid NOT NULL,
  stream_id       uuid NOT NULL REFERENCES observation.acquisition_streams (stream_id),
  source_id       uuid NOT NULL,
  run_id          uuid,
  event           text NOT NULL CHECK (event IN (
    'opened', 'resumed', 'segment.appended', 'segment.redelivered', 'backpressured', 'backpressure.relieved',
    'paused', 'interrupt.requested', 'interrupted', 'range.incomplete', 'range.resolved', 'closed')),
  seq             int,
  actor           uuid NOT NULL,
  occurred_at     timestamptz NOT NULL DEFAULT clock_timestamp(),
  details         jsonb NOT NULL DEFAULT '{}'::jsonb,
  correlation_id  uuid NOT NULL,
  CONSTRAINT aqse_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX aqse_stream ON observation.acquisition_stream_events (stream_id, ledger_seq);
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON observation.acquisition_stream_events
  FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

-- ============================================================
-- §3 THE SEGMENTS
-- ============================================================
CREATE TABLE observation.acquisition_segments (
  stream_id       uuid NOT NULL REFERENCES observation.acquisition_streams (stream_id),
  seq             int  NOT NULL CHECK (seq >= 0),
  scope           text NOT NULL,
  tenant_id       uuid NOT NULL,
  domain_id       uuid NOT NULL,
  source_id       uuid NOT NULL,
  partition_key   text NOT NULL,
  range_from      text NOT NULL,
  range_to        text NOT NULL,
  cursor_before   jsonb NOT NULL,
  cursor_after    jsonb NOT NULL,
  segment_digest  text NOT NULL CHECK (segment_digest ~ '^[0-9a-f]{64}$'),
  item_count      int  NOT NULL CHECK (item_count >= 0),
  evidence_ids    jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(evidence_ids) = 'array'),
  admitted        int  NOT NULL DEFAULT 0 CHECK (admitted >= 0),
  noop            int  NOT NULL DEFAULT 0 CHECK (noop >= 0),
  quarantined     int  NOT NULL DEFAULT 0 CHECK (quarantined >= 0),
  incomplete      boolean NOT NULL DEFAULT false,
  run_id          uuid NOT NULL,
  delivery_count  int  NOT NULL DEFAULT 1 CHECK (delivery_count >= 1),
  appended_at     timestamptz NOT NULL DEFAULT clock_timestamp(),
  last_delivered_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id  uuid NOT NULL,
  PRIMARY KEY (stream_id, seq),
  CONSTRAINT aqsg_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
-- Only the redelivery count and instant move; the segment's content is immutable once appended.
CREATE OR REPLACE FUNCTION observation.acquisition_segment_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'append-only: DELETE prohibited on observation.acquisition_segments' USING ERRCODE = '55000';
  END IF;
  IF (to_jsonb(NEW) - 'delivery_count' - 'last_delivered_at') IS DISTINCT FROM (to_jsonb(OLD) - 'delivery_count' - 'last_delivered_at') THEN
    RAISE EXCEPTION 'acquisition segment %/% is immutable once appended; only its redelivery count moves', OLD.stream_id, OLD.seq USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON observation.acquisition_segments
  FOR EACH ROW EXECUTE FUNCTION observation.acquisition_segment_immutable();

-- ============================================================
-- §4 THE EXPLICIT INCOMPLETE RANGES
-- ============================================================
CREATE TABLE observation.acquisition_incomplete_ranges (
  range_id        uuid PRIMARY KEY,
  scope           text NOT NULL,
  tenant_id       uuid NOT NULL,
  domain_id       uuid NOT NULL,
  stream_id       uuid NOT NULL REFERENCES observation.acquisition_streams (stream_id),
  source_id       uuid NOT NULL,
  range_from      text NOT NULL,
  range_to        text NOT NULL,
  reason_class    text NOT NULL CHECK (reason_class IN ('publisher_gap', 'quarantined', 'interrupted', 'budget', 'refused')),
  detail          text NOT NULL CHECK (length(detail) BETWEEN 1 AND 1000),
  declared_seq    int,
  declared_by_run uuid,
  declared_at     timestamptz NOT NULL DEFAULT clock_timestamp(),
  resolved_by_seq int,
  resolved_at     timestamptz,
  correlation_id  uuid NOT NULL,
  CONSTRAINT aqir_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT aqir_resolved_bound CHECK ((resolved_by_seq IS NULL) = (resolved_at IS NULL))
);
CREATE INDEX aqir_stream ON observation.acquisition_incomplete_ranges (stream_id, declared_at);
CREATE INDEX aqir_unresolved ON observation.acquisition_incomplete_ranges (stream_id) WHERE resolved_by_seq IS NULL;
-- A declared gap is never withdrawn; only its resolution is recorded, once.
CREATE OR REPLACE FUNCTION observation.acquisition_incomplete_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'append-only: DELETE prohibited on observation.acquisition_incomplete_ranges' USING ERRCODE = '55000';
  END IF;
  IF OLD.resolved_by_seq IS NOT NULL
     OR (to_jsonb(NEW) - 'resolved_by_seq' - 'resolved_at') IS DISTINCT FROM (to_jsonb(OLD) - 'resolved_by_seq' - 'resolved_at') THEN
    RAISE EXCEPTION 'incomplete range % is declared once and resolved at most once', OLD.range_id USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON observation.acquisition_incomplete_ranges
  FOR EACH ROW EXECUTE FUNCTION observation.acquisition_incomplete_immutable();

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['acquisition_streams', 'acquisition_stream_events', 'acquisition_segments', 'acquisition_incomplete_ranges'] LOOP
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
-- §5 THE PORTS
-- ============================================================

-- Internal: one ledger row. No role executes it; the ports below have already asserted authority and scope.
CREATE OR REPLACE FUNCTION observation.stream_event(
  p_stream observation.acquisition_streams, p_run uuid, p_event text, p_seq int, p_details jsonb, p_correlation uuid
) RETURNS void
SECURITY DEFINER SET search_path = observation, public, pg_catalog, pg_temp AS $$
BEGIN
  INSERT INTO observation.acquisition_stream_events (
    event_id, scope, tenant_id, domain_id, stream_id, source_id, run_id, event, seq, actor, details, correlation_id
  ) VALUES (gen_random_uuid(), 'DOMAIN', p_stream.tenant_id, p_stream.domain_id, p_stream.stream_id, p_stream.source_id,
            p_run, p_event, p_seq, public.eye_principal(), coalesce(p_details, '{}'::jsonb), p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION observation.stream_event(observation.acquisition_streams, uuid, text, int, jsonb, uuid) FROM PUBLIC;

-- Internal: one explicit incomplete range, and its ledger row.
CREATE OR REPLACE FUNCTION observation.stream_incomplete(
  p_stream observation.acquisition_streams, p_run uuid, p_from text, p_to text, p_class text, p_detail text, p_seq int, p_correlation uuid
) RETURNS uuid
SECURITY DEFINER SET search_path = observation, public, pg_catalog, pg_temp AS $$
DECLARE v_id uuid := gen_random_uuid();
BEGIN
  IF p_class IS NULL OR p_class NOT IN ('publisher_gap', 'quarantined', 'interrupted', 'budget', 'refused') THEN
    RAISE EXCEPTION 'acquisition stream rejected (range): % is not an incomplete-range class (publisher_gap | quarantined | interrupted | budget | refused)',
      coalesce(p_class, '<none>') USING ERRCODE = '22023';
  END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_from = '' OR p_to = '' OR p_from > p_to THEN
    RAISE EXCEPTION 'acquisition stream rejected (range): an incomplete range names its bounds in order (from %, to %)',
      coalesce(p_from, '<none>'), coalesce(p_to, '<none>') USING ERRCODE = '22023';
  END IF;
  INSERT INTO observation.acquisition_incomplete_ranges (
    range_id, scope, tenant_id, domain_id, stream_id, source_id, range_from, range_to, reason_class, detail,
    declared_seq, declared_by_run, correlation_id
  ) VALUES (v_id, 'DOMAIN', p_stream.tenant_id, p_stream.domain_id, p_stream.stream_id, p_stream.source_id, p_from, p_to,
            p_class, left(coalesce(nullif(p_detail, ''), p_class), 1000), p_seq, p_run, p_correlation);
  PERFORM observation.stream_event(p_stream, p_run, 'range.incomplete', p_seq,
    jsonb_build_object('range_id', v_id, 'range_from', p_from, 'range_to', p_to, 'reason_class', p_class, 'detail', left(coalesce(p_detail, ''), 1000)),
    p_correlation);
  RETURN v_id;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION observation.stream_incomplete(observation.acquisition_streams, uuid, text, text, text, text, int, uuid) FROM PUBLIC;

-- Internal: the run's own events are its heartbeat (0051, clause 2) — a stream port advances it the same way.
CREATE OR REPLACE FUNCTION observation.stream_heartbeat(p_source_id uuid, p_run uuid) RETURNS void
SECURITY DEFINER SET search_path = observation, public, pg_catalog, pg_temp AS $$
BEGIN
  UPDATE observation.source_run_leases SET heartbeat_at = clock_timestamp() WHERE source_id = p_source_id AND run_id = p_run;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION observation.stream_heartbeat(uuid, uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION observation.stream_answer(s observation.acquisition_streams) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_object('stream_id', s.stream_id, 'source_id', s.source_id, 'contract_version', s.contract_version,
    'partition_key', s.partition_key, 'range_from', s.range_from, 'range_to', s.range_to, 'cursor', s.cursor,
    'high_water', s.high_water, 'next_seq', s.next_seq, 'credit', s.credit, 'reached_end', s.reached_end,
    'state', s.state, 'current_run_id', s.current_run_id, 'interrupt_requested', s.interrupt_requested IS NOT NULL)
$$;
REVOKE ALL ON FUNCTION observation.stream_answer(observation.acquisition_streams) FROM PUBLIC;

/*
 * OPEN — or RESUME. Called inside the run's own `observation.run.start` transaction, after the source lease is taken and
 * before `run.started`: a run either holds the source AND drives the stream, or neither. The same (source, partition key)
 * with a non-terminal stream is a RESUME from that stream's cursor (idempotent: the stream id, the cursor, the next sequence
 * are the stream's own); a stream left running by a run that no longer holds the source (its process died; the lease was
 * taken over) is recorded INTERRUPTED first, then resumed. `p_expect_stream` (the resume route) refuses a stream that is
 * terminal or not the partition's live one — a completed stream is never re-opened by a resume.
 */
CREATE OR REPLACE FUNCTION observation.open_acquisition_stream(
  p_stream_id uuid, p_tenant uuid, p_domain uuid, p_source_id uuid, p_contract_version int, p_run uuid,
  p_partition_key text, p_range_from text, p_range_to text, p_initial_cursor jsonb, p_credit int,
  p_expect_stream uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE
  s observation.acquisition_streams%ROWTYPE;
  v_key text; v_prev_state text; v_prev_run uuid; v_expected observation.acquisition_streams%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['observation.run.start']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM observation.assert_run_holds_source(p_source_id, p_run, 'stream.open');

  SELECT c.source_key INTO v_key FROM observation.source_contracts_current c
   WHERE c.source_id = p_source_id AND c.contract_version = p_contract_version AND c.tenant_id = p_tenant AND c.domain_id = p_domain;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'acquisition stream rejected: no source contract % version % in this domain', p_source_id, p_contract_version USING ERRCODE = '23503';
  END IF;
  IF p_partition_key IS NULL OR left(p_partition_key, length(v_key) + 1) <> (v_key || ':') OR length(p_partition_key) <= length(v_key) + 1
     OR p_partition_key !~ '^[a-z0-9][a-z0-9._-]*:[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$' THEN
    RAISE EXCEPTION 'acquisition stream rejected (partition): the partition key % does not name a partition of source % (''%:<partition>'')',
      coalesce(p_partition_key, '<none>'), v_key, v_key USING ERRCODE = '22023';
  END IF;
  IF p_credit IS NOT NULL AND (p_credit < 1 OR p_credit > 64) THEN
    RAISE EXCEPTION 'acquisition stream rejected (credit): the credit (the most unacknowledged segments) is between 1 and 64, not %', p_credit USING ERRCODE = '22023';
  END IF;

  IF p_expect_stream IS NOT NULL THEN
    SELECT * INTO v_expected FROM observation.acquisition_streams WHERE stream_id = p_expect_stream AND tenant_id = p_tenant AND domain_id = p_domain;
    IF NOT FOUND OR v_expected.source_id <> p_source_id THEN
      RAISE EXCEPTION 'acquisition stream rejected: no such stream % of this source', p_expect_stream USING ERRCODE = '23503';
    END IF;
    IF v_expected.state IN ('completed', 'closed_incomplete') THEN
      RAISE EXCEPTION 'acquisition stream rejected (not_resumable): stream % is %; a closed stream is not resumed — open the partition again for a new stream',
        p_expect_stream, v_expected.state USING ERRCODE = '23514';
    END IF;
  END IF;

  SELECT * INTO s FROM observation.acquisition_streams
   WHERE source_id = p_source_id AND partition_key = p_partition_key AND state IN ('open', 'running', 'backpressured', 'interrupted')
   FOR UPDATE;
  IF FOUND THEN
    IF p_expect_stream IS NOT NULL AND s.stream_id <> p_expect_stream THEN
      RAISE EXCEPTION 'acquisition stream rejected (not_resumable): stream % is not the live stream of partition % (that is %)', p_expect_stream, p_partition_key, s.stream_id USING ERRCODE = '23514';
    END IF;
    IF s.contract_version <> p_contract_version THEN
      RAISE EXCEPTION 'acquisition stream rejected (stale_contract): stream % of partition % was opened under contract version %, not %; close it or resume it under its own version',
        s.stream_id, p_partition_key, s.contract_version, p_contract_version USING ERRCODE = '23514';
    END IF;
    IF p_range_from IS NOT NULL AND (p_range_from <> s.range_from OR p_range_to <> s.range_to) THEN
      RAISE EXCEPTION 'acquisition stream rejected (range_mismatch): stream % of partition % covers [%, %), not [%, %); resume it as it was opened',
        s.stream_id, p_partition_key, s.range_from, s.range_to, p_range_from, p_range_to USING ERRCODE = '23514';
    END IF;
    v_prev_state := s.state; v_prev_run := s.current_run_id;
    IF s.state IN ('running', 'backpressured') AND s.current_run_id IS DISTINCT FROM p_run THEN
      -- This run holds the source (asserted above), so the run that was driving the stream does not: it ended without saying so.
      PERFORM observation.stream_event(s, v_prev_run, 'interrupted', s.next_seq,
        jsonb_build_object('by', 'reconciled_at_resume', 'reason_class', 'reconciled',
          'reason', format('run %s no longer holds the source; the stream it was driving is recorded interrupted before run %s resumes it', v_prev_run, p_run)),
        p_correlation);
    END IF;
    UPDATE observation.acquisition_streams
       SET state = 'running', current_run_id = p_run, credit = coalesce(p_credit, credit), interrupt_requested = NULL, updated_at = clock_timestamp()
     WHERE stream_id = s.stream_id RETURNING * INTO s;
    PERFORM observation.stream_event(s, p_run, 'resumed', s.next_seq,
      jsonb_build_object('from_cursor', s.cursor, 'next_seq', s.next_seq, 'previous_state', v_prev_state, 'previous_run', v_prev_run, 'credit', s.credit),
      p_correlation);
    PERFORM observation.stream_heartbeat(p_source_id, p_run);
    RETURN observation.stream_answer(s) || jsonb_build_object('resumed', true, 'previous_state', v_prev_state);
  END IF;

  IF p_expect_stream IS NOT NULL THEN
    RAISE EXCEPTION 'acquisition stream rejected (not_resumable): stream % is not live', p_expect_stream USING ERRCODE = '23514';
  END IF;
  IF p_range_from IS NULL OR p_range_to IS NULL OR p_range_from >= p_range_to THEN
    RAISE EXCEPTION 'acquisition stream rejected (range): a stream declares its range in order (from %, to %)',
      coalesce(p_range_from, '<none>'), coalesce(p_range_to, '<none>') USING ERRCODE = '22023';
  END IF;
  IF p_initial_cursor IS NULL OR jsonb_typeof(p_initial_cursor) <> 'object' THEN
    RAISE EXCEPTION 'acquisition stream rejected (cursor): a stream opens at a cursor object' USING ERRCODE = '22023';
  END IF;
  INSERT INTO observation.acquisition_streams (
    stream_id, scope, tenant_id, domain_id, source_id, contract_version, partition_key, range_from, range_to, cursor,
    credit, current_run_id, state, opened_by, correlation_id
  ) VALUES (p_stream_id, 'DOMAIN', p_tenant, p_domain, p_source_id, p_contract_version, p_partition_key, p_range_from, p_range_to,
            p_initial_cursor, coalesce(p_credit, 4), p_run, 'running', public.eye_principal(), p_correlation)
  RETURNING * INTO s;
  PERFORM observation.stream_event(s, p_run, 'opened', 0,
    jsonb_build_object('partition_key', p_partition_key, 'range_from', p_range_from, 'range_to', p_range_to, 'cursor', p_initial_cursor,
      'credit', s.credit, 'contract_version', p_contract_version),
    p_correlation);
  RETURN observation.stream_answer(s) || jsonb_build_object('resumed', false);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION observation.open_acquisition_stream(uuid,uuid,uuid,uuid,int,uuid,text,text,text,jsonb,int,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.open_acquisition_stream(uuid,uuid,uuid,uuid,int,uuid,text,text,text,jsonb,int,uuid,uuid) TO eye_commit;

-- The stream this run drives, locked; refused unless the run holds the source (0056) and drives the stream.
CREATE OR REPLACE FUNCTION observation.stream_for_run(p_stream uuid, p_tenant uuid, p_domain uuid, p_run uuid, p_effect text)
RETURNS observation.acquisition_streams
SECURITY DEFINER SET search_path = observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE s observation.acquisition_streams%ROWTYPE; v_source uuid;
BEGIN
  SELECT source_id INTO v_source FROM observation.acquisition_streams WHERE stream_id = p_stream AND tenant_id = p_tenant AND domain_id = p_domain;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'acquisition stream rejected: no such stream % in this domain', p_stream USING ERRCODE = '23503';
  END IF;
  -- The LEASE row first, then the stream row — the order open_acquisition_stream takes them in, so the two never deadlock.
  PERFORM observation.assert_run_holds_source(v_source, p_run, p_effect);
  SELECT * INTO s FROM observation.acquisition_streams WHERE stream_id = p_stream FOR UPDATE;
  RETURN s;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION observation.stream_for_run(uuid,uuid,uuid,uuid,text) FROM PUBLIC;

/*
 * APPEND — the acknowledgement of one segment. AT-LEAST-ONCE: a segment already appended under this (stream, seq) with the
 * SAME digest is a REDELIVERY — recorded, counted, no-op; with a DIFFERENT digest it is refused (the same position cannot hold
 * two contents). A new segment must be the stream's next sequence number, from the run that drives it. The cursor advances to
 * the segment's cursor_after; an incomplete segment (a publisher gap, a refused page) and a segment with quarantined items
 * each declare an EXPLICIT INCOMPLETE RANGE; an `interrupted` range the segment re-covers (the same start) is RESOLVED by it.
 */
CREATE OR REPLACE FUNCTION observation.append_stream_segment(
  p_stream uuid, p_tenant uuid, p_domain uuid, p_run uuid, p_seq int, p_partition_key text,
  p_range_from text, p_range_to text, p_cursor_before jsonb, p_cursor_after jsonb, p_segment_digest text,
  p_evidence_ids jsonb, p_item_count int, p_admitted int, p_noop int, p_quarantined int, p_last boolean,
  p_incomplete jsonb, p_relieved boolean, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE
  s observation.acquisition_streams%ROWTYPE; g observation.acquisition_segments%ROWTYPE; r record;
  v_resolved jsonb := '[]'::jsonb; v_incomplete boolean := p_incomplete IS NOT NULL AND p_incomplete <> 'null'::jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['observation.run.checkpoint']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  s := observation.stream_for_run(p_stream, p_tenant, p_domain, p_run, 'segment.append');

  SELECT * INTO g FROM observation.acquisition_segments WHERE stream_id = p_stream AND seq = p_seq FOR UPDATE;
  IF FOUND THEN
    IF g.segment_digest <> p_segment_digest THEN
      RAISE EXCEPTION 'acquisition stream rejected (digest_conflict): segment % of stream % is held with digest %, not %; a position holds one content',
        p_seq, p_stream, g.segment_digest, p_segment_digest USING ERRCODE = '23505';
    END IF;
    UPDATE observation.acquisition_segments SET delivery_count = delivery_count + 1, last_delivered_at = clock_timestamp()
     WHERE stream_id = p_stream AND seq = p_seq RETURNING * INTO g;
    PERFORM observation.stream_event(s, p_run, 'segment.redelivered', p_seq,
      jsonb_build_object('segment_digest', g.segment_digest, 'delivery_count', g.delivery_count, 'first_run', g.run_id,
        'note', 'at-least-once: the same segment delivered again is recorded and admits nothing twice'),
      p_correlation);
    PERFORM observation.stream_heartbeat(s.source_id, p_run);
    RETURN observation.stream_answer(s) || jsonb_build_object('redelivered', true, 'seq', p_seq, 'delivery_count', g.delivery_count);
  END IF;

  IF s.state NOT IN ('running', 'backpressured') OR s.current_run_id IS DISTINCT FROM p_run THEN
    RAISE EXCEPTION 'acquisition stream rejected (not_running): stream % is % and driven by run %, not run %',
      p_stream, s.state, coalesce(s.current_run_id::text, '<none>'), p_run USING ERRCODE = '23514';
  END IF;
  IF p_seq IS DISTINCT FROM s.next_seq THEN
    RAISE EXCEPTION 'acquisition stream rejected (out_of_order): segment % is not the next segment % of stream %', p_seq, s.next_seq, p_stream USING ERRCODE = '23514';
  END IF;
  IF p_partition_key IS DISTINCT FROM s.partition_key THEN
    RAISE EXCEPTION 'acquisition stream rejected (partition): segment of partition % appended to stream % of partition %', p_partition_key, p_stream, s.partition_key USING ERRCODE = '22023';
  END IF;
  IF p_segment_digest IS NULL OR p_segment_digest !~ '^[0-9a-f]{64}$' OR p_range_from IS NULL OR p_range_to IS NULL
     OR p_cursor_after IS NULL OR jsonb_typeof(p_cursor_after) <> 'object' OR coalesce(p_item_count, -1) < 0 THEN
    RAISE EXCEPTION 'acquisition stream rejected (segment): a segment names its digest, its range, the cursor after it and its item count' USING ERRCODE = '22023';
  END IF;

  INSERT INTO observation.acquisition_segments (
    stream_id, seq, scope, tenant_id, domain_id, source_id, partition_key, range_from, range_to, cursor_before, cursor_after,
    segment_digest, item_count, evidence_ids, admitted, noop, quarantined, incomplete, run_id, correlation_id
  ) VALUES (p_stream, p_seq, 'DOMAIN', s.tenant_id, s.domain_id, s.source_id, p_partition_key, p_range_from, p_range_to,
            coalesce(p_cursor_before, s.cursor), p_cursor_after, p_segment_digest, p_item_count, coalesce(p_evidence_ids, '[]'::jsonb),
            coalesce(p_admitted, 0), coalesce(p_noop, 0), coalesce(p_quarantined, 0), v_incomplete, p_run, p_correlation);
  UPDATE observation.acquisition_streams
     SET cursor = p_cursor_after, high_water = p_range_to, next_seq = next_seq + 1, reached_end = coalesce(p_last, false),
         state = CASE WHEN coalesce(p_relieved, false) THEN 'running' ELSE state END, updated_at = clock_timestamp()
   WHERE stream_id = p_stream RETURNING * INTO s;
  PERFORM observation.stream_event(s, p_run, 'segment.appended', p_seq,
    jsonb_build_object('range_from', p_range_from, 'range_to', p_range_to, 'segment_digest', p_segment_digest, 'items', p_item_count,
      'admitted', coalesce(p_admitted, 0), 'noop', coalesce(p_noop, 0), 'quarantined', coalesce(p_quarantined, 0),
      'cursor_after', p_cursor_after, 'last', coalesce(p_last, false), 'incomplete', v_incomplete),
    p_correlation);
  IF coalesce(p_relieved, false) THEN
    PERFORM observation.stream_event(s, p_run, 'backpressure.relieved', p_seq,
      jsonb_build_object('acknowledged_seq', p_seq, 'credit', s.credit), p_correlation);
  END IF;
  IF v_incomplete THEN
    PERFORM observation.stream_incomplete(s, p_run, p_range_from, p_range_to, p_incomplete ->> 'reason_class', p_incomplete ->> 'detail', p_seq, p_correlation);
  END IF;
  IF coalesce(p_quarantined, 0) > 0 THEN
    PERFORM observation.stream_incomplete(s, p_run, p_range_from, p_range_to, 'quarantined',
      format('%s item(s) of segment %s were quarantined; the range is not collected until they are reviewed', p_quarantined, p_seq), p_seq, p_correlation);
  END IF;
  IF NOT v_incomplete AND coalesce(p_quarantined, 0) = 0 THEN
    FOR r IN SELECT range_id, range_from, range_to FROM observation.acquisition_incomplete_ranges
              WHERE stream_id = p_stream AND resolved_by_seq IS NULL AND reason_class = 'interrupted' AND range_from = p_range_from
              ORDER BY declared_at FOR UPDATE LOOP
      UPDATE observation.acquisition_incomplete_ranges SET resolved_by_seq = p_seq, resolved_at = clock_timestamp() WHERE range_id = r.range_id;
      PERFORM observation.stream_event(s, p_run, 'range.resolved', p_seq,
        jsonb_build_object('range_id', r.range_id, 'range_from', r.range_from, 'range_to', r.range_to, 'resolved_by_seq', p_seq), p_correlation);
      v_resolved := v_resolved || jsonb_build_object('range_id', r.range_id, 'range_from', r.range_from, 'range_to', r.range_to);
    END LOOP;
  END IF;
  PERFORM observation.stream_heartbeat(s.source_id, p_run);
  RETURN observation.stream_answer(s) || jsonb_build_object('redelivered', false, 'seq', p_seq, 'resolved', v_resolved);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION observation.append_stream_segment(uuid,uuid,uuid,uuid,int,text,text,text,jsonb,jsonb,text,jsonb,int,int,int,int,boolean,jsonb,boolean,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.append_stream_segment(uuid,uuid,uuid,uuid,int,text,text,text,jsonb,jsonb,text,jsonb,int,int,int,int,boolean,jsonb,boolean,uuid) TO eye_commit;

/*
 * BACKPRESSURE — the consumer holds `credit` segments delivered and not yet acknowledged, and more remain: the producer is not
 * pulled again until one is acknowledged (append_stream_segment's p_relieved records the relief). The signal heartbeats the
 * lease, and it answers whether an operator has asked for an interrupt.
 */
CREATE OR REPLACE FUNCTION observation.signal_stream_backpressure(
  p_stream uuid, p_tenant uuid, p_domain uuid, p_run uuid, p_details jsonb, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE s observation.acquisition_streams%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['observation.run.checkpoint']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  s := observation.stream_for_run(p_stream, p_tenant, p_domain, p_run, 'stream.backpressure');
  IF s.state <> 'running' OR s.current_run_id IS DISTINCT FROM p_run THEN
    RAISE EXCEPTION 'acquisition stream rejected (not_running): stream % is % and driven by run %, not run %',
      p_stream, s.state, coalesce(s.current_run_id::text, '<none>'), p_run USING ERRCODE = '23514';
  END IF;
  UPDATE observation.acquisition_streams SET state = 'backpressured', updated_at = clock_timestamp() WHERE stream_id = p_stream RETURNING * INTO s;
  PERFORM observation.stream_event(s, p_run, 'backpressured', s.next_seq, coalesce(p_details, '{}'::jsonb) || jsonb_build_object('credit', s.credit), p_correlation);
  PERFORM observation.stream_heartbeat(s.source_id, p_run);
  RETURN observation.stream_answer(s);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION observation.signal_stream_backpressure(uuid,uuid,uuid,uuid,jsonb,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.signal_stream_backpressure(uuid,uuid,uuid,uuid,jsonb,uuid) TO eye_commit;

-- An explicit incomplete range the run declares apart from a segment (e.g. a window it was refused before it could page it).
CREATE OR REPLACE FUNCTION observation.declare_incomplete_range(
  p_stream uuid, p_tenant uuid, p_domain uuid, p_run uuid, p_range_from text, p_range_to text, p_reason_class text, p_detail text, p_correlation uuid
) RETURNS uuid
SECURITY DEFINER SET search_path = observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE s observation.acquisition_streams%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['observation.run.checkpoint']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  s := observation.stream_for_run(p_stream, p_tenant, p_domain, p_run, 'range.incomplete');
  IF s.state NOT IN ('running', 'backpressured') OR s.current_run_id IS DISTINCT FROM p_run THEN
    RAISE EXCEPTION 'acquisition stream rejected (not_running): stream % is % and driven by run %, not run %',
      p_stream, s.state, coalesce(s.current_run_id::text, '<none>'), p_run USING ERRCODE = '23514';
  END IF;
  RETURN observation.stream_incomplete(s, p_run, p_range_from, p_range_to, p_reason_class, p_detail, s.next_seq, p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION observation.declare_incomplete_range(uuid,uuid,uuid,uuid,text,text,text,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.declare_incomplete_range(uuid,uuid,uuid,uuid,text,text,text,text,uuid) TO eye_commit;

/*
 * PAUSE — the run pulled the segments it was asked for (a pull limit) and stops; the stream stays OPEN at its cursor for the
 * next resume. CLOSE — the connector said the partition's range is exhausted: `completed` when the cursor reached the end with
 * no unresolved incomplete range, `closed_incomplete` otherwise (a range closed early declares its remainder `interrupted`).
 * Both ride observation.run.finish, in the transaction that records the run's terminal event.
 */
CREATE OR REPLACE FUNCTION observation.pause_acquisition_stream(
  p_stream uuid, p_tenant uuid, p_domain uuid, p_run uuid, p_details jsonb, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE s observation.acquisition_streams%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['observation.run.finish']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT * INTO s FROM observation.acquisition_streams WHERE stream_id = p_stream AND tenant_id = p_tenant AND domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'acquisition stream rejected: no such stream % in this domain', p_stream USING ERRCODE = '23503';
  END IF;
  IF s.state NOT IN ('running', 'backpressured') OR s.current_run_id IS DISTINCT FROM p_run THEN
    RAISE EXCEPTION 'acquisition stream rejected (not_running): stream % is % and driven by run %, not run %',
      p_stream, s.state, coalesce(s.current_run_id::text, '<none>'), p_run USING ERRCODE = '23514';
  END IF;
  UPDATE observation.acquisition_streams SET state = 'open', current_run_id = NULL, updated_at = clock_timestamp() WHERE stream_id = p_stream RETURNING * INTO s;
  PERFORM observation.stream_event(s, p_run, 'paused', s.next_seq, coalesce(p_details, '{}'::jsonb) || jsonb_build_object('cursor', s.cursor, 'next_seq', s.next_seq), p_correlation);
  RETURN observation.stream_answer(s);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION observation.pause_acquisition_stream(uuid,uuid,uuid,uuid,jsonb,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.pause_acquisition_stream(uuid,uuid,uuid,uuid,jsonb,uuid) TO eye_commit;

CREATE OR REPLACE FUNCTION observation.close_acquisition_stream(
  p_stream uuid, p_tenant uuid, p_domain uuid, p_run uuid, p_details jsonb, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE s observation.acquisition_streams%ROWTYPE; v_unresolved jsonb; v_state text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['observation.run.finish']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT * INTO s FROM observation.acquisition_streams WHERE stream_id = p_stream AND tenant_id = p_tenant AND domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'acquisition stream rejected: no such stream % in this domain', p_stream USING ERRCODE = '23503';
  END IF;
  IF s.state NOT IN ('running', 'backpressured') OR s.current_run_id IS DISTINCT FROM p_run THEN
    RAISE EXCEPTION 'acquisition stream rejected (not_running): stream % is % and driven by run %, not run %',
      p_stream, s.state, coalesce(s.current_run_id::text, '<none>'), p_run USING ERRCODE = '23514';
  END IF;
  IF NOT s.reached_end THEN
    PERFORM observation.stream_incomplete(s, p_run, coalesce(s.high_water, s.range_from), s.range_to, 'interrupted',
      'the stream was closed before its cursor reached the end of the range', s.next_seq, p_correlation);
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('range_id', range_id, 'range_from', range_from, 'range_to', range_to, 'reason_class', reason_class, 'detail', detail)
                  ORDER BY range_from, declared_at), '[]'::jsonb)
    INTO v_unresolved FROM observation.acquisition_incomplete_ranges WHERE stream_id = p_stream AND resolved_by_seq IS NULL;
  v_state := CASE WHEN s.reached_end AND jsonb_array_length(v_unresolved) = 0 THEN 'completed' ELSE 'closed_incomplete' END;
  UPDATE observation.acquisition_streams SET state = v_state, current_run_id = NULL, closed_at = clock_timestamp(), updated_at = clock_timestamp()
   WHERE stream_id = p_stream RETURNING * INTO s;
  PERFORM observation.stream_event(s, p_run, 'closed', s.next_seq,
    coalesce(p_details, '{}'::jsonb) || jsonb_build_object('state', v_state, 'segments', s.next_seq, 'reached_end', s.reached_end, 'unresolved', v_unresolved),
    p_correlation);
  RETURN observation.stream_answer(s) || jsonb_build_object('unresolved', v_unresolved);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION observation.close_acquisition_stream(uuid,uuid,uuid,uuid,jsonb,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.close_acquisition_stream(uuid,uuid,uuid,uuid,jsonb,uuid) TO eye_commit;

/*
 * INTERRUPT. Three callers, told apart by the action the context is bound to:
 *   * THE RUN (observation.run.cancel — an operator's interrupt honoured at a segment boundary; observation.run.finish — a
 *     failure, a budget, the escape path): the stream it drives becomes `interrupted` at its cursor; each segment delivered
 *     but not acknowledged (p_in_flight: [{seq, range_from, range_to}]) is declared an incomplete range of p_range_class
 *     (`interrupted`, or `budget`), resolved when a resumed run redelivers it. Not fenced by the lease (like a terminal run
 *     event: a displaced run must be able to say how it ended) — but only the run that drives the stream changes it; any other
 *     run's call answers `changed: false` and touches nothing.
 *   * AN OPERATOR (observation.stream.interrupt): a RUNNING stream whose run still holds the source records the request
 *     (interrupt.requested) and the run honours it at its next segment boundary; an idle stream (open), or one whose run no
 *     longer holds the source, is interrupted at once. An interrupted or closed stream is refused.
 *   * THE SWEEPER (observation.sweeper.reconcile), for the stream of a run it has just recorded failed (p_run).
 */
CREATE OR REPLACE FUNCTION observation.interrupt_stream(
  p_stream uuid, p_tenant uuid, p_domain uuid, p_run uuid, p_reason_class text, p_reason text,
  p_in_flight jsonb, p_range_class text, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE
  s observation.acquisition_streams%ROWTYPE; v_action text; v_live boolean; f jsonb; v_by text; v_declared jsonb := '[]'::jsonb; v_id uuid;
BEGIN
  v_action := observation.assert_authority(ARRAY['observation.run.cancel', 'observation.run.finish', 'observation.stream.interrupt', 'observation.sweeper.reconcile']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_reason IS NULL OR length(btrim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'acquisition stream rejected (reason): an interrupt records its reason' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO s FROM observation.acquisition_streams WHERE stream_id = p_stream AND tenant_id = p_tenant AND domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'acquisition stream rejected: no such stream % in this domain', p_stream USING ERRCODE = '23503';
  END IF;

  IF v_action = 'observation.stream.interrupt' THEN
    v_by := 'operator';
    IF s.state IN ('completed', 'closed_incomplete', 'interrupted') THEN
      RAISE EXCEPTION 'acquisition stream rejected (not_interruptible): stream % is already %', p_stream, s.state USING ERRCODE = '23514';
    END IF;
    IF s.state IN ('running', 'backpressured') THEN
      SELECT EXISTS (SELECT 1 FROM observation.source_run_leases l WHERE l.source_id = s.source_id AND l.run_id = s.current_run_id
                        AND l.heartbeat_at + make_interval(secs => l.lease_seconds) >= clock_timestamp()) INTO v_live;
      IF v_live THEN
        IF s.interrupt_requested IS NOT NULL THEN
          RAISE EXCEPTION 'acquisition stream rejected (not_interruptible): an interrupt of stream % is already requested', p_stream USING ERRCODE = '23514';
        END IF;
        UPDATE observation.acquisition_streams
           SET interrupt_requested = jsonb_build_object('by', public.eye_principal(), 'at', clock_timestamp(), 'reason', p_reason), updated_at = clock_timestamp()
         WHERE stream_id = p_stream RETURNING * INTO s;
        PERFORM observation.stream_event(s, NULL, 'interrupt.requested', s.next_seq,
          jsonb_build_object('reason', p_reason, 'run', s.current_run_id, 'note', 'honoured by the run at its next segment boundary'), p_correlation);
        RETURN observation.stream_answer(s) || jsonb_build_object('changed', true, 'requested', true);
      END IF;
    END IF;
  ELSIF v_action = 'observation.sweeper.reconcile' THEN
    v_by := 'sweeper';
    IF s.state NOT IN ('running', 'backpressured') OR s.current_run_id IS DISTINCT FROM p_run THEN
      RETURN observation.stream_answer(s) || jsonb_build_object('changed', false, 'reason', 'the stream is not driven by the reconciled run');
    END IF;
  ELSE
    v_by := 'run';
    IF s.state NOT IN ('running', 'backpressured') OR s.current_run_id IS DISTINCT FROM p_run THEN
      RETURN observation.stream_answer(s) || jsonb_build_object('changed', false, 'reason', 'the stream is not driven by this run');
    END IF;
    IF p_in_flight IS NOT NULL AND jsonb_typeof(p_in_flight) = 'array' THEN
      FOR f IN SELECT * FROM jsonb_array_elements(p_in_flight) LOOP
        v_id := observation.stream_incomplete(s, p_run, f ->> 'range_from', f ->> 'range_to', coalesce(p_range_class, 'interrupted'),
          format('segment %s was delivered and not acknowledged when the run stopped (%s); it is redelivered from the cursor on resume', f ->> 'seq', p_reason),
          (f ->> 'seq')::int, p_correlation);
        v_declared := v_declared || jsonb_build_object('range_id', v_id, 'seq', (f ->> 'seq')::int, 'range_from', f ->> 'range_from', 'range_to', f ->> 'range_to');
      END LOOP;
    END IF;
  END IF;

  UPDATE observation.acquisition_streams
     SET state = 'interrupted', current_run_id = NULL, interrupt_requested = NULL, updated_at = clock_timestamp()
   WHERE stream_id = p_stream RETURNING * INTO s;
  PERFORM observation.stream_event(s, p_run, 'interrupted', s.next_seq,
    jsonb_build_object('by', v_by, 'reason_class', coalesce(p_reason_class, v_by), 'reason', p_reason, 'cursor', s.cursor, 'in_flight', v_declared),
    p_correlation);
  RETURN observation.stream_answer(s) || jsonb_build_object('changed', true, 'requested', false, 'in_flight', v_declared);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION observation.interrupt_stream(uuid,uuid,uuid,uuid,text,text,jsonb,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.interrupt_stream(uuid,uuid,uuid,uuid,text,text,jsonb,text,uuid) TO eye_commit;

-- ============================================================
-- §6 THE INTERFACE REGISTER: L1-I02 bound.
-- ============================================================
UPDATE objects.interface_register SET binding_state = 'bound', schema_version = 'v1', bound_at = clock_timestamp(), bound_in = '0084',
  bound_to = 'observation.acquisition — the COMMAND form unchanged (collect now, the scheduled collection job, Connector.acquire() and the lifecycle''s walk: the same ports, events and connector checkpoint) AND, since B23 (0084), the STREAM form: SEGMENT PULL WITH CREDIT-BASED FLOW CONTROL over the connector''s own pages (Connector.acquireStream — the REST connector''s closed-range traversal live, a replay page set declared in the fixture MANIFEST; NOT a WebSocket or SSE transport, no socket held open to a publisher). POST …/observation/sources/:sourceId/streams/open (observation.stream.open) opens a stream under a STABLE PARTITION KEY (''<source_key>:<partition>'') with a CREDIT (the most unacknowledged segments) and a range; the run acts as the agent under the source lease (observation.open_acquisition_stream in the run.start transaction; one live stream per partition, so opening it again RESUMES it); each segment''s items are admitted ONLY through the existing admission (purpose, rights, residency, custody, quarantine, dedup unchanged) and the segment is then ACKNOWLEDGED (observation.append_stream_segment: AT-LEAST-ONCE — the same (stream, seq) with the same digest is an audited redelivery, a different digest is refused); BACKPRESSURE: the connector is not pulled while credit segments are unacknowledged (observation.signal_stream_backpressure, relieved on the next acknowledgement; the lease heartbeat and the run session extended as segments commit); RESUME from the stream''s cursor (POST …/streams/:streamId/resume) after an operator INTERRUPT (POST …/streams/:streamId/interrupt, observation.stream.interrupt — honoured at the next segment boundary of a running stream, immediate for an idle one), a failure, the escape path or the sweeper, admitting no evidence twice; an EXPLICIT INCOMPLETE RANGE (publisher_gap | quarantined | interrupted | budget | refused) for every range the stream passed without collecting, an in-flight segment''s range resolved by its redelivery; the stream closes completed only when its cursor reached the end of the range with no unresolved incomplete range, else closed_incomplete; reads …/streams/list and …/streams/:streamId/get (observation.read.streams). NOT a new collection_run_events vocabulary; the stream does not advance the connector checkpoint; streams are not scheduled'
  WHERE interface_id = 'L1-I02';

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §C (section `context`)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0084 (B23 part `context`) — L3-I02 RetrieveContext BOUND: ONE purpose-bound query returns the policy-filtered memory about a
-- subject with its explanation links, states its revision and its staleness, changes no state, and answers partial or stale only
-- with the declared product state (2026-09-25).
--
-- THE GAP. After 0080 every graph and memory read declared its product state, but the register row stayed partial with its own
-- words: "no single purpose-bound context query". A reader who wanted "what does the institution remember about this corridor, for
-- a sourcing decision" had to list items without content (/memory/list), guess which ones rested on the corridor, retrieve each
-- under a purpose one by one and assemble the reasons by hand — and nothing said which of those answers were partial.
--
-- THE MECHANISM.
-- (§1) memory.context_references(payload, kind, id) — IMMUTABLE: whether a MEM version's own payload names the subject — a cite
--   of that kind and id, the derivation's basis (kind and id), one of the derivation's evidence versions (kind evidence), the
--   related decision or objective (kind strategy). The candidates are found through this and through graph.dependencies MEM rows;
--   the SERVED VERSION must name the subject itself (a later version that dropped the cite is not served for it).
-- (§2) memory.retrieve_context(tenant, domain, purpose, subject, as_of, limit, withdrawn) — LANGUAGE plpgsql STABLE, SECURITY
--   INVOKER: it runs as the caller under every table's forced RLS (nothing widens), and STABLE makes PostgreSQL refuse any
--   INSERT/UPDATE/DELETE in its body ("… is not allowed in a non-volatile function") — the query CANNOT write. It asserts the
--   bound action memory.context.retrieve and the scope, refuses an empty purpose, a malformed subject, a limit outside 1..500 and
--   a partition name outside the six (22023, 'memory context rejected: …'), and answers ONE jsonb:
--     items — the version of each linked item current AT as_of (the current version when as_of is null; for an as-of read the
--       highest version recorded by then, an item withdrawn by then out of circulation — the briefing's B10-F3 rule), from the
--       source the ROUTE decided from the projection state it read FIRST in its transaction (`p_withdrawn`, the B20 idiom:
--       memory.items_current while memory_items_current serves; memory.expected_items — the log, the one derivation — while it is
--       withdrawn, the projection's row joined for `drift` and `projected`); the PURPOSE filter (the version's purpose_scope, or a
--       purpose its audience declares — memory.item.retrieve's rule); each with its explanation_links [{kind, id, version,
--       digest, rationale, via 'dependency' | 'derivation' | 'supersedes' | 'related', …}] from the SERVED VERSION's payload (the
--       cites, the derivation's basis and evidence, the header's supersedes, the related decision/objective) resolved against
--       the canonical versions (claims, evidence, strategy objects, warnings, forecasts, prior memory versions), graph.entities_current
--       and graph.edges_current; a link resting on a WITHDRAWN entities_current / edges_current partition is LEFT OUT and counted
--       per item under withheld_links (the route names it; the link is never served from a partition that cannot vouch for it);
--     unverified_rows — while memory_items_current is withdrawn, the projection rows linked to the subject that the log does not
--       know (the poisoned rows: never served);
--     content_absent_rows — the linked items whose current version (as the metadata tier names it) the content tier does not hold.
--   CLEARANCE and AUDIENCE ROLES stay in TypeScript (the briefing's rule, briefing.service.ts; ONE source of truth for the
--   clearance vocabulary — shared/clearance.ts): an item the reader may not read is dropped there and neither counted nor
--   mentioned (B10's rule), as an item the purpose does not admit is dropped here.
-- (§3) graph.projection_state() re-declared (0080 §3 copied whole): its caller list gains memory.context.retrieve (the route reads
--   the block FIRST in its transaction, the twelve routes' rule). Nothing else changes.
-- (§4) memory.record_access re-declared (0068 §5 copied whole): its authority gains memory.context.retrieve — ONE access row and
--   ONE memory.retrieved ledger event per SERVED item version, written by the route after the STABLE query in the same transaction.
-- (§5) the interface register: L3-I02 bound.
--
-- NO STATE CHANGE (the row's reliability column), stated precisely: the query writes nothing (STABLE). The route's POL and AUD
-- rows, and the item_access rows with their memory.retrieved ledger events, are the GOVERNANCE RECORD OF THE READ (as for the
-- bound L4-I04 and memory.item.retrieve since 0066) — the query changes no projection, no canonical object, no dependency, no
-- partition and no outbox revision. The harness proves it: the revision, a hash of the domain's memory.items_current, the
-- canonical MEM count, graph.projection_partitions and the outbox count are equal before and after; only POL/AUD/access rows grow.
-- CONSISTENCY: the state is read first (READ COMMITTED), so the rows served may be NEWER than the stated revision, never older —
-- the B20 wording; nothing here claims a snapshot.
--
-- THE PRODUCT STATE (decided by the route, from this answer and the block): partial — something the answer depends on was left
-- out and is NAMED in omitted[] (a withdrawn partition's links, unverified or content-absent rows, or the whole item set when the
-- content tier did not answer — 200 partial, never the 503 a single retrieval answers while withdrawn AND down); stale — nothing
-- left out and the condition lagging, unverified or withdrawn (served from the log, labelled); complete — otherwise. partial and
-- stale carry EYE-DEG-001 (the answer's code and the audit result code); complete OK.
--
-- NOT HERE (stated): no new table, no new ledger, no outbox event (a read publishes nothing); no lexical or vector index (the
-- candidates are the subject's own references — one hop, no traversal: the entity's edges' items are not reached unless the item
-- cites the edge); no ranking or relevance (newest version recorded first); no clearance/role logic in SQL; no change to the twelve
-- B20 routes, their ROUTE_PARTITIONS or their labels; no metadata-only item in a context answer (an item is served with its version
-- or not at all — no memory.retrieval_degraded row is written by this route); no register-count assertion (the integrator asserts
-- 50/0/0 once).
--
-- Refusals (observation-errors.ts, the B23 context row): 'memory context rejected: …' — 22023 → 422 (the caller's request). The
-- standing is the PDP's (memory.context.retrieve, an exact rule cloning memory.item.retrieve: 403) and assert_authority's (42501).
--
-- Read-only checks after migrating a fresh database:
--   select provolatile, prosecdef from pg_proc where proname = 'retrieve_context' and pronamespace = 'memory'::regnamespace → s | f
--   select provolatile from pg_proc where proname = 'context_references' and pronamespace = 'memory'::regnamespace         → i
--   select prosrc like '%memory.context.retrieve%' from pg_proc where proname = 'projection_state'                           → t
--   select prosrc like '%memory.context.retrieve%' from pg_proc where proname = 'record_access'                              → t
--   select binding_state, bound_in from objects.interface_register where interface_id = 'L3-I02'                             → bound | 0084

-- ============================================================
-- §1 memory.context_references — whether a MEM version's payload names the subject
-- ============================================================
CREATE OR REPLACE FUNCTION memory.context_references(p_payload jsonb, p_kind text, p_id uuid)
RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_payload -> 'cites') = 'array' THEN p_payload -> 'cites' ELSE '[]'::jsonb END) c
                  WHERE c ->> 'kind' = p_kind AND lower(c ->> 'id') = p_id::text)
      OR (p_payload #>> '{derivation,basis,kind}' = p_kind AND lower(p_payload #>> '{derivation,basis,id}') = p_id::text)
      OR (p_kind = 'evidence' AND EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_payload #> '{derivation,evidence}') = 'array' THEN p_payload #> '{derivation,evidence}' ELSE '[]'::jsonb END) e
                                          WHERE lower(e ->> 'object_id') = p_id::text))
      OR (p_kind = 'strategy' AND (lower(p_payload #>> '{related,decision_id}') = p_id::text OR lower(p_payload #>> '{related,objective_id}') = p_id::text))
$$;
REVOKE ALL ON FUNCTION memory.context_references(jsonb, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION memory.context_references(jsonb, text, uuid) TO eye_app, eye_commit;
COMMENT ON FUNCTION memory.context_references(jsonb, text, uuid) IS 'B23 (0084): whether a MEM version''s own payload names the subject — a cite of that kind and id, the derivation''s basis, one of its evidence versions (kind evidence), the related decision or objective (kind strategy). The context query serves a version only when THIS version names the subject.';

-- ============================================================
-- §2 memory.retrieve_context — THE query (STABLE: it cannot write; SECURITY INVOKER: the caller's RLS)
-- ============================================================
CREATE OR REPLACE FUNCTION memory.retrieve_context(
  p_tenant uuid, p_domain uuid, p_purpose text, p_subject jsonb,
  p_as_of timestamptz DEFAULT NULL, p_limit int DEFAULT 50, p_withdrawn text[] DEFAULT '{}'::text[]
) RETURNS jsonb
LANGUAGE plpgsql STABLE
SET search_path = memory, graph, objects, observation, public, pg_catalog, pg_temp AS $$
DECLARE
  v_kind text; v_id uuid;
  v_mem_w boolean; v_edges_w boolean; v_entities_w boolean;
  v_out jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['memory.context.retrieve']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF coalesce(length(btrim(p_purpose)), 0) = 0 THEN
    RAISE EXCEPTION 'memory context rejected: a purpose is declared (the context is retrieved for an explicit purpose; the envelope''s purpose_id is empty)' USING ERRCODE = '22023';
  END IF;
  IF p_subject IS NULL OR jsonb_typeof(p_subject) <> 'object'
     OR coalesce(p_subject ->> 'kind', '') NOT IN ('entity', 'claim', 'edge', 'strategy', 'evidence', 'warning', 'forecast')
     OR coalesce(p_subject ->> 'id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'memory context rejected: the subject names {kind, id} — kind one of entity, claim, edge, strategy, evidence, warning, forecast; id an object id' USING ERRCODE = '22023';
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 500 THEN
    RAISE EXCEPTION 'memory context rejected: the scan bound is 1..500 (not %)', coalesce(p_limit::text, '<none>') USING ERRCODE = '22023';
  END IF;
  IF p_withdrawn IS NULL OR NOT (p_withdrawn <@ ARRAY['entities_current', 'resolutions_current', 'edges_current', 'strategy_current', 'invalidations_current', 'memory_items_current']::text[]) THEN
    RAISE EXCEPTION 'memory context rejected: the withdrawn partitions are named among the six projections (not %)', coalesce(array_to_string(p_withdrawn, ', '), '<none>') USING ERRCODE = '22023';
  END IF;
  v_kind := p_subject ->> 'kind'; v_id := lower(p_subject ->> 'id')::uuid;
  v_mem_w := 'memory_items_current' = ANY (p_withdrawn);
  v_edges_w := 'edges_current' = ANY (p_withdrawn);
  v_entities_w := 'entities_current' = ANY (p_withdrawn);

  WITH cand AS (
    -- the candidates: the dependency rows on the subject (every state — an as-of read may serve a version whose row was retired since)
    -- and every MEM version whose payload names it; the served version is checked again below
    SELECT d.dependent_object_id AS item_id FROM graph.dependencies d
     WHERE d.tenant_id = p_tenant AND d.domain_id = p_domain AND d.dependent_type = 'MEM' AND d.depends_on_id = v_id
    UNION
    SELECT o.object_id FROM objects.canonical_objects o
     WHERE o.tenant_id = p_tenant AND o.domain_id = p_domain AND o.object_type = 'MEM' AND memory.context_references(o.payload, v_kind, v_id)
  ), exp AS MATERIALIZED (
    SELECT e.item_id, e.state, e.object_version, e.attention_state FROM memory.expected_items(p_tenant, p_domain) e
     WHERE v_mem_w AND e.item_id IN (SELECT item_id FROM cand)
  ), cur AS (
    -- the metadata tier, from the source the route decided: the projection while it serves, the LOG while it is withdrawn
    SELECT i.item_id, i.state, i.object_version, i.attention_state, true AS projected, NULL::jsonb AS drift
      FROM memory.items_current i
     WHERE NOT v_mem_w AND i.tenant_id = p_tenant AND i.domain_id = p_domain AND i.item_id IN (SELECT item_id FROM cand)
    UNION ALL
    SELECT e.item_id, e.state, e.object_version, e.attention_state, (i.item_id IS NOT NULL),
           CASE WHEN i.item_id IS NOT NULL AND (i.state || '@' || i.object_version) <> (e.state || '@' || e.object_version)
                THEN jsonb_build_object('projected', i.state || '@' || i.object_version, 'log', e.state || '@' || e.object_version) END
      FROM exp e LEFT JOIN memory.items_current i ON i.item_id = e.item_id AND i.tenant_id = p_tenant AND i.domain_id = p_domain
  ), served AS (
    -- the version current AT as_of (the current one when as_of is null); an item withdrawn by as_of is out of circulation then
    SELECT DISTINCT ON (o.object_id) o.object_id, o.object_version, o.recorded_at, o.classification, o.purpose_scope, o.truth_state, o.synthetic_state,
           o.valid_from, o.valid_to, o.content_digest, o.supersedes, o.payload,
           c.state AS cur_state, c.object_version AS cur_version, c.attention_state, c.projected, c.drift
      FROM cur c
      JOIN objects.canonical_objects o ON o.object_id = c.item_id AND o.object_type = 'MEM' AND o.tenant_id = p_tenant AND o.domain_id = p_domain
     WHERE (p_as_of IS NULL AND c.state = 'active' AND o.object_version = c.object_version)
        OR (p_as_of IS NOT NULL AND o.recorded_at <= p_as_of
            AND NOT EXISTS (SELECT 1 FROM memory.item_events w WHERE w.item_id = c.item_id AND w.tenant_id = p_tenant AND w.domain_id = p_domain
                                                             AND w.event = 'memory.withdrawn' AND w.occurred_at <= p_as_of))
     ORDER BY o.object_id, o.object_version DESC
  ), admitted AS (
    -- the served version names the subject itself, and admits the purpose (memory.item.retrieve's rule: the purpose it was admitted
    -- for, or one its audience declares)
    SELECT s.* FROM served s
     WHERE memory.context_references(s.payload, v_kind, v_id)
       AND (s.purpose_scope = p_purpose
            OR (jsonb_typeof(s.payload #> '{audience,purposes}') = 'array' AND (s.payload #> '{audience,purposes}') ? p_purpose))
  ), bounded AS (
    SELECT a.*, count(*) OVER () AS admitted_n FROM admitted a ORDER BY a.recorded_at DESC, a.object_id LIMIT p_limit
  ), raw_links AS (
    SELECT b.object_id AS item_id, l.*
      FROM bounded b
     CROSS JOIN LATERAL (
       SELECT c ->> 'kind' AS kind, lower(c ->> 'id') AS id, CASE WHEN (c ->> 'version') ~ '^[0-9]+$' THEN (c ->> 'version')::bigint END AS version,
              NULL::text AS digest, c ->> 'rationale' AS rationale, 'dependency'::text AS via, 1 AS grp, x.ord
         FROM jsonb_array_elements(CASE WHEN jsonb_typeof(b.payload -> 'cites') = 'array' THEN b.payload -> 'cites' ELSE '[]'::jsonb END) WITH ORDINALITY AS x(c, ord)
       UNION ALL
       SELECT b.payload #>> '{derivation,basis,kind}', lower(b.payload #>> '{derivation,basis,id}'),
              CASE WHEN (b.payload #>> '{derivation,basis,version}') ~ '^[0-9]+$' THEN (b.payload #>> '{derivation,basis,version}')::bigint END,
              b.payload #>> '{derivation,basis,content_digest}',
              format('derived from %s %s@%s by %s', b.payload #>> '{derivation,basis,object_type}', b.payload #>> '{derivation,basis,id}', b.payload #>> '{derivation,basis,version}', b.payload #>> '{derivation,method_ref}'),
              'derivation', 2, 0
        WHERE jsonb_typeof(b.payload #> '{derivation,basis}') = 'object'
       UNION ALL
       SELECT 'evidence', lower(e ->> 'object_id'), CASE WHEN (e ->> 'version') ~ '^[0-9]+$' THEN (e ->> 'version')::bigint END, e ->> 'digest',
              'the evidence the basis rests on', 'derivation', 3, y.ord
         FROM jsonb_array_elements(CASE WHEN jsonb_typeof(b.payload #> '{derivation,evidence}') = 'array' THEN b.payload #> '{derivation,evidence}' ELSE '[]'::jsonb END) WITH ORDINALITY AS y(e, ord)
       UNION ALL
       SELECT 'memory', lower(substring(b.supersedes FROM '^MEM:([0-9a-fA-F-]{36})@')), substring(b.supersedes FROM '@([0-9]+)$')::bigint, NULL,
              coalesce(b.payload #>> '{supersession,reason}', 'the version this version supersedes'), 'supersedes', 4, 0
        WHERE b.supersedes ~ '^MEM:[0-9a-fA-F-]{36}@[0-9]+$'
       UNION ALL
       SELECT 'strategy', lower(b.payload #>> '{related,decision_id}'), NULL, NULL, 'the related decision the owner named', 'related', 5, 0
        WHERE coalesce(b.payload #>> '{related,decision_id}', '') ~* '^[0-9a-f-]{36}$'
       UNION ALL
       SELECT 'strategy', lower(b.payload #>> '{related,objective_id}'), NULL, NULL, 'the related objective the owner named', 'related', 6, 0
        WHERE coalesce(b.payload #>> '{related,objective_id}', '') ~* '^[0-9a-f-]{36}$'
     ) l
  ), links AS (
    SELECT r.item_id, r.grp, r.ord,
           (r.kind = 'edge' AND v_edges_w) AS withheld_edge, (r.kind = 'entity' AND v_entities_w) AS withheld_entity,
           jsonb_strip_nulls(jsonb_build_object(
             'kind', r.kind, 'id', r.id, 'via', r.via, 'rationale', r.rationale,
             'version', coalesce(r.version, co.object_version, ed.claim_version),
             'digest', coalesce(r.digest, co.content_digest, ed.evidence_digest),
             'object_type', co.object_type,
             'state', coalesce(en.lifecycle_state, ed.state),
             'label', coalesce(en.canonical_name, ed.predicate, co.title),
             'subject_entity_id', ed.subject_entity_id, 'object_entity_id', ed.object_entity_id,
             'names_subject', r.id = v_id::text)) AS link
      FROM raw_links r
      LEFT JOIN LATERAL (
        SELECT o.object_version, o.content_digest, o.object_type, o.payload ->> 'title' AS title FROM objects.canonical_objects o
         WHERE r.kind NOT IN ('entity', 'edge') AND r.id ~ '^[0-9a-f-]{36}$' AND o.object_id = r.id::uuid AND o.tenant_id = p_tenant
           AND (r.version IS NULL OR o.object_version = r.version)
         ORDER BY o.object_version DESC LIMIT 1) co ON true
      LEFT JOIN graph.entities_current en ON r.kind = 'entity' AND NOT v_entities_w AND r.id ~ '^[0-9a-f-]{36}$' AND en.entity_id = r.id::uuid
      LEFT JOIN graph.edges_current ed ON r.kind = 'edge' AND NOT v_edges_w AND r.id ~ '^[0-9a-f-]{36}$' AND ed.edge_id = r.id::uuid
  ), item_links AS (
    SELECT l.item_id,
           coalesce(jsonb_agg(l.link ORDER BY l.grp, l.ord) FILTER (WHERE NOT l.withheld_edge AND NOT l.withheld_entity), '[]'::jsonb) AS explanation_links,
           count(*) FILTER (WHERE l.withheld_edge) AS withheld_edges, count(*) FILTER (WHERE l.withheld_entity) AS withheld_entities
      FROM links l GROUP BY l.item_id
  )
  SELECT jsonb_build_object(
    'purpose', p_purpose, 'subject', jsonb_build_object('kind', v_kind, 'id', v_id), 'as_of', p_as_of,
    'source', CASE WHEN v_mem_w THEN 'log' ELSE 'projection' END,
    'scan_bound', p_limit,
    'bounded', coalesce((SELECT max(b.admitted_n) FROM bounded b), 0) > p_limit,
    'items', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'item_id', b.object_id, 'version', b.object_version, 'recorded_at', b.recorded_at,
        'title', b.payload ->> 'title', 'statement', b.payload ->> 'statement', 'record_class', b.payload ->> 'record_class',
        'source_kind', b.payload #>> '{source,kind}', 'source_ref', b.payload #>> '{source,ref}',
        'classification', b.classification, 'purpose_scope', b.purpose_scope, 'truth_state', b.truth_state, 'synthetic_state', b.synthetic_state,
        'valid_from', b.valid_from, 'valid_to', b.valid_to, 'content_digest', b.content_digest,
        'audience', jsonb_build_object('roles', CASE WHEN jsonb_typeof(b.payload #> '{audience,roles}') = 'array' THEN b.payload #> '{audience,roles}' ELSE '[]'::jsonb END,
                                       'purposes', CASE WHEN jsonb_typeof(b.payload #> '{audience,purposes}') = 'array' THEN b.payload #> '{audience,purposes}' ELSE '[]'::jsonb END),
        'state', b.cur_state, 'current_version', b.cur_version, 'served_is_current', b.object_version = b.cur_version,
        'attention_state', b.attention_state,
        'basis_state', CASE WHEN jsonb_typeof(b.payload -> 'derivation') = 'object'
                            THEN CASE b.attention_state WHEN 'none' THEN 'current' WHEN 'basis_corrected' THEN 'corrected' WHEN 'basis_withdrawn' THEN 'withdrawn' ELSE b.attention_state END END,
        'index_state', CASE WHEN v_mem_w THEN 'stale' ELSE 'projected' END, 'projected', b.projected, 'drift', b.drift,
        'explanation_links', coalesce(il.explanation_links, '[]'::jsonb),
        'withheld_links', jsonb_build_object('edges_current', coalesce(il.withheld_edges, 0), 'entities_current', coalesce(il.withheld_entities, 0)))
        ORDER BY b.recorded_at DESC, b.object_id)
      FROM bounded b LEFT JOIN item_links il ON il.item_id = b.object_id), '[]'::jsonb),
    -- while the memory partition is withdrawn: the projection rows linked to the subject that the log does not know (never served)
    'unverified_rows', CASE WHEN v_mem_w THEN (SELECT count(*) FROM memory.items_current i
                                                WHERE i.tenant_id = p_tenant AND i.domain_id = p_domain AND i.item_id IN (SELECT item_id FROM cand)
                                                  AND NOT EXISTS (SELECT 1 FROM exp e WHERE e.item_id = i.item_id)) ELSE 0 END,
    -- the linked items whose current version (as the metadata tier names it) the content tier does not hold (a current read only)
    'content_absent_rows', CASE WHEN p_as_of IS NULL THEN (SELECT count(*) FROM cur c
                                                            WHERE c.state = 'active' AND NOT EXISTS (SELECT 1 FROM objects.canonical_objects o
                                                              WHERE o.object_id = c.item_id AND o.object_type = 'MEM' AND o.object_version = c.object_version)) ELSE 0 END
  ) INTO v_out;
  RETURN v_out;
END $$;
REVOKE ALL ON FUNCTION memory.retrieve_context(uuid, uuid, text, jsonb, timestamptz, int, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION memory.retrieve_context(uuid, uuid, text, jsonb, timestamptz, int, text[]) TO eye_commit;
COMMENT ON FUNCTION memory.retrieve_context(uuid, uuid, text, jsonb, timestamptz, int, text[]) IS 'B23 (0084), L3-I02 RetrieveContext: the purpose-filtered memory items whose served version names the subject, each with its explanation links (dependency, derivation, supersedes, related), from the source the route decided from the projection state it read first (p_withdrawn). STABLE (it cannot write) and SECURITY INVOKER (the caller''s RLS). Clearance and audience roles are applied by the route (TypeScript); the access rows are written by the route after this query, in the same transaction.';

-- ============================================================
-- §3 graph.projection_state() — 0080 §3 copied whole; the caller list gains memory.context.retrieve
-- ============================================================
CREATE OR REPLACE FUNCTION graph.projection_state()
RETURNS TABLE (projection text, state text, condition text, revision_seq bigint, verified_seq bigint, verified_at timestamptz, verified_check_id uuid, checkpoint_seq bigint,
               lag_events bigint, unresolved_deliveries bigint, subscription_id uuid, subscription_status text,
               withdrawn_at timestamptz, withdrawn_by uuid, withdrawn_reason text, withdrawn_by_check uuid,
               representation_version text, representation_current text, representation_ok boolean, last_rebuild_id uuid, rebuilt_at timestamptz,
               last_check_id uuid, last_check_at timestamptz, last_check jsonb)
SECURITY DEFINER SET search_path = graph, objects, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_tenant uuid; v_domain uuid; v_sub_id uuid; v_sub_status text; v_cp bigint; v_from bigint; v_cp_event uuid;
        v_open_min bigint; v_vseq bigint; v_vevent uuid; v_vat timestamptz; v_vcheck uuid;
        v_lc_id uuid; v_lc_at timestamptz; v_lc_proj jsonb; v_rev bigint; v_lag bigint := 0; v_unres bigint := 0;
        v_current text := graph.projection_representation_version();
BEGIN
  -- The callers: the twelve read routes (graph.read, memory.item.retrieve), /subscriptions/status and /projections/verify (graph.read),
  -- the briefing composer (briefing.compose); observation.read as graph.rebuild_projections() has admitted since 0063 (the seed scripts'
  -- verify). Nothing else calls it — the retention gate reads the partition table, the two acts answer the port's report.
  -- B23 (0084): the context query (memory.context.retrieve) reads the block FIRST in its transaction, as the twelve routes do.
  PERFORM observation.assert_authority(ARRAY['graph.read', 'observation.read', 'memory.item.retrieve', 'briefing.compose', 'memory.context.retrieve']);
  v_tenant := public.eye_tenant(); v_domain := public.eye_domain();
  IF v_tenant IS NULL OR v_domain IS NULL THEN RETURN; END IF;
  SELECT x.subscription_id, x.status, x.checkpoint_seq, x.served_from_seq, x.checkpoint_event_id INTO v_sub_id, v_sub_status, v_cp, v_from, v_cp_event
    FROM graph.subscriptions x WHERE x.tenant_id = v_tenant AND x.domain_id = v_domain AND x.consumer_kind = 'retrieval' AND x.status <> 'revoked';   -- scalars: NULL when none
  SELECT max(o.partition_seq) INTO v_rev FROM objects.object_outbox o
   WHERE o.tenant_id = v_tenant AND o.domain_id = v_domain AND o.event_type IN ('GraphChanged', 'MemoryCorrected');
  IF v_sub_id IS NOT NULL THEN
    -- THE VERIFIED SEQUENCE IS THE LIVE CONTIGUOUS APPLIED PREFIX (C2). The stored cursor is the dispatcher's: it advances only inside
    -- the finish of the delivery being applied (0064:367-378), so a later delivery applied while an earlier one was open (a rebuilt
    -- event verified while the drift event stands unresolved) is never re-covered when the earlier one is applied on its re-drive.
    -- From the cursor upward, every event of the subscription's kinds with an APPLIED delivery extends the prefix; the first one
    -- without (never received, received, failed, refused, unresolved) bounds it. The cursor itself is the dispatcher's word (a
    -- never-received row below it is B7's reconciliation, not this function's) and is answered beside the prefix as checkpoint_seq.
    -- Cost: the rows above the cursor (the lag) through object_outbox_graph_revision; the prefix through gsd_subscription_applied_seq.
    SELECT min(o.partition_seq) INTO v_open_min FROM objects.object_outbox o
     WHERE o.tenant_id = v_tenant AND o.domain_id = v_domain AND o.event_type IN ('GraphChanged', 'MemoryCorrected')
       AND o.partition_seq >= v_from AND o.partition_seq > coalesce(v_cp, -1)
       AND NOT EXISTS (SELECT 1 FROM graph.subscription_deliveries d WHERE d.event_id = o.id AND d.subscription_id = v_sub_id AND d.state = 'applied');
    SELECT d.partition_seq, d.event_id INTO v_vseq, v_vevent FROM graph.subscription_deliveries d
     WHERE d.subscription_id = v_sub_id AND d.state = 'applied' AND (v_open_min IS NULL OR d.partition_seq < v_open_min)
     ORDER BY d.partition_seq DESC LIMIT 1;
    IF v_vseq IS NULL AND v_cp IS NOT NULL THEN v_vseq := v_cp; v_vevent := v_cp_event; END IF;   -- a cursor with no applied row of its own (0064's backfill of a legacy subscription): the cursor stands
    SELECT count(*) INTO v_lag FROM objects.object_outbox o
     WHERE o.tenant_id = v_tenant AND o.domain_id = v_domain AND o.event_type IN ('GraphChanged', 'MemoryCorrected')
       AND o.partition_seq >= v_from AND (v_vseq IS NULL OR o.partition_seq > v_vseq);
    SELECT count(*) INTO v_unres FROM graph.subscription_deliveries d WHERE d.subscription_id = v_sub_id AND d.state = 'unresolved';
    IF v_vevent IS NOT NULL THEN
      -- the PASSING check of the event that closes the prefix (a re-driven delivery has several checks; the last passing one applied it)
      SELECT c.check_id, c.checked_at INTO v_vcheck, v_vat FROM graph.retrieval_checks c
       WHERE c.subscription_id = v_sub_id AND c.outbox_event_id = v_vevent AND c.mismatched = 0 ORDER BY c.checked_at DESC LIMIT 1;
    END IF;
  END IF;
  SELECT c.check_id, c.checked_at, c.projections INTO v_lc_id, v_lc_at, v_lc_proj FROM graph.retrieval_checks c
   WHERE c.tenant_id = v_tenant AND c.domain_id = v_domain ORDER BY c.checked_at DESC LIMIT 1;
  RETURN QUERY
  SELECT n.projection, coalesce(p.state, 'serving'),
         CASE WHEN coalesce(p.state, 'serving') = 'withdrawn' THEN 'withdrawn'
              WHEN v_sub_id IS NULL OR v_vseq IS NULL THEN 'unverified'      -- C1: no live subscription, or one that has applied no check yet
              WHEN v_lag > 0 THEN 'lagging' ELSE 'current' END,
         v_rev, v_vseq, v_vat, v_vcheck, v_cp, v_lag, v_unres, v_sub_id, v_sub_status,
         p.withdrawn_at, p.withdrawn_by, p.withdrawn_reason, p.withdrawn_by_check,
         coalesce(p.representation_version, v_current), v_current, coalesce(p.representation_version, v_current) = v_current,
         p.last_rebuild_id, p.rebuilt_at,
         v_lc_id, v_lc_at,
         (SELECT x FROM jsonb_array_elements(coalesce(v_lc_proj, '[]'::jsonb)) x WHERE x ->> 'projection' = n.projection LIMIT 1)
    FROM (VALUES (1, 'entities_current'), (2, 'resolutions_current'), (3, 'edges_current'), (4, 'strategy_current'), (5, 'invalidations_current'), (6, 'memory_items_current')) n(pos, projection)
    LEFT JOIN graph.projection_partitions p ON p.tenant_id = v_tenant AND p.domain_id = v_domain AND p.projection = n.projection
   ORDER BY n.pos;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION graph.projection_state() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.projection_state() TO eye_app, eye_commit;

-- ============================================================
-- §4 memory.record_access — 0068 §5 copied whole; the authority gains memory.context.retrieve (one access row per SERVED item version)
-- ============================================================
CREATE OR REPLACE FUNCTION memory.record_access(p_item_id uuid, p_tenant uuid, p_domain uuid, p_version int, p_purpose text, p_reader uuid, p_as_of timestamptz, p_correlation uuid)
RETURNS uuid
SECURITY DEFINER SET search_path = memory, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_id uuid := gen_random_uuid();
BEGIN
  PERFORM observation.assert_authority(ARRAY['memory.item.retrieve', 'briefing.compose', 'memory.context.retrieve']); -- B10: a composition's read of an item is an access under the composer's purpose; B23 (0084): so is each item a context query serves
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF coalesce(length(btrim(p_purpose)), 0) = 0 THEN RAISE EXCEPTION 'memory retrieval rejected: a purpose is declared' USING ERRCODE = '22023'; END IF;
  INSERT INTO memory.item_access (access_id, scope, tenant_id, domain_id, item_id, object_version, reader_principal_id, purpose_id, policy_decision_id, read_as_of, correlation_id)
  VALUES (v_id, 'DOMAIN', p_tenant, p_domain, p_item_id, p_version, p_reader, p_purpose, public.eye_policy_decision(), p_as_of, p_correlation);
  INSERT INTO memory.item_events (event_id, scope, tenant_id, domain_id, item_id, event, object_version, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_item_id, 'memory.retrieved', p_version, p_reader, jsonb_build_object('purpose', p_purpose, 'as_of', p_as_of, 'access_id', v_id), p_correlation);
  RETURN v_id;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION memory.record_access(uuid,uuid,uuid,int,text,uuid,timestamptz,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION memory.record_access(uuid,uuid,uuid,int,text,uuid,timestamptz,uuid) TO eye_commit;

-- ============================================================
-- §5 THE INTERFACE REGISTER: L3-I02 RetrieveContext bound (the two "owed" phrases of the earlier text replaced by what is bound)
-- ============================================================
UPDATE objects.interface_register SET binding_state = 'bound', schema_version = 'v1', bound_at = clock_timestamp(), bound_in = '0084',
  bound_to = 'B23 (0084): POST …/graph/memory/context (memory.context.retrieve — an exact PDP rule with memory.item.retrieve''s eighteen roles, audit_access, a declared purpose, C2) — ONE query for an EXPLICIT purpose (envelope.purpose_id; an empty one refused 22023 → 422) about a SUBJECT {kind entity | claim | edge | strategy | evidence | warning | forecast, id}, optionally AS OF an instant: memory.retrieve_context (STABLE — it cannot write; SECURITY INVOKER — the caller''s RLS) returns the memory items whose SERVED version (the current one, or the one current at as_of; an item withdrawn by then out of circulation) names the subject (a cite, the derivation''s basis or evidence, the related decision/objective) and admits the purpose, each with its EXPLANATION LINKS (via dependency / derivation / supersedes / related — kind, id, version, digest, rationale, the entity''s or edge''s state); the route then applies the reader''s CLEARANCE and the AUDIENCE ROLES (an item withheld by policy is neither counted nor mentioned — the answer says only that policy filtering applied) and records ONE access row and ONE memory.retrieved ledger event per served item version (the governance record of the read, as for the bound L4-I04; the query changes no projection, no canonical object, no dependency, no partition and no outbox revision — the harness proves the revision, the items hash, the MEM count and the partitions unchanged). CONSISTENCY AND STALENESS EXPLICIT: the answer states the revision, verified_seq, lag_events and the condition of its three partitions (memory_items_current, edges_current, entities_current) read FIRST in its transaction — rows may be newer than the stated revision, never older — and a PRODUCT STATE: complete (OK); stale (lagging / unverified / withdrawn with nothing left out — served from the log, labelled; EYE-DEG-001); partial (something left out and NAMED in omitted[{projection, reason, rows}] — explanation links resting on a withdrawn edges_current / entities_current partition, projection rows the log cannot vouch for, versions the content tier does not hold, or the whole item set when the content tier does not answer: 200 partial, never a silent answer and never the 503 of a single retrieval; EYE-DEG-001, the audit result code). NOT bound here: relevance ranking, multi-hop traversal from the subject, a lexical or vector index, metadata-only items in a context answer' ||
  '; earlier: ' || replace(replace(bound_to, '; no single purpose-bound context query', ''), '; the purpose-bound context query stays owed', '')
 WHERE interface_id = 'L3-I02';

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §D (section `revision`)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0084 (B23 part `revision`) — L4-I02 CommitGraphRevision: an ATOMIC, VALIDATED change set of nodes, identifiers and edges, with
-- their ontology reference and their provenance, applied as ONE graph revision of the domain — idempotent acceptance, one
-- authoritative effect, a conflicting expected revision rejected, a retry accepted only under the same idempotency key (2026-09-25).
--
-- THE GAP (the register's own words, 0065:467): "entity, edge and strategy writes are each atomic governed writes; no change-set
-- command". Nothing numbered the domain's graph state, so no write could say which state it was made against; nothing let a caller
-- apply several facts at once or retry one without a second effect.
--
-- THE MECHANISM.
-- (§1) THE DOMAIN'S REVISION HEAD: graph.revision_heads (tenant, domain → head). The head counts COMMITTED GRAPH TRANSACTIONS of the
--   domain: an AFTER INSERT statement-level trigger (transition table) on the six graph LOGS — entity_events, resolution_events,
--   edge_events, strategy_events, invalidation_events, ontology_events — advances it by ONE per transaction whatever the number of
--   statements or rows (INSERT … ON CONFLICT DO UPDATE SET head = head + 1 WHERE last_xact <> pg_current_xact_id()); the domain comes
--   from the inserted rows, several domains in one statement are advanced in (tenant, domain) order. The head row is LOCKED from the
--   transaction's first graph event until it commits: graph writes of one domain are SERIALISED at their first event — a deliberate
--   limit (stated in the register row) and what makes "the domain stands at revision N" a fact a write can check atomically. The
--   head starts at 0 when this migration is applied (it counts transactions from 0084 on, never the history before it).
--   NOT counted: projection_events, the subscription and propagation ledgers, the retrieval checks, the memory tables — none is a
--   graph fact. The outbox partition sequence (graph.projection_state's revision) is untouched and is NOT this head (per TENANT
--   partition, assigned at enqueue after the handler). objects.outbox_partitions is never locked here (the audit → outbox order).
-- (§2) THE REVISION LEDGER: graph.revisions (one row per accepted change set: the idempotency key — scoped PER DOMAIN, unique —,
--   the request digest (sha-256 of the change set's jsonb text), the expected and resulting revision (revision = expected + 1, a
--   CHECK), the ontology version, the counts, the result as answered, the actor) and graph.revision_items (one row per node,
--   identifier and edge applied, with its provenance). Both append-only, FORCE RLS by tenant/domain.
-- (§3) THE PORT graph.commit_revision (graph.revision.commit; the acting principal): the head row locked FOR UPDATE first; the key
--   looked up BEFORE the revision check — the same key with the same digest answers the RECORDED result with repeated: true (even
--   when the head has moved since; nothing is written), the same key with another digest is refused (409); a head other than the
--   expected revision is refused (409, "graph revision rejected (conflict)"); then every item validated and applied IN ORDER —
--   NODES (a new entity: a type the 0024 CHECK records and, when the domain has an active ontology version, one that version
--   declares; a canonical and a normalised name; its provenance an ENT claim version admitted in this domain with its lineage row,
--   not withdrawn, not queued/rejected/corrected in review, its evidence an EVD of this domain under the lineage's digest — the
--   resolver's own provenance: an entity is the identity an ENT mention resolves to, 0024 §2), IDENTIFIERS (graph.attach_identifier's
--   rules: a system registered in this domain, one entity per identifier — another holder refused, the same holder a no-op — the
--   source claim and its evidence from the ENT claim's lineage), EDGES (graph.assert_edge's and retention.record_imported_edge's
--   rules: the predicate declared by the named ontology version with the subject and object types it admits, both ends ACTIVE
--   entities of this domain or nodes of this change set, never the same entity, valid_to after valid_from, a REL claim version
--   admitted with its lineage and its review case approved or not required, the evidence, its digest, the method, the run, the
--   mode and the confidence taken FROM THE LINEAGE — a payload value that differs refused; every still-asserted edge of an EARLIER
--   version of the same claim superseded, as assert_edge does); the rows written with the event details the B20 derivations read
--   (entity.created: entity_type, canonical_name, normalized_name, split_from; edge.asserted: predicate, subject, object, valid_from,
--   valid_to, mode, claim_object_id, claim_version, review_state) so the retrieval check finds them derivable. ANY refusal raises and
--   rolls the whole change set back: nothing applied, the head unchanged. The change set names the domain's ACTIVE ontology version
--   (null only when the domain has none; a version of another state is a conflict: re-read the head and the ontology).
-- (§4) the register row L4-I02 bound.
--
-- NOT HERE (stated): STRATEGY objects (objectives, assumptions, decisions …) are canonical objects with their own versioning and are
-- kept OUT of the change set (graph.strategy.declare stays their write); no retraction, split or resolution inside a change set (each
-- stays its own governed act); no ontology CHANGE (a revision names the active version; graph.ontology.propose/decide change it);
-- no rename or retirement of an existing entity; node names are the caller's (the ENT claim is the provenance, not a name check —
-- the normalised form is the resolver's normaliser, filled by the service); the idempotency key is scoped per DOMAIN, not per tenant;
-- the request digest covers the change set only (not the expected revision); no back-fill of heads (0 at this migration); the
-- GraphChanged/revision.committed event is the route's (one per accepted revision; a repeat publishes nothing); no register-count
-- assertion (the integrator asserts once).

-- ============================================================
-- §1 the revision head
-- ============================================================
CREATE TABLE graph.revision_heads (
  scope      text NOT NULL,
  tenant_id  uuid NOT NULL,
  domain_id  uuid NOT NULL,
  head       bigint NOT NULL DEFAULT 0 CHECK (head >= 0),
  -- the transaction that last advanced the head: a second statement of the same transaction advances nothing
  last_xact  xid8 NOT NULL DEFAULT '0'::xid8,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id, domain_id),
  CONSTRAINT grh_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
COMMENT ON TABLE graph.revision_heads IS 'B23 (0084, L4-I02): the domain''s graph revision — one per committed graph transaction since 0084 (the six graph logs'' statement triggers); locked from a transaction''s first graph event to its commit, so graph writes of one domain are serialised (a deliberate limit).';

-- The trigger's body: every (tenant, domain) the statement's rows name, in order, advanced once per transaction. SECURITY DEFINER (the
-- migrate owner, BYPASSRLS — 0013): a graph write under any context advances its domain's head; the function is no port (no grant).
CREATE OR REPLACE FUNCTION graph.advance_revision_head() RETURNS trigger
SECURITY DEFINER SET search_path = graph, public, pg_catalog, pg_temp AS $$
BEGIN
  INSERT INTO graph.revision_heads AS h (scope, tenant_id, domain_id, head, last_xact, updated_at)
  SELECT 'DOMAIN', n.tenant_id, n.domain_id, 1, pg_current_xact_id(), clock_timestamp()
    FROM (SELECT DISTINCT r.tenant_id, r.domain_id FROM new_rows r) n
   ORDER BY n.tenant_id, n.domain_id
  ON CONFLICT (tenant_id, domain_id) DO UPDATE SET head = h.head + 1, last_xact = EXCLUDED.last_xact, updated_at = EXCLUDED.updated_at
   WHERE h.last_xact <> EXCLUDED.last_xact;
  RETURN NULL;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION graph.advance_revision_head() FROM PUBLIC;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['entity_events', 'resolution_events', 'edge_events', 'strategy_events', 'invalidation_events', 'ontology_events'] LOOP
    EXECUTE format('CREATE TRIGGER revision_head AFTER INSERT ON graph.%I REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION graph.advance_revision_head()', t);
  END LOOP;
END $$;

-- ============================================================
-- §2 the revision ledger
-- ============================================================
CREATE TABLE graph.revisions (
  revision_id         uuid PRIMARY KEY,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  idempotency_key     text NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 200),
  request_digest      text NOT NULL CHECK (request_digest ~ '^[0-9a-f]{64}$'),
  expected_revision   bigint NOT NULL CHECK (expected_revision >= 0),
  revision            bigint NOT NULL,
  ontology_version_id uuid,
  counts              jsonb NOT NULL CHECK (jsonb_typeof(counts) = 'object'),
  result              jsonb NOT NULL CHECK (jsonb_typeof(result) = 'object'),
  committed_by        uuid NOT NULL,
  committed_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id      uuid NOT NULL,
  CONSTRAINT grv_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  -- ONE authoritative effect: a revision moves the head by exactly one.
  CONSTRAINT grv_one_step CHECK (revision = expected_revision + 1),
  -- the idempotency boundary: the key, per DOMAIN
  CONSTRAINT grv_key UNIQUE (tenant_id, domain_id, idempotency_key)
);
CREATE UNIQUE INDEX grv_revision ON graph.revisions (tenant_id, domain_id, revision);
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON graph.revisions FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

CREATE TABLE graph.revision_items (
  revision_id uuid NOT NULL REFERENCES graph.revisions (revision_id),
  ordinal     int NOT NULL CHECK (ordinal >= 1),
  scope       text NOT NULL,
  tenant_id   uuid NOT NULL,
  domain_id   uuid NOT NULL,
  kind        text NOT NULL CHECK (kind IN ('node', 'identifier', 'edge')),
  -- the entity, the identifier or the edge the item wrote (an identifier already attached names the holder's identifier row)
  ref_id      uuid NOT NULL,
  -- the change set's own name for a node (its `ref`), null otherwise
  local_ref   text,
  provenance  jsonb NOT NULL CHECK (jsonb_typeof(provenance) = 'object'),
  PRIMARY KEY (revision_id, ordinal),
  CONSTRAINT gri_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX gri_ref ON graph.revision_items (ref_id);
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON graph.revision_items FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

REVOKE ALL ON graph.revision_heads, graph.revisions, graph.revision_items FROM PUBLIC;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['revision_heads', 'revisions', 'revision_items'] LOOP
    EXECUTE format('ALTER TABLE graph.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE graph.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY graph_isolation ON graph.%I
        USING (
          tenant_id = public.eye_tenant()
          AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain())
        )$f$, t);
    EXECUTE format('GRANT SELECT ON graph.%I TO eye_app, eye_commit', t);
  END LOOP;
END $$;

-- ============================================================
-- §3 the port
-- ============================================================
-- Internal helpers (no grant; called by the definer port as its owner): a uuid read from text (null when it is not one), an instant
-- read from text (null when it does not parse — the port names the field), and the provenance of an item.
CREATE OR REPLACE FUNCTION graph.revision_uuid(p text) RETURNS uuid
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT CASE WHEN p ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN p::uuid END
$$;
REVOKE ALL ON FUNCTION graph.revision_uuid(text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION graph.revision_instant(p text) RETURNS timestamptz
LANGUAGE plpgsql STABLE SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF p IS NULL OR btrim(p) = '' THEN RETURN NULL; END IF;
  RETURN p::timestamptz;
EXCEPTION WHEN others THEN RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION graph.revision_instant(text) FROM PUBLIC;

-- THE PROVENANCE of an item: a claim version of the given type (ENT for a node or an identifier, REL for an edge) admitted in this
-- domain, not withdrawn, with its lineage row, decided in review (approved, or no review required — assert_edge's G2 rule: the case's
-- decision governs, a corrected version is carried by its correction), its evidence an EVD object of this domain under the lineage's
-- digest. Answers the lineage's provenance columns and the review state as the event records it.
CREATE OR REPLACE FUNCTION graph.revision_provenance(p_tenant uuid, p_domain uuid, p_what text, p_prov jsonb, p_type text) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = graph, intelligence, objects, public, pg_catalog, pg_temp AS $$
DECLARE v_claim uuid; v_version bigint; v_found boolean; v_payload_review text; v_case text; v_review text; l intelligence.claim_lineage%ROWTYPE;
BEGIN
  IF p_prov IS NULL OR jsonb_typeof(p_prov) <> 'object' THEN
    RAISE EXCEPTION 'graph revision rejected (provenance): % carries its provenance (provenance.claim_object_id and provenance.claim_version)', p_what USING ERRCODE = '22023';
  END IF;
  v_claim := graph.revision_uuid(p_prov ->> 'claim_object_id');
  IF v_claim IS NULL OR coalesce(p_prov ->> 'claim_version', '') !~ '^[1-9][0-9]{0,17}$' THEN
    RAISE EXCEPTION 'graph revision rejected (provenance): % names the claim version it rests on (provenance.claim_object_id a uuid, provenance.claim_version a positive integer)', p_what USING ERRCODE = '22023';
  END IF;
  v_version := (p_prov ->> 'claim_version')::bigint;
  SELECT true, c.payload -> 'review' ->> 'state' INTO v_found, v_payload_review FROM objects.canonical_objects c
   WHERE c.object_id = v_claim AND c.object_version = v_version AND c.tenant_id = p_tenant AND c.domain_id = p_domain;
  IF v_found IS NULL THEN
    RAISE EXCEPTION 'graph revision rejected (dependency): % rests on claim %@%, which is not admitted in this domain', p_what, v_claim, v_version USING ERRCODE = '23503';
  END IF;
  IF EXISTS (SELECT 1 FROM objects.canonical_objects c WHERE c.object_id = v_claim AND c.object_version >= v_version AND c.tenant_id = p_tenant AND c.domain_id = p_domain
                AND c.lifecycle_state IN ('withdrawn', 'deleted')) THEN
    RAISE EXCEPTION 'graph revision rejected (claim_state): % rests on claim %@%, which is withdrawn; a withdrawn claim is not promoted into the graph', p_what, v_claim, v_version USING ERRCODE = '22023';
  END IF;
  SELECT * INTO l FROM intelligence.claim_lineage x WHERE x.claim_object_id = v_claim AND x.claim_version = v_version AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'graph revision rejected (provenance): % rests on claim %@%, which has no lineage row; a graph fact without its evidence lineage is not admissible', p_what, v_claim, v_version USING ERRCODE = '22023';
  END IF;
  IF l.claim_type <> p_type THEN
    RAISE EXCEPTION 'graph revision rejected (provenance): % rests on claim %@%, an % claim; it rests on an % claim', p_what, v_claim, v_version, l.claim_type, p_type USING ERRCODE = '22023';
  END IF;
  -- G2 (0068 §1): the review CASE decides; the claim's own payload keeps what the extraction wrote.
  SELECT rc.state INTO v_case FROM intelligence.review_current rc WHERE rc.claim_object_id = v_claim AND rc.claim_version = v_version ORDER BY rc.opened_at DESC LIMIT 1;
  IF v_case = 'corrected' THEN
    RAISE EXCEPTION 'graph revision rejected (claim_state): % rests on claim %@%, which was corrected in review to a later version; the corrected version carries it', p_what, v_claim, v_version USING ERRCODE = '22023';
  END IF;
  v_review := CASE WHEN v_case = 'approved' THEN 'approved' WHEN v_case IN ('queued', 'rejected') THEN v_case ELSE coalesce(v_payload_review, 'not_required') END;
  IF v_review IN ('queued', 'rejected') THEN
    RAISE EXCEPTION 'graph revision rejected (claim_state): % rests on claim %@%, which is % for review; a claim a person has not decided is not promoted into the graph', p_what, v_claim, v_version, v_review USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM objects.canonical_objects o WHERE o.object_id = l.evidence_object_id AND o.tenant_id = p_tenant AND o.domain_id = p_domain AND o.object_type = 'EVD'
                    AND o.payload ->> 'content_digest' = l.evidence_digest) THEN
    RAISE EXCEPTION 'graph revision rejected (dependency): % rests on evidence % (the lineage of claim %@%), which is not admitted in this domain under digest %', p_what, l.evidence_object_id, v_claim, v_version, l.evidence_digest USING ERRCODE = '23503';
  END IF;
  RETURN jsonb_build_object('claim_object_id', v_claim, 'claim_version', v_version, 'claim_type', l.claim_type, 'evidence_object_id', l.evidence_object_id, 'evidence_digest', l.evidence_digest,
                            'method_id', l.method_id, 'run_id', l.run_id, 'mode', l.mode, 'confidence', l.confidence, 'review_state', v_review);
END $$;
REVOKE ALL ON FUNCTION graph.revision_provenance(uuid, uuid, text, jsonb, text) FROM PUBLIC;

-- An END of an edge (or the entity of an identifier): {"ref": <a node of this change set>} or {"entity_id": <an ACTIVE entity of this domain>}.
CREATE OR REPLACE FUNCTION graph.revision_end(p_tenant uuid, p_domain uuid, p_what text, p_end jsonb, p_refs jsonb, p_types jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = graph, public, pg_catalog, pg_temp AS $$
DECLARE v_id uuid; v_type text; v_state text;
BEGIN
  IF p_end IS NULL OR jsonb_typeof(p_end) <> 'object' OR ((p_end ? 'ref') = (p_end ? 'entity_id')) THEN
    RAISE EXCEPTION 'graph revision rejected: % names exactly one of ref (a node of this change set) or entity_id (an entity of this domain)', p_what USING ERRCODE = '22023';
  END IF;
  IF p_end ? 'ref' THEN
    IF NOT (p_refs ? (p_end ->> 'ref')) THEN
      RAISE EXCEPTION 'graph revision rejected: % names ref %, which is not a node of this change set', p_what, coalesce(p_end ->> 'ref', '<none>') USING ERRCODE = '22023';
    END IF;
    v_id := (p_refs ->> (p_end ->> 'ref'))::uuid;
    RETURN jsonb_build_object('entity_id', v_id, 'entity_type', p_types ->> v_id::text, 'ref', p_end ->> 'ref');
  END IF;
  v_id := graph.revision_uuid(p_end ->> 'entity_id');
  IF v_id IS NULL THEN RAISE EXCEPTION 'graph revision rejected: % names entity_id %, which is not a uuid', p_what, coalesce(p_end ->> 'entity_id', '<none>') USING ERRCODE = '22023'; END IF;
  SELECT e.entity_type, e.lifecycle_state INTO v_type, v_state FROM graph.entities_current e WHERE e.entity_id = v_id AND e.tenant_id = p_tenant AND e.domain_id = p_domain;
  IF v_type IS NULL THEN
    RAISE EXCEPTION 'graph revision rejected (dependency): % names entity %, which is not an entity of this domain', p_what, v_id USING ERRCODE = '23503';
  END IF;
  IF v_state <> 'active' THEN
    RAISE EXCEPTION 'graph revision rejected (entity_state): % names entity %, which is %; only an active entity gains a fact', p_what, v_id, v_state USING ERRCODE = '22023';
  END IF;
  RETURN jsonb_build_object('entity_id', v_id, 'entity_type', v_type, 'ref', NULL);
END $$;
REVOKE ALL ON FUNCTION graph.revision_end(uuid, uuid, text, jsonb, jsonb, jsonb) FROM PUBLIC;

CREATE OR REPLACE FUNCTION graph.commit_revision(
  p_revision_id uuid, p_tenant uuid, p_domain uuid, p_change_set jsonb, p_expected_revision bigint, p_idempotency_key text, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = graph, intelligence, objects, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE
  v_digest text; v_head bigint; v_xact xid8; v_new bigint; prior graph.revisions%ROWTYPE; v_ont graph.ontology_versions%ROWTYPE; v_ont_id uuid; v_active int;
  v_nodes jsonb; v_idents jsonb; v_edges jsonb; x jsonb; i int; v_what text; v_prov jsonb; v_id uuid; v_ref text; v_type text; v_name text; v_norm text;
  v_refs jsonb := '{}'::jsonb; v_types jsonb := '{}'::jsonb; v_s jsonb; v_o jsonb; v_pred text; v_rule jsonb; v_from timestamptz; v_to timestamptz;
  v_auth boolean; v_holder uuid; v_system text; v_value text; v_ordinal int := 0; v_items jsonb := '[]'::jsonb;
  v_node_ids jsonb := '[]'::jsonb; v_ident_ids jsonb := '[]'::jsonb; v_edge_ids jsonb := '[]'::jsonb; v_superseded jsonb := '[]'::jsonb;
  v_already int := 0; v_now timestamptz := clock_timestamp(); r record; v_counts jsonb; v_result jsonb; v_it jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.revision.commit']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'graph revision rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF p_revision_id IS NULL THEN RAISE EXCEPTION 'graph revision rejected: the revision id is the one the route minted' USING ERRCODE = '22023'; END IF;
  IF p_idempotency_key IS NULL OR length(p_idempotency_key) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'graph revision rejected: the idempotency key is 1 to 200 characters' USING ERRCODE = '22023';
  END IF;
  IF p_expected_revision IS NULL OR p_expected_revision < 0 THEN
    RAISE EXCEPTION 'graph revision rejected: the expected revision is the head the change set was made against (0 or more; POST …/graph/revisions/head reads it)' USING ERRCODE = '22023';
  END IF;
  IF p_change_set IS NULL OR jsonb_typeof(p_change_set) <> 'object' THEN
    RAISE EXCEPTION 'graph revision rejected: the change set is a JSON object {ontology, nodes, identifiers, edges}' USING ERRCODE = '22023';
  END IF;
  -- The request digest: the change set's jsonb text (keys ordered by the type, whitespace normalised) — equal change sets, equal digests.
  v_digest := encode(sha256(convert_to(p_change_set::text, 'UTF8')), 'hex');

  -- THE HEAD, LOCKED FIRST: every graph write of this domain waits here (or at its first event) until this transaction ends.
  INSERT INTO graph.revision_heads (scope, tenant_id, domain_id) VALUES ('DOMAIN', p_tenant, p_domain) ON CONFLICT (tenant_id, domain_id) DO NOTHING;
  SELECT h.head, h.last_xact INTO v_head, v_xact FROM graph.revision_heads h WHERE h.tenant_id = p_tenant AND h.domain_id = p_domain FOR UPDATE;
  IF v_xact = pg_current_xact_id() THEN
    RAISE EXCEPTION 'graph revision rejected: this transaction already wrote graph events; a revision is its transaction''s only graph write' USING ERRCODE = '22023';
  END IF;

  -- THE IDEMPOTENCY BOUNDARY, before the revision check: a retry under the same key answers the first result (even after the head moved).
  SELECT * INTO prior FROM graph.revisions v WHERE v.tenant_id = p_tenant AND v.domain_id = p_domain AND v.idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF prior.request_digest = v_digest THEN
      RETURN prior.result || jsonb_build_object('repeated', true, 'head', v_head);
    END IF;
    RAISE EXCEPTION 'graph revision rejected: idempotency key % was already used for a different change set (revision %, digest %)', p_idempotency_key, prior.revision, prior.request_digest USING ERRCODE = '22023';
  END IF;
  IF v_head <> p_expected_revision THEN
    RAISE EXCEPTION 'graph revision rejected (conflict): the domain stands at revision %, the change set expects %', v_head, p_expected_revision USING ERRCODE = '22023';
  END IF;

  -- THE SHAPE.
  v_nodes := coalesce(p_change_set -> 'nodes', '[]'::jsonb); v_idents := coalesce(p_change_set -> 'identifiers', '[]'::jsonb); v_edges := coalesce(p_change_set -> 'edges', '[]'::jsonb);
  IF jsonb_typeof(v_nodes) <> 'array' OR jsonb_typeof(v_idents) <> 'array' OR jsonb_typeof(v_edges) <> 'array' THEN
    RAISE EXCEPTION 'graph revision rejected: nodes, identifiers and edges are arrays' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(v_nodes) + jsonb_array_length(v_idents) + jsonb_array_length(v_edges) = 0 THEN
    RAISE EXCEPTION 'graph revision rejected: the change set is empty; a revision applies at least one node, identifier or edge' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(v_nodes) > 500 OR jsonb_array_length(v_idents) > 500 OR jsonb_array_length(v_edges) > 500 THEN
    RAISE EXCEPTION 'graph revision rejected: a change set carries at most 500 nodes, 500 identifiers and 500 edges' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_object_keys(p_change_set) k WHERE k NOT IN ('ontology', 'nodes', 'identifiers', 'edges')) THEN
    RAISE EXCEPTION 'graph revision rejected: the change set carries ontology, nodes, identifiers and edges only (strategy objects are declared by graph.strategy.declare)' USING ERRCODE = '22023';
  END IF;

  -- THE ONTOLOGY REFERENCE: the domain's ACTIVE version, named; null only while the domain has none.
  SELECT count(*) INTO v_active FROM graph.ontology_versions v WHERE v.tenant_id = p_tenant AND v.domain_id = p_domain AND v.state = 'active';
  IF (p_change_set -> 'ontology') IS NOT NULL AND jsonb_typeof(p_change_set -> 'ontology') NOT IN ('object', 'null') THEN
    RAISE EXCEPTION 'graph revision rejected (ontology): ontology is {"version_id": <the domain''s active version>}' USING ERRCODE = '22023';
  END IF;
  IF coalesce(p_change_set -> 'ontology' ->> 'version_id', '') = '' THEN
    IF v_active > 0 THEN
      RAISE EXCEPTION 'graph revision rejected (ontology): the domain has an active ontology version; the change set names it (ontology.version_id)' USING ERRCODE = '22023';
    END IF;
  ELSE
    v_ont_id := graph.revision_uuid(p_change_set -> 'ontology' ->> 'version_id');
    IF v_ont_id IS NULL THEN RAISE EXCEPTION 'graph revision rejected (ontology): ontology.version_id is a uuid' USING ERRCODE = '22023'; END IF;
    SELECT * INTO v_ont FROM graph.ontology_versions v WHERE v.version_id = v_ont_id AND v.tenant_id = p_tenant AND v.domain_id = p_domain;
    IF NOT FOUND THEN RAISE EXCEPTION 'graph revision rejected (dependency): ontology version % is not a version of this domain', v_ont_id USING ERRCODE = '23503'; END IF;
    IF v_ont.state <> 'active' THEN
      RAISE EXCEPTION 'graph revision rejected (conflict): ontology version % is %, not the domain''s active version; read the head and the ontology again', v_ont_id, v_ont.state USING ERRCODE = '22023';
    END IF;
  END IF;

  -- NODES — new entities, each with its ENT provenance.
  FOR i IN 1 .. jsonb_array_length(v_nodes) LOOP
    x := v_nodes -> (i - 1);
    v_ref := x ->> 'ref';
    v_what := format('node %s (%s)', i, coalesce(v_ref, '<no ref>'));
    IF jsonb_typeof(x) <> 'object' THEN RAISE EXCEPTION 'graph revision rejected: node % is a JSON object', i USING ERRCODE = '22023'; END IF;
    IF v_ref IS NULL OR length(v_ref) NOT BETWEEN 1 AND 64 THEN RAISE EXCEPTION 'graph revision rejected: % carries a ref of 1 to 64 characters (the change set''s own name for it)', v_what USING ERRCODE = '22023'; END IF;
    IF v_refs ? v_ref THEN RAISE EXCEPTION 'graph revision rejected: % repeats ref %; a ref names one node', v_what, v_ref USING ERRCODE = '22023'; END IF;
    v_type := x ->> 'entity_type'; v_name := x ->> 'canonical_name'; v_norm := x ->> 'normalized_name';
    IF v_type IS NULL OR v_type NOT IN ('organization', 'place', 'asset', 'product', 'vessel', 'route', 'person', 'other') THEN
      RAISE EXCEPTION 'graph revision rejected (ontology): % has entity type %, which is not among the types this installation records', v_what, coalesce(v_type, '<none>') USING ERRCODE = '22023';
    END IF;
    IF v_ont_id IS NOT NULL AND NOT (v_type = ANY (v_ont.entity_types)) THEN
      RAISE EXCEPTION 'graph revision rejected (ontology): % has entity type %, which ontology version % (v%) does not declare (it declares %)', v_what, v_type, v_ont_id, v_ont.version, array_to_string(v_ont.entity_types, ', ') USING ERRCODE = '22023';
    END IF;
    IF coalesce(length(v_name), 0) NOT BETWEEN 1 AND 512 OR coalesce(length(btrim(v_norm)), 0) < 1 THEN
      RAISE EXCEPTION 'graph revision rejected: % carries its canonical name (1 to 512 characters) and its normalised form', v_what USING ERRCODE = '22023';
    END IF;
    v_prov := graph.revision_provenance(p_tenant, p_domain, v_what, x -> 'provenance', 'ENT');
    v_id := gen_random_uuid();
    INSERT INTO graph.entities_current (entity_id, scope, tenant_id, domain_id, entity_type, canonical_name, normalized_name, lifecycle_state, created_by, correlation_id)
    VALUES (v_id, 'DOMAIN', p_tenant, p_domain, v_type, v_name, v_norm, 'active', p_actor, p_correlation);
    INSERT INTO graph.entity_events (event_id, scope, tenant_id, domain_id, entity_id, event, actor_principal_id, details, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, v_id, 'entity.created', p_actor,
            jsonb_build_object('entity_type', v_type, 'canonical_name', v_name, 'normalized_name', v_norm, 'split_from', NULL, 'revision_id', p_revision_id, 'ref', v_ref,
                               'claim_object_id', v_prov -> 'claim_object_id', 'claim_version', v_prov -> 'claim_version', 'evidence_object_id', v_prov -> 'evidence_object_id'), p_correlation);
    v_refs := v_refs || jsonb_build_object(v_ref, v_id); v_types := v_types || jsonb_build_object(v_id::text, v_type);
    v_node_ids := v_node_ids || jsonb_build_object('ordinal', i, 'ref', v_ref, 'entity_id', v_id, 'entity_type', v_type, 'canonical_name', v_name, 'claim_object_id', v_prov -> 'claim_object_id', 'claim_version', v_prov -> 'claim_version');
    v_ordinal := v_ordinal + 1;
    v_items := v_items || jsonb_build_object('ordinal', v_ordinal, 'kind', 'node', 'ref_id', v_id, 'local_ref', v_ref, 'provenance', v_prov);
  END LOOP;

  -- IDENTIFIERS — graph.attach_identifier's rules; the source claim and its evidence from the ENT claim's lineage.
  FOR i IN 1 .. jsonb_array_length(v_idents) LOOP
    x := v_idents -> (i - 1);
    v_what := format('identifier %s', i);
    IF jsonb_typeof(x) <> 'object' THEN RAISE EXCEPTION 'graph revision rejected: identifier % is a JSON object', i USING ERRCODE = '22023'; END IF;
    v_s := graph.revision_end(p_tenant, p_domain, v_what, x -> 'entity', v_refs, v_types);
    v_system := x ->> 'system_key'; v_value := x ->> 'value';
    IF v_system IS NULL OR v_system !~ '^[a-z0-9][a-z0-9_.:-]{1,63}$' THEN RAISE EXCEPTION 'graph revision rejected: % carries a system_key (2 to 64 characters of a-z, 0-9, _ . : and -)', v_what USING ERRCODE = '22023'; END IF;
    IF coalesce(length(v_value), 0) NOT BETWEEN 1 AND 256 THEN RAISE EXCEPTION 'graph revision rejected: % carries a value of 1 to 256 characters', v_what USING ERRCODE = '22023'; END IF;
    SELECT s.is_authoritative INTO v_auth FROM graph.identifier_systems s WHERE s.tenant_id = p_tenant AND s.domain_id = p_domain AND s.system_key = v_system;
    IF v_auth IS NULL THEN RAISE EXCEPTION 'graph revision rejected (dependency): % names identifier system %, which is not registered in this domain', v_what, v_system USING ERRCODE = '23503'; END IF;
    v_prov := graph.revision_provenance(p_tenant, p_domain, v_what, x -> 'provenance', 'ENT');
    v_holder := NULL;
    SELECT d.entity_id INTO v_holder FROM graph.entity_identifiers d WHERE d.tenant_id = p_tenant AND d.domain_id = p_domain AND d.system_key = v_system AND d.identifier_value = v_value;
    IF v_holder IS NOT NULL AND v_holder <> (v_s ->> 'entity_id')::uuid THEN
      RAISE EXCEPTION 'graph revision rejected (identifier): % — % % already identifies a different entity (%); an authoritative identifier names one thing', v_what, v_system, v_value, v_holder USING ERRCODE = '23505';
    END IF;
    IF v_holder IS NOT NULL THEN
      -- already attached to this very entity: nothing to write (graph.attach_identifier's no-op), said in the answer
      v_already := v_already + 1;
      v_ident_ids := v_ident_ids || jsonb_build_object('ordinal', i, 'entity_id', v_holder, 'system_key', v_system, 'value', v_value, 'state', 'already');
      CONTINUE;
    END IF;
    v_id := gen_random_uuid();
    INSERT INTO graph.entity_identifiers (identifier_id, scope, tenant_id, domain_id, entity_id, system_key, identifier_value, source_claim_object_id, source_evidence_object_id, recorded_by, correlation_id)
    VALUES (v_id, 'DOMAIN', p_tenant, p_domain, (v_s ->> 'entity_id')::uuid, v_system, v_value, (v_prov ->> 'claim_object_id')::uuid, (v_prov ->> 'evidence_object_id')::uuid, p_actor, p_correlation);
    INSERT INTO graph.entity_events (event_id, scope, tenant_id, domain_id, entity_id, event, actor_principal_id, details, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, (v_s ->> 'entity_id')::uuid, 'entity.identified', p_actor,
            jsonb_build_object('system_key', v_system, 'value', v_value, 'is_authoritative', v_auth, 'claim_object_id', v_prov -> 'claim_object_id', 'revision_id', p_revision_id), p_correlation);
    v_ident_ids := v_ident_ids || jsonb_build_object('ordinal', i, 'identifier_id', v_id, 'entity_id', v_s -> 'entity_id', 'system_key', v_system, 'value', v_value, 'state', 'identified');
    v_ordinal := v_ordinal + 1;
    v_items := v_items || jsonb_build_object('ordinal', v_ordinal, 'kind', 'identifier', 'ref_id', v_id, 'local_ref', v_s ->> 'ref', 'provenance', v_prov);
  END LOOP;

  -- EDGES — assert_edge's and record_imported_edge's rules; the provenance columns from the REL claim's lineage.
  FOR i IN 1 .. jsonb_array_length(v_edges) LOOP
    x := v_edges -> (i - 1);
    v_what := format('edge %s', i);
    IF jsonb_typeof(x) <> 'object' THEN RAISE EXCEPTION 'graph revision rejected: edge % is a JSON object', i USING ERRCODE = '22023'; END IF;
    v_pred := x ->> 'predicate';
    IF v_pred IS NULL OR length(v_pred) NOT BETWEEN 2 AND 128 THEN RAISE EXCEPTION 'graph revision rejected: % carries a predicate of 2 to 128 characters', v_what USING ERRCODE = '22023'; END IF;
    v_s := graph.revision_end(p_tenant, p_domain, v_what || ' subject', x -> 'subject', v_refs, v_types);
    v_o := graph.revision_end(p_tenant, p_domain, v_what || ' object', x -> 'object', v_refs, v_types);
    IF (v_s ->> 'entity_id') = (v_o ->> 'entity_id') THEN RAISE EXCEPTION 'graph revision rejected: % relates entity % to itself; a self-edge is not a relationship', v_what, v_s ->> 'entity_id' USING ERRCODE = '22023'; END IF;
    IF v_ont_id IS NOT NULL THEN
      SELECT pr INTO v_rule FROM jsonb_array_elements(v_ont.predicates) pr WHERE pr ->> 'predicate' = v_pred LIMIT 1;
      IF v_rule IS NULL THEN
        RAISE EXCEPTION 'graph revision rejected (ontology): % has predicate %, which ontology version % (v%) does not declare', v_what, v_pred, v_ont_id, v_ont.version USING ERRCODE = '22023';
      END IF;
      IF jsonb_typeof(v_rule -> 'subject_types') = 'array' AND NOT ((v_rule -> 'subject_types') ? (v_s ->> 'entity_type')) THEN
        RAISE EXCEPTION 'graph revision rejected (ontology): % — predicate % does not admit a % subject (it admits %)', v_what, v_pred, v_s ->> 'entity_type', v_rule -> 'subject_types' USING ERRCODE = '22023';
      END IF;
      IF jsonb_typeof(v_rule -> 'object_types') = 'array' AND NOT ((v_rule -> 'object_types') ? (v_o ->> 'entity_type')) THEN
        RAISE EXCEPTION 'graph revision rejected (ontology): % — predicate % does not admit a % object (it admits %)', v_what, v_pred, v_o ->> 'entity_type', v_rule -> 'object_types' USING ERRCODE = '22023';
      END IF;
      v_rule := NULL;
    END IF;
    v_from := graph.revision_instant(x ->> 'valid_from');
    IF v_from IS NULL THEN RAISE EXCEPTION 'graph revision rejected: % carries valid_from, the instant the relationship began to hold (ISO-8601)', v_what USING ERRCODE = '22023'; END IF;
    v_to := NULL;
    IF coalesce(x ->> 'valid_to', '') <> '' THEN
      v_to := graph.revision_instant(x ->> 'valid_to');
      IF v_to IS NULL OR v_to <= v_from THEN RAISE EXCEPTION 'graph revision rejected: % carries a valid_to after its valid_from when it has one', v_what USING ERRCODE = '22023'; END IF;
    END IF;
    v_prov := graph.revision_provenance(p_tenant, p_domain, v_what, x -> 'provenance', 'REL');
    -- The evidence and its digest are the LINEAGE's: a caller that names them must name the same ones.
    IF coalesce(x -> 'provenance' ->> 'evidence_object_id', '') <> '' AND graph.revision_uuid(x -> 'provenance' ->> 'evidence_object_id') IS DISTINCT FROM (v_prov ->> 'evidence_object_id')::uuid THEN
      RAISE EXCEPTION 'graph revision rejected (provenance): % names evidence %, but claim %@% rests on evidence % (its lineage); the evidence is the lineage''s', v_what, x -> 'provenance' ->> 'evidence_object_id', v_prov ->> 'claim_object_id', v_prov ->> 'claim_version', v_prov ->> 'evidence_object_id' USING ERRCODE = '22023';
    END IF;
    IF coalesce(x -> 'provenance' ->> 'evidence_digest', '') <> '' AND (x -> 'provenance' ->> 'evidence_digest') <> (v_prov ->> 'evidence_digest') THEN
      RAISE EXCEPTION 'graph revision rejected (provenance): % names evidence digest %, but the lineage of claim %@% records %; the digest is the lineage''s', v_what, x -> 'provenance' ->> 'evidence_digest', v_prov ->> 'claim_object_id', v_prov ->> 'claim_version', v_prov ->> 'evidence_digest' USING ERRCODE = '22023';
    END IF;
    v_id := gen_random_uuid();
    INSERT INTO graph.edges_current (edge_id, scope, tenant_id, domain_id, subject_entity_id, predicate, object_entity_id, valid_from, valid_to, state, claim_object_id, claim_version,
                                     evidence_object_id, evidence_digest, method_id, run_id, mode, confidence, asserted_by, correlation_id)
    VALUES (v_id, 'DOMAIN', p_tenant, p_domain, (v_s ->> 'entity_id')::uuid, v_pred, (v_o ->> 'entity_id')::uuid, v_from, v_to, 'asserted', (v_prov ->> 'claim_object_id')::uuid, (v_prov ->> 'claim_version')::bigint,
            (v_prov ->> 'evidence_object_id')::uuid, v_prov ->> 'evidence_digest', (v_prov ->> 'method_id')::uuid, (v_prov ->> 'run_id')::uuid, v_prov ->> 'mode', (v_prov ->> 'confidence')::numeric, p_actor, p_correlation);
    -- The details the B20 derivation reads (graph.expected_edges, 0080 §2) — assert_edge's vocabulary, the revision named beside it.
    INSERT INTO graph.edge_events (event_id, scope, tenant_id, domain_id, edge_id, event, actor_principal_id, details, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, v_id, 'edge.asserted', p_actor,
            jsonb_build_object('predicate', v_pred, 'subject', (v_s ->> 'entity_id')::uuid, 'object', (v_o ->> 'entity_id')::uuid, 'valid_from', v_from, 'valid_to', v_to,
                               'mode', v_prov ->> 'mode', 'claim_object_id', (v_prov ->> 'claim_object_id')::uuid, 'claim_version', (v_prov ->> 'claim_version')::bigint,
                               'review_state', v_prov ->> 'review_state', 'revision_id', p_revision_id), p_correlation);
    v_edge_ids := v_edge_ids || jsonb_build_object('ordinal', i, 'edge_id', v_id, 'predicate', v_pred, 'subject_entity_id', v_s -> 'entity_id', 'object_entity_id', v_o -> 'entity_id',
                                                   'subject_ref', v_s -> 'ref', 'object_ref', v_o -> 'ref', 'valid_from', v_from, 'valid_to', v_to,
                                                   'claim_object_id', v_prov -> 'claim_object_id', 'claim_version', v_prov -> 'claim_version', 'evidence_object_id', v_prov -> 'evidence_object_id');
    v_ordinal := v_ordinal + 1;
    v_items := v_items || jsonb_build_object('ordinal', v_ordinal, 'kind', 'edge', 'ref_id', v_id, 'local_ref', NULL, 'provenance', v_prov);
    -- Every still-asserted edge of an EARLIER version of the same claim is obsolete (assert_edge, 0068 §1): each superseded with its own event.
    FOR r IN SELECT e.edge_id FROM graph.edges_current e
              WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain AND e.claim_object_id = (v_prov ->> 'claim_object_id')::uuid
                AND e.claim_version < (v_prov ->> 'claim_version')::bigint AND e.state = 'asserted'
              ORDER BY e.edge_id FOR UPDATE LOOP
      UPDATE graph.edges_current SET state = 'superseded', superseded_by = v_id, superseded_at = v_now WHERE edge_id = r.edge_id;
      INSERT INTO graph.edge_events (event_id, scope, tenant_id, domain_id, edge_id, event, actor_principal_id, details, correlation_id)
      VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, r.edge_id, 'edge.superseded', p_actor,
              jsonb_build_object('superseded_by', v_id, 'claim_object_id', (v_prov ->> 'claim_object_id')::uuid, 'corrected_to_version', (v_prov ->> 'claim_version')::bigint,
                                 'reason', 'the claim this edge rests on was corrected', 'revision_id', p_revision_id), p_correlation);
      v_superseded := v_superseded || jsonb_build_object('edge_id', r.edge_id, 'superseded_by', v_id, 'claim_object_id', v_prov -> 'claim_object_id');
    END LOOP;
  END LOOP;

  -- ONE STEP: the head advanced exactly once by this transaction's events (the statement triggers, §1).
  SELECT h.head INTO v_new FROM graph.revision_heads h WHERE h.tenant_id = p_tenant AND h.domain_id = p_domain;
  IF v_new = v_head THEN
    RAISE EXCEPTION 'graph revision rejected: the change set changes nothing — every identifier it names is already attached to its entity' USING ERRCODE = '22023';
  END IF;
  IF v_new <> v_head + 1 THEN
    RAISE EXCEPTION 'graph revision failed: the head moved from % to % inside one transaction', v_head, v_new USING ERRCODE = 'XX000';
  END IF;

  v_counts := jsonb_build_object('nodes', jsonb_array_length(v_node_ids), 'identifiers', jsonb_array_length(v_ident_ids) - v_already, 'identifiers_already', v_already,
                                 'edges', jsonb_array_length(v_edge_ids), 'superseded', jsonb_array_length(v_superseded));
  v_result := jsonb_build_object('revision_id', p_revision_id, 'revision', v_new, 'expected', p_expected_revision, 'idempotency_key', p_idempotency_key, 'request_digest', v_digest,
                                 'ontology_version_id', v_ont_id, 'counts', v_counts, 'node_ids', v_node_ids, 'identifier_ids', v_ident_ids, 'edge_ids', v_edge_ids,
                                 'superseded_edges', v_superseded, 'committed_at', v_now, 'committed_by', p_actor, 'repeated', false);
  INSERT INTO graph.revisions (revision_id, scope, tenant_id, domain_id, idempotency_key, request_digest, expected_revision, revision, ontology_version_id, counts, result, committed_by, committed_at, correlation_id)
  VALUES (p_revision_id, 'DOMAIN', p_tenant, p_domain, p_idempotency_key, v_digest, p_expected_revision, v_new, v_ont_id, v_counts, v_result, p_actor, v_now, p_correlation);
  FOR v_it IN SELECT * FROM jsonb_array_elements(v_items) LOOP
    INSERT INTO graph.revision_items (revision_id, ordinal, scope, tenant_id, domain_id, kind, ref_id, local_ref, provenance)
    VALUES (p_revision_id, (v_it ->> 'ordinal')::int, 'DOMAIN', p_tenant, p_domain, v_it ->> 'kind', (v_it ->> 'ref_id')::uuid, v_it ->> 'local_ref', v_it -> 'provenance');
  END LOOP;
  RETURN v_result;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION graph.commit_revision(uuid,uuid,uuid,jsonb,bigint,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.commit_revision(uuid,uuid,uuid,jsonb,bigint,text,uuid,uuid) TO eye_commit;

-- ============================================================
-- §4 the register
-- ============================================================
UPDATE objects.interface_register SET binding_state = 'bound', schema_version = 'v1', bound_at = clock_timestamp(), bound_in = '0084',
  bound_to = 'CommitGraphRevision from POST …/graph/revisions (graph.revision.commit: platform_admin, domain_admin, knowledge_owner, resolution_manager → graph.commit_revision): ONE atomic, validated change set — NODES (new entities: a type the installation records and the named ontology version declares, the canonical and normalised name, provenance an ENT claim version admitted with its lineage, decided in review, its evidence an EVD of the domain under the lineage''s digest), IDENTIFIERS (graph.attach_identifier''s rules: a registered system, one entity per identifier), EDGES (the predicate and the subject/object types the named ontology version admits, both ends active entities of the domain or nodes of the change set, never a self-edge, valid_to after valid_from, a REL claim version admitted with its lineage and approved or not requiring review, the evidence, digest, method, run, mode and confidence taken FROM the lineage — a differing payload value refused; earlier claim versions'' edges superseded as graph.assert_edge does) — applied with the event details the B20 derivations read; ANY refusal rolls the whole set back (nothing applied, the head unchanged). The domain''s REVISION is graph.revision_heads: one step per committed graph transaction (statement triggers on the six graph logs), locked from a transaction''s first graph event to its commit — graph writes of one domain are serialised (a deliberate limit); the change set names the EXPECTED revision and the domain''s active ontology version; a different head is refused (409 conflict); POST …/graph/revisions/head (graph.read) reads it. IDEMPOTENT: graph.revisions keeps the key (scoped per domain), the change set''s sha-256 and the result — the same key and digest answer the first result with repeated: true (nothing written, no event), the same key with another change set is refused (409); one authoritative effect (revision = expected + 1). GraphChanged/revision.committed (one per accepted revision, built without reads: the created identities, the asserted and superseded edges, the claims and evidence, walked: false). NOT: strategy objects (graph.strategy.declare), retractions, splits, resolutions, ontology changes and entity renames stay their own governed acts; the head counts transactions from 0084 (no back-fill)'
  WHERE interface_id = 'L4-I02';

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §E (section `branch`)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- ============================================================================================================================
-- 0084 · B23 part `branch` — L7-I02 BranchScenario: a VERSIONED branch added to a declared scenario (2026-09-25).
--
-- THE GAP (the register's own words, 0065:482): "branches declared with the scenario (the eight-kind vocabulary, 0058); no
-- add-branch command after declaration". A scenario's canonical object stood at SCN v1 for ever; prediction.add_branch had no
-- idempotency and no version check and was reachable only from the declaring write.
--
-- THE MECHANISM.
-- (§1) THE VERSION ON THE ROWS. prediction.scenarios_current.current_version (the SCN canonical version the tree stands at;
--   backfilled from max(object_version) of the scenario's SCN objects) and prediction.branches_current.added_in_version (the
--   version that added the branch; every branch before 0084 was declared with its scenario — version 1). The REQUEST LEDGER
--   prediction.scenario_branch_requests: one row per accepted branching, idempotent on (tenant, domain, requester, key) with the
--   request's content digest (the executive.requests idiom, 0066 §9) — base_version, result_version and the branch it added.
--   Append-only (raise_append_only), ENABLE + FORCE RLS (the 0081 prediction_isolation idiom), SELECT to eye_app, eye_commit.
--   scenario_events gains `scenario.branched` and `scenario.branch_repeated`; the coherence ledger's trigger gains `branch`.
-- (§2) prediction.add_branch — 0061 §1's body VERBATIM but for its authority list: the branching action adds its branch through it.
-- (§3) prediction.check_scenario_coherence — 0081 §6's body VERBATIM but for the action (prediction.scenario.branch) and the
--   trigger (`branch`): the branching write re-checks the NEW version (the check reads max(SCN version), admitted in the write).
-- (§4) THE PORT prediction.branch_scenario — the ONE authoritative effect: the caller's standing and scope, the actor = the acting
--   principal; the key row locked (the same digest answers the recorded result and logs scenario.branch_repeated — no second
--   effect; a different digest is refused `branch rejected (idempotency_conflict)`); the scenario locked (absent 23503; not active
--   22023); the STALE check (current_version <> expected → `branch rejected (stale_version)`); the KIND (exactly the four the
--   contract names — upside, downside, disruption, user-defined — baseline and every other kind refused); the CONFLICTS
--   (`branch rejected (duplicate)`: a live branch of the same name, a user-defined branch of the same label, or a live branch the
--   coherence rule's duplicate_branch would pair with it — refused, never admitted as a failing branch); the SCN version
--   expected+1 admitted IN THIS WRITE (the header's audit correlation is the operation's, 0019 §4) and naming the branch; then
--   add_branch, added_in_version, current_version = expected+1, the request row and scenario.branched.
-- (§5) simulation.open_run — 0081 §9's body VERBATIM but for one block: a branch added in a LATER version than the one the run's
--   record cut-off binds is refused `run rejected (branch_added_later)` (membership was read from the current rows).
-- (§6) The canonical-write action prediction.scenario.branch admits an SCN object and nothing else (the 0029 idiom).
-- (§7) The register row L7-I02 bound.
--
-- NOT HERE (stated): no branch REMOVAL or EDIT command (a branch leaves the portfolio by review — retire — as before); no branch
-- of kind baseline, stress, adversarial or counterfactual by this command (the contract names four; the declaration still takes
-- all eight); no subscriber for ScenarioBranched@v1 (it is NOT subscribable — not in graph.subscribable_event_types); the SCN
-- payload schema is unchanged (SCN@v3: the new version's payload is the previous branches plus the new one); a concurrent writer
-- that admits the same next version first makes the loser's admission fail on the canonical key (23505), which the service
-- answers as stale_version — the key is not recorded, so a retry under the same key after a reload is a new request; the
-- register counts are asserted once by the integrator.
-- ============================================================================================================================

-- ============================================================
-- §1 the version on the rows, the request ledger, the two vocabularies
-- ============================================================
ALTER TABLE prediction.scenarios_current ADD COLUMN current_version int NOT NULL DEFAULT 1 CHECK (current_version >= 1);
COMMENT ON COLUMN prediction.scenarios_current.current_version IS
  'B23 (0084, L7-I02): the SCN canonical version the tree stands at — 1 at declaration, one more per accepted BranchScenario (prediction.branch_scenario). Readers that need the version AS OF an instant keep prediction.scenario_version_as_of.';
UPDATE prediction.scenarios_current s SET current_version = x.v
  FROM (SELECT o.object_id, max(o.object_version)::int AS v FROM objects.canonical_objects o WHERE o.object_type = 'SCN' GROUP BY o.object_id) x
 WHERE x.object_id = s.scenario_id AND x.v > 1;
ALTER TABLE prediction.branches_current ADD COLUMN added_in_version int NOT NULL DEFAULT 1 CHECK (added_in_version >= 1);
COMMENT ON COLUMN prediction.branches_current.added_in_version IS
  'B23 (0084, L7-I02): the SCN version that added this branch — 1 for a branch declared with its scenario; a BranchScenario sets the version it admitted. simulation.open_run refuses a branch added after the version its run binds.';

CREATE TABLE prediction.scenario_branch_requests (
  request_id              uuid PRIMARY KEY,
  scope                   text NOT NULL,
  tenant_id               uuid NOT NULL,
  domain_id               uuid NOT NULL,
  scenario_id             uuid NOT NULL REFERENCES prediction.scenarios_current (scenario_id),
  requester_principal_id  uuid NOT NULL,
  idempotency_key         text NOT NULL CHECK (length(btrim(idempotency_key)) BETWEEN 1 AND 200),
  request_digest          text NOT NULL CHECK (request_digest ~ '^[0-9a-f]{64}$'),
  base_version            int NOT NULL CHECK (base_version >= 1),
  result_version          int NOT NULL,
  branch_id               uuid NOT NULL REFERENCES prediction.branches_current (branch_id),
  requested_at            timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id          uuid NOT NULL,
  CONSTRAINT sbr_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT sbr_next_version CHECK (result_version = base_version + 1),
  CONSTRAINT sbr_key_once UNIQUE (tenant_id, domain_id, requester_principal_id, idempotency_key)
);
CREATE INDEX sbr_scenario ON prediction.scenario_branch_requests (scenario_id, requested_at);
COMMENT ON TABLE prediction.scenario_branch_requests IS 'L7-I02 BranchScenario (0084): one row per ACCEPTED branching — idempotent on (requester, idempotency_key) under the request digest; the version it read and the version it made; append-only.';
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON prediction.scenario_branch_requests
  FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
REVOKE ALL ON prediction.scenario_branch_requests FROM PUBLIC;
ALTER TABLE prediction.scenario_branch_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE prediction.scenario_branch_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY prediction_isolation ON prediction.scenario_branch_requests USING (tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain()));
GRANT SELECT ON prediction.scenario_branch_requests TO eye_app, eye_commit;

ALTER TABLE prediction.scenario_events DROP CONSTRAINT scenario_events_event_check;
ALTER TABLE prediction.scenario_events ADD CONSTRAINT scenario_events_event_check CHECK (event IN (
  'scenario.declared', 'branch.added', 'branch.flipped', 'branch.closed', 'scenario.closed', 'scenario.attention', 'scenario.reviewed', 'scenario.retired', 'scenario.coherence_checked',
  'scenario.branched', 'scenario.branch_repeated'));
ALTER TABLE prediction.scenario_coherence_checks DROP CONSTRAINT scenario_coherence_checks_trigger_check;
ALTER TABLE prediction.scenario_coherence_checks ADD CONSTRAINT scenario_coherence_checks_trigger_check CHECK (trigger IN ('declare', 'review', 'subscription', 'operator', 'branch'));

-- ============================================================
-- §2 prediction.add_branch — 0061 §1's body; the authority list gains prediction.scenario.branch (nothing else changes)
-- ============================================================
CREATE OR REPLACE FUNCTION prediction.add_branch(
  p_branch_id uuid, p_tenant uuid, p_domain uuid, p_scenario_id uuid, p_name text, p_kind text,
  p_statement text, p_indicator_id uuid, p_signpost text, p_owner uuid, p_review_cadence text,
  p_response_hours int, p_consequence text, p_consequence_class text, p_decision_deadline timestamptz,
  p_kind_label text, p_divergence text, p_assumptions jsonb,
  p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS void
SECURITY DEFINER SET search_path = prediction, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_kinds text[]; v_a jsonb;
BEGIN
  -- B23 (0084, L7-I02): the branching write (prediction.branch_scenario) adds its one branch through this port, under its own action.
  PERFORM observation.assert_authority(ARRAY['prediction.scenario.declare', 'prediction.scenario.branch']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT kinds INTO v_kinds FROM prediction.scenario_kind_versions WHERE version = 1;
  IF p_kind IS NULL OR NOT (p_kind = ANY (v_kinds)) THEN
    RAISE EXCEPTION 'branch rejected: kind % is not in scenario kind vocabulary v1 (%)', coalesce(p_kind, '<null>'), array_to_string(v_kinds, ', ')
      USING ERRCODE = '23514';
  END IF;
  IF p_kind = 'user-defined' AND (p_kind_label IS NULL OR length(btrim(p_kind_label)) NOT BETWEEN 2 AND 64) THEN
    RAISE EXCEPTION 'branch rejected: a user-defined kind names itself (kind_label, 2-64 characters)' USING ERRCODE = '23514';
  END IF;
  IF p_kind <> 'user-defined' AND p_kind_label IS NOT NULL THEN
    RAISE EXCEPTION 'branch rejected: kind_label belongs to a user-defined kind only' USING ERRCODE = '23514';
  END IF;
  IF p_kind NOT IN ('baseline','upside','downside') AND (p_divergence IS NULL OR length(btrim(p_divergence)) < 8) THEN
    RAISE EXCEPTION 'branch rejected: a % branch says how it diverges from the baseline (divergence, at least 8 characters)', p_kind USING ERRCODE = '23514';
  END IF;
  IF p_divergence IS NOT NULL AND length(btrim(p_divergence)) < 8 THEN
    RAISE EXCEPTION 'branch rejected: divergence, when given, is at least 8 characters' USING ERRCODE = '23514';
  END IF;
  IF p_assumptions IS NULL OR jsonb_typeof(p_assumptions) <> 'array' THEN
    RAISE EXCEPTION 'branch rejected: assumptions is a list' USING ERRCODE = '23514';
  END IF;
  FOR v_a IN SELECT * FROM jsonb_array_elements(p_assumptions) LOOP
    IF jsonb_typeof(v_a) <> 'object' OR jsonb_typeof(v_a -> 'statement') <> 'string' OR length(btrim(v_a ->> 'statement')) < 2 THEN
      RAISE EXCEPTION 'branch rejected: every assumption is an object with a statement of at least 2 characters' USING ERRCODE = '23514';
    END IF;
  END LOOP;
  -- 0061: the class of the consequence, when declared, is one of Volume 5's five.
  IF p_consequence_class IS NOT NULL AND p_consequence_class NOT IN ('C0','C1','C2','C3','C4') THEN
    RAISE EXCEPTION 'branch rejected: consequence class % is not one of C0–C4 (Volume 5 ch. 58)', p_consequence_class USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM prediction.scenarios_current s WHERE s.scenario_id = p_scenario_id
                   AND s.tenant_id = p_tenant AND s.domain_id = p_domain AND s.state = 'active') THEN
    RAISE EXCEPTION 'branch rejected: no active scenario % in this domain', p_scenario_id USING ERRCODE = '23503';
  END IF;
  IF p_indicator_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM prediction.indicators_current i
      WHERE i.indicator_id = p_indicator_id AND i.tenant_id = p_tenant AND i.domain_id = p_domain) THEN
    RAISE EXCEPTION 'branch rejected: no such indicator in this domain' USING ERRCODE = '23503';
  END IF;
  INSERT INTO prediction.branches_current (
    branch_id, scope, tenant_id, domain_id, scenario_id, name, kind, statement, indicator_id, signpost,
    owner_principal_id, review_cadence, response_window_hours, consequence, consequence_class, state, correlation_id, decision_deadline,
    kind_vocabulary_version, kind_label, divergence, assumptions
  ) VALUES (
    p_branch_id, 'DOMAIN', p_tenant, p_domain, p_scenario_id, p_name, p_kind, p_statement, p_indicator_id,
    p_signpost, p_owner, p_review_cadence, coalesce(p_response_hours, 72), p_consequence, p_consequence_class, 'open', p_correlation,
    p_decision_deadline, 1, p_kind_label, p_divergence, p_assumptions);
  INSERT INTO prediction.scenario_events (
    event_id, scope, tenant_id, domain_id, scenario_id, branch_id, event, actor_principal_id, details, correlation_id
  ) VALUES (
    p_event_id, 'DOMAIN', p_tenant, p_domain, p_scenario_id, p_branch_id, 'branch.added', p_actor,
    jsonb_build_object('name', p_name, 'kind', p_kind, 'kind_label', p_kind_label, 'kind_vocabulary_version', 1,
                       'indicator_id', p_indicator_id, 'owner', p_owner, 'decision_deadline', p_decision_deadline,
                       'consequence_class', p_consequence_class, 'divergence', p_divergence, 'assumptions', p_assumptions),
    p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.add_branch(uuid,uuid,uuid,uuid,text,text,text,uuid,text,uuid,text,int,text,text,timestamptz,text,text,jsonb,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.add_branch(uuid,uuid,uuid,uuid,text,text,text,uuid,text,uuid,text,int,text,text,timestamptz,text,text,jsonb,uuid,uuid,uuid) TO eye_commit;

-- ============================================================
-- §3 prediction.check_scenario_coherence — 0081 §6's body; the authority list gains prediction.scenario.branch and the trigger `branch`
-- ============================================================
CREATE OR REPLACE FUNCTION prediction.check_scenario_coherence(
  p_check_id uuid, p_scenario_id uuid, p_tenant uuid, p_domain uuid, p_trigger text, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, graph, intelligence, objects, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE s prediction.scenarios_current%ROWTYPE; r jsonb := prediction.scenario_coherence_rule(); v_findings jsonb := '[]'::jsonb; b record; a jsonb; m text[];
        v_basis text; v_obj uuid; v_ver bigint; o record; fc record; v_outcome text; v_changed boolean; v_prev jsonb; v_fails jsonb; v_prev_fails jsonb;
        v_at timestamptz := clock_timestamp(); v_version int; v_open int; v_kinds int; v_ctr uuid;
BEGIN
  -- B23 (0084, L7-I02): the branching write re-checks the new version under its own action, trigger `branch`.
  PERFORM observation.assert_authority(ARRAY['prediction.scenario.check', 'prediction.scenario.declare', 'prediction.scenario.review', 'prediction.scenario.subscription.apply', 'prediction.scenario.branch']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_trigger IS NULL OR p_trigger NOT IN ('declare', 'review', 'subscription', 'operator', 'branch') THEN RAISE EXCEPTION 'coherence check rejected: the trigger is declare, review, subscription, operator or branch' USING ERRCODE = '22023'; END IF;
  IF p_trigger = 'operator' AND p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'coherence check rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO s FROM prediction.scenarios_current x WHERE x.scenario_id = p_scenario_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'coherence check rejected: no such scenario % in this domain', p_scenario_id USING ERRCODE = '23503'; END IF;
  IF s.state = 'retired' THEN RAISE EXCEPTION 'coherence check rejected: scenario % is retired; a retired scenario is not checked (declare a successor)', p_scenario_id USING ERRCODE = '22023'; END IF;
  SELECT max(x.object_version)::int INTO v_version FROM objects.canonical_objects x WHERE x.object_type = 'SCN' AND x.object_id = p_scenario_id;
  -- duplicate_branch: two live non-baseline branches of one kind sharing the indicator, or the same normalised statement (FEX-12; AU-PRD-0026)
  FOR b IN SELECT x.branch_id, x.name, x.kind, y.branch_id AS other_id, y.name AS other_name,
                  CASE WHEN x.indicator_id IS NOT NULL AND x.indicator_id = y.indicator_id THEN 'indicator' ELSE 'statement' END AS via
             FROM prediction.branches_current x JOIN prediction.branches_current y ON y.scenario_id = x.scenario_id AND y.branch_id > x.branch_id
            WHERE x.scenario_id = p_scenario_id AND x.state <> 'closed' AND y.state <> 'closed' AND x.kind <> 'baseline' AND y.kind = x.kind
              AND ((x.indicator_id IS NOT NULL AND x.indicator_id = y.indicator_id) OR lower(btrim(x.statement)) = lower(btrim(y.statement)))
            ORDER BY x.name, y.name LOOP
    v_findings := v_findings || jsonb_build_object('rule', 'duplicate_branch', 'severity', 'fail', 'branch_id', b.branch_id, 'other_branch_id', b.other_id,
      'detail', format('branches "%s" and "%s" are both %s and share the same %s; they do not cover distinct uncertainty', b.name, b.other_name, b.kind, b.via));
  END LOOP;
  -- assumption_invalid / basis_unchecked
  FOR b IN SELECT x.branch_id, x.name, x.assumptions FROM prediction.branches_current x WHERE x.scenario_id = p_scenario_id AND x.state <> 'closed' ORDER BY x.name LOOP
    FOR a IN SELECT * FROM jsonb_array_elements(coalesce(b.assumptions, '[]'::jsonb)) LOOP
      v_basis := btrim(coalesce(a ->> 'basis', ''));
      m := regexp_match(v_basis, '^(?:CLM:)?([0-9a-fA-F-]{36})(?:@(\d+))?$');
      IF m IS NULL THEN
        v_findings := v_findings || jsonb_build_object('rule', 'basis_unchecked', 'severity', 'note', 'branch_id', b.branch_id,
          'detail', format('assumption "%s" of "%s" names no claim version as its basis; it is not judged', left(a ->> 'statement', 120), b.name));
        CONTINUE;
      END IF;
      v_obj := m[1]::uuid; v_ver := NULLIF(m[2], '')::bigint;
      SELECT x.object_version, x.lifecycle_state INTO o FROM objects.canonical_objects x
       WHERE x.object_type = 'CLM' AND x.object_id = v_obj AND x.tenant_id = p_tenant AND x.domain_id = p_domain ORDER BY x.object_version DESC LIMIT 1;
      SELECT c.contradiction_id INTO v_ctr FROM intelligence.contradictions c WHERE c.state = 'open' AND (c.a_object_id = v_obj OR c.b_object_id = v_obj) ORDER BY c.detected_at LIMIT 1;
      -- the latest version of a claim is never superseded (a supersession records a NEWER version; the object_version > v_ver branch judges a stale basis);
      -- withdrawn, archived (gone by retention) and deleted are the canonical vocabulary's gone states (0006:15-16)
      IF o IS NULL THEN
        v_findings := v_findings || jsonb_build_object('rule', 'assumption_invalid', 'severity', 'fail', 'branch_id', b.branch_id, 'detail', format('assumption of "%s": basis %s is not a claim of this domain', b.name, v_basis));
      ELSIF o.lifecycle_state IN ('withdrawn', 'archived', 'deleted') THEN
        v_findings := v_findings || jsonb_build_object('rule', 'assumption_invalid', 'severity', 'fail', 'branch_id', b.branch_id, 'detail', format('assumption of "%s": claim %s is %s at version %s', b.name, v_obj, o.lifecycle_state, o.object_version));
      ELSIF EXISTS (SELECT 1 FROM intelligence.review_current rc WHERE rc.claim_object_id = v_obj AND rc.state = 'rejected' AND (v_ver IS NULL OR rc.claim_version = v_ver)) THEN
        v_findings := v_findings || jsonb_build_object('rule', 'assumption_invalid', 'severity', 'fail', 'branch_id', b.branch_id, 'detail', format('assumption of "%s": claim %s was rejected in review', b.name, v_basis));
      ELSIF v_ctr IS NOT NULL THEN
        v_findings := v_findings || jsonb_build_object('rule', 'assumption_invalid', 'severity', 'fail', 'branch_id', b.branch_id, 'detail', format('assumption of "%s": claim %s is the subject of open contradiction %s', b.name, v_obj, v_ctr));
      ELSIF v_ver IS NOT NULL AND o.object_version > v_ver THEN
        v_findings := v_findings || jsonb_build_object('rule', 'assumption_invalid', 'severity', 'fail', 'branch_id', b.branch_id, 'detail', format('assumption of "%s": basis names version %s of claim %s; the claim stands at version %s (%s) — restate the basis', b.name, v_ver, v_obj, o.object_version, o.lifecycle_state));
      END IF;
    END LOOP;
  END LOOP;
  -- forecast_relationship: the scenario's forecast withdrawn, superseded or assessed unfit (L6-I05 / L6-I03 → L7-I04)
  IF s.forecast_id IS NOT NULL THEN
    SELECT x.state, x.superseded_by, x.fitness_state, x.fitness_class INTO fc FROM prediction.forecasts_current x WHERE x.forecast_id = s.forecast_id;
    IF fc.state = 'withdrawn' THEN v_findings := v_findings || jsonb_build_object('rule', 'forecast_relationship', 'severity', 'fail', 'detail', format('forecast %s was withdrawn as unfit', s.forecast_id));
    ELSIF fc.state = 'superseded' THEN v_findings := v_findings || jsonb_build_object('rule', 'forecast_relationship', 'severity', 'fail', 'detail', format('forecast %s is superseded by %s; the scenario rests on a forecast that is no longer current', s.forecast_id, fc.superseded_by));
    ELSIF fc.fitness_state = 'unfit' THEN v_findings := v_findings || jsonb_build_object('rule', 'forecast_relationship', 'severity', 'fail', 'detail', format('forecast %s was assessed unfit (%s)', s.forecast_id, fc.fitness_class));
    END IF;
  END IF;
  -- temporal_order: a decision due before its indicator can be observed (0059's observes_from)
  FOR b IN SELECT x.branch_id, x.name, x.decision_deadline, i.observes_from FROM prediction.branches_current x JOIN prediction.indicators_current i ON i.indicator_id = x.indicator_id
            WHERE x.scenario_id = p_scenario_id AND x.state <> 'closed' AND x.decision_deadline IS NOT NULL AND i.observes_from IS NOT NULL AND x.decision_deadline::date < i.observes_from ORDER BY x.name LOOP
    v_findings := v_findings || jsonb_build_object('rule', 'temporal_order', 'severity', 'fail', 'branch_id', b.branch_id, 'detail', format('the decision on "%s" is due %s, before its indicator observes anything (from %s)', b.name, b.decision_deadline, b.observes_from));
  END LOOP;
  -- dependency_retired: the subject entity retired
  IF s.subject_entity_id IS NOT NULL AND EXISTS (SELECT 1 FROM graph.entities_current e WHERE e.entity_id = s.subject_entity_id AND e.lifecycle_state = 'retired') THEN
    v_findings := v_findings || jsonb_build_object('rule', 'dependency_retired', 'severity', 'fail', 'detail', format('subject entity %s is retired', s.subject_entity_id));
  END IF;
  -- coverage (a note, never a failure — the portfolio judgement is the review's, L7-I05)
  SELECT count(*), count(DISTINCT x.kind) INTO v_open, v_kinds FROM prediction.branches_current x WHERE x.scenario_id = p_scenario_id AND x.state <> 'closed' AND x.kind <> 'baseline';
  IF v_open < 2 OR v_kinds < 2 THEN
    v_findings := v_findings || jsonb_build_object('rule', 'coverage', 'severity', 'note', 'detail', format('%s live branch(es) of %s kind(s) beside the baseline; the portfolio may not cover the material uncertainty — the review judges it', v_open, v_kinds));
  END IF;
  SELECT coalesce(jsonb_agg(x ORDER BY x), '[]'::jsonb) INTO v_fails FROM jsonb_array_elements(v_findings) x WHERE (x ->> 'severity') = 'fail';
  v_outcome := CASE WHEN jsonb_array_length(v_fails) > 0 THEN 'failed' ELSE 'passed' END;
  SELECT coalesce(jsonb_agg(x ORDER BY x), '[]'::jsonb) INTO v_prev_fails FROM prediction.scenario_coherence_checks c, jsonb_array_elements(c.findings) x WHERE c.check_id = s.coherence_check_id AND (x ->> 'severity') = 'fail';
  v_changed := (s.coherence_state IS DISTINCT FROM v_outcome) OR (v_outcome = 'failed' AND v_fails IS DISTINCT FROM v_prev_fails);
  INSERT INTO prediction.scenario_coherence_checks (check_id, scope, tenant_id, domain_id, scenario_id, scenario_version, rule_version, trigger, findings, outcome, prior_state, changed, checked_by, checked_at, correlation_id)
  VALUES (p_check_id, 'DOMAIN', p_tenant, p_domain, p_scenario_id, v_version, r ->> 'version', p_trigger, v_findings, v_outcome, s.coherence_state, v_changed, p_actor, v_at, p_correlation);
  UPDATE prediction.scenarios_current SET coherence_state = v_outcome, coherence_check_id = p_check_id, updated_at = v_at WHERE scenario_id = p_scenario_id;
  INSERT INTO prediction.scenario_events (event_id, scope, tenant_id, domain_id, scenario_id, branch_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_scenario_id, NULL, 'scenario.coherence_checked', p_actor,
          jsonb_build_object('check_id', p_check_id, 'outcome', v_outcome, 'prior_state', s.coherence_state, 'changed', v_changed, 'trigger', p_trigger,
                             'rule_version', r ->> 'version', 'fail', jsonb_array_length(v_fails), 'findings', jsonb_array_length(v_findings)), p_correlation);
  RETURN jsonb_build_object('check_id', p_check_id, 'scenario_id', p_scenario_id, 'scenario_version', v_version, 'title', s.title, 'owner', s.owner_principal_id, 'forecast_id', s.forecast_id,
                            'outcome', v_outcome, 'prior_state', s.coherence_state, 'changed', v_changed, 'findings', v_findings, 'rule_version', r ->> 'version', 'checked_at', v_at);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.check_scenario_coherence(uuid,uuid,uuid,uuid,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.check_scenario_coherence(uuid,uuid,uuid,uuid,text,uuid,uuid,uuid) TO eye_commit;

-- ============================================================
-- §4 THE PORT prediction.branch_scenario (L7-I02): idempotent acceptance, one authoritative effect, conflicts refused
-- ============================================================
-- p_branch carries the branch as the service validated it (snake_case: name, kind, kind_label, statement, indicator_id, signpost,
-- owner, review_cadence, response_window_hours, consequence, consequence_class, decision_deadline, divergence, assumptions). The
-- SERVICE admits the SCN version expected+1 (the previous branches plus this one, supersedes id@expected) BEFORE this port in the
-- same write; any refusal here rolls it back. A repeat or an idempotency conflict is answered BEFORE any admission (the service
-- reads the key first and admits nothing on a repeat).
CREATE OR REPLACE FUNCTION prediction.branch_scenario(
  p_request_id uuid, p_tenant uuid, p_domain uuid, p_scenario_id uuid, p_expected_version int, p_branch jsonb, p_branch_id uuid,
  p_idempotency_key text, p_request_digest text, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, objects, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r prediction.scenario_branch_requests%ROWTYPE; s prediction.scenarios_current%ROWTYPE; x record; v_kind text; v_label text; v_name text;
        v_statement text; v_indicator uuid; v_next int; v_at timestamptz := clock_timestamp();
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.scenario.branch']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'branch rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF p_idempotency_key IS NULL OR length(btrim(p_idempotency_key)) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'branch rejected: the idempotency key is 1-200 characters' USING ERRCODE = '22023';
  END IF;
  IF p_request_digest IS NULL OR p_request_digest !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'branch rejected: the request digest is 64 lowercase hex characters' USING ERRCODE = '22023'; END IF;
  IF p_expected_version IS NULL OR p_expected_version < 1 THEN RAISE EXCEPTION 'branch rejected: the expected version is a positive integer' USING ERRCODE = '22023'; END IF;
  IF p_branch IS NULL OR jsonb_typeof(p_branch) <> 'object' THEN RAISE EXCEPTION 'branch rejected: the branch is an object' USING ERRCODE = '22023'; END IF;
  -- EXACTLY ONCE: the same key with the same request answers the result already recorded (and says so on the scenario's log); a
  -- different request under the key is refused — a new branching takes a new key.
  SELECT * INTO r FROM prediction.scenario_branch_requests q
   WHERE q.tenant_id = p_tenant AND q.domain_id = p_domain AND q.requester_principal_id = p_actor AND q.idempotency_key = p_idempotency_key FOR UPDATE;
  IF FOUND THEN
    IF r.request_digest <> p_request_digest THEN
      RAISE EXCEPTION 'branch rejected (idempotency_conflict): idempotency key % was already used by this requester for a different branching (digest % recorded, % offered); a new branching takes a new key',
        p_idempotency_key, left(r.request_digest, 12), left(p_request_digest, 12) USING ERRCODE = '22023';
    END IF;
    INSERT INTO prediction.scenario_events (event_id, scope, tenant_id, domain_id, scenario_id, branch_id, event, actor_principal_id, details, correlation_id)
    VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, r.scenario_id, r.branch_id, 'scenario.branch_repeated', p_actor,
            jsonb_build_object('request_id', r.request_id, 'offered_request_id', p_request_id, 'idempotency_key', r.idempotency_key, 'version', r.result_version), p_correlation);
    SELECT b.name, b.kind, b.kind_label INTO x FROM prediction.branches_current b WHERE b.branch_id = r.branch_id;
    RETURN jsonb_build_object('request_id', r.request_id, 'scenario_id', r.scenario_id, 'branch_id', r.branch_id, 'base_version', r.base_version, 'version', r.result_version,
                              'repeated', true, 'name', x.name, 'kind', x.kind, 'kind_label', x.kind_label, 'requested_at', r.requested_at);
  END IF;
  SELECT * INTO s FROM prediction.scenarios_current c WHERE c.scenario_id = p_scenario_id AND c.tenant_id = p_tenant AND c.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'branch rejected: no such scenario % in this domain', p_scenario_id USING ERRCODE = '23503'; END IF;
  IF s.state <> 'active' THEN
    RAISE EXCEPTION 'branch rejected: scenario % is %; only an active scenario takes a new branch (declare a successor)', p_scenario_id, s.state USING ERRCODE = '22023';
  END IF;
  IF s.current_version <> p_expected_version THEN
    RAISE EXCEPTION 'branch rejected (stale_version): scenario % stands at version %, the request names version %; reload the scenario and branch its current version',
      p_scenario_id, s.current_version, p_expected_version USING ERRCODE = '22023';
  END IF;
  v_kind := p_branch ->> 'kind'; v_name := btrim(coalesce(p_branch ->> 'name', '')); v_statement := btrim(coalesce(p_branch ->> 'statement', ''));
  v_label := NULLIF(btrim(coalesce(p_branch ->> 'kind_label', '')), ''); v_indicator := NULLIF(p_branch ->> 'indicator_id', '')::uuid;
  -- THE CONTRACT'S FOUR: an upside, a downside, a disruption or a user-defined alternative (the vocabulary v1 codes). The baseline is
  -- declared with the tree; stress, adversarial and counterfactual branches are declared with it too.
  IF v_kind IS NULL OR v_kind NOT IN ('upside', 'downside', 'disruption', 'user-defined') THEN
    RAISE EXCEPTION 'branch rejected: BranchScenario adds an upside, downside, disruption or user-defined branch; kind % is not one of them', coalesce(v_kind, '<null>') USING ERRCODE = '22023';
  END IF;
  -- CONFLICTS: never admitted as a failing branch — refused.
  SELECT b.branch_id, b.name INTO x FROM prediction.branches_current b
   WHERE b.scenario_id = p_scenario_id AND b.state <> 'closed' AND lower(btrim(b.name)) = lower(v_name) LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'branch rejected (duplicate): scenario % already has a live branch named "%" (%)', p_scenario_id, x.name, x.branch_id USING ERRCODE = '23514';
  END IF;
  IF v_kind = 'user-defined' THEN
    SELECT b.branch_id, b.name, b.kind_label INTO x FROM prediction.branches_current b
     WHERE b.scenario_id = p_scenario_id AND b.state <> 'closed' AND b.kind = 'user-defined' AND lower(btrim(b.kind_label)) = lower(coalesce(v_label, '')) LIMIT 1;
    IF FOUND THEN
      RAISE EXCEPTION 'branch rejected (duplicate): scenario % already has a live user-defined branch "%" of the kind "%" (%)', p_scenario_id, x.name, x.kind_label, x.branch_id USING ERRCODE = '23514';
    END IF;
  END IF;
  -- the coherence rule's duplicate_branch (0081 §6): two live branches of one kind sharing the indicator or the same normalised statement
  SELECT b.branch_id, b.name, CASE WHEN v_indicator IS NOT NULL AND b.indicator_id = v_indicator THEN 'indicator' ELSE 'statement' END AS via INTO x
    FROM prediction.branches_current b
   WHERE b.scenario_id = p_scenario_id AND b.state <> 'closed' AND b.kind = v_kind
     AND ((v_indicator IS NOT NULL AND b.indicator_id = v_indicator) OR lower(btrim(b.statement)) = lower(v_statement)) LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'branch rejected (duplicate): the live % branch "%" (%) shares the same %; a second one does not cover distinct uncertainty (the coherence rule''s duplicate_branch)', v_kind, x.name, x.branch_id, x.via USING ERRCODE = '23514';
  END IF;
  v_next := p_expected_version + 1;
  -- THE VERSION THIS WRITE ADMITTED: SCN v(expected+1) under this operation's correlation, naming the branch as offered.
  IF NOT EXISTS (SELECT 1 FROM objects.canonical_objects o
                  WHERE o.object_type = 'SCN' AND o.object_id = p_scenario_id AND o.object_version = v_next AND o.audit_correlation_id = p_correlation
                    AND o.tenant_id = p_tenant AND o.domain_id = p_domain AND o.supersedes = p_scenario_id::text || '@' || p_expected_version::text
                    AND EXISTS (SELECT 1 FROM jsonb_array_elements(o.payload -> 'branches') e
                                 WHERE e ->> 'branch_id' = p_branch_id::text AND e ->> 'kind' = v_kind AND btrim(e ->> 'name') = v_name)) THEN
    RAISE EXCEPTION 'branch rejected: no SCN version % of scenario % naming branch % was admitted by this write (the version is admitted first, superseding version %)', v_next, p_scenario_id, p_branch_id, p_expected_version
      USING ERRCODE = '22023';
  END IF;
  PERFORM prediction.add_branch(
    p_branch_id, p_tenant, p_domain, p_scenario_id, v_name, v_kind, v_statement, v_indicator, p_branch ->> 'signpost', (p_branch ->> 'owner')::uuid,
    coalesce(p_branch ->> 'review_cadence', s.review_cadence), (p_branch ->> 'response_window_hours')::int, p_branch ->> 'consequence', p_branch ->> 'consequence_class',
    NULLIF(p_branch ->> 'decision_deadline', '')::timestamptz, v_label, p_branch ->> 'divergence', coalesce(p_branch -> 'assumptions', '[]'::jsonb),
    p_actor, gen_random_uuid(), p_correlation);
  UPDATE prediction.branches_current SET added_in_version = v_next WHERE branch_id = p_branch_id;
  UPDATE prediction.scenarios_current SET current_version = v_next, updated_at = v_at WHERE scenario_id = p_scenario_id;
  INSERT INTO prediction.scenario_branch_requests (request_id, scope, tenant_id, domain_id, scenario_id, requester_principal_id, idempotency_key, request_digest,
                                                   base_version, result_version, branch_id, requested_at, correlation_id)
  VALUES (p_request_id, 'DOMAIN', p_tenant, p_domain, p_scenario_id, p_actor, p_idempotency_key, p_request_digest, p_expected_version, v_next, p_branch_id, v_at, p_correlation);
  INSERT INTO prediction.scenario_events (event_id, scope, tenant_id, domain_id, scenario_id, branch_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_scenario_id, p_branch_id, 'scenario.branched', p_actor,
          jsonb_build_object('request_id', p_request_id, 'base_version', p_expected_version, 'version', v_next, 'name', v_name, 'kind', v_kind, 'kind_label', v_label,
                             'indicator_id', v_indicator, 'idempotency_key', p_idempotency_key, 'request_digest', p_request_digest), p_correlation);
  RETURN jsonb_build_object('request_id', p_request_id, 'scenario_id', p_scenario_id, 'branch_id', p_branch_id, 'base_version', p_expected_version, 'version', v_next,
                            'repeated', false, 'name', v_name, 'kind', v_kind, 'kind_label', v_label, 'requested_at', v_at,
                            'title', s.title, 'owner', s.owner_principal_id, 'forecast_id', s.forecast_id);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.branch_scenario(uuid,uuid,uuid,uuid,int,jsonb,uuid,text,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.branch_scenario(uuid,uuid,uuid,uuid,int,jsonb,uuid,text,text,uuid,uuid,uuid) TO eye_commit;

-- ============================================================
-- §5 simulation.open_run — 0081 §9's body; ONE block after the version check: a branch added after the bound version is refused
-- ============================================================
CREATE OR REPLACE FUNCTION simulation.open_run(
  p_run_id uuid, p_tenant uuid, p_domain uuid, p_twin_id uuid, p_twin_version int, p_run_kind text, p_control_run_id uuid, p_corrects uuid,
  p_scenario_id uuid, p_scenario_branch_id uuid, p_scenario_version int, p_scenario_branch_state text, p_shock boolean, p_shock_basis text, p_component text,
  p_model_ref text, p_implementation_digest text, p_environment_digest text, p_environment jsonb,
  p_stochastic_mode text, p_rng text, p_seed bigint, p_samples int, p_jitter jsonb,
  p_interventions jsonb, p_constraints jsonb, p_assumptions jsonb, p_inputs_digest text, p_validation_status text, p_controls jsonb, p_envelope_ack jsonb, p_challenge_id uuid,
  p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = simulation, twin, prediction, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE
  v twin.twin_versions%ROWTYPE; v_state jsonb; v_digest text; c simulation.runs_current%ROWTYPE; v_pinned text; v_controls jsonb; v_synthetic boolean;
  v_unusable jsonb; v_unavailable jsonb; b prediction.branches_current%ROWTYPE; v_scn_version int; v_branch_state text; v_expected_basis text; v_flip uuid;
  v_flip_observed date; v_envelope jsonb; v_outside text; v_ack jsonb; ch simulation.challenges%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['simulation.run']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT * INTO v FROM twin.twin_versions WHERE twin_id = p_twin_id AND version = p_twin_version AND tenant_id = p_tenant AND domain_id = p_domain;
  IF NOT FOUND OR v.state <> 'admitted' THEN
    RAISE EXCEPTION 'run rejected: version % of twin % is not an admitted version in this domain', p_twin_version, p_twin_id USING ERRCODE = '23503';
  END IF;
  IF v.completeness <> 'complete' THEN
    RAISE EXCEPTION 'run rejected: twin version % is incomplete (missing %); a run cannot use inputs the twin does not hold', p_twin_version, v.missing_keys::text USING ERRCODE = '22023';
  END IF;
  IF v.observed_through IS NULL THEN
    RAISE EXCEPTION 'run rejected: twin version % has no world-time cut-off (observed_through); a run reads the twin under two cut-offs', p_twin_version USING ERRCODE = '22023';
  END IF;
  -- B21 (0081, D3 a; AU-TWN-0014, V03-T-120): an UNFIT version opens no run — its behaviours are disabled until a later validation finds otherwise.
  IF v.fitness_state = 'unfit' THEN
    RAISE EXCEPTION 'run rejected (unfit_twin): twin version % of twin % is unfit (validation %); behaviours are disabled until a later validation finds it fit or indeterminate', p_twin_version, p_twin_id, v.fitness_validation_id USING ERRCODE = '22023';
  END IF;
  v_unusable := twin.unusable_inputs(p_twin_id, p_twin_version, p_component);
  IF jsonb_array_length(v_unusable) > 0 THEN
    RAISE EXCEPTION 'run rejected: inputs for component % are not usable: %', p_component, v_unusable::text USING ERRCODE = '22023';
  END IF;
  v_unavailable := twin.unavailable_inputs(p_twin_id, p_twin_version, p_component);
  IF jsonb_array_length(v_unavailable) > 0 THEN
    RAISE EXCEPTION 'run rejected: required inputs for component % are no longer available: %', p_component, v_unavailable::text USING ERRCODE = '22023';
  END IF;
  SELECT implementation_digest INTO v_pinned FROM twin.behaviour_models WHERE method_ref = p_model_ref;
  IF v_pinned IS NULL THEN
    RAISE EXCEPTION 'run rejected: behaviour model % has no pinned implementation', p_model_ref USING ERRCODE = '22023';
  END IF;
  IF v_pinned <> p_implementation_digest THEN
    RAISE EXCEPTION 'run rejected: the implementation offered (%) is not the pinned implementation of % (%)', p_implementation_digest, p_model_ref, v_pinned USING ERRCODE = '22023';
  END IF;
  IF p_run_kind = 'control' AND (p_control_run_id IS NOT NULL OR p_interventions <> '[{"type": "none"}]'::jsonb) THEN
    RAISE EXCEPTION 'run rejected: a control run applies `none` and references no control' USING ERRCODE = '22023';
  END IF;
  IF p_scenario_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM prediction.scenarios_current s WHERE s.scenario_id = p_scenario_id AND s.tenant_id = p_tenant AND s.domain_id = p_domain) THEN
      RAISE EXCEPTION 'run rejected: scenario % is not an authorized scenario in this domain', p_scenario_id USING ERRCODE = '23503';
    END IF;
    -- 0066 §8 (V04-T-032): a RETIRED scenario's branches do not enter simulation; its history stays for replay.
    IF EXISTS (SELECT 1 FROM prediction.scenarios_current s WHERE s.scenario_id = p_scenario_id AND s.state = 'retired') THEN
      RAISE EXCEPTION 'run rejected: scenario % was retired by review; a retired branch is not simulated (declare a successor scenario)', p_scenario_id USING ERRCODE = '22023';
    END IF;
    -- B21 (0081, D10; FEX-12, V03-T-143, AI-49-004): an incoherent scenario's branches do not enter simulation.
    IF EXISTS (SELECT 1 FROM prediction.scenarios_current s WHERE s.scenario_id = p_scenario_id AND s.coherence_state = 'failed') THEN
      RAISE EXCEPTION 'run rejected (incoherent_scenario): scenario % failed its coherence check % (%); a branch of an incoherent scenario is not simulated until a review resolves it', p_scenario_id,
        (SELECT s.coherence_check_id FROM prediction.scenarios_current s WHERE s.scenario_id = p_scenario_id),
        (SELECT string_agg(DISTINCT x ->> 'rule', ', ') FROM prediction.scenarios_current s JOIN prediction.scenario_coherence_checks k ON k.check_id = s.coherence_check_id, jsonb_array_elements(k.findings) x WHERE s.scenario_id = p_scenario_id AND (x ->> 'severity') = 'fail')
        USING ERRCODE = '22023';
    END IF;
    SELECT * INTO b FROM prediction.branches_current WHERE branch_id = p_scenario_branch_id AND scenario_id = p_scenario_id AND tenant_id = p_tenant AND domain_id = p_domain;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'run rejected: branch % is not a branch of scenario %', p_scenario_branch_id, p_scenario_id USING ERRCODE = '22023';
    END IF;
    v_scn_version := prediction.scenario_version_as_of(p_scenario_id, v.known_at);
    IF v_scn_version IS NULL THEN
      RAISE EXCEPTION 'run rejected: scenario % was recorded after this version''s known_at (%); it was not known at record time', p_scenario_id, v.known_at USING ERRCODE = '22023';
    END IF;
    IF v_scn_version IS DISTINCT FROM p_scenario_version THEN
      RAISE EXCEPTION 'run rejected: scenario % stood at version % at this version''s known_at (%), not %', p_scenario_id, v_scn_version, v.known_at, p_scenario_version USING ERRCODE = '22023';
    END IF;
    -- B23 (0084, L7-I02): a branch ADDED after the declaration (BranchScenario) belongs to the version that added it; a run whose record
    -- cut-off binds an earlier version of the tree did not know it (the membership above reads the current rows, which carry it).
    IF b.added_in_version > v_scn_version THEN
      RAISE EXCEPTION 'run rejected (branch_added_later): branch % was added in version % of scenario %, after version % that this twin version''s known_at (%) binds; it was not in the tree this run knew',
        p_scenario_branch_id, b.added_in_version, p_scenario_id, v_scn_version, v.known_at USING ERRCODE = '22023';
    END IF;
    /* BOTH CLOCKS: written by this run's record cut-off, and observed within its world. */
    v_branch_state := prediction.branch_state_as_of(p_scenario_branch_id, v.known_at, v.observed_through);
    v_flip_observed := prediction.branch_flip_observed_at(p_scenario_branch_id);
    IF v_branch_state IS DISTINCT FROM p_scenario_branch_state THEN
      RAISE EXCEPTION 'run rejected: branch % was % under this run''s cut-offs (known_at %, observations through %; the flip was recorded % and observed %), not %',
        p_scenario_branch_id, v_branch_state, v.known_at, v.observed_through, b.flipped_at, v_flip_observed, p_scenario_branch_state USING ERRCODE = '22023';
    END IF;
    IF p_shock <> (v_branch_state = 'flipped') THEN
      RAISE EXCEPTION 'run rejected: the shock contradicts the bound branch: branch % was % under this run''s cut-offs (a shock without a flipped branch is a hypothetical and names no scenario)', p_scenario_branch_id, v_branch_state USING ERRCODE = '22023';
    END IF;
    v_flip := CASE WHEN v_branch_state = 'flipped' THEN b.flip_event_id ELSE NULL END;
    v_expected_basis := CASE WHEN p_shock THEN 'scenario-branch-flipped' ELSE 'none' END;
  ELSE
    IF p_scenario_branch_id IS NOT NULL THEN
      RAISE EXCEPTION 'run rejected: a scenario branch was named without its scenario' USING ERRCODE = '22023';
    END IF;
    v_expected_basis := CASE WHEN p_shock THEN 'hypothetical' ELSE 'none' END;
  END IF;
  IF p_shock_basis IS DISTINCT FROM v_expected_basis THEN
    RAISE EXCEPTION 'run rejected: the shock basis offered (%) is not what the binding establishes (%)', p_shock_basis, v_expected_basis USING ERRCODE = '22023';
  END IF;
  v_controls := coalesce(p_controls, v.controls);
  IF simulation.classification_rank(v_controls ->> 'classification') < simulation.classification_rank(v.controls ->> 'classification')
     OR (coalesce((v.controls ->> 'synthetic_state')::boolean, false) AND NOT coalesce((v_controls ->> 'synthetic_state')::boolean, false)) THEN
    RAISE EXCEPTION 'run rejected: the controls offered are less restricted than the twin version''s' USING ERRCODE = '22023';
  END IF;
  -- B21 (0081, D3 b): THE RUN'S OWN CONTRACT against the envelope — one rule with the validation (twin.envelope_check); outside needs the acknowledgement.
  v_envelope := twin.envelope_check(p_twin_id, p_twin_version, jsonb_build_object('horizon_days', (p_constraints ->> 'horizon_days')::numeric));
  v_ack := NULL;
  IF (v_envelope ->> 'state') = 'outside' THEN
    SELECT string_agg(k || ' = ' || (x ->> 'value') || ' outside [' || (x -> 'range' ->> 0) || ', ' || (x -> 'range' ->> 1) || ']', '; ' ORDER BY k) INTO v_outside FROM jsonb_each(v_envelope -> 'keys') e(k, x) WHERE (x ->> 'verdict') = 'outside';
    -- the acknowledgement is read as TEXT, never cast: a non-boolean, "yes", 1 or a missing key all read as "not acknowledged" (no 22P02)
    IF p_envelope_ack IS NULL OR (p_envelope_ack ->> 'acknowledge') IS DISTINCT FROM 'true' OR coalesce(length(btrim(p_envelope_ack ->> 'reason')), 0) < 8 THEN
      RAISE EXCEPTION 'run rejected (envelope): outside the operating envelope of % (%); a run outside the envelope needs a twin owner''s or the domain administrator''s acknowledgement (envelope.acknowledge true with a reason of 8+ characters)', p_model_ref, v_outside USING ERRCODE = '22023';
    END IF;
    IF NOT twin.envelope_ack_holder(p_actor, p_tenant, p_domain) THEN
      RAISE EXCEPTION 'run rejected (envelope_ack): the acknowledgement of an envelope breach is a twin owner''s or the domain administrator''s; the acting principal holds neither role in this domain (%)', v_outside USING ERRCODE = '42501';
    END IF;
    v_ack := jsonb_build_object('acknowledged_by', p_actor, 'acknowledged_at', clock_timestamp(), 'reason', p_envelope_ack ->> 'reason', 'keys', v_outside);
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('key', e.key, 'kind', e.kind, 'basis_truth_state', e.basis_truth_state, 'value', e.value, 'unit', e.unit,
                                               'material', e.material, 'citations', e.citations, 'health', e.health, 'valid_from', e.valid_from,
                                               'valid_to', e.valid_to, 'confidence', e.confidence, 'synthetic_state', e.synthetic_state, 'controls', e.controls,
                                               'inherited_validation', e.inherited_validation)
                            ORDER BY e.key), '[]'::jsonb)
    INTO v_state FROM twin.state_elements e WHERE e.twin_id = p_twin_id AND e.version = p_twin_version;
  v_digest := encode(sha256(convert_to(v_state::text, 'UTF8')), 'hex');
  IF p_run_kind = 'intervention' THEN
    SELECT * INTO c FROM simulation.runs_current WHERE run_id = p_control_run_id AND tenant_id = p_tenant AND domain_id = p_domain;
    IF NOT FOUND THEN RAISE EXCEPTION 'run rejected: control run % is not an authorized run in this domain', p_control_run_id USING ERRCODE = '23503'; END IF;
    IF c.run_kind <> 'control' THEN RAISE EXCEPTION 'run rejected: % is not a control run', p_control_run_id USING ERRCODE = '22023'; END IF;
    IF c.state <> 'completed' THEN RAISE EXCEPTION 'run rejected: control run % is not completed', p_control_run_id USING ERRCODE = '22023'; END IF;
    IF c.twin_id <> p_twin_id OR c.twin_version <> p_twin_version OR c.initial_state_digest <> v_digest OR c.implementation_digest <> p_implementation_digest
       OR c.assumptions <> p_assumptions OR c.constraints <> p_constraints OR c.shock <> p_shock OR c.component <> p_component
       OR c.scenario_id IS DISTINCT FROM p_scenario_id OR c.scenario_branch_id IS DISTINCT FROM p_scenario_branch_id
       OR c.scenario_version IS DISTINCT FROM p_scenario_version OR c.shock_basis <> p_shock_basis THEN
      RAISE EXCEPTION 'run rejected: control run % is not compatible (it must share the twin version, initial state, implementation, assumptions, constraints, scenario binding, shock and component)', p_control_run_id
        USING ERRCODE = '22023';
    END IF;
  END IF;
  -- B21 (0081, D11): a RE-RUN answering a challenge names it; the challenge must await a re-run of the run this run corrects; one re-run per challenge.
  -- (the aliases here and in the incoherent-scenario block avoid `c`: this body declares c simulation.runs_current%ROWTYPE, and §7 gave that row a challenge_id)
  IF p_challenge_id IS NOT NULL THEN
    SELECT * INTO ch FROM simulation.challenges x WHERE x.challenge_id = p_challenge_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'run rejected (challenge): no such challenge % in this domain', p_challenge_id USING ERRCODE = '23503'; END IF;
    IF p_corrects IS DISTINCT FROM ch.run_id THEN RAISE EXCEPTION 'run rejected (challenge): challenge % disputes run %; a re-run names it as the run it corrects (correctsRunId)', p_challenge_id, ch.run_id USING ERRCODE = '22023'; END IF;
    IF ch.state <> 'rerun_requested' THEN RAISE EXCEPTION 'run rejected (challenge): challenge % is not awaiting a re-run (state %)', p_challenge_id, ch.state USING ERRCODE = '22023'; END IF;
    IF ch.rerun_run_id IS NOT NULL THEN RAISE EXCEPTION 'run rejected (challenge): challenge % is not awaiting a re-run (run % is its re-run)', p_challenge_id, ch.rerun_run_id USING ERRCODE = '22023'; END IF;
  END IF;
  v_synthetic := coalesce((v_controls ->> 'synthetic_state')::boolean, v.synthetic_state);
  INSERT INTO simulation.runs_current (
    run_id, scope, tenant_id, domain_id, twin_id, twin_version, branch_id, run_kind, control_run_id, corrects_run_id,
    scenario_id, scenario_branch_id, scenario_version, scenario_branch_state, scenario_flip_event, shock, shock_basis, component,
    known_at, observed_through, initial_state, initial_state_digest, model_ref, implementation_digest, environment_digest, environment,
    stochastic_mode, rng, seed, samples, jitter, interventions, constraints, assumptions, inputs_digest, validation_status, state, controls,
    operator_principal_id, correlation_id, twin_fitness, envelope_state, envelope_check, envelope_ack, challenge_id
  ) VALUES (
    p_run_id, 'DOMAIN', p_tenant, p_domain, p_twin_id, p_twin_version, v.branch_id, p_run_kind, p_control_run_id, p_corrects,
    p_scenario_id, p_scenario_branch_id, p_scenario_version, p_scenario_branch_state, v_flip, p_shock, p_shock_basis, p_component,
    v.known_at, v.observed_through, v_state, v_digest, p_model_ref, p_implementation_digest, p_environment_digest, p_environment,
    p_stochastic_mode, p_rng, p_seed, p_samples, p_jitter, p_interventions, p_constraints, p_assumptions, p_inputs_digest,
    p_validation_status || CASE WHEN v.verification_state = 'unverified' THEN '; twin version UNVERIFIED (a cited input was corrected)' ELSE '' END,
    'opened', v_controls, p_actor, p_correlation, v.fitness_state, v_envelope ->> 'state', v_envelope, v_ack, p_challenge_id);
  INSERT INTO simulation.run_events (event_id, scope, tenant_id, domain_id, run_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_run_id, 'run.opened', p_actor,
          jsonb_build_object('twin_id', p_twin_id, 'twin_version', p_twin_version, 'run_kind', p_run_kind, 'control_run_id', p_control_run_id,
                             'initial_state_digest', v_digest, 'inputs_digest', p_inputs_digest, 'stochastic_mode', p_stochastic_mode,
                             'scenario_id', p_scenario_id, 'scenario_version', p_scenario_version, 'scenario_branch_id', p_scenario_branch_id,
                             'scenario_branch_state', p_scenario_branch_state, 'shock_basis', p_shock_basis,
                             'flip_recorded_at', b.flipped_at, 'flip_observed_at', v_flip_observed,
                             'twin_fitness', v.fitness_state, 'envelope_state', v_envelope ->> 'state', 'envelope_ack', v_ack, 'challenge_id', p_challenge_id), p_correlation);
  IF p_challenge_id IS NOT NULL THEN
    UPDATE simulation.challenges SET rerun_run_id = p_run_id WHERE challenge_id = p_challenge_id;
    INSERT INTO simulation.challenge_events (event_id, scope, tenant_id, domain_id, challenge_id, run_id, event, actor_principal_id, details, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_challenge_id, ch.run_id, 'challenge.rerun_opened', p_actor, jsonb_build_object('rerun_run_id', p_run_id, 'corrects_run_id', p_corrects), p_correlation);
  END IF;
  RETURN jsonb_build_object('initial_state', v_state, 'initial_state_digest', v_digest, 'known_at', v.known_at, 'observed_through', v.observed_through,
                            'branch_id', v.branch_id, 'synthetic_state', v_synthetic, 'controls', v_controls, 'verification_state', v.verification_state,
                            'scenario_flip_event', v_flip, 'flip_observed_at', v_flip_observed,
                            'twin_fitness', v.fitness_state, 'envelope', v_envelope, 'envelope_ack', v_ack, 'challenge_id', p_challenge_id);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION simulation.open_run(uuid,uuid,uuid,uuid,int,text,uuid,uuid,uuid,uuid,int,text,boolean,text,text,text,text,text,jsonb,text,text,bigint,int,jsonb,jsonb,jsonb,jsonb,text,text,jsonb,jsonb,uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION simulation.open_run(uuid,uuid,uuid,uuid,int,text,uuid,uuid,uuid,uuid,int,text,boolean,text,text,text,text,text,jsonb,text,text,bigint,int,jsonb,jsonb,jsonb,jsonb,text,text,jsonb,jsonb,uuid,uuid,uuid,uuid) TO eye_commit;

-- ============================================================
-- §6 the canonical-write action: the branching write admits the next SCN version and nothing else (the 0029 idiom)
-- ============================================================
INSERT INTO observation.canonical_write_actions (action, object_types, rationale) VALUES
  ('prediction.scenario.branch', ARRAY['SCN'], 'BranchScenario admits the next version of the scenario object (the previous branches plus the new one, superseding the version it read) and nothing else (B23, 0084)')
ON CONFLICT (action) DO NOTHING;

-- ============================================================
-- §7 the interface register: L7-I02 bound (the integrator asserts the counts once)
-- ============================================================
UPDATE objects.interface_register SET binding_state = 'bound', schema_version = 'v1', bound_at = clock_timestamp(), bound_in = '0084',
  bound_to = 'ScenarioBranched@v1 from POST …/prediction/scenarios/:scenarioId/branches (prediction.scenario.branch, the declaring roles, not human-gated → prediction.branch_scenario): an upside, downside, disruption or user-defined branch ADDED to a declared, active scenario as a NEW VERSION — the SCN canonical object v(n+1) admitted (the previous branches plus the new one, superseding v(n); v(n) unchanged), scenarios_current.current_version = n+1, branches_current.added_in_version = n+1; IDEMPOTENT on (requester, idempotency_key) under the request digest (prediction.scenario_branch_requests: the same key and body answer the first result with no second effect and log scenario.branch_repeated; a different body under the key is refused 409 idempotency_conflict); CONFLICTS REJECTED 409 — a stale expected_version (stale_version, also a concurrent writer that admitted the same next version first), a live branch of the same name, a user-defined branch of the same label, or a branch the coherence rule would pair as duplicate_branch (never admitted as a failing branch); baseline and every other kind refused 422; the coherence check re-run on the new version (trigger branch; ScenarioCoherenceFailed@v1 on a failed and changed check); simulation.open_run refuses a branch added after the version its run binds (run rejected (branch_added_later)); the get serves current_version and the version history. NOT: branch removal or edit (retire by review), the other four kinds by this command, a subscriber for ScenarioBranched (not subscribable)'
  WHERE interface_id = 'L7-I02';

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §F THE INTERFACE REGISTER: all fifty bound (the six partial rows of 0083 — L1-I02, L3-I02, L4-I02, L7-I02, L10-I02, L10-I03 — bound above)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE v_bound int; v_partial int; v_unbound int; v_six int; v_names text;
BEGIN
  SELECT count(*) FILTER (WHERE binding_state = 'bound'), count(*) FILTER (WHERE binding_state = 'partial'), count(*) FILTER (WHERE binding_state = 'unbound')
    INTO v_bound, v_partial, v_unbound FROM objects.interface_register;
  SELECT count(*) INTO v_six FROM objects.interface_register
   WHERE interface_id = ANY (ARRAY['L1-I02','L3-I02','L4-I02','L7-I02','L10-I02','L10-I03']) AND binding_state = 'bound' AND bound_in = '0084';
  SELECT string_agg(interface_id, ',' ORDER BY layer, interface_id) INTO v_names FROM objects.interface_register WHERE binding_state <> 'bound';
  IF (v_bound, v_partial, v_unbound) <> (50, 0, 0) OR v_six <> 6 THEN
    RAISE EXCEPTION 'B23 (0084): the interface register reads %/%/% (bound/partial/unbound; not bound: %; the six bound in 0084: %); 50/0/0 expected', v_bound, v_partial, v_unbound, v_names, v_six;
  END IF;
END $$;
