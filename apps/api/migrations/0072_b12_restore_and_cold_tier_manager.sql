-- 0072 — CP-6 B12: the governed RESTORE-TO-HOT port and the COLD-TIER MANAGER (2026-09-15).
--
-- THE GAP. The register records, for L3-C08 / DZ-18 / DAT-ST-06 (AU-MEM-0062, AU-INF-0791), what remained after B11 and its
-- closure: no restore-to-hot port; no budgets, ordering, retries or escalation of a cold-tier manager; the sweeper not walking
-- the archive root. V3 L3-C08 names the manager in seven words — "admission, ordering, retries, budgets, escalation, completion,
-- and observable state"; V7 DZ-18 names the archive tier's lifecycle authority — "retention, hold, retrieval, deletion".
--
-- THE MECHANISM. (D1) A restore is a MOVE BACK recorded in the SAME ledger: observation.blob_tier_records already admits
-- from_tier 'archive' → tier 'hot' (0070 §2 said 'hot' as a target was a later restore port; this is it); a manifest's tier
-- stays observation.manifest_tier — its latest record; no new column, no manifest UPDATE. (D2) The restore executor is the
-- archive executor mirrored under 0071's ownership discipline: the archive copy is STAGED in the hot root under the attempt's
-- own name, the move recorded through observation.restore_blob under the manifest's lock, committed, PUBLISHED under the
-- locator, and only then is the archive copy removed; a publish that fails keeps the archive copy and records a pending
-- residual the execute route retries. (D3) One tier holds the served bytes: the restore's verification contract is the
-- archive's mirrored — no tombstone, the tier hot, the hot copy under the digest, the archive copy ABSENT, no staged copy in
-- either root, the move recorded. (D4) The cold-tier manager is a per-domain POLICY (retention.tier_policies) plus the
-- evaluation and execution rules that read it: ADMISSION/BUDGETS — a daily byte budget refuses an archive or a restore at
-- begin_execution before the state moves and before any lock is taken (the controller pauses it for a retry naming the instant
-- the window frees); ORDERING — a schedule opens its due manifests oldest-due first, at most max_opens_per_evaluation per
-- evaluation, the rest DEFERRED and counted on the schedule; RETRIES — an attempt is an execution that BEGAN, counted in the
-- same UPDATE that moves the state to executing, and — when the execution fails after that — where the failure is durably
-- recorded (the pause; C2); exhausted, the execution is refused and the action ESCALATED for human review, the approvals
-- revoked; a person's re-resolution of an escalated action restarts the count; ESCALATION BY AGE — an action paused for retry
-- longer than escalate_after is escalated by the next evaluation; COMPLETION — the verification contracts; OBSERVABLE STATE —
-- retention.tier_state; THE RESTORE WINDOW — an archive schedule treats a restored manifest as due restore_hot_for after its
-- restore, so a restored record returns to the cold tier by the existing schedule (a RESTORE is on demand: no schedule of that
-- kind is declarable). (D5) A restore's scope is PRESERVATION: every manifest the selector names; a hot one excluded; a hold
-- recorded and honoured by keeping. (D7) No new interface is bound: L3-I04's binding text gains the B12 clause, the counts stay.
--
--   §1 the RESTORE kind, the attempt and escalation columns, the schedule's last evaluation, the events custody.restored and
--      action.escalated; retention.tier_policies (append-only versions; RLS as retention's other tables); retention.current_tier_policy
--      (the latest version, else the defaults); retention.declare_tier_policy; retention.escalate_action; retention.evaluate_tier;
--      retention.tier_state; retention.pause_action's 8-argument form counting a failed attempt (C2).
--   §2 the restore port observation.restore_blob — 0071 §2's archive_blob mirrored, every check kept (the executing RESTORE action,
--      the manifest's lock, the digest; idempotent under the lock).
--   §3 retention.open_action re-declared: the restore admitted with the chosen object set (C1).
--   §4 retention.resolve_scope re-declared: the restore branch (a hot manifest excluded; a hold kept); a re-resolution of an escalated
--      action resets the attempts and says so (attempts_reset; C8).
--   §5 retention.begin_execution re-declared: the manager's two checks before the locks — the attempts against max_attempts, the daily
--      byte budget against the rolling window (exact under concurrency: a budgeted domain's byte movers are serialised; C11) — the
--      restore locked exclusively like an archive, the attempt counted with the state move.
--   §6 retention.verify_action re-declared: the restore contract; a restore's pending residual closes when the archive copy is observed
--      gone (C5).
--   §7 retention.declare_schedule refuses the restore kind; retention.evaluate_schedules orders oldest-due first, bounds the opens,
--      defers and counts the rest (the count taken before any action opens; C7), and honours the restore window.
--   §8 the interface register: L3-I04's binding text gains the B12 clause (counts unchanged: 26 bound, 24 partial, 0 unbound).

-- ============================================================
-- §1 the RESTORE kind and the tier policy
-- ============================================================
ALTER TABLE retention.actions_current DROP CONSTRAINT actions_current_kind_check;
ALTER TABLE retention.actions_current ADD CONSTRAINT actions_current_kind_check CHECK (kind IN ('review', 'deletion', 'archive', 'log_floor', 'customer_export', 'restore'));
-- An ATTEMPT is an execution that began (the state moved to executing) — or one whose failure after that is recorded by the pause (C2).
-- A person's re-resolution of an ESCALATED action resets both: a human review restarts the retry budget.
ALTER TABLE retention.actions_current ADD COLUMN attempts int NOT NULL DEFAULT 0 CHECK (attempts >= 0);
ALTER TABLE retention.actions_current ADD COLUMN escalated_at timestamptz;
-- What the last evaluation did for this schedule: {at, opened, deferred} (D4 "ordering").
ALTER TABLE retention.schedules ADD COLUMN last_evaluation jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE retention.action_events DROP CONSTRAINT action_events_event_check;
ALTER TABLE retention.action_events ADD CONSTRAINT action_events_event_check CHECK (event IN ('action.opened', 'scope.resolved', 'action.held', 'action.paused', 'approval.recorded', 'approval.revoked', 'execution.started', 'execution.item', 'execution.finished', 'residual.recorded', 'verification.passed', 'verification.residuals', 'action.withdrawn', 'action.rejected', 'action.failed', 'export.built', 'export.revoked', 'action.escalated'));
ALTER TABLE observation.custody_events DROP CONSTRAINT custody_events_event_check;
ALTER TABLE observation.custody_events ADD CONSTRAINT custody_events_event_check CHECK (event IN (
  'custody.acquired', 'custody.quarantined', 'custody.verified', 'custody.candidate_verified', 'custody.admitted', 'custody.finalized',
  'custody.retrieved', 'custody.tombstoned', 'custody.integrity_failed', 'custody.archived', 'custody.exported', 'custody.restored'));

-- THE POLICY of the cold-tier manager, per domain, one row per version (append-only: a declaration is a new version, the latest is in
-- force; a domain without one is governed by the defaults — unbounded budget, 200 opens per evaluation, 3 attempts, 7 days to
-- escalation, 30 days hot after a restore). Read by begin_execution (budgets, attempts), evaluate_schedules (ordering, the restore
-- window), evaluate_tier (escalation by age) and tier_state (the observable state).
CREATE TABLE retention.tier_policies (
  policy_id                 uuid PRIMARY KEY,
  scope                     text NOT NULL,
  tenant_id                 uuid NOT NULL,
  domain_id                 uuid NOT NULL,
  version                   int NOT NULL CHECK (version >= 1),
  budget_bytes_per_day      bigint CHECK (budget_bytes_per_day IS NULL OR budget_bytes_per_day > 0),
  max_opens_per_evaluation  int NOT NULL CHECK (max_opens_per_evaluation BETWEEN 1 AND 200),
  max_attempts              int NOT NULL CHECK (max_attempts BETWEEN 1 AND 10),
  escalate_after            interval NOT NULL CHECK (escalate_after >= interval '0'),
  restore_hot_for           interval NOT NULL CHECK (restore_hot_for >= interval '0'),
  declared_by               uuid NOT NULL,
  declared_at               timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id            uuid NOT NULL,
  CONSTRAINT rtp_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT rtp_version UNIQUE (tenant_id, domain_id, version)
);
CREATE TRIGGER rtp_append_only BEFORE UPDATE OR DELETE ON retention.tier_policies FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
ALTER TABLE retention.tier_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE retention.tier_policies FORCE ROW LEVEL SECURITY;
CREATE POLICY retention_isolation ON retention.tier_policies
  USING (tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain()));
REVOKE ALL ON retention.tier_policies FROM PUBLIC;
GRANT SELECT ON retention.tier_policies TO eye_app, eye_commit;

-- The policy IN FORCE for a domain: the latest declared version (declared true), else the defaults with policy_id NULL and version 0.
CREATE OR REPLACE FUNCTION retention.current_tier_policy(p_tenant uuid, p_domain uuid)
RETURNS TABLE (policy_id uuid, version int, budget_bytes_per_day bigint, max_opens_per_evaluation int, max_attempts int, escalate_after interval, restore_hot_for interval, declared boolean)
STABLE SET search_path = retention, pg_catalog, pg_temp AS $$
  (SELECT p.policy_id, p.version, p.budget_bytes_per_day, p.max_opens_per_evaluation, p.max_attempts, p.escalate_after, p.restore_hot_for, true
     FROM retention.tier_policies p WHERE p.tenant_id = p_tenant AND p.domain_id = p_domain ORDER BY p.version DESC LIMIT 1)
  UNION ALL
  (SELECT NULL::uuid, 0, NULL::bigint, 200, 3, interval '7 days', interval '30 days', false
    WHERE NOT EXISTS (SELECT 1 FROM retention.tier_policies p WHERE p.tenant_id = p_tenant AND p.domain_id = p_domain));
$$ LANGUAGE sql;
REVOKE ALL ON FUNCTION retention.current_tier_policy(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION retention.current_tier_policy(uuid, uuid) TO eye_app, eye_commit;

-- THE DECLARATION (retention.tier.declare — a domain admin's act; the route validates the shapes, the port validates the bounds as
-- the CHECKs say). The version is allocated under a per-domain transaction lock (C10): two declarations of one domain serialise and
-- neither collides on rtp_version. Returns the row as jsonb, the intervals as text.
CREATE OR REPLACE FUNCTION retention.declare_tier_policy(
  p_policy_id uuid, p_tenant uuid, p_domain uuid, p_budget_bytes_per_day bigint, p_max_opens_per_evaluation int, p_max_attempts int,
  p_escalate_after interval, p_restore_hot_for interval, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = retention, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_version int; v_at timestamptz;
BEGIN
  PERFORM observation.assert_authority(ARRAY['retention.tier.declare']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'retention tier policy rejected: declared by the acting principal' USING ERRCODE = '42501'; END IF;
  IF p_budget_bytes_per_day IS NOT NULL AND p_budget_bytes_per_day <= 0 THEN RAISE EXCEPTION 'retention tier policy rejected: budget_bytes_per_day is null (unbounded) or a positive number of bytes per day' USING ERRCODE = '22023'; END IF;
  IF p_max_opens_per_evaluation IS NULL OR p_max_opens_per_evaluation NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'retention tier policy rejected: max_opens_per_evaluation is between 1 and 200' USING ERRCODE = '22023'; END IF;
  IF p_max_attempts IS NULL OR p_max_attempts NOT BETWEEN 1 AND 10 THEN RAISE EXCEPTION 'retention tier policy rejected: max_attempts is between 1 and 10' USING ERRCODE = '22023'; END IF;
  IF p_escalate_after IS NULL OR p_escalate_after < interval '0' THEN RAISE EXCEPTION 'retention tier policy rejected: escalate_after is a non-negative interval' USING ERRCODE = '22023'; END IF;
  IF p_restore_hot_for IS NULL OR p_restore_hot_for < interval '0' THEN RAISE EXCEPTION 'retention tier policy rejected: restore_hot_for is a non-negative interval' USING ERRCODE = '22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('retention.tier_policies:' || p_tenant::text || ':' || p_domain::text, 0));
  SELECT coalesce(max(p.version), 0) + 1 INTO v_version FROM retention.tier_policies p WHERE p.tenant_id = p_tenant AND p.domain_id = p_domain;
  v_at := clock_timestamp();
  INSERT INTO retention.tier_policies (policy_id, scope, tenant_id, domain_id, version, budget_bytes_per_day, max_opens_per_evaluation, max_attempts, escalate_after, restore_hot_for, declared_by, declared_at, correlation_id)
  VALUES (p_policy_id, 'DOMAIN', p_tenant, p_domain, v_version, p_budget_bytes_per_day, p_max_opens_per_evaluation, p_max_attempts, p_escalate_after, p_restore_hot_for, p_actor, v_at, p_correlation);
  RETURN jsonb_build_object('policy_id', p_policy_id, 'tenant_id', p_tenant, 'domain_id', p_domain, 'version', v_version, 'declared', true,
                            'budget_bytes_per_day', p_budget_bytes_per_day, 'max_opens_per_evaluation', p_max_opens_per_evaluation, 'max_attempts', p_max_attempts,
                            'escalate_after', p_escalate_after::text, 'restore_hot_for', p_restore_hot_for::text,
                            'declared_by', p_actor, 'declared_at', v_at, 'correlation_id', p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION retention.declare_tier_policy(uuid,uuid,uuid,bigint,int,int,interval,interval,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION retention.declare_tier_policy(uuid,uuid,uuid,bigint,int,int,interval,interval,uuid,uuid) TO eye_commit;

-- THE ESCALATION: an approved or paused action is put before a person — paused for human review, its failure class kept
-- (infrastructure when it had none), its approvals revoked (the re-resolution re-approves), escalated_at set. Called by the execute
-- route when the attempts are exhausted (before the state moves) and by evaluate_tier for an action paused for retry too long.
CREATE OR REPLACE FUNCTION retention.escalate_action(p_action_id uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_correlation uuid)
RETURNS void
SECURITY DEFINER SET search_path = retention, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE a retention.actions_current%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['retention.action.execute', 'retention.schedule.evaluate']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'retention escalation rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO a FROM retention.actions_current x WHERE x.action_id = p_action_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'retention escalation rejected: % is not an action of this domain', p_action_id USING ERRCODE = '23503'; END IF;
  IF a.state NOT IN ('approved', 'paused') THEN RAISE EXCEPTION 'retention escalation rejected: % is % — an approved or a paused action escalates', p_action_id, a.state USING ERRCODE = '22023'; END IF;
  UPDATE retention.actions_current
     SET state = 'paused', disposition = 'human_review', failure_class = coalesce(failure_class, 'infrastructure'), failure_reason = p_reason, escalated_at = clock_timestamp()
   WHERE action_id = p_action_id;
  UPDATE retention.approvals SET revoked_at = clock_timestamp(), revoke_reason = 'escalated: ' || left(p_reason, 200) WHERE action_id = p_action_id AND revoked_at IS NULL;
  PERFORM retention.event(p_action_id, p_tenant, p_domain, 'action.escalated', p_actor, jsonb_build_object('reason', p_reason, 'attempts', a.attempts, 'approvals_revoked', true), p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION retention.escalate_action(uuid,uuid,uuid,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION retention.escalate_action(uuid,uuid,uuid,text,uuid,uuid) TO eye_commit;

-- ESCALATION BY AGE (D4): every action of the domain paused for RETRY, not yet escalated, whose latest action.paused event is older
-- than the policy's escalate_after is escalated. Called by the /schedules/evaluate route after evaluate_schedules, in the same
-- transaction; returns what it escalated, the deferred count of this evaluation (the sum over the active schedules) and the policy.
CREATE OR REPLACE FUNCTION retention.evaluate_tier(p_tenant uuid, p_domain uuid, p_actor uuid, p_correlation uuid)
RETURNS jsonb
SECURITY DEFINER SET search_path = retention, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE pol RECORD; c RECORD; v_escalated jsonb := '[]'::jsonb; v_reason text; v_deferred int;
BEGIN
  PERFORM observation.assert_authority(ARRAY['retention.schedule.evaluate']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT * INTO pol FROM retention.current_tier_policy(p_tenant, p_domain);
  FOR c IN SELECT a.action_id, a.kind, e.occurred_at AS paused_at
             FROM retention.actions_current a
             JOIN LATERAL (SELECT x.occurred_at FROM retention.action_events x WHERE x.action_id = a.action_id AND x.event = 'action.paused' ORDER BY x.occurred_at DESC LIMIT 1) e ON true
            WHERE a.tenant_id = p_tenant AND a.domain_id = p_domain AND a.state = 'paused' AND a.disposition = 'retry' AND a.escalated_at IS NULL
              AND e.occurred_at < clock_timestamp() - pol.escalate_after
            ORDER BY e.occurred_at, a.action_id LOOP
    v_reason := 'escalated by the cold-tier manager: paused for retry since ' || c.paused_at::text || ', longer than the policy''s escalate_after ' || pol.escalate_after::text;
    PERFORM retention.escalate_action(c.action_id, p_tenant, p_domain, v_reason, p_actor, p_correlation);
    v_escalated := v_escalated || jsonb_build_object('action_id', c.action_id, 'kind', c.kind, 'paused_at', c.paused_at, 'reason', v_reason);
  END LOOP;
  SELECT coalesce(sum((s.last_evaluation ->> 'deferred')::int), 0)::int INTO v_deferred FROM retention.schedules s WHERE s.tenant_id = p_tenant AND s.domain_id = p_domain AND s.state = 'active';
  RETURN jsonb_build_object('escalated', v_escalated, 'deferred', v_deferred,
    'policy', jsonb_build_object('declared', pol.declared, 'policy_id', pol.policy_id, 'version', pol.version, 'budget_bytes_per_day', pol.budget_bytes_per_day,
                                 'max_opens_per_evaluation', pol.max_opens_per_evaluation, 'max_attempts', pol.max_attempts,
                                 'escalate_after', pol.escalate_after::text, 'restore_hot_for', pol.restore_hot_for::text));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION retention.evaluate_tier(uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION retention.evaluate_tier(uuid,uuid,uuid,uuid) TO eye_commit;

-- THE OBSERVABLE STATE (L3-C08's last word; retention.read): the policy in force (or the defaults, declared false); the manifests
-- and bytes per tier over the domain's non-tombstoned evidence manifests; the moves of the last 24 hours (archived, restored); the
-- budget — per day, used in the window, remaining (null when unbounded), the instant the window frees; the actions by state;
-- the restored manifests awaiting their re-archive (hot, their latest tier record a restore); the schedules with their last
-- evaluation. The controller adds the vault's inventory of both roots beside it.
CREATE OR REPLACE FUNCTION retention.tier_state(p_tenant uuid, p_domain uuid)
RETURNS jsonb
SECURITY DEFINER SET search_path = retention, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE pol RECORD; v_tiers jsonb; v_awaiting int; v_moves jsonb; v_used bigint; v_resets timestamptz; v_actions jsonb; v_pending int; v_schedules jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['retention.read']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT * INTO pol FROM retention.current_tier_policy(p_tenant, p_domain);
  SELECT jsonb_build_object('hot', jsonb_build_object('manifests', count(*) FILTER (WHERE t.tier = 'hot'), 'bytes', coalesce(sum(m.byte_length) FILTER (WHERE t.tier = 'hot'), 0)::bigint),
                            'archive', jsonb_build_object('manifests', count(*) FILTER (WHERE t.tier = 'archive'), 'bytes', coalesce(sum(m.byte_length) FILTER (WHERE t.tier = 'archive'), 0)::bigint)),
         count(*) FILTER (WHERE t.tier = 'hot' AND EXISTS (SELECT 1 FROM observation.blob_tier_records r WHERE r.manifest_id = m.manifest_id))
    INTO v_tiers, v_awaiting
    FROM observation.blob_manifests m
    CROSS JOIN LATERAL (SELECT observation.manifest_tier(m.manifest_id) AS tier) t
   WHERE m.tenant_id = p_tenant AND m.domain_id = p_domain AND m.vault = 'evidence'
     AND NOT EXISTS (SELECT 1 FROM observation.blob_tombstones x WHERE x.manifest_id = m.manifest_id);
  SELECT jsonb_build_object('archived', jsonb_build_object('count', count(*) FILTER (WHERE r.tier = 'archive'), 'bytes', coalesce(sum(bm.byte_length) FILTER (WHERE r.tier = 'archive'), 0)::bigint),
                            'restored', jsonb_build_object('count', count(*) FILTER (WHERE r.tier = 'hot'), 'bytes', coalesce(sum(bm.byte_length) FILTER (WHERE r.tier = 'hot'), 0)::bigint)),
         coalesce(sum(bm.byte_length), 0)::bigint, min(r.moved_at) + interval '1 day'
    INTO v_moves, v_used, v_resets
    FROM observation.blob_tier_records r JOIN observation.blob_manifests bm ON bm.manifest_id = r.manifest_id
   WHERE r.tenant_id = p_tenant AND r.domain_id = p_domain AND r.moved_at > clock_timestamp() - interval '1 day';
  SELECT count(DISTINCT ri.action_id) INTO v_pending FROM retention.residual_inventory ri WHERE ri.tenant_id = p_tenant AND ri.domain_id = p_domain AND ri.kind = 'bytes_present' AND ri.status = 'pending';
  SELECT jsonb_build_object('executing', count(*) FILTER (WHERE a.state = 'executing'),
                            'paused_retry', count(*) FILTER (WHERE a.state = 'paused' AND a.disposition = 'retry'),
                            'paused_human_review', count(*) FILTER (WHERE a.state = 'paused' AND a.disposition = 'human_review'),
                            'escalated', count(*) FILTER (WHERE a.state = 'paused' AND a.escalated_at IS NOT NULL),
                            'pending_bytes_residuals', v_pending)
    INTO v_actions FROM retention.actions_current a WHERE a.tenant_id = p_tenant AND a.domain_id = p_domain;
  SELECT coalesce(jsonb_agg(jsonb_build_object('schedule_id', s.schedule_id, 'action_kind', s.action_kind, 'target_kind', s.target_kind, 'retention_profile', s.retention_profile, 'due_after', s.due_after::text,
                                               'state', s.state, 'last_evaluated_at', s.last_evaluated_at, 'last_evaluation', s.last_evaluation) ORDER BY s.declared_at, s.schedule_id), '[]'::jsonb)
    INTO v_schedules FROM retention.schedules s WHERE s.tenant_id = p_tenant AND s.domain_id = p_domain;
  RETURN jsonb_build_object(
    'policy', jsonb_build_object('declared', pol.declared, 'policy_id', pol.policy_id, 'version', pol.version, 'budget_bytes_per_day', pol.budget_bytes_per_day,
                                 'max_opens_per_evaluation', pol.max_opens_per_evaluation, 'max_attempts', pol.max_attempts,
                                 'escalate_after', pol.escalate_after::text, 'restore_hot_for', pol.restore_hot_for::text),
    'tiers', v_tiers,
    'moves_24h', v_moves,
    'budget', jsonb_build_object('bytes_per_day', pol.budget_bytes_per_day, 'used_24h', v_used,
                                 'remaining', CASE WHEN pol.budget_bytes_per_day IS NULL THEN NULL ELSE greatest(pol.budget_bytes_per_day - v_used, 0) END,
                                 'window_resets_at', v_resets),
    'actions', v_actions,
    'restored_awaiting_rearchive', v_awaiting,
    'schedules', v_schedules);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION retention.tier_state(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION retention.tier_state(uuid, uuid) TO eye_app, eye_commit;

-- THE PAUSE THAT COUNTS A FAILED ATTEMPT (C2). begin_execution's attempts + 1 is rolled back with the execution when it fails after
-- the state moved, and the pause is a separate write on a fresh transaction — so the attempt is counted where the failure is durably
-- recorded: the 8-argument form's UPDATE adds one when the caller says the state had moved (p_attempted); the 7-argument form of
-- 0070 §5 delegates with false (a refusal before the state moves — rights, scope, references, a budget, a lock not granted — counts
-- no attempt). Every other line as 0070 §5 left it; the event's details add attempted and the count.
CREATE OR REPLACE FUNCTION retention.pause_action(p_action_id uuid, p_tenant uuid, p_domain uuid, p_failure_class text, p_reason text, p_attempted boolean, p_actor uuid, p_correlation uuid)
RETURNS void
SECURITY DEFINER SET search_path = retention, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE a retention.actions_current%ROWTYPE; v_attempts int;
BEGIN
  PERFORM observation.assert_authority(ARRAY['retention.action.execute']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'retention execution rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF p_failure_class NOT IN ('legal_hold', 'unresolved_dependency', 'authority_disputed', 'infrastructure') THEN RAISE EXCEPTION 'retention execution rejected: the failure class is legal_hold, unresolved_dependency, authority_disputed or infrastructure' USING ERRCODE = '22023'; END IF;
  SELECT * INTO a FROM retention.actions_current x WHERE x.action_id = p_action_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'retention execution rejected: % is not an action of this domain', p_action_id USING ERRCODE = '23503'; END IF;
  IF a.state <> 'approved' THEN RAISE EXCEPTION 'retention execution rejected: % is % — only an approved action pauses at execution', p_action_id, a.state USING ERRCODE = '22023'; END IF;
  UPDATE retention.actions_current SET state = 'paused', failure_class = p_failure_class, disposition = CASE WHEN p_failure_class = 'infrastructure' THEN 'retry' ELSE 'human_review' END, failure_reason = p_reason,
                                       attempts = attempts + CASE WHEN coalesce(p_attempted, false) THEN 1 ELSE 0 END
   WHERE action_id = p_action_id RETURNING attempts INTO v_attempts;
  UPDATE retention.approvals SET revoked_at = clock_timestamp(), revoke_reason = 'the execution was rolled back: ' || left(p_reason, 200) WHERE action_id = p_action_id AND revoked_at IS NULL;
  PERFORM retention.event(p_action_id, p_tenant, p_domain, 'action.paused', p_actor, jsonb_build_object('reason', p_reason, 'failure_class', p_failure_class, 'approvals_revoked', true, 'attempted', coalesce(p_attempted, false), 'attempts', v_attempts), p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION retention.pause_action(uuid,uuid,uuid,text,text,boolean,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION retention.pause_action(uuid,uuid,uuid,text,text,boolean,uuid,uuid) TO eye_commit;
CREATE OR REPLACE FUNCTION retention.pause_action(p_action_id uuid, p_tenant uuid, p_domain uuid, p_failure_class text, p_reason text, p_actor uuid, p_correlation uuid)
RETURNS void
SECURITY DEFINER SET search_path = retention, observation, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM retention.pause_action(p_action_id, p_tenant, p_domain, p_failure_class, p_reason, false, p_actor, p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION retention.pause_action(uuid,uuid,uuid,text,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION retention.pause_action(uuid,uuid,uuid,text,text,uuid,uuid) TO eye_commit;

-- ============================================================
-- §2 the restore port
-- ============================================================
-- THE RESTORE PORT: records the move back to the hot tier — 0071 §2's archive_blob mirrored, every check kept: only while an executing
-- RESTORE action of this domain names the manifest as an executable item, only for a non-tombstoned evidence manifest, only under the
-- manifest's own digest (the executor verified it on the copy it staged in the hot root before calling), only under the manifest's lock
-- (begin_execution took it for this transaction; fail closed otherwise). A hold is NOT a refusal here: a restore preserves. Idempotent
-- under the lock: a manifest already in the hot tier returns false (the finder of an overlap records nothing and removes nothing of
-- another's).
CREATE OR REPLACE FUNCTION observation.restore_blob(
  p_record_id uuid, p_tenant uuid, p_domain uuid, p_manifest_id uuid, p_action_id uuid, p_content_digest text, p_actor uuid, p_correlation uuid
) RETURNS boolean
SECURITY DEFINER SET search_path = observation, objects, retention, ctx, public, pg_catalog, pg_temp AS $$
DECLARE m observation.blob_manifests%ROWTYPE; v_evd uuid; v_obs uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['retention.action.execute']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'restore rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO m FROM observation.blob_manifests x WHERE x.manifest_id = p_manifest_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.vault = 'evidence';
  IF NOT FOUND THEN RAISE EXCEPTION 'restore rejected: no such evidence manifest in this domain' USING ERRCODE = '23503'; END IF;
  IF EXISTS (SELECT 1 FROM observation.blob_tombstones t WHERE t.manifest_id = p_manifest_id) THEN
    RAISE EXCEPTION 'restore refused: manifest % is tombstoned; there are no bytes to move', p_manifest_id USING ERRCODE = '22023';
  END IF;
  IF p_content_digest IS DISTINCT FROM m.content_digest THEN
    RAISE EXCEPTION 'restore refused: the digest verified on the hot copy (%) is not the manifest''s (%)', coalesce(p_content_digest, '<none>'), m.content_digest USING ERRCODE = 'P0R02';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM retention.actions_current a JOIN retention.scope_items i ON i.action_id = a.action_id
                  WHERE a.action_id = p_action_id AND a.tenant_id = p_tenant AND a.domain_id = p_domain AND a.state = 'executing' AND a.kind = 'restore'
                    AND i.item_kind = 'manifest' AND i.ref = p_manifest_id::text AND i.disposition = 'execute') THEN
    RAISE EXCEPTION 'restore refused: no executing restore action names manifest % as an executable item', p_manifest_id USING ERRCODE = '42501';
  END IF;
  -- B11-F1 (0071 §2), kept for the return path: the move is recorded only under the manifest's lock, which begin_execution took for this transaction — fail closed otherwise.
  IF NOT retention.holds_manifest_lock(p_tenant, p_domain, p_manifest_id) THEN
    RAISE EXCEPTION 'restore refused: manifest % is not locked by this execution (begin_execution takes the manifest''s lock; a move is recorded only under it)', p_manifest_id USING ERRCODE = '55P03';
  END IF;
  IF observation.manifest_tier(p_manifest_id) = 'hot' THEN RETURN false; END IF;
  INSERT INTO observation.blob_tier_records (record_id, scope, tenant_id, domain_id, manifest_id, from_tier, tier, action_id, content_digest, moved_by, correlation_id)
  VALUES (p_record_id, 'DOMAIN', p_tenant, p_domain, p_manifest_id, 'archive', 'hot', p_action_id, m.content_digest, p_actor, p_correlation);
  SELECT o.object_id, (o.payload ->> 'obs_object_id')::uuid INTO v_evd, v_obs FROM objects.canonical_objects o
   WHERE o.tenant_id = p_tenant AND o.domain_id = p_domain AND o.object_type = 'EVD' AND (o.payload ->> 'manifest_id')::uuid = p_manifest_id ORDER BY o.object_version DESC LIMIT 1;
  INSERT INTO observation.custody_events (event_id, scope, tenant_id, domain_id, manifest_id, obs_object_id, evd_object_id, source_id, contract_version, run_id, event, actor, content_digest, digest_verified, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_manifest_id, v_obs, v_evd, m.source_id, m.contract_version, m.run_id, 'custody.restored', 'principal:' || p_actor::text, m.content_digest, true,
          jsonb_build_object('action_id', p_action_id, 'from_tier', 'archive', 'to_tier', 'hot', 'tier_record_id', p_record_id, 'locator', m.locator), p_correlation);
  RETURN true;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION observation.restore_blob(uuid,uuid,uuid,uuid,uuid,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.restore_blob(uuid,uuid,uuid,uuid,uuid,text,uuid,uuid) TO eye_commit;

-- ============================================================
-- §3 open_action re-declared: the restore admitted (C1)
-- ============================================================
-- 0070 §3's body with both guards widened: a restore is an evidence action, and a chosen object set (manifest_ids) is its selector as it
-- is an archive's and a customer export's. Every other line as 0070 left it.
CREATE OR REPLACE FUNCTION retention.open_action(p_action_id uuid, p_tenant uuid, p_domain uuid, p_kind text, p_target_kind text, p_selector jsonb, p_retention_profile text, p_schedule_id uuid, p_actor uuid, p_correlation uuid)
RETURNS void
SECURITY DEFINER SET search_path = retention, observation, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_authority(ARRAY['retention.action.open', 'retention.schedule.evaluate']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_selector IS NULL OR jsonb_typeof(p_selector) <> 'object' THEN RAISE EXCEPTION 'retention action rejected: the selector is an object' USING ERRCODE = '22023'; END IF;
  IF p_target_kind = 'log_partition' AND p_kind <> 'log_floor' THEN RAISE EXCEPTION 'retention action rejected: the log partition takes the log_floor action' USING ERRCODE = '22023'; END IF;
  IF p_target_kind = 'evidence' AND p_kind NOT IN ('review', 'deletion', 'archive', 'customer_export', 'restore') THEN RAISE EXCEPTION 'retention action rejected: % is not an evidence action', p_kind USING ERRCODE = '22023'; END IF;
  IF p_target_kind = 'log_partition' AND (p_selector ->> 'partition_key') IS DISTINCT FROM ('tenant:' || p_tenant::text) THEN
    RAISE EXCEPTION 'retention action rejected: the log partition of this tenant is tenant:%', p_tenant USING ERRCODE = '22023';
  END IF;
  IF p_target_kind = 'evidence' THEN
    IF (p_selector ? 'manifest_ids') AND p_kind NOT IN ('archive', 'customer_export', 'restore') THEN RAISE EXCEPTION 'retention action rejected: a chosen object set (manifest_ids) is an archive''s or a customer export''s selector, or a restore''s' USING ERRCODE = '22023'; END IF;
    IF (p_selector ? 'manifest_ids') AND (jsonb_typeof(p_selector -> 'manifest_ids') <> 'array' OR jsonb_array_length(p_selector -> 'manifest_ids') NOT BETWEEN 1 AND 200) THEN RAISE EXCEPTION 'retention action rejected: manifest_ids is an array of 1 to 200 ids' USING ERRCODE = '22023'; END IF;
    IF (p_selector ->> 'manifest_id') IS NULL AND (p_selector ->> 'source_id') IS NULL AND NOT (p_selector ? 'manifest_ids') THEN RAISE EXCEPTION 'retention action rejected: an evidence selector names a manifest_id, a source_id or manifest_ids' USING ERRCODE = '22023'; END IF;
    IF p_kind = 'customer_export' THEN
      IF coalesce(p_selector ->> 'classification_ceiling', '') NOT IN ('public', 'internal', 'confidential', 'restricted') THEN RAISE EXCEPTION 'retention action rejected: a customer export names its classification ceiling (public, internal, confidential, restricted)' USING ERRCODE = '22023'; END IF;
      IF coalesce(p_selector ->> 'destination', 'export') <> 'export' THEN RAISE EXCEPTION 'retention action rejected: the export destination is the export namespace of the vault (destination export)' USING ERRCODE = '22023'; END IF;
    END IF;
  END IF;
  INSERT INTO retention.actions_current (action_id, scope, tenant_id, domain_id, kind, target_kind, selector, schedule_id, retention_profile, opened_by, correlation_id)
  VALUES (p_action_id, 'DOMAIN', p_tenant, p_domain, p_kind, p_target_kind, CASE WHEN p_kind = 'customer_export' THEN p_selector || jsonb_build_object('destination', 'export') ELSE p_selector END, p_schedule_id, p_retention_profile, p_actor, p_correlation);
  PERFORM retention.event(p_action_id, p_tenant, p_domain, 'action.opened', p_actor, jsonb_build_object('kind', p_kind, 'target_kind', p_target_kind, 'selector', p_selector, 'schedule_id', p_schedule_id), p_correlation);
END $$ LANGUAGE plpgsql;

-- ============================================================
-- §4 resolve_scope re-declared: the restore branch; a re-resolution of an escalated action restarts the retry budget
-- ============================================================
-- 0070 §4's body with: the restore among the PRESERVATION kinds; a restore branch after the archive's (a manifest in the HOT tier is
-- excluded — a restore moves archived bytes only; a legal hold is recorded on the item and honoured by keeping); the paused reason
-- 'nothing to restore'; and, at the top, the reset of an ESCALATED action's attempts and escalated_at (a human review restarts the
-- retry budget — D4), said in the resolution event's details and the returned summary as attempts_reset (C8). Every other line as
-- 0070 left it (the deletion, export and log-partition branches, the digest, the summary).
CREATE OR REPLACE FUNCTION retention.resolve_scope(p_action_id uuid, p_tenant uuid, p_domain uuid, p_actor uuid, p_correlation uuid)
RETURNS jsonb
SECURITY DEFINER SET search_path = retention, observation, objects, graph, intelligence, executive, decision, ctx, public, pg_catalog, pg_temp AS $$
DECLARE a retention.actions_current%ROWTYPE; m RECORD; v_hold uuid; v_items int := 0; v_held int := 0; v_blocking int := 0; v_execute int := 0; v_excluded int := 0; v_digest text; v_state text;
        v_partition text; v_to bigint; v_floor bigint; v_next bigint; v_ord int := 0; r RECORD; v_summary jsonb;
        v_preserving boolean; v_ceiling text; v_rights text; v_tier text; v_versions bigint[]; v_dependents jsonb; v_names text := ''; v_base jsonb;
        v_class text; v_resolved text[] := ARRAY[]::text[]; v_unresolved text; v_reset boolean := false;
BEGIN
  PERFORM observation.assert_authority(ARRAY['retention.action.resolve']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT * INTO a FROM retention.actions_current x WHERE x.action_id = p_action_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'retention action rejected: % is not open in this domain', p_action_id USING ERRCODE = '23503'; END IF;
  IF a.state NOT IN ('opened', 'scope_resolved', 'held', 'paused') THEN RAISE EXCEPTION 'retention action rejected: % is %, its scope is not resolved again', p_action_id, a.state USING ERRCODE = '22023'; END IF;
  -- B12 (D4 "retries"): a person's re-resolution of an ESCALATED action restarts the retry budget — the count and the escalation instant
  -- reset here, before the scope is resolved again; the final UPDATE below leaves both alone, so the reset persists whatever state results.
  IF a.escalated_at IS NOT NULL THEN
    UPDATE retention.actions_current SET attempts = 0, escalated_at = NULL WHERE action_id = p_action_id;
    v_reset := true;
  END IF;
  DELETE FROM retention.scope_items WHERE action_id = p_action_id;
  DELETE FROM retention.residual_inventory WHERE action_id = p_action_id;
  IF a.target_kind = 'evidence' THEN
    -- A review, an archive, a customer export and a restore are scoped by PRESERVATION (0068 §6): every manifest the selector names, whatever
    -- its evidence state. A deletion is scoped by retirement: the source selector covers corrected, superseded or withdrawn evidence only.
    v_preserving := a.kind IN ('review', 'archive', 'customer_export', 'restore');
    IF a.kind = 'customer_export' THEN
      v_ceiling := a.selector ->> 'classification_ceiling';
      IF v_ceiling IS NULL OR v_ceiling NOT IN ('public', 'internal', 'confidential', 'restricted') THEN RAISE EXCEPTION 'retention action rejected: a customer export names its classification ceiling (public, internal, confidential, restricted)' USING ERRCODE = '22023'; END IF;
      IF coalesce(a.selector ->> 'destination', 'export') <> 'export' THEN RAISE EXCEPTION 'retention action rejected: the export destination is the export namespace of the vault (destination export)' USING ERRCODE = '22023'; END IF;
    END IF;
    FOR m IN
      SELECT DISTINCT bm.manifest_id, bm.locator, bm.source_id, bm.contract_version, bm.created_at, bm.legal_hold, bm.byte_length, bm.content_digest, bm.classification,
             lv.object_id AS evd_object_id, lv.object_version AS evd_version, lv.lifecycle_state AS evd_state, lv.classification AS record_classification,
             ov.lifecycle_state AS object_state, ov.object_version AS object_version
        FROM observation.blob_manifests bm
        -- the latest EVD version NAMING the manifest (the record an export carries; the version set V(M) starts from its object) …
        LEFT JOIN LATERAL (SELECT o.object_id, o.object_version, o.lifecycle_state, o.classification FROM objects.canonical_objects o
                            WHERE o.tenant_id = p_tenant AND o.domain_id = p_domain AND o.object_type = 'EVD' AND (o.payload ->> 'manifest_id')::uuid = bm.manifest_id
                            ORDER BY o.object_version DESC LIMIT 1) lv ON true
        -- … and the OBJECT's latest version, which decides whether the evidence is current (a revision keeps the earlier version admitted under its own manifest).
        LEFT JOIN LATERAL (SELECT o.object_version, o.lifecycle_state FROM objects.canonical_objects o WHERE o.object_id = lv.object_id ORDER BY o.object_version DESC LIMIT 1) ov ON true
       WHERE bm.tenant_id = p_tenant AND bm.domain_id = p_domain AND bm.vault = 'evidence'
         AND NOT EXISTS (SELECT 1 FROM observation.blob_tombstones t WHERE t.manifest_id = bm.manifest_id)
         AND ((a.selector ->> 'manifest_id') IS NOT NULL AND bm.manifest_id = (a.selector ->> 'manifest_id')::uuid
              OR (a.selector ->> 'manifest_id') IS NULL AND jsonb_typeof(a.selector -> 'manifest_ids') = 'array'
                  AND bm.manifest_id::text IN (SELECT lower(btrim(x)) FROM jsonb_array_elements_text(a.selector -> 'manifest_ids') x)
              OR (a.selector ->> 'manifest_id') IS NULL AND jsonb_typeof(a.selector -> 'manifest_ids') IS DISTINCT FROM 'array'
                  AND (a.selector ->> 'source_id') IS NOT NULL AND bm.source_id = (a.selector ->> 'source_id')::uuid
                  AND (v_preserving OR ov.lifecycle_state IN ('corrected', 'superseded', 'withdrawn')))
       ORDER BY bm.created_at, bm.manifest_id
    LOOP
      v_ord := v_ord + 1; v_items := v_items + 1; v_resolved := v_resolved || m.manifest_id::text;
      SELECT h.hold_id INTO v_hold FROM observation.legal_holds h WHERE (h.manifest_id = m.manifest_id OR (m.evd_object_id IS NOT NULL AND h.evd_object_id = m.evd_object_id)) AND h.lifted_at IS NULL ORDER BY h.placed_at LIMIT 1;
      v_tier := observation.manifest_tier(m.manifest_id);
      v_base := jsonb_build_object('locator', m.locator, 'evd_object_id', m.evd_object_id, 'evd_version', m.evd_version, 'byte_length', m.byte_length, 'content_digest', m.content_digest,
                                   'evd_state', m.evd_state, 'object_version', m.object_version, 'object_state', m.object_state, 'legal_hold', m.legal_hold OR v_hold IS NOT NULL, 'tier', v_tier,
                                   'classification', m.classification, 'record_classification', m.record_classification);
      IF a.kind = 'review' THEN
        v_execute := v_execute + 1;
        INSERT INTO retention.scope_items (item_id, scope, tenant_id, domain_id, action_id, item_kind, ref, dependency_order, disposition, hold_id, reason, details)
        VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_action_id, 'manifest', m.manifest_id::text, v_ord, 'execute', v_hold,
                'reviewed in place: the record and its bytes are kept (its evidence is ' || coalesce(m.evd_state, 'unknown') || ')' || CASE WHEN m.legal_hold OR v_hold IS NOT NULL THEN '; under a legal hold, which the review honours by keeping it' ELSE '' END, v_base);
      ELSIF a.kind = 'archive' THEN
        IF v_tier = 'archive' THEN
          v_excluded := v_excluded + 1;
          INSERT INTO retention.scope_items (item_id, scope, tenant_id, domain_id, action_id, item_kind, ref, dependency_order, disposition, hold_id, reason, details)
          VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_action_id, 'manifest', m.manifest_id::text, v_ord, 'excluded', v_hold, 'already in the archive tier; an archive moves hot bytes only', v_base);
        ELSE
          v_execute := v_execute + 1;
          INSERT INTO retention.scope_items (item_id, scope, tenant_id, domain_id, action_id, item_kind, ref, dependency_order, disposition, hold_id, reason, details)
          VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_action_id, 'manifest', m.manifest_id::text, v_ord, 'execute', v_hold,
                  'archived: the manifest and its digest are kept, the bytes move from the hot tier to the archive tier (its evidence is ' || coalesce(m.evd_state, 'unknown') || ')' || CASE WHEN m.legal_hold OR v_hold IS NOT NULL THEN '; under a legal hold, which the archive honours by preserving it' ELSE '' END, v_base);
        END IF;
      ELSIF a.kind = 'restore' THEN
        -- B12 (D5): a restore PRESERVES — a manifest in the hot tier has nothing to move back; one in the archive tier moves back, its hold kept.
        IF v_tier = 'hot' THEN
          v_excluded := v_excluded + 1;
          INSERT INTO retention.scope_items (item_id, scope, tenant_id, domain_id, action_id, item_kind, ref, dependency_order, disposition, hold_id, reason, details)
          VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_action_id, 'manifest', m.manifest_id::text, v_ord, 'excluded', v_hold, 'already in the hot tier; a restore moves archived bytes only', v_base);
        ELSE
          v_execute := v_execute + 1;
          INSERT INTO retention.scope_items (item_id, scope, tenant_id, domain_id, action_id, item_kind, ref, dependency_order, disposition, hold_id, reason, details)
          VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_action_id, 'manifest', m.manifest_id::text, v_ord, 'execute', v_hold,
                  'restored: the manifest and its digest are kept, the bytes move from the archive tier back to the hot tier (its evidence is ' || coalesce(m.evd_state, 'unknown') || ')' || CASE WHEN m.legal_hold OR v_hold IS NOT NULL THEN '; under a legal hold, which the restore honours by preserving it' ELSE '' END, v_base);
        END IF;
      ELSIF a.kind = 'customer_export' THEN
        SELECT s.rights_state INTO v_rights FROM observation.source_contracts_current s WHERE s.source_id = m.source_id AND s.contract_version = m.contract_version;
        -- The REDACTION gate reads the stricter of the manifest's classification (the contract ceiling copied at admission) and the exported
        -- record's (the latest EVD version naming the manifest may have been re-versioned under a higher classification).
        v_class := CASE WHEN decision.classification_rank(coalesce(m.record_classification, m.classification)) > decision.classification_rank(m.classification) THEN m.record_classification ELSE m.classification END;
        IF decision.classification_rank(v_class) > decision.classification_rank(v_ceiling) THEN
          v_excluded := v_excluded + 1;
          INSERT INTO retention.scope_items (item_id, scope, tenant_id, domain_id, action_id, item_kind, ref, dependency_order, disposition, hold_id, reason, details)
          VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_action_id, 'manifest', m.manifest_id::text, v_ord, 'excluded', v_hold,
                  'redaction gate: classification ' || v_class || CASE WHEN v_class IS DISTINCT FROM m.classification THEN ' (the exported record''s version ' || m.evd_version || '; the manifest''s is ' || m.classification || ')' ELSE '' END || ' is above the export ceiling ' || v_ceiling,
                  v_base || jsonb_build_object('gate', 'redaction', 'gated_on', CASE WHEN v_class IS DISTINCT FROM m.classification THEN 'record' ELSE 'manifest' END));
        ELSIF v_rights IS DISTINCT FROM 'confirmed' THEN
          v_excluded := v_excluded + 1;
          INSERT INTO retention.scope_items (item_id, scope, tenant_id, domain_id, action_id, item_kind, ref, dependency_order, disposition, hold_id, reason, details)
          VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_action_id, 'manifest', m.manifest_id::text, v_ord, 'excluded', v_hold,
                  'data-rights gate: the rights of source contract ' || m.source_id::text || '@' || m.contract_version || ' are ' || coalesce(v_rights, 'unknown') || '; confirmed rights permit reuse', v_base || jsonb_build_object('gate', 'data_rights', 'rights_state', v_rights));
        ELSE
          v_execute := v_execute + 1;
          INSERT INTO retention.scope_items (item_id, scope, tenant_id, domain_id, action_id, item_kind, ref, dependency_order, disposition, hold_id, reason, details)
          VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_action_id, 'manifest', m.manifest_id::text, v_ord, 'execute', v_hold,
                  'packaged: the canonical record and the bytes are copied into the export package; the source is untouched' || CASE WHEN m.legal_hold OR v_hold IS NOT NULL THEN '; under a legal hold, which an export leaves in place' ELSE '' END, v_base || jsonb_build_object('rights_state', v_rights));
        END IF;
      ELSIF m.object_state IS NULL OR m.object_state NOT IN ('corrected', 'superseded', 'withdrawn') THEN
        -- Currency is the evidence OBJECT's: its latest version admitted means the object is current, whatever version names this manifest.
        v_excluded := v_excluded + 1;
        INSERT INTO retention.scope_items (item_id, scope, tenant_id, domain_id, action_id, item_kind, ref, dependency_order, disposition, reason, details)
        VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_action_id, 'manifest', m.manifest_id::text, v_ord, 'excluded',
                'the evidence object resting on these bytes is current (its latest version ' || coalesce(m.object_version::text, '?') || ' is ' || coalesce(m.object_state, 'unknown') || '); a deletion retires corrected, superseded or withdrawn evidence only — correct or withdraw it first', v_base);
      ELSIF m.legal_hold OR v_hold IS NOT NULL THEN
        v_held := v_held + 1;
        INSERT INTO retention.scope_items (item_id, scope, tenant_id, domain_id, action_id, item_kind, ref, dependency_order, disposition, hold_id, reason, details)
        VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_action_id, 'manifest', m.manifest_id::text, v_ord, 'held', v_hold, 'a legal hold takes precedence over deletion (AU-MEM-0060)', v_base);
      ELSE
        -- SAFE SCOPE (V03-T-100; AU-MEM-0061): the bytes of this manifest are retired only when no live reference rests on the evidence versions that name it.
        -- V(M) = the versions of the manifest's evidence object whose payload names it (one manifest lineage per object — D9), by the object's primary key.
        SELECT coalesce(array_agg(o.object_version ORDER BY o.object_version), ARRAY[]::bigint[]) INTO v_versions FROM objects.canonical_objects o
         WHERE o.object_id = m.evd_object_id AND o.object_type = 'EVD' AND (o.payload ->> 'manifest_id')::uuid = m.manifest_id;
        v_dependents := CASE WHEN m.evd_object_id IS NULL THEN '[]'::jsonb ELSE retention.load_bearing_references(p_tenant, p_domain, m.evd_object_id, v_versions, m.content_digest) END;
        IF jsonb_array_length(v_dependents) > 0 THEN
          v_blocking := v_blocking + 1;
          INSERT INTO retention.scope_items (item_id, scope, tenant_id, domain_id, action_id, item_kind, ref, dependency_order, disposition, reason, details)
          VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_action_id, 'manifest', m.manifest_id::text, v_ord, 'blocking',
                  'the referential scope cannot be proven safe: ' || jsonb_array_length(v_dependents) || ' live reference(s) rest on this evidence version (details.dependents); retire, decide, supersede or close them, then resolve again',
                  v_base || jsonb_build_object('versions', to_jsonb(v_versions), 'dependents', v_dependents));
          v_names := v_names || CASE WHEN v_names = '' THEN '' ELSE '; ' END || 'manifest ' || m.manifest_id::text || ' ← ' ||
                     (SELECT string_agg((d ->> 'kind') || ':' || (d ->> 'ref'), ', ') FROM jsonb_array_elements(v_dependents) d);
        ELSE
          v_execute := v_execute + 1;
          INSERT INTO retention.scope_items (item_id, scope, tenant_id, domain_id, action_id, item_kind, ref, dependency_order, disposition, reason, details)
          VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_action_id, 'manifest', m.manifest_id::text, v_ord, 'execute', 'superseded evidence bytes past their retention; no live reference rests on this version', v_base || jsonb_build_object('versions', to_jsonb(v_versions)));
        END IF;
      END IF;
      -- Residuals that policy retains whatever the deletion does — UNCHANGED for the non-blocking references (a blocking item keeps its inventory too: it says what stays when the deletion eventually runs).
      IF m.evd_object_id IS NOT NULL AND a.kind = 'deletion' THEN
        INSERT INTO retention.residual_inventory (residual_id, scope, tenant_id, domain_id, action_id, kind, ref, count, status, note)
        SELECT gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_action_id, 'claim_lineage', m.evd_object_id::text, count(*)::int, 'retained_by_policy', 'the claims extracted from this evidence keep their lineage rows (accountability); the bytes are gone, the record of their reading stays'
          FROM intelligence.claim_lineage l WHERE l.evidence_object_id = m.evd_object_id HAVING count(*) > 0;
        INSERT INTO retention.residual_inventory (residual_id, scope, tenant_id, domain_id, action_id, kind, ref, count, status, note)
        SELECT gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_action_id, 'dependency', m.evd_object_id::text, count(*)::int, 'retained_by_policy', 'objects resting on this evidence keep their dependency rows (the impact set remains addressable)'
          FROM graph.dependencies d WHERE d.depends_on_kind = 'evidence' AND d.depends_on_id = m.evd_object_id AND d.state = 'active' HAVING count(*) > 0;
        INSERT INTO retention.residual_inventory (residual_id, scope, tenant_id, domain_id, action_id, kind, ref, count, status, note)
        SELECT gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_action_id, 'canonical_version', m.evd_object_id::text, count(*)::int, 'retained_by_policy', 'the evidence object''s canonical versions (header, digest, custody) stay: a tombstone, never an erasure of the record'
          FROM objects.canonical_objects o WHERE o.object_id = m.evd_object_id HAVING count(*) > 0;
      END IF;
    END LOOP;
    -- A CHOSEN OBJECT SET (an archive's or an export's manifest_ids): every id the selector names that resolved to no row above — unknown,
    -- tombstoned, or a manifest of another domain (not disclosed which) — is an EXCLUDED item with that reason, counted, in the digest and in
    -- the package's excluded list; nothing requested vanishes from the record.
    IF (a.selector ->> 'manifest_id') IS NULL AND jsonb_typeof(a.selector -> 'manifest_ids') = 'array' THEN
      FOR v_unresolved IN SELECT DISTINCT lower(btrim(x)) FROM jsonb_array_elements_text(a.selector -> 'manifest_ids') x WHERE lower(btrim(x)) <> ALL (v_resolved) ORDER BY 1 LOOP
        v_ord := v_ord + 1; v_items := v_items + 1; v_excluded := v_excluded + 1;
        INSERT INTO retention.scope_items (item_id, scope, tenant_id, domain_id, action_id, item_kind, ref, dependency_order, disposition, reason, details)
        VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_action_id, 'manifest', v_unresolved, v_ord, 'excluded',
                'resolution gate: the id names no non-tombstoned evidence manifest of this domain (unknown, tombstoned, or outside this domain)',
                jsonb_build_object('gate', 'resolution', 'requested_as', v_unresolved));
      END LOOP;
    END IF;
    v_state := CASE WHEN v_items = 0 THEN 'paused' WHEN v_blocking > 0 THEN 'paused' WHEN v_execute = 0 AND v_held > 0 THEN 'held' WHEN v_execute = 0 THEN 'paused' ELSE 'scope_resolved' END;
  ELSE
    v_partition := a.selector ->> 'partition_key'; v_to := (a.selector ->> 'to_seq')::bigint;
    SELECT p.retained_from_seq, p.next_seq INTO v_floor, v_next FROM objects.outbox_partitions p WHERE p.partition_key = v_partition;
    IF v_floor IS NULL THEN RAISE EXCEPTION 'retention action rejected: partition % has no row', v_partition USING ERRCODE = '23503'; END IF;
    IF v_to IS NULL OR v_to <= v_floor OR v_to > v_next THEN RAISE EXCEPTION 'retention action rejected: to_seq % must lie above the floor % and at most the next sequence %', v_to, v_floor, v_next USING ERRCODE = '22023'; END IF;
    v_ord := 1; v_items := 1;
    -- The range itself: published rows below the new floor by status.
    SELECT count(*) FILTER (WHERE status = 'published') AS published, count(*) FILTER (WHERE status IN ('pending', 'failed')) AS unpublished, count(*) FILTER (WHERE status = 'dead_letter') AS dead INTO r
      FROM objects.object_outbox o WHERE o.partition_key = v_partition AND o.partition_seq >= v_floor AND o.partition_seq < v_to;
    INSERT INTO retention.scope_items (item_id, scope, tenant_id, domain_id, action_id, item_kind, ref, dependency_order, disposition, reason, details)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_action_id, 'outbox_range', v_partition || ':' || v_floor || '-' || (v_to - 1), 1, 'execute', 'the retained floor moves to this sequence; replay below it is no longer guaranteed', jsonb_build_object('from_seq', v_floor, 'to_seq', v_to, 'published', r.published, 'unpublished', r.unpublished, 'dead_letter', r.dead));
    v_execute := 1;
    -- Blocks (DP-54-005, "pause unsafe deletion"): unpublished history below the floor; a subscription served from, or checkpointed, below it.
    IF r.unpublished + r.dead > 0 THEN
      v_ord := v_ord + 1; v_items := v_items + 1; v_blocking := v_blocking + 1;
      INSERT INTO retention.scope_items (item_id, scope, tenant_id, domain_id, action_id, item_kind, ref, dependency_order, disposition, reason, details)
      VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_action_id, 'unpublished_row', v_partition, v_ord, 'blocking', 'rows below the new floor are not yet published (or dead-lettered): history the log has not delivered is not retired', jsonb_build_object('unpublished', r.unpublished, 'dead_letter', r.dead));
    END IF;
    FOR m IN SELECT s.subscription_id, s.consumer_kind, s.served_from_seq, s.checkpoint_seq FROM graph.subscriptions s
              WHERE s.tenant_id = p_tenant AND s.status <> 'revoked' AND (s.served_from_seq < v_to OR (s.checkpoint_seq IS NOT NULL AND s.checkpoint_seq < v_to - 1))
              ORDER BY s.consumer_kind LOOP
      v_ord := v_ord + 1; v_items := v_items + 1; v_blocking := v_blocking + 1;
      INSERT INTO retention.scope_items (item_id, scope, tenant_id, domain_id, action_id, item_kind, ref, dependency_order, disposition, reason, details)
      VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_action_id, 'subscription_cursor', m.subscription_id::text, v_ord, 'blocking', 'a subscription is served from, or checkpointed, below the new floor: moving it would cut history the subscription is owed (replay it to the floor first, or let it catch up)', jsonb_build_object('consumer_kind', m.consumer_kind, 'served_from_seq', m.served_from_seq, 'checkpoint_seq', m.checkpoint_seq));
    END LOOP;
    -- Residuals by policy: the delivery and attempt ledgers keep the event ids they reference below the floor.
    INSERT INTO retention.residual_inventory (residual_id, scope, tenant_id, domain_id, action_id, kind, ref, count, status, note)
    SELECT gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_action_id, 'delivery_ledger', v_partition, count(*)::int, 'retained_by_policy', 'delivery ledger rows keep the ids of events below the floor (accountability; no foreign key to the log)'
      FROM graph.subscription_deliveries d JOIN objects.object_outbox o ON o.id = d.event_id WHERE o.partition_key = v_partition AND o.partition_seq < v_to HAVING count(*) > 0;
    INSERT INTO retention.residual_inventory (residual_id, scope, tenant_id, domain_id, action_id, kind, ref, count, status, note)
    SELECT gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_action_id, 'propagation_ledger', v_partition, count(*)::int, 'retained_by_policy', 'propagation attempt rows keep the ids of events below the floor'
      FROM graph.propagation_attempts d JOIN objects.object_outbox o ON o.id = d.event_id WHERE o.partition_key = v_partition AND o.partition_seq < v_to HAVING count(*) > 0;
    v_state := CASE WHEN v_blocking > 0 THEN 'paused' ELSE 'scope_resolved' END;
  END IF;
  -- The digest the approval signs: the ordered items with their dispositions (blocking enters it through the disposition, so a route that releases an item changes the digest).
  SELECT encode(sha256(convert_to(coalesce(string_agg(i.item_kind || '|' || i.ref || '|' || i.disposition || '|' || coalesce(i.hold_id::text, ''), E'\n' ORDER BY i.dependency_order, i.ref), ''), 'UTF8')), 'hex') INTO v_digest
    FROM retention.scope_items i WHERE i.action_id = p_action_id;
  v_summary := jsonb_build_object('items', v_items, 'execute', v_execute, 'held', v_held, 'blocking', v_blocking, 'excluded', v_excluded,
                                  'residuals', (SELECT coalesce(jsonb_agg(jsonb_build_object('kind', ri.kind, 'count', ri.count, 'status', ri.status)), '[]'::jsonb) FROM retention.residual_inventory ri WHERE ri.action_id = p_action_id));
  -- C8: the reset is said in whichever resolution event fires (scope.resolved, action.held, action.paused) and in the returned summary.
  IF v_reset THEN v_summary := v_summary || jsonb_build_object('attempts_reset', true); END IF;
  UPDATE retention.actions_current
     SET state = v_state, scope_digest = v_digest, scope_summary = v_summary, resolved_at = clock_timestamp(),
         failure_class = CASE v_state WHEN 'held' THEN 'legal_hold' WHEN 'paused' THEN 'unresolved_dependency' ELSE NULL END,
         disposition = CASE v_state WHEN 'held' THEN 'challenge' WHEN 'paused' THEN 'human_review' ELSE NULL END,
         failure_reason = CASE v_state WHEN 'held' THEN 'every item in scope is under a legal hold'
                                       WHEN 'paused' THEN CASE WHEN v_items = 0 THEN 'nothing in scope: the selector resolves to no ' || CASE WHEN a.kind = 'deletion' THEN 'superseded evidence' ELSE 'evidence' END
                                                               WHEN v_blocking > 0 AND a.target_kind = 'evidence' THEN 'the scope cannot be retired safely: ' || v_blocking || ' blocking item(s) — ' || v_names
                                                               WHEN v_blocking > 0 THEN 'the scope cannot be retired safely: ' || v_blocking || ' blocking item(s)'
                                                               WHEN a.kind = 'customer_export' THEN 'nothing exportable in scope: every object is excluded (the redaction gate, the data-rights gate, or an id naming no manifest of this domain)'
                                                               WHEN a.kind = 'archive' THEN 'nothing to archive: every manifest in scope is already in the archive tier, or an id names no manifest of this domain'
                                                               WHEN a.kind = 'restore' THEN 'nothing to restore: every manifest in scope is already in the hot tier, or an id names no manifest of this domain'
                                                               ELSE 'nothing executes: every item in scope is excluded' END
                                       ELSE NULL END
   WHERE action_id = p_action_id;
  PERFORM retention.event(p_action_id, p_tenant, p_domain, CASE v_state WHEN 'held' THEN 'action.held' WHEN 'paused' THEN 'action.paused' ELSE 'scope.resolved' END, p_actor, v_summary || jsonb_build_object('scope_digest', v_digest), p_correlation);
  RETURN v_summary || jsonb_build_object('state', v_state, 'scope_digest', v_digest);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION retention.resolve_scope(uuid,uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION retention.resolve_scope(uuid,uuid,uuid,uuid,uuid) TO eye_commit;

-- ============================================================
-- §5 begin_execution re-declared: the manager's admission checks; the restore kind; the attempt counted
-- ============================================================
-- 0071 §1's body with: the restore among the kinds that execute; the MANAGER'S TWO CHECKS after the approver check and BEFORE the lock
-- block (nothing is locked, copied or moved for an execution the policy refuses) — the attempts against max_attempts (the controller
-- escalates the action), and, for an archive or a restore under a daily byte budget, the bytes the domain moved in the rolling
-- 24-hour window plus this execution's executable bytes against the budget (the controller pauses the action for a retry, the
-- reason naming the instant the window frees); the restore locked EXCLUSIVELY like an archive (its bytes move); the tombstone re-check
-- covering it; the state move counting the attempt in the same UPDATE, said in execution.started. Every other line as 0071 left it.
CREATE OR REPLACE FUNCTION retention.begin_execution(p_action_id uuid, p_tenant uuid, p_domain uuid, p_actor uuid, p_correlation uuid)
RETURNS jsonb
SECURITY DEFINER SET search_path = retention, observation, objects, ctx, public, pg_catalog, pg_temp AS $$
DECLARE a retention.actions_current%ROWTYPE; v_live int; v_withdrawn text; v_tombstoned text; m RECORD; v_versions bigint[]; v_dependents jsonb; v_names text := ''; v_n int;
        pol RECORD; v_bytes bigint; v_used bigint; v_resets timestamptz;
BEGIN
  PERFORM observation.assert_authority(ARRAY['retention.action.execute']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT * INTO a FROM retention.actions_current x WHERE x.action_id = p_action_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'retention execution rejected: % is not an action of this domain', p_action_id USING ERRCODE = '23503'; END IF;
  IF a.state <> 'approved' THEN RAISE EXCEPTION 'retention execution rejected: % is % — only an approved action executes', p_action_id, a.state USING ERRCODE = '22023'; END IF;
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'retention execution rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF a.kind NOT IN ('deletion', 'log_floor', 'review', 'archive', 'customer_export', 'restore') THEN RAISE EXCEPTION 'retention execution rejected: a % action has no executor in this release', a.kind USING ERRCODE = '22023'; END IF;
  SELECT count(*) INTO v_live FROM retention.approvals ap WHERE ap.action_id = p_action_id AND ap.scope_digest = a.scope_digest AND ap.revoked_at IS NULL AND ap.expires_at > clock_timestamp();
  IF v_live < 1 THEN RAISE EXCEPTION 'retention execution rejected: no live approval on the resolved scope' USING ERRCODE = '42501'; END IF;
  IF EXISTS (SELECT 1 FROM retention.approvals ap WHERE ap.action_id = p_action_id AND ap.approver_principal_id = p_actor AND ap.revoked_at IS NULL) THEN
    RAISE EXCEPTION 'retention execution rejected: an approver of the action does not execute it' USING ERRCODE = '42501';
  END IF;
  -- B12 (0072 §5; D4 "retries", "admission / budgets"): THE COLD-TIER MANAGER'S CHECKS — before the state moves and before any lock is
  -- taken, so a refusal here costs nothing and counts no attempt. (1) The attempts made under the policy in force: exhausted, the
  -- execution is refused and the controller ESCALATES the action for human review; a person's re-resolution restarts the count.
  -- (2) The daily byte BUDGET of an archive or a restore: the bytes the domain moved in the rolling 24-hour window (the tier ledger's
  -- records of the domain, whichever direction) plus this execution's executable bytes must not exceed it. The window is summed under
  -- the domain's BUDGET lock, taken before the sum and held to the commit (C11): a budgeted domain's byte movers are serialised, so two
  -- executions admitted together cannot each see the window free and together overrun it — the check is exact under concurrency.
  SELECT * INTO pol FROM retention.current_tier_policy(p_tenant, p_domain);
  IF a.attempts >= pol.max_attempts THEN
    RAISE EXCEPTION 'retention execution rejected (attempts_exhausted): % attempt(s) were made under a policy allowing %; the action is escalated for human review (a re-resolution restarts the count)', a.attempts, pol.max_attempts USING ERRCODE = '22023';
  END IF;
  IF a.kind IN ('archive', 'restore') AND pol.budget_bytes_per_day IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('retention.budget:' || p_tenant::text || ':' || p_domain::text, 0));
    SELECT coalesce(sum(bm.byte_length), 0) INTO v_bytes FROM retention.scope_items si JOIN observation.blob_manifests bm ON bm.manifest_id = si.ref::uuid WHERE si.action_id = p_action_id AND si.item_kind = 'manifest' AND si.disposition = 'execute';
    SELECT coalesce(sum(bm.byte_length), 0), min(r.moved_at) + interval '1 day' INTO v_used, v_resets FROM observation.blob_tier_records r JOIN observation.blob_manifests bm ON bm.manifest_id = r.manifest_id WHERE r.tenant_id = p_tenant AND r.domain_id = p_domain AND r.moved_at > clock_timestamp() - interval '1 day';
    IF v_used + v_bytes > pol.budget_bytes_per_day THEN
      RAISE EXCEPTION 'retention execution rejected (budget_exhausted): the domain moved % bytes in the last 24 hours and this execution would move % more, above the policy''s % bytes per day; the window frees at %; retried by the same route after a re-resolution', v_used, v_bytes, pol.budget_bytes_per_day, coalesce(v_resets, clock_timestamp()) USING ERRCODE = '22023';
    END IF;
  END IF;
  -- B11-F1 (0071 §1): THE MANIFESTS THIS EXECUTION MOVES OR REMOVES ARE LOCKED for the transaction — before any re-check below reads their
  -- state and before any byte is copied. Every execution takes the domain's MOVERS lock first, then the manifests' own locks in one canonical
  -- order (by ref), so two executions never wait on each other in a cycle. An archive, a restore or a deletion holds the movers lock shared
  -- and each executable manifest exclusively; a customer export, which reads the bytes of its manifests while it builds, holds both shared
  -- (two exports build together; an archive, a restore or a deletion of the same manifest waits for the export to commit). An execution
  -- naming MORE THAN 256 manifests — whatever its kind — takes the movers lock exclusively and no manifest lock: one entry in the cluster's
  -- finite lock table instead of thousands, at the price of serialising the domain's movers for its duration — every other execution waits
  -- at its start, with nothing copied and nothing recorded. The locks are held until the transaction ends; the copies an execution stages
  -- carry its own attempt's name, so no lock has to survive to their removal.
  IF a.kind IN ('archive', 'deletion', 'customer_export', 'restore') THEN
    SELECT count(*) INTO v_n FROM retention.scope_items si WHERE si.action_id = p_action_id AND si.item_kind = 'manifest' AND si.disposition = 'execute';
    IF v_n > 256 THEN
      PERFORM pg_advisory_xact_lock(retention.lock_key_domain(p_tenant, p_domain));
    ELSE
      PERFORM pg_advisory_xact_lock_shared(retention.lock_key_domain(p_tenant, p_domain));
      FOR m IN SELECT si.ref FROM retention.scope_items si WHERE si.action_id = p_action_id AND si.item_kind = 'manifest' AND si.disposition = 'execute' ORDER BY si.ref LOOP
        IF a.kind = 'customer_export' THEN PERFORM pg_advisory_xact_lock_shared(retention.lock_key_manifest(m.ref::uuid));
        ELSE PERFORM pg_advisory_xact_lock(retention.lock_key_manifest(m.ref::uuid));
        END IF;
      END LOOP;
    END IF;
  END IF;
  -- An ARCHIVE, a RESTORE or an EXPORT of a manifest tombstoned since the approval: there are no bytes to move or to package; the scope is resolved again (the tombstoned manifest leaves it).
  IF a.kind IN ('archive', 'customer_export', 'restore') THEN
    SELECT string_agg(si.ref, ', ' ORDER BY si.dependency_order) INTO v_tombstoned
      FROM retention.scope_items si
     WHERE si.action_id = p_action_id AND si.item_kind = 'manifest' AND si.disposition = 'execute'
       AND EXISTS (SELECT 1 FROM observation.blob_tombstones t WHERE t.manifest_id = si.ref::uuid);
    IF v_tombstoned IS NOT NULL THEN
      RAISE EXCEPTION 'retention execution rejected (scope_changed): manifest(s) in the approved scope were tombstoned since the approval — %; the scope is resolved again', v_tombstoned USING ERRCODE = '22023';
    END IF;
  END IF;
  -- The export's DATA-RIGHTS gate re-checked AT EXECUTION (the rights may have been withdrawn since the approval): the executor rolls back and
  -- pauses (authority_disputed). The contract rows are locked FOR SHARE first, so a withdrawal that commits inside the package build is impossible:
  -- it either committed before this read (refused here) or waits behind the export's commit (the package was built under confirmed rights).
  IF a.kind = 'customer_export' THEN
    PERFORM 1 FROM observation.source_contracts_current s
      WHERE (s.source_id, s.contract_version) IN (SELECT bm.source_id, bm.contract_version FROM retention.scope_items si JOIN observation.blob_manifests bm ON bm.manifest_id = si.ref::uuid
                                                    WHERE si.action_id = p_action_id AND si.item_kind = 'manifest' AND si.disposition = 'execute')
      FOR SHARE;
    SELECT string_agg(DISTINCT bm.source_id::text || '@' || bm.contract_version || ' (' || s.rights_state || ')', ', ') INTO v_withdrawn
      FROM retention.scope_items si JOIN observation.blob_manifests bm ON bm.manifest_id = si.ref::uuid
      JOIN observation.source_contracts_current s ON s.source_id = bm.source_id AND s.contract_version = bm.contract_version
     WHERE si.action_id = p_action_id AND si.item_kind = 'manifest' AND si.disposition = 'execute' AND s.rights_state <> 'confirmed';
    IF v_withdrawn IS NOT NULL THEN
      RAISE EXCEPTION 'retention execution rejected (rights_changed): the rights of a source in the approved scope are no longer confirmed — %; the scope is resolved again', v_withdrawn USING ERRCODE = '22023';
    END IF;
  END IF;
  -- A DELETION's SAFE SCOPE re-proven at execution (V03-T-100): the references are computed as the resolution computed them (the versions
  -- naming the manifest, the manifest's digest); any dependent now means the bytes are load-bearing and the tombstone is refused before it is written.
  IF a.kind = 'deletion' THEN
    FOR m IN SELECT si.ref, si.details FROM retention.scope_items si WHERE si.action_id = p_action_id AND si.item_kind = 'manifest' AND si.disposition = 'execute' ORDER BY si.dependency_order LOOP
      CONTINUE WHEN (m.details ->> 'evd_object_id') IS NULL;
      SELECT coalesce(array_agg(o.object_version ORDER BY o.object_version), ARRAY[]::bigint[]) INTO v_versions FROM objects.canonical_objects o
       WHERE o.object_id = (m.details ->> 'evd_object_id')::uuid AND o.object_type = 'EVD' AND (o.payload ->> 'manifest_id')::uuid = m.ref::uuid;
      v_dependents := retention.load_bearing_references(p_tenant, p_domain, (m.details ->> 'evd_object_id')::uuid, v_versions, m.details ->> 'content_digest');
      IF jsonb_array_length(v_dependents) > 0 THEN
        v_names := v_names || CASE WHEN v_names = '' THEN '' ELSE '; ' END || 'manifest ' || m.ref || ' ← ' || (SELECT string_agg((d ->> 'kind') || ':' || (d ->> 'ref'), ', ') FROM jsonb_array_elements(v_dependents) d);
      END IF;
    END LOOP;
    IF v_names <> '' THEN
      RAISE EXCEPTION 'retention execution rejected (references_changed): a live reference was created on the approved scope since it was resolved — %; the scope is resolved again', v_names USING ERRCODE = '22023';
    END IF;
  END IF;
  -- The ATTEMPT is counted with the state move (the same UPDATE): an execution that BEGAN. Rolled back with a failing execution, it is
  -- counted again where the failure is recorded — the pause's 8-argument form (C2).
  UPDATE retention.actions_current SET state = 'executing', attempts = attempts + 1 WHERE action_id = p_action_id;
  PERFORM retention.event(p_action_id, p_tenant, p_domain, 'execution.started', p_actor, jsonb_build_object('scope_digest', a.scope_digest, 'attempt', a.attempts + 1), p_correlation);
  RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('item_id', i.item_id, 'item_kind', i.item_kind, 'ref', i.ref, 'disposition', i.disposition, 'hold_id', i.hold_id, 'details', i.details) ORDER BY i.dependency_order), '[]'::jsonb)
            FROM retention.scope_items i WHERE i.action_id = p_action_id);
