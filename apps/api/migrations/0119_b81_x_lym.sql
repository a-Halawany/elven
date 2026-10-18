-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0119 §LY-M — CP-6 B81 part `lym`: MULTI-WINDOW COMPOSITION AND THE COMMAND ENVIRONMENT (F-P7-E-04: UX-16-001…006, PAT-45 session handoff,
-- PAT-46 large-display control, BP-05 the ≥ 1920 command composition). Part-local file (folded into the one 0119 at integration, in the
-- order §0, §DG, §CT, §SI, §LY); applies ALONE on 0001–0118 + the prelude + the wave-1 part files (0119_b81_x_{ct,dg,ha,lyg}).
--
-- THE GAP. A view could be opened in a second window or on a large display only as an unrelated page: nothing recorded WHICH window is the
-- authoritative control surface, nothing let a person move their review to another device except by signing in and finding it again, and a
-- mirrored display was indistinguishable from a control surface. UX-16-001…005 ask for shared context, synchronized views, ONE explicit
-- control surface, audience-safe presentation, and — when views drift, synchronisation fails, a display loses its classification context or
-- the control surface becomes unavailable — frozen mirrors, a divergence watermark, the last verified state kept, and control transferred
-- through sign-in on the claiming device.
--
-- THE MECHANISM (DESIGN D10: a handoff is the SAME PERSON's own signed-in session; mirrored / presentation displays carry no controls).
--   shell.session_handoffs          THE OFFER: a person's review context (workspace, location — route, object + version, selection —, the
--                                   context-bar dimensions it was read under) offered FROM one of their signed-in sessions, with an
--                                   expiry (1–30 minutes) and optionally the DISPLAY whose control it moves. Carries no role, no grant and
--                                   no token: nothing of the offering session's authority is in it. APPEND-ONLY.
--   shell.session_handoff_receipts  THE RECEIPT that closes an offer, at most ONE per offer (single use — the unique key): `claimed` by
--                                   ANOTHER active password session of the SAME principal (the person signed in on the claiming device:
--                                   control transferred through authentication), with the claiming session's OWN roles RE-READ from
--                                   identity.role_bindings at the claim (evidence that no authority was inherited); or `revoked` by the
--                                   person. Expiry is the clock's (no row: an unclaimed offer past its expiry is `expired`). APPEND-ONLY.
--   shell.presentation_states       a person's DISPLAY (a named surface: `operations-room`, `briefing-wall` …) as versioned states: what
--                                   it shows (the location and selection), the DATA WATERMARK (the instant the shown data is as of), the
--                                   CLASSIFICATION context, the AUDIENCE, the context-bar dimensions, and its CONTROL SURFACE (the one
--                                   session that may publish to it). A different session publishes only after control moved to it — by a
--                                   claimed handoff naming the display, or because the controlling session is no longer signed in (the
--                                   person re-authenticated: `reauthentication`); a second window never takes control silently.
--                                   `ended` withdraws what the display shows (presentation privacy). APPEND-ONLY versions; a publish that
--                                   read an older version is refused `(stale)`.
--   ports                           shell.offer_handoff / shell.claim_handoff / shell.revoke_handoff (`shell.handoff.{offer,claim,revoke}`)
--                                   and shell.publish_presentation (`shell.presentation.publish`): SECURITY DEFINER, eye_commit; the bound
--                                   action, the ESTABLISHED context's scope, the acting principal = eye_principal(), a NAMED ACTIVE HUMAN
--                                   and the CURRENT SESSION (public.eye_session(), active, the principal's own) re-checked in the port;
--                                   the ledger (shell.events). Reads shell.handoffs_of (`shell.handoff.read`) and shell.presentation_of
--                                   (`shell.presentation.read`): the principal's OWN rows only, guarded by the read scope.
--   RLS                             0118's per-principal idiom: FORCE RLS, SELECT to eye_app / eye_commit where principal_id =
--                                   eye_principal() (a principal id is global — a colleague in the same domain reads none of it).
--
-- THE BOUNDARY. A handoff or a presentation EXECUTES NOTHING: it moves where a person is looking and which of their own sessions is the
-- control surface. Every consequential act stays behind its page's Command Review and its own governed, human-gated port, evaluated under
-- the CLAIMING session's own roles. A presentation state names no command; a display renders none (apps/web/lib/windows-b81.ts).
--
-- Refusals in the class form `session handoff rejected (<class>): …` and `presentation state rejected (<class>): …` — 403 actor|access ·
-- 404 unknown_handoff|unknown_display · 409 state|stale|duplicate|expired · 422 the rest. NOTE (the integrator): the nouns `session
-- handoff` and `presentation state` are not mapped centrally yet (observation-errors.ts).
--
-- THREE CLAIMS: construction (this file, apps/api/src/shell/windows, apps/web/components/command-environment.tsx, lib/windows-b81.ts and the
-- harness phase6-handoffs-b81 — every persona, session, handoff and display there SYNTHETIC); demonstrated operation (the act: L. Brandt
-- offers the package review and claims it on a second browser context — SYNTHETIC persona); real acceptance (UX-16-006 → the shared
-- non-demonstration recording path at B111, then H3) — never claimed here.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- §LYM.0 THE VOCABULARY ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* The windows contract (apps/web/lib/windows-b81.ts WINDOWS_CONTRACT — the same string). */
CREATE OR REPLACE FUNCTION shell.windows_contract_version() RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT 'b81-lym-windows-1' $$;
/* Who a display is shown to: the person alone, a briefing room, an operations centre, a secure kiosk. */
CREATE OR REPLACE FUNCTION shell.presentation_audiences() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY['private', 'briefing_room', 'operations_centre', 'kiosk'] $$;
/* The classification context a display must carry (the context bar's classifications, B36 0094). */
CREATE OR REPLACE FUNCTION shell.presentation_classifications() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY['public', 'internal', 'confidential', 'restricted'] $$;
/* The handoff's bounded lifetime (seconds): one minute to thirty minutes; ten by default. */
CREATE OR REPLACE FUNCTION shell.handoff_expiry_bounds() RETURNS int[] LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY[60, 1800, 600] $$;
GRANT EXECUTE ON FUNCTION shell.windows_contract_version(), shell.presentation_audiences(), shell.presentation_classifications(), shell.handoff_expiry_bounds() TO eye_app, eye_commit;

/* The context-bar dimensions a view was read under (UX-16-002), validated key by key (null = admissible). */
CREATE OR REPLACE FUNCTION shell.view_context_problem(p jsonb) RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = shell, pg_catalog, pg_temp AS $$
DECLARE k text; v jsonb;
BEGIN
  IF p IS NULL OR jsonb_typeof(p) <> 'object' THEN RETURN 'the view context is an object'; END IF;
  IF length(p::text) > 2048 THEN RETURN 'the view context is at most 2 KiB'; END IF;
  FOR k, v IN SELECT * FROM jsonb_each(p) LOOP
    IF k NOT IN ('digest', 'objective_id', 'scenario_id', 'horizon', 'classification', 'effective_at', 'purpose') THEN
      RETURN format('the view context carries no key %s (digest, objective_id, scenario_id, horizon, classification, effective_at, purpose)', k);
    END IF;
    IF jsonb_typeof(v) NOT IN ('string', 'null') THEN RETURN format('the view context''s %s is a text or null', k); END IF;
  END LOOP;
  IF (p ->> 'digest') IS NOT NULL AND (p ->> 'digest') !~ '^[0-9a-f]{64}$' THEN RETURN 'the context digest is a sha-256 in hex'; END IF;
  IF (p ->> 'objective_id') IS NOT NULL AND (p ->> 'objective_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RETURN 'the objective is an id'; END IF;
  IF (p ->> 'scenario_id') IS NOT NULL AND (p ->> 'scenario_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RETURN 'the scenario is an id'; END IF;
  IF (p ->> 'horizon') IS NOT NULL AND (p ->> 'horizon') !~ '^[0-9]{1,3}[dmy]$' THEN RETURN 'the horizon is a span such as 90d or 12m'; END IF;
  IF (p ->> 'classification') IS NOT NULL AND NOT ((p ->> 'classification') = ANY (shell.presentation_classifications())) THEN RETURN 'the classification is public, internal, confidential or restricted'; END IF;
  IF (p ->> 'effective_at') IS NOT NULL AND (p ->> 'effective_at') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+(Z|[+-][0-9]{2}:[0-9]{2})$' THEN RETURN 'the effective time is an ISO instant'; END IF;
  IF (p ->> 'purpose') IS NOT NULL AND (p ->> 'purpose') !~ '^[a-z][a-z0-9_.-]{1,60}$' THEN RETURN 'the purpose is a purpose key'; END IF;
  RETURN NULL;
END $$;
/* A display's key: lower case, short. */
CREATE OR REPLACE FUNCTION shell.display_ok(p text) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$ SELECT p IS NOT NULL AND p ~ '^[a-z][a-z0-9_.-]{1,60}$' $$;
GRANT EXECUTE ON FUNCTION shell.view_context_problem(jsonb), shell.display_ok(text) TO eye_app, eye_commit;

/* The CURRENT session of the established context, when it is the principal's own, active, unexpired, signed-in session (null otherwise).
   Internal: read under the definer by the ports below (identity.sessions is not readable by eye_app / eye_commit). */
CREATE OR REPLACE FUNCTION shell.own_live_session(p_actor uuid, p_password_only boolean) RETURNS uuid
LANGUAGE sql SECURITY DEFINER SET search_path = identity, public, pg_catalog, pg_temp AS $$
  SELECT s.id FROM identity.sessions s
   WHERE s.id = public.eye_session() AND s.principal_id = p_actor AND s.status = 'active' AND s.expires_at > clock_timestamp()
     AND (NOT p_password_only OR s.assurance = 'password') $$;
/* Is a session (any of the principal's) still signed in? Used to decide whether a display's control surface is AVAILABLE. */
CREATE OR REPLACE FUNCTION shell.session_live(p_session uuid) RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = identity, public, pg_catalog, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM identity.sessions s WHERE s.id = p_session AND s.status = 'active' AND s.expires_at > clock_timestamp()) $$;
REVOKE ALL ON FUNCTION shell.own_live_session(uuid, boolean), shell.session_live(uuid) FROM PUBLIC;

-- §LYM.1 THE HANDOFFS ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE shell.session_handoffs (
  handoff_id        uuid PRIMARY KEY,
  principal_id      uuid NOT NULL,
  scope             text NOT NULL CHECK (scope IN ('PLATFORM', 'TENANT', 'DOMAIN')),
  tenant_id         uuid,
  domain_id         uuid,
  workspace         text NOT NULL CHECK (workspace = ANY (shell.workspace_keys())),
  location          jsonb NOT NULL CHECK (shell.location_problem(location) IS NULL AND length(location::text) <= 16384),
  view_context      jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (shell.view_context_problem(view_context) IS NULL),
  display           text CHECK (display IS NULL OR shell.display_ok(display)),
  target_device     text CHECK (target_device IS NULL OR target_device ~ '^[A-Za-z0-9 _.()-]{1,40}$'),
  offering_session  uuid NOT NULL,
  offered_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at        timestamptz NOT NULL,
  contract          text NOT NULL,
  digest            text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  correlation_id    uuid NOT NULL,
  CONSTRAINT sho_scope_shape CHECK ((scope = 'PLATFORM' AND tenant_id IS NULL AND domain_id IS NULL) OR (scope <> 'PLATFORM' AND tenant_id IS NOT NULL AND domain_id IS NOT NULL)),
  CONSTRAINT sho_workspace_scope CHECK ((workspace = 'admin') = (scope = 'PLATFORM')),
  CONSTRAINT sho_expiry CHECK (expires_at > offered_at AND expires_at <= offered_at + interval '30 minutes'),
  CONSTRAINT sho_route_in_workspace CHECK ((location ->> 'route') = shell.workspace_prefix(workspace) OR (location ->> 'route') LIKE shell.workspace_prefix(workspace) || '/%')
);
CREATE INDEX sho_principal ON shell.session_handoffs (principal_id, offered_at DESC);
CREATE TRIGGER sho_append_only BEFORE UPDATE OR DELETE ON shell.session_handoffs FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
ALTER TABLE shell.session_handoffs ENABLE ROW LEVEL SECURITY;
ALTER TABLE shell.session_handoffs FORCE ROW LEVEL SECURITY;
/* a principal reads its OWN handoffs only (a principal id is global: the same domain's colleague reads none of them) */
CREATE POLICY sho_own ON shell.session_handoffs FOR SELECT TO eye_app, eye_commit USING (principal_id = public.eye_principal());
GRANT SELECT ON shell.session_handoffs TO eye_app, eye_commit;
COMMENT ON TABLE shell.session_handoffs IS 'B81 §LY-M (0119; PAT-45): a person''s review context offered from one of their signed-in sessions to another — append-only, bounded expiry, no role, no grant, no token (authority is never inherited).';

CREATE TABLE shell.session_handoff_receipts (
  receipt_id        uuid PRIMARY KEY,
  handoff_id        uuid NOT NULL REFERENCES shell.session_handoffs (handoff_id),
  principal_id      uuid NOT NULL,
  outcome           text NOT NULL CHECK (outcome IN ('claimed', 'revoked')),
  acting_session    uuid NOT NULL,
  claiming_session  uuid,
  roles_at_claim    text[],
  reason            text CHECK (reason IS NULL OR length(reason) BETWEEN 1 AND 400),
  closed_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id    uuid NOT NULL,
  CONSTRAINT shr_claim_shape CHECK ((outcome = 'claimed') = (claiming_session IS NOT NULL AND roles_at_claim IS NOT NULL)),
  CONSTRAINT shr_claim_session CHECK (outcome <> 'claimed' OR claiming_session = acting_session)
);
/* SINGLE USE: one receipt per offer — a second claim (or a claim after a revocation) has nowhere to go */
CREATE UNIQUE INDEX shr_single_use ON shell.session_handoff_receipts (handoff_id);
CREATE INDEX shr_principal ON shell.session_handoff_receipts (principal_id, closed_at DESC);
CREATE TRIGGER shr_append_only BEFORE UPDATE OR DELETE ON shell.session_handoff_receipts FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
ALTER TABLE shell.session_handoff_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE shell.session_handoff_receipts FORCE ROW LEVEL SECURITY;
CREATE POLICY shr_own ON shell.session_handoff_receipts FOR SELECT TO eye_app, eye_commit USING (principal_id = public.eye_principal());
GRANT SELECT ON shell.session_handoff_receipts TO eye_app, eye_commit;
COMMENT ON TABLE shell.session_handoff_receipts IS 'B81 §LY-M (0119; PAT-45): the one receipt that closes a handoff — claimed by another signed-in session of the same person (its own roles re-read) or revoked; single use; append-only.';

/* The state of one handoff at the database clock. */
CREATE OR REPLACE FUNCTION shell.handoff_status(p_expires timestamptz, p_outcome text) RETURNS text LANGUAGE sql AS $$
  SELECT CASE WHEN p_outcome IS NOT NULL THEN p_outcome WHEN clock_timestamp() >= p_expires THEN 'expired' ELSE 'open' END $$;
GRANT EXECUTE ON FUNCTION shell.handoff_status(timestamptz, text) TO eye_app, eye_commit;

-- §LYM.2 THE PRESENTATION STATES ──────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE shell.presentation_states (
  state_id          uuid PRIMARY KEY,
  principal_id      uuid NOT NULL,
  scope             text NOT NULL CHECK (scope IN ('TENANT', 'DOMAIN')),   -- a display shows a domain's work (no PLATFORM display)
  tenant_id         uuid NOT NULL,
  domain_id         uuid NOT NULL,
  display           text NOT NULL CHECK (shell.display_ok(display)),
  version           int NOT NULL CHECK (version >= 1),
  supersedes        uuid REFERENCES shell.presentation_states (state_id),
  status            text NOT NULL CHECK (status IN ('presenting', 'ended')),
  location          jsonb CHECK (location IS NULL OR (shell.location_problem(location) IS NULL AND length(location::text) <= 16384)),
  view_context      jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (shell.view_context_problem(view_context) IS NULL),
  watermark         timestamptz,
  classification    text CHECK (classification IS NULL OR classification = ANY (shell.presentation_classifications())),
  audience          text CHECK (audience IS NULL OR audience = ANY (shell.presentation_audiences())),
  control_session   uuid NOT NULL,
  transfer          text CHECK (transfer IS NULL OR transfer IN ('handoff', 'reauthentication')),
  handoff_id        uuid REFERENCES shell.session_handoffs (handoff_id),
  contract          text NOT NULL,
  digest            text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  published_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id    uuid NOT NULL,
  CONSTRAINT prs_version_chain CHECK ((version = 1) = (supersedes IS NULL)),
  /* a presenting state names what it shows, the instant its data is as of, its classification and its audience; an ended one shows nothing */
  CONSTRAINT prs_presenting_shape CHECK (
    (status = 'presenting' AND location IS NOT NULL AND watermark IS NOT NULL AND classification IS NOT NULL AND audience IS NOT NULL)
    OR (status = 'ended' AND location IS NULL AND watermark IS NULL AND classification IS NULL AND audience IS NULL)),
  CONSTRAINT prs_watermark_past CHECK (watermark IS NULL OR watermark <= published_at),
  CONSTRAINT prs_transfer_shape CHECK ((transfer IS NOT DISTINCT FROM 'handoff') = (handoff_id IS NOT NULL))
);
CREATE UNIQUE INDEX prs_one_version ON shell.presentation_states (principal_id, display, version);
CREATE UNIQUE INDEX prs_one_successor ON shell.presentation_states (supersedes) WHERE supersedes IS NOT NULL;
CREATE INDEX prs_principal ON shell.presentation_states (principal_id, display, published_at DESC);
CREATE TRIGGER prs_append_only BEFORE UPDATE OR DELETE ON shell.presentation_states FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
ALTER TABLE shell.presentation_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE shell.presentation_states FORCE ROW LEVEL SECURITY;
CREATE POLICY prs_own ON shell.presentation_states FOR SELECT TO eye_app, eye_commit USING (principal_id = public.eye_principal());
GRANT SELECT ON shell.presentation_states TO eye_app, eye_commit;
COMMENT ON TABLE shell.presentation_states IS 'B81 §LY-M (0119; PAT-46, UX-16-002): a person''s display as versioned states — what it shows, the data watermark, the classification, the audience and the ONE control surface; append-only; presentation only (no command).';

/* One state as the reads answer it (the control surface's availability and whether it is the reading session are evaluated now). */
CREATE OR REPLACE FUNCTION shell.presentation_view(s shell.presentation_states) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = shell, public, pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object('state_id', s.state_id, 'display', s.display, 'version', s.version, 'supersedes', s.supersedes, 'status', s.status,
    'location', s.location, 'view_context', s.view_context, 'watermark', s.watermark, 'classification', s.classification, 'audience', s.audience,
    'control_session_here', s.control_session = public.eye_session(), 'control_available', shell.session_live(s.control_session),
    'transfer', s.transfer, 'handoff_id', s.handoff_id, 'contract', s.contract, 'digest', s.digest, 'published_at', s.published_at,
    'tenant_id', s.tenant_id, 'domain_id', s.domain_id) $$;
REVOKE ALL ON FUNCTION shell.presentation_view(shell.presentation_states) FROM PUBLIC;

-- §LYM.3 THE OFFER (`shell.handoff.offer`) ─────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION shell.offer_handoff(
  p_handoff_id uuid, p_tenant uuid, p_domain uuid, p_workspace text, p_location jsonb, p_view_context jsonb, p_display text, p_target_device text,
  p_expires_in int, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = shell, observation, identity, public, pg_catalog, pg_temp AS $$
DECLARE
  v_scope text := public.eye_scope();
  v_kind text; v_status text; v_session uuid; v_problem text;
  v_bounds int[] := shell.handoff_expiry_bounds();
  v_seconds int := coalesce(p_expires_in, (shell.handoff_expiry_bounds())[3]);
  v_ctx jsonb := coalesce(p_view_context, '{}'::jsonb);
  v_open int; v_disp shell.presentation_states%ROWTYPE; v_digest text; v_row shell.session_handoffs%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['shell.handoff.offer']);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN
    RAISE EXCEPTION 'session handoff rejected (actor): a handoff is offered by its own principal, never on another''s behalf' USING ERRCODE = '42501';
  END IF;
  SELECT p.kind, p.status INTO v_kind, v_status FROM identity.principals p WHERE p.id = p_actor;
  IF v_kind IS DISTINCT FROM 'human' OR v_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'session handoff rejected (actor): a handoff is a named, active human''s own — an agent or a workload hands nothing off' USING ERRCODE = '42501';
  END IF;
  v_session := shell.own_live_session(p_actor, false);
  IF v_session IS NULL THEN
    RAISE EXCEPTION 'session handoff rejected (actor): a handoff is offered from your own signed-in session (this session is not active) — sign in again' USING ERRCODE = '42501';
  END IF;
  -- the scope is the ESTABLISHED context's, never an argument's
  IF v_scope = 'PLATFORM' THEN
    IF p_tenant IS NOT NULL OR p_domain IS NOT NULL THEN
      RAISE EXCEPTION 'session handoff rejected (access): a PLATFORM context offers with no tenant and no domain' USING ERRCODE = '42501';
    END IF;
  ELSIF p_tenant IS NULL OR p_domain IS NULL OR p_tenant IS DISTINCT FROM public.eye_tenant()
        OR (v_scope = 'DOMAIN' AND p_domain IS DISTINCT FROM public.eye_domain()) THEN
    RAISE EXCEPTION 'session handoff rejected (access): a handoff is offered in the established context''s own tenant and domain' USING ERRCODE = '42501';
  END IF;
  IF p_workspace IS NULL OR NOT (p_workspace = ANY (shell.workspace_keys())) THEN
    RAISE EXCEPTION 'session handoff rejected (workspace): % is not a workspace of the shell (%)', coalesce(p_workspace, '<none>'), array_to_string(shell.workspace_keys(), ', ') USING ERRCODE = '22023';
  END IF;
  IF (p_workspace = 'admin') <> (v_scope = 'PLATFORM') THEN
    RAISE EXCEPTION 'session handoff rejected (workspace): the admin workspace is the PLATFORM''s; every other workspace is a domain''s' USING ERRCODE = '22023';
  END IF;
  v_problem := shell.location_problem(p_location);
  IF v_problem IS NOT NULL THEN RAISE EXCEPTION 'session handoff rejected (location): %', v_problem USING ERRCODE = '22023'; END IF;
  IF NOT ((p_location ->> 'route') = shell.workspace_prefix(p_workspace) OR (p_location ->> 'route') LIKE shell.workspace_prefix(p_workspace) || '/%') THEN
    RAISE EXCEPTION 'session handoff rejected (location): % is not a location of the % workspace (%…)', p_location ->> 'route', p_workspace, shell.workspace_prefix(p_workspace) USING ERRCODE = '22023';
  END IF;
  IF length(p_location::text) > 16384 THEN RAISE EXCEPTION 'session handoff rejected (location): the location is at most 16 KiB' USING ERRCODE = '22023'; END IF;
  v_problem := shell.view_context_problem(v_ctx);
  IF v_problem IS NOT NULL THEN RAISE EXCEPTION 'session handoff rejected (context): %', v_problem USING ERRCODE = '22023'; END IF;
  IF p_target_device IS NOT NULL AND p_target_device !~ '^[A-Za-z0-9 _.()-]{1,40}$' THEN
    RAISE EXCEPTION 'session handoff rejected (device): the target device is a short label (tablet, large display …)' USING ERRCODE = '22023';
  END IF;
  IF v_seconds < v_bounds[1] OR v_seconds > v_bounds[2] THEN
    RAISE EXCEPTION 'session handoff rejected (expiry): a handoff lives % to % seconds (% by default) — never open-ended', v_bounds[1], v_bounds[2], v_bounds[3] USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('shell.session_handoffs:' || p_actor, 0));
  IF p_display IS NOT NULL THEN
    IF NOT shell.display_ok(p_display) THEN
      RAISE EXCEPTION 'session handoff rejected (display): a display is named in lower case (operations-room, briefing-wall)' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO v_disp FROM shell.presentation_states s WHERE s.principal_id = p_actor AND s.display = p_display ORDER BY s.version DESC LIMIT 1;
    IF v_disp.state_id IS NULL THEN
      RAISE EXCEPTION 'session handoff rejected (unknown_display): you present nothing on the display %', p_display USING ERRCODE = 'P0002';
    END IF;
    IF v_disp.control_session IS DISTINCT FROM v_session THEN
      RAISE EXCEPTION 'session handoff rejected (state): the display % is controlled by another of your sessions — only its control surface hands its control off', p_display USING ERRCODE = '23514';
    END IF;
  END IF;
  SELECT count(*) INTO v_open FROM shell.session_handoffs h
   WHERE h.principal_id = p_actor AND h.expires_at > clock_timestamp()
     AND NOT EXISTS (SELECT 1 FROM shell.session_handoff_receipts r WHERE r.handoff_id = h.handoff_id);
  IF v_open >= 5 THEN
    RAISE EXCEPTION 'session handoff rejected (state): you have % open handoffs — claim, revoke or let one expire before offering another', v_open USING ERRCODE = '23514';
  END IF;
  v_digest := encode(sha256(convert_to(jsonb_build_object('workspace', p_workspace, 'location', p_location, 'view_context', v_ctx, 'display', p_display,
                                                           'contract', shell.windows_contract_version())::text, 'UTF8')), 'hex');
  INSERT INTO shell.session_handoffs (handoff_id, principal_id, scope, tenant_id, domain_id, workspace, location, view_context, display, target_device,
                                      offering_session, expires_at, contract, digest, correlation_id)
  VALUES (p_handoff_id, p_actor, v_scope, p_tenant, p_domain, p_workspace, p_location, v_ctx, p_display, p_target_device,
          v_session, clock_timestamp() + make_interval(secs => v_seconds), shell.windows_contract_version(), v_digest, p_correlation)
  RETURNING * INTO v_row;
  PERFORM shell.ledger(p_tenant, p_domain, p_actor, 'session_handoff', p_handoff_id, 1, 'shell.handoff.offered',
                       jsonb_build_object('workspace', p_workspace, 'route', p_location ->> 'route', 'display', p_display, 'expires_at', v_row.expires_at, 'digest', v_digest), p_correlation);
  RETURN jsonb_build_object('handoff_id', v_row.handoff_id, 'status', 'open', 'scope', v_row.scope, 'tenant_id', v_row.tenant_id, 'domain_id', v_row.domain_id,
    'workspace', v_row.workspace, 'location', v_row.location, 'view_context', v_row.view_context, 'display', v_row.display, 'target_device', v_row.target_device,
    'offered_at', v_row.offered_at, 'expires_at', v_row.expires_at, 'offered_here', true, 'contract', v_row.contract, 'digest', v_row.digest,
    'claim', 'an offer of your review context to another of your own signed-in sessions — it carries no role and no grant; the claiming session acts only with its own authority');
END $$;
REVOKE ALL ON FUNCTION shell.offer_handoff(uuid, uuid, uuid, text, jsonb, jsonb, text, text, int, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION shell.offer_handoff(uuid, uuid, uuid, text, jsonb, jsonb, text, text, int, uuid, uuid) TO eye_commit;

-- §LYM.4 THE CLAIM (`shell.handoff.claim`) ─────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION shell.claim_handoff(p_handoff_id uuid, p_receipt_id uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = shell, observation, identity, public, pg_catalog, pg_temp AS $$
DECLARE
  v_scope text := public.eye_scope();
  v_kind text; v_status text; v_session uuid;
  h shell.session_handoffs%ROWTYPE; r shell.session_handoff_receipts%ROWTYPE;
  v_roles text[]; v_disp shell.presentation_states%ROWTYPE; v_moved jsonb := NULL; v_ps shell.presentation_states%ROWTYPE; v_pdigest text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['shell.handoff.claim']);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN
    RAISE EXCEPTION 'session handoff rejected (actor): a handoff is claimed by its own principal, never on another''s behalf' USING ERRCODE = '42501';
  END IF;
  SELECT p.kind, p.status INTO v_kind, v_status FROM identity.principals p WHERE p.id = p_actor;
  IF v_kind IS DISTINCT FROM 'human' OR v_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'session handoff rejected (actor): a handoff is claimed by a named, active human — an agent or a workload claims nothing' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('shell.session_handoff:' || coalesce(p_handoff_id::text, ''), 0));
  SELECT * INTO h FROM shell.session_handoffs x WHERE x.handoff_id = p_handoff_id;
  IF h.handoff_id IS NULL THEN
    RAISE EXCEPTION 'session handoff rejected (unknown_handoff): no handoff %', p_handoff_id USING ERRCODE = 'P0002';
  END IF;
  IF h.principal_id IS DISTINCT FROM p_actor THEN
    RAISE EXCEPTION 'session handoff rejected (actor): a handoff is claimed only by the person who offered it — control never passes to another person' USING ERRCODE = '42501';
  END IF;
  IF (v_scope = 'PLATFORM') <> (h.scope = 'PLATFORM') OR h.tenant_id IS DISTINCT FROM public.eye_tenant()
     OR (v_scope = 'DOMAIN' AND h.domain_id IS DISTINCT FROM public.eye_domain()) THEN
    RAISE EXCEPTION 'session handoff rejected (access): the handoff was offered in another context — claim it in its own tenant and domain' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO r FROM shell.session_handoff_receipts x WHERE x.handoff_id = h.handoff_id;
  IF r.receipt_id IS NOT NULL AND r.outcome = 'claimed' THEN
    RAISE EXCEPTION 'session handoff rejected (duplicate): the handoff was claimed at % — a handoff is single use; offer a new one', r.closed_at USING ERRCODE = '23505';
  END IF;
  IF r.receipt_id IS NOT NULL THEN
    RAISE EXCEPTION 'session handoff rejected (state): the handoff was revoked at % — nothing moved; offer a new one', r.closed_at USING ERRCODE = '23514';
  END IF;
  IF clock_timestamp() >= h.expires_at THEN
    RAISE EXCEPTION 'session handoff rejected (expired): the handoff expired at % — nothing moved; offer a new one from the session that holds the review', h.expires_at USING ERRCODE = '23514';
  END IF;
  -- the claiming device's OWN sign-in: the principal's active PASSWORD session (control is transferred through authentication)
  v_session := shell.own_live_session(p_actor, true);
  IF v_session IS NULL THEN
    RAISE EXCEPTION 'session handoff rejected (actor): a handoff is claimed from your own signed-in session (sign in with your password on this device)' USING ERRCODE = '42501';
  END IF;
  IF v_session = h.offering_session THEN
    RAISE EXCEPTION 'session handoff rejected (state): this is the session that offered the handoff — claim it from your other signed-in session (another device or browser)' USING ERRCODE = '23514';
  END IF;
  -- NO AUTHORITY INHERITANCE: the claiming session's OWN role bindings, re-read now (the offer carries none)
  SELECT coalesce(array_agg(DISTINCT b.role_code ORDER BY b.role_code), ARRAY[]::text[]) INTO v_roles FROM identity.role_bindings b
   WHERE b.principal_id = p_actor AND b.revoked_at IS NULL
     AND (b.scope = 'PLATFORM' OR (b.scope = 'TENANT' AND b.tenant_id = h.tenant_id) OR (b.scope = 'DOMAIN' AND b.tenant_id = h.tenant_id AND b.domain_id = h.domain_id));
  -- the display's control moves with the claim (a new version of its state: same content, the claiming session its control surface)
  IF h.display IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('shell.presentation_states:' || p_actor || ':' || h.display, 0));
    SELECT * INTO v_disp FROM shell.presentation_states s WHERE s.principal_id = p_actor AND s.display = h.display ORDER BY s.version DESC LIMIT 1;
    IF v_disp.state_id IS NOT NULL AND v_disp.control_session IS DISTINCT FROM h.offering_session THEN
      RAISE EXCEPTION 'session handoff rejected (stale): the display %''s control moved since this handoff was offered (now version %) — nothing moved; offer a new one', h.display, v_disp.version USING ERRCODE = '23514';
    END IF;
  END IF;
  INSERT INTO shell.session_handoff_receipts (receipt_id, handoff_id, principal_id, outcome, acting_session, claiming_session, roles_at_claim, correlation_id)
  VALUES (p_receipt_id, h.handoff_id, p_actor, 'claimed', v_session, v_session, v_roles, p_correlation) RETURNING * INTO r;
  IF v_disp.state_id IS NOT NULL THEN
    v_pdigest := encode(sha256(convert_to(jsonb_build_object('display', v_disp.display, 'status', v_disp.status, 'location', v_disp.location, 'view_context', v_disp.view_context,
      'watermark', v_disp.watermark, 'classification', v_disp.classification, 'audience', v_disp.audience, 'contract', shell.windows_contract_version())::text, 'UTF8')), 'hex');
    INSERT INTO shell.presentation_states (state_id, principal_id, scope, tenant_id, domain_id, display, version, supersedes, status, location, view_context, watermark,
                                           classification, audience, control_session, transfer, handoff_id, contract, digest, correlation_id)
    VALUES (gen_random_uuid(), p_actor, v_disp.scope, v_disp.tenant_id, v_disp.domain_id, v_disp.display, v_disp.version + 1, v_disp.state_id, v_disp.status, v_disp.location,
            v_disp.view_context, v_disp.watermark, v_disp.classification, v_disp.audience, v_session, 'handoff', h.handoff_id, shell.windows_contract_version(), v_pdigest, p_correlation)
    RETURNING * INTO v_ps;
    PERFORM shell.ledger(v_ps.tenant_id, v_ps.domain_id, p_actor, 'presentation_state', v_ps.state_id, v_ps.version, 'shell.presentation.control_moved',
                         jsonb_build_object('display', v_ps.display, 'handoff_id', h.handoff_id, 'supersedes', v_disp.state_id), p_correlation);
    v_moved := shell.presentation_view(v_ps);
  END IF;
  PERFORM shell.ledger(h.tenant_id, h.domain_id, p_actor, 'session_handoff', h.handoff_id, 2, 'shell.handoff.claimed',
                       jsonb_build_object('receipt_id', r.receipt_id, 'roles_at_claim', to_jsonb(v_roles), 'display', h.display, 'digest', h.digest), p_correlation);
  RETURN jsonb_build_object('handoff_id', h.handoff_id, 'status', 'claimed',
    'receipt', jsonb_build_object('receipt_id', r.receipt_id, 'outcome', r.outcome, 'closed_at', r.closed_at, 'claimed_here', true),
    'workspace', h.workspace, 'location', h.location, 'view_context', h.view_context, 'display', h.display, 'offered_at', h.offered_at, 'expires_at', h.expires_at,
    'digest', h.digest, 'presentation', v_moved,
    'authority', jsonb_build_object('inherited', false, 'roles', to_jsonb(v_roles),
      'basis', 'your own role bindings in this scope, re-read at the claim — nothing of the offering session''s authority passes; every act is evaluated again under this session'),
    'previous_surface', 'the session that offered the handoff is no longer the control surface for this review',
    'claim', 'the review context moved to this session; nothing was executed');
