-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0118 §CL-F — CP-6 B80: FORMS, ACTIONS, FEEDBACK (F-P7-E-05: UX-21-001..006, PAT-03, CMP-033..043, CMP-065..070, UX-24-001..006).
-- Part-local file (folded into the one 0118 at integration, after §TK); applies ALONE on 0001–0117 + the prelude (0118 §0).
--
-- THE FORM DRAFT (PAT-03 "Save draft — persist versioned work without implying submission; never label as approval"; UX-21-002/-003).
--   shell.drafts       one row per SAVED VERSION (or the one DISCARD tombstone) of a principal's draft of one form, per form key and
--                      subject (the object the form edits; '-' for a new one), in one tenant/domain. APPEND-ONLY: a save writes the next
--                      version (superseding the one it read — a stale save is refused), a discard writes a tombstone; nothing is updated.
--                      The payload is the form's own state, OPAQUE here: a draft is NEVER a submission — no submitted / approved / review
--                      state exists on it, no port reads it as the record it may later become, and the form's real act (registration,
--                      declaration…) is its own governed write with its own receipt. Every version carries the digest of its payload
--                      and an EXPIRY (database clock): an expired draft is no longer offered — its content is withheld from the read,
--                      and a save against it is refused `(expired)` (a new draft may be started).
--   RLS                FORCE; a principal reads ONLY ITS OWN rows in the bound tenant and domain (principal_id = eye_principal()) — a
--                      draft is personal, never shared, never visible to an administrator through the application roles.
--   ports              shell.draft_save / shell.draft_discard (SECURITY DEFINER, eye_commit; the bound action asserted, the scope of the
--                      established context asserted, the acting principal = eye_principal(), a NAMED HUMAN re-checked in the port — an
--                      agent or a system never drafts through the shell); shell.draft_read (definer read guarded by
--                      observation.assert_read_scope and the acting principal: the live draft's payload, or the state that withholds
--                      it — expired / discarded / none — with the version history). The drafts LIST is a plain select under RLS.
--   the ledger         every save and discard is recorded in shell.events (the prelude's ledger, the principal's own).
--   refusals           the class form `form draft rejected (<class>): …` — 403 actor · 404 unknown_draft · 409 stale|state|expired ·
--                      422 the rest. NOTE (the integrator): the noun `form draft` is not mapped centrally yet (observation-errors.ts).
--
-- THREE CLAIMS: construction (this file and phase6-drafts-b80.test.ts — every persona and draft there SYNTHETIC); demonstrated operation
-- (the act: a SYNTHETIC persona's draft on eye_demo); real acceptance (UX-21-006 → the shared recording path at B111, then H3) — never
-- claimed here.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- §CL-F.1 THE TABLE ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE shell.drafts (
  draft_id           uuid NOT NULL,
  version            int NOT NULL CHECK (version >= 1),
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  principal_id       uuid NOT NULL,
  form_key           text NOT NULL CHECK (form_key ~ '^[a-z][a-z0-9_.-]{2,80}$'),
  subject_key        text NOT NULL CHECK (length(subject_key) BETWEEN 1 AND 200 AND subject_key !~ '[[:cntrl:]]'),
  kind               text NOT NULL CHECK (kind IN ('saved', 'discarded')),
  schema_version     text CHECK (schema_version IS NULL OR schema_version ~ '^[A-Za-z0-9][A-Za-z0-9_.@-]{0,40}$'),
  payload            jsonb CHECK (payload IS NULL OR (jsonb_typeof(payload) = 'object' AND octet_length(payload::text) <= 262144)),
  payload_digest     text CHECK (payload_digest IS NULL OR payload_digest ~ '^[0-9a-f]{64}$'),
  summary            text CHECK (summary IS NULL OR length(summary) <= 200),
  step               int CHECK (step IS NULL OR step BETWEEN 0 AND 50),
  supersedes         int,
  reason             text CHECK (reason IS NULL OR length(reason) <= 500),
  saved_at           timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at         timestamptz NOT NULL,
  correlation_id     uuid NOT NULL,
  PRIMARY KEY (draft_id, version),
  CONSTRAINT shdr_shape CHECK ((kind = 'saved' AND payload IS NOT NULL AND payload_digest IS NOT NULL AND expires_at > saved_at)
                            OR (kind = 'discarded' AND payload IS NULL AND payload_digest IS NULL)),
  CONSTRAINT shdr_supersedes CHECK ((version = 1 AND supersedes IS NULL) OR (version > 1 AND supersedes = version - 1))
);
COMMENT ON TABLE shell.drafts IS 'B80 §CL-F (PAT-03): a principal''s versioned form drafts — personal, append-only, expiring; NEVER a submission (no submitted/approved state exists here; the form''s act is its own governed write).';
CREATE INDEX shdr_series ON shell.drafts (principal_id, tenant_id, domain_id, form_key, subject_key, saved_at DESC);
CREATE TRIGGER shdr_append_only BEFORE UPDATE OR DELETE ON shell.drafts FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
ALTER TABLE shell.drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE shell.drafts FORCE ROW LEVEL SECURITY;
/* a principal reads its OWN drafts, in the bound tenant and domain only */
CREATE POLICY shdr_own ON shell.drafts FOR SELECT TO eye_app, eye_commit
  USING (principal_id = public.eye_principal() AND tenant_id = public.eye_tenant() AND domain_id = public.eye_domain());
GRANT SELECT ON shell.drafts TO eye_app, eye_commit;

-- §CL-F.2 THE SHARED CHECKS ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* The acting principal of a draft port: the bound principal, a NAMED ACTIVE HUMAN (an agent or a system never drafts through the shell). */
CREATE OR REPLACE FUNCTION shell.draft_actor() RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = shell, pg_catalog, pg_temp AS $$
DECLARE v uuid := public.eye_principal();
BEGIN
  IF v IS NULL THEN
    RAISE EXCEPTION 'form draft rejected (actor): no principal is bound to this context' USING ERRCODE = '42501';
  END IF;
  IF onboarding.principal_kind(v) IS DISTINCT FROM 'human' THEN
    RAISE EXCEPTION 'form draft rejected (actor): a draft is a named person''s own work in progress; an agent or a system never drafts through the shell' USING ERRCODE = '42501';
  END IF;
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION shell.draft_actor() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION shell.draft_actor() TO eye_commit;

/* The digest of a payload (the jsonb text form — deterministic for one value). */
CREATE OR REPLACE FUNCTION shell.draft_digest(p jsonb) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$ SELECT encode(sha256(convert_to(p::text, 'UTF8')), 'hex') $$;
REVOKE ALL ON FUNCTION shell.draft_digest(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION shell.draft_digest(jsonb) TO eye_app, eye_commit;

-- §CL-F.3 SAVE ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* Save the principal's draft of one form (per subject). p_expected_version is the version the form READ (null: no live draft was read):
   a live draft at another version → (stale); an expired draft named by its version → (expired); the same content as the live version →
   answered `unchanged`, no new version. The TTL is seconds (1 s – 30 days; null: 7 days), on the database clock. */
CREATE OR REPLACE FUNCTION shell.draft_save(p_tenant uuid, p_domain uuid, p_form_key text, p_subject_key text, p_schema_version text, p_payload jsonb,
                                            p_summary text, p_step int, p_expected_version int, p_ttl_seconds int, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = shell, observation, pg_catalog, pg_temp AS $$
DECLARE
  v_actor uuid; v_subject text := coalesce(nullif(btrim(p_subject_key), ''), '-');
  l shell.drafts%ROWTYPE; v_found boolean := false; v_live boolean := false;
  v_now timestamptz := clock_timestamp(); v_ttl int := coalesce(p_ttl_seconds, 604800);
  v_id uuid; v_version int; v_digest text; v_expires timestamptz;
BEGIN
  PERFORM observation.assert_authority(ARRAY['shell.draft.save']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  v_actor := shell.draft_actor();
  IF p_form_key IS NULL OR p_form_key !~ '^[a-z][a-z0-9_.-]{2,80}$' THEN
    RAISE EXCEPTION 'form draft rejected (form_key): a form key is 3–81 lower-case letters, digits, dots, dashes and underscores (e.g. observation.source.register)' USING ERRCODE = '22023';
  END IF;
  IF length(v_subject) > 200 OR v_subject ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'form draft rejected (subject): the subject key is at most 200 printable characters' USING ERRCODE = '22023';
  END IF;
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'form draft rejected (payload): the draft is the form''s state as one object' USING ERRCODE = '22023';
  END IF;
  IF octet_length(p_payload::text) > 262144 THEN
    RAISE EXCEPTION 'form draft rejected (payload): a draft is at most 256 KiB (this one is % bytes)', octet_length(p_payload::text) USING ERRCODE = '22023';
  END IF;
  IF p_schema_version IS NOT NULL AND p_schema_version !~ '^[A-Za-z0-9][A-Za-z0-9_.@-]{0,40}$' THEN
    RAISE EXCEPTION 'form draft rejected (schema_version): the form''s payload schema is named like SRC-REG@v1' USING ERRCODE = '22023';
  END IF;
  IF p_summary IS NOT NULL AND length(p_summary) > 200 THEN
    RAISE EXCEPTION 'form draft rejected (summary): a summary is at most 200 characters' USING ERRCODE = '22023';
  END IF;
  IF p_step IS NOT NULL AND (p_step < 0 OR p_step > 50) THEN
    RAISE EXCEPTION 'form draft rejected (step): the step is 0–50' USING ERRCODE = '22023';
  END IF;
  IF v_ttl < 1 OR v_ttl > 2592000 THEN
    RAISE EXCEPTION 'form draft rejected (ttl): a draft is kept 1 second to 30 days' USING ERRCODE = '22023';
  END IF;
  -- one save at a time per series (the principal's draft of this form and subject)
  PERFORM pg_advisory_xact_lock(hashtextextended('shell.draft:' || v_actor || ':' || p_tenant || ':' || p_domain || ':' || p_form_key || ':' || v_subject, 0));
  SELECT * INTO l FROM shell.drafts d
   WHERE d.principal_id = v_actor AND d.tenant_id = p_tenant AND d.domain_id = p_domain AND d.form_key = p_form_key AND d.subject_key = v_subject
   ORDER BY d.saved_at DESC, d.version DESC LIMIT 1;
  v_found := FOUND;
  v_live := v_found AND l.kind = 'saved' AND l.expires_at > v_now;
  v_digest := shell.draft_digest(p_payload);
  IF v_live THEN
    IF p_expected_version IS DISTINCT FROM l.version THEN
      RAISE EXCEPTION 'form draft rejected (stale): your draft of % is at version % (saved %); this save read %', p_form_key, l.version, l.saved_at,
        coalesce(p_expected_version::text, 'no draft') USING ERRCODE = '23514';
    END IF;
    IF l.payload_digest = v_digest AND l.step IS NOT DISTINCT FROM p_step AND l.summary IS NOT DISTINCT FROM p_summary
       AND l.schema_version IS NOT DISTINCT FROM p_schema_version THEN
      RETURN jsonb_build_object('draft_id', l.draft_id, 'version', l.version, 'supersedes', l.supersedes, 'payload_digest', l.payload_digest, 'saved_at', l.saved_at,
        'expires_at', l.expires_at, 'form_key', l.form_key, 'subject_key', l.subject_key, 'unchanged', true, 'submission', false);
    END IF;
    v_id := l.draft_id; v_version := l.version + 1;
  ELSE
    IF v_found AND l.kind = 'saved' AND p_expected_version IS NOT NULL AND p_expected_version = l.version THEN
      RAISE EXCEPTION 'form draft rejected (expired): version % of your draft of % expired at %; its content is no longer offered — save it as a new draft (no expected version)',
        l.version, p_form_key, l.expires_at USING ERRCODE = '23514';
    END IF;
    IF p_expected_version IS NOT NULL THEN
      RAISE EXCEPTION 'form draft rejected (stale): you have no live draft of % at version % (start a new draft with no expected version)', p_form_key, p_expected_version USING ERRCODE = '23514';
    END IF;
    v_id := gen_random_uuid(); v_version := 1;
  END IF;
  v_expires := v_now + make_interval(secs => v_ttl);
  INSERT INTO shell.drafts (draft_id, version, tenant_id, domain_id, principal_id, form_key, subject_key, kind, schema_version, payload, payload_digest,
                            summary, step, supersedes, saved_at, expires_at, correlation_id)
  VALUES (v_id, v_version, p_tenant, p_domain, v_actor, p_form_key, v_subject, 'saved', p_schema_version, p_payload, v_digest,
          p_summary, p_step, CASE WHEN v_version > 1 THEN v_version - 1 END, v_now, v_expires, p_correlation);
  PERFORM shell.ledger(p_tenant, p_domain, v_actor, 'form_draft', v_id, v_version, 'shell.draft.saved',
    jsonb_build_object('form_key', p_form_key, 'subject_key', v_subject, 'payload_digest', v_digest, 'supersedes', CASE WHEN v_version > 1 THEN v_version - 1 END,
                       'expires_at', v_expires, 'submission', false), p_correlation);
  RETURN jsonb_build_object('draft_id', v_id, 'version', v_version, 'supersedes', CASE WHEN v_version > 1 THEN v_version - 1 END, 'payload_digest', v_digest,
    'saved_at', v_now, 'expires_at', v_expires, 'form_key', p_form_key, 'subject_key', v_subject, 'unchanged', false, 'submission', false);
END $$;
REVOKE ALL ON FUNCTION shell.draft_save(uuid, uuid, text, text, text, jsonb, text, int, int, int, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION shell.draft_save(uuid, uuid, text, text, text, jsonb, text, int, int, int, uuid) TO eye_commit;

-- §CL-F.4 DISCARD ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* Discard the principal's own draft (live or expired): a tombstone version; the content is no longer offered. Another principal's draft is
   answered as unknown (a draft's existence is personal too). */
CREATE OR REPLACE FUNCTION shell.draft_discard(p_tenant uuid, p_domain uuid, p_draft_id uuid, p_expected_version int, p_reason text, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = shell, observation, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid; l shell.drafts%ROWTYPE; v_now timestamptz := clock_timestamp();
BEGIN
  PERFORM observation.assert_authority(ARRAY['shell.draft.discard']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  v_actor := shell.draft_actor();
  IF p_reason IS NOT NULL AND length(p_reason) > 500 THEN
    RAISE EXCEPTION 'form draft rejected (reason): a reason is at most 500 characters' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('shell.draft.id:' || coalesce(p_draft_id::text, '-'), 0));
  SELECT * INTO l FROM shell.drafts d WHERE d.draft_id = p_draft_id AND d.principal_id = v_actor AND d.tenant_id = p_tenant AND d.domain_id = p_domain
   ORDER BY d.version DESC LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'form draft rejected (unknown_draft): no draft % of yours in this domain', coalesce(p_draft_id::text, '<null>') USING ERRCODE = '22023';
  END IF;
  IF l.kind = 'discarded' THEN
    RAISE EXCEPTION 'form draft rejected (state): draft % was discarded at %', p_draft_id, l.saved_at USING ERRCODE = '23514';
  END IF;
  IF p_expected_version IS DISTINCT FROM l.version THEN
    RAISE EXCEPTION 'form draft rejected (stale): draft % is at version %; this discard read %', p_draft_id, l.version, coalesce(p_expected_version::text, 'no version') USING ERRCODE = '23514';
  END IF;
  -- the series key is taken too, so a concurrent save of the same form waits for the tombstone
  PERFORM pg_advisory_xact_lock(hashtextextended('shell.draft:' || v_actor || ':' || p_tenant || ':' || p_domain || ':' || l.form_key || ':' || l.subject_key, 0));
  INSERT INTO shell.drafts (draft_id, version, tenant_id, domain_id, principal_id, form_key, subject_key, kind, schema_version, payload, payload_digest,
                            summary, step, supersedes, reason, saved_at, expires_at, correlation_id)
  VALUES (l.draft_id, l.version + 1, p_tenant, p_domain, v_actor, l.form_key, l.subject_key, 'discarded', l.schema_version, NULL, NULL,
          l.summary, NULL, l.version, nullif(btrim(coalesce(p_reason, '')), ''), v_now, v_now, p_correlation);
  PERFORM shell.ledger(p_tenant, p_domain, v_actor, 'form_draft', l.draft_id, l.version + 1, 'shell.draft.discarded',
    jsonb_build_object('form_key', l.form_key, 'subject_key', l.subject_key, 'discarded_version', l.version, 'was_expired', l.expires_at <= v_now), p_correlation);
  RETURN jsonb_build_object('draft_id', l.draft_id, 'version', l.version + 1, 'discarded_version', l.version, 'form_key', l.form_key, 'subject_key', l.subject_key,
    'discarded_at', v_now, 'state', 'discarded');
END $$;
REVOKE ALL ON FUNCTION shell.draft_discard(uuid, uuid, uuid, int, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION shell.draft_discard(uuid, uuid, uuid, int, text, uuid) TO eye_commit;

-- §CL-F.5 READ ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* The principal's draft of one form and subject (or one draft by id): state live | expired | discarded | none. The PAYLOAD is returned for a
   LIVE draft only (an expired or discarded draft's content is withheld); the version history (digests and instants, never payloads) always. */
CREATE OR REPLACE FUNCTION shell.draft_read(p_tenant uuid, p_domain uuid, p_form_key text, p_subject_key text, p_draft_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = shell, observation, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid := public.eye_principal(); v_subject text := coalesce(nullif(btrim(p_subject_key), ''), '-'); l shell.drafts%ROWTYPE;
        v_now timestamptz := clock_timestamp(); v_state text; v_versions jsonb;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'a form draft');
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'form draft rejected (actor): no principal is bound to this context' USING ERRCODE = '42501';
  END IF;
  IF p_draft_id IS NOT NULL THEN
    SELECT * INTO l FROM shell.drafts d WHERE d.draft_id = p_draft_id AND d.principal_id = v_actor AND d.tenant_id = p_tenant AND d.domain_id = p_domain
     ORDER BY d.version DESC LIMIT 1;
  ELSE
    SELECT * INTO l FROM shell.drafts d
     WHERE d.principal_id = v_actor AND d.tenant_id = p_tenant AND d.domain_id = p_domain AND d.form_key = p_form_key AND d.subject_key = v_subject
     ORDER BY d.saved_at DESC, d.version DESC LIMIT 1;
  END IF;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('state', 'none', 'draft', NULL, 'versions', '[]'::jsonb, 'read_at', v_now, 'form_key', p_form_key, 'subject_key', v_subject);
  END IF;
  v_state := CASE WHEN l.kind = 'discarded' THEN 'discarded' WHEN l.expires_at <= v_now THEN 'expired' ELSE 'live' END;
  SELECT coalesce(jsonb_agg(jsonb_build_object('version', d.version, 'kind', d.kind, 'payload_digest', d.payload_digest, 'saved_at', d.saved_at,
                                               'expires_at', d.expires_at, 'supersedes', d.supersedes, 'step', d.step) ORDER BY d.version), '[]'::jsonb)
    INTO v_versions FROM shell.drafts d WHERE d.draft_id = l.draft_id AND d.principal_id = v_actor;
  RETURN jsonb_build_object('state', v_state, 'read_at', v_now, 'form_key', l.form_key, 'subject_key', l.subject_key,
    'draft', jsonb_build_object('draft_id', l.draft_id, 'version', l.version, 'schema_version', l.schema_version, 'summary', l.summary, 'step', l.step,
      'payload_digest', l.payload_digest, 'saved_at', l.saved_at, 'expires_at', l.expires_at, 'supersedes', l.supersedes,
      'payload', CASE WHEN v_state = 'live' THEN l.payload END, 'submission', false),
    'versions', v_versions);
END $$;
REVOKE ALL ON FUNCTION shell.draft_read(uuid, uuid, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION shell.draft_read(uuid, uuid, text, text, uuid) TO eye_app, eye_commit;
