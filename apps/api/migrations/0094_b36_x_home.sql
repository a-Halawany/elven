-- 0094 §H — CP-6 B36 part `home` (2026-09-30): THE EXECUTIVE HOME, THE CADENCE AND THE COMMAND VIEWS (F-P6-11; WS-01, JRN-19, PER-03,
-- CAP-EO-01/-02/-04). Built on the §0 prelude (executive.contexts / set_context / current_context, executive.cadences, the room kinds
-- decision | scenario | objective_review | forum on executive.rooms_current — USED here, never re-declared) and on nothing another B36
-- part builds at the SQL level: a sibling's object is read through feature detection (to_regclass / to_regprocedure) or not at all.
--
-- What this section declares, and nothing else (MAP.md §H):
--   §H1  the vocabulary: executive.home_horizon_interval(text), executive.home_section_names()
--   §H2  the room kinds bound (h3): executive.open_subject_room (a scenario room bound to a scenario, an objective review bound to an
--        objective, with a deadline; the SoD: the objective's owner opens no review of it), executive.raise_overdue_rooms (the attention
--        tick's step `room-deadlines`, order 58: an overdue room raises ONE attention item of class review.convened with the overdue
--        marker), and executive.convene_review RE-DECLARED from 0084 §4 (lines 199–279) with ONE change: the objective's owner is
--        neither the chair nor a reviewer of its review (`objective review rejected (separation_of_duties)`)
--   §H3  the cadence (h1, JRN-19): executive.cadence_events (append-only), executive.open_cadence, executive.reset_cadence (the reset
--        CLOSES the cycle with its closing record — reviewed, decided, committed, left open — and OPENS the next; open board-class
--        decisions need the executive's confirmation with a reason), executive.cadence_of
--   §H4  the executive operator's tooling (h5, PER-03): executive.cadence_agenda (+ executive.set_agenda / executive.agenda_of),
--        executive.cadence_escalations (+ executive.escalate_gap: an escalation item to a named executive, on the queue as
--        queue.governance; executive.answer_escalation); executive.delegate_attention_item RE-DECLARED from 0086 §G (lines 1714–1764)
--        and executive.reassign_human_task RE-DECLARED from 0090 §W3 (lines 5779–5812), each with ONE change: the executive operator
--        routes work through them (never a new write path)
--   §H5  the home (h1, WS-01): executive.home(...) — ONE read composing priorities, intelligence, warnings, decisions, commitments,
--        outcomes and the cadence under the reader's context, each section with its as-of, its count and its limitations
--   §H6  the command views (h2, CAP-EO-02/-04): executive.command_views (role × moment, seeded), executive.command_view(...),
--        executive.command_views_for(...); the context switcher's choices executive.context_choices(...)
--   §H7  the search with explanation (h4): executive.search(...) (a read over rooms, briefings v1–v3, packages, commitment items,
--        attention items, warnings, reviews — the audience contract and the reader's RLS respected; every hit explained),
--        executive.search_events (the access ledger, append-only) and executive.record_search (the port that reads and records)
--   §H8  the metrics (h6): executive.metrics(...) — time-to-understanding, decision latency, review completion, computed on read from
--        the ledgers; nothing stored
--   §H9  RLS and the grants (the 0081 loop idiom)
-- Refusal families (mapped in observation-errors.ts inside /* B36 home */): `cadence rejected (<class>)`, `executive room rejected
-- (<class>)`, `objective review rejected (separation_of_duties)`, `agenda rejected (<class>)`, `escalation rejected (<class>)`,
-- `search rejected (<class>)`, `command view rejected (<class>)`, and §0's `context rejected (<class>)` (this part owns its only route).
-- Every figure a harness seeds through these ports is SYNTHETIC. Forward-only; 0084–0093 untouched; the prelude untouched.

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §H1 THE VOCABULARY
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
/* The §0 horizon as a window: 30d, 90d, 12m, 36m. */
CREATE OR REPLACE FUNCTION executive.home_horizon_interval(p text) RETURNS interval
LANGUAGE sql IMMUTABLE AS $$ SELECT CASE p WHEN '30d' THEN interval '30 days' WHEN '12m' THEN interval '12 months' WHEN '36m' THEN interval '36 months' ELSE interval '90 days' END $$;
GRANT EXECUTE ON FUNCTION executive.home_horizon_interval(text) TO eye_app, eye_commit;
/* The seven sections of the home, in the order the page renders them (the cadence closes the loop). */
CREATE OR REPLACE FUNCTION executive.home_section_names() RETURNS text[]
LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY['priorities', 'intelligence', 'warnings', 'decisions', 'commitments', 'outcomes', 'cadence'] $$;
GRANT EXECUTE ON FUNCTION executive.home_section_names() TO eye_app, eye_commit;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §H2 THE ROOM KINDS BOUND (h3): a scenario room, an objective review, with a deadline and the SoD
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
/* A room of kind scenario (bound to a scenario of this domain) or objective_review (bound to an active objective — a graph OBJ), with a
   DEADLINE (after now, within a year); the opener is its owner. The separation of duties: the OBJECTIVE's OWNER opens no review of it
   (the review's convening, §H2's convene_review, refuses them as chair or reviewer likewise). A decision room stays 0044's open_room. */
CREATE OR REPLACE FUNCTION executive.open_subject_room(
  p_room_id uuid, p_tenant uuid, p_domain uuid, p_kind text, p_subject_id uuid, p_title text, p_deadline timestamptz, p_review_every_days int,
  p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, decision, prediction, graph, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_at timestamptz := clock_timestamp(); v_owner uuid; v_subject_title text; v_every int := coalesce(p_review_every_days, 7);
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.room.open']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'executive room rejected (actor): a room is opened by the acting principal' USING ERRCODE = '42501'; END IF;
  IF NOT decision.is_active_human(p_actor, p_tenant) THEN RAISE EXCEPTION 'executive room rejected (actor): a room is opened by a named, active human' USING ERRCODE = '42501'; END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('scenario', 'objective_review') THEN
    RAISE EXCEPTION 'executive room rejected (kind): a subject room is a scenario room or an objective review (%)', coalesce(p_kind, '<none>') USING ERRCODE = '22023';
  END IF;
  IF p_title IS NULL OR length(btrim(p_title)) NOT BETWEEN 2 AND 256 THEN RAISE EXCEPTION 'executive room rejected (title): a title is 2–256 characters' USING ERRCODE = '22023'; END IF;
  IF p_deadline IS NULL OR p_deadline <= v_at OR p_deadline > v_at + interval '366 days' THEN
    RAISE EXCEPTION 'executive room rejected (deadline): the deadline is after now and within a year' USING ERRCODE = '22023';
  END IF;
  IF v_every < 1 OR v_every > 365 THEN RAISE EXCEPTION 'executive room rejected (cadence): review_every_days is between 1 and 365' USING ERRCODE = '22023'; END IF;
  IF p_kind = 'scenario' THEN
    SELECT s.owner_principal_id, s.title INTO v_owner, v_subject_title FROM prediction.scenarios_current s WHERE s.scenario_id = p_subject_id AND s.tenant_id = p_tenant AND s.domain_id = p_domain;
    IF NOT FOUND THEN RAISE EXCEPTION 'executive room rejected (unknown_subject): no scenario % in this domain', p_subject_id USING ERRCODE = '23503'; END IF;
  ELSE
    SELECT s.owner_principal_id, s.title INTO v_owner, v_subject_title FROM graph.strategy_current s WHERE s.strategy_object_id = p_subject_id AND s.tenant_id = p_tenant AND s.domain_id = p_domain AND s.object_type = 'OBJ';
    IF NOT FOUND THEN RAISE EXCEPTION 'executive room rejected (unknown_subject): no objective % in this domain', p_subject_id USING ERRCODE = '23503'; END IF;
    IF v_owner = p_actor THEN
      RAISE EXCEPTION 'objective review rejected (separation_of_duties): the owner of objective % opens no review of it; another person reviews it', p_subject_id USING ERRCODE = '42501';
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM executive.rooms_current r WHERE r.tenant_id = p_tenant AND r.domain_id = p_domain AND r.kind = p_kind AND r.subject_id = p_subject_id AND (r.deadline IS NULL OR r.deadline > v_at)) THEN
    RAISE EXCEPTION 'executive room rejected (state): a % room on % is already open with a deadline still ahead', p_kind, p_subject_id USING ERRCODE = '22023';
  END IF;
  INSERT INTO executive.rooms_current (room_id, scope, tenant_id, domain_id, package_id, title, owner_principal_id, review_every_days, next_review_at, opened_by, correlation_id, kind, subject_id, deadline)
  VALUES (p_room_id, 'DOMAIN', p_tenant, p_domain, NULL, btrim(p_title), p_actor, v_every, least(p_deadline, v_at + make_interval(days => v_every)), p_actor, p_correlation, p_kind, p_subject_id, p_deadline);
  INSERT INTO executive.room_members (room_id, principal_id, scope, tenant_id, domain_id, role, added_by)
  VALUES (p_room_id, p_actor, 'DOMAIN', p_tenant, p_domain, 'owner', p_actor);
  INSERT INTO executive.room_events (event_id, scope, tenant_id, domain_id, room_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_room_id, 'room.opened', p_actor,
          jsonb_build_object('kind', p_kind, 'subject_id', p_subject_id, 'subject_title', v_subject_title, 'subject_owner', v_owner, 'title', btrim(p_title), 'deadline', p_deadline, 'review_every_days', v_every), p_correlation);
  RETURN jsonb_build_object('room_id', p_room_id, 'kind', p_kind, 'subject_id', p_subject_id, 'subject_title', v_subject_title, 'title', btrim(p_title), 'deadline', p_deadline, 'owner', p_actor, 'opened_at', v_at);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.open_subject_room(uuid,uuid,uuid,text,uuid,text,timestamptz,int,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.open_subject_room(uuid,uuid,uuid,text,uuid,text,timestamptz,int,uuid,uuid,uuid) TO eye_commit;

/* THE TICK STEP `room-deadlines` (order 58): every scenario room / objective review whose deadline has passed and that carries no
   review.overdue event for that deadline raises ONE attention item of class review.convened (the class exists) with the OVERDUE marker,
   routed to the room's owner under the active policy's rule for the class (0083 §5's routing, as the strategy detections do), and the
   room event review.overdue records it. Bound to executive.attention.tick — the attention agent's action; nobody else runs it. */
CREATE OR REPLACE FUNCTION executive.raise_overdue_rooms(p_tenant uuid, p_domain uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, decision, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_now timestamptz := clock_timestamp(); r record; pol executive.attention_policies%ROWTYPE; v_eval jsonb; v_route jsonb; v_state text; v_owner uuid; v_item uuid; v_event uuid; v_raised jsonb := '[]'::jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.attention.tick']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT * INTO pol FROM executive.attention_policies a WHERE a.tenant_id = p_tenant AND a.domain_id = p_domain AND a.state = 'active';
  FOR r IN SELECT m.* FROM executive.rooms_current m
            WHERE m.tenant_id = p_tenant AND m.domain_id = p_domain AND m.kind IN ('scenario', 'objective_review') AND m.deadline IS NOT NULL AND m.deadline <= v_now
              AND NOT EXISTS (SELECT 1 FROM executive.room_events e WHERE e.room_id = m.room_id AND e.event = 'review.overdue' AND (e.details ->> 'deadline')::timestamptz = m.deadline)
            ORDER BY m.deadline LOOP
    v_item := gen_random_uuid(); v_event := gen_random_uuid();
    v_owner := CASE WHEN decision.is_active_human(r.owner_principal_id, p_tenant) THEN r.owner_principal_id END;
    v_eval := executive.evaluate_attention(CASE WHEN pol.policy_id IS NULL THEN NULL ELSE pol.rules END, 'review.convened',
                                           jsonb_build_object('consequence', 'C2', 'confidence', 1, 'hours_to_window', 0)) || jsonb_build_object('policy_version', pol.version);
    v_route := executive.attention_route(pol.rules, 'review.convened', v_eval ->> 'outcome', v_owner, p_tenant, p_domain);
    v_state := v_route ->> 'state';
    INSERT INTO executive.attention_items (item_id, scope, tenant_id, domain_id, signal_class, subject_kind, subject_id, cause_event_id, cause_event_type, title, outcome, state,
                                           owner_principal_id, route_roles, policy_id, policy_version, evaluation, details, due_at, escalations, correlation_id)
    VALUES (v_item, 'DOMAIN', p_tenant, p_domain, 'review.convened', CASE r.kind WHEN 'scenario' THEN 'scenario' ELSE 'strategy_object' END, r.subject_id, v_event, 'RoomDeadlinePassed',
            left(format('OVERDUE %s: %s (deadline %s)', replace(r.kind, '_', ' '), r.title, r.deadline), 512), v_eval ->> 'outcome', v_state,
            v_owner, ARRAY(SELECT jsonb_array_elements_text(v_route -> 'route_roles')), pol.policy_id, pol.version, v_eval,
            jsonb_build_object('room_id', r.room_id, 'kind', r.kind, 'deadline', r.deadline, 'overdue', true, 'marker', 'overdue', 'raised_at', v_now, 'by', 'the attention tick step room-deadlines'),
            (v_route ->> 'due_at')::timestamptz, (v_route ->> 'escalations')::int, p_correlation);
    PERFORM executive.attention_event(v_item, p_tenant, p_domain,
              CASE v_state WHEN 'open' THEN 'item.routed' WHEN 'escalated' THEN 'item.escalated' WHEN 'unrouted' THEN 'item.unrouted' ELSE 'item.deprioritized' END,
              p_actor, jsonb_build_object('outcome', v_eval ->> 'outcome', 'reasons', v_eval -> 'reasons', 'policy_version', pol.version, 'owner', v_owner, 'route_roles', v_route -> 'route_roles',
                                          'due_at', v_route -> 'due_at', 'cause_event_id', v_event, 'cause_event_type', 'RoomDeadlinePassed', 'unrouted', coalesce((v_route ->> 'unrouted')::boolean, false)), p_correlation);
    INSERT INTO executive.room_events (event_id, scope, tenant_id, domain_id, room_id, event, actor_principal_id, details, correlation_id)
    VALUES (v_event, 'DOMAIN', p_tenant, p_domain, r.room_id, 'review.overdue', p_actor, jsonb_build_object('kind', r.kind, 'deadline', r.deadline, 'item_id', v_item, 'state', v_state, 'routed_to', v_owner), p_correlation);
    v_raised := v_raised || jsonb_build_object('room_id', r.room_id, 'kind', r.kind, 'deadline', r.deadline, 'item_id', v_item, 'state', v_state, 'owner', v_owner);
  END LOOP;
  RETURN jsonb_build_object('raised_at', v_now, 'raised', v_raised, 'count', jsonb_array_length(v_raised), 'policy_version', pol.version);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.raise_overdue_rooms(uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.raise_overdue_rooms(uuid, uuid, uuid, uuid) TO eye_commit;

-- (executive.convene_review is re-declared at the end of this section's file — §H2b — copied whole from 0084 with its one change.)

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §H3 THE CADENCE (h1; JRN-19 the loop reset)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
CREATE TABLE executive.cadence_events (
  event_id           uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  cadence_id         uuid NOT NULL REFERENCES executive.cadences(cadence_id),
  event              text NOT NULL CHECK (event IN ('cadence.opened', 'cadence.reset', 'cadence.reset_confirmed', 'agenda.set', 'gap.escalated', 'escalation.answered')),
  actor_principal_id uuid NOT NULL,
  details            jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT xcde_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX xcde_cadence ON executive.cadence_events (cadence_id, occurred_at);
CREATE TRIGGER xcde_append_only BEFORE UPDATE OR DELETE ON executive.cadence_events FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE executive.cadence_events IS 'B36 §H (0094): what happened to a cadence (the executive home''s cycle, §0 executive.cadences) — opened, reset (with the closing record), the agenda set, a gap escalated; append-only.';

/* The roles that open and reset a cadence: the executive and the executive operator (the administrators beside them). The reset over
   open BOARD-class decisions is the EXECUTIVE's confirmation alone (§H3 reset_cadence). */
CREATE OR REPLACE FUNCTION executive.cadence_roles() RETURNS text[]
LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY['executive', 'executive_operator', 'domain_admin', 'platform_admin'] $$;
GRANT EXECUTE ON FUNCTION executive.cadence_roles() TO eye_app, eye_commit;

CREATE OR REPLACE FUNCTION executive.cadence_answer(c executive.cadences) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = executive, pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object('cadence_id', c.cadence_id, 'period', c.period, 'sequence', c.sequence, 'opened_by', c.opened_by, 'opened_at', c.opened_at,
                            'closed_by', c.closed_by, 'closed_at', c.closed_at, 'closing_record', c.closing_record, 'open', c.closed_at IS NULL)
$$;
REVOKE ALL ON FUNCTION executive.cadence_answer(executive.cadences) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.cadence_answer(executive.cadences) TO eye_app, eye_commit;

/* OPEN a cadence of a period (weekly | monthly | quarterly): one open cadence per period and domain (§0's xcd_one_open); the sequence
   continues the period's count. A named human holding a cadence role. */
CREATE OR REPLACE FUNCTION executive.open_cadence(p_cadence_id uuid, p_tenant uuid, p_domain uuid, p_period text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE c executive.cadences%ROWTYPE; v_seq int; v_open uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.cadence.open']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'cadence rejected (actor): opened by the acting principal' USING ERRCODE = '42501'; END IF;
  IF NOT executive.holds_role(p_actor, p_tenant, p_domain, executive.cadence_roles()) THEN
    RAISE EXCEPTION 'cadence rejected (actor): a cadence is opened by a named human holding %', array_to_string(executive.cadence_roles(), ', ') USING ERRCODE = '42501';
  END IF;
  IF p_period IS NULL OR p_period NOT IN ('weekly', 'monthly', 'quarterly') THEN RAISE EXCEPTION 'cadence rejected (period): a cadence is weekly, monthly or quarterly (%)', coalesce(p_period, '<none>') USING ERRCODE = '22023'; END IF;
  SELECT x.cadence_id INTO v_open FROM executive.cadences x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.period = p_period AND x.closed_at IS NULL FOR UPDATE;
  IF v_open IS NOT NULL THEN RAISE EXCEPTION 'cadence rejected (state): a % cadence is already open (%); reset it to open the next', p_period, v_open USING ERRCODE = '22023'; END IF;
  SELECT coalesce(max(x.sequence), 0) + 1 INTO v_seq FROM executive.cadences x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.period = p_period;
  INSERT INTO executive.cadences (cadence_id, scope, tenant_id, domain_id, period, sequence, opened_by, correlation_id)
  VALUES (p_cadence_id, 'DOMAIN', p_tenant, p_domain, p_period, v_seq, p_actor, p_correlation) RETURNING * INTO c;
  INSERT INTO executive.cadence_events (event_id, scope, tenant_id, domain_id, cadence_id, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_cadence_id, 'cadence.opened', p_actor, jsonb_build_object('period', p_period, 'sequence', v_seq), p_correlation);
  RETURN executive.cadence_answer(c);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.open_cadence(uuid,uuid,uuid,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.open_cadence(uuid,uuid,uuid,text,uuid,uuid) TO eye_commit;

/* THE CLOSING RECORD of a cycle — what was reviewed, decided, committed and left open between its opening and the reset — read from the
   ledgers (room reviews and governed reviews, commitments and rejections, commitment items, the open queue, the rooms past their deadline,
   the packages in flight, the board-class decisions still open). */
CREATE OR REPLACE FUNCTION executive.cadence_closing_record(p_tenant uuid, p_domain uuid, p_since timestamptz, p_at timestamptz) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = executive, decision, pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object(
    'window', jsonb_build_object('from', p_since, 'to', p_at),
    'reviewed', jsonb_build_object(
      'room_reviews', (SELECT count(*) FROM executive.room_events e WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain AND e.event = 'review.recorded' AND e.occurred_at >= p_since AND e.occurred_at <= p_at),
      'reviews_concluded', (SELECT count(*) FROM executive.reviews v WHERE v.tenant_id = p_tenant AND v.domain_id = p_domain AND v.state = 'concluded' AND v.closed_at >= p_since AND v.closed_at <= p_at),
      'reviews_withdrawn', (SELECT count(*) FROM executive.reviews v WHERE v.tenant_id = p_tenant AND v.domain_id = p_domain AND v.state = 'withdrawn' AND v.closed_at >= p_since AND v.closed_at <= p_at)),
    'decided', jsonb_build_object(
      'committed', (SELECT coalesce(jsonb_agg(jsonb_build_object('package_id', c.package_id, 'version', c.version, 'committed_at', c.committed_at) ORDER BY c.committed_at), '[]'::jsonb)
                      FROM decision.commitments c WHERE c.tenant_id = p_tenant AND c.domain_id = p_domain AND c.committed_at >= p_since AND c.committed_at <= p_at),
      'rejected', (SELECT count(*) FROM decision.package_events e WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain AND e.event IN ('version.rejected', 'version.rejected_by_owner') AND e.occurred_at >= p_since AND e.occurred_at <= p_at),
      'withdrawn', (SELECT count(*) FROM decision.package_events e WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain AND e.event = 'package.withdrawn' AND e.occurred_at >= p_since AND e.occurred_at <= p_at)),
    'committed', jsonb_build_object(
      'items_opened', (SELECT count(*) FROM decision.commitment_items i WHERE i.tenant_id = p_tenant AND i.domain_id = p_domain AND i.created_at >= p_since AND i.created_at <= p_at),
      'items_done', (SELECT count(*) FROM decision.commitment_events e WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain AND e.event = 'commitment.closed' AND e.occurred_at >= p_since AND e.occurred_at <= p_at)),
    'left_open', jsonb_build_object(
      'attention_items', (SELECT count(*) FROM executive.attention_items i WHERE i.tenant_id = p_tenant AND i.domain_id = p_domain AND i.state IN ('open', 'escalated', 'unrouted')),
      'rooms_overdue', (SELECT count(*) FROM executive.rooms_current r WHERE r.tenant_id = p_tenant AND r.domain_id = p_domain AND r.deadline IS NOT NULL AND r.deadline <= p_at),
      'packages_in_flight', (SELECT count(*) FROM decision.packages_current p WHERE p.tenant_id = p_tenant AND p.domain_id = p_domain AND p.state IN ('proposed', 'under_review', 'approved')),
      'commitment_items_overdue', (SELECT count(*) FROM decision.commitment_items i WHERE i.tenant_id = p_tenant AND i.domain_id = p_domain AND i.due_at <= p_at AND i.state IN ('open', 'in_progress', 'exception', 'retask_required')),
      'board_decisions_open', (SELECT coalesce(jsonb_agg(jsonb_build_object('package_id', p.package_id, 'title', p.title, 'state', p.state) ORDER BY p.declared_at), '[]'::jsonb)
                                 FROM decision.packages_current p WHERE p.tenant_id = p_tenant AND p.domain_id = p_domain AND p.decision_class = 'board' AND p.state IN ('proposed', 'under_review', 'approved'))))
$$;
REVOKE ALL ON FUNCTION executive.cadence_closing_record(uuid, uuid, timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.cadence_closing_record(uuid, uuid, timestamptz, timestamptz) TO eye_app, eye_commit;

/* RESET the loop (JRN-19): the open cadence of the period is CLOSED with its closing record and the NEXT is opened (sequence + 1) in
   the same write. Open BOARD-class decisions refuse the reset unless the EXECUTIVE confirms it with a reason (an operator cannot). */
CREATE OR REPLACE FUNCTION executive.reset_cadence(p_next_id uuid, p_tenant uuid, p_domain uuid, p_period text, p_confirm_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE c executive.cadences%ROWTYPE; n executive.cadences%ROWTYPE; v_at timestamptz := clock_timestamp(); v_record jsonb; v_board int; v_reason text := nullif(btrim(coalesce(p_confirm_reason, '')), '');
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.cadence.reset']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'cadence rejected (actor): reset by the acting principal' USING ERRCODE = '42501'; END IF;
  IF NOT executive.holds_role(p_actor, p_tenant, p_domain, executive.cadence_roles()) THEN
    RAISE EXCEPTION 'cadence rejected (actor): a cadence is reset by a named human holding %', array_to_string(executive.cadence_roles(), ', ') USING ERRCODE = '42501';
  END IF;
  IF p_period IS NULL OR p_period NOT IN ('weekly', 'monthly', 'quarterly') THEN RAISE EXCEPTION 'cadence rejected (period): a cadence is weekly, monthly or quarterly (%)', coalesce(p_period, '<none>') USING ERRCODE = '22023'; END IF;
  SELECT * INTO c FROM executive.cadences x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.period = p_period AND x.closed_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'cadence rejected (state): no % cadence is open in this domain; open one first', p_period USING ERRCODE = '22023'; END IF;
  v_record := executive.cadence_closing_record(p_tenant, p_domain, c.opened_at, v_at);
  v_board := jsonb_array_length(v_record #> ARRAY['left_open', 'board_decisions_open']);
  IF v_board > 0 THEN
    IF v_reason IS NULL THEN
      RAISE EXCEPTION 'cadence rejected (state): % board-class decision(s) remain open; the executive confirms the reset with a reason', v_board USING ERRCODE = '22023';
    END IF;
    IF length(v_reason) < 8 THEN RAISE EXCEPTION 'cadence rejected (reason): the confirmation states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
    IF NOT executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['executive', 'platform_admin']) THEN
      RAISE EXCEPTION 'cadence rejected (actor): only the executive confirms a reset over % open board-class decision(s); an operator escalates it', v_board USING ERRCODE = '42501';
    END IF;
    v_record := v_record || jsonb_build_object('confirmed', jsonb_build_object('by', p_actor, 'reason', v_reason, 'board_decisions_open', v_board));
  END IF;
  UPDATE executive.cadences SET closed_by = p_actor, closed_at = v_at, closing_record = v_record WHERE cadence_id = c.cadence_id RETURNING * INTO c;
  INSERT INTO executive.cadences (cadence_id, scope, tenant_id, domain_id, period, sequence, opened_by, opened_at, correlation_id)
  VALUES (p_next_id, 'DOMAIN', p_tenant, p_domain, p_period, c.sequence + 1, p_actor, v_at, p_correlation) RETURNING * INTO n;
  INSERT INTO executive.cadence_events (event_id, scope, tenant_id, domain_id, cadence_id, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, c.cadence_id, CASE WHEN v_board > 0 THEN 'cadence.reset_confirmed' ELSE 'cadence.reset' END, p_actor,
          jsonb_build_object('closing_record', v_record, 'next_cadence_id', p_next_id, 'next_sequence', n.sequence), p_correlation),
         (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_next_id, 'cadence.opened', p_actor, jsonb_build_object('period', p_period, 'sequence', n.sequence, 'after', c.cadence_id), p_correlation);
  RETURN jsonb_build_object('closed', executive.cadence_answer(c), 'opened', executive.cadence_answer(n), 'confirmed', v_board > 0);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.reset_cadence(uuid,uuid,uuid,text,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.reset_cadence(uuid,uuid,uuid,text,text,uuid,uuid) TO eye_commit;


-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §H4 THE EXECUTIVE OPERATOR'S TOOLING (h5; PER-03): the agenda, the escalations; the routing through the existing ports
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
CREATE TABLE executive.cadence_agenda (
  agenda_id      uuid PRIMARY KEY,
  scope          text NOT NULL,
  tenant_id      uuid NOT NULL,
  domain_id      uuid NOT NULL,
  cadence_id     uuid NOT NULL REFERENCES executive.cadences(cadence_id),
  position       int  NOT NULL CHECK (position >= 1),
  object_kind    text NOT NULL CHECK (object_kind IN ('attention_item', 'room', 'package', 'commitment_item', 'review', 'warning', 'briefing')),
  object_id      uuid NOT NULL,
  note           text CHECK (note IS NULL OR length(btrim(note)) BETWEEN 1 AND 400),
  set_by         uuid NOT NULL,
  set_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  removed_by     uuid,
  removed_at     timestamptz,
  correlation_id uuid NOT NULL,
  CONSTRAINT xcag_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT xcag_removed CHECK ((removed_at IS NULL) = (removed_by IS NULL))
);
CREATE INDEX xcag_cadence ON executive.cadence_agenda (cadence_id, position) WHERE removed_at IS NULL;
/* An agenda row moves one way: current → removed (the removal set once); nothing else of the row changes. */
CREATE OR REPLACE FUNCTION executive.cadence_agenda_forward() RETURNS trigger
SET search_path = executive, pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'cadence agenda rows are append-only: DELETE prohibited' USING ERRCODE = '2F002'; END IF;
  IF OLD.removed_at IS NOT NULL OR NEW.removed_at IS NULL OR (to_jsonb(NEW) - 'removed_at' - 'removed_by') <> (to_jsonb(OLD) - 'removed_at' - 'removed_by') THEN
    RAISE EXCEPTION 'cadence agenda row % is immutable; a new row supersedes it', OLD.agenda_id USING ERRCODE = '2F002';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER xcag_forward BEFORE UPDATE OR DELETE ON executive.cadence_agenda FOR EACH ROW EXECUTE FUNCTION executive.cadence_agenda_forward();
COMMENT ON TABLE executive.cadence_agenda IS 'B36 §H (0094; PER-03 CAP-EO-01): the items of a cycle in the order the executive operator set them, each linked to its object; a row is superseded (removed) when the agenda is set again, never edited.';

CREATE TABLE executive.cadence_escalations (
  escalation_id  uuid PRIMARY KEY,
  scope          text NOT NULL,
  tenant_id      uuid NOT NULL,
  domain_id      uuid NOT NULL,
  cadence_id     uuid NOT NULL REFERENCES executive.cadences(cadence_id),
  subject_kind   text NOT NULL CHECK (subject_kind IN ('attention_item', 'room', 'package', 'commitment_item', 'review', 'warning', 'briefing', 'cadence')),
  subject_id     uuid NOT NULL,
  reason         text NOT NULL CHECK (length(btrim(reason)) BETWEEN 8 AND 2000),
  raised_by      uuid NOT NULL,
  raised_to      uuid NOT NULL,
  raised_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  item_id        uuid NOT NULL REFERENCES executive.attention_items(item_id),
  state          text NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'answered')),
  answered_by    uuid,
  answered_at    timestamptz,
  answer         text,
  correlation_id uuid NOT NULL,
  CONSTRAINT xces_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT xces_answered CHECK ((state = 'answered') = (answered_at IS NOT NULL) AND (answered_at IS NULL) = (answered_by IS NULL) AND (answered_at IS NULL) = (answer IS NULL))
);
CREATE INDEX xces_cadence ON executive.cadence_escalations (cadence_id, raised_at);
CREATE OR REPLACE FUNCTION executive.cadence_escalations_forward() RETURNS trigger
SET search_path = executive, pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'cadence escalations are append-only: DELETE prohibited' USING ERRCODE = '2F002'; END IF;
  IF OLD.state <> 'open' OR NEW.state <> 'answered' OR (to_jsonb(NEW) - 'state' - 'answered_by' - 'answered_at' - 'answer') <> (to_jsonb(OLD) - 'state' - 'answered_by' - 'answered_at' - 'answer') THEN
    RAISE EXCEPTION 'cadence escalation % is % and answers once', OLD.escalation_id, OLD.state USING ERRCODE = '2F002';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER xces_forward BEFORE UPDATE OR DELETE ON executive.cadence_escalations FOR EACH ROW EXECUTE FUNCTION executive.cadence_escalations_forward();
COMMENT ON TABLE executive.cadence_escalations IS 'B36 §H (0094; PER-03): a GAP the executive operator escalated to a named executive — the subject, the reason, the attention item it placed on the executive''s queue (class queue.governance); answered once by the executive.';

CREATE OR REPLACE FUNCTION executive.agenda_of(p_cadence uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = executive, pg_catalog, pg_temp AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('agenda_id', a.agenda_id, 'position', a.position, 'object_kind', a.object_kind, 'object_id', a.object_id, 'note', a.note, 'set_by', a.set_by, 'set_at', a.set_at) ORDER BY a.position), '[]'::jsonb)
    FROM executive.cadence_agenda a WHERE a.cadence_id = p_cadence AND a.removed_at IS NULL
$$;
GRANT EXECUTE ON FUNCTION executive.agenda_of(uuid) TO eye_app, eye_commit;

/* (§H3's read, declared here after the agenda and the escalations it composes.) The cadence read: the open cadence of the period (or the newest of any period when none is named), the last closed one's record, the
   agenda of the open cycle and its open escalations. */
CREATE OR REPLACE FUNCTION executive.cadence_of(p_tenant uuid, p_domain uuid, p_period text) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = executive, pg_catalog, pg_temp AS $$
  WITH o AS (SELECT * FROM executive.cadences c WHERE c.tenant_id = p_tenant AND c.domain_id = p_domain AND c.closed_at IS NULL AND (p_period IS NULL OR c.period = p_period)
              ORDER BY CASE c.period WHEN 'weekly' THEN 0 WHEN 'monthly' THEN 1 ELSE 2 END LIMIT 1),
       l AS (SELECT * FROM executive.cadences c WHERE c.tenant_id = p_tenant AND c.domain_id = p_domain AND c.closed_at IS NOT NULL AND c.period = coalesce((SELECT period FROM o), p_period, 'weekly')
              ORDER BY c.closed_at DESC LIMIT 1)
  SELECT jsonb_build_object('open', (SELECT executive.cadence_answer(o) FROM o), 'last_closed', (SELECT executive.cadence_answer(l) FROM l),
                            'agenda', coalesce((SELECT executive.agenda_of(o.cadence_id) FROM o), '[]'::jsonb),
                            'escalations', coalesce((SELECT jsonb_agg(jsonb_build_object('escalation_id', x.escalation_id, 'subject_kind', x.subject_kind, 'subject_id', x.subject_id, 'reason', x.reason,
                                                                                        'raised_by', x.raised_by, 'raised_to', x.raised_to, 'raised_at', x.raised_at, 'state', x.state, 'item_id', x.item_id) ORDER BY x.raised_at)
                                                        FROM executive.cadence_escalations x, o WHERE x.cadence_id = o.cadence_id), '[]'::jsonb),
                            'as_of', clock_timestamp())
$$;
GRANT EXECUTE ON FUNCTION executive.cadence_of(uuid, uuid, text) TO eye_app, eye_commit;

/* Does an object of the kind exist in this domain? (the agenda and the escalation link to declared objects only) */
CREATE OR REPLACE FUNCTION executive.home_object_exists(p_tenant uuid, p_domain uuid, p_kind text, p_id uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path = executive, decision, prediction, pg_catalog, pg_temp AS $$
  SELECT CASE p_kind
    WHEN 'attention_item' THEN EXISTS (SELECT 1 FROM executive.attention_items x WHERE x.item_id = p_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain)
    WHEN 'room' THEN EXISTS (SELECT 1 FROM executive.rooms_current x WHERE x.room_id = p_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain)
    WHEN 'package' THEN EXISTS (SELECT 1 FROM decision.packages_current x WHERE x.package_id = p_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain)
    WHEN 'commitment_item' THEN EXISTS (SELECT 1 FROM decision.commitment_items x WHERE x.item_id = p_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain)
    WHEN 'review' THEN EXISTS (SELECT 1 FROM executive.reviews x WHERE x.review_id = p_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain)
    WHEN 'warning' THEN EXISTS (SELECT 1 FROM prediction.warnings_current x WHERE x.warning_id = p_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain)
    WHEN 'briefing' THEN EXISTS (SELECT 1 FROM executive.briefings x WHERE x.briefing_id = p_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain)
    WHEN 'cadence' THEN EXISTS (SELECT 1 FROM executive.cadences x WHERE x.cadence_id = p_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain)
    ELSE false END
$$;
REVOKE ALL ON FUNCTION executive.home_object_exists(uuid, uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.home_object_exists(uuid, uuid, text, uuid) TO eye_app, eye_commit;

/* SET the agenda of the open cadence: the items in the order given ({kind, id, note?}[], at most 50), each a declared object of this
   domain; the previous agenda rows are superseded (removed) in the same write. The operator's act (executive.agenda.set); the executive
   and the administrators may too. */
CREATE OR REPLACE FUNCTION executive.set_agenda(p_tenant uuid, p_domain uuid, p_cadence_id uuid, p_items jsonb, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, decision, prediction, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE c executive.cadences%ROWTYPE; v_at timestamptz := clock_timestamp(); it jsonb; v_pos int := 0; v_kind text; v_id uuid; v_note text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.agenda.set']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'agenda rejected (actor): set by the acting principal' USING ERRCODE = '42501'; END IF;
  IF NOT executive.holds_role(p_actor, p_tenant, p_domain, executive.cadence_roles()) THEN
    RAISE EXCEPTION 'agenda rejected (actor): the agenda is curated by a named human holding %', array_to_string(executive.cadence_roles(), ', ') USING ERRCODE = '42501';
  END IF;
  SELECT * INTO c FROM executive.cadences x WHERE x.cadence_id = p_cadence_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'agenda rejected (unknown_cadence): no cadence % in this domain', p_cadence_id USING ERRCODE = '23503'; END IF;
  IF c.closed_at IS NOT NULL THEN RAISE EXCEPTION 'agenda rejected (state): cadence % is closed (sequence %); the agenda belongs to the open cycle', p_cadence_id, c.sequence USING ERRCODE = '22023'; END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) > 50 THEN RAISE EXCEPTION 'agenda rejected (items): the agenda is a list of at most 50 items' USING ERRCODE = '22023'; END IF;
  UPDATE executive.cadence_agenda SET removed_at = v_at, removed_by = p_actor WHERE cadence_id = p_cadence_id AND removed_at IS NULL;
  FOR it IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_pos := v_pos + 1;
    v_kind := it ->> 'kind'; v_note := nullif(btrim(coalesce(it ->> 'note', '')), '');
    IF v_kind IS NULL OR v_kind NOT IN ('attention_item', 'room', 'package', 'commitment_item', 'review', 'warning', 'briefing') THEN
      RAISE EXCEPTION 'agenda rejected (items): item % names a kind among attention_item, room, package, commitment_item, review, warning, briefing (%)', v_pos, coalesce(v_kind, '<none>') USING ERRCODE = '22023';
    END IF;
    BEGIN v_id := (it ->> 'id')::uuid; EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'agenda rejected (items): item % names its object by id', v_pos USING ERRCODE = '22023'; END;
    IF v_id IS NULL THEN RAISE EXCEPTION 'agenda rejected (items): item % names its object by id', v_pos USING ERRCODE = '22023'; END IF;
    IF NOT executive.home_object_exists(p_tenant, p_domain, v_kind, v_id) THEN RAISE EXCEPTION 'agenda rejected (unknown_object): item % — no % % in this domain', v_pos, v_kind, v_id USING ERRCODE = '23503'; END IF;
    IF v_note IS NOT NULL AND length(v_note) > 400 THEN RAISE EXCEPTION 'agenda rejected (items): item % — a note is at most 400 characters', v_pos USING ERRCODE = '22023'; END IF;
    INSERT INTO executive.cadence_agenda (agenda_id, scope, tenant_id, domain_id, cadence_id, position, object_kind, object_id, note, set_by, set_at, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_cadence_id, v_pos, v_kind, v_id, v_note, p_actor, v_at, p_correlation);
  END LOOP;
  INSERT INTO executive.cadence_events (event_id, scope, tenant_id, domain_id, cadence_id, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_cadence_id, 'agenda.set', p_actor, jsonb_build_object('items', v_pos), p_correlation);
  RETURN jsonb_build_object('cadence_id', p_cadence_id, 'set_at', v_at, 'items', executive.agenda_of(p_cadence_id));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.set_agenda(uuid,uuid,uuid,jsonb,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.set_agenda(uuid,uuid,uuid,jsonb,uuid,uuid) TO eye_commit;

/* ESCALATE A GAP (PER-03): the operator names the subject, the reason and the EXECUTIVE it goes to (an active human holding executive
   or decision_authority); the escalation is placed on the executive's queue as an attention item of class queue.governance (subject
   kind queue = the cadence) — routed OPEN to the named person as a human's act, not a signal the policy judges. */
CREATE OR REPLACE FUNCTION executive.escalate_gap(p_escalation_id uuid, p_tenant uuid, p_domain uuid, p_cadence_id uuid, p_subject_kind text, p_subject_id uuid, p_reason text, p_to uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, decision, prediction, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE c executive.cadences%ROWTYPE; v_at timestamptz := clock_timestamp(); v_item uuid := gen_random_uuid(); v_reason text := btrim(coalesce(p_reason, ''));
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.escalation.raise']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'escalation rejected (actor): raised by the acting principal' USING ERRCODE = '42501'; END IF;
  IF NOT executive.holds_role(p_actor, p_tenant, p_domain, executive.cadence_roles()) THEN
    RAISE EXCEPTION 'escalation rejected (actor): a gap is escalated by a named human holding %', array_to_string(executive.cadence_roles(), ', ') USING ERRCODE = '42501';
  END IF;
  SELECT * INTO c FROM executive.cadences x WHERE x.cadence_id = p_cadence_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'escalation rejected (unknown_cadence): no cadence % in this domain', p_cadence_id USING ERRCODE = '23503'; END IF;
  IF c.closed_at IS NOT NULL THEN RAISE EXCEPTION 'escalation rejected (state): cadence % is closed; a gap is escalated in the open cycle', p_cadence_id USING ERRCODE = '22023'; END IF;
  IF p_subject_kind IS NULL OR p_subject_kind NOT IN ('attention_item', 'room', 'package', 'commitment_item', 'review', 'warning', 'briefing', 'cadence') THEN
    RAISE EXCEPTION 'escalation rejected (subject): the subject is an attention_item, room, package, commitment_item, review, warning, briefing or the cadence (%)', coalesce(p_subject_kind, '<none>') USING ERRCODE = '22023';
  END IF;
  IF NOT executive.home_object_exists(p_tenant, p_domain, p_subject_kind, p_subject_id) THEN RAISE EXCEPTION 'escalation rejected (unknown_object): no % % in this domain', p_subject_kind, p_subject_id USING ERRCODE = '23503'; END IF;
  IF length(v_reason) NOT BETWEEN 8 AND 2000 THEN RAISE EXCEPTION 'escalation rejected (reason): an escalation states the gap in 8–2000 characters' USING ERRCODE = '22023'; END IF;
  IF p_to IS NULL OR p_to = p_actor OR NOT decision.is_active_human(p_to, p_tenant) OR NOT executive.holds_role(p_to, p_tenant, p_domain, ARRAY['executive', 'decision_authority']) THEN
    RAISE EXCEPTION 'escalation rejected (recipient): a gap is escalated to another active human holding executive or decision_authority in this domain' USING ERRCODE = '22023';
  END IF;
  INSERT INTO executive.attention_items (item_id, scope, tenant_id, domain_id, signal_class, subject_kind, subject_id, cause_event_id, cause_event_type, title, outcome, state,
                                         owner_principal_id, route_roles, policy_id, policy_version, evaluation, details, due_at, escalations, correlation_id)
  VALUES (v_item, 'DOMAIN', p_tenant, p_domain, 'queue.governance', 'queue', p_cadence_id, p_escalation_id, 'CadenceGapEscalated',
          left(format('ESCALATED GAP (%s %s): %s', replace(p_subject_kind, '_', ' '), p_subject_id, v_reason), 512), 'material', 'open',
          p_to, ARRAY['executive'], NULL, NULL,
          jsonb_build_object('outcome', 'material', 'reasons', jsonb_build_array('an executive operator escalated a gap of the cadence to a named executive (a human''s act; no policy judged it)'), 'dimensions', jsonb_build_object('consequence', 'C2', 'confidence', 1, 'hours_to_window', 48)),
          jsonb_build_object('escalation_id', p_escalation_id, 'cadence_id', p_cadence_id, 'subject_kind', p_subject_kind, 'subject_id', p_subject_id, 'reason', v_reason, 'raised_by', p_actor, 'kind', 'cadence_escalation'),
          v_at + interval '48 hours', 0, p_correlation);
  PERFORM executive.attention_event(v_item, p_tenant, p_domain, 'item.routed', p_actor,
            jsonb_build_object('outcome', 'material', 'owner', p_to, 'route_roles', jsonb_build_array('executive'), 'due_at', v_at + interval '48 hours', 'cause_event_id', p_escalation_id, 'cause_event_type', 'CadenceGapEscalated', 'unrouted', false), p_correlation);
  INSERT INTO executive.cadence_escalations (escalation_id, scope, tenant_id, domain_id, cadence_id, subject_kind, subject_id, reason, raised_by, raised_to, raised_at, item_id, correlation_id)
  VALUES (p_escalation_id, 'DOMAIN', p_tenant, p_domain, p_cadence_id, p_subject_kind, p_subject_id, v_reason, p_actor, p_to, v_at, v_item, p_correlation);
  INSERT INTO executive.cadence_events (event_id, scope, tenant_id, domain_id, cadence_id, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_cadence_id, 'gap.escalated', p_actor, jsonb_build_object('escalation_id', p_escalation_id, 'subject_kind', p_subject_kind, 'subject_id', p_subject_id, 'to', p_to, 'item_id', v_item), p_correlation);
  RETURN jsonb_build_object('escalation_id', p_escalation_id, 'cadence_id', p_cadence_id, 'subject_kind', p_subject_kind, 'subject_id', p_subject_id, 'reason', v_reason, 'raised_by', p_actor, 'raised_to', p_to, 'raised_at', v_at, 'item_id', v_item, 'state', 'open');
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.escalate_gap(uuid,uuid,uuid,uuid,text,uuid,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.escalate_gap(uuid,uuid,uuid,uuid,text,uuid,text,uuid,uuid,uuid) TO eye_commit;

/* The executive ANSWERS an escalation (the person it was raised to, or an administrator), once, with a note; the queue item stays the
   executive's to acknowledge or close through the queue's own acts. */
CREATE OR REPLACE FUNCTION executive.answer_escalation(p_escalation_id uuid, p_tenant uuid, p_domain uuid, p_answer text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE x executive.cadence_escalations%ROWTYPE; v_at timestamptz := clock_timestamp(); v_answer text := btrim(coalesce(p_answer, ''));
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.escalation.answer']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'escalation rejected (actor): answered by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO x FROM executive.cadence_escalations e WHERE e.escalation_id = p_escalation_id AND e.tenant_id = p_tenant AND e.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'escalation rejected (unknown_escalation): no escalation % in this domain', p_escalation_id USING ERRCODE = '23503'; END IF;
  IF p_actor <> x.raised_to AND NOT executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['domain_admin', 'platform_admin']) THEN
    RAISE EXCEPTION 'escalation rejected (actor): escalation % is answered by the executive it was raised to (%)', p_escalation_id, x.raised_to USING ERRCODE = '42501';
  END IF;
  IF x.state <> 'open' THEN RAISE EXCEPTION 'escalation rejected (state): escalation % is already answered', p_escalation_id USING ERRCODE = '22023'; END IF;
  IF length(v_answer) < 8 THEN RAISE EXCEPTION 'escalation rejected (answer): an answer is at least 8 characters' USING ERRCODE = '22023'; END IF;
  UPDATE executive.cadence_escalations SET state = 'answered', answered_by = p_actor, answered_at = v_at, answer = v_answer WHERE escalation_id = p_escalation_id RETURNING * INTO x;
  INSERT INTO executive.cadence_events (event_id, scope, tenant_id, domain_id, cadence_id, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, x.cadence_id, 'escalation.answered', p_actor, jsonb_build_object('escalation_id', p_escalation_id, 'answer', v_answer), p_correlation);
  RETURN jsonb_build_object('escalation_id', p_escalation_id, 'state', x.state, 'answered_by', p_actor, 'answered_at', v_at, 'answer', v_answer, 'item_id', x.item_id);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.answer_escalation(uuid,uuid,uuid,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.answer_escalation(uuid,uuid,uuid,text,uuid,uuid) TO eye_commit;

-- (executive.delegate_attention_item and executive.reassign_human_task are re-declared at the end of this file — §H4b — copied whole
--  from 0086 / 0090 with their one change each: the executive operator routes work through them.)

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §H5 THE EXECUTIVE HOME (h1; WS-01): ONE read under the reader's context
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
/* THE HOME — a SQL composition (one function, one snapshot, one as-of), invoker-bound (the reader's own RLS), composing the seven
   sections under the reader's §0 context: the objective (a link filter on decisions, commitments and outcomes; a boost on the queue), the
   scenario (a filter on scenario rooms; a boost on the queue), the horizon (the window of commitments due and of outcomes without an open
   cadence), the classification ceiling (the lesser of the context's and the reader's — hides signals above it and SAYS how many), the
   effective instant (the as-of of every section; NULL = now). Each section: as_of, count (the whole population), items (at most p_limit),
   limitations (what was filtered, what is degraded, what is not composed). The context each section was read under is named by its digest.
   A sibling part's read (decision.gate_state_of, executive.attention_queue_holds) is used when present and declared absent otherwise. */
CREATE OR REPLACE FUNCTION executive.home(p_tenant uuid, p_domain uuid, p_principal uuid, p_ceiling text, p_limit int) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = executive, decision, prediction, graph, simulation, observation, pg_catalog, pg_temp AS $$
DECLARE v_ctx jsonb; v_obj uuid; v_scn uuid; v_hz text; v_ceiling text; v_reader_ceiling text := CASE WHEN coalesce(p_ceiling, '') IN ('public', 'internal', 'confidential', 'restricted') THEN p_ceiling ELSE 'internal' END;
        v_at timestamptz; v_span interval; v_limit int := least(greatest(coalesce(p_limit, 10), 1), 50); v_since timestamptz; v_cad jsonb; v_cad_open jsonb;
        v_gate_fn boolean := to_regprocedure('decision.gate_state_of(uuid,int)') IS NOT NULL; v_holds_tbl boolean := to_regclass('executive.attention_queue_holds') IS NOT NULL; v_held int := 0;
        v_pri jsonb; v_pri_n int; v_int jsonb; v_int_n int; v_int_hidden int; v_wrn jsonb; v_wrn_n int; v_dec jsonb := '[]'::jsonb; v_dec_n int := 0; v_dec_dropped int := 0;
        v_cmt jsonb; v_cmt_n int; v_out jsonb; v_out_n int; r record; v_gate jsonb; v_lim jsonb; v_ctx_ref jsonb;
BEGIN
  v_ctx := executive.current_context(p_principal);
  v_obj := (v_ctx ->> 'objective_id')::uuid; v_scn := (v_ctx ->> 'scenario_id')::uuid; v_hz := coalesce(v_ctx ->> 'horizon', '90d');
  v_ceiling := CASE WHEN v_ctx IS NOT NULL AND simulation.classification_rank(v_ctx ->> 'classification') < simulation.classification_rank(v_reader_ceiling) THEN v_ctx ->> 'classification' ELSE v_reader_ceiling END;
  v_at := coalesce((v_ctx ->> 'effective_at')::timestamptz, clock_timestamp());
  v_span := executive.home_horizon_interval(v_hz);
  v_ctx_ref := jsonb_build_object('digest', v_ctx ->> 'digest', 'context_id', v_ctx ->> 'context_id', 'objective_id', v_obj, 'scenario_id', v_scn, 'horizon', v_hz, 'classification', v_ceiling, 'effective_at', v_ctx ->> 'effective_at', 'set', v_ctx IS NOT NULL);
  -- THE CADENCE (the open cycle; the window of "since" for the outcomes and the closing counts)
  v_cad := executive.cadence_of(p_tenant, p_domain, NULL);
  v_cad_open := v_cad -> 'open';
  v_since := coalesce((v_cad_open ->> 'opened_at')::timestamptz, v_at - v_span);
  -- PRIORITIES: the queue's live items, the context's subjects first, then the escalated, then the evaluated rank, the due instant, the newest
  SELECT count(*) INTO v_pri_n FROM executive.attention_items i WHERE i.tenant_id = p_tenant AND i.domain_id = p_domain AND i.state IN ('open', 'escalated', 'unrouted', 'acknowledged') AND i.created_at <= v_at;
  SELECT coalesce(jsonb_agg(j ORDER BY ord), '[]'::jsonb) INTO v_pri FROM (
    SELECT jsonb_build_object('item_id', i.item_id, 'signal_class', i.signal_class, 'subject_kind', i.subject_kind, 'subject_id', i.subject_id, 'title', i.title, 'state', i.state, 'owner', i.owner_principal_id,
                              'route_roles', to_jsonb(i.route_roles), 'due_at', i.due_at, 'overdue', (i.due_at IS NOT NULL AND i.due_at <= v_at AND i.state IN ('open', 'escalated')), 'escalations', i.escalations,
                              'created_at', i.created_at, 'in_context', ((v_scn IS NOT NULL AND i.subject_kind = 'scenario' AND i.subject_id = v_scn) OR (v_obj IS NOT NULL AND i.subject_kind = 'strategy_object' AND i.subject_id = v_obj)),
                              'details', i.details - 'by') AS j,
           row_number() OVER (ORDER BY ((v_scn IS NOT NULL AND i.subject_kind = 'scenario' AND i.subject_id = v_scn) OR (v_obj IS NOT NULL AND i.subject_kind = 'strategy_object' AND i.subject_id = v_obj)) DESC,
                                       (i.state = 'escalated') DESC, executive.attention_rank_key(i.evaluation -> 'dimensions'), i.due_at NULLS LAST, i.created_at DESC) AS ord
      FROM executive.attention_items i WHERE i.tenant_id = p_tenant AND i.domain_id = p_domain AND i.state IN ('open', 'escalated', 'unrouted', 'acknowledged') AND i.created_at <= v_at) x WHERE ord <= v_limit;
  IF v_holds_tbl THEN
    EXECUTE 'SELECT count(*)::int FROM executive.attention_queue_holds h WHERE h.tenant_id = $1 AND h.domain_id = $2 AND h.released_at IS NULL' INTO v_held USING p_tenant, p_domain;
  END IF;
  -- INTELLIGENCE: the newest signals (B28) under the ceiling; the hidden ones counted
  SELECT count(*) FILTER (WHERE simulation.classification_rank(s.classification) <= simulation.classification_rank(v_ceiling)), count(*) FILTER (WHERE simulation.classification_rank(s.classification) > simulation.classification_rank(v_ceiling))
    INTO v_int_n, v_int_hidden FROM prediction.signals_current s WHERE s.tenant_id = p_tenant AND s.domain_id = p_domain AND s.maturity <> 'invalid' AND s.created_at <= v_at;
  SELECT coalesce(jsonb_agg(jsonb_build_object('signal_id', s.signal_id, 'title', s.title, 'maturity', s.maturity, 'novelty', s.novelty, 'confidence', s.confidence, 'classification', s.classification, 'disposition', s.disposition,
                                               'independent_sources', s.independent_sources, 'as_of', s.as_of, 'updated_at', s.updated_at, 'synthetic_state', s.synthetic_state) ORDER BY s.updated_at DESC), '[]'::jsonb) INTO v_int
    FROM (SELECT * FROM prediction.signals_current s WHERE s.tenant_id = p_tenant AND s.domain_id = p_domain AND s.maturity <> 'invalid' AND s.created_at <= v_at
            AND simulation.classification_rank(s.classification) <= simulation.classification_rank(v_ceiling) ORDER BY s.updated_at DESC LIMIT v_limit) s;
  -- WARNINGS: raised or acknowledged, inside their response window at the as-of
  SELECT count(*) INTO v_wrn_n FROM prediction.warnings_current w WHERE w.tenant_id = p_tenant AND w.domain_id = p_domain AND w.state IN ('raised', 'acknowledged') AND w.response_window_opens_at <= v_at AND w.response_window_closes_at > v_at;
  SELECT coalesce(jsonb_agg(jsonb_build_object('warning_id', w.warning_id, 'title', w.title, 'state', w.state, 'confidence', w.confidence, 'consequence', w.consequence, 'routed_to', w.routed_to,
                                               'opens_at', w.response_window_opens_at, 'closes_at', w.response_window_closes_at, 'raised_at', w.raised_at, 'branch_id', w.branch_id, 'acknowledged_by', w.acknowledged_by) ORDER BY w.response_window_closes_at), '[]'::jsonb) INTO v_wrn
    FROM (SELECT * FROM prediction.warnings_current w WHERE w.tenant_id = p_tenant AND w.domain_id = p_domain AND w.state IN ('raised', 'acknowledged') AND w.response_window_opens_at <= v_at AND w.response_window_closes_at > v_at
           ORDER BY w.response_window_closes_at LIMIT v_limit) w;
  -- DECISIONS: the rooms (every kind) and the packages in flight without a room, each with its gate state when the gates part's read exists
  FOR r IN
    SELECT x.* FROM (
      SELECT m.room_id, m.kind, m.subject_id, m.deadline, m.title, m.owner_principal_id AS owner, m.package_id, m.next_review_at, m.opened_at AS since, p.state AS package_state, p.current_version, p.decision_class,
             (m.deadline IS NOT NULL AND m.deadline <= v_at) AS overdue, (m.next_review_at <= v_at) AS review_overdue,
             (v_obj IS NULL OR (m.kind = 'objective_review' AND m.subject_id = v_obj) OR m.kind = 'scenario'
                OR (m.package_id IS NOT NULL AND EXISTS (SELECT 1 FROM decision.package_versions v WHERE v.package_id = m.package_id AND v.version = coalesce(p.current_version, 1) AND v.objectives ? v_obj::text))) AS obj_ok,
             (v_scn IS NULL OR m.kind <> 'scenario' OR m.subject_id = v_scn) AS scn_ok
        FROM executive.rooms_current m LEFT JOIN decision.packages_current p ON p.package_id = m.package_id
       WHERE m.tenant_id = p_tenant AND m.domain_id = p_domain AND m.opened_at <= v_at
      UNION ALL
      SELECT NULL::uuid, 'decision', NULL::uuid, NULL::timestamptz, p.title, p.owner_principal_id, p.package_id, NULL::timestamptz, p.declared_at, p.state, p.current_version, p.decision_class, false, false,
             (v_obj IS NULL OR EXISTS (SELECT 1 FROM decision.package_versions v WHERE v.package_id = p.package_id AND v.version = coalesce(p.current_version, 1) AND v.objectives ? v_obj::text)), true
        FROM decision.packages_current p
       WHERE p.tenant_id = p_tenant AND p.domain_id = p_domain AND p.state IN ('proposed', 'under_review', 'approved') AND p.declared_at <= v_at
         AND NOT EXISTS (SELECT 1 FROM executive.rooms_current m WHERE m.package_id = p.package_id)) x
    ORDER BY x.overdue DESC, x.review_overdue DESC, x.deadline NULLS LAST, x.since DESC
  LOOP
    IF NOT (r.obj_ok AND r.scn_ok) THEN v_dec_dropped := v_dec_dropped + 1; CONTINUE; END IF;
    v_dec_n := v_dec_n + 1;
    IF v_dec_n > v_limit THEN CONTINUE; END IF;
    v_gate := NULL;
    IF v_gate_fn AND r.package_id IS NOT NULL THEN EXECUTE 'SELECT decision.gate_state_of($1, $2)' INTO v_gate USING r.package_id, coalesce(r.current_version, 1); END IF;
    v_dec := v_dec || jsonb_build_object('room_id', r.room_id, 'kind', r.kind, 'subject_id', r.subject_id, 'deadline', r.deadline, 'overdue', r.overdue, 'title', r.title, 'owner', r.owner, 'package_id', r.package_id,
                                         'package_state', r.package_state, 'current_version', r.current_version, 'decision_class', r.decision_class, 'next_review_at', r.next_review_at, 'review_overdue', r.review_overdue, 'since', r.since,
                                         'gate', v_gate, 'gate_basis', CASE WHEN v_gate IS NOT NULL THEN 'decision.gate_state_of' WHEN r.package_id IS NOT NULL THEN 'the version state (the gates part''s read is absent)' ELSE 'a subject room has no gate' END);
  END LOOP;
  -- COMMITMENTS: the tracker's live items overdue or due inside the horizon (the objective filter on their objectives)
  SELECT count(*) INTO v_cmt_n FROM decision.commitment_tracker(p_tenant, p_domain, v_at) t
   WHERE t.state IN ('open', 'in_progress', 'exception', 'retask_required') AND (t.overdue OR t.due_at <= v_at + v_span) AND (v_obj IS NULL OR v_obj = ANY (t.objectives));
  SELECT coalesce(jsonb_agg(jsonb_build_object('item_id', t.item_id, 'commitment_id', t.commitment_id, 'package_id', t.package_id, 'package_title', t.package_title, 'kind', t.kind, 'title', t.title, 'owner', t.owner, 'reviewer', t.reviewer,
                                               'due_at', t.due_at, 'state', t.state, 'overdue', t.overdue, 'open_exceptions', t.open_exceptions, 'severity', t.severity, 'reasons', to_jsonb(t.reasons), 'objectives', to_jsonb(t.objectives)) ORDER BY t.overdue DESC, t.due_at), '[]'::jsonb) INTO v_cmt
    FROM (SELECT * FROM decision.commitment_tracker(p_tenant, p_domain, v_at) t
           WHERE t.state IN ('open', 'in_progress', 'exception', 'retask_required') AND (t.overdue OR t.due_at <= v_at + v_span) AND (v_obj IS NULL OR v_obj = ANY (t.objectives)) ORDER BY t.overdue DESC, t.due_at LIMIT v_limit) t;
  -- OUTCOMES: recorded since the cycle opened (or inside the horizon when no cycle is open), the objective filter through the version's objectives
  SELECT count(*) INTO v_out_n FROM decision.outcomes o WHERE o.tenant_id = p_tenant AND o.domain_id = p_domain AND o.recorded_at > v_since AND o.recorded_at <= v_at
     AND (v_obj IS NULL OR EXISTS (SELECT 1 FROM decision.package_versions v WHERE v.package_id = o.package_id AND v.version = o.version AND v.objectives ? v_obj::text));
  SELECT coalesce(jsonb_agg(jsonb_build_object('outcome_id', o.outcome_id, 'package_id', o.package_id, 'package_title', p.title, 'version', o.version, 'criterion_key', o.criterion_key, 'met', o.met, 'observed_value', o.observed_value,
                                               'target', o.target, 'comparator', o.comparator, 'unit', o.unit, 'recorded_at', o.recorded_at, 'recorded_by', o.recorded_by, 'simulated', o.simulated IS NOT NULL) ORDER BY o.recorded_at DESC), '[]'::jsonb) INTO v_out
    FROM (SELECT * FROM decision.outcomes o WHERE o.tenant_id = p_tenant AND o.domain_id = p_domain AND o.recorded_at > v_since AND o.recorded_at <= v_at
            AND (v_obj IS NULL OR EXISTS (SELECT 1 FROM decision.package_versions v WHERE v.package_id = o.package_id AND v.version = o.version AND v.objectives ? v_obj::text)) ORDER BY o.recorded_at DESC LIMIT v_limit) o
    JOIN decision.packages_current p ON p.package_id = o.package_id;
  RETURN jsonb_build_object(
    'read_at', clock_timestamp(), 'as_of', v_at, 'context', v_ctx_ref, 'ceiling', jsonb_build_object('reader', v_reader_ceiling, 'context', v_ctx ->> 'classification', 'effective', v_ceiling), 'limit', v_limit,
    'sections', jsonb_build_object(
      'priorities', jsonb_build_object('as_of', v_at, 'count', v_pri_n, 'items', v_pri, 'context', v_ctx ->> 'digest',
        'limitations', (SELECT jsonb_agg(l) FROM unnest(array_remove(ARRAY[
          'the queue as the reader''s own scope shows it (RLS); ranked by the evaluated dimensions, the context''s subjects first',
          CASE WHEN v_held > 0 THEN format('the queue is HELD (%s hold(s) in force)', v_held) END,
          CASE WHEN NOT v_holds_tbl THEN 'queue holds not read (the attention part''s executive.attention_queue_holds is absent)' END,
          CASE WHEN v_pri_n > v_limit THEN format('%s of %s shown', v_limit, v_pri_n) END], NULL)) l)),
      'intelligence', jsonb_build_object('as_of', v_at, 'count', v_int_n, 'items', v_int, 'context', v_ctx ->> 'digest',
        'limitations', (SELECT jsonb_agg(l) FROM unnest(array_remove(ARRAY[
          'the weak signals (B28) not invalid at the as-of; claims of the window are the intelligence workspace''s and are not composed here',
          CASE WHEN v_int_hidden > 0 THEN format('%s signal(s) above the %s ceiling hidden', v_int_hidden, v_ceiling) ELSE format('ceiling %s: nothing hidden', v_ceiling) END,
          CASE WHEN v_int_n > v_limit THEN format('%s of %s shown', v_limit, v_int_n) END], NULL)) l)),
      'warnings', jsonb_build_object('as_of', v_at, 'count', v_wrn_n, 'items', v_wrn, 'context', v_ctx ->> 'digest',
        'limitations', (SELECT jsonb_agg(l) FROM unnest(array_remove(ARRAY['warnings raised or acknowledged whose response window is open at the as-of', CASE WHEN v_wrn_n > v_limit THEN format('%s of %s shown', v_limit, v_wrn_n) END], NULL)) l)),
      'decisions', jsonb_build_object('as_of', v_at, 'count', v_dec_n, 'items', v_dec, 'context', v_ctx ->> 'digest',
        'limitations', (SELECT jsonb_agg(l) FROM unnest(array_remove(ARRAY[
          'the rooms of every kind and the packages in flight without a room; the gate state is the gates part''s read when present',
          CASE WHEN NOT v_gate_fn THEN 'gate states not read (decision.gate_state_of is absent): the package version state stands in' END,
          CASE WHEN v_dec_dropped > 0 THEN format('%s room(s)/package(s) outside the context (objective %s, scenario %s) filtered out', v_dec_dropped, coalesce(v_obj::text, 'any'), coalesce(v_scn::text, 'any')) END,
          CASE WHEN v_dec_n > v_limit THEN format('%s of %s shown', v_limit, v_dec_n) END], NULL)) l)),
      'commitments', jsonb_build_object('as_of', v_at, 'count', v_cmt_n, 'items', v_cmt, 'context', v_ctx ->> 'digest',
        'limitations', (SELECT jsonb_agg(l) FROM unnest(array_remove(ARRAY[
          format('the tracker''s live items overdue or due within the horizon %s', v_hz), CASE WHEN v_obj IS NOT NULL THEN format('filtered to the items linked to objective %s', v_obj) END,
          CASE WHEN v_cmt_n > v_limit THEN format('%s of %s shown', v_limit, v_cmt_n) END], NULL)) l)),
      'outcomes', jsonb_build_object('as_of', v_at, 'count', v_out_n, 'items', v_out, 'context', v_ctx ->> 'digest', 'since', v_since,
        'limitations', (SELECT jsonb_agg(l) FROM unnest(array_remove(ARRAY[
          CASE WHEN v_cad_open IS NULL THEN format('no cadence is open: the outcomes of the last %s', v_hz) ELSE format('the outcomes recorded since the open cadence opened (%s)', v_cad_open ->> 'opened_at') END,
          CASE WHEN v_obj IS NOT NULL THEN format('filtered to the versions naming objective %s', v_obj) END,
          CASE WHEN v_out_n > v_limit THEN format('%s of %s shown', v_limit, v_out_n) END], NULL)) l)),
      'cadence', jsonb_build_object('as_of', v_at, 'count', CASE WHEN v_cad_open IS NULL THEN 0 ELSE 1 END, 'open', v_cad_open, 'last_closed', v_cad -> 'last_closed', 'agenda', v_cad -> 'agenda', 'escalations', v_cad -> 'escalations', 'context', v_ctx ->> 'digest',
        'closed_since', CASE WHEN v_cad_open IS NULL THEN NULL ELSE executive.cadence_closing_record(p_tenant, p_domain, (v_cad_open ->> 'opened_at')::timestamptz, v_at) END,
        'limitations', (SELECT jsonb_agg(l) FROM unnest(array_remove(ARRAY[CASE WHEN v_cad_open IS NULL THEN 'no cadence is open; the executive or the operator opens one' END, 'the loop reset closes the cycle with this record and opens the next'], NULL)) l))));
END $$;
GRANT EXECUTE ON FUNCTION executive.home(uuid, uuid, uuid, text, int) TO eye_app, eye_commit;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §H6 THE COMMAND VIEWS (h2; CAP-EO-02/-04) and the context switcher's choices
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
CREATE TABLE executive.command_views (
  view_key     text PRIMARY KEY CHECK (view_key ~ '^[a-z_]+/[a-z-]+$'),
  role_code    text NOT NULL REFERENCES identity.roles(code),
  moment       text NOT NULL CHECK (moment ~ '^[a-z-]{3,40}$'),
  title        text NOT NULL CHECK (length(btrim(title)) BETWEEN 3 AND 120),
  description  text NOT NULL CHECK (length(btrim(description)) >= 8),
  sections     text[] NOT NULL CHECK (cardinality(sections) >= 1 AND sections <@ executive.home_section_names()),
  actions      text[] NOT NULL DEFAULT '{}',
  since        text NOT NULL,
  UNIQUE (role_code, moment)
);
CREATE TRIGGER xcvw_append_only BEFORE UPDATE OR DELETE ON executive.command_views FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
REVOKE ALL ON executive.command_views FROM PUBLIC;
GRANT SELECT ON executive.command_views TO eye_app, eye_commit;
COMMENT ON TABLE executive.command_views IS 'B36 §H (0094; CAP-EO-02/-04): the ROLE × MOMENT command views — which sections of the home and which safe actions each shows; a person sees only the views of roles they hold. The actions are the product''s own governed acts (each its own PDP action); a view offers, never authorises.';
INSERT INTO executive.command_views (view_key, role_code, moment, title, description, sections, actions, since) VALUES
  ('executive/morning', 'executive', 'morning', 'The executive''s morning', 'What needs the executive first thing: the ranked queue, the warnings inside their window, the newest signals, the decisions in flight.',
   ARRAY['priorities', 'warnings', 'intelligence', 'decisions'], ARRAY['acknowledge_item', 'open_room', 'set_context'], '0094'),
  ('executive/board-day', 'executive', 'board-day', 'Board day', 'The board-class decisions and their gate, the commitments the board will ask about, the outcomes of the cycle, the cadence to reset after.',
   ARRAY['decisions', 'commitments', 'outcomes', 'cadence'], ARRAY['read_board', 'reset_cadence', 'set_context'], '0094'),
  ('executive_operator/cadence-prep', 'executive_operator', 'cadence-prep', 'Cadence preparation (chief of staff)', 'The operator prepares the cycle: the agenda from the queue, the decisions and the tracker; the gaps escalated; nothing decided here.',
   ARRAY['cadence', 'priorities', 'decisions', 'commitments'], ARRAY['set_agenda', 'route_work', 'escalate_gap'], '0094'),
  ('decision_owner/review', 'decision_owner', 'review', 'The decision owner''s review', 'The owner''s rooms and packages with their gate, the commitments due, the warnings that touch them.',
   ARRAY['decisions', 'commitments', 'warnings'], ARRAY['record_review', 'open_room'], '0094');

/* The views a person may open: those of the roles they hold in this domain (the platform administrator sees every view). */
CREATE OR REPLACE FUNCTION executive.command_views_for(p_tenant uuid, p_domain uuid, p_principal uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = executive, pg_catalog, pg_temp AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('view_key', v.view_key, 'role_code', v.role_code, 'moment', v.moment, 'title', v.title, 'description', v.description, 'sections', to_jsonb(v.sections), 'actions', to_jsonb(v.actions)) ORDER BY v.view_key), '[]'::jsonb)
    FROM executive.command_views v WHERE executive.holds_role(p_principal, p_tenant, p_domain, ARRAY[v.role_code, 'platform_admin'])
$$;
GRANT EXECUTE ON FUNCTION executive.command_views_for(uuid, uuid, uuid) TO eye_app, eye_commit;

/* A command view composed from the SAME read as the home: the view's sections of executive.home, the safe actions it offers, the
   context named. Unknown view → 404; a view of a role the reader does not hold → 403 (the platform administrator holds every view). */
CREATE OR REPLACE FUNCTION executive.command_view(p_tenant uuid, p_domain uuid, p_principal uuid, p_ceiling text, p_view_key text, p_limit int) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = executive, pg_catalog, pg_temp AS $$
DECLARE v executive.command_views%ROWTYPE; h jsonb; s text; v_sections jsonb := '{}'::jsonb;
BEGIN
  SELECT * INTO v FROM executive.command_views x WHERE x.view_key = p_view_key;
  IF NOT FOUND THEN RAISE EXCEPTION 'command view rejected (unknown_view): no command view % (the views are role/moment: executive/morning, executive/board-day, executive_operator/cadence-prep, decision_owner/review)', coalesce(p_view_key, '<none>') USING ERRCODE = '23503'; END IF;
  IF NOT executive.holds_role(p_principal, p_tenant, p_domain, ARRAY[v.role_code, 'platform_admin']) THEN
    RAISE EXCEPTION 'command view rejected (role): the view % is the %''s; the reader holds no such role in this domain', p_view_key, v.role_code USING ERRCODE = '42501';
  END IF;
  h := executive.home(p_tenant, p_domain, p_principal, p_ceiling, p_limit);
  FOREACH s IN ARRAY v.sections LOOP v_sections := v_sections || jsonb_build_object(s, h -> 'sections' -> s); END LOOP;
  RETURN jsonb_build_object('view_key', v.view_key, 'role_code', v.role_code, 'moment', v.moment, 'title', v.title, 'description', v.description, 'sections_order', to_jsonb(v.sections), 'actions', to_jsonb(v.actions),
                            'read_at', h -> 'read_at', 'as_of', h -> 'as_of', 'context', h -> 'context', 'ceiling', h -> 'ceiling', 'sections', v_sections);
END $$;
GRANT EXECUTE ON FUNCTION executive.command_view(uuid, uuid, uuid, text, text, int) TO eye_app, eye_commit;

/* THE SWITCHER's choices: the objectives (graph OBJ) and the scenarios of the domain with their staleness (a retired / closed objective, a
   closed scenario is shown stale and cannot be set — §0's set_context refuses a retired or withdrawn objective; the route refuses a closed
   one and a closed scenario before the port is reached, with the same family `context rejected (stale)`). */
CREATE OR REPLACE FUNCTION executive.context_choices(p_tenant uuid, p_domain uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = executive, graph, prediction, pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object(
    'objectives', coalesce((SELECT jsonb_agg(jsonb_build_object('id', s.strategy_object_id, 'title', s.title, 'status', s.status, 'owner', s.owner_principal_id, 'stale', s.status <> 'active') ORDER BY (s.status <> 'active'), s.title)
                              FROM graph.strategy_current s WHERE s.tenant_id = p_tenant AND s.domain_id = p_domain AND s.object_type = 'OBJ'), '[]'::jsonb),
    'scenarios', coalesce((SELECT jsonb_agg(jsonb_build_object('id', x.scenario_id, 'title', x.title, 'state', x.state, 'owner', x.owner_principal_id, 'stale', x.state <> 'active') ORDER BY (x.state <> 'active'), x.title)
                             FROM prediction.scenarios_current x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain), '[]'::jsonb),
    'horizons', jsonb_build_array('30d', '90d', '12m', '36m'), 'classifications', jsonb_build_array('public', 'internal', 'confidential', 'restricted'), 'as_of', clock_timestamp())
$$;
GRANT EXECUTE ON FUNCTION executive.context_choices(uuid, uuid) TO eye_app, eye_commit;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §H7 THE EXECUTIVE SEARCH with explanation (h4) and its access ledger
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
CREATE TABLE executive.search_events (
  search_id      uuid PRIMARY KEY,
  scope          text NOT NULL,
  tenant_id      uuid NOT NULL,
  domain_id      uuid NOT NULL,
  principal_id   uuid NOT NULL,
  query          text NOT NULL CHECK (length(query) BETWEEN 2 AND 200),
  context_digest text CHECK (context_digest IS NULL OR context_digest ~ '^[0-9a-f]{64}$'),
  hits           int  NOT NULL CHECK (hits >= 0),
  kinds          jsonb NOT NULL DEFAULT '{}'::jsonb,
  searched_at    timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id uuid NOT NULL,
  CONSTRAINT xse_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX xse_principal ON executive.search_events (tenant_id, domain_id, principal_id, searched_at);
CREATE TRIGGER xse_append_only BEFORE UPDATE OR DELETE ON executive.search_events FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE executive.search_events IS 'B36 §H (0094): the executive search''s ACCESS LEDGER — who searched what, when, under which context, how many hits per kind; no result bodies; append-only.';

/* THE SEARCH: pg full text ('simple') over rooms, briefings (v1–v3; a BRF@v3 edition only for a reader inside its audience contract),
   packages, commitment items, attention items, warnings and reviews — under the reader's own RLS (never a hit the reader could not open);
   each hit with its lifecycle / gate state and an EXPLANATION: the field that matched, the terms that matched, the hit's as-of, the
   context filter it was read under (a hit linked to the context's objective sorts first). Invoker-bound, STABLE. */
CREATE OR REPLACE FUNCTION executive.search(p_tenant uuid, p_domain uuid, p_principal uuid, p_q text, p_limit int) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = executive, decision, prediction, graph, observation, pg_catalog, pg_temp AS $$
DECLARE v_q text := btrim(coalesce(p_q, '')); v_ts tsquery; v_terms text[]; v_ctx jsonb; v_obj uuid; v_at timestamptz; v_limit int := least(greatest(coalesce(p_limit, 20), 1), 100);
        v_gate_fn boolean := to_regprocedure('decision.gate_state_of(uuid,int)') IS NOT NULL; r record; v_hits jsonb := '[]'::jsonb; v_n int := 0; v_kinds jsonb := '{}'::jsonb; v_gate jsonb; v_matched text[]; v_field text;
BEGIN
  IF length(v_q) NOT BETWEEN 2 AND 200 THEN RAISE EXCEPTION 'search rejected (query): a query is 2–200 characters' USING ERRCODE = '22023'; END IF;
  v_ts := plainto_tsquery('simple', v_q);
  v_terms := ARRAY(SELECT DISTINCT lower(t) FROM regexp_split_to_table(v_q, '\s+') t WHERE length(t) >= 2);
  v_ctx := executive.current_context(p_principal);
  v_obj := (v_ctx ->> 'objective_id')::uuid;
  v_at := coalesce((v_ctx ->> 'effective_at')::timestamptz, clock_timestamp());
  FOR r IN
    WITH hits AS (
      SELECT 'room'::text AS kind, m.room_id AS id, m.title, m.kind AS lifecycle, m.opened_at AS as_of, m.title AS f_title, ''::text AS f_body, NULL::uuid AS package_id, NULL::int AS version,
             ((m.kind = 'objective_review' AND m.subject_id = v_obj) OR (m.package_id IS NOT NULL AND EXISTS (SELECT 1 FROM decision.package_versions v JOIN decision.packages_current p ON p.package_id = v.package_id WHERE v.package_id = m.package_id AND v.version = coalesce(p.current_version, 1) AND v.objectives ? v_obj::text))) AS linked
        FROM executive.rooms_current m WHERE m.tenant_id = p_tenant AND m.domain_id = p_domain
      UNION ALL
      SELECT 'briefing', b.briefing_id, coalesce(left(b.narrative, 120), 'briefing ' || b.schema_version || ' of ' || b.composed_at::date), CASE WHEN b.expires_at IS NOT NULL AND b.expires_at <= v_at THEN 'expired' ELSE 'current' END, b.composed_at,
             coalesce(b.narrative, ''), coalesce(b.items::text, ''), b.package_id, NULL, false
        FROM executive.briefings b WHERE b.tenant_id = p_tenant AND b.domain_id = p_domain
         AND (b.audience IS NULL OR jsonb_typeof(b.audience -> 'roles') <> 'array' OR jsonb_array_length(b.audience -> 'roles') = 0
              OR executive.holds_role(p_principal, p_tenant, p_domain, ARRAY(SELECT jsonb_array_elements_text(b.audience -> 'roles'))))
      UNION ALL
      SELECT 'package', p.package_id, p.title, p.state, p.declared_at, p.title, p.statement, p.package_id, coalesce(p.current_version, 1),
             EXISTS (SELECT 1 FROM decision.package_versions v WHERE v.package_id = p.package_id AND v.version = coalesce(p.current_version, 1) AND v.objectives ? v_obj::text)
        FROM decision.packages_current p WHERE p.tenant_id = p_tenant AND p.domain_id = p_domain
      UNION ALL
      SELECT 'commitment_item', i.item_id, i.title, i.state, i.created_at, i.title, '', i.package_id, NULL, v_obj = ANY (i.objective_ids)
        FROM decision.commitment_items i WHERE i.tenant_id = p_tenant AND i.domain_id = p_domain
      UNION ALL
      SELECT 'attention_item', a.item_id, a.title, a.state, a.created_at, a.title, coalesce(a.details ->> 'detail', a.details ->> 'reason', ''), NULL, NULL, (a.subject_kind = 'strategy_object' AND a.subject_id = v_obj)
        FROM executive.attention_items a WHERE a.tenant_id = p_tenant AND a.domain_id = p_domain
      UNION ALL
      SELECT 'warning', w.warning_id, w.title, w.state, w.raised_at, w.title, w.consequence, NULL, NULL, false
        FROM prediction.warnings_current w WHERE w.tenant_id = p_tenant AND w.domain_id = p_domain
      UNION ALL
      SELECT 'review', v.review_id, coalesce(v.subject_title, left(v.question, 120)), v.state, v.convened_at, v.question, coalesce(v.subject_title, ''), NULL, NULL, (v.subject_kind = 'objective' AND v.subject_id = v_obj)
        FROM executive.reviews v WHERE v.tenant_id = p_tenant AND v.domain_id = p_domain)
    SELECT h.*, (to_tsvector('simple', h.f_title) @@ v_ts OR h.f_title ILIKE '%' || v_q || '%') AS title_hit
      FROM hits h
     WHERE h.as_of <= v_at AND (to_tsvector('simple', h.f_title || ' ' || h.f_body) @@ v_ts OR h.f_title ILIKE '%' || v_q || '%' OR h.f_body ILIKE '%' || v_q || '%')
     ORDER BY (v_obj IS NOT NULL AND h.linked) DESC, h.as_of DESC
  LOOP
    v_n := v_n + 1;
    v_kinds := v_kinds || jsonb_build_object(r.kind, coalesce((v_kinds ->> r.kind)::int, 0) + 1);
    IF v_n > v_limit THEN CONTINUE; END IF;
    v_matched := ARRAY(SELECT t FROM unnest(v_terms) t WHERE lower(r.f_title || ' ' || r.f_body) LIKE '%' || t || '%');
    v_field := CASE WHEN r.title_hit THEN 'title' WHEN r.kind = 'package' THEN 'statement' WHEN r.kind = 'briefing' THEN 'narrative/items' WHEN r.kind = 'review' THEN 'question' WHEN r.kind = 'warning' THEN 'consequence' ELSE 'details' END;
    v_gate := NULL;
    IF v_gate_fn AND r.kind = 'package' THEN EXECUTE 'SELECT decision.gate_state_of($1, $2)' INTO v_gate USING r.package_id, r.version; END IF;
    v_hits := v_hits || jsonb_build_object('kind', r.kind, 'id', r.id, 'title', r.title, 'state', r.lifecycle, 'gate', v_gate, 'as_of', r.as_of, 'package_id', r.package_id,
      'explanation', jsonb_build_object('field', v_field, 'terms', to_jsonb(v_matched), 'query', v_q, 'as_of', r.as_of, 'read_at', v_at,
                                        'context_filter', CASE WHEN v_obj IS NULL THEN 'no objective context: every kind of the domain, newest first'
                                                               WHEN r.linked THEN format('linked to the context''s objective %s (shown first)', v_obj)
                                                               ELSE format('outside the context''s objective %s (shown after the linked hits)', v_obj) END,
                                        'context_digest', v_ctx ->> 'digest', 'why', format('%s matched in %s: %s', array_to_string(v_matched, ', '), v_field, CASE WHEN r.title_hit THEN r.f_title ELSE left(r.f_body, 160) END)));
  END LOOP;
  RETURN jsonb_build_object('query', v_q, 'as_of', v_at, 'context', jsonb_build_object('digest', v_ctx ->> 'digest', 'objective_id', v_obj), 'count', v_n, 'kinds', v_kinds, 'hits', v_hits, 'limit', v_limit,
                            'limitations', jsonb_build_array('under the reader''s own scope (RLS) — never a hit the reader could not open', 'a BRF@v3 edition only inside its audience contract', 'full text (simple) and substring on the title and the body; no external index'));
END $$;
GRANT EXECUTE ON FUNCTION executive.search(uuid, uuid, uuid, text, int) TO eye_app, eye_commit;

/* THE PORT that reads and records: the search runs, then ONE ledger row (who, what, when, the context, the hit counts per kind). The
   acting principal is the reader; a search is a governed act (executive.search) so its access is on the ledger. */
CREATE OR REPLACE FUNCTION executive.record_search(p_search_id uuid, p_tenant uuid, p_domain uuid, p_q text, p_limit int, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, decision, prediction, graph, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.search']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'search rejected (actor): searched by the acting principal' USING ERRCODE = '42501'; END IF;
  v := executive.search(p_tenant, p_domain, p_actor, p_q, p_limit);
  INSERT INTO executive.search_events (search_id, scope, tenant_id, domain_id, principal_id, query, context_digest, hits, kinds, correlation_id)
  VALUES (p_search_id, 'DOMAIN', p_tenant, p_domain, p_actor, v ->> 'query', v #>> ARRAY['context', 'digest'], (v ->> 'count')::int, v -> 'kinds', p_correlation);
  RETURN v || jsonb_build_object('search_id', p_search_id);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.record_search(uuid,uuid,uuid,text,int,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.record_search(uuid,uuid,uuid,text,int,uuid,uuid) TO eye_commit;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §H8 THE EXECUTIVE METRICS (h6): computed on read from the ledgers; nothing stored
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
/* time_to_understanding: an item's first routing (item.routed / escalated / unrouted) → the first human act on it (acknowledged,
   suppressed, delegated, closed, a suppression requested, or an act launched); median and p90 in seconds over the items routed in the
   window that received an act (the ones without one counted). decision_latency: the version's proposal → its commitment, over the
   commitments of the window. review_completion: the governed reviews convened in the window with a due instant — concluded by it — as a
   ratio; the rooms whose deadline fell in the window and were reviewed before it, likewise. Each metric names its population and its as-of. */
CREATE OR REPLACE FUNCTION executive.metrics(p_tenant uuid, p_domain uuid, p_from timestamptz, p_to timestamptz) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = executive, decision, pg_catalog, pg_temp AS $$
  WITH routed AS (
    SELECT e.item_id, min(e.occurred_at) AS routed_at FROM executive.attention_item_events e
     WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain AND e.event IN ('item.routed', 'item.escalated', 'item.unrouted') AND e.occurred_at >= p_from AND e.occurred_at < p_to GROUP BY e.item_id),
  acted AS (
    SELECT r.item_id, r.routed_at,
           least((SELECT min(x.occurred_at) FROM executive.attention_item_events x WHERE x.item_id = r.item_id AND x.occurred_at > r.routed_at AND x.event IN ('item.acknowledged', 'item.suppressed', 'item.delegated', 'item.closed', 'item.suppression_requested')),
                 (SELECT min(a.launched_at) FROM executive.attention_item_acts a WHERE a.item_id = r.item_id AND a.launched_at > r.routed_at)) AS acted_at
      FROM routed r),
  ttu AS (SELECT count(*) AS n_routed, count(acted_at) AS n_acted,
                 percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM acted_at - routed_at)) AS median_s,
                 percentile_cont(0.9) WITHIN GROUP (ORDER BY extract(epoch FROM acted_at - routed_at)) AS p90_s FROM acted),
  lat AS (SELECT count(*) AS n, percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM c.committed_at - v.proposed_at)) AS median_s, percentile_cont(0.9) WITHIN GROUP (ORDER BY extract(epoch FROM c.committed_at - v.proposed_at)) AS p90_s
            FROM decision.commitments c JOIN decision.package_versions v ON v.package_id = c.package_id AND v.version = c.version
           WHERE c.tenant_id = p_tenant AND c.domain_id = p_domain AND c.committed_at >= p_from AND c.committed_at < p_to AND v.proposed_at IS NOT NULL),
  rev AS (SELECT count(*) AS convened, count(*) FILTER (WHERE v.state = 'concluded' AND v.closed_at <= v.due_at) AS within, count(*) FILTER (WHERE v.state = 'convened' AND v.due_at < p_to) AS overdue_open
            FROM executive.reviews v WHERE v.tenant_id = p_tenant AND v.domain_id = p_domain AND v.convened_at >= p_from AND v.convened_at < p_to AND v.due_at IS NOT NULL),
  rms AS (SELECT count(*) AS with_deadline, count(*) FILTER (WHERE m.last_review_at IS NOT NULL AND m.last_review_at <= m.deadline) AS reviewed_before
            FROM executive.rooms_current m WHERE m.tenant_id = p_tenant AND m.domain_id = p_domain AND m.deadline >= p_from AND m.deadline < p_to)
  SELECT jsonb_build_object(
    'as_of', clock_timestamp(), 'window', jsonb_build_object('from', p_from, 'to', p_to),
    'metrics', jsonb_build_array(
      jsonb_build_object('name', 'time_to_understanding', 'unit', 'seconds', 'population', 'attention items first routed in the window (item.routed / item.escalated / item.unrouted)',
                         'n', (SELECT n_routed FROM ttu), 'n_acted', (SELECT n_acted FROM ttu), 'n_without_act', (SELECT n_routed - n_acted FROM ttu),
                         'median', (SELECT round(median_s::numeric, 3) FROM ttu), 'p90', (SELECT round(p90_s::numeric, 3) FROM ttu),
                         'basis', 'the routing event → the first human act on the item (acknowledged, suppressed, delegated, closed, a suppression requested, an act launched); items without an act are counted, not measured', 'as_of', clock_timestamp()),
      jsonb_build_object('name', 'decision_latency', 'unit', 'seconds', 'population', 'commitments recorded in the window whose version was proposed',
                         'n', (SELECT n FROM lat), 'median', (SELECT round(median_s::numeric, 3) FROM lat), 'p90', (SELECT round(p90_s::numeric, 3) FROM lat),
                         'basis', 'the version''s proposal (package_versions.proposed_at) → its commitment (commitments.committed_at)', 'as_of', clock_timestamp()),
      jsonb_build_object('name', 'review_completion', 'unit', 'ratio', 'population', 'governed reviews convened in the window with a due instant; the rooms whose deadline fell in the window',
                         'n', (SELECT convened FROM rev), 'within_deadline', (SELECT within FROM rev), 'overdue_open', (SELECT overdue_open FROM rev),
                         'ratio', (SELECT CASE WHEN convened = 0 THEN NULL ELSE round(within::numeric / convened, 3) END FROM rev),
                         'rooms', jsonb_build_object('with_deadline', (SELECT with_deadline FROM rms), 'reviewed_before_deadline', (SELECT reviewed_before FROM rms),
                                                     'ratio', (SELECT CASE WHEN with_deadline = 0 THEN NULL ELSE round(reviewed_before::numeric / with_deadline, 3) END FROM rms)),
                         'basis', 'a review concluded at or before its due instant counts as completed; a room reviewed (last_review_at) at or before its deadline likewise', 'as_of', clock_timestamp())),
    'stored', false)
$$;
GRANT EXECUTE ON FUNCTION executive.metrics(uuid, uuid, timestamptz, timestamptz) TO eye_app, eye_commit;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §H9 RLS AND THE GRANTS (the 0081 loop idiom; the ports write)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['cadence_events', 'cadence_agenda', 'cadence_escalations', 'search_events'] LOOP
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

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §H2b executive.convene_review RE-DECLARED — 0084 §4 lines 198–281 copied WHOLE, with ONE change (marked /* B36 (0094 §H2) home */):
--      an objective review keeps its separation of duties — the objective's owner is neither its chair nor a reviewer.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
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
  -- B36 (0094 §H2) home, the ONE change: an OBJECTIVE review keeps its separation of duties — the objective's owner is neither its chair nor a reviewer.
  IF p_subject_kind = 'objective' AND EXISTS (SELECT 1 FROM graph.strategy_current s WHERE s.strategy_object_id = p_subject_id AND s.tenant_id = p_tenant AND s.domain_id = p_domain
                                                  AND (s.owner_principal_id = p_chair OR s.owner_principal_id = ANY (coalesce(p_reviewers, '{}'::uuid[])))) THEN
    RAISE EXCEPTION 'objective review rejected (separation_of_duties): the owner of objective % is neither its review''s chair nor a reviewer; another person reviews it', p_subject_id USING ERRCODE = '42501';
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

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §H4b executive.delegate_attention_item RE-DECLARED — 0086 §G lines 1714–1766 copied WHOLE, with ONE change (marked /* B36 (0094 §H4) home */):
--      the executive operator routes an attention item through the existing delegation port (never a new write path).
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
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
  IF NOT ((x.owner_principal_id IS NOT NULL AND x.owner_principal_id = p_actor) OR executive.holds_role(p_actor, p_tenant, p_domain, x.route_roles || ARRAY['domain_admin', 'platform_admin'])
          OR executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['executive_operator']) /* B36 (0094 §H4) home, the ONE change: the executive operator (PER-03) routes work through this port */) THEN
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

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §H4c executive.reassign_human_task RE-DECLARED — 0090 §W3 lines 5779–5813 copied WHOLE, with ONE change (marked /* B36 (0094 §H4) home */):
--      the executive operator reassigns a human task through the existing port (the refusal text names the operator too).
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION executive.reassign_human_task(p_task uuid, p_tenant uuid, p_domain uuid, p_to uuid, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE t executive.human_tasks%ROWTYPE; v_roles text[];
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.task.reassign']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'human task rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF coalesce(length(btrim(p_reason)), 0) < 8 THEN RAISE EXCEPTION 'human task rejected (reason): a reassignment states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  SELECT * INTO t FROM executive.human_tasks x WHERE x.task_id = p_task AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'human task rejected (unknown_task): no task % in this domain', p_task USING ERRCODE = '23503'; END IF;
  IF t.state NOT IN ('open', 'escalated') THEN RAISE EXCEPTION 'human task rejected (closed): task % is %', p_task, t.state USING ERRCODE = '23505'; END IF;
  IF p_actor IS DISTINCT FROM t.assignee_principal_id AND NOT executive.holds_any_role(p_actor, p_tenant, p_domain, ARRAY['executive', 'domain_admin', 'executive_operator' /* B36 (0094 §H4) home, the ONE change: the executive operator (PER-03) routes work through this port */]) THEN
    RAISE EXCEPTION 'human task rejected (not_assignee): a task is reassigned by its assignee, an executive, an executive operator or a domain administrator' USING ERRCODE = '42501';
  END IF;
  IF p_to IS NULL OR NOT decision.is_active_human(p_to, p_tenant) THEN
    RAISE EXCEPTION 'human task rejected (not_member): % is not an active member of this tenant — reassignment moves work to a member', p_to USING ERRCODE = '22023';
  END IF;
  IF p_to = t.assignee_principal_id THEN RAISE EXCEPTION 'human task rejected (unchanged): % already holds task %', p_to, p_task USING ERRCODE = '22023'; END IF;
  IF t.kind LIKE 'gate.%' THEN
    SELECT ARRAY(SELECT jsonb_array_elements_text(coalesce(t.eligibility -> 'roles', '[]'::jsonb))) INTO v_roles;
    IF (cardinality(v_roles) > 0 AND NOT executive.holds_any_role(p_to, p_tenant, p_domain, v_roles))
       OR coalesce(t.eligibility -> 'exclude', '[]'::jsonb) ? p_to::text THEN
      RAISE EXCEPTION 'human task rejected (not_eligible): % does not meet the stored eligibility of the % task (roles %, exclusions) — reassignment moves work, never authority',
        p_to, t.kind, array_to_string(v_roles, ', ') USING ERRCODE = '22023';
    END IF;
  END IF;
  UPDATE executive.human_tasks SET assignee_principal_id = p_to, updated_at = clock_timestamp() WHERE task_id = p_task;
  INSERT INTO executive.human_task_assignments (assignment_id, scope, tenant_id, domain_id, task_id, from_principal, to_principal, reason, actor_principal_id, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_task, t.assignee_principal_id, p_to, 'reassign', p_actor, p_correlation);
  INSERT INTO executive.human_task_events (event_id, scope, tenant_id, domain_id, task_id, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_task, 'task.reassigned', p_actor, jsonb_build_object('from', t.assignee_principal_id, 'to', p_to, 'reason', btrim(p_reason)), p_correlation);
  RETURN jsonb_build_object('task_id', p_task, 'from', t.assignee_principal_id, 'to', p_to, 'state', t.state, 'deadline_at', t.deadline_at);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.reassign_human_task(uuid, uuid, uuid, uuid, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.reassign_human_task(uuid, uuid, uuid, uuid, text, uuid, uuid) TO eye_commit;