END $$;
REVOKE ALL ON FUNCTION shell.claim_handoff(uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION shell.claim_handoff(uuid, uuid, uuid, uuid) TO eye_commit;

-- §LYM.5 THE REVOCATION (`shell.handoff.revoke`) ──────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION shell.revoke_handoff(p_handoff_id uuid, p_receipt_id uuid, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = shell, observation, identity, public, pg_catalog, pg_temp AS $$
DECLARE
  v_scope text := public.eye_scope();
  v_kind text; v_status text; v_session uuid;
  h shell.session_handoffs%ROWTYPE; r shell.session_handoff_receipts%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['shell.handoff.revoke']);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN
    RAISE EXCEPTION 'session handoff rejected (actor): a handoff is revoked by its own principal, never on another''s behalf' USING ERRCODE = '42501';
  END IF;
  SELECT p.kind, p.status INTO v_kind, v_status FROM identity.principals p WHERE p.id = p_actor;
  IF v_kind IS DISTINCT FROM 'human' OR v_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'session handoff rejected (actor): a handoff is revoked by a named, active human' USING ERRCODE = '42501';
  END IF;
  v_session := shell.own_live_session(p_actor, false);
  IF v_session IS NULL THEN
    RAISE EXCEPTION 'session handoff rejected (actor): a handoff is revoked from your own signed-in session — sign in again' USING ERRCODE = '42501';
  END IF;
  IF p_reason IS NOT NULL AND (length(btrim(p_reason)) < 1 OR length(p_reason) > 400) THEN
    RAISE EXCEPTION 'session handoff rejected (reason): a reason is 1–400 characters (or none)' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('shell.session_handoff:' || coalesce(p_handoff_id::text, ''), 0));
  SELECT * INTO h FROM shell.session_handoffs x WHERE x.handoff_id = p_handoff_id;
  IF h.handoff_id IS NULL THEN
    RAISE EXCEPTION 'session handoff rejected (unknown_handoff): no handoff %', p_handoff_id USING ERRCODE = 'P0002';
  END IF;
  IF h.principal_id IS DISTINCT FROM p_actor THEN
    RAISE EXCEPTION 'session handoff rejected (actor): a handoff is revoked only by the person who offered it' USING ERRCODE = '42501';
  END IF;
  IF (v_scope = 'PLATFORM') <> (h.scope = 'PLATFORM') OR h.tenant_id IS DISTINCT FROM public.eye_tenant()
     OR (v_scope = 'DOMAIN' AND h.domain_id IS DISTINCT FROM public.eye_domain()) THEN
    RAISE EXCEPTION 'session handoff rejected (access): the handoff was offered in another context — revoke it in its own tenant and domain' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO r FROM shell.session_handoff_receipts x WHERE x.handoff_id = h.handoff_id;
  IF r.receipt_id IS NOT NULL AND r.outcome = 'revoked' THEN
    RAISE EXCEPTION 'session handoff rejected (duplicate): the handoff was already revoked at %', r.closed_at USING ERRCODE = '23505';
  END IF;
  IF r.receipt_id IS NOT NULL THEN
    RAISE EXCEPTION 'session handoff rejected (state): the handoff was claimed at % — control already moved; to move it back, offer a new handoff from the claiming session', r.closed_at USING ERRCODE = '23514';
  END IF;
  IF clock_timestamp() >= h.expires_at THEN
    RAISE EXCEPTION 'session handoff rejected (expired): the handoff expired at % — it can no longer be claimed, so there is nothing to revoke', h.expires_at USING ERRCODE = '23514';
  END IF;
  INSERT INTO shell.session_handoff_receipts (receipt_id, handoff_id, principal_id, outcome, acting_session, reason, correlation_id)
  VALUES (p_receipt_id, h.handoff_id, p_actor, 'revoked', v_session, p_reason, p_correlation) RETURNING * INTO r;
  PERFORM shell.ledger(h.tenant_id, h.domain_id, p_actor, 'session_handoff', h.handoff_id, 2, 'shell.handoff.revoked',
                       jsonb_build_object('receipt_id', r.receipt_id, 'reason', p_reason), p_correlation);
  RETURN jsonb_build_object('handoff_id', h.handoff_id, 'status', 'revoked',
    'receipt', jsonb_build_object('receipt_id', r.receipt_id, 'outcome', r.outcome, 'closed_at', r.closed_at, 'reason', r.reason),
    'claim', 'the offer can no longer be claimed; the offer and its revocation stay recorded, and nothing else changed');
