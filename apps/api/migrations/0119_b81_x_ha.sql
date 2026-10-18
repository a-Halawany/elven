-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0119 §HA — CP-6 B81 part `ha` (2026-10-19): THE HUMAN-AUTHORITY PATTERNS (F-P7-E-20) — the ONE backend change the clauses require: the
-- DEFER INTAKE captures its CONDITIONS and its OWNER beside the rationale and the next review it already required (PAT-08 "Reject or defer:
-- capture rationale, conditions, owner, and next review — never destructive"; B34's gate defer, gate.service.ts validateGateIntake).
--
--   decision.gate_actions   + defer_conditions (a JSON array of 1–12 distinct statements, 4–500 characters each — what must be true, or
--                             be done, before the deferred version is reviewed again; an empty array when the person states none) and
--                             + defer_owner_principal_id (who owns the next review: a named, active member with STANDING at this gate —
--                             the package owner, an approver the policy admits, or a decision authority — so the person who must resume it
--                             can). Both NULL on every other act and on every defer recorded before B81 (said so by the reader, never
--                             back-filled); the table stays APPEND-ONLY (its trigger is untouched); the checks below hold on old rows.
--   decision.gate_act       copied WHOLE from its LAST definition (0094 §G, line 3477), the B81 changes marked `-- B81 ha`: two trailing
--                             parameters with DEFAULT NULL (p_conditions jsonb, p_owner uuid) — a caller of the 13-argument form keeps today's
--                             behaviour exactly (the owner defaults to the deferring person, who is today's assignee of the gate.review task;
--                             the conditions default to none stated); on a defer the port validates both, records them, assigns the review
--                             task to the OWNER, and carries them on the version.deferred event; on any other act either is REFUSED (a
--                             request for information keeps its own asked-for text; a reject carries its rationale). The 13-argument
--                             signature is dropped first so ONE port remains (no overload, no ambiguity).
--
-- Nothing else changes: no approval, digest, separation of duties, gate state, PDP rule or other write port moves (D11). The refusals keep
-- the B34 family `gate rejected (<class>): …` — (conditions) and (owner) are the caller's own request: 422 by B34's catch-all row
-- (observation-errors.ts); no new noun to map. CONSTRUCTION only here; the act (SYNTHETIC personas) demonstrates it; real acceptance is H3's.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- §HA.1 THE LEDGER: two additive columns (old rows NULL; the append-only trigger stands) ──────────────────────────────────────────────────
ALTER TABLE decision.gate_actions
  ADD COLUMN defer_conditions jsonb,
  ADD COLUMN defer_owner_principal_id uuid,
  ADD CONSTRAINT dga_defer_conditions CHECK (defer_conditions IS NULL OR (action = 'defer' AND jsonb_typeof(defer_conditions) = 'array' AND jsonb_array_length(defer_conditions) <= 12)),
  ADD CONSTRAINT dga_defer_owner CHECK (defer_owner_principal_id IS NULL OR action = 'defer');

-- §HA.2 THE PORT: decision.gate_act — 0094 §G line 3477, copied whole; the B81 changes marked ──────────────────────────────────────────────
DROP FUNCTION decision.gate_act(uuid, uuid, uuid, uuid, int, text, text, timestamptz, text, text, uuid, uuid, uuid);
CREATE OR REPLACE FUNCTION decision.gate_act(
  p_action_id uuid, p_tenant uuid, p_domain uuid, p_package_id uuid, p_version int, p_action text, p_rationale text, p_next_review_at timestamptz,
  p_info_request text, p_package_digest text, p_actor uuid, p_event_id uuid, p_correlation uuid,
  /* B81 ha: the defer's conditions and owner (PAT-08) */ p_conditions jsonb DEFAULT NULL, p_owner uuid DEFAULT NULL /* end B81 ha */
) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE p record; v record; v_to text; v_standing text; v_ip jsonb; v_task jsonb; v_task_id uuid; v_live int; v_quorum int; v_event text; v_open text[] := ARRAY['proposed', 'under_review', 'approved'];
        /* B81 ha */ v_conditions jsonb; v_owner uuid; v_c jsonb; /* end B81 ha */
BEGIN
  IF p_action IS NULL OR p_action NOT IN ('review', 'acknowledge', 'ready', 'defer', 'reject', 'request_information', 'resume') THEN
    RAISE EXCEPTION 'gate rejected (action): % is not a gate act (review, acknowledge, ready, defer, reject, request_information, resume)', coalesce(p_action, '<none>') USING ERRCODE = '22023';
  END IF;
  PERFORM observation.assert_authority(ARRAY['decision.gate.' || p_action, /* B36 (0094) gates */ 'decision.board.' || p_action /* end B36 gates */]);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'gate rejected: a gate act is the acting principal''s own, never on behalf of another' USING ERRCODE = '42501'; END IF;
  IF NOT decision.is_active_human(p_actor, p_tenant) THEN RAISE EXCEPTION 'gate rejected: only a named, active member acts at the gate' USING ERRCODE = '42501'; END IF;
  IF p_rationale IS NULL OR length(btrim(p_rationale)) < 8 OR length(p_rationale) > 4000 THEN
    RAISE EXCEPTION 'gate rejected (rationale): a gate act states its rationale (8 to 4000 characters)' USING ERRCODE = '22023';
  END IF;
  -- B81 ha: the conditions and the owner belong to a defer only (a request for information keeps its asked-for text; a reject its rationale)
  IF p_action <> 'defer' AND (p_conditions IS NOT NULL OR p_owner IS NOT NULL) THEN
    RAISE EXCEPTION 'gate rejected (conditions): conditions and an owner are recorded on a defer only, not on a %', replace(p_action, '_', ' ') USING ERRCODE = '22023';
  END IF;
  IF p_action = 'defer' THEN
    v_conditions := coalesce(p_conditions, '[]'::jsonb);
    IF jsonb_typeof(v_conditions) <> 'array' OR jsonb_array_length(v_conditions) > 12 THEN
      RAISE EXCEPTION 'gate rejected (conditions): a defer lists at most 12 conditions' USING ERRCODE = '22023';
    END IF;
    FOR v_c IN SELECT x FROM jsonb_array_elements(v_conditions) AS t(x) LOOP
      IF jsonb_typeof(v_c) <> 'string' OR length(btrim(v_c #>> '{}')) < 4 OR length(v_c #>> '{}') > 500 THEN
        RAISE EXCEPTION 'gate rejected (conditions): each condition of a defer is a statement of 4 to 500 characters' USING ERRCODE = '22023';
      END IF;
    END LOOP;
    SELECT coalesce(jsonb_agg(to_jsonb(btrim(x #>> '{}')) ORDER BY o), '[]'::jsonb) INTO v_conditions FROM jsonb_array_elements(v_conditions) WITH ORDINALITY AS t(x, o);
    IF (SELECT count(DISTINCT lower(x #>> '{}')) FROM jsonb_array_elements(v_conditions) AS t(x)) <> jsonb_array_length(v_conditions) THEN
      RAISE EXCEPTION 'gate rejected (conditions): a defer states each condition once' USING ERRCODE = '22023';
    END IF;
    v_owner := coalesce(p_owner, p_actor);
  END IF;
  -- end B81 ha
  SELECT * INTO p FROM decision.packages_current x WHERE x.package_id = p_package_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'gate rejected: no such package in this domain' USING ERRCODE = '23503'; END IF;
  SELECT * INTO v FROM decision.package_versions x WHERE x.package_id = p_package_id AND x.version = p_version FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'gate rejected: no such version % of package %', p_version, p_package_id USING ERRCODE = '23503'; END IF;
  IF p.state IN ('withdrawn', 'closed') OR v.state NOT IN ('proposed', 'under_review', 'approved', 'deferred', 'information_requested') THEN
    RAISE EXCEPTION 'gate rejected (state): version % is % (the package is %); the gate acts on a proposed version not yet committed, rejected or superseded', p_version, v.state, p.state USING ERRCODE = '22023';
  END IF;
  v_to := v.state;
  IF p_action IN ('review', 'acknowledge') THEN
    v_event := CASE p_action WHEN 'review' THEN 'gate.reviewed' ELSE 'gate.acknowledged' END;
  ELSIF p_action = 'ready' THEN
    IF NOT (v.state = ANY (v_open)) THEN RAISE EXCEPTION 'gate rejected (state): version % is %; decision-ready is marked on a proposed, reviewed or approved version', p_version, v.state USING ERRCODE = '22023'; END IF;
    IF p_actor IN (v.author_principal_id, p.owner_principal_id) OR p_actor = v.proposed_by OR p_actor::text = (v.choice ->> 'action_owner')
       OR EXISTS (SELECT 1 FROM decision.approvals a WHERE a.package_id = p_package_id AND a.version = p_version AND a.approver_principal_id = p_actor AND a.revoked_at IS NULL) THEN
      RAISE EXCEPTION 'gate rejected (independence): the reviewer who marks a version decision-ready is independent — not its author, proposer, owner, action owner nor an approver of it' USING ERRCODE = '42501';
    END IF;
    v_ip := decision.information_package(p_tenant, p_domain, p_package_id, p_version);
    IF p_package_digest IS NULL OR p_package_digest IS DISTINCT FROM (v_ip ->> 'digest') THEN
      RAISE EXCEPTION 'gate rejected (stale_package): the information package read (%) is not the package now (%); read it again', coalesce(p_package_digest, '<none>'), v_ip ->> 'digest' USING ERRCODE = '22023';
    END IF;
    v_event := 'version.ready';
  ELSE
    v_standing := decision.gate_standing(p_actor, p_tenant, p_domain, p_package_id, p_version);
    IF v_standing IS NULL THEN
      RAISE EXCEPTION 'gate rejected (authority): principal % is neither the package owner, an approver the policy admits, nor a decision authority', p_actor USING ERRCODE = '42501';
    END IF;
    IF p_action IN ('defer', 'request_information') THEN
      IF NOT (v.state = ANY (v_open)) THEN RAISE EXCEPTION 'gate rejected (state): version % is already %; resume it first', p_version, v.state USING ERRCODE = '22023'; END IF;
      IF p_next_review_at IS NULL OR p_next_review_at <= clock_timestamp() OR p_next_review_at > clock_timestamp() + interval '180 days' THEN
        RAISE EXCEPTION 'gate rejected (next_review): a % names its next review, in the future and within 180 days', replace(p_action, '_', ' ') USING ERRCODE = '22023';
      END IF;
      IF p_action = 'request_information' AND (p_info_request IS NULL OR length(btrim(p_info_request)) < 8) THEN
        RAISE EXCEPTION 'gate rejected (info_request): a request for information says what is asked (8+ characters)' USING ERRCODE = '22023';
      END IF;
      -- B81 ha: the defer's owner holds standing at this gate (the person who must resume it can) — re-checked here, never trusted from the caller
      IF p_action = 'defer' AND v_owner IS DISTINCT FROM p_actor AND decision.gate_standing(v_owner, p_tenant, p_domain, p_package_id, p_version) IS NULL THEN
        RAISE EXCEPTION 'gate rejected (owner): the owner of the next review (%) is a named, active member with standing at this gate — the package owner, an approver the policy admits, or a decision authority', v_owner USING ERRCODE = '22023';
      END IF;
      -- end B81 ha
      v_to := CASE p_action WHEN 'defer' THEN 'deferred' ELSE 'information_requested' END;
      v_event := CASE p_action WHEN 'defer' THEN 'version.deferred' ELSE 'version.information_requested' END;
      v_task := executive._open_human_task(gen_random_uuid(), p_tenant, p_domain, 'gate.review', 'gate.review:' || p_action_id::text, decision.gate_subject(p_package_id, p_version),
        format('%s: review %s version %s by %s', CASE p_action WHEN 'defer' THEN 'Deferred' ELSE 'Information requested' END, p.title, p_version, to_char(p_next_review_at AT TIME ZONE 'UTC', 'YYYY-MM-DD')),
        CASE p_action WHEN 'defer' THEN /* B81 ha: the defer's owner (the deferring person unless another is named) */ v_owner /* end B81 ha */ ELSE p.owner_principal_id END, '{}', jsonb_build_object('gate_action_id', p_action_id), p_next_review_at,
        jsonb_build_object('principal', p.owner_principal_id, 'max_escalations', 1, 'extend_minutes', 1440), NULL, p_action, p_actor, p_correlation);
      v_task_id := (v_task ->> 'task_id')::uuid;
    ELSIF p_action = 'reject' THEN
      v_to := 'rejected'; v_event := 'version.rejected_by_owner';
    ELSE -- resume
      IF v.state NOT IN ('deferred', 'information_requested') THEN RAISE EXCEPTION 'gate rejected (state): version % is %; only a deferred or information-requested version resumes', p_version, v.state USING ERRCODE = '22023'; END IF;
      v_quorum := (v.approver_policy ->> 'quorum')::int;
      SELECT count(*) INTO v_live FROM decision.live_approvals(p_package_id, p_version);
      v_to := CASE WHEN v_live >= v_quorum THEN 'approved' WHEN v_live > 0 THEN 'under_review' ELSE 'proposed' END;
      v_event := 'version.resumed';
      PERFORM executive._resolve_human_tasks(p_tenant, p_domain, decision.gate_subject(p_package_id, p_version), ARRAY['gate.review'], 'resumed', p_action_id, p_actor, p_correlation);
    END IF;
  END IF;
  INSERT INTO decision.gate_actions (action_id, scope, tenant_id, domain_id, package_id, version, action, actor_principal_id, rationale, next_review_at, info_request, information_package_digest, from_state, to_state, task_id, correlation_id,
                                     /* B81 ha */ defer_conditions, defer_owner_principal_id /* end B81 ha */)
  VALUES (p_action_id, 'DOMAIN', p_tenant, p_domain, p_package_id, p_version, p_action, p_actor, btrim(p_rationale),
          CASE WHEN p_action IN ('defer', 'request_information') THEN p_next_review_at END, CASE WHEN p_action = 'request_information' THEN btrim(p_info_request) END,
          CASE WHEN p_action = 'ready' THEN p_package_digest END, v.state, v_to, v_task_id, p_correlation,
          /* B81 ha */ v_conditions, v_owner /* end B81 ha */);
  IF v_to <> v.state THEN
    UPDATE decision.package_versions SET state = v_to WHERE package_id = p_package_id AND version = p_version;
    IF p.current_version = p_version THEN UPDATE decision.packages_current SET state = v_to WHERE package_id = p_package_id; END IF;
  END IF;
  IF p_action = 'reject' THEN
    PERFORM executive._cancel_human_tasks(p_tenant, p_domain, decision.gate_subject(p_package_id, p_version), ARRAY['gate.approve', 'gate.review', 'gate.ready_review', 'gate.delegated_approval'],
                                          'the version was rejected at the gate', p_actor, p_correlation);
  ELSIF p_action = 'ready' THEN
    PERFORM executive._resolve_human_tasks(p_tenant, p_domain, decision.gate_subject(p_package_id, p_version), ARRAY['gate.ready_review'], 'ready', p_action_id, p_actor, p_correlation);
  END IF;
  INSERT INTO decision.package_events (event_id, scope, tenant_id, domain_id, package_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_package_id, v_event, p_actor,
          jsonb_strip_nulls(jsonb_build_object('version', p_version, 'action_id', p_action_id, 'action', p_action, 'rationale', btrim(p_rationale), 'from_state', v.state, 'to_state', v_to,
                             'next_review_at', CASE WHEN p_action IN ('defer', 'request_information') THEN p_next_review_at END, 'info_request', CASE WHEN p_action = 'request_information' THEN btrim(p_info_request) END,
                             'information_package_digest', CASE WHEN p_action = 'ready' THEN p_package_digest END, 'standing', v_standing, 'task_id', v_task_id,
                             /* B81 ha */ 'conditions', v_conditions, 'owner', v_owner /* end B81 ha */)), p_correlation);
  RETURN jsonb_strip_nulls(jsonb_build_object('action_id', p_action_id, 'package_id', p_package_id, 'version', p_version, 'action', p_action, 'from_state', v.state, 'to_state', v_to,
                            'next_review_at', CASE WHEN p_action IN ('defer', 'request_information') THEN p_next_review_at END, 'task_id', v_task_id, 'standing', v_standing, 'event', v_event,
                            /* B81 ha */ 'conditions', v_conditions, 'owner', v_owner /* end B81 ha */));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.gate_act(uuid, uuid, uuid, uuid, int, text, text, timestamptz, text, text, uuid, uuid, uuid, jsonb, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.gate_act(uuid, uuid, uuid, uuid, int, text, text, timestamptz, text, text, uuid, uuid, uuid, jsonb, uuid) TO eye_commit;