END $$ LANGUAGE plpgsql;

-- ============================================================
-- §6 verify_action re-declared: the restore contract; a restore's residual closes on the archive copy's absence
-- ============================================================
-- 0070 §6's body with the RESTORE branch after the archive's (D3: no tombstone; the tier recorded as hot; the bytes present in the hot
-- tier under the manifest's digest; the archive copy gone; no staged copy in either root — the observer counts a listing that fails as
-- present; the move recorded by this action) and one kind-aware line in the residual closure (C5): a restore's pending bytes residual
-- is the ARCHIVE copy's removal, so it closes when the archive copy is observed gone; every other kind's closes on bytes_present as
-- before. p_observed per manifest ref: for a restore — bytes_present (the hot tier), hot_digest_ok, archive_present, staged_copies.
-- Every other line as 0070 left it.
CREATE OR REPLACE FUNCTION retention.verify_action(p_action_id uuid, p_tenant uuid, p_domain uuid, p_observed jsonb, p_actor uuid, p_correlation uuid)
RETURNS jsonb
SECURITY DEFINER SET search_path = retention, observation, objects, ctx, public, pg_catalog, pg_temp AS $$
DECLARE a retention.actions_current%ROWTYPE; i RECORD; xp retention.export_packages%ROWTYPE; v_pass boolean; v_all boolean := true; v_checks jsonb := '[]'::jsonb; v_floor bigint; v_pending int; v_state text; ob jsonb; v_done boolean; v_tier text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['retention.action.verify']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT * INTO a FROM retention.actions_current x WHERE x.action_id = p_action_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'retention verification rejected: % is not an action of this domain', p_action_id USING ERRCODE = '23503'; END IF;
  IF a.state <> 'executed' THEN RAISE EXCEPTION 'retention verification rejected: % is % — only an executed action is verified', p_action_id, a.state USING ERRCODE = '22023'; END IF;
  FOR i IN SELECT * FROM retention.scope_items x WHERE x.action_id = p_action_id ORDER BY x.dependency_order LOOP
    ob := coalesce(p_observed -> i.ref, '{}'::jsonb);
    v_done := EXISTS (SELECT 1 FROM retention.executions e WHERE e.action_id = p_action_id AND e.item_id = i.item_id AND e.outcome = 'done');
    IF i.item_kind = 'manifest' AND i.disposition = 'execute' AND a.kind = 'review' THEN
      -- B9-F3: a REVIEW's contract is PRESERVATION — the manifest untouched (no tombstone), its bytes present, and the review recorded.
      v_pass := NOT EXISTS (SELECT 1 FROM observation.blob_tombstones t WHERE t.manifest_id = i.ref::uuid) AND coalesce((ob ->> 'bytes_present')::boolean, false) = true
                AND EXISTS (SELECT 1 FROM retention.executions e WHERE e.action_id = p_action_id AND e.item_id = i.item_id AND e.outcome = 'done');
      INSERT INTO retention.verifications (verification_id, scope, tenant_id, domain_id, action_id, check_name, expected, observed, passed, verified_by)
      VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_action_id, 'manifest ' || i.ref || ': reviewed — untouched, its bytes present', jsonb_build_object('tombstone', false, 'bytes_present', true, 'reviewed', true),
              jsonb_build_object('tombstone', EXISTS (SELECT 1 FROM observation.blob_tombstones t WHERE t.manifest_id = i.ref::uuid), 'bytes_present', ob -> 'bytes_present', 'reviewed', EXISTS (SELECT 1 FROM retention.executions e WHERE e.action_id = p_action_id AND e.item_id = i.item_id AND e.outcome = 'done')), v_pass, p_actor);
    ELSIF i.item_kind = 'manifest' AND i.disposition = 'execute' AND a.kind = 'archive' THEN
      -- The ARCHIVE contract: no tombstone; the tier recorded as archive; the bytes present in the archive tier under the manifest's digest; the hot copy gone; the move recorded.
      v_tier := observation.manifest_tier(i.ref::uuid);
      v_pass := NOT EXISTS (SELECT 1 FROM observation.blob_tombstones t WHERE t.manifest_id = i.ref::uuid) AND v_tier = 'archive'
                AND coalesce((ob ->> 'bytes_present')::boolean, true) = false
                AND coalesce((ob ->> 'archive_present')::boolean, false) = true AND coalesce((ob ->> 'archive_digest_ok')::boolean, false) = true AND v_done;
      INSERT INTO retention.verifications (verification_id, scope, tenant_id, domain_id, action_id, check_name, expected, observed, passed, verified_by)
      VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_action_id, 'manifest ' || i.ref || ': archived — bytes in the archive tier under the manifest''s digest, absent from the hot tier, the tier recorded',
              jsonb_build_object('tombstone', false, 'tier', 'archive', 'bytes_present', false, 'archive_present', true, 'archive_digest_ok', true, 'archived', true),
              jsonb_build_object('tombstone', EXISTS (SELECT 1 FROM observation.blob_tombstones t WHERE t.manifest_id = i.ref::uuid), 'tier', v_tier, 'bytes_present', ob -> 'bytes_present', 'archive_present', ob -> 'archive_present', 'archive_digest_ok', ob -> 'archive_digest_ok', 'archived', v_done, 'hold_id', i.hold_id), v_pass, p_actor);
    ELSIF i.item_kind = 'manifest' AND i.disposition = 'execute' AND a.kind = 'restore' THEN
      -- The RESTORE contract (B12, D3): no tombstone; the tier recorded as hot; the bytes present in the hot tier under the manifest's digest; the archive copy gone; no staged copy in either root; the move recorded.
      v_tier := observation.manifest_tier(i.ref::uuid);
      v_pass := NOT EXISTS (SELECT 1 FROM observation.blob_tombstones t WHERE t.manifest_id = i.ref::uuid) AND v_tier = 'hot'
                AND coalesce((ob ->> 'bytes_present')::boolean, false) = true AND coalesce((ob ->> 'hot_digest_ok')::boolean, false) = true
                AND coalesce((ob ->> 'archive_present')::boolean, true) = false AND coalesce((ob ->> 'staged_copies')::boolean, true) = false AND v_done;
      INSERT INTO retention.verifications (verification_id, scope, tenant_id, domain_id, action_id, check_name, expected, observed, passed, verified_by)
      VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_action_id, 'manifest ' || i.ref || ': restored — bytes in the hot tier under the manifest''s digest, absent from the archive tier, no staged copy, the tier recorded',
              jsonb_build_object('tombstone', false, 'tier', 'hot', 'bytes_present', true, 'hot_digest_ok', true, 'archive_present', false, 'staged_copies', false, 'restored', true),
              jsonb_build_object('tombstone', EXISTS (SELECT 1 FROM observation.blob_tombstones t WHERE t.manifest_id = i.ref::uuid), 'tier', v_tier, 'bytes_present', ob -> 'bytes_present', 'hot_digest_ok', ob -> 'hot_digest_ok', 'archive_present', ob -> 'archive_present', 'staged_copies', ob -> 'staged_copies', 'restored', v_done, 'hold_id', i.hold_id), v_pass, p_actor);
    ELSIF i.item_kind = 'manifest' AND i.disposition = 'execute' AND a.kind = 'customer_export' THEN
      -- The EXPORT contract is the PACKAGE's: the object's file present in the package under the manifest's digest and the export recorded.
      -- The source's state NOW (a tombstone, its bytes present in its tier) is observed and recorded beside it, not required: an export left
      -- the source untouched at its execution (no executor of an export removes anything), and a governed deletion of the source afterwards
      -- is its own record — it must not leave the export unverifiable for good.
      v_pass := coalesce((ob ->> 'export_present')::boolean, false) = true AND coalesce((ob ->> 'export_digest_ok')::boolean, false) = true AND v_done;
      INSERT INTO retention.verifications (verification_id, scope, tenant_id, domain_id, action_id, check_name, expected, observed, passed, verified_by)
      VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_action_id, 'manifest ' || i.ref || ': exported — listed in the package with its bytes present under the manifest''s digest (the source''s present state recorded, not required)',
              jsonb_build_object('export_present', true, 'export_digest_ok', true, 'exported', true),
              jsonb_build_object('export_present', ob -> 'export_present', 'export_digest_ok', ob -> 'export_digest_ok', 'exported', v_done, 'hold_id', i.hold_id,
                                 'source_now', jsonb_build_object('tombstone', EXISTS (SELECT 1 FROM observation.blob_tombstones t WHERE t.manifest_id = i.ref::uuid), 'bytes_present', ob -> 'bytes_present')), v_pass, p_actor);
    ELSIF i.item_kind = 'manifest' AND i.disposition = 'execute' THEN
      -- The deletion check (0066/0068 verbatim): tombstoned and bytes_present false — the observer reports the manifest's CURRENT tier, so a deletion of archived bytes verifies against the archive root.
      v_pass := EXISTS (SELECT 1 FROM observation.blob_tombstones t WHERE t.manifest_id = i.ref::uuid) AND coalesce((ob ->> 'bytes_present')::boolean, true) = false;
      INSERT INTO retention.verifications (verification_id, scope, tenant_id, domain_id, action_id, check_name, expected, observed, passed, verified_by)
      VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_action_id, 'manifest ' || i.ref || ': tombstoned and its bytes gone', jsonb_build_object('tombstone', true, 'bytes_present', false),
              jsonb_build_object('tombstone', EXISTS (SELECT 1 FROM observation.blob_tombstones t WHERE t.manifest_id = i.ref::uuid), 'bytes_present', ob -> 'bytes_present'), v_pass, p_actor);
    ELSIF i.item_kind = 'manifest' AND i.disposition = 'held' THEN
      v_pass := NOT EXISTS (SELECT 1 FROM observation.blob_tombstones t WHERE t.manifest_id = i.ref::uuid) AND coalesce((ob ->> 'bytes_present')::boolean, false) = true;
      INSERT INTO retention.verifications (verification_id, scope, tenant_id, domain_id, action_id, check_name, expected, observed, passed, verified_by)
      VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_action_id, 'manifest ' || i.ref || ': held — untouched, its bytes present', jsonb_build_object('tombstone', false, 'bytes_present', true),
              jsonb_build_object('tombstone', EXISTS (SELECT 1 FROM observation.blob_tombstones t WHERE t.manifest_id = i.ref::uuid), 'bytes_present', ob -> 'bytes_present', 'hold_id', i.hold_id), v_pass, p_actor);
    ELSIF i.item_kind = 'outbox_range' THEN
      SELECT p.retained_from_seq INTO v_floor FROM objects.outbox_partitions p WHERE p.partition_key = a.selector ->> 'partition_key';
      v_pass := v_floor >= (a.selector ->> 'to_seq')::bigint; -- a later action may have moved the floor further (B9 review)
      INSERT INTO retention.verifications (verification_id, scope, tenant_id, domain_id, action_id, check_name, expected, observed, passed, verified_by)
      VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_action_id, 'the retained floor of ' || (a.selector ->> 'partition_key') || ' stands at to_seq or beyond', jsonb_build_object('retained_from_seq', (a.selector ->> 'to_seq')::bigint), jsonb_build_object('retained_from_seq', v_floor), v_pass, p_actor);
    ELSE
      CONTINUE;
    END IF;
    v_all := v_all AND v_pass;
    v_checks := v_checks || jsonb_build_object('item', i.ref, 'kind', i.item_kind, 'disposition', i.disposition, 'passed', v_pass);
  END LOOP;
  IF a.kind = 'customer_export' THEN
    -- The PACKAGE: manifest.json present, its file digest and the package digest as recorded, every listed object present and nothing unlisted, not revoked.
    SELECT * INTO xp FROM retention.export_packages e WHERE e.action_id = p_action_id;
    ob := coalesce(p_observed -> '__package__', '{}'::jsonb);
    v_pass := xp.action_id IS NOT NULL AND xp.revoked_at IS NULL AND coalesce((ob ->> 'manifest_present')::boolean, false) = true
              AND ob ->> 'manifest_digest' = xp.manifest_digest AND ob ->> 'package_digest' = xp.package_digest
              AND coalesce((ob ->> 'objects_listed')::int, -1) = xp.object_count AND coalesce((ob ->> 'files_present')::int, -1) = xp.object_count + 1;
    INSERT INTO retention.verifications (verification_id, scope, tenant_id, domain_id, action_id, check_name, expected, observed, passed, verified_by)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_action_id, 'the export package: manifest.json present with the recorded digests, every listed object present and nothing unlisted, not revoked',
            jsonb_build_object('manifest_present', true, 'manifest_digest', xp.manifest_digest, 'package_digest', xp.package_digest, 'objects_listed', xp.object_count, 'files_present', xp.object_count + 1, 'revoked', false),
            ob || jsonb_build_object('revoked', xp.revoked_at IS NOT NULL, 'recorded', xp.action_id IS NOT NULL), coalesce(v_pass, false), p_actor);
    v_all := v_all AND coalesce(v_pass, false);
    v_checks := v_checks || jsonb_build_object('item', '__package__', 'kind', 'export_package', 'disposition', 'execute', 'passed', coalesce(v_pass, false));
  END IF;
  IF NOT v_all THEN
    UPDATE retention.actions_current SET failure_class = 'infrastructure', disposition = 'retry', failure_reason = 'a verification check failed; the action stays executed until it passes' WHERE action_id = p_action_id;
    PERFORM retention.event(p_action_id, p_tenant, p_domain, 'action.failed', p_actor, jsonb_build_object('checks', v_checks, 'verification', 'failed'), p_correlation);
    RETURN jsonb_build_object('state', 'executed', 'verified', false, 'checks', v_checks);
  END IF;
  -- A bytes residual the executor recorded (the vault refused the removal after the record committed) closes when the bytes are observed gone (B9 review).
  -- B12 (C5): a RESTORE's residual is the archive copy's removal — it closes when the archive copy is observed gone; every other kind's closes on bytes_present.
  UPDATE retention.residual_inventory ri SET status = 'retained_by_policy', note = coalesce(ri.note, '') || '; bytes observed gone at verification ' || clock_timestamp()::text
   WHERE ri.action_id = p_action_id AND ri.kind = 'bytes_present' AND ri.status = 'pending'
     AND coalesce(((p_observed -> ri.ref) ->> CASE WHEN a.kind = 'restore' THEN 'archive_present' ELSE 'bytes_present' END)::boolean, true) = false;
  SELECT count(*) INTO v_pending FROM retention.residual_inventory ri WHERE ri.action_id = p_action_id AND ri.status = 'pending';
  v_state := CASE WHEN v_pending > 0 THEN 'verified_with_residuals' ELSE 'verified' END;
  UPDATE retention.actions_current
     SET state = v_state, verified_at = clock_timestamp(), closed_at = clock_timestamp(), failure_class = NULL, disposition = NULL, failure_reason = NULL,
         residual_summary = (SELECT coalesce(jsonb_agg(jsonb_build_object('kind', ri.kind, 'ref', ri.ref, 'count', ri.count, 'status', ri.status, 'note', ri.note)), '[]'::jsonb) FROM retention.residual_inventory ri WHERE ri.action_id = p_action_id)
   WHERE action_id = p_action_id;
  PERFORM retention.event(p_action_id, p_tenant, p_domain, CASE WHEN v_pending > 0 THEN 'verification.residuals' ELSE 'verification.passed' END, p_actor, jsonb_build_object('checks', v_checks, 'residuals_pending', v_pending), p_correlation);
  RETURN jsonb_build_object('state', v_state, 'verified', true, 'checks', v_checks,
    'scope_digest', a.scope_digest, 'kind', a.kind, 'target_kind', a.target_kind, 'selector', a.selector,
    'authorized_by', (SELECT coalesce(jsonb_agg(ap.approval_id), '[]'::jsonb) FROM retention.approvals ap WHERE ap.action_id = p_action_id AND ap.revoked_at IS NULL),
    'executed', (SELECT count(*) FROM retention.executions e WHERE e.action_id = p_action_id AND e.outcome = 'done'),
    'held', (SELECT count(*) FROM retention.scope_items si WHERE si.action_id = p_action_id AND si.disposition = 'held'),
    'excluded', (SELECT count(*) FROM retention.scope_items si WHERE si.action_id = p_action_id AND si.disposition = 'excluded'),
    'residual', (SELECT coalesce(jsonb_agg(jsonb_build_object('kind', ri.kind, 'count', ri.count, 'status', ri.status)), '[]'::jsonb) FROM retention.residual_inventory ri WHERE ri.action_id = p_action_id));
