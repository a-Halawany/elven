-- 0086 — CP-6 B24 (2026-09-25): THE ATTENTION COMPLETION (F-P6-07) — every B22 deferral delivered.
--
-- One migration in seven sections, the prelude written first by the integrator, the five parts built and proven on their own in
-- parallel worktrees (their harnesses phase6-attention-*-b24), then combined here — no function is re-declared by two sections:
--   §0  the prelude: the item events B24 adds; validate_attention_rules with every new rule key (the old refusal texts kept); the
--       attention_agent role
--   §T  the TIMER HOST (the attention agent's scheduled tick: escalate the overdue — escalate_attention_due re-declared with
--       executive.attention.tick among its authorities) and §D the DELIVERY PORT (deliveries with receipts per attempt, bounded
--       retries, in_app and the SYNTHETIC demo-mailbox; a real provider channel is owner decision D6)
--   §M  the further MATERIALITY dimensions (judged only where a class sets a threshold), the enforced OVERLOAD rule (C3/C4 never
--       held), the transparent RANK, the REBALANCE and the deprioritized view
--   §G  SUPPRESSION APPROVAL, item DELEGATION, DISPOSITIONS and the QUEUE EVALUATION (precision/recall by class, rank stability,
--       severe-item visibility, escalation latency)
--   §K  source-impact MARKERS CONSTRAIN decision-active use (the commitment until a decision authority acknowledges per version;
--       a scenario run on a failed/suspended source)
--   §P  the selected transformation PLAN EXECUTES under the domain's extraction agent (one execution per method and evidence version)
--   §I  the integrator: mark_source_impact follows a changed non-healthy state
-- The interface register stays 50/0/0 (B24 adds no interface). Forward-only; nothing earlier is edited.

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §0 (section `prelude`)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0086 §0 (B24 prelude, written by the integrator before the parts branch) — CP-6 B24: THE ATTENTION COMPLETION (2026-09-25).
-- The shared vocabulary every B24 section uses, declared ONCE so that no two sections re-declare the same function:
--   the attention item events B24 adds; executive.validate_attention_rules re-declared (0083 §4 copied whole, the old refusal
--   texts kept verbatim) with every new rule key — the five further materiality dimensions and `require`, notify channels
--   (in_app and the SYNTHETIC demo-mailbox; a real provider channel refused, naming owner decision D6), suppression approval,
--   the enforced overload rule; the attention agent's role (the timer host's principal).
-- Each later section of 0086 adds only its own tables and functions.

ALTER TABLE executive.attention_item_events DROP CONSTRAINT IF EXISTS attention_item_events_event_check;
ALTER TABLE executive.attention_item_events ADD CONSTRAINT attention_item_events_event_check CHECK (event IN (
  'item.routed', 'item.deprioritized', 'item.unrouted', 'item.escalated', 'item.acknowledged', 'item.suppressed',
  'item.suppression_lapsed', 'item.reevaluated', 'item.closed', 'item.repeated',
  -- B24 (0086)
  'item.delegated', 'item.delegation_ended', 'item.suppression_requested', 'item.suppression_decided',
  'item.overload_deprioritized', 'item.elevated', 'item.disposition'));

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
                   'min_probability', 'min_exposure', 'min_strategic_relevance', 'min_information_value', 'min_irreversibility', 'require') THEN
        RAISE EXCEPTION 'attention policy rejected: class % materiality carries the unknown key %', c.key, k USING ERRCODE = '22023';
      END IF;
    END LOOP;
    -- B24 (0086 §0): the five further dimensions (V00-T-069, V03-T-262) — each judged only when its class sets a threshold
    FOR k IN SELECT unnest(ARRAY['min_probability', 'min_strategic_relevance', 'min_information_value']) LOOP
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

INSERT INTO identity.roles (code, scope, description) VALUES
  ('attention_agent', 'DOMAIN', 'The attention timer agent (B24): escalates overdue attention items, plans and drains their deliveries and rebalances the queue on a schedule — exactly executive.attention.tick')
