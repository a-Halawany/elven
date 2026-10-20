-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0123 §AP — CP-6 B40: ACQUISITION-TIME POLICY (F-P1-04: L1-I02, V03-T-072, V03-T-073, V03-T-266, ES-31-007, V04-T-019, DP-10-005).
-- Applies ALONE on 0001–0122 + 0123 §0 (folded into 0123 by the integrator after §RG, §VA, §IN, in the order §0, §RG, §VA, §IN, §AP, §CR).
--
-- WHAT AN SRC@v4 CONTRACT'S `acquisition_policy` NOW DOES, from current database state, before and during egress:
--   §AP.1 THE RESIDENCY DECLARATION of the local/dev profile — observation.ap_residency_regions(profile): the regions a deployment profile
--         admits at ingress. ONE profile is declared ('local-dev' admits EU — the jurisdiction every eye_demo contract declares); a profile
--         this function does not know admits NOTHING (a conflict, never a silent pass). The PLATFORM-wide residency / sovereignty policy is
--         B62's (F-P7D-06), not this row's.
--   §AP.2 THE ACQUISITION AUTHORIZATION — observation.acquisition_authorizations: one per run of an SRC@v4 contract, the record the run cites
--         (V03-T-266, 30.1): the contract version, the purpose, the rights in force (the contract's AND the rights terms' — D4's two sources),
--         the licence verdict (purposes ∈ the terms' purposes, prohibited uses, expiry), the credential REFERENCE (never a value — B11), the
--         rate, the residency verdict (contract vs the domain's profile), the collection window, the robots verdict per endpoint, the
--         backoff hold in force; the decision (proceed | refuse) and the refusal class (rights | licence | residency_refused | window_closed |
--         robots_disallowed | policy | unavailable). Append-only; one per run (UNIQUE run_id). A v1–v3 contract records none (D8: "not
--         recorded before SRC@v4").
--   §AP.3 THE ROBOTS CACHE — observation.acquisition_robots: robots.txt fetched through the SAME vetted client (or the replay set's recorded
--         answer), PER CONTRACT VERSION and origin, its parsed groups kept (never the raw text beyond its digest and length); an `unavailable`
--         fetch is recorded and never used as a cache entry (the next run fetches again). RFC 9309: a 4xx answer is "no robots file" (allowed),
--         a 5xx or a transport failure is unreachable — the run is refused `unavailable` (fail closed).
--   §AP.4 THE RATE-LIMITED INTERVALS AND THE CONTRACT'S BACKOFF — observation.acquisition_rate_limits: every rate-limited attempt — the
--         publisher's 429 (with its Retry-After: honoured, absent or unparsed), the contract's own bucket exhausted beyond the in-run wait, or
--         the source unavailable (a transport failure / an execution fault of a v4 contract, recorded by the scheduler) — with the attempt
--         number (consecutive since the source's last FINISHED run), the contract schedule's delay, the delay applied (never sooner than the
--         publisher asked, never longer than the contract's bound), the HOLD [interval_from, interval_to) during which collection of the
--         source is refused before egress, and whether an automatic retry is planned (the contract's max_attempts) — the coverage gap made
--         explicit instead of silent (DP-10-005). Append-only; RESOLVED is derived at read time (a later finished run of the source), so no
--         row is ever rewritten.
--   §AP.5 THE RESPONSE FINGERPRINTS — observation.acquisition_response_fingerprints: per poll key, the media type, the root shape and the size
--         of each response that passed §AP's ingress check (never content — D9); a response whose identity or shape departs from the last one
--         is an ANOMALY (`response_anomaly`, DP-10-005's manipulation / duplicate detection) and is quarantined by the ingress composition.
--   §AP.6 THE PORTS. The run's own machinery writes these records — the authorize and throttle stages inside a run, the collection worker
--         after one — under the BOUNDED MACHINE CAPABILITY the scheduler already holds (observation.issue_schedule_capability, mode schedule,
--         class scheduler — the 0038/0039 idiom the B1/B6/B7 consumers reuse), every in-run write FENCED BY THE RUN'S LEASE
--         (observation.assert_run_holds_source, 0056): only the run that holds the source may record its authorization, its robots fetch, its
--         rate limit or a fingerprint. No human act is added (§AP has no consequential command); the attribution of a run's record is the run's
--         own agent principal (collection_runs_current), never a client-supplied one.
--   §AP.7 THE READ — observation.acquisition_policy_read(tenant, domain, source): the declaration per contract version (or "not declared before
--         SRC@v4"), the authorizations, the robots cache, the rate-limited intervals with their derived resolution, the stream form's explicit
--         incomplete ranges of the source (every class; rate_limited among them) — the acquisition page and the coverage panel. Bound to the
--         exact action observation.acquisition.read (pdp.service.ts, /* B40 ap */) and the caller's read scope. METADATA ONLY (D9): no evidence
--         content, no credential value, no robots text.
--
-- NOT HERE (stated): no CHECK widened (the incomplete-range classes and the quarantine classes are §0's); no role (D14); no header field (D11);
-- no change to the command form's or the stream form's ports (a stream run's rate-limited segment is declared through 0084's own
-- declare path with §0's widened class); the lifecycle's call sites are the prelude's.
-- THREE CLAIMS: CONSTRUCTION (this file, the stages and phase6-acquisition-policy-b40); DEMONSTRATED OPERATION (the act, SYNTHETIC — the
-- port-authority replay set with its planted 429 + Retry-After, DESIGN D10); REAL ACCEPTANCE — never claimed (a synthetic or loopback
-- publisher demonstrates the software, never a real publisher's throttling).
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- §AP.1 THE RESIDENCY DECLARATION ─────────────────────────────────────────────────────────────────────────────────────────────────────────
/* The regions a deployment residency profile admits at ingress. Declared, not inferred: an unknown profile admits nothing. */
CREATE OR REPLACE FUNCTION observation.ap_residency_regions(p_profile text) RETURNS text[]
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT CASE p_profile
           -- the local/dev profile (every tenant and domain of the demonstration): EU-resident data only — the jurisdiction every
           -- registered contract declares. B62 (F-P7D-06) owns the platform-wide residency and sovereignty policy.
           WHEN 'local-dev' THEN ARRAY['EU']::text[]
           ELSE NULL END
$$;
REVOKE ALL ON FUNCTION observation.ap_residency_regions(text) FROM PUBLIC;
COMMENT ON FUNCTION observation.ap_residency_regions(text) IS 'B40 §AP (V03-T-072): the regions a deployment residency profile admits at ingress — local-dev admits EU; an undeclared profile admits nothing (NULL). Internal (no runtime grant).';

-- §AP.2 THE ACQUISITION AUTHORIZATIONS ────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE observation.acquisition_authorizations (
  authorization_id    uuid PRIMARY KEY,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  source_id           uuid NOT NULL,
  contract_version    int  NOT NULL CHECK (contract_version >= 1),
  run_id              uuid NOT NULL UNIQUE,
  form                text NOT NULL CHECK (form IN ('command', 'stream')),
  purpose_id          text NOT NULL CHECK (length(purpose_id) BETWEEN 1 AND 200),
  decision            text NOT NULL CHECK (decision IN ('proceed', 'refuse')),
  refusal_class       text CHECK (refusal_class IS NULL OR refusal_class IN (
                        'rights', 'licence', 'residency_refused', 'window_closed', 'robots_disallowed', 'policy', 'unavailable')),
  reason              text NOT NULL CHECK (length(reason) BETWEEN 1 AND 1000),
  rights              jsonb NOT NULL CHECK (jsonb_typeof(rights) = 'object'),
  licence             jsonb NOT NULL CHECK (jsonb_typeof(licence) = 'object'),
  -- B11: the credential REFERENCE the contract names (or NULL: none) — never a value
  credential_ref      text CHECK (credential_ref IS NULL OR length(credential_ref) BETWEEN 1 AND 200),
  rate                jsonb NOT NULL CHECK (jsonb_typeof(rate) = 'object'),
  residency           jsonb NOT NULL CHECK (jsonb_typeof(residency) = 'object'),
  collection_window   jsonb NOT NULL CHECK (jsonb_typeof(collection_window) = 'object'),
  robots              jsonb NOT NULL CHECK (jsonb_typeof(robots) = 'object'),
  backoff             jsonb NOT NULL CHECK (jsonb_typeof(backoff) = 'object'),
  -- the run's own agent principal (collection_runs_current), never a client-supplied actor
  agent_principal_id  uuid NOT NULL,
  decided_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id      uuid NOT NULL,
  CONSTRAINT aqa_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT aqa_refusal CHECK ((decision = 'refuse') = (refusal_class IS NOT NULL))
);
CREATE INDEX aqa_source ON observation.acquisition_authorizations (tenant_id, domain_id, source_id, decided_at DESC);
CREATE TRIGGER aqa_append_only BEFORE UPDATE OR DELETE ON observation.acquisition_authorizations FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE observation.acquisition_authorizations IS 'B40 §AP (V03-T-266 30.1, L1-I02, ES-31-007): the acquisition authorization of one run of an SRC@v4 contract — contract version, purpose, rights (contract + terms), licence, credential reference, rate, residency, window, robots, backoff hold — and its decision; the record the run cites. Append-only, one per run.';

-- §AP.3 THE ROBOTS CACHE ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE observation.acquisition_robots (
  robots_id           uuid PRIMARY KEY,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  source_id           uuid NOT NULL,
  contract_version    int  NOT NULL CHECK (contract_version >= 1),
  -- scheme://host[:port] — robots.txt is per origin
  origin              text NOT NULL CHECK (origin ~ '^https?://[^/?#]+$' AND length(origin) <= 300),
  outcome             text NOT NULL CHECK (outcome IN ('fetched', 'no_robots_file', 'unavailable')),
  http_status         int CHECK (http_status IS NULL OR http_status BETWEEN 100 AND 599),
  content_digest      text CHECK (content_digest IS NULL OR content_digest ~ '^[0-9a-f]{64}$'),
  byte_length         int CHECK (byte_length IS NULL OR byte_length >= 0),
  -- the parsed groups: [{ agents: [..], rules: [{ allow, path }] }] — never the raw text
  rules               jsonb NOT NULL CHECK (jsonb_typeof(rules) = 'array'),
  via                 text NOT NULL CHECK (via IN ('replay', 'live')),
  detail              text NOT NULL CHECK (length(detail) BETWEEN 1 AND 500),
  run_id              uuid NOT NULL,
  fetched_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id      uuid NOT NULL,
  CONSTRAINT aqr_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT aqr_fetched_bound CHECK ((outcome = 'fetched') = (content_digest IS NOT NULL))
);
CREATE INDEX aqr_cache ON observation.acquisition_robots (source_id, contract_version, origin, fetched_at DESC);
CREATE TRIGGER aqr_append_only BEFORE UPDATE OR DELETE ON observation.acquisition_robots FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE observation.acquisition_robots IS 'B40 §AP (V03-T-073): robots.txt fetched through the vetted client (or the replay set), cached PER CONTRACT VERSION and origin as parsed groups (digest and length, never the text); an unavailable fetch is recorded and never served as a cache entry. Append-only.';

-- §AP.4 THE RATE-LIMITED INTERVALS ────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE observation.acquisition_rate_limits (
  rate_limit_id          uuid PRIMARY KEY,
  scope                  text NOT NULL,
  tenant_id              uuid NOT NULL,
  domain_id              uuid NOT NULL,
  source_id              uuid NOT NULL,
  contract_version       int  NOT NULL CHECK (contract_version >= 1),
  -- the run that met it (NULL only for an execution fault before any run was opened)
  run_id                 uuid,
  origin                 text NOT NULL CHECK (origin IN ('publisher_429', 'contract_rate', 'unavailable')),
  -- the request's URL, redacted (no userinfo, no query values) — NULL for an unavailable source
  endpoint               text CHECK (endpoint IS NULL OR length(endpoint) <= 500),
  http_status            int CHECK (http_status IS NULL OR http_status BETWEEN 100 AND 599),
  retry_after_raw        text CHECK (retry_after_raw IS NULL OR length(retry_after_raw) <= 64),
  retry_after_seconds    int CHECK (retry_after_seconds IS NULL OR retry_after_seconds >= 0),
  -- honoured: the publisher's Retry-After set (or lengthened) the hold · absent: none given · unparsed: given and unreadable (the schedule
  -- applies, never sooner) · not_honoured: the contract declares honour_retry_after false · own_bucket: the contract's own rate
  retry_after_state      text NOT NULL CHECK (retry_after_state IN ('honoured', 'absent', 'unparsed', 'not_honoured', 'own_bucket')),
  attempt                int NOT NULL CHECK (attempt >= 1),
  max_attempts           int NOT NULL CHECK (max_attempts BETWEEN 1 AND 21),
  schedule_delay_seconds int NOT NULL CHECK (schedule_delay_seconds BETWEEN 1 AND 86400),
  applied_delay_seconds  int NOT NULL CHECK (applied_delay_seconds BETWEEN 1 AND 86400),
  interval_from          timestamptz NOT NULL,
  interval_to            timestamptz NOT NULL,
  exhausted              boolean NOT NULL,
  retry_planned          boolean NOT NULL,
  detail                 text NOT NULL CHECK (length(detail) BETWEEN 1 AND 1000),
  declared_at            timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id         uuid NOT NULL,
  CONSTRAINT aqrl_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT aqrl_interval CHECK (interval_to > interval_from),
  CONSTRAINT aqrl_never_sooner CHECK (applied_delay_seconds >= schedule_delay_seconds
                                      AND (retry_after_state <> 'honoured' OR retry_after_seconds IS NULL OR applied_delay_seconds >= least(retry_after_seconds, 86400))),
  CONSTRAINT aqrl_planned CHECK (NOT (exhausted AND retry_planned)),
  CONSTRAINT aqrl_run_bound CHECK (run_id IS NOT NULL OR origin = 'unavailable')
);
CREATE INDEX aqrl_source ON observation.acquisition_rate_limits (source_id, contract_version, declared_at DESC);
CREATE INDEX aqrl_run ON observation.acquisition_rate_limits (run_id) WHERE run_id IS NOT NULL;
CREATE TRIGGER aqrl_append_only BEFORE UPDATE OR DELETE ON observation.acquisition_rate_limits FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE observation.acquisition_rate_limits IS 'B40 §AP (DP-10-005, V03-T-073): every rate-limited or unavailable attempt of an SRC@v4 source — the publisher''s 429 and Retry-After, the contract''s own bucket, the source unavailable — with the contract''s backoff (attempt, schedule delay, applied delay, never sooner than asked, bounded), the HOLD interval and whether a retry is planned. The coverage gap made explicit. Append-only; resolution is derived at read time.';

-- §AP.5 THE RESPONSE FINGERPRINTS ─────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE observation.acquisition_response_fingerprints (
  fingerprint_id      uuid PRIMARY KEY,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  source_id           uuid NOT NULL,
  contract_version    int  NOT NULL CHECK (contract_version >= 1),
  run_id              uuid NOT NULL,
  poll_key            text NOT NULL CHECK (length(poll_key) BETWEEN 1 AND 500),
  media_type          text CHECK (media_type IS NULL OR length(media_type) <= 120),
  -- json-object | json-array | json-scalar | xml | text | binary
  root_type           text NOT NULL CHECK (root_type IN ('json-object', 'json-array', 'json-scalar', 'xml', 'text', 'binary')),
  keys_digest         text CHECK (keys_digest IS NULL OR keys_digest ~ '^[0-9a-f]{64}$'),
  key_count           int CHECK (key_count IS NULL OR key_count >= 0),
  byte_length         int NOT NULL CHECK (byte_length >= 0),
  content_digest      text NOT NULL CHECK (content_digest ~ '^[0-9a-f]{64}$'),
  verdict             text NOT NULL CHECK (verdict IN ('baseline', 'consistent', 'anomaly')),
  anomaly             jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(anomaly) = 'array'),
  observed_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id      uuid NOT NULL,
  CONSTRAINT aqrf_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT aqrf_anomaly CHECK ((verdict = 'anomaly') = (jsonb_array_length(anomaly) > 0))
);
CREATE INDEX aqrf_poll ON observation.acquisition_response_fingerprints (source_id, poll_key, observed_at DESC);
CREATE TRIGGER aqrf_append_only BEFORE UPDATE OR DELETE ON observation.acquisition_response_fingerprints FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE observation.acquisition_response_fingerprints IS 'B40 §AP (DP-10-005): the identity and shape of each response of an SRC@v4 source per poll key (media type, root type, top-level key set digest, size, content digest — never content); an anomaly against the last consistent one is quarantined (response_anomaly). Append-only.';

REVOKE ALL ON observation.acquisition_authorizations, observation.acquisition_robots, observation.acquisition_rate_limits,
              observation.acquisition_response_fingerprints FROM PUBLIC;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['acquisition_authorizations', 'acquisition_robots', 'acquisition_rate_limits', 'acquisition_response_fingerprints'] LOOP
    EXECUTE format('ALTER TABLE observation.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE observation.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY ap_isolation ON observation.%I
        USING (
          tenant_id = public.eye_tenant()
          AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain())
        )$f$, t);
    EXECUTE format('GRANT SELECT ON observation.%I TO eye_app, eye_commit', t);
  END LOOP;
END $$;

-- §AP.6 THE PORTS ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* Internal: the run named is a run of this source and contract version in this scope (its projection row), and — for an in-run write — it
   holds the source's lease right now (0056). Answers the run's agent principal. */
CREATE OR REPLACE FUNCTION observation._ap_run(p_tenant uuid, p_domain uuid, p_source uuid, p_version int, p_run uuid, p_effect text, p_fenced boolean)
RETURNS uuid
SECURITY DEFINER SET search_path = observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_agent uuid;
BEGIN
  SELECT r.agent_principal_id INTO v_agent FROM observation.collection_runs_current r
   WHERE r.run_id = p_run AND r.source_id = p_source AND r.contract_version = p_version AND r.tenant_id = p_tenant AND r.domain_id = p_domain;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'acquisition policy rejected (unknown_run): run % is not a run of source % contract version % in this domain', p_run, p_source, p_version
      USING ERRCODE = '23503';
  END IF;
  IF p_fenced THEN PERFORM observation.assert_run_holds_source(p_source, p_run, p_effect); END IF;
  RETURN v_agent;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION observation._ap_run(uuid, uuid, uuid, int, uuid, text, boolean) FROM PUBLIC;

/* Internal: the consecutive rate-limited / unavailable attempts of a source's contract version since its last FINISHED run (any version). */
CREATE OR REPLACE FUNCTION observation._ap_consecutive(p_source uuid, p_version int) RETURNS int
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = observation, pg_catalog, pg_temp AS $$
  SELECT count(*)::int FROM observation.acquisition_rate_limits l
   WHERE l.source_id = p_source AND l.contract_version = p_version
     AND l.declared_at > coalesce((SELECT max(r.finished_at) FROM observation.collection_runs_current r
                                    WHERE r.source_id = p_source AND r.state = 'finished'), '-infinity'::timestamptz)
$$;
REVOKE ALL ON FUNCTION observation._ap_consecutive(uuid, int) FROM PUBLIC;

/* Internal: the hold in force for a source's contract version (the latest rate-limited interval still open, not resolved by a later finished run). */
CREATE OR REPLACE FUNCTION observation._ap_hold(p_source uuid, p_version int, p_at timestamptz) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = observation, pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object('rate_limit_id', l.rate_limit_id, 'origin', l.origin, 'attempt', l.attempt, 'max_attempts', l.max_attempts,
           'interval_from', l.interval_from, 'until', l.interval_to, 'applied_delay_seconds', l.applied_delay_seconds,
           'retry_after_seconds', l.retry_after_seconds, 'retry_after_state', l.retry_after_state, 'exhausted', l.exhausted, 'retry_planned', l.retry_planned)
    FROM observation.acquisition_rate_limits l
   WHERE l.source_id = p_source AND l.contract_version = p_version AND l.interval_to > p_at
     AND l.declared_at > coalesce((SELECT max(r.finished_at) FROM observation.collection_runs_current r
                                    WHERE r.source_id = p_source AND r.state = 'finished'), '-infinity'::timestamptz)
   ORDER BY l.interval_to DESC LIMIT 1
$$;
REVOKE ALL ON FUNCTION observation._ap_hold(uuid, int, timestamptz) FROM PUBLIC;

/* The facts the AUTHORIZE stage decides from, read from CURRENT state inside the run (fenced by its lease): the contract version (rights,
   lifecycle, mode, residency, purposes, effective period, the credential REFERENCE, the v4 acquisition policy), the rights terms in force
   (0121's rt_current — D4's second source), the domain's residency profile and the regions it admits, the robots cache of this contract
   version, the backoff hold in force and the instant. */
CREATE OR REPLACE FUNCTION observation.ap_run_inputs(p_tenant uuid, p_domain uuid, p_source uuid, p_version int, p_run uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = observation, ctx, tenancy, graph, public, pg_catalog, pg_temp AS $$
DECLARE c observation.source_contracts_current; t observation.rights_terms; v_at timestamptz := clock_timestamp(); v_profile text; v_profile_of text;
BEGIN
  PERFORM ctx.assert_capability('schedule', 'scheduler', 'observation.schedule.reconcile');
  PERFORM observation._ap_run(p_tenant, p_domain, p_source, p_version, p_run, 'acquisition authorization', true);
  SELECT * INTO c FROM observation.source_contracts_current x
   WHERE x.source_id = p_source AND x.contract_version = p_version AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  t := observation.rt_current(p_tenant, p_domain, p_source, p_version);
  SELECT d.residency_profile INTO v_profile FROM tenancy.domains d WHERE d.id = p_domain AND d.tenant_id = p_tenant;
  v_profile_of := 'domain';
  IF v_profile IS NULL THEN
    SELECT tt.residency_profile INTO v_profile FROM tenancy.tenants tt WHERE tt.id = p_tenant;
    v_profile_of := 'tenant';
  END IF;
  RETURN jsonb_build_object(
    'at', v_at,
    'contract', jsonb_build_object('contract_version', c.contract_version, 'lifecycle_state', c.lifecycle_state, 'rights_state', c.rights_state,
      'acquisition_mode', c.acquisition_mode, 'residency', c.residency, 'classification_ceiling', c.classification_ceiling, 'purposes', c.purposes,
      'effective_to', c.effective_to, 'connector_kind', c.connector_kind,
      'credential_ref', c.contract #>> '{security_and_operations,credential_ref}',
      'licence', c.contract #>> '{authority_and_rights,licence}',
      'acquisition_policy', c.contract -> 'acquisition_policy'),
    'terms', CASE WHEN t.terms_id IS NULL THEN NULL ELSE jsonb_build_object(
      'terms_id', t.terms_id, 'version', t.version, 'state', observation.rt_state(t, v_at), 'recorded_state', t.state, 'expires_at', t.expires_at,
      'purposes', t.purposes, 'prohibited_uses', t.prohibited_uses) END,
    'residency', jsonb_build_object('profile', v_profile, 'profile_of', v_profile_of,
      'regions', to_jsonb(observation.ap_residency_regions(v_profile))),
    'robots', (SELECT coalesce(jsonb_agg(jsonb_build_object('origin', x.origin, 'outcome', x.outcome, 'rules', x.rules, 'robots_id', x.robots_id,
                                   'fetched_at', x.fetched_at, 'http_status', x.http_status) ORDER BY x.origin), '[]'::jsonb)
                 FROM (SELECT DISTINCT ON (r.origin) r.* FROM observation.acquisition_robots r
                        WHERE r.source_id = p_source AND r.contract_version = p_version AND r.tenant_id = p_tenant AND r.domain_id = p_domain
                          AND r.outcome IN ('fetched', 'no_robots_file')
                        ORDER BY r.origin, r.fetched_at DESC) x),
    'hold', observation._ap_hold(p_source, p_version, v_at),
    'consecutive', observation._ap_consecutive(p_source, p_version));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION observation.ap_run_inputs(uuid, uuid, uuid, int, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.ap_run_inputs(uuid, uuid, uuid, int, uuid) TO eye_commit;

/* The run's acquisition authorization — once per run (a second is refused: the run cites ONE). The record's verdict blocks are the stage's;
   the port binds the scope, the run, its lease and its agent, and the decision's shape. */
CREATE OR REPLACE FUNCTION observation.record_acquisition_authorization(
  p_id uuid, p_tenant uuid, p_domain uuid, p_source uuid, p_version int, p_run uuid, p_form text, p_purpose text,
  p_decision text, p_refusal_class text, p_reason text, p_record jsonb, p_correlation uuid
) RETURNS uuid
SECURITY DEFINER SET search_path = observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_agent uuid;
BEGIN
  PERFORM ctx.assert_capability('schedule', 'scheduler', 'observation.schedule.reconcile');
  v_agent := observation._ap_run(p_tenant, p_domain, p_source, p_version, p_run, 'acquisition authorization', true);
  IF p_record IS NULL OR jsonb_typeof(p_record) <> 'object' THEN
    RAISE EXCEPTION 'acquisition authorization rejected (record): the authorization names its verdicts as an object' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM observation.acquisition_authorizations a WHERE a.run_id = p_run) THEN
    RAISE EXCEPTION 'acquisition authorization rejected (duplicate): run % already cites its authorization', p_run USING ERRCODE = '23505';
  END IF;
  INSERT INTO observation.acquisition_authorizations (
    authorization_id, scope, tenant_id, domain_id, source_id, contract_version, run_id, form, purpose_id, decision, refusal_class, reason,
    rights, licence, credential_ref, rate, residency, collection_window, robots, backoff, agent_principal_id, correlation_id
  ) VALUES (
    p_id, 'DOMAIN', p_tenant, p_domain, p_source, p_version, p_run, p_form, p_purpose, p_decision, p_refusal_class, left(p_reason, 1000),
    coalesce(p_record -> 'rights', '{}'::jsonb), coalesce(p_record -> 'licence', '{}'::jsonb), p_record ->> 'credential_ref',
    coalesce(p_record -> 'rate', '{}'::jsonb), coalesce(p_record -> 'residency', '{}'::jsonb), coalesce(p_record -> 'window', '{}'::jsonb),
    coalesce(p_record -> 'robots', '{}'::jsonb), coalesce(p_record -> 'backoff', '{}'::jsonb), v_agent, p_correlation);
  RETURN p_id;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION observation.record_acquisition_authorization(uuid, uuid, uuid, uuid, int, uuid, text, text, text, text, text, jsonb, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.record_acquisition_authorization(uuid, uuid, uuid, uuid, int, uuid, text, text, text, text, text, jsonb, uuid) TO eye_commit;

/* One robots.txt fetch (or its failure) for an origin of this contract version, by the run that holds the source. */
CREATE OR REPLACE FUNCTION observation.record_robots_fetch(
  p_id uuid, p_tenant uuid, p_domain uuid, p_source uuid, p_version int, p_run uuid, p_origin text, p_outcome text, p_status int,
  p_digest text, p_bytes int, p_rules jsonb, p_via text, p_detail text, p_correlation uuid
) RETURNS uuid
SECURITY DEFINER SET search_path = observation, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM ctx.assert_capability('schedule', 'scheduler', 'observation.schedule.reconcile');
  PERFORM observation._ap_run(p_tenant, p_domain, p_source, p_version, p_run, 'robots fetch', true);
  INSERT INTO observation.acquisition_robots (
    robots_id, scope, tenant_id, domain_id, source_id, contract_version, origin, outcome, http_status, content_digest, byte_length, rules, via,
    detail, run_id, correlation_id
  ) VALUES (p_id, 'DOMAIN', p_tenant, p_domain, p_source, p_version, p_origin, p_outcome, p_status, p_digest, p_bytes, coalesce(p_rules, '[]'::jsonb),
            p_via, left(p_detail, 500), p_run, p_correlation);
  RETURN p_id;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION observation.record_robots_fetch(uuid, uuid, uuid, uuid, int, uuid, text, text, int, text, int, jsonb, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.record_robots_fetch(uuid, uuid, uuid, uuid, int, uuid, text, text, int, text, int, jsonb, text, text, uuid) TO eye_commit;

/* ES-31-007: the rights RE-CHECKED BEFORE EVERY REQUEST, from current state — the contract version (lifecycle, rights, effective period) and
   the rights terms in force (withdrawn → rights; expired → licence). Answers { ok, class, reason }; refuses nothing itself. */
CREATE OR REPLACE FUNCTION observation.ap_rights_now(p_tenant uuid, p_domain uuid, p_source uuid, p_version int, p_run uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE c observation.source_contracts_current; t observation.rights_terms; v_at timestamptz := clock_timestamp(); v_state text;
BEGIN
  PERFORM ctx.assert_capability('schedule', 'scheduler', 'observation.schedule.reconcile');
  PERFORM observation._ap_run(p_tenant, p_domain, p_source, p_version, p_run, 'request', true);
  SELECT * INTO c FROM observation.source_contracts_current x
   WHERE x.source_id = p_source AND x.contract_version = p_version AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF c.lifecycle_state <> 'active' THEN
    RETURN jsonb_build_object('ok', false, 'class', 'policy', 'reason', format('the contract version is %s, not active, at this request', c.lifecycle_state), 'at', v_at);
  END IF;
  IF c.rights_state = 'withdrawn' OR (c.rights_state <> 'confirmed' AND c.acquisition_mode = 'live') THEN
    RETURN jsonb_build_object('ok', false, 'class', 'rights', 'reason', format('the contract''s rights are %s at this request', c.rights_state), 'at', v_at);
  END IF;
  IF c.effective_to IS NOT NULL AND c.effective_to <= v_at THEN
    RETURN jsonb_build_object('ok', false, 'class', 'licence', 'reason', 'the contract''s effective period ended before this request', 'at', v_at);
  END IF;
  t := observation.rt_current(p_tenant, p_domain, p_source, p_version);
  v_state := observation.rt_state(t, v_at);
  IF v_state = 'withdrawn' THEN
    RETURN jsonb_build_object('ok', false, 'class', 'rights', 'reason', format('the rights terms (v%s) are withdrawn at this request', t.version), 'at', v_at);
  END IF;
  IF v_state = 'expired' THEN
    RETURN jsonb_build_object('ok', false, 'class', 'licence', 'reason', format('the rights terms (v%s) expired at %s', t.version, t.expires_at), 'at', v_at);
  END IF;
  RETURN jsonb_build_object('ok', true, 'class', NULL, 'reason', CASE WHEN t.terms_id IS NULL THEN 'contract rights confirmed; no rights terms declared'
                                                                      ELSE format('contract rights %s; rights terms v%s in force', c.rights_state, t.version) END, 'at', v_at);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION observation.ap_rights_now(uuid, uuid, uuid, int, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.ap_rights_now(uuid, uuid, uuid, int, uuid) TO eye_commit;

/* The attempt number the NEXT rate-limited record of this source's contract version would carry (consecutive since its last finished run). */
CREATE OR REPLACE FUNCTION observation.ap_next_attempt(p_tenant uuid, p_domain uuid, p_source uuid, p_version int) RETURNS int
SECURITY DEFINER SET search_path = observation, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM ctx.assert_capability('schedule', 'scheduler', 'observation.schedule.reconcile');
  IF NOT EXISTS (SELECT 1 FROM observation.source_contracts_current x WHERE x.source_id = p_source AND x.contract_version = p_version
                   AND x.tenant_id = p_tenant AND x.domain_id = p_domain) THEN
    RAISE EXCEPTION 'acquisition policy rejected (unknown_source): source % contract version % is not recorded in this domain', p_source, p_version USING ERRCODE = '23503';
  END IF;
  RETURN observation._ap_consecutive(p_source, p_version) + 1;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION observation.ap_next_attempt(uuid, uuid, uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.ap_next_attempt(uuid, uuid, uuid, int) TO eye_commit;

/* One rate-limited (or unavailable) attempt and its hold. In-run origins (publisher_429, contract_rate) are written by the run that holds
   the source; `unavailable` is written by the scheduler after the run ended (or faulted). The attempt number must be the next one (stale
   otherwise: another record landed between the read and this write); the delays are the stage's arithmetic, bounded here. */
CREATE OR REPLACE FUNCTION observation.record_rate_limit(
  p_id uuid, p_tenant uuid, p_domain uuid, p_source uuid, p_version int, p_run uuid, p_origin text, p_endpoint text, p_status int,
  p_retry_after_raw text, p_retry_after_seconds int, p_retry_after_state text, p_attempt int, p_max_attempts int,
  p_schedule_delay int, p_applied_delay int, p_from timestamptz, p_exhausted boolean, p_retry_planned boolean, p_detail text, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_expected int; v_from timestamptz := coalesce(p_from, clock_timestamp());
BEGIN
  PERFORM ctx.assert_capability('schedule', 'scheduler', 'observation.schedule.reconcile');
  IF p_origin IN ('publisher_429', 'contract_rate') THEN
    PERFORM observation._ap_run(p_tenant, p_domain, p_source, p_version, p_run, 'rate limit record', true);
  ELSIF p_origin = 'unavailable' THEN
    IF p_run IS NOT NULL THEN PERFORM observation._ap_run(p_tenant, p_domain, p_source, p_version, p_run, 'rate limit record', false); END IF;
    IF NOT EXISTS (SELECT 1 FROM observation.source_contracts_current x WHERE x.source_id = p_source AND x.contract_version = p_version
                     AND x.tenant_id = p_tenant AND x.domain_id = p_domain) THEN
      RAISE EXCEPTION 'acquisition policy rejected (unknown_source): source % contract version % is not recorded in this domain', p_source, p_version USING ERRCODE = '23503';
    END IF;
  ELSE
    RAISE EXCEPTION 'acquisition policy rejected (origin): % is not a rate-limit origin (publisher_429 | contract_rate | unavailable)', coalesce(p_origin, '<none>') USING ERRCODE = '22023';
  END IF;
  -- one source, one run at a time (0051): the attempt count is read and written under the source's lease row's order
  PERFORM 1 FROM observation.source_run_leases WHERE source_id = p_source FOR UPDATE;
  v_expected := observation._ap_consecutive(p_source, p_version) + 1;
  IF p_attempt IS DISTINCT FROM v_expected THEN
    RAISE EXCEPTION 'acquisition policy rejected (stale): attempt % was computed; the next attempt of this source is %', p_attempt, v_expected USING ERRCODE = '40001';
  END IF;
  INSERT INTO observation.acquisition_rate_limits (
    rate_limit_id, scope, tenant_id, domain_id, source_id, contract_version, run_id, origin, endpoint, http_status, retry_after_raw,
    retry_after_seconds, retry_after_state, attempt, max_attempts, schedule_delay_seconds, applied_delay_seconds, interval_from, interval_to,
    exhausted, retry_planned, detail, correlation_id
  ) VALUES (
    p_id, 'DOMAIN', p_tenant, p_domain, p_source, p_version, p_run, p_origin, left(p_endpoint, 500), p_status, left(p_retry_after_raw, 64),
    p_retry_after_seconds, p_retry_after_state, p_attempt, p_max_attempts, p_schedule_delay, p_applied_delay, v_from,
    v_from + make_interval(secs => p_applied_delay), p_exhausted, p_retry_planned, left(p_detail, 1000), p_correlation);
  RETURN jsonb_build_object('rate_limit_id', p_id, 'attempt', p_attempt, 'interval_from', v_from, 'until', v_from + make_interval(secs => p_applied_delay),
                            'exhausted', p_exhausted, 'retry_planned', p_retry_planned);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION observation.record_rate_limit(uuid, uuid, uuid, uuid, int, uuid, text, text, int, text, int, text, int, int, int, int, timestamptz, boolean, boolean, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.record_rate_limit(uuid, uuid, uuid, uuid, int, uuid, text, text, int, text, int, text, int, int, int, int, timestamptz, boolean, boolean, text, uuid) TO eye_commit;

/* The scheduler's question after a run (or a fault): is the contract v4, what is its backoff, how did the run end, and did the run record a
   rate-limited attempt? Technical facts only (no evidence, no contract body beyond the backoff). */
CREATE OR REPLACE FUNCTION observation.ap_after_run(p_tenant uuid, p_domain uuid, p_source uuid, p_version int, p_run uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE c observation.source_contracts_current; r observation.collection_runs_current; l observation.acquisition_rate_limits;
BEGIN
  PERFORM ctx.assert_capability('schedule', 'scheduler', 'observation.schedule.reconcile');
  SELECT * INTO c FROM observation.source_contracts_current x
   WHERE x.source_id = p_source AND x.contract_version = p_version AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'acquisition policy rejected (unknown_source): source % contract version % is not recorded in this domain', p_source, p_version USING ERRCODE = '23503';
  END IF;
  IF p_run IS NOT NULL THEN
    SELECT * INTO r FROM observation.collection_runs_current x WHERE x.run_id = p_run AND x.source_id = p_source;
    SELECT * INTO l FROM observation.acquisition_rate_limits x WHERE x.run_id = p_run ORDER BY x.declared_at DESC LIMIT 1;
  END IF;
  RETURN jsonb_build_object(
    'v4', c.contract ? 'acquisition_policy',
    'lifecycle_state', c.lifecycle_state,
    'backoff', c.contract #> '{acquisition_policy,backoff}',
    'run', CASE WHEN r.run_id IS NULL THEN NULL ELSE jsonb_build_object('state', r.state, 'failure_reason', r.failure_reason, 'finished_at', r.finished_at) END,
    'rate_limit', CASE WHEN l.rate_limit_id IS NULL THEN NULL ELSE jsonb_build_object('rate_limit_id', l.rate_limit_id, 'origin', l.origin, 'attempt', l.attempt,
       'until', l.interval_to, 'applied_delay_seconds', l.applied_delay_seconds, 'exhausted', l.exhausted, 'retry_planned', l.retry_planned) END,
    'next_attempt', observation._ap_consecutive(p_source, p_version) + 1,
    'hold', observation._ap_hold(p_source, p_version, clock_timestamp()));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION observation.ap_after_run(uuid, uuid, uuid, int, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.ap_after_run(uuid, uuid, uuid, int, uuid) TO eye_commit;

/* The last CONSISTENT (or baseline) fingerprint of a poll key — what the next response is compared with. */
CREATE OR REPLACE FUNCTION observation.ap_last_fingerprint(p_tenant uuid, p_domain uuid, p_source uuid, p_version int, p_run uuid, p_poll_key text) RETURNS jsonb
SECURITY DEFINER SET search_path = observation, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM ctx.assert_capability('schedule', 'scheduler', 'observation.schedule.reconcile');
  PERFORM observation._ap_run(p_tenant, p_domain, p_source, p_version, p_run, 'response check', true);
  RETURN (SELECT jsonb_build_object('fingerprint_id', f.fingerprint_id, 'media_type', f.media_type, 'root_type', f.root_type, 'keys_digest', f.keys_digest,
                   'key_count', f.key_count, 'byte_length', f.byte_length, 'content_digest', f.content_digest, 'observed_at', f.observed_at)
            FROM observation.acquisition_response_fingerprints f
           WHERE f.source_id = p_source AND f.tenant_id = p_tenant AND f.domain_id = p_domain AND f.poll_key = p_poll_key AND f.verdict <> 'anomaly'
           ORDER BY f.observed_at DESC LIMIT 1);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION observation.ap_last_fingerprint(uuid, uuid, uuid, int, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.ap_last_fingerprint(uuid, uuid, uuid, int, uuid, text) TO eye_commit;

CREATE OR REPLACE FUNCTION observation.record_response_fingerprint(
  p_id uuid, p_tenant uuid, p_domain uuid, p_source uuid, p_version int, p_run uuid, p_poll_key text, p_media_type text, p_root_type text,
  p_keys_digest text, p_key_count int, p_bytes int, p_digest text, p_verdict text, p_anomaly jsonb, p_correlation uuid
) RETURNS uuid
SECURITY DEFINER SET search_path = observation, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM ctx.assert_capability('schedule', 'scheduler', 'observation.schedule.reconcile');
  PERFORM observation._ap_run(p_tenant, p_domain, p_source, p_version, p_run, 'response check', true);
  INSERT INTO observation.acquisition_response_fingerprints (
    fingerprint_id, scope, tenant_id, domain_id, source_id, contract_version, run_id, poll_key, media_type, root_type, keys_digest, key_count,
    byte_length, content_digest, verdict, anomaly, correlation_id
  ) VALUES (p_id, 'DOMAIN', p_tenant, p_domain, p_source, p_version, p_run, left(p_poll_key, 500), left(p_media_type, 120), p_root_type, p_keys_digest,
            p_key_count, p_bytes, p_digest, p_verdict, coalesce(p_anomaly, '[]'::jsonb), p_correlation);
  RETURN p_id;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION observation.record_response_fingerprint(uuid, uuid, uuid, uuid, int, uuid, text, text, text, text, int, int, text, text, jsonb, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.record_response_fingerprint(uuid, uuid, uuid, uuid, int, uuid, text, text, text, text, int, int, text, text, jsonb, uuid) TO eye_commit;

-- §AP.7 THE READ ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* The acquisition page and the coverage panel: per contract version of the source (newest first) its acquisition policy (or "not declared
   before SRC@v4"); the latest 50 authorizations; the robots cache; the rate-limited intervals (latest 100) each with its derived resolution
   (resolved by the first FINISHED run of the source after the hold ended — or still open); the stream form's explicit incomplete ranges of
   the source (latest 100, every class). Metadata only (D9): no evidence content, no credential value, no robots text. */
CREATE OR REPLACE FUNCTION observation.acquisition_policy_read(p_tenant uuid, p_domain uuid, p_source uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = observation, ctx, graph, public, pg_catalog, pg_temp AS $$
DECLARE v_at timestamptz := clock_timestamp(); v_name text; v_key text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['observation.acquisition.read']);
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the acquisition policy of a source');
  SELECT x.name, x.source_key INTO v_name, v_key FROM observation.source_contracts_current x
   WHERE x.source_id = p_source AND x.tenant_id = p_tenant AND x.domain_id = p_domain ORDER BY x.contract_version DESC LIMIT 1;
  IF v_key IS NULL THEN
    RAISE EXCEPTION 'acquisition policy rejected (unknown_source): source % is not recorded in this domain', coalesce(p_source::text, '<none>') USING ERRCODE = '23503';
  END IF;
  RETURN jsonb_build_object(
    'source_id', p_source, 'source_key', v_key, 'source_name', v_name, 'as_of', graph.pv_iso(v_at),
    'versions', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'contract_version', c.contract_version, 'lifecycle_state', c.lifecycle_state, 'rights_state', c.rights_state, 'acquisition_mode', c.acquisition_mode,
        'residency', c.residency, 'connector_kind', c.connector_kind, 'schema', CASE WHEN c.contract ? 'acquisition_policy' THEN 'SRC@v4' ELSE 'SRC@v1–v3' END,
        'acquisition_policy', c.contract -> 'acquisition_policy',
        'statement', CASE WHEN c.contract ? 'acquisition_policy' THEN 'the contract''s acquisition policy is enforced before and during egress'
                          ELSE 'not declared before SRC@v4 — this contract version keeps its recorded behaviour (no rate, robots, window or residency evaluation)' END,
        'credential_ref', c.contract #>> '{security_and_operations,credential_ref}')
        ORDER BY c.contract_version DESC), '[]'::jsonb)
        FROM observation.source_contracts_current c WHERE c.source_id = p_source AND c.tenant_id = p_tenant AND c.domain_id = p_domain),
    'authorizations', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'authorization_id', a.authorization_id, 'contract_version', a.contract_version, 'run_id', a.run_id, 'form', a.form, 'purpose_id', a.purpose_id,
        'decision', a.decision, 'refusal_class', a.refusal_class, 'reason', a.reason, 'rights', a.rights, 'licence', a.licence,
        'credential_ref', a.credential_ref, 'rate', a.rate, 'residency', a.residency, 'window', a.collection_window, 'robots', a.robots, 'backoff', a.backoff,
        'agent_principal_id', a.agent_principal_id, 'decided_at', graph.pv_iso(a.decided_at)) ORDER BY a.decided_at DESC), '[]'::jsonb)
        FROM (SELECT * FROM observation.acquisition_authorizations x WHERE x.source_id = p_source AND x.tenant_id = p_tenant AND x.domain_id = p_domain
               ORDER BY x.decided_at DESC LIMIT 50) a),
    'robots', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'contract_version', r.contract_version, 'origin', r.origin, 'outcome', r.outcome, 'http_status', r.http_status, 'content_digest', r.content_digest,
        'byte_length', r.byte_length, 'groups', jsonb_array_length(r.rules), 'rules', r.rules, 'via', r.via, 'detail', r.detail, 'run_id', r.run_id,
        'fetched_at', graph.pv_iso(r.fetched_at)) ORDER BY r.fetched_at DESC), '[]'::jsonb)
        FROM (SELECT * FROM observation.acquisition_robots x WHERE x.source_id = p_source AND x.tenant_id = p_tenant AND x.domain_id = p_domain
               ORDER BY x.fetched_at DESC LIMIT 50) r),
    'rate_limited', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'rate_limit_id', l.rate_limit_id, 'contract_version', l.contract_version, 'run_id', l.run_id, 'origin', l.origin, 'endpoint', l.endpoint,
        'http_status', l.http_status, 'retry_after_raw', l.retry_after_raw, 'retry_after_seconds', l.retry_after_seconds, 'retry_after_state', l.retry_after_state,
        'attempt', l.attempt, 'max_attempts', l.max_attempts, 'schedule_delay_seconds', l.schedule_delay_seconds, 'applied_delay_seconds', l.applied_delay_seconds,
        'interval_from', graph.pv_iso(l.interval_from), 'interval_to', graph.pv_iso(l.interval_to), 'exhausted', l.exhausted, 'retry_planned', l.retry_planned,
        'detail', l.detail, 'declared_at', graph.pv_iso(l.declared_at),
        'state', CASE WHEN res.run_id IS NOT NULL THEN 'resolved' WHEN l.interval_to > v_at THEN 'holding' ELSE 'open' END,
        'resolved_by_run', res.run_id, 'resolved_at', graph.pv_iso(res.finished_at)) ORDER BY l.declared_at DESC), '[]'::jsonb)
        FROM (SELECT * FROM observation.acquisition_rate_limits x WHERE x.source_id = p_source AND x.tenant_id = p_tenant AND x.domain_id = p_domain
               ORDER BY x.declared_at DESC LIMIT 100) l
        LEFT JOIN LATERAL (SELECT r.run_id, r.finished_at FROM observation.collection_runs_current r
                            WHERE r.source_id = l.source_id AND r.state = 'finished' AND r.finished_at >= l.declared_at
                            ORDER BY r.finished_at LIMIT 1) res ON true),
    'incomplete_ranges', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'range_id', i.range_id, 'stream_id', i.stream_id, 'range_from', i.range_from, 'range_to', i.range_to, 'reason_class', i.reason_class,
        'detail', i.detail, 'declared_at', graph.pv_iso(i.declared_at), 'resolved_at', graph.pv_iso(i.resolved_at),
        'state', CASE WHEN i.resolved_by_seq IS NULL THEN 'open' ELSE 'resolved' END) ORDER BY i.declared_at DESC), '[]'::jsonb)
        FROM (SELECT * FROM observation.acquisition_incomplete_ranges x WHERE x.source_id = p_source AND x.tenant_id = p_tenant AND x.domain_id = p_domain
               ORDER BY x.declared_at DESC LIMIT 100) i),
    'hold', (SELECT observation._ap_hold(p_source, (SELECT max(c.contract_version) FROM observation.source_contracts_current c
                                                      WHERE c.source_id = p_source AND c.lifecycle_state = 'active'), v_at)));
END $$;
REVOKE ALL ON FUNCTION observation.acquisition_policy_read(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.acquisition_policy_read(uuid, uuid, uuid) TO eye_app, eye_commit;
