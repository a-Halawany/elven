-- 0044 · Phase 6, P6-M4 — the executive schema: decision rooms, membership, cadence,
-- review events, and briefings composed deterministically from stored records
-- (PHASE6_BUILD_PLAN.md §3 briefing and room rows; F4; §6a rules 7 and 11).
--
-- A room is a governed space per package: named members with roles, a cadence
-- (review_every_days, next_review_at) and events. It mirrors the package's state and
-- adds nothing to the package's authority. A briefing is an immutable snapshot whose
-- COMPARISON BASELINE IS BOUND: it records the prior briefing it follows (or none)
-- and the reader's known_at as its watermark, enumerates the source records it was
-- composed from, and carries a content digest over those and its items — so
-- recomposing with the same watermark and known_at yields the same digest, and a
-- later briefing follows the recorded one, never "whatever is newest now". A
-- narrative, when present, is labelled and cites only included items; it is stored
-- beside the content and is not part of the content digest. Retrieval is governed
-- like composition: a room briefing is read by the room's members, under the
-- reader's own authority at read time.
--
--   §1  schema, rooms, members, events
--   §2  briefings (append-only), agents registry (rows come with P6-M6)
--   §3  ports: open_room, set_membership, set_cadence, record_review, compose_briefing
--   §4  BRF@v1; briefing.compose → ['BRF']; RLS
-- ============================================================
CREATE SCHEMA IF NOT EXISTS executive;
GRANT USAGE ON SCHEMA executive TO eye_app, eye_commit;

-- ============================================================
-- 1. Rooms.
-- ============================================================
CREATE TABLE executive.rooms_current (
  room_id             uuid PRIMARY KEY,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  package_id          uuid NOT NULL UNIQUE REFERENCES decision.packages_current(package_id),
  title               text NOT NULL CHECK (length(btrim(title)) BETWEEN 2 AND 256),
  owner_principal_id  uuid NOT NULL,
  review_every_days   int  NOT NULL CHECK (review_every_days BETWEEN 1 AND 365),
  next_review_at      timestamptz NOT NULL,
  last_review_at      timestamptz,
  opened_by           uuid NOT NULL,
  opened_at           timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id      uuid NOT NULL,
  CONSTRAINT xrm_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);

CREATE TABLE executive.room_members (
  room_id             uuid NOT NULL REFERENCES executive.rooms_current(room_id),
  principal_id        uuid NOT NULL,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  role                text NOT NULL CHECK (role IN ('owner', 'approver', 'dissenter', 'observer')),
  added_by            uuid NOT NULL,
  added_at            timestamptz NOT NULL DEFAULT clock_timestamp(),
  removed_at          timestamptz,
  removed_by          uuid,
  PRIMARY KEY (room_id, principal_id),
  CONSTRAINT xmb_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);

CREATE TABLE executive.room_events (
  event_id            uuid PRIMARY KEY,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  room_id             uuid NOT NULL,
  event               text NOT NULL CHECK (event IN ('room.opened', 'member.added', 'member.removed', 'cadence.set', 'review.recorded', 'briefing.composed', 'review.overdue', 'condition.breached', 'agent.escalated')),
  actor_principal_id  uuid NOT NULL,
  details             jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id      uuid NOT NULL,
  CONSTRAINT xre_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX xre_room ON executive.room_events (room_id, occurred_at);
CREATE TRIGGER xre_append_only BEFORE UPDATE OR DELETE ON executive.room_events
  FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

-- ============================================================
-- 2. Briefings and the agents registry.
-- ============================================================
CREATE TABLE executive.briefings (
  briefing_id         uuid PRIMARY KEY,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  room_id             uuid REFERENCES executive.rooms_current(room_id),
  package_id          uuid,
  composed_by         uuid NOT NULL,
  composed_via        text NOT NULL CHECK (composed_via IN ('human', 'agent')),
  agent_id            uuid,
  /* The reader's record-time cut-off the briefing was composed under. */
  known_at            timestamptz NOT NULL,
  /* The prior briefing this one follows — bound, never "the newest now". NULL = none. */
  prior_briefing_id   uuid REFERENCES executive.briefings(briefing_id),
  watermark           jsonb NOT NULL CHECK (jsonb_typeof(watermark) = 'object'),
  sources             jsonb NOT NULL CHECK (jsonb_typeof(sources) = 'array'),
  items               jsonb NOT NULL CHECK (jsonb_typeof(items) = 'array'),
  windows             jsonb NOT NULL CHECK (jsonb_typeof(windows) = 'array'),
  source_states       jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(source_states) = 'array'),
  degraded            boolean NOT NULL DEFAULT false,
  narrative           text,
  narrative_cites     jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(narrative_cites) = 'array'),
  content_digest      text NOT NULL CHECK (content_digest ~ '^[0-9a-f]{64}$'),
  header_digest       text NOT NULL CHECK (header_digest ~ '^[0-9a-f]{64}$'),
  controls            jsonb NOT NULL DEFAULT '{}'::jsonb,
  composed_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id      uuid NOT NULL,
  CONSTRAINT xbr_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT xbr_narrative_pair CHECK (narrative IS NOT NULL OR narrative_cites = '[]'::jsonb),
  CONSTRAINT xbr_agent_pair CHECK ((composed_via = 'agent') = (agent_id IS NOT NULL))
);
CREATE INDEX xbr_room ON executive.briefings (room_id, composed_at);
CREATE INDEX xbr_domain ON executive.briefings (tenant_id, domain_id, composed_at);
CREATE TRIGGER xbr_append_only BEFORE UPDATE OR DELETE ON executive.briefings
  FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

