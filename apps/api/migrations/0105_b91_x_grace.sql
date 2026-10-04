-- ═════════════════════════════════════════════════════════════════════
-- section `grace` — CP-6 B91 §GR (part `grace`): GRACE, CONTINUITY AND THE OFFLINE LICENCE TOKEN (F-P7-F-01, its fourth and fifth clauses:
-- FEX-30, PR-66-005/006, AT-66 (renewal and suspension recovery, quota and grace scenarios, offline licensing), UX-67-001..006).
--
-- The part file of the combined 0105 (apply order §0, §EN, §GR, §LE, §ME). It USES the prelude's commercial.licences (the versions are §EN's;
-- this section moves only a version's state, grace_until, last_valid and state_changed_at) and commercial.usage_records (read on the surface);
-- it re-declares nothing. Forward only.
--
--   §GR.1 commercial.grace_policies     per tenant, versioned: the grace length, what grace allows (read and preserve — never removable —,
--                                        finish running work, new work) and the renewal notice. A tenant with none has the DEFAULT, stated.
--   §GR.2 commercial.licence_transitions the ledger of a licence version's state changes (and its renewal notices), with reason, actor,
--                                        evidence, the term before and after, the grace and the last valid entitlement. Append-only.
--   §GR.3 commercial.offline_tokens      issued offline licence tokens: the canonical payload text, its digest, the Ed25519 signature and
--                                        the key REFERENCE and id (never the key), the issue and expiry instants, the target profile.
--   §GR.4 the helpers                    the term end (effective_to, extended by renewals), the readability rule, the snapshot, the policy in
--                                        force, the token basis, the actor check, the notice (attention items under the PUBLISHED policy).
--   §GR.5 the reads                      commercial.grace_rules(tenant) — the read §EN's availability gate consults.
--   §GR.6 the ports                      renew, suspend, reinstate (commercial authority, human-gated, reasoned); set_grace_policy;
--                                        issue_offline_token; lapse_licences (the tick step commercial-licence-lapse).
--
-- THE BOUNDARY (ADR-022): a transition makes capabilities unavailable, explained; it never deletes, never edits a version's content
-- (package, capabilities, limits, window, provenance, digest), and grace always allows reading and preserving every existing record.
-- The DISCONNECTED PROFILE itself does not exist yet (P7-D / B106): the token closes the token clause only.

-- ─────────────────────────────────────────────────────────────────────
-- §GR.1 GRACE POLICIES
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE commercial.grace_policies (
  policy_id            uuid NOT NULL UNIQUE,
  tenant_id            uuid NOT NULL REFERENCES tenancy.tenants(id),
  version              int NOT NULL CHECK (version >= 1),
  state                text NOT NULL CHECK (state IN ('active', 'superseded')),
  grace_days           int NOT NULL CHECK (grace_days BETWEEN 1 AND 90),
  -- what grace allows: read_and_preserve is mandatory (a grace that hides or destroys customer work is not a grace)
  allows               text[] NOT NULL CHECK ('read_and_preserve' = ANY (allows) AND allows <@ ARRAY['read_and_preserve', 'finish_running_work', 'new_work']::text[]),
  renewal_notice_days  int NOT NULL CHECK (renewal_notice_days BETWEEN 0 AND 180),
  reason               text NOT NULL CHECK (length(btrim(reason)) BETWEEN 8 AND 2000),
  digest               text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  supersedes           int NULL CHECK (supersedes IS NULL OR supersedes = version - 1),
  set_by               uuid NOT NULL,
  effective_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  superseded_at        timestamptz NULL CHECK ((state = 'superseded') = (superseded_at IS NOT NULL)),
  correlation_id       uuid NOT NULL,
  PRIMARY KEY (tenant_id, version)
);
CREATE UNIQUE INDEX cgr_policy_one_active ON commercial.grace_policies (tenant_id) WHERE state = 'active';
-- a version is immutable; the one move is active → superseded (state and superseded_at only); never deleted
CREATE OR REPLACE FUNCTION commercial.cgr_policy_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'grace policy rejected (state): a grace policy version is never deleted' USING ERRCODE = '2F002'; END IF;
  IF NOT (OLD.state = 'active' AND NEW.state = 'superseded')
     OR (to_jsonb(NEW) - 'state' - 'superseded_at') IS DISTINCT FROM (to_jsonb(OLD) - 'state' - 'superseded_at') THEN
    RAISE EXCEPTION 'grace policy rejected (state): a grace policy version is immutable; it is only superseded' USING ERRCODE = '2F002';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER cgr_policy_guard BEFORE UPDATE OR DELETE ON commercial.grace_policies FOR EACH ROW EXECUTE FUNCTION commercial.cgr_policy_guard();

-- ─────────────────────────────────────────────────────────────────────
-- §GR.2 THE TRANSITIONS LEDGER
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE commercial.licence_transitions (
  transition_id        uuid PRIMARY KEY,
  tenant_id            uuid NOT NULL REFERENCES tenancy.tenants(id),
  licence_id           uuid NOT NULL,
  version              int NOT NULL,
  kind                 text NOT NULL CHECK (kind IN ('grace_entered', 'lapsed', 'suspended', 'reinstated', 'renewed', 'renewal_notice')),
  cause                text NOT NULL CHECK (cause IN ('term_ended', 'grace_ended', 'indeterminate_conflict', 'indeterminate_unreadable', 'commanded', 'renewal_due')),
  from_state           text NOT NULL CHECK (from_state IN ('active', 'grace', 'suspended', 'lapsed')),
  to_state             text NOT NULL CHECK (to_state IN ('active', 'grace', 'suspended', 'lapsed')),
  reason               text NOT NULL CHECK (length(btrim(reason)) BETWEEN 8 AND 2000),
  evidence             jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(evidence) = 'object'),
  term_end_before      timestamptz NULL,
  term_end_after       timestamptz NULL,
  renewed_until        timestamptz NULL CHECK ((kind = 'renewed') = (renewed_until IS NOT NULL)),
  grace_until          timestamptz NULL,
  last_valid           jsonb NULL,
  grace_policy         jsonb NOT NULL CHECK (jsonb_typeof(grace_policy) = 'object'),
  actor_principal_id   uuid NOT NULL,
  actor_kind           text NOT NULL CHECK (actor_kind IN ('human', 'tick')),
  attention_items      uuid[] NOT NULL DEFAULT '{}',
  occurred_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id       uuid NOT NULL,
  FOREIGN KEY (licence_id, version) REFERENCES commercial.licences (licence_id, version),
  CHECK (kind <> 'renewal_notice' OR from_state = to_state),
  CHECK ((actor_kind = 'tick') = (cause IN ('term_ended', 'grace_ended', 'indeterminate_conflict', 'indeterminate_unreadable', 'renewal_due')))
);
CREATE INDEX cgr_transitions_licence ON commercial.licence_transitions (licence_id, version, occurred_at);
CREATE INDEX cgr_transitions_tenant ON commercial.licence_transitions (tenant_id, occurred_at);
-- one renewal notice per version and term end
CREATE UNIQUE INDEX cgr_notice_once ON commercial.licence_transitions (licence_id, version, term_end_after) WHERE kind = 'renewal_notice';
CREATE TRIGGER cgr_transitions_append_only BEFORE UPDATE OR DELETE ON commercial.licence_transitions FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

