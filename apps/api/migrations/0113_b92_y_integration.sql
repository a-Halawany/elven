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