ON CONFLICT (code) DO NOTHING;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §T/D (section `timer`)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0086 §T + §D (B24 part `timer`, feature F-P6-07) — CP-6 B24: THE TIMER HOST FOR ESCALATION AND THE DELIVERY PORT (2026-09-25).
--
-- THE GAP (0083's own "NOT HERE"): escalation had no timer host — an overdue item escalated only when the attention subscriber
-- happened to receive a delivery or when a person pressed the route; and a routed item reached its people only by their opening
-- the queue (in_app, no receipt): no delivery was planned, attempted, retried or evidenced.
--
-- THE MECHANISM.
-- (§T) THE TIMER HOST. A fourth executive agent kind, `attention` (role attention_agent — the prelude's; method attention-timer@1.0.0;
--   task attention_tick), registered like the other kinds (executive.register_agent re-declared from 0049 with the kind and its one
--   budget key, tick_every_seconds). The scheduler runs one tick per domain on its own queue (exec:{t}:{d}:attention); a tick is an
--   agent run under the agent's OWN session (executive.open_agent_run re-declared from 0046: the task attention_tick, paired with the
--   kind) whose governed write, bound to executive.attention.tick, runs the registered steps in order. executive.attention_ticks keeps
--   one row per (tenant, domain, tick_key) — tick_key = floor(epoch of the scheduled instant / cadence); a duplicate job of the same
--   instant answers `repeated` with the tick that ran (an advisory transaction lock serialises two concurrent duplicates). The
--   escalate step calls executive.escalate_attention_due, re-declared from 0083 with executive.attention.tick among its authorities
--   (the body otherwise verbatim). executive.attention_timers_to_reconcile() lists the domains with an active attention agent under
--   the SCHEDULE capability (the shape of briefings_to_reconcile, 0048). A revoked agent opens no session: the host records the
--   refusal on executive.agent_runs through executive.record_attention_tick_refusal (schedule capability) — never skipped silently;
--   a drifted digest is refused by the run itself (recorded, escalated to the named human).
-- (§D) THE DELIVERY PORT. executive.attention_deliveries (one row per ATTEMPT: queued → sent | delivered | failed | abandoned, the
--   channel's receipt on the row), the append-only executive.attention_delivery_events, and executive.demo_mailbox — the SYNTHETIC
--   local sink of the channel `demo-mailbox` (synthetic_state is always true: it demonstrates the port and closes no real-provider
--   clause; email, SMS, Teams and push need a delivery provider — owner decision D6). executive.plan_attention_deliveries plans, for
--   every item.routed / item.escalated / item.unrouted / item.elevated event with no delivery yet (since the domain's first attention agent), one
--   delivery per channel of the item's OWN policy version (notify 'in_app' → in_app; {channels, max_attempts}) and per recipient —
--   the item's owner and the holders of the event's roles (executive.role_holder_ids); executive.claim_attention_deliveries claims
--   the due ones with FOR UPDATE SKIP LOCKED (the 0082 idiom, bounded); executive.record_delivery_attempt records the outcome — a
--   failure queues the next attempt after 1, 5, 25 … minutes, bounded by max_attempts, the last one ABANDONED. An abandoned
--   delivery never changes the item: it still escalates by its deadline.
--   RECEIPT vs ACKNOWLEDGEMENT: a receipt is the channel's machine proof of placement (on the delivery row); an acknowledgement is
--   the person's act on the item (0083, receipt_not_agreement). Neither sets the other.
--
-- NOT HERE (stated): an email, SMS, Teams or push adapter (owner decision D6 — no provider; the prelude's validator refuses those
-- channels); per-person channel preferences; a digest of several items in one message; the rebalancing step (§M) and the other
-- sections' steps (their parts register them); evaluate_attention, attention_route, suppress_attention_item, may_act_on_item (other
-- parts own them — this section only CALLS may_act_on_item); a change of objects.interface_register (B24 adds no interface).

-- ============================================================
-- §T1 THE AGENT REGISTRY: the fourth kind and its task
-- ============================================================
ALTER TABLE executive.agents DROP CONSTRAINT IF EXISTS agents_agent_kind_check;
ALTER TABLE executive.agents ADD CONSTRAINT agents_agent_kind_check CHECK (agent_kind IN ('decision', 'briefing', 'reporting', 'attention'));
ALTER TABLE executive.agent_runs DROP CONSTRAINT IF EXISTS agent_runs_task_check;
ALTER TABLE executive.agent_runs ADD CONSTRAINT agent_runs_task_check CHECK (task IN ('draft', 'briefing', 'report', 'monitor', 'attention_tick'));

-- 0049 §5 copied whole; B24: the kind `attention` and its one budget key (tick_every_seconds, the timer's cadence).
CREATE OR REPLACE FUNCTION executive.register_agent(
  p_agent_id uuid, p_tenant uuid, p_domain uuid, p_principal uuid, p_kind text, p_version text, p_code_digest text, p_owner uuid, p_escalation uuid,
  p_budgets jsonb, p_stop_conditions jsonb, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, decision, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_kind text; v_status text; sc jsonb; k text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['agent.register']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_kind NOT IN ('decision', 'briefing', 'reporting', 'attention') THEN RAISE EXCEPTION 'agent rejected: kind is decision, briefing, reporting or attention' USING ERRCODE = '22023'; END IF;
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
    IF (sc ->> 'kind') = 'max_items' AND p_kind NOT IN ('decision', 'briefing') THEN
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

-- 0046 copied whole; B24: the task attention_tick, run by an attention agent and by no other kind (the refusal texts keep the
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
  IF p_task NOT IN ('draft', 'briefing', 'report', 'monitor', 'attention_tick') THEN RAISE EXCEPTION 'run rejected: task is draft, briefing, report or monitor (or attention_tick for an attention agent)' USING ERRCODE = '22023'; END IF;
  IF (a.agent_kind = 'decision' AND p_task <> 'draft') OR (a.agent_kind = 'briefing' AND p_task NOT IN ('briefing', 'monitor')) OR (a.agent_kind = 'reporting' AND p_task <> 'report')
     OR (a.agent_kind = 'attention' AND p_task <> 'attention_tick') OR (a.agent_kind <> 'attention' AND p_task = 'attention_tick') THEN
    RAISE EXCEPTION 'run rejected: a % agent does not run the task %', a.agent_kind, p_task USING ERRCODE = '42501';
  END IF;
  INSERT INTO executive.agent_runs (run_id, scope, tenant_id, domain_id, agent_id, principal_id, agent_kind, agent_version, code_digest, task, trigger_kind, trigger_principal_id, trigger_ref, room_id, package_id, budget, correlation_id)
  VALUES (p_run_id, 'DOMAIN', p_tenant, p_domain, p_agent_id, a.principal_id, a.agent_kind, a.agent_version, a.code_digest, p_task, p_trigger_kind, p_trigger_principal, p_trigger_ref, p_room_id, p_package_id, a.budgets, p_correlation);
  RETURN jsonb_build_object('run_id', p_run_id, 'budget', a.budgets, 'stop_conditions', a.stop_conditions, 'escalation_principal_id', a.escalation_principal_id);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.open_agent_run(uuid,uuid,uuid,uuid,text,text,uuid,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.open_agent_run(uuid,uuid,uuid,uuid,text,text,uuid,text,uuid,uuid,uuid) TO eye_commit;

-- ============================================================
-- §T2 THE TICKS — one per (tenant, domain, tick_key); a duplicate answers `repeated`
-- ============================================================
CREATE TABLE executive.attention_ticks (
  tick_id         uuid PRIMARY KEY,
  scope           text NOT NULL,
  tenant_id       uuid NOT NULL,
  domain_id       uuid NOT NULL,
  tick_key        bigint NOT NULL CHECK (tick_key >= 0),
  cadence_seconds int NOT NULL CHECK (cadence_seconds BETWEEN 1 AND 86400),
  scheduled_at    timestamptz NOT NULL,
  agent_id        uuid NOT NULL REFERENCES executive.agents(agent_id),
  run_id          uuid NOT NULL REFERENCES executive.agent_runs(run_id),
  principal_id    uuid NOT NULL,
  result          jsonb NOT NULL CHECK (jsonb_typeof(result) = 'object'),
  recorded_at     timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id  uuid NOT NULL,
  CONSTRAINT xat_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT xat_once UNIQUE (tenant_id, domain_id, tick_key)
);
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON executive.attention_ticks FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE executive.attention_ticks IS 'The attention timer''s ticks (0086 §T): one per (tenant, domain, tick_key = floor(epoch of the scheduled instant / cadence)), written by the attention agent''s governed write (executive.attention.tick) with what each step answered; a duplicate job of the same instant answers repeated.';

-- BEGIN: under the tick's own write — the actor is the domain's active attention agent, under its own session; the key computed from
-- the scheduled instant (the job's) or, when none is given, the database clock; a key already ticked answers `repeated` with that tick.
CREATE OR REPLACE FUNCTION executive.attention_tick_begin(p_tenant uuid, p_domain uuid, p_scheduled_at timestamptz, p_cadence int, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE a executive.agents%ROWTYPE; t executive.attention_ticks%ROWTYPE; v_at timestamptz := coalesce(p_scheduled_at, clock_timestamp()); v_key bigint;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.attention.tick']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT * INTO a FROM executive.agents x WHERE x.principal_id = public.eye_principal() AND x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.agent_kind = 'attention' AND x.status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'attention tick rejected: the tick is run by an active attention agent of this domain, under its own session' USING ERRCODE = '42501'; END IF;
  IF p_cadence IS NULL OR p_cadence < 1 OR p_cadence > 86400 THEN RAISE EXCEPTION 'attention tick rejected: the cadence is a whole number of seconds in [1, 86400]' USING ERRCODE = '22023'; END IF;
  v_key := floor(extract(epoch FROM v_at) / p_cadence)::bigint;
  -- two duplicates of one instant in flight at once: the second waits here until the first commits, then reads its row
  PERFORM pg_advisory_xact_lock(hashtextextended(format('executive.attention_tick:%s:%s:%s', p_tenant, p_domain, v_key), 0));
  SELECT * INTO t FROM executive.attention_ticks x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.tick_key = v_key;
  IF FOUND THEN
    RETURN jsonb_build_object('tick_key', v_key, 'repeated', true, 'scheduled_at', v_at, 'cadence_seconds', p_cadence, 'agent_id', a.agent_id,
                              'prior', jsonb_build_object('tick_id', t.tick_id, 'run_id', t.run_id, 'agent_id', t.agent_id, 'recorded_at', t.recorded_at, 'result', t.result));
  END IF;
  RETURN jsonb_build_object('tick_key', v_key, 'repeated', false, 'scheduled_at', v_at, 'cadence_seconds', p_cadence, 'agent_id', a.agent_id);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.attention_tick_begin(uuid,uuid,timestamptz,int,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.attention_tick_begin(uuid,uuid,timestamptz,int,uuid) TO eye_commit;

-- FINISH: the tick's row with what every step answered, in the same write as the steps (all or nothing).
CREATE OR REPLACE FUNCTION executive.attention_tick_finish(p_tick_id uuid, p_tenant uuid, p_domain uuid, p_tick_key bigint, p_scheduled_at timestamptz, p_cadence int, p_run_id uuid, p_result jsonb, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE a executive.agents%ROWTYPE; r executive.agent_runs%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.attention.tick']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT * INTO a FROM executive.agents x WHERE x.principal_id = public.eye_principal() AND x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.agent_kind = 'attention' AND x.status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'attention tick rejected: the tick is run by an active attention agent of this domain, under its own session' USING ERRCODE = '42501'; END IF;
  SELECT * INTO r FROM executive.agent_runs x WHERE x.run_id = p_run_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND OR r.agent_id <> a.agent_id OR r.task <> 'attention_tick' OR r.outcome <> 'running' THEN
    RAISE EXCEPTION 'attention tick rejected: run % is not this agent''s running attention tick', p_run_id USING ERRCODE = '22023';
  END IF;
  IF p_result IS NULL OR jsonb_typeof(p_result) <> 'object' THEN RAISE EXCEPTION 'attention tick rejected: the result is an object of the steps'' answers' USING ERRCODE = '22023'; END IF;
  INSERT INTO executive.attention_ticks (tick_id, scope, tenant_id, domain_id, tick_key, cadence_seconds, scheduled_at, agent_id, run_id, principal_id, result, correlation_id)
  VALUES (p_tick_id, 'DOMAIN', p_tenant, p_domain, p_tick_key, p_cadence, p_scheduled_at, a.agent_id, p_run_id, a.principal_id, p_result, p_correlation);
  RETURN jsonb_build_object('tick_id', p_tick_id, 'tick_key', p_tick_key, 'run_id', p_run_id, 'agent_id', a.agent_id);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.attention_tick_finish(uuid,uuid,uuid,bigint,timestamptz,int,uuid,jsonb,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.attention_tick_finish(uuid,uuid,uuid,bigint,timestamptz,int,uuid,jsonb,uuid) TO eye_commit;

-- 0083 §5 ESCALATE-DUE copied whole; B24 (0086 §T): executive.attention.tick among its authorities — the timer host drives it on the
-- cadence (the attention subscriber at every delivery and a person's route on demand, as before). The body is otherwise verbatim.
CREATE OR REPLACE FUNCTION executive.escalate_attention_due(p_tenant uuid, p_domain uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE x executive.attention_items%ROWTYPE; r jsonb; v_at timestamptz := clock_timestamp(); v_esc jsonb := '[]'::jsonb; v_lapsed jsonb := '[]'::jsonb; v_exhausted jsonb := '[]'::jsonb; v_roles text[];
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.attention.escalate', 'executive.attention.subscription.apply', 'executive.attention.tick']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  FOR x IN SELECT * FROM executive.attention_items i WHERE i.tenant_id = p_tenant AND i.domain_id = p_domain AND i.state = 'suppressed' AND i.suppressed_until <= v_at ORDER BY i.suppressed_until LIMIT 200 FOR UPDATE LOOP
    SELECT a.rules #> ARRAY['classes', x.signal_class] INTO r FROM executive.attention_policies a WHERE a.policy_id = x.policy_id;
    UPDATE executive.attention_items SET state = CASE WHEN x.acknowledged_at IS NULL THEN 'open' ELSE 'acknowledged' END, suppressed_until = NULL,
           due_at = CASE WHEN x.acknowledged_at IS NULL THEN v_at + make_interval(mins => coalesce((r ->> 'ack_within_minutes')::int, 60)) ELSE x.due_at END, updated_at = v_at
     WHERE item_id = x.item_id;
    PERFORM executive.attention_event(x.item_id, p_tenant, p_domain, 'item.suppression_lapsed', p_actor, jsonb_build_object('until', x.suppressed_until), p_correlation);
    v_lapsed := v_lapsed || to_jsonb(x.item_id);
  END LOOP;
  FOR x IN SELECT * FROM executive.attention_items i WHERE i.tenant_id = p_tenant AND i.domain_id = p_domain AND i.state IN ('open', 'escalated') AND i.due_at IS NOT NULL AND i.due_at <= v_at ORDER BY i.due_at LIMIT 200 FOR UPDATE LOOP
    SELECT a.rules #> ARRAY['classes', x.signal_class] INTO r FROM executive.attention_policies a WHERE a.policy_id = x.policy_id;
    IF x.escalations >= coalesce((r ->> 'max_escalations')::int, 0) THEN
      -- the escalation chain is exhausted: the item stays overdue and visible; nobody is paged again (recorded once per deadline)
      IF NOT EXISTS (SELECT 1 FROM executive.attention_item_events e WHERE e.item_id = x.item_id AND e.event = 'item.escalated' AND (e.details ->> 'exhausted')::boolean AND (e.details ->> 'due_at')::timestamptz = x.due_at) THEN
        PERFORM executive.attention_event(x.item_id, p_tenant, p_domain, 'item.escalated', p_actor, jsonb_build_object('exhausted', true, 'due_at', x.due_at, 'escalations', x.escalations), p_correlation);
        v_exhausted := v_exhausted || to_jsonb(x.item_id);
      END IF;
      CONTINUE;
    END IF;
    SELECT ARRAY(SELECT DISTINCT unnest(x.route_roles || ARRAY(SELECT jsonb_array_elements_text(coalesce(r -> 'escalate_to_roles', '[]'::jsonb)))) ORDER BY 1) INTO v_roles;
    UPDATE executive.attention_items SET state = 'escalated', escalations = x.escalations + 1, route_roles = v_roles,
           due_at = v_at + make_interval(mins => coalesce((r ->> 'ack_within_minutes')::int, 60)), updated_at = v_at WHERE item_id = x.item_id;
    PERFORM executive.attention_event(x.item_id, p_tenant, p_domain, 'item.escalated', p_actor,
              jsonb_build_object('escalation', x.escalations + 1, 'missed_deadline', x.due_at, 'route_roles', to_jsonb(v_roles), 'policy_version', x.policy_version), p_correlation);
    v_esc := v_esc || to_jsonb(x.item_id);
  END LOOP;
  RETURN jsonb_build_object('escalated', v_esc, 'lapsed', v_lapsed, 'exhausted', v_exhausted, 'at', v_at);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.escalate_attention_due(uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.escalate_attention_due(uuid,uuid,uuid,uuid) TO eye_commit;

-- RECONCILE: every domain with an active attention agent (the newest registration) and its cadence — read under the SCHEDULE
-- capability, which carries no tenant (the shape of executive.briefings_to_reconcile, 0048).
CREATE OR REPLACE FUNCTION executive.attention_timers_to_reconcile()
RETURNS TABLE (tenant_id text, domain_id text, agent_id text, cadence_seconds int)
SECURITY DEFINER SET search_path = executive, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM ctx.assert_capability('schedule', 'scheduler', 'observation.schedule.reconcile');
  RETURN QUERY
    SELECT DISTINCT ON (a.tenant_id, a.domain_id) a.tenant_id::text, a.domain_id::text, a.agent_id::text, coalesce((a.budgets ->> 'tick_every_seconds')::int, 300)
      FROM executive.agents a
     WHERE a.agent_kind = 'attention' AND a.status = 'active'
     ORDER BY a.tenant_id, a.domain_id, a.created_at DESC;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.attention_timers_to_reconcile() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.attention_timers_to_reconcile() TO eye_commit;

-- A TICK REFUSED BEFORE ANY SESSION (a revoked agent, an inactive principal): the timer host records it on the agent's run ledger as a
-- closed, refused run of the scheduler — never a silent skip — escalated to the agent's named human; the answer names the domain's
-- newest ACTIVE attention agent (if any), so the host re-points the timer instead of stopping a successor's.
CREATE OR REPLACE FUNCTION executive.record_attention_tick_refusal(p_run_id uuid, p_tenant uuid, p_domain uuid, p_agent_id uuid, p_trigger_ref text, p_reason text, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, ctx, public, pg_catalog, pg_temp AS $$
DECLARE a executive.agents%ROWTYPE; n executive.agents%ROWTYPE;
BEGIN
  PERFORM ctx.assert_capability('schedule', 'scheduler', 'observation.schedule.reconcile');
  SELECT * INTO a FROM executive.agents x WHERE x.agent_id = p_agent_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'attention tick rejected: no such agent % in this domain', p_agent_id USING ERRCODE = '23503'; END IF;
  IF a.agent_kind <> 'attention' THEN RAISE EXCEPTION 'attention tick rejected: agent % is a % agent; the timer runs an attention agent', p_agent_id, a.agent_kind USING ERRCODE = '22023'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN RAISE EXCEPTION 'attention tick rejected: a refusal carries its reason (at least 8 characters)' USING ERRCODE = '22023'; END IF;
  INSERT INTO executive.agent_runs (run_id, scope, tenant_id, domain_id, agent_id, principal_id, agent_kind, agent_version, code_digest, task, trigger_kind, trigger_principal_id, trigger_ref,
                                    budget, outcome, stop_reason, escalated_to, refusals, outputs, finished_at, correlation_id)
  VALUES (p_run_id, 'DOMAIN', p_tenant, p_domain, a.agent_id, a.principal_id, a.agent_kind, a.agent_version, a.code_digest, 'attention_tick', 'scheduler', NULL, p_trigger_ref,
          a.budgets, 'refused', btrim(p_reason), a.escalation_principal_id,
          jsonb_build_array(jsonb_build_object('action', 'agent.run', 'code', 'EYE-AUT-001', 'reason', btrim(p_reason), 'at', clock_timestamp())),
          jsonb_build_object('refused_before_session', true, 'agent_status', a.status, 'agent', jsonb_build_object('agent_id', a.agent_id, 'agent_kind', a.agent_kind, 'agent_version', a.agent_version, 'code_digest', a.code_digest, 'principal_id', a.principal_id)),
          clock_timestamp(), p_correlation);
  SELECT * INTO n FROM executive.agents x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.agent_kind = 'attention' AND x.status = 'active' ORDER BY x.created_at DESC LIMIT 1;
  RETURN jsonb_build_object('run_id', p_run_id, 'outcome', 'refused', 'escalated_to', a.escalation_principal_id, 'agent_status', a.status,
                            'active_agent_id', n.agent_id, 'active_cadence_seconds', CASE WHEN n.agent_id IS NULL THEN NULL ELSE coalesce((n.budgets ->> 'tick_every_seconds')::int, 300) END);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.record_attention_tick_refusal(uuid,uuid,uuid,uuid,text,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.record_attention_tick_refusal(uuid,uuid,uuid,uuid,text,text,uuid) TO eye_commit;

-- ============================================================
-- §D1 THE DELIVERIES, THEIR LOG AND THE SYNTHETIC MAILBOX
-- ============================================================
CREATE TABLE executive.attention_deliveries (
  delivery_id            uuid PRIMARY KEY,
  scope                  text NOT NULL,
  tenant_id              uuid NOT NULL,
  domain_id              uuid NOT NULL,
  item_id                uuid NOT NULL REFERENCES executive.attention_items(item_id),
  item_event_id          uuid NOT NULL REFERENCES executive.attention_item_events(event_id),
  item_event             text NOT NULL CHECK (item_event IN ('item.routed', 'item.escalated', 'item.unrouted', 'item.elevated')),
  channel                text NOT NULL CHECK (channel IN ('in_app', 'demo-mailbox')),
  recipient_principal_id uuid NOT NULL,
  attempt                int NOT NULL CHECK (attempt BETWEEN 1 AND 5),
  max_attempts           int NOT NULL CHECK (max_attempts BETWEEN 1 AND 5),
  state                  text NOT NULL CHECK (state IN ('queued', 'sent', 'delivered', 'failed', 'abandoned')),
  receipt                jsonb,
  provider_ref           text,
  error                  text,
  next_attempt_at        timestamptz,
  attempted_at           timestamptz,
  policy_version         int,
  synthetic_state        boolean NOT NULL,
  created_at             timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at             timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id         uuid NOT NULL,
  CONSTRAINT xad_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT xad_once UNIQUE (item_event_id, channel, recipient_principal_id, attempt),
  CONSTRAINT xad_attempt_bound CHECK (attempt <= max_attempts),
  CONSTRAINT xad_synthetic CHECK (synthetic_state = (channel = 'demo-mailbox')),
  CONSTRAINT xad_queued CHECK ((state = 'queued') = (next_attempt_at IS NOT NULL) AND (state = 'queued') = (attempted_at IS NULL)),
  CONSTRAINT xad_placed CHECK (state NOT IN ('sent', 'delivered') OR jsonb_typeof(receipt) = 'object')
);
CREATE INDEX xad_due ON executive.attention_deliveries (tenant_id, domain_id, state, next_attempt_at);
CREATE INDEX xad_item ON executive.attention_deliveries (item_id, created_at);
COMMENT ON TABLE executive.attention_deliveries IS 'The attention delivery port (0086 §D): one row per ATTEMPT of one item event on one channel to one recipient; queued → sent | delivered (the channel''s receipt — machine proof of placement) | failed (a successor attempt queued after 1, 5, 25 … minutes) | abandoned (the last attempt failed). A receipt is not an acknowledgement (the person''s act on the item); neither sets the other. demo-mailbox is SYNTHETIC.';

-- A delivery changes only by its attempt: queued → sent | delivered | failed | abandoned; sent → delivered | failed. While queued, only
-- the instant of its attempt moves. Never deleted.
CREATE OR REPLACE FUNCTION executive.attention_deliveries_transition() RETURNS trigger
SET search_path = executive, pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'attention deliveries are append-only: DELETE prohibited' USING ERRCODE = '2F002'; END IF;
  IF NEW.delivery_id <> OLD.delivery_id OR NEW.tenant_id <> OLD.tenant_id OR NEW.domain_id <> OLD.domain_id OR NEW.item_id <> OLD.item_id OR NEW.item_event_id <> OLD.item_event_id
     OR NEW.item_event <> OLD.item_event OR NEW.channel <> OLD.channel OR NEW.recipient_principal_id <> OLD.recipient_principal_id OR NEW.attempt <> OLD.attempt
     OR NEW.max_attempts <> OLD.max_attempts OR NEW.policy_version IS DISTINCT FROM OLD.policy_version OR NEW.created_at <> OLD.created_at OR NEW.correlation_id <> OLD.correlation_id THEN
    RAISE EXCEPTION 'attention delivery % changes only by its attempt', OLD.delivery_id USING ERRCODE = '2F002';
  END IF;
  IF OLD.state = 'queued' AND NEW.state = 'queued' THEN
    IF NEW.receipt IS DISTINCT FROM OLD.receipt OR NEW.provider_ref IS DISTINCT FROM OLD.provider_ref OR NEW.error IS DISTINCT FROM OLD.error THEN
      RAISE EXCEPTION 'attention delivery % is queued: only the instant of its attempt moves', OLD.delivery_id USING ERRCODE = '2F002';
    END IF;
    RETURN NEW;
  END IF;
  IF (OLD.state = 'queued' AND NEW.state IN ('sent', 'delivered', 'failed', 'abandoned')) OR (OLD.state = 'sent' AND NEW.state IN ('delivered', 'failed')) THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'attention delivery % is % and immutable', OLD.delivery_id, OLD.state USING ERRCODE = '2F002';
END $$ LANGUAGE plpgsql;
CREATE TRIGGER xad_transition BEFORE UPDATE OR DELETE ON executive.attention_deliveries FOR EACH ROW EXECUTE FUNCTION executive.attention_deliveries_transition();

CREATE TABLE executive.attention_delivery_events (
  event_id           uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  delivery_id        uuid REFERENCES executive.attention_deliveries(delivery_id),
  item_id            uuid NOT NULL REFERENCES executive.attention_items(item_id),
  item_event_id      uuid NOT NULL REFERENCES executive.attention_item_events(event_id),
  event              text NOT NULL CHECK (event IN ('delivery.planned', 'delivery.not_planned', 'delivery.sent', 'delivery.delivered', 'delivery.failed', 'delivery.retry_scheduled', 'delivery.abandoned')),
  actor_principal_id uuid NOT NULL,
  details            jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT xade_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT xade_delivery CHECK ((event = 'delivery.not_planned') = (delivery_id IS NULL))
);
CREATE INDEX xade_item ON executive.attention_delivery_events (item_id, occurred_at);
-- the planner's scan: a domain's routing events since its first attention agent, in order (0083 indexed the log by item only)
CREATE INDEX xae_delivery_scan ON executive.attention_item_events (tenant_id, domain_id, occurred_at) WHERE event IN ('item.routed', 'item.escalated', 'item.unrouted', 'item.elevated');
CREATE INDEX xade_item_event ON executive.attention_delivery_events (item_event_id, event);
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON executive.attention_delivery_events FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

CREATE TABLE executive.demo_mailbox (
  message_id             uuid PRIMARY KEY,
  scope                  text NOT NULL,
  tenant_id              uuid NOT NULL,
  domain_id              uuid NOT NULL,
  delivery_id            uuid NOT NULL UNIQUE REFERENCES executive.attention_deliveries(delivery_id),
  recipient_principal_id uuid NOT NULL,
  subject                text NOT NULL CHECK (length(btrim(subject)) BETWEEN 1 AND 300),
  body_digest            text NOT NULL CHECK (body_digest ~ '^[0-9a-f]{64}$'),
  delivered_at           timestamptz NOT NULL DEFAULT clock_timestamp(),
  synthetic_state        boolean NOT NULL DEFAULT true CHECK (synthetic_state),
  correlation_id         uuid NOT NULL,
  CONSTRAINT xdm_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX xdm_recipient ON executive.demo_mailbox (tenant_id, domain_id, recipient_principal_id, delivered_at);
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON executive.demo_mailbox FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE executive.demo_mailbox IS 'The SYNTHETIC local sink of the demo-mailbox channel (0086 §D): a placed message''s subject and body digest per recipient. synthetic_state is always true — it demonstrates the delivery port and closes no real-provider clause (email, SMS, Teams and push need a delivery provider: owner decision D6).';

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['attention_ticks', 'attention_deliveries', 'attention_delivery_events', 'demo_mailbox'] LOOP
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

-- ============================================================
-- §D2 THE PORTS — plan, claim, place (the synthetic sink, the in-app placement), record
-- ============================================================
-- WHO holds the roles: the active humans of the tenant bound to one of them at the domain (DOMAIN or TENANT binding) — the ids that
-- executive.role_holders (0083) counts.
CREATE OR REPLACE FUNCTION executive.role_holder_ids(p_tenant uuid, p_domain uuid, p_roles text[]) RETURNS SETOF uuid
STABLE SECURITY DEFINER SET search_path = identity, pg_catalog, pg_temp AS $$
  SELECT DISTINCT b.principal_id FROM identity.role_bindings b JOIN identity.principals p ON p.id = b.principal_id
   WHERE p.kind = 'human' AND p.status = 'active' AND b.revoked_at IS NULL AND b.role_code = ANY (p_roles)
     AND b.tenant_id = p_tenant AND (b.scope = 'TENANT' OR (b.scope = 'DOMAIN' AND b.domain_id = p_domain));
$$ LANGUAGE sql;
REVOKE ALL ON FUNCTION executive.role_holder_ids(uuid, uuid, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.role_holder_ids(uuid, uuid, text[]) TO eye_app, eye_commit;

-- A class's notify rule as channels and a bound: 'in_app' (or none) → in_app, 3 attempts; {channels, max_attempts?} as the prelude's
-- validator admits it (in_app and the SYNTHETIC demo-mailbox; 1..5 attempts, 3 when unnamed).
CREATE OR REPLACE FUNCTION executive.attention_notify_plan(p_notify jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_notify IS NULL OR jsonb_typeof(p_notify) = 'string' THEN jsonb_build_object('channels', jsonb_build_array('in_app'), 'max_attempts', 3)
    ELSE jsonb_build_object('channels', coalesce(p_notify -> 'channels', jsonb_build_array('in_app')), 'max_attempts', coalesce((p_notify ->> 'max_attempts')::int, 3))
  END;
$$;
GRANT EXECUTE ON FUNCTION executive.attention_notify_plan(jsonb) TO eye_app, eye_commit;

CREATE OR REPLACE FUNCTION executive.attention_delivery_event(p_delivery uuid, p_item uuid, p_item_event uuid, p_tenant uuid, p_domain uuid, p_event text, p_actor uuid, p_details jsonb, p_correlation uuid) RETURNS void
SET search_path = executive, pg_catalog, pg_temp AS $$
  INSERT INTO executive.attention_delivery_events (event_id, scope, tenant_id, domain_id, delivery_id, item_id, item_event_id, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_delivery, p_item, p_item_event, p_event, p_actor, coalesce(p_details, '{}'::jsonb), p_correlation);
$$ LANGUAGE sql;
REVOKE ALL ON FUNCTION executive.attention_delivery_event(uuid,uuid,uuid,uuid,uuid,text,uuid,jsonb,uuid) FROM PUBLIC;

-- PLAN: every item.routed / item.escalated / item.unrouted / item.elevated event of the domain (since its first attention agent was registered — the
-- timer does not page the history it found) with no delivery and no recorded non-plan yet, bounded (≤ 200 per call): one delivery per
-- channel of the item's OWN policy version and per recipient — the owner (an active human) and the holders of the event's roles (an
-- unrouted item's, or one elevated unrouted: its routed roles and its class's escalation roles). An item ELEVATED from the overload
-- hold (§M6) reaches its people like a routing (found by the B24 act: the rebalance's item.elevated was planned for nobody). An exhausted escalation pages nobody (0083) and plans nothing.
-- A closed item, or an event nobody can receive, is recorded delivery.not_planned with the reason (visible, never re-planned).
CREATE OR REPLACE FUNCTION executive.plan_attention_deliveries(p_tenant uuid, p_domain uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE e record; v_since timestamptz; v_rule jsonb; v_plan jsonb; v_roles text[]; v_recipients uuid[]; v_ch text; v_rcpt uuid; v_id uuid;
        v_planned int := 0; v_events int := 0; v_not jsonb := '[]'::jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.attention.tick']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT min(a.created_at) INTO v_since FROM executive.agents a WHERE a.tenant_id = p_tenant AND a.domain_id = p_domain AND a.agent_kind = 'attention';
  IF v_since IS NULL THEN RETURN jsonb_build_object('planned', 0, 'events', 0, 'not_planned', '[]'::jsonb, 'note', 'no attention agent is registered in this domain'); END IF;
  FOR e IN
    SELECT ev.event_id, ev.event, ev.details, ev.occurred_at, i.item_id, i.state AS item_state, i.signal_class, i.owner_principal_id, i.route_roles AS item_roles, i.policy_id, i.policy_version
      FROM executive.attention_item_events ev JOIN executive.attention_items i ON i.item_id = ev.item_id
     WHERE ev.tenant_id = p_tenant AND ev.domain_id = p_domain AND ev.event IN ('item.routed', 'item.escalated', 'item.unrouted', 'item.elevated') AND ev.occurred_at >= v_since
       AND NOT coalesce((ev.details ->> 'exhausted')::boolean, false)
       AND NOT EXISTS (SELECT 1 FROM executive.attention_deliveries d WHERE d.item_event_id = ev.event_id)
       AND NOT EXISTS (SELECT 1 FROM executive.attention_delivery_events x WHERE x.item_event_id = ev.event_id AND x.event = 'delivery.not_planned')
     ORDER BY ev.occurred_at, ev.event_id
     LIMIT 200
  LOOP
    IF e.item_state = 'closed' THEN
      PERFORM executive.attention_delivery_event(NULL, e.item_id, e.event_id, p_tenant, p_domain, 'delivery.not_planned', p_actor, jsonb_build_object('reason', 'item_closed', 'item_event', e.event), p_correlation);
      v_not := v_not || jsonb_build_object('item_event_id', e.event_id, 'reason', 'item_closed');
      CONTINUE;
    END IF;
    SELECT a.rules #> ARRAY['classes', e.signal_class] INTO v_rule FROM executive.attention_policies a WHERE a.policy_id = e.policy_id;
    v_plan := executive.attention_notify_plan(v_rule -> 'notify');
    SELECT coalesce(array_agg(DISTINCT x), '{}') INTO v_roles FROM (
      SELECT jsonb_array_elements_text(CASE WHEN jsonb_typeof(e.details -> 'route_roles') = 'array' THEN e.details -> 'route_roles' ELSE to_jsonb(e.item_roles) END) x
      UNION ALL SELECT jsonb_array_elements_text(CASE WHEN e.event = 'item.unrouted' OR (e.event = 'item.elevated' AND coalesce((e.details ->> 'unrouted')::boolean, false)) THEN coalesce(v_rule -> 'escalate_to_roles', '[]'::jsonb) ELSE '[]'::jsonb END)) q;
    SELECT coalesce(array_agg(DISTINCT r ORDER BY r), '{}') INTO v_recipients FROM (
      SELECT e.owner_principal_id AS r WHERE e.owner_principal_id IS NOT NULL
         AND EXISTS (SELECT 1 FROM identity.principals p WHERE p.id = e.owner_principal_id AND p.kind = 'human' AND p.status = 'active')
      UNION SELECT h FROM executive.role_holder_ids(p_tenant, p_domain, v_roles) h) q;
    IF cardinality(v_recipients) = 0 THEN
      PERFORM executive.attention_delivery_event(NULL, e.item_id, e.event_id, p_tenant, p_domain, 'delivery.not_planned', p_actor,
                jsonb_build_object('reason', 'no_recipient', 'item_event', e.event, 'roles', to_jsonb(v_roles), 'owner', e.owner_principal_id), p_correlation);
      v_not := v_not || jsonb_build_object('item_event_id', e.event_id, 'reason', 'no_recipient');
      CONTINUE;
    END IF;
    FOR v_ch IN SELECT jsonb_array_elements_text(v_plan -> 'channels') LOOP
      FOREACH v_rcpt IN ARRAY v_recipients LOOP
        v_id := gen_random_uuid();
        INSERT INTO executive.attention_deliveries (delivery_id, scope, tenant_id, domain_id, item_id, item_event_id, item_event, channel, recipient_principal_id, attempt, max_attempts,
                                                    state, next_attempt_at, policy_version, synthetic_state, correlation_id)
        VALUES (v_id, 'DOMAIN', p_tenant, p_domain, e.item_id, e.event_id, e.event, v_ch, v_rcpt, 1, (v_plan ->> 'max_attempts')::int,
                'queued', clock_timestamp(), e.policy_version, v_ch = 'demo-mailbox', p_correlation)
        ON CONFLICT (item_event_id, channel, recipient_principal_id, attempt) DO NOTHING;
        IF FOUND THEN
          PERFORM executive.attention_delivery_event(v_id, e.item_id, e.event_id, p_tenant, p_domain, 'delivery.planned', p_actor,
                    jsonb_build_object('channel', v_ch, 'recipient', v_rcpt, 'attempt', 1, 'max_attempts', (v_plan ->> 'max_attempts')::int, 'policy_version', e.policy_version,
                                       'item_event', e.event, 'synthetic', v_ch = 'demo-mailbox'), p_correlation);
          v_planned := v_planned + 1;
        END IF;
      END LOOP;
    END LOOP;
    v_events := v_events + 1;
  END LOOP;
  RETURN jsonb_build_object('planned', v_planned, 'events', v_events, 'not_planned', v_not);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.plan_attention_deliveries(uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.plan_attention_deliveries(uuid,uuid,uuid,uuid) TO eye_commit;

-- CLAIM: the due queued attempts, oldest first, bounded, taken with FOR UPDATE SKIP LOCKED (the 0082 idiom — a row another tick holds is
-- skipped, never waited on); each with what its message says (the item's class, title, state, deadline and subject).
CREATE OR REPLACE FUNCTION executive.claim_attention_deliveries(p_tenant uuid, p_domain uuid, p_limit int) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, observation, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.attention.tick']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object('delivery_id', c.delivery_id, 'item_id', c.item_id, 'item_event_id', c.item_event_id, 'item_event', c.item_event, 'channel', c.channel,
                                        'recipient_principal_id', c.recipient_principal_id, 'attempt', c.attempt, 'max_attempts', c.max_attempts, 'policy_version', c.policy_version,
                                        'signal_class', i.signal_class, 'title', i.title, 'item_state', i.state, 'due_at', i.due_at, 'subject_kind', i.subject_kind, 'subject_id', i.subject_id)
                     ORDER BY c.next_attempt_at, c.delivery_id)
      FROM (SELECT d.* FROM executive.attention_deliveries d
             WHERE d.tenant_id = p_tenant AND d.domain_id = p_domain AND d.state = 'queued' AND d.next_attempt_at <= clock_timestamp()
             ORDER BY d.next_attempt_at, d.delivery_id
             LIMIT least(greatest(coalesce(p_limit, 50), 1), 200)
             FOR UPDATE SKIP LOCKED) c
      JOIN executive.attention_items i ON i.item_id = c.item_id), '[]'::jsonb);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.claim_attention_deliveries(uuid,uuid,int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.claim_attention_deliveries(uuid,uuid,int) TO eye_commit;

-- THE SYNTHETIC SINK: the demo-mailbox channel places a message (subject, body digest) for the recipient of a queued demo-mailbox
-- delivery; placing the same delivery again answers the message placed (idempotent). Nothing leaves the database.
CREATE OR REPLACE FUNCTION executive.place_demo_mail(p_message_id uuid, p_delivery uuid, p_tenant uuid, p_domain uuid, p_subject text, p_body_digest text, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE d executive.attention_deliveries%ROWTYPE; m executive.demo_mailbox%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.attention.tick']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT * INTO d FROM executive.attention_deliveries x WHERE x.delivery_id = p_delivery AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'attention delivery rejected: no such delivery % in this domain', p_delivery USING ERRCODE = '23503'; END IF;
  IF d.channel <> 'demo-mailbox' THEN RAISE EXCEPTION 'attention delivery rejected: delivery % is on the channel %, not demo-mailbox', p_delivery, d.channel USING ERRCODE = '22023'; END IF;
  SELECT * INTO m FROM executive.demo_mailbox x WHERE x.delivery_id = p_delivery;
  IF FOUND THEN
    RETURN jsonb_build_object('message_id', m.message_id, 'delivered_at', m.delivered_at, 'body_digest', m.body_digest, 'synthetic_state', true, 'repeated', true);
  END IF;
  IF d.state <> 'queued' THEN RAISE EXCEPTION 'attention delivery rejected (not_queued): delivery % is %; only a queued delivery is placed', p_delivery, d.state USING ERRCODE = '22023'; END IF;
  INSERT INTO executive.demo_mailbox (message_id, scope, tenant_id, domain_id, delivery_id, recipient_principal_id, subject, body_digest, correlation_id)
  VALUES (p_message_id, 'DOMAIN', p_tenant, p_domain, p_delivery, d.recipient_principal_id, left(btrim(p_subject), 300), p_body_digest, p_correlation)
  RETURNING * INTO m;
  RETURN jsonb_build_object('message_id', m.message_id, 'delivered_at', m.delivered_at, 'body_digest', m.body_digest, 'synthetic_state', true, 'repeated', false);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.place_demo_mail(uuid,uuid,uuid,uuid,text,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.place_demo_mail(uuid,uuid,uuid,uuid,text,text,uuid) TO eye_commit;

-- THE IN-APP PLACEMENT: the item stands in the recipient's queue when the recipient may act on it (executive.may_act_on_item — its
-- owner, a holder of a routed role, an administrator); the answer is the machine proof the in_app channel records as its receipt.
CREATE OR REPLACE FUNCTION executive.attention_in_app_placement(p_delivery uuid, p_tenant uuid, p_domain uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE d executive.attention_deliveries%ROWTYPE; x executive.attention_items%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.attention.tick']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT * INTO d FROM executive.attention_deliveries y WHERE y.delivery_id = p_delivery AND y.tenant_id = p_tenant AND y.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'attention delivery rejected: no such delivery % in this domain', p_delivery USING ERRCODE = '23503'; END IF;
  IF d.channel <> 'in_app' THEN RAISE EXCEPTION 'attention delivery rejected: delivery % is on the channel %, not in_app', p_delivery, d.channel USING ERRCODE = '22023'; END IF;
  SELECT * INTO x FROM executive.attention_items i WHERE i.item_id = d.item_id;
  RETURN jsonb_build_object('placed', executive.may_act_on_item(x, d.recipient_principal_id), 'queue', 'executive.attention_items', 'item_id', x.item_id, 'item_state', x.state,
                            'route_roles', to_jsonb(x.route_roles), 'owner', x.owner_principal_id, 'recipient', d.recipient_principal_id, 'at', clock_timestamp());
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.attention_in_app_placement(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.attention_in_app_placement(uuid,uuid,uuid) TO eye_commit;

-- RECORD: the outcome of one claimed attempt. sent / delivered carry the channel's receipt; a failure queues the next attempt after
-- 5^(attempt-1) minutes (1, 5, 25 …) while attempts remain, and the last one is ABANDONED. The item is never touched: an abandoned
-- delivery leaves it to escalate by its deadline.
CREATE OR REPLACE FUNCTION executive.record_delivery_attempt(p_delivery uuid, p_tenant uuid, p_domain uuid, p_state text, p_receipt jsonb, p_provider_ref text, p_error text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE d executive.attention_deliveries%ROWTYPE; v_at timestamptz := clock_timestamp(); v_next uuid; v_next_at timestamptz; v_state text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.attention.tick']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT * INTO d FROM executive.attention_deliveries x WHERE x.delivery_id = p_delivery AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'attention delivery rejected: no such delivery % in this domain', p_delivery USING ERRCODE = '23503'; END IF;
  IF p_state IS NULL OR p_state NOT IN ('sent', 'delivered', 'failed') THEN RAISE EXCEPTION 'attention delivery rejected: the outcome of an attempt is sent, delivered or failed' USING ERRCODE = '22023'; END IF;
  IF d.state <> 'queued' THEN RAISE EXCEPTION 'attention delivery rejected (not_queued): delivery % is %; only a queued delivery is attempted', p_delivery, d.state USING ERRCODE = '22023'; END IF;
  IF p_state IN ('sent', 'delivered') AND (p_receipt IS NULL OR jsonb_typeof(p_receipt) <> 'object') THEN
    RAISE EXCEPTION 'attention delivery rejected: a placement carries the channel''s receipt (an object)' USING ERRCODE = '22023';
  END IF;
  IF p_state = 'failed' AND (p_error IS NULL OR length(btrim(p_error)) = 0) THEN RAISE EXCEPTION 'attention delivery rejected: a failed attempt says why' USING ERRCODE = '22023'; END IF;
  v_state := CASE WHEN p_state = 'failed' AND d.attempt >= d.max_attempts THEN 'abandoned' ELSE p_state END;
  UPDATE executive.attention_deliveries SET state = v_state, receipt = CASE WHEN jsonb_typeof(p_receipt) = 'object' THEN p_receipt ELSE NULL END, provider_ref = p_provider_ref,
         error = CASE WHEN p_state = 'failed' THEN left(btrim(p_error), 500) ELSE NULL END, next_attempt_at = NULL, attempted_at = v_at, updated_at = v_at
   WHERE delivery_id = p_delivery;
  PERFORM executive.attention_delivery_event(p_delivery, d.item_id, d.item_event_id, p_tenant, p_domain, 'delivery.' || v_state, p_actor,
            jsonb_build_object('channel', d.channel, 'recipient', d.recipient_principal_id, 'attempt', d.attempt, 'max_attempts', d.max_attempts, 'provider_ref', p_provider_ref,
                               'error', CASE WHEN p_state = 'failed' THEN left(btrim(p_error), 500) ELSE NULL END, 'synthetic', d.synthetic_state), p_correlation);
  IF v_state = 'failed' THEN
    v_next := gen_random_uuid(); v_next_at := v_at + make_interval(mins => power(5, d.attempt - 1)::int);
    INSERT INTO executive.attention_deliveries (delivery_id, scope, tenant_id, domain_id, item_id, item_event_id, item_event, channel, recipient_principal_id, attempt, max_attempts,
                                                state, next_attempt_at, policy_version, synthetic_state, correlation_id)
    VALUES (v_next, 'DOMAIN', p_tenant, p_domain, d.item_id, d.item_event_id, d.item_event, d.channel, d.recipient_principal_id, d.attempt + 1, d.max_attempts,
            'queued', v_next_at, d.policy_version, d.synthetic_state, p_correlation);
    PERFORM executive.attention_delivery_event(v_next, d.item_id, d.item_event_id, p_tenant, p_domain, 'delivery.retry_scheduled', p_actor,
              jsonb_build_object('after', p_delivery, 'attempt', d.attempt + 1, 'max_attempts', d.max_attempts, 'next_attempt_at', v_next_at, 'backoff_minutes', power(5, d.attempt - 1)::int), p_correlation);
  END IF;
  RETURN jsonb_build_object('delivery_id', p_delivery, 'state', v_state, 'attempt', d.attempt, 'max_attempts', d.max_attempts, 'next_delivery_id', v_next, 'next_attempt_at', v_next_at, 'attempted_at', v_at);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.record_delivery_attempt(uuid,uuid,uuid,text,jsonb,text,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.record_delivery_attempt(uuid,uuid,uuid,text,jsonb,text,text,uuid,uuid) TO eye_commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §M (section `materiality`)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0086 §M (B24 part `materiality`) — CP-6 B24: THE REMAINING MATERIALITY DIMENSIONS, THE ENFORCED OVERLOAD RULE, A TRANSPARENT RANK,
-- THE DEPRIORITIZED VIEW (2026-09-25). F-P6-07; V00-T-069 ("priority shall combine materiality, urgency, confidence, novelty, strategic
-- relevance, reversibility … users must understand why an item is elevated … and see what was deprioritized"), V03-T-262 ("consequence,
-- urgency, confidence, reversibility, and information value"), PR-44-002 (rank), PR-44-005 / UX-44-005 (overload: "rebalance by
-- policy, expose ranking reasons … preserve severe-item visibility"), UX-44-002 (reason, exposure), ES-47-002 (no opaque score).
--
-- THE GAP. B22's engine (0083 §4) judged three dimensions (consequence, confidence, hours to the window); 0086 §0 lets a policy carry
-- five more thresholds (min_probability, min_exposure, min_strategic_relevance, min_information_value, min_irreversibility), a
-- `require` list and an enforceable overload rule — but nothing judged them, no consumer gave them an input, the legacy
-- overload.max_open_per_role was stored and never enforced, and the queue had no rank.
--
-- THE MECHANISM.
-- (§M1) THE VOCABULARIES: a package version's free-text reversibility and information value (0041:109-110) read into
--   reversible | costly | irreversible and low (0.2) | moderate (0.5) | high (0.8) by explicit patterns — anything else is NULL
--   (no input), never guessed.
-- (§M2) THE RANK (ES-47-002): a LEXICOGRAPHIC key over transparent dimensions — consequence (higher first), hours to the window
--   (sooner first), confidence, exposure, strategic relevance (higher first); a dimension with no input ranks after one with —
--   with its explanation in words. No weighted score exists anywhere.
-- (§M3) THE ENGINE: executive.evaluate_attention re-declared (0083 §4 copied whole, same signature, IMMUTABLE): every B22 reason is
--   byte-identical; a further dimension is judged ONLY when its class sets its threshold; a threshold on a dimension with no input
--   adds "<dim>: no input, not judged", and the outcome is abstained only when the class REQUIRES that dimension; evaluation.rank.
-- (§M4) THE DIMENSIONS' INPUTS: executive.attention_dimensions(tenant, domain, class, subject, hint) — the REAL inputs this product
--   has today, each with its basis; every dimension without one is NULL (declared, never invented):
--     decision.material_change  irreversibility + information value (the package version), strategic relevance (the version's live
--                               objectives and the decision's graph links to objectives), exposure (the commitment and the objects
--                               resting on the decision); probability NULL.
--     forecast.unfit            exposure (the live scenarios on the forecast + the packages whose options cite it — the attention
--                               consumer's own count), strategic relevance (the citing packages' objectives; NULL when none cites it).
--     scenario.incoherent       exposure (the runs on the scenario + the packages whose options cite them).
--     warning.raised            probability as a BRACKET from the forecast's quantiles (q10/q50/q90) against the indicator's threshold
--                               (its lower bound is the number judged); hours to the response window on the DATABASE clock.
--     source.coverage_loss      exposure (the source's active impact markers).
--     review.convened           strategic relevance when the subject is an objective (1 live, 0 not); hours to the due instant on the
--                               database clock.
--     proposal.review           none.
-- (§M5) THE OVERLOAD RULE (PR-44-005, UX-44-005), ENFORCED: when the owner's open + escalated items moved into the queue within
--   window_hours (absent: all of them) reach max_open_per_owner, a material item whose consequence is below exempt_min_consequence
--   (default C3) is DEPRIORITIZED — recorded, visible, waiting — with evaluation.overload {cap, open, window_hours, displaced_by, …}
--   and the event item.overload_deprioritized. C3 and C4 are NEVER deprioritized for overload whatever the policy says (the effective
--   exemption is at most C3 — here, in SQL). An item with no owner (the class's roles are accountable) is not capped per owner. The
--   LEGACY overload.max_open_per_role is NOT enforced: the stored versions that carry it are immutable, and enforcing it now would
--   change what those versions meant when they were set (stated; a new version names max_open_per_owner).
--   executive.attention_route gains a 7-argument form that takes the evaluation (the 6-argument form, which B22's callers use, is kept
--   and judges no overload); executive.route_attention_item is re-declared to pass the evaluation and record the overload (see the
--   integrator's note below); executive.reevaluate_attention_item is re-declared so that a re-evaluation never routes an item WAITING
--   for capacity afresh past the cap or out of rank order (it restates the overload under the new version; the rebalance elevates).
-- (§M6) THE REBALANCE: executive.rebalance_attention(tenant, domain, actor, correlation) — when capacity frees, the waiting items are
--   elevated in RANK order (a lower-ranked item of an owner never jumps a higher-ranked one still waiting), each routed afresh under its
--   own policy version (the owner and the roles, a new deadline) with item.elevated and the explanation; bounded (≤ 200 per call);
--   idempotent (a second call elevates nothing more). Driven by the attention tick (step `rebalance`, order 20 — the timer host is
--   §T's) under executive.attention.tick, and by an operator's route (executive.attention.rebalance, human-gated).
--
-- INTEGRATOR'S NOTE: executive.route_attention_item (0083 §5) is RE-DECLARED here although the part prompt did not list it: the route's
-- 6-argument signature carries only the outcome, so the item's consequence (the exemption) and the overload record (evaluation.overload,
-- item.overload_deprioritized) can only be written by the port that inserts the item. The change is three lines (the 7-argument call,
-- the overload merged into the evaluation, the event name); if another section re-declares the same port, merge those three lines.
--
-- NOT HERE (stated): novelty (V00-T-069) — no input exists (a novelty score needs a history model; declared absent, not invented);
-- probability for any class but warning.raised; the per-role cap (legacy, not enforced — above); a lock serialising two concurrent
-- routings to the same owner (two consumers routing at the same instant may admit one item over the cap; the next rebalance does not
-- demote it — displacement never un-routes an item already routed); the timer host itself (§T); delivery of an elevated item (§D
-- plans deliveries for what the tick elevated); ranking stability and precision metrics (queue evaluation, a later batch).

-- ============================================================
-- §M1 THE VOCABULARIES
-- ============================================================
-- A package version's reversibility (free text, 0041:109) → reversible | costly | irreversible, or NULL when the text says neither.
CREATE OR REPLACE FUNCTION executive.normalise_reversibility(p text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT CASE
    WHEN p IS NULL OR btrim(p) = '' THEN NULL
    WHEN lower(p) ~ '(\mirreversible\M|\mnot reversible\M|\mcannot be (reversed|undone)\M|\mone-way\M|\mpermanent\M)' THEN 'irreversible'
    WHEN lower(p) ~ '(\mcostly\M|\mexpensive\M|\mpartially reversible\M|\mreversible (only )?at (a |some )?(high |significant )?cost\M)' THEN 'costly'
    WHEN lower(p) ~ '(\mreversible\M|\mcan be (reversed|undone)\M)' THEN 'reversible'
    ELSE NULL END
$$;
GRANT EXECUTE ON FUNCTION executive.normalise_reversibility(text) TO eye_app, eye_commit;

-- A package version's information value (free text, 0041:110) → low | moderate | high, or NULL. The numeric scale the thresholds read:
-- low 0.2, moderate 0.5, high 0.8 (the vocabulary's declared points — three words, three numbers, nothing interpolated).
CREATE OR REPLACE FUNCTION executive.normalise_information_value(p text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT CASE
    WHEN p IS NULL OR btrim(p) = '' THEN NULL
    WHEN lower(p) ~ '(\mwould not change\M|\mwouldn''t change\M|\mno further information\M|^\s*(low|little|negligible|none)\M)' THEN 'low'
    WHEN lower(p) ~ '(^\s*(moderate|medium|some)\M)' THEN 'moderate'
    WHEN lower(p) ~ '(\mwould change\M|\mcould change\M|^\s*(high|significant|decisive)\M)' THEN 'high'
    ELSE NULL END
$$;
GRANT EXECUTE ON FUNCTION executive.normalise_information_value(text) TO eye_app, eye_commit;

CREATE OR REPLACE FUNCTION executive.information_value_point(p_word text) RETURNS numeric
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT CASE p_word WHEN 'low' THEN 0.2 WHEN 'moderate' THEN 0.5 WHEN 'high' THEN 0.8 ELSE NULL END
$$;
GRANT EXECUTE ON FUNCTION executive.information_value_point(text) TO eye_app, eye_commit;

-- ============================================================
-- §M2 THE RANK — lexicographic over transparent dimensions (ES-47-002: no opaque score)
-- ============================================================
-- The sort key, ASCENDING = first in the queue: [−consequence, hours to the window, −confidence, −exposure, −strategic relevance].
-- A NULL element sorts after every number (PostgreSQL's array comparison), so a dimension with no input ranks after one with.
CREATE OR REPLACE FUNCTION executive.attention_rank_key(p_dims jsonb) RETURNS numeric[]
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT ARRAY[
    CASE WHEN p_dims ->> 'consequence' ~ '^C[0-4]$' THEN -(substr(p_dims ->> 'consequence', 2)::numeric) END,
    CASE WHEN jsonb_typeof(p_dims -> 'hours_to_window') = 'number' THEN (p_dims ->> 'hours_to_window')::numeric END,
    CASE WHEN jsonb_typeof(p_dims -> 'confidence') = 'number' THEN -((p_dims ->> 'confidence')::numeric) END,
    CASE WHEN jsonb_typeof(p_dims -> 'exposure') = 'number' THEN -((p_dims ->> 'exposure')::numeric) END,
    CASE WHEN jsonb_typeof(p_dims -> 'strategic_relevance') = 'number' THEN -((p_dims ->> 'strategic_relevance')::numeric) END]
$$;
GRANT EXECUTE ON FUNCTION executive.attention_rank_key(jsonb) TO eye_app, eye_commit;

-- The rank as the queue shows it: the tuple, the order it is read in, and the explanation in words.
CREATE OR REPLACE FUNCTION executive.attention_rank(p_dims jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = executive, pg_catalog, pg_temp AS $$
  WITH d AS (SELECT coalesce(p_dims, '{}'::jsonb) AS x)
  SELECT jsonb_build_object(
    'tuple', jsonb_build_object(
      'consequence', CASE WHEN x ->> 'consequence' ~ '^C[0-4]$' THEN x ->> 'consequence' END,
      'hours_to_window', CASE WHEN jsonb_typeof(x -> 'hours_to_window') = 'number' THEN x -> 'hours_to_window' END,
      'confidence', CASE WHEN jsonb_typeof(x -> 'confidence') = 'number' THEN x -> 'confidence' END,
      'exposure', CASE WHEN jsonb_typeof(x -> 'exposure') = 'number' THEN x -> 'exposure' END,
      'strategic_relevance', CASE WHEN jsonb_typeof(x -> 'strategic_relevance') = 'number' THEN x -> 'strategic_relevance' END),
    'order', jsonb_build_array('consequence (higher first)', 'hours to the window (sooner first)', 'confidence (higher first)', 'exposure (higher first)', 'strategic relevance (higher first)'),
    'rule', 'lexicographic: the first dimension that differs decides; a dimension with no input ranks after one with; no weighted score',
    'explanation', concat_ws(' · ',
      CASE WHEN x ->> 'consequence' ~ '^C[0-4]$' THEN format('consequence %s', x ->> 'consequence') ELSE 'consequence: no input' END,
      CASE WHEN jsonb_typeof(x -> 'hours_to_window') = 'number' THEN format('%s h to the window', round((x ->> 'hours_to_window')::numeric, 1)) ELSE 'no response window' END,
      CASE WHEN jsonb_typeof(x -> 'confidence') = 'number' THEN format('confidence %s', x ->> 'confidence') ELSE 'confidence: no input' END,
      CASE WHEN jsonb_typeof(x -> 'exposure') = 'number' THEN format('exposure %s', x ->> 'exposure') ELSE 'exposure: no input' END,
      CASE WHEN jsonb_typeof(x -> 'strategic_relevance') = 'number' THEN format('strategic relevance %s', x ->> 'strategic_relevance') ELSE 'strategic relevance: no input' END))
  FROM d
$$;
GRANT EXECUTE ON FUNCTION executive.attention_rank(jsonb) TO eye_app, eye_commit;

-- ============================================================
-- §M3 THE ENGINE — 0083 §4 copied whole (same signature); the five further dimensions and the rank added
-- ============================================================
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
                                 (4, 'information_value', 'min_information_value'), (5, 'irreversibility', 'min_irreversibility')) AS t(n, dim, key) ORDER BY n LOOP
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

-- ============================================================
-- §M4 THE DIMENSIONS' INPUTS — the real ones, with their basis; NULL where this product has none
-- ============================================================
-- A package version's strategic relevance: 0.5 for the live objectives its terms name (0041:103), 0.5 for its decision's graph links to
-- a live objective (graph.dependencies DEC → OBJ) — 1 when both say it serves an objective, 0.5 when one does, 0 when neither.
CREATE OR REPLACE FUNCTION executive.package_strategic_relevance(p_tenant uuid, p_domain uuid, p_package uuid, p_version int) RETURNS jsonb
STABLE SECURITY DEFINER SET search_path = executive, decision, graph, pg_catalog, pg_temp AS $$
DECLARE v_dec uuid; v_obj jsonb; v_named int; v_live int; v_links int;
BEGIN
  SELECT p.decision_object_id INTO v_dec FROM decision.packages_current p WHERE p.package_id = p_package AND p.tenant_id = p_tenant AND p.domain_id = p_domain;
  SELECT v.objectives INTO v_obj FROM decision.package_versions v WHERE v.package_id = p_package AND v.version = p_version AND v.tenant_id = p_tenant AND v.domain_id = p_domain;
  IF v_dec IS NULL OR v_obj IS NULL THEN RETURN NULL; END IF;
  v_named := jsonb_array_length(v_obj);
  SELECT count(*) INTO v_live FROM graph.strategy_current s
   WHERE s.tenant_id = p_tenant AND s.domain_id = p_domain AND s.object_type = 'OBJ' AND s.status = 'active'
     AND s.strategy_object_id::text IN (SELECT e #>> '{}' FROM jsonb_array_elements(v_obj) e WHERE jsonb_typeof(e) = 'string');
  SELECT count(*) INTO v_links FROM graph.dependencies g JOIN graph.strategy_current s ON s.strategy_object_id = g.depends_on_id
   WHERE g.tenant_id = p_tenant AND g.domain_id = p_domain AND g.dependent_object_id = v_dec AND g.state = 'active' AND g.depends_on_kind = 'strategy'
     AND s.object_type = 'OBJ' AND s.status = 'active';
  RETURN jsonb_build_object('score', (CASE WHEN v_live > 0 THEN 0.5 ELSE 0 END) + (CASE WHEN v_links > 0 THEN 0.5 ELSE 0 END),
                            'package_id', p_package, 'version', p_version, 'objectives_named', v_named, 'objectives_live', v_live, 'decision_links_to_objectives', v_links);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.package_strategic_relevance(uuid,uuid,uuid,int) FROM PUBLIC;

-- The further dimensions of a signal on its subject, read from the records as they stand (the DATABASE clock for the windows); every
-- dimension this product has no input for is NULL. `dimension_basis` says where each number came from. Read inside the routing
-- subscriber's own transaction (assert_scope: the context's tenant and domain).
CREATE OR REPLACE FUNCTION executive.attention_dimensions(p_tenant uuid, p_domain uuid, p_class text, p_subject_id uuid, p_hint jsonb DEFAULT '{}'::jsonb) RETURNS jsonb
STABLE SECURITY DEFINER SET search_path = executive, decision, graph, prediction, simulation, observation, public, pg_catalog, pg_temp AS $$
DECLARE v_at timestamptz := clock_timestamp(); out jsonb := jsonb_build_object('probability', NULL, 'exposure', NULL, 'strategic_relevance', NULL, 'information_value', NULL, 'irreversibility', NULL);
        basis jsonb := '{}'::jsonb; v_pkg record; v_ver record; v_version int; v_rel jsonb; v_n int; v_m int; v_best jsonb; v_w record; v_f record; v_i record;
        v_q10 numeric; v_q50 numeric; v_q90 numeric; v_lo numeric; v_hi numeric; v_below boolean; v_rv record; v_iv text;
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
  RETURN out || jsonb_build_object('dimension_basis', basis);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.attention_dimensions(uuid,uuid,text,uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.attention_dimensions(uuid,uuid,text,uuid,jsonb) TO eye_commit;

-- ============================================================
-- §M5 THE OVERLOAD RULE, ENFORCED
-- ============================================================
-- An owner's load under a policy's overload rule: the cap (NULL when the version names no max_open_per_owner), the open + escalated
-- items moved into the queue (updated_at: routed, elevated, escalated or re-evaluated) within window_hours (every one when absent),
-- `p_self` excluded, and the items holding the capacity (the first 20 by rank). The legacy max_open_per_role is reported, never enforced.
CREATE OR REPLACE FUNCTION executive.attention_owner_load(p_rules jsonb, p_owner uuid, p_tenant uuid, p_domain uuid, p_self uuid) RETURNS jsonb
STABLE SECURITY DEFINER SET search_path = executive, pg_catalog, pg_temp AS $$
DECLARE o jsonb := p_rules -> 'overload'; v_cap int; v_window numeric; v_open int; v_holding jsonb;
BEGIN
  v_cap := CASE WHEN jsonb_typeof(o -> 'max_open_per_owner') = 'number' THEN (o ->> 'max_open_per_owner')::int ELSE NULL END;
  v_window := CASE WHEN jsonb_typeof(o -> 'window_hours') = 'number' THEN (o ->> 'window_hours')::numeric ELSE NULL END;
  SELECT count(*), coalesce(jsonb_agg(item_id ORDER BY k, created_at, item_id) FILTER (WHERE rn <= 20), '[]'::jsonb) INTO v_open, v_holding
    FROM (SELECT i.item_id, i.created_at, executive.attention_rank_key(i.evaluation -> 'dimensions') AS k,
                 row_number() OVER (ORDER BY executive.attention_rank_key(i.evaluation -> 'dimensions'), i.created_at, i.item_id) AS rn
            FROM executive.attention_items i
           WHERE i.tenant_id = p_tenant AND i.domain_id = p_domain AND i.owner_principal_id = p_owner AND i.state IN ('open', 'escalated')
             AND i.item_id IS DISTINCT FROM p_self
             AND (v_window IS NULL OR i.updated_at >= clock_timestamp() - v_window * interval '1 hour')) s;
  RETURN jsonb_build_object('cap', v_cap, 'open', v_open, 'window_hours', v_window, 'displaced_by', v_holding, 'owner', p_owner)
      || CASE WHEN o ? 'max_open_per_role' THEN jsonb_build_object('legacy_max_open_per_role', o -> 'max_open_per_role', 'legacy_note', 'max_open_per_role is not enforced: the stored versions that carry it are immutable') ELSE '{}'::jsonb END;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.attention_owner_load(jsonb,uuid,uuid,uuid,uuid) FROM PUBLIC;

-- Whether an item's consequence is exempt from the overload rule: at or above exempt_min_consequence (default C3) — and C3 and C4
-- ALWAYS, whatever the version says (PR-44-005: a severe item is never hidden for capacity; the effective floor is at most C3).
CREATE OR REPLACE FUNCTION executive.attention_overload_exempt(p_rules jsonb, p_dims jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT CASE WHEN p_dims ->> 'consequence' ~ '^C[0-4]$'
              THEN substr(p_dims ->> 'consequence', 2)::int >= least(substr(coalesce(nullif(p_rules #>> '{overload,exempt_min_consequence}', ''), 'C3'), 2)::int, 3)
              ELSE false END
$$;

-- The overload verdict for a material item about to be routed to its owner: NULL (routed) or the record the item carries.
CREATE OR REPLACE FUNCTION executive.attention_overload(p_rules jsonb, p_dims jsonb, p_owner uuid, p_tenant uuid, p_domain uuid, p_self uuid) RETURNS jsonb
STABLE SECURITY DEFINER SET search_path = executive, pg_catalog, pg_temp AS $$
DECLARE v_load jsonb; v_policy text := coalesce(nullif(p_rules #>> '{overload,exempt_min_consequence}', ''), 'C3'); v_eff text;
BEGIN
  IF p_owner IS NULL OR jsonb_typeof(p_rules #> '{overload,max_open_per_owner}') IS DISTINCT FROM 'number' THEN RETURN NULL; END IF;
  IF executive.attention_overload_exempt(p_rules, p_dims) THEN RETURN NULL; END IF;
  v_load := executive.attention_owner_load(p_rules, p_owner, p_tenant, p_domain, p_self);
  IF (v_load ->> 'open')::int < (v_load ->> 'cap')::int THEN RETURN NULL; END IF;
  v_eff := 'C' || least(substr(v_policy, 2)::int, 3);
  RETURN v_load || jsonb_build_object('consequence', p_dims ->> 'consequence', 'exempt_min_consequence', v_eff, 'policy_exempt_min_consequence', v_policy,
    'rule', format('the owner holds %s open or escalated item(s)%s, at the cap %s; a %s item (below the exemption %s) waits in the deprioritized view until capacity frees — C3 and C4 are never deprioritized for overload',
                   v_load ->> 'open', CASE WHEN v_load ->> 'window_hours' IS NULL THEN '' ELSE format(' moved into the queue within %s h', v_load ->> 'window_hours') END,
                   v_load ->> 'cap', p_dims ->> 'consequence', v_eff));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.attention_overload(jsonb,jsonb,uuid,uuid,uuid,uuid) FROM PUBLIC;

-- THE ROUTE with the evaluation (7 arguments): 0083 §5's body; a material item that would be OPEN for its owner is judged against the
-- overload rule first — at the cap and not exempt → deprioritized with the overload record (the route roles kept, no deadline).
CREATE OR REPLACE FUNCTION executive.attention_route(p_rules jsonb, p_class text, p_outcome text, p_owner uuid, p_tenant uuid, p_domain uuid, p_eval jsonb) RETURNS jsonb
STABLE SECURITY DEFINER SET search_path = executive, identity, pg_catalog, pg_temp AS $$
DECLARE r jsonb := p_rules #> ARRAY['classes', p_class]; v_roles text[]; v_esc text[]; v_minutes int; v_ovl jsonb;
BEGIN
  IF p_outcome <> 'material' THEN RETURN jsonb_build_object('state', 'deprioritized', 'route_roles', '[]'::jsonb, 'due_at', NULL, 'escalations', 0); END IF;
  SELECT coalesce(array_agg(x), '{}') INTO v_roles FROM jsonb_array_elements_text(r -> 'route_roles') x;
  SELECT coalesce(array_agg(x), '{}') INTO v_esc FROM jsonb_array_elements_text(coalesce(r -> 'escalate_to_roles', '[]'::jsonb)) x;
  v_minutes := (r ->> 'ack_within_minutes')::int;
  IF (p_owner IS NOT NULL AND EXISTS (SELECT 1 FROM identity.principals p WHERE p.id = p_owner AND p.kind = 'human' AND p.status = 'active'))
     OR executive.role_holders(p_tenant, p_domain, v_roles) > 0 THEN
    -- B24 (0086 §M): the enforced overload rule (the owner's capacity; C3/C4 exempt always)
    v_ovl := CASE WHEN p_eval IS NULL THEN NULL ELSE executive.attention_overload(p_rules, p_eval -> 'dimensions', p_owner, p_tenant, p_domain, NULL) END;
    IF v_ovl IS NOT NULL THEN
      RETURN jsonb_build_object('state', 'deprioritized', 'route_roles', to_jsonb(v_roles), 'due_at', NULL, 'escalations', 0, 'overload', v_ovl);
    END IF;
    RETURN jsonb_build_object('state', 'open', 'route_roles', to_jsonb(v_roles), 'due_at', clock_timestamp() + make_interval(mins => v_minutes), 'escalations', 0);
  END IF;
  -- ES-47 failure semantics: an unowned material item is not issued as actionable to nobody — the routing failure escalates.
  IF coalesce((r ->> 'max_escalations')::int, 0) > 0 AND executive.role_holders(p_tenant, p_domain, v_esc) > 0 THEN
    RETURN jsonb_build_object('state', 'escalated', 'route_roles', to_jsonb(ARRAY(SELECT DISTINCT unnest(v_roles || v_esc) ORDER BY 1)), 'due_at', clock_timestamp() + make_interval(mins => v_minutes), 'escalations', 1, 'unrouted', true);
  END IF;
  RETURN jsonb_build_object('state', 'unrouted', 'route_roles', to_jsonb(v_roles), 'due_at', NULL, 'escalations', 0);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.attention_route(jsonb,text,text,uuid,uuid,uuid,jsonb) FROM PUBLIC;

-- THE ROUTE (6 arguments, 0083 §5's signature): the same route with no evaluation — it judges no overload (the rebalance, which has
-- just measured the capacity, and every caller that routes an item already admitted use it).
CREATE OR REPLACE FUNCTION executive.attention_route(p_rules jsonb, p_class text, p_outcome text, p_owner uuid, p_tenant uuid, p_domain uuid) RETURNS jsonb
STABLE SECURITY DEFINER SET search_path = executive, identity, pg_catalog, pg_temp AS $$
  SELECT executive.attention_route(p_rules, p_class, p_outcome, p_owner, p_tenant, p_domain, NULL::jsonb);
$$ LANGUAGE sql;
REVOKE ALL ON FUNCTION executive.attention_route(jsonb,text,text,uuid,uuid,uuid) FROM PUBLIC;

-- ROUTE: 0083 §5 copied whole; B24 (0086 §M) — the evaluation passed to the route (the overload rule), the overload merged into the
-- evaluation and announced as item.overload_deprioritized (see the integrator's note in the header).
CREATE OR REPLACE FUNCTION executive.route_attention_item(
  p_item_id uuid, p_tenant uuid, p_domain uuid, p_class text, p_subject_kind text, p_subject_id uuid, p_cause_event_id uuid, p_cause_event_type text,
  p_owner uuid, p_dims jsonb, p_title text, p_details jsonb, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE x executive.attention_items%ROWTYPE; pol executive.attention_policies%ROWTYPE; v_eval jsonb; v_route jsonb; v_state text; v_owner uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.attention.subscription.apply', 'observation.source_health.subscription.apply', 'intelligence.proposal.subscription.apply']);
  -- the OWNER is a named, active human of the tenant, or nobody (an agent issued the forecast: the class's roles are accountable)
  v_owner := CASE WHEN p_owner IS NOT NULL AND EXISTS (SELECT 1 FROM identity.principals p WHERE p.id = p_owner AND p.kind = 'human' AND p.status = 'active' AND (p.tenant_id = p_tenant OR p.scope = 'PLATFORM')) THEN p_owner ELSE NULL END;
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT * INTO x FROM executive.attention_items i WHERE i.tenant_id = p_tenant AND i.domain_id = p_domain AND i.signal_class = p_class AND i.subject_id = p_subject_id AND i.cause_event_id = p_cause_event_id;
  IF FOUND THEN
    RETURN jsonb_build_object('item_id', x.item_id, 'repeated', true, 'outcome', x.outcome, 'state', x.state, 'policy_version', x.policy_version, 'route_roles', to_jsonb(x.route_roles), 'owner', x.owner_principal_id, 'due_at', x.due_at, 'evaluation', x.evaluation);
  END IF;
  SELECT * INTO pol FROM executive.attention_policies a WHERE a.tenant_id = p_tenant AND a.domain_id = p_domain AND a.state = 'active';
  v_eval := executive.evaluate_attention(CASE WHEN pol.policy_id IS NULL THEN NULL ELSE pol.rules END, p_class, coalesce(p_dims, '{}'::jsonb)) || jsonb_build_object('policy_version', pol.version);
  v_route := executive.attention_route(pol.rules, p_class, v_eval ->> 'outcome', v_owner, p_tenant, p_domain, v_eval);
  IF v_route ? 'overload' THEN v_eval := v_eval || jsonb_build_object('overload', v_route -> 'overload'); END IF;
  v_state := v_route ->> 'state';
  INSERT INTO executive.attention_items (item_id, scope, tenant_id, domain_id, signal_class, subject_kind, subject_id, cause_event_id, cause_event_type, title, outcome, state,
                                         owner_principal_id, route_roles, policy_id, policy_version, evaluation, details, due_at, escalations, correlation_id)
  VALUES (p_item_id, 'DOMAIN', p_tenant, p_domain, p_class, p_subject_kind, p_subject_id, p_cause_event_id, p_cause_event_type, left(btrim(p_title), 512), v_eval ->> 'outcome', v_state,
          v_owner, ARRAY(SELECT jsonb_array_elements_text(v_route -> 'route_roles')), pol.policy_id, pol.version, v_eval, coalesce(p_details, '{}'::jsonb),
          (v_route ->> 'due_at')::timestamptz, (v_route ->> 'escalations')::int, p_correlation);
  PERFORM executive.attention_event(p_item_id, p_tenant, p_domain,
            CASE WHEN v_route ? 'overload' THEN 'item.overload_deprioritized' ELSE
            CASE v_state WHEN 'open' THEN 'item.routed' WHEN 'escalated' THEN 'item.escalated' WHEN 'unrouted' THEN 'item.unrouted' ELSE 'item.deprioritized' END END,
            p_actor, jsonb_build_object('outcome', v_eval ->> 'outcome', 'reasons', v_eval -> 'reasons', 'policy_version', pol.version, 'owner', v_owner, 'route_roles', v_route -> 'route_roles',
                                        'due_at', v_route -> 'due_at', 'cause_event_id', p_cause_event_id, 'cause_event_type', p_cause_event_type, 'unrouted', coalesce((v_route ->> 'unrouted')::boolean, false))
                     || CASE WHEN v_route ? 'overload' THEN jsonb_build_object('overload', v_route -> 'overload', 'rank', v_eval -> 'rank') ELSE '{}'::jsonb END, p_correlation);
  RETURN jsonb_build_object('item_id', p_item_id, 'repeated', false, 'outcome', v_eval ->> 'outcome', 'state', v_state, 'policy_version', pol.version, 'route_roles', v_route -> 'route_roles',
                            'owner', v_owner, 'due_at', v_route -> 'due_at', 'evaluation', v_eval, 'unrouted', coalesce((v_route ->> 'unrouted')::boolean, v_state = 'unrouted'))
      || CASE WHEN v_route ? 'overload' THEN jsonb_build_object('overload', v_route -> 'overload') ELSE '{}'::jsonb END;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.route_attention_item(uuid,uuid,uuid,text,text,uuid,uuid,text,uuid,jsonb,text,jsonb,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.route_attention_item(uuid,uuid,uuid,text,text,uuid,uuid,text,uuid,jsonb,text,jsonb,uuid,uuid) TO eye_commit;

-- RE-EVALUATE: 0083 §5 copied whole; B24 (0086 §M) — an item WAITING for capacity (deprioritized for overload) that stays material is
-- NOT routed afresh: it keeps its place, its overload restated under the new version (or marked awaiting the rebalance when the new
-- version frees it), and the rebalance elevates in rank order; any other deprioritized item that becomes material meets the overload
-- rule exactly as at its first routing.
CREATE OR REPLACE FUNCTION executive.reevaluate_attention_item(p_item uuid, p_tenant uuid, p_domain uuid, p_cause_event_id uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE x executive.attention_items%ROWTYPE; pol executive.attention_policies%ROWTYPE; v_eval jsonb; v_route jsonb; v_state text; v_at timestamptz := clock_timestamp(); v_ovl jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.attention.subscription.apply']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT * INTO x FROM executive.attention_items i WHERE i.item_id = p_item AND i.tenant_id = p_tenant AND i.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('item_id', p_item, 'changed', false, 'note', 'no such item'); END IF;
  SELECT * INTO pol FROM executive.attention_policies a WHERE a.tenant_id = p_tenant AND a.domain_id = p_domain AND a.state = 'active';
  IF x.state = 'closed' OR pol.policy_id IS NULL OR x.policy_id IS NOT DISTINCT FROM pol.policy_id THEN
    RETURN jsonb_build_object('item_id', p_item, 'changed', false, 'state', x.state, 'policy_version', x.policy_version, 'note', CASE WHEN x.state = 'closed' THEN 'closed — history' ELSE 'already under the active version' END);
  END IF;
  v_eval := executive.evaluate_attention(pol.rules, x.signal_class, x.evaluation -> 'dimensions') || jsonb_build_object('policy_version', pol.version);
  IF x.state IN ('acknowledged', 'suppressed') THEN
    v_state := CASE WHEN v_eval ->> 'outcome' = 'material' THEN x.state ELSE 'deprioritized' END;
    v_route := jsonb_build_object('route_roles', to_jsonb(x.route_roles), 'due_at', x.due_at, 'escalations', x.escalations);
  ELSIF x.state = 'deprioritized' AND x.outcome = 'material' AND x.evaluation ? 'overload' AND v_eval ->> 'outcome' = 'material' THEN
    -- B24 (0086 §M): WAITING for capacity — kept in its place, the overload restated under the new version; never re-routed afresh here.
    v_state := 'deprioritized';
    v_ovl := executive.attention_overload(pol.rules, x.evaluation -> 'dimensions', x.owner_principal_id, p_tenant, p_domain, x.item_id);
    v_eval := v_eval || jsonb_build_object('overload', coalesce(v_ovl, (x.evaluation -> 'overload') || jsonb_build_object('awaiting_rebalance', true,
                'note', format('policy version %s frees this item from the overload rule; the rebalance elevates the waiting items in rank order', pol.version))));
    v_route := jsonb_build_object('route_roles', to_jsonb(x.route_roles), 'due_at', NULL, 'escalations', x.escalations);
  ELSE
    v_route := executive.attention_route(pol.rules, x.signal_class, v_eval ->> 'outcome', x.owner_principal_id, p_tenant, p_domain, CASE WHEN x.state = 'deprioritized' THEN v_eval END);
    IF v_route ? 'overload' THEN v_eval := v_eval || jsonb_build_object('overload', v_route -> 'overload'); END IF;
    v_state := v_route ->> 'state';
    -- An item ALREADY ROUTED (open, escalated, unrouted) that stays material keeps its escalation history: the count, the deadline it
    -- is running against and the roles it has reached (joined with the new version's) — a policy change never re-pages an exhausted
    -- chain from zero. Only a deprioritized item that becomes material is routed afresh.
    IF x.state IN ('open', 'escalated', 'unrouted') AND v_eval ->> 'outcome' = 'material' THEN
      v_state := CASE WHEN x.state = 'unrouted' THEN v_state ELSE x.state END;
      v_route := jsonb_build_object('route_roles', to_jsonb(ARRAY(SELECT DISTINCT unnest(x.route_roles || ARRAY(SELECT jsonb_array_elements_text(v_route -> 'route_roles'))) ORDER BY 1)),
                                    'due_at', coalesce(x.due_at::text, v_route ->> 'due_at'), 'escalations', greatest(x.escalations, coalesce((v_route ->> 'escalations')::int, 0)));
    END IF;
  END IF;
  UPDATE executive.attention_items
     SET outcome = v_eval ->> 'outcome', state = v_state, policy_id = pol.policy_id, policy_version = pol.version, evaluation = v_eval,
         route_roles = ARRAY(SELECT jsonb_array_elements_text(v_route -> 'route_roles')),
         due_at = (v_route ->> 'due_at')::timestamptz, escalations = coalesce((v_route ->> 'escalations')::int, x.escalations),
         suppressed_until = CASE WHEN v_state = 'suppressed' THEN x.suppressed_until ELSE NULL END, updated_at = v_at
   WHERE item_id = p_item;
  PERFORM executive.attention_event(p_item, p_tenant, p_domain, 'item.reevaluated', p_actor,
            jsonb_build_object('from_version', x.policy_version, 'to_version', pol.version, 'from_outcome', x.outcome, 'to_outcome', v_eval ->> 'outcome', 'from_state', x.state, 'to_state', v_state,
                               'reasons', v_eval -> 'reasons', 'cause_event_id', p_cause_event_id)
            || CASE WHEN v_eval ? 'overload' THEN jsonb_build_object('overload', v_eval -> 'overload') ELSE '{}'::jsonb END, p_correlation);
  RETURN jsonb_build_object('item_id', p_item, 'changed', true, 'from_version', x.policy_version, 'to_version', pol.version, 'from_outcome', x.outcome, 'to_outcome', v_eval ->> 'outcome', 'from_state', x.state, 'to_state', v_state);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.reevaluate_attention_item(uuid,uuid,uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.reevaluate_attention_item(uuid,uuid,uuid,uuid,uuid,uuid) TO eye_commit;

-- ============================================================
-- §M6 THE REBALANCE — the waiting items elevated in rank order when capacity frees
-- ============================================================
CREATE OR REPLACE FUNCTION executive.rebalance_attention(p_tenant uuid, p_domain uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE x executive.attention_items%ROWTYPE; v_rules jsonb; v_load jsonb; v_route jsonb; v_rank jsonb; v_expl text; v_exempt boolean; v_at timestamptz := clock_timestamp();
        v_elevated jsonb := '[]'::jsonb; v_waiting jsonb := '[]'::jsonb; v_blocked uuid[] := '{}';
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.attention.rebalance', 'executive.attention.tick']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'attention rebalance rejected: rebalanced by the acting principal' USING ERRCODE = '42501'; END IF;
  -- In RANK order across the domain; once an owner is still at the cap, that owner's lower-ranked waiting items stay where they are.
  FOR x IN SELECT * FROM executive.attention_items i
            WHERE i.tenant_id = p_tenant AND i.domain_id = p_domain AND i.state = 'deprioritized' AND i.outcome = 'material' AND i.evaluation ? 'overload'
            ORDER BY executive.attention_rank_key(i.evaluation -> 'dimensions'), i.created_at, i.item_id LIMIT 200 FOR UPDATE LOOP
    IF x.owner_principal_id = ANY (v_blocked) THEN v_waiting := v_waiting || to_jsonb(x.item_id); CONTINUE; END IF;
    SELECT a.rules INTO v_rules FROM executive.attention_policies a WHERE a.policy_id = x.policy_id;
    v_load := executive.attention_owner_load(v_rules, x.owner_principal_id, p_tenant, p_domain, x.item_id);
    v_exempt := executive.attention_overload_exempt(v_rules, x.evaluation -> 'dimensions');
    IF NOT v_exempt AND x.owner_principal_id IS NOT NULL AND (v_load ->> 'cap') IS NOT NULL AND (v_load ->> 'open')::int >= (v_load ->> 'cap')::int THEN
      v_blocked := v_blocked || x.owner_principal_id; v_waiting := v_waiting || to_jsonb(x.item_id); CONTINUE;
    END IF;
    -- routed afresh under the item's OWN version (its roles, a new deadline); the capacity was just measured, so the 6-argument route
    v_route := executive.attention_route(v_rules, x.signal_class, 'material', x.owner_principal_id, p_tenant, p_domain);
    v_rank := executive.attention_rank(x.evaluation -> 'dimensions');
    v_expl := CASE
      WHEN v_exempt THEN format('elevated: its consequence %s is exempt from the overload rule under policy version %s (C3 and C4 are never held for capacity) — %s',
                                x.evaluation #>> '{dimensions,consequence}', x.policy_version, v_rank ->> 'explanation')
      WHEN (v_load ->> 'cap') IS NULL THEN format('elevated: policy version %s names no per-owner cap — %s', x.policy_version, v_rank ->> 'explanation')
      ELSE format('capacity freed: the owner holds %s of %s open or escalated item(s)%s; elevated as the highest-ranked item waiting — %s',
                  v_load ->> 'open', v_load ->> 'cap', CASE WHEN v_load ->> 'window_hours' IS NULL THEN '' ELSE format(' moved into the queue within %s h', v_load ->> 'window_hours') END,
                  v_rank ->> 'explanation') END;
    UPDATE executive.attention_items
       SET state = v_route ->> 'state', route_roles = ARRAY(SELECT jsonb_array_elements_text(v_route -> 'route_roles')), due_at = (v_route ->> 'due_at')::timestamptz,
           escalations = coalesce((v_route ->> 'escalations')::int, 0),
           evaluation = x.evaluation || jsonb_build_object('elevation', jsonb_build_object('at', v_at, 'explanation', v_expl, 'capacity', v_load, 'rank', v_rank, 'exempt', v_exempt)),
           updated_at = v_at
     WHERE item_id = x.item_id;
    PERFORM executive.attention_event(x.item_id, p_tenant, p_domain, 'item.elevated', p_actor,
              jsonb_build_object('from_state', 'deprioritized', 'to_state', v_route ->> 'state', 'policy_version', x.policy_version, 'rank', v_rank, 'explanation', v_expl,
                                 'capacity', v_load, 'exempt', v_exempt, 'route_roles', v_route -> 'route_roles', 'due_at', v_route -> 'due_at',
                                 'unrouted', coalesce((v_route ->> 'unrouted')::boolean, false), 'waited_since', x.updated_at), p_correlation);
    v_elevated := v_elevated || jsonb_build_object('item_id', x.item_id, 'to_state', v_route ->> 'state', 'explanation', v_expl);
  END LOOP;
  RETURN jsonb_build_object('elevated', v_elevated, 'waiting', v_waiting, 'at', v_at);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.rebalance_attention(uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.rebalance_attention(uuid,uuid,uuid,uuid) TO eye_commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §G (section `governance`)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0086 §G (B24 part `governance`) — CP-6 B24: THE ATTENTION QUEUE'S GOVERNANCE (2026-09-25). F-P6-07; V03-T-263 and V03-T-171 (a
-- suppression a second person approves), PR-44-006 and CAP-EO-06 (the queue EVALUATED: precision and recall by class, ranking
-- stability, severe-item visibility, escalation latency), AT-44, V00-T-069 ("delegate review").
--
-- THE GAP. A suppression was one person's act (0083 §5: the item's owner or a holder of a routed role mutes it, reasoned and expiring)
-- even where the domain wants a second person to agree (the prelude admits suppression.approval_required and approver_roles but nothing
-- honoured them); an item could not be handed to another person for a while (V00-T-069 "delegate review") — executive.delegations
-- (0066 §9) lends a ROOM's standing (room_id NOT NULL), not an item's; and nobody could say whether the queue was any good: no person
-- recorded what an item turned out to be, and no record measured the queue from its ledgers.
--
-- THE MECHANISM.
-- (G1) SUPPRESSION APPROVAL: executive.attention_suppression_requests. executive.suppress_attention_item re-declared (0083 §5 copied
--   whole): when the class's rule in the item's OWN policy version says approval_required, the act records a REQUEST (one pending per
--   item) and item.suppression_requested — the item STAYS LIVE and keeps escalating; executive.decide_attention_suppression approves or
--   refuses it — the decider is never the requester (42501, separation of duties) and holds one of the approver roles of the item's
--   policy version; an approved expiry is capped at the decision instant + the class's max_hours; item.suppression_decided (and, on an
--   approval, item.suppressed — the effect, as 0083 records it). A pending request past its `until` EXPIRES, visibly
--   (executive.expire_attention_suppressions: the approvers' sweep on demand and the attention tick's step `suppression-expiry`;
--   item.suppression_decided {decision: expired}). Without approval_required the 0083 behaviour is byte-identical.
-- (G2) DELEGATION: executive.attention_delegations — an item's standing lent by a person who acts on it IN THEIR OWN RIGHT (the owner,
--   a holder of a routed role, an administrator) to an ACTIVE HUMAN holding one of the acknowledgement roles, for a bounded window,
--   with a reason; idempotent on (delegator, request_key) under the request digest (the executive.requests idiom, 0066 §9); ended by the
--   delegator, the delegate, the owner or an administrator (item.delegated / item.delegation_ended). executive.may_act_on_item
--   re-declared (0083 §5 copied whole) honours an active delegation in its window. The OWNER STAYS ACCOUNTABLE: the item's owner is
--   never changed; a delegate never delegates further.
-- (G3) DISPOSITION: executive.record_attention_disposition — what the item turned out to be (actioned | not_material | duplicate |
--   late | missed) by a person who may act on it; item.disposition (the latest one stands; the same one again answers `repeated`).
-- (G4) QUEUE EVALUATION: executive.attention_queue_evaluations (the 0066 §6 method_evaluations shape, append-only) +
--   executive.evaluate_attention_queue — a NAMED HUMAN's act (executive, domain_admin or platform_admin; human-gated at the PDP): over
--   the items created in the window, PRECISION and RECALL by class (positive: material, acknowledged, then actioned; negative:
--   not_material, duplicate, closed without acknowledgement; a recall MISS: `missed` recorded on an item the engine judged below its
--   thresholds or abstained on, or an item later elevated or re-evaluated to material), each ABSTAINING below min_sample; RANKING
--   STABILITY (Kendall tau-b of evaluation.rank at the window's start vs its end — ABSTAINING when no rank exists: the rank is another
--   section's, read if present); SEVERE-ITEM VISIBILITY for C3/C4 (acknowledged before the first deadline; delivered before it — read
--   from executive.attention_deliveries only when that ledger exists, else stated not measurable; never deprioritized for overload;
--   the time to acknowledgement p50/p90; every breach listed); ESCALATION LATENCY (an escalation's instant after the deadline it
--   answered, p50/p90/max). The measures are computed INSIDE the write from the ledgers; the verdict (measured | partial | abstained)
--   and its reason with them.
--
-- NOT HERE (stated): validate_attention_rules (the prelude declares suppression.approval_required and approver_roles);
-- evaluate_attention, attention_route and escalate_attention_due (other sections' — an item with a pending request keeps escalating
-- under whichever body stands); the timer host (§T: this section only REGISTERS its tick step); the rank itself (another section's;
-- read from evaluation->'rank' — a number, or {position: number} — in the item's events and its evaluation); the delivery ledger
-- (another section's; read only if present); per-person delegation preferences; a delegation of a whole class or queue (an item's
-- only); an event on the outbox for any of these acts (the interface register stays 50/0/0 — B24 adds no interface).

-- ============================================================
-- §G0 THE TABLES
-- ============================================================
CREATE TABLE executive.attention_suppression_requests (
  request_id      uuid PRIMARY KEY,
  scope           text NOT NULL,
  tenant_id       uuid NOT NULL,
  domain_id       uuid NOT NULL,
  item_id         uuid NOT NULL REFERENCES executive.attention_items(item_id),
  requested_by    uuid NOT NULL,
  requested_at    timestamptz NOT NULL DEFAULT clock_timestamp(),
  until           timestamptz NOT NULL,
  reason          text NOT NULL CHECK (length(btrim(reason)) >= 8),
  policy_id       uuid NOT NULL REFERENCES executive.attention_policies(policy_id),
  policy_version  int NOT NULL,
  max_hours       numeric NOT NULL CHECK (max_hours > 0),
  approver_roles  text[] NOT NULL CHECK (cardinality(approver_roles) >= 1),
  from_state      text NOT NULL,
  state           text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'approved', 'refused', 'expired')),
  decided_by      uuid,
  decided_at      timestamptz,
  decision_reason text,
  approved_until  timestamptz,
  capped          boolean,
  correlation_id  uuid NOT NULL,
  CONSTRAINT xasr_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT xasr_window CHECK (until > requested_at),
  CONSTRAINT xasr_decided CHECK ((state = 'pending') = (decided_at IS NULL)),
  CONSTRAINT xasr_decider CHECK ((state IN ('approved', 'refused')) = (decided_by IS NOT NULL) AND (decided_by IS NULL OR length(btrim(coalesce(decision_reason, ''))) >= 8)),
  -- SEPARATION OF DUTIES, in the record itself: the requester never decides their own request
  CONSTRAINT xasr_separation CHECK (decided_by IS NULL OR decided_by <> requested_by),
  CONSTRAINT xasr_approved CHECK ((state = 'approved') = (approved_until IS NOT NULL) AND (approved_until IS NULL) = (capped IS NULL))
);
CREATE UNIQUE INDEX xasr_one_pending ON executive.attention_suppression_requests (item_id) WHERE state = 'pending';
CREATE INDEX xasr_queue ON executive.attention_suppression_requests (tenant_id, domain_id, state, until);
COMMENT ON TABLE executive.attention_suppression_requests IS 'B24 (0086 §G1; V03-T-263, V03-T-171): a suppression that needs a second person — requested by one who may act on the item (the item stays live and keeps escalating), approved or refused by another holding the approver roles of the item''s policy version (never the requester), or expired when its instant passes undecided; decided once, never rewritten, never deleted.';
-- A request is decided ONCE (pending → approved | refused | expired, the decision's own fields only); nothing is deleted.
CREATE OR REPLACE FUNCTION executive.attention_suppression_request_decided_once() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'attention suppression requests are never deleted' USING ERRCODE = '55000'; END IF;
  IF OLD.state = 'pending' AND NEW.state IN ('approved', 'refused', 'expired')
     AND (to_jsonb(NEW) - 'state' - 'decided_by' - 'decided_at' - 'decision_reason' - 'approved_until' - 'capped')
       = (to_jsonb(OLD) - 'state' - 'decided_by' - 'decided_at' - 'decision_reason' - 'approved_until' - 'capped') THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'attention suppression request % is %; a request is decided once and never rewritten', OLD.request_id, OLD.state USING ERRCODE = '55000';
END $$;
CREATE TRIGGER xasr_decided_once BEFORE UPDATE OR DELETE ON executive.attention_suppression_requests FOR EACH ROW EXECUTE FUNCTION executive.attention_suppression_request_decided_once();

CREATE TABLE executive.attention_delegations (
  delegation_id      uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  item_id            uuid NOT NULL REFERENCES executive.attention_items(item_id),
  from_principal_id  uuid NOT NULL,
  to_principal_id    uuid NOT NULL,
  owner_principal_id uuid,
  reason             text NOT NULL CHECK (length(btrim(reason)) >= 8),
  from_at            timestamptz NOT NULL DEFAULT clock_timestamp(),
  until_at           timestamptz NOT NULL,
  state              text NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'ended')),
  ended_at           timestamptz,
  ended_by           uuid,
  end_reason         text,
  request_key        text NOT NULL CHECK (length(request_key) BETWEEN 1 AND 200),
  request_digest     text NOT NULL CHECK (request_digest ~ '^[0-9a-f]{64}$'),
  correlation_id     uuid NOT NULL,
  CONSTRAINT xadl_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT xadl_window CHECK (until_at > from_at),
  CONSTRAINT xadl_not_self CHECK (to_principal_id <> from_principal_id),
  CONSTRAINT xadl_ended CHECK ((state = 'ended') = (ended_at IS NOT NULL) AND (ended_at IS NULL) = (ended_by IS NULL) AND (ended_at IS NULL) = (end_reason IS NULL)),
  CONSTRAINT xadl_key_once UNIQUE (tenant_id, domain_id, from_principal_id, request_key)
);
CREATE INDEX xadl_item ON executive.attention_delegations (item_id, to_principal_id, state);
COMMENT ON TABLE executive.attention_delegations IS 'B24 (0086 §G2; V00-T-069 "delegate review"): an attention ITEM''s standing lent by a person who acts on it in their own right to an active human holding an acknowledgement role, for a bounded window, with a reason; idempotent on (delegator, request_key) under the request digest; honoured by executive.may_act_on_item in its window; the owner stays accountable (never changed); ended once. Not executive.delegations (0066 §9), which lends a ROOM''s standing.';
CREATE OR REPLACE FUNCTION executive.attention_delegation_ended_once() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'attention delegations are never deleted' USING ERRCODE = '55000'; END IF;
  IF OLD.state = 'active' AND NEW.state = 'ended'
     AND (to_jsonb(NEW) - 'state' - 'ended_at' - 'ended_by' - 'end_reason') = (to_jsonb(OLD) - 'state' - 'ended_at' - 'ended_by' - 'end_reason') THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'attention delegation % is %; a delegation is ended once and never rewritten', OLD.delegation_id, OLD.state USING ERRCODE = '55000';
END $$;
CREATE TRIGGER xadl_ended_once BEFORE UPDATE OR DELETE ON executive.attention_delegations FOR EACH ROW EXECUTE FUNCTION executive.attention_delegation_ended_once();

CREATE TABLE executive.attention_queue_evaluations (
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
  CONSTRAINT xaqe_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT xaqe_window CHECK (window_to >= window_from)
);
CREATE INDEX xaqe_domain ON executive.attention_queue_evaluations (tenant_id, domain_id, evaluated_at);
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON executive.attention_queue_evaluations FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE executive.attention_queue_evaluations IS 'B24 (0086 §G4; PR-44-006, CAP-EO-06): the attention queue measured over a window by a named human — precision and recall by class, ranking stability, severe-item visibility, escalation latency — computed inside the write from the queue''s ledgers, each measure abstaining below min_sample, with the verdict and its reason; append-only.';

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['attention_suppression_requests', 'attention_delegations', 'attention_queue_evaluations'] LOOP
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

-- The roles the PDP admits to acknowledge an item (pdp.service.ts, executive.attention.item.acknowledge): a delegate holds one, so the
-- delegate the port admits is a person the policy lets act.
CREATE OR REPLACE FUNCTION executive.attention_acknowledgement_roles() RETURNS text[]
LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY['platform_admin', 'domain_admin', 'executive', 'decision_owner', 'decision_authority', 'decision_approver', 'strategy_owner',
  'forecast_owner', 'twin_owner', 'simulation_operator', 'collection_manager', 'extraction_manager', 'knowledge_owner', 'resolution_manager', 'record_authority',
  'retention_steward', 'ontology_steward', 'domain_analyst'] $$;
GRANT EXECUTE ON FUNCTION executive.attention_acknowledgement_roles() TO eye_app, eye_commit;

-- ============================================================
-- §G2 WHO MAY ACT — executive.may_act_on_item (0083 §5 copied whole; the delegation clause added)
-- ============================================================
-- Who may act on an item: its owner, or an active human holding one of its route roles (the escalation roles joined in), or a
-- domain / platform administrator — or (B24) an active human the item is DELEGATED to, within the delegation's window.
CREATE OR REPLACE FUNCTION executive.may_act_on_item(x executive.attention_items, p_actor uuid) RETURNS boolean
STABLE SECURITY DEFINER SET search_path = executive, identity, pg_catalog, pg_temp AS $$
  SELECT (x.owner_principal_id IS NOT NULL AND x.owner_principal_id = p_actor)
      OR executive.holds_role(p_actor, x.tenant_id, x.domain_id, x.route_roles || ARRAY['domain_admin', 'platform_admin'])
      -- B24 (0086 §G2): an active delegation of THIS item to the actor, in its window, the delegate still an active human
      OR EXISTS (SELECT 1 FROM executive.attention_delegations d JOIN identity.principals p ON p.id = d.to_principal_id
                  WHERE d.item_id = x.item_id AND d.to_principal_id = p_actor AND d.state = 'active' AND d.from_at <= now() AND d.until_at > now()
                    AND p.kind = 'human' AND p.status = 'active');
$$ LANGUAGE sql;
REVOKE ALL ON FUNCTION executive.may_act_on_item(executive.attention_items, uuid) FROM PUBLIC;

-- ============================================================
-- §G1 SUPPRESSION APPROVAL
-- ============================================================
-- SUPPRESS: time-bound, reasoned, scoped to the item, within the class's maximum under the item's OWN policy version, by a person who
-- may act on it; visible (the state and the event), never silent; it lapses (escalate-due reopens it).
-- B24 (0086 §G1): when that version's rule says approval_required, the act records a REQUEST instead (one pending per item) and the item
-- STAYS LIVE — a second person decides it (executive.decide_attention_suppression). Without approval_required: 0083's body, unchanged.
CREATE OR REPLACE FUNCTION executive.suppress_attention_item(p_item uuid, p_tenant uuid, p_domain uuid, p_until timestamptz, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE x executive.attention_items%ROWTYPE; s jsonb; v_at timestamptz := clock_timestamp();
        /* B24 (0086 §G1) */ q executive.attention_suppression_requests%ROWTYPE; v_request uuid; v_roles text[]; /* end B24 */
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.attention.item.suppress']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'attention item rejected: suppressed by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO x FROM executive.attention_items i WHERE i.item_id = p_item AND i.tenant_id = p_tenant AND i.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'attention item rejected: no such item in this domain' USING ERRCODE = '23503'; END IF;
  IF NOT executive.may_act_on_item(x, p_actor) THEN RAISE EXCEPTION 'attention item rejected: item % is routed to % (owner %); the acting principal is neither', p_item, array_to_string(x.route_roles, ', '), coalesce(x.owner_principal_id::text, 'none') USING ERRCODE = '42501'; END IF;
  IF x.state NOT IN ('open', 'escalated', 'unrouted', 'acknowledged') THEN RAISE EXCEPTION 'attention item rejected: item % is %; only a live item is suppressed', p_item, x.state USING ERRCODE = '22023'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN RAISE EXCEPTION 'attention item rejected: a suppression carries a reason of at least 8 characters (no silent mute)' USING ERRCODE = '22023'; END IF;
  SELECT a.rules #> ARRAY['classes', x.signal_class, 'suppression'] INTO s FROM executive.attention_policies a WHERE a.policy_id = x.policy_id;
  IF s IS NULL OR NOT coalesce((s ->> 'allowed')::boolean, false) THEN
    RAISE EXCEPTION 'attention item rejected: policy version % does not allow suppressing %', coalesce(x.policy_version::text, 'none'), x.signal_class USING ERRCODE = '22023';
  END IF;
  IF p_until IS NULL OR p_until <= v_at OR p_until > v_at + make_interval(hours => (s ->> 'max_hours')::int) THEN
    RAISE EXCEPTION 'attention item rejected: a suppression expires after now and within % hours (policy version %)', s ->> 'max_hours', x.policy_version USING ERRCODE = '22023';
  END IF;
  /* B24 (0086 §G1): a suppression the item's version says a second person approves — a REQUEST; the item stays as it is (live, escalating). */
  IF coalesce((s ->> 'approval_required')::boolean, false) THEN
    SELECT * INTO q FROM executive.attention_suppression_requests r WHERE r.item_id = p_item AND r.state = 'pending' FOR UPDATE;
    IF FOUND THEN
      IF q.until > v_at THEN
        RAISE EXCEPTION 'attention suppression rejected: item % already has a pending suppression request % (until %); it is decided or expires first', p_item, q.request_id, q.until USING ERRCODE = '23505';
      END IF;
      -- the pending request lapsed undecided: recorded EXPIRED here, visibly, before the new one
      UPDATE executive.attention_suppression_requests SET state = 'expired', decided_at = v_at WHERE request_id = q.request_id;
      PERFORM executive.attention_event(p_item, p_tenant, p_domain, 'item.suppression_decided', p_actor,
                jsonb_build_object('request_id', q.request_id, 'decision', 'expired', 'requested_by', q.requested_by, 'until', q.until, 'expired_at', v_at, 'item_stays_live', true), p_correlation);
    END IF;
    SELECT coalesce(array_agg(e ORDER BY e), '{}') INTO v_roles FROM jsonb_array_elements_text(s -> 'approver_roles') e;
    v_request := gen_random_uuid();
    INSERT INTO executive.attention_suppression_requests (request_id, scope, tenant_id, domain_id, item_id, requested_by, requested_at, until, reason, policy_id, policy_version, max_hours, approver_roles, from_state, correlation_id)
    VALUES (v_request, 'DOMAIN', p_tenant, p_domain, p_item, p_actor, v_at, p_until, btrim(p_reason), x.policy_id, x.policy_version, (s ->> 'max_hours')::numeric, v_roles, x.state, p_correlation);
    PERFORM executive.attention_event(p_item, p_tenant, p_domain, 'item.suppression_requested', p_actor,
              jsonb_build_object('request_id', v_request, 'from_state', x.state, 'until', p_until, 'reason', btrim(p_reason), 'scope', 'item', 'policy_version', x.policy_version,
                                 'max_hours', s -> 'max_hours', 'approver_roles', to_jsonb(v_roles), 'item_stays_live', true), p_correlation);
    RETURN jsonb_build_object('item_id', p_item, 'state', x.state, 'from_state', x.state, 'until', p_until, 'reason', btrim(p_reason), 'by', p_actor,
                              'approval_required', true, 'request_id', v_request, 'request_state', 'pending', 'approver_roles', to_jsonb(v_roles));
  END IF;
  /* end B24 */
  UPDATE executive.attention_items SET state = 'suppressed', suppressed_until = p_until, updated_at = v_at WHERE item_id = p_item;
  PERFORM executive.attention_event(p_item, p_tenant, p_domain, 'item.suppressed', p_actor,
            jsonb_build_object('from_state', x.state, 'until', p_until, 'reason', btrim(p_reason), 'scope', 'item', 'policy_version', x.policy_version, 'max_hours', s -> 'max_hours'), p_correlation);
  RETURN jsonb_build_object('item_id', p_item, 'state', 'suppressed', 'from_state', x.state, 'until', p_until, 'reason', btrim(p_reason), 'by', p_actor);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.suppress_attention_item(uuid,uuid,uuid,timestamptz,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.suppress_attention_item(uuid,uuid,uuid,timestamptz,text,uuid,uuid) TO eye_commit;

-- The answer of a request (the decide port and the sweep).
CREATE OR REPLACE FUNCTION executive.attention_suppression_answer(q executive.attention_suppression_requests) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_object('request_id', q.request_id, 'item_id', q.item_id, 'state', q.state, 'requested_by', q.requested_by, 'requested_at', q.requested_at, 'until', q.until,
                            'reason', q.reason, 'policy_version', q.policy_version, 'max_hours', q.max_hours, 'approver_roles', to_jsonb(q.approver_roles), 'from_state', q.from_state,
                            'decided_by', q.decided_by, 'decided_at', q.decided_at, 'decision_reason', q.decision_reason, 'approved_until', q.approved_until, 'capped', q.capped);
$$;
REVOKE ALL ON FUNCTION executive.attention_suppression_answer(executive.attention_suppression_requests) FROM PUBLIC;

-- DECIDE: a SECOND person approves or refuses a pending request — never the requester (separation of duties), a holder of the approver
-- roles of the item's policy version (the version standing at the decision; the request's recorded roles when that version names none);
-- the approved expiry is capped at the decision instant + that version's max_hours; a request whose instant has passed is not decided
-- (the sweep records it expired); a closed or no-longer-live item is not suppressed.
CREATE OR REPLACE FUNCTION executive.decide_attention_suppression(p_request uuid, p_tenant uuid, p_domain uuid, p_decision text, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE q executive.attention_suppression_requests%ROWTYPE; x executive.attention_items%ROWTYPE; s jsonb; v_roles text[]; v_until timestamptz; v_at timestamptz := clock_timestamp();
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.attention.suppression.decide']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'attention suppression rejected: decided by the acting principal' USING ERRCODE = '42501'; END IF;
  IF p_decision IS NULL OR p_decision NOT IN ('approve', 'refuse') THEN RAISE EXCEPTION 'attention suppression rejected: the decision is approve or refuse' USING ERRCODE = '22023'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN RAISE EXCEPTION 'attention suppression rejected: a decision carries a reason of at least 8 characters' USING ERRCODE = '22023'; END IF;
  SELECT * INTO q FROM executive.attention_suppression_requests r WHERE r.request_id = p_request AND r.tenant_id = p_tenant AND r.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'attention suppression rejected: no such suppression request in this domain' USING ERRCODE = '23503'; END IF;
  IF q.state <> 'pending' THEN RAISE EXCEPTION 'attention suppression rejected: request % is %; only a pending request is decided', p_request, q.state USING ERRCODE = '22023'; END IF;
  IF q.requested_by = p_actor THEN
    RAISE EXCEPTION 'attention suppression rejected: the requester does not decide their own request (separation of duties); a holder of % decides it', array_to_string(q.approver_roles, ', ') USING ERRCODE = '42501';
  END IF;
  SELECT * INTO x FROM executive.attention_items i WHERE i.item_id = q.item_id FOR UPDATE;
  SELECT a.rules #> ARRAY['classes', x.signal_class, 'suppression'] INTO s FROM executive.attention_policies a WHERE a.policy_id = x.policy_id;
  v_roles := CASE WHEN jsonb_typeof(s -> 'approver_roles') = 'array' AND jsonb_array_length(s -> 'approver_roles') > 0
                  THEN ARRAY(SELECT jsonb_array_elements_text(s -> 'approver_roles') ORDER BY 1) ELSE q.approver_roles END;
  IF NOT executive.holds_role(p_actor, p_tenant, p_domain, v_roles) THEN
    RAISE EXCEPTION 'attention suppression rejected: the decider holds none of the approver roles % (policy version %)', array_to_string(v_roles, ', '), coalesce(x.policy_version::text, 'none') USING ERRCODE = '42501';
  END IF;
  IF q.until <= v_at THEN
    RAISE EXCEPTION 'attention suppression rejected: request % lapsed at %, before it was decided; the expiry sweep records it expired', p_request, q.until USING ERRCODE = '22023';
  END IF;
  IF p_decision = 'approve' THEN
    IF x.state NOT IN ('open', 'escalated', 'unrouted', 'acknowledged') THEN
      RAISE EXCEPTION 'attention suppression rejected: item % is %; only a live item is suppressed', x.item_id, x.state USING ERRCODE = '22023';
    END IF;
    IF s IS NULL OR NOT coalesce((s ->> 'allowed')::boolean, false) THEN
      RAISE EXCEPTION 'attention suppression rejected: policy version % no longer allows suppressing %', coalesce(x.policy_version::text, 'none'), x.signal_class USING ERRCODE = '22023';
    END IF;
    v_until := least(q.until, v_at + (s ->> 'max_hours')::numeric * interval '1 hour');
    UPDATE executive.attention_suppression_requests SET state = 'approved', decided_by = p_actor, decided_at = v_at, decision_reason = btrim(p_reason), approved_until = v_until, capped = v_until < q.until
     WHERE request_id = p_request RETURNING * INTO q;
    UPDATE executive.attention_items SET state = 'suppressed', suppressed_until = v_until, updated_at = v_at WHERE item_id = x.item_id;
    PERFORM executive.attention_event(x.item_id, p_tenant, p_domain, 'item.suppression_decided', p_actor,
              jsonb_build_object('request_id', p_request, 'decision', 'approve', 'requested_by', q.requested_by, 'until', q.until, 'approved_until', v_until, 'capped', v_until < q.until,
                                 'reason', btrim(p_reason), 'approver_roles', to_jsonb(v_roles), 'policy_version', x.policy_version), p_correlation);
    -- the effect, as 0083 records a suppression (the readers of item.suppressed see an approved one the same way)
    PERFORM executive.attention_event(x.item_id, p_tenant, p_domain, 'item.suppressed', p_actor,
              jsonb_build_object('from_state', x.state, 'until', v_until, 'reason', q.reason, 'scope', 'item', 'policy_version', x.policy_version, 'max_hours', s -> 'max_hours',
                                 'request_id', p_request, 'requested_by', q.requested_by, 'approved_by', p_actor), p_correlation);
  ELSE
    UPDATE executive.attention_suppression_requests SET state = 'refused', decided_by = p_actor, decided_at = v_at, decision_reason = btrim(p_reason) WHERE request_id = p_request RETURNING * INTO q;
    PERFORM executive.attention_event(x.item_id, p_tenant, p_domain, 'item.suppression_decided', p_actor,
              jsonb_build_object('request_id', p_request, 'decision', 'refuse', 'requested_by', q.requested_by, 'until', q.until, 'reason', btrim(p_reason), 'approver_roles', to_jsonb(v_roles),
                                 'policy_version', x.policy_version, 'item_stays_live', true), p_correlation);
  END IF;
  RETURN executive.attention_suppression_answer(q) || jsonb_build_object('item_state', CASE WHEN p_decision = 'approve' THEN 'suppressed' ELSE x.state END);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.decide_attention_suppression(uuid,uuid,uuid,text,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.decide_attention_suppression(uuid,uuid,uuid,text,text,uuid,uuid) TO eye_commit;

-- EXPIRE: every pending request whose instant has passed, recorded EXPIRED (item.suppression_decided {decision: expired}) — the item was
-- never suppressed by it and stays live. Deterministic and bounded (≤ 200 per call); the approvers' sweep on demand and the attention
-- tick's step `suppression-expiry`.
CREATE OR REPLACE FUNCTION executive.expire_attention_suppressions(p_tenant uuid, p_domain uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE q executive.attention_suppression_requests%ROWTYPE; v_at timestamptz := clock_timestamp(); v_out jsonb := '[]'::jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.attention.suppression.decide', 'executive.attention.tick']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  FOR q IN SELECT * FROM executive.attention_suppression_requests r WHERE r.tenant_id = p_tenant AND r.domain_id = p_domain AND r.state = 'pending' AND r.until <= v_at
            ORDER BY r.until, r.request_id LIMIT 200 FOR UPDATE LOOP
    UPDATE executive.attention_suppression_requests SET state = 'expired', decided_at = v_at WHERE request_id = q.request_id;
    PERFORM executive.attention_event(q.item_id, p_tenant, p_domain, 'item.suppression_decided', p_actor,
              jsonb_build_object('request_id', q.request_id, 'decision', 'expired', 'requested_by', q.requested_by, 'until', q.until, 'expired_at', v_at, 'item_stays_live', true), p_correlation);
    v_out := v_out || jsonb_build_object('request_id', q.request_id, 'item_id', q.item_id, 'until', q.until, 'requested_by', q.requested_by);
  END LOOP;
  RETURN jsonb_build_object('expired', v_out, 'at', v_at);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.expire_attention_suppressions(uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.expire_attention_suppressions(uuid,uuid,uuid,uuid) TO eye_commit;

-- ============================================================
-- §G2 DELEGATION
-- ============================================================
CREATE OR REPLACE FUNCTION executive.attention_delegation_answer(d executive.attention_delegations, p_repeated boolean) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_object('delegation_id', d.delegation_id, 'repeated', p_repeated, 'item_id', d.item_id, 'from', d.from_principal_id, 'to', d.to_principal_id,
                            'owner', d.owner_principal_id, 'owner_stays_accountable', true, 'reason', d.reason, 'from_at', d.from_at, 'until', d.until_at, 'state', d.state,
                            'ended_at', d.ended_at, 'ended_by', d.ended_by, 'end_reason', d.end_reason, 'request_key', d.request_key, 'request_digest', d.request_digest);
$$;
REVOKE ALL ON FUNCTION executive.attention_delegation_answer(executive.attention_delegations, boolean) FROM PUBLIC;

-- DELEGATE: exactly once on the delegator's key under the request digest (the same key and digest answer the recorded delegation; a
-- different digest under the key is refused); by a person who acts on the item IN THEIR OWN RIGHT (a delegate does not delegate further);
-- to an ACTIVE HUMAN of the tenant holding one of the acknowledgement roles (never an agent), other than the delegator; a live item; a
-- reason; a window after now and within 720 hours; one active delegation per (item, delegate).
CREATE OR REPLACE FUNCTION executive.delegate_attention_item(p_delegation_id uuid, p_tenant uuid, p_domain uuid, p_item uuid, p_to uuid, p_reason text, p_until timestamptz,
                                                             p_request_key text, p_request_digest text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE x executive.attention_items%ROWTYPE; d executive.attention_delegations%ROWTYPE; v_at timestamptz := clock_timestamp(); v_kind text; v_status text; v_key text := btrim(coalesce(p_request_key, ''));
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.attention.item.delegate']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'attention delegation rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF length(v_key) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'attention delegation rejected: request_key (1–200 characters) is the delegator''s idempotency key' USING ERRCODE = '22023'; END IF;
  IF p_request_digest IS NULL OR p_request_digest !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'attention delegation rejected: the request digest is a SHA-256 hex digest' USING ERRCODE = '22023'; END IF;
  -- Exactly once: the same key with the same delegation answers the one recorded; a different delegation under the key is refused.
  SELECT * INTO d FROM executive.attention_delegations g WHERE g.tenant_id = p_tenant AND g.domain_id = p_domain AND g.from_principal_id = p_actor AND g.request_key = v_key FOR UPDATE;
  IF FOUND THEN
    IF d.request_digest <> p_request_digest THEN
      RAISE EXCEPTION 'attention delegation rejected: request key % was already used by this principal for a different delegation (digest % recorded, % offered); a new delegation takes a new key',
        v_key, left(d.request_digest, 12), left(p_request_digest, 12) USING ERRCODE = '23505';
    END IF;
    RETURN executive.attention_delegation_answer(d, true);
  END IF;
  SELECT * INTO x FROM executive.attention_items i WHERE i.item_id = p_item AND i.tenant_id = p_tenant AND i.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'attention delegation rejected: no such item in this domain' USING ERRCODE = '23503'; END IF;
  IF NOT ((x.owner_principal_id IS NOT NULL AND x.owner_principal_id = p_actor) OR executive.holds_role(p_actor, p_tenant, p_domain, x.route_roles || ARRAY['domain_admin', 'platform_admin'])) THEN
    RAISE EXCEPTION 'attention delegation rejected: item % is routed to % (owner %); the delegator acts on it in their own right (a delegate does not delegate further)',
      p_item, array_to_string(x.route_roles, ', '), coalesce(x.owner_principal_id::text, 'none') USING ERRCODE = '42501';
  END IF;
  IF x.state NOT IN ('open', 'escalated', 'unrouted', 'acknowledged', 'suppressed') THEN
    RAISE EXCEPTION 'attention delegation rejected: item % is %; only a live item is delegated', p_item, x.state USING ERRCODE = '22023';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN RAISE EXCEPTION 'attention delegation rejected: a delegation carries a reason of at least 8 characters' USING ERRCODE = '22023'; END IF;
  IF p_to IS NULL OR p_to = p_actor THEN RAISE EXCEPTION 'attention delegation rejected: the delegate is another person than the delegator' USING ERRCODE = '22023'; END IF;
  SELECT p.kind, p.status INTO v_kind, v_status FROM identity.principals p WHERE p.id = p_to AND (p.tenant_id = p_tenant OR p.scope = 'PLATFORM');
  IF NOT FOUND OR v_kind <> 'human' OR v_status <> 'active' THEN
    RAISE EXCEPTION 'attention delegation rejected: the delegate must be an active human principal of this tenant (an agent is never a delegate)' USING ERRCODE = '22023';
  END IF;
  IF NOT executive.holds_role(p_to, p_tenant, p_domain, executive.attention_acknowledgement_roles()) THEN
    RAISE EXCEPTION 'attention delegation rejected: the delegate holds none of the acknowledgement roles in this domain (%)', array_to_string(executive.attention_acknowledgement_roles(), ', ') USING ERRCODE = '22023';
  END IF;
  IF p_until IS NULL OR p_until <= v_at OR p_until > v_at + interval '720 hours' THEN
    RAISE EXCEPTION 'attention delegation rejected: a delegation ends after now and within 720 hours' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM executive.attention_delegations g WHERE g.item_id = p_item AND g.to_principal_id = p_to AND g.state = 'active' AND g.until_at > v_at) THEN
    RAISE EXCEPTION 'attention delegation rejected: item % is already delegated to %; end that delegation first', p_item, p_to USING ERRCODE = '23505';
  END IF;
  INSERT INTO executive.attention_delegations (delegation_id, scope, tenant_id, domain_id, item_id, from_principal_id, to_principal_id, owner_principal_id, reason, from_at, until_at, request_key, request_digest, correlation_id)
  VALUES (p_delegation_id, 'DOMAIN', p_tenant, p_domain, p_item, p_actor, p_to, x.owner_principal_id, btrim(p_reason), v_at, p_until, v_key, p_request_digest, p_correlation)
  RETURNING * INTO d;
  PERFORM executive.attention_event(p_item, p_tenant, p_domain, 'item.delegated', p_actor,
            jsonb_build_object('delegation_id', p_delegation_id, 'from', p_actor, 'to', p_to, 'until', p_until, 'reason', btrim(p_reason), 'owner', x.owner_principal_id,
                               'owner_stays_accountable', true, 'state', x.state, 'request_key', v_key), p_correlation);
  RETURN executive.attention_delegation_answer(d, false);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.delegate_attention_item(uuid,uuid,uuid,uuid,uuid,text,timestamptz,text,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.delegate_attention_item(uuid,uuid,uuid,uuid,uuid,text,timestamptz,text,text,uuid,uuid) TO eye_commit;

-- END: by the delegator, the delegate, the item's owner or an administrator, with a reason; once.
CREATE OR REPLACE FUNCTION executive.end_attention_delegation(p_delegation uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE d executive.attention_delegations%ROWTYPE; x executive.attention_items%ROWTYPE; v_at timestamptz := clock_timestamp();
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.attention.item.delegate']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'attention delegation rejected: ended by the acting principal' USING ERRCODE = '42501'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN RAISE EXCEPTION 'attention delegation rejected: ending a delegation carries a reason of at least 8 characters' USING ERRCODE = '22023'; END IF;
  SELECT * INTO d FROM executive.attention_delegations g WHERE g.delegation_id = p_delegation AND g.tenant_id = p_tenant AND g.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'attention delegation rejected: no such delegation in this domain' USING ERRCODE = '23503'; END IF;
  SELECT * INTO x FROM executive.attention_items i WHERE i.item_id = d.item_id;
  IF NOT (p_actor IN (d.from_principal_id, d.to_principal_id) OR (x.owner_principal_id IS NOT NULL AND x.owner_principal_id = p_actor)
          OR executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['domain_admin', 'platform_admin'])) THEN
    RAISE EXCEPTION 'attention delegation rejected: a delegation is ended by its delegator, its delegate, the item''s owner or an administrator' USING ERRCODE = '42501';
  END IF;
  IF d.state = 'ended' THEN RAISE EXCEPTION 'attention delegation rejected: delegation % already ended at %', p_delegation, d.ended_at USING ERRCODE = '22023'; END IF;
  UPDATE executive.attention_delegations SET state = 'ended', ended_at = v_at, ended_by = p_actor, end_reason = btrim(p_reason) WHERE delegation_id = p_delegation RETURNING * INTO d;
  PERFORM executive.attention_event(d.item_id, p_tenant, p_domain, 'item.delegation_ended', p_actor,
            jsonb_build_object('delegation_id', p_delegation, 'from', d.from_principal_id, 'to', d.to_principal_id, 'ended_by', p_actor, 'reason', btrim(p_reason), 'lapsed_before', d.until_at <= v_at), p_correlation);
  RETURN executive.attention_delegation_answer(d, false);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.end_attention_delegation(uuid,uuid,uuid,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.end_attention_delegation(uuid,uuid,uuid,text,uuid,uuid) TO eye_commit;

-- ============================================================
-- §G3 DISPOSITION
-- ============================================================
-- What the item turned out to be, by a person who may act on it (a delegate included): actioned | not_material | duplicate | late |
-- missed — `missed` only on an item the engine did NOT judge material at first (below its thresholds or abstained; or re-evaluated /
-- elevated to material later). The latest disposition stands; the same one again (same note) answers `repeated` with no event.
CREATE OR REPLACE FUNCTION executive.record_attention_disposition(p_item uuid, p_tenant uuid, p_domain uuid, p_disposition text, p_note text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE x executive.attention_items%ROWTYPE; v_prev jsonb; v_note text := nullif(btrim(coalesce(p_note, '')), ''); v_first_material boolean; v_at timestamptz := clock_timestamp();
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.attention.disposition.record']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'attention disposition rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF p_disposition IS NULL OR p_disposition NOT IN ('actioned', 'not_material', 'duplicate', 'late', 'missed') THEN
    RAISE EXCEPTION 'attention disposition rejected: the disposition is actioned, not_material, duplicate, late or missed' USING ERRCODE = '22023';
  END IF;
  IF v_note IS NOT NULL AND length(v_note) > 2000 THEN RAISE EXCEPTION 'attention disposition rejected: a note is at most 2000 characters' USING ERRCODE = '22023'; END IF;
  SELECT * INTO x FROM executive.attention_items i WHERE i.item_id = p_item AND i.tenant_id = p_tenant AND i.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'attention disposition rejected: no such item in this domain' USING ERRCODE = '23503'; END IF;
  IF NOT executive.may_act_on_item(x, p_actor) THEN
    RAISE EXCEPTION 'attention disposition rejected: item % is routed to % (owner %); the acting principal is neither (nor its delegate)', p_item, array_to_string(x.route_roles, ', '), coalesce(x.owner_principal_id::text, 'none') USING ERRCODE = '42501';
  END IF;
  -- the FIRST judgement: the outcome the item's first queue event recorded (0083 routes with it), else its outcome now
  SELECT coalesce((SELECT e.details ->> 'outcome' FROM executive.attention_item_events e WHERE e.item_id = p_item AND e.details ? 'outcome' ORDER BY e.occurred_at, e.event_id LIMIT 1), x.outcome) = 'material'
    INTO v_first_material;
  IF p_disposition = 'missed' AND v_first_material THEN
    RAISE EXCEPTION 'attention disposition rejected: item % was judged material when it arrived; `missed` records an item the engine judged below its thresholds or abstained on', p_item USING ERRCODE = '22023';
  END IF;
  SELECT e.details INTO v_prev FROM executive.attention_item_events e WHERE e.item_id = p_item AND e.event = 'item.disposition' ORDER BY e.occurred_at DESC, e.event_id DESC LIMIT 1;
  IF v_prev IS NOT NULL AND v_prev ->> 'disposition' = p_disposition AND (v_prev ->> 'note') IS NOT DISTINCT FROM v_note THEN
    RETURN jsonb_build_object('item_id', p_item, 'disposition', p_disposition, 'note', v_note, 'repeated', true, 'previous', v_prev ->> 'previous', 'recorded_by', v_prev ->> 'recorded_by');
  END IF;
  PERFORM executive.attention_event(p_item, p_tenant, p_domain, 'item.disposition', p_actor,
            jsonb_build_object('disposition', p_disposition, 'note', v_note, 'previous', v_prev ->> 'disposition', 'recorded_by', p_actor, 'recorded_at', v_at, 'outcome', x.outcome, 'first_material', v_first_material,
                               'state', x.state, 'acknowledged', x.acknowledged_at IS NOT NULL, 'consequence', x.evaluation #>> '{dimensions,consequence}', 'signal_class', x.signal_class), p_correlation);
  RETURN jsonb_build_object('item_id', p_item, 'disposition', p_disposition, 'note', v_note, 'repeated', false, 'previous', v_prev ->> 'disposition', 'recorded_by', p_actor, 'recorded_at', v_at,
                            'outcome', x.outcome, 'state', x.state, 'acknowledged', x.acknowledged_at IS NOT NULL);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.record_attention_disposition(uuid,uuid,uuid,text,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.record_attention_disposition(uuid,uuid,uuid,text,text,uuid,uuid) TO eye_commit;

-- ============================================================
-- §G4 QUEUE EVALUATION
-- ============================================================
-- A rank as recorded (evaluation.rank), as a sort KEY (ascending = first in the queue): the ranking section's lexicographic tuple read
-- through its own key (executive.attention_rank_key over rank.tuple — a missing input sorts after every number), or a number, or
-- {position: number}; anything else is no rank. (Integrator, 0086: the ranking section records a tuple, not a position.)
CREATE OR REPLACE FUNCTION executive.attention_rank_value(p jsonb) RETURNS numeric[]
LANGUAGE sql IMMUTABLE SET search_path = executive, pg_catalog, pg_temp AS $$
  SELECT CASE WHEN jsonb_typeof(p) = 'number' THEN ARRAY[(p #>> '{}')::numeric]
              WHEN jsonb_typeof(p) = 'object' AND jsonb_typeof(p -> 'position') = 'number' THEN ARRAY[(p ->> 'position')::numeric]
              WHEN jsonb_typeof(p) = 'object' AND jsonb_typeof(p -> 'tuple') = 'object' THEN executive.attention_rank_key(p -> 'tuple')
              ELSE NULL END;
$$;
-- The item's rank as it stood at an instant: the latest rank its events carried at or before it (details.rank or details.evaluation.rank),
-- else its evaluation's rank when no re-evaluation came after the instant; nothing before the item existed.
CREATE OR REPLACE FUNCTION executive.attention_rank_at(x executive.attention_items, p_at timestamptz) RETURNS numeric[]
STABLE SET search_path = executive, pg_catalog, pg_temp AS $$
  SELECT CASE WHEN x.created_at > p_at THEN NULL ELSE coalesce(
    (SELECT executive.attention_rank_value(coalesce(e.details -> 'rank', e.details #> '{evaluation,rank}')) FROM executive.attention_item_events e
      WHERE e.item_id = x.item_id AND e.occurred_at <= p_at AND (e.details ? 'rank' OR e.details #> '{evaluation,rank}' IS NOT NULL)
      ORDER BY e.occurred_at DESC, e.event_id DESC LIMIT 1),
    CASE WHEN NOT EXISTS (SELECT 1 FROM executive.attention_item_events e WHERE e.item_id = x.item_id AND e.occurred_at > p_at AND e.event IN ('item.reevaluated', 'item.elevated', 'item.overload_deprioritized'))
         THEN executive.attention_rank_value(x.evaluation -> 'rank') END) END;
$$ LANGUAGE sql;
REVOKE ALL ON FUNCTION executive.attention_rank_value(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION executive.attention_rank_at(executive.attention_items, timestamptz) FROM PUBLIC;

-- A measured ratio, or its abstention below the sample floor.
CREATE OR REPLACE FUNCTION executive.attention_ratio(p_num bigint, p_sample bigint, p_min int, p_what text) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN p_sample < p_min THEN jsonb_build_object('abstained', true, 'sample', p_sample, 'reason', format('%s: %s judged item(s), below min_sample %s', p_what, p_sample, p_min))
              ELSE jsonb_build_object('abstained', false, 'sample', p_sample, 'value', round(p_num::numeric / p_sample, 4)) END;
$$;
REVOKE ALL ON FUNCTION executive.attention_ratio(bigint, bigint, int, text) FROM PUBLIC;

-- EVALUATE: a NAMED HUMAN's act (executive, domain_admin or platform_admin). Every measure is computed HERE, from the queue's ledgers
-- (attention_items, attention_item_events; executive.attention_deliveries only when it exists), over the items created in the window.
CREATE OR REPLACE FUNCTION executive.evaluate_attention_queue(p_evaluation_id uuid, p_tenant uuid, p_domain uuid, p_window_from timestamptz, p_window_to timestamptz, p_min_sample int, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_at timestamptz := clock_timestamp(); v_from timestamptz; v_to timestamptz; v_min int := coalesce(p_min_sample, 5);
        v_items jsonb; v_severe_list jsonb; c record; t record; s record; e record;
        v_classes jsonb := '{}'::jsonb; v_overall jsonb; v_stab jsonb; v_sev jsonb; v_delivery jsonb; v_breaches jsonb; v_esc jsonb; v_measures jsonb;
        v_class_measured int := 0; v_class_abstained int := 0; v_n bigint; v_verdict text; v_reason text; v_p jsonb; v_r jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.attention.queue.evaluate']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'attention queue evaluation rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF NOT executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['executive', 'domain_admin', 'platform_admin']) THEN
    RAISE EXCEPTION 'attention queue evaluation rejected: the queue is evaluated by a named human holding executive, domain_admin or platform_admin' USING ERRCODE = '42501';
  END IF;
  IF v_min < 1 OR v_min > 10000 THEN RAISE EXCEPTION 'attention queue evaluation rejected: min_sample is a whole number in [1, 10000]' USING ERRCODE = '22023'; END IF;
  v_to := coalesce(p_window_to, v_at); v_from := coalesce(p_window_from, v_to - interval '30 days');
  IF v_to < v_from THEN RAISE EXCEPTION 'attention queue evaluation rejected: the window ends before it begins' USING ERRCODE = '22023'; END IF;

  -- THE ITEMS OF THE WINDOW, each with what its ledger says: the latest disposition, whether it was elevated to material later, its FIRST
  -- deadline (the one its routing set — 0083's item.routed / item.escalated / item.unrouted carry due_at), whether it was ever deprioritized
  -- for overload.
  SELECT coalesce(jsonb_agg(f), '[]'::jsonb) INTO v_items FROM (
    SELECT i.item_id, i.signal_class, i.outcome, i.state, i.created_at, i.acknowledged_at, i.closed_at, i.evaluation #>> '{dimensions,consequence}' AS consequence,
           (SELECT d.details ->> 'disposition' FROM executive.attention_item_events d WHERE d.item_id = i.item_id AND d.event = 'item.disposition' ORDER BY d.occurred_at DESC, d.event_id DESC LIMIT 1) AS disposition,
           EXISTS (SELECT 1 FROM executive.attention_item_events d WHERE d.item_id = i.item_id
                     AND (d.event = 'item.elevated' OR (d.event = 'item.reevaluated' AND d.details ->> 'to_outcome' = 'material' AND d.details ->> 'from_outcome' IS DISTINCT FROM 'material'))) AS elevated,
           coalesce((SELECT (d.details ->> 'due_at')::timestamptz FROM executive.attention_item_events d
                      WHERE d.item_id = i.item_id AND d.event IN ('item.routed', 'item.escalated', 'item.unrouted') AND jsonb_typeof(d.details -> 'due_at') = 'string'
                      ORDER BY d.occurred_at, d.event_id LIMIT 1),
                    CASE WHEN i.escalations = 0 AND i.outcome = 'material' THEN i.due_at END) AS first_due,
           EXISTS (SELECT 1 FROM executive.attention_item_events d WHERE d.item_id = i.item_id AND d.event = 'item.overload_deprioritized') AS overload
      FROM executive.attention_items i
     WHERE i.tenant_id = p_tenant AND i.domain_id = p_domain AND i.created_at >= v_from AND i.created_at <= v_to
     ORDER BY i.created_at, i.item_id) f;

  -- PRECISION AND RECALL BY CLASS (and pooled). Positive: material when it arrived, acknowledged, then actioned. Negative (a false alarm):
  -- material, then not_material or duplicate, or closed without ever being acknowledged. A recall miss: `missed` recorded on an item the
  -- engine did not judge material, or an item elevated / re-evaluated to material later (it is a miss, never also a positive).
  FOR c IN
    WITH b AS (SELECT * FROM jsonb_to_recordset(v_items) AS r(item_id uuid, signal_class text, outcome text, state text, created_at timestamptz, acknowledged_at timestamptz, closed_at timestamptz,
                                                          consequence text, disposition text, elevated boolean, first_due timestamptz, overload boolean))
    SELECT coalesce(b.signal_class, '*') AS signal_class, count(*) AS items,
           count(*) FILTER (WHERE b.outcome = 'material' AND NOT b.elevated AND b.acknowledged_at IS NOT NULL AND b.disposition = 'actioned') AS tp,
           count(*) FILTER (WHERE b.outcome = 'material' AND NOT b.elevated AND (b.disposition IN ('not_material', 'duplicate') OR (b.state = 'closed' AND b.acknowledged_at IS NULL AND coalesce(b.disposition, '') NOT IN ('actioned', 'late')))) AS fp,
           count(*) FILTER (WHERE (b.outcome <> 'material' AND b.disposition = 'missed') OR b.elevated) AS fn,
           count(*) FILTER (WHERE b.disposition = 'late') AS late,
           count(*) FILTER (WHERE b.disposition IS NULL) AS undisposed,
           GROUPING(b.signal_class) AS pooled
      FROM b GROUP BY ROLLUP (b.signal_class) ORDER BY GROUPING(b.signal_class), b.signal_class
  LOOP
    v_p := executive.attention_ratio(c.tp, c.tp + c.fp, v_min, 'precision');
    v_r := executive.attention_ratio(c.tp, c.tp + c.fn, v_min, 'recall');
    IF c.pooled = 1 THEN
      v_overall := jsonb_build_object('items', c.items, 'true_positive', c.tp, 'false_positive', c.fp, 'missed', c.fn, 'late', c.late, 'undisposed', c.undisposed, 'precision', v_p, 'recall', v_r);
    ELSE
      v_classes := v_classes || jsonb_build_object(c.signal_class, jsonb_build_object('items', c.items, 'true_positive', c.tp, 'false_positive', c.fp, 'missed', c.fn, 'late', c.late,
                                                                                       'undisposed', c.undisposed, 'precision', v_p, 'recall', v_r));
      v_class_measured := v_class_measured + (CASE WHEN (v_p ->> 'abstained')::boolean THEN 0 ELSE 1 END) + (CASE WHEN (v_r ->> 'abstained')::boolean THEN 0 ELSE 1 END);
      v_class_abstained := v_class_abstained + (CASE WHEN (v_p ->> 'abstained')::boolean THEN 1 ELSE 0 END) + (CASE WHEN (v_r ->> 'abstained')::boolean THEN 1 ELSE 0 END);
    END IF;
  END LOOP;
  v_overall := coalesce(v_overall, jsonb_build_object('items', 0, 'true_positive', 0, 'false_positive', 0, 'missed', 0, 'late', 0, 'undisposed', 0,
                                                      'precision', executive.attention_ratio(0, 0, v_min, 'precision'), 'recall', executive.attention_ratio(0, 0, v_min, 'recall')));

  -- RANKING STABILITY: Kendall tau-b between each item's rank at the window's start and at its end, over the items ranked at both.
  WITH ranked AS (
    SELECT i.item_id, executive.attention_rank_at(i, v_from) AS a, executive.attention_rank_at(i, v_to) AS z
      FROM executive.attention_items i WHERE i.tenant_id = p_tenant AND i.domain_id = p_domain AND i.created_at <= v_to AND (i.closed_at IS NULL OR i.closed_at >= v_from)
  ), both_ends AS (SELECT * FROM ranked WHERE a IS NOT NULL AND z IS NOT NULL),
  pairs AS (SELECT CASE WHEN r1.a < r2.a THEN -1 WHEN r1.a > r2.a THEN 1 ELSE 0 END AS sa, CASE WHEN r1.z < r2.z THEN -1 WHEN r1.z > r2.z THEN 1 ELSE 0 END AS sz
                FROM both_ends r1 JOIN both_ends r2 ON r1.item_id < r2.item_id)
  SELECT (SELECT count(*) FROM ranked WHERE a IS NOT NULL OR z IS NOT NULL) AS any_rank, (SELECT count(*) FROM both_ends) AS n,
         count(*) AS n0, count(*) FILTER (WHERE sa * sz > 0) AS conc, count(*) FILTER (WHERE sa * sz < 0) AS disc,
         count(*) FILTER (WHERE sa = 0) AS ta, count(*) FILTER (WHERE sz = 0) AS tz
    INTO t FROM pairs;
  v_stab := CASE
    WHEN t.any_rank = 0 THEN jsonb_build_object('abstained', true, 'ranked', 0, 'reason', 'no rank exists: no item of the queue carries evaluation.rank (the ranking is another section''s)')
    WHEN t.n < greatest(2, v_min) THEN jsonb_build_object('abstained', true, 'ranked', t.n, 'reason', format('%s item(s) ranked at both ends of the window, below min_sample %s (at least 2)', t.n, greatest(2, v_min)))
    WHEN (t.n0 - t.ta) * (t.n0 - t.tz) = 0 THEN jsonb_build_object('abstained', true, 'ranked', t.n, 'reason', 'every rank is tied at one end of the window: tau is undefined')
    ELSE jsonb_build_object('abstained', false, 'ranked', t.n, 'method', 'kendall_tau_b', 'concordant', t.conc, 'discordant', t.disc, 'ties_start', t.ta, 'ties_end', t.tz,
                            'value', round((t.conc - t.disc)::numeric / sqrt(((t.n0 - t.ta) * (t.n0 - t.tz))::numeric), 4)) END;

  -- SEVERE-ITEM VISIBILITY (C3/C4): acknowledged before the first deadline, delivered before it (when a delivery ledger exists), never
  -- deprioritized for overload, the time to acknowledgement; every breach named.
  SELECT count(*) AS n, count(*) FILTER (WHERE b.first_due IS NOT NULL) AS routed,
         count(*) FILTER (WHERE b.first_due IS NOT NULL AND b.acknowledged_at IS NOT NULL AND b.acknowledged_at <= b.first_due) AS ack_in_time,
         count(*) FILTER (WHERE b.acknowledged_at IS NOT NULL) AS acked, count(*) FILTER (WHERE b.overload) AS overload,
         percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM (b.acknowledged_at - b.created_at))) FILTER (WHERE b.acknowledged_at IS NOT NULL) AS p50,
         percentile_cont(0.9) WITHIN GROUP (ORDER BY extract(epoch FROM (b.acknowledged_at - b.created_at))) FILTER (WHERE b.acknowledged_at IS NOT NULL) AS p90
    INTO s
    FROM jsonb_to_recordset(v_items) AS b(item_id uuid, signal_class text, outcome text, state text, created_at timestamptz, acknowledged_at timestamptz, closed_at timestamptz,
                                        consequence text, disposition text, elevated boolean, first_due timestamptz, overload boolean)
   WHERE b.consequence IN ('C3', 'C4');
  SELECT coalesce(jsonb_agg(x ORDER BY x ->> 'created_at', x ->> 'breach'), '[]'::jsonb) INTO v_breaches FROM (
    SELECT jsonb_build_object('item_id', b.item_id, 'signal_class', b.signal_class, 'consequence', b.consequence, 'breach', 'overload_deprioritized', 'created_at', b.created_at) AS x
      FROM jsonb_to_recordset(v_items) AS b(item_id uuid, signal_class text, consequence text, created_at timestamptz, overload boolean)
     WHERE b.consequence IN ('C3', 'C4') AND b.overload
    UNION ALL
    SELECT jsonb_build_object('item_id', b.item_id, 'signal_class', b.signal_class, 'consequence', b.consequence, 'breach', 'unacknowledged_past_deadline', 'deadline', b.first_due,
                              'acknowledged_at', b.acknowledged_at, 'created_at', b.created_at)
      FROM jsonb_to_recordset(v_items) AS b(item_id uuid, signal_class text, consequence text, created_at timestamptz, acknowledged_at timestamptz, first_due timestamptz)
     WHERE b.consequence IN ('C3', 'C4') AND b.first_due IS NOT NULL AND b.first_due <= v_at AND (b.acknowledged_at IS NULL OR b.acknowledged_at > b.first_due)) q;
  SELECT coalesce(jsonb_agg(jsonb_build_object('item_id', b.item_id, 'deadline', b.first_due)), '[]'::jsonb) INTO v_severe_list
    FROM jsonb_to_recordset(v_items) AS b(item_id uuid, consequence text, first_due timestamptz) WHERE b.consequence IN ('C3', 'C4');
  IF to_regclass('executive.attention_deliveries') IS NULL THEN
    v_delivery := jsonb_build_object('measurable', false, 'reason', 'not measurable: this deployment has no delivery ledger (executive.attention_deliveries)');
  ELSIF s.n = 0 THEN
    v_delivery := jsonb_build_object('measurable', false, 'reason', 'no C3/C4 item in the window');
  ELSE
    BEGIN
      EXECUTE 'SELECT count(*) FROM jsonb_to_recordset($1) AS s(item_id uuid, deadline timestamptz) WHERE EXISTS (SELECT 1 FROM executive.attention_deliveries d '
              'WHERE d.item_id = s.item_id AND d.state = ''delivered'' AND d.attempted_at IS NOT NULL AND (s.deadline IS NULL OR d.attempted_at <= s.deadline))' INTO v_n USING v_severe_list;
      v_delivery := jsonb_build_object('measurable', true, 'delivered_before_deadline', v_n, 'of', s.n, 'source', 'executive.attention_deliveries (item_id, state delivered, attempted_at)');
    EXCEPTION WHEN undefined_column OR undefined_table OR datatype_mismatch THEN
      v_delivery := jsonb_build_object('measurable', false, 'reason', 'not measurable: the delivery ledger does not carry (item_id, state, attempted_at) as read here');
    END;
  END IF;
  v_sev := jsonb_build_object('items', s.n, 'routed', s.routed, 'acknowledged', s.acked, 'acknowledged_before_deadline', s.ack_in_time, 'overload_deprioritized', s.overload,
                              'never_overload_deprioritized', s.overload = 0, 'time_to_acknowledge_seconds', CASE WHEN s.acked = 0 THEN NULL ELSE jsonb_build_object('p50', round(s.p50::numeric, 3), 'p90', round(s.p90::numeric, 3)) END,
                              'delivered_before_deadline', v_delivery, 'breaches', v_breaches);

  -- ESCALATION LATENCY: each escalation in the window after the deadline it answered (0083's item.escalated carries missed_deadline).
  SELECT count(*) AS n, percentile_cont(0.5) WITHIN GROUP (ORDER BY q.lat) AS p50, percentile_cont(0.9) WITHIN GROUP (ORDER BY q.lat) AS p90, max(q.lat) AS mx
    INTO e
    FROM (SELECT extract(epoch FROM (d.occurred_at - (d.details ->> 'missed_deadline')::timestamptz)) AS lat
            FROM executive.attention_item_events d JOIN executive.attention_items i ON i.item_id = d.item_id
           WHERE i.tenant_id = p_tenant AND i.domain_id = p_domain AND d.event = 'item.escalated' AND jsonb_typeof(d.details -> 'missed_deadline') = 'string'
             AND d.occurred_at >= v_from AND d.occurred_at <= v_to) q;
  v_esc := CASE WHEN e.n = 0 THEN jsonb_build_object('abstained', true, 'escalations', 0, 'reason', 'no escalation after a missed deadline in the window')
                ELSE jsonb_build_object('abstained', false, 'escalations', e.n, 'p50_seconds', round(e.p50::numeric, 3), 'p90_seconds', round(e.p90::numeric, 3), 'max_seconds', round(e.mx::numeric, 3)) END;

  -- THE VERDICT: abstained when neither pooled precision nor pooled recall is measurable; measured when every class's precision and recall,
  -- the stability, the delivery and the escalation latency are; partial otherwise.
  v_verdict := CASE
    WHEN (v_overall #>> '{precision,abstained}')::boolean AND (v_overall #>> '{recall,abstained}')::boolean THEN 'abstained'
    WHEN v_class_abstained = 0 AND NOT (v_stab ->> 'abstained')::boolean AND (v_delivery ->> 'measurable')::boolean AND NOT (v_esc ->> 'abstained')::boolean THEN 'measured'
    ELSE 'partial' END;
  v_reason := format('%s item(s) in the window; pooled precision %s, recall %s; %s class measure(s) measured, %s abstained below min_sample %s; ranking stability %s; %s C3/C4 item(s), %s breach(es); delivery %s; escalation latency %s',
    jsonb_array_length(v_items),
    CASE WHEN (v_overall #>> '{precision,abstained}')::boolean THEN 'abstained' ELSE v_overall #>> '{precision,value}' END,
    CASE WHEN (v_overall #>> '{recall,abstained}')::boolean THEN 'abstained' ELSE v_overall #>> '{recall,value}' END,
    v_class_measured, v_class_abstained, v_min,
    CASE WHEN (v_stab ->> 'abstained')::boolean THEN 'abstained (' || (v_stab ->> 'reason') || ')' ELSE 'tau-b ' || (v_stab ->> 'value') END,
    s.n, jsonb_array_length(v_breaches),
    CASE WHEN (v_delivery ->> 'measurable')::boolean THEN 'measured' ELSE v_delivery ->> 'reason' END,
    CASE WHEN (v_esc ->> 'abstained')::boolean THEN 'abstained' ELSE 'p50 ' || (v_esc ->> 'p50_seconds') || ' s' END);
  v_measures := jsonb_build_object(
    'window', jsonb_build_object('from', v_from, 'to', v_to), 'min_sample', v_min, 'items', jsonb_array_length(v_items),
    'classes', v_classes, 'overall', v_overall, 'ranking_stability', v_stab, 'severe', v_sev, 'escalation_latency', v_esc,
    'definitions', jsonb_build_object(
      'positive', 'material when it arrived, acknowledged, then disposed actioned',
      'negative', 'material, then disposed not_material or duplicate, or closed without acknowledgement',
      'recall_miss', 'disposed missed on an item judged below threshold or abstained on, or elevated / re-evaluated to material later',
      'late', 'disposed late: counted apart, neither a positive nor a miss',
      'severe', 'consequence C3 or C4 in the evaluation''s dimensions; the deadline is the first one its routing set'));
  INSERT INTO executive.attention_queue_evaluations (evaluation_id, scope, tenant_id, domain_id, window_from, window_to, min_sample, measures, verdict, reason, evaluated_by, evaluated_at, correlation_id)
  VALUES (p_evaluation_id, 'DOMAIN', p_tenant, p_domain, v_from, v_to, v_min, v_measures, v_verdict, v_reason, p_actor, v_at, p_correlation);
  RETURN v_measures || jsonb_build_object('evaluation_id', p_evaluation_id, 'verdict', v_verdict, 'reason', v_reason, 'evaluated_by', p_actor, 'evaluated_at', v_at);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.evaluate_attention_queue(uuid,uuid,uuid,timestamptz,timestamptz,int,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.evaluate_attention_queue(uuid,uuid,uuid,timestamptz,timestamptz,int,uuid,uuid) TO eye_commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §K (section `markers`)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0086 §markers (B24 part `markers`) — SOURCE-IMPACT MARKERS THAT CONSTRAIN DECISION-ACTIVE USE (F-P6-07; V03-T-077, V03-T-079;
-- AU-OBS-0117/-0118). B22 (0083 §6) SET the markers — observation.source_impact_markers on the issued forecasts of a source's series, the
-- open warnings on them and the packages whose current version cites one, set by the source-health subscriber on degraded | failed |
-- suspended | unknown and cleared on healthy | active — but nothing READ them where a product is USED: a package committed and a run
-- opened on a degraded source exactly as on a healthy one ("claims, twins, scenarios, briefings unmarked; no UI shows markers").
--
-- THE MECHANISM.
-- (§M1) THE REACH: observation.source_derived_products (0083 §6 re-declared whole) adds the SCENARIOS declared on a reached forecast
--   (active), the simulation RUNS bound to a reached scenario (valid, opened or completed), and the packages reached THROUGH A RUN — the
--   current version's options citing a reached run, or its baseline run — beside the packages citing a reached forecast (0083). The
--   markers' subject_kind CHECK admits `scenario` and `run`. observation.mark_source_impact (0083) is unchanged: it walks this function.
-- (§M2) THE BEARING: decision.source_impact_bearing(tenant, domain, package, version) — the ACTIVE markers that bear on one version of a
--   package: on the package itself, or on what that version's options cite (forecast, run, warning) or its baseline run; each with
--   whether an acknowledgement recorded FOR THIS VERSION names it (and by whom, when). Scoped to the caller's context.
-- (§M3) THE ACKNOWLEDGEMENT: decision.acknowledge_source_impact(package, version, marker_ids, reason) — a NAMED, ACTIVE HUMAN holding
--   decision_authority (the role that commits: the one who answers for committing on degraded inputs), recording on their own behalf,
--   with a reason of 8+ characters, for markers that are ACTIVE and BEAR on that version (a version not yet committed, rejected or
--   superseded). Recorded as the package event `source_impact.acknowledged` {version, marker_ids, markers, reason}; a marker already
--   acknowledged for the version is not recorded twice (a repeat answers `repeated`). package_events' CHECK (0083 §8) re-declared.
-- (§M4) THE COMMITMENT GATE: decision.commit_package (0078 re-declared whole + ONE block): an active marker bearing on the version and not
--   acknowledged for it refuses the commitment — `commitment rejected (source_impact): …` (22023; 409).
-- (§M5) THE RUN GATE: simulation.open_run (0084 §5 re-declared whole + ONE block): a scenario-bound run whose scenario's forecast (or the
--   scenario) carries an active FAILED or SUSPENDED marker is refused — `run rejected (source_impact): …` (22023; 409); DEGRADED or UNKNOWN
--   admits it with controls.source_impact declared on the run by the port (a caller's own source_impact key is dropped) and a `run` marker
--   on the new run (per source), cleared with the others when the source recovers.
--
-- NOT HERE (stated): observation.mark_source_impact is NOT re-declared (not this part's) — a marker KEPT across a change between degraded
-- states keeps the health_state it was set with (degraded → suspended leaves `degraded` markers until a recovery clears them; a harness
-- clears before suspending); the remediation workflow on coverage loss (STAGES.csv B24) — the coverage-loss item routes the loss (0083) and
-- nothing here opens a remediation; markers on claims, twins, twin versions and briefings (their dependence on a source is not a derived
-- product of a series; the briefing reads the source states it composes from, 0066); a marker on a package's WARNING-derived dependents
-- beyond the options' citations; the run gate on a run that names NO scenario (its twin version's predicted inputs may cite a marked
-- forecast — the gate reads the scenario's forecast, as F-P6-07's row names it); an event announcing the acknowledgement (it is a package
-- event, read by the bearing and the UI); the interface register (unchanged, 50/0/0).

-- ============================================================
-- §M1 THE REACH
-- ============================================================
ALTER TABLE observation.source_impact_markers DROP CONSTRAINT IF EXISTS source_impact_markers_subject_kind_check;
ALTER TABLE observation.source_impact_markers ADD CONSTRAINT source_impact_markers_subject_kind_check CHECK (subject_kind IN ('forecast', 'warning', 'package', 'scenario', 'run'));
COMMENT ON TABLE observation.source_impact_markers IS 'V03-T-077/-079 (0083; B24 0086): a derived product carrying the degraded health of a source it rests on — the issued forecasts of the source''s series, the open warnings on them, the active scenarios declared on them, the valid runs bound to those scenarios, the packages whose current version cites one of those forecasts or runs; set by the source-health subscriber on degraded | failed | suspended | unknown (and on a run opened on a degraded or unknown source, by simulation.open_run), cleared on healthy | active. A marker bearing on a package version refuses its commitment until a decision authority acknowledges it for that version; a failed or suspended marker on a scenario''s forecast refuses a run on it.';

-- The derived products of a source, as they stand: its series' issued forecasts, the raised/acknowledged warnings on them, the active
-- scenarios declared on them, the valid runs bound to those scenarios, and the packages (declared → monitoring, reopened) whose CURRENT
-- version's options cite one of those forecasts or runs, or whose current version's baseline is one of those runs.
CREATE OR REPLACE FUNCTION observation.source_derived_products(p_tenant uuid, p_domain uuid, p_source_id uuid) RETURNS TABLE (subject_kind text, subject_id uuid, via text)
STABLE SECURITY DEFINER SET search_path = observation, prediction, simulation, decision, pg_catalog, pg_temp AS $$
  WITH src AS (SELECT DISTINCT c.source_key FROM observation.source_contracts_current c WHERE c.source_id = p_source_id AND c.tenant_id = p_tenant AND c.domain_id = p_domain),
       f AS (SELECT fc.forecast_id, fc.series_key FROM prediction.forecasts_current fc JOIN prediction.series_registry sr ON sr.series_key = fc.series_key AND sr.tenant_id = fc.tenant_id AND sr.domain_id = fc.domain_id
              WHERE fc.tenant_id = p_tenant AND fc.domain_id = p_domain AND fc.state = 'issued' AND sr.source_key IN (SELECT source_key FROM src)),
       s AS (SELECT sc.scenario_id, sc.forecast_id FROM prediction.scenarios_current sc
              WHERE sc.tenant_id = p_tenant AND sc.domain_id = p_domain AND sc.state = 'active' AND sc.forecast_id IN (SELECT forecast_id FROM f)),
       r AS (SELECT rc.run_id, rc.scenario_id FROM simulation.runs_current rc
              WHERE rc.tenant_id = p_tenant AND rc.domain_id = p_domain AND rc.state IN ('opened', 'completed') AND rc.validity = 'valid' AND rc.scenario_id IN (SELECT scenario_id FROM s))
  SELECT 'forecast', f.forecast_id, 'series ' || f.series_key FROM f
  UNION ALL
  SELECT 'warning', w.warning_id, 'forecast ' || w.forecast_id::text FROM prediction.warnings_current w
   WHERE w.tenant_id = p_tenant AND w.domain_id = p_domain AND w.state IN ('raised', 'acknowledged') AND w.forecast_id IN (SELECT forecast_id FROM f)
  UNION ALL
  SELECT 'scenario', s.scenario_id, 'forecast ' || s.forecast_id::text FROM s
  UNION ALL
  SELECT 'run', r.run_id, 'scenario ' || r.scenario_id::text FROM r
  UNION ALL
  SELECT x.subject_kind, x.subject_id, x.via FROM (
    SELECT DISTINCT ON (p.package_id) 'package'::text AS subject_kind, p.package_id AS subject_id, c.via
      FROM decision.packages_current p
      JOIN LATERAL (
        SELECT 'option ' || o.key || ' cites ' || (cs ->> 'kind') || ' ' || (cs ->> 'id') AS via, 1 AS rank
          FROM decision.options o CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(o.consequences) = 'array' THEN o.consequences ELSE '[]'::jsonb END) cs
         WHERE o.package_id = p.package_id AND o.version = p.current_version
           AND ((cs ->> 'id') IN (SELECT forecast_id::text FROM f) OR ((cs ->> 'kind') = 'run' AND (cs ->> 'id') IN (SELECT run_id::text FROM r)))
        UNION ALL
        SELECT 'the baseline run ' || pv.baseline_run_id::text, 2 FROM decision.package_versions pv
         WHERE pv.package_id = p.package_id AND pv.version = p.current_version AND pv.baseline_run_id IN (SELECT run_id FROM r)
      ) c ON true
     WHERE p.tenant_id = p_tenant AND p.domain_id = p_domain AND p.state NOT IN ('withdrawn', 'closed')
     ORDER BY p.package_id, c.rank, c.via
  ) x;
$$ LANGUAGE sql;
REVOKE ALL ON FUNCTION observation.source_derived_products(uuid, uuid, uuid) FROM PUBLIC;

-- ============================================================
-- §M2 THE BEARING
-- ============================================================
-- The ACTIVE markers that bear on one version of a package — on the package, or on what that version cites (its options' forecasts, runs
-- and warnings; its baseline run) — each with the acknowledgement recorded FOR THIS VERSION that names it, if any. Scoped to the caller's
-- own context (a tenant and domain other than the context's read nothing).
CREATE OR REPLACE FUNCTION decision.source_impact_bearing(p_tenant uuid, p_domain uuid, p_package_id uuid, p_version int)
RETURNS TABLE (marker_id uuid, source_id uuid, subject_kind text, subject_id uuid, health_state text, reason text, set_at timestamptz, bearing text,
               acknowledged boolean, acknowledged_by uuid, acknowledged_at timestamptz, acknowledgement_id uuid)
STABLE SECURITY DEFINER SET search_path = decision, observation, pg_catalog, pg_temp AS $$
  WITH cited AS (
    SELECT DISTINCT CASE WHEN (cs ->> 'kind') IS NULL THEN 'forecast' ELSE cs ->> 'kind' END AS kind, cs ->> 'id' AS id, 'option ' || o.key AS via
      FROM decision.options o CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(o.consequences) = 'array' THEN o.consequences ELSE '[]'::jsonb END) cs
     WHERE o.package_id = p_package_id AND o.version = p_version AND o.tenant_id = p_tenant AND o.domain_id = p_domain
       AND coalesce(cs ->> 'kind', 'forecast') IN ('forecast', 'run', 'warning')
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

-- ============================================================
-- §M3 THE ACKNOWLEDGEMENT
-- ============================================================
ALTER TABLE decision.package_events DROP CONSTRAINT package_events_event_check;
ALTER TABLE decision.package_events ADD CONSTRAINT package_events_event_check CHECK (event IN (
  'package.declared', 'version.opened', 'option.set', 'terms.set', 'choice.set', 'dissent.recorded', 'version.proposed',
  'review.recorded', 'version.approved', 'approval.revoked', 'version.rejected', 'package.committed', 'package.withdrawn',
  'outcome.recorded', 'package.closed', 'commit.refused', 'replay.recorded', 'condition.breached', 'review.overdue', 'input.invalidated', 'package.reopened',
  'policy.changed',
  -- B24 (0086) markers
  'source_impact.acknowledged'));

-- A decision authority acknowledges, for ONE version, the active source-impact markers that bear on it: the commitment of that version
-- may then rest on the degraded source, and the record says who answered for it, when and why. Only what bears and is active is
-- acknowledged; a marker already acknowledged for the version is not recorded twice.
CREATE OR REPLACE FUNCTION decision.acknowledge_source_impact(
  p_tenant uuid, p_domain uuid, p_package_id uuid, p_version int, p_marker_ids jsonb, p_reason text, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE p decision.packages_current%ROWTYPE; v decision.package_versions%ROWTYPE; m observation.source_impact_markers%ROWTYPE; v_mid text; v_id uuid;
        v_new jsonb := '[]'::jsonb; v_markers jsonb := '[]'::jsonb; v_already jsonb := '[]'::jsonb; v_outstanding jsonb; v_at timestamptz := clock_timestamp();
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.source_impact.acknowledge']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN
    RAISE EXCEPTION 'source impact acknowledgement rejected: recorded by the acting principal, never on behalf of another' USING ERRCODE = '42501';
  END IF;
  IF NOT decision.is_active_human(p_actor, p_tenant) THEN
    RAISE EXCEPTION 'source impact acknowledgement rejected: a named, active human acknowledges a source impact' USING ERRCODE = '42501';
  END IF;
  IF NOT decision.holds_role(p_actor, p_tenant, p_domain, 'decision_authority') THEN
    RAISE EXCEPTION 'source impact acknowledgement rejected: principal % does not hold decision_authority at this scope; the authority who commits answers for a degraded source', p_actor USING ERRCODE = '42501';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 OR length(p_reason) > 2000 THEN
    RAISE EXCEPTION 'source impact acknowledgement rejected: a reason of 8 to 2000 characters says why the decision may rest on the degraded source' USING ERRCODE = '22023';
  END IF;
  IF p_marker_ids IS NULL OR jsonb_typeof(p_marker_ids) <> 'array' OR jsonb_array_length(p_marker_ids) = 0 OR jsonb_array_length(p_marker_ids) > 200
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_marker_ids) e WHERE jsonb_typeof(e) <> 'string' OR (e #>> '{}') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') THEN
    RAISE EXCEPTION 'source impact acknowledgement rejected: marker_ids is a list of 1 to 200 marker ids' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO p FROM decision.packages_current pc WHERE pc.package_id = p_package_id AND pc.tenant_id = p_tenant AND pc.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'source impact acknowledgement rejected: no such package in this domain' USING ERRCODE = '23503'; END IF;
  SELECT * INTO v FROM decision.package_versions pv WHERE pv.package_id = p_package_id AND pv.version = p_version;
  IF NOT FOUND THEN RAISE EXCEPTION 'source impact acknowledgement rejected: no such version % of package %', p_version, p_package_id USING ERRCODE = '23503'; END IF;
  IF v.state NOT IN ('draft', 'proposed', 'under_review', 'approved') OR p.state IN ('withdrawn', 'closed') THEN
    RAISE EXCEPTION 'source impact acknowledgement rejected (version_state): version % of package % is % (the package is %); only a version not yet committed, rejected or superseded is acknowledged',
      p_version, p_package_id, v.state, p.state USING ERRCODE = '22023';
  END IF;
  FOR v_mid IN SELECT DISTINCT e #>> '{}' FROM jsonb_array_elements(p_marker_ids) e ORDER BY 1 LOOP
    SELECT * INTO m FROM observation.source_impact_markers k WHERE k.marker_id = v_mid::uuid AND k.tenant_id = p_tenant AND k.domain_id = p_domain;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'source impact acknowledgement rejected (unknown_marker): marker % is not a source-impact marker of this domain', v_mid USING ERRCODE = '23503';
    END IF;
    IF m.state <> 'active' THEN
      RAISE EXCEPTION 'source impact acknowledgement rejected (cleared): marker % was cleared at % (the source is %); there is nothing to acknowledge', v_mid, m.cleared_at, coalesce(m.cleared_state, 'recovered') USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM decision.source_impact_bearing(p_tenant, p_domain, p_package_id, p_version) b WHERE b.marker_id = m.marker_id) THEN
      RAISE EXCEPTION 'source impact acknowledgement rejected (not_bearing): marker % (% %) does not bear on version % of package %', v_mid, m.subject_kind, m.subject_id, p_version, p_package_id USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM decision.source_impact_bearing(p_tenant, p_domain, p_package_id, p_version) b WHERE b.marker_id = m.marker_id AND b.acknowledged) THEN
      v_already := v_already || to_jsonb(v_mid);
    ELSE
      v_new := v_new || to_jsonb(v_mid);
      v_markers := v_markers || jsonb_build_object('marker_id', m.marker_id, 'source_id', m.source_id, 'subject_kind', m.subject_kind, 'subject_id', m.subject_id, 'health_state', m.health_state, 'set_at', m.set_at);
    END IF;
  END LOOP;
  IF jsonb_array_length(v_new) > 0 THEN
    v_id := p_event_id;
    INSERT INTO decision.package_events (event_id, scope, tenant_id, domain_id, package_id, event, actor_principal_id, details, occurred_at, correlation_id)
    VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_package_id, 'source_impact.acknowledged', p_actor,
            jsonb_build_object('version', p_version, 'marker_ids', v_new, 'markers', v_markers, 'reason', btrim(p_reason), 'version_state', v.state), v_at, p_correlation);
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('marker_id', b.marker_id, 'subject_kind', b.subject_kind, 'subject_id', b.subject_id, 'health_state', b.health_state) ORDER BY b.subject_kind, b.subject_id, b.marker_id), '[]'::jsonb)
    INTO v_outstanding FROM decision.source_impact_bearing(p_tenant, p_domain, p_package_id, p_version) b WHERE NOT b.acknowledged;
  RETURN jsonb_build_object('acknowledgement_id', v_id, 'package_id', p_package_id, 'version', p_version, 'repeated', jsonb_array_length(v_new) = 0,
                            'acknowledged', v_new, 'already_acknowledged', v_already, 'outstanding', v_outstanding, 'acknowledged_by', p_actor,
                            'acknowledged_at', CASE WHEN jsonb_array_length(v_new) > 0 THEN v_at END, 'reason', btrim(p_reason));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.acknowledge_source_impact(uuid,uuid,uuid,int,jsonb,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.acknowledge_source_impact(uuid,uuid,uuid,int,jsonb,text,uuid,uuid,uuid) TO eye_commit;

-- ============================================================
-- §M4 THE COMMITMENT GATE — decision.commit_package: 0078's body (copied whole) with ONE block after the approvals' checks: an active
-- marker bearing on the version and not acknowledged for it refuses the commitment. Everything else as 0078 left it.
-- ============================================================
CREATE OR REPLACE FUNCTION decision.commit_package(
  p_commitment_id uuid, p_tenant uuid, p_domain uuid, p_package_id uuid, p_version int, p_committer uuid, p_version_digest text, p_header_digest text,
  p_title text, p_statement text, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, graph, simulation, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE p record; v record; v_quorum int; v_live int; v_approvals jsonb; v_dec uuid; c jsonb; v_now timestamptz := clock_timestamp();
        v_si_unack int; v_si_list text; /* B24 (0086) markers */
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.commit']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF public.eye_op_class() IS DISTINCT FROM 'C3' THEN
    RAISE EXCEPTION 'commitment rejected: decision.commit requires a C3 authority context; this context is %', coalesce(public.eye_op_class(), 'unclassed') USING ERRCODE = '42501';
  END IF;
  IF public.eye_bound_action() IS DISTINCT FROM 'decision.commit' THEN
    RAISE EXCEPTION 'commitment rejected: the context is bound to %, not decision.commit', public.eye_bound_action() USING ERRCODE = '42501';
  END IF;
  IF p_committer IS DISTINCT FROM public.eye_principal() THEN
    RAISE EXCEPTION 'commitment rejected: a commitment is made by the acting principal, never on behalf of another' USING ERRCODE = '42501';
  END IF;
  IF NOT decision.is_active_human(p_committer, p_tenant) THEN RAISE EXCEPTION 'commitment rejected: only a named, active human principal commits' USING ERRCODE = '42501'; END IF;
  IF NOT decision.holds_role(p_committer, p_tenant, p_domain, 'decision_authority') THEN
    RAISE EXCEPTION 'commitment rejected: principal % does not hold decision_authority at this scope', p_committer USING ERRCODE = '42501';
  END IF;
  SELECT * INTO p FROM decision.packages_current x WHERE x.package_id = p_package_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'commitment rejected: no such package in this domain' USING ERRCODE = '23503'; END IF;
  IF p.committed_version IS NOT NULL AND p.state IN ('committed', 'monitoring', 'closed') THEN
    RAISE EXCEPTION 'commitment rejected: package is already committed at version % and the commitment stands; a committed decision is reopened (decision.package.reopen), never re-committed over', p.committed_version USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v FROM decision.package_versions x WHERE x.package_id = p_package_id AND x.version = p_version FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'commitment rejected: no such version' USING ERRCODE = '23503'; END IF;
  IF v.state <> 'approved' THEN RAISE EXCEPTION 'commitment rejected: version % is %, not approved', p_version, v.state USING ERRCODE = '22023'; END IF;
  IF p_version_digest IS DISTINCT FROM v.version_digest THEN
    RAISE EXCEPTION 'commitment rejected: the digest committed (%) is not the digest of version % (%)', p_version_digest, p_version, v.version_digest USING ERRCODE = '22023';
  END IF;
  v_quorum := (v.approver_policy ->> 'quorum')::int;
  SELECT count(*), coalesce(jsonb_agg(jsonb_build_object('approval_id', approval_id, 'approver', approver_principal_id)), '[]'::jsonb)
    INTO v_live, v_approvals FROM decision.live_approvals(p_package_id, p_version);
  IF v_live < v_quorum THEN
    RAISE EXCEPTION 'commitment rejected: quorum is % distinct eligible humans; % live approval(s) stand now (expired, revoked or re-digested approvals do not count)', v_quorum, v_live USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM decision.live_approvals(p_package_id, p_version) la WHERE la.approver_principal_id = p_committer) THEN
    RAISE EXCEPTION 'commitment rejected: the committing authority cannot be one of the approvers' USING ERRCODE = '42501';
  END IF;
  /* B24 (0086) markers — F-P6-07 (V03-T-077): a commitment does not rest, unacknowledged, on a source whose health is degraded, failed,
     suspended or unknown. Every ACTIVE source-impact marker on the package or on what THIS version cites (its options' forecasts, runs and
     warnings; its baseline run) must carry an acknowledgement recorded for THIS version by a decision authority
     (decision.acknowledge_source_impact, package event source_impact.acknowledged); a new version needs its own. */
  SELECT count(*), string_agg(format('%s %s (source %s %s; marker %s)', b.subject_kind, b.subject_id, b.source_id, b.health_state, b.marker_id), '; ' ORDER BY b.subject_kind, b.subject_id, b.marker_id)
    INTO v_si_unack, v_si_list
    FROM decision.source_impact_bearing(p_tenant, p_domain, p_package_id, p_version) b WHERE NOT b.acknowledged;
  IF v_si_unack > 0 THEN
    RAISE EXCEPTION 'commitment rejected (source_impact): % active source-impact marker(s) bear on version % of package % and are not acknowledged for this version — %; a decision authority acknowledges them for this version (decision.source_impact.acknowledge) before the commitment',
      v_si_unack, p_version, p_package_id, v_si_list USING ERRCODE = '22023';
  END IF;
  /* end B24 markers */
  v_dec := p.decision_object_id;
  INSERT INTO graph.strategy_current (strategy_object_id, scope, tenant_id, domain_id, object_type, object_version, title, statement, status, verification_state, parent_objective_id, owner_principal_id, correlation_id)
  VALUES (p_commitment_id, 'DOMAIN', p_tenant, p_domain, 'CMT', 1, p_title, p_statement, 'active', 'not_applicable', NULL, p_committer, p_correlation);
  INSERT INTO graph.strategy_events (event_id, scope, tenant_id, domain_id, strategy_object_id, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_commitment_id, 'strategy.declared', p_committer,
          jsonb_build_object('object_type', 'CMT', 'title', p_title, 'version', 1, 'status', 'active', 'via', 'decision.commit', 'package_id', p_package_id, 'package_version', p_version), p_correlation);
  INSERT INTO graph.dependencies (dependency_id, scope, tenant_id, domain_id, dependent_object_id, dependent_type, depends_on_kind, depends_on_id, rationale, state, created_by, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_commitment_id, 'CMT', 'strategy', v_dec, format('the commitment executes decision %s (package %s v%s)', v_dec, p_package_id, p_version), 'active', p_committer, p_correlation);
  FOR c IN SELECT DISTINCT x FROM decision.options o, jsonb_array_elements(o.consequences) x WHERE o.package_id = p_package_id AND o.version = p_version AND o.key = (v.choice ->> 'option_key') AND (x ->> 'kind') = 'run' LOOP
    INSERT INTO graph.dependencies (dependency_id, scope, tenant_id, domain_id, dependent_object_id, dependent_type, depends_on_kind, depends_on_id, rationale, state, created_by, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_commitment_id, 'CMT', 'run', (c ->> 'id')::uuid, format('the chosen option %s rests on this run', v.choice ->> 'option_key'), 'active', p_committer, p_correlation)
    ON CONFLICT DO NOTHING;
  END LOOP;
  IF v.baseline_run_id IS NOT NULL THEN
    INSERT INTO graph.dependencies (dependency_id, scope, tenant_id, domain_id, dependent_object_id, dependent_type, depends_on_kind, depends_on_id, rationale, state, created_by, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_commitment_id, 'CMT', 'run', v.baseline_run_id, 'the common baseline the options were compared against', 'active', p_committer, p_correlation)
    ON CONFLICT DO NOTHING;
  END IF;
  -- ONE instant is the decision: the commitment, decided_at and the committed event carry it, so a replay's decided layer closes exactly there.
  INSERT INTO decision.commitments (commitment_id, scope, tenant_id, domain_id, package_id, version, committed_by, version_digest, approvals, op_class, bound_action, header_digest, policy_decision_id, committed_at, correlation_id)
  VALUES (p_commitment_id, 'DOMAIN', p_tenant, p_domain, p_package_id, p_version, p_committer, p_version_digest, v_approvals, public.eye_op_class(), public.eye_bound_action(), p_header_digest, public.eye_policy_decision(), v_now, p_correlation);
  UPDATE decision.package_versions SET state = 'committed' WHERE package_id = p_package_id AND version = p_version;
  UPDATE decision.packages_current SET state = 'committed', committed_version = p_version, decided_at = v_now WHERE package_id = p_package_id;
  INSERT INTO decision.package_events (event_id, scope, tenant_id, domain_id, package_id, event, actor_principal_id, details, occurred_at, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_package_id, 'package.committed', p_committer,
          jsonb_build_object('version', p_version, 'commitment_id', p_commitment_id, 'version_digest', p_version_digest, 'approvals', v_approvals, 'op_class', public.eye_op_class(), 'policy_decision_id', public.eye_policy_decision(), 'choice', v.choice,
                             'reopened_from', CASE WHEN p.reopens > 0 THEN jsonb_build_object('version', p.reopened_from_version, 'cause', p.reopen_cause, 'reopens', p.reopens) END), v_now, p_correlation);
  RETURN jsonb_build_object('commitment_id', p_commitment_id, 'approvals', v_approvals, 'op_class', public.eye_op_class(), 'decided_at', v_now, 'policy_decision_id', public.eye_policy_decision(),
                            'reopened_from', CASE WHEN p.reopens > 0 THEN jsonb_build_object('version', p.reopened_from_version, 'cause', p.reopen_cause, 'reopens', p.reopens) END);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.commit_package(uuid,uuid,uuid,uuid,int,uuid,text,text,text,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.commit_package(uuid,uuid,uuid,uuid,int,uuid,text,text,text,text,uuid,uuid) TO eye_commit;


-- ============================================================
-- §M5 THE RUN GATE — simulation.open_run: 0084 §5's body (copied whole) with ONE block after the controls' check: a failed or suspended
-- marker on the scenario's forecast refuses the run; degraded or unknown admits it with controls.source_impact and a run marker.
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
  v_si_forecast uuid; v_si_markers jsonb; v_si_blocked boolean; v_si jsonb; /* B24 (0086) markers */
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
  /* B24 (0086) markers — F-P6-07 (V03-T-077): a run bound to a scenario rests on the scenario's forecast and on the sources of its series.
     An ACTIVE source-impact marker on that forecast (or on the scenario itself) that is FAILED or SUSPENDED refuses the run; DEGRADED or
     UNKNOWN admits it with controls.source_impact DECLARED on the run (the markers, the worst state) — the port declares it, never the
     caller — and marks the new run itself (one marker per source), so a package citing the run meets the commitment gate. */
  v_controls := v_controls - 'source_impact';
  IF p_scenario_id IS NOT NULL THEN
    SELECT s.forecast_id INTO v_si_forecast FROM prediction.scenarios_current s WHERE s.scenario_id = p_scenario_id;
    SELECT coalesce(jsonb_agg(jsonb_build_object('marker_id', m.marker_id, 'source_id', m.source_id, 'subject_kind', m.subject_kind, 'subject_id', m.subject_id,
                                                 'health_state', m.health_state, 'reason', m.reason, 'set_at', m.set_at) ORDER BY m.set_at, m.marker_id), '[]'::jsonb),
           coalesce(bool_or(m.health_state IN ('failed', 'suspended')), false)
      INTO v_si_markers, v_si_blocked
      FROM observation.source_impact_markers m
     WHERE m.tenant_id = p_tenant AND m.domain_id = p_domain AND m.state = 'active'
       AND ((m.subject_kind = 'forecast' AND m.subject_id = v_si_forecast) OR (m.subject_kind = 'scenario' AND m.subject_id = p_scenario_id));
    IF v_si_blocked THEN
      RAISE EXCEPTION 'run rejected (source_impact): scenario % rests on forecast % whose source is % (%); a branch resting on a failed or suspended source is not simulated until the source recovers',
        p_scenario_id, v_si_forecast,
        (SELECT string_agg(DISTINCT (x ->> 'health_state'), ', ') FROM jsonb_array_elements(v_si_markers) x WHERE (x ->> 'health_state') IN ('failed', 'suspended')),
        (SELECT string_agg(DISTINCT 'source ' || (x ->> 'source_id') || ' ' || (x ->> 'health_state'), '; ') FROM jsonb_array_elements(v_si_markers) x)
        USING ERRCODE = '22023';
    END IF;
    IF jsonb_array_length(v_si_markers) > 0 THEN
      v_si := jsonb_build_object('health_state', CASE WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(v_si_markers) x WHERE (x ->> 'health_state') = 'degraded') THEN 'degraded' ELSE 'unknown' END,
                                 'scenario_id', p_scenario_id, 'forecast_id', v_si_forecast, 'markers', v_si_markers, 'declared_at', clock_timestamp(),
                                 'note', 'admitted on a degraded or unknown source: the run''s result rests on it until the source recovers');
      v_controls := v_controls || jsonb_build_object('source_impact', v_si);
      INSERT INTO observation.source_impact_markers (marker_id, scope, tenant_id, domain_id, source_id, subject_kind, subject_id, health_state, reason, set_by_event, correlation_id)
      SELECT gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, x.source_id, 'run', p_run_id, x.health_state, 'the run was opened on a scenario resting on this source (run.opened)', p_event_id, p_correlation
        FROM (SELECT DISTINCT ON ((e ->> 'source_id')::uuid) (e ->> 'source_id')::uuid AS source_id, e ->> 'health_state' AS health_state
                FROM jsonb_array_elements(v_si_markers) e ORDER BY (e ->> 'source_id')::uuid, (e ->> 'health_state') = 'degraded' DESC) x
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;
  /* end B24 markers */
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

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §P (section `plan`)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0086 §P (B24 part `plan`) — CP-6 B24: THE SELECTED TRANSFORMATION PLAN EXECUTES (V03-T-291, AU-INT-0016; the B22 deferral
-- "the extraction run on ObservationRecorded").
--
-- Since 0083 the observations subscriber records intelligence.plan_selections — the ACTIVE extraction methods that read the recorded
-- evidence's source, or no_plan with the reason — and the run itself "stays an agent's act". This section makes the selected plan
-- EXECUTE, under the EXTRACTION AGENT's authority, once per evidence version:
--
--   * THE EXTRACTION AGENT REGISTRY (intelligence.extraction_agents) — the shape of graph.propagation_agents (0060): one active agent per
--     domain, its version and code digest (the CODE's, never the request's), an accountable human owner and an ESCALATION principal,
--     its budgets; registration and revocation are governed writes of a named human (intelligence.extraction.agent.register / .revoke),
--     each recorded in the append-only intelligence.extraction_agent_events. The agent's principal is kind `agent` and holds the Phase 2
--     role `extraction_agent` (0023) in the domain — the one whose whole surface is running a method and admitting claims.
--   * ITS OWN SESSION PORTS (intelligence.extraction_agent_session_open / _extend) — the shape of 0060 §4 over THIS registry, on the
--     identity authority under the identity-operation capability; an extension is bound to progress (one per recorded execution) and
--     re-verifies the grant, so a revocation that lands mid-drain ends the drain's authority at its next execution.
--   * THE EXECUTION LEDGER (intelligence.plan_executions) — ONE row per (tenant, domain, method, method version, evidence, evidence
--     version), UNIQUE: a redelivered or replayed ObservationRecorded, or a second producer's event for the same evidence version, never
--     queues a second run. States pending → running → done | refused | failed; the run id, the attempts, the last error and the outcome
--     are on the row; every transition is in the append-only intelligence.plan_execution_events.
--   * intelligence.select_transformation_plan RE-DECLARED (0083 §7 copied whole, the reasons verbatim): a SELECTED plan inserts ONE
--     pending execution per selected method IN THE DELIVERY'S OWN TRANSACTION (the evidence version resolved to the current one when the
--     event names none); no_plan inserts nothing and keeps its reason. The answer names the executions (queued now, or already queued).
--   * THE WORKER'S PORTS under the scheduler's bounded machine capability (0038/0039 — a refused grant still has to be recorded):
--     intelligence.claim_plan_executions (FOR UPDATE SKIP LOCKED; pending, a stale running lease, a failed row under its attempt budget),
--     intelligence.record_plan_execution (done | refused | failed, from running only), intelligence.plan_executions_to_reconcile() (the
--     startup reconcile, the shape of executive.briefings_to_reconcile 0048). The RUN itself acts as the agent, under the agent's
--     session, through the same governed pipeline an operator's /extract uses — nothing here writes a claim.
--   * NO AGENT REGISTERED: the rows stay PENDING and VISIBLE (the status read names why) — never silently dropped. A registration
--     re-queues the domain's REFUSED rows (a revoked grant's refusal is recorded, then recoverable).
--
-- NOT HERE (stated):
--   * no change to the observations consumer's delivery ledger, the attention, source-health or proposals consumers, or the attention
--     policy (other B24 parts); objects.interface_register is untouched (B24 adds no interface; the register stays 50/0/0);
--   * no new role (extraction_agent is 0023's); nothing in identity/tenancy/policy/audit/objects/ctx gains a port — the identity
--     authority gains USAGE on the intelligence schema for its two definer session ports and nothing else (0046 / 0060 precedent);
--   * no automatic escalation delivery: the escalation principal is recorded on the grant and named by the status read; routing an
--     exhausted or refused execution to a person is not built here;
--   * the extraction itself (the gateway, the identity, the lineage, the review queue) is unchanged — the worker calls the Phase 2
--     orchestrator with newAttempt = false, so 0023's extraction_identity makes a repeat free.

-- ============================================================
-- §P.1 THE EXTRACTION AGENT REGISTRY
-- ============================================================
CREATE TABLE intelligence.extraction_agents (
  agent_id                uuid PRIMARY KEY,
  scope                   text NOT NULL,
  tenant_id               uuid NOT NULL,
  domain_id               uuid NOT NULL,
  principal_id            uuid NOT NULL UNIQUE,                     -- identity.principals, kind='agent', role extraction_agent in this domain
  agent_version           text NOT NULL CHECK (agent_version ~ '^[0-9]+\.[0-9]+\.[0-9]+$'),
  code_digest             text NOT NULL CHECK (code_digest ~ '^[0-9a-f]{64}$'),
  owner_principal_id      uuid NOT NULL,                            -- the accountable human
  escalation_principal_id uuid NOT NULL,                            -- the human an exhausted or refused execution is escalated to
  budgets                 jsonb NOT NULL CHECK (jsonb_typeof(budgets) = 'object'
                            AND budgets ? 'max_executions_per_drain' AND budgets ? 'max_attempts' AND budgets ? 'drain_every_seconds'),
  status                  text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  created_by              uuid NOT NULL,
  created_at              timestamptz NOT NULL DEFAULT clock_timestamp(),
  revoked_at              timestamptz,
  correlation_id          uuid NOT NULL,
  CONSTRAINT iea_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT iea_revoked_has_time CHECK ((status = 'revoked') = (revoked_at IS NOT NULL))
);
CREATE UNIQUE INDEX iea_one_active_per_domain ON intelligence.extraction_agents (tenant_id, domain_id) WHERE status = 'active';
COMMENT ON TABLE intelligence.extraction_agents IS 'V03-T-291 (0086 §P, B24): the extraction agent a domain''s selected transformation plans run under — one active per domain, revocable; its principal holds extraction_agent (0023).';

CREATE TABLE intelligence.extraction_agent_events (
  event_id           uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  agent_id           uuid NOT NULL REFERENCES intelligence.extraction_agents(agent_id),
  event              text NOT NULL CHECK (event IN ('agent.registered', 'agent.revoked')),
  occurred_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  actor_principal_id uuid NOT NULL,
  details            jsonb NOT NULL DEFAULT '{}'::jsonb,
  correlation_id     uuid NOT NULL,
  CONSTRAINT ieae_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON intelligence.extraction_agent_events FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

-- ============================================================
-- §P.2 THE EXECUTION LEDGER — one row per method version × evidence version
-- ============================================================
CREATE TABLE intelligence.plan_executions (
  execution_id       uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  selection_id       uuid NOT NULL REFERENCES intelligence.plan_selections(selection_id),   -- the selection that first queued it
  method_id          uuid NOT NULL,
  method_key         text NOT NULL,
  method_version     int  NOT NULL CHECK (method_version >= 1),
  evd_object_id      uuid NOT NULL,
  evd_version        int  NOT NULL CHECK (evd_version >= 1),
  state              text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'running', 'done', 'refused', 'failed')),
  run_id             uuid,
  agent_id           uuid REFERENCES intelligence.extraction_agents(agent_id),
  principal_id       uuid,
  attempts           int  NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error         text,
  outcome            jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(outcome) = 'object'),
  queued_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  claimed_at         timestamptz,
  finished_at        timestamptz,
  correlation_id     uuid NOT NULL,
  CONSTRAINT ipx_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT ipx_once UNIQUE (tenant_id, domain_id, method_id, method_version, evd_object_id, evd_version),
  CONSTRAINT ipx_finished CHECK ((state IN ('done', 'refused', 'failed')) = (finished_at IS NOT NULL)),
  CONSTRAINT ipx_running_claimed CHECK (state <> 'running' OR (claimed_at IS NOT NULL AND agent_id IS NOT NULL)),
  CONSTRAINT ipx_done_has_run CHECK (state <> 'done' OR run_id IS NOT NULL)
);
CREATE INDEX ipx_state ON intelligence.plan_executions (tenant_id, domain_id, state, queued_at);
CREATE INDEX ipx_evd ON intelligence.plan_executions (tenant_id, domain_id, evd_object_id);
COMMENT ON TABLE intelligence.plan_executions IS 'V03-T-291 (0086 §P, B24): the selected plan''s executions — one per method version and evidence version (UNIQUE), run by the domain''s extraction agent; a row with no agent to run it stays pending and visible.';

CREATE TABLE intelligence.plan_execution_events (
  event_id           uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  execution_id       uuid NOT NULL REFERENCES intelligence.plan_executions(execution_id),
  event              text NOT NULL CHECK (event IN ('queued', 'claimed', 'done', 'refused', 'failed', 'requeued')),
  occurred_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  actor_principal_id uuid,
  details            jsonb NOT NULL DEFAULT '{}'::jsonb,
  correlation_id     uuid NOT NULL,
  CONSTRAINT ipxe_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX ipxe_execution ON intelligence.plan_execution_events (execution_id, occurred_at);
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON intelligence.plan_execution_events FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

-- Row-level security and read grants, exactly as intelligence.plan_selections (0083 §7).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['extraction_agents', 'extraction_agent_events', 'plan_executions', 'plan_execution_events'] LOOP
    EXECUTE format('ALTER TABLE intelligence.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE intelligence.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$CREATE POLICY intelligence_isolation ON intelligence.%I USING (tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain()))$f$, t);
    EXECUTE format('GRANT SELECT ON intelligence.%I TO eye_app, eye_commit', t);
  END LOOP;
END $$;

-- ============================================================
-- §P.3 REGISTRATION AND REVOCATION — a named human's act, on the commit authority
-- ============================================================
CREATE OR REPLACE FUNCTION intelligence.register_extraction_agent(
  p_agent_id uuid, p_tenant uuid, p_domain uuid, p_principal uuid, p_version text, p_code_digest text,
  p_owner uuid, p_escalation uuid, p_budgets jsonb, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = intelligence, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_kind text; v_status text; v_tenant uuid; v_requeued int := 0; x record;
BEGIN
  PERFORM observation.assert_authority(ARRAY['intelligence.extraction.agent.register']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN
    RAISE EXCEPTION 'extraction agent rejected: recorded by the acting principal only (the actor named is not the session''s principal)' USING ERRCODE = '42501';
  END IF;
  SELECT kind, status, tenant_id INTO v_kind, v_status, v_tenant FROM identity.principals WHERE id = p_principal;
  IF NOT FOUND OR v_kind <> 'agent' OR v_status <> 'active' OR v_tenant IS DISTINCT FROM p_tenant THEN
    RAISE EXCEPTION 'extraction agent rejected: principal % is not an active principal of kind agent in this tenant', p_principal USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM identity.role_bindings b WHERE b.principal_id = p_principal AND b.role_code = 'extraction_agent' AND b.scope = 'DOMAIN'
                    AND b.tenant_id = p_tenant AND b.domain_id = p_domain AND b.revoked_at IS NULL) THEN
    RAISE EXCEPTION 'extraction agent rejected: principal % holds no live extraction_agent binding in this domain', p_principal USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM identity.principals WHERE id = p_owner AND kind = 'human' AND status = 'active') THEN
    RAISE EXCEPTION 'extraction agent rejected: the accountable owner must be an active human principal' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM identity.principals WHERE id = p_escalation AND kind = 'human' AND status = 'active') THEN
    RAISE EXCEPTION 'extraction agent rejected: the escalation principal must be an active human principal' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_budgets) IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_budgets -> 'max_executions_per_drain') IS DISTINCT FROM 'number' OR (p_budgets ->> 'max_executions_per_drain')::numeric NOT BETWEEN 1 AND 50
     OR jsonb_typeof(p_budgets -> 'max_attempts') IS DISTINCT FROM 'number' OR (p_budgets ->> 'max_attempts')::numeric NOT BETWEEN 1 AND 5
     OR jsonb_typeof(p_budgets -> 'drain_every_seconds') IS DISTINCT FROM 'number' OR (p_budgets ->> 'drain_every_seconds')::numeric NOT BETWEEN 60 AND 86400 THEN
    RAISE EXCEPTION 'extraction agent rejected: budgets are {max_executions_per_drain 1..50, max_attempts 1..5, drain_every_seconds 60..86400}' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM intelligence.extraction_agents WHERE principal_id = p_principal) THEN
    RAISE EXCEPTION 'extraction agent rejected: principal % was already registered (a revoked registration is not reused; register a new principal)', p_principal USING ERRCODE = '23505';
  END IF;
  IF EXISTS (SELECT 1 FROM intelligence.extraction_agents WHERE tenant_id = p_tenant AND domain_id = p_domain AND status = 'active') THEN
    RAISE EXCEPTION 'extraction agent rejected: this domain already has an active extraction agent; revoke it first' USING ERRCODE = '23505';
  END IF;
  INSERT INTO intelligence.extraction_agents (agent_id, scope, tenant_id, domain_id, principal_id, agent_version, code_digest, owner_principal_id, escalation_principal_id, budgets, created_by, correlation_id)
  VALUES (p_agent_id, 'DOMAIN', p_tenant, p_domain, p_principal, p_version, p_code_digest, p_owner, p_escalation, p_budgets, p_actor, p_correlation);
  INSERT INTO intelligence.extraction_agent_events (event_id, scope, tenant_id, domain_id, agent_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_agent_id, 'agent.registered', p_actor,
          jsonb_build_object('principal_id', p_principal, 'version', p_version, 'code_digest', p_code_digest, 'owner', p_owner, 'escalation', p_escalation, 'budgets', p_budgets), p_correlation);
  -- A refusal recorded under a revoked grant is recoverable: the new agent's first drain takes the domain's refused executions again.
  FOR x IN SELECT e.execution_id, e.last_error FROM intelligence.plan_executions e WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain AND e.state = 'refused' FOR UPDATE LOOP
    UPDATE intelligence.plan_executions SET state = 'pending', finished_at = NULL WHERE execution_id = x.execution_id;
    INSERT INTO intelligence.plan_execution_events (event_id, scope, tenant_id, domain_id, execution_id, event, actor_principal_id, details, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, x.execution_id, 'requeued', p_actor, jsonb_build_object('agent_id', p_agent_id, 'refused_because', x.last_error, 'by', 'agent.registered'), p_correlation);
    v_requeued := v_requeued + 1;
  END LOOP;
  RETURN jsonb_build_object('agent_id', p_agent_id, 'principal_id', p_principal, 'version', p_version, 'code_digest', p_code_digest, 'budgets', p_budgets,
                            'owner', p_owner, 'escalation', p_escalation, 'requeued', v_requeued,
                            'pending', (SELECT count(*) FROM intelligence.plan_executions e WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain AND e.state = 'pending'));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION intelligence.register_extraction_agent(uuid,uuid,uuid,uuid,text,text,uuid,uuid,jsonb,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION intelligence.register_extraction_agent(uuid,uuid,uuid,uuid,text,text,uuid,uuid,jsonb,uuid,uuid,uuid) TO eye_commit;

CREATE OR REPLACE FUNCTION intelligence.revoke_extraction_agent(
  p_agent_id uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = intelligence, observation, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_authority(ARRAY['intelligence.extraction.agent.revoke']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN
    RAISE EXCEPTION 'extraction agent revocation rejected: recorded by the acting principal only (the actor named is not the session''s principal)' USING ERRCODE = '42501';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN
    RAISE EXCEPTION 'extraction agent revocation rejected: a revocation states its reason (at least 8 characters)' USING ERRCODE = '22023';
  END IF;
  UPDATE intelligence.extraction_agents SET status = 'revoked', revoked_at = clock_timestamp()
   WHERE agent_id = p_agent_id AND tenant_id = p_tenant AND domain_id = p_domain AND status = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'extraction agent revocation rejected: % is not an active extraction agent of this domain', p_agent_id USING ERRCODE = '23503';
  END IF;
  INSERT INTO intelligence.extraction_agent_events (event_id, scope, tenant_id, domain_id, agent_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_agent_id, 'agent.revoked', p_actor, jsonb_build_object('reason', p_reason), p_correlation);
  RETURN jsonb_build_object('agent_id', p_agent_id, 'status', 'revoked',
                            'pending', (SELECT count(*) FROM intelligence.plan_executions e WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain AND e.state = 'pending'));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION intelligence.revoke_extraction_agent(uuid,uuid,uuid,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION intelligence.revoke_extraction_agent(uuid,uuid,uuid,text,uuid,uuid,uuid) TO eye_commit;

-- ============================================================
-- §P.4 THE AGENT'S OWN SESSION — 0060 §4 over THIS registry (identity authority, identity-operation capability)
-- ============================================================
CREATE OR REPLACE FUNCTION intelligence.extraction_agent_session_open(
  p_session uuid, p_agent_id uuid, p_tenant uuid, p_domain uuid, p_agent_version text, p_code_digest text,
  p_refresh_hash text, p_context_key_hash text, p_expires_at timestamptz, p_family uuid
) RETURNS uuid
SECURITY DEFINER SET search_path = intelligence, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE a intelligence.extraction_agents%ROWTYPE; v_kind text; v_status text;
BEGIN
  IF public.eye_ctx_mode() <> 'identity_op' THEN
    RAISE EXCEPTION 'extraction agent session denied: identity operation capability required (context is %)', public.eye_ctx_mode() USING ERRCODE = '42501';
  END IF;
  SELECT * INTO a FROM intelligence.extraction_agents WHERE agent_id = p_agent_id AND tenant_id = p_tenant AND domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'extraction agent session denied: the agent is not registered in this domain' USING ERRCODE = '42501'; END IF;
  IF a.status <> 'active' THEN RAISE EXCEPTION 'extraction agent session denied: agent grant is revoked' USING ERRCODE = '42501'; END IF;
  IF a.agent_version IS DISTINCT FROM p_agent_version OR a.code_digest IS DISTINCT FROM p_code_digest THEN
    RAISE EXCEPTION 'extraction agent session denied: agent instance or code digest does not match the registration' USING ERRCODE = '42501';
  END IF;
  SELECT kind, status INTO v_kind, v_status FROM identity.principals WHERE id = a.principal_id;
  IF v_kind IS DISTINCT FROM 'agent' OR v_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'extraction agent session denied: principal is not an active agent principal' USING ERRCODE = '42501';
  END IF;
  PERFORM identity.session_open(p_session, a.principal_id, 'agent_grant', p_refresh_hash, p_context_key_hash, p_expires_at, p_family);
  RETURN a.principal_id;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION intelligence.extraction_agent_session_open(uuid,uuid,uuid,uuid,text,text,text,text,timestamptz,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION intelligence.extraction_agent_session_open(uuid,uuid,uuid,uuid,text,text,text,text,timestamptz,uuid) TO eye_identity;

CREATE OR REPLACE FUNCTION intelligence.extraction_agent_session_extend(
  p_session uuid, p_agent_id uuid, p_tenant uuid, p_domain uuid, p_agent_version text, p_code_digest text, p_expires_at timestamptz
) RETURNS timestamptz
SECURITY DEFINER SET search_path = intelligence, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE a intelligence.extraction_agents%ROWTYPE; s identity.sessions%ROWTYPE; v_kind text; v_status text; v_new timestamptz;
BEGIN
  IF public.eye_ctx_mode() <> 'identity_op' THEN
    RAISE EXCEPTION 'extraction agent session extension denied: identity operation capability required (context is %)', public.eye_ctx_mode() USING ERRCODE = '42501';
  END IF;
  IF p_expires_at IS NULL OR p_expires_at > clock_timestamp() + interval '1 day' THEN
    RAISE EXCEPTION 'extraction agent session extension denied: an extension is bounded to one day ahead' USING ERRCODE = '42501';
  END IF;
  -- The grant, re-verified as at opening: an agent revoked mid-drain gets no more authority.
  SELECT * INTO a FROM intelligence.extraction_agents WHERE agent_id = p_agent_id AND tenant_id = p_tenant AND domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'extraction agent session extension denied: the agent is not registered in this domain' USING ERRCODE = '42501'; END IF;
  IF a.status <> 'active' THEN RAISE EXCEPTION 'extraction agent session extension denied: agent grant is revoked' USING ERRCODE = '42501'; END IF;
  IF a.agent_version IS DISTINCT FROM p_agent_version OR a.code_digest IS DISTINCT FROM p_code_digest THEN
    RAISE EXCEPTION 'extraction agent session extension denied: agent instance or code digest does not match the registration' USING ERRCODE = '42501';
  END IF;
  SELECT kind, status INTO v_kind, v_status FROM identity.principals WHERE id = a.principal_id;
  IF v_kind IS DISTINCT FROM 'agent' OR v_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'extraction agent session extension denied: principal is not an active agent principal' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO s FROM identity.sessions WHERE id = p_session FOR UPDATE;
  IF NOT FOUND OR s.principal_id <> a.principal_id OR s.assurance <> 'agent_grant' THEN
    RAISE EXCEPTION 'extraction agent session extension denied: no such run session for this agent' USING ERRCODE = '42501';
  END IF;
  IF s.status <> 'active' OR s.expires_at <= clock_timestamp() THEN
    RAISE EXCEPTION 'extraction agent session extension denied: the run session is no longer active' USING ERRCODE = '42501';
  END IF;
  v_new := greatest(s.expires_at, p_expires_at);
  UPDATE identity.sessions SET expires_at = v_new WHERE id = p_session;
  RETURN v_new;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION intelligence.extraction_agent_session_extend(uuid,uuid,uuid,uuid,text,text,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION intelligence.extraction_agent_session_extend(uuid,uuid,uuid,uuid,text,text,timestamptz) TO eye_identity;
-- The identity authority reaches these TWO definer ports and nothing else in the schema: usage, no table grants.
GRANT USAGE ON SCHEMA intelligence TO eye_identity;

-- ============================================================
-- §P.5 THE PLAN SELECTED → ITS EXECUTIONS QUEUED, in the delivery's own transaction
-- ============================================================
-- intelligence.select_transformation_plan: 0083 §7's body with the executions queued (one pending row per selected method, UNIQUE per
-- method version and evidence version) and named in the answer — the reasons, the refusal and the selection row as 0083 left them.
CREATE OR REPLACE FUNCTION intelligence.select_transformation_plan(p_tenant uuid, p_domain uuid, p_event_id uuid, p_evd uuid, p_evd_version int, p_source_id uuid, p_mode text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = intelligence, observation, objects, ctx, public, pg_catalog, pg_temp AS $$
DECLARE s intelligence.plan_selections%ROWTYPE; v_methods jsonb; v_reason text; v_outcome text; v_id uuid := gen_random_uuid();
        m jsonb; v_evd_version int; v_exec uuid; v_executions jsonb := '[]'::jsonb; px intelligence.plan_executions%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['intelligence.observation.subscription.apply']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT * INTO s FROM intelligence.plan_selections x WHERE x.outbox_event_id = p_event_id AND x.evd_object_id = p_evd;
  IF FOUND THEN
    -- B24 (0086 §P): a repeated selection names the executions of its evidence's methods as they stand — it queues nothing.
    SELECT coalesce(jsonb_agg(jsonb_build_object('execution_id', e.execution_id, 'method_id', e.method_id, 'method_version', e.method_version, 'evd_version', e.evd_version,
                                                 'state', e.state, 'queued', false) ORDER BY e.method_key, e.method_version), '[]'::jsonb)
      INTO v_executions
      FROM intelligence.plan_executions e
     WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain AND e.evd_object_id = p_evd
       AND e.method_id IN (SELECT (j ->> 'method_id')::uuid FROM jsonb_array_elements(s.methods) j);
    RETURN jsonb_build_object('selection_id', s.selection_id, 'repeated', true, 'outcome', s.outcome, 'methods', s.methods, 'reason', s.reason, 'executions', v_executions);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM objects.canonical_objects o WHERE o.object_id = p_evd AND o.tenant_id = p_tenant AND o.domain_id = p_domain AND o.object_type = 'EVD') THEN
    RAISE EXCEPTION 'plan selection rejected: evidence % is not a record of this domain', p_evd USING ERRCODE = '23503';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('method_id', m.method_id, 'method_key', m.method_key, 'method_version', m.method_version, 'target_types', to_jsonb(m.target_types),
                                               'reads', CASE WHEN m.source_id IS NULL THEN 'any source' ELSE 'this source' END) ORDER BY m.method_key, m.method_version), '[]'::jsonb)
    INTO v_methods
    FROM intelligence.methods_current m
   WHERE m.tenant_id = p_tenant AND m.domain_id = p_domain AND m.lifecycle_state = 'active' AND (m.source_id IS NULL OR m.source_id = p_source_id);
  IF jsonb_array_length(v_methods) > 0 THEN
    v_outcome := 'selected'; v_reason := format('%s active extraction method(s) read this source; the run is an extraction agent''s governed act', jsonb_array_length(v_methods));
  ELSE
    v_outcome := 'no_plan';
    v_reason := CASE WHEN EXISTS (SELECT 1 FROM intelligence.methods_current m WHERE m.tenant_id = p_tenant AND m.domain_id = p_domain AND (m.source_id IS NULL OR m.source_id = p_source_id))
                     THEN 'the methods that read this source are not active (draft, approved, suspended or retired)'
                     ELSE 'no extraction method of this domain reads this source' END;
  END IF;
  INSERT INTO intelligence.plan_selections (selection_id, scope, tenant_id, domain_id, outbox_event_id, evd_object_id, evd_version, source_id, acquisition_mode, outcome, methods, reason, actor_principal_id, correlation_id)
  VALUES (v_id, 'DOMAIN', p_tenant, p_domain, p_event_id, p_evd, p_evd_version, p_source_id, p_mode, v_outcome, v_methods, v_reason, p_actor, p_correlation);
  -- B24 (0086 §P): the selected plan's EXECUTIONS — one pending row per selected method for THIS evidence version (the current version
  -- when the event names none), UNIQUE per method version and evidence version: a second event for the same evidence version queues nothing.
  IF v_outcome = 'selected' THEN
    v_evd_version := coalesce(p_evd_version, (SELECT max(o.object_version)::int FROM objects.canonical_objects o WHERE o.object_id = p_evd AND o.tenant_id = p_tenant AND o.domain_id = p_domain));
    FOR m IN SELECT j FROM jsonb_array_elements(v_methods) j LOOP
      v_exec := NULL;
      INSERT INTO intelligence.plan_executions (execution_id, scope, tenant_id, domain_id, selection_id, method_id, method_key, method_version, evd_object_id, evd_version, correlation_id)
      VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, v_id, (m ->> 'method_id')::uuid, m ->> 'method_key', (m ->> 'method_version')::int, p_evd, v_evd_version, p_correlation)
      ON CONFLICT ON CONSTRAINT ipx_once DO NOTHING
      RETURNING execution_id INTO v_exec;
      IF v_exec IS NOT NULL THEN
        INSERT INTO intelligence.plan_execution_events (event_id, scope, tenant_id, domain_id, execution_id, event, actor_principal_id, details, correlation_id)
        VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, v_exec, 'queued', p_actor,
                jsonb_build_object('selection_id', v_id, 'outbox_event_id', p_event_id, 'method_key', m ->> 'method_key', 'evd_version', v_evd_version), p_correlation);
        v_executions := v_executions || jsonb_build_object('execution_id', v_exec, 'method_id', m ->> 'method_id', 'method_version', (m ->> 'method_version')::int, 'evd_version', v_evd_version, 'state', 'pending', 'queued', true);
      ELSE
        SELECT * INTO px FROM intelligence.plan_executions e WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain AND e.method_id = (m ->> 'method_id')::uuid
           AND e.method_version = (m ->> 'method_version')::int AND e.evd_object_id = p_evd AND e.evd_version = v_evd_version;
        v_executions := v_executions || jsonb_build_object('execution_id', px.execution_id, 'method_id', px.method_id, 'method_version', px.method_version, 'evd_version', px.evd_version, 'state', px.state, 'queued', false);
      END IF;
    END LOOP;
  END IF;
  RETURN jsonb_build_object('selection_id', v_id, 'repeated', false, 'outcome', v_outcome, 'methods', v_methods, 'reason', v_reason, 'executions', v_executions);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION intelligence.select_transformation_plan(uuid,uuid,uuid,uuid,int,uuid,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION intelligence.select_transformation_plan(uuid,uuid,uuid,uuid,int,uuid,text,uuid,uuid) TO eye_commit;

-- ============================================================
-- §P.6 THE WORKER'S LEDGER PORTS — the scheduler's bounded machine capability (0038/0039); a refused grant is still recorded
-- ============================================================
-- Claim: the drain's executions, oldest first — pending ones, a running one whose lease went stale (a process that died mid-run; 15
-- minutes), a failed one still under the agent's attempt budget — FOR UPDATE SKIP LOCKED, so two workers never hold one execution.
-- The claim binds the rows to the job's agent; whether that agent may RUN them is its session's answer (revoked → refused, recorded).
CREATE OR REPLACE FUNCTION intelligence.claim_plan_executions(p_tenant uuid, p_domain uuid, p_agent_id uuid, p_limit int, p_correlation uuid)
RETURNS TABLE (execution_id uuid, selection_id uuid, method_id uuid, method_key text, method_version int, evd_object_id uuid, evd_version int, attempts int, correlation_id uuid)
SECURITY DEFINER SET search_path = intelligence, observation, ctx, public, pg_catalog, pg_temp AS $$
#variable_conflict use_column
DECLARE a intelligence.extraction_agents%ROWTYPE; v_max int;
BEGIN
  PERFORM ctx.assert_capability('schedule', 'scheduler', 'observation.schedule.reconcile');
  IF p_tenant IS NULL OR p_domain IS NULL OR p_agent_id IS NULL OR (p_limit IS NOT NULL AND (p_limit < 1 OR p_limit > 50)) THEN
    RAISE EXCEPTION 'plan execution rejected: a claim names a tenant, a domain, an agent and (optionally) a limit in 1..50' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO a FROM intelligence.extraction_agents x WHERE x.agent_id = p_agent_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'plan execution rejected: agent % is not registered in this domain', p_agent_id USING ERRCODE = '23503';
  END IF;
  v_max := (a.budgets ->> 'max_attempts')::int;
  RETURN QUERY
  WITH picked AS (
    SELECT e.execution_id FROM intelligence.plan_executions e
     WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain
       AND (e.state = 'pending'
            OR (e.state = 'running' AND e.claimed_at < clock_timestamp() - interval '15 minutes')
            OR (e.state = 'failed' AND e.attempts < v_max))
     ORDER BY e.queued_at, e.execution_id
     LIMIT coalesce(p_limit, (a.budgets ->> 'max_executions_per_drain')::int)   -- the agent's own budget unless the caller narrows it
       FOR UPDATE SKIP LOCKED),
  moved AS (
    UPDATE intelligence.plan_executions e
       SET state = 'running', attempts = e.attempts + 1, agent_id = a.agent_id, principal_id = a.principal_id, claimed_at = clock_timestamp(), finished_at = NULL
      FROM picked WHERE e.execution_id = picked.execution_id
    RETURNING e.*),
  logged AS (
    INSERT INTO intelligence.plan_execution_events (event_id, scope, tenant_id, domain_id, execution_id, event, actor_principal_id, details, correlation_id)
    SELECT gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, mv.execution_id, 'claimed', NULL,
           jsonb_build_object('agent_id', a.agent_id, 'attempt', mv.attempts, 'agent_status', a.status), p_correlation FROM moved mv
    RETURNING 1)
  SELECT mv.execution_id, mv.selection_id, mv.method_id, mv.method_key, mv.method_version, mv.evd_object_id, mv.evd_version, mv.attempts, mv.correlation_id
    FROM moved mv
   ORDER BY mv.queued_at, mv.execution_id;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION intelligence.claim_plan_executions(uuid,uuid,uuid,int,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION intelligence.claim_plan_executions(uuid,uuid,uuid,int,uuid) TO eye_commit;

-- Record: the outcome of a claimed execution — done (the run id required), refused (a governance answer: the grant, the policy, the
-- method's state, an unreadable evidence), failed (an infrastructure or run failure; re-claimed while under the attempt budget).
CREATE OR REPLACE FUNCTION intelligence.record_plan_execution(p_execution_id uuid, p_tenant uuid, p_domain uuid, p_outcome text, p_run_id uuid, p_error text, p_details jsonb)
RETURNS text
SECURITY DEFINER SET search_path = intelligence, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE e intelligence.plan_executions%ROWTYPE; v_max int; v_exhausted boolean := false;
BEGIN
  PERFORM ctx.assert_capability('schedule', 'scheduler', 'observation.schedule.reconcile');
  IF p_outcome NOT IN ('done', 'refused', 'failed') THEN
    RAISE EXCEPTION 'plan execution rejected: an outcome is done, refused or failed' USING ERRCODE = '22023';
  END IF;
  IF p_outcome = 'done' AND p_run_id IS NULL THEN
    RAISE EXCEPTION 'plan execution rejected: a done execution names its run' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO e FROM intelligence.plan_executions x WHERE x.execution_id = p_execution_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'plan execution rejected: execution % is not an execution of this domain', p_execution_id USING ERRCODE = '23503'; END IF;
  IF e.state <> 'running' THEN
    RAISE EXCEPTION 'plan execution rejected: execution % is %, not running; only a claimed execution records an outcome', p_execution_id, e.state USING ERRCODE = '23514';
  END IF;
  IF p_outcome = 'failed' THEN
    SELECT (a.budgets ->> 'max_attempts')::int INTO v_max FROM intelligence.extraction_agents a WHERE a.agent_id = e.agent_id;
    v_exhausted := e.attempts >= coalesce(v_max, 1);
  END IF;
  UPDATE intelligence.plan_executions
     SET state = p_outcome, run_id = coalesce(p_run_id, run_id), last_error = CASE WHEN p_outcome = 'done' THEN NULL ELSE left(p_error, 500) END,
         outcome = coalesce(p_details, '{}'::jsonb) || jsonb_build_object('attempt', e.attempts, 'exhausted', v_exhausted), finished_at = clock_timestamp()
   WHERE execution_id = p_execution_id;
  INSERT INTO intelligence.plan_execution_events (event_id, scope, tenant_id, domain_id, execution_id, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_execution_id, p_outcome, e.principal_id,
          coalesce(p_details, '{}'::jsonb) || jsonb_build_object('run_id', p_run_id, 'error', left(p_error, 500), 'attempt', e.attempts, 'agent_id', e.agent_id, 'exhausted', v_exhausted), e.correlation_id);
  RETURN p_outcome;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION intelligence.record_plan_execution(uuid,uuid,uuid,text,uuid,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION intelligence.record_plan_execution(uuid,uuid,uuid,text,uuid,text,jsonb) TO eye_commit;

-- What a cold process must serve (the shape of executive.briefings_to_reconcile, 0048): every domain with an active extraction agent,
-- the agent's identity and cadence, and how many of its executions a drain would take now.
CREATE OR REPLACE FUNCTION intelligence.plan_executions_to_reconcile()
RETURNS TABLE (tenant_id uuid, domain_id uuid, agent_id uuid, agent_version text, code_digest text, budgets jsonb, claimable int)
SECURITY DEFINER SET search_path = intelligence, ctx, public, pg_catalog, pg_temp AS $$
#variable_conflict use_column
BEGIN
  PERFORM ctx.assert_capability('schedule', 'scheduler', 'observation.schedule.reconcile');
  RETURN QUERY
    SELECT a.tenant_id, a.domain_id, a.agent_id, a.agent_version, a.code_digest, a.budgets,
           (SELECT count(*)::int FROM intelligence.plan_executions e
             WHERE e.tenant_id = a.tenant_id AND e.domain_id = a.domain_id
               AND (e.state = 'pending' OR (e.state = 'running' AND e.claimed_at < clock_timestamp() - interval '15 minutes')
                    OR (e.state = 'failed' AND e.attempts < (a.budgets ->> 'max_attempts')::int)))
      FROM intelligence.extraction_agents a WHERE a.status = 'active' ORDER BY a.tenant_id, a.domain_id;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION intelligence.plan_executions_to_reconcile() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION intelligence.plan_executions_to_reconcile() TO eye_commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §I (section `zz_integrator`)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0086 §I (the integrator) — observation.mark_source_impact (0083 §6 copied whole; one change): a marker KEPT across a change between two
-- non-healthy states (degraded → suspended, suspended → degraded, …) no longer keeps the OLD state — it is cleared (cleared_state = the new
-- state) and a new marker is set, so the B24 gates (the commitment's acknowledgement, the run's failed/suspended refusal) read the current
-- state and an acknowledgement for the old marker does not carry. Found by the markers part (it was not that part's function).

CREATE OR REPLACE FUNCTION observation.mark_source_impact(p_tenant uuid, p_domain uuid, p_source_id uuid, p_health_state text, p_reason text, p_event_id uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE d record; v_set jsonb := '[]'::jsonb; v_kept jsonb := '[]'::jsonb; v_changed jsonb := '[]'::jsonb; v_cleared jsonb := '[]'::jsonb; m observation.source_impact_markers%ROWTYPE; v_degraded boolean;
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
  END IF;
  RETURN jsonb_build_object('source_id', p_source_id, 'health_state', p_health_state, 'degraded', v_degraded, 'set', v_set, 'kept', v_kept, 'changed', v_changed, 'cleared', v_cleared);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION observation.mark_source_impact(uuid,uuid,uuid,text,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.mark_source_impact(uuid,uuid,uuid,text,text,uuid,uuid,uuid) TO eye_commit;