-- ─────────────────────────────────────────────────────────────────────
-- §GR.3 OFFLINE LICENCE TOKENS
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE commercial.offline_tokens (
  token_id             uuid PRIMARY KEY,
  tenant_id            uuid NOT NULL REFERENCES tenancy.tenants(id),
  licence_id           uuid NOT NULL,
  version              int NOT NULL,
  format               text NOT NULL CHECK (format = 'eye-licence-token/1'),
  -- the DISCONNECTED profile the token is for: it does not exist yet (P7-D / B106) — the token is the software's part only
  profile              text NOT NULL CHECK (profile IN ('disconnected', 'air-gapped')),
  payload_text         text NOT NULL CHECK (length(payload_text) BETWEEN 2 AND 65536),
  payload_digest       text NOT NULL CHECK (payload_digest ~ '^[0-9a-f]{64}$'),
  algorithm            text NOT NULL CHECK (algorithm = 'Ed25519'),
  signature            text NOT NULL CHECK (signature ~ '^[A-Za-z0-9+/]{86}==$'),
  key_ref              text NOT NULL CHECK (key_ref ~ '^EYE_LICENCE_SIGNING_KEY_[A-Z0-9_]{1,64}$'),
  key_id               text NOT NULL CHECK (key_id ~ '^ed25519:[0-9a-f]{16}$'),
  public_key_pem       text NOT NULL CHECK (public_key_pem LIKE '-----BEGIN PUBLIC KEY-----%'),
  issued_at            timestamptz NOT NULL,
  expires_at           timestamptz NOT NULL CHECK (expires_at > issued_at),
  issued_by            uuid NOT NULL,
  reason               text NOT NULL CHECK (length(btrim(reason)) BETWEEN 8 AND 2000),
  correlation_id       uuid NOT NULL,
  FOREIGN KEY (licence_id, version) REFERENCES commercial.licences (licence_id, version)
);
CREATE INDEX cgr_tokens_licence ON commercial.offline_tokens (tenant_id, licence_id, version, issued_at);
CREATE TRIGGER cgr_tokens_append_only BEFORE UPDATE OR DELETE ON commercial.offline_tokens FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

