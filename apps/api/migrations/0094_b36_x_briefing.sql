-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- section `briefing`
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0094 §B — CP-6 B36 part `briefing` (2026-09-30): THE LIVE BRIEFING STUDIO v2 COMPLETED — BRF@v3 (F-P6-12 completes).
--
-- What this section declares, and nothing else (MAP.md §B; the §0 prelude USED, never re-declared):
--   §B.1  executive.briefing_audience_ok(jsonb) — the AUDIENCE CONTRACT's shape (roles, locale, accessibility, channels, an optional
--         exclusion of the disputed / indicator sections); the v3 columns on executive.briefings: audience, purpose, expires_at,
--         omissions, suppressed, disputed, policy_version; schema_version admits 'v3'; the CHECK binding v3 to its contract and the
--         attention section to v2 AND v3 (0084's xbr_attention_v2 re-declared); every v1 / v2 edition reads as before.
--   §B.2  executive.briefing_policies — the UNSAFE-PRODUCT SUPPRESSION RULE ("prefer silence over false certainty"): per item class a
--         minimum of independent sources, a maximum staleness, a minimum confidence; executive.briefing_policy_rules_ok, the port
--         executive.set_briefing_policy (bound action briefing.policy.set; a named human), the read executive.briefing_policy_at.
--   §B.3  executive.briefing_events.event widened (+ briefing.suppressed, briefing.omission_declared, briefing.expired,
--         briefing.disputed_item) — MAP.md §0 lists this among the prelude's widenings; the prelude as written (0094 §0.7) widens
--         decision.package_events and the attention vocabularies only, so it is done here (the integrator may move it to §0).
--   §B.4  the BRF@v3 schema row (0084 §5's v2 row, plus the fields v3 requires: each item's `uncertainty`, and audience, purpose,
--         expires_at, omissions, suppressed, disputed, indicators at the payload's top level).
--   §B.5  executive.compose_briefing RE-DECLARED from 0084 §5 (apps/api/migrations/0084_b23_interfaces_and_briefing_v2.sql lines
--         356–431 — the ONLY re-declaration of this section; the previous signature dropped) with the v3 columns, the v3 refusals as the
--         family `briefing rejected (<class>): …`, and the three ledger events written in the same transaction.
--   §B.6  executive.expire_briefings — the attention tick's step `briefing-expiry` (order 60; bound action executive.attention.tick):
--         a v3 edition past its expires_at gains the event briefing.expired once; the read renders it expired. (The tick, not the read,
--         writes the event: a read is a read — B.md b3.)
--   §B.7  RLS and grants (the 0081 loop idiom) for the section's table.
-- Forward-only; 0084 and the §0 prelude untouched. Every figure the harness seeds is SYNTHETIC.

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §B.1 THE AUDIENCE CONTRACT and the v3 columns
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
/* The audience contract's SHAPE (structural; the roles are role codes, never resolved here — the read compares the reader's bindings):
     { roles: [<role code>, …] (non-empty), locale: 'en' | 'de-DE' | …, accessibility: { plain_language: bool, screen_reader: bool },
       channels: ['in-app' | 'demo-mailbox' | 'email' | 'sms' | 'teams', …] (non-empty; the B24/B34 delivery channels),
       exclude?: ['disputed' | 'indicator', …] } */
CREATE OR REPLACE FUNCTION executive.briefing_audience_ok(p jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE r jsonb; a jsonb; x text;
BEGIN
  IF p IS NULL OR jsonb_typeof(p) <> 'object' THEN RETURN false; END IF;
  IF jsonb_typeof(p -> 'roles') <> 'array' OR jsonb_array_length(p -> 'roles') = 0 THEN RETURN false; END IF;
  FOR r IN SELECT * FROM jsonb_array_elements(p -> 'roles') LOOP
    IF jsonb_typeof(r) <> 'string' OR (r #>> '{}') !~ '^[a-z][a-z0-9_]{2,39}$' THEN RETURN false; END IF;
  END LOOP;
  IF jsonb_typeof(p -> 'locale') <> 'string' OR (p ->> 'locale') !~ '^[a-z]{2}(-[A-Z]{2})?$' THEN RETURN false; END IF;
  a := p -> 'accessibility';
  IF a IS NULL OR jsonb_typeof(a) <> 'object' OR jsonb_typeof(a -> 'plain_language') <> 'boolean' OR jsonb_typeof(a -> 'screen_reader') <> 'boolean' THEN RETURN false; END IF;
  IF jsonb_typeof(p -> 'channels') <> 'array' OR jsonb_array_length(p -> 'channels') = 0 THEN RETURN false; END IF;
  FOR r IN SELECT * FROM jsonb_array_elements(p -> 'channels') LOOP
    IF jsonb_typeof(r) <> 'string' OR (r #>> '{}') NOT IN ('in-app', 'demo-mailbox', 'email', 'sms', 'teams') THEN RETURN false; END IF;
  END LOOP;
  IF p ? 'exclude' THEN
    IF jsonb_typeof(p -> 'exclude') <> 'array' THEN RETURN false; END IF;
    FOR r IN SELECT * FROM jsonb_array_elements(p -> 'exclude') LOOP
      IF jsonb_typeof(r) <> 'string' OR (r #>> '{}') NOT IN ('disputed', 'indicator') THEN RETURN false; END IF;
    END LOOP;
  END IF;
  FOR x IN SELECT jsonb_object_keys(p) LOOP
    IF x NOT IN ('roles', 'locale', 'accessibility', 'channels', 'exclude') THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
END $$;
GRANT EXECUTE ON FUNCTION executive.briefing_audience_ok(jsonb) TO eye_app, eye_commit;

-- schema_version admits 'v3' (0084's anonymous CHECK re-declared whole); the attention section rides v2 AND v3 (0084's xbr_attention_v2 whole).
ALTER TABLE executive.briefings DROP CONSTRAINT briefings_schema_version_check;
ALTER TABLE executive.briefings ADD CONSTRAINT briefings_schema_version_check CHECK (schema_version IN ('v1', 'v2', 'v3'));
ALTER TABLE executive.briefings DROP CONSTRAINT xbr_attention_v2;
ALTER TABLE executive.briefings ADD CONSTRAINT xbr_attention_v2 CHECK ((schema_version IN ('v2', 'v3')) = (attention IS NOT NULL));
-- The v3 columns (ADD COLUMN rewrites nothing the append-only trigger guards; the defaults fill every earlier edition's ledgers with []).
ALTER TABLE executive.briefings
  ADD COLUMN audience       jsonb CHECK (audience IS NULL OR executive.briefing_audience_ok(audience)),
  ADD COLUMN purpose        text  CHECK (purpose IS NULL OR length(btrim(purpose)) BETWEEN 8 AND 400),
  ADD COLUMN expires_at     timestamptz,
  ADD COLUMN omissions      jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(omissions) = 'array'),
  ADD COLUMN suppressed     jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(suppressed) = 'array'),
  ADD COLUMN disputed       jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(disputed) = 'array'),
  ADD COLUMN policy_version int   CHECK (policy_version IS NULL OR policy_version >= 1);
ALTER TABLE executive.briefings ADD CONSTRAINT xbr_v3_contract CHECK ((schema_version = 'v3') = (audience IS NOT NULL AND purpose IS NOT NULL AND expires_at IS NOT NULL));
ALTER TABLE executive.briefings ADD CONSTRAINT xbr_v3_expiry CHECK (expires_at IS NULL OR expires_at > known_at);
COMMENT ON COLUMN executive.briefings.audience IS 'BRF@v3 (0094 §B): the AUDIENCE CONTRACT — roles, locale, accessibility, channels (and an optional exclusion of the disputed / indicator sections); a reader outside the roles is refused the edition at read time (briefing rejected (audience)). NULL on a v1 / v2 edition.';
COMMENT ON COLUMN executive.briefings.purpose IS 'BRF@v3: what the edition is for, in words (8–400 characters).';
COMMENT ON COLUMN executive.briefings.expires_at IS 'BRF@v3: the instant after which the edition reads as EXPIRED (the tick step briefing-expiry writes briefing.expired once; the read renders expired: true).';
COMMENT ON COLUMN executive.briefings.omissions IS 'BRF@v3: what the edition COULD NOT include and why — each {kind, object|source, reason}: source_degraded, source_blocked, memory_unavailable, below_clearance, suppressed, outage. An edition composed under an unavailable dependency that declares none is refused (briefing rejected (undeclared_omission)).';
COMMENT ON COLUMN executive.briefings.suppressed IS 'BRF@v3: the items the suppression policy withheld — {item_id, kind, rule, measure}; each is also declared as an omission of kind suppressed and recorded as briefing.suppressed. The composer never fills the gap with a weaker conclusion.';
COMMENT ON COLUMN executive.briefings.disputed IS 'BRF@v3: the disputed section — the disputed items (a package under challenge, a standing dissent, a contradiction ref) with their as-of and, for a board audience, the owner''s note.';
COMMENT ON COLUMN executive.briefings.policy_version IS 'BRF@v3: the briefing policy version in force at known_at (NULL when none was published by then — nothing is suppressed).';

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §B.2 THE SUPPRESSION POLICY ("prefer silence over false certainty")
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
/* The rules' shape: { default: <rule>, classes?: { <item kind>: <rule>, … } }; a rule is { min_sources: int ≥ 1, max_staleness_hours: int ≥ 1,
   min_confidence: 0..1 | null } — a class rule may give only some of the three (the default fills the rest). The item kinds are the composer's:
   evidence, claim, run, branch, warning, warning-acknowledged, memory, package, dissent, disputed, indicator. */
CREATE OR REPLACE FUNCTION executive.briefing_policy_rule_ok(p jsonb, p_complete boolean) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE k text;
BEGIN
  IF p IS NULL OR jsonb_typeof(p) <> 'object' THEN RETURN false; END IF;
  FOR k IN SELECT jsonb_object_keys(p) LOOP
    IF k NOT IN ('min_sources', 'max_staleness_hours', 'min_confidence') THEN RETURN false; END IF;
  END LOOP;
  IF p_complete AND NOT (p ? 'min_sources' AND p ? 'max_staleness_hours' AND p ? 'min_confidence') THEN RETURN false; END IF;
  IF p ? 'min_sources' AND (jsonb_typeof(p -> 'min_sources') <> 'number' OR (p ->> 'min_sources')::numeric < 1 OR (p ->> 'min_sources')::numeric <> floor((p ->> 'min_sources')::numeric)) THEN RETURN false; END IF;
  IF p ? 'max_staleness_hours' AND (jsonb_typeof(p -> 'max_staleness_hours') <> 'number' OR (p ->> 'max_staleness_hours')::numeric < 1) THEN RETURN false; END IF;
  IF p ? 'min_confidence' AND jsonb_typeof(p -> 'min_confidence') <> 'null' AND (jsonb_typeof(p -> 'min_confidence') <> 'number' OR (p ->> 'min_confidence')::numeric < 0 OR (p ->> 'min_confidence')::numeric > 1) THEN RETURN false; END IF;
  RETURN true;
END $$;
CREATE OR REPLACE FUNCTION executive.briefing_policy_rules_ok(p jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE k text;
BEGIN
  IF p IS NULL OR jsonb_typeof(p) <> 'object' THEN RETURN false; END IF;
  FOR k IN SELECT jsonb_object_keys(p) LOOP
    IF k NOT IN ('default', 'classes') THEN RETURN false; END IF;
  END LOOP;
  IF NOT executive.briefing_policy_rule_ok(p -> 'default', true) THEN RETURN false; END IF;
  IF p ? 'classes' THEN
    IF jsonb_typeof(p -> 'classes') <> 'object' THEN RETURN false; END IF;
    FOR k IN SELECT jsonb_object_keys(p -> 'classes') LOOP
      IF k NOT IN ('evidence', 'claim', 'run', 'branch', 'warning', 'warning-acknowledged', 'memory', 'package', 'dissent', 'disputed', 'indicator') THEN RETURN false; END IF;
      IF NOT executive.briefing_policy_rule_ok(p -> 'classes' -> k, false) THEN RETURN false; END IF;
    END LOOP;
  END IF;
  RETURN true;
END $$;
GRANT EXECUTE ON FUNCTION executive.briefing_policy_rule_ok(jsonb, boolean) TO eye_app, eye_commit;
GRANT EXECUTE ON FUNCTION executive.briefing_policy_rules_ok(jsonb) TO eye_app, eye_commit;

CREATE TABLE executive.briefing_policies (
  policy_id       uuid PRIMARY KEY,
  scope           text NOT NULL,
  tenant_id       uuid NOT NULL,
  domain_id       uuid NOT NULL,
  version         int  NOT NULL CHECK (version >= 1),
  rules           jsonb NOT NULL CHECK (executive.briefing_policy_rules_ok(rules)),
  reason          text NOT NULL CHECK (length(btrim(reason)) BETWEEN 8 AND 2000),
  set_by          uuid NOT NULL,
  effective_at    timestamptz NOT NULL DEFAULT clock_timestamp(),
  superseded_at   timestamptz,
  correlation_id  uuid NOT NULL,
  CONSTRAINT xbp_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT xbp_version UNIQUE (tenant_id, domain_id, version)
);
CREATE UNIQUE INDEX xbp_one_current ON executive.briefing_policies (tenant_id, domain_id) WHERE superseded_at IS NULL;
COMMENT ON TABLE executive.briefing_policies IS 'B36 §B (0094): the briefing SUPPRESSION policy — per item class the minimum of independent sources, the maximum staleness and the minimum confidence below which an item is not rendered but recorded as suppressed and declared as an omission ("prefer silence over false certainty"). Versioned; one current per domain; the composer reads the version in force at known_at.';
/* A policy row moves one way: current → superseded (the superseded instant set once); nothing else of the row changes (§0.4's idiom). */
CREATE OR REPLACE FUNCTION executive.briefing_policies_forward() RETURNS trigger
SET search_path = executive, pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'briefing policies are append-only: DELETE prohibited' USING ERRCODE = '2F002'; END IF;
  IF OLD.superseded_at IS NOT NULL OR NEW.superseded_at IS NULL OR (to_jsonb(NEW) - 'superseded_at') <> (to_jsonb(OLD) - 'superseded_at') THEN
    RAISE EXCEPTION 'briefing policy % is immutable; a new version supersedes it', OLD.policy_id USING ERRCODE = '2F002';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER xbp_forward BEFORE UPDATE OR DELETE ON executive.briefing_policies FOR EACH ROW EXECUTE FUNCTION executive.briefing_policies_forward();

/* The port: a NAMED HUMAN publishes the policy (bound action briefing.policy.set; the acting principal recorded); the same rules again are
   refused (nothing to supersede); the prior version is superseded in the same statement. */
CREATE OR REPLACE FUNCTION executive.set_briefing_policy(p_policy_id uuid, p_tenant uuid, p_domain uuid, p_rules jsonb, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE prior record; v_version int;
BEGIN
  PERFORM observation.assert_authority(ARRAY['briefing.policy.set']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'briefing policy rejected (actor): set by the acting principal' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM identity.principals x WHERE x.id = p_actor AND x.kind = 'human' AND x.status = 'active') THEN
    RAISE EXCEPTION 'briefing policy rejected (actor): a policy is set by a named, active human' USING ERRCODE = '42501';
  END IF;
  IF NOT executive.briefing_policy_rules_ok(p_rules) THEN
    RAISE EXCEPTION 'briefing policy rejected (rules): rules are { default: { min_sources ≥ 1, max_staleness_hours ≥ 1, min_confidence 0..1 | null }, classes?: { <item kind>: <partial rule> } }' USING ERRCODE = '22023';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN RAISE EXCEPTION 'briefing policy rejected (reason): a reason of at least 8 characters says why the policy changes' USING ERRCODE = '22023'; END IF;
  SELECT * INTO prior FROM executive.briefing_policies b WHERE b.tenant_id = p_tenant AND b.domain_id = p_domain AND b.superseded_at IS NULL FOR UPDATE;
  IF FOUND AND prior.rules = p_rules THEN RAISE EXCEPTION 'briefing policy rejected (state): the rules are unchanged from version %', prior.version USING ERRCODE = '22023'; END IF;
  v_version := coalesce((SELECT max(version) FROM executive.briefing_policies b WHERE b.tenant_id = p_tenant AND b.domain_id = p_domain), 0) + 1;
  IF FOUND THEN UPDATE executive.briefing_policies SET superseded_at = clock_timestamp() WHERE policy_id = prior.policy_id; END IF;
  INSERT INTO executive.briefing_policies (policy_id, scope, tenant_id, domain_id, version, rules, reason, set_by, correlation_id)
  VALUES (p_policy_id, 'DOMAIN', p_tenant, p_domain, v_version, p_rules, btrim(p_reason), p_actor, p_correlation);
  RETURN jsonb_build_object('policy_id', p_policy_id, 'version', v_version, 'rules', p_rules, 'reason', btrim(p_reason), 'set_by', p_actor, 'effective_at', clock_timestamp(), 'supersedes', CASE WHEN prior.policy_id IS NULL THEN NULL ELSE prior.version END);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.set_briefing_policy(uuid,uuid,uuid,jsonb,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.set_briefing_policy(uuid,uuid,uuid,jsonb,text,uuid,uuid) TO eye_commit;

/* The read (an invoker under the caller's RLS): the policy in force AT an instant — effective by then, not superseded by then — or NULL. */
CREATE OR REPLACE FUNCTION executive.briefing_policy_at(p_tenant uuid, p_domain uuid, p_at timestamptz) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = executive, pg_catalog, pg_temp AS $$
  SELECT to_jsonb(b) - 'scope' - 'correlation_id'
    FROM executive.briefing_policies b
   WHERE b.tenant_id = p_tenant AND b.domain_id = p_domain AND b.effective_at <= p_at AND (b.superseded_at IS NULL OR b.superseded_at > p_at)
   ORDER BY b.version DESC LIMIT 1
$$;
GRANT EXECUTE ON FUNCTION executive.briefing_policy_at(uuid, uuid, timestamptz) TO eye_app, eye_commit;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §B.3 executive.briefing_events widened (0065 §8's list whole, plus B36's)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
ALTER TABLE executive.briefing_events DROP CONSTRAINT briefing_events_event_check;
ALTER TABLE executive.briefing_events ADD CONSTRAINT briefing_events_event_check CHECK (event IN (
  'briefing.re_flagged',
  -- B36 (0094 §B): the v3 ledger — an item suppressed under policy, an omission declared, an edition expired, a disputed item carried
  'briefing.suppressed', 'briefing.omission_declared', 'briefing.expired', 'briefing.disputed_item'));

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §B.4 BRF@v3 — 0084 §5's v2 row, plus what v3 requires
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
INSERT INTO objects.schema_registry (object_type, schema_version, json_schema, compatibility) VALUES
('BRF', 'v3', '{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "additionalProperties": false,
  "required": ["room_id","package_id","watermark","sources","items","windows","source_states","degraded","attention","audience","purpose","expires_at","omissions","suppressed","disputed","indicators","policy_version","content_digest","narrative","narrative_cites","composed_via"],
  "properties": {
    "room_id": { "type": ["string","null"] },
    "package_id": { "type": ["string","null"] },
    "watermark": { "type": "object", "required": ["prior_briefing_id","prior_composed_at","known_at"] },
    "sources": { "type": "array" },
    "items": { "type": "array", "items": { "type": "object", "required": ["item_id","kind","at","truth_state","source_state","uncertainty"],
               "properties": { "uncertainty": { "type": "object", "required": ["band","basis"], "properties": { "band": { "enum": ["high","medium","low","unknown"] }, "basis": { "type": "object" } } },
                               "retained_from": { "type": ["string","null"] } } } },
    "windows": { "type": "array" },
    "source_states": { "type": "array" },
    "degraded": { "type": "boolean" },
    "attention": {
      "type": "object",
      "additionalProperties": false,
      "required": ["as_of","since","policy_version","items","counts","material_changes_since_prior"],
      "properties": {
        "as_of": { "type": "string" },
        "since": { "type": ["string","null"] },
        "policy_version": { "type": ["integer","null"] },
        "items": { "type": "array", "items": { "type": "object", "required": ["item_id","signal_class","subject_kind","subject_id","state","confidence","confidence_band"],
                   "properties": { "confidence_band": { "enum": ["high","medium","low","unknown"] } } } },
        "counts": { "type": "object" },
        "material_changes_since_prior": { "type": "array", "items": { "type": "object", "required": ["item_id","subject_id","state","confidence","confidence_band"],
                   "properties": { "confidence_band": { "enum": ["high","medium","low","unknown"] } } } }
      }
    },
    "audience": { "type": "object", "required": ["roles","locale","accessibility","channels"],
                  "properties": { "roles": { "type": "array", "minItems": 1 }, "locale": { "type": "string" },
                                  "accessibility": { "type": "object", "required": ["plain_language","screen_reader"] }, "channels": { "type": "array", "minItems": 1 },
                                  "exclude": { "type": "array", "items": { "enum": ["disputed","indicator"] } } } },
    "purpose": { "type": "string", "minLength": 8 },
    "expires_at": { "type": "string" },
    "omissions": { "type": "array", "items": { "type": "object", "required": ["kind","reason"], "properties": { "kind": { "enum": ["source_degraded","source_blocked","memory_unavailable","below_clearance","suppressed","outage"] } } } },
    "suppressed": { "type": "array", "items": { "type": "object", "required": ["item_id","kind","rule","measure"] } },
    "disputed": { "type": "array", "items": { "type": "object", "required": ["item_id","basis","as_of"] } },
    "indicators": { "type": "array", "items": { "type": "object", "required": ["item_id","as_of"] } },
    "policy_version": { "type": ["integer","null"] },
    "content_digest": { "type": "string", "pattern": "^[0-9a-f]{64}$" },
    "narrative": { "type": ["string","null"] },
    "narrative_cites": { "type": "array" },
    "composed_via": { "enum": ["human","agent"] },
    "agent_id": { "type": ["string","null"] }
  }
}'::jsonb, 'backward')
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §B.5 executive.compose_briefing — 0084 §5's body (lines 356–431), the v3 contract appended
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- The ONLY re-declaration of this section: 0084 §5's body verbatim (its refusal texts kept — phase6-briefings pins them), then the v3
-- gates in the family `briefing rejected (<class>): …` (actor → 403, unknown_* → 404, state / undeclared_omission → 409, the rest → 422)
-- and the three ledger events; the previous signature dropped.
DROP FUNCTION IF EXISTS executive.compose_briefing(uuid,uuid,uuid,uuid,uuid,uuid,text,uuid,timestamptz,uuid,jsonb,jsonb,jsonb,jsonb,jsonb,boolean,text,jsonb,text,text,jsonb,uuid,uuid,jsonb,text,jsonb);
CREATE OR REPLACE FUNCTION executive.compose_briefing(
  p_briefing_id uuid, p_tenant uuid, p_domain uuid, p_room_id uuid, p_package_id uuid, p_composer uuid, p_via text, p_agent_id uuid, p_known_at timestamptz,
  p_prior uuid, p_watermark jsonb, p_sources jsonb, p_items jsonb, p_windows jsonb, p_source_states jsonb, p_degraded boolean,
  p_narrative text, p_narrative_cites jsonb, p_content_digest text, p_header_digest text, p_controls jsonb, p_event_id uuid, p_correlation uuid,
  p_memory_accesses jsonb, p_schema_version text, p_attention jsonb,
  -- B36 (0094 §B): the v3 contract — NULL / [] on a v1 or v2 edition
  p_audience jsonb, p_purpose text, p_expires_at timestamptz, p_omissions jsonb, p_suppressed jsonb, p_disputed jsonb, p_policy_version int
) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r record; pr record; c jsonb; v_ids jsonb; v_unavailable boolean; v_suppressed_omissions int; v_i jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['briefing.compose']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_composer IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'briefing rejected: composed by the acting principal' USING ERRCODE = '42501'; END IF;
  -- 0084 (BRF@v2): an edition names its schema version; a v2 edition carries its attention section, a v1 edition none. B36: v3 carries it too.
  IF p_schema_version IS NULL OR p_schema_version NOT IN ('v1', 'v2', 'v3') THEN RAISE EXCEPTION 'briefing rejected: the schema version is v1, v2 or v3' USING ERRCODE = '22023'; END IF;
  IF (p_schema_version IN ('v2', 'v3')) <> (p_attention IS NOT NULL AND jsonb_typeof(p_attention) = 'object') THEN
    RAISE EXCEPTION 'briefing rejected: a BRF@v2 or BRF@v3 edition carries its attention section and a BRF@v1 edition none' USING ERRCODE = '22023';
  END IF;
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
  -- ── B36 (0094 §B): the v3 contract ─────────────────────────────────────────────────────────────────────────────────────────────
  IF p_schema_version = 'v3' THEN
    IF NOT executive.briefing_audience_ok(p_audience) THEN
      -- the class is `contract` (the caller's malformed request, 422); `audience` is the READ's refusal of a reader outside the roles (403)
      RAISE EXCEPTION 'briefing rejected (contract): the audience contract names roles (non-empty), a locale, accessibility { plain_language, screen_reader } and channels (non-empty)' USING ERRCODE = '22023';
    END IF;
    IF p_purpose IS NULL OR length(btrim(p_purpose)) < 8 OR length(btrim(p_purpose)) > 400 THEN RAISE EXCEPTION 'briefing rejected (purpose): a purpose of 8 to 400 characters says what the edition is for' USING ERRCODE = '22023'; END IF;
    IF p_expires_at IS NULL OR p_expires_at <= p_known_at THEN RAISE EXCEPTION 'briefing rejected (expiry): expires_at is an instant after the edition''s known_at' USING ERRCODE = '22023'; END IF;
    IF p_policy_version IS NOT NULL AND NOT EXISTS (SELECT 1 FROM executive.briefing_policies b WHERE b.tenant_id = p_tenant AND b.domain_id = p_domain AND b.version = p_policy_version) THEN
      RAISE EXCEPTION 'briefing rejected (unknown_policy): no briefing policy version % in this domain', p_policy_version USING ERRCODE = '23503';
    END IF;
    IF p_omissions IS NULL OR jsonb_typeof(p_omissions) <> 'array' OR p_suppressed IS NULL OR jsonb_typeof(p_suppressed) <> 'array' OR p_disputed IS NULL OR jsonb_typeof(p_disputed) <> 'array' THEN
      RAISE EXCEPTION 'briefing rejected (ledgers): omissions, suppressed and disputed are arrays' USING ERRCODE = '22023';
    END IF;
    -- every displayed conclusion carries its uncertainty band and basis (computed by the composer; never asserted by a caller)
    FOR v_i IN SELECT * FROM jsonb_array_elements(p_items) LOOP
      IF jsonb_typeof(v_i -> 'uncertainty') <> 'object' OR (v_i -> 'uncertainty' ->> 'band') IS NULL OR (v_i -> 'uncertainty' ->> 'band') NOT IN ('high', 'medium', 'low', 'unknown') OR jsonb_typeof(v_i -> 'uncertainty' -> 'basis') <> 'object' THEN
        RAISE EXCEPTION 'briefing rejected (uncertainty): item % carries no uncertainty band (high | medium | low | unknown) with its basis', v_i ->> 'item_id' USING ERRCODE = '22023';
      END IF;
    END LOOP;
    FOR v_i IN SELECT * FROM jsonb_array_elements(p_omissions) LOOP
      IF (v_i ->> 'kind') IS NULL OR (v_i ->> 'kind') NOT IN ('source_degraded', 'source_blocked', 'memory_unavailable', 'below_clearance', 'suppressed', 'outage') OR (v_i ->> 'reason') IS NULL OR length(btrim(v_i ->> 'reason')) < 8 THEN
        RAISE EXCEPTION 'briefing rejected (omission): an omission names its kind (source_degraded | source_blocked | memory_unavailable | below_clearance | suppressed | outage) and its reason' USING ERRCODE = '22023';
      END IF;
    END LOOP;
    -- an edition whose composition met an UNAVAILABLE DEPENDENCY declares an omission, or is refused: a degraded or blocked source among
    -- the states the composition read, the memory content unavailable (B21's token in the watermark), or an item withheld under policy.
    -- (`degraded` alone is not the test: a withdrawn memory projection served from its log, labelled, omits nothing — B20.)
    v_unavailable := EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(p_source_states, '[]'::jsonb)) s WHERE (s ->> 'state') IN ('degraded', 'blocked'))
      OR (p_watermark -> 'projection' ->> 'memory_content') = 'unavailable'
      OR jsonb_array_length(p_suppressed) > 0;
    IF v_unavailable AND jsonb_array_length(p_omissions) = 0 THEN
      RAISE EXCEPTION 'briefing rejected (undeclared_omission): the composition met an unavailable dependency (a degraded or blocked source, the memory content unavailable, or an item withheld under policy) and declares no omission; an edition names what it could not include' USING ERRCODE = '22023';
    END IF;
    SELECT count(*) INTO v_suppressed_omissions FROM jsonb_array_elements(p_omissions) o WHERE (o ->> 'kind') = 'suppressed';
    IF v_suppressed_omissions < jsonb_array_length(p_suppressed) THEN
      RAISE EXCEPTION 'briefing rejected (undeclared_omission): % item(s) suppressed under policy but % declared as omissions of kind suppressed', jsonb_array_length(p_suppressed), v_suppressed_omissions USING ERRCODE = '22023';
    END IF;
    -- a suppressed item is not rendered: it is not among the items, and the narrative cannot cite it
    FOR v_i IN SELECT * FROM jsonb_array_elements(p_suppressed) LOOP
      IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_items) x WHERE (x ->> 'item_id') = (v_i ->> 'item_id')) THEN
        RAISE EXCEPTION 'briefing rejected (suppressed): item % is suppressed under policy and rendered at once', v_i ->> 'item_id' USING ERRCODE = '22023';
      END IF;
    END LOOP;
  ELSIF p_audience IS NOT NULL OR p_purpose IS NOT NULL OR p_expires_at IS NOT NULL THEN
    RAISE EXCEPTION 'briefing rejected (schema): the audience contract, purpose and expiry belong to a BRF@v3 edition' USING ERRCODE = '22023';
  END IF;
  INSERT INTO executive.briefings (briefing_id, scope, tenant_id, domain_id, room_id, package_id, composed_by, composed_via, agent_id, known_at, prior_briefing_id, watermark, sources, items, windows, source_states, degraded,
                                   narrative, narrative_cites, content_digest, header_digest, controls, correlation_id, memory_accesses, schema_version, attention,
                                   audience, purpose, expires_at, omissions, suppressed, disputed, policy_version)
  VALUES (p_briefing_id, 'DOMAIN', p_tenant, p_domain, p_room_id, p_package_id, p_composer, p_via, p_agent_id, p_known_at, p_prior, p_watermark, p_sources, p_items, p_windows, coalesce(p_source_states, '[]'::jsonb), coalesce(p_degraded, false),
          p_narrative, CASE WHEN p_narrative IS NULL THEN '[]'::jsonb ELSE coalesce(p_narrative_cites, '[]'::jsonb) END, p_content_digest, p_header_digest, coalesce(p_controls, '{}'::jsonb), p_correlation, coalesce(p_memory_accesses, '[]'::jsonb),
          p_schema_version, p_attention,
          CASE WHEN p_schema_version = 'v3' THEN p_audience END, CASE WHEN p_schema_version = 'v3' THEN btrim(p_purpose) END, CASE WHEN p_schema_version = 'v3' THEN p_expires_at END,
          coalesce(p_omissions, '[]'::jsonb), coalesce(p_suppressed, '[]'::jsonb), coalesce(p_disputed, '[]'::jsonb), CASE WHEN p_schema_version = 'v3' THEN p_policy_version END);
  IF p_room_id IS NOT NULL THEN
    INSERT INTO executive.room_events (event_id, scope, tenant_id, domain_id, room_id, event, actor_principal_id, details, correlation_id)
    VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_room_id, 'briefing.composed', p_composer,
            jsonb_build_object('briefing_id', p_briefing_id, 'prior_briefing_id', p_prior, 'known_at', p_known_at, 'content_digest', p_content_digest, 'items', jsonb_array_length(p_items), 'degraded', coalesce(p_degraded, false), 'via', p_via,
                               'schema_version', p_schema_version), p_correlation);
  END IF;
  -- B36: the v3 ledger — what was withheld, what was declared, what is disputed; one event each, in this transaction, by the composer
  IF p_schema_version = 'v3' THEN
    FOR v_i IN SELECT * FROM jsonb_array_elements(p_suppressed) LOOP
      INSERT INTO executive.briefing_events (event_id, scope, tenant_id, domain_id, briefing_id, event, actor_principal_id, details, correlation_id)
      VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_briefing_id, 'briefing.suppressed', p_composer, jsonb_build_object('item_id', v_i ->> 'item_id', 'kind', v_i ->> 'kind', 'rule', v_i -> 'rule', 'measure', v_i -> 'measure', 'policy_version', p_policy_version), p_correlation);
    END LOOP;
    FOR v_i IN SELECT * FROM jsonb_array_elements(p_omissions) LOOP
      INSERT INTO executive.briefing_events (event_id, scope, tenant_id, domain_id, briefing_id, event, actor_principal_id, details, correlation_id)
      VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_briefing_id, 'briefing.omission_declared', p_composer, v_i, p_correlation);
    END LOOP;
    FOR v_i IN SELECT * FROM jsonb_array_elements(p_disputed) LOOP
      INSERT INTO executive.briefing_events (event_id, scope, tenant_id, domain_id, briefing_id, event, actor_principal_id, details, correlation_id)
      VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_briefing_id, 'briefing.disputed_item', p_composer, v_i, p_correlation);
    END LOOP;
  END IF;
  RETURN jsonb_build_object('briefing_id', p_briefing_id, 'content_digest', p_content_digest, 'schema_version', p_schema_version,
                            'omissions', CASE WHEN p_schema_version = 'v3' THEN jsonb_array_length(p_omissions) ELSE 0 END,
                            'suppressed', CASE WHEN p_schema_version = 'v3' THEN jsonb_array_length(p_suppressed) ELSE 0 END,
                            'disputed', CASE WHEN p_schema_version = 'v3' THEN jsonb_array_length(p_disputed) ELSE 0 END);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.compose_briefing(uuid,uuid,uuid,uuid,uuid,uuid,text,uuid,timestamptz,uuid,jsonb,jsonb,jsonb,jsonb,jsonb,boolean,text,jsonb,text,text,jsonb,uuid,uuid,jsonb,text,jsonb,jsonb,text,timestamptz,jsonb,jsonb,jsonb,int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.compose_briefing(uuid,uuid,uuid,uuid,uuid,uuid,text,uuid,timestamptz,uuid,jsonb,jsonb,jsonb,jsonb,jsonb,boolean,text,jsonb,text,text,jsonb,uuid,uuid,jsonb,text,jsonb,jsonb,text,timestamptz,jsonb,jsonb,jsonb,int) TO eye_commit;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §B.6 EXPIRY — the attention tick's step `briefing-expiry` (order 60)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
/* A v3 edition past its expires_at gains ONE briefing.expired event, written by the tick under the attention agent's principal (the bound
   action executive.attention.tick — the step runs inside the tick's write, 0086 §0's model); the read renders it expired. The row itself is
   immutable: the expiry is a fact of the ledger and the clock, never a rewrite. */
CREATE OR REPLACE FUNCTION executive.expire_briefings(p_tenant uuid, p_domain uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE b record; v_ids jsonb := '[]'::jsonb; v_now timestamptz := clock_timestamp();
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.attention.tick']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'briefing expiry rejected (actor): run by the acting principal' USING ERRCODE = '42501'; END IF;
  FOR b IN SELECT x.briefing_id, x.expires_at FROM executive.briefings x
            WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.schema_version = 'v3' AND x.expires_at <= v_now
              AND NOT EXISTS (SELECT 1 FROM executive.briefing_events e WHERE e.briefing_id = x.briefing_id AND e.event = 'briefing.expired')
            ORDER BY x.expires_at, x.briefing_id LIMIT 500 LOOP
    INSERT INTO executive.briefing_events (event_id, scope, tenant_id, domain_id, briefing_id, event, actor_principal_id, details, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, b.briefing_id, 'briefing.expired', p_actor, jsonb_build_object('expires_at', b.expires_at, 'found_at', v_now, 'by', 'tick:briefing-expiry'), p_correlation);
    v_ids := v_ids || to_jsonb(b.briefing_id::text);
  END LOOP;
  RETURN jsonb_build_object('expired', jsonb_array_length(v_ids), 'briefing_ids', v_ids, 'at', v_now);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.expire_briefings(uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.expire_briefings(uuid,uuid,uuid,uuid) TO eye_commit;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §B.7 RLS and grants (the 0081 loop idiom; the ports write)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['briefing_policies'] LOOP
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
