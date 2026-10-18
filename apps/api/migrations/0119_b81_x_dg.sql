-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0119 §DG — CP-6 B81: THE DEGRADED-STATE, FAILURE AND RECOVERY EXPERIENCE (F-P7-E-19: HX-16, REL-12, UX-ADR-018, PAT-30, PAT-32, CNT-12, …).
-- Part-local file (folded into the one 0119 at integration, after §0); applies ALONE on 0001–0118 + the prelude (0119 §0).
--
-- THE GAP. A dependency failure was visible only as /readyz's audit flag (the shell's DegradedBanner) and as each read's own flags (B20's
-- projection block, a source's health, B29's quarantine). Nothing DECLARED what still works and what does not while a dependency is down,
-- who owns it, how long it may last, or what evidence ends it; nothing kept the degraded state explicit until a person verified recovery.
--
-- THE MECHANISM (DESIGN D5: declared in the database with a named owner, human-gated; nothing planted — the state is evaluated from the
-- real signals by the clock).
--   shell.degraded_contracts   one row per VERSION of the degraded-mode contract of ONE dependency (kind + key): the available and the
--                              unavailable functions (each a governed action name or prefix `x.y.*` with its words), the limitations, the
--                              maximum duration, the OWNER (a named active human of the scope) and the EXIT EVIDENCE (what verifies
--                              recovery). APPEND-ONLY; a new version supersedes the one the declarer read (a stale declaration refused).
--                              PLATFORM dependencies (the audit journal, models, outbound network) are declared by the OPERATIONS
--                              AUTHORITY (B107, PLATFORM) in a PLATFORM context; DOMAIN dependencies (sources, index partitions, methods,
--                              agents) by the operations authority or the DOMAIN ADMINISTRATOR in that domain's context.
--   shell.degraded_exits       the owner's VERIFIED RECOVERY: the exit evidence recorded while the live signal reads healthy (refused while
--                              it still reads degraded), with the signal it was verified against. APPEND-ONLY.
--   shell.dg_signal            THE EVALUATOR (internal; the clock a parameter): per kind, from the existing reads —
--                                audit      audit.availability_incidents (the ledger /readyz reconciles) + the process journal the API passes
--                                partition  graph.projection_partitions (B20: withdrawn) and its withdrawal ledger
--                                source     the source contract's lifecycle, its latest health (observation.source_health_events, the lag
--                                           class), and its FRESHNESS BY THE CLOCK — the last arrival (item.admitted / item.revised; the
--                                           activation when none) against the declared threshold (freshness threshold, else the cadence)
--                                method     simulation.adapter_health (B29: quarantined) and its quarantine ledger
--                                agent      executive.agents / observation.agents (revoked), the latest closed run (faulted / stopped),
--                                           the agent's live sessions
--                                model, network   NO READ exists here: the state is `unknown` and says so (never healthy by default)
--   shell.degraded_state       THE READ (definer, guarded): every contract of the scope with its live signal and its MODE —
--                                active         the signal reads degraded now
--                                awaiting_exit  the signal reads healthy, but a degradation happened after the last verified exit:
--                                               the contract STAYS IN FORCE (its unavailable functions stay unavailable) until the owner
--                                               records the exit evidence (UX-ADR-018, CNT-12 "persistent until verified recovery")
--                                normal         no degradation since the last exit (or since the contract was first declared)
--                                unknown        no read evaluates this kind of dependency
--                              the degraded dependencies with NO contract (`undeclared` — the gap shown, never hidden), and the union of
--                              the unavailable functions in force (what the web disables, PAT-30).
--   ports                      shell.degraded_contract_declare / shell.degraded_exit (SECURITY DEFINER, eye_commit; the route's action,
--                              the scope, the acting principal = eye_principal(), a NAMED HUMAN re-checked in the port; a request id
--                              replayed by the same person answers the recorded row — no duplicate effect, PAT-20).
--   the ledger                 every declaration and exit in shell.events (the prelude's ledger, the actor's own).
--   refusals                   the class form `degraded contract rejected (<class>): …` — 403 actor|authority · 404 unknown_* ·
--                              409 stale|state|duplicate · 422 the rest. NOTE (the integrator): the noun `degraded contract` is not mapped
--                              centrally yet (observation-errors.ts); the service maps it meanwhile.
--
-- THREE CLAIMS: construction (this file and phase6-degraded-b81.test.ts — every persona, contract and signal there SYNTHETIC);
-- demonstrated operation (the act: the operations authority declares the AIS source's contract on eye_demo; the source is stale by the
-- database clock — nothing planted); real acceptance (UX-19-006 → the shared recording path at B111, then H3) — never claimed here.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- §DG.0 THE VOCABULARY ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* The dependency kinds (b81-seams.ts DependencyKind) and the scope each is declared at. */
CREATE OR REPLACE FUNCTION shell.dg_kinds() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY['audit', 'partition', 'source', 'method', 'agent', 'model', 'network'] $$;
CREATE OR REPLACE FUNCTION shell.dg_kind_scope(p_kind text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN p_kind IN ('audit', 'model', 'network') THEN 'PLATFORM' WHEN p_kind IN ('partition', 'source', 'method', 'agent') THEN 'DOMAIN' END $$;
CREATE OR REPLACE FUNCTION shell.dg_partitions() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY['entities_current', 'resolutions_current', 'edges_current', 'strategy_current', 'invalidations_current', 'memory_items_current'] $$;
GRANT EXECUTE ON FUNCTION shell.dg_kinds(), shell.dg_kind_scope(text), shell.dg_partitions() TO eye_app, eye_commit;

-- §DG.1 THE TABLES ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE shell.degraded_contracts (
  contract_id          uuid NOT NULL,
  version              int NOT NULL CHECK (version >= 1),
  scope                text NOT NULL CHECK (scope IN ('PLATFORM', 'DOMAIN')),
  tenant_id            uuid,
  domain_id            uuid,
  dependency_kind      text NOT NULL CHECK (dependency_kind = ANY (shell.dg_kinds())),
  dependency_key       text NOT NULL CHECK (length(dependency_key) BETWEEN 1 AND 200 AND dependency_key !~ '[[:cntrl:][:space:]]'),
  available            jsonb NOT NULL CHECK (jsonb_typeof(available) = 'array'),
  unavailable          jsonb NOT NULL CHECK (jsonb_typeof(unavailable) = 'array'),
  limitations          jsonb NOT NULL CHECK (jsonb_typeof(limitations) = 'array' AND jsonb_array_length(limitations) >= 1),
  max_duration_seconds int NOT NULL CHECK (max_duration_seconds BETWEEN 60 AND 7776000),
  owner_principal_id   uuid NOT NULL,
  exit_evidence        text NOT NULL CHECK (length(btrim(exit_evidence)) BETWEEN 8 AND 2000),
  reason               text NOT NULL CHECK (length(btrim(reason)) BETWEEN 8 AND 2000),
  declared_by          uuid NOT NULL,
  declared_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  supersedes           int,
  request_id           uuid NOT NULL UNIQUE,
  correlation_id       uuid NOT NULL,
  PRIMARY KEY (contract_id, version),
  CONSTRAINT shdc_scope CHECK ((scope = 'PLATFORM' AND tenant_id IS NULL AND domain_id IS NULL) OR (scope = 'DOMAIN' AND tenant_id IS NOT NULL AND domain_id IS NOT NULL)),
  CONSTRAINT shdc_kind_scope CHECK (scope = shell.dg_kind_scope(dependency_kind)),
  CONSTRAINT shdc_supersedes CHECK ((version = 1 AND supersedes IS NULL) OR (version > 1 AND supersedes = version - 1)),
  CONSTRAINT shdc_functions CHECK (jsonb_array_length(available) + jsonb_array_length(unavailable) >= 1)
);
COMMENT ON TABLE shell.degraded_contracts IS 'B81 §DG (HX-16, REL-12): the versioned degraded-mode contract of one dependency — available / unavailable functions, limitations, maximum duration, owner, exit evidence; declared by a named human (operations authority / domain administrator); append-only. The live state is evaluated from the real signals (shell.degraded_state), never stored.';
CREATE UNIQUE INDEX shdc_series ON shell.degraded_contracts (coalesce(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(domain_id, '00000000-0000-0000-0000-000000000000'::uuid), dependency_kind, dependency_key, version);
CREATE INDEX shdc_scope_idx ON shell.degraded_contracts (tenant_id, domain_id, dependency_kind, dependency_key);
CREATE TRIGGER shdc_append_only BEFORE UPDATE OR DELETE ON shell.degraded_contracts FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

CREATE TABLE shell.degraded_exits (
  exit_id              uuid PRIMARY KEY,
  contract_id          uuid NOT NULL,
  contract_version     int NOT NULL,
  scope                text NOT NULL CHECK (scope IN ('PLATFORM', 'DOMAIN')),
  tenant_id            uuid,
  domain_id            uuid,
  evidence             text NOT NULL CHECK (length(btrim(evidence)) BETWEEN 8 AND 2000),
  evidence_refs        jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(evidence_refs) = 'array' AND jsonb_array_length(evidence_refs) <= 20),
  signal               jsonb NOT NULL CHECK (jsonb_typeof(signal) = 'object'),
  degraded_at          timestamptz,               -- the last degradation the exit closes (the evaluator's last_degraded_at)
  recorded_by          uuid NOT NULL,
  recorded_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  request_id           uuid NOT NULL UNIQUE,
  correlation_id       uuid NOT NULL,
  FOREIGN KEY (contract_id, contract_version) REFERENCES shell.degraded_contracts (contract_id, version),
  CONSTRAINT shdx_scope CHECK ((scope = 'PLATFORM' AND tenant_id IS NULL AND domain_id IS NULL) OR (scope = 'DOMAIN' AND tenant_id IS NOT NULL AND domain_id IS NOT NULL))
);
COMMENT ON TABLE shell.degraded_exits IS 'B81 §DG (UX-ADR-018, CNT-12): the owner''s verified recovery of a degraded dependency — the exit evidence, recorded only while the live signal reads healthy, with the signal it was verified against; append-only.';
CREATE INDEX shdx_contract ON shell.degraded_exits (contract_id, recorded_at DESC);
CREATE TRIGGER shdx_append_only BEFORE UPDATE OR DELETE ON shell.degraded_exits FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

/* RLS: a PLATFORM contract (the journal, models, the network) is visible to every bound principal — it describes the shared platform; a
   DOMAIN contract within its tenant (and, for a DOMAIN context, its domain) only. No write grant: the ports write. */
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['degraded_contracts', 'degraded_exits'] LOOP
    EXECUTE format('ALTER TABLE shell.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE shell.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY shdg_visible ON shell.%I FOR SELECT TO eye_app, eye_commit USING (
        (scope = 'PLATFORM' AND public.eye_principal() IS NOT NULL)
        OR (scope = 'DOMAIN' AND tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain())))$f$, t);
    EXECUTE format('GRANT SELECT ON shell.%I TO eye_app, eye_commit', t);
  END LOOP;
