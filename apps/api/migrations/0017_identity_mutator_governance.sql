-- 0017: Gate-2.2 C4 — govern every identity mutator; close victim-account takeover.
--
-- GOVERNED FORWARD MIGRATION. 0001–0016 remain byte-identical.
--
-- Finding: the identity mutators were gated ONLY by the eye_identity EXECUTE
-- grant. Any identity-op capability (or, for the internal helpers, any caller
-- holding the role) could drive any mutator against ANY principal — so a
-- capability minted to rotate principal A's credential could rotate the VICTIM
-- principal B's credential.
--
-- Correction: each mutator now asserts an identity capability. The externally
-- invoked, subject-taking mutators are bound to the capability's exact action AND
-- subject (bound_target), so a capability minted for one operation on one subject
-- cannot mutate a different operation or a different (victim) subject. The
-- internal helpers (bump_epoch, and the revoke/issue primitives composed inside
-- the outer ports) require a live identity/bootstrap context but not a specific
-- action, so legitimate composition still works.

-- Strict: mode identity_op + op_class identity + exact bound action, and — when a
-- subject is given — the exact bound subject the capability was minted for.
CREATE OR REPLACE FUNCTION ctx.assert_identity_capability(p_action text, p_subject uuid)
RETURNS void SECURITY DEFINER SET search_path = ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  IF public.eye_ctx_mode() <> 'identity_op' THEN
    RAISE EXCEPTION 'identity capability denied: identity_op mode required (context is %)',
      coalesce(public.eye_ctx_mode(),'none') USING ERRCODE = '42501';
  END IF;
  IF public.eye_op_class() <> 'identity' THEN
    RAISE EXCEPTION 'identity capability denied: identity operation class required' USING ERRCODE = '42501';
  END IF;
  IF public.eye_bound_action() IS DISTINCT FROM p_action THEN
    RAISE EXCEPTION 'identity capability denied: capability is bound to action %, not %',
      coalesce(public.eye_bound_action(),'<none>'), p_action USING ERRCODE = '42501';
  END IF;
  IF p_subject IS NOT NULL AND public.eye_bound_target() IS DISTINCT FROM p_subject::text THEN
    RAISE EXCEPTION 'identity capability denied: capability is bound to a different subject (victim-takeover blocked)'
      USING ERRCODE = '42501';
  END IF;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION ctx.assert_identity_capability(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ctx.assert_identity_capability(text, uuid) TO eye_identity;

-- Loose: a live identity or bootstrap context, for internally-composed helpers.
CREATE OR REPLACE FUNCTION ctx.assert_identity_context()
RETURNS void SECURITY DEFINER SET search_path = ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  IF NOT (public.eye_ctx_mode() = 'identity_op' AND public.eye_op_class() = 'identity')
     AND NOT (public.eye_ctx_mode() = 'bootstrap' AND public.eye_op_class() = 'bootstrap') THEN
    RAISE EXCEPTION 'identity mutation denied: a live identity or bootstrap capability is required (context is %)',
      coalesce(public.eye_ctx_mode(),'none') USING ERRCODE = '42501';
  END IF;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION ctx.assert_identity_context() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ctx.assert_identity_context() TO eye_identity;

-- ===== externally invoked, subject/action-bound mutators =====

CREATE OR REPLACE FUNCTION identity.session_open(
  p_session uuid, p_principal uuid, p_assurance text, p_refresh_hash text,
  p_ctx_key_hash text, p_expires timestamptz, p_family uuid
) RETURNS void
SECURITY DEFINER SET search_path = identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_epoch bigint;
BEGIN
  -- Login mints the capability before the principal is known (it is discovered by
  -- password verification), so the action is bound but the subject is not.
  PERFORM ctx.assert_identity_capability('identity.session.create', NULL);
  SELECT revocation_epoch INTO v_epoch FROM identity.principals
   WHERE id = p_principal AND status = 'active';
  IF v_epoch IS NULL THEN
    RAISE EXCEPTION 'session rejected: principal not active' USING ERRCODE = '42501';
  END IF;
  INSERT INTO identity.sessions (id, principal_id, assurance, status, refresh_token_hash,
                                 expires_at, context_key_hash, bound_epoch, family_id)
    VALUES (p_session, p_principal, p_assurance, 'active', p_refresh_hash,
            p_expires, p_ctx_key_hash, v_epoch, p_family);
  INSERT INTO identity.refresh_tokens (id, family_id, session_id, token_hash, generation)
    VALUES (gen_random_uuid(), p_family, p_session, p_refresh_hash, 1);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION identity.session_open(uuid,uuid,text,text,text,timestamptz,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION identity.session_open(uuid,uuid,text,text,text,timestamptz,uuid) TO eye_identity;

CREATE OR REPLACE FUNCTION identity.credential_rotate_v2(
  p_principal uuid, p_old_id uuid, p_new_id uuid, p_new_hash text
) RETURNS void SECURITY DEFINER SET search_path = identity, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  -- THE victim-takeover close: the capability must be bound to THIS principal.
  PERFORM ctx.assert_identity_capability('identity.credential.rotate', p_principal);
  UPDATE identity.credentials SET status = 'rotated', rotated_at = now()
    WHERE id = p_old_id AND principal_id = p_principal;
  IF NOT FOUND THEN RAISE EXCEPTION 'rotation rejected: credential mismatch' USING ERRCODE = '42501'; END IF;
  INSERT INTO identity.credentials (id, principal_id, type, secret_hash, status)
    VALUES (p_new_id, p_principal, 'password', p_new_hash, 'active');
  UPDATE identity.sessions SET status = 'revoked', revoked_at = now()
    WHERE principal_id = p_principal AND status = 'active';
  UPDATE identity.refresh_tokens SET invalidated_at = coalesce(invalidated_at, now())
    WHERE session_id IN (SELECT id FROM identity.sessions WHERE principal_id = p_principal);
  PERFORM identity.bump_epoch(p_principal);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION identity.credential_rotate_v2(uuid,uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION identity.credential_rotate_v2(uuid,uuid,uuid,text) TO eye_identity;

-- ===== internal helpers: live identity/bootstrap context required =====

CREATE OR REPLACE FUNCTION identity.bump_epoch(p_principal uuid)
RETURNS void SECURITY DEFINER SET search_path = identity, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM ctx.assert_identity_context();
  UPDATE identity.principals SET revocation_epoch = revocation_epoch + 1 WHERE id = p_principal;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION identity.bump_epoch(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION identity.bump_epoch(uuid) TO eye_identity;

CREATE OR REPLACE FUNCTION identity.sessions_revoke_all_v2(p_principal uuid)
RETURNS int SECURITY DEFINER SET search_path = identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE n int;
BEGIN
  PERFORM ctx.assert_identity_context();
  UPDATE identity.sessions SET status = 'revoked', revoked_at = now()
   WHERE principal_id = p_principal AND status = 'active';
  GET DIAGNOSTICS n = ROW_COUNT;
  UPDATE identity.refresh_tokens SET invalidated_at = coalesce(invalidated_at, now())
   WHERE session_id IN (SELECT id FROM identity.sessions WHERE principal_id = p_principal);
  PERFORM identity.bump_epoch(p_principal);
  RETURN n;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION identity.sessions_revoke_all_v2(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION identity.sessions_revoke_all_v2(uuid) TO eye_identity;

CREATE OR REPLACE FUNCTION identity.credential_issue(
  p_id uuid, p_principal uuid, p_hash text, p_status text, p_expires timestamptz
) RETURNS void SECURITY DEFINER SET search_path = identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_kind text;
BEGIN
  PERFORM ctx.assert_identity_context();
  SELECT kind INTO v_kind FROM identity.principals WHERE id = p_principal;
  IF v_kind IS DISTINCT FROM 'human' THEN
    RAISE EXCEPTION 'password credentials are restricted to human principals';
  END IF;
  IF p_status NOT IN ('active','must_rotate') THEN
    RAISE EXCEPTION 'invalid credential status %', p_status;
  END IF;
  INSERT INTO identity.credentials (id, principal_id, type, secret_hash, status, expires_at)
    VALUES (p_id, p_principal, 'password', p_hash, p_status, p_expires);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION identity.credential_issue(uuid,uuid,text,text,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION identity.credential_issue(uuid,uuid,text,text,timestamptz) TO eye_identity;

CREATE OR REPLACE FUNCTION identity.credential_revoke(p_id uuid)
RETURNS void SECURITY DEFINER SET search_path = identity, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM ctx.assert_identity_context();
  UPDATE identity.credentials SET status = 'revoked' WHERE id = p_id;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION identity.credential_revoke(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION identity.credential_revoke(uuid) TO eye_identity;

-- Refresh rotation over the family ledger — action-bound (subject is derived from
-- the presented token, not nominated by the caller).
CREATE OR REPLACE FUNCTION identity.refresh_rotate_family(
  p_old_hash text, p_new_hash text, p_new_ctx_key_hash text
) RETURNS TABLE (outcome text, session_id uuid, principal_id uuid, assurance text, generation int)
SECURITY DEFINER SET search_path = identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE tok RECORD; s RECORD; v_principal uuid;
BEGIN
  PERFORM ctx.assert_identity_capability('identity.session.refresh', NULL);
  SELECT t.* INTO tok FROM identity.refresh_tokens t WHERE t.token_hash = p_old_hash FOR UPDATE;
  IF tok.id IS NULL THEN
    RETURN QUERY SELECT 'invalid'::text, NULL::uuid, NULL::uuid, NULL::text, NULL::int; RETURN;
  END IF;
  IF tok.invalidated_at IS NOT NULL THEN
    UPDATE identity.refresh_tokens SET reuse_seen_at = now()
      WHERE token_hash = p_old_hash;
    UPDATE identity.refresh_tokens SET invalidated_at = coalesce(invalidated_at, now())
      WHERE family_id = tok.family_id;
    UPDATE identity.sessions SET status = 'revoked', revoked_at = now()
      WHERE family_id = tok.family_id AND status = 'active';
    SELECT sess.principal_id INTO v_principal
      FROM identity.sessions sess WHERE sess.id = tok.session_id;
    PERFORM identity.bump_epoch(v_principal);
    RETURN QUERY SELECT 'reuse'::text, tok.session_id, v_principal, NULL::text, tok.generation; RETURN;
  END IF;
  SELECT s2.id, s2.principal_id, s2.assurance, s2.status, s2.expires_at INTO s
    FROM identity.sessions s2 WHERE s2.id = tok.session_id FOR UPDATE;
  IF s.status <> 'active' OR s.expires_at <= now() THEN
    RETURN QUERY SELECT 'invalid'::text, NULL::uuid, NULL::uuid, NULL::text, NULL::int; RETURN;
  END IF;
  UPDATE identity.refresh_tokens SET invalidated_at = now() WHERE id = tok.id;
  INSERT INTO identity.refresh_tokens (id, family_id, session_id, token_hash, generation, replaced_by)
    VALUES (gen_random_uuid(), tok.family_id, tok.session_id, p_new_hash, tok.generation + 1, NULL);
  UPDATE identity.refresh_tokens SET replaced_by = (
      SELECT id FROM identity.refresh_tokens WHERE token_hash = p_new_hash
    ) WHERE id = tok.id;
  UPDATE identity.sessions
     SET refresh_token_hash = p_new_hash, context_key_hash = p_new_ctx_key_hash
   WHERE id = tok.session_id;
  RETURN QUERY SELECT 'rotated'::text, s.id, s.principal_id, s.assurance, tok.generation + 1;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION identity.refresh_rotate_family(text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION identity.refresh_rotate_family(text,text,text) TO eye_identity;