END $$ LANGUAGE plpgsql;

-- ============================================================
-- §7 the schedules: no restore schedule; the evaluation orders, bounds, defers and honours the restore window
-- ============================================================
-- declare_schedule (0070 §7) re-declared with one refusal: a RESTORE is opened on demand — an action naming the manifests — never by a
-- schedule (a schedule that restored everything it archived would be the product arguing with itself; retention.schedules.action_kind's
-- CHECK is unchanged, the refusal fires before it). Every other line as 0070 left it.
CREATE OR REPLACE FUNCTION retention.declare_schedule(p_schedule_id uuid, p_tenant uuid, p_domain uuid, p_retention_profile text, p_target_kind text, p_action_kind text, p_due_after interval, p_selector jsonb, p_owner uuid, p_actor uuid, p_correlation uuid)
RETURNS void
SECURITY DEFINER SET search_path = retention, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_selector jsonb := coalesce(p_selector, '{}'::jsonb);
BEGIN
  PERFORM observation.assert_authority(ARRAY['retention.schedule.declare']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_action_kind = 'restore' THEN RAISE EXCEPTION 'retention schedule rejected: a restore is opened on demand (an action naming the manifests), not by a schedule' USING ERRCODE = '22023'; END IF;
  IF p_due_after IS NULL OR p_due_after < interval '0' THEN RAISE EXCEPTION 'retention schedule rejected: due_after is a non-negative interval' USING ERRCODE = '22023'; END IF;
  IF jsonb_typeof(v_selector) <> 'object' THEN RAISE EXCEPTION 'retention schedule rejected: the selector is an object' USING ERRCODE = '22023'; END IF;
  IF v_selector ? 'manifest_ids' OR v_selector ? 'manifest_id' THEN RAISE EXCEPTION 'retention schedule rejected: a schedule selects by retention profile and source; a chosen object set (manifest_ids) or a single manifest is an action''s selector' USING ERRCODE = '22023'; END IF;
  IF p_action_kind = 'customer_export' THEN
    IF coalesce(v_selector ->> 'classification_ceiling', '') NOT IN ('public', 'internal', 'confidential', 'restricted') THEN RAISE EXCEPTION 'retention schedule rejected: a customer_export schedule names its classification_ceiling (public, internal, confidential, restricted)' USING ERRCODE = '22023'; END IF;
    IF coalesce(v_selector ->> 'destination', 'export') <> 'export' THEN RAISE EXCEPTION 'retention schedule rejected: the export destination is the export namespace of the vault (destination export)' USING ERRCODE = '22023'; END IF;
    v_selector := v_selector || jsonb_build_object('destination', 'export');
  END IF;
  INSERT INTO retention.schedules (schedule_id, scope, tenant_id, domain_id, retention_profile, target_kind, action_kind, due_after, selector, owner_principal_id, declared_by, correlation_id)
  VALUES (p_schedule_id, 'DOMAIN', p_tenant, p_domain, p_retention_profile, p_target_kind, p_action_kind, p_due_after, v_selector, coalesce(p_owner, p_actor), p_actor, p_correlation);
END $$ LANGUAGE plpgsql;

-- evaluate_schedules (0070 §7) re-declared for the manager (D4 "ordering", "the restore window"): the policy is read once; per evidence
-- schedule the due manifests are those whose DUE INSTANT has passed — for an ARCHIVE schedule a manifest whose latest tier record is a
-- RESTORE is due at that restore's instant plus the policy's restore_hot_for (a restored record returns to the cold tier by the existing
-- schedule after its window), every other manifest at its creation plus the schedule's due_after; they open OLDEST-DUE FIRST, at most
-- max_opens_per_evaluation per schedule per evaluation, and the rest are DEFERRED to the next evaluation, the count recorded on the
-- schedule (last_evaluation = {at, opened, deferred}) beside last_evaluated_at. The deferred count is taken by the SAME query, over the
-- whole due set, BEFORE any action opens (a window count under the limit; C7): a count taken afterwards would be hidden the manifests
-- just opened by the dedupe clause. Every predicate of 0070 is kept — the profile, the selector's source, no tombstone, not already
-- in the archive tier for an archive schedule, no export without a ceiling, not already the target of an open action of this kind by
-- manifest_id — and, for an ARCHIVE schedule only, the dedupe also reads a chosen object set: a manifest an open archive action already
-- names in its manifest_ids is neither opened again nor counted as deferred (the schedule's purpose is the move; an archive under way
-- is that move). The returned array's shape is unchanged (one element per opened action, the same keys; due_from is the due instant).
-- A schedule of kind restore cannot exist (declare_schedule refuses it); guarded here anyway.
CREATE OR REPLACE FUNCTION retention.evaluate_schedules(p_tenant uuid, p_domain uuid, p_actor uuid, p_correlation uuid)
RETURNS jsonb
SECURITY DEFINER SET search_path = retention, observation, objects, ctx, public, pg_catalog, pg_temp AS $$
DECLARE s retention.schedules%ROWTYPE; m RECORD; v_action uuid; v_out jsonb := '[]'::jsonb; v_selector jsonb; pol RECORD; n_total int; n_opened int; n_deferred int;
BEGIN
  PERFORM observation.assert_authority(ARRAY['retention.schedule.evaluate']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT * INTO pol FROM retention.current_tier_policy(p_tenant, p_domain);
  FOR s IN SELECT * FROM retention.schedules x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.state = 'active' ORDER BY x.declared_at LOOP
    n_total := 0; n_opened := 0; n_deferred := 0;
    IF s.target_kind = 'evidence' AND s.action_kind <> 'restore' AND NOT (s.action_kind = 'customer_export' AND coalesce(s.selector ->> 'classification_ceiling', '') NOT IN ('public', 'internal', 'confidential', 'restricted')) THEN
      -- Due: a manifest of this profile (optionally of the selector's source) whose due instant has passed, not tombstoned,
      -- not already in the archive tier for an archive schedule, and not already the target of an open action of this kind.
      FOR m IN SELECT q.manifest_id, q.source_id, q.created_at, q.due, count(*) OVER () AS total
                 FROM (SELECT bm.manifest_id, bm.source_id, bm.created_at,
                              CASE WHEN s.action_kind = 'archive' AND lr.tier = 'hot' THEN lr.moved_at + pol.restore_hot_for ELSE bm.created_at + s.due_after END AS due
                         FROM observation.blob_manifests bm
                         -- the manifest's latest tier record (a restore, when its tier is hot): the due instant of an archive schedule starts there
                         LEFT JOIN LATERAL (SELECT r.tier, r.moved_at FROM observation.blob_tier_records r WHERE r.manifest_id = bm.manifest_id ORDER BY r.moved_at DESC, r.record_id DESC LIMIT 1) lr ON true
                        WHERE bm.tenant_id = p_tenant AND bm.domain_id = p_domain AND bm.vault = 'evidence' AND bm.retention_profile = s.retention_profile
                          AND (s.selector ->> 'source_id' IS NULL OR bm.source_id = (s.selector ->> 'source_id')::uuid)
                          AND NOT EXISTS (SELECT 1 FROM observation.blob_tombstones t WHERE t.manifest_id = bm.manifest_id)
                          AND (s.action_kind <> 'archive' OR observation.manifest_tier(bm.manifest_id) <> 'archive')
                          AND NOT EXISTS (SELECT 1 FROM retention.actions_current a WHERE a.tenant_id = p_tenant AND a.domain_id = p_domain AND a.kind = s.action_kind
                                            AND a.state NOT IN ('withdrawn', 'rejected', 'failed', 'verified', 'verified_with_residuals')
                                            AND (a.selector ->> 'manifest_id' = bm.manifest_id::text
                                                 OR (s.action_kind = 'archive' AND jsonb_typeof(a.selector -> 'manifest_ids') = 'array'
                                                     AND bm.manifest_id::text IN (SELECT lower(btrim(x)) FROM jsonb_array_elements_text(a.selector -> 'manifest_ids') x))))) q
                WHERE q.due <= clock_timestamp()
                ORDER BY q.due, q.manifest_id
                LIMIT pol.max_opens_per_evaluation LOOP
        n_total := m.total;
        v_action := gen_random_uuid();
        v_selector := jsonb_build_object('manifest_id', m.manifest_id, 'source_id', m.source_id) || (coalesce(s.selector, '{}'::jsonb) - 'manifest_id' - 'source_id');
        INSERT INTO retention.actions_current (action_id, scope, tenant_id, domain_id, kind, target_kind, selector, schedule_id, retention_profile, due_from, opened_by, correlation_id)
        VALUES (v_action, 'DOMAIN', p_tenant, p_domain, s.action_kind, 'evidence', v_selector, s.schedule_id, s.retention_profile, m.due, p_actor, p_correlation);
        PERFORM retention.event(v_action, p_tenant, p_domain, 'action.opened', p_actor, jsonb_build_object('kind', s.action_kind, 'target_kind', 'evidence', 'selector', v_selector, 'schedule_id', s.schedule_id, 'due_from', m.due), p_correlation);
        v_out := v_out || jsonb_build_object('action_id', v_action, 'kind', s.action_kind, 'target_kind', 'evidence', 'selector', v_selector, 'schedule_id', s.schedule_id, 'retention_profile', s.retention_profile, 'due_from', m.due);
        n_opened := n_opened + 1;
      END LOOP;
      n_deferred := greatest(n_total - n_opened, 0);
    END IF;
    UPDATE retention.schedules SET last_evaluated_at = clock_timestamp(), last_evaluation = jsonb_build_object('at', clock_timestamp(), 'opened', n_opened, 'deferred', n_deferred) WHERE schedule_id = s.schedule_id;
  END LOOP;
  RETURN v_out;
END $$ LANGUAGE plpgsql;

-- ============================================================
-- §8 the interface register
-- ============================================================
UPDATE objects.interface_register SET bound_to = bound_to || '; B12 (0072): the cold tier''s return path — restore (observation.restore_blob, the bytes moved back to the hot tier under the manifest''s digest) — and the cold-tier manager: a per-domain policy (retention.tier_policies: a daily byte budget, the opens per evaluation, the attempts before escalation, the escalation age, the restore window) read by begin_execution and evaluate_schedules, and its observable state (retention.tier_state)'
  WHERE interface_id = 'L3-I04';
DO $$
DECLARE v_bound int; v_partial int; v_unbound int;
BEGIN
  SELECT count(*) FILTER (WHERE binding_state = 'bound'), count(*) FILTER (WHERE binding_state = 'partial'), count(*) FILTER (WHERE binding_state = 'unbound') INTO v_bound, v_partial, v_unbound FROM objects.interface_register;
  IF (v_bound, v_partial, v_unbound) <> (26, 24, 0) THEN
    RAISE EXCEPTION 'interface register after 0072: expected 26 bound, 24 partial, 0 unbound; found %, %, %', v_bound, v_partial, v_unbound;
  END IF;
END $$;