END $$;

-- §DG.2 THE SHARED CHECKS ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* The acting principal: the bound principal, the actor named by the route, a NAMED ACTIVE HUMAN (never an agent, never a system). */
CREATE OR REPLACE FUNCTION shell.dg_actor(p_actor uuid) RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = shell, pg_catalog, pg_temp AS $$
DECLARE v uuid := public.eye_principal();
BEGIN
  IF v IS NULL THEN
    RAISE EXCEPTION 'degraded contract rejected (actor): no principal is bound to this context' USING ERRCODE = '42501';
  END IF;
  IF p_actor IS NULL OR p_actor IS DISTINCT FROM v THEN
    RAISE EXCEPTION 'degraded contract rejected (actor): the act is recorded under the acting principal, never on behalf of another' USING ERRCODE = '42501';
  END IF;
  IF onboarding.principal_kind(v) IS DISTINCT FROM 'human' THEN
    RAISE EXCEPTION 'degraded contract rejected (actor): declaring a degraded mode or verifying a recovery is a named person''s act; an agent or a system never does it' USING ERRCODE = '42501';
  END IF;
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION shell.dg_actor(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION shell.dg_actor(uuid) TO eye_commit;

/* The scope of the established context for a dependency kind: a PLATFORM dependency in a PLATFORM context (no tenant, no domain); a DOMAIN
   dependency in that domain's context (observation.assert_scope — the context's own triple, never an argument). */
CREATE OR REPLACE FUNCTION shell.dg_assert_scope(p_kind text, p_tenant uuid, p_domain uuid) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = shell, observation, pg_catalog, pg_temp AS $$
DECLARE v_scope text := shell.dg_kind_scope(p_kind);
BEGIN
  IF v_scope IS NULL THEN
    RAISE EXCEPTION 'degraded contract rejected (kind): % is not a dependency kind (%)', coalesce(p_kind, '<none>'), array_to_string(shell.dg_kinds(), ', ') USING ERRCODE = '22023';
  END IF;
  IF v_scope = 'PLATFORM' THEN
    IF public.eye_scope() IS DISTINCT FROM 'PLATFORM' OR p_tenant IS NOT NULL OR p_domain IS NOT NULL THEN
      RAISE EXCEPTION 'degraded contract rejected (scope): a % dependency is the platform''s — declared and exited in a PLATFORM context, with no tenant or domain', p_kind USING ERRCODE = '22023';
    END IF;
  ELSE
    IF public.eye_scope() IS DISTINCT FROM 'DOMAIN' THEN
      RAISE EXCEPTION 'degraded contract rejected (scope): a % dependency belongs to a domain — declared and exited in that domain''s context', p_kind USING ERRCODE = '22023';
    END IF;
    PERFORM observation.assert_scope(p_tenant, p_domain);
  END IF;
  RETURN v_scope;
END $$;
REVOKE ALL ON FUNCTION shell.dg_assert_scope(text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION shell.dg_assert_scope(text, uuid, uuid) TO eye_commit;

/* Does the principal hold ANY live binding covering the scope (a PLATFORM contract: a PLATFORM binding; a DOMAIN contract: a PLATFORM,
   tenant or domain binding of that tenant/domain)? The owner test. */
CREATE OR REPLACE FUNCTION shell.dg_holds_any(p_principal uuid, p_tenant uuid, p_domain uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = identity, pg_catalog, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM identity.role_bindings b JOIN identity.principals p ON p.id = b.principal_id
                  WHERE b.principal_id = p_principal AND p.status = 'active' AND b.revoked_at IS NULL
                    AND (b.scope = 'PLATFORM'
                         OR (p_tenant IS NOT NULL AND b.scope = 'TENANT' AND b.tenant_id = p_tenant)
                         OR (p_domain IS NOT NULL AND b.scope = 'DOMAIN' AND b.tenant_id = p_tenant AND b.domain_id = p_domain)))
$$;
REVOKE ALL ON FUNCTION shell.dg_holds_any(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION shell.dg_holds_any(uuid, uuid, uuid) TO eye_commit;

/* A list of functions: [{action, label}] — action a governed action name or a prefix ending in `.*`; label the words a person reads. */
CREATE OR REPLACE FUNCTION shell.dg_functions_problem(p jsonb, p_what text) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
DECLARE e jsonb; v_seen text[] := ARRAY[]::text[];
BEGIN
  IF p IS NULL OR jsonb_typeof(p) <> 'array' THEN RETURN format('the %s functions are a list of {action, label}', p_what); END IF;
  IF jsonb_array_length(p) > 50 THEN RETURN format('at most 50 %s functions', p_what); END IF;
  FOR e IN SELECT * FROM jsonb_array_elements(p) LOOP
    IF jsonb_typeof(e) <> 'object' OR jsonb_typeof(e -> 'action') <> 'string' OR jsonb_typeof(e -> 'label') <> 'string' THEN
      RETURN format('each %s function is {action, label}', p_what);
    END IF;
    IF (e ->> 'action') !~ '^[a-z][a-z0-9_]*(\.[a-z0-9_]+)*(\.\*)?$' OR length(e ->> 'action') > 120 THEN
      RETURN format('%s is not a governed action name or prefix (e.g. prediction.forecast.run or decision.package.*)', e ->> 'action');
    END IF;
    IF length(btrim(e ->> 'label')) < 3 OR length(e ->> 'label') > 200 THEN
      RETURN format('the label of %s says what it is in 3 to 200 characters', e ->> 'action');
    END IF;
    IF (e ->> 'action') = ANY (v_seen) THEN RETURN format('%s is listed twice', e ->> 'action'); END IF;
    v_seen := v_seen || (e ->> 'action');
  END LOOP;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION shell.dg_functions_problem(jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION shell.dg_functions_problem(jsonb, text) TO eye_commit;

/* Does a dependency key name a real dependency of the scope? (the declaration's unknown_dependency) */
CREATE OR REPLACE FUNCTION shell.dg_key_known(p_kind text, p_key text, p_tenant uuid, p_domain uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = shell, pg_catalog, pg_temp AS $$
DECLARE v_id uuid;
BEGIN
  CASE p_kind
    WHEN 'audit' THEN RETURN p_key = 'journal';
    WHEN 'partition' THEN RETURN p_key = ANY (shell.dg_partitions());
    WHEN 'source' THEN RETURN EXISTS (SELECT 1 FROM observation.source_contracts_current c WHERE c.tenant_id = p_tenant AND c.domain_id = p_domain AND c.source_key = p_key);
    WHEN 'method' THEN RETURN EXISTS (SELECT 1 FROM twin.behaviour_models m WHERE m.method_ref = p_key);
    WHEN 'agent' THEN
      IF p_key !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RETURN false; END IF;
      v_id := p_key::uuid;
      RETURN EXISTS (SELECT 1 FROM executive.agents a WHERE a.agent_id = v_id AND a.tenant_id = p_tenant AND a.domain_id = p_domain)
          OR EXISTS (SELECT 1 FROM observation.agents a WHERE a.agent_id = v_id AND a.tenant_id = p_tenant AND a.domain_id = p_domain);
    ELSE RETURN p_key ~ '^[a-z0-9][a-z0-9_.:-]{1,120}$';   -- model, network: no registry read exists here; the key is a name
  END CASE;
END $$;
REVOKE ALL ON FUNCTION shell.dg_key_known(text, text, uuid, uuid) FROM PUBLIC;

-- §DG.3 THE EVALUATOR (internal; the clock is a parameter — the read passes the database clock) ─────────────────────────────────────────
/* The live signal of one dependency AT an instant: {state: degraded | healthy | unknown, reason, since, last_degraded_at, basis, details}.
   `since` — when the current degradation began; `last_degraded_at` — the latest instant the dependency was observed degraded (now, when
   degraded; else the latest recorded degradation), the persistence rule's input. Only TIME-BASED signals move with p_at (a source's
   freshness, an agent's sessions); the recorded states (a withdrawn partition, a quarantine, an incident) are read as they stand.
   p_journal is the API process's audit journal ({degraded, incidents, since} — /readyz's); it can only ADD degradation. */
CREATE OR REPLACE FUNCTION shell.dg_signal(p_kind text, p_key text, p_tenant uuid, p_domain uuid, p_at timestamptz, p_journal jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = shell, pg_catalog, pg_temp AS $$
DECLARE
  v_n bigint; v_first timestamptz; v_last timestamptz; v_journal boolean := coalesce((p_journal ->> 'degraded')::boolean, false); v_jsince timestamptz;
  pp graph.projection_partitions%ROWTYPE; v_found boolean;
  s observation.source_contracts_current%ROWTYPE; v_threshold int; v_arrival timestamptz; v_act timestamptz; v_ref timestamptz; v_h observation.source_health_events%ROWTYPE;
  v_hfound boolean; v_stale boolean := false; v_hbad boolean := false; v_down boolean := false; v_down_at timestamptz; v_hsince timestamptz; v_gap timestamptz; v_hlast timestamptz;
  ah simulation.adapter_health%ROWTYPE;
  xa executive.agents%ROWTYPE; oa observation.agents%ROWTYPE; v_run executive.agent_runs%ROWTYPE; v_crun observation.collection_runs_current%ROWTYPE; v_sessions bigint; v_aid uuid;
  v_reasons text[] := ARRAY[]::text[]; v_since timestamptz; v_details jsonb;
BEGIN
  CASE p_kind
  -- ── the audit journal (PLATFORM) ──
  WHEN 'audit' THEN
    SELECT count(*), min(a.detected_at) INTO v_n, v_first FROM audit.availability_incidents a WHERE a.reconciled_at IS NULL AND a.kind <> 'degraded_recovered';
    SELECT max(a.detected_at) INTO v_last FROM audit.availability_incidents a WHERE a.kind <> 'degraded_recovered' AND a.detected_at <= p_at;
    BEGIN v_jsince := (p_journal ->> 'since')::timestamptz; EXCEPTION WHEN others THEN v_jsince := NULL; END;
    IF v_n > 0 OR v_journal THEN
      v_since := CASE WHEN v_n > 0 AND v_journal THEN least(v_first, coalesce(v_jsince, v_first)) WHEN v_n > 0 THEN v_first ELSE v_jsince END;
      RETURN jsonb_build_object('state', 'degraded', 'basis', 'audit journal (/readyz) and the availability incident ledger',
        'reason', format('authoritative audit persistence is degraded: %s unreconciled incident(s) in the ledger%s', v_n, CASE WHEN v_journal THEN format('; the API''s journal reports %s', coalesce(p_journal ->> 'incidents', '?') || ' incident(s)') ELSE '' END),
        'since', v_since, 'last_degraded_at', p_at, 'details', jsonb_build_object('open_incidents', v_n, 'journal', coalesce(p_journal, 'null'::jsonb)));
    END IF;
    RETURN jsonb_build_object('state', 'healthy', 'basis', 'audit journal (/readyz) and the availability incident ledger', 'reason', 'no unreconciled availability incident; the journal reports none',
      'since', NULL, 'last_degraded_at', v_last, 'details', jsonb_build_object('open_incidents', 0, 'journal', coalesce(p_journal, 'null'::jsonb)));

  -- ── a B20 index partition (DOMAIN) ──
  WHEN 'partition' THEN
    IF NOT (p_key = ANY (shell.dg_partitions())) THEN
      RETURN jsonb_build_object('state', 'unknown', 'basis', 'graph.projection_partitions (B20)', 'reason', format('%s is not a projection of this product', p_key), 'since', NULL, 'last_degraded_at', NULL, 'details', '{}'::jsonb);
    END IF;
    SELECT * INTO pp FROM graph.projection_partitions x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.projection = p_key;
    v_found := FOUND;
    SELECT max(e.occurred_at) INTO v_last FROM graph.projection_events e
     WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain AND e.projection = p_key AND e.event = 'projection.withdrawn' AND e.occurred_at <= p_at;
    IF v_found AND pp.state = 'withdrawn' THEN
      RETURN jsonb_build_object('state', 'degraded', 'basis', 'graph.projection_partitions (B20)',
        'reason', format('the %s partition is WITHDRAWN: reads are served from the event log, labelled, until a rebuild returns it to service (%s)', p_key, pp.withdrawn_reason),
        'since', pp.withdrawn_at, 'last_degraded_at', p_at,
        'details', jsonb_build_object('projection', p_key, 'withdrawn_at', pp.withdrawn_at, 'withdrawn_by', pp.withdrawn_by, 'withdrawn_by_check', pp.withdrawn_by_check, 'reason', pp.withdrawn_reason,
                                      'refresh_path', 'the operator''s rebuild (graph.projection.rebuild) — the only way back to service'));
    END IF;
    RETURN jsonb_build_object('state', 'healthy', 'basis', 'graph.projection_partitions (B20)', 'reason', format('the %s partition is serving', p_key),
      'since', NULL, 'last_degraded_at', v_last, 'details', jsonb_build_object('projection', p_key, 'rebuilt_at', CASE WHEN v_found THEN pp.rebuilt_at END));

  -- ── a source (DOMAIN): its contract's lifecycle, its health, its freshness by the clock ──
  WHEN 'source' THEN
    SELECT * INTO s FROM observation.source_contracts_current c WHERE c.tenant_id = p_tenant AND c.domain_id = p_domain AND c.source_key = p_key
     ORDER BY (c.lifecycle_state = 'active') DESC, c.contract_version DESC LIMIT 1;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('state', 'unknown', 'basis', 'observation.source_contracts_current', 'reason', format('no source %s in this domain', p_key), 'since', NULL, 'last_degraded_at', NULL, 'details', '{}'::jsonb);
    END IF;
    v_threshold := coalesce(s.freshness_threshold_seconds, s.cadence_seconds);
    SELECT max(e.occurred_at) INTO v_arrival FROM observation.collection_run_events e
     WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain AND e.source_id = s.source_id AND e.event IN ('item.admitted', 'item.revised') AND e.occurred_at <= p_at;
    SELECT max(x.occurred_at) INTO v_act FROM observation.source_contract_events x
     WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.source_id = s.source_id AND x.event IN ('contract.activated', 'contract.reactivated') AND x.occurred_at <= p_at;
    v_ref := coalesce(v_arrival, v_act);
    SELECT * INTO v_h FROM observation.source_health_events h WHERE h.tenant_id = p_tenant AND h.domain_id = p_domain AND h.source_id = s.source_id AND h.evaluated_at <= p_at
     ORDER BY h.evaluated_at DESC, h.recorded_at DESC LIMIT 1;
    v_hfound := FOUND;
    v_down := s.lifecycle_state <> 'active';
    IF v_down THEN v_reasons := v_reasons || format('the source contract v%s is %s', s.contract_version, s.lifecycle_state); END IF;
    v_hbad := v_hfound AND v_h.new_state IN ('degraded', 'failed', 'suspended');
    IF v_hbad THEN
      SELECT min(h.evaluated_at) INTO v_hsince FROM observation.source_health_events h
       WHERE h.tenant_id = p_tenant AND h.domain_id = p_domain AND h.source_id = s.source_id AND h.evaluated_at <= p_at
         AND h.evaluated_at > coalesce((SELECT max(k.evaluated_at) FROM observation.source_health_events k WHERE k.tenant_id = p_tenant AND k.domain_id = p_domain AND k.source_id = s.source_id
                                         AND k.new_state = 'healthy' AND k.evaluated_at <= p_at), '-infinity'::timestamptz);
      v_reasons := v_reasons || format('its health is %s (%s; lag class %s)', v_h.new_state, v_h.reason, v_h.lag_class);
    END IF;
    v_stale := v_threshold IS NOT NULL AND v_ref IS NOT NULL AND p_at - v_ref > make_interval(secs => v_threshold);
    IF v_stale THEN
      v_reasons := v_reasons || format('it is STALE by the clock: the last %s was %s, %s ago — beyond its %s s %s',
        CASE WHEN v_arrival IS NULL THEN 'activation (no arrival since)' ELSE 'arrival' END, v_ref, date_trunc('second', p_at - v_ref),
        v_threshold, CASE WHEN s.freshness_threshold_seconds IS NULL THEN 'cadence' ELSE 'freshness threshold' END);
    END IF;
    -- the latest recorded degradation (the persistence rule): a bad health evaluation, a gap between arrivals beyond the threshold (the
    -- arrival that closed it), a suspension or retirement
    SELECT max(h.evaluated_at) INTO v_hlast FROM observation.source_health_events h
     WHERE h.tenant_id = p_tenant AND h.domain_id = p_domain AND h.source_id = s.source_id AND h.new_state IN ('degraded', 'failed', 'suspended') AND h.evaluated_at <= p_at;
    IF v_threshold IS NOT NULL THEN
      SELECT max(a.at) INTO v_gap FROM (
        SELECT z.at, lag(z.at) OVER (ORDER BY z.at) AS prev FROM (
          SELECT e.occurred_at AS at FROM observation.collection_run_events e
           WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain AND e.source_id = s.source_id AND e.event IN ('item.admitted', 'item.revised') AND e.occurred_at <= p_at
          UNION ALL
          SELECT min(x.occurred_at) FROM observation.source_contract_events x
           WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.source_id = s.source_id AND x.event = 'contract.activated' AND x.occurred_at <= p_at) z
         WHERE z.at IS NOT NULL) a
       WHERE a.prev IS NOT NULL AND a.at - a.prev > make_interval(secs => v_threshold);
    END IF;
    -- the latest suspension or retirement (a down contract's `since`; a recorded degradation otherwise)
    SELECT max(x.occurred_at) INTO v_down_at FROM observation.source_contract_events x
     WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.source_id = s.source_id AND x.event IN ('contract.suspended', 'contract.retired') AND x.occurred_at <= p_at;
    v_details := jsonb_build_object('source_id', s.source_id, 'source_key', s.source_key, 'source_name', s.name, 'source_revision', s.contract_version, 'lifecycle_state', s.lifecycle_state,
      'connector_kind', s.connector_kind, 'acquisition_mode', s.acquisition_mode, 'data_origin', s.data_origin,
      'cadence_seconds', s.cadence_seconds, 'freshness_threshold_seconds', s.freshness_threshold_seconds, 'threshold_seconds', v_threshold,
      'watermark', v_arrival, 'reference_at', v_ref, 'reference_basis', CASE WHEN v_arrival IS NOT NULL THEN 'last arrival' WHEN v_act IS NOT NULL THEN 'activation (no arrival since)' END,
      'age_seconds', CASE WHEN v_ref IS NULL THEN NULL ELSE floor(extract(epoch FROM p_at - v_ref))::bigint END, 'stale', v_stale,
      'health', CASE WHEN v_hfound THEN jsonb_build_object('state', v_h.new_state, 'evaluated_at', v_h.evaluated_at, 'lag_class', v_h.lag_class, 'reason', v_h.reason) END,
      'refresh_path', CASE WHEN s.connector_kind = 'upload' THEN format('a new upload under source contract v%s (its registrar or a collection manager)', s.contract_version)
                           ELSE 'the next scheduled collection run, or a run the collection manager starts' END);
    IF v_down OR v_hbad OR v_stale THEN
      v_since := least(CASE WHEN v_stale THEN v_ref + make_interval(secs => v_threshold) END, CASE WHEN v_hbad THEN coalesce(v_hsince, v_h.evaluated_at) END, CASE WHEN v_down THEN v_down_at END);
      RETURN jsonb_build_object('state', 'degraded', 'basis', 'the source contract, its health and its freshness by the clock', 'reason', format('source %s: %s', p_key, array_to_string(v_reasons, '; ')),
        'since', v_since, 'last_degraded_at', p_at, 'details', v_details);
    END IF;
    RETURN jsonb_build_object('state', 'healthy', 'basis', 'the source contract, its health and its freshness by the clock',
      'reason', CASE WHEN v_threshold IS NULL THEN format('source %s is active; no cadence or freshness threshold is declared, so its freshness is not evaluated', p_key)
                     ELSE format('source %s is active and fresh: the last %s is within its %s s threshold', p_key, coalesce(v_details ->> 'reference_basis', 'arrival'), v_threshold) END,
      'since', NULL, 'last_degraded_at', (SELECT max(x) FROM unnest(ARRAY[v_hlast, v_gap, v_down_at]) x), 'details', v_details);

  -- ── a B29 method (DOMAIN) ──
  WHEN 'method' THEN
    IF NOT EXISTS (SELECT 1 FROM twin.behaviour_models m WHERE m.method_ref = p_key) THEN
      RETURN jsonb_build_object('state', 'unknown', 'basis', 'simulation.adapter_health (B29)', 'reason', format('%s is not a registered method', p_key), 'since', NULL, 'last_degraded_at', NULL, 'details', '{}'::jsonb);
    END IF;
    SELECT * INTO ah FROM simulation.adapter_health x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.model_ref = p_key;
    v_found := FOUND;
    SELECT max(e.occurred_at) INTO v_last FROM simulation.adapter_events e WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain AND e.model_ref = p_key AND e.event = 'quarantined' AND e.occurred_at <= p_at;
    IF v_found AND ah.state = 'quarantined' THEN
      RETURN jsonb_build_object('state', 'degraded', 'basis', 'simulation.adapter_health (B29)',
        'reason', format('method %s is QUARANTINED in this domain after %s consecutive fault(s); new runs of it are refused until a method steward reinstates it on a passing probe', p_key, ah.consecutive_faults),
        'since', ah.quarantined_at, 'last_degraded_at', p_at,
        'details', jsonb_build_object('model_ref', p_key, 'consecutive_faults', ah.consecutive_faults, 'last_fault', ah.last_fault, 'last_fault_at', ah.last_fault_at, 'last_probe_passed_at', ah.last_probe_passed_at,
                                      'refresh_path', 'a passing probe and the method steward''s reinstatement (simulation.adapter.reinstate)'));
    END IF;
    RETURN jsonb_build_object('state', 'healthy', 'basis', 'simulation.adapter_health (B29)',
      'reason', CASE WHEN v_found THEN format('method %s is healthy in this domain (%s consecutive fault(s))', p_key, ah.consecutive_faults) ELSE format('method %s has no fault recorded in this domain', p_key) END,
      'since', NULL, 'last_degraded_at', v_last, 'details', jsonb_build_object('model_ref', p_key, 'reinstated_at', CASE WHEN v_found THEN ah.reinstated_at END));

  -- ── an agent (DOMAIN): its registration, its latest closed run, its sessions ──
  WHEN 'agent' THEN
    IF p_key !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RETURN jsonb_build_object('state', 'unknown', 'basis', 'the agent registry', 'reason', format('%s is not an agent id', p_key), 'since', NULL, 'last_degraded_at', NULL, 'details', '{}'::jsonb);
    END IF;
    v_aid := p_key::uuid;
    SELECT * INTO xa FROM executive.agents a WHERE a.agent_id = v_aid AND a.tenant_id = p_tenant AND a.domain_id = p_domain;
    IF FOUND THEN
      SELECT * INTO v_run FROM executive.agent_runs r WHERE r.agent_id = v_aid AND r.outcome <> 'running' AND r.finished_at <= p_at ORDER BY r.finished_at DESC LIMIT 1;
      v_found := FOUND;
      SELECT count(*) INTO v_sessions FROM identity.sessions x WHERE x.principal_id = xa.principal_id AND x.status = 'active' AND x.expires_at > p_at;
      SELECT greatest(xa.revoked_at, max(r.finished_at)) INTO v_last FROM executive.agent_runs r WHERE r.agent_id = v_aid AND r.outcome IN ('faulted', 'stopped') AND r.finished_at <= p_at;
      v_last := coalesce(v_last, CASE WHEN xa.revoked_at <= p_at THEN xa.revoked_at END);
      v_details := jsonb_build_object('agent_id', v_aid, 'agent_kind', xa.agent_kind, 'agent_version', xa.agent_version, 'registry', 'executive.agents', 'status', xa.status,
        'owner_principal_id', xa.owner_principal_id, 'escalation_principal_id', xa.escalation_principal_id, 'live_sessions', v_sessions,
        'last_run', CASE WHEN v_found THEN jsonb_build_object('run_id', v_run.run_id, 'outcome', v_run.outcome, 'stop_reason', v_run.stop_reason, 'finished_at', v_run.finished_at, 'escalated_to', v_run.escalated_to) END,
        'running', EXISTS (SELECT 1 FROM executive.agent_runs r WHERE r.agent_id = v_aid AND r.outcome = 'running'));
      IF xa.status = 'revoked' THEN
        RETURN jsonb_build_object('state', 'degraded', 'basis', 'executive.agents and its runs', 'reason', format('the %s agent''s grant is REVOKED: it opens no session and runs nothing', xa.agent_kind),
          'since', xa.revoked_at, 'last_degraded_at', p_at, 'details', v_details);
      END IF;
      IF v_found AND v_run.outcome IN ('faulted', 'stopped') THEN
        RETURN jsonb_build_object('state', 'degraded', 'basis', 'executive.agents and its runs',
          'reason', format('the %s agent''s latest run %s (%s); its work since then is not done', xa.agent_kind, upper(v_run.outcome), coalesce(v_run.stop_reason, 'no reason recorded')),
          'since', v_run.finished_at, 'last_degraded_at', p_at, 'details', v_details);
      END IF;
      RETURN jsonb_build_object('state', 'healthy', 'basis', 'executive.agents and its runs',
        'reason', CASE WHEN v_found THEN format('the %s agent is active; its latest run %s', xa.agent_kind, v_run.outcome) ELSE format('the %s agent is active; it has no closed run yet', xa.agent_kind) END,
        'since', NULL, 'last_degraded_at', v_last, 'details', v_details);
    END IF;
    SELECT * INTO oa FROM observation.agents a WHERE a.agent_id = v_aid AND a.tenant_id = p_tenant AND a.domain_id = p_domain;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('state', 'unknown', 'basis', 'the agent registry', 'reason', format('no agent %s in this domain', p_key), 'since', NULL, 'last_degraded_at', NULL, 'details', '{}'::jsonb);
    END IF;
    SELECT * INTO v_crun FROM observation.collection_runs_current r WHERE r.agent_principal_id = oa.principal_id AND r.tenant_id = p_tenant AND r.domain_id = p_domain AND r.started_at <= p_at
     ORDER BY r.started_at DESC LIMIT 1;
    v_found := FOUND;
    SELECT count(*) INTO v_sessions FROM identity.sessions x WHERE x.principal_id = oa.principal_id AND x.status = 'active' AND x.expires_at > p_at;
    SELECT max(r.finished_at) INTO v_last FROM observation.collection_runs_current r WHERE r.agent_principal_id = oa.principal_id AND r.tenant_id = p_tenant AND r.domain_id = p_domain AND r.state = 'failed' AND r.finished_at <= p_at;
    v_last := (SELECT max(x) FROM unnest(ARRAY[v_last, CASE WHEN oa.revoked_at <= p_at THEN oa.revoked_at END]) x);
    v_details := jsonb_build_object('agent_id', v_aid, 'agent_kind', oa.agent_kind, 'agent_version', oa.agent_version, 'registry', 'observation.agents', 'status', oa.status,
      'owner_principal_id', oa.owner_principal_id, 'live_sessions', v_sessions,
      'last_run', CASE WHEN v_found THEN jsonb_build_object('run_id', v_crun.run_id, 'state', v_crun.state, 'failure_reason', v_crun.failure_reason, 'finished_at', v_crun.finished_at) END);
    IF oa.status = 'revoked' THEN
      RETURN jsonb_build_object('state', 'degraded', 'basis', 'observation.agents and its collection runs', 'reason', format('the %s agent''s grant is REVOKED: it collects nothing', oa.agent_kind),
        'since', oa.revoked_at, 'last_degraded_at', p_at, 'details', v_details);
    END IF;
    IF v_found AND v_crun.state = 'failed' THEN
      RETURN jsonb_build_object('state', 'degraded', 'basis', 'observation.agents and its collection runs', 'reason', format('the %s agent''s latest collection run FAILED (%s)', oa.agent_kind, coalesce(v_crun.failure_reason, 'no reason recorded')),
        'since', coalesce(v_crun.finished_at, v_crun.last_event_at), 'last_degraded_at', p_at, 'details', v_details);
    END IF;
    RETURN jsonb_build_object('state', 'healthy', 'basis', 'observation.agents and its collection runs', 'reason', format('the %s agent is active', oa.agent_kind),
      'since', NULL, 'last_degraded_at', v_last, 'details', v_details);

  -- ── no read exists here ──
  WHEN 'model' THEN
    RETURN jsonb_build_object('state', 'unknown', 'basis', 'none', 'reason', 'no read evaluates a model''s availability here (the model registry and model-based interpretation are B72/B73''s); the contract is declared, its state is not evaluated',
      'since', NULL, 'last_degraded_at', NULL, 'details', '{}'::jsonb);
  WHEN 'network' THEN
    RETURN jsonb_build_object('state', 'unknown', 'basis', 'none', 'reason', 'no read evaluates an outbound channel''s availability here (each delivery carries its own receipt); the contract is declared, its state is not evaluated',
      'since', NULL, 'last_degraded_at', NULL, 'details', '{}'::jsonb);
  ELSE
    RETURN jsonb_build_object('state', 'unknown', 'basis', 'none', 'reason', format('%s is not a dependency kind', coalesce(p_kind, '<none>')), 'since', NULL, 'last_degraded_at', NULL, 'details', '{}'::jsonb);
  END CASE;
END $$;
REVOKE ALL ON FUNCTION shell.dg_signal(text, text, uuid, uuid, timestamptz, jsonb) FROM PUBLIC;

/* One contract version (the series' current) evaluated at an instant: the contract, its owner, its live signal, its MODE, the elapsed time
   and whether it is past its maximum duration, the last verified exit. */
CREATE OR REPLACE FUNCTION shell.dg_evaluate(c shell.degraded_contracts, p_at timestamptz, p_journal jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = shell, pg_catalog, pg_temp AS $$
DECLARE v_sig jsonb; v_exit shell.degraded_exits%ROWTYPE; v_has_exit boolean; v_first timestamptz; v_mode text; v_last timestamptz; v_since timestamptz; v_elapsed bigint;
BEGIN
  v_sig := shell.dg_signal(c.dependency_kind, c.dependency_key, c.tenant_id, c.domain_id, p_at, p_journal);
  SELECT * INTO v_exit FROM shell.degraded_exits x WHERE x.contract_id = c.contract_id AND x.recorded_at <= p_at ORDER BY x.recorded_at DESC LIMIT 1;
  v_has_exit := FOUND;
  SELECT min(k.declared_at) INTO v_first FROM shell.degraded_contracts k WHERE k.contract_id = c.contract_id;
  v_last := (v_sig ->> 'last_degraded_at')::timestamptz;
  v_since := (v_sig ->> 'since')::timestamptz;
  v_mode := CASE
    WHEN v_sig ->> 'state' = 'degraded' THEN 'active'
    WHEN v_sig ->> 'state' = 'unknown' THEN 'unknown'
    WHEN v_last IS NOT NULL AND v_last > greatest(v_first, CASE WHEN v_has_exit THEN v_exit.recorded_at END) THEN 'awaiting_exit'
    ELSE 'normal' END;
  v_elapsed := CASE WHEN v_mode = 'active' AND v_since IS NOT NULL THEN floor(extract(epoch FROM p_at - v_since))::bigint END;
  RETURN jsonb_build_object(
    'contract_id', c.contract_id, 'version', c.version, 'scope', c.scope, 'tenant_id', c.tenant_id, 'domain_id', c.domain_id,
    'dependency', jsonb_build_object('kind', c.dependency_kind, 'key', c.dependency_key),
    'available', c.available, 'unavailable', c.unavailable, 'limitations', c.limitations, 'max_duration_seconds', c.max_duration_seconds,
    'owner', jsonb_build_object('principal_id', c.owner_principal_id, 'name', (SELECT p.display_name FROM identity.principals p WHERE p.id = c.owner_principal_id)),
    'exit_evidence', c.exit_evidence, 'reason', c.reason,
    'declared_by', jsonb_build_object('principal_id', c.declared_by, 'name', (SELECT p.display_name FROM identity.principals p WHERE p.id = c.declared_by)),
    'declared_at', c.declared_at, 'first_declared_at', v_first,
    'signal', v_sig, 'mode', v_mode, 'in_force', v_mode IN ('active', 'awaiting_exit'),
    'elapsed_seconds', v_elapsed, 'overdue', coalesce(v_elapsed > c.max_duration_seconds, false),
    'last_exit', CASE WHEN v_has_exit THEN jsonb_build_object('exit_id', v_exit.exit_id, 'contract_version', v_exit.contract_version, 'evidence', v_exit.evidence, 'evidence_refs', v_exit.evidence_refs,
      'recorded_by', jsonb_build_object('principal_id', v_exit.recorded_by, 'name', (SELECT p.display_name FROM identity.principals p WHERE p.id = v_exit.recorded_by)),
      'recorded_at', v_exit.recorded_at, 'degraded_at', v_exit.degraded_at) END);
END $$;
REVOKE ALL ON FUNCTION shell.dg_evaluate(shell.degraded_contracts, timestamptz, jsonb) FROM PUBLIC;

/* The current version of each contract series of a scope. */
CREATE OR REPLACE FUNCTION shell.dg_current(p_tenant uuid, p_domain uuid) RETURNS SETOF shell.degraded_contracts
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = shell, pg_catalog, pg_temp AS $$
  SELECT DISTINCT ON (c.contract_id) c.* FROM shell.degraded_contracts c
   WHERE c.scope = 'PLATFORM' OR (p_tenant IS NOT NULL AND p_domain IS NOT NULL AND c.tenant_id = p_tenant AND c.domain_id = p_domain)
   ORDER BY c.contract_id, c.version DESC
$$;
REVOKE ALL ON FUNCTION shell.dg_current(uuid, uuid) FROM PUBLIC;

/* THE STATE AT AN INSTANT (internal — the harness evaluates the clock forward through it; the read passes the database clock). */
CREATE OR REPLACE FUNCTION shell.dg_state_at(p_tenant uuid, p_domain uuid, p_at timestamptz, p_journal jsonb, p_kind text, p_key text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = shell, pg_catalog, pg_temp AS $$
DECLARE v_contracts jsonb := '[]'::jsonb; v_undeclared jsonb := '[]'::jsonb; c shell.degraded_contracts%ROWTYPE; v_e jsonb; v_sig jsonb; r record;
        v_declared text[] := ARRAY[]::text[]; v_unavail jsonb := '[]'::jsonb; f jsonb;
BEGIN
  FOR c IN SELECT * FROM shell.dg_current(p_tenant, p_domain) x
            WHERE (p_kind IS NULL OR x.dependency_kind = p_kind) AND (p_key IS NULL OR x.dependency_key = p_key)
            ORDER BY x.scope, x.dependency_kind, x.dependency_key LOOP
    v_e := shell.dg_evaluate(c, p_at, p_journal);
    v_contracts := v_contracts || jsonb_build_array(v_e);
    v_declared := v_declared || (c.dependency_kind || ':' || c.dependency_key);
    IF (v_e ->> 'in_force')::boolean THEN
      FOR f IN SELECT * FROM jsonb_array_elements(c.unavailable) LOOP
        v_unavail := v_unavail || jsonb_build_array(f || jsonb_build_object('dependency', v_e -> 'dependency', 'contract_id', c.contract_id, 'mode', v_e ->> 'mode'));
      END LOOP;
    END IF;
  END LOOP;
  -- THE UNDECLARED: a degraded dependency with no contract is shown, never hidden (its limitations, owner and exit are UNKNOWN — said)
  IF p_kind IS NULL OR p_kind = 'audit' THEN
    IF NOT ('audit:journal' = ANY (v_declared)) THEN
      v_sig := shell.dg_signal('audit', 'journal', NULL, NULL, p_at, p_journal);
      IF v_sig ->> 'state' = 'degraded' THEN v_undeclared := v_undeclared || jsonb_build_array(jsonb_build_object('dependency', jsonb_build_object('kind', 'audit', 'key', 'journal'), 'scope', 'PLATFORM', 'signal', v_sig)); END IF;
    END IF;
  END IF;
  IF p_tenant IS NOT NULL AND p_domain IS NOT NULL THEN
    FOR r IN
      SELECT 'partition'::text AS kind, x.projection AS key FROM graph.projection_partitions x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.state = 'withdrawn'
      UNION ALL SELECT 'method', x.model_ref FROM simulation.adapter_health x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.state = 'quarantined'
      UNION ALL SELECT DISTINCT 'source', x.source_key FROM observation.source_contracts_current x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.lifecycle_state = 'active'
      UNION ALL SELECT 'agent', x.agent_id::text FROM executive.agents x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.status = 'active'
      UNION ALL SELECT 'agent', x.agent_id::text FROM observation.agents x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.status = 'active'
    LOOP
      CONTINUE WHEN (r.kind || ':' || r.key) = ANY (v_declared);
      CONTINUE WHEN p_kind IS NOT NULL AND r.kind <> p_kind;
      CONTINUE WHEN p_key IS NOT NULL AND r.key <> p_key;
      v_sig := shell.dg_signal(r.kind, r.key, p_tenant, p_domain, p_at, p_journal);
      IF v_sig ->> 'state' = 'degraded' THEN
        v_undeclared := v_undeclared || jsonb_build_array(jsonb_build_object('dependency', jsonb_build_object('kind', r.kind, 'key', r.key), 'scope', 'DOMAIN', 'signal', v_sig));
      END IF;
    END LOOP;
  END IF;
  RETURN jsonb_build_object('read_at', p_at, 'tenant_id', p_tenant, 'domain_id', p_domain,
    'contracts', v_contracts, 'undeclared', v_undeclared, 'unavailable_functions', v_unavail,
    'degraded', EXISTS (SELECT 1 FROM jsonb_array_elements(v_contracts) e WHERE (e ->> 'in_force')::boolean) OR jsonb_array_length(v_undeclared) > 0,
    'unknown', (SELECT count(*) FROM jsonb_array_elements(v_contracts) e WHERE e ->> 'mode' = 'unknown'),
    'evaluated', jsonb_build_object('rule', 'b81-dg-1', 'clock', 'database', 'journal_supplied', p_journal IS NOT NULL));
END $$;
REVOKE ALL ON FUNCTION shell.dg_state_at(uuid, uuid, timestamptz, jsonb, text, text) FROM PUBLIC;

-- §DG.4 THE READ ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* shell.degraded_state(scope): the PLATFORM contracts (any bound principal) and, for a tenant/domain, that domain's (guarded by
   observation.assert_read_scope); optionally one dependency kind / key (a corridor view asks for its source). Read-only: evaluating a
   state records nothing. */
CREATE OR REPLACE FUNCTION shell.degraded_state(p_tenant uuid, p_domain uuid, p_journal jsonb, p_kind text, p_key text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = shell, observation, pg_catalog, pg_temp AS $$
BEGIN
  IF p_tenant IS NOT NULL OR p_domain IS NOT NULL THEN
    PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the degraded state of a domain');
  ELSIF public.eye_principal() IS NULL
        AND NOT coalesce((SELECT r.rolbypassrls OR r.rolsuper FROM pg_catalog.pg_roles r WHERE r.rolname = session_user), false) THEN
    RAISE EXCEPTION 'degraded contract rejected (actor): the platform''s degraded state is read by a bound principal' USING ERRCODE = '42501';
  END IF;
  IF p_kind IS NOT NULL AND NOT (p_kind = ANY (shell.dg_kinds())) THEN
    RAISE EXCEPTION 'degraded contract rejected (kind): % is not a dependency kind (%)', p_kind, array_to_string(shell.dg_kinds(), ', ') USING ERRCODE = '22023';
  END IF;
  RETURN shell.dg_state_at(p_tenant, p_domain, clock_timestamp(), p_journal, p_kind, p_key);
END $$;
REVOKE ALL ON FUNCTION shell.degraded_state(uuid, uuid, jsonb, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION shell.degraded_state(uuid, uuid, jsonb, text, text) TO eye_app, eye_commit;

/* The version history of one contract (the declarations and exits) — the contract page's read, the same guard. */
CREATE OR REPLACE FUNCTION shell.degraded_contract_history(p_tenant uuid, p_domain uuid, p_contract_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = shell, observation, pg_catalog, pg_temp AS $$
DECLARE c shell.degraded_contracts%ROWTYPE;
BEGIN
  SELECT * INTO c FROM shell.degraded_contracts k WHERE k.contract_id = p_contract_id ORDER BY k.version DESC LIMIT 1;
  IF NOT FOUND OR (c.scope = 'DOMAIN' AND (c.tenant_id IS DISTINCT FROM p_tenant OR c.domain_id IS DISTINCT FROM p_domain)) THEN
    RAISE EXCEPTION 'degraded contract rejected (unknown_contract): no degraded contract % in this scope', coalesce(p_contract_id::text, '<null>') USING ERRCODE = '22023';
  END IF;
  IF c.scope = 'DOMAIN' THEN PERFORM observation.assert_read_scope(p_tenant, p_domain, 'a degraded contract'); END IF;
  RETURN jsonb_build_object('contract_id', c.contract_id, 'current', shell.dg_evaluate(c, clock_timestamp(), NULL),
    'versions', (SELECT coalesce(jsonb_agg(jsonb_build_object('version', k.version, 'supersedes', k.supersedes, 'declared_at', k.declared_at, 'declared_by', k.declared_by,
                   'owner_principal_id', k.owner_principal_id, 'max_duration_seconds', k.max_duration_seconds, 'unavailable', k.unavailable, 'available', k.available,
                   'limitations', k.limitations, 'exit_evidence', k.exit_evidence, 'reason', k.reason) ORDER BY k.version), '[]'::jsonb)
                 FROM shell.degraded_contracts k WHERE k.contract_id = c.contract_id),
    'exits', (SELECT coalesce(jsonb_agg(jsonb_build_object('exit_id', x.exit_id, 'contract_version', x.contract_version, 'evidence', x.evidence, 'evidence_refs', x.evidence_refs,
                'recorded_by', x.recorded_by, 'recorded_at', x.recorded_at, 'degraded_at', x.degraded_at, 'signal_state', x.signal ->> 'state') ORDER BY x.recorded_at), '[]'::jsonb)
              FROM shell.degraded_exits x WHERE x.contract_id = c.contract_id));
END $$;
REVOKE ALL ON FUNCTION shell.degraded_contract_history(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION shell.degraded_contract_history(uuid, uuid, uuid) TO eye_app, eye_commit;

-- §DG.5 DECLARE ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* Declare (version 1) or revise (the next version, superseding the one the declarer READ — p_expected_version, 0 when none) the degraded
   contract of one dependency. The operations authority (PLATFORM) for every dependency; the domain administrator for its domain's. The owner
   is a named active human holding a binding of the scope. A request id replayed by the same declarer answers the recorded version
   (`replayed`), never a second one; by another principal or for another dependency it is refused (duplicate). */
CREATE OR REPLACE FUNCTION shell.degraded_contract_declare(p_request_id uuid, p_tenant uuid, p_domain uuid, p_kind text, p_key text, p_expected_version int,
    p_available jsonb, p_unavailable jsonb, p_limitations jsonb, p_max_duration_seconds int, p_owner uuid, p_exit_evidence text, p_reason text,
    p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = shell, observation, governance, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid; v_scope text; v_prev shell.degraded_contracts%ROWTYPE; v_has_prev boolean; v_id uuid; v_version int; v_problem text; r shell.degraded_contracts%ROWTYPE;
        v_key text := btrim(coalesce(p_key, '')); v_lim jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['shell.degraded.contract.declare']);
  v_scope := shell.dg_assert_scope(p_kind, p_tenant, p_domain);
  v_actor := shell.dg_actor(p_actor);
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'degraded contract rejected (request): a declaration carries its request id (the command identity a retry reuses)' USING ERRCODE = '22023';
  END IF;
  -- THE REPLAY (PAT-20): the same request id answers what it recorded; never a second effect
  SELECT * INTO r FROM shell.degraded_contracts k WHERE k.request_id = p_request_id;
  IF FOUND THEN
    IF r.declared_by IS DISTINCT FROM v_actor OR r.dependency_kind IS DISTINCT FROM p_kind OR r.dependency_key IS DISTINCT FROM v_key
       OR r.tenant_id IS DISTINCT FROM p_tenant OR r.domain_id IS DISTINCT FROM p_domain THEN
      RAISE EXCEPTION 'degraded contract rejected (duplicate): request % already recorded another declaration; a new declaration takes a new request id', p_request_id USING ERRCODE = '23505';
    END IF;
    RETURN jsonb_build_object('contract_id', r.contract_id, 'version', r.version, 'supersedes', r.supersedes, 'declared_at', r.declared_at, 'dependency', jsonb_build_object('kind', r.dependency_kind, 'key', r.dependency_key),
      'owner_principal_id', r.owner_principal_id, 'replayed', true);
  END IF;
  -- WHO DECLARES: the operations authority (PLATFORM) for any dependency; the domain administrator for its own domain's
  IF v_scope = 'PLATFORM' THEN
    PERFORM governance.assert_approver('degraded contract', v_actor, NULL, NULL, ARRAY['operations_authority'], NULL, NULL, 'declaring a platform dependency''s degraded mode');
  ELSE
    PERFORM governance.assert_approver('degraded contract', v_actor, p_tenant, p_domain, ARRAY['operations_authority', 'domain_admin'], NULL, NULL, 'declaring a domain dependency''s degraded mode');
  END IF;
  IF v_key = '' OR length(v_key) > 200 OR v_key ~ '[[:cntrl:][:space:]]' THEN
    RAISE EXCEPTION 'degraded contract rejected (key): the dependency key is 1–200 characters without spaces (a source key, a projection, a method ref, an agent id)' USING ERRCODE = '22023';
  END IF;
  IF NOT shell.dg_key_known(p_kind, v_key, p_tenant, p_domain) THEN
    RAISE EXCEPTION 'degraded contract rejected (unknown_dependency): no % dependency % in this scope', p_kind, v_key USING ERRCODE = '22023';
  END IF;
  v_problem := coalesce(shell.dg_functions_problem(p_available, 'available'), shell.dg_functions_problem(p_unavailable, 'unavailable'));
  IF v_problem IS NOT NULL THEN RAISE EXCEPTION 'degraded contract rejected (functions): %', v_problem USING ERRCODE = '22023'; END IF;
  IF jsonb_array_length(p_available) + jsonb_array_length(p_unavailable) = 0 THEN
    RAISE EXCEPTION 'degraded contract rejected (functions): a contract states what still works and what does not (at least one function)' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_available) a JOIN jsonb_array_elements(p_unavailable) u ON a ->> 'action' = u ->> 'action') THEN
    RAISE EXCEPTION 'degraded contract rejected (functions): a function is either available or unavailable, never both' USING ERRCODE = '22023';
  END IF;
  IF p_limitations IS NULL OR jsonb_typeof(p_limitations) <> 'array' OR jsonb_array_length(p_limitations) < 1 OR jsonb_array_length(p_limitations) > 20
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_limitations) l WHERE jsonb_typeof(l) <> 'string' OR length(btrim(l #>> '{}')) < 3 OR length(l #>> '{}') > 300) THEN
    RAISE EXCEPTION 'degraded contract rejected (limitations): one to twenty limitations, each 3–300 characters, say what a person must know while it is degraded' USING ERRCODE = '22023';
  END IF;
  SELECT jsonb_agg(to_jsonb(btrim(l #>> '{}'))) INTO v_lim FROM jsonb_array_elements(p_limitations) l;
  IF p_max_duration_seconds IS NULL OR p_max_duration_seconds < 60 OR p_max_duration_seconds > 7776000 THEN
    RAISE EXCEPTION 'degraded contract rejected (max_duration): the maximum duration is 60 seconds to 90 days' USING ERRCODE = '22023';
  END IF;
  IF p_exit_evidence IS NULL OR length(btrim(p_exit_evidence)) < 8 OR length(p_exit_evidence) > 2000 THEN
    RAISE EXCEPTION 'degraded contract rejected (exit_evidence): the exit evidence says what verifies recovery, in 8 to 2000 characters' USING ERRCODE = '22023';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 OR length(p_reason) > 2000 THEN
    RAISE EXCEPTION 'degraded contract rejected (reason): a reason of 8 to 2000 characters says why the contract is declared or revised' USING ERRCODE = '22023';
  END IF;
  IF p_owner IS NULL OR onboarding.principal_kind(p_owner) IS DISTINCT FROM 'human' OR NOT shell.dg_holds_any(p_owner, p_tenant, p_domain) THEN
    RAISE EXCEPTION 'degraded contract rejected (owner): the owner % is not an active person holding a role in this scope (an agent never owns a degraded mode)', coalesce(p_owner::text, '<none>') USING ERRCODE = '22023';
  END IF;
  -- one declaration at a time per dependency series
  PERFORM pg_advisory_xact_lock(hashtextextended('shell.degraded:' || coalesce(p_tenant::text, '-') || ':' || coalesce(p_domain::text, '-') || ':' || p_kind || ':' || v_key, 0));
  SELECT * INTO v_prev FROM shell.degraded_contracts k
   WHERE k.tenant_id IS NOT DISTINCT FROM p_tenant AND k.domain_id IS NOT DISTINCT FROM p_domain AND k.dependency_kind = p_kind AND k.dependency_key = v_key
   ORDER BY k.version DESC LIMIT 1;
  v_has_prev := FOUND;
  IF coalesce(p_expected_version, -1) IS DISTINCT FROM (CASE WHEN v_has_prev THEN v_prev.version ELSE 0 END) THEN
    RAISE EXCEPTION 'degraded contract rejected (stale): the contract of % % is at version %; this declaration read %', p_kind, v_key,
      CASE WHEN v_has_prev THEN v_prev.version ELSE 0 END, coalesce(p_expected_version::text, 'no version') USING ERRCODE = '23514';
  END IF;
  v_id := CASE WHEN v_has_prev THEN v_prev.contract_id ELSE gen_random_uuid() END;
  v_version := CASE WHEN v_has_prev THEN v_prev.version + 1 ELSE 1 END;
  INSERT INTO shell.degraded_contracts (contract_id, version, scope, tenant_id, domain_id, dependency_kind, dependency_key, available, unavailable, limitations,
                                        max_duration_seconds, owner_principal_id, exit_evidence, reason, declared_by, supersedes, request_id, correlation_id)
  VALUES (v_id, v_version, v_scope, p_tenant, p_domain, p_kind, v_key, p_available, p_unavailable, v_lim, p_max_duration_seconds, p_owner, btrim(p_exit_evidence), btrim(p_reason),
          v_actor, CASE WHEN v_version > 1 THEN v_version - 1 END, p_request_id, p_correlation)
  RETURNING * INTO r;
  PERFORM shell.ledger(p_tenant, p_domain, v_actor, 'degraded_contract', v_id, v_version, 'shell.degraded.declared',
    jsonb_build_object('dependency', jsonb_build_object('kind', p_kind, 'key', v_key), 'owner_principal_id', p_owner, 'supersedes', r.supersedes,
                       'unavailable', (SELECT coalesce(jsonb_agg(u ->> 'action'), '[]'::jsonb) FROM jsonb_array_elements(p_unavailable) u), 'max_duration_seconds', p_max_duration_seconds), p_correlation);
  RETURN jsonb_build_object('contract_id', r.contract_id, 'version', r.version, 'supersedes', r.supersedes, 'declared_at', r.declared_at, 'dependency', jsonb_build_object('kind', p_kind, 'key', v_key),
    'owner_principal_id', p_owner, 'replayed', false, 'state', shell.dg_evaluate(r, clock_timestamp(), NULL));
END $$;
REVOKE ALL ON FUNCTION shell.degraded_contract_declare(uuid, uuid, uuid, text, text, int, jsonb, jsonb, jsonb, int, uuid, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION shell.degraded_contract_declare(uuid, uuid, uuid, text, text, int, jsonb, jsonb, jsonb, int, uuid, text, text, uuid, uuid) TO eye_commit;

-- §DG.6 EXIT (the verified recovery) ─────────────────────────────────────────────────────────────────────────────────────────────────────
/* The OWNER records the exit evidence of the contract version it read: refused while the live signal reads degraded (the state persists until
   verified recovery), refused when there is nothing to exit (no degradation since the last exit) or when no read evaluates the dependency;
   the signal it was verified against is kept. A replayed request id answers the recorded exit. */
CREATE OR REPLACE FUNCTION shell.degraded_exit(p_request_id uuid, p_tenant uuid, p_domain uuid, p_contract_id uuid, p_contract_version int, p_evidence text, p_evidence_refs jsonb,
    p_journal jsonb, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = shell, observation, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid; c shell.degraded_contracts%ROWTYPE; x shell.degraded_exits%ROWTYPE; v_eval jsonb; v_id uuid := gen_random_uuid(); v_refs jsonb := coalesce(p_evidence_refs, '[]'::jsonb);
BEGIN
  PERFORM observation.assert_authority(ARRAY['shell.degraded.exit']);
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'degraded contract rejected (request): an exit carries its request id (the command identity a retry reuses)' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO c FROM shell.degraded_contracts k WHERE k.contract_id = p_contract_id ORDER BY k.version DESC LIMIT 1;
  IF NOT FOUND OR (c.scope = 'DOMAIN' AND (c.tenant_id IS DISTINCT FROM p_tenant OR c.domain_id IS DISTINCT FROM p_domain)) OR (c.scope = 'PLATFORM' AND (p_tenant IS NOT NULL OR p_domain IS NOT NULL)) THEN
    RAISE EXCEPTION 'degraded contract rejected (unknown_contract): no degraded contract % in this scope', coalesce(p_contract_id::text, '<null>') USING ERRCODE = '22023';
  END IF;
  PERFORM shell.dg_assert_scope(c.dependency_kind, p_tenant, p_domain);
  v_actor := shell.dg_actor(p_actor);
  SELECT * INTO x FROM shell.degraded_exits e WHERE e.request_id = p_request_id;
  IF FOUND THEN
    IF x.recorded_by IS DISTINCT FROM v_actor OR x.contract_id IS DISTINCT FROM p_contract_id THEN
      RAISE EXCEPTION 'degraded contract rejected (duplicate): request % already recorded another exit; a new exit takes a new request id', p_request_id USING ERRCODE = '23505';
    END IF;
    RETURN jsonb_build_object('exit_id', x.exit_id, 'contract_id', x.contract_id, 'contract_version', x.contract_version, 'recorded_at', x.recorded_at, 'replayed', true);
  END IF;
  IF v_actor IS DISTINCT FROM c.owner_principal_id THEN
    RAISE EXCEPTION 'degraded contract rejected (authority): the exit evidence is recorded by the contract''s owner (%), never by another person', c.owner_principal_id USING ERRCODE = '42501';
  END IF;
  IF p_contract_version IS DISTINCT FROM c.version THEN
    RAISE EXCEPTION 'degraded contract rejected (stale): the contract is at version %; this exit read %', c.version, coalesce(p_contract_version::text, 'no version') USING ERRCODE = '23514';
  END IF;
  IF p_evidence IS NULL OR length(btrim(p_evidence)) < 8 OR length(p_evidence) > 2000 THEN
    RAISE EXCEPTION 'degraded contract rejected (evidence): the exit evidence says what verified the recovery, in 8 to 2000 characters (the contract asks: %)', c.exit_evidence USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(v_refs) <> 'array' OR jsonb_array_length(v_refs) > 20 OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_refs) e WHERE jsonb_typeof(e) <> 'string' OR length(e #>> '{}') NOT BETWEEN 1 AND 300) THEN
    RAISE EXCEPTION 'degraded contract rejected (evidence_refs): at most twenty references, each 1–300 characters' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('shell.degraded.exit:' || c.contract_id::text, 0));
  v_eval := shell.dg_evaluate(c, clock_timestamp(), p_journal);
  IF v_eval ->> 'mode' = 'active' THEN
    RAISE EXCEPTION 'degraded contract rejected (state): % % still reads DEGRADED (%); the exit is recorded only once the signal reads recovered', c.dependency_kind, c.dependency_key,
      v_eval -> 'signal' ->> 'reason' USING ERRCODE = '23514';
  END IF;
  IF v_eval ->> 'mode' = 'unknown' THEN
    RAISE EXCEPTION 'degraded contract rejected (state): no read evaluates a % dependency here, so no recovery can be verified against it', c.dependency_kind USING ERRCODE = '23514';
  END IF;
  IF v_eval ->> 'mode' = 'normal' THEN
    RAISE EXCEPTION 'degraded contract rejected (state): % % has not been degraded since %; there is nothing to exit', c.dependency_kind, c.dependency_key,
      coalesce(v_eval -> 'last_exit' ->> 'recorded_at', v_eval ->> 'first_declared_at') USING ERRCODE = '23514';
  END IF;
  INSERT INTO shell.degraded_exits (exit_id, contract_id, contract_version, scope, tenant_id, domain_id, evidence, evidence_refs, signal, degraded_at, recorded_by, request_id, correlation_id)
  VALUES (v_id, c.contract_id, c.version, c.scope, c.tenant_id, c.domain_id, btrim(p_evidence), v_refs, v_eval -> 'signal', (v_eval -> 'signal' ->> 'last_degraded_at')::timestamptz, v_actor, p_request_id, p_correlation)
  RETURNING * INTO x;
  PERFORM shell.ledger(c.tenant_id, c.domain_id, v_actor, 'degraded_contract', c.contract_id, c.version, 'shell.degraded.exited',
    jsonb_build_object('exit_id', v_id, 'dependency', jsonb_build_object('kind', c.dependency_kind, 'key', c.dependency_key), 'degraded_at', x.degraded_at, 'signal_state', v_eval -> 'signal' ->> 'state'), p_correlation);
  RETURN jsonb_build_object('exit_id', x.exit_id, 'contract_id', c.contract_id, 'contract_version', c.version, 'recorded_at', x.recorded_at, 'degraded_at', x.degraded_at, 'replayed', false,
    'state', shell.dg_evaluate(c, clock_timestamp(), p_journal));
END $$;
REVOKE ALL ON FUNCTION shell.degraded_exit(uuid, uuid, uuid, uuid, int, text, jsonb, jsonb, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION shell.degraded_exit(uuid, uuid, uuid, uuid, int, text, jsonb, jsonb, uuid, uuid) TO eye_commit;