/* The three bounded Phase 6 agents. Registration, budgets, sessions and refusals arrive with P6-M6. */
CREATE TABLE executive.agents (
  agent_id                uuid PRIMARY KEY,
  scope                   text NOT NULL,
  tenant_id               uuid NOT NULL,
  domain_id               uuid NOT NULL,
  principal_id            uuid NOT NULL UNIQUE,   -- identity.principals, kind='agent'
  agent_kind              text NOT NULL CHECK (agent_kind IN ('decision', 'briefing', 'reporting')),
  agent_version           text NOT NULL CHECK (agent_version ~ '^[0-9]+\.[0-9]+\.[0-9]+$'),
  code_digest             text NOT NULL CHECK (code_digest ~ '^[0-9a-f]{64}$'),
  owner_principal_id      uuid NOT NULL,           -- the accountable human
  escalation_principal_id uuid NOT NULL,           -- the named human a stop escalates to
  budgets                 jsonb NOT NULL CHECK (jsonb_typeof(budgets) = 'object'),
  stop_conditions         jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(stop_conditions) = 'array'),
  status                  text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  created_by              uuid NOT NULL,
  created_at              timestamptz NOT NULL DEFAULT clock_timestamp(),
  revoked_at              timestamptz,
  correlation_id          uuid NOT NULL,
  CONSTRAINT xag_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);

-- ============================================================
-- 3. Ports.
-- ============================================================
/* Owner or a live member. */
CREATE OR REPLACE FUNCTION executive.is_member(p_room uuid, p_principal uuid) RETURNS boolean
STABLE SECURITY DEFINER SET search_path = executive, pg_catalog, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM executive.rooms_current r WHERE r.room_id = p_room AND r.owner_principal_id = p_principal)
      OR EXISTS (SELECT 1 FROM executive.room_members m WHERE m.room_id = p_room AND m.principal_id = p_principal AND m.removed_at IS NULL);