-- row security: the prelude's licence policy (the tenant's own rows; the PLATFORM commercial authority reads every tenant's)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['grace_policies', 'licence_transitions', 'offline_tokens'] LOOP
    EXECUTE format('ALTER TABLE commercial.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE commercial.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$CREATE POLICY commercial_licence_read ON commercial.%I USING (tenant_id = public.eye_tenant() OR public.eye_scope() = 'PLATFORM')$f$, t);
    EXECUTE format('REVOKE ALL ON commercial.%I FROM PUBLIC', t);
    EXECUTE format('GRANT SELECT ON commercial.%I TO eye_app, eye_commit', t);
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- §GR.4 THE HELPERS
-- ─────────────────────────────────────────────────────────────────────
-- An instant as the token and the snapshot write it: UTC, microseconds, 'Z' (one text per instant, so a canonical payload is reproducible).
CREATE OR REPLACE FUNCTION commercial.cgr_instant(p timestamptz) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT CASE WHEN p IS NULL THEN NULL ELSE to_char(p AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') END
$$;
GRANT EXECUTE ON FUNCTION commercial.cgr_instant(timestamptz) TO eye_app, eye_commit;

-- THE TERM END of a licence version: its effective_to, extended by the latest renewal of that version; NULL = no end (perpetual).
CREATE OR REPLACE FUNCTION commercial.licence_term_end(p_licence uuid, p_version int) RETURNS timestamptz
LANGUAGE sql STABLE SET search_path = commercial, pg_catalog, pg_temp AS $$
  SELECT CASE WHEN l.effective_to IS NULL THEN NULL
              ELSE greatest(l.effective_to, (SELECT max(t.renewed_until) FROM commercial.licence_transitions t
                                              WHERE t.licence_id = l.licence_id AND t.version = l.version AND t.kind = 'renewed')) END
    FROM commercial.licences l WHERE l.licence_id = p_licence AND l.version = p_version
$$;
GRANT EXECUTE ON FUNCTION commercial.licence_term_end(uuid, int) TO eye_app, eye_commit;

-- READABILITY (FEX-30's "unreadable licence"): NULL when the version reads as an entitlement, else why not. A version is unreadable when it
-- names no capability, names one outside the key form or twice, or carries no provenance (nobody can say where it came from).
CREATE OR REPLACE FUNCTION commercial.cgr_unreadable(l commercial.licences) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT CASE
    WHEN l.capabilities IS NULL OR cardinality(l.capabilities) = 0 THEN 'the version names no capability'
    WHEN EXISTS (SELECT 1 FROM unnest(l.capabilities) c WHERE c IS NULL OR c !~ '^[a-z][a-z0-9_]{1,40}$') THEN 'the version names a capability outside the key form'
    WHEN (SELECT count(DISTINCT c) FROM unnest(l.capabilities) c) <> cardinality(l.capabilities) THEN 'the version names a capability twice'
    WHEN l.provenance IS NULL OR l.provenance = '{}'::jsonb THEN 'the version carries no provenance'
    ELSE NULL END
$$;
GRANT EXECUTE ON FUNCTION commercial.cgr_unreadable(commercial.licences) TO eye_app, eye_commit;

-- THE SNAPSHOT of a version as the last valid entitlement (FEX-30: last valid entitlement, limits, expiry, affected capability).
CREATE OR REPLACE FUNCTION commercial.cgr_snapshot(l commercial.licences, p_note text) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = commercial, pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object('licence_id', l.licence_id, 'version', l.version, 'package_key', l.package_key,
                            'capabilities', to_jsonb(ARRAY(SELECT c FROM unnest(l.capabilities) c ORDER BY c)), 'limits', l.limits,
                            'effective_from', commercial.cgr_instant(l.effective_from), 'effective_to', commercial.cgr_instant(l.effective_to),
                            'term_end', commercial.cgr_instant(commercial.licence_term_end(l.licence_id, l.version)),
                            'state_at_snapshot', l.state, 'digest', l.digest, 'snapshot_at', commercial.cgr_instant(clock_timestamp()), 'note', p_note)
$$;
REVOKE ALL ON FUNCTION commercial.cgr_snapshot(commercial.licences, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION commercial.cgr_snapshot(commercial.licences, text) TO eye_app, eye_commit;

-- THE GRACE POLICY IN FORCE for a tenant: the active version, or the DEFAULT (14 days; read and preserve, finish running work; no new work;
-- the renewal notice 30 days before the term ends) — stated as the default, never presented as a declaration.
CREATE OR REPLACE FUNCTION commercial.cgr_policy(p_tenant uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = commercial, pg_catalog, pg_temp AS $$
  SELECT coalesce(
    (SELECT jsonb_build_object('source', 'declared', 'policy_id', g.policy_id, 'version', g.version, 'grace_days', g.grace_days,
                               'allows', to_jsonb(g.allows), 'renewal_notice_days', g.renewal_notice_days, 'digest', g.digest,
                               'set_by', g.set_by, 'effective_at', g.effective_at)
       FROM commercial.grace_policies g WHERE g.tenant_id = p_tenant AND g.state = 'active'),
    jsonb_build_object('source', 'default', 'policy_id', NULL, 'version', NULL, 'grace_days', 14,
                       'allows', to_jsonb(ARRAY['read_and_preserve', 'finish_running_work']), 'renewal_notice_days', 30, 'digest', NULL,
                       'set_by', NULL, 'effective_at', NULL))
$$;
GRANT EXECUTE ON FUNCTION commercial.cgr_policy(uuid) TO eye_app, eye_commit;

-- THE TOKEN BASIS: what an offline token states about the licence version (the signed payload's `licence` member) — every instant in the
-- one text form, the capabilities sorted. The issue port re-derives it and requires the payload to carry exactly this.
CREATE OR REPLACE FUNCTION commercial.cgr_token_basis(p_licence uuid, p_version int) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = commercial, pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object('licence_id', l.licence_id, 'version', l.version, 'tenant_id', l.tenant_id, 'package_key', l.package_key,
                            'capabilities', to_jsonb(ARRAY(SELECT c FROM unnest(l.capabilities) c ORDER BY c)), 'limits', l.limits,
                            'effective_from', commercial.cgr_instant(l.effective_from), 'effective_to', commercial.cgr_instant(l.effective_to),
                            'term_end', commercial.cgr_instant(commercial.licence_term_end(l.licence_id, l.version)),
                            'state', l.state, 'grace_until', commercial.cgr_instant(l.grace_until), 'digest', l.digest)
    FROM commercial.licences l WHERE l.licence_id = p_licence AND l.version = p_version
$$;
GRANT EXECUTE ON FUNCTION commercial.cgr_token_basis(uuid, int) TO eye_app, eye_commit;

-- THE ACTING COMMERCIAL AUTHORITY: a PLATFORM context, the acting principal recorded is the bound one, an active human holding
-- commercial_authority at PLATFORM. p_noun is the refusal family's noun.
CREATE OR REPLACE FUNCTION commercial.cgr_assert_commercial(p_actor uuid, p_noun text) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = identity, public, pg_catalog, pg_temp AS $$
BEGIN
  IF public.eye_scope() IS DISTINCT FROM 'PLATFORM' THEN
    RAISE EXCEPTION '% rejected (authority): a licence''s state is the vendor''s commercial authority''s act, in the PLATFORM scope (the context is %)', p_noun, coalesce(public.eye_scope(), 'NONE') USING ERRCODE = '42501';
  END IF;
  IF p_actor IS NULL OR p_actor IS DISTINCT FROM public.eye_principal() THEN
    RAISE EXCEPTION '% rejected (actor): recorded by the acting principal', p_noun USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM identity.role_bindings b JOIN identity.principals p ON p.id = b.principal_id
                  WHERE b.principal_id = p_actor AND p.kind = 'human' AND p.status = 'active' AND b.revoked_at IS NULL
                    AND b.role_code = 'commercial_authority' AND b.scope = 'PLATFORM') THEN
    RAISE EXCEPTION '% rejected (authority): the acting principal is not an active human holding the commercial authority', p_noun USING ERRCODE = '42501';
  END IF;
END $$;
REVOKE ALL ON FUNCTION commercial.cgr_assert_commercial(uuid, text) FROM PUBLIC;

-- THE NOTICE: a commercial.entitlement attention item in EVERY active domain of the tenant (a licence is the tenant's), routed under that
-- domain's PUBLISHED attention policy (0094 §P / 0095's idiom — a class the policy does not name abstains and is deprioritized: seen by nobody,
-- which is why the act routes it); owned by the commercial authority (the acting one, or the version's issuer) when an active human holding
-- it, and routed to the roles the policy names (the tenant administrator). The cause is the transition row. Answers the item ids.
CREATE OR REPLACE FUNCTION commercial.cgr_notify(p_tenant uuid, l commercial.licences, p_transition uuid, p_kind text, p_title text, p_details jsonb,
                                                 p_owner uuid, p_hours numeric, p_actor uuid, p_correlation uuid) RETURNS uuid[]
LANGUAGE plpgsql SET search_path = commercial, executive, identity, pg_catalog, pg_temp AS $$
DECLARE d record; pol executive.attention_policies%ROWTYPE; v_eval jsonb; v_route jsonb; v_state text; v_item uuid; v_items uuid[] := '{}'; v_owner uuid;
BEGIN
  v_owner := CASE WHEN p_owner IS NOT NULL AND EXISTS (SELECT 1 FROM identity.role_bindings b JOIN identity.principals p ON p.id = b.principal_id
                                                        WHERE b.principal_id = p_owner AND p.kind = 'human' AND p.status = 'active' AND b.revoked_at IS NULL
                                                          AND b.role_code = 'commercial_authority' AND b.scope = 'PLATFORM') THEN p_owner END;
  FOR d IN SELECT x.id FROM tenancy.domains x WHERE x.tenant_id = p_tenant AND x.status = 'active' ORDER BY x.created_at, x.id LOOP
    pol := NULL;
    SELECT * INTO pol FROM executive.attention_policies a WHERE a.tenant_id = p_tenant AND a.domain_id = d.id AND a.state = 'active';
    v_eval := executive.evaluate_attention(CASE WHEN pol.policy_id IS NULL THEN NULL ELSE pol.rules END, 'commercial.entitlement',
                                           jsonb_build_object('consequence', 'C2', 'confidence', 1, 'hours_to_window', coalesce(p_hours, 0))) || jsonb_build_object('policy_version', pol.version);
    v_route := executive.attention_route(pol.rules, 'commercial.entitlement', v_eval ->> 'outcome', v_owner, p_tenant, d.id);
    v_state := v_route ->> 'state';
    v_item := gen_random_uuid();
    INSERT INTO executive.attention_items (item_id, scope, tenant_id, domain_id, signal_class, subject_kind, subject_id, cause_event_id, cause_event_type, title, outcome, state,
                                           owner_principal_id, route_roles, policy_id, policy_version, evaluation, details, due_at, escalations, correlation_id)
    VALUES (v_item, 'DOMAIN', p_tenant, d.id, 'commercial.entitlement', 'entitlement', l.licence_id, p_transition, 'LicenceTransition', left(p_title, 512), v_eval ->> 'outcome', v_state,
            v_owner, ARRAY(SELECT jsonb_array_elements_text(v_route -> 'route_roles')), pol.policy_id, pol.version, v_eval,
            jsonb_build_object('licence_id', l.licence_id, 'version', l.version, 'package_key', l.package_key, 'transition_id', p_transition, 'kind', p_kind,
                               'commercial_authority', p_owner, 'by', 'the licence continuity (B91 §GR)') || coalesce(p_details, '{}'::jsonb),
            (v_route ->> 'due_at')::timestamptz, (v_route ->> 'escalations')::int, p_correlation);
    PERFORM executive.attention_event(v_item, p_tenant, d.id,
              CASE v_state WHEN 'open' THEN 'item.routed' WHEN 'escalated' THEN 'item.escalated' WHEN 'unrouted' THEN 'item.unrouted' ELSE 'item.deprioritized' END,
              p_actor, jsonb_build_object('outcome', v_eval ->> 'outcome', 'reasons', v_eval -> 'reasons', 'policy_version', pol.version, 'owner', v_owner, 'route_roles', v_route -> 'route_roles',
                                          'due_at', v_route -> 'due_at', 'cause_event_id', p_transition, 'cause_event_type', 'LicenceTransition', 'unrouted', coalesce((v_route ->> 'unrouted')::boolean, false)), p_correlation);
    v_items := v_items || v_item;
  END LOOP;
  RETURN v_items;
END $$;
REVOKE ALL ON FUNCTION commercial.cgr_notify(uuid, commercial.licences, uuid, text, text, jsonb, uuid, numeric, uuid, uuid) FROM PUBLIC;

-- ONE TRANSITION: the version's state columns moved (state, grace_until, last_valid, state_changed_at — nothing else), the ledger row and
-- the notice. The caller holds the row's lock.
CREATE OR REPLACE FUNCTION commercial.cgr_transition(l commercial.licences, p_transition uuid, p_kind text, p_cause text, p_to text, p_reason text, p_evidence jsonb,
                                                     p_renewed_until timestamptz, p_grace_until timestamptz, p_last_valid jsonb, p_actor uuid, p_actor_kind text,
                                                     p_owner uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SET search_path = commercial, pg_catalog, pg_temp AS $$
DECLARE v_before timestamptz := commercial.licence_term_end(l.licence_id, l.version); v_after timestamptz; v_items uuid[]; v_policy jsonb := commercial.cgr_policy(l.tenant_id);
        v_title text; v_hours numeric; v_at timestamptz := clock_timestamp();
BEGIN
  IF p_kind <> 'renewal_notice' THEN
    UPDATE commercial.licences SET state = p_to, grace_until = p_grace_until, last_valid = p_last_valid, state_changed_at = v_at
     WHERE licence_id = l.licence_id AND version = l.version;
  END IF;
  v_after := CASE WHEN p_kind = 'renewed' THEN p_renewed_until ELSE v_before END;
  v_title := CASE p_kind
    WHEN 'grace_entered' THEN format('Licence in GRACE: %s v%s — %s; grace until %s (the last valid entitlement kept: %s)', l.package_key, l.version,
                                     CASE p_cause WHEN 'term_ended' THEN 'the term ended' ELSE 'the entitlement is indeterminate' END,
                                     to_char(p_grace_until AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI "UTC"'), coalesce(array_to_string(ARRAY(SELECT jsonb_array_elements_text(p_last_valid -> 'capabilities')), ', '), 'none'))
    WHEN 'lapsed' THEN format('Licence LAPSED: %s v%s — the grace ended; licensed capabilities are unavailable, every record stays readable and exportable', l.package_key, l.version)
    WHEN 'suspended' THEN format('Licence SUSPENDED: %s v%s — %s', l.package_key, l.version, left(p_reason, 200))
    WHEN 'reinstated' THEN format('Licence REINSTATED: %s v%s is active again', l.package_key, l.version)
    WHEN 'renewed' THEN format('Licence RENEWED: %s v%s until %s', l.package_key, l.version, to_char(p_renewed_until AT TIME ZONE 'UTC', 'YYYY-MM-DD'))
    ELSE format('Licence renewal due: %s v%s ends %s', l.package_key, l.version, to_char(v_before AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI "UTC"')) END;
  v_hours := CASE WHEN p_kind = 'grace_entered' AND p_grace_until IS NOT NULL THEN greatest(extract(epoch FROM p_grace_until - v_at) / 3600, 0)
                  WHEN p_kind = 'renewal_notice' AND v_before IS NOT NULL THEN greatest(extract(epoch FROM v_before - v_at) / 3600, 0) ELSE 0 END;
  v_items := commercial.cgr_notify(l.tenant_id, l, p_transition, p_kind, v_title,
                                   jsonb_build_object('from_state', l.state, 'to_state', p_to, 'cause', p_cause, 'reason', left(p_reason, 400), 'grace_until', p_grace_until,
                                                      'term_end', v_after, 'last_valid', p_last_valid, 'synthetic', true),
                                   p_owner, v_hours, p_actor, p_correlation);
  INSERT INTO commercial.licence_transitions (transition_id, tenant_id, licence_id, version, kind, cause, from_state, to_state, reason, evidence, term_end_before, term_end_after,
                                              renewed_until, grace_until, last_valid, grace_policy, actor_principal_id, actor_kind, attention_items, occurred_at, correlation_id)
  VALUES (p_transition, l.tenant_id, l.licence_id, l.version, p_kind, p_cause, l.state, p_to, btrim(p_reason), coalesce(p_evidence, '{}'::jsonb), v_before, v_after,
          p_renewed_until, p_grace_until, p_last_valid, v_policy, p_actor, p_actor_kind, v_items, v_at, p_correlation);
  RETURN jsonb_build_object('transition_id', p_transition, 'licence_id', l.licence_id, 'version', l.version, 'kind', p_kind, 'cause', p_cause,
                            'from_state', l.state, 'to_state', p_to, 'term_end_before', v_before, 'term_end_after', v_after, 'grace_until', p_grace_until,
                            'last_valid', p_last_valid, 'attention_items', to_jsonb(v_items), 'occurred_at', v_at);
END $$;
REVOKE ALL ON FUNCTION commercial.cgr_transition(commercial.licences, uuid, text, text, text, text, jsonb, timestamptz, timestamptz, jsonb, uuid, text, uuid, uuid) FROM PUBLIC;

-- THE DETERMINACY of a tenant's entitlement now: NULL when one readable live version stands, else {cause, reason}.
CREATE OR REPLACE FUNCTION commercial.cgr_indeterminacy(p_tenant uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = commercial, pg_catalog, pg_temp AS $$
  WITH live AS (SELECT l.* FROM commercial.licences l WHERE l.tenant_id = p_tenant AND l.state <> 'superseded'),
       newest AS (SELECT * FROM live ORDER BY issued_at DESC, version DESC LIMIT 1)
  SELECT CASE
    WHEN (SELECT count(*) FROM live) > 1 THEN jsonb_build_object('cause', 'indeterminate_conflict',
           'reason', format('%s live licence versions conflict (%s) — the commercial authority supersedes the stray one', (SELECT count(*) FROM live),
                            (SELECT string_agg(format('%s v%s', x.licence_id, x.version), ', ' ORDER BY x.issued_at, x.version) FROM live x)))
    WHEN (SELECT commercial.cgr_unreadable(n) FROM newest n) IS NOT NULL THEN jsonb_build_object('cause', 'indeterminate_unreadable',
           'reason', format('licence %s v%s is unreadable: %s', (SELECT n.licence_id FROM newest n), (SELECT n.version FROM newest n), (SELECT commercial.cgr_unreadable(n) FROM newest n)))
    ELSE NULL END
$$;
GRANT EXECUTE ON FUNCTION commercial.cgr_indeterminacy(uuid) TO eye_app, eye_commit;

-- ─────────────────────────────────────────────────────────────────────
-- §GR.5 THE READ §EN's GATE CONSULTS: commercial.grace_rules(tenant)
-- ─────────────────────────────────────────────────────────────────────
/* What the tenant's entitlement is NOW and what each state allows. A guarded definer: the PLATFORM scope, or a TENANT/DOMAIN context bound to
   this tenant (N-01's read_scope_ok on the bound domain), or a session whose own login bypasses RLS. Answers:
     contracted        false → the tenant has NO licence row: UNCONTRACTED, the gate does not apply (the prelude's rule);
     state             uncontracted | active | grace | suspended | lapsed (the newest live version's recorded state);
     determinate       false when live versions conflict or the newest is unreadable (the tick moves it to grace; until then it is reported);
     licence           the newest live version (with its term end) and, in grace or suspension, the LAST VALID entitlement;
     policy            the grace policy in force (declared, or the DEFAULT, stated);
     rules             read_and_preserve ALWAYS true (every state; never removable); in grace: the capabilities of the last valid entitlement,
                       whether running work may finish (and the actions that finish it), whether new work may start; suspended/lapsed:
                       nothing licensed is available beyond read and preserve; mandatory_controls: what stays available in every state. */
CREATE OR REPLACE FUNCTION commercial.grace_rules(p_tenant uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = commercial, observation, public, pg_catalog, pg_temp AS $$
DECLARE l commercial.licences%ROWTYPE; v_policy jsonb; v_ind jsonb; v_allows text[]; v_caps jsonb; v_state text; v_term timestamptz; v_expl text;
        v_mandatory jsonb := jsonb_build_array('audit: the audit read and verification', 'warnings and their acknowledgement', 'corrections and withdrawals',
                                               'export and the customer''s own records (retention)', 'provenance of every record', 'identity and sign-in',
                                               'reading every existing record (customer work preserved; nothing is deleted)');
        v_finish jsonb := jsonb_build_array('simulation.experiment.execute', 'simulation.experiment.pause', 'simulation.experiment.cancel', 'simulation.run.complete');
BEGIN
  IF NOT (public.eye_scope() = 'PLATFORM' OR observation.read_scope_ok(p_tenant, public.eye_domain())) THEN
    RAISE EXCEPTION 'read rejected (scope): the grace rules of tenant % are read only within that tenant or by the commercial authority (bound: %/%)', p_tenant,
      coalesce(public.eye_scope(), 'NONE'), coalesce(public.eye_tenant()::text, '-') USING ERRCODE = '42501';
  END IF;
  v_policy := commercial.cgr_policy(p_tenant);
  SELECT * INTO l FROM commercial.licences x WHERE x.tenant_id = p_tenant AND x.state <> 'superseded' ORDER BY x.issued_at DESC, x.version DESC LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('tenant_id', p_tenant, 'contracted', false, 'state', 'uncontracted', 'determinate', true, 'indeterminate', NULL, 'licence', NULL, 'last_valid', NULL,
      'policy', v_policy, 'rules', jsonb_build_object('read_and_preserve', true, 'gate_applies', false, 'mandatory_controls', v_mandatory),
      'explanation', 'UNCONTRACTED: this tenant holds no licence; the availability gate does not apply to it.', 'as_of', clock_timestamp());
  END IF;
  v_ind := commercial.cgr_indeterminacy(p_tenant);
  v_state := l.state;
  v_term := commercial.licence_term_end(l.licence_id, l.version);
  SELECT coalesce(array_agg(a), '{}') INTO v_allows FROM jsonb_array_elements_text(v_policy -> 'allows') a;
  v_caps := CASE WHEN v_state = 'active' THEN to_jsonb(ARRAY(SELECT c FROM unnest(l.capabilities) c ORDER BY c))
                 WHEN v_state = 'grace' THEN coalesce(l.last_valid -> 'capabilities', '[]'::jsonb)
                 ELSE '[]'::jsonb END;
  v_expl := CASE v_state
    WHEN 'active' THEN format('ACTIVE: licence %s v%s (%s)%s.', l.package_key, l.version, array_to_string(l.capabilities, ', '),
                              CASE WHEN v_term IS NULL THEN ', no term end' ELSE ' until ' || to_char(v_term AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI "UTC"') END)
    WHEN 'grace' THEN format('GRACE until %s: the last valid entitlement (%s) stays available as the grace policy allows — %s; every record stays readable and exportable.',
                             to_char(l.grace_until AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI "UTC"'), coalesce(array_to_string(ARRAY(SELECT jsonb_array_elements_text(v_caps)), ', '), 'none'),
                             CASE WHEN 'new_work' = ANY (v_allows) THEN 'new work may start' WHEN 'finish_running_work' = ANY (v_allows) THEN 'running work may finish, no new work starts' ELSE 'no work runs' END)
    WHEN 'suspended' THEN format('SUSPENDED: licence %s v%s is suspended by the commercial authority; licensed capabilities are unavailable — every record stays readable and exportable.', l.package_key, l.version)
    ELSE format('LAPSED: licence %s v%s lapsed%s; licensed capabilities are unavailable — every record stays readable and exportable; a renewal restores it.', l.package_key, l.version,
                CASE WHEN l.grace_until IS NULL THEN '' ELSE ' (grace ended ' || to_char(l.grace_until AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI "UTC"') || ')' END) END
    || CASE WHEN v_ind IS NULL THEN '' ELSE ' INDETERMINATE: ' || (v_ind ->> 'reason') || '.' END;
  RETURN jsonb_build_object('tenant_id', p_tenant, 'contracted', true, 'state', v_state, 'determinate', v_ind IS NULL, 'indeterminate', v_ind,
    'licence', jsonb_build_object('licence_id', l.licence_id, 'version', l.version, 'package_key', l.package_key, 'capabilities', to_jsonb(ARRAY(SELECT c FROM unnest(l.capabilities) c ORDER BY c)),
                                  'limits', l.limits, 'effective_from', l.effective_from, 'effective_to', l.effective_to, 'term_end', v_term, 'grace_until', l.grace_until,
                                  'state_changed_at', l.state_changed_at, 'digest', l.digest),
    'last_valid', l.last_valid, 'policy', v_policy,
    'rules', jsonb_build_object('read_and_preserve', true, 'gate_applies', true,
                                'capabilities', v_caps,
                                'finish_running_work', v_state = 'active' OR (v_state = 'grace' AND ('finish_running_work' = ANY (v_allows) OR 'new_work' = ANY (v_allows))),
                                'finish_running_actions', v_finish,
                                'new_work', v_state = 'active' OR (v_state = 'grace' AND 'new_work' = ANY (v_allows)),
                                'mandatory_controls', v_mandatory),
    'explanation', v_expl, 'as_of', clock_timestamp());
END $$;
REVOKE ALL ON FUNCTION commercial.grace_rules(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION commercial.grace_rules(uuid) TO eye_app, eye_commit;

-- ─────────────────────────────────────────────────────────────────────
-- §GR.6 THE PORTS
-- ─────────────────────────────────────────────────────────────────────
-- The version a commanded transition acts on, locked: it exists (unknown_licence), it is the licence's newest version (stale), it is live.
CREATE OR REPLACE FUNCTION commercial.cgr_lock_version(p_licence uuid, p_version int, p_noun text) RETURNS commercial.licences
LANGUAGE plpgsql SET search_path = commercial, pg_catalog, pg_temp AS $$
DECLARE l commercial.licences%ROWTYPE;
BEGIN
  SELECT * INTO l FROM commercial.licences x WHERE x.licence_id = p_licence AND x.version = p_version FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '% rejected (unknown_licence): licence % has no version %', p_noun, p_licence, p_version USING ERRCODE = '23503'; END IF;
  IF l.state = 'superseded' OR EXISTS (SELECT 1 FROM commercial.licences y WHERE y.licence_id = p_licence AND y.version > p_version) THEN
    RAISE EXCEPTION '% rejected (stale): licence % v% is superseded — act on its newest version', p_noun, p_licence, p_version USING ERRCODE = '2F002';
  END IF;
  RETURN l;
END $$;
REVOKE ALL ON FUNCTION commercial.cgr_lock_version(uuid, int, text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION commercial.cgr_check_reason(p_reason text, p_evidence jsonb, p_noun text) RETURNS void
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 OR length(p_reason) > 2000 THEN
    RAISE EXCEPTION '% rejected (reason): a transition says why (8 to 2000 characters)', p_noun USING ERRCODE = '22023';
  END IF;
  IF p_evidence IS NOT NULL AND jsonb_typeof(p_evidence) <> 'object' THEN
    RAISE EXCEPTION '% rejected (evidence): the evidence is an object (an order or ticket reference, a contract clause)', p_noun USING ERRCODE = '22023';
  END IF;
END $$;

/* RENEW (commercial.licence.renew; the commercial authority, human-gated): the newest version's term extended to p_renewed_until (later than
   now and than its current term end; at most five years ahead) and its state ACTIVE again — from active (an early renewal), grace or
   lapsed (the recovery). A suspended licence is reinstated first (state); an indeterminate entitlement is resolved first (indeterminate). */
CREATE OR REPLACE FUNCTION commercial.renew_licence(p_transition_id uuid, p_licence uuid, p_version int, p_renewed_until timestamptz, p_reason text, p_evidence jsonb,
                                                   p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = commercial, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE l commercial.licences%ROWTYPE; v_term timestamptz; v_ind jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['commercial.licence.renew']);
  PERFORM commercial.cgr_assert_commercial(p_actor, 'licence transition');
  PERFORM commercial.cgr_check_reason(p_reason, p_evidence, 'licence transition');
  l := commercial.cgr_lock_version(p_licence, p_version, 'licence transition');
  IF l.state = 'suspended' THEN
    RAISE EXCEPTION 'licence transition rejected (state): licence % v% is suspended — the commercial authority reinstates it before a renewal', p_licence, p_version USING ERRCODE = '2F002';
  END IF;
  v_ind := commercial.cgr_indeterminacy(l.tenant_id);
  IF v_ind IS NOT NULL THEN
    RAISE EXCEPTION 'licence transition rejected (indeterminate): %', v_ind ->> 'reason' USING ERRCODE = '2F002';
  END IF;
  IF l.effective_to IS NULL THEN
    RAISE EXCEPTION 'licence transition rejected (term): licence % v% has no term end — there is nothing to renew', p_licence, p_version USING ERRCODE = '22023';
  END IF;
  v_term := commercial.licence_term_end(p_licence, p_version);
  IF p_renewed_until IS NULL OR p_renewed_until <= clock_timestamp() OR p_renewed_until <= v_term OR p_renewed_until > clock_timestamp() + interval '5 years' THEN
    RAISE EXCEPTION 'licence transition rejected (term): a renewal runs to an instant later than now and than the current term end (%), at most five years ahead', commercial.cgr_instant(v_term) USING ERRCODE = '22023';
  END IF;
  RETURN commercial.cgr_transition(l, p_transition_id, 'renewed', 'commanded', 'active', p_reason, p_evidence, p_renewed_until, NULL, NULL, p_actor, 'human', p_actor, p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION commercial.renew_licence(uuid, uuid, int, timestamptz, text, jsonb, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION commercial.renew_licence(uuid, uuid, int, timestamptz, text, jsonb, uuid, uuid) TO eye_commit;

/* SUSPEND (commercial.licence.suspend; human-gated, reasoned): an active or grace version → SUSPENDED; the last valid entitlement kept
   (snapshotted when none is held), its grace_until kept as it stood. Nothing is deleted; every record stays readable. */
CREATE OR REPLACE FUNCTION commercial.suspend_licence(p_transition_id uuid, p_licence uuid, p_version int, p_reason text, p_evidence jsonb, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = commercial, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE l commercial.licences%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['commercial.licence.suspend']);
  PERFORM commercial.cgr_assert_commercial(p_actor, 'licence transition');
  PERFORM commercial.cgr_check_reason(p_reason, p_evidence, 'licence transition');
  l := commercial.cgr_lock_version(p_licence, p_version, 'licence transition');
  IF l.state NOT IN ('active', 'grace') THEN
    RAISE EXCEPTION 'licence transition rejected (state): licence % v% is % — only an active or grace licence is suspended', p_licence, p_version, l.state USING ERRCODE = '2F002';
  END IF;
  RETURN commercial.cgr_transition(l, p_transition_id, 'suspended', 'commanded', 'suspended', p_reason, p_evidence, NULL, l.grace_until,
                                   coalesce(l.last_valid, commercial.cgr_snapshot(l, 'the entitlement in force when it was suspended')), p_actor, 'human', p_actor, p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION commercial.suspend_licence(uuid, uuid, int, text, jsonb, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION commercial.suspend_licence(uuid, uuid, int, text, jsonb, uuid, uuid) TO eye_commit;

/* REINSTATE (commercial.licence.reinstate; human-gated, reasoned): a suspended version, or one held in grace because the entitlement was
   indeterminate, → ACTIVE — when its term still runs (else: renew) and the entitlement is determinate now (else: resolve it first). */
CREATE OR REPLACE FUNCTION commercial.reinstate_licence(p_transition_id uuid, p_licence uuid, p_version int, p_reason text, p_evidence jsonb, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = commercial, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE l commercial.licences%ROWTYPE; v_term timestamptz; v_ind jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['commercial.licence.reinstate']);
  PERFORM commercial.cgr_assert_commercial(p_actor, 'licence transition');
  PERFORM commercial.cgr_check_reason(p_reason, p_evidence, 'licence transition');
  l := commercial.cgr_lock_version(p_licence, p_version, 'licence transition');
  IF l.state NOT IN ('suspended', 'grace') THEN
    RAISE EXCEPTION 'licence transition rejected (state): licence % v% is % — only a suspended or grace licence is reinstated (a lapsed one is renewed)', p_licence, p_version, l.state USING ERRCODE = '2F002';
  END IF;
  v_term := commercial.licence_term_end(p_licence, p_version);
  IF v_term IS NOT NULL AND v_term <= clock_timestamp() THEN
    RAISE EXCEPTION 'licence transition rejected (state): the term of licence % v% ended % — a renewal restores it, not a reinstatement', p_licence, p_version, v_term USING ERRCODE = '2F002';
  END IF;
  v_ind := commercial.cgr_indeterminacy(l.tenant_id);
  IF v_ind IS NOT NULL THEN
    RAISE EXCEPTION 'licence transition rejected (indeterminate): %', v_ind ->> 'reason' USING ERRCODE = '2F002';
  END IF;
  RETURN commercial.cgr_transition(l, p_transition_id, 'reinstated', 'commanded', 'active', p_reason, p_evidence, NULL, NULL, NULL, p_actor, 'human', p_actor, p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION commercial.reinstate_licence(uuid, uuid, int, text, jsonb, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION commercial.reinstate_licence(uuid, uuid, int, text, jsonb, uuid, uuid) TO eye_commit;

/* SET THE GRACE POLICY (commercial.grace.set; the commercial authority, human-gated): version expected_version + 1 of the tenant's policy,
   the prior superseded. read_and_preserve cannot be removed (boundary). A grace already entered keeps the grace_until it was given. */
CREATE OR REPLACE FUNCTION commercial.set_grace_policy(p_policy_id uuid, p_tenant uuid, p_expected_version int, p_grace_days int, p_allows text[], p_renewal_notice_days int,
                                                       p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = commercial, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_current int; v_allows text[]; v_digest text; v_at timestamptz := clock_timestamp();
BEGIN
  PERFORM observation.assert_authority(ARRAY['commercial.grace.set']);
  PERFORM commercial.cgr_assert_commercial(p_actor, 'grace policy');
  IF NOT EXISTS (SELECT 1 FROM tenancy.tenants t WHERE t.id = p_tenant) THEN
    RAISE EXCEPTION 'grace policy rejected (unknown_tenant): no tenant %', p_tenant USING ERRCODE = '23503';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 OR length(p_reason) > 2000 THEN
    RAISE EXCEPTION 'grace policy rejected (reason): a grace policy says why (8 to 2000 characters)' USING ERRCODE = '22023';
  END IF;
  IF p_allows IS NULL OR NOT ('read_and_preserve' = ANY (p_allows)) THEN
    RAISE EXCEPTION 'grace policy rejected (boundary): read and preserve cannot be removed — a grace that hides or destroys customer work is not a grace (ADR-022)' USING ERRCODE = '22023';
  END IF;
  IF NOT (p_allows <@ ARRAY['read_and_preserve', 'finish_running_work', 'new_work']::text[]) THEN
    RAISE EXCEPTION 'grace policy rejected (allows): grace allows read_and_preserve, finish_running_work and new_work only' USING ERRCODE = '22023';
  END IF;
  IF p_grace_days IS NULL OR p_grace_days NOT BETWEEN 1 AND 90 THEN
    RAISE EXCEPTION 'grace policy rejected (grace_days): a grace lasts 1 to 90 days' USING ERRCODE = '22023';
  END IF;
  IF p_renewal_notice_days IS NULL OR p_renewal_notice_days NOT BETWEEN 0 AND 180 THEN
    RAISE EXCEPTION 'grace policy rejected (notice): the renewal notice is 0 to 180 days before the term ends' USING ERRCODE = '22023';
  END IF;
  SELECT g.version INTO v_current FROM commercial.grace_policies g WHERE g.tenant_id = p_tenant AND g.state = 'active' FOR UPDATE;
  IF coalesce(v_current, 0) IS DISTINCT FROM coalesce(p_expected_version, -1) THEN
    RAISE EXCEPTION 'grace policy rejected (stale): the tenant''s grace policy is at version % — name it as the expected version', coalesce(v_current, 0) USING ERRCODE = '2F002';
  END IF;
  v_allows := ARRAY(SELECT DISTINCT a FROM unnest(p_allows) a ORDER BY a);
  v_digest := encode(sha256(convert_to(jsonb_build_object('tenant_id', p_tenant, 'version', coalesce(v_current, 0) + 1, 'grace_days', p_grace_days, 'allows', to_jsonb(v_allows),
                                                          'renewal_notice_days', p_renewal_notice_days)::text, 'UTF8')), 'hex');
  IF v_current IS NOT NULL THEN
    UPDATE commercial.grace_policies SET state = 'superseded', superseded_at = v_at WHERE tenant_id = p_tenant AND version = v_current;
  END IF;
  INSERT INTO commercial.grace_policies (policy_id, tenant_id, version, state, grace_days, allows, renewal_notice_days, reason, digest, supersedes, set_by, effective_at, correlation_id)
  VALUES (p_policy_id, p_tenant, coalesce(v_current, 0) + 1, 'active', p_grace_days, v_allows, p_renewal_notice_days, btrim(p_reason), v_digest, v_current, p_actor, v_at, p_correlation);
  RETURN jsonb_build_object('policy_id', p_policy_id, 'tenant_id', p_tenant, 'version', coalesce(v_current, 0) + 1, 'supersedes', v_current, 'grace_days', p_grace_days,
                            'allows', to_jsonb(v_allows), 'renewal_notice_days', p_renewal_notice_days, 'digest', v_digest, 'effective_at', v_at);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION commercial.set_grace_policy(uuid, uuid, int, int, text[], int, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION commercial.set_grace_policy(uuid, uuid, int, int, text[], int, text, uuid, uuid) TO eye_commit;

/* ISSUE AN OFFLINE TOKEN (commercial.offline_token.issue; human-gated): the service canonicalises the payload (JCS) and signs its digest with
   the Ed25519 key its env REFERENCE names; this port binds the record: sha256(payload text) = the digest; the payload is the token
   (format, token id, tenant, profile, issued_at within five minutes of now, expires_at = the stated expiry) over EXACTLY the version's basis
   (commercial.cgr_token_basis); the version is the licence's newest and active or in grace (a suspended or lapsed licence gets no token);
   the expiry is at least an hour ahead and no later than the term end (in grace: the grace end), and at most 400 days ahead. The signature
   cannot be checked in SQL (Ed25519): its form is; the service verifies it against the derived public key before calling. */
CREATE OR REPLACE FUNCTION commercial.issue_offline_token(p_token_id uuid, p_licence uuid, p_version int, p_profile text, p_payload_text text, p_payload_digest text,
                                                         p_signature text, p_key_ref text, p_key_id text, p_public_key_pem text, p_expires_at timestamptz, p_reason text,
                                                         p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = commercial, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE l commercial.licences%ROWTYPE; v_payload jsonb; v_term timestamptz; v_ceiling timestamptz; v_issued timestamptz; v_now timestamptz := clock_timestamp();
BEGIN
  PERFORM observation.assert_authority(ARRAY['commercial.offline_token.issue']);
  PERFORM commercial.cgr_assert_commercial(p_actor, 'offline token');
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 OR length(p_reason) > 2000 THEN
    RAISE EXCEPTION 'offline token rejected (reason): a token issue says why (8 to 2000 characters)' USING ERRCODE = '22023';
  END IF;
  IF p_profile IS NULL OR p_profile NOT IN ('disconnected', 'air-gapped') THEN
    RAISE EXCEPTION 'offline token rejected (profile): a token is for the disconnected or air-gapped profile' USING ERRCODE = '22023';
  END IF;
  l := commercial.cgr_lock_version(p_licence, p_version, 'offline token');
  IF l.state NOT IN ('active', 'grace') THEN
    RAISE EXCEPTION 'offline token rejected (state): licence % v% is % — a token states an entitlement that holds (active or grace)', p_licence, p_version, l.state USING ERRCODE = '2F002';
  END IF;
  IF EXISTS (SELECT 1 FROM commercial.offline_tokens t WHERE t.token_id = p_token_id) THEN
    RAISE EXCEPTION 'offline token rejected (duplicate): token % is already issued', p_token_id USING ERRCODE = '23505';
  END IF;
  IF p_payload_digest IS NULL OR p_payload_text IS NULL OR encode(sha256(convert_to(p_payload_text, 'UTF8')), 'hex') IS DISTINCT FROM p_payload_digest THEN
    RAISE EXCEPTION 'offline token rejected (digest): the digest is not sha256 of the payload text' USING ERRCODE = '22023';
  END IF;
  BEGIN v_payload := p_payload_text::jsonb;
  EXCEPTION WHEN others THEN RAISE EXCEPTION 'offline token rejected (payload): the payload text is not JSON' USING ERRCODE = '22023'; END;
  IF jsonb_typeof(v_payload) <> 'object' OR v_payload ->> 'format' IS DISTINCT FROM 'eye-licence-token/1' OR v_payload ->> 'token_id' IS DISTINCT FROM p_token_id::text
     OR v_payload ->> 'tenant_id' IS DISTINCT FROM l.tenant_id::text OR v_payload ->> 'profile' IS DISTINCT FROM p_profile
     OR (v_payload -> 'licence') IS DISTINCT FROM commercial.cgr_token_basis(p_licence, p_version)
     OR v_payload ->> 'expires_at' IS DISTINCT FROM commercial.cgr_instant(p_expires_at)
     OR v_payload -> 'issuer' IS DISTINCT FROM jsonb_build_object('principal_id', p_actor, 'key_id', p_key_id)
     OR (SELECT count(*) FROM jsonb_object_keys(v_payload)) <> 8 THEN
    RAISE EXCEPTION 'offline token rejected (payload): the payload is not the token of licence % v% as it stands (format, token, tenant, profile, issuer, expiry and the version''s basis)', p_licence, p_version USING ERRCODE = '22023';
  END IF;
  BEGIN v_issued := (v_payload ->> 'issued_at')::timestamptz;
  EXCEPTION WHEN others THEN v_issued := NULL; END;
  IF v_issued IS NULL OR v_issued > v_now + interval '1 minute' OR v_issued < v_now - interval '5 minutes' THEN
    RAISE EXCEPTION 'offline token rejected (payload): issued_at is not this instant (within five minutes before now)' USING ERRCODE = '22023';
  END IF;
  IF p_key_ref IS NULL OR p_key_ref !~ '^EYE_LICENCE_SIGNING_KEY_[A-Z0-9_]{1,64}$' OR p_key_id IS NULL OR p_key_id !~ '^ed25519:[0-9a-f]{16}$'
     OR p_public_key_pem IS NULL OR p_public_key_pem NOT LIKE '-----BEGIN PUBLIC KEY-----%' THEN
    RAISE EXCEPTION 'offline token rejected (key): the key is named by its reference (EYE_LICENCE_SIGNING_KEY_<NAME>), its id and its public key' USING ERRCODE = '22023';
  END IF;
  IF p_signature IS NULL OR p_signature !~ '^[A-Za-z0-9+/]{86}==$' THEN
    RAISE EXCEPTION 'offline token rejected (signature): an Ed25519 signature is 64 bytes in base64' USING ERRCODE = '22023';
  END IF;
  v_term := commercial.licence_term_end(p_licence, p_version);
  v_ceiling := least(v_now + interval '400 days', CASE WHEN l.state = 'grace' THEN l.grace_until ELSE v_term END);
  IF p_expires_at IS NULL OR p_expires_at < v_now + interval '1 hour' OR p_expires_at > v_ceiling THEN
    RAISE EXCEPTION 'offline token rejected (expiry): a token expires at least an hour ahead and no later than % (the %, at most 400 days ahead)', v_ceiling,
      CASE WHEN l.state = 'grace' THEN 'grace end' ELSE 'term end' END USING ERRCODE = '22023';
  END IF;
  INSERT INTO commercial.offline_tokens (token_id, tenant_id, licence_id, version, format, profile, payload_text, payload_digest, algorithm, signature, key_ref, key_id,
                                         public_key_pem, issued_at, expires_at, issued_by, reason, correlation_id)
  VALUES (p_token_id, l.tenant_id, p_licence, p_version, 'eye-licence-token/1', p_profile, p_payload_text, p_payload_digest, 'Ed25519', p_signature, p_key_ref, p_key_id,
          p_public_key_pem, v_issued, p_expires_at, p_actor, btrim(p_reason), p_correlation);
  RETURN jsonb_build_object('token_id', p_token_id, 'tenant_id', l.tenant_id, 'licence_id', p_licence, 'version', p_version, 'profile', p_profile, 'payload_digest', p_payload_digest,
                            'key_id', p_key_id, 'issued_at', v_issued, 'expires_at', p_expires_at, 'state', l.state);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION commercial.issue_offline_token(uuid, uuid, int, text, text, text, text, text, text, text, timestamptz, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION commercial.issue_offline_token(uuid, uuid, int, text, text, text, text, text, text, text, timestamptz, text, uuid, uuid) TO eye_commit;

/* THE TICK STEP commercial-licence-lapse (under executive.attention.tick, in the tick's own write): the tenant's live versions, locked.
   No licence → nothing (UNCONTRACTED: default-off). Per version, in this order:
     · a grace whose end has passed → LAPSED (grace_ended);
     · live versions that CONFLICT → each active one enters GRACE (indeterminate_conflict) with the last valid entitlement = the oldest
       readable of them (the one in force when another appeared beside it), the grace from now;
     · the newest live version UNREADABLE → GRACE (indeterminate_unreadable) with the last valid = the newest readable earlier version of the
       same licence (else of another licence of the tenant);
     · an active version past its term end → GRACE (term_ended; grace_until = the term end + the policy's days; the last valid = itself),
       and LAPSED at once when that grace has also passed;
     · an active version within the policy's renewal notice → one renewal notice per term end.
   Each move: the ledger row and the commercial.entitlement notice in every active domain of the tenant. The tick LIFTS nothing: a reinstatement
   and a renewal are the commercial authority's. */
CREATE OR REPLACE FUNCTION commercial.lapse_licences(p_tenant uuid, p_domain uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = commercial, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE live commercial.licences[]; l commercial.licences; v_now timestamptz := clock_timestamp(); v_out jsonb := '[]'::jsonb; v_policy jsonb; v_days int; v_notice int;
        v_last jsonb; v_term timestamptz; v_grace timestamptz; v_r jsonb; v_owner uuid; n int; v_newest commercial.licences; v_bad text; v_prev commercial.licences;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.attention.tick']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN
    RAISE EXCEPTION 'licence transition rejected (actor): recorded by the acting principal (the attention agent)' USING ERRCODE = '42501';
  END IF;
  PERFORM 1 FROM commercial.licences y WHERE y.tenant_id = p_tenant AND y.state <> 'superseded' ORDER BY y.issued_at, y.version FOR UPDATE;
  SELECT coalesce(array_agg(x ORDER BY x.issued_at, x.version), '{}') INTO live FROM commercial.licences x WHERE x.tenant_id = p_tenant AND x.state <> 'superseded';
  n := cardinality(live);
  IF n = 0 THEN RETURN jsonb_build_object('contracted', false, 'transitions', '[]'::jsonb); END IF;
  v_policy := commercial.cgr_policy(p_tenant);
  v_days := (v_policy ->> 'grace_days')::int; v_notice := (v_policy ->> 'renewal_notice_days')::int;
  -- 1. graces that have ended
  FOREACH l IN ARRAY live LOOP
    IF l.state = 'grace' AND l.grace_until IS NOT NULL AND l.grace_until <= v_now THEN
      v_r := commercial.cgr_transition(l, gen_random_uuid(), 'lapsed', 'grace_ended', 'lapsed', format('the grace ended %s; no renewal was recorded', commercial.cgr_instant(l.grace_until)),
                                       '{}'::jsonb, NULL, l.grace_until, l.last_valid, p_actor, 'tick', l.issued_by, p_correlation);
      v_out := v_out || v_r;
    END IF;
  END LOOP;
  -- re-read after the lapses (the state moved)
  SELECT coalesce(array_agg(x ORDER BY x.issued_at, x.version), '{}') INTO live FROM commercial.licences x WHERE x.tenant_id = p_tenant AND x.state <> 'superseded';
  v_newest := live[n];
  IF n > 1 THEN
    -- 2. CONFLICT: the last valid = the oldest readable live version
    SELECT x.* INTO v_prev FROM unnest(live) x WHERE commercial.cgr_unreadable(x) IS NULL ORDER BY x.issued_at, x.version LIMIT 1;
    v_last := CASE WHEN v_prev.licence_id IS NULL THEN jsonb_build_object('none', true, 'note', 'no live version reads as an entitlement')
                   ELSE commercial.cgr_snapshot(v_prev, 'the last valid entitlement: the oldest readable of the conflicting live versions') END;
    FOREACH l IN ARRAY live LOOP
      IF l.state = 'active' THEN
        v_r := commercial.cgr_transition(l, gen_random_uuid(), 'grace_entered', 'indeterminate_conflict', 'grace',
                 format('the entitlement is indeterminate: %s live versions conflict', n), jsonb_build_object('live', (SELECT jsonb_agg(jsonb_build_object('licence_id', x.licence_id, 'version', x.version)) FROM unnest(live) x)),
                 NULL, v_now + make_interval(days => v_days), v_last, p_actor, 'tick', l.issued_by, p_correlation);
        v_out := v_out || v_r;
      END IF;
    END LOOP;
    RETURN jsonb_build_object('contracted', true, 'live', n, 'transitions', v_out);
  END IF;
  l := v_newest;
  v_bad := commercial.cgr_unreadable(l);
  IF l.state = 'active' AND v_bad IS NOT NULL THEN
    -- 3. UNREADABLE: the last valid = the newest readable earlier version of the SAME licence (superseded or not), else of another of the tenant's
    SELECT x.* INTO v_prev FROM commercial.licences x WHERE x.tenant_id = p_tenant AND NOT (x.licence_id = l.licence_id AND x.version = l.version)
      AND commercial.cgr_unreadable(x) IS NULL AND x.issued_at <= l.issued_at ORDER BY (x.licence_id = l.licence_id) DESC, x.issued_at DESC, x.version DESC LIMIT 1;
    v_last := CASE WHEN v_prev.licence_id IS NULL THEN jsonb_build_object('none', true, 'note', 'no earlier version reads as an entitlement')
                   ELSE commercial.cgr_snapshot(v_prev, 'the last valid entitlement: the newest readable earlier version') END;
    v_r := commercial.cgr_transition(l, gen_random_uuid(), 'grace_entered', 'indeterminate_unreadable', 'grace', format('the entitlement is indeterminate: %s', v_bad),
                                     jsonb_build_object('unreadable', v_bad), NULL, v_now + make_interval(days => v_days), v_last, p_actor, 'tick', l.issued_by, p_correlation);
    RETURN jsonb_build_object('contracted', true, 'live', 1, 'transitions', v_out || v_r);
  END IF;
  v_term := commercial.licence_term_end(l.licence_id, l.version);
  IF l.state = 'active' AND v_term IS NOT NULL AND v_term <= v_now THEN
    -- 4. THE TERM ENDED → grace from the term end; lapsed at once when that grace has passed too
    v_grace := v_term + make_interval(days => v_days);
    v_r := commercial.cgr_transition(l, gen_random_uuid(), 'grace_entered', 'term_ended', 'grace', format('the term ended %s; the declared grace runs %s days', commercial.cgr_instant(v_term), v_days),
                                     '{}'::jsonb, NULL, v_grace, commercial.cgr_snapshot(l, 'the last valid entitlement: the version whose term ended'), p_actor, 'tick', l.issued_by, p_correlation);
    v_out := v_out || v_r;
    IF v_grace <= v_now THEN
      SELECT * INTO l FROM commercial.licences x WHERE x.licence_id = l.licence_id AND x.version = l.version;
      v_r := commercial.cgr_transition(l, gen_random_uuid(), 'lapsed', 'grace_ended', 'lapsed', format('the grace ended %s; no renewal was recorded', commercial.cgr_instant(v_grace)),
                                       '{}'::jsonb, NULL, v_grace, l.last_valid, p_actor, 'tick', l.issued_by, p_correlation);
      v_out := v_out || v_r;
    END IF;
  ELSIF l.state = 'active' AND v_term IS NOT NULL AND v_notice > 0 AND v_term - make_interval(days => v_notice) <= v_now
        AND NOT EXISTS (SELECT 1 FROM commercial.licence_transitions t WHERE t.licence_id = l.licence_id AND t.version = l.version AND t.kind = 'renewal_notice' AND t.term_end_after = v_term) THEN
    -- 5. THE RENEWAL NOTICE (no state change)
    v_r := commercial.cgr_transition(l, gen_random_uuid(), 'renewal_notice', 'renewal_due', 'active', format('the term ends %s, within the %s-day renewal notice', commercial.cgr_instant(v_term), v_notice),
                                     '{}'::jsonb, NULL, NULL, NULL, p_actor, 'tick', l.issued_by, p_correlation);
    v_out := v_out || v_r;
  END IF;
  RETURN jsonb_build_object('contracted', true, 'live', 1, 'transitions', v_out);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION commercial.lapse_licences(uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION commercial.lapse_licences(uuid, uuid, uuid, uuid) TO eye_commit;
-- end section `grace`
