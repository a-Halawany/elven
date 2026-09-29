-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- section `attention`
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0094 §A — CP-6 B36 part `attention` (2026-09-30): THE ATTENTION COMPLETION — F-P6-07 COMPLETES. V8 PR-44-005 (fairness and staleness
-- ACT), CAP-EO-06; V9 UX-44-002 (the active objective, horizon, scenario, classification, effective time and policy EXPLICIT on the queue),
-- UX-44-005 (a recovery route per degraded state); V01-T-028 (governance forums over the same memory). Built on §0 (the signature, the
-- executive context, the room kinds — used, never re-declared) and on 0090 §A1–§A5 (the validator, the act, the queue evaluation).
--
--   §A0  the item-event vocabulary (0090 §0 line 416 copied whole, plus B36's item.settle_failed, item.act_resumed, item.priority_accepted)
--   §A1  THE RESUME ROUTE (n): an act whose SETTLE fails after its governed action COMMITTED gains the state settle_failed with the failure
--        and the committed action's receipt (executive.record_act_settle_failure); executive.resume_attention_act re-runs the settle from
--        the audit chain's record of the committed action — the governed action is NEVER re-executed (the port performs nothing; the
--        harness proves the target's audit sequence unchanged); a resume on an act whose action did not commit is refused (state); the
--        resumption is a row of executive.attention_act_resumptions and item.act_resumed on the item's log
--   §A2  ACCEPT-PRIORITY (o1): a DISTINCT human act of the item's accountable person — "I accept this item's rank and take it" — with the
--        DIGEST of the item's evaluation, the CONSEQUENCE preview (the response window, the escalation) and a SIGNATURE (§0
--        executive.record_signature, kind queue_transition — the route signs in the same write); item.priority_accepted; once per item
--   §A3  THE HOLD AND THE ROUTE-TO-AUTHORITY (o2; PR-44-005): the policy gains governance {fairness_floor, staleness_ceiling_hours} (the
--        validator re-declared from 0090 §A1 line 519 with that ONE change); after the queue evaluation (0090 §A5, untouched) the route
--        calls executive.hold_queue: the fairness measure (1 − the evaluation's disparity) below the floor, or the staleness measure (the
--        oldest live item's hours since its last evaluation) above the ceiling → executive.attention_queue_holds (held, the measure and
--        the threshold, the context digest) and executive.route_queue_to_authority (a queue.governance item for the executive); a HELD
--        queue serves its items READ-ONLY (a guard on the item log refuses every human transition) until the executive releases the hold
--        (executive.release_queue_hold, a reason)
--   §A4  THE RECOVERY ROUTES (o3; UX-44-005): the degraded states enumerated — delivery_sink_down, tick_stalled, policy_invalid,
--        evaluation_stale, hold — each detected from the ledgers (executive.attention_degraded_states) with what it means and its route;
--        executive.recover_queue runs the route's database side (re-deliver: the abandoned deliveries re-queued) and records every run
--        with before / after / outcome in executive.attention_recovery_routes (the release is recorded by release_queue_hold)
--   §A5  THE CONTEXT ON THE QUEUE (o4; UX-44-002): executive.queue_context reads §0's executive.current_context and the policy in force;
--        executive.attention_queue_read serves the items UNDER the context — an item outside the active objective, horizon or effective
--        time is FILTERED and COUNTED (never silently dropped; an item whose objective linkage is unknown is served and says so); the
--        ranking names the context digest it ran under
--   §A6  FORUMS (o5; V01-T-028): a room of kind forum (§0's column; forum_context is this section's) whose members review the SAME attention
--        items — executive.convene_forum (the executive operator; members; a cadence period) and executive.forum_queue (the queue read under
--        the forum's context: no copy — one item, one acceptance, seen by every forum)
-- Forward-only; 0083–0093 and §0 untouched. Every figure a harness seeds is SYNTHETIC.

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §A0 THE ITEM-EVENT VOCABULARY (0090 §0 line 416, whole, plus B36's)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
ALTER TABLE executive.attention_item_events DROP CONSTRAINT IF EXISTS attention_item_events_event_check;
ALTER TABLE executive.attention_item_events ADD CONSTRAINT attention_item_events_event_check CHECK (event IN (
  'item.routed', 'item.deprioritized', 'item.unrouted', 'item.escalated', 'item.acknowledged', 'item.suppressed',
  'item.suppression_lapsed', 'item.reevaluated', 'item.closed', 'item.repeated',
  -- B24 (0086)
  'item.delegated', 'item.delegation_ended', 'item.suppression_requested', 'item.suppression_decided',
  'item.overload_deprioritized', 'item.elevated', 'item.disposition',
  -- B34 (0090): the act transition
  'item.acted', 'item.act_refused',
  -- B36 (0094 §A): the settle failure and the resume, the accepted priority
  'item.settle_failed', 'item.act_resumed', 'item.priority_accepted'));

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §A1 THE RESUME ROUTE — an act whose settle failed after its governed action committed (n)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- The act (0090 §A4) gains the state settle_failed: the settle's write failed AFTER the governed action's own write committed (its receipt
-- known). The failure and the receipt are recorded; one act stays in flight per item (launched or settle_failed); a resume settles it acted
-- from the audit chain's record — nothing is performed again.
ALTER TABLE executive.attention_item_acts DROP CONSTRAINT attention_item_acts_state_check;
ALTER TABLE executive.attention_item_acts ADD CONSTRAINT attention_item_acts_state_check CHECK (state IN ('launched', 'acted', 'refused', 'settle_failed'));
ALTER TABLE executive.attention_item_acts
  ADD COLUMN settle_failure jsonb,
  ADD COLUMN action_receipt jsonb,
  ADD COLUMN resumed_at     timestamptz,
  ADD COLUMN resumed_by     uuid;
ALTER TABLE executive.attention_item_acts DROP CONSTRAINT xaia_settled;
ALTER TABLE executive.attention_item_acts ADD CONSTRAINT xaia_settled CHECK (
  (state IN ('launched', 'settle_failed')) = (settled_at IS NULL)
  AND (state <> 'acted' OR (effect_ref IS NOT NULL AND length(btrim(effect_ref)) > 0))
  AND (state <> 'refused' OR (refusal IS NOT NULL AND length(btrim(refusal)) > 0))
  AND (state <> 'settle_failed' OR jsonb_typeof(settle_failure) = 'object')
  AND ((resumed_at IS NULL) = (resumed_by IS NULL))
  AND (resumed_at IS NULL OR state = 'acted'));
DROP INDEX executive.xaia_one_in_flight;
CREATE UNIQUE INDEX xaia_one_in_flight ON executive.attention_item_acts (item_id) WHERE state IN ('launched', 'settle_failed');
COMMENT ON COLUMN executive.attention_item_acts.settle_failure IS 'B36 (0094 §A1): what the settle met after the governed action committed — {reason, effect_ref, effect, failed_at}; the act reads settle_failed until it is resumed';
COMMENT ON COLUMN executive.attention_item_acts.action_receipt IS 'B36 (0094 §A1): the committed governed action''s receipt {policyDecisionId, auditSeq} — the audit chain''s row the resume settles from; never a re-execution';

/* The settle-once trigger — 0090 §A4 line 988 copied whole; B36: launched → settle_failed (the failure and the receipt), and
   launched | settle_failed → acted | refused (the settle's columns, and on a resume resumed_at / resumed_by / action_receipt). */
CREATE OR REPLACE FUNCTION executive.attention_item_acts_settle_once() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'attention act rejected: an act is never deleted' USING ERRCODE = '2F002'; END IF;
  IF OLD.state = 'launched' AND NEW.state = 'settle_failed' THEN
    IF (to_jsonb(NEW) - ARRAY['state', 'settle_failure', 'action_receipt']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['state', 'settle_failure', 'action_receipt']) THEN
      RAISE EXCEPTION 'attention act rejected: act % records its settle failure and the committed action''s receipt, nothing else', OLD.act_id USING ERRCODE = '2F002';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.state NOT IN ('launched', 'settle_failed') OR NEW.state IN ('launched', 'settle_failed')
     OR (to_jsonb(NEW) - ARRAY['state', 'effect_ref', 'effect', 'refusal', 'settled_at', 'resumed_at', 'resumed_by', 'action_receipt'])
        IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['state', 'effect_ref', 'effect', 'refusal', 'settled_at', 'resumed_at', 'resumed_by', 'action_receipt']) THEN
    RAISE EXCEPTION 'attention act rejected: act % is % and settles once (launched → acted | refused | settle_failed → acted)', OLD.act_id, OLD.state USING ERRCODE = '2F002';
  END IF;
  RETURN NEW;
END $$;

CREATE TABLE executive.attention_act_resumptions (
  resumption_id   uuid PRIMARY KEY,
  scope           text NOT NULL,
  tenant_id       uuid NOT NULL,
  domain_id       uuid NOT NULL,
  act_id          uuid NOT NULL REFERENCES executive.attention_item_acts (act_id),
  item_id         uuid NOT NULL REFERENCES executive.attention_items (item_id),
  from_state      text NOT NULL CHECK (from_state IN ('launched', 'settle_failed')),
  failure         jsonb,
  action_receipt  jsonb NOT NULL CHECK (jsonb_typeof(action_receipt) = 'object'),
  effect_ref      text NOT NULL,
  resumed_by      uuid NOT NULL,
  resumed_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id  uuid NOT NULL,
  CONSTRAINT xar_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX xar_act ON executive.attention_act_resumptions (act_id);
CREATE TRIGGER xar_append_only BEFORE UPDATE OR DELETE ON executive.attention_act_resumptions FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE executive.attention_act_resumptions IS 'B36 (0094 §A1): every resumed act — the state it was resumed from, the failure its settle met, the committed action''s receipt (from the audit chain), who resumed it; the governed action is never re-executed';

/* The act's answer (0090 §A4's, plus B36's columns). */
CREATE OR REPLACE FUNCTION executive.attention_act_answer_b36(a executive.attention_item_acts, p_repeated boolean) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT executive.attention_act_answer(a, p_repeated) || jsonb_build_object('settle_failure', a.settle_failure, 'action_receipt', a.action_receipt, 'resumed_at', a.resumed_at, 'resumed_by', a.resumed_by);
$$;
REVOKE ALL ON FUNCTION executive.attention_act_answer_b36(executive.attention_item_acts, boolean) FROM PUBLIC;

/* THE COMMITTED ACTION'S RECEIPT from the audit chain: the successful api.request event of the act's governed action under the act's
   correlation (the governed action's chained envelope keeps the launch's correlation id — act.service.ts `chained`). NULL when the action
   never committed. A read of the audit ledger, nothing else. */
CREATE OR REPLACE FUNCTION executive.attention_act_committed_receipt(a executive.attention_item_acts) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = executive, audit, pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object('partition_id', e.partition_id, 'auditSeq', e.audit_seq, 'policyDecisionId', e.event ->> 'policy_decision_id', 'action', e.action,
                            'target_type', e.event ->> 'target_type', 'target_id', e.event ->> 'target_id', 'occurred_at', e.occurred_at, 'source', 'audit.audit_events')
    FROM audit.audit_events e
   WHERE e.correlation_id = a.correlation_id AND e.tenant_id = a.tenant_id AND e.event_type = 'api.request' AND e.action = a.governed_action AND e.outcome = 'success'
   ORDER BY e.audit_seq DESC LIMIT 1
$$;
REVOKE ALL ON FUNCTION executive.attention_act_committed_receipt(executive.attention_item_acts) FROM PUBLIC;

-- THE SETTLE FAILURE RECORDED (executive.attention.item.act — the act's own action; the launcher): launched → settle_failed with the
-- failure the settle met and the committed action's receipt; item.settle_failed on the item's log.
CREATE OR REPLACE FUNCTION executive.record_act_settle_failure(p_act_id uuid, p_tenant uuid, p_domain uuid, p_failure jsonb, p_action_receipt jsonb, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE a executive.attention_item_acts%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.attention.item.act']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'settle failure rejected (actor): recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO a FROM executive.attention_item_acts z WHERE z.act_id = p_act_id AND z.tenant_id = p_tenant AND z.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'settle failure rejected (unknown_act): act % is not an act of this domain', p_act_id USING ERRCODE = '23503'; END IF;
  IF a.launched_by <> p_actor THEN RAISE EXCEPTION 'settle failure rejected (actor): the settle failure of act % is recorded by the member who launched it', p_act_id USING ERRCODE = '42501'; END IF;
  IF a.state <> 'launched' THEN RAISE EXCEPTION 'settle failure rejected (state): act % is %; only a launched act''s settle fails', p_act_id, a.state USING ERRCODE = '22023'; END IF;
  IF jsonb_typeof(p_failure) IS DISTINCT FROM 'object' OR coalesce(length(btrim(p_failure ->> 'reason')), 0) = 0 THEN
    RAISE EXCEPTION 'settle failure rejected (failure): the failure is {reason, effect_ref, effect}' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_action_receipt) IS DISTINCT FROM 'object' OR NOT (p_action_receipt ? 'auditSeq') THEN
    RAISE EXCEPTION 'settle failure rejected (receipt): the committed action''s receipt is {policyDecisionId, auditSeq}' USING ERRCODE = '22023';
  END IF;
  UPDATE executive.attention_item_acts SET state = 'settle_failed', settle_failure = p_failure || jsonb_build_object('failed_at', clock_timestamp()), action_receipt = p_action_receipt
   WHERE act_id = p_act_id RETURNING * INTO a;
  PERFORM executive.attention_event(a.item_id, p_tenant, p_domain, 'item.settle_failed', p_actor,
            jsonb_build_object('act_id', a.act_id, 'action_key', a.action_key, 'governed_action', a.governed_action, 'target_kind', a.target_kind, 'target_id', a.target_id,
                               'failure', p_failure ->> 'reason', 'effect_ref', p_failure ->> 'effect_ref', 'action_receipt', p_action_receipt,
                               'resume', 'the launcher or the executive operator resumes the settle (executive.attention.item.act.resume); the governed action is not performed again'), p_correlation);
  RETURN executive.attention_act_answer_b36(a, false);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.record_act_settle_failure(uuid,uuid,uuid,jsonb,jsonb,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.record_act_settle_failure(uuid,uuid,uuid,jsonb,jsonb,uuid,uuid) TO eye_commit;

-- THE RESUME (executive.attention.item.act.resume; human-gated): the launcher or the executive operator; the act launched or settle_failed;
-- the governed action's commit PROVEN from the audit chain (its successful api.request event under the act's correlation) — an act whose
-- action did not commit is refused (state): it is settled refused or launched afresh, never resumed. The settle re-run: acted with the
-- effect the failure recorded (or the audit row's reference), item.acted (resumed) and item.act_resumed on the log, a resumption row.
CREATE OR REPLACE FUNCTION executive.resume_attention_act(p_resumption_id uuid, p_act_id uuid, p_tenant uuid, p_domain uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, identity, observation, audit, ctx, public, pg_catalog, pg_temp AS $$
DECLARE a executive.attention_item_acts%ROWTYPE; v_receipt jsonb; v_from text; v_effect_ref text; v_effect jsonb; v_at timestamptz := clock_timestamp();
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.attention.item.act.resume']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'act resumption rejected (actor): resumed by the acting principal' USING ERRCODE = '42501'; END IF;
  IF NOT decision.is_active_human(p_actor, p_tenant) THEN RAISE EXCEPTION 'act resumption rejected (actor): a resume is a named, active member''s — never an agent''s' USING ERRCODE = '42501'; END IF;
  SELECT * INTO a FROM executive.attention_item_acts z WHERE z.act_id = p_act_id AND z.tenant_id = p_tenant AND z.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'act resumption rejected (unknown_act): act % is not an act of this domain', p_act_id USING ERRCODE = '23503'; END IF;
  IF a.launched_by <> p_actor AND NOT executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['executive_operator']) THEN
    RAISE EXCEPTION 'act resumption rejected (actor): act % is resumed by the member who launched it or by the executive operator', p_act_id USING ERRCODE = '42501';
  END IF;
  IF a.state IN ('acted', 'refused') THEN
    RAISE EXCEPTION 'act resumption rejected (state): act % is already % (settled at %); nothing to resume', p_act_id, a.state, a.settled_at USING ERRCODE = '22023';
  END IF;
  v_receipt := executive.attention_act_committed_receipt(a);
  IF v_receipt IS NULL THEN
    RAISE EXCEPTION 'act resumption rejected (state): the governed action % of act % did not commit (no successful audit event under its correlation); nothing to resume — the act stays % and is settled refused or launched afresh, never resumed',
      a.governed_action, p_act_id, a.state USING ERRCODE = '22023';
  END IF;
  v_from := a.state;
  v_receipt := coalesce(a.action_receipt, '{}'::jsonb) || v_receipt;
  v_effect_ref := coalesce(nullif(btrim(a.settle_failure ->> 'effect_ref'), ''), format('%s:%s@audit#%s', a.target_kind, a.target_id, v_receipt ->> 'auditSeq'));
  v_effect := CASE WHEN jsonb_typeof(a.settle_failure -> 'effect') = 'object' THEN a.settle_failure -> 'effect'
                   ELSE jsonb_build_object('governed_action', a.governed_action, 'from', 'the audit chain (the settle failed before the effect was recorded)', 'audit_seq', v_receipt -> 'auditSeq') END
              || jsonb_build_object('resumed', true, 'resumption_id', p_resumption_id);
  UPDATE executive.attention_item_acts SET state = 'acted', effect_ref = left(v_effect_ref, 500), effect = v_effect, settled_at = v_at, resumed_at = v_at, resumed_by = p_actor, action_receipt = v_receipt
   WHERE act_id = p_act_id RETURNING * INTO a;
  INSERT INTO executive.attention_act_resumptions (resumption_id, scope, tenant_id, domain_id, act_id, item_id, from_state, failure, action_receipt, effect_ref, resumed_by, resumed_at, correlation_id)
  VALUES (p_resumption_id, 'DOMAIN', p_tenant, p_domain, a.act_id, a.item_id, v_from, a.settle_failure, v_receipt, a.effect_ref, p_actor, v_at, p_correlation);
  PERFORM executive.attention_event(a.item_id, p_tenant, p_domain, 'item.acted', p_actor,
            jsonb_build_object('act_id', a.act_id, 'action_key', a.action_key, 'governed_action', a.governed_action, 'target_kind', a.target_kind, 'target_id', a.target_id,
                               'rationale', a.rationale, 'effect_ref', a.effect_ref, 'effect', a.effect, 'refusal', NULL, 'gate', 'human_gate', 'resumed', true, 'resumption_id', p_resumption_id), p_correlation);
  PERFORM executive.attention_event(a.item_id, p_tenant, p_domain, 'item.act_resumed', p_actor,
            jsonb_build_object('act_id', a.act_id, 'resumption_id', p_resumption_id, 'from_state', v_from, 'failure', a.settle_failure ->> 'reason', 'action_receipt', v_receipt,
                               're_executed', false, 'note', 'the settle re-run from the committed action''s receipt; the governed action was not performed again'), p_correlation);
  RETURN executive.attention_act_answer_b36(a, false) || jsonb_build_object('resumption', jsonb_build_object('resumption_id', p_resumption_id, 'from_state', v_from, 'action_receipt', v_receipt, 're_executed', false));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.resume_attention_act(uuid,uuid,uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.resume_attention_act(uuid,uuid,uuid,uuid,uuid,uuid) TO eye_commit;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §A2 ACCEPT-PRIORITY — the distinct human act on the queue's transition (o1)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
CREATE TABLE executive.attention_priority_acceptances (
  acceptance_id      uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  item_id            uuid NOT NULL REFERENCES executive.attention_items (item_id),
  accepted_by        uuid NOT NULL,
  evaluation_digest  text NOT NULL CHECK (evaluation_digest ~ '^[0-9a-f]{64}$'),
  consequence        jsonb NOT NULL CHECK (jsonb_typeof(consequence) = 'object'),
  rank_explanation   text,
  note               text,
  context_digest     text,
  accepted_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT xpa_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT xpa_once UNIQUE (item_id)
);
CREATE TRIGGER xpa_append_only BEFORE UPDATE OR DELETE ON executive.attention_priority_acceptances FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE executive.attention_priority_acceptances IS 'B36 (0094 §A2): the accountable person''s acceptance of an item''s rank — the digest of the evaluation accepted, the consequence preview (the response window, the escalation), the context it was accepted under; SIGNED as a queue_transition (executive.signatures); once per item';

-- THE ACCEPTANCE (executive.attention.item.accept_priority; human-gated): the item's accountable person — its owner, or (no owner) a holder
-- of its routed roles; a live item; once. The consequence preview is what accepting commits the person to; the signature (kind
-- queue_transition over the evaluation digest, subject = the acceptance, version 1) is the route's, in the same write.
CREATE OR REPLACE FUNCTION executive.accept_priority(p_acceptance_id uuid, p_item uuid, p_tenant uuid, p_domain uuid, p_note text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, decision, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE x executive.attention_items%ROWTYPE; pol executive.attention_policies%ROWTYPE; r jsonb; v_digest text; v_conseq jsonb; v_ctx text; v_prior record; v_at timestamptz := clock_timestamp();
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.attention.item.accept_priority']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'priority acceptance rejected (actor): accepted by the acting principal' USING ERRCODE = '42501'; END IF;
  IF NOT decision.is_active_human(p_actor, p_tenant) THEN RAISE EXCEPTION 'priority acceptance rejected (actor): an acceptance is a named, active member''s — never an agent''s' USING ERRCODE = '42501'; END IF;
  SELECT * INTO x FROM executive.attention_items i WHERE i.item_id = p_item AND i.tenant_id = p_tenant AND i.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'priority acceptance rejected (unknown_item): item % is not an item of this domain', p_item USING ERRCODE = '23503'; END IF;
  IF NOT ((x.owner_principal_id IS NOT NULL AND x.owner_principal_id = p_actor)
          OR (x.owner_principal_id IS NULL AND cardinality(x.route_roles) > 0 AND executive.holds_role(p_actor, p_tenant, p_domain, x.route_roles))) THEN
    RAISE EXCEPTION 'priority acceptance rejected (accountable): item % is accountable to % — the acting principal is not its accountable person',
      p_item, CASE WHEN x.owner_principal_id IS NOT NULL THEN 'its owner ' || x.owner_principal_id::text ELSE 'a holder of ' || array_to_string(x.route_roles, ', ') END USING ERRCODE = '42501';
  END IF;
  IF x.state NOT IN ('open', 'escalated', 'unrouted', 'acknowledged') THEN
    RAISE EXCEPTION 'priority acceptance rejected (state): item % is %; a priority is accepted on an open, escalated, unrouted or acknowledged item', p_item, x.state USING ERRCODE = '22023';
  END IF;
  SELECT accepted_by, accepted_at INTO v_prior FROM executive.attention_priority_acceptances q WHERE q.item_id = p_item;
  IF FOUND THEN RAISE EXCEPTION 'priority acceptance rejected (state): the priority of item % was accepted by % at %; it is accepted once', p_item, v_prior.accepted_by, v_prior.accepted_at USING ERRCODE = '22023'; END IF;
  IF p_note IS NOT NULL AND length(btrim(p_note)) > 1000 THEN RAISE EXCEPTION 'priority acceptance rejected (note): a note is at most 1000 characters' USING ERRCODE = '22023'; END IF;
  SELECT * INTO pol FROM executive.attention_policies a WHERE a.policy_id = x.policy_id;
  r := CASE WHEN pol.policy_id IS NULL THEN NULL ELSE pol.rules -> 'classes' -> x.signal_class END;
  v_digest := encode(digest(x.evaluation::text, 'sha256'), 'hex');
  v_ctx := executive.current_context(p_actor) ->> 'digest';
  v_conseq := jsonb_build_object(
    'accountable', p_actor, 'state', x.state, 'rank', x.evaluation #>> '{rank,explanation}',
    'response_window', jsonb_build_object('due_at', x.due_at, 'hours_remaining', CASE WHEN x.due_at IS NULL THEN NULL ELSE round((extract(epoch FROM (x.due_at - v_at)) / 3600)::numeric, 2) END,
                                          'ack_within_minutes', r -> 'ack_within_minutes'),
    'escalation', jsonb_build_object('roles', coalesce(r -> 'escalate_to_roles', '[]'::jsonb), 'max_escalations', coalesce(r -> 'max_escalations', '0'::jsonb), 'so_far', x.escalations),
    'commits_to', format('the accountable person answers for item %s within its response window%s: acknowledges, acts on or disposes it before the deadline; an overdue item escalates%s',
                         x.item_id, CASE WHEN x.due_at IS NULL THEN ' (no deadline set)' ELSE ' (due ' || x.due_at::text || ')' END,
                         CASE WHEN jsonb_typeof(r -> 'escalate_to_roles') = 'array' AND jsonb_array_length(r -> 'escalate_to_roles') > 0 THEN ' to ' || (SELECT string_agg(e #>> '{}', ', ') FROM jsonb_array_elements(r -> 'escalate_to_roles') e) ELSE ' to nobody (no escalation roles)' END),
    'policy_version', x.policy_version, 'evaluation_digest', v_digest, 'context_digest', v_ctx);
  INSERT INTO executive.attention_priority_acceptances (acceptance_id, scope, tenant_id, domain_id, item_id, accepted_by, evaluation_digest, consequence, rank_explanation, note, context_digest, accepted_at, correlation_id)
  VALUES (p_acceptance_id, 'DOMAIN', p_tenant, p_domain, p_item, p_actor, v_digest, v_conseq, x.evaluation #>> '{rank,explanation}', nullif(btrim(p_note), ''), v_ctx, v_at, p_correlation);
  PERFORM executive.attention_event(p_item, p_tenant, p_domain, 'item.priority_accepted', p_actor,
            jsonb_build_object('acceptance_id', p_acceptance_id, 'evaluation_digest', v_digest, 'consequence', v_conseq, 'note', nullif(btrim(p_note), ''),
                               'signature', jsonb_build_object('subject_kind', 'queue_transition', 'subject_id', p_acceptance_id, 'subject_version', 1, 'by', 'the route, in this write')), p_correlation);
  RETURN jsonb_build_object('acceptance_id', p_acceptance_id, 'item_id', p_item, 'accepted_by', p_actor, 'accepted_at', v_at, 'evaluation_digest', v_digest, 'consequence', v_conseq,
                            'rank_explanation', x.evaluation #>> '{rank,explanation}', 'note', nullif(btrim(p_note), ''), 'context_digest', v_ctx,
                            'subject', jsonb_build_object('kind', 'queue_transition', 'id', p_acceptance_id, 'version', 1, 'digest', v_digest));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.accept_priority(uuid,uuid,uuid,uuid,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.accept_priority(uuid,uuid,uuid,uuid,text,uuid,uuid) TO eye_commit;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §A3 THE HOLD AND THE ROUTE-TO-AUTHORITY (o2; PR-44-005)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- THE POLICY VALIDATOR — 0090 §A1 (line 519) copied whole; B36: the ONE change — the top-level key `governance` {fairness_floor,
-- staleness_ceiling_hours} admitted and validated (the block at the end).
CREATE OR REPLACE FUNCTION executive.validate_attention_rules(p_rules jsonb) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = executive, identity, pg_catalog, pg_temp AS $$
DECLARE c record; k text; r jsonb; m jsonb; s jsonb; v jsonb;
BEGIN
  IF p_rules IS NULL OR jsonb_typeof(p_rules) <> 'object' THEN RAISE EXCEPTION 'attention policy rejected: the rules are an object {classes, overload?}' USING ERRCODE = '22023'; END IF;
  FOR k IN SELECT jsonb_object_keys(p_rules) LOOP
    IF k NOT IN ('classes', 'overload', /* B36 (0094 §A3) */ 'governance') THEN RAISE EXCEPTION 'attention policy rejected: unknown key % (the rules carry classes and optionally overload and governance)', k USING ERRCODE = '22023'; END IF;
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
          -- B34 (0090): a bare word other than in_app is still refused (the message kept): a synthetic adapter is named in {channels}
          RAISE EXCEPTION 'attention policy rejected: class % notify is in_app or {channels, max_attempts}; % needs a delivery provider (owner decision D6) — the SYNTHETIC email, sms and teams adapters are named in {channels}', c.key, v #>> '{}' USING ERRCODE = '22023';
        END IF;
      ELSIF jsonb_typeof(v) = 'object' THEN
        FOR k IN SELECT jsonb_object_keys(v) LOOP
          IF k NOT IN ('channels', 'max_attempts') THEN RAISE EXCEPTION 'attention policy rejected: class % notify carries the unknown key %', c.key, k USING ERRCODE = '22023'; END IF;
        END LOOP;
        IF jsonb_typeof(v -> 'channels') IS DISTINCT FROM 'array' OR jsonb_array_length(v -> 'channels') = 0 THEN
          RAISE EXCEPTION 'attention policy rejected: class % notify.channels is a non-empty list', c.key USING ERRCODE = '22023';
        END IF;
        -- B34 (0090): the channels are executive.attention_delivery_channels() — in_app, and the SYNTHETIC demo-mailbox, email, sms and teams
        -- (the last three adapters reach LOCAL sinks only; a real provider — and push — is owner decision D6)
        IF EXISTS (SELECT 1 FROM jsonb_array_elements(v -> 'channels') e WHERE jsonb_typeof(e) <> 'string' OR NOT ((e #>> '{}') = ANY (executive.attention_delivery_channels()))) THEN
          RAISE EXCEPTION 'attention policy rejected: class % notify.channels are % (all but in_app SYNTHETIC — local sinks); % needs a delivery provider (owner decision D6)', c.key,
            array_to_string(executive.attention_delivery_channels(), ', '),
            (SELECT string_agg(coalesce(e #>> '{}', e::text), ', ') FROM jsonb_array_elements(v -> 'channels') e WHERE jsonb_typeof(e) <> 'string' OR NOT ((e #>> '{}') = ANY (executive.attention_delivery_channels()))) USING ERRCODE = '22023';
        END IF;
        IF (SELECT count(*) FROM jsonb_array_elements(v -> 'channels')) <> (SELECT count(DISTINCT e #>> '{}') FROM jsonb_array_elements(v -> 'channels') e) THEN
          RAISE EXCEPTION 'attention policy rejected: class % notify.channels names a channel twice', c.key USING ERRCODE = '22023';
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
  -- B36 (0094 §A3; PR-44-005): THE QUEUE'S GOVERNANCE — the ONE change to 0090 §A1 (line 519): governance is {fairness_floor in [0, 1],
  -- staleness_ceiling_hours in [1, 8760]}; the queue evaluation HOLDS the queue and routes it to the domain's decision authority when the
  -- fairness measure falls below the floor or the staleness measure rises above the ceiling (executive.hold_queue).
  IF p_rules ? 'governance' THEN
    v := p_rules -> 'governance';
    IF jsonb_typeof(v) <> 'object' THEN RAISE EXCEPTION 'attention policy rejected: governance is {fairness_floor, staleness_ceiling_hours}' USING ERRCODE = '22023'; END IF;
    FOR k IN SELECT jsonb_object_keys(v) LOOP
      IF k NOT IN ('fairness_floor', 'staleness_ceiling_hours') THEN RAISE EXCEPTION 'attention policy rejected: governance carries the unknown key % (fairness_floor, staleness_ceiling_hours)', k USING ERRCODE = '22023'; END IF;
    END LOOP;
    IF NOT (v ? 'fairness_floor') OR NOT (v ? 'staleness_ceiling_hours') THEN RAISE EXCEPTION 'attention policy rejected: governance names both fairness_floor and staleness_ceiling_hours' USING ERRCODE = '22023'; END IF;
    IF jsonb_typeof(v -> 'fairness_floor') <> 'number' OR (v ->> 'fairness_floor')::numeric < 0 OR (v ->> 'fairness_floor')::numeric > 1 THEN
      RAISE EXCEPTION 'attention policy rejected: governance.fairness_floor is a number in [0, 1] (1 − the ranking-fairness disparity, at or above it)' USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(v -> 'staleness_ceiling_hours') <> 'number' OR (v ->> 'staleness_ceiling_hours')::numeric < 1 OR (v ->> 'staleness_ceiling_hours')::numeric > 8760 THEN
      RAISE EXCEPTION 'attention policy rejected: governance.staleness_ceiling_hours is a number in [1, 8760] (the oldest live item''s hours since its last evaluation, at or below it)' USING ERRCODE = '22023';
    END IF;
  END IF;
END $$;
REVOKE ALL ON FUNCTION executive.validate_attention_rules(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.validate_attention_rules(jsonb) TO eye_commit;

-- THE HOLDS: one held hold per domain; held → released once (the executive, a reason); the governance item bound after the item is routed.
CREATE TABLE executive.attention_queue_holds (
  hold_id             uuid PRIMARY KEY,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  evaluation_id       uuid NOT NULL REFERENCES executive.attention_queue_evaluations (evaluation_id),
  cause               text NOT NULL CHECK (cause IN ('fairness_below_floor', 'staleness_above_ceiling')),
  measure             numeric NOT NULL,
  threshold           numeric NOT NULL,
  measures            jsonb NOT NULL CHECK (jsonb_typeof(measures) = 'object'),
  governance          jsonb NOT NULL CHECK (jsonb_typeof(governance) = 'object'),
  policy_version      int NOT NULL,
  context_digest      text,
  state               text NOT NULL DEFAULT 'held' CHECK (state IN ('held', 'released')),
  held_by             uuid NOT NULL,
  held_at             timestamptz NOT NULL DEFAULT clock_timestamp(),
  governance_item_id  uuid REFERENCES executive.attention_items (item_id),
  released_by         uuid,
  released_at         timestamptz,
  release_reason      text,
  correlation_id      uuid NOT NULL,
  CONSTRAINT xqh_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT xqh_released CHECK ((state = 'released') = (released_at IS NOT NULL) AND (released_at IS NULL) = (released_by IS NULL) AND (released_at IS NULL) = (release_reason IS NULL))
);
CREATE UNIQUE INDEX xqh_one_held ON executive.attention_queue_holds (tenant_id, domain_id) WHERE state = 'held';
CREATE INDEX xqh_domain ON executive.attention_queue_holds (tenant_id, domain_id, held_at);
CREATE OR REPLACE FUNCTION executive.attention_queue_holds_transition() RETURNS trigger
SET search_path = executive, pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'attention queue holds are append-only: DELETE prohibited' USING ERRCODE = '2F002'; END IF;
  IF OLD.state = 'held' AND NEW.state = 'held' AND OLD.governance_item_id IS NULL AND NEW.governance_item_id IS NOT NULL
     AND (to_jsonb(NEW) - 'governance_item_id') = (to_jsonb(OLD) - 'governance_item_id') THEN RETURN NEW; END IF;
  IF OLD.state = 'held' AND NEW.state = 'released' AND NEW.released_at IS NOT NULL
     AND (to_jsonb(NEW) - ARRAY['state', 'released_by', 'released_at', 'release_reason']) = (to_jsonb(OLD) - ARRAY['state', 'released_by', 'released_at', 'release_reason']) THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'attention queue hold % is % and moves once (held → released)', OLD.hold_id, OLD.state USING ERRCODE = '2F002';
END $$ LANGUAGE plpgsql;
CREATE TRIGGER xqh_transition BEFORE UPDATE OR DELETE ON executive.attention_queue_holds FOR EACH ROW EXECUTE FUNCTION executive.attention_queue_holds_transition();
COMMENT ON TABLE executive.attention_queue_holds IS 'B36 (0094 §A3; PR-44-005): the queue HELD by its evaluation — the fairness measure below the policy''s floor or the staleness measure above its ceiling — with the measure, the threshold, the measures, the context digest the evaluation ran under and the governance item routed to the executive; released by the executive with a reason; a held queue serves its items read-only';

/* The active hold of a domain (NULL when none) — an invoker read under the caller's RLS. */
CREATE OR REPLACE FUNCTION executive.attention_queue_hold_active(p_tenant uuid, p_domain uuid) RETURNS uuid
LANGUAGE sql STABLE SET search_path = executive, pg_catalog, pg_temp AS $$
  SELECT h.hold_id FROM executive.attention_queue_holds h WHERE h.tenant_id = p_tenant AND h.domain_id = p_domain AND h.state = 'held' LIMIT 1
$$;
GRANT EXECUTE ON FUNCTION executive.attention_queue_hold_active(uuid, uuid) TO eye_app, eye_commit;

/* THE GOVERNANCE MEASURES over an evaluation's measures: fairness = 1 − the ranking-fairness disparity (abstained when the evaluation's is);
   staleness = the oldest LIVE item's hours since its last (re)evaluation (abstained when no item is live). Reported whole. */
CREATE OR REPLACE FUNCTION executive.attention_queue_governance_measures(p_tenant uuid, p_domain uuid, p_measures jsonb) RETURNS jsonb
STABLE SECURITY DEFINER SET search_path = executive, pg_catalog, pg_temp AS $$
DECLARE v_disp jsonb := p_measures #> '{ranking_fairness,disparity}'; v_fair numeric; v_stale numeric; v_open int; v_oldest uuid;
BEGIN
  IF v_disp IS NOT NULL AND NOT coalesce((v_disp ->> 'abstained')::boolean, true) THEN v_fair := 1 - (v_disp ->> 'value')::numeric; END IF;
  SELECT count(*), max(q.hours), (array_agg(q.item_id ORDER BY q.hours DESC))[1] INTO v_open, v_stale, v_oldest
    FROM (SELECT i.item_id, extract(epoch FROM (clock_timestamp() - coalesce((SELECT max(e.occurred_at) FROM executive.attention_item_events e WHERE e.item_id = i.item_id AND e.event = 'item.reevaluated'), i.created_at))) / 3600 AS hours
            FROM executive.attention_items i WHERE i.tenant_id = p_tenant AND i.domain_id = p_domain AND i.state IN ('open', 'escalated', 'unrouted', 'acknowledged')) q;
  RETURN jsonb_build_object(
    'fairness', jsonb_build_object('value', v_fair, 'abstained', v_fair IS NULL, 'disparity', v_disp,
                                   'basis', '1 − the evaluation''s ranking-fairness disparity (0090 §A5; abstained when the disparity abstains — fewer than two classes at min_sample)'),
    'staleness_hours', jsonb_build_object('value', CASE WHEN v_stale IS NULL THEN NULL ELSE round(v_stale::numeric, 3) END, 'abstained', v_stale IS NULL, 'live_items', v_open, 'oldest_item', v_oldest,
                                          'basis', 'the oldest live item''s hours since its last evaluation (its routing, or the latest item.reevaluated); abstained when no item is live'));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.attention_queue_governance_measures(uuid, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.attention_queue_governance_measures(uuid, uuid, jsonb) TO eye_app, eye_commit;

-- THE ROUTE TO AUTHORITY (under the evaluation's action, called by hold_queue): a queue.governance item for the domain's decision authority
-- (the executive) — material by construction (the queue's governance is never below threshold), consequence C3, due in 24 hours, unrouted
-- when nobody holds executive.
CREATE OR REPLACE FUNCTION executive.route_queue_to_authority(p_item_id uuid, p_tenant uuid, p_domain uuid, p_hold_id uuid, p_actor uuid, p_correlation uuid) RETURNS uuid
SECURITY DEFINER SET search_path = executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE h executive.attention_queue_holds%ROWTYPE; v_state text; v_due timestamptz := clock_timestamp() + interval '24 hours'; v_reason text; v_eval jsonb; v_pol uuid; v_pv int;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.attention.queue.evaluate']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT * INTO h FROM executive.attention_queue_holds x WHERE x.hold_id = p_hold_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'queue hold rejected (unknown_hold): hold % is not a hold of this domain', p_hold_id USING ERRCODE = '23503'; END IF;
  SELECT policy_id, version INTO v_pol, v_pv FROM executive.attention_policies a WHERE a.tenant_id = p_tenant AND a.domain_id = p_domain AND a.state = 'active';
  v_reason := CASE h.cause WHEN 'fairness_below_floor' THEN format('the ranking fairness %s fell below the policy''s floor %s', h.measure, h.threshold)
                          ELSE format('the queue''s staleness %s h rose above the policy''s ceiling %s h', h.measure, h.threshold) END;
  v_state := CASE WHEN executive.role_holders(p_tenant, p_domain, ARRAY['executive']) > 0 THEN 'open' ELSE 'unrouted' END;
  v_eval := jsonb_build_object('outcome', 'material', 'reasons', jsonb_build_array(v_reason, 'the queue is held until the executive releases it; its items are served read-only'),
                               'dimensions', jsonb_build_object('consequence', 'C3', 'confidence', 1, 'hours_to_window', 24), 'thresholds', NULL, 'policy_version', v_pv,
                               'rank', jsonb_build_object('explanation', 'consequence C3, the window in 24 h: the queue''s own governance ranks before its items'),
                               'governance', jsonb_build_object('hold_id', p_hold_id, 'cause', h.cause, 'measure', h.measure, 'threshold', h.threshold, 'evaluation_id', h.evaluation_id));
  INSERT INTO executive.attention_items (item_id, scope, tenant_id, domain_id, signal_class, subject_kind, subject_id, cause_event_id, cause_event_type, title, outcome, state,
                                         owner_principal_id, route_roles, policy_id, policy_version, evaluation, details, due_at, escalations, correlation_id)
  VALUES (p_item_id, 'DOMAIN', p_tenant, p_domain, 'queue.governance', 'queue', p_hold_id, p_hold_id, 'AttentionQueueHeld',
          left(format('Queue held: %s', v_reason), 512), 'material', v_state, NULL, ARRAY['executive'], v_pol, v_pv, v_eval,
          jsonb_build_object('hold_id', p_hold_id, 'cause', h.cause, 'measure', h.measure, 'threshold', h.threshold, 'evaluation_id', h.evaluation_id, 'release', 'executive.attention.queue.release'),
          v_due, 0, p_correlation);
  PERFORM executive.attention_event(p_item_id, p_tenant, p_domain, CASE v_state WHEN 'open' THEN 'item.routed' ELSE 'item.unrouted' END, p_actor,
            jsonb_build_object('outcome', 'material', 'reasons', v_eval -> 'reasons', 'policy_version', v_pv, 'owner', NULL, 'route_roles', to_jsonb(ARRAY['executive']), 'due_at', v_due,
                               'cause_event_id', p_hold_id, 'cause_event_type', 'AttentionQueueHeld', 'unrouted', v_state = 'unrouted', 'hold_id', p_hold_id), p_correlation);
  RETURN p_item_id;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.route_queue_to_authority(uuid,uuid,uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.route_queue_to_authority(uuid,uuid,uuid,uuid,uuid,uuid) TO eye_commit;

-- THE HOLD (executive.attention.queue.evaluate — the evaluation's own action; the route calls it right after evaluate_attention_queue in the
-- same write): the evaluation's measures against the policy's governance; below the floor / above the ceiling → held and routed; nothing
-- when the policy carries no governance (reported, gating nothing — 0090's behaviour kept) or a hold is already active.
CREATE OR REPLACE FUNCTION executive.hold_queue(p_hold_id uuid, p_tenant uuid, p_domain uuid, p_evaluation_id uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE ev executive.attention_queue_evaluations%ROWTYPE; pol executive.attention_policies%ROWTYPE; g jsonb; m jsonb; v_cause text; v_measure numeric; v_threshold numeric; v_active uuid; v_item uuid; v_ctx text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.attention.queue.evaluate']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'queue hold rejected (actor): held by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO ev FROM executive.attention_queue_evaluations e WHERE e.evaluation_id = p_evaluation_id AND e.tenant_id = p_tenant AND e.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'queue hold rejected (unknown_evaluation): evaluation % is not an evaluation of this domain', p_evaluation_id USING ERRCODE = '23503'; END IF;
  SELECT * INTO pol FROM executive.attention_policies a WHERE a.tenant_id = p_tenant AND a.domain_id = p_domain AND a.state = 'active';
  g := pol.rules -> 'governance';
  m := executive.attention_queue_governance_measures(p_tenant, p_domain, ev.measures);
  v_ctx := executive.current_context(p_actor) ->> 'digest';
  IF g IS NULL THEN
    RETURN jsonb_build_object('held', false, 'reason', 'the active policy carries no governance {fairness_floor, staleness_ceiling_hours}: the measures are reported, gating nothing',
                              'measures', m, 'policy_version', pol.version, 'context_digest', v_ctx, 'evaluation_id', p_evaluation_id);
  END IF;
  v_active := executive.attention_queue_hold_active(p_tenant, p_domain);
  IF v_active IS NOT NULL THEN
    RETURN jsonb_build_object('held', false, 'reason', 'the queue is already held', 'hold_id', v_active, 'measures', m, 'governance', g, 'policy_version', pol.version, 'context_digest', v_ctx, 'evaluation_id', p_evaluation_id);
  END IF;
  IF (m #>> '{fairness,value}') IS NOT NULL AND (m #>> '{fairness,value}')::numeric < (g ->> 'fairness_floor')::numeric THEN
    v_cause := 'fairness_below_floor'; v_measure := (m #>> '{fairness,value}')::numeric; v_threshold := (g ->> 'fairness_floor')::numeric;
  ELSIF (m #>> '{staleness_hours,value}') IS NOT NULL AND (m #>> '{staleness_hours,value}')::numeric > (g ->> 'staleness_ceiling_hours')::numeric THEN
    v_cause := 'staleness_above_ceiling'; v_measure := (m #>> '{staleness_hours,value}')::numeric; v_threshold := (g ->> 'staleness_ceiling_hours')::numeric;
  END IF;
  IF v_cause IS NULL THEN
    RETURN jsonb_build_object('held', false, 'reason', 'within policy: the fairness at or above the floor (or abstained) and the staleness at or below the ceiling (or abstained)',
                              'measures', m, 'governance', g, 'policy_version', pol.version, 'context_digest', v_ctx, 'evaluation_id', p_evaluation_id);
  END IF;
  INSERT INTO executive.attention_queue_holds (hold_id, scope, tenant_id, domain_id, evaluation_id, cause, measure, threshold, measures, governance, policy_version, context_digest, held_by, correlation_id)
  VALUES (p_hold_id, 'DOMAIN', p_tenant, p_domain, p_evaluation_id, v_cause, v_measure, v_threshold, m, g, pol.version, v_ctx, p_actor, p_correlation);
  v_item := executive.route_queue_to_authority(gen_random_uuid(), p_tenant, p_domain, p_hold_id, p_actor, p_correlation);
  UPDATE executive.attention_queue_holds SET governance_item_id = v_item WHERE hold_id = p_hold_id;
  RETURN jsonb_build_object('held', true, 'hold_id', p_hold_id, 'cause', v_cause, 'measure', v_measure, 'threshold', v_threshold, 'measures', m, 'governance', g,
                            'policy_version', pol.version, 'governance_item_id', v_item, 'context_digest', v_ctx, 'evaluation_id', p_evaluation_id, 'held_by', p_actor,
                            'read_only', 'the queue serves its items read-only until the executive releases the hold (executive.attention.queue.release)');
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.hold_queue(uuid,uuid,uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.hold_queue(uuid,uuid,uuid,uuid,uuid,uuid) TO eye_commit;

-- THE RECOVERY ROUTES LEDGER (§A4's table, declared here because the release records into it): every run of a route with before / after.
CREATE TABLE executive.attention_recovery_routes (
  route_id        uuid PRIMARY KEY,
  scope           text NOT NULL,
  tenant_id       uuid NOT NULL,
  domain_id       uuid NOT NULL,
  degraded_state  text NOT NULL CHECK (degraded_state IN ('delivery_sink_down', 'tick_stalled', 'policy_invalid', 'evaluation_stale', 'hold')),
  route           text NOT NULL CHECK (route IN ('re-deliver', 're-tick', 're-validate', 're-evaluate', 'release')),
  before_state    jsonb NOT NULL CHECK (jsonb_typeof(before_state) = 'object'),
  after_state     jsonb NOT NULL CHECK (jsonb_typeof(after_state) = 'object'),
  outcome         text NOT NULL CHECK (outcome IN ('recovered', 'requeued', 'exhausted', 'unchanged', 'still_degraded')),
  note            text,
  run_by          uuid NOT NULL,
  run_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id  uuid NOT NULL,
  CONSTRAINT xrr_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX xrr_domain ON executive.attention_recovery_routes (tenant_id, domain_id, degraded_state, run_at);
CREATE TRIGGER xrr_append_only BEFORE UPDATE OR DELETE ON executive.attention_recovery_routes FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE executive.attention_recovery_routes IS 'B36 (0094 §A4; UX-44-005): the runs of the queue''s recovery routes — one per degraded state (re-deliver, re-tick, re-validate, re-evaluate, release) with the state before and after and the outcome; append-only';

-- THE RELEASE (executive.attention.queue.release; human-gated): the executive (or a domain / platform administrator), a reason; held →
-- released; recorded as the hold state's recovery route.
CREATE OR REPLACE FUNCTION executive.release_queue_hold(p_hold_id uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE h executive.attention_queue_holds%ROWTYPE; v_at timestamptz := clock_timestamp(); v_route uuid := gen_random_uuid();
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.attention.queue.release']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'queue hold rejected (actor): released by the acting principal' USING ERRCODE = '42501'; END IF;
  IF NOT executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['executive', 'domain_admin', 'platform_admin']) THEN
    RAISE EXCEPTION 'queue hold rejected (authority): a hold is released by a named human holding executive, domain_admin or platform_admin' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO h FROM executive.attention_queue_holds x WHERE x.hold_id = p_hold_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'queue hold rejected (unknown_hold): hold % is not a hold of this domain', p_hold_id USING ERRCODE = '23503'; END IF;
  IF h.state <> 'held' THEN RAISE EXCEPTION 'queue hold rejected (state): hold % was released by % at %', p_hold_id, h.released_by, h.released_at USING ERRCODE = '22023'; END IF;
  IF coalesce(length(btrim(p_reason)), 0) < 8 THEN RAISE EXCEPTION 'queue hold rejected (reason): a release says why (8+ characters)' USING ERRCODE = '22023'; END IF;
  UPDATE executive.attention_queue_holds SET state = 'released', released_by = p_actor, released_at = v_at, release_reason = left(btrim(p_reason), 1000) WHERE hold_id = p_hold_id RETURNING * INTO h;
  INSERT INTO executive.attention_recovery_routes (route_id, scope, tenant_id, domain_id, degraded_state, route, before_state, after_state, outcome, note, run_by, run_at, correlation_id)
  VALUES (v_route, 'DOMAIN', p_tenant, p_domain, 'hold', 'release',
          jsonb_build_object('hold_id', h.hold_id, 'state', 'held', 'cause', h.cause, 'measure', h.measure, 'threshold', h.threshold, 'held_at', h.held_at, 'held_by', h.held_by),
          jsonb_build_object('hold_id', h.hold_id, 'state', 'released', 'released_at', v_at, 'released_by', p_actor), 'recovered', left(btrim(p_reason), 1000), p_actor, v_at, p_correlation);
  RETURN jsonb_build_object('hold_id', h.hold_id, 'state', h.state, 'cause', h.cause, 'measure', h.measure, 'threshold', h.threshold, 'released_by', p_actor, 'released_at', v_at,
                            'release_reason', h.release_reason, 'governance_item_id', h.governance_item_id, 'recovery_route_id', v_route);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.release_queue_hold(uuid,uuid,uuid,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.release_queue_hold(uuid,uuid,uuid,text,uuid,uuid) TO eye_commit;

-- THE READ-ONLY GUARD: while a hold is active, every HUMAN transition on an item of the domain is refused at the item log (acknowledge,
-- suppress, close, delegate, dispose, act, accept a priority); the tick's own events (routing, escalation, re-evaluation, lapses) and a
-- resumed settle (the record of a committed action) pass.
CREATE OR REPLACE FUNCTION executive.attention_queue_hold_guard() RETURNS trigger
SET search_path = executive, pg_catalog, pg_temp AS $$
DECLARE h executive.attention_queue_holds%ROWTYPE;
BEGIN
  IF NEW.event NOT IN ('item.acknowledged', 'item.suppressed', 'item.closed', 'item.delegated', 'item.delegation_ended', 'item.suppression_requested', 'item.suppression_decided',
                       'item.disposition', 'item.priority_accepted', 'item.acted', 'item.act_refused') THEN RETURN NEW; END IF;
  IF NEW.event = 'item.acted' AND coalesce((NEW.details ->> 'resumed')::boolean, false) THEN RETURN NEW; END IF;
  SELECT * INTO h FROM executive.attention_queue_holds x WHERE x.tenant_id = NEW.tenant_id AND x.domain_id = NEW.domain_id AND x.state = 'held';
  IF FOUND THEN
    RAISE EXCEPTION 'queue transition rejected (held): the queue is held (hold %, %) since %; its items are served read-only until the executive releases the hold (executive.attention.queue.release)',
      h.hold_id, h.cause, h.held_at USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER xae_hold_guard BEFORE INSERT ON executive.attention_item_events FOR EACH ROW EXECUTE FUNCTION executive.attention_queue_hold_guard();

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §A4 THE RECOVERY ROUTES (o3; UX-44-005)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
/* THE DEGRADED STATES, each detected from the ledgers with what it means, its route and the last run of that route:
     delivery_sink_down — a synthetic channel's delivery abandoned in the last 24 hours (the sink refused every attempt)
     tick_stalled       — an active attention agent whose last tick is older than three cadences (or never ticked)
     policy_invalid     — the active policy does not pass today's validator (or none is active)
     evaluation_stale   — no queue evaluation, or the latest older than the policy's staleness ceiling (168 h when the policy names none)
     hold               — a hold is active */
/* The last run of a state's route (NULL when none). */
CREATE OR REPLACE FUNCTION executive.attention_last_recovery_route(p_tenant uuid, p_domain uuid, p_state text) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = executive, pg_catalog, pg_temp AS $$
  SELECT to_jsonb(r) - 'scope' - 'tenant_id' - 'domain_id' FROM executive.attention_recovery_routes r
   WHERE r.tenant_id = p_tenant AND r.domain_id = p_domain AND r.degraded_state = p_state ORDER BY r.run_at DESC LIMIT 1
$$;
REVOKE ALL ON FUNCTION executive.attention_last_recovery_route(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.attention_last_recovery_route(uuid, uuid, text) TO eye_app, eye_commit;

CREATE OR REPLACE FUNCTION executive.attention_degraded_states(p_tenant uuid, p_domain uuid) RETURNS jsonb
STABLE SECURITY DEFINER SET search_path = executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE pol executive.attention_policies%ROWTYPE; v_ab record; v_tick record; v_agent record; v_policy_bad text; v_eval record; v_ceiling numeric; v_hold executive.attention_queue_holds%ROWTYPE;
        v_now timestamptz := clock_timestamp(); v_states jsonb := '[]'::jsonb;
BEGIN
  PERFORM observation.assert_scope(p_tenant, p_domain);
  -- delivery_sink_down
  SELECT count(*) AS n, count(DISTINCT d.channel) AS channels, string_agg(DISTINCT d.channel, ', ') AS names, max(d.attempted_at) AS last_at,
         (array_agg(d.error ORDER BY d.attempted_at DESC))[1] AS last_error, count(*) FILTER (WHERE d.max_attempts >= 5) AS exhausted
    INTO v_ab FROM executive.attention_deliveries d
   WHERE d.tenant_id = p_tenant AND d.domain_id = p_domain AND d.state = 'abandoned' AND d.channel <> 'in_app' AND d.attempted_at >= v_now - interval '24 hours'
     AND NOT EXISTS (SELECT 1 FROM executive.attention_deliveries s WHERE s.item_event_id = d.item_event_id AND s.channel = d.channel AND s.recipient_principal_id = d.recipient_principal_id AND s.attempt > d.attempt);
  v_states := v_states || jsonb_build_object('state', 'delivery_sink_down', 'active', v_ab.n > 0, 'route', 're-deliver',
    'meaning', 'a synthetic channel''s sink (email / sms / teams — local sinks; owner decision D6) refused every attempt of a delivery in the last 24 hours: the recipient was not reached on that channel (in-app placement is unaffected)',
    'detail', jsonb_build_object('abandoned', v_ab.n, 'channels', v_ab.names, 'last_attempt_at', v_ab.last_at, 'last_error', v_ab.last_error, 'exhausted', v_ab.exhausted),
    'route_does', 'the abandoned deliveries are re-queued as a further attempt (the ledger admits five; beyond it the recipient is reached in-app) and the next tick drains them',
    'last_route', executive.attention_last_recovery_route(p_tenant, p_domain, 'delivery_sink_down'));
  -- tick_stalled
  SELECT a.agent_id, a.budgets, a.created_at INTO v_agent FROM executive.agents a WHERE a.tenant_id = p_tenant AND a.domain_id = p_domain AND a.agent_kind = 'attention' AND a.status = 'active' ORDER BY a.created_at DESC LIMIT 1;
  SELECT t.recorded_at, t.cadence_seconds, t.tick_key INTO v_tick FROM executive.attention_ticks t WHERE t.tenant_id = p_tenant AND t.domain_id = p_domain ORDER BY t.recorded_at DESC LIMIT 1;
  v_states := v_states || jsonb_build_object('state', 'tick_stalled',
    'active', v_agent.agent_id IS NOT NULL AND (v_tick.recorded_at IS NULL OR v_tick.recorded_at < v_now - make_interval(secs => 3 * greatest(coalesce(v_tick.cadence_seconds, coalesce((v_agent.budgets ->> 'tick_every_seconds')::int, 60)), 60))),
    'route', 're-tick',
    'meaning', 'the attention timer has not ticked for three cadences: nothing escalates, no delivery is planned or drained, no suppression lapses until it does',
    'detail', jsonb_build_object('agent_id', v_agent.agent_id, 'last_tick_at', v_tick.recorded_at, 'cadence_seconds', coalesce(v_tick.cadence_seconds, (v_agent.budgets ->> 'tick_every_seconds')::int), 'as_of', v_now),
    'route_does', 'one tick is run now under the attention agent''s own session (the timer host''s tickNow), then the schedule is reconciled',
    'last_route', executive.attention_last_recovery_route(p_tenant, p_domain, 'tick_stalled'));
  -- policy_invalid
  SELECT * INTO pol FROM executive.attention_policies a WHERE a.tenant_id = p_tenant AND a.domain_id = p_domain AND a.state = 'active';
  IF pol.policy_id IS NULL THEN v_policy_bad := 'no active attention policy: every signal abstains (deprioritized, visible)';
  ELSE
    BEGIN PERFORM executive.validate_attention_rules(pol.rules); EXCEPTION WHEN OTHERS THEN v_policy_bad := SQLERRM; END;
  END IF;
  v_states := v_states || jsonb_build_object('state', 'policy_invalid', 'active', v_policy_bad IS NOT NULL, 'route', 're-validate',
    'meaning', 'the active policy version does not pass today''s validator (a role it names no longer exists, a class it names is gone) or none is active: new signals are judged under rules the product no longer accepts',
    'detail', jsonb_build_object('policy_version', pol.version, 'defect', v_policy_bad),
    'route_does', 'the validator is re-run on the active version and its verdict recorded; a defect is corrected by PUBLISHING the next version (the executive) — the route never rewrites a version',
    'last_route', executive.attention_last_recovery_route(p_tenant, p_domain, 'policy_invalid'));
  -- evaluation_stale
  v_ceiling := coalesce((pol.rules #>> '{governance,staleness_ceiling_hours}')::numeric, 168);
  SELECT e.evaluation_id, e.evaluated_at, e.verdict INTO v_eval FROM executive.attention_queue_evaluations e WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain ORDER BY e.evaluated_at DESC LIMIT 1;
  v_states := v_states || jsonb_build_object('state', 'evaluation_stale', 'active', v_eval.evaluation_id IS NULL OR v_eval.evaluated_at < v_now - make_interval(hours => v_ceiling::int), 'route', 're-evaluate',
    'meaning', format('the queue has not been evaluated within the staleness ceiling (%s h%s): its precision, recall, fairness and severe-item visibility are unmeasured for the period', v_ceiling, CASE WHEN pol.rules ? 'governance' THEN ', the policy''s' ELSE ', the default' END),
    'detail', jsonb_build_object('last_evaluation_id', v_eval.evaluation_id, 'last_evaluated_at', v_eval.evaluated_at, 'last_verdict', v_eval.verdict, 'ceiling_hours', v_ceiling),
    'route_does', 'the queue is evaluated now by a named human (executive, domain_admin or platform_admin) over the default window; a hold follows when the governance says so',
    'last_route', executive.attention_last_recovery_route(p_tenant, p_domain, 'evaluation_stale'));
  -- hold
  SELECT * INTO v_hold FROM executive.attention_queue_holds h WHERE h.tenant_id = p_tenant AND h.domain_id = p_domain AND h.state = 'held';
  v_states := v_states || jsonb_build_object('state', 'hold', 'active', v_hold.hold_id IS NOT NULL, 'route', 'release',
    'meaning', 'the queue is held by its evaluation (fairness below the floor or staleness above the ceiling): its items are served read-only; the executive holds the governance item',
    'detail', CASE WHEN v_hold.hold_id IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('hold_id', v_hold.hold_id, 'cause', v_hold.cause, 'measure', v_hold.measure, 'threshold', v_hold.threshold, 'held_at', v_hold.held_at, 'governance_item_id', v_hold.governance_item_id) END,
    'route_does', 'the executive releases the hold with a reason (executive.attention.queue.release); the items serve their transitions again',
    'last_route', executive.attention_last_recovery_route(p_tenant, p_domain, 'hold'));
  RETURN jsonb_build_object('as_of', v_now, 'states', v_states, 'degraded', (SELECT count(*) FROM jsonb_array_elements(v_states) s WHERE (s ->> 'active')::boolean));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.attention_degraded_states(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.attention_degraded_states(uuid, uuid) TO eye_app, eye_commit;

-- THE RECOVERY (executive.attention.queue.recover; human-gated): the executive, the executive operator or an administrator runs a state's
-- route. The database side of re-deliver is here (the abandoned deliveries re-queued); re-tick, re-validate and re-evaluate run their
-- mechanics as their own governed acts BEFORE this record (the tick under the agent's session, the validator, the evaluation) and this port
-- reads the state after; the hold's route is the release (its own action). Every run recorded with before / after / outcome.
CREATE OR REPLACE FUNCTION executive.recover_queue(p_route_id uuid, p_tenant uuid, p_domain uuid, p_state text, p_before jsonb, p_note text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_route text; v_after jsonb; v_outcome text; v_states jsonb; v_st jsonb; d record; v_requeued int := 0; v_exhausted int := 0; v_ids jsonb := '[]'::jsonb; v_new uuid; v_at timestamptz := clock_timestamp();
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.attention.queue.recover']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'queue recovery rejected (actor): run by the acting principal' USING ERRCODE = '42501'; END IF;
  IF NOT executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['executive', 'executive_operator', 'domain_admin', 'platform_admin']) THEN
    RAISE EXCEPTION 'queue recovery rejected (authority): a recovery route is run by a named human holding executive, executive_operator, domain_admin or platform_admin' USING ERRCODE = '42501';
  END IF;
  v_route := CASE p_state WHEN 'delivery_sink_down' THEN 're-deliver' WHEN 'tick_stalled' THEN 're-tick' WHEN 'policy_invalid' THEN 're-validate' WHEN 'evaluation_stale' THEN 're-evaluate' WHEN 'hold' THEN 'release' END;
  IF v_route IS NULL THEN RAISE EXCEPTION 'queue recovery rejected (vocabulary): % is not a degraded state (delivery_sink_down, tick_stalled, policy_invalid, evaluation_stale, hold)', coalesce(p_state, '<none>') USING ERRCODE = '22023'; END IF;
  IF p_state = 'hold' THEN RAISE EXCEPTION 'queue recovery rejected (route): the hold''s route is the executive''s release (executive.attention.queue.release), recorded there' USING ERRCODE = '22023'; END IF;
  IF jsonb_typeof(p_before) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'queue recovery rejected (before): the state before the route is an object (the degraded state as read before it ran)' USING ERRCODE = '22023'; END IF;
  IF p_state = 'delivery_sink_down' THEN
    FOR d IN
      SELECT x.* FROM executive.attention_deliveries x
       WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.state = 'abandoned' AND x.channel <> 'in_app' AND x.attempted_at >= v_at - interval '24 hours'
         AND NOT EXISTS (SELECT 1 FROM executive.attention_deliveries s WHERE s.item_event_id = x.item_event_id AND s.channel = x.channel AND s.recipient_principal_id = x.recipient_principal_id AND s.attempt > x.attempt)
       ORDER BY x.attempted_at, x.delivery_id FOR UPDATE
    LOOP
      IF d.max_attempts >= 5 THEN v_exhausted := v_exhausted + 1; CONTINUE; END IF;
      v_new := gen_random_uuid();
      INSERT INTO executive.attention_deliveries (delivery_id, scope, tenant_id, domain_id, item_id, item_event_id, item_event, channel, recipient_principal_id, attempt, max_attempts, state, next_attempt_at, policy_version, synthetic_state, correlation_id)
      VALUES (v_new, 'DOMAIN', p_tenant, p_domain, d.item_id, d.item_event_id, d.item_event, d.channel, d.recipient_principal_id, d.max_attempts + 1, d.max_attempts + 1, 'queued', v_at, d.policy_version, d.synthetic_state, p_correlation);
      PERFORM executive.attention_delivery_event(v_new, d.item_id, d.item_event_id, p_tenant, p_domain, 'delivery.retry_scheduled', p_actor,
                jsonb_build_object('after', d.delivery_id, 'attempt', d.max_attempts + 1, 'max_attempts', d.max_attempts + 1, 'next_attempt_at', v_at, 'recovery_route_id', p_route_id, 'route', 're-deliver'), p_correlation);
      v_requeued := v_requeued + 1; v_ids := v_ids || to_jsonb(v_new);
    END LOOP;
    v_after := jsonb_build_object('requeued', v_requeued, 'exhausted', v_exhausted, 'delivery_ids', v_ids, 'drained_by', 'the next attention tick (step deliveries)');
    v_outcome := CASE WHEN v_requeued > 0 THEN 'requeued' WHEN v_exhausted > 0 THEN 'exhausted' ELSE 'unchanged' END;
  ELSE
    v_states := executive.attention_degraded_states(p_tenant, p_domain);
    SELECT s INTO v_st FROM jsonb_array_elements(v_states -> 'states') s WHERE s ->> 'state' = p_state;
    v_after := jsonb_build_object('active', (v_st ->> 'active')::boolean, 'detail', v_st -> 'detail', 'as_of', v_states -> 'as_of');
    v_outcome := CASE WHEN (v_st ->> 'active')::boolean THEN 'still_degraded' ELSE CASE WHEN coalesce((p_before ->> 'active')::boolean, true) THEN 'recovered' ELSE 'unchanged' END END;
  END IF;
  INSERT INTO executive.attention_recovery_routes (route_id, scope, tenant_id, domain_id, degraded_state, route, before_state, after_state, outcome, note, run_by, run_at, correlation_id)
  VALUES (p_route_id, 'DOMAIN', p_tenant, p_domain, p_state, v_route, p_before, v_after, v_outcome, nullif(left(btrim(p_note), 1000), ''), p_actor, v_at, p_correlation);
  RETURN jsonb_build_object('route_id', p_route_id, 'degraded_state', p_state, 'route', v_route, 'before', p_before, 'after', v_after, 'outcome', v_outcome, 'run_by', p_actor, 'run_at', v_at);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.recover_queue(uuid,uuid,uuid,text,jsonb,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.recover_queue(uuid,uuid,uuid,text,jsonb,text,uuid,uuid) TO eye_commit;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §A5 THE CONTEXT ON THE QUEUE (o4; UX-44-002)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION executive.horizon_hours(p text) RETURNS numeric
LANGUAGE sql IMMUTABLE AS $$ SELECT CASE p WHEN '30d' THEN 720 WHEN '90d' THEN 2160 WHEN '12m' THEN 8760 WHEN '36m' THEN 26280 END::numeric $$;
GRANT EXECUTE ON FUNCTION executive.horizon_hours(text) TO eye_app, eye_commit;

/* AN ITEM'S OBJECTIVES — the strategy objectives its subject rests on, read from what the records say: objective ids the item's details or
   dimensions carry; an exposure's objectives (prediction.exposure_objectives); a package's named objectives; a strategy object itself and
   what it depends on; the queue's governance item serves every objective. Empty = UNKNOWN linkage (the item is served and says so). */
CREATE OR REPLACE FUNCTION executive.attention_item_objectives(x executive.attention_items) RETURNS uuid[]
STABLE SECURITY DEFINER SET search_path = executive, prediction, decision, graph, pg_catalog, pg_temp AS $$
  SELECT coalesce(array_agg(DISTINCT o) FILTER (WHERE o IS NOT NULL), '{}'::uuid[]) FROM (
    SELECT (e #>> '{}')::uuid AS o FROM jsonb_array_elements(CASE WHEN jsonb_typeof(x.details -> 'objective_ids') = 'array' THEN x.details -> 'objective_ids' ELSE '[]'::jsonb END) e WHERE (e #>> '{}') ~ '^[0-9a-f-]{36}$'
    UNION ALL
    SELECT (e #>> '{}')::uuid FROM jsonb_array_elements(CASE WHEN jsonb_typeof(x.evaluation #> '{dimensions,objective_ids}') = 'array' THEN x.evaluation #> '{dimensions,objective_ids}' ELSE '[]'::jsonb END) e WHERE (e #>> '{}') ~ '^[0-9a-f-]{36}$'
    UNION ALL
    SELECT unnest(prediction.exposure_objectives(x.subject_id)) WHERE x.subject_kind = 'exposure'
    UNION ALL
    SELECT (e #>> '{}')::uuid FROM decision.package_versions v, jsonb_array_elements(v.objectives) e
     WHERE x.subject_kind = 'package' AND v.package_id = x.subject_id AND v.version = (SELECT max(w.version) FROM decision.package_versions w WHERE w.package_id = x.subject_id) AND jsonb_typeof(e) = 'string' AND (e #>> '{}') ~ '^[0-9a-f-]{36}$'
    UNION ALL
    SELECT s.strategy_object_id FROM graph.strategy_current s WHERE x.subject_kind = 'strategy_object' AND s.strategy_object_id = x.subject_id AND s.object_type = 'OBJ'
    UNION ALL
    SELECT g.depends_on_id FROM graph.dependencies g WHERE x.subject_kind = 'strategy_object' AND g.dependent_object_id = x.subject_id AND g.depends_on_kind = 'strategy' AND g.state = 'active'
  ) q
$$ LANGUAGE sql;
REVOKE ALL ON FUNCTION executive.attention_item_objectives(executive.attention_items) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.attention_item_objectives(executive.attention_items) TO eye_app, eye_commit;

/* THE CONTEXT ON THE QUEUE: the principal's executive context (§0 executive.current_context) or the reader's default (the whole domain,
   horizon 90d, effective now), the policy in force (version, digest, governance) and the active hold. */
CREATE OR REPLACE FUNCTION executive.queue_context(p_principal uuid, p_tenant uuid, p_domain uuid) RETURNS jsonb
STABLE SECURITY DEFINER SET search_path = executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE c jsonb; pol executive.attention_policies%ROWTYPE; h executive.attention_queue_holds%ROWTYPE;
BEGIN
  PERFORM observation.assert_scope(p_tenant, p_domain);
  c := executive.current_context(p_principal);
  IF c IS NULL THEN
    c := jsonb_build_object('context_id', NULL, 'objective_id', NULL, 'horizon', '90d', 'scenario_id', NULL, 'classification', NULL, 'effective_at', NULL, 'digest', NULL, 'set_at', NULL,
                            'source', 'default', 'note', 'no executive context is set for this principal: the whole domain, horizon 90d, the reader''s own classification ceiling, effective now');
  ELSE
    c := c || jsonb_build_object('source', 'executive.contexts', 'principal_id', p_principal);
  END IF;
  SELECT * INTO pol FROM executive.attention_policies a WHERE a.tenant_id = p_tenant AND a.domain_id = p_domain AND a.state = 'active';
  SELECT * INTO h FROM executive.attention_queue_holds x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.state = 'held';
  RETURN jsonb_build_object(
    'context', c,
    'policy', CASE WHEN pol.policy_id IS NULL THEN jsonb_build_object('policy_id', NULL, 'version', NULL, 'digest', NULL, 'governance', NULL, 'note', 'no active attention policy')
                   ELSE jsonb_build_object('policy_id', pol.policy_id, 'version', pol.version, 'digest', pol.rules_digest, 'governance', pol.rules -> 'governance', 'effective_at', pol.effective_at) END,
    'hold', CASE WHEN h.hold_id IS NULL THEN NULL ELSE jsonb_build_object('hold_id', h.hold_id, 'cause', h.cause, 'measure', h.measure, 'threshold', h.threshold, 'held_at', h.held_at, 'held_by', h.held_by, 'governance_item_id', h.governance_item_id, 'read_only', true) END,
    'as_of', clock_timestamp());
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.queue_context(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.queue_context(uuid, uuid, uuid) TO eye_app, eye_commit;

/* THE QUEUE UNDER A CONTEXT: every item but the closed, ranked by executive.attention_rank_key over the dimensions it was judged on; an item
   outside the context's objective (its linkage known and not naming it), beyond the horizon (its hours to the window past the horizon's) or
   after the effective instant (created later) is FILTERED and COUNTED by reason — never silently dropped; an item whose objective linkage
   is unknown is served and marked so. The ranking names the context digest it ran under. */
CREATE OR REPLACE FUNCTION executive.attention_queue_under(p_tenant uuid, p_domain uuid, p_context jsonb, p_limit int) RETURNS jsonb
STABLE SECURITY DEFINER SET search_path = executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_obj uuid := nullif(p_context ->> 'objective_id', '')::uuid; v_hz numeric := executive.horizon_hours(coalesce(p_context ->> 'horizon', '90d'));
        v_eff timestamptz := nullif(p_context ->> 'effective_at', '')::timestamptz; v_limit int := least(greatest(coalesce(p_limit, 200), 1), 500); v_out jsonb;
BEGIN
  PERFORM observation.assert_scope(p_tenant, p_domain);
  WITH b AS (
    SELECT i.item_id,
           jsonb_build_object('item_id', i.item_id, 'signal_class', i.signal_class, 'subject_kind', i.subject_kind, 'subject_id', i.subject_id, 'title', i.title, 'outcome', i.outcome, 'state', i.state,
                              'owner_principal_id', i.owner_principal_id, 'route_roles', to_jsonb(i.route_roles), 'policy_version', i.policy_version, 'evaluation', i.evaluation, 'details', i.details,
                              'due_at', i.due_at, 'escalations', i.escalations, 'suppressed_until', i.suppressed_until, 'acknowledged_at', i.acknowledged_at, 'acknowledged_by', i.acknowledged_by,
                              'created_at', i.created_at, 'updated_at', i.updated_at, 'objectives', to_jsonb(o.ids),
                              'priority_accepted', (SELECT jsonb_build_object('acceptance_id', q.acceptance_id, 'accepted_by', q.accepted_by, 'accepted_at', q.accepted_at, 'evaluation_digest', q.evaluation_digest)
                                                      FROM executive.attention_priority_acceptances q WHERE q.item_id = i.item_id),
                              'act_in_flight', (SELECT jsonb_build_object('act_id', a.act_id, 'state', a.state, 'action_key', a.action_key) FROM executive.attention_item_acts a WHERE a.item_id = i.item_id AND a.state IN ('launched', 'settle_failed') LIMIT 1)) AS row,
           executive.attention_rank_key(coalesce(i.evaluation -> 'dimensions', '{}'::jsonb)) AS k,
           array_remove(ARRAY[
             CASE WHEN v_obj IS NOT NULL AND i.signal_class <> 'queue.governance' AND cardinality(o.ids) > 0 AND NOT (v_obj = ANY (o.ids)) THEN 'objective' END,
             CASE WHEN (i.evaluation #>> '{dimensions,hours_to_window}') IS NOT NULL AND (i.evaluation #>> '{dimensions,hours_to_window}')::numeric > v_hz THEN 'horizon' END,
             CASE WHEN v_eff IS NOT NULL AND i.created_at > v_eff THEN 'effective_at' END], NULL) AS reasons,
           CASE WHEN i.signal_class = 'queue.governance' THEN 'every objective' WHEN cardinality(o.ids) = 0 THEN 'unknown' WHEN v_obj IS NULL THEN 'known' WHEN v_obj = ANY (o.ids) THEN 'in context' ELSE 'outside context' END AS linkage
      FROM executive.attention_items i CROSS JOIN LATERAL (SELECT executive.attention_item_objectives(i) AS ids) o
     WHERE i.tenant_id = p_tenant AND i.domain_id = p_domain AND i.state <> 'closed'
  ), served AS (SELECT b.*, row_number() OVER (ORDER BY b.k, b.item_id) AS pos FROM b WHERE cardinality(b.reasons) = 0)
  SELECT jsonb_build_object(
    'items', (SELECT coalesce(jsonb_agg(s.row || jsonb_build_object('rank_position', s.pos, 'linkage', s.linkage) ORDER BY s.pos), '[]'::jsonb) FROM served s WHERE s.pos <= v_limit),
    'filtered', (SELECT coalesce(jsonb_agg(jsonb_build_object('item_id', b.item_id, 'title', b.row ->> 'title', 'signal_class', b.row ->> 'signal_class', 'state', b.row ->> 'state', 'filtered_by', to_jsonb(b.reasons), 'linkage', b.linkage) ORDER BY b.k, b.item_id), '[]'::jsonb)
                   FROM b WHERE cardinality(b.reasons) > 0),
    'counts', jsonb_build_object('total', (SELECT count(*) FROM b), 'served', (SELECT count(*) FROM served), 'filtered', (SELECT count(*) FROM b WHERE cardinality(b.reasons) > 0),
                                 'by', jsonb_build_object('objective', (SELECT count(*) FROM b WHERE 'objective' = ANY (b.reasons)), 'horizon', (SELECT count(*) FROM b WHERE 'horizon' = ANY (b.reasons)),
                                                          'effective_at', (SELECT count(*) FROM b WHERE 'effective_at' = ANY (b.reasons))),
                                 'linkage_unknown', (SELECT count(*) FROM b WHERE b.linkage = 'unknown')),
    'ranking', jsonb_build_object('context_digest', p_context ->> 'digest', 'method', 'executive.attention_rank_key over the dimensions each item was judged on (0086 §M2), under the context named here',
                                  'objective_id', v_obj, 'horizon', coalesce(p_context ->> 'horizon', '90d'), 'horizon_hours', v_hz, 'effective_at', v_eff, 'limit', v_limit))
    INTO v_out;
  RETURN v_out;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.attention_queue_under(uuid, uuid, jsonb, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.attention_queue_under(uuid, uuid, jsonb, int) TO eye_app, eye_commit;

/* THE QUEUE READ (/attention/queue): the context, the policy and the hold beside the items served under the principal's context. */
CREATE OR REPLACE FUNCTION executive.attention_queue_read(p_principal uuid, p_tenant uuid, p_domain uuid, p_limit int) RETURNS jsonb
STABLE SECURITY DEFINER SET search_path = executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE c jsonb := executive.queue_context(p_principal, p_tenant, p_domain);
BEGIN
  RETURN c || executive.attention_queue_under(p_tenant, p_domain, c -> 'context', p_limit);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.attention_queue_read(uuid, uuid, uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.attention_queue_read(uuid, uuid, uuid, int) TO eye_app, eye_commit;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §A6 FORUMS (o5; V01-T-028) — governance forums over the same memory
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
ALTER TABLE executive.rooms_current ADD COLUMN forum_context jsonb;
ALTER TABLE executive.rooms_current ADD CONSTRAINT xrm_forum_context CHECK ((kind = 'forum') = (forum_context IS NOT NULL) AND (forum_context IS NULL OR jsonb_typeof(forum_context) = 'object'));
COMMENT ON COLUMN executive.rooms_current.forum_context IS 'B36 (0094 §A6): a forum''s context — {objective_id, horizon, scenario_id, classification, period, digest}; the forum reads the SAME attention items under it (no copy)';

-- CONVENE (executive.forum.convene; human-gated): the executive operator (or the executive, an administrator); named active members; a
-- cadence period (weekly | monthly | quarterly → the room's review cadence 7 | 30 | 90 days); the forum's context validated as §0's set_context
-- validates a context (a live objective or none, a scenario of the domain or none, the horizon, the classification).
CREATE OR REPLACE FUNCTION executive.convene_forum(p_room_id uuid, p_tenant uuid, p_domain uuid, p_title text, p_members uuid[], p_period text, p_context jsonb, p_actor uuid, p_event_id uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, decision, graph, prediction, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_days int; v_next timestamptz; v_obj uuid; v_scn uuid; v_hz text; v_cls text; v_digest text; v_ctx jsonb; m uuid; v_members uuid[] := '{}'; v_at timestamptz := clock_timestamp();
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.forum.convene']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'forum rejected (actor): convened by the acting principal' USING ERRCODE = '42501'; END IF;
  IF NOT decision.is_active_human(p_actor, p_tenant) THEN RAISE EXCEPTION 'forum rejected (actor): a forum is convened by a named, active member — never an agent' USING ERRCODE = '42501'; END IF;
  IF NOT executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['executive_operator', 'executive', 'domain_admin', 'platform_admin']) THEN
    RAISE EXCEPTION 'forum rejected (authority): a forum is convened by the executive operator (or the executive, a domain or platform administrator)' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM executive.rooms_current r WHERE r.room_id = p_room_id) THEN RAISE EXCEPTION 'forum rejected (state): room % already exists', p_room_id USING ERRCODE = '22023'; END IF;
  IF coalesce(length(btrim(p_title)), 0) NOT BETWEEN 2 AND 256 THEN RAISE EXCEPTION 'forum rejected (title): a forum has a title of 2 to 256 characters' USING ERRCODE = '22023'; END IF;
  v_days := CASE p_period WHEN 'weekly' THEN 7 WHEN 'monthly' THEN 30 WHEN 'quarterly' THEN 90 END;
  IF v_days IS NULL THEN RAISE EXCEPTION 'forum rejected (period): the cadence period is weekly, monthly or quarterly' USING ERRCODE = '22023'; END IF;
  IF p_members IS NULL OR cardinality(p_members) = 0 THEN RAISE EXCEPTION 'forum rejected (members): a forum names at least one member' USING ERRCODE = '22023'; END IF;
  FOREACH m IN ARRAY p_members LOOP
    IF m IS NULL OR NOT decision.is_active_human(m, p_tenant) THEN RAISE EXCEPTION 'forum rejected (members): member % is not a named, active human of this tenant', m USING ERRCODE = '22023'; END IF;
    IF NOT (m = ANY (v_members)) THEN v_members := v_members || m; END IF;
  END LOOP;
  IF jsonb_typeof(p_context) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'forum rejected (context): the forum''s context is {objective_id?, horizon, scenario_id?, classification}' USING ERRCODE = '22023'; END IF;
  v_hz := p_context ->> 'horizon'; v_cls := coalesce(p_context ->> 'classification', 'internal');
  IF v_hz IS NULL OR v_hz NOT IN ('30d', '90d', '12m', '36m') THEN RAISE EXCEPTION 'forum rejected (context): horizon is 30d, 90d, 12m or 36m' USING ERRCODE = '22023'; END IF;
  IF v_cls NOT IN ('public', 'internal', 'confidential', 'restricted') THEN RAISE EXCEPTION 'forum rejected (context): classification is public, internal, confidential or restricted' USING ERRCODE = '22023'; END IF;
  v_obj := nullif(p_context ->> 'objective_id', '')::uuid; v_scn := nullif(p_context ->> 'scenario_id', '')::uuid;
  IF v_obj IS NOT NULL AND NOT EXISTS (SELECT 1 FROM graph.strategy_current s WHERE s.strategy_object_id = v_obj AND s.tenant_id = p_tenant AND s.domain_id = p_domain AND s.status NOT IN ('retired', 'withdrawn')) THEN
    RAISE EXCEPTION 'forum rejected (context): objective % is not a live strategy object of this domain', v_obj USING ERRCODE = '22023';
  END IF;
  IF v_scn IS NOT NULL AND NOT EXISTS (SELECT 1 FROM prediction.scenarios_current x WHERE x.scenario_id = v_scn AND x.tenant_id = p_tenant AND x.domain_id = p_domain) THEN
    RAISE EXCEPTION 'forum rejected (context): scenario % is not a scenario of this domain', v_scn USING ERRCODE = '22023';
  END IF;
  v_digest := encode(digest(concat_ws('|', p_tenant::text, p_domain::text, coalesce(v_obj::text, ''), v_hz, coalesce(v_scn::text, ''), v_cls, ''), 'sha256'), 'hex');
  v_ctx := jsonb_build_object('objective_id', v_obj, 'horizon', v_hz, 'scenario_id', v_scn, 'classification', v_cls, 'effective_at', NULL, 'period', p_period, 'digest', v_digest, 'source', 'forum');
  v_next := v_at + make_interval(days => v_days);
  INSERT INTO executive.rooms_current (room_id, scope, tenant_id, domain_id, package_id, title, owner_principal_id, review_every_days, next_review_at, opened_by, correlation_id, kind, subject_id, deadline, forum_context)
  VALUES (p_room_id, 'DOMAIN', p_tenant, p_domain, NULL, btrim(p_title), p_actor, v_days, v_next, p_actor, p_correlation, 'forum', v_obj, NULL, v_ctx);
  INSERT INTO executive.room_members (room_id, principal_id, scope, tenant_id, domain_id, role, added_by) VALUES (p_room_id, p_actor, 'DOMAIN', p_tenant, p_domain, 'owner', p_actor);
  FOREACH m IN ARRAY v_members LOOP
    IF m <> p_actor THEN INSERT INTO executive.room_members (room_id, principal_id, scope, tenant_id, domain_id, role, added_by) VALUES (p_room_id, m, 'DOMAIN', p_tenant, p_domain, 'observer', p_actor); END IF;
  END LOOP;
  INSERT INTO executive.room_events (event_id, scope, tenant_id, domain_id, room_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_room_id, 'room.opened', p_actor,
          jsonb_build_object('kind', 'forum', 'title', btrim(p_title), 'period', p_period, 'review_every_days', v_days, 'next_review_at', v_next, 'members', to_jsonb(v_members), 'forum_context', v_ctx,
                             'memory', 'the forum reads the domain''s attention items under its context — no copy'), p_correlation);
  RETURN jsonb_build_object('room_id', p_room_id, 'kind', 'forum', 'title', btrim(p_title), 'period', p_period, 'review_every_days', v_days, 'next_review_at', v_next, 'owner', p_actor,
                            'members', to_jsonb(v_members), 'forum_context', v_ctx, 'opened_at', v_at);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.convene_forum(uuid,uuid,uuid,text,uuid[],text,jsonb,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.convene_forum(uuid,uuid,uuid,text,uuid[],text,jsonb,uuid,uuid,uuid) TO eye_commit;

/* THE FORUM'S QUEUE: a member reads the SAME items under the forum's context (the queue read with the forum's context in place of the
   principal's) — one item, one acceptance, whichever forum looks. */
CREATE OR REPLACE FUNCTION executive.forum_queue(p_room_id uuid, p_tenant uuid, p_domain uuid, p_principal uuid, p_limit int) RETURNS jsonb
STABLE SECURITY DEFINER SET search_path = executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r executive.rooms_current%ROWTYPE; c jsonb;
BEGIN
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT * INTO r FROM executive.rooms_current x WHERE x.room_id = p_room_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.kind = 'forum';
  IF NOT FOUND THEN RAISE EXCEPTION 'forum rejected (unknown_forum): room % is not a forum of this domain', p_room_id USING ERRCODE = '23503'; END IF;
  IF NOT EXISTS (SELECT 1 FROM executive.room_members m WHERE m.room_id = p_room_id AND m.principal_id = p_principal AND m.removed_at IS NULL) THEN
    RAISE EXCEPTION 'forum rejected (membership): the acting principal is not a member of forum %', p_room_id USING ERRCODE = '42501';
  END IF;
  c := executive.queue_context(p_principal, p_tenant, p_domain);
  RETURN jsonb_build_object('forum', jsonb_build_object('room_id', r.room_id, 'title', r.title, 'period', r.forum_context ->> 'period', 'review_every_days', r.review_every_days, 'next_review_at', r.next_review_at, 'owner', r.owner_principal_id,
                                                        'members', (SELECT coalesce(jsonb_agg(jsonb_build_object('principal_id', m.principal_id, 'role', m.role) ORDER BY m.added_at), '[]'::jsonb) FROM executive.room_members m WHERE m.room_id = r.room_id AND m.removed_at IS NULL)),
                            'context', r.forum_context, 'policy', c -> 'policy', 'hold', c -> 'hold', 'as_of', c -> 'as_of')
         || executive.attention_queue_under(p_tenant, p_domain, r.forum_context, p_limit);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.forum_queue(uuid, uuid, uuid, uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.forum_queue(uuid, uuid, uuid, uuid, int) TO eye_app, eye_commit;

-- RLS and grants for this section's tables (the 0081 loop idiom; the ports write).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['attention_act_resumptions', 'attention_priority_acceptances', 'attention_queue_holds', 'attention_recovery_routes'] LOOP
    EXECUTE format('REVOKE ALL ON executive.%I FROM PUBLIC', t);
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