$$ LANGUAGE sql;
REVOKE ALL ON FUNCTION executive.is_member(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.is_member(uuid, uuid) TO eye_app, eye_commit;

CREATE OR REPLACE FUNCTION executive.open_room(
  p_room_id uuid, p_tenant uuid, p_domain uuid, p_package_id uuid, p_title text, p_review_every_days int, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE p record; v_next timestamptz;
BEGIN
  PERFORM observation.assert_authority(ARRAY['room.open']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'room rejected: a room is opened by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO p FROM decision.packages_current x WHERE x.package_id = p_package_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'room rejected: no such package in this domain' USING ERRCODE = '23503'; END IF;
  IF p.owner_principal_id <> p_actor THEN RAISE EXCEPTION 'room rejected: a room is opened by the package owner (principal %)', p.owner_principal_id USING ERRCODE = '42501'; END IF;
  IF NOT decision.is_active_human(p_actor, p_tenant) THEN RAISE EXCEPTION 'room rejected: the owner must be a named, active human principal' USING ERRCODE = '42501'; END IF;
  IF EXISTS (SELECT 1 FROM executive.rooms_current r WHERE r.package_id = p_package_id) THEN RAISE EXCEPTION 'room rejected: the package already has a room' USING ERRCODE = '22023'; END IF;
  IF p_review_every_days IS NULL OR p_review_every_days < 1 OR p_review_every_days > 365 THEN RAISE EXCEPTION 'room rejected: review_every_days must be between 1 and 365' USING ERRCODE = '22023'; END IF;
  v_next := clock_timestamp() + make_interval(days => p_review_every_days);
  INSERT INTO executive.rooms_current (room_id, scope, tenant_id, domain_id, package_id, title, owner_principal_id, review_every_days, next_review_at, opened_by, correlation_id)
  VALUES (p_room_id, 'DOMAIN', p_tenant, p_domain, p_package_id, p_title, p_actor, p_review_every_days, v_next, p_actor, p_correlation);
  INSERT INTO executive.room_members (room_id, principal_id, scope, tenant_id, domain_id, role, added_by)
  VALUES (p_room_id, p_actor, 'DOMAIN', p_tenant, p_domain, 'owner', p_actor);
  INSERT INTO executive.room_events (event_id, scope, tenant_id, domain_id, room_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_room_id, 'room.opened', p_actor, jsonb_build_object('package_id', p_package_id, 'title', p_title, 'review_every_days', p_review_every_days, 'next_review_at', v_next), p_correlation);
  RETURN jsonb_build_object('room_id', p_room_id, 'next_review_at', v_next);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.open_room(uuid,uuid,uuid,uuid,text,int,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.open_room(uuid,uuid,uuid,uuid,text,int,uuid,uuid,uuid) TO eye_commit;

CREATE OR REPLACE FUNCTION executive.set_membership(
  p_room_id uuid, p_tenant uuid, p_domain uuid, p_principal uuid, p_role text, p_op text, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS void
SECURITY DEFINER SET search_path = executive, decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r record;
BEGIN
  PERFORM observation.assert_authority(ARRAY['room.membership']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'membership rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO r FROM executive.rooms_current x WHERE x.room_id = p_room_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'membership rejected: no such room in this domain' USING ERRCODE = '23503'; END IF;
  IF r.owner_principal_id <> p_actor THEN RAISE EXCEPTION 'membership rejected: only the room owner changes membership' USING ERRCODE = '42501'; END IF;
  IF p_op NOT IN ('add', 'remove') THEN RAISE EXCEPTION 'membership rejected: op is add or remove' USING ERRCODE = '22023'; END IF;
  IF p_op = 'add' THEN
    IF p_role NOT IN ('approver', 'dissenter', 'observer') THEN RAISE EXCEPTION 'membership rejected: a member is an approver, a dissenter or an observer; the owner is the owner' USING ERRCODE = '22023'; END IF;
    IF NOT decision.is_active_human(p_principal, p_tenant) THEN RAISE EXCEPTION 'membership rejected: members are named, active human principals; an agent is never a member' USING ERRCODE = '42501'; END IF;
    INSERT INTO executive.room_members (room_id, principal_id, scope, tenant_id, domain_id, role, added_by)
    VALUES (p_room_id, p_principal, 'DOMAIN', p_tenant, p_domain, p_role, p_actor)
    ON CONFLICT (room_id, principal_id) DO UPDATE SET role = EXCLUDED.role, removed_at = NULL, removed_by = NULL, added_by = EXCLUDED.added_by, added_at = clock_timestamp();
    INSERT INTO executive.room_events (event_id, scope, tenant_id, domain_id, room_id, event, actor_principal_id, details, correlation_id)
    VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_room_id, 'member.added', p_actor, jsonb_build_object('principal_id', p_principal, 'role', p_role), p_correlation);
  ELSE
    IF p_principal = r.owner_principal_id THEN RAISE EXCEPTION 'membership rejected: the owner is not removed from their room' USING ERRCODE = '22023'; END IF;
    UPDATE executive.room_members SET removed_at = clock_timestamp(), removed_by = p_actor WHERE room_id = p_room_id AND principal_id = p_principal AND removed_at IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'membership rejected: principal % is not a live member', p_principal USING ERRCODE = '23503'; END IF;
    INSERT INTO executive.room_events (event_id, scope, tenant_id, domain_id, room_id, event, actor_principal_id, details, correlation_id)
    VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_room_id, 'member.removed', p_actor, jsonb_build_object('principal_id', p_principal), p_correlation);
  END IF;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.set_membership(uuid,uuid,uuid,uuid,text,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.set_membership(uuid,uuid,uuid,uuid,text,text,uuid,uuid,uuid) TO eye_commit;

CREATE OR REPLACE FUNCTION executive.set_cadence(
  p_room_id uuid, p_tenant uuid, p_domain uuid, p_every_days int, p_next_review_at timestamptz, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r record; v_next timestamptz;
BEGIN
  PERFORM observation.assert_authority(ARRAY['room.cadence']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'cadence rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO r FROM executive.rooms_current x WHERE x.room_id = p_room_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'cadence rejected: no such room in this domain' USING ERRCODE = '23503'; END IF;
  IF r.owner_principal_id <> p_actor THEN RAISE EXCEPTION 'cadence rejected: only the room owner sets the cadence' USING ERRCODE = '42501'; END IF;
  IF p_every_days IS NULL OR p_every_days < 1 OR p_every_days > 365 THEN RAISE EXCEPTION 'cadence rejected: review_every_days must be between 1 and 365' USING ERRCODE = '22023'; END IF;
  v_next := coalesce(p_next_review_at, clock_timestamp() + make_interval(days => p_every_days));
  UPDATE executive.rooms_current SET review_every_days = p_every_days, next_review_at = v_next WHERE room_id = p_room_id;
  INSERT INTO executive.room_events (event_id, scope, tenant_id, domain_id, room_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_room_id, 'cadence.set', p_actor, jsonb_build_object('review_every_days', p_every_days, 'next_review_at', v_next), p_correlation);
  RETURN jsonb_build_object('review_every_days', p_every_days, 'next_review_at', v_next);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.set_cadence(uuid,uuid,uuid,int,timestamptz,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.set_cadence(uuid,uuid,uuid,int,timestamptz,uuid,uuid,uuid) TO eye_commit;

/* A review: a member's act, on the room's cadence; recorded on the room AND on the package. */
CREATE OR REPLACE FUNCTION executive.record_review(
  p_room_id uuid, p_tenant uuid, p_domain uuid, p_note text, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r record; v_now timestamptz := clock_timestamp(); v_next timestamptz; v_overdue boolean;
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.review']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'review rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO r FROM executive.rooms_current x WHERE x.room_id = p_room_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'review rejected: no such room in this domain' USING ERRCODE = '23503'; END IF;
  IF NOT executive.is_member(p_room_id, p_actor) THEN RAISE EXCEPTION 'review rejected: only a member of the room records its review' USING ERRCODE = '42501'; END IF;
  IF length(btrim(coalesce(p_note, ''))) < 4 THEN RAISE EXCEPTION 'review rejected: a note is required' USING ERRCODE = '22023'; END IF;
  v_overdue := r.next_review_at < v_now;
  v_next := v_now + make_interval(days => r.review_every_days);
  UPDATE executive.rooms_current SET last_review_at = v_now, next_review_at = v_next WHERE room_id = p_room_id;
  INSERT INTO executive.room_events (event_id, scope, tenant_id, domain_id, room_id, event, actor_principal_id, details, occurred_at, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_room_id, 'review.recorded', p_actor, jsonb_build_object('note', p_note, 'was_overdue', v_overdue, 'next_review_at', v_next), v_now, p_correlation);
  INSERT INTO decision.package_events (event_id, scope, tenant_id, domain_id, package_id, event, actor_principal_id, details, occurred_at, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, r.package_id, 'review.recorded', p_actor, jsonb_build_object('room_id', p_room_id, 'note', p_note, 'was_overdue', v_overdue), v_now, p_correlation);
  RETURN jsonb_build_object('reviewed_at', v_now, 'next_review_at', v_next, 'was_overdue', v_overdue);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.record_review(uuid,uuid,uuid,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.record_review(uuid,uuid,uuid,text,uuid,uuid,uuid) TO eye_commit;

/*
 * COMPOSE. The service composed the items from stored records under the reader's
 * known_at and a bound prior; the port binds the watermark: the prior must be a
 * briefing of the same room (or, for a domain briefing, of the same domain and no
 * room); the composer is a member of the room, or an active briefing agent of the
 * domain; a narrative cites only included items.
 */
CREATE OR REPLACE FUNCTION executive.compose_briefing(
  p_briefing_id uuid, p_tenant uuid, p_domain uuid, p_room_id uuid, p_package_id uuid, p_composer uuid, p_via text, p_agent_id uuid, p_known_at timestamptz,
  p_prior uuid, p_watermark jsonb, p_sources jsonb, p_items jsonb, p_windows jsonb, p_source_states jsonb, p_degraded boolean,
  p_narrative text, p_narrative_cites jsonb, p_content_digest text, p_header_digest text, p_controls jsonb, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r record; pr record; c jsonb; v_ids jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['briefing.compose']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_composer IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'briefing rejected: composed by the acting principal' USING ERRCODE = '42501'; END IF;
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
    IF pr.composed_at > p_known_at THEN RAISE EXCEPTION 'briefing rejected: the prior briefing was composed after this briefing''s known_at' USING ERRCODE = '22023'; END IF;
    IF (p_watermark ->> 'prior_briefing_id') IS DISTINCT FROM p_prior::text THEN RAISE EXCEPTION 'briefing rejected: the watermark does not name the prior it follows' USING ERRCODE = '22023'; END IF;
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
                                   narrative, narrative_cites, content_digest, header_digest, controls, correlation_id)
  VALUES (p_briefing_id, 'DOMAIN', p_tenant, p_domain, p_room_id, p_package_id, p_composer, p_via, p_agent_id, p_known_at, p_prior, p_watermark, p_sources, p_items, p_windows, coalesce(p_source_states, '[]'::jsonb), coalesce(p_degraded, false),
          p_narrative, CASE WHEN p_narrative IS NULL THEN '[]'::jsonb ELSE coalesce(p_narrative_cites, '[]'::jsonb) END, p_content_digest, p_header_digest, coalesce(p_controls, '{}'::jsonb), p_correlation);
  IF p_room_id IS NOT NULL THEN
    INSERT INTO executive.room_events (event_id, scope, tenant_id, domain_id, room_id, event, actor_principal_id, details, correlation_id)
    VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_room_id, 'briefing.composed', p_composer,
            jsonb_build_object('briefing_id', p_briefing_id, 'prior_briefing_id', p_prior, 'known_at', p_known_at, 'content_digest', p_content_digest, 'items', jsonb_array_length(p_items), 'degraded', coalesce(p_degraded, false), 'via', p_via), p_correlation);
  END IF;
  RETURN jsonb_build_object('briefing_id', p_briefing_id, 'content_digest', p_content_digest);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.compose_briefing(uuid,uuid,uuid,uuid,uuid,uuid,text,uuid,timestamptz,uuid,jsonb,jsonb,jsonb,jsonb,jsonb,boolean,text,jsonb,text,text,jsonb,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.compose_briefing(uuid,uuid,uuid,uuid,uuid,uuid,text,uuid,timestamptz,uuid,jsonb,jsonb,jsonb,jsonb,jsonb,boolean,text,jsonb,text,text,jsonb,uuid,uuid) TO eye_commit;

-- ============================================================
-- 4. BRF@v1, write action, RLS.
-- ============================================================
INSERT INTO observation.canonical_write_actions (action, object_types, rationale) VALUES
  ('briefing.compose', ARRAY['BRF'], 'Composing a briefing admits a briefing snapshot and nothing else')
ON CONFLICT (action) DO NOTHING;

INSERT INTO objects.schema_registry (object_type, schema_version, json_schema, compatibility) VALUES
('BRF', 'v1', '{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "additionalProperties": false,
  "required": ["room_id","package_id","watermark","sources","items","windows","source_states","degraded","content_digest","narrative","narrative_cites","composed_via"],
  "properties": {
    "room_id": { "type": ["string","null"] },
    "package_id": { "type": ["string","null"] },
    "watermark": { "type": "object", "required": ["prior_briefing_id","prior_composed_at","known_at"] },
    "sources": { "type": "array" },
    "items": { "type": "array", "items": { "type": "object", "required": ["item_id","kind","at","truth_state","source_state"] } },
    "windows": { "type": "array" },
    "source_states": { "type": "array" },
    "degraded": { "type": "boolean" },
    "content_digest": { "type": "string", "pattern": "^[0-9a-f]{64}$" },
    "narrative": { "type": ["string","null"] },
    "narrative_cites": { "type": "array" },
    "composed_via": { "enum": ["human","agent"] },
    "agent_id": { "type": ["string","null"] }
  }
}'::jsonb, 'backward')
ON CONFLICT DO NOTHING;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['rooms_current', 'room_members', 'room_events', 'briefings', 'agents'] LOOP
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
