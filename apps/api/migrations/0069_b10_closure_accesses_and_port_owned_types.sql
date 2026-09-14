-- 0069 — CP-6 B10 closure (Codex's bounded review at 48f7bdc, 2026-09-13; the author's adversarial review of the closure candidate).
--   §1 B10-F2: the accesses a composition recorded on the memory items' ledger are bound to the BRIEFING ROW (executive.briefings.memory_accesses:
--      item, version, access id) — outside the content and its digest, and not by the envelope's correlation id, which a causal chain
--      shares across requests and which nothing makes unique. executive.compose_briefing takes them; the previous signature is dropped.
--   §2 B10-F4: observation.canonical_write_exclusions — a type whose writes are its own port's (MEM: memory.item.record/supersede;
--      BRF: briefing.compose) is not admitted by the generic Phase 0 actions objects.create / objects.correct, whatever the caller's
--      role; objects.admit_version (0022's body) gains the check. The generic actions stay NULL-typed for every other type (Phase 0).

-- ============================================================
-- §1 the composition's accesses on the briefing row
-- ============================================================
ALTER TABLE executive.briefings ADD COLUMN IF NOT EXISTS memory_accesses jsonb NOT NULL DEFAULT '[]'::jsonb;
DROP FUNCTION IF EXISTS executive.compose_briefing(uuid,uuid,uuid,uuid,uuid,uuid,text,uuid,timestamptz,uuid,jsonb,jsonb,jsonb,jsonb,jsonb,boolean,text,jsonb,text,text,jsonb,uuid,uuid);
CREATE OR REPLACE FUNCTION executive.compose_briefing(
  p_briefing_id uuid, p_tenant uuid, p_domain uuid, p_room_id uuid, p_package_id uuid, p_composer uuid, p_via text, p_agent_id uuid, p_known_at timestamptz,
  p_prior uuid, p_watermark jsonb, p_sources jsonb, p_items jsonb, p_windows jsonb, p_source_states jsonb, p_degraded boolean,
  p_narrative text, p_narrative_cites jsonb, p_content_digest text, p_header_digest text, p_controls jsonb, p_event_id uuid, p_correlation uuid,
  p_memory_accesses jsonb
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
                                   narrative, narrative_cites, content_digest, header_digest, controls, correlation_id, memory_accesses)
  VALUES (p_briefing_id, 'DOMAIN', p_tenant, p_domain, p_room_id, p_package_id, p_composer, p_via, p_agent_id, p_known_at, p_prior, p_watermark, p_sources, p_items, p_windows, coalesce(p_source_states, '[]'::jsonb), coalesce(p_degraded, false),
          p_narrative, CASE WHEN p_narrative IS NULL THEN '[]'::jsonb ELSE coalesce(p_narrative_cites, '[]'::jsonb) END, p_content_digest, p_header_digest, coalesce(p_controls, '{}'::jsonb), p_correlation, coalesce(p_memory_accesses, '[]'::jsonb));
  IF p_room_id IS NOT NULL THEN
    INSERT INTO executive.room_events (event_id, scope, tenant_id, domain_id, room_id, event, actor_principal_id, details, correlation_id)
    VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_room_id, 'briefing.composed', p_composer,
            jsonb_build_object('briefing_id', p_briefing_id, 'prior_briefing_id', p_prior, 'known_at', p_known_at, 'content_digest', p_content_digest, 'items', jsonb_array_length(p_items), 'degraded', coalesce(p_degraded, false), 'via', p_via), p_correlation);
  END IF;
  RETURN jsonb_build_object('briefing_id', p_briefing_id, 'content_digest', p_content_digest);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.compose_briefing(uuid,uuid,uuid,uuid,uuid,uuid,text,uuid,timestamptz,uuid,jsonb,jsonb,jsonb,jsonb,jsonb,boolean,text,jsonb,text,text,jsonb,uuid,uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.compose_briefing(uuid,uuid,uuid,uuid,uuid,uuid,text,uuid,timestamptz,uuid,jsonb,jsonb,jsonb,jsonb,jsonb,boolean,text,jsonb,text,text,jsonb,uuid,uuid,jsonb) TO eye_commit;

-- ============================================================
-- §2 the generic actions do not admit a port-owned, audience-governed type
-- ============================================================
CREATE TABLE IF NOT EXISTS observation.canonical_write_exclusions (
  action       text NOT NULL REFERENCES observation.canonical_write_actions(action),
  object_type  text NOT NULL,
  rationale    text NOT NULL,
  PRIMARY KEY (action, object_type)
);
INSERT INTO observation.canonical_write_exclusions (action, object_type, rationale) VALUES
  ('objects.create',  'MEM', 'a memory item is recorded by a knowledge owner through memory.item.record (its projection, ledger and audience are the port''s)'),
  ('objects.correct', 'MEM', 'a memory item is superseded by the record authority through memory.item.supersede (human-gated; the prior version replayable)'),
  ('objects.create',  'BRF', 'a briefing is composed through briefing.compose (its snapshot, controls and accesses are the port''s)'),
  ('objects.correct', 'BRF', 'a briefing is an immutable snapshot; a later briefing supersedes it through briefing.compose')
ON CONFLICT (action, object_type) DO NOTHING;
REVOKE ALL ON observation.canonical_write_exclusions FROM PUBLIC;
GRANT SELECT ON observation.canonical_write_exclusions TO eye_commit;
CREATE OR REPLACE FUNCTION objects.admit_version(
  p_header jsonb, p_payload jsonb, p_digest text
) RETURNS TABLE (object_id uuid, object_version bigint, content_digest text)
SECURITY DEFINER SET search_path = objects, observation, canon, ctx, public, pg_catalog, pg_temp
AS $$
DECLARE
  v_missing text; v_extra text; v_recomputed text;
  v_scope text := p_header->>'scope';
  v_tenant uuid := NULLIF(p_header->>'tenant_id','')::uuid;
  v_domain uuid := NULLIF(p_header->>'domain_id','')::uuid;
  v_action text := public.eye_bound_action();
  v_types text[];
  v_known boolean;
BEGIN
  IF public.eye_ctx_mode() <> 'authority' THEN
    RAISE EXCEPTION 'admission rejected: authority mode required (context is %)',
      public.eye_ctx_mode() USING ERRCODE = '42501';
  END IF;
  SELECT true, w.object_types INTO v_known, v_types
    FROM observation.canonical_write_actions w WHERE w.action = v_action;
  IF v_known IS NOT TRUE THEN
    RAISE EXCEPTION 'admission rejected: context is bound to action %, not a canonical write',
      coalesce(v_action,'<none>') USING ERRCODE = '42501';
  END IF;
  IF v_types IS NOT NULL AND NOT ((p_header->>'object_type') = ANY (v_types)) THEN
    RAISE EXCEPTION 'admission rejected: action % may not admit a % object',
      v_action, p_header->>'object_type' USING ERRCODE = '42501';
  END IF;
  -- 0069 §2 (B10-F4): a type whose writes are its own port's is NOT admitted by a generic action, whatever the caller's role.
  IF EXISTS (SELECT 1 FROM observation.canonical_write_exclusions x WHERE x.action = v_action AND x.object_type = (p_header->>'object_type')) THEN
    RAISE EXCEPTION 'admission rejected: action % may not admit a % object — it is written through its own port (%)',
      v_action, p_header->>'object_type', (SELECT x.rationale FROM observation.canonical_write_exclusions x WHERE x.action = v_action AND x.object_type = (p_header->>'object_type')) USING ERRCODE = '42501';
  END IF;
  PERFORM ctx.assert_live_authority();
  PERFORM objects.assert_header_binding(p_header);

  SELECT string_agg(field_name, ', ') INTO v_missing
    FROM objects.canonical_field_registry r WHERE NOT (p_header ? r.field_name);
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'admission rejected: header missing required field(s): %', v_missing
      USING ERRCODE = '22023';
  END IF;
  SELECT string_agg(k, ', ') INTO v_extra
    FROM jsonb_object_keys(p_header) AS k
   WHERE NOT EXISTS (SELECT 1 FROM objects.canonical_field_registry r WHERE r.field_name = k);
  IF v_extra IS NOT NULL THEN
    RAISE EXCEPTION 'admission rejected: header carries unregistered field(s): %', v_extra
      USING ERRCODE = '22023';
  END IF;

  PERFORM objects.assert_header_semantics(p_header);

  v_recomputed := canon.sha256_hex(canon.jcs(jsonb_build_object('header', p_header, 'payload', p_payload)));
  IF p_digest IS DISTINCT FROM v_recomputed THEN
    RAISE EXCEPTION 'admission rejected: content digest does not bind the header and payload'
      USING ERRCODE = '42501';
  END IF;
  IF NOT ((public.eye_scope() = 'PLATFORM' AND v_scope = 'PLATFORM' AND v_tenant IS NULL)
          OR public.eye_row_writable(v_scope, v_tenant, v_domain)) THEN
    RAISE EXCEPTION 'admission rejected: context not authorized for the object scope'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO objects.canonical_objects (
    object_id, object_type, tenant_id, domain_id, scope, object_version, lifecycle_state,
    owning_component, accountable_owner, source_object_ids, event_time, observation_time,
    valid_from, valid_to, recorded_at, time_precision, source_clock_quality, truth_state,
    synthetic_state, confidence, uncertainty, evidence_refs, provenance_ref, method_ref,
    contradiction_refs, corroboration_refs, human_refs, classification, purpose_scope,
    rights_profile, residency_profile, retention_profile, access_policy_ref, quality_profile,
    quality_state, freshness_state, schema_ref, ontology_ref, correction_of, supersedes,
    withdrawal_reason, audit_correlation_id, content_ref, payload, content_digest
  ) VALUES (
    (p_header->>'object_id')::uuid, p_header->>'object_type', v_tenant, v_domain, v_scope,
    (p_header->>'object_version')::bigint, p_header->>'lifecycle_state',
    p_header->>'owning_component', p_header->>'accountable_owner',
    coalesce(p_header->'source_object_ids','[]'::jsonb),
    NULLIF(p_header->>'event_time','')::timestamptz, NULLIF(p_header->>'observation_time','')::timestamptz,
    NULLIF(p_header->>'valid_from','')::timestamptz, NULLIF(p_header->>'valid_to','')::timestamptz,
    (p_header->>'recorded_at')::timestamptz, p_header->>'time_precision',
    p_header->>'source_clock_quality', p_header->>'truth_state',
    (p_header->>'synthetic_state')::boolean, p_header->'confidence', p_header->'uncertainty',
    coalesce(p_header->'evidence_refs','[]'::jsonb), p_header->>'provenance_ref', p_header->>'method_ref',
    coalesce(p_header->'contradiction_refs','[]'::jsonb), coalesce(p_header->'corroboration_refs','[]'::jsonb),
    coalesce(p_header->'human_refs','[]'::jsonb), p_header->>'classification', p_header->>'purpose_scope',
    p_header->>'rights_profile', p_header->>'residency_profile', p_header->>'retention_profile',
    p_header->>'access_policy_ref', p_header->>'quality_profile', p_header->'quality_state',
    p_header->'freshness_state', p_header->>'schema_ref', p_header->>'ontology_ref',
    p_header->>'correction_of', p_header->>'supersedes', p_header->>'withdrawal_reason',
    (p_header->>'audit_correlation_id')::uuid, p_header->>'content_ref',
    p_payload, v_recomputed
  );
  RETURN QUERY SELECT (p_header->>'object_id')::uuid, (p_header->>'object_version')::bigint, v_recomputed;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION objects.admit_version(jsonb, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION objects.admit_version(jsonb, jsonb, text) TO eye_commit;
