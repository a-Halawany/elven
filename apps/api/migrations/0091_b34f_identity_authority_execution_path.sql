-- 0091 — CP-6 B34-F (2026-09-29): THE OWNER'S BOUNDED B34 REVIEW, TWO FORWARD CORRECTIONS (0090 is applied on the demonstration and is
-- untouched; the Phase 0 schemas gain nothing). Integrated from two parallel parts, each kept as its own section:
--   §F1 (b34f/identity)  B34-F1 — the collaboration ports' identity mutations go through the IDENTITY AUTHORITY (invite = the owner's request
--                        + an identity administrator's provisioning on the existing identity ports; acceptance = the credential replaced by
--                        the identity ports; revocation and expiry = credentials and sessions revoked, the epoch bumped, on the identity
--                        authority); the 0090 bypass ports dropped.
--   §F2 (b34f/execution) B34-F2 — the SUPPORTED synthetic loopback execution path (the deployment switch EYE_EXECUTION_SYNTHETIC_LOOPBACK,
--                        default off): the path recorded on every attempt, guarded by the database; the tick's retry list carries the
--                        target's synthetic flag. The production egress and its refusals are unchanged.
--   §F3 (integrator)     B34-F2 — the compensation chain: a reconciled compensating handoff completes its compensation.
-- ═════════════════════════════════════════════════════════════════════════════════════
-- §F1 ─────────────────────────────────────────────────────────────────────────────────
-- 0091 — CP-6 B34-F1 (2026-09-29): THE COLLABORATION PORTS' IDENTITY MUTATIONS GO THROUGH THE IDENTITY AUTHORITY.
--
-- THE FINDING (the owner's bounded B34 review of 2026-09-29, B34-F1). 0090 §W5's collaboration ports — executive.invite_collaborator,
-- executive.accept_collaboration and executive._end_collab_grant, SECURITY DEFINER and reached under the COMMIT authority (the ordinary
-- write pipeline: executive.collab.invite, executive.collab.accept, executive.collab.grant.revoke, executive.attention.tick) — INSERTed and
-- UPDATEd identity.principals, identity.role_bindings and identity.credentials directly. 0011 revoked identity-table mutation from
-- everything but the identity ports, 0013 stops the commit authority minting an identity capability, and Gate-2 §1/§3
-- (apps/api/src/identity/principals.service.ts) routes every identity mutation through identity.create_principal on the IDENTITY
-- authority: the definer ports walked around all three.
--
-- THE CORRECTION (forward; 0090 is applied on the demonstration and untouched; the Phase 0 schemas — identity, ctx, policy, audit,
-- objects, public, config — gain nothing and lose nothing: the existing identity ports only):
--   * INVITE is TWO governed acts. The workspace's owner REQUESTS the invitation (executive.request_collaborator under
--     executive.collab.invite: the grant `requested` — the invitee's name, contact, ceiling and expiry — no principal, no identity write).
--     An IDENTITY ADMINISTRATOR (the roles the Phase 0 identity.principal.create rule admits: platform_admin, tenant_admin — a domain
--     administrator does not qualify) PROVISIONS it, never the requester:
--       1. executive.reserve_collaborator (commit, executive.collab.provision): the grant names the principal id about to be created and
--          its login name, and the EXTERNAL MARKER (executive.external_principals, 0090 §0.2) is recorded FIRST — so an identity row for
--          an invitee never exists, even for an instant, without the marker that keeps it from being a MEMBER (decision.is_active_human
--          reads the marker; a marker-less principal would pass it);
--       2. identity.create_principal (IDENTITY authority, business authority identity.principal.create — the Phase 0 principals route's
--          own path): a DOMAIN human whose ONLY role is external_collaborator, no credential;
--       3. identity.credential_issue (IDENTITY_DB, ctx.issue_identity_op('identity.principal.create', <the principal>)): the one-time
--          invitation credential with the invitation window's expiry; its evidence through audit.commit_identity_event;
--       4. executive.activate_collaborator (commit, executive.collab.provision): the identity facts VERIFIED, not trusted (the principal,
--          its single external_collaborator binding in this domain, its single active credential expiring with the invitation window,
--          the marker), then the grant.expiry timer, the participant, the SYNTHETIC mailbox record; the grant `invited`.
--     A failure after step 2 or 3 committed is COMPENSATED on the identity side (the TypeScript half: every credential of the reserved
--     principal revoked, its sessions revoked, its epoch bumped — ctx.issue_identity_op('identity.credential.revoke', <it>)); the grant
--     stays `requested` and a retry reserves a FRESH principal (the abandoned one is marked external, holds no credential and is swept by
--     executive.collab_access_pending should the compensation itself have failed).
--   * ACCEPT: executive.accept_collaboration re-declared WITHOUT the credential hash and WITHOUT an identity write — it records the
--     acceptance (the token's hash, the invitee, the purpose, the window, as 0090) and answers the grant's expiry; the TypeScript half then
--     ROTATES the invitation credential to the invitee's password on the IDENTITY_DB (ctx.issue_identity_op('identity.credential.rotate',
--     <the invitee>): the token verified against the active credential, identity.credential_revoke, identity.credential_issue expiring
--     WITH THE GRANT, identity.sessions_revoke_all_v2 — the steps identity.credential_rotate_v2 performs, composed because
--     credential_rotate_v2 cannot carry an expiry). An acceptance whose rotation failed is retried by the invitee (a repeated acceptance
--     with the same token answers `repeated`; the rotation re-verifies the token, so it runs at most once).
--   * THE END OF A GRANT (revoke, and the lapse — the grant.expiry timer at step 20 and the sweep at step 22): executive._end_collab_grant
--     re-declared WITHOUT the credential UPDATE and the binding UPDATE; the grant ended, the participant removed, the timer cancelled and
--     the tasks reassigned (access_lost) exactly as 0090. The identity side follows the commit (never before the port's own authority
--     checks — the owner, the state — and never nested inside the tick's write): the revoke route, and the after-tick hook
--     `collab-access-revocation` over executive.collab_access_pending (NEW, read-only): every credential revoked, every session revoked,
--     the epoch bumped (ctx.issue_identity_op('identity.credential.revoke', <the external>)). Anything left live by a failure is found by
--     the next tick's read and revoked then.
--   * executive.invite_collaborator (0090) and the 7-argument executive.accept_collaboration are DROPPED: after this migration no function
--     outside the identity schema writes identity.* (the harness scans pg_proc for it).
--
-- NOT HERE (stated): the external's role BINDING is no longer revoked at the end of a grant — no identity port revokes a binding and the
-- frozen identity schema takes no new one; the binding is inert (no credential, no session, the epoch moved, and every collaboration port
-- refuses a grant that is not live). The abandoned principal of a compensated provisioning is not deleted or disabled (no identity port
-- does either). objects.interface_register (unchanged).

-- ═════════════════════════════════════════════════════════════════════════════════════
-- §1 THE GRANT: requested → (provisioning) → invited → accepted → revoked | lapsed
-- ═════════════════════════════════════════════════════════════════════════════════════
-- A requested grant names no principal yet (the identity administrator creates it); an invited one carries the principal, its login, the
-- invitation token's hash and window. Rows written by 0090 (invited onwards) already carry all three.
ALTER TABLE executive.collab_grants ALTER COLUMN principal_id DROP NOT NULL;
ALTER TABLE executive.collab_grants ALTER COLUMN invitation_token_hash DROP NOT NULL;
ALTER TABLE executive.collab_grants ALTER COLUMN invitation_expires_at DROP NOT NULL;
ALTER TABLE executive.collab_grants ADD COLUMN display_name text CHECK (display_name IS NULL OR length(btrim(display_name)) BETWEEN 3 AND 200);
ALTER TABLE executive.collab_grants ADD COLUMN login_name text CHECK (login_name IS NULL OR login_name ~ '^ext-[a-z0-9-]{4,60}$');
ALTER TABLE executive.collab_grants ADD COLUMN provisioned_by uuid;
ALTER TABLE executive.collab_grants ADD COLUMN provisioned_at timestamptz;
ALTER TABLE executive.collab_grants DROP CONSTRAINT collab_grants_state_check;
ALTER TABLE executive.collab_grants ADD CONSTRAINT collab_grants_state_check CHECK (state IN ('requested', 'invited', 'accepted', 'revoked', 'lapsed'));
ALTER TABLE executive.collab_grants ADD CONSTRAINT xcg_requested CHECK (state <> 'requested' OR (display_name IS NOT NULL AND provisioned_at IS NULL));
ALTER TABLE executive.collab_grants ADD CONSTRAINT xcg_provisioned
  CHECK (state = 'requested' OR (principal_id IS NOT NULL AND invitation_token_hash IS NOT NULL AND invitation_expires_at IS NOT NULL));

ALTER TABLE executive.collab_events DROP CONSTRAINT collab_events_event_check;
ALTER TABLE executive.collab_events ADD CONSTRAINT collab_events_event_check CHECK (event IN ('workspace.opened', 'participant.added', 'participant.removed',
  'thread.opened', 'message.posted', 'artifact.added', 'review.requested', 'review.recorded', 'grant.invited', 'grant.accepted', 'grant.revoked', 'grant.lapsed',
  'access.refused',
  -- B34-F1 (0091): the owner's request and the identity administrator's reservation
  'grant.requested', 'grant.provisioning'));

-- ═════════════════════════════════════════════════════════════════════════════════════
-- §2 THE BYPASS REMOVED
-- ═════════════════════════════════════════════════════════════════════════════════════
DROP FUNCTION executive.invite_collaborator(uuid, uuid, uuid, uuid, uuid, text, text, text, text, timestamptz, text, text, timestamptz, text, text, uuid, uuid);
DROP FUNCTION executive.accept_collaboration(uuid, uuid, uuid, text, text, uuid, uuid);

-- ═════════════════════════════════════════════════════════════════════════════════════
-- §3 THE REQUEST (the workspace owner's act — no identity write)
-- ═════════════════════════════════════════════════════════════════════════════════════
-- 0090's invite validations, the grant recorded `requested`: who is invited (a display name, a SYNTHETIC contact label), the audience
-- ceiling (at or below the workspace's), the expiry (future, at most 30 days out — counted from the request).
CREATE OR REPLACE FUNCTION executive.request_collaborator(
  p_grant uuid, p_tenant uuid, p_domain uuid, p_ws uuid, p_display_name text, p_contact_label text, p_ceiling text, p_expires_at timestamptz, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE gd jsonb; w executive.collab_workspaces%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.collab.invite']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'collaboration grant rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  gd := executive._collab_guard(p_ws, p_tenant, p_domain, p_actor);
  IF (gd ->> 'owner')::uuid IS DISTINCT FROM p_actor THEN RAISE EXCEPTION 'collaboration grant rejected (not_owner): the workspace''s owner invites an external collaborator' USING ERRCODE = '42501'; END IF;
  SELECT * INTO w FROM executive.collab_workspaces x WHERE x.workspace_id = p_ws;
  IF p_expires_at IS NULL OR p_expires_at <= clock_timestamp() OR p_expires_at > clock_timestamp() + interval '30 days' THEN
    RAISE EXCEPTION 'collaboration grant rejected (expiry): a grant expires in the future and at most 30 days out' USING ERRCODE = '22023';
  END IF;
  IF executive.collab_class_rank(p_ceiling) IS NULL OR executive.collab_class_rank(p_ceiling) > executive.collab_class_rank(w.classification_ceiling) THEN
    RAISE EXCEPTION 'collaboration grant rejected (ceiling): the audience ceiling % is at or below the workspace''s ceiling %', coalesce(p_ceiling, '<none>'), w.classification_ceiling USING ERRCODE = '22023';
  END IF;
  IF coalesce(length(btrim(p_display_name)), 0) NOT BETWEEN 3 AND 200 OR coalesce(length(btrim(p_contact_label)), 0) NOT BETWEEN 3 AND 200 THEN
    RAISE EXCEPTION 'collaboration grant rejected (invitee): a display name and a contact label' USING ERRCODE = '22023';
  END IF;
  INSERT INTO executive.collab_grants (grant_id, scope, tenant_id, domain_id, workspace_id, principal_id, purpose, audience_ceiling, expires_at, invitation_token_hash, invitation_expires_at,
                                       contact_label, state, display_name, invited_by, correlation_id)
  VALUES (p_grant, 'DOMAIN', p_tenant, p_domain, p_ws, NULL, w.purpose, p_ceiling, p_expires_at, NULL, NULL, btrim(p_contact_label), 'requested', btrim(p_display_name), p_actor, p_correlation);
  PERFORM executive._collab_event(p_ws, p_tenant, p_domain, 'grant.requested', p_actor,
            jsonb_build_object('grant_id', p_grant, 'purpose', w.purpose, 'audience_ceiling', p_ceiling, 'expires_at', p_expires_at, 'provisioned_by', 'an identity administrator'), p_correlation);
  RETURN jsonb_build_object('grant_id', p_grant, 'state', 'requested', 'workspace_id', p_ws, 'purpose', w.purpose, 'audience_ceiling', p_ceiling, 'expires_at', p_expires_at,
                            'display_name', btrim(p_display_name), 'requested_by', p_actor,
                            'next', 'an identity administrator provisions the invitee through the identity authority');
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.request_collaborator(uuid, uuid, uuid, uuid, text, text, text, timestamptz, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.request_collaborator(uuid, uuid, uuid, uuid, text, text, text, timestamptz, uuid, uuid) TO eye_commit;

-- ═════════════════════════════════════════════════════════════════════════════════════
-- §4 THE PROVISIONING (the identity administrator's act — the identity rows are the identity authority's)
-- ═════════════════════════════════════════════════════════════════════════════════════
-- The provisioner: a named, active human of the tenant or the platform, never an external and never the requester (two acts, two people). The PDP admits the identity
-- administrators only (executive.collab.provision: platform_admin, tenant_admin — the roles identity.principal.create admits).
CREATE OR REPLACE FUNCTION executive._collab_provision_guard(p_grant uuid, p_tenant uuid, p_domain uuid, p_actor uuid) RETURNS executive.collab_grants
SECURITY DEFINER SET search_path = executive, identity, public, pg_catalog, pg_temp AS $$
DECLARE g executive.collab_grants%ROWTYPE; w executive.collab_workspaces%ROWTYPE;
BEGIN
  SELECT * INTO g FROM executive.collab_grants x WHERE x.grant_id = p_grant AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'collaboration grant rejected (unknown_grant): no grant % in this domain', p_grant USING ERRCODE = '23503'; END IF;
  -- a named, active human of this tenant or of the platform (the platform administrator is an identity administrator too), never an external
  IF NOT EXISTS (SELECT 1 FROM identity.principals p WHERE p.id = p_actor AND p.kind = 'human' AND p.status = 'active' AND (p.tenant_id = p_tenant OR p.scope = 'PLATFORM'))
     OR EXISTS (SELECT 1 FROM executive.external_principals x WHERE x.principal_id = p_actor) THEN
    RAISE EXCEPTION 'collaboration grant rejected (provisioner): a named, active human of the tenant or the platform provisions an invitee' USING ERRCODE = '42501';
  END IF;
  IF g.invited_by = p_actor THEN
    RAISE EXCEPTION 'collaboration grant rejected (separation): the requester of an invitation does not provision it — an identity administrator does' USING ERRCODE = '42501';
  END IF;
  IF g.state <> 'requested' THEN RAISE EXCEPTION 'collaboration grant rejected (state): the grant is %', g.state USING ERRCODE = '23505'; END IF;
  IF g.expires_at <= clock_timestamp() THEN RAISE EXCEPTION 'collaboration grant rejected (state): the requested grant expired at %', g.expires_at USING ERRCODE = '23505'; END IF;
  SELECT * INTO w FROM executive.collab_workspaces x WHERE x.workspace_id = g.workspace_id;
  IF w.state <> 'open' THEN RAISE EXCEPTION 'collaboration rejected (closed): workspace % is closed', g.workspace_id USING ERRCODE = '23505'; END IF;
  RETURN g;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive._collab_provision_guard(uuid, uuid, uuid, uuid) FROM PUBLIC;

-- RESERVE (step 1): the principal id and login the identity authority is about to create, and the EXTERNAL MARKER recorded first. A
-- retry after a failed provisioning reserves a fresh principal (the grant names the newest; the abandoned one stays marked external).
CREATE OR REPLACE FUNCTION executive.reserve_collaborator(p_grant uuid, p_principal uuid, p_tenant uuid, p_domain uuid, p_login_name text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE g executive.collab_grants%ROWTYPE; w executive.collab_workspaces%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.collab.provision']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'collaboration grant rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO g FROM executive._collab_provision_guard(p_grant, p_tenant, p_domain, p_actor);
  IF coalesce(p_login_name, '') !~ '^ext-[a-z0-9-]{4,60}$' THEN RAISE EXCEPTION 'collaboration grant rejected (invitee): an ext- login name' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM identity.principals p WHERE p.login_name = p_login_name) THEN RAISE EXCEPTION 'collaboration grant rejected (duplicate): the login name % is taken', p_login_name USING ERRCODE = '23505'; END IF;
  IF EXISTS (SELECT 1 FROM identity.principals p WHERE p.id = p_principal) OR EXISTS (SELECT 1 FROM executive.external_principals x WHERE x.principal_id = p_principal) THEN
    RAISE EXCEPTION 'collaboration grant rejected (duplicate): principal % already exists', p_principal USING ERRCODE = '23505';
  END IF;
  SELECT * INTO w FROM executive.collab_workspaces x WHERE x.workspace_id = g.workspace_id;
  -- the EXTERNAL marker (0090 §0.2) BEFORE the identity row: the principal is never, even for an instant, a member
  INSERT INTO executive.external_principals (principal_id, scope, tenant_id, domain_id, invited_by, reason, correlation_id)
  VALUES (p_principal, 'DOMAIN', p_tenant, p_domain, g.invited_by, format('invited to workspace %s (grant %s), provisioned by %s', g.workspace_id, p_grant, p_actor), p_correlation);
  UPDATE executive.collab_grants SET principal_id = p_principal, login_name = p_login_name, provisioned_by = p_actor WHERE grant_id = p_grant;
  PERFORM executive._collab_event(g.workspace_id, p_tenant, p_domain, 'grant.provisioning', p_actor,
            jsonb_build_object('grant_id', p_grant, 'principal', p_principal, 'superseded', g.principal_id), p_correlation);
  RETURN jsonb_build_object('grant_id', p_grant, 'principal_id', p_principal, 'login_name', p_login_name, 'display_name', g.display_name, 'workspace_id', g.workspace_id,
                            'workspace_title', w.title, 'purpose', g.purpose, 'audience_ceiling', g.audience_ceiling, 'expires_at', g.expires_at, 'requested_by', g.invited_by,
                            'superseded_principal', g.principal_id);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.reserve_collaborator(uuid, uuid, uuid, uuid, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.reserve_collaborator(uuid, uuid, uuid, uuid, text, uuid, uuid) TO eye_commit;

-- ACTIVATE (step 4): what the identity authority wrote is VERIFIED here (read, never written): the reserved principal is an active DOMAIN
-- human of this domain with the reserved login, its ONLY live binding is external_collaborator in this domain, it holds exactly ONE
-- active credential and that credential expires with the invitation window; its marker is recorded. Then 0090's invite tail: the
-- grant.expiry timer, the participant (reviewer), the SYNTHETIC mailbox record, the grant `invited`.
CREATE OR REPLACE FUNCTION executive.activate_collaborator(
  p_grant uuid, p_tenant uuid, p_domain uuid, p_token_hash text, p_invitation_expires_at timestamptz, p_mail_subject text, p_mail_body_digest text, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE g executive.collab_grants%ROWTYPE; p identity.principals%ROWTYPE; v_timer uuid; v_mail uuid := gen_random_uuid(); v_bind int; v_bind_ok boolean; v_cred int; v_cred_exp timestamptz;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.collab.provision']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'collaboration grant rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO g FROM executive._collab_provision_guard(p_grant, p_tenant, p_domain, p_actor);
  IF g.principal_id IS NULL OR g.provisioned_by IS DISTINCT FROM p_actor THEN
    RAISE EXCEPTION 'collaboration grant rejected (not_reserved): the grant''s invitee is reserved by its provisioner first' USING ERRCODE = '23505';
  END IF;
  IF p_invitation_expires_at IS NULL OR p_invitation_expires_at <= clock_timestamp() OR p_invitation_expires_at > g.expires_at THEN
    RAISE EXCEPTION 'collaboration grant rejected (expiry): the invitation window ends in the future and no later than the grant' USING ERRCODE = '22023';
  END IF;
  IF coalesce(p_token_hash, '') !~ '^[0-9a-f]{64}$' OR coalesce(p_mail_body_digest, '') !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'collaboration grant rejected (invitation): the invitation carries its token hash and its message digest' USING ERRCODE = '22023';
  END IF;
  -- the identity authority's rows, verified
  SELECT * INTO p FROM identity.principals x WHERE x.id = g.principal_id;
  IF NOT FOUND OR p.kind <> 'human' OR p.scope <> 'DOMAIN' OR p.tenant_id IS DISTINCT FROM p_tenant OR p.domain_id IS DISTINCT FROM p_domain OR p.status <> 'active'
     OR p.login_name IS DISTINCT FROM g.login_name THEN
    RAISE EXCEPTION 'collaboration grant rejected (identity): the reserved invitee % is not an active DOMAIN human of this domain with its reserved login', g.principal_id USING ERRCODE = '23505';
  END IF;
  SELECT count(*), coalesce(bool_and(b.role_code = 'external_collaborator' AND b.scope = 'DOMAIN' AND b.tenant_id = p_tenant AND b.domain_id = p_domain), false)
    INTO v_bind, v_bind_ok FROM identity.role_bindings b WHERE b.principal_id = g.principal_id AND b.revoked_at IS NULL;
  IF v_bind <> 1 OR NOT v_bind_ok THEN
    RAISE EXCEPTION 'collaboration grant rejected (identity): the invitee''s only live binding is external_collaborator in this domain (found %)', v_bind USING ERRCODE = '23505';
  END IF;
  SELECT count(*), max(c.expires_at) INTO v_cred, v_cred_exp FROM identity.credentials c WHERE c.principal_id = g.principal_id AND c.status IN ('active', 'must_rotate');
  IF v_cred <> 1 OR v_cred_exp IS DISTINCT FROM p_invitation_expires_at THEN
    RAISE EXCEPTION 'collaboration grant rejected (identity): the invitee holds exactly one credential, expiring with the invitation window' USING ERRCODE = '23505';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM executive.external_principals x WHERE x.principal_id = g.principal_id) THEN
    RAISE EXCEPTION 'collaboration grant rejected (identity): the invitee carries no external marker' USING ERRCODE = '23505';
  END IF;
  v_timer := executive._schedule_timer(gen_random_uuid(), p_tenant, p_domain, 'grant', p_grant, 'grant.expiry', g.expires_at, jsonb_build_object('workspace', g.workspace_id, 'principal', g.principal_id), p_actor, p_correlation);
  UPDATE executive.collab_grants SET state = 'invited', invitation_token_hash = p_token_hash, invitation_expires_at = p_invitation_expires_at, expiry_timer_id = v_timer,
                                     provisioned_at = clock_timestamp() WHERE grant_id = p_grant;
  INSERT INTO executive.collab_participants (participant_id, scope, tenant_id, domain_id, workspace_id, principal_id, role, affiliation, grant_id, added_by, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, g.workspace_id, g.principal_id, 'reviewer', 'external', p_grant, g.invited_by, p_correlation);
  INSERT INTO executive.collab_invitation_mail (message_id, scope, tenant_id, domain_id, grant_id, recipient_principal_id, subject, body_digest, correlation_id)
  VALUES (v_mail, 'DOMAIN', p_tenant, p_domain, p_grant, g.principal_id, left(btrim(p_mail_subject), 300), p_mail_body_digest, p_correlation);
  PERFORM executive._collab_event(g.workspace_id, p_tenant, p_domain, 'grant.invited', p_actor,
            jsonb_build_object('grant_id', p_grant, 'principal', g.principal_id, 'purpose', g.purpose, 'audience_ceiling', g.audience_ceiling, 'expires_at', g.expires_at, 'mail', v_mail,
                               'synthetic', true, 'requested_by', g.invited_by, 'provisioned_by', p_actor), p_correlation);
  RETURN jsonb_build_object('grant_id', p_grant, 'principal_id', g.principal_id, 'login_name', g.login_name, 'purpose', g.purpose, 'audience_ceiling', g.audience_ceiling, 'expires_at', g.expires_at,
                            'invitation_expires_at', p_invitation_expires_at, 'state', 'invited', 'expiry_timer_id', v_timer, 'requested_by', g.invited_by, 'provisioned_by', p_actor,
                            'mail', jsonb_build_object('message_id', v_mail, 'channel', 'demo-mailbox', 'synthetic', true));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.activate_collaborator(uuid, uuid, uuid, text, timestamptz, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.activate_collaborator(uuid, uuid, uuid, text, timestamptz, text, text, uuid, uuid) TO eye_commit;

-- ═════════════════════════════════════════════════════════════════════════════════════
-- §5 THE ACCEPTANCE (recorded here; the credential is rotated by the identity authority)
-- ═════════════════════════════════════════════════════════════════════════════════════
-- 0090's checks whole (the invitee, the state, the windows, the token's hash, the purpose). A grant this invitee already accepted with
-- the same token answers `repeated` (the retry of an acceptance whose identity rotation failed; the rotation re-verifies the token
-- against the active credential, so it never runs twice). Answers the grant's expiry: the new credential expires with it.
CREATE OR REPLACE FUNCTION executive.accept_collaboration(p_grant uuid, p_tenant uuid, p_domain uuid, p_token_hash text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE g executive.collab_grants%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.collab.accept']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'collaboration grant rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO g FROM executive.collab_grants x WHERE x.grant_id = p_grant AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'collaboration grant rejected (unknown_grant): no grant % in this domain', p_grant USING ERRCODE = '23503'; END IF;
  IF g.principal_id IS DISTINCT FROM p_actor THEN RAISE EXCEPTION 'collaboration grant rejected (not_invitee): only the invitee accepts their invitation' USING ERRCODE = '42501'; END IF;
  IF g.state NOT IN ('invited', 'accepted') THEN RAISE EXCEPTION 'collaboration grant rejected (state): the grant is %', g.state USING ERRCODE = '23505'; END IF;
  IF g.expires_at <= clock_timestamp() OR g.invitation_expires_at <= clock_timestamp() THEN RAISE EXCEPTION 'collaboration grant rejected (state): the invitation expired' USING ERRCODE = '23505'; END IF;
  IF p_token_hash IS DISTINCT FROM g.invitation_token_hash THEN RAISE EXCEPTION 'collaboration grant rejected (token): the invitation token does not match' USING ERRCODE = '42501'; END IF;
  IF public.eye_purpose() IS DISTINCT FROM g.purpose THEN RAISE EXCEPTION 'collaboration grant rejected (purpose): the grant is for the purpose %', g.purpose USING ERRCODE = '42501'; END IF;
  IF g.state = 'accepted' THEN
    RETURN jsonb_build_object('grant_id', p_grant, 'state', 'accepted', 'repeated', true, 'principal_id', g.principal_id, 'workspace_id', g.workspace_id, 'expires_at', g.expires_at,
                              'credential_expires_at', g.expires_at, 'audience_ceiling', g.audience_ceiling);
  END IF;
  UPDATE executive.collab_grants SET state = 'accepted', accepted_at = clock_timestamp() WHERE grant_id = p_grant;
  PERFORM executive._collab_event(g.workspace_id, p_tenant, p_domain, 'grant.accepted', p_actor,
            jsonb_build_object('grant_id', p_grant, 'credential_expires_at', g.expires_at, 'credential', 'rotated by the identity authority'), p_correlation);
  RETURN jsonb_build_object('grant_id', p_grant, 'state', 'accepted', 'repeated', false, 'principal_id', g.principal_id, 'workspace_id', g.workspace_id, 'expires_at', g.expires_at,
                            'credential_expires_at', g.expires_at, 'audience_ceiling', g.audience_ceiling);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.accept_collaboration(uuid, uuid, uuid, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.accept_collaboration(uuid, uuid, uuid, text, uuid, uuid) TO eye_commit;

-- ═════════════════════════════════════════════════════════════════════════════════════
-- §6 THE END OF A GRANT — 0090 §W5's body without its two identity UPDATEs
-- ═════════════════════════════════════════════════════════════════════════════════════
-- The grant ended (revoked | lapsed), the expiry timer cancelled (a revocation), the participant removed, the external's open tasks
-- REASSIGNED with reason access_lost (to the task's escalation principal when it names a member, else the workspace's owner). Its
-- credentials, sessions and epoch are the identity authority's: the revoke route and the after-tick hook revoke them next (§7).
CREATE OR REPLACE FUNCTION executive._end_collab_grant(p_grant uuid, p_tenant uuid, p_domain uuid, p_state text, p_reason text, p_cancel_timer boolean, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, decision, public, pg_catalog, pg_temp AS $$
DECLARE g executive.collab_grants%ROWTYPE; w executive.collab_workspaces%ROWTYPE; t executive.human_tasks%ROWTYPE; v_to uuid; v_moved jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO g FROM executive.collab_grants x WHERE x.grant_id = p_grant AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  SELECT * INTO w FROM executive.collab_workspaces x WHERE x.workspace_id = g.workspace_id;
  IF p_state = 'revoked' THEN
    UPDATE executive.collab_grants SET state = 'revoked', revoked_at = clock_timestamp(), revoked_by = p_actor, revoke_reason = p_reason WHERE grant_id = p_grant;
  ELSE
    UPDATE executive.collab_grants SET state = 'lapsed', lapsed_at = clock_timestamp() WHERE grant_id = p_grant;
  END IF;
  -- the expiry timer ends with the grant — unless it is the timer being fired now (the lapse at step 20: its tick marks it fired)
  IF p_cancel_timer THEN
    UPDATE executive.workflow_timers SET cancelled_at = clock_timestamp() WHERE timer_id = g.expiry_timer_id AND fired_at IS NULL AND cancelled_at IS NULL;
  END IF;
  UPDATE executive.collab_participants SET removed_at = clock_timestamp(), removed_by = p_actor, removal_reason = 'grant ' || p_state
   WHERE workspace_id = g.workspace_id AND principal_id = g.principal_id AND removed_at IS NULL;
  FOR t IN SELECT * FROM executive.human_tasks x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.assignee_principal_id = g.principal_id AND x.state IN ('open', 'escalated') FOR UPDATE LOOP
    v_to := nullif(t.escalation ->> 'principal', '')::uuid;
    IF v_to IS NULL OR NOT decision.is_active_human(v_to, p_tenant) THEN v_to := w.owner_principal_id; END IF;
    UPDATE executive.human_tasks SET assignee_principal_id = v_to, updated_at = clock_timestamp() WHERE task_id = t.task_id;
    INSERT INTO executive.human_task_assignments (assignment_id, scope, tenant_id, domain_id, task_id, from_principal, to_principal, reason, actor_principal_id, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, t.task_id, g.principal_id, v_to, 'access_lost', p_actor, p_correlation);
    INSERT INTO executive.human_task_events (event_id, scope, tenant_id, domain_id, task_id, event, actor_principal_id, details, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, t.task_id, 'task.reassigned', p_actor,
            jsonb_build_object('from', g.principal_id, 'to', v_to, 'reason', 'access_lost', 'grant_id', p_grant, 'grant_state', p_state), p_correlation);
    v_moved := v_moved || jsonb_build_object('task_id', t.task_id, 'to', v_to);
  END LOOP;
  PERFORM executive._collab_event(g.workspace_id, p_tenant, p_domain, CASE WHEN p_state = 'revoked' THEN 'grant.revoked' ELSE 'grant.lapsed' END, p_actor,
            jsonb_build_object('grant_id', p_grant, 'principal', g.principal_id, 'reason', p_reason, 'reassigned', v_moved, 'access', 'revoked by the identity authority next'), p_correlation);
  RETURN jsonb_build_object('grant_id', p_grant, 'state', p_state, 'principal', g.principal_id, 'reassigned', v_moved);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive._end_collab_grant(uuid, uuid, uuid, text, text, boolean, uuid, uuid) FROM PUBLIC;

-- ═════════════════════════════════════════════════════════════════════════════════════
-- §7 ACCESS STILL TO REVOKE (a read): the external principals of this domain that still hold a live credential or a live session although
-- no grant in requested / invited / accepted names them — an ended grant's invitee (revoked, lapsed) and an abandoned provisioning's
-- principal. The revoke route revokes its own at once; the after-tick hook `collab-access-revocation` revokes whatever this read finds
-- (the tick's step 22 answers it), so a failure between the commit and the identity revocation is closed by the next tick.
-- ═════════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION executive.collab_access_pending(p_tenant uuid, p_domain uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.attention.tick', 'executive.collab.grant.revoke']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object('principal', x.principal_id,
                                        'grant_id', (SELECT g.grant_id FROM executive.collab_grants g WHERE g.principal_id = x.principal_id ORDER BY g.invited_at DESC LIMIT 1),
                                        'grant_state', coalesce((SELECT g.state FROM executive.collab_grants g WHERE g.principal_id = x.principal_id ORDER BY g.invited_at DESC LIMIT 1), 'abandoned'))
                     ORDER BY x.created_at)
      FROM (SELECT x.* FROM executive.external_principals x
             WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain
               AND NOT EXISTS (SELECT 1 FROM executive.collab_grants g WHERE g.principal_id = x.principal_id AND g.state IN ('requested', 'invited', 'accepted'))
               AND (EXISTS (SELECT 1 FROM identity.credentials c WHERE c.principal_id = x.principal_id AND c.status IN ('active', 'must_rotate'))
                    OR EXISTS (SELECT 1 FROM identity.sessions s WHERE s.principal_id = x.principal_id AND s.status = 'active'))
             ORDER BY x.created_at LIMIT 200) x), '[]'::jsonb);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.collab_access_pending(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.collab_access_pending(uuid, uuid) TO eye_commit;

-- ═════════════════════════════════════════════════════════════════════════════════════
-- §8 NOTHING OUTSIDE THE IDENTITY SCHEMA WRITES identity.* — the internal B34 ports keep no PUBLIC execute; the commit role holds no
-- privilege on an identity table (0011) — both asserted by the B34-F1 harness from the catalog.
-- ═════════════════════════════════════════════════════════════════════════════════════
REVOKE ALL ON FUNCTION executive._end_collab_grant(uuid, uuid, uuid, text, text, boolean, uuid, uuid) FROM eye_commit, eye_app;
REVOKE ALL ON FUNCTION executive._collab_provision_guard(uuid, uuid, uuid, uuid) FROM eye_commit, eye_app;

-- ═════════════════════════════════════════════════════════════════════════════════════
-- §F2 ─────────────────────────────────────────────────────────────────────────────────
-- 0091 — CP-6 B34-F2 (2026-09-29, the owner's bounded review of B34): THE POSITIVE SYNTHETIC ERP SCENE THROUGH THE PRODUCT.
--
-- The finding: F-P6-05's demo scene (the dual-sourcing handoff to a synthetic ERP; half effected; the residual with a compensation owner)
-- was proven only by a harness that REPLACED the production egress with a pinned loopback transport; in the application the production
-- egress refuses the loopback synthetic ERP, so the demo's handoff stayed in progress. The correction is a SUPPORTED, EXPLICITLY SYNTHETIC
-- local path that keeps the production restrictions: the deployment switch eye.execution.synthetic_loopback (EYE_EXECUTION_SYNTHETIC_LOOPBACK,
-- default off; config.ts) under which the product's ExecutionEgress carries a handoff over the pinned transport to an IPv4 loopback LITERAL
-- only for a target recorded synthetic whose endpoint host is that literal and whose trust anchor is declared (the anchor still verified,
-- the bearer still by reference). Everything else — and everything with the switch off — goes through the unchanged production vetting.
--
-- This section records WHICH PATH CARRIED EACH ATTEMPT and lets the database refuse the synthetic label where it cannot be true:
--   §X1 decision.execution_attempts.transport — generated from egress ->> 'transport' ('production' | 'synthetic-loopback'; NULL for an
--       attempt recorded before 0091 or one that never reached a transport, e.g. a retired target), CHECKed
--   §X2 the guard (BEFORE INSERT): an attempt labelled synthetic-loopback is refused unless its handoff's target is synthetic, declares a
--       trust anchor and names an https endpoint on an IPv4 loopback literal (127.0.0.0/8) — the service's rule, re-checked where it is recorded
--   §X3 decision.due_execution_handoffs (0090 §C copied whole): the tick's work list carries the target's `synthetic` flag, so a retry takes
--       the same path as the issue
-- No real ERP and no real-provider activation: every target is still synthetic (0090's CHECK and declare refusal are untouched).
-- Forward-only; 0090 untouched.

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- section `execution`
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- §X1 THE PATH ON THE ATTEMPT
ALTER TABLE decision.execution_attempts ADD COLUMN transport text GENERATED ALWAYS AS (egress ->> 'transport') STORED;
ALTER TABLE decision.execution_attempts ADD CONSTRAINT dea_transport CHECK (transport IS NULL OR transport IN ('production', 'synthetic-loopback'));
COMMENT ON COLUMN decision.execution_attempts.transport IS
  'B34-F2 (0091): the path that carried the attempt — production (the vetted egress) or synthetic-loopback (the deployment switch on, a synthetic target on a loopback literal with a declared anchor); NULL before 0091 or when no transport was attempted';

-- §X2 THE GUARD: the synthetic label only where it can be true
CREATE OR REPLACE FUNCTION decision.execution_attempt_transport_guard() RETURNS trigger
SECURITY DEFINER SET search_path = decision, public, pg_catalog, pg_temp AS $$
DECLARE t decision.execution_targets%ROWTYPE;
BEGIN
  IF (NEW.egress ->> 'transport') IS DISTINCT FROM 'synthetic-loopback' THEN RETURN NEW; END IF;
  SELECT x.* INTO t FROM decision.execution_handoffs h JOIN decision.execution_targets x ON x.target_id = h.target_id WHERE h.handoff_id = NEW.handoff_id;
  IF NOT FOUND OR t.synthetic IS NOT TRUE OR t.trust_anchor_pem IS NULL
     OR t.endpoint !~ '^https://127\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}(:[0-9]{1,5})?(/|$)' THEN
    RAISE EXCEPTION 'execution attempt rejected (transport): the synthetic loopback path carries only a synthetic target on an IPv4 loopback literal with a declared trust anchor (handoff %)', NEW.handoff_id
      USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.execution_attempt_transport_guard() FROM PUBLIC;
CREATE TRIGGER dea_transport_guard BEFORE INSERT ON decision.execution_attempts FOR EACH ROW EXECUTE FUNCTION decision.execution_attempt_transport_guard();

-- §X3 THE TICK'S WORK LIST (0090 §C copied whole; B34-F2: + the target's `synthetic`)
CREATE OR REPLACE FUNCTION decision.due_execution_handoffs(p_tenant uuid, p_domain uuid) RETURNS SETOF jsonb
SECURITY DEFINER SET search_path = decision, observation, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.attention.tick']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  RETURN QUERY SELECT jsonb_build_object('handoff_id', h.handoff_id, 'attempt', h.attempts + 1, 'payload', h.payload, 'payload_digest', h.payload_digest,
                                         'target', jsonb_build_object('target_key', t.target_key, 'endpoint', t.endpoint, 'trust_anchor_pem', t.trust_anchor_pem, 'credential_ref', t.credential_ref, 'state', t.state,
                                                                      'synthetic', t.synthetic /* B34-F2 (0091): the path of the retry is the issue's */))
    FROM decision.execution_handoffs h JOIN decision.execution_targets t ON t.target_id = h.target_id
   WHERE h.tenant_id = p_tenant AND h.domain_id = p_domain AND h.state = 'issuing' AND h.attempts < 5 AND h.next_attempt_at <= clock_timestamp()
   ORDER BY h.next_attempt_at, h.handoff_id LIMIT 20;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.due_execution_handoffs(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.due_execution_handoffs(uuid, uuid) TO eye_commit;

-- ═════════════════════════════════════════════════════════════════════════════════════
-- §F3 ─────────────────────────────────────────────────────────────────────────────────
-- B34-F2, found by the integrator's rehearsal of the positive scene on a copy of the demonstration: THE COMPENSATION CHAIN. 0090 §C5
-- marks a compensation done only when its compensating handoff is fully EFFECTED; a compensating handoff that is itself partially
-- effected (the residual reissued, half effected again) keeps its compensation in_progress even after its own residual is compensated
-- and it is reconciled — and the original handoff's reconcile then refuses forever (residual_undisposed, 1 live). decision.
-- reconcile_execution_handoff re-declared from 0090 with one addition: reconciling a compensating handoff from partially_effected or
-- failed (its residual disposed — the unchanged check) completes the compensation it carried out (compensation.done, by reconcile; the
-- compensation task resolved). Nothing else changes; the grants are restated.
CREATE OR REPLACE FUNCTION decision.reconcile_execution_handoff(p_tenant uuid, p_domain uuid, p_handoff uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE h decision.execution_handoffs%ROWTYPE; i decision.commitment_items%ROWTYPE; v_disposed int; v_live int; v_event uuid; v_ex jsonb; v_x uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.execution.reconcile']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'execution reconcile rejected (actor): recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO h FROM decision.execution_handoffs x WHERE x.handoff_id = p_handoff AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'execution reconcile rejected (unknown_handoff): no handoff % in this domain', p_handoff USING ERRCODE = '23503'; END IF;
  SELECT * INTO i FROM decision.commitment_items x WHERE x.item_id = h.item_id FOR UPDATE;
  IF p_actor NOT IN (i.owner_principal_id, coalesce(i.reviewer_principal_id, i.owner_principal_id)) THEN
    RAISE EXCEPTION 'execution reconcile rejected (not_party): the item''s owner or reviewer reconciles its handoff' USING ERRCODE = '42501';
  END IF;
  IF h.state NOT IN ('effected', 'partially_effected', 'failed') THEN
    RAISE EXCEPTION 'execution reconcile rejected (state): handoff % is %; a settled handoff is reconciled', p_handoff, h.state USING ERRCODE = '22023';
  END IF;
  IF h.state <> 'effected' THEN
    SELECT count(*) FILTER (WHERE c.state IN ('done', 'accepted')), count(*) FILTER (WHERE c.state IN ('proposed', 'assigned', 'in_progress'))
      INTO v_disposed, v_live FROM decision.execution_compensations c WHERE c.handoff_id = p_handoff;
    IF v_live > 0 OR v_disposed = 0 THEN
      RAISE EXCEPTION 'execution reconcile rejected (residual_undisposed): handoff % is % and its residual is not disposed (% compensation(s) disposed, % live) — assign a compensation and complete or co-sign it first',
        p_handoff, h.state, v_disposed, v_live USING ERRCODE = '22023';
    END IF;
  END IF;
  UPDATE decision.execution_handoffs SET state = 'reconciled', reconciled_by = p_actor, reconciled_at = clock_timestamp() WHERE handoff_id = p_handoff;
  -- 0091 §F3: a COMPENSATING handoff reconciled from partially_effected or failed — its own residual disposed (checked above) — completes
  -- the compensation it carried out; before 0091 only a fully effected compensating handoff did, so a chain (a reissue itself partially
  -- effected, its residual reissued again) left the first compensation in_progress and the original handoff never reconcilable
  IF h.compensation_id IS NOT NULL AND h.state IN ('partially_effected', 'failed') THEN
    UPDATE decision.execution_compensations SET state = 'done', disposed_at = clock_timestamp() WHERE compensation_id = h.compensation_id AND state = 'in_progress';
    IF FOUND THEN
      PERFORM decision._commitment_event(p_tenant, p_domain, h.commitment_id, h.item_id, 'compensation.done', p_actor,
                                         jsonb_build_object('compensation_id', h.compensation_id, 'handoff_id', p_handoff, 'by', 'reconcile'), p_correlation);
      PERFORM executive._resolve_human_tasks(p_tenant, p_domain, jsonb_build_object('kind', 'commitment_item', 'id', h.item_id), ARRAY['commitment.compensation'], 'done', h.compensation_id, p_actor, p_correlation);
    END IF;
  END IF;
  SELECT coalesce(jsonb_agg(exception_id), '[]'::jsonb) INTO v_ex FROM decision.commitment_exceptions x
   WHERE x.item_id = h.item_id AND x.source_ref = format('handoff:%s', p_handoff) AND x.state IN ('open', 'proposed');
  UPDATE decision.commitment_exceptions SET state = 'resolved', resolution = format('handoff %s reconciled: residual disposed', p_handoff), resolved_by = p_actor, resolved_at = clock_timestamp()
   WHERE item_id = h.item_id AND source_ref = format('handoff:%s', p_handoff) AND state IN ('open', 'proposed');
  FOR v_x IN SELECT (e #>> '{}')::uuid FROM jsonb_array_elements(v_ex) e LOOP
    PERFORM decision._commitment_event(p_tenant, p_domain, h.commitment_id, h.item_id, 'exception.resolved', p_actor, jsonb_build_object('exception_id', v_x, 'by', 'reconcile', 'handoff_id', p_handoff), p_correlation);
  END LOOP;
  UPDATE decision.commitment_items SET state = 'in_progress', version = version + 1, updated_at = clock_timestamp()
   WHERE item_id = h.item_id AND state = 'exception' AND NOT EXISTS (SELECT 1 FROM decision.commitment_exceptions x WHERE x.item_id = h.item_id AND x.state IN ('open', 'proposed'));
  v_event := decision._commitment_event(p_tenant, p_domain, h.commitment_id, h.item_id, 'handoff.reconciled', p_actor, jsonb_build_object('handoff_id', p_handoff, 'from', h.state, 'exceptions_resolved', v_ex), p_correlation);
  RETURN jsonb_build_object('handoff_id', p_handoff, 'state', 'reconciled', 'from', h.state, 'exceptions_resolved', v_ex, 'event_id', v_event, 'item', decision._commitment_item_answer(h.item_id));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.reconcile_execution_handoff(uuid, uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.reconcile_execution_handoff(uuid, uuid, uuid, uuid, uuid) TO eye_commit;