END $$;
REVOKE ALL ON FUNCTION shell.revoke_handoff(uuid, uuid, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION shell.revoke_handoff(uuid, uuid, text, uuid, uuid) TO eye_commit;

-- §LYM.6 THE OWN READ OF THE HANDOFFS (`shell.handoff.read`) ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION shell.handoffs_of(p_principal uuid, p_tenant uuid, p_domain uuid, p_limit int) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = shell, observation, public, pg_catalog, pg_temp AS $$
DECLARE v_scope text := public.eye_scope(); v_out jsonb; v_here uuid := public.eye_session();
BEGIN
  IF p_principal IS NULL OR p_principal IS DISTINCT FROM public.eye_principal() THEN
    RAISE EXCEPTION 'session handoff rejected (actor): a principal reads only its own handoffs' USING ERRCODE = '42501';
  END IF;
  IF v_scope = 'PLATFORM' THEN
    IF p_tenant IS NOT NULL OR p_domain IS NOT NULL THEN
      RAISE EXCEPTION 'session handoff rejected (access): a PLATFORM context reads with no tenant and no domain' USING ERRCODE = '42501';
    END IF;
  ELSIF p_domain IS NULL OR NOT observation.read_scope_ok(p_tenant, p_domain) THEN
    RAISE EXCEPTION 'session handoff rejected (access): a handoff is read only within the caller''s bound tenant and domain' USING ERRCODE = '42501';
  END IF;
  SELECT coalesce(jsonb_agg(x.o ORDER BY x.offered_at DESC), '[]'::jsonb) INTO v_out FROM (
    SELECT h.offered_at, jsonb_build_object('handoff_id', h.handoff_id, 'status', shell.handoff_status(h.expires_at, r.outcome),
      'workspace', h.workspace, 'location', h.location, 'view_context', h.view_context, 'display', h.display, 'target_device', h.target_device,
      'offered_at', h.offered_at, 'expires_at', h.expires_at, 'offered_here', h.offering_session = v_here, 'digest', h.digest,
      'receipt', CASE WHEN r.receipt_id IS NULL THEN NULL ELSE jsonb_build_object('receipt_id', r.receipt_id, 'outcome', r.outcome, 'closed_at', r.closed_at,
        'claimed_here', r.claiming_session = v_here, 'roles_at_claim', to_jsonb(r.roles_at_claim), 'reason', r.reason) END) AS o
      FROM shell.session_handoffs h LEFT JOIN shell.session_handoff_receipts r ON r.handoff_id = h.handoff_id
     WHERE h.principal_id = p_principal AND h.tenant_id IS NOT DISTINCT FROM p_tenant AND h.domain_id IS NOT DISTINCT FROM p_domain
     ORDER BY h.offered_at DESC LIMIT greatest(1, least(coalesce(p_limit, 20), 100))) x;
  RETURN jsonb_build_object('principal_id', p_principal, 'scope', v_scope, 'tenant_id', p_tenant, 'domain_id', p_domain, 'read_at', clock_timestamp(),
    'contract', shell.windows_contract_version(), 'handoffs', v_out,
    'claim', 'your own handoffs — offers of a review context between your own signed-in sessions; none carries authority');
END $$;
REVOKE ALL ON FUNCTION shell.handoffs_of(uuid, uuid, uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION shell.handoffs_of(uuid, uuid, uuid, int) TO eye_app, eye_commit;

-- §LYM.7 THE PUBLICATION (`shell.presentation.publish`) ──────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION shell.publish_presentation(
  p_state_id uuid, p_tenant uuid, p_domain uuid, p_display text, p_expected_version int, p_status text, p_location jsonb, p_view_context jsonb,
  p_watermark timestamptz, p_classification text, p_audience text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = shell, observation, identity, public, pg_catalog, pg_temp AS $$
DECLARE
  v_scope text := public.eye_scope();
  v_kind text; v_status text; v_session uuid; v_problem text;
  v_ctx jsonb := coalesce(p_view_context, '{}'::jsonb);
  v_cur shell.presentation_states%ROWTYPE; v_row shell.presentation_states%ROWTYPE;
  v_version int; v_digest text; v_transfer text := NULL;
BEGIN
  PERFORM observation.assert_authority(ARRAY['shell.presentation.publish']);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN
    RAISE EXCEPTION 'presentation state rejected (actor): a display is published by its own principal, never on another''s behalf' USING ERRCODE = '42501';
  END IF;
  SELECT p.kind, p.status INTO v_kind, v_status FROM identity.principals p WHERE p.id = p_actor;
  IF v_kind IS DISTINCT FROM 'human' OR v_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'presentation state rejected (actor): a display is a named, active human''s own — an agent or a workload presents nothing' USING ERRCODE = '42501';
  END IF;
  v_session := shell.own_live_session(p_actor, false);
  IF v_session IS NULL THEN
    RAISE EXCEPTION 'presentation state rejected (actor): a display is published from your own signed-in session — sign in again' USING ERRCODE = '42501';
  END IF;
  IF v_scope = 'PLATFORM' OR p_tenant IS NULL OR p_domain IS NULL OR p_tenant IS DISTINCT FROM public.eye_tenant()
     OR (v_scope = 'DOMAIN' AND p_domain IS DISTINCT FROM public.eye_domain()) THEN
    RAISE EXCEPTION 'presentation state rejected (access): a display shows a domain''s work and is published in the established context''s own tenant and domain' USING ERRCODE = '42501';
  END IF;
  IF NOT shell.display_ok(p_display) THEN
    RAISE EXCEPTION 'presentation state rejected (display): a display is named in lower case (operations-room, briefing-wall)' USING ERRCODE = '22023';
  END IF;
  IF p_status IS NULL OR p_status NOT IN ('presenting', 'ended') THEN
    RAISE EXCEPTION 'presentation state rejected (status): a display is presenting or ended' USING ERRCODE = '22023';
  END IF;
  IF p_status = 'presenting' THEN
    v_problem := shell.location_problem(p_location);
    IF v_problem IS NOT NULL THEN RAISE EXCEPTION 'presentation state rejected (location): %', v_problem USING ERRCODE = '22023'; END IF;
    IF NOT (split_part(p_location ->> 'route', '/', 2) = ANY (shell.workspace_keys())) OR split_part(p_location ->> 'route', '/', 2) = 'admin' THEN
      RAISE EXCEPTION 'presentation state rejected (location): % is not a location of a domain workspace', p_location ->> 'route' USING ERRCODE = '22023';
    END IF;
    IF length(p_location::text) > 16384 THEN RAISE EXCEPTION 'presentation state rejected (location): the location is at most 16 KiB' USING ERRCODE = '22023'; END IF;
    IF p_watermark IS NULL OR p_watermark > clock_timestamp() THEN
      RAISE EXCEPTION 'presentation state rejected (watermark): the data watermark is the instant the shown data is as of — required, and never in the future' USING ERRCODE = '22023';
    END IF;
    IF p_classification IS NULL OR NOT (p_classification = ANY (shell.presentation_classifications())) THEN
      RAISE EXCEPTION 'presentation state rejected (classification): a display carries its classification context (public, internal, confidential, restricted) — a display without one shows nothing' USING ERRCODE = '22023';
    END IF;
    IF p_audience IS NULL OR NOT (p_audience = ANY (shell.presentation_audiences())) THEN
      RAISE EXCEPTION 'presentation state rejected (audience): the audience is %', array_to_string(shell.presentation_audiences(), ', ') USING ERRCODE = '22023';
    END IF;
    IF (v_ctx ->> 'classification') IS NOT NULL AND (v_ctx ->> 'classification') IS DISTINCT FROM p_classification THEN
      RAISE EXCEPTION 'presentation state rejected (classification): the display''s classification (%) differs from the context it was read under (%)', p_classification, v_ctx ->> 'classification' USING ERRCODE = '22023';
    END IF;
  ELSIF p_location IS NOT NULL OR p_watermark IS NOT NULL OR p_classification IS NOT NULL OR p_audience IS NOT NULL THEN
    RAISE EXCEPTION 'presentation state rejected (status): an ended display shows nothing (no location, watermark, classification or audience)' USING ERRCODE = '22023';
  END IF;
  v_problem := shell.view_context_problem(v_ctx);
  IF v_problem IS NOT NULL THEN RAISE EXCEPTION 'presentation state rejected (context): %', v_problem USING ERRCODE = '22023'; END IF;
  IF p_expected_version IS NULL OR p_expected_version < 0 THEN
    RAISE EXCEPTION 'presentation state rejected (version): the publication names the version it read (0 when there was none)' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('shell.presentation_states:' || p_actor || ':' || p_display, 0));
  SELECT * INTO v_cur FROM shell.presentation_states s WHERE s.principal_id = p_actor AND s.display = p_display ORDER BY s.version DESC LIMIT 1;
  v_version := coalesce(v_cur.version, 0);
  IF v_version <> p_expected_version THEN
    RAISE EXCEPTION 'presentation state rejected (stale): the display % is at version %; this publication read version % — read it again (nothing was overwritten)', p_display, v_version, p_expected_version USING ERRCODE = '23514';
  END IF;
  IF v_cur.state_id IS NULL AND p_status = 'ended' THEN
    RAISE EXCEPTION 'presentation state rejected (state): nothing is presented on the display % — there is nothing to end', p_display USING ERRCODE = '23514';
  END IF;
  -- ONE control surface: a different session publishes only once the controlling session is no longer signed in (re-authentication)
  IF v_cur.state_id IS NOT NULL AND v_cur.control_session IS DISTINCT FROM v_session THEN
    IF shell.session_live(v_cur.control_session) THEN
      RAISE EXCEPTION 'presentation state rejected (state): the display % is controlled by another of your signed-in sessions (since %) — hand its control off from there, or sign out there; a second window never takes control silently', p_display, v_cur.published_at USING ERRCODE = '23514';
    END IF;
    v_transfer := 'reauthentication';
  END IF;
  v_digest := encode(sha256(convert_to(jsonb_build_object('display', p_display, 'status', p_status, 'location', p_location, 'view_context', v_ctx,
    'watermark', p_watermark, 'classification', p_classification, 'audience', p_audience, 'contract', shell.windows_contract_version())::text, 'UTF8')), 'hex');
  IF v_cur.state_id IS NOT NULL AND v_cur.digest = v_digest AND v_transfer IS NULL THEN
    RETURN shell.presentation_view(v_cur) || jsonb_build_object('unchanged', true);
  END IF;
  INSERT INTO shell.presentation_states (state_id, principal_id, scope, tenant_id, domain_id, display, version, supersedes, status, location, view_context, watermark,
                                         classification, audience, control_session, transfer, contract, digest, correlation_id)
  VALUES (p_state_id, p_actor, v_scope, p_tenant, p_domain, p_display, v_version + 1, v_cur.state_id, p_status, p_location, v_ctx, p_watermark,
          p_classification, p_audience, v_session, v_transfer, shell.windows_contract_version(), v_digest, p_correlation)
  RETURNING * INTO v_row;
  PERFORM shell.ledger(p_tenant, p_domain, p_actor, 'presentation_state', p_state_id, v_row.version, 'shell.presentation.published',
                       jsonb_build_object('display', p_display, 'status', p_status, 'route', p_location ->> 'route', 'watermark', p_watermark, 'classification', p_classification,
                                          'audience', p_audience, 'transfer', v_transfer, 'supersedes', v_cur.state_id, 'digest', v_digest), p_correlation);
  RETURN shell.presentation_view(v_row) || jsonb_build_object('unchanged', false);
END $$;
REVOKE ALL ON FUNCTION shell.publish_presentation(uuid, uuid, uuid, text, int, text, jsonb, jsonb, timestamptz, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION shell.publish_presentation(uuid, uuid, uuid, text, int, text, jsonb, jsonb, timestamptz, text, text, uuid, uuid) TO eye_commit;

-- §LYM.8 THE OWN READ OF THE DISPLAYS (`shell.presentation.read`) ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION shell.presentation_of(p_principal uuid, p_tenant uuid, p_domain uuid, p_display text, p_history int) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = shell, observation, public, pg_catalog, pg_temp AS $$
DECLARE v_scope text := public.eye_scope(); v_out jsonb;
BEGIN
  IF p_principal IS NULL OR p_principal IS DISTINCT FROM public.eye_principal() THEN
    RAISE EXCEPTION 'presentation state rejected (actor): a principal reads only its own displays' USING ERRCODE = '42501';
  END IF;
  IF v_scope = 'PLATFORM' OR p_domain IS NULL OR NOT observation.read_scope_ok(p_tenant, p_domain) THEN
    RAISE EXCEPTION 'presentation state rejected (access): a display is read only within the caller''s bound tenant and domain' USING ERRCODE = '42501';
  END IF;
  IF p_display IS NOT NULL AND NOT shell.display_ok(p_display) THEN
    RAISE EXCEPTION 'presentation state rejected (display): a display is named in lower case' USING ERRCODE = '22023';
  END IF;
  WITH mine AS (
    SELECT s.* FROM shell.presentation_states s
     WHERE s.principal_id = p_principal AND s.tenant_id = p_tenant AND s.domain_id = p_domain AND (p_display IS NULL OR s.display = p_display)
  ), cur AS (
    SELECT DISTINCT ON (display) * FROM mine ORDER BY display, version DESC
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'display', c.display,
      'current', shell.presentation_view(c::shell.presentation_states),
      'versions', (SELECT count(*) FROM mine m WHERE m.display = c.display),
      'history', (SELECT coalesce(jsonb_agg(jsonb_build_object('state_id', x.state_id, 'version', x.version, 'status', x.status, 'route', x.location ->> 'route',
                    'watermark', x.watermark, 'transfer', x.transfer, 'digest', x.digest, 'published_at', x.published_at) ORDER BY x.version DESC), '[]'::jsonb)
                    FROM (SELECT * FROM mine m WHERE m.display = c.display ORDER BY m.version DESC LIMIT greatest(0, least(coalesce(p_history, 5), 50))) x)
    ) ORDER BY c.display), '[]'::jsonb) INTO v_out FROM cur c;
  RETURN jsonb_build_object('principal_id', p_principal, 'scope', v_scope, 'tenant_id', p_tenant, 'domain_id', p_domain, 'read_at', clock_timestamp(),
    'contract', shell.windows_contract_version(), 'displays', v_out,
    'claim', 'your own displays — what each shows, its data watermark, its classification and its one control surface; a display commands nothing');
END $$;
REVOKE ALL ON FUNCTION shell.presentation_of(uuid, uuid, uuid, text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION shell.presentation_of(uuid, uuid, uuid, text, int) TO eye_app, eye_commit;
